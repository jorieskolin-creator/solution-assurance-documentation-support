import { failureModeArchetypeMap, isArchetypeId } from '../data/failureModeArchetypes'
import {
  CONTROL_OBJECT_ID_REGEX,
  FAILURE_MODE_ID_REGEX,
  type ClaimedMitigation,
  type ControlObjectId,
  type DetectabilityInherent,
  type FailureModeEntry,
  type MitigationType,
  type ObservedEvidenceStatus,
  type OccurrenceInherent,
  type SeverityUser,
} from '../types/failureMode'

export interface SnapshotFileInfo {
  content?: string
  status?: string
}

export interface RepositorySnapshotManifest {
  filePath?: string
  snapshotHash?: string
  files: Record<string, SnapshotFileInfo>
}

// The optional index is user-supplied metadata, not permission to access files or URLs.
export function readSnapshotManifest(text: string): RepositorySnapshotManifest {
  const value = JSON.parse(text) as RepositorySnapshotManifest
  if (!value || typeof value.files !== 'object' || !value.files || Array.isArray(value.files)) throw new Error('Invalid file index')
  const filePath = value.filePath === undefined ? undefined : sanitizeRelativeRepoPath(value.filePath).safePath
  if (filePath === null || (value.snapshotHash !== undefined && !/^(?:sha256:)?[a-f0-9]{64}$/i.test(value.snapshotHash))) throw new Error('Invalid source metadata')
  const files: RepositorySnapshotManifest['files'] = Object.create(null)
  for (const [path, info] of Object.entries(value.files)) {
    if (sanitizeRelativeRepoPath(path).safePath !== path || !info || typeof info !== 'object' || Array.isArray(info) || (info.status !== undefined && typeof info.status !== 'string')) throw new Error('Invalid file metadata')
    files[path] = { status: info.status }
  }
  return { filePath, snapshotHash: value.snapshotHash, files }
}

export function snapshotFile(manifest: RepositorySnapshotManifest | undefined, path: string | null): SnapshotFileInfo | undefined {
  return manifest && path && Object.hasOwn(manifest.files, path) ? manifest.files[path] : undefined
}

export function isUnexecutedEvidence(file: SnapshotFileInfo): boolean {
  const marker = (value: unknown) => typeof value === 'string' && /^(?:NOT_RUN|SPECIFICATION[\s_]+ONLY)$/i.test(value.trim())
  if (marker(file.status)) return true
  if (!file.content) return false
  try { return marker((JSON.parse(file.content) as { status?: unknown })?.status) } catch {
    return marker(file.content) || /^\s*status\s*:\s*(?:NOT_RUN|SPECIFICATION[ _]+ONLY)\s*$/im.test(file.content)
  }
}

export interface ParseFailureModeOptions {
  filePath?: string
  snapshotHash?: string
  manifest?: RepositorySnapshotManifest
}

export interface ParseFailureModeResult {
  entries: FailureModeEntry[]
  notices: string[]
  rawSection: string | null
}

