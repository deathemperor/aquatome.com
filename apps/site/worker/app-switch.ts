/**
 * The iPhone and iPad app's switch (bundle com.aquatome.app). The site's invitations to it (src/lib/app.ts) and the
 * Worker's answer for its page both read it. A plain module, as paths.ts is: the site and the Worker both import it.
 *
 * - off: none of it is in the build.
 * - owner: built and hidden. The owner (the aq_owner flag cookie, worker/owner.ts) sees it on an iPhone or iPad, with
 *   "Mở trong ứng dụng" to open the page in the app they already have. The app page is out of search, and the Worker
 *   answers it 404 to anyone else.
 * - on: shown to every reader on an iPhone or iPad. Launch day: 'on', and APP_PT once the owner has it (App Store
 *   Connect's campaign link generator).
 */
export type AppState = 'off' | 'owner' | 'on'
export const APP_SWITCH: AppState = 'owner'
export const APP_STORE_ID = '6829188547'
export const APP_PT: string | null = null

/** A check's build of another state (APP_INVITE_STATE, apps/site/package.json's test); anything else is the switch's. */
export const appState = (preview?: string): AppState => (preview === 'off' || preview === 'owner' || preview === 'on' ? preview : APP_SWITCH)

/** The app page in each language, as built (src/pages/ung-dung/, and lib/i18n's words for the section). */
export const APP_PAGES = ['/ung-dung/', '/id/aplikasi/', '/th/mobile-app/'] as const

/** The Worker answers 404 here: the app page and its files, while the switch is 'owner', to anyone but the owner. */
export const appPageClosed = (path: string, cookie: string | null, state: AppState = APP_SWITCH) =>
  state === 'owner' &&
  APP_PAGES.some(p => path === p || path === `${p}index.html` || path === `${p}index.md`) &&
  !/(?:^|;\s*)aq_owner=1(?:;|$)/.test(cookie ?? '')
