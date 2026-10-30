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
