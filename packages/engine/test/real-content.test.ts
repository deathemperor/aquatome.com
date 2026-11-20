import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { GALLERY_POST, LANGS, loadAll, mayPublish, RETIRED_GUIDES, resolveDataCard, retiredTo, slugify, tankKeywordFits, WRITTEN_LANGS, type Translation } from '@aq/schema'
import { checkPages, countMismatch, hasEmail, isLink, isMediaFile, mayHoldEmail, photoCaptions, RATCHETED, ratcheted, refCredits, RULES, SWEPT_KINDS, thanksLines } from '../src/content-rules'
import { englishOf } from '../src/english'
import { tilapiaUnnamed } from '../src/kind-words'
import { droppedName, FISH_NAMES, KIND_PASSAGES, oldNames, renamings } from '../src/names'
import { altKey, NOT_ITS } from '../src/alt-names'
import { GROUP_ORDERS, MISMATCHED } from '../src/gbif'
import { productOf } from '../src/fit'
import { loadPages } from '../src/pages'
import { ENGLISH_PLACE_WORD, kindTwice } from '../src/place-names'
import { roundPage } from '../src/round'
import { snapshotName } from '../src/snapshot'
import { mendPart } from '../src/source-figures'
import { fishThaiLai, wordingSlips } from '../src/sanitize'
import { cardOf, cardProblems, readSummaries } from '../src/summaries'
import { cardSchool, readTraits } from '../src/traits'
import { sweepTranslation } from '../src/sweep'
import { refusedScan, WAITING } from '../src/refused-sources'
import { namesSomeone } from '../src/video-covers'
import { slow } from '@aq/schema/test-time'

// The real content/, not the test store, as a public build shows it. Each class of defect here has a fix the engine
// makes on every page each cycle, before the build (`pnpm engine sweep`, sweep.ts; `pnpm engine metric` for units), so a
// page that has one is a page the fix missed: fix the sweep, not the page. Only the kinds of page each fix covers
// (RATCHETED). Pages with one on 2026-11-01, of 2,599: the source site's comments or related posts 22, a heading left at
// the end 2, a repeated paragraph 12, a photo of another fish or a map 25, a card figure out of bounds 12, a title
// promising a count the text lacks 4, numbered labels out of order 1, an imperial figure 1.
test('no page has a defect the sweep fixes', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))
  const { findings, errors } = checkPages(pages, RULES.filter(r => r.id in RATCHETED))
  expect(errors).toEqual([])
  const held = ratcheted(findings)
  const left = Object.fromEntries(Object.keys(RATCHETED).map(id => [id, held.filter(f => f.rule === id).map(f => `${f.page.path}: ${f.detail}`)]))
  expect(left, 'run pnpm engine sweep').toEqual(Object.fromEntries(Object.keys(RATCHETED).map(id => [id, []])))
}, slow(300_000)) // every page of the real content, in three languages: about 100 s on 2,599 pages

// Page Recovery, 2026-11-12: a source's photo captions and credits left in a guide's text (121 lines in 21 Vietnamese
// guides), its thanks to the people who helped it (17 pages), and the compiler's name after "©" in about 130 fish pages'
// references. The sweep cuts them each cycle, before the build; this holds what it leaves, on every stored page as the
// sweep would leave it. In memory: the content here is the last cycle's, and its next sweep writes the cut. What fails
// names the page, the part and how many, never the words: they carry people's names, and this log is public.
test('after the sweep, no page keeps a stray photo caption, a source\'s thanks or a name after "©" in its references', async () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  const left: string[] = []
  for (const kind of SWEPT_KINDS) for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) for (const lang of WRITTEN_LANGS) {
    const raw = await readFile(join(content, kind, id, `${lang}.json`), 'utf8').catch(() => null)
    if (!raw) continue
    const t = sweepTranslation(JSON.parse(raw) as Translation & { body?: string; definition?: string }, kind).t
    const fields = [...Object.entries(t.sections ?? {}).map(([k, html]) => [`sections.${k}`, html] as const), ...(t.body !== undefined ? [['body', t.body] as const] : []), ...(t.definition !== undefined ? [['definition', t.definition] as const] : [])]
    for (const [field, html] of fields) {
      const refs = field.startsWith('sections.references')
      const n = { captions: kind === 'guides' && field === 'body' ? photoCaptions(html).length : 0, thanks: refs ? 0 : thanksLines(html).length, '©': refs ? refCredits(html).length : 0 }
      for (const [what, k] of Object.entries(n)) if (k) left.push(`${lang}/${kind}/${id} ${field}: ${what} ×${k}`)
    }
  }
  expect(left, 'fix the sweep (content-rules.ts dropPhotoCaptions, dropThanks, dropRefCredits)').toEqual([])
}, slow(300_000)) // every stored page in four languages, swept in memory: about 40 s

// The owner's names of 2026-11-07. The sweep writes each when the sentence says which fish it is (renameSwapped), so what
// fails here is a sentence it left, the fish unclear: a page that keeps one is written again.
test('no page calls a fish by the name it no longer has', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))
  const { findings, errors } = checkPages(pages, RULES.filter(r => r.id === 'swapped-name'))
  expect(errors).toEqual([])
  expect(findings.map(f => `${f.page.path}: ${f.detail}`)).toEqual([])
}, slow(300_000))

// The owner, 2026-11-11: "Cá thài lài doesn't exist in Vietnamese". The sweep writes the fish it named by their names
// (sanitize.ts WORDING); what fails here is a "thài lài" it left ("họ thài lài"): the page is written again.
test('no page, fish summary or caption calls a fish "thài lài"', async () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  const { findings, errors } = checkPages(await loadPages(content), RULES.filter(r => r.id === 'fish-words'))
  expect(errors).toEqual([])
  const files = [...(await readdir(join(content, 'summaries'))).map(f => `summaries/${f}`), ...readdirSync(join(content, 'captions')).map(f => `captions/${f}`)]
  const left = (await Promise.all(files.map(async f => fishThaiLai(await readFile(join(content, f), 'utf8')).map(q => `${f}: ${q}`)))).flat()
  expect([...findings.map(f => `${f.page.path}: ${f.detail}`), ...left]).toEqual([])
}, slow(300_000))

// The owner, 2026-11-15, on a fiddler crab's page headed "Cá Austruca annulipes": an animal that isn't a fish is never
// named as one. Not a fish: a shrimp or a snail, or an order that isn't a fish's (kind-words.ts isFish; the app's rule
// too, agreed with the iOS Content Lead). A new page takes its kind's word (kind-words.ts plainName, since 14 Nov); a
// page's name is kept once written, so one named before that keeps "Cá" until a person renames it (names.ts FISH_NAMES).
// Indonesian and Malay "Ikan", Thai "ปลา", but for Thai's own names of a starfish (ปลาดาว) and a squid (ปลาหมึก).
const FISH_WORD: Partial<Record<string, RegExp>> = { vi: /^cá(?![\p{L}\p{M}])/iu, id: /^ikan(?!\p{L})/iu, ms: /^ikan(?!\p{L})/iu, th: /^ปลา(?!ดาว|หมึก)/u }
test('no page for an animal that isn\'t a fish names it a fish, in any language', () => {
  const species = fileURLToPath(new URL('../../../content/species', import.meta.url))
  const named = readdirSync(species).flatMap(id => {
    const e = JSON.parse(readFileSync(join(species, id, 'entity.json'), 'utf8')) as { order?: string; group?: string }
    if (!['shrimp', 'snails'].includes(e.group ?? '') && !(e.order && !/iformes$/.test(e.order))) return []
    return Object.entries(FISH_WORD).flatMap(([lang, word]) => {
      const file = join(species, id, `${lang}.json`)
      const name = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Translation).name : undefined
      return name && word!.test(name.normalize('NFC').trim()) ? [`${id} (${e.order ?? e.group}) ${lang}: ${name}`] : []
    })
  })
  expect(named).toEqual([])
})

// The owner's names of 2026-11-11, each guarded (nameFixed) so a later source read keeps it: the eartheaters the trade
// calls Hải Hồ (Geophagus, Satanoperca, Acarichthys heckelii; not Biotodoma or Gymnogeophagus, which no source calls so),
// and the four fish once headed "thài lài".
test("the owner's Hải Hồ and the names that replaced \"thài lài\" stay, each guarded", async () => {
  const dir = fileURLToPath(new URL('../../../content/species', import.meta.url))
  const vi = (id: string) => JSON.parse(readFileSync(join(dir, id, 'vi.json'), 'utf8')) as Translation
  const eartheaters = readdirSync(dir).filter(id => /^(?:geophagus|satanoperca)-/.test(id) || id === 'acarichthys-heckelii')
  expect(eartheaters.length).toBeGreaterThanOrEqual(29)
  for (const id of eartheaters) expect([id, vi(id).name.startsWith('Cá hải hồ '), vi(id).nameFixed]).toEqual([id, true, true])
  for (const id of readdirSync(dir).filter(id => /^(?:biotodoma|gymnogeophagus)-/.test(id))) expect(vi(id).name, id).not.toMatch(/hải hồ/i)
  const four = { 'trichogaster-chuna': 'Cá sặc mật ong', 'trichopsis-vittata': 'Cá bã trầu', 'parosphromenus-phoenicurus': 'Cá liquorice gourami phoenicurus', 'ctenops-nobilis': 'Cá Ctenops nobilis' }
  for (const [id, name] of Object.entries(four)) expect([vi(id).name, vi(id).nameFixed]).toEqual([name, true])
})

