// Checks on a built page's HTML, for what only the rendered page shows: the same picture twice, a figure of another fish
// under a fish's heading, a name linked to the wrong fish, a fish's section without its photo, contents that disagree
// with the headings, a heading with nothing under it. The tests run it over every fixture page; the browser checks run it
// on their sample of pages (invariants.spec.ts, live in watch.yml); `pnpm exec tsx scripts/page-check.ts <dist> [content]`
// counts every page of any build, per check.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HTMLElement, parse } from 'node-html-parser'
import { headingSubject, loadAll, PictureSet, pictureOf, type LinkTarget, type PictureHashes } from '@aq/schema'
import { LANGS, langOf, localizePath, type Lang } from '../src/lib/i18n'
import { linkTargets } from '../src/lib/mentions'

export const CHECKS = {
  repeat: 'the same picture twice',
  'wrong-fish': 'a figure of another fish under a fish\'s heading',
  'wrong-link': 'a name linked to a fish with another scientific name than the one in brackets',
  'missing-photo': 'a fish\'s section without a photo, though the fish has one',
  toc: 'contents that disagree with the headings, or numbers out of order',
  'empty-section': 'a heading with nothing under it',
} as const
export type Check = keyof typeof CHECKS
export type Problem = { check: Check; detail: string }

/** What the checks need to know about the site: picture hashes, and each fish's, plant's and man-made fish's page. */
export type Facts = {
  hashes: PictureHashes
  /** A living thing's page (by its path in every language) → its target key ("species:betta-splendens"). */
  byPath: Map<string, string>
  /** By key: scientific name and every name, lowercased; its photos' addresses. */
  living: Map<string, { names: Set<string>; photos: Set<string> }>
  /** A photo's address → the page it belongs to (its key). */
  owner: Map<string, string>
  targets: Record<Lang, LinkTarget[]>
  /** Genera the site has: a capitalised pair in brackets starting with one is a scientific name ("German blue ram" is not). */
  genera: Set<string>
}

/** The site's facts from the content a build was made from. */
export async function loadFacts(root: string): Promise<Facts> {
  const facts: Facts = { hashes: {}, byPath: new Map(), living: new Map(), owner: new Map(), targets: {} as Record<Lang, LinkTarget[]>, genera: new Set() }
  for (const lang of LANGS) {
    const c = await loadAll({ root, lang, publicBuild: false })
    facts.hashes = c.pictureHashes
    facts.targets[lang] = linkTargets(c)
    const add = (key: string, href: string, names: string[], photos: { url: string }[]) => {
      facts.byPath.set(localizePath(lang, href), key)
      const l = facts.living.get(key) ?? facts.living.set(key, { names: new Set(), photos: new Set() }).get(key)!
      for (const n of names) l.names.add(n.toLowerCase())
      for (const p of photos) { l.photos.add(p.url); if (!facts.owner.has(p.url)) facts.owner.set(p.url, key) }
    }
    for (const s of c.species) facts.genera.add(s.genus)
    for (const p of c.plants) facts.genera.add(p.scientificName.split(' ')[0]!)
    for (const s of c.species) add(`species:${s.id}`, `/vi/ca/${s.t.slug}/`, [s.scientificName, s.t.name, ...s.t.altNames], s.photos)
    for (const p of c.plants) add(`plant:${p.id}`, `/vi/cay/${p.t.slug}/`, [p.scientificName, p.t.name, ...p.t.altNames], p.photos)
    for (const b of c.breeds) add(`breed:${b.id}`, `/vi/ca/${b.t.slug}/`, [b.t.name, ...b.t.altNames], b.photos)
  }
  return facts
}

const text = (el: HTMLElement) => el.textContent.replace(/\s+/g, ' ').trim()
const BRACKETED = /^\s*\(\s*([A-Z][a-z]+ [a-z]{3,}(?: [a-z]{3,})?)\s*\)/
const NUMBERED = /^(\d{1,2})[.)]\s/
const level = (el: HTMLElement) => /^H([2-6])$/.exec(el.tagName)?.[1]
const shown = (img: HTMLElement) => { for (let n = img.parentNode; n; n = n.parentNode) if (n.rawTagName?.toLowerCase() === 'template') return false; return !!img.getAttribute('src') }

/** A heading's section: the elements after it, up to the next heading of its level or higher. */
function section(h: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  const lv = Number(level(h))
  for (let n = h.nextElementSibling; n; n = n.nextElementSibling) {
    const l = level(n)
    if (l && Number(l) <= lv) break
    out.push(n)
  }
  return out
}

