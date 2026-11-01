import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadAll, SOURCE_IDS, type SourceId } from '@aq/schema'
import { LlmError, claudeCli, claudeResearch, claudeVision } from './claude'
import { makeProduct } from './products'
import { readKit } from './video-items'
import { auditPictures } from './audit'
import { metricPages } from './metric'
import { checkPages, fixStored, rulesReport } from './content-rules'
import { loadPages } from './pages'
import { readerReport, readPages } from './reader'
import { dropFacePhotos, visionFaces } from './faces'
import { backfillPhotos } from './photo-backfill'
import { ChromeFetcher } from './fetch'
import { r2Media } from './media'
import { mirrorPhotos } from './mirror-photos'
import { fishbasePhotos, inatPhotos } from './fishbase-photos'
import { cryptsPhotos } from './crypts-photos'
import { ownPhotos } from './own-photos'
import { httpAdmin, moderate } from './moderate'
import { httpPhotoAdmin, moderatePhotos, VERDICT_SCHEMA, type Verdict } from './reader-photos'
import { runEngine } from './run'
import { cardGaps } from './card-fill'
import { depthReport, popularityOrder, thinSpecies, type DepthReport } from './depth'
import { SOURCES } from './sources'
import { loadState, setSourceBlock, sourceBlockedSince } from './state'
import { collect } from './facebook/collect'
import { chromeFb } from './facebook/chrome'
import { FB } from './facebook/config'
import { FB_FISH_SCHEMA, FB_SPECIES_SCHEMA, identifyPhotos, type FbVerdict } from './facebook/identify'
import { approveSummaries, draftSummaries, reviewDoc } from './summaries'
import { backfillThumbs } from './thumbs'
import { hashPictures } from './picture-hashes'
import { extractTraits } from './traits'
import { topicCheck } from './topic-check'
import { COVER_SCHEMA, videoCovers } from './video-covers'
import { videoImages } from './video-images'
import { searchCommons } from './photos'
import { REWRITE_KINDS, rewriteExisting } from './vi-backfill'
import { VI_WRITE } from './vi-rewrite'
import { addOwnerPicks, discoverPlaylists, discoverSingles, QUERIES_BY_LANG } from './video-discovery'
import { galleries, VET_SCHEMA as GALLERY_VET, type GalleryDeps, type Vet } from './gallery'
import { englishName, unsplashPhotos } from './unsplash'
import { breedPhotos, localizeBreed, makeBreed } from './breeds'
import { localizeCaptions } from './captions'
import { localizeEquipment } from './equipment-intl'
import { addWikidataNames } from './wikidata'
import { addPlantSynonyms } from './plant-synonyms'
import { localizeTopic, makeTopic } from './topics'
import { CLASSIFICATION_THREAD, FORUM_SECTIONS, readForum } from './forum'
import { backfillVideoItems } from './video-items'
import { throttled, VIDEO_GAP_MS, videoGuides, ytApi, ytDlp, ytFinder, ytStoryboard } from './youtube'
import { isMarketplace } from './marketplaces'
import { checkPagePhotos, PHOTO_CHECK_SCHEMA } from './photo-check'
import { screenWatermarks, visionText, WATERMARK_SCHEMA } from './watermarks'
import { ArchiveFetcher } from './archive'
import { localizeGlossary, localizePlaces, localizeSpecies, speciesOrder, TARGETS, type TargetLang } from './localize'
import { addShopNames, makeShopList, popularFirst, type ShopLang } from './shops'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const UA = 'aquatome-engine/0.1 (https://aquatome.com)'
const http = async (url: string) => {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url).host}`)
  return r.json()
}

/** Media bucket credentials: env, else the owner's ~/.config/thuysinh files (never printed). */
const conf = (env: string, file: string) => process.env[env] ?? readFileSync(join(homedir(), '.config/thuysinh', file), 'utf8').trim()
// YouTube Data API key: env, else ~/.config/thuysinh/youtube-api-key; also what findVideos reads (species page videos).
process.env.YOUTUBE_API_KEY ??= (() => { try { return readFileSync(join(homedir(), '.config/thuysinh/youtube-api-key'), 'utf8').trim() || undefined } catch { return undefined } })()
/** Video metadata through the API when there is a key (yt-dlp then only fetches captions), else all through yt-dlp. */
const youtube = () => (process.env.YOUTUBE_API_KEY ? ytApi(process.env.YOUTUBE_API_KEY) : ytDlp)
const media = () => r2Media({
  accountId: conf('CF_ACCOUNT_ID', 'cf-account'), token: conf('CLOUDFLARE_API_TOKEN', 'cf-token'),
  bucket: process.env.MEDIA_BUCKET ?? 'thuysinh-media', publicBase: process.env.MEDIA_BASE ?? 'https://media.aquatome.com',
})

const { positionals, values } = parseArgs({ allowPositionals: true, options: { sources: { type: 'string' }, except: { type: 'string' }, limit: { type: 'string' }, 'max-minutes': { type: 'string' }, only: { type: 'string' }, 'retry-blocked': { type: 'boolean' }, force: { type: 'boolean' }, top: { type: 'string' }, playlist: { type: 'string' }, redo: { type: 'boolean' }, channels: { type: 'string' }, lang: { type: 'string' }, category: { type: 'string' }, type: { type: 'string' }, kind: { type: 'string' }, 'based-on': { type: 'string' }, match: { type: 'string' }, 'dry-run': { type: 'boolean' }, backfill: { type: 'boolean' }, seed: { type: 'string' }, parallel: { type: 'string' }, jobs: { type: 'string' }, sheets: { type: 'string' }, shard: { type: 'string' }, pages: { type: 'string' }, fix: { type: 'boolean' }, rewrites: { type: 'string' } } })

/**
 * Openverse's API (anonymous: 20 requests a minute, 200 a day). A registered Openverse app raises that: its client id and
 * secret in OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET (or ~/.config/thuysinh/openverse-client-id, -secret).
 */
async function openverseApi() {
  const opt = (env: string, file: string) => { try { return conf(env, file) } catch { return '' } }
  const id = opt('OPENVERSE_CLIENT_ID', 'openverse-client-id')
  const secret = opt('OPENVERSE_CLIENT_SECRET', 'openverse-client-secret')
  let auth: Record<string, string> = {}
  if (id && secret) {
    const res = await fetch('https://api.openverse.org/v1/auth_tokens/token/', { method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }), signal: AbortSignal.timeout(30_000) })
    if (res.ok) auth = { authorization: `Bearer ${((await res.json()) as { access_token: string }).access_token}` }
    else console.log(`openverse: token refused (HTTP ${res.status}), anonymous`)
  }
  return async (url: string) => {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...auth }, signal: AbortSignal.timeout(60_000) }) // a new query takes it 20 s or more
    if (!res.ok) throw new Error(`Openverse HTTP ${res.status}`)
    const left = [...res.headers].filter(([k]) => /^x-ratelimit-available-.*sustained$/.test(k)).map(([, v]) => Number(v))
    return { json: await res.json(), remaining: left.length ? Math.min(...left) : Infinity }
  }
}

/** Photo fetching and screening for galleries and breed pages. */
const galleryDeps = (): GalleryDeps => ({
  http, sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date(), faces: visionFaces,
  get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
  look: (file, prompt) => claudeVision<Vet>({ system: 'You pick photos for a fish or plant photo gallery. Reply only with JSON.', prompt, schema: GALLERY_VET, file }),
})
const cmd = positionals[0]

/** Thin species pages (depth.ts): how many, by the sources they're made from, and the most popular ones. */
function printDepth(d: DepthReport) {
  console.log(`depth: ${d.thin} of ${d.pages} species pages are thin (out of search until an in-depth source or the depth bar)`)
  console.table(d.bySource)
  console.table(d.top)
}

/** Vietnamese label on each video guide's thumbnail. Opus with the creator-style prompt won scripts/eval-covers.ts (32–16). */
async function covers(o: { redo?: boolean; limit?: number }) {
  const cv = await videoCovers(join(ROOT, 'content'), {
    get: async u => { const res = await fetch(u); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    look: (file, prompt) => claudeVision<{ candidates: string[]; cover: string }>({ system: 'You write short Vietnamese labels for video thumbnails. Reply only with JSON.', prompt, schema: COVER_SCHEMA, file, model: process.env.COVER_MODEL ?? 'opus' }),
  }, o)
  console.log(`covers: ${cv.done.length} done, ${cv.failed.length} failed`)
  for (const d of cv.done) console.log(`cover: ${d}`)
  for (const f of cv.failed) console.log(`cover failed: ${f}`)
}

if (cmd === 'run' || cmd === 'card-fill') {
  const list = (v?: string) => v?.split(',').map(s => s.trim()) as SourceId[] | undefined
  const except = list(values.except)
  const bad = [...list(values.sources) ?? [], ...except ?? []].filter(s => !(SOURCE_IDS as readonly string[]).includes(s))
  if (bad.length) throw new Error(`unknown source(s): ${bad.join(', ')}`)
  // --except: every source but these (the engine's Seriously Fish job runs that backlog on its own).
  // card-fill: the sources whose species profiles are found by the name in their address (Seriously Fish, Loaches Online, ScotCat).
  const sources = list(values.sources) ?? (except && SOURCES.map(s => s.id).filter(s => !except.includes(s))) ?? (cmd === 'card-fill' ? SOURCES.filter(s => s.profiles).map(s => s.id) : undefined)
  if (values.force && !values.only) throw new Error('--force re-translates only the pages matched by --only')
  const profileDir = process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/thuysinh/chrome-profile')
  const fetcher = new ChromeFetcher({ profileDir })
  const startedAt = new Date().toISOString()
  const order = cmd === 'card-fill' ? popularityOrder(await popularFirst(ROOT)) : []
  const before = cmd === 'card-fill' ? await cardGaps(join(ROOT, 'content'), order) : []
  await fetcher.open()
  try {
    const report = await runEngine(
      { fetcher, archive: new ArchiveFetcher({ fetch, now: () => new Date(), sleep: ms => new Promise(r => setTimeout(r, ms)), ua: UA }), llm: claudeCli, http, media: media(), root: ROOT, now: () => new Date(), sleep: ms => new Promise(r => setTimeout(r, ms)) },
      // card-fill: CARD_FILL_LIMIT (engine-cycle.sh) pages a source, 10 by default.
      { sources, limit: values.limit ? Number(values.limit) : cmd === 'card-fill' ? 10 : undefined, maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : undefined, only: values.only ? new RegExp(values.only) : undefined, retryBlocked: values['retry-blocked'], force: values.force, cardFill: cmd === 'card-fill' },
    )
    // card-fill reports what each page read gained; last-run.json stays the cycle's main run's report.
    if (cmd === 'run') {
      await mkdir(join(ROOT, 'engine-state'), { recursive: true })
      await writeFile(join(ROOT, 'engine-state/last-run.json'), `${JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), ...report }, null, 2)}\n`)
    }
    console.table(report.perSource)
    if (report.needsHuman.length) console.log(`needs-human: ${report.needsHuman.join(', ')} — pass the browser check in the engine Chrome profile, then: pnpm engine run --sources <id> --retry-blocked`)
    for (const e of report.errors) console.log(`error: ${e}`)
    console.log(`changed: ${report.changed.length}`)
    if (cmd === 'card-fill') {
      const after = new Map((await cardGaps(join(ROOT, 'content'), order)).map(g => [g.id, g.missing]))
      for (const g of before.filter(g => report.changed.some(c => c.kind === 'species' && c.id === g.id))) {
        const left = after.get(g.id) ?? []
        console.log(`card-fill: ${g.id}: ${g.missing.filter(f => !left.includes(f)).join(', ') || 'no figure'} added${left.length ? `; still missing ${left.join(', ')}` : ''}`)
      }
      console.log(`card-fill: ${before.length} pages lacked a figure, ${after.size} now`)
    }
    if (report.depth) printDepth(report.depth)
    // A rejected Claude credential stops every page: fail the cycle so the scheduler (GitHub Actions) reports it.
    if (report.errors.some(e => /Failed to authenticate|Invalid bearer token/i.test(e))) { console.log('error: Claude rejected the credential — replace CLAUDE_CODE_OAUTH_TOKEN'); process.exitCode = 1 }
  } finally {
    await fetcher.close()
  }
} else if (cmd === 'moderate') {
  const base = process.env.SITE_URL ?? 'https://aquatome.com'
  const r = await moderate(httpAdmin(base, conf('AB_DASH_TOKEN', 'ab-dash-token')), claudeCli)
  console.log(r.off ? 'comments are off (no D1 yet) — nothing to moderate' : `moderated: ${r.queued} queued, ${r.applied} applied, ${r.ignored} ignored, ${r.failedBatches} failed batches`)
  if (!r.off && r.failedBatches) process.exitCode = 1
  // Reader photos in the same nightly run: faces (macOS Vision), then Claude looks at each photo.
  const c = await loadAll({ root: join(ROOT, 'content'), lang: 'vi', publicBuild: true })
  const species = new Map(c.species.map(s => [s.id, { name: s.t.name, scientificName: s.scientificName }]))
  const p = await moderatePhotos(httpPhotoAdmin(base, conf('AB_DASH_TOKEN', 'ab-dash-token')), {
    faces: visionFaces,
    judge: (file, prompt) => claudeVision<Verdict>({ system: 'You are a careful photo moderator for an aquarium site. Reply only with JSON.', prompt, schema: VERDICT_SCHEMA, file }),
    species: id => species.get(id),
  })
  console.log(p.off ? 'reader photos are off — nothing to screen' : `photos: ${p.queued} queued, ${p.approved} approved, ${p.removed} removed, ${p.failed} left pending`)
  if (!p.off && p.failed) process.exitCode = 1
} else if (cmd === 'summaries') {
  // pnpm engine summaries [--top N] [--jobs N] [--only id,id] → drafted and checked: passing ones approved, the rest pending in
  // docs/review/summaries.md with their problems; pnpm engine summaries approve <id,id|all> approves by hand.
  const contentRoot = join(ROOT, 'content')
  if (positionals[1] === 'approve') {
    const arg = positionals[2] ?? ''
    const done = await approveSummaries(contentRoot, arg === 'all' ? 'all' : arg.split(',').filter(Boolean))
    console.log(`approved: ${done.length}${done.length ? ` (${done.join(', ')})` : ''}`)
  } else {
    const r = await draftSummaries(contentRoot, claudeCli, { top: Number(values.top ?? 30), jobs: Number(values.jobs ?? 1), only: values.only?.split(',').map(x => x.trim()).filter(Boolean), now: () => new Date() })
    console.log(`summaries: ${r.approved.length} approved, ${r.pending.length} left pending, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}`)
    for (const p of r.pending) console.log(`pending: ${p.id}: ${p.problems.join(' | ')}`)
    if (r.failed.length) console.log(`failed: ${r.failed.join(', ')}`)
  }
  await mkdir(join(ROOT, 'docs/review'), { recursive: true })
  await writeFile(join(ROOT, 'docs/review/summaries.md'), await reviewDoc(contentRoot))
} else if (cmd === 'thumbs') {
  // One-off backfill of 480px card thumbs for photos stored before thumbs existed (new uploads make their own).
  const m = media()
  const r = await backfillThumbs(join(ROOT, 'content'), {
    exists: async u => (await fetch(u, { method: 'HEAD' })).ok,
    get: async u => { const res = await fetch(u); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    putThumb: m.putThumb,
  })
  console.log(`thumbs: ${r.checked} photos, ${r.made} made, ${r.failed.length} failed`)
  for (const f of r.failed) console.log(`failed: ${f}`)
  if (r.failed.length) process.exitCode = 1
} else if (cmd === 'picture-hashes') {
  // The image hash of every picture in content, so no page shows the same picture twice from two files.
  const r = await hashPictures(ROOT, {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
  }, { limit: values.limit ? Number(values.limit) : undefined, jobs: values.jobs ? Number(values.jobs) : undefined })
  console.log(`picture-hashes: ${r.pictures} pictures, ${r.hashed} hashed, ${r.left} left for later, ${r.dropped} gone, ${r.failed.length} failed`)
  for (const f of r.failed.slice(0, 30)) console.log(`failed: ${f}`)
} else if (cmd === 'faces') {
  // Drop photos showing people (macOS Vision face detection); each photo is checked once, cached in engine-state.
  const r = await dropFacePhotos(join(ROOT, 'content'), join(ROOT, 'engine-state/_photo-faces.json'), {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    detect: visionFaces,
  }, join(ROOT, 'engine-state/_photo-rejected.json'))
  console.log(`faces: ${r.checked} checked, ${r.removed.length} removed, ${r.failed.length} failed`)
  for (const x of r.removed) console.log(`removed: ${x}`)
  for (const f of r.failed) console.log(`failed: ${f}`)
} else if (cmd === 'check-photos') {
  // Each species, plant and breed page's photos and gallery, and guide photos captioned with a fish, judged against their subject
  // (vision, cached per photo and page), most-read pages first: another fish or no photo of it removed, can't-tell listed.
  const r = await checkPagePhotos(ROOT, {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    look: (file, prompt) => claudeVision({ system: 'You identify aquarium fish and plants in photos. Reply only with JSON.', prompt, schema: PHOTO_CHECK_SCHEMA, file, model: process.env.PHOTO_CHECK_MODEL ?? 'opus' }),
  }, { limit: values.limit ? Number(values.limit) : 40, parallel: values.parallel ? Number(values.parallel) : 1, ...(values.only ? { only: values.only } : {}) })
  console.log(`check-photos: ${r.sheets} sheets, ${r.judged} photos judged (${r.photos} verdicts in all), ${r.removed.length} removed, ${r.rejected} newly rejected, ${r.unsure} can't tell, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.removed) console.log(`removed: ${x}`)
  for (const x of r.failed.slice(0, 30)) console.log(`failed: ${x}`)
} else if (cmd === 'watermarks') {
  // No watermarked photos: each photo read once by macOS Vision, text (and logo sources) judged by the model, marked ones dropped everywhere.
  const parallel = values.parallel ? Number(values.parallel) : 1
  const r = await screenWatermarks(ROOT, join(ROOT, 'engine-state/_photo-watermarks.json'), join(ROOT, 'engine-state/_photo-rejected.json'), {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    read: files => visionText(files, parallel),
    look: (file, prompt) => claudeVision({ system: 'You spot watermarks on photos. Reply only with JSON.', prompt, schema: WATERMARK_SCHEMA, file, model: process.env.WATERMARK_MODEL ?? 'opus' }),
  }, { limit: values.limit ? Number(values.limit) : 20, parallel })
  console.log(`watermarks: ${r.read} read, ${r.hits} to judge, ${r.judged} judged, ${r.confirmed.length} watermarked, ${r.removed.length} removed, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.removed) console.log(`removed: ${x}`)
  for (const x of r.kept) console.log(`kept (a required hero with nothing to replace it): ${x}`)
  for (const x of r.failed.slice(0, 30)) console.log(`failed: ${x}`)
} else if (cmd === 'photos') {
  // Pages with fewer than 3 photos: re-read their source pages for photos the picker used to miss (monthly per page).
  const fetcher = new ChromeFetcher({ profileDir: process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/thuysinh/chrome-profile') })
  await fetcher.open()
  try {
    const r = await backfillPhotos(ROOT, { get: u => fetcher.get(u), bytes: (u, ref) => fetcher.bytes(u, ref), media: media(), now: () => new Date(), sleep: ms => new Promise(res => setTimeout(res, ms)) }, { limit: values.limit ? Number(values.limit) : undefined, kinds: values.kind?.split(',') })
    console.log(`photos: ${r.pages} pages re-read, ${r.added} photos added, ${r.errors.length} errors`)
    for (const e of r.errors) console.log(`error: ${e}`)
  } finally {
    await fetcher.close()
  }
} else if (cmd === 'mirror-photos') {
  // Commons and iNaturalist photos served from our bucket (their hosts set third-party cookies; WebP, long cache). --limit N uploads; --dry-run counts.
  const bytes = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const r = await mirrorPhotos(ROOT, { bytes, media: media(), sleep: ms => new Promise(res => setTimeout(res, ms)) }, { limit: values.limit ? Number(values.limit) : undefined, dryRun: values['dry-run'] })
  console.log(`mirror-photos: ${r.mirrored} stored, ${r.files} files updated, ${r.pending} photos waiting, ${r.failed.length} failed`)
  for (const f of r.failed.slice(0, 20)) console.log(`failed: ${f}`)
} else if (cmd === 'fishbase-photos') {
  // Nonn Panitvong's FishBase and iNaturalist photos (used with permission) on the pages of the species they show.
  // fishbase.se takes ~20 s to accept a connection, past fetch's 10 s connect timeout; node:https leaves that to the OS.
  const load = (u: string, headers: Record<string, string>) => new Promise<Buffer>((ok, fail) => httpsGet(u, { headers: { 'user-agent': UA, ...headers } }, res => {
    if (res.statusCode !== 200) { res.resume(); fail(new Error(`HTTP ${res.statusCode}`)); return }
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c)).on('end', () => ok(Buffer.concat(chunks))).on('error', fail)
  }).on('error', fail))
  const r = await fishbasePhotos(ROOT, { get: async u => (await load(u, {})).toString('utf8'), bytes: async (u, referer) => new Uint8Array(await load(u, { referer })), media: media(), sleep: ms => new Promise(res => setTimeout(res, ms)) })
  console.log(`fishbase-photos: ${r.listed} listed, ${r.added.length} added, ${r.failed.length} failed\n${[...r.added, ...r.failed].join('\n')}`)
  // His iNaturalist photos too, on pages with fewer than 4 photos.
  const get = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text() }
  const bytes = async (u: string, referer: string) => { const res = await fetch(u, { headers: { 'user-agent': UA, referer } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const i = await inatPhotos(ROOT, { get, bytes, media: media(), sleep: ms => new Promise(res => setTimeout(res, ms)) })
  console.log(`inaturalist: ${i.added.length} added, ${i.failed.length} failed\n${[...i.added, ...i.failed].join('\n')}`)
} else if (cmd === 'crypts-photos') {
  // Jan D. Bastmeijer's own photos (used with permission) on the Cryptocoryne pages.
  const get = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text() }
  const bytes = async (u: string, referer: string) => { const res = await fetch(u, { headers: { 'user-agent': UA, referer } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const r = await cryptsPhotos(ROOT, { get, bytes, media: media(), sleep: ms => new Promise(res => setTimeout(res, ms)) })
  console.log(`crypts-photos: ${r.added.length} pages added to, ${r.skipped.length} skipped, ${r.failed.length} failed\n${[...r.added, ...r.skipped, ...r.failed].join('\n')}`)
} else if (cmd === 'own-photos') {
  // Photos people gave the owner for the site, from a JSON list [{ file, page: "plants/<id>", crop? }]: pnpm engine own-photos <list.json>
  const list = positionals[1]
  if (!list) throw new Error('usage: pnpm engine own-photos <list.json>')
  const added = await ownPhotos(ROOT, resolve(process.env.INIT_CWD ?? process.cwd(), list), media())
  console.log(`own-photos: ${added.length} added\n${added.join('\n')}`)
} else if (cmd === 'metric') {
  // Fish, plant, breed and guide pages in metric only (°C, cm, litres), every language: what a writer left in °F, inches or gallons.
  const changed = await metricPages(join(ROOT, 'content'), ROOT)
  console.log(`metric: ${changed.length} pages${changed.length ? `: ${changed.slice(0, 20).join(', ')}${changed.length > 20 ? ', …' : ''}` : ''}`)
} else if (cmd === 'audit') {
  // Pictures per page → docs/review/content-audit.md; every published page against the content rules, in each language →
  // docs/review/content-rules.md (reports only; nothing is hidden). --fix: first the rules' safe fixes on the stored text,
  // as the engine makes them when it writes a page (after a fix is added to sanitize.ts tidyHtml).
  if (values.fix) for (const f of await fixStored(join(ROOT, 'content'))) console.log(`fixed: ${f}`)
  const { rows, markdown } = await auditPictures(join(ROOT, 'content'), join(ROOT, 'engine-state/_wanted.json'))
  await mkdir(join(ROOT, 'docs/review'), { recursive: true })
  await writeFile(join(ROOT, 'docs/review/content-audit.md'), markdown)
  console.log(`audit: ${rows.length} pages, ${rows.filter(r => !r.photos).length} without a photo, ${rows.filter(r => r.missingThumbs).length} missing thumbs, ${rows.filter(r => r.photos === 1).length} with one photo`)
  // A rule that fails leaves the pictures report written; one that throws on a page is listed in the report.
  const pages = await loadPages(join(ROOT, 'content'))
  const checked = checkPages(pages)
  await writeFile(join(ROOT, 'docs/review/content-rules.md'), rulesReport(pages, checked))
  const by = new Map<string, Set<string>>()
  for (const f of checked.findings) by.set(f.rule, (by.get(f.rule) ?? new Set()).add(f.page.path))
  console.log(`rules: ${pages.length} pages, ${[...by].map(([r, ps]) => `${r} ${ps.size}`).join(', ') || 'nothing found'}${checked.errors.length ? `, ${checked.errors.length} rule errors` : ''}`)
} else if (cmd === 'reader') {
  // A reader's eye on a few pages a cycle (reader.ts): the model reads each as a reader would, against a rubric; Vietnamese
  // wording it flags is rewritten, reviewer-gated, the rest goes to docs/review/reader.md. READER_MODEL: the reading model (default opus).
  // pnpm engine reader [--limit N] [--rewrites N] [--only vi/guides/<id>,id/species/<id>: these, read or not]
  const pages = await loadPages(join(ROOT, 'content'))
  // Opus by default: on the same pages Sonnet reported findings it then called fine, and took a local name for a mistake.
  const deps = { llm: claudeCli, now: () => new Date(), model: process.env.READER_MODEL ?? 'opus' }
  const { report: r, state } = await readPages(ROOT, pages, deps, { limit: Number(values.limit ?? 20), rewrites: Number(values.rewrites ?? 3), ...(values.only ? { only: values.only.split(',') } : {}) })
  await mkdir(join(ROOT, 'docs/review'), { recursive: true })
  await writeFile(join(ROOT, 'docs/review/reader.md'), readerReport(r.rewritten.length ? await loadPages(join(ROOT, 'content')) : pages, state))
  console.log(`reader: ${r.read.length} pages read, ${r.findings} findings, ${r.rewritten.length} parts rewritten, ${r.notKept.length} not kept, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.read.map(x => `read: ${x}`), ...r.rewritten.map(x => `rewritten: ${x}`), ...r.notKept.map(x => `not kept: ${x}`), ...r.failed.map(x => `failed: ${x}`)]) console.log(x)
} else if (cmd === 'traits') {
  // Temperament / fin-nipping / school size from each page's text, for the tank-mates checker (new or changed pages only).
  const r = await extractTraits(join(ROOT, 'content'), claudeCli, { limit: Number(values.limit ?? 100), now: () => new Date() })
  console.log(`traits: ${r.done.length} done, ${r.failed.length} failed${r.failed.length ? ` (${r.failed.join(', ')})` : ''}`)
} else if (cmd === 'topic-check') {
  // Guides keep to their title's subject: sections about something else (a video drifting off topic) are dropped.
  const r = await topicCheck(ROOT, claudeCli, { limit: Number(values.limit ?? 40), ...(values.only ? { only: values.only.split(',') } : {}) })
  for (const t of r.trimmed) console.log(`  ${t.id}: dropped ${t.dropped.join('; ')}`)
  for (const h of r.held) console.log(`  held for a person: ${h}`)
  console.log(`topic-check: ${r.checked.length} checked, ${r.trimmed.length} trimmed, ${r.held.length} held, ${r.failed.length} failed`)
} else if (cmd === 'videos') {
  // Original Vietnamese guides from educational YouTube playlists (engine-state/youtube-playlists.json, or --playlist ID,ID).
  const r = await videoGuides(
    { yt: youtube(), llm: claudeCli, root: ROOT, now: () => new Date(), sleep: ms => new Promise(res => setTimeout(res, ms)) },
    {
      playlists: values.playlist?.split(',').map(s => s.trim()).filter(Boolean), limit: values.limit ? Number(values.limit) : undefined, maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : undefined,
      // Writing eval (scripts/eval-writing.ts, 2026-10-29): the Vietnamese style guide, written by Opus, read most natural (18–0).
      write: { style: true, model: process.env.VIDEO_MODEL ?? 'opus' }, redo: values.redo, only: values.only?.split(',').map(s => s.trim()).filter(Boolean),
    },
  )
  console.log(`videos: ${r.written.length} written, ${r.skipped.length} skipped, ${r.errors.length} errors${r.stoppedEarly ? ' (stopped early)' : ''}`)
  for (const w of r.written) console.log(`written: ${w}`)
  for (const s of r.skipped) console.log(`skipped: ${s}`)
  for (const e of r.errors) console.log(`error: ${e}`)
  await covers({})
  // Pictures per section: video stills (storyboard frames) + an open-licence Commons photo, picked by Claude, no faces.
  const get = async (u: string) => { const res = await fetch(u); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const im = await videoImages(join(ROOT, 'content'), {
    llm: claudeCli, faces: visionFaces, storyboard: ytStoryboard, transcript: async (id, lang) => (await ytDlp.transcript(id, lang)) ?? (await ytDlp.transcribe!(id, lang)), commons: q => searchCommons(q, http, 6), get, media: media(),
    look: (file, prompt, schema) => claudeVision({ system: 'You pick pictures for an aquarium guide. Reply only with JSON.', prompt, schema, file }),
  }, { limit: Number(process.env.VIDEO_IMAGES_LIMIT ?? 40) })
  console.log(`images: ${im.done.length} guides, ${im.failed.length} failed`)
  for (const x of im.done) console.log(`images: ${x}`)
  for (const f of im.failed) console.log(`images failed: ${f}`)
} else if (cmd === 'product') {
  // A product page from web research (facts only, prices checked on the shop's page): pnpm engine product <brand> <model> --category loc [--type treo]
  // --redo: rewrite the page from the research already kept (engine-state/products), no new searching.
  const [brand, model] = positionals.slice(1)
  const kit = (await readKit(join(ROOT, 'content'))).find(k => k.category === values.category)
  if (!brand || !model || !kit) throw new Error('usage: pnpm engine product <brand> <model> --category <equipment id> [--type <type id>]')
  const type = kit.types.find(t => t.id === values.type)
  // Redirects are followed one hop at a time, never to a marketplace.
  const get = async (u: string) => {
    for (let hop = 0, url = u; hop < 4; hop++) {
      if (isMarketplace(url)) throw new Error(`marketplace: ${url}`)
      const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; AquaTome/1.0; +https://aquatome.com)' }, signal: AbortSignal.timeout(20_000) })
      const next = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && next) { url = new URL(next, url).href; continue }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    }
    throw new Error('too many redirects')
  }
  const r = await makeProduct(join(ROOT, 'content'), { research: claudeResearch, llm: claudeCli, get, now: () => new Date() }, { brand, model, category: kit.category, ...(type ? { type: type.id } : {}), kind: type?.name ?? kit.name }, { researchModel: process.env.RESEARCH_MODEL ?? 'opus', factsDir: join(ROOT, 'engine-state/products'), reuse: values.redo })
  console.log(JSON.stringify(r, null, 1))
} else if (cmd === 'video-items') {
  // Species and kit in video guides written before extraction: pnpm engine video-items [--limit N] (one transcript fetch each).
  const r = await backfillVideoItems(join(ROOT, 'content'), {
    llm: claudeCli, transcript: async (id, lang, own) => (own ? ytDlp.transcribe!(id, lang) : ytDlp.transcript(id, lang)),
    stop: e => e instanceof LlmError || throttled(e), sleep: ms => new Promise(res => setTimeout(res, ms)), gapMs: VIDEO_GAP_MS,
  }, { limit: values.limit ? Number(values.limit) : 20 })
  console.log(`video-items: ${r.done.length} done, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.done, ...r.failed]) console.log(x)
} else if (cmd === 'gallery') {
  // Galleries topped up to their tier's target, most popular first (iNaturalist, Commons, GBIF, Openverse; open licences,
  // screened): pnpm engine gallery [--sheets N (model calls, default 40)] [--only <species or plant id>] [--shard i/n (n runs at once)]
  const env = (k: string) => (process.env[k] ? Number(process.env[k]) : undefined)
  const budget = Object.fromEntries((['inat', 'gbif', 'openverse'] as const).flatMap(k => (env(`GALLERY_${k.toUpperCase()}`) === undefined ? [] : [[k, env(`GALLERY_${k.toUpperCase()}`)!]])))
  const r = await galleries(ROOT, { ...galleryDeps(), openverse: await openverseApi() }, { sheets: values.sheets ? Number(values.sheets) : 40, ...(values.only ? { only: values.only } : {}), ...(values.shard ? { shard: values.shard.split('/').map(Number) as [number, number] } : {}), budget })
  console.log(`gallery: ${r.done.length} pages, ${r.sheets} sheets, added ${JSON.stringify(r.added)}, ${r.short.length} short of target, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.done, ...r.failed]) console.log(x)
} else if (cmd === 'breed-photos') {
  // Photos for breed pages that have none (a word search on Commons): pnpm engine breed-photos [--limit N]
  const r = await breedPhotos(ROOT, galleryDeps(), { limit: values.limit ? Number(values.limit) : 10 })
  console.log(`breed-photos: ${r.done.length} breeds, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.done, ...r.failed]) console.log(x)
} else if (cmd === 'unsplash') {
  // Unsplash photos for the galleries of the staples, breeds and popular species: pnpm engine unsplash [--limit N]
  const key = process.env.UNSPLASH_ACCESS_KEY || (() => { try { return readFileSync(join(homedir(), '.config/thuysinh/unsplash-key'), 'utf8').trim() } catch { return '' } })()
  if (!key) { console.log('unsplash: no UNSPLASH_ACCESS_KEY, skipped'); process.exit(0) }
  const r = await unsplashPhotos(ROOT, async url => {
    const res = await fetch(url, { headers: { authorization: `Client-ID ${key}`, 'accept-version': 'v1' } })
    if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`)
    return { json: await res.json(), remaining: Number(res.headers.get('x-ratelimit-remaining') ?? Infinity) }
  }, galleryDeps(), { limit: values.limit ? Number(values.limit) : 6 })
  console.log(`unsplash: ${r.done.length} galleries, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.done, ...r.failed]) console.log(x)
} else if (cmd === 'facebook') {
  // Jim Cumming's Facebook, through the spare account logged into the engine's Chrome profile: new posts and albums, their
  // full-size originals (media bucket, facebook/), then species photos for galleries (high confidence only).
  // pnpm engine facebook [--limit <model calls, 60>] [--max-minutes M] [--retry-blocked] [--backfill]
  // --backfill (by hand, first time and until it reports no warnings): scroll the whole timeline and every album, bigger budgets.
  const blockedAt = await sourceBlockedSince(ROOT, FB.id)
  if (values['retry-blocked']) await setSourceBlock(ROOT, FB.id, undefined)
  if (blockedAt && !values['retry-blocked']) {
    console.log(`facebook: blocked since ${blockedAt}: log into the spare account in ~/.cache/thuysinh/chrome-profile, then run pnpm engine facebook --retry-blocked`)
  } else {
    const fetcher = new ChromeFetcher({ profileDir: process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/thuysinh/chrome-profile') })
    await fetcher.open()
    try {
      const m = media()
      const r = await collect(ROOT, chromeFb(fetcher), { putRaw: m.putRaw, sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date() }, { maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : values.backfill ? 600 : 45, maxPhotos: values.backfill ? 3000 : 150, maxScrolls: values.backfill ? 2000 : 30, backfill: values.backfill })
      console.log(`facebook: ${r.newPosts} new posts, ${r.newAlbums} new albums, ${r.stored} photos stored, ${r.failed.length} failed`)
      for (const f of r.failed) console.log(`failed: ${f}`)
      for (const w of r.warnings) console.log(`warning: ${w}`)
      if (r.blocked) console.log(`facebook: ${r.blocked} wall — log into the spare account in ~/.cache/thuysinh/chrome-profile, then run pnpm engine facebook --retry-blocked`)
    } finally {
      await fetcher.close()
    }
  }
  const get = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const id = await identifyPhotos(ROOT, {
    get, faces: visionFaces, media: media(), now: () => new Date(),
    sheet: (file, prompt) => claudeVision<{ fish: number[] }>({ system: 'You sort photos for a fish photo gallery. Reply only with JSON.', prompt, schema: FB_FISH_SCHEMA, file }),
    look: (file, prompt) => claudeVision<FbVerdict>({ system: 'You identify aquarium fish in photos. Reply only with JSON.', prompt, schema: FB_SPECIES_SCHEMA, file, model: process.env.FB_ID_MODEL ?? 'opus' }),
  }, { limit: values.limit ? Number(values.limit) : 60 })
  console.log(`facebook photos: ${id.added.length} added to galleries, ${id.dropped} dropped${id.stopped ? ` (stopped: ${id.stopped})` : ''}`)
  for (const a of id.added) console.log(`added: ${a}`)
} else if (cmd === 'breed') {
  // A page for a man-made fish (hybrid, line, colour form), from web research: pnpm engine breed "<English name>" [--kind hybrid|variety|transgenic] [--based-on <species id>] [--redo]
  // --redo: rewrite the page from the research already kept (engine-state/breeds), no new searching.
  const name = positionals.slice(1).join(' ').trim()
  const kind = values.kind as 'hybrid' | 'variety' | 'transgenic' | undefined
  if (!name || (kind && !['hybrid', 'variety', 'transgenic'].includes(kind))) throw new Error('usage: pnpm engine breed "<English name>" [--kind hybrid|variety|transgenic] [--based-on <species id>] [--redo]')
  const r = await makeBreed(ROOT, { research: claudeResearch, llm: claudeCli, gallery: galleryDeps() }, { name, ...(kind ? { kind } : {}), ...(values['based-on'] ? { basedOn: values['based-on'] } : {}) }, { researchModel: process.env.RESEARCH_MODEL ?? 'opus', reuse: values.redo })
  console.log(JSON.stringify(r, null, 1))
} else if (cmd === 'forum') {
  // Diễn Đàn Cá Cảnh's guide sections, read for orientation: notes on each thread (translated or original, the original it
  // names, Vietnamese terms), never its text. pnpm engine forum [--limit threads] [--pages list pages] [--match section regex]
  const get = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text() }
  const sections = values.match ? FORUM_SECTIONS.filter(s => new RegExp(values.match!, 'i').test(s)) : undefined
  const r = await readForum(ROOT, { get, llm: claudeCli, sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date() }, { limit: Number(values.limit ?? 10), pages: Number(values.pages ?? 5), sections, extra: [CLASSIFICATION_THREAD] })
  console.log(`forum: ${r.listed} list pages read, ${r.found} threads found, ${r.read.length} read, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}\n${[...r.read, ...r.failed].join('\n')}`)
} else if (cmd === 'topic') {
  // A guide AquaTome writes itself from web research: pnpm engine topic "<chủ đề tiếng Việt>" --kind disease|care|setup|plantCare|breeding|aquascaping|discovery [--redo]
  // --redo: rewrite the guide from the research already kept (engine-state/topics), no new searching.
  const topic = positionals.slice(1).join(' ').trim()
  const kinds = ['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery'] as const
  const kind = values.kind as (typeof kinds)[number] | undefined
  if (!topic || !kind || !kinds.includes(kind)) throw new Error(`usage: pnpm engine topic "<chủ đề>" --kind ${kinds.join('|')} [--redo]`)
  const r = await makeTopic(ROOT, { research: claudeResearch, llm: claudeCli }, { topic, kind }, { researchModel: process.env.RESEARCH_MODEL ?? 'opus', reuse: values.redo })
  console.log(JSON.stringify(r, null, 1))
} else if (cmd === 'covers') {
  // Vietnamese thumbnail labels: pnpm engine covers [--redo] [--limit N] (--redo rewrites the ones already there).
  await covers({ redo: values.redo, limit: values.limit ? Number(values.limit) : undefined })
} else if (cmd === 'rewrite-vi') {
  // Existing Vietnamese rewritten in the site's style, worst-read kinds first, each page once, reviewer-gated:
  // pnpm engine rewrite-vi [--limit N] [--only guides,species,plants,glossary] [--match <regex>: re-edit pages containing it]
  const kinds = values.only?.split(',').filter((k): k is (typeof REWRITE_KINDS)[number] => (REWRITE_KINDS as readonly string[]).includes(k))
  const r = await rewriteExisting(join(ROOT, 'content'), join(ROOT, 'engine-state/vi-rewrite.json'), { llm: claudeCli, opts: VI_WRITE, now: () => new Date() }, { limit: values.limit ? Number(values.limit) : 10, kinds, ...(values.match ? { match: new RegExp(values.match, 'i') } : {}) })
  console.log(`rewrite-vi: ${r.done.length} rewritten, ${r.kept.length} kept as they were, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.done) console.log(`rewritten: ${x}`)
  for (const x of r.kept) console.log(`kept: ${x}`)
  for (const x of r.failed) console.log(`failed: ${x}`)
} else if (cmd === 'discover-videos') {
  // More teaching playlists: YouTube playlist searches + known channels → overlap filter → model vets → engine-state/youtube-playlists.json.
  // --channels a,b: only those channels (no searches); --lang vi: only that language's searches (no channels; ignores the
  // queue size, which English fills first); --force: even with a full queue.
  const channels = values.channels?.split(',').map(s => s.trim()).filter(Boolean)
  const only = values.lang ? { channels: [], queries: QUERIES_BY_LANG[values.lang] ?? [] } : channels ? { channels, queries: [] } : {}
  const deps = { find: { ...ytFinder, playlist: (id: string) => youtube().playlist(id) }, llm: claudeCli, root: ROOT, now: () => new Date() }
  const r = await discoverPlaylists(deps, { maxNew: values.limit ? Number(values.limit) : undefined, force: values.force || !!values.lang, ...only })
  console.log(r.skipped ? `playlists: skipped (${r.skipped})` : `playlists: ${r.candidates} candidates, ${r.added.length} added, ${r.rejected} rejected, ${r.errors.length} errors`)
  for (const a of r.added) console.log(`added: ${a}`)
  for (const e of r.errors) console.log(`error: ${e}`)
  // Single teaching videos from the channels' upload pages (skipped while the playlist queue is full, unless --force).
  if (!r.skipped) {
    const s = await discoverSingles(deps, { ...only, maxNew: values.limit ? Number(values.limit) : undefined })
    console.log(`single videos: ${s.candidates} candidates, ${s.added.length} added, ${s.rejected} rejected, ${s.errors.length} errors`)
    for (const a of s.added) console.log(`added: ${a}`)
    for (const e of s.errors) console.log(`error: ${e}`)
  }
} else if (cmd === 'youtube-add') {
  // The owner's picks, first in line: pnpm engine youtube-add <playlist or video URL>...
  for (const line of await addOwnerPicks(ROOT, positionals.slice(1), ytFinder, new Date())) console.log(line)
} else if (cmd === 'localize') {
  // Species pages in Indonesian or Thai, translated from their English sources: --only ids; --top N of the most-read;
  // else every species, most-read first, making at most --limit pages (default 10). Pages done and current are skipped.
  // --kind plants: plant pages instead, every plant (there is no reading-rank for plants).
  const lang = values.lang as TargetLang
  const kind = values.kind === 'plants' ? 'plants' : 'species'
  if (!(lang in TARGETS) || (values.kind && values.kind !== kind)) throw new Error('usage: pnpm engine localize --lang id|th [--kind plants] [--only id,id | --top N] [--limit N] [--redo]')
  const all = await readdir(join(ROOT, 'content', kind))
  const ranked = kind === 'plants' ? [...all].sort() : await speciesOrder(ROOT, lang)
  const ids = values.only?.split(',').map(s => s.trim()).filter(Boolean) ?? (values.top ? ranked.slice(0, Number(values.top)) : ranked)
  const limit = values.only || values.top ? undefined : Number(values.limit ?? 10)
  const r = await localizeSpecies(ROOT, claudeCli, lang, ids, { redo: values.redo, model: 'opus', now: () => new Date(), english: sci => englishName(sci, http), limit, kind })
  console.log(`localize ${lang}: ${r.done.length} done, ${r.skipped.length} skipped, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.done, ...r.failed].join('\n')}`)
} else if (cmd === 'localize-breeds') {
  // Breed pages (hybrids, lines) in Indonesian or Thai, written from their saved research (--only ids; --redo).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error('usage: pnpm engine localize-breeds --lang id|th [--only id,id] [--limit N] [--redo]')
  const researched = (await readdir(join(ROOT, 'engine-state/breeds')).catch(() => [] as string[])).map(f => f.replace(/\.json$/, ''))
  const pages = await readdir(join(ROOT, 'content/breeds')).catch(() => [] as string[])
  const ids = values.only?.split(',').map(s => s.trim()).filter(Boolean) ?? researched.filter(id => pages.includes(id)).sort()
  let made = 0
  for (const id of ids) {
    if (made >= Number(values.limit ?? 40)) break
    const r = await localizeBreed(ROOT, claudeCli, id, lang, { redo: values.redo }).catch(e => ({ id, failed: (e as Error).message.slice(0, 200) }))
    if (!('skipped' in r)) made++
    console.log(JSON.stringify(r))
  }
} else if (cmd === 'localize-guides') {
  // AquaTome's own guides in Indonesian or Thai, written from their saved research (--only ids; --redo).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error('usage: pnpm engine localize-guides --lang id|th [--only id,id] [--limit N] [--redo]')
  const researched = (await readdir(join(ROOT, 'engine-state/topics')).catch(() => [] as string[])).map(f => f.replace(/\.json$/, '')).sort()
  const ids = values.only?.split(',').map(s => s.trim()).filter(Boolean) ?? researched
  let made = 0
  for (const id of ids) {
    if (made >= Number(values.limit ?? 20)) break
    const r = await localizeTopic(ROOT, claudeCli, id, lang, { redo: values.redo }).catch(e => ({ id, failed: (e as Error).message.slice(0, 200) }))
    if (!('skipped' in r)) made++
    console.log(JSON.stringify(r))
  }
} else if (cmd === 'localize-glossary') {
  // Glossary terms in Indonesian or Thai, from the Vietnamese entries: every term not yet done (--redo: all of them; --only ids).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error('usage: pnpm engine localize-glossary --lang id|th [--only ids] [--redo]')
  const r = await localizeGlossary(ROOT, claudeCli, lang, { redo: values.redo, model: 'opus', only: values.only?.split(',').map(s => s.trim()).filter(Boolean) })
  console.log(`localize-glossary ${lang}: ${r.done.length} done, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.reviews, ...r.failed].join('\n')}`)
} else if (cmd === 'localize-places') {
  // Place names in Indonesian or Thai (the origin pages): every place not yet named (--redo: all of them).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error('usage: pnpm engine localize-places --lang id|th [--redo]')
  const r = await localizePlaces(ROOT, claudeCli, lang, { redo: values.redo, model: 'opus' })
  console.log(`localize-places ${lang}: ${r.done.length} done, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.reviews, ...r.failed].join('\n')}`)
} else if (cmd === 'localize-captions') {
  // Vietnamese photo captions (galleries, breed photos) in Indonesian or Thai, for the pages that language has.
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error('usage: pnpm engine localize-captions --lang id|th [--limit N]')
  const r = await localizeCaptions(ROOT, claudeCli, lang, { limit: values.limit ? Number(values.limit) : undefined })
  console.log(`localize-captions ${lang}: ${r.done.length} pages done, ${r.left} left, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.done, ...r.failed].join('\n')}`)
} else if (cmd === 'wikidata-names') {
  // The names Wikidata gives each species in Indonesian or Thai, added to its page's other names where no other page uses them.
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error('usage: pnpm engine wikidata-names --lang id|th')
  const added = await addWikidataNames(ROOT, http, lang)
  console.log(`wikidata-names ${lang}: ${added.length} pages\n${added.join('\n')}`)
} else if (cmd === 'plant-synonyms') {
  // Each plant's other scientific names (old genus, GBIF's, a hobby name), which the site links, checks and searches as its own.
  const r = await addPlantSynonyms(ROOT, http)
  console.log(`plant-synonyms: ${r.changed.length} pages${r.failed.length ? `, GBIF failed on ${r.failed.length} (tried again next run)` : ''}\n${r.changed.join('\n')}`)
} else if (cmd === 'shop-list') {
  // What fish (or plant) shops in the language's country sell, from their own lists (web research, never marketplaces):
  // pnpm engine shop-list --lang vi|id|th [--kind plants] [--seed file.json (an array of trade names from one shop's list)]
  const lang = values.lang as ShopLang
  if (!['vi', 'id', 'th'].includes(lang) || (values.kind && values.kind !== 'plants')) throw new Error('usage: pnpm engine shop-list --lang vi|id|th [--kind plants] [--seed file.json]')
  const seed = values.seed ? (JSON.parse(await readFile(values.seed, 'utf8')) as string[]) : undefined
  const r = await makeShopList(ROOT, claudeResearch, lang, { seed, model: process.env.RESEARCH_MODEL ?? 'opus', now: () => new Date(), ...(values.kind === 'plants' ? { goods: 'plants' as const } : {}) })
  const unmapped = r.items.filter(i => !i.scientificName)
  console.log(`shop-list ${lang}: ${r.items.length} items, ${r.items.length - unmapped.length} mapped, ${r.sources.length} sources\nunmapped: ${unmapped.map(i => i.trade).join('; ')}`)
} else if (cmd === 'shop-names') {
  // The names shops use, added to the language's species pages as other names (engine-state/shop-lists/<lang>.json).
  const lang = values.lang as ShopLang
  if (!['vi', 'id', 'th'].includes(lang)) throw new Error('usage: pnpm engine shop-names --lang vi|id|th')
  const added = await addShopNames(ROOT, lang)
  console.log(`shop-names ${lang}: ${added.length} pages\n${added.join('\n')}`)
} else if (cmd === 'localize-equipment') {
  // The equipment buying guides in Indonesian or Thai (--only categories; --redo).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error('usage: pnpm engine localize-equipment --lang id|th [--only cat,cat] [--redo]')
  const r = await localizeEquipment(ROOT, claudeCli, lang, { only: values.only?.split(',').map(s => s.trim()).filter(Boolean), redo: values.redo })
  console.log(`localize-equipment ${lang}: ${r.done.length} done, ${r.skipped.length} skipped, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.done, ...r.failed].join('\n')}`)
} else if (cmd === 'status') {
  const rows: Record<string, Record<string, number>> = {}
  for (const id of SOURCE_IDS) {
    const counts: Record<string, number> = {}
    for (const s of Object.values(await loadState(ROOT, id))) counts[s.status] = (counts[s.status] ?? 0) + 1
    rows[id] = counts
  }
  console.table(rows)
  const t = await thinSpecies(join(ROOT, 'content'), popularityOrder(await popularFirst(ROOT)))
  printDepth(depthReport(t.pages, t.thin))
} else {
  console.log('usage: pnpm engine run [--sources a,b | --except a,b] [--limit N] [--max-minutes M] [--only <url regex> [--force]] [--retry-blocked] | pnpm engine moderate | pnpm engine summaries [--top N] [--jobs N] [--only id,id] | pnpm engine summaries approve <id,id|all> | pnpm engine traits [--limit N] | pnpm engine topic-check [--limit N] [--only id,id] | pnpm engine videos [--playlist ID,ID] [--limit N] [--max-minutes M] [--redo] [--only videoId,videoId] | pnpm engine discover-videos [--channels a,b | --lang vi] [--limit N] [--force] | pnpm engine youtube-add <url>... | pnpm engine product <brand> <model> --category C [--type T] | pnpm engine video-items [--limit N] | pnpm engine gallery [--sheets N] [--only id] [--shard i/n] | pnpm engine facebook [--limit N] [--max-minutes M] [--retry-blocked] [--backfill] | pnpm engine unsplash [--limit N] | pnpm engine breed-photos [--limit N] | pnpm engine breed "<name>" [--kind K] [--based-on id] [--redo] | pnpm engine topic "<chủ đề>" --kind K [--redo] | pnpm engine covers [--redo] [--limit N] | pnpm engine rewrite-vi [--limit N] [--only kinds] | pnpm engine thumbs | pnpm engine picture-hashes [--limit N] [--jobs N] | pnpm engine photos [--limit N] [--kind species,plants,guides] | pnpm engine mirror-photos [--limit N] [--dry-run] | pnpm engine fishbase-photos | pnpm engine crypts-photos | pnpm engine own-photos <list.json> | pnpm engine faces | pnpm engine watermarks [--limit N] [--parallel N] | pnpm engine check-photos [--limit N] [--parallel N] [--only id] | pnpm engine audit [--fix] | pnpm engine reader [--limit N] [--rewrites N] [--only lang/kind/id,…] | pnpm engine metric | pnpm engine localize --lang id|th [--kind plants] [--only ids | --top N] [--limit N] [--redo] | pnpm engine localize-guides --lang id|th [--only ids] [--limit N] [--redo] | pnpm engine localize-breeds --lang id|th [--only ids] [--limit N] [--redo] | pnpm engine localize-glossary --lang id|th [--only ids] [--redo] | pnpm engine localize-places --lang id|th [--redo] | pnpm engine localize-captions --lang id|th [--limit N] | pnpm engine wikidata-names --lang id|th | pnpm engine localize-equipment --lang id|th [--only cats] [--redo] | pnpm engine status')
  process.exitCode = 1
}
