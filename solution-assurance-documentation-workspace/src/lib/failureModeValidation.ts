import type { RepositorySnapshotManifest } from './failureModeMarkdown'
import { isUnexecutedEvidence, sanitizeRelativeRepoPath, snapshotFile } from './failureModeMarkdown'
import { failureModeEntrySchema, type FailureModeEntry } from '../types/failureMode'

export type FailureModeDefectCode =
  | 'FM_REGISTER_EMPTY'
  | 'FM_DUPLICATE_ID'
  | 'FM_SEVERITY_UNASSIGNED'
  | 'FM_HIGH_SEVERITY_WEAK_MITIGATION'
  | 'FM_BROKEN_EVIDENCE_REF'
  | 'FM_UNEXECUTED_EVIDENCE_REF'
  | 'FM_UNMAPPED_CUSTOM_CONTROL'
  | 'FM_SCHEMA_INVALID'

export type FindingSeverity = 'blocker' | 'warning' | 'info'
export type FindingKind = 'COMPILATION_BLOCKER' | 'HONEST_GAP'

export interface OutstandingWorkTarget {
  step: 'impact'
  fieldId: 'failureModes'
  rowId?: string
}

export interface FailureModeFinding {
  id: string
  code: FailureModeDefectCode
  severity: FindingSeverity
  kind: FindingKind
  title: string
  message: string
  permittedNextAction: string
  target: OutstandingWorkTarget
}

export interface FailureModeValidationResult {
  findings: FailureModeFinding[]
  blockers: FailureModeFinding[]
  honestGaps: FailureModeFinding[]
  openWarningCodes: FailureModeDefectCode[]
  blockerCodes: FailureModeDefectCode[]
  canExportHandoff: boolean
}

