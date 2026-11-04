// Post-build: dist/_ab/content.json, what the site's content is, for the owner's dashboard (worker/admin/content.ts).
// Reads content/ (CONTENT_ROOT), the engine's state (ENGINE_STATE, default: beside the content root; absent in the fixture
// build, so its section is null) and the build output (dist/). /_ab/* runs the Worker first, which serves /_ab only to the
// owner and this file to nobody: the Worker reads it itself through its ASSETS binding.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { speciesDepth } from '@aq/schema/depth'
import { isAllowedLicence } from '@aq/schema/licence'
import { POPULAR, STAPLE_SPECIES } from '@aq/schema/staples'
import { setsCookies } from '@aq/schema/thumb'
import { langOf, toVi } from '../src/lib/i18n.ts'
import { VI_SECTIONS, withoutVi } from '../worker/paths.ts'
import type { ByLang, ContentStats, EngineStats, EntityKind, Gap, GapKey, Lang, PageKind, PageRow, PhotoStats, SourceRow, Totals } from '../worker/admin/content-shape.ts'

export const MAX_BYTES = 1_000_000
const LANGS: Lang[] = ['vi', 'id', 'th']
const GAP_LIST = 50
/** Engine rules this mirrors, kept in step by test/content-stats.test.ts: a video's 3 tries (youtube.ts), a page's (state.ts), REWRITE_V (vi-backfill.ts). */
export const MAX_ATTEMPTS = 3
export const REWRITE_V = 2

// Content files are read as the engine wrote them, without the schema's parser: the backfill runs this on old commits too.
type Json = Record<string, any>
const read = (f: string): Json | undefined => {
  try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return undefined }
}
const dirs = (d: string) => (existsSync(d) ? readdirSync(d).filter(f => statSync(join(d, f)).isDirectory()).sort() : [])
const files = (d: string) => (existsSync(d) ? readdirSync(d).filter(f => f.endsWith('.json')).sort() : [])

/** One item of content/<dir>: its entity and the translations it has (a page needs entity.json and <lang>.json). */
type Item = { id: string; e: Json; t: Partial<Record<Lang, Json>> }
function items(root: string, dir: string): Item[] {
  return dirs(join(root, dir)).flatMap(id => {
    const e = read(join(root, dir, id, 'entity.json'))
    const vi = read(join(root, dir, id, 'vi.json'))
    if (!e || !vi) return []
    const t: Item['t'] = { vi }
    for (const l of ['id', 'th'] as const) { const x = read(join(root, dir, id, `${l}.json`)); if (x) t[l] = x }
    return [{ id, e, t }]
  })
}

const ENTITY_KINDS: EntityKind[] = ['fish', 'breed', 'plant', 'guide', 'videoGuide', 'series', 'glossary', 'equipment', 'place', 'product']
const zeroKinds = <T>(f: () => T) => Object.fromEntries(ENTITY_KINDS.map(k => [k, f()])) as Record<EntityKind, T>

/** A built page's h1 as text. */
export function h1Of(html: string): string {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (!m) return /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  return m[1]!.replace(/<[^>]*>/g, ' ').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, c: string) =>
    c[0] === '#' ? String.fromCodePoint(Number(c[1] === 'x' || c[1] === 'X' ? `0${c.slice(1)}` : c.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[c.toLowerCase()]!,
  ).replace(/\s+/g, ' ').trim()
}

/** Every page of the languages: its path ("/ca/x/", "/id/ikan/x/") and its h1. Vietnamese ones are the home page and its sections. */
function builtPages(dist: string): { path: string; title: string }[] {
  const out: { path: string; title: string }[] = []
  const walk = (dir: string, path: string, only?: readonly string[]) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) { if (!only || only.includes(f)) walk(p, `${path}${f}/`) }
      else if (f === 'index.html') out.push({ path, title: h1Of(readFileSync(p, 'utf8')) })
    }
  }
  if (existsSync(join(dist, 'index.html'))) walk(dist, '/', VI_SECTIONS)
  for (const l of LANGS) if (l !== 'vi' && existsSync(join(dist, l))) walk(join(dist, l), `/${l}/`)
  return out
}

