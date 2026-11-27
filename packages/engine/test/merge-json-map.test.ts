import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error plain .mjs git merge driver
import { mergeMaps } from '../../../scripts/merge-json-map.mjs'
import { listAgreed, mendWaiting, unlistCleared, waitingEntry } from '../src/last-photo'

test('keys added, changed or removed on either side all land; untouched keys stay', () => {
  const base = { a: 0, b: 0, c: 0 }
  const ours = { a: 1, b: 0, c: 0, x: 0 }
  const theirs = { a: 0, c: 0, y: 1 }
  expect(mergeMaps(base, ours, theirs)).toEqual({ a: 1, c: 0, x: 0, y: 1 })
})

test("an emptied page both sides listed keeps the earlier day, whichever side has it; any other value both changed, ours as before", () => {
  expect(mergeMaps({}, { 'species/a': '2026-11-21' }, { 'species/a': '2026-11-20' })).toEqual({ 'species/a': '2026-11-20' })
  expect(mergeMaps({}, { 'species/a': '2026-11-20' }, { 'breeds/b': '2026-11-21', 'species/a': '2026-11-21' })).toEqual({ 'species/a': '2026-11-20', 'breeds/b': '2026-11-21' })
  // A page one side took off the list (it's gone) stays off.
  expect(mergeMaps({ 'species/a': '2026-11-20' }, {}, { 'species/a': '2026-11-20' })).toEqual({})
  // Not an emptied page's entry: ours, as before.
  expect(mergeMaps({}, { 'https://m/x.webp': '2026-11-21' }, { 'https://m/x.webp': '2026-11-20' })).toEqual({ 'https://m/x.webp': '2026-11-21' })
  expect(mergeMaps({}, { 'species/a': 'waiting' }, { 'species/a': '2026-11-20' })).toEqual({ 'species/a': 'waiting' })
})

test('a clear keeps recovery places added for the same mark in a concurrent checkout', () => {
  const mark = { why: 'dead: withheld', step: 'the photo check', pages: ['species/x'], at: '2026-11-20', off: true }
  const look = { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }
  const page = { file: 'content/species/x/entity.json', index: 0 }
  const album = { file: 'content/gallery/x.json', index: 2 }
  const base = { u: mark }
  const checked = { u: { ...mark, look, left: [page] } }
  const captured = { u: { ...mark, left: [album] } }
  const merged = { u: { ...mark, look, left: [page, album] } }
  expect(mergeMaps(base, checked, captured)).toEqual(merged)
  expect(mergeMaps(base, captured, checked)).toEqual(merged)
  expect(mergeMaps(base, checked, { u: { ...captured.u, why: 'people: withheld' } })).toEqual({ u: { ...captured.u, why: 'people: withheld' } })
})

test('a clear retains a concurrently replaced capture', () => {
  const mark = { why: 'dead: withheld', step: 'the dead-fish screen', pages: ['species/x'], at: '2026-11-20', off: true }
  const original = { file: 'content/species/x/entity.json', index: 0, capture: 'hotlink' }
  const mirror = { ...original, index: 1, capture: 'credited-mirror' }
  const base = { u: { ...mark, left: [original] } }
  const look = { said: 'clear', by: 'reviewer', on: '2026-11-21' }
  const clear = { u: { ...base.u, look } }
  const concurrent = { u: { ...mark, left: [mirror] } }
  const merged = { u: { ...clear.u, left: [mirror] } }
  expect(mergeMaps(base, clear, concurrent)).toEqual(merged)
  expect(mergeMaps(base, concurrent, clear)).toEqual(merged)
})

test('a published settlement wins over a competing first capture of the same place', () => {
  const mark = { why: 'dead: withheld', step: 'the photo check', pages: ['species/x'], at: '2026-11-20', off: true }
  const a = { file: 'content/species/x/entity.json', index: 0, capture: 'published' }
  const b = { ...a, capture: 'parallel' }
  const done = { u: { ...mark, back: '2026-11-21', look: { said: 'clear', by: 'reviewer', on: '2026-11-21' }, settled: [a] } }
  const competing = { u: { ...mark, left: [b] } }
  expect(mergeMaps({ u: mark }, done, competing)).toEqual(done)
  expect(mergeMaps({ u: mark }, competing, done)).toEqual(done)
})

test('merging captures retains both pages covered by the verdict', () => {
  const base = { why: 'dead: withheld', step: 'the photo check', at: '2026-11-20', off: true }
  const a = { ...base, pages: ['species/a'], left: [{ file: 'content/species/a/entity.json', index: 0 }] }
  const b = { ...base, pages: ['species/b'], left: [{ file: 'content/species/b/entity.json', index: 0 }] }
  expect(mergeMaps({}, { u: a }, { u: b })).toEqual({ u: { ...a, pages: ['species/a', 'species/b'], left: [...a.left, ...b.left] } })
})

