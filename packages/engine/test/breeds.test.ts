import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { breedCare, breedPhotos, localizeBreed, makeBreed, type BreedFacts } from '../src/breeds'
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
    // The first write's three reads (it is near the bar) find the claim; the rewrite's don't.
    if ('score' in ((a.schema as { properties: object }).properties)) return (++checks <= 3 ? { score: 0.7, notes: ['"from 1800s" is not in the facts'] } : { score: 0.9, notes: [] }) as T
    return { name: 'Cá vàng Ranchu', altNames: ['Ranchu'], summary: ['Dòng cá vàng không vây lưng.'], body: '<h3>Nguồn gốc</h3><p onclick="x">Từ Nhật.</p>', faq: [{ q: 'Khó nuôi không?', a: 'Hay bị bệnh bong bóng.' }] } as T
  }
  const out = await makeBreed(r, { research, llm, gallery: gallery(looks) }, { name: 'Ranchu goldfish', kind: 'variety' })
  expect(out).toMatchObject({ id: 'ranchu-goldfish', slug: 'ca-vang-ranchu-dong', score: 0.9, photos: '6 of 6' })
  // The checker's notes went into one rewrite.
  expect(prompts.filter(p => p.includes('"from 1800s" is not in the facts'))).toHaveLength(1)
  expect(prompts.filter(p => p.includes('first bred in 1986'))).toEqual([])
  expect(looks[0]).toContain('keep only photos of it, not the plain species or other varieties')

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
  const prompts: string[] = []
  const llm: Llm = async <T,>(a: { schema: object; prompt: string }) => (prompts.push(a.prompt), 'score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá vàng Ranchu', altNames: [], summary: [], body: '', faq: [] }) as T
  const d = { research: (async () => facts) as Llm, llm, gallery: gallery([]) }
  await makeBreed(r, d, { name: 'Ranchu goldfish' })
  expect(prompts[0]).not.toContain('Tên trang đã chốt')
  const file = join(r, 'content/breeds/ranchu-goldfish/vi.json')
  const vi = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(file, JSON.stringify({ ...vi, slug: 'ca-vang-lan-tho', name: 'Cá vàng Lan thọ (Ranchu)', nameFixed: true, redirectFrom: [{ slug: vi.slug, name: vi.name }] }))
  await makeBreed(r, d, { name: 'Ranchu goldfish' }, { reuse: true })
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ slug: 'ca-vang-lan-tho', name: 'Cá vàng Lan thọ (Ranchu)', nameFixed: true, redirectFrom: [{ slug: 'ca-vang-ranchu-dong' }] })
  // The text calls the fish by the fixed name too.
  expect(prompts.filter(p => !p.startsWith('Below are FACTS')).at(-1)).toContain('Tên trang đã chốt: "Cá vàng Lan thọ (Ranchu)"')
})

test('a page written again leaves the photos that wait for the photo check in its gallery, marked', async () => {
  const r = await root()
  const llm: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá vàng Ranchu', altNames: [], summary: [], body: '', faq: [] }) as T
  const d = { research: (async () => facts) as Llm, llm, gallery: gallery([]) }
  await makeBreed(r, d, { name: 'Ranchu goldfish' })
  const file = join(r, 'content/breeds/ranchu-goldfish/entity.json')
  const gfile = join(r, 'content/gallery/ranchu-goldfish.json')
  const e = JSON.parse(await readFile(file, 'utf8')) as { photos: { url: string }[] }
  const waits = JSON.parse(await readFile(gfile, 'utf8')).photos as { url: string; unchecked?: boolean }[]
  expect(waits.map(p => p.unchecked)).toEqual([true, true])
  // The photo check took one of the page's four off: the two that wait don't take its place.
  await writeFile(file, JSON.stringify({ ...e, photos: e.photos.slice(0, 3) }))
  await makeBreed(r, d, { name: 'Ranchu goldfish' }, { reuse: true })
  expect((JSON.parse(await readFile(file, 'utf8')) as typeof e).photos.map(p => p.url)).toEqual(e.photos.slice(0, 3).map(p => p.url))
  expect(JSON.parse(await readFile(gfile, 'utf8')).photos).toEqual(waits)
  // One the check has judged and left on does.
  await writeFile(gfile, JSON.stringify({ id: 'ranchu-goldfish', photos: [{ ...waits[0], unchecked: undefined }, waits[1]], seen: 6, updatedAt: '' }))
  await makeBreed(r, d, { name: 'Ranchu goldfish' }, { reuse: true })
  expect((JSON.parse(await readFile(file, 'utf8')) as typeof e).photos.map(p => p.url)).toEqual([...e.photos.slice(0, 3).map(p => p.url), waits[0]!.url])
  expect(JSON.parse(await readFile(gfile, 'utf8')).photos).toEqual([waits[1]])
})

