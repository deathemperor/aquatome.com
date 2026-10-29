import type { APIRoute } from 'astro'
import { llmsTxt } from '../lib/agents'

export const GET: APIRoute = ({ site }) => new Response(llmsTxt(site!.href), { headers: { 'content-type': 'text/plain' } })
