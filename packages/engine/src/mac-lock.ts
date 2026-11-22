import { createServer } from 'node:net'

/**
 * A lock across the Mac: a port on 127.0.0.1, which one process holds at a time, whatever its checkout. The system frees it
 * the moment the process holding it ends, however it ends, so there is never a dead holder's lock to take over (Codex,
 * 21 Nov 2026: two steps taking over the same file lock could both run). Below the Mac's range for passing ports (49152 on).
 */
export const ARCHIVE_LOCK_PORT = 41231
export const MAGAZINE_LOCK_PORT = 41232
/** How long a reader waits for the Archive's lock: one request holds it 90 s at most (archive.ts), so this is a stuck holder. */
export const LOCK_WAIT_MS = 10 * 60_000
const LOCK_POLL_MS = 250

export type Release = () => Promise<void>

/** The lock if no process holds it now, else none. Its holder never keeps a run from ending. */
export function tryLock(port: number): Promise<Release | undefined> {
  const server = createServer(c => c.destroy())
  return new Promise((resolve, reject) => {
    server.once('error', e => ((e as NodeJS.ErrnoException).code === 'EADDRINUSE' ? resolve(undefined) : reject(e)))
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.unref()
      resolve(() => new Promise<void>(done => server.close(() => done())))
    })
  })
}

/** The lock, waiting its turn: past `waitMs` it fails, naming the port, which is no refusal of the Archive's. */
export async function macLock(port: number, waitMs = LOCK_WAIT_MS): Promise<Release> {
  const until = Date.now() + waitMs
  for (;;) {
    const release = await tryLock(port)
    if (release) return release
    if (Date.now() >= until) throw new Error(`another process on this Mac has held the lock on 127.0.0.1:${port} for ${Math.round(waitMs / 60_000)} minutes`)
    await new Promise(r => setTimeout(r, LOCK_POLL_MS))
  }
}
