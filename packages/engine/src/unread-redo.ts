import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import outage from './unread-2026-11-11.json'

/** One record the 11 Nov 2026 outage left. `was` is null when the file had no entry before that cycle. */
export type UnreadRecord = { file: string; key: string; now: unknown; was: unknown }

const label = (r: UnreadRecord) => `${r.file}:${r.key}`

/** Structural equality, so a record matches whatever order its fields were saved in. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]))
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  return ak.length === bk.length && ak.every(k => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/**
 * The text that file's own writer saves, so a restore changes only the entries it puts back: the Vietnamese rewrite
 * keeps the order it read (vi-backfill.ts), the translator sorts entries the way `Array#sort` does (localize.ts), and
 * a source record sorts its keys (state.ts). Two-space indent and a final newline, as each of them writes.
 */
function written(file: string, data: Record<string, unknown>): string {
  const name = file.startsWith('engine-state/') ? file.slice('engine-state/'.length) : file
  if (name === 'vi-rewrite.json') return `${JSON.stringify(data, null, 2)}\n`
  const sorted = name.startsWith('localize-')
    ? Object.fromEntries(Object.entries(data).sort())
    : Object.fromEntries(Object.keys(data).sort().map(k => [k, data[k]]))
  return `${JSON.stringify(sorted, null, 2)}\n`
}

/**
 * Where a record is still exactly what the 11 Nov 2026 outage left (`now`), put back what it was before that cycle
 * (`was`), or drop it when there was no entry. A record touched since stays, and so does a file that is not there.
 * `records` defaults to the outage list beside this module; a second run finds nothing still equal to `now`.
 */
export async function redoUnread(root: string, records: readonly UnreadRecord[] = outage): Promise<{ restored: string[]; left: string[] }> {
  const restored: string[] = []
  const left: string[] = []
  const byFile = new Map<string, UnreadRecord[]>()
  for (const r of records) {
    const group = byFile.get(r.file)
    if (group) group.push(r)
    else byFile.set(r.file, [r])
  }
  for (const [file, group] of byFile) {
    let original: string
    try {
      original = await readFile(join(root, file), 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      for (const r of group) left.push(label(r))
      continue
    }
    const data = JSON.parse(original) as Record<string, unknown>
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error(`${file} is not a record`)
    let changed = false
    for (const r of group) {
      if (!same(data[r.key], r.now)) { left.push(label(r)); continue }
      if (r.was === null) delete data[r.key]
      else data[r.key] = r.was
      changed = true
      restored.push(label(r))
    }
    if (!changed) continue
    const next = written(file, data)
    if (next !== original) await writeFile(join(root, file), next)
  }
  return { restored, left }
}
