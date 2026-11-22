import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type AddressInfo } from 'node:net'
import { expect, test } from 'vitest'
import { macLock, tryLock } from '../src/mac-lock'

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

test('a reader waits its turn for the lock, and past its wait fails, naming the port', async () => {
  const port = await freePort()
  const release = (await tryLock(port))!
  let got = false
  const waiting = macLock(port).then(r => { got = true; return r })
  await new Promise(r => setTimeout(r, 400))
  expect(got).toBe(false)
  await expect(macLock(port, 300)).rejects.toThrow(`another process on this Mac has held the lock on 127.0.0.1:${port}`)
  await release()
  await (await waiting)()
  expect(got).toBe(true)
})
