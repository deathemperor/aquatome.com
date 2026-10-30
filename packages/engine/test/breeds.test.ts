import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { breedPhotos, makeBreed, type BreedFacts } from '../src/breeds'
import type { GalleryDeps } from '../src/gallery'

const facts: BreedFacts = {
  found: true, kind: 'variety', enNames: ['Ranchu goldfish', 'Ranchu'], viNames: [{ name: 'Cá vàng Ranchu', source: 0 }],
  basedOn: 'Carassius auratus',
  parents: [],
  // Source 1 is dropped, and with it the fact that cites it.
  origin: [{ fact: 'developed in Japan from lionhead stock', source: 0 }, { fact: 'first bred in 1986', source: 1 }], looks: [{ fact: 'no dorsal fin, wen on the head', source: 2 }], lines: [],
  care: [
    { field: 'tempC', min: 24.4, max: 18.3, source: 0 }, // reversed, from °F: stored as 18–24
    { field: 'ph', min: 7, max: 8, source: 1 }, // its source is a javascript: link, so the value goes with it
    { field: 'sizeCm', min: 15, max: 15, source: 2 },
    { field: 'tankCm', min: 2, max: 2, source: 2 }, // out of bounds
  ],
  keeping: [], breeding: [], health: [{ fact: 'swim bladder problems are common', source: 2 }], buying: [], controversy: [],
  commons: 'Category:Ranchu',
  sources: [{ url: 'https://breeder.example', title: 'Breeder', kind: 'breeder' }, { url: 'javascript:alert(1)', title: 'x', kind: 'other' }, { url: 'https://article.example', title: 'Article', kind: 'article' }],
}

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-breed-'))
  await mkdir(join(r, 'content/species/carassius-auratus'), { recursive: true })
  await writeFile(join(r, 'content/species/carassius-auratus/entity.json'), JSON.stringify({ scientificName: 'Carassius auratus' }))
  // A species already uses the address the name would get: the breed takes another.
  await writeFile(join(r, 'content/species/carassius-auratus/vi.json'), JSON.stringify({ slug: 'ca-vang-ranchu' }))
  return r
}

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#c33' } }).jpeg().toBuffer()
const files = Array.from({ length: 6 }, (_, i) => `File:R${i}.jpg`)
const gallery = (prompts: string[]): GalleryDeps => ({
  http: async u => {
    const q = new URL(u).searchParams
    if (q.get('list') === 'categorymembers') return q.get('cmtitle') === 'Category:Ranchu' ? { query: { categorymembers: files.map(title => ({ ns: 6, title })) } } : {}
    if (q.get('list') === 'search') return {}
    return { query: { pages: Object.fromEntries(q.get('titles')!.split('|').map((t, i) => [String(i), { title: t, imageinfo: [{ width: 2000, mime: 'image/jpeg', thumburl: `https://upload.wikimedia.org/x/1280px-${t.slice(5)}`, thumbwidth: 1280, thumbheight: 960, descriptionurl: `https://commons.wikimedia.org/wiki/${t}`, extmetadata: { LicenseShortName: { value: 'CC BY 2.0' }, Artist: { value: 'Ann' } } }] }])) } }
  },
  get: async () => new Uint8Array(await jpeg),
  faces: async f => f.map(() => 0),
  look: async (_file, prompt) => { prompts.push(prompt); return { keep: files.map((_, i) => ({ n: i + 1, caption: `Ranchu ${i + 1}` })), best: [6] } },
  sleep: async () => {},
  now: () => new Date('2026-10-30T00:00:00Z'),
})

test('makeBreed: researched facts → Vietnamese page checked against them; species resolved, bad sources dropped with what cites them; photos split into page and gallery', async () => {
  const r = await root()
  const prompts: string[] = []
  const looks: string[] = []
  const research: Llm = async <T,>() => facts as T
  let checks = 0
  const llm: Llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if ('score' in ((a.schema as { properties: object }).properties)) return (++checks === 1 ? { score: 0.7, notes: ['"from 1800s" is not in the facts'] } : { score: 0.9, notes: [] }) as T
    return { name: 'Cá vàng Ranchu', altNames: ['Ranchu'], summary: ['Dòng cá vàng không vây lưng.'], body: '<h3>Nguồn gốc</h3><p onclick="x">Từ Nhật.</p>', faq: [{ q: 'Khó nuôi không?', a: 'Hay bị bệnh bong bóng.' }] } as T
  }
  const out = await makeBreed(r, { research, llm, gallery: gallery(looks) }, { name: 'Ranchu goldfish', kind: 'variety' })
  expect(out).toMatchObject({ id: 'ranchu-goldfish', slug: 'ca-vang-ranchu-dong', score: 0.9, photos: '6 of 6' })
  // The checker's notes went into one rewrite.
  expect(prompts.filter(p => p.includes('"from 1800s" is not in the facts'))).toHaveLength(1)
  expect(prompts.filter(p => p.includes('first bred in 1986'))).toEqual([])
  expect(looks[0]).toContain('keep only photos of it, not other varieties')

  const read = async (f: string) => JSON.parse(await readFile(join(r, 'content', f), 'utf8'))
  const e = await read('breeds/ranchu-goldfish/entity.json')
  expect(e).toMatchObject({ kind: 'variety', basedOn: 'carassius-auratus', commons: 'Category:Ranchu', parents: [] })
  expect(e.sources.map((s: { url: string }) => s.url)).toEqual(['https://breeder.example', 'https://article.example'])
  expect(e.care).toEqual({ tempC: [{ source: 0, value: { min: 18, max: 24 } }], sizeCm: [{ source: 1, value: 15 }] })
  expect(e.photos).toHaveLength(4)
  expect(e.photos[0].caption).toBe('Ranchu 6') // the sheet's best first
  const vi = await read('breeds/ranchu-goldfish/vi.json')
  expect(vi).toMatchObject({ name: 'Cá vàng Ranchu', body: '<h3>Nguồn gốc</h3><p>Từ Nhật.</p>', quality: { score: 0.9, indexable: true } })
  // "Ranchu" is in the title already.
  expect(vi.altNames).toEqual(['Ranchu goldfish'])
  expect((await read('gallery/ranchu-goldfish.json')).photos).toHaveLength(2)
  // Kept for --redo.
  expect(JSON.parse(await readFile(join(r, 'engine-state/breeds/ranchu-goldfish.json'), 'utf8')).commons).toBe('Category:Ranchu')
})

