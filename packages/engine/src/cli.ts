import { videoBudgetStopped } from './youtube'
import { appendFileSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadAll, PHOTO_BOXES_FILE, SOURCE_IDS, vnDate, type SourceId } from '@aq/schema'
import { WRITTEN_LANGS, WRITTEN_OTHER_LANGS } from '@aq/schema/langs'
import { nameStep } from './ceiling'
import { LlmError, claudeCli, claudeResearch, claudeVision } from './claude'
import { accountReport, rejectedTokens } from './claude-accounts'
import { makeProduct } from './products'
import { productCandidates, productReviews } from './product-reviews'
import { readKit } from './video-items'
import { guideRank } from './video-order'
import { HOLD_CLASSES, holdGuides, type HoldClass } from './video-hold'
import { ungarble } from './ungarble'
import { redoUnread } from './unread-redo'
import { videoMend } from './video-mend'
import { BACKFILL_KINDS, lowVideoGuides, reviewBackfill, type BackfillKind } from './review-backfill'
import { NEAR_BAR } from './quality'
import { allTraces } from './review-log'
import { reviewReport } from './review-report'
import { auditPictures } from './audit'
import { metricPages } from './metric'
import { checkPages, fixStored, rulesReport } from './content-rules'
import { loadPages } from './pages'
import { copiesToRedo, redoCopies, type Redone } from './seasons'
import { FIT_KINDS, fitDue, fitKey, fitReport, runFit, type FitState } from './fit'
import { gate, writeFitSummary } from './gate'
import { restingFetch } from './wikimedia-rest'
import { fitRewrite } from './fit-rewrite'
import { unitsMend } from './units-mend'
import { recordSourceFigures, sourceFigures } from './source-figures'
import fitFront from './fit-front.json'
import { firstRun, frontEarly, frontHeld, frontPlan, offLane, orderFront, type FirstRun, type HeldMark } from './fit-front'
import { candidates, cardsOf, checkCalendar, demandByPath, plan, readCalendar, readVerdicts, writeCalendar } from './curation'
import { phraseMatch } from './phrases'
import { readerReport, readPages } from './reader'
import { updatePageDates } from './page-dates'
import { sweep } from './sweep'
import { dropFacePhotos, visionFaces } from './faces'
import { boxPhotos, visionSubjects } from './photo-boxes'
import { backfillPhotos } from './photo-backfill'
import { ChromeFetcher } from './fetch'
import { r2Media } from './media'
import { headsUnderBar, largePhotos } from './large-photos'
import { LEAD_SCHEMA, screenLeads } from './lead-photo'
import { mirrorPhotos } from './mirror-photos'
import sharp from 'sharp'
import { seedGalleries } from './gallery-seed'
import { fishbasePhotos, inatPhotos } from './fishbase-photos'
import { cryptsPhotos } from './crypts-photos'
import { tropicaPhotos } from './tropica-photos'
import { ownPhotos } from './own-photos'
import { httpAdmin, moderate } from './moderate'
import { httpPhotoAdmin, moderatePhotos, photoPages, VERDICT_SCHEMA, type Verdict } from './reader-photos'
import { ARCHIVE_AFTER_BLOCKS, runEngine } from './run'
import { cardGaps } from './card-fill'
import { depthReport, popularityOrder, thinSpecies, type DepthReport } from './depth'
import { SOURCES } from './sources'
import { errorKind, loadState, setSourceBlock, sourceBlockedSince } from './state'
import { collect } from './facebook/collect'
import { chromeFb } from './facebook/chrome'
import { FB } from './facebook/config'
import { FB_FISH_SCHEMA, FB_SPECIES_SCHEMA, identifyPhotos, type FbVerdict } from './facebook/identify'
import { approveSummaries, draftSummaries, reviewDoc } from './summaries'
import { backfillThumbs } from './thumbs'
import { tidyCredits } from './wiki-author'
import { fillLifespans } from './lifespans'
import { hashPictures } from './picture-hashes'
import { extractTraits } from './traits'
import { namePlacesVi } from './place-names'
import { speciesRanges } from './range'
import { gbifClient } from './range-records'
import { speciesWater } from './water'
import { topicCheck } from './topic-check'
import { retagSources } from './source-kinds'
import { COVER_SCHEMA, videoCovers } from './video-covers'
import { videoImages } from './video-images'
import { scoreStills } from './still-sharpness'
import { videoStills } from './video-stills'
import { searchCommons } from './photos'
import { REWRITE_KINDS, rewriteExisting } from './vi-backfill'
import { VI_WRITE } from './vi-rewrite'
import { addOwnerPicks, discoverPlaylists, discoverSingles, QUERIES_BY_LANG } from './video-discovery'
import { galleries, VET_SCHEMA as GALLERY_VET, type GalleryDeps, type Vet } from './gallery'
import { englishName, unsplashCredits, unsplashPhotos, type UnsplashApi } from './unsplash'
import { breedCare, breedPhotos, localizeBreed, makeBreed } from './breeds'
import { makeSpecies, type VideoSource } from './species-research'
import { speciesVideos } from './species-videos'
import { findVideos, readVideoRejected } from './videos'
import { localizeCaptions } from './captions'
import { localizeEquipment } from './equipment-intl'
import { addWikidataNames } from './wikidata'
import { addPlantSynonyms } from './plant-synonyms'
import { fetchFishSynonyms, fishOlderNames } from './fish-synonyms'
import { writePlanting } from './planting'
import { localizeTopic, makeTopic } from './topics'
import { makeMaterial, MATERIALS } from './materials'
import { makeGlossaryEntry } from './glossary-entry'
import { CLASSIFICATION_THREAD, FORUM_SECTIONS, readForum } from './forum'
import { listingText, readIdeas, refreshIdeas, writeIdeas } from './ideas'
import { backfillVideoItems } from './video-items'
import { throttled, VIDEO_GAP_MS, videoGuides, ytApi, ytDlp, ytFinder, ytFrames, ytGrab } from './youtube'
import { checkPagePhotos, EMPTY_CAP, PHOTO_CHECK_SCHEMA, recheckCandidates } from './photo-check'
import { DEAD_SCREEN_SCHEMA, screenDead } from './dead-screen'
import { askAlbums, askSchema, type AskTile } from './album-ask'
import { GUIDE_PHOTO_SCHEMA, screenGuidePhotos, type GuidePhotoDeps } from './guide-photos'
import { screenWatermarks, visionText, WATERMARK_SCHEMA } from './watermarks'
import { imageSteps } from './image-steps'
import { runPhotoPrivacyCommand } from './photo-privacy'
import { calibrateGenerated, calibrateMarks, type CalibrationCase } from './image-calibration'
import { codexImageJson, codexNativeImage, imageCache, readImageQuota } from './codex-images'
import { NO_TRACE_SCHEMA, NO_TRACE_MODEL } from './image-transforms'
import { APPEARANCE_SCHEMA, GENERATED_CHECK_MODEL, GENERATED_CHECK_SCHEMA, REFERENCE_CHECK_SCHEMA } from './image-reference'
import { MARK_INSPECTION_SCHEMA, markInspectionPrompt, REAL_IMAGE_MODEL, type MarkInspection } from './image-real-checks'
import { ArchiveFetcher } from './archive'
import { researchedPage } from './cycle-only'
import { localizeCards } from './cards-intl'
import { heroesWithout, localizeGlossary, localizePlaces, localizeSpecies, speciesOrder, TARGETS, type TargetLang } from './localize'
import { addShopNames, makeShopList, popularFirst, type ShopLang } from './shops'
import { abNamespace, listReaderWants } from './readers-wanted'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const UA = 'aquatome-engine/0.1 (https://aquatome.com)'
// Every Wikimedia read in this process asks as the engine and rests after a refusal (wikimedia-rest.ts).
globalThis.fetch = restingFetch(globalThis.fetch, { restFile: join(homedir(), '.cache/aquatome/wikimedia-rest.json'), now: () => new Date(), ua: UA })
const http = async (url: string) => {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url).host}`)
  return r.json()
}

/** Media bucket credentials: env, else the owner's ~/.config/aquatome files (never printed). */
const conf = (env: string, file: string) => process.env[env] ?? readFileSync(join(homedir(), '.config/aquatome', file), 'utf8').trim()
// YouTube Data API key: env, else ~/.config/aquatome/youtube-api-key; also what findVideos reads (species page videos).
process.env.YOUTUBE_API_KEY ??= (() => { try { return readFileSync(join(homedir(), '.config/aquatome/youtube-api-key'), 'utf8').trim() || undefined } catch { return undefined } })()
/** Video metadata through the API when there is a key (yt-dlp then only fetches captions), else all through yt-dlp. */
const youtube = () => (process.env.YOUTUBE_API_KEY ? ytApi(process.env.YOUTUBE_API_KEY) : ytDlp)
const media = () => r2Media({
  accountId: conf('CF_ACCOUNT_ID', 'cf-account'), token: conf('CLOUDFLARE_API_TOKEN', 'cf-token'),
  bucket: process.env.MEDIA_BUCKET ?? 'aquatome-media', publicBase: process.env.MEDIA_BASE ?? 'https://media.aquatome.com',
})

/**
 * Names readers keep on their tanks without a page, from the site's KV (readers-wanted.ts), with the Cloudflare token
 * (env, else ~/.config/aquatome/cf-token; never printed). Without one the engine goes on without them, saying nothing.
 */
const readersWanted = (() => {
  let token: string | undefined
  try { token = conf('CLOUDFLARE_API_TOKEN', 'cf-token') || undefined } catch { /* no token here */ }
  if (!token) return undefined
  return async () => {
    const namespace = await abNamespace(ROOT)
    if (!namespace) throw new Error('no AB namespace in apps/site/wrangler.jsonc')
    return listReaderWants({ accountId: conf('CF_ACCOUNT_ID', 'cf-account'), namespace, token })
  }
})()

/** No people or marks: the model guide-photos and video-stills ask. */
const guidePhotoLook: GuidePhotoDeps['look'] = (file, prompt) => claudeVision({ system: 'You look at pictures for an aquarium handbook. Reply only with JSON.', prompt, schema: GUIDE_PHOTO_SCHEMA, file, model: process.env.GUIDE_PHOTOS_MODEL ?? 'opus' })

const { positionals, values } = parseArgs({ allowPositionals: true, options: { write: { type: 'boolean' }, 'empty-cap': { type: 'string' }, manifest: { type: 'string' }, heads: { type: 'boolean' }, 'back-check': { type: 'boolean' }, sources: { type: 'string' }, phrases: { type: 'boolean' }, calendar: { type: 'boolean' }, except: { type: 'string' }, limit: { type: 'string' }, fill: { type: 'string' }, 'max-minutes': { type: 'string' }, only: { type: 'string' }, 'retry-blocked': { type: 'boolean' }, force: { type: 'boolean' }, top: { type: 'string' }, playlist: { type: 'string' }, redo: { type: 'boolean' }, fresh: { type: 'boolean' }, 'from-draft': { type: 'boolean' }, revise: { type: 'boolean' }, accept: { type: 'string' }, channels: { type: 'string' }, lang: { type: 'string' }, category: { type: 'string' }, type: { type: 'string' }, kind: { type: 'string' }, sf: { type: 'string' }, 'based-on': { type: 'string' }, match: { type: 'string' }, 'dry-run': { type: 'boolean' }, backfill: { type: 'boolean' }, seed: { type: 'string' }, parallel: { type: 'string' }, jobs: { type: 'string' }, sheets: { type: 'string' }, shard: { type: 'string' }, pages: { type: 'string' }, fix: { type: 'boolean' }, rewrites: { type: 'string' }, popular: { type: 'boolean' }, titles: { type: 'string' }, 'photo-cap': { type: 'string' }, records: { type: 'string' }, 'no-new-pages': { type: 'boolean' }, video: { type: 'string' }, 'reviewed-before': { type: 'string' }, 'rechecked-since': { type: 'string' }, class: { type: 'string' }, clear: { type: 'boolean' }, days: { type: 'string' }, check: { type: 'boolean' }, gsc: { type: 'string' }, from: { type: 'string' }, mends: { type: 'string' }, first: { type: 'string' }, front: { type: 'boolean' }, record: { type: 'boolean' } } })

/**
 * Openverse's API (anonymous: 20 requests a minute, 200 a day). A registered Openverse app raises that: its client id and
 * secret in OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET (or ~/.config/aquatome/openverse-client-id, -secret).
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
// The command, wherever it stood among the options, is the name its model calls are counted under (ceiling.ts).
nameStep(cmd)

// At the end of every command that called Claude: what each account answered, and which were set aside and why
// (claude-accounts.ts), in the log and on the GitHub run's summary page. 'exit': some commands end with process.exit().
process.on('exit', () => {
  const lines = accountReport()
  if (!lines.length) return
  for (const l of lines) console.log(`claude: ${l}`)
  if (process.env.GITHUB_ACTIONS && lines.some(l => l.endsWith('credential rejected'))) console.log(`::warning title=Claude credential rejected::replace ${rejectedTokens()}`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `#### Claude accounts: engine ${cmd}\n\n${lines.map(l => `- ${l}`).join('\n')}\n\n`)
})

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
  console.log(`covers: ${cv.done.length} done, ${cv.failed.length} failed${cv.stopped ? ` (stopped: ${cv.stopped})` : ''}`)
  for (const d of cv.done) console.log(`cover: ${d}`)
  for (const f of cv.failed) console.log(`cover failed: ${f}`)
  return cv
}

