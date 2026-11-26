import { useState, type ChangeEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Popover from '@radix-ui/react-popover'
import {
  AlertTriangle, ChevronDown, ChevronRight, Copy, Eye, FileUp, HelpCircle,
  Plus, Sparkles, Trash2, X,
} from 'lucide-react'
import { failureModeArchetypeMap, failureModeArchetypes } from '../data/failureModeArchetypes'
import { failureModeGuidance, type GuidanceTargetId } from '../data/failureModeGuidance'
import { parseFailureModeRegister, readSnapshotManifest, serializeFailureModeRegister, type RepositorySnapshotManifest } from '../lib/failureModeMarkdown'
import { createExportTextSanitizer, exportRepoReference } from '../lib/exportSanitization'
import type { FailureModeImportMetadata } from '../types/assessment'
import {
  CONTROL_OBJECT_ID_REGEX,
  nextCustomFailureModeId,
  failureModeEntrySchema,
  type ClaimedMitigation,
  type ControlObjectId,
  type DetectabilityInherent,
  type FailureModeEntry,
  type MitigationType,
  type ObservedEvidenceStatus,
  type OccurrenceInherent,
  type SeverityUser,
} from '../types/failureMode'

interface FailureModeRegisterProps {
  entries: FailureModeEntry[]
  expandedRowId: string | null
  onExpandedRowChange: (rowId: string | null) => void
  onChangeEntries: (next: FailureModeEntry[], importMetadata?: FailureModeImportMetadata) => void
  onFocusGuidance: (target: GuidanceTargetId, rowArchetypeId?: string | null) => void
  onNotify: (message: string) => void
  onOpenAiAssist?: () => void
}

const SEVERITY_OPTIONS: { value: SeverityUser; label: string }[] = [
  { value: 'UNKNOWN', label: 'Unknown (not yet assessed)' },
  { value: 'LOW', label: 'LOW — Minor / easily corrected' },
  { value: 'MEDIUM', label: 'MEDIUM — Bounded material rework' },
  { value: 'HIGH', label: 'HIGH — Significant harm or breach' },
  { value: 'CRITICAL', label: 'CRITICAL — Severe / systemic / irreversible' },
]

const OCCURRENCE_OPTIONS: { value: OccurrenceInherent; label: string }[] = [
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'LOW', label: 'LOW — Unlikely under design' },
  { value: 'MEDIUM', label: 'MEDIUM — Periodically plausible' },
  { value: 'HIGH', label: 'HIGH — Readily triggered' },
]

const DETECTABILITY_OPTIONS: { value: DetectabilityInherent; label: string }[] = [
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'HIGH', label: 'HIGH — Readily caught before harm' },
  { value: 'MEDIUM', label: 'MEDIUM — Caught via targeted review' },
  { value: 'LOW', label: 'LOW — Silent / hard to spot early' },
]

const MITIGATION_TYPE_OPTIONS: { value: MitigationType; label: string }[] = [
  { value: 'PREVENTIVE', label: 'PREVENTIVE — Technical block / constraint' },
  { value: 'DETECTIVE', label: 'DETECTIVE — Monitoring / test / review' },
  { value: 'PROCEDURAL_OR_PROMPT_ONLY', label: 'PROCEDURAL_OR_PROMPT_ONLY — Policy or prompt only' },
  { value: 'UNKNOWN', label: 'UNKNOWN — Type unspecified' },
]

const EVIDENCE_STATUS_OPTIONS: { value: ObservedEvidenceStatus; label: string }[] = [
  { value: 'DECLARED_IN_DOC', label: 'DECLARED_IN_DOC' },
  { value: 'NOT_RUN', label: 'NOT_RUN (Specification only)' },
  { value: 'MISSING_UNKNOWN', label: 'MISSING_UNKNOWN' },
]

function emptyMitigation(type: MitigationType = 'PREVENTIVE'): ClaimedMitigation {
  return {
    control: '',
    type,
    code_ref: null,
    evidence_ref: null,
    evidence_status_observed: 'DECLARED_IN_DOC',
  }
}

