import { toneKey } from './text'

/**
 * A glossary term's name, other name or link phrase that the site's linker doesn't link until the chief of staff rules on
 * it (the chief of staff, 21 Nov 2026). The standing check on link phrases (packages/engine/src/glossary-link-check.ts)
 * flags where a phrase may mean something else; a phrase is put here by hand on the chief's word, never by the check, and
 * no name is deleted from the term: it stays in the term's files and is only not linked. Taken off the list, it links again.
 */
export type HeldPhrase = { term: string; phrase: string; since: string; why: string }
export const GLOSSARY_HELD: HeldPhrase[] = []

/** Whether a term's phrase is held, in either tone placing or case. */
export const heldPhrase = (term: string, phrase: string, held: HeldPhrase[] = GLOSSARY_HELD) =>
  held.some(h => h.term === term && toneKey(h.phrase) === toneKey(phrase))
