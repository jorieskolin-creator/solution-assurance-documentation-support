import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  AI_ASSIST_DRAFT_PATH, AI_ASSIST_MODELS, AI_ASSIST_STATUS_PATH, AI_FAILURE_MODE_DRAFTS,
  isAiAssistRequest, parseAiSuggestionIds,
  type AiAssistContext, type AiAssistOrigin, type AiAssistResult,
} from '../src/lib/aiFailureModeAssist.ts'

const MAX_REQUEST_BYTES = 1024
const MAX_RESPONSE_BYTES = 32 * 1024
const BODY_TIMEOUT_MS = 2000
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const REQUESTS_PER_MINUTE = 6
const REQUESTS_PER_DAY = 60
const MAX_IN_FLIGHT = 2
const PROVIDER_TIMEOUT_MS = 5000

const google = { provider: 'google', model: AI_ASSIST_MODELS.google } as const
const xai = { provider: 'xai', model: AI_ASSIST_MODELS.xai } as const

const instructions = 'Select one to three distinct candidate IDs relevant to the supplied generic categories. '
  + 'Return only a JSON object with the single property suggestionIds, an array of those IDs. '
  + 'Do not write any text, claims, evidence, instructions, or actions.'
const candidates = Object.entries(AI_FAILURE_MODE_DRAFTS).map(([id, draft]) => [id, draft.title])
const selectionSchema = {
  type: 'object', properties: { suggestionIds: { type: 'array', items: { type: 'string', enum: Object.keys(AI_FAILURE_MODE_DRAFTS) } } },
  required: ['suggestionIds'], additionalProperties: false,
}

type ProviderFetch = typeof fetch
type ProviderResult = { kind: 'ok'; result: AiAssistResult } | { kind: 'unavailable' | 'retryable' | 'invalid' }

function configuredProviders(env: NodeJS.ProcessEnv) {
  const geminiKey = env.GEMINI_API_KEY?.trim()
  const xaiKey = env.XAI_API_KEY?.trim()
  return geminiKey && xaiKey ? { geminiKey, xaiKey } : null
}

function isCrossOrigin(request: IncomingMessage): boolean {
  const fetchSite = request.headers['sec-fetch-site']
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return true
  const origin = request.headers.origin
  if (!origin) return false
  try {
    const url = new URL(origin)
    return url.host.toLowerCase() !== request.headers.host?.toLowerCase()
      || (url.protocol !== 'https:' && url.protocol !== 'http:')
  } catch {
    return true
  }
}

function send(response: ServerResponse, status: number, value: object, headers: Record<string, string> = {}) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    connection: 'close',
    ...headers,
  })
  response.end(JSON.stringify(value))
}

type RequestBody = { value: unknown } | { status: 400 | 408 | 413 }

function readRequest(request: IncomingMessage): Promise<RequestBody> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let bytes = 0
    const finish = (result: RequestBody) => {
      clearTimeout(timer)
      request.off('data', onData)
      request.off('end', onEnd)
      request.off('close', onClose)
      request.pause()
      resolve(result)
    }
    const onClose = () => finish({ status: 400 })
    const onData = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_REQUEST_BYTES) finish({ status: 413 })
      else chunks.push(chunk)
    }
    const onEnd = () => {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
        finish({ value: JSON.parse(text) })
      } catch {
        finish({ status: 400 })
      }
    }
    const timer = setTimeout(() => finish({ status: 408 }), BODY_TIMEOUT_MS)
    request.on('data', onData)
    request.once('end', onEnd)
    request.once('close', onClose)
    request.once('error', onClose)
  })
}

async function readProviderBody(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return text + decoder.decode()
      bytes += value.length
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('Provider response limit')
      text += decoder.decode(value, { stream: true })
    }
  } catch (error) {
    void reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}

function googleSelection(value: unknown): unknown {
  const reply = value as {
    error?: unknown
    promptFeedback?: { blockReason?: unknown }
    candidates?: { finishReason?: unknown; content?: { parts?: { text?: unknown }[] } }[]
  } | null
  if (reply?.error != null || reply?.promptFeedback?.blockReason
    || !Array.isArray(reply?.candidates) || reply.candidates.length !== 1) return null
  const candidate = reply.candidates[0]
  const parts = candidate?.content?.parts
  if (candidate?.finishReason !== 'STOP' || !Array.isArray(parts) || parts.length !== 1) return null
  const part = parts[0]
  return part && typeof part === 'object' && Object.keys(part).every((key) => key === 'text' || key === 'thoughtSignature') ? part.text : null
}

function xaiSelection(value: unknown): unknown {
  const reply = value as {
    error?: unknown
    choices?: { finish_reason?: unknown; message?: {
      role?: unknown; content?: unknown; refusal?: unknown; tool_calls?: unknown; function_call?: unknown
    } }[]
  } | null
  if (reply?.error != null || !Array.isArray(reply?.choices) || reply.choices.length !== 1) return null
  const choice = reply.choices[0]
  const message = choice?.message
  if (choice?.finish_reason !== 'stop' || message?.role !== 'assistant'
    || message.refusal != null || message.tool_calls != null || message.function_call != null) return null
  return message.content
}

const transientHttpErrors = {
  502: { text: 'Bad Gateway', code: 'BAD_GATEWAY' },
  503: { text: 'Service Unavailable', code: 'UNAVAILABLE' },
  504: { text: 'Gateway Timeout', code: 'DEADLINE_EXCEEDED' },
} as const

