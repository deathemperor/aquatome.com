/**
 * The owner's fish names, in a module of their own: the content rules and the sweep hold pages to them (content-rules.ts),
 * and every Vietnamese writer's prompt lists them (phrases.ts, VI_STYLE). It imports nothing, so both can read it.
 */
/** A fish's old name: in a sentence that names one of `fish`, `was` is its old name and `now` its name. */
export type SwappedName = {
  was: string
  fish: readonly string[]
  now: string
  /** Only in the name's own brackets: "cá bám đá" still names the family. */
  brackets?: true
  /** `fish` is a group, and `now` its genera's names: the words don't say which one, so the sweep leaves it. */
  group?: true
  /**
   * The fish the old name belongs to now: a sentence naming them may be right, so it is neither listed nor renamed, unless
   * the old name stands right beside the row's fish ("cá cầu vồng chi Pseudomugil").
   */
  stillFor?: readonly string[]
}
export const SIAMESE = ['Crossocheilus', 'algae eater']
/** The blue-eyes: the genus, its species as a page abbreviates them ("P. luminatus"), and the English. */
export const BLUE_EYES = ['Pseudomugil', 'P\\.\\s*(?:connieae|cyanodorsalis|furcat(?:us|a)|gertrudae|halophilus|inconspicuus|ivantsoffi|luminatus|majusculus|mellis|novaeguineae|paludicola|paskai|pellucidus|reticulatus|signifer|tenellus)', 'blue[- ]?eyes?']
/** The rainbowfish proper, whose word "cầu vồng" stays. */
export const RAINBOWS = ['Melanotaenia', 'Glossolepis', 'Chilatherina', 'Iriatherina', 'Marosatherina', 'Rhadinocentrus', 'Bedotia', 'Cairnsichthys', 'Telmatherina']
export const PARADISE = ['Macropodus', 'paradise fish']
/** The owner's names of 2026-11-07. The writers' prompts read this list, the sweep writes it, and the swapped-name rule holds it. */
export const SWAPPED: readonly SwappedName[] = [
  { was: 'cá bút chì', fish: ['Nannostomus', 'pencilfish', 'pencil fish'], now: 'cá chì', stillFor: SIAMESE },
  { was: 'cá bám đá', fish: ['Beaufortia', 'Sewellia', 'Gastromyzon', 'Pseudogastromyzon', 'Sinogastromyzon'], now: 'cá tỳ bà bướm', brackets: true },
  { was: 'cá cờ', fish: ['Jordanella', 'flagfish'], now: 'cá flagfish', stillFor: PARADISE },
  { was: 'cá cờ', fish: ['Mesonauta'], now: 'cá Mesonauta', stillFor: PARADISE },
  { was: 'cá cờ', fish: ['Laetacara'], now: 'cá Laetacara', stillFor: PARADISE },
  { was: 'cá cờ', fish: ['flag cichlid'], now: 'cá Mesonauta, cá Laetacara', group: true },
  { was: 'cá thiên đường', fish: ['Macropodus opercularis'], now: 'cá cờ' },
  // The chief of staff's names of 2026-11-13 (FISH_NAMES below): the word for the fish's kind, beside a fish of that kind.
  // The blue-eyes (Pseudomugil): "mắt xanh", the rainbowfish's "cầu vồng" never.
  { was: 'cầu vồng', fish: BLUE_EYES, now: 'mắt xanh', stillFor: RAINBOWS },
]

/**
 * A fish page's Vietnamese name, as the chief of staff settled it: the word keepers here use for its kind, never another
 * fish's. The sweep sets it once and guards it (`nameFixed`), with `was` and `alts` among the page's other names, which
 * every writer and cleaner keeps; the page's address stays. Its text follows: `was` wherever a Vietnamese page or summary
 * writes it (no other page's name is it or begins with it: a test holds that), unless another scientific name stands in
 * brackets beside it; and the kind's word beside the fish (its row in SWAPPED). A row whose `name` is `was` only adds
 * `alts`: nothing is renamed.
 */
