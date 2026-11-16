import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { doseOrHarm, hasDose, keepsWhatItSays, mendLocalized, pageTextHash, partsNamed, quotesIn, sameTextMended, type MendTry } from '../src/localize-mend'
import { logReviews, readReviews } from '../src/review-log'

const LONG = 'ปลาชนิดนี้อยู่รวมกันเป็นฝูงและควรเลี้ยงอย่างน้อยหกตัวในตู้ที่ปลูกไม้น้ำหนาแน่นและมีที่ว่างให้ว่ายน้ำตรงกลางตู้'
const read = async (root: string, f: string) => JSON.parse(await readFile(join(root, f), 'utf8'))

const PARTS = [
  { id: 'habitat:seriouslyfish', en: '<p>It lives in slow streams.</p>' },
  { id: 'diet:seriouslyfish', en: '<p>It eats small insects. Feed it twice a day.</p>' },
  { id: 'behaviour:glaser', en: '<p>A shoaling fish: keep six or more.</p>' },
]
const SECTIONS = { 'habitat:seriouslyfish': `<p>อยู่ในลำธารน้ำไหลเอื่อย ${LONG}</p>`, 'diet:seriouslyfish': `<p>กินแมลงขนาดใหญ่ ให้อาหารวันละสองครั้ง ${LONG}</p>`, 'behaviour:glaser': `<p>ปลาฝูง ${LONG}</p>` }
const FIXED = { ...SECTIONS, 'diet:seriouslyfish': SECTIONS['diet:seriouslyfish'].replace('ขนาดใหญ่', 'ขนาดเล็ก') }
const HASH = pageTextHash(PARTS, SECTIONS)

/**
 * One Thai fish page under the bar: three parts from two sources, and the translator's review of it in the log, which
 * stored no hash. `read`: a later read is on file too, with these notes: the middle of three, of the text the page has
 * ('stale': of another text; 'once': of this text, but one read near the bar). `lacks`: the page lacks a part. `diet`:
 * the second part's English otherwise, or fixed by hand. `habitat`: the first part's Thai otherwise.
 */
async function site(notes: string[], o: { score?: number; read?: number | 'stale' | 'once'; lacks?: boolean; diet?: { en?: string; fixed?: true }; habitat?: string } = {}) {
  const parts = PARTS.map(p => (p.id === 'diet:seriouslyfish' ? { ...p, en: o.diet?.en ?? p.en } : p))
  const sections = { ...SECTIONS, ...(o.habitat ? { 'habitat:seriouslyfish': o.habitat } : {}) }
  const root = await mkdtemp(join(tmpdir(), 'mend-'))
  const dir = join(root, 'content/species/a')
  const score = o.score ?? 0.6
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content/sources.json'), JSON.stringify({ seriouslyfish: { permission: { scope: ['text', 'translation'] } }, glaser: { permission: { scope: ['text', 'translation'] } }, planetcatfish: { permission: { scope: ['text'] } } }))
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ id: 'a', scientificName: 'Aus bus', updatedAt: '2026-11-01', sections: [
    { key: 'notes', source: 'planetcatfish', html: '<p>Not ours to translate.</p>' },
    ...parts.map(p => ({ key: p.id.split(':')[0], source: p.id.split(':')[1], html: p.en, ...(p.id === 'diet:seriouslyfish' && o.diet?.fixed ? { fixed: true } : {}) })),
  ] }))
  const { 'behaviour:glaser': _, ...short } = sections
  const page = { slug: 'aus-bus', name: 'ปลาทดสอบ', altNames: [], sections: o.lacks ? short : sections, quality: { score, indexable: score >= 0.75, bySource: { seriouslyfish: score, glaser: score } } }
  await writeFile(join(dir, 'th.json'), `${JSON.stringify(page, null, 2)}\n`)
  await writeFile(join(root, 'engine-state/localize-th.json'), `${JSON.stringify({ a: { at: '2026-11-02', from: '2026-11-01', name: 'ปลาทดสอบ', confidence: 'high', score, notes: ['The translator\'s old note on item 1.'] } }, null, 2)}\n`)
  const first = { score, notes: ['The translator\'s old note on item 1.'] }
  await logReviews(root, 'localize', { id: 'species/a', lang: 'th' }, [first], first, { now: new Date('2026-11-02T00:00:00Z') })
  if (o.read !== undefined) {
    const score = typeof o.read === 'number' ? o.read : o.read === 'stale' ? 0.9 : 0.6
    const r = { score, notes, ...(o.read === 'once' ? {} : { reads: [score, score, score] }) }
    await logReviews(root, 'localize', { id: 'species/a', lang: 'th' }, [r], r, { now: new Date('2026-11-05T00:00:00Z'), recheck: true, textHash: o.read === 'stale' ? 'of-a-text-since-changed' : pageTextHash(parts, sections) })
  }
  return { root, page, file: () => readFile(join(dir, 'th.json'), 'utf8') }
}

