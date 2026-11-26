function quote(value: string): string {
  if (/[\uD800-\uDFFF]/u.test(value)) throw new TypeError('Canonical JSON requires well-formed Unicode')
  return JSON.stringify(value)
}

/** RFC 8785: ECMAScript primitive serialization and recursive UTF-16 key ordering. */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON requires finite numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${Array.from(value, canonicalizeJson).join(',')}]`
  if (typeof value !== 'object' || Object.prototype.toString.call(value) !== '[object Object]') {
    throw new TypeError('Canonical JSON requires JSON values')
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${quote(key)}:${canonicalizeJson(object[key])}`).join(',')}}`
}
