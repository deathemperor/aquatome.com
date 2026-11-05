import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll } from '@aq/schema'
import { dropHidden, readHidden } from '../src/lib/hidden'
import { pagePath } from '../worker/hidden'

test('page paths: URLs and paths normalise to the page\'s address, an old /vi/… one to the root one; anything else is rejected', () => {
  expect(pagePath('https://aquatome.com/ca/ca-dia/')).toBe('/ca/ca-dia/')
  expect(pagePath('/ca/ca-dia')).toBe('/ca/ca-dia/')
  expect(pagePath('/ca/ca-dia/index.md')).toBe('/ca/ca-dia/')
  expect(pagePath(' https://aquatome.com/huong-dan/x/?utm=1#a ')).toBe('/huong-dan/x/')
  expect(pagePath('/ca/%63a-dia//')).toBe('/ca/ca-dia/') // encoded / doubled variants map to the same page
  expect(pagePath('/ca//ca-dia/')).toBe('/ca/ca-dia/')
  expect(pagePath('/id/ikan/x/')).toBe('/id/ikan/x/')
  // Hidden before the Vietnamese pages moved to the root: the same page.
  expect(pagePath('https://aquatome.com/vi/ca/ca-dia/')).toBe('/ca/ca-dia/')
  expect(pagePath('/vi//ca/ca-dia/')).toBe('/ca/ca-dia/')
  expect(pagePath('/go/shopee/')).toBeNull()
  expect(pagePath('/api/v1/wanted/')).toBeNull()
  expect(pagePath('/vi/../_ab/')).toBeNull()
  expect(pagePath('/../_ab/')).toBeNull()
  expect(pagePath('')).toBeNull()
})

test('hidden pages leave the content (and so every list, sitemap and search)', async () => {
  const root = fileURLToPath(new URL('./fixture-content', import.meta.url))
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  const dir = await mkdtemp(join(tmpdir(), 'hid-'))
  // One hidden by its old /vi/ address, before the Vietnamese pages moved to the root.
  await writeFile(join(dir, 'h.json'), JSON.stringify({ '/ca/ca-dia/': { at: 'x' }, '/vi/ca/ca-la-han/': { at: 'x' }, '/thuat-ngu/ph/': { at: 'x' } }))
  const out = dropHidden(c, readHidden(join(dir, 'h.json')))
  expect(out.species.map(s => s.t.slug)).not.toContain('ca-dia')
  expect(out.species).toHaveLength(c.species.length - 1)
  expect(out.breeds.map(b => b.t.slug)).toEqual(c.breeds.map(b => b.t.slug).filter(s => s !== 'ca-la-han'))
  expect(out.glossary.map(g => g.t.slug)).not.toContain('ph')
  expect(readHidden(join(dir, 'missing.json')).size).toBe(0)
})
