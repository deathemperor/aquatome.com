import { date, escapeHtml, loadTurnstile } from './comments'
import { ct } from './ct'
import type { Viewer, ViewerPhoto } from './photo-viewer'

export type ShownPhoto = { id: string; name: string; url: string; thumb: string; width: number; height: number; createdAt: string }
const MAX_BYTES = 8 * 1024 * 1024
const MAX_SIDE = 2000

/**
 * One gallery tile: the thumb, a button opening photo `i` in the viewer; the reader's name as credit. Every user string
 * escaped.
 */
export function photoHtml(p: ShownPhoto, i: number): string {
  return `<li><button type="button" data-i="${i}" aria-haspopup="dialog"><img src="${escapeHtml(p.thumb)}" width="${p.width}" height="${p.height}" alt="${ct('Ảnh của {name}', { name: escapeHtml(p.name) })}" loading="lazy"></button><span>${escapeHtml(p.name)}</span></li>`
}

/**
 * The page's readers' photos as tiles, `first` and then each older batch "Xem thêm" brings (the function returned). A
 * tap on a tile opens them in the viewer, loaded then (pages without readers' photos never load it), which steps through
 * every one shown so far. Should it fail to load (a deploy replaced it since the page loaded), the photo opens on its own.
 */
function viewReaderPhotos(list: HTMLElement, first: ShownPhoto[]): (more: ShownPhoto[]) => void {
  const lang = document.documentElement.lang
  const photos: ShownPhoto[] = []
  const slides: ViewerPhoto[] = []
  const add = (more: ShownPhoto[]) => {
    list.insertAdjacentHTML('beforeend', more.map((p, k) => photoHtml(p, photos.length + k)).join(''))
    photos.push(...more)
    slides.push(...more.map(p => ({ src: p.url, thumb: p.thumb, width: p.width, height: p.height, alt: ct('Ảnh của {name}', { name: p.name }), credit: () => [`${ct('Ảnh của {name}', { name: p.name })} · ${date(p.createdAt, lang)}`] })))
  }
  add(first)
  let viewer: Promise<Viewer> | undefined
  const view = () => (viewer ??= import('./photo-viewer').then(m => m.createViewer({
    id: 'reader',
    photos: slides,
    tile: i => list.querySelectorAll<HTMLElement>('button[data-i]')[i],
  })))
  list.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-i]')
    const i = Number(b?.dataset.i)
    if (b) view().then(v => v.open(i, { from: b }), () => location.assign(photos[i]!.url))
  })
  // Reloaded with a photo open: open it again (its history entry is the viewer's, photo-view.ts viewerHistory).
  if ((history.state as { viewer?: unknown } | null)?.viewer === 'reader') view().then(v => v.restore(), () => {})
  return add
}

/**
 * After sending: the photo just sent stays in view, and its take-back link is text to keep (selectable, with a copy
 * button), not a link to tap. Tapped, it opened the page that removes the photo, which readers took for "see my photo".
 */
export function showSent(box: HTMLElement, photo: Blob, name: string, link: string, keepId = 'rp-keep') {
  if (box.dataset.url) URL.revokeObjectURL(box.dataset.url)
  const url = (box.dataset.url = URL.createObjectURL(photo))
  box.innerHTML = `<img src="${url}" alt="${escapeHtml(ct('Ảnh của {name}', { name }))}"><p id="${keepId}">${escapeHtml(ct('Muốn gỡ ảnh sau này? Lưu link riêng này (chỉ hiện một lần):'))}</p><div class="keep"><input readonly aria-labelledby="${keepId}" value="${escapeHtml(link)}"><button type="button">${escapeHtml(ct('Chép link'))}</button></div>`
  const field = box.querySelector('input')!
  const copy = box.querySelector('button')!
  field.addEventListener('focus', () => field.select())
  copy.addEventListener('click', () => {
    field.select()
    void navigator.clipboard?.writeText(link).then(() => { copy.textContent = ct('Đã chép') }, () => {})
  })
  box.hidden = false
}

/** Part of a photo, in fractions (0–1) of its width and height as shown (turned upright). */
export type Region = { x: number; y: number; w: number; h: number }

/**
 * Re-encode on the phone before upload: at most 2000 px (or `maxSide`), JPEG. The photo uploads faster, and its EXIF (GPS position,
 * phone model) never leaves the device. Null when the browser can't decode the file: it is then not sent at all.
 * With `region`, only that part, cut from the full-size photo (the fish-ID tool's "Khoanh một con cá").
 */
export async function shrink(file: Blob, maxSide = MAX_SIDE, quality = 0.88, region?: Region): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file)
    const r = region ?? { x: 0, y: 0, w: 1, h: 1 }
    const sx = Math.round(r.x * bmp.width), sy = Math.round(r.y * bmp.height)
    const sw = Math.max(1, Math.round(r.w * bmp.width)), sh = Math.max(1, Math.round(r.h * bmp.height))
    const k = Math.min(1, maxSide / Math.max(sw, sh))
    const c = document.createElement('canvas')
    c.width = Math.round(sw * k)
    c.height = Math.round(sh * k)
    c.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height)
    bmp.close()
    const out = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', quality))
    return out
  } catch {
    return null
  }
}

