import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { HTMLElement } from 'node-html-parser'
import type { Content, Photo } from '@aq/schema'
import { PageDoc, type Block, type Image, type Inline } from '@aq/schema/app-page'
import { appBreeds, appGlossary, appPlants, appSpecies, headPhoto } from '../src/lib/app-index'
import { appPages, breedDoc, fishDoc, glossaryDoc, listedPaths, plantDoc, sectionBlocks } from '../src/lib/app-page'
import { photoCredit } from '../src/lib/cite'
import { getContent } from '../src/lib/content'
import { smallSrc } from '../src/lib/img'
import { speciesParts } from '../src/lib/species-page'
import { appPath, LANGS, licenceLabel, translator } from '../src/lib/i18n'
import { appHref, appPage, DIST } from './dist'

// The app draws fish, plant and glossary pages from these copies (once the index counts their kinds): what they hold
// must be the page, credits and sources first.
type B<T extends Block['t']> = Extract<Block, { t: T }>
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const text = (c: Inline[] = []) => c.map(r => (typeof r === 'string' ? r : r.text)).join('')
const all = <T extends Block['t']>(d: PageDoc, t: T) => d.blocks.filter((b): b is B<T> => b.t === t)
const one = <T extends Block['t']>(d: PageDoc, t: T) => all(d, t)[0]
const txt = (el: HTMLElement | null | undefined) => clean(el?.textContent ?? '')
/** The keys the page's readers' sections (comments, readers' photos) read theirs by. */
const talk = (dom: HTMLElement) => ({
  comments: dom.querySelector('[data-comments]')?.getAttribute('data-entity'),
  photos: dom.querySelector('[data-reader-photos]')?.getAttribute('data-entity'),
})
const kids = (bs: Block[]): Block[] => bs.flatMap(b => [b, ...(b.t === 'list' ? b.items.flatMap(kids) : [])])
/** Every picture a copy carries, wherever it is: the lead, photos in the text, the gallery, cards, tank mates. */
function images(d: PageDoc): Image[] {
  const out: Image[] = d.lead ? [d.lead] : []
  for (const b of kids(d.blocks)) {
    if (b.t === 'figure') out.push(b.img)
    if (b.t === 'gallery') out.push(...b.photos)
    if (b.t === 'cards') out.push(...b.items.flatMap(i => (i.img ? [i.img] : [])))
    if (b.t === 'mates') out.push(...[...(b.good?.items ?? []), ...(b.avoid?.items ?? [])].flatMap(i => (i.img ? [i.img] : [])))
  }
  return out
}
/** Every run of the text that is a source's numbered mark. */
const marks = (d: PageDoc) => kids(d.blocks).flatMap(b => (b.t === 'p' ? b.c : [])).filter(r => typeof r !== 'string' && /^\d+$/.test(r.text) && r.tip)

/** Every photo the content has, by its own page (what a credit links): to tell which of the footer's the page shows. */
const photosBySource = (c: Content) => {
  const all: Photo[] = [...c.species.flatMap(s => s.photos), ...c.plants.flatMap(p => p.photos), ...c.breeds.flatMap(b => b.photos), ...Object.values(c.galleries).flat()]
  const m = new Map<string, Photo[]>()
  for (const p of all) m.set(p.sourceUrl, [...(m.get(p.sourceUrl) ?? []), p])
  return m
}
let footerChecked = 0
/** What every fish, breed and plant copy owes its page: its pictures credited, the page's credits all there. */
function pictured(d: PageDoc, dom: HTMLElement, bySource: Map<string, Photo[]>, photo = 'Ảnh:') {
  // Every photo's credit (the records' map is credited to its data: wild() holds it to the page).
  for (const img of images(d).filter(i => !isMap(i))) {
    expect(img.credit?.text?.startsWith(`${photo} `) && /^\S/.test(img.credit.text.slice(photo.length + 1)), `${d.path} ${img.src}: ${img.credit?.text}`).toBe(true)
    // Its licence as the page shows it: none named for a photo used with permission (licenceLabel), only its author.
    const record = (bySource.get(img.credit?.url ?? '') ?? []).find(p => p.url === img.src || smallSrc(p) === img.src)
    if (record) expect(img.credit?.licence ?? '', `${d.path} ${img.src}`).toBe(licenceLabel(record.licence))
    else expect(img.credit?.licence, `${d.path} ${img.src}`).toBeTruthy()
    expect(img.credit?.url, `${d.path} ${img.src}`).toBeTruthy()
  }
  // The footer's "Nguồn ảnh" names each photo by its own page: every one the page shows is in the copy, credited. (The
  // footer also credits a photo the text had no room for; the copy doesn't show that one either.)
  const ours = new Set(images(d).map(i => i.credit!.url))
  const shown = new Set(dom.querySelectorAll('img').map(i => i.getAttribute('src')))
  for (const a of dom.querySelectorAll('#photo-credits li a')) {
    const href = a.getAttribute('href')!
    if (!(bySource.get(href) ?? []).some(p => shown.has(p.url) || shown.has(smallSrc(p)))) continue
    footerChecked++
    expect(ours.has(href), `${d.path}: ${href}`).toBe(true)
  }
}
/** What every fish and plant copy owes its page: its pictures credited, the page's credits all there, its sources. */
function credited(d: PageDoc, dom: HTMLElement, bySource: Map<string, Photo[]>) {
  pictured(d, dom, bySource)
  // The numbered sources, as the page lists them, and each mark in the text with its source's card.
  const refs = one(d, 'refs')
  const li = dom.querySelectorAll('.body .refs li')
  expect(refs?.items.map(r => [r.title, r.url]) ?? [], d.path).toEqual(li.map(l => [txt(l.querySelector('a')), l.querySelector('a')!.getAttribute('href')]))
  if (refs) expect(refs.note, d.path).toBe(txt(dom.querySelector('.body .refs .note')))
  expect(marks(d).length, d.path).toBe(dom.querySelectorAll('.body .prose a.cite, .body #muc-range a.cite').length)
  for (const m of marks(d)) expect(typeof m !== 'string' && m.tip?.text, d.path).toMatch(/dịch từ nguồn$/)
  // The sections under their questions, with the ids the page's jump row links.
  // (The sources' reference lists are the source list's, closed, under an h3.)
  expect(all(d, 'h').map(h => [h.id, h.text]), d.path).toEqual(dom.querySelectorAll('.body section[data-section]').map(s => [s.id, txt(s.querySelector('h2, h3'))]))
}

