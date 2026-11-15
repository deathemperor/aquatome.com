import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const ROOT = new URL('../../../', import.meta.url).pathname
const PHOTO = /https:\/\/media\.aquatome\.com\/[^"]+\.webp/g

// 15 Nov 2026, Curation: the substrate page's "Lá bàng khô và lá rụng" showed green leaves on the tree, and its "Cát mịn"
// coloured gravel with a loach in it. Both went on the never-again list, which the engine's sweep takes off every page
// before a run's tests; this holds every equipment page, in every language, to it between sweeps.
test('no equipment page, in any language, shows a photo the never-again list refuses', () => {
  const refused = JSON.parse(readFileSync(join(ROOT, 'engine-state/_photo-rejected.json'), 'utf8')) as Record<string, string>
  const dir = join(ROOT, 'content/equipment')
  const shown = (readdirSync(dir, { recursive: true }) as string[]).filter(f => f.endsWith('.json'))
    .flatMap(f => [...new Set(readFileSync(join(dir, f), 'utf8').match(PHOTO) ?? [])].map(url => `${f}: ${url}`))
  expect(shown.length).toBeGreaterThan(0)
  expect(shown.filter(x => refused[x.split(': ')[1]!] !== undefined)).toEqual([])
})
