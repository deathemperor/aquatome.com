import { loadTurnstile, type Turnstile } from './comments'
import { ct } from './ct'
import * as store from './tank-store'
import { codeInHash, deleteAccount, emailStart, emailVerify, getNonce, getSession, isFail, PENDING, pendingFlow, signInWith, signOut, syncOnce, type Fail, type Providers, type User } from './sync'

/**
 * "Đồng bộ giữa các thiết bị" on "Bể của tôi": optional sign-in and sync. The section stays hidden unless the server
 * offers accounts. Google's, Apple's and Turnstile's scripts load only when the reader asks to sign in.
 *
 * Signed in, this browser's tanks and the account's are merged both ways (sync.ts): right after signing in, when the page
 * opens, after each change here (a moment later), and when the tab comes back into view.
 */
type Google = { accounts: { id: { initialize(o: { client_id: string; nonce: string; callback: (r: { credential: string }) => void; ux_mode?: string; itp_support?: boolean }): void; renderButton(el: HTMLElement, o: Record<string, string | number>): void } } }
type Apple = { auth: { init(o: { clientId: string; scope: string; redirectURI: string; nonce: string; usePopup: boolean }): void; signIn(): Promise<{ authorization: { id_token: string; code: string } }> } }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const scripts = new Map<string, Promise<void>>()
function script(src: string): Promise<void> {
  let p = scripts.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const s = Object.assign(document.createElement('script'), { src, async: true })
      s.onload = () => resolve()
      s.onerror = () => { scripts.delete(src); reject(new Error(src)) }
      document.head.append(s)
    })
    scripts.set(src, p)
  }
  return p
}
const APPLE_LOCALE: Record<string, string> = { vi: 'vi_VN', id: 'id_ID', th: 'th_TH' }
const KIND: Record<string, string> = { google: 'Google', apple: 'Apple', email: 'email', passkey: 'passkey' }

