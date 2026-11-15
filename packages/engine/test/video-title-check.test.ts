import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkOutcome, checkUsage, checkVideoTitles, forgetVerdicts, recordVerdicts } from '../src/video-title-check'

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'video-title-check-'))
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ scientificName: 'Aus bus', videos: [{ youtubeId: 'en-a', title: 'RARE Predatory Fish Forum Aus', durationSec: 60, lang: 'en' }, { youtubeId: 'en-b', title: 'Aus tank tour', durationSec: 60, lang: 'en' }, { youtubeId: 'vi-a', title: 'Nuôi cá A', durationSec: 60, lang: 'vi' }] }))
  await writeFile(join(root, 'content/species/a/vi.json'), JSON.stringify({ name: 'Cá A' }))
  await mkdir(join(root, 'content/video-titles'), { recursive: true })
  return root
}

test('each written title is read against its own title and the page, on Opus; a refusal is recorded with its reason, a pass with the words it passed (the chief of staff, 16 Nov)', async () => {
  const root = await store()
  const seen: string[] = [], models: (string | undefined)[] = []
  const llm: Llm = async <T>({ prompt, model }: { prompt: string; model?: string }) => {
    seen.push(prompt.split('\n\n').at(-1)!.trim())
    models.push(model)
    return { checks: [{ n: 1, ok: false, kind: 'added', why: '"săn mồi" is the forum\'s name' }, { n: 2, ok: true }] } as T
  }
  const titles = { 'en-a': 'Cá A săn mồi hiếm', 'en-b': 'Tham quan bể cá A' }
  const r = await checkVideoTitles(root, llm, 'vi', titles)
  expect(seen[0]).toBe('1. [Cá A, Aus bus] RARE Predatory Fish Forum Aus\n   Vietnamese: Cá A săn mồi hiếm\n2. [Cá A, Aus bus] Aus tank tour\n   Vietnamese: Tham quan bể cá A')
  expect(models).toEqual(['opus'])
  expect(r.checks).toEqual({ 'en-a': { ok: false, kind: 'added', why: '"săn mồi" is the forum\'s name' }, 'en-b': { ok: true } })
  await recordVerdicts(root, 'vi', r.checks, titles)
  const file = async (name: string) => JSON.parse(await readFile(join(root, 'content/video-titles', name), 'utf8'))
  expect(await file('vi.refused.json')).toEqual({ 'en-a': 'added: "săn mồi" is the forum\'s name' })
  expect(await file('vi.passed.json')).toEqual({ 'en-b': 'Tham quan bể cá A' })
})

test('a pass never clears a refusal: a second read of the same words is no new word on them; a refusal takes a pass off, and new words from the writer take both off (the reviewers of the check, 16 Nov)', async () => {
  const root = await store()
  const titles = { 'en-a': 'Cá A săn mồi hiếm', 'en-b': 'Tham quan bể cá A' }
  await recordVerdicts(root, 'vi', { 'en-a': { ok: false, kind: 'added', why: 'x' }, 'en-b': { ok: true } }, titles)
  await recordVerdicts(root, 'vi', { 'en-a': { ok: true }, 'en-b': { ok: false, kind: 'dropped', why: 'y' } }, titles)
  const file = async (name: string) => JSON.parse(await readFile(join(root, 'content/video-titles', name), 'utf8'))
  expect([await file('vi.refused.json'), await file('vi.passed.json')]).toEqual([{ 'en-a': 'added: x', 'en-b': 'dropped: y' }, {}])
  await forgetVerdicts(root, 'vi', ['en-a'])
  expect(await file('vi.refused.json')).toEqual({ 'en-b': 'dropped: y' })
  await recordVerdicts(root, 'vi', { 'en-a': { ok: true } }, titles)
  expect(await file('vi.passed.json')).toEqual({ 'en-a': 'Cá A săn mồi hiếm' })
})

