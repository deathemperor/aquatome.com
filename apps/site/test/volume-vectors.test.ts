import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { GALLON_L, SHAPES, glassKg, glassThickness, shapeVolume, type ShapeId } from '../src/scripts/volume'
import { WATER_SHARE } from '../src/scripts/calc'
import { localizePath, translator } from '../src/lib/i18n'

// Shared with the iOS app's tests, which run the app's own volume code (AquaTomeKit Tanks/Volume.swift) on the same
// cases. Every figure in the file is generated here: from each case's inputs, by volume.ts, and from the fixture build's
// table (UPDATE_VECTORS=1 rewrites the file).
const FILE = new URL('../../../protocols/volume-vectors.json', import.meta.url)
type Vectors = {
  shapes: { note: string; shape: ShapeId; d: Record<string, number>; refused?: string[] }[]
  glass: { lengthCm: number; waterCm: number }[]
  glassKg: { l: number; w: number; h: number; mm: number }[]
}
const kept: Vectors = JSON.parse(readFileSync(FILE, 'utf8'))

const COMMENT = 'The tank volume tool (apps/site/src/scripts/volume.ts, pages/vi/cong-cu/the-tich-be.astro): each shape\'s litres, US gallons and litres to a water line (`fill`, cm from the bottom; `filled` only below the rim), from sizes in cm; the tanks it refuses; the front glass (the computed minimum in mm and the stock glass to order, null above 19 mm) and an open-top box\'s glass weight; and the page\'s table of ready-made tanks as the fixture build shows it (whole litres, water at `waterShare`, glass in mm, kg full to the nearest 5). Generated from volume.ts and the built page by apps/site/test/volume-vectors.test.ts: edit a case\'s inputs here (note, shape, d, refused; a glass case\'s sizes), then run UPDATE_VECTORS=1 pnpm --filter site test, which writes every figure; the test fails while the file differs from what the code gives. The iOS app\'s tests run its own code (AquaTomeKit Tanks/Volume.swift) on the same cases, to 1e-9. A refusal gives the site\'s Vietnamese sentence (`error`) and, for the app, what it is (`refused`, written by hand, and checked against `error`): ["missing", field] for a size not above 0 (the page asks for it: "Nhập rộng."), ["shorter", field, than] for a pane longer than the side it sits on, ["fill"] for a water line not above 0 or above the rim. `fields`: each shape\'s sizes, in the page\'s order (the first one missing is the one it asks for).'

/** One case a line, as the other vector files are laid out. */
const line = (o: unknown): string => Array.isArray(o) ? `[${o.map(line).join(', ')}]`
  : o !== null && typeof o === 'object' ? `{${Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}: ${line(x)}`).join(', ')}}`
  : JSON.stringify(o)
/** What `refused` says, as the page says it: so a hand-written `refused` can't drift from the sentence volume.ts gives. */
const vi = translator('vi')
const THAN: Record<string, string> = { l: 'chiều dài', w: 'chiều rộng', a: 'cạnh áp tường', l1: 'dài nhánh 1', l2: 'dài nhánh 2' }
const label = (shape: ShapeId, key: string) => vi(SHAPES[shape].fields.find(x => x.key === key)?.label ?? `?${key}`)
const sentence = (shape: ShapeId, [what, key, than]: string[]) =>
  what === 'missing' ? vi('{label} phải lớn hơn 0.', { label: label(shape, key!) })
  : what === 'shorter' ? vi('{what} phải ngắn hơn {than}.', { what: label(shape, key!), than: vi(THAN[than!] ?? `?${than}`) })
  : vi('Mực nước phải lớn hơn 0 và không cao hơn bể.')
const list = (name: string, rows: unknown[], last = false) => [`  "${name}": [`, ...rows.map((r, i) => `    ${line(r)}${i < rows.length - 1 ? ',' : ''}`), `  ]${last ? '' : ','}`]

test('protocols/volume-vectors.json is what volume.ts and the built page give for its cases', async () => {
  const { page } = await import('./dist')
  const shapes = kept.shapes.map(({ note, shape, d, refused }) => {
    const r = shapeVolume(shape, d, translator('vi'))
    if ('error' in r) {
      if (!refused) throw new Error(`${note}: refused ("${r.error}"): say what it is in "refused"`)
      expect(sentence(shape, refused), `${note}: "refused" says another refusal than the page`).toBe(r.error)
      return { note, shape, d, refused, error: r.error }
    }
    if (refused) throw new Error(`${note}: no longer refused: take out its "refused"`)
    return { note, shape, d, litres: r.litres, gallons: r.gallons, ...(r.filled !== undefined ? { filled: r.filled } : {}) }
  })
  const glass = kept.glass.map(({ lengthCm, waterCm }) => ({ lengthCm, waterCm, ...glassThickness(lengthCm, waterCm) }))
  const kg = kept.glassKg.map(({ l, w, h, mm }) => ({ l, w, h, mm, kg: glassKg(l, w, h, mm) }))
  // The table as the fixture build shows it: the sizes from each row's link, the figures from its cells.
  const num = (s: string) => Number(s.replace('~', '').replace(/\./g, '').replace(',', '.'))
  const readyMade = page(localizePath('vi', '/vi/cong-cu/the-tich-be/')).dom.querySelectorAll('section[aria-labelledby="sizes-h"] tbody tr').map(tr => {
    const q = new URLSearchParams(tr.querySelector('th a')!.getAttribute('href')!.replace(/^\?/, ''))
    const [litres, water, glass, kg] = tr.querySelectorAll('td').map(td => num(td.text.trim()))
    return { l: Number(q.get('l')), w: Number(q.get('w')), h: Number(q.get('h')), litres, water, glass, kg }
  })
  expect(new Set(shapes.map(c => c.shape)).size, 'a case for every shape').toBe(12)
  expect(readyMade.length).toBeGreaterThan(5)

  const next = ['{', `  "$comment": ${JSON.stringify(COMMENT)},`, `  "gallonL": ${GALLON_L},`, `  "waterShare": ${WATER_SHARE},`,
    `  "fields": ${line(Object.fromEntries(Object.entries(SHAPES).map(([id, s]) => [id, s.fields.map(x => x.key)])))},`,
    ...list('shapes', shapes), ...list('glass', glass), ...list('glassKg', kg), ...list('readyMade', readyMade, true), '}', ''].join('\n')
  if (process.env.UPDATE_VECTORS === '1') writeFileSync(FILE, next)
  expect(readFileSync(FILE, 'utf8'), 'run UPDATE_VECTORS=1 pnpm --filter site test').toBe(next)
})
