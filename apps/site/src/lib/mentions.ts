import { linkTerms, type Content, type LinkTarget, type Localized, type GuideEntity, type PlantEntity, type SpeciesEntity } from '@aq/schema'
import { categories } from './equipment'

/** Words in guide text that mean an equipment category (only categories that have a page are linked). */
const EQUIPMENT_TERMS: Record<string, string[]> = {
  loc: ['bộ lọc', 'máy lọc', 'lọc thùng', 'lọc treo', 'lọc vi sinh', 'lọc sủi', 'lọc'],
  suoi: ['máy sưởi', 'cây sưởi', 'sưởi'],
  den: ['đèn thủy sinh', 'đèn LED', 'đèn'],
  'thuc-an': ['thức ăn'],
  'phan-nen': ['phân nền', 'đất nền'],
  co2: ['CO2', 'CO₂'],
  'test-nuoc': ['bộ test', 'test nước', 'bộ kiểm tra nước'],
}

const multiWord = (n: string) => n.trim().split(/\s+/).length >= 2 // single words ("cá", "betta") are too generic to link
/** Group names ("cá neon", "cá chạch suối") begin several other species' names: linking them would point a group at one species. */
const specific = (all: string[]) => {
  const lower = [...new Set(all.map(n => n.toLowerCase()))]
  return (n: string) => lower.filter(o => o.startsWith(`${n.toLowerCase()} `)).length < 2
}
const taxonHref = (...parts: string[]) => `/vi/phan-loai/${parts.map(p => p.toLowerCase()).join('/')}/`

export function linkTargets(c: Content): LinkTarget[] {
  const out: LinkTarget[] = []
  const ok = specific([...c.species, ...c.plants].flatMap(x => [x.scientificName, x.t.name, ...x.t.altNames]))
  // A name shared by several pages (a species and its shop colour varieties) goes to the fullest page: richest first.
  const size = (x: { t: { sections: Record<string, string> } }) => Object.values(x.t.sections).join('').length
  for (const s of [...c.species].sort((a, b) => size(b) - size(a))) out.push({ key: `species:${s.id}`, href: `/vi/ca/${s.t.slug}/`, names: [s.scientificName, s.t.name, ...s.t.altNames].filter(n => multiWord(n) && ok(n)) })
  for (const p of c.plants) out.push({ key: `plant:${p.id}`, href: `/vi/cay/${p.t.slug}/`, names: [p.scientificName, p.t.name, ...p.t.altNames].filter(n => multiWord(n) && ok(n)) })
  const taxa = new Map<string, LinkTarget>()
  for (const s of c.species) {
    taxa.set(`genus:${s.genus}`, { key: `genus:${s.genus}`, href: taxonHref(s.order, s.family, s.genus), names: [s.genus], exact: true })
    taxa.set(`family:${s.family}`, { key: `family:${s.family}`, href: taxonHref(s.order, s.family), names: [s.family], exact: true })
  }
  out.push(...taxa.values())
  for (const u of categories(c)) if (EQUIPMENT_TERMS[u.category]) out.push({ key: `equipment:${u.category}`, href: `/vi/thiet-bi/${u.category}/`, names: EQUIPMENT_TERMS[u.category]! })
  return out
}

export type GuideLinks = { html: string; keys: string[]; species: Localized<SpeciesEntity>[]; plants: Localized<PlantEntity>[]; equipment: string[] }
type Index = { targets: LinkTarget[]; guides: Map<string, GuideLinks> }
const memo = new WeakMap<Content, Index>()

/** Every guide's body with species, plants, taxa and equipment linked (first mention each), built once per content load. */
export function mentionIndex(c: Content): Index {
  const hit = memo.get(c)
  if (hit) return hit
  const targets = linkTargets(c)
  const species = new Map(c.species.map(s => [`species:${s.id}`, s]))
  const plants = new Map(c.plants.map(p => [`plant:${p.id}`, p]))
  const guides = new Map<string, GuideLinks>()
  for (const g of c.guides) {
    const { html, keys } = linkTerms(g.t.body ?? '', targets, 'ml')
    guides.set(g.id, {
      html, keys,
      species: keys.flatMap(k => species.get(k) ?? []),
      plants: keys.flatMap(k => plants.get(k) ?? []),
      equipment: keys.filter(k => k.startsWith('equipment:')).map(k => k.slice('equipment:'.length)),
    })
  }
  const index = { targets, guides }
  memo.set(c, index)
  return index
}

/** Guides that mention a target (e.g. "species:betta-splendens", "equipment:loc"), most recently updated first. */
export const guidesMentioning = (c: Content, key: string): Localized<GuideEntity>[] =>
  c.guides.filter(g => mentionIndex(c).guides.get(g.id)?.keys.includes(key)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

/** A guide's picture: its own photo, else the first species or plant it talks about (so every guide card has one). */
export function guideImage(c: Content, g: Localized<GuideEntity>) {
  const m = mentionIndex(c).guides.get(g.id)
  return g.photos[0] ?? m?.species.find(s => s.photos[0])?.photos[0] ?? m?.plants.find(p => p.photos[0])?.photos[0]
}