test('a video on the pages of two fish is not read, so no pass can undo the writer\'s refusal; a row the model leaves out is counted unread, and each batch is recorded as it comes (the reviewers of the check, 16 Nov)', async () => {
  const root = await store()
  await mkdir(join(root, 'content/species/b'), { recursive: true })
  await writeFile(join(root, 'content/species/b/entity.json'), JSON.stringify({ scientificName: 'Aus cus', videos: [{ youtubeId: 'en-b', title: 'Aus tank tour', durationSec: 60, lang: 'en' }] }))
  await writeFile(join(root, 'content/species/b/vi.json'), JSON.stringify({ name: 'Cá B' }))
  const ids = Array.from({ length: 45 }, (_, i) => `x${i}`)
  const e = JSON.parse(await readFile(join(root, 'content/species/a/entity.json'), 'utf8'))
  e.videos.push(...ids.map(youtubeId => ({ youtubeId, title: `Aus ${youtubeId}`, durationSec: 60, lang: 'en' })))
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify(e))
  const titles = { 'en-a': 'Cá A săn mồi hiếm', 'en-b': 'Tham quan bể cá A', ...Object.fromEntries(ids.map(id => [id, `Cá A ${id}`])) }
  const sent: string[][] = [], recorded: string[][] = []
  // Passes every row but the last of each batch, which it leaves out; the second call fails.
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
    const rows = prompt.split('\n').filter(l => /^\d+\. \[/.test(l))
    sent.push(rows)
    if (sent.length === 2) throw new Error('the reply was cut off')
    return { checks: rows.slice(0, -1).map((_, j) => ({ n: j + 1, ok: true })) } as T
  }
  const r = await checkVideoTitles(root, llm, 'vi', titles, { record: async c => { recorded.push(Object.keys(c)) } })
  expect(r.shared).toEqual(['en-b'])
  expect(sent.flat().some(l => l.includes('Aus tank tour'))).toBe(false)
  expect([r.given, Object.keys(r.checks).length, r.unanswered.length, r.failed.length]).toEqual([46, 39, 1, 1])
  expect(recorded).toEqual([Object.keys(r.checks)])
})

test("over one in ten refused at a mark of 200 titles stops the language there, its checked titles kept as checked; one in ten exactly goes on (the chief of staff, 16 Nov 02:12)", async () => {
  const root = await mkdtemp(join(tmpdir(), 'video-title-check-'))
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  const ids = Array.from({ length: 500 }, (_, i) => `v${String(i).padStart(3, '0')}`)
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ scientificName: 'Aus bus', videos: ids.map(youtubeId => ({ youtubeId, title: `Aus ${youtubeId}`, durationSec: 60, lang: 'en' })) }))
  await writeFile(join(root, 'content/species/a/vi.json'), JSON.stringify({ name: 'Cá A' }))
  const titles = Object.fromEntries(ids.map(id => [id, `Cá A ${id}`]))
  // Refuses the titles it is shown whose place in the order `bad` picks, passes the rest.
  const model = (bad: (i: number) => boolean) => {
    let shown = 0, calls = 0
    const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
      calls++
      const n = prompt.split('\n').filter(l => /^\d+\. \[/.test(l)).length
      return { checks: Array.from({ length: n }, (_, j) => (bad(shown++) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true })) } as T
    }
    return { llm, calls: () => calls }
  }
  const over = model(i => i < 21)
  const r = await checkVideoTitles(root, over.llm, 'vi', titles)
  expect(Object.keys(r.checks)).toHaveLength(200)
  expect(over.calls()).toBe(5)
  expect(r.stopped).toBe('over one in ten refused at 200 titles: 21 of 200')
  const atTen = model(i => i < 20 || (i >= 200 && i < 220) || i >= 490)
  const s = await checkVideoTitles(root, atTen.llm, 'vi', titles)
  expect([Object.keys(s.checks).length, s.stopped]).toEqual([500, ''])
  // The mark is counted on everything checked so far: 20 of the first 200 goes on, and 21 more in the next 200 stops at 400.
  const later = model(i => i < 20 || (i >= 200 && i < 221))
  const t = await checkVideoTitles(root, later.llm, 'vi', titles)
  expect([Object.keys(t.checks).length, t.stopped]).toEqual([200 + 200, 'over one in ten refused at 400 titles: 41 of 400'])
})

