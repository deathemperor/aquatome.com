import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** Sign in with Apple and Google: the ID token the provider gave the page or the app, checked here. */
export type Provider = 'apple' | 'google'
export type IdClaims = { sub: string; email?: string; emailVerified: boolean; nonce?: string }
export type VerifyIdToken = (provider: Provider, token: string, audiences: string[]) => Promise<IdClaims | undefined>

const ISSUERS: Record<Provider, string[]> = { apple: ['https://appleid.apple.com'], google: ['https://accounts.google.com', 'accounts.google.com'] }
const KEYS_URL: Record<Provider, string> = { apple: 'https://appleid.apple.com/auth/keys', google: 'https://www.googleapis.com/oauth2/v3/certs' }

/** The token's signature (the provider's published keys, RS256 only), issuer, audience (our client ids) and expiry. */
export function idTokenVerifier(keys: Record<Provider, JWTVerifyGetKey>): VerifyIdToken {
  return async (provider, token, audiences) => {
    if (!audiences.length || token.length > 8192) return undefined
    try {
      const { payload } = await jwtVerify(token, keys[provider], { issuer: ISSUERS[provider], audience: audiences, algorithms: ['RS256'], clockTolerance: 60, requiredClaims: ['sub', 'exp', 'iat'] })
      if (typeof payload.sub !== 'string' || !payload.sub) return undefined
      // Apple sends email_verified as "true" (a string) in some tokens.
      const verified = payload.email_verified === true || payload.email_verified === 'true'
      return {
        sub: payload.sub, emailVerified: verified,
        ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
        ...(typeof payload.nonce === 'string' ? { nonce: payload.nonce } : {}),
      }
    } catch {
      return undefined
    }
  }
}

let live: VerifyIdToken | undefined
/** The real verifier: keys fetched from Apple and Google and cached by jose. */
export const verifyIdToken: VerifyIdToken = (...a) => (live ??= idTokenVerifier({ apple: createRemoteJWKSet(new URL(KEYS_URL.apple)), google: createRemoteJWKSet(new URL(KEYS_URL.google)) }))(...a)
