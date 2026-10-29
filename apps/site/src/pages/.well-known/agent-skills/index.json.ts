import type { APIRoute } from 'astro'
import { skillsIndex } from '../../../lib/agents'

export const GET: APIRoute = ({ site }) => Response.json(skillsIndex(site!.href))
