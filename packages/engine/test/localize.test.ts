import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { localizeGlossary, localizePlaces, localizeSpecies, nativeTo, speciesOrder } from '../src/localize'

/** The fixture site, its sources allowed to be translated except `deny`. */
async function site(deny: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'loc-'))
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), join(root, 'content'), { recursive: true })
  const file = join(root, 'content/sources.json')
  const sources = JSON.parse(await readFile(file, 'utf8')) as Record<string, object>
  for (const k of Object.keys(sources)) sources[k] = { ...sources[k], permission: { date: '2026-10-31', file: 'test', scope: deny.includes(k) ? ['text'] : ['text', 'translation'] } }
  await writeFile(file, JSON.stringify(sources))
  return root
}
const now = () => new Date('2026-10-31T00:00:00Z')

test('every English part translated; local name; Thai addressed by scientific name; low score retried once', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  const e = JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')) as { scientificName: string; sections: { key: string; source: string; html: string }[] }
  const calls: string[] = []
  let reviews = 0
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    calls.push(a.prompt)
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: ++reviews === 1 ? 0.6 : 0.9, notes: ['fix "x"'] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'ปลาทดสอบ', altNames: ['Test fish', 'ปลาทดสอบ'], nameConfidence: 'medium', parts: ids.map(i => ({ id: i, text: `<p>แปล ${i}</p>` })) } as T
  }
  const r = await localizeSpecies(root, llm, 'th', [id], { now })
  expect(r.done).toHaveLength(1)
  expect(calls.filter(c => c.includes('Thai') && c.includes('--- PARTS ---'))).toHaveLength(2) // first try + retry
  expect(calls[2]).toContain('fix "x"')
  const t = JSON.parse(await readFile(join(root, 'content/species', id, 'th.json'), 'utf8'))
  expect(t.slug).toBe(e.scientificName.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
  expect(t.name).toBe('ปลาทดสอบ')
  expect(t.altNames).toEqual(['Test fish'])
  expect(Object.keys(t.sections).sort()).toEqual(e.sections.filter(s => s.html.trim()).map(s => `${s.key}:${s.source}`).sort())
  expect(t.quality).toMatchObject({ score: 0.9, indexable: true })
  // English changed since (state says it was made from an older one): made again.
  const stateFile = join(root, 'engine-state/localize-th.json')
  const st = JSON.parse(await readFile(stateFile, 'utf8'))
  await writeFile(stateFile, JSON.stringify({ ...st, [id]: { ...st[id], from: '2000-01-01' } }))
  expect((await localizeSpecies(root, llm, 'th', [id], { now })).done).toHaveLength(1)
  // Done once: skipped next time; a redo keeps the address.
  expect((await localizeSpecies(root, llm, 'th', [id], { now })).skipped).toEqual([id])
  await writeFile(join(root, 'content/species', id, 'th.json'), JSON.stringify({ ...t, slug: 'kept-address' }))
  await localizeSpecies(root, llm, 'th', [id], { now, redo: true })
  expect(JSON.parse(await readFile(join(root, 'content/species', id, 'th.json'), 'utf8')).slug).toBe('kept-address')
})

test('a part left out (shop talk, a byline) is dropped and shown to the reviewer; nothing left fails the page', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  const nothing = async <T,>() => ({ name: 'Ikan Uji', altNames: [], nameConfidence: 'low', parts: [] }) as T
  expect((await localizeSpecies(root, nothing, 'id', [id], { now })).failed[0]).toMatch(/left out every part/)
  await expect(readFile(join(root, 'content/species', id, 'id.json'), 'utf8')).rejects.toThrow()
  let reviewed = ''
  const firstOnly = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) { reviewed = a.prompt; return { score: 0.9, notes: [] } as T }
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'Ikan Uji', altNames: [], nameConfidence: 'low', parts: [{ id: ids[0], text: '<p>ok</p>' }] } as T
  }
  await localizeSpecies(root, firstOnly, 'id', [id], { now })
  const t = JSON.parse(await readFile(join(root, 'content/species', id, 'id.json'), 'utf8'))
  expect(Object.keys(t.sections)).toHaveLength(1)
  expect(reviewed).toContain('(left out)')
})

