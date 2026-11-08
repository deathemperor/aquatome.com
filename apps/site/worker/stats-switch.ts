/**
 * The visitor code and the click hook, approved on 2026-11-08 with the privacy page's text: one switch for the beacon
 * (src/lib/beacon.ts), the Worker (index.ts events, which keeps the code only with it on) and the privacy page, so the page
 * says what the beacon does in the same deploy. Off until review and tests pass; then on, and checked on the live site.
 * A plain module: the site and the Worker both import it.
 */
export const VISITOR_STATS = false
/**
 * The app's install code (its telemetry batches' `install`, protocols/app-telemetry.openapi.json): kept, and the privacy
 * page's paragraph on it shown, from the app build that sends it (approved 2026-11-08). The Worker accepts the field either
 * way, so a build that sends it before then loses nothing but the code.
 */
export const APP_INSTALL_ID = false
