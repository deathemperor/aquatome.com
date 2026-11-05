import type { CardPhoto } from '../lib/list-data'
import { isUnsplash, unsplashParts } from '../lib/unsplash'
import { ct } from './ct'

/**
 * The credit for a photo the page's script shows after it loads (a list's card built past its first page): it joins the
 * footer's "Nguồn ảnh" list (components/Footer.astro, `later`) as the server writes it, one row per author and licence
 * (and an Unsplash photographer's page), and the button's count goes up. A photo already credited (its page on the
 * source already listed) adds nothing. A photo's own page is every link of a row but an Unsplash row's photographer and
 * Unsplash (a.author, a.site).
 */
const PHOTO = 'a:not(.author, .site)'
export function creditPhoto(p: CardPhoto) {
  const ul = document.querySelector('#photo-credits ul')
  const button = document.querySelector<HTMLButtonElement>('button.credits-btn[popovertarget="photo-credits"]')
  if (!ul || !button || [...ul.querySelectorAll(PHOTO)].some(a => a.getAttribute('href') === p.url)) return
  const row = [...ul.querySelectorAll<HTMLLIElement>('li')].find(li => li.dataset.author === p.author && li.dataset.licence === p.licence && li.dataset.authorUrl === p.authorUrl)
    ?? ul.appendChild(document.createElement('li'))
  const urls = [...row.querySelectorAll(PHOTO)].map(a => a.getAttribute('href')!).concat(p.url)
  row.dataset.author = p.author
  row.dataset.licence = p.licence
  if (p.authorUrl) row.dataset.authorUrl = p.authorUrl
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string, attrs: Record<string, string> = {}) => {
    const e = document.createElement(tag)
    e.textContent = text
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    return e
  }
  // As lib/i18n licenceLabel: the permission note is stored in Vietnamese; licence names (CC BY…) stay as they are.
  const licence = p.licence === 'dùng với sự cho phép' ? ct('dùng với sự cho phép') : p.licence
  // As the footer: an Unsplash row is its line, its photos numbers once the name links the photographer's page.
  const unsplash = isUnsplash(p.licence)
  const nums = urls.length > 1 || (unsplash && !!p.authorUrl)
  const who = unsplash
    ? unsplashParts(ct('Ảnh: {author} trên {site}'), p.author, { ...(p.authorUrl ? { authorUrl: p.authorUrl } : {}), ...(nums ? {} : { photo: p.url }) })
      .map(x => (x.href ? el('a', x.text, { ...(x.cls ? { class: x.cls } : {}), href: x.href, rel: 'noopener' }) : x.text))
    : [urls.length === 1 ? el('a', p.author, { href: p.url, rel: 'noopener' }) : el('strong', p.author)]
  row.replaceChildren(
    ...who,
    el('span', ` · ${licence}${nums ? ` · ${ct('{n} ảnh', { n: urls.length })}` : ''}`, { class: 'lic' }),
  )
  if (nums) {
    const numbers = row.appendChild(el('span', '', { class: 'nums' }))
    urls.forEach((u, i) => numbers.append(el('a', String(i + 1), { href: u, rel: 'noopener', 'aria-label': ct('{author}, ảnh {n}', { author: p.author, n: i + 1 }) })))
  }
  button.textContent = ct('Nguồn ảnh ({n})', { n: ul.querySelectorAll(PHOTO).length })
  button.closest<HTMLElement>('span[hidden]')?.removeAttribute('hidden')
}
