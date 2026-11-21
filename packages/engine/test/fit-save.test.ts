import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import type { Llm } from '../src/claude'
import { fitKey, fitText, runFit } from '../src/fit'
import type { Page } from '../src/pages'

// A disk that fills part way through a write: what's written of it is half, then the write throws (ENOSPC).
const disk = vi.hoisted(() => ({ full: false }))
vi.mock('node:fs/promises', async orig => {
  const fs = await orig<typeof import('node:fs/promises')>()
  const writeFile = async (path: Parameters<typeof fs.writeFile>[0], data: string, ...rest: unknown[]) => {
    if (!disk.full) return fs.writeFile(path, data, ...(rest as []))
    await fs.writeFile(path, data.slice(0, data.length >> 1))
    throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
  }
  return { ...fs, writeFile, default: { ...fs, writeFile } }
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
