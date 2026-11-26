// @vitest-environment node
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAiAssistServer } from '../server/aiAssist'
import { AI_ASSIST_DRAFT_PATH, AI_ASSIST_STATUS_PATH } from '../src/lib/aiFailureModeAssist'

const env = { GEMINI_API_KEY: 'fixture-google', XAI_API_KEY: 'fixture-xai' }
const context = { capability: 'retrieval', outputUse: 'decision_support', humanReview: 'sampled' }
const validBody = { consent: true, context }
const ids = ['stale_information', 'weak_oversight']
const servers: ReturnType<typeof createAiAssistServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections()
  })))
})

async function start(options: NonNullable<Parameters<typeof createAiAssistServer>[0]>) {
  const server = createAiAssistServer(options)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function post(base: string, body: unknown = validBody, headers: Record<string, string> = {}) {
  return fetch(base + AI_ASSIST_DRAFT_PATH, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const geminiText = (text: string, finishReason = 'STOP') => Response.json({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
})
const geminiGood = () => geminiText(JSON.stringify({ suggestionIds: ids }))
const grokReply = (refusal: string | null = null) => Response.json({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', refusal, content: JSON.stringify({ suggestionIds: ids }) } }],
})

describe('AI failure-mode service', () => {
  it.each([{}, { GEMINI_API_KEY: env.GEMINI_API_KEY }, { XAI_API_KEY: env.XAI_API_KEY },
    { ...env, GEMINI_API_KEY: '   ' }, { ...env, XAI_API_KEY: '' },
  ])('fails closed when provider keys are missing or blank', async (configuration) => {
    const provider = vi.fn<typeof fetch>()
    const base = await start({ env: configuration, fetchProvider: provider })
    const status = await fetch(base + AI_ASSIST_STATUS_PATH)
    expect(await status.json()).toEqual({ enabled: false })
    expect(status.headers.get('cache-control')).toBe('no-store')
    expect((await post(base)).status).toBe(503)
    expect(provider).not.toHaveBeenCalled()
  })

  it('rejects cross-origin, oversized and non-consenting or non-typed requests before provider use', async () => {
    const provider = vi.fn<typeof fetch>()
    const base = await start({ env, fetchProvider: provider })
    expect(await (await fetch(base + AI_ASSIST_STATUS_PATH)).json()).toEqual({ enabled: true })
    expect((await post(base, validBody, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post(base, validBody, { origin: 'https://unrelated.example' })).status).toBe(403)
    expect((await fetch(base + AI_ASSIST_DRAFT_PATH, { method: 'POST' })).status).toBe(415)
    expect((await post(base, { ...validBody, consent: false })).status).toBe(400)
    expect((await post(base, { ...validBody, context: { ...context, record: 'not permitted' } })).status).toBe(400)
    expect((await post(base, { ...validBody, context: { ...context, capability: 'custom' } })).status).toBe(400)
    expect((await post(base, { ...validBody, unexpected: 'x'.repeat(1024) })).status).toBe(413)
    const chunkedStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(base + AI_ASSIST_DRAFT_PATH, {
        method: 'POST', headers: { 'content-type': 'application/json' },
      }, (response) => {
        response.resume()
        resolve(response.statusCode)
      })
      req.once('error', reject)
      req.write('x'.repeat(1025))
      req.end()
    })
    expect(chunkedStatus).toBe(413)
    expect(provider).not.toHaveBeenCalled()
  })

  it('enables both providers by default and calls Gemini only on a consenting request, without browser credentials', async () => {
    const provider = vi.fn<typeof fetch>().mockImplementation(async () => geminiGood())
    const base = await start({ env, fetchProvider: provider })
    expect(await (await fetch(base + AI_ASSIST_STATUS_PATH)).json()).toEqual({ enabled: true })
    expect(provider).not.toHaveBeenCalled()
    expect(await (await post(base, validBody, { origin: base, 'sec-fetch-site': 'same-origin' })).json()).toEqual({ provider: 'google', model: 'gemini-4-hydrogen', suggestionIds: ids })
    expect(provider).toHaveBeenCalledTimes(1)
    const [url, init] = provider.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent')
    const headers = new Headers(init?.headers)
    expect(headers.get('x-goog-api-key')).toBe(env.GEMINI_API_KEY)
    expect(headers.get('authorization')).toBeNull()
    const payload = JSON.parse(String(init?.body))
    expect(JSON.parse(payload.contents[0].parts[0].text).context).toEqual(context)
    expect(init?.redirect).toBe('manual')
  })

  it('sends the same minimal context to Grok only after a recognized temporary error', async () => {
    const provider = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { code: 503, status: 'UNAVAILABLE' } }, { status: 503 }))
      .mockResolvedValueOnce(grokReply())
    const base = await start({ env, fetchProvider: provider })
    expect(await (await post(base)).json()).toEqual({ provider: 'xai', model: 'grok-4.7', suggestionIds: ids })
    expect(provider).toHaveBeenCalledTimes(2)
    const [url, init] = provider.mock.calls[1]
    expect(url).toBe('https://api.x.ai/v1/chat/completions')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${env.XAI_API_KEY}`)
    expect(headers.get('x-goog-api-key')).toBeNull()
    const payload = JSON.parse(String(init?.body))
    expect(payload.model).toBe('grok-4.7')
    expect(JSON.parse(payload.messages[1].content).context).toEqual(context)
  })

  it('uses the bounded fallback on a primary header timeout', async () => {
    const provider = vi.fn<typeof fetch>().mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('mock aborted')), { once: true })
    })).mockResolvedValueOnce(grokReply())
    const base = await start({ env, fetchProvider: provider, attemptTimeoutMs: 20 })
    expect(await (await post(base)).json()).toMatchObject({ provider: 'xai' })
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['permission denial', () => new Response(null, { status: 403 })],
    ['temporary status carrying a content block', () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }, { status: 503 })],
    ['temporary status carrying an ambiguous error', () => Response.json({ error: { code: 503, status: 'UNAVAILABLE', message: 'Permission denied' } }, { status: 503 })],
    ['content refusal', () => geminiText(JSON.stringify({ suggestionIds: ids }), 'SAFETY')],
    ['unknown ID', () => geminiText('{"suggestionIds":["fabricated_draft"]}')],
    ['evidence/action fields', () => geminiText('{"suggestionIds":["stale_information"],"evidence_status":"PASS","command":"example"}')],
    ['oversized output', () => geminiText('x'.repeat(32 * 1024))],
  ])('does not fall back or return raw output after %s', async (_scenario, makeReply) => {
    const provider = vi.fn<typeof fetch>().mockResolvedValueOnce(makeReply())
    const base = await start({ env, fetchProvider: provider })
    const response = await post(base)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'no_suggestions' })
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('discards a fallback response with a content refusal even if it contains allowed IDs', async () => {
    const provider = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(grokReply('refused'))
    const base = await start({ env, fetchProvider: provider })
    expect((await post(base)).status).toBe(502)
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('bounds concurrent work without starting another paid request', async () => {
    let release = () => {}
    const wait = new Promise<void>((resolve) => { release = resolve })
    const provider = vi.fn<typeof fetch>().mockImplementation(async () => {
      await wait
      return geminiGood()
    })
    const base = await start({ env, fetchProvider: provider })
    const inFlight = Promise.all([post(base), post(base)])
    try {
      await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(2))
      expect((await post(base)).status).toBe(429)
    } finally {
      release()
      await inFlight
    }
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('limits suggestion requests across all callers in the process', async () => {
    const provider = vi.fn<typeof fetch>().mockImplementation(async () => geminiGood())
    const base = await start({ env, fetchProvider: provider })
    for (let i = 0; i < 6; i++) expect((await post(base)).status).toBe(200)
    expect((await post(base)).status).toBe(429)
    expect(provider).toHaveBeenCalledTimes(6)
  })

  it('preserves the daily cap across minute windows', async () => {
    const provider = vi.fn<typeof fetch>().mockImplementation(async () => geminiGood())
    const base = await start({ env, fetchProvider: provider })
    const now = Date.now()
    try {
      for (let minute = 0; minute < 10; minute++) {
        vi.setSystemTime(now + minute * 60_000)
        for (let count = 0; count < 6; count++) expect((await post(base)).status).toBe(200)
      }
      vi.setSystemTime(now + 10 * 60_000)
      expect((await post(base)).status).toBe(429)
      expect(provider).toHaveBeenCalledTimes(60)
      vi.setSystemTime(now + 24 * 60 * 60_000)
      expect((await post(base)).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })
})
