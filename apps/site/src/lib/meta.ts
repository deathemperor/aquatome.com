import { resolveDataCard, type SpeciesEntity } from '@aq/schema'
import { fmt } from './format'
import { translator, type Lang } from './i18n'
import { saysSci, sciWords } from './sci'

const TITLE_LENGTH = 70
const DESCRIPTION_LENGTH = 160
const SHORTEST_SENTENCE_EXCERPT = 80
const length = (text: string) => [...text].length
const segmenters = new Map<string, Intl.Segmenter>()
function segments(text: string, lang: Lang, granularity: 'word' | 'sentence' | 'grapheme') {
  const key = `${lang}:${granularity}`
  let segmenter = segmenters.get(key)
  if (!segmenter) {
    segmenter = new Intl.Segmenter(lang, { granularity })
    segmenters.set(key, segmenter)
  }
  return segmenter.segment(text)
}

function clip(text: string, lang: Lang, max: number, granularity: 'word' | 'sentence' | 'grapheme'): string {
  let end = 0
  let count = 0
  for (const part of segments(text, lang, granularity)) {
    const segmentLength = length(part.segment)
    const lastLength = granularity === 'sentence' ? length(part.segment.trimEnd()) : segmentLength
    if (count + lastLength > max) break
    count += segmentLength
    if (granularity !== 'word' || part.isWordLike) end = part.index + part.segment.length
  }
  return text.slice(0, end).trimEnd()
}

export function descriptionForSearch(lang: Lang, text: string, max = DESCRIPTION_LENGTH): string {
  if (length(text) <= max) return text
  const sentences = clip(text, lang, max, 'sentence')
  if (length(sentences) >= SHORTEST_SENTENCE_EXCERPT) return sentences
  return clip(text, lang, max, 'word') || clip(text, lang, max, 'grapheme')
}

/** The name, then its scientific name in brackets, unless the name says it already. */
export const withSci = (name: string, sci: string) => (saysSci(name, sci) ? name : `${name} (${sci})`)

/**
 * "Cá neon vua" → "cá neon vua", to read naturally after "Cách nuôi". A name that starts with its scientific name keeps
 * the genus's capital ("Acrossocheilus iridescens", not "acrossocheilus iridescens").
 */
const lower = (s: string, lang: Lang, sci: string) =>
  saysSci(s, sci) && s.toLocaleLowerCase(lang).startsWith(sci.toLocaleLowerCase(lang)) ? s : s.charAt(0).toLocaleLowerCase(lang) + s.slice(1)

/**
 * Titles match how people search ("cách nuôi cá neon vua"); no brand suffix, Google shows the site name on its own. The
 * scientific name once: a name that says it already isn't followed by it again (1,337 fish and plant titles said it twice,
 * 13 November: "Cách trồng bèo tây Nam Mỹ (Limnobium laevigatum) (Limnobium laevigatum)").
 */
const SCI = '\u0000'
const named = (lang: Lang, key: string, name: string, sci: string) => {
  const template = translator(lang)(key, { name: lower(name, lang, sci), sci: SCI })
  const nameIncluded = saysSci(name, sci)
  const title = nameIncluded ? template.replace(` (${SCI})`, '') : template.replace(SCI, sci)
  if (length(title) <= TITLE_LENGTH) return title

  // The search topic can go first, then the opening phrase. Keep the scientific name for long trade names.
  const core = title.slice(0, title.lastIndexOf(': '))
  if (core && length(core) <= TITLE_LENGTH) return core
  const label = withSci(name, sci)
  if (length(label) <= TITLE_LENGTH) return label
  const withoutSci = nameIncluded ? name.replace(sciWords(sci, 'giu'), ' ') : name
  const common = withoutSci.replace(/[()]/g, ' ').replace(/\s*,\s*/g, ', ').replace(/^,\s*|,\s*$/g, '').replace(/\s+/g, ' ').trim()
  const shortened = clip(common, lang, TITLE_LENGTH - length(sci) - 3, 'word')
  return shortened ? withSci(shortened, sci) : clip(sci, lang, TITLE_LENGTH, 'grapheme')
}
export const speciesTitle = (lang: Lang, name: string, sci: string) => named(lang, 'Cách nuôi {name} ({sci}): bể, nước, nuôi chung', name, sci)
export const plantTitle = (lang: Lang, name: string, sci: string) => named(lang, 'Cách trồng {name} ({sci}): ánh sáng, CO₂, vị trí', name, sci)
export const glossaryTitle = (lang: Lang, name: string) => translator(lang)('{name} là gì?', { name })

/** Description led by the page's own numbers, which is what makes a result worth clicking. */
export function speciesDescription(lang: Lang, name: string, sci: string, card: SpeciesEntity['dataCard'], fish = true): string {
  const t = translator(lang)
  const { num, range } = fmt(lang)
  const v = (f: keyof SpeciesEntity['dataCard']) => resolveDataCard(card[f] ?? [], f)?.value
  const tank = v('tankCm')
  const diff = v('difficulty')
  const facts = [
    v('tempC') !== undefined && t('nhiệt độ {v}°C', { v: range(v('tempC')!) }),
    v('ph') !== undefined && `pH ${range(v('ph')!)}`,
    tank !== undefined && t('bể từ {v} cm', { v: num(typeof tank === 'number' ? tank : tank.min) }),
    diff !== undefined && t('độ khó {v}/8', { v: num(typeof diff === 'number' ? diff : diff.max) }),
  ].filter(Boolean)
  return `${withSci(name, sci)}${facts.length ? `: ${facts.join(', ')}` : ''}. ${t(fish ? 'Cách nuôi, thức ăn, nuôi chung với cá gì, sinh sản.' : 'Cách nuôi, thức ăn, nuôi chung với con gì, sinh sản.')}`
}

const plain = (html: string) => html.replace(/<a class="cite[^"]*"[^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

/** The opening paragraph, the summary, or the first prose block. */
export function guideDescription(html: string, summary: readonly string[] = []): string {
  const body = html.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/g, '')
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(m => plain(m[1]!)).filter(p => p && !p.includes('©'))
  const opening = paras.find(p => p.length >= 60) ?? paras[0]
  if (opening) return opening
  const takeaways = summary.map(plain).filter(Boolean).join(' ')
  if (takeaways) return takeaways
  const prose = body.replace(/<(p|ul|ol|table|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/g, ' ')
  return prose.split(/<\/(?:div|section|article|blockquote)>|<br\s*\/?>/i)
    .map(plain).find(p => p && !p.includes('©')) ?? ''
}
