import { documentationFields, sections } from '../data/sections'
import type { Assessment, DataSourceItem, EvidenceItem } from '../types/assessment'

export const STORAGE_KEY = 'solution-assurance-documentation-workspace-v01'

export function createBlankAssessment(): Assessment {
  return {
    schemaVersion: 'documentation-workspace-0.1',
    answers: { lifecycleStage: 'QUALIFICATION_REGISTRATION' },
    evidenceRefs: {},
    notApplicable: {},
    evidence: [],
    dataSources: [],
    confirmation: null,
    version: 0,
    updatedAt: new Date().toISOString(),
  }
}

export function loadAssessment(): Assessment {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return createBlankAssessment()
    const parsed = JSON.parse(stored) as Assessment
    if (parsed.schemaVersion !== 'documentation-workspace-0.1' || !parsed.answers || !Array.isArray(parsed.evidence) || !Array.isArray(parsed.dataSources)) {
      return createBlankAssessment()
    }
    return {
      ...createBlankAssessment(),
      ...parsed,
      evidenceRefs: parsed.evidenceRefs ?? {},
      notApplicable: parsed.notApplicable ?? {},
    }
  } catch {
    return createBlankAssessment()
  }
}

export function updateRecord(record: Assessment, patch: Partial<Assessment>): Assessment {
  return { ...record, ...patch, confirmation: null, updatedAt: new Date().toISOString() }
}

export function valueLabel(fieldId: string, value: string): string {
  const field = documentationFields.find((item) => item.id === fieldId)
  return field?.options?.find((option) => option.value === value)?.label ?? value
}

export function parseEvidenceRefs(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map((item) => item.trim().toUpperCase()).filter(Boolean))]
}

export function unresolvedEvidenceRefs(record: Assessment): string[] {
  const known = new Set(record.evidence.map((item) => item.id))
  return [...new Set(Object.values(record.evidenceRefs).flatMap(parseEvidenceRefs).filter((id) => !known.has(id)))]
}

export function sectionStats(record: Assessment, sectionId: string) {
  const fields = sections.find((section) => section.id === sectionId)?.fields ?? []
  let answered = 0
  let notApplicable = 0
  let open = 0
  fields.forEach((field) => {
    const na = record.notApplicable[field.id]
    if (na) {
      if (na.rationale.trim() && na.owner.trim()) notApplicable += 1
      else open += 1
    } else if (record.answers[field.id]?.trim()) answered += 1
    else open += 1
  })
  return { answered, notApplicable, open, total: fields.length }
}

export function overallStats(record: Assessment) {
  const total = documentationFields.length
  const answered = documentationFields.filter((field) => !record.notApplicable[field.id] && record.answers[field.id]?.trim()).length
  const notApplicable = documentationFields.filter((field) => {
    const na = record.notApplicable[field.id]
    return na?.rationale.trim() && na.owner.trim()
  }).length
  const coreMissing = documentationFields.filter((field) => field.core && !record.notApplicable[field.id] && !record.answers[field.id]?.trim()).length
  return { answered, notApplicable, open: total - answered - notApplicable, total, coreMissing }
}

export function nextEvidenceId(items: EvidenceItem[]): string {
  const highest = items.reduce((max, item) => {
    const match = /^E-(\d+)$/.exec(item.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `E-${String(highest + 1).padStart(3, '0')}`
}

export function nextDataSourceId(items: DataSourceItem[]): string {
  const highest = items.reduce((max, item) => {
    const match = /^D-(\d+)$/.exec(item.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `D-${String(highest + 1).padStart(3, '0')}`
}

export function displayDate(value: string | undefined): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
