import { fitsCard, linkTerms, stillShown, THUMB_WIDTH, thumbOf, type Content, type LinkTarget, type Localized, type GuideEntity, type Photo, type PlantEntity, type SpeciesEntity, type BreedEntity } from '@aq/schema'
import { categoriesIn } from './equipment'
import { GROUP_LABELS } from './format'
import { taxonHref } from './taxa-places'
import picks from './guide-heads-picks.json' with { type: 'json' }
import frames from './guide-frames.json' with { type: 'json' }

/** Words in guide text that mean an equipment category (only categories that have a page are linked). */
const EQUIPMENT_TERMS: Record<string, string[]> = {
  loc: ['bộ lọc', 'máy lọc', 'lọc thùng', 'lọc treo', 'lọc vi sinh', 'lọc sủi', 'lọc'],
  suoi: ['máy sưởi', 'cây sưởi', 'sưởi'],
  den: ['đèn thủy sinh', 'đèn LED', 'đèn'],
  'thuc-an': ['thức ăn'],
  'phan-nen': ['phân nền', 'đất nền'],
  co2: ['CO2', 'CO₂'],
  'test-nuoc': ['bộ test', 'test nước', 'bộ kiểm tra nước'],
}

/** How Vietnamese text names a species group (only groups with a page are linked). */
const GROUP_TERMS: Record<string, string[]> = {
  tetras: ['cá tetra'], cichlids: ['cichlid', 'cá cichlid'], danios: ['cá danio'], rasboras: ['cá rasbora'], shrimp: ['tép cảnh'],
  loaches: ['cá chạch'], catfish: ['cá da trơn'], labyrinth: ['cá mê cung'],
}
/** Vietnamese names for places stored under their English name. */
const PLACE_VI: Record<string, string[]> = {
  vietnam: ['Việt Nam'], thailand: ['Thái Lan'], china: ['Trung Quốc'], laos: ['Lào'], cambodia: ['Campuchia'], myanmar: ['Myanmar', 'Miến Điện'],
  india: ['Ấn Độ'], 'sri-lanka': ['Sri Lanka'], malaysia: ['Malaysia', 'Mã Lai'], indonesia: ['Indonesia'], philippines: ['Philippines'],
  japan: ['Nhật Bản'], 'south-korea': ['Hàn Quốc'], taiwan: ['Đài Loan'], singapore: ['Singapore'], nepal: ['Nepal'], bangladesh: ['Bangladesh'],
  pakistan: ['Pakistan'], brazil: ['Brazil', 'Braxin'], peru: ['Peru'], colombia: ['Colombia'], venezuela: ['Venezuela'], ecuador: ['Ecuador'],
  bolivia: ['Bolivia'], paraguay: ['Paraguay'], argentina: ['Argentina'], guyana: ['Guyana'], suriname: ['Suriname'], mexico: ['Mexico'],
  'united-states': ['Hoa Kỳ', 'nước Mỹ'], australia: ['Úc', 'Australia'], 'papua-new-guinea': ['Papua New Guinea'], cameroon: ['Cameroon'],
  'democratic-republic-of-the-congo': ['Cộng hòa Dân chủ Congo', 'CHDC Congo'], nigeria: ['Nigeria'], tanzania: ['Tanzania'], malawi: ['Malawi'],
  germany: ['Đức'], russia: ['Nga'], borneo: ['Borneo'], sumatra: ['Sumatra'], java: ['đảo Java'], sulawesi: ['Sulawesi'],
  asia: ['châu Á', 'Đông Nam Á'], africa: ['châu Phi'], 'south-america': ['Nam Mỹ'], 'north-america': ['Bắc Mỹ'], europe: ['châu Âu'],
  oceania: ['châu Đại Dương'], 'central-america': ['Trung Mỹ'], mekong: ['sông Mê Kông', 'Mê Kông', 'Mekong'], 'red-river': ['sông Hồng'],
}
/** Place names that are also ordinary words or too short to link safely (English; Indonesian: "tapi" but, "perak" silver). */
const PLACE_STOP = new Set(['Kong', 'Tone', 'Meta', 'Negro', 'Nan', 'Han', 'Chad', 'Java', 'Jordan', 'Guinea', 'Turkey', 'Tak', 'Yom', 'Tapi', 'Perak', 'Golok'])

