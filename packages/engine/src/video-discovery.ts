import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Llm } from './claude'
import { loadState } from './state'
import type { Playlist } from './youtube'

/** A playlist the engine knows: queued for guides, or rejected (`skip`) so it is never vetted again. */
export type PlaylistEntry = { id: string; title: string; channel: string; by: 'seed' | 'search'; addedAt: string; videoIds?: string[]; skip?: boolean; reason?: string }
export type Found = { id: string; title: string; channel: string }
export type Finder = { search(query: string): Promise<Found[]>; channel(handle: string): Promise<Found[]>; playlist(id: string): Promise<Playlist> }

/** English searches for teaching playlists (YouTube's own playlist filter). */
export const QUERIES = [
  'aquascaping guide', 'planted tank for beginners', 'aquarium algae guide', 'aquarium fish care guide', 'aquarium beginner guide', 'nitrogen cycle aquarium',
  'aquarium plants guide', 'low tech planted tank', 'nano aquarium setup', 'betta fish care', 'aquarium shrimp keeping guide', 'aquarium fish disease treatment',
  'aquarium filter guide', 'aquarium maintenance tips', 'cichlid care guide', 'livebearer fish breeding', 'aquarium fish breeding guide', 'aquarium water chemistry',
  'aquarium CO2 guide', 'aquarium lighting guide', 'pond fish guide', 'koi pond guide', 'goldfish care guide', 'aquarium fish species profile',
  'catfish corydoras care', 'killifish keeping', 'blackwater aquarium', 'aquarium hardscape tutorial', 'iwagumi tutorial', 'carpeting plants guide',
]
/** Channels known for teaching videos: their playlists are vetted like search results. */
export const CHANNELS = ['MJAquascaping', 'AquariumCoOp', 'SerpaDesign', 'KGTropicals', 'RachelOLeary', 'girltalksfish', 'PrimeTimeAquatics', 'TheSmallScape', 'BucePlant', '2HrAquarist']

const FILE = (root: string) => join(root, 'engine-state/youtube-playlists.json')
export const readEntries = async (root: string): Promise<PlaylistEntry[]> => JSON.parse(await readFile(FILE(root), 'utf8').catch(() => '[]'))
const writeEntries = (root: string, xs: PlaylistEntry[]) => writeFile(FILE(root), `${JSON.stringify(xs, null, 2)}\n`)

const VET_SCHEMA = {
  type: 'object', required: ['verdicts'],
  properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'ok', 'reason'], properties: { id: { type: 'string' }, ok: { type: 'boolean' }, reason: { type: 'string' } } } } },
}
const VET = `You pick YouTube playlists for a Vietnamese aquarium handbook, which writes an original Vietnamese guide from each video and embeds the video.

ok = true only if most videos teach how to keep, set up, aquascape, breed, feed or treat aquarium or pond fish, shrimp, snails or aquatic plants (care guides, how-tos, species profiles, troubleshooting, explainers), in English.
ok = false for: vlogs, fish room or store tours, unboxings and product reviews, haul or "new fish" videos, livestreams, contests, timelapses or relaxing footage without teaching, Shorts compilations, reef/saltwater-only playlists, kids' content, playlists mostly of other channels' videos, non-English.

reason: a few words. Reply with a verdict for every playlist id given.`

export type DiscoveryReport = { candidates: number; added: string[]; rejected: number; skipped: string; errors: string[] }

/**
 * Finds teaching playlists (searches + known channels), drops ones mostly overlapping playlists we already have,
 * asks the model to vet the rest, and appends both verdicts to engine-state/youtube-playlists.json.
 * Does nothing while ≥ `queueCap` queued videos still wait for guides.
 */
export async function discoverPlaylists(deps: { find: Finder; llm: Llm; root: string; now: () => Date }, opts: { maxNew?: number; queueCap?: number; queries?: string[]; channels?: string[] } = {}): Promise<DiscoveryReport> {
  const { find, llm, root } = deps
  const report: DiscoveryReport = { candidates: 0, added: [], rejected: 0, skipped: '', errors: [] }
  const entries = await readEntries(root)
  const done = await loadState(root, 'youtube')
  const queued = new Set(entries.filter(e => !e.skip).flatMap(e => e.videoIds ?? []).filter(v => !done[v]))
  if (queued.size >= (opts.queueCap ?? 150)) { report.skipped = `${queued.size} videos already queued`; return report }

  const known = new Set(entries.map(e => e.id))
  const seen = new Map<string, Found>()
  const take = (xs: Found[]) => { for (const x of xs) if (x.id.startsWith('PL') && !known.has(x.id) && !seen.has(x.id)) seen.set(x.id, x) }
  for (const q of opts.queries ?? QUERIES) await find.search(q).then(take, e => report.errors.push(`search "${q}": ${(e as Error).message}`))
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
