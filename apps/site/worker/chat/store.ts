/**
 * Where the chat keeps an account's conversations, their transcripts and its retries' answers in R2 (UPLOADS): under
 * the account's own prefix, so deleting the account finds them (accounts/users.ts). Conversations and transcripts are
 * kept with no time limit (the owner's decision, 2026-11-07); a retry's answer is read for 24 hours, a conversation's
 * life, and swept by the daily cron after.
 */

/**
 * The account as the chat's storage names it, never its id: an HMAC of the id under ACCOUNT_HMAC_KEY, which is never
 * rotated (rotated, no conversation could be found again to delete).
 */
export async function chatAccount(secret: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`chat:${userId}`))
  return [...new Uint8Array(sig).slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export const conversationKey = (account: string, conversation: string) => `chat-conv/${account}/${conversation}.json`
export const retryKey = (account: string, key: string) => `chat-turn/${account}/${key}.json`
/** A report of one answer as wrong (past.ts): one a turn, the first one's reason standing. */
/** Set once an account's conversations from before the list are all in it. */
export const importedKey = (account: string) => `chat-import/${account}/done`
export const REPORT_PREFIX = 'chat-report/'
export const reportKey = (account: string, conversation: string, n: number) => `${REPORT_PREFIX}${account}/${conversation}/${n}.json`
/** A time as the contract's fixtures write it and the app reads it: to the second. */
export const secs = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')
/** A question, as a stop names it in the ledger: an account's Idempotency-Key, so one account's key can't stop another's. */
export const stopKey = (account: string, key: string) => `${account}:${key}`

type Listed = { key: string; uploaded: Date }
export async function listAll(bucket: R2Bucket, prefix: string): Promise<Listed[]> {
  const out: Listed[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    out.push(...page.objects)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return out
}
async function deleteAll(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000))
}

/** Everything the chat keeps for an account, when the account is deleted. Listed whole first, then deleted: a cursor isn't promised to hold across deletes. */
export async function deleteChatOf(bucket: R2Bucket, account: string): Promise<void> {
  const keys: string[] = []
  for (const prefix of [`chat-conv/${account}/`, `chat-run/${account}/`, `chat-turn/${account}/`, `chat-report/${account}/`, `chat-import/${account}/`]) keys.push(...(await listAll(bucket, prefix)).map(o => o.key))
  await deleteAll(bucket, keys)
}

/** The daily cron: retries' answers a day old or more, past the 24 hours they're read for. How many. */
export async function sweepRetries(bucket: R2Bucket, now: Date): Promise<number> {
  const cutoff = now.getTime() - 86_400_000
  const old = (await listAll(bucket, 'chat-turn/')).filter(o => o.uploaded.getTime() <= cutoff).map(o => o.key)
  await deleteAll(bucket, old)
  return old.length
}
