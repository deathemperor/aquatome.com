import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { mendLocalized, partsNamed, sameTextMended } from '../src/localize-mend'
import { logReviews, readReviews } from '../src/review-log'

const LONG = 'ปลาชนิดนี้อยู่รวมกันเป็นฝูงและควรเลี้ยงอย่างน้อยหกตัวในตู้ที่ปลูกไม้น้ำหนาแน่นและมีที่ว่างให้ว่ายน้ำตรงกลางตู้'
const read = async (root: string, f: string) => JSON.parse(await readFile(join(root, f), 'utf8'))

/** One Thai fish page under the bar: three parts from two sources, and the review on file with its notes. */
async function site(notes: string[], o: { score?: number } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mend-'))
  const dir = join(root, 'content/species/a')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content/sources.json'), JSON.stringify({ seriouslyfish: { permission: { scope: ['text', 'translation'] } }, glaser: { permission: { scope: ['text', 'translation'] } }, planetcatfish: { permission: { scope: ['text'] } } }))
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ id: 'a', scientificName: 'Aus bus', updatedAt: '2026-11-01', sections: [
    { key: 'notes', source: 'planetcatfish', html: '<p>Not ours to translate.</p>' },
    { key: 'habitat', source: 'seriouslyfish', html: '<p>It lives in slow streams.</p>' },
    { key: 'diet', source: 'seriouslyfish', html: '<p>It eats small insects. Feed it twice a day.</p>' },
    { key: 'behaviour', source: 'glaser', html: '<p>A shoaling fish: keep six or more.</p>' },
  ] }))
  const page = { slug: 'aus-bus', name: 'ปลาทดสอบ', altNames: [], sections: { 'habitat:seriouslyfish': `<p>อยู่ในลำธารน้ำไหลเอื่อย ${LONG}</p>`, 'diet:seriouslyfish': `<p>กินแมลงขนาดใหญ่ ให้อาหารวันละสองครั้ง ${LONG}</p>`, 'behaviour:glaser': `<p>ปลาฝูง ${LONG}</p>` }, quality: { score: o.score ?? 0.6, indexable: (o.score ?? 0.6) >= 0.75, bySource: { seriouslyfish: o.score ?? 0.6, glaser: o.score ?? 0.6 } } }
  await writeFile(join(dir, 'th.json'), `${JSON.stringify(page, null, 2)}\n`)
  await writeFile(join(root, 'engine-state/localize-th.json'), `${JSON.stringify({ a: { at: '2026-11-02', from: '2026-11-01', name: 'ปลาทดสอบ', confidence: 'high', score: o.score ?? 0.6, notes } }, null, 2)}\n`)
  const first = { score: o.score ?? 0.6, notes }
  if (notes.length) await logReviews(root, 'localize', { id: 'species/a', lang: 'th' }, [first], first, { now: new Date('2026-11-02T00:00:00Z') })
  return { root, page }
}

