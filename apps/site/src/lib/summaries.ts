import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { SummarySchema, type Summary } from '@aq/schema'

/** The approved AquaTome summary for a species, if any; drafts stay hidden until the owner approves them. */
export async function approvedSummary(id: string): Promise<Summary | undefined> {
  const root = process.env.CONTENT_ROOT ?? resolve(process.cwd(), '../../content')
  const raw = await readFile(join(root, 'summaries', `${id}.json`), 'utf8').catch(() => null)
  if (!raw) return undefined
  const s = SummarySchema.parse(JSON.parse(raw))
  return s.review === 'approved' ? s : undefined
}
