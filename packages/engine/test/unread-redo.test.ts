import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import outage from '../src/unread-2026-11-11.json'
import { redoUnread, type UnreadRecord } from '../src/unread-redo'

const FILES = ['engine-state/localize-id.json', 'engine-state/localize-th.json', 'engine-state/vi-rewrite.json', 'engine-state/glaser.json', 'engine-state/scotcat.json']

async function setup(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'unread-redo-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  for (const [file, text] of Object.entries(files)) await writeFile(join(root, file), text)
  return root
}
const text = (root: string, file: string) => readFile(join(root, file), 'utf8')

// The source record (state.ts) sorts its keys on save. The entry matches `now` whatever field order the file has.
test('an entry still as the outage left it goes back to what it was', async () => {
  const file = 'engine-state/glaser.json'
  const now = { status: 'processed', updatedAt: '2026-11-11' }
  const was = { status: 'processed', updatedAt: '2026-11-01', attempts: 1 }
  const raw = `${JSON.stringify({
    'https://example.test/b': { updatedAt: '2026-11-11', status: 'processed' },
    'https://example.test/a': { status: 'processed', attempts: 1 },
  }, null, 2)}\n`
  const root = await setup({ [file]: raw })
  const r = await redoUnread(root, [{ file, key: 'https://example.test/b', now, was }])
  expect(r).toEqual({ restored: [`${file}:https://example.test/b`], left: [] })
  expect(await text(root, file)).toBe(`${JSON.stringify({
    'https://example.test/a': { status: 'processed', attempts: 1 },
    'https://example.test/b': was,
  }, null, 2)}\n`)
})

// The Vietnamese rewrite (vi-backfill.ts) does not sort, so a deletion leaves the other keys where they were.
test('an entry the outage added, with nothing before it, is deleted', async () => {
  const file = 'engine-state/vi-rewrite.json'
  const raw = `${JSON.stringify({ zebra: { n: 1 }, alpha: { n: 2 }, middle: { n: 3 } }, null, 2)}\n`
  const root = await setup({ [file]: raw })
  const r = await redoUnread(root, [{ file, key: 'alpha', now: { n: 2 }, was: null }])
  expect(r.restored).toEqual([`${file}:alpha`])
  expect(await text(root, file)).toBe(`${JSON.stringify({ zebra: { n: 1 }, middle: { n: 3 } }, null, 2)}\n`)
})

test('an entry changed since the outage stays, and its file is not rewritten', async () => {
  const file = 'engine-state/scotcat.json'
  const raw = '{"kept":{"hash":"abc"}}'
  const root = await setup({ [file]: raw })
  const r = await redoUnread(root, [{ file, key: 'kept', now: { hash: 'outage' }, was: { hash: 'old' } }])
  expect(r).toEqual({ restored: [], left: [`${file}:kept`] })
  expect(await text(root, file)).toBe(raw)
})

test('a second run changes nothing', async () => {
  const file = 'engine-state/localize-id.json'
  const now = { at: '2026-11-11', name: 'Cupid' }
  const was = { at: '2026-11-07', name: 'Cupid' }
  const other = { at: '2026-11-02', name: 'Other' }
  const root = await setup({ [file]: `${JSON.stringify({ 'channa-andrao': now, 'other-fish': other }, null, 2)}\n` })
  const records: UnreadRecord[] = [
    { file, key: 'channa-andrao', now, was },
    { file, key: 'other-fish', now: { at: '2026-11-11', name: 'Gone' }, was: null },
  ]
  const first = await redoUnread(root, records)
  expect(first.restored).toEqual([`${file}:channa-andrao`])
  expect(first.left).toEqual([`${file}:other-fish`])
  const after = await text(root, file)
  expect(JSON.parse(after)['channa-andrao']).toEqual(was)
  expect(JSON.parse(after)['other-fish']).toEqual(other)
  const second = await redoUnread(root, records)
  expect(second.restored).toEqual([])
  expect(second.left).toEqual([`${file}:channa-andrao`, `${file}:other-fish`])
  expect(await text(root, file)).toBe(after)
})

test('a missing record file is skipped', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unread-redo-'))
  const file = 'engine-state/localize-th.json'
  const r = await redoUnread(root, [{ file, key: 'missing', now: { at: '2026-11-11' }, was: null }])
  expect(r).toEqual({ restored: [], left: [`${file}:missing`] })
})

test('the outage list is 29 records in the five record files', () => {
  expect(outage).toHaveLength(29)
  expect(outage.every(r => FILES.includes(r.file) && typeof r.key === 'string' && r.now !== null && 'was' in r)).toBe(true)
})
