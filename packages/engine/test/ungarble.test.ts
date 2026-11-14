import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { ungarble } from '../src/ungarble'

const L = '�'
async function setup(pages: Record<string, object>) {
  const root = join(await mkdtemp(join(tmpdir(), 'ungarble-')), 'content')
  for (const [f, t] of Object.entries(pages)) { await mkdir(join(root, f, '..'), { recursive: true }); await writeFile(join(root, f), `${JSON.stringify(t, null, 2)}\n`) }
  return root
}
const read = async (root: string, f: string) => JSON.parse(await readFile(join(root, f), 'utf8'))
/** A page's two readers give the same answer: the next list of letters. `second`: what the second reader says instead. */
const fake = (answers: string[][], prompts: string[] = [], second?: string[]): Llm => {
  let last: string[] = []
  return (async (a: { prompt: string; model?: string }) => {
    if (a.model) return { letters: second ?? last }
    prompts.push(a.prompt)
    return { letters: (last = answers.shift() ?? []) }
  }) as Llm
}

// The pages of 2026-11-10: "มีสายพันธุ์ที่��พาะในตู้ปลา" on the Thai guppy page, "dài 2,5 ��ến 3 cm" on a Vietnamese one.
test('a letter lost in transit is put back where it was, wherever in the page\'s file it is, and nothing else changes', async () => {
  const th = { slug: 'x', name: 'ปลาหางนกยูง', sections: { 'notes:seriouslyfish': `<p>มีสายพันธุ์ที่${L}${L}พาะในตู้ปลา และควรให${L}${L}${L}เป็นครั้งคราว</p>`, 'diet:seriouslyfish': '<p>กินได้ทุกอย่าง</p>' }, quality: { score: 0.7, indexable: false } }
  const vi = { slug: 'y', name: 'Cá nóc', body: '<p>Cá dài 2,5 đến 3 cm.</p>', summary: ['Ổn.'], faq: [{ q: 'Dài bao nhiêu?', a: `Dài 2,5 ${L}${L}ến 3 cm.` }] }
  const root = await setup({ 'species/a/th.json': th, 'guides/g/vi.json': vi, 'species/a/vi.json': { slug: 'a', name: 'A', sections: { 'notes:seriouslyfish': '<p>Ổn.</p>' } } })
  const prompts: string[] = []
  const r = await ungarble(root, { llm: fake([['đ'], ['เ', '้']], prompts) })
  expect(r).toEqual({ restored: ['guides/g/vi (1)', 'species/a/th (2)'], left: [] })
  expect(await read(root, 'species/a/th.json')).toEqual({ ...th, sections: { ...th.sections, 'notes:seriouslyfish': '<p>มีสายพันธุ์ที่เพาะในตู้ปลา และควรให้เป็นครั้งคราว</p>' } })
  expect(await read(root, 'guides/g/vi.json')).toEqual({ ...vi, faq: [{ q: 'Dài bao nhiêu?', a: 'Dài 2,5 đến 3 cm.' }] })
  // The model is shown each place with what is around it, and asked for the letters only.
  expect(prompts).toHaveLength(2)
  expect(prompts[1]).toContain('Thai')
  expect(prompts[1]).toContain('1. …<p>มีสายพันธุ์ที่⟦?⟧พาะในตู้ปลา และควรให')
  expect(prompts[1]).toContain('⟦?⟧เป็นครั้งคราว</p>…')
  // Nothing garbled: no call.
  expect(await ungarble(root, { llm: fake([], prompts) })).toEqual({ restored: [], left: [] })
  expect(prompts).toHaveLength(2)
})

test('an answer that can\'t be the lost letter leaves the page as it was, to try again next run', async () => {
  const page = { slug: 'x', name: 'X', body: `<p>มีสายพันธุ์ที่${L}${L}${L}พาะ</p>` }
  const bad: [string, string[]][] = [
    ['a word', ['เพาะ']], ['a letter too many', ['เ', 'า']], ['none', []], ['a space', [' ']], ['markup', ['<']],
    ['a letter one byte long, which no cut can lose', ['e']], ['a letter two bytes long where three bytes were lost', ['đ']], ['the mark itself', [L]],
  ]
  for (const [name, letters] of bad) {
    const root = await setup({ 'species/a/th.json': page })
    expect(await ungarble(root, { llm: fake([letters]) }), name).toEqual({ restored: [], left: ['species/a/th (1)'] })
    expect(await read(root, 'species/a/th.json'), name).toEqual(page)
  }
  // Two readers who name different letters: neither is taken. On 2026-11-10 one read gave "รรวัง" for "ระวัง".
  const root = await setup({ 'species/a/th.json': page })
  expect(await ungarble(root, { llm: fake([['เ']], [], ['แ']) })).toEqual({ restored: [], left: ['species/a/th (1)'] })
  expect(await read(root, 'species/a/th.json')).toEqual(page)
})

