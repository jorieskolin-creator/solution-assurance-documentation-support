import { Link2, RotateCcw } from 'lucide-react'
import type { QuestionDefinition } from '../types/assessment'
import { parseEvidenceRefs } from '../lib/assessment'

interface QuestionFieldProps {
  field: QuestionDefinition
  value: string
  evidenceValue: string
  notApplicable?: { rationale: string; owner: string }
  knownEvidenceIds: Set<string>
  allowNotApplicable: boolean
  onChange: (value: string) => void
  onEvidenceChange: (value: string) => void
  onNotApplicableChange: (value?: { rationale: string; owner: string }) => void
}

export function QuestionField({
  field,
  value,
  evidenceValue,
  notApplicable,
  knownEvidenceIds,
  allowNotApplicable,
  onChange,
  onEvidenceChange,
  onNotApplicableChange,
}: QuestionFieldProps) {
  const inputId = `field-${field.id}`
  const evidenceId = `evidence-${field.id}`
  const unknownRefs = parseEvidenceRefs(evidenceValue).filter((id) => !knownEvidenceIds.has(id))
  const invalidNa = Boolean(notApplicable && (!notApplicable.rationale.trim() || !notApplicable.owner.trim()))

  return (
    <div className={`question ${notApplicable ? 'question-na' : ''}`}>
      <div className="question-heading">
        <div>
          <label htmlFor={notApplicable ? undefined : inputId}>{field.label}</label>
          {field.core && <span className="core-label">Core</span>}
        </div>
        {allowNotApplicable && (
          <button
            type="button"
            className="text-button na-toggle"
            onClick={() => onNotApplicableChange(notApplicable ? undefined : { rationale: '', owner: '' })}
          >
            {notApplicable ? <RotateCcw size={14} aria-hidden="true" /> : null}
            {notApplicable ? 'Answer instead' : 'Mark not applicable'}
          </button>
        )}
      </div>
      <p className="field-help" id={`${inputId}-help`}>{field.help}</p>

      {notApplicable ? (
        <div className="na-fields">
          <div>
            <label htmlFor={`${inputId}-na-rationale`}>Not-applicable rationale <span aria-hidden="true">*</span></label>
            <textarea
              id={`${inputId}-na-rationale`}
              rows={2}
              value={notApplicable.rationale}
              onChange={(event) => onNotApplicableChange({ ...notApplicable, rationale: event.target.value })}
              placeholder="Explain why this question is outside the solution’s scope…"
              aria-invalid={!notApplicable.rationale.trim()}
            />
          </div>
          <div>
            <label htmlFor={`${inputId}-na-owner`}>Scope decision owner <span aria-hidden="true">*</span></label>
            <input
              id={`${inputId}-na-owner`}
              type="text"
              value={notApplicable.owner}
              onChange={(event) => onNotApplicableChange({ ...notApplicable, owner: event.target.value })}
              placeholder="Person or role"
              aria-invalid={!notApplicable.owner.trim()}
            />
          </div>
          {invalidNa && <p className="field-warning" role="status">A rationale and scope decision owner are required for a complete not-applicable response.</p>}
        </div>
      ) : field.type === 'textarea' ? (
        <textarea
          id={inputId}
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          aria-describedby={`${inputId}-help`}
        />
      ) : field.type === 'select' ? (
        <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={`${inputId}-help`}>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          aria-describedby={`${inputId}-help`}
        />
      )}

      {allowNotApplicable && !notApplicable && (
        <div className="evidence-link">
          <Link2 size={15} aria-hidden="true" />
          <label htmlFor={evidenceId}>Evidence IDs</label>
          <input
            id={evidenceId}
            type="text"
            value={evidenceValue}
            onChange={(event) => onEvidenceChange(event.target.value)}
            placeholder="E-001, E-002"
            spellCheck="false"
          />
          {unknownRefs.length > 0 && <span className="field-warning">Add to register: {unknownRefs.join(', ')}</span>}
        </div>
      )}
    </div>
  )
}
