/** How many of Pagefind's best results are looked at for a page named exactly what was searched for. */
export const NAMED_WINDOW = 20

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()
/** A name as a reader types it: no accents, no leading "cá", nothing in brackets ("Cá betta (cá xiêm)" → "betta"). */
const nameKey = (s: string) => fold(s).replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^ca /, '')

/**
 * Pagefind's results with the pages named exactly what was searched for first: by their title or one of their other
 * names (`aka`, comma-separated). The rest keep Pagefind's order. Pagefind ranks short pages up, so a fish's varieties
 * outrank the fish itself ("bảy màu": Bảy màu koi before Cá bảy màu), and near-equal scores flip on any change
 * ("neon": the neon goby by 35.41 to 35.32 over the neon tetra, whose other names include "Cá neon").
 */
export function namedFirst<T extends { meta: Record<string, string | undefined> }>(query: string, docs: T[]): T[] {
  const q = nameKey(query)
  if (!q) return docs
  const named = (d: T) => [d.meta.title ?? '', ...(d.meta.aka ?? '').split(',')].some(n => nameKey(n) === q)
  return [...docs.filter(named), ...docs.filter(d => !named(d))]
}