// The chief of staff's names of 2026-11-13 (names.ts FISH_NAMES), set by the sweep (nameFish): each page has its name,
// guarded, its old name among its other names unless the row drops it, and the address it had, or the row's own with the
// old one forwarding (with no note when the old name is dropped). No other page has the name, none has an old one in its
// own, and no fish summary or caption keeps an old one (the sweep renames the text; the swapped-name test above holds the
// pages).
const KEPT_ADDRESS: Record<string, string> = {
  'pseudomugil-luminatus': 'ca-cau-vong-neon-do-mat-xanh',
  // Renamed with their addresses kept until the owner says to move them (the chief of staff, 16 Nov 2026).
  'champsochromis-caeruleus': 'ca-tre-malawi',
  'pelvicachromis-kribensis': 'ca-rong-do-kribensis',
  'amphilius-frieli': 'ca-da-tron-suoi-amphilius-frieli',
  'corbicula-fluminea': 'trai-nuoc-ngot-corbicula',
  'aphyosemion-gabunense': 'ca-killi-duoi-dan-lia-gabon-gabon-lyretail',
  'boulengerella-cuvieri': 'ca-cuvieri-boulengerella-cuvieri',
  'myriophyllum-elatinoides': 'cay-rong-duoi-chon-nuoc-myriophyllum-elatinoides',
  // Its row only says its own words; its address waits for the owner's answer on addresses.
  'trichopsis-pumila': 'ca-sac-lun-trichopsis',
  'trichopodus-leerii': 'ca-sac-ngoc-trai',
  'symphysodon-aequifasciatus': 'ca-dia',
}
test("the chief of staff's fish and plant names stay, each guarded, the old name kept for search or dropped, the address as it was or forwarding", () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  const pages = ['species', 'plants', 'breeds'].flatMap(kind => readdirSync(join(content, kind)).filter(id => existsSync(join(content, kind, id, 'vi.json')))
    .map(id => ({ page: `${kind}/${id}`, t: JSON.parse(readFileSync(join(content, kind, id, 'vi.json'), 'utf8')) as Translation & { redirectFrom?: { slug: string; name: string }[] } })))
  const old = (was: string) => new RegExp(`(?<!\\p{L})${was.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'iu')
  for (const r of FISH_NAMES) {
    const at = `${r.kind ?? 'species'}/${r.id}`
    const t = pages.find(p => p.page === at)!.t
    expect([r.id, t.name, t.nameFixed, t.slug]).toEqual([r.id, r.name, true, r.slug ?? KEPT_ADDRESS[r.id]])
    expect(t.altNames).toEqual(expect.arrayContaining([r.was, ...(r.alts ?? [])].filter(n => n !== r.name && !droppedName(r, n))))
    expect(t.altNames.filter(n => droppedName(r, n)), r.id).toEqual([])
    if (r.slug) expect(t.redirectFrom?.at(-1)?.name, r.id).toBe(droppedName(r, r.was) ? '' : r.was)
    // A row that keeps the page's name only adds other names: nothing is renamed, so the rest holds no name to.
    if (!oldNames(r).length) continue
    const others = pages.filter(p => p.page !== at)
    expect(others.filter(p => [p.t.name, ...p.t.altNames].some(n => n.toLowerCase() === r.name.toLowerCase())).map(p => p.page), r.name).toEqual([])
    // An old name is this one's alone (Astra, 2026-11-13): no other page is called by it, or by a name it begins, but for
    // another species' longer name the row lists, which the text rename leaves whole ("Cá platy variatus").
    const theirs = (n: string) => (r.longer ?? []).some(l => `${n.toLowerCase()} `.startsWith(`${l.toLowerCase()} `))
    for (const { was } of renamings(r)) expect(others.filter(p => [p.t.name, ...p.t.altNames].some(n => old(was).test(n) && !theirs(n))).map(p => p.page), was).toEqual([])
  }
  const files = [...readdirSync(join(content, 'summaries')).map(f => `summaries/${f}`), ...readdirSync(join(content, 'captions')).map(f => `captions/${f}`)]
  // Less the longer names the rows list, which keep their words ("Cá platy variatus (Xiphophorus variatus) dễ nuôi").
  const longer = FISH_NAMES.flatMap(r => r.longer ?? []).map(l => new RegExp(old(l).source, 'giu'))
  const holdsOld = (f: string) => {
    const words = longer.reduce((s, l) => s.replace(l, ''), readFileSync(join(content, f), 'utf8').normalize('NFC'))
    return FISH_NAMES.some(r => renamings(r).some(({ was }) => old(was).test(words)))
  }
  expect(files.filter(holdsOld)).toEqual([])
  // The passages a person found read as they said (names.ts KIND_PASSAGES).
  for (const r of KIND_PASSAGES) expect(readFileSync(join(content, r.page, 'vi.json'), 'utf8').normalize('NFC'), r.page).not.toContain(r.was)
})

// The naming rule's caption check (the chief of staff, 17 Nov): a caption is also its picture's alt text everywhere on the
// site, so it names its animal as the pages do. No caption, on a fish's, plant's, breed's or guide's photos, their
// albums or a video's stills, keeps a renamed fish's old name (names.ts FISH_NAMES, which the sweep renames); and no
// fish's own photos carry a name a person found is another fish's (alt-names.ts NOT_ITS).
test('no caption keeps a renamed fish\'s old name, and no fish\'s photos carry another fish\'s name', () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  const old = (was: string) => new RegExp(`(?<!\\p{L})${was.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?!\\p{L})`, 'iu')
  const longer = FISH_NAMES.flatMap(r => r.longer ?? []).map(l => new RegExp(old(l).source, 'giu'))
  const renamed = FISH_NAMES.flatMap(r => renamings(r).map(({ was }) => ({ was, re: old(was) })))
  type Photo = { caption?: string }
  type Figure = { photo?: Photo; moments?: Photo[] }
  const captionsOf = (f: string) => {
    const e = JSON.parse(readFileSync(f, 'utf8').normalize('NFC')) as { photos?: Photo[]; video?: { figures?: Figure[] } }
    return [...(e.photos ?? []), ...(e.video?.figures ?? []).flatMap(x => [...(x.photo ? [x.photo] : []), ...(x.moments ?? [])])].map(p => p.caption ?? '').filter(Boolean)
  }
  const files = [
    ...readdirSync(join(content, 'gallery')).filter(f => f.endsWith('.json')).map(f => join(content, 'gallery', f)),
    ...['species', 'plants', 'breeds', 'guides'].flatMap(k => readdirSync(join(content, k)).map(id => join(content, k, id, 'entity.json')).filter(f => existsSync(f))),
  ]
  const left: string[] = []
  for (const f of files) for (const c of captionsOf(f)) {
    const words = longer.reduce((s, l) => s.replace(l, ''), c)
    for (const r of renamed) if (r.re.test(words)) left.push(`${f.slice(content.length + 1)}: "${c}" (${r.was})`)
  }
  // Another fish's name on a fish's own photos: its album and its page. Read without the fish's own names, which can hold
  // the other's ("Cá molly vây buồm" holds "Cá molly", "Cá tetra Congo cam" holds "Cá tetra Congo").
  for (const id of readdirSync(join(content, 'species'))) {
    const e = JSON.parse(readFileSync(join(content, 'species', id, 'entity.json'), 'utf8')) as { scientificName: string }
    const off = NOT_ITS[e.scientificName]
    if (!off) continue
    const page = JSON.parse(readFileSync(join(content, 'species', id, 'vi.json'), 'utf8').normalize('NFC')) as { name: string; altNames?: string[] }
    const own = [page.name, ...(page.altNames ?? [])].sort((a, b) => b.length - a.length).map(n => new RegExp(old(n).source, 'giu'))
    for (const f of [join(content, 'gallery', `${id}.json`), join(content, 'species', id, 'entity.json')].filter(x => existsSync(x)))
      for (const c of captionsOf(f)) {
        const words = own.reduce((s, n) => s.replace(n, ' '), c)
        for (const x of off) if (old(x.name).test(words)) left.push(`${f.slice(content.length + 1)}: "${c}" (${x.name})`)
      }
  }
  expect(left).toEqual([])
})

// Two fish pages' photos kept a name their page had dropped (the Writing Lead's count of 17 Nov, 6 of 10,654 captions):
// Abbottina rivularis's "cá gudgeon giả Trung Quốc" and Mystus leucophasis's "cá nheo ngửa châu Á". A caption is also its
// photo's alt text, so they say the page's name.
test('two fish pages\' photos say the name their page has, not the one it dropped', () => {
  const gallery = fileURLToPath(new URL('../../../content/gallery', import.meta.url))
  const captions = (id: string) => (JSON.parse(readFileSync(join(gallery, `${id}.json`), 'utf8')) as { photos: { caption?: string }[] }).photos.map(p => p.caption ?? '')
  expect(captions('abbottina-rivularis').filter(c => /gudgeon giả/iu.test(c))).toEqual([])
  expect(captions('mystus-leucophasis').filter(c => /nheo ngửa/iu.test(c))).toEqual([])
})

// Three plecos' L numbers, settled from the saved sources (the Writing Lead's read, 16 Nov): Glaser and ScotCat give
// Spectracanthicus zuanoni L20 as well as L354; ScotCat calls L165 the true P. gibbiceps and lists L83; and of the two fish
// sold as L200, Glaser's stock list and Seriously Fish give Baryancistrus demantoides "L200a", Hemiancistrus subviridis
// keeping L200. The record is kept as it is (merge.ts), and each head shows its first number.
test('three plecos carry the L numbers their saved sources give, and each head shows the first', () => {
  const content = fileURLToPath(new URL('../../../content/species', import.meta.url))
  const read = (id: string, f: string) => JSON.parse(readFileSync(join(content, id, f), 'utf8')) as { lNumber?: string; name?: string }
  expect(['spectracanthicus-zuanoni', 'pterygoplichthys-gibbiceps', 'baryancistrus-demantoides', 'hemiancistrus-subviridis'].map(id => read(id, 'entity.json').lNumber))
    .toEqual(['L354, L20', 'L165, L83', 'L200a', 'L200'])
  for (const lang of ['vi', 'id', 'th']) expect(read('baryancistrus-demantoides', `${lang}.json`).name, lang).toMatch(/ L200a$/)
})

// Two plant names a person fixed lose the scientific name in brackets and keep their address (the naming plan, 14 Nov);
// and the marimo, an alga, is no moss in Tropica's quick facts in any language, the part fixed so a later read of Tropica
// doesn't bring the line back (Curation's card, 21 Nov).
test('two fixed plant names carry no brackets, and the marimo is called no moss in its quick facts', () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  const vi = (id: string) => JSON.parse(readFileSync(join(content, 'plants', id, 'vi.json'), 'utf8')) as Translation
  for (const [id, name, slug] of [['anubias-barteri-var-glabra', 'Ráy lá dài', 'ray-la-dai'], ['limnophila-sessiliflora', 'Cây tiểu bảo tháp', 'cay-tieu-bao-thap']] as const)
    expect([vi(id).name, vi(id).nameFixed, vi(id).slug]).toEqual([name, true, slug])
  const dir = join(content, 'plants', 'aegagropila-linnaei')
  const tropica = (JSON.parse(readFileSync(join(dir, 'entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string; fixed?: boolean }[] }).sections
    .find(s => s.key === 'quickFacts' && s.source === 'tropica')!
  expect([tropica.html, tropica.fixed]).toEqual([expect.not.stringMatching(/Type:/), true])
  for (const [lang, word] of [['vi', 'Loại:'], ['id', 'Jenis:'], ['th', 'ประเภท:'], ['ms', 'Jenis:']] as const) {
    const t = JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')) as { sections: Record<string, string> }
    expect(t.sections['quickFacts:tropica'], lang).not.toContain(word)
  }
})

// The owner, 2026-11-07: "fritz slim out is not for Vietnamese. I can effectively treat this with very cheap oxy già."
// And 2026-11-08, on a box stuck over the translated article: "The mention of US med is so irrelevant here." These two
// guides' treatment is written for a keeper in Vietnam: nothing not sold here, in any field of any language's file, and
// nothing explaining its absence. Fritz Slime Out, Tetra AlguMin Plus and AlgoStop depot: no listing on 22 Vietnamese
// shops' own search. Ultralife's only listing is a general pet wholesaler's, not counted as sold.
// The chief of staff, 2026-11-12: a source is never credited with words it did not say. Our lines (the peroxide method
// on Co-op's guide, which never names peroxide; the pharmacy and shop prices and the 40-litre example on Aquarium Breeder's)
// are a labelled note beside each source's body, citing where its dose and prices come from. The two checks below stay as
// strict over every file; only the note's own label, which says whom the note is for, is taken out before them.
const AQUATOME_NOTE = 'Ghi chú của AquaTome cho bạn đọc ở Việt Nam:'
const BLUE_GREEN_ALGAE = {
  'aquariumcoop-blogs-aquarium-blue-green-algae': { cited: ['https://aquariumbreeder.com/blue-green-algae-cyanobacteria-profile-and-how-to-remove/', 'https://www.pharmacity.vn/oxy-gia-vp-3-60ml-loc-10-chai.html'], dose: 'note' },
  'aquariumbreeder-blue-green-algae-cyanobacteria-profile-and-how-to-remove': { cited: ['https://aquariumbreeder.com/blue-green-algae-cyanobacteria-profile-and-how-to-remove/', 'https://www.pharmacity.vn/oxy-gia-vp-3-60ml-loc-10-chai.html'], dose: 'body' },
} as const
test.each(Object.entries(BLUE_GREEN_ALGAE))('blue-green algae: %s names no product not sold in Vietnam, keeps our lines in a labelled note with their sources, and the engine keeps it', async (id, { cited, dose: doseIn }) => {
  const dir = fileURLToPath(new URL(`../../../content/guides/${id}/`, import.meta.url))
  const t = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')) as Translation
  const label = `<p><strong>${AQUATOME_NOTE}</strong> `
  expect(t.localNote?.html.startsWith(label)).toBe(true)
  for (const file of await readdir(dir)) {
    const raw = await readFile(join(dir, file), 'utf8')
    // The one label at the head of vi.json's note is taken out, and nothing else: the label anywhere else still fails.
    const text = file === 'vi.json' ? JSON.stringify({ ...t, localNote: { ...t.localNote!, html: t.localNote!.html.slice(label.length) } }) : raw
    expect(text, file).not.toMatch(/fritz|slime\s*out|slime\s*stain|algu\s*min|algo\s*stop|ultra\s*life/iu)
    expect(text, file).not.toMatch(/bài gốc|ở mỹ|ở việt nam|aquatome thêm/iu)
  }
  expect(t.bodyFixed).toBe(true)
  // The dose is for 3% peroxide, the pharmacy's, wherever a strength is named.
  for (const m of `${t.body}${t.localNote!.html}`.matchAll(/(?:oxy già|loại)\s*(\d+(?:[.,]\d+)?)\s*%/giu)) expect(m[0]).toMatch(/\b3\s*%$/u)
  // No writer drops the note or its sources when the source is read again (merge.ts writeGuide).
  expect(t.localNote?.refs.map(r => r.url)).toEqual(expect.arrayContaining([...cited]))
  // Our lines never sit under the source's name again: no pharmacy, no price, no shop, no worked example in its body.
  expect(t.body).not.toMatch(/nhà thuốc|\d[\d.,–]* đồng|shop thủy sinh|bể 40 lít|hướng dẫn trên nhãn|chỉ dùng loại 3%/iu)
  if (doseIn === 'note') expect(t.body).not.toMatch(/oxy già/iu)
  // The dose says what it's for and carries its cautions in the same step, wherever it is, so it can't be read against
  // another guide's 0.4 ml for a whole tank.
  const where = doseIn === 'note' ? t.localNote!.html : t.body!
  const dose = where.match(/<li>[^<]*3 ml cho mỗi 4 lít[^<]*<\/li>/)?.[0]
  expect(dose).toContain('oxy già 3%')
  expect(dose).toContain('liều bơm tại chỗ, không phải liều châm đều cả bể')
  expect(dose).toMatch(/bỏng mang.*tép/)
  expect(dose).toMatch(/tò mò bơi tới chỗ đang bơm/)
  for (const step of t.localNote!.html.match(/<(p|li)>.*?<\/\1>/g) ?? []) {
    if (!/3 ml cho mỗi 4 lít|40 lít/.test(step)) continue
    expect(step).toMatch(/oxy già 3%|loại 3%/)
    expect(step).toContain('liều bơm tại chỗ, không phải liều châm đều cả bể')
    expect(step).toMatch(/bỏng mang/)
    expect(step).toMatch(/tò mò bơi tới chỗ đang bơm/)
  }
})

// The source's own figures (the chief of staff, 2026-11-12): until then the rounding rounded a figure a fish page's English
// gives in metric itself, Seriously Fish's "90 × 38 × 30 cm" to "90 × 40 × 30 cm", and on the Ophthalmotilapia page one
// line gave two lengths. Each cycle's mender puts them back from the English (source-figures.ts), at the chief's pace, and
// the rounding keeps them. These three, the cases the chief named, go first: the steps a cycle runs give today's files
// the source's figures back, and keep them.
const SOURCE_FIGURES = [
  ['vi', 'dianema-longibarbis', 'aquariumSize:seriouslyfish', ['Đáy bể: 90 × 38 cm', 'Một bể 90 × 38 × 30 cm']],
  ['vi', 'ophthalmotilapia-ventralis', 'aquariumSize:seriouslyfish', ['Đáy bể: 135 × 45 cm', '(135 × 45 × 38 cm)']],
  ['vi', 'cichla-monoculus', 'aquariumSize:seriouslyfish', ['305 x 91 x 122 cm']],
  ['id', 'cichla-monoculus', 'quickFacts:seriouslyfish', ['305 x 91 x 122 cm']],
] as const
// The chief of staff's rulings of 15 Nov on the pages the source-figure pass left: a figure the source itself gives in
// metric stays as the source has it (the glass tetra's 60 × 38 cm, 68 litres, which add up, as 60 × 40 × 30 doesn't);
// litres we converted from US gallons are rounded, with "about" (the black ghost's 200, 300, 450 and 700); and the
// decorator crab's breeding line keeps the source's words, our labelled note beside it, and the page is out. Each part
// fixed, so no read of the source, translation or mender changes it, and the English says the same, as a language not yet
// written is translated from it. Whether the crab stays out is the gate's: its hold isn't held here.
test("the chief of staff's rulings on the source figures stay, each part fixed", () => {
  const root = fileURLToPath(new URL('../../../content/species', import.meta.url))
  const read = (id: string, file: string) => JSON.parse(readFileSync(join(root, id, file), 'utf8'))
  const parts = (id: string) => read(id, 'entity.json').sections as { key: string; source: string; html: string; fixed?: boolean }[]
  const fixed = (id: string, key: string, source: string) => parts(id).find(s => s.key === key && s.source === source)?.fixed
  const english = (id: string, key: string, source: string) => parts(id).find(s => s.key === key && s.source === source)!.html
  const tetra = read('moenkhausia-oligolepis', 'vi.json').sections['aquariumSize:seriouslyfish']
  expect(tetra).toContain('Đáy bể 60 × 38 cm. Thể tích khoảng 68 lít.')
  expect(tetra).toContain('Một bể 60 × 38 × 30 cm, tức khoảng 68 lít')
  expect(tetra).not.toMatch(/60 × 40/)
  expect(fixed('moenkhausia-oligolepis', 'aquariumSize', 'seriouslyfish')).toBe(true)
  const about = { vi: 'khoảng', id: 'sekitar', th: 'ประมาณ' } as const
  for (const [lang, word] of Object.entries(about)) {
    const ghost = read('apteronotus-albifrons', `${lang}.json`).sections['aquariumSize:aquariumcoop'] as string
    for (const n of ['200', '300', '450']) expect(ghost, `${lang} ${n}`).toMatch(new RegExp(`${word}\\s*${n}`))
    expect(ghost, lang).toMatch(/700/)
    expect(ghost, lang).not.toMatch(/208|284|454|681/)
  }
  expect(fixed('apteronotus-albifrons', 'aquariumSize', 'aquariumcoop')).toBe(true)
  expect(english('apteronotus-albifrons', 'aquariumSize', 'aquariumcoop')).toMatch(/about 200 litres.*about 300 litres.*about 450 or 700 litres/)
  expect(english('apteronotus-albifrons', 'aquariumSize', 'aquariumcoop')).not.toMatch(/208|284|454|681|gallon/)
  const note = {
    vi: '<p><strong>Ghi chú của AquaTome:</strong> Chỉ tắt sục khí trong lúc gom ấu trùng, rồi bật lại ngay.</p>',
    id: '<p><strong>Catatan AquaTome:</strong> Hentikan aerasi hanya selama mengumpulkan larva, lalu segera nyalakan kembali.</p>',
    th: '<p><strong>หมายเหตุจาก AquaTome:</strong> หยุดให้อากาศเฉพาะระหว่างรวบรวมลูกปูวัยอ่อนเท่านั้น แล้วกลับมาให้อากาศทันที</p>',
  } as const
  for (const [lang, said] of Object.entries(note)) {
    const t = read('camposcia-retusa', `${lang}.json`) as Translation
    expect(t.sections!['reproduction:aquatome'], lang).toBe(said)
    expect(t.sections!['reproduction:aquariumbreeder'], lang).toMatch(/26[.,]7–28[.,]9/)
  }
  expect(english('camposcia-retusa', 'reproduction', 'aquatome')).toBe("<p><strong>AquaTome's note:</strong> Turn the aeration off only while gathering the larvae, then back on straight away.</p>")
  const breeding = parts('camposcia-retusa').map(s => `${s.key}:${s.source}`)
  expect(breeding.indexOf('reproduction:aquatome')).toBe(breeding.indexOf('reproduction:aquariumbreeder') + 1)
  expect(fixed('camposcia-retusa', 'reproduction', 'aquatome')).toBe(true)
  expect(fixed('camposcia-retusa', 'reproduction', 'aquariumbreeder')).toBe(true)
  // The engine's figure steps find nothing to change in any of them: the mender (which doesn't read `fixed`) and the rounding.
  const ruled = [['moenkhausia-oligolepis', 'aquariumSize:seriouslyfish', ['vi']], ['apteronotus-albifrons', 'aquariumSize:aquariumcoop', ['vi', 'id', 'th']],
    ['camposcia-retusa', 'reproduction:aquariumbreeder', ['vi', 'id', 'th']]] as const
  for (const [id, part, langs] of ruled) {
    const en = englishOf(read(id, 'entity.json').sections)
    for (const lang of langs) {
      const text = (read(id, `${lang}.json`) as Translation).sections![part]!
      const m = mendPart(text, en.sections[part]!, lang)
      expect(m && 'text' in m ? m.text : text, `${lang} ${id} mender`).toBe(text)
      expect(roundPage({ sections: { [part]: text } }, lang, en).sections![part], `${lang} ${id} rounding`).toBe(text)
    }
  }
})

test.each(SOURCE_FIGURES)("the source's own figures: %s %s keeps the English's tank", async (lang, id, part, want) => {
  const dir = fileURLToPath(new URL(`../../../content/species/${id}/`, import.meta.url))
  const en = englishOf(JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')).sections)
  const text = (JSON.parse(await readFile(join(dir, `${lang}.json`), 'utf8')) as Translation).sections![part]!
  // Today's file, and the same file once a cycle's mender has put the figures back. The mender has nothing left to do
  // on the second (undefined), and a rewrite cycle failed its tests there (2026-11-12): the check read undefined's 'why'.
  const first = mendPart(text, en.sections[part]!, lang)
  for (const t of [text, first && 'text' in first ? first.text : text]) {
    const m = mendPart(t, en.sections[part]!, lang)
    expect(m ?? {}).not.toHaveProperty('why')
    const kept = roundPage({ sections: { [part]: m ? (m as { text: string }).text : t } }, lang, en).sections![part]!
    for (const w of want) expect(kept).toContain(w)
  }
})

// Praziquantel mixed into food, in all four languages, by the fish's weight (University of Florida; a trial on grass carp doses
// the same way). The guide had "35–125 mg/kg", which doesn't say a kilo of what, and a koi seller's own mix, per kilo of food,
// that no second source backs (2026-11-10).
test('the gill fluke guide gives praziquantel in food by the fish\'s weight, and the engine keeps it', async () => {
  const dir = fileURLToPath(new URL('../../../content/guides/aquatome-ca-bi-san-mang-gill-flukes-dau-hieu-cach-chua-va-phong/', import.meta.url))
  for (const lang of ['vi', 'id', 'th', 'ms']) {
    const t = JSON.parse(await readFile(join(dir, `${lang}.json`), 'utf8')) as Translation
    expect(t.bodyFixed, lang).toBe(true)
    expect(t.body, lang).not.toMatch(/35–125|50–75 (?:mg|มก)/u)
    expect(t.body, lang).toMatch(/<td>40 (?:mg|มก)/u)
    expect(t.body, `${lang}: Florida's warning beside its food dose`).toMatch(/nghiên cứu|diteliti|dikaji|วิจัย/u)
  }
})