type Slugs = Record<Lang, Map<string, string>> // slug → item id, per language
const slugMap = (xs: Item[]): Slugs => {
  const m = { vi: new Map(), id: new Map(), th: new Map() } as Slugs
  for (const x of xs) for (const l of LANGS) if (x.t[l]?.slug) m[l].set(x.t[l]!.slug, x.id)
  return m
}

/** What a built page is, from its address: the section (in its Vietnamese form) and, for an item's page, the item's slug. */
export function classify(path: string, s: { fish: Slugs; breed: Slugs; plant: Slugs; guide: Slugs; video: Set<string>; glossary: Slugs; place: Set<string>; series: Slugs; product: Slugs }): [PageKind, string?] {
  const lang = langOf(path)
  const seg = toVi(path).split('/').slice(2, -1) // "/vi/ca/x/anh/" → ['ca', 'x', 'anh']
  const [section, a, b] = seg
  const id = (m: Slugs, slug?: string) => (slug ? m[lang].get(slug) : undefined)
  if (!section || ['tim-kiem', 'moi-cap-nhat', 'kham-pha'].includes(section)) return ['list']
  if (seg.length >= 3 && seg.at(-2) === 'trang' && /^\d+$/.test(seg.at(-1)!)) return ['list']
  if (!a) return [section === 'cong-cu' ? 'tool' : ['ca', 'cay', 'huong-dan', 'video', 'thuat-ngu', 'thiet-bi', 'nguon-goc', 'phan-loai'].includes(section) ? 'list' : 'other']
  const one = (kind: PageKind, x?: string): [PageKind, string?] => (x ? [kind, x] : ['other'])
  switch (section) {
    case 'ca': {
      const fish = id(s.fish, a), breed = id(s.breed, a)
      if (b === 'anh') return one('gallery', fish ?? breed)
      return fish ? ['fish', fish] : one('breed', breed)
    }
    case 'cay': return b === 'anh' ? one('gallery', id(s.plant, a)) : one('plant', id(s.plant, a))
    case 'huong-dan': { const g = id(s.guide, a); return g ? [s.video.has(g) ? 'videoGuide' : 'guide', g] : ['other'] }
    case 'video': return a === 'kenh' ? ['list'] : one('series', id(s.series, a))
    case 'thuat-ngu': return one('glossary', id(s.glossary, a))
    case 'thiet-bi': return ['equipment', a]
    case 'nguon-goc': return one('place', s.place.has(seg.at(-1)!) ? seg.at(-1) : undefined) // addressed by the places' ids
    case 'phan-loai': return ['taxon']
    case 'nhom': return ['group']
    case 'san-pham': return one('product', id(s.product, a))
    case 'cong-cu': return ['tool']
    default: return ['other']
  }
}

/** The licence's family, without its version and port: "CC BY-SA 3.0 de" → "CC BY-SA"; a source's own permission → "permission". */
export function licenceFamily(p: Json): string {
  if (p.source) return 'permission'
  const l = String(p.licence ?? '')
  return /^cc0/i.test(l) ? 'CC0' : /^cc by-sa/i.test(l) ? 'CC BY-SA' : /^cc by/i.test(l) ? 'CC BY' : /^(public domain|pd)\b/i.test(l) ? 'Public domain' : /unsplash/i.test(l) ? 'Unsplash' : l
}
/** Where a photo comes from: the source that gave permission, else the open-licence site it was copied from. */
export function photoOrigin(p: Json): string {
  if (p.source) return p.source
  try {
    const u = new URL(p.url)
    if (u.host === 'media.aquatome.com') return u.pathname.split('/')[1] || u.host
    return /wikimedia/.test(u.host) ? 'commons' : /inaturalist/.test(u.host) ? 'inaturalist' : /unsplash/.test(u.host) ? 'unsplash' : u.host.replace(/^www\./, '')
  } catch { return '?' }
}

export type StatsInput = { contentRoot: string; engineState?: string; dist?: string; publicBuild: boolean; hidden?: Set<string>; now?: Date }

