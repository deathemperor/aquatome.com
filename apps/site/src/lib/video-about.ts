import { languageWord, type Lang, type Video } from '@aq/schema'

/**
 * What's written under a video besides its length: the language it's spoken in as a word, so nobody expects to hear their
 * own. The site's caption and the app's. A generated video carries no mark here: how those show is the owner's call
 * (the chief of staff, 14 Nov).
 */
export const videoAbout = (v: Video, lang: Lang, t: (s: string) => string) =>
  languageWord(v.lang ?? 'en', lang) ?? t('không lời')
