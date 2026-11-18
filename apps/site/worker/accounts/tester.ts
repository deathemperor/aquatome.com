/**
 * The chat's test account: the address it signs in with, fixed here and in `normalEmail`'s form. The chat lets in the
 * account holding a sign-in with this address while it is on for the owner alone (chat/api.ts `roleOf`), and tags its
 * questions "tester" in the counts, the transcripts and the reports. Nothing else reads it as the owner's: the
 * dashboard and the owner's reports keep to OWNER_ACCOUNTS.
 *
 * Safe in a public repository: an account gets this address only by a code sent to it, and this domain is ours. It never
 * joins another account: adding it to an account signed in is refused (at the start and at the code), and so is any
 * Apple or Google sign-in carrying it, linked or not (accounts/api.ts; Codex's read of the chat gate, 17 Nov). Nor does
 * the test account take another way in: signed in, it links no Google, Apple, other address or passkey (Codex's read of
 * #1606), so its own code stays its one way in. A sign-in
 * with it would land in the account that first held it (accounts/users.ts `signInWith`), and on the owner's it would
 * open the dashboard. Taking the tester off is `undefined` here, and a deploy.
 */
export const TESTER_ADDRESS: string | undefined = 'chat-tester@aquatome.com'
