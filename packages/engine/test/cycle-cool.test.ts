import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const script = (name: string) => readFileSync(join(ROOT, 'scripts', name), 'utf8')

// A stand-in for macOS's sysctl: a 16-core Mac, and the cores it leaves to work, one reading a call, the last one kept.
const cool = (masks: number[], tries = 10, env: Record<string, string> = { GITHUB_ACTIONS: '' }) => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-cool-'))
  writeFileSync(join(dir, 'masks'), masks.join('\n') + '\n')
  writeFileSync(join(dir, 'sysctl'), `#!/bin/sh
[ "$2" = hw.ncpu ] && { echo 16; exit 0; }
n=$(cat "${dir}/calls" 2>/dev/null || echo 0); n=$((n + 1)); echo $n > "${dir}/calls"
mask=$(sed -n "\${n}p" "${dir}/masks"); [ -n "$mask" ] || mask=$(tail -1 "${dir}/masks")
echo $mask
`)
  chmodSync(join(dir, 'sysctl'), 0o755)
  const r = spawnSync('bash', ['-c', `log() { echo "$*"; }; source '${join(ROOT, 'scripts/cycle-checks.sh')}'; cool; echo done`], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, COOL_PAUSE: '0', COOL_TRIES: String(tries), ...env },
    encoding: 'utf8',
  })
  return { out: r.stdout, calls: existsSync(join(dir, 'calls')) ? Number(readFileSync(join(dir, 'calls'), 'utf8')) : 0 }
}

// 2026-11-08: under heat macOS ran work on 6-8 of 16 cores, and a 0.4 s job took up to 54 s. Its heat level alone said
// less: it read heavy with all 16 cores at work and that job at 0.3 s.
test('an engine run waits while cores are taken away, and goes ahead once they are back or the wait is over', () => {
  const all = 0xffff
  expect(cool([all])).toEqual({ out: 'done\n', calls: 1 })
  expect(cool([0xffffffff])).toEqual({ out: 'done\n', calls: 1 }) // more bits than cores: none taken
  expect(cool([0x41f, 0xc3f, 0x7fff, all])).toEqual({ out: 'done\n', calls: 4 }) // 6, 8, 15 of 16, then all
  expect(cool([0x41f], 3)).toEqual({ out: 'still hot after the wait: going ahead\ndone\n', calls: 3 })
})

// TestFlight's upload on this Mac's own runner (2026-11-08) waits as the engine does; on GitHub's runners nothing waits.
test("this Mac's own runner waits too, GitHub's runners never", () => {
  expect(cool([0x41f, 0xffff], 10, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' })).toEqual({ out: 'done\n', calls: 2 })
  expect(cool([0x41f], 10, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' })).toEqual({ out: 'done\n', calls: 0 })
})

test('every engine and video run waits for a cooler Mac right after its start from main, before its work', () => {
  for (const f of ['engine-cycle.sh', 'video-cycle.sh', 'video-recheck.sh']) {
    const s = script(f)
    const at = s.search(/^cool$/m)
    expect(at, f).toBeGreaterThan(s.indexOf('from_main "$@"'))
    expect(at, f).toBeLessThan(s.indexOf('pnpm install', s.indexOf('from_main "$@"')))
  }
})
