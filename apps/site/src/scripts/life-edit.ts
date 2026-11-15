import type { Tank, UnlistedEntry } from '@aq/schema'
import { ct, siteHref } from './ct'
import type { Guessed } from './life-photo'
import { msg } from '../i18n/msg'
import { sciBeside } from '../lib/sci'
import { esc, type IndexItem } from './my-tanks'
import { exactMatch, rankMatches, type MateItem } from './tankmates'

/**
 * "Bể của tôi": the fish and plants on the tank being edited, in its form (loaded when the form opens). A handbook page
 * is found by name; anything the handbook has no page for is added by name as an entry without a page (`unlisted`,
 * packages/schema/src/tanks.ts), fish or plant, with its scientific name and count when the reader knows them. A photo
 * names one too ("Chụp ảnh nhận diện", life-photo.ts, loaded when opened). Nothing is saved until the form is: `value()`
 * is what the form saves.
 */
export type Life = Pick<Tank, 'species' | 'plants'> & { unlisted: UnlistedEntry[] }
type Page = IndexItem & { id: string; kind: 'fish' | 'plant' }
type Hit = MateItem & { page: Page }

/** Entries without a page on one tank (MAX_UNLISTED in packages/schema/src/tanks.ts; not imported, it brings zod). */
const MAX_UNLISTED = 100
const MAX_PAGES = 200
/** Typed like a scientific name ("Rhinogobius duospilus"): offered as the new entry's scientific name too. */
const LATIN = /^[A-Z][a-z]+ (?:(?:cf|aff)\.? )?[a-z]+$/
const PHOTO_OFF = msg('Nhận diện qua ảnh tạm thời chưa dùng được. Bạn gõ tên cá hoặc cây vào ô tìm nhé.')

/** An entry with no page of its own, as its row names it: the page that has its name, or its name marked, and its
 * scientific name when the name doesn't say it (a photo's guess with no common name is named by it). */
export function unlistedName(u: Pick<UnlistedEntry, 'name' | 'sci'>, p?: { name: string; path: string } | null): string {
  if (p) return `<a href="${esc(siteHref(p.path))}">${esc(p.name)}</a>`
  const sci = u.sci && sciBeside(u.name, u.sci)
  return `<span>${esc(u.name)}</span> <span class="tag">${ct('chưa có trang')}</span>${sci ? ` <i class="sci">${esc(sci)}</i>` : ''}`
}

