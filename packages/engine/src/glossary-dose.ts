import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The house form for a medicine's dose (the Writing Lead, with the chief of staff's yes, 20 Nov 2026): a medicine named in
 * an entry carries no amount, and straight after it comes one sentence that says nothing more, "Liều và cách dùng: xem bài
 * <an open guide's title>." or, where no open guide fits, "Liều và cách dùng: theo nhãn thuốc."; a line that sends the
 * reader to treatment without naming a medicine is the pointer, "Cách chữa <the disease>: xem bài <the guide's title>.".
 * No fact says "follow the label", so the fact check stopped Tảo's label line in 3 reads of 3 (20 Nov 2026). These sentences
 * are the site's own form, not a claim from the facts, and the fact check passes them, but only as written whole.
 */

/** A disease guide a glossary entry may name: its title as entries write it, and its address. */
export type DiseaseGuide = { title: string; address: string }

/**
 * The open disease guides: a guide of kind disease whose page search engines may index (`quality.indexable`). A held guide
 * is not one (the chief of staff, 20 Nov 2026: the guide form only while that guide is open). Its title as entries write it
 * is its name before ": " ("Cá bị thối vây, thối đuôi"), the whole name where it has none.
 */
export async function openDiseaseGuides(root: string): Promise<DiseaseGuide[]> {
  const base = join(root, 'content', 'guides')
  const json = (f: string) => readFile(f, 'utf8').then(JSON.parse).catch(() => null)
  const out: DiseaseGuide[] = []
  for (const x of (await readdir(base).catch(() => [] as string[])).sort()) {
    const e = await json(join(base, x, 'entity.json')) as { kind?: string } | null
    if (e?.kind !== 'disease') continue
    const v = await json(join(base, x, 'vi.json')) as { name?: string; slug?: string; quality?: { indexable?: boolean } } | null
    if (!v?.name || !v.slug || v.quality?.indexable !== true) continue
    out.push({ title: v.name.split(': ')[0]!.trim(), address: `/vi/huong-dan/${v.slug}/` })
  }
  return out
}

const LABEL = 'Liều và cách dùng: theo nhãn thuốc.'
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether a sentence is the house form, word for word and whole. The label form is that one sentence. The guide form's title
 * is an open guide's. The pointer's disease is written as that same guide's title writes it, whole words, so neither slot
 * holds words the fact check would not see. A sentence that carries anything more (an amount, a product, a second clause)
 * is none of them, and is checked as any other.
 */
export function houseForm(text: string, guides: DiseaseGuide[]): boolean {
  if (text === LABEL) return true
  const titles = new Set(guides.map(g => g.title))
  const dose = /^Liều và cách dùng: xem bài (.+)\.$/u.exec(text)
  if (dose) return titles.has(dose[1]!)
  const pointer = /^Cách chữa (.+?): xem bài (.+)\.$/u.exec(text)
  if (!pointer || !titles.has(pointer[2]!)) return false
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(pointer[1]!.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(pointer[2]!)
}
