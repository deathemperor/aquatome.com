import type { GuideListItem } from '../lib/list-data'
import { cpath } from './ct'
import { creditPhoto } from './photo-credits'

/**
 * A guide card made in the browser, as GuideCard.astro renders it: a copy of the list's template card (GuideCard
 * `template`), filled in from the guide's item in the list's data file (lib/list-data.ts), its photo credited in the
 * footer; a video's length and label too. e2e/guide-list.spec.ts and guide-pages.spec.ts check the two come out the same.
 */
export function buildGuideCard(template: HTMLTemplateElement, i: GuideListItem): HTMLElement {
  const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement
  const $ = (s: string) => card.querySelector<HTMLElement>(s)!
  card.setAttribute('href', cpath(`/vi/huong-dan/${i.slug}/`))
  card.dataset.kind = i.kind
  if (i.photo) {
    for (const [k, v] of [['src', i.photo.src], ['width', String(i.photo.w)], ['height', String(i.photo.h)]] as const) $('img').setAttribute(k, v)
    creditPhoto(i.photo)
  } else $('img').remove()
  if (i.video) {
    $('.dur').textContent = `▶ ${i.video.dur}`
    if (i.video.cover) $('.cover').textContent = i.video.cover
    else card.querySelector('.cover')?.remove()
  }
  $('.kind').textContent = i.label
  $('h3').textContent = i.name
  $('.src').textContent = i.src
  return card
}
