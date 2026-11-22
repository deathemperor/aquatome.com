import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readdirSync, readFileSync } from 'node:fs'
import { connect, createServer, type AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { ARCHIVE_LOCK_PORT, LockBusy, MAGAZINE_LOCK_PORT, macLock, tryLock } from '../src/mac-lock'

/** A port no one holds, for a test's own lock: never the Mac's, which a cycle may hold. */
const freePort = () => new Promise<number>(ok => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address() as AddressInfo; s.close(() => ok(port)) }) })

test("the Mac's lock: one holder at a time, in this process or another; free again once released", async () => {
  const port = await freePort()
  const release = (await tryLock(port))!
  expect(await tryLock(port)).toBeUndefined()
  // Another process asking for the same port as the lock does.
  const other = spawn(process.execPath, ['-e', `require('node:net').createServer().once('error', e => console.log(e.code)).listen({ port: ${port}, host: '127.0.0.1', exclusive: true }, () => { console.log('held'); process.exit(0) })`], { stdio: ['ignore', 'pipe', 'inherit'] })
  const [said] = await Promise.all([new Promise<string>(ok => other.stdout!.once('data', d => ok(String(d).trim()))), once(other, 'exit')])
  expect(said).toBe('EADDRINUSE')
  await release()
  const again = await tryLock(port)
  expect(again).toBeDefined()
  await again!()
})

test('a holder that ends, however it ends, frees the lock: no dead holder to take over', async () => {
  const port = await freePort()
  const holder = spawn(process.execPath, ['-e', `require('node:net').createServer().listen({ port: ${port}, host: '127.0.0.1', exclusive: true }, () => console.log('held'))`], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise(ok => holder.stdout!.once('data', ok))
  expect(await tryLock(port)).toBeUndefined()
  holder.kill('SIGKILL')
  await once(holder, 'exit')
  const mine = await tryLock(port)
  expect(mine).toBeDefined()
  await mine!()
})

test('a reader waits its turn for the lock', async () => {
  const port = await freePort()
  const release = (await tryLock(port))!
  let got = false
  const waiting = macLock(port).then(r => { got = true; return r })
  await new Promise(r => setTimeout(r, 400))
  expect(got).toBe(false)
  await release()
  await (await waiting)()
  expect(got).toBe(true)
})

// The chief of staff, 22 Nov 2026: three things true of the lock, each with its check.
/** Whether something answers on that address and port. */
const answers = (host: string, port: number) => new Promise<boolean>(ok => {
  const c = connect({ host, port })
  c.setTimeout(2000, () => { c.destroy(); ok(false) })
  c.once('connect', () => { c.destroy(); ok(true) })
  c.once('error', () => ok(false))
})

test('1. the lock is held on 127.0.0.1 alone, never on every address the Mac has', async () => {
  const port = await freePort()
  const release = (await tryLock(port))!
  expect(await answers('127.0.0.1', port)).toBe(true)
  // Not the IPv6 loopback, as "::" or "localhost" might be; not the Mac's own addresses on a network, as "0.0.0.0" would be.
  expect(await answers('::1', port)).toBe(false)
  const own = Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a!.address)
  // The label names no address: a failure's log may be read beyond this machine.
  for (const a of own) expect(await answers(a, port), 'one of this machine\'s addresses on a network').toBe(false)
  await release()
})

test('2. no test takes the live lock: only the CLI names its ports, and every test names a free one of its own', () => {
  const live = new RegExp(`\\b(?:${ARCHIVE_LOCK_PORT}|${MAGAZINE_LOCK_PORT}|ARCHIVE_LOCK_PORT|MAGAZINE_LOCK_PORT)\\b`)
  const naming = (dir: string) => (readdirSync(dir, { recursive: true }) as string[]).filter(f => /\.tsx?$/.test(f) && live.test(readFileSync(join(dir, f), 'utf8')))
  const here = fileURLToPath(new URL('.', import.meta.url))
  // This file names them only to look for them.
  expect(naming(here)).toEqual(['mac-lock.test.ts'])
  expect(naming(join(here, '../src')).sort()).toEqual(['cli.ts', 'mac-lock.ts'])
})

test('3. a holder not ours: the reader waits, says so once in the log, then fails naming the port, which is no refusal', async () => {
  const port = await freePort()
  // Something else on the Mac on that port: not a lock of ours.
  const other = createServer()
  await new Promise<void>(ok => other.listen({ port, host: '127.0.0.1' }, ok))
  const said: string[] = []
  const e = await macLock(port, { waitMs: 600, noteMs: 200, log: l => said.push(l) }).catch((x: unknown) => x)
  expect(e).toBeInstanceOf(LockBusy)
  expect((e as Error).message).toMatch(new RegExp(`^the lock on 127\\.0\\.0\\.1:${port} was held by another process for \\d+ s: nothing was asked, and this is no refusal$`))
  expect(said).toHaveLength(1)
  expect(said[0]).toMatch(new RegExp(`^waiting for the lock on 127\\.0\\.0\\.1:${port}: another process has held it \\d+ s; nothing is asked without it, and at 1 s this stops$`))
  await new Promise(ok => other.close(ok))
})