test('a page written again keeps the links it has: what it is a form of, and on a --redo its parents\'', async () => {
  const r = await root()
  const hybrid: BreedFacts = { ...facts, kind: 'hybrid', commons: undefined, parents: [{ name: 'Goldfish', scientificName: 'Carassius auratus', certain: true, source: 0 }, { name: 'Crucian carp', certain: false, source: 2 }] }
  const llm: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá lai X', altNames: [], summary: [], body: '', faq: [] }) as T
  const d = { research: (async () => hybrid) as Llm, llm, gallery: gallery([]) }
  await makeBreed(r, d, { name: 'X hybrid' })
  const file = join(r, 'content/breeds/x-hybrid/entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  expect(e.basedOn).toBe('carassius-auratus')
  // Linked by hand: a line of another breed, and the crucian carp's page.
  await writeFile(file, JSON.stringify({ ...e, basedOn: 'other-breed', parents: [e.parents[0], { ...e.parents[1], species: 'carassius-carassius' }] }))
  await makeBreed(r, d, { name: 'X hybrid' }, { reuse: true })
  const again = JSON.parse(await readFile(file, 'utf8'))
  expect(again.basedOn).toBe('other-breed')
  expect(again.parents.map((p: { species?: string }) => p.species)).toEqual(['carassius-auratus', 'carassius-carassius'])
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

test('localizeBreed: the page in Thai written afresh from the same facts, without the Vietnamese names; parents named in Thai; skipped once done', async () => {
  const r = await root()
  const hybrid: BreedFacts = { ...facts, kind: 'hybrid', basedOn: undefined, commons: undefined, parents: [{ name: 'Goldfish', scientificName: 'Carassius auratus', certain: true, source: 0 }, { name: 'Crucian carp', certain: false, source: 2 }] }
  const vi: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá lai X', altNames: [], parentNames: [], summary: ['s'], body: '<p>b</p>', faq: [] }) as T
  await makeBreed(r, { research: (async () => hybrid) as Llm, llm: vi, gallery: gallery([]) }, { name: 'X hybrid' })
  const prompts: string[] = []
  const th: Llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if ('score' in (a.schema as { properties: object }).properties) return { score: 0.9, notes: [] } as T
    return { name: 'ปลาลูกผสม X', slug: 'x-hybrid-fish', altNames: ['X hybrid', 'Cá lai X', 'ปลาลูกผสม X'], parentNames: ['ปลาทอง (Carassius auratus)', 'ปลาไน'], summary: ['ส'], body: '<p>บ</p><script>x</script>', faq: [{ q: 'ถาม', a: 'ตอบ' }] } as T
  }
  const out = await localizeBreed(r, th, 'x-hybrid', 'th')
  expect(out).toMatchObject({ id: 'x-hybrid', slug: 'x-hybrid-fish', score: 0.9 })
  expect(prompts[0]).toContain('Thai')
  expect(prompts[0]).not.toContain('Cá vàng Ranchu') // the Vietnamese names stay on the Vietnamese page
  const t = JSON.parse(await readFile(join(r, 'content/breeds/x-hybrid/th.json'), 'utf8'))
  expect(t).toMatchObject({ slug: 'x-hybrid-fish', name: 'ปลาลูกผสม X', altNames: ['X hybrid'], parents: ['ปลาทอง (Carassius auratus)', 'ปลาไน'], body: '<p>บ</p>', quality: { score: 0.9, indexable: true } })
  expect(await localizeBreed(r, th, 'x-hybrid', 'th')).toEqual({ id: 'x-hybrid', skipped: 'done' })
})

test("localizeBreed: a name a species already has in the language is refused; the breed takes its English name", async () => {
  const r = await root()
  await writeFile(join(r, 'content/species/carassius-auratus/th.json'), JSON.stringify({ slug: 'carassius-auratus', name: 'ปลาทอง' }))
  const vi: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá vàng Ranchu', altNames: [], parentNames: [], summary: ['s'], body: '<p>b</p>', faq: [] }) as T
  await makeBreed(r, { research: (async () => facts) as Llm, llm: vi, gallery: gallery([]) }, { name: 'Ranchu' })
  const th: Llm = async <T,>(a: { schema: object }) => ('score' in (a.schema as { properties: object }).properties ? { score: 0.9, notes: [] } : { name: 'ปลา ทอง', slug: 'ranchu', altNames: [], parentNames: [], summary: ['ส'], body: '<p>บ</p>', faq: [] }) as T
  await localizeBreed(r, th, 'ranchu', 'th')
  // Nor is it one of its other names: "ปลา ทอง" is every goldfish's name.
  expect(JSON.parse(await readFile(join(r, 'content/breeds/ranchu/th.json'), 'utf8'))).toMatchObject({ name: 'Ranchu goldfish', altNames: [] })
})

test("a breed page's other names are its own: research and the writer give its species' too, and they leave it", async () => {
  const r = await root()
  await writeFile(join(r, 'content/species/carassius-auratus/vi.json'), JSON.stringify({ slug: 'ca-vang-ranchu', name: 'Cá vàng', altNames: ['Goldfish', 'Cá ba đuôi'] }))
  const researched: BreedFacts = { ...facts, enNames: ['Ranchu goldfish', 'Goldfish'], viNames: [{ name: 'Cá vàng Ranchu', source: 0 }, { name: 'cá ba đuôi', source: 0 }, { name: 'Cá vàng', source: 0 }] }
  const prompts: string[] = []
  const research: Llm = async <T,>(a: { prompt: string }) => (prompts.push(a.prompt), researched as T)
  const llm: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá vàng Ranchu', altNames: ['Vua cá vàng', 'Goldfish'], summary: [], body: '', faq: [] }) as T
  await makeBreed(r, { research, llm, gallery: gallery([]) }, { name: 'Ranchu goldfish' })
  expect(prompts[0]).toContain('not its species\' names')
  expect(JSON.parse(await readFile(join(r, 'content/breeds/ranchu-goldfish/vi.json'), 'utf8')).altNames).toEqual(['Vua cá vàng', 'Ranchu goldfish'])
  // In another language too.
  await writeFile(join(r, 'content/species/carassius-auratus/id.json'), JSON.stringify({ slug: 'ikan-mas-koki', name: 'Ikan mas koki', altNames: ['Koki'] }))
  const id: Llm = async <T,>(a: { schema: object }) => ('score' in (a.schema as { properties: object }).properties ? { score: 0.9, notes: [] } : { name: 'Koki Ranchu', slug: 'ranchu', altNames: ['Ranchu Jepang', 'Mas koki', 'Koki'], summary: ['s'], body: '<p>b</p>', faq: [] }) as T
  await localizeBreed(r, id, 'ranchu-goldfish', 'id')
  expect(JSON.parse(await readFile(join(r, 'content/breeds/ranchu-goldfish/id.json'), 'utf8')).altNames).toEqual(['Ranchu Jepang'])
})

test('localizeBreed in Malay: addressed by its name, and a name a species has takes its word for "fish"', async () => {
  const r = await root()
  const hybrid: BreedFacts = { ...facts, kind: 'hybrid', basedOn: undefined, commons: undefined, parents: [] }
  const vi: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá lai X', altNames: [], parentNames: [], summary: ['s'], body: '<p>b</p>', faq: [] }) as T
  await makeBreed(r, { research: (async () => hybrid) as Llm, llm: vi, gallery: gallery([]) }, { name: 'X hybrid' })
  await writeFile(join(r, 'content/species/carassius-auratus/ms.json'), JSON.stringify({ slug: 'ikan-kacukan-x', name: 'Ikan emas' }))
  const prompts: string[] = []
  const ms: Llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if ('score' in (a.schema as { properties: object }).properties) return { score: 0.9, notes: [] } as T
    return { name: 'Ikan Kacukan X', slug: 'ignored', altNames: [], parentNames: [], summary: ['s'], body: '<p>Suhu 68 °F.</p>', faq: [] } as T
  }
  expect(await localizeBreed(r, ms, 'x-hybrid', 'ms')).toMatchObject({ slug: 'ikan-kacukan-x-ikan' })
  expect(prompts[0]).toContain('Malaysia')
  expect(JSON.parse(await readFile(join(r, 'content/breeds/x-hybrid/ms.json'), 'utf8')).body).toBe('<p>Suhu 20 °C.</p>')
})

// The owner (2026-11-06): no bred fish's page gave how hard it is to keep, nor how long it lives.
const writer: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá vàng Ranchu', altNames: [], summary: [], body: '', faq: [] }) as T

test("makeBreed: research asks for the breed's own difficulty (1–8) and lifespan; a difficulty one whole number, a lifespan a range", async () => {
  const r = await root()
  const asked: { prompt: string; schema: object }[] = []
  const researched: BreedFacts = { ...facts, care: [
    { field: 'difficulty', min: 2.6, max: 2.6, source: 0 }, // a whole number
    { field: 'difficulty', min: 3, max: 5, source: 2 }, // not one figure: left out
    { field: 'lifeYears', min: 10, max: 10, source: 0 }, // "up to 10 years": a range, as a species'
    { field: 'lifeYears', min: 0.1, max: 0.1, source: 2 }, // outside the bounds
    { field: 'lifeYears', min: 15, max: 8, source: 2 }, // upside down
  ] }
  const research: Llm = async <T,>(a: { prompt: string; schema: object }) => (asked.push(a), researched as T)
  await makeBreed(r, { research, llm: writer, gallery: gallery([]) }, { name: 'Ranchu goldfish' })
  expect(asked[0]!.prompt).toContain('difficulty (1 = very easy … 8 = expert')
  expect(asked[0]!.prompt).toContain('lifeYears in years (how long the fish lives in an aquarium')
  expect(asked[0]!.prompt).toContain('Never a figure from a page about its species or a parent species')
  const care = (asked[0]!.schema as { properties: { care: { items: { properties: { field: { enum: string[] } } } } } }).properties.care
  expect(care.items.properties.field.enum).toEqual(expect.arrayContaining(['difficulty', 'lifeYears']))
  const e = JSON.parse(await readFile(join(r, 'content/breeds/ranchu-goldfish/entity.json'), 'utf8'))
  expect(e.care).toEqual({ difficulty: [{ source: 0, value: 3 }], lifeYears: [{ source: 0, value: { min: 10, max: 10 } }, { source: 1, value: { min: 8, max: 15 } }] })
})

test('breed-care: a breed whose card lacks a difficulty or lifespan gets them from one cited research call; nothing else on the page changes; a second run changes nothing; a --redo keeps them', async () => {
  const r = await root()
  const d = { research: (async () => facts) as Llm, llm: writer, gallery: gallery([]) }
  await makeBreed(r, d, { name: 'Ranchu goldfish' })
  // A breed with both already: never researched.
  await mkdir(join(r, 'content/breeds/done-fish'), { recursive: true })
  await writeFile(join(r, 'content/breeds/done-fish/entity.json'), JSON.stringify({ id: 'done-fish', kind: 'variety', parents: [], care: { difficulty: [{ source: 0, value: 2 }], lifeYears: [{ source: 0, value: { min: 3, max: 5 } }] }, photos: [], sources: [{ url: 'https://x.example', title: 'X', kind: 'article', at: '2026-10-30' }], updatedAt: '2026-10-30' }, null, 1))
  const file = join(r, 'content/breeds/ranchu-goldfish/entity.json')
  const before = JSON.parse(await readFile(file, 'utf8'))
  const asked: string[] = []
  const found = {
    figures: [
      { field: 'difficulty', min: 2.6, max: 2.6, source: 0, quote: 'Care level: easy' },
      { field: 'lifeYears', min: 10, max: 15, source: 1, quote: 'lives 10 to 15 years' }, // a source the page cites (with a slash)
      { field: 'lifeYears', min: 5, max: 5, source: 2, quote: 'x' }, // a marketplace page: never
      { field: 'lifeYears', min: 300, max: 300, source: 0, quote: 'x' }, // outside the bounds
      { field: 'difficulty', min: 2, max: 4, source: 0, quote: 'x' }, // not one figure
    ],
    sources: [
      { url: 'https://caresheet.example/ranchu', title: 'Ranchu care sheet', kind: 'article' },
      { url: 'https://article.example/', title: 'Article', kind: 'article' },
      { url: 'https://shopee.vn/ranchu', title: 'Shop', kind: 'shop' },
    ],
    none: '',
  }
  const research: Llm = async <T,>(a: { prompt: string }) => (asked.push(a.prompt), found as T)
  const now = () => new Date('2026-11-06T00:00:00Z')
  const out = await breedCare(r, research, { now })
  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('"Ranchu goldfish"')
  expect(asked[0]).toContain('of Carassius auratus') // what it is a form of, whose figures aren't its own
  expect(asked[0]).toContain('https://breeder.example') // its page's sources, looked at first
  expect(asked[0]).toContain('difficulty (1 = very easy … 8 = expert')
  expect(asked[0]).toContain('Never a figure from a page about its species or a parent species')
  expect(asked[0]).toContain('If sources disagree, keep each figure with its own source')
  expect(out.done).toEqual(['ranchu-goldfish: difficulty 3: "Care level: easy" (https://caresheet.example/ranchu); lifeYears 10–15: "lives 10 to 15 years" (https://article.example/)'])
  const e = JSON.parse(await readFile(file, 'utf8'))
  expect(e.care.difficulty).toEqual([{ source: 2, value: 3 }])
  expect(e.care.lifeYears).toEqual([{ source: 1, value: { min: 10, max: 15 } }])
  expect(e.sources).toEqual([...before.sources, { url: 'https://caresheet.example/ranchu', title: 'Ranchu care sheet', kind: 'article', at: '2026-11-06' }])
  const { difficulty: _d, lifeYears: _l, ...care } = e.care
  expect({ ...e, care, sources: before.sources }).toEqual(before)
  // The research kept for --redo has them too, its new source after the others.
  const kept = JSON.parse(await readFile(join(r, 'engine-state/breeds/ranchu-goldfish.json'), 'utf8')) as BreedFacts
  expect(kept.sources.map(s => s.url)).toEqual([...facts.sources.map(s => s.url), 'https://caresheet.example/ranchu'])
  expect(kept.care.slice(-2)).toEqual([{ field: 'difficulty', min: 3, max: 3, source: 3 }, { field: 'lifeYears', min: 10, max: 15, source: 2 }])

  const files = ['content/breeds/ranchu-goldfish/entity.json', 'content/breeds/done-fish/entity.json', 'engine-state/breeds/ranchu-goldfish.json', 'engine-state/_breed-care.json']
  const snapshot = () => Promise.all(files.map(f => readFile(join(r, f), 'utf8')))
  const first = await snapshot()
  expect(JSON.parse(first[3]!)).toEqual({ 'ranchu-goldfish': { at: '2026-11-06', added: out.done[0]!.replace('ranchu-goldfish: ', '').split('; ') } })
  expect(await breedCare(r, research, { now })).toEqual({ done: [], none: [], failed: [], stopped: '' })
  expect(asked).toHaveLength(1)
  expect(await snapshot()).toEqual(first)

  await makeBreed(r, d, { name: 'Ranchu goldfish' }, { reuse: true })
  const redone = JSON.parse(await readFile(file, 'utf8'))
  expect({ difficulty: redone.care.difficulty, lifeYears: redone.care.lifeYears }).toEqual({ difficulty: e.care.difficulty, lifeYears: e.care.lifeYears })
  expect(redone.sources.map((s: { url: string }) => s.url)).toEqual(e.sources.map((s: { url: string }) => s.url))
})

test("breed-care: a breed no source gives figures for is tried once, with why; out of the model's limit it stops and records nothing", async () => {
  const r = await root()
  for (const id of ['a-fish', 'b-fish']) {
    await mkdir(join(r, 'content/breeds', id), { recursive: true })
    await writeFile(join(r, 'content/breeds', id, 'entity.json'), JSON.stringify({ id, kind: 'hybrid', parents: [], care: {}, photos: [], sources: [], updatedAt: '2026-10-30' }, null, 2))
  }
  const now = () => new Date('2026-11-06T00:00:00Z')
  const tried = join(r, 'engine-state/_breed-care.json')
  const limited: Llm = async () => { throw new LlmError('claude failed (1): usage limit reached') }
  expect((await breedCare(r, limited, { now })).stopped).toMatch(/^a-fish: claude failed/)
  await expect(readFile(tried, 'utf8')).rejects.toThrow()
  let calls = 0
  const nothing: Llm = async <T,>() => (calls++, { figures: [], sources: [], none: 'No breeder or care sheet gives either for this hybrid.' } as T)
  expect(await breedCare(r, nothing, { now, limit: 1 })).toEqual({ done: [], none: ['a-fish: No breeder or care sheet gives either for this hybrid.'], failed: [], stopped: '' })
  await breedCare(r, nothing, { now, only: ['a-fish'] })
  expect(calls).toBe(1)
  await breedCare(r, nothing, { now })
  expect(calls).toBe(2)
  expect(JSON.parse(await readFile(tried, 'utf8'))).toEqual({
    'a-fish': { at: '2026-11-06', added: [], none: 'No breeder or care sheet gives either for this hybrid.' },
    'b-fish': { at: '2026-11-06', added: [], none: 'No breeder or care sheet gives either for this hybrid.' },
  })
  expect(JSON.parse(await readFile(join(r, 'content/breeds/a-fish/entity.json'), 'utf8')).care).toEqual({})
})

test('a breed writer and its fact check are given the figures from the source\'s US figures; a redo, what the reader-fit check found', async () => {
  const r = await root()
  const koi: BreedFacts = { ...facts, keeping: [{ fact: 'Allow about 38 L per 2.5 cm of adult length. Juveniles under 15 cm can start in a 110 L tank. One large fish needs 35 US gal (about 132 L).', source: 0 }] }
  const prompts: string[] = []
  const llm: Llm = async <T,>(a: { prompt: string; schema: object }) => (prompts.push(a.prompt), 'score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'Cá vàng Ranchu', slug: 'ranchu', altNames: [], parentNames: [], summary: ['s'], body: '<p>b</p>', faq: [] }) as T
  await makeBreed(r, { research: (async () => koi) as Llm, llm, gallery: gallery([]) }, { name: 'Ranchu goldfish' })
  // The Vietnamese writer, in Vietnamese, and its check.
  expect(prompts[0]).toContain('Viết các số sau, đổi từ số gallon gốc theo cỡ người chơi ở đây gọi')
  expect(prompts[0]).toContain('35 US gallons → 130 litres; 10 US gallons per inch of fish → 15 litres per cm of fish')
  expect(prompts[1]).toContain('are the facts\' figures: 35 US gallons → 130 litres; 10 US gallons per inch of fish → 15 litres per cm of fish')
  // A redo in Indonesian: the page's findings as notes, and the litres its units findings quote among the figures.
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await writeFile(join(r, 'engine-state/_fit.json'), JSON.stringify({ 'id/breeds/ranchu-goldfish': { findings: [
    { check: 'units', quote: 'Koi muda di bawah 15 cm bisa dimulai di akuarium 110 liter', why: 'a converted 29-gallon tank' },
    { check: 'elsewhere', quote: 'memijah pada musim semi dan musim panas', why: 'seasons Indonesia does not have' },
  ] } }))
  prompts.length = 0
  await localizeBreed(r, llm, 'ranchu-goldfish', 'id')
  expect(prompts[0]).not.toContain('Readers in') // a first page has no findings
  prompts.length = 0
  await localizeBreed(r, llm, 'ranchu-goldfish', 'id', { redo: true })
  expect(prompts[0]).toContain('Readers in Indonesia found these in the page on the site. Write the page so none of them is there:\n- units: "Koi muda di bawah 15 cm bisa dimulai di akuarium 110 liter" (a converted 29-gallon tank)\n- elsewhere: "memijah pada musim semi dan musim panas" (seasons Indonesia does not have)')
  expect(prompts[0]).toContain('Write these instead, worked out from the source\'s US figure as keepers here name them')
  expect(prompts[0]).toContain('29 US gallons → 120 litres')
  expect(prompts[0]).toContain('A tank or water per fish, or per cm of a fish, is an allowance, not a dose')
  expect(prompts[1]).toContain('are the facts\' figures:')
  expect(prompts[1]).toContain('29 US gallons → 120 litres')
})