/** One fish's page with `n` foreign videos, v000 on, each with a Vietnamese title written. */
async function many(n: number) {
  const root = await mkdtemp(join(tmpdir(), 'video-title-check-'))
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  const ids = Array.from({ length: n }, (_, i) => `v${String(i).padStart(3, '0')}`)
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ scientificName: 'Aus bus', videos: ids.map(youtubeId => ({ youtubeId, title: `Aus ${youtubeId}`, durationSec: 60, lang: 'en' })) }))
  await writeFile(join(root, 'content/species/a/vi.json'), JSON.stringify({ name: 'Cá A' }))
  await mkdir(join(root, 'content/video-titles'), { recursive: true })
  return { root, ids, titles: Object.fromEntries(ids.map(id => [id, `Cá A ${id}`])) }
}
const rowsOf = (prompt: string) => prompt.split('\n').filter(l => /^\d+\. \[/.test(l))

test('each batch is recorded as soon as it is read, before the next is sent: of three, the second failing, the first and third are recorded (the reviewers of the check, 16 Nov)', async () => {
  const { root, ids, titles } = await many(120)
  const events: string[] = [], recorded: string[][] = []
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
    events.push('read')
    if (events.filter(e => e === 'read').length === 2) throw new Error('the reply was cut off')
    return { checks: rowsOf(prompt).map((_, j) => ({ n: j + 1, ok: true })) } as T
  }
  const r = await checkVideoTitles(root, llm, 'vi', titles, { record: async c => { events.push('record'); recorded.push(Object.keys(c)) } })
  expect(events).toEqual(['read', 'record', 'read', 'read', 'record'])
  expect(recorded).toEqual([ids.slice(0, 40), ids.slice(80)])
  expect(r.failed).toHaveLength(1)
})

test('a row the model answers twice is refused if either answer refuses it (unsure means not shown; the reviewers of the check, 16 Nov)', async () => {
  const root = await store()
  const llm: Llm = async <T>() => ({ checks: [{ n: 1, ok: true }, { n: 1, ok: false, kind: 'added', why: 'x' }, { n: 2, ok: false, kind: 'dropped', why: 'y' }, { n: 2, ok: true }] }) as T
  const r = await checkVideoTitles(root, llm, 'vi', { 'en-a': 'Cá A săn mồi hiếm', 'en-b': 'Tham quan bể cá A' })
  expect(r.checks).toEqual({ 'en-a': { ok: false, kind: 'added', why: 'x' }, 'en-b': { ok: false, kind: 'dropped', why: 'y' } })
})

test('with the verdicts on file, a title refused or passed in its present words is not read again and counts toward the stop line, so a run after a stop stops before reading anything; one passed in other words is read (the reviewers of the check, 16 Nov)', async () => {
  const { root, ids, titles } = await many(500)
  let calls = 0
  const llm = (bad: (id: string) => boolean): Llm => async <T>({ prompt }: { prompt: string }) => {
    calls++
    return { checks: rowsOf(prompt).map((l, j) => (bad(/Aus (v\d+)/.exec(l)![1]!) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true })) } as T
  }
  const first = await checkVideoTitles(root, llm(id => id < 'v021'), 'vi', titles, { record: c => recordVerdicts(root, 'vi', c, titles) })
  expect(first.stopped).toBe('over one in ten refused at 200 titles: 21 of 200')
  const file = async (name: string) => JSON.parse(await readFile(join(root, 'content/video-titles', name), 'utf8')) as Record<string, string>
  const verdicts = async () => ({ refused: await file('vi.refused.json'), passed: await file('vi.passed.json') })
  calls = 0
  const again = await checkVideoTitles(root, llm(() => false), 'vi', titles, { verdicts: await verdicts() })
  expect([calls, again.given, again.prior, again.stopped]).toEqual([0, 300, { checked: 200, refused: 21 }, 'over one in ten refused at 200 titles: 21 of 200'])
  // The writer gives six refused titles and a passed one new words, taking their verdicts off. Now under the line, the
  // next run reads only what has no verdict on its present words: the 300 never read and those seven. v100's pass was on
  // its old words, so even left on file it wouldn't count.
  const rewritten = ['v015', 'v016', 'v017', 'v018', 'v019', 'v020', 'v100']
  await forgetVerdicts(root, 'vi', rewritten.slice(0, 6))
  calls = 0
  const on = await checkVideoTitles(root, llm(() => false), 'vi', { ...titles, ...Object.fromEntries(rewritten.map(id => [id, `Cá A ${id}, lời mới`])) }, { verdicts: await verdicts() })
  expect([on.given, on.prior, on.stopped, calls]).toEqual([307, { checked: 193, refused: 15 }, '', 8])
})

