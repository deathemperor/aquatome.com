import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { appIndex, type AppIndex } from '../src/lib/app-index'
import { APP_LATEST, appLatest, type AppLatest } from '../src/lib/app-latest'
import { getContent } from '../src/lib/content'
import { LANGS, served } from '../src/lib/i18n'
import { appHref, appPage, DIST } from './dist'
import { withoutVi } from '../worker/paths'

const json = <T>(path: string): T => JSON.parse(readFileSync(`${DIST}${path}`, 'utf8'))
// Every page of the web list (lib/changelog.ts PER rows each), so the file's 200 are held to the rows past the first page.
const webRows = (web: string) => {
  const rows = []
  for (let n = 1, at = web; existsSync(`${DIST}${withoutVi(at)}index.html`); at = `${web}trang/${++n}/`) {
    rows.push(...appPage(at).dom.querySelectorAll('[data-changelog] li'))
  }
  return rows
}

// The app's "Mới cập nhật" is the site's: the same pages in the same order, with their dates, "Mới" or "Cập nhật" and
// sources, each a page the app index lists (which gives the app its name, kind and picture).
test("what's new for the app is the site's list, each page one the app index lists", () => {
  const latest = json<AppLatest>('/app/latest/vi.json')
  expect(latest.version).toBe(1)
  expect(latest.lang).toBe('vi')
  expect(latest.web).toBe('/vi/moi-cap-nhat/')
  const rows = webRows(latest.web)
  expect(rows.length).toBeGreaterThan(0)
  expect(latest.entries).toEqual(rows.slice(0, APP_LATEST).map(li => {
    const act = li.querySelector('.act')!.text.trim()
    return {
      date: li.querySelector('time')!.getAttribute('datetime'),
      path: appHref(li.querySelector('a')!.getAttribute('href')!),
      action: act.startsWith('Mới') ? 'new' : 'updated',
      source: act.split(' · ')[1],
    }
  }))
  const listed = new Set(json<AppIndex>('/app/vi.json').items.map(i => i.path))
  for (const e of latest.entries) expect(listed, e.path).toContain(e.path)
})

// Only where the site has the page: the other languages' apps show none, as their sites don't.
test("an index names its what's new only where the site has the page", () => {
  expect(json<AppIndex>('/app/vi.json').latest).toBe('/app/latest/vi.json')
  for (const lang of LANGS) {
    const has = served(lang, '/vi/moi-cap-nhat/')
    expect(json<AppIndex>(`/app/${lang}.json`).latest, lang).toBe(has ? `/app/latest/${lang}.json` : undefined)
    expect(existsSync(`${DIST}/app/latest/${lang}.json`), lang).toBe(has)
  }
})

// Each language's entries are keys of its own index (its words and slugs, its hidden and untranslated pages left out), for
// when its site has the page too.
test("every entry is its page's key in that language's app index", async () => {
  for (const lang of LANGS) {
    const c = await getContent(lang)
    const listed = new Set(appIndex(lang, c).items.map(i => i.path))
    const { entries } = appLatest(lang, c)
    if (lang === 'vi') expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) expect(listed, `${lang} ${e.path}`).toContain(e.path)
  }
})

test("at most 200 entries, a page's repeats kept, none for a page the index doesn't list", async () => {
  const c = await getContent('vi')
  const listed = c.changelog.find(e => e.id === 'paracheirodon-axelrodi')!
  const many = appLatest('vi', { ...c, changelog: Array.from({ length: 250 }, () => listed) }).entries
  expect(many).toHaveLength(APP_LATEST)
  expect(new Set(many.map(e => e.path)).size).toBe(1)
  expect(appLatest('vi', { ...c, changelog: c.changelog.filter(e => e.id === 'not-in-content') }).entries).toEqual([])
})
