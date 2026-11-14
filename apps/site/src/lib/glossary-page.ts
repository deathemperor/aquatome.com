import { FIRST_PLANTS, linkTerms, plainText, POPULAR, slugify, STAPLE_SPECIES, type Content, type GlossaryEntity, type GuideEntity, type Localized } from '@aq/schema'
import { translator, type Lang } from './i18n'
import { materialPath } from './materials'
import { mentionIndex } from './mentions'
import { sectionParts } from './section-parts'
import { foldNearEmpty } from './sections'

/** How many of each kind of page that uses a term its page lists; the heading gives the whole count. */
export const USED_IN_SHOWN = { guides: 8, fish: 12, plants: 6 } as const

/** A page that uses a term: its address and its name. */
export type TermUse = { href: string; name: string }
/** The fish readers keep most, as the home page and the lists rank them (staples.ts), then the first plants a keeper meets. */
const KNOWN = [...STAPLE_SPECIES, ...POPULAR.map(slugify), ...FIRST_PLANTS]
const known = (id: string) => (KNOWN.includes(id) ? KNOWN.indexOf(id) : KNOWN.length)
type Uses = { guides: Localized<GuideEntity>[]; fish: TermUse[]; plants: TermUse[] }
const memo = new WeakMap<Content, Map<string, Uses>>()
const TERM_HREF = /(?<![\w-])href\s*=\s*(["'])(\/vi\/thuat-ngu\/[^"'#?/]+\/)(?:[#?][^"']*)?\1/gi

/** The term pages a piece of HTML links ("/vi/thuat-ngu/ph/"), however its links are written: either quote, a #part. */
export const linkedTermPaths = (html: string): string[] => [...html.matchAll(TERM_HREF)].map(m => m[2]!)

/**
 * The guides, fish (species and breeds) and plant pages that link each term, read off their text as their pages draw it:
 * a guide's body as mentionIndex links it (links it had already as well as those added), the sections through
 * lib/section-parts.ts with the props pages/ca/[slug].astro and pages/cay/[slug].astro give it, a breed's text as
 * lib/breed-page.ts links it. Fish and plants: those readers keep most first (KNOWN), then the fullest pages. Built once
 * per content load.
 */
