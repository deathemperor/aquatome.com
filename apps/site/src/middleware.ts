import { defineMiddleware } from 'astro:middleware'
import { langOf, localizeLinks } from './lib/i18n'

/**
 * Every page's /vi/… links (written once, for every language) point at its own language's pages: the root on a
 * Vietnamese page, /id/… and /th/… on the others. Absolute ones too, on the build's site and on aquatome.com, the
 * address content is written with.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const res = await next()
  if (!res.headers.get('content-type')?.startsWith('text/html')) return res
  return new Response(localizeLinks(await res.text(), langOf(ctx.url), [ctx.site?.origin ?? '', 'https://aquatome.com']), res)
})