const multiWord = (n: string) => n.trim().split(/\s+/).length >= 2 // single words ("cá", "betta") are too generic to link
/** Group names ("cá neon", "cá chạch suối") begin several other species' names: linking them would point a group at one species. */
const specific = (all: string[]) => {
  const lower = [...new Set(all.map(n => n.toLowerCase()))]
  // `own`: the page's own names ("Cá hồng két King Kong" is a line on the Cá hồng két page, not another fish).
  return (n: string, own: string[] = []) => lower.filter(o => o.startsWith(`${n.toLowerCase()} `) && !own.some(x => x.toLowerCase() === o)).length < 2
}

/** How many times this process has walked every name to build the link list. The app's pages do that once a language. */
let linkListBuilds = 0
export const linkListsBuilt = (): number => linkListBuilds

export function linkTargets(c: Content): LinkTarget[] {
  linkListBuilds++
  const out: LinkTarget[] = []
  const ok = specific([...c.species, ...c.plants].flatMap(x => [x.scientificName, x.t.name, ...x.t.altNames]).concat(c.plants.flatMap(p => p.synonyms ?? []), c.breeds.flatMap(b => [b.t.name, ...b.t.altNames])))
  // A man-made fish before the species: "cá vàng Ranchu" is the Ranchu page, not the goldfish one.
  for (const b of c.breeds) {
    const names = [b.t.name, b.t.name.replace(/\s*\(.*\)\s*$/, ''), ...b.t.altNames]
    out.push({ key: `breed:${b.id}`, href: `/vi/ca/${b.t.slug}/`, names: names.filter(n => multiWord(n) && ok(n, names)) })
  }
  // A name shared by several pages (a species and its shop colour varieties) goes to the fullest page: richest first.
  const size = (x: { t: { sections: Record<string, string> } }) => Object.values(x.t.sections).join('').length
  for (const s of [...c.species].sort((a, b) => size(b) - size(a))) out.push({ key: `species:${s.id}`, href: `/vi/ca/${s.t.slug}/`, names: [s.scientificName, s.t.name, ...s.t.altNames].filter(n => multiWord(n) && ok(n)) })
  // A plant's former scientific names are its own: "Rêu java (Vesicularia dubyana)" is the Java moss page.
  // Its scientific name names its genus to the linker: a plant in brackets without a page here unlinks the name before it.
  for (const p of c.plants) out.push({ key: `plant:${p.id}`, href: `/vi/cay/${p.t.slug}/`, names: [p.scientificName, ...(p.synonyms ?? []), p.t.name, ...p.t.altNames].filter(n => multiWord(n) && ok(n)), sci: p.scientificName })
  const taxa = new Map<string, LinkTarget>()
  for (const s of c.species) {
    const genus = taxonHref(s, 3), family = taxonHref(s, 2)
    if (genus) taxa.set(`genus:${s.genus}`, { key: `genus:${s.genus}`, href: genus, names: [s.genus], exact: true })
    if (family) taxa.set(`family:${s.family}`, { key: `family:${s.family}`, href: family, names: [s.family], exact: true })
  }
  out.push(...taxa.values())
  // Glossary before equipment: "CO2" explains the term rather than selling the kit.
  for (const g of c.glossary) out.push({ key: `glossary:${g.id}`, href: `/vi/thuat-ngu/${g.t.slug}/`, names: [g.t.name, ...g.t.altNames], cls: 'gl', ...(g.t.definition ? { tip: { term: g.t.name, text: g.t.definition } } : {}) })
  const groups = new Set(c.species.map(s => s.group))
  for (const [g, names] of Object.entries(GROUP_TERMS)) if (groups.has(g) && GROUP_LABELS[g]) out.push({ key: `group:${g}`, href: `/vi/nhom/${g}/`, names })
  // Continents and countries have pages; a region or river links to the country it lies in.
  const placeById = new Map(c.places.map(p => [p.id, p]))
  const pageOf = (p: (typeof c.places)[number] | undefined): string | undefined =>
    !p ? undefined : p.kind === 'continent' ? `/vi/nguon-goc/${p.id}/` : p.kind === 'country' && p.parent ? `/vi/nguon-goc/${p.parent}/${p.id}/` : pageOf(p.parent ? placeById.get(p.parent) : undefined)
  for (const p of c.places) {
    const href = pageOf(p)
    if (!href) continue
    // Its Vietnamese name and the English one it was stored under (short ones like "Anh", "Áo" are ordinary words).
    const own = [p.t.name, ...p.t.altNames].filter(n => n.length >= 4 && !PLACE_STOP.has(n))
    const names = [...own, ...(PLACE_VI[p.id] ?? [])]
    if (names.length) out.push({ key: `place:${p.id}`, href, names, exact: true })
  }
  // A kind of kit is linked where this language builds a page for it (equipment.ts categoriesIn): every kind in
  // Vietnamese, elsewhere those whose guide it has. A guide not translated yet, or held back while its pictures wait for
  // the watermark screen, has no page there, and the link would lead nowhere. The chips under a guide come from these
  // links, so they follow.
  for (const u of categoriesIn(c.lang ?? 'vi', c)) if (EQUIPMENT_TERMS[u.category]) out.push({ key: `equipment:${u.category}`, href: `/vi/thiet-bi/${u.category}/`, names: EQUIPMENT_TERMS[u.category]! })
  return out
}

