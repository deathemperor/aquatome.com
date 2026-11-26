import { expect, test } from 'vitest'
import { createSession } from '../accounts/session'
import { TESTER_ID } from '../accounts/tester'
import { testerAccount } from '../accounts/tester-sign-in'
import { askable, chatSession, roleOf, type ChatEnv } from '../chat/api'
import { testD1 } from './d1'

// The tester taken off (accounts/tester.ts): CHAT_TESTER anything but "on", or missing. Its session, made while it was on,
// is no session to the chat either, so chat is off for it whether it is open or the owner's. Codex's read of #1440 found
// the old switch (the address taken out) failed the tests, so a deploy would refuse it; this one is the Worker's own var.
test('with the tester off, its live session is none to the chat, and chat is off for it; on, it is the tester', async () => {
  const db = testD1()
  const now = new Date()
  expect(await testerAccount(db, 'k', now)).toBe(true)
  const token = await createSession(db, TESTER_ID, 'app', now, 15)
  const req = new Request('https://x.test/api/chat', { headers: { authorization: `Bearer ${token}` } })
  const envOf = (CHAT: string, CHAT_TESTER?: string) => ({ CHAT, ACCOUNT_HMAC_KEY: 'k', DB: db, ...(CHAT_TESTER === undefined ? {} : { CHAT_TESTER }) }) as ChatEnv & { DB: D1Database }
  for (const off of [undefined, 'off', 'On', '1', '']) {
    for (const chat of ['owner', '1']) {
      const env = envOf(chat, off)
      const session = await chatSession(req, env, now)
      expect(session, `${off} ${chat}`).toBeUndefined()
      expect(await roleOf(env, session?.userId)).toBe('reader')
      if (chat === 'owner') expect(askable(env, 'reader')).toBe(false)
    }
  }
  const on = envOf('owner', 'on')
  expect((await chatSession(req, on, now))?.userId).toBe(TESTER_ID)
  expect(askable(on, await roleOf(on, TESTER_ID))).toBe(true)
})
