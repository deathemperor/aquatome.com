import { loadTurnstile, type Turnstile } from './comments'
import { ct } from './ct'
import * as store from './tank-store'
import { addPasskey, codeInHash, deleteAccount, emailStart, emailVerify, getNonce, getSession, isFail, passkeyAddOptions, passkeyLoginOptions, PENDING, pendingFlow, signInWith, signInWithPasskey, signOut, syncOnce, type Fail, type Providers, type User } from './sync'

/**
 * "Đồng bộ giữa các thiết bị" on "Bể của tôi": optional sign-in and sync. The section stays hidden unless the server
 * offers accounts. Google's, Apple's and Turnstile's scripts load only when the reader asks to sign in, or to add a way
 * to sign in to the account (and Apple's when "Xóa tài khoản" opens for an account that signs in with Apple). Passkeys
 * use the browser's own prompt.
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
/** The AquaTome app's web view (apps/ios PageView's user agent). */
const IN_APP = /\bAquaTomeApp\//

// The passkey helper loads when a passkey button shows, so a press reaches the browser's prompt straight away.
let webauthnModule: Promise<typeof import('@simplewebauthn/browser')> | undefined
const webauthn = () => (webauthnModule ??= import('@simplewebauthn/browser').catch(e => { webauthnModule = undefined; throw e }))
const canPasskey = () => typeof window.PublicKeyCredential === 'function'
/** The reader closed the browser's passkey prompt, or let it time out: nothing to say. */
const closed = (e: unknown) => ['NotAllowedError', 'AbortError'].includes((e as Error | undefined)?.name ?? '')

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
  /** The sign-in buttons are set up once; each later opening only gives them fresh nonces. */
  let wired = false
  /** Opened from "Thêm cách đăng nhập": a way pressed is added to the account signed in here. */
  let linking = false
  const rearm: (() => Promise<void>)[] = []
  /** Apple, ready before "Xóa tài khoản vĩnh viễn" is pressed, so its popup opens straight from the click. */
  let appleForDelete: ReturnType<typeof appleReady> | undefined

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
    credential_in_use: ct('Cách đăng nhập này đã có tài khoản riêng. Để gộp: đăng xuất, đăng nhập bằng cách đó (các bể về trình duyệt này), xóa tài khoản đó, rồi đăng nhập lại tài khoản này và thêm nó.'),
    apple_already_linked: ct('Tài khoản này đã có một Apple ID khác.'),
    apple_other_account: ct('Đó là một Apple ID khác: đăng nhập bằng Apple ID của tài khoản này.'),
    apple_revoke_failed: ct('Apple chưa xác nhận được: thử lại.'),
    apple_reauth: ct('Chưa xóa: cần đăng nhập lại bằng Apple để xác nhận.'),
    bad_passkey: ct('Passkey này không mở được tài khoản nào: đăng nhập cách khác.'),
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
    $('acc-leave').hidden = !user
    const addKey = $('acc-passkey-add')
    addKey.hidden = !(user && providers?.passkey && canPasskey())
    if (!addKey.hidden) void webauthn().catch(() => {})
  }

  async function sync(first = false) {
    if (!user) return
    const who = user
    const btn = $<HTMLButtonElement>('acc-sync')
    btn.disabled = true
    const before = store.liveTanks(store.load()).length
    const r = await syncOnce(() => store.load())
    btn.disabled = false
    // Signed out, or the account deleted, while it was on its way: its answer is stale.
    if (user !== who) return
    if (isFail(r)) {
      if (r.error === 'signed_out') { signedOut(ct('Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ.'), true); return }
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

  function closeWays() {
    $('acc-ways').hidden = true
    $('acc-code').hidden = true
    for (const id of ['acc-open', 'acc-add']) {
      $(id).hidden = false
      $(id).setAttribute('aria-expanded', 'false')
    }
  }

  /** A sign-in, or a way to sign in added: the email sign-in waiting for its code is done, the ways close. */
  function finished() {
    localStorage.removeItem(PENDING)
    flow = undefined
    $<HTMLFormElement>('acc-email').reset()
    $<HTMLFormElement>('acc-code').reset()
    closeWays()
  }

  async function signedIn(u: User) {
    user = u
    finished()
    show()
    say('')
    await sync(true)
    $('acc-sync').focus()
  }

  /** A sign-in's answer. Signed in here already to that account: the way was added to it (the session goes on). */
  async function got(u: User) {
    if (!user || user.id !== u.id) { await signedIn(u); return }
    const had = new Set(user.methods.map(m => m.id))
    const added = u.methods.find(m => !had.has(m.id))
    user = u
    finished()
    show()
    const way = added && (KIND[added.kind] ?? added.kind)
    say(way ? ct('Đã thêm {way}: lần sau đăng nhập bằng {way} cũng vào tài khoản này.', { way }) : ct('Tài khoản này đã có cách đăng nhập đó.'))
    $('acc-add').focus()
  }

  /** Signed out here, elsewhere, or the account deleted: the sign-in button again, closed. */
  function signedOut(message: string, bad = false) {
    user = null
    clearTimeout(timer)
    appleForDelete = undefined
    $('acc-status').textContent = ''
    $<HTMLDetailsElement>('acc-leave').open = false
    show()
    closeWays()
    say(message, bad)
  }

  // Google: its button, with a nonce the server issued (used once).
  async function google(clientId: string) {
    const box = $('acc-google')
    try {
      await script('https://accounts.google.com/gsi/client')
      const g = (window as unknown as { google: Google }).google
      const arm = async () => {
        const nonce = await getNonce()
        if (!nonce) return false
        g.accounts.id.initialize({
          client_id: clientId, nonce, ux_mode: 'popup', itp_support: true,
          callback: async ({ credential }) => {
            const r = await signInWith('google', credential, nonce, linking)
            if (isFail(r)) { say(problem(r), true); void arm(); return }
            await got(r.user)
          },
        })
        return true
      }
      const armed = await arm()
      g.accounts.id.renderButton(box, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 320, locale: lang })
      box.hidden = !armed
      rearm.push(async () => { box.hidden = true; box.hidden = !(await arm()) })
    } catch {
      box.hidden = true
    }
  }

  // Apple: our button; its popup gives the identity token (sign-in) or a fresh code (deleting the account).
  async function appleReady(clientId: string): Promise<{ signIn: Apple['auth']['signIn']; nonce: string } | undefined> {
    try {
      await script(`https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/${APPLE_LOCALE[lang] ?? 'en_US'}/appleid.auth.js`)
      const nonce = await getNonce()
      if (!nonce) return undefined
      const auth = (window as unknown as { AppleID: Apple }).AppleID.auth
      const settings = { clientId, scope: '', redirectURI: page, nonce, usePopup: true }
      auth.init(settings)
      // Apple keeps one setting for the page, and the delete step sets its own: this nonce again, as the popup opens.
      return { nonce, signIn: () => { auth.init(settings); return auth.signIn() } }
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
        const r = await ready.signIn()
        const out = await signInWith('apple', r.authorization.id_token, ready.nonce, linking)
        if (isFail(out)) say(problem(out), true)
        else await got(out.user)
      } catch { /* the popup was closed */ }
      // A nonce is used once: a new one for the next try.
      if (!$('acc-ways').hidden) ready = await appleReady(clientId)
      btn.disabled = false
    })
    rearm.push(async () => {
      btn.disabled = true
      ready = await appleReady(clientId)
      btn.hidden = !ready
      btn.disabled = false
    })
  }

  // Email: a 6-digit code; the mail's link (#ma=…) finishes it in this browser.
  async function email() {
    const form = $<HTMLFormElement>('acc-email')
    form.hidden = false
    const box = form.querySelector<HTMLElement>('[data-turnstile]')!
    const btn = form.querySelector('button')!
    // Turnstile solves again after each reset: its token only sends the form when a press is waiting for it.
    let waiting = false
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const address = (form.elements.namedItem('email') as HTMLInputElement).value.trim()
      if (!address || btn.disabled) return
      if (!token) {
        waiting = true
        if (turnstile) return
        try {
          const ts = await loadTurnstile()
          const widget = ts.render(box, { sitekey, language: document.documentElement.lang, callback: t => { token = t; if (waiting) { waiting = false; form.requestSubmit() } }, 'expired-callback': () => (token = '') })
          turnstile = { ts, widget }
        } catch { waiting = false; say(problem({ error: 'turnstile' }), true) }
        return
      }
      waiting = false
      btn.disabled = true
      const r = await emailStart(address, token, lang, linking)
      btn.disabled = false
      token = ''
      turnstile?.ts.reset(turnstile.widget)
      if (isFail(r)) { say(problem(r), true); return }
      flow = r.flow
      localStorage.setItem(PENDING, JSON.stringify({ flow, until: new Date(Date.now() + 15 * 60_000).toISOString() }))
      $('acc-code').hidden = false
      say(ct('Đã gửi mã tới {email}. Mở email và nhập mã, hoặc bấm link trong email trên trình duyệt này.', { email: address }))
      ;($('acc-code').querySelector('input') as HTMLInputElement).focus()
    })
    const codeBtn = $('acc-code').querySelector('button')!
    $('acc-code').addEventListener('submit', async e => {
      e.preventDefault()
      if (codeBtn.disabled) return
      const code = ($('acc-code').querySelector('input') as HTMLInputElement).value.trim()
      flow ??= pendingFlow(localStorage, new Date())
      if (!/^\d{6}$/.test(code) || !flow) { say(problem({ error: 'bad_code' }), true); return }
      codeBtn.disabled = true
      const r = await emailVerify(flow, code)
      codeBtn.disabled = false
      if (isFail(r)) { say(problem(r), true); return }
      await got(r.user)
    })
  }

  // A passkey added to an account earlier, here or in the app: the browser asks for Face ID, a fingerprint or the PIN.
  function passkey() {
    const btn = $<HTMLButtonElement>('acc-passkey')
    void webauthn().catch(() => {})
    btn.addEventListener('click', async () => {
      if (btn.disabled) return
      btn.disabled = true
      say('')
      try {
        const { startAuthentication } = await webauthn()
        const options = await passkeyLoginOptions()
        if (isFail(options)) { say(problem(options), true); return }
        const r = await signInWithPasskey(await startAuthentication({ optionsJSON: options }))
        if (isFail(r)) say(problem(r), true)
        else await signedIn(r.user)
      } catch (e) {
        if (!closed(e)) say(problem({ error: 'failed' }), true)
      } finally {
        btn.disabled = false
      }
    })
  }

  async function openWays(link: boolean) {
    const ways = $('acc-ways')
    if (!ways.hidden) return
    linking = link
    ways.hidden = false
    $('acc-ways-add').hidden = !link
    const opener = $(link ? 'acc-add' : 'acc-open')
    opener.setAttribute('aria-expanded', 'true')
    opener.hidden = true
    if (!providers) return
    // A passkey is added with its own button ("Thêm passkey").
    $('acc-passkey').hidden = link || !(providers.passkey && canPasskey())
    if (wired) { await Promise.all(rearm.map(f => f())); return }
    wired = true
    await Promise.all([
      providers.google ? google(providers.google.clientId) : undefined,
      providers.apple ? apple(providers.apple.clientId) : undefined,
      providers.passkey && canPasskey() ? passkey() : undefined,
      providers.email ? email() : undefined,
    ])
  }

  $('acc-open').addEventListener('click', () => void openWays(false))
  $('acc-add').addEventListener('click', () => void openWays(true))
  $('acc-sync').addEventListener('click', () => void sync())
  $('acc-signout').addEventListener('click', async () => {
    const r = await signOut()
    if (isFail(r) && r.error !== 'signed_out') { say(problem(r), true); return }
    signedOut(ct('Đã đăng xuất. Các bể vẫn còn trên trình duyệt này.'))
    $('acc-open').focus()
  })
  $('acc-passkey-add').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('acc-passkey-add')
    if (!user || btn.disabled) return
    const who = user
    btn.disabled = true
    say('')
    try {
      const { startRegistration } = await webauthn()
      const options = await passkeyAddOptions()
      const r = isFail(options) ? options : await addPasskey(await startRegistration({ optionsJSON: options }))
      if (user !== who) return
      if (isFail(r)) {
        if (r.error === 'signed_out') signedOut(ct('Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ.'), true)
        else say(r.error === 'bad_passkey' ? ct('Chưa thêm được passkey: thử lại.') : problem(r), true)
        return
      }
      user = r.user
      show()
      say(ct('Đã thêm passkey. Lần sau bấm “Đăng nhập bằng passkey” rồi mở khóa bằng Face ID, vân tay hoặc mã PIN của máy.'))
    } catch (e) {
      // This device has a passkey of this account already (the server's excludeCredentials).
      if ((e as Error).name === 'InvalidStateError') say(ct('Máy này đã có passkey của tài khoản này.'))
      else if (!closed(e)) say(ct('Chưa thêm được passkey: thử lại.'), true)
    } finally {
      btn.disabled = false
    }
  })
  const hasApple = () => !!user?.methods.some(m => m.kind === 'apple') && !!providers?.apple
  const prepApple = () => { if (hasApple()) appleForDelete ??= appleReady(providers!.apple!.clientId) }
  $('acc-leave').addEventListener('toggle', e => { if ((e.target as HTMLDetailsElement).open) prepApple() })
  $('acc-delete').addEventListener('click', async () => {
    if (!user || !confirm(ct('Xóa vĩnh viễn tài khoản và các bể trong tài khoản? Bể trên trình duyệt này vẫn còn.'))) return
    const btn = $<HTMLButtonElement>('acc-delete')
    btn.disabled = true
    let appleCode: { code: string; clientId: string; redirectUri: string } | undefined
    if (hasApple()) {
      // Apple's rule: its sign-in is revoked first, from a fresh Apple sign-in.
      say(ct('Đăng nhập lại bằng Apple một lần để xác nhận xóa.'))
      prepApple()
      const ready = await appleForDelete
      try {
        if (!ready) throw new Error('apple')
        const r = await ready.signIn()
        appleCode = { code: r.authorization.code, clientId: providers!.apple!.clientId, redirectUri: page }
      } catch {
        // Not loaded, or the popup closed: ready again for the next press.
        if (!ready) appleForDelete = undefined
        prepApple()
        btn.disabled = false
        say(ct('Chưa xóa: cần đăng nhập lại bằng Apple để xác nhận.'), true)
        return
      }
    }
    const r = await deleteAccount(appleCode)
    btn.disabled = false
    if (isFail(r)) {
      if (r.error === 'signed_out') { signedOut(ct('Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ.'), true); return }
      // Apple added to the account on another device since this page loaded: Apple's step, on the next press.
      if (r.error === 'apple_reauth') {
        const s = await getSession()
        if (s?.accounts && s.user) { user = s.user; show() }
        prepApple()
      }
      say(problem(r), true)
      return
    }
    signedOut(ct('Đã xóa tài khoản. Các bể vẫn còn trên trình duyệt này.'))
    $('acc-open').focus()
  })

  /** A change made here: synced a moment later. */
  const changed = () => {
    if (!user) return
    clearTimeout(timer)
    timer = setTimeout(() => void sync(), 1500)
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void sync() })

  // Inside the app, the app signs in and syncs, and its bridge carries this page's tanks into it: no second sign-in
  // here, no session asked, no sign-in scripts (Google refuses embedded web views anyway).
  if (IN_APP.test(navigator.userAgent)) return { changed }

  void (async () => {
    const s = await getSession()
    if (!s?.accounts) return
    providers = s.providers
    sitekey = s.turnstileSitekey ?? ''
    section.hidden = false
    // Back from the mail's link, in the browser that asked for the code: a sign-in, or an address added to the account
    // signed in here. An email sign-in left unfinished is forgotten once it expires.
    const code = codeInHash(location.hash)
    const f = pendingFlow(localStorage, new Date())
    if (code) history.replaceState(null, '', location.pathname + location.search)
    if (s.user) await signedIn(s.user)
    else show()
    if (!code) return
    if (!f) { section.scrollIntoView(); say(ct('Link này cần mở trên đúng trình duyệt đã gửi mã. Hoặc nhập mã 6 số ở đó.'), true); return }
    flow = f
    const r = await emailVerify(f, code)
    section.scrollIntoView()
    if (isFail(r)) { say(problem(r), true); return }
    await got(r.user)
  })()

  return { changed }
}
