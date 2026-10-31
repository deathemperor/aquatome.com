import { decodeJwt, importPKCS8, SignJWT } from 'jose'

/**
 * Apple's rule for deleting an account that signed in with Apple: revoke its Sign in with Apple tokens
 * (https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens). No token is kept here, so the app or page
 * asks the person to sign in with Apple once more and sends that fresh authorization code: it is exchanged for a refresh
 * token, which is revoked at once.
 *
 * The client secret is a short JWT signed with the Sign in with Apple key (APPLE_SIGNIN_KEY, a .p8 file's contents).
 */
export type AppleKeys = { teamId: string; keyId: string; key: string }
/** The Apple user (`sub`) whose tokens were revoked; undefined when Apple refused the code or the revoke. */
export type RevokeApple = (clientId: string, code: string, redirectUri?: string) => Promise<{ sub: string } | undefined>
type Fetch = (input: string, init: RequestInit) => Promise<Response>

const APPLE = 'https://appleid.apple.com'

export async function clientSecret(keys: AppleKeys, clientId: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keys.keyId })
    .setIssuer(keys.teamId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .setAudience(APPLE)
    .setSubject(clientId)
    .sign(await importPKCS8(keys.key, 'ES256'))
}

export function appleRevoker(keys: AppleKeys, fetcher: Fetch = (u, i) => fetch(u, i), clock = () => new Date()): RevokeApple {
  return async (clientId, code, redirectUri) => {
    const secret = await clientSecret(keys, clientId, clock())
    const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() })
    const got = await fetcher(`${APPLE}/auth/token`, form({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code', ...(redirectUri ? { redirect_uri: redirectUri } : {}) }))
    if (!got.ok) return undefined
    const tokens = (await got.json()) as { refresh_token?: string; id_token?: string }
    if (!tokens.refresh_token || !tokens.id_token) return undefined
    // Straight from Apple's token endpoint over TLS: its id_token can be read without checking the signature (OIDC 3.1.3.7).
    const sub = decodeJwt(tokens.id_token).sub
    const revoked = await fetcher(`${APPLE}/auth/revoke`, form({ client_id: clientId, client_secret: secret, token: tokens.refresh_token, token_type_hint: 'refresh_token' }))
    return revoked.ok && sub ? { sub } : undefined
  }
}
