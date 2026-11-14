import type { Verdicts } from './curation'
import type { PhotoVerdict } from './photo-check'
import { passesHead } from './photo-named'

/** What the photo check said of a photo's age on a page it passed it for: true young, false grown, undefined not asked. */
export const ageOf = (v: PhotoVerdict | undefined): boolean | undefined => (v?.ok === 'yes' && !v.guide && typeof v.young === 'boolean' ? v.young : undefined)

/**
 * Whether a page's own photo may lead it in place of a young one: the check passed it as this page's subject and calls it
 * grown, and nothing else bars it as a head (a person, a logo, a face, a mark, a caption that calls the fish unwell, too
 * small), whether or not the check called it typical. The young head it replaces isn't typical either: "typical" means
 * the adult look (photo-check.ts).
 */
export const grownHead = (v: Verdicts) => (p: { url: string; caption?: string; generated?: unknown }, page: string): boolean => {
  const own = v.subjects[p.url]?.[page]
  return ageOf(own) === false && passesHead({ ...v, subjects: { [p.url]: { [page]: { ...own!, typical: true } } } })(p, page)
}

/**
 * Among a page's own photos, one the photo check calls young doesn't lead while another there may lead in its place
 * (`grownHead`, named no worse) (the chief of staff, 15 Nov, after the Deocata pipefish page led with its young among
 * snails). The first such takes the lead; the rest keep their order. The photo check, the lead step and the sweep each
 * leave a page whose head a person picked as it is, so a pick of a young photo stands.
 */
export function grownFirst<P extends { url: string; generated?: unknown }>(photos: P[], young: (p: P) => boolean, grown: (p: P) => boolean): P[] {
  const i = photos.findIndex(p => !p.generated)
  if (i < 0 || !young(photos[i]!)) return photos
  const j = photos.findIndex((p, k) => k > i && !p.generated && grown(p))
  if (j < 0) return photos
  const out = [...photos]
  out.splice(i, 0, ...out.splice(j, 1))
  return out
}

/**
 * A page's head the check passed but not as typical, from before it asked whether the fish is young; and, on a page whose
 * head is that or young, each other photo of its own the check passed with no answer on age yet. Each is asked again
 * once, so the rule above can act (about 34 heads on 15 Nov).
 */
export const youngUnasked = (v: PhotoVerdict | undefined) => v?.ok === 'yes' && v.typical === false && !v.guide && v.young === undefined
export const headAsksAge = (v: PhotoVerdict | undefined) => youngUnasked(v) || ageOf(v) === true
export const ageUnasked = (v: PhotoVerdict | undefined) => v?.ok === 'yes' && !v.guide && v.young === undefined
