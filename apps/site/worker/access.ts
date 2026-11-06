import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/**
 * Cloudflare Access in front of the dashboard's host (dashboard-host.ts). Access lets only the people its policy allows
 * reach the host and signs each request it passes in a header; this checks that signature too, so the Worker never relies
 * on the Access app being there and set up right. ACCESS_TEAM_DOMAIN (<team>.cloudflareaccess.com) and ACCESS_AUD (the
 * app's audience tag) are wrangler vars. While either is empty nothing passes, and /_ab/ on the site stays the dashboard.
 */
export type AccessEnv = { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string }

const HEADER = 'cf-access-jwt-assertion'
/** Each team's published keys, fetched and cached by jose: 10 minutes, and at most one fetch in 30 s for a key it doesn't know. */
const keys = new Map<string, JWTVerifyGetKey>()
const keysOf = (issuer: string) => {
  let k = keys.get(issuer)
  if (!k) keys.set(issuer, k = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)))
  return k
}

/** Are both vars set? The dashboard's move to its host (dashboard.ts) and the host's opening hang on this one answer. */
export const accessOn = (env: AccessEnv) => Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD)

/** Does this request carry Access's token for this app: RS256 by the team's keys, its audience and issuer, not expired? Any doubt is no. */
export async function accessOk(req: Request, env: AccessEnv): Promise<boolean> {
  if (!accessOn(env)) return false
  const token = req.headers.get(HEADER)
  if (!token || token.length > 8192) return false
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN!.replace(/^https:\/\//, '').replace(/\/+$/, '')}`
  try {
    await jwtVerify(token, keysOf(issuer), { issuer, audience: env.ACCESS_AUD!, algorithms: ['RS256'], requiredClaims: ['exp'] })
    return true
  } catch {
    return false
  }
}