export type GuideLinks = { html: string; keys: string[]; species: Localized<SpeciesEntity>[]; plants: Localized<PlantEntity>[]; equipment: string[] }
type Index = { targets: LinkTarget[]; guides: Map<string, GuideLinks> }
const memo = new WeakMap<Content, Index>()

/** Every guide's body with species, plants, taxa and equipment linked (first mention each), built once per content load. */
export function mentionIndex(c: Content): Index {
  const hit = memo.get(c)
  if (hit) return hit
  const targets = linkTargets(c)
  const species = new Map(c.species.map(s => [`species:${s.id}`, s]))
  const plants = new Map(c.plants.map(p => [`plant:${p.id}`, p]))
  const breeds = new Set(c.breeds.map(b => b.id))
  const guides = new Map<string, GuideLinks>()
  for (const g of c.guides) {
    const { html, keys: named } = linkTerms(g.t.body ?? '', targets, 'ml')
    // Plus what a video shows (engine video-items), and the breeds the engine found named, even when no link was made.
    const shown = g.mentions.flatMap(id => (species.has(`species:${id}`) ? [`species:${id}`] : plants.has(`plant:${id}`) ? [`plant:${id}`] : breeds.has(id) ? [`breed:${id}`] : []))
    const keys = [...new Set([...named, ...shown])]
    guides.set(g.id, {
      html, keys,
      species: keys.flatMap(k => species.get(k) ?? []),
      plants: keys.flatMap(k => plants.get(k) ?? []),
      equipment: keys.filter(k => k.startsWith('equipment:')).map(k => k.slice('equipment:'.length)),
    })
  }
  const index = { targets, guides }
  memo.set(c, index)
  return index
}

/** Guides that mention a target (e.g. "species:betta-splendens", "equipment:loc"), most recently updated first. */
export const guidesMentioning = (c: Content, key: string): Localized<GuideEntity>[] =>
  c.guides.filter(g => mentionIndex(c).guides.get(g.id)?.keys.includes(key)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

/** Words only, lower case, spaced at both ends; a vowel sign or tone mark stays with its letter (Thai: ปลาหางนกยูง). */
const words = (s: string) => ` ${s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()} `
/** A name without its class word ("Ikan cupang", "Cá boraras đỏ"), as a title lists fish: "cupang, guppy, molly". */
const bare = (n: string) => n.replace(/^\s*(cá|ikan)\s+/iu, '')
type Named = Localized<SpeciesEntity> | Localized<PlantEntity> | Localized<BreedEntity>
/** A name without a gloss in brackets after it: "Cá La Hán (Flowerhorn)" is "Cá La Hán". */
const unglossed = (n: string) => n.replace(/\s*\([^)]*\)\s*$/u, '')
const ownNames = (x: Named) => [x.t.name, 'scientificName' in x ? x.scientificName : undefined, ...x.t.altNames].filter((n): n is string => !!n)
/**
 * Every fish's, plant's and breed's names in this language, each with the pages that hold it (a name two pages hold
 * names neither), and the pages holding it only without its class word ("Cá boraras đỏ" as "boraras đỏ", where at least
 * four letters remain): a title lists fish that way, but "đuôi kiếm" in "Cá bảy màu đuôi kiếm đôi" is a guppy's tail.
 */
