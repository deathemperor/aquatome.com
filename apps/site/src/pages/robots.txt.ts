import type { APIRoute } from 'astro'
import { isStaging, robotsTxt } from '../lib/seo'

export const GET: APIRoute = ({ site }) => new Response(robotsTxt(isStaging(), site!.href), { headers: { 'content-type': 'text/plain' } })
