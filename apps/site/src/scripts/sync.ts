import type { TankStore } from '@aq/schema'
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/browser'
import { mergeStores } from '@aq/schema/tank-rules'

/**
 * The browser's side of accounts (protocols/accounts.openapi.json): the session, signing in, and syncing "Bể của tôi"
 * with the account. Every call answers instead of throwing: offline or refused, the page carries on with the tanks it
 * has in this browser.
 */
export type Method = { id: string; kind: 'apple' | 'google' | 'passkey' | 'email'; createdAt: string; lastUsedAt: string | null }
export type User = { id: string; createdAt: string | null; methods: Method[] }
export type Providers = { google: { clientId: string } | null; apple: { clientId: string } | null; email: boolean; passkey: boolean }
export type Session = { accounts: false } | { accounts: true; providers: Providers; turnstileSitekey: string | null; user: User | null }
export type Fail = { error: string }
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const failed = (e: unknown): Fail => ({ error: e instanceof TypeError ? 'offline' : 'failed' })
async function call<T>(f: Fetch, method: string, path: string, body?: unknown): Promise<T | Fail> {
  try {
    const r = await f(path, { method, credentials: 'same-origin', ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    if (r.status === 204) return {} as T
    const data = (await r.json().catch(() => ({}))) as T & Partial<Fail>
    return r.ok ? data : { error: data.error ?? `http_${r.status}` }
  } catch (e) {
    return failed(e)
  }
}
export const isFail = (x: unknown): x is Fail => typeof (x as Fail | undefined)?.error === 'string'

export async function getSession(f: Fetch = fetch): Promise<Session | undefined> {
  const s = await call<Session>(f, 'GET', '/api/v1/session')
  return isFail(s) ? undefined : s
}

/** A one-time nonce for a Google or Apple sign-in (valid 10 minutes): fetched when the reader opens sign-in. */
export async function getNonce(f: Fetch = fetch): Promise<string | undefined> {
  const r = await call<{ nonce: string }>(f, 'POST', '/api/v1/auth/nonce', {})
  return isFail(r) ? undefined : r.nonce
}

/** `link`: add this way to sign in to the account signed in here, instead of signing in with it. */
export const signInWith = (provider: 'google' | 'apple', idToken: string, nonce: string, link = false, f: Fetch = fetch) =>
  call<{ user: User }>(f, 'POST', `/api/v1/auth/${provider}`, { idToken, nonce, client: 'web', ...(link ? { link } : {}) })

export const emailStart = (email: string, turnstile: string, lang: string, link = false, f: Fetch = fetch) =>
  call<{ flow: string }>(f, 'POST', '/api/v1/auth/email/start', { email, turnstile, lang, client: 'web', ...(link ? { link } : {}) })

export const emailVerify = (flow: string, code: string, f: Fetch = fetch) =>
  call<{ user: User }>(f, 'POST', '/api/v1/auth/email/verify', { flow, code, client: 'web' })

/** Passkeys: a challenge to sign in with any passkey of this site, then the browser's signed answer. */
export const passkeyLoginOptions = (f: Fetch = fetch) => call<PublicKeyCredentialRequestOptionsJSON>(f, 'POST', '/api/v1/auth/passkey/options', {})
export const signInWithPasskey = (response: AuthenticationResponseJSON, f: Fetch = fetch) =>
  call<{ user: User }>(f, 'POST', '/api/v1/auth/passkey', { response, client: 'web' })

/** Adding a passkey to the account signed in: its options, then the new passkey. */
export const passkeyAddOptions = (f: Fetch = fetch) => call<PublicKeyCredentialCreationOptionsJSON>(f, 'POST', '/api/v1/account/passkey/options', {})
export const addPasskey = (response: RegistrationResponseJSON, f: Fetch = fetch) => call<{ user: User }>(f, 'POST', '/api/v1/account/passkey', { response })

export const signOut = (f: Fetch = fetch) => call<object>(f, 'POST', '/api/v1/auth/logout', {})

/**
 * The email sign-in waiting for its code, kept in localStorage: the mail's link opens a new tab of this browser, which
 * finishes it. Never the address: only the flow secret, until it expires.
 */
export const PENDING = 'aq.signin'
export type Pending = { flow: string; until: string }
export function pendingFlow(storage: Pick<Storage, 'getItem' | 'removeItem'>, now: Date): string | undefined {
  try {
    const p = JSON.parse(storage.getItem(PENDING) ?? 'null') as Pending | null
    if (p && typeof p.flow === 'string' && p.until > now.toISOString()) return p.flow
  } catch { /* unreadable: none */ }
  storage.removeItem(PENDING)
  return undefined
}
/** The 6-digit code in the mail's link (`#ma=123456`), if this address has one. */
export const codeInHash = (hash: string) => /^#ma=(\d{6})$/.exec(hash)?.[1]

/**
 * Sends this browser's store and takes back the account's, merged with what changed here meanwhile. Another sync of
 * the same account in progress (409 busy): tries again a little later, three times.
 */
export async function syncOnce(local: () => TankStore, f: Fetch = fetch, wait = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<{ store: TankStore; refused: number } | Fail> {
  for (let attempt = 0; ; attempt++) {
    const r = await call<{ store: TankStore; refused: unknown[] }>(f, 'POST', '/api/v1/tanks/sync', { store: local() })
    if (isFail(r) && r.error === 'busy' && attempt < 3) { await wait(500 * 2 ** attempt); continue }
    if (isFail(r)) return r
    return { store: mergeStores(local(), r.store), refused: r.refused?.length ?? 0 }
  }
}

/** Deletes the account. With Sign in with Apple on it, a fresh Apple authorization code (protocols/accounts.openapi.json). */
export const deleteAccount = (apple?: { code: string; clientId: string; redirectUri: string }, f: Fetch = fetch) =>
  call<object>(f, 'DELETE', '/api/v1/account', apple ? { apple } : undefined)
