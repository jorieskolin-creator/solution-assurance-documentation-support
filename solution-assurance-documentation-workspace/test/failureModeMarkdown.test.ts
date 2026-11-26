import { describe, expect, it } from 'vitest'
import {
  parseFailureModeRegister,
  sanitizeRelativeRepoPath,
  serializeFailureModeRegister,
} from '../src/lib/failureModeMarkdown'
import type { FailureModeEntry } from '../src/types/failureMode'

describe('Step 2: deterministic Markdown parser & serializer for 02-Risk-and-Impact.md', () => {
  it('parses a canonical 3-row table with archetype auto-mapping and custom row', () => {
    const markdown = `# 02 Risk and Impact

Some narrative risk text.

## Failure Mode Register

| ID | Failure Mode | Severity | Trigger / Cause | Planned Mitigation (Type) | Code / Evidence Ref |
|---|---|---|---|---|---|
| FM-03 | Cross-tenant data leak via RAG | CRITICAL | Missing tenant filter | Query-time RBAC filter (PREVENTIVE) | \`src/retrieval.ts\`; \`Documentation/evidence/rag-rbac-isolation-test.json\` |
| FM-07 | Prompt injection via retrieved docs | HIGH | Untrusted chunk instructions | System prompt instruction | \`src/prompt.ts\` |
| FM-CUSTOM-01 | Blended multi-cloud maturity headline | HIGH | Averaging across accounts | Per-workload table (DETECTIVE) | \`Documentation/evidence/workload-breakdown.json\` |
`

    const result = parseFailureModeRegister(markdown, {
      manifest: {
        filePath: 'Documentation/02-Risk-and-Impact.md',
        snapshotHash: 'sha256:abc123',
        files: {
          'src/retrieval.ts': { content: 'export const filter = true' },
          'Documentation/evidence/rag-rbac-isolation-test.json': { status: 'NOT_RUN' },
          'src/prompt.ts': { content: 'export const p = "hi"' },
          'Documentation/evidence/workload-breakdown.json': { status: 'EXECUTED_PASS' },
        },
      },
    })

    expect(result.notices).toEqual([])
    expect(result.entries).toHaveLength(3)

    const [fm03, fm07, custom] = result.entries
    expect(fm03.id).toBe('FM-03')
    expect(fm03.archetype_id).toBe('FM-03')
    expect(fm03.source).toBe('DOCUMENT_EXTRACTED')
    expect(fm03.mapped_objects).toEqual(['B4', 'D1', 'AP-B4', 'AP-D1'])
    expect(fm03.claimed_mitigations[0].type).toBe('PREVENTIVE')
    expect(fm03.claimed_mitigations[0].evidence_status_observed).toBe('NOT_RUN')
    expect(fm03.provenance.basis).toBe('DOCUMENT_DECLARATION')
    expect(fm03.provenance.source_unit_ids[0]).toMatch(/^SRC-02:table-fm-row-1:L\d+$/)

    expect(fm07.claimed_mitigations[0].type).toBe('UNKNOWN')
    expect(fm07.claimed_mitigations[0].evidence_status_observed).toBe('OBSERVED_IN_CONFIG')
    expect(fm07.provenance.limitations.some((l) => l.includes('UNKNOWN'))).toBe(true)

    expect(custom.archetype_id).toBeNull()
    expect(custom.claimed_mitigations[0].evidence_ref).toBe('Documentation/evidence/workload-breakdown.json')
    expect(custom.claimed_mitigations[0].evidence_status_observed).toBe('TEST_EVIDENCE_LINKED')
  })

  it('handles legacy 02-Risk-and-Impact.md without Failure Mode Register cleanly', () => {
    const legacy = `# 02 Risk and Impact

## Consequences
Potential financial or reputational impact if answers are wrong.
`
    const result = parseFailureModeRegister(legacy)
    expect(result.entries).toEqual([])
    expect(result.notices).toEqual(['FAILURE_MODE_REGISTER_NOT_FOUND'])
    expect(result.rawSection).toBeNull()
  })

  it('rejects path traversal and external URLs safely', () => {
    expect(sanitizeRelativeRepoPath('../../etc/passwd').safePath).toBeNull()
    expect(sanitizeRelativeRepoPath('https://evil.example/payload.json').safePath).toBeNull()
    expect(sanitizeRelativeRepoPath('/etc/shadow').safePath).toBeNull()

    const markdown = `## Failure Mode Register

| ID | Failure Mode | Severity | Trigger / Cause | Planned Mitigation (Type) | Code / Evidence Ref |
|---|---|---|---|---|---|
| FM-03 | Leak | CRITICAL | Missing filter | Filter (PREVENTIVE) | \`../../etc/passwd\` |
`
    const result = parseFailureModeRegister(markdown)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].claimed_mitigations[0].code_ref).toBeNull()
    expect(result.entries[0].claimed_mitigations[0].evidence_ref).toBeNull()
    expect(result.entries[0].claimed_mitigations[0].evidence_status_observed).toBe('MISSING_UNKNOWN')
    expect(result.entries[0].provenance.limitations[0]).toContain('Path traversal rejected')
  })

  it('ignores fenced examples and preserves cell delimiters, newlines and explicit empty mappings', () => {
    const example = '~~~markdown\n## Failure Mode Register\n~~~'
    const register = '## Failure Mode Register\n| ID | Failure Mode | Effect | Mapped Objects | Planned Mitigation | Code / Evidence Ref |\n|---|---|---|---|---|---|\n| FM-03 | Example | Example effect | | Review (DETECTIVE) | |'
    const { entries } = parseFailureModeRegister(`${example}\n\n${register}`)
    expect(entries).toHaveLength(1)
    const [row] = entries
    row.title = 'Boundary | stage one\nstage two'
    row.claimed_mitigations[0].control = 'Record the literal marker <br> for review'
    const [roundTrip] = parseFailureModeRegister(serializeFailureModeRegister(entries)).entries
    expect(roundTrip.title).toBe(row.title)
    expect(roundTrip.mapped_objects).toEqual([])
    expect(roundTrip.claimed_mitigations).toEqual(row.claimed_mitigations)
  })

  it('preserves editable fields; source and evidence observations are derived on reimport', () => {
    const original: FailureModeEntry[] = [
      {
        id: 'FM-03',
        archetype_id: 'FM-03',
        source: 'USER_DECLARED',
        title: 'Cross-tenant data leak',
        trigger_or_cause: 'Missing tenant filter',
        effect_summary: 'Customer confidential data exposed',
        severity_user: 'CRITICAL',
        occurrence_inherent: 'HIGH',
        detectability_inherent: 'LOW',
        mapped_objects: ['B4', 'D1', 'AP-B4', 'AP-D1'],
        claimed_mitigations: [
          {
            control: 'Query-time RBAC filter',
            type: 'PREVENTIVE',
            code_ref: 'src/services/retrievalFilter.ts',
            evidence_ref: 'Documentation/evidence/rag-rbac-isolation-test.json',
            evidence_status_observed: 'NOT_RUN',
          },
          {
            control: 'Audit alert on cross-tenant query',
            type: 'DETECTIVE',
            code_ref: null,
            evidence_ref: 'Documentation/evidence/alert-spec.json',
            evidence_status_observed: 'NOT_RUN',
          },
        ],
        provenance: {
          basis: 'MANUAL_USER_DECLARATION',
          source_unit_ids: [],
          limitations: [],
        },
      },
      {
        id: 'FM-CUSTOM-01',
        archetype_id: null,
        source: 'USER_DECLARED',
        title: 'Blended score headline',
        trigger_or_cause: 'Single average hides failures',
        effect_summary: 'Overstated compliance posture',
        severity_user: 'HIGH',
        occurrence_inherent: 'MEDIUM',
        detectability_inherent: 'LOW',
        mapped_objects: ['D2'],
        claimed_mitigations: [],
        provenance: {
          basis: 'MANUAL_USER_DECLARATION',
          source_unit_ids: [],
          limitations: [],
        },
      },
    ]

    const md = serializeFailureModeRegister(original)
    const parsed = parseFailureModeRegister(md, {
      manifest: {
        files: {
          'src/services/retrievalFilter.ts': { content: 'ok' },
          'Documentation/evidence/rag-rbac-isolation-test.json': { status: 'NOT_RUN' },
          'Documentation/evidence/alert-spec.json': { status: 'NOT_RUN' },
        },
      },
    })

    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[0]).toMatchObject({
      id: 'FM-03',
      archetype_id: 'FM-03',
      title: 'Cross-tenant data leak',
      trigger_or_cause: 'Missing tenant filter',
      effect_summary: 'Customer confidential data exposed',
      severity_user: 'CRITICAL',
      occurrence_inherent: 'HIGH',
      detectability_inherent: 'LOW',
      mapped_objects: ['B4', 'D1', 'AP-B4', 'AP-D1'],
      claimed_mitigations: original[0].claimed_mitigations,
    })
    expect(parsed.entries[1]).toMatchObject({
      id: 'FM-CUSTOM-01',
      archetype_id: null,
      title: 'Blended score headline',
      trigger_or_cause: 'Single average hides failures',
      effect_summary: 'Overstated compliance posture',
      severity_user: 'HIGH',
      occurrence_inherent: 'MEDIUM',
      detectability_inherent: 'LOW',
      mapped_objects: ['D2'],
      claimed_mitigations: [],
    })
  })
})
