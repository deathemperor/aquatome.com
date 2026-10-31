import { hmac, randomToken, sha256 } from './session'

/**
 * Sign-in by email link. The address is used once, to send the link, and never stored: the account keeps its keyed hash
 * (HMAC with ACCOUNT_HMAC_KEY; never rotate that key, or email sign-ins stop finding their accounts). The link carries a
 * one-time token in its #fragment, which mail scanners that open links don't send to the server; the page posts it.
 */
export const LINK_MINUTES = 15
export type Mail = { to: string; subject: string; text: string }
export type SendMail = (mail: Mail) => Promise<boolean>
export type Lang = 'vi' | 'id' | 'th'

/** The "Bể của tôi" page in each language (apps/site/src/lib/i18n.ts: a test keeps them equal). */
export const TANKS_PAGE: Record<Lang, string> = { vi: '/vi/cong-cu/be-cua-toi/', id: '/id/alat/akuarium-saya/', th: '/th/tools/my-tanks/' }
export const LINK_PARAM = 'dang-nhap'

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/
/** A plausible address, lowercased and trimmed; undefined if not. */
export function normalEmail(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const e = raw.trim().toLowerCase()
  return e.length <= 254 && EMAIL.test(e) ? e : undefined
}
export const emailHash = (key: string, email: string) => hmac(key, `email|${email}`)

const TEXT: Record<Lang, { subject: string; body: (link: string) => string }> = {
  vi: {
    subject: 'Đăng nhập AquaTome',
    body: link => `Bấm vào link dưới đây để đăng nhập AquaTome và đồng bộ bể của bạn:\n\n${link}\n\nLink dùng được một lần, trong ${LINK_MINUTES} phút. Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.`,
  },
  id: {
    subject: 'Masuk ke AquaTome',
    body: link => `Klik tautan di bawah ini untuk masuk ke AquaTome dan menyinkronkan akuarium Anda:\n\n${link}\n\nTautan hanya bisa dipakai sekali, dalam ${LINK_MINUTES} menit. Jika Anda tidak meminta untuk masuk, abaikan email ini.`,
  },
  th: {
    subject: 'เข้าสู่ระบบ AquaTome',
    body: link => `คลิกลิงก์ด้านล่างเพื่อเข้าสู่ระบบ AquaTome และซิงค์ตู้ปลาของคุณ:\n\n${link}\n\nลิงก์ใช้ได้ครั้งเดียว ภายใน ${LINK_MINUTES} นาที หากคุณไม่ได้ขอเข้าสู่ระบบ ไม่ต้องสนใจอีเมลนี้`,
  },
}

/** Makes the one-time token (stored as its hash, with the address's hash) and the mail with the link. */
export async function emailLink(db: D1Database, key: string, email: string, lang: Lang, origin: string, now: Date): Promise<Mail> {
  const token = randomToken()
  await db.prepare(`INSERT INTO auth_challenges (id, kind, value, expires_at) VALUES (?, 'email', ?, ?)`)
    .bind(await sha256(token), await emailHash(key, email), new Date(now.getTime() + LINK_MINUTES * 60_000).toISOString()).run()
  const link = `${origin}${TANKS_PAGE[lang]}#${LINK_PARAM}=${token}`
  return { to: email, subject: TEXT[lang].subject, text: TEXT[lang].body(link) }
}

/** Uses up a one-time value: its stored value if it exists, is of this kind and hasn't expired. Gone either way. */
export async function consume(db: D1Database, kind: 'email' | 'nonce' | 'passkey-login' | 'passkey-register', secret: string, now: Date): Promise<{ value: string; userId: string | null } | undefined> {
  const row = await db.prepare(`DELETE FROM auth_challenges WHERE id = ? AND kind = ? RETURNING value, user_id, expires_at`).bind(await sha256(secret), kind)
    .first<{ value: string; user_id: string | null; expires_at: string }>()
  return row && row.expires_at > now.toISOString() ? { value: row.value, userId: row.user_id } : undefined
}
