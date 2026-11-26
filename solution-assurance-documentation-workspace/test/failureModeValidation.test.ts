import { describe, expect, it } from 'vitest'
import { createBlankAssessment, updateRecord } from '../src/lib/assessment'
import { validateFailureModeRegister } from '../src/lib/failureModeValidation'
import type { FailureModeEntry } from '../src/types/failureMode'

function makeEntry(overrides: Partial<FailureModeEntry> = {}): FailureModeEntry {
  return {
    id: 'FM-03',
    archetype_id: 'FM-03',
    source: 'USER_DECLARED',
    title: 'Cross-tenant data exposure',
    trigger_or_cause: 'Missing tenant filter',
    effect_summary: 'Confidential data disclosed',
    severity_user: 'CRITICAL',
    occurrence_inherent: 'HIGH',
    detectability_inherent: 'LOW',
    mapped_objects: ['B4', 'D1'],
    claimed_mitigations: [
      {
        control: 'Query-time RBAC filter',
        type: 'PREVENTIVE',
        code_ref: 'src/retrieval.ts',
        evidence_ref: 'Documentation/evidence/rbac.json',
        evidence_status_observed: 'TEST_EVIDENCE_LINKED',
      },
    ],
    provenance: {
      basis: 'MANUAL_USER_DECLARATION',
      source_unit_ids: [],
      limitations: [],
    },
    ...overrides,
  }
}

describe('Step 3: deterministic validators, defect codes & confirmation invalidation', () => {
  it('flags FM_REGISTER_EMPTY as honest gap without blocking handoff', () => {
    const res = validateFailureModeRegister([])
    expect(res.openWarningCodes).toContain('FM_REGISTER_EMPTY')
    expect(res.blockers).toHaveLength(0)
    expect(res.canExportHandoff).toBe(true)
  })

  it('flags FM_DUPLICATE_ID as compilation blocker', () => {
    const res = validateFailureModeRegister([makeEntry(), makeEntry()])
    expect(res.blockerCodes).toContain('FM_DUPLICATE_ID')
    expect(res.canExportHandoff).toBe(false)
    expect(res.blockers[0].target).toEqual({
      step: 'impact',
      fieldId: 'failureModes',
      rowId: 'FM-03',
    })
  })

  it('triggers FM_SEVERITY_UNASSIGNED, FM_HIGH_SEVERITY_WEAK_MITIGATION, FM_BROKEN_EVIDENCE_REF, FM_UNEXECUTED_EVIDENCE_REF, and FM_UNMAPPED_CUSTOM_CONTROL', () => {
    const entries: FailureModeEntry[] = [
      makeEntry({
        id: 'FM-01',
        archetype_id: 'FM-01',
        severity_user: 'UNKNOWN',
        claimed_mitigations: [],
      }),
      makeEntry({
        id: 'FM-07',
        archetype_id: 'FM-07',
        severity_user: 'HIGH',
        claimed_mitigations: [
          {
            control: 'Tell model to ignore injections',
            type: 'PROCEDURAL_OR_PROMPT_ONLY',
            code_ref: 'src/missing-file.ts',
            evidence_ref: null,
            evidence_status_observed: 'MISSING_UNKNOWN',
          },
        ],
      }),
      makeEntry({
        id: 'FM-03',
        archetype_id: 'FM-03',
        severity_user: 'CRITICAL',
        claimed_mitigations: [
          {
            control: 'RBAC filter',
            type: 'PREVENTIVE',
            code_ref: 'src/retrieval.ts',
            evidence_ref: 'Documentation/evidence/rbac.json',
            evidence_status_observed: 'NOT_RUN',
          },
        ],
      }),
      makeEntry({
        id: 'FM-CUSTOM-01',
        archetype_id: null,
        severity_user: 'MEDIUM',
        mapped_objects: [],
        claimed_mitigations: [],
      }),
    ]

    const res = validateFailureModeRegister(entries, {
      files: {
        'src/retrieval.ts': { content: 'ok' },
        'Documentation/evidence/rbac.json': { status: 'NOT_RUN' },
      },
    })

    expect(res.openWarningCodes).toEqual(
      expect.arrayContaining([
        'FM_SEVERITY_UNASSIGNED',
        'FM_HIGH_SEVERITY_WEAK_MITIGATION',
        'FM_BROKEN_EVIDENCE_REF',
        'FM_UNEXECUTED_EVIDENCE_REF',
        'FM_UNMAPPED_CUSTOM_CONTROL',
      ]),
    )
    expect(res.canExportHandoff).toBe(true)

    const notRunFinding = res.findings.find((f) => f.code === 'FM_UNEXECUTED_EVIDENCE_REF')
    expect(notRunFinding?.message).toContain('Will not satisfy Q3 in Solution Assurance Engine')
  })

  it('invalidates confirmation when any failure mode is added or edited', () => {
    const confirmed = {
      ...createBlankAssessment(),
      version: 1,
      confirmation: { confirmedAt: '2026-11-26T10:00:00.000Z', version: 1 },
      failureModes: [makeEntry()],
    }

    const edited = updateRecord(confirmed, {
      failureModes: [{ ...confirmed.failureModes[0], title: 'Updated leak title' }],
    })

    expect(edited.confirmation).toBeNull()
  })
})
