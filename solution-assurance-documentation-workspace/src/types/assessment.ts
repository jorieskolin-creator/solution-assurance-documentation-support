import type { FailureModeEntry } from './failureMode'

export type FieldType = 'text' | 'textarea' | 'select'

export interface FieldOption {
  value: string
  label: string
}

export interface QuestionDefinition {
  id: string
  label: string
  help: string
  type: FieldType
  core?: boolean
  options?: FieldOption[]
  placeholder?: string
}

export interface SectionDefinition {
  id: 'setup' | 'purpose' | 'impact' | 'permission'
  number: string
  title: string
  shortTitle: string
  description: string
  guidance: string
  fields: QuestionDefinition[]
}

export interface NotApplicableDetail {
  rationale: string
  owner: string
}

export interface EvidenceItem {
  id: string
  title: string
  reference: string
  type: string
  basis: string
  verification: string
  owner: string
  scope: string
  transmission: string
}

export interface DataSourceItem {
  id: string
  name: string
  owner: string
  categories: string
  usageRights: string
  quality: string
  restrictions: string
}

export interface Confirmation {
  confirmedAt: string
  version: number
}

export interface FailureModeImportMetadata {
  filePath: string
  snapshotHash: string
  importedAt: string
  notices: string[]
}

export interface Assessment {
  schemaVersion: 'documentation-workspace-0.1'
  answers: Record<string, string>
  evidenceRefs: Record<string, string>
  notApplicable: Record<string, NotApplicableDetail>
  evidence: EvidenceItem[]
  dataSources: DataSourceItem[]
  failureModes: FailureModeEntry[]
  failureModeImport?: FailureModeImportMetadata | null
  confirmation: Confirmation | null
  version: number
  updatedAt: string
}
