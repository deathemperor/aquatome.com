import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { writeRecord } from '../src/localize'

// A disk that writes slowly: `slow` holds a write half done until `go` (a loaded runner's write, caught part way), and
// `full` writes half and then fails (ENOSPC).
const disk = vi.hoisted(() => ({ slow: undefined as undefined | { halfway: () => void; go: Promise<void> }, full: false }))
vi.mock('node:fs/promises', async orig => {
  const fs = await orig<typeof import('node:fs/promises')>()
  const writeFile = async (path: Parameters<typeof fs.writeFile>[0], data: string, ...rest: unknown[]) => {
    if (!disk.slow && !disk.full) return fs.writeFile(path, data, ...(rest as []))
    await fs.writeFile(path, data.slice(0, data.length >> 1))
    if (disk.full) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
    disk.slow!.halfway()
    await disk.slow!.go
    return fs.writeFile(path, data, ...(rest as []))
  }
  return { ...fs, writeFile, default: { ...fs, writeFile } }
})

const record = (score: number) => `${JSON.stringify({ a: { at: '2026-11-18', score } }, null, 2)}\n`

// The chief of staff, 22 Nov 2026: the translator wrote its record in place, so a read while it wrote (the recheck's,
// putting a page back) could get half of it, and the page was skipped; #1822's run did, in its test's stand-in. Read
// while it's written, the record is the last one or the new one, whole.
test("the translator's record read while it is written is the last record, whole, then the new one", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-localize-record-'))
  const file = join(dir, 'localize-th.json')
  await writeFile(file, record(0.6))
  let halfway!: () => void
  const reached = new Promise<void>(r => (halfway = r))
  let go!: () => void
  disk.slow = { halfway, go: new Promise<void>(r => (go = r)) }
  try {
    const writing = writeRecord(file, record(0.85))
    await reached
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ a: { at: '2026-11-18', score: 0.6 } })
    go()
    await writing
  } finally {
    disk.slow = undefined
  }
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ a: { at: '2026-11-18', score: 0.85 } })
  expect(await readdir(dir)).toEqual(['localize-th.json'])
})

test("a write of the record that fails part way leaves the last one whole and no copy behind, and says why", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-localize-record-'))
  const file = join(dir, 'localize-th.json')
  await writeFile(file, record(0.6))
  disk.full = true
  try {
    await expect(writeRecord(file, record(0.85))).rejects.toThrow('ENOSPC')
  } finally {
    disk.full = false
  }
  expect(await readFile(file, 'utf8')).toBe(record(0.6))
  expect(await readdir(dir)).toEqual(['localize-th.json'])
})

test("a copy left by a run killed between the write and the rename is never committed", () => {
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  for (const f of ['engine-state/localize-th.json.4242-1a2b3c4d.tmp', 'engine-state/localize-ms-plants.json.7-00ff00ff.tmp']) {
    expect(() => execFileSync('git', ['check-ignore', '-q', f], { cwd: repo }), f).not.toThrow()
  }
})
