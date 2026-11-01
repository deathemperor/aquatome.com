import type { CardPhoto } from '../lib/list-data'
import { ct } from './ct'

/**
 * The credit for a photo the page's script shows after it loads (a list's card built past its first page): it joins the
 * footer's "Nguồn ảnh" list (components/Footer.astro, `later`) as the server writes it, one row per author and licence,
 * and the button's count goes up. A photo already credited (its page on the source already listed) adds nothing.
 */
export function creditPhoto(p: CardPhoto) {
  const ul = document.querySelector('#photo-credits ul')
  const button = document.querySelector<HTMLButtonElement>('button.credits-btn[popovertarget="photo-credits"]')
  if (!ul || !button || [...ul.querySelectorAll('a')].some(a => a.getAttribute('href') === p.url)) return
  const row = [...ul.querySelectorAll<HTMLLIElement>('li')].find(li => li.dataset.author === p.author && li.dataset.licence === p.licence)
    ?? ul.appendChild(document.createElement('li'))
  const urls = [...row.querySelectorAll('a')].map(a => a.getAttribute('href')!).concat(p.url)
  row.dataset.author = p.author
  row.dataset.licence = p.licence
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string, attrs: Record<string, string> = {}) => {
    const e = document.createElement(tag)
    e.textContent = text
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    return e
  }
  // As lib/i18n licenceLabel: the permission note is stored in Vietnamese; licence names (CC BY…) stay as they are.
  const licence = p.licence === 'dùng với sự cho phép' ? ct('dùng với sự cho phép') : p.licence
  row.replaceChildren(
    urls.length === 1 ? el('a', p.author, { href: p.url, rel: 'noopener' }) : el('strong', p.author),
    el('span', ` · ${licence}${urls.length > 1 ? ` · ${ct('{n} ảnh', { n: urls.length })}` : ''}`, { class: 'lic' }),
  )
  if (urls.length > 1) {
    const nums = row.appendChild(el('span', '', { class: 'nums' }))
    urls.forEach((u, i) => nums.append(el('a', String(i + 1), { href: u, rel: 'noopener', 'aria-label': ct('{author}, ảnh {n}', { author: p.author, n: i + 1 }) })))
  }
  button.textContent = ct('Nguồn ảnh ({n})', { n: ul.querySelectorAll('a').length })
  button.closest<HTMLElement>('span[hidden]')?.removeAttribute('hidden')
}
