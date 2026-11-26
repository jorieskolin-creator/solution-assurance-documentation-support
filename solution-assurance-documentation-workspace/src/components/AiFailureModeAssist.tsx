import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  AI_ASSIST_CONTEXT_OPTIONS, AI_ASSIST_MODELS, AI_FAILURE_MODE_DRAFTS,
  isAiAssistContext, type AcceptedAiFailureModeDraft, type AiAssistResult, type AiSuggestionId,
} from '../lib/aiFailureModeAssist'
import { requestAiFailureModeDrafts } from '../lib/aiFailureModeClient'

export interface AiFailureModeAssistProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Persist the full draft, including provenance; acceptance does not make it a manual declaration. */
  onAccept: (drafts: readonly AcceptedAiFailureModeDraft[]) => void
}

const contextLabels = { capability: 'Capability', outputUse: 'Output use', humanReview: 'Human review' } as const

export function AiFailureModeAssist({ open, onOpenChange, onAccept }: AiFailureModeAssistProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content max-h-[calc(100dvh-32px)] overflow-y-auto no-print">
          <Dialog.Title>Draft failure modes with AI</Dialog.Title>
          <Dialog.Description>
            If you opt in, only the three categories you choose below are sent to Google Gemini ({AI_ASSIST_MODELS.google}),
            or to xAI Grok ({AI_ASSIST_MODELS.xai}) if Gemini is temporarily unavailable. No record text, evidence, or files are sent.
          </Dialog.Description>
          {open && <AssistForm onAccept={onAccept} onClose={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AssistForm({ onAccept, onClose }: { onAccept: AiFailureModeAssistProps['onAccept']; onClose: () => void }) {
  const [context, setContext] = useState({ capability: '', outputUse: '', humanReview: '' })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<AiAssistResult | null>(null)
  const [selected, setSelected] = useState<AiSuggestionId[]>([])
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current || !consent || !isAiAssistContext(context)) return
    const current = new AbortController()
    request.current = current
    setBusy(true)
    setFailed(false)
    setConsent(false)
    const reply = await requestAiFailureModeDrafts(context, current.signal)
    if (current.signal.aborted) return
    request.current = null
    setBusy(false)
    setResult(reply)
    setFailed(reply === null)
  }

  function acceptSelected() {
    if (!result || selected.length === 0) return
    const { suggestionIds, ...origin } = result
    const acceptedAt = new Date().toISOString()
    const drafts: AcceptedAiFailureModeDraft[] = suggestionIds.filter((id) => selected.includes(id)).map((id) => ({
      ...AI_FAILURE_MODE_DRAFTS[id],
      provenance: { ...origin, source: 'AI_ASSISTED', suggestionId: id, acceptedAt },
    }))
    onAccept(drafts)
    onClose()
  }

  if (result) return (
    <div className="mt-4 grid gap-3">
      <p>AI suggestions from {result.provider === 'google' ? 'Google Gemini' : 'xAI Grok'} ({result.model}).
        These are draft descriptions, not findings. Select only those you have reviewed and want to accept.</p>
      {result.suggestionIds.map((id) => {
        const draft = AI_FAILURE_MODE_DRAFTS[id]
        return (
          <label className="check-label" key={id}>
            <input type="checkbox" checked={selected.includes(id)} onChange={(event) => {
              const checked = event.target.checked
              setSelected((before) => checked ? [...before, id] : before.filter((item) => item !== id))
            }} />
            <span><strong>{draft.title}</strong><br />Possible cause: {draft.trigger_or_cause}<br />Possible effect: {draft.effect_summary}</span>
          </label>
        )
      })}
      <div className="dialog-actions">
        <Dialog.Close asChild><button type="button" className="button button-secondary">Discard</button></Dialog.Close>
        <button type="button" className="button button-primary" onClick={acceptSelected} disabled={selected.length === 0}>Accept selected drafts</button>
      </div>
    </div>
  )

  return (
    <form className="mt-4" onSubmit={submit}>
      <fieldset className="grid gap-3" disabled={busy}>
        {(Object.keys(contextLabels) as (keyof typeof contextLabels)[]).map((field) => (
          <label key={field}>
            {contextLabels[field]}
            <select value={context[field]} onChange={(event) => setContext({ ...context, [field]: event.target.value })} required>
              <option value="" disabled>Choose a category</option>
              {Object.entries(AI_ASSIST_CONTEXT_OPTIONS[field]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        ))}
        <label className="check-label">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>I agree to send these categories to the named providers for this request.</span>
        </label>
      </fieldset>
      {failed && <p role="alert">AI suggestions are unavailable right now. Try again later or continue manually.</p>}
      {busy && <p role="status">Requesting AI suggestions…</p>}
      <div className="dialog-actions">
        <Dialog.Close asChild><button type="button" className="button button-secondary">Cancel</button></Dialog.Close>
        <button type="submit" className="button button-primary" disabled={busy || !consent || !isAiAssistContext(context)}>Request suggestions</button>
      </div>
    </form>
  )
}
