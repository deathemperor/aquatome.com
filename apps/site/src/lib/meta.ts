import { resolveDataCard, type SpeciesEntity } from '@aq/schema'
import { num, range } from './format'

/** "Cá neon vua" → "cá neon vua", to read naturally after "Cách nuôi". */
const lower = (s: string) => s.charAt(0).toLocaleLowerCase('vi') + s.slice(1)

/** Titles match how people search ("cách nuôi cá neon vua"); no brand suffix, Google shows the site name on its own. */
export const speciesTitle = (name: string, sci: string) => `Cách nuôi ${lower(name)} (${sci}): bể, nước, nuôi chung`
export const plantTitle = (name: string, sci: string) => `Cách trồng ${lower(name)} (${sci}): ánh sáng, CO₂, vị trí`
export const glossaryTitle = (name: string) => `${name} là gì?`

/** Description led by the page's own numbers, which is what makes a result worth clicking. */
export function speciesDescription(name: string, sci: string, card: SpeciesEntity['dataCard']): string {
  const v = (f: keyof SpeciesEntity['dataCard']) => resolveDataCard(card[f] ?? [])?.value
  const tank = v('tankCm')
  const diff = v('difficulty')
  const facts = [
    v('tempC') !== undefined && `nhiệt độ ${range(v('tempC')!)}°C`,
    v('ph') !== undefined && `pH ${range(v('ph')!)}`,
    tank !== undefined && `bể từ ${num(typeof tank === 'number' ? tank : tank.min)} cm`,
    diff !== undefined && `độ khó ${num(typeof diff === 'number' ? diff : diff.max)}/8`,
  ].filter(Boolean)
  return `${name} (${sci})${facts.length ? `: ${facts.join(', ')}` : ''}. Cách nuôi, thức ăn, nuôi chung với cá gì, sinh sản.`
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
