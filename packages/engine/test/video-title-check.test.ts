import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkOutcome, checkUsage, checkVideoTitles, forgetVerdicts, recordVerdicts, runTitleCheck } from '../src/video-title-check'

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
  expect([calls, r.prior, r.stopped]).toEqual([0, { checked: 240, refused: 30 }, 'over one in ten refused among the 240 titles read before: 30 of 240'])
})

test('a language that ended under the line is not stopped when passed videos leave their pages: what was read before counts, its video on a page or not (the reviewers of the check, 16 Nov)', async () => {
  const { root, ids, titles } = await many(500)
  const dir = join(root, 'content/video-titles')
  await writeFile(join(dir, 'vi.json'), JSON.stringify(titles))
  // 40 of 400 refused: one in ten exactly, so the language went on. Then five passed videos leave the page.
  await writeFile(join(dir, 'vi.refused.json'), JSON.stringify(Object.fromEntries(ids.slice(0, 40).map(id => [id, 'dropped: x']))))
  await writeFile(join(dir, 'vi.passed.json'), JSON.stringify(Object.fromEntries(ids.slice(40, 400).map(id => [id, titles[id]!]))))
  const page = join(root, 'content/species/a/entity.json'), gone = new Set(ids.slice(40, 45))
  const e = JSON.parse(await readFile(page, 'utf8')) as { videos: { youtubeId: string }[] }
  await writeFile(page, JSON.stringify({ ...e, videos: e.videos.filter(v => !gone.has(v.youtubeId)) }))
  let calls = 0
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => { calls++; return { checks: rowsOf(prompt).map((_, j) => ({ n: j + 1, ok: true })) } as T }
  const r = await runTitleCheck(root, llm, 'vi', { write: true })
  expect([r.prior, r.stopped, calls]).toEqual([{ checked: 400, refused: 40 }, '', 3])
  expect(existsSync(join(dir, 'vi.stopped.json'))).toBe(false)
})

test('two languages checked side by side keep both their stops: each language\'s stop is a file of its own (the reviewers of the check and the Site lead, 16 Nov)', async () => {
  const { root, ids, titles } = await many(300)
  const dir = join(root, 'content/video-titles')
  await writeFile(join(root, 'content/species/a/th.json'), JSON.stringify({ name: 'ปลา A' }))
  await writeFile(join(dir, 'vi.json'), JSON.stringify(titles))
  await writeFile(join(dir, 'th.json'), JSON.stringify(titles))
  const bad = new Set(ids.slice(0, 23))
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => ({ checks: rowsOf(prompt).map((l, j) => (bad.has(/Aus (v\d+)/.exec(l)![1]!) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true })) }) as T
  const line = 'over one in ten refused at 200 titles: 23 of 200'
  const [vi, th] = await Promise.all([runTitleCheck(root, llm, 'vi', { write: true }), runTitleCheck(root, llm, 'th', { write: true })])
  expect([vi.stopped, th.stopped]).toEqual([line, line])
  for (const lang of ['vi', 'th']) expect(JSON.parse(await readFile(join(dir, `${lang}.stopped.json`), 'utf8')), lang).toEqual({ why: line })
})