type Held = { held: Map<string, Set<Named>>; bareOnly: Map<string, Set<Named>> }
const holders = new WeakMap<Content, Held>()
function namesHeld(c: Content): Held {
  const hit = holders.get(c)
  if (hit) return hit
  const held = new Map<string, Set<Named>>(), full = new Map<string, Set<Named>>(), bareOnly = new Map<string, Set<Named>>()
  const fished = new Map<string, Set<Named>>()
  const add = (m: Map<string, Set<Named>>, k: string, x: Named) => { if (k) m.set(k, (m.get(k) ?? new Set()).add(x)) }
  // Indonesian and Malay titles put the word for fish before a name without it: "Ikan Discus" is the page "Discus".
  const fish = c.lang === 'id' || c.lang === 'ms' ? 'ikan' : undefined
  for (const x of [...c.species, ...c.plants, ...c.breeds]) for (const n of ownNames(x).flatMap(n => [...new Set([n, unglossed(n)])])) {
    const k = words(n).trim(), b = words(bare(n)).trim()
    add(held, k, x); add(full, k, x)
    if (fish && b === k) add(fished, words(`${fish} ${n}`).trim(), x)
    if (b !== k && b.length >= 4) add(held, b, x)
  }
  // Unless a page has it as its own name: Malay's "Ikan Discus" stays that page, not also the page "Discus" (Grok's read).
  for (const [k, xs] of fished) if (!held.has(k)) for (const x of xs) { add(held, k, x); add(full, k, x) }
  for (const [k, xs] of held) for (const x of xs) if (!full.get(k)?.has(x)) add(bareOnly, k, x)
  const out = { held, bareOnly }
  holders.set(c, out)
  return out
}
/** Names written in Thai, which sets no space between words: found anywhere in a title. */
const thaiNames = new WeakMap<Content, [string, Set<Named>][]>()
const titleMemo = new WeakMap<Content, Map<string, Named[]>>()
/**
 * The fish, plants and breeds a guide's title names, in the title's order. A name stands there as whole words (in Thai,
 * anywhere), maybe without a gloss in brackets after it ("Cá La Hán"), and a name only one page holds names that page,
 * whether or not the text links it: "Cá đĩa đi phân trắng…" names the discus, which "Cá đĩa" in the text didn't link,
 * as other pages' names begin with it. A name two pages hold names neither ("Discus"). A one-word name ("Neon"), every
 * Thai name (Thai runs words together) and a name without its class word count only for what the text names: a lamp's
 * "đèn neon" isn't the neon tetra, nor the flowerhorn "ปลาหมอฟลาวเวอร์ฮอร์น" the climbing perch "ปลาหมอ". Of two names
 * at one place only the longer counts, as the more particular: "Cá đĩa Heckel" isn't the discus "Cá đĩa", and "Cá vàng
 * Ranchu" is the Ranchu breed, not the goldfish.
 */
