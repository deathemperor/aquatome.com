import { accountDayKey } from '../comments/api'

/**
 * Where the chat keeps an account's conversations and its retries' answers in R2 (UPLOADS): under the account's own
 * prefix, so deleting the account finds them (accounts/users.ts). Kept with no time limit (the owner's decision,
 * 2026-11-07). The account is named by an HMAC, never its id.
 */
export const chatAccount = async (secret: string, userId: string) => (await accountDayKey(secret, userId, new Date(0))).slice(3)
export const conversationKey = (account: string, conversation: string) => `chat-conv/${account}/${conversation}.json`
export const retryKey = (account: string, key: string) => `chat-turn/${account}/${key}.json`

/** Everything the chat keeps for an account, when the account is deleted. */
export async function deleteChatOf(bucket: R2Bucket, account: string): Promise<void> {
  // Listed whole first, then deleted: a cursor isn't promised to hold across deletes.
  const keys: string[] = []
  for (const prefix of [`chat-conv/${account}/`, `chat-turn/${account}/`]) {
    let cursor: string | undefined
    do {
      const page = await bucket.list({ prefix, cursor })
      keys.push(...page.objects.map(o => o.key))
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
  }
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000))
}
