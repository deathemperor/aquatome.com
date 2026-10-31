import type { Content, Photo } from '@aq/schema'
import { smallSrc } from './img'
import { localizePath, served, translator, type Lang } from './i18n'

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
}
export type AppIndex = { version: 1; lang: Lang; items: AppItem[] }

export function appIndex(lang: Lang, c: Content): AppIndex {
  const t = translator(lang)
  const at = (viPath: string) => localizePath(lang, viPath)
  const img = (photos: Photo[]) => (photos[0] ? smallSrc(photos[0]) : undefined)
  const aka = (names: string[]) => (names.length ? names : undefined)
  const items: AppItem[] = []
  if (served(lang, '/vi/ca/x/')) {
    for (const s of [...c.species, ...c.breeds]) {
      if (!s.t.quality.indexable) continue
      const sub = 'scientificName' in s ? s.scientificName : undefined
      items.push(clean({ kind: 'fish', id: s.id, name: s.t.name, sub, aka: aka(s.t.altNames), path: at(`/vi/ca/${s.t.slug}/`), img: img(s.photos) }))
    }
  }
  if (served(lang, '/vi/cay/x/')) {
    for (const p of c.plants) {
      if (p.t.quality.indexable) items.push(clean({ kind: 'plant', id: p.id, name: p.t.name, sub: p.scientificName, aka: aka(p.t.altNames), path: at(`/vi/cay/${p.t.slug}/`), img: img(p.photos) }))
    }
  }
  if (served(lang, '/vi/huong-dan/x/')) {
    for (const g of c.guides) {
      if (g.t.quality.indexable) items.push(clean({ kind: 'guide', name: g.t.name, aka: aka(g.t.altNames), path: at(`/vi/huong-dan/${g.t.slug}/`), img: img(g.photos) }))
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
