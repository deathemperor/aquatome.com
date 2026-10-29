import type { Content, EquipmentGuide, Localized, ProductSlot, SpeciesEntity } from '@aq/schema'

export type CategoryUse = { category: string; keywords: string[]; usedBy: { name: string; href: string }[] }

export function categories(c: Content): CategoryUse[] {
  const map = new Map<string, CategoryUse>()
  const add = (slots: ProductSlot[], name: string, href: string) => {
    for (const s of slots) {
      const u = map.get(s.category) ?? { category: s.category, keywords: [], usedBy: [] }
      for (const k of s.keywords) if (!u.keywords.includes(k)) u.keywords.push(k)
      if (!u.usedBy.some(x => x.href === href)) u.usedBy.push({ name, href })
      map.set(s.category, u)
    }
  }
  for (const s of c.species) add(s.productSlots, s.t.name, `/vi/ca/${s.t.slug}/`)
  for (const p of c.plants) add(p.productSlots, p.t.name, `/vi/cay/${p.t.slug}/`)
  return [...map.values()].sort((a, b) => a.category.localeCompare(b.category))
}

/** "Lọc thùng  100W" and "lọc thùng 100w" are one suggestion. */
export const normKeyword = (k: string) => k.toLowerCase().replace(/\s+/g, ' ').trim()

/** Species with photos first, then the fullest profiles. */
const richest = (a: Localized<SpeciesEntity>, b: Localized<SpeciesEntity>) =>
  Math.sign(b.photos.length) - Math.sign(a.photos.length) || b.sections.length - a.sections.length || a.t.name.localeCompare(b.t.name, 'vi')

export type TypeUse = EquipmentGuide['types'][number] & { keywords: string[]; species: Localized<SpeciesEntity>[] }

/** Shares out a category's shop keywords, and the species suggesting them, among the guide's types: the first type whose `match` fits owns the keyword. */
export function typeUses(c: Content, g: EquipmentGuide): TypeUse[] {
  const res = g.types.map(t => ({ t, re: new RegExp(t.match, 'i'), kw: new Map<string, number>(), sp: new Map<string, Localized<SpeciesEntity>>() }))
  const own = (k: string) => res.find(r => r.re.test(k))
  for (const s of c.species) for (const slot of s.productSlots) if (slot.category === g.category) for (const k of slot.keywords) {
    const r = own(normKeyword(k))
    if (!r) continue
    r.kw.set(normKeyword(k), (r.kw.get(normKeyword(k)) ?? 0) + 1)
    r.sp.set(s.id, s)
  }
  return res.map(r => ({ ...r.t, keywords: [...r.kw].sort((a, b) => b[1] - a[1]).map(([k]) => k), species: [...r.sp.values()].sort(richest) }))
}

/** Every species that suggests something from this category, richest first. */
export const speciesUsing = (c: Content, category: string) => c.species.filter(s => s.productSlots.some(x => x.category === category)).sort(richest)
