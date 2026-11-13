import { spawn as nodeSpawn, spawnSync as nodeSpawnSync, type ChildProcess, type SpawnSyncReturns } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// sim-run.py's quiet() lowers every simulator analysis daemon it can see. sim-run.test.ts and
// quiet-recording.test.ts both start it, and a scan from one was setting the other's stand-in from nice 0
// to 20 (2026-11-11). One turn, in the system temp folder: the other file waits until this file's scan has
// finished. Several scans in this same process share the turn; it only keeps the other file out.
const DEFAULT_LOCK = join(tmpdir(), 'aquatome-sim-run-tests.lock')
const WAIT_MS = 25_000
let depth = 0
let heldLock = DEFAULT_LOCK

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function acquire(lock: string) {
  const start = Date.now()
  for (;;) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx' })
      return
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      let pid = 0
      try { pid = Number(readFileSync(lock, 'utf8')) } catch { /* gone between the clash and the read */ }
      if (pid > 0 && pid !== process.pid && !alive(pid)) {
        try { rmSync(lock, { force: true }) } catch { /* the other waiter took it */ }
        continue
      }
      if (Date.now() - start > WAIT_MS) throw new Error('the other sim-run test file still holds the turn after 25 s')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
}

function enter(lock = DEFAULT_LOCK) {
  if (depth === 0) {
    acquire(lock)
    heldLock = lock
  }
  depth++
}

function leave() {
  depth--
  if (depth === 0) rmSync(heldLock, { force: true })
}

function scans(command: unknown): command is string {
  return typeof command === 'string' && (command.endsWith('/sim-run.py') || command.endsWith('/quiet-recording.py'))
}

// The overloads collapse to `never` if spread straight through. Callers still see spawn's own types.
const start = nodeSpawn as unknown as (command: string, ...rest: unknown[]) => ChildProcess
const startSync = nodeSpawnSync as unknown as (command: string, ...rest: unknown[]) => SpawnSyncReturns<string | NonSharedBuffer>

export const spawn: typeof nodeSpawn = ((command: unknown, ...args: unknown[]) => {
  const run = () => start(String(command), ...args)
  if (!scans(command)) return run()
  enter()
  try {
    const child = run()
    let left = false
    const done = () => { if (!left) { left = true; leave() } }
    child.on('close', done)
    child.on('error', done)
    return child
  } catch (e) {
    leave()
    throw e
  }
}) as typeof nodeSpawn

export const spawnSync: typeof nodeSpawnSync = ((command: unknown, ...args: unknown[]) => {
  const run = () => startSync(String(command), ...args)
  if (!scans(command)) return run()
  enter()
  try {
    return run()
  } finally {
    leave()
  }
}) as typeof nodeSpawnSync

/** A stand-in that nobody else's scan has lowered yet. A live simulator run on this Mac (a lead's, or the runner's) lowers
 *  every simulator analysis daemon it can see every 20 s, a test's stand-in too, and the turn here keeps out only the other
 *  test file: on 2026-11-12 one lowered the stand-in 0.2 s after it started, before its priority had been read, and the
 *  photos part's tests failed. So it is started, read after `settle` ms, and started afresh while its priority isn't
 *  `base`, `tries` times at most: a fresh one stays unlowered until that scan's next pass. The last one is handed back as
 *  it is, for the caller's own check to fail on. */
export async function unlowered<C extends { pid?: number; kill: () => unknown }>(start: () => C, nice: (pid?: number) => number, base: number, o: { tries?: number; settle?: number } = {}): Promise<C> {
  const tries = o.tries ?? 3
  for (let i = 1; ; i++) {
    const child = start()
    await new Promise(r => setTimeout(r, o.settle ?? 200))
    if (i >= tries || nice(child.pid) === base) return child
    child.kill()
  }
}

/** Holds the turn around stand-ins as well as the scan: the other file's scan must not see them.
 *  `lock` is for the overlap check's own file, so that check does not wait out the suite's turn. */
export async function withSimRunTurn<T>(fn: () => T | Promise<T>, lock = DEFAULT_LOCK): Promise<T> {
  enter(lock)
  try {
    return await fn()
  } finally {
    leave()
  }
}
