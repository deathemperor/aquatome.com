import reviewed from '../src/image-controls.json'
import generatedResults from '../../../docs/image-calibration-results.json'
import markResults from '../../../docs/mark-calibration-results.json'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { generatedApproved, APPROVED_GENERATED_GATE, IMAGE_SWITCHES, type GeneratedRecord, type Photo, type SourceInfo } from '@aq/schema'
import { codexImageJson, IMAGE_CAP, meteredImage, quotaReading, requireQuota, type NativeImage, type QuotaReading } from '../src/codex-images'
import { activeSourceConflicts, appearanceReference, CALIBRATION_CASES, calibrationReady, generatedGateVersion, hasGenerationReference, positiveGeneratedVerdict, referenceHash, sourceConflicts, sha256, type Calibration, type GeneratedVerdict, type ImageReference } from '../src/image-reference'
import { composeMarkPatch, noTracePass, noTraceVersion, noTraceCalibrationReady, outsideBoxProof, pixelHash, upscaleSize } from '../src/image-transforms'
import { alterationAllowed, canRemoveMark, ownsMark, removeSourceMark, upscalePhoto } from '../src/image-alterations'
import { generationPurpose, imageSteps } from '../src/image-steps'
import { primaryImageBytes, storeImageVariants } from '../src/image-publication'

vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), spawn: vi.fn(() => { throw new Error('unexpected native call in unit test') }) }))

