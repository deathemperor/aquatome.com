import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const script = (name: string) => readFileSync(join(ROOT, 'scripts', name), 'utf8')

// The gate (gate.ts) reads what a run changed before readers get it, so it runs after the last step that writes pages and
// before the run looks for changes, since its holds are changes, and commits them.
test('each run that writes pages gates them last, before it commits, and only a crash in the gate stops it', () => {
  for (const [name, commit] of [
    ['engine-cycle.sh', 'git commit -q -m "content: engine'],
    ['video-cycle.sh', 'git commit -q -m "content: videos'],
    ['video-recheck.sh', 'git commit -q -m "content: video guides checked again'],
  ] as const) {
    const s = script(name)
    const gate = s.indexOf('pnpm engine gate || { log "gate: crashed, not publishing"; exit 1; }')
    expect(gate, name).toBeGreaterThan(s.indexOf('pnpm engine sweep || log'))
    expect(gate, name).toBeLessThan(s.indexOf('if [ -z "$(git status --porcelain'))
    expect(gate, name).toBeLessThan(s.indexOf(commit))
  }
})
