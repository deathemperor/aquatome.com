import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error plain .mjs git merge driver
import { mergeMaps } from '../../../scripts/merge-json-map.mjs'

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

test('second-look records both sides changed: one taken out stays out, a person\'s answer is kept, then the one marked off at its first verdict wins; other maps as before', () => {
  const rec = (o: object = {}) => ({ why: 'dead: withheld [sha256:aa]', step: 'the photo check', pages: ['species/x'], at: '2026-11-20', ...o })
  const look = { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }
  // 20 Nov: a run on the old rule held the photo (unmarked) and main kept it; the other run marked it off with its waiting entry.
  const base = { held: rec({ step: 'the watermark screen' }), answered: rec({ step: 'the watermark screen' }), agreed: rec({ look: { ...look, said: 'agree' } }) }
  const ours = { held: rec(), answered: rec({ look }), new: rec() }
  const theirs = { held: rec({ off: true }), answered: rec({ off: true }), agreed: rec({ look: { ...look, said: 'agree' }, at: '2026-11-21' }), new: rec({ off: true }) }
  expect(mergeMaps(base, ours, theirs)).toEqual({ held: rec({ off: true }), answered: rec({ look }), new: rec({ off: true }) })
  // Both marked or neither: ours, as before. A plain map's keys: ours first, as before.
  expect(mergeMaps({ k: rec() }, { k: rec({ off: true, pages: ['species/a'] }) }, { k: rec({ off: true, pages: ['species/b'] }) })).toEqual({ k: rec({ off: true, pages: ['species/a'] }) })
  expect(mergeMaps({ k: { off: false } }, { k: { off: 1 } }, { k: { off: true } })).toEqual({ k: { off: 1 } })
})
