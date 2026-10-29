const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|curl|wget|python|httpx|go-http|headless|lighthouse|pagespeed|monitor/i

/** Crawlers and tools (and clients without accept-language, which real browsers always send): not counted as readers or clicks. */
export const isBot = (ua: string | null, acceptLanguage: string | null) => !ua || !acceptLanguage || BOT.test(ua)