test('a hybrid: parents keep their doubt and link the species we have', async () => {
  const r = await root()
  const hybrid: BreedFacts = { ...facts, kind: 'hybrid', basedOn: undefined, commons: undefined, care: [], parents: [{ name: 'Goldfish', scientificName: 'Carassius auratus (syn. C. gibelio auratus)', certain: true, source: 0 }, { name: 'Crucian carp', certain: false, source: 2 }] }
  const llm: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá lai X', altNames: [], parentNames: ['Cá vàng (Carassius auratus)', 'Cá diếc'], summary: [], body: '', faq: [] }) as T
  await makeBreed(r, { research: (async () => hybrid) as Llm, llm, gallery: gallery([]) }, { name: 'X hybrid' })
  const e = JSON.parse(await readFile(join(r, 'content/breeds/x-hybrid/entity.json'), 'utf8'))
  expect(e.parents).toEqual([{ name: 'Cá vàng (Carassius auratus)', species: 'carassius-auratus', certain: true }, { name: 'Cá diếc', certain: false }])
  expect(e.basedOn).toBeUndefined()
})

test('--redo keeps a name the owner fixed and the addresses the page had', async () => {
  const r = await root()
  const llm: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá vàng Ranchu', altNames: [], summary: [], body: '', faq: [] }) as T
  const d = { research: (async () => facts) as Llm, llm, gallery: gallery([]) }
  await makeBreed(r, d, { name: 'Ranchu goldfish' })
  const file = join(r, 'content/breeds/ranchu-goldfish/vi.json')
  const vi = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(file, JSON.stringify({ ...vi, slug: 'ca-vang-lan-tho', name: 'Cá vàng Lan thọ (Ranchu)', nameFixed: true, redirectFrom: [{ slug: vi.slug, name: vi.name }] }))
  await makeBreed(r, d, { name: 'Ranchu goldfish' }, { reuse: true })
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ slug: 'ca-vang-lan-tho', name: 'Cá vàng Lan thọ (Ranchu)', nameFixed: true, redirectFrom: [{ slug: 'ca-vang-ranchu-dong' }] })
})

test('something research could not find (or a wild species) is skipped, nothing written', async () => {
  const r = await root()
  const out = await makeBreed(r, { research: (async () => ({ ...facts, found: false })) as Llm, llm: (async () => { throw new Error('not called') }) as Llm, gallery: gallery([]) }, { name: 'Nope' })
  expect(out.skipped).toMatch(/not a man-made/)
})

test('breed-photos: a page with no photo gets them from a word search on Commons (not the exact phrase), best first; a month before the next try', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-breed-photos-'))
  // Halfmoon's page already shows R0: a photo is never on two breed pages (Commons rarely says which line a fish is).
  for (const [id, photos] of [['crowntail-betta', []], ['halfmoon-betta', [{ url: 'https://media.aquatome.com/commons/r0.webp', sourceUrl: 'https://commons.wikimedia.org/wiki/File:R0.jpg' }]]] as const) {
    await mkdir(join(r, 'content/breeds', id), { recursive: true })
    await writeFile(join(r, 'content/breeds', id, 'entity.json'), JSON.stringify({ id, kind: 'variety', photos }))
    await writeFile(join(r, 'content/breeds', id, 'vi.json'), JSON.stringify({ name: `vi ${id}` }))
  }
  await mkdir(join(r, 'engine-state'), { recursive: true })
  const searches: string[] = []
  const prompts: string[] = []
  const g = gallery(prompts)
  const d: GalleryDeps = { ...g, http: async u => {
    const q = new URL(u).searchParams
    if (q.get('list') === 'search') { searches.push(q.get('srsearch')!); return { query: { search: files.map(title => ({ title })) } } }
    if (q.get('list') === 'categorymembers') return {}
    return g.http(u)
  } }
  const rep = await breedPhotos(r, d, {})
  expect(rep.done).toEqual(['crowntail-betta: 5 of 5'])
  expect(searches).toEqual(['filetype:bitmap crowntail betta'])
  expect(prompts[0]).toContain('crowntail betta (vi crowntail-betta)')
  expect(prompts[0]).toContain('man-made line')
  const e = JSON.parse(await readFile(join(r, 'content/breeds/crowntail-betta/entity.json'), 'utf8'))
  expect(e.photos.map((p: { sourceUrl: string }) => p.sourceUrl.split(':').pop())).toEqual(['R1.jpg', 'R2.jpg', 'R3.jpg', 'R4.jpg'])
  const gal = JSON.parse(await readFile(join(r, 'content/gallery/crowntail-betta.json'), 'utf8'))
  expect(gal.photos.map((p: { sourceUrl: string }) => p.sourceUrl.split(':').pop())).toEqual(['R5.jpg'])
  searches.length = 0
  await writeFile(join(r, 'content/breeds/crowntail-betta/entity.json'), JSON.stringify({ id: 'crowntail-betta', kind: 'variety', photos: [] }))
  await breedPhotos(r, d, {})
  expect(searches).toEqual([]) // tried today
})