export function computeContentStats(o: StatsInput): ContentStats {
  const root = o.contentRoot
  const now = o.now ?? new Date()
  const sourcesInfo = read(join(root, 'sources.json')) ?? {}
  const textOk = (s: string) => !o.publicBuild || sourcesInfo[s]?.publish === true
  const photoOk = (s: string) => !o.publicBuild || sourcesInfo[s]?.publish === true || sourcesInfo[s]?.publish === 'photos'
  const licenceOk = (p: Json) => (p.source ? photoOk(p.source) : isAllowedLicence(String(p.licence ?? '')))
  const cookie = (url: string) => { try { return setsCookies(url) } catch { return false } }
  /** Photos as the build shows them (@aq/schema load.ts cleanPhotos). */
  const shown = (ps: Json[] = []) => ps.filter(p => licenceOk(p) && !(o.publicBuild && cookie(p.url)))
  const sectionsOf = (e: Json) => ((e.sections ?? []) as Json[]).filter(s => textOk(s.source))

  const species = items(root, 'species')
  const breeds = items(root, 'breeds')
  const plants = items(root, 'plants')
  const guides = items(root, 'guides')
  const glossary = items(root, 'glossary')
  const places = items(root, 'places')
  const products = items(root, 'products')
  const series = files(join(root, 'series')).flatMap(f => { const x = read(join(root, 'series', f)); return x ? [{ id: String(x.id), e: x, t: { vi: x.vi } } as Item] : [] })
  const isVideo = (g: Item) => !!g.e.video
  // A page in a language needs its item to have text the build may show (load.ts drops fish and plants without, and guides from a held-back source).
  const fishPages = species.filter(x => sectionsOf(x.e).length > 0)
  const plantPages = plants.filter(x => sectionsOf(x.e).length > 0)
  const guidePages = guides.filter(x => textOk(x.e.source))

  const count = (xs: Item[]) => ({ total: xs.length, id: xs.filter(x => x.t.id).length, th: xs.filter(x => x.t.th).length })
  const equip = (l: Lang) => files(l === 'vi' ? join(root, 'equipment') : join(root, 'equipment', l)).length
  const inventory: ContentStats['inventory'] = {
    fish: count(species), breed: count(breeds), plant: count(plants),
    guide: count(guides.filter(g => !isVideo(g))), videoGuide: count(guides.filter(isVideo)),
    series: count(series), glossary: count(glossary), equipment: { total: equip('vi'), id: equip('id'), th: equip('th') },
    place: count(places), product: count(products),
  }

  // ——— Built pages ———
  let pages: ContentStats['pages'] = null
  let built: ContentStats['built'] = null
  if (o.dist && existsSync(o.dist)) {
    const s = {
      fish: slugMap(species), breed: slugMap(breeds), plant: slugMap(plants), guide: slugMap(guides), video: new Set(guides.filter(isVideo).map(g => g.id)),
      glossary: slugMap(glossary), place: new Set(places.map(p => p.id)), series: slugMap(series), product: slugMap(products),
    }
    pages = {}
    const total: ByLang = [0, 0, 0]
    const byKind: Partial<Record<PageKind, ByLang>> = {}
    for (const p of builtPages(o.dist)) {
      const [kind, id] = classify(p.path, s)
      ;(pages[kind] ??= []).push(id ? [p.path, p.title, id] : [p.path, p.title])
      const li = LANGS.indexOf(langOf(p.path))
      total[li]++
      ;(byKind[kind] ??= [0, 0, 0])[li]++
    }
    built = { total, byKind }
  }

  // ——— Sources: items with each source's text ———
  const sources: ContentStats['sources'] = {}
  const src = (id: string) => (sources[id] ??= { name: String(sourcesInfo[id]?.name ?? id), fish: 0, plant: 0, guide: 0 })
  for (const x of fishPages) for (const s of new Set(sectionsOf(x.e).map(s => String(s.source)))) src(s).fish++
  for (const x of plantPages) for (const s of new Set(sectionsOf(x.e).map(s => String(s.source)))) src(s).plant++
  for (const x of guidePages) src(String(x.e.source)).guide++

  // ——— Photos ———
  const photos: PhotoStats = { pages: 0, byOrigin: {}, byLicence: {}, covered: {}, waitingMirror: 0, gallery: { pages: 0, photos: 0 } }
  for (const [kind, xs] of [['fish', fishPages], ['plant', plantPages], ['breed', breeds]] as const) {
    let withPhoto = 0
    for (const x of xs) {
      const ps = shown(x.e.photos)
      if (ps.length) withPhoto++
      photos.pages += ps.length
      for (const p of ps) {
        photos.byOrigin[photoOrigin(p)] = (photos.byOrigin[photoOrigin(p)] ?? 0) + 1
        photos.byLicence[licenceFamily(p)] = (photos.byLicence[licenceFamily(p)] ?? 0) + 1
      }
      photos.waitingMirror += ((x.e.photos ?? []) as Json[]).filter(p => licenceOk(p) && cookie(p.url)).length
    }
    photos.covered[kind] = { with: withPhoto, of: xs.length }
  }
  for (const f of files(join(root, 'gallery'))) {
    const n = shown(read(join(root, 'gallery', f))?.photos).length
    if (n) { photos.gallery.pages++; photos.gallery.photos += n }
  }

  // ——— Gaps ———
  const hidden = o.hidden ?? new Set<string>()
  const engineHere = !!o.engineState && existsSync(o.engineState)
  // The rewrite's record (none yet: nothing rewritten); without engine state at all, the oldVi gaps are left out.
  const rewrite = engineHere ? (read(join(o.engineState!, 'vi-rewrite.json')) ?? {}) : undefined
  const staple = new Map(STAPLE_SPECIES.map((id, i) => [id, i]))
  const popular = new Map(POPULAR.map((n, i) => [n.toLowerCase(), i]))
  const rank = (x: Item) => staple.get(x.id) ?? STAPLE_SPECIES.length + (popular.get(String(x.e.scientificName ?? '').toLowerCase()) ?? POPULAR.length)
  const ordered = (xs: Item[]) => [...xs].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
  const prefix: Partial<Record<EntityKind, string>> = { fish: 'ca', breed: 'ca', plant: 'cay', guide: 'huong-dan', videoGuide: 'huong-dan', glossary: 'thuat-ngu' }
  const viPath = (kind: EntityKind, x: Item) => `/${prefix[kind]}/${x.t.vi!.slug}/`
  const gaps: ContentStats['gaps'] = {}
  const gap = (kind: EntityKind, key: GapKey, xs: Item[], test: (x: Item) => boolean, by?: Record<string, (x: Item) => boolean>) => {
    const hit = ordered(xs.filter(x => !hidden.has(viPath(kind, x)) && test(x)))
    const g: Gap = { n: hit.length, top: hit.slice(0, GAP_LIST).map(x => [viPath(kind, x), String(x.t.vi!.name)]) }
    if (by) g.by = Object.fromEntries(Object.entries(by).map(([k, f]) => [k, hit.filter(f).length]))
    ;(gaps[kind] ??= {})[key] = g
  }
  const noPhoto = (x: Item) => shown(x.e.photos).length === 0
  const latinName = (x: Item) => String(x.t.vi!.name).toLowerCase().includes(String(x.e.scientificName).toLowerCase())
  const summary = (x: Item) => read(join(root, 'summaries', `${x.id}.json`))?.review === 'approved'
  const KEY_FACTS = ['tempC', 'ph', 'sizeCm'] as const
  const fishFact = (f: string) => (x: Item) => ((x.e.dataCard?.[f] ?? []) as Json[]).some(v => !v.hidden && textOk(v.source))
  const breedFact = (f: string) => (x: Item) => ((x.e.care?.[f] ?? []) as Json[]).some(v => !v.hidden)
  const missing = (has: (f: string) => (x: Item) => boolean) => Object.fromEntries(KEY_FACTS.map(f => [f, (x: Item) => !has(f)(x)]))
  /** A page the rewrite has text to work on (vi-backfill.ts jobs): a written guide's body, a term's definition, a fish's or plant's sections. */
  const rewritable = (dir: string) => (x: Item) => {
    const vi = x.t.vi!
    return dir === 'guides' ? x.e.source !== 'youtube' && !!vi.body
      : dir === 'glossary' ? !!vi.definition
      : ((x.e.sections ?? []) as Json[]).some(s => s.key !== 'references' && vi.sections?.[`${s.key}:${s.source}`])
  }
  /** Older Vietnamese: such a page the rewrite hasn't done under this version. */
  const oldVi = (dir: string) => (x: Item) => rewritable(dir)(x) && rewriteDue(rewrite?.[`${dir}/${x.id}`])

  gap('fish', 'noPhoto', fishPages, noPhoto)
  gap('fish', 'noViName', fishPages, latinName)
  gap('fish', 'noSummary', fishPages, x => !summary(x))
  gap('fish', 'noKeyFacts', fishPages, x => KEY_FACTS.some(f => !fishFact(f)(x)), missing(fishFact))
  gap('fish', 'thin', fishPages, x => !speciesDepth(sectionsOf(x.e) as Parameters<typeof speciesDepth>[0]).deep)
  gap('plant', 'noPhoto', plantPages, noPhoto)
  gap('plant', 'noViName', plantPages, latinName)
  gap('breed', 'noPhoto', breeds, noPhoto)
  gap('breed', 'noKeyFacts', breeds, x => KEY_FACTS.some(f => !breedFact(f)(x)), missing(breedFact))
  const rewriteKinds = [['fish', 'species', fishPages], ['plant', 'plants', plantPages], ['guide', 'guides', guidePages.filter(g => !isVideo(g))], ['glossary', 'glossary', glossary]] as const
  if (rewrite) for (const [kind, dir, xs] of rewriteKinds) gap(kind, 'oldVi', xs, oldVi(dir))
  for (const [kind, xs] of [['fish', fishPages], ['plant', plantPages], ['breed', breeds], ['guide', guidePages.filter(g => !isVideo(g))], ['videoGuide', guidePages.filter(isVideo)], ['glossary', glossary]] as const) {
    gap(kind, 'noId', xs, x => !x.t.id)
    gap(kind, 'noTh', xs, x => !x.t.th)
  }

  // ——— Engine ———
  let engine: EngineStats | null = null
  if (engineHere) {
    // The rewrite's progress over the same pages as the oldVi gaps: done, failed (no try left under this version), waiting.
    const progress = { done: 0, waiting: 0, failed: 0 }
    for (const [, dir, xs] of rewriteKinds) for (const x of xs.filter(rewritable(dir))) {
      const st = rewrite?.[`${dir}/${x.id}`]
      if (rewriteDue(st)) progress.waiting++
      else if (st.error && !st.rewritten) progress.failed++
      else progress.done++
    }
    engine = { ...engineStats(o.engineState!, sourcesInfo, now), rewrite: progress }
  }

  const kinds = zeroKinds<ByLang>(() => [0, 0, 0])
  for (const k of ENTITY_KINDS) kinds[k] = [inventory[k].total, inventory[k].id, inventory[k].th]
  const totals: Totals = {
    kinds, built: built?.total ?? null,
    sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.fish + v.plant + v.guide])),
    photos: { pages: photos.pages, gallery: photos.gallery.photos },
  }
  return { v: 1, builtAt: now.toISOString(), publicBuild: o.publicBuild, inventory, built, sources, photos, engine, gaps, pages, totals }
}