export type FishName = {
  id: string
  sci: string
  was: string
  name: string
  alts?: readonly string[]
  /** A new address: the old one forwards to it with `was` in its note. Without it, the address stays. */
  slug?: string
  /** A plant's page, not a fish's. */
  kind?: 'species' | 'plants'
  /**
   * Names no one uses, made by translating an English name: off the page altogether, renamed wherever a page writes them,
   * and never in the forward's note, so a search doesn't find the page by them.
   */
  drop?: readonly string[]
  /** Longer names that begin with the old one, another name the page lists: written as they are, never renamed inside. */
  longer?: readonly string[]
  /**
   * Names that mean another animal: off the page and out of its forward, as `drop`, but never renamed in the text, where
   * they mean the other.
   */
  elsewhere?: readonly string[]
  /** On its own page (text, summary, photo captions), what it is called where the page wrote an `elsewhere` name. */
  own?: string
  /**
   * Keepers also write its name without the kind's word ("con sặc lùn", "Sặc lùn đực"): written so, the old name becomes
   * the new one without it too.
   */
  bare?: boolean
}
/** The chief of staff's names of 2026-11-13, kind by kind, smallest first. */
export const FISH_NAMES: readonly FishName[] = [
  { id: 'pseudomugil-luminatus', sci: 'Pseudomugil luminatus', was: 'Cá cầu vồng neon đỏ mắt xanh', name: 'Cá mắt xanh neon đỏ' },
  // The owner, 2026-11-13: "is often táo đỏ". Keepers write "táo đỏ" bare (4 times in their own writing, "cầu vồng táo
  // đỏ" never); shops write "Cá cầu vồng táo đỏ", kept so a search on it lands here. The page's "Cá cầu vồng đỏ cá hồi"
  // (Salmon red rainbowfish, translated) is another of its names: renamed inside, it would read "cá táo đỏ cá hồi". So are
  // a guide's "Cá cầu vồng đỏ Irian" (Irian red rainbowfish) and the page's "Cá cầu vồng đỏ Sentani".
  { id: 'glossolepis-incisus', sci: 'Glossolepis incisus', was: 'Cá cầu vồng đỏ', name: 'Cá táo đỏ', alts: ['Cá cầu vồng táo đỏ'], slug: 'ca-tao-do', longer: ['Cá cầu vồng đỏ cá hồi', 'Cá cầu vồng đỏ Irian', 'Cá cầu vồng đỏ Sentani'] },
  // The owner, 2026-11-13: "This is commonly called bèo nhật". The forum's "bèo nhật" (31 times) is this plant ("lá nhỏ cỡ
  // móng tay, có rễ rất dài"); the page's two names were the English ones translated ("bèo tây" is the water hyacinth).
  { id: 'limnobium-laevigatum', kind: 'plants', sci: 'Limnobium laevigatum', was: 'Bèo tây Nam Mỹ', name: 'Bèo Nhật', drop: ['Bèo tây Nam Mỹ', 'Bèo nhím Nam Mỹ'], slug: 'beo-nhat' },
  // Curation, 2026-11-13: the guppy-breeding guide's "bo bo (rận nước)", the daphnia, linked to this water louse. Keepers
  // write "rận nước" for the louse on a sick fish ("cá bị rận nước và mỏ neo", 3 forum threads), books for the daphnia;
  // none for Asellus, which has no Vietnamese name in use: its scientific name, and the text's "rận nước" stays theirs.
  // Its own page says "Asellus", so a search for "rận nước" doesn't find it by its text (Astra, 13 Nov).
  { id: 'asellus-aquaticus', sci: 'Asellus aquaticus', was: 'Rận nước', name: 'Asellus aquaticus', slug: 'asellus-aquaticus', elsewhere: ['Rận nước'], own: 'Asellus' },
  // The owner, 2026-11-15: a fiddler crab headed "Cá Austruca annulipes", a fish's word made before the kind words (14 Nov).
  // "Cua vĩ cầm" is every fiddler crab and Gelasimus vocans' page: this one is the kind's name and its own, as keepers
  // write a cory ("cá chuột sterbai"). The page's "Cua vĩ cầm" and "Cua càng vĩ cầm" stay among its other names.
  { id: 'austruca-annulipes', sci: 'Austruca annulipes', was: 'Cá Austruca annulipes', name: 'Cua vĩ cầm annulipes', slug: 'cua-vi-cam-annulipes', drop: ['Cá Austruca annulipes'] },
  // Names keepers use, buried among the page's other names under a translated one (the chief of staff, 13 Nov; the owner's
  // sheet of 14 Nov, "silence means the seven go live", each with its new address). Each is tied to the species by a
  // source: the trade list, Vietnamese Wikipedia or a Vietnamese shop's list. The seventh, "Cá otto", waits for the
  // owner: its only tie was a shop the engine no longer reads (the chief of staff, 16 Nov). "Cá sặc gấm" (Trichogaster
  // lalius) waited a day: the pygmy gourami's page, captions and a video guide call that fish "cá sặc lùn", which the rename
  // would turn into this one's name.
  { id: 'gymnocorymbus-ternetzi', sci: 'Gymnocorymbus ternetzi', was: 'Cá tetra góa phụ đen', name: 'Cá cánh buồm', slug: 'ca-canh-buom' },
  // Keepers' "cá mún" is any platy, so a colour after it is renamed too ("cá mún đỏ"). The other species' names that
  // begin with "Cá platy" stay theirs.
  { id: 'xiphophorus-maculatus', sci: 'Xiphophorus maculatus', was: 'Cá platy', name: 'Cá mún', slug: 'ca-mun', longer: ['Cá platy variatus', 'Cá platy evelynae', 'Cá platy Catemaco', 'Cá platy Miller', 'Cá platy biến sắc', 'Cá platy đa dạng', 'Cá platy Sunset Variatus'] },
  { id: 'bolbitis-heudelotii', kind: 'plants', sci: 'Bolbitis heudelotii', was: 'Dương xỉ nước châu Phi', name: 'Dương xỉ châu Phi', slug: 'duong-xi-chau-phi' },
  { id: 'corydoras-panda', sci: 'Corydoras panda', was: 'Cá chuột panda', name: 'Cá chuột gấu trúc', slug: 'ca-chuot-gau-truc', longer: ['Cá chuột panda đuôi cờ'] },
  // "Nô lệ" alone is slavery: the shops' name for this fish is "cá nô lệ", with "cá".
  { id: 'gyrinocheilus-aymonieri', sci: 'Gyrinocheilus aymonieri', was: 'Cá hút đá', name: 'Cá nô lệ', slug: 'ca-no-le', longer: ['Cá hút đá Borneo'] },
  // Its turn came on 18 Nov, once the pygmy gourami's own words say "cá thanh ngọc lùn" (the row below and KIND_PASSAGES).
  // Keepers write "sặc gấm" (23 times in their own writing, "sặc lùn" never) and drop the "cá" as often ("con sặc lùn"),
  // so the bare name goes too. Its colours follow ("cá sặc gấm xanh"), as the platy's did.
  { id: 'trichogaster-lalius', sci: 'Trichogaster lalius', was: 'Cá sặc lùn', name: 'Cá sặc gấm', slug: 'ca-sac-gam', bare: true },
  // The pygmy gourami (Trichopsis pumila) is "Cá thanh ngọc lùn" (fixed by hand, 12 Nov). Its English "pygmy gourami" was
  // written "cá sặc lùn" on its page and photos, which is keepers' dwarf gourami: its own words say its own name.
  { id: 'trichopsis-pumila', sci: 'Trichopsis pumila', was: 'Cá thanh ngọc lùn', name: 'Cá thanh ngọc lùn', elsewhere: ['Cá sặc lùn'], own: 'cá thanh ngọc lùn' },
  // The discus is "Cá đĩa", and the south and the shops write "Cá dĩa" (forum threads 68 to 46, shops only "dĩa"; the Site
  // Lead's spellings, 16 Nov): a search for it finds the page, and the guides that write it find the page's photo.
  { id: 'symphysodon-aequifasciatus', sci: 'Symphysodon aequifasciatus', was: 'Cá đĩa', name: 'Cá đĩa', alts: ['Cá dĩa'] },
  // The pearl gourami's page was "Cá sặc ngọc trai" and the site's guides "cá sặc trân châu" (the chief of staff, 17 Nov:
  // its guide's fish card and text disagreed). Vietnamese shops write "sặc trân châu" first ("Cá sặc trân châu/ cá sặc
  // ngọc trai", "Cá sặc trân châu hay còn được biết đến với cái tên cá sặc ngọc trai"), and two pages give "cá mã giáp"
  // too (the research call of 17 Nov). Keepers' own "cá ngọc trai" is the pearlscale goldfish. The address stays.
  { id: 'trichopodus-leerii', sci: 'Trichopodus leerii', was: 'Cá sặc ngọc trai', name: 'Cá sặc trân châu', alts: ['Cá mã giáp'], bare: true },
  // A writer's names, each settled on 14 Nov (the naming plan): another kind's word, a word of the writer's own, or an
  // English name in brackets. Each page keeps its address until the owner says to move it (the chief of staff, 16 Nov).
  { id: 'champsochromis-caeruleus', sci: 'Champsochromis caeruleus', was: 'Cá trê Malawi', name: 'Cá ali Champsochromis caeruleus', drop: ['Cá trê Malawi'] },
  { id: 'pelvicachromis-kribensis', sci: 'Pelvicachromis kribensis', was: 'Cá rồng đỏ Kribensis', name: 'Cá Pelvicachromis kribensis', drop: ['Cá rồng đỏ Kribensis'] },
  { id: 'amphilius-frieli', sci: 'Amphilius frieli', was: 'Cá da trơn suối Amphilius frieli', name: 'Cá da trơn Amphilius frieli', drop: ['Cá da trơn suối Amphilius frieli'] },
  { id: 'corbicula-fluminea', sci: 'Corbicula fluminea', was: 'Trai nước ngọt Corbicula', name: 'Hến Corbicula fluminea', drop: ['Trai nước ngọt Corbicula'] },
  { id: 'aphyosemion-gabunense', sci: 'Aphyosemion gabunense', was: 'Cá killi đuôi đàn lia Gabon (Gabon lyretail)', name: 'Cá killi đuôi đàn lia Gabon', drop: ['Cá killi đuôi đàn lia Gabon (Gabon lyretail)'] },
  { id: 'boulengerella-cuvieri', sci: 'Boulengerella cuvieri', was: 'Cá cuvieri (Boulengerella cuvieri)', name: 'Cá Boulengerella cuvieri', drop: ['Cá cuvieri (Boulengerella cuvieri)', 'Cá cuvieri'] },
  { id: 'myriophyllum-elatinoides', kind: 'plants', sci: 'Myriophyllum elatinoides', was: 'Cây rong đuôi chồn nước (Myriophyllum elatinoides)', name: 'Cây rong đuôi chồn Myriophyllum elatinoides', drop: ['Cây rong đuôi chồn nước (Myriophyllum elatinoides)'] },
]