export const ERRORS: Record<string, string> = {
  turnstile: ct('Không qua được kiểm tra chống spam, vui lòng thử lại.'),
  rate: ct('Bạn đã gửi đủ 5 ảnh hôm nay. Hãy quay lại ngày mai.'),
  'not an image': ct('Chỉ nhận ảnh JPEG, PNG hoặc WebP.'),
  'too large': ct('Ảnh quá lớn (tối đa 8 MB).'),
  'bad name': ct('Tên chỉ gồm chữ, 1–40 ký tự, không chứa đường link.'),
  consent: ct('Vui lòng xác nhận ảnh do bạn chụp.'),
}

type Listed = { photos: ShownPhoto[]; next?: string; sitekey: string; verification: 'none' | 'phone' }

/** Gallery + form; hidden unless the API answers (no buckets / no JS → nothing dead on the page). */
export async function mountReaderPhotos(section: HTMLElement) {
  const entity = section.dataset.entity!
  const res = await fetch(`/_p?e=${encodeURIComponent(entity)}`).catch(() => null)
  if (!res?.ok) return
  const data = (await res.json()) as Listed
  const list = section.querySelector<HTMLUListElement>('[data-list]')!
  const empty = section.querySelector<HTMLElement>('[data-empty]')!
  const more = section.querySelector<HTMLButtonElement>('[data-more]')!
  const form = section.querySelector<HTMLFormElement>('[data-form]')!
  const msg = section.querySelector<HTMLElement>('[data-msg]')!
  const sent = section.querySelector<HTMLElement>('[data-sent]')!
  empty.hidden = data.photos.length > 0
  const add = viewReaderPhotos(list, data.photos)
  // The API lists 60 at a time: "Xem thêm" brings the older ones while there are more, and focus goes to the first of
  // them. A failed load leaves the button to try again.
  let next = data.next
  more.hidden = !next
  more.addEventListener('click', async () => {
    more.disabled = true
    const r = await fetch(`/_p?e=${encodeURIComponent(entity)}&before=${encodeURIComponent(next!)}`).catch(() => null)
    const older = r?.ok ? ((await r.json().catch(() => null)) as Listed | null) : null
    more.disabled = false
    if (!older) return
    const from = list.children.length
    add(older.photos)
    next = older.next
    more.hidden = !next
    list.querySelectorAll<HTMLElement>('button[data-i]')[from]?.focus()
  })
  section.hidden = false
  // A gallery page's link down to them (GalleryPage.astro), when there are any; the number only when it's all of them.
  const down = document.querySelector<HTMLAnchorElement>('[data-to-readers]')
  if (down && data.photos.length) {
    down.textContent = data.next ? ct('Xem ảnh bạn đọc gửi ↓') : ct('Xem {n} ảnh bạn đọc gửi ↓', { n: data.photos.length })
    down.hidden = false
  }
  if (data.verification === 'phone') return
  const ts = await loadTurnstile().catch(() => null)
  if (!ts) return
  form.hidden = false
  let token = ''
  const widget = ts.render(section.querySelector<HTMLElement>('[data-turnstile]')!, { sitekey: data.sitekey, language: document.documentElement.lang, callback: t => (token = t), 'expired-callback': () => (token = '') })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    const f = new FormData(form)
    const file = f.get('file')
    if (!(file instanceof File) || !file.size) { msg.textContent = ct('Chọn một ảnh trước đã.'); return }
    if (!token) { msg.textContent = ct('Vui lòng đợi kiểm tra chống spam hoàn tất rồi gửi lại.'); return }
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!
    button.disabled = true
    sent.hidden = true
    msg.textContent = ct('Đang chuẩn bị ảnh…')
    const blob = await shrink(file)
    if (!blob) { msg.textContent = ct('Trình duyệt không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.'); button.disabled = false; return }
    if (blob.size > MAX_BYTES) { msg.textContent = ERRORS['too large']!; button.disabled = false; return }
    const body = new FormData()
    body.set('e', entity)
    body.set('name', String(f.get('name') ?? ''))
    body.set('consent', f.get('consent') ? '1' : '')
    body.set('token', token)
    body.set('file', blob, 'photo.jpg')
    msg.textContent = ct('Đang gửi…')
    const r = await fetch('/_p', { method: 'POST', body }).catch(() => null)
    const out = (await r?.json().catch(() => null)) as { deleteUrl?: string; error?: string } | null
    button.disabled = false
    token = ''
    ts.reset(widget)
    if (r?.status === 201 && out?.deleteUrl) {
      const name = String(f.get('name') ?? '')
      form.reset()
      msg.textContent = ct('Đã nhận ảnh, cảm ơn bạn! Ảnh sẽ hiện ở đây sau khi được duyệt, thường trong vòng một ngày.')
      showSent(sent, blob, name, new URL(out.deleteUrl, location.origin).href)
    } else {
      msg.textContent = ERRORS[out?.error ?? ''] ?? ct('Không gửi được ảnh, vui lòng thử lại.')
    }
  })
}
