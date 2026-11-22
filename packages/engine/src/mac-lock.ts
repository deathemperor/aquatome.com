import { createServer } from 'node:net'

/**
 * A lock across the Mac: a port on 127.0.0.1, which one process holds at a time, whatever its checkout. The system frees it
 * the moment the process holding it ends, however it ends, so there is never a dead holder's lock to take over (Codex,
 * 21 Nov 2026: two steps taking over the same file lock could both run). Below the Mac's range for passing ports (49152 on).
 * Only the CLI names these two (the chief of staff, 22 Nov 2026): a test names a free port of its own, so a test run beside a
 * live cycle never holds up an Archive request, and a live cycle never fails a test.
 */
export const ARCHIVE_LOCK_PORT = 41231
export const MAGAZINE_LOCK_PORT = 41232
/** The one address the lock is held on: the Mac's own, never every address it has (the chief of staff, 22 Nov 2026). */
export const LOCK_HOST = '127.0.0.1'
/** How long a reader waits for the Archive's lock: one request holds it 90 s at most (archive.ts), so this is a stuck holder. */
export const LOCK_WAIT_MS = 10 * 60_000
/** A wait past this is said in the log, once: longer than any one request holds the lock. */
export const LOCK_NOTE_MS = 2 * 60_000
const LOCK_POLL_MS = 250

export type Release = () => Promise<void>

/** The lock was held by another process, ours or not, longer than a reader waits: nothing was asked, and it is no refusal. */
export class LockBusy extends Error {}

/** The lock if no process holds it now, else none. Its holder never keeps a run from ending. */
export function tryLock(port: number): Promise<Release | undefined> {
  const server = createServer(c => c.destroy())
  return new Promise((resolve, reject) => {
    server.once('error', e => ((e as NodeJS.ErrnoException).code === 'EADDRINUSE' ? resolve(undefined) : reject(e)))
    server.listen({ port, host: LOCK_HOST, exclusive: true }, () => {
      server.unref()
      resolve(() => new Promise<void>(done => server.close(() => done())))
    })
  })
}

/**
 * The lock, waiting its turn. A wait past `noteMs` is said once in `log`; past `waitMs` it fails (LockBusy), naming the port.
 * The wait is counted in tries, never read off the clock (Codex, 22 Nov 2026: a clock set back would stretch it).
 */
export async function macLock(port: number, o: { waitMs?: number; noteMs?: number; log?: (line: string) => void } = {}): Promise<Release> {
  const { waitMs = LOCK_WAIT_MS, noteMs = LOCK_NOTE_MS, log = console.log } = o
  const s = (tries: number) => Math.round((tries * LOCK_POLL_MS) / 1000)
  for (let tries = 0; ; tries++) {
    const release = await tryLock(port)
    if (release) return release
    if (tries * LOCK_POLL_MS >= waitMs) throw new LockBusy(`the lock on ${LOCK_HOST}:${port} was held by another process for ${s(tries)} s: nothing was asked, and this is no refusal`)
    if (tries === Math.ceil(noteMs / LOCK_POLL_MS)) log(`waiting for the lock on ${LOCK_HOST}:${port}: another process has held it ${s(tries)} s; nothing is asked without it, and at ${Math.round(waitMs / 1000)} s this stops`)
    await new Promise(r => setTimeout(r, LOCK_POLL_MS))
  }
}
