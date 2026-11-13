import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { holdFocus, minimize } from '../src/chrome-window'

const ROOT = resolve(__dirname, '../../..')

function fakeChrome(failing = false) {
  const sent: Array<[string, unknown]> = []
  const cdp = {
    send: async (method: string, params?: unknown) => {
      sent.push([method, params])
      if (failing) throw new Error('no window')
      return { windowId: 7 }
    },
    detach: async () => {},
  }
  const page = { goto: async () => {} }
  const ctx = { newCDPSession: async () => cdp, pages: () => [page], close: async () => {} }
  return { ctx, page, sent }
}

const launched = vi.hoisted(() => ({ current: undefined as unknown, options: undefined as unknown }))
vi.mock('playwright-core', () => ({
  chromium: { launchPersistentContext: async (_dir: string, options: unknown) => { launched.options = options; return launched.current } },
}))

const platform = process.platform
const on = (value: string) => Object.defineProperty(process, 'platform', { value })
afterEach(() => on(platform))

test('minimize asks Chrome to minimize the window its page is in', async () => {
  const { ctx, page, sent } = fakeChrome()
  await minimize(ctx as never, page as never)
  expect(sent).toEqual([
    ['Browser.getWindowForTarget', undefined],
    ['Browser.setWindowBounds', { windowId: 7, bounds: { windowState: 'minimized' } }],
  ])
})

test('on the Mac a headed Chrome is minimized, and a Chrome that cannot be still fetches; headless and other systems are left alone', async () => {
  const { ChromeFetcher } = await import('../src/fetch')
  const open = async (headless: boolean | undefined, system: string, failing = false) => {
    const chrome = fakeChrome(failing)
    launched.current = chrome.ctx
    on(system)
    await new ChromeFetcher({ profileDir: '/x', headless }).open()
    return chrome.sent.map(([method]) => method)
  }
  expect(await open(undefined, 'linux')).toEqual([])
  expect(await open(true, 'darwin')).toEqual([])
  expect(await open(undefined, 'darwin')).toContain('Browser.setWindowBounds')
  expect(await open(undefined, 'darwin', true)).toEqual(['Browser.getWindowForTarget']) // it tried, and open() didn't throw
  expect(launched.options).toMatchObject({ channel: 'chrome', headless: false, locale: 'en-US', viewport: { width: 1280, height: 900 } })
  expect(launched.options).not.toHaveProperty('args') // the browser's launch is as it was: nothing a site could read changes
}, 30_000)

test.skipIf(platform !== 'darwin')('the focus keeper starts and stops', async () => {
  const keeper = await holdFocus()
  expect(keeper).toBeDefined()
  keeper?.stop()
}, 30_000)

test('nothing else opens a window: a launcher outside the fetcher is headless', () => {
  const launchers = execFileSync('git', ['grep', '-lE', 'launchPersistentContext\\(|chromium\\.launch\\(', '--', 'packages/engine/src', 'scripts', 'packages/engine/scripts'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').sort()
  expect(launchers).toEqual(['packages/engine/scripts/fb-recon.ts', 'packages/engine/src/fetch.ts'])
  // fb-recon is run by hand, to look at Facebook logged in: a person is there to see it.
  expect(readFileSync(join(ROOT, 'packages/engine/scripts/fb-recon.ts'), 'utf8')).toContain('headless: !!values.headless')
})

function fakeMac(windows: number[]) {
  const home = mkdtempSync(join(tmpdir(), 'aq-chrome-'))
  mkdirSync(join(home, 'bin'))
  const stub = (name: string, body: string) => { writeFileSync(join(home, 'bin', name), `#!/bin/sh\n${body}\n`); chmodSync(join(home, 'bin', name), 0o755) }
  stub('ps', `cat <<'E'
  11 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --enable-automation --user-data-dir=/u/.cache/aquatome/chrome-profile-sf about:blank
  12 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --enable-automation --user-data-dir=/u/.cache/aquatome/chrome-profile --x
  13 /Applications/Google Chrome.app/Contents/Frameworks/Helper --type=renderer --enable-automation --user-data-dir=/u/.cache/aquatome/chrome-profile
  14 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/u/mine
E`)
  stub('osascript', `echo '${JSON.stringify(windows)}'`)
  return (...args: string[]) => spawnSync(join(ROOT, 'scripts/chrome-windows.py'), args, { encoding: 'utf8', env: { ...process.env, PATH: `${home}/bin:${process.env.PATH}` } })
}

// chrome-windows.py, four times. Beside the rest of the suite, at default workers, that took 22 s on
// 2026-11-11, against the package's 30 s.
test('chrome-windows says which of the engine\'s Chromes are on the screen, and leaves out anyone else\'s', () => {
  const none = fakeMac([14, 13, 99])()
  expect(none.status).toBe(0)
  expect(none.stdout).toContain('none on the owner')
  const one = fakeMac([11, 14])()
  expect(one.status).toBe(1)
  expect(one.stdout).toContain('chrome-profile-sf')
  expect(fakeMac([11, 12])('--count').stdout.trim()).toBe('2')
  expect(fakeMac([])('--count').status).toBe(0)
}, 60_000)
