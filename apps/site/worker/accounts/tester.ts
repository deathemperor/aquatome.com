/**
 * The chat's test account: the address it signs in with, fixed here and in `normalEmail`'s form. The chat lets in the
 * account holding a sign-in with this address while it is on for the owner alone (chat/api.ts `roleOf`), and tags its
 * questions "tester" in the counts, the transcripts and the reports. Nothing else reads it as the owner's: the
 * dashboard and the owner's reports keep to OWNER_ACCOUNTS.
 *
 * Safe in a public repository: an account gets this address only by proving it, by a code to it or by Apple or Google
 * vouching for it, and this domain is ours. Taking the tester off is `undefined` here, and a deploy.
 */
export const TESTER_ADDRESS: string | undefined = 'chat-tester@aquatome.com'
