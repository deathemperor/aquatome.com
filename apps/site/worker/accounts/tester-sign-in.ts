import { bearerOk } from '../dashboard'
import { emailHash, startEmail } from './email'
import { allow } from './ratelimit'
import { TESTER_ADDRESS, TESTER_CODE_MINUTES, TESTER_ID, testerOn } from './tester'

/** Codes handed out a day: the 20 questions the tester asks (chat/api.ts), with room for a few that fail. */
const CODES_A_DAY = 30
const DAY_MS = 86_400_000

/**
 * The test account (tester.ts), made if it isn't yet: its fixed id and its address's email sign-in, together. False when
 * that sign-in is another account's (none is: no sign-in has carried the address, 17 Nov), and then nothing is made.
 */
export async function testerAccount(db: D1Database, key: string, now: Date): Promise<boolean> {
  const hash = await emailHash(key, TESTER_ADDRESS)
  const holder = async () => (await db.prepare(`SELECT user_id FROM credentials WHERE kind = 'email' AND subject = ?`).bind(hash).first<{ user_id: string }>())?.user_id
  const held = await holder()
  if (held) return held === TESTER_ID
  const at = now.toISOString()
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)`).bind(TESTER_ID, at),
    db.prepare(`INSERT OR IGNORE INTO credentials (id, user_id, kind, subject, email_hash, created_at, last_used_at) VALUES (?, ?, 'email', ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), TESTER_ID, hash, hash, at, at),
  ])
  return (await holder()) === TESTER_ID
}

type Env = { DB: D1Database; ACCOUNT_HMAC_KEY: string; AB_DASH_TOKEN?: string; CHAT_TESTER?: string; CANONICAL_HOST?: string }

/**
 * POST /api/v1/chat-tester/code, with the Mac's dashboard bearer: an email sign-in for the test account, its `flow` and
 * its code, for /api/v1/auth/email/verify. No mail goes out; the code is used once and lasts TESTER_CODE_MINUTES. Only on
 * this site's host, while the tester is on, CODES_A_DAY a day. Anything else gets `nothing`, the answer to a path that
 * isn't there, so nobody learns whether a code could be had. The code is never logged.
 */
export async function testerCode(req: Request, url: URL, env: Env, now: Date, nothing: () => Response): Promise<Response> {
  if (req.method !== 'POST' || !testerOn(env) || (env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST) || !bearerOk(req, env.AB_DASH_TOKEN)) return nothing()
  if (!(await allow(env.DB, env.ACCOUNT_HMAC_KEY, 'chat-tester-code', CODES_A_DAY, DAY_MS, now))) return nothing()
  if (!(await testerAccount(env.DB, env.ACCOUNT_HMAC_KEY, now))) {
    console.error('chat tester: its address is another account\'s sign-in')
    return nothing()
  }
  const { flow, code } = await startEmail(env.DB, env.ACCOUNT_HMAC_KEY, TESTER_ADDRESS, 'vi', url.origin, undefined, now, true, TESTER_CODE_MINUTES)
  return Response.json({ flow, code }, { headers: { 'cache-control': 'no-store' } })
}