/** A row's names a page may not keep: those it drops or that are another's, in any form (the scientific name in brackets too). */
export const droppedName = (r: FishName, n: string) => [...(r.drop ?? []), ...(r.elsewhere ?? [])].some(d => n.normalize('NFC').toLowerCase().startsWith(d.toLowerCase()))
/** The names a row renames wherever a page writes them: its old one and those it drops, never another animal's. */
export const oldNames = (r: FishName) => [...new Set([r.was, ...(r.drop ?? [])])].filter(n => n !== r.name && !(r.elsewhere ?? []).includes(n))
/** A name without its kind's word: "Cá sặc lùn" is "sặc lùn". */
const withoutKind = (n: string) => n.replace(/^cá\s+/iu, '')
/**
 * Each name a row renames, with the name it becomes: its old ones, and with `bare` each without the kind's word too
 * (`kindless`: the whole name, "cá" and all, is the first one's to rename or leave).
 */
export const renamings = (r: FishName) => [
  ...oldNames(r).map(was => ({ was, name: r.name, kindless: false })),
  ...(r.bare ? oldNames(r).map(was => ({ was: withoutKind(was), name: withoutKind(r.name), kindless: true })) : []),
]
/**
 * Its own page's words with a name that is another animal's written as `own`: "Rận nước (Asellus aquaticus)" and "Rận
 * nước Asellus aquaticus" as the scientific name, ", còn gọi là rận nước," gone with both its commas, any other "rận nước"
 * as "Asellus".
 */
