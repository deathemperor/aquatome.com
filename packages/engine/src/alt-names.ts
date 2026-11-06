import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nameKey } from '@aq/schema'

/**
 * A species' other names ("Tên khác", search aliases, the names its page is linked by in other pages' text): what
 * readers call the species itself, in the page's language or another (common names, other spellings, trade names for
 * the fish). Not the name of one of its breeds or colour forms, which shop listings of a single variety gave it and every
 * merge kept (32 names on the betta, 2026-11-04: "Cá betta Green Alien", "Red Spade Tail Betta"…), and not one name twice
 * ("Pea puffer", "Pea Puffer"; "Cá Tiger Oscar", "Tiger Oscar").
 *
 * A breed page's other names, the same way round: the breed's own, not its species' (the halfmoon betta listed "Cá xiêm"
 * and "Cá chọi", so every guide naming the betta was listed on the halfmoon's page, 2026-11-05).
 */

export type BreedName = { id: string; name: string }
export type NameOff = { name: string; why: 'breed' | 'variety' | 'duplicate' | 'species'; of?: string }

/** A leading word for the kind of animal: "Cá Oscar" and "Oscar" are one name. Thai writes ปลา onto the name. */
const CLASSIFIERS = new Set(['cá', 'tép', 'ốc', 'cua', 'ikan', 'udang', 'ปลา', 'กุ้ง', 'หอย'].map(nameKey))
const THAI_CLASSIFIER = /^(ปลา|กุ้ง|หอย)(?=\S)/u
/**
 * Words that make a name a bred line or a colour form of the species: with the species' own name ("Cá betta lai Alien",
 * "Albino pacu", "Koi Golden barb"). Each alone is not enough: "Galaxy rasbora" and "Platinum hatchetfish" are what the
 * species are called. A word in the species' own name is not one for it ("Cá koi").
 */
const MARKERS = ['hybrid', 'hibrida', 'lai', 'alien', 'koi', 'kohaku', 'albino', 'bạch tạng', 'platinum', 'super', 'halfmoon', 'half moon',
  'crowntail', 'crown tail', 'đuôi tưa', 'plakat', 'veiltail', 'veil tail', 'spadetail', 'spade tail', 'doubletail', 'double tail', 'dumbo',
  'comet', 'balloon', 'strain', 'morph'].map(m => m.split(' '))
/** Colours, which a form's name adds to the species' ("Steel Blue Alien Betta"): left out when comparing, never a marker. */
const COLOURS = new Set(['red', 'blue', 'green', 'gold', 'golden', 'yellow', 'orange', 'black', 'white', 'grey', 'gray', 'silver', 'copper', 'teal',
  'purple', 'pink', 'royal', 'steel', 'coral', 'tricolor', 'turquoise', 'đỏ', 'xanh', 'lá', 'lục', 'lam', 'vàng', 'đen', 'trắng', 'xám', 'bạc', 'đồng',
  'cam', 'tím', 'merah', 'biru', 'hijau', 'kuning', 'hitam', 'putih', 'emas', 'perak'])

const words = (s: string) => s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
/** The words without a leading classifier ("cá", "ikan", ปลา…), when something follows it. */
const bare = (ws: string[]) => {
  if (ws.length > 1 && CLASSIFIERS.has(nameKey(ws[0]!))) return ws.slice(1)
  if (THAI_CLASSIFIER.test(ws[0] ?? '')) return [ws[0]!.replace(THAI_CLASSIFIER, ''), ...ws.slice(1)]
  return ws
}
/**
 * Two names a reader can't tell apart: case, accents, punctuation and a leading classifier aside. Words stay words: a
 * search for "horse face loach" doesn't find "Horseface loach", so the two are both kept. Thai is written with or
 * without spaces, so it is compared without.
 */
