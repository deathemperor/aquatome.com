import { difficultyLevel, fmt } from '../lib/format'
import { langOf } from '../lib/i18n'
import { noCookies } from '../lib/no-cookies'
import { barStyle } from '../lib/range-bar'
import { ct } from './ct'
import type { SpeciesIndexItem } from './filter'

/**
 * A species card made in the browser, as SpeciesCard.astro renders it: a copy of the page's template card (SpeciesGrid's
 * `full`), filled in from the species' link (its address, already in the page's language, and its picture) and its
 * line in the filter index (name, figures). e2e/species-cards.spec.ts checks the two come out the same.
 */
export function buildCard(template: HTMLTemplateElement, link: HTMLAnchorElement, i: SpeciesIndexItem): HTMLElement {
  const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement
  const $ = (s: string) => card.querySelector<HTMLElement>(s)!
  const { range } = fmt(langOf(location.pathname))
  card.dataset.slug = i.slug
  $('a').setAttribute('href', link.getAttribute('href')!)
  const { img, w, h } = link.dataset
  if (img) for (const [k, v] of [['src', img], ['width', w!], ['height', h!], ...noCookies(img) ? [['crossorigin', 'anonymous']] : []]) $('img').setAttribute(k!, v!)
  else $('img').remove()
  $('h3').textContent = i.name
  $('.sci').textContent = i.scientificName

  const [temp, ph, level] = card.querySelectorAll<HTMLElement>('dl > div') as unknown as HTMLElement[]
  const bar = (row: HTMLElement, kind: 'temp' | 'ph', r: { min: number; max: number }, text: string) => {
    row.querySelector('dd')!.textContent = text
    row.querySelector('i')!.setAttribute('style', barStyle(kind, r.min, r.max))
  }
  if (i.tempC) {
    const { min, max } = i.tempC
    // The reader's units, as UnitsToggle showed the page's own figures at load: scripts/units.ts's conversion, written
    // out here, since importing it moves UnitsToggle's script out of every page into a request of its own.
    const nf = new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits: 1 })
    const f = (c: number) => nf.format(Math.round((c * 9 / 5 + 32) * 10) / 10)
    let imperial = false
    try { imperial = localStorage.getItem('units') === 'imperial' } catch { /* storage blocked: the page shows °C */ }
    const text = !imperial ? `${range(i.tempC)}°C` : min === max ? `${f(min)}°F` : `${f(min)}–${f(max)}°F`
    bar(temp!, 'temp', i.tempC, text)
    temp!.querySelector('dd')!.dataset.c = `${min},${max}`
  } else temp!.remove()
  if (i.ph) bar(ph!, 'ph', i.ph, range(i.ph))
  else ph!.remove()
  if (i.difficulty !== undefined) {
    const value = i.difficulty, cls = difficultyLevel(value)
    const word = { easy: ct('Dễ'), mid: ct('Vừa'), hard: ct('Khó') }[cls]
    const d = level!.querySelector<HTMLElement>('.diff')!
    d.className = `diff ${cls}`
    d.setAttribute('aria-label', ct('Độ khó {value}/8: {word}', { value, word: word.toLowerCase() }))
    d.title = ct('Độ khó {value}/8', { value })
    d.textContent = word
  } else level!.remove()
  if (!i.tempC && !i.ph && i.difficulty === undefined) $('dl').remove()
  return card
}
