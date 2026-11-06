import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { NEED_RULES } from '@aq/schema'
import { CONFLICT_ANCHOR, FIELD_ANCHORS, FIELD_TIPS, LEVEL_WORDS, NEED_LABELS, NEEDS_ANCHOR, TEMPERAMENT_WORDS, WHY_WORDS } from '../src/lib/card-guide'
import { FIELD_LABELS, FIELD_ORDER } from '../src/lib/format'
import { page } from './dist'
import { OTHER_LANGS } from '@aq/schema/langs'

const GUIDE = { vi: '/gioi-thieu/bang-du-lieu/', id: '/id/tentang/tabel-data/', th: '/th/about/data-table/' }
const ANCHORS = [...Object.values(FIELD_ANCHORS), CONFLICT_ANCHOR, NEEDS_ANCHOR]

test('the data card\'s explainer page is built in each language, with a section for every card field and for sources that disagree', () => {
  for (const [lang, path] of Object.entries(GUIDE)) {
    const { dom } = page(path)
    expect(dom.querySelector('html')?.getAttribute('lang'), path).toBe(lang)
    expect(dom.querySelectorAll('h1').length, path).toBe(1)
    for (const id of ANCHORS) expect(dom.querySelector(`[id="${id}"]`), `${path}#${id}`).not.toBeNull()
    // The contents lead to every field's section and the disagreement one.
    expect(dom.querySelectorAll('.fields a').map(a => a.getAttribute('href')), path).toEqual([...FIELD_ORDER.map(f => `#${FIELD_ANCHORS[f]}`), `#${CONFLICT_ANCHOR}`])
  }
  // It is linked from the about page and listed in the sitemap, in every language.
  expect(page('/gioi-thieu/').dom.querySelector(`a[href="${GUIDE.vi}"]`)).not.toBeNull()
  const xml = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8')
  for (const path of Object.values(GUIDE)) expect(xml).toContain(path)
})

test('the page quotes the needs\' thresholds the panel uses (NEED_RULES), as figures the units toggle converts', () => {
  const R = NEED_RULES
  const { dom } = page(GUIDE.vi)
  // A row per need (two each for space and water), its Dễ, Vừa and Khó cells in order.
  const rows = (k: string) => dom.querySelectorAll(`table.needs tr[data-need="${k}"]`).map(tr => tr.querySelectorAll('td'))
  const figs = (td: { querySelectorAll: (s: string) => { getAttribute: (a: string) => string | undefined }[] }, a: string) => td.querySelectorAll(`[${a}]`).map(s => s.getAttribute(a))
  const [tank, size] = rows('space')
  expect([figs(tank![0]!, 'data-cm'), figs(tank![1]!, 'data-cm')]).toEqual([[`${R.tankCm.easy},${R.tankCm.easy}`], [`${R.tankCm.mid},${R.tankCm.mid}`]])
  expect([figs(size![0]!, 'data-cm'), figs(size![1]!, 'data-cm')]).toEqual([[`${R.sizeCm.easy},${R.sizeCm.easy}`], [`${R.sizeCm.mid},${R.sizeCm.mid}`]])
  const [ph, gh] = rows('water')
  expect(ph![1]!.text).toBe(`dừng dưới ${R.ph.neutral}, bắt đầu từ ${String(R.ph.alkaline).replace('.', ',')} trở lên, hay hẹp hơn ${R.ph.narrow} đơn vị`)
  expect(ph![2]!.text).toBe(`chỉ tới ${String(R.ph.acidHard).replace('.', ',')}`)
  expect(gh![1]!.text).toBe(`bắt đầu từ ${R.gh.veryHard} dGH trở lên, hay hẹp hơn ${R.gh.narrow} dGH`)
  expect(gh![2]!.text).toBe(`chỉ tới ${R.gh.soft} dGH`)
  const [temp] = rows('temperature')
  expect([figs(temp![1]!, 'data-c'), figs(temp![2]!, 'data-c')]).toEqual([[`${R.tempC.warm},${R.tempC.warm}`, `${R.tempC.cool},${R.tempC.cool}`], [`${R.tempC.warmHard},${R.tempC.warmHard}`, `${R.tempC.coolHard},${R.tempC.coolHard}`]])
  expect(temp![1]!.text).toContain(`hẹp hơn ${R.tempC.narrow} độ`)
  expect(rows('social')[0]!.map(td => td.text)).toEqual([`tới ${R.schoolMin.easy} con`, `tới ${R.schoolMin.mid} con`, `từ ${R.schoolMin.mid + 1} con`])
  expect(rows('temperament')[0]!.map(td => td.text)).toEqual(['hiền', 'hơi dữ, hay cắn vây', 'hung dữ, săn mồi'])
  expect(rows('diet')).toEqual([])
})

