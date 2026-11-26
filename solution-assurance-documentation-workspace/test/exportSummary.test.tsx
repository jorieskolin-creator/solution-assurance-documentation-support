import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SummaryDocument } from '../src/components/SummaryDocument'
import { createBlankAssessment, updateRecord } from '../src/lib/assessment'
import { canonicalizeJson } from '../src/lib/canonicalJson'
import { compileDocSupportHandoff, DOC_SUPPORT_HANDOFF_SCHEMA_VERSION, HANDOFF_SCRIPT_ID } from '../src/lib/docSupportHandoff'
import { MAX_EXPORT_TEXT_LENGTH } from '../src/lib/exportSanitization'
import { createStandaloneSummary, createSummaryExports } from '../src/lib/exportSummary'
import { parseFailureModeRegister } from '../src/lib/failureModeMarkdown'
import type { Assessment } from '../src/types/assessment'
import { failureModeRegisterSchema } from '../src/types/failureMode'

const timestamp = '2026-10-30T12:00:00.000Z'
const snapshotHash = `sha256:${'a'.repeat(64)}`
const evidencePath = 'Documentation/evidence/review-history.json'
const sourceRow = `| FM-03 | Incorrect records shown | HIGH | Incorrect filter | Review filter (PREVENTIVE) | code:src/filter.ts; evidence:${evidencePath} |`
const manifest = {
  filePath: 'Documentation/02-Risk-and-Impact.md',
  snapshotHash,
  files: {
    'src/filter.ts': { content: 'Example internal configuration excerpt' },
    'src/review.ts': {},
    [evidencePath]: { status: 'NOT_RUN' },
  },
}

function assessment(fullRegister = false): Assessment {
  const parsed = parseFailureModeRegister(`## Failure Mode Register
| ID | Failure Mode | Severity | Trigger / Cause | Planned Mitigation | Code / Evidence Ref |
|---|---|---|---|---|---|
${sourceRow}${fullRegister ? `
| FM-06 | Unsupported summary | HIGH | Missing context | Independent review (DETECTIVE) | code:src/review.ts |
| FM-07 | Untrusted instructions | HIGH | Ambiguous input | Reviewer instruction (PROCEDURAL_OR_PROMPT_ONLY) | |
| FM-CUSTOM-01 | Blended cloud maturity headline | MEDIUM | Aggregate hides differences | | |` : ''}`, { manifest })
  if (fullRegister) parsed.entries[3].mapped_objects = ['D2']
  return {
    ...createBlankAssessment(),
    version: 1,
    updatedAt: timestamp,
    confirmation: { confirmedAt: timestamp, version: 1 },
    answers: {
      solutionName: 'Record review assistant', recordOwner: 'Service team', lifecycleStage: 'QUALIFICATION_REGISTRATION',
      intendedPurpose: 'Help the review team find the right records.',
    },
    evidenceRefs: { intendedPurpose: 'E-001' },
    notApplicable: { propagation: { rationale: 'No downstream copy.', owner: 'Service team' } },
    evidence: [{
      id: 'E-001', title: 'Review history', reference: evidencePath, type: 'Test / validation',
      basis: 'DOCUMENTED', verification: 'UNVERIFIED', owner: 'Service team', scope: 'Specification only',
      transmission: 'Internal only',
    }],
    dataSources: [{
      id: 'D-001', name: 'Review records', owner: 'Service team', categories: 'Review metadata',
      usageRights: 'Internal use', quality: 'Quarterly review', restrictions: 'No external sharing',
    }],
    failureModeImport: { filePath: manifest.filePath, snapshotHash, importedAt: timestamp, notices: parsed.notices },
    failureModes: parsed.entries,
  }
}

function readHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

// Independent canonicalization for the fixture: the replacer sorts every object before JSON.stringify.
// The fixture's field names are non-numeric; RFC key ordering of numeric names is tested separately.
function digest(payload: unknown): string {
  const ordered = JSON.stringify(payload, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value)
  return createHash('sha256').update(ordered, 'utf8').digest('hex')
}