export function checkPage(path: string, html: string, facts: Facts): Problem[] {
  const out: Problem[] = []
  const root = parse(html)
  const lang = langOf(path)
  const owner = (src: string) => facts.owner.get(pictureOf(src, {}).key)

  // The same picture twice, whatever its file.
  const seen = new PictureSet(facts.hashes)
  for (const img of root.querySelectorAll('img').filter(shown)) {
    const src = img.getAttribute('src')!
    if (seen.has(src)) out.push({ check: 'repeat', detail: src })
    seen.add(src)
  }

  const scientific = (name: string) => facts.genera.has(name.split(' ')[0]!)
  for (const prose of root.querySelectorAll('.prose')) {
    const headings = prose.querySelectorAll('h2, h3').filter(h => h.parentNode === prose)
    // A list of fish (two or more headings each about a different one): each such heading is that fish's section.
    const subjects = new Map(headings.filter(h => h.tagName === 'H3').map(h => [h, headingSubject(text(h), facts.targets[lang])]))
    const list = new Set([...subjects.values()].filter(Boolean).map(s => s!.key)).size >= 2
    let last = 0
    for (const h of headings) {
      const title = text(h)
      const body = section(h)
      // A heading with nothing under it.
      if (!body.length || body.every(el => !text(el) && !el.querySelector('img'))) out.push({ check: 'empty-section', detail: title })
      // Numbered headings count up by one, or down by one (a countdown, "Top 5": 5, 4, 3…); a new list starts again at 1.
      const n = Number(NUMBERED.exec(title)?.[1] ?? 0)
      if (n && last && n !== 1 && n !== last + 1 && n !== last - 1) out.push({ check: 'toc', detail: `"${title}" after ${last}` })
      if (n) last = n
      if (h.tagName !== 'H3') continue
      const subject = list ? subjects.get(h) : undefined
      const fish = subject && facts.living.get(subject.key)
      // What each figure under the heading shows: the page its caption links, else the page its photo comes from.
      const figures = body.flatMap(el => (el.tagName === 'FIGURE' ? [el] : el.querySelectorAll('figure')))
      if (subject && fish) {
        for (const f of figures) {
          const a = f.querySelector('figcaption a[href]')
          const img = f.querySelector('img')
          const shows = (a && facts.byPath.get(a.getAttribute('href')!)) ?? (img ? owner(img.getAttribute('src')!) : undefined)
          if (shows && shows !== subject.key) out.push({ check: 'wrong-fish', detail: `${shows} under "${title}"` })
        }
        // Missing only when the fish has a picture the page doesn't show already.
        if ([...fish.photos].some(u => !seen.has(u)) && !body.some(el => el.tagName === 'IMG' || el.querySelector('img'))) out.push({ check: 'missing-photo', detail: `"${title}"` })
      }
      // The heading's name for a fish, linked in its section to a fish with another scientific name.
      const bracket = /\(\s*([A-Z][a-z]+ [a-z]{3,}(?: [a-z]{3,})?)\s*\)/.exec(title)
      if (bracket && scientific(bracket[1]!)) {
        const names = title.slice(0, bracket.index).replace(NUMBERED, '').split(/\s+\/\s+|\s+-\s+/).map(x => x.trim().toLowerCase()).filter(Boolean)
        for (const a of body.flatMap(el => el.querySelectorAll('a[href]'))) {
          const key = facts.byPath.get(a.getAttribute('href')!)
          if (key && names.includes(text(a).toLowerCase()) && !facts.living.get(key)!.names.has(bracket[1]!.toLowerCase())) out.push({ check: 'wrong-link', detail: `"${text(a)}" → ${key}, heading says ${bracket[1]}` })
        }
      }
    }
    // A name linked in the text, then its scientific name in brackets: the linked page must be that species.
    for (const a of prose.querySelectorAll('a[href]')) {
      const key = facts.byPath.get(a.getAttribute('href')!)
      const next = a.nextSibling?.rawText ?? ''
      const sci = BRACKETED.exec(next)?.[1]
      if (key && sci && scientific(sci) && !facts.living.get(key)!.names.has(sci.toLowerCase())) out.push({ check: 'wrong-link', detail: `"${text(a)}" → ${key}, text says ${sci}` })
    }
  }

  // Contents: one entry per heading, its words and order, and the number the list gives it the heading's own.
  const toc = root.querySelector('nav.toc')
  if (toc) {
    const entries = toc.querySelectorAll('a[href^="#"]')
    const ids = root.querySelectorAll('.prose h3[id]')
    if (entries.length !== ids.length) out.push({ check: 'toc', detail: `${entries.length} entries, ${ids.length} headings` })
    entries.forEach((a, i) => {
      const h = root.querySelector(`[id="${a.getAttribute('href')!.slice(1)}"]`)
      const own = h ? text(h) : ''
      if (!h || h !== ids[i]) out.push({ check: 'toc', detail: `entry ${i + 1} "${text(a)}" is not heading ${i + 1}` })
      else if (text(a) !== own.replace(/^(?:\d+[.)]|#\s?\d+[.):]?)\s+/, '')) out.push({ check: 'toc', detail: `entry "${text(a)}" for "${own}"` })
      const n = NUMBERED.exec(own)?.[1]
      const li = a.closest('li')
      const label = li?.getAttribute('value') ?? String(i + 1)
      if (n && n !== label) out.push({ check: 'toc', detail: `entry numbered ${label} for "${own}"` })
    })
  }
  return out
}

/** A page's fish sections (in a list of fish), each with whether it shows a picture. */
export function fishSections(path: string, html: string, facts: Facts): { heading: string; fish: string; photo: boolean }[] {
  const lang = langOf(path)
  return parse(html).querySelectorAll('.prose').flatMap(prose => {
    const hs = prose.querySelectorAll('h3').filter(h => h.parentNode === prose).map(h => ({ h, s: headingSubject(text(h), facts.targets[lang]) }))
    if (new Set(hs.filter(x => x.s).map(x => x.s!.key)).size < 2) return []
    return hs.filter(x => x.s).map(x => ({ heading: text(x.h), fish: x.s!.key, photo: section(x.h).some(el => el.tagName === 'IMG' || !!el.querySelector('img')) }))
  })
}

/** Every page of a build with a problem. */
export function checkDist(dist: string, facts: Facts): { page: string; problems: Problem[] }[] {
  const out: { page: string; problems: Problem[] }[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f === 'index.html' || f === '404.html') {
        const page = p.slice(dist.length).replace(/index\.html$/, '')
        const problems = checkPage(page, readFileSync(p, 'utf8'), facts)
        if (problems.length) out.push({ page, problems })
      }
    }
  }
  walk(dist)
  return out.sort((a, b) => a.page.localeCompare(b.page))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [dist = 'dist', content = '../../content'] = process.argv.slice(2)
  const pages = checkDist(resolve(dist), await loadFacts(resolve(content)))
  console.log(`${pages.length} pages with a problem`)
  for (const check of Object.keys(CHECKS) as Check[]) {
    const hit = pages.filter(p => p.problems.some(x => x.check === check))
    console.log(`  ${check} (${CHECKS[check]}): ${hit.length} pages, ${hit.reduce((n, p) => n + p.problems.filter(x => x.check === check).length, 0)} problems`)
  }
  // Lists of fish among the Vietnamese guides: how many, and how many of their fish sections show a picture.
  const facts = await loadFacts(resolve(content))
  const guides = readdirSync(join(resolve(dist), 'vi/huong-dan')).flatMap(slug => {
    const f = join(resolve(dist), 'vi/huong-dan', slug, 'index.html')
    try { const fs = fishSections(`/vi/huong-dan/${slug}/`, readFileSync(f, 'utf8'), facts); return fs.length ? [{ slug, fs }] : [] } catch { return [] }
  })
  const all = guides.flatMap(g => g.fs)
  console.log(`lists of fish: ${guides.length} guides, ${all.length} fish sections, ${all.filter(x => x.photo).length} with a picture`)
  for (const slug of (process.env.GUIDES ?? '').split(',').filter(Boolean)) {
    const g = guides.find(x => x.slug === slug)
    console.log(`${slug}: ${g ? `${g.fs.filter(x => x.photo).length}/${g.fs.length} fish sections with a picture` : 'not a list'}`)
    for (const x of g?.fs ?? []) console.log(`  ${x.photo ? '✓' : '✗'} ${x.heading}`)
  }
  const only = process.env.CHECK
  for (const p of pages.filter(p => !only || p.problems.some(x => x.check === only)).slice(0, Number(process.env.SHOW ?? 0))) {
    console.log(`${p.page}\n${p.problems.filter(x => !only || x.check === only).map(x => `  ${x.check}: ${x.detail}`).join('\n')}`)
  }
  if (pages.length) process.exitCode = 1
}
