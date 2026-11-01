import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type AuthenticatorTransport, type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { decodeClientDataJSON, isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers'
import { consume } from './email'
import { sha256 } from './session'

/**
 * Passkeys (WebAuthn). A passkey is added to an account that already signs in another way (Apple, Google, an email
 * code), so every account keeps a way back in; after that it signs in on its own. Discoverable credentials, user
 * verification required (Face ID, a fingerprint, the device PIN), no attestation asked for or kept: the server holds a
 * credential id, its public key, its signature counter and transports. The relying party is this site's host; the
 * iOS app's passkeys are the same through its webcredentials association (/.well-known/apple-app-site-association).
 */
export type Rp = { id: string; origin: string }

/**
 * /.well-known/apple-app-site-association: the iOS app (team Q783W6B4FA, com.aquatome.app) may use this site's passkeys.
 * Apple fetches it from aquatome.com itself, as JSON, with no redirect; the app declares webcredentials:aquatome.com.
 */
export const APP_SITE_ASSOCIATION = { webcredentials: { apps: ['Q783W6B4FA.com.aquatome.app'] } }
const ALGS = [-7, -257] // ES256, RS256
const TRANSPORTS = new Set<string>(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])
const TTL_MS = 5 * 60_000

type Row = { subject: string; user_id: string; public_key: string; counter: number; transports: string | null }
const transportsOf = (s: string | null) => (s ? (JSON.parse(s) as AuthenticatorTransport[]) : undefined)

/** The challenge a response answers (from its clientDataJSON), if it has one. */
function challengeOf(r: unknown): string | undefined {
  try {
    const c = decodeClientDataJSON((r as { response: { clientDataJSON: string } }).response.clientDataJSON).challenge
    return typeof c === 'string' && c.length <= 128 ? c : undefined
  } catch {
    return undefined
  }
}

async function keep(db: D1Database, kind: 'passkey-login' | 'passkey-register', challenge: string, userId: string | null, now: Date) {
  await db.prepare(`INSERT INTO auth_challenges (id, kind, value, user_id, expires_at) VALUES (?, ?, '', ?, ?)`)
    .bind(await sha256(challenge), kind, userId, new Date(now.getTime() + TTL_MS).toISOString()).run()
}

/** To add a passkey to the account signed in: not one of the passkeys it has already (excludeCredentials). */
export async function registrationOptions(db: D1Database, rp: Rp, userId: string, now: Date) {
  const { results } = await db.prepare(`SELECT subject, transports FROM credentials WHERE user_id = ? AND kind = 'passkey'`).bind(userId).all<Pick<Row, 'subject' | 'transports'>>()
  const options = await generateRegistrationOptions({
    rpName: 'AquaTome', rpID: rp.id,
    // No name or address is kept: the passkey manager shows "AquaTome" and a short part of the account's random id.
    userName: `AquaTome ${userId.slice(0, 8)}`, userDisplayName: 'AquaTome', userID: isoUint8Array.fromUTF8String(userId),
    attestationType: 'none', supportedAlgorithmIDs: ALGS, timeout: TTL_MS,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: results.map(c => ({ id: c.subject, ...(c.transports ? { transports: transportsOf(c.transports) } : {}) })),
  })
  await keep(db, 'passkey-register', options.challenge, userId, now)
  return options
}

/** Adds the new passkey to the account that asked for its options. 'in_use': it belongs to an account already. */
export async function addPasskey(db: D1Database, rp: Rp, userId: string, response: unknown, now: Date): Promise<'ok' | 'bad_passkey' | 'in_use'> {
  const challenge = challengeOf(response)
  const asked = challenge ? await consume(db, 'passkey-register', challenge, now) : undefined
  if (!asked || asked.userId !== userId) return 'bad_passkey'
  let info
  try {
    const v = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON, expectedChallenge: challenge!, expectedOrigin: rp.origin, expectedRPID: rp.id,
      requireUserVerification: true, supportedAlgorithmIDs: ALGS,
    })
    if (!v.verified) return 'bad_passkey'
    info = v.registrationInfo
  } catch {
    return 'bad_passkey'
  }
  const { id, publicKey, counter } = info.credential
  // WebAuthn: a credential id is at most 1023 bytes.
  if (isoBase64URL.toBuffer(id).length > 1023) return 'bad_passkey'
  // As the browser sent them: a list, and only the names WebAuthn knows are kept.
  const sent: unknown = info.credential.transports
  const transports = Array.isArray(sent) ? sent.filter((t): t is AuthenticatorTransport => TRANSPORTS.has(t)) : undefined
  try {
    await db.prepare(`INSERT INTO credentials (id, user_id, kind, subject, public_key, counter, transports, created_at) VALUES (?, ?, 'passkey', ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, id, isoBase64URL.fromBuffer(publicKey), counter, transports?.length ? JSON.stringify(transports) : null, now.toISOString()).run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) return 'in_use' // UNIQUE (kind, subject): on an account already
    throw e
  }
  return 'ok'
}

/** To sign in with a passkey: any passkey of this site the device has (discoverable, no list of ids). */
export async function loginOptions(db: D1Database, rp: Rp, now: Date) {
  const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: 'required', timeout: TTL_MS })
  await keep(db, 'passkey-login', options.challenge, null, now)
  return options
}

/** The account a passkey signs in to, when the signature is good for one of our challenges; its counter moves on. */
export async function checkPasskey(db: D1Database, rp: Rp, response: unknown, now: Date): Promise<string | undefined> {
  const r = response as AuthenticationResponseJSON
  const challenge = challengeOf(r)
  if (!challenge || typeof r.id !== 'string' || !(await consume(db, 'passkey-login', challenge, now))) return undefined
  const row = await db.prepare(`SELECT subject, user_id, public_key, counter, transports FROM credentials WHERE kind = 'passkey' AND subject = ?`).bind(r.id).first<Row>()
  if (!row) return undefined
  // A passkey made for this account carries its id as the user handle.
  if (r.response.userHandle && r.response.userHandle !== isoBase64URL.fromUTF8String(row.user_id)) return undefined
  let newCounter: number
  try {
    const v = await verifyAuthenticationResponse({
      response: r, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.id, requireUserVerification: true,
      // Synced passkeys (iCloud Keychain, Google Password Manager) always say 0; a counter that goes back is refused.
      credential: { id: row.subject, publicKey: isoBase64URL.toBuffer(row.public_key), counter: row.counter, ...(row.transports ? { transports: transportsOf(row.transports) } : {}) },
    })
    if (!v.verified) return undefined
    newCounter = v.authenticationInfo.newCounter
  } catch {
    return undefined
  }
  // A counter that moves on moves past the one stored now, not the one read before: two answers with the same counter at
  // once (a cloned key) sign in once. Synced passkeys say 0, always.
  const moved = await db.prepare(`UPDATE credentials SET counter = ?1, last_used_at = ?2 WHERE kind = 'passkey' AND subject = ?3 AND (?1 = 0 OR counter < ?1)`)
    .bind(newCounter, now.toISOString(), row.subject).run()
  if (!moved.meta.changes) return undefined
  return row.user_id
}
