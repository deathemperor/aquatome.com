import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { slugify, type GuideEntity, type SourceId } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { piece } from './pieces'
import { makeTopic, topicId } from './topics'

/**
 * Vietnamese shops' blogs, read for ideas (content/sources.json: orientation only, the owner's word of 2026-11-03): their
 * posts' titles, never their text. What they write about is what Vietnamese keepers search for; a topic the handbook has
 * no guide on becomes one of AquaTome's own guides, researched like any other (topics.ts), with the shops' posts on it
 * as leads. engine-state/_ideas.json.
 */
type Listing = { kind: 'sitemap'; url: string; prefix: string } | { kind: 'wordpress'; base: string; category: string }
export const IDEA_SOURCES: { id: SourceId; name: string; list: Listing }[] = [
  { id: 'aquazonefish', name: 'AquaZone', list: { kind: 'sitemap', url: 'https://aquazonefish.vn/sitemap_blogs_1.xml', prefix: 'https://aquazonefish.vn/blogs/kien-thuc/' } },
  { id: 'aquahouse', name: 'Aqua House', list: { kind: 'wordpress', base: 'https://aquahouse.vn', category: 'tin-tuc-aqua' } },
  { id: 'cacanhtailoc', name: 'Cá Cảnh Tài Lộc', list: { kind: 'sitemap', url: 'https://cacanhtailoc.com/sitemap_blogs_1.xml', prefix: 'https://cacanhtailoc.com/blogs/tin-tuc/' } },
]
const DELAY = 5_000
/** The titles are read again a week on. */
const FRESH_DAYS = 7

type GuideKind = GuideEntity['kind']
const KINDS: GuideKind[] = ['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery']
/** A post: its title as the shop gives it (the address's words, for a sitemap), and its date. */
export type Post = { url: string; title: string; date?: string }
/** `guide`: the guide written on it; `skipped`: why none was (research found nothing reliable). */
export type Idea = { topic: string; kind: GuideKind; posts: string[]; sites: number; latest?: string; guide?: string; skipped?: string }
export type IdeasState = {
  readAt?: string
  posts: Partial<Record<SourceId, Post[]>>
  /** Most asked first: by how many shops write on it, then how many posts, then the newest. */
  ideas: Idea[]
  /** Guides written from ideas, per day (UTC): the day's cap. */
  written: Record<string, number>
}
export type IdeasDeps = { get: (url: string) => Promise<string>; llm: Llm; sleep: (ms: number) => Promise<void>; now: () => Date }

const file = (root: string) => join(root, 'engine-state/_ideas.json')
export const readIdeas = async (root: string): Promise<IdeasState> =>
  ({ posts: {}, ideas: [], written: {}, ...JSON.parse(await readFile(file(root), 'utf8').catch(() => '{}')) as Partial<IdeasState> })
const save = (root: string, s: IdeasState) => writeFile(file(root), `${JSON.stringify(s, null, 2)}\n`)

const unescape = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** A site's posts: a sitemap's addresses under the blog (titled by their words), or a WordPress category's posts (100 a page). */
export async function listPosts(list: Listing, get: (url: string) => Promise<string>): Promise<Post[]> {
  if (list.kind === 'sitemap') {
    const xml = await get(list.url)
    return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap(([, u]) => {
      const loc = unescape(/<loc>\s*([^<]+?)\s*<\/loc>/.exec(u!)?.[1] ?? '')
      const slug = loc.startsWith(list.prefix) ? loc.slice(list.prefix.length).replace(/\/$/, '') : ''
      if (!/^[a-z0-9-]+$/.test(slug)) return []
      const date = /<lastmod>\s*(\d{4}-\d{2}-\d{2})/.exec(u!)?.[1]
      return [{ url: loc, title: slug.replace(/-/g, ' '), ...(date ? { date } : {}) }]
    })
  }
  const cats = JSON.parse(await get(`${list.base}/wp-json/wp/v2/categories?slug=${list.category}&_fields=id`)) as { id: number }[]
  if (!cats[0]) throw new Error(`no category ${list.category}`)
  const out: Post[] = []
  for (let page = 1; page <= 20; page++) {
    const rows = JSON.parse(await get(`${list.base}/wp-json/wp/v2/posts?categories=${cats[0].id}&per_page=100&page=${page}&_fields=link,title,date`)) as { link: string; title: { rendered: string }; date: string }[]
    out.push(...rows.map(r => ({ url: r.link, title: unescape(r.title.rendered).replace(/<[^>]+>/g, '').trim(), date: r.date.slice(0, 10) })))
    if (rows.length < 100) break
  }
  return out
}

const PROMPT = `Below are the titles of posts on Vietnamese aquarium shops' blogs (a title may be the post's address, without accents), numbered, and the guides a Vietnamese freshwater aquarium handbook already has. The shops write what Vietnamese keepers search for. List the topics these posts are about that the handbook should have a guide on and has none.

For each topic:
- topic: the guide's subject in Vietnamese, with its accents, as a keeper would search it (for example "Nước bể cá bị đục trắng: nguyên nhân và cách xử lý").
- kind: setup (setting up a tank and its equipment), care (keeping fish well: water, feeding, tank mates, routine), breeding, disease (an illness or a problem to fix), aquascaping, plantCare, discovery (other things worth knowing).
- posts: the numbers of the posts about it.

Leave out: what a listed guide already covers, even in other words; one fish's or plant's own profile (the handbook has a page for each species); products, prices, brands, shop news and lists of shops; ponds and koi; saltwater; luck and feng shui. One topic per subject: merge posts that ask the same thing.`
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
 * skipped keeps that, so it never comes back; a site that fails keeps its last titles.
 */
