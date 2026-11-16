import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

// Reads of the real content the trace once missed (a reader of #1484, 16 Nov 2026), each of its own file or folder.
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))

test('reads the real content three ways', () => {
  readFileSync(`${ROOT}packages/schema/../../content/sources.json`)
  const dir = mkdtempSync(join(tmpdir(), 'aq-probe-'))
  copyFileSync(`${ROOT}content/curation.json`, join(dir, 'curation.json'))
  execFileSync('ls', [`${ROOT}sources`], { cwd: dir, stdio: 'ignore' })
  rmSync(dir, { recursive: true, force: true })
})
