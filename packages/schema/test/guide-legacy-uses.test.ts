import { spawnSync } from 'node:child_process'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { guideUseKey, keepGuideLegacyUses, readGuideLegacyUses } from '../src/photo-screen'

test('the checked-in legacy guide baseline may only shrink', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const file = 'content/guide-legacy-photo-uses.json'
  await access(new URL(`../../../${file}`, import.meta.url))
  const current = await readGuideLegacyUses(fileURLToPath(new URL('../../../content/', import.meta.url)))
  const keys = current.map(use => guideUseKey(...use))
  expect(keys.length).toBeLessThanOrEqual(699)
  expect(new Set(keys).size).toBe(keys.length)
  const command = (args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  const main = command(['rev-parse', '--verify', '-q', 'refs/remotes/origin/main']).stdout.trim()
  for (const base of new Set(['HEAD', process.env.AQ_GUIDE_BASELINE_REF || main || 'HEAD'])) {
    const prior = command(['show', `${base}:${file}`])
    if (prior.status !== 0) {
      expect(command(['cat-file', '-t', base]).stdout.trim()).toBe('commit')
      expect(prior.stderr).toMatch(/does not exist in|exists on disk, but not in/)
      continue
    }
    const previous = new Set<string>((JSON.parse(prior.stdout) as string[][]).map(use => JSON.stringify(use)))
    expect(keys.filter(key => !previous.has(key))).toEqual([])
  }
})

test('pruning a legacy baseline cannot add a new guide use', () => {
  const retained: [string, string, string] = ['g', 'platy', 'https://media.example/old.webp']
  expect(keepGuideLegacyUses([retained, ['done', 'platy', retained[2]]],
    new Set([guideUseKey(...retained), guideUseKey('new', 'platy', retained[2])]))).toEqual([retained])
})
