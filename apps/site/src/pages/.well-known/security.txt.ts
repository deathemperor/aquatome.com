import type { APIRoute } from 'astro'
import { securityTxt } from '../../lib/site'

export const GET: APIRoute = ({ site }) => new Response(securityTxt(site!.href, new Date()), { headers: { 'content-type': 'text/plain' } })
