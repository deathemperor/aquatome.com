import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { slugify, type GuideEntity, type SourceId } from '@aq/schema'
import { ARCHIVE_POLITE, ArchiveRefused, archiveStops, AsksSpent, cdxQuery, noCopy, type ArchiveReader } from './archive'
import { vnDay } from './ceiling'
import { LlmError, type Llm } from './claude'
import { byHand, cycleOnlyHosts, refused } from './cycle-only'
import { IDEA_SOURCES, ideaHost, NEVER_RESEARCHED, type Drop, type IdeaSource, type Listing } from './idea-sources'
import { isMarketplace } from './marketplaces'
import { htmlToOutline, isChallenge } from './outline'
import { LockBusy, macLock, type Release } from './mac-lock'
import { piece } from './pieces'
import { snapshotHash } from './snapshot'
import { setSourceBlock, sourceBlockedSince } from './state'
import { copiesGiven, makeTopic, topicId, type GivenPage } from './topics'

export { IDEA_SOURCES } from './idea-sources'

/**
 * Vietnamese shops' blogs, read for ideas (content/sources.json: orientation only, the owner's word of 2026-11-03): their
 * posts' titles, never their text. What they write about is what Vietnamese keepers search for; a topic the handbook has
 * no guide on becomes one of AquaTome's own guides, researched like any other (topics.ts), with the shops' posts on it
 * as leads. engine-state/_ideas.json. And a British magazine's features, readers' questions and beginners' pages
 * (`magazine`, the owner's word through the chief of staff, 13 Nov 2026), what keepers anywhere ask, its UK-only topics
 * left out; never its readers' tank visits, whose photos a page of ours couldn't show (the chief of staff, 14 Nov). The
 * sites are listed in idea-sources.ts.
 */
const MAGAZINES = new Set<SourceId>(IDEA_SOURCES.filter(s => s.magazine).map(s => s.id))
const DELAY = 5_000
/** The titles are read again a week on. */
const FRESH_DAYS = 7

type GuideKind = GuideEntity['kind']
const KINDS: GuideKind[] = ['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery']
/**
 * A post: its title as the shop gives it (the address's words, for a sitemap), and its date. `held`: the Archive's index
 * has a good capture of it, for a site read through the Archive (a capture that is a browser check shows only when read).
 */
export type Post = { url: string; title: string; date?: string; held?: true }
/**
 * What came of the post behind a magazine idea's guide (writeMagazine): research cited it; it read it and cited none of it;
 * the Archive had no copy, or only a browser check; none was reached (the day's requests ran out, or the Archive didn't
 * answer); or it would have given too much of the guide (topics.ts POST_SHARE), so the guide was written without it.
 */
export type PostResult = 'cited' | 'not cited' | 'no copy' | 'not reached' | 'too much of one source'
/**
 * The record of a magazine idea's post, all the repository keeps of it (the chief of staff, 21 Nov 2026: the magazine has
 * given no permission to republish, and the repository is public): its own address and title, the copy's date, a hash of
 * its text, and that the Archive was how it was read. Its text is held only by the run that reads it (writeMagazine).
 */
export type PostRecord = { url: string; title?: string; capturedAt?: string; hash?: string; via: 'archive'; result: PostResult }
/**
 * `guide`: the guide written on it; `skipped`: why none was (research found nothing reliable). `fromMagazine`: every post
 * on it is the magazine's, none a shop's. `latest`: the newest of its shops' posts (of all its posts, the magazine's own
 * idea's). `at`: when research was spent on it, what the day's cap counts (writeIdeas).
 */
export type Idea = { topic: string; kind: GuideKind; posts: string[]; sites: number; latest?: string; guide?: string; skipped?: string; fromMagazine?: true; at?: string; post?: PostRecord }
export type IdeasState = {
  readAt?: string
  posts: Partial<Record<SourceId, Post[]>>
  /** Most asked first: by how many shops write on it, then how many of the shops' posts, then the newest. */
  ideas: Idea[]
  /**
   * Before ideas kept their own time (14 Nov 2026), guides written per day (UTC), and of those the magazine's: read for
   * their day alone, so that day's cap still holds, and gone the next.
   */
  written?: Record<string, number>
  magazine?: Record<string, number>
  /** The magazine's read (its record's newest, MagazineState.readAt) the ideas were last made from: a newer one makes them again. */
  magazineAt?: string
}
export type IdeasDeps = { get: (url: string) => Promise<string>; llm: Llm; sleep: (ms: number) => Promise<void>; now: () => Date }
/**
 * `archive`: the Mac's Archive reader (cli.ts archiveReader), the one the sources read through it use. `ledger`: the Mac's
 * file of the magazine's Archive requests (MagazineLedger).
 */
export type MagazineDeps = { get: (url: string) => Promise<string>; sleep: (ms: number) => Promise<void>; now: () => Date; archive: ArchiveReader; ledger: string }

const file = (root: string) => join(root, 'engine-state/_ideas.json')
export const readIdeas = async (root: string): Promise<IdeasState> =>
  ({ posts: {}, ideas: [], ...JSON.parse(await readFile(file(root), 'utf8').catch(() => '{}')) as Partial<IdeasState> })
const save = (root: string, s: IdeasState) => writeFile(file(root), `${JSON.stringify(s, null, 2)}\n`)

/**
 * The magazine's own record (engine-state/_magazine.json), written only by the Mac's `pnpm engine magazine` (the chief of
 * staff, 21 Nov 2026): the Archive's rest is the Mac's, so the Mac alone asks it, and GitHub's ideas step only reads this.
 * `posts`, `readAt`, `tried`: each site's titles (refreshMagazine), when they were read, and its last try through the
 * Archive. `asks`: the Archive's requests by Vietnam's day (asksLeft). `waits`: the days in a row the day's guide waited for
 * the Archive's rest, which the chief of staff reads each morning. `guides`: what came of each of its ideas, by the
 * topic's slug, with its post's record (writeMagazine).
 */
