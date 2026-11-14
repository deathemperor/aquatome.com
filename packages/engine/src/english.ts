import { render } from './reader'
import type { English } from './round'

/** The kinds whose pages keep their English beside them (entity.json `sections`). */
export const WITH_ENGLISH: readonly string[] = ['species', 'plants']

/**
 * A fish or plant page's English, as the reader-fit check reads it (pages.ts `en`, fit.ts givenBySource): each part's
 * own, rendered, and all the sources' for a line with none of its own. AquaTome's parts aren't English it was written from.
 */
export function englishOf(sections: readonly { key: string; source: string; html: string }[]): English {
  const en = Object.fromEntries(sections.map(x => [`${x.key}:${x.source}`, x.html]))
  const own = Object.entries(en).filter(([k]) => !k.endsWith(':aquatome'))
  return { sections: Object.fromEntries(own.map(([k, v]) => [k, render(v)])), all: render(own.map(([, v]) => v).join('\n')) }
}