// The second reader of #1463, 16 Nov: one language run twice at once leaves a whole stop file, and no file of either run's
// own beside it.
test('one language checked twice at once leaves one whole stop file and nothing else beside the titles', async () => {
  const { root, ids, titles } = await many(300)
  const dir = join(root, 'content/video-titles')
  await writeFile(join(dir, 'vi.json'), JSON.stringify(titles))
  const bad = new Set(ids.slice(0, 23))
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => ({ checks: rowsOf(prompt).map((l, j) => (bad.has(/Aus (v\d+)/.exec(l)![1]!) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true })) }) as T
  await Promise.all([runTitleCheck(root, llm, 'vi', { write: true }), runTitleCheck(root, llm, 'vi', { write: true })])
  expect(JSON.parse(await readFile(join(dir, 'vi.stopped.json'), 'utf8'))).toEqual({ why: 'over one in ten refused at 200 titles: 23 of 200' })
  expect((await readdir(dir)).filter(f => f.endsWith('.tmp'))).toEqual([])
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

test('a row the model leaves out moves no mark: each is judged on the first 200, 400… titles read (the reviewers of the check, 16 Nov)', async () => {
  const { root, ids, titles } = await many(500)
  const read = ids.filter(id => id !== 'v050')
  const run = async (bad: Set<string>) => {
    let calls = 0
    const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
      calls++
      const rows = rowsOf(prompt).map(l => /Aus (v\d+)/.exec(l)![1]!)
      return { checks: rows.flatMap((id, j) => (id === 'v050' ? [] : [bad.has(id) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true }])) } as T
    }
    const r = await checkVideoTitles(root, llm, 'vi', titles)
    return { calls, checked: Object.keys(r.checks).length, stopped: r.stopped }
  }
  // 23 of the first 200 read: the batch that reaches 200 ends at 239, and the line is still judged at 200.
  expect(await run(new Set(read.slice(0, 23)))).toEqual({ calls: 6, checked: 239, stopped: 'over one in ten refused at 200 titles: 23 of 200' })
  // 20 of the first 200 and 4 just after: on, though 24 of the 239 read when the batch ends is over.
  expect(await run(new Set([...read.slice(0, 20), ...read.slice(200, 204)]))).toEqual({ calls: 13, checked: 499, stopped: '' })
})

test('the command reads the stored titles but the kept ones; with --write it counts the verdicts on file and records each batch, without it it records nothing', async () => {
  const root = await store()
  const dir = join(root, 'content/video-titles')
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ 'en-a': 'Cá A săn mồi hiếm', 'en-b': 'Tham quan bể cá A' }))
  await writeFile(join(dir, 'kept.json'), JSON.stringify({ 'en-a': 'Cá A săn mồi hiếm' }))
  const sent: string[] = []
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
    const rows = rowsOf(prompt)
    sent.push(...rows)
    return { checks: rows.map((_, j) => ({ n: j + 1, ok: false, kind: 'dropped', why: 'x' })) } as T
  }
  const dry = await runTitleCheck(root, llm, 'vi')
  expect([Object.keys(dry.checks), sent.length, existsSync(join(dir, 'vi.refused.json'))]).toEqual([['en-b'], 1, false])
  await runTitleCheck(root, llm, 'vi', { write: true })
  expect(JSON.parse(await readFile(join(dir, 'vi.refused.json'), 'utf8'))).toEqual({ 'en-b': 'dropped: x' })
  const again = await runTitleCheck(root, llm, 'vi', { write: true })
  expect([again.given, again.prior, sent.length]).toEqual([0, { checked: 1, refused: 1 }, 2])
  // Without --write, the verdicts on file aren't counted and nothing is recorded: the title is read again, the file as it was.
  const before = await readFile(join(dir, 'vi.refused.json'), 'utf8')
  const read = await runTitleCheck(root, llm, 'vi')
  expect([read.given, read.prior, sent.length, await readFile(join(dir, 'vi.refused.json'), 'utf8')]).toEqual([1, { checked: 0, refused: 0 }, 3, before])
})

test('a stop at the line is recorded, and the language reads nothing more with --write until it is taken out by hand: the batch that passed the mark may leave the verdicts on file under the line (the reviewers of the check, 16 Nov)', async () => {
  const { root, ids, titles } = await many(600)
  const dir = join(root, 'content/video-titles')
  await writeFile(join(dir, 'vi.json'), JSON.stringify(titles))
  const read = ids.filter(id => id !== 'v050'), bad = new Set(read.slice(0, 23))
  let calls = 0
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
    calls++
    const rows = rowsOf(prompt).map(l => /Aus (v\d+)/.exec(l)![1]!)
    return { checks: rows.flatMap((id, j) => (id === 'v050' ? [] : [bad.has(id) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true }])) } as T
  }
  const first = await runTitleCheck(root, llm, 'vi', { write: true })
  expect([Object.keys(first.checks).length, first.stopped]).toEqual([239, 'over one in ten refused at 200 titles: 23 of 200'])
  expect(JSON.parse(await readFile(join(dir, 'vi.stopped.json'), 'utf8'))).toEqual({ why: 'over one in ten refused at 200 titles: 23 of 200' })
  calls = 0
  const again = await runTitleCheck(root, llm, 'vi', { write: true })
  expect([calls, again.stopped]).toEqual([0, 'stopped before (over one in ten refused at 200 titles: 23 of 200): the chief of staff decides'])
  // The verdicts on file alone, 23 of 239, are under the line: without the record the next run would go on.
  await rm(join(dir, 'vi.stopped.json'))
  const on = await runTitleCheck(root, llm, 'vi', { write: true })
  expect([on.prior, calls > 0]).toEqual([{ checked: 239, refused: 23 }, true])
})

