import type { Content, GuideEntity, Localized } from '@aq/schema'
import { categoryLabel } from './format'
import { productFor, productHref } from './products'

type Video = NonNullable<GuideEntity['video']>
export type GearRow = { category: string; label: string; name: string; keyword: string; t?: number; page?: string; /** Our page for this exact product. */ product?: string }

const label = (cat: string) => (cat === 'khac' ? 'Khác' : categoryLabel(cat))
const named = (g: Video['gear'] extends (infer X)[] | undefined ? X : never) => [g.brand, g.model].filter(Boolean).join(' ')

/** A video's kit as shown: brand and model when the video names them, else the type's (or category's) Vietnamese name. */
export function gearRows(c: Content, v: Video): GearRow[] {
  const rows: GearRow[] = []
  for (const g of v.gear ?? []) {
    const eq = c.equipment.find(e => e.category === g.category)
    const type = eq?.types.find(t => t.id === g.type)
    const name = g.brand ? named(g) : type?.name ?? (g.category === 'khac' ? '' : label(g.category))
    if (!name) continue
    const p = productFor(c, g.brand, g.model)
    rows.push({ category: g.category, label: label(g.category), name, keyword: g.brand ? name : type?.buy ?? name, ...(g.t !== undefined ? { t: g.t } : {}), ...(eq ? { page: `/vi/thiet-bi/${g.category}/` } : {}), ...(p ? { product: productHref(p) } : {}) })
  }
  return rows.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity))
}

/** Branded kit of one category across the video guides: what creators actually use, most videos first. */
export function creatorsUse(c: Content, category: string): { name: string; guides: Localized<GuideEntity>[]; product?: string }[] {
  const by = new Map<string, { name: string; guides: Localized<GuideEntity>[]; product?: string }>()
  for (const g of c.guides) {
    for (const x of g.video?.gear ?? []) {
      if (x.category !== category || !x.brand) continue
      const name = named(x)
      const k = name.toLowerCase()
      const p = productFor(c, x.brand, x.model)
      const e = by.get(k) ?? { name, guides: [], ...(p ? { product: productHref(p) } : {}) }
      if (!e.guides.includes(g)) e.guides.push(g)
      by.set(k, e)
    }
  }
  return [...by.values()].sort((a, b) => b.guides.length - a.guides.length || a.name.localeCompare(b.name, 'vi'))
}
