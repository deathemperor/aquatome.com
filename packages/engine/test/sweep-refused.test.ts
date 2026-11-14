import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { checkPagePhotos } from '../src/photo-check'
// @ts-expect-error plain .mjs git merge driver
import { mergeMaps } from '../../../scripts/merge-json-map.mjs'
import { sweep } from '../src/sweep'

// A photo the check refused, put back between two checks by a source read or the monthly backfill, stays off: on the
// page that refused it, and with nothing of a fish or a plant in it, on every page of that kind (the chief of staff,
// 2026-11-13, after five Seriously Fish river views were still on six species pages that had never judged them).
const photo = (name: string) => ({ url: `https://media.aquatome.com/seriouslyfish/${name}.webp`, width: 1200, height: 800, licence: 'dùng với sự cho phép', author: 'Seriously Fish', sourceUrl: 'https://www.seriouslyfish.com/x', source: 'seriouslyfish' })
const fish = (id: string, photos: object[]) => ({ id, scientificName: id.replace('-', ' '), order: 'O', family: 'F', genus: id.split('-')[0], group: 'g', places: [], dataCard: {}, sections: [], photos, videos: [], productSlots: [], updatedAt: '2026-10-01' })
const verdict = (ok: string) => ({ ok, typical: false, person: false, logo: false, note: `subject ${ok}` })

async function store(o: { pages: Record<string, object[]>; albums?: Record<string, object[]>; breeds?: Record<string, object[]>; plants?: Record<string, object[]>; guides?: Record<string, object[]>; subjects: Record<string, Record<string, object>>; picks?: Record<string, string>; legacy?: Record<string, object> }) {
  const root = await mkdtemp(join(tmpdir(), 'sweep-refused-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  for (const [id, ps] of Object.entries(o.pages)) { await put(`species/${id}/entity.json`, fish(id, ps)); await put(`species/${id}/vi.json`, { slug: id, name: id, altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }) }
  for (const [id, ps] of Object.entries(o.plants ?? {})) await put(`plants/${id}/entity.json`, fish(id, ps))
  for (const [id, ps] of Object.entries(o.breeds ?? {})) await put(`breeds/${id}/entity.json`, { id, kind: 'variety', parents: [], care: {}, photos: ps, sources: [{ url: 'https://x/a', title: 'A', kind: 'article', at: '2026-10-01' }], updatedAt: '2026-10-01' })
  for (const [id, ps] of Object.entries(o.albums ?? {})) await put(`gallery/${id}.json`, { id, photos: ps, seen: 1, updatedAt: '2026-10-01' })
  for (const [id, ps] of Object.entries(o.guides ?? {})) await put(`guides/${id}/entity.json`, { id, kind: 'care', source: 'seriouslyfish', sourceUrl: 'https://x/g', html: '', photos: ps, mentions: [], updatedAt: '2026-10-01' })
  const subjects = Object.fromEntries(Object.entries(o.subjects).map(([name, by]) => [photo(name).url, by]))
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), `${JSON.stringify(subjects, null, 2)}\n`)
  if (o.legacy) await writeFile(join(root, 'engine-state/_photo-check.json'), `${JSON.stringify(Object.fromEntries(Object.entries(o.legacy).map(([name, v]) => [photo(name).url, v])), null, 2)}\n`)
  if (o.picks) await writeFile(join(root, 'engine-state/_photo-head-picks.json'), `${JSON.stringify(Object.fromEntries(Object.entries(o.picks).map(([ref, name]) => [ref, photo(name).url])), null, 2)}\n`)
  return root
}
const photosOf = async (root: string, path: string) => (JSON.parse(await readFile(join(root, 'content', path), 'utf8')).photos as { url: string }[]).map(p => p.url.split('/').pop()!.replace('.webp', ''))

