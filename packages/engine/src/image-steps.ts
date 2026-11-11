import { beforeDeadline } from './image-deadline'
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { IMAGE_SWITCHES, loadAll, POPULAR, realPhotosFirst, slugify, SourcesSchema, STAPLE_SPECIES, type GeneratedRecord, type ImageSwitches, type Photo, type SourceId } from '@aq/schema'
import type { NativeAttemptObserver } from './codex-images'
import { imageCache, meteredImage, type NativeImage, type QuotaReading } from './codex-images'
import { activeSourceConflicts, appearanceReference, calibrationReady, GENERATED_CHECK_MODEL, GENERATED_CHECK_SCHEMA, generatedCheckPrompt, generatedGateVersion, hasGenerationReference, positiveGeneratedVerdict, REFERENCE_CHECK_SCHEMA, referenceCheckPrompt, type ReferenceVerdict, referenceHash, referenceText, sourceConflicts, sha256, verifyCheckingImages, type AppearanceFact, type Calibration, type GeneratedVerdict, type ImageReference, type ImageConflict, type ReferenceEntity } from './image-reference'
import { generatedViews, pixelHash, noTraceCalibrationReady, noTraceVersion, type NoTraceCalibration, NO_TRACE_SCHEMA, type NoTraceVerdict } from './image-transforms'
import { primaryImageBytes, storeImageVariants, type ImageStore } from './image-publication'
import { canRemoveMark, removeSourceMark, upscalePhoto, type MarkEvidence } from './image-alterations'
import { PHOTO_CHECK_SCHEMA, subjectPrompt, type PhotoVerdict } from './photo-check'
import { recoverMarkedHistory } from './marked-photo-history'
import type { MarkCandidate } from './marked-photos'

export type ImagePage = { kind: 'species' | 'plants'; id: string; empty: boolean; popular: boolean; waitingReal: boolean }
/** An unjudged real image is work for the real-photo check, never justification for manufacturing its replacement. */
export async function imagePlan(root: string, switches: Readonly<ImageSwitches> = IMAGE_SWITCHES): Promise<ImagePage[]> {
  const c = await loadAll({ root: join(root, 'content'), lang: 'vi', publicBuild: true, leaveOutHeld: true, imageSwitches: switches })
  const judged = await json<Record<string, Record<string, PhotoVerdict>>>(join(root, 'engine-state/_photo-subjects.json'), {})
  const popular = new Set([...STAPLE_SPECIES, ...POPULAR.map(slugify)])
  const out: ImagePage[] = []
  for (const kind of ['species', 'plants'] as const) for (const p of c[kind]) {
    const gallery = JSON.parse(await readFile(join(root, 'content/gallery', `${p.id}.json`), 'utf8').catch(() => '{"photos":[]}')) as { photos: (Photo & { unchecked?: boolean })[] }
    const raw = await json<{ photos: Photo[] }>(join(root, 'content', kind, p.id, 'entity.json'), { photos: [] })
    const waitingReal = [...raw.photos, ...gallery.photos].some(photo => !photo.generated && (('unchecked' in photo && photo.unchecked) || !judged[photo.url]?.[p.id]?.ok || judged[photo.url]?.[p.id]?.person === undefined || judged[photo.url]?.[p.id]?.guide === true))
    const real = [...p.photos, ...(c.galleries[p.id] ?? [])].filter(p => !p.generated)
    out.push({ kind, id: p.id, empty: !real.length, popular: kind === 'species' && [p.id, slugify(p.scientificName), ...('synonyms' in p ? p.synonyms ?? [] : []).map(slugify)].some(id => popular.has(id)), waitingReal })
  }
  return out.sort((a, b) => Number(b.popular) - Number(a.popular) || a.id.localeCompare(b.id))
}
export const generationPurpose = (p: ImagePage, switches: Readonly<ImageSwitches>): 'missing' | 'popular' | undefined =>
  p.waitingReal ? undefined : switches.generateMissing && p.empty ? 'missing' : switches.generatePopular && p.popular ? 'popular' : undefined

