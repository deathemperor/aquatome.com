import { test as base, expect } from '@playwright/test'

/**
 * Every check runs offline from third parties (ads, analytics, video, photo hosts): only the site itself loads, so a
 * slow outside server can't fail a check. `errors` holds the page's uncaught exceptions and console errors (failed
 * loads of the blocked requests aside); a test can assert it is empty.
 */
export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page, baseURL }, use) => {
    const own = new URL(baseURL!).origin
    // The site's own visit beacon too: a check is not a reader.
    await page.route(url => url.origin !== own || url.pathname === '/_e', route => route.abort())
    const errors: string[] = []
    page.on('pageerror', e => errors.push(`exception: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push(`console: ${m.text()}`) })
    await use(errors)
  }, { auto: true }],
})
export { expect }

/** Text written in Vietnamese: letters only Vietnamese uses (lib/i18n isVietnamese, as a pattern). */
export const VIETNAMESE = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơư]/i
/** Vietnamese that belongs on other languages' pages: a decree's official number. */
export const VIETNAMESE_ALLOWED = [/\d+\/\d{4}\/NĐ-CP/g, /Tiếng Việt/g]