/** An editor that answers with `fix` for each part it is sent, and a reviewer that gives `score`. */
function fake(fix: (id: string, old: string) => string, score: number) {
  const calls: { prompt: string; review: boolean }[] = []
  const llm = (async (a: { prompt: string; schema: { required?: string[] } }) => {
    const isReview = !!a.schema.required?.includes('score')
    calls.push({ prompt: a.prompt, review: isReview })
    if (isReview) return { score, notes: ['Item 1: "x" is stiff.'] }
    const parts = [...a.prompt.split('--- PARTS ---')[1]!.matchAll(/^### (\S+)\nEN:\n[\s\S]*?\nTH:\n([\s\S]*?)\nNOTES:/gm)]
    return { parts: parts.map(m => ({ id: m[1]!, text: fix(m[1]!, m[2]!) })) }
  }) as unknown as Llm
  return { llm, calls }
}
const now = () => new Date('2026-11-11T00:00:00Z')
const NOTE = 'Item 2: "แมลงขนาดใหญ่" says large insects; the English says small insects.'

test('only the part a note names goes to the editor; the fixed page is kept when it reads higher, and its record follows', async () => {
  const { root, page } = await site([NOTE, 'The name is fine.'])
  const { llm, calls } = fake((_, old) => old.replace('ขนาดใหญ่', 'ขนาดเล็ก'), 0.85)
  const r = await mendLocalized(root, llm, 'th', ['a'], { now })
  expect(r).toEqual({ kept: ['a: 1 of 3 parts, 2 notes: 0.6 to 0.85, open, 1 parts changed'], notBetter: [], skipped: [], failed: [], stopped: '' })
  const sent = calls.find(c => !c.review)!.prompt
  expect(sent).toContain('### diet:seriouslyfish')
  expect(sent).toContain(NOTE)
  expect(sent).not.toContain('### habitat:seriouslyfish')
  expect(sent).not.toContain('### behaviour:glaser')
  expect(sent).not.toContain('Not ours to translate')
  // The reviewer reads the whole page as it will be written, the part outside the translation's scope aside.
  const reread = calls.find(c => c.review)!.prompt
  expect(reread).toContain('แมลงขนาดเล็ก')
  expect(reread).toContain(page.sections['habitat:seriouslyfish'])
  const t = await read(root, 'content/species/a/th.json')
  expect(t.sections).toEqual({ ...page.sections, 'diet:seriouslyfish': page.sections['diet:seriouslyfish'].replace('ขนาดใหญ่', 'ขนาดเล็ก') })
  expect(t.quality).toEqual({ score: 0.85, indexable: true, bySource: { seriouslyfish: 0.85, glaser: 0.85 } })
  expect({ slug: t.slug, name: t.name, altNames: t.altNames }).toEqual({ slug: page.slug, name: page.name, altNames: [] })
  const [newest, old] = (await readReviews(root, 'localize'))['th/species/a']!
  expect(newest).toMatchObject({ attempt: 'rewrite', kept: true, score: 0.85 })
  expect(old).toMatchObject({ attempt: 'first', score: 0.6 })
  expect((await read(root, 'engine-state/localize-th.json')).a).toMatchObject({ score: 0.85, notes: ['Item 1: "x" is stiff.'], from: '2026-11-01', at: '2026-11-02' })
})

test('a fix that reads no higher leaves the page and its record as they were, and that text is not tried again', async () => {
  const { root } = await site([NOTE])
  const before = await readFile(join(root, 'content/species/a/th.json'), 'utf8')
  const state = await readFile(join(root, 'engine-state/localize-th.json'), 'utf8')
  for (const score of [0.6, 0.5]) {
    const { llm, calls } = fake((_, old) => old.replace('ขนาดใหญ่', 'ขนาดเล็ก'), score)
    const r = await mendLocalized(root, llm, 'th', ['a'], { now })
    expect(await readFile(join(root, 'content/species/a/th.json'), 'utf8')).toBe(before)
    expect(await readFile(join(root, 'engine-state/localize-th.json'), 'utf8')).toBe(state)
    if (score === 0.6) {
      expect(r.notBetter).toEqual(['a: 1 of 3 parts, 1 notes: 0.6 then 0.6, left as it was'])
      expect((await readReviews(root, 'localize'))['th/species/a']![0]).toMatchObject({ attempt: 'rewrite', kept: false, score: 0.6 })
    } else {
      expect(r.skipped).toEqual(['a: a fix of this text was tried'])
      expect(calls).toEqual([])
    }
  }
})

test('a page with a note on a dose or harm is left for that check, and so is one whose notes name no part', async () => {
  for (const [notes, why] of [
    [[NOTE, 'Item 3: the salt dose is given as 3 g per litre where the English says 1 g.'], 'a: a note on a dose, a medicine or harm'],
    [[NOTE, 'Item 1: "kills snails" is left out.'], 'a: a note on a dose, a medicine or harm'],
    [['The page reads stiffly throughout.'], 'a: its notes name no part'],
    [['Item 9: no such part.'], 'a: its notes name no part'],
  ] as const) {
    const { root } = await site([...notes])
    const before = await readFile(join(root, 'content/species/a/th.json'), 'utf8')
    const { llm, calls } = fake(() => 'x', 0.9)
    expect((await mendLocalized(root, llm, 'th', ['a'], { now })).skipped, why).toEqual([why])
    expect(calls, why).toEqual([])
    expect(await readFile(join(root, 'content/species/a/th.json'), 'utf8')).toBe(before)
  }
})

test('a part the editor rewrote, emptied or returned as it was is not taken; nothing changed means no second read', async () => {
  for (const fix of [() => `<p>${'ข้อความใหม่ทั้งหมดที่ไม่เหมือนของเดิมเลยแม้แต่น้อย'.repeat(4)}</p>`, () => '', (_: string, old: string) => old]) {
    const { root } = await site([NOTE])
    const before = await readFile(join(root, 'content/species/a/th.json'), 'utf8')
    const { llm, calls } = fake(fix, 0.9)
    expect((await mendLocalized(root, llm, 'th', ['a'], { now })).skipped).toEqual(['a: 1 of 3 parts, 1 notes: the fix changed nothing'])
    expect(calls.filter(c => c.review)).toEqual([])
    expect(await readFile(join(root, 'content/species/a/th.json'), 'utf8')).toBe(before)
  }
})

test('a page at the bar, one with no notes, and a dry run call no model', async () => {
  for (const [notes, score, dry, skipped] of [[[NOTE], 0.75, false, []], [[], 0.6, false, ['a: no notes on file']], [[NOTE], 0.6, true, ['a: 1 of 3 parts, 1 notes (dry run)']]] as const) {
    const { root } = await site([...notes], { score })
    const { llm, calls } = fake(() => 'x', 0.9)
    expect((await mendLocalized(root, llm, 'th', ['a'], { now, dry })).skipped).toEqual(skipped)
    expect(calls).toEqual([])
  }
})

test('the parts a note names, and what counts as the same text mended', () => {
  expect(partsNamed('Item 4: x')).toEqual([4])
  expect(partsNamed('Items 6 and 13: x; see also item 2, 3')).toEqual([6, 13, 2, 3])
  expect(partsNamed('The name is fine.')).toEqual([])
  expect(sameTextMended(`<p>${LONG} ขนาดใหญ่</p>`, `<p>${LONG} ขนาดเล็ก</p>`)).toBe(true)
  expect(sameTextMended(`<p>${LONG}</p>`, '<p>อื่น</p>')).toBe(false)
  expect(sameTextMended(`<p>${LONG}</p>`, `<p>${LONG}${LONG}</p>`)).toBe(false)
})
