import { useEffect, useMemo, useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import {
  ArrowLeft, ArrowRight, Check, Download, FileText, Info, Plus, Printer,
  RotateCcw, ShieldCheck, Trash2,
} from 'lucide-react'
import './App.css'
import { QuestionField } from './components/QuestionField'
import { SummaryDocument } from './components/SummaryDocument'
import { evidenceBasisLabels, lifecycleLabels, sections, verificationLabels } from './data/sections'
import {
  createBlankAssessment, displayDate, loadAssessment, nextDataSourceId, nextEvidenceId,
  overallStats, sectionStats, STORAGE_KEY, unresolvedEvidenceRefs, updateRecord,
} from './lib/assessment'
import type { Assessment, DataSourceItem, EvidenceItem, SectionDefinition } from './types/assessment'

type StepId = SectionDefinition['id'] | 'evidence' | 'review'

const steps: { id: StepId; number: string; label: string }[] = [
  { id: 'setup', number: '00', label: 'Record setup' },
  { id: 'purpose', number: '01', label: 'Purpose & output' },
  { id: 'impact', number: '02', label: 'Impact & risk context' },
  { id: 'permission', number: '03', label: 'Permission & data' },
  { id: 'evidence', number: '04', label: 'Evidence register' },
  { id: 'review', number: '05', label: 'Review & export' },
]

const emptyEvidence = (id: string): EvidenceItem => ({
  id, title: '', reference: '', type: 'Policy / standard', basis: 'DECLARED', verification: 'UNVERIFIED', owner: '', scope: '', transmission: '',
})

const emptyDataSource = (id: string): DataSourceItem => ({
  id, name: '', owner: '', categories: '', usageRights: '', quality: '', restrictions: '',
})

export default function App() {
  const [record, setRecord] = useState<Assessment>(loadAssessment)
  const [activeStep, setActiveStep] = useState<StepId>('setup')
  const [reviewChecked, setReviewChecked] = useState(false)
  const [saveState, setSaveState] = useState('Saved in this browser')
  const [notice, setNotice] = useState('')
  const [resetOpen, setResetOpen] = useState(false)

  const stats = useMemo(() => overallStats(record), [record])
  const unresolvedRefs = useMemo(() => unresolvedEvidenceRefs(record), [record])
  const knownEvidenceIds = useMemo(() => new Set(record.evidence.map((item) => item.id)), [record.evidence])
  const currentIndex = steps.findIndex((step) => step.id === activeStep)
  const currentSection = sections.find((section) => section.id === activeStep)
  const solutionName = record.answers.solutionName?.trim() || 'Untitled solution'
  const canConfirm = Boolean(record.answers.solutionName?.trim() && record.answers.recordOwner?.trim() && record.answers.lifecycleStage && reviewChecked)

  useEffect(() => {
    let saved = true
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
      saved = false
    }
    const timer = window.setTimeout(() => {
      setSaveState(saved ? 'Saved in this browser' : 'Browser save unavailable — export your summary')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [record])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  function changeAnswer(fieldId: string, value: string) {
    setRecord((previous) => updateRecord(previous, { answers: { ...previous.answers, [fieldId]: value } }))
  }

  function changeEvidenceRef(fieldId: string, value: string) {
    setRecord((previous) => updateRecord(previous, { evidenceRefs: { ...previous.evidenceRefs, [fieldId]: value } }))
  }

  function changeNotApplicable(fieldId: string, value?: { rationale: string; owner: string }) {
    setRecord((previous) => {
      const next = { ...previous.notApplicable }
      if (value) next[fieldId] = value
      else delete next[fieldId]
      return updateRecord(previous, { notApplicable: next })
    })
  }

  function addEvidence() {
    setRecord((previous) => updateRecord(previous, { evidence: [...previous.evidence, emptyEvidence(nextEvidenceId(previous.evidence))] }))
  }

  function changeEvidence(id: string, patch: Partial<EvidenceItem>) {
    setRecord((previous) => updateRecord(previous, { evidence: previous.evidence.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  }

  function removeEvidence(id: string) {
    if (!window.confirm(`Remove ${id} from the evidence register? Answers that reference it will show an unresolved reference.`)) return
    setRecord((previous) => updateRecord(previous, { evidence: previous.evidence.filter((item) => item.id !== id) }))
  }

  function addDataSource() {
    setRecord((previous) => updateRecord(previous, { dataSources: [...previous.dataSources, emptyDataSource(nextDataSourceId(previous.dataSources))] }))
  }

  function changeDataSource(id: string, patch: Partial<DataSourceItem>) {
    setRecord((previous) => updateRecord(previous, { dataSources: previous.dataSources.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  }

  function removeDataSource(id: string) {
    if (!window.confirm(`Remove ${id} from the data source register?`)) return
    setRecord((previous) => updateRecord(previous, { dataSources: previous.dataSources.filter((item) => item.id !== id) }))
  }

  function goToStep(step: StepId) {
    setActiveStep(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function confirmDocumentation() {
    if (!canConfirm) return
    const confirmedAt = new Date().toISOString()
    setRecord((previous) => ({
      ...previous,
      version: previous.version + 1,
      confirmation: { confirmedAt, version: previous.version + 1 },
      updatedAt: confirmedAt,
    }))
    setReviewChecked(false)
    setNotice('Documentation snapshot confirmed. This is not an approval.')
  }

  async function downloadSummary() {
    try {
      const { createStandaloneSummary } = await import('./lib/exportSummary')
      const html = createStandaloneSummary(record)
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const safeName = solutionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled-solution'
      anchor.href = url
      anchor.download = `${safeName}-assessment-record.html`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Standalone HTML summary downloaded.')
    } catch {
      setNotice('HTML export could not be created. Use Print / Save as PDF instead.')
    }
  }

  function startBlank() {
    setRecord(createBlankAssessment())
    setReviewChecked(false)
    setResetOpen(false)
    setActiveStep('setup')
    setNotice('A new blank record is ready.')
  }

  return (
    <div className="app-shell">
      <a className="skip-link no-print" href="#main-content">Skip to main content</a>
      <header className="app-header no-print">
        <div className="brand-block">
          <div className="brand-name">Solution Assurance</div>
          <div className="brand-product">Documentation Workspace</div>
        </div>
        <div className="header-context">
          <span className="draft-badge">UI draft · 0.1</span>
          <span>Purpose & Permission</span>
        </div>
        <div className="header-actions">
          <span className="save-state" role="status"><span className="save-dot" />{saveState}</span>
          <AlertDialog.Root open={resetOpen} onOpenChange={setResetOpen}>
            <AlertDialog.Trigger asChild>
              <button className="button button-quiet" type="button"><RotateCcw size={16} aria-hidden="true" />Start blank</button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="dialog-overlay" />
              <AlertDialog.Content className="dialog-content">
                <AlertDialog.Title>Start a blank record?</AlertDialog.Title>
                <AlertDialog.Description>This replaces the current browser draft. Download the HTML summary first if you need to retain it.</AlertDialog.Description>
                <div className="dialog-actions">
                  <AlertDialog.Cancel asChild><button type="button" className="button button-secondary">Keep current record</button></AlertDialog.Cancel>
                  <AlertDialog.Action asChild><button type="button" className="button button-danger" onClick={startBlank}>Start blank</button></AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
          <button className="button button-secondary" type="button" onClick={() => goToStep('review')}><FileText size={16} aria-hidden="true" />Review & export</button>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="workspace-sidebar no-print" aria-label="Assessment sections">
          <div className="record-identity">
            <div className="mono-label">Current record</div>
            <h2>{solutionName}</h2>
            <p>{lifecycleLabels[record.answers.lifecycleStage] || 'Lifecycle stage not selected'}</p>
            <span className={`record-status ${record.confirmation ? 'is-confirmed' : ''}`}>{record.confirmation ? `Confirmed · v${record.confirmation.version}` : 'Draft'}</span>
          </div>
          <nav className="step-nav">
            {steps.map((step) => {
              const stepStats = sections.some((section) => section.id === step.id) ? sectionStats(record, step.id) : null
              return (
                <button
                  key={step.id}
                  type="button"
                  className={`step-button ${activeStep === step.id ? 'active' : ''}`}
                  onClick={() => goToStep(step.id)}
                  aria-current={activeStep === step.id ? 'step' : undefined}
                >
                  <span className="step-number">{step.number}</span>
                  <span className="step-label">{step.label}</span>
                  {stepStats && <span className="step-count">{stepStats.answered + stepStats.notApplicable}/{stepStats.total}</span>}
                  {step.id === 'evidence' && <span className="step-count">{record.evidence.length}</span>}
                </button>
              )
            })}
          </nav>
          <div className="later-layers">
            <div className="mono-label">Later documentation layers</div>
            <p>Architecture & data lifecycle</p>
            <p>Requirements & validation</p>
            <p>Operation & reassessment</p>
          </div>
          <div className="local-notice"><Info size={15} aria-hidden="true" /><p>This draft stores data only in this browser. Clearing browser data removes it. No content is sent to Saidot, the Engine or an AI service.</p></div>
        </aside>

        <main className="main-content" id="main-content">
          {currentSection && (
            <>
              <div className="section-intro no-print">
                <div className="eyebrow">Step {currentSection.number} · Frame Purpose and Permission</div>
                <h1>{currentSection.title}</h1>
                <p>{currentSection.description}</p>
              </div>
              <div className="guidance-note no-print"><Info size={18} aria-hidden="true" /><p>{currentSection.guidance}</p></div>
              <div className="question-list no-print">
                {currentSection.fields.map((field) => (
                  <QuestionField
                    key={field.id}
                    field={field}
                    value={record.answers[field.id] ?? ''}
                    evidenceValue={record.evidenceRefs[field.id] ?? ''}
                    notApplicable={record.notApplicable[field.id]}
                    knownEvidenceIds={knownEvidenceIds}
                    allowNotApplicable={currentSection.id !== 'setup'}
                    onChange={(value) => changeAnswer(field.id, value)}
                    onEvidenceChange={(value) => changeEvidenceRef(field.id, value)}
                    onNotApplicableChange={(value) => changeNotApplicable(field.id, value)}
                  />
                ))}
              </div>
              {currentSection.id === 'permission' && (
                <section className="register-section no-print" aria-labelledby="data-source-heading">
                  <div className="register-heading">
                    <div><div className="mono-label">Structured register</div><h2 id="data-source-heading">Data sources</h2><p>Register sources already known at this stage. Use evidence IDs in the answers above where support is available.</p></div>
                    <button type="button" className="button button-secondary" onClick={addDataSource}><Plus size={16} aria-hidden="true" />Add data source</button>
                  </div>
                  {record.dataSources.length === 0 ? (
                    <div className="empty-register"><p>No data sources registered. Add only sources known to the current solution design.</p><button type="button" className="text-button" onClick={addDataSource}>Add the first source <ArrowRight size={14} aria-hidden="true" /></button></div>
                  ) : record.dataSources.map((source) => (
                    <div className="register-item" key={source.id}>
                      <div className="register-item-heading"><h3>{source.id}</h3><button type="button" className="icon-button" onClick={() => removeDataSource(source.id)} aria-label={`Remove ${source.id}`}><Trash2 size={16} aria-hidden="true" /></button></div>
                      <div className="register-grid">
                        <div><label htmlFor={`${source.id}-name`}>Source name</label><input id={`${source.id}-name`} value={source.name} onChange={(event) => changeDataSource(source.id, { name: event.target.value })} placeholder="System, dataset or document collection" /></div>
                        <div><label htmlFor={`${source.id}-owner`}>Owner / controller</label><input id={`${source.id}-owner`} value={source.owner} onChange={(event) => changeDataSource(source.id, { owner: event.target.value })} placeholder="Person, team or organisation" /></div>
                        <div className="wide-field"><label htmlFor={`${source.id}-categories`}>Data categories</label><textarea id={`${source.id}-categories`} rows={2} value={source.categories} onChange={(event) => changeDataSource(source.id, { categories: event.target.value })} placeholder="Content, personal data, confidential or derived categories…" /></div>
                        <div><label htmlFor={`${source.id}-rights`}>Usage rights / basis</label><textarea id={`${source.id}-rights`} rows={2} value={source.usageRights} onChange={(event) => changeDataSource(source.id, { usageRights: event.target.value })} placeholder="Licence, contract, permission or unresolved question…" /></div>
                        <div><label htmlFor={`${source.id}-quality`}>Quality, provenance & currency</label><textarea id={`${source.id}-quality`} rows={2} value={source.quality} onChange={(event) => changeDataSource(source.id, { quality: event.target.value })} placeholder="Origin, controls, update cycle and known limitations…" /></div>
                        <div className="wide-field"><label htmlFor={`${source.id}-restrictions`}>Restrictions</label><textarea id={`${source.id}-restrictions`} rows={2} value={source.restrictions} onChange={(event) => changeDataSource(source.id, { restrictions: event.target.value })} placeholder="Purpose, access, residency, retention or transmission restrictions…" /></div>
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}

          {activeStep === 'evidence' && (
            <div className="no-print">
              <div className="section-intro">
                <div className="eyebrow">Step 04 · Traceable support</div>
                <h1>Evidence register</h1>
                <p>Register source references and keep declared, documented, implemented, tested and observed evidence distinct.</p>
              </div>
              <div className="guidance-note"><ShieldCheck size={18} aria-hidden="true" /><p>This version stores references and metadata, not evidence files. Do not paste secrets, personal data or restricted source content into this browser draft.</p></div>
              <div className="register-heading evidence-heading">
                <div><div className="mono-label">{record.evidence.length} registered {record.evidence.length === 1 ? 'item' : 'items'}</div><h2>Sources supporting this record</h2></div>
                <button type="button" className="button button-primary" onClick={addEvidence}><Plus size={16} aria-hidden="true" />Add evidence</button>
              </div>
              {record.evidence.length === 0 ? (
                <div className="evidence-empty"><FileText size={28} strokeWidth={1.4} aria-hidden="true" /><h2>No evidence registered yet</h2><p>You can still export a draft. Empty answers remain “Not provided”; they are not treated as missing-proof findings.</p><button type="button" className="button button-secondary" onClick={addEvidence}><Plus size={16} aria-hidden="true" />Add the first evidence reference</button></div>
              ) : (
                <div className="evidence-list">
                  {record.evidence.map((item) => (
                    <section className="evidence-item" key={item.id} aria-labelledby={`${item.id}-heading`}>
                      <div className="register-item-heading"><div><span className="evidence-id">{item.id}</span><h3 id={`${item.id}-heading`}>{item.title || 'Untitled evidence'}</h3></div><button type="button" className="icon-button" onClick={() => removeEvidence(item.id)} aria-label={`Remove ${item.id}`}><Trash2 size={16} aria-hidden="true" /></button></div>
                      <div className="register-grid">
                        <div className="wide-field"><label htmlFor={`${item.id}-title`}>Evidence title</label><input id={`${item.id}-title`} value={item.title} onChange={(event) => changeEvidence(item.id, { title: event.target.value })} placeholder="Policy, architecture, contract, test or operational record" /></div>
                        <div className="wide-field"><label htmlFor={`${item.id}-reference`}>Source reference / location</label><input id={`${item.id}-reference`} value={item.reference} onChange={(event) => changeEvidence(item.id, { reference: event.target.value })} placeholder="Document ID, repository path, Saidot reference or controlled location" /></div>
                        <div><label htmlFor={`${item.id}-type`}>Source type</label><select id={`${item.id}-type`} value={item.type} onChange={(event) => changeEvidence(item.id, { type: event.target.value })}>{['Policy / standard', 'Contract / commitment', 'Architecture / design', 'Test / validation', 'Operational record', 'Decision record', 'Other'].map((option) => <option key={option}>{option}</option>)}</select></div>
                        <div><label htmlFor={`${item.id}-owner`}>Evidence owner</label><input id={`${item.id}-owner`} value={item.owner} onChange={(event) => changeEvidence(item.id, { owner: event.target.value })} placeholder="Person or role" /></div>
                        <div><label htmlFor={`${item.id}-basis`}>Evidence basis</label><select id={`${item.id}-basis`} value={item.basis} onChange={(event) => changeEvidence(item.id, { basis: event.target.value })}>{Object.entries(evidenceBasisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                        <div><label htmlFor={`${item.id}-verification`}>Verification state</label><select id={`${item.id}-verification`} value={item.verification} onChange={(event) => changeEvidence(item.id, { verification: event.target.value })}>{Object.entries(verificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                        <div className="wide-field"><label htmlFor={`${item.id}-scope`}>Scope and extraction limitations</label><textarea id={`${item.id}-scope`} rows={2} value={item.scope} onChange={(event) => changeEvidence(item.id, { scope: event.target.value })} placeholder="What this source supports, what it does not cover, and known extraction limits…" /></div>
                        <div className="wide-field"><label htmlFor={`${item.id}-transmission`}>Transmission boundary / handling note</label><textarea id={`${item.id}-transmission`} rows={2} value={item.transmission} onChange={(event) => changeEvidence(item.id, { transmission: event.target.value })} placeholder="Internal only, external transfer restricted, owner permission reference, or not assessed…" /></div>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeStep === 'review' && (
            <>
              <div className="section-intro review-intro no-print">
                <button type="button" className="text-button back-link" onClick={() => goToStep('evidence')}><ArrowLeft size={15} aria-hidden="true" />Evidence register</button>
                <div className="eyebrow">Step 05 · Documentation artefact</div>
                <h1>Review and export</h1>
                <p>Review the record as it will appear in the standalone HTML summary and print/PDF output.</p>
              </div>
              <SummaryDocument record={record} />
            </>
          )}

          {activeStep !== 'review' && (
            <div className="step-footer no-print">
              <button type="button" className="button button-secondary" disabled={currentIndex === 0} onClick={() => goToStep(steps[currentIndex - 1].id)}><ArrowLeft size={16} aria-hidden="true" />Back</button>
              <span>Step {currentIndex + 1} of {steps.length}</span>
              <button type="button" className="button button-primary" onClick={() => goToStep(steps[currentIndex + 1].id)}>{activeStep === 'evidence' ? 'Review summary' : 'Save & continue'}<ArrowRight size={16} aria-hidden="true" /></button>
            </div>
          )}
        </main>

        <aside className={`context-rail no-print ${activeStep === 'review' ? 'export-rail' : ''}`} aria-label={activeStep === 'review' ? 'Export controls' : 'Section guidance'}>
          {activeStep === 'review' ? (
            <>
              <section className="rail-section">
                <div className="mono-label">Documentation coverage</div>
                <div className="coverage-number">{stats.answered + stats.notApplicable}<span> / {stats.total}</span></div>
                <p>{stats.answered} answered · {stats.notApplicable} not applicable</p>
                <div className="coverage-track" aria-hidden="true"><span style={{ width: `${((stats.answered + stats.notApplicable) / stats.total) * 100}%` }} /></div>
                <p className="coverage-open">{stats.open} open documentation {stats.open === 1 ? 'item' : 'items'}, including incomplete not-applicable explanations.</p>
              </section>
              <section className="rail-section">
                <div className="mono-label">Reference integrity</div>
                {unresolvedRefs.length === 0 ? <p className="integrity-ok"><Check size={15} aria-hidden="true" />No unresolved evidence IDs</p> : <div className="integrity-warning"><strong>{unresolvedRefs.length} unresolved {unresolvedRefs.length === 1 ? 'ID' : 'IDs'}</strong><p>{unresolvedRefs.join(', ')}</p><span>Add these IDs to the evidence register or correct the answer references.</span></div>}
              </section>
              <section className="rail-section confirmation-section">
                <div className="mono-label">Human confirmation</div>
                <h2>{record.confirmation ? `Version ${record.confirmation.version} confirmed` : 'Confirm current documentation'}</h2>
                {record.confirmation ? <p>Confirmed {displayDate(record.confirmation.confirmedAt)}. Any subsequent edit returns the record to draft.</p> : <><p>Confirm only that the record reflects currently available information. This does not approve the solution or clear a governance gate.</p><label className="check-label"><input type="checkbox" checked={reviewChecked} onChange={(event) => setReviewChecked(event.target.checked)} /><span>I have reviewed this record and understand its documentation-only status.</span></label></>}
                {!record.confirmation && <button type="button" className="button button-secondary full-button" disabled={!canConfirm} onClick={confirmDocumentation}><Check size={16} aria-hidden="true" />Confirm documentation</button>}
                {!record.confirmation && !record.answers.solutionName?.trim() && <p className="field-warning">A solution name is required.</p>}
                {!record.confirmation && !record.answers.recordOwner?.trim() && <p className="field-warning">A record owner is required.</p>}
              </section>
              <section className="rail-section export-actions">
                <div className="mono-label">Governance artefact</div>
                <button type="button" className="button button-primary full-button" onClick={downloadSummary}><Download size={16} aria-hidden="true" />Download HTML summary</button>
                <button type="button" className="button button-secondary full-button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print / Save as PDF</button>
                <p>Use the browser’s print dialogue and choose “Save as PDF”. The HTML file is standalone and contains no scripts.</p>
              </section>
              <section className="rail-section future-note"><div className="mono-label">Not in this draft</div><p>Clarity scoring, gate-depth analysis, remediation proposals, automated classification and direct Saidot/Engine integration remain later functions.</p></section>
            </>
          ) : (
            <>
              <section className="rail-section record-principles">
                <div className="mono-label">Record principles</div>
                <h2>Describe what is known now.</h2>
                <ul><li>Incomplete information can remain open.</li><li>Not applicable needs a rationale and owner.</li><li>Evidence references support traceability, not automatic verification.</li></ul>
              </section>
              <section className="rail-section">
                <div className="mono-label">Section coverage</div>
                {activeStep === 'evidence' ? <><div className="coverage-number">{record.evidence.length}</div><p>Evidence {record.evidence.length === 1 ? 'reference' : 'references'} registered</p></> : currentSection ? (() => { const currentStats = sectionStats(record, currentSection.id); return <><div className="coverage-number">{currentStats.answered + currentStats.notApplicable}<span> / {currentStats.total}</span></div><p>{currentStats.open} open in this section</p></> })() : null}
              </section>
              {activeStep === 'purpose' && <section className="rail-section"><div className="mono-label">Output roles stay distinct</div><dl className="role-list"><div><dt>Draft</dt><dd>Content for further authoring</dd></div><div><dt>Summary</dt><dd>Condensed representation</dd></div><div><dt>Recommendation</dt><dd>Input to a decision</dd></div><div><dt>Decision</dt><dd>Determines an outcome</dd></div><div><dt>Action</dt><dd>Initiates or executes change</dd></div></dl></section>}
              {activeStep === 'impact' && <section className="rail-section"><div className="mono-label">Separate judgements</div><p>Solution risk, AI Act classification, requirement level A/B/C and assurance status are different outcomes. This workspace records existing sources; it does not derive them.</p></section>}
              {activeStep === 'permission' && <section className="rail-section"><div className="mono-label">Permission boundary</div><p>State the authority, basis and scope behind permission. Do not treat a completed field as legal, customer or information-security approval.</p></section>}
              {activeStep === 'evidence' && <section className="rail-section"><div className="mono-label">Evidence dimensions</div><p><strong>Basis</strong> describes what kind of support exists. <strong>Verification</strong> records its checking state. Neither is an assurance result.</p></section>}
              <section className="rail-section last-updated"><div className="mono-label">Last local update</div><p>{displayDate(record.updatedAt)}</p></section>
            </>
          )}
        </aside>
      </div>

      {notice && <div className="toast no-print" role="status">{notice}</div>}
    </div>
  )
}
