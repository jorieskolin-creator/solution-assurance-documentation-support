import { describe, expect, it } from 'vitest'
import schemaJson from '../src/schema/failure-mode-register.schema.json'
import { failureModeArchetypes } from '../src/data/failureModeArchetypes'
import { failureModeGuidance } from '../src/data/failureModeGuidance'
import {
  FAILURE_MODE_REGISTER_SCHEMA_VERSION,
  failureModeEntrySchema,
  failureModeRegisterSchema,
} from '../src/types/failureMode'

describe('Step 1: failure-mode-register/1.0.0 schema, archetypes & guidance', () => {
  it('freezes the JSON schema version and 15 starter archetypes (FM-01..FM-15)', () => {
    expect(schemaJson.properties.schema_version.const).toBe(FAILURE_MODE_REGISTER_SCHEMA_VERSION)
    expect(failureModeArchetypes).toHaveLength(15)
    expect(failureModeArchetypes.map((a) => a.id)).toEqual([
      'FM-01', 'FM-02', 'FM-03', 'FM-04', 'FM-05',
      'FM-06', 'FM-07', 'FM-08', 'FM-09', 'FM-10',
      'FM-11', 'FM-12', 'FM-13', 'FM-14', 'FM-15',
    ])
  })

  it('validates FM-03 and FM-CUSTOM-01 payloads', () => {
    const validRegister = {
      schema_version: FAILURE_MODE_REGISTER_SCHEMA_VERSION,
      entries: [
        {
          id: 'FM-03',
          archetype_id: 'FM-03',
          source: 'USER_DECLARED',
          title: 'Cross-tenant or unauthorized data exposure via retrieval/logs',
          trigger_or_cause: 'Missing tenant filter in vector search or raw prompt logging',
          effect_summary: 'Confidential customer data disclosed to unauthorized tenant',
          severity_user: 'CRITICAL',
          occurrence_inherent: 'HIGH',
          detectability_inherent: 'LOW',
          mapped_objects: ['B4', 'D1', 'AP-B4', 'AP-D1'],
          claimed_mitigations: [
            {
              control: 'Pre-call DLP regex + query-time RBAC filter',
              type: 'PREVENTIVE',
              code_ref: 'src/services/retrievalFilter.ts',
              evidence_ref: 'Documentation/evidence/rag-rbac-isolation-test.json',
              evidence_status_observed: 'NOT_RUN',
            },
          ],
          provenance: {
            basis: 'DOCUMENT_DECLARATION',
            source_unit_ids: ['SRC-02:table-fm-row-1'],
            limitations: [],
          },
        },
        {
          id: 'FM-CUSTOM-01',
          archetype_id: null,
          source: 'USER_DECLARED',
          title: 'Blended multi-cloud maturity headline',
          trigger_or_cause: 'Averaging across accounts hides critical non-compliant workloads',
          effect_summary: 'Executive summary overstates readiness',
          severity_user: 'HIGH',
          occurrence_inherent: 'MEDIUM',
          detectability_inherent: 'LOW',
          mapped_objects: ['D2'],
          claimed_mitigations: [],
          provenance: {
            basis: 'MANUAL_USER_DECLARATION',
            source_unit_ids: [],
            limitations: ['Manual user declaration — no repository source'],
          },
        },
      ],
    }

    const parsed = failureModeRegisterSchema.safeParse(validRegister)
    expect(parsed.success).toBe(true)
  })

  it('rejects PASS in evidence_status_observed, malformed IDs, and RPN numeric fields', () => {
    const baseEntry = {
      id: 'FM-03',
      archetype_id: 'FM-03',
      source: 'USER_DECLARED',
      title: 'Leak',
      trigger_or_cause: 'Missing filter',
      effect_summary: 'Exposure',
      severity_user: 'CRITICAL',
      occurrence_inherent: 'HIGH',
      detectability_inherent: 'LOW',
      mapped_objects: ['B4'],
      claimed_mitigations: [
        {
          control: 'RBAC filter',
          type: 'PREVENTIVE',
          evidence_status_observed: 'PASS',
        },
      ],
      provenance: {
        basis: 'MANUAL_USER_DECLARATION',
        source_unit_ids: [],
        limitations: [],
      },
    }

    expect(failureModeEntrySchema.safeParse(baseEntry).success).toBe(false)

    const badId = { ...baseEntry, id: 'FM-99', claimed_mitigations: [] }
    expect(failureModeEntrySchema.safeParse(badId).success).toBe(false)

    const withRpn = { ...baseEntry, claimed_mitigations: [], rpn: 120 }
    expect(failureModeEntrySchema.safeParse(withRpn).success).toBe(false)
  })

  it('provides 5-layer guidance for register and subfields without mentioning RPN calculation', () => {
    for (const key of [
      'failureModes',
      'severity_user',
      'occurrence_inherent',
      'detectability_inherent',
      'claimed_mitigations',
    ] as const) {
      const g = failureModeGuidance[key]
      expect(g.essentialInstruction.length).toBeGreaterThan(10)
      expect(g.quickClarification.length).toBeGreaterThan(10)
      expect(g.detailedQuestions.whatToRecord.length).toBeGreaterThan(10)
      expect(g.detailedQuestions.anchoredLevels.length).toBeGreaterThan(0)
      expect(g.detailedQuestions.whyNoRpn.length).toBeGreaterThan(10)
      expect(g.detailedQuestions.provenanceBoundary.length).toBeGreaterThan(10)
      expect(g.detailedQuestions.commonMistake.length).toBeGreaterThan(10)
    }
  })
})
