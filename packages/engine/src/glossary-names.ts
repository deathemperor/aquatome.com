import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sentences } from './glossary-facts'
import { kindWord, type Taxon } from './kind-words'

/** Each genus our species pages hold, with its family and order, from the first of its pages that gives them. */
export async function genera(root: string): Promise<Map<string, Taxon>> {
  const out = new Map<string, Taxon>()
  const base = join(root, 'content', 'species')
  for (const x of (await readdir(base).catch(() => [] as string[])).sort()) {
    const e = await readFile(join(base, x, 'entity.json'), 'utf8').then(JSON.parse).catch(() => null) as { scientificName?: string; genus?: string; family?: string; order?: string } | null
    const genus = e?.genus ?? e?.scientificName?.split(' ')[0]
    if (genus && e?.family && !out.has(genus)) out.set(genus, { genus, family: e.family, ...(e.order ? { order: e.order } : {}) })
  }
  return out
}

export type KindName = { name: string; word: string; family: string }

/** A name as the table reads it: NFC, any case, a hyphen or dash between words read as a space (the Writing Lead, 14 Nov 2026). */
const key = (n: string) => n.normalize('NFC').toLowerCase().replace(/[\s\-–]+/gu, ' ').trim()
/** Up to `n` words straight before the end of a text, each followed by a space, hyphen or dash. */
const wordsBefore = (n: string) => new RegExp(`(?<![\\p{L}\\p{M}])((?:[\\p{L}\\p{M}]+[\\s\\-–]+){${n}})$`, 'u')

/**
 * The kind words an entry writes straight before a scientific name ("tép Caridina", "cá trê Clarias", "Cá Betta"), judged
 * by the Writing Lead's table (`kindWord`). The chief of staff, 14 Nov 2026: a plain kind word before a scientific name
 * passes when the table allows that word for the animal's family; "tép Caridina" passes, "cá trê" on a cichlid stops. A
 * genus none of our pages hold, or a word the table doesn't hold, isn't judged here: the rules check reads it as before.
 */
export function kindNames(e: { definition: string; body: string }, taxa: Map<string, Taxon>): { fit: KindName[]; misfit: KindName[] } {
  const fit: KindName[] = []
  const misfit: KindName[] = []
  const seen = new Set<string>()
  for (const s of sentences(e)) {
    const text = s.text.normalize('NFC')
    for (const m of text.matchAll(/(?<![\p{L}\p{N}])([A-Z][a-z]+)(?![\p{L}\p{N}])/gu)) {
      const t = taxa.get(m[1]!)
      if (!t) continue
      const head = text.slice(0, m.index)
      for (let k = 3; k >= 1; k--) {
        const words = wordsBefore(String(k)).exec(head)?.[1]
        if (!words) continue
        // The name as written ("Cá trê-Aulonocara"), and its words as the table reads them.
        const name = `${words}${m[1]}`
        const p = key(words)
        const r = kindWord(name, t)
        // Only the table's word itself, after "cá" for a fish word: "tép Caridina", not "tép như Caridina" or "cá và Caridina".
        if (!r || (p !== r.word && p !== `cá ${r.word}`)) continue
        if (!seen.has(key(name))) (r.fits ? fit : misfit).push({ name, word: r.word, family: t.family! })
        seen.add(key(name))
        break
      }
    }
  }
  return { fit, misfit }
}

/** The rules check's note for a kind word that doesn't fit its animal: a naming break, so it stops (rule 6). */
export const misfitNote = (k: KindName) => `Rule 6: "${k.name}": "${k.word}" is the word for other animals, not for ${k.family} (the table of kind words).`

/** The name a rules note quotes first, lowercased: Rule 6 asks for the name itself there. */
const firstQuote = (note: string) => { const q = /"([^"]+)"/.exec(note)?.[1]; return q === undefined ? undefined : key(q) }

/**
 * The rules check's notes with the table's judgement in: a naming note (rule 6 alone) on a name the table judged is
 * dropped, and a name that doesn't fit gets the table's note. Notes on other rules, or on rule 6 with another, stand.
 */
export function judgeKindNames(notes: string[], k: { fit: KindName[]; misfit: KindName[] }, ruleNumbers: (note: string) => number[]): string[] {
  const judged = new Set([...k.fit, ...k.misfit].map(x => key(x.name)))
  const kept = notes.filter(n => { const r = ruleNumbers(n); return !(r.length === 1 && r[0] === 6 && judged.has(firstQuote(n) ?? '')) })
  return [...kept, ...k.misfit.map(misfitNote)]
}