export function initAccount(o: { onStore: () => void }) {
  const section = $('tai-khoan')
  const lang = document.documentElement.lang.slice(0, 2)
  const page = `${location.origin}${location.pathname}`
  let providers: Providers | undefined
  let sitekey = ''
  let user: User | null = null
  let syncedAt: Date | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let turnstile: { ts: Turnstile; widget: string } | undefined
  let token = ''
  let flow: string | undefined

  const say = (text: string, bad = false) => {
    const m = $('acc-msg')
    m.textContent = text
    m.classList.toggle('bad', bad)
    m.hidden = !text
  }
  const problem = (f: Fail) => ({
    offline: ct('Không có mạng: thử lại khi có mạng.'),
    rate_limited: ct('Thử quá nhiều lần: đợi một lát rồi thử lại.'),
    too_many: ct('Tài khoản đã đủ chỗ (200 bể, 400 đèn): xóa bớt rồi đồng bộ lại.'),
    bad_code: ct('Mã không đúng hoặc đã hết hạn: kiểm tra lại, hoặc gửi mã mới.'),
    bad_email: ct('Địa chỉ email chưa đúng.'),
    turnstile: ct('Không qua được kiểm tra chống spam, vui lòng thử lại.'),
    mail_failed: ct('Chưa gửi được email: thử lại sau.'),
    credential_in_use: ct('Cách đăng nhập này đã thuộc một tài khoản khác.'),
    apple_other_account: ct('Đó là một Apple ID khác: đăng nhập bằng Apple ID của tài khoản này.'),
    apple_revoke_failed: ct('Apple chưa xác nhận được: thử lại.'),
  } as Record<string, string>)[f.error] ?? ct('Có lỗi, chưa làm được: thử lại.')

  function show() {
    $('acc-out').hidden = !!user
    $('acc-in').hidden = !user
    document.querySelector<HTMLElement>('[data-where="local"]')!.hidden = !!user
    document.querySelector<HTMLElement>('[data-where="account"]')!.hidden = !user
    if (user) {
      const ways = [...new Set(user.methods.map(m => KIND[m.kind] ?? m.kind))].join(', ')
      const time = syncedAt ? new Intl.DateTimeFormat(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' }).format(syncedAt) : ''
      $('acc-status').textContent = time ? ct('Đã đăng nhập bằng {ways}. Đồng bộ lúc {time}.', { ways, time }) : ct('Đã đăng nhập bằng {ways}.', { ways })
    }
  }

  async function sync(first = false) {
    if (!user) return
    const btn = $<HTMLButtonElement>('acc-sync')
    btn.disabled = true
    const before = store.liveTanks(store.load()).length
    const r = await syncOnce(() => store.load())
    btn.disabled = false
    if (isFail(r)) {
      if (r.error === 'signed_out') { user = null; show(); say(ct('Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ.'), true); return }
      say(r.error === 'offline' ? ct('Chưa đồng bộ được: không có mạng. Các thay đổi vẫn lưu trên máy này.') : problem(r), true)
      return
    }
    store.save(r.store)
    syncedAt = new Date()
    show()
    const now = store.liveTanks(r.store).length
    say(r.refused ? ct('{n} bản ghi không hợp lệ nên chưa vào tài khoản.', { n: r.refused }) : first && now > before ? ct('Đã thêm {n} bể từ tài khoản.', { n: now - before }) : '', r.refused > 0)
    o.onStore()
  }

  async function signedIn(u: User) {
    user = u
    localStorage.removeItem(PENDING)
    $('acc-ways').hidden = true
    show()
    say('')
    await sync(true)
    $('acc-sync').focus()
  }

  // Google: its button, with a nonce the server issued (used once).
  async function google(clientId: string) {
    const box = $('acc-google')
    try {
      await script('https://accounts.google.com/gsi/client')
      const g = (window as unknown as { google: Google }).google
      const arm = async () => {
        const nonce = await getNonce()
        if (!nonce) return
        g.accounts.id.initialize({
          client_id: clientId, nonce, ux_mode: 'popup', itp_support: true,
          callback: async ({ credential }) => {
            const r = await signInWith('google', credential, nonce)
            if (isFail(r)) { say(problem(r), true); void arm(); return }
            await signedIn(r.user)
          },
        })
      }
      await arm()
      g.accounts.id.renderButton(box, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 320, locale: lang })
    } catch {
      box.hidden = true
    }
  }

  // Apple: our button; its popup gives the identity token (sign-in) or a fresh code (deleting the account).
  async function appleReady(clientId: string): Promise<{ auth: Apple['auth']; nonce: string } | undefined> {
    try {
      await script(`https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/${APPLE_LOCALE[lang] ?? 'en_US'}/appleid.auth.js`)
      const nonce = await getNonce()
      if (!nonce) return undefined
      const auth = (window as unknown as { AppleID: Apple }).AppleID.auth
      auth.init({ clientId, scope: '', redirectURI: page, nonce, usePopup: true })
      return { auth, nonce }
    } catch {
      return undefined
    }
  }
  async function apple(clientId: string) {
    const btn = $<HTMLButtonElement>('acc-apple')
    let ready = await appleReady(clientId)
    btn.hidden = !ready
    btn.addEventListener('click', async () => {
      if (!ready) return
      btn.disabled = true
      try {
        const r = await ready.auth.signIn()
        const out = await signInWith('apple', r.authorization.id_token, ready.nonce)
        if (isFail(out)) say(problem(out), true)
        else await signedIn(out.user)
      } catch { /* the popup was closed */ }
      btn.disabled = false
      // A nonce is used once: a new one for the next try.
      if (!user) ready = await appleReady(clientId)
    })
  }

  // Email: a 6-digit code; the mail's link (#ma=…) finishes it in this browser.
  async function email() {
    const form = $<HTMLFormElement>('acc-email')
    form.hidden = false
    const box = form.querySelector<HTMLElement>('[data-turnstile]')!
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const address = (form.elements.namedItem('email') as HTMLInputElement).value.trim()
      if (!address) return
      if (!turnstile) {
        try {
          const ts = await loadTurnstile()
          const widget = ts.render(box, { sitekey, language: document.documentElement.lang, callback: t => { token = t; form.requestSubmit() }, 'expired-callback': () => (token = '') })
          turnstile = { ts, widget }
        } catch { say(problem({ error: 'turnstile' }), true); return }
      }
      if (!token) return
      const btn = form.querySelector('button')!
      btn.disabled = true
      const r = await emailStart(address, token, lang)
      btn.disabled = false
      token = ''
      turnstile.ts.reset(turnstile.widget)
      if (isFail(r)) { say(problem(r), true); return }
      flow = r.flow
      localStorage.setItem(PENDING, JSON.stringify({ flow, until: new Date(Date.now() + 15 * 60_000).toISOString() }))
      $('acc-code').hidden = false
      say(ct('Đã gửi mã tới {email}. Mở email và nhập mã, hoặc bấm link trong email trên trình duyệt này.', { email: address }))
      ;($('acc-code').querySelector('input') as HTMLInputElement).focus()
    })
    $('acc-code').addEventListener('submit', async e => {
      e.preventDefault()
      const code = ($('acc-code').querySelector('input') as HTMLInputElement).value.trim()
      flow ??= pendingFlow(localStorage, new Date())
      if (!/^\d{6}$/.test(code) || !flow) { say(problem({ error: 'bad_code' }), true); return }
      const r = await emailVerify(flow, code)
      if (isFail(r)) { say(problem(r), true); return }
      await signedIn(r.user)
    })
  }

  async function openWays() {
    const ways = $('acc-ways')
    if (!ways.hidden) return
    ways.hidden = false
    $('acc-open').setAttribute('aria-expanded', 'true')
    $('acc-open').hidden = true
    if (!providers) return
    await Promise.all([
      providers.google ? google(providers.google.clientId) : undefined,
      providers.apple ? apple(providers.apple.clientId) : undefined,
      providers.email ? email() : undefined,
    ])
  }

  $('acc-open').addEventListener('click', () => void openWays())
  $('acc-sync').addEventListener('click', () => void sync())
  $('acc-signout').addEventListener('click', async () => {
    const r = await signOut()
    if (isFail(r) && r.error !== 'signed_out') { say(problem(r), true); return }
    user = null
    show()
    say(ct('Đã đăng xuất. Các bể vẫn còn trên trình duyệt này.'))
    $('acc-open').hidden = false
    $('acc-open').focus()
  })
  $('acc-delete').addEventListener('click', async () => {
    if (!user || !confirm(ct('Xóa vĩnh viễn tài khoản và các bể trong tài khoản? Bể trên trình duyệt này vẫn còn.'))) return
    const btn = $<HTMLButtonElement>('acc-delete')
    btn.disabled = true
    let appleCode: { code: string; clientId: string; redirectUri: string } | undefined
    if (user.methods.some(m => m.kind === 'apple') && providers?.apple) {
      // Apple's rule: its sign-in is revoked first, from a fresh Apple sign-in.
      say(ct('Đăng nhập lại bằng Apple một lần để xác nhận xóa.'))
      const ready = await appleReady(providers.apple.clientId)
      try {
        const r = await ready!.auth.signIn()
        appleCode = { code: r.authorization.code, clientId: providers.apple.clientId, redirectUri: page }
      } catch { btn.disabled = false; say(ct('Chưa xóa: cần đăng nhập lại bằng Apple để xác nhận.'), true); return }
    }
    const r = await deleteAccount(appleCode)
    btn.disabled = false
    if (isFail(r)) { say(problem(r), true); return }
    user = null
    show()
    $('acc-open').hidden = false
    say(ct('Đã xóa tài khoản. Các bể vẫn còn trên trình duyệt này.'))
    $('acc-open').focus()
  })

  /** A change made here: synced a moment later. */
  const changed = () => {
    if (!user) return
    clearTimeout(timer)
    timer = setTimeout(() => void sync(), 1500)
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void sync() })

  void (async () => {
    const s = await getSession()
    if (!s?.accounts) return
    providers = s.providers
    sitekey = s.turnstileSitekey ?? ''
    section.hidden = false
    if (s.user) { await signedIn(s.user); return }
    show()
    // Back from the mail's link, in the browser that asked for the code.
    const code = codeInHash(location.hash)
    if (!code) return
    history.replaceState(null, '', location.pathname + location.search)
    const f = pendingFlow(localStorage, new Date())
    if (!f) { section.scrollIntoView(); say(ct('Link này cần mở trên đúng trình duyệt đã gửi mã. Hoặc nhập mã 6 số ở đó.'), true); return }
    flow = f
    const r = await emailVerify(f, code)
    section.scrollIntoView()
    if (isFail(r)) { say(problem(r), true); return }
    await signedIn(r.user)
  })()

  return { changed }
}
