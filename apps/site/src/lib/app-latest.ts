import type { ChangelogEntry, Content } from '@aq/schema'
import { appGuides, appPlants, appSpecies } from './app-index'
import { changelogEntries } from './changelog'
import { appPath, type Lang } from './i18n'

/** How many entries the app's "Mới cập nhật" lists, newest first; the rest are on the web page (`web`). */
export const APP_LATEST = 200

/**
 * What's new for the native app (/app/latest/<lang>.json): the site's /vi/moi-cap-nhat/ as the app lists it. Its own
 * small file, not in the app index (/app/<lang>.json), as it changes with every content push. Each entry is a page the
 * app index lists, by its `path` there, which gives the app its name, kind and picture. Only for a language whose site
 * has the page.
 */
export type AppLatest = {
  version: 1
  lang: Lang
  /**
   * One per changelog entry, as the web list has them (a page updated on two days is there twice). `path`: the page's
   * key in this language's app index. `action`: the changelog's own. `source`: the source's name, as the page gives it.
   */
  entries: { date: string; path: string; action: ChangelogEntry['action']; source: string }[]
  /** The whole list on the web. */
  web: string
}

export function appLatest(lang: Lang, c: Content): AppLatest {
  const listed = new Set([
    ...appSpecies(lang, c).map(s => `species:${s.id}`),
    ...appPlants(lang, c).map(p => `plant:${p.id}`),
    ...appGuides(lang, c).map(g => `guide:${g.id}`),
  ])
  const entries = changelogEntries(c)
    .filter(e => listed.has(`${e.kind}:${e.id}`))
    .slice(0, APP_LATEST)
    .map(e => ({ date: e.date, path: appPath(lang, e.href), action: e.action, source: c.sources[e.source]?.name ?? e.source }))
  return { version: 1, lang, entries, web: appPath(lang, '/vi/moi-cap-nhat/') }
}