const VALID_SEVERITIES: ReadonlySet<string> = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'])
const VALID_OCCURRENCES: ReadonlySet<string> = new Set(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'])
const VALID_DETECTABILITIES: ReadonlySet<string> = new Set(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'])
const VALID_MITIGATION_TYPES: ReadonlySet<string> = new Set([
  'PREVENTIVE',
  'DETECTIVE',
  'PROCEDURAL_OR_PROMPT_ONLY',
])

export function sanitizeRelativeRepoPath(rawPath: string): { safePath: string | null; reason?: string } {
  const trimmed = rawPath.trim().replace(/^`|`$/g, '').trim()
  if (!trimmed) return { safePath: null }

  if (/\0/.test(trimmed)) {
    return { safePath: null, reason: 'Null byte rejected in reference path' }
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || /^\/\//.test(trimmed)) {
    return { safePath: null, reason: `External or URI scheme rejected: ${trimmed}` }
  }
  if (/^[\\/~]/.test(trimmed) || /%[0-9a-f]{2}/i.test(trimmed)) {
    return { safePath: null, reason: `Absolute path rejected: ${trimmed}` }
  }

  const normalizedSlashes = trimmed.replace(/\\/g, '/').replace(/^\.\//, '')
  const segments = normalizedSlashes.split('/').filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return { safePath: null, reason: `Path traversal rejected: ${trimmed}` }
  }

  return { safePath: segments.join('/') }
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim()
  const withoutOuter = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < withoutOuter.length; i += 1) {
    const ch = withoutOuter[i]
    if (ch === '\\' && i + 1 < withoutOuter.length && withoutOuter[i + 1] === '|') {
      current += '|'
      i += 1
    } else if (ch === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

// Encode cell syntax before inserting the structural delimiters.
function escapeCell(value: string): string {
  return value.replace(/[&<>|\\`\r\n;]/g, (character) => `&#${character.charCodeAt(0)};`)
    .replace(/^[ \t]+|[ \t]+$/g, (space) => [...space].map((character) => `&#${character.charCodeAt(0)};`).join(''))
}

function decodeCell(value: string): string {
  return value.replace(/&#(9|10|13|32|38|59|60|62|92|96|124);/g, (_, code: string) => String.fromCharCode(Number(code)))
}

function normalizeHeaderName(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function parseSeverity(raw: string, limitations: string[]): SeverityUser {
  const upper = raw.trim().toUpperCase()
  if (!upper || upper === 'NOT DETERMINED' || upper === 'N/A') return 'UNKNOWN'
  if (VALID_SEVERITIES.has(upper)) return upper as SeverityUser
  limitations.push(`Unrecognized severity "${raw.trim()}" normalized to UNKNOWN`)
  return 'UNKNOWN'
}

function parseOccurrence(raw: string, limitations: string[]): OccurrenceInherent {
  const upper = raw.trim().toUpperCase()
  if (!upper || upper === 'NOT DETERMINED' || upper === 'N/A') return 'UNKNOWN'
  if (VALID_OCCURRENCES.has(upper)) return upper as OccurrenceInherent
  limitations.push(`Unrecognized occurrence "${raw.trim()}" normalized to UNKNOWN`)
  return 'UNKNOWN'
}

function parseDetectability(raw: string, limitations: string[]): DetectabilityInherent {
  const upper = raw.trim().toUpperCase()
  if (!upper || upper === 'NOT DETERMINED' || upper === 'N/A') return 'UNKNOWN'
  if (VALID_DETECTABILITIES.has(upper)) return upper as DetectabilityInherent
  limitations.push(`Unrecognized detectability "${raw.trim()}" normalized to UNKNOWN`)
  return 'UNKNOWN'
}

function parseMappedObjects(raw: string): ControlObjectId[] {
  if (!raw.trim()) return []
  return raw
    .split(/[\s,;]+/)
    .map((token) => token.trim().toUpperCase())
    .filter((token): token is ControlObjectId => CONTROL_OBJECT_ID_REGEX.test(token))
}

function parseMitigationSegment(segment: string, limitations: string[]): { control: string; type: MitigationType } {
  const cleaned = segment.trim()
  const typeMatch = /\((PREVENTIVE|DETECTIVE|PROCEDURAL_OR_PROMPT_ONLY|UNKNOWN)\)\s*$/i.exec(cleaned)
  if (typeMatch) {
    const candidate = typeMatch[1].toUpperCase()
    const control = cleaned.slice(0, typeMatch.index).trim()
    if (VALID_MITIGATION_TYPES.has(candidate)) {
      return { control, type: candidate as MitigationType }
    }
    limitations.push(`Mitigation "${control || cleaned}" had UNKNOWN type tag`)
    return { control, type: 'UNKNOWN' }
  }
  if (cleaned) {
    limitations.push(`Mitigation "${cleaned}" omitted (PREVENTIVE|DETECTIVE|PROCEDURAL_OR_PROMPT_ONLY) tag; recorded as UNKNOWN`)
  }
  return { control: cleaned, type: 'UNKNOWN' }
}

function looksLikeEvidencePath(path: string): boolean {
  const lower = path.toLowerCase()
  return (
    lower.includes('evidence') ||
    lower.endsWith('.json') ||
    lower.endsWith('.md') ||
    lower.includes('test-report') ||
    /^e-\d+$/i.test(path.trim())
  )
}

function parseRefSegment(
  segment: string,
  limitations: string[],
  manifest?: RepositorySnapshotManifest,
): {
  code_ref: string | null
  evidence_ref: string | null
  evidence_status_observed: ObservedEvidenceStatus
} {
  const tokens = (segment.match(/(?:&#\d+;|[^;])+/g) ?? [])
    .map((item) => item.trim())
    .filter(Boolean)

  let codeRef: string | null = null
  let evidenceRef: string | null = null
  let hadUnsafeRef = false

  for (const token of tokens) {
    const cleanToken = token.replace(/^`|`$/g, '').trim()
    if (!cleanToken || /^none$/i.test(cleanToken) || cleanToken === '-') continue

    const prefixedCode = /^code:\s*(.+)$/i.exec(cleanToken)
    const prefixedEvidence = /^evidence:\s*(.+)$/i.exec(cleanToken)

    if (prefixedCode) {
      const check = sanitizeRelativeRepoPath(decodeCell(prefixedCode[1]))
      if (check.safePath) codeRef = check.safePath
      else if (check.reason) {
        limitations.push(check.reason)
        hadUnsafeRef = true
      }
      continue
    }

    if (prefixedEvidence) {
      const check = sanitizeRelativeRepoPath(decodeCell(prefixedEvidence[1]))
      if (check.safePath) evidenceRef = check.safePath
      else if (check.reason) {
        limitations.push(check.reason)
        hadUnsafeRef = true
      }
      continue
    }

    const check = sanitizeRelativeRepoPath(decodeCell(cleanToken))
    if (!check.safePath) {
      if (check.reason) {
        limitations.push(check.reason)
        hadUnsafeRef = true
      }
      continue
    }

    if (!codeRef && !evidenceRef) {
      if (tokens.length === 1 && looksLikeEvidencePath(check.safePath)) {
        evidenceRef = check.safePath
      } else {
        codeRef = check.safePath
      }
    } else if (!evidenceRef) {
      evidenceRef = check.safePath
    } else if (!codeRef) {
      codeRef = check.safePath
    }
  }

  let status: ObservedEvidenceStatus = 'MISSING_UNKNOWN'
  if (hadUnsafeRef && !codeRef && !evidenceRef) {
    status = 'MISSING_UNKNOWN'
  } else if (manifest) {
    const evidenceEntry = snapshotFile(manifest, evidenceRef)
    const codeEntry = snapshotFile(manifest, codeRef)
    if (codeRef && !codeEntry) limitations.push(`Code reference not found in snapshot: ${codeRef}`)
    if (evidenceRef && !evidenceEntry) limitations.push(`Evidence reference not found in snapshot: ${evidenceRef}`)
    if (evidenceEntry && isUnexecutedEvidence(evidenceEntry)) status = 'NOT_RUN'
    else if (hadUnsafeRef || (codeRef && !codeEntry) || (evidenceRef && !evidenceEntry)) status = 'MISSING_UNKNOWN'
    else if (evidenceEntry) status = 'TEST_EVIDENCE_LINKED'
    else if (codeEntry) status = 'OBSERVED_IN_CONFIG'
    else status = 'DECLARED_IN_DOC'
  } else if (!hadUnsafeRef) {
    status = 'DECLARED_IN_DOC'
  }

  return {
    code_ref: codeRef,
    evidence_ref: evidenceRef,
    evidence_status_observed: status,
  }
}

export function parseFailureModeRegister(
  markdown: string,
  options: ParseFailureModeOptions = {},
): ParseFailureModeResult {
  const originalLines = markdown.split(/\r?\n/)
  let fence = ''
  const lines = originalLines.map((line) => {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (delimiter && !fence) { fence = delimiter[1]; return '' }
    if (delimiter && delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) { fence = ''; return '' }
    return fence ? '' : line
  })
  const notices: string[] = []
  const filePath = options.filePath ?? options.manifest?.filePath ?? 'Documentation/02-Risk-and-Impact.md'
  const snapshotHash = options.snapshotHash ?? options.manifest?.snapshotHash ?? null

  let headingLineIndex = -1
  let headingLevel = 2

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(#{1,6})\s+Failure Mode Register\s*$/i.exec(lines[i].trim())
    if (match) {
      headingLineIndex = i
      headingLevel = match[1].length
      break
    }
  }

  if (headingLineIndex === -1) {
    return {
      entries: [],
      notices: ['FAILURE_MODE_REGISTER_NOT_FOUND'],
      rawSection: null,
    }
  }

  let sectionEnd = lines.length
  for (let i = headingLineIndex + 1; i < lines.length; i += 1) {
    const headingMatch = /^(#{1,6})\s+/.exec(lines[i].trim())
    if (headingMatch && headingMatch[1].length <= headingLevel) {
      sectionEnd = i
      break
    }
  }

  const rawSection = lines.slice(headingLineIndex, sectionEnd).join('\n')

  let headerIndex = -1
  for (let i = headingLineIndex + 1; i < sectionEnd; i += 1) {
    if (lines[i].trim().startsWith('|')) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1 || headerIndex + 1 >= sectionEnd) {
    return {
      entries: [],
      notices: ['FAILURE_MODE_REGISTER_EMPTY_TABLE'],
      rawSection,
    }
  }

  const headerCells = splitMarkdownTableRow(lines[headerIndex]).map(normalizeHeaderName)
  const separatorCells = splitMarkdownTableRow(lines[headerIndex + 1])
  if (separatorCells.length !== headerCells.length || !isSeparatorRow(separatorCells)) {
    return {
      entries: [],
      notices: ['FAILURE_MODE_REGISTER_INVALID_TABLE'],
      rawSection,
    }
  }

  const colIndex = {
    id: headerCells.findIndex((h) => h === 'id' || h === 'fm id'),
    title: headerCells.findIndex((h) => h.includes('failure mode') || h === 'title'),
    severity: headerCells.findIndex((h) => h.includes('severity')),
    occurrence: headerCells.findIndex((h) => h.includes('occurrence')),
    detectability: headerCells.findIndex((h) => h.includes('detectability')),
    trigger: headerCells.findIndex((h) => h.includes('trigger') || h.includes('cause')),
    effect: headerCells.findIndex((h) => h.includes('effect')),
    mapped: headerCells.findIndex((h) => h.includes('mapped')),
    mitigation: headerCells.findIndex((h) => h.includes('mitigation')),
    refs: headerCells.findIndex((h) => h.includes('evidence') || h.includes('code')),
  }

  if (colIndex.id < 0 || colIndex.title < 0) return { entries: [], notices: ['FAILURE_MODE_REGISTER_INVALID_TABLE'], rawSection }
  const entries: FailureModeEntry[] = []

  for (let i = headerIndex + 2; i < sectionEnd; i += 1) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) {
      if (line.length === 0) continue
      break
    }

    const cells = splitMarkdownTableRow(line)
    const getCell = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx].trim() : '')
    const rawId = getCell(colIndex.id).toUpperCase()
    if (!rawId || cells.length !== headerCells.length) {
      notices.push(`Skipped row at line ${i + 1}: invalid table row`)
      continue
    }

    const limitations: string[] = []
    if (!FAILURE_MODE_ID_REGEX.test(rawId)) {
      notices.push(`Skipped row at line ${i + 1}: malformed ID`)
      continue
    }

    const archetype = isArchetypeId(rawId) ? failureModeArchetypeMap[rawId] : null
    const title = decodeCell(getCell(colIndex.title))
    const severity = parseSeverity(getCell(colIndex.severity), limitations)
    const occurrence = colIndex.occurrence >= 0 ? parseOccurrence(getCell(colIndex.occurrence), limitations) : 'UNKNOWN'
    const detectability = colIndex.detectability >= 0 ? parseDetectability(getCell(colIndex.detectability), limitations) : 'UNKNOWN'
    const trigger = decodeCell(getCell(colIndex.trigger))
    const effect = decodeCell(getCell(colIndex.effect))

    const mappedCell = getCell(colIndex.mapped)
    const mappedObjects = colIndex.mapped >= 0 ? parseMappedObjects(mappedCell) : [...(archetype?.default_mapped_objects ?? [])]
    if (mappedCell.split(/[\s,;]+/).filter(Boolean).some((id) => !CONTROL_OBJECT_ID_REGEX.test(id.toUpperCase()))) {
      limitations.push('Unrecognized mapped controls were omitted.')
    }

    const rawMitigationCell = getCell(colIndex.mitigation)
    const rawRefsCell = getCell(colIndex.refs)

    const mitigationParts = rawMitigationCell
      ? rawMitigationCell.split(/<br\s*\/?>/i).map((p) => p.trim()).filter(Boolean)
      : []
    const refParts = rawRefsCell
      ? rawRefsCell.split(/<br\s*\/?>/i).map((p) => p.trim())
      : []

    const claimedMitigations: ClaimedMitigation[] = []
    const count = Math.max(mitigationParts.length, refParts.some((r) => r.length > 0) ? refParts.length : 0)

    for (let m = 0; m < count; m += 1) {
      const mRaw = mitigationParts[m] ?? ''
      const rRaw = refParts[m] ?? ''
      if (!mRaw && !rRaw) continue
      const { control, type } = parseMitigationSegment(mRaw || 'Unspecified control', limitations)
      const refParsed = parseRefSegment(rRaw, limitations, options.manifest)
      claimedMitigations.push({
        control: decodeCell(control),
        type,
        code_ref: refParsed.code_ref,
        evidence_ref: refParsed.evidence_ref,
        evidence_status_observed: refParsed.evidence_status_observed,
      })
    }

    const rowNumber = entries.length + 1
    entries.push({
      id: rawId,
      archetype_id: archetype ? archetype.id : null,
      source: 'DOCUMENT_EXTRACTED',
      title,
      trigger_or_cause: trigger,
      effect_summary: effect,
      severity_user: severity,
      occurrence_inherent: occurrence,
      detectability_inherent: detectability,
      mapped_objects: mappedObjects,
      claimed_mitigations: claimedMitigations,
      provenance: {
        basis: 'DOCUMENT_DECLARATION',
        source_unit_ids: [`SRC-02:table-fm-row-${rowNumber}:L${i + 1}`],
        limitations,
        file_path: filePath,
        snapshot_hash: snapshotHash,
        excerpt: originalLines[i],
      },
    })
  }

  return { entries, notices, rawSection }
}

function formatMitigationRefs(mitigation: ClaimedMitigation): string {
  const code = mitigation.code_ref?.trim()
  const evidence = mitigation.evidence_ref?.trim()
  if (code && evidence) return `\`code:${escapeCell(code)}\`; \`evidence:${escapeCell(evidence)}\``
  if (code) return `\`code:${escapeCell(code)}\``
  if (evidence) return `\`evidence:${escapeCell(evidence)}\``
  return ''
}

export function serializeFailureModeRegister(entries: readonly FailureModeEntry[]): string {
  const header = [
    '## Failure Mode Register',
    '',
    '| ID | Failure Mode | Severity | Occurrence | Detectability | Trigger / Cause | Effect | Mapped Objects | Planned Mitigation (Type) | Code / Evidence Ref |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ]

  const rows = entries.map((entry) => {
    const mitigationsText = entry.claimed_mitigations
      .map((m) => `${escapeCell(m.control)} (${m.type})`)
      .join('<br>')
    const refsText = entry.claimed_mitigations
      .map(formatMitigationRefs)
      .join('<br>')

    return `| ${escapeCell(entry.id)} | ${escapeCell(entry.title)} | ${entry.severity_user} | ${entry.occurrence_inherent} | ${entry.detectability_inherent} | ${escapeCell(entry.trigger_or_cause)} | ${escapeCell(entry.effect_summary)} | ${entry.mapped_objects.join(', ')} | ${mitigationsText} | ${refsText} |`
  })

  return [...header, ...rows].join('\n')
}
