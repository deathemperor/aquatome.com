import { resolveDataCard, type SpeciesEntity } from '@aq/schema'
import { fmt } from './format'
import { translator, type Lang } from './i18n'
import { saysSci } from './sci'

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
  const title = translator(lang)(key, { name: lower(name, lang, sci), sci: SCI })
  return saysSci(name, sci) ? title.replace(` (${SCI})`, '') : title.replace(SCI, sci)
}
export const speciesTitle = (lang: Lang, name: string, sci: string) => named(lang, 'Cách nuôi {name} ({sci}): bể, nước, nuôi chung', name, sci)
export const plantTitle = (lang: Lang, name: string, sci: string) => named(lang, 'Cách trồng {name} ({sci}): ánh sáng, CO₂, vị trí', name, sci)
export const glossaryTitle = (lang: Lang, name: string) => translator(lang)('{name} là gì?', { name })

/** Description led by the page's own numbers, which is what makes a result worth clicking. */
export function speciesDescription(lang: Lang, name: string, sci: string, card: SpeciesEntity['dataCard']): string {
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
  return `${withSci(name, sci)}${facts.length ? `: ${facts.join(', ')}` : ''}. ${t('Cách nuôi, thức ăn, nuôi chung với cá gì, sinh sản.')}`
}

const plain = (html: string) => html.replace(/<a class="cite[^"]*"[^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

/** The first real paragraph (skipping photo captions and credits), cut at a word boundary. */
export function excerpt(html: string, max = 155): string {
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => plain(m[1]!))
  const text = paras.find(p => p.length >= 60 && !p.includes('©')) ?? plain(html)
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}
