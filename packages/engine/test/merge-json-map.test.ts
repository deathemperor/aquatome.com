import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error plain .mjs git merge driver
import { mergeMaps } from '../../../scripts/merge-json-map.mjs'
import { mendWaiting, unlistCleared, waitingEntry } from '../src/last-photo'

test('keys added, changed or removed on either side all land; untouched keys stay', () => {
  const base = { a: 0, b: 0, c: 0 }
  const ours = { a: 1, b: 0, c: 0, x: 0 }
  const theirs = { a: 0, c: 0, y: 1 }
  expect(mergeMaps(base, ours, theirs)).toEqual({ a: 1, c: 0, x: 0, y: 1 })
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

test('second-look records both sides changed: one taken out stays out, a person\'s answer is kept on the record marked off, then the one marked off at its first verdict wins; other maps as before', () => {
  const rec = (o: object = {}) => ({ why: 'dead: withheld [sha256:aa]', step: 'the photo check', pages: ['species/x'], at: '2026-11-20', ...o })
  const look = { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }
  // 20 Nov: a run on the old rule held the photo (unmarked) and main kept it; the other run marked it off with its waiting entry.
  const base = { held: rec({ step: 'the watermark screen' }), answered: rec({ step: 'the watermark screen' }), agreed: rec({ look: { ...look, said: 'agree' } }) }
  const ours = { held: rec(), answered: rec({ look }), new: rec() }
  const theirs = { held: rec({ off: true }), answered: rec({ off: true }), agreed: rec({ look: { ...look, said: 'agree' }, at: '2026-11-21' }), new: rec({ off: true }) }
  expect(mergeMaps(base, ours, theirs)).toEqual({ held: rec({ off: true }), answered: rec({ off: true, look }), new: rec({ off: true }) })
  // The answer goes on the other side's marked record, its reason and all; an answered record already marked stays as it is.
  const marked = rec({ why: 'people: withheld [sha256:bb]', step: 'face detection', at: '2026-11-21', off: true })
  expect(mergeMaps({ k: rec() }, { k: marked }, { k: rec({ look }) })).toEqual({ k: { ...marked, look } })
  expect(mergeMaps({ k: rec() }, { k: marked }, { k: rec({ off: true, look }) })).toEqual({ k: rec({ off: true, look }) })
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

test("a person's clear meets a run that marked the same record off at its first verdict: the clear stays on the marked record and lifts the run's waiting entry", async () => {
  // A data change answered the record as it stood (held, unmarked); a run meanwhile marked it off with a waiting entry.
  const dir = await mkdtemp(join(tmpdir(), 'jm-clear-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  const driver = fileURLToPath(new URL('../../../scripts/merge-json-map.mjs', import.meta.url))
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  git('config', 'merge.jsonmap.driver', `node ${driver} %O %A %B`)
  await writeFile(join(dir, '.gitattributes'), 'engine-state/_photo-*.json merge=jsonmap\n')
  execFileSync('mkdir', ['-p', join(dir, 'engine-state')])
  const url = 'https://media.aquatome.com/scotcat/clear.webp'
  const held = { why: `watermark: withheld [sha256:${'b'.repeat(64)}]`, step: 'the watermark screen', pages: ['species/x'], at: '2026-11-17' }
  const why = `dead: withheld [sha256:${'a'.repeat(64)}]`
  const marked = { why, step: 'the photo check', pages: ['species/x'], at: '2026-11-21', off: true }
  const look = { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }
  const write = async (sl: object, rejected: object) => {
    await writeFile(join(dir, 'engine-state/_photo-second-look.json'), `${JSON.stringify(sl, null, 2)}\n`)
    await writeFile(join(dir, 'engine-state/_photo-rejected.json'), `${JSON.stringify(rejected, null, 2)}\n`)
  }
  await write({ [url]: held }, {})
  git('add', '.'); git('commit', '-qm', 'base')
  git('checkout', '-qb', 'run'); await write({ [url]: marked }, { [url]: waitingEntry(why) }); git('commit', '-qam', 'first verdict')
  git('checkout', '-q', 'main'); await write({ [url]: { ...held, look } }, {}); git('commit', '-qam', 'a clear')
  git('checkout', '-q', 'run'); git('rebase', '-q', 'main')
  expect(JSON.parse(await readFile(join(dir, 'engine-state/_photo-second-look.json'), 'utf8'))).toEqual({ [url]: { ...marked, look } })
  expect(await unlistCleared(dir)).toEqual([url])
  expect(JSON.parse(await readFile(join(dir, 'engine-state/_photo-rejected.json'), 'utf8'))).toEqual({})
  expect(await mendWaiting(dir)).toEqual({ back: [], other: [], alone: [] })
})