export type ImageStepDeps = {
  cache: string
  quota: () => Promise<QuotaReading>
  native: (prompt: string, dir: string, reference: string | undefined, observe: NativeAttemptObserver) => Promise<NativeImage>
  extract: (prompt: string) => Promise<{ facts: AppearanceFact[] }>
  judge: <T>(file: string, prompt: string, schema: object, realImages?: string[]) => Promise<T>
  store: ImageStore
  get: (url: string, signal?: AbortSignal) => Promise<Uint8Array>
  locateMark: (file: string, photo: Photo, sourceName: string) => Promise<MarkEvidence | undefined>
  now: () => Date
}
type Candidate = { manifestHash: string; page: ImagePage; purpose: 'missing' | 'popular'; reference: ImageReference; original: string; generated: GeneratedRecord; receiptHash: string }
const json = async <T>(file: string, fallback: T): Promise<T> => readFile(file, 'utf8').then(s => JSON.parse(s) as T, e => { if (e.code === 'ENOENT') return fallback; throw e })
const save = async (file: string, data: unknown) => { await writeFile(`${file}.next`, `${JSON.stringify(data, null, 2)}\n`); await rename(`${file}.next`, file) }
type Approvals = { calibrationHash?: string; photos: Record<string, { page: string; recordHash: string; check: GeneratedRecord['check'] }> }
const recordHash = (e: ReferenceEntity) => sha256(JSON.stringify([e.scientificName, e.sections]))

