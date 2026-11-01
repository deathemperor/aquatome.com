import { ct } from './ct'
import { PAGE } from './filter-list'

/**
 * A list shown a page at a time, with no filter (a fish group's species, the discovery notes: components/MoreList).
 * Its HTML has the first page of cards and a template card in their grid; every item, in the list's order, is in its
 * data file (`data-src`), fetched the first time the reader wants more (or nears the end). "Xem thêm" then adds the next
 * page in place. On a list with numbered pages "Xem thêm" is a link to the next one, followed when the fetch fails (and by
 * crawlers and readers without the script); elsewhere it is a button, and the failure is said above it.
 * The data file leads: a card the HTML has and the data doesn't (a page from before the last deploy) is hidden.
 */
export function listMore<T extends { slug: string }>(list: HTMLElement, build: (template: HTMLTemplateElement, item: T) => HTMLElement, words: (n: number, left: number) => string) {
  const template = list.querySelector('template')!
  const grid = template.parentElement!
  const more = list.querySelector<HTMLAnchorElement | HTMLButtonElement>('[data-more]')!
  const status = list.querySelector('[data-status]')!
  const src = list.dataset.src!
  // A card's item: a species card's data-slug, a guide card's address (its last part, the same in every language).
  const slugOf = (el: Element) => (el instanceof HTMLElement ? el.dataset.slug || el.getAttribute('href')?.split('/').at(-2) : undefined)
  const els = new Map([...grid.children].flatMap(el => { const slug = slugOf(el); return slug ? [[slug, el as HTMLElement] as const] : [] }))
  let items: T[] | undefined
  let loading: Promise<boolean> | undefined
  let shown = PAGE
  /** The data file, fetched once; false when it failed (the next "Xem thêm" tries again). */
  const load = () => (loading ??= fetch(src)
    .then(r => { if (!r.ok) throw new Error(`${src}: ${r.status}`); return r.json() as Promise<T[]> })
    .then(data => { items = data; status.textContent = ''; return true })
    .catch((e: unknown) => { console.warn(e); loading = undefined; return false }))

  function render(all: T[]) {
    const want = all.slice(0, shown).map(i => els.get(i.slug) ?? els.set(i.slug, build(template, i)).get(i.slug)!)
    const on = new Set(want)
    for (const el of els.values()) el.hidden = !on.has(el)
    // Moved only when what shows isn't already there in order.
    const have = [...grid.children].filter(el => slugOf(el) && !(el as HTMLElement).hidden)
    if (want.length !== have.length || want.some((el, i) => el !== have[i])) grid.append(...want)
    const left = all.length - Math.min(shown, all.length)
    more.parentElement!.hidden = left <= 0
    more.textContent = words(Math.min(left, PAGE), left)
    // The next numbered page, past what now shows.
    if (more instanceof HTMLAnchorElement) more.setAttribute('href', more.getAttribute('href')!.replace(/\d+\/$/, `${Math.floor(shown / PAGE) + 1}/`))
  }
  more.addEventListener('click', async e => {
    e.preventDefault()
    if (!items && !(await load())) {
      if (more instanceof HTMLAnchorElement) location.href = more.href
      else status.textContent = ct('Chưa tải được danh sách. Kiểm tra mạng rồi thử lại.')
      return
    }
    shown += PAGE
    render(items!)
  })
  // The data file is on its way before it's needed: when the reader nears the end of the first page.
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { near.disconnect(); void load() } }, { rootMargin: '800px 0px' })
    near.observe(more)
  }
}
