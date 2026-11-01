import type { GuideListItem } from '../lib/list-data'
import { ct } from './ct'
import { PAGE } from './filter-list'
import { buildGuideCard } from './guide-card'

/**
 * The guide list (pages/vi/huong-dan/index.astro). Its HTML has the first page of guides, a template card, and "Xem thêm",
 * a link to the next numbered page (/vi/huong-dan/trang/2/: crawlers and readers without the script follow it). Every
 * guide, in the list's order, is in the list's data file (`#guide-list` data-src, lib/list-data.ts), fetched the first
 * time the reader picks a subject or wants more (or nears the end): then a subject shows its guides a page at a time, and
 * "Xem thêm" adds the next page in place. Subjects live in the address (?kind=care), so a filtered list can be shared.
 */
export function guideList() {
  const list = document.getElementById('guide-list')!
  const template = document.getElementById('guide-card') as HTMLTemplateElement
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('#guide-kinds button[data-kind]')]
  const more = document.getElementById('guide-more') as HTMLAnchorElement | null
  const start = document.getElementById('guide-start')
  const status = document.getElementById('guide-status')!
  // The cards in the page by slug (the last part of their address, the same in every language): the HTML's, then each built.
  const slugOf = (el: Element) => el.getAttribute('href')!.split('/').at(-2)!
  const els = new Map([...list.querySelectorAll<HTMLElement>(':scope > [data-kind]')].map(el => [slugOf(el), el]))
  let items: GuideListItem[] | undefined
  let loading: Promise<boolean> | undefined
  let kind = ''
  let shown = PAGE
  /** The data file, fetched once; false when it failed (the next subject or "Xem thêm" tries again). */
  const load = () => (loading ??= fetch(list.dataset.src!)
    .then(r => { if (!r.ok) throw new Error(`${list.dataset.src}: ${r.status}`); return r.json() as Promise<GuideListItem[]> })
    .then(data => { items = data; status.textContent = ''; return true })
    .catch((e: unknown) => { console.warn(e); loading = undefined; return false }))
  /** How many guides a subject has: its chip's number ("" is every guide). */
  const total = () => Number(buttons.find(b => b.dataset.kind === kind)?.querySelector('.n')?.textContent ?? list.dataset.total)

  function render() {
    const order = items
      ? items.filter(i => !kind || i.kind === kind)
      : [...els].filter(([, el]) => !kind || el.dataset.kind === kind).map(([slug]) => ({ slug }) as GuideListItem)
    const want = order.slice(0, shown).map(i => els.get(i.slug) ?? els.set(i.slug, buildGuideCard(template, i)).get(i.slug)!)
    const on = new Set(want)
    for (const el of els.values()) el.hidden = !on.has(el)
    // Moved only when what shows isn't already there in order.
    const have = [...list.children].filter(el => el instanceof HTMLElement && el.dataset.kind && !el.hidden)
    if (want.length !== have.length || want.some((el, i) => el !== have[i])) list.append(...want)
    const left = total() - Math.min(shown, total())
    if (more) {
      more.parentElement!.hidden = left <= 0
      more.textContent = ct('Xem thêm {n} bài (còn {left})', { n: Math.min(left, PAGE), left })
    }
    list.removeAttribute('aria-busy')
  }
  const failed = () => { status.textContent = ct('Chưa tải được danh sách. Kiểm tra mạng rồi thử lại.'); render() }

  async function show(k: string) {
    // A subject this list doesn't have (an old link, another language's list): every guide.
    kind = buttons.some(b => b.dataset.kind === k) ? k : ''
    shown = PAGE
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.kind === kind))
    // The beginner row is for the whole list: a reader who picked a subject goes straight to it.
    if (start) start.hidden = kind !== ''
    if (kind && !items && !(await load())) return failed()
    render()
  }
  document.getElementById('guide-kinds')?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-kind]')
    if (!b) return
    history.replaceState(null, '', b.dataset.kind ? `?kind=${b.dataset.kind}` : location.pathname)
    // The chips stay where the reader tapped them while the beginner row above comes and goes.
    // (show() hides or brings back that row before it waits for anything.)
    const chips = b.parentElement!, top = chips.getBoundingClientRect().top
    void show(b.dataset.kind!)
    scrollBy(0, chips.getBoundingClientRect().top - top)
  })
  more?.addEventListener('click', async e => {
    e.preventDefault()
    if (!items && !(await load())) {
      // The whole list's next page is a page of its own; a subject's isn't.
      if (!kind) location.href = more.href
      return failed()
    }
    shown += PAGE
    render()
  })
  // The data file is on its way before it's needed: when the reader nears the chips or the end of the first page.
  document.getElementById('guide-kinds')?.addEventListener('pointerover', () => void load(), { once: true })
  document.getElementById('guide-kinds')?.addEventListener('focusin', () => void load(), { once: true })
  if (more && 'IntersectionObserver' in window) {
    const near = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { near.disconnect(); void load() } }, { rootMargin: '800px 0px' })
    near.observe(more)
  }
  void show(new URLSearchParams(location.search).get('kind') || '')
}