function QuickClarificationPopover({
  targetId,
  label,
}: {
  targetId: GuidanceTargetId
  label: string
}) {
  const info = failureModeGuidance[targetId]
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="fm-help-trigger"
          aria-label={label}
          title={label}
        >
          <HelpCircle size={14} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="fm-popover" sideOffset={6} align="start">
          <div className="fm-popover-title">{info.title}</div>
          <p>{info.quickClarification}</p>
          <ul>
            {info.detailedQuestions.anchoredLevels.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="fm-popover-note">{info.detailedQuestions.whyNoRpn}</p>
          <Popover.Arrow className="fm-popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function FailureModeRegister({
  entries,
  expandedRowId,
  onExpandedRowChange,
  onChangeEntries,
  onFocusGuidance,
  onNotify,
  onOpenAiAssist,
}: FailureModeRegisterProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [importOpen, setImportOpen] = useState(false)
  const [importMarkdown, setImportMarkdown] = useState('')
  const [importMode, setImportMode] = useState<'replace' | 'append'>('append')
  const [importIssue, setImportIssue] = useState('')
  const [manifest, setManifest] = useState<RepositorySnapshotManifest>()
  const [loadingFile, setLoadingFile] = useState(false)
  const [sourceInspectEntry, setSourceInspectEntry] = useState<FailureModeEntry | null>(null)
  const [mappedInputDrafts, setMappedInputDrafts] = useState<Record<string, string>>({})

  const existingIds = new Set(entries.flatMap((entry) => typeof entry?.id === 'string' ? [entry.id.toUpperCase()] : []))

  function addArchetypePreset(presetId: string) {
    if (!presetId) return
    const archetype = failureModeArchetypes.find((item) => item.id === presetId)
    if (!archetype) return
    if (existingIds.has(archetype.id)) {
      onExpandedRowChange(archetype.id)
      onNotify(`${archetype.id} is already in the Failure Mode Register.`)
      setSelectedPreset('')
      return
    }
    const nextEntry: FailureModeEntry = {
      id: archetype.id,
      archetype_id: archetype.id,
      source: 'USER_DECLARED',
      title: archetype.title,
      trigger_or_cause: '',
      effect_summary: '',
      severity_user: 'UNKNOWN',
      occurrence_inherent: 'UNKNOWN',
      detectability_inherent: 'UNKNOWN',
      mapped_objects: [...archetype.default_mapped_objects],
      claimed_mitigations: [],
      provenance: {
        basis: 'MANUAL_USER_DECLARATION',
        source_unit_ids: [],
        limitations: ['Manual user declaration — no repository source'],
      },
    }
    onChangeEntries([...entries, nextEntry])
    onExpandedRowChange(nextEntry.id)
    onFocusGuidance('failureModes', nextEntry.archetype_id)
    setSelectedPreset('')
  }

  function addCustomFailureMode() {
    const newId = nextCustomFailureModeId(entries)
    if (!newId) { onNotify('No custom failure mode IDs are available.'); return }
    const nextEntry: FailureModeEntry = {
      id: newId,
      archetype_id: null,
      source: 'USER_DECLARED',
      title: '',
      trigger_or_cause: '',
      effect_summary: '',
      severity_user: 'UNKNOWN',
      occurrence_inherent: 'UNKNOWN',
      detectability_inherent: 'UNKNOWN',
      mapped_objects: [],
      claimed_mitigations: [],
      provenance: {
        basis: 'MANUAL_USER_DECLARATION',
        source_unit_ids: [],
        limitations: ['Manual user declaration — no repository source'],
      },
    }
    onChangeEntries([...entries, nextEntry])
    onExpandedRowChange(newId)
    onFocusGuidance('failureModes', null)
  }

  function updateEntry(index: number, patch: Partial<FailureModeEntry>) {
    onChangeEntries(entries.map((item, i) => {
      if (i !== index) return item
      const provenance = item.source === 'DOCUMENT_EXTRACTED' && !item.provenance.limitations.includes('Edited locally after import; source shows the original row.')
        ? { ...item.provenance, limitations: [...item.provenance.limitations, 'Edited locally after import; source shows the original row.'] }
        : item.provenance
      return { ...item, ...patch, provenance }
    }))
  }

  function removeEntry(index: number, id: string) {
    if (!window.confirm(`Remove ${id} from the Failure Mode Register?`)) return
    onChangeEntries(entries.filter((_, i) => i !== index))
    if (expandedRowId === id) onExpandedRowChange(null)
  }

  function updateMitigation(entryIndex: number, mIndex: number, patch: Partial<ClaimedMitigation>) {
    const entry = entries[entryIndex]
    const nextMitigations = entry.claimed_mitigations.map((m, i) => {
      if (i !== mIndex) return m
      const observation = m.evidence_status_observed
      const edited = ['code_ref', 'evidence_ref', 'control', 'type'].some((key) => Object.hasOwn(patch, key))
      const status = edited && (observation === 'OBSERVED_IN_CONFIG' || observation === 'TEST_EVIDENCE_LINKED')
        ? 'DECLARED_IN_DOC' : observation
      return { ...m, evidence_status_observed: status, ...patch }
    })
    updateEntry(entryIndex, { claimed_mitigations: nextMitigations })
  }

  function addMitigation(entryIndex: number) {
    const entry = entries[entryIndex]
    const defaultType =
      entry.archetype_id && failureModeArchetypeMap[entry.archetype_id]
        ? failureModeArchetypeMap[entry.archetype_id].recommended_mitigation_type
        : 'PREVENTIVE'
    updateEntry(entryIndex, {
      claimed_mitigations: [...entry.claimed_mitigations, emptyMitigation(defaultType)],
    })
  }

  function removeMitigation(entryIndex: number, mIndex: number) {
    const entry = entries[entryIndex]
    updateEntry(entryIndex, {
      claimed_mitigations: entry.claimed_mitigations.filter((_, i) => i !== mIndex),
    })
  }

  function handleMappedObjectsChange(entryIndex: number, entryId: string, rawValue: string) {
    setMappedInputDrafts((prev) => ({ ...prev, [entryId]: rawValue }))
    const parsed = rawValue
      .split(/[\s,;]+/)
      .map((token) => token.trim().toUpperCase())
      .filter((token): token is ControlObjectId => CONTROL_OBJECT_ID_REGEX.test(token))
    updateEntry(entryIndex, { mapped_objects: [...new Set(parsed)] })
  }

  async function copyMarkdownTable() {
    if (entries.some((entry) => !failureModeEntrySchema.safeParse(entry).success)) {
      onNotify('Correct invalid rows before copying the Markdown table.')
      return
    }
    const text = createExportTextSanitizer(entries.flatMap((entry) => entry.provenance.excerpt ?? []))
    const markdown = serializeFailureModeRegister(entries.map((entry) => ({
      ...entry, title: text(entry.title), trigger_or_cause: text(entry.trigger_or_cause), effect_summary: text(entry.effect_summary),
      claimed_mitigations: entry.claimed_mitigations.map((m) => ({ ...m, control: text(m.control), code_ref: exportRepoReference(m.code_ref), evidence_ref: exportRepoReference(m.evidence_ref) })),
    })))
    try {
      await navigator.clipboard.writeText(markdown)
      onNotify('Copied Failure Mode Register Markdown table for 02-Risk-and-Impact.md.')
    } catch {
      setImportMarkdown(markdown)
      setImportOpen(true)
      onNotify('Clipboard unavailable — Markdown shown in dialog for manual copy.')
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>, kind: 'markdown' | 'manifest') {
    const file = event.target.files?.[0]
    if (kind === 'manifest') setManifest(undefined)
    if (!file) return
    setImportIssue('')
    if (file.size > 1_000_000) { setImportIssue('File must be at most 1 MB.'); return }
    setLoadingFile(true)
    try {
      const content = await file.text()
      if (kind === 'markdown') setImportMarkdown(content)
      else setManifest(readSnapshotManifest(content))
    } catch {
      setImportIssue(kind === 'manifest' ? 'Invalid snapshot manifest. Check the JSON format in the README.' : 'Could not read the Markdown file.')
    } finally { setLoadingFile(false) }
  }

  function runMarkdownImport() {
    if (importMarkdown.length > 1_000_000) { setImportIssue('Markdown must be at most 1 MB.'); return }
    const result = parseFailureModeRegister(importMarkdown, { manifest })
    if (result.notices.some((notice) => notice !== 'FAILURE_MODE_REGISTER_NOT_FOUND')) {
      setImportIssue(`Import did not change your record. ${result.notices.join(' ')}`)
      return
    }
    const nextEntries = result.entries.length === 0 ? entries : importMode === 'replace' ? result.entries : [...entries, ...result.entries]
    if (new Set(nextEntries.map((entry, index) => entry?.id ?? `invalid-${index}`)).size !== nextEntries.length) {
      setImportIssue('Duplicate failure mode IDs. Correct the table or choose Replace if this is a complete new register.')
      return
    }
    onChangeEntries(nextEntries, {
      filePath: manifest?.filePath ?? 'Documentation/02-Risk-and-Impact.md',
      snapshotHash: manifest?.snapshotHash ?? '', importedAt: new Date().toISOString(), notices: result.notices,
    })
    if (result.entries[0]) {
      onExpandedRowChange(result.entries[0].id)
      setMappedInputDrafts({})
    }
    setManifest(undefined)
    setImportMarkdown('')
    setImportOpen(false)
    setImportIssue('')
    onNotify(result.entries.length ? `Imported ${result.entries.length} failure mode(s) from Markdown.` : 'No failure modes found. Existing rows were kept.')
  }

  return (
    <section
      className="register-section fm-register-section no-print"
      aria-labelledby="failure-mode-register-heading"
      onFocusCapture={() => onFocusGuidance('failureModes')}
    >
      <div className="register-heading">
        <div>
          <div className="mono-label">Evidence-gated FMEA register · failure-mode-register/1.0.0</div>
          <div className="fm-title-inline">
            <h2 id="failure-mode-register-heading" tabIndex={-1}>Failure Mode Register</h2>
            <QuickClarificationPopover
              targetId="failureModes"
              label="Explain anchored Severity, Occurrence, Detectability and why no RPN is used"
            />
          </div>
          <p>{failureModeGuidance.failureModes.essentialInstruction}</p>
        </div>
      </div>

      <div className="fm-toolbar">
        <div className="fm-preset-picker">
          <label htmlFor="fm-archetype-select" className="sr-only">
            Add from archetype preset
          </label>
          <select
            id="fm-archetype-select"
            aria-label="Add from archetype preset"
            value={selectedPreset}
            onChange={(event) => {
              const value = event.target.value
              setSelectedPreset(value)
              if (value) addArchetypePreset(value)
            }}
          >
            <option value="">+ Add from Archetype Preset (FM-01–FM-15)…</option>
            {failureModeArchetypes.map((archetype) => (
              <option key={archetype.id} value={archetype.id}>
                {archetype.id} · {archetype.title}
                {existingIds.has(archetype.id) ? ' (added)' : ''}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="button button-secondary" onClick={addCustomFailureMode}>
          <Plus size={16} aria-hidden="true" />
          Add Custom Failure Mode
        </button>

        <button type="button" className="button button-secondary" onClick={() => setImportOpen(true)}>
          <FileUp size={16} aria-hidden="true" />
          Import 02-Risk-and-Impact.md
        </button>

        <button
          type="button"
          className="button button-quiet"
          onClick={copyMarkdownTable}
          disabled={entries.length === 0}
        >
          <Copy size={15} aria-hidden="true" />
          Copy Markdown Table
        </button>

        {onOpenAiAssist && (
          <button type="button" className="button button-secondary fm-ai-btn" onClick={onOpenAiAssist}>
            <Sparkles size={15} aria-hidden="true" />
            Draft suggestions with AI
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="empty-register">
          <p>
            No failure modes declared yet. Choose a starter archetype (<code>FM-01</code>–<code>FM-15</code>), add a
            custom row (<code>FM-CUSTOM-01</code>), or import an existing <code>02-Risk-and-Impact.md</code> table.
          </p>
        </div>
      ) : (
        <div className="fm-list">
          {entries.map((entry, index) => {
            if (!failureModeEntrySchema.safeParse(entry).success) return (
              <article className="fm-row" tabIndex={-1} id={`fm-row-${entry?.id ?? `invalid-${index}`}`} key={`invalid-${index}`}>
                <p>Invalid row {index + 1}. The original data is still in this draft. Correct the source and reimport, or remove this row.</p>
                <button type="button" className="button button-secondary" onClick={() => removeEntry(index, `invalid row ${index + 1}`)}>Remove invalid row</button>
              </article>
            )
            const isExpanded = expandedRowId === entry.id
            const archetypeHint =
              entry.archetype_id && failureModeArchetypeMap[entry.archetype_id]
                ? failureModeArchetypeMap[entry.archetype_id].guidance_hint
                : null
            const hasNotRun = entry.claimed_mitigations.some((m) => m.evidence_status_observed === 'NOT_RUN')
            const hasBroken = entry.claimed_mitigations.some(
              (m) => m.evidence_status_observed === 'MISSING_UNKNOWN' && (m.code_ref || m.evidence_ref),
            )
            const mappedDisplay = mappedInputDrafts[entry.id] ?? entry.mapped_objects.join(', ')

            return (
              <article
                key={`${entry.id}-${index}`}
                id={`fm-row-${entry.id}`}
                tabIndex={-1}
                className={`fm-row ${isExpanded ? 'is-expanded' : ''}`}
                onFocusCapture={() => onFocusGuidance('failureModes', entry.archetype_id)}
              >
                <div className="fm-row-header">
                  <button
                    type="button"
                    className="fm-expand-btn"
                    aria-expanded={isExpanded}
                    aria-label={`${entry.id} ${entry.title || 'Untitled failure mode'}`}
                    onClick={() => onExpandedRowChange(isExpanded ? null : entry.id)}
                  >
                    {isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    <span className="evidence-id">{entry.id}</span>
                    <span className="fm-row-title">{entry.title || 'Untitled failure mode'}</span>
                  </button>

                  <div className="fm-badges">
                    <span className={`fm-badge fm-sev-${entry.severity_user.toLowerCase()}`}>
                      {entry.severity_user}
                    </span>
                    <span className="fm-badge fm-source">
                      {entry.source === 'DOCUMENT_EXTRACTED'
                        ? 'Imported from 02-Risk-and-Impact.md'
                        : entry.provenance.ai_assistance ? 'AI-assisted · human accepted' : 'User declared'}
                    </span>
                    {hasNotRun && <span className="fm-badge fm-not-run">NOT_RUN</span>}
                    {hasBroken && <span className="fm-badge fm-missing">Missing ref</span>}
                    <button
                      type="button"
                      className="text-button fm-view-source-btn"
                      onClick={() => setSourceInspectEntry(entry)}
                    >
                      <Eye size={14} aria-hidden="true" />
                      View source
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${entry.id}`}
                      onClick={() => removeEntry(index, entry.id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="fm-row-body">
                    {archetypeHint && (
                      <div className="fm-archetype-hint">
                        <strong>Archetype guidance ({entry.archetype_id}):</strong> {archetypeHint}
                      </div>
                    )}

                    <div className="register-grid">
                      <div className="wide-field">
                        <label htmlFor={`fm-${entry.id}-title`}>Failure mode title</label>
                        <input
                          id={`fm-${entry.id}-title`}
                          value={entry.title}
                          onChange={(e) => updateEntry(index, { title: e.target.value })}
                          placeholder="Concise description of what can fail"
                        />
                      </div>

                      <div>
                        <label htmlFor={`fm-${entry.id}-trigger`}>Trigger or cause</label>
                        <textarea
                          id={`fm-${entry.id}-trigger`}
                          rows={2}
                          value={entry.trigger_or_cause}
                          onChange={(e) => updateEntry(index, { trigger_or_cause: e.target.value })}
                          placeholder="Architectural, data, prompt, or operational trigger…"
                        />
                      </div>

                      <div>
                        <label htmlFor={`fm-${entry.id}-effect`}>Effect summary</label>
                        <textarea
                          id={`fm-${entry.id}-effect`}
                          rows={2}
                          value={entry.effect_summary}
                          onChange={(e) => updateEntry(index, { effect_summary: e.target.value })}
                          placeholder="Plausible consequence if failure reaches output or action…"
                        />
                      </div>

                      <div onFocusCapture={() => onFocusGuidance('severity_user', entry.archetype_id)}>
                        <div className="fm-label-row">
                          <label htmlFor={`fm-${entry.id}-severity`}>Severity (anchored user judgement)</label>
                          <QuickClarificationPopover
                            targetId="severity_user"
                            label="Explain anchored Severity levels"
                          />
                        </div>
                        <select
                          id={`fm-${entry.id}-severity`}
                          value={entry.severity_user}
                          onChange={(e) =>
                            updateEntry(index, { severity_user: e.target.value as SeverityUser })
                          }
                        >
                          {SEVERITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div onFocusCapture={() => onFocusGuidance('occurrence_inherent', entry.archetype_id)}>
                        <div className="fm-label-row">
                          <label htmlFor={`fm-${entry.id}-occurrence`}>Inherent occurrence</label>
                          <QuickClarificationPopover
                            targetId="occurrence_inherent"
                            label="Explain Inherent Occurrence levels"
                          />
                        </div>
                        <select
                          id={`fm-${entry.id}-occurrence`}
                          value={entry.occurrence_inherent}
                          onChange={(e) =>
                            updateEntry(index, {
                              occurrence_inherent: e.target.value as OccurrenceInherent,
                            })
                          }
                        >
                          {OCCURRENCE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div onFocusCapture={() => onFocusGuidance('detectability_inherent', entry.archetype_id)}>
                        <div className="fm-label-row">
                          <label htmlFor={`fm-${entry.id}-detectability`}>Inherent detectability</label>
                          <QuickClarificationPopover
                            targetId="detectability_inherent"
                            label="Explain Inherent Detectability levels"
                          />
                        </div>
                        <select
                          id={`fm-${entry.id}-detectability`}
                          value={entry.detectability_inherent}
                          onChange={(e) =>
                            updateEntry(index, {
                              detectability_inherent: e.target.value as DetectabilityInherent,
                            })
                          }
                        >
                          {DETECTABILITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor={`fm-${entry.id}-mapped`}>Mapped Solution Assurance controls</label>
                        <input
                          id={`fm-${entry.id}-mapped`}
                          value={mappedDisplay}
                          onChange={(e) => handleMappedObjectsChange(index, entry.id, e.target.value)}
                          placeholder="B4, D1, AP-B4, AP-D1"
                          spellCheck={false}
                        />
                      </div>
                    </div>

                    <div
                      className="fm-mitigations"
                      onFocusCapture={() => onFocusGuidance('claimed_mitigations', entry.archetype_id)}
                    >
                      <div className="fm-mitigations-header">
                        <div className="fm-label-row">
                          <h4>Claimed mitigations &amp; Q2/Q3 references</h4>
                          <QuickClarificationPopover
                            targetId="claimed_mitigations"
                            label="Explain mitigation types and Q1/Q2/Q3 separation"
                          />
                        </div>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => addMitigation(index)}
                        >
                          <Plus size={14} aria-hidden="true" />
                          Add mitigation
                        </button>
                      </div>

                      {entry.claimed_mitigations.length === 0 ? (
                        <p className="fm-empty-mitigations">
                          No claimed mitigations recorded. HIGH/CRITICAL entries without PREVENTIVE or DETECTIVE
                          controls are flagged as honest gaps for review.
                        </p>
                      ) : (
                        entry.claimed_mitigations.map((mitigation, mIndex) => (
                          <div className="fm-mitigation-card" key={`${entry.id}-mit-${mIndex}`}>
                            <div className="fm-mitigation-head">
                              <span className="mono-label">Control {mIndex + 1}</span>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Remove mitigation ${mIndex + 1} from ${entry.id}`}
                                onClick={() => removeMitigation(index, mIndex)}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </div>
                            <div className="register-grid">
                              <div className="wide-field">
                                <label htmlFor={`fm-${entry.id}-m-${mIndex}-control`}>Control description (Q1)</label>
                                <input
                                  id={`fm-${entry.id}-m-${mIndex}-control`}
                                  value={mitigation.control}
                                  onChange={(e) =>
                                    updateMitigation(index, mIndex, { control: e.target.value })
                                  }
                                  placeholder="e.g. Query-time tenant RBAC filter + pre-call DLP regex"
                                />
                              </div>

                              <div>
                                <label htmlFor={`fm-${entry.id}-m-${mIndex}-type`}>Mitigation type</label>
                                <select
                                  id={`fm-${entry.id}-m-${mIndex}-type`}
                                  value={mitigation.type}
                                  onChange={(e) =>
                                    updateMitigation(index, mIndex, {
                                      type: e.target.value as MitigationType,
                                    })
                                  }
                                >
                                  {MITIGATION_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label htmlFor={`fm-${entry.id}-m-${mIndex}-status`}>
                                  Observed evidence status
                                </label>
                                <select
                                  id={`fm-${entry.id}-m-${mIndex}-status`}
                                  value={mitigation.evidence_status_observed}
                                  onChange={(e) =>
                                    updateMitigation(index, mIndex, {
                                      evidence_status_observed: e.target.value as ObservedEvidenceStatus,
                                    })
                                  }
                                >
                                  {(mitigation.evidence_status_observed === 'OBSERVED_IN_CONFIG' || mitigation.evidence_status_observed === 'TEST_EVIDENCE_LINKED') && (
                                    <option value={mitigation.evidence_status_observed} disabled>{mitigation.evidence_status_observed} (from snapshot)</option>
                                  )}
                                  {EVIDENCE_STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label htmlFor={`fm-${entry.id}-m-${mIndex}-code`}>Code / config ref (Q2)</label>
                                <input
                                  id={`fm-${entry.id}-m-${mIndex}-code`}
                                  value={mitigation.code_ref ?? ''}
                                  onChange={(e) =>
                                    updateMitigation(index, mIndex, {
                                      code_ref: e.target.value.trim() ? e.target.value : null,
                                    })
                                  }
                                  placeholder="src/services/retrievalFilter.ts"
                                  spellCheck={false}
                                />
                              </div>

                              <div>
                                <label htmlFor={`fm-${entry.id}-m-${mIndex}-evidence`}>Evidence ref (Q3)</label>
                                <input
                                  id={`fm-${entry.id}-m-${mIndex}-evidence`}
                                  value={mitigation.evidence_ref ?? ''}
                                  onChange={(e) =>
                                    updateMitigation(index, mIndex, {
                                      evidence_ref: e.target.value.trim() ? e.target.value : null,
                                    })
                                  }
                                  placeholder="Documentation/evidence/rag-rbac-isolation-test.json"
                                  spellCheck={false}
                                />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* Import / Copy Markdown Dialog */}
      <Dialog.Root open={importOpen} onOpenChange={setImportOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content fm-dialog-wide">
            <div className="fm-dialog-header">
              <Dialog.Title>Import or inspect 02-Risk-and-Impact.md</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="icon-button" aria-label="Close import dialog">
                  <X size={16} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description>
              Paste the contents of <code>Documentation/02-Risk-and-Impact.md</code> or upload a local Markdown file.
              No scripts are executed and external URLs or <code>../</code> traversal paths are rejected.
            </Dialog.Description>
            <div className="fm-import-controls">
              <label className="fm-file-label">
                <span>Load local .md file</span>
                <input type="file" accept=".md,text/markdown,text/plain" disabled={loadingFile} onChange={(event) => void handleFileUpload(event, 'markdown')} />
              </label>
              <label className="fm-file-label">
                <span>Load optional snapshot manifest (.json)</span>
                <input type="file" accept=".json,application/json" disabled={loadingFile} onChange={(event) => void handleFileUpload(event, 'manifest')} />
              </label>
              <label className="fm-mode-select">
                <span>Import mode</span>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'replace' | 'append')}
                >
                  <option value="replace">Replace current Failure Mode Register</option>
                  <option value="append">Append parsed rows</option>
                </select>
              </label>
            </div>
            <textarea
              className="fm-import-textarea"
              rows={9}
              aria-label="02-Risk-and-Impact.md content"
              value={importMarkdown}
              onChange={(e) => setImportMarkdown(e.target.value)}
              placeholder="## Failure Mode Register&#10;&#10;| ID | Failure Mode | Severity | Trigger / Cause | Planned Mitigation (Type) | Code / Evidence Ref |&#10;|---|---|---|---|---|---|"
            />
            {importIssue && <p role="alert">{importIssue}</p>}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="button button-secondary">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="button button-primary"
                onClick={runMarkdownImport}
                disabled={!importMarkdown.trim() || loadingFile}
              >
                Parse &amp; Import Table
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Layer 4: View Source Dialog */}
      <Dialog.Root open={Boolean(sourceInspectEntry)} onOpenChange={(open) => !open && setSourceInspectEntry(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content fm-dialog-wide">
            <div className="fm-dialog-header">
              <Dialog.Title>Source &amp; Provenance · {sourceInspectEntry?.id}</Dialog.Title>
              <Dialog.Description>Original declaration and recorded limits. References are not proof of effectiveness.</Dialog.Description>
              <Dialog.Close asChild>
                <button type="button" className="icon-button" aria-label="Close source dialog">
                  <X size={16} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
            {sourceInspectEntry && (
              <div className="fm-source-body">
                {sourceInspectEntry.source === 'USER_DECLARED' ? (
                  <p className="fm-source-manual">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>{sourceInspectEntry.provenance.ai_assistance
                      ? `AI-assisted draft accepted by the user · ${sourceInspectEntry.provenance.ai_assistance.model} · no repository source`
                      : 'Manual user declaration — no repository source'}</span>
                  </p>
                ) : (
                  <>
                    <dl className="summary-meta">
                      <div>
                        <dt>Provenance basis</dt>
                        <dd>{sourceInspectEntry.provenance.basis}</dd>
                      </div>
                      <div>
                        <dt>File path</dt>
                        <dd>{sourceInspectEntry.provenance.file_path || 'Documentation/02-Risk-and-Impact.md'}</dd>
                      </div>
                      <div>
                        <dt>Line locators</dt>
                        <dd>{sourceInspectEntry.provenance.source_unit_ids.join(', ') || 'None'}</dd>
                      </div>
                      <div>
                        <dt>Snapshot hash</dt>
                        <dd>{sourceInspectEntry.provenance.snapshot_hash || 'Direct Markdown paste / upload'}</dd>
                      </div>
                    </dl>
                    {sourceInspectEntry.provenance.excerpt && (
                      <div className="fm-source-excerpt">
                        <div className="mono-label">Extracted row excerpt</div>
                        <pre>{sourceInspectEntry.provenance.excerpt}</pre>
                      </div>
                    )}
                  </>
                )}

                {sourceInspectEntry.provenance.limitations.length > 0 && (
                  <div className="fm-source-limitations">
                    <div className="mono-label">Extraction / provenance limitations</div>
                    <ul>
                      {sourceInspectEntry.provenance.limitations.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