export const altKey = (s: string) => bare(words(s)).map(nameKey).join(/\p{Script=Thai}/u.test(s) ? '' : ' ')
/** "Cá betta (cá xiêm)" → the whole, "Cá betta" and "cá xiêm". */
const parts = (s: string) => {
  const m = s.match(/^(.+?)\s*\(([^()]+)\)\s*$/)
  return m ? [s, m[1]!, m[2]!] : [s]
}
const colourless = (ws: string[]) => nameKey(bare(ws.filter(w => !COLOURS.has(w))).join(' '))
/** Where a marker's words stand in a name's words. */
const markerAt = (ws: string[], m: string[]) => ws.findIndex((_, i) => m.every((w, j) => ws[i + j] === w))

/**
 * The name without its form's words (markers and colours), when it has a marker the species' name lacks: "Cá betta
 * Copper Alien lai" → "betta", "Comet Black" → "". Null for a name with none.
 */
function species(name: string, own: Set<string>): string | null {
  let ws = words(name)
  let found = false
  for (const m of MARKERS) {
    if (m.every(w => own.has(w))) continue
    for (let i = markerAt(ws, m); i >= 0; i = markerAt(ws, m)) { ws = [...ws.slice(0, i), ...ws.slice(i + m.length)]; found = true }
  }
  return found ? colourless(ws) : null
}

const MARK = /[̀-ͯ]/g
/** How a name is written: accents (Vietnamese in full), a capital first, capitals after it, a classifier before it. */
function form(name: string) {
  const ws = words(name)
  const rest = bare(ws)
  const classifier = rest.join(' ') !== ws.join(' ')
  const restText = rest.length < ws.length ? name.trim().replace(/^\S+\s+/, '') : name.trim()
  const accents = (restText.normalize('NFD').match(MARK)?.length ?? 0) + (restText.match(/[đĐ]/g)?.length ?? 0)
  return { accents, capital: /^\p{Lu}/u.test(name.trim()), caps: restText.slice(1).match(/\p{Lu}/gu)?.length ?? 0, classifier, words: rest.length }
}
/** Of two ways to write one name, is `a` the better: accents written, a capital first, "Cá …" or not, sentence case. */
function better(a: string, b: string) {
  const [x, y] = [form(a), form(b)]
  if (x.accents !== y.accents) return x.accents > y.accents
  if (x.capital !== y.capital) return x.capital
  // "Cá Oscar" and "Oscar": the Vietnamese form when the rest is one word (other pages' text links only names of two
  // words or more) or Vietnamese ("Cá pacu cừu"); else the name as it is ("Tiger Oscar", not "Cá Tiger Oscar").
  if (x.classifier !== y.classifier) return x.classifier === (x.words === 1 || x.accents > 0)
  return x.caps < y.caps
}

/**
 * A species page's other names in one language, cleaned: each name off it with why. Keeps the names' order (one name
 * written several ways stands where its first form stood, in its best-written form).
 * - a name that is a breed page's name ("Bubble Eye Goldfish" for the Bubble eye goldfish page, "Cá GloFish"): that page
 *   is found by it. Only a breed's own name, never its other names: a name both list is the species' and leaves the
 *   breed (cleanBreedAltNames). A breed whose name is the species' own (the koi and Cyprinus rubrofuscus, "Cá koi") takes none.
 * - a bred line or colour form: the species' own name with a marker (MARKERS) and colours ("Alien Betta Green Hybrid",
 *   "Betta Splendens (Red Spade Tail)", "Cá tứ vân albino"). A page for a genus or a group ("Các loài cá molly") lists
 *   its kinds, and keeps them.
 * - a name written twice ("Siamese Fighting Fish"), the page's own name again, its scientific name with "Cá" before
 *   it, or "X (Y)" where X and Y are both its names already.
 */