export type MagazineState = {
  readAt?: Partial<Record<SourceId, string>>
  posts: Partial<Record<SourceId, Post[]>>
  tried?: Partial<Record<SourceId, string>>
  asks?: Record<string, { listing?: number; post?: number }>
  waits?: string[]
  guides: Record<string, { guide?: string; skipped?: string; at?: string; post?: PostRecord }>
}
const magazineFile = (root: string) => join(root, 'engine-state/_magazine.json')
export const readMagazine = async (root: string): Promise<MagazineState> =>
  ({ posts: {}, guides: {}, ...JSON.parse(await readFile(magazineFile(root), 'utf8').catch(() => '{}')) as Partial<MagazineState> })
const saveMagazine = (root: string, s: MagazineState) => writeFile(magazineFile(root), `${JSON.stringify(s, null, 2)}\n`)
/**
 * The Mac's own record of the magazine's Archive work (Codex, 21 Nov 2026), kept beside the Archive's rest (archive.ts),
 * outside any checkout: a pages cycle whose tests fail starts again from main and drops the checkout's record. `asks`: the
 * requests by Vietnam's day, each written before it is made; `tried`: the last listing try through the Archive; `waits`:
 * the days in a row the day's guide waited for the Archive's rest. The limits read this. The magazine's record carries a
 * copy for the chief of staff (mirror), which seeds it only when it is missing.
 */
export type MagazineLedger = Pick<MagazineState, 'asks' | 'tried' | 'waits'> & {
  /** The day's guides by Vietnam's day, kept here too, so a cycle that starts again from main writes no second one (Fable, 21 Nov 2026). */
  made?: Record<string, number>
}
async function readLedger(file: string, m: MagazineState): Promise<MagazineLedger> {
  const raw = await readFile(file, 'utf8').catch(() => undefined)
  if (raw !== undefined) return JSON.parse(raw) as MagazineLedger
  return { ...(m.asks ? { asks: m.asks } : {}), ...(m.tried ? { tried: m.tried } : {}), ...(m.waits ? { waits: m.waits } : {}) }
}
/** Written whole or not at all. */
async function saveLedger(file: string, l: MagazineLedger) {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(l)}\n`)
  await rename(tmp, file)
}
/** The ledger's copy in the magazine's record. */
function mirror(m: MagazineState, l: MagazineLedger) {
  if (l.asks) m.asks = l.asks; else delete m.asks
  if (l.tried) m.tried = l.tried; else delete m.tried
  if (l.waits?.length) m.waits = l.waits; else delete m.waits
}
/**
 * One magazine step at a time on the Mac, since its ledger is read and then written at each request. The lock is the Mac's
 * own (mac-lock.ts), freed when its step ends however it ends, so no step takes over a dead one's (Codex, 21 Nov 2026: two
 * could take over the same one and both run). A step that finds it held waits its turn, as a reader waits for the
 * Archive's (the chief of staff, 22 Nov 2026): said once in `log` past 2 minutes, and past 10 it runs nothing (LockBusy,
 * naming the port), which is no refusal, so the cycle logs it and the next cycle runs it. Its record and the ledger are
 * read only once it holds the lock (cli.ts), so a step that waited spends nothing the one before it spent.
 * `port`: the magazine's own on the Mac, which only the CLI names (mac-lock.ts); a test's own.
 */
export async function holdMagazine(port: number, o: Parameters<typeof macLock>[1] = {}): Promise<Release> {
  return macLock(port, o).catch((e: unknown) => { throw e instanceof LockBusy ? new LockBusy(`another magazine step is running, or something else holds the lock: ${e.message}`) : e })
}
/** The magazine's newest read: GitHub's ideas are made again when it is newer than the one they were made from. */
const magazineRead = (m: MagazineState) => Object.values(m.readAt ?? {}).filter((x): x is string => !!x).sort().at(-1)

const unescape = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/**
 * A site that refused us its listing: a 403 or a 429, or an answer of 200 that isn't the listing (a browser check, a page
 * of the site's own, anything else in its place), told by its shape, never its words (the chief of staff, 14 Nov 2026). The
 * source then needs the owner, and its listing isn't fetched again until they've looked (refreshIdeas, `retryBlocked`).
 */
export class ListingRefused extends Error {}
/**
 * A listing's text from the site's answer: a 403 or a 429 as a ListingRefused; any other failure (a 404, a 5xx; a time-out
 * throws before this) as an error, which keeps the site's titles and marks nothing.
 */
export async function listingText(res: Response): Promise<string> {
  // A body that fails on its way (a time-out after the headers) throws as it is: a failure, never an empty listing.
  if (res.ok) return res.text()
  await res.body?.cancel().catch(() => undefined)
  if (res.status === 403 || res.status === 429) throw new ListingRefused(`refused, HTTP ${res.status}`)
  throw new Error(`HTTP ${res.status}`)
}
/**
 * A site's listing, its redirects followed by hand (Codex, 21 Nov 2026): never to a copy site (the Internet Archive's is read
 * only through its reader, on the Mac, under its rest), nor from a shop's listing to the magazine's site.
 */
export const fetchListing = (get: typeof fetch, ua: string) => async (u: string): Promise<string> =>
  listingText(await byHand(get, ua, url => (isMagazinePost(url) && bareHost(url) !== bareHost(u) ? `its listing points to the magazine's site, not followed: ${url}` : undefined))(u))
