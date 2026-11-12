import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Lang } from '@aq/schema'
import { putBackFile } from './gate'

/**
 * Breed pages the cycle's breed step (`pnpm engine localize-breeds`, two a language a cycle) takes first, in this order:
 * the Tết cards (25 Jan to 7 Feb) show them in Indonesian, Thai and Malay, and a page that fails reader fit leaves that
 * language's day without its fish (the chief of staff, 2026-11-12). A page there is written again from its facts, with what
 * the reader-fit check found in it (breeds.ts localizeBreed); one not there yet is written. Each once
 * (BREED_FIRST_STATE): the gate reads it in the same cycle, and one it gives its old text back, or holds, waits for the
 * chief of staff's word; one it couldn't read loses its mark (writer-records.ts) and is tried again.
 */
export const BREED_FIRST = [
  'id/breeds/koi', 'th/breeds/koi', 'ms/breeds/koi',
  'id/breeds/butterfly-koi', 'th/breeds/butterfly-koi', 'ms/breeds/butterfly-koi',
  'id/breeds/ranchu-goldfish', 'th/breeds/ranchu-goldfish',
  'id/breeds/ryukin-goldfish', 'th/breeds/ryukin-goldfish',
  'ms/breeds/ranchu-goldfish', 'ms/breeds/ryukin-goldfish',
] as const
export const BREED_FIRST_STATE = 'engine-state/_breed-first.json'
type Done = Record<string, { at: string }>

/** This language's listed breeds still to write, first, and those done that wait for the chief of staff's word. */
export async function breedFirst(root: string, lang: Lang): Promise<{ first: { id: string; redo: boolean }[]; waiting: string[] }> {
  const done = JSON.parse(await readFile(join(root, BREED_FIRST_STATE), 'utf8').catch(() => '{}')) as Done
  const first: { id: string; redo: boolean }[] = []
  const waiting: string[] = []
  for (const key of BREED_FIRST.filter(k => k.startsWith(`${lang}/`))) {
    const id = key.split('/')[2]!
    const page = JSON.parse(await readFile(join(root, 'content/breeds', id, `${lang}.json`), 'utf8').catch(() => 'null')) as { held?: { checks?: string[] } } | null
    if (!done[key]) { first.push({ id, redo: !!page }); continue }
    const back = JSON.parse(await readFile(join(root, putBackFile({ kind: 'breeds', id, lang })), 'utf8').catch(() => '{}')) as { at?: string; checks?: string[]; unread?: boolean }
    if (page?.held) waiting.push(`${key}: held${page.held.checks?.length ? ` for ${page.held.checks.join(', ')}` : ''}; waits for the chief of staff's word`)
    else if (back.at && !back.unread && Date.parse(back.at) >= Date.parse(done[key].at)) waiting.push(`${key}: the gate gave it its old text back${back.checks?.length ? ` for ${back.checks.join(', ')}` : ''}; waits for the chief of staff's word`)
  }
  return { first, waiting }
}

/** A listed breed written: done, unless the gate can't read it. */
export async function markBreedFirst(root: string, key: string, at: string): Promise<void> {
  const file = join(root, BREED_FIRST_STATE)
  const done = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Done
  done[key] = { at }
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(done).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
}

/**
 * The breed step's run in a language: the listed breeds first, each once and written again where the page is there, then
 * `rest` (each `write` skips a page already there unless `redo`); at most `limit` written. `only`: these alone.
 */
export async function breedRun<R extends object>(root: string, lang: Lang, rest: string[], write: (id: string, redo: boolean) => Promise<R>, o: { limit: number; redo?: boolean; only?: string[]; now?: () => Date }): Promise<{ waiting: string[]; results: R[] }> {
  const { first, waiting } = await breedFirst(root, lang)
  const listed = new Map(first.filter(f => rest.includes(f.id)).map(f => [f.id, f.redo]))
  const results: R[] = []
  let made = 0
  for (const id of o.only ?? [...new Set([...listed.keys(), ...rest])]) {
    if (made >= o.limit) break
    const r = await write(id, !!o.redo || !!listed.get(id))
    if (!('skipped' in r)) made++
    if (listed.has(id) && !('skipped' in r) && !('failed' in r)) await markBreedFirst(root, `${lang}/breeds/${id}`, (o.now ?? (() => new Date()))().toISOString())
    results.push(r)
  }
  return { waiting, results }
}
