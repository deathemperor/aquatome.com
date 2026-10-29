import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Llm } from './claude'
import { loadState } from './state'
import type { Playlist } from './youtube'

/** A playlist the engine knows: queued for guides, or rejected (`skip`) so it is never vetted again. */
export type PlaylistEntry = { id: string; title: string; channel: string; by: 'seed' | 'owner' | 'search'; addedAt: string; videoIds?: string[]; skip?: boolean; reason?: string }
export type Found = { id: string; title: string; channel: string }
export type Finder = { search(query: string): Promise<Found[]>; searchVideos(query: string): Promise<Found[]>; channel(handle: string): Promise<Found[]>; uploads(handle: string): Promise<Found[]>; playlist(id: string): Promise<Playlist> }
/** A single video queued for a guide (engine-state/youtube-videos.json), or rejected (`skip`). */
export type VideoEntry = { id: string; title: string; channel: string; by: 'owner' | 'search'; addedAt: string; skip?: boolean; reason?: string }

/** Searches per source language (see SOURCE_LANGS); a new site language adds its own list. */
export const QUERIES_BY_LANG: Record<string, string[]> = {
  vi: [
    'hướng dẫn thủy sinh', 'setup bể thủy sinh', 'làm bể thủy sinh cho người mới', 'trị rêu hại bể thủy sinh', 'cách nuôi cá betta', 'cách nuôi cá cảnh cho người mới',
    'chu trình nitơ bể cá', 'cách thay nước bể cá', 'cây thủy sinh dễ trồng', 'bố cục thủy sinh', 'bể thủy sinh không CO2', 'cách nuôi tép cảnh',
    'bệnh cá cảnh cách chữa', 'chọn lọc bể cá', 'đèn thủy sinh', 'phân nền thủy sinh', 'cách nuôi cá rồng', 'hồ cá koi', 'cách nuôi cá vàng',
    'cách nuôi cá bảy màu', 'cách nuôi cá dĩa', 'bể thủy sinh mini', 'trồng rêu thủy sinh', 'cách nuôi cá neon', 'bể cá cho người mới',
  ],
  en: [] as string[],
}
/** English searches for teaching playlists (YouTube's own playlist filter). */
export const QUERIES = [
  'aquascaping guide', 'planted tank for beginners', 'aquarium algae guide', 'aquarium fish care guide', 'aquarium beginner guide', 'nitrogen cycle aquarium',
  'aquarium plants guide', 'low tech planted tank', 'nano aquarium setup', 'betta fish care', 'aquarium shrimp keeping guide', 'aquarium fish disease treatment',
  'aquarium filter guide', 'aquarium maintenance tips', 'cichlid care guide', 'livebearer fish breeding', 'aquarium fish breeding guide', 'aquarium water chemistry',
  'aquarium CO2 guide', 'aquarium lighting guide', 'pond fish guide', 'koi pond guide', 'goldfish care guide', 'aquarium fish species profile',
  'catfish corydoras care', 'killifish keeping', 'blackwater aquarium', 'aquarium hardscape tutorial', 'iwagumi tutorial', 'carpeting plants guide',
]
/** Channels known for teaching videos: their playlists are vetted like search results. */
export const CHANNELS = ['MJAquascaping', 'AquariumCoOp', 'SerpaDesign', 'GeorgeFarmerStudios', 'MDFishTanks', 'KingofDIY', 'KGTropicals', 'RachelOLeary', 'girltalksfish', 'PrimeTimeAquatics', 'TheSmallScape', 'BucePlant', '2HrAquarist']

const FILE = (root: string) => join(root, 'engine-state/youtube-playlists.json')
const VFILE = (root: string) => join(root, 'engine-state/youtube-videos.json')
export const readVideoEntries = async (root: string): Promise<VideoEntry[]> => JSON.parse(await readFile(VFILE(root), 'utf8').catch(() => '[]'))
export const writeVideoEntries = (root: string, xs: VideoEntry[]) => writeFile(VFILE(root), `${JSON.stringify(xs, null, 2)}\n`)
export const writeEntriesFile = (root: string, xs: PlaylistEntry[]) => writeEntries(root, xs)
export const readEntries = async (root: string): Promise<PlaylistEntry[]> => JSON.parse(await readFile(FILE(root), 'utf8').catch(() => '[]'))
const writeEntries = (root: string, xs: PlaylistEntry[]) => writeFile(FILE(root), `${JSON.stringify(xs, null, 2)}\n`)

const VET_SCHEMA = {
  type: 'object', required: ['verdicts'],
  properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'ok', 'reason'], properties: { id: { type: 'string' }, ok: { type: 'boolean' }, reason: { type: 'string' } } } } },
}
const VET = `You pick YouTube playlists for a Vietnamese aquarium handbook, which writes an original Vietnamese guide from each video and embeds the video.

ok = true only if most videos teach how to keep, set up, aquascape, breed, feed or treat aquarium or pond fish, shrimp, snails or aquatic plants (care guides, how-tos, species profiles, troubleshooting, explainers), in English or Vietnamese.
ok = false for: vlogs, fish room or store tours, unboxings and product reviews, haul or "new fish" videos, livestreams (e.g. "livestream bán cá"), shop sales or price-list videos, contests, timelapses or relaxing footage without teaching, Shorts compilations, reef/saltwater-only playlists, kids' content, playlists mostly of other channels' videos, other languages.

reason: a few words. Reply with a verdict for every playlist id given.`