/** An answer of 200 that isn't the listing asked for: a refusal. */
const notA = (what: string) => new ListingRefused(`refused, not ${what}`)
function json<T>(body: string, what: string): T {
  try { return JSON.parse(body) as T } catch { throw notA(what) }
}
const bareHost = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const MAGAZINE_HOSTS = new Set(IDEA_SOURCES.filter(s => s.magazine).map(ideaHost))
/** A post is the magazine's by its host: a waiting idea keeps posts its site's later listings may no longer have. */
const isMagazinePost = (url: string) => MAGAZINE_HOSTS.has(bareHost(url))
/** The document's first element's name, after a byte-order mark, the XML declaration, comments, a stylesheet's instruction or a doctype. */
const rootElement = (xml: string) => /^(?:\uFEFF)?(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*<([A-Za-z][\w:.-]*)/.exec(xml)?.[1]

/**
 * A site's posts: a sitemap's addresses under the blog's prefix or prefixes (titled by their words), or a WordPress
 * category's posts (100 a page). Only the listing's own shape stands for the site's posts: a sitemap whose document is a
 * urlset with entries on the source's own host, or WordPress's lists, each post on its own host. Any other answer is a
 * refusal (ListingRefused).
 */
export async function listPosts(list: Listing, get: (url: string) => Promise<string>): Promise<Post[]> {
  if (list.kind === 'sitemap') {
    const xml = await get(list.url)
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, u]) => ({ u: u!, loc: unescape(/<loc>\s*([^<]+?)\s*<\/loc>/.exec(u!)?.[1] ?? '') }))
    if (rootElement(xml) !== 'urlset' || !entries.some(e => bareHost(e.loc) === bareHost(list.url))) throw notA('a sitemap of its own pages')
    return entries.flatMap(({ u, loc }) => {
      const under = [list.prefix].flat().find(p => loc.startsWith(p))
      const slug = under ? loc.slice(under.length).replace(/\/$/, '') : ''
      if (!/^[a-z0-9-]+$/.test(slug)) return []
      const date = /<lastmod>\s*(\d{4}-\d{2}-\d{2})/.exec(u)?.[1]
      return [{ url: loc, title: slug.replace(/-/g, ' '), ...(date ? { date } : {}) }]
    })
  }
  const cats = json<{ id: number }[]>(await get(`${list.base}/wp-json/wp/v2/categories?slug=${list.category}&_fields=id`), 'a list of categories')
  if (!Array.isArray(cats) || !cats.every(c => typeof c?.id === 'number')) throw notA('a list of categories')
  // The category gone (renamed): the site's own answer, nothing refused.
  if (!cats[0]) throw new Error(`no category ${list.category}`)
  const out: Post[] = []
  for (let page = 1; page <= 20; page++) {
    const rows = json<{ link: string; title: { rendered: string }; date: string }[]>(await get(`${list.base}/wp-json/wp/v2/posts?categories=${cats[0].id}&per_page=100&page=${page}&_fields=link,title,date`), 'a list of posts')
    if (!Array.isArray(rows) || !rows.every(r => typeof r?.link === 'string' && bareHost(r.link) === bareHost(list.base) && typeof r.title?.rendered === 'string' && typeof r.date === 'string')) throw notA('a list of its own posts')
    out.push(...rows.map(r => ({ url: r.link, title: unescape(r.title.rendered).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), date: r.date.slice(0, 10) })))
    if (rows.length < 100) break
  }
  return out
}

/**
 * A source's posts its rules leave out (idea-sources.ts), each by the first rule its address's last part matches: how many
 * each rule left out, and their titles, which the run prints (the chief of staff, 14 Nov 2026).
 */
export function dropPosts(posts: Post[], rules: readonly Drop[]): { kept: Post[]; dropped: Record<string, number>; titles: Record<string, string[]> } {
  const dropped: Record<string, number> = Object.fromEntries(rules.map(([name]) => [name, 0]))
  const titles: Record<string, string[]> = {}
  const kept = posts.filter(p => {
    const words = new URL(p.url).pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() ?? ''
    const rule = rules.find(([, re]) => re.test(words))
    if (rule) { dropped[rule[0]] = (dropped[rule[0]] ?? 0) + 1; (titles[rule[0]] ??= []).push(p.title) }
    return !rule
  })
  return { kept, dropped, titles }
}

const PROMPT = `Below are the titles of posts, numbered: on Vietnamese aquarium shops' blogs (a title may be the post's address, without accents) and, marked (UK), a British fishkeeping magazine's features and readers' questions (each its address's words). Then the guides a Vietnamese freshwater aquarium handbook already has. The shops write what Vietnamese keepers search for; the magazine, what keepers anywhere ask. List the topics these posts are about that the handbook should have a guide on and has none.

For each topic:
- topic: the guide's subject in Vietnamese, with its accents, as a keeper would search it (for example "Nước bể cá bị đục trắng: nguyên nhân và cách xử lý").
- kind: setup (setting up a tank and its equipment), care (keeping fish well: water, feeding, tank mates, routine), breeding, disease (an illness or a problem to fix), aquascaping, plantCare, discovery (other things worth knowing).
- posts: the numbers of the posts about it.

Leave out: what a listed guide already covers, even in other words; one fish's or plant's own profile (the handbook has a page for each species); products, prices, brands, shop news and lists of shops; ponds and koi; saltwater; luck and feng shui. From the magazine, also what only fits the UK: its shops, shows, clubs and events, products or medicines sold only there, prices in pounds, UK law, British weather and seasons, British native fish, and someone's own tank. One topic per subject: merge posts that ask the same thing, whichever language they're in.`
const SCHEMA = {
  type: 'object', required: ['ideas'],
  properties: { ideas: { type: 'array', items: { type: 'object', required: ['topic', 'kind', 'posts'], properties: { topic: { type: 'string' }, kind: { type: 'string', enum: KINDS }, posts: { type: 'array', items: { type: 'number' } } } } } },
}

