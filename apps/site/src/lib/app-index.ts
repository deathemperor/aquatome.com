import { QUALITY_THRESHOLD, type Content, type Photo, type Traits } from '@aq/schema'
import type { SpeciesIndexItem } from '../scripts/filter'
import { smallSrc } from './img'
import { localizePath, served, translator, type Lang } from './i18n'
import { mentionIndex } from './mentions'
import { toIndexItem } from './species-index'

/**
 * The handbook's index for the native app (/app/<lang>.json): every indexable page of one language that the app can
 * search and list. The app opens the page itself in a web view, so an item is only what a search result shows.
 */
export type AppItem = {
  kind: 'fish' | 'plant' | 'guide' | 'glossary' | 'tool'
  /** The page's content id, the same in every language (fish, plants): what a saved tank lists them by. */
  id?: string
  name: string
  /** Scientific name (fish, plants). */
  sub?: string
  /** Other names, for search. */
  aka?: string[]
  /** The page in this language: "/id/ikan/<slug>/". */
  path: string
  /** A small photo (about 480 px wide). */
  img?: string
  /** A guide's subject, as the guide list groups them (GuideEntity['kind']: setup, care, plantCare, …). */
  section?: string
  /** The fish and plants a guide names, by content id, as its page links them ("Bài viết nhắc đến loài này"). */
  about?: string[]
} & Partial<Facts>
/**
 * A species' figures and behaviour (fish), named as the tank-mates tool names them (SpeciesIndexItem), so the app checks
 * a tank with the tool's own code. Each one the content has no value for is left out; breeds have none.
 */
export type Facts = Pick<SpeciesIndexItem, (typeof FACTS)[number]>
const FACTS = ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'temperament', 'finNipper', 'schoolMin', 'difficulty'] as const
export type AppIndex = { version: 1; lang: Lang; items: AppItem[] }

/** `traits`: behaviour by species id (lib/traits.ts), as the tank-mates tool reads it. */
export function appIndex(lang: Lang, c: Content, traits: Map<string, Traits> = new Map()): AppIndex {
  const t = translator(lang)
  const at = (viPath: string) => localizePath(lang, viPath)
  const img = (photos: Photo[]) => (photos[0] ? smallSrc(photos[0]) : undefined)
  const aka = (names: string[]) => (names.length ? names : undefined)
  const items: AppItem[] = []
  if (served(lang, '/vi/ca/x/')) {
    // A thin page (depth.ts) is out of search engines, not out of the app: its translation passed, it is only short.
    const listed = (q: Content['species'][number]['t']['quality']) => q.indexable || (q.reason === 'thin' && q.score >= QUALITY_THRESHOLD)
    for (const s of c.species) {
      if (!listed(s.t.quality)) continue
      const f = toIndexItem(s, traits.get(s.id))
      const facts = Object.fromEntries(FACTS.map(k => [k, f[k]]))
      items.push(clean({ kind: 'fish', id: s.id, name: s.t.name, sub: s.scientificName, aka: aka(s.t.altNames), path: at(`/vi/ca/${s.t.slug}/`), img: img(s.photos), ...facts }))
    }
    for (const b of c.breeds) {
      if (listed(b.t.quality)) items.push(clean({ kind: 'fish', id: b.id, name: b.t.name, aka: aka(b.t.altNames), path: at(`/vi/ca/${b.t.slug}/`), img: img(b.photos) }))
    }
  }
  if (served(lang, '/vi/cay/x/')) {
    for (const p of c.plants) {
      if (p.t.quality.indexable) items.push(clean({ kind: 'plant', id: p.id, name: p.t.name, sub: p.scientificName, aka: aka(p.t.altNames), path: at(`/vi/cay/${p.t.slug}/`), img: img(p.photos) }))
    }
  }
  if (served(lang, '/vi/huong-dan/x/')) {
    const mentions = mentionIndex(c).guides
    for (const g of c.guides) {
      if (!g.t.quality.indexable) continue
      const m = mentions.get(g.id)
      const about = m ? [...m.species.map(s => s.id), ...m.plants.map(p => p.id)] : []
      items.push(clean({ kind: 'guide', name: g.t.name, aka: aka(g.t.altNames), path: at(`/vi/huong-dan/${g.t.slug}/`), img: img(g.photos), section: g.kind, about: about.length ? about : undefined }))
    }
  }
  if (served(lang, '/vi/thuat-ngu/x/')) {
    for (const g of c.glossary) {
      if (g.t.quality.indexable) items.push(clean({ kind: 'glossary', name: g.t.name, aka: aka(g.t.altNames), path: at(`/vi/thuat-ngu/${g.t.slug}/`) }))
    }
  }
  // The tools: the page of calculators, and the ones with pages of their own.
  for (const [vi, name] of [['/vi/cong-cu/', t('Công cụ')], ['/vi/cong-cu/nuoi-chung/', t('Nuôi chung được không? Thả bao nhiêu con?')], ['/vi/cong-cu/the-tich-be/', t('Bể bao nhiêu lít?')], ['/vi/cong-cu/den-chihiros/', t('Đèn Chihiros')], ['/vi/cong-cu/be-cua-toi/', t('Bể của tôi')]] as const) {
    if (served(lang, vi)) items.push({ kind: 'tool', name, path: at(vi) })
  }
  return { version: 1, lang, items }
}

/** Leaves out empty fields, so the file stays small. */
const clean = (i: AppItem): AppItem => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as AppItem
