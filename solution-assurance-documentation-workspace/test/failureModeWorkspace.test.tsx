import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { createBlankAssessment, STORAGE_KEY } from '../src/lib/assessment'

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ enabled: false })))
  localStorage.clear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function openImpact() {
  click(/Impact & risk context/)
}

describe('Step 02 failure modes', () => {
  it('loads a legacy confirmed draft, edits and persists rows, and returns focus from Outstanding Work', () => {
    const { failureModes: _unused, ...old } = createBlankAssessment()
    expect(_unused).toEqual([])
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...old, answers: { ...old.answers, solutionName: 'Saved workspace' }, confirmation: { confirmedAt: '2026-11-26T00:00:00.000Z', version: 1 } }))
    const view = render(<App />)
    expect(screen.getByText('Confirmed · v1')).toBeInTheDocument()
    openImpact()
    fireEvent.change(screen.getByRole('combobox', { name: 'Add from archetype preset' }), { target: { value: 'FM-03' } })
    const title = screen.getByLabelText('Failure mode title')
    fireEvent.change(title, { target: { value: 'Restricted data exposure' } })
    const severity = screen.getByLabelText('Severity (anchored user judgement)')
    act(() => severity.focus())
    expect(severity).toHaveFocus()
    expect(screen.getByText('Severity (Anchored User Judgement)', { selector: 'h2' })).toBeInTheDocument()
    expect(title).toHaveValue('Restricted data exposure')
    click('View source')
    expect(screen.getByText('Manual user declaration — no repository source', { selector: '.fm-source-manual span' })).toBeInTheDocument()
    click('Close source dialog')
    click('Add Custom Failure Mode')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).confirmation).toBeNull()
    view.unmount()
    render(<App />)
    openImpact()
    click('FM-03: Severity unassigned')
    expect(document.getElementById('fm-row-FM-03')).toHaveFocus()
    expect(screen.getByLabelText('Failure mode title')).toHaveValue('Restricted data exposure')
    expect(screen.getByRole('button', { name: /FM-CUSTOM-01 Untitled failure mode/ })).toBeInTheDocument()
  })

  it('imports a local table and exposes the original row and locator without claiming proof', () => {
    render(<App />)
    openImpact()
    click('Import 02-Risk-and-Impact.md')
    const dialog = screen.getByRole('dialog')
    const row = '| FM-06 | Unsupported summary | HIGH | Incomplete context | Review output (DETECTIVE) | code:src/review.ts |'
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: `## Failure Mode Register\n\n| ID | Failure Mode | Severity | Trigger / Cause | Planned Mitigation | Code / Evidence Ref |\n|---|---|---|---|---|---|\n${row}` } })
    click('Parse & Import Table')
    expect(screen.getByText('Imported from 02-Risk-and-Impact.md')).toBeInTheDocument()
    expect(screen.getByLabelText('Observed evidence status')).toHaveValue('DECLARED_IN_DOC')
    click('View source')
    expect(within(screen.getByRole('dialog')).getByText('SRC-02:table-fm-row-1:L5')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText(row)).toBeInTheDocument()
  })

  it('offers AI automatically when configured, and persists only a reviewed draft', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(Response.json({ enabled: true }))
      .mockResolvedValueOnce(Response.json({ provider: 'google', model: 'gemini-4-hydrogen', suggestionIds: ['unsupported_output'] }))
    render(<App />)
    openImpact()
    fireEvent.click(await screen.findByRole('button', { name: 'Draft suggestions with AI' }))
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/ai/status'])
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Capability'), { target: { value: 'generation' } })
    fireEvent.change(dialog.getByLabelText('Output use'), { target: { value: 'reference' } })
    fireEvent.change(dialog.getByLabelText('Human review'), { target: { value: 'before_use' } })
    expect(dialog.getByRole('button', { name: 'Request suggestions' })).toBeDisabled()
    fireEvent.click(dialog.getByRole('checkbox', { name: /I agree to send/ }))
    click('Request suggestions')
    const suggestion = await dialog.findByRole('checkbox', { name: /Plausible but unsupported output/ })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).failureModes).toEqual([])
    fireEvent.click(suggestion)
    click('Accept selected drafts')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).failureModes).toEqual([expect.objectContaining({
      severity_user: 'UNKNOWN', claimed_mitigations: [], provenance: expect.objectContaining({
        ai_assistance: expect.objectContaining({ source: 'AI_ASSISTED', model: 'gemini-4-hydrogen' }),
      }),
    })])
  })
})
