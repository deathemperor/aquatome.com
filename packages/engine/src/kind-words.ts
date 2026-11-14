import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * The words Vietnamese keepers use for one kind of animal (the Writing Lead's naming plan, 14 Nov 2026): "cá trê" is a
 * Clarias, never a glass catfish or a Malawi cichlid; "tép" is a Caridina or a Neocaridina, never a sea shrimp. Each word
 * holds the families keepers use it for, read from their writing (the keepers' corpus) and the trade list, not from a
 * dictionary; a word that covers only part of a family holds its genera ("rô phi": the tilapias). A name with a word that
 * doesn't fit its animal names another kind, and a new page doesn't go live with it.
 *
 * A word not here is not judged ("nheo" is used loosely for many catfish). The fish words follow "Cá " ("Cá trê …"); the
 * shrimp and shellfish words begin a name ("Tép …", "Ốc …") and are also the head word a page takes with its scientific
 * name when its own name fails (`headWord`).
 */
export type KindWord = {
  word: string
  families: readonly string[]
  genera?: readonly string[]
  /** A fish word: it follows "Cá ". Any other word begins a name. */
  fish?: true
  /** A shrimp or shellfish word that heads the plain scientific form. */
  head?: true
}

export const KIND_WORDS: readonly KindWord[] = [
  // Fish, after "Cá ".
  { word: 'trê', fish: true, families: ['Clariidae'] },
  { word: 'rô', fish: true, families: ['Anabantidae'] },
  { word: 'rô phi', fish: true, families: [], genera: ['Oreochromis', 'Sarotherodon', 'Tilapia', 'Alcolapia', 'Coptodon', 'Heterotilapia', 'Pelmatolapia'] },
  // "Catfish" word for word: keepers write no "cá mèo".
  { word: 'mèo', fish: true, families: [] },
  { word: 'chuột', fish: true, families: ['Callichthyidae'] },
  { word: 'rồng', fish: true, families: ['Osteoglossidae'] },
  { word: 'chó', fish: true, families: ['Esocidae'] },
  // "Cá bống vàng" is keepers' name for the algae eater (Gyrinocheilus): the corpus's videos and a forum.
  { word: 'bống', fish: true, families: ['Gobiidae', 'Oxudercidae', 'Gobionellidae', 'Eleotridae', 'Butidae', 'Odontobutidae', 'Rhyacichthyidae', 'Gyrinocheilidae'] },
  { word: 'mè', fish: true, families: ['Cyprinidae', 'Xenocyprididae'], genera: ['Hypophthalmichthys', 'Aristichthys'] },
  // The blue-eyes' name since 13 Nov (Pseudomugil).
  { word: 'mắt xanh', fish: true, families: ['Pseudomugilidae'] },
  // Shrimp and shellfish, beginning a name.
  // The freshwater ghost shrimp's genus, not its family: Palaemonidae holds the sea's cleaner and anemone shrimp too.
  { word: 'tép', families: ['Atyidae', 'Desmocarididae'], genera: ['Palaemonetes'], head: true },
  { word: 'tôm', families: ['Cambaridae', 'Parastacidae', 'Astacidae', 'Palaemonidae', 'Lysmatidae', 'Hippolytidae', 'Thoridae', 'Alpheidae', 'Stenopodidae', 'Rhynchocinetidae', 'Penaeidae', 'Triopsidae'], head: true },
  { word: 'ốc mượn hồn', families: ['Diogenidae', 'Paguridae', 'Coenobitidae'] },
  { word: 'ốc', families: ['Neritidae', 'Ampullariidae', 'Planorbidae', 'Physidae', 'Lymnaeidae', 'Thiaridae', 'Pachychilidae', 'Paludomidae', 'Semisulcospiridae', 'Pleuroceridae', 'Melanopsidae', 'Viviparidae', 'Bithyniidae', 'Nassariidae', 'Babyloniidae', 'Cypraeidae', 'Margaritidae', 'Trochidae', 'Turbinidae', 'Tegulidae', 'Cerithiidae', 'Strombidae', 'Columbellidae', 'Littorinidae', 'Hydrobiidae', 'Tateidae', 'Amnicolidae', 'Cochliopidae', 'Lithoglyphidae', 'Assimineidae', 'Pomatiopsidae', 'Stenothyridae', 'Valvatidae'], head: true },
  { word: 'cua', families: ['Sesarmidae', 'Gecarcinucidae', 'Potamonautidae', 'Potamidae', 'Ocypodidae', 'Dotillidae', 'Varunidae', 'Grapsidae', 'Trichodactylidae', 'Pseudothelphusidae', 'Hymenosomatidae', 'Inachidae', 'Epialtidae', 'Majidae', 'Portunidae', 'Xanthidae', 'Diogenidae', 'Paguridae', 'Coenobitidae'], head: true },
  { word: 'hến', families: ['Cyrenidae', 'Corbiculidae'], head: true },
  { word: 'trai', families: ['Unionidae', 'Margaritiferidae', 'Hyriidae', 'Iridinidae', 'Mycetopodidae'], head: true },
]

export type Taxon = { family?: string; genus?: string; order?: string }

/** A fish's order ends in "-iformes" (Perciformes, Siluriformes); a shrimp's, a snail's or a newt's doesn't. */
const isFish = (order: string) => /iformes$/.test(order)
const fits = (k: KindWord, t: Taxon) => (!!t.family && k.families.includes(t.family)) || (!!t.genus && !!k.genera?.includes(t.genus))
// The longest word first, so "rô phi" is read before "rô" and "ốc mượn hồn" before "ốc".
const LONGEST = [...KIND_WORDS].sort((a, b) => b.word.length - a.word.length)

/**
 * The table's word a name begins with and whether it fits the animal, or undefined when the name has none (not judged).
 * Read the same way wherever a name is checked: NFC, any case, the longest word first, a fish word after "Cá ". "Cá "
 * before anything else is a fish's: it fits any fish, and not a shrimp, a snail or a newt (an animal of a known order).
 */
export function kindWord(name: string, t: Taxon): { word: string; fits: boolean } | undefined {
  // Punctuation is a space between words, so "Cá trê-Malawi" reads as "cá trê malawi".
  const n = name.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
  const begins = (s: string, w: string) => s === w || s.startsWith(`${w} `)
  if (begins(n, 'cá')) {
    const rest = n.slice(3)
    const k = LONGEST.find(w => w.fish && begins(rest, w.word))
    if (k) return { word: k.word, fits: fits(k, t) }
    return t.order ? { word: 'cá', fits: isFish(t.order) } : undefined
  }
  const k = LONGEST.find(w => !w.fish && begins(n, w.word))
  return k ? { word: k.word, fits: fits(k, t) } : undefined
}

/**
 * The word a page's plain scientific form begins with: "Cá" for a fish, the shrimp or shellfish word whose families hold
 * the animal ("Tép", "Tôm", "Ốc"), or none (a coral, a sea slug, an animal of no known order: the scientific name alone).
 */
export function headWord(t: Taxon): string | undefined {
  if (t.order && isFish(t.order)) return 'Cá'
  const k = KIND_WORDS.find(w => w.head && fits(w, t))
  return k ? k.word[0]!.toUpperCase() + k.word.slice(1) : undefined
}

/** A name whose word from the table doesn't fit its animal: a new page doesn't go live with it. */
export const wrongKind = (name: string, t: Taxon) => kindWord(name, t)?.fits === false

/**
 * A page's plain scientific form, the name it takes when no name of its own passes: its head word and the scientific
 * name ("Cá Champsochromis caeruleus", "Tôm Lysmata debelius"). An animal of no known order keeps the "Cá" it always had.
 */
export const plainName = (sci: string, t: Taxon) => {
  const head = headWord(t) ?? (t.order ? undefined : 'Cá')
  return head ? `${head} ${sci}` : sci
}

/** The names that fell back, for the Writing Lead, not the owner (the chief of staff, 14 Nov): one per page, the latest. */
export const KIND_FALLBACKS = 'engine-state/_kind-fallbacks.json'
export type KindFallback = { name: string; word: string; took: string; at: string }

export async function recordKindFallback(root: string, id: string, f: KindFallback) {
  const file = join(root, KIND_FALLBACKS)
  const all = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, KindFallback>
  if (JSON.stringify(all[id] && { ...all[id], at: f.at }) === JSON.stringify(f)) return
  all[id] = f
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
}
