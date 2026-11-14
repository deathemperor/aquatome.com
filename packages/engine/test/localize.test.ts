import { denied } from './piece-admission'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { STAPLE_SPECIES } from '@aq/schema'
import { heroesWithout, localizeGlossary, localizePlaces, localizeSpecies, nativeTo, partHash, speciesOrder, TARGETS } from '../src/localize'

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
  // The English's date moved but no part of it changed: nothing is translated again (2026-11-11).
  const stateFile = join(root, 'engine-state/localize-th.json')
  const st = JSON.parse(await readFile(stateFile, 'utf8'))
  await writeFile(stateFile, JSON.stringify({ ...st, [id]: { ...st[id], from: '2000-01-01' } }))
  const asked = calls.length
  expect((await localizeSpecies(root, llm, 'th', [id], { now })).skipped).toEqual([id])
  expect(calls.length).toBe(asked)
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
  expect(r.done.sort()).toEqual(['ca-dan', 'chu-trinh-nito', 'lua', 'ph'])
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
  await mkdir(join(root, 'content/places/ma'), { recursive: true })
  await writeFile(join(root, 'content/places/ma/entity.json'), JSON.stringify({ id: 'ma', kind: 'region', countries: ['VN', 'CN'] }))
  await writeFile(join(root, 'content/places/ma/vi.json'), JSON.stringify({ name: 'Mã' }))
  const r = await localizePlaces(root, llm, 'th')
  expect(r.failed.sort()).toEqual(['china: no name', 'peru: no name'])
  expect(prompts[0]).toContain('### rio-negro (river, in brazil): Rio Negro')
  expect(prompts[0]).toContain('### ma (region, in VN, CN): Mã')
  const t = JSON.parse(await readFile(join(root, 'content/places/brazil/th.json'), 'utf8'))
  expect(t).toMatchObject({ slug: 'brazil', name: 'ประเทศ brazil', quality: { score: 0.9, indexable: true } })
  // Done once: only the two left are asked again.
  prompts.length = 0
  await localizePlaces(root, llm, 'th')
  expect([...prompts[0]!.matchAll(/^### (\S+)/gm)].map(m => m[1]).sort()).toEqual(['china', 'peru'])
})

test('the translator\'s reviewers of place names and glossary terms read a batch within 0.1 of the bar three times; the middle read counts', async () => {
  const root = await site()
  let reads = 0
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: [0.7, 0.9, 0.8][reads++ % 3]!, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)/gm)].map(m => m[1]!)
    if ((a.schema as { required?: string[] }).required?.includes('terms')) return { terms: ids.map(i => ({ id: i, name: `คำ ${i}`, definition: `ความหมาย ${i}` })) } as T
    return { places: ids.map(i => ({ id: i, name: `ประเทศ ${i}` })) } as T
  }
  await localizePlaces(root, llm, 'th')
  expect(reads).toBe(3)
  expect(JSON.parse(await readFile(join(root, 'content/places/brazil/th.json'), 'utf8')).quality).toMatchObject({ score: 0.8, indexable: true })
  reads = 0
  await localizeGlossary(root, llm, 'th')
  expect(reads).toBe(3) // 0.7 alone would have sent the batch back to be written again
})

test('fish native to a country: listed under it or under a place inside it', async () => {
  const root = await site()
  const file = join(root, 'content/species/paracheirodon-axelrodi/entity.json')
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), places: ['rio-negro'] }))
  expect([...await nativeTo(root, 'indonesia')]).toEqual(['boraras-brigittae'])
  expect([...await nativeTo(root, 'brazil')].sort()).toEqual(['paracheirodon-axelrodi', 'paracheirodon-innesi', 'pterophyllum-scalare', 'symphysodon-aequifasciatus'])
})

