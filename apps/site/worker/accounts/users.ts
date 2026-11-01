/** Accounts and their ways to sign in (credentials). An account holds no name, phone number or email address. */
export type Kind = 'apple' | 'google' | 'passkey' | 'email'
export type Method = { id: string; kind: Kind; createdAt: string; lastUsedAt: string | null }

export class InUse extends Error {}

/**
 * The account a sign-in belongs to, made on first use. `signedIn`: the account already signed in on this browser or app,
 * which the credential is added to (adding a second way to sign in). `emailHash`: a verified address's hash, which finds an
 * account first made with an email link or another provider giving the same address.
 */
export async function signInWith(db: D1Database, c: { kind: Kind; subject: string; emailHash?: string; signedIn?: string }, now: Date, retried = false): Promise<string> {
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
  try {
    await db.batch(statements)
  } catch (e) {
    // The same first sign-in twice at once: the other request made the account (UNIQUE kind, subject). Use it.
    if (retried) throw e
    return signInWith(db, c, now, true)
  }
  return userId
}

export async function methodsOf(db: D1Database, userId: string): Promise<Method[]> {
  const { results } = await db.prepare(`SELECT id, kind, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at`).bind(userId)
    .all<{ id: string; kind: Kind; created_at: string; last_used_at: string | null }>()
  return results.map(r => ({ id: r.id, kind: r.kind, createdAt: r.created_at, lastUsedAt: r.last_used_at }))
}

/**
 * Everything of an account, in one batch: its saved tanks, pending email codes for its addresses (so a code sent before
 * can't sign in after), sign-ins and sessions, then the account.
 */
export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM auth_challenges WHERE user_id = ? OR (kind = 'email' AND value IN (SELECT email_hash FROM credentials WHERE user_id = ? AND email_hash IS NOT NULL))`).bind(userId, userId),
    ...['tank_records', 'plug_links', 'credentials', 'sessions'].map(t => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId)),
    db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId),
  ])
}

/** Removes a sign-in method unless it is the account's last (checked in the same statement, so two at once can't both go). */
export async function removeMethod(db: D1Database, userId: string, id: string): Promise<'removed' | 'last' | 'not_found'> {
  const r = await db.prepare(`DELETE FROM credentials WHERE id = ? AND user_id = ? AND (SELECT COUNT(*) FROM credentials WHERE user_id = ?) > 1`).bind(id, userId, userId).run()
  if (r.meta.changes) return 'removed'
  return (await db.prepare(`SELECT 1 FROM credentials WHERE id = ? AND user_id = ?`).bind(id, userId).first()) ? 'last' : 'not_found'
}
