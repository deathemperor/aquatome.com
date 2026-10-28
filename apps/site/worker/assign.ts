import { isSkin, SKINS, type Skin, type Weights } from './skins'

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|curl|wget|python|httpx|go-http|headless|lighthouse|pagespeed|monitor/i
const COOKIE = 'skin'
const MAX_AGE = 90 * 86_400

/** Crawlers (and clients that don't send accept-language, which real browsers always do) always get the default skin. */
export const skinCookie = (req: Request) => req.headers.get('cookie')?.match(/(?:^|;\s*)skin=([a-z]+)/)?.[1]

export const isBot = (ua: string | null, acceptLanguage: string | null) => !ua || !acceptLanguage || BOT.test(ua)

export function pickSkin(weights: Weights, r: number): Skin {
  const total = SKINS.reduce((t, s) => t + Math.max(0, weights[s] ?? 0), 0)
  if (total <= 0) return 'mix'
  let x = r * total
  for (const s of SKINS) {
    x -= Math.max(0, weights[s] ?? 0)
    if (x < 0) return s
  }
  return SKINS[SKINS.length - 1]!
}

const cookie = (skin: Skin | '', maxAge: number) => `${COOKIE}=${skin}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`

/** Bot → mix (never a cookie) > query override (QA) > existing cookie > weighted pick for a new visitor (weights read only then). */
export async function resolveSkin(req: Request, weights: () => Promise<Weights>, r: number): Promise<{ skin: Skin; setCookie?: string }> {
  if (isBot(req.headers.get('user-agent'), req.headers.get('accept-language'))) return { skin: 'mix' }
  const q = new URL(req.url).searchParams.get('skin')
  if (q === 'reset') return { skin: 'mix', setCookie: cookie('', 0) }
  if (isSkin(q)) return { skin: q, setCookie: cookie(q, MAX_AGE) }
  const current = skinCookie(req)
  if (isSkin(current)) return { skin: current }
  const skin = pickSkin(await weights(), r)
  return { skin, setCookie: cookie(skin, MAX_AGE) }
}
