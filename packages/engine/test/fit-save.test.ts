import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { expect, test, vi } from 'vitest'
import type { Llm } from '../src/claude'
import { fitKey, fitText, runFit } from '../src/fit'
import type { Page } from '../src/pages'

// A disk that fills part way through a write: what's written of it is half, then the write throws (ENOSPC).
// `rmFails`: and the clean-up after it fails too. `wrote`: the last file a failing write went to.
const disk = vi.hoisted(() => ({ full: false, rmFails: false, wrote: '' }))
vi.mock('node:fs/promises', async orig => {
  const fs = await orig<typeof import('node:fs/promises')>()
  const writeFile = async (path: Parameters<typeof fs.writeFile>[0], data: string, ...rest: unknown[]) => {
    if (!disk.full) return fs.writeFile(path, data, ...(rest as []))
    disk.wrote = String(path)
    await fs.writeFile(path, data.slice(0, data.length >> 1))
    throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
  }
  const rm = async (...args: Parameters<typeof fs.rm>) => {
    if (disk.rmFails) throw Object.assign(new Error('EPERM: operation not permitted, unlink'), { code: 'EPERM' })
    return fs.rm(...args)
  }
  return { ...fs, writeFile, rm, default: { ...fs, writeFile, rm } }
})

const page = (id: string): Page => ({ lang: 'vi', kind: 'guides', id, title: id, path: `/vi/guides/${id}/`, fields: [{ field: 'body', html: '<p>Cá cần nước sạch.</p>' }], lines: [], captions: [], latin: [] }) as unknown as Page

// #1775's reader, 21 Nov 2026: the read wrote its records over the file in place, so a write that failed part way left the
// gate after it a file it couldn't parse, and the cycle stopped before its push. A save is now whole or nothing.
test("a save that fails part way leaves the last saved records whole, and no file of its own behind", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-fit-save-'))
  const statePath = join(dir, '_fit.json')
  const before = { 'vi/guides/kept': { at: '2026-11-20', hash: 'h', model: 'opus', checklist: 3, findings: [], products: [] } }
  await writeFile(statePath, `${JSON.stringify(before, null, 1)}\n`)
  const llm = (async () => ({ findings: [], products: [], doses: [] })) as Llm
  disk.full = true
  try {
    await expect(runFit([page('a')], statePath, { llm, jobs: 1, given: true })).rejects.toThrow('ENOSPC')
  } finally {
    disk.full = false
  }
  expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual(before)
  expect(await readdir(dir)).toEqual(['_fit.json'])
  // And a save that goes through is the whole of it.
  const { state } = await runFit([page('a')], statePath, { llm, jobs: 1, given: true })
  expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual(state)
  expect(state[fitKey(page('a'))]?.hash).toBe(fitText(page('a')).hash)
})

// #1775's re-check, 21 Nov 2026: a run killed between the write and the rename leaves its copy in engine-state/, and the
// cycle commits all of engine-state/; and a clean-up that failed put its own error in place of the save's.
test("a copy left behind is never committed, and a failed clean-up doesn't hide why the save failed", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-fit-save-'))
  const statePath = join(dir, '_fit.json')
  const llm = (async () => ({ findings: [], products: [], doses: [] })) as Llm
  disk.full = true
  disk.rmFails = true
  try {
    await expect(runFit([page('a')], statePath, { llm, jobs: 1, given: true })).rejects.toThrow('ENOSPC')
  } finally {
    disk.full = false
    disk.rmFails = false
  }
  const left = basename(disk.wrote)
  expect(await readdir(dir)).toContain(left)
  // The name the read gives its copy, in the repository's engine-state/: git ignores it (exits 0 when ignored).
  const repo = join(import.meta.dirname, '../../..')
  expect(() => execFileSync('git', ['check-ignore', '-q', `engine-state/${left}`], { cwd: repo })).not.toThrow()
})
