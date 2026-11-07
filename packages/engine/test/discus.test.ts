import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import type { SpeciesEntity, Translation } from '@aq/schema'
import { dropFacePhotos } from '../src/faces'
import { localizeSpecies } from '../src/localize'
import { mergeSpecies } from '../src/merge'
import { subjectPrompt, type PhotoVerdict } from '../src/photo-check'
import type { ProcessedPage } from '../src/process'

// The owner's naming of the two discus species (2026-11-07), in the real content/ and engine-state/: Symphysodon
// aequifasciatus, the discus shops sell, is "Cá đĩa" at /ca/ca-dia/ (its old /ca/ca-dia-nau/ redirects there); Symphysodon
// discus is "Cá đĩa Heckel" at /ca/ca-dia-heckel/, with no redirect from /ca/ca-dia/, now the other's. Indonesian and Thai
// follow by name, each page keeping its address. Heckel's discus never shows the red discus, a bred S. aequifasciatus.
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const AEQ = 'symphysodon-aequifasciatus'
const HECKEL = 'symphysodon-discus'
const RED = 'https://media.aquatome.com/sprucepets/9d5a6550519a7967.webp'
const NAMES = {
  vi: { [AEQ]: { name: 'Cá đĩa', slug: 'ca-dia' }, [HECKEL]: { name: 'Cá đĩa Heckel', slug: 'ca-dia-heckel' } },
  id: { [AEQ]: { name: 'Discus', slug: 'symphysodon-aequifasciatus' }, [HECKEL]: { name: 'Discus Heckel', slug: 'discus' } },
  th: { [AEQ]: { name: 'ปลาปอมปาดัวร์', slug: 'symphysodon-aequifasciatus' }, [HECKEL]: { name: 'ปลาปอมปาดัวร์เฮคเคล', slug: 'symphysodon-discus' } },
} as const
const read = async <T>(...path: string[]) => JSON.parse(await readFile(join(...path), 'utf8')) as T

test('both names are locked in every served language; only the shop discus has a redirect, from its old address', async () => {
  for (const [lang, pages] of Object.entries(NAMES)) for (const [id, want] of Object.entries(pages)) {
    expect(await read<Translation>(ROOT, 'content/species', id, `${lang}.json`), `${lang}/${id}`).toMatchObject({ ...want, nameFixed: true })
  }
  expect((await read<Translation>(ROOT, 'content/species', AEQ, 'vi.json')).redirectFrom).toEqual([{ slug: 'ca-dia-nau', name: 'Cá đĩa nâu' }])
  for (const lang of Object.keys(NAMES)) expect((await read<Translation>(ROOT, 'content/species', HECKEL, `${lang}.json`)).redirectFrom, lang).toBeUndefined()
})

test('a Seriously Fish re-read naming either fish otherwise keeps both names and addresses', async () => {
  for (const [id, sci, offered] of [[AEQ, 'Symphysodon aequifasciatus', 'Cá đĩa nâu'], [HECKEL, 'Symphysodon discus', 'Cá đĩa']] as const) {
    const existing = { entity: await read<SpeciesEntity>(ROOT, 'content/species', id, 'entity.json'), vi: await read<Translation>(ROOT, 'content/species', id, 'vi.json') }
    const page: ProcessedPage = {
      kind: 'species', scientificName: sci, synonyms: [], enCommonNames: ['Discus'], viName: offered, viAltNames: [], variety: '', group: 'cichlids',
      places: [], dataCard: {}, sections: [{ key: 'diet', en: '<p>Worms.</p>', vi: '<p>Trùn.</p>' }], productSlots: [],
    }
    const taxon = { canonicalName: sci, order: 'Cichliformes', family: 'Cichlidae', genus: 'Symphysodon', matchType: 'EXACT' }
    const { vi } = mergeSpecies(existing, page, { source: 'seriouslyfish', url: 'https://www.seriouslyfish.com/species/x', taxon, now: '2026-11-07', takenSlugs: new Set() })
    expect(vi, id).toMatchObject({ ...NAMES.vi[id], nameFixed: true })
    expect(vi!.redirectFrom, id).toEqual(existing.vi.redirectFrom)
  }
})