function termUses(lang: Lang, c: Content): Map<string, Uses> {
  const hit = memo.get(c)
  if (hit) return hit
  const byHref = new Map(c.glossary.map(g => [`/vi/thuat-ngu/${g.t.slug}/`, g.id]))
  const terms = (html: string[]) => new Set(html.flatMap(h => linkedTermPaths(h).flatMap(x => byHref.get(x) ?? [])))
  const shown = (parts: ReturnType<typeof sectionParts>) => parts.groups.flatMap(g => g.blocks.map(b => b.vi))
  const size = (x: { t: { sections: Record<string, string>; body?: string } }) => Object.values(x.t.sections).join('').length + (x.t.body?.length ?? 0)
  const t = translator(lang)
  const targets = mentionIndex(c).targets
  const pages: { kind: 'fish' | 'plants'; use: TermUse; rank: number; size: number; terms: Set<string> }[] = []
  for (const s of c.species) {
    const text = foldNearEmpty(s.sections, s.t, t)
    const parts = sectionParts(lang, c, { sections: text.sections, t: text.t, self: `species:${s.id}`, selfNames: [s.scientificName, s.t.name, ...s.t.altNames], card: s.dataCard })
    pages.push({ kind: 'fish', use: { href: `/vi/ca/${s.t.slug}/`, name: s.t.name }, rank: known(s.id), size: size(s), terms: terms(shown(parts)) })
  }
  for (const b of c.breeds) {
    const body = b.t.body ? linkTerms(b.t.body, targets, 'ml', new Set([`breed:${b.id}`])).html : ''
    pages.push({ kind: 'fish', use: { href: `/vi/ca/${b.t.slug}/`, name: b.t.name }, rank: KNOWN.length, size: size(b), terms: terms([body]) })
  }
  for (const p of c.plants) {
    const parts = sectionParts(lang, c, { sections: p.sections, t: p.t, self: `plant:${p.id}`, selfNames: [p.scientificName, p.t.name, ...p.t.altNames], co2: p.co2 })
    pages.push({ kind: 'plants', use: { href: `/vi/cay/${p.t.slug}/`, name: p.t.name }, rank: known(p.id), size: size(p), terms: terms(shown(parts)) })
  }
  const out = new Map<string, Uses>()
  const at = (id: string) => out.get(id) ?? out.set(id, { guides: [], fish: [], plants: [] }).get(id)!
  const { guides } = mentionIndex(c)
  for (const g of [...c.guides].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    for (const id of terms([guides.get(g.id)?.html ?? ''])) at(id).guides.push(g)
  }
  for (const x of pages.sort((a, b) => a.rank - b.rank || b.size - a.size)) {
    for (const id of x.terms) at(id)[x.kind].push(x.use)
  }
  memo.set(c, out)
  return out
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** How many pages use a term: the guides, fish and plants that link it, the number its page gives under "Dùng trong". */
const usedCount = (u: Uses) => u.guides.length + u.fish.length + u.plants.length

/**
 * A term as the app's glossary list shows it (lib/app-index.ts): its meaning as plain text, the definition its card and
 * its page lead with (the page's has its links in), and how many pages its page says use it. Each left out where the term
 * has none, as its page leaves out the section.
 */
export function termListing(lang: Lang, c: Content, g: Localized<GlossaryEntity>): { def?: string; uses?: number } {
  const def = g.t.definition?.trim()
  const uses = usedCount(termUses(lang, c).get(g.id) ?? { guides: [], fish: [], plants: [] })
  return { ...(def ? { def } : {}), ...(uses ? { uses } : {}) }
}

/** How many times a text names any of these, as whole words in any case, as the linker reads them: "pH" is not in "Phosphat". */
export function nameCount(names: string[]): (text: string) => number {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
  return text => text.match(re)?.length ?? 0
}

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
 * (lib/app-page.ts): its other names; its definition, its photo where one explains it, and its fuller entry's text
 * (engine glossary-entry.ts), under plain headings as a guide's, with the other terms, fish and plants they name linked
 * once each (never its own names); the terms to see next; the pages that link it, guides that explain the term first
 * (its name in their title, then the most uses of its names in their text, then the most recently updated) and fish and
 * plants as termUses ranks them; and the pages its entry was researched from. On a Vietnamese page, the link to the
 * material page of the same id (never localized into another language, where the material page isn't).
 */
export function glossaryParts(lang: Lang, c: Content, g: Localized<GlossaryEntity>) {
  const key = `glossary:${g.id}`
  const name = g.t.name.toLowerCase()
  // Each once, as first written; never the name itself.
  const own = new Set([name])
  const otherNames = g.t.altNames.map(n => n.trim()).filter(n => n && !own.has(n.toLowerCase()) && own.add(n.toLowerCase()))
  const targets = mentionIndex(c).targets
  const seen = new Set([key])
  const definition = g.t.definition ? linkTerms(escapeText(g.t.definition), targets, 'ml', seen, own).html : ''
  // The entry's sections are the page's first headings, under its title.
  const body = g.t.body ? linkTerms(g.t.body.replace(/<(\/?)h3>/g, '<$1h2>'), targets, 'ml', seen, own).html : ''
  const terms = new Map(c.glossary.map(x => [x.id, x]))
  const related = (g.related ?? []).flatMap(id => terms.get(id) ?? [])
  const uses = termUses(lang, c).get(g.id) ?? { guides: [], fish: [], plants: [] }
  const count = nameCount([...own])
  const index = mentionIndex(c).guides
  const rank = new Map(uses.guides.map(x => [x.id, [count(x.t.name) ? 1 : 0, count(plainText(index.get(x.id)?.html ?? ''))] as const]))
  const guides = [...uses.guides].sort((a, b) => rank.get(b.id)![0] - rank.get(a.id)![0] || rank.get(b.id)![1] - rank.get(a.id)![1] || b.updatedAt.localeCompare(a.updatedAt))
  const { fish, plants } = uses
  // More of a kind than its list shows: the page searches for the rest.
  const more = guides.length > USED_IN_SHOWN.guides || fish.length > USED_IN_SHOWN.fish || plants.length > USED_IN_SHOWN.plants
  const m = lang === 'vi' ? c.materials.find(m => m.id === g.id) : undefined
  const material = m ? { href: materialPath(m), text: `Xem trang ${m.t.name}: cách chọn, xử lý${m.parent ? '' : ` và các loại ${m.t.name.toLocaleLowerCase('vi')}`} →` } : undefined
  return { otherNames, definition, material, photo: g.photos?.[0], body, related, refs: g.refs ?? [], guides, fish, plants, total: usedCount(uses), more }
}
