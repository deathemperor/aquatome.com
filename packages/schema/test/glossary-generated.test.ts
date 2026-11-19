import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test } from 'vitest'
import { GLOSSARY_KIND_APPROVALS, GLOSSARY_KIND_IMAGES, GLOSSARY_KIND_REVIEW_POLICY, IMAGE_SWITCHES, generatedApproved, glossaryKindApproved, kindCanonical, kindEntryCanonical, kindPhotoCanonical, loadAll, type GlossaryKindApproval, type Photo } from '../src/index'

const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const body = '<h3>Các loại nền</h3><ul><li><strong>Cốt nền</strong>: Lớp lót ở dưới lớp đất.</li></ul>'
const facts = { found: true, facts: [{ section: 'kinds', fact: 'The base layer is below the soil.', source: 0 }], sources: [{ url: 'https://example.org/source' }] }
const photo: Photo = { url: 'https://media.aquatome.com/generated/glossary/fixture.webp', width: 800, height: 600, author: 'AI', licence: 'AI-generated', sourceUrl: 'https://aquatome.com/thuat-ngu/fixture/', caption: 'Hình minh họa vị trí của hai lớp.', generated: { model: 'unreported', driverModel: 'gpt-6.1-sol', date: '2026-11-17', prompt: 'Two layers, base below soil.', referenceHash: hash('independent source reference'), pixelHash: hash('decoded pixels') } }
const term = { id: 'fixture', en: 'Substrate', refs: [{ url: 'https://example.org/source', title: 'Source facts' }] }
const crop = { x0: 0, y0: 300, x1: 400, y1: 600 }
const current = () => ({ term: term.id, kind: 'cot-nen', recordHash: hash(kindPhotoCanonical(photo, crop)), entryHash: hash(kindEntryCanonical(term, 'cot-nen', body)!), factsHash: hash(kindCanonical(facts)), rejected: false, screened: true, realPhotoAvailable: false, cardCrop: crop })
const approval = (): GlossaryKindApproval => ({ page: 'glossary/fixture', kind: 'cot-nen', recordHash: current().recordHash, entryHash: current().entryHash, factsHash: current().factsHash, referenceHash: photo.generated!.referenceHash, pixelHash: photo.generated!.pixelHash!, policy: GLOSSARY_KIND_REVIEW_POLICY, noUsableRealPhoto: true, inputImages: 0, conflicts: [], ownerSeen: { date: '2026-11-17' }, ownerApproved: { date: '2026-11-17' }, checks: { curation: { verdict: 'pass', hash: hash('curation receipt') }, glossary: { verdict: 'pass', hash: hash('glossary receipt') } } })

test('two independent kind reads can approve an honestly unreported renderer without qualifying a fish', () => {
  expect(glossaryKindApproved(photo, approval(), current())).toBe(true)
  expect(generatedApproved(photo)).toBe(false)
  expect(Object.values(IMAGE_SWITCHES).every(v => !v)).toBe(true)
  expect(GLOSSARY_KIND_IMAGES.on).toBe(false)
})

test('each current fact, entry, picture and approval identity is required independently', () => {
  for (const field of ['page', 'kind', 'recordHash', 'entryHash', 'factsHash', 'referenceHash', 'pixelHash', 'policy'] as const) {
    const changed = { ...approval(), [field]: 'changed' }
    expect(glossaryKindApproved(photo, changed, current()), field).toBe(false)
  }
  for (const c of [{ ...current(), entryHash: undefined }, { ...current(), factsHash: undefined }, { ...current(), rejected: true }, { ...current(), screened: false }, { ...current(), realPhotoAvailable: true }]) expect(glossaryKindApproved(photo, approval(), c)).toBe(false)
  for (const a of [null, {}, { ...approval(), noUsableRealPhoto: false }, { ...approval(), inputImages: 1 }, { ...approval(), conflicts: ['unsettled visible conflict'] }, { ...approval(), ownerSeen: { date: '2026-02-30' } }, { ...approval(), ownerApproved: undefined }, { ...approval(), ownerApproved: { date: '2026-02-30' } }, { ...approval(), ownerApproved: { date: '2026-11-16' } }]) expect(glossaryKindApproved(photo, a, current())).toBe(false)
})

