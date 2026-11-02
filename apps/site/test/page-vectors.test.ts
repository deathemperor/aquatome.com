import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { levelBlocks, pageShard, PageShard, type PageDoc } from '@aq/schema/app-page'
import type { AppIndex } from '../src/lib/app-index'
import { DIST } from './dist'

// Shared with the iOS app's tests (AquaTomeKit PageTests.swift) and the schema's. These `added` cases are the pages the
// fixture build writes for the app (/app/pages/vi/), each with what an app that knows only level 1 shows of it; the
// file's other cases are written by hand (UPDATE_VECTORS=1 rewrites these three, keeping their notes).
const FILE = new URL('../../../protocols/page-vectors.json', import.meta.url)
const BUILT = ['/vi/ca/ca-neon-vua/', '/vi/cay/cryptocoryne-wendtii/', '/vi/video/reu-hai-tu-a-den-z/']
type Added = { note: string; doc: PageDoc; older: string[] }

test('protocols/page-vectors.json\'s fish, plant and video series pages are the fixture build\'s', () => {
  const kept: { added: Added[] } = JSON.parse(readFileSync(FILE, 'utf8'))
  const ix: AppIndex = JSON.parse(readFileSync(`${DIST}/app/vi.json`, 'utf8'))
  /** The page as the app gets it: from its kind's shard, found as the app finds it. */
  const built = (path: string, kind: PageDoc['kind']): PageDoc => {
    const n = ix.shards?.[kind]?.n
    if (!n) throw new Error(`${path}: the build has no ${kind} pages`)
    const doc = PageShard.parse(JSON.parse(readFileSync(`${DIST}/app/pages/vi/${kind}-${pageShard(path, n)}.json`, 'utf8'))).pages[path]
    if (!doc) throw new Error(`${path}: not in the build's ${kind} pages`)
    return doc
  }
  for (const path of BUILT) expect(kept.added.some(c => c.doc.path === path), `no case for ${path}`).toBe(true)
  const first = levelBlocks(1)
  const added = kept.added.map((c): Added => {
    if (!BUILT.includes(c.doc.path)) return c
    const doc = built(c.doc.path, c.doc.kind)
    return { note: c.note, doc, older: doc.blocks.map(b => (first.has(b.t) ? b.t : 'web')) }
  })
  const next = `${JSON.stringify({ ...kept, added }, null, 2)}\n`
  if (process.env.UPDATE_VECTORS === '1') writeFileSync(FILE, next)
  expect(readFileSync(FILE, 'utf8'), 'run UPDATE_VECTORS=1 pnpm --filter site test').toBe(next)
})
