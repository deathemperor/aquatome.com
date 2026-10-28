export type ShownComment = { id: string; name: string; body: string; helpful: boolean; createdAt: string }

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, ch => ESC[ch]!)

const date = (iso: string) => new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

/** One comment as inert HTML: every user string escaped, links stay plain text. */
export function commentHtml(c: ShownComment): string {
  const badge = c.helpful ? '<span class="helpful">Trả lời hay</span>' : ''
  const paras = escapeHtml(c.body).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `<li class="comment" data-comment-id="${escapeHtml(c.id)}"><header><strong>${escapeHtml(c.name)}</strong> <time datetime="${escapeHtml(c.createdAt)}">${date(c.createdAt)}</time>${badge}</header>${paras}</li>`
}

type Turnstile = { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void; language: string }) => string; reset: (id: string) => void }

function loadTurnstile(): Promise<Turnstile> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile)
    s.onerror = reject
    document.head.append(s)
  })
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
    list.insertAdjacentHTML('beforeend', items.map(commentHtml).join(''))
    empty.hidden = list.children.length > 0
  }
  show(data.comments)
  section.hidden = false
  if (data.verification === 'phone') {
    section.querySelector<HTMLElement>('[data-verify]')!.hidden = false
    return
  }
  form.hidden = false
  let token = ''
  const ts = await loadTurnstile().catch(() => null)
  const widget = ts?.render(section.querySelector<HTMLElement>('[data-turnstile]')!, { sitekey: data.sitekey, language: 'vi', callback: t => (token = t), 'expired-callback': () => (token = '') })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    const f = new FormData(form)
    if (!token) { msg.textContent = 'Vui lòng đợi kiểm tra chống spam hoàn tất rồi gửi lại.'; return }
    const button = form.querySelector('button')!
    button.disabled = true
    msg.textContent = 'Đang gửi…'
    const r = await fetch('/_c', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ e: entity, name: f.get('name'), body: f.get('body'), token }) }).catch(() => null)
    const out = (await r?.json().catch(() => null)) as { status?: 'approved' | 'held'; comment?: ShownComment; error?: string } | null
    button.disabled = false
    token = ''
    if (ts && widget) ts.reset(widget)
    if (r?.status === 201 && out?.status === 'approved' && out.comment) {
      show([out.comment])
      form.reset()
      msg.textContent = 'Đã đăng bình luận.'
    } else if (r?.status === 201) {
      form.reset()
      msg.textContent = 'Bình luận đang chờ duyệt.'
    } else {
      msg.textContent = out?.error === 'turnstile' ? 'Không qua được kiểm tra chống spam, vui lòng thử lại.' : 'Không gửi được bình luận, vui lòng thử lại.'
    }
  })
}
