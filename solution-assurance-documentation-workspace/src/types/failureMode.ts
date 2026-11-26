import { z } from 'zod'
import { AI_ASSIST_MODELS, AI_FAILURE_MODE_DRAFTS, type AcceptedAiFailureModeDraft } from '../lib/aiFailureModeAssist'

export const FAILURE_MODE_REGISTER_SCHEMA_VERSION = 'failure-mode-register/1.0.0' as const

export const ARCHETYPE_IDS = [
  'FM-01',
  'FM-02',
  'FM-03',
  'FM-04',
  'FM-05',
  'FM-06',
  'FM-07',
  'FM-08',
  'FM-09',
  'FM-10',
  'FM-11',
  'FM-12',
  'FM-13',
  'FM-14',
  'FM-15',
] as const

export type ArchetypeId = (typeof ARCHETYPE_IDS)[number]
export type FailureModeId = ArchetypeId | `FM-CUSTOM-${string}`
export type FailureModeSource = 'USER_DECLARED' | 'DOCUMENT_EXTRACTED'
export type SeverityUser = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'
export type OccurrenceInherent = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
export type DetectabilityInherent = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
export type MitigationType = 'PREVENTIVE' | 'DETECTIVE' | 'PROCEDURAL_OR_PROMPT_ONLY' | 'UNKNOWN'
export type ObservedEvidenceStatus =
  | 'DECLARED_IN_DOC'
  | 'OBSERVED_IN_CONFIG'
  | 'TEST_EVIDENCE_LINKED'
  | 'NOT_RUN'
  | 'MISSING_UNKNOWN'
export type ProvenanceBasis = 'DOCUMENT_DECLARATION' | 'MANUAL_USER_DECLARATION'

export type ControlObjectId = `${'AP-' | ''}${'A' | 'B' | 'C' | 'D' | 'E' | 'F'}${'1' | '2' | '3' | '4' | '5'}`

export interface ClaimedMitigation {
  control: string
  type: MitigationType
  code_ref?: string | null
  evidence_ref?: string | null
  evidence_status_observed: ObservedEvidenceStatus
}

export interface FailureModeProvenance {
  basis: ProvenanceBasis
  source_unit_ids: string[]
  limitations: string[]
  file_path?: string | null
  snapshot_hash?: string | null
  excerpt?: string | null
  ai_assistance?: AcceptedAiFailureModeDraft['provenance']
}

export interface FailureModeEntry {
  id: string
  archetype_id: ArchetypeId | null
  source: FailureModeSource
  title: string
  trigger_or_cause: string
  effect_summary: string
  severity_user: SeverityUser
  occurrence_inherent: OccurrenceInherent
  detectability_inherent: DetectabilityInherent
  mapped_objects: ControlObjectId[]
  claimed_mitigations: ClaimedMitigation[]
  provenance: FailureModeProvenance
}

export interface FailureModeValidationSummary {
  total_entries: number
  archetype_entries: number
  custom_entries: number
  open_warnings: string[]
  blockers?: string[]
}

export interface FailureModeRegisterPayload {
  schema_version: typeof FAILURE_MODE_REGISTER_SCHEMA_VERSION
  entries: FailureModeEntry[]
  validation_summary?: FailureModeValidationSummary
}

export const FAILURE_MODE_ID_REGEX = /^(FM-(0[1-9]|1[0-5])|FM-CUSTOM-[0-9]{2,3})$/
export const ARCHETYPE_ID_REGEX = /^FM-(0[1-9]|1[0-5])$/
export const CONTROL_OBJECT_ID_REGEX = /^(AP-)?[A-F][1-5]$/

export const archetypeIdSchema = z.enum(ARCHETYPE_IDS)

export const failureModeIdSchema = z.string().regex(FAILURE_MODE_ID_REGEX, {
  message: 'ID must match FM-01..FM-15 or FM-CUSTOM-01..FM-CUSTOM-999',
})

