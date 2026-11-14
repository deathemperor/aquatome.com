import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { slugify, type GuideEntity, type SourceId } from '@aq/schema'
import { vnDay } from './ceiling'
import { LlmError, type Llm } from './claude'
import { cycleOnlyHosts, refused } from './cycle-only'
import { IDEA_SOURCES, ideaHost, NEVER_RESEARCHED, type Drop, type Listing } from './idea-sources'
import { isMarketplace } from './marketplaces'
import { piece } from './pieces'
import { setSourceBlock, sourceBlockedSince } from './state'
import { makeTopic, topicId } from './topics'

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
/** A post: its title as the shop gives it (the address's words, for a sitemap), and its date. */
export type Post = { url: string; title: string; date?: string }
/**
 * `guide`: the guide written on it; `skipped`: why none was (research found nothing reliable). `fromMagazine`: every post
 * on it is the magazine's, none a shop's. `latest`: the newest of its shops' posts (of all its posts, the magazine's own
 * idea's). `at`: when research was spent on it, what the day's cap counts (writeIdeas).
 */
export type Idea = { topic: string; kind: GuideKind; posts: string[]; sites: number; latest?: string; guide?: string; skipped?: string; fromMagazine?: true; at?: string }
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
}
export type IdeasDeps = { get: (url: string) => Promise<string>; llm: Llm; sleep: (ms: number) => Promise<void>; now: () => Date }

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

/**
 * The shops' titles read again (a week on, or `force`), and the ideas made from them afresh. An idea already written or
 * skipped keeps that, so it never comes back, and one still waiting stays whether or not the model names it again: the
 * model adds ideas, never drops one (the chief of staff, 14 Nov 2026). A site's last titles stand unless its new listing
 * has posts: one that fails, is empty, or isn't a listing at all changes nothing. A site that refuses us (a 403 or a 429,
 * or an answer that isn't its listing: listPosts) is marked as needing the owner (engine-state/_sources.json, which the
 * dashboard shows and research keeps off, cycle-only.ts), and isn't fetched again until a run with `retryBlocked`; `force`
 * doesn't pass it. `listed`: each site's posts kept, and how many each of its rules left out, with their titles.
 */
export async function refreshIdeas(root: string, d: IdeasDeps, o: { force?: boolean; retryBlocked?: boolean } = {}) {
  const state = await readIdeas(root)
  const report = { fresh: false, posts: 0, ideas: 0, failed: [] as string[], needsHuman: [] as SourceId[], blocked: [] as SourceId[], listed: {} as Partial<Record<SourceId, { kept: number; dropped: Record<string, number>; titles: Record<string, string[]> }>> }
  if (!o.force && state.readAt && d.now().getTime() - Date.parse(state.readAt) < FRESH_DAYS * 86_400_000) return { ...report, fresh: true }
  let first = true
  const get = async (url: string) => { if (!first) await d.sleep(DELAY); first = false; return d.get(url) }
  for (const s of IDEA_SOURCES) {
    const since = await sourceBlockedSince(root, s.id)
    if (since && !o.retryBlocked) { report.blocked.push(s.id); continue }
    try {
      const { kept, dropped, titles } = dropPosts(await listPosts(s.list, get), s.drop ?? [])
      report.listed[s.id] = { kept: kept.length, dropped, titles }
      if (!kept.length) throw new Error('an empty listing')
      state.posts[s.id] = kept
      if (since) await setSourceBlock(root, s.id, undefined)
    } catch (err) {
      if (err instanceof ListingRefused) { await setSourceBlock(root, s.id, since ?? d.now().toISOString()); report.needsHuman.push(s.id) }
      report.failed.push(`${s.id}: ${(err as Error).message.slice(0, 120)}, its last titles kept`)
    }
  }
  const posts = IDEA_SOURCES.flatMap(s => (state.posts[s.id] ?? []).map(p => ({ ...p, site: s.id })))
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
  state.readAt = d.now().toISOString()
  await save(root, state)
  return { ...report, posts: posts.length, ideas: added }
}

/**
 * The lines a guide's research gets from the shops' posts on its topic. Never a post on a host research may not open
 * (`denied`: cycle-only.ts, the magazine's always, idea-sources.ts NEVER_RESEARCHED) nor a marketplace's, told by its
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

/**
 * Guides on the most asked ideas, `perDay` at most a day (Vietnam's, as the engine's ceilings count: ceiling.ts vnDay):
 * MAGAZINE_PER_DAY of them kept for the magazine's while it has one waiting, the rest the shops'. The day's count is the
 * ideas research was spent on that day (`at`), each saved as it is spent. A model that stops (quota) stops that side, the
 * shops' or the magazine's, the idea left for the next run, and the other side is still tried; any other failure counts,
 * and is kept as the idea's reason. `magazine`: the ideas of the magazine's it wrote on, written or skipped.
 */
export async function writeIdeas(root: string, d: { research: Llm; llm: Llm; now: () => Date }, o: { perDay: number; researchModel?: string }) {
  const state = await readIdeas(root)
  // Read again at each idea: a run that passes midnight counts the new day's.
  const today = () => vnDay(d.now())
  const report = { written: [] as string[], skipped: [] as string[], failed: [] as string[], stopped: '', magazine: [] as string[] }
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
  const stopped = { shops: false, magazine: false }
  const forMagazine = () => (!stopped.magazine && state.ideas.some(i => i.fromMagazine && !i.guide && !i.skipped) ? Math.max(0, MAGAZINE_PER_DAY - spentToday(true)) : 0)
  for (const idea of state.ideas) {
    if (spentToday(false) >= o.perDay || (stopped.shops && stopped.magazine)) break
    if (idea.guide || idea.skipped || stopped[idea.fromMagazine ? 'magazine' : 'shops']) continue
    if (idea.fromMagazine ? spentToday(true) >= MAGAZINE_PER_DAY : spentToday(false) + forMagazine() >= o.perDay) continue
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
      if (err instanceof LlmError) { stopped[idea.fromMagazine ? 'magazine' : 'shops'] = true; report.stopped = [report.stopped, err.message].filter(Boolean).join('; '); continue }
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
