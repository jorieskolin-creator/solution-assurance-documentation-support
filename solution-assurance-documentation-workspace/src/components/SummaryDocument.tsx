import { evidenceBasisLabels, lifecycleLabels, sections, verificationLabels } from '../data/sections'
import { displayDate, overallStats, valueLabel } from '../lib/assessment'
import { DOCUMENTATION_BOUNDARY, prepareSummaryExport, type PreparedSummary } from '../lib/docSupportHandoff'
import type { RepositorySnapshotManifest } from '../lib/failureModeMarkdown'
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

export function SummaryDocument({ record, manifest }: { record: Assessment; manifest?: RepositorySnapshotManifest }) {
  return <PreparedSummaryDocument summary={prepareSummaryExport(record, manifest)} />
}

export function PreparedSummaryDocument({ summary }: { summary: PreparedSummary }) {
  const { record, validation } = summary
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
        <p className="summary-boundary">{DOCUMENTATION_BOUNDARY}</p>
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

      <section className="summary-section" aria-labelledby="summary-failure-modes">
        <div className="summary-section-number">02 · Risk and impact (continued)</div>
        <h3 id="summary-failure-modes">Failure Mode Register</h3>
        <p className="summary-section-description">Declared failure modes, claimed mitigations and evidence status. These are not assurance findings.</p>
        {record.failureModeImport && (
          <dl className="summary-register-grid">
            <div><dt>Imported from</dt><dd>{record.failureModeImport.filePath || 'Not recorded'}</dd></div>
            <div><dt>Snapshot hash</dt><dd>{record.failureModeImport.snapshotHash || 'Not recorded'}</dd></div>
            <div><dt>Imported at</dt><dd>{displayDate(record.failureModeImport.importedAt)}</dd></div>
            <div><dt>Import notices</dt><dd>{record.failureModeImport.notices.join(', ') || 'None'}</dd></div>
          </dl>
        )}
        {record.failureModes.length === 0 ? (
          <p className="summary-missing">{validation.canExportHandoff ? 'No failure modes registered.' : 'No valid failure mode rows to display.'}</p>
        ) : record.failureModes.map((row, index) => (
          <div className="summary-register-item" data-failure-mode-id={row.id} key={`${row.id}-${index}`}>
            <h4>{row.id} · {row.title || 'Untitled failure mode'}</h4>
            <dl className="summary-register-grid">
              <div><dt>Trigger / cause</dt><dd>{row.trigger_or_cause || 'Not provided'}</dd></div>
              <div><dt>Effect</dt><dd>{row.effect_summary || 'Not provided'}</dd></div>
              <div><dt>Severity</dt><dd>{row.severity_user}</dd></div>
              <div><dt>Inherent occurrence</dt><dd>{row.occurrence_inherent}</dd></div>
              <div><dt>Inherent detectability</dt><dd>{row.detectability_inherent}</dd></div>
              <div><dt>Mapped controls</dt><dd>{row.mapped_objects.join(', ') || 'None'}</dd></div>
              <div><dt>Source / archetype</dt><dd>{row.source} · {row.archetype_id || 'Custom'}</dd></div>
              {row.provenance.ai_assistance && <div><dt>AI assistance (human accepted)</dt><dd>{row.provenance.ai_assistance.model} · {row.provenance.ai_assistance.suggestionId} · {row.provenance.ai_assistance.acceptedAt}</dd></div>}
              <div><dt>Provenance basis</dt><dd>{row.provenance.basis}</dd></div>
              <div><dt>Source units</dt><dd>{row.provenance.source_unit_ids.join(', ') || 'None'}</dd></div>
              <div><dt>Source file</dt><dd>{row.provenance.file_path || 'Not recorded'}</dd></div>
              <div><dt>Snapshot hash</dt><dd>{row.provenance.snapshot_hash || 'Not recorded'}</dd></div>
              <div><dt>Limitations</dt><dd>{row.provenance.limitations.join('\n') || 'None recorded'}</dd></div>
            </dl>
            <h5>Claimed mitigations</h5>
            {row.claimed_mitigations.length === 0 ? <p className="summary-missing">No mitigations declared.</p> : row.claimed_mitigations.map((mitigation, i) => (
              <dl className="summary-register-grid" key={i}>
                <div><dt>Control / type</dt><dd>{mitigation.control || 'Unnamed control'} · {mitigation.type}</dd></div>
                <div><dt>Evidence status</dt><dd>{mitigation.evidence_status_observed}</dd></div>
                <div><dt>Code reference</dt><dd>{mitigation.code_ref || 'Not recorded'}</dd></div>
                <div><dt>Evidence reference</dt><dd>{mitigation.evidence_ref || 'Not recorded'}</dd></div>
              </dl>
            ))}
          </div>
        ))}
        <h4>Outstanding failure mode work</h4>
        {!validation.canExportHandoff && <p>Machine handoff blocked. The printable record is still available.</p>}
        {validation.findings.length === 0 ? <p>No failure mode gaps recorded.</p> : (
          <ul>{validation.findings.map((finding) => (
            <li key={finding.id}><strong>{finding.title}</strong> ({finding.code}): {finding.message} {finding.permittedNextAction}</li>
          ))}</ul>
        )}
      </section>

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