export const controlObjectIdSchema = z
  .string()
  .regex(CONTROL_OBJECT_ID_REGEX, {
    message: 'Mapped object must be a Solution Assurance control ID (A1..F5 or AP-A1..AP-F5)',
  }) as z.ZodType<ControlObjectId>

export const claimedMitigationSchema = z
  .object({
    control: z.string(),
    type: z.enum(['PREVENTIVE', 'DETECTIVE', 'PROCEDURAL_OR_PROMPT_ONLY', 'UNKNOWN']),
    code_ref: z.string().nullable().optional(),
    evidence_ref: z.string().nullable().optional(),
    evidence_status_observed: z.enum([
      'DECLARED_IN_DOC',
      'OBSERVED_IN_CONFIG',
      'TEST_EVIDENCE_LINKED',
      'NOT_RUN',
      'MISSING_UNKNOWN',
    ]),
  })
  .strict()

export const failureModeProvenanceSchema = z
  .object({
    basis: z.enum(['DOCUMENT_DECLARATION', 'MANUAL_USER_DECLARATION']),
    source_unit_ids: z.array(z.string()),
    limitations: z.array(z.string()),
    file_path: z.string().nullable().optional(),
    snapshot_hash: z.string().nullable().optional(),
    excerpt: z.string().nullable().optional(),
    ai_assistance: z.discriminatedUnion('provider', [
      z.strictObject({ source: z.literal('AI_ASSISTED'), provider: z.literal('google'), model: z.literal(AI_ASSIST_MODELS.google), suggestionId: z.enum(Object.keys(AI_FAILURE_MODE_DRAFTS) as [keyof typeof AI_FAILURE_MODE_DRAFTS, ...(keyof typeof AI_FAILURE_MODE_DRAFTS)[]]), acceptedAt: z.iso.datetime() }),
      z.strictObject({ source: z.literal('AI_ASSISTED'), provider: z.literal('xai'), model: z.literal(AI_ASSIST_MODELS.xai), suggestionId: z.enum(Object.keys(AI_FAILURE_MODE_DRAFTS) as [keyof typeof AI_FAILURE_MODE_DRAFTS, ...(keyof typeof AI_FAILURE_MODE_DRAFTS)[]]), acceptedAt: z.iso.datetime() }),
    ]).optional(),
  })
  .strict()

export const failureModeEntrySchema = z
  .object({
    id: failureModeIdSchema,
    archetype_id: archetypeIdSchema.nullable(),
    source: z.enum(['USER_DECLARED', 'DOCUMENT_EXTRACTED']),
    title: z.string(),
    trigger_or_cause: z.string(),
    effect_summary: z.string(),
    severity_user: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']),
    occurrence_inherent: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
    detectability_inherent: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']),
    mapped_objects: z.array(controlObjectIdSchema),
    claimed_mitigations: z.array(claimedMitigationSchema),
    provenance: failureModeProvenanceSchema,
  })
  .strict()

export const failureModeRegisterSchema = z
  .object({
    schema_version: z.literal(FAILURE_MODE_REGISTER_SCHEMA_VERSION),
    entries: z.array(failureModeEntrySchema),
    validation_summary: z
      .object({
        total_entries: z.number().int().min(0),
        archetype_entries: z.number().int().min(0),
        custom_entries: z.number().int().min(0),
        open_warnings: z.array(z.string()),
        blockers: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export function nextCustomFailureModeId(entries: readonly Pick<FailureModeEntry, 'id'>[]): string | null {
  const used = new Set(entries.flatMap((entry) => typeof entry?.id === 'string' ? [Number(/^FM-CUSTOM-(\d+)$/.exec(entry.id)?.[1])] : []))
  for (let n = 1; n <= 999; n += 1) {
    if (!used.has(n)) return `FM-CUSTOM-${String(n).padStart(2, '0')}`
  }
  return null
}