export const ownWords = (r: FishName, text: string) => (r.elsewhere ?? []).flatMap(n => {
  // Whole, then without the kind's word ("Sặc lùn trong bể…"), which another row's `bare` would rename too.
  const own = r.own ?? r.sci
  return withoutKind(n) === n ? [{ n, own }] : [{ n, own }, { n: withoutKind(n), own: withoutKind(own) }]
}).reduce((s, { n, own }) => {
  const w = `(?<!\\p{L})${n.replace(/ /g, '\\s+')}(?!\\p{L})`
  return s.replace(new RegExp(`${w}\\s*(?:\\(\\s*${r.sci}\\s*\\)|${r.sci})`, 'giu'), r.sci)
    .replace(new RegExp(`,\\s*còn gọi là\\s+${w}(\\s*\\([^()]*\\))?,?`, 'giu'), '$1')
    .replace(new RegExp(w, 'giu'), m => (m[0] === m[0]!.toUpperCase() ? own[0]!.toUpperCase() + own.slice(1) : own))
}, text.normalize('NFC'))

/**
 * A passage a person found still calls a fish by another fish's kind, where no rule can tell the sentence is about it (a
 * heading, "cá cầu vồng lùn" for a part about blue-eyes, when "Cá cầu vồng lùn" is also Melanotaenia maccullochi's name):
 * the words as the page has them and as they should be, on that page's Vietnamese text. Gone from the page, the row does
 * nothing: a writer told the names (VI_STYLE) doesn't write them again.
 */
