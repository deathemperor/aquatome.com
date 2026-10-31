import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose'
import { expect, test } from 'vitest'
import { appleRevoker, clientSecret } from '../accounts/apple'
import { cloudflareMailer, MAIL_FROM } from '../accounts/mailer'

const NOW = new Date('2026-11-01T00:00:00.000Z')
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
/** An id_token as Apple's token endpoint returns it (its signature isn't read: it came straight from Apple). */
const idTokenFor = (sub: string) => `${b64({ alg: 'RS256', kid: 'k' })}.${b64({ iss: 'https://appleid.apple.com', sub })}.sig`

async function keys() {
  const pair = await generateKeyPair('ES256', { extractable: true })
  return { pair, keys: { teamId: 'TEAM123456', keyId: 'KEY1234567', key: await exportPKCS8(pair.privateKey) } }
}

test("the client secret is Apple's ES256 JWT: our team, our key id, for one client, five minutes", async () => {
  const { pair, keys: k } = await keys()
  const jwt = await clientSecret(k, 'com.aquatome.web', NOW)
  const { payload, protectedHeader } = await jwtVerify(jwt, pair.publicKey, { audience: 'https://appleid.apple.com', currentDate: NOW })
  expect(protectedHeader).toEqual({ alg: 'ES256', kid: 'KEY1234567' })
  expect(payload).toMatchObject({ iss: 'TEAM123456', sub: 'com.aquatome.web' })
  expect(payload.exp! - payload.iat!).toBe(300)
})

test('revoking: the fresh code is exchanged, its refresh token revoked at once, and the Apple user returned', async () => {
  const { keys: k } = await keys()
  const calls: { url: string; form: URLSearchParams }[] = []
  const idToken = idTokenFor('apple-user-1')
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, form: new URLSearchParams(String(init.body)) })
    if (url.endsWith('/auth/token')) return Response.json({ refresh_token: 'r-1', access_token: 'a-1', id_token: idToken })
    return new Response(null, { status: 200 })
  }
  const revoke = appleRevoker(k, fetcher, () => NOW)
  expect(await revoke('com.aquatome.web', 'code-1', 'https://aquatome.com/vi/cong-cu/be-cua-toi/')).toEqual({ sub: 'apple-user-1' })
  expect(calls.map(c => c.url)).toEqual(['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke'])
  expect(Object.fromEntries(calls[0]!.form)).toMatchObject({ client_id: 'com.aquatome.web', code: 'code-1', grant_type: 'authorization_code', redirect_uri: 'https://aquatome.com/vi/cong-cu/be-cua-toi/' })
  expect(Object.fromEntries(calls[1]!.form)).toMatchObject({ client_id: 'com.aquatome.web', token: 'r-1', token_type_hint: 'refresh_token' })
  expect(calls[1]!.form.get('client_secret')).toBe(calls[0]!.form.get('client_secret'))
  // The app's code: no redirect_uri.
  calls.length = 0
  await revoke('com.aquatome.app', 'code-2')
  expect(calls[0]!.form.has('redirect_uri')).toBe(false)
})

test('a code Apple refuses, or a revoke that fails, revokes nothing and says so', async () => {
  const { keys: k } = await keys()
  const idToken = idTokenFor('s')
  const refused = appleRevoker(k, async () => Response.json({ error: 'invalid_grant' }, { status: 400 }), () => NOW)
  expect(await refused('com.aquatome.app', 'old')).toBeUndefined()
  const revokeFails = appleRevoker(k, async url => (url.endsWith('/auth/token') ? Response.json({ refresh_token: 'r', id_token: idToken }) : new Response(null, { status: 503 })), () => NOW)
  expect(await revokeFails('com.aquatome.app', 'c')).toBeUndefined()
})

test('sign-in mail goes out from dang-nhap@aquatome.com as text; a refusal is false and logs the code, not the address', async () => {
  const sent: unknown[] = []
  const ok = cloudflareMailer({ send: async m => { sent.push(m); return { messageId: 'm1' } } })
  expect(await ok({ to: 'reader@example.com', subject: 'S', text: 'T' })).toBe(true)
  expect(sent).toEqual([{ to: 'reader@example.com', from: MAIL_FROM, subject: 'S', text: 'T' }])
  expect(MAIL_FROM.email).toBe('dang-nhap@aquatome.com')

  const logged: unknown[][] = []
  const bad = cloudflareMailer({ send: async () => { throw Object.assign(new Error('nope reader@example.com'), { code: 'E_RECIPIENT_SUPPRESSED' }) } }, (...a) => logged.push(a))
  expect(await bad({ to: 'reader@example.com', subject: 'S', text: 'T' })).toBe(false)
  expect(JSON.stringify(logged)).toContain('E_RECIPIENT_SUPPRESSED')
  expect(JSON.stringify(logged)).not.toContain('reader@example.com')
})
