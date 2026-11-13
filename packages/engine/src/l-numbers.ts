/**
 * A pleco's L number in its name. The owner, 2026-11-11, on the zebra pleco's page: "Pleco must always include L number
 * on name". A Loricariidae page with an L or LDA number on record (entity.json `lNumber`) shows it after its name, in every
 * language: "Cá zebra pleco L46". The chief of staff's calls the same day: written the way keepers say it, no space and
 * no leading zero ("L46", "LDA8", a form's letter kept: "L201a"); a fish with several numbers shows the first on record,
 * the one keepers use most, and the rest stay in its other names; a name that is only its number ("Cá L134") stays. Code,
 * not a model: the sweep writes it (sweep.ts), the content rule `l-number` lists a page without it, and the record is
 * written clean (merge.ts). Corydoras C and CW numbers and Apistogramma A numbers share the field and aren't touched.
 */

export const L_FAMILY = 'Loricariidae'
/** An L or LDA number as anyone writes it: "L46", "L 46", "L046", "L-046", "LDA 008", "L201a". */
const TOKEN = /(?<![\p{L}\p{N}])(LDA|L)[\s-]?0*(\d{1,3})([a-dA-DxX])?(?![\p{L}\p{N}])/gu
/** A form's letter is written small, as "L201a": "L056X" and "L56x" are one number. */
const clean = (_m: string, prefix: string, n: string, form?: string) => `${prefix}${Number(n)}${form?.toLowerCase() ?? ''}`

/** A record as keepers write it: each L and LDA number clean, the others (C, CW, A, P) as they are, one ", " between. */
export function cleanLRecord(record: string): string {
  return record.split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean).map(x => x.replace(TOKEN, clean)).join(', ')
}

/** The L and LDA numbers on a record, clean, in its order. */
export function lNumbersOf(record?: string): string[] {
  return [...(record ?? '').matchAll(TOKEN)].map(m => clean(m[0], m[1]!, m[2]!, m[3]))
}

/**
 * A fish's name with its L number: a pleco's (`family` Loricariidae) with a number on record. Each number the name
 * already gives is written clean ("Cá pleco L091" → "Cá pleco L91", "(L183)" → "L183"); a name that gives one of the
 * fish's own numbers keeps it, and one that gives none has the first on record after it. Any other name is as it was.
 */
export function withLNumber(name: string, family: string | undefined, record: string | undefined): string {
  const own = family === L_FAMILY ? lNumbersOf(record) : []
  if (!own.length) return name
  const tidy = name.replace(/\(\s*((?:LDA|L)[\s-]?\d{1,3}[a-dA-DxX]?)\s*\)/gu, '$1').replace(TOKEN, clean).replace(/\s{2,}/g, ' ').trim()
  const given = lNumbersOf(tidy)
  return own.some(n => given.includes(n)) ? tidy : `${tidy} ${own[0]}`
}

/** Whether a pleco's name gives one of its own L numbers: what the content rule `l-number` holds every page to. */
export const showsLNumber = (name: string, family: string | undefined, record: string | undefined) => {
  const own = family === L_FAMILY ? lNumbersOf(record) : []
  return !own.length || own.some(n => lNumbersOf(name).includes(n))
}
