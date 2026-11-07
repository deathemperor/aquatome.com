/**
 * An R2 bucket in memory, enough for the kept fish-ID photos (fishid/kept.ts): put with metadata, get, head, delete one
 * or many, and list by prefix in pages (`page` objects each, as R2 returns 1,000) with their custom metadata. `at`
 * sets the upload time of the next puts.
 */
export function memoryR2(page = 1000) {
  const m = new Map<string, { bytes: Uint8Array; uploaded: Date; customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } }>()
  let at = () => new Date()
  const obj = (key: string) => {
    const o = m.get(key)!
    return { key, uploaded: o.uploaded, customMetadata: o.customMetadata, httpMetadata: o.httpMetadata, size: o.bytes.length }
  }
  const bucket = {
    put: async (key: string, v: ArrayBuffer | Uint8Array | string, o: { customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } } = {}) => {
      const bytes = typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v instanceof Uint8Array ? v : new Uint8Array(v))
      m.set(key, { bytes, uploaded: at(), customMetadata: o.customMetadata, httpMetadata: o.httpMetadata })
    },
    get: async (key: string) => (m.has(key) ? { ...obj(key), body: new Blob([m.get(key)!.bytes]).stream(), arrayBuffer: async () => m.get(key)!.bytes.slice().buffer, json: async () => JSON.parse(new TextDecoder().decode(m.get(key)!.bytes)) } : null),
    head: async (key: string) => (m.has(key) ? obj(key) : null),
    delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x) },
    list: async ({ prefix = '', cursor, include = [], delimiter }: { prefix?: string; cursor?: string; include?: string[]; delimiter?: string } = {}) => {
      // With a delimiter, what lies deeper is one prefix each (R2's "folders"), not its objects.
      const under = [...m.keys()].filter(k => k.startsWith(prefix)).sort()
      const deeper = (k: string) => delimiter !== undefined && k.slice(prefix.length).includes(delimiter)
      const delimitedPrefixes = [...new Set(under.filter(deeper).map(k => k.slice(0, k.indexOf(delimiter!, prefix.length) + 1)))]
      const keys = under.filter(k => !deeper(k))
      const from = cursor ? Number(cursor) : 0
      const objects = keys.slice(from, from + page).map(k => ({ ...obj(k), customMetadata: include.includes('customMetadata') ? m.get(k)!.customMetadata : undefined }))
      const truncated = from + page < keys.length
      return { objects, truncated, ...(truncated ? { cursor: String(from + page) } : {}), delimitedPrefixes }
    },
  } as unknown as R2Bucket
  return { bucket, m, setNow: (f: () => Date) => { at = f } }
}
