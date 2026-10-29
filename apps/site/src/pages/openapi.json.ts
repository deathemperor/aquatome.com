import type { APIRoute } from 'astro'
import { openApi } from '../lib/agents'

export const GET: APIRoute = ({ site }) => Response.json(openApi(site!.href))