// The chief of staff, 2026-11-11: the translator's reviewer reads a page within 0.1 of the bar three times, and the middle
// read is the page's score; one well clear of it is read once.
test('a translation scored within 0.1 of the bar is read three times and gets the middle read', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  const scores = [0.8, 0.7, 0.85]
  let reviews = 0
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: scores[reviews++] ?? 0.95, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'Ikan uji', altNames: [], nameConfidence: 'medium', parts: ids.map(i => ({ id: i, text: `<p>terjemahan ${i}</p>` })) } as T
  }
  await localizeSpecies(root, llm, 'id', [id], { now })
  expect(reviews).toBe(3)
  expect(JSON.parse(await readFile(join(root, 'content/species', id, 'id.json'), 'utf8')).quality).toMatchObject({ score: 0.8, indexable: true })
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
  // The fixture's apistogramma-cacatuoides has a Malay page: it comes with the pages another served language has.
  expect(id.slice(-3)).toEqual(['apistogramma-cacatuoides', 'zzz-elsewhere', 'aaa-native'])
  expect((await speciesOrder(root, 'th')).slice(-3)).toEqual(['apistogramma-cacatuoides', 'aaa-native', 'zzz-elsewhere'])
})

// The chief of staff, 2026-11-11: on the first sign-in, pages whose English gained sections first, then the fish on
// Khám phá's top cards a language has no page for (it shows fewer than five cards), earliest week first.
test('translation order: new sections first, then the top cards without a page here, earliest week first', async () => {
  const root = await site()
  const e = JSON.parse(await readFile(join(root, 'content/species/boraras-brigittae/entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string }[] }
  const [first, second] = e.sections
  await mkdir(join(root, 'engine-state'), { recursive: true })
  // Translated from its first section only: the second is new.
  await writeFile(join(root, 'engine-state/localize-id.json'), JSON.stringify({ 'boraras-brigittae': { at: '2026-11-01', from: '2026-11-01', name: 'x', confidence: 'high', score: 0.9, parts: { [`${first!.key}:${first!.source}`]: partHash(first!.html) } } }))
  const week = (from: string, to: string, pages: string[]) => ({ from, to, hero: pages.map(page => ({ page, img: '' })) })
  await writeFile(join(root, 'content/curation.json'), JSON.stringify({ weeks: [
    week('2026-11-16', '2026-11-22', ['species/danio-margaritatus', 'breeds/oranda-goldfish']),
    week('2026-11-02', '2026-11-08', ['species/neocaridina-davidi']), // over
    week('2026-11-09', '2026-11-15', ['species/pterophyllum-scalare', 'species/apistogramma-cacatuoides', 'breeds/flowerhorn-cichlid']),
  ] }))
  expect((await speciesOrder(root, 'id', '2026-11-11')).slice(0, 3)).toEqual(['boraras-brigittae', 'pterophyllum-scalare', 'apistogramma-cacatuoides'])
  expect((await speciesOrder(root, 'id', '2026-11-11'))[3]).toBe('danio-margaritatus')
  // The fixture's cacatuoides and flowerhorn have Malay pages: not wanted there.
  expect((await speciesOrder(root, 'ms', '2026-11-11')).slice(0, 2)).toEqual(['pterophyllum-scalare', 'danio-margaritatus'])
  expect(await heroesWithout(root, 'ms', 'breeds', '2026-11-11')).toEqual(['oranda-goldfish'])
  // Translated from both: nothing new.
  await writeFile(join(root, 'engine-state/localize-id.json'), JSON.stringify({ 'boraras-brigittae': { parts: Object.fromEntries([first!, second!].map(x => [`${x.key}:${x.source}`, partHash(x.html)])) } }))
  expect((await speciesOrder(root, 'id', '2026-11-11'))[0]).toBe('pterophyllum-scalare')
})

test("Malay's style is Malaysia's: its words, its number marks and money, and nothing asked in Indonesian's words", () => {
  const { style } = TARGETS.ms
  for (const word of ['tumbuhan akuatik', 'ikan hiasan', 'akuarium', 'kerana', 'wang', 'penapis', 'tukar air', '1.5', '1,000', 'RM25', 'ikan laga', 'sarang buih']) expect(style, word).toContain(word)
  // Each Indonesian word appears only where the style forbids it: after "never".
  const asked = style.replace(/never[^.:]*/g, ' ')
  for (const word of ['pakan', 'tanaman air', 'ikan hias ', 'ganti air', 'siklus', 'karantina', 'kesadahan', 'uang', 'karena', 'cupang', 'sarang busa']) expect(asked, word).not.toContain(word)
  expect(TARGETS.id.style).toContain('Decimal comma (1,5)') // the two differ here, on purpose
})

test("Malay pages: addressed by their names as Indonesian's are, kept apart from the served languages' order", async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort().find(x => x !== 'apistogramma-cacatuoides')!
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
    expect(a.prompt).toContain('hobbyists in Malaysia')
    expect(a.prompt).toContain('tumbuhan akuatik')
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'Ikan Laga', altNames: ['Ikan Pelaga'], nameConfidence: 'high', parts: ids.map(i => ({ id: i, text: '<p>Suhu 68 °F, 1 gelen.</p>' })) } as T
  }
  await localizeSpecies(root, llm, 'ms', [id], { now })
  const t = JSON.parse(await readFile(join(root, 'content/species', id, 'ms.json'), 'utf8'))
  expect(t).toMatchObject({ slug: 'ikan-laga', name: 'Ikan Laga', altNames: ['Ikan Pelaga'] })
  expect(Object.values(t.sections)[0]).toBe('<p>Suhu 20 °C, 3.8 liter.</p>')
  // The state file is its own: localize-ms.json, not another language's.
  expect(JSON.parse(await readFile(join(root, 'engine-state/localize-ms.json'), 'utf8'))[id]).toMatchObject({ name: 'Ikan Laga' })
  // A page only Malay has doesn't count as a page "another site language already has" for a served language…
  const th = await speciesOrder(root, 'th')
  await rm(join(root, 'content/species', id, 'ms.json'))
  expect(await speciesOrder(root, 'th')).toEqual(th)
  // …and Malay itself starts from the staples.
  expect(STAPLE_SPECIES).toContain((await speciesOrder(root, 'ms'))[0])
})

