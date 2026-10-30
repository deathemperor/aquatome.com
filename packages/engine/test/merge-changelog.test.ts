import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error plain .mjs git merge driver
import { mergeChangelogs } from '../../../scripts/merge-changelog.mjs'

const e = (date: string, id: string) => ({ date, kind: 'species', id, source: 'x', action: 'new' })

test('both sides\' new entries are kept, newest first, one copy each', () => {
  const base = [e('2026-10-29', 'old')]
  const ours = [e('2026-10-30', 'video'), ...base]
  const theirs = [e('2026-10-30', 'fish'), e('2026-10-29', 'fish2'), ...base]
  expect(mergeChangelogs(base, ours, theirs).map((x: { id: string }) => x.id)).toEqual(['video', 'fish', 'fish2', 'old'])
})

test('as a git merge driver: two branches that both prepend merge cleanly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cl-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  const driver = fileURLToPath(new URL('../../../scripts/merge-changelog.mjs', import.meta.url))
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  git('config', 'merge.changelog.driver', `node ${driver} %O %A %B`)
  await writeFile(join(dir, '.gitattributes'), 'changelog.json merge=changelog\n')
  const write = (xs: object[]) => writeFile(join(dir, 'changelog.json'), `${JSON.stringify(xs, null, 2)}\n`)
  await write([e('2026-10-29', 'old')]); git('add', '.'); git('commit', '-qm', 'base')
  git('checkout', '-qb', 'videos'); await write([e('2026-10-30', 'video'), e('2026-10-29', 'old')]); git('commit', '-qam', 'video')
  git('checkout', '-q', 'main'); await write([e('2026-10-30', 'fish'), e('2026-10-29', 'old')]); git('commit', '-qam', 'fish')
  git('merge', '-q', 'videos', '-m', 'merge')
  expect(JSON.parse(await readFile(join(dir, 'changelog.json'), 'utf8')).map((x: { id: string }) => x.id)).toEqual(['fish', 'video', 'old'])
})