const folders: string[] = []
const folder = async () => { const f = await mkdtemp(join(tmpdir(), 'aq-images-')); folders.push(f); return f }
afterEach(async () => { await Promise.all(folders.splice(0).map(f => rm(f, { recursive: true, force: true }))) })
const switches = { ...IMAGE_SWITCHES, removeMarks: true }
const hash = 'a'.repeat(64)
const photo: Photo = { url: 'https://media.aquatome.com/glaser/one.webp', width: 100, height: 80, source: 'glaser', licence: 'dùng với sự cho phép', author: 'Aquarium Glaser', sourceUrl: 'https://www.aquariumglaser.de/en/fish/' }
const source: SourceInfo = { name: 'Aquarium Glaser', homepage: 'https://www.aquariumglaser.de/', publish: true, permission: { date: '2026-11-10', file: 'owner statement', scope: ['photos'], markRemoval: { allowed: true, date: '2026-11-10' } } }
const mark = { owner: 'source' as const, text: 'Aquarium Glaser', box: { x0: 10, y0: 10, x1: 30, y1: 25 }, sourceUrl: photo.sourceUrl }
const reference: ImageReference = { page: 'species/fish', scientificName: 'Test species', facts: [{ source: 'glaser', sourceUrl: photo.sourceUrl, quote: 'The fish has three black body stripes.' }], images: [] }
const passed = (): GeneratedVerdict => ({ verdict: 'pass', identity: 'pass', anatomy: 'pass', referenceImages: 'pass', person: false, text: false, logo: false, features: [{ n: 1, verdict: 'pass', note: 'three stripes visible' }], conflicts: [], note: '' })
const quota = (usedPercent = 3): QuotaReading => ({ at: new Date().toISOString(), limitId: 'codex', usedPercent, spendControlReached: false })
const native = (): NativeImage => ({ bytes: Buffer.from('candidate'), prompt: 'fish', model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', seconds: 1, receiptHash: hash })
const pattern = async () => {
  const b = Buffer.alloc(100 * 80 * 3)
  for (let i = 0; i < b.length; i++) b[i] = (i * 37 + Math.floor(i / 83)) % 256
  return sharp(b, { raw: { width: 100, height: 80, channels: 3 } }).png().toBuffer()
}

describe('all seven review switches are independently off', () => {
  it('does not construct dependencies or read quota when off', async () => {
    expect(Object.values(IMAGE_SWITCHES).every(v => v === false)).toBe(true)
    const deps = vi.fn()
    expect((await imageSteps('/nonexistent', deps)).off).toBe(true)
    expect(deps).not.toHaveBeenCalled()
  })
  it('rejects an invalid or unbounded cycle limit before any dependency is constructed', async () => {
    const deps = vi.fn()
    for (const limit of [NaN, -1, 6, 1.5]) await expect(imageSteps('/unused', deps, { ...IMAGE_SWITCHES, generateMissing: true }, limit)).rejects.toThrow('limit')
    expect(deps).not.toHaveBeenCalled()
  })
  it('defers any existing unjudged real photo, including an album photo', () => {
    const p = { kind: 'species' as const, id: 'fish', empty: true, popular: true, waitingReal: true }
    expect(generationPurpose(p, { ...IMAGE_SWITCHES, generateMissing: true, generatePopular: true })).toBeUndefined()
    expect(generationPurpose({ ...p, waitingReal: false }, { ...IMAGE_SWITCHES, generateMissing: true })).toBe('missing')
    expect(generationPurpose({ ...p, empty: false, waitingReal: false }, { ...IMAGE_SWITCHES, generateMissing: true })).toBeUndefined()
    expect(generationPurpose({ ...p, empty: false, waitingReal: false }, { ...IMAGE_SWITCHES, generatePopular: true })).toBe('popular')
  })
})

describe('the reference and positive generated gate', () => {
  it('keeps only exact quotes from recorded external sources', async () => {
    const ref = await appearanceReference('species/fish', { scientificName: 'Test species', sections: [{ source: 'glaser', sourceUrl: photo.sourceUrl, html: '<p>The fish has three black body stripes.</p>' }, { source: 'aquatome', sourceUrl: 'https://aquatome.com/', html: '<p>A made-up appearance.</p>' }] }, async prompt => {
      expect(prompt).not.toContain('A made-up appearance')
      return { facts: [...reference.facts, { ...reference.facts[0]!, quote: 'The fish has five stripes.' }, { source: 'aquatome', sourceUrl: 'https://aquatome.com/', quote: 'A made-up appearance.' }] }
    })
    expect(ref.facts).toEqual(reference.facts)
    expect(referenceHash({ ...ref, facts: [] })).not.toBe(referenceHash(ref))
  })
  it('gives a page without an independent reference no generated pass', () => {
    expect(positiveGeneratedVerdict(passed(), { ...reference, facts: [] })).toBe(false)
    expect(hasGenerationReference({ ...reference, facts: [], images: [{ file: 'private', sourceUrl: photo.sourceUrl, sha256: hash }] })).toBe(false)
  })
  it.each(['unsure', 'fail'] as const)('does not let a %s verdict show', verdict => {
    expect(positiveGeneratedVerdict({ ...passed(), verdict }, reference)).toBe(false)
  })
  it('refuses a missing answer, unchecked feature, duplicate feature, anatomy fault, hand, text or logo', () => {
    const v = passed()
    for (const bad of [undefined, { ...v, features: [] }, { ...v, features: [v.features[0]!, v.features[0]!] }, { ...v, anatomy: 'unsure' as const }, { ...v, person: true }, { ...v, text: true }, { ...v, logo: true }]) expect(positiveGeneratedVerdict(bad, reference)).toBe(false)
    expect(positiveGeneratedVerdict(v, reference)).toBe(true)
  })
  it('requires a complete correct calibration, and invalidates it when the reviewer changes', () => {
    expect(generatedGateVersion()).toBe(APPROVED_GENERATED_GATE)
    const c = { ...generatedResults, model: generatedResults.reviewer } as Calibration
    expect(calibrationReady(c)).toBe(true)
    expect(calibrationReady({ ...c, cases: c.cases.map(x => x.id === 'neon-conflict' ? { ...x, actual: 'pass' } : x) })).toBe(false)
    expect(calibrationReady({ ...c, cases: c.cases.slice(1) })).toBe(false)
    expect(calibrationReady({ ...c, cases: c.cases.map(x => x.id === 'right-fish' ? { ...x, actual: 'unsure', reason: 'A second fish obscures its fins.' } : x) })).toBe(true)
    expect(calibrationReady({ ...c, cases: c.cases.map(x => x.id === 'right-fish' ? { ...x, actual: 'unsure', reason: '' } : x) })).toBe(false)
    expect(calibrationReady({ ...c, cases: c.cases.map(x => x.id.startsWith('lookalike-') ? { ...x, actual: 'pass' } : x) })).toBe(false)
    expect(calibrationReady({ ...c, cases: c.cases.map(x => x.id === 'neon-conflict' ? { ...x, conflicts: 0 } : x) })).toBe(false)
    expect(calibrationReady({ ...c, cases: c.cases.map(x => x.expected === 'refuse' ? { ...x, realReferenceHashes: [] } : x) })).toBe(false)
    expect(calibrationReady({ ...c, version: 'b'.repeat(64) })).toBe(false)
  })
  it('refuses and lists source conflicts separately without changing the recorded sentence', () => {
    const v = { ...passed(), conflicts: [{ n: 1, note: 'The real reference has two stripes.' }] }
    expect(positiveGeneratedVerdict(v, reference)).toBe(false)
    const conflicts = sourceConflicts(reference, v, '2026-11-10')
    expect(activeSourceConflicts(reference.page, { scientificName: reference.scientificName, sections: [{ source: 'glaser', sourceUrl: photo.sourceUrl, html: reference.facts[0]!.quote }] }, conflicts)).toEqual(conflicts)
    expect(sourceConflicts(reference, v, '2026-11-10')).toEqual([{ page: reference.page, ...reference.facts[0], note: v.conflicts[0]!.note, referenceHash: referenceHash(reference), at: '2026-11-10' }])
  })
  it('does not let the old photo check stand in for generated approval', () => {
    const g: GeneratedRecord = { model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', prompt: 'fish', date: '2026-11-10', referenceHash: hash }
    expect(generatedApproved({ generated: g })).toBe(false)
    expect(generatedApproved({ generated: { ...g, check: { verdict: 'pass', version: APPROVED_GENERATED_GATE, model: 'gpt-5.6-sol', at: 'today', referenceHash: hash, pixelHash: hash, calibrationHash: hash } } })).toBe(true)
  })
})

describe('source ownership, permission and the immutable original', () => {
  it('requires both switches and a dated approval, separate from ordinary photo permission', () => {
    expect(canRemoveMark(photo, source, mark)).toBe(false)
    expect(canRemoveMark(photo, { ...source, permission: { ...source.permission!, markRemoval: undefined } }, mark, switches)).toBe(false)
    expect(canRemoveMark(photo, { ...source, permission: { ...source.permission!, markRemoval: { allowed: false } } }, mark, switches)).toBe(false)
    expect(canRemoveMark(photo, source, mark, switches)).toBe(true)
  })
  it('never cleans third-party, stock, different-site or unproven signatures even if classified source-owned', () => {
    for (const m of [{ ...mark, owner: 'third-party' as const }, { ...mark, owner: 'unknown' as const }, { ...mark, text: 'Getty Images / Aquarium Glaser' }, { ...mark, text: 'Aquarium Glaser another-site.com' }, { ...mark, owner: 'photographer' as const, text: 'Unrecorded signature' }]) expect(ownsMark(photo, source, m)).toBe(false)
    expect(ownsMark({ ...photo, author: 'Recorded Studio / Aquarium Glaser' }, source, { ...mark, owner: 'photographer', text: 'Recorded Studio' })).toBe(true)
  })
  it('never alters an ND or unknown licence', () => {
    expect(alterationAllowed({ ...photo, licence: 'CC BY-ND 4.0' })).toBe(false)
    expect(alterationAllowed({ ...photo, licence: 'all rights reserved' })).toBe(false)
    expect(alterationAllowed({ ...photo, licence: 'CC BY-SA 4.0' })).toBe(true)
  })
  it('repaints only the approved box and verifies every outside pixel after encoding', async () => {
    const original = await pattern(), before = sha256(original)
    const edit = await sharp({ create: { width: 50, height: 40, channels: 3, background: '#abcdef' } }).png().toBuffer()
    const result = await composeMarkPatch(original, edit, mark.box)
    expect(result.proof.outside).toBe(0)
    expect(result.proof.inside).toBeGreaterThan(0)
    expect(sha256(original)).toBe(before)
    const lossy = await sharp(result.bytes).jpeg({ quality: 70 }).toBuffer()
    expect((await outsideBoxProof(original, lossy, mark.box)).outside).toBeGreaterThan(0)
    await expect(composeMarkPatch(original, edit, { ...mark.box, x0: -1 })).rejects.toThrow('box')
  })
  it('requires the trial no-trace controls, including all three faint failures', () => {
    const c = { version: noTraceVersion(), cases: markResults.cases.map(x => ({ ...x, ...reviewed.marks.find(f => f.n === x.n)! })) } as import('../src/image-transforms').NoTraceCalibration
    expect(noTraceCalibrationReady(c)).toBe(true)
    expect(noTraceCalibrationReady({ ...c, cases: c.cases.map(x => x.n === 4 ? { ...x, actual: 'pass' } : x) })).toBe(false)
    expect(noTraceCalibrationReady({ ...c, version: 'old' })).toBe(false)
    expect(noTraceCalibrationReady({ ...c, cases: c.cases.slice(1) })).toBe(false)
  })
  it('a failed or uncertain no-trace check never returns a smeared replacement; the original survives', async () => {
    const original = await pattern(), cache = await folder(), edit = vi.fn(async () => sharp({ create: { width: 100, height: 80, channels: 3, background: '#abcdef' } }).png().toBuffer())
    for (const verdict of ['fail', 'unsure'] as const) {
      const noTrace = vi.fn(async () => ({ verdict, residual: true, newMark: false, note: 'faint band' }))
      const result = await removeSourceMark(photo, original, source, { ...mark, box: { x0: 0, y0: 0, x1: 100, y1: 80 } }, { cache, edit, noTrace, now: () => new Date() }, switches)
      expect(noTrace).toHaveBeenCalledOnce()
      expect(result).toBeUndefined()
      expect(await readFile(join(cache, 'alterations', sha256(original), 'original'))).toEqual(original)
    }
    expect(noTracePass({ verdict: 'pass', residual: true, newMark: false, note: '' })).toBe(false)
    expect(noTracePass({ verdict: 'pass', residual: false, newMark: true, note: '' })).toBe(false)
  })
})

describe('upscaling and provenance', () => {
  it('uses the large-copy bounds with separate real and generated switches', async () => {
    expect(upscaleSize({ width: 1774, height: 887 })).toEqual({ width: 2400, height: 1200 })
    const original = await pattern()
    expect(await upscalePhoto(photo, original)).toBeUndefined()
    expect(await upscalePhoto(photo, original, { ...IMAGE_SWITCHES, upscaleGenerated: true })).toBeUndefined()
    expect(await upscalePhoto({ ...photo, generated: {} as GeneratedRecord }, original)).toBeUndefined()
    const scaled = await upscalePhoto(photo, original, { ...IMAGE_SWITCHES, upscaleReal: true })
    expect(scaled?.altered[0]).toMatchObject({ method: 'lanczos3-upscale', originalHash: sha256(original) })
  })
  it('keeps the generated machine record in every variant, including prompt, model and date', async () => {
    const original = await sharp(await pattern()).resize(1800, 1200).png().toBuffer()
    const generated: GeneratedRecord = { model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', prompt: 'fish & plants <without text>', date: '2026-11-10', referenceHash: hash }
    const stored = new Map<string, Uint8Array>()
    const p = await storeImageVariants(original, { generated }, async (key, bytes) => { stored.set(key, bytes); return `https://media.example/${key}` })
    expect(stored.size).toBe(3)
    for (const bytes of stored.values()) {
      const xmp = (await sharp(bytes).metadata()).xmp?.toString() ?? ''
      expect(xmp).toContain('gpt-image-2'); expect(xmp).toContain('2026-11-10'); expect(xmp).toContain('fish &amp; plants &lt;without text&gt;')
    }
    const main = stored.get(p.url.replace('https://media.example/', ''))!
    expect(await pixelHash(main)).toBe(await pixelHash(await primaryImageBytes(original)))
  })
})

describe('unattended quota and durable cap', () => {
  it('refuses Terra before reading quota or starting a model', async () => {
    await expect(codexImageJson('test', {}, await folder(), [], undefined, 'gpt-6-terra')).rejects.toThrow('never Terra')
  })
  it('uses the live Codex bucket, not a different model bucket or stale session reading', () => {
    expect(quotaReading({ rateLimitsByLimitId: { codex: { limitId: 'codex', primary: { usedPercent: 89 }, secondary: { usedPercent: 20 } } } }).usedPercent).toBe(89)
    expect(() => quotaReading({ rateLimits: { limitId: 'other', primary: { usedPercent: 0 } } })).toThrow('unknown')
    for (const q of [quota(90), { ...quota(), at: '2000-01-01' }, { ...quota(), usedPercent: NaN }, { ...quota(), spendControlReached: true }]) expect(() => requireQuota(q)).toThrow()
  })
  it('reserves the last slot before generation and stops at 50 across another run', async () => {
    const dir = await folder(), generate = vi.fn(async (_p, _dir, admit) => (await admit('image-1'), native())), read = vi.fn(async () => quota())
    await writeFile(join(dir, 'ledger.json'), JSON.stringify({ version: 1, imported: IMAGE_CAP - 1, attempts: [] }))
    await meteredImage(dir, 'generated', 'fish', { quota: read, generate })
    await expect(meteredImage(dir, 'generated', 'fish', { quota: read, generate })).rejects.toThrow('cap')
    expect(generate).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(3)
  })
  it('counts failures, reads quota afterward, and refuses concurrent requests', async () => {
    const dir = await folder(), q = vi.fn(async () => quota())
    await expect(meteredImage(dir, 'generated', 'fish', { quota: q, generate: async (_p, _dir, admit) => (await admit('image-1'), Promise.reject(new Error('native failed'))) })).rejects.toThrow('native failed')
    const state = JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8'))
    expect(state.attempts[0].status).toBe('uncertain'); expect(q).toHaveBeenCalledTimes(2)
    let finish!: () => void
    const waiting = new Promise<void>(resolve => { finish = resolve })
    const first = meteredImage(dir, 'generated', 'fish', { quota: q, generate: async (_p, _dir, admit) => (await admit('image-1'), await waiting, native()) })
    await vi.waitFor(async () => expect(JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8')).attempts.length).toBe(3))
    await expect(meteredImage(dir, 'generated', 'fish', { quota: q, generate: async (_p, _dir, admit) => (await admit('image-1'), native()) })).rejects.toThrow('locked')
    finish(); await first
  })
})
