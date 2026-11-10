import { spawn } from 'node:child_process'
import type { BrowserContext, Page } from 'playwright-core'

// Hands focus back while Chrome opens: a Chrome that wasn't running when this started goes behind whatever was in front.
// Chrome brings itself forward with its first window however it's launched (tried 2026-11-10: `--window-position` is held
// to the screen, `open -g -j` is ignored), so this can only make that short: about a second, against 2 to 9 without it.
// NSWorkspace and NSRunningApplication need no permission from the owner.
// It stops itself after two minutes, in case the engine dies before stopping it.
const KEEPER = `
ObjC.import('AppKit')
const w = $.NSWorkspace.sharedWorkspace
const chromes = () => $.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.google.Chrome').js.map(a => a.processIdentifier)
const running = new Set(chromes())
let back = w.frontmostApplication
console.log('ready')
for (const end = Date.now() + 120000; Date.now() < end;) {
  // Turning the run loop is what lets NSWorkspace see the front app change; a plain delay() reads the same app for ever.
  $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.01))
  try {
    const front = w.frontmostApplication
    if (front.bundleIdentifier.js === 'com.google.Chrome' && !running.has(front.processIdentifier)) back.activateWithOptions(1)
    else back = front
  } catch (e) {}
}
`
const READY_MS = 8000
const LINGER_MS = 2000

/** Starts handing focus back; `stop` ends it shortly after Chrome has settled. Nothing here may stop a fetch. */
export async function holdFocus(): Promise<{ stop(): void } | undefined> {
  try {
    const keeper = spawn('osascript', ['-l', 'JavaScript', '-e', KEEPER], { stdio: ['ignore', 'ignore', 'pipe'] })
    keeper.on('error', () => {})
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, READY_MS)
      for (const end of ['close', 'error']) keeper.once(end, () => { clearTimeout(timer); resolve() })
      keeper.stderr.once('data', () => { clearTimeout(timer); resolve() })
    })
    return { stop: () => { setTimeout(() => keeper.kill(), LINGER_MS).unref() } }
  } catch {
    return undefined
  }
}

/** The page keeps drawing, and reads as visible and focused, as it does today: Playwright's focus emulation holds those for a minimized window. */
export async function minimize(ctx: BrowserContext, page: Page): Promise<void> {
  const cdp = await ctx.newCDPSession(page)
  const { windowId } = await cdp.send('Browser.getWindowForTarget')
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } })
  await cdp.detach()
}