test('a photo a page refused comes off that page and its album when a source read puts it back; a page that has not judged it keeps it', async () => {
  const root = await store({
    pages: { 'corydoras-a': [photo('a-own'), photo('sterbai')], 'corydoras-sterbai': [photo('sterbai')], 'corydoras-b': [photo('b-own'), photo('sterbai')] },
    albums: { 'corydoras-a': [photo('a-album'), photo('sterbai')] },
    subjects: { sterbai: { 'corydoras-a': verdict('other'), 'corydoras-sterbai': verdict('yes') } },
  })
  const r = await sweep(root)
  expect(await photosOf(root, 'species/corydoras-a/entity.json')).toEqual(['a-own'])
  expect(await photosOf(root, 'gallery/corydoras-a.json')).toEqual(['a-album'])
  expect(await photosOf(root, 'species/corydoras-sterbai/entity.json')).toEqual(['sterbai'])
  expect(await photosOf(root, 'species/corydoras-b/entity.json')).toEqual(['b-own', 'sterbai'])
  expect(r.refused.sort()).toEqual([`gallery/corydoras-a.json: ${photo('sterbai').url} (refused here)`, `species/corydoras-a/entity.json: ${photo('sterbai').url} (refused here)`])
  expect(r.refusedHeld).toEqual([])
})

test('a river view one fish page calls "none" comes off every fish and breed page and album that never judged it; a plant page and a guide keep it', async () => {
  const root = await store({
    pages: { 'corydoras-metae': [], 'corydoras-simulatus': [photo('simulatus'), photo('river')] },
    albums: { 'corydoras-simulatus': [photo('river'), photo('simulatus-album')] },
    breeds: { koi: [photo('koi'), photo('river')] },
    plants: { 'ludwigia-brevipes': [photo('ludwigia'), photo('river')] },
    guides: { habitats: [photo('river')] },
    subjects: { river: { 'corydoras-metae': verdict('none') } },
  })
  const r = await sweep(root)
  expect(await photosOf(root, 'species/corydoras-simulatus/entity.json')).toEqual(['simulatus'])
  expect(await photosOf(root, 'gallery/corydoras-simulatus.json')).toEqual(['simulatus-album'])
  expect(await photosOf(root, 'breeds/koi/entity.json')).toEqual(['koi'])
  expect(await photosOf(root, 'plants/ludwigia-brevipes/entity.json')).toEqual(['ludwigia', 'river'])
  expect(await photosOf(root, 'guides/habitats/entity.json')).toEqual(['river'])
  expect(r.refused.filter(x => x.endsWith('(nothing of a fish)'))).toHaveLength(3)
  // A plant page's "none" is the same for plant pages only.
  const plants = await store({
    pages: { 'corydoras-c': [photo('c'), photo('tank')] },
    plants: { 'pogostemon-d': [], 'ludwigia-brevipes': [photo('ludwigia'), photo('tank')] },
    subjects: { tank: { 'pogostemon-d': verdict('none') } },
  })
  await sweep(plants)
  expect(await photosOf(plants, 'plants/ludwigia-brevipes/entity.json')).toEqual(['ludwigia'])
  expect(await photosOf(plants, 'species/corydoras-c/entity.json')).toEqual(['c', 'tank'])
})

test('a "none" stays where it is when another fish page sees something in the photo', async () => {
  for (const seen of ['yes', 'unsure', 'other', 'dead']) {
    const root = await store({
      pages: { 'fish-a': [], 'fish-b': [photo('b'), photo('lake')], 'fish-c': [photo('c'), photo('lake')] },
      subjects: { lake: { 'fish-a': verdict('none'), 'fish-b': verdict(seen) } },
    })
    await sweep(root)
    expect(await photosOf(root, 'species/fish-c/entity.json')).toEqual(['c', 'lake'])
  }
})

test('a head a person picked is out of the "none" rule on every page and listed each cycle; a page whose own verdict refuses it still loses it', async () => {
  const root = await store({
    pages: { 'fish-p': [photo('pick'), photo('p')], 'fish-q': [photo('q'), photo('pick')], 'fish-e': [photo('e'), photo('pick')] },
    subjects: { pick: { 'fish-p': verdict('none'), 'fish-q': verdict('other') } },
    picks: { 'species/fish-p': 'pick' },
  })
  const r = await sweep(root)
  expect(await photosOf(root, 'species/fish-p/entity.json')).toEqual(['pick', 'p'])
  expect(await photosOf(root, 'species/fish-q/entity.json')).toEqual(['q'])
  expect(await photosOf(root, 'species/fish-e/entity.json')).toEqual(['e', 'pick'])
  expect(r.refusedPicked).toEqual([`species/fish-p: ${photo('pick').url}`])
})