test('text from a source that does not allow translation is never sent or written', async () => {
  const root = await site(['seriouslyfish'])
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  const e = JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string }[] }
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'Ikan Uji', altNames: [], nameConfidence: 'high', parts: ids.map(i => ({ id: i, text: '<p>x</p>' })) } as T
  }
  await localizeSpecies(root, llm, 'id', [id], { now })
  const t = JSON.parse(await readFile(join(root, 'content/species', id, 'id.json'), 'utf8').catch(() => '{"sections":{}}'))
  expect(Object.keys(t.sections).some(k => k.endsWith(':seriouslyfish'))).toBe(false)
  expect(e.sections.some(s => s.source === 'seriouslyfish')).toBe(true) // the fixture page does have such text
})

test("a name another page has in the language is refused (the scientific name instead); an owner-fixed name stays on a redo", async () => {
  const root = await site()
  const [id, other] = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort() as [string, string]
  const sci = JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')).scientificName as string
  await writeFile(join(root, 'content/species', other, 'id.json'), JSON.stringify({ slug: 'discus', name: 'Discus', altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'discus', altNames: ['Ikan diskus'], nameConfidence: 'high', parts: ids.map(i => ({ id: i, text: '<p>x</p>' })) } as T
  }
  await localizeSpecies(root, llm, 'id', [id], { now })
  const file = join(root, 'content/species', id, 'id.json')
  const t = JSON.parse(await readFile(file, 'utf8'))
  expect(t.name).toBe(sci)
  expect(t.altNames).toEqual(['discus', 'Ikan diskus'])
  await writeFile(file, JSON.stringify({ ...t, name: 'Discus coklat', altNames: ['Discus'], nameFixed: true }))
  await localizeSpecies(root, llm, 'id', [id], { now, redo: true })
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ name: 'Discus coklat', altNames: ['Discus', 'discus', 'Ikan diskus'], nameFixed: true })
})

test('plant pages: written beside the plant, their own state file, the hint has no family when the plant has none', async () => {
  const root = await site()
  const id = 'cryptocoryne-wendtii'
  const prompts: string[] = []
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'Cryptocoryne Wendtii', altNames: [], nameConfidence: 'high', parts: ids.map(i => ({ id: i, text: '<p>x</p>' })) } as T
  }
  const r = await localizeSpecies(root, llm, 'id', [id], { now, kind: 'plants' })
  expect(r.done).toHaveLength(1)
  expect(JSON.parse(await readFile(join(root, 'content/plants', id, 'id.json'), 'utf8')).slug).toBe('cryptocoryne-wendtii')
  expect(Object.keys(JSON.parse(await readFile(join(root, 'engine-state/localize-id-plants.json'), 'utf8')))).toEqual([id])
  await expect(readFile(join(root, 'engine-state/localize-id.json'), 'utf8')).rejects.toThrow()
  expect(prompts[0]).toContain('The species: Cryptocoryne wendtii, sold in Vietnam as "')
  expect(prompts[0]).not.toContain('undefined')
  expect(prompts[0]).toContain('a cultivar or variety keeps its cultivar or variety name')
  expect(prompts[0]).not.toContain('never for one strain')
  // A second plant with the same name is addressed by its scientific name, also when the first is in the run (skipped, done).
  await localizeSpecies(root, llm, 'id', [id, 'anubias-barteri-nana'], { now, kind: 'plants' })
  const sci = JSON.parse(await readFile(join(root, 'content/plants/anubias-barteri-nana/entity.json'), 'utf8')).scientificName as string
  expect(JSON.parse(await readFile(join(root, 'content/plants/anubias-barteri-nana/id.json'), 'utf8')).slug).toBe(sci.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
})

