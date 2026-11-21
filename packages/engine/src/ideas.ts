import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { slugify, type GuideEntity, type SourceId } from '@aq/schema'
import { ARCHIVE_POLITE, ArchiveRefused, cdxQuery, type ArchiveReader } from './archive'
import { vnDay } from './ceiling'
import { LlmError, type Llm } from './claude'
import { cycleOnlyHosts, refused } from './cycle-only'
import { IDEA_SOURCES, ideaHost, NEVER_RESEARCHED, type Drop, type IdeaSource, type Listing } from './idea-sources'
import { isMarketplace } from './marketplaces'
import { htmlToOutline, isChallenge } from './outline'
import { piece } from './pieces'
import { snapshotHash } from './snapshot'
import { setSourceBlock, sourceBlockedSince } from './state'
import { makeTopic, topicId, type GivenPage } from './topics'

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
 * What came of the post behind a magazine idea's guide (writeIdeas): research cited it; it read it and cited none of it;
 * the Archive had no copy, or only a browser check; or it would have given too much of the guide (topics.ts POST_SHARE),
 * so the guide was written without it.
 */
export type PostResult = 'cited' | 'not cited' | 'no copy' | 'too much of one source'
/**
 * The record of a magazine idea's post, all the repository keeps of it (the chief of staff, 21 Nov 2026: the magazine has
 * given no permission to republish, and the repository is public): its own address and title, the copy's date, a hash of
 * its text, and that the Archive was how it was read. Its text is held only by the run that reads it (writeIdeas).
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
  /** When a site read through the Archive with no titles yet was last tried within the week's wait (refreshIdeas). */
  archiveTried?: Partial<Record<SourceId, string>>
  /** Requests made to the Archive, by Vietnam's day, for the listing and for the post: counted as each is made (asksLeft). */
  archiveAsks?: Record<string, { listing?: number; post?: number }>
  /** The days in a row (Vietnam's) the day's magazine guide waited for the Archive's rest (writeIdeas). */
  archiveWaits?: string[]
}
/** `archive`: the engine's Archive reader (cli.ts archiveReader), for the sites with `viaArchive` (idea-sources.ts). */
export type IdeasDeps = { get: (url: string) => Promise<string>; llm: Llm; sleep: (ms: number) => Promise<void>; now: () => Date; archive?: ArchiveReader }

const file = (root: string) => join(root, 'engine-state/_ideas.json')
export const readIdeas = async (root: string): Promise<IdeasState> =>
  ({ posts: {}, ideas: [], ...JSON.parse(await readFile(file(root), 'utf8').catch(() => '{}')) as Partial<IdeasState> })
