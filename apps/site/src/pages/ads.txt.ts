import type { APIRoute } from 'astro'
import { ADSENSE_CLIENT, adsTxt } from '../lib/site'

export const GET: APIRoute = () => new Response(adsTxt(ADSENSE_CLIENT), { headers: { 'content-type': 'text/plain' } })