// The chief of staff, 17 Nov 2026: a US seller's three quarantine medicines (sold there, with their doses per 10 US gallons)
// came off the site with the video guide built on them. The general guide had the same protocol in every language, and its
// Thai page printed the writer's source numbers ("(แหล่งที่ 0)"). Its saved facts no longer name the medicines, and the copy
// writer doesn't save a copy that prints source numbers (topics.ts sourceNumbers), so no rewrite brings either back.
test('the quarantine guide names no US seller\'s medicine in any language, nor its saved facts, and Thai prints no source number', async () => {
  const id = 'aquatome-cach-ly-ca-moi-mua-be-cach-ly-va-quy-trinh'
  const dir = fileURLToPath(new URL(`../../../content/guides/${id}/`, import.meta.url))
  const brands = /Maracyn|ParaCleanse|Ich-X|PraziPro|ParaGuard|quarantine trio|bộ ba thuốc/iu
  // The protocol unnamed too (Codex's read of #1588: Malay gave it as "a combination of" three medicines): its seven
  // days without food, in each language's words on main before, and Malay's combination.
  const protocol = /7 ngày[^.]*không cho ăn|7 hari tanpa (?:diberi pakan|memberi makan)|7 วันโดยไม่ให้อาหาร|gabungan ubat antibakteria/u
  for (const lang of ['vi', 'id', 'th', 'ms']) {
    const t = JSON.parse(await readFile(join(dir, `${lang}.json`), 'utf8')) as Translation
    expect(JSON.stringify([t.body, t.summary, t.faq]), lang).not.toMatch(brands)
    expect(JSON.stringify([t.body, t.summary, t.faq]), lang).not.toMatch(protocol)
  }
  expect((JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')) as Translation).bodyFixed).toBe(true)
  expect((JSON.parse(await readFile(join(dir, 'th.json'), 'utf8')) as Translation).body).not.toMatch(/แหล่งที่\s*\d/u)
  const facts = await readFile(fileURLToPath(new URL(`../../../engine-state/topics/${id}.json`, import.meta.url)), 'utf8')
  expect(facts).not.toMatch(brands)
})

// University of Florida's angelfish paper: "50mg/kg body weight for five consecutive days". A dose per kilo says a kilo of what.
test('the hexamita guide says the food dose is per kilo of the fish, in every language', async () => {
  const dir = fileURLToPath(new URL('../../../content/guides/aquatome-ca-di-phan-trang-benh-trung-roi-hexamita-ca-dia-nguyen-nhan-cach-chua/', import.meta.url))
  for (const lang of ['vi', 'id', 'th', 'ms']) {
    const t = JSON.parse(await readFile(join(dir, `${lang}.json`), 'utf8')) as Translation
    expect(t.body, lang).toMatch(/50 (?:mg|มก\.)(?:\/(?:kg|กก\.) | cho mỗi kg )(?:berat|น้ำหนัก|trọng lượng)/u)
    expect(t.body, lang).not.toMatch(/50 (?:mg|มก\.)\/(?:kg|กก\.)(?! (?:berat|น้ำหนัก))/u)
  }
})

// A fish's summary states its card's figures, as the card is now: the sweep sends back any that doesn't (cardProblems).
// On 2026-11-07, 54 of 505 approved summaries didn't (size 27 figures, temperature 23, pH 18, hardness 10, difficulty 10,
// minimum tank 5): checked once when written, against a card that changed after (Cá neon vua: 23–27 °C, card 23–29 °C).
test('no approved summary states a figure its card doesn\'t show', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const cards = new Map((await loadAll({ root, lang: 'vi', publicBuild: true })).species.map(s => [s.id, cardOf(s)]))
  const left = (await readSummaries(root)).filter(s => s.review === 'approved' && cards.has(s.id)).flatMap(s => cardProblems(s, cards.get(s.id)!).map(p => `${s.id}: ${p}`))
  expect(left, 'run pnpm engine sweep').toEqual([])
}, slow(300_000)) // the real content loaded once: about 60 s on a loaded machine

// Every place, not the one a reader complained of: the sweep puts a generic word in Vietnamese each cycle, and the
// place-names step gives the name readers use (place-names.ts). 147 of 816 places on 2026-11-08, before them.
test('no Vietnamese place name keeps River, Island, Lake, Basin, Province, Mountains, Peninsula or Rio in another language', () => {
  const dir = fileURLToPath(new URL('../../../content/places', import.meta.url))
  const names = readdirSync(dir).map(id => (JSON.parse(readFileSync(`${dir}/${id}/vi.json`, 'utf8')) as { name: string }).name)
  expect(names.filter(n => ENGLISH_PLACE_WORD.test(n))).toEqual([])
})

// "dãy Cardamon range": the sweep keeps the Vietnamese kind word alone (the chief of staff, 14 Nov 2026).
test('no Vietnamese place name says its kind in Vietnamese and again in English', () => {
  const dir = fileURLToPath(new URL('../../../content/places', import.meta.url))
  const names = readdirSync(dir).map(id => (JSON.parse(readFileSync(`${dir}/${id}/vi.json`, 'utf8')) as { name: string }).name)
  expect(names.filter(n => kindTwice(n))).toEqual([])
})

// Alone, these read as a province or as nothing: "Bắc Giang" on a Chinese fish, "Mã" on a Vietnamese one.
test('no river a Vietnamese reader knows by name goes without its "sông"', () => {
  const dir = fileURLToPath(new URL('../../../content/places', import.meta.url))
  const names = readdirSync(dir).map(id => (JSON.parse(readFileSync(`${dir}/${id}/vi.json`, 'utf8')) as { name: string }).name)
  const known = ['Bắc Giang', 'Đông Giang', 'Tây Giang', 'Châu Giang', 'Mân Giang', 'Tùng Hoa', 'Nin', 'Dương Tử', 'Mê Kông', 'Sê Kông', 'Hoàng Hà', 'Lam', 'Mã', 'Vệ', 'Thu Bồn', 'Trà Khúc', 'Bến Hải']
  expect(names.filter(n => known.includes(n))).toEqual([])
})

// Settled from the fungus guide's source (Practical Fishkeeping, "Dealing with fish egg 'fungus'"): 1 ml per about 3.5
// litres is for 35% hydrogen peroxide. A reader here buys oxy già at the pharmacy, where it is 3% (market.ts), so a 35%
// dose that doesn't say so reads as a dose for that bottle, at about a twelfth of the strength.
test('a Vietnamese page that doses 35% oxy già says it isn\'t the pharmacy\'s 3%', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)), ['vi'])
  const strong = /(?:oxy già|hydrogen peroxide|H2O2)[^.!?]{0,40}35\s*%|35\s*%[^.!?]{0,40}(?:oxy già|hydrogen peroxide|H2O2)/i
  const told = /không phải[^.!?]{0,40}3\s*%[^.!?]{0,40}nhà thuốc/i
  const text = (p: (typeof pages)[number]) => [...p.fields.map(f => f.html), ...p.lines.map(l => l.text)].join(' ').replace(/<[^>]+>/g, ' ')
  expect(pages.filter(p => strong.test(text(p)) && !told.test(text(p))).map(p => p.path)).toEqual([])
}, slow(300_000))

// Two independent sources agreed against Seriously Fish on an adult size, far apart (Glaser, and FishBase from the checklist
// of South American fishes): the figure they agree on is the page's, on the card and in the text, whatever a re-read writes.
// Size and tank travel together: no source gives a tank for the larger fish, so the page shows none and says so.
const shownText = (fish: { sections: { key: string; source: string }[]; t: Translation }) => fish.sections.map(s => fish.t.sections[`${s.key}:${s.source}`] ?? '').join(' ')
test('a size two independent sources overrule is gone from the card and the text, and so is the tank set for the smaller fish', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const { species } = await loadAll({ root, lang: 'vi', publicBuild: true })
  for (const [id, size, old] of [['myloplus-schomburgkii', 45, /\(SL\)\s*:?\s*12 cm|120 × 40/], ['moenkhausia-oligolepis', 12, /\(SL\)\s*:?\s*5 cm|60 × 40|45 × 25/]] as const) {
    const fish = species.find(x => x.id === id)!
    expect(resolveDataCard(fish.dataCard.sizeCm!, 'sizeCm')?.value, id).toBe(size)
    expect(fish.dataCard.tankCm, id).toBeUndefined()
    expect(shownText(fish), id).not.toMatch(old)
    expect(shownText(fish), id).toContain(`không ghi kích thước bể cho cá dài tới ${size} cm`)
  }
}, slow(120_000))

// Seriously Fish's keeping range for it contradicts the wild reading on its own page; BW Aquatics sides with the reading.
test('a hardness against its source\'s own measured reading gives way to the source that sides with the reading, in every language', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  for (const lang of ['vi', 'id', 'th'] as const) {
    const fish = (await loadAll({ root, lang, publicBuild: true })).species.find(x => x.id === 'pseudomugil-furcatus')!
    expect(resolveDataCard(fish.dataCard.gh!, 'gh'), lang).toMatchObject({ value: { min: 4, max: 12 }, sources: ['bwaquatics'] })
    expect(shownText(fish), lang).not.toMatch(/15\s*[–-]\s*30/)
  }
}, slow(240_000))

// A shop search carries the words a page's text uses: the sweep writes them the readers' way (sanitize.ts viSearchWords),
// so one the writers' rules would change can't sit where the wording rule doesn't look (the reader of #1135, 2026-11-12).
test('no shop search has words the text writes another way', () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const slips: string[] = []
  for (const kind of ['species', 'plants']) for (const id of readdirSync(join(root, kind))) {
    let e: { productSlots?: { keywords: string[] }[] }
    try { e = JSON.parse(readFileSync(join(root, kind, id, 'entity.json'), 'utf8')) } catch { continue }
    for (const row of e.productSlots ?? []) for (const k of row.keywords) if (wordingSlips(k).length) slips.push(`${kind}/${id}: ${k}`)
  }
  expect(slips).toEqual([])
})

// The owner's report of 10 Nov: the Altum page said a hard, neutral tank is enough and that soft water is a must, under one
// heading. Where the sources can't both be true, the page shows the one that speaks for that heading (Seriously Fish for
// water, the owner's rule of 2026-11-06), whatever a later read of a source writes back into the page's file.
// The owner's report of 10 Nov: the chat rightly said the Altum page disagreed with itself about water. One block now, our
// figures first, the other source's reported in one sentence, and three editors at 9 (docs/review/editors.md).
test('the Altum page speaks with one voice about water, its own figures first', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const fish = (await loadAll({ root, lang: 'vi', publicBuild: true })).species.find(s => s.id === 'pterophyllum-altum')!
  expect(fish.sections.filter(s => s.key === 'waterConditions').map(s => s.source)).toEqual(['aquatome'])
  const water = fish.t.sections['waterConditions:aquatome']!
  expect(water.indexOf('4,8 đến 6,2')).toBeGreaterThan(-1)
  expect(water.indexOf('4,8 đến 6,2')).toBeLessThan(water.indexOf('Có tài liệu khác lại ghi là'))
}, slow(120_000))

test('a heading whose sources could not both be true speaks with one voice', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const voices = JSON.parse(readFileSync(join(root, 'one-voice.json'), 'utf8')) as Record<string, Record<string, string | false>>
  expect(Object.keys(voices)).toContain('pterophyllum-altum')
  const { species } = await loadAll({ root, lang: 'vi', publicBuild: true })
  const heard = (id: string, key: string) => species.find(s => s.id === id)?.sections.filter(x => x.key === key).map(x => x.source)
  for (const [id, keep] of Object.entries(voices)) for (const [key, source] of Object.entries(keep)) expect(heard(id, key), `${id} ${key}`).toEqual(source === false ? [] : [source])
}, slow(120_000))

// The chief of staff, 15 Nov 2026: Seriously Fish gives the African snakehead, a 40 cm predator, a 38 × 38 cm base and 55
// litres. Neither that figure nor the page's rounding of it is fit to read, so no source speaks under its tank heading
// (one-voice.json), and its quick facts lose their tank line, fixed so no read or translation brings it back. It stays so
// until a second source we may use gives a size that fits the fish. Its buy list's tank search, written with the page,
// said 55 litres too: it goes, and the sweep writes a tank search only from a tank the card shows. Held as the rule, so a
// fitting tank from a second source (the card shows it, the sweep writes its search) passes, and a too-small one doesn't.
test('the African snakehead shows no tank size, in any language, and the engine keeps it so', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const dir = join(root, 'species/parachanna-obscura')
  const facts = (JSON.parse(readFileSync(join(dir, 'entity.json'), 'utf8')) as { sections: { key: string; html: string; fixed?: boolean }[] }).sections.find(s => s.key === 'quickFacts')!
  expect(facts.fixed).toBe(true)
  const tank = /38\s*[×x]\s*38|40\s*[×x]\s*40|55\s*(?:lít|liter|litre|ลิตร)|aquarium size|kích thước bể|ukuran akuarium|ขนาดตู้|saiz akuarium/iu
  expect(facts.html).not.toMatch(tank)
  for (const lang of LANGS) {
    if (!existsSync(join(dir, `${lang}.json`))) continue
    const fish = (await loadAll({ root, lang, publicBuild: true })).species.find(s => s.id === 'parachanna-obscura')!
    expect(fish.sections.filter(s => s.key === 'aquariumSize'), lang).toEqual([])
    // Nor its text, which the gate's checks and the summary's writer read.
    expect(Object.keys(fish.t.sections).filter(k => k.startsWith('aquariumSize:')), lang).toEqual([])
    expect(Object.values(fish.t.sections).join(' '), lang).not.toMatch(tank)
    const shown = resolveDataCard(fish.dataCard.tankCm ?? [], 'tankCm')?.value
    const size = resolveDataCard(fish.dataCard.sizeCm ?? [], 'sizeCm')?.value
    if (typeof shown === 'number') expect(shown, `${lang}: a tank the card shows is at least twice the fish`).toBeGreaterThanOrEqual(2 * Number(size))
    if (lang !== 'vi') continue
    // The buy list is Vietnamese only.
    const slots = (JSON.parse(readFileSync(join(dir, 'entity.json'), 'utf8')) as { productSlots: { category: string; keywords: string[] }[] }).productSlots
    const tanks = slots.find(x => x.category === 'be-ca')?.keywords ?? []
    if (typeof shown === 'number') for (const k of tanks) expect(tankKeywordFits(k, shown), k).toBe(true)
    else expect(tanks).toEqual(['bể cá lớn nuôi cá săn mồi'])
  }
  const summary = JSON.parse(readFileSync(join(root, 'summaries/parachanna-obscura.json'), 'utf8')) as { summary: string; mistakes: string[] }
  expect([summary.summary, ...summary.mistakes].join(' ')).not.toMatch(/lít|\d\s*[×x]\s*\d/u)
}, slow(120_000))