/** The rewrite does a page again when it never ran, or did part of it under an older version (vi-backfill.ts `due`). */
const rewriteDue = (s: Json | undefined) => !s || (s.rewritten < s.of && (s.v ?? 1) < REWRITE_V)

function engineStats(dir: string, sourcesInfo: Json, now: Date): Omit<EngineStats, 'rewrite'> {
  const lastRun = read(join(dir, 'last-run.json'))
  const blocks = read(join(dir, '_sources.json')) ?? {}
  const sources: SourceRow[] = []
  // Page sources: those with a state of addresses, and any blocked before it had one. YouTube is the video queue, below.
  const ids = [...new Set([...Object.keys(sourcesInfo), ...Object.keys(blocks)])].filter(id => id !== 'youtube' && (existsSync(join(dir, `${id}.json`)) || blocks[id])).sort()
  for (const id of ids) {
    const state = (read(join(dir, `${id}.json`)) ?? {}) as Record<string, Json>
    const row: SourceRow = { id, name: String(sourcesInfo[id]?.name ?? id), found: 0, done: 0, skipped: 0, waiting: 0, failed: 0, blocked: 0 }
    for (const u of Object.values(state)) {
      row.found++
      if (u.status === 'processed') row.done++
      else if (u.status === 'skipped') row.skipped++
      else if (u.status === 'blocked') row.blocked++
      else if (u.status === 'error' && (u.attempts ?? 0) >= MAX_ATTEMPTS) row.failed++
      else row.waiting++
      if (u.updatedAt && (!row.lastAt || u.updatedAt > row.lastAt)) row.lastAt = u.updatedAt
    }
    const d = lastRun?.perSource?.[id]?.discovered
    if (typeof d === 'number' && d > 0) row.discovered = d
    sources.push(row)
  }
  const needsHuman = Object.entries(blocks).flatMap(([source, b]) => (b && typeof (b as Json).blockedAt === 'string' ? [{ source, since: (b as Json).blockedAt as string }] : []))

  // The video queue (youtube.ts videoGuides): each listed video once, playlists' then single videos', the skipped lists left out.
  const yt = (read(join(dir, 'youtube.json')) ?? {}) as Record<string, Json>
  const lists = (read(join(dir, 'youtube-playlists.json')) ?? []) as Json[]
  const singles = (read(join(dir, 'youtube-videos.json')) ?? []) as Json[]
  const listed = new Set<string>()
  for (const p of lists) if (!p.skip) for (const v of p.videoIds ?? []) listed.add(v)
  for (const v of singles) if (!v.skip) listed.add(v.id)
  const videos: EngineStats['videos'] = {
    listed: listed.size, written: 0, skipped: 0, waiting: 0, failed: 0,
    playlists: { queued: lists.filter(p => !p.skip).length, skipped: lists.filter(p => p.skip).length },
    singles: { queued: singles.filter(v => !v.skip).length, skipped: singles.filter(v => v.skip).length },
    writtenAt: [],
  }
  for (const id of listed) {
    const s = yt[id]
    if (s?.status === 'processed') videos.written++
    else if (s?.status === 'skipped') videos.skipped++
    else if (s?.status === 'error' && (s.attempts ?? 0) >= MAX_ATTEMPTS) videos.failed++
    else videos.waiting++
  }
  // 32 days: the dashboard's 30 whole days and today, in any viewer's time zone.
  const since = now.getTime() - 32 * 86_400_000
  videos.writtenAt = Object.values(yt).filter(s => s.status === 'processed' && Date.parse(String(s.updatedAt)) >= since).map(s => new Date(String(s.updatedAt)).toISOString()).sort()

  return {
    sources, needsHuman, videos,
    lastRun: lastRun ? { startedAt: String(lastRun.startedAt), finishedAt: String(lastRun.finishedAt), needsHuman: lastRun.needsHuman ?? [], errors: (lastRun.errors ?? []).length, changed: (lastRun.changed ?? []).length } : null,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contentRoot = resolve(process.env.CONTENT_ROOT ?? resolve(process.cwd(), '../../content'))
  const dist = resolve(process.env.OUT_DIR ?? fileURLToPath(new URL('../dist', import.meta.url)))
  const hiddenFile = process.env.HIDDEN_FILE ?? resolve(process.cwd(), '.hidden.json')
  const hidden = new Set(Object.keys(read(hiddenFile) ?? {}).map(withoutVi))
  const stats = computeContentStats({ contentRoot, engineState: resolve(process.env.ENGINE_STATE ?? join(contentRoot, '../engine-state')), dist, publicBuild: process.env.PUBLIC_BUILD === '1', hidden })
  const body = JSON.stringify(stats)
  mkdirSync(join(dist, '_ab'), { recursive: true })
  writeFileSync(join(dist, '_ab', 'content.json'), body)
  const n = Object.values(stats.pages ?? {}).reduce((a, xs) => a + xs.length, 0)
  console.log(`content-stats: ${n} pages, ${Math.round(Buffer.byteLength(body) / 1024)} KB${stats.engine ? '' : ' (no engine state)'}`)
  // A budget, not a limit (an asset may be 25 MiB): over it, a warning on the deploy's run rather than a failed deploy,
  // since the dashboard's file shouldn't hold back the site's content. At about 90 bytes a page, it fits some 10,000 pages.
  if (Buffer.byteLength(body) > MAX_BYTES) console.warn(`::warning title=content-stats::dist/_ab/content.json is ${Math.round(Buffer.byteLength(body) / 1024)} KB, over its 1 MB budget: make the page index smaller`)
}
