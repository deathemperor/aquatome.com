import { resolveDataCard, type SpeciesEntity } from '@aq/schema'
import { fmt } from './format'
import { translator, type Lang } from './i18n'

/** "Cá neon vua" → "cá neon vua", to read naturally after "Cách nuôi". */
const lower = (s: string, lang: Lang) => s.charAt(0).toLocaleLowerCase(lang) + s.slice(1)

/** Titles match how people search ("cách nuôi cá neon vua"); no brand suffix, Google shows the site name on its own. */
export const speciesTitle = (lang: Lang, name: string, sci: string) => translator(lang)('Cách nuôi {name} ({sci}): bể, nước, nuôi chung', { name: lower(name, lang), sci })
export const plantTitle = (lang: Lang, name: string, sci: string) => translator(lang)('Cách trồng {name} ({sci}): ánh sáng, CO₂, vị trí', { name: lower(name, lang), sci })
export const glossaryTitle = (lang: Lang, name: string) => translator(lang)('{name} là gì?', { name })

/** Description led by the page's own numbers, which is what makes a result worth clicking. */
export function speciesDescription(lang: Lang, name: string, sci: string, card: SpeciesEntity['dataCard']): string {
  const t = translator(lang)
  const { num, range } = fmt(lang)
  const v = (f: keyof SpeciesEntity['dataCard']) => resolveDataCard(card[f] ?? [])?.value
  const tank = v('tankCm')
  const diff = v('difficulty')
  const facts = [
    v('tempC') !== undefined && t('nhiệt độ {v}°C', { v: range(v('tempC')!) }),
    v('ph') !== undefined && `pH ${range(v('ph')!)}`,
    tank !== undefined && t('bể từ {v} cm', { v: num(typeof tank === 'number' ? tank : tank.min) }),
    diff !== undefined && t('độ khó {v}/8', { v: num(typeof diff === 'number' ? diff : diff.max) }),
  ].filter(Boolean)
  return `${name} (${sci})${facts.length ? `: ${facts.join(', ')}` : ''}. ${t('Cách nuôi, thức ăn, nuôi chung với cá gì, sinh sản.')}`
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

/** The first real paragraph (skipping photo captions and credits), cut at a word boundary. */
export function excerpt(html: string, max = 155): string {
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => plain(m[1]!))
  const text = paras.find(p => p.length >= 60 && !p.includes('©')) ?? plain(html)
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}