// The neon tetra's blue stripe: The Spruce Pets said it starts at the tip of the nose, photos start it at the eye, and no
// other source says where it starts (2026-11-11). The page keeps what the sources agree on: it runs to the adipose fin.
test('the neon tetra\'s stripe has no starting point no source agrees on, in any language, and the engine keeps it so', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const notes = (JSON.parse(readFileSync(join(root, 'species/paracheirodon-innesi/entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string; fixed?: boolean }[] })
    .sections.find(s => s.key === 'notes' && s.source === 'sprucepets')!
  expect(notes.fixed).toBe(true)
  expect(notes.html).not.toMatch(/tip of the nose/)
  expect(notes.html).toMatch(/blue stripe that runs along the body to the adipose fin/)
  const nose = { vi: /chóp mõm đến vây mỡ/, id: /ujung moncong hingga/, th: /ปลายจมูกถึงครีบไขมัน/, ms: /hujung muncung hingga/ }
  for (const [lang, said] of Object.entries(nose)) {
    const t = JSON.parse(readFileSync(join(root, `species/paracheirodon-innesi/${lang}.json`), 'utf8')) as { sections: Record<string, string> }
    expect(t.sections['notes:sprucepets'], lang).not.toMatch(said)
  }
})

// The chief of staff, 2026-11-11: a card's school size is Seriously Fish's where it gives one (traits.ts sfSchool), as the
// card's other figures are. The cardinal tetra's card said 6 from another source, where Seriously Fish says 8-10.
test("every card's school size is Seriously Fish's where it gives one, never below another source's on the page; the cardinal tetra's is 8", async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const sources = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8')) as Record<string, Parameters<typeof mayPublish>[0]>
  const wrong: string[] = []
  for (const t of await readTraits(root)) {
    const e = JSON.parse(readFileSync(join(root, 'species', t.id, 'entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string }[] }
    const n = cardSchool(e.sections, s => mayPublish(sources[s], 'text'))
    if (n !== null && n !== t.schoolMin) wrong.push(`${t.id}: ${t.schoolMin} (should be ${n})`)
  }
  expect(wrong).toEqual([])
  expect((await readTraits(root)).find(t => t.id === 'paracheirodon-axelrodi')?.schoolMin).toBe(8)
})

// The owner, 2026-11-11, on the app's list of guides: "Duplicated". No two guides in a language share a title, and none is
// only a name (content-rules.ts guide-title), in every language. The pages here had one on 11 Nov: 2Hr Aquarist's 27 tank
// pages, titled with the aquascaper's name, and two videos with one title: all 29 titled by hand (nameFixed). A new one
// the sweep doesn't title (guide-titles.ts, ten a run) fails here.
test('no two guides in a language share a title, and none is only a name', async () => {
  const guides = (await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))).filter(p => p.kind === 'guides')
  const { findings, errors } = checkPages(guides, RULES.filter(r => r.id === 'guide-title'))
  expect(errors).toEqual([])
  expect(findings.map(f => `${f.page.lang}/${f.page.id}: ${f.detail}`)).toEqual([])
}, slow(300_000))

// Curation & Media, 2026-11-15: "Một loài cá rô phi lùn hoàn toàn mới" for "A brand-new dwarf cichlid". "Cá rô phi" is a
// tilapia, and a guide's title heads it, picks its picture and made its address. A guide whose English is kept here
// (sources/) says "rô phi" in its title only where that English names a tilapia; a video's transcript isn't kept here, and
// isn't judged. The two that did on 15 Nov were titled by hand (nameFixed), their old address forwarding with no note, so
// the tilapia's words aren't searched for.
const CICHLID_TITLES: Record<string, { name: string; was: string }> = {
  'glaser-en-25-perchlike-fishes-25d-perchlike-fishes-4-south-american-dwarf-cichlids-a-brandnew-dwarf-cichlid-apistogramma-sp-cristal-en':
    { name: 'Một loài cá cichlid lùn hoàn toàn mới: Apistogramma sp. Cristal', was: 'mot-loai-ca-ro-phi-lun-hoan-toan-moi-apistogramma-sp-cristal' },
  'seriouslyfish-articles-major-changes-in-new-world-cichlid-taxonomy':
    { name: 'Những thay đổi lớn trong phân loại cá cichlid Tân Thế Giới', was: 'nhung-thay-doi-lon-trong-phan-loai-ca-ro-phi-tan-the-gioi' },
}
test('no guide calls a cichlid a tilapia in its title', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const dir = join(root, 'content/guides')
  const wrong = readdirSync(dir).filter(id => existsSync(join(dir, id, 'vi.json'))).flatMap(id => {
    const e = JSON.parse(readFileSync(join(dir, id, 'entity.json'), 'utf8')) as { source: string; sourceUrl: string }
    const en = join(root, 'sources', e.source, `${snapshotName(e.sourceUrl)}.md`)
    const t = JSON.parse(readFileSync(join(dir, id, 'vi.json'), 'utf8')) as Translation
    return existsSync(en) && tilapiaUnnamed(t.name, readFileSync(en, 'utf8')) ? [`${id}: ${t.name}`] : []
  })
  expect(wrong).toEqual([])
  for (const [id, r] of Object.entries(CICHLID_TITLES)) {
    const t = JSON.parse(readFileSync(join(dir, id, 'vi.json'), 'utf8')) as Translation & { redirectFrom?: { slug: string; name: string }[] }
    expect([t.name, t.nameFixed, t.altNames.filter(n => /rô phi/i.test(n)), t.redirectFrom], id).toEqual([r.name, true, [], [{ slug: r.was, name: '' }]])
    expect(t.slug, id).not.toMatch(/ro-phi/)
  }
})

// The chief of staff, 14 Nov 2026: the gallery posts of other people's tanks (66 on 14 Nov) and the 13 Nov sheet's
// seller-site notices go off for good, every address forwarding (@aq/schema retired.ts). Each named one is a guide the
// content has, and each forwards to a page it has: a typo would leave a guide up, or forward to nothing.
// The seller-site notices (the chief of staff, 14 Nov 2026): the lasting fact in each goes to its fish's page under the
// dealer's name and the notice's address, in the notice's own sentences, cut and never added to (the Writing Lead's rule
// for a part fixed by hand), and fixed, so no read of the source or rewrite takes it again. The notice then goes off.
// [fish, part, the notice's address, its stored English in sources/glaser/]
const FOLDS: [string, string, string, string][] = [
  ['corydoras-adolfoi', 'notes', 'https://www.aquariumglaser.de/en/10-catfishes/10a-catfishes-corydoras-co/corydoras_eques_c_sp_aff_armatus_and_corydoras_duplicareus_en/', 'en-10-catfishes-10a-catfishes-corydoras-co-corydoras-eques-c-sp-aff-armatus-and-corydoras-duplicareus-en.md'],
  ['corydoras-duplicareus', 'notes', 'https://www.aquariumglaser.de/en/10-catfishes/10a-catfishes-corydoras-co/corydoras_eques_c_sp_aff_armatus_and_corydoras_duplicareus_en/', 'en-10-catfishes-10a-catfishes-corydoras-co-corydoras-eques-c-sp-aff-armatus-and-corydoras-duplicareus-en.md'],
  ['scleropages-leichardti', 'reproduction', 'https://www.aquariumglaser.de/en/03-bony-tongues/scleropages_jardinii_and_s_leichardti_en/', 'en-03-bony-tongues-scleropages-jardinii-and-s-leichardti-en.md'],
  ['scleropages-leichardti', 'behaviour', 'https://www.aquariumglaser.de/en/03-bony-tongues/scleropages_jardinii_and_s_leichardti_en/', 'en-03-bony-tongues-scleropages-jardinii-and-s-leichardti-en.md'],
  ['gasteropelecus-maculatus', 'notes', 'https://www.aquariumglaser.de/en/09-characoids-tetra-relationship/thoracocharax-stellatus-gasteropelecus-maculatus-jumbo-carnegiella-myersi-carnegiella-strigata-2/', 'en-09-characoids-tetra-relationship-thoracocharax-stellatus-gasteropelecus-maculatus-jumbo-carnegiella-myersi-carnegiella-strigata-2.md'],
  ['limia-perugiae', 'behaviour', 'https://www.aquariumglaser.de/en/18-toothcarps-killis-and-livebearers/limia_special_en/', 'en-18-toothcarps-killis-and-livebearers-limia-special-en.md'],
  ['limia-melanogaster', 'behaviour', 'https://www.aquariumglaser.de/en/18-toothcarps-killis-and-livebearers/limia_special_en/', 'en-18-toothcarps-killis-and-livebearers-limia-special-en.md'],
  ['limia-nigrofasciata', 'behaviour', 'https://www.aquariumglaser.de/en/18-toothcarps-killis-and-livebearers/limia_special_en/', 'en-18-toothcarps-killis-and-livebearers-limia-special-en.md'],
  ['limia-nigrofasciata', 'notes', 'https://www.aquariumglaser.de/en/18-toothcarps-killis-and-livebearers/limia_special_en/', 'en-18-toothcarps-killis-and-livebearers-limia-special-en.md'],
  ['hyphessobrycon-pyrrhonotus', 'notes', 'https://www.aquariumglaser.de/en/fisharchive/hyphessobrycon-pyrrhonotus-juvenile/', 'en-fisharchive-hyphessobrycon-pyrrhonotus-juvenile.md'],
  ['cichla-ocellaris', 'notes', 'https://www.aquariumglaser.de/en/general/cichla-ocellaris-x-melaniae-hybrid-2/', 'en-general-cichla-ocellaris-x-melaniae-hybrid-2.md'],
  ['protopterus-dolloi', 'behaviour', 'https://www.aquariumglaser.de/en/29-lungfishes/lungfishes-from-the-congo/', 'en-29-lungfishes-lungfishes-from-the-congo.md'],
  ['protopterus-annectens', 'behaviour', 'https://www.aquariumglaser.de/en/29-lungfishes/lungfishes-from-the-congo/', 'en-29-lungfishes-lungfishes-from-the-congo.md'],
  ['corydoras-robustus', 'dimorphism', 'https://www.aquariumglaser.de/en/10-catfishes/10a-catfishes-corydoras-co/show_corydoras_arrived__en/', 'en-10-catfishes-10a-catfishes-corydoras-co-show-corydoras-arrived-en.md'],
  ['distichodus-sexfasciatus', 'notes', 'https://www.aquariumglaser.de/en/32-all-the-rest/congo_importation_arrived__en/', 'en-32-all-the-rest-congo-importation-arrived-en.md'],
  ['pelvicachromis-rubrolabiatus', 'dimorphism', 'https://www.aquariumglaser.de/en/32-all-the-rest/finally_an_import_from_guinea__en/', 'en-32-all-the-rest-finally-an-import-from-guinea-en.md'],
  ['thoracocharax-stellatus', 'notes', 'https://www.aquariumglaser.de/en/09-characoids-tetra-relationship/thoracocharax-stellatus-gasteropelecus-maculatus-jumbo-carnegiella-myersi-carnegiella-strigata-2/', 'en-09-characoids-tetra-relationship-thoracocharax-stellatus-gasteropelecus-maculatus-jumbo-carnegiella-myersi-carnegiella-strigata-2.md'],
  ['carnegiella-myersi', 'dimorphism', 'https://www.aquariumglaser.de/en/09-characoids-tetra-relationship/thoracocharax-stellatus-gasteropelecus-maculatus-jumbo-carnegiella-myersi-carnegiella-strigata-2/', 'en-09-characoids-tetra-relationship-thoracocharax-stellatus-gasteropelecus-maculatus-jumbo-carnegiella-myersi-carnegiella-strigata-2.md'],
  ['acanthicus-adonis', 'notes', 'https://www.aquariumglaser.de/en/10-catfishes/10b-catfishes-suckermouths-plecos-and-l-numbers/huge_acanthicus_adonis_arrived__en/', 'en-10-catfishes-10b-catfishes-suckermouths-plecos-and-l-numbers-huge-acanthicus-adonis-arrived-en.md'],
]
test('each seller notice\'s lasting fact is on its fish\'s page as the build shows it, cited to the notice, in its own sentences, and fixed', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const { species } = await loadAll({ root, lang: 'vi', publicBuild: true })
  const words = (x: string) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  for (const [fish, key, url, file] of FOLDS) {
    const page = species.find(s => s.id === fish)
    expect(page, fish).toBeDefined()
    const part = page!.sections.find(s => s.key === key && s.source === 'glaser' && s.sourceUrl === url)
    expect(part, `${fish} ${key}`).toBeDefined()
    expect(part!.fixed, fish).toBe(true)
    expect(page!.t.sections[`${key}:glaser`], fish).toMatch(/^<p>.+<\/p>$/)
    // Credited to the dealer by the page's references, never named in a sentence (the page read's rule; the Writing Lead,
    // 15 Nov 2026).
    expect(page!.t.sections[`${key}:glaser`], fish).not.toMatch(/Glaser/)
    // Every English sentence is the notice's own, word for word.
    const said = words(readFileSync(join(root, '../sources/glaser', file), 'utf8'))
    for (const sentence of words(part!.html).split(/(?<=[.!?])\s+/)) expect(said, `${fish}: "${sentence}"`).toContain(sentence.replace(/[.!?]$/, ''))
  }
}, slow(300_000)) // the real content loaded once, as the build does

// The seller notices kept as guides (the Writing Lead, 15 Nov 2026): cut, a sentence of the dealer's own kept under the
// dealer's name, and fixed, so no rewrite brings a stock line back; the two whose titles announced an arrival renamed from
// the notice's own facts, the old address forwarding.
// The Cichla hybrid notice's lasting line (the Writing Lead, 15 Nov 2026): the genus grown from five species to 15, on C.
// ocellaris's dealer part, where the wild-hybrids line is; not the dealer's own hybrids' looks, nor the genus's record size.
test('C. ocellaris\'s dealer notes say the genus grew from five species to 15, and give no second size', () => {
  const dir = fileURLToPath(new URL('../../../content/species/cichla-ocellaris', import.meta.url))
  const en = (JSON.parse(readFileSync(join(dir, 'entity.json'), 'utf8')) as { sections: { key: string; source: string; html: string }[] }).sections.find(s => s.key === 'notes' && s.source === 'glaser')!.html
  const vi = (JSON.parse(readFileSync(join(dir, 'vi.json'), 'utf8')) as Translation).sections!['notes:glaser']!
  expect(en).toContain('The 5 species known until then have become 15 species.')
  expect(vi).toContain('chỉ có 5 loài được biết đến, nay đã thành 15 loài')
  expect(`${en} ${vi}`).not.toMatch(/80|100 cm|intermediate|trung gian/)
})

// The lungfish notice's bites (the Writing Lead, 15 Nov 2026): on P. annectens's page, the site having no P. aethiopicus
// page, hedged as the notice is ("often", "it seems").
test('P. annectens\'s dealer part says its bites often seem a mistake for food, hedged as the notice is', () => {
  const vi = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../content/species/protopterus-annectens/vi.json', import.meta.url)), 'utf8')) as Translation).sections!['behaviour:glaser']
  expect(vi).toBe('<p>Cá cắn nhau nhiều khi có vẻ là đớp nhầm vì tưởng là mồi.</p>')
})

// C. robustus's sexing part (the Writing Lead, 15 Nov 2026): the narcissus notice's two lines under its address, so the
// ventral fins link to a page that says them; "females a little bigger" stays in the quick facts, under the bred article.
// Indonesian and Thai lose their old text, so the translator makes the new part: either may have the part, never the old
// text (until 16 Nov this asked for no part at all, and held two rewrite cycles whose translations were right).
const ROBUSTUS_OLD_SEXING: Record<string, string> = {
  id: '<p>Betina tumbuh sedikit lebih besar daripada jantan. Jari-jari sirip punggung pada kedua jenis kelamin tumbuh panjang.</p>',
  th: '<p>ตัวเมียโตกว่าตัวผู้เล็กน้อย ทั้งสองเพศมีก้านครีบหลังยาว</p>',
}
test('C. robustus\'s dealer sexing part is the notice\'s ventral-fins line, and its quick facts keep the females\' size', () => {
  const dir = fileURLToPath(new URL('../../../content/species/corydoras-robustus', import.meta.url))
  const read = <T>(f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T
  const parts = read<{ sections: { key: string; source: string; html: string }[] }>('entity.json').sections.filter(s => s.source === 'glaser')
  expect(parts.find(s => s.key === 'dimorphism')!.html).toContain('The sexes can be told best apart by the shape of the ventral fins.')
  expect(parts.find(s => s.key === 'quickFacts')!.html).toContain('Females become somewhat bigger than males.')
  expect(read<Translation>('vi.json').sections!['dimorphism:glaser']).toBe('<p>Ở C. robustus, cả cá đực lẫn cá cái đều có vây lưng dài. Cách phân biệt đực cái tốt nhất là nhìn hình dạng vây bụng.</p>')
  for (const l of ['id', 'th']) expect(read<Translation>(`${l}.json`).sections?.['dimorphism:glaser'], l).not.toBe(ROBUSTUS_OLD_SEXING[l])
  // The notice itself forwards to C. narcissus, the fish it's mostly about; nothing of narcissus moves (ruling b).
  expect(RETIRED_GUIDES['glaser-en-10-catfishes-10a-catfishes-corydoras-co-show-corydoras-arrived-en']).toEqual({ kind: 'species', id: 'corydoras-narcissus' })
})

// Two more lasting lines (the Writing Lead, 15 Nov 2026), each under its notice's address so its link goes to a page that
// says it: the lungfish notice's "predators, for experienced keepers only" on P. dolloi, with its other lines, about the
// group ("Các loài … đều"), since "Cá phổi châu Phi" is P. annectens's page name; and the eques notice's look-alike line
// on C. duplicareus, after the name's meaning in the part already under that address (the Writing Lead, 16:24).
// Indonesian and Thai had no such part, so the translator makes it: when it has, both lines, each naming C. adolfoi.
test('P. dolloi\'s dealer part says African lungfishes are predators for experienced keepers, and C. duplicareus\'s that it is hard to tell from C. adolfoi', () => {
  const read = <T>(fish: string, f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../content/species/${fish}/${f}`, import.meta.url)), 'utf8')) as T
  const en = (fish: string, key: string) => read<{ sections: { key: string; source: string; html: string }[] }>(fish, 'entity.json').sections.find(s => s.key === key && s.source === 'glaser')!.html
  expect(en('protopterus-dolloi', 'behaviour')).toMatch(/^<p>African lungfishes are predatory fish and suited only for specialists\. The pugnacity/)
  expect(read<Translation>('protopterus-dolloi', 'vi.json').sections!['behaviour:glaser']).toMatch(/^<p>Các loài cá phổi châu Phi đều là cá săn mồi, chỉ hợp với người chơi đã có kinh nghiệm\. Có vẻ/)
  expect(en('corydoras-duplicareus', 'notes')).toBe('<p>duplicareus: Latin for doubled; refers to the extreme similarity to C. adolfoi.</p><p>The only problem with this Corydoras gem is to distinguish it from its close relative C. adolfoi. Otherwise the fish is undemanding.</p>')
  expect(read<Translation>('corydoras-duplicareus', 'vi.json').sections!['notes:glaser']).toBe('<p>duplicareus: tiếng Latinh nghĩa là "nhân đôi", ý chỉ loài này cực kỳ giống C. adolfoi.</p><p>Cái khó duy nhất với loài cá chuột này là phân biệt nó với cá chuột Adolfo (C. adolfoi), một loài rất gần. Ngoài chuyện đó thì cá dễ nuôi.</p>')
  for (const l of ['id', 'th']) {
    const part = read<Translation>('corydoras-duplicareus', `${l}.json`).sections?.['notes:glaser']
    if (part !== undefined) expect(part.split('</p>').filter(p => p.trim()).map(p => /adolfoi/.test(p)), l).toEqual([true, true])
  }
})

test('the seller notices kept as guides say nothing of the dealer\'s stock, and the two renamed forward', () => {
  const dir = fileURLToPath(new URL('../../../content/guides', import.meta.url))
  const kept: [string, string?, string?][] = [
    ['glaser-en-08-carp-like-fishes-2-barbs-minnows-carps-goldfish-etc-labeo-parvus-and-l-barbatus-en'],
    ['glaser-en-10-catfishes-10b-catfishes-suckermouths-plecos-and-l-numbers-l167-arrived-en', 'Cá L167: loài Cochliodon ăn gỗ từ Rio Negro', 'ca-l167-da-duoc-nhap-ve'],
    ['glaser-en-10-catfishes-10c-catfishes-remaining-catfish-from-south-america-astroblepus-from-peru-imported-en', 'Cá Astroblepus: họ hàng không có giáp của các loài cá L', 'ca-da-tron-astroblepus-tu-peru-lan-dau-duoc-nhap-khau'],
  ]
  for (const [id, name, was] of kept) {
    const t = JSON.parse(readFileSync(join(dir, id, 'vi.json'), 'utf8')) as Translation & { redirectFrom?: { slug: string; name: string }[] }
    expect(t.bodyFixed, id).toBe(true)
    expect(t.body, id).not.toMatch(/chúng tôi|khách hàng|hàng tồn kho|bán buôn|có hàng trở lại|đang có|Đợt này|lần đầu tiên|Lô cá này|Văn bản và ảnh|Glaser|nhập về đến giờ/iu)
    if (name) expect([t.name, t.nameFixed, t.slug, t.redirectFrom], id).toEqual([name, true, slugify(name), [{ slug: was, name: '' }]])
  }
})

test('every guide taken off for good is one the content has, and forwards to a page it has', () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  for (const [id, to] of Object.entries(RETIRED_GUIDES)) {
    expect(existsSync(join(content, 'guides', id, 'vi.json')), id).toBe(true)
    if (to !== 'guides') expect(existsSync(join(content, to.kind, to.id, 'vi.json')), `${id} → ${to.kind}/${to.id}`).toBe(true)
  }
  expect(Object.keys(RETIRED_GUIDES)).toHaveLength(34)
  expect(readdirSync(join(content, 'guides')).filter(id => GALLERY_POST.test(id)).length).toBeGreaterThanOrEqual(66)
})

// The chief of staff's rulings of 2026-11-12 on the tap-water report. Each is a hand fix the engine keeps: a guide's body
// marked bodyFixed, a page's part marked fixed (in English and in each language beside it), a note of ours in localNote.
// The own-voice audit (the chief of staff, 2026-11-12: a source is never credited with words it did not say). A hand fix
// may cut a source's part; it adds nothing the source didn't say. The porthole catfish's breeding part had gained "and it
// is rarely bred in home aquaria", which is Scotcat's and Fishkeeper's, under Seriously Fish's name.
test('a source\'s part fixed by hand says only what the source says: the porthole catfish\'s breeding part is Seriously Fish\'s', () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const read = <T>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
  const e = read<{ sections: { key: string; source: string; html: string; fixed?: boolean }[] }>('species/dianema-longibarbis/entity.json')
  const sf = e.sections.find(s => s.key === 'reproduction' && s.source === 'seriouslyfish')!
  expect(sf.fixed).toBe(true)
  expect(sf.html).toBe('<p>Very scant information exists regarding the spawning of this fish in captivity.</p>')
  const vi = read<{ sections: Record<string, string> }>('species/dianema-longibarbis/vi.json').sections
  expect(vi['reproduction:seriouslyfish']).toBe('<p>Hiện có rất ít thông tin về chuyện loài này sinh sản trong bể nuôi.</p>')
})

// The chief of staff, 15 Nov 2026: the rewrite of 14 Nov took two care facts whole for a half its read flagged ("but these
// fish are quite peaceful so far", the source's own batch; "in a hot country", written for a reader in a cold one). Each
// is back with its general half only, fixed by hand so no rewrite, read of its source or translation takes it again. The
// source's "tropical pond" is about the water, and the north of Vietnam has cold winters: the pond keeps its warmth, said of
// the water, naming no country (the chief of staff, 15 Nov 2026: a climate condition is kept as warmth, never dropped).
test('two care facts a rewrite took whole are back with their general half, fixed: Leporinus fight their own kind, Osphronemus breed in a huge tank or a pond warm all year', () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const read = <T>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
  const part = (id: string, key: string, source: string) => {
    const s = read<{ sections: { key: string; source: string; html: string; fixed?: boolean }[] }>(`species/${id}/entity.json`).sections.find(x => x.key === key && x.source === source)
    return { en: s, vi: read<{ sections: Record<string, string> }>(`species/${id}/vi.json`).sections[`${key}:${source}`] }
  }
  const leporinus = part('leporinus-fasciatus-tigrinus', 'behaviour', 'glaser')
  expect(leporinus.en?.fixed).toBe(true)
  expect(leporinus.en?.html).toBe('<p>Leporinus are known to be sometimes quarrelsome against their own kind.</p>')
  expect(leporinus.vi).toBe('<p>Cá Leporinus đôi khi hay gây gổ với cá cùng loài.</p>')
  const osphronemus = part('osphronemus-exodon', 'reproduction', 'seriouslyfish')
  expect(osphronemus.en?.fixed).toBe(true)
  expect(osphronemus.en?.html).toMatch(/Obviously an enormous aquarium, or perhaps a tropical pond, would be required for any serious breeding attempt\.<\/p>$/)
  expect(osphronemus.vi).toMatch(/Muốn cho đẻ nghiêm túc thì dĩ nhiên phải có bể cực lớn, hoặc có lẽ là một cái ao nước ấm quanh năm\.<\/p>$/)
  expect(osphronemus.vi).not.toMatch(/xứ nóng/)
})

test('the care facts a product\'s sentence carried are back without the product, each in a part a person fixed', () => {
  // 15 Nov 2026: the products-first cut took these sentences whole for naming a product; their care fact goes back in
  // general words the same day (the chief of staff), fixed so the writer and the translator leave it.
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const read = <T>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
  const part = (id: string, key: string, source: string) => {
    const s = read<{ sections: { key: string; source: string; fixed?: boolean }[] }>(`species/${id}/entity.json`).sections.find(x => x.key === key && x.source === source)
    return { fixed: s?.fixed, vi: read<{ sections: Record<string, string> }>(`species/${id}/vi.json`).sections[`${key}:${source}`] ?? '' }
  }
  const species: [string, string, RegExp][] = [
    ['neocaridina-davidi', 'waterConditions', /San hô vụn giúp tăng KH\. Còn muốn tăng GH thì dùng khoáng bổ sung\./],
    ['melanotaenia-praecox', 'waterConditions', /Muốn tăng GH thì dùng thêm khoáng bổ sung\./],
    ['colomesus-asellus', 'beforeYouBuy', /rồi chờ hai tuần\. Sau đó, cho cá dùng một đợt thuốc tẩy giun theo hướng dẫn trên hộp, rồi chờ một tháng\. Cuối cùng/],
  ]
  for (const [id, key, said] of species) {
    const x = part(id, key, 'aquariumcoop')
    expect(x.fixed, id).toBe(true)
    expect(x.vi, id).toMatch(said)
  }
  const guides: [string, RegExp][] = [
    ['aquariumbreeder-how-to-remove-brown-algae-diatoms-in-freshwater-tanks', /Bạn có hai cách chính để tăng CO2:<\/p><ul><li>Châm CO2 bằng bình khí nén\.<\/li><li>Dùng cacbon nước\.<\/li><\/ul>/],
    ['aquariumcoop-blogs-aquarium-55-gallon-fish', /Nếu GH thấp, hãy bổ sung khoáng để cá và cây luôn khỏe\./],
    ['aquariumcoop-blogs-aquarium-algae-removal', /<li>Nếu nitrat dưới 20 ppm, bạn châm phân nước tổng hợp \(all-in-one\) cho đến khi nitrat trong nước lên 20 ppm\.<\/li>/],
  ]
  for (const [id, said] of guides) {
    const t = read<{ body: string; bodyFixed?: boolean }>(`guides/${id}/vi.json`)
    expect(t.bodyFixed, id).toBe(true)
    expect(t.body, id).toMatch(said)
  }
  // None names the products the cut took them off for.
  const all = [...species.map(([id, key]) => part(id, key, 'aquariumcoop').vi), ...guides.map(([id]) => read<{ body: string }>(`guides/${id}/vi.json`).body)].join(' ')
  expect(all).not.toMatch(/Wonder Shell|Equilibrium|ParaCleanse|Flourish Excel|Easy Carbo|Easy Green/)
})

// The Glossary lead, the Writing lead and the chief of staff, 17 Nov 2026: six live guides said a Singapore shop's figures, or research's own
// "relevant to Vietnam", as if of Vietnam (the research prompt filed other countries' pages under its Vietnam section). Each
// figure keeps the place its page measured, a line no page supports goes, and each body is a person's (bodyFixed), so no
// writer puts one back.
const PLACE_KEPT: Record<string, { gone: string[]; said: string[] }> = {
  'aquatome-ca-bi-san-mang-gill-flukes-dau-hieu-cach-chua-va-phong': { gone: ['Ở xứ nóng, phòng không máy lạnh'], said: ['Ở Singapore, phòng không máy lạnh có thể lên 28–31 °C.'] },
  'aquatome-ca-bo-an-khong-chiu-an-nguyen-nhan-va-cach-xu-ly': {
    gone: ['gần giống miền Nam', '<li>Bể đặt trong phòng không máy lạnh', '<li>Phòng có máy lạnh lúc bật lúc tắt', 'nhanh. Rủi ro chính về nhiệt độ'],
    said: ['Ở Singapore, rủi ro chính về nhiệt độ là nước quá nóng chứ không phải quá lạnh.', 'Một cửa hàng cá ở Singapore ghi: bể đặt trong phòng không máy lạnh có thể vượt 32°C', 'Một cửa hàng cá ở Singapore khuyên: phòng có máy lạnh lúc bật lúc tắt thì cài sưởi ở 25–26°C'],
  },
  'aquatome-san-dep-planaria-va-thuy-tuc-hydra-trong-be-ca-be-tep-nhan-biet-va-cach-diet': { gone: ['Nước ở vùng nhiệt đới thường ở mức 28–32', 'ở đây cho ăn cẩn thận'], said: ['Một cửa hàng cá ở Singapore ghi: trong nước nhiệt đới 28–32 °C, chất hữu cơ phân hủy rất nhanh, vì vậy cho ăn cẩn thận'] },
  'aquatome-cach-lam-trong-nuoc-be-ca-bi-duc': { gone: ['mùa nóng ở nước mình'], said: ['Bể đã chạy lâu mà tự dưng đục trắng thì có thể là do những tháng nóng, hoặc do bể đón ánh sáng ban ngày quá lâu.'] },
  'aquatome-nuoc-be-ca-bi-xanh-do-tao-xanh-va-cach-xu-ly': { gone: ['mùa nóng ở Việt Nam', 'nguy hiểm nhất'], said: ['nên nước càng ấm thì đêm thiếu oxy càng nguy hiểm.'] },
  'aquatome-nuoi-ca-trong-binh-chau-khong-loc-khong-sui-oxy-loai-nao-song-duoc-va-cach-cham': { gone: ['không riêng Việt Nam', 'mùa hè ở mình'], said: ['Nước càng ấm thì càng giữ được ít oxy. Vì vậy vào mùa nóng, bình đặt trong nhà dễ cần sủi thêm hơn.'] },
}
test.each(Object.entries(PLACE_KEPT))('advice for elsewhere: %s keeps each figure\'s place and says nothing of Vietnam its pages don\'t', (id, { gone, said }) => {
  const t = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../content/guides/${id}/vi.json`, import.meta.url)), 'utf8')) as { body: string; bodyFixed?: boolean }
  expect(t.bodyFixed).toBe(true)
  for (const g of gone) expect(t.body).not.toContain(g)
  for (const x of said) expect(t.body).toContain(x)
})

