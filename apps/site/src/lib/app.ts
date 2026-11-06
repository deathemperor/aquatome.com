import { OWNER_FLAG } from '../../worker/owner'
import { APP_PAGES, APP_PT, APP_STORE_ID, appState, type AppState } from '../../worker/app-switch'
import { SUPPORTED } from '../scripts/chihiros'
import type { Product } from './products'

/**
 * The site's invitations to the iPhone and iPad app. Every one reads this file, and the switch is worker/app-switch.ts
 * (off, owner, on: what each shows is written there). Tests: test/app-invite.test.ts, e2e/app-invite.spec.ts.
 *
 * A link carries one campaign code per placement, so App Store Connect counts installs per placement and the site
 * tracks nothing new. They are not rel=sponsored: the readers' beacon counts those clicks (Base.astro).
 */
export { APP_PAGES, APP_PT, APP_STORE_ID, type AppState }
/** This build's state: the switch, or a check's build of another (`APP_INVITE_STATE`, package.json's test). */
export const APP_STATE: AppState = appState(process.env.APP_INVITE_STATE)

export type AppPlacement = 'site-light-tool' | 'site-product' | 'site-tanks' | 'site-app-page' | 'site-app-qr'
export const storeLink = (ct: AppPlacement, pt: string | null = APP_PT) => `https://apps.apple.com/app/id${APP_STORE_ID}?${pt ? `pt=${pt}&` : ''}ct=${ct}&mt=8`
/**
 * A page in the app (its aquatome:// scheme, as the native lead set it): the whole address, path, query and hash, always
 * https on aquatome.com, whatever host serves this copy (the app refuses ports, user info and other hosts). `here`: the
 * page's own path, query and hash. The page's script builds the same (APP_LINK) from where the reader is now.
 */
export const openInApp = (here: string) => `aquatome://open?url=${encodeURIComponent(`https://aquatome.com${here}`)}`
const APP_LINK = `'aquatome://open?url='+encodeURIComponent('https://aquatome.com'+location.pathname+location.search+location.hash)`

/** The app page's address, as links are written. */
export const APP_PAGE = '/vi/ung-dung/'

/**
 * The check beside a hidden invitation, which it unhides: an iPhone or iPad (iPadOS says it's a Mac, with touch), never
 * the app's own web view (AquaTomeApp/, as scripts/account-panel.ts reads it), and while the switch is 'owner', only with
 * the owner's flag. Then "Mở trong ứng dụng" takes the page's whole address, again at each tap: a tool keeps what the
 * reader set in its query and hash. It reads; it stores nothing.
 */
export const inviteCheck = (state: AppState = APP_STATE) =>
  `(function(){var u=navigator.userAgent,el=document.currentScript.previousElementSibling;if(${state === 'owner' ? `${OWNER_FLAG}&&` : ''}!/AquaTomeApp\\//.test(u)&&(/iP(hone|ad|od)/.test(u)||/Macintosh/.test(u)&&navigator.maxTouchPoints>1)){el.hidden=false${state === 'owner' ? `;var a=el.querySelector('.open-app');if(a){var f=function(){a.href=${APP_LINK}};f();a.addEventListener('click',f)}` : ''}}})()`
/** Puts the owner's lines in the page from the <template> before it (OwnerOnly.astro), only with the owner's flag. */
export const ownerReveal = `(function(){var t=document.currentScript.previousElementSibling;if(${OWNER_FLAG})t.replaceWith(t.content)})()`

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
