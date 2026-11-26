import { isVietnamese, languageWord, type Lang, type Video } from '@aq/schema'

/**
 * The language a video is spoken in. One whose own title is Vietnamese is a Vietnamese video, whatever its label: the
 * engine labels a video YouTube gives no language as English, and the Indonesian rainbowfish page showed one titled
 * "Cá cầu vồng, …" (the live checks, 21 Nov 2026). Other languages' pages leave Vietnamese videos out (species-page.ts).
 */
export const spokenIn = (v: Video) => (isVietnamese(v.originalTitle ?? v.title) ? 'vi' : v.lang ?? 'en')

/**
 * What's written under a video besides its length: the language it's spoken in as a word, so nobody expects to hear their
 * own. The site's caption and the app's. A generated video carries no mark here: how those show is the owner's call
 * (the chief of staff, 14 Nov).
 */
export const videoAbout = (v: Video, lang: Lang, t: (s: string) => string) =>
  languageWord(spokenIn(v), lang) ?? t('không lời')
