import { existsSync, readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { GlossaryEntity, Localized } from '@aq/schema'
import { getContent } from '../src/lib/content'
import { glossaryParts, linkedTermPaths, termTitle, USED_IN_SHOWN } from '../src/lib/glossary-page'
import { DIST, page } from './dist'

// A term's page (pages/thuat-ngu/[slug].astro): its other names, its definition's links, and every page that uses it.
// The owner asked, of the Lũa page on 13 Nov, "Where's the better glossary page and details?": it led nowhere.
const term = (g: Localized<GlossaryEntity>, t: Partial<Localized<GlossaryEntity>['t']>, en = g.en): Localized<GlossaryEntity> => ({ ...g, en, t: { ...g.t, ...t } })

test('a term\'s title carries its English name, once, without that name\'s own brackets', async () => {
  const c = await getContent('vi')
  const g = c.glossary.find(x => x.id === 'chu-trinh-nito')!
  expect(termTitle(g)).toBe('Chu trình nitơ (Nitrogen cycle)')
  expect(termTitle(c.glossary.find(x => x.id === 'ph')!)).toBe('pH')
  expect(termTitle(term(g, { name: 'Vùng D' }, 'D area (discus)'))).toBe('Vùng D (D area)')
  expect(termTitle(term(g, { name: 'CO2' }, 'CO₂'))).toBe('CO2 (CO₂)')
  expect(termTitle(term(g, { name: 'KH' }, 'KH'))).toBe('KH')
})

test('a term\'s other names are shown once each, never its own name; its definition links other terms, never its own names', async () => {
  const c = await getContent('vi')
  const gh = c.glossary.find(x => x.id === 'gh')!
  const p = glossaryParts('vi', c, term(gh, { altNames: ['độ cứng tổng', 'GH', 'Độ cứng tổng', ' ', 'dGH'], definition: 'Độ cứng tổng (GH) khác với pH: GH < 4 là nước mềm, đo bằng dGH.' }))
  expect(p.otherNames).toEqual(['độ cứng tổng', 'dGH'])
  // pH is another term: linked, with its card. Its own names (GH, dGH) are not; "<" stays text.
  expect(p.definition).toContain('<a href="/vi/thuat-ngu/ph/" class="gl"')
  expect(p.definition).not.toContain('/vi/thuat-ngu/gh/')
  expect(p.definition).toContain('GH &lt; 4')
})

test('a page\'s link to a term is found however it is written: either quote, a #part; never another address', () => {
  expect(linkedTermPaths('<a href="/vi/thuat-ngu/ph/" class="gl">pH</a> <a href=\'/vi/thuat-ngu/gh/\'>GH</a> <a href="/vi/thuat-ngu/lua/#loai">lũa</a>')).toEqual(['/vi/thuat-ngu/ph/', '/vi/thuat-ngu/gh/', '/vi/thuat-ngu/lua/'])
  expect(linkedTermPaths('<a href="/vi/thuat-ngu/">Thuật ngữ</a> <a href="/vi/huong-dan/ph/">pH</a> <a href="/vi/thuat-ngu/ph/x/">x</a> data-href="/vi/thuat-ngu/kh/"')).toEqual([])
})

/** The built pages of one kind (Vietnamese, at the root), each with the terms its text links: [path, slugs]. */
function linking(dir: string): [string, Set<string>][] {
  if (!existsSync(`${DIST}/${dir}`)) return []
  return readdirSync(`${DIST}/${dir}`, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(`${DIST}/${dir}/${d.name}/index.html`)).map(d => {
    const { dom } = page(`/${dir}/${d.name}/`)
    return [`/vi/${dir}/${d.name}/`, new Set(dom.querySelectorAll('main a[href^="/thuat-ngu/"]').flatMap(a => a.getAttribute('href')!.match(/^\/thuat-ngu\/([^/]+)\/$/)?.[1] ?? []))]
  })
}

test('every term page lists, with its count, every built guide, fish and plant page that links the term', async () => {
  const c = await getContent('vi')
  const kinds = { 'huong-dan': linking('huong-dan'), ca: linking('ca'), cay: linking('cay') }
  expect(kinds['huong-dan'].length + kinds.ca.length + kinds.cay.length).toBeGreaterThan(0)
  let shown = 0
  for (const g of c.glossary) {
    const p = glossaryParts('vi', c, g)
    const users = (dir: keyof typeof kinds) => kinds[dir].filter(([, slugs]) => slugs.has(g.t.slug)).map(([path]) => path).sort()
    expect(p.guides.map(x => `/vi/huong-dan/${x.t.slug}/`).sort(), g.id).toEqual(users('huong-dan'))
    expect(p.fish.map(x => x.href).sort(), g.id).toEqual(users('ca'))
    expect(p.plants.map(x => x.href).sort(), g.id).toEqual(users('cay'))
    // The built term page: the whole count, each kind's count, its first pages.
    const { dom } = page(`/thuat-ngu/${g.t.slug}/`)
    const h2 = dom.querySelector('.used h2')
    expect(Number(h2?.textContent.replace(/\D/g, '') ?? 0), g.id).toBe(p.total)
    const lists = dom.querySelectorAll('.used h3').map(h3 => [Number(h3.textContent.match(/\(([\d.]+)\)/)?.[1]?.replace(/\./g, '')), (h3.nextElementSibling?.querySelectorAll('a') ?? []).map(a => a.getAttribute('href'))] as const)
    const want = [
      [p.guides.length, p.guides.slice(0, USED_IN_SHOWN.guides).map(x => `/huong-dan/${x.t.slug}/`)],
      [p.fish.length, p.fish.slice(0, USED_IN_SHOWN.fish).map(x => x.href.replace(/^\/vi/, ''))],
      [p.plants.length, p.plants.slice(0, USED_IN_SHOWN.plants).map(x => x.href.replace(/^\/vi/, ''))],
    ].filter(([n]) => n)
    expect(lists, g.id).toEqual(want)
    shown += p.total
  }
  // The fixture's pages use its terms: the check above compared something.
  expect(shown).toBeGreaterThan(0)
})
