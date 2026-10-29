import type { APIRoute } from 'astro'
import { skillMd } from '../../../../lib/agents'

export const GET: APIRoute = ({ site }) => new Response(skillMd(site!.href), { headers: { 'content-type': 'text/markdown' } })
