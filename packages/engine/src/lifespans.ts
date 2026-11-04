import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Range, SpeciesEntity } from '@aq/schema'
import { parse } from 'node-html-parser'
import { BOUNDS } from './process'

/** A labelled line: "Life expectancy: 3 to 5 years", "Lifespan: up to 3 years", "Life span: 18 months". */
const LINE = /^(?:life ?expectancy|life ?span|longevity)\s*:\s*(.+)$/i
const N = String.raw`(\d+(?:[.,]\d+)?)`
/** The figure and nothing more: "4 years", "3 to 5 years", "3-5 yrs", "up to 2 years", "about 10 years", "18 months". */
const FIGURE = new RegExp(String.raw`^(?:up to|about|around|approx\.?|approximately|c\.|ca\.)?\s*${N}(?:\s*(?:–|—|-|to)\s*${N})?\s*(years?|yrs?|months?)\.?$`, 'i')

/** A lifespan in years from a quick-facts value that is only the figure; months as a part of a year. */
export function lifespanOf(value: string): Range | undefined {
  const m = FIGURE.exec(value.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim())
  if (!m) return undefined
  const per = /^m/i.test(m[3]!) ? 12 : 1
  const n = (s: string) => Math.round((Number(s.replace(',', '.')) / per) * 10) / 10
  const min = n(m[1]!)
  const max = m[2] ? n(m[2]) : min
  const [lo, hi] = BOUNDS.lifeYears
  return min <= max && min >= lo && max <= hi ? { min, max } : undefined
}

/**
 * Lifespans the sources already state as a labelled line of their own text (a quick-facts item, or a paragraph that is
 * only that line), put on the data card (`lifeYears`) for each source that gives one and has none there yet. Prose is
 * never read ("lifespan tends to increase in well-maintained aquaria"); a source read from now on gives its lifespan
 * through the process prompt. Returns the species changed and the values added.
 */
export async function fillLifespans(contentRoot: string): Promise<{ species: number; values: number }> {
  let species = 0
  let values = 0
  for (const id of (await readdir(join(contentRoot, 'species')).catch(() => [] as string[])).sort()) {
    const file = join(contentRoot, 'species', id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw || !/life ?expectancy|life ?span|longevity/i.test(raw)) continue
    const e = JSON.parse(raw) as SpeciesEntity
    const have = new Set((e.dataCard.lifeYears ?? []).map(v => v.source))
    const found: { source: SpeciesEntity['sections'][number]['source']; value: Range }[] = []
    for (const s of e.sections) {
      if (have.has(s.source) || found.some(f => f.source === s.source)) continue
      for (const el of parse(s.html).querySelectorAll('li, p')) {
        const line = LINE.exec(el.structuredText.replace(/\s+/g, ' ').trim())
        const value = line ? lifespanOf(line[1]!) : undefined
        if (value) { found.push({ source: s.source, value }); break }
      }
    }
    if (!found.length) continue
    e.dataCard.lifeYears = [...(e.dataCard.lifeYears ?? []), ...found]
    await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
    species++
    values += found.length
  }
  return { species, values }
}
