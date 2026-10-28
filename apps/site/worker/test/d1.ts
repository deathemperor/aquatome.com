import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

/** Minimal D1 stand-in over node:sqlite running the real migrations, so tests exercise the production SQL. */
export function testD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  const dir = fileURLToPath(new URL('../../migrations/', import.meta.url).href)
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(`${dir}${f}`, 'utf8'))
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async <T>() => (db.prepare(sql).get(...(args as never[])) as T) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[], success: true, meta: {} }),
    run: async () => { const r = db.prepare(sql).run(...(args as never[])); return { success: true, meta: { changes: Number(r.changes) } } },
  })
  return { prepare: (sql: string) => stmt(sql), batch: async (s: { run: () => Promise<unknown> }[]) => Promise.all(s.map(x => x.run())) } as unknown as D1Database
}
