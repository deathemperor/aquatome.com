import { defineMiddleware } from 'astro:middleware'
import { langOf, localizeLinks } from './lib/i18n'

/** A page in another language than Vietnamese: its /vi/… links (written once, for every language) point at its own language. */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const res = await next()
  const lang = langOf(ctx.url)
  if (lang === 'vi' || !res.headers.get('content-type')?.startsWith('text/html')) return res
  return new Response(localizeLinks(await res.text(), lang, ctx.site?.origin ?? ''), res)
})
