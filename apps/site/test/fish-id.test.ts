import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { Catalog } from '../worker/fishid/catalog'
import { factShardOf, factShards, type FactsShard } from '../worker/fishid/facts'
import { appPage, DIST, page } from './dist'

test('the fish-ID catalog: every species, breed and plant page, each address a page the build has', () => {
  const c = JSON.parse(readFileSync(`${DIST}/app/fish-id.json`, 'utf8')) as Catalog
  expect(new Set(c.entries.map(e => e.kind))).toEqual(new Set(['species', 'breed', 'plant']))
  for (const e of c.entries) {
    for (const url of Object.values(e.url)) expect(() => appPage(url), url).not.toThrow()
    if (e.kind !== 'breed') expect(e.sci, e.id).toBeTruthy()
  }
  expect(c.entries.find(e => e.id === 'flowerhorn-cichlid')).toMatchObject({ kind: 'breed', alt: expect.arrayContaining(['Flowerhorn cichlid']) })
})

test('the fish-ID agent\'s facts: every catalog page in exactly one shard, as many shards as the catalog says; a fish\'s photos start with its catalog thumb', () => {
  const c = JSON.parse(readFileSync(`${DIST}/app/fish-id.json`, 'utf8')) as Catalog
  expect(c.shards).toBe(factShards(c))
  expect(readdirSync(`${DIST}/app/fish-id`).sort()).toEqual(Array.from({ length: c.shards! }, (_, n) => `facts-${n}.json`).sort())
  const seen: string[] = []
  for (let n = 0; n < c.shards!; n++) {
    const shard = JSON.parse(readFileSync(`${DIST}/app/fish-id/facts-${n}.json`, 'utf8')) as FactsShard
    for (const f of shard.entries) {
      expect(factShardOf(f.id, c.shards!), f.id).toBe(n)
      const e = c.entries.find(x => x.id === f.id)!
      expect(f.kind).toBe(e.kind)
      if (e.img) expect(f.photos[0], f.id).toBe(e.img)
      expect(f.photos.length).toBeLessThanOrEqual(2)
      seen.push(f.id)
    }
  }
  expect(seen.sort()).toEqual(c.entries.map(e => e.id).sort())
  const neon = JSON.parse(readFileSync(`${DIST}/app/fish-id/facts-${factShardOf('paracheirodon-innesi', c.shards!)}.json`, 'utf8')) as FactsShard
  expect(neon.entries.find(f => f.id === 'paracheirodon-innesi')).toMatchObject({ sci: 'Paracheirodon innesi', family: expect.any(String) })
})

test('the fish-ID page: camera and a photo from the phone, tips, what happens to the photo; in every language', () => {
  const { dom } = page('/cong-cu/nhan-dien-ca/')
  const inputs = dom.querySelectorAll('[data-fish-id] input[type=file]')
  // `capture` alone would open only the camera: a second input picks from the phone's photos.
  expect(inputs.map(i => [i.getAttribute('accept'), i.getAttribute('capture') ?? null])).toEqual([['image/*', 'environment'], ['image/*', null]])
  expect(dom.querySelectorAll('.tips li').length).toBeGreaterThanOrEqual(4)
  expect(dom.querySelector('.privacy')!.text).toContain('Anthropic')
  expect(dom.querySelector('.privacy a')!.getAttribute('href')).toBe('/chinh-sach-bao-mat/#nhan-dien-ca')
  expect(page('/chinh-sach-bao-mat/').dom.querySelector('#nhan-dien-ca')).not.toBeNull()
  expect(page('/id/alat/kenali-ikan/').dom.querySelector('h1')!.text).toBe('Ikan apa ini?')
  expect(page('/th/tools/fish-id/').dom.querySelector('h1')!.text).toBe('นี่คือปลาอะไร?')
})
