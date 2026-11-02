import type { Lang } from './i18n'

// The keys of a page's readers' sections (`data-entity`), which the app's copy of the page carries too (PageDoc.talk):
// one rule, used by both.

/** A page's comments key: each language has its own discussion ("species:x" on /vi/, "id:species:x" on /id/). */
export const commentsKey = (lang: Lang, entity: string) => (lang === 'vi' ? entity : `${lang}:${entity}`)

/** A page's readers' photos key: every language shares them ("species:x"). */
export const photosKey = (entity: string) => entity
