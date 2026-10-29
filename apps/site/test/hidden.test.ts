import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll } from '@aq/schema'
import { dropHidden, readHidden } from '../src/lib/hidden'
import { pagePath } from '../worker/hidden'

test('page paths: URLs and paths normalise to "/vi/…/"; anything else is rejected', () => {
  expect(pagePath('https://aquatome.com/vi/ca/ca-dia/')).toBe('/vi/ca/ca-dia/')
  expect(pagePath('/vi/ca/ca-dia')).toBe('/vi/ca/ca-dia/')
  expect(pagePath('/vi/ca/ca-dia/index.md')).toBe('/vi/ca/ca-dia/')
  expect(pagePath(' https://aquatome.com/vi/huong-dan/x/?utm=1#a ')).toBe('/vi/huong-dan/x/')
  expect(pagePath('/go/shopee/')).toBeNull()
  expect(pagePath('/vi/../_ab/')).toBeNull()
  expect(pagePath('')).toBeNull()
})

test('hidden pages leave the content (and so every list, sitemap and search)', async () => {
  const root = fileURLToPath(new URL('./fixture-content', import.meta.url))
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  const dir = await mkdtemp(join(tmpdir(), 'hid-'))
  await writeFile(join(dir, 'h.json'), JSON.stringify({ '/vi/ca/ca-dia/': { at: 'x' }, '/vi/thuat-ngu/ph/': { at: 'x' } }))
  const out = dropHidden(c, readHidden(join(dir, 'h.json')))
  expect(out.species.map(s => s.t.slug)).not.toContain('ca-dia')
  expect(out.species).toHaveLength(c.species.length - 1)
  expect(out.glossary.map(g => g.t.slug)).not.toContain('ph')
  expect(readHidden(join(dir, 'missing.json')).size).toBe(0)
})