test('a pending album capture keeps a concurrent page settlement from Git history', () => {
  const mark = { why: 'dead: withheld', step: 'the photo check', pages: ['species/x'], at: '2026-11-20', off: true }
  const look = { said: 'clear', by: 'reviewer', on: '2026-11-21' }
  const page = { file: 'content/species/x/entity.json', index: 0 }
  const album = { file: 'content/gallery/x.json', index: 1, capture: 'later-capture' }
  const restoring = { u: { ...mark, look, back: '2026-11-22', settled: [page] } }
  const pending = { u: { ...mark, look, left: [album] } }
  const merged = { u: { ...mark, look, settled: [page], left: [album] } }
  expect(mergeMaps({ u: { ...mark, look } }, pending, restoring)).toEqual(merged)
  expect(mergeMaps({ u: { ...mark, look } }, restoring, pending)).toEqual(merged)
})

test('as a git merge driver: two engine jobs that both append to a photo cache rebase cleanly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jm-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  const driver = fileURLToPath(new URL('../../../scripts/merge-json-map.mjs', import.meta.url))
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  git('config', 'merge.jsonmap.driver', `node ${driver} %O %A %B`)
  await writeFile(join(dir, '.gitattributes'), '_photo-*.json merge=jsonmap\n')
  const write = (m: object) => writeFile(join(dir, '_photo-faces.json'), `${JSON.stringify(m, null, 2)}\n`)
  await write({ 'https://m/old.webp': 0 }); git('add', '.'); git('commit', '-qm', 'base')
  git('checkout', '-qb', 'pages'); await write({ 'https://m/old.webp': 0, 'https://m/new-page.webp': 0 }); git('commit', '-qam', 'pages')
  git('checkout', '-q', 'main'); await write({ 'https://m/old.webp': 0, 'https://m/gallery.webp': 1 }); git('commit', '-qam', 'photos')
  git('checkout', '-q', 'pages'); git('rebase', '-q', 'main')
  expect(JSON.parse(await readFile(join(dir, '_photo-faces.json'), 'utf8'))).toEqual({ 'https://m/old.webp': 0, 'https://m/gallery.webp': 1, 'https://m/new-page.webp': 0 })
})

test('second-look records both sides changed: one taken out stays out, a person\'s answer is kept on the record marked off but a clear for another reason than the mark\'s, then the one marked off at its first verdict wins; other maps as before', () => {
  const rec = (o: object = {}) => ({ why: 'dead: withheld [sha256:aa]', step: 'the photo check', pages: ['species/x'], at: '2026-11-20', ...o })
  const look = { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }
  // 20 Nov: a run on the old rule held the photo (unmarked) and main kept it; the other run marked it off with its waiting entry.
  const base = { held: rec({ step: 'the watermark screen' }), answered: rec({ step: 'the watermark screen' }), agreed: rec({ look: { ...look, said: 'agree' } }) }
  const ours = { held: rec(), answered: rec({ look }), new: rec() }
  const theirs = { held: rec({ off: true }), answered: rec({ off: true }), agreed: rec({ look: { ...look, said: 'agree' }, at: '2026-11-21' }), new: rec({ off: true }) }
  expect(mergeMaps(base, ours, theirs)).toEqual({ held: rec({ off: true }), answered: rec({ off: true, look }), new: rec({ off: true }) })
  // The answer goes on the other side's marked record, its reason and all; an answered record already marked stays as it is.
  const agree = { ...look, said: 'agree' }
  const marked = rec({ why: 'people: withheld [sha256:bb]', step: 'face detection', at: '2026-11-21', off: true })
  expect(mergeMaps({ k: rec() }, { k: marked }, { k: rec({ look: agree }) })).toEqual({ k: { ...marked, look: agree } })
  expect(mergeMaps({ k: rec() }, { k: marked }, { k: rec({ off: true, look: agree }) })).toEqual({ k: rec({ off: true, look: agree }) })
  expect(mergeMaps({ k: rec() }, { k: rec({ off: true }) }, { k: rec({ off: true, look }) })).toEqual({ k: rec({ off: true, look }) })
  // A clear for another reason than the mark's is dropped: the mark waits for a look of its own, beside its waiting entry.
  expect(mergeMaps({ k: rec() }, { k: marked }, { k: rec({ look }) })).toEqual({ k: marked })
  expect(mergeMaps({ k: rec() }, { k: rec({ off: true, look }) }, { k: marked })).toEqual({ k: marked })
  // Both marked or neither: ours, as before. A plain map's keys: ours first, as before.
  expect(mergeMaps({ k: rec() }, { k: rec({ off: true, pages: ['species/a'] }) }, { k: rec({ off: true, pages: ['species/b'] }) })).toEqual({ k: rec({ off: true, pages: ['species/a'] }) })
  expect(mergeMaps({ k: { off: false } }, { k: { off: 1 } }, { k: { off: true } })).toEqual({ k: { off: 1 } })
})