export type KindPassage = { page: string; was: string; now: string }
export const KIND_PASSAGES: readonly KindPassage[] = [
  // The chief of staff's blue-eyes, Astra's read of 2026-11-13: Aquarium Co-op's "Nano Rainbowfish Tank" is about Pseudomugil.
  { page: 'guides/aquariumcoop-blogs-aquarium-7-colorful-fish-for-10-gallon-aquarium', was: 'Bể cá cầu vồng nano', now: 'Bể cá mắt xanh' },
  { page: 'guides/aquariumcoop-blogs-aquarium-7-colorful-fish-for-10-gallon-aquarium', was: 'Cá cầu vồng lùn sống khá ngắn', now: 'Cá mắt xanh sống khá ngắn' },
  // Astra's second read: its "cầu vồng neon đỏ" sits in a sentence of three blue-eyes, so no rule can tell it from another.
  { page: 'guides/aquariumcoop-blogs-aquarium-5-best-fish-tank-ideas-for-a-20-gallon-aquarium', was: 'cầu vồng neon đỏ (P. luminatus)', now: 'mắt xanh neon đỏ (P. luminatus)' },
  // A fresh read of 16 Nov: the video calls the penguin tetra (Thayeria, "Cá tetra cánh cụt") "cánh buồm", the black
  // tetra's name once Gymnocorymbus ternetzi took it, two tetras before it in the same list.
  { page: 'guides/youtube-nuSEvQyWyXA', was: 'cánh buồm (penguin)', now: 'tetra cánh cụt (penguin)' },
  // The pygmy gourami (Trichopsis pumila) as "cá sặc lùn", the dwarf gourami's old name, where no scientific name stands
  // beside it: a video's tank and an Aquarium Co-op list (18 Nov, before the dwarf gourami took "Cá sặc gấm").
  { page: 'guides/youtube--YXB8au4nnU', was: 'cá sặc lùn (sparkling gourami)', now: 'cá thanh ngọc lùn (sparkling gourami)' },
  { page: 'guides/youtube--YXB8au4nnU', was: 'cá nhỏ như cá sặc lùn', now: 'cá nhỏ như cá thanh ngọc lùn' },
  // There it's one of the fish's other names, the English one translated: the one its page lists, "Cá sặc kêu lùn".
  { page: 'guides/aquariumcoop-blogs-aquarium-top-5-gouramis', was: 'cá sặc lùn kêu (dwarf croaking gourami)', now: 'cá sặc kêu lùn (dwarf croaking gourami)' },
  // Four video guides of 8 Nov call the same fish, the sparkling gourami, "cá sặc gấm": the dwarf gourami's name now
  // (Codex's read of the names change, 17 Nov). Its own name there, every place.
  ...['youtube-JQiui3Wmurs', 'youtube-ahN0nP8HLaI', 'youtube-cGTFcYJ_BQs', 'youtube-g6Rqis9uO1Y'].flatMap(id => [
    { page: `guides/${id}`, was: 'cá sặc gấm (sparkling gourami)', now: 'cá thanh ngọc lùn (sparkling gourami)' },
    { page: `guides/${id}`, was: 'Cá sặc gấm (sparkling gourami)', now: 'Cá thanh ngọc lùn (sparkling gourami)' },
  ]),
  { page: 'guides/youtube-cGTFcYJ_BQs', was: 'đàn sặc gấm đang chuẩn bị sinh sản', now: 'đàn thanh ngọc lùn đang chuẩn bị sinh sản' },
  { page: 'guides/youtube-g6Rqis9uO1Y', was: 'Cá sặc gấm (<em>Trichopsis pumila</em>)', now: 'Cá thanh ngọc lùn (<em>Trichopsis pumila</em>)' },
  { page: 'guides/youtube-g6Rqis9uO1Y', was: 'cá sặc gấm đôi khi săn tép con', now: 'cá thanh ngọc lùn đôi khi săn tép con' },
  { page: 'guides/youtube-g6Rqis9uO1Y', was: 'Cá sặc gấm đôi khi săn tép con', now: 'Cá thanh ngọc lùn đôi khi săn tép con' },
  { page: 'guides/youtube-g6Rqis9uO1Y', was: 'Cá sặc gấm có nuôi chung với tép', now: 'Cá thanh ngọc lùn có nuôi chung với tép' },
  { page: 'guides/youtube-g6Rqis9uO1Y', was: '<td>Sặc gấm</td>', now: '<td>Thanh ngọc lùn</td>' },
  { page: 'guides/youtube-g6Rqis9uO1Y', was: 'chọn sặc gấm hoặc dario', now: 'chọn thanh ngọc lùn hoặc dario' },
]
