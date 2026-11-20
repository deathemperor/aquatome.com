/**
 * The chat's test account: the chief of staff asks the live chat through it (scripts/chat-tester.mjs) while chat is the
 * owner's alone, and its questions are tagged "tester" in the counts, the transcripts and the reports.
 *
 * It is one account with a fixed id, `TESTER_ID`, holding one email sign-in, this address's. The machine on the Mac makes
 * it and signs in to it by a code it alone is handed (tester-sign-in.ts): no mail goes to this address, and its own email
 * start is refused like any other way in. Nor does any other account come to hold the address: adding it to an account
 * signed in is refused (at the start and at the code), and so is any Apple or Google sign-in carrying it, linked or not
 * (accounts/api.ts; Codex's read of the chat gate, 17 Nov).
 *
 * The account can ask the chat and do nothing else: every other route finds no session in its token (session.ts
 * `sessionOf`), as for a token that was never issued, so it has no tanks, comments, photos, reports, dashboard or owner
 * bar. Nothing reads it as the owner's: the dashboard and the owner's reports keep to OWNER_ACCOUNTS.
 *
 * Off: CHAT_TESTER anything but "on" (wrangler.jsonc), missing too. Then no code is handed out, a code handed out
 * before signs nobody in, and a session it has finds chat off like every other route.
 */
export const TESTER_ADDRESS = 'chat-tester@aquatome.com'
export const TESTER_ID = 'chat-tester'
export const testerOn = (env: { CHAT_TESTER?: string }) => env.CHAT_TESTER === 'on'
/** A code handed to the Mac lasts this long; the session it signs in, this long (it signs in anew each time it asks). */
export const TESTER_CODE_MINUTES = 5
export const TESTER_SESSION_MINUTES = 15
/** Its questions a day, under chat's own per account (chat/api.ts). */
export const TESTER_PER_DAY = 20