export function titleNames(c: Content, g: Localized<GuideEntity>): Named[] {
  let memo = titleMemo.get(c)
  if (!memo) titleMemo.set(c, (memo = new Map()))
  const hit = memo.get(g.id)
  if (hit) return hit
  const { held, bareOnly } = namesHeld(c)
  let thai = thaiNames.get(c)
  if (!thai) thaiNames.set(c, (thai = [...held].filter(([k]) => /\p{Script=Thai}/u.test(k))))
  const m = mentionIndex(c).guides.get(g.id)
  const talked = new Set<Named>([...(m?.species ?? []), ...(m?.plants ?? []), ...c.breeds.filter(b => m?.keys.includes(`breed:${b.id}`))])
  const best = new Map<Named, { at: number; len: number }>()
  const consider = (core: string, at: number, xs: Set<Named> | undefined) => {
    if (xs?.size !== 1) return
    const x = [...xs][0]!
    if ((!core.includes(' ') || bareOnly.get(core)?.has(x)) && !talked.has(x)) return
    const b = best.get(x)
    if (!b || at < b.at || (at === b.at && core.length > b.len)) best.set(x, { at, len: core.length })
  }
  const t = words(g.t.name)
  const toks = t.trim().split(' ').filter(Boolean)
  const spans: { at: number; core: string; xs: Set<Named> }[] = []
  for (let i = 0, at = 1; i < toks.length; at += toks[i]!.length + 1, i++) {
    for (let j = i + 1; j <= Math.min(toks.length, i + 8); j++) {
      const core = toks.slice(i, j).join(' ')
      const xs = held.get(core)
      if (xs) spans.push({ at, core, xs })
    }
  }
  for (const [core, xs] of thai) { const at = t.indexOf(core); if (at >= 0) spans.push({ at, core, xs }) }
  // A name inside a longer one names nothing of its own: "cá hồng nhung bạc" isn't "cá hồng nhung", "cá rô phi" isn't "cá rô".
  const inside = (s: (typeof spans)[number]) =>
    spans.some(o => o.core.length > s.core.length && o.at <= s.at && s.at + s.core.length <= o.at + o.core.length)
  for (const s of spans) if (!inside(s)) consider(s.core, s.at, s.xs)
  const out = [...best.keys()].sort((a, b) => best.get(a)!.at - best.get(b)!.at || best.get(b)!.len - best.get(a)!.len)
  memo.set(g.id, out)
  return out
}

/**
 * A guide's possible pictures, best first: its own photos, the open-licence photos its video's sections show, then the
 * first photo of each fish, plant and breed its title names (titleNames), in the title's order. Nothing else: a guide borrows
 * no fish its title doesn't name, and one whose title names none, or only fish with no photo, starts at its title (the
 * chief of staff, 15 Nov, after the discus guide opened on an oscar its text names in passing; before that, on 13 Nov, a
 * guppy guide on a water louse). A guide picked by hand (guide-heads-picks.json, by its id, so in every language)
 * borrows that page instead, or nothing (null): one whose title names an animal it isn't about borrows nothing until its
 * page is right, as the owner was told a guide picturing the wrong animal shows no photo, and the name goes to Writing as
 * a naming fault ("cá rô phi lùn", the tilapia, for a dwarf cichlid). In every language a guide borrows what its pick
 * or its Vietnamese title names (heads), so a translation that names its fish otherwise ("Ikan Discus",
 * "ปลาปอมปาดัวร์ขี้ขาว") shows the same picture. Never the video's thumbnail: it shows the people in the video, and a page's
 * photos show none (PRODUCT.md). A card takes the first one its page doesn't show yet (lib/pictures.ts).
 */
export function guideImages(c: Content, g: Localized<GuideEntity>): Photo[] {
  // A section's photo can be a strip (a lamp, a tank's length) that a card's 16:9 would crop to a sliver.
  const sections = (g.video?.figures ?? []).flatMap(f => f.photo ?? []).filter(fitsCard)
  const frame = framePicked(g)
  if (frame.length) return frame
  return [...g.photos, ...sections, ...heads(c, g).flatMap(x => x.photos[0] ?? [])].filter(p => !p.generated)
}
/**
 * A video guide's picture picked by hand from its own video (guide-frames.json: the guide's id → the second of one of its
 * sections' stills, so in every language), and its only one: its card, the app's poster, and its series' card where it
 * comes first. A page that already shows it gives the guide's card no picture rather than a stock photo (lib/pictures.ts).
 * For a guide whose stock photos show something that isn't the video's own (the owner, 16 Nov: an office ceiling light on
 * a coffee-table tank's series); the sections keep theirs. Credited to the channel, as the video's thumbnail is
 * (videoPhoto). Only a still the stills' own bar shows (stillShown: no one in it, sharp, large enough), so a pick never puts a
 * person on a card. None where the guide has no such still at that second, and then the usual pictures. Cards load its
 * 480 px copy, as the stills' grid does (lib/video.ts).
 */