test('a recorded stop holds whatever the files say after it: after an earlier part-run, with --only, and when a refused video leaves its page; the run ends with an error (the reviewers of the check, 16 Nov)', async () => {
  const stopRecord = 'stopped before (over one in ten refused at 200 titles: 21 of 200): the chief of staff decides'
  const reader = (bad: (id: string) => boolean) => {
    const o = { calls: 0, llm: (async <T>({ prompt }: { prompt: string }) => {
      o.calls++
      return { checks: rowsOf(prompt).map((l, j) => (bad(/Aus (v\d+)/.exec(l)![1]!) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true })) } as T
    }) as Llm }
    return o
  }
  // An earlier part-run left 150 on file, 16 refused; this run stops at 200 with 21, but its last batch read on to 230.
  {
    const { root, ids, titles } = await many(500)
    const dir = join(root, 'content/video-titles')
    await writeFile(join(dir, 'vi.json'), JSON.stringify(titles))
    await writeFile(join(dir, 'vi.refused.json'), JSON.stringify(Object.fromEntries(ids.slice(0, 16).map(id => [id, 'dropped: x']))))
    await writeFile(join(dir, 'vi.passed.json'), JSON.stringify(Object.fromEntries(ids.slice(16, 150).map(id => [id, titles[id]!]))))
    const m = reader(id => id >= 'v150' && id < 'v155')
    const first = await runTitleCheck(root, m.llm, 'vi', { write: true })
    expect([first.prior, Object.keys(first.checks).length, first.stopped]).toEqual([{ checked: 150, refused: 16 }, 80, 'over one in ten refused at 200 titles: 21 of 200'])
    m.calls = 0
    // On file now 21 of 230, under the line; the record stops the run, and a run with --only on what's left.
    for (const only of [undefined, ids.slice(230)]) {
      const again = await runTitleCheck(root, m.llm, 'vi', { write: true, only })
      expect([m.calls, again.prior, again.stopped, checkOutcome('vi', again).exitCode]).toEqual([0, { checked: 230, refused: 21 }, stopRecord, 1])
    }
  }
  // A run stops at exactly 200 with 21 refused; then a refused video leaves its page. Its verdict still counts (21 of 200),
  // and the record holds.
  {
    const { root, ids, titles } = await many(500)
    const dir = join(root, 'content/video-titles')
    await writeFile(join(dir, 'vi.json'), JSON.stringify(titles))
    const m = reader(id => id < 'v021')
    expect((await runTitleCheck(root, m.llm, 'vi', { write: true })).stopped).toBe('over one in ten refused at 200 titles: 21 of 200')
    const page = join(root, 'content/species/a/entity.json')
    const e = JSON.parse(await readFile(page, 'utf8')) as { videos: { youtubeId: string }[] }
    await writeFile(page, JSON.stringify({ ...e, videos: e.videos.filter(v => v.youtubeId !== ids[0]) }))
    m.calls = 0
    const again = await runTitleCheck(root, m.llm, 'vi', { write: true })
    expect([m.calls, again.prior, again.stopped]).toEqual([0, { checked: 200, refused: 21 }, stopRecord])
  }
})

test("the run's end: unread titles, or more than one in ten refused over all read in these words, even under the first mark of 200, end it with an error (the chief of staff, 16 Nov; the reviewers of the check)", () => {
  const run = (checked: number, refused: number, o: { given?: number; prior?: { checked: number; refused: number }; stopped?: string } = {}) => ({
    checks: Object.fromEntries(Array.from({ length: checked }, (_, i) => [`v${i}`, i < refused ? { ok: false as const, kind: 'dropped' as const, why: 'x' } : { ok: true as const }])),
    failed: [], stopped: o.stopped ?? '', line: '', given: o.given ?? checked, shared: [], unanswered: [], prior: o.prior ?? { checked: 0, refused: 0 },
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