export function cleanAltNames(page: { name: string; sci: string; altNames: string[] }, breeds: BreedName[] = []): { altNames: string[]; off: NameOff[] } {
  const off: NameOff[] = []
  const nameParts = parts(page.name).map(altKey)
  const own = new Set(words(page.name))
  const group = !page.sci.includes(' ') || /^các loài\b/i.test(page.name)
  // A breed's name, each way it's written: the whole, its Vietnamese and its English ("Cá vàng mắt bong bóng (Bubble eye goldfish)").
  const breedOf = new Map<string, string>()
  for (const b of breeds) {
    const keys = parts(b.name).map(altKey).filter(Boolean)
    // The breed is the species' namesake: its name's words are the species' own ("Koi" on ปลาคาร์ป, the koi's species).
    if (keys.some(k => nameParts.includes(k))) { for (const w of words(b.name)) own.add(w); continue }
    for (const k of keys) if (!breedOf.has(k)) breedOf.set(k, b.id)
  }
  const kept: string[] = []
  for (const raw of page.altNames) {
    const name = raw.replace(/\s+/g, ' ').trim()
    const key = altKey(name)
    if (!key) continue
    const breed = breedOf.get(key)
    if (breed) { off.push({ name: raw, why: 'breed', of: breed }); continue }
    kept.push(name)
  }
  // The species' own names, colours left out: what a form's name must come down to ("Cá betta", "Betta", "Betta splendens"),
  // or nothing ("Super Red").
  const cores = new Set([...parts(page.name), page.sci, ...kept.filter(n => species(n, own) === null)].map(n => colourless(words(n))).filter(Boolean))
  const named: string[] = []
  for (const name of kept) {
    const rest = group ? null : species(name, own)
    if (rest !== null && (rest === '' || cores.has(rest))) off.push({ name, why: 'variety' })
    else named.push(name)
  }
  // One name, one form: the best-written, where the first stood.
  const best = new Map<string, string>()
  for (const n of named) {
    const k = altKey(n)
    const cur = best.get(k)
    if (cur === undefined || better(n, cur)) best.set(k, n)
  }
  const whole = altKey(page.name)
  const sci = altKey(page.sci)
  const placed = new Set<string>()
  const used = new Set<string>()
  const out: string[] = []
  for (const n of named) {
    const k = altKey(n)
    if (k === whole) { off.push({ name: n, why: 'duplicate', of: page.name }); continue }
    if (k === sci) { off.push({ name: n, why: 'duplicate', of: page.sci }); continue }
    const b = best.get(k)!
    if (!placed.has(k)) { placed.add(k); out.push(b) }
    if (n === b && !used.has(k)) { used.add(k); continue }
    off.push({ name: n, why: 'duplicate', of: b })
  }
  // "X (Y)" whose X and Y are both names the page has.
  const have = new Set([...nameParts, sci, ...out.map(altKey)])
  const altNames = out.filter(n => {
    const p = parts(n)
    if (p.length < 3 || !p.slice(1).every(x => have.has(altKey(x)))) return true
    off.push({ name: n, why: 'duplicate', of: `${p[1]} / ${p[2]}` })
    return false
  })
  return { altNames, off }
}

/** A species a breed is a form of, or a hybrid's parent: its scientific name and its names in the breed page's language. */
export type Kin = { id: string; sci: string; names: string[] }

/**
 * A note saying a name is every form's, the species': "Cá xiêm / cá chọi (tên chung của loài)", "cá lia thia / cá xiêm /
 * cá chọi (tên chung của betta, plakat là dạng đuôi ngắn)". Not a note on the breed's own use of a name ("cá đá (plakat
 * chọn làm cá đá)").
 */
const SHARED_NOTE = /\(\s*tên (?:gọi )?chung\b[^()]*\)\s*$/iu
/** "Cá xiêm / cá chọi (tên chung của loài)" → "Cá xiêm", "cá chọi", "tên chung của loài": the names a name is made of. */
const segments = (s: string) => s.split(/\s*[/()]\s*/).filter(Boolean)

/**
 * A breed page's other names in one language, cleaned: its own only, each once.
 * - a name its species has, or a hybrid's parent (`kin`: its name, other names, scientific name; "Cá xiêm" under the
 *   halfmoon betta): other pages' text names the species by it, and the breed would be listed for every page naming the
 *   species. So do the names a note calls the species' ("Cá xiêm / cá chọi (tên chung của loài)", "Cá chọi" with it),
 *   and the noted name itself. A breed whose own name is the species' (the koi, "Cá koi" on Cyprinus rubrofuscus) is
 *   what the names they share name first, and keeps them.
 * - another breed page's name ("Cá vàng Lan Thọ" under the lionhead, the Ranchu page's name), and one name written twice:
 *   as on a species page (cleanAltNames). A breed has no scientific name, so no colour-form rule: its lines' names are
 *   its own ("Koi plakat betta" under the koi betta).
 */
