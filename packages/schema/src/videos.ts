import { LANG, type Lang } from './langs'
import type { Video } from './types'

/** A YouTube language tag's base ("en-US" → "en"). */
export const baseLang = (tag: string) => tag.toLowerCase().split(/[-_]/)[0]!

/** Whether the video is spoken in the page's language. */
export const speaksPageLang = (v: { lang: string }, lang: Lang) => baseLang(v.lang) === lang

/**
 * A page's videos in its reader's language (the owner's report, 2026-11-10): the title translated
 * (content/video-titles/<lang>.json) with the real one kept as `originalTitle`, those spoken in the page's language first,
 * and a generated video marked. A video spoken in the page's language needs no translation and is never left out; another
 * with no translated title yet isn't shown (`requireTitle`). `order: false` keeps the order, where it means something (a
 * product's top review).
 *
 * `on: false`, a language whose titles aren't turned on yet (content/video-titles/on.json; the chief of staff, 15 Nov):
 * only the titles in `kept` (content/video-titles/kept.json, the ones the editors passed) show translated; every other
 * foreign video keeps its own title, marked `ownTitle`, and none is left out for want of one.
 *
 * `refused` (content/video-titles/<lang>.refused.json, YouTube id → why): titles the meaning check refused. Such a video
 * keeps its own title, marked `ownTitle`, even with its language on, and is never left out for it; a kept title wins over
 * a refusal (the chief of staff, 16 Nov).
 *
 * `passed` (content/video-titles/<lang>.passed.json, YouTube id → the words the meaning check passed): given, a stored
 * title shows with its language on only where the check passed those very words. One it never read (a stopped or failed
 * run, a row it left out, a title written since) keeps the video's own title, marked, like a refusal (the reviewers of
 * the check, 16 Nov). The loader always gives it; left out, as before the check, every stored title shows.
 *
 * `shared` (videosOnTwoFish): a video on the pages of more than one fish keeps its own title, marked, whatever the title
 * files say, a kept title included: one title would name one page's fish on the other (the editors, round 10; the
 * reviewers of the check, 16 Nov). The writer gives such a video no title, but a page may take it up after the check ran.
 */
export function videosForPage<V extends Video>(videos: V[], lang: Lang, titles: Record<string, string>, generated: Record<string, string>, o: { order?: boolean; requireTitle?: boolean; on?: boolean; kept?: Record<string, string>; refused?: Record<string, string>; passed?: Record<string, string>; shared?: ReadonlySet<string> } = {}): V[] {
  const on = o.on ?? true
  const out = videos.flatMap(v => {
    const mark = generated[v.youtubeId] ? { generated: true as const } : {}
    if (speaksPageLang(v, lang)) return [{ ...v, ...mark }]
    if (o.shared?.has(v.youtubeId)) return [{ ...v, ...mark, ownTitle: true as const }]
    const stored = titles[v.youtubeId]
    const kept = v.youtubeId in (o.kept ?? {}), unread = !kept && stored !== undefined && o.passed !== undefined && o.passed[v.youtubeId] !== stored
    const refused = !kept && (v.youtubeId in (o.refused ?? {}) || unread)
    const title = (on && !refused) || kept ? stored : undefined
    if (!title) return !on || refused ? [{ ...v, ...mark, ownTitle: true as const }] : o.requireTitle ? [] : [{ ...v, ...mark }]
    return [{ ...v, ...mark, title, originalTitle: v.title }]
  })
  return o.order === false ? out : [...out.filter(v => speaksPageLang(v, lang)), ...out.filter(v => !speaksPageLang(v, lang))]
}

/**
 * Which fish a page is about, for its videos' titles: its scientific name, or the product's page. The writer, the meaning
 * check and the site count a video's fish by it, so the three can't disagree on which video is on two fish's pages.
 */
export const pageFish = (kind: string, id: string, e: { scientificName?: string } | null | undefined) => e?.scientificName ?? `${kind}/${id}`

/** The videos not spoken in `lang` on the pages of more than one fish (pageFish), from each page's fish and videos. */
export function videosOnTwoFish(pages: { fish: string; videos: { youtubeId: string; lang: string }[] }[], lang: Lang): Set<string> {
  const about = new Map<string, Set<string>>()
  for (const p of pages) for (const v of p.videos) if (!speaksPageLang(v, lang)) about.set(v.youtubeId, (about.get(v.youtubeId) ?? new Set()).add(p.fish))
  return new Set([...about].filter(([, fish]) => fish.size > 1).map(([id]) => id))
}

/** How each language writes a language's name in running text: the word in front, where its own name doesn't carry it. */
const LANGUAGE_WORD: Record<Lang, string> = { vi: 'tiếng', id: 'bahasa', th: 'ภาษา', ms: 'bahasa' }

/**
 * A video's spoken language as a word in the page's language ("tiếng Anh"), so nobody expects to hear Vietnamese; none for a
 * tag that names no language (`zxx`, no speech; `und`, unknown).
 */
export function languageWord(tag: string, lang: Lang): string | undefined {
  const base = baseLang(tag)
  if (base === 'zxx' || base === 'und') return undefined
  const name = new Intl.DisplayNames([LANG[lang].locale], { type: 'language', fallback: 'none' }).of(base)
  if (!name) return undefined
  const word = LANGUAGE_WORD[lang]
  const low = name.toLocaleLowerCase(LANG[lang].locale)
  if (low.startsWith(word)) return lang === 'th' ? name : `${word}${name.slice(word.length)}`
  return lang === 'th' ? `${word}${name}` : `${word} ${name}`
}