const FRAMES = new Map<string, number>(Object.entries(frames as Record<string, number>))
function framePicked(g: Localized<GuideEntity>): Photo[] {
  const t = FRAMES.get(g.id), v = g.video
  const m = t === undefined || !v ? undefined : (v.figures ?? []).flatMap(f => f.moments).find(x => x.t === t)
  if (!v || !m || !stillShown(m)) return []
  const thumb = m.width > THUMB_WIDTH ? thumbOf(m.url) : undefined
  return [{ url: m.url, ...(thumb ? { thumb } : {}), width: m.width, height: m.height, licence: 'YouTube', author: v.channel, sourceUrl: `https://www.youtube.com/watch?v=${v.youtubeId}&t=${t}s`, source: 'youtube', caption: m.caption }]
}
/**
 * The pages a guide borrows its head from, chosen once for every language (the chief of staff, 15 Nov 2026): Curation's
 * pick, else what the Vietnamese title names, as this language's page of each; nothing where this language has no page
 * for the Vietnamese head's. A guide the Vietnamese doesn't have, or content with no Vietnamese beside it (withVietnameseHeads), reads its own
 * title.
 */
function heads(c: Content, g: Localized<GuideEntity>): Named[] {
  const pick = PICKS.get(g.id)
  if (pick !== undefined) return pick ? [picked(c, pick)].filter(x => !!x) : []
  const vi = VIETNAMESE.get(c), vg = vi && guideOf(vi, g.id)
  if (!vi || !vg) return titleNames(c, g)
  const here = titleNames(vi, vg).filter(x => x.photos[0] && !x.photos[0].generated).map(x => picked(c, refOf(vi, x)))
  // The Vietnamese head's page missing here: none, not the next page, so no language shows another fish.
  return here[0] ? here.filter(x => !!x) : []
}
/** The Vietnamese content beside each other language's, whose titles choose every language's heads. */
const VIETNAMESE = new WeakMap<Content, Content>()
export function withVietnameseHeads(c: Content, vi: Content): Content {
  if (c !== vi) VIETNAMESE.set(c, vi)
  return c
}
const guidesById = new WeakMap<Content, Map<string, Localized<GuideEntity>>>()
function guideOf(c: Content, id: string) {
  let m = guidesById.get(c)
  if (!m) guidesById.set(c, (m = new Map(c.guides.map(g => [g.id, g]))))
  return m.get(id)
}
/**
 * The guides whose title in this language names a page the Vietnamese title doesn't: a translation fault, for Writing,
 * or the Vietnamese title's ("cá dĩa" for the page "Cá đĩa") (scripts/guide-head-titles.ts). A title naming fewer is no
 * fault (Thai runs words together); its head is the Vietnamese one's all the same.
 */
export function titleFaults(c: Content): { id: string; title: string; vi: string[]; own: string[] }[] {
  const vi = VIETNAMESE.get(c)
  if (!vi) return []
  return c.guides.flatMap(g => {
    const vg = guideOf(vi, g.id)
    if (!vg) return []
    const own = titleNames(c, g).map(x => refOf(c, x)), want = titleNames(vi, vg).map(x => refOf(vi, x))
    return own.some(r => !want.includes(r)) ? [{ id: g.id, title: g.t.name, vi: want, own }] : []
  })
}
const PICKS = new Map<string, string | null>(Object.entries(picks as Record<string, string | null>))
/** A page picked by hand, as "species/<id>", "plant/<id>" or "breed/<id>", in this language; none if it has no page here. */
const pages = new WeakMap<Content, Map<string, Named>>()
const refs = new WeakMap<Content, Map<Named, string>>()
function picked(c: Content, ref: string): Named | undefined {
  let m = pages.get(c)
  if (!m) pages.set(c, (m = new Map<string, Named>([...c.species.map(x => [`species/${x.id}`, x] as const), ...c.plants.map(x => [`plant/${x.id}`, x] as const), ...c.breeds.map(x => [`breed/${x.id}`, x] as const)])))
  return m.get(ref)
}
/** A page's "species/<id>", "plant/<id>" or "breed/<id>", as a pick names it. */
function refOf(c: Content, x: Named): string {
  let m = refs.get(c)
  if (!m) { picked(c, ''); refs.set(c, (m = new Map([...pages.get(c)!].map(([r, p]) => [p, r])))) }
  return m.get(x)!
}

/** A guide's picture: its own photo, else one from its video's sections, else the first fish, plant or breed its title names. */
export const guideImage = (c: Content, g: Localized<GuideEntity>): Photo | undefined => guideImages(c, g)[0]
