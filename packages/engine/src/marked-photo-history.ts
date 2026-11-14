import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'
import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PhotoSchema } from '@aq/schema'
import { rememberMarkedPhotos } from './marked-photos'

const exec = promisify(execFile)
/** Recover only previously recorded photo credits, not a new licence or ownership grant. Runs once when enabled. */
export async function recoverMarkedHistory(root: string, cache: string): Promise<void> {
  const marker = join(cache, 'marked-history-v1.json')
  try { await readFile(marker); return } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  const marks = JSON.parse(await readFile(join(root, 'engine-state/_photo-watermarks.json'), 'utf8')) as Record<string, { watermark?: boolean }>
  const urls = new Set(Object.entries(marks).filter(([, v]) => v.watermark).map(([u]) => u))
  const snapshots = new Map<string, { path: string; commit: string }>()
  const child = spawn('git', ['log', '--all', '--no-ext-diff', '--no-renames', '--format=COMMIT:%H', '-p', '--unified=0', '--', 'content/species', 'content/plants', 'content/gallery'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
  const timer = setTimeout(() => child.kill('SIGTERM'), 120_000)
  const finished = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error('marked history unavailable'))) })
  let commit = '', path = ''
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      if (line.startsWith('COMMIT:')) commit = line.slice(7)
      else if (line.startsWith('diff --git ')) path = /b\/(content\/(?:(?:species|plants)\/[^/]+\/entity|gallery\/[^/]+)\.json)$/.exec(line)?.[1] ?? ''
      else if (path && /^-\s*"url":/.test(line)) {
        const u = /^-\s*"url": "([^"]+)"/.exec(line)?.[1]
        if (u && urls.has(u)) snapshots.set(`${commit}:${path}`, { path, commit })
      }
    }
    await finished
  } finally { clearTimeout(timer) }
  let recovered = 0
  for (const { path, commit } of snapshots.values()) {
    // The removed photo lives in the parent tree. Only parse complete entity records, never reconstruct credits.
    const { stdout } = await exec('git', ['show', `${commit}^:${path}`], { cwd: root, maxBuffer: 4_000_000 }).catch(() => ({ stdout: '' }))
    if (!stdout) continue
    const entity = JSON.parse(stdout) as { photos?: unknown[] }
    const photos = (entity.photos ?? []).flatMap(p => { const v = PhotoSchema.safeParse(p); return v.success ? [v.data] : [] })
    let target = path
    const galleryId = /^content\/gallery\/([^/]+)\.json$/.exec(path)?.[1]
    if (galleryId) {
      const kind = await access(join(root, 'content/species', galleryId, 'entity.json')).then(() => 'species', () => 'plants')
      target = `content/${kind}/${galleryId}/entity.json`
    }
    await rememberMarkedPhotos(join(root, target), { photos }, u => urls.has(u), cache)
    recovered += photos.filter(p => urls.has(p.url)).length
  }
  await writeFile(marker, JSON.stringify({ recovered, snapshots: snapshots.size }), { mode: 0o600 })
}