export async function refreshIdeas(root: string, d: IdeasDeps, o: { force?: boolean } = {}) {
  const state = await readIdeas(root)
  const report = { fresh: false, posts: 0, ideas: 0, failed: [] as string[] }
  if (!o.force && state.readAt && d.now().getTime() - Date.parse(state.readAt) < FRESH_DAYS * 86_400_000) return { ...report, fresh: true }
  let first = true
  const get = async (url: string) => { if (!first) await d.sleep(DELAY); first = false; return d.get(url) }
  for (const s of IDEA_SOURCES) {
    try { state.posts[s.id] = await listPosts(s.list, get) } catch (err) { report.failed.push(`${s.id}: ${(err as Error).message.slice(0, 120)}`) }
  }
  const posts = IDEA_SOURCES.flatMap(s => (state.posts[s.id] ?? []).map(p => ({ ...p, site: s.id })))
  if (!posts.length) return report
  const guides = await guideNames(root)
  const r = await d.llm<{ ideas: { topic: string; kind: GuideKind; posts: number[] }[] }>({
    system: 'You plan an aquarium handbook\'s guides. Reply only with JSON.', schema: SCHEMA,
    prompt: `${PROMPT}\n\nPOSTS:\n${posts.map((p, i) => `${i + 1}. ${p.title}`).join('\n')}\n\nGUIDES:\n${guides.map(g => `- ${g}`).join('\n')}`,
  })
  const done = new Map(state.ideas.filter(i => i.guide || i.skipped).map(i => [slugify(i.topic), i]))
  const made = new Map<string, Idea>()
  for (const x of r.ideas ?? []) {
    const topic = String(x.topic ?? '').trim().slice(0, 140)
    const mine = [...new Set((x.posts ?? []).map(n => posts[Math.round(n) - 1]).filter(p => p !== undefined))]
    if (!topic || !KINDS.includes(x.kind) || !mine.length || done.has(slugify(topic)) || made.has(slugify(topic))) continue
    const latest = mine.map(p => p.date ?? '').sort().at(-1)
    made.set(slugify(topic), { topic, kind: x.kind, posts: mine.map(p => p.url), sites: new Set(mine.map(p => p.site)).size, ...(latest ? { latest } : {}) })
  }
  state.ideas = [...[...made.values()].sort((a, b) => b.sites - a.sites || b.posts.length - a.posts.length || (b.latest ?? '').localeCompare(a.latest ?? '')), ...done.values()]
  state.readAt = d.now().toISOString()
  await save(root, state)
  return { ...report, posts: posts.length, ideas: made.size }
}

/** The lines a guide's research gets from the shops' posts on its topic. */
export function ideaLeads(idea: Idea, state: IdeasState): string {
  const titles = new Map(Object.values(state.posts).flat().map(p => [p!.url, p!.title]))
  return `\n\nWhat Vietnamese keepers read on this, from aquarium shops' blogs (orientation only: never copy or translate their text; they sell what they write about, so check every fact elsewhere, and cite one of them only for a Vietnamese name or what is sold in Vietnam):\n${idea.posts.slice(0, 6).map(u => `- ${u} (${titles.get(u) ?? ''})`).join('\n')}`
}

/**
 * Guides on the most asked ideas, `perDay` at most a day (UTC). A model that stops (quota) stops it, the idea left for
 * the next run; any other failure counts, and is kept as the idea's reason.
 */
export async function writeIdeas(root: string, d: { research: Llm; llm: Llm; now: () => Date }, o: { perDay: number; researchModel?: string }) {
  const state = await readIdeas(root)
  const today = d.now().toISOString().slice(0, 10)
  const report = { written: [] as string[], skipped: [] as string[], failed: [] as string[], stopped: '' }
  for (const idea of state.ideas) {
    if ((state.written[today] ?? 0) >= o.perDay) break
    if (idea.guide || idea.skipped) continue
    const id = topicId(idea.topic)
    // A guide of that name already (the ideas missed it): taken as written, never rewritten from here.
    if (await readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8').then(() => true, () => false)) { idea.guide = id; continue }
    try {
      // A guide is one piece: started only when what's left of the day's line covers a typical one (pieces.ts).
      const r = await piece(id, () => makeTopic(root, { research: d.research, llm: d.llm }, { topic: idea.topic, kind: idea.kind }, { leads: ideaLeads(idea, state), now: d.now, ...(o.researchModel ? { researchModel: o.researchModel } : {}) }), { now: d.now })
      state.written[today] = (state.written[today] ?? 0) + 1
      if ('skipped' in r && r.skipped) { idea.skipped = r.skipped; report.skipped.push(r.skipped) } else { idea.guide = r.id; report.written.push(r.id) }
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = err.message; break }
      // Research was spent on it: it counts, and is not tried again (the reason is kept).
      state.written[today] = (state.written[today] ?? 0) + 1
      idea.skipped = `failed: ${(err as Error).message.slice(0, 120)}`
      report.failed.push(`${idea.topic}: ${idea.skipped}`)
    }
  }
  state.written = Object.fromEntries(Object.entries(state.written).filter(([day]) => d.now().getTime() - Date.parse(day) < 30 * 86_400_000))
  await save(root, state)
  return report
}