test('a run that would leave a page with no photo of its own takes nothing off it or its album and lists it, one page as eleven', async () => {
  // A page's last photo doesn't come off on the check's word alone (the chief of staff, 2026-11-14; EMPTY_CAP).
  for (const n of [11, 1]) {
    const pages = Object.fromEntries(Array.from({ length: n }, (_, i) => [`fish-${i}`, [photo(`only-${i}`)]]))
    const subjects = Object.fromEntries(Array.from({ length: n }, (_, i) => [`only-${i}`, { [`fish-${i}`]: verdict('other') }]))
    const root = await store({ pages: { ...pages, 'fish-kept': [photo('kept'), photo('stray')] }, albums: { 'fish-0': [photo('only-0')] }, subjects: { ...subjects, stray: { 'fish-kept': verdict('other') } } })
    const r = await sweep(root)
    expect(await photosOf(root, 'species/fish-0/entity.json')).toEqual(['only-0'])
    expect(await photosOf(root, 'gallery/fish-0.json')).toEqual(['only-0'])
    expect(r.refusedHeld).toHaveLength(n)
    expect(r.refusedHeld[0]).toBe('species/fish-0 (would be left with no photo: a person looks first)')
    // A page the rule doesn't empty loses its refused photo either way.
    expect(await photosOf(root, 'species/fish-kept/entity.json')).toEqual(['kept'])
  }
})

test('a head a person picked stays on the pages and albums that never judged it, though every verdict on it is "none"', async () => {
  const root = await store({
    pages: { 'fish-p': [photo('pick'), photo('p')], 'fish-e': [photo('e'), photo('pick')] },
    albums: { 'fish-e': [photo('pick'), photo('e-album')] },
    subjects: { pick: { 'fish-p': verdict('none') } },
    picks: { 'species/fish-p': 'pick' },
  })
  const r = await sweep(root)
  expect(await photosOf(root, 'species/fish-p/entity.json')).toEqual(['pick', 'p'])
  expect(await photosOf(root, 'species/fish-e/entity.json')).toEqual(['e', 'pick'])
  expect(await photosOf(root, 'gallery/fish-e.json')).toEqual(['pick', 'e-album'])
  expect(r.refusedPicked).toEqual([`species/fish-p: ${photo('pick').url}`])
  expect(r.refused).toEqual([])
})

test('the pages a run of the check held stay as it left them, though the sweep alone would count too few to hold them (a person in the eleventh)', async () => {
  const n = 10
  const pages = Object.fromEntries(Array.from({ length: n + 1 }, (_, i) => [`fish-${i}`, [photo(`only-${i}`)]]))
  const subjects = Object.fromEntries(Array.from({ length: n }, (_, i) => [`only-${i}`, { [`fish-${i}`]: verdict('other') }]))
  const root = await store({ pages, albums: { 'fish-0': [photo('only-0')] }, subjects: { ...subjects, [`only-${n}`]: { [`fish-${n}`]: { ...verdict('yes'), typical: true, person: true } } } })
  const check = await checkPagePhotos(root, { get: async () => { throw new Error('no photo is fetched') }, look: async () => { throw new Error('no photo is judged') } }, { limit: 10 })
  expect(check.heads.held).toHaveLength(n + 1)
  expect(Object.keys(JSON.parse(await readFile(join(root, 'engine-state/_photo-held.json'), 'utf8')))).toHaveLength(n + 1)
  const r = await sweep(root)
  for (let i = 0; i < n; i++) expect(await photosOf(root, `species/fish-${i}/entity.json`)).toEqual([`only-${i}`])
  expect(await photosOf(root, 'gallery/fish-0.json')).toEqual(['only-0'])
  expect(r.refusedHeld).toContain('species/fish-0 (held by the photo check)')
  // Out of the check's hold, the sweep's own count holds them still: a page's last photo comes off only through a check
  // a person has released (EMPTY_CAP), which lists it never-again.
  await writeFile(join(root, 'engine-state/_photo-held.json'), '{}\n')
  const after = await sweep(root)
  expect(await photosOf(root, 'species/fish-0/entity.json')).toEqual(['only-0'])
  expect(after.refusedHeld).toContain('species/fish-0 (would be left with no photo: a person looks first)')
})

