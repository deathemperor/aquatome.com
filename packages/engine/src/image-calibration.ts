import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { codexImageJson, readImageQuota, requireQuota } from './codex-images'
import { calibrationReady, GENERATED_CHECK_MODEL, GENERATED_CHECK_SCHEMA, generatedCheckPrompt, generatedGateVersion, positiveGeneratedVerdict, REFERENCE_CHECK_SCHEMA, referenceCheckPrompt, referenceHash, sha256, sourceConflicts, verifyCheckingImages, type Calibration, type GeneratedVerdict, type ImageConflict, type ImageReference, type ReferenceVerdict } from './image-reference'
import { measureMarkResidue, residuePass } from './mark-residue'
import { generatedViews, pixelHash } from './image-transforms'
import { pairedJudgments, judgmentReceipt, validJudgmentPair } from './image-judgments'

const atomic = async (file: string, value: unknown) => { await writeFile(`${file}.next`, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(`${file}.next`, file) }
export type CalibrationCase = { id: string; expected: 'pass' | 'refuse' | 'conflict'; file: string; reference: ImageReference }
/** Ground truth is a reviewed manifest, never supplied to the judge or inferred from its answer. No new images. */
export async function calibrateGenerated(cases: CalibrationCase[], cache: string, judge = codexImageJson) {
  await mkdir(cache, { recursive: true })
  const started = Date.now()
  type Record = Calibration['cases'][number] & { verdicts: GeneratedVerdict[]; referenceVerdicts: ReferenceVerdict[] }
  const records: Record[] = [], conflicts: ImageConflict[] = []
  const priorBytes = await readFile(join(cache, 'calibration.json'), 'utf8').catch(() => undefined)
  // Invalidate before quota, file checks or model calls: any failed rerun closes the old approval.
  await atomic(join(cache, 'calibration.json'), { version: generatedGateVersion(), model: GENERATED_CHECK_MODEL, cases: [] })
  if(cases.some(c=>cache.includes(c.id)))throw new Error('calibration workspace must not reveal control identities')
  const priorCalibration = priorBytes ? JSON.parse(priorBytes) as Calibration : undefined
  const prior = priorCalibration?.version === generatedGateVersion() ? await readFile(join(cache, 'calibration-results.json'), 'utf8').then(s => JSON.parse(s) as Record[], () => []) : []
  const before = await readImageQuota(); requireQuota(before)
  for (const c of cases) {
    await verifyCheckingImages(c.reference)
    if (!c.reference.images.length) throw new Error('calibration ground truth needs a real reference')
    const rh = referenceHash(c.reference), bytes = await readFile(c.file), hash = await pixelHash(bytes)
    const previous = prior.find(p => p.id === c.id && p.expected === c.expected && p.referenceHash === rh && p.pixelHash === hash && validJudgmentPair(p.judgments) && (!c.reference.facts.length || validJudgmentPair(p.referenceJudgments)))
    if (previous) {
      records.push(previous)
      for (const verdict of previous.referenceVerdicts) conflicts.push(...sourceConflicts(c.reference, verdict, new Date().toISOString()))
      continue
    }
    const consistency = c.reference.facts.length ? await pairedJudgments(
      () => judge<ReferenceVerdict>(referenceCheckPrompt(c.reference), REFERENCE_CHECK_SCHEMA, cache, c.reference.images.map(i => i.file), undefined, GENERATED_CHECK_MODEL),
      v => v.verdict === 'consistent' && v.conflicts.length === 0, v => v.verdict) : undefined
    // The input path gives away neither the control's expected answer nor the wrongly named species.
    await mkdir(join(cache, 'calibration-inputs'), { recursive: true })
    const input = join(cache, 'calibration-inputs', `${hash}.image`); await writeFile(input, bytes, { mode: 0o600 })
    const views = await generatedViews(input, c.reference, join(cache, 'calibration-views', sha256(JSON.stringify([hash,rh]))))
    const pair = await pairedJudgments(
      () => judge<GeneratedVerdict>(generatedCheckPrompt(c.reference, views.roles), GENERATED_CHECK_SCHEMA, cache, views.files, undefined, GENERATED_CHECK_MODEL),
      v => positiveGeneratedVerdict(v, c.reference), v => positiveGeneratedVerdict(v, c.reference) ? 'pass' : v.verdict === 'pass' ? 'incomplete-features' : v.verdict)
    await verifyCheckingImages(c.reference)
    if (await pixelHash(await readFile(c.file)) !== hash) throw new Error('calibration candidate changed')
    if (pair.incomplete || consistency?.incomplete) throw new Error('calibration judgment incomplete; qualification stays closed')
    const referenceVerdicts = consistency ? [consistency.first.value!, consistency.second.value!] : []
    const verdicts = [pair.first.value!, pair.second.value!]
    const actual = consistency && !consistency.pass ? 'unsure' : pair.pass ? 'pass' : verdicts.some(v => v.verdict === 'fail') ? 'fail' : 'unsure'
    for (const verdict of referenceVerdicts) conflicts.push(...sourceConflicts(c.reference, verdict, new Date().toISOString()))
    records.push({ id: c.id, expected: c.expected, actual, reason: verdicts.map(v => v.note).join(' | '), conflicts: new Set(referenceVerdicts.flatMap(v => v.conflicts.map(x => x.n))).size, pixelHash: hash, referenceHash: rh, realReferenceHashes: c.reference.images.map(i => i.sha256), judgments: judgmentReceipt(pair), ...(consistency ? { referenceJudgments: judgmentReceipt(consistency) } : {}), verdicts, referenceVerdicts })
    await atomic(join(cache, 'calibration-results.json'), records)
    await atomic(join(cache, 'calibration-conflicts.json'), conflicts)
  }
  // Ordinary live-page conflicts are separate and never deleted by a controls rerun.
  await atomic(join(cache, 'calibration-conflicts.json'), conflicts)
  await atomic(join(cache, 'calibration-results.json'), records)
  const calibration: Calibration = { version: generatedGateVersion(), model: GENERATED_CHECK_MODEL, cases: records.map(({ verdicts: _v, referenceVerdicts: _r, ...r }) => r) }
  const after = await readImageQuota(); requireQuota(after)
  const report = { before, after, points: after.usedPercent - before.usedPercent, seconds: (Date.now() - started) / 1000, ready: calibrationReady(calibration), calibration }
  await atomic(join(cache, 'calibration.json'), calibration)
  await atomic(join(cache, 'calibration-report.json'), report)
  return report
}

/** Renew every retained control with the production pair rule, including the residue-strength and natural-detail set. */
export async function calibrateMarks(cases: { id?: string; n?: number; expected: 'pass' | 'refuse'; original: string; file: string; box: import('./image-transforms').MarkBox; measurementTemplate?: string }[], cache: string, judge = codexImageJson) {
  const { default: sharp } = await import('sharp')
  const { NO_TRACE_SCHEMA, NO_TRACE_MODEL, NO_TRACE_INSTRUCTION, noTraceVersion, noTracePass, noTraceCalibrationReady, outsideBoxProof } = await import('./image-transforms')
  await mkdir(cache, { recursive: true })
  await atomic(join(cache, 'no-trace-calibration.json'), { version: noTraceVersion(), cases: [] })
  if(cases.some(c=>cache.includes(c.id??`frozen-${c.n}`)))throw new Error('calibration workspace must not reveal control identities')
  const before = await readImageQuota(); requireQuota(before)
  const started = Date.now(), records = []
  for (const c of cases) {
    const original = await readFile(c.original), bytes = await readFile(c.file), proof = await outsideBoxProof(original, bytes, c.box)
    if (proof.outside !== 0) throw new Error('mark calibration changed pixels outside its box')
    const id = c.id ?? `frozen-${c.n}`
    if (!/^[a-z0-9.-]+$/.test(id)) throw new Error('invalid mark control id')
    const hash=await pixelHash(bytes),inputDir=join(cache,'mark-control-inputs');await mkdir(inputDir,{recursive:true})
    const input=join(inputDir,`${hash}.image`);await writeFile(input,bytes,{mode:0o600})
    const crop = join(inputDir, `${hash}-box.png`), b = c.box
    await sharp(bytes).extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 }).resize({ width: Math.max(800, b.x1 - b.x0) }).png().toFile(crop)
    const template = c.measurementTemplate ? await readFile(c.measurementTemplate) : undefined
    const measurement = template ? await measureMarkResidue(template, await sharp(bytes).extract({ left:b.x0,top:b.y0,width:b.x1-b.x0,height:b.y1-b.y0 }).png().toBuffer(), { x0:0,y0:0,x1:b.x1-b.x0,y1:b.y1-b.y0 }) : await measureMarkResidue(original, bytes, b)
    const pair = await pairedJudgments(() => judge<import('./image-transforms').NoTraceVerdict>(NO_TRACE_INSTRUCTION, NO_TRACE_SCHEMA, cache, [input, crop], undefined, NO_TRACE_MODEL), noTracePass, v => noTracePass(v) ? 'pass' : v.verdict)
    if (pair.incomplete) throw new Error('mark control judgment incomplete; qualification stays closed')
    if (sha256(await readFile(c.original)) !== sha256(original) || await pixelHash(await readFile(c.file)) !== await pixelHash(bytes)) throw new Error('mark control changed')
    records.push({ id, n: c.n, originalHash: sha256(original), box: c.box, expected: c.expected, actual: pair.pass && residuePass(measurement) ? 'pass' as const : 'refuse' as const, pixelHash: await pixelHash(bytes), outside: proof.outside, measurement, ...(template ? {measurementTemplateHash:sha256(template)} : {}), judgments:judgmentReceipt(pair), reason: pair.pass && residuePass(measurement) ? undefined : 'The paired visual or numeric check did not pass.', verdicts:[pair.first.value,pair.second.value] })
    await writeFile(join(cache, 'no-trace-results.json'), JSON.stringify(records, null, 2), { mode: 0o600 })
  }
  const calibration = { version: noTraceVersion(), cases: records.map(({ verdicts: _v, ...r }) => r) }
  const after = await readImageQuota(); requireQuota(after)
  const report = { before, after, seconds: (Date.now() - started) / 1000, points: after.usedPercent - before.usedPercent, ready: noTraceCalibrationReady(calibration) }
  await atomic(join(cache, 'no-trace-calibration.json'), calibration)
  await writeFile(join(cache, 'no-trace-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
  return report
}
