/**
 * The app's install code (its telemetry batches' `install`, protocols/app-telemetry.openapi.json): kept, and the privacy
 * page's paragraph on it shown, from the app build that sends it (approved 2026-11-08). The Worker accepts the field either
 * way, so a build that sends it before then loses nothing but the code. A plain module: the site and the Worker both import it.
 */
export const APP_INSTALL_ID = false