describe('printable assessment and documentation handoff', () => {
  it('matches the golden handoff and independently verifies integrity and HTML/JSON parity', async () => {
    const imported = assessment(true)
    const edited = updateRecord(imported, { failureModes: imported.failureModes.map((row) => row.id === 'FM-CUSTOM-01' ? { ...row, effect_summary: 'Reviewers may overestimate readiness.' } : row) })
    expect(edited.confirmation).toBeNull()
    const record = { ...edited, updatedAt: timestamp, confirmation: imported.confirmation }
    const artifacts = await createSummaryExports(record, manifest)
    expect(artifacts.validation.openWarningCodes).toEqual(expect.arrayContaining(['FM_UNEXECUTED_EVIDENCE_REF', 'FM_HIGH_SEVERITY_WEAK_MITIGATION']))
    expect(artifacts.handoffJson).not.toBeNull()
    await expect(artifacts.handoffJson!).toMatchFileSnapshot('./fixtures/doc-support-handoff.golden.json')
    const handoff = JSON.parse(artifacts.handoffJson!)
    const { integrity, ...payload } = handoff
    expect(payload.schema_version).toBe(DOC_SUPPORT_HANDOFF_SCHEMA_VERSION)
    expect(failureModeRegisterSchema.safeParse(payload.failure_mode_register).success).toBe(true)
    expect(integrity).toEqual({ canonicalization: 'RFC8785', algorithm: 'SHA-256', payload_sha256: digest(payload) })
    expect(integrity.payload_sha256).not.toBe(digest({ ...payload, record: { ...payload.record, version: 2 } }))

    const doc = readHtml(artifacts.html)
    const script = doc.getElementById(HANDOFF_SCRIPT_ID)
    expect(doc.querySelectorAll('script')).toHaveLength(1)
    expect(script?.getAttribute('type')).toBe('application/json')
    expect(JSON.parse(script!.textContent!)).toEqual(handoff)
    const article = doc.querySelector('article')!
    expect(article.outerHTML).toBe(readHtml(createStandaloneSummary(record, manifest)).querySelector('article')?.outerHTML)
    expect(article.outerHTML).toBe(readHtml(renderToStaticMarkup(createElement(SummaryDocument, { record, manifest }))).querySelector('article')?.outerHTML)
    expect(article.textContent).toContain(payload.record.answers.intendedPurpose)
    expect([...article.querySelectorAll('[data-failure-mode-id]')].map((row) => row.getAttribute('data-failure-mode-id'))).toEqual(payload.failure_mode_register.entries.map((row: { id: string }) => row.id))
    expect(article.textContent).toContain(payload.failure_mode_register.entries[0].title)
    expect(article.textContent).toContain('Confirmed documentation · v1')
    expect(article.textContent).toContain('Unverified')
    expect(article.textContent).toContain('It is not an approval')
    expect(article.textContent).toContain('Will not satisfy Q3')
    expect(handoff.outstanding_work[0].code).toBe('FM_UNEXECUTED_EVIDENCE_REF')
    expect(await compileDocSupportHandoff(record, manifest)).toEqual(handoff)

    const reversed = { ...record, answers: Object.fromEntries(Object.entries(record.answers).reverse()) }
    expect((await createSummaryExports(reversed, manifest)).handoffJson).toBe(artifacts.handoffJson)
  })

  it('keeps harmless markup as text and omits known excerpts, pasted code, and unsafe references', async () => {
    const record = assessment()
    const row = record.failureModes[0]
    const mitigation = row.claimed_mitigations[0]
    const reference = '../drafts/reference.txt'
    const excludedLocation = '/drafts/unpublished-review.md'
    const rawNotice = 'Review marker not intended for export'
    const name = 'Record <em>review</em> & team\u2028notes'
    record.answers.solutionName = name
    record.answers.saidotReference = '<em>Inventory note</em>'
    record.answers.engineReference = 'https://example.test/workspaces/record'
    record.answers.intendedPurpose = `Review overview\n${sourceRow}\n\`\`\`text\nPasted internal snippet\n\`\`\`\n${reference}\nEnd of overview`
    record.answers.unknownRawField = 'Unknown raw field marker'
    record.evidenceRefs.intendedPurpose = `e-001; ${reference}; E-099`
    record.evidence[0].reference = excludedLocation
    record.evidence[0].scope = `review scope ${excludedLocation}`
    record.dataSources[0].quality = 'Example `inline excerpt` retained as a note.'
    record.failureModeImport!.notices.push(`Skipped row at line 8: malformed ID "${rawNotice}"`)
    row.provenance.file_path = excludedLocation
    row.provenance.limitations.push(`Path traversal rejected: ${reference}`)
    mitigation.code_ref = reference
    mitigation.evidence_ref = 'https://example.test/not-repo-relative'
    mitigation.evidence_status_observed = 'TEST_EVIDENCE_LINKED'

    const { html, handoffJson, validation } = await createSummaryExports(record)
    const doc = readHtml(html)
    const embedded = doc.getElementById(HANDOFF_SCRIPT_ID)!.textContent!
    const handoff = JSON.parse(handoffJson!)
    expect(JSON.parse(embedded)).toEqual(handoff)
    expect(handoff.record.answers.solutionName).toBe(name)
    expect(doc.querySelector('article h2')?.textContent).toBe(name)
    expect(doc.querySelector('article h2 em')).toBeNull()
    expect(embedded).not.toContain('<')
    expect(embedded).not.toContain('&')
    expect(embedded).toContain('\\u2028')
    for (const omitted of [sourceRow, 'Pasted internal snippet', 'inline excerpt', reference, excludedLocation,
      'Inventory note', 'https://example.test/not-repo-relative', 'Unknown raw field marker', rawNotice, '"excerpt"']) {
      expect(handOffText(html, handoffJson!)).not.toContain(omitted)
    }
    expect(handoff.record.answers.intendedPurpose).toContain('End of overview')
    expect(handoff.record.answers.engineReference).toBe('https://example.test/workspaces/record')
    expect(handoff.record.evidenceRefs.intendedPurpose).toBe('E-001, E-099')
    expect(handoff.failure_mode_import.notices).toEqual(['FAILURE_MODE_ROW_SKIPPED'])
    expect(handoff.failure_mode_register.entries[0].claimed_mitigations[0]).toMatchObject({
      code_ref: null, evidence_ref: null, evidence_status_observed: 'MISSING_UNKNOWN',
    })
    expect(validation.openWarningCodes).toContain('FM_BROKEN_EVIDENCE_REF')
    expect(record.failureModes[0].provenance.excerpt).toBe(sourceRow)
    expect(mitigation.code_ref).toBe(reference)
  })

  it('bounds narrative output without leaking a known excerpt crossing the cut', async () => {
    const record = assessment()
    record.answers.intendedPurpose = 'x'.repeat(MAX_EXPORT_TEXT_LENGTH - 12) + sourceRow
    const handoff = await compileDocSupportHandoff(record, manifest)
    const text = handoff!.record.answers.intendedPurpose
    expect(text.length).toBeLessThanOrEqual(MAX_EXPORT_TEXT_LENGTH)
    expect(text).not.toContain(sourceRow.slice(0, 12))
    expect(text).toMatch(/\[omitted\]…$/)
  })

  it('allows unconfirmed, honestly incomplete records and never hashes or embeds blocked handoffs', async () => {
    const record = assessment()
    const edited = updateRecord(record, { failureModes: [], failureModeImport: null })
    const allowed = await createSummaryExports(edited)
    expect(allowed.validation.canExportHandoff).toBe(true)
    expect(allowed.validation.openWarningCodes).toEqual(['FM_REGISTER_EMPTY'])
    expect(JSON.parse(allowed.handoffJson!).record.confirmation).toBeNull()
    expect(allowed.html).toContain('Draft · unconfirmed')

    const malformed = { id: 'Malformed row source text' } as Assessment['failureModes'][number]
    const blocked = { ...record, failureModes: [...record.failureModes, ...record.failureModes, malformed] }
    const hash = vi.spyOn(globalThis.crypto.subtle, 'digest')
    try {
      const result = await createSummaryExports(blocked, manifest)
      expect(await compileDocSupportHandoff(blocked, manifest)).toBeNull()
      expect(hash).not.toHaveBeenCalled()
      expect(result.handoffJson).toBeNull()
      expect(result.validation.blockerCodes).toEqual(['FM_SCHEMA_INVALID', 'FM_DUPLICATE_ID'])
      expect(readHtml(result.html).querySelectorAll('script')).toHaveLength(0)
      expect(result.html).toContain('Machine handoff blocked')
      expect(result.html).toContain('Confirmed documentation')
      expect(result.html).not.toContain('Malformed row source text')
    } finally {
      hash.mockRestore()
    }
  })

  it('reports manifest NOT_RUN even when an earlier status claimed linked evidence', async () => {
    const record = assessment()
    record.failureModes[0].claimed_mitigations[0].evidence_status_observed = 'TEST_EVIDENCE_LINKED'
    const result = await createSummaryExports(record, manifest)
    const handoff = JSON.parse(result.handoffJson!)
    expect(handoff.failure_mode_register.entries[0].claimed_mitigations[0].evidence_status_observed).toBe('NOT_RUN')
    expect(result.validation.openWarningCodes).toContain('FM_UNEXECUTED_EVIDENCE_REF')
    expect(result.html).not.toContain('Example internal configuration excerpt')
    expect(result.handoffJson).not.toContain('Example internal configuration excerpt')
  })
})

function handOffText(html: string, json: string) {
  return `${readHtml(html).documentElement.textContent}\n${json}`
}

describe('RFC 8785 canonical JSON', () => {
  it('serializes ECMAScript numbers and sorts UTF-16 keys recursively without sorting arrays', () => {
    const value = { '\uE000': 'BMP', '😀': 'pair', n: [Number('333333333.33333329'), 1e30, 4.50, 2e-3, 1e-27, -0], a: { 2: 2, 10: 10 } }
    expect(canonicalizeJson(value)).toBe('{"a":{"10":10,"2":2},"n":[333333333.3333333,1e+30,4.5,0.002,1e-27,0],"😀":"pair","\uE000":"BMP"}')
    expect(() => canonicalizeJson({ n: NaN })).toThrow('finite numbers')
    expect(() => canonicalizeJson('\uD800')).toThrow('well-formed Unicode')
  })
})
