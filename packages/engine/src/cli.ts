import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadAll, SOURCE_IDS, type SourceId } from '@aq/schema'
import { claudeCli, claudeVision } from './claude'
import { auditPictures } from './audit'
import { dropFacePhotos, visionFaces } from './faces'
import { backfillPhotos } from './photo-backfill'
import { ChromeFetcher } from './fetch'
import { r2Media } from './media'
import { httpAdmin, moderate } from './moderate'
import { httpPhotoAdmin, moderatePhotos, VERDICT_SCHEMA, type Verdict } from './reader-photos'
import { runEngine } from './run'
import { loadState } from './state'
import { approveSummaries, draftSummaries, reviewDoc } from './summaries'
import { backfillThumbs } from './thumbs'
import { extractTraits } from './traits'
import { discoverPlaylists } from './video-discovery'
import { videoGuides, ytDlp, ytFinder } from './youtube'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const UA = 'aquatome-engine/0.1 (https://aquatome.com)'
const http = async (url: string) => {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url).host}`)
  return r.json()
}

/** Media bucket credentials: env, else the owner's ~/.config/thuysinh files (never printed). */
const conf = (env: string, file: string) => process.env[env] ?? readFileSync(join(homedir(), '.config/thuysinh', file), 'utf8').trim()
const media = () => r2Media({
  accountId: conf('CF_ACCOUNT_ID', 'cf-account'), token: conf('CLOUDFLARE_API_TOKEN', 'cf-token'),
  bucket: process.env.MEDIA_BUCKET ?? 'thuysinh-media', publicBase: process.env.MEDIA_BASE ?? 'https://media.aquatome.com',
})

const { positionals, values } = parseArgs({ allowPositionals: true, options: { sources: { type: 'string' }, limit: { type: 'string' }, 'max-minutes': { type: 'string' }, only: { type: 'string' }, 'retry-blocked': { type: 'boolean' }, force: { type: 'boolean' }, top: { type: 'string' }, playlist: { type: 'string' } } })
const cmd = positionals[0]

if (cmd === 'run') {
  const sources = values.sources?.split(',').map(s => s.trim()) as SourceId[] | undefined
  const bad = sources?.filter(s => !(SOURCE_IDS as readonly string[]).includes(s))
  if (bad?.length) throw new Error(`unknown source(s): ${bad.join(', ')}`)
  if (values.force && !values.only) throw new Error('--force re-translates only the pages matched by --only')
  const profileDir = process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/thuysinh/chrome-profile')
  const fetcher = new ChromeFetcher({ profileDir })
  const startedAt = new Date().toISOString()
  await fetcher.open()
  try {
    const report = await runEngine(
      { fetcher, llm: claudeCli, http, media: media(), root: ROOT, now: () => new Date(), sleep: ms => new Promise(r => setTimeout(r, ms)) },
      { sources, limit: values.limit ? Number(values.limit) : undefined, maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : undefined, only: values.only ? new RegExp(values.only) : undefined, retryBlocked: values['retry-blocked'], force: values.force },
    )
    await mkdir(join(ROOT, 'engine-state'), { recursive: true })
    await writeFile(join(ROOT, 'engine-state/last-run.json'), `${JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), ...report }, null, 2)}\n`)
    console.table(report.perSource)
    if (report.needsHuman.length) console.log(`needs-human: ${report.needsHuman.join(', ')} — pass the browser check in the engine Chrome profile, then: pnpm engine run --sources <id> --retry-blocked`)
    for (const e of report.errors) console.log(`error: ${e}`)
    console.log(`changed: ${report.changed.length}`)
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
    { yt: ytDlp, llm: claudeCli, root: ROOT, now: () => new Date(), sleep: ms => new Promise(res => setTimeout(res, ms)) },
    { playlists: values.playlist?.split(',').map(s => s.trim()).filter(Boolean), limit: values.limit ? Number(values.limit) : undefined, maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : undefined },
  )
  console.log(`videos: ${r.written.length} written, ${r.skipped.length} skipped, ${r.errors.length} errors${r.stoppedEarly ? ' (stopped early)' : ''}`)
  for (const w of r.written) console.log(`written: ${w}`)
  for (const s of r.skipped) console.log(`skipped: ${s}`)
  for (const e of r.errors) console.log(`error: ${e}`)
} else if (cmd === 'discover-videos') {
  // More teaching playlists: YouTube playlist searches + known channels → overlap filter → model vets → engine-state/youtube-playlists.json.
  const r = await discoverPlaylists({ find: ytFinder, llm: claudeCli, root: ROOT, now: () => new Date() }, { maxNew: values.limit ? Number(values.limit) : undefined })
  console.log(r.skipped ? `discover-videos: skipped (${r.skipped})` : `discover-videos: ${r.candidates} candidates, ${r.added.length} added, ${r.rejected} rejected, ${r.errors.length} errors`)
  for (const a of r.added) console.log(`added: ${a}`)
  for (const e of r.errors) console.log(`error: ${e}`)
} else if (cmd === 'status') {
  const rows: Record<string, Record<string, number>> = {}
  for (const id of SOURCE_IDS) {
    const counts: Record<string, number> = {}
    for (const s of Object.values(await loadState(ROOT, id))) counts[s.status] = (counts[s.status] ?? 0) + 1
    rows[id] = counts
  }
  console.table(rows)
} else {
  console.log('usage: pnpm engine run [--sources a,b] [--limit N] [--max-minutes M] [--only <url regex> [--force]] [--retry-blocked] | pnpm engine moderate | pnpm engine summaries [--top N] | pnpm engine summaries approve <id,id|all> | pnpm engine traits [--limit N] | pnpm engine videos [--playlist ID,ID] [--limit N] [--max-minutes M] | pnpm engine discover-videos [--limit N] | pnpm engine thumbs | pnpm engine photos [--limit N] | pnpm engine faces | pnpm engine audit | pnpm engine status')
  process.exitCode = 1
}