export type DiscoveryReport = { candidates: number; added: string[]; rejected: number; skipped: string; errors: string[] }

/**
 * Finds teaching playlists (searches + known channels), drops ones mostly overlapping playlists we already have,
 * asks the model to vet the rest, and appends both verdicts to engine-state/youtube-playlists.json.
 * Does nothing while ≥ `queueCap` queued videos still wait for guides.
 */
export async function discoverPlaylists(deps: { find: Finder; llm: Llm; root: string; now: () => Date }, opts: { maxNew?: number; queueCap?: number; queries?: string[]; channels?: string[]; force?: boolean } = {}): Promise<DiscoveryReport> {
  const { find, llm, root } = deps
  const report: DiscoveryReport = { candidates: 0, added: [], rejected: 0, skipped: '', errors: [] }
  const entries = await readEntries(root)
  const done = await loadState(root, 'youtube')
  const queued = new Set(entries.filter(e => !e.skip).flatMap(e => e.videoIds ?? []).filter(v => !done[v]))
  if (!opts.force && queued.size >= (opts.queueCap ?? 150)) { report.skipped = `${queued.size} videos already queued`; return report }

  const known = new Set(entries.map(e => e.id))
  const seen = new Map<string, Found>()
  const take = (xs: Found[]) => { for (const x of xs) if (x.id.startsWith('PL') && !known.has(x.id) && !seen.has(x.id)) seen.set(x.id, x) }
  for (const q of opts.queries ?? [...QUERIES, ...Object.values(QUERIES_BY_LANG).flat()]) await find.search(q).then(take, e => report.errors.push(`search "${q}": ${(e as Error).message}`))
  for (const h of opts.channels ?? CHANNELS) await find.channel(h).then(take, e => report.errors.push(`channel @${h}: ${(e as Error).message}`))
  report.candidates = seen.size

  const haveVideos = new Set([...entries.filter(e => !e.skip).flatMap(e => e.videoIds ?? []), ...Object.keys(done)])
  const maxNew = opts.maxNew ?? 10
  const today = deps.now().toISOString().slice(0, 10)
  const batch: Playlist[] = []
  for (const f of seen.values()) {
    if (report.added.length + batch.length >= maxNew * 2) break // vet at most twice what we want: roughly half pass
    let p: Playlist
    try { p = await find.playlist(f.id) } catch (e) { report.errors.push(`playlist ${f.id}: ${(e as Error).message}`); continue }
    const ids = p.videos.map(v => v.id)
    const overlap = ids.filter(v => haveVideos.has(v)).length
    const why = ids.length < 3 ? 'fewer than 3 videos' : ids.length > 150 ? 'more than 150 videos' : overlap * 2 >= ids.length ? 'mostly videos we already have' : null
    if (why) { entries.push({ id: p.id, title: p.title, channel: p.channel, by: 'search', addedAt: today, skip: true, reason: why }); report.rejected++; continue }
    batch.push(p)
  }

  for (let i = 0; i < batch.length; i += 8) {
    const part = batch.slice(i, i + 8)
    const list = part.map(p => `## ${p.id}\nTitle: ${p.title}\nChannel: ${p.channel}\nVideos (${p.videos.length}):\n${p.videos.slice(0, 25).map(v => `- ${v.title}`).join('\n')}`).join('\n\n')
    let verdicts: { id: string; ok: boolean; reason: string }[]
    try { verdicts = (await llm<{ verdicts: typeof verdicts }>({ system: 'You vet YouTube playlists. Reply only with JSON.', prompt: `${VET}\n\n${list}`, schema: VET_SCHEMA })).verdicts }
    catch (e) { report.errors.push(`vetting: ${(e as Error).message}`); break }
    for (const p of part) {
      const v = verdicts.find(x => x.id === p.id)
      if (!v || (v.ok && report.added.length >= maxNew)) continue // not judged, or over this run's limit: seen again next run
      entries.push({ id: p.id, title: p.title, channel: p.channel, by: 'search', addedAt: today, videoIds: p.videos.map(x => x.id), ...(v.ok ? {} : { skip: true, reason: v.reason }) })
      if (v.ok) { report.added.push(`${p.id} ${p.title} (${p.channel}, ${p.videos.length})`); for (const x of p.videos) haveVideos.add(x.id) } else report.rejected++
    }
  }
  await writeEntries(root, entries)
  return report
}

