import { ct } from './ct'
import type { T } from '../lib/i18n'
import type { Viewer } from './photo-viewer'

/** `photo`: its photo, once moderation has shown it (worker/comments/photo.ts). */
export type ShownComment = { id: string; name: string; body: string; helpful: boolean; createdAt: string; photo?: { id: string; url: string; thumb: string; width: number; height: number } }
const MAX_BYTES = 8 * 1024 * 1024

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, ch => ESC[ch]!)

/** The day, in the reader's own time zone (a comment posted at 23:00 in Hanoi is the next day's in Tokyo). */
export const date = (iso: string, lang: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(iso))

/** One comment as inert HTML: every user string escaped, links stay plain text; its photo under the text, opening the viewer. */
export function commentHtml(c: ShownComment, ct: T, lang: string): string {
  const badge = c.helpful ? `<span class="helpful">${ct('Trả lời hay')}</span>` : ''
  const paras = escapeHtml(c.body).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
  const p = c.photo
  const photo = p ? `<button type="button" class="photo" data-photo="${escapeHtml(p.id)}" aria-haspopup="dialog"><img src="${escapeHtml(p.thumb)}" width="${Number(p.width)}" height="${Number(p.height)}" alt="${escapeHtml(ct('Ảnh của {name}', { name: c.name }))}" loading="lazy"></button>` : ''
  return `<li class="comment" data-comment-id="${escapeHtml(c.id)}"><header><strong>${escapeHtml(c.name)}</strong> <time datetime="${escapeHtml(c.createdAt)}">${date(c.createdAt, lang)}</time>${badge}</header>${paras}${photo}</li>`
}

/**
 * A tap on a comment's photo opens the page's comments' photos in the photo viewer, loaded then, credited as readers'
 * photos are. Should it fail to load, the photo opens on its own.
 */
function viewCommentPhotos(list: HTMLElement, comments: ShownComment[]) {
  const shown = comments.filter(c => c.photo)
  const lang = document.documentElement.lang
  let viewer: Promise<Viewer> | undefined
  const view = () => (viewer ??= import('./photo-viewer').then(m => m.createViewer({
    id: 'comments',
    photos: shown.map(({ photo: p, name, createdAt }) => ({ src: p!.url, thumb: p!.thumb, width: p!.width, height: p!.height, alt: ct('Ảnh của {name}', { name }), credit: () => [`${ct('Ảnh của {name}', { name })} · ${date(createdAt, lang)}`] })),
    tile: i => list.querySelectorAll<HTMLElement>('button[data-photo]')[i],
  })))
  list.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-photo]')
    const i = shown.findIndex(c => c.photo!.id === b?.dataset.photo)
    if (b && i >= 0) view().then(v => v.open(i, { from: b }), () => location.assign(shown[i]!.photo!.url))
  })
  if ((history.state as { viewer?: unknown } | null)?.viewer === 'comments') view().then(v => v.restore(), () => {})
}

export type Turnstile = { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void; language: string }) => string; reset: (id: string) => void }

let turnstile: Promise<Turnstile> | undefined
/** Turnstile's script, loaded once per page (comments and reader photos share it). */
export function loadTurnstile(): Promise<Turnstile> {
  return (turnstile ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile)
    s.onerror = reject
    document.head.append(s)
  }))
}