/**
 * An editor that answers with `fix` for each part it is sent, and a reviewer that gives `asItIs` for the page's text and
 * `fixed` for a text with the fix in it, however often it is asked.
 */
function fake(fix: (id: string, old: string) => string, asItIs?: { score: number; notes: string[] }, fixed?: { score: number; notes: string[] }) {
  const calls: { prompt: string; review: boolean }[] = []
  const llm = (async (a: { prompt: string; schema: { required?: string[] } }) => {
    const isReview = !!a.schema.required?.includes('score')
    calls.push({ prompt: a.prompt, review: isReview })
    if (isReview) return (a.prompt.includes('ขนาดเล็ก') ? fixed : asItIs) ?? (() => { throw new Error('a read nobody expected') })()
    const parts = [...a.prompt.split('--- PARTS ---')[1]!.matchAll(/^### (\S+)\nEN:\n[\s\S]*?\nTH:\n([\s\S]*?)\nNOTES:/gm)]
    return { parts: parts.map(m => ({ id: m[1]!, text: fix(m[1]!, m[2]!) })) }
  }) as unknown as Llm
  return { llm, calls }
}
const now = () => new Date('2026-11-11T00:00:00Z')
const NOTE = 'Item 2: "แมลงขนาดใหญ่" says large insects; the English says small insects.'
const small = (_: string, old: string) => old.replace('ขนาดใหญ่', 'ขนาดเล็ก')
const AFTER = { score: 0.85, notes: ['Item 1: "x" is stiff.'] }

test('a page with no steady read of its text on file is read first, three times near the bar; only the part that read names goes to the editor, and the fixed page is kept when it reads higher', async () => {
  for (const onFile of [undefined, 'stale', 'once'] as const) {
    const { root, page } = await site(['A note on a text the page no longer has: item 3.'], { read: onFile })
    const { llm, calls } = fake(small, { score: 0.62, notes: [NOTE, 'The name is fine.'] }, AFTER)
    const r = await mendLocalized(root, llm, 'th', ['a'], { now })
    expect(r).toEqual({ read: ['a: 0.6 then 0.62, 2 notes'], kept: ['a: 1 of 3 parts, 2 notes: 0.62 to 0.85, open, 1 parts changed'], notBetter: [], skipped: [], failed: [], stopped: '' })
    expect(calls.map(c => c.review)).toEqual([true, true, true, false, true, true, true])
    // The first read is of the page as it is, every translatable part.
    expect(calls[0]!.prompt).toContain(page.sections['diet:seriouslyfish'])
    const sent = calls[3]!.prompt
    expect(sent).toContain('### diet:seriouslyfish')
    expect(sent).toContain(NOTE)
    for (const not of ['### habitat:seriouslyfish', '### behaviour:glaser', 'Not ours to translate', 'old note', 'no longer has']) expect(sent).not.toContain(not)
    // The reviewer then reads the whole page as it will be written.
    expect(calls[4]!.prompt).toContain('แมลงขนาดเล็ก')
    expect(calls[4]!.prompt).toContain(page.sections['habitat:seriouslyfish'])
    const t = await read(root, 'content/species/a/th.json')
    expect(t.sections).toEqual(FIXED)
    expect(t.quality).toEqual({ score: 0.85, indexable: true, bySource: { seriouslyfish: 0.85, glaser: 0.85 } })
    expect({ slug: t.slug, name: t.name, altNames: t.altNames }).toEqual({ slug: page.slug, name: page.name, altNames: [] })
    const [fix, fresh] = (await readReviews(root, 'localize'))['th/species/a']!
    expect(fix).toMatchObject({ attempt: 'rewrite', kept: true, score: 0.85, reads: [0.85, 0.85, 0.85], textHash: pageTextHash(PARTS, FIXED) })
    expect(fresh).toMatchObject({ attempt: 'recheck', kept: true, score: 0.62, reads: [0.62, 0.62, 0.62], textHash: HASH })
    expect((await read(root, 'engine-state/localize-th.json')).a).toMatchObject({ score: 0.85, notes: AFTER.notes, from: '2026-11-01', at: '2026-11-02' })
  }
})

test('a steady read of the page\'s text on file is the one used: no second read before the fix', async () => {
  const { root } = await site([NOTE], { read: 0.6 })
  const { llm, calls } = fake(small, undefined, AFTER)
  expect(await mendLocalized(root, llm, 'th', ['a'], { now })).toMatchObject({ read: [], kept: ['a: 1 of 3 parts, 1 notes: 0.6 to 0.85, open, 1 parts changed'] })
  expect(calls.map(c => c.review)).toEqual([false, true, true, true])
})

test('a fix that reads no higher than the page or than its unfixed text leaves both as they were, and that text is not tried again', async () => {
  // [the page's score, the read of it as it is, the read of the fix]
  for (const [was, unfixed, fixed] of [[0.6, 0.6, 0.6], [0.6, 0.7, 0.65], [0.7, 0.6, 0.7]] as const) {
    const { root, file } = await site([NOTE], { score: was, read: unfixed })
    const before = await file()
    const state = await readFile(join(root, 'engine-state/localize-th.json'), 'utf8')
    const tries: MendTry[] = []
    const r = await mendLocalized(root, fake(small, undefined, { score: fixed, notes: [] }).llm, 'th', ['a'], { now, onTry: t => void tries.push(t) })
    expect(r.notBetter).toEqual([`a: 1 of 3 parts, 1 notes: ${Math.max(was, unfixed)} then ${fixed}, left as it was`])
    expect(await file()).toBe(before)
    expect(await readFile(join(root, 'engine-state/localize-th.json'), 'utf8')).toBe(state)
    expect((await readReviews(root, 'localize'))['th/species/a']![0]).toMatchObject({ attempt: 'rewrite', kept: false, score: fixed, textHash: HASH })
    // What was tried is handed over, though the page keeps none of it.
    expect(tries).toEqual([{ id: 'a', was, read: unfixed, score: fixed, kept: false, parts: [{ id: 'diet:seriouslyfish', notes: [NOTE], before: SECTIONS['diet:seriouslyfish'], after: FIXED['diet:seriouslyfish'] }] }])
    const again = fake(small, AFTER)
    expect((await mendLocalized(root, again.llm, 'th', ['a'], { now })).skipped).toEqual(['a: a fix of this text was tried'])
    expect(again.calls).toEqual([])
  }
})

test('a page that passes its new read is left as it is, and --reads stops after the read', async () => {
  const { root, file } = await site([])
  const before = await file()
  const { llm, calls } = fake(small, { score: 0.8, notes: [] })
  expect(await mendLocalized(root, llm, 'th', ['a'], { now })).toMatchObject({ read: ['a: 0.6 then 0.8, 0 notes, passes as it is'], kept: [], skipped: [] })
  expect(calls.map(c => c.review)).toEqual([true, true, true])
  expect(await file()).toBe(before)
  expect((await readReviews(root, 'localize'))['th/species/a']![0]).toMatchObject({ attempt: 'recheck', kept: true, score: 0.8, reads: [0.8, 0.8, 0.8], textHash: HASH })
  const again = fake(small, AFTER)
  expect((await mendLocalized(root, again.llm, 'th', ['a'], { now })).skipped).toEqual(['a: its read passes, left as it is'])
  expect(again.calls).toEqual([])

  const other = await site([])
  const reads = fake(small, { score: 0.6, notes: [NOTE] })
  expect(await mendLocalized(other.root, reads.llm, 'th', ['a'], { now, readsOnly: true })).toMatchObject({ read: ['a: 0.6 then 0.6, 1 notes'], kept: [], notBetter: [], skipped: [] })
  expect(reads.calls.map(c => c.review)).toEqual([true, true, true])
})

test('a page with a note on a dose or harm is left for that check, and so are one whose notes name no part and one that lacks a part of the English', async () => {
  for (const [notes, why] of [
    [[NOTE, 'Item 3: the salt dose is given as 3 g per litre where the English says 1 g.'], 'a: a note on a dose, a medicine or harm'],
    [[NOTE, 'Item 1: "kills snails" is left out.'], 'a: a note on a dose, a medicine or harm'],
    [['The page reads stiffly throughout.'], 'a: its notes name no part'],
    [['Item 9: no such part.'], 'a: its notes name no part'],
    [[], 'a: its read left no notes'],
  ] as const) {
    const { root, file } = await site([...notes], { read: 0.6 })
    const before = await file()
    const { llm, calls } = fake(() => 'x')
    expect((await mendLocalized(root, llm, 'th', ['a'], { now })).skipped, why).toEqual([why])
    expect(calls, why).toEqual([])
    expect(await file()).toBe(before)
  }
  // The reviewer would read the missing part as left out and score the page down whatever is fixed: not read, not sent.
  const { root } = await site([NOTE], { lacks: true })
  const { llm, calls } = fake(small, AFTER, AFTER)
  expect((await mendLocalized(root, llm, 'th', ['a'], { now })).skipped).toEqual(['a: a part of the English is not on the page'])
  expect(calls).toEqual([])
})

test('a part the editor rewrote, emptied, returned as it was, or whose figures, paragraphs or sentences it changed is not taken; nothing changed means no second read, and that text is not sent again', async () => {
  for (const fix of [
    () => `<p>${'ข้อความใหม่ทั้งหมดที่ไม่เหมือนของเดิมเลยแม้แต่น้อย'.repeat(4)}</p>`,
    () => '',
    (_: string, old: string) => old,
    // A figure the old text didn't have.
    (_: string, old: string) => old.replace('ขนาดใหญ่', 'ขนาดเล็ก 2 ตัว'),
    // "Feed it twice a day" dropped with the fix: a Thai sentence is what lies between spaces.
    (_: string, old: string) => old.replace('ขนาดใหญ่', 'ขนาดเล็ก').replace(' ให้อาหารวันละสองครั้ง', ''),
    // A paragraph more.
    (_: string, old: string) => old.replace('ขนาดใหญ่', 'ขนาดเล็ก').replace('</p>', '</p><p>ย่อหน้าใหม่</p>'),
  ]) {
    const { root, file } = await site([NOTE], { read: 0.6 })
    const before = await file()
    const { llm, calls } = fake(fix)
    expect((await mendLocalized(root, llm, 'th', ['a'], { now })).skipped).toEqual(['a: 1 of 3 parts, 1 notes: the fix changed nothing'])
    expect(calls.filter(c => c.review)).toEqual([])
    expect(await file()).toBe(before)
    const again = fake(small, AFTER, AFTER)
    expect((await mendLocalized(root, again.llm, 'th', ['a'], { now })).skipped).toEqual(['a: a fix of this text was tried'])
    expect(again.calls).toEqual([])
  }
})

test('a part fixed by hand or with a dose in it is never sent to the editor', async () => {
  for (const diet of [{ fixed: true as const }, { en: '<p>It eats small insects. Add 2 ml of vitamins a week.</p>' }]) {
    const { root, file } = await site([NOTE], { read: 0.6, diet })
    const before = await file()
    const { llm, calls } = fake(small, AFTER, AFTER)
    expect((await mendLocalized(root, llm, 'th', ['a'], { now })).skipped).toEqual(['a: its notes name only parts fixed by hand or with a dose'])
    expect(calls).toEqual([])
    expect(await file()).toBe(before)
  }
})

test('a fix whose read after has a note on a dose or harm is not kept, however high it reads', async () => {
  const { root, file } = await site([NOTE], { read: 0.6 })
  const before = await file()
  const after = { score: 0.85, notes: ['Item 2: the line that large fish kill it is gone.'] }
  expect((await mendLocalized(root, fake(small, undefined, after).llm, 'th', ['a'], { now })).notBetter).toEqual(['a: 1 of 3 parts, 1 notes: 0.6 then 0.85, a note on a dose or harm, left as it was'])
  expect(await file()).toBe(before)
})

test('a fix whose read after notes something left out of a part it changed is not kept', async () => {
  const { root, file } = await site([NOTE], { read: 0.6 })
  const before = await file()
  const after = { score: 0.85, notes: ['Item 2: the line on feeding twice a day is missing.'] }
  expect((await mendLocalized(root, fake(small, undefined, after).llm, 'th', ['a'], { now })).notBetter).toEqual(['a: 1 of 3 parts, 1 notes: 0.6 then 0.85, a note on something left out of a part it changed, left as it was'])
  expect(await file()).toBe(before)
  // A note on something left out that names no part may be on the part the fix changed.
  const unnamed = await site([NOTE], { read: 0.6 })
  expect((await mendLocalized(unnamed.root, fake(small, undefined, { score: 0.85, notes: ['The Thai lacks the advice to feed twice a day.'] }).llm, 'th', ['a'], { now })).notBetter).toHaveLength(1)
  // A note on another part's omission is that part's: the fix is kept.
  const other = await site([NOTE], { read: 0.6 })
  expect((await mendLocalized(other.root, fake(small, undefined, { score: 0.85, notes: ['Item 3: "keep six or more" is missing.'] }).llm, 'th', ['a'], { now })).kept).toHaveLength(1)
})

test("only the parts the fix changed are new: a part it didn't touch stays as it is on the page, units and all", async () => {
  const habitat = `<p>อยู่ในลำธารน้ำไหลเอื่อย อุณหภูมิ 75 °F ${LONG}</p>`
  const { root } = await site([NOTE], { read: 0.6, habitat })
  expect((await mendLocalized(root, fake(small, undefined, AFTER).llm, 'th', ['a'], { now })).kept).toHaveLength(1)
  const t = await read(root, 'content/species/a/th.json')
  expect(t.sections['habitat:seriouslyfish']).toBe(habitat)
  expect(t.sections['diet:seriouslyfish']).toBe(FIXED['diet:seriouslyfish'])
})

test('the limit counts pages a model is called for: a page left alone takes no place', async () => {
  const { root } = await site(['Item 2: the salt dose is wrong.'], { read: 0.6 })
  await cp(join(root, 'content/species/a'), join(root, 'content/species/b'), { recursive: true })
  const r = { score: 0.6, notes: [NOTE], reads: [0.6, 0.6, 0.6] }
  await logReviews(root, 'localize', { id: 'species/b', lang: 'th' }, [r], r, { now: new Date('2026-11-05T00:00:00Z'), recheck: true, textHash: HASH })
  const out = await mendLocalized(root, fake(small, undefined, AFTER).llm, 'th', ['a', 'b'], { now, limit: 1 })
  expect(out).toMatchObject({ skipped: ['a: a note on a dose, a medicine or harm'], kept: ['b: 1 of 3 parts, 1 notes: 0.6 to 0.85, open, 1 parts changed'] })
})

test('a page at the bar and a dry run call no model', async () => {
  for (const [score, read, dry, skipped] of [[0.75, undefined, false, []], [0.6, undefined, true, ['a: needs a new read first (dry run)']], [0.6, 0.6, true, ['a: 1 of 3 parts, 1 notes (dry run)']]] as const) {
    const { root } = await site([NOTE], { score, read })
    const { llm, calls } = fake(() => 'x')
    expect((await mendLocalized(root, llm, 'th', ['a'], { now, dry })).skipped).toEqual(skipped)
    expect(calls).toEqual([])
  }
})

test('the words that keep a page out, and the reviewer\'s own "drops" that doesn\'t', () => {
  for (const n of ['a dose', 'overdosing', 'medicated food', 'treat with salt', 'in quarantine', '2 mg/l', '8.4 g/l', '5 ml', '3 drops', 'aquarium salts', 'bleach dip', 'nitrite', 'nitrates', 'ammonia', 'praziquantel', 'toxic', 'venomous', 'deadly', 'death', 'mortality', 'the fish died', 'dying plants', 'kills', 'harms', 'harmless', 'dangerous', 'unsafe']) expect(doseOrHarm(`Item 1: ${n}.`), n).toBe(true)
  for (const n of ['the Thai drops the point that it shoals', 'the temperature drops at night', 'saltwater', 'a diet of insects', 'treatise', 'ammonite']) expect(doseOrHarm(`Item 1: ${n}.`), n).toBe(false)
})

test('the parts a note names, and what counts as the same text mended', () => {
  expect(partsNamed('Item 4: x')).toEqual([4])
  expect(partsNamed('Items 6 and 13: x; see also item 2, 3')).toEqual([6, 13, 2, 3])
  expect(partsNamed('The name is fine.')).toEqual([])
  expect(partsNamed('Items 3–5: x')).toEqual([3, 4, 5])
  expect(partsNamed('Items 2, 3, and 4: x')).toEqual([2, 3, 4])
  expect(partsNamed('item 7 to 9: x')).toEqual([7, 8, 9])
  expect(quotesIn('Item 2: "แมลงขนาดใหญ่" says large; \'keep six\' and “ikan  kecil” too.')).toEqual(['แมลงขนาดใหญ่', 'keep six', 'ikan kecil'])
  expect(sameTextMended(`<p>${LONG} ขนาดใหญ่</p>`, `<p>${LONG} ขนาดเล็ก</p>`)).toBe(true)
  expect(sameTextMended(`<p>${LONG}</p>`, '<p>อื่น</p>')).toBe(false)
  expect(sameTextMended(`<p>${LONG}</p>`, `<p>${LONG}${LONG}</p>`)).toBe(false)
})

test('what a fix must keep, and what is a dose', () => {
  const keeps = (lang: 'id' | 'ms' | 'th', old: string, next: string, quotes: string[] = []) => keepsWhatItSays(lang, `<p>${old}</p>`, `<p>${next}</p>`, quotes)
  // A quoted phrase mended, the rest word for word; a quoted figure written another way, at the same value.
  expect(keeps('id', 'Suhu 24-28 °C. Jangan campur dengan ikan besar.', 'Suhu 24–28 °C. Jangan dicampur dengan ikan besar.', ['Jangan campur'])).toBe(true)
  expect(keeps('id', 'pH 6,5.', 'pH 6.5.', ['6,5'])).toBe(true)
  // A word outside the quotes changed, however small; a quoted phrase dropped rather than reworded.
  expect(keeps('id', 'Suhu 24-28 °C. Jangan campur dengan ikan besar.', 'Suhu 24-28 °C. Jangan dicampur dengan ikan besar.')).toBe(false)
  expect(keeps('id', 'Ikan ini damai. Jangan dicampur dengan udang kecil.', 'Ikan ini damai.', ['Jangan dicampur dengan udang kecil'])).toBe(false)
  expect(keeps('id', 'Ikan ini damai. Jangan dicampur dengan udang kecil.', 'Ikan ini damai. Jangan dicampurkan dengan udang kecil.', ['Jangan dicampur dengan udang kecil'])).toBe(true)
  // A caution, a clause or a sentence no note quotes, cut or reworded, in every language.
  expect(keeps('ms', 'Ia makan serangga. Jangan simpan dengan ikan besar.', 'Ia makan serangga kecil.', ['serangga'])).toBe(false)
  expect(keeps('th', 'กินแมลง ห้ามเลี้ยงกับปลาใหญ่', 'กินแมลงเล็ก', ['กินแมลง'])).toBe(false)
  expect(keeps('id', 'Ikan ini damai, tetapi jangan dicampur dengan udang kecil.', 'Ikan ini damai.', ['damai'])).toBe(false)
  expect(keeps('id', 'Ikan ini damai. Jangan dicampur dengan udang kecil. Makan cacing darah.', 'Ikan ini damai. Ikan ini makan. Makan cacing darah.', ['damai'])).toBe(false)
  expect(keeps('id', 'Ikan ini damai, tetapi jangan dicampur dengan udang kecil.', 'Ikan ini damai, tetapi jangan dengan udang kecil.', ['damai'])).toBe(false)
  expect(keeps('th', `กินแมลงขนาดใหญ่ ให้อาหารวันละสองครั้ง ${LONG}`, `กินแมลงขนาดเล็ก ${LONG}`, ['แมลงขนาดใหญ่'])).toBe(false)
  expect(keepsWhatItSays('th', '<p>กินแมลง</p><p>ห้ามเลี้ยงกับปลาใหญ่</p>', '<p>กินแมลง ห้ามเลี้ยงกับปลาใหญ่</p>', ['กินแมลง'])).toBe(false)
  // A figure, its unit or the word after it, or a range's order changed, quoted or not.
  expect(keeps('id', 'Suhu 24-28 °C.', 'Suhu 26-28 °C.', ['Suhu 24-28 °C'])).toBe(false)
  expect(keeps('id', 'Suhu 24 °C.', 'Suhu 24 °F.', ['Suhu 24 °C'])).toBe(false)
  expect(keeps('id', 'Panjang 5 cm.', 'Panjang 5 mm.')).toBe(false)
  expect(keeps('id', 'Akuarium 10 liter.', 'Akuarium 10 galon.')).toBe(false)
  expect(keeps('id', 'Suhu 24-28 °C.', 'Suhu 28-24 °C.')).toBe(false)
  expect(keeps('ms', 'Simpan 6 fish bersama.', 'Simpan 6 ekor bersama.', ['6 fish'])).toBe(false)
  expect(keeps('th', 'อุณหภูมิ 24 องศาเซลเซียส', 'อุณหภูมิ 24 องศาฟาเรนไฮต์', ['24 องศาเซลเซียส'])).toBe(false)
  expect(keeps('th', 'ตู้ 20 ลิตรขึ้นไป', 'ตู้ 20 มิลลิลิตรขึ้นไป', ['20 ลิตรขึ้นไป'])).toBe(false)
  // A number written as a word.
  expect(keeps('th', 'เลี้ยงอย่างน้อยหกตัว', 'เลี้ยงอย่างน้อยห้าตัว', ['อย่างน้อยหกตัว'])).toBe(false)
  expect(keeps('id', 'Pelihara setidaknya enam ekor.', 'Pelihara setidaknya lima ekor.', ['setidaknya enam ekor'])).toBe(false)
  // English left in the Thai, quoted and put into Thai: the figures and the rest stay.
  expect(keeps('th', 'ปลา shoaling fish ชอบอยู่เป็นฝูง 6 ตัว', 'ปลาที่อยู่รวมเป็นฝูง ชอบอยู่เป็นฝูง 6 ตัว', ['shoaling fish'])).toBe(true)
  for (const d of ['2 ml', '5mg/l', '1 g/l', '3 drops', '2 tetes', '1 teaspoon', '0.5 ppm', '5 grams', '10 millilitres', '2 sendok', '3 หยด', '1 กรัม', '1 sdt', '2 sudu', '3 titis']) expect(hasDose(`<p>Add ${d} a day.</p>`), d).toBe(true)
  for (const d of ['20 gallons', '6 fish', '24 °C', 'pH 6.5', '10 cm']) expect(hasDose(`<p>${d}.</p>`), d).toBe(false)
})
