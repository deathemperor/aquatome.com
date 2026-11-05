import { SUPPORTED } from '../scripts/chihiros'
import type { Product } from './products'

/**
 * The site's invitations to the iPhone and iPad app (bundle com.aquatome.app). Every one reads this file, and while the
 * switch is off the build has none of them: no meta, no markup, no page, no link (test/app-invite.test.ts).
 *
 * Launch day: LAUNCHED = true, and APP_PT once the owner has it (App Store Connect's campaign link generator).
 * A link carries one campaign code per placement, so App Store Connect counts installs per placement and the site
 * tracks nothing new. They are not rel=sponsored: the readers' beacon counts those clicks (Base.astro).
 */
const LAUNCHED = false
/** On, or a check's build of the on state before launch (`APP_INVITE_PREVIEW=1`, package.json's test). */
export const APP_ON = LAUNCHED || process.env.APP_INVITE_PREVIEW === '1'
export const APP_STORE_ID = '6829188547'
export const APP_PT: string | null = null

export type AppPlacement = 'site-light-tool' | 'site-product' | 'site-tanks' | 'site-app-page' | 'site-app-qr'
export const storeLink = (ct: AppPlacement, pt: string | null = APP_PT) => `https://apps.apple.com/app/id${APP_STORE_ID}?${pt ? `pt=${pt}&` : ''}ct=${ct}&mt=8`

/** The app page's address, as links are written. */
export const APP_PAGE = '/vi/ung-dung/'

/** The app's screens on its page, in order. None until the App Store set is shot again; none shows nothing. No people. */
export const APP_SCREENSHOTS: { src: string; width: number; height: number; alt: string }[] = []

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const LIGHTS = new Set(SUPPORTED.map(norm))
/**
 * What the app controls of a product in the catalog, from its data: a Chihiros light whose model is one the app and the
 * site's light tool drive (SUPPORTED, the whole name: "C" is not "C II"), or a Smart Life (Tuya) power strip.
 */
export function appDevice(p: Pick<Product, 'brand' | 'model' | 'category' | 'type' | 'specs' | 't'>): 'light' | 'strip' | undefined {
  if (norm(p.brand) === 'chihiros' && p.category === 'den' && LIGHTS.has(norm(p.model))) return 'light'
  const words = [p.brand, p.model, p.type, p.t.name, ...p.specs.map(s => s.value)].join(' ')
  return /\b(smart ?life|tuya)\b/i.test(words) && /\b(strip|plug|socket|outlet)\b|ổ cắm/i.test(words) ? 'strip' : undefined
}
