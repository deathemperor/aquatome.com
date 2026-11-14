import { createHash } from 'node:crypto'
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
  expect((await read<Record<string, string>>(ROOT, 'engine-state/_photo-rejected.json'))[RED]).toMatch(/^rejected: withheld \[sha256:[a-f0-9]{64}\]$/)
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
  const frozenBred = new Set([
  "008e8b371ee3467eb15d5e2b9813535840fb7eb143b18a588b7ed40d963db81b",
  "121f2e7c779bdabfa385fac0f8f9efb54174dce332eb228ba63240c271fb8129",
  "19919218efd829813b76c5ab60293ad2e7ae1d254696a5f9470ae77fe3899a30",
  "1da3f9dd751374812690666cd2f06fcf457b3feeac255a55096a3e196ae2dcea",
  "20a939a15caa0e9b6019047b8c148cf5de8dd3307687c7410ea91fa85bbd4c06",
  "385989e8e669b4660a6c481cd5abb448aaced9b832081ec53e42913b31efe4dc",
  "43fa4d7558a41de59fa689bd397826d44fe730a5af2ce972b72084c3783e5018",
  "43fc9709b575b01769f374a5ac07b0c6403f54a7b3cf6bb5197c0978ec451276",
  "5e1a0335bf902caca9e0a3f5003bcb9b7153cd02bc6a79d660af49581570fdd5",
  "81a47ce2e51384cc589edffb7b010e7c481e3221d3c5fe0befbb000658920d0d",
  "849fe426c933cf74b19f10453399907475e9a6e93fcdb0277e15248d64e1f95c",
  "8517f77bae4bf8e0a1c22e8b1d6c50b2c11a3528a0b7737b7d3b0924d5d2a805",
  "86c452938b9339ef1e17a63883d14315c88239d8d3e10e6ec8ab69b6df67de87",
  "a5a263e93e373c7ff5a943b31630b53518991741678675f5879977d2370ed909",
  "af56c82a981fe46c084da177f61c746ed3f48fe7622eab43ad046735d225c60b",
  "b212fdf6110621b4ff5fc25cec4c16bccd58663eee1af6627d6207a57102d916",
  "b9dced5a6ae3ce1fb7bfd6e957fd711d7f57f79a871e0bc56456d86b80b37056",
  "dfe69f875cc1377dc5659ec5668688ab6bf0e0148ea14a5850c96cfda82ee60d",
  "e4de22f214f31ca61b8ed2f9d73171445b1dbc2b6c2c7c1882ecd827c49012b6",
  "ec3e54fa17e0420b3f6707e15af221a3e3de5824b984b2fea49458ba086116ff",
  "f68dd4386250d8641732905997abb10fb9def232b47d0ed9393e7f0b3442e6ff",
  "fda1c4474b5b0df8d7ded408a00b56eb0c4cf3419c26ea4f0d6af8912b144784"
])
  const bred = Object.entries(cache).filter(([url]) => frozenBred.has(createHash('sha256').update(url).digest('hex'))).map(([,v])=>v)
  expect(bred).toHaveLength(22)
  for (const v of bred) expect(v[HECKEL]).toMatchObject({ ok: 'other', logo: false })
})