export function initLife(root: HTMLElement, o: {
  /** The handbook's fish and plants (the app index), when they could be read. */
  pages: () => Promise<Page[] | undefined>
  /** The page an entry without a page is shown as, once one has its scientific name. */
  match: (e: Pick<UnlistedEntry, 'kind' | 'sci'>) => Page | undefined
}) {
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T
  const list = $<HTMLUListElement>('[data-life-list]')
  const input = $<HTMLInputElement>('[data-life-q]')
  const opts = $<HTMLUListElement>('[data-life-opts]')
  const sheet = $<HTMLElement>('[data-life-new]')
  const say = (s: string) => { $('[data-life-msg]').textContent = s }
  const field = (n: string) => sheet.querySelector(`[name=${n}]`) as HTMLInputElement
  const photoOpen = $<HTMLButtonElement>('[data-life-photo-open]')
  const photoPanel = $<HTMLElement>('[data-life-photo]')
  let life: Life = { species: [], plants: [], unlisted: [] }
  /** Changed in this form: only then does saving write the fish and plants (another tab may have added some meanwhile). */
  let touched = false
  let byId = new Map<string, Page>()
  let items: Hit[] = []
  let shown: (Hit | 'new')[] = []
  let active = -1
  let loading: Promise<void> | undefined
  let photo: Promise<ReturnType<typeof import('./life-photo').initPhoto>> | undefined
  /** The "Thêm …" form is filled in from a photo's guess. */
  let sheetFromPhoto = false

  async function load() {
    const pages = await o.pages()
    if (!pages) { say(ct('Chưa tải được danh sách cá và cây của cẩm nang: vẫn thêm được bằng tên.')); return }
    byId = new Map(pages.map(p => [p.id, p]))
    items = pages.map(p => ({ name: p.name, scientificName: p.sub ?? '', slug: p.path, ...(p.aka ? { aka: p.aka } : {}), page: p }) as Hit)
    draw()
    // Typed before the list arrived: the pages join the suggestions.
    if (document.activeElement === input && input.value.trim()) suggest()
  }

  const kindWord = (k: string) => (k === 'plant' ? ct('Cây') : ct('Cá'))
  const countBox = (i: number, n: number | undefined, label: string, what: 'species' | 'unlisted') =>
    `<label class="qty"><input type="number" inputmode="numeric" min="1" max="9999" value="${n ?? ''}" data-${what}-count="${i}" aria-label="${esc(ct('Số con {name}', { name: label }))}" /><span aria-hidden="true">${ct('con')}</span></label>`
  const remove = (what: string, i: number, label: string) => `<button type="button" class="quiet rm" data-rm="${what}:${i}" aria-label="${esc(ct('Bỏ {name}', { name: label }))}">${ct('Bỏ')}</button>`
  const pageName = (id: string) => byId.get(id)?.name ?? id.replace(/-/g, ' ')
  const linked = (id: string) => { const p = byId.get(id); return p?.path ? `<a href="${esc(siteHref(p.path))}">${esc(p.name)}</a>` : `<span>${esc(pageName(id))}</span>` }

  /** The rows: fish with their counts, plants, then what has no page (marked, or shown as the page that has its name). */
  function draw() {
    const rows = [
      ...life.species.map((s, i) => `<li><span class="nm">${linked(s.id)}</span>${countBox(i, s.count, pageName(s.id), 'species')}${remove('species', i, pageName(s.id))}</li>`),
      ...life.plants.map((p, i) => `<li><span class="nm">${linked(p.id)}</span>${remove('plants', i, pageName(p.id))}</li>`),
      ...life.unlisted.map((u, i) => {
        const p = o.match(u)
        return `<li><span class="nm">${unlistedName(u, p)}</span>${u.kind === 'plant' ? '' : countBox(i, u.count, u.name, 'unlisted')}${remove('unlisted', i, p?.name ?? u.name)}</li>`
      }),
    ]
    list.innerHTML = rows.join('')
    list.hidden = !rows.length
  }

  // The search: an ARIA combobox, as on the tank-mates tool. Its last option always adds what was typed without a page.
  function setActive(i: number) {
    active = i
    opts.querySelectorAll('[role=option]').forEach((el, k) => el.setAttribute('aria-selected', String(k === i)))
    if (i >= 0) input.setAttribute('aria-activedescendant', `mt-opt-${i}`)
    else input.removeAttribute('aria-activedescendant')
  }
  function openList(on: boolean) {
    opts.hidden = !on
    input.setAttribute('aria-expanded', String(on))
    if (!on) setActive(-1)
  }
  const has = (p: Page) => (p.kind === 'plant' ? life.plants : life.species).some(x => x.id === p.id)
  function suggest() {
    const q = input.value.trim()
    const hits = q ? rankMatches(q, items) : []
    shown = q.length >= 2 ? [...hits, 'new'] : hits
    opts.innerHTML = shown.map((s, i) => s === 'new'
      ? `<li role="option" id="mt-opt-${i}" class="new" aria-selected="false">${ct('Thêm “{q}” (chưa có trong cẩm nang)', { q: esc(q) })}</li>`
      : `<li role="option" id="mt-opt-${i}" aria-selected="false"${has(s.page) ? ' aria-disabled="true"' : ''}><span class="nm"><span>${esc(s.name)}</span>${sciBeside(s.name, s.scientificName) ? ` <i class="sci">${esc(s.scientificName)}</i>` : ''}</span><span class="tag">${has(s.page) ? ct('Đã có') : kindWord(s.page.kind)}</span></li>`).join('')
    setActive(-1)
    openList(shown.length > 0)
  }
  function clear() { input.value = ''; shown = []; opts.innerHTML = ''; openList(false) }

  function addPage(p: Page) {
    if (has(p)) return say(ct('{name} đã có trong bể.', { name: p.name }))
    if (p.kind === 'plant') {
      if (life.plants.length >= MAX_PAGES) return say(ct('Đã đủ {n} loài: bỏ bớt để thêm.', { n: MAX_PAGES }))
      life.plants.push({ id: p.id })
    } else {
      if (life.species.length >= MAX_PAGES) return say(ct('Đã đủ {n} loài: bỏ bớt để thêm.', { n: MAX_PAGES }))
      life.species.push({ id: p.id, count: p.schoolMin ?? 1 })
    }
    touched = true
    clear()
    say(ct('Đã thêm {name}. Bấm “Lưu bể” để lưu.', { name: p.name }))
    draw()
  }

  // Adding what has no page: a few fields under the search, asked only then; filled in from a photo's guess.
  function openNew(q: string, guess?: { kind: 'fish' | 'plant'; sci: string }) {
    clear()
    field('uname').value = q
    field('usci').value = guess ? guess.sci : LATIN.test(q) ? q : ''
    field('ucount').value = ''
    ;(sheet.querySelector(`input[name=ukind][value=${guess?.kind ?? 'fish'}]`) as HTMLInputElement).checked = true
    $('[data-life-q-shown]').textContent = q
    sheet.hidden = false
    sheetFromPhoto = !!guess
    kindChanged()
    sheet.querySelector<HTMLInputElement>('input[name=ukind]:checked')!.focus()
  }
  /** The fields go with it: a value left in a hidden field (a count of 0) would stop the form from saving. */
  function closeNew() {
    sheet.hidden = true
    sheetFromPhoto = false
    for (const n of ['uname', 'usci', 'ucount']) field(n).value = ''
  }
  function kindChanged() {
    const plant = sheet.querySelector<HTMLInputElement>('input[name=ukind]:checked')?.value === 'plant'
    field('ucount').closest('label')!.hidden = plant
  }
  function addNew() {
    const name = field('uname').value.trim()
    const sci = field('usci').value.trim().replace(/\s+/g, ' ')
    const kind = sheet.querySelector<HTMLInputElement>('input[name=ukind]:checked')?.value ?? 'fish'
    const n = Math.round(Number(field('ucount').value))
    if (!name) { say(ct('Ghi tên để thêm.')); field('uname').focus(); return }
    if (life.unlisted.length >= MAX_UNLISTED) { say(ct('Đã đủ {n} loài chưa có trang trên bể này.', { n: MAX_UNLISTED })); return }
    const e: UnlistedEntry = { id: crypto.randomUUID(), kind, name, ...(sci ? { sci } : {}), ...(kind !== 'plant' && n >= 1 ? { count: Math.min(9999, n) } : {}) }
    life.unlisted.push(e)
    const byPhoto = sheetFromPhoto
    touched = true
    closeNew()
    const p = o.match(e)
    say(p ? ct('Đã thêm {name}: cẩm nang có trang {page}. Bấm “Lưu bể” để lưu.', { name, page: p.name }) : ct('Đã thêm {name}. Bấm “Lưu bể” để lưu.', { name }))
    draw()
    if (byPhoto) photoDone()
    else input.focus()
  }

  // "Chụp ảnh nhận diện": the photo's guesses under the search (life-photo.ts), its code and Turnstile loaded when opened.
  const photoShown = () => photoOpen.getAttribute('aria-expanded') === 'true'
  function openPhoto() {
    const open = !photoShown()
    photoOpen.setAttribute('aria-expanded', String(open))
    if (!open) { photoPanel.hidden = true; return }
    // The handbook's pages too: a guess's page joins at its count for a school.
    void (loading ??= load())
    photo ??= import('./life-photo').then(m => m.initPhoto(photoPanel, { off: ct(PHOTO_OFF), has, add: addGuess }))
    // Shown once its code listens: a photo picked before would be lost.
    photo.then(() => { if (photoShown()) photoPanel.hidden = false }, () => {
      // Offline before it ever loaded: tried again when opened next.
      photo = undefined
      photoOpen.setAttribute('aria-expanded', 'false')
      say(ct(PHOTO_OFF))
    })
  }
  /** A guess picked: its page as if picked from the search; without one, the "Thêm …" form filled in from it. */
  async function addGuess(g: Guessed) {
    if ('entry' in g) return openNew(g.entry.name, g.entry)
    await (loading ??= load())
    let p = byId.get(g.page.id)
    // Not in the handbook's index (it couldn't be read, or lists no such page): as the guess names it.
    if (!p) byId.set(g.page.id, (p = g.page))
    if (has(p)) return say(ct('{name} đã có trong bể.', { name: p.name }))
    addPage(p)
    photoDone()
  }
  /** Back to the photo panel's first state, ready for the next fish. */
  function photoDone() {
    void photo?.then(t => t.reset())
    photoPanel.querySelector<HTMLInputElement>('input[type=file]')?.focus()
  }

  input.addEventListener('input', () => { void (loading ??= load()); suggest() })
  input.addEventListener('focus', () => { void (loading ??= load()); if (input.value.trim()) suggest() })
  input.addEventListener('blur', () => openList(false))
  input.addEventListener('keydown', e => {
    const n = shown.length
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
      e.preventDefault()
      const down = e.key === 'ArrowDown'
      if (opts.hidden) { openList(true); setActive(down ? 0 : n - 1) } else setActive(down ? (active + 1) % n : active <= 0 ? n - 1 : active - 1)
    } else if (e.key === 'Enter') {
      // Never the tank form's submit: Enter picks here.
      e.preventDefault()
      const q = input.value.trim()
      if (!q) return
      const pick = !opts.hidden && active >= 0 ? shown[active]! : exactMatch(q, items) ?? (shown.length === 1 ? 'new' : undefined)
      if (pick === 'new') openNew(q)
      else if (pick) addPage(pick.page)
      else { suggest(); say(ct('Chọn một dòng trong danh sách.')) }
    } else if (e.key === 'Escape' && !opts.hidden) {
      e.preventDefault()
      e.stopPropagation() // not the form's Escape, which closes it
      openList(false)
    }
  })
  opts.addEventListener('pointerdown', e => e.preventDefault())
  opts.addEventListener('click', e => {
    const el = (e.target as Element).closest<HTMLElement>('[role=option]')
    if (!el || el.getAttribute('aria-disabled') === 'true') return
    const s = shown[Number(el.id.replace('mt-opt-', ''))]
    if (s === 'new') openNew(input.value.trim())
    else if (s) addPage(s.page)
  })
  photoOpen.addEventListener('click', openPhoto)
  sheet.addEventListener('change', e => { if ((e.target as HTMLInputElement).name === 'ukind') kindChanged() })
  sheet.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target as HTMLElement).matches('input')) { e.preventDefault(); addNew() }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNew(); input.focus() }
  })
  sheet.addEventListener('click', e => {
    const b = (e.target as Element).closest('button')
    if (b?.hasAttribute('data-life-add')) addNew()
    if (b?.hasAttribute('data-life-cancel')) { closeNew(); input.focus() }
  })
  list.addEventListener('input', e => {
    const el = e.target as HTMLInputElement
    const n = Math.round(Number(el.value))
    const i = Number(el.dataset.speciesCount ?? el.dataset.unlistedCount)
    const row = el.dataset.speciesCount !== undefined ? life.species[i] : life.unlisted[i]
    if (!row) return
    // An emptied box: the tank says no number (as one saved from a page with none).
    if (el.value.trim() === '') delete row.count
    else if (n >= 1) row.count = Math.min(9999, n)
    touched = true
  })
  list.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('[data-rm]')
    if (!b) return
    const [what, i] = b.dataset.rm!.split(':') as ['species' | 'plants' | 'unlisted', string]
    const [gone] = (life[what] as { id: string }[]).splice(Number(i), 1)
    touched = true
    const name = what === 'unlisted' ? (gone as UnlistedEntry).name : pageName(gone!.id)
    say(ct('Đã bỏ {name}. Bấm “Lưu bể” để lưu.', { name }))
    draw()
    input.focus()
  })

  return {
    /** The tank being edited (a copy: every key an entry has is kept), or a new one. */
    edit(t: Pick<Tank, 'species' | 'plants' | 'unlisted'> | undefined) {
      life = { species: (t?.species ?? []).map(s => ({ ...s })), plants: (t?.plants ?? []).map(p => ({ ...p })), unlisted: (t?.unlisted ?? []).map(u => ({ ...u })) }
      touched = false
      clear()
      closeNew()
      say('')
      photoPanel.hidden = true
      photoOpen.setAttribute('aria-expanded', 'false')
      void photo?.then(t => t.reset(), () => {})
      draw()
      root.hidden = false
      if (life.species.length || life.plants.length || life.unlisted.length) void (loading ??= load())
    },
    /** What the form saves: the fish and plants when the reader changed them here, else nothing (the tank keeps its own). */
    value: (): Life | undefined => (touched ? life : undefined),
  }
}