test('a run cut short past a mark is judged again on all it read: 30 refused of 240 stops the next run at once, though the first 200 held 18 (the safe way; the reviewers of the check, 16 Nov)', async () => {
  const { root, ids, titles } = await many(500)
  const refused = Object.fromEntries([...ids.slice(0, 18), ...ids.slice(200, 212)].map(id => [id, 'dropped: x']))
  const passed = Object.fromEntries(ids.slice(0, 240).filter(id => !(id in refused)).map(id => [id, titles[id]!]))
  let calls = 0
  const llm: Llm = async <T>() => { calls++; return { checks: [] } as T }
  const r = await checkVideoTitles(root, llm, 'vi', titles, { verdicts: { refused, passed } })
  expect([calls, r.prior, r.stopped]).toEqual([0, { checked: 240, refused: 30 }, 'over one in ten refused at 200 titles: 30 of 240'])
})

test('--only never takes a language past its stop: the titles read before are counted whatever it picks (the reviewers of the check, 16 Nov)', async () => {
  const { root, ids, titles } = await many(400)
  const refused = Object.fromEntries(ids.slice(0, 30).map(id => [id, 'dropped: x']))
  const passed = Object.fromEntries(ids.slice(30, 200).map(id => [id, titles[id]!]))
  let calls = 0
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => { calls++; return { checks: rowsOf(prompt).map((_, j) => ({ n: j + 1, ok: true })) } as T }
  const r = await checkVideoTitles(root, llm, 'vi', titles, { only: ids.slice(200), verdicts: { refused, passed } })
  expect([calls, r.given, r.prior, r.stopped]).toEqual([0, 200, { checked: 200, refused: 30 }, 'over one in ten refused at 200 titles: 30 of 200'])
})

test('a mark is judged on the titles up to it, though the batch that reaches it runs past: 19 of 193 read before and 2 of the next 7 stop at 200 (the reviewers of the check, 16 Nov)', async () => {
  const { root, ids, titles } = await many(600)
  const refused = Object.fromEntries(ids.slice(0, 19).map(id => [id, 'dropped: x']))
  const passed = Object.fromEntries(ids.slice(19, 193).map(id => [id, titles[id]!]))
  let calls = 0
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
    calls++
    return { checks: rowsOf(prompt).map((l, j) => (['v193', 'v194'].includes(/Aus (v\d+)/.exec(l)![1]!) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true })) } as T
  }
  const r = await checkVideoTitles(root, llm, 'vi', titles, { verdicts: { refused, passed } })
  expect([calls, Object.keys(r.checks).length, r.stopped]).toEqual([1, 40, 'over one in ten refused at 200 titles: 21 of 200'])
})

test("the run's end: unread titles, or more than one in ten refused over all read in these words, even under the first mark of 200, end it with an error (the chief of staff, 16 Nov; the reviewers of the check)", () => {
  const run = (checked: number, refused: number, o: { given?: number; prior?: { checked: number; refused: number }; stopped?: string } = {}) => ({
    checks: Object.fromEntries(Array.from({ length: checked }, (_, i) => [`v${i}`, i < refused ? { ok: false as const, kind: 'dropped' as const, why: 'x' } : { ok: true as const }])),
    failed: [], stopped: o.stopped ?? '', given: o.given ?? checked, shared: [], unanswered: [], prior: o.prior ?? { checked: 0, refused: 0 },
  })
  expect(checkOutcome('ms', run(146, 15)).exitCode).toBe(1)
  expect(checkOutcome('ms', run(146, 15)).lines.at(-1)).toBe('  over one in ten refused (15 of 146): stop, and tell the chief of staff before ms is turned on')
  expect(checkOutcome('ms', run(146, 14)).exitCode).toBe(0)
  expect(checkOutcome('vi', run(40, 0, { prior: { checked: 100, refused: 20 } })).exitCode).toBe(1)
  expect(checkOutcome('vi', run(40, 0, { given: 41 })).exitCode).toBe(1)
  expect(checkOutcome('vi', run(0, 0)).exitCode).toBe(0)
})

test('--write reads and records the stored titles only, so it takes no --titles; --out takes them or the stored ones', () => {
  expect([checkUsage({ write: true }), checkUsage({ out: 'a.json' }), checkUsage({ out: 'a.json', titles: 't.json' })]).toEqual([true, true, true])
  expect([checkUsage({ write: true, titles: 't.json' }), checkUsage({ titles: 't.json' }), checkUsage({})]).toEqual([false, false, false])
})
