import { documentationFields } from '../data/sections'
import type { Assessment } from '../types/assessment'
import {
  FAILURE_MODE_REGISTER_SCHEMA_VERSION,
  failureModeEntrySchema,
  type FailureModeEntry,
  type FailureModeProvenance,
} from '../types/failureMode'
import { canonicalizeJson } from './canonicalJson'
import {
  createExportTextSanitizer,
  exportGeneralReference,
  exportRepoReference,
  exportSnapshotHash,
  exportSourceUnitId,
  MAX_EXPORT_TEXT_LENGTH,
} from './exportSanitization'
import { isUnexecutedEvidence, type RepositorySnapshotManifest } from './failureModeMarkdown'
import { validateFailureModeRegister, type FailureModeFinding, type FailureModeValidationResult } from './failureModeValidation'

export const DOC_SUPPORT_HANDOFF_SCHEMA_VERSION = 'doc-support-handoff/1.0.0' as const
export const HANDOFF_SCRIPT_ID = 'doc-support-handoff'
export const DOCUMENTATION_BOUNDARY = 'This record documents information available at the time of completion. It is not an approval, legal conclusion, risk acceptance, gate decision or assurance finding.'

type ExportedFailureMode = Omit<FailureModeEntry, 'provenance'> & { provenance: Omit<FailureModeProvenance, 'excerpt'> }

export interface PreparedSummary {
  record: Omit<Assessment, 'failureModes'> & { failureModes: ExportedFailureMode[] }
  validation: FailureModeValidationResult
}

function* redactionFragments(record: Assessment): Iterable<string> {
  // Explicit source excerpts take priority over incidental unsafe references.
  for (const row of record.failureModes ?? []) {
    if (typeof row?.provenance?.excerpt === 'string') yield row.provenance.excerpt
  }
  for (const row of record.failureModes ?? []) {
    const path = row?.provenance?.file_path
    if (typeof path === 'string' && !exportRepoReference(path)) yield path
    if (!Array.isArray(row?.claimed_mitigations)) continue
    for (const mitigation of row.claimed_mitigations) {
      for (const ref of [mitigation?.code_ref, mitigation?.evidence_ref]) {
        if (typeof ref === 'string' && !exportRepoReference(ref)) yield ref
      }
    }
  }
  for (const ref of [record.answers.saidotReference, record.answers.engineReference, record.failureModeImport?.filePath]) {
    if (typeof ref === 'string' && !exportGeneralReference(ref)) yield ref
  }
  for (const item of record.evidence) {
    if (typeof item.reference === 'string' && !exportGeneralReference(item.reference)) yield item.reference
  }
}

function evidenceIds(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_EXPORT_TEXT_LENGTH) return ''
  return [...new Set(value.toUpperCase().split(/[\s,;]+/).filter((token) => /^E-[0-9]{3,12}$/.test(token)))].join(', ')
}

function isoDate(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) ? value : ''
}

