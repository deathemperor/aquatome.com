import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { POPULAR, POPULAR_BREEDS, slugify, STAPLE_SPECIES } from '@aq/schema'
import { shopIds, type ShopLang } from './shops'

export type GalleryKind = 'species' | 'plants' | 'breeds'
const KINDS: GalleryKind[] = ['species', 'plants', 'breeds']
export type Tier = 'staple' | 'shop' | 'popular' | 'covered' | 'rest'

/**
 * Photos a gallery aims for, by how much readers want the fish or plant. The gallery step tops up the most popular first
 * and never pads: a page whose open-licence sources run dry stays short and is listed (docs/review/galleries.md).
 */
export const TARGETS: Record<Tier, number> = {
  // The 12 species readers open first (home page, every list). Each comes in many sexes, colour lines and fin forms
  // (betta, guppy, discus and angelfish in dozens), which readers compare: 100 covers the range. Commons alone has
  // well over 100 open-licence photos of most of them.
  staple: 100,
  // What shops in Vietnam, Indonesia and Thailand sell (engine-state/shop-lists), and the bred fish they keep most
  // (POPULAR_BREEDS: balloon molly, koi, goldfish and betta forms…): readers often choose between a shop's colour forms,
  // sexes and sizes, so a few of each. 60 is about five screens of the gallery on a phone.
  shop: 60,
  // The most-kept fish not on a shop list (POPULAR in @aq/schema): male, female, young, a few forms and the wild fish.
  popular: 40,
  // Written about by two or more sources (a breed: two or more sites): readers arrive from those articles wanting to see
  // more than the page photos.
  covered: 30,
  // Every other species, plant and breed: the owner's floor, enough for a gallery page (it needs 6) with room for variety.
  rest: 20,
}
export const TIER_ORDER: Tier[] = ['staple', 'shop', 'popular', 'covered', 'rest']

export type PlanItem = { kind: GalleryKind; id: string; tier: Tier; target: number }

/** Distinct sources writing about each page of a kind: its sections' sources; a breed's, the sites its research read. */
async function coverage(root: string, kind: GalleryKind): Promise<Map<string, number>> {
  const ids = await readdir(join(root, 'content', kind)).catch(() => [] as string[])
  return new Map(await Promise.all(ids.map(async id => {
    const e = JSON.parse(await readFile(join(root, 'content', kind, id, 'entity.json'), 'utf8').catch(() => '{}')) as { sections?: { source: string }[]; sources?: { url: string }[] }
    const from = kind === 'breeds' ? (e.sources ?? []).map(s => s.url.replace(/^https?:\/\/(?:www\.)?([^/?#]+).*$/i, '$1').toLowerCase()) : (e.sections ?? []).map(s => s.source)
    return [id, new Set(from).size] as const
  })))
}

/**
 * Every species, plant and breed page with its tier and target, most popular first: the staples, what fish (or plant)
 * shops sell and the bred fish they keep most, the most-kept fish, then pages two or more sources write about, then the
 * rest; within a tier, list order, then the pages most sources write about. A gallery is a file by page id
 * (content/gallery/<id>.json), so an id two kinds share stops the plan rather than give both pages one gallery.
 */
export async function galleryPlan(root: string, langs: ShopLang[] = ['vi', 'id', 'th']): Promise<PlanItem[]> {
  const pages = { species: await coverage(root, 'species'), plants: await coverage(root, 'plants'), breeds: await coverage(root, 'breeds') }
  const shop: Record<GalleryKind, string[]> = { species: await shopIds(root, langs), plants: await shopIds(root, langs, 'plants'), breeds: POPULAR_BREEDS }
  const popular = POPULAR.map(slugify)
  const items: (PlanItem & { rank: number; sources: number })[] = []
  for (const kind of KINDS) {
    for (const [id, sources] of pages[kind]) {
      const twice = KINDS.find(k => k !== kind && pages[k].has(id))
      if (twice) throw new Error(`gallery: "${id}" is both a ${kind} page and a ${twice} page, and a gallery is one file by id`)
      const at = (list: string[]) => list.indexOf(id)
      const [tier, rank]: [Tier, number] = kind === 'species' && at(STAPLE_SPECIES) >= 0 ? ['staple', at(STAPLE_SPECIES)]
        : at(shop[kind]) >= 0 ? ['shop', at(shop[kind])]
        : kind === 'species' && at(popular) >= 0 ? ['popular', at(popular)]
        : sources >= 2 ? ['covered', 0] : ['rest', 0]
      items.push({ kind, id, tier, target: TARGETS[tier], rank, sources })
    }
  }
  const t = (x: PlanItem) => TIER_ORDER.indexOf(x.tier)
  return items
    .sort((a, b) => t(a) - t(b) || a.rank - b.rank || b.sources - a.sources || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.id.localeCompare(b.id))
    .map(({ kind, id, tier, target }) => ({ kind, id, tier, target }))
}
