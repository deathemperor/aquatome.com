import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { doseOrHarm, recheckLocalized, type Cleared } from '../src/localize-recheck'
import { sourceTextHash } from '../src/recheck-score'
import { logReviews, readReviews } from '../src/review-log'

const PARTS = [
  { id: 'diet:seriouslyfish', en: '<p>In the aquarium it accepts dried foods of a suitable size but should not be fed these exclusively.</p>' },
  { id: 'behaviour:seriouslyfish', en: '<p>A peaceful shoaling fish: keep six or more.</p>' },
]
const TH = { 'diet:seriouslyfish': '<p>ในตู้ปลาจะยอมรับอาหารแห้งที่มีขนาดเหมาะสม แต่ไม่ควรให้อาหารแห้งเพียงอย่างเดียว</p>', 'behaviour:seriouslyfish': '<p>ปลาฝูงที่รักสงบ ควรเลี้ยงหกตัวขึ้นไป</p>' }
const NOW = new Date('2026-11-18T12:00:00Z')
const now = () => NOW
const hashOf = (sections: Record<string, string>) => sourceTextHash(PARTS.map(p => ({ id: p.id, en: p.en, vi: sections[p.id]! })))

/**
 * Thai fish pages out of search for their score: two translatable parts and a part not ours to translate, the page's
 * score and its translator's record (`at`: when it last wrote the page; `notes`: its read's notes).
 */