test('an Indonesian or Thai translation run offering the other fish\'s name keeps both names and addresses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'discus-'))
  await mkdir(join(root, 'content/species'), { recursive: true })
  await cp(join(ROOT, 'content/sources.json'), join(root, 'content/sources.json'))
  for (const id of [AEQ, HECKEL]) await cp(join(ROOT, 'content/species', id), join(root, 'content/species', id), { recursive: true })
  for (const lang of ['id', 'th'] as const) for (const [id, other] of [[AEQ, HECKEL], [HECKEL, AEQ]] as const) {
    const llm = async <T,>(a: { prompt: string; schema: object }) => {
      if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
      const parts = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => ({ id: m[1], text: '<p>x</p>' }))
      return { name: NAMES[lang][other].name, altNames: [], nameConfidence: 'high', parts } as T
    }
    const r = await localizeSpecies(root, llm, lang, [id], { redo: true, now: () => new Date('2026-11-07T00:00:00Z') })
    expect(r.done, `${lang}/${id}`).toHaveLength(1)
    expect(await read<Translation>(root, 'content/species', id, `${lang}.json`), `${lang}/${id}`).toMatchObject({ ...NAMES[lang][id], nameFixed: true })
  }
})

test("the red discus photo stays off Heckel's discus page: brought back by a source re-read, the next cycle takes it off", async () => {
  expect((await read<Record<string, string>>(ROOT, 'engine-state/_photo-rejected.json'))[RED]).toMatch(/^not Symphysodon discus: /)
  const e = await read<SpeciesEntity>(ROOT, 'content/species', HECKEL, 'entity.json')
  expect(e.photos.map(p => p.url)).not.toContain(RED)
  const content = await mkdtemp(join(tmpdir(), 'discus-photo-'))
  const file = join(content, 'species', HECKEL, 'entity.json')
  await mkdir(join(content, 'species', HECKEL), { recursive: true })
  const red = { url: RED, width: 1200, height: 800, licence: 'dùng với sự cho phép', author: 'The Spruce Pets', sourceUrl: 'https://www.thesprucepets.com/discus-symphysodon-3988902', source: 'sprucepets' }
  await writeFile(file, JSON.stringify({ ...e, photos: [red, ...e.photos] }))
  // The faces step, which runs every cycle, strips every photo on engine-state/_photo-rejected.json.
  const r = await dropFacePhotos(content, join(content, 'faces.json'), { get: async () => new Uint8Array(), detect: async files => files.map(() => 0) }, join(ROOT, 'engine-state/_photo-rejected.json'))
  expect(r.removed).toEqual([`species/${HECKEL}/entity.json: ${RED}`])
  expect((await read<SpeciesEntity>(file)).photos.map(p => p.url)).not.toContain(RED)
})

test("Heckel's discus never takes a bred discus: the photo check tells the model so, and the bred forms its gallery held stay off it", async () => {
  // The model was told a species' colour forms count as it, and Commons files many bred discus as S. discus.
  expect(subjectPrompt({ id: HECKEL, kind: 'species', sci: 'Symphysodon discus', names: [] })).toContain('is Symphysodon aequifasciatus, so "other"')
  expect(subjectPrompt({ id: AEQ, kind: 'species', sci: 'Symphysodon aequifasciatus', names: [] })).toContain('its colour forms, sexes and young count as it')
  const cache = await read<Record<string, Record<string, PhotoVerdict>>>(ROOT, 'engine-state/_photo-subjects.json')
  const gallery = await read<{ photos: { url: string }[] }>(ROOT, 'content/gallery', `${HECKEL}.json`)
  for (const p of gallery.photos) expect(cache[p.url]?.[HECKEL]?.ok, p.url).toBe('yes')
  // The 22 it showed, looked at by eye: "other" here, with the check's current fields so no run judges them again (the
  // photo check takes an "other" photo off its page each cycle); the shop discus's own verdicts are untouched.
  const bred = Object.values(cache).filter(v => v[HECKEL]?.note.startsWith('captive-bred colour form'))
  expect(bred).toHaveLength(22)
  for (const v of bred) expect(v[HECKEL]).toMatchObject({ ok: 'other', logo: false })
})
