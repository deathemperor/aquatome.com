import { linkTerms, type Content, type GlossaryEntity, type Localized } from '@aq/schema'
import { translator, type Lang } from './i18n'
import { guidesMentioning, mentionIndex } from './mentions'
import { sectionParts } from './section-parts'
import { foldNearEmpty } from './sections'

/** How many of each kind of page that uses a term its page lists; the heading gives the whole count. */
export const USED_IN_SHOWN = { guides: 8, fish: 12, plants: 6 } as const

/** A page that uses a term: its address and its name. */
export type TermUse = { href: string; name: string }
type Uses = { fish: TermUse[]; plants: TermUse[] }
const memo = new WeakMap<Content, Map<string, Uses>>()
const TERM_HREF = /href="(\/vi\/thuat-ngu\/[^"/]+\/)"/g

/**
 * The fish (species and breeds) and plant pages that link each term, read off their text as their pages draw it: the
 * sections through lib/section-parts.ts with the props pages/ca/[slug].astro and pages/cay/[slug].astro give it, a breed's
 * text as lib/breed-page.ts links it. Fullest page first. Built once per content load.
 */
function termUses(lang: Lang, c: Content): Map<string, Uses> {
  const hit = memo.get(c)
  if (hit) return hit
  const byHref = new Map(c.glossary.map(g => [`/vi/thuat-ngu/${g.t.slug}/`, g.id]))
  const terms = (html: string[]) => new Set(html.flatMap(h => [...h.matchAll(TERM_HREF)].flatMap(m => byHref.get(m[1]!) ?? [])))
  const shown = (parts: ReturnType<typeof sectionParts>) => parts.groups.flatMap(g => g.blocks.map(b => b.vi))
  const size = (x: { t: { sections: Record<string, string>; body?: string } }) => Object.values(x.t.sections).join('').length + (x.t.body?.length ?? 0)
  const t = translator(lang)
  const targets = mentionIndex(c).targets
  const pages: { kind: keyof Uses; use: TermUse; size: number; terms: Set<string> }[] = []
  for (const s of c.species) {
    const text = foldNearEmpty(s.sections, s.t, t)
    const parts = sectionParts(lang, c, { sections: text.sections, t: text.t, self: `species:${s.id}`, selfNames: [s.scientificName, s.t.name, ...s.t.altNames], card: s.dataCard })
    pages.push({ kind: 'fish', use: { href: `/vi/ca/${s.t.slug}/`, name: s.t.name }, size: size(s), terms: terms(shown(parts)) })
  }
  for (const b of c.breeds) {
    const body = b.t.body ? linkTerms(b.t.body, targets, 'ml', new Set([`breed:${b.id}`])).html : ''
    pages.push({ kind: 'fish', use: { href: `/vi/ca/${b.t.slug}/`, name: b.t.name }, size: size(b), terms: terms([body]) })
  }
  for (const p of c.plants) {
    const parts = sectionParts(lang, c, { sections: p.sections, t: p.t, self: `plant:${p.id}`, selfNames: [p.scientificName, p.t.name, ...p.t.altNames], co2: p.co2 })
    pages.push({ kind: 'plants', use: { href: `/vi/cay/${p.t.slug}/`, name: p.t.name }, size: size(p), terms: terms(shown(parts)) })
  }
  const out = new Map<string, Uses>()
  for (const x of pages.sort((a, b) => b.size - a.size)) {
    for (const id of x.terms) (out.get(id) ?? out.set(id, { fish: [], plants: [] }).get(id)!)[x.kind].push(x.use)
  }
  memo.set(c, out)
  return out
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/**
 * "Lũa (Driftwood)": the name searched in English beside the term's own, without its own brackets ("D area (discus)"),
 * unless it is the same word (pH, GH, CO2).
 */
export function termTitle(g: Localized<GlossaryEntity>): string {
  const en = g.en.replace(/\s*\([^)]*\)/g, '').trim()
  const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  return !en || fold(g.t.name).includes(fold(en)) ? g.t.name : `${g.t.name} (${en})`
}

/**
 * What a term's page shows, put together once for the page (pages/thuat-ngu/[slug].astro) and for the app's copy of it
 * (lib/app-page.ts): its other names, its definition with the other terms, fish and plants it names linked (never its
 * own names), and the pages that link it: guides most recently updated first, then fish and plants, fullest first.
 */
export function glossaryParts(lang: Lang, c: Content, g: Localized<GlossaryEntity>) {
  const key = `glossary:${g.id}`
  const name = g.t.name.toLowerCase()
  // Each once, as first written; never the name itself.
  const own = new Set([name])
  const otherNames = g.t.altNames.map(n => n.trim()).filter(n => n && !own.has(n.toLowerCase()) && own.add(n.toLowerCase()))
  const definition = g.t.definition ? linkTerms(escapeText(g.t.definition), mentionIndex(c).targets, 'ml', new Set([key]), own).html : ''
  const guides = guidesMentioning(c, key)
  const { fish, plants } = termUses(lang, c).get(g.id) ?? { fish: [], plants: [] }
  return { otherNames, definition, guides, fish, plants, total: guides.length + fish.length + plants.length }
}
