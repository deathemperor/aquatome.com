import { resolve } from 'node:path'
import { loadAll, type Content } from '@aq/schema'
import { dropHidden, readHidden } from './hidden'
import { withVietnameseHeads } from './mentions'
import type { Lang } from './i18n'

const cache = new Map<Lang, Promise<Content>>()

/** Everything with a page in this language (an entity without <lang>.json has none, nor one the reader-fit gate holds back). */
export function getContent(lang: Lang): Promise<Content> {
  let c = cache.get(lang)
  if (!c) {
    c = loadAll({
      root: process.env.CONTENT_ROOT ?? resolve(process.cwd(), '../../content'),
      lang,
      publicBuild: process.env.PUBLIC_BUILD === '1',
      leaveOutHeld: true,
      // The real content (no CONTENT_ROOT) is built public only with the watermark screen's record beside it.
      ...(process.env.CONTENT_ROOT ? {} : { photoScreen: 'required' as const }),
    }).then(c => dropHidden(c, readHidden(), lang))
    // A guide's head is the page its Vietnamese title names, in every language (mentions.ts guideImages).
    if (lang !== 'vi') c = Promise.all([c, getContent('vi')]).then(([c, vi]) => withVietnameseHeads(c, vi))
    cache.set(lang, c)
  }
  return c
}