test('glossary: every term from its Vietnamese definition; Thai addressed by the English term; a term left out is not written', async () => {
  const root = await site()
  const prompts: string[] = []
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1]).filter(i => i !== 'gh')
    return { terms: ids.map(i => ({ id: i, name: `คำ ${i}`, altNames: ['pasir', `คำ ${i}`, i!.toUpperCase().replaceAll('-', ''), 'WC', `two words ${i}`], definition: `ความหมาย ${i}` })) } as T
  }
  const r = await localizeGlossary(root, llm, 'th')
  expect(r.done.sort()).toEqual(['ca-dan', 'chu-trinh-nito', 'ph'])
  expect(r.failed).toEqual(['gh: left out'])
  expect(prompts[0]).toContain('Thang đo độ chua')
  expect(prompts[0]).toContain('General hardness')
  const t = JSON.parse(await readFile(join(root, 'content/glossary/chu-trinh-nito/th.json'), 'utf8'))
  // Other names the site would link in running text: an everyday single word is dropped, and so is one two terms share.
  expect(t).toMatchObject({ slug: 'nitrogen-cycle', name: 'คำ chu-trinh-nito', altNames: ['CHUTRINHNITO', 'two words chu-trinh-nito'], definition: 'ความหมาย chu-trinh-nito', quality: { score: 0.9, indexable: true } })
  await expect(readFile(join(root, 'content/glossary/gh/th.json'), 'utf8')).rejects.toThrow()
  // Done once: only the missing term is asked again.
  prompts.length = 0
  await localizeGlossary(root, llm, 'th')
  expect([...prompts[0]!.matchAll(/^### (\S+)$/gm)].map(m => m[1])).toEqual(['gh'])
})

test('place names: every place named in the language; a name with Vietnamese letters or none is not written', async () => {
  const root = await site()
  const prompts: string[] = []
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)/gm)].map(m => m[1]!)
    return { places: ids.map(i => ({ id: i, name: i === 'china' ? 'Trung Quốc' : i === 'peru' ? '' : `ประเทศ ${i}` })) } as T
  }
  const r = await localizePlaces(root, llm, 'th')
  expect(r.failed.sort()).toEqual(['china: no name', 'peru: no name'])
  expect(prompts[0]).toContain('### rio-negro (river, in brazil): Rio Negro')
  const t = JSON.parse(await readFile(join(root, 'content/places/brazil/th.json'), 'utf8'))
  expect(t).toMatchObject({ slug: 'brazil', name: 'ประเทศ brazil', quality: { score: 0.9, indexable: true } })
  // Done once: only the two left are asked again.
  prompts.length = 0
  await localizePlaces(root, llm, 'th')
  expect([...prompts[0]!.matchAll(/^### (\S+)/gm)].map(m => m[1]).sort()).toEqual(['china', 'peru'])
})

test('fish native to a country: listed under it or under a place inside it', async () => {
  const root = await site()
  const file = join(root, 'content/species/paracheirodon-axelrodi/entity.json')
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), places: ['rio-negro'] }))
  expect([...await nativeTo(root, 'indonesia')]).toEqual(['boraras-brigittae'])
  expect([...await nativeTo(root, 'brazil')].sort()).toEqual(['paracheirodon-axelrodi', 'paracheirodon-innesi', 'pterophyllum-scalare', 'symphysodon-aequifasciatus'])
})

test('translation order: staples and most-kept fish, then pages the other language has, then the country\'s own fish, then the rest', async () => {
  const root = await site()
  const add = async (id: string, files: Record<string, object>) => {
    await mkdir(join(root, 'content/species', id), { recursive: true })
    for (const [f, v] of Object.entries(files)) await writeFile(join(root, 'content/species', id, f), JSON.stringify(v))
  }
  await add('aaa-native', { 'entity.json': { places: ['indonesia'] } })
  await add('zzz-elsewhere', { 'entity.json': {}, 'th.json': {} })
  const id = await speciesOrder(root, 'id')
  expect(id.slice(0, 2)).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi'])
  expect(id.slice(-3)).toEqual(['zzz-elsewhere', 'aaa-native', 'apistogramma-cacatuoides'])
  expect((await speciesOrder(root, 'th')).slice(-3)).toEqual(['aaa-native', 'apistogramma-cacatuoides', 'zzz-elsewhere'])
})