test('the tap-water fixes hold: Seachem Prime named at its dose, our note on water for lucky bamboo beside its source\'s, our chloramine note, artemia salt in grams', () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const read = <T>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
  type Guide = { body: string; bodyFixed?: boolean; faqFixed?: boolean; summary?: string[]; faq?: { q: string; a: string }[]; localNote?: { html: string; refs: { url: string }[] } }
  // Our dechlorinating guide: the dose's product is one the shops here sell, so the reader check doesn't hold the dose.
  const prime = read<Guide>('guides/aquatome-khu-clo-nuoc-may-cho-be-ca-cac-cach-va-cach-nao-an-toan/vi.json')
  expect(prime.bodyFixed).toBe(true)
  expect(prime.body).toMatch(/<h3>Liều dùng Seachem Prime theo nhà sản xuất<\/h3>\s*<p>[^<]*<\/p>\s*<ul>\s*<li>1 nắp \(5 mL\) cho 200 L/)
  expect(productOf('Seachem Prime', 'vi')?.status).toBe('sold')
  // Lucky bamboo (the chief of staff, 2026-11-12: a source is never credited with words it did not say). Aquarium Breeder's
  // parts keep what it says, RO or distilled water and dechlorinated tap water if you use it; the ruling, RO with minerals
  // added back where animals share the water and pure water only for the plant by itself, is our own part, labelled, with
  // its sources, in every language the page has.
  const ours = { en: /^<p><strong>AquaTome's note:<\/strong> RO or distilled water with no minerals added back, as above, is for lucky bamboo kept by itself\. Where fish, shrimp or snails share the water, use RO water with minerals added back: shrimp and snails need minerals that pure water lacks\.<\/p>$/, vi: /^<p><strong>Ghi chú của AquaTome:<\/strong> [^<]*chỉ hợp khi trồng trúc phú quý riêng\. Bể có cá, tép hay ốc sống chung thì dùng nước RO đã bù khoáng, vì tép và ốc cần khoáng/, id: /^<p><strong>Catatan AquaTome:<\/strong> [^<]*hanya cocok kalau bambu hoki dipelihara sendiri\. Kalau ada ikan, udang, atau siput di air yang sama, gunakan air RO yang sudah ditambah mineral, karena udang dan siput butuh mineral/, th: /^<p><strong>หมายเหตุจาก AquaTome:<\/strong> [^<]*เหมาะเฉพาะเมื่อปลูกไผ่กวนอิมไว้อย่างเดียว ถ้ามีปลา กุ้ง หรือหอยอยู่ในน้ำเดียวกัน ให้ใช้น้ำ RO ที่เติมแร่ธาตุแล้ว เพราะกุ้งและหอยต้องการแร่ธาตุ/ }
  // Tap water is Aquarium Breeder's to say (its care part), so the note leaves it out.
  const tap = { en: /tap water/i, vi: /nước máy|khử clo/, id: /air keran|klorin/, th: /น้ำประปา|คลอรีน/ }
  const ruling = { en: /minerals added back|kept by itself/, vi: /bù khoáng|trồng (?:trúc phú quý )?riêng/, id: /ditambah mineral|dipelihara sendiri/, th: /เติมแร่ธาตุ|ไว้อย่างเดียว/ }
  const plant = read<{ sections: { key: string; source: string; html: string; refs?: number[]; fixed?: boolean }[]; refs?: { url: string }[] }>('plants/dracaena-sanderiana/entity.json')
  const note = plant.sections.find(s => s.key === 'waterConditions' && s.source === 'aquatome')!
  expect(note.fixed).toBe(true)
  expect(note.html).toMatch(ours.en)
  // Its mark names the page its facts come from (docs/governance.md): shrimp need minerals in the water, RO/DI water takes a
  // remineralizer, and snails suffer in distilled water, which has none (the last in its author's reply there). No page it
  // cites says otherwise: Seneye's RO page, which says pure RO is never used on its own, isn't cited (the third
  // independent read). Whom the advice is for, fish included, is the ruling's, by the label.
  expect(note.refs!.map(i => plant.refs![i]!.url)).toEqual(['https://aquariumbreeder.com/shrimp-keeping-can-i-remineralize-tap-water/'])
  expect(note.html).not.toMatch(tap.en)
  // Aquarium Breeder's care part says the weekly water change too, RO or distilled water only (the gate's harm read of
  // 9 Nov quoted it): our note right after it as well, the same ruling, its source and label, so the care part read alone
  // has it.
  const label = { vi: 'Ghi chú của AquaTome', id: 'Catatan AquaTome', th: 'หมายเหตุจาก AquaTome' }
  const careAt = plant.sections.findIndex(s => s.key === 'maintenance' && s.source === 'aquatome')
  const care = plant.sections[careAt]!
  expect(plant.sections[careAt - 1]).toMatchObject({ key: 'maintenance', source: 'aquariumbreeder' })
  expect([care.fixed, care.refs!.map(i => plant.refs![i]!.url)]).toEqual([true, ['https://aquariumbreeder.com/shrimp-keeping-can-i-remineralize-tap-water/']])
  expect(care.html).toMatch(/^<p><strong>AquaTome's note:<\/strong> For the weekly water change too, /)
  expect(care.html).toMatch(ruling.en)
  expect(care.html).not.toMatch(tap.en)
  // What Aquarium Breeder says stays its own, in every language: RO or distilled water, tap water dechlorinated first.
  const says = { vi: [/nước RO hoặc nước cất/, /khử clo trước/], id: [/air RO atau air suling/, /hilangkan klorinnya dulu/], th: [/น้ำ RO หรือน้ำกลั่น/, /ต้องกำจัดคลอรีนก่อน/] }
  for (const lang of ['vi', 'id', 'th'] as const) {
    const t = read<{ sections: Record<string, string> }>(`plants/dracaena-sanderiana/${lang}.json`).sections
    expect(t['waterConditions:aquatome'], lang).toMatch(ours[lang])
    expect(t['waterConditions:aquatome'], lang).not.toMatch(tap[lang])
    expect(t['maintenance:aquatome'], lang).toMatch(new RegExp(`^<p><strong>${label[lang]}:</strong> `))
    expect(t['maintenance:aquatome'], lang).toMatch(ruling[lang])
    expect(t['maintenance:aquatome'], lang).not.toMatch(tap[lang])
    for (const key of ['maintenance', 'waterConditions']) expect(t[`${key}:aquariumbreeder`], `${lang} ${key}`).not.toMatch(ruling[lang])
    expect(t['maintenance:aquariumbreeder'], lang).toMatch(says[lang][0]!)
    expect(t['maintenance:aquariumbreeder'], lang).toMatch(says[lang][1]!)
    expect(t['waterConditions:aquariumbreeder'], lang).toMatch(says[lang][0]!)
  }
  for (const key of ['maintenance', 'waterConditions']) {
    const ab = plant.sections.find(s => s.key === key && s.source === 'aquariumbreeder')!
    expect(ab.html, key).toMatch(/Use only RO or distilled water/)
    if (key === 'maintenance') expect(ab.html).toMatch(/If you still use tap water, dechlorinate it first/)
    expect(ab.html, key).not.toMatch(ruling.en)
  }
  // The stand-tap-water video guide: the video's advice stays the video's, our note goes beside it, and "chỉ phí tiền" goes.
  const stand = read<Guide>('guides/youtube-S-FR9u--jVs/vi.json')
  // The note is ours and says no more than its sources: EPA on chloramine left standing, and the Hanoi study, where only
  // the groundwater high in ammonia bound the chlorine as chloramine. It names no video (the reader check's rule).
  expect(stand.bodyFixed).toBe(true)
  expect(stand.faqFixed).toBe(true)
  expect(stand.localNote?.html).toMatch(/^<p><strong>Ghi chú của AquaTome cho bạn đọc ở Việt Nam:<\/strong> Nước máy một số nơi có cloramin, để qua đêm không hết; không chắc thì dùng chất khử clo\. Ở Hà Nội, [^<]*nguồn nước ngầm nhiều amoni/)
  expect(stand.localNote?.html).not.toMatch(/video/i)
  expect(stand.localNote?.refs.map(r => r.url)).toEqual(['https://19january2017snapshot.epa.gov/www3/region9/water/chloramine.html', 'https://doi.org/10.1016/S0043-1354(03)00138-6'])
  expect(JSON.stringify([stand.body, stand.summary, stand.faq])).not.toMatch(/phí tiền/)
  // Artemia hatching water: about 30 g of salt a litre, in grams alone (a tablespoon is nearer 18 g).
  const spoon = { vi: /30 g[^.]{0,40}1 muỗng canh/, id: /30 g[^.]{0,60}1 sendok makan/, th: /30 กรัม[^<"]{0,60}1 ช้อนโต๊ะ/, ms: /30 g[^.]{0,80}1 sudu besar/ }
  for (const [lang, said] of Object.entries(spoon)) {
    const g = read<Guide>(`guides/aquatome-ap-trung-artemia-lam-thuc-an-cho-ca-con-cach-lam-tai-nha/${lang}.json`)
    expect(g.bodyFixed, lang).toBe(true)
    expect(JSON.stringify([g.body, g.summary, g.faq]), lang).not.toMatch(said)
  }
})

// The site lead, 15 Nov 2026, at the chief of staff's word: the rewrites of 14 and 15 Nov cut flagged sentences, and a
// rule then took any part left with one line or none, so ten fish lost a part whole. A care fact the source supports goes
// back, fixed by hand; a remark, a source's own notes, habitat and distribution stay off. Two come back here (Leporinus's
// came back on its own change): Geophagus harreri's spawning without its fry counts, the author's own, and Compsaraia
// samueli's food without "in the fishhouse". The darter's garden pond and Beaufortia's unheated tank stay off: each was
// written for a reader in a cold country.
test('two care facts a rewrite took whole are back, fixed: Geophagus harreri spawns in the open on roots or stones, Compsaraia samueli eats Tubifex and small feeder fish', () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const read = <T>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
  const part = (id: string, key: string, source: string, lang: string) => ({
    en: read<{ sections: { key: string; source: string; html: string; fixed?: boolean }[] }>(`species/${id}/entity.json`).sections.find(x => x.key === key && x.source === source),
    t: read<{ sections: Record<string, string> }>(`species/${id}/${lang}.json`).sections[`${key}:${source}`],
  })
  const geophagus = part('geophagus-harreri', 'reproduction', 'glaser', 'vi')
  expect(geophagus.en?.fixed).toBe(true)
  expect(geophagus.en?.html).toBe('<p>The species belongs to the open brooders and uses roots or stones for spawning.</p>')
  expect(geophagus.t).toBe('<p>Loài này đẻ trứng lộ thiên, đẻ lên rễ cây hoặc đá.</p>')
  const compsaraia = part('compsaraia-samueli', 'diet', 'glaser', 'vi')
  expect(compsaraia.en?.fixed).toBe(true)
  expect(compsaraia.en?.html).toBe('<p>The fish are fed with Tubifex and small feeder fish (Tanichthys).</p>')
  expect(compsaraia.t).toBe('<p>Cá được cho ăn trùng chỉ và cá mồi nhỏ (cá kim tơ, Tanichthys).</p>')
  expect(part('compsaraia-samueli', 'diet', 'glaser', 'id').t).toBe('<p>Ikan ini diberi pakan cacing sutra dan ikan kecil sebagai pakan hidup (Tanichthys).</p>')
  expect(part('compsaraia-samueli', 'diet', 'glaser', 'th').t).toBe('<p>ปลาชนิดนี้ได้รับอาหารเป็นไส้เดือนน้ำ (Tubifex) และปลาเล็กที่ใช้เป็นอาหาร (Tanichthys)</p>')
})

// GBIF's fuzzy matches made a catfish page a tube worm's (Brochis arcuata → Ditrupa arietina, Sabellida), and its exact
// Mollienisia, a moth's genus, gave a molly page a moth's family (Noctuidae). The engine now takes a match only of an animal
// the page's group can be (gbif.ts pageTaxon). This holds each fish or shrimp page's order to its group; "other" and
// "snails", too many orders to name, are held by that class check alone. The two above are folded (page-folds.ts). The
// table is the engine's own (gbif.ts GROUP_ORDERS), which places a new page by it (pageGroup). A spiny eel filed with the
// loaches went to "other" with the order's 16 other pages (the chief of staff, 14 Nov 2026).
test('every species page\'s order fits its group', () => {
  const root = fileURLToPath(new URL('../../../content/species', import.meta.url))
  const off = readdirSync(root).filter(id => {
    const e = JSON.parse(readFileSync(join(root, id, 'entity.json'), 'utf8')) as { group: string; order: string }
    return GROUP_ORDERS[e.group] !== undefined && !GROUP_ORDERS[e.group]!.includes(e.order)
  })
  expect(off.sort()).toEqual([])
})

// The chief of staff, 2026-11-13: the skunk cory's text under a tube worm's name ends as one page with its fish's, the
// worm's address forwarding there with the worm's name in neither its note nor search; Spruce Pets' molly article, about
// several species, gives "Cá molly" nothing but its forwarded address; the torrent catfish is under its own name. And the
// engine's record of GBIF's answers keeps none a person found wrong (gbif.ts MISMATCHED).
test('the pages filed under another animal are each their fish\'s, and GBIF\'s wrong answers are gone from the record', () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  const page = (id: string) => ({ e: JSON.parse(readFileSync(join(content, 'species', id, 'entity.json'), 'utf8')), vi: JSON.parse(readFileSync(join(content, 'species', id, 'vi.json'), 'utf8')) as Translation })
  for (const id of ['ditrupa-arietina', 'mollienisia', 'liobagrus-chenghaiensis']) expect(existsSync(join(content, 'species', id)), id).toBe(false)
  const skunk = page('corydoras-arcuatus')
  expect(skunk.e.sections.map((x: { source: string }) => x.source)).toEqual(expect.arrayContaining(['seriouslyfish', 'planetcatfish']))
  expect(skunk.e.lNumber).toBe('C020')
  expect(skunk.vi.redirectFrom).toEqual(expect.arrayContaining([{ slug: 'ca-ditrupa-arietina', name: '' }]))
  expect(JSON.stringify(skunk)).not.toMatch(/ditrupa arietina|Cá Ditrupa/i)
  const molly = page('poecilia-sphenops')
  expect(molly.vi.redirectFrom).toEqual(expect.arrayContaining([{ slug: 'ca-molly-bryophila', name: 'Các loài cá molly' }]))
  expect(molly.e.sections.some((x: { sourceUrl: string }) => x.sourceUrl.includes('the-mollie'))).toBe(false)
  expect([page('liobagrus-chengduensis').e.scientificName, page('liobagrus-chengduensis').vi.slug]).toEqual(['Liobagrus chengduensis', 'ca-tre-suoi-thanh-do'])
  const record = JSON.parse(readFileSync(fileURLToPath(new URL('../../../engine-state/_gbif-names.json', import.meta.url)), 'utf8')) as Record<string, unknown>
  expect(Object.keys(MISMATCHED).filter(k => k in record)).toEqual([])
})

// Names a person found are another fish's (alt-names.ts NOT_ITS: Boraras merah's "Chili rasbora", and the chief of staff's
// ten of 2026-11-13) are on none of those pages, in any language: the sweep's cleaner takes them off each cycle.
test('no page keeps another fish\'s name a person found on it', () => {
  const root = fileURLToPath(new URL('../../../content/species', import.meta.url))
  const left: string[] = []
  for (const id of readdirSync(root)) {
    const e = JSON.parse(readFileSync(join(root, id, 'entity.json'), 'utf8')) as { scientificName: string }
    const off = NOT_ITS[e.scientificName]
    if (!off) continue
    for (const f of readdirSync(join(root, id)).filter(f => f !== 'entity.json' && f.endsWith('.json'))) {
      const t = JSON.parse(readFileSync(join(root, id, f), 'utf8')) as Translation
      for (const n of t.altNames ?? []) if (off.some(x => altKey(x.name) === altKey(n))) left.push(`${id}/${f}: ${n}`)
    }
  }
  expect(left).toEqual([])
})

// A mend of 14 Nov made the fire-bellied toad guide say of every tank built for toads what its video says of one tank.
// The chief of staff, 15 Nov: held by hand until the sentence-only mend cuts that line. The hold names the guide as its
// folder does, and every language the guide has is held with it, so the site's build leaves it out.
test('the fire-bellied toad guide is held by hand in every language it has', () => {
  const id = 'youtube-UkkP80wMn_s'
  const byHand = JSON.parse(readFileSync(fileURLToPath(new URL('../../../engine-state/held-by-hand.json', import.meta.url)), 'utf8')) as Record<string, { checks: string[]; at: string }>
  const hold = { checks: ['source'], at: '2026-11-15' }
  expect(byHand[`guides/${id}`]).toMatchObject(hold)
  const dir = fileURLToPath(new URL(`../../../content/guides/${id}`, import.meta.url))
  const langs = readdirSync(dir).filter(f => f !== 'entity.json' && f.endsWith('.json'))
  expect(langs).toContain('vi.json')
  for (const f of langs) expect((JSON.parse(readFileSync(join(dir, f), 'utf8')) as Translation).held, f).toEqual(hold)
})

// Corydoras geoffroy: a run's read held its Vietnamese for its source on 19 Nov; a push dropped that hold, and the gate's
// own mark put back on 20 Nov 08:09 went at 08:27, when the next gate read the page again and let it out. The chief of
// staff, 20 Nov: held by hand, in every language it has, until a person lifts it; no read lets it out.
test('Corydoras geoffroy is held by hand in every language it has', () => {
  const id = 'corydoras-geoffroy'
  const byHand = JSON.parse(readFileSync(fileURLToPath(new URL('../../../engine-state/held-by-hand.json', import.meta.url)), 'utf8')) as Record<string, { checks: string[]; at: string }>
  const hold = { checks: ['source'], at: '2026-11-20' }
  expect(byHand[`species/${id}`]).toMatchObject(hold)
  const dir = fileURLToPath(new URL(`../../../content/species/${id}`, import.meta.url))
  const langs = readdirSync(dir).filter(f => f !== 'entity.json' && f.endsWith('.json'))
  expect(langs).toContain('vi.json')
  for (const f of langs) expect((JSON.parse(readFileSync(join(dir, f), 'utf8')) as Translation).held, f).toEqual(hold)
})

// The chief of staff, 17 Nov 2026: three pages a foreign seller's products or medicines make up go off for good. The
// shopping list goes to the guides list, the iron fertiliser to the guide on choosing a fertiliser, and the quarantine video
// built on three medicines sold abroad to our general quarantine guide. Each target is a page and stays.
test('the two kits and the quarantine video are off for good, each to the page it names', () => {
  expect(retiredTo('aquariumcoop-blogs-aquarium-aquarium-shopping-list')).toBe('guides')
  const want = {
    'aquariumcoop-blogs-aquarium-iron-fertilizer': 'aquariumcoop-blogs-aquarium-which-aquatic-fertilizer-is-right-for-you',
    'youtube-LrRhfOYfXns': 'aquatome-cach-ly-ca-moi-mua-be-cach-ly-va-quy-trinh',
  }
  for (const [id, target] of Object.entries(want)) {
    expect(retiredTo(id), id).toEqual({ kind: 'guides', id: target })
    expect(retiredTo(target), target).toBeUndefined()
    expect(existsSync(fileURLToPath(new URL(`../../../content/guides/${target}/vi.json`, import.meta.url))), target).toBe(true)
  }
})

// The Writing Lead's answer of 15 Nov 2026 on 60 findings in 17 held video guides (the source talking, units, prices),
// fixed by hand: each guide is bodyFixed, and the pond guide's FAQ faqFixed, so no run takes a fix back. Each line is in
// test/fixtures/held-video-fixes.json: what went, and what stands in its place.
const handFixesHold = (fixture: string, prefix = 'youtube-') => {
  const root = fileURLToPath(new URL('../../../content/guides', import.meta.url))
  const fixes = JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${fixture}`, import.meta.url)), 'utf8')) as Record<string, { in: 'body' | 'summary' | 'faq'; gone?: string; now?: string }[]>
  for (const [id, edits] of Object.entries(fixes)) {
    const t = JSON.parse(readFileSync(join(root, `${prefix}${id}`, 'vi.json'), 'utf8')) as { body: string; bodyFixed?: boolean; summary?: string[]; faq?: { q: string; a: string }[]; faqFixed?: boolean }
    expect(t.bodyFixed, id).toBe(true)
    const text = { body: t.body, summary: (t.summary ?? []).join('\n'), faq: (t.faq ?? []).map(q => q.a).join('\n') }
    for (const e of edits) {
      if (e.in === 'faq') expect(t.faqFixed, id).toBe(true)
      if (e.gone) expect(text[e.in], `${id}: ${e.gone}`).not.toContain(e.gone)
      if (e.now) expect(text[e.in], `${id}: ${e.now}`).toContain(e.now)
    }
  }
}
test('the hand fixes to the 17 held video guides hold: each cut line is gone, each rewrite or care fact put back is there', () => handFixesHold('held-video-fixes.json'))

// The Writing Lead's eight live sentences of 20 Nov 2026 on six video guides, each checked against the video's own words,
// put in by hand as written: four that could cost fish (fish added the next day, the first water change, the bag left
// to warm, the new shrimp colony) and four that said more than the video; and the nano tank's summary line, which made
// its one tank a rule. Each guide is bodyFixed, which keeps its summary too, and the self-balancing tank's FAQ faqFixed,
// so no run takes them back (test/fixtures/mend-fixes-1120.json).
test("the Writing Lead's eight sentences of 20 Nov hold on their six guides", () => handFixesHold('mend-fixes-1120.json'))

// The morning check of 20 Nov 2026: four things the night's steps took from guides, put back by hand as they stood (the
// chief of staff): the Endlers guide's condition and another guide's hedge, which the cutter took; the rummynose guide's
// warning, with its section and summary line, which the topic check took; the egg scatterers' frame step, which the
// reader-fit rewrite took. Each guide is bodyFixed, which keeps its summary too, so no run takes them out again
// (test/fixtures/net-putbacks-1120.json, by each guide's whole id).
test('the four things the night of 19 Nov took from guides are back', () => handFixesHold('net-putbacks-1120.json', ''))

// The Writing Lead, 15 Nov 2026, on the rainbowfish guide's label ("Bể cầu vồng của …"): no video guide's label, the
// words over its thumbnail, names the person in the video or the channel.
test('no video guide\'s label names a person or the channel', () => {
  const dir = fileURLToPath(new URL('../../../content/guides', import.meta.url))
  const named = readdirSync(dir).filter(id => id.startsWith('youtube-') && existsSync(join(dir, id, 'vi.json'))).flatMap(id => {
    const { cover } = JSON.parse(readFileSync(join(dir, id, 'vi.json'), 'utf8')) as Translation
    const { video } = JSON.parse(readFileSync(join(dir, id, 'entity.json'), 'utf8')) as { video?: { channel?: string } }
    return cover && namesSomeone(cover, video?.channel) ? [id] : []
  })
  expect(named).toEqual([])
})

// The chief of staff, 15 Nov 2026: care facts the lane's whole-sentence cuts would take go on hand-fixed text first, so
// the fact never leaves the page. Two climate lines and two places stay as they were, their parts fixed; in four guides
// the fact stays in plain words, only the comparison, the product or the shop goes, and the body is fixed.
test('the care facts the lane would cut whole are on hand-fixed text: a temperature, no heater, places, a size, a quarantine step, minerals, fertiliser', () => {
  const read = <T>(path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../content/${path}`, import.meta.url)), 'utf8')) as T
  const part = (fish: string, key: string) => read<{ sections: { key: string; source: string; html: string; fixed?: boolean }[] }>(`species/${fish}/entity.json`).sections.find(s => s.key === key && s.source === 'glaser')!
  for (const [fish, key, vi] of [
    ['rachoviscus-crassiceps', 'waterConditions', 'từ 16 đến 24°C'],
    ['paramesotriton-labiatus', 'maintenance', 'Không cần sưởi.'],
    ['serrasalmus-eigenmanni', 'quickFacts', 'Peru'],
    ['ophichthus-apicalis', 'distribution', 'Việt Nam'],
  ] as const) {
    expect(part(fish, key).fixed, fish).toBe(true)
    expect(read<Translation>(`species/${fish}/vi.json`).sections![`${key}:glaser`], fish).toContain(vi)
  }
  for (const [guide, kept, gone] of [
    ['aquariumcoop-blogs-aquarium-clown-loach', ['Thân cá mập, cao 13–15 cm.', 'giun vi sinh', 'thuốc trị đốm trắng hoặc muối'], ['bóng bầu dục', 'đúc kết từ hơn 10 năm', 'Ich-X', 'Repashy', 'giun micro', 'trùn vi sinh']],
    ['aquariumcoop-blogs-aquarium-hatchetfish', ['điều trị phòng ngừa luôn trong thời gian cách ly', 'thuốc trị đốm trắng', 'thuốc tẩy giun'], ['bộ ba thuốc', 'Ich-X', 'ParaCleanse']],
    ['aquariumcoop-blogs-aquarium-hard-water-fish', ['miễn là châm thêm khoáng cho bể.', 'trùng huyết và artemia', 'các dòng cá biến đổi gen phát huỳnh quang'], ['Wonder Shell', 'Equilibrium', 'Vibra Bites', 'GloFish']],
    ['aquariumcoop-blogs-aquarium-aquarium-plants-for-profit', ['bán cây sống qua các trang thương mại điện tử.', 'châm phân nước tổng hợp vào bể.', 'phí vận chuyển'], ['AquaBid', 'Easy Green']],
  ] as const) {
    const t = read<Translation & { bodyFixed?: boolean }>(`guides/${guide}/vi.json`)
    expect(t.bodyFixed, guide).toBe(true)
    for (const s of kept) expect(t.body, `${guide}: ${s}`).toContain(s)
    for (const s of gone) expect(t.body, `${guide}: ${s}`).not.toContain(s)
  }
})

