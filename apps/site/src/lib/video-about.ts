import { languageWord, type Lang, type Video } from '@aq/schema'

/**
 * What's written under a video besides its length: the language it's spoken in as a word, so nobody expects to hear their
 * own, and that it was generated (the owner's standing rule). The site's caption and the app's.
 */
export const videoAbout = (v: Video, lang: Lang, t: (s: string) => string) =>
  [languageWord(v.lang ?? 'en', lang) ?? t('không lời'), v.generated && t('do AI tạo')].filter(Boolean).join(', ')