/** Re-read the current entity before writing, so other engine steps' facts are not overwritten by an old snapshot. */
async function addPhoto(root: string, page: Pick<ImagePage, 'kind' | 'id'>, photo: Photo, replaced?: string): Promise<void> {
  const file = join(root, 'content', page.kind, page.id, 'entity.json')
  const raw = await readFile(file, 'utf8'), e = JSON.parse(raw) as { photos: Photo[] }
  const existing = e.photos.filter(p => p.url !== photo.url && p.url !== replaced)
  e.photos = realPhotosFirst([...existing, photo])
  await writeFile(file, `${JSON.stringify(e, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  const galleryFile = join(root, 'content/gallery', `${page.id}.json`)
  const gallery = await json<{ id: string; photos: Photo[]; seen: number; updatedAt: string }>(galleryFile, { id: page.id, photos: [], seen: 0, updatedAt: new Date().toISOString().slice(0, 10) })
  gallery.photos = realPhotosFirst([...gallery.photos.filter(p => p.url !== photo.url && p.url !== replaced), photo])
  await mkdir(join(root, 'content/gallery'), { recursive: true }); await save(galleryFile, gallery)
}

/** Remove only generated approvals when new evidence disputes the page; never edit the source sentence. */
async function withdrawGenerated(root: string, page: Pick<ImagePage, 'kind' | 'id'>): Promise<void> {
  const approvalsFile = join(root, 'content/image-approvals.json'), approvals = await json<Approvals>(approvalsFile, { photos: {} })
  const key = `${page.kind}/${page.id}`
  if (Object.values(approvals.photos).some(p => p.page === key)) {
    approvals.photos = Object.fromEntries(Object.entries(approvals.photos).filter(([,p]) => p.page !== key)); await save(approvalsFile, approvals)
  }
  for (const file of [join(root, 'content', page.kind, page.id, 'entity.json'), join(root, 'content/gallery', `${page.id}.json`)]) {
    const raw = await readFile(file, 'utf8').catch(() => undefined)
    if (!raw) continue
    const data = JSON.parse(raw) as { photos?: Photo[] }
    let changed = false
    for (const p of data.photos ?? []) if (p.generated?.check) { delete p.generated.check; changed = true }
    if (changed) await writeFile(file, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }
}

/** All switches OFF returns before constructing credentials, reading quota, using a model or touching any output. */
export async function imageSteps(root: string, makeDeps: () => Promise<ImageStepDeps>, switches: Readonly<ImageSwitches> = IMAGE_SWITCHES, limit = 1, budgetMs = 12 * 60_000, cancellation?: AbortSignal) {
  const report = { generated: 0, repaired: 0, upscaled: 0, published: 0, waiting: [] as string[], failed: [] as string[], off: !Object.values(switches).some(Boolean) }
  if (report.off) return report
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 5) throw new Error('images limit must be an integer from 0 to 5')
  cancellation?.throwIfAborted()
  const deadline = Date.now() + budgetMs
  const signal = AbortSignal.any([AbortSignal.timeout(budgetMs), ...(cancellation ? [cancellation] : [])])
  const originalDeps = await beforeDeadline(makeDeps, signal)
  const reserve = () => { signal.throwIfAborted(); if (Date.now() > deadline - 270_000) throw new Error('image cycle time budget reached; remaining work waits') }
  const d: ImageStepDeps = { ...originalDeps,
    store: (...args) => beforeDeadline(() => originalDeps.store(...args.slice(0, 3) as [string, Uint8Array, string], signal), signal),
    get: (url) => beforeDeadline(() => originalDeps.get(url, signal), signal),
    native: async (...args) => { reserve(); return originalDeps.native(...args) },
    extract: async (...args) => { reserve(); return originalDeps.extract(...args) },
    judge: async <T>(...args: Parameters<ImageStepDeps['judge']>) => { reserve(); return originalDeps.judge<T>(...args) },
    locateMark: async (...args) => { reserve(); return originalDeps.locateMark(...args) },
  }
  const sources = SourcesSchema.parse(await json(join(root, 'content/sources.json'), {}))
  const meter = (kind: string, prompt: string, reference?: string) => meteredImage(d.cache, kind, prompt, { quota: d.quota, generate: (p, dir, observe) => d.native(p, dir, reference, observe) })
  await mkdir(join(d.cache, 'candidates'), { recursive: true })
  const calibration = await json<Calibration | undefined>(join(d.cache, 'calibration.json'), undefined).catch(() => undefined)

  const approvalsFile = join(root, 'content/image-approvals.json')
  const activeApprovals = await json<Approvals>(approvalsFile, { photos: {} })
  if (Object.keys(activeApprovals.photos).length && (!calibrationReady(calibration) || activeApprovals.calibrationHash !== sha256(JSON.stringify(calibration)))) await save(approvalsFile, { photos: {} })

  // Revoke all published records before any model work, even pages beyond this cycle's work/deadline slice.
  for (const pageKey of new Set(Object.values(activeApprovals.photos).map(p => p.page))) {
    if (!/^(species|plants)\/[a-z0-9-]+$/.test(pageKey)) continue
    const [kind, id] = pageKey.split('/') as ['species' | 'plants', string]
    try {
      const candidate = await json<Candidate | null>(join(d.cache, 'candidates', `${kind}-${id}.json`), null)
      const entity = await json<ReferenceEntity>(join(root, 'content', kind, id, 'entity.json'), {} as ReferenceEntity)
      const manifest = await json<ImageReference['images']>(join(d.cache, 'references', `${kind}-${id}.json`), [])
      if (!candidate || !calibrationReady(calibration) || candidate.generated.check?.calibrationHash !== sha256(JSON.stringify(calibration)) || candidate.reference.scientificName !== entity.scientificName || candidate.manifestHash !== sha256(JSON.stringify(manifest)) || candidate.reference.facts.some(f => !entity.sections.some(s => s.source === f.source && s.sourceUrl === f.sourceUrl && referenceText(s.html).includes(f.quote)))) throw new Error('published evidence changed')
      await verifyCheckingImages(candidate.reference)
    } catch { await withdrawGenerated(root, { kind, id }) }
  }

  const noTraceCalibration = await json<NoTraceCalibration | undefined>(join(d.cache, 'no-trace-calibration.json'), undefined).catch(() => undefined)

  // Real recovery comes FIRST. A successful repair can take a page out of the missing-photo set in this very run.
  const pendingReal = new Set<string>()
  let markAttempts = 0
  if (switches.removeMarks) await recoverMarkedHistory(root, d.cache)
  if (switches.removeMarks) for (const name of (await readdir(join(d.cache, 'marked')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) {
    if (Date.now() > deadline - 270_000) { report.waiting.push('image cycle time budget reached'); break }
    try {
      const c = await json<MarkCandidate>(join(d.cache, 'marked', name), {} as MarkCandidate)
      const source = c.photo?.source && sources[c.photo.source]
      if (!source?.permission?.markRemoval?.allowed) continue
      const pageKey = `${c.page.kind}/${c.page.id}`
      const workFile = join(d.cache, 'marked', `${name}.work`)
      pendingReal.add(pageKey)
      const key = sha256(JSON.stringify([c.photo, source.permission.markRemoval, 'bounded-repair-v2', noTraceVersion(), sha256(JSON.stringify(noTraceCalibration ?? null))]))
      const work = await json<{ key: string; status: string } | null>(workFile, null)
      if (work?.key === key && ['refused', 'published'].includes(work.status)) { pendingReal.delete(pageKey); continue }
      if (!noTraceCalibrationReady(noTraceCalibration)) { report.waiting.push(`${pageKey}: no-trace gate not calibrated`); continue }
      if (markAttempts >= Math.max(0, limit)) continue
      markAttempts++
      const original = await d.get(c.photo.url), dir = join(d.cache, 'mark-ownership', sha256(original))
      await mkdir(dir, { recursive: true }); const file = join(dir, 'original'); await writeFile(file, original)
      const mark = await d.locateMark(file, c.photo, source.name)
      if (!mark || !canRemoveMark(c.photo, source, mark, switches)) { await save(workFile, { key, status: 'refused', reason: 'ownership or licence not established' }); pendingReal.delete(pageKey); report.waiting.push(`${pageKey}: mark ownership not established`); continue }
      const resultFile = join(dir, 'repair-result.json')
      const cached = await json<{ key: string; file: string; altered: NonNullable<Photo['altered']> } | null>(resultFile, null)
      const result = cached?.key === key ? { bytes: await readFile(cached.file), altered: cached.altered } : await removeSourceMark(c.photo, original, source, mark, { cache: d.cache, edit: async (prompt, file) => (await meter('mark-removal', prompt, file)).bytes,
        noTrace: (file, prompt, images) => d.judge<NoTraceVerdict>(file, prompt, NO_TRACE_SCHEMA, images), now: d.now }, switches)
      if (!result) {
        if (c.photo.source === 'glaser' && mark.owner === 'source') {
          const file = join(root, 'engine-state/_photo-watermarks.json'), cache = await json<Record<string, object>>(file, {})
          cache[c.photo.url] = { ...cache[c.photo.url], retainedOwnMark: { source: 'glaser', sourceUrl: c.photo.sourceUrl, owner: 'source' } }; await save(file, cache)
        }
        await save(workFile, { key, status: 'refused', reason: 'no-trace check' }); pendingReal.delete(pageKey)
        report.waiting.push(`${pageKey}: no clean removal; original retained`); continue
      }
      report.repaired++
      const checkedFile = join(dir, 'clean.webp'); await writeFile(checkedFile, result.bytes)
      await save(resultFile, { key, file: checkedFile, altered: result.altered })
      await save(workFile, { key, status: 'ready' })
      if (!switches.publishAltered) continue
      const entity = await json<ReferenceEntity>(join(root, 'content', c.page.kind, c.page.id, 'entity.json'), {} as ReferenceEntity)
      const checked = await d.judge<{ photos: ({ n: number } & PhotoVerdict)[] }>(checkedFile, subjectPrompt({ id: c.page.id, kind: c.page.kind, sci: entity.scientificName, names: [] }), PHOTO_CHECK_SCHEMA)
      const verdict = checked.photos?.find(v => v.n === 1)
      if (verdict?.ok !== 'yes' || verdict.person !== false || verdict.logo !== false) { await save(workFile, { key, status: 'refused', reason: 'real photo check' }); pendingReal.delete(pageKey); report.waiting.push(`${c.page.id}: repaired real photo did not positively pass`); continue }
      const permissionNow = async () => JSON.stringify((await json<typeof sources>(join(root, 'content/sources.json'), sources))[c.photo.source!]?.permission) === JSON.stringify(source.permission)
      if (!await permissionNow()) continue
      const stored = await storeImageVariants(result.bytes, { altered: result.altered }, d.store, true, signal)
      if (!await permissionNow()) continue
      const { url, width, height, thumb, large, ...credit } = c.photo
      signal.throwIfAborted()
      await addPhoto(root, c.page, { ...credit, ...stored, altered: result.altered, original: { url, width, height, thumb, large } }, c.photo.url)
      const verdictFile = join(root, 'engine-state/_photo-subjects.json'), verdicts = await json<Record<string, Record<string, PhotoVerdict>>>(verdictFile, {})
      verdicts[stored.url] = { ...verdicts[stored.url], [c.page.id]: verdict }; await save(verdictFile, verdicts)
      await save(workFile, { key, status: 'published' }); pendingReal.delete(pageKey)
      report.published++
    } catch (e) { report.failed.push(`mark candidate: ${(e as Error).message}`) }
  }

  if (switches.upscaleReal) for (const page of await imagePlan(root, switches)) {
    if (report.upscaled >= limit || Date.now() > deadline - 270_000) break
    const file = join(root, 'content', page.kind, page.id, 'entity.json'), e = await json<{ photos: Photo[] }>(file, { photos: [] })
    for (const p of e.photos) {
      if (p.generated || p.altered?.length || p.large) continue
      const bytes = await d.get(p.url), result = await upscalePhoto(p, bytes, switches)
      if (!result) continue
      const dir = join(d.cache, 'alterations', sha256(bytes)); await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'original'), bytes)
      report.upscaled++
      if (switches.publishAltered) {
        const stored = await storeImageVariants(result.bytes, { altered: result.altered }, d.store, false, signal)
        const { url, width, height, thumb, large, ...credit } = p
        signal.throwIfAborted()
        await addPhoto(root, page, { ...credit, ...stored, altered: result.altered, original: { url, width, height, thumb, large } }, p.url)
        report.published++
      }
      break
    }
  }

  // Re-read after real repairs. Pending real album photos also defer generation to their own check.
  let referenceAttempts = 0, judgmentAttempts = 0
  for (const page of await imagePlan(root, switches)) {
    if (Date.now() > deadline - 270_000) { report.waiting.push('image cycle time budget reached'); break }
    const file = join(d.cache, 'candidates', `${page.kind}-${page.id}.json`)
    let candidate = await json<Candidate | null>(file, null)
    const purpose = pendingReal.has(`${page.kind}/${page.id}`) ? undefined : generationPurpose(page, switches)
    try {
      const entity = await json<ReferenceEntity>(join(root, 'content', page.kind, page.id, 'entity.json'), {} as ReferenceEntity)
      if (!candidate && entity.photos?.some(p => p.generated)) await withdrawGenerated(root, page)
      const referenceManifest = await json<ImageReference['images']>(join(d.cache, 'references', `${page.kind}-${page.id}.json`), [])
      const referenceManifestHash = sha256(JSON.stringify(referenceManifest))
      if (candidate) {
        const invalid = !calibrationReady(calibration) || candidate.reference.scientificName !== entity.scientificName || (candidate as Candidate & { manifestHash?: string }).manifestHash !== referenceManifestHash || candidate.reference.facts.some(f => !entity.sections.some(s => s.source === f.source && s.sourceUrl === f.sourceUrl && referenceText(s.html).includes(f.quote))) || (candidate.generated.check && candidate.generated.check.calibrationHash !== sha256(JSON.stringify(calibration)));
        if (invalid) { await withdrawGenerated(root, page); delete candidate.generated.check; await save(file, candidate); report.waiting.push(`${page.id}: approval/reference invalidated`); continue }
        await verifyCheckingImages(candidate.reference)
      }
      const processGenerated = !!purpose || switches.publishGenerated || (candidate?.purpose === 'missing' ? switches.generateMissing : switches.generatePopular)
      if (!processGenerated && !switches.upscaleGenerated) continue
      const knownConflicts = [...await json<ImageConflict[]>(join(d.cache, 'source-conflicts.json'), []), ...await json<ImageConflict[]>(join(d.cache, 'calibration-conflicts.json'), [])]
      if (activeSourceConflicts(`${page.kind}/${page.id}`, entity, knownConflicts).length) { await withdrawGenerated(root, page); report.waiting.push(`${page.id}: recorded source/reference conflict remains unresolved`); continue }
      if (!candidate && purpose && report.generated < Math.max(0, limit) && judgmentAttempts < Math.max(0, limit) && calibrationReady(calibration)) {
        const checking = [...referenceManifest]
        const judged = await json<Record<string, Record<string, PhotoVerdict>>>(join(root, 'engine-state/_photo-subjects.json'), {})
        for (const photo of (entity.photos ?? []).filter(p => !p.generated && judged[p.url]?.[page.id]?.ok === 'yes' && !judged[p.url]?.[page.id]?.person).slice(0, 2)) {
          const bytes = await d.get(photo.url), hash = sha256(bytes), dir = join(d.cache, 'checking-only')
          await mkdir(dir, { recursive: true }); const file = join(dir, hash); await writeFile(file, bytes, { mode: 0o600 })
          checking.push({ file, sourceUrl: photo.sourceUrl, sha256: hash })
        }
        const recordHash = sha256(JSON.stringify([entity.scientificName, entity.sections, checking]))
        const referenceFile = join(d.cache, 'candidates', `${page.kind}-${page.id}-reference.json`)
        const savedReference = await json<{ recordHash: string; reference: ImageReference } | null>(referenceFile, null)
        if (savedReference?.recordHash !== recordHash && referenceAttempts >= Math.max(0, limit) * 3) continue
        const reference = savedReference?.recordHash === recordHash ? savedReference.reference : await appearanceReference(`${page.kind}/${page.id}`, entity, async p => { referenceAttempts++; return d.extract(p) }, checking.filter(i => entity.sections.some(s => s.sourceUrl === i.sourceUrl) || entity.photos?.some(p => !p.generated && p.sourceUrl === i.sourceUrl)))
        await save(referenceFile, { recordHash, reference })
        if (!hasGenerationReference(reference)) { report.waiting.push(`${page.id}: no independent appearance reference`); continue }
        await verifyCheckingImages(reference)
        if (reference.images.length) {
          const refs = reference.images.map(i => i.file), key = sha256(JSON.stringify([referenceHash(reference), generatedGateVersion()])), consistencyFile = `${referenceFile}.consistency.json`
          const cached = await json<{ key: string; verdict: ReferenceVerdict } | null>(consistencyFile, null)
          const consistency = cached?.key === key ? cached.verdict : await d.judge<ReferenceVerdict>(refs[0]!, referenceCheckPrompt(reference), REFERENCE_CHECK_SCHEMA, refs.slice(1))
          await save(consistencyFile, { key, verdict: consistency })
          if (consistency.verdict !== 'consistent' || consistency.conflicts.length) {
            const conflictFile = join(d.cache, 'source-conflicts.json'), previous = await json<ImageConflict[]>(conflictFile, [])
            await save(conflictFile, [...previous, ...sourceConflicts(reference, consistency, d.now().toISOString())]); report.waiting.push(`${page.id}: source/reference conflict or uncertainty`); continue
          }
        }
        const prompt = `Realistic aquarium photograph of ${entity.scientificName}, ${page.kind === 'plants' ? 'one complete submerged plant or clump' : 'one whole living adult'}, entire subject visible. Appearance facts: ${reference.facts.map(f => f.quote).join(' ')}. Natural light, realistic anatomy. No people, body parts, hands, text, logos or watermarks.`
        const made = await meter('generated', prompt), original = join(d.cache, 'candidates', `${page.kind}-${page.id}-original.png`)
        await writeFile(original, made.bytes)
        candidate = { page, purpose, manifestHash: referenceManifestHash, reference, original, receiptHash: made.receiptHash, generated: { model: made.model, driverModel: made.driverModel, date: d.now().toISOString(), prompt: made.prompt, referenceHash: referenceHash(reference) } }
        await save(file, candidate); report.generated++
      }
      if (!candidate) continue
      // Never publish a missing-photo candidate over a real image that arrived while it waited.
      if (pendingReal.has(`${page.kind}/${page.id}`) || page.waitingReal || (!page.empty && candidate.purpose === 'missing')) continue
      // Revalidate the exact reference against today's records, without giving the checker the generation prompt.
      if (candidate.reference.facts.some(f => !entity.sections.some(s => s.source === f.source && s.sourceUrl === f.sourceUrl && referenceText(s.html).includes(f.quote)))) { await withdrawGenerated(root, page); report.waiting.push(`${page.id}: reference changed`); continue }
      await verifyCheckingImages(candidate.reference)
      let bytes: Uint8Array = await readFile(candidate.original)
      const scaled = await upscalePhoto({ generated: candidate.generated } as Photo, bytes, switches)
      if (scaled) { bytes = scaled.bytes; await writeFile(join(d.cache, 'candidates', `${page.kind}-${page.id}-upscaled.png`), bytes); report.upscaled++ }
      if (!processGenerated) continue
      const checkFile = join(d.cache, 'candidates', `${page.kind}-${page.id}-check.webp`), primary = await primaryImageBytes(bytes)
      await writeFile(checkFile, primary)
      if (!calibrationReady(calibration)) { await withdrawGenerated(root, page); report.waiting.push(`${page.id}: generated gate not calibrated`); continue }
      const hash = await pixelHash(primary)
      const previousCheck = candidate.generated.check
      const alreadyChecked = previousCheck?.model === GENERATED_CHECK_MODEL && previousCheck.version === generatedGateVersion() && previousCheck.pixelHash === hash && previousCheck.referenceHash === referenceHash(candidate.reference) && previousCheck.calibrationHash === sha256(JSON.stringify(calibration))
      const decisionKey = sha256(JSON.stringify([hash, referenceHash(candidate.reference), generatedGateVersion(), calibration, referenceManifestHash, entity.scientificName]))
      const decisionFile = join(d.cache, 'candidates', `${page.kind}-${page.id}-decision.json`)
      const decision = await json<{ key: string; refused: boolean } | null>(decisionFile, null)
      if (!alreadyChecked && decision?.key === decisionKey && decision.refused) { await withdrawGenerated(root, page); continue }
      if (!alreadyChecked && judgmentAttempts++ >= Math.max(0, limit)) continue
      // Validate claimed source conflicts without exposing the candidate to this separate comparison.
      if (!alreadyChecked && candidate.reference.images.length) {
        const refs = candidate.reference.images.map(i => i.file)
        const consistency = await d.judge<ReferenceVerdict>(refs[0]!, referenceCheckPrompt(candidate.reference), REFERENCE_CHECK_SCHEMA, refs.slice(1))
        if (consistency.verdict !== 'consistent' || consistency.conflicts.length) {
          const conflictFile = join(d.cache, 'source-conflicts.json'), previous = await json<ImageConflict[]>(conflictFile, [])
          const conflicts = sourceConflicts(candidate.reference, consistency, d.now().toISOString())
          await save(conflictFile, [...previous, ...conflicts])
          await withdrawGenerated(root, page)
          await save(decisionFile, { key: decisionKey, refused: true })
          report.waiting.push(`${page.id}: independent records and real reference conflict or cannot be reconciled`); continue
        }
      }
      if (!alreadyChecked) {
        const views = await generatedViews(checkFile, candidate.reference, join(d.cache, 'views', hash))
        const verdict = await d.judge<GeneratedVerdict>(views.files[0]!, generatedCheckPrompt(candidate.reference, views.roles), GENERATED_CHECK_SCHEMA, views.files.slice(1))
        await save(join(d.cache, 'views', hash, 'verdict.json'), { version: generatedGateVersion(), referenceHash: referenceHash(candidate.reference), pixelHash: hash, verdict })
        if (!positiveGeneratedVerdict(verdict, candidate.reference)) {
          await save(decisionFile, { key: decisionKey, refused: true }); await withdrawGenerated(root, page); delete candidate.generated.check; await save(file, candidate); report.waiting.push(`${page.id}: generated picture refused or uncertain`); continue }
        candidate.generated.check = { verdict: 'pass', version: generatedGateVersion(), model: GENERATED_CHECK_MODEL, at: d.now().toISOString(), referenceHash: referenceHash(candidate.reference), pixelHash: hash, calibrationHash: sha256(JSON.stringify(calibration)) }
        await save(file, candidate)
      }
      if (!switches.publishGenerated) continue
      const current = (await imagePlan(root, switches)).find(p => p.kind === page.kind && p.id === page.id)
      if (!current || current.waitingReal || (candidate.purpose === 'missing' && !current.empty)) continue
      const existingEntity = await json<{ photos: Photo[] }>(join(root, 'content', page.kind, page.id, 'entity.json'), { photos: [] })
      const existingGallery = await json<{ photos: Photo[] }>(join(root, 'content/gallery', `${page.id}.json`), { photos: [] })
      const approval = await json<Approvals>(join(root, 'content/image-approvals.json'), { photos: {} })
      const existing = existingEntity.photos.find(p => p.generated?.check?.pixelHash === hash && JSON.stringify(p.generated.check) === JSON.stringify(candidate!.generated.check))
      if (existing && existingGallery.photos.some(p => p.url === existing.url && JSON.stringify(p.generated?.check) === JSON.stringify(candidate!.generated.check)) && approval.photos[existing.url]?.recordHash === recordHash(entity)) continue
      const stored = await storeImageVariants(bytes, { generated: candidate.generated, ...(scaled ? { altered: scaled.altered } : {}) }, d.store, false, signal)
      signal.throwIfAborted()
      await addPhoto(root, page, { ...stored, generated: candidate.generated, ...(scaled ? { altered: scaled.altered } : {}), licence: 'AI-generated', author: 'AI', sourceUrl: 'https://aquatome.com/gioi-thieu/' })
      const approvalsFile = join(root, 'content/image-approvals.json'), approvals = await json<Approvals>(approvalsFile, { photos: {} })
      approvals.calibrationHash = sha256(JSON.stringify(calibration)); approvals.photos[stored.url] = { page: `${page.kind}/${page.id}`, recordHash: recordHash(entity), check: candidate.generated.check }; await save(approvalsFile, approvals)
      report.published++
    } catch (e) { await withdrawGenerated(root, page); report.failed.push(`${page.id}: ${(e as Error).message}`) }
  }
  return report
}