// Page Recovery, 16 Nov 2026 (the chief of staff): the leak-repair guide sent a keeper here to seven American silicones and
// super glues by name, none in the market table, so no check of the gate saw them; it was held by hand. The Writing
// Lead's plain words replace the three lists (what to look for on the tube, a small tube, thin super glue), the body is
// fixed by hand, and the hold is let go.
test('the leak-repair guide says what to buy in plain words, no brands, and is out', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const id = 'aquariumbreeder-how-to-fix-a-leaking-aquarium-with-and-without-draining'
  const byHand = JSON.parse(readFileSync(join(root, 'engine-state/held-by-hand.json'), 'utf8')) as Record<string, unknown>
  const t = JSON.parse(readFileSync(join(root, `content/guides/${id}/vi.json`), 'utf8')) as Translation & { bodyFixed?: boolean; held?: unknown }
  for (const gone of ['GE Silicone', 'ASI Aquarium', 'Aqueon', 'Tub Clear', 'Ultra Gel', 'Insta-Cure', '57 g']) expect(t.body, gone).not.toContain(gone)
  for (const kept of ['Khi mua keo silicone, chọn tuýp:', 'ghi rõ dùng được cho bể cá, hoặc là silicone 100%', 'không có chất chống nấm mốc', 'một tuýp nhỏ loại như trên là đủ', 'Keo 502 loại thật loãng, chảy gần như nước.']) expect(t.body, kept).toContain(kept)
  expect(t.bodyFixed).toBe(true)
  expect(t.held).toBeUndefined()
  expect(byHand[`guides/${id}`]).toBeUndefined()
})

