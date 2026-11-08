import { SEGMENTS } from '@aq/schema/langs'
import { SITE_HOST, VI_SECTIONS } from './paths'
/**
 * Owner bar on every page (bottom right; src/owner/bar.ts): links to the admin pages, a "hide this page" button (or "bring
 * it back" on a taken-down page; not on the home page) and the report button. It shows only with the aq_owner=1 flag
 * cookie, set when the owner opens the dashboard; the flag grants nothing — the dashboard, the POST to /_ab/hidden and the
 * report (feedback.ts) check who it is themselves. Its links are /_ab/ whatever the Worker's vars say: pages are built
 * ahead, and /_ab/ answers for itself, as the dashboard or by a 301 to its own host (dashboard.ts).
 */
export const OWNER_COOKIE = 'aq_owner=1; Path=/; Max-Age=2592000; Secure; SameSite=Strict'
/** The flag as the dashboard's own host sets it: for the site's pages, where the bar and the checks for the owner's own visits read it. */
export const SITE_OWNER_COOKIE = `${OWNER_COOKIE}; Domain=${SITE_HOST}`
/** The owner's own visit, by that flag: not a reader, not a shop click. */
export const isOwnerVisit = (req: Request) => /(?:^|;\s*)aq_owner=1/.test(req.headers.get('cookie') ?? '')

/** A page of any language: the Vietnamese home page and its sections, and the pages under the other languages' prefixes (/id/, /th/). */
export const OWNER_PAGE = `^\\/(?:(?:${SEGMENTS}|${VI_SECTIONS.join('|')})\\/|$)`
/** A language's home page, which the owner bar can't hide. */
export const OWNER_HOME = `^\\/((${SEGMENTS})\\/)?$`

/** The owner's flag, as a page's script reads it: the owner bar, and the app's invitations while they're the owner's (app-switch.ts). */
export const OWNER_FLAG = '/(?:^|; )aq_owner=1/.test(document.cookie)'

/**
 * In every page, so as little as can be: with the flag, it fetches the owner bar (src/owner/bar.ts, built to /_owner/ by
 * scripts/owner-bundle.mjs). A reader's page loads nothing more.
 */
export const OWNER_SCRIPT = `(()=>{try{if(${OWNER_FLAG})import('/_owner/bar.js').catch(()=>{})}catch(e){}})()`