const VET_VIDEOS = `You pick single YouTube videos for a Vietnamese aquarium handbook, which writes an original Vietnamese guide from each video and embeds it.

ok = true only if the title says the video teaches something practical about keeping, setting up, aquascaping, breeding, feeding or treating aquarium or pond fish, shrimp, snails or aquatic plants: a how-to, care guide, species profile, troubleshooting, explainer, DIY build with steps, or a tips list. In English or Vietnamese.
ok = false for: vlogs, fish room or store tours, unboxings, product reviews or sponsored showcases, hauls, "new fish" or "I bought" videos, livestreams and Q&A streams ("livestream", "trực tiếp"), shop sales and price lists ("bán", "giá rẻ", "thanh lý", "săn hàng"), contests, timelapses or relaxing footage, Shorts, channel news, reef/saltwater-only topics, other languages.

reason: a few words. Reply with a verdict for every id given.`

export type SinglesReport = { candidates: number; added: string[]; rejected: number; errors: string[] }

/** Single teaching videos from channels' upload pages: unknown ones vetted by title (40 a call) until `maxNew` are queued. */
/** Single videos come from channels' upload pages and from video searches (the site language's: creators there use playlists less). */
export async function discoverSingles(deps: { find: Finder; llm: Llm; root: string; now: () => Date }, opts: { channels?: string[]; queries?: string[]; maxNew?: number } = {}): Promise<SinglesReport> {
  const { find, llm, root } = deps
  const report: SinglesReport = { candidates: 0, added: [], rejected: 0, errors: [] }
  const entries = await readVideoEntries(root)
  const known = new Set([...entries.map(e => e.id), ...(await readEntries(root)).flatMap(e => e.videoIds ?? []), ...Object.keys(await loadState(root, 'youtube'))])
  const fresh: Found[] = []
  for (const h of opts.channels ?? CHANNELS) {
    const xs = await find.uploads(h).catch(e => { report.errors.push(`uploads @${h}: ${(e as Error).message}`); return [] as Found[] })
    for (const x of xs) if (!known.has(x.id)) { known.add(x.id); fresh.push(x) }
  }
  for (const q of opts.queries ?? QUERIES_BY_LANG.vi!) {
    const xs = await find.searchVideos(q).catch(e => { report.errors.push(`video search "${q}": ${(e as Error).message}`); return [] as Found[] })
    for (const x of xs) if (!known.has(x.id)) { known.add(x.id); fresh.push(x) }
  }
  report.candidates = fresh.length
  const maxNew = opts.maxNew ?? 30
  const today = deps.now().toISOString().slice(0, 10)
  for (let i = 0; i < fresh.length && report.added.length < maxNew; i += 40) {
    const part = fresh.slice(i, i + 40)
    let verdicts: { id: string; ok: boolean; reason: string }[]
    try { verdicts = (await llm<{ verdicts: typeof verdicts }>({ system: 'You vet YouTube videos. Reply only with JSON.', prompt: `${VET_VIDEOS}\n\n${part.map(v => `${v.id} | ${v.channel} | ${v.title}`).join('\n')}`, schema: VET_SCHEMA })).verdicts }
    catch (e) { report.errors.push(`vetting: ${(e as Error).message}`); break }
    for (const v of part) {
      const x = verdicts.find(y => y.id === v.id)
      if (!x || (x.ok && report.added.length >= maxNew)) continue // seen again next run
      entries.push({ id: v.id, title: v.title, channel: v.channel, by: 'search', addedAt: today, ...(x.ok ? {} : { skip: true, reason: x.reason }) })
      if (x.ok) report.added.push(`${v.id} ${v.title} (${v.channel})`); else report.rejected++
    }
  }
  await writeVideoEntries(root, entries)
  return report
}

/** The owner's picks (playlist and video URLs) go to the front of the queues; a rejected one is un-rejected. */
export async function addOwnerPicks(root: string, urls: string[], find: Finder, now: Date): Promise<string[]> {
  const today = now.toISOString().slice(0, 10)
  const lists = await readEntries(root)
  const vids = await readVideoEntries(root)
  const out: string[] = []
  for (const u of urls) {
    const list = /[?&]list=([\w-]+)/.exec(u)?.[1]
    const video = /(?:[?&]v=|youtu\.be\/)([\w-]{11})/.exec(u)?.[1]
    if (list && !video) {
      const p = await find.playlist(list)
      const rest = lists.filter(e => e.id !== list)
      lists.splice(0, lists.length, { id: list, title: p.title, channel: p.channel, by: 'owner', addedAt: today, videoIds: p.videos.map(v => v.id) }, ...rest)
      out.push(`playlist ${list}: ${p.title} (${p.videos.length})`)
    } else if (video) {
      const rest = vids.filter(e => e.id !== video)
      vids.splice(0, vids.length, { id: video, title: '', channel: '', by: 'owner', addedAt: today }, ...rest)
      out.push(`video ${video}`)
    } else out.push(`not a playlist or video URL: ${u}`)
  }
  await writeEntries(root, lists)
  await writeVideoEntries(root, vids)
  return out
}
