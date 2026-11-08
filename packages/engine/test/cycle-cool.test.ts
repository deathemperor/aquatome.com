import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const script = (name: string) => readFileSync(join(ROOT, 'scripts', name), 'utf8')

// A stand-in for macOS's notifyutil: the thermal pressure levels it reads out, one a call, the last one kept.
const cool = (levels: number[], tries = 10) => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-cool-'))
  writeFileSync(join(dir, 'levels'), levels.join('\n') + '\n')
  writeFileSync(join(dir, 'notifyutil'), `#!/bin/sh
n=$(cat "${dir}/calls" 2>/dev/null || echo 0); n=$((n + 1)); echo $n > "${dir}/calls"
level=$(sed -n "\${n}p" "${dir}/levels"); [ -n "$level" ] || level=$(tail -1 "${dir}/levels")
echo "com.apple.system.thermalpressurelevel $level"
`)
  chmodSync(join(dir, 'notifyutil'), 0o755)
  const r = spawnSync('bash', ['-c', `log() { echo "$*"; }; source '${join(ROOT, 'scripts/cycle-checks.sh')}'; cool; echo done`], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, COOL_PAUSE: '0', COOL_TRIES: String(tries), GITHUB_ACTIONS: '' },
    encoding: 'utf8',
  })
  return { out: r.stdout, calls: Number(readFileSync(join(dir, 'calls'), 'utf8')) }
}

// 2026-11-08: under heavy thermal pressure macOS ran work on 6-8 of 16 cores, and a 0.4 s job took up to 54 s.
test('an engine run waits while the Mac is hot, and goes ahead once it eases or the wait is over', () => {
  expect(cool([0])).toEqual({ out: 'done\n', calls: 1 })
  expect(cool([1])).toEqual({ out: 'done\n', calls: 1 }) // moderate: on it goes
  expect(cool([2, 3, 2, 1])).toEqual({ out: 'done\n', calls: 4 })
  expect(cool([2], 3)).toEqual({ out: 'still hot after the wait: going ahead\ndone\n', calls: 3 })
})

test('every engine and video run waits for a cooler Mac right after its start from main, before its work', () => {
  for (const [f, work] of [['engine-cycle.sh', 'pnpm install'], ['video-cycle.sh', 'pnpm install'], ['video-recheck.sh', 'pnpm install']]) {
    const s = script(f)
    const at = s.search(/^cool$/m)
    expect(at, f).toBeGreaterThan(s.indexOf('from_main "$@"'))
    expect(at, f).toBeLessThan(s.indexOf(work, s.indexOf('from_main "$@"')))
  }
})
