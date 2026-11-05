/**
 * An Unsplash photo's credit, as Unsplash's API guidelines ask wherever one is shown: "Ảnh: <name> trên Unsplash", the
 * name linking the photographer's page (`authorUrl`; the photo's own page until the engine has it) and "Unsplash" its
 * home, both with AquaTome's UTM (help.unsplash.com/en/articles/2511315-guideline-attribution). No imports: the pages'
 * scripts build it too (scripts/photo-credits.ts, the gallery's viewer).
 */
export const UNSPLASH_LICENCE = 'Unsplash License'
export const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=aquatome&utm_medium=referral'
export const isUnsplash = (licence: string) => licence === UNSPLASH_LICENCE

/** A piece of the line: its text, and where it links (the name, "Unsplash"). */
export type CreditPart = { text: string; href?: string; cls?: 'author' | 'site' }

/**
 * The line's pieces in order, from its template in the page's language ("Ảnh: {author} trên {site}", from t() or ct()
 * with no values). The name links the photographer's page (`authorUrl`, marked `author`), else the photo's own page
 * (`photo`), else nothing; `cls` marks the links that aren't a photo's own page, so a credits list tells them apart.
 */
export function unsplashParts(template: string, author: string, links: { authorUrl?: string; photo?: string }): CreditPart[] {
  const name: CreditPart = links.authorUrl ? { text: author, href: links.authorUrl, cls: 'author' } : links.photo ? { text: author, href: links.photo } : { text: author }
  return template.split(/(\{author\}|\{site\})/).filter(Boolean).map(s => (s === '{author}' ? name : s === '{site}' ? { text: 'Unsplash', href: UNSPLASH_HOME, cls: 'site' } : { text: s }))
}
