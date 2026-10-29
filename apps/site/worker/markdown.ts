/** True when the client lists text/markdown (q > 0) at least as high as text/html; a bare *\/* stays HTML. */
export function prefersMarkdown(accept: string | null): boolean {
  const q = (type: string) => {
    for (const part of (accept ?? '').split(',')) {
      const [t, ...params] = part.trim().toLowerCase().split(';')
      if (t?.trim() !== type) continue
      const v = params.map(p => p.trim()).find(p => p.startsWith('q='))
      return v ? Number(v.slice(2)) || 0 : 1
    }
    return 0
  }
  const md = q('text/markdown')
  return md > 0 && md >= q('text/html')
}
