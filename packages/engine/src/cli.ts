import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadAll, SOURCE_IDS, type SourceId } from '@aq/schema'
import { LlmError, claudeCli, claudeResearch, claudeVision } from './claude'
import { makeProduct } from './products'
import { readKit } from './video-items'
import { auditPictures } from './audit'
import { dropFacePhotos, visionFaces } from './faces'
import { backfillPhotos } from './photo-backfill'
import { ChromeFetcher } from './fetch'
import { r2Media } from './media'
import { mirrorPhotos } from './mirror-photos'
import { httpAdmin, moderate } from './moderate'
import { httpPhotoAdmin, moderatePhotos, VERDICT_SCHEMA, type Verdict } from './reader-photos'
import { runEngine } from './run'
import { SOURCES } from './sources'
import { loadState } from './state'
import { approveSummaries, draftSummaries, reviewDoc } from './summaries'
import { backfillThumbs } from './thumbs'
import { extractTraits } from './traits'
import { COVER_SCHEMA, videoCovers } from './video-covers'
import { videoImages } from './video-images'
import { searchCommons } from './photos'
import { REWRITE_KINDS, rewriteExisting } from './vi-backfill'
import { VI_WRITE } from './vi-rewrite'
import { addOwnerPicks, discoverPlaylists, discoverSingles, QUERIES_BY_LANG } from './video-discovery'
import { galleries, VET_SCHEMA as GALLERY_VET, type GalleryDeps } from './gallery'
import { makeBreed } from './breeds'
import { backfillVideoItems } from './video-items'
import { throttled, VIDEO_GAP_MS, videoGuides, ytApi, ytDlp, ytFinder, ytStoryboard } from './youtube'
import { isMarketplace } from './marketplaces'
import { checkPagePhotos, PHOTO_CHECK_SCHEMA } from './photo-check'
import { ArchiveFetcher } from './archive'

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

const { positionals, values } = parseArgs({ allowPositionals: true, options: { sources: { type: 'string' }, except: { type: 'string' }, limit: { type: 'string' }, 'max-minutes': { type: 'string' }, only: { type: 'string' }, 'retry-blocked': { type: 'boolean' }, force: { type: 'boolean' }, top: { type: 'string' }, playlist: { type: 'string' }, redo: { type: 'boolean' }, channels: { type: 'string' }, lang: { type: 'string' }, category: { type: 'string' }, type: { type: 'string' }, kind: { type: 'string' }, 'based-on': { type: 'string' }, match: { type: 'string' }, 'dry-run': { type: 'boolean' } } })

/** Photo fetching and screening for galleries and breed pages. */
const galleryDeps = (): GalleryDeps => ({
  http, sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date(), faces: visionFaces,
  get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
  look: (file, prompt) => claudeVision<{ keep: { n: number; caption: string }[]; best: number[] }>({ system: 'You pick photos for a fish photo gallery. Reply only with JSON.', prompt, schema: GALLERY_VET, file }),
})
const cmd = positionals[0]

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

