import { defineMiddleware } from 'astro:middleware'
import { langOf, localizeLinks } from './lib/i18n'
import { noCookiesHtml } from './lib/no-cookies'

/**
 * Every page: its Wikimedia pictures asked for without cookies (lib/no-cookies.ts). A page in another language than
 * Vietnamese: its /vi/… links (written once, for every language) point at its own language.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const res = await next()
  if (!res.headers.get('content-type')?.startsWith('text/html')) return res
  const lang = langOf(ctx.url)
  const html = noCookiesHtml(await res.text())
  return new Response(lang === 'vi' ? html : localizeLinks(html, lang, ctx.site?.origin ?? ''), res)
})