test('one pass, identical receipts or a different use never replaces the independent pair', () => {
  const a = approval()
  expect(glossaryKindApproved(photo, { ...a, checks: { ...a.checks, glossary: { ...a.checks.glossary, verdict: 'unsure' } } }, current())).toBe(false)
  expect(glossaryKindApproved(photo, { ...a, checks: { ...a.checks, glossary: { verdict: 'pass', hash: a.checks.curation.hash } } }, current())).toBe(false)
  expect(glossaryKindApproved(photo, { ...a, page: 'species/fixture' }, current())).toBe(false)
  expect(glossaryKindApproved({ ...photo, generated: { ...photo.generated!, driverModel: 'terra' } }, a, current())).toBe(false)
  expect(glossaryKindApproved(photo, a, { ...current(), cardCrop: { ...crop, x1: 900 } })).toBe(false)
})

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))) })
async function fixture() {
  const repo = await mkdtemp(join(tmpdir(), 'aq-kind-generated-')); dirs.push(repo)
  const root = join(repo, 'content')
  await cp(fileURLToPath(new URL('./fixtures/store', import.meta.url)), root, { recursive: true })
  await mkdir(join(root, 'glossary/fixture'), { recursive: true })
  await writeFile(join(root, 'glossary/fixture/entity.json'), JSON.stringify({ ...term, photos: [photo], kinds: [{ id: 'cot-nen', photo, cardCrop: crop }] }))
  await writeFile(join(root, 'glossary/fixture/vi.json'), JSON.stringify({ slug: 'fixture', name: 'Nền thử', altNames: [], sections: {}, body, quality: { score: 1, indexable: true } }))
  await mkdir(join(repo, 'engine-state/glossary'), { recursive: true })
  await writeFile(join(repo, 'engine-state/glossary/fixture.json'), JSON.stringify(facts))
  await writeFile(join(repo, 'engine-state/_photo-rejected.json'), '{}')
  await writeFile(join(repo, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [photo.url]: { ocr: [] } }))
  await writeFile(join(root, GLOSSARY_KIND_APPROVALS), JSON.stringify({ photos: { [photo.url]: approval() } }))
  const load = (on = true) => loadAll({ root, lang: 'vi', publicBuild: true, glossaryKindImages: on, photoScreen: 'required' })
  return { repo, root, load, shown: async () => (await load()).glossary.find(g => g.id === term.id)! }
}

test('enabled loader admits only the approved kind, never the term top or a species; off is off', async () => {
  const f = await fixture(), before = await readFile(join(f.root, 'glossary/fixture/entity.json'), 'utf8')
  const c = await f.load(), g = c.glossary.find(g => g.id === term.id)!
  expect(g.kinds?.map(k => k.photo.url)).toEqual([photo.url]); expect(g.photos).toEqual([])
  // Curation's explicit-image path uses this same callback before serving any calendar image.
  expect(c.photoWaits?.(photo.url)).toBe(true)
  expect(c.photoWaits?.(photo.url.replace('.webp', '-large.webp'))).toBe(true)
  expect(c.photoWaits?.(photo.url.replace('.webp', '-480.webp'))).toBe(true)
  expect((await f.load(false)).glossary.find(g => g.id === term.id)?.kinds).toEqual([])
  const file = join(f.root, 'species/alpha/entity.json'), entity = JSON.parse(await readFile(file, 'utf8')); entity.photos = [photo]; await writeFile(file, JSON.stringify(entity))
  expect((await f.load()).species[0]?.photos).toEqual([])
  expect(await readFile(join(f.root, 'glossary/fixture/entity.json'), 'utf8')).toBe(before)
})

