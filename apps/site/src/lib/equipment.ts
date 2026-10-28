import type { Content, ProductSlot } from '@aq/schema'

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
