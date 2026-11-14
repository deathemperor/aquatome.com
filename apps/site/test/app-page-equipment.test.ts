import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { HTMLElement } from 'node-html-parser'
import type { Content } from '@aq/schema'
import { PageDoc, type Block, type Inline } from '@aq/schema/app-page'
import { appEquipment, appIndex } from '../src/lib/app-index'
import { equipmentDoc, listedPaths } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { categoriesIn } from '../src/lib/equipment'
import { speciesLists } from '../src/lib/list-data'
import { appPath } from '../src/lib/i18n'
import { PAGE } from '../src/scripts/filter-list'
import { appHref, appPage } from './dist'

// The app draws an equipment page from this copy: what it holds must be the page, its shop links as built.
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const txt = (el: HTMLElement | null | undefined) => clean(el?.textContent ?? '')
// The page sets runs of links apart by CSS, the copy by commas and dots: their words are the same.
const flat = (s: string) => s.replace(/[\s,·]+/g, '')
const text = (c: Inline[]) => c.map(r => (typeof r === 'string' ? r : r.text)).join('')
const links = (c: Inline[]) => c.flatMap(r => (typeof r === 'string' || !r.href ? [] : [[r.text, r.href]]))
const href = (a: HTMLElement) => { const h = a.getAttribute('href')!; return h.startsWith('/go/') ? h : appHref(h) }
const pRow = (el: HTMLElement) => ['p', flat(txt(el)), el.querySelectorAll('a').map(a => [txt(a), href(a)])]

/** The copy's blocks as comparable rows. */
const rows = (blocks: Block[]): unknown[] => blocks.map(b => {
  switch (b.t) {
    case 'h': return ['h', b.text, b.id]
    case 'p': return ['p', flat(text(b.c)), links(b.c)]
    case 'figure': return ['figure', b.img.w, b.img.h, b.img.alt]
    case 'cards': return ['cards', b.title, b.items.map(i => [i.path, i.name, i.sub, i.img?.src])]
    case 'list': return ['list', b.items.map(rows)]
    case 'pages': return ['pages', b.title, b.paths]
    case 'faq': return ['faq', b.title, b.items.map(f => [f.q, f.a])]
    default: throw new Error(`a block the page doesn't have: ${b.t}`)
  }
})

/** The built page as the same rows, in its order. `users`: its whole fish list, past the page's first screen. */
function pageRows(dom: HTMLElement, users: string[], listed: Set<string>): unknown[] {
  const out: unknown[] = []
  const hero = dom.querySelector('.hero')
  if (hero) {
    out.push(['p', flat(txt(hero.querySelector('.lead'))), []])
    for (const p of hero.querySelectorAll('.intro p')) out.push(pRow(p))
  }
  const types = dom.querySelectorAll('.type')
  if (types.length) out.push(['h', txt(dom.querySelector('.typeshead h2')), undefined])
  for (const ty of types) {
    const img = ty.querySelector('.ph img')
    out.push(['h', txt(ty.querySelector('h3')), ty.getAttribute('id')])
    if (img) out.push(['figure', Number(img.getAttribute('width')), Number(img.getAttribute('height')), img.getAttribute('alt')])
    out.push(pRow(ty.querySelector('.body > p')!))
    // The shop's name for a screen reader, beside each search, isn't in the copy: its reader picks no shop.
    for (const hidden of ty.querySelectorAll('.more .visually-hidden')) hidden.remove()
    for (const cls of ['.pick', '.picks', '.buy', '.more']) { const p = ty.querySelector(cls); if (p) out.push(pRow(p)) }
    const who = ty.querySelector('.who')
    if (who) {
      out.push(['cards', who.getAttribute('aria-label'), who.querySelectorAll('a').map(a => [href(a), txt(a), undefined, a.querySelector('img')?.getAttribute('src')])])
      const more = who.querySelector('.n')
      if (more) out.push(['p', flat(txt(more)), []])
    }
  }
  for (const s of dom.querySelectorAll('.two section')) {
    out.push(['h', txt(s.querySelector('h2')), undefined])
    out.push(['list', s.querySelectorAll('li').map(li => [pRow(li)])])
  }
  const creators = dom.querySelector('.creators')
  if (creators) {
    out.push(['h', txt(creators.querySelector('h2')), undefined])
    out.push(['list', creators.querySelectorAll('li').map(li => [pRow(li)])])
  }
  const heads = dom.querySelectorAll('h2.h')
  const headOf = (el: HTMLElement) => txt(heads.findLast(h => h.range[0] < el.range[0]))
  const plants = dom.querySelector('.plants')
  if (plants) {
    out.push(['cards', headOf(plants), plants.querySelectorAll('.pc').map(pc => [href(pc.querySelector('a')!), txt(pc.querySelector('h3')), txt(pc.querySelector('.sci')) || undefined, pc.querySelector('img')?.getAttribute('src')])])
    const more = dom.querySelector('p.list')
    if (more) out.push(pRow(more))
  }
  if (users.length) {
    const shown = dom.querySelectorAll('h2.h').find(h => /^Loài cá cần/.test(txt(h)))!
    out.push(['pages', txt(shown), users.filter(p => listed.has(p))])
  }
  const faq = dom.querySelectorAll('.faq details')
  if (faq.length) out.push(['faq', headOf(dom.querySelector('.faq')!), faq.map(f => [txt(f.querySelector('summary')), txt(f.querySelector('p'))])])
  const guides = dom.querySelector('.guides')
  if (guides) {
    const paths = guides.querySelectorAll('a').map(href).filter(p => listed.has(p))
    if (paths.length) out.push(['pages', headOf(guides), [...new Set(paths)]])
  }
  const all = dom.querySelector('.all')
  if (all) {
    out.push(['h', txt(all.querySelector('summary')), undefined])
    out.push(['list', all.querySelectorAll('.finds a').map(a => [['p', flat(a.childNodes[0]!.textContent), [[clean(a.childNodes[0]!.textContent), href(a)]]]])])
    out.push(['p', flat(txt(all.querySelector('.note'))), []])
  }
  return out
}