const isMap = (img: Image) => img.src.startsWith('https://aquatome.com/app/range/')
/** A PNG's width and height, from its header. */
const pngSize = (file: string) => { const b = readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

/**
 * "Phân bố tự nhiên" as the page has it: its lines with their links and marks, its sources' sentences, its records in
 * words, and its map as a picture of the same map (the PNG the build made, at its size), with the page's words for it,
 * its legend and its credit. Returns whether the page has it.
 */
function wild(d: PageDoc, dom: HTMLElement): boolean {
  const sec = dom.querySelector('#muc-range')
  const at = d.blocks.findIndex(b => b.t === 'h' && b.id === 'muc-range')
  expect(at >= 0, d.path).toBe(!!sec)
  if (!sec) return false
  const next = d.blocks.findIndex((b, i) => i > at && (b.t === 'h' || b.t === 'refs'))
  const part = d.blocks.slice(at + 1, next < 0 ? undefined : next)
  expect(txt(sec.querySelector('h2')), d.path).toBe((d.blocks[at] as B<'h'>).text)
  const lines = [...sec.querySelectorAll('.words p'), ...sec.querySelectorAll('.said summary'), ...sec.querySelectorAll('.records p')]
  expect(part.filter(b => b.t === 'p').map(b => text((b as B<'p'>).c)), d.path).toEqual(lines.map(txt))
  const runs = part.flatMap(b => (b.t === 'p' ? b.c : b.t === 'list' ? b.items.flat().flatMap(x => (x.t === 'p' ? x.c : [])) : []))
  expect(runs.flatMap(r => (typeof r === 'string' || !r.href ? [] : [r.href])), d.path).toEqual(sec.querySelectorAll('.words a, .said li a').map(a => appHref(a.getAttribute('href')!)))
  const list = part.find((b): b is B<'list'> => b.t === 'list')
  expect(list?.items.map(i => text((i[0] as B<'p'>).c)) ?? [], d.path).toEqual(sec.querySelectorAll('.said li').map(txt))
  const fig = part.find((b): b is B<'figure'> => b.t === 'figure')
  const svg = sec.querySelector('svg.map')
  expect(!!fig, d.path).toBe(!!svg)
  if (!fig || !svg) return true
  expect(isMap(fig.img), d.path).toBe(true)
  expect(fig.img.alt, d.path).toBe(svg.getAttribute('aria-label'))
  const file = `${DIST}${fig.img.src.replace('https://aquatome.com', '')}`
  expect(existsSync(file), file).toBe(true)
  expect(pngSize(file), d.path).toEqual([fig.img.w, fig.img.h])
  // As wide as the page's map, twice its units.
  expect(fig.img.w / fig.img.h, d.path).toBeCloseTo(Number(svg.getAttribute('width')) / Number(svg.getAttribute('height')), 5)
  // The legend in the caption's words, in order; the credit as the page writes it, GBIF linked to the same search.
  const legend = sec.querySelectorAll('.legend li').map(txt)
  const caption = text(fig.caption)
  expect(legend.map(l => caption.indexOf(l)).every((n, i, a) => n >= 0 && (!i || n > a[i - 1]!)), `${d.path}: ${caption}`).toBe(true)
  const credit = txt(sec.querySelector('.credit'))
  expect(credit, d.path).toBe(`${fig.img.credit!.text} · ${fig.img.credit!.licence}. ${caption.slice(caption.lastIndexOf(legend.at(-1)!) + legend.at(-1)!.length).trim()}`)
  expect(fig.img.credit!.url, d.path).toBe(sec.querySelector('.credit a')!.getAttribute('href'))
  return true
}

/**
 * The gallery as the page's strip shows it and its gallery page lists it. The strip's own thumbnails: the further ones a
 * computer's photo column shows (`li.more`) are the gallery's, which the copy carries whole.
 */
function gallery(d: PageDoc, dom: HTMLElement) {
  const g = one(d, 'gallery')
  const strip = dom.querySelectorAll('.strip li:not(.more) img')
  expect(!!g, d.path).toBe(strip.length > 0)
  if (!g) return
  expect(g.title, d.path).toBe(txt(dom.querySelector('#gal-h')))
  expect(g.strip.map(i => g.photos[i]!.thumb ?? g.photos[i]!.src), d.path).toEqual(strip.map(i => i.getAttribute('src')))
  const all = appPage(g.href!).dom
  expect(g.photos.map(p => p.src), d.path).toEqual(all.querySelectorAll('[data-gallery] a').map(a => a.getAttribute('data-full')))
  expect(g.photos.map(p => p.credit!.url), d.path).toEqual(all.querySelectorAll('[data-gallery] a').map(a => a.getAttribute('data-src')))
  // "6 ảnh từ Wikimedia Commons, giấy phép mở.": the gallery page's line, with the count its title gives there, without the
  // scientific name before it or the link after.
  const lead = all.querySelector('.lead')!
  lead.querySelectorAll('.sci, a').forEach(x => x.remove())
  expect(g.note, d.path).toContain(String(g.photos.length))
  expect(g.note.toLowerCase(), d.path).toContain(clean(lead.textContent.replace(/^ ·/, '')).toLowerCase())
}

test('each fish\'s copy reads as its built page: header, credits, sources, card sources, tank mates, climate, gallery, breeds, videos', async () => {
  const c = await getContent('vi')
  const listed = listedPaths('vi', c)
  const bySource = photosBySource(c)
  const fish = appSpecies('vi', c)
  expect(fish.length).toBeGreaterThan(5)
  const seen = new Set<string>()
  const withRange: string[] = []
  for (const s of fish) {
    const d = await fishDoc('vi', c, s, listed)
    expect(PageDoc.safeParse(d).error, d.path).toBeUndefined()
    const { dom } = appPage(d.path)
    d.blocks.forEach(b => seen.add(b.t))
    // The header: name, scientific name, the line above the name, other names, the line under the card, the photo.
    expect(d.title, d.path).toBe(txt(dom.querySelector('h1')))
    // No line under a name that says its scientific name (lib/sci.ts): none in the app's copy either.
    expect(d.sub ?? '', d.path).toBe(txt(dom.querySelector('.binomial')))
    expect(text(d.where), d.path).toBe(txt(dom.querySelector('.where')))
    expect(d.where?.flatMap(r => (typeof r === 'string' || !r.href ? [] : [r.href])), d.path).toEqual(dom.querySelectorAll('.where a').map(a => appHref(a.getAttribute('href')!)))
    expect(d.aka, d.path).toBe(dom.querySelector('.alt') ? txt(dom.querySelector('.alt')) : undefined)
    expect(text(d.credit), d.path).toBe(txt(dom.querySelector('.facts > .srcline')).startsWith('Dịch') ? txt(dom.querySelector('.facts > .srcline')) : '')
    // The head is the page's photo, whole where no frame may fill with it (its box), never left out (the Design Lead, 13 Nov).
    expect(d.lead?.src, d.path).toBe(headPhoto(s.photos)?.url)
    if (d.lead) expect(d.lead.src, d.path).toBe(dom.querySelector('.photo img')?.getAttribute('src'))
    expect(d.talk, d.path).toEqual(talk(dom))
    expect(d.talk?.comments && d.talk.photos, d.path).toBeTruthy()
    if (d.lead) expect(d.lead.credit?.text, d.path).toBe(dom.querySelector('.photo a.cite.pic')!.getAttribute('data-term'))
    credited(d, dom, bySource)
    // "Nguồn và độ tin cậy": every field's sources, each source's own figure where they disagree, and no figure else.
    const trust = one(d, 'trust')
    const rows = dom.querySelectorAll('.datacard .by > div')
    expect(trust?.rows.map(r => [r.field, r.label, !!r.conflict, !!r.marked, r.note, r.items]) ?? [], d.path).toEqual(rows.map(r => [
      r.getAttribute('data-src-field'), txt(r.querySelector('dt')), r.getAttribute('data-conflict') === 'true', !!r.querySelector('dt .mark'), r.querySelector('dd > p') ? txt(r.querySelector('dd > p')) : undefined, r.querySelectorAll('li').map(txt),
    ]))
    // Tank mates: who and why, as the page's chips, and the tool set to this fish.
    const mates = one(d, 'mates')
    const box = dom.querySelector('.mates')
    expect(!!mates, d.path).toBe(!!box)
    if (mates && box) {
      const chips = (sel: string) => box.querySelectorAll(`${sel} li a`).map(a => ({ path: appHref(a.getAttribute('href')!), name: txt(a.querySelector('.nm')?.childNodes[0] as HTMLElement), why: a.querySelector('.why') ? txt(a.querySelector('.why')) : undefined }))
      expect(mates.good?.items.map(m => ({ path: m.path, name: m.name, why: m.why })) ?? [], d.path).toEqual(chips('.row:not(.avoid)'))
      expect(mates.avoid?.items.map(m => ({ path: m.path, name: m.name, why: m.why })) ?? [], d.path).toEqual(chips('.row.avoid'))
      expect(mates.tool.href, d.path).toBe(appHref(box.querySelector('.how a')!.getAttribute('href')!))
      expect(mates.note, d.path).toBe(box.querySelector('.how span') ? txt(box.querySelector('.how span')) : undefined)
    } else {
      const a = dom.querySelector('#muc-behaviour .mates-tool a, .body .mates-tool a')!
      expect(d.blocks.some(b => b.t === 'p' && b.c.some(r => typeof r !== 'string' && r.href === appHref(a.getAttribute('href')!) && r.text === txt(a))), d.path).toBe(true)
    }
    // Vietnam's climate, on Vietnamese pages.
    const vn = one(d, 'climate')
    expect(vn?.items.map(i => `${i.label}: ${i.text}`) ?? [], d.path).toEqual(dom.querySelectorAll('.vn li').map(txt))
    if (vn) expect(vn.note, d.path).toBe(txt(dom.querySelector('.vn .assume')))
    gallery(d, dom)
    if (wild(d, dom)) withRange.push(s.id)
    // A block whose figure is far from the card's says so after it, as on the page: never the first thing under a heading.
    const notes = d.blocks.flatMap((b, i) => (b.t === 'p' && text(b.c).includes(' ghi khác đoạn này:') ? [i] : []))
    expect(notes.map(i => text((d.blocks[i] as B<'p'>).c)), d.path).toEqual(dom.querySelectorAll('.body .off').map(txt))
    for (const i of notes) expect(d.blocks[i - 1]?.t, d.path).not.toBe('h')
    // Breeds as cards, each with its picture's credit; videos; the guides that name it.
    const cards = one(d, 'cards')
    expect(cards?.items.map(i => [i.path, i.name, i.sub, i.img?.src]) ?? [], d.path).toEqual(dom.querySelectorAll('.breeds li').map(l => [appHref(l.querySelector('a')!.getAttribute('href')!), txt(l.querySelector('h3')), txt(l.querySelector('.kind')), l.querySelector('img')?.getAttribute('src')]))
    expect(one(d, 'videos')?.items.map(v => [v.youtubeId, `${v.title}${Math.floor(v.durationSec / 60)}:${String(v.durationSec % 60).padStart(2, '0')}, ${v.lang}`]) ?? [], d.path).toEqual(dom.querySelectorAll('.videos li').map(l => [l.querySelector('button')!.getAttribute('data-youtube-id'), txt(l.querySelector('p'))]))
    const guides = new Set(dom.querySelectorAll('.guides a, .vg a').map(a => appHref(a.getAttribute('href')!)))
    for (const p of all(d, 'pages').flatMap(b => b.paths)) expect(guides.has(p), `${d.path} names ${p}`).toBe(true)
    const summary = one(d, 'summary')
    expect(summary ? [summary.text, ...(summary.mistakes?.items ?? []), summary.by] : [], d.path).toEqual(dom.querySelector('.qs') ? [txt(dom.querySelector('.qs .box > p')), ...dom.querySelectorAll('.qs li').map(txt), txt(dom.querySelector('.qs .by'))] : [])
    // An app that predates `text` shows `items`: the same paragraph.
    if (summary) expect(summary.items, d.path).toEqual([summary.text])
  }
  // The fixture has every new block somewhere, and photos the footer credits.
  for (const t of ['trust', 'mates', 'climate', 'gallery', 'summary', 'cards', 'videos', 'refs', 'pages']) expect(seen.has(t), t).toBe(true)
  expect(footerChecked).toBeGreaterThan(0)
  // The fixture fish with a range have the block, and only they.
  expect(withRange.sort()).toEqual(['neocaridina-davidi', 'paracheirodon-innesi', 'pterophyllum-scalare'])
})

/** A run of blocks as their text reads, spaces aside: to hold a copy's text to its page's. */
const plain = (bs: Block[]): string => bs.map(b => (b.t === 'p' ? text(b.c) : b.t === 'h' ? b.text : b.t === 'list' ? b.items.map(plain).join('') : b.t === 'table' ? [...(b.head ?? []), ...b.rows.flat()].map(text).join('') : '')).join('').replace(/\s+/g, '')
const hrefs = (bs: Block[]) => kids(bs).flatMap(b => (b.t === 'p' ? b.c : b.t === 'table' ? [...(b.head ?? []), ...b.rows.flat()].flat() : [])).flatMap(r => (typeof r === 'string' || !r.href ? [] : [r.href]))

test('each breed\'s copy reads as its built page: header, parents, card sources, gallery, summary, text, lines, questions, guides, sources', async () => {
  const seen = new Set<string>()
  for (const lang of LANGS) {
    const c = await getContent(lang)
    const listed = listedPaths(lang, c)
    const bySource = photosBySource(c)
    const breeds = appBreeds(lang, c)
    if (lang === 'vi') expect(breeds.length).toBeGreaterThan(1)
    for (const b of breeds) {
      const d = breedDoc(lang, c, b, listed)
      expect(PageDoc.safeParse(d).error, d.path).toBeUndefined()
      expect(d.kind, d.path).toBe('fish')
      const { dom } = appPage(d.path)
      d.blocks.forEach(x => seen.add(x.t))
      // The header: what it is (a form of its species, linked), its name, other names, the line under the card, the photo.
      expect(d.title, d.path).toBe(txt(dom.querySelector('h1')))
      expect(d.sub, d.path).toBeUndefined()
      expect(text(d.where), d.path).toBe(txt(dom.querySelector('.where')))
      expect(d.where?.flatMap(r => (typeof r === 'string' || !r.href ? [] : [r.href])), d.path).toEqual(dom.querySelectorAll('.where a').map(a => appHref(a.getAttribute('href')!)))
      expect(d.aka, d.path).toBe(dom.querySelector('.alt') ? txt(dom.querySelector('.alt')) : undefined)
      expect(text(d.credit), d.path).toBe(txt(dom.querySelector('.top .srcline')))
      expect(d.lead?.src, d.path).toBe(dom.querySelector('.top .plate img')?.getAttribute('src'))
      // The photo's mark, or an Unsplash photo's line in view, as the page credits it.
      if (d.lead) expect(d.lead.credit?.text, d.path).toBe(dom.querySelector('.top figcaption a.cite.pic')?.getAttribute('data-term') ?? txt(dom.querySelector('.top figcaption .pic-by')))
      // One discussion with the web page's; readers' photos as the page has them.
      expect(d.talk, d.path).toEqual(talk(dom))
      pictured(d, dom, bySource, translator(lang)('Ảnh:'))
      // A hybrid's parents, each species linked.
      const parents = d.blocks.find(x => x.t === 'p' && text(x.c).startsWith(translator(lang)('Lai từ:'))) as B<'p'> | undefined
      expect(parents ? text(parents.c) : undefined, d.path).toBe(dom.querySelector('.parents') ? txt(dom.querySelector('.parents')) : undefined)
      expect(parents ? hrefs([parents]) : [], d.path).toEqual(dom.querySelectorAll('.parents a').map(a => appHref(a.getAttribute('href')!)))
      // "Nguồn và độ tin cậy", as the card's.
      const trust = one(d, 'trust')
      const rows = dom.querySelectorAll('.datacard .by > div')
      expect(trust?.rows.map(r => [r.field, r.label, !!r.conflict, !!r.marked, r.note, r.items]) ?? [], d.path).toEqual(rows.map(r => [
        r.getAttribute('data-src-field'), txt(r.querySelector('dt')), r.getAttribute('data-conflict') === 'true', !!r.querySelector('dt .mark'), r.querySelector('dd > p') ? txt(r.querySelector('dd > p')) : undefined, r.querySelectorAll('li').map(txt),
      ]))
      // The gallery's strip; its gallery page's photos when it has one.
      const g = one(d, 'gallery')
      const strip = dom.querySelectorAll('.strip li:not(.more) img')
      expect(!!g, d.path).toBe(strip.length > 0)
      if (g?.href) gallery(d, dom)
      else if (g) {
        expect(g.title, d.path).toBe(txt(dom.querySelector('#gal-h')))
        expect(g.strip.map(i => g.photos[i]!.thumb ?? g.photos[i]!.src), d.path).toEqual(strip.map(i => i.getAttribute('src')))
        expect(dom.querySelector('.strip .head a'), d.path).toBeNull()
      }
      // The summary, its text with the pages it names, its lines, the questions.
      const summary = one(d, 'summary')
      expect(summary ? [summary.title, ...summary.items] : [], d.path).toEqual(dom.querySelector('.verdict') ? [txt(dom.querySelector('.verdict h2')), ...dom.querySelectorAll('.verdict p').map(txt)] : [])
      const body = d.blocks.filter(x => ['p', 'h', 'list', 'table', 'figure'].includes(x.t) && x !== parents)
      expect(plain(body), d.path).toBe((dom.querySelector('.prose.body')?.textContent ?? '').replace(/\s+/g, ''))
      expect(hrefs(body), d.path).toEqual(dom.querySelectorAll('.prose.body a').map(a => appHref(a.getAttribute('href')!)))
      const cards = one(d, 'cards')
      expect(cards ? [cards.title, ...cards.items.map(i => [i.path, i.name, i.sub, i.img?.src])] : [], d.path).toEqual(dom.querySelector('.breeds') ? [txt(dom.querySelector('#breeds-h')), ...dom.querySelectorAll('.breeds li').map(l => [appHref(l.querySelector('a')!.getAttribute('href')!), txt(l.querySelector('h3')), txt(l.querySelector('.kind')), l.querySelector('img')?.getAttribute('src')])] : [])
      const faq = one(d, 'faq')
      expect(faq ? [faq.title, ...faq.items.map(f => [f.q, f.a])] : [], d.path).toEqual(dom.querySelector('.faq') ? [txt(dom.querySelector('#faq-h')), ...dom.querySelectorAll('.faq details').map(x => [txt(x.querySelector('summary')), txt(x.querySelector('p'))])] : [])
      // The guides that name it, as the page lists them (those the app index has), and its sources.
      expect(all(d, 'pages').flatMap(x => x.paths), d.path).toEqual(dom.querySelectorAll('.guides a, .vg a').map(a => appHref(a.getAttribute('href')!)).filter(x => listed.has(x)))
      const refs = one(d, 'refs')
      expect(refs ? [refs.title, ...refs.items.map(r => [r.title, r.url])] : [], d.path).toEqual([txt(dom.querySelector('#src-h')), ...dom.querySelectorAll('.sources li').map(l => [txt(l), l.querySelector('a')!.getAttribute('href')])])
    }
  }
  // The fixture has a breed of each part somewhere (its lines: below).
  for (const t of ['p', 'trust', 'gallery', 'summary', 'faq', 'refs']) expect(seen.has(t), t).toBe(true)
})

test('a breed\'s lines are its copy\'s cards, each a form of it; a line\'s copy says what it is a form of, linked', async () => {
  const c = await getContent('vi')
  const pigeon = c.breeds.find(b => b.id === 'pigeon-blood-discus')!
  const line = { ...pigeon, id: 'pigeon-line', basedOn: pigeon.id, photos: [], t: { ...pigeon.t, slug: 'pigeon-line', name: 'Dòng của Pigeon' } }
  const off = { ...c, breeds: [...c.breeds, line] } as Content
  const listed = listedPaths('vi', off)
  expect(one(breedDoc('vi', off, pigeon, listed), 'cards')).toEqual({ t: 'cards', title: 'Các dòng', items: [{ path: '/vi/ca/pigeon-line/', name: 'Dòng của Pigeon', sub: 'Dòng cá cảnh' }] })
  expect(breedDoc('vi', off, line, listed).where).toEqual(['Dòng cá cảnh, dòng của ', { text: 'Cá đĩa Pigeon Blood', href: '/vi/ca/ca-dia-pigeon-blood/' }])
})

test('every link a copy has to a fish, a breed\'s too, opens its copy in the app; the rest are listed pages or the web', async () => {
  const vi = { breeds: new Set<string>(), linked: new Map<string, Set<string>>() }
  for (const lang of LANGS) {
    const c = await getContent(lang)
    const docs = Object.values(await appPages(lang, c)).flat()
    const copies = new Set(docs.map(d => d.path))
    const listed = listedPaths(lang, c)
    const breeds = new Set(appBreeds(lang, c).map(b => appPath(lang, `/vi/ca/${b.t.slug}/`)))
    const linked = new Map<string, Set<string>>()
    for (const d of docs) {
      for (const b of kids(d.blocks)) {
        const runs = [...(b.t === 'p' ? b.c : []), ...(d.where ?? [])].filter((r): r is Exclude<Inline, string> => typeof r !== 'string')
        for (const href of [...runs.flatMap(r => (r.href ? [r.href] : [])), ...(b.t === 'cards' ? b.items.map(i => i.path) : []), ...(b.t === 'pages' ? b.paths : [])]) linked.set(href, (linked.get(href) ?? new Set()).add(d.path))
      }
    }
    const fish = [...linked.keys()].filter(h => h.startsWith(appPath(lang, '/vi/ca/')) && !/\/anh\/$/.test(h) && h !== appPath(lang, '/vi/ca/'))
    for (const h of fish.filter(x => listed.has(x))) expect(copies.has(h), `${lang}: ${[...linked.get(h)!][0]} links ${h}`).toBe(true)
    if (lang === 'vi') Object.assign(vi, { breeds, linked })
  }
  // Both ways in the fixture: the discus's lines to the pigeon blood, the pigeon blood back to the discus.
  expect([...vi.linked.keys()].filter(h => vi.breeds.has(h)).length).toBeGreaterThan(0)
  expect(vi.linked.get('/vi/ca/ca-dia-pigeon-blood/')).toBeDefined()
  expect(vi.linked.get('/vi/ca/ca-dia/')?.has('/vi/ca/ca-dia-pigeon-blood/')).toBe(true)
})

test('a fish\'s other photos go between its sections, each credited, as many as the page has room for', async () => {
  // The fixture's fish have one photo each: two of them with five more.
  const c0 = await getContent('vi')
  const extra = (id: string) => Array.from({ length: 5 }, (_, i) => ({ url: `https://media.aquatome.com/t/${id}-${i}.webp`, width: 1200, height: 800, licence: 'CC BY 4.0', author: `Người chụp ${i}`, sourceUrl: `https://example.org/photo/${id}-${i}` }))
  const c = { ...c0, species: c0.species.map(s => (['paracheirodon-axelrodi', 'boraras-brigittae'].includes(s.id) ? { ...s, photos: [...s.photos, ...extra(s.id)] } : s)) } as Content
  for (const [id, room] of [['paracheirodon-axelrodi', 5], ['boraras-brigittae', 1]] as const) {
    const s = c.species.find(x => x.id === id)!
    const d = await fishDoc('vi', c, s, listedPaths('vi', c))
    const figs = d.blocks.flatMap((b, i) => (b.t === 'figure' ? [{ b, next: d.blocks[i + 1] }] : []))
    // The page spreads them over the gaps between its sections (never after the last one): as many as it has gaps.
    expect(figs.map(f => f.b.img.src), id).toEqual(extra(id).slice(0, room).map(p => p.url))
    for (const { b, next } of figs) {
      expect(b.img.credit, id).toEqual(photoCredit('vi', extra(id).find(p => p.url === b.img.src)!))
      expect(next?.t, id).toBe('h')
    }
  }
})

test('each fish\'s and plant\'s text converts with nothing the app would have to send to the web', async () => {
  const c = await getContent('vi')
  for (const s of appSpecies('vi', c)) {
    const p = await speciesParts('vi', c, s)
    expect(sectionBlocks('vi', c, { sections: p.text.sections, t: p.text.t, self: `species:${s.id}`, selfNames: [s.scientificName, s.t.name, ...s.t.altNames], figures: p.figures.map(photo => ({ photo })), card: s.dataCard, range: { id: s.id, name: s.t.name, range: s.range } }).unknown, s.id).toEqual([])
  }
  for (const x of appPlants('vi', c)) expect(sectionBlocks('vi', c, { sections: x.sections, t: x.t, figures: x.photos.slice(1).map(photo => ({ photo })) }).unknown, x.id).toEqual([])
})

test('a fish\'s copy: its blocks in page order, every one credited and sourced', async () => {
  const c = await getContent('vi')
  const s = c.species.find(x => x.id === 'paracheirodon-axelrodi')!
  const d = await fishDoc('vi', c, s, listedPaths('vi', c))
  expect(d.blocks.map(b => b.t).filter((t, i, a) => t !== a[i - 1])).toEqual(['trust', 'mates', 'climate', 'gallery', 'summary', 'h', 'p', 'list', 'h', 'p', 'h', 'p', 'h', 'p', 'h', 'p', 'h', 'p', 'h', 'p', 'refs', 'pages', 'videos'])
  expect(d).toMatchObject({
    kind: 'fish', path: '/vi/ca/ca-neon-vua/', title: 'Cá neon vua', sub: 'Paracheirodon axelrodi',
    where: ['Characidae, ', { text: 'Brazil', href: '/vi/nguon-goc/south-america/brazil/' }], aka: 'Tên khác: Cardinal tetra',
    credit: ['Dịch và tổng hợp từ Seriously Fish, Aquarium Glaser. Cập nhật 2026-10-28.'],
    lead: { alt: 'Cá neon vua, Paracheirodon axelrodi', credit: { text: 'Ảnh: CHUCAO', licence: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:Cardinal_Paracheirodon_axelrodi_(3).jpg' } },
  })
  // The card's figures are the index's: only who gives them here, and each source's own where they disagree.
  expect(one(d, 'trust')!.rows[0]).toEqual({ field: 'tempC', label: 'Nhiệt độ', conflict: true, note: 'Mỗi nguồn ghi một mức', items: ['Seriously Fish: 24–30°C', 'Aquarium Glaser: 23–27°C'] })
  expect(one(d, 'gallery')).toMatchObject({ title: 'Ảnh Cá neon vua', note: '45 ảnh từ Wikimedia Commons, giấy phép mở.', href: '/vi/ca/ca-neon-vua/anh/' })
  expect(one(d, 'gallery')!.photos[0]).toMatchObject({ credit: { text: 'Ảnh: Tác giả 1', licence: 'CC BY 2.0', url: 'https://commons.wikimedia.org/wiki/File:Neon1.jpg' } })
  expect(one(d, 'summary')).toEqual({ t: 'summary', title: 'Tóm tắt nhanh', text: 'Hợp với bể cộng đồng từ 60 cm, nước mềm và ấm.', items: ['Hợp với bể cộng đồng từ 60 cm, nước mềm và ấm.'], mistakes: { title: 'Lỗi hay gặp', items: ['Thả vài con: nên nuôi đàn từ 8 con trở lên.'] }, by: 'AquaTome tóm tắt từ các nguồn bên dưới.' })
  expect(one(d, 'refs')).toMatchObject({ title: 'Nguồn', id: 'nguon', items: [{ title: 'Seriously Fish', url: 'https://www.seriouslyfish.com/species/paracheirodon-axelrodi' }, { title: 'Aquarium Glaser' }, { title: 'Aquarium Glaser' }] })
  expect(one(d, 'h')).toEqual({ t: 'h', text: 'Thông tin nhanh', id: 'muc-quickFacts' })
  expect(one(d, 'videos')).toEqual({ t: 'videos', title: 'Video', items: [{ youtubeId: 'aaaaaaaaaaa', title: 'Video mẫu: đàn neon vua trong bể thủy sinh', durationSec: 724, lang: 'tiếng Việt' }] })
  const breeds = await fishDoc('vi', c, c.species.find(x => x.id === 'symphysodon-aequifasciatus')!, listedPaths('vi', c))
  expect(one(breeds, 'cards')).toEqual({
    t: 'cards', title: 'Các dòng và cá lai từ Cá đĩa', items: [
      // An Unsplash photo: its line, and its photographer's page for the app to link (lib/unsplash.ts).
      { path: '/vi/ca/ca-dia-pigeon-blood/', name: 'Cá đĩa Pigeon Blood', sub: 'Dòng cá cảnh', img: { src: 'https://images.unsplash.com/photo-1000000000001-pigeonblood1?ixid=fixture&w=480&q=80&fm=jpg&fit=max', w: 1280, h: 960, credit: { text: 'Ảnh: Mai Lin trên Unsplash', licence: 'Unsplash License', url: 'https://unsplash.com/photos/a-red-discus-fish-Pb1Fixture1?utm_source=aquatome&utm_medium=referral', authorUrl: 'https://unsplash.com/@mailin?utm_source=aquatome&utm_medium=referral', author: 'Mai Lin' } } },
      // No photo of it yet: the page shows its card without one, and so does the copy.
      { path: '/vi/ca/ca-la-han/', name: 'Cá La Hán (Flowerhorn)', sub: 'Cá lai' },
    ],
  })
})

test('each plant\'s copy reads as its built page: header, credits, sources, gallery, guides', async () => {
  const c = await getContent('vi')
  const listed = listedPaths('vi', c)
  const plants = appPlants('vi', c)
  const bySource = photosBySource(c)
  expect(plants.length).toBeGreaterThan(2)
  for (const p of plants) {
    const d = plantDoc('vi', c, p, listed)
    expect(PageDoc.safeParse(d).error, d.path).toBeUndefined()
    const { dom } = appPage(d.path)
    expect(d.title, d.path).toBe(txt(dom.querySelector('h1')))
    // No line under a name that says its scientific name (lib/sci.ts): none in the app's copy either.
    expect(d.sub ?? '', d.path).toBe(txt(dom.querySelector('.binomial')))
    expect(d.aka, d.path).toBe(dom.querySelector('.alt') ? txt(dom.querySelector('.alt')) : undefined)
    expect(d.lead?.src, d.path).toBe(dom.querySelector('header .gallery img')?.getAttribute('src'))
    expect(d.talk, d.path).toEqual(talk(dom))
    expect(d.talk?.comments, d.path).toBeTruthy()
    credited(d, dom, bySource)
    gallery(d, dom)
    const guides = new Set(dom.querySelectorAll('.guides a, .vg a').map(a => appHref(a.getAttribute('href')!)))
    for (const x of all(d, 'pages').flatMap(b => b.paths)) expect(guides.has(x), `${d.path} names ${x}`).toBe(true)
  }
  const w = plantDoc('vi', c, c.plants.find(x => x.id === 'cryptocoryne-wendtii')!, listed)
  expect(w.blocks.map(b => b.t)).toEqual(['gallery', 'h', 'p', 'h', 'p', 'refs'])
  expect(one(w, 'gallery')!.photos.every(x => x.credit?.text.startsWith('Ảnh: '))).toBe(true)
})

test('each glossary term\'s copy reads as its built page; one in Indonesian has the Indonesian page\'s path and words', async () => {
  const c = await getContent('vi')
  const listed = listedPaths('vi', c)
  const terms = appGlossary('vi', c)
  expect(terms.length).toBeGreaterThan(2)
  for (const g of terms) {
    const d = glossaryDoc('vi', c, g, listed)
    expect(PageDoc.safeParse(d).error, d.path).toBeUndefined()
    const { dom } = appPage(d.path)
    expect(d.title).toBe(txt(dom.querySelector('h1')))
    // Its other names, its English name, its definition (with the page's links), the link to its material page, in the
    // page's order.
    expect(all(d, 'p').map(b => text(b.c))).toEqual([...['.aka', '.en', '.def', '.material-link'].flatMap(sel => (dom.querySelector(sel) ? [txt(dom.querySelector(sel))] : [])), ...dom.querySelectorAll('.body > p').map(txt)])
    expect(all(d, 'p').flatMap(b => b.c.flatMap(r => (typeof r === 'string' || !r.href ? [] : [r.href]))), d.path).toEqual(
      dom.querySelectorAll('.def a, .material-link a, .body > p a').map(a => appHref(a.getAttribute('href')!)),
    )
    // Its photo, then the fuller entry's headings, then the pages that use it: the heading with the count, then each
    // kind's first pages, those the app index lists. Last, its sources.
    expect(all(d, 'figure').length, d.path).toBe(dom.querySelectorAll('main figure').length)
    expect(all(d, 'h').map(b => b.text), d.path).toEqual(dom.querySelectorAll('.body > h2, .used h2').map(txt))
    expect(one(d, 'refs')?.items.map(r => r.url) ?? [], d.path).toEqual(dom.querySelectorAll('.refs a').map(a => a.getAttribute('href')))
    const kinds = dom.querySelectorAll('.used h3').map(h3 => ({
      t: 'pages', title: txt(h3), paths: (h3.nextElementSibling?.querySelectorAll('a') ?? []).map(a => appHref(a.getAttribute('href')!)).filter(x => listed.has(x)),
    }))
    // The terms to see next first, as on the page.
    const related = { t: 'pages', title: txt(dom.querySelector('.related h2')), paths: dom.querySelectorAll('.related a').map(a => appHref(a.getAttribute('href')!)).filter(x => listed.has(x)) }
    expect(all(d, 'pages'), d.path).toEqual([related, ...kinds].filter(k => k.paths.length))
    // The page's search for the rest of a long list: the app offers to open the page on the web.
    expect(all(d, 'web').length, d.path).toBe(dom.querySelector('.used .more a') ? 1 : 0)
  }
  const ph = glossaryDoc('vi', c, c.glossary.find(x => x.id === 'ph')!, listed)
  expect(ph).toMatchObject({ kind: 'glossary', path: '/vi/thuat-ngu/ph/', title: 'pH' })
  // The fixture has no Indonesian terms: its Vietnamese one, made as the Indonesian page is.
  const id = glossaryDoc('id', c, c.glossary.find(x => x.id === 'ph')!, listed)
  expect(id.path).toBe('/id/istilah/ph/')
  expect(all(id, 'p').some(b => text(b.c).startsWith(translator('id')('Tiếng Anh:')))).toBe(true)
})

test('a fish\'s copy in Indonesian: the Indonesian page\'s paths and links, no Vietnam-only parts', async () => {
  // The fixture has no Indonesian fish: its Vietnamese ones, made as the Indonesian pages are.
  const c = await getContent('vi')
  const listed = listedPaths('id', c)
  for (const s of c.species) {
    const d = await fishDoc('id', c, s, listed)
    expect(PageDoc.safeParse(d).error, s.id).toBeUndefined()
    expect(d.path).toBe(`/id/ikan/${s.t.slug}/`)
    // Its own discussion, as the Indonesian page's (Comments.astro); readers' photos are shared by every language.
    expect(d.talk).toEqual({ comments: `id:species:${s.id}`, photos: `species:${s.id}` })
    expect(d.blocks.some(b => b.t === 'climate' || b.t === 'summary'), s.id).toBe(false)
    const hrefs = JSON.stringify(d).match(/"(href|path)":"[^"]*"/g) ?? []
    for (const h of hrefs) expect(h, `${s.id}: ${h}`).not.toMatch(/"\/vi\//)
    for (const p of all(d, 'pages').flatMap(b => b.paths)) expect(listed.has(p), `${d.path} names ${p}`).toBe(true)
  }
})

test('the fish, breed and plant pages and the app\'s copies are put together by the same code', () => {
  const read = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
  const fish = read('pages/ca/[slug].astro'), plant = read('pages/cay/[slug].astro'), sections = read('components/Sections.astro')
  expect(fish).toContain("from '../../lib/species-page'")
  expect(plant).toContain("from '../../lib/plant-page'")
  expect(sections).toContain("from '../lib/section-parts'")
  const breed = read('pages/ca/[breed].astro')
  expect(breed).toContain("from '../../lib/breed-page'")
  for (const own of ['pagePictures(', 'distinctPhotos(', 'takeEach(', 'companionsOf(', 'approvedSummary(', 'breedsOf(', 'guidesMentioning(']) {
    expect(fish, own).not.toContain(own)
    expect(plant, own).not.toContain(own)
    expect(breed, own).not.toContain(own)
  }
  expect(breed).not.toContain('linkTerms(')
  for (const own of ['linkTerms(', 'withCite(', 'figuresOffCard(', 'dropCardRepeats(']) expect(sections, own).not.toContain(own)
  expect(existsSync(new URL('../src/lib/section-parts.ts', import.meta.url))).toBe(true)
})