async function site(pages: Record<string, { score?: number; held?: true; reason?: 'thin' | 'score'; sections?: Record<string, string>; at?: string; notes?: string[] }> = { a: {} }) {
  const root = await mkdtemp(join(tmpdir(), 'recheck-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(join(root, 'content'), { recursive: true })
  await writeFile(join(root, 'content/sources.json'), JSON.stringify({ seriouslyfish: { permission: { scope: ['text', 'translation'] } }, planetcatfish: { permission: { scope: ['text'] } } }))
  const state: Record<string, unknown> = {}
  for (const [id, o] of Object.entries(pages)) {
    const dir = join(root, 'content/species', id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'entity.json'), JSON.stringify({ id, scientificName: 'Aus bus', updatedAt: '2026-11-01', sections: [
      { key: 'notes', source: 'planetcatfish', html: '<p>Not ours to translate.</p>' },
      ...PARTS.map(p => ({ key: p.id.split(':')[0], source: 'seriouslyfish', html: p.en })),
    ] }))
    const score = o.score ?? 0.6
    await writeFile(join(dir, 'th.json'), `${JSON.stringify({ slug: id, name: 'ปลาทดสอบ', altNames: [], sections: o.sections ?? TH, quality: { score, indexable: score >= 0.75, bySource: { seriouslyfish: score }, ...(o.reason ? { reason: o.reason } : {}) }, ...(o.held ? { held: true } : {}) }, null, 2)}\n`)
    state[id] = { at: o.at ?? '2026-11-08', from: '2026-11-01', name: 'ปลาทดสอบ', confidence: 'high', score, notes: o.notes ?? ['Item 2: "ปลาฝูง" is stiff.'] }
  }
  await writeFile(join(root, 'engine-state/localize-th.json'), `${JSON.stringify(state, null, 2)}\n`)
  const file = (id = 'a') => readFile(join(root, 'content/species', id, 'th.json'), 'utf8')
  return { root, file }
}

/** Sonnet and Opus as readers: each answers its own read, however often it is asked. Every call is kept, with its model. */
function fake(reads: { sonnet: { score: number; notes: string[] }; opus?: { score: number; notes: string[] } }) {
  const calls: { model?: string; prompt: string }[] = []
  const llm = (async (a: { prompt: string; model?: string }) => {
    calls.push({ model: a.model, prompt: a.prompt })
    const r = a.model === 'opus' ? reads.opus : a.model === 'sonnet' ? reads.sonnet : undefined
    if (!r) throw new Error(`a read nobody expected (${a.model})`)
    return r
  }) as unknown as Llm
  return { llm, calls }
}
const PASS = { score: 0.9, notes: ['Item 2: "ปลาฝูง" could be "ปลาที่อยู่เป็นฝูง".'] }
const OPUS = { score: 0.85, notes: [] }

test('a page out of search comes back when Sonnet, then Opus, pass its text as it is: at the lower score, both reads logged with the text\'s hash', async () => {
  const { root, file } = await site()
  const { llm, calls } = fake({ sonnet: PASS, opus: OPUS })
  const r = await recheckLocalized(root, llm, 'th', ['a'], { now })
  expect(r).toEqual({ back: ['a: 0.6, Sonnet 0.9, Opus 0.85: back at 0.85'], failed: [], held: [], skipped: [], stopped: '' })
  // The two readers by name, whatever ENGINE_MODEL says, Sonnet's three reads first: each near the bar is a steady read.
  expect(calls.map(c => c.model)).toEqual(['sonnet', 'sonnet', 'sonnet', 'opus', 'opus', 'opus'])
  expect(calls[0]!.prompt).toContain(TH['diet:seriouslyfish'])
  expect(calls[0]!.prompt).not.toContain('Not ours to translate')
  const t = JSON.parse(await file())
  expect(t.quality).toEqual({ score: 0.85, indexable: true, bySource: { seriouslyfish: 0.85 } })
  expect(t.sections).toEqual(TH)
  expect(JSON.parse(await readFile(join(root, 'engine-state/localize-th.json'), 'utf8')).a.score).toBe(0.85)
  const logged = (await readReviews(root, 'localize'))['th/species/a']!
  expect(logged.map(x => [x.model, x.attempt, x.score, x.textHash])).toEqual([['opus', 'recheck', 0.85, hashOf(TH)], ['sonnet', 'recheck', 0.9, hashOf(TH)]])
})

test('a page Sonnet fails is not read by Opus: it keeps its place and score, its text is not read again, and a changed text is', async () => {
  const { root, file } = await site()
  const before = await file()
  const { llm, calls } = fake({ sonnet: { score: 0.6, notes: ['Item 1: wrong.'] } })
  expect(await recheckLocalized(root, llm, 'th', ['a'], { now })).toMatchObject({ back: [], failed: ['a: 0.6, Sonnet 0.6'] })
  expect(calls.map(c => c.model)).toEqual(['sonnet', 'sonnet', 'sonnet'])
  expect(await file()).toBe(before)
  // One pass after one fail changes nothing: the same text is never read again.
  const again = fake({ sonnet: PASS, opus: OPUS })
  expect(await recheckLocalized(root, again.llm, 'th', ['a'], { now })).toEqual({ back: [], failed: [], held: [], skipped: [], stopped: '' })
  expect(again.calls).toEqual([])
  // Its text changed (the rewrite): read again.
  const page = JSON.parse(before)
  await writeFile(join(root, 'content/species/a/th.json'), JSON.stringify({ ...page, sections: { ...page.sections, 'behaviour:seriouslyfish': '<p>ปลาที่อยู่เป็นฝูง ควรเลี้ยงหกตัวขึ้นไป</p>' } }))
  expect((await recheckLocalized(root, again.llm, 'th', ['a'], { now })).back).toHaveLength(1)
})

test('a page with a caution cut that Sonnet passes and Opus fails stays out: the pearl danio planted on 16 Nov', async () => {
  // "But should not be fed these exclusively" cut from the Thai: Sonnet read 0.9 and named only the double space the cut
  // left; Opus named the caution and read 0.6 (the chief of staff's gate, 16 Nov 2026).
  const cut = { ...TH, 'diet:seriouslyfish': '<p>ในตู้ปลาจะยอมรับอาหารแห้งที่มีขนาดเหมาะสม </p>' }
  const { root, file } = await site({ a: { sections: cut } })
  const before = await file()
  const { llm } = fake({ sonnet: { score: 0.9, notes: ['#1: stray double space after "ขนาดเหมาะสม".'] }, opus: { score: 0.6, notes: ['#1: The care advice "but should not be fed these exclusively" is missing.'] } })
  expect(await recheckLocalized(root, llm, 'th', ['a'], { now })).toMatchObject({ back: [], failed: ['a: 0.6, Sonnet 0.9, Opus 0.6'] })
  expect(await file()).toBe(before)
  expect(JSON.parse(await readFile(join(root, 'engine-state/recheck-th.json'), 'utf8')).a).toMatchObject({ hash: hashOf(cut), sonnet: 0.9, opus: 0.6, back: false })
})

test('a note on a dose or harm in any read of the text keeps the page out; one on a text never kept does not count; one cleared by page, word for word, does not', async () => {
  const HARM = 'Item 1: the line that it is toxic to shrimp is kept.'
  // In a fresh read.
  const fresh = await site()
  const was = await fresh.file()
  expect((await recheckLocalized(fresh.root, fake({ sonnet: PASS, opus: { score: 0.9, notes: [HARM] } }).llm, 'th', ['a'], { now })).held).toEqual([`a: 0.6, Sonnet 0.9, Opus 0.9: a note on a dose or harm: ${JSON.stringify(HARM)}`])
  expect(await fresh.file()).toBe(was)
  // In the translator's read, and in a kept read since it wrote the page: held. On a fix never kept: no.
  const own = await site({ a: { notes: [HARM] } })
  expect((await recheckLocalized(own.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now })).held).toHaveLength(1)
  const logged = await site()
  const later = { score: 0.6, notes: [HARM] }
  await logReviews(logged.root, 'localize', { id: 'species/a', lang: 'th' }, [later], later, { now: new Date('2026-11-10T00:00:00Z'), recheck: true })
  expect((await recheckLocalized(logged.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now })).held).toHaveLength(1)
  const other = await site()
  await logReviews(other.root, 'localize', { id: 'species/a', lang: 'th' }, [later], undefined, { now: new Date('2026-11-10T00:00:00Z'), rewrite: true })
  expect((await recheckLocalized(other.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now })).back).toHaveLength(1)
  // Cleared for another page, or in other words: still held. Cleared for this page word for word: back on the reads it
  // had, with no new read.
  const near: Cleared = { page: 'th/species/b', note: HARM, by: 'the chief of staff', at: '2026-11-16', why: 'test' }
  expect((await recheckLocalized(own.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now, cleared: [near, { ...near, page: 'th/species/a', note: HARM.toLowerCase() }] })).back).toEqual([])
  const none = fake({ sonnet: PASS, opus: OPUS })
  expect((await recheckLocalized(own.root, none.llm, 'th', ['a'], { now, cleared: [{ ...near, page: 'th/species/a' }] })).back).toEqual(['a: 0.6, Sonnet 0.9, Opus 0.85: back at 0.85, its notes on a dose or harm cleared'])
  expect(none.calls).toEqual([])
  expect(JSON.parse(await own.file()).quality).toEqual({ score: 0.85, indexable: true, bySource: { seriouslyfish: 0.85 } })
})