const save = (root: string, s: IdeasState) => writeFile(file(root), `${JSON.stringify(s, null, 2)}\n`)

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
    out.push(...rows.map(r => ({ url: r.link, title: unescape(r.title.rendered).replace(/<[^>]+>/g, '').trim(), date: r.date.slice(0, 10) })))
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
/** The requests to the Archive still allowed: for the post, today's; for the listing, the last seven days'. */
function asksLeft(state: IdeasState, kind: 'listing' | 'post', now: Date) {
  const days = lastDays(now, kind === 'post' ? 1 : 7)
  const made = Object.entries(state.archiveAsks ?? {}).reduce((n, [day, a]) => n + (days.has(day) ? a[kind] ?? 0 : 0), 0)
  return (kind === 'post' ? ARCHIVE_POST_DAY : ARCHIVE_LISTING_WEEK) - made
}
/** Counts a capped reader's requests under today, dropping days older than the week. */
function countAsks(state: IdeasState, kind: 'listing' | 'post', now: Date, n: number) {
  if (!n) return
  const asks = (state.archiveAsks ??= {})
  const today = (asks[vnDay(now)] ??= {})
  today[kind] = (today[kind] ?? 0) + n
  const week = lastDays(now, 7)
  for (const day of Object.keys(asks)) if (!week.has(day)) delete asks[day]
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
 * apart. `held` is undefined when the index didn't answer (a refusal stops it there): the posts stand unmarked.
 */
async function heldPosts(s: IdeaSource, posts: Post[], archive: ArchiveReader, sleep: (ms: number) => Promise<void>): Promise<{ posts: Post[]; held?: number }> {
  if (s.list.kind !== 'sitemap') return { posts }
  const places = new Set<string>()
  try {
    for (const prefix of [s.list.prefix].flat()) {
      await sleep(ARCHIVE_POLITE)
      for (const line of (await archive.text(cdxQuery(prefix.replace(/^https?:\/\//, '')))).split('\n')) if (line.trim()) places.add(placeOf(line.trim()))
    }
  } catch (e) {
    console.warn(`ideas: ${s.id}: the archive's index: ${(e as Error).message.slice(0, 120)}`)
    return { posts }
  }
  const marked = posts.map(p => (places.has(placeOf(p.url)) ? { ...p, held: true as const } : p))
  return { posts: marked, held: marked.filter(p => p.held).length }
}

/**
 * The shops' titles read again (a week on, or `force`), and the ideas made from them afresh. An idea already written or
 * skipped keeps that, so it never comes back, and one still waiting stays whether or not the model names it again: the
 * model adds ideas, never drops one (the chief of staff, 14 Nov 2026). A site's last titles stand unless its new listing
 * has posts: one that fails, is empty, or isn't a listing at all changes nothing. A site that refuses us (a 403 or a 429,
 * or an answer that isn't its listing: listPosts) is marked as needing the owner (engine-state/_sources.json, which the
 * dashboard shows and research keeps off, cycle-only.ts), and isn't fetched again until a run with `retryBlocked`; `force`
 * doesn't pass it. `listed`: each site's posts kept, and how many each of its rules left out, with their titles.
 *
 * A site with `viaArchive` (the magazine) is read from the Archive's copy of its sitemap instead while its own site
 * refuses, by the engine's Archive reader (`d.archive`), and the Archive's index then says which posts it holds:
 * `archived`, each such site's posts kept and how many the index holds (the chief of staff, 21 Nov 2026). A refusal of the
 * Archive's stops that site's read there, its titles standing; nothing goes round it. Within the week's wait, such a site
 * with no titles yet is tried once a day, alone, and the ideas are made again only when it brings some.
 */
export async function refreshIdeas(root: string, d: IdeasDeps, o: { force?: boolean; retryBlocked?: boolean } = {}) {
  const state = await readIdeas(root)
  const report = { fresh: false, posts: 0, ideas: 0, failed: [] as string[], needsHuman: [] as SourceId[], blocked: [] as SourceId[], listed: {} as Partial<Record<SourceId, { kept: number; dropped: Record<string, number>; titles: Record<string, string[]> }>>, archived: {} as Partial<Record<SourceId, { listed: number; held?: number }>> }
  const fresh = !o.force && !!state.readAt && d.now().getTime() - Date.parse(state.readAt) < FRESH_DAYS * 86_400_000
  const tried = (s: IdeaSource) => state.archiveTried?.[s.id]
  const behind = IDEA_SOURCES.filter(s => s.viaArchive && d.archive && !state.posts[s.id]?.length && (!tried(s) || d.now().getTime() - Date.parse(tried(s)!) >= ARCHIVE_TRY_MS))
  if (fresh && !behind.length) return { ...report, fresh: true }
  let first = true
  const get = async (url: string) => { if (!first) await d.sleep(DELAY); first = false; return d.get(url) }
  for (const s of fresh ? behind : IDEA_SOURCES) {
    const since = await sourceBlockedSince(root, s.id)
    const archive = s.viaArchive ? d.archive : undefined
    if (since && !o.retryBlocked && !archive) { report.blocked.push(s.id); continue }
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
      const fromArchive = !listed
      // Through the Archive, a reader capped at what's left of the week's requests, each counted as it is made.
      let reader: ArchiveReader | undefined
      if (fromArchive) {
        const left = asksLeft(state, 'listing', d.now())
        if (left <= 0) throw new Error(`the week's ${ARCHIVE_LISTING_WEEK} requests to the archive are spent`)
        reader = archive!.capped(left)
        ;(state.archiveTried ??= {})[s.id] = d.now().toISOString()
      }
      try {
        const { kept, dropped, titles } = dropPosts(listed ?? await archivedListing(s, reader!), s.drop ?? [])
        report.listed[s.id] = { kept: kept.length, dropped, titles }
        if (!kept.length) throw new Error('an empty listing')
        if (reader) {
          const r = await heldPosts(s, kept, reader, d.sleep)
          report.archived[s.id] = { listed: kept.length, ...(r.held === undefined ? {} : { held: r.held }) }
          state.posts[s.id] = r.posts
        } else {
          state.posts[s.id] = kept
          if (since) await setSourceBlock(root, s.id, undefined)
        }
      } finally {
        if (reader) countAsks(state, 'listing', d.now(), reader.asked)
      }
    } catch (err) {
      report.failed.push(`${s.id}: ${(err as Error).message.slice(0, 120)}, its last titles kept`)
    }
  }
  // Within the week's wait, only a site behind was read: the ideas are made again only if it brought titles.
  if (fresh && !behind.some(s => state.posts[s.id]?.length)) { await save(root, state); return { ...report, fresh: true } }
  const posts = IDEA_SOURCES.flatMap(s => (state.posts[s.id] ?? []).map(p => ({ ...p, site: s.id })))
  // Saved before the model is asked: the Archive's requests stand even if the model stops.
  await save(root, state)
  if (!posts.length) return report
  const guides = await guideNames(root)
  const r = await d.llm<{ ideas: { topic: string; kind: GuideKind; posts: number[] }[] }>({
    system: 'You plan an aquarium handbook\'s guides. Reply only with JSON.', schema: SCHEMA,
    prompt: `${PROMPT}\n\nPOSTS:\n${posts.map((p, i) => `${i + 1}. ${p.title}${MAGAZINES.has(p.site) ? ' (UK)' : ''}`).join('\n')}\n\nGUIDES:\n${guides.map(g => `- ${g}`).join('\n')}`,
  })
  const done = new Map(state.ideas.filter(i => i.guide || i.skipped).map(i => [slugify(i.topic), i]))
  const made = new Map<string, Idea>()
  const shops = (i: Idea) => i.posts.filter(u => !isMagazinePost(u))
  for (const x of r.ideas ?? []) {
    const topic = String(x.topic ?? '').trim().slice(0, 140)
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
  // a guide a day of its own (writeIdeas). A shop is told by its host, as the magazine is.
  const shopSites = (i: Idea) => new Set(shops(i).map(bareHost)).size
  const counted = (i: Idea) => (i.fromMagazine ? i.posts : shops(i))
  state.ideas = [...[...made.values()].sort((a, b) => Number(!!a.fromMagazine) - Number(!!b.fromMagazine) || shopSites(b) - shopSites(a)
    || counted(b).length - counted(a).length || (b.latest ?? '').localeCompare(a.latest ?? '')), ...done.values()]
  if (!fresh) state.readAt = d.now().toISOString()
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
 * Guides on the magazine's ideas a day: one of the day's two from the start, at most one, and the shops' ideas keep the
 * other, until the chief of staff has read its first three (14 Nov 2026). The owner asked for its topics by name. Changing
 * it is a change here.
 */
export const MAGAZINE_PER_DAY = 1

/** The site a magazine's post stands on, by its host. */
const magazineOf = (url: string) => IDEA_SOURCES.find(s => s.magazine && ideaHost(s) === bareHost(url))

/**
 * The one post behind a magazine idea's guide (the chief of staff, 21 Nov 2026): the first of its posts the Archive's index
 * holds (refreshIdeas), else its first, read from the Archive's newest good copy (archive.ts get: an archived browser check
 * is no copy). Its text (the outline's: no photo is fetched) is held for this run alone and never written anywhere; `hash`
 * stands for it in the record. `page` undefined: no copy, or none found within the day's requests. A refusal of the
 * Archive's is thrown, so the guide waits for the next run.
 */
async function magazinePost(idea: Idea, state: IdeasState, archive: ArchiveReader): Promise<{ url: string; page?: GivenPage & { hash: string } } | undefined> {
  const mine = idea.posts.filter(isMagazinePost)
  const held = new Set(Object.values(state.posts).flat().filter(p => p?.held).map(p => p!.url))
  const url = mine.find(u => held.has(u)) ?? mine[0]
  if (!url || !magazineOf(url)) return undefined
  let got: Awaited<ReturnType<ArchiveReader['get']>>
  try {
    got = await archive.get(url)
  } catch (e) {
    if (e instanceof ArchiveRefused) throw e
    console.warn(`write-ideas: ${url}: ${(e as Error).message.slice(0, 120)}`)
    return { url }
  }
  const o = htmlToOutline(got.html)
  if (!o.outline.trim() || isChallenge(o.title, o.outline)) return { url }
  return { url, page: { url, title: o.title, text: o.outline, hash: snapshotHash({ title: o.title, outline: o.outline }), ...(got.capturedAt ? { capturedAt: got.capturedAt } : {}) } }
}

/**
 * Guides on the most asked ideas, `perDay` at most a day (Vietnam's, as the engine's ceilings count: ceiling.ts vnDay):
 * MAGAZINE_PER_DAY of them kept for the magazine's while it has one waiting, the rest the shops'. The day's count is the
 * ideas research was spent on that day (`at`), each saved as it is spent. A model that stops (quota) stops that side, the
 * shops' or the magazine's, the idea left for the next run, and the other side is still tried; any other failure counts,
 * and is kept as the idea's reason. `magazine`: the ideas of the magazine's it wrote on, written or skipped.
 *
 * A magazine idea's guide is given its one post, read through the Archive (`d.archive`, magazinePost; ARCHIVE_POST_DAY
 * requests a day at most, counted as made), and the idea keeps its record and what came of it (`post`; `posts` in the
 * report): cited, not cited, no copy, or too much of one source (topics.ts). A post the Archive doesn't hold leaves the
 * guide to its other sources, as before. While the Archive rests (a refusal), or its day's requests are spent, the
 * magazine's side stops for the run, its idea untouched, and the shops' goes on; `waited`, the days in a row it waited
 * for a rest.
 */
export async function writeIdeas(root: string, d: { research: Llm; llm: Llm; now: () => Date; archive?: ArchiveReader }, o: { perDay: number; researchModel?: string }) {
  const state = await readIdeas(root)
  // Read again at each idea: a run that passes midnight counts the new day's.
  const today = () => vnDay(d.now())
  const stopped = { shops: false, magazine: false }
  const report: { written: string[]; skipped: string[]; failed: string[]; stopped: string; magazine: string[]; posts: string[]; waited?: number } = { written: [], skipped: [], failed: [], stopped: '', magazine: [], posts: [] }
  const stop = (side: 'shops' | 'magazine', why: string) => { stopped[side] = true; report.stopped = [report.stopped, why].filter(Boolean).join('; ') }
  // The day's count, and the magazine's: the ideas research was spent on today, and the count kept by day before that.
  const spentToday = (magazine: boolean) => state.ideas.filter(i => i.at && vnDay(new Date(i.at)) === today() && (!magazine || i.fromMagazine)).length
    + ((magazine ? state.magazine : state.written)?.[today()] ?? 0)
  // Research was spent on it: it counts, saved at once.
  const spent = async (idea: Idea) => {
    idea.at = d.now().toISOString()
    if (idea.fromMagazine) report.magazine.push(idea.topic)
    await save(root, state)
  }
  // The day's guides still kept for the magazine's: none once it has had its own, or with none of its ideas waiting.
  const forMagazine = () => (!stopped.magazine && state.ideas.some(i => i.fromMagazine && !i.guide && !i.skipped) ? Math.max(0, MAGAZINE_PER_DAY - spentToday(true)) : 0)
  for (const idea of state.ideas) {
    if (spentToday(false) >= o.perDay || (stopped.shops && stopped.magazine)) break
    if (idea.guide || idea.skipped || stopped[idea.fromMagazine ? 'magazine' : 'shops']) continue
    if (idea.fromMagazine ? spentToday(true) >= MAGAZINE_PER_DAY : spentToday(false) + forMagazine() >= o.perDay) continue
    const id = topicId(idea.topic)
    // A guide of that name already (the ideas missed it): taken as written, never rewritten from here.
    if (await readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8').then(() => true, () => false)) { idea.guide = id; continue }
    const archive = idea.fromMagazine ? d.archive : undefined
    if (archive && asksLeft(state, 'post', d.now()) <= 0) { stop('magazine', `the day's ${ARCHIVE_POST_DAY} requests to the archive for the magazine's post are spent`); continue }
    try {
      // A guide is one piece: started only when what's left of the day's line covers a typical one (pieces.ts).
      const leads = ideaLeads(idea, state, await cycleOnlyHosts(root))
      // The magazine's post is read inside the piece, so a day's line that won't cover the guide asks the Archive nothing.
      const { r, post } = await piece(id, async () => {
        let post: Awaited<ReturnType<typeof magazinePost>>
        if (archive) {
          // Capped at what's left of the day's requests, each counted and saved as it is made: a guide the model stops
          // later asks no more of the Archive that day. The Archive answered: the wait for its rest is over.
          const reader = archive.capped(asksLeft(state, 'post', d.now()))
          try { post = await magazinePost(idea, state, reader) } finally { countAsks(state, 'post', d.now(), reader.asked); await save(root, state) }
          delete state.archiveWaits
        }
        const r = await makeTopic(root, { research: d.research, llm: d.llm }, { topic: idea.topic, kind: idea.kind }, { leads, now: d.now, ...(post?.page ? { given: post.page } : {}), ...(o.researchModel ? { researchModel: o.researchModel } : {}) })
        return { r, post }
      }, { now: d.now })
      if ('skipped' in r && r.skipped) { idea.skipped = r.skipped; report.skipped.push(r.skipped) } else { idea.guide = r.id; report.written.push(r.id) }
      if (post) {
        const p = post.page
        idea.post = { url: post.url, ...(p ? { title: p.title, ...(p.capturedAt ? { capturedAt: p.capturedAt } : {}), hash: p.hash } : {}), via: 'archive', result: p ? ('post' in r && r.post) || 'not cited' : 'no copy' }
        report.posts.push(`${idea.topic}: ${post.url}: ${idea.post.result}`)
      }
      await spent(idea)
    } catch (err) {
      if (err instanceof LlmError) { stop(idea.fromMagazine ? 'magazine' : 'shops', err.message); continue }
      // The Archive resting: the day's magazine guide waits for its post, the idea as it was; the shops' goes on. The days
      // it waits in a row are kept, and said each run (the chief of staff, 21 Nov 2026: told at three running).
      if (err instanceof ArchiveRefused) {
        stop('magazine', err.message)
        const waits = state.archiveWaits ?? []
        const last = waits.at(-1)
        state.archiveWaits = last === today() ? waits : last === vnDay(new Date(d.now().getTime() - 86_400_000)) ? [...waits, today()] : [today()]
        report.waited = state.archiveWaits.length
        continue
      }
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