test("a guide's verdict, the first check's verdict and a generated photo don't take a photo off; a breed page's \"none\" acts on fish pages, a plant album goes with its plant", async () => {
  const generated = { ...photo('drawn'), generated: { model: 'gpt-image-2', driverModel: 'gpt-image-2', referenceHash: 'a'.repeat(64), date: '2026-11-10', prompt: 'fish' } }
  const root = await store({
    pages: { 'fish-g': [photo('g'), photo('by-guide'), photo('by-legacy'), generated], 'fish-h': [photo('h'), photo('bred-river')] },
    breeds: { koi: [photo('koi')] },
    plants: { 'pogostemon-d': [], 'ludwigia-brevipes': [photo('ludwigia')] },
    albums: { 'ludwigia-brevipes': [photo('ludwigia-album'), photo('tank')] },
    subjects: { 'by-guide': { 'fish-g': { ...verdict('other'), guide: true } }, drawn: { 'fish-g': verdict('other') }, 'bred-river': { koi: verdict('none') }, tank: { 'pogostemon-d': verdict('none') } },
    legacy: { 'by-legacy': { ...verdict('no') } },
  })
  await sweep(root)
  expect(await photosOf(root, 'species/fish-g/entity.json')).toEqual(['g', 'by-guide', 'by-legacy', 'drawn'])
  expect(await photosOf(root, 'species/fish-h/entity.json')).toEqual(['h'])
  expect(await photosOf(root, 'gallery/ludwigia-brevipes.json')).toEqual(['ludwigia-album'])
})

/** Ten pages whose only photo another page's verdict refuses, and an eleventh whose only photo has a person in it. */
async function elevenHeld() {
  const n = 10
  const pages = Object.fromEntries(Array.from({ length: n + 1 }, (_, i) => [`fish-${i}`, [photo(`only-${i}`)]]))
  const subjects = Object.fromEntries(Array.from({ length: n }, (_, i) => [`only-${i}`, { [`fish-${i}`]: verdict('other') }]))
  return store({ pages, subjects: { ...subjects, [`only-${n}`]: { [`fish-${n}`]: { ...verdict('yes'), typical: true, person: true } } } })
}
const noModel = { get: async () => { throw new Error('no photo is fetched') }, look: async () => { throw new Error('no photo is judged') } }

test('a check cut short after it saved its verdicts leaves its pages held: the hold is written before anything else', async () => {
  const root = await elevenHeld()
  // The never-again list is written after the verdicts: a write that fails there stops the run at that point.
  await mkdir(join(root, 'engine-state/_photo-rejected.json'))
  await expect(checkPagePhotos(root, noModel, { limit: 10 })).rejects.toThrow()
  expect(Object.keys(JSON.parse(await readFile(join(root, 'engine-state/_photo-held.json'), 'utf8')))).toHaveLength(11)
  await rm(join(root, 'engine-state/_photo-rejected.json'), { recursive: true })
  await sweep(root)
  expect(await photosOf(root, 'species/fish-0/entity.json')).toEqual(['only-0'])
})

test('two holds merged by the engine records\' merge driver keep both; a held file the sweep cannot read holds every page', async () => {
  const root = await elevenHeld()
  const merged = mergeMaps({}, { 'species/fish-0': true }, { 'species/fish-1': true })
  await writeFile(join(root, 'engine-state/_photo-held.json'), `${JSON.stringify(merged, null, 2)}\n`)
  const r = await sweep(root)
  expect(await photosOf(root, 'species/fish-0/entity.json')).toEqual(['only-0'])
  expect(await photosOf(root, 'species/fish-1/entity.json')).toEqual(['only-1'])
  // The others, out of the check's hold, the sweep's own count holds (EMPTY_CAP).
  expect(await photosOf(root, 'species/fish-2/entity.json')).toEqual(['only-2'])
  expect(r.refusedHeld.filter(x => x.endsWith('(held by the photo check)')).sort()).toEqual(['species/fish-0 (held by the photo check)', 'species/fish-1 (held by the photo check)'])
  for (const bad of ['["species/fish-3"]', '{"0": "species/fish-3"}', '{"species/fish-3": tr']) {
    const again = await elevenHeld()
    await writeFile(join(again, 'engine-state/_photo-held.json'), bad)
    const out = await sweep(again)
    expect(await photosOf(again, 'species/fish-3/entity.json')).toEqual(['only-3'])
    expect(out.refused).toEqual([])
    expect(out.refusedHeld[0]).toMatch(/unreadable: nothing taken off/)
  }
})