export function cleanBreedAltNames(page: { id: string; name: string; altNames: string[] }, kin: Kin[], breeds: BreedName[] = []): { altNames: string[]; off: NameOff[] } {
  const of = new Map<string, string>() // a name's key → the species it is a name of
  for (const k of kin) for (const n of [k.sci, ...k.names]) for (const p of parts(n)) { const key = altKey(p); if (key && !of.has(key)) of.set(key, k.id) }
  const namesake = parts(page.name).some(p => of.has(altKey(p)))
  const off: NameOff[] = []
  let own = page.altNames
  if (kin.length && !namesake) {
    for (const n of page.altNames) if (SHARED_NOTE.test(n)) for (const s of segments(n.replace(SHARED_NOTE, ''))) if (altKey(s) && !of.has(altKey(s))) of.set(altKey(s), kin[0]!.id)
    own = page.altNames.filter(n => {
      const ss = segments(n)
      const species = of.get(altKey(n)) ?? (SHARED_NOTE.test(n) ? kin[0]!.id : ss.length > 1 && ss.every(s => of.has(altKey(s))) ? of.get(altKey(ss[0]!)) : undefined)
      if (species) off.push({ name: n, why: 'species', of: species })
      return !species
    })
  }
  // An empty scientific name: no colour-form rule (cleanAltNames treats the page as a group's).
  const rest = cleanAltNames({ name: page.name, sci: '', altNames: own }, breeds.filter(b => b.id !== page.id))
  return { altNames: rest.altNames, off: [...off, ...rest.off] }
}

/**
 * The species a breed is a form of (`basedOn`, or the one a breed it is a line of is a form of) and a hybrid's parents'
 * species, each with its names in a language as the species sweep leaves them (cleanAltNames, so a name the species
 * holds that is this breed's never counts as the species').
 */
export async function breedKin(content: string, e: { basedOn?: string; parents: { species?: string }[] }, lang: string, breeds: BreedName[], seen = new Set<string>()): Promise<Kin[]> {
  const read = async <T>(...path: string[]) => JSON.parse(await readFile(join(content, ...path), 'utf8').catch(() => 'null')) as T | null
  const out: Kin[] = []
  for (const id of [e.basedOn, ...e.parents.map(p => p.species)]) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    const line = await read<{ basedOn?: string; parents: { species?: string }[] }>('breeds', id, 'entity.json')
    if (line) { out.push(...await breedKin(content, line, lang, breeds, seen)); continue }
    const sci = (await read<{ scientificName?: string }>('species', id, 'entity.json'))?.scientificName
    if (!sci) continue
    const t = await read<{ name?: string; altNames?: string[] }>('species', id, `${lang}.json`)
    out.push({ id, sci, names: t?.name ? [t.name, ...cleanAltNames({ name: t.name, sci, altNames: t.altNames ?? [] }, breeds).altNames] : [] })
  }
  return out
}

/** Every breed page's name in a language (content/breeds/<id>/<lang>.json). */
export async function breedNames(content: string, lang: string): Promise<BreedName[]> {
  const out: BreedName[] = []
  for (const id of (await readdir(join(content, 'breeds')).catch(() => [] as string[])).sort()) {
    const t = JSON.parse(await readFile(join(content, 'breeds', id, `${lang}.json`), 'utf8').catch(() => 'null')) as { name?: string } | null
    if (t?.name) out.push({ id, name: t.name })
  }
  return out
}

/** Of names to add to a species page, those the sweep would keep there (a step adding names never adds one it takes off). */
export function keptOf(page: { name: string; sci: string; altNames: string[] }, breeds: BreedName[], add: string[]): string[] {
  const { altNames } = cleanAltNames({ ...page, altNames: [...page.altNames, ...add] }, breeds)
  return add.filter(n => altNames.includes(n))
}
