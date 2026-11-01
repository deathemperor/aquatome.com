import { ct } from './ct'

/** Cards a list shows at a time; its HTML has the first page of them. */
export const PAGE = 24

/**
 * A list page's filter, the same on the fish and plant lists (components FilterBox and FilterResults, ids `<prefix>-…`):
 * the filters live in the address, one chip each (× drops one, "Xóa lọc" all); the sure matches come first, and the cards
 * missing a figure the filter asks about wait in a closed group after them. Readers see each list a page of 24 at a time.
 *
 * The HTML has only the first page's cards, and a template card (`<prefix>-card`) in their grid. Every item, in the
 * list's order, is in the list's data file (FilterResults `src`, lib/list-data.ts), fetched the first time the reader
 * filters or goes past the first page (or nears its end); `build` makes the card for an item the HTML doesn't have.
 * The data file leads: a card the HTML has and the data doesn't (a page from before the last deploy) stays hidden.
 *
 * `match`: the slugs that surely fit the address's filters, and those nothing known rules out but missing a figure.
 * `onRun`: anything else the page updates after each filter.
 */
export function filterList<T extends { slug: string }>(prefix: string, { match, build, onRun }: {
  match: (items: T[], p: URLSearchParams) => { sure: string[]; unsure: string[] }
  build: (template: HTMLTemplateElement, item: T) => HTMLElement
  onRun?: (p: URLSearchParams) => void
}) {
  const $ = (id: string) => document.getElementById(`${prefix}-${id}`)!
  const form = $('filter') as HTMLFormElement
  const count = $('count')
  const chips = $('chips')
  const unsure = $('unsure') as HTMLDetailsElement
  const { total, src } = $('result').dataset
  const template = document.getElementById(`${prefix}-card`) as HTMLTemplateElement | null
  const grid = template?.parentElement ?? document.createElement('div')
  // The cards in the page by slug: the HTML's first page, then each card built as it first shows.
  const els = new Map([...grid.children].flatMap(el => (el instanceof HTMLElement && el.dataset.slug ? [[el.dataset.slug, el] as const] : [])))
  // Every item in reading order: until the data file is in, the HTML's cards.
  let items: T[] | undefined
  let bySlug = new Map<string, T>()
  let order = [...els.keys()]
  let loading: Promise<boolean> | undefined
  /** The data file, fetched once; false when it failed (the next filter or "Xem thêm" tries again). */
  const load = () => (loading ??= fetch(src!)
    .then(r => { if (!r.ok) throw new Error(`${src}: ${r.status}`); return r.json() as Promise<T[]> })
    .then(data => { items = data; bySlug = new Map(data.map(i => [i.slug, i])); order = data.map(i => i.slug); return true })
    .catch((e: unknown) => { console.warn(e); loading = undefined; return false }))
  const failed = () => {
    count.textContent = ct('Chưa tải được danh sách. Kiểm tra mạng rồi thử lại.')
    grid.removeAttribute('aria-busy')
  }

  // The unsure group's grid: a bare copy of the list's, so it carries the same (scoped) grid styles.
  const unsureGrid = grid.cloneNode(false) as HTMLElement
  unsureGrid.removeAttribute('aria-busy')
  unsure.querySelector('.more')!.before(unsureGrid)
  // `keep`: the slugs in this list, or every item (no filter).
  const lists: { grid: HTMLElement; more: HTMLButtonElement; keep: Set<string> | 'all'; shown: number }[] = [
    { grid, more: $('more') as HTMLButtonElement, keep: 'all', shown: PAGE },
    { grid: unsureGrid, more: $('unsure-more') as HTMLButtonElement, keep: new Set(), shown: PAGE },
  ]
  const size = (l: (typeof lists)[number]) => (l.keep !== 'all' ? l.keep.size : items ? items.length : Number(total))
  const listOf = (slug: string) => lists.findIndex(l => l.keep === 'all' || l.keep.has(slug))
  function render() {
    const n = lists.map(() => 0)
    const shown = lists.map((): HTMLElement[] => [])
    const listed = new Set(order)
    for (const slug of order) {
      const k = listOf(slug)
      const show = k >= 0 && n[k]! < lists[k]!.shown
      if (show) n[k]!++
      let el = els.get(slug)
      if (!el && show) els.set(slug, (el = build(template!, bySlug.get(slug)!)))
      if (!el) continue
      el.hidden = !show
      if (show) shown[k]!.push(el)
    }
    for (const [slug, el] of els) if (!listed.has(slug)) el.hidden = true
    lists.forEach((l, k) => {
      // Moved only when what shows isn't already there in order: moving every card costs a phone on every filter.
      const want = shown[k]!, have = [...l.grid.children].filter(el => el instanceof HTMLElement && el.dataset.slug && !el.hidden)
      if (want.length !== have.length || want.some((el, i) => el !== have[i])) l.grid.append(...want)
      const left = size(l) - Math.min(l.shown, size(l))
      l.more.hidden = left <= 0
      l.more.textContent = ct('Xem thêm {n} loài (còn {left})', { n: Math.min(left, PAGE), left })
    })
  }
  /** The filters set, in the form's words: "Nhiệt độ: 26 °C" (its label, with the unit in brackets moved after the value). */
  function active(params: URLSearchParams) {
    return [...params].flatMap(([k, v]) => {
      const el = form.elements.namedItem(k)
      if (!v || !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return []
      const label = el.closest('label')!.firstChild!.textContent!.trim() // a select's label also holds every option's text
      const value = el instanceof HTMLSelectElement && el.value === v ? el.selectedOptions[0]!.text
        : el.type === 'number' ? Number(v).toLocaleString(document.documentElement.lang) : v
      const unit = /^(.+?)\s*\(([^)]+)\)$/.exec(label)
      return [{ k, text: unit ? `${unit[1]}: ${value} ${unit[2]}` : `${label}: ${value}` }]
    })
  }
  function showChips(on: { k: string; text: string }[]) {
    chips.replaceChildren(...on.map(({ k, text }) => {
      const li = document.createElement('li')
      const b = li.appendChild(document.createElement('button'))
      b.type = 'button'
      b.dataset.k = k
      b.setAttribute('aria-label', ct('Bỏ {name}', { name: text }))
      b.innerHTML = '<span class="pill"><span></span><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></span>'
      b.querySelector('.pill span')!.textContent = text
      return li
    }))
    $('active').hidden = on.length === 0
  }
  async function run(params: URLSearchParams) {
    for (const [k, v] of params) { const el = form.elements.namedItem(k); if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = v }
    const on = active(params)
    // A filter needs every item. Once they're in, a filter runs at once (a chip's × moves focus to the chips it leaves).
    if (on.length && !items) {
      count.textContent = ct('Đang lọc…')
      if (!(await load())) return failed()
    }
    // Sure matches first; cards missing a figure the filter asks about wait in the closed group below.
    const m = on.length ? match(items!, params) : undefined
    lists[0]!.keep = m ? new Set(m.sure) : 'all'
    lists[1]!.keep = new Set(m?.unsure)
    onRun?.(params)
    showChips(on)
    const [sure, maybe] = lists.map(size) as [number, number]
    count.textContent = !on.length ? ''
      : sure + maybe === 0 ? ct('Không có loài nào khớp. Thử nới điều kiện lọc.')
      : maybe ? ct('{n} loài phù hợp · {m} loài chưa đủ dữ liệu để chắc', { n: sure, m: maybe })
      : ct('{n} loài phù hợp', { n: sure })
    unsure.hidden = maybe === 0
    // With no sure match the group opens: the reader gets the possible ones rather than an empty list.
    unsure.open = sure === 0
    $('unsure-n').textContent = ct('Chưa đủ dữ liệu để chắc ({n})', { n: maybe })
    for (const l of lists) l.shown = PAGE
    render()
    grid.removeAttribute('aria-busy')
  }
  function apply() {
    const p = new URLSearchParams([...new FormData(form)].filter(([, v]) => v !== '') as [string, string][])
    history.replaceState(null, '', `${p}` ? `?${p}` : location.pathname) // not p.size: Safari before 17 has none
    void run(p)
  }
  lists.forEach(l => l.more.addEventListener('click', async () => {
    if (!items && !(await load())) return failed()
    l.shown += PAGE
    render()
  }))
  form.addEventListener('submit', e => { e.preventDefault(); apply() })
  // The data file is on its way before it's needed: when the reader starts on the filter, or nears the first page's end.
  form.addEventListener('focusin', () => void load(), { once: true })
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { near.disconnect(); void load() } }, { rootMargin: '800px 0px' })
    near.observe(lists[0]!.more)
  }
  // With no filter left, focus goes back to the filter: its button, or on a phone with the box closed, the box's toggle.
  const box = form.closest('details')!
  const toFilter = () => (box.open ? form.querySelector<HTMLElement>('button[type=submit]')! : box.querySelector('summary')!).focus()
  // A chip's × clears its field, and focus moves to the chip that takes its place.
  chips.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-k]')
    if (!b) return
    const i = [...chips.children].indexOf(b.parentElement!)
    ;(form.elements.namedItem(b.dataset.k!) as HTMLInputElement | HTMLSelectElement).value = ''
    apply()
    const left = chips.querySelectorAll('button')
    left.length ? left[Math.min(i, left.length - 1)]!.focus() : toFilter()
  })
  $('clear').addEventListener('click', () => { form.reset(); apply(); toFilter() })
  void run(new URLSearchParams(location.search))
  // A first page the HTML doesn't hold in full (cards turned away, or none): built from the data file.
  if (els.size < Math.min(PAGE, Number(total))) void load().then(ok => (ok ? render() : failed()))
}
