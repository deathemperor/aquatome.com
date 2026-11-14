import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// The card and the Vietnamese page give one school size (the cardinal tetra's card went to 8 with Seriously Fish's
// figure on 11 Nov while its text said 10). A figure in "đàn từ N con", "từ N con trở lên",
// "ít nhất N con" or "tối thiểu N con" is the traits file's schoolMin.
const FIXTURE = fileURLToPath(new URL('./fixture-content', import.meta.url))
const FORMS = [/đàn từ (\d+) con/g, /từ (\d+) con trở lên/g, /ít nhất (\d+) con/g, /tối thiểu (\d+) con/g]

function prose(page: { sections?: Record<string, unknown>; summary?: unknown; faq?: unknown; body?: unknown }): string {
  const bits: string[] = []
  const take = (v: unknown) => { if (typeof v === 'string') bits.push(v) }
  for (const v of Object.values(page.sections ?? {})) take(v)
  if (Array.isArray(page.summary)) for (const v of page.summary) take(v)
  else take(page.summary)
  if (Array.isArray(page.faq)) {
    for (const item of page.faq) {
      if (item && typeof item === 'object') {
        take((item as { q?: unknown }).q)
        take((item as { a?: unknown }).a)
      } else take(item)
    }
  } else take(page.faq)
  take(page.body)
  return bits.join('\n').replace(/<[^>]*>/g, '')
}

test('each species\' Vietnamese text names the same school size as its card', () => {
  const off: string[] = []
  for (const file of readdirSync(join(FIXTURE, 'traits')).filter(f => f.endsWith('.json')).sort()) {
    const traits = JSON.parse(readFileSync(join(FIXTURE, 'traits', file), 'utf8')) as { id: string; schoolMin: unknown }
    if (typeof traits.schoolMin !== 'number') continue
    const text = prose(JSON.parse(readFileSync(join(FIXTURE, 'species', traits.id, 'vi.json'), 'utf8')))
    const said = [...new Set(FORMS.flatMap(re => [...text.matchAll(re)].map(m => Number(m[1]))))]
    const wrong = said.filter(n => n !== traits.schoolMin)
    if (wrong.length) off.push(`${traits.id}: text says ${wrong.join(', ')}, schoolMin is ${traits.schoolMin}`)
  }
  expect(off).toEqual([])
})