test("each equipment category's copy reads as its built page, part for part, its shop links as built", async () => {
  const c = await getContent('vi')
  const listed = listedPaths('vi', c)
  const categories = appEquipment('vi', c)
  expect(categories.length).toBeGreaterThan(1)
  const lists = speciesLists('vi', c)
  for (const u of categories) {
    const d = equipmentDoc('vi', c, u, listed)
    expect(PageDoc.safeParse(d).error, d.path).toBeUndefined()
    const { dom } = appPage(d.path)
    expect(d.title, d.path).toBe(txt(dom.querySelector('h1')))
    const hero = dom.querySelector('.hero')
    expect(d.meta, d.path).toBe(hero ? hero.querySelectorAll('.chips li').map(txt).join(' · ') : undefined)
    expect(d.lead?.src, d.path).toBe(hero?.querySelector('img')?.getAttribute('src'))
    const users = u.category === 'cay-thuy-sinh' ? [] : (lists.get(`thiet-bi/${u.category}`) ?? []).map(s => `/vi/ca/${s.t.slug}/`)
    expect(rows(d.blocks), d.path).toEqual(pageRows(dom, users, listed))
    // No readers' comments or photos on the page: none in the copy.
    expect([d.talk, dom.querySelector('[data-comments], [data-reader-photos]')], d.path).toEqual([undefined, null])
  }
})

test('every picture in the copy is credited, as the page credits it', async () => {
  const c = await getContent('vi')
  const listed = listedPaths('vi', c)
  const walk = (bs: Block[]) => bs.flatMap(b => (b.t === 'figure' ? [b.img] : b.t === 'cards' ? b.items.flatMap(i => (i.img ? [i.img] : [])) : []))
  let seen = 0
  for (const u of appEquipment('vi', c)) {
    const d = equipmentDoc('vi', c, u, listed)
    const credits = new Set(appPage(d.path).dom.querySelectorAll('#photo-credits li a').map(a => a.getAttribute('href')))
    for (const img of [...(d.lead ? [d.lead] : []), ...walk(d.blocks)]) {
      seen++
      expect(img.credit?.text, `${d.path} ${img.src}`).toBeTruthy()
      if (img.credit?.url) expect(credits, `${d.path} ${img.src}`).toContain(img.credit.url)
    }
  }
  expect(seen).toBeGreaterThan(0)
})

