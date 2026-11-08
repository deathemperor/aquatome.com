import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { ENGLISH_PLACE_WORD, genericWordsInVietnamese, namePlacesVi, sweepPlaceNames } from '../src/place-names'

async function site(places: Record<string, { entity: object; name: string; altNames?: string[]; nameFixed?: boolean }>) {
  const root = await mkdtemp(join(tmpdir(), 'aq-place-names-'))
  for (const [id, p] of Object.entries(places)) {
    await mkdir(join(root, 'content/places', id), { recursive: true })
    await writeFile(join(root, 'content/places', id, 'entity.json'), JSON.stringify({ id, ...p.entity }))
    await writeFile(join(root, 'content/places', id, 'vi.json'), JSON.stringify({ slug: id, name: p.name, altNames: p.altNames ?? [], sections: {}, quality: { score: 1, indexable: true }, ...(p.nameFixed ? { nameFixed: true } : {}) }))
  }
  const read = async (id: string) => JSON.parse(await readFile(join(root, 'content/places', id, 'vi.json'), 'utf8'))
  return { root, read }
}

const llmNaming = (names: Record<string, string>, wrong: string[] = []) => {
  const prompts: string[] = []
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [], wrong } as T
    return { places: [...a.prompt.matchAll(/^### (\S+)/gm)].map(m => ({ id: m[1]!, name: names[m[1]!] ?? '' })) } as T
  }
  return { llm, prompts }
}

test('rivers and regions get the name readers use: the old one kept as another name, the address the same, and asked once', async () => {
  const s = await site({
    'red-river': { entity: { kind: 'river', parent: 'vietnam' }, name: 'Red River' },
    ma: { entity: { kind: 'region', countries: ['VN', 'CN'] }, name: 'Mã', altNames: ['Song Ma'] },
    china: { entity: { kind: 'country', parent: 'asia' }, name: 'Trung Quốc' },
    asia: { entity: { kind: 'continent' }, name: 'Châu Á' },
    'cayman-islands': { entity: { kind: 'country', parent: 'north-america' }, name: 'Cayman Islands' },
    'kept-by-owner': { entity: { kind: 'region' }, name: 'Tên đã chốt', nameFixed: true },
  })
  const { llm, prompts } = llmNaming({ 'red-river': 'sông Hồng', ma: 'Mã', 'cayman-islands': 'quần đảo Cayman' })
  const r = await namePlacesVi(s.root, llm)
  expect(r.done.sort()).toEqual(['cayman-islands', 'ma', 'red-river'])
  expect(prompts[0]).toContain('### red-river (river, in vietnam): Red River')
  expect(prompts[0]).toContain('### ma (region, in VN, CN): Mã (Song Ma)')
  expect(prompts[0]).not.toContain('### china')
  expect(prompts[0]).not.toContain('### kept-by-owner')
  expect(await s.read('red-river')).toMatchObject({ slug: 'red-river', name: 'sông Hồng', altNames: ['Red River'], nameFixed: true })
  expect(await s.read('ma')).toMatchObject({ name: 'Mã', altNames: ['Song Ma'], nameFixed: true })
  expect(await s.read('kept-by-owner')).toMatchObject({ name: 'Tên đã chốt' })
  prompts.length = 0
  await namePlacesVi(s.root, llm)
  expect(prompts).toEqual([])
})

test('a name the reviewer calls wrong, with an English word or none is not written, and is asked again', async () => {
  const s = await site({
    'green-river': { entity: { kind: 'river' }, name: 'Green River' },
    'lake-chad': { entity: { kind: 'region' }, name: 'Lake Chad' },
    anatolia: { entity: { kind: 'region' }, name: 'Anatolia' },
    'bangka-island': { entity: { kind: 'region' }, name: 'Bangka Island' },
  })
  const { llm, prompts } = llmNaming({ 'green-river': 'sông Xanh', 'lake-chad': 'Lake Chad', 'bangka-island': 'đảo Bangka' }, ['green-river'])
  const r = await namePlacesVi(s.root, llm)
  expect(r.done).toEqual(['bangka-island'])
  expect(r.failed.sort()).toEqual(['anatolia: no name', 'green-river: sông Xanh', 'lake-chad: Lake Chad'])
  expect(await s.read('green-river')).toMatchObject({ name: 'Green River' })
  prompts.length = 0
  await namePlacesVi(s.root, llm)
  expect([...prompts[0]!.matchAll(/^### (\S+)/gm)].map(m => m[1]).sort()).toEqual(['anatolia', 'green-river', 'lake-chad'])
})

test('until then the sweep puts the generic word in Vietnamese, so no name keeps one in English, and leaves the rest', async () => {
  for (const [name, vi] of [['Congo River', 'sông Congo'], ['Lake Tumba', 'hồ Tumba'], ['Bangka Island', 'đảo Bangka'], ['Riau Islands', 'quần đảo Riau'], ['Ajamaru Lakes', 'hồ Ajamaru'], ['Chad basin', 'lưu vực Chad'], ['Congo River Basin', 'lưu vực sông Congo'], ['Aceh Province', 'tỉnh Aceh'], ['Cross River State', 'sông Cross State'], ['Anatolia', 'Anatolia'], ['Annamite Mountains', 'dãy Annamite'], ['Malay Peninsula', 'bán đảo Malay'], ['Rio Negro', 'sông Negro'], ['Río Orinoco', 'sông Orinoco'], ['Rio Negro Basin', 'lưu vực sông Negro'], ['Rio de Janeiro', 'Rio de Janeiro'], ['Rio Grande do Sul', 'Rio Grande do Sul'], ['Río Muni', 'Río Muni'], ['Río de la Plata', 'Río de la Plata']] as const) {
    expect(genericWordsInVietnamese(name)).toBe(vi)
    expect(genericWordsInVietnamese(name)).not.toMatch(ENGLISH_PLACE_WORD)
  }
  const s = await site({
    'congo-river': { entity: { kind: 'river' }, name: 'Congo River' },
    aceh: { entity: { kind: 'region' }, name: 'Aceh' },
    'own-lake': { entity: { kind: 'region' }, name: 'Own Lake', nameFixed: true },
  })
  expect(await sweepPlaceNames(s.root)).toEqual(['congo-river'])
  expect(await s.read('congo-river')).toMatchObject({ name: 'sông Congo', altNames: ['Congo River'] })
  expect(await s.read('own-lake')).toMatchObject({ name: 'Own Lake' })
  expect(await sweepPlaceNames(s.root)).toEqual([])
})

test('the step reads the source\'s name, not what the sweep made of it, so "sông Red" can\'t stick', async () => {
  const s = await site({
    'red-river': { entity: { kind: 'river', parent: 'vietnam' }, name: 'Red River', altNames: ['Song Hong'] },
    'congo-river': { entity: { kind: 'river' }, name: 'Congo River' },
  })
  await sweepPlaceNames(s.root)
  expect(await s.read('red-river')).toMatchObject({ name: 'sông Red', altNames: ['Song Hong', 'Red River'] })
  const { llm, prompts } = llmNaming({ 'red-river': 'sông Hồng', 'congo-river': 'sông Congo' })
  await namePlacesVi(s.root, llm)
  expect(prompts[0]).toContain('### red-river (river, in vietnam): Red River (Song Hong)')
  expect(prompts[0]).not.toContain('sông Red')
  expect(prompts[1]).toContain('Red River (Song Hong) → sông Hồng')
  expect(prompts[1]).not.toContain('sông Red')
  expect(await s.read('red-river')).toMatchObject({ name: 'sông Hồng', altNames: ['Song Hong', 'Red River'], nameFixed: true })
  expect(await s.read('congo-river')).toMatchObject({ name: 'sông Congo', altNames: ['Congo River'], nameFixed: true })
})