if (cmd === 'run') {
  const list = (v?: string) => v?.split(',').map(s => s.trim()) as SourceId[] | undefined
  const except = list(values.except)
  const bad = [...list(values.sources) ?? [], ...except ?? []].filter(s => !(SOURCE_IDS as readonly string[]).includes(s))
  if (bad.length) throw new Error(`unknown source(s): ${bad.join(', ')}`)
  // --except: every source but these (the engine's Seriously Fish job runs that backlog on its own).
  const sources = list(values.sources) ?? (except && SOURCES.map(s => s.id).filter(s => !except.includes(s)))
  if (values.force && !values.only) throw new Error('--force re-translates only the pages matched by --only')
  const profileDir = process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/thuysinh/chrome-profile')
  const fetcher = new ChromeFetcher({ profileDir })
  const startedAt = new Date().toISOString()
  await fetcher.open()
  try {
    const report = await runEngine(
      { fetcher, archive: new ArchiveFetcher({ fetch, now: () => new Date(), sleep: ms => new Promise(r => setTimeout(r, ms)), ua: UA }), llm: claudeCli, http, media: media(), root: ROOT, now: () => new Date(), sleep: ms => new Promise(r => setTimeout(r, ms)) },
      { sources, limit: values.limit ? Number(values.limit) : undefined, maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : undefined, only: values.only ? new RegExp(values.only) : undefined, retryBlocked: values['retry-blocked'], force: values.force },
    )
    await mkdir(join(ROOT, 'engine-state'), { recursive: true })
    await writeFile(join(ROOT, 'engine-state/last-run.json'), `${JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), ...report }, null, 2)}\n`)
    console.table(report.perSource)
    if (report.needsHuman.length) console.log(`needs-human: ${report.needsHuman.join(', ')} — pass the browser check in the engine Chrome profile, then: pnpm engine run --sources <id> --retry-blocked`)
    for (const e of report.errors) console.log(`error: ${e}`)
    console.log(`changed: ${report.changed.length}`)
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
  // pnpm engine summaries [--top N] → drafts + docs/review/summaries.md; pnpm engine summaries approve <id,id|all>
  const contentRoot = join(ROOT, 'content')
  if (positionals[1] === 'approve') {
    const arg = positionals[2] ?? ''
    const done = await approveSummaries(contentRoot, arg === 'all' ? 'all' : arg.split(',').filter(Boolean))
    console.log(`approved: ${done.length}${done.length ? ` (${done.join(', ')})` : ''}`)
  } else {
    const drafted = await draftSummaries(contentRoot, claudeCli, { top: Number(values.top ?? 30), now: () => new Date() })
    console.log(`drafted: ${drafted.length}`)
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
} else if (cmd === 'faces') {
  // Drop photos showing people (macOS Vision face detection); each photo is checked once, cached in engine-state.
  const r = await dropFacePhotos(join(ROOT, 'content'), join(ROOT, 'engine-state/_photo-faces.json'), {
    get: async u => { const res = await fetch(u); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    detect: visionFaces,
  }, join(ROOT, 'engine-state/_photo-rejected.json'))
  console.log(`faces: ${r.checked} checked, ${r.removed.length} removed, ${r.failed.length} failed`)
  for (const x of r.removed) console.log(`removed: ${x}`)
  for (const f of r.failed) console.log(`failed: ${f}`)
} else if (cmd === 'check-photos') {
  // Each species/plant page's photos judged against the species (vision, cached per photo): other species rejected, a typical photo first.
  const r = await checkPagePhotos(join(ROOT, 'content'), join(ROOT, 'engine-state/_photo-check.json'), join(ROOT, 'engine-state/_photo-rejected.json'), {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    look: (file, prompt) => claudeVision({ system: 'You identify aquarium fish and plants in photos. Reply only with JSON.', prompt, schema: PHOTO_CHECK_SCHEMA, file, model: process.env.PHOTO_CHECK_MODEL ?? 'opus' }),
  }, { limit: values.limit ? Number(values.limit) : 40, ...(values.only ? { only: values.only } : {}) })
  console.log(`check-photos: ${r.judged.length} pages judged, ${r.removed.length} photos removed, ${r.reordered.length} reordered, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.removed) console.log(`removed: ${x}`)
  for (const x of r.failed) console.log(`failed: ${x}`)
} else if (cmd === 'photos') {
  // Pages with fewer than 3 photos: re-read their source pages for photos the picker used to miss (monthly per page).
  const fetcher = new ChromeFetcher({ profileDir: process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/thuysinh/chrome-profile') })
  await fetcher.open()
  try {
    const r = await backfillPhotos(ROOT, { get: u => fetcher.get(u), bytes: (u, ref) => fetcher.bytes(u, ref), media: media(), now: () => new Date(), sleep: ms => new Promise(res => setTimeout(res, ms)) }, { limit: values.limit ? Number(values.limit) : undefined })
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
} else if (cmd === 'audit') {
  // Pictures per page → docs/review/content-audit.md (a report only; nothing is hidden).
  const { rows, markdown } = await auditPictures(join(ROOT, 'content'), join(ROOT, 'engine-state/_wanted.json'))
  await mkdir(join(ROOT, 'docs/review'), { recursive: true })
  await writeFile(join(ROOT, 'docs/review/content-audit.md'), markdown)
  console.log(`audit: ${rows.length} pages, ${rows.filter(r => !r.photos).length} without a photo, ${rows.filter(r => r.missingThumbs).length} missing thumbs, ${rows.filter(r => r.photos === 1).length} with one photo`)
} else if (cmd === 'traits') {
  // Temperament / fin-nipping / school size from each page's text, for the tank-mates checker (new or changed pages only).
  const r = await extractTraits(join(ROOT, 'content'), claudeCli, { limit: Number(values.limit ?? 100), now: () => new Date() })
  console.log(`traits: ${r.done.length} done, ${r.failed.length} failed${r.failed.length ? ` (${r.failed.join(', ')})` : ''}`)
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
  // Many photos per species (Commons + iNaturalist, open licences, screened): pnpm engine gallery [--limit N] [--only <species id>]
  const r = await galleries(ROOT, galleryDeps(), { limit: values.limit ? Number(values.limit) : 8, ...(values.only ? { only: values.only } : {}) })
  console.log(`gallery: ${r.done.length} species, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.done, ...r.failed]) console.log(x)
} else if (cmd === 'breed') {
  // A page for a man-made fish (hybrid, line, colour form), from web research: pnpm engine breed "<English name>" [--kind hybrid|variety|transgenic] [--based-on <species id>] [--redo]
  // --redo: rewrite the page from the research already kept (engine-state/breeds), no new searching.
  const name = positionals.slice(1).join(' ').trim()
  const kind = values.kind as 'hybrid' | 'variety' | 'transgenic' | undefined
  if (!name || (kind && !['hybrid', 'variety', 'transgenic'].includes(kind))) throw new Error('usage: pnpm engine breed "<English name>" [--kind hybrid|variety|transgenic] [--based-on <species id>] [--redo]')
  const r = await makeBreed(ROOT, { research: claudeResearch, llm: claudeCli, gallery: galleryDeps() }, { name, ...(kind ? { kind } : {}), ...(values['based-on'] ? { basedOn: values['based-on'] } : {}) }, { researchModel: process.env.RESEARCH_MODEL ?? 'opus', reuse: values.redo })
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
} else if (cmd === 'status') {
  const rows: Record<string, Record<string, number>> = {}
  for (const id of SOURCE_IDS) {
    const counts: Record<string, number> = {}
    for (const s of Object.values(await loadState(ROOT, id))) counts[s.status] = (counts[s.status] ?? 0) + 1
    rows[id] = counts
  }
  console.table(rows)
} else {
  console.log('usage: pnpm engine run [--sources a,b | --except a,b] [--limit N] [--max-minutes M] [--only <url regex> [--force]] [--retry-blocked] | pnpm engine moderate | pnpm engine summaries [--top N] | pnpm engine summaries approve <id,id|all> | pnpm engine traits [--limit N] | pnpm engine videos [--playlist ID,ID] [--limit N] [--max-minutes M] [--redo] [--only videoId,videoId] | pnpm engine discover-videos [--channels a,b | --lang vi] [--limit N] [--force] | pnpm engine youtube-add <url>... | pnpm engine product <brand> <model> --category C [--type T] | pnpm engine video-items [--limit N] | pnpm engine gallery [--limit N] [--only id] | pnpm engine breed "<name>" [--kind K] [--based-on id] [--redo] | pnpm engine covers [--redo] [--limit N] | pnpm engine rewrite-vi [--limit N] [--only kinds] | pnpm engine thumbs | pnpm engine photos [--limit N] | pnpm engine mirror-photos [--limit N] [--dry-run] | pnpm engine faces | pnpm engine check-photos [--limit N] [--only id] | pnpm engine audit | pnpm engine status')
  process.exitCode = 1
}
