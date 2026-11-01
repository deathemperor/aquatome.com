import type { PlantListItem } from '../lib/list-data'
import { cpath } from './ct'
import { creditPhoto } from './photo-credits'

/**
 * A plant card made in the browser, as PlantCard.astro renders it: a copy of the page's template card (PlantCard
 * `template`, with both a picture and the no-photo leaf), filled in from the plant's item in the list's data file
 * (lib/list-data.ts), and its photo credited in the footer. e2e/list-cards.spec.ts checks the two come out the same.
 */
export function buildPlantCard(template: HTMLTemplateElement, i: PlantListItem): HTMLElement {
  const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement
  const $ = (s: string) => card.querySelector<HTMLElement>(s)!
  card.dataset.slug = i.slug
  $('a').setAttribute('href', cpath(`/vi/cay/${i.slug}/`))
  if (i.photo) {
    for (const [k, v] of [['src', i.photo.src], ['width', String(i.photo.w)], ['height', String(i.photo.h)]] as const) $('img').setAttribute(k, v)
    $('.ph').remove()
    creditPhoto(i.photo)
  } else $('img').remove()
  $('h3').textContent = i.name
  $('.sci').textContent = i.scientificName
  $('.meta').textContent = i.meta
  return card
}