// The chief of staff, 16 Nov 2026: two titles say their true count again, fixed by hand so the sweep's count rule, which
// counts headings and not a summary table's rows or the text's own "ten", doesn't take it off again. The algae guide's
// read "8 lý do" while its text gave ten; the hard-water one had lost its 10 when it was written.
test('two guide titles say the count their own text gives, and are fixed by hand so the count rule leaves them', () => {
  for (const [id, name, said] of [
    ['youtube-DkuoQLxF7u8', '10 loài cá cảnh nuôi chung hợp với nước cứng', '10 loài'],
    ['youtube-Ejng2T-a2Gk', '10 lý do bể thủy sinh vẫn còn rêu hại và cách khắc phục', 'Lý do cuối cùng'],
  ] as const) {
    const t = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../content/guides/${id}/vi.json`, import.meta.url)), 'utf8')) as Translation & { nameFixed?: boolean }
    expect(t.name, id).toBe(name)
    expect(t.nameFixed, id).toBe(true)
    expect(t.body, id).toContain(said)
    // The rule now reads the text's own count, its table and its chapters, and keeps both counts too.
    expect(countMismatch(t.name, t.body!, t.chapters), id).toBeUndefined()
  }
})

// The chief of staff's ask, 16 Nov 2026, in the Writing Lead's words: five held video guides get their one sentence by
// hand (the video maker's own fish, rack or tank; a tank converted from gallons), each body fixed so no mend undoes it.
// The gate's next read held the shrimp-tank move for one more sentence on the maker's own tank ("Bể vốn đã khá sạch"),
// and named "nhựa sóng", roofing sheet here: both in the Writing Lead's words too (16 Nov, 06:35).
test('five held video guides say their one sentence plainly, in the Writing Lead\'s words, and are fixed by hand', () => {
  for (const [id, kept, gone, flags] of [
    ['youtube-gJuWCudImSc', ['Đám cá con này quen người từ nhỏ. Còn cá lớn từng nuôi trong bể trong nhà', 'khi chuyển ra hồ có thể trở nên nhát như cá hoang', 'Cây không chịu lạnh thì đợi trời ấm hẳn, hết rét rồi mới đem ra hồ trồng.'], ['còn cá lớn từng nuôi trong nhà, chuyển ra hồ', 'Cá con sinh ra ngay trong hồ thường quen người'], ['bodyFixed']],
    ['youtube-3jqe5KGD9lI', ['nhưng nếu kệ đủ chắc và bể có viền thì không thật sự cần', 'Nếu kệ đủ chắc và bể có viền thì không thật sự cần.', 'Nước bể còn sạch thì giữ phần này lại để đổ vào bể sau khi chuyển.', 'hai tấm nhựa PP rỗng ruột'], ['kệ kiểu này', 'Bể vốn đã khá sạch', 'nhựa sóng', 'coroplast'], ['bodyFixed', 'faqFixed']],
    ['youtube-hTqxIrD_Vho', ['phần nước hơi nhỏ, kể cả với cá tí hon như Phoenix rasbora', 'Phần nước của một bể ốc đảo mini như vậy hơi nhỏ'], ['của bể này', 'mini này'], ['bodyFixed', 'faqFixed']],
    ['youtube-Iinv7wWjhzA', ['40–120 lít', 'bể 40, 80 hay 100 lít', 'từ khoảng 120 lít trở xuống', 'Trong bể 100–120 lít', 'từ 80 lít trở lên'], ['38', '75 lít', '110 lít'], ['nameFixed', 'bodyFixed', 'faqFixed']],
    ['youtube-OrW6PZgqKSM', ['khoảng 90 lít'], ['91 lít'], ['bodyFixed']],
  ] as const) {
    const t = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../content/guides/${id}/vi.json`, import.meta.url)), 'utf8')) as Translation & Record<string, unknown>
    const all = [t.name, t.body, ...(t.summary ?? []), ...(t.faq ?? []).flatMap(f => [f.q, f.a])].join('\n')
    for (const s of kept) expect(all, `${id}: ${s}`).toContain(s)
    for (const s of gone) expect(all, `${id}: ${s}`).not.toContain(s)
    for (const f of flags) expect(t[f], `${id}: ${f}`).toBe(true)
  }
})

// The chief of staff, 16 Nov 2026: the chat answers sick-fish questions from the ich and parasite guides, and both sent a
// keeper here to US medicines by name (Ich-X and four more), at each maker's dose turned into litres, with the makers'
// "safe for every fish, shrimp and snail". In the Writing Lead's words: each medicine by its active ingredients, the
// label's dose, cautions from the University of Florida's ich circular and the labels in place of the safety claims, and
// the circular's salt figure with its conditions. Both bodies are fixed by hand; the two US medicine boxes in the parasite
// guide's photos leave it and every page, on the never-again list. The two sources the new lines rest on are listed on both.
test('the ich and parasite guides name no US medicine, give the label\'s dose, and show no medicine box', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const read = (id: string) => JSON.parse(readFileSync(join(root, `content/guides/${id}/vi.json`), 'utf8')) as Translation & { bodyFixed?: boolean }
  const ich = read('aquariumcoop-blogs-aquarium-how-to-treat-ich-on-freshwater-fish'), parasites = read('aquariumcoop-blogs-aquarium-fish-parasites')
  for (const t of [ich, parasites]) {
    expect(t.bodyFixed, t.slug).toBe(true)
    for (const gone of ['Ich-X', 'Ich X', 'Hikari', 'Aquarium Solutions', 'Pond Solutions', 'Fritz', 'ParaCleanse', 'PraziPro', 'CyroPro', 'Expel-P', 'Maracyn', 'Repashy', 'Purigen', 'Aquarium Co-Op', 'muỗng cà phê', 'cho mỗi 38 lít', 'an toàn với', 'Vorticella'])
      expect(t.body, `${t.slug}: ${gone}`).not.toContain(gone)
    expect(t.body, t.slug).toContain('đủ liều ghi trên nhãn')
    expect(t.body, t.slug).toContain('4–5 g muối mỗi lít trong 7–10 ngày')
  }
  for (const kept of ['malachite green và formalin', 'soi mẫu da hoặc mang dưới kính hiển vi', 'ít nhất 3–5 lần', 'thay ngay nước sạch, nhiều oxy']) expect(ich.body, kept).toContain(kept)
  // The fresh read's hold: never "stop after the minimum treatments" beside "don't stop while fish die"; the old 5 days
  // stays for the "maybe not ich" stop, and a label's own schedule wins over the page's.
  expect(ich.body).toContain('Đó là số lần tối thiểu: cá còn chết vì ich thì chưa ngừng thuốc. Trong nước ấm, trị 5 ngày mà đốm vẫn không giảm')
  expect(ich.body).not.toContain('Trị đủ số lần như vậy')
  expect(ich.body).toContain('Nhãn ghi lịch châm khác thì theo nhãn.')
  expect(parasites.body?.match(/nhãn ghi (?:lịch châm )?khác thì theo nhãn/g)?.length).toBe(4)
  expect(parasites.body).toContain('Cá da trơn và cá chạch có thể nhạy hơn với thay đổi độ mặn')
  for (const kept of ['Thuốc có praziquantel và metronidazole', 'Scutariella japonica', 'Thuốc có cyromazine', 'Thuốc có levamisole']) expect(parasites.body, kept).toContain(kept)
  for (const t of [ich, parasites]) expect((t as Translation & { refs?: { url: string }[] }).refs?.map(r => r.url), t.slug).toEqual(['https://ask.ifas.ufl.edu/publication/FA006/pdf', 'https://rainbowfish.angfa.org.au/disease_prevention_and_control/chemical_treatments.html'])
  const boxes = ['b300caaf93b370a4', '623edd3a383cea26'].map(h => `https://media.aquatome.com/aquariumcoop/${h}.webp`)
  const rejected = JSON.parse(readFileSync(join(root, 'engine-state/_photo-rejected.json'), 'utf8')) as Record<string, string>
  for (const u of boxes) expect(rejected[u], u).toMatch(/^subject: withheld/)
  const e = JSON.parse(readFileSync(join(root, 'content/guides/aquariumcoop-blogs-aquarium-fish-parasites/entity.json'), 'utf8')) as { photos: { url: string; section?: { vi: string } }[] }
  expect(e.photos.map(p => p.url).filter(u => boxes.includes(u))).toEqual([])
  // Each photo still sits under a heading the text has.
  for (const p of e.photos) if (p.section) expect(parasites.body, p.url).toContain(`>${p.section.vi}</h3>`)
})

// The chief of staff, 16 Nov 2026: "a live title whose number disagrees with its own text fails." Every guide on the site,
// in every language, a title fixed by hand too (the sweep leaves those, so only this sees them): its number stands on what
// the text says, a run, a list, a table, its chapters, its bold leads or its headings, and no larger count the text has.
// What fails names the page and the reason, which the title and its numbers make.
test('no live guide title promises a number its own text disagrees with', async () => {
  const dir = fileURLToPath(new URL('../../../content/guides', import.meta.url))
  const wrong: string[] = []
  for (const id of (await readdir(dir)).sort()) for (const f of (await readdir(join(dir, id))).filter(f => f !== 'entity.json' && f.endsWith('.json'))) {
    const t = JSON.parse(await readFile(join(dir, id, f), 'utf8')) as Translation & { held?: unknown }
    if (t.held || !t.name || !t.body) continue
    const why = countMismatch(t.name, t.body, t.chapters)
    if (why) wrong.push(`${f.replace('.json', '')}/guides/${id}: "${t.name}": ${why}`)
  }
  expect(wrong).toEqual([])
})

// The chief of staff, 16 Nov 2026: 13 guides whose text gives a count got it back in their title, by hand, with Writing
// reading each wording, and the brackish plants guide says "Hơn 30 loại" over its table of 31, as its address does. Each
// title is fixed, so the sweep leaves it; what each text says of the count, or its table, is held too.
test('fourteen guide titles say the count their own text gives, fixed by hand', () => {
  const rows = (html: string) => (html.match(/<tr[\s>][\s\S]*?<\/tr>/g) ?? []).filter(r => r.includes('<td')).length
  for (const [id, name, said] of [
    ['youtube-0MzfLrSqfXY', '10 loài cá hợp nuôi trong bể 40 lít', '10 loài'],
    ['youtube-mGmIvhtIM9k', '10 loài cá dễ nuôi cho người mới chơi bể cá nước ngọt', '10 loài'],
    ['youtube-vl1Lx9iWDYU', '28 mẹo phòng và giảm rêu hại cho bể thủy sinh', '28 mẹo'],
    ['aquariumcoop-blogs-aquarium-plants-for-african-cichlids', '10 loại cây dễ nuôi trong bể cá cichlid châu Phi', '10 loại cây'],
    ['youtube-OSR9EPaO78Q', '6 loại rêu hại hay gặp trong bể thủy sinh và cách xử lý', 'sáu loại'],
    ['aquariumbreeder-50-underwater-red-plants-for-your-tank', 'Hơn 50 loại cây thủy sinh đỏ cho bể cá', 'Hơn 50 loại'],
    ['aquariumbreeder-brackish-water-plants', 'Hơn 30 loại cây thủy sinh chịu được nước lợ', 31],
    ['youtube-4tfp4V1usjA', '10 loài cá dễ nuôi, ít bệnh nên chọn khi mua ở chuỗi tiệm thú cưng lớn', '10 loài'],
    ['youtube-LRTzeSTeN-8', '10 loài cá heo, cá chạch dễ nuôi cho bể cá cảnh', '10 loài'],
    ['youtube-Z3jAT8oNNAo', '10 loài cá nuôi chung đẹp, dễ nuôi mà ít người để ý', '10 loài'],
    ['youtube-aN80dX_RktA', '10 loài cá nhỏ hợp bể nano nước ngọt và cách nuôi từng loài', '10 loài'],
    ['youtube-iVpF5Ya3lIw', '10 loài cá tầng mặt cho bể thủy sinh và cách nuôi từng loài', '10 loài'],
    ['youtube-z_AdgDUSZkw', '10 loài cá chuột (Corydoras) đáng nuôi và cách chọn', 'mười loài'],
    ['youtube-ldbE9N7RUTQ', 'Cá vàng nuôi chung với cá gì: 10 loài hợp và cách chọn', '10 loài'],
  ] as const) {
    const t = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../content/guides/${id}/vi.json`, import.meta.url)), 'utf8')) as Translation & { nameFixed?: boolean }
    expect(t.name, id).toBe(name)
    expect(t.nameFixed, id).toBe(true)
    if (typeof said === 'number') expect(rows(t.body!), id).toBe(said)
    else expect(t.body!.replace(/<[^>]+>/g, ' '), id).toContain(said)
  }
})

// The chief of staff, 16 Nov 2026: the popeye guide said fish clinics exist in Hà Nội, TP.HCM and Đà Nẵng, and to get help
// after 3–5 days of home treatment. Its one source for both, a shop's page, names no clinic and reads as machine-written.
// The clinic sentences and the day count go by hand, every language's body is fixed so the topic writers keep it, and the
// page still says whom to ask and when.
test('the popeye guide names no clinic in a place and no day count, still says whom to ask, and is fixed by hand', () => {
  const read = (lang: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../content/guides/aquatome-ca-bi-loi-mat-popeye-nguyen-nhan-cach-chua-va-phong/${lang}.json`, import.meta.url)), 'utf8')) as Translation & Record<string, unknown>
  for (const lang of ['vi', 'id', 'th', 'ms']) {
    const t = read(lang)
    const all = [t.name, t.body, ...(t.summary ?? []), ...(t.faq ?? []).flatMap(f => [f.q, f.a])].join('\n')
    for (const s of ['phòng khám', 'Hà Nội', 'TP.HCM', 'Đà Nẵng', 'kính hiển vi']) expect(all, `${lang}: ${s}`).not.toContain(s)
    expect(all, `${lang}: a day count`).not.toMatch(/3\s*(?:[–-]|đến|sampai|hingga|ถึง)\s*5\s*(?:ngày|hari|วัน)/u)
    expect(t.bodyFixed, `${lang}: bodyFixed`).toBe(true)
  }
  const vi = read('vi').body ?? ''
  expect(vi).toContain('Bạn nên nhờ bác sĩ thú y có chữa cá, hoặc tiệm cá cảnh có người rành bệnh cá, xem giúp nếu gặp một trong các trường hợp sau:')
  expect(vi).toContain('<li>Chữa ở nhà mà cá không đỡ.</li>')
  // The saved facts lose both too, so a redo of the summary, the FAQ or another language can't bring them back.
  const facts = readFileSync(fileURLToPath(new URL('../../../engine-state/topics/aquatome-ca-bi-loi-mat-popeye-nguyen-nhan-cach-chua-va-phong.json', import.meta.url)), 'utf8')
  for (const s of ['3–5 days', 'Hà Nội', 'TP.HCM', 'Đà Nẵng', 'clinics']) expect(facts, `facts: ${s}`).not.toContain(s)
})