function versionNumber(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

const parserLimitations: readonly [RegExp, string][] = [
  [/^(?:Null byte|External or URI scheme|Absolute path|Path traversal) rejected/i, 'An unsafe repository reference was omitted.'],
  [/^Evidence reference not found in snapshot:/i, 'Evidence reference not found in snapshot.'],
  [/^Code reference not found in snapshot:/i, 'Code reference not found in snapshot.'],
  [/^Unrecognized (?:severity|occurrence|detectability) /i, 'An unrecognized level was recorded as UNKNOWN.'],
  [/^Mitigation "/i, 'A mitigation without a recognized type was recorded as UNKNOWN.'],
]

function importNotices(notices: unknown): string[] {
  if (!Array.isArray(notices)) return []
  const codes = notices.flatMap((notice) => {
    if (typeof notice !== 'string') return []
    if (/^FAILURE_MODE_REGISTER_(?:NOT_FOUND|EMPTY_TABLE|INVALID_TABLE)$/.test(notice)) return [notice]
    if (notice.startsWith('Skipped row at line ')) return ['FAILURE_MODE_ROW_SKIPPED']
    return []
  })
  return [...new Set(codes)]
}

function invalidRowFinding(index: number): FailureModeFinding {
  return {
    id: `fm-schema-row-${index + 1}`,
    code: 'FM_SCHEMA_INVALID',
    severity: 'blocker',
    kind: 'COMPILATION_BLOCKER',
    title: `Row ${index + 1} fails contract schema`,
    message: 'The row cannot be represented in the handoff and is not shown in this summary.',
    permittedNextAction: 'Correct the invalid fields before exporting a machine handoff.',
    target: { step: 'impact', fieldId: 'failureModes' },
  }
}

/** One sanitized snapshot for screen/print, standalone HTML and the machine payload. */
export function prepareSummaryExport(record: Assessment, manifest?: RepositorySnapshotManifest): PreparedSummary {
  const text = createExportTextSanitizer(redactionFragments(record))
  const answers: Assessment['answers'] = {}
  const evidenceRefs: Assessment['evidenceRefs'] = {}
  const notApplicable: Assessment['notApplicable'] = {}
  for (const { id } of documentationFields) {
    if (Object.hasOwn(record.answers, id)) {
      answers[id] = id === 'saidotReference' || id === 'engineReference'
        ? exportGeneralReference(record.answers[id]) : text(record.answers[id])
    }
    const refs = evidenceIds(record.evidenceRefs[id])
    if (refs) evidenceRefs[id] = refs
    const na = record.notApplicable[id]
    if (na) notApplicable[id] = { rationale: text(na.rationale), owner: text(na.owner) }
  }

  const invalidRows: FailureModeFinding[] = []
  const failureModes: ExportedFailureMode[] = []
  const validationEntries: FailureModeEntry[] = []
  const validationFiles: RepositorySnapshotManifest['files'] = Object.create(null)
  function snapshotFile(ref: string | null) {
    if (!manifest || !ref || !Object.hasOwn(manifest.files, ref) || !manifest.files[ref]) return
    // The validator only needs presence here: source content is neither retained nor forwarded.
    validationFiles[ref] = {}
    return manifest.files[ref]
  }
  for (const [index, row] of (record.failureModes ?? []).entries()) {
    const parsed = failureModeEntrySchema.safeParse(row)
    if (!parsed.success) {
      invalidRows.push(invalidRowFinding(index))
      continue
    }
    const entry = parsed.data
    const invalidRefs: { code: boolean; evidence: boolean }[] = []
    const claimedMitigations = entry.claimed_mitigations.map((mitigation) => {
      const code = exportRepoReference(mitigation.code_ref)
      const evidence = exportRepoReference(mitigation.evidence_ref)
      const unsafeCode = Boolean(mitigation.code_ref?.trim() && !code)
      const unsafeEvidence = Boolean(mitigation.evidence_ref?.trim() && !evidence)
      invalidRefs.push({ code: unsafeCode, evidence: unsafeEvidence })
      snapshotFile(code)
      const evidenceFile = snapshotFile(evidence)
      const notRun = evidenceFile && isUnexecutedEvidence(evidenceFile)
      return {
        control: text(mitigation.control),
        type: mitigation.type,
        code_ref: code,
        evidence_ref: evidence,
        evidence_status_observed: notRun || mitigation.evidence_status_observed === 'NOT_RUN' ? 'NOT_RUN' as const
          : unsafeCode || unsafeEvidence ? 'MISSING_UNKNOWN' as const : mitigation.evidence_status_observed,
      }
    })
    const safeEntry: ExportedFailureMode = {
      id: entry.id,
      archetype_id: entry.archetype_id,
      source: entry.source,
      title: text(entry.title),
      trigger_or_cause: text(entry.trigger_or_cause),
      effect_summary: text(entry.effect_summary),
      severity_user: entry.severity_user,
      occurrence_inherent: entry.occurrence_inherent,
      detectability_inherent: entry.detectability_inherent,
      mapped_objects: entry.mapped_objects,
      claimed_mitigations: claimedMitigations,
      provenance: {
        basis: entry.provenance.basis,
        source_unit_ids: entry.provenance.source_unit_ids.flatMap((id) => exportSourceUnitId(id) ?? []),
        limitations: entry.provenance.limitations.map((note) => parserLimitations.find(([pattern]) => pattern.test(note))?.[1] ?? text(note)).filter(Boolean),
        file_path: exportRepoReference(entry.provenance.file_path),
        snapshot_hash: exportSnapshotHash(entry.provenance.snapshot_hash),
        ...(entry.provenance.ai_assistance ? { ai_assistance: entry.provenance.ai_assistance } : {}),
      },
    }
    failureModes.push(safeEntry)
    // Report dropped references as gaps without passing their original values to the validator.
    validationEntries.push({
      ...safeEntry,
      claimed_mitigations: claimedMitigations.map((mitigation, i) => ({
        ...mitigation,
        code_ref: invalidRefs[i].code ? '/' : mitigation.code_ref,
        evidence_ref: invalidRefs[i].evidence ? '/' : mitigation.evidence_ref,
      })),
    })
  }

  const result = validateFailureModeRegister(validationEntries, manifest && { files: validationFiles })
  // The validator may quote its reference argument in NOT_RUN messages; avoid quoting even a placeholder.
  const validated = result.findings.filter((finding) => !(invalidRows.length > 0 && finding.code === 'FM_REGISTER_EMPTY'))
    .map((finding) => finding.code === 'FM_UNEXECUTED_EVIDENCE_REF'
      ? { ...finding, message: 'Linked evidence is NOT_RUN / specification only. Will not satisfy Q3 in Solution Assurance Engine.' }
      : finding)
  const findings = [...invalidRows, ...validated]
  const blockers = findings.filter((finding) => finding.kind === 'COMPILATION_BLOCKER')
  const honestGaps = findings.filter((finding) => finding.kind === 'HONEST_GAP')
  const validation = {
    findings,
    blockers,
    honestGaps,
    blockerCodes: [...new Set(blockers.map(({ code }) => code))],
    openWarningCodes: [...new Set(honestGaps.map(({ code }) => code))],
    canExportHandoff: blockers.length === 0,
  }

  const imported = record.failureModeImport
  const confirmedAt = isoDate(record.confirmation?.confirmedAt)
  return {
    record: {
      schemaVersion: record.schemaVersion,
      answers,
      evidenceRefs,
      notApplicable,
      evidence: record.evidence.map((item) => ({
        id: /^E-[0-9]{3,12}$/.test(item.id) ? item.id : '', title: text(item.title),
        reference: exportGeneralReference(item.reference), type: text(item.type), basis: text(item.basis),
        verification: text(item.verification), owner: text(item.owner), scope: text(item.scope),
        transmission: text(item.transmission),
      })),
      dataSources: record.dataSources.map((item) => ({
        id: /^D-[0-9]{3,12}$/.test(item.id) ? item.id : '', name: text(item.name), owner: text(item.owner),
        categories: text(item.categories), usageRights: text(item.usageRights), quality: text(item.quality),
        restrictions: text(item.restrictions),
      })),
      failureModes,
      failureModeImport: imported ? {
        filePath: exportRepoReference(imported.filePath) ?? '',
        snapshotHash: exportSnapshotHash(imported.snapshotHash) ?? '',
        importedAt: isoDate(imported.importedAt),
        notices: importNotices(imported.notices),
      } : null,
      confirmation: record.confirmation && confirmedAt
        ? { confirmedAt, version: versionNumber(record.confirmation.version) } : null,
      version: versionNumber(record.version),
      updatedAt: isoDate(record.updatedAt),
    },
    validation,
  }
}

function handoffPayload({ record, validation }: PreparedSummary) {
  const { failureModes, failureModeImport, ...documentation } = record
  return {
    schema_version: DOC_SUPPORT_HANDOFF_SCHEMA_VERSION,
    purpose: 'ASSESSMENT_HANDOFF',
    documentation_boundary: DOCUMENTATION_BOUNDARY,
    release: { state: record.confirmation ? 'DOCUMENTATION_CONFIRMED' : 'DRAFT' },
    record: documentation,
    failure_mode_import: failureModeImport ?? null,
    failure_mode_register: {
      schema_version: FAILURE_MODE_REGISTER_SCHEMA_VERSION,
      entries: failureModes,
      validation_summary: {
        total_entries: failureModes.length,
        archetype_entries: failureModes.filter((entry) => entry.archetype_id !== null).length,
        custom_entries: failureModes.filter((entry) => entry.archetype_id === null).length,
        open_warnings: validation.openWarningCodes,
        blockers: validation.blockerCodes,
      },
    },
    outstanding_work: validation.honestGaps,
  }
}

export type DocSupportHandoff = ReturnType<typeof handoffPayload> & {
  integrity: { canonicalization: 'RFC8785'; algorithm: 'SHA-256'; payload_sha256: string }
}

/** Returns null for compilation blockers. A digest detects changes; it is not a signature. */
export async function compilePreparedHandoff(summary: PreparedSummary): Promise<DocSupportHandoff | null> {
  if (!summary.validation.canExportHandoff) return null
  const payload = handoffPayload(summary)
  const bytes = new TextEncoder().encode(canonicalizeJson(payload))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return {
    ...payload,
    integrity: {
      canonicalization: 'RFC8785',
      algorithm: 'SHA-256',
      payload_sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    },
  }
}

export function compileDocSupportHandoff(record: Assessment, manifest?: RepositorySnapshotManifest): Promise<DocSupportHandoff | null> {
  return compilePreparedHandoff(prepareSummaryExport(record, manifest))
}
