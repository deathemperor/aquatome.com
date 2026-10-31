import { ct } from './ct'

/**
 * A list page's filter, the same on the fish and plant lists (components FilterBox and FilterResults, ids `<prefix>-…`):
 * the filters live in the address, one chip each (× drops one, "Xóa lọc" all); the sure matches come first, and the cards
 * missing a figure the filter asks about wait in a closed group after them. Every card stays in the HTML (crawlers follow
 * every link); readers see each list a page of 24 at a time.
 *
 * `match`: the slugs that surely fit the address's filters, and those nothing known rules out but missing a figure.
 * `onRun`: anything else the page updates after each filter.
 */
export function filterList(prefix: string, match: (p: URLSearchParams) => { sure: string[]; unsure: string[] }, onRun?: (p: URLSearchParams) => void) {
  const PAGE = 24
  const $ = (id: string) => document.getElementById(`${prefix}-${id}`)!
  const form = $('filter') as HTMLFormElement
  const count = $('count')
  const chips = $('chips')
  const unsure = $('unsure') as HTMLDetailsElement
  // Every card in reading order, taken once: each run deals them out again, so the order never drifts.
  const cards = [...document.querySelectorAll<HTMLElement>('[data-slug]')]
  const grid = cards[0]?.parentElement ?? document.createElement('div')
  // The unsure group's grid: a bare copy of the list's, so it carries the same (scoped) grid styles.
  const unsureGrid = grid.cloneNode(false) as HTMLElement
  unsure.querySelector('.more')!.before(unsureGrid)
  const lists = [
    { grid, more: $('more') as HTMLButtonElement, keep: new Set<string>(), shown: PAGE },
    { grid: unsureGrid, more: $('unsure-more') as HTMLButtonElement, keep: new Set<string>(), shown: PAGE },
  ]
  const listOf = (el: HTMLElement) => lists.findIndex(l => l.keep.has(el.dataset.slug!))
  function render() {
    const n = lists.map(() => 0)
    for (const el of cards) { const k = listOf(el); el.hidden = k < 0 || n[k]!++ >= lists[k]!.shown }
    for (const l of lists) {
      const left = l.keep.size - Math.min(l.shown, l.keep.size)
      l.more.hidden = left <= 0
      l.more.textContent = ct('Xem thêm {n} loài (còn {left})', { n: Math.min(left, PAGE), left })
    }
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
  function run(params: URLSearchParams) {
    for (const [k, v] of params) { const el = form.elements.namedItem(k); if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = v }
    // Sure matches first; cards missing a figure the filter asks about wait in the closed group below.
    const m = match(params)
    lists[0]!.keep = new Set(m.sure)
    lists[1]!.keep = new Set(m.unsure)
    // Dealt out again only when a card changes list: moving all of them costs a phone ~750 card moves on every visit.
    if (cards.some(el => el.parentElement !== lists[Math.max(listOf(el), 0)]!.grid)) for (const el of cards) lists[Math.max(listOf(el), 0)]!.grid.append(el)
    onRun?.(params)
    const on = active(params)
    showChips(on)
    const [sure, maybe] = lists.map(l => l.keep.size) as [number, number]
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
  }
  function apply() {
    const p = new URLSearchParams([...new FormData(form)].filter(([, v]) => v !== '') as [string, string][])
    history.replaceState(null, '', `${p}` ? `?${p}` : location.pathname) // not p.size: Safari before 17 has none
    run(p)
  }
  lists.forEach(l => l.more.addEventListener('click', () => { l.shown += PAGE; render() }))
  form.addEventListener('submit', e => { e.preventDefault(); apply() })
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
  run(new URLSearchParams(location.search))
}