test('two Malay glossary terms under one address: the second takes its word for "term"', async () => {
  const root = await site()
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) return { score: 0.9, notes: [] } as T
    const ids = [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { terms: ids.map(id => ({ id, name: 'Takrif', altNames: [], definition: 'Takrif.' })) } as T
  }
  const r = await localizeGlossary(root, llm, 'ms', { only: ['gh', 'chu-trinh-nito'] })
  expect(r.done).toHaveLength(2)
  const slug = async (id: string) => JSON.parse(await readFile(join(root, 'content/glossary', id, 'ms.json'), 'utf8')).slug as string
  expect([await slug('chu-trinh-nito'), await slug('gh')].sort()).toEqual(['takrif', 'takrif-istilah'])
})

// The Writing Lead's rule (the chief of staff, 2026-11-11): 18 pages lost a passing translation to a whole-page redo
// under the bar when their English gained sections, though no section they were made from had changed.
type Sec = { key: string; source: string; sourceUrl?: string; html: string }
/** A translator that writes `<p>{tag} {id}</p>` for each part asked, and a reviewer whose score `score()` gives. */
function translator(tag: () => string, score: () => number) {
  const writes: string[] = []
  const reviews: string[] = []
  const llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('required' in a.schema && (a.schema.required as string[]).includes('score')) { reviews.push(a.prompt); return { score: score(), notes: [] } as T }
    writes.push(a.prompt)
    const ids = [...a.prompt.split('--- PARTS ---')[1]!.matchAll(/^### (\S+)$/gm)].map(m => m[1])
    return { name: 'ปลาทดสอบ', altNames: [], nameConfidence: 'high', parts: ids.map(i => ({ id: i, text: `<p>${tag()} ${i}</p>` })) } as T
  }
  return { llm, writes, reviews }
}
async function pageWith(root: string, id: string, change: (sections: Sec[]) => Sec[]) {
  const f = join(root, 'content/species', id, 'entity.json')
  const e = JSON.parse(await readFile(f, 'utf8')) as { sections: Sec[]; updatedAt: string }
  await writeFile(f, JSON.stringify({ ...e, sections: change(e.sections), updatedAt: '2099-01-01' }))
}
const asked = (prompt: string) => [...prompt.split('--- PARTS ---')[1]!.matchAll(/^### (\S+)$/gm)].map(m => m[1])
const NEW: Sec = { key: 'diet', source: 'aquariumcoop', sourceUrl: 'https://www.aquariumcoop.com/blogs/aquarium/x', html: '<p>Feeds on worms.</p>' }

test('the English gains a section and changes one: only those two are translated and reviewed, beside the kept text; each source its own score', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  let tag = 'T1', score = 0.9
  const t = translator(() => tag, () => score)
  await localizeSpecies(root, t.llm, 'th', [id], { now })
  const first = JSON.parse(await readFile(join(root, 'content/species', id, 'th.json'), 'utf8'))
  const [changed, ...rest] = Object.keys(first.sections) as string[]
  await pageWith(root, id, s => [...s.map(x => (`${x.key}:${x.source}` === changed ? { ...x, html: `${x.html}<p>One more line.</p>` } : x)), NEW])
  tag = 'T2'; score = 0.8
  const r = await localizeSpecies(root, t.llm, 'th', [id], { now })
  expect(r.done).toHaveLength(1)
  expect(t.writes).toHaveLength(2)
  expect(asked(t.writes[1]!).sort()).toEqual([changed, 'diet:aquariumcoop'].sort())
  expect(t.writes[1]).toContain('--- ALREADY ON THE PAGE ---')
  expect(t.writes[1]).toContain(`T1 ${rest[0]}`)
  expect(t.reviews[1]!.match(/^### \d+$/gm)).toHaveLength(2)
  const after = JSON.parse(await readFile(join(root, 'content/species', id, 'th.json'), 'utf8'))
  for (const k of rest) expect(after.sections[k]).toBe(first.sections[k])
  expect(after.sections[changed!]).toBe(`<p>T2 ${changed}</p>`)
  expect(after.sections['diet:aquariumcoop']).toBe('<p>T2 diet:aquariumcoop</p>')
  expect(after.quality.bySource.aquariumcoop).toBe(0.8)
  expect(after.quality).toMatchObject({ score: 0.8, indexable: true })
  expect(after.name).toBe(first.name)
})

test('new sections under the bar stay off the page, which keeps its text and score, and wait a week before they are tried again', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  let score = 0.9
  const t = translator(() => 'T', () => score)
  await localizeSpecies(root, t.llm, 'th', [id], { now })
  const file = join(root, 'content/species', id, 'th.json')
  const before = await readFile(file, 'utf8')
  await pageWith(root, id, s => [...s, NEW])
  score = 0.5
  const r = await localizeSpecies(root, t.llm, 'th', [id], { now })
  expect(r.failed.join('\n')).toMatch(/new parts under the bar \(0.5\), the page keeps its text/)
  expect(await readFile(file, 'utf8')).toBe(before)
  const calls = t.writes.length + t.reviews.length
  expect((await localizeSpecies(root, t.llm, 'th', [id], { now: () => new Date('2026-11-06T23:00:00Z') })).skipped).toEqual([id])
  expect(t.writes.length + t.reviews.length).toBe(calls)
  score = 0.9
  expect((await localizeSpecies(root, t.llm, 'th', [id], { now: () => new Date('2026-11-08T00:00:00Z') })).done).toHaveLength(1)
  expect(JSON.parse(await readFile(file, 'utf8')).sections['diet:aquariumcoop']).toBe('<p>T diet:aquariumcoop</p>')
})

test('a page made before parts were recorded keeps its passing text when the whole page again scores under the bar', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  let score = 0.9
  const t = translator(() => 'T', () => score)
  await localizeSpecies(root, t.llm, 'th', [id], { now })
  const stateFile = join(root, 'engine-state/localize-th.json')
  const st = JSON.parse(await readFile(stateFile, 'utf8'))
  const { parts: _, ...old } = st[id]
  await writeFile(stateFile, JSON.stringify({ ...st, [id]: old }))
  const file = join(root, 'content/species', id, 'th.json')
  const before = await readFile(file, 'utf8')
  await pageWith(root, id, s => [...s, NEW])
  score = 0.5
  const r = await localizeSpecies(root, t.llm, 'th', [id], { now })
  expect(r.failed.join('\n')).toMatch(/the whole page again was under the bar/)
  expect(await readFile(file, 'utf8')).toBe(before)
  const after = JSON.parse(await readFile(stateFile, 'utf8'))[id]
  expect(Object.keys(after.failed.parts)).toEqual(['diet:aquariumcoop'])
  expect(Object.keys(after.parts)).not.toContain('diet:aquariumcoop')
})

// The independent read of the tap-water fixes (2026-11-12): a part fixed by hand (`fixed`, in English and in each language
// beside it) was translated again whenever its English changed, so the hand-written text of the lucky bamboo's water parts
// would have gone with the next batch.
test('a part fixed by hand keeps its text in each language: not translated again, part by part or a whole page, and taken as made from its English', async () => {
  const root = await site()
  const id = (await import('node:fs')).readdirSync(join(root, 'content/species')).sort()[0]!
  let tag = 'T1'
  const t = translator(() => tag, () => 0.9)
  await localizeSpecies(root, t.llm, 'th', [id], { now })
  const file = join(root, 'content/species', id, 'th.json')
  const first = JSON.parse(await readFile(file, 'utf8'))
  const [held, other] = Object.keys(first.sections) as string[]
  await writeFile(file, JSON.stringify({ ...first, sections: { ...first.sections, [held!]: '<p>by hand</p>' } }))
  const fixedEn = '<p>Fixed by hand.</p>'
  await pageWith(root, id, s => [...s.map(x => (`${x.key}:${x.source}` === held ? { ...x, html: fixedEn, fixed: true } : x)), NEW])
  tag = 'T2'
  expect((await localizeSpecies(root, t.llm, 'th', [id], { now })).done).toHaveLength(1)
  expect(asked(t.writes[1]!)).toEqual(['diet:aquariumcoop'])
  const after = JSON.parse(await readFile(file, 'utf8'))
  expect(after.sections[held!]).toBe('<p>by hand</p>')
  expect(after.sections['diet:aquariumcoop']).toBe('<p>T2 diet:aquariumcoop</p>')
  const stateFile = join(root, 'engine-state/localize-th.json')
  expect(JSON.parse(await readFile(stateFile, 'utf8'))[id].parts[held!]).toBe(partHash(fixedEn))
  // A whole page again (a redo): every other part is written anew, the fixed one keeps its text.
  tag = 'T3'
  await localizeSpecies(root, t.llm, 'th', [id], { now, redo: true })
  const redone = JSON.parse(await readFile(file, 'utf8'))
  expect(redone.sections[held!]).toBe('<p>by hand</p>')
  if (other) expect(redone.sections[other]).toBe(`<p>T3 ${other}</p>`)
})

test('last item cost refuses admission without calls or content writes', async () => {
  const root = await site()
  const ids = (await import('node:fs')).readdirSync(join(root, 'content/species'))
  let calls = 0
  await denied('localize', root, async () => {
    const r = await localizeSpecies(root, async () => { calls++; throw new Error('must not call') }, 'th', ids, { redo: true })
    expect(r.stopped).toContain('not started')
    expect(r.failed).toEqual([])
    expect(calls).toBe(0)
  })
})