/** Comments stay hidden unless the API answers: no D1 / no JS → no dead form. */
export async function mountComments(section: HTMLElement) {
  const entity = section.dataset.entity!
  const res = await fetch(`/_c?e=${encodeURIComponent(entity)}`).catch(() => null)
  if (!res?.ok) return
  const data = (await res.json()) as { comments: ShownComment[]; sitekey: string; verification: 'none' | 'phone' }
  const list = section.querySelector<HTMLOListElement>('[data-list]')!
  const empty = section.querySelector<HTMLElement>('[data-empty]')!
  const form = section.querySelector<HTMLFormElement>('[data-form]')!
  const msg = section.querySelector<HTMLElement>('[data-msg]')!
  const show = (items: ShownComment[]) => {
    list.insertAdjacentHTML('beforeend', items.map(c => commentHtml(c, ct, document.documentElement.lang)).join(''))
    empty.hidden = list.children.length > 0
  }
  show(data.comments)
  viewCommentPhotos(list, data.comments)
  section.hidden = false
  if (data.verification === 'phone') {
    section.querySelector<HTMLElement>('[data-verify]')!.hidden = false
    return
  }
  let token = ''
  const ts = await loadTurnstile().catch(() => null)
  if (!ts) { section.querySelector<HTMLElement>('[data-ts-fail]')!.hidden = false; return }
  form.hidden = false
  const widget = ts.render(section.querySelector<HTMLElement>('[data-turnstile]')!, { sitekey: data.sitekey, language: document.documentElement.lang, callback: t => (token = t), 'expired-callback': () => (token = '') })
  // A photo picked: its consent, required, and what happens to it.
  const fileInput = form.querySelector<HTMLInputElement>('input[name=file]')!
  const withPhoto = section.querySelector<HTMLElement>('[data-with-photo]')!
  const consent = form.querySelector<HTMLInputElement>('input[name=consent]')!
  const sent = section.querySelector<HTMLElement>('[data-sent]')!
  const picked = () => { withPhoto.hidden = !fileInput.files?.length; consent.required = !withPhoto.hidden }
  fileInput.addEventListener('change', picked)

  form.addEventListener('submit', async e => {
    e.preventDefault()
    const f = new FormData(form)
    if (!token) { msg.textContent = ct('Vui lòng đợi kiểm tra chống spam hoàn tất rồi gửi lại.'); return }
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!
    button.disabled = true
    sent.hidden = true
    const file = f.get('file')
    // With a photo, a multipart post: the photo shrunk on the device first, as readers' photos are (scripts/reader-photos.ts, loaded then).
    let photo: { blob: Blob; rp: typeof import('./reader-photos') } | undefined
    if (file instanceof File && file.size) {
      msg.textContent = ct('Đang chuẩn bị ảnh…')
      const rp = await import('./reader-photos').catch(() => null)
      const blob = rp && (await rp.shrink(file))
      if (!rp || !blob) { msg.textContent = ct('Trình duyệt không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.'); button.disabled = false; return }
      if (blob.size > MAX_BYTES) { msg.textContent = rp.ERRORS['too large']!; button.disabled = false; return }
      photo = { blob, rp }
    }
    msg.textContent = ct('Đang gửi…')
    const fields = { e: entity, name: String(f.get('name') ?? ''), body: String(f.get('body') ?? ''), token }
    let post: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) }
    if (photo) {
      const body = new FormData()
      for (const [k, v] of Object.entries(fields)) body.set(k, v)
      body.set('consent', f.get('consent') ? '1' : '')
      body.set('file', photo.blob, 'photo.jpg')
      post = { method: 'POST', body }
    }
    const r = await fetch('/_c', post).catch(() => null)
    const out = (await r?.json().catch(() => null)) as { status?: 'approved' | 'held'; comment?: ShownComment; photo?: { deleteUrl: string }; error?: string } | null
    button.disabled = false
    token = ''
    if (widget) ts.reset(widget)
    // The photo waits for moderation: nothing under the comment yet, and its take-back link to keep.
    const waiting = out?.photo ? ` ${ct('Ảnh sẽ hiện dưới bình luận sau khi được duyệt, thường trong vòng một ngày.')}` : ''
    if (r?.status === 201) {
      if (out?.status === 'approved' && out.comment) show([out.comment])
      form.reset()
      picked()
      msg.textContent = (out?.status === 'approved' && out.comment ? ct('Đã đăng bình luận.') : ct('Bình luận đang chờ duyệt.')) + waiting
      if (photo && out?.photo) photo.rp.showSent(sent, photo.blob, fields.name, new URL(out.photo.deleteUrl, location.origin).href, 'cm-keep')
    } else {
      msg.textContent = out?.error === 'turnstile' ? ct('Không qua được kiểm tra chống spam, vui lòng thử lại.') : (photo && photo.rp.ERRORS[out?.error ?? '']) || ct('Không gửi được bình luận, vui lòng thử lại.')
    }
  })
}
