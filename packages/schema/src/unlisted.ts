/**
 * A tank's entries without a page (`unlisted`, ./tanks.ts) matched to the handbook's pages by scientific name: one rule
 * for the site, the Worker and the iOS app, held to protocols/unlisted-vectors.json. No zod here, so a page script can
 * use it without the validator. Matching only decides what is shown: nothing is written back to the tank.
 */

/**
 * A scientific name as two are compared: letter case and spacing don't count, and neither does `cf.` or `aff.`
 * ("Corydoras cf. sterbai" is Corydoras sterbai).
 */
export const sciKey = (s: string) => s.normalize('NFKC').toLowerCase().split(/\s+/).filter(w => w && !/^(?:cf|aff)\.?$/.test(w)).join(' ')

/** A page as the matcher reads it: its kind (`fish`, `plant`), scientific name and other scientific names it went by. */
export type MatchPage = { kind: string; id: string; sci?: string; synonyms?: string[] }

/**
 * The page an entry without a page is, by its kind and scientific name: the page whose own scientific name it is, else
 * the one that has it as a former name (a synonym). Nothing for a name of one word (a genus), for a name two pages
 * share, or for another kind of page.
 */
export function pageMatcher<P extends MatchPage>(pages: readonly P[]): (kind: string, sci: string | undefined) => P | undefined {
  // null: the key belongs to two pages, so it names neither for sure.
  const own = new Map<string, P | null>()
  const former = new Map<string, P | null>()
  const add = (m: Map<string, P | null>, k: string, p: P) => { const was = m.get(k); m.set(k, was === undefined || was === p ? p : null) }
  for (const p of pages) if (p.sci) add(own, `${p.kind}|${sciKey(p.sci)}`, p)
  for (const p of pages) for (const s of p.synonyms ?? []) { const k = `${p.kind}|${sciKey(s)}`; if (!own.has(k)) add(former, k, p) }
  return (kind, sci) => {
    const k = sci ? sciKey(sci) : ''
    if (!k.includes(' ')) return undefined
    return (own.get(`${kind}|${k}`) ?? former.get(`${kind}|${k}`)) ?? undefined
  }
}
