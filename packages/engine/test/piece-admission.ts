import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect } from 'vitest'
import { nameStep } from '../src/ceiling'

export async function denied(step: string, root: string, run: () => Promise<void>) {
  const snapshot = async () => {
    const dir = join(root, 'content')
    const files = (await readdir(dir, { recursive: true }).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()
    return Promise.all(files.map(async f => [f, await readFile(join(dir, f), 'utf8')]))
  }
  const before = await snapshot()
  const old = process.env.ENGINE_COST_LOG
  const log = join(root, 'cost.jsonl')
  await writeFile(log, JSON.stringify({ at: new Date().toISOString(), step, piece: 'last', pieceUsd: 10000, finished: true }) + '\n')
  process.env.ENGINE_COST_LOG = log
  nameStep(step)
  try { await run(); expect(await snapshot()).toEqual(before) }
  finally { process.env.ENGINE_COST_LOG = old ?? 'off'; nameStep(undefined) }
}
