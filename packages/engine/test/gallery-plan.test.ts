import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { galleryPlan, TARGETS } from '../src/gallery-plan'

async function root(pages: [string, string, string[]][]) {
  const r = await mkdtemp(join(tmpdir(), 'aq-plan-'))
  for (const [kind, id, sources] of pages) {
    await mkdir(join(r, 'content', kind, id), { recursive: true })
    await writeFile(join(r, 'content', kind, id, 'entity.json'), JSON.stringify({ scientificName: id, photos: [], sections: sources.map(source => ({ source })) }))
  }
  return r
}
const shopList = async (r: string, file: string, names: string[]) => {
  await mkdir(join(r, 'engine-state/shop-lists'), { recursive: true })
  await writeFile(join(r, 'engine-state/shop-lists', file), JSON.stringify({ lang: 'vi', items: names.map(n => ({ trade: n, name: n, scientificName: n, confidence: 0.9, evidence: '' })), sources: [], updatedAt: '' }))
}

test('targets go down with popularity, to the owner\'s floor of 20', () => {
  expect(TARGETS).toEqual({ staple: 100, shop: 60, popular: 40, covered: 30, rest: 20 })
})

test('tiers: staples, shop species, the most-kept fish, pages two sources cover, the rest; plants by their shop list and coverage', async () => {
  const r = await root([
    ['species', 'aaa-rest', ['seriouslyfish']], ['species', 'zzz-covered', ['seriouslyfish', 'glaser']], ['species', 'danio-margaritatus', ['seriouslyfish']],
    ['species', 'betta-splendens', []], ['species', 'shop-fish', ['seriouslyfish']], ['species', 'danio-rerio', []],
    ['plants', 'anubias-barteri', ['tropica']], ['plants', 'covered-plant', ['tropica', 'aquariumcoop']], ['plants', 'rest-plant', ['tropica']],
  ])
  await shopList(r, 'th.json', ['Shop fish', 'Danio rerio'])
  await shopList(r, 'plants-vi.json', ['Anubias barteri'])
  const plan = await galleryPlan(r)
  expect(plan.map(p => `${p.tier}:${p.id}:${p.target}`)).toEqual([
    'staple:betta-splendens:100', 'staple:danio-rerio:100', // a staple stays a staple when a shop sells it too
    'shop:shop-fish:60', 'shop:anubias-barteri:60',
    'popular:danio-margaritatus:40',
    'covered:zzz-covered:30', 'covered:covered-plant:30',
    'rest:aaa-rest:20', 'rest:rest-plant:20',
  ])
  expect(plan.find(p => p.id === 'anubias-barteri')!.kind).toBe('plants')
})
