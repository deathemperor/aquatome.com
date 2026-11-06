/**
 * A page's marks: the sentences of its sources that say how it looks and how it is told from its look-alikes, as the
 * fish-ID agent reads them (a genus listed by search_handbook, a page opened by get_entry). Plain functions over the
 * page's sections (English, as the sources give them): the build, the Worker and the accuracy script all use them.
 *
 * The agent names a fish from what it remembers, then checks. A species it never thinks of it never checks: of the
 * handbook's 64 Betta, it never named the owner's Betta macrostoma ("male with red patch on opercle and dorsal-fin
 * ocellus") in three runs out of three. A genus listed with each species' marks lets it read them against the photo.
 */
export type Section = { key: string; html: string }

export const plainText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

/** About how long a page's marks are when it is opened, and in a genus's listing. */
export const LOOK_MAX = 320
export const LOOK_SHORT = 200

/** Words of colour and pattern: a sentence without one says nothing of the look. */
const MARK = /\b(ocell\w*|eye-?spots?|spots?|spotted|dots?|bands?|banded|bars?|barred|stripes?|striped|blotch\w*|patch\w*|markings?|marked|reticulat\w*|iridescen\w*|metallic|colou?r(?:ed|ation)?|red|orange|black|white|blue|yellow|green|silver\w*|golden|gold|brown|pink|purple|transparent|translucent)\b/gi
/** A conservation status ("IUCN Red List: Endangered"): never the look, whatever colour its name has. */
const STATUS = /\bIUCN\b|\bRed List\b/i
/** A sentence that tells it from others: the sources' diagnosis. */
const TELLS = /distinguish|diagnos|unique combination|can be told|differs? from|identif(?:y|ied)|recogni[sz]/i
/**
 * Words of keeping it, not of its look ("brown water", "red plants"); never "light" before a colour ("light green"). A
 * plant's own leaves are its look, so for a plant leaves and plants aren't keeping.
 */
const KEEPS = 'water|substrate|gravel|lighting|light(?!\\s*-?\\s*(?:green|red|brown|blue|yellow|pink|purple|orange|olive|gr[ae]y))|tank|aquarium|food|feed|fed|diet|wood|pH|temperature'
const KEEPING = new RegExp(`\\b(?:${KEEPS}|plants?|leaf|leaves)\\b`, 'gi')
const PLANT_KEEPING = new RegExp(`\\b(?:${KEEPS})\\b`, 'gi')
/** A diagnosis's counts and measures (9-11 dorsal-fin rays, 25 scales, depth 18-25 % SL): no use against a photo. */
const COUNTED = '(?:rays?|scales?|teeth|tooth|cusps?|vertebrae|gill-?rakers?)'
const COUNTS = new RegExp(`\\d[^;]*\\b${COUNTED}\\b|\\b${COUNTED}\\b[^;]*\\d|%\\s?[SH]L\\b|\\b[SH]L\\b`, 'i')

/** The sections a look is read from, the first preferred. */
const FROM = ['notes', 'quickFacts', 'dimorphism', 'beforeYouBuy']

const sentencesOf = (html: string) => plainText(html).split(/(?<=[.!?])\s+(?=[A-Z(])/).map(s => s.trim()).filter(Boolean)

/** A diagnosis's parts ("a; b; c") without those that only count or measure, still ending as a sentence. */
const withoutCounts = (s: string) => {
  const kept = s.split(/;\s*/).filter(part => !COUNTS.test(part)).join('; ').trim()
  return !kept || /[.!?]$/.test(kept) ? kept : `${kept.replace(/[,:]$/, '')}.`
}

/**
 * The page's marks, at most `max` characters: its sources' sentences that speak of colour or pattern, those that tell
 * it from others first, in the order of `FROM`; none that are about its keeping. Undefined when they say nothing of it.
 */
export function lookOf(sections: Section[] | undefined, max = LOOK_MAX, plant = false): string | undefined {
  const keepingWords = plant ? PLANT_KEEPING : KEEPING
  const found: { score: number; text: string }[] = []
  FROM.forEach((key, rank) => {
    for (const s of sections ?? []) {
      if (s.key !== key) continue
      for (const sentence of sentencesOf(s.html)) {
        if (STATUS.test(sentence)) continue
        const tells = TELLS.test(sentence)
        const text = tells ? withoutCounts(sentence) : sentence
        const marks = text.match(MARK)?.length ?? 0
        const keeping = text.match(keepingWords)?.length ?? 0
        if (!marks || (keeping >= 2 && !tells)) continue
        found.push({ score: (tells ? 3 : 0) + Math.min(marks, 4) - rank / 2 - keeping, text })
      }
    }
  })
  const out: string[] = []
  let length = 0
  for (const { text } of found.sort((a, b) => b.score - a.score)) {
    if (out.includes(text) || (out.length && length + text.length > max)) continue
    out.push(text)
    length += text.length + 1
    if (length > max * 0.8) break
  }
  const look = out.join(' ')
  if (!look) return undefined
  return look.length <= max ? look : `${look.slice(0, look.lastIndexOf(' ', max - 1))}…`
}