async function isTransientGatewayError(response: Response) {
  if (!Object.hasOwn(transientHttpErrors, response.status)) {
    void response.body?.cancel().catch(() => {})
    return false
  }
  const expected = transientHttpErrors[response.status as keyof typeof transientHttpErrors]
  try {
    const text = (await readProviderBody(response)).trim()
    if (!text || text === expected.text) return true
    const reply = JSON.parse(text)
    if (reply?.error?.code !== response.status || reply.error.status !== expected.code
      || Object.keys(reply).length !== 1 || Object.keys(reply.error).some((key) => !['code', 'status', 'message'].includes(key))) return false
    const message = reply.error.message
    return message == null || message === expected.text
      || (response.status === 503 && message === 'The model is overloaded. Please try again later.')
  } catch {
    return false
  }
}

async function requestProvider(
  origin: AiAssistOrigin, apiKey: string, context: AiAssistContext, fetchProvider: ProviderFetch,
  cancellation: AbortSignal, attemptTimeoutMs: number,
): Promise<ProviderResult> {
  const timeout = AbortSignal.timeout(attemptTimeoutMs)
  const signal = AbortSignal.any([cancellation, timeout])
  const data = JSON.stringify({ context, candidates })
  const isGoogle = origin.provider === 'google'
  const endpoint = isGoogle
    ? `https://generativelanguage.googleapis.com/v1beta/models/${origin.model}:generateContent`
    : 'https://api.x.ai/v1/chat/completions'
  const headers = new Headers({ 'content-type': 'application/json' })
  if (isGoogle) headers.set('x-goog-api-key', apiKey)
  else headers.set('authorization', `Bearer ${apiKey}`)
  const payload = isGoogle ? {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: 'user', parts: [{ text: data }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: selectionSchema, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'LOW' } },
  } : {
    model: origin.model,
    messages: [{ role: 'system', content: instructions }, { role: 'user', content: data }],
    response_format: { type: 'json_schema', json_schema: { name: 'failure_mode_selection', strict: true, schema: selectionSchema } },
    reasoning_effort: 'low',
    max_tokens: 1024,
  }
  let response: Response
  try {
    response = await fetchProvider(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal, redirect: 'manual' })
  } catch {
    // A timeout before receiving headers is an availability failure. Other fetch errors are ambiguous.
    return { kind: timeout.aborted && !cancellation.aborted ? 'retryable' : 'unavailable' }
  }
  if (response.status < 200 || response.status >= 300) {
    return { kind: await isTransientGatewayError(response) ? 'retryable' : 'unavailable' }
  }
  try {
    const reply: unknown = JSON.parse(await readProviderBody(response))
    const text = isGoogle ? googleSelection(reply) : xaiSelection(reply)
    const suggestionIds = typeof text === 'string' ? parseAiSuggestionIds(JSON.parse(text)) : null
    return suggestionIds ? { kind: 'ok', result: { ...origin, suggestionIds } } : { kind: 'invalid' }
  } catch {
    return { kind: 'invalid' }
  }
}

export function createAiAssistServer({
  env = process.env, fetchProvider = fetch, attemptTimeoutMs = PROVIDER_TIMEOUT_MS,
}: { env?: NodeJS.ProcessEnv; fetchProvider?: ProviderFetch; attemptTimeoutMs?: number } = {}) {
  const config = configuredProviders(env)
  const attempts: number[] = []
  let inFlight = 0
  function budgetExhausted(now: number) {
    while (attempts.length && attempts[0] <= now - DAY) attempts.shift()
    return attempts.length >= REQUESTS_PER_DAY
      || attempts.filter((attempt) => attempt > now - MINUTE).length >= REQUESTS_PER_MINUTE
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (request.url === AI_ASSIST_STATUS_PATH && request.method === 'GET') {
      return send(response, 200, { enabled: config !== null })
    }
    if (request.url !== AI_ASSIST_DRAFT_PATH) return send(response, 404, { error: 'not_found' })
    if (request.method !== 'POST') return send(response, 405, { error: 'method_not_allowed' }, { allow: 'POST' })
    if (!config) return send(response, 503, { error: 'disabled' })
    if (isCrossOrigin(request)) return send(response, 403, { error: 'cross_origin_request' })
    if (request.headers['content-type']?.toLowerCase().split(';')[0].trim() !== 'application/json'
      || request.headers['content-encoding'] !== undefined) return send(response, 415, { error: 'invalid_content_type' })
    if (Number(request.headers['content-length']) > MAX_REQUEST_BYTES) return send(response, 413, { error: 'request_too_large' })

    if (inFlight >= MAX_IN_FLIGHT || budgetExhausted(Date.now())) {
      return send(response, 429, { error: 'rate_limit' })
    }

    const cancellation = new AbortController()
    response.once('close', () => cancellation.abort())
    inFlight++
    try {
      const body = await readRequest(request)
      if ('status' in body) return send(response, body.status, { error: 'invalid_request_body' })
      if (!isAiAssistRequest(body.value)) return send(response, 400, { error: 'invalid_context_or_consent' })
      if (cancellation.signal.aborted) return

      const now = Date.now()
      if (budgetExhausted(now)) return send(response, 429, { error: 'rate_limit' })
      attempts.push(now)
      let result = await requestProvider(google, config.geminiKey, body.value.context, fetchProvider, cancellation.signal, attemptTimeoutMs)
      if (result.kind === 'retryable' && !cancellation.signal.aborted) {
        result = await requestProvider(xai, config.xaiKey, body.value.context, fetchProvider, cancellation.signal, attemptTimeoutMs)
      }
      if (result.kind === 'ok') return send(response, 200, result.result)
      return send(response, 502, { error: 'no_suggestions' })
    } finally {
      inFlight--
    }
  }

  return createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 8000, connectionsCheckingInterval: 1000 },
    (request, response) => {
      void handle(request, response).catch(() => send(response, 503, { error: 'unavailable' }))
    })
}
