export const AI_ASSIST_STATUS_PATH = '/api/ai/status'
export const AI_ASSIST_DRAFT_PATH = '/api/ai/failure-modes'

export const AI_ASSIST_MODELS = {
  google: 'gemini-4-hydrogen',
  xai: 'grok-4.7',
} as const

export const AI_ASSIST_CONTEXT_OPTIONS = {
  capability: {
    generation: 'Content generation',
    retrieval: 'Retrieval or summarisation',
    classification: 'Classification or scoring',
    tool_use: 'Tool or workflow interaction',
  },
  outputUse: {
    reference: 'Internal reference',
    decision_support: 'Decision support',
    published: 'Externally shared content',
    workflow_input: 'Input to another workflow',
  },
  humanReview: {
    before_use: 'Before use',
    sampled: 'Sampled review',
    none: 'No routine review',
    unknown: 'Not specified',
  },
} as const

type ContextOptions = typeof AI_ASSIST_CONTEXT_OPTIONS
export type AiAssistContext = { [K in keyof ContextOptions]: keyof ContextOptions[K] }

// Provider output is restricted to these IDs. No provider-written text crosses into a draft.
export const AI_FAILURE_MODE_DRAFTS = {
  scope_creep: {
    title: 'Use beyond the intended scope',
    trigger_or_cause: 'Users may apply a familiar output to decisions outside its intended purpose.',
    effect_summary: 'The output may be treated as suitable where its assumptions no longer hold.',
  },
  unsupported_output: {
    title: 'Plausible but unsupported output',
    trigger_or_cause: 'Incomplete or ambiguous input may lead to a confident response.',
    effect_summary: 'A reader may rely on a claim that does not follow from the available information.',
  },
  stale_information: {
    title: 'Stale or incomplete retrieved information',
    trigger_or_cause: 'Relevant source material may be missing, out of date, or omitted by retrieval.',
    effect_summary: 'An output may represent obsolete or incomplete information as current.',
  },
  inconsistent_classification: {
    title: 'Inconsistent classification',
    trigger_or_cause: 'Ambiguous or unfamiliar cases may be assigned different categories despite similar inputs.',
    effect_summary: 'Comparable cases may receive different downstream treatment.',
  },
  weak_oversight: {
    title: 'Overreliance during human review',
    trigger_or_cause: 'A convincing output or time pressure may reduce the depth of independent review.',
    effect_summary: 'An error may remain undetected before the output is used.',
  },
  lost_context: {
    title: 'Loss of context downstream',
    trigger_or_cause: 'A summary or result may be passed on without its original limitations.',
    effect_summary: 'A downstream consumer may treat a conditional result as definitive.',
  },
  workflow_mismatch: {
    title: 'Unintended workflow input',
    trigger_or_cause: 'An ambiguous output may be interpreted differently by a downstream workflow.',
    effect_summary: 'The workflow may enter an unintended state or produce an inconsistent result.',
  },
  availability_gap: {
    title: 'Incomplete output under dependency failure',
    trigger_or_cause: 'An upstream dependency may be unavailable or return partial information.',
    effect_summary: 'A partial result may be mistaken for a complete result.',
  },
} as const

export type AiSuggestionId = keyof typeof AI_FAILURE_MODE_DRAFTS
export type AiAssistOrigin = {
  [P in keyof typeof AI_ASSIST_MODELS]: { readonly provider: P; readonly model: (typeof AI_ASSIST_MODELS)[P] }
}[keyof typeof AI_ASSIST_MODELS]
export type AiAssistResult = AiAssistOrigin & { suggestionIds: AiSuggestionId[] }
export type AcceptedAiFailureModeDraft = Readonly<{
  title: string
  trigger_or_cause: string
  effect_summary: string
  provenance: AiAssistOrigin & Readonly<{ source: 'AI_ASSISTED'; suggestionId: AiSuggestionId; acceptedAt: string }>
}>

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function isOwnKey<T extends object>(record: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.hasOwn(record, key)
}

export function isAiAssistContext(value: unknown): value is AiAssistContext {
  return hasExactKeys(value, Object.keys(AI_ASSIST_CONTEXT_OPTIONS))
    && isOwnKey(AI_ASSIST_CONTEXT_OPTIONS.capability, value.capability)
    && isOwnKey(AI_ASSIST_CONTEXT_OPTIONS.outputUse, value.outputUse)
    && isOwnKey(AI_ASSIST_CONTEXT_OPTIONS.humanReview, value.humanReview)
}

export function isAiAssistRequest(value: unknown): value is { consent: true; context: AiAssistContext } {
  return hasExactKeys(value, ['consent', 'context']) && value.consent === true && isAiAssistContext(value.context)
}

function isSuggestionList(value: unknown): value is AiSuggestionId[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 3
    && value.every((id) => isOwnKey(AI_FAILURE_MODE_DRAFTS, id)) && new Set(value).size === value.length
}

export function parseAiSuggestionIds(value: unknown): AiSuggestionId[] | null {
  return hasExactKeys(value, ['suggestionIds']) && isSuggestionList(value.suggestionIds) ? value.suggestionIds : null
}

export function isAiAssistResult(value: unknown): value is AiAssistResult {
  return hasExactKeys(value, ['provider', 'model', 'suggestionIds'])
    && isOwnKey(AI_ASSIST_MODELS, value.provider) && value.model === AI_ASSIST_MODELS[value.provider]
    && isSuggestionList(value.suggestionIds)
}
