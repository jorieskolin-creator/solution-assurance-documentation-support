import { sanitizeRelativeRepoPath } from './failureModeMarkdown'

export const MAX_EXPORT_TEXT_LENGTH = 8_192
const MAX_REFERENCE_LENGTH = 512
const MAX_KNOWN_FRAGMENTS = 64
const SAFE_PATH_CHARS = /^[A-Za-z0-9_./@ -]+$/

function redactCredentials(value: string): string {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted]')
    .replace(/\b(?:Bearer\s+[A-Za-z0-9._~+/=-]+|(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|password|cookie)["']?\s*[:=]\s*[^\n,;]+|AIza[A-Za-z0-9_-]{35}|xai-[A-Za-z0-9_-]{24,}|(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{24,})/gi, '[redacted]')
}

/** References are metadata, never links to fetch. Repository refs must be relative. */
export function exportRepoReference(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_REFERENCE_LENGTH) return null
  const candidate = value.trim().replace(/^`([^`]*)`$/, '$1').trim()
  if (!SAFE_PATH_CHARS.test(candidate) || candidate.startsWith('/') || redactCredentials(candidate) !== candidate) return null
  if (candidate.split('/').some((segment) => segment !== segment.trim() || (segment !== '.' && segment.endsWith('.')))) return null
  if (candidate.includes(' ') && !/[/.]/.test(candidate)) return null
  return sanitizeRelativeRepoPath(candidate).safePath
}

/** General references allow simple IDs and plain HTTPS locations, not credentials or URL parameters. */
export function exportGeneralReference(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_REFERENCE_LENGTH) return ''
  const candidate = value.trim()
  if (redactCredentials(candidate) !== candidate) return ''
  if (/^[A-Za-z0-9][A-Za-z0-9_. -]*$/.test(candidate)) return candidate
  if (/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/[A-Za-z0-9_./@-]*)?$/i.test(candidate)) {
    try {
      const url = new URL(candidate)
      if (url.hostname && !candidate.split('/').some((segment) => segment === '..')) return candidate
    } catch {
      return ''
    }
  }
  return exportRepoReference(value) ?? ''
}

export function exportSnapshotHash(value: unknown): string | null {
  return typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value) ? value : null
}

export function exportSourceUnitId(value: string): string | null {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value) ? value : null
}

function omitCodeSpans(text: string): string {
  let fence: string | undefined
  let fenceLength = 0
  const lines: string[] = []
  for (const line of text.split('\n')) {
    const marker = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (marker && marker[1][0] === fence && marker[1].length >= fenceLength && !marker[2].trim()) fence = undefined
    } else if (marker) {
      fence = marker[1][0]
      fenceLength = marker[1].length
      lines.push('[omitted]')
    } else {
      lines.push(line.replace(/`[^`\n]+`/g, '[omitted]'))
    }
  }
  return lines.join('\n')
}

/** Best effort for text copied into narrative fields; not a secret or source-code detector. */
export function createExportTextSanitizer(fragments: Iterable<string>): (value: unknown) => string {
  const known = new Set<string>()
  for (const fragment of fragments) {
    // Use a bounded prefix: a long excerpt may already have been truncated before finding it.
    const prefix = fragment.slice(0, MAX_EXPORT_TEXT_LENGTH).replace(/\r\n?/g, '\n').trim()
    if (prefix.length >= 4) known.add(prefix)
    if (known.size >= MAX_KNOWN_FRAGMENTS) break
  }
  const ordered = [...known].sort((a, b) => b.length - a.length)

  return (value) => {
    if (typeof value !== 'string') return ''
    let text = value.slice(0, MAX_EXPORT_TEXT_LENGTH).replace(/\r\n?/g, '\n')
    for (const fragment of ordered) {
      if (text.includes(fragment)) text = text.split(fragment).join('[omitted]')
      else if (value.length > MAX_EXPORT_TEXT_LENGTH) {
        // A known fragment crossing the cap must not leave a partial excerpt at the end.
        const tailLength = Math.min(text.length, fragment.length - 1)
        const start = text.lastIndexOf(fragment.slice(0, 4), text.length - 4)
        if (start >= text.length - tailLength && start >= 0 && fragment.startsWith(text.slice(start))) {
          text = `${text.slice(0, start)}[omitted]`
        }
      }
    }
    text = text.replace(/\p{Cc}|\p{Bidi_Control}/gu, (character) => character === '\n' || character === '\t' ? character : '')
      .replace(/[\uD800-\uDFFF]/gu, '\uFFFD')
    const suffix = value.length > MAX_EXPORT_TEXT_LENGTH ? '…' : ''
    return `${redactCredentials(omitCodeSpans(text)).slice(0, MAX_EXPORT_TEXT_LENGTH - suffix.length).replace(/[\uD800-\uDFFF]/gu, '\uFFFD').trim()}${suffix}`
  }
}
