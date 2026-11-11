import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { codexImageJson, readImageQuota, requireQuota } from './codex-images'
import { calibrationReady, GENERATED_CHECK_MODEL, GENERATED_CHECK_SCHEMA, generatedCheckPrompt, generatedGateVersion, positiveGeneratedVerdict, REFERENCE_CHECK_SCHEMA, referenceCheckPrompt, referenceHash, sha256, sourceConflicts, verifyCheckingImages, type Calibration, type GeneratedVerdict, type ImageConflict, type ImageReference, type ReferenceVerdict } from './image-reference'
import { measureMarkResidue, residuePass } from './mark-residue'
import { generatedViews, pixelHash } from './image-transforms'

const atomic = async (file: string, value: unknown) => { await writeFile(`${file}.next`, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(`${file}.next`, file) }
export type CalibrationCase = { id: string; expected: 'pass' | 'refuse' | 'conflict'; file: string; reference: ImageReference }
/** Ground truth is a reviewed manifest, never supplied to the judge or inferred from its answer. No new images. */
export async function calibrateGenerated(cases: CalibrationCase[], cache: string, judge = codexImageJson) {
  await mkdir(cache, { recursive: true })
  const started = Date.now(), records: (Calibration['cases'][number] & { verdict: GeneratedVerdict; referenceVerdict: ReferenceVerdict })[] = [], conflicts: ImageConflict[] = []
  const priorBytes = await readFile(join(cache, 'calibration.json'), 'utf8').catch(() => undefined)
  await atomic(join(cache, 'calibration.json'), { version: generatedGateVersion(), model: GENERATED_CHECK_MODEL, cases: [] })
  const priorCalibration = priorBytes ? JSON.parse(priorBytes) as Calibration : undefined
  const prior = priorCalibration?.version === generatedGateVersion() ? await readFile(join(cache, 'calibration-results.json'), 'utf8').then(s => JSON.parse(s) as typeof records, () => []) : []
  const before = await readImageQuota(); requireQuota(before)
  const referenceVerdicts = new Map<string, ReferenceVerdict>()
  for (const c of cases) {
    await verifyCheckingImages(c.reference)
    if (!c.reference.images.length) throw new Error('calibration ground truth needs a real reference')
    const rh = referenceHash(c.reference), hash = await pixelHash(await readFile(c.file))
    const previous = prior.find(p => p.id === c.id && p.expected === c.expected && p.referenceHash === rh && p.pixelHash === hash)
    if (previous) { records.push({ ...previous, reason: previous.verdict.note }); conflicts.push(...sourceConflicts(c.reference, previous.referenceVerdict, new Date().toISOString())); continue }
    let consistency: ReferenceVerdict | undefined = c.reference.facts.length ? referenceVerdicts.get(rh) : { verdict: 'consistent', conflicts: [] }
    if (!consistency) {
      consistency = await judge<ReferenceVerdict>(referenceCheckPrompt(c.reference), REFERENCE_CHECK_SCHEMA, cache, c.reference.images.map(i => i.file))
      referenceVerdicts.set(rh, consistency)
    }
    const views = await generatedViews(c.file, c.reference, join(cache, 'calibration-views', c.id))
    const verdict = await judge<GeneratedVerdict>(generatedCheckPrompt(c.reference, views.roles), GENERATED_CHECK_SCHEMA, cache, views.files)
    const actual: Calibration['cases'][number]['actual'] = consistency.verdict === 'consistent' && consistency.conflicts.length === 0 ? positiveGeneratedVerdict(verdict, c.reference) ? 'pass' : verdict.verdict === 'fail' ? 'fail' : 'unsure' : 'unsure'
    conflicts.push(...sourceConflicts(c.reference, consistency, new Date().toISOString()))
    records.push({ id: c.id, expected: c.expected, actual, reason: verdict.note, conflicts: consistency.conflicts.length, pixelHash: hash, referenceHash: rh, realReferenceHashes: c.reference.images.map(i => i.sha256), verdict, referenceVerdict: consistency })
    await writeFile(join(cache, 'calibration-results.json'), JSON.stringify(records, null, 2), { mode: 0o600 })
    await atomic(join(cache, 'calibration-conflicts.json'), conflicts)
  }
  // Reconstruct on cached replays too; ordinary page conflicts are never replaced by controls.
  await atomic(join(cache, 'calibration-conflicts.json'), conflicts)
  await atomic(join(cache, 'calibration-results.json'), records)
  const calibration: Calibration = { version: generatedGateVersion(), model: GENERATED_CHECK_MODEL, cases: records.map(({ verdict: _v, referenceVerdict: _r, ...r }) => r) }
  const after = await readImageQuota(); requireQuota(after)
  const report = { before, after, points: after.usedPercent - before.usedPercent, seconds: (Date.now() - started) / 1000, ready: calibrationReady(calibration), calibration }
  // Always replace a previous approval with this run, including an unsuccessful run. Stale success cannot survive failure.
  await atomic(join(cache, 'calibration.json'), calibration)
  await writeFile(join(cache, 'calibration-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
  return report
}

/** Recheck the eight retained trial results. Failed controls always overwrite a previous approval. */
export async function calibrateMarks(cases: { n: number; expected: 'pass' | 'refuse'; original: string; file: string; box: import('./image-transforms').MarkBox }[], cache: string) {
  const { default: sharp } = await import('sharp')
  const { NO_TRACE_SCHEMA, NO_TRACE_MODEL, NO_TRACE_INSTRUCTION, noTraceVersion, noTracePass, noTraceCalibrationReady, outsideBoxProof } = await import('./image-transforms')
  await mkdir(cache, { recursive: true })
  await atomic(join(cache, 'no-trace-calibration.json'), { version: noTraceVersion(), cases: [] })
  const before = await readImageQuota(); requireQuota(before)
  const started = Date.now(), records = []
  for (const c of cases) {
    const original = await readFile(c.original), bytes = await readFile(c.file), proof = await outsideBoxProof(original, bytes, c.box)
    if (proof.outside !== 0) throw new Error('mark calibration changed pixels outside its box')
    const crop = join(cache, `mark-control-${c.n}-box.png`), b = c.box
    await sharp(bytes).extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 }).resize({ width: Math.max(800, b.x1 - b.x0) }).png().toFile(crop)
    const measurement = await measureMarkResidue(original, bytes, b)
    const verdict = await codexImageJson<import('./image-transforms').NoTraceVerdict>(NO_TRACE_INSTRUCTION, NO_TRACE_SCHEMA, cache, [c.file, crop], undefined, NO_TRACE_MODEL)
    records.push({ n: c.n, originalHash: sha256(original), box: c.box, expected: c.expected, actual: noTracePass(verdict) && residuePass(measurement) ? 'pass' as const : 'refuse' as const, pixelHash: await pixelHash(bytes), outside: proof.outside, measurement, verdict })
    await writeFile(join(cache, 'no-trace-results.json'), JSON.stringify(records, null, 2), { mode: 0o600 })
  }
  const calibration = { version: noTraceVersion(), cases: records.map(({ verdict: _v, ...r }) => r) }
  const after = await readImageQuota(); requireQuota(after)
  const report = { before, after, seconds: (Date.now() - started) / 1000, points: after.usedPercent - before.usedPercent, ready: noTraceCalibrationReady(calibration) }
  await atomic(join(cache, 'no-trace-calibration.json'), calibration)
  await writeFile(join(cache, 'no-trace-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
  return report
}