test("a note on a dose or harm logged on the text, or on a kept read of a page with no translator's record, keeps it out; a held page Opus failed doesn't come back when its note is cleared; one with a new note since stays out", async () => {
  const HARM = 'Item 1: the line that it is toxic to shrimp is kept.'
  const NEW = 'Item 2: a deadly mistake is left in.'
  const read = { score: 0.9, notes: [HARM] }
  // Logged on this text, by its hash.
  const hashed = await site()
  await logReviews(hashed.root, 'localize', { id: 'species/a', lang: 'th' }, [read], read, { now: new Date('2026-11-10T00:00:00Z'), recheck: true, textHash: hashOf(TH) })
  expect((await recheckLocalized(hashed.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now })).held).toHaveLength(1)
  // A page with no record of the translator's: every kept read counts.
  const orphan = await site()
  await writeFile(join(orphan.root, 'engine-state/localize-th.json'), '{}')
  await logReviews(orphan.root, 'localize', { id: 'species/a', lang: 'th' }, [read], read, { now: new Date('2026-11-01T00:00:00Z') })
  expect((await recheckLocalized(orphan.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now })).held).toHaveLength(1)
  // Opus failed it, with a note held: cleared since, it still doesn't come back.
  const failed = await site({ a: { notes: [HARM] } })
  expect((await recheckLocalized(failed.root, fake({ sonnet: PASS, opus: { score: 0.6, notes: [] } }).llm, 'th', ['a'], { now })).failed).toHaveLength(1)
  const clear: Cleared[] = [{ page: 'th/species/a', note: HARM, by: 'the chief of staff', at: '2026-11-16', why: 'test' }]
  expect(await recheckLocalized(failed.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now, cleared: clear })).toMatchObject({ back: [], failed: [] })
  // Held, then a new note on the same text logged since: clearing the first leaves it out on the second.
  const later = await site({ a: { notes: [HARM] } })
  expect((await recheckLocalized(later.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now })).held).toHaveLength(1)
  const next = { score: 0.9, notes: [NEW] }
  await logReviews(later.root, 'localize', { id: 'species/a', lang: 'th' }, [next], next, { now: new Date('2026-11-19T00:00:00Z'), recheck: true, textHash: hashOf(TH) })
  const none = fake({ sonnet: PASS, opus: OPUS })
  expect((await recheckLocalized(later.root, none.llm, 'th', ['a'], { now: () => new Date('2026-11-20T00:00:00Z'), cleared: clear })).held).toEqual([`a: 0.6, its notes cleared, but a note on a dose or harm since: ${JSON.stringify(NEW)}`])
  expect(none.calls).toEqual([])
  expect(JSON.parse(await later.file()).quality.indexable).toBe(false)
})

