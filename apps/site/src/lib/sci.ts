/**
 * A scientific name as whole words, in any case (`g`: to count them): not part of a longer Latin word, though Thai
 * may run right up to it ("ปลาAbbottina rivularis"). No imports: the cards' and pickers' scripts use it too.
 */
export const sciWords = (sci: string, flags = 'iu') =>
  new RegExp(`(?<![\\p{Script=Latin}])${sci.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{Script=Latin}])`, flags)

/**
 * Whether a name already says its scientific name, as whole words: "Cá lóc Channa andrao", "Bèo tây Nam Mỹ (Limnobium
 * laevigatum)", or the scientific name alone (a page in a language with no common name for it). "Cá chạch
 * Paracanthocobitis rubidipinnis" doesn't say "Acanthocobitis rubidipinnis".
 */
export const saysSci = (name: string, sci: string) => !!sci && sciWords(sci).test(name)

/**
 * The scientific name to print beside a name (under a heading, on a card, in a picker), or nothing when the name says
 * it: printed together, the pair says it once (the chief of staff, 13 November: 820 Vietnamese names hold it).
 */
export const sciBeside = (name: string, sci: string) => (saysSci(name, sci) ? undefined : sci)

/** A picture's text: the name, then the scientific name unless the name says it. */
export const nameAndSci = (name: string, sci: string) => (saysSci(name, sci) ? name : `${name}, ${sci}`)