test('the accounts out stops the run with what it restored; --limit bounds the pages', async () => {
  const page = { slug: 'x', name: 'X', body: `<p>ที่${L}${L}พาะ</p>` }
  const root = await setup({ 'species/a/th.json': page, 'species/b/th.json': page, 'species/c/th.json': page })
  let n = 0
  const llm = (async () => { if (n++ > 1) throw new LlmError('usage limit'); return { letters: ['เ'] } }) as Llm
  const r = await ungarble(root, { llm })
  expect(r).toEqual({ restored: ['species/a/th (1)'], left: ['species/b/th (1)', 'species/c/th (1)'], stopped: 'usage limit' })
  const one = await ungarble(root, { llm: fake([['เ'], ['เ']]) }, { limit: 1 })
  expect(one).toEqual({ restored: ['species/b/th (1)'], left: ['species/c/th (1)'] })
})

test.each([' ', '\t'])('raw formatting survives with %j indentation', async indent => {
  const root = await setup({ 'species/a/th.json': {} })
  const raw = `{\n${indent}"z": "line\\nquote\\\" \\u00e9 ที่��พาะ",\n${indent}"10": "ten",\n${indent}"2": "two",\n${indent}"a": 1\n}`
  await writeFile(join(root, 'species/a/th.json'), raw)
  expect(await ungarble(root, { llm: fake([['เ']]) })).toEqual({ restored: ['species/a/th (1)'], left: [] })
  expect(await readFile(join(root, 'species/a/th.json'))).toEqual(Buffer.from(raw.replace('��', 'เ')))
})

test('letters follow runs within strings and across nested arrays and objects', async () => {
  const root = await setup({ 'species/a/th.json': { z: 'ที่��พาะ ให���', a: [{ nested: ['คว���', { end: 'ร���วัง' }] }] } })
  expect(await ungarble(root, { llm: fake([['เ', '้', 'ร', 'ะ']]) })).toEqual({ restored: ['species/a/th (4)'], left: [] })
  expect(await read(root, 'species/a/th.json')).toEqual({ z: 'ที่เพาะ ให้', a: [{ nested: ['ควร', { end: 'ระวัง' }] }] })
})

test.each(['\\', '"', '\u0000', '\u001f'])('a JSON escape character %j is refused without touching the bytes', async letter => {
  const root = await setup({ 'species/a/th.json': { body: '��' } })
  const file = join(root, 'species/a/th.json')
  const raw = await readFile(file)
  expect(await ungarble(root, { llm: fake([[letter]]) })).toEqual({ restored: [], left: ['species/a/th (1)'] })
  expect(await readFile(file)).toEqual(raw)
})

test('a different raw run order leaves the page untouched and counted in left', async () => {
  const root = await setup({ 'species/a/th.json': {} })
  const file = join(root, 'species/a/th.json')
  // JSON.parse enumerates 2 before 10, unlike their order in these bytes.
  const raw = '{"10":"ที่��พาะ","2":"ร���วัง"}'
  await writeFile(file, raw)
  expect(await ungarble(root, { llm: fake([['ะ', 'เ']]) })).toEqual({ restored: [], left: ['species/a/th (2)'] })
  expect(await readFile(file)).toEqual(Buffer.from(raw))
})

// 2026-11-10: "มัมเบอรา��โม" on the dwarf rainbowfish's Thai page, which spells the river "มัมเบอราโม" in another part. What was
// lost there was a stray: no letter makes the word right.
test('a mark where both readers say nothing belongs is taken out; one reader saying so is not enough', async () => {
  const page = { body: '<p>แม่น้ำมัมเบอรา��โม</p>' }
  const root = await setup({ 'species/a/th.json': page })
  expect(await ungarble(root, { llm: fake([['']], [], ['ะ']) })).toEqual({ restored: [], left: ['species/a/th (1)'] })
  expect(await read(root, 'species/a/th.json')).toEqual(page)
  expect(await ungarble(root, { llm: fake([['']]) })).toEqual({ restored: ['species/a/th (1)'], left: [] })
  expect(await read(root, 'species/a/th.json')).toEqual({ body: '<p>แม่น้ำมัมเบอราโม</p>' })
})
