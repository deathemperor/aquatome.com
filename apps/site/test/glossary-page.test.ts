import { existsSync, readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { GlossaryEntity, Localized } from '@aq/schema'
import { getContent } from '../src/lib/content'
import { glossaryParts, linkedTermPaths, nameCount, termTitle, USED_IN_SHOWN } from '../src/lib/glossary-page'
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

// On the real site pH's "Used in" led with "Phosphat trong bể san hô": its guides were ranked by "ph" inside other words.
test('the guides that explain a term are found by its names as whole words, in any case', () => {
  const ph = nameCount(['ph'])
  expect(['Phosphat trong bể san hô', 'Cách tự làm viên phân nền', 'Lắp phông nền 3D'].map(ph)).toEqual([0, 0, 0])
  expect(['pH, GH, KH trong bể cá là gì', 'Hướng dẫn về pH và GH', 'PH thấp (pH 6)'].map(ph)).toEqual([1, 1, 2])
  expect(nameCount(['chu trình nitơ', 'cycle bể'])('Cách cycle bể. Chu trình nitơ là… (chu trình nitơ)')).toBe(3)
  expect(nameCount(['chiều dài chuẩn (sl)'])('chiều dài chuẩn (SL) là')).toBe(1)
})

test('a fuller entry: its sections under plain headings, a term linked once across the meaning and the text, the terms to see next, its sources', async () => {
  const c = await getContent('vi')
  const cycle = c.glossary.find(x => x.id === 'chu-trinh-nito')!
  const refs = [{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS' }]
  const p = glossaryParts('vi', c, { ...term(cycle, { definition: 'Vi khuẩn đổi amoniac, nên pH quan trọng.', body: '<h3>Nên làm gì</h3><p>Đo pH mỗi tuần, đo GH khi thay nước.</p>' }), related: ['ph', 'nope', 'gh'], refs })
  expect(p.body).toContain('<h2>Nên làm gì</h2>')
  // pH is linked in the meaning, so not again in the text; GH is first named in the text.
  expect(p.definition).toContain('/vi/thuat-ngu/ph/')
  expect(p.body).not.toContain('/vi/thuat-ngu/ph/')
  expect(p.body).toContain('/vi/thuat-ngu/gh/')
  expect(p.related.map(x => x.id)).toEqual(['ph', 'gh'])
  expect(p.refs).toEqual(refs)
  // A term with no fuller entry has none of these.
  expect(glossaryParts('vi', c, c.glossary.find(x => x.id === 'gh')!)).toMatchObject({ body: '', related: [], refs: [] })
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

// The built page of a term with a fuller entry (the fixture's "cá đàn"): its photo with its credit, its text under
// headings, the terms to see next (one the content doesn't have is left out) and its sources, each a tap target.
test('a term with a fuller entry shows its photo, its text under headings, the terms to see next and its sources', () => {
  const { dom } = page('/thuat-ngu/ca-dan/')
  const fig = dom.querySelector('main figure')
  expect(fig?.querySelector('img')?.getAttribute('src')).toContain('Danio_Margaritatus')
  expect(fig?.querySelector('figcaption')?.textContent).toContain('Cá trân châu đực')
  expect(dom.querySelectorAll('.body h2').map(h => h.textContent.trim())).toEqual(['Trong bể của bạn', 'Các loại'])
  expect(dom.querySelector('.body a[href="/thuat-ngu/ph/"]')).toBeTruthy()
  expect(dom.querySelectorAll('.related a').map(a => a.getAttribute('href'))).toEqual(['/thuat-ngu/chu-trinh-nito/', '/thuat-ngu/ph/'])
  expect(dom.querySelectorAll('.refs a').map(a => a.getAttribute('href'))).toEqual(['https://www.seriouslyfish.com/glossary/shoal'])
})