/** The handbook's guide names (Vietnamese), to leave out what they cover. */
async function guideNames(root: string): Promise<string[]> {
  const dir = join(root, 'content/guides')
  const names: string[] = []
  for (const g of await readdir(dir).catch(() => [] as string[])) {
    const t = JSON.parse(await readFile(join(dir, g, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }
    if (t.name) names.push(t.name)
  }
  return names.sort()
}

/** A post's place, however an address writes it ("http:", "www.", a port, a closing slash): its bare host and path. */
const placeOf = (url: string) => {
  try { const u = new URL(url); return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}` } catch { return '' }
}
/** A day: a site read through the Archive with no titles yet is tried once in it, within the week's wait. */
const ARCHIVE_TRY_MS = 86_400_000
/** The chief of staff, 21 Nov 2026: at most 6 requests to the Archive a day for the magazine's post, 9 in seven days for its listing. */
export const ARCHIVE_POST_DAY = 6
export const ARCHIVE_LISTING_WEEK = 9
/** Vietnam's last `n` days, today's included. */
const lastDays = (now: Date, n: number) => new Set(Array.from({ length: n }, (_, i) => vnDay(new Date(now.getTime() - i * 86_400_000))))
/**
 * Vietnam's days a request to the Archive for the listing counts in: today and the seven before, so a day's requests are
 * counted for at least seven whole days after any of them (Codex, 21 Nov 2026: seven days in the calendar let 18 in a little
 * over six).
 */
const LISTING_DAYS = 8
/** The requests to the Archive still allowed: for the post, today's; for the listing, those of the last LISTING_DAYS. */
function asksLeft(l: MagazineLedger, kind: 'listing' | 'post', now: Date) {
  const days = lastDays(now, kind === 'post' ? 1 : LISTING_DAYS)
  const made = Object.entries(l.asks ?? {}).reduce((n, [day, a]) => n + (days.has(day) ? a[kind] ?? 0 : 0), 0)
  return (kind === 'post' ? ARCHIVE_POST_DAY : ARCHIVE_LISTING_WEEK) - made
}
/**
 * A capped reader for the magazine: each request counted under the day it is made, and written down before it is made. Its
 * first request waits the reader's pace (ARCHIVE_POLITE), after whatever asked the Archive before it: the sources' run
 * just ahead of the step, or the list's last index query (the chief of staff, 21 Nov 2026). What is left is reckoned again
 * at each request, on its own day (Codex, 21 Nov 2026: a run that passes Vietnam's midnight), and a request the rest stops
 * is not counted (archive.ts `capped`).
 */
const magazineReader = (reader: ArchiveReader, l: MagazineLedger, file: string, kind: 'listing' | 'post', now: () => Date, sleep: (ms: number) => Promise<void>) => {
  let first = true
  const most = kind === 'post' ? ARCHIVE_POST_DAY : ARCHIVE_LISTING_WEEK
  return reader.capped(most, async () => {
    // Counted on the day it goes out: a day that turns while the count is written takes it, if it has any left (Codex, 21
    // Nov 2026).
    for (;;) {
      const at = now()
      if (asksLeft(l, kind, at) <= 0) throw new AsksSpent(most)
      const asks = (l.asks ??= {})
      const day = vnDay(at)
      const on = (asks[day] ??= {})
      on[kind] = (on[kind] ?? 0) + 1
      const kept = lastDays(at, LISTING_DAYS)
      for (const x of Object.keys(asks)) if (!kept.has(x)) delete asks[x]
      await saveLedger(file, l)
      if (vnDay(now()) === day) return
      if (!(on[kind] = on[kind]! - 1)) delete on[kind]
      if (!Object.keys(on).length) delete asks[day]
      await saveLedger(file, l)
    }
  }, async () => { if (first) { first = false; await sleep(ARCHIVE_POLITE) } })
}

/**
 * A site's listing from the Archive's copy of its sitemap (the newest that isn't a browser check: archive.ts get), read
 * as the site's own would be (listPosts): a copy that isn't its sitemap is a failure here, not a refusal of the site.
 */
async function archivedListing(s: IdeaSource, archive: ArchiveReader): Promise<Post[]> {
  if (s.list.kind !== 'sitemap') throw new Error('only a sitemap is read through the archive')
  try {
    return await listPosts(s.list, async u => (await archive.get(u)).html)
  } catch (e) {
    if (e instanceof ListingRefused) throw new Error(`the archive's copy: ${e.message}`)
    throw e
  }
}

/**
 * Which posts the Archive's index holds a good capture of: one query for each of the listing's sections, ARCHIVE_POLITE
 * apart. A refusal is thrown, so the site's earlier titles and marks stand. `held` is undefined when the index didn't
 * answer otherwise (offline, or the requests allowed spent): the posts keep the marks an earlier read gave them (`before`).
 */
async function heldPosts(s: IdeaSource, posts: Post[], archive: ArchiveReader, sleep: (ms: number) => Promise<void>, before: Post[] = []): Promise<{ posts: Post[]; held?: number }> {
  if (s.list.kind !== 'sitemap') return { posts }
  const places = new Set<string>()
  try {
    for (const prefix of [s.list.prefix].flat()) {
      await sleep(ARCHIVE_POLITE)
      for (const line of (await archive.text(cdxQuery(prefix.replace(/^https?:\/\//, '')))).split('\n')) if (line.trim()) places.add(placeOf(line.trim()))
    }
  } catch (e) {
    if (e instanceof ArchiveRefused) throw e
    console.warn(`ideas: ${s.id}: the archive's index: ${(e as Error).message.slice(0, 120)}`)
    const marked = new Set(before.filter(p => p.held).map(p => p.url))
    return { posts: posts.map(p => (marked.has(p.url) ? { ...p, held: true as const } : p)) }
  }
  const marked = posts.map(p => (places.has(placeOf(p.url)) ? { ...p, held: true as const } : p))
  return { posts: marked, held: marked.filter(p => p.held).length }
}

type Listed = { failed: string[]; needsHuman: SourceId[]; blocked: SourceId[]; listed: Partial<Record<SourceId, { kept: number; dropped: Record<string, number>; titles: Record<string, string[]> }>>; archived: Partial<Record<SourceId, { listed: number; held?: number }>> }
const listedReport = (): Listed => ({ failed: [], needsHuman: [], blocked: [], listed: {}, archived: {} })

/**
 * One site's listing (refreshIdeas, refreshMagazine): its new posts, or undefined, its last titles standing. A site's last
 * titles stand unless its new listing has posts: one that fails, is empty, or isn't a listing at all changes nothing. A site
 * that refuses us (a 403 or a 429, or an answer that isn't its listing: listPosts) is marked as needing the owner
 * (engine-state/_sources.json, which the dashboard shows and research keeps off, cycle-only.ts), and isn't fetched again
 * until a run with `retryBlocked`; `force` doesn't pass it. `listed`: each site's posts kept, and how many each of its rules
 * left out, with their titles.
 *
 * With `archive` (the magazine, on the Mac), a site that refuses is read meanwhile from the Archive's copy of its sitemap,
 * once a day at most and within the week's requests, and the Archive's index then says which posts it holds: `archived`,
 * the posts kept and how many the index holds. A refusal of the Archive's stops the read there, the titles standing:
 * nothing goes round it.
 */
async function listSite(root: string, s: IdeaSource, before: Post[] | undefined, get: (url: string) => Promise<string>, d: { sleep: (ms: number) => Promise<void>; now: () => Date }, o: { force?: boolean; retryBlocked?: boolean }, report: Listed, archive?: { ledger: MagazineLedger; file: string; reader: ArchiveReader }): Promise<Post[] | undefined> {
  const since = await sourceBlockedSince(root, s.id)
  if (since && !o.retryBlocked && !archive) { report.blocked.push(s.id); return undefined }
  let reader: ArchiveReader | undefined
  let untried: (() => Promise<void>) | undefined
  try {
    let listed: Post[] | undefined
    if (!since || o.retryBlocked) {
      try {
        listed = await listPosts(s.list, get)
      } catch (err) {
        if (!(err instanceof ListingRefused)) throw err
        await setSourceBlock(root, s.id, since ?? d.now().toISOString())
        report.needsHuman.push(s.id)
        if (!archive) throw err
      }
    }
    // Through the Archive: once a day at most, `force` or not, by a reader capped at what's left of the week's requests,
    // each written down before it is made.
    if (!listed) {
      const { ledger: l, file } = archive!
      const tried = l.tried?.[s.id]
      if (tried && d.now().getTime() - Date.parse(tried) < ARCHIVE_TRY_MS) throw new Error('read through the archive within a day')
      if (asksLeft(l, 'listing', d.now()) <= 0) throw new Error(`the week's ${ARCHIVE_LISTING_WEEK} requests to the archive are spent`)
      ;(l.tried ??= {})[s.id] = d.now().toISOString()
      await saveLedger(file, l)
      // The day's try given back when the Archive stopped the read before anything was asked of it: a rest on file, the
      // Mac's lock held elsewhere (Codex, 22 Nov 2026).
      untried = async () => { if (tried) l.tried![s.id] = tried; else delete l.tried![s.id]; if (!Object.keys(l.tried!).length) delete l.tried; await saveLedger(file, l) }
      reader = magazineReader(archive!.reader, l, file, 'listing', d.now, d.sleep)
    }
    const { kept, dropped, titles } = dropPosts(listed ?? await archivedListing(s, reader!), s.drop ?? [])
    report.listed[s.id] = { kept: kept.length, dropped, titles }
    if (!kept.length) throw new Error('an empty listing')
    if (reader) {
      const r = await heldPosts(s, kept, reader, d.sleep, before)
      report.archived[s.id] = { listed: kept.length, ...(r.held === undefined ? {} : { held: r.held }) }
      return r.posts
    }
    if (since) await setSourceBlock(root, s.id, undefined)
    return kept
  } catch (err) {
    if (untried && reader?.asked === 0 && archiveStops(err)) await untried()
    report.failed.push(`${s.id}: ${(err as Error).message.slice(0, 120)}, its last titles kept`)
    return undefined
  }
}

/**
 * The magazine's titles (the sites with `viaArchive`, idea-sources.ts), on the Mac alone (the chief of staff, 21 Nov 2026):
 * read a week apart, or once a day while a site has none, its own site first unless it refused us, else the Archive's copy
 * through the Mac's Archive reader, at its pace and under its rest (listSite). Kept in the magazine's own record, which
 * GitHub's ideas step reads (refreshIdeas). `fresh`: the sites still within their week.
 */
export async function refreshMagazine(root: string, d: MagazineDeps, o: { force?: boolean; retryBlocked?: boolean } = {}) {
  const m = await readMagazine(root)
  const l = await readLedger(d.ledger, m)
  const report = { fresh: [] as SourceId[], ...listedReport() }
  let first = true
  const get = async (url: string) => { if (!first) await d.sleep(DELAY); first = false; return d.get(url) }
  for (const s of IDEA_SOURCES.filter(x => x.viaArchive)) {
    const at = m.readAt?.[s.id]
    if (!o.force && m.posts[s.id]?.length && at && d.now().getTime() - Date.parse(at) < FRESH_DAYS * 86_400_000) { report.fresh.push(s.id); continue }
    const posts = await listSite(root, s, m.posts[s.id], get, d, o, report, { ledger: l, file: d.ledger, reader: d.archive })
    if (posts) { m.posts[s.id] = posts; (m.readAt ??= {})[s.id] = d.now().toISOString() }
  }
  mirror(m, l)
  await saveMagazine(root, m)
  return report
}

/**
 * The shops' titles read again (a week on, or `force`), and the ideas made afresh from them and the magazine's, which the
 * Mac reads (refreshMagazine) and this only reads, from the magazine's record. Within the week, a newer read of the
 * magazine's makes the ideas again from the shops' titles as they were. An idea already written or skipped keeps that, so
 * it never comes back (a magazine idea's, as the Mac's record says: writeMagazine), and one still waiting stays whether or
 * not the model names it again: the model adds ideas, never drops one (the chief of staff, 14 Nov 2026). Each shop's
 * listing as listSite reads it.
 */
export async function refreshIdeas(root: string, d: IdeasDeps, o: { force?: boolean; retryBlocked?: boolean } = {}) {
  const state = await readIdeas(root)
  const magazine = await readMagazine(root)
  const report = { fresh: false, posts: 0, ideas: 0, ...listedReport() }
  const fresh = !o.force && !!state.readAt && d.now().getTime() - Date.parse(state.readAt) < FRESH_DAYS * 86_400_000
  const magazineAt = magazineRead(magazine)
  // What the Mac made of the magazine's ideas, as each idea's own: written or skipped, it never comes back. Taken at every
  // run, fresh or not (Codex, 21 Nov 2026: a guide written within the week was otherwise seen only a week on).
  let took = false
  for (const i of state.ideas) {
    const g = i.fromMagazine ? magazine.guides[slugify(i.topic)] : undefined
    if (!g || !(g.guide || g.skipped)) continue
    const now = { ...i, ...(g.guide ? { guide: g.guide } : {}), ...(g.skipped ? { skipped: g.skipped } : {}), ...(g.at ? { at: g.at } : {}), ...(g.post ? { post: g.post } : {}) }
    if (JSON.stringify(now) !== JSON.stringify(i)) { Object.assign(i, now); took = true }
  }
  if (fresh && magazineAt === state.magazineAt) { if (took) await save(root, state); return { ...report, fresh: true } }
  if (!fresh) {
    let first = true
    const get = async (url: string) => { if (!first) await d.sleep(DELAY); first = false; return d.get(url) }
    // The sites read through the Archive are the Mac's: never asked from here.
    for (const s of IDEA_SOURCES.filter(x => !x.viaArchive)) {
      const posts = await listSite(root, s, state.posts[s.id], get, d, o, report)
      if (posts) state.posts[s.id] = posts
    }
  }
  const posts = IDEA_SOURCES.flatMap(s => ((s.viaArchive ? magazine.posts[s.id] : state.posts[s.id]) ?? []).map(p => ({ ...p, site: s.id })))
  if (!posts.length) { if (took) await save(root, state); return report }
  const guides = await guideNames(root)
  const r = await d.llm<{ ideas: { topic: string; kind: GuideKind; posts: number[] }[] }>({
    system: 'You plan an aquarium handbook\'s guides. Reply only with JSON.', schema: SCHEMA,
    prompt: `${PROMPT}\n\nPOSTS:\n${posts.map((p, i) => `${i + 1}. ${p.title}${MAGAZINES.has(p.site) ? ' (UK)' : ''}`).join('\n')}\n\nGUIDES:\n${guides.map(g => `- ${g}`).join('\n')}`,
  })
  const done = new Map(state.ideas.filter(i => i.guide || i.skipped).map(i => [slugify(i.topic), i]))
  const made = new Map<string, Idea>()
  const shops = (i: Idea) => i.posts.filter(u => !isMagazinePost(u))
  for (const x of r.ideas ?? []) {
    // One line, no quotes: a topic goes into research's prompt, whatever a title asked of the planner (Codex, 21 Nov 2026).
    const topic = String(x.topic ?? '').replace(/["“”\s]+/g, ' ').trim().slice(0, 140)
    const mine = [...new Set((x.posts ?? []).map(n => posts[Math.round(n) - 1]).filter(p => p !== undefined))]
    if (!topic || !KINDS.includes(x.kind) || !mine.length || done.has(slugify(topic)) || made.has(slugify(topic))) continue
    const fromMagazine = mine.every(p => MAGAZINES.has(p.site))
    const latest = (fromMagazine ? mine : mine.filter(p => !MAGAZINES.has(p.site))).map(p => p.date ?? '').sort().at(-1)
    made.set(slugify(topic), { topic, kind: x.kind, posts: mine.map(p => p.url), sites: new Set(mine.map(p => p.site)).size, ...(latest ? { latest } : {}), ...(fromMagazine ? { fromMagazine } : {}) })
  }
  const added = made.size
  // A waiting idea the model left out this time is kept as it was.
  for (const i of state.ideas) if (!i.guide && !i.skipped && !made.has(slugify(i.topic)) && !done.has(slugify(i.topic))) made.set(slugify(i.topic), i)
  // The magazine's ideas listed behind every shop's, and a shop's idea ranked by the shops alone, their posts and their
  // newest date (the chief of staff, 14 Nov 2026): its 1,365 titles never push the shops' ideas out, nor order them. It has
  // a guide a day of its own, on the Mac (writeMagazine). A shop is told by its host, as the magazine is.
  const shopSites = (i: Idea) => new Set(shops(i).map(bareHost)).size
  const counted = (i: Idea) => (i.fromMagazine ? i.posts : shops(i))
  state.ideas = [...[...made.values()].sort((a, b) => Number(!!a.fromMagazine) - Number(!!b.fromMagazine) || shopSites(b) - shopSites(a)
    || counted(b).length - counted(a).length || (b.latest ?? '').localeCompare(a.latest ?? '')), ...done.values()]
  if (!fresh) state.readAt = d.now().toISOString()
  if (magazineAt) state.magazineAt = magazineAt
  await save(root, state)
  return { ...report, posts: posts.length, ideas: added }
}

/**
 * The lines a guide's research gets from the shops' posts on its topic. Never a post on a host research may not open
 * (`denied`: cycle-only.ts, the magazine's always, idea-sources.ts NEVER_RESEARCHED, or a site refused as a source,
 * cycle-only.ts REFUSED_SITES) nor a marketplace's, told by its
 * address alone, whatever list it was saved in (the chief of staff, 14 Nov 2026).
 */
export function ideaLeads(idea: Idea, state: IdeasState, denied: readonly string[] = NEVER_RESEARCHED): string {
  const titles = new Map(Object.values(state.posts).flat().map(p => [p!.url, p!.title]))
  const shops = idea.posts.filter(u => !refused(denied, u) && !isMarketplace(u)).slice(0, 6)
  return shops.length ? `\n\nWhat Vietnamese keepers read on this, from aquarium shops' blogs (orientation only: never copy or translate their text; they sell what they write about, so check every fact elsewhere, and cite one of them only for a Vietnamese name or what is sold in Vietnam):\n${shops.map(u => `- ${u} (${titles.get(u) ?? ''})`).join('\n')}` : ''
}

/**
 * Guides on the magazine's ideas a day, on the Mac (writeMagazine): at most one (the chief of staff, 14 Nov 2026), beside the
 * shops' on GitHub (21 Nov 2026: "a day the Archive rests still has two guides, and a day it answers has three"). The owner
 * asked for its topics by name. Changing it is a change here.
 */
export const MAGAZINE_PER_DAY = 1

/** The site a magazine's post stands on, by its host. */
const magazineOf = (url: string) => IDEA_SOURCES.find(s => s.magazine && ideaHost(s) === bareHost(url))

/**
 * The one post behind a magazine idea's guide (the chief of staff, 21 Nov 2026): the first of its posts the Archive's index
 * holds (refreshMagazine), else its first, read from the Archive's newest good copy (archive.ts get: an archived browser check
 * is no copy). Its text (the outline's: no photo is fetched) is held for this run alone and never written anywhere; `hash`
 * stands for it in the record. `page` undefined: `unread` says why, no copy, or none reached (the day's requests spent,
 * the Archive not answering). A refusal of the Archive's is thrown, so the guide waits for the next run.
 */
async function magazinePost(idea: Idea, posts: MagazineState['posts'], archive: ArchiveReader): Promise<{ url: string; page?: GivenPage & { hash: string }; unread?: 'no copy' | 'not reached' } | undefined> {
  const mine = idea.posts.filter(isMagazinePost)
  const held = new Set(Object.values(posts).flat().filter(p => p?.held).map(p => p!.url))
  const url = mine.find(u => held.has(u)) ?? mine[0]
  if (!url || !magazineOf(url)) return undefined
  let got: Awaited<ReturnType<ArchiveReader['get']>>
  try {
    got = await archive.get(url)
  } catch (e) {
    if (e instanceof ArchiveRefused) throw e
    console.warn(`magazine: ${url}: ${(e as Error).message.slice(0, 120)}`)
    return { url, unread: !(e instanceof AsksSpent) && noCopy(e) ? 'no copy' : 'not reached' }
  }
  // A copy of another page, a redirect's (Codex, 21 Nov 2026: the post moved, or the Archive sent the site's home page): no
  // copy of this one.
  if (placeOf(got.copyOf) !== placeOf(url)) return { url, unread: 'no copy' }
  const o = htmlToOutline(got.html)
  if (!o.outline.trim() || isChallenge(o.title, o.outline)) return { url, unread: 'no copy' }
  return { url, page: { url, title: o.title, text: o.outline, hash: snapshotHash({ title: o.title, outline: o.outline }), ...(got.capturedAt ? { capturedAt: got.capturedAt } : {}) } }
}

/**
 * Guides on the shops' most asked ideas, `perDay` at most a day (Vietnam's, as the engine's ceilings count: ceiling.ts
 * vnDay). The magazine's ideas are the Mac's (writeMagazine), never written here, so a guide on one always has its post's
 * chance. The day's count is the shops' ideas research was spent on that day (`at`), each saved as it is spent. A model that
 * stops (quota) stops the run, the idea left for the next; any other failure counts, and is kept as the idea's reason.
 */
export async function writeIdeas(root: string, d: { research: Llm; llm: Llm; now: () => Date }, o: { perDay: number; researchModel?: string }) {
  const state = await readIdeas(root)
  // Read again at each idea: a run that passes midnight counts the new day's.
  const today = () => vnDay(d.now())
  const report = { written: [] as string[], skipped: [] as string[], failed: [] as string[], stopped: '' }
  // The day's count: the shops' ideas research was spent on today, and the count kept by day before that.
  const spentToday = () => state.ideas.filter(i => !i.fromMagazine && i.at && vnDay(new Date(i.at)) === today()).length + (state.written?.[today()] ?? 0)
  // Research was spent on it: it counts, saved at once.
  const spent = async (idea: Idea) => {
    idea.at = d.now().toISOString()
    await save(root, state)
  }
  for (const idea of state.ideas) {
    if (spentToday() >= o.perDay) break
    if (idea.fromMagazine || idea.guide || idea.skipped) continue
    const id = topicId(idea.topic)
    // A guide of that name already (the ideas missed it): taken as written, never rewritten from here.
    if (await readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8').then(() => true, () => false)) { idea.guide = id; continue }
    try {
      // A guide is one piece: started only when what's left of the day's line covers a typical one (pieces.ts).
      const leads = ideaLeads(idea, state, await cycleOnlyHosts(root))
      const r = await piece(id, () => makeTopic(root, { research: d.research, llm: d.llm }, { topic: idea.topic, kind: idea.kind }, { leads, now: d.now, ...(o.researchModel ? { researchModel: o.researchModel } : {}) }), { now: d.now })
      if ('skipped' in r && r.skipped) { idea.skipped = r.skipped; report.skipped.push(r.skipped) } else { idea.guide = r.id; report.written.push(r.id) }
      await spent(idea)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = err.message; break }
      // It counts, and is not tried again (the reason is kept).
      idea.skipped = `failed: ${(err as Error).message.slice(0, 120)}`
      report.failed.push(`${idea.topic}: ${idea.skipped}`)
      await spent(idea)
    }
  }
  // The counts kept by day before ideas kept their own time: today's alone, until it passes.
  for (const k of ['written', 'magazine'] as const) {
    const n = state[k]?.[today()]
    if (n) state[k] = { [today()]: n }
    else delete state[k]
  }
  await save(root, state)
  return report
}

/**
 * The day's guide on the magazine's ideas (MAGAZINE_PER_DAY), on the Mac alone, on its "magazine" line (ceilings.json; the
 * chief of staff, 21 Nov 2026): the most asked of its ideas not yet written (GitHub's ideas step makes them, refreshIdeas),
 * given its one post read through the Archive (magazinePost; ARCHIVE_POST_DAY requests a day at most, counted as each is
 * made). What came of it is kept in the magazine's record with the post's record: cited, not cited, no copy, or too much
 * of one source (topics.ts). A post the Archive doesn't hold leaves the guide to its other sources. While the Archive
 * rests, or the day's requests are spent, the guide waits, its idea untouched; `waited`: the days in a row it has waited
 * for a rest, kept in the record.
 */
export async function writeMagazine(root: string, d: { research: Llm; llm: Llm; now: () => Date; archive: ArchiveReader; ledger: string; sleep?: (ms: number) => Promise<void> }, o: { researchModel?: string } = {}) {
  // The wait before the post's first request: the clock's own unless a test gives one.
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const ideas = await readIdeas(root)
  const m = await readMagazine(root)
  const l = await readLedger(d.ledger, m)
  const save = () => { mirror(m, l); return saveMagazine(root, m) }
  // The post's text while a guide is written from it: a reason kept or printed never repeats it (copiesGiven).
  let held: string | undefined
  const clean = (e: unknown) => { const msg = (e as Error).message ?? String(e); return held && copiesGiven(msg, held) ? `${(e as Error).name}: its message repeats the post` : msg }
  const today = () => vnDay(d.now())
  const report: { written: string[]; skipped: string[]; failed: string[]; stopped: string; posts: string[]; waited?: number } = { written: [], skipped: [], failed: [], stopped: '', posts: [] }
  const doneToday = () => Math.max(Object.values(m.guides).filter(g => g.at && vnDay(new Date(g.at)) === today()).length, l.made?.[today()] ?? 0)
  /** A guide that counts as the day's, in the ledger before the record. */
  const counted = async () => {
    const made = (l.made ??= {})
    made[today()] = (made[today()] ?? 0) + 1
    const kept = lastDays(d.now(), LISTING_DAYS)
    for (const day of Object.keys(made)) if (!kept.has(day)) delete made[day]
    await saveLedger(d.ledger, l)
  }
  for (const idea of ideas.ideas) {
    if (doneToday() >= MAGAZINE_PER_DAY) break
    const key = slugify(idea.topic)
    if (!idea.fromMagazine || idea.guide || idea.skipped || m.guides[key]) continue
    const id = topicId(idea.topic)
    // A guide of that name already: taken as written, never rewritten from here, and not the day's.
    if (await readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8').then(() => true, () => false)) { m.guides[key] = { guide: id }; continue }
    if (asksLeft(l, 'post', d.now()) <= 0) { report.stopped = `the day's ${ARCHIVE_POST_DAY} requests to the archive for the magazine's post are spent`; break }
    let done = false
    try {
      const leads = ideaLeads(idea, ideas, await cycleOnlyHosts(root))
      // The post is read inside the piece, so a day's line that won't cover the guide asks the Archive nothing. Each request
      // is written down before it is made: a guide the model stops later asks no more of the Archive that day.
      const { r, post } = await piece(id, async () => {
        const post = await magazinePost(idea, m.posts, magazineReader(d.archive, l, d.ledger, 'post', d.now, sleep))
        held = post?.page?.text
        // The Archive answered (its copy, or that it has none): the wait for its rest is over. Not reached, it may not have
        // (Fable, 21 Nov 2026).
        if (l.waits && (post?.page || post?.unread === 'no copy')) { delete l.waits; await saveLedger(d.ledger, l) }
        const r = await makeTopic(root, { research: d.research, llm: d.llm }, { topic: idea.topic, kind: idea.kind }, { leads, now: d.now, ...(post?.page ? { given: post.page } : {}), ...(o.researchModel ? { researchModel: o.researchModel } : {}) })
        return { r, post }
      }, { now: d.now })
      const p = post?.page
      const record: PostRecord | undefined = post && { url: post.url, ...(p ? { title: p.title, ...(p.capturedAt ? { capturedAt: p.capturedAt } : {}), hash: p.hash } : {}), via: 'archive', result: p ? ('post' in r && r.post) || 'not cited' : post.unread ?? 'no copy' }
      const skipped = 'skipped' in r && r.skipped ? r.skipped : undefined
      m.guides[key] = { ...(skipped ? { skipped } : { guide: r.id }), at: d.now().toISOString(), ...(record ? { post: record } : {}) }
      await counted()
      done = true
      if (skipped) report.skipped.push(skipped); else report.written.push(r.id)
      // With how many of the facts its writer was given came from the post (the chief of staff, 21 Nov 2026).
      const share = 'given' in r && r.given ? `; ${r.given.from} of the ${r.given.of} facts the writer was given came from it` : ''
      if (record) report.posts.push(`${idea.topic}: ${record.url}: ${record.result}${share}`)
      await save()
    } catch (err) {
      // Its guide made and counted, the record not saved: it stands as made, counted once, and the step stops, the record
      // saved again at its end (Codex, 21 Nov 2026).
      if (done) { report.stopped = `the magazine's record was not saved: ${clean(err).slice(0, 120)}`; break }
      if (err instanceof LlmError) { report.stopped = clean(err); break }
      // The Archive resting: the guide waits for its post, the idea as it was. The days it waits in a row are kept.
      if (err instanceof ArchiveRefused) {
        report.stopped = err.message
        const waits = l.waits ?? []
        const last = waits.at(-1)
        l.waits = last === today() ? waits : last === vnDay(new Date(d.now().getTime() - 86_400_000)) ? [...waits, today()] : [today()]
        await saveLedger(d.ledger, l)
        report.waited = l.waits.length
        break
      }
      // It counts, and is not tried again (the reason is kept).
      m.guides[key] = { skipped: `failed: ${clean(err).slice(0, 120)}`, at: d.now().toISOString() }
      await counted()
      report.failed.push(`${idea.topic}: ${m.guides[key]!.skipped}`)
      await save()
    } finally {
      held = undefined
    }
  }
  await save()
  return report
}