export function validateFailureModeRegister(
  entries: readonly FailureModeEntry[],
  manifest?: RepositorySnapshotManifest,
): FailureModeValidationResult {
  const findings: FailureModeFinding[] = []

  if (entries.length === 0) {
    findings.push({
      id: 'fm-register-empty',
      code: 'FM_REGISTER_EMPTY',
      severity: 'warning',
      kind: 'HONEST_GAP',
      title: 'Failure Mode Register is empty',
      message: 'No failure modes are declared for Step 02.',
      permittedNextAction:
        'Add relevant archetypes (FM-01–FM-15), add a custom failure mode, or import Documentation/02-Risk-and-Impact.md.',
      target: { step: 'impact', fieldId: 'failureModes' },
    })
  }

  const seenIds = new Map<string, number>()

  entries.forEach((entry, index) => {
    const normalizedId = typeof entry?.id === 'string' ? entry.id.trim().toUpperCase() : ''
    if (normalizedId) seenIds.set(normalizedId, (seenIds.get(normalizedId) ?? 0) + 1)

    const schemaResult = failureModeEntrySchema.safeParse(entry)
    if (!schemaResult.success) {
      findings.push({
        id: `fm-schema-${index}`,
        code: 'FM_SCHEMA_INVALID',
        severity: 'blocker',
        kind: 'COMPILATION_BLOCKER',
        title: `${normalizedId || `Row ${index + 1}`} fails contract schema`,
        message: schemaResult.error.issues.map((issue) => issue.message).join('; '),
        permittedNextAction: 'Correct invalid fields or ID format before exporting a canonical handoff.',
        target: { step: 'impact', fieldId: 'failureModes', rowId: typeof entry?.id === 'string' ? entry.id : undefined },
      })
      return
    }

    if (entry.severity_user === 'UNKNOWN') {
      findings.push({
        id: `fm-severity-${normalizedId}-${index}`,
        code: 'FM_SEVERITY_UNASSIGNED',
        severity: 'warning',
        kind: 'HONEST_GAP',
        title: `${normalizedId}: Severity unassigned`,
        message: `${entry.title || normalizedId} still has severity_user = UNKNOWN.`,
        permittedNextAction: 'Assign anchored Severity (LOW, MEDIUM, HIGH, or CRITICAL) or leave honestly open.',
        target: { step: 'impact', fieldId: 'failureModes', rowId: entry.id },
      })
    }

    const isHighOrCritical = entry.severity_user === 'HIGH' || entry.severity_user === 'CRITICAL'
    const hasTechnicalControl = entry.claimed_mitigations.some(
      (m) => Boolean(m.control.trim()) && (m.type === 'PREVENTIVE' || m.type === 'DETECTIVE'),
    )
    if (isHighOrCritical && !hasTechnicalControl) {
      findings.push({
        id: `fm-weak-mitigation-${normalizedId}-${index}`,
        code: 'FM_HIGH_SEVERITY_WEAK_MITIGATION',
        severity: 'warning',
        kind: 'HONEST_GAP',
        title: `${normalizedId}: Weak or missing mitigation for ${entry.severity_user} risk`,
        message:
          entry.claimed_mitigations.length === 0
            ? 'No claimed mitigations are recorded for a HIGH/CRITICAL failure mode.'
            : 'All claimed mitigations are PROCEDURAL_OR_PROMPT_ONLY (or UNKNOWN) for a HIGH/CRITICAL failure mode.',
        permittedNextAction:
          'Add a PREVENTIVE or DETECTIVE technical control if one exists, or preserve this honest gap for review.',
        target: { step: 'impact', fieldId: 'failureModes', rowId: entry.id },
      })
    }

    if (normalizedId.startsWith('FM-CUSTOM-') && entry.mapped_objects.length === 0) {
      findings.push({
        id: `fm-unmapped-${normalizedId}-${index}`,
        code: 'FM_UNMAPPED_CUSTOM_CONTROL',
        severity: 'info',
        kind: 'HONEST_GAP',
        title: `${normalizedId}: No Solution Assurance controls mapped`,
        message: 'Custom failure mode has empty mapped_objects. Engine will flag as UNMAPPED_CONTROL unless linked to A1–F5.',
        permittedNextAction: 'Map relevant Solution Assurance control IDs (e.g., D2, AP-D2) if applicable.',
        target: { step: 'impact', fieldId: 'failureModes', rowId: entry.id },
      })
    }

    if (entry.provenance.limitations.some((note) => /^(?:(?:Null byte|External or URI scheme|Absolute path|Path traversal) rejected|An unsafe repository reference was omitted\.|(?:Code|Evidence) reference not found in snapshot[:.])/i.test(note))) {
      findings.push({
        id: `fm-import-ref-${index}`, code: 'FM_BROKEN_EVIDENCE_REF', severity: 'warning', kind: 'HONEST_GAP',
        title: `${normalizedId}: Reference issue in imported source`, message: 'The source row contained a rejected or missing reference.',
        permittedNextAction: 'Inspect the original row and check repository-relative references against the snapshot.',
        target: { step: 'impact', fieldId: 'failureModes', rowId: entry.id },
      })
    }

    entry.claimed_mitigations.forEach((mitigation, mIndex) => {
      const refsToCheck = [
        { kind: 'code_ref', value: mitigation.code_ref },
        { kind: 'evidence_ref', value: mitigation.evidence_ref },
      ]

      let brokenForMitigation = false
      for (const ref of refsToCheck) {
        const raw = ref.value?.trim()
        if (!raw) continue
        const sanitized = sanitizeRelativeRepoPath(raw)
        if (!sanitized.safePath) {
          brokenForMitigation = true
        } else if (manifest && !snapshotFile(manifest, sanitized.safePath)) {
          brokenForMitigation = true
        }
      }

      if (
        !brokenForMitigation &&
        mitigation.evidence_status_observed === 'MISSING_UNKNOWN' &&
        (mitigation.code_ref?.trim() || mitigation.evidence_ref?.trim())
      ) {
        brokenForMitigation = true
      }

      if (brokenForMitigation) {
        findings.push({
          id: `fm-broken-ref-${normalizedId}-${index}-${mIndex}`,
          code: 'FM_BROKEN_EVIDENCE_REF',
          severity: 'warning',
          kind: 'HONEST_GAP',
          title: `${normalizedId}: Unresolved code or evidence reference`,
          message: `Reference on mitigation "${mitigation.control || 'Unnamed'}" does not resolve cleanly inside the repository snapshot.`,
          permittedNextAction: 'Provide a valid repository-relative path or mark the reference as unresolved.',
          target: { step: 'impact', fieldId: 'failureModes', rowId: entry.id },
        })
      }

      const manifestEvidence = snapshotFile(manifest, sanitizeRelativeRepoPath(mitigation.evidence_ref ?? '').safePath)
      const manifestMarkedNotRun = manifestEvidence ? isUnexecutedEvidence(manifestEvidence) : false

      if (mitigation.evidence_status_observed === 'NOT_RUN' || manifestMarkedNotRun) {
        findings.push({
          id: `fm-not-run-${normalizedId}-${index}-${mIndex}`,
          code: 'FM_UNEXECUTED_EVIDENCE_REF',
          severity: 'info',
          kind: 'HONEST_GAP',
          title: `${normalizedId}: Evidence is NOT_RUN`,
          message: `Linked evidence "${mitigation.evidence_ref || mitigation.control}" is NOT_RUN / specification only. Will not satisfy Q3 in Solution Assurance Engine.`,
          permittedNextAction: 'Execute the referenced verification and link observed test output before assurance gating.',
          target: { step: 'impact', fieldId: 'failureModes', rowId: entry.id },
        })
      }
    })
  })

  for (const [id, count] of seenIds.entries()) {
    if (count > 1) {
      findings.push({
        id: `fm-duplicate-${id}`,
        code: 'FM_DUPLICATE_ID',
        severity: 'blocker',
        kind: 'COMPILATION_BLOCKER',
        title: `Duplicate Failure Mode ID: ${id}`,
        message: `${count} rows share the same ID (${id}). Each failure mode entry must have a unique ID.`,
        permittedNextAction: 'Merge duplicate rows or assign a distinct FM-CUSTOM-NN identifier.',
        target: { step: 'impact', fieldId: 'failureModes', rowId: id },
      })
    }
  }

  const blockers = findings.filter((f) => f.kind === 'COMPILATION_BLOCKER')
  const honestGaps = findings.filter((f) => f.kind === 'HONEST_GAP')
  const openWarningCodes = [...new Set(honestGaps.map((f) => f.code))]
  const blockerCodes = [...new Set(blockers.map((f) => f.code))]

  return {
    findings,
    blockers,
    honestGaps,
    openWarningCodes,
    blockerCodes,
    canExportHandoff: blockers.length === 0,
  }
}
