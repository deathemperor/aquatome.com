import type { Lang } from './i18n'

/** A page's comments key: each language has its own discussion ("species:x" on /vi/, "id:species:x" on /id/). */
export const commentsKey = (lang: Lang, entity: string) => (lang === 'vi' ? entity : `${lang}:${entity}`)
