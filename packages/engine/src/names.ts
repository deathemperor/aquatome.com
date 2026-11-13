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
}
/** The chief of staff's names of 2026-11-13, kind by kind, smallest first. */
export const FISH_NAMES: readonly FishName[] = [
  { id: 'pseudomugil-luminatus', sci: 'Pseudomugil luminatus', was: 'Cá cầu vồng neon đỏ mắt xanh', name: 'Cá mắt xanh neon đỏ' },
  // The owner, 2026-11-13: "is often táo đỏ". Keepers write "táo đỏ" bare (4 times in their own writing, "cầu vồng táo
  // đỏ" never); shops write "Cá cầu vồng táo đỏ", kept so a search on it lands here.
  { id: 'glossolepis-incisus', sci: 'Glossolepis incisus', was: 'Cá cầu vồng đỏ', name: 'Cá táo đỏ', alts: ['Cá cầu vồng táo đỏ'], slug: 'ca-tao-do' },
  // The owner, 2026-11-13: "This is commonly called bèo nhật". The forum's "bèo nhật" (31 times) is this plant ("lá nhỏ cỡ
  // móng tay, có rễ rất dài"); the page's two names were the English ones translated ("bèo tây" is the water hyacinth).
  { id: 'limnobium-laevigatum', kind: 'plants', sci: 'Limnobium laevigatum', was: 'Bèo tây Nam Mỹ', name: 'Bèo Nhật', drop: ['Bèo tây Nam Mỹ', 'Bèo nhím Nam Mỹ'], slug: 'beo-nhat' },
]

/** A row's names a page may not keep: those it drops, in any form (with the scientific name in brackets too). */
export const droppedName = (r: FishName, n: string) => (r.drop ?? []).some(d => n.normalize('NFC').toLowerCase().startsWith(d.toLowerCase()))
/** The names a row renames wherever a page writes them: its old one and those it drops. */
export const oldNames = (r: FishName) => [...new Set([r.was, ...(r.drop ?? [])])].filter(n => n !== r.name)

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
]