test('each data card label leads to its section of the explainer, with what the figure means on hover or tap', () => {
  const { dom } = page('/ca/ca-neon-vua/')
  const guide = page(GUIDE.vi).dom
  const cells = dom.querySelectorAll('.facts .card > div')
  expect(cells.length).toBeGreaterThanOrEqual(6)
  for (const cell of cells) {
    const field = cell.getAttribute('data-field') as keyof typeof FIELD_ANCHORS
    const a = cell.querySelector('dt a.gl')!
    expect(a.getAttribute('href'), field).toBe(`${GUIDE.vi}#${FIELD_ANCHORS[field]}`)
    expect(guide.querySelector(`[id="${FIELD_ANCHORS[field]}"]`), field).not.toBeNull()
    expect(a.text).toBe(FIELD_LABELS[field])
    expect(a.getAttribute('data-term')).toBe(FIELD_LABELS[field])
    expect(a.getAttribute('data-tip')).toBe(FIELD_TIPS[field])
  }
  // The sources toggle ends with how the card picks one figure when they disagree.
  expect(dom.querySelector('.datacard details.trust .how a')?.getAttribute('href')).toBe(`${GUIDE.vi}#${CONFLICT_ANCHOR}`)
})

test('"Vì sao?" on the difficulty: each need with its level and the figure it comes from', () => {
  // Cardinal tetra: 60 cm and 5 cm, pH 4–6 and 1–6 dGH, Seriously Fish's 24–30 °C, peaceful, a school of 8.
  const { dom } = page('/ca/ca-neon-vua/')
  const why = dom.querySelector('.card [data-field="difficulty"] details.why')!
  expect(why.querySelector('summary')?.text).toContain('3/8')
  const needs = why.querySelectorAll('li')
  expect(needs.map(n => [n.getAttribute('data-need'), n.getAttribute('data-level'), n.querySelector('.lv')?.text])).toEqual([
    ['space', 'easy', 'Dễ'], ['water', 'hard', 'Khó'], ['temperature', 'easy', 'Dễ'], ['temperament', 'easy', 'Dễ'], ['social', 'mid', 'Vừa'],
  ])
  expect(needs.map(n => n.querySelector('.fx')?.text.replace(/\s+/g, ' ').trim())).toEqual([
    'bể từ 60 cm, cá dài 5 cm', 'nước chua, nước mềm · pH 4–6, 1–6 dGH', '24–30°C', 'hiền', 'đàn từ 8 con',
  ])
  expect(needs[0]!.querySelectorAll('[data-cm]').map(s => s.getAttribute('data-cm'))).toEqual(['60,60', '5,5'])
  expect(needs[2]!.querySelector('[data-c]')?.getAttribute('data-c')).toBe('24,30')
  expect(why.querySelector('.note a')?.getAttribute('href')).toBe(`${GUIDE.vi}#${NEEDS_ANCHOR}`)
  // One sources toggle still: the panel is the difficulty cell's own.
  expect(dom.querySelectorAll('.datacard details.trust').length).toBe(1)
})

test('a need without its figures is left out, not shown as easy; a card with no difficulty has no panel', () => {
  // Discus: no traits file, so no temperament or social need.
  const discus = page('/ca/ca-dia/').dom.querySelectorAll('.card [data-field="difficulty"] details.why li')
  expect(discus.map(n => [n.getAttribute('data-need'), n.getAttribute('data-level')])).toEqual([['space', 'hard'], ['water', 'hard'], ['temperature', 'hard']])
  // Angelfish: a size and nothing else, no difficulty.
  const angel = page('/ca/ca-ong-tien/').dom
  expect(angel.querySelector('.card [data-field="difficulty"]')).toBeNull()
  expect(angel.querySelector('details.why')).toBeNull()
})

test('the card\'s new words have Indonesian and Thai, though the fixture has no Indonesian or Thai fish page to fail the build', async () => {
  const src = readFileSync(new URL('../src/components/DataCard.astro', import.meta.url), 'utf8')
  const literals = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map(m => m[1]!.replace(/\\'/g, "'"))
  const words = [...literals, ...[FIELD_LABELS, FIELD_TIPS, NEED_LABELS, LEVEL_WORDS, WHY_WORDS, TEMPERAMENT_WORDS].flatMap(o => Object.values(o))]
  for (const lang of OTHER_LANGS) {
    const dict = (await import(`../src/i18n/${lang}.json`)).default as Record<string, string>
    expect(words.filter(w => !(w in dict)), lang).toEqual([])
  }
})
