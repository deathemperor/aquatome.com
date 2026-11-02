// AquaTomeCheck/1: our own browser checks (playwright.config.ts) and the app's test builds, on the live site after every deploy.
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|curl|wget|python|httpx|go-http|headless|lighthouse|pagespeed|monitor|aquatomecheck/i

/** Crawlers, tools and our own checks (and clients without accept-language, which real browsers always send): not counted as readers or clicks. */
export const isBot = (ua: string | null, acceptLanguage: string | null) => !ua || !acceptLanguage || BOT.test(ua)