if (cmd === 'photo-privacy') {
  process.exitCode = await runPhotoPrivacyCommand(ROOT, values.write === true)
} else if (cmd === 'run' || cmd === 'card-fill') {
  const list = (v?: string) => v?.split(',').map(s => s.trim()) as SourceId[] | undefined
  const except = list(values.except)
  const bad = [...list(values.sources) ?? [], ...except ?? []].filter(s => !(SOURCE_IDS as readonly string[]).includes(s))
  if (bad.length) throw new Error(`unknown source(s): ${bad.join(', ')}`)
  // --except: every source but these (the engine's Seriously Fish job runs that backlog on its own).
  // card-fill: the sources whose species profiles are found by the name in their address (Seriously Fish, Loaches Online, ScotCat).
  const sources = list(values.sources) ?? (except && SOURCES.map(s => s.id).filter(s => !except.includes(s))) ?? (cmd === 'card-fill' ? SOURCES.filter(s => s.profiles).map(s => s.id) : undefined)
  if (values.force && !values.only) throw new Error('--force re-translates only the pages matched by --only')
  const profileDir = process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/aquatome/chrome-profile')
  const fetcher = new ChromeFetcher({ profileDir })
  const startedAt = new Date().toISOString()
  const order = cmd === 'card-fill' ? popularityOrder(await popularFirst(ROOT)) : []
  const before = cmd === 'card-fill' ? await cardGaps(join(ROOT, 'content'), order) : []
  await fetcher.open()
  try {
    const report = await runEngine(
      { fetcher, archive: new ArchiveFetcher({ fetch, now: () => new Date(), sleep: ms => new Promise(r => setTimeout(r, ms)), ua: UA, restFile: join(homedir(), '.cache/aquatome/archive-rest.json') }), llm: claudeCli, http, media: media(), root: ROOT, now: () => new Date(), sleep: ms => new Promise(r => setTimeout(r, ms)), readersWanted },
      // card-fill: CARD_FILL_LIMIT (engine-cycle.sh) pages a source, 10 by default.
      { sources, limit: values.limit ? Number(values.limit) : cmd === 'card-fill' ? 10 : undefined, maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : undefined, only: values.only ? new RegExp(values.only) : undefined, retryBlocked: values['retry-blocked'], force: values.force, cardFill: cmd === 'card-fill' },
    )
    // card-fill reports what each page read gained; last-run.json stays the cycle's main run's report.
    if (cmd === 'run') {
      await mkdir(join(ROOT, 'engine-state'), { recursive: true })
      await writeFile(join(ROOT, 'engine-state/last-run.json'), `${JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), ...report }, null, 2)}\n`)
    }
    console.table(report.perSource)
    if (report.stopped) console.log(`stopped: ${report.stopped}`)
    if (report.needsHuman.length) console.log(`needs-human: ${report.needsHuman.join(', ')} — pass the browser check in the engine Chrome profile, then: pnpm engine run --sources <id> --retry-blocked`)
    if (report.movedToArchive.length) console.log(`moved to the Internet Archive: ${report.movedToArchive.join(', ')} (browser checks on ${ARCHIVE_AFTER_BLOCKS} runs within a week)`)
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
    if (report.errors.some(e => /Failed to authenticate|Invalid bearer token/i.test(e))) { console.log(`error: Claude rejected the credential — replace ${rejectedTokens()}`); process.exitCode = 1 }
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
  const p = await moderatePhotos(httpPhotoAdmin(base, conf('AB_DASH_TOKEN', 'ab-dash-token')), {
    faces: visionFaces,
    judge: (file, prompt) => claudeVision<Verdict>({ system: 'You are a careful photo moderator for an aquarium site. Reply only with JSON.', prompt, schema: VERDICT_SCHEMA, file }),
    ...photoPages(c),
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
} else if (cmd === 'credits') {
  // Wikimedia photos credited before the import tidied Commons' placeholder authors ("No machine-readable author
  // provided. X assumed…", "X~commonswiki"): tidied in place. New imports are tidied as they come (authorText).
  const r = await tidyCredits(join(ROOT, 'content'))
  console.log(`credits: ${r.authors} authors tidied in ${r.files} files`)
} else if (cmd === 'lifespans') {
  // Lifespans the sources already state as a labelled line ("Life expectancy: 4 years"), put on the data card for each
  // source that gives one; new reads give theirs through the process prompt.
  const r = await fillLifespans(join(ROOT, 'content'))
  console.log(`lifespans: ${r.values} added to ${r.species} species`)
} else if (cmd === 'picture-hashes') {
  // The image hash of every picture in content, so no page shows the same picture twice from two files.
  const r = await hashPictures(ROOT, {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
  }, { limit: values.limit ? Number(values.limit) : undefined, jobs: values.jobs ? Number(values.jobs) : undefined })
  console.log(`picture-hashes: ${r.pictures} pictures, ${r.hashed} hashed, ${r.left} left for later, ${r.dropped} gone, ${r.failed.length} failed`)
  for (const f of r.failed.slice(0, 30)) console.log(`failed: ${f}`)
} else if (cmd === 'photo-boxes') {
  // Where the fish is in every fish and breed photo (macOS Vision, no model call), heads first, each photo once.
  const r = await boxPhotos(join(ROOT, 'content'), join(ROOT, 'engine-state', PHOTO_BOXES_FILE), {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    find: visionSubjects,
  }, { limit: values.limit ? Number(values.limit) : 400 })
  console.log(`photo-boxes: ${r.boxed} boxed, ${r.none} with no animal found, ${r.left} left for later, ${r.failed.length} failed`)
  for (const f of r.failed.slice(0, 30)) console.log(`failed: ${f}`)
} else if (cmd === 'faces') {
  // Drop photos showing people (macOS Vision face detection); each photo is checked once, cached in engine-state.
  const r = await dropFacePhotos(join(ROOT, 'content'), join(ROOT, 'engine-state/_photo-faces.json'), {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    detect: visionFaces,
  }, join(ROOT, 'engine-state/_photo-rejected.json'), ROOT)
  console.log(`faces: ${r.checked} checked, ${r.removed.length} removed, ${r.held.length} held for a second look (a page's last photo), ${r.failed.length} failed`)
  for (const x of r.held) console.log(`held for a second look: ${x}`)
  for (const x of r.removed) console.log(`removed: ${x}`)
  for (const f of r.failed) console.log(`failed: ${f}`)
} else if (cmd === 'calibrate-marks') {
  if (!values.manifest) throw new Error('calibrate-marks needs a reviewed --manifest in the private image cache')
  const cases = JSON.parse(await readFile(String(values.manifest), 'utf8')) as Parameters<typeof calibrateMarks>[0]
  console.log(JSON.stringify(await calibrateMarks(cases, imageCache())))
} else if (cmd === 'calibrate-images') {
  if (!values.manifest) throw new Error('calibrate-images needs a reviewed --manifest in the private image cache')
  const cases = JSON.parse(await readFile(String(values.manifest), 'utf8')) as CalibrationCase[]
  await writeFile(join(ROOT, 'content/image-approvals.json.next'), JSON.stringify({ photos: {} }))
  await rename(join(ROOT, 'content/image-approvals.json.next'), join(ROOT, 'content/image-approvals.json'))
  console.log(JSON.stringify(await calibrateGenerated(cases, imageCache())))
} else if (cmd === 'images') {
  const report = await imageSteps(ROOT, async () => {
    const cache = imageCache()
    let bucket: ReturnType<typeof media> | undefined
    return {
      cache, quota: readImageQuota, native: (prompt, dir, reference, admit) => codexNativeImage(prompt, dir, reference, { observe: admit }),
      extract: prompt => codexImageJson(prompt, APPEARANCE_SCHEMA, cache),
      judge: <T>(file: string, prompt: string, schema: object, images: string[] = []) => codexImageJson<T>(prompt, schema, cache, [file, ...images], undefined, schema === NO_TRACE_SCHEMA ? NO_TRACE_MODEL : schema === GENERATED_CHECK_SCHEMA || schema === REFERENCE_CHECK_SCHEMA ? GENERATED_CHECK_MODEL : REAL_IMAGE_MODEL),
      store: (key, bytes, mime, signal) => (bucket ??= media()).putRaw(key, bytes, mime, signal),
      get: async (url, signal) => { const r = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]) }); if (!r.ok) throw new Error(`image download ${r.status}`); return new Uint8Array(await r.arrayBuffer()) },
      now: () => new Date(),
      locateMark: async (file, photo, name) => {
        const dimensions=await sharp(file).metadata(),upright={...photo,width:dimensions.autoOrient.width,height:dimensions.autoOrient.height}
        const v = await codexImageJson<MarkInspection>(markInspectionPrompt(upright,name),MARK_INSPECTION_SCHEMA,cache,[file],undefined,REAL_IMAGE_MODEL)
        return v.marks.map(mark=>({...mark,sourceUrl:photo.sourceUrl,subjectBox:v.subjectBox,wholeSubject:v.wholeSubject}))
      },
    }
  }, undefined, values.limit ? Number(values.limit) : 1)
  console.log(`images: ${JSON.stringify(report)}`)
} else if (cmd === 'check-photos' || cmd === 'recheck-photos') {
  // Each species, plant and breed page's photos and gallery, and guide photos captioned with a fish, judged against their subject
  // (vision, cached per photo and page), in the order photo-check.ts gives (`turn`; --fill: sheets that go first to a
  // source's photos that fill a page with none), most-read pages first: another fish or no photo of it (a landscape with no fish
  // too) removed, can't-tell listed; a dead fish, fish as food, a person or a logo off every page. Verdicts from before the
  // check asked about people are asked again in the same order. recheck-photos: those first whose notes say a dead fish, a
  // hand or a person, or whose verdict was the old "habitat" (recheckCandidates); a re-run finds none and calls no model.
  const recheck = cmd === 'recheck-photos' ? await recheckCandidates(ROOT) : undefined
  if (recheck) {
    console.log(`recheck-photos: ${recheck.size} photos to judge again`)
    for (const [u, note] of recheck) console.log(`candidate: ${u}: ${note}`)
  }
  if (values['empty-cap'] !== undefined && !/^\d+$/.test(values['empty-cap'])) { console.error(`--empty-cap takes a whole number of pages, not "${values['empty-cap']}"`); process.exit(2) }
  const r = recheck && !recheck.size ? undefined : await checkPagePhotos(ROOT, {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    look: (file, prompt) => claudeVision({ system: 'You identify aquarium fish and plants in photos. Reply only with JSON.', prompt, schema: PHOTO_CHECK_SCHEMA, file, model: process.env.PHOTO_CHECK_MODEL ?? 'opus' }),
  }, { limit: values.limit ? Number(values.limit) : 40, ...(Number(values.fill) > 0 ? { fill: Number(values.fill) } : {}), parallel: values.parallel ? Number(values.parallel) : 1, ...(values.only ? { only: values.only } : {}), ...(recheck ? { recheck: new Set(recheck.keys()) } : {}), ...(values['empty-cap'] ? { emptyCap: Number(values['empty-cap']) } : {}) })
  if (r) {
    console.log(`${cmd}: ${r.sheets} sheets, ${r.judged} photos judged (${r.photos} verdicts in all), ${r.removed.length} removed, ${r.rejected} newly rejected, ${r.unsure} can't tell, ${r.failed.length} failed; heads: ${r.heads.moved.length} moved, ${r.heads.emptied.length} removed (page left with no photo)${r.heads.held.length ? `, ${r.heads.held.length} held` : ''}${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
    if (r.heads.held.length) console.log(`${cmd}: ${r.heads.held.length} pages would be left with no photo, ${EMPTY_CAP ? `more than a run may with nobody looking (${EMPTY_CAP})` : 'which no run may with nobody looking'}: none taken off. Their photos wait for a second look (engine-state/_photo-second-look.json, last-photo.ts): a pull request writes each one's answer.`)
    for (const x of r.heads.held) console.log(`held: ${x}`)
    for (const x of r.heads.emptied) console.log(`head removed: ${x}`)
    for (const x of r.heads.moved) console.log(`head moved: ${x}`)
    for (const x of r.picked) console.log(`picked head: ${x}`)
    for (const x of r.blocked) console.log(`rejected: ${x}`)
    for (const x of r.removed) console.log(`removed: ${x}`)
    for (const x of r.failed.slice(0, 30)) console.log(`failed: ${x}`)
  }
} else if (cmd === 'dead-screen') {
  // No dead fish on a page (dead-screen.ts): species and plant pages' videos (the thumbnail and three frames), then main
  // photos the photo check never asked about dead fish; --limit a run (default 48), 12 to a model call; --back-check also
  // the videos judged from their thumbnail alone. A dead one leaves every page, for good. Sonnet by default: whether a
  // fish is alive, not which fish it is.
  const r = await screenDead(ROOT, {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    look: (file, prompt) => claudeVision({ system: 'You look at pictures for an aquarium handbook. Reply only with JSON.', prompt, schema: DEAD_SCREEN_SCHEMA, file, model: process.env.DEAD_SCREEN_MODEL ?? 'sonnet' }),
  }, { limit: values.limit ? Number(values.limit) : 48, parallel: values.parallel ? Number(values.parallel) : 1, backCheck: !!values['back-check'] })
  console.log(`dead-screen: ${r.sheets} sheets, ${r.judged} judged, ${r.dead.length} dead, ${r.held.length} held for a second look (a page's last photo), ${r.left} left for later, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.dead) console.log(`dead: ${x}`)
  for (const x of r.held) console.log(`held for a second look: ${x}`)
  for (const x of r.failed.slice(0, 30)) console.log(`failed: ${x}`)
} else if (cmd === 'guide-photos') {
  // No people or logos in guides' and equipment guides' photos and video guides' stills (guide-photos.ts): --limit model
  // calls a run (default 20), 6 photos each, leads first, then stills; a person or a mark leaves every page for good, a
  // brand on a product leaves the guides (not a still). A tile video-stills will replace waits for the video's frame. On
  // a guide about one kind of fish or plant, a photo of another kind leaves that guide.
  // --only id,id: these guides alone.
  const r = await screenGuidePhotos(ROOT, {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    look: guidePhotoLook,
  }, { limit: values.limit ? Number(values.limit) : 20, parallel: values.parallel ? Number(values.parallel) : 1, ...(values.only ? { only: values.only.split(',').map(x => x.trim()).filter(Boolean) } : {}) })
  console.log(`guide-photos: ${r.sheets} sheets, ${r.judged} judged, ${r.cleared} cleared to show, ${r.off.length} off, ${r.removed.length} removed, ${r.left} left for later, ${r.waiting} stills waiting for their frame, ${r.subject.length} off their guide's subject, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.subject) console.log(`subject: ${x}`)
  for (const x of r.off) console.log(`off: ${x}`)
  for (const x of r.held) console.log(`held for a second look (kept off the list: a page's last photo): ${x}`)
  for (const x of r.removed) console.log(`removed: ${x}`)
  for (const x of r.kept) console.log(`kept (a required hero with nothing to replace it): ${x}`)
  for (const x of r.failed.slice(0, 30)) console.log(`failed: ${x}`)
} else if (cmd === 'watermarks') {
  // No watermarked photos: each photo read once by macOS Vision, text (and logo sources) judged by the model, marked ones dropped everywhere.
  const parallel = values.parallel ? Number(values.parallel) : 1
  const r = await screenWatermarks(ROOT, join(ROOT, 'engine-state/_photo-watermarks.json'), join(ROOT, 'engine-state/_photo-rejected.json'), {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    read: files => visionText(files, parallel),
    look: (file, prompt) => claudeVision({ system: 'You spot watermarks on photos. Reply only with JSON.', prompt, schema: WATERMARK_SCHEMA, file, model: process.env.WATERMARK_MODEL ?? 'opus' }),
  }, { limit: values.limit ? Number(values.limit) : 20, parallel })
  console.log(`watermarks: ${r.read} read, ${r.hits} to judge, ${r.judged} judged, ${r.confirmed.length} watermarked, ${r.removed.length} removed, ${r.held.length} held for a second look (a page's last photo), ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.removed) console.log(`removed: ${x}`)
  for (const x of r.held) console.log(`held for a second look: ${x}`)
  for (const x of r.kept) console.log(`kept (a required hero with nothing to replace it): ${x}`)
  for (const x of r.failed.slice(0, 30)) console.log(`failed: ${x}`)
} else if (cmd === 'photos') {
  // Pages with fewer than 3 photos: re-read their source pages for photos the picker used to miss (monthly per page).
  // --only id,id: these pages alone, read now (first in line).
  const fetcher = new ChromeFetcher({ profileDir: process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/aquatome/chrome-profile') })
  await fetcher.open()
  try {
    const r = await backfillPhotos(ROOT, { get: u => fetcher.get(u), bytes: (u, ref) => fetcher.bytes(u, ref), media: media(), now: () => new Date(), sleep: ms => new Promise(res => setTimeout(res, ms)) }, { limit: values.limit ? Number(values.limit) : undefined, kinds: values.kind?.split(','), ...(values.only ? { only: values.only.split(',') } : {}) })
    console.log(`photos: ${r.pages} pages re-read, ${r.added} photos added, ${r.errors.length} errors`)
    for (const e of r.errors) console.log(`error: ${e}`)
  } finally {
    await fetcher.close()
  }
} else if (cmd === 'gallery-seed') {
  // Candidates found by hand ({ <page id>: Candidate[] }, gallery.ts keys), at the front of each page's gallery queue,
  // for the gallery step to screen next (gallery-seed.ts). pnpm engine gallery-seed --from <file>
  if (!values.from) throw new Error('gallery-seed: --from <file>')
  const r = await seedGalleries(ROOT, JSON.parse(await readFile(values.from, 'utf8')))
  console.log(`gallery-seed: ${r.added} candidates queued on ${r.pages} pages, ${r.skipped} already known, shown, rejected or not licensed, ${r.invalid} malformed, ${r.unknown.length} pages not found${r.unknown.length ? ` (${r.unknown.slice(0, 10).join(', ')})` : ''}`)
} else if (cmd === 'mirror-photos') {
  // Commons and iNaturalist photos served from our bucket (their hosts set third-party cookies; WebP, long cache). --limit N uploads; --dry-run counts.
  const bytes = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const r = await mirrorPhotos(ROOT, { bytes, media: media(), sleep: ms => new Promise(res => setTimeout(res, ms)) }, { limit: values.limit ? Number(values.limit) : undefined, dryRun: values['dry-run'] })
  console.log(`mirror-photos: ${r.mirrored} stored, ${r.files} files updated, ${r.pending} photos waiting, ${r.failed.length} failed`)
  for (const f of r.failed.slice(0, 20)) console.log(`failed: ${f}`)
} else if (cmd === 'lead-photos') {
  // A fish's head photo, which its cards show too (lead-photo.ts): a head under the card's 1,140 px gives way to one that
  // passes, shows the fish as well and keeps its head inside the card's crop, the model comparing the two. --limit model calls a run (default 10), 3 pairs each,
  // the calendar's fish first. --calendar: only the fish on the coming days. --only id,id: these fish alone.
  const r = await screenLeads(ROOT, {
    get: async u => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) },
    look: (file, prompt) => claudeVision({ system: 'You look at pictures for an aquarium handbook. Reply only with JSON.', prompt, schema: LEAD_SCHEMA, file, model: process.env.GUIDE_PHOTOS_MODEL ?? 'opus' }),
  }, { limit: values.limit ? Number(values.limit) : 10, parallel: values.parallel ? Number(values.parallel) : 1, calendar: !!values.calendar, ...(values.only ? { only: values.only.split(',').map(x => x.trim()).filter(Boolean) } : {}) })
  console.log(`lead-photos: ${r.sheets} sheets, ${r.compared} compared, ${r.changed.length} heads changed, ${r.gained.length} pages gained a head, ${r.waiting} waiting, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.changed, ...r.gained]) console.log(`head: ${x}`)
  for (const x of r.failed.slice(0, 20)) console.log(`failed: ${x}`)
} else if (cmd === 'large-photos') {
  // Copies 1,200 on the short side of the photos that may lead the app's large cards (large-photos.ts), for the fish and breed
  // pages --only id,id, in that order, or with --heads every fish's head photo that's under the card's size (the same
  // picture larger, so the cycle runs it). --limit N: photos fetched this run.
  // pnpm engine large-photos --only betta-splendens,poecilia-reticulata [--limit 200]
  const bytes = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const commons = async (file: string) => {
    const u = new URL('https://commons.wikimedia.org/w/api.php')
    for (const [k, v] of Object.entries({ action: 'query', format: 'json', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '2400' })) u.searchParams.set(k, v)
    const res = await fetch(u, { headers: { 'user-agent': UA } })
    if (!res.ok) return undefined
    const pages = ((await res.json()) as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string }[] }> } }).query?.pages ?? {}
    const ii = Object.values(pages)[0]?.imageinfo?.[0]
    return ii?.thumburl ?? ii?.url
  }
  // Turned the way it shows (EXIF orientations 5-8 are quarter turns).
  const size = async (b: Uint8Array) => { const m = await sharp(b).metadata(); return (m.orientation ?? 1) >= 5 ? { width: m.height, height: m.width } : { width: m.width, height: m.height } }
  const ids = values.heads ? await headsUnderBar(ROOT) : (values.only ?? '').split(',').map(x => x.trim()).filter(Boolean)
  if (!ids.length && !values.heads) throw new Error('large-photos: --only id,id, or --heads')
  const r = await largePhotos(ROOT, ids, { bytes, commons, size, put: media().putLarge, sleep: ms => new Promise(res => setTimeout(res, ms)) }, { limit: values.limit ? Number(values.limit) : undefined, headsOnly: !!values.heads })
  console.log(`large-photos: ${r.added} added, ${r.smaller} with no larger size, ${r.skipped} from a source without one, ${r.failed.length} failed`)
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
} else if (cmd === 'tropica-photos') {
  // Tropica's own photos of the plants it wrote about (used with permission), never its drawings: behind a page's photos,
  // or in the gallery of a page that has none (tropica-photos.ts). --limit: pages a run.
  const get = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text() }
  const bytes = async (u: string, referer: string) => { const res = await fetch(u, { headers: { 'user-agent': UA, referer } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const r = await tropicaPhotos(ROOT, { get, bytes, media: media(), sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date() }, values.limit ? { limit: Number(values.limit) } : {})
  console.log(`tropica-photos: ${r.added.length} pages added to, ${r.skipped.length} skipped, ${r.failed.length} failed\n${[...r.added, ...r.skipped, ...r.failed].join('\n')}`)
} else if (cmd === 'own-photos') {
  // Photos people gave the owner for the site, from a JSON list [{ file, page: "plants/<id>", crop? }]: pnpm engine own-photos <list.json>
  const list = positionals[1]
  if (!list) throw new Error('usage: pnpm engine own-photos <list.json>')
  const added = await ownPhotos(ROOT, resolve(process.env.INIT_CWD ?? process.cwd(), list), media())
  console.log(`own-photos: ${added.length} added\n${added.join('\n')}`)
} else if (cmd === 'metric') {
  // Fish, plant, breed and guide pages in metric only (°C, cm, litres), every language: what a writer left in °F, inches or
  // gallons, and a figure only a conversion gives rounded to what a keeper here says (round.ts).
  const changed = await metricPages(join(ROOT, 'content'), ROOT)
  console.log(`metric: ${changed.length} pages${changed.length ? `: ${changed.slice(0, 20).join(', ')}${changed.length > 20 ? ', …' : ''}` : ''}`)
} else if (cmd === 'ungarble') {
  // Letters lost in transit ("ที่��พาะ"), put back one by one (ungarble.ts); a page with none costs nothing.
  // pnpm engine ungarble [--limit N pages]
  const r = await ungarble(join(ROOT, 'content'), { llm: claudeCli }, values.limit ? { limit: Number(values.limit) } : {})
  console.log(`ungarble: ${r.restored.length} pages restored, ${r.left.length} left${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.restored) console.log(`restored: ${x}`)
  for (const x of r.left) console.log(`left: ${x}`)
} else if (cmd === 'redo-unread') {
  // On 11 Nov 2026 the accounts' usage limit stopped the gate reading pages two cycles had changed, so it put the
  // readers' text back, and the writers' records still say those pages were done (unread-redo.ts). This puts those
  // records back. It can go once it has run everywhere.
  const r = await redoUnread(ROOT)
  console.log(`redo-unread: ${r.restored.length} put back, ${r.left.length} left as they are`)
} else if (cmd === 'sweep') {
  // The content rules' safe fixes on every page, each cycle before the build (sweep.ts): the source site's comments and
  // related posts cut, empty headings, repeated paragraphs and labels out of order fixed, photos of another fish or a map
  // taken off the page, card figures out of bounds hidden, shops' own talk and pages about one variety taken off species pages, tank searches written from the card, titles promising a count the text lacks rewritten (--titles N
  // model rewrites a run, reviewer-gated; 0: none) or their number dropped, species' other names kept to their own,
  // breeds linked to the species pages their research names, breeds' other names kept to their own.
  const titles = Number(values.titles ?? 3)
  // --photo-cap N: photos a run may take off every page for good by the caption rule (default 10, sweep.ts PHOTO_CAP):
  // past it none leave, each is listed, and a person looks before running it again with the cap raised.
  const photoCap = values['photo-cap'] ? { photoCap: Number(values['photo-cap']) } : {}
  const r = await sweep(ROOT, { ...(titles > 0 ? { llm: claudeCli, titles, model: process.env.READER_MODEL ?? 'opus' } : {}), ...photoCap })
  console.log(`sweep: ${r.files.length} files; ${Object.entries(r.text).map(([k, v]) => `${k} ${v.length}`).join(', ') || 'no text fixes'}; ${r.photos.length} photos off (${r.rejected} off every page); ${r.again.length} never-again photos off; ${r.heads.length} heads picked; ${r.videos.length} videos off; ${r.card.length} cards (${r.summaries.length} summaries to write again); ${r.tanks.length} tank searches; ${r.shop.length} shop texts; ${r.dealer.length} dealer notices off; ${r.varieties.length} variety pages; ${r.titles.length} titles; ${r.names.length} other names off; ${r.mentions.length} breeds off guides; ${r.links.length} breed links${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  if (r.noAnimal.length) console.log(`sweep: ${r.noAnimal.length} heads with no animal in them and no "yes" from the photo check (engine-state/_photo-no-animal-heads.json)`)
  for (const x of r.noAnimal) console.log(`no animal: ${x}`)
  for (const x of [...r.dealer.map(x => `dealer notice off: ${x}`), ...r.dealerOnly.map(x => `dealer notice, its heading's only text (for the chief of staff): ${x}`)]) console.log(x)
  if (r.albums.length) console.log(`sweep: ${r.albums.length} albums with a new lead photo (gallery.ts orderAlbums)`)
  if (r.refused.length || r.refusedHeld.length || r.refusedPicked.length) console.log(`sweep: ${r.refused.length} refused photos kept off; ${r.refusedHeld.length} pages held; ${r.refusedPicked.length} picked heads the check calls "none" (photo-check.ts refusedOn)`)
  for (const x of [...r.refusedHeld.map(x => `refused held: ${x}`), ...r.refusedPicked.map(x => `picked head the check calls none: ${x}`), ...r.refused.map(x => `refused off: ${x}`)]) console.log(x)
  for (const x of [...r.secondLook.map(x => `held for a second look: ${x}`), ...r.agreed.map(x => `second look agreed, now never-again: ${x}`)]) console.log(x)
  if (r.held.length) console.log(`sweep: ${r.held.length} photos would leave every page for good, more than a run may with nobody looking: none taken off. Look at them, then run: pnpm engine sweep --titles 0 --photo-cap ${r.held.length}`)
  for (const x of [...r.held.map(x => `photo held: ${x}`), ...r.unwell.map(x => `photo of an unwell fish kept: ${x}`), ...Object.entries(r.text).flatMap(([k, v]) => v.map(p => `${k}: ${p}`)), ...r.photos.map(x => `photo off: ${x}`), ...r.again.map(x => `never-again off: ${x}`), ...r.videos.map(x => `video off: ${x}`), ...r.card.map(x => `card: ${x}`), ...r.summaries.map(x => `summary again: ${x}`), ...r.tanks.map(x => `tank search: ${x}`), ...r.shop.map(x => `shop text off: ${x}`), ...r.varieties.map(x => `variety page off: ${x}`), ...r.titles.map(x => `title: ${x}`), ...r.schools.map(x => `school size: ${x}`), ...r.names.map(x => `name off: ${x}`), ...r.mentions.map(x => `mention off: ${x}`), ...r.links.map(x => `link: ${x}`), ...r.unmatched.map(x => `not linked: ${x}`), ...r.unplaced.map(x => `photo under no heading: ${x}`), ...r.folds.map(x => `page folded: ${x}`), ...r.albums.map(x => `album lead: ${x}`)]) console.log(x)
  // After the sweep's own fixes, so a fix a reader sees dates its page (page-dates.ts).
  const dated = await updatePageDates(join(ROOT, 'content'))
  console.log(`page dates: ${dated.files} files, ${dated.changed} changed`)
} else if (cmd === 'audit') {
  // Pictures per page → docs/review/content-audit.md; every published page against the content rules, in each language →
  // docs/review/content-rules.md (reports only; nothing is hidden). --fix: first the rules' safe fixes on the stored text,
  // as the engine makes them when it writes a page (after a fix is added to sanitize.ts tidyHtml).
  if (values.fix) for (const f of await fixStored(join(ROOT, 'content'))) console.log(`fixed: ${f}`)
  const { rows, markdown } = await auditPictures(join(ROOT, 'content'), join(ROOT, 'engine-state/_wanted.json'), join(ROOT, 'engine-state/_readers-wanted.json'))
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
  // [--popular: the backfill, the most-read pages first (Vietnamese, then the species and plants most kept and sold, then
  // guides), e.g. --popular --limit 300 --rewrites 30]
  const pages = await loadPages(join(ROOT, 'content'))
  // Opus by default: on the same pages Sonnet reported findings it then called fine, and took a local name for a mistake.
  const deps = { llm: claudeCli, now: () => new Date(), model: process.env.READER_MODEL ?? 'opus' }
  const popular = values.popular ? popularityOrder(await popularFirst(ROOT)) : []
  const rank = (p: (typeof pages)[number]) => { const i = popular.indexOf(p.id); return i >= 0 && (p.kind === 'species' || p.kind === 'plants') ? i : popular.length + (p.kind === 'guides' ? 0 : 1) }
  const { report: r, state } = await readPages(ROOT, pages, deps, { limit: Number(values.limit ?? 20), rewrites: Number(values.rewrites ?? 3), ...(values.only ? { only: values.only.split(',') } : {}), ...(values.popular ? { rank } : {}) })
  await mkdir(join(ROOT, 'docs/review'), { recursive: true })
  await writeFile(join(ROOT, 'docs/review/reader.md'), readerReport(r.rewritten.length ? await loadPages(join(ROOT, 'content')) : pages, state))
  console.log(`reader: ${r.read.length} pages read, ${r.findings} findings, ${r.rewritten.length} parts rewritten, ${r.notKept.length} not kept, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.read.map(x => `read: ${x}`), ...r.rewritten.map(x => `rewritten: ${x}`), ...r.notKept.map(x => `not kept: ${x}`), ...r.failed.map(x => `failed: ${x}`)]) console.log(x)
} else if (cmd === 'fit') {
  // Is each page written for its reader (fit.ts)? The model reads the pages due in a random order, so a run stopped part
  // way has a random sample; rules with no model run on every page. docs/review/fit.md has the counts, no page lists.
  // pnpm engine fit [--limit N] [--jobs N] [--kind guides,species] [--lang id,th] [--only vi/species/<id>,…: these alone,
  // the most-read first before a rewrite] [--front: the front list's pages only, in its order (fit-front.json), the ones
  // due a read; nothing before the list's `first`]. FIT_MODEL: the reading model. Opus by
  // default: on a test sample Sonnet missed about half of what's written for elsewhere and a quarter of the source talk.
  if (values.front && frontEarly(fitFront, new Date())) {
    console.log(`fit: the front list waits until ${fitFront.first}`)
    process.exit(0)
  }
  const all = (await loadPages(join(ROOT, 'content'))).filter(p => FIT_KINDS.includes(p.kind))
  const only = values.only ? new Set(values.only.split(',')) : undefined
  const filtered = all.filter(p => (!values.kind || values.kind.split(',').includes(p.kind)) && (!values.lang || values.lang.split(',').includes(p.lang)) && (!only || only.has(fitKey(p))))
  const statePath = join(ROOT, 'engine-state/_fit.json')
  const model = process.env.FIT_MODEL ?? 'opus'
  let r: { read: number; failed: string[]; stopped?: string; left: number }
  let state: FitState
  if (values.front) {
    // runFit reads the pages it is given in its own order. One page a call keeps the front list's order under --limit.
    // A page not due a read (fitDue) is not passed, so it costs no call and does not use a place in the limit.
    const want = new Set(fitFront.front)
    const chosen = orderFront(fitFront, filtered).filter(p => want.has(fitKey(p)))
    const prior = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}')) as FitState
    const stale = fitDue(chosen, prior)
    r = { read: 0, failed: [], left: 0 }
    state = prior
    for (const p of stale.slice(0, Number(values.limit ?? 20))) {
      const one = await runFit([p], statePath, { llm: claudeCli, model, jobs: Number(values.jobs ?? 2), limit: 1, root: ROOT })
      r.read += one.report.read
      r.failed.push(...one.report.failed)
      state = one.state
      if (one.report.stopped) { r.stopped = one.report.stopped; break }
    }
    r.left = fitDue(chosen, state).length
  } else {
    const out = await runFit(filtered, statePath, { llm: claudeCli, model, jobs: Number(values.jobs ?? 2), limit: Number(values.limit ?? 20), root: ROOT })
    r = out.report
    state = out.state
  }
  await mkdir(join(ROOT, 'docs/review'), { recursive: true })
  await writeFile(join(ROOT, 'docs/review/fit.md'), fitReport(all, state))
  await writeFitSummary(ROOT, all, state)
  console.log(`fit: ${r.read} pages read, ${r.left} due, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.failed) console.log(`failed: ${x}`)
} else if (cmd === 'fit-rewrite') {
  // The collection rewrite (fit-rewrite.ts): Vietnamese pages the reader-fit read found wrong for their reader, written
  // again and kept only when their reviewers pass them; the most-read fish and plants first, then breeds, then guides.
  // pnpm engine fit-rewrite [--limit N: pages] [--only vi/species/<id>,vi/guides/<id>: these, in this order, tried before or not] [--kind species,guides]
  // [--front: the lane first (pages the gate held new, newest first, when fit-front.json's lane is on), then the front
  // list's pages in its order, then the rest. Nothing before the list's `first`. A run that gets a front-list or other
  // live page to an outcome is written to engine-state/_fit-front.json, and holds those pages in the next until cleared
  // names its `at` (one-shot: fit-front.ts frontHeld); the lane goes on meanwhile.]
  const lastFile = join(ROOT, 'engine-state/_fit-front.json')
  const last = values.front ? (JSON.parse(await readFile(lastFile, 'utf8').catch(() => 'null')) as FirstRun | null) ?? undefined : undefined
  const held = values.front && frontHeld(fitFront, last)
  if (held) console.log(`fit-rewrite: front list held: the run of ${last!.at} is with the chief of staff (engine-state/_fit-front.json); to let one more run go, set cleared to "${last!.at}" in packages/engine/src/fit-front.json${fitFront.lane ? '. The lane and the pages off the list go on.' : ''}`)
  if (values.front && frontEarly(fitFront, new Date())) {
    console.log(`fit-rewrite: waits until ${fitFront.first}`)
  } else if (held && !fitFront.lane) {
    // Held, and the lane shut: nothing to do.
  } else {
    const pages = (await loadPages(join(ROOT, 'content'), ['vi'])).filter(p => ['guides', 'species', 'plants', 'breeds'].includes(p.kind) && (!values.kind || values.kind.split(',').includes(p.kind)))
    const state = JSON.parse(await readFile(join(ROOT, 'engine-state/_fit.json'), 'utf8')) as FitState
    const popular = popularityOrder(await popularFirst(ROOT))
    const rank = (p: (typeof pages)[number]) => { const i = popular.indexOf(p.id); return p.kind === 'guides' ? 2 * popular.length : i >= 0 && p.kind !== 'breeds' ? i : popular.length }
    const only = values.only?.split(',')
    const ranked = only ? only.flatMap(k => pages.filter(p => fitKey(p) === k)) : [...pages].sort((a, b) => rank(a) - rank(b))
    // Each page's mark from the gate (gate.ts Held), for the lane.
    const marks = new Map<string, HeldMark>()
    if (values.front && !only && fitFront.lane) {
      for (const p of ranked) {
        const h = (JSON.parse(await readFile(join(ROOT, 'content', p.kind, p.id, 'vi.json'), 'utf8').catch(() => '{}')) as { held?: HeldMark }).held
        if (h) marks.set(fitKey(p), h)
      }
    }
    const plan = values.front && !only ? frontPlan(fitFront, last, ranked, marks) : { held: false, order: ranked, lane: new Set<string>() }
    if (values.front && !only) console.log(`fit-rewrite: lane ${plan.lane.size} page${plan.lane.size === 1 ? '' : 's'} first${plan.held ? ', front list held' : ''}`)
    const r = await fitRewrite(ROOT, plan.order, state, { llm: claudeCli, now: () => new Date() }, { limit: Number(values.limit ?? 10), retry: !!only, mend: plan.lane })
    for (const x of [...r.rewritten.map(x => `rewritten: ${x}`), ...r.gone.map(x => `gone: ${x}`), ...r.notKept.map(x => `not kept: ${x}`), ...r.skipped.map(x => `skipped: ${x}`), ...r.failed.map(x => `failed: ${x}`)]) console.log(x)
    console.log(`fit-rewrite: ${r.rewritten.length} rewritten, ${r.notKept.length} not kept, ${r.skipped.length} skipped, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
    // The run on file: the front list's and live pages' outcomes, never the lane's alone (fit-front.ts offLane).
    const ran = values.front && !only && !plan.held ? firstRun(offLane(r, plan.lane), new Date().toISOString()) : undefined
    if (ran) await writeFile(lastFile, `${JSON.stringify(ran, null, 1)}\n`)
  }
} else if (cmd === 'units-mend') {
  // A page held for units alone gets a tank converted from US gallons as the size a keeper here names ("115 lít" → "120
  // lít", units-mend.ts): code, no model, so no ceiling line; the gate reads it after. From 13 Nov 2026 08:00, but a dry run.
  // pnpm engine units-mend [--limit N: pages, 6] [--first vi/guides/<id>,…] [--dry-run: what it would change, old beside new]
  const r = await unitsMend(ROOT, { limit: Number(values.limit ?? 6), ...(values.first ? { first: values.first.split(',') } : {}), dryRun: !!values['dry-run'] })
  if (r.waiting) console.log(`units-mend: waits until ${r.waiting}`)
  for (const m of r.mended) {
    console.log(`${values['dry-run'] ? 'would mend' : 'mended'}: ${m.key} ${m.figures.join(', ')}`)
    if (values['dry-run']) for (const c of m.changes) console.log(`  ${c.field}: ${c.old}\n  → ${c.now}`)
  }
  for (const x of r.left) console.log(`left held: ${x}`)
  if (!r.waiting) console.log(`units-mend: ${r.mended.length} mended, ${r.left.length} left held`)
} else if (cmd === 'source-figures') {
  // A figure a fish or plant page's English gives in metric itself, which the rounding rounded until 12 Nov 2026, goes
  // back to the English's (source-figures.ts): code, no model; the gate reads it after. At the pace the chief of staff
  // sets (SOURCE_FIGURES_PACE). Before it mends, one short question on the gate's model: no answer (the accounts out),
  // and it mends nothing, as the gate couldn't read what it mended.
  // pnpm engine source-figures [--limit N: language pages, in place of the pace] [--first vi/species/<id>,…] [--dry-run: old beside new]
  // pnpm engine source-figures --record [--dry-run]: right after the gate, what it made of each page mended (the batches, the stop).
  if (values.record) {
    const r = await recordSourceFigures(ROOT, { dryRun: !!values['dry-run'] })
    for (const x of r.recorded) console.log(`${values['dry-run'] ? 'would record' : 'recorded'}: ${x}`)
    if (r.stopped) console.log(`source-figures: stopped, waiting for the chief of staff's word: ${r.stopped}`)
  } else {
    const reader = async () => {
      try {
        await claudeCli({ system: 'Reply only with JSON.', prompt: 'Reply {"ok": true}.', schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } }, model: process.env.FIT_MODEL ?? 'opus' })
        return undefined
      } catch (e) { return `the gate's model gave no answer: ${(e as Error).message.slice(0, 200)}` }
    }
    const r = await sourceFigures(ROOT, { ...(values.limit ? { limit: Number(values.limit) } : {}), ...(values.first ? { first: values.first.split(',') } : {}), dryRun: !!values['dry-run'], reader })
    if (r.noMain) console.log(`source-figures: mending nothing: ${r.noMain}`)
    if (r.noReader) console.log(`source-figures: mending nothing: ${r.noReader}`)
    for (const m of r.mended) {
      console.log(`${values['dry-run'] ? 'would mend' : 'mended'}: ${m.key} ${m.figures.join(', ')}`)
      if (values['dry-run']) for (const c of m.changes) console.log(`  ${c.field}: ${c.old}\n  → ${c.now}`)
    }
    for (const x of r.left) console.log(`left: ${x}`)
    for (const x of r.putBack) console.log(`put back: ${x}`)
    if (r.stopped) console.log(`source-figures: stopped, waiting for the chief of staff's word: ${r.stopped}`)
    console.log(`source-figures: ${r.mended.length} mended, ${r.waiting ?? 0} waiting for the pace, ${r.left.length} left, ${r.putBack.length} put back by the gate`)
  }
} else if (cmd === 'gate') {
  // Last in each cycle (gate.ts): the pages whose text the cycle changed are read against the checklist; a new page that
  // fails is held back, a live page that got worse gets its committed text back, a page no rewording fixes is held.
  // A video guide worse only for a sentence (a shop or a price abroad, talk about the video) has it fixed by the video's
  // editor and is read again instead (video-mend.ts), --mends pages a run; what does go back is kept (engine-state/put-back/).
  // A new video guide held only for such sentences goes to the editor first too, and so do GATE_HELD_MENDS (12) of the held
  // ones a run (the chief of staff, 14 Nov 2026).
  // pnpm engine gate [--limit N: model reads at most] [--jobs N] [--mends N: new and live pages sent to the mender's editor at most, 20; 0: none]
  const { report: r, state, pages, held } = await gate(ROOT, {
    llm: claudeCli, model: process.env.FIT_MODEL ?? 'opus', jobs: Number(values.jobs ?? 3), limit: Number(values.limit ?? 150),
    mend: videoMend(ROOT, { llm: claudeCli, yt: youtube(), write: { style: true, model: process.env.VIDEO_MODEL ?? 'opus' } }), mends: Number(values.mends ?? process.env.GATE_MENDS ?? 20), heldMends: Number(process.env.GATE_HELD_MENDS ?? 12),
  })
  await writeFile(join(ROOT, 'docs/review/fit.md'), fitReport(pages, state))
  await writeFitSummary(ROOT, pages, state, { held })
  for (const a of ['hold', 'release', 'revert', 'mended', 'unread'] as const) for (const x of r[a]) console.log(`  ${a}: ${x}`)
  for (const x of r.failed) console.log(`  failed: ${x}`)
  console.log(`gate: ${r.pass.length} passed, ${r.hold.length} held, ${r.release.length} let out, ${r.revert.length} put back, ${r.mended.length} mended, ${r.unread.length} not read; ${r.reads} reads${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
} else if (cmd === 'curate') {
  // The editorial calendar (curation.ts, content/curation.json): fill Hôm nay's next days and replace any pick that stopped
  // passing (reader fit, a checked photo big enough for its card). --check only lists what's wrong and exits 1 if anything is.
  // pnpm engine curate [--days 21] [--from YYYY-MM-DD] [--check] [--gsc <Search Console pages export>]
  const days = Number(values.days ?? 21)
  const today = values.from ?? vnDate(new Date())
  const cur = await readCalendar(ROOT)
  const demand = values.gsc ? demandByPath(JSON.parse(await readFile(values.gsc, 'utf8')).rows ?? []) : undefined
  const cands = await candidates(ROOT, { demand, avoid: cur.avoid })
  const cards = await cardsOf(ROOT)
  if (values.check) {
    const wrong = checkCalendar(cur, cands, today, days, cards)
    for (const x of wrong) console.log(`  ${x}`)
    console.log(`curate: ${wrong.length ? `${wrong.length} problems` : `the next ${days} days pass`}`)
    if (wrong.length) process.exitCode = 1
  } else {
    const { calendar, report: r } = plan(cur, cands, today, days)
    await writeCalendar(ROOT, calendar)
    for (const x of r.replaced) console.log(`  replaced ${x.date} ${x.slot} ${x.was}: ${x.why}`)
    for (const x of r.filled) console.log(`  filled ${x}`)
    for (const x of r.empty) console.log(`  empty ${x}`)
    for (const x of r.heroes) console.log(`  hero ${x}`)
    const left = checkCalendar(calendar, cands, today, days, cards)
    for (const x of left) console.log(`  still wrong: ${x}`)
    // Every card from today that rests on a person's yes (curation.ts PersonYes), each run, for the daily report.
    const yes = (await readVerdicts(ROOT)).personYes ?? {}
    for (const d of calendar.days.filter(d => d.date >= today && d.fish)) {
      const c = cands.find(x => x.ref === d.fish)
      const y = c?.head && yes[c.head.url]?.[c.id]
      if (y) console.log(`  on a person's yes: ${d.date} ${d.fish} ${c!.head!.url} (yes by ${y.approvers.join(' and ')}, proposed by ${y.proposer}, ${y.on}; ${y.lookAlike} ruled out by ${y.mark})`)
    }
    console.log(`curate: ${r.kept.length} kept, ${r.filled.length} filled, ${r.replaced.length} replaced, ${r.empty.length} left empty, ${r.heroes.length} heroes on their head; ${left.length} problems`)
  }
} else if (cmd === 'traits') {
  // Temperament / fin-nipping / school size from each page's text, for the tank-mates checker: new or changed pages, then
  // those read with an older prompt; --only id,id reads those again whatever their state.
  const r = await extractTraits(join(ROOT, 'content'), claudeCli, { limit: Number(values.limit ?? 100), now: () => new Date(), only: values.only?.split(',').map(x => x.trim()).filter(Boolean) })
  console.log(`traits: ${r.done.length} done, ${r.failed.length} failed${r.stopped ? ' (stopped: ' + r.stopped + ')' : ''}${r.failed.length ? ` (${r.failed.join(', ')})` : ''}`)
  // The school size Seriously Fish gives replaces the model's reading in the sweep, which every part runs (sweep.ts).
} else if (cmd === 'range') {
  // Where each species lives in the wild (range.ts): its sources' countries and regions, --limit model calls (species
  // whose sources' text is new or changed), then GBIF's wild records for --records species, monthly, most-read first.
  const gbif = gbifClient({ fetch, sleep: ms => new Promise(r => setTimeout(r, ms)), ua: UA, gapMs: 300 })
  const order = popularityOrder(await popularFirst(ROOT))
  const r = await speciesRanges(ROOT, { llm: claudeCli, gbif, now: () => new Date(), order }, { limit: Number(values.limit ?? 20), records: Number(values.records ?? 20), ...(values.only ? { only: values.only.split(',') } : {}) })
  for (const x of [...r.disputed.map(x => `disputed (left out): ${x}`), ...r.outranked.map(x => `only a general site (left out): ${x}`), ...r.origin.map(x => `origin pages differ: ${x}`), ...r.native.failed.map(x => `native failed: ${x}`), ...r.records.failed.map(x => `records failed: ${x}`), ...r.records.unmatched.map(x => `no GBIF match: ${x}`)]) console.log(`  ${x}`)
  console.log(`range: ${r.native.read.length} read (${r.native.calls} model calls), ${r.native.quiet.length} with nothing on where they live, ${r.native.failed.length} failed; records for ${r.records.fetched.length} (${r.records.requests} GBIF requests), ${r.records.unmatched.length} unmatched, ${r.records.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
} else if (cmd === 'water') {
  // Whether each species is kept in brackish or sea water (water.ts), from a quoted sentence of its sources: --limit
  // model calls, for species whose sources' text is new or changed and mentions salt or the sea; the rest are fresh.
  const order = popularityOrder(await popularFirst(ROOT))
  const r = await speciesWater(ROOT, { llm: claudeCli, now: () => new Date(), order }, { limit: Number(values.limit ?? 20), ...(values.only ? { only: values.only.split(',') } : {}) })
  for (const x of [...r.salt, ...r.failed.map(x => `failed: ${x}`)]) console.log(`  ${x}`)
  console.log(`water: ${r.read.length} read (${r.calls} model calls), ${r.quiet.length} fresh with no call, ${r.salt.length} brackish or marine, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
} else if (cmd === 'source-kinds') {
  // Guide research tagged before the kinds a page names its sources by, tagged again (source-kinds.ts): --only id,id,
  // --dry-run prints what would change and writes nothing.
  const r = await retagSources(ROOT, claudeCli, { ...(values.only ? { only: values.only.split(',') } : {}), dryRun: values['dry-run'] })
  for (const c of r.changed) console.log(`  ${c}`)
  const counts = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')
  console.log(`source-kinds: ${r.topics} topics, ${r.changed.length} sources changed\n  before: ${counts(r.before)}\n  after: ${counts(r.after)}`)
} else if (cmd === 'topic-check') {
  // Guides keep to their title's subject: sections about something else (a video drifting off topic) are dropped.
  const r = await topicCheck(ROOT, claudeCli, { limit: Number(values.limit ?? 40), ...(values.only ? { only: values.only.split(',') } : {}) })
  for (const t of r.trimmed) console.log(`  ${t.id}: dropped ${t.dropped.join('; ')}`)
  for (const h of r.held) console.log(`  held for a person: ${h}`)
  console.log(`topic-check: ${r.checked.length} checked, ${r.trimmed.length} trimmed, ${r.held.length} held, ${r.failed.length} failed`)
} else if (cmd === 'review-backfill') {
  // Pages under the bar whose review left no notes, reviewed again as they are, nothing rewritten (review-backfill.ts):
  // --kind k,k (video-guide reads transcripts: the video job's, on the Mac), --limit N model calls a kind, --only ids,
  // --reviewed-before <time>: every page without a review from then on, whatever its score (a reviewer's prompt changed),
  // video guides the riskiest first, then the most read (video-order.ts); --parallel N pages at once.
  const kinds = values.kind?.split(',').map(s => s.trim()).filter(Boolean)
  const before = values['reviewed-before']
  if (kinds?.some(k => !(BACKFILL_KINDS as readonly string[]).includes(k)) || (before && Number.isNaN(Date.parse(before)))) throw new Error(`usage: pnpm engine review-backfill [--kind ${BACKFILL_KINDS.join(',')}] [--limit N] [--only id,id | --reviewed-before <ISO time>] [--parallel N]`)
  const rank = before ? await guideRank(ROOT, popularityOrder(await popularFirst(ROOT))) : undefined
  const r = await reviewBackfill({ root: ROOT, llm: claudeCli, now: () => new Date(), yt: youtube() }, {
    ...(kinds ? { kinds: kinds as BackfillKind[] } : {}), limit: Number(values.limit ?? 10), ...(values.only ? { only: values.only.split(',').map(s => s.trim()).filter(Boolean) } : {}),
    ...(before ? { reviewedBefore: before, rank: (p: { id: string }) => (p.id.startsWith('guides/') ? rank!(p.id.slice('guides/'.length)) : []) } : {}), parallel: Number(values.parallel ?? 1),
    band: NEAR_BAR, // three reads within 0.2 of the bar, the middle one counts (the chief of staff, 2026-11-11)
  })
  for (const x of r.checked) console.log(`  ${x}`)
  for (const x of r.failed) console.log(`  failed: ${x}`)
  console.log(`review-backfill: ${r.checked.length} reviewed again, ${r.failed.length} failed, left ${Object.entries(r.left).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
} else if (cmd === 'review-backfill-97') {
  // The video guides in search whose newest second read failed at 0.55 or under: two more reads each, the middle one
  // counts, before any closes (the chief of staff, 2026-11-11). A command of its own, so its spend is its own step's line
  // in the daily ceilings, not second reads'. --limit N pages a run; --parallel N at once.
  const ids = await lowVideoGuides(ROOT)
  const r = await reviewBackfill({ root: ROOT, llm: claudeCli, now: () => new Date(), yt: youtube() }, { kinds: ['video-guide'], only: ids, limit: Number(values.limit ?? 20), parallel: Number(values.parallel ?? 1), fromLastRead: true, band: Infinity })
  for (const x of r.checked) console.log(`  ${x}`)
  for (const x of r.failed) console.log(`  failed: ${x}`)
  console.log(`review-backfill-97: ${ids.length} low, ${r.checked.length} read again, ${r.failed.length} failed, left ${r.left['video-guide'] ?? 0}${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
} else if (cmd === 'video-hold') {
  // Video guides held out of the chat until they pass the stricter reviewer (video-hold.ts): --class risk1 (medicine,
  // doses, chemicals, treatments), risk2 (water), risk3 (the rest) or all; --clear lets that class back in.
  const cls = values.class as HoldClass | undefined
  if (!cls || !HOLD_CLASSES.includes(cls)) throw new Error(`usage: pnpm engine video-hold --class ${HOLD_CLASSES.join('|')} [--clear]`)
  const changed = await holdGuides(ROOT, cls, !!values.clear)
  for (const id of changed) console.log(`  ${id}`)
  console.log(`video-hold: ${changed.length} guides ${values.clear ? 'back in the chat' : 'held out of the chat'} (${cls})`)
} else if (cmd === 'reviews') {
  // What the quality reviews kept, per kind: pages under the bar and their most common faults → docs/review/reviews.md.
  await writeFile(join(ROOT, 'docs/review/reviews.md'), reviewReport(await allTraces(ROOT)))
  console.log('reviews: docs/review/reviews.md')
} else if (cmd === 'videos') {
  // Original Vietnamese guides from educational YouTube playlists (engine-state/youtube-playlists.json, or --playlist ID,ID).
  // --redo --rechecked-since <time>: the guides a recheck from then on left under the bar with notes, --limit of them, the
  // riskiest first, then the most read (video-order.ts), --parallel N at once.
  const since = values['rechecked-since']
  if (since && (!values.redo || Number.isNaN(Date.parse(since)))) throw new Error('usage: pnpm engine videos --redo --rechecked-since <ISO time> [--limit N] [--parallel N]')
  const r = await videoGuides(
    { yt: youtube(), llm: claudeCli, root: ROOT, now: () => new Date(), sleep: ms => new Promise(res => setTimeout(res, ms)) },
    {
      playlists: values.playlist?.split(',').map(s => s.trim()).filter(Boolean), limit: values.limit ? Number(values.limit) : undefined, maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : undefined,
      // Writing eval (scripts/eval-writing.ts, 2026-10-29): the Vietnamese style guide, written by Opus, read most natural (18–0).
      write: { style: true, model: process.env.VIDEO_MODEL ?? 'opus' }, redo: values.redo, only: values.only?.split(',').map(s => s.trim()).filter(Boolean),
      ...(since ? { rechecked: since, rank: await guideRank(ROOT, popularityOrder(await popularFirst(ROOT))), parallel: Number(values.parallel ?? 1) } : {}),
    },
  )
  console.log(`videos: ${r.written.length} written, ${r.skipped.length} skipped, ${r.errors.length} errors${r.stoppedEarly ? ` (stopped: ${r.stopped ?? 'early'})` : ''}`)
  for (const w of r.written) console.log(`written: ${w}`)
  for (const s of r.skipped) console.log(`skipped: ${s}`)
  for (const e of r.errors) console.log(`error: ${e}`)
  // Covers, then pictures, only while the day's line covers them: a stop in either ends the step's model work.
  if (!videoBudgetStopped(r) && !(await covers({})).stopped) {
    // Pictures per section: video stills (picked on storyboard tiles, then the video's own frames) + an open-licence Commons photo, picked by Claude, no faces.
    const get = async (u: string) => { const res = await fetch(u); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
    const im = await videoImages(join(ROOT, 'content'), {
      llm: claudeCli, faces: visionFaces, frames: ytFrames, grab: ytGrab, transcript: async (id, lang) => (await ytDlp.transcript(id, lang)) ?? (await ytDlp.transcribe!(id, lang)), commons: q => searchCommons(q, http, 6), get, media: media(),
      look: (file, prompt, schema) => claudeVision({ system: 'You pick pictures for an aquarium guide. Reply only with JSON.', prompt, schema, file }),
    }, { limit: Number(process.env.VIDEO_IMAGES_LIMIT ?? 40) })
    console.log(`images: ${im.done.length} guides, ${im.failed.length} failed${im.stoppedEarly ? ' (stopped early)' : ''}`)
    for (const x of im.done) console.log(`images: ${x}`)
    for (const f of im.failed) console.log(`images failed: ${f}`)
  }
} else if (cmd === 'product') {
  // A product page from web research (facts only, prices checked on the shop's page): pnpm engine product <brand> <model> --category loc [--type treo]
  // --redo: rewrite the page from the research already kept (engine-state/products), no new searching.
  const [brand, model] = positionals.slice(1)
  const kit = (await readKit(join(ROOT, 'content'))).find(k => k.category === values.category)
  if (!brand || !model || !kit) throw new Error('usage: pnpm engine product <brand> <model> --category <equipment id> [--type <type id>]')
  const type = kit.types.find(t => t.id === values.type)
  // Redirects are followed one hop at a time, never to a marketplace nor a source read only at the engine's pace.
  const get = researchedPage(ROOT)
  const r = await makeProduct(join(ROOT, 'content'), { research: claudeResearch, llm: claudeCli, get, now: () => new Date() }, { brand, model, category: kit.category, ...(type ? { type: type.id } : {}), kind: type?.name ?? kit.name }, { researchModel: process.env.RESEARCH_MODEL ?? 'opus', factsDir: join(ROOT, 'engine-state/products'), reuse: values.redo })
  console.log(JSON.stringify(r, null, 1))
} else if (cmd === 'product-candidates') {
  // The products to write or refresh, most wanted first (product-reviews.ts): pnpm engine product-candidates [--limit N]
  for (const c of (await productCandidates(join(ROOT, 'content'))).slice(0, Number(values.limit ?? 40))) console.log(`${c.tier} ${String(c.links).padStart(4)} ${c.id} (${c.brand} ${c.model}, ${c.ask.category})`)
} else if (cmd === 'product-reviews') {
  // What YouTube reviews found, on product pages: the next --limit products of the candidates (a page first when one has none).
  // --only id,id: these; --no-new-pages: no long research call now; --dry-run: print, write nothing.
  const get = researchedPage(ROOT)
  const r = await productReviews(ROOT, { find: ytFinder, yt: youtube(), llm: claudeCli, research: claudeResearch, get, sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date() }, {
    limit: Number(values.limit ?? 1), ...(values.only ? { only: values.only.split(',') } : {}), ...(values['no-new-pages'] ? { noNewPages: true } : {}), ...(values['dry-run'] ? { dryRun: true } : {}),
    researchModel: process.env.RESEARCH_MODEL ?? 'opus', ...(process.env.REVIEW_EXTRACT_MODEL ? { extractModel: process.env.REVIEW_EXTRACT_MODEL } : {}), ...(process.env.REVIEW_WRITE_MODEL ? { writeModel: process.env.REVIEW_WRITE_MODEL } : {}),
  })
  for (const d of r.done) console.log(values['dry-run'] ? JSON.stringify(d, null, 1) : `product-reviews: ${d.id}: ${d.written ? 'written' : d.note}, ${d.videos.length} reviews, ${d.calls} model calls${d.renamed?.length ? `, renamed ${d.renamed.join(', ')}` : ''}`)
  for (const s of r.skipped) console.log(`skipped: ${s}`)
  if (r.stopped) console.log(`stopped: ${r.stopped}`)
} else if (cmd === 'video-stills') {
  // Older video guides' stills (storyboard tiles) become the video's own frames, screened as a new guide's, and their
  // times the seconds they show (video-stills.ts). First, every full-size still gets its sharpness (still-sharpness.ts).
  const fetchStill = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return new Uint8Array(await res.arrayBuffer()) }
  const sc = await scoreStills(ROOT, fetchStill)
  console.log(`still sharpness: ${sc.scored} measured in ${sc.guides} guides, ${sc.failed} failed`)
  const r = await videoStills(ROOT, {
    frames: ytFrames, grab: ytGrab, faces: visionFaces, read: files => visionText(files), media: media(), now: () => new Date(),
    get: fetchStill,
    look: (file, prompt) => claudeVision({ system: 'You spot watermarks on photos. Reply only with JSON.', prompt, schema: WATERMARK_SCHEMA, file, model: process.env.WATERMARK_MODEL ?? 'opus' }),
    judge: guidePhotoLook,
  }, { limit: Number(values.limit ?? 15), ...(values.only ? { only: values.only.split(',').map(x => x.trim()).filter(Boolean) } : {}) })
  for (const x of [...r.done, ...r.dropped.map(x => `dropped: ${x}`), ...r.kept.map(x => `kept as a tile: ${x}`), ...r.failed.map(x => `failed: ${x}`)]) console.log(x)
  console.log(`video-stills: ${r.done.length} guides, ${r.dropped.length} stills dropped, ${r.kept.length} kept as tiles, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
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
  // screened): pnpm engine gallery [--sheets N (model calls, default 40)] [--only <species, plant or breed id>] [--shard i/n (n runs at once)]
  const env = (k: string) => (process.env[k] ? Number(process.env[k]) : undefined)
  const budget = Object.fromEntries((['inat', 'gbif', 'openverse'] as const).flatMap(k => (env(`GALLERY_${k.toUpperCase()}`) === undefined ? [] : [[k, env(`GALLERY_${k.toUpperCase()}`)!]])))
  const r = await galleries(ROOT, { ...galleryDeps(), openverse: await openverseApi() }, { sheets: values.sheets ? Number(values.sheets) : 40, ...(values.only ? { only: values.only } : {}), ...(values.shard ? { shard: values.shard.split('/').map(Number) as [number, number] } : {}), budget })
  console.log(`gallery: ${r.done.length} pages, ${r.sheets} sheets, added ${JSON.stringify(r.added)}, ${r.short.length} short of target, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.done, ...r.failed]) console.log(x)
} else if (cmd === 'album-ask') {
  // Each album photo asked once whether it shows a photo tank or a ruler, the whole fish, a fish filling a small part of
  // it (album-ask.ts); its own line in ceilings.json. pnpm engine album-ask [--sheets N (model calls, default 20)]
  const a = await askAlbums(ROOT, { get: galleryDeps().get, ask: (file, prompt, plant) => claudeVision<{ tiles: AskTile[] }>({ system: 'You look at photos for the photo albums of an aquarium handbook. Reply only with JSON.', prompt, schema: askSchema(plant), file, model: process.env.ALBUM_ASK_MODEL }) }, { sheets: values.sheets ? Number(values.sheets) : 20 })
  console.log(`album-ask: ${a.sheets} sheets, ${a.answered} photos answered (${a.setup} photo tank or ruler, ${a.cut} cut by the frame, ${a.small} filling a small part of it), ${a.left} left, ${a.failed.length} failed${a.stopped ? ` (stopped: ${a.stopped})` : ''}`)
  for (const x of a.failed) console.log(x)
} else if (cmd === 'breed-photos') {
  // Photos for breed pages that have none (a word search on Commons): pnpm engine breed-photos [--limit N]
  const r = await breedPhotos(ROOT, galleryDeps(), { limit: values.limit ? Number(values.limit) : 10 })
  console.log(`breed-photos: ${r.done.length} breeds, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.done, ...r.failed]) console.log(x)
} else if (cmd === 'planting') {
  // Where it goes and how to plant it, for plant pages that say neither (planting.ts): written from the page and the
  // video guides that cover the plant, reviewed, kept at the bar; each plant once. pnpm engine planting [--limit N] [--only id,id] [--redo]
  const r = await writePlanting(ROOT, claudeCli, { limit: Number(values.limit ?? 5), ...(values.only ? { only: values.only.split(',') } : {}), redo: !!values.redo, model: process.env.PLANTING_MODEL ?? 'opus' })
  console.log(`planting: ${r.written.length} written, ${r.none.length} with nothing to go on, ${r.low.length} under the bar, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.written.map(x => `written: ${x}`), ...r.none.map(x => `nothing to go on: ${x}`), ...r.low.map(x => `under the bar: ${x}`), ...r.failed.map(x => `failed: ${x}`)]) console.log(x)
} else if (cmd === 'breed-care') {
  // Difficulty and lifespan for breed pages whose card lacks either, from their own sources: a research call a breed,
  // once (engine-state/_breed-care.json). pnpm engine breed-care [--only id,id] [--limit N]
  const r = await breedCare(ROOT, claudeResearch, { ...(values.only ? { only: values.only.split(',') } : {}), ...(values.limit ? { limit: Number(values.limit) } : {}) })
  console.log(`breed-care: ${r.done.length} breeds given figures, ${r.none.length} with none found, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of [...r.done, ...r.none, ...r.failed]) console.log(x)
} else if (cmd === 'unsplash') {
  // Unsplash photos for the galleries of the staples, breeds and popular species, after linking the photographer's page of
  // those stored without one: pnpm engine unsplash [--limit N]
  const key = process.env.UNSPLASH_ACCESS_KEY || (() => { try { return readFileSync(join(homedir(), '.config/aquatome/unsplash-key'), 'utf8').trim() } catch { return '' } })()
  if (!key) { console.log('unsplash: no UNSPLASH_ACCESS_KEY, skipped'); process.exit(0) }
  const api: UnsplashApi = async url => {
    const res = await fetch(url, { headers: { authorization: `Client-ID ${key}`, 'accept-version': 'v1' } })
    if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`)
    return { json: await res.json(), remaining: Number(res.headers.get('x-ratelimit-remaining') ?? Infinity) }
  }
  // First the photographer's page for photos stored without one (their credit links it), then the searches with what the hour has left.
  const c = await unsplashCredits(ROOT, api)
  console.log(`unsplash credits: ${c.filled} photos linked to their photographer, ${c.left} left, ${c.failed.length} failed${c.stopped ? ` (stopped: ${c.stopped})` : ''}`)
  for (const x of c.failed) console.log(x)
  const r = await unsplashPhotos(ROOT, api, galleryDeps(), { limit: values.limit ? Number(values.limit) : 6, remaining: c.remaining })
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
    console.log(`facebook: blocked since ${blockedAt}: log into the spare account in ~/.cache/aquatome/chrome-profile, then run pnpm engine facebook --retry-blocked`)
  } else {
    const fetcher = new ChromeFetcher({ profileDir: process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/aquatome/chrome-profile') })
    await fetcher.open()
    try {
      const m = media()
      const r = await collect(ROOT, chromeFb(fetcher), { putRaw: m.putRaw, sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date() }, { maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : values.backfill ? 600 : 45, maxPhotos: values.backfill ? 3000 : 150, maxScrolls: values.backfill ? 2000 : 30, backfill: values.backfill })
      console.log(`facebook: ${r.newPosts} new posts, ${r.newAlbums} new albums, ${r.stored} photos stored, ${r.failed.length} failed`)
      for (const f of r.failed) console.log(`failed: ${f}`)
      for (const w of r.warnings) console.log(`warning: ${w}`)
      if (r.blocked) console.log(`facebook: ${r.blocked} wall — log into the spare account in ~/.cache/aquatome/chrome-profile, then run pnpm engine facebook --retry-blocked`)
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
} else if (cmd === 'species') {
  // A page for a species no licensed source covers, from web research, the videos given as primary sources:
  // pnpm engine species "<scientific name>" [--video <id>,<id>] [--redo]. --redo: rewrite it from the research kept
  // (engine-state/species-research), no new searching.
  const name = positionals.slice(1).join(' ').trim()
  if (!/^[A-Z][a-z]+ [a-z-]+$/.test(name)) throw new Error('usage: pnpm engine species "<Genus species>" [--video <id>,<id>] [--redo]')
  const yt = youtube()
  const videos: VideoSource[] = []
  for (const id of values.video?.split(',').map(s => s.trim()).filter(Boolean) ?? []) {
    const meta = await yt.video(id)
    const transcript = (await yt.transcript(id, meta.lang)) ?? (await yt.transcribe?.(id, meta.lang)) ?? ''
    videos.push({ meta, transcript })
  }
  const r = await makeSpecies(ROOT, { research: claudeResearch, llm: claudeCli, http, now: () => new Date(), findVideos: async names => findVideos(names, claudeCli, http, { skip: await readVideoRejected(ROOT) }) }, { name, videos }, { researchModel: process.env.RESEARCH_MODEL ?? 'opus', reuse: values.redo })
  console.log(JSON.stringify(r, null, 1))
} else if (cmd === 'species-videos') {
  // The species-profile channels' videos (species-videos.ts PROFILE_CHANNELS) into species and plant pages: new uploads
  // vetted by title once, then --limit profiles a run (default 3), each tried once (engine-state/_species-videos.json): a
  // new page for its species, or what it adds to its page. --only id,id: these videos now, the owner's picks.
  const r = await speciesVideos(ROOT, { research: claudeResearch, llm: claudeCli, http, now: () => new Date(), findVideos: async names => findVideos(names, claudeCli, http, { skip: await readVideoRejected(ROOT) }), yt: youtube(), find: ytFinder }, { ...(values.only ? { only: values.only.split(',').map(s => s.trim()).filter(Boolean) } : {}), ...(values.limit ? { limit: Number(values.limit) } : {}), ...(values.channels ? { channels: values.channels.split(',') } : {}), researchModel: process.env.RESEARCH_MODEL ?? 'opus' })
  console.log(`species-videos: ${r.vetted} uploads vetted, ${r.done.length} done, ${r.skipped.length} skipped, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const l of [...r.done, ...r.skipped, ...r.failed]) console.log(l)
} else if (cmd === 'forum') {
  // Diễn Đàn Cá Cảnh's guide sections, read for orientation: notes on each thread (translated or original, the original it
  // names, Vietnamese terms), never its text. pnpm engine forum [--limit threads] [--pages list pages] [--match section regex]
  const get = async (u: string) => { const res = await fetch(u, { headers: { 'user-agent': UA } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text() }
  const sections = values.match ? FORUM_SECTIONS.filter(s => new RegExp(values.match!, 'i').test(s)) : undefined
  const r = await readForum(ROOT, { get, llm: claudeCli, sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date() }, { limit: Number(values.limit ?? 10), pages: Number(values.pages ?? 5), sections, extra: [CLASSIFICATION_THREAD] })
  console.log(`forum: ${r.listed} list pages read, ${r.found} threads found, ${r.read.length} read, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}\n${[...r.read, ...r.failed].join('\n')}`)
} else if (cmd === 'ideas') {
  // Vietnamese shops' blogs, read for ideas (their posts' titles, never their text), a week apart unless --force: the
  // topics the handbook has no guide on, most asked first, in engine-state/_ideas.json. pnpm engine ideas [--force]
  // [--retry-blocked]: a site that refused us its listing is fetched again only with --retry-blocked.
  const get = async (u: string) => listingText(await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) }))
  const r = await refreshIdeas(ROOT, { get, llm: claudeCli, sleep: ms => new Promise(res => setTimeout(res, ms)), now: () => new Date() }, { force: values.force, retryBlocked: values['retry-blocked'] })
  const s = await readIdeas(ROOT)
  console.log(r.fresh ? `ideas: read ${s.readAt}, still fresh` : `ideas: ${r.posts} posts, ${r.ideas} new ideas${r.failed.length ? `; failed: ${r.failed.join('; ')}` : ''}`)
  // Each rule's count and the posts kept: the owner's figure for the magazine; and each title a rule left out (the chief of
  // staff, 14 Nov 2026).
  for (const [id, l] of Object.entries(r.listed)) {
    if (!Object.keys(l.dropped).length) continue
    console.log(`ideas: ${id}: ${l.kept} posts kept; left out: ${Object.entries(l.dropped).map(([rule, n]) => `${rule} ${n}`).join(', ')}`)
    for (const [rule, titles] of Object.entries(l.titles)) for (const t of titles) console.log(`ideas: ${id}: left out (${rule}): ${t}`)
  }
  const refused = [...r.needsHuman, ...r.blocked]
  if (refused.length) console.log(`ideas: needs-human: ${refused.join(', ')} refused us its listing (a 403 or a 429, or an answer that isn't its listing); its last titles stand and it isn't fetched again. Once the owner has looked: pnpm engine ideas --force --retry-blocked`)
  for (const i of s.ideas.filter(x => !x.guide && !x.skipped).slice(0, 15)) console.log(`${i.sites} sites, ${i.posts.length} posts: ${i.topic} (${i.kind})`)
} else if (cmd === 'write-ideas') {
  // AquaTome's own guides on the most asked ideas (engine ideas), researched as pnpm engine topic is: --limit a day (Vietnam's).
  const r = await writeIdeas(ROOT, { research: claudeResearch, llm: claudeCli, now: () => new Date() }, { perDay: Number(values.limit ?? 2), researchModel: process.env.RESEARCH_MODEL ?? 'opus' })
  console.log(`write-ideas: ${r.written.length} written, ${r.skipped.length} skipped, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}\n${[...r.written, ...r.skipped, ...r.failed].join('\n')}`)
  if (r.magazine.length) console.log(`write-ideas: on the magazine's ideas: ${r.magazine.join('; ')}`)
} else if (cmd === 'topic') {
  // A guide AquaTome writes itself from web research: pnpm engine topic "<chủ đề tiếng Việt>" --kind disease|care|setup|plantCare|breeding|aquascaping|discovery [--redo]
  // --redo: rewrite the guide from the research already kept (engine-state/topics), no new searching.
  const topic = positionals.slice(1).join(' ').trim()
  const kinds = ['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery'] as const
  const kind = values.kind as (typeof kinds)[number] | undefined
  if (!topic || !kind || !kinds.includes(kind)) throw new Error(`usage: pnpm engine topic "<chủ đề>" --kind ${kinds.join('|')} [--redo]`)
  const r = await makeTopic(ROOT, { research: claudeResearch, llm: claudeCli }, { topic, kind }, { researchModel: process.env.RESEARCH_MODEL ?? 'opus', reuse: values.redo })
  console.log(JSON.stringify(r, null, 1))
} else if (cmd === 'material') {
  // A hobby material's page (lũa, đá, nền), written from web research and checked like a guide (materials.ts):
  // pnpm engine material <id> [--redo]. Its id, address and names are in MATERIALS. --redo: write again from the research
  // already kept (engine-state/materials), no new searching.
  const a = MATERIALS.find(m => m.id === positionals[1])
  if (!a) throw new Error(`usage: pnpm engine material ${MATERIALS.map(m => m.id).join('|')} [--redo]`)
  const r = await makeMaterial(ROOT, { research: claudeResearch, llm: claudeCli }, a, { researchModel: process.env.RESEARCH_MODEL ?? 'opus', reuse: values.redo })
  console.log(JSON.stringify(r, null, 1))
} else if (cmd === 'glossary-entry') {
  // A glossary term's fuller entry, written from web research and checked like a guide (glossary-entry.ts):
  // pnpm engine glossary-entry <term id> --kind setup|care|breeding|disease|aquascaping|plantCare|discovery [--sf <Seriously Fish glossary slug>] [--redo | --fresh]
  // --redo: write again from the research already kept (engine-state/glossary), no new searching.
  // Without --redo, new research adds to what was kept; --fresh starts over.
  // --from-draft: revise the draft kept below the bar, sentence by sentence, from its research. --accept "<who>": save that
  // draft as it is, on that reader's word, if its notes are only repetition, order or length (refusals). --revise: the same
  // for the saved entry, with one rewrite on its notes.
  const id = positionals[1]
  const kinds = ['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery'] as const
  const kind = values.kind as (typeof kinds)[number] | undefined
  if (!id || !kind || !kinds.includes(kind)) throw new Error(`usage: pnpm engine glossary-entry <term id> --kind ${kinds.join('|')} [--sf <slug>] [--redo | --fresh | --from-draft | --revise | --accept "<who>"]`)
  if (values.accept !== undefined && !values.accept.trim()) throw new Error('--accept needs who accepts the draft')
  // Research never reads a source the engine reads only at its own pace (cycle-only.ts).
  const r = await makeGlossaryEntry(ROOT, { research: claudeResearch, llm: claudeCli }, id, { kind, sf: values.sf, reuse: values.redo, fresh: values.fresh, fromDraft: values['from-draft'], revise: values.revise, ...(values.accept ? { accept: values.accept.trim() } : {}), researchModel: process.env.RESEARCH_MODEL ?? 'opus' })
  console.log(JSON.stringify(r, null, 1))
} else if (cmd === 'covers') {
  // Vietnamese thumbnail labels: pnpm engine covers [--redo] [--limit N] (--redo rewrites the ones already there).
  await covers({ redo: values.redo, limit: values.limit ? Number(values.limit) : undefined })
} else if (cmd === 'rewrite-vi') {
  // Existing Vietnamese rewritten in the site's style, pages out of search for their score first, then worst-read kinds
  // first, each page once, reviewer-gated:
  // pnpm engine rewrite-vi [--limit N] [--only guides,species,plants,glossary] [--match <regex>: re-edit pages containing it]
  //   [--phrases: re-edit pages with a phrase from the Vietnamese list (phrases.ts)] [--dry-run: list the pages and parts, no model call]
  //   [--first species/<id>,…: these first, in this order, when due]
  const kinds = values.only?.split(',').filter((k): k is (typeof REWRITE_KINDS)[number] => (REWRITE_KINDS as readonly string[]).includes(k))
  const match = values.phrases ? phraseMatch('vi') : values.match ? new RegExp(values.match, 'i') : undefined
  const r = await rewriteExisting(join(ROOT, 'content'), join(ROOT, 'engine-state/vi-rewrite.json'), { llm: claudeCli, opts: VI_WRITE, now: () => new Date() }, { limit: values.limit ? Number(values.limit) : 10, kinds, ...(match ? { match } : {}), dry: values['dry-run'], ...(values.first ? { first: values.first.split(',') } : {}) })
  if (values['dry-run']) console.log(`rewrite-vi (dry run): ${r.done.length} pages, ${r.done.reduce((n, x) => n + Number(/\((\d+) parts?\)/.exec(x)?.[1] ?? 0), 0)} parts, each a write and a review (and a second try under the bar)`)
  else console.log(`rewrite-vi: ${r.done.length} rewritten, ${r.kept.length} kept as they were, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ''}`)
  for (const x of r.done) console.log(`${values['dry-run'] ? 'would rewrite' : 'rewritten'}: ${x}`)
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
  console.log(`playlists: ${r.candidates} candidates, ${r.added.length} added, ${r.rejected} rejected, ${r.errors.length} errors${r.skipped ? ` (searches skipped: ${r.skipped})` : ''}`)
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
  // Species pages in another language, translated from their English sources: --only ids; --top N of the most-read;
  // else every species, most-read first, making at most --limit pages (default 10). Pages done and current are skipped.
  // --kind plants: plant pages instead, every plant (there is no reading-rank for plants).
  const lang = values.lang as TargetLang
  const kind = values.kind === 'plants' ? 'plants' : 'species'
  if (!(lang in TARGETS) || (values.kind && values.kind !== kind)) throw new Error(`usage: pnpm engine localize --lang ${WRITTEN_OTHER_LANGS.join('|')} [--kind plants] [--only id,id | --top N] [--limit N] [--redo]`)
  const all = await readdir(join(ROOT, 'content', kind))
  const ranked = kind === 'plants' ? [...all].sort() : await speciesOrder(ROOT, lang)
  const ids = values.only?.split(',').map(s => s.trim()).filter(Boolean) ?? (values.top ? ranked.slice(0, Number(values.top)) : ranked)
  const limit = values.only || values.top ? undefined : Number(values.limit ?? 10)
  const r = await localizeSpecies(ROOT, claudeCli, lang, ids, { redo: values.redo, model: 'opus', now: () => new Date(), english: sci => englishName(sci, http), limit, kind })
  console.log(`localize ${lang}: ${r.done.length} done, ${r.skipped.length} skipped, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.done, ...r.failed].join('\n')}`)
} else if (cmd === 'localize-cards') {
  // The app's short cards in another language, translated from the Vietnamese card (cards-intl.ts): each not yet in it, or
  // --only ids; --redo writes them again.
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error(`usage: pnpm engine localize-cards --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only id,id] [--redo]`)
  const only = values.only?.split(',').map(s => s.trim()).filter(Boolean)
  for (const r of await localizeCards(ROOT, claudeCli, lang, { redo: values.redo, ...(only ? { only } : {}) })) console.log(JSON.stringify(r))
} else if (cmd === 'localize-breeds') {
  // Breed pages (hybrids, lines) in another language, written from their saved research (--only ids; --redo).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error(`usage: pnpm engine localize-breeds --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only id,id] [--limit N] [--redo]`)
  const researched = (await readdir(join(ROOT, 'engine-state/breeds')).catch(() => [] as string[])).map(f => f.replace(/\.json$/, ''))
  const pages = await readdir(join(ROOT, 'content/breeds')).catch(() => [] as string[])
  // Khám phá's top cards without a page in the language first, earliest week first (the chief of staff, 2026-11-11).
  const ready = researched.filter(id => pages.includes(id)).sort()
  const heroes = (await heroesWithout(ROOT, lang, 'breeds', new Date().toISOString().slice(0, 10))).filter(id => ready.includes(id))
  const ids = values.only?.split(',').map(s => s.trim()).filter(Boolean) ?? [...new Set([...heroes, ...ready])]
  let made = 0
  for (const id of ids) {
    if (made >= Number(values.limit ?? 40)) break
    const r = await localizeBreed(ROOT, claudeCli, id, lang, { redo: values.redo }).catch(e => ({ id, failed: (e as Error).message.slice(0, 200) }))
    if (!('skipped' in r)) made++
    console.log(JSON.stringify(r))
  }
} else if (cmd === 'localize-guides') {
  // AquaTome's own guides in another language, written from their saved research (--only ids; --redo).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error(`usage: pnpm engine localize-guides --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only id,id] [--limit N] [--redo]`)
  const researched = (await readdir(join(ROOT, 'engine-state/topics')).catch(() => [] as string[])).map(f => f.replace(/\.json$/, '')).sort()
  const ids = values.only?.split(',').map(s => s.trim()).filter(Boolean) ?? researched
  // First the copies to write again (seasons.ts copiesToRedo): one naming a season its readers don't have, or read as
  // advice for a reader elsewhere, each at most twice, its tries kept in engine-state/_guide-copy-redo.json.
  const redoFile = join(ROOT, 'engine-state/_guide-copy-redo.json')
  const redone = JSON.parse(await readFile(redoFile, 'utf8').catch(() => '{}')) as Redone
  const fit = JSON.parse(await readFile(join(ROOT, 'engine-state/_fit.json'), 'utf8').catch(() => '{}')) as FitState
  const again = values.only ? [] : copiesToRedo(await loadPages(join(ROOT, 'content'), [lang]), lang, fit, redone).filter(id => researched.includes(id))
  const limit = Number(values.limit ?? 20)
  const first = await redoCopies(again, lang, redone, {
    limit, write: id => localizeTopic(ROOT, claudeCli, id, lang, { redo: true }), log: x => console.log(JSON.stringify(x)),
    save: r => writeFile(redoFile, `${JSON.stringify(Object.fromEntries(Object.entries(r).sort(([x], [y]) => x.localeCompare(y))), null, 1)}\n`),
  })
  let made = first.made
  for (const id of ids) {
    if (first.stopped || made >= limit) break
    const r = await localizeTopic(ROOT, claudeCli, id, lang, { redo: values.redo }).catch(e => (e instanceof LlmError && errorKind(e.message) === 'usage' ? { id, stopped: e.message } : { id, failed: (e as Error).message.slice(0, 200) }))
    if ('stopped' in r) { console.log(JSON.stringify(r)); break }
    if (!('skipped' in r)) made++
    console.log(JSON.stringify(r))
  }
} else if (cmd === 'localize-glossary') {
  // Glossary terms in another language, from the Vietnamese entries: every term not yet done (--redo: all of them; --only ids).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error(`usage: pnpm engine localize-glossary --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only ids] [--redo]`)
  const r = await localizeGlossary(ROOT, claudeCli, lang, { redo: values.redo, model: 'opus', only: values.only?.split(',').map(s => s.trim()).filter(Boolean) })
  console.log(`localize-glossary ${lang}: ${r.done.length} done, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.reviews, ...r.failed].join('\n')}`)
} else if (cmd === 'name-places-vi') {
  // Vietnamese names for rivers and regions, the ones readers use (place-names.ts): every place not yet named (--redo: all of them).
  const r = await namePlacesVi(ROOT, claudeCli, { redo: values.redo, model: 'opus' })
  console.log(`name-places-vi: ${r.done.length} done, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.reviews, ...r.failed].join('\n')}`)
} else if (cmd === 'localize-places') {
  // Place names in another language (the origin pages): every place not yet named (--redo: all of them).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error(`usage: pnpm engine localize-places --lang ${WRITTEN_OTHER_LANGS.join('|')} [--redo]`)
  const r = await localizePlaces(ROOT, claudeCli, lang, { redo: values.redo, model: 'opus' })
  console.log(`localize-places ${lang}: ${r.done.length} done, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.reviews, ...r.failed].join('\n')}`)
} else if (cmd === 'localize-captions') {
  // Vietnamese photo captions (galleries, breed photos) in another language, for the pages that language has.
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error(`usage: pnpm engine localize-captions --lang ${WRITTEN_OTHER_LANGS.join('|')} [--limit N]`)
  const r = await localizeCaptions(ROOT, claudeCli, lang, { limit: values.limit ? Number(values.limit) : undefined })
  console.log(`localize-captions ${lang}: ${r.done.length} pages done, ${r.left} left, ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}\n${[...r.done, ...r.failed].join('\n')}`)
} else if (cmd === 'wikidata-names') {
  // The names Wikidata gives each species in another language, added to its page's other names where no other page uses them.
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error(`usage: pnpm engine wikidata-names --lang ${WRITTEN_OTHER_LANGS.join('|')}`)
  const added = await addWikidataNames(ROOT, http, lang)
  console.log(`wikidata-names ${lang}: ${added.length} pages\n${added.join('\n')}`)
} else if (cmd === 'plant-synonyms') {
  // Each plant's other scientific names (old genus, GBIF's, a hobby name), which the site links, checks and searches as its own.
  const r = await addPlantSynonyms(ROOT, http)
  console.log(`plant-synonyms: ${r.changed.length} pages${r.failed.length ? `, GBIF failed on ${r.failed.length} (tried again next run)` : ''}\n${r.changed.join('\n')}`)
} else if (cmd === 'fish-synonyms') {
  // Each fish's older scientific names from GBIF, kept so each is asked once (fish-synonyms.ts). pnpm engine fish-synonyms [--limit 300]
  const r = await fetchFishSynonyms(ROOT, http, { limit: values.limit ? Number(values.limit) : 300 })
  console.log(`fish-synonyms: ${r.asked} fish asked, ${r.left} left, GBIF failed on ${r.failed.length} (asked again next run); ${(await fishOlderNames(ROOT)).size} fish with older names${r.failed.length ? `\n${r.failed.slice(0, 10).join('\n')}` : ''}`)
} else if (cmd === 'shop-list') {
  // What fish (or plant) shops in the language's country sell, from their own lists (web research, never marketplaces):
  // pnpm engine shop-list --lang vi|id|th|ms [--kind plants] [--seed file.json (an array of trade names from one shop's list)]
  const lang = values.lang as ShopLang
  if (!WRITTEN_LANGS.includes(lang) || (values.kind && values.kind !== 'plants')) throw new Error(`usage: pnpm engine shop-list --lang ${WRITTEN_LANGS.join('|')} [--kind plants] [--seed file.json]`)
  const seed = values.seed ? (JSON.parse(await readFile(values.seed, 'utf8')) as string[]) : undefined
  const r = await makeShopList(ROOT, claudeResearch, lang, { seed, model: process.env.RESEARCH_MODEL ?? 'opus', now: () => new Date(), ...(values.kind === 'plants' ? { goods: 'plants' as const } : {}) })
  const unmapped = r.items.filter(i => !i.scientificName)
  console.log(`shop-list ${lang}: ${r.items.length} items, ${r.items.length - unmapped.length} mapped, ${r.sources.length} sources\nunmapped: ${unmapped.map(i => i.trade).join('; ')}`)
} else if (cmd === 'shop-names') {
  // The names shops use, added to the language's species pages as other names (engine-state/shop-lists/<lang>.json).
  const lang = values.lang as ShopLang
  if (!WRITTEN_LANGS.includes(lang)) throw new Error(`usage: pnpm engine shop-names --lang ${WRITTEN_LANGS.join('|')}`)
  const added = await addShopNames(ROOT, lang)
  console.log(`shop-names ${lang}: ${added.length} pages\n${added.join('\n')}`)
} else if (cmd === 'localize-equipment') {
  // The equipment buying guides in another language (--only categories; --redo; --limit N: at most N made).
  const lang = values.lang as TargetLang
  if (!(lang in TARGETS)) throw new Error(`usage: pnpm engine localize-equipment --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only cat,cat] [--redo] [--limit N]`)
  const r = await localizeEquipment(ROOT, claudeCli, lang, { only: values.only?.split(',').map(s => s.trim()).filter(Boolean), redo: values.redo, limit: values.limit ? Number(values.limit) : undefined })
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
  console.log(`usage: pnpm engine run [--sources a,b | --except a,b] [--limit N] [--max-minutes M] [--only <url regex> [--force]] [--retry-blocked] | pnpm engine moderate | pnpm engine summaries [--top N] [--jobs N] [--only id,id] | pnpm engine summaries approve <id,id|all> | pnpm engine traits [--limit N] [--only id,id] | pnpm engine range [--limit N] [--records N] [--only id,id] | pnpm engine water [--limit N] [--only id,id] | pnpm engine topic-check [--limit N] [--only id,id] | pnpm engine source-kinds [--only id,id] [--dry-run] | pnpm engine review-backfill [--kind ${BACKFILL_KINDS.join(',')}] [--limit N] [--only id,id | --reviewed-before <ISO time>] [--parallel N] | pnpm engine video-hold --class ${HOLD_CLASSES.join('|')} [--clear] | pnpm engine reviews | pnpm engine videos [--playlist ID,ID] [--limit N] [--max-minutes M] [--redo [--rechecked-since <ISO time> [--parallel N]]] [--only videoId,videoId] | pnpm engine discover-videos [--channels a,b | --lang vi] [--limit N] [--force] | pnpm engine youtube-add <url>... | pnpm engine product <brand> <model> --category C [--type T] | pnpm engine product-candidates [--limit N] | pnpm engine product-reviews [--limit N] [--only id,id] [--no-new-pages] [--dry-run] | pnpm engine video-items [--limit N] | pnpm engine gallery [--sheets N] [--only id] [--shard i/n] | pnpm engine facebook [--limit N] [--max-minutes M] [--retry-blocked] [--backfill] | pnpm engine unsplash [--limit N] | pnpm engine breed-photos [--limit N] | pnpm engine breed-care [--only id,id] [--limit N] | pnpm engine breed "<name>" [--kind K] [--based-on id] [--redo] | pnpm engine topic "<chủ đề>" --kind K [--redo] | pnpm engine species "<Genus species>" [--video id,id] [--redo] | pnpm engine species-videos [--only id,id] [--limit N] [--channels a,b] | pnpm engine ideas [--force] [--retry-blocked] | pnpm engine write-ideas [--limit N a day] | pnpm engine covers [--redo] [--limit N] | pnpm engine rewrite-vi [--limit N] [--only kinds] | pnpm engine thumbs | pnpm engine picture-hashes [--limit N] [--jobs N] | pnpm engine photos [--limit N] [--kind species,plants,guides] [--only id,id] | pnpm engine mirror-photos [--limit N] [--dry-run] | pnpm engine fishbase-photos | pnpm engine crypts-photos | pnpm engine tropica-photos [--limit N] | pnpm engine own-photos <list.json> | pnpm engine faces | pnpm engine photo-boxes [--limit N] | pnpm engine watermarks [--limit N] [--parallel N] | pnpm engine check-photos [--limit N] [--fill N] [--parallel N] [--only id] | pnpm engine guide-photos [--limit N] [--parallel N] | pnpm engine audit [--fix] | pnpm engine reader [--limit N] [--rewrites N] [--only lang/kind/id,…] | pnpm engine fit [--limit N] [--jobs N] [--kind guides,species] [--lang id,th] [--only vi/species/<id>,…] [--front] | pnpm engine fit-rewrite [--limit N] [--only vi/species/<id>,…] [--kind species,guides] [--front] | pnpm engine units-mend [--limit N] [--first lang/kind/id,…] [--dry-run] | pnpm engine source-figures [--limit N] [--first lang/kind/id,…] [--dry-run] | pnpm engine source-figures --record | pnpm engine metric | pnpm engine ungarble [--limit N] | pnpm engine redo-unread | pnpm engine localize --lang ${WRITTEN_OTHER_LANGS.join('|')} [--kind plants] [--only ids | --top N] [--limit N] [--redo] | pnpm engine localize-guides --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only ids] [--limit N] [--redo] | pnpm engine localize-breeds --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only ids] [--limit N] [--redo] | pnpm engine localize-glossary --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only ids] [--redo] | pnpm engine localize-places --lang ${WRITTEN_OTHER_LANGS.join('|')} [--redo] | pnpm engine localize-captions --lang ${WRITTEN_OTHER_LANGS.join('|')} [--limit N] | pnpm engine wikidata-names --lang ${WRITTEN_OTHER_LANGS.join('|')} | pnpm engine localize-equipment --lang ${WRITTEN_OTHER_LANGS.join('|')} [--only cats] [--redo] | pnpm engine status`)
  process.exitCode = 1
}