test('the shop links are for Vietnam and name Shopee, the note beside them: another language has none, and only its own paths', async () => {
  const c = await getContent('vi')
  const loc = appEquipment('vi', c).find(u => u.category === 'loc')!
  const vi = JSON.stringify(equipmentDoc('vi', c, loc, listedPaths('vi', c)))
  expect(vi).toContain('"href":"/go/shopee/?k=')
  expect(vi).not.toMatch(/\/go\/(lazada|tiki)\//)
  expect(vi).toContain('Liên kết tiếp thị')
  // No equipment guide in the fixture is translated: the Vietnamese one, made as an Indonesian page would be.
  const d = equipmentDoc('id', c, loc, listedPaths('id', c))
  expect(PageDoc.safeParse(d).error).toBeUndefined()
  expect(d.path).toBe(appPath('id', '/vi/thiet-bi/loc/'))
  const id = JSON.stringify(d)
  expect(id).not.toContain('/go/')
  expect(id).not.toContain('"/vi/')
  expect(id).not.toContain('Liên kết tiếp thị')
})

test("the fish a kit needs are one list, however long, of those the index lists", async () => {
  const c0 = await getContent('vi')
  const loc = appEquipment('vi', c0).find(u => u.category === 'loc')!
  const first = c0.species.find(s => s.productSlots.some(x => x.category === 'loc'))!
  const many = Array.from({ length: 1040 }, (_, n) => ({ ...first, id: `${first.id}-${n}`, t: { ...first.t, slug: `${first.t.slug}-${n}` } }))
  const c = { ...c0, species: [...c0.species, ...many] } as Content
  const listed = listedPaths('vi', c)
  const lists = equipmentDoc('vi', c, loc, listed).blocks.filter((b): b is Extract<Block, { t: 'pages' }> => b.t === 'pages' && b.title.startsWith('Loài cá cần'))
  expect(lists).toHaveLength(1)
  expect(lists[0]!.paths.length).toBeGreaterThanOrEqual(1040)
  // A fish the index leaves out isn't on it.
  const shorter = new Set([...listed].filter(p => !p.endsWith(`-${first.t.slug}-0/`) && p !== `/vi/ca/${first.t.slug}-0/`))
  const paths = equipmentDoc('vi', c, loc, shorter).blocks.flatMap(b => (b.t === 'pages' ? b.paths : []))
  expect(paths).not.toContain(`/vi/ca/${first.t.slug}-0/`)
})

// Past what the fixture has: a type with more fish than it names, more plants than the page shows.
test('a type names six fish and says how many more; the plants page links the rest of a long list', async () => {
  const c0 = await getContent('vi')
  const loc = appEquipment('vi', c0).find(u => u.category === 'loc')!
  const species = c0.species.find(s => s.productSlots.some(x => x.category === 'loc'))!
  const fish = Array.from({ length: 9 }, (_, n) => ({ ...species, id: `${species.id}-${n}`, t: { ...species.t, slug: `${species.t.slug}-${n}` } }))
  const c1 = { ...c0, species: [...c0.species, ...fish] } as Content
  const blocks = equipmentDoc('vi', c1, loc, listedPaths('vi', c1)).blocks
  const at = blocks.findIndex(b => b.t === 'cards' && b.items.length === 6)
  expect(at).toBeGreaterThan(-1)
  expect(blocks[at + 1]).toMatchObject({ t: 'p', c: [expect.stringMatching(/^\+\d+ loài$/)] })

  const plants = appEquipment('vi', c0).find(u => u.category === 'cay-thuy-sinh')!
  const plant = c0.plants[0]!
  const many = Array.from({ length: PAGE + 1 }, (_, n) => ({ ...plant, id: `${plant.id}-${n}`, t: { ...plant.t, slug: `${plant.t.slug}-${n}` } }))
  const c2 = { ...c0, plants: many } as Content
  const more = (lang: 'vi' | 'id') => equipmentDoc(lang, c2, plants, listedPaths(lang, c2)).blocks.flatMap(b => (b.t === 'p' ? links(b.c) : []))
  expect(more('vi')).toContainEqual([`Xem cả ${many.length} loài cây`, '/vi/cay/'])
  expect(more('id').map(([, h]) => h)).toContain(appPath('id', '/vi/cay/'))
})

// Whatever the guide's text holds, nothing in the copy is left for the web.
test('no part of a copy is sent to the web', async () => {
  const c = await getContent('vi')
  for (const u of appEquipment('vi', c)) expect(JSON.stringify(equipmentDoc('vi', c, u, listedPaths('vi', c))), u.category).not.toContain('"t":"web"')
})

test('the index lists each category as its page names it, with its small picture', async () => {
  const c = await getContent('vi')
  const items = appIndex('vi', c).items.filter(i => i.kind === 'equipment')
  expect(items.map(i => i.path)).toEqual(categoriesIn('vi', c).map(u => `/vi/thiet-bi/${u.category}/`))
  for (const i of items) {
    const { dom } = appPage(i.path)
    expect(i.name, i.path).toBe(txt(dom.querySelector('h1')))
    expect(i.img, i.path).toBe(c.equipment.find(e => `/vi/thiet-bi/${e.category}/` === i.path)?.hero.thumb)
  }
  // Each one has its copy, so an app that draws the kind opens none on the web.
  const docs = new Set(categoriesIn('vi', c).map(u => equipmentDoc('vi', c, u, listedPaths('vi', c)).path))
  for (const i of items) expect(docs, i.path).toContain(i.path)
})

test("the equipment page and the app's copy are put together by the same code", () => {
  const astro = readFileSync(new URL('../src/pages/thiet-bi/[category].astro', import.meta.url), 'utf8')
  expect(astro).toContain("from '../../lib/equipment-page'")
  for (const own of ['kitPictures(', 'creatorsUse(', 'guidesMentioning(', 'linkTerms(', 'goLink(', 'speciesLists(', 'productHref(']) expect(astro, own).not.toContain(own)
})
