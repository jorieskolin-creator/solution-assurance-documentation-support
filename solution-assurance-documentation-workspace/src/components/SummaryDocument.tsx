import { evidenceBasisLabels, lifecycleLabels, sections, verificationLabels } from '../data/sections'
import { displayDate, overallStats, valueLabel } from '../lib/assessment'
import type { Assessment } from '../types/assessment'

function FieldValue({ record, fieldId, label }: { record: Assessment; fieldId: string; label: string }) {
  const na = record.notApplicable[fieldId]
  const answer = record.answers[fieldId]?.trim()
  const refs = record.evidenceRefs[fieldId]?.trim()
  return (
    <div className="summary-field">
      <h4>{label}</h4>
      {na ? (
        <div className="summary-na">
          <p><strong>Not applicable.</strong> {na.rationale || 'Rationale not provided.'}</p>
          <small>Scope decision owner: {na.owner || 'Not provided'}</small>
        </div>
      ) : (
        <p className={answer ? '' : 'summary-missing'}>{answer ? valueLabel(fieldId, answer) : 'Not provided'}</p>
      )}
      {refs && <small>Evidence: {refs}</small>}
    </div>
  )
}

export function SummaryDocument({ record }: { record: Assessment }) {
  const stats = overallStats(record)
  const solutionName = record.answers.solutionName?.trim() || 'Untitled solution'
  return (
    <article className="summary-document" id="summary-print" aria-label="AI Solution Assessment Record">
      <header className="summary-header">
        <div className="summary-brand">SOLUTION ASSURANCE · DOCUMENTATION WORKSPACE</div>
        <h1>AI Solution Assessment Record</h1>
        <p className="summary-subtitle">Purpose, impact, permission and evidence · Frame Purpose and Permission</p>
        <div className="summary-title-row">
          <h2>{solutionName}</h2>
          <span className={`summary-status ${record.confirmation ? 'confirmed' : ''}`}>
            {record.confirmation ? `Confirmed documentation · v${record.confirmation.version}` : 'Draft · unconfirmed'}
          </span>
        </div>
        <p className="summary-boundary">This record documents information available at the time of completion. It is not an approval, legal conclusion, risk acceptance, gate decision or assurance finding.</p>
      </header>

      <section className="summary-section">
        <h3>Record identity</h3>
        <dl className="summary-meta">
          <div><dt>Record owner</dt><dd>{record.answers.recordOwner || 'Not provided'}</dd></div>
          <div><dt>Lifecycle stage</dt><dd>{lifecycleLabels[record.answers.lifecycleStage] || 'Not selected'}</dd></div>
          <div><dt>Business / customer context</dt><dd>{record.answers.businessUnit || 'Not provided'}</dd></div>
          <div><dt>Last updated</dt><dd>{displayDate(record.updatedAt)}</dd></div>
          <div><dt>Saidot reference</dt><dd>{record.answers.saidotReference || 'Not provided'}</dd></div>
          <div><dt>Engine reference</dt><dd>{record.answers.engineReference || 'Not provided'}</dd></div>
          <div><dt>Confirmed at</dt><dd>{record.confirmation ? displayDate(record.confirmation.confirmedAt) : 'Not confirmed'}</dd></div>
          <div><dt>Documentation coverage</dt><dd>{stats.answered} answered · {stats.notApplicable} not applicable · {stats.open} open</dd></div>
        </dl>
      </section>

      {sections.filter((section) => section.id !== 'setup').map((section) => (
        <section className="summary-section" key={section.id}>
          <div className="summary-section-number">{section.number}</div>
          <h3>{section.title}</h3>
          <p className="summary-section-description">{section.description}</p>
          <div className="summary-fields">
            {section.fields.map((field) => <FieldValue key={field.id} record={record} fieldId={field.id} label={field.label} />)}
          </div>
        </section>
      ))}

      <section className="summary-section">
        <h3>Data source register</h3>
        {record.dataSources.length === 0 ? <p className="summary-missing">No data sources registered.</p> : record.dataSources.map((source) => (
          <div className="summary-register-item" key={source.id}>
            <h4>{source.id} · {source.name || 'Unnamed source'}</h4>
            <dl className="summary-register-grid">
              <div><dt>Owner</dt><dd>{source.owner || 'Not provided'}</dd></div>
              <div><dt>Data categories</dt><dd>{source.categories || 'Not provided'}</dd></div>
              <div><dt>Usage rights</dt><dd>{source.usageRights || 'Not provided'}</dd></div>
              <div><dt>Quality / provenance / currency</dt><dd>{source.quality || 'Not provided'}</dd></div>
              <div><dt>Restrictions</dt><dd>{source.restrictions || 'Not provided'}</dd></div>
            </dl>
          </div>
        ))}
      </section>

      <section className="summary-section">
        <h3>Evidence register</h3>
        <p className="summary-section-description">Evidence references identify source material; they do not transform declared information into observed or verified facts.</p>
        {record.evidence.length === 0 ? <p className="summary-missing">No evidence registered.</p> : record.evidence.map((item) => (
          <div className="summary-register-item" key={item.id}>
            <h4>{item.id} · {item.title || 'Untitled evidence'}</h4>
            <p>{item.reference || 'Source reference not provided'}</p>
            <dl className="summary-register-grid">
              <div><dt>Type</dt><dd>{item.type || 'Not provided'}</dd></div>
              <div><dt>Evidence basis</dt><dd>{evidenceBasisLabels[item.basis] || 'Not provided'}</dd></div>
              <div><dt>Verification</dt><dd>{verificationLabels[item.verification] || 'Not provided'}</dd></div>
              <div><dt>Owner</dt><dd>{item.owner || 'Not provided'}</dd></div>
              <div><dt>Scope / limitations</dt><dd>{item.scope || 'Not provided'}</dd></div>
              <div><dt>Transmission note</dt><dd>{item.transmission || 'Not assessed'}</dd></div>
            </dl>
          </div>
        ))}
      </section>

      <footer className="summary-footer">
        <p>Generated by Solution Assurance Documentation Workspace · schema documentation-workspace-0.1</p>
        <p>Direct Saidot or Solution Assurance Engine integration is not included. Upload or transfer this artefact through the applicable governance process.</p>
      </footer>
    </article>
  )
}