// The Writing Lead, 16 Nov 2026, after the leak-repair guide's fresh read: the super glue step gets its caution (it bonds
// skin and eyes in seconds and heats as it sets; gloves, air, soak a stuck finger), acetone its fire and fumes line, the
// no-drain steps their "Cách làm:" lead-in, and coral leaves a freshwater guide. The two safety sheets are its sources.
test('the leak-repair guide warns about super glue and acetone, and cites the safety sheets it does so from', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const t = JSON.parse(readFileSync(join(root, 'content/guides/aquariumbreeder-how-to-fix-a-leaking-aquarium-with-and-without-draining/vi.json'), 'utf8')) as Translation & { bodyFixed?: boolean; refs?: { url: string }[] }
  for (const kept of ['Keo 502 dính da và mắt chỉ trong vài giây, và tỏa nhiệt khi đông cứng.', 'ngâm tay vào nước xà phòng ấm rồi gỡ từ từ.', '<p>Cách làm:</p><ul><li>Rắc baking soda lên chỗ rò.', 'Acetone rất dễ cháy', 'chuyển cá, tép sang bể tạm']) expect(t.body, kept).toContain(kept)
  expect(t.body).not.toContain('san hô')
  expect(t.bodyFixed).toBe(true)
  expect(t.refs?.map(r => r.url)).toEqual(['https://files.canon-europe.com/files/webcontent/safety-data-sheets/EU_Service-Materials/lo0045405_-_loctite_454_superglue_5g_pdf.pdf', 'https://www.cdc.gov/niosh/npg/npgd0004.html'])
})

// The chief of staff, 16 Nov 2026: the algae guide was held in Vietnamese since 11 Nov for a liquid carbon's dose and its
// makers' products, and by hand in every language once its Thai page was found carrying the same doses. Vietnamese and
// Thai take the Indonesian's way, in the Writing Lead's words: the liquid carbon by kind, at the dose on the label of the
// product bought, every caution kept. All three bodies are fixed, so a redo keeps them: the gate reads no dose or product
// outside Vietnamese. A redo still writes the summary and FAQ fresh, from facts that name the products, so those are
// checked here too. The hand hold is lifted.
test('the algae guide gives the label\'s dose for liquid carbon in every language, names no product, and keeps its cautions', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const id = 'aquatome-reu-hai-trong-be-thuy-sinh-nguyen-nhan-va-cach-loai-bo'
  const byHand = JSON.parse(readFileSync(join(root, 'engine-state/held-by-hand.json'), 'utf8')) as Record<string, unknown>
  expect(byHand[`guides/${id}`]).toBeUndefined()
  const page = (lang: string) => JSON.parse(readFileSync(join(root, `content/guides/${id}/${lang}.json`), 'utf8')) as Translation & { bodyFixed?: boolean; held?: unknown }
  const want: Record<string, { label: string; kept: string[]; gone: string[] }> = {
    vi: {
      label: 'Theo liều ghi trên nhãn sản phẩm bạn mua',
      kept: ['Nồng độ cao làm hao oxy, phải sục khí mạnh.', 'tuyệt đối không trộn chung', 'rêu san hô (Riccardia) và Riccia fluitans, nên giữ thuốc tránh xa chúng', 'đeo kính và găng tay', 'không bán sản phẩm của mình như một thuốc diệt rêu', 'châm quá liều hoặc bơm thẳng lên cây có thể làm hại cây', 'Liều lớn có thể làm rữa lá Vallisneria', 'Anacharis chịu sản phẩm này đặc biệt kém', '5 ml cho mỗi 30 L'],
      gone: ['1 ml cho mỗi 50 L', '5 mL cho 40 L', '5 mL cho 200 L'],
    },
    th: {
      label: 'ตามขนาดบนฉลากของผลิตภัณฑ์ที่ซื้อมา',
      kept: ['ความเข้มข้นสูงจะดึงออกซิเจนในน้ำ', 'ห้ามผสมกันเด็ดขาด', 'Riccardia (มอสปะการัง) และ Riccia fluitans อย่าให้น้ำยาโดน', 'ใส่แว่นตาและถุงมือ', 'ไม่ได้ขายผลิตภัณฑ์ของตนเป็นยากำจัดตะไคร่', 'การใส่เกินขนาดหรือหยอดลงบนต้นไม้โดยตรง', 'ใบวาลิสเนอเรียละลาย', 'อนาคาริสไวต่อผลิตภัณฑ์นี้เป็นพิเศษ', '5 มล. ต่อปริมาตรตู้ 30 ลิตร'],
      gone: ['1 มล. ต่อ 50 ลิตร', '5 มล. ต่อ 40 ลิตร', '5 มล. ต่อ 200 ลิตร'],
    },
    id: {
      label: 'Gunakan dosis sesuai label produk yang Anda beli',
      kept: ['Konsentrasi tinggi menghabiskan oksigen', 'jangan pernah dicampur', 'Riccardia (coral moss) dan Riccia fluitans', 'kacamata pelindung dan sarung tangan', 'tidak dipasarkan sebagai pembasmi alga', 'overdosis atau penyemprotan langsung ke tanaman', 'daun Vallisneria meleleh', 'Anacharis termasuk sangat sensitif'],
      gone: [],
    },
  }
  for (const [lang, w] of Object.entries(want)) {
    const t = page(lang)
    expect(t.held, lang).toBeUndefined()
    expect(t.bodyFixed, lang).toBe(true)
    const seen = [t.name, t.body, ...(t.summary ?? []), ...(t.faq ?? []).flatMap(f => [f.q, f.a])].join('\n')
    for (const name of ['Easy Carbo', 'Flourish', 'Excel', 'OxiClean', 'Seachem', ...w.gone]) expect(seen, `${lang}: ${name}`).not.toContain(name)
    for (const s of [w.label, ...w.kept]) expect(t.body, `${lang}: ${s}`).toContain(s)
  }
})

// The chief of staff, 16 Nov 2026: the video guide on where to learn aquascaping named three private hobbyists in passing
// (a group's admin, a website's owner, the keeper of a well-known tank). The names go by hand, each said by role; the group
// and the site stay named. The body, the questions and the title are fixed, since a redo writes from the video's
// transcript, which still says them. The check reads a peer's form of address before a capitalised name, so the test
// needn't repeat the names, and every check is a yes or no, so a failure prints no page text.
test('the guide on where to learn aquascaping names no private person in passing, and is fixed by hand', () => {
  const t = JSON.parse(readFileSync(fileURLToPath(new URL('../../../content/guides/youtube-qzPVpr89Ugo/vi.json', import.meta.url)), 'utf8')) as Translation & Record<string, unknown>
  const all = [t.name, t.body, ...(t.summary ?? []), ...(t.faq ?? []).flatMap(f => [f.q, f.a])].join('\n')
  // A form of address before a capitalised name, a space, a no-break space or an inline tag between; not "anh em" nor
  // "tiếng Anh", and never across a block's tags ("Ghi chú</th>").
  expect(/(?<!\p{L})(?:(?<!tiếng\s)[Aa]nh|[Cc]hị|(?<![Aa]nh\s)[Ee]m|[Bb]ác|[Cc]hú|[Cc]ô)(?:[ \t\u00a0]|&nbsp;|<(?:strong|b|em|i|a)\b[^>]*>)+\p{Lu}/u.test(all), 'a form of address before a name').toBe(false)
  for (const said of [
    'Admin nhóm đã đăng nhiều bài hữu ích trong mục thông báo.',
    'Trang này tìm trên Google là dễ gặp.',
    'Kho bài còn có một topic dài 40 trang về bể nổi tiếng của một người chơi từng dự thi và đạt nhiều giải quốc tế.',
    'Thủy Sinh AZ',
  ]) expect((t.body ?? '').includes(said), said).toBe(true)
  for (const mark of ['bodyFixed', 'faqFixed', 'nameFixed']) expect(t[mark], mark).toBe(true)
})

// The chief of staff, 16 Nov 2026: a Loaches Online article on how a Botia's markings change as it grows printed its
// author's email in each letter's header. The addresses go by hand and the author stays credited. The body is fixed,
// since a redo translates the source page again, which still has them. Every check is a yes or no, so a failure prints
// no page text, and the author is checked by the letters' headers, so the test needn't write the name.
test('the Botia markings guide prints no email address, still credits its author, and is fixed by hand', () => {
  const t = JSON.parse(readFileSync(fileURLToPath(new URL('../../../content/guides/loachesonline-articles-botia-rostrata-development-of-markings-during-growth/vi.json', import.meta.url)), 'utf8')) as Translation & Record<string, unknown>
  const all = [t.name, t.body, ...(t.summary ?? []), ...(t.faq ?? []).flatMap(f => [f.q, f.a])].join('\n')
  expect(all.includes('@'), 'an "@", an address or any of it').toBe(false)
  expect((t.body ?? '').match(/<strong>Từ:<\/strong> \p{Lu}\p{L}+ (?:\p{Lu}\. )?\p{Lu}\p{L}+/gu)?.length, 'letters whose header names their sender').toBe(2)
  expect(t.bodyFixed).toBe(true)
})

// The chief of staff, 16 Nov 2026: the acclimation guide filled a fish bag a third oxygen, the wrong way round (Tetra and
// the trade association's transport code: a third water, two thirds oxygen), and the Lũa material said shop wood comes
// with no chemicals, where a keepers' page tells of oiled wood that killed every fish in a few tanks. Both rested on a
// refused shop alone, and both are mended by hand: the guide's body is fixed, and the material was already.
test('a fish bag is a third water and two thirds oxygen, and shop wood is smelled before use, both fixed by hand', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const guide = join(root, 'content/guides/aquatome-tha-ca-moi-mua-vao-be-cach-thuan-nuoc-dung')
  const t = JSON.parse(readFileSync(join(guide, 'vi.json'), 'utf8')) as Translation & { bodyFixed?: boolean }
  expect(t.body).toContain('Túi đựng cá nên có khoảng 1/3 là nước và 2/3 là oxy.')
  expect(t.body).not.toMatch(/1\/3 là oxy/)
  expect(t.bodyFixed).toBe(true)
  const refs = (JSON.parse(readFileSync(join(guide, 'entity.json'), 'utf8')) as { refs: { url: string }[] }).refs.map(r => r.url)
  expect(refs).toEqual(expect.arrayContaining(['https://blog.tetra.net/en-en/fish-transport-and-acclimatisation/', 'https://ornamentalfish.org/wp-content/uploads/OATA-Transport-Code-Oct-2022.pdf']))
  const lua = JSON.parse(readFileSync(join(root, 'content/materials/lua/vi.json'), 'utf8')) as { sections: { about: string }; bodyFixed?: boolean }
  expect(lua.sections.about).not.toContain('không tẩm hóa chất')
  expect(lua.sections.about).toContain('Gỗ có mùi hóa chất thì đừng cho vào bể.')
  expect(lua.sections.about).toContain('đã làm chết hết cá trong vài bể [14]')
  expect(lua.bodyFixed).toBe(true)
  const sources = (JSON.parse(readFileSync(join(root, 'content/materials/lua/entity.json'), 'utf8')) as { sources: { url: string }[] }).sources
  expect(sources[13]?.url).toBe('https://aquariumscience.org/14-10-wood/')
})

// The chief of staff, 16 Nov 2026: the same guide watched new fish in quarantine for 1–2 weeks in a 20–40 L tank, from the
// refused shop alone, where a keeper's page says always at least four weeks and gives no tank size. Mended by hand in the
// three languages it has, each named as a keeper (topic.md), each body fixed so a redo keeps it, the page in each
// language's references (Indonesian and Thai keep their own list), and the research's fact now says the keeper's page.
test('new fish are quarantined at least four weeks, in every language of the guide, fixed by hand', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const guide = join(root, 'content/guides/aquatome-tha-ca-moi-mua-vao-be-cach-thuan-nuoc-dung')
  const quarantine = 'https://aquariumscience.org/index.php/12-3-quarantine-tanks'
  const lines = {
    vi: 'Một người chơi khuyên nên luôn giữ cá mới trong bể cách ly ít nhất 4 tuần.',
    id: 'Seorang penghobi menyarankan ikan baru selalu dikarantina minimal 4 minggu.',
    th: 'ผู้เลี้ยงรายหนึ่งแนะนำให้กักโรคปลาใหม่ทุกครั้ง อย่างน้อย 4 สัปดาห์',
  }
  for (const [lang, line] of Object.entries(lines)) {
    const t = JSON.parse(readFileSync(join(guide, `${lang}.json`), 'utf8')) as Translation & { bodyFixed?: boolean; refs?: { url: string }[] }
    expect(t.body, lang).toContain(line)
    expect(t.body, lang).not.toMatch(/20–40 (?:L|ลิตร)/)
    expect(t.bodyFixed, lang).toBe(true)
    if (lang !== 'vi') expect(t.refs?.map(r => r.url), lang).toContain(quarantine)
  }
  const refs = (JSON.parse(readFileSync(join(guide, 'entity.json'), 'utf8')) as { refs: { url: string }[] }).refs.map(r => r.url)
  expect(refs).toContain(quarantine)
  const research = JSON.parse(readFileSync(join(root, 'engine-state/topics/aquatome-tha-ca-moi-mua-vao-be-cach-thuan-nuoc-dung.json'), 'utf8')) as { sources: { url: string }[]; facts: { fact: string; source: number }[] }
  const fact = research.facts.find(f => f.fact.includes('at least four weeks'))
  expect(research.sources[fact?.source ?? -1]?.url).toBe(quarantine)
  expect(research.facts.some(f => f.fact.includes('20–40 L'))).toBe(false)
})

// The chief of staff, 16 Nov 2026: no email address in any file under content/, in any field, a page's text or a video's
// title or a photo's credit. The repository is public, and an address belongs to a person. No list of allowed addresses: a
// list would print them here. A failure names the file and the field, never the address (a key with one is named by its
// place, not its words, and so is a key on the way to one). The sweep cuts one from every field of every file each cycle
// (sweep.ts dropEmailsEverywhere), reading them as this does, so a hit here is one it missed: both read a file's strings,
// never its raw text, leave a string that is one link whole (isLink), and read every file but a picture or a video.
// sources/ and engine-state/ join this once their copies are cleaned.
test('no email address in any file under content/', async () => {
  const root = fileURLToPath(new URL('../../../content/', import.meta.url))
  const found: string[] = []
  const walk = (x: unknown, at: string, file: string): void => {
    if (typeof x === 'string') { if (!isLink(x) && hasEmail(x)) found.push(`${file} ${at || '(text)'}`); return }
    if (Array.isArray(x)) { x.forEach((v, i) => walk(v, `${at}[${i}]`, file)); return }
    if (!x || typeof x !== 'object') return
    Object.entries(x).forEach(([k, v], i) => {
      const name = hasEmail(k) ? `(key ${i + 1})` : k
      if (name !== k) found.push(`${file} ${at ? `${at}.` : ''}${name}`)
      walk(v, at ? `${at}.${name}` : name, file)
    })
  }
  for (const f of (await readdir(root, { recursive: true, withFileTypes: true })).filter(d => d.isFile() && !isMediaFile(d.name)).map(d => relative(root, join(d.parentPath, d.name))).sort()) {
    const raw = await readFile(join(root, f), 'utf8')
    if (!mayHoldEmail(raw)) continue
    if (!f.endsWith('.json')) { if (hasEmail(raw)) found.push(`${f} (text)`); continue }
    let data: unknown
    try { data = JSON.parse(raw) } catch { found.push(`${f} (not JSON)`); continue }
    walk(data, '', f)
  }
  expect(found).toEqual([])
}, slow(120_000))

// The chief of staff, 17 Nov 2026 (Thursday's change): no page names a refused site's page (cycle-only.ts REFUSED_SITES), in
// any language or any part of it (references, sources, photos' pages), and no research the engine keeps holds one. A page
// whose text cites its sources by number waits for its text (WAITING), and is held to still having it, so it leaves that
// list the day its text is fixed. A buying list keeps an entry it has (engine-state/shop-lists, not a facts file). No model:
// every string in every file, as `pnpm engine refused-sweep` leaves them (refused-sources.ts refusedScan).
test('no page lists a refused site\'s page in any language, and no kept research cites one', async () => {
  const repo = fileURLToPath(new URL('../../..', import.meta.url))
  const { naming, proxied } = await refusedScan(repo)
  expect(naming, 'run pnpm engine refused-sweep').toEqual(Object.keys(WAITING).sort())
  // No address on a proxy's host (Google's cache, Translate's proxy, a reader proxy), whose original isn't read: none on
  // 17 Nov 2026, and it stays none, so a refused site's facts can't come back through one unseen (the chief of staff).
  expect(proxied).toEqual([])
}, slow(120_000))