test('stale facts, rejection, missing screen and a withdrawn approval each close a formerly positive loader', async () => {
  const f = await fixture(); expect((await f.shown()).kinds).toHaveLength(1)
  const source = join(f.repo, 'engine-state/glossary/fixture.json'); await writeFile(source, JSON.stringify({ ...facts, facts: [...facts.facts, { section: 'kinds', fact: 'Changed source fact.', source: 0 }] }))
  expect((await f.shown()).kinds).toEqual([]); await writeFile(source, JSON.stringify(facts))
  await writeFile(join(f.repo, 'engine-state/_photo-rejected.json'), JSON.stringify({ [photo.url]: 'refused' })); expect((await f.shown()).kinds).toEqual([])
  await writeFile(join(f.repo, 'engine-state/_photo-rejected.json'), '{}')
  await writeFile(join(f.repo, 'engine-state/_photo-watermarks.json'), '{}'); expect((await f.shown()).kinds).toEqual([])
  await writeFile(join(f.repo, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [photo.url]: { ocr: [], watermark: true } })); expect((await f.shown()).kinds).toEqual([])
  await writeFile(join(f.repo, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [photo.url]: { ocr: [] } }))
  await writeFile(join(f.root, GLOSSARY_KIND_APPROVALS), '{"photos":{}}'); expect((await f.shown()).kinds).toEqual([])
})

test('a real replacement is the whole record, with no generated fields or dependency on the old approval', async () => {
  const f = await fixture(); expect((await f.shown()).kinds).toHaveLength(1)
  const { generated: _generated, ...rest } = photo, real: Photo = { ...rest, url: 'https://media.aquatome.com/real-kind.webp', author: 'Fixture source', licence: 'CC0' }
  const file = join(f.root, 'glossary/fixture/entity.json'), entity = JSON.parse(await readFile(file, 'utf8')); entity.kinds = [{ id: 'cot-nen', photo: real }]; await writeFile(file, JSON.stringify(entity))
  await writeFile(join(f.repo, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [real.url]: { ocr: [] } }))
  const g = await f.shown(); expect(g.kinds?.[0]?.photo).toEqual(real); expect(g.kinds?.[0]?.photo.generated).toBeUndefined(); expect(g.kinds?.[0]?.cardCrop).toBeUndefined()
})

test('an entry edit, a changed card window or label corner, and a merely seen sheet all hold a formerly approved picture', async () => {
  const f = await fixture(); expect((await f.shown()).kinds).toHaveLength(1)
  const file = join(f.root, 'glossary/fixture/entity.json'), original = await readFile(file, 'utf8')
  for (const changed of [{ cardCrop: { x0: 4, y0: 300, x1: 404, y1: 600 } }, { aiLabelCorner: 'top-right' }]) {
    const entity = JSON.parse(original); Object.assign(entity.kinds[0], changed)
    await writeFile(file, JSON.stringify(entity)); expect((await f.shown()).kinds).toEqual([])
  }
  await writeFile(file, original)
  const translated = join(f.root, 'glossary/fixture/vi.json'), text = await readFile(translated, 'utf8')
  const entry = JSON.parse(text); entry.body = body.replace('Lớp lót', 'Lớp nền')
  await writeFile(translated, JSON.stringify(entry)); expect((await f.shown()).kinds).toEqual([])
  await writeFile(translated, text)
  const { ownerApproved: _, ...seenOnly } = approval()
  await writeFile(join(f.root, GLOSSARY_KIND_APPROVALS), JSON.stringify({ photos: { [photo.url]: seenOnly } }))
  expect((await f.shown()).kinds).toEqual([])
})

test('malformed or missing kind evidence closes the gate; missing global screen still stops the public build', async () => {
  const f = await fixture(); expect((await f.shown()).kinds).toHaveLength(1)
  for (const file of [join(f.root, GLOSSARY_KIND_APPROVALS), join(f.repo, 'engine-state/glossary/fixture.json'), join(f.repo, 'engine-state/_photo-rejected.json')]) {
    const bytes = await readFile(file, 'utf8')
    await writeFile(file, '{'); expect((await f.shown()).kinds).toEqual([])
    await writeFile(file, bytes)
    await rm(file); expect((await f.shown()).kinds).toEqual([])
    await writeFile(file, bytes); expect((await f.shown()).kinds).toHaveLength(1)
  }
  const screen = join(f.repo, 'engine-state/_photo-watermarks.json')
  await writeFile(screen, '{'); await expect(f.shown()).rejects.toThrow()
  await rm(screen); await expect(f.shown()).rejects.toThrow(/screen/)
})
