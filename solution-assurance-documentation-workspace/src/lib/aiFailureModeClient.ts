import {
  AI_ASSIST_DRAFT_PATH, AI_ASSIST_STATUS_PATH, isAiAssistResult,
  type AiAssistContext, type AiAssistResult,
} from './aiFailureModeAssist'

export async function getAiAssistAvailability(signal?: AbortSignal): Promise<boolean> {
  try {
    const deadline = AbortSignal.timeout(4000)
    const response = await fetch(AI_ASSIST_STATUS_PATH, {
      mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    })
    return response.ok && (await response.json())?.enabled === true
  } catch {
    return false
  }
}

export async function requestAiFailureModeDrafts(
  context: AiAssistContext, accessToken: string, signal: AbortSignal,
): Promise<AiAssistResult | null> {
  try {
    const response = await fetch(AI_ASSIST_DRAFT_PATH, {
      method: 'POST', mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ consent: true, context }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(16_000)]),
    })
    if (!response.ok) return null
    const result: unknown = await response.json()
    return isAiAssistResult(result) ? result : null
  } catch {
    return null
  }
}
