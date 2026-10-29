import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { TraitsSchema, type Traits } from '@aq/schema'

let cache: Promise<Map<string, Traits>> | undefined

/** Behaviour traits by species id (content/traits/, written by `pnpm engine traits`). */
export function getTraits(): Promise<Map<string, Traits>> {
  cache ??= (async () => {
    const dir = join(process.env.CONTENT_ROOT ?? resolve(process.cwd(), '../../content'), 'traits')
    const files = (await readdir(dir).catch(() => [] as string[])).filter(f => f.endsWith('.json'))
    const all = await Promise.all(files.map(async f => TraitsSchema.parse(JSON.parse(await readFile(join(dir, f), 'utf8')))))
    return new Map(all.map(t => [t.id, t]))
  })()
  return cache
}