test("20 Nov's race through git, as a run's push rebases on main: the record marked off keeps its waiting entry, and none stands alone", async () => {
  // A run on the new rule marked a photo off at its first verdict and wrote its waiting entry. Main meanwhile had the same
  // photo's record from a run on the old rule, unmarked. The push rebases the run on main, both files through the driver.
  const dir = await mkdtemp(join(tmpdir(), 'jm-race-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  const driver = fileURLToPath(new URL('../../../scripts/merge-json-map.mjs', import.meta.url))
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  git('config', 'merge.jsonmap.driver', `node ${driver} %O %A %B`)
  await writeFile(join(dir, '.gitattributes'), 'engine-state/_photo-*.json merge=jsonmap\n')
  execFileSync('mkdir', ['-p', join(dir, 'engine-state')])
  const url = 'https://media.aquatome.com/scotcat/race.webp'
  const why = `dead: withheld [sha256:${'a'.repeat(64)}]`
  const record = (o: object = {}) => ({ why, step: 'the photo check', pages: ['species/x'], at: '2026-11-20', ...o })
  const write = async (sl: object, rejected: object) => {
    await writeFile(join(dir, 'engine-state/_photo-second-look.json'), `${JSON.stringify(sl, null, 2)}\n`)
    await writeFile(join(dir, 'engine-state/_photo-rejected.json'), `${JSON.stringify(rejected, null, 2)}\n`)
  }
  await write({ [url]: record({ why: `watermark: withheld [sha256:${'b'.repeat(64)}]`, step: 'the watermark screen', at: '2026-11-17' }) }, {})
  git('add', '.'); git('commit', '-qm', 'base')
  git('checkout', '-qb', 'run'); await write({ [url]: record({ off: true }) }, { [url]: waitingEntry(why) }); git('commit', '-qam', 'the new rule')
  git('checkout', '-q', 'main'); await write({ [url]: record() }, {}); git('commit', '-qam', 'the old rule')
  git('checkout', '-q', 'run'); git('rebase', '-q', 'main')
  const sl = JSON.parse(await readFile(join(dir, 'engine-state/_photo-second-look.json'), 'utf8'))
  expect(sl[url]).toEqual(record({ off: true }))
  expect(JSON.parse(await readFile(join(dir, 'engine-state/_photo-rejected.json'), 'utf8'))).toEqual({ [url]: waitingEntry(why) })
  expect(await mendWaiting(dir)).toEqual({ back: [], other: [], alone: [] })
})

test("a person's clear meets a run that marked the record off at its first verdict: for the mark's own reason it goes on the marked record and lifts the run's waiting entry; for another, the mark and its entry stay for a look of their own", async () => {
  // A data change answered the record as it stood (held, unmarked); a run meanwhile marked it off with a waiting entry.
  const why = `dead: withheld [sha256:${'a'.repeat(64)}]`
  const marked = { why, step: 'the photo check', pages: ['species/x'], at: '2026-11-21', off: true }
  const look = { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }
  for (const held of [
    { why, step: 'the photo check', pages: ['species/x'], at: '2026-11-17' },
    { why: `watermark: withheld [sha256:${'b'.repeat(64)}]`, step: 'the watermark screen', pages: ['species/x'], at: '2026-11-17' },
  ]) {
    const dir = await mkdtemp(join(tmpdir(), 'jm-clear-'))
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
    const driver = fileURLToPath(new URL('../../../scripts/merge-json-map.mjs', import.meta.url))
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
    git('config', 'merge.jsonmap.driver', `node ${driver} %O %A %B`)
    await writeFile(join(dir, '.gitattributes'), 'engine-state/_photo-*.json merge=jsonmap\n')
    execFileSync('mkdir', ['-p', join(dir, 'engine-state')])
    const url = 'https://media.aquatome.com/scotcat/clear.webp'
    const write = async (sl: object, rejected: object) => {
      await writeFile(join(dir, 'engine-state/_photo-second-look.json'), `${JSON.stringify(sl, null, 2)}\n`)
      await writeFile(join(dir, 'engine-state/_photo-rejected.json'), `${JSON.stringify(rejected, null, 2)}\n`)
    }
    await write({ [url]: held }, {})
    git('add', '.'); git('commit', '-qm', 'base')
    git('checkout', '-qb', 'run'); await write({ [url]: marked }, { [url]: waitingEntry(why) }); git('commit', '-qam', 'first verdict')
    git('checkout', '-q', 'main'); await write({ [url]: { ...held, look } }, {}); git('commit', '-qam', 'a clear')
    git('checkout', '-q', 'run'); git('rebase', '-q', 'main')
    const own = held.why === why
    expect(JSON.parse(await readFile(join(dir, 'engine-state/_photo-second-look.json'), 'utf8'))).toEqual({ [url]: own ? { ...marked, look } : marked })
    expect(await unlistCleared(dir)).toEqual(own ? [url] : [])
    expect(JSON.parse(await readFile(join(dir, 'engine-state/_photo-rejected.json'), 'utf8'))).toEqual(own ? {} : { [url]: waitingEntry(why) })
    expect(await mendWaiting(dir)).toEqual({ back: [], other: [], alone: [] })
  }
})

test('never-again entries both sides changed: a reason for good wins over a waiting entry, either way round; two of a kind, ours as before', () => {
  const waiting = (c: string) => `waiting: withheld [sha256:${c.repeat(64)}]`
  const final = `dead: withheld [sha256:${'c'.repeat(64)}]`
  expect(mergeMaps({}, { k: waiting('a') }, { k: final })).toEqual({ k: final })
  expect(mergeMaps({}, { k: final }, { k: waiting('a') })).toEqual({ k: final })
  expect(mergeMaps({ k: waiting('b') }, { k: waiting('a') }, { k: final })).toEqual({ k: final })
  expect(mergeMaps({}, { k: waiting('a') }, { k: waiting('b') })).toEqual({ k: waiting('a') })
  expect(mergeMaps({}, { k: final }, { k: 'people: withheld' })).toEqual({ k: final })
  // Only the exact shape: a caption that starts so is a plain string, ours first.
  expect(mergeMaps({}, { k: 'waiting: for the bus' }, { k: 'a plain caption' })).toEqual({ k: 'waiting: for the bus' })
  // One side took the entry off: it stays off, as before.
  expect(mergeMaps({ k: waiting('a') }, {}, { k: final })).toEqual({})
})

/** A scratch repository whose engine-state merges through the driver, and how to write and read its two lists. */
async function raceRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'jm-race2-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  const driver = fileURLToPath(new URL('../../../scripts/merge-json-map.mjs', import.meta.url))
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.org'); git('config', 'user.name', 'Sample Tester')
  git('config', 'merge.jsonmap.driver', `node ${driver} %O %A %B`)
  await writeFile(join(dir, '.gitattributes'), 'engine-state/_photo-*.json merge=jsonmap\n')
  execFileSync('mkdir', ['-p', join(dir, 'engine-state')])
  const write = async (sl: object, rejected: object) => {
    await writeFile(join(dir, 'engine-state/_photo-second-look.json'), `${JSON.stringify(sl, null, 2)}\n`)
    await writeFile(join(dir, 'engine-state/_photo-rejected.json'), `${JSON.stringify(rejected, null, 2)}\n`)
  }
  const read = async (f: string) => JSON.parse(await readFile(join(dir, 'engine-state', f), 'utf8'))
  return { dir, git, write, read }
}
const raceUrl = 'https://media.aquatome.com/example/race.webp'
const reasonOf = (c: string) => `dead: withheld [sha256:${c.repeat(64)}]`
const heldRec = { why: reasonOf('c'), step: 'the dead-fish screen', pages: ['species/x'], at: '2026-11-20' }
const markRec = (c: string) => ({ ...heldRec, why: reasonOf(c), off: true as const, at: '2026-11-21' })
const lookOf = (said: string) => ({ said, by: 'Sample Tester', on: '2026-11-21' })

test("two runs mark one photo off for two reasons and a person clears one: whichever lands first, the other reason's mark stays with its waiting entry, for a look of its own, and none stands alone", async () => {
  // Main marked it off for A; the run marked it off for B and took a clear, then rebased on main.
  const r = await raceRepo()
  await r.write({ [raceUrl]: heldRec }, {}); r.git('add', '.'); r.git('commit', '-qm', 'base')
  r.git('checkout', '-qb', 'run')
  await r.write({ [raceUrl]: markRec('b') }, { [raceUrl]: waitingEntry(reasonOf('b')) }); r.git('commit', '-qam', 'first verdict B')
  await r.write({ [raceUrl]: { ...markRec('b'), look: lookOf('clear') } }, { [raceUrl]: waitingEntry(reasonOf('b')) }); r.git('commit', '-qam', 'clear')
  r.git('checkout', '-q', 'main')
  await r.write({ [raceUrl]: markRec('a') }, { [raceUrl]: waitingEntry(reasonOf('a')) }); r.git('commit', '-qam', 'first verdict A')
  r.git('checkout', '-q', 'run'); r.git('rebase', '-q', 'main')
  expect(await r.read('_photo-second-look.json')).toEqual({ [raceUrl]: markRec('a') })
  expect(await unlistCleared(r.dir)).toEqual([])
  expect(await r.read('_photo-rejected.json')).toEqual({ [raceUrl]: waitingEntry(reasonOf('a')) })
  expect(await mendWaiting(r.dir)).toEqual({ back: [], other: [], alone: [] })

  // The other way round: main took the clear and its sweep lifted the entry before a late run's mark for A landed.
  const s = await raceRepo()
  await s.write({ [raceUrl]: heldRec }, {}); s.git('add', '.'); s.git('commit', '-qm', 'base')
  s.git('checkout', '-qb', 'late')
  await s.write({ [raceUrl]: markRec('a') }, { [raceUrl]: waitingEntry(reasonOf('a')) }); s.git('commit', '-qam', 'first verdict A')
  s.git('checkout', '-q', 'main')
  await s.write({ [raceUrl]: markRec('b') }, { [raceUrl]: waitingEntry(reasonOf('b')) }); s.git('commit', '-qam', 'first verdict B')
  await s.write({ [raceUrl]: { ...markRec('b'), look: lookOf('clear') } }, { [raceUrl]: waitingEntry(reasonOf('b')) }); s.git('commit', '-qam', 'clear')
  expect(await unlistCleared(s.dir)).toEqual([raceUrl]); s.git('commit', '-qam', 'sweep')
  s.git('checkout', '-q', 'late'); s.git('rebase', '-q', 'main')
  expect(await s.read('_photo-second-look.json')).toEqual({ [raceUrl]: markRec('a') })
  expect(await unlistCleared(s.dir)).toEqual([])
  expect(await s.read('_photo-rejected.json')).toEqual({ [raceUrl]: waitingEntry(reasonOf('a')) })
  expect(await mendWaiting(s.dir)).toEqual({ back: [], other: [], alone: [] })
})

test("an agree's sweep meets a run that marked the photo off before the agree: the agree's reason for good stays, with no waiting entry left alone", async () => {
  const r = await raceRepo()
  await r.write({ [raceUrl]: heldRec }, {}); r.git('add', '.'); r.git('commit', '-qm', 'base')
  r.git('checkout', '-qb', 'run')
  await r.write({ [raceUrl]: markRec('a') }, { [raceUrl]: waitingEntry(reasonOf('a')) }); r.git('commit', '-qam', 'first verdict A')
  r.git('checkout', '-q', 'main')
  await r.write({ [raceUrl]: { ...heldRec, look: lookOf('agree') } }, {}); r.git('commit', '-qam', 'an agree')
  r.git('checkout', '-qb', 'sweep')
  expect(await listAgreed(r.dir)).toEqual([raceUrl]); r.git('commit', '-qam', 'sweep')
  r.git('checkout', '-q', 'run'); r.git('rebase', '-q', 'main')
  r.git('checkout', '-q', 'main'); r.git('merge', '--ff-only', '-q', 'run')
  r.git('checkout', '-q', 'sweep'); r.git('rebase', '-q', 'main')
  expect(await r.read('_photo-second-look.json')).toEqual({})
  expect(await r.read('_photo-rejected.json')).toEqual({ [raceUrl]: heldRec.why })
  expect(await listAgreed(r.dir)).toEqual([])
  expect(await mendWaiting(r.dir)).toEqual({ back: [], other: [], alone: [] })
})

test('an album take-off receipt keeps its applied or batched status in either merge orientation', () => {
  const url = 'https://media.example/dead.webp'
  const planned = { [url]: true }
  const applied = { [url]: { applied: true } }
  const batched = { [url]: { batch: '1'.repeat(64) } }
  expect(mergeMaps({}, planned, applied)).toEqual(applied)
  expect(mergeMaps({}, applied, planned)).toEqual(applied)
  expect(mergeMaps(planned, applied, batched)).toEqual(batched)
  expect(mergeMaps(planned, batched, applied)).toEqual(batched)
})
