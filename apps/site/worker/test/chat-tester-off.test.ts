import { expect, test, vi } from 'vitest'
import { emailHash } from '../accounts/email'
import { signInWith } from '../accounts/users'
import { askable, roleOf, type ChatEnv } from '../chat/api'
import { testD1 } from './d1'

// The tester taken off (accounts/tester.ts): its address `undefined`, and a deploy.
vi.mock('../accounts/tester', () => ({ TESTER_ADDRESS: undefined }))

test('with the tester taken off, the account that held its address is a reader again, and chat on for the owner is off for it', async () => {
  const db = testD1()
  const hash = await emailHash('k', 'chat-tester@aquatome.com')
  const id = await signInWith(db, { kind: 'email', subject: hash, emailHash: hash }, new Date())
  const env = { CHAT: 'owner', ACCOUNT_HMAC_KEY: 'k', DB: db } as unknown as ChatEnv
  expect(await roleOf(env, id)).toBe('reader')
  expect(askable(env, await roleOf(env, id))).toBe(false)
})
