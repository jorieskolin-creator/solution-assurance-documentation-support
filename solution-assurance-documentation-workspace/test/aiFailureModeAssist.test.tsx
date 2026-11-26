import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AiFailureModeAssist } from '../src/components/AiFailureModeAssist'
import { getAiAssistAvailability } from '../src/lib/aiFailureModeClient'

const accessToken = 'a'.repeat(32)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function chooseContext() {
  fireEvent.change(screen.getByLabelText('Capability'), { target: { value: 'generation' } })
  fireEvent.change(screen.getByLabelText('Output use'), { target: { value: 'reference' } })
  fireEvent.change(screen.getByLabelText('Human review'), { target: { value: 'before_use' } })
  fireEvent.change(screen.getByLabelText(/Workspace AI access token/), { target: { value: accessToken } })
}

it('discloses both providers, sends only opted-in categories, and accepts only reviewed drafts with preserved AI provenance', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    provider: 'xai', model: 'grok-4.7', suggestionIds: ['unsupported_output', 'weak_oversight'],
  }))
  vi.stubGlobal('fetch', fetchMock)
  const onAccept = vi.fn()
  const onOpenChange = vi.fn()
  render(createElement(AiFailureModeAssist, { open: true, onAccept, onOpenChange }))
  expect(screen.getByText(/Google Gemini \(gemini-4-hydrogen\).*xAI Grok \(grok-4.7\)/)).toBeVisible()
  chooseContext()
  const request = screen.getByRole('button', { name: 'Request suggestions' })
  expect(request).toBeDisabled()
  expect(fetchMock).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: /I agree to send/ }))
  fireEvent.click(request)
  const accept = await screen.findByRole('button', { name: 'Accept selected drafts' })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/ai/failure-modes')
  expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${accessToken}`)
  expect(JSON.parse(String(init?.body))).toEqual({ consent: true, context: {
    capability: 'generation', outputUse: 'reference', humanReview: 'before_use',
  } })
  expect(screen.getByText(/AI suggestions from xAI Grok/)).toBeVisible()
  expect(accept).toBeDisabled()
  expect(onAccept).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: /Plausible but unsupported output/ }))
  fireEvent.click(accept)
  expect(onAccept).toHaveBeenCalledExactlyOnceWith([{
    title: 'Plausible but unsupported output',
    trigger_or_cause: expect.any(String), effect_summary: expect.any(String),
    provenance: { source: 'AI_ASSISTED', suggestionId: 'unsupported_output', provider: 'xai', model: 'grok-4.7', acceptedAt: expect.any(String) },
  }])
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('fails closed on unvalidated output and clears consent and the access token before retry', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    provider: 'google', model: 'gemini-4-hydrogen', suggestionIds: ['scope_creep'], evidence_ref: 'unexpected',
  }))
  vi.stubGlobal('fetch', fetchMock)
  const onAccept = vi.fn()
  render(createElement(AiFailureModeAssist, { open: true, onAccept, onOpenChange: vi.fn() }))
  chooseContext()
  fireEvent.click(screen.getByRole('checkbox', { name: /I agree to send/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Request suggestions' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/continue manually/)
  expect(screen.getByLabelText(/Workspace AI access token/)).toHaveValue('')
  expect(screen.getByRole('checkbox', { name: /I agree to send/ })).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Request suggestions' })).toBeDisabled()
  expect(onAccept).not.toHaveBeenCalled()
})

it('treats an unavailable or misrouted status endpoint as disabled', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html></html>'))
    .mockResolvedValueOnce(Response.json({ enabled: true }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await getAiAssistAvailability()).toBe(false)
  expect(await getAiAssistAvailability()).toBe(true)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/ai/status')
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('authorization')).toBe(false)
})