test("a page whose text changes while it is read is not written; a model's error stops the step and leaves the page", async () => {
  const { root, file } = await site()
  const changed = { ...TH, 'behaviour:seriouslyfish': '<p>ปลาที่อยู่เป็นฝูง ควรเลี้ยงหกตัวขึ้นไป</p>' }
  const page = JSON.parse(await file())
  const base = fake({ sonnet: PASS, opus: OPUS })
  // A hand run writes the page while Opus reads it.
  const racing = (async (a: { prompt: string; model?: string }) => {
    if (a.model === 'opus') await writeFile(join(root, 'content/species/a/th.json'), `${JSON.stringify({ ...page, sections: changed }, null, 2)}\n`)
    return base.llm(a as never)
  }) as unknown as Llm
  expect((await recheckLocalized(root, racing, 'th', ['a'], { now })).skipped).toEqual(['a: 0.6, Sonnet 0.9, Opus 0.85: its text changed while it was read'])
  expect(JSON.parse(await file()).quality.score).toBe(0.6)
  const broken = await site({ a: {}, b: {} })
  const was = await broken.file('b')
  const failing = (async () => { throw new LlmError('the sign-in is out of its week') }) as unknown as Llm
  expect(await recheckLocalized(broken.root, failing, 'th', ['a', 'b'], { now })).toMatchObject({ back: [], stopped: 'a: the sign-in is out of its week' })
  expect(await broken.file('b')).toBe(was)
})

test('the translator\'s pages of the last day go first; the limit counts pages read; held, passing and part-less pages are left alone; a dry run and the time stop read none', async () => {
  const { root } = await site({ old: {}, held: { held: true }, open: { score: 0.75 }, lacks: { sections: { 'diet:seriouslyfish': TH['diet:seriouslyfish'] } }, fresh: { at: '2026-11-18' } })
  const ids = ['held', 'open', 'lacks', 'old', 'fresh']
  const dry = fake({ sonnet: PASS, opus: OPUS })
  expect((await recheckLocalized(root, dry.llm, 'th', ids, { now, dry: true })).skipped).toEqual(['fresh: 0.6, would be read (dry run)', 'lacks: a part of the English is not on the page', 'old: 0.6, would be read (dry run)'])
  expect(dry.calls).toEqual([])
  expect((await recheckLocalized(root, dry.llm, 'th', ids, { now, maxMinutes: 0 })).skipped).toEqual(['stopped after 0 min'])
  expect(dry.calls).toEqual([])
  const one = fake({ sonnet: PASS, opus: OPUS })
  expect(await recheckLocalized(root, one.llm, 'th', ids, { now, limit: 1 })).toMatchObject({ back: ['fresh: 0.6, Sonnet 0.9, Opus 0.85: back at 0.85'], skipped: [] })
})

test('a page whose score carries a reason other than its score is left as it is, and says so: the step never erases one; a reason "score" is its own, read as usual and gone when the page comes back', async () => {
  const thin = await site({ a: { reason: 'thin' } })
  const before = await thin.file()
  const skip = fake({ sonnet: PASS, opus: OPUS })
  expect(await recheckLocalized(thin.root, skip.llm, 'th', ['a'], { now })).toMatchObject({ back: [], skipped: ['a: its score carries a reason ("thin"), left as it is'] })
  expect(skip.calls).toEqual([])
  expect(await thin.file()).toBe(before)
  // "score": as the Vietnamese and Malay pages carry it.
  const score = await site({ a: { reason: 'score' } })
  expect((await recheckLocalized(score.root, fake({ sonnet: PASS, opus: OPUS }).llm, 'th', ['a'], { now })).back).toEqual(['a: 0.6, Sonnet 0.9, Opus 0.85: back at 0.85'])
  expect(JSON.parse(await score.file()).quality).toEqual({ score: 0.85, indexable: true, bySource: { seriouslyfish: 0.85 } })
  // One given while the models read it: not written over.
  const { root, file } = await site()
  const page = JSON.parse(await file())
  const base = fake({ sonnet: PASS, opus: OPUS })
  const meanwhile = (async (a: { prompt: string; model?: string }) => {
    if (a.model === 'opus') await writeFile(join(root, 'content/species/a/th.json'), JSON.stringify({ ...page, quality: { ...page.quality, reason: 'thin' } }))
    return base.llm(a as never)
  }) as unknown as Llm
  expect((await recheckLocalized(root, meanwhile, 'th', ['a'], { now })).back).toEqual([])
  expect(JSON.parse(await file()).quality).toMatchObject({ score: 0.6, reason: 'thin' })
})

test('only Indonesian and Thai pages, the kinds the rule was measured on', async () => {
  const { root } = await site()
  await expect(recheckLocalized(root, fake({ sonnet: PASS }).llm, 'ms', ['a'], { now })).rejects.toThrow(/in its scope/)
})

test('the notes that keep a page out: the Writing Lead\'s words', () => {
  for (const n of ['a dose', 'medicated food', 'toxic', 'harmless', 'nitrate', 'deadly', 'kills']) expect(doseOrHarm(`Item 1: ${n}.`), n).toBe(true)
  for (const n of ['the Thai drops the point', 'saltwater', 'a diet of insects']) expect(doseOrHarm(`Item 1: ${n}.`), n).toBe(false)
})
