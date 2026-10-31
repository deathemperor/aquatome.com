/** Accounts and their ways to sign in (credentials). An account holds no name, phone number or email address. */
export type Kind = 'apple' | 'google' | 'passkey' | 'email'
export type Method = { id: string; kind: Kind; createdAt: string; lastUsedAt: string | null }

export class InUse extends Error {}

/**
 * The account a sign-in belongs to, made on first use. `signedIn`: the account already signed in on this browser or app,
 * which the credential is added to (adding a second way to sign in). `emailHash`: a verified address's hash, which finds an
 * account first made with an email link or another provider giving the same address.
 */
export async function signInWith(db: D1Database, c: { kind: Kind; subject: string; emailHash?: string; signedIn?: string }, now: Date): Promise<string> {
  const at = now.toISOString()
  const known = await db.prepare(`SELECT id, user_id FROM credentials WHERE kind = ? AND subject = ?`).bind(c.kind, c.subject).first<{ id: string; user_id: string }>()
  if (known) {
    if (c.signedIn && c.signedIn !== known.user_id) throw new InUse()
    await db.prepare(`UPDATE credentials SET last_used_at = ? WHERE id = ?`).bind(at, known.id).run()
    return known.user_id
  }
  let userId = c.signedIn
  if (!userId && c.emailHash) {
    userId = (await db.prepare(`SELECT user_id FROM credentials WHERE email_hash = ? ORDER BY created_at LIMIT 1`).bind(c.emailHash).first<{ user_id: string }>())?.user_id
  }
  const statements: D1PreparedStatement[] = []
  if (!userId) {
    userId = crypto.randomUUID()
    statements.push(db.prepare(`INSERT INTO users (id, created_at) VALUES (?, ?)`).bind(userId, at))
  }
  statements.push(db.prepare(`INSERT INTO credentials (id, user_id, kind, subject, email_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), userId, c.kind, c.subject, c.emailHash ?? null, at, at))
  await db.batch(statements)
  return userId
}

export async function methodsOf(db: D1Database, userId: string): Promise<Method[]> {
  const { results } = await db.prepare(`SELECT id, kind, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at`).bind(userId)
    .all<{ id: string; kind: Kind; created_at: string; last_used_at: string | null }>()
  return results.map(r => ({ id: r.id, kind: r.kind, createdAt: r.created_at, lastUsedAt: r.last_used_at }))
}

/** Everything of an account, in one batch: its saved tanks, sign-ins and sessions, then the account. */
export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  await db.batch(['tank_records', 'credentials', 'sessions', 'auth_challenges'].map(t => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId))
    .concat(db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId)))
}
