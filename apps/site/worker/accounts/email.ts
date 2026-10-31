import { hmac, randomToken, sha256 } from './session'

/**
 * Sign-in by email. The address is used once, to send a 6-digit code, and never stored: the account keeps its keyed hash
 * (HMAC with ACCOUNT_HMAC_KEY; never rotate that key, or email sign-ins stop finding their accounts).
 *
 * The code only works with the `flow` secret that the browser or app which asked for it holds. So a code (or a link
 * carrying one) that someone else asked for can't sign this browser in, or add their address to this account. The mail's
 * link puts the code in the #fragment (mail scanners that open links don't send it); the page that asked fills it in.
 */
export const CODE_MINUTES = 15
export const MAX_ATTEMPTS = 5
export type Mail = { to: string; subject: string; text: string }
export type SendMail = (mail: Mail) => Promise<boolean>
export type Lang = 'vi' | 'id' | 'th'

/** The "Bể của tôi" page in each language (apps/site/src/lib/i18n.ts: a test keeps them equal). */
export const TANKS_PAGE: Record<Lang, string> = { vi: '/vi/cong-cu/be-cua-toi/', id: '/id/alat/akuarium-saya/', th: '/th/tools/my-tanks/' }
export const LINK_PARAM = 'ma'

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/
/** A plausible address, lowercased and trimmed; undefined if not. */
export function normalEmail(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const e = raw.trim().toLowerCase()
  return e.length <= 254 && EMAIL.test(e) ? e : undefined
}
export const emailHash = (key: string, email: string) => hmac(key, `email|${email}`)

const TEXT: Record<Lang, { subject: (code: string) => string; body: (code: string, link: string) => string }> = {
  vi: {
    subject: code => `${code} là mã đăng nhập AquaTome`,
    body: (code, link) => `Mã đăng nhập AquaTome của bạn: ${code}\n\nNhập mã vào trang bạn vừa yêu cầu, hoặc mở link này trên đúng trình duyệt đó:\n${link}\n\nMã dùng được một lần, trong ${CODE_MINUTES} phút. Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.`,
  },
  id: {
    subject: code => `${code} adalah kode masuk AquaTome`,
    body: (code, link) => `Kode masuk AquaTome Anda: ${code}\n\nMasukkan kode di halaman tempat Anda memintanya, atau buka tautan ini di browser yang sama:\n${link}\n\nKode hanya bisa dipakai sekali, dalam ${CODE_MINUTES} menit. Jika Anda tidak meminta untuk masuk, abaikan email ini.`,
  },
  th: {
    subject: code => `${code} คือรหัสเข้าสู่ระบบ AquaTome`,
    body: (code, link) => `รหัสเข้าสู่ระบบ AquaTome ของคุณ: ${code}\n\nกรอกรหัสในหน้าที่คุณขอรหัส หรือเปิดลิงก์นี้ในเบราว์เซอร์เดียวกัน:\n${link}\n\nรหัสใช้ได้ครั้งเดียว ภายใน ${CODE_MINUTES} นาที หากคุณไม่ได้ขอเข้าสู่ระบบ ไม่ต้องสนใจอีเมลนี้`,
  },
}

/** Six random digits, uniform. */
function sixDigits(): string {
  const n = new Uint32Array(1)
  do crypto.getRandomValues(n)
  while (n[0]! >= 4_294_000_000) // 4 294 000 000 = 4294 × 10^6: no bias
  return String(n[0]! % 1_000_000).padStart(6, '0')
}

/**
 * Starts an email sign-in: the `flow` secret for the client that asked (stored as its hash, with the address's hash, the
 * code's hash and the signed-in account if any) and the mail with the code.
 */
export async function startEmail(db: D1Database, key: string, email: string, lang: Lang, origin: string, signedIn: string | undefined, now: Date): Promise<{ flow: string; mail: Mail }> {
  const flow = randomToken()
  const code = sixDigits()
  await db.prepare(`INSERT INTO auth_challenges (id, kind, value, user_id, code, expires_at) VALUES (?, 'email', ?, ?, ?, ?)`)
    .bind(await sha256(flow), await emailHash(key, email), signedIn ?? null, await sha256(`${flow}|${code}`), new Date(now.getTime() + CODE_MINUTES * 60_000).toISOString()).run()
  const link = `${origin}${TANKS_PAGE[lang]}#${LINK_PARAM}=${code}`
  return { flow, mail: { to: email, subject: TEXT[lang].subject(code), text: TEXT[lang].body(code, link) } }
}

/**
 * The address hash (and the account that started it) when `code` is right for `flow`. Every try counts; after
 * MAX_ATTEMPTS wrong ones, or once used, or after CODE_MINUTES, the flow is gone.
 */
export async function checkEmail(db: D1Database, flow: string, code: string, now: Date): Promise<{ value: string; userId: string | null } | undefined> {
  const id = await sha256(flow)
  const row = await db.prepare(`UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ? AND kind = 'email' RETURNING value, user_id, code, attempts, expires_at`).bind(id)
    .first<{ value: string; user_id: string | null; code: string; attempts: number; expires_at: string }>()
  if (!row) return undefined
  const right = /^\d{6}$/.test(code) && row.code === (await sha256(`${flow}|${code}`))
  if (right || row.attempts >= MAX_ATTEMPTS || row.expires_at <= now.toISOString()) await db.prepare(`DELETE FROM auth_challenges WHERE id = ?`).bind(id).run()
  return right && row.expires_at > now.toISOString() ? { value: row.value, userId: row.user_id } : undefined
}

/** Uses up a one-time value: its stored value if it exists, is of this kind and hasn't expired. Gone either way. */
export async function consume(db: D1Database, kind: 'nonce' | 'passkey-login' | 'passkey-register', secret: string, now: Date): Promise<{ value: string; userId: string | null } | undefined> {
  const row = await db.prepare(`DELETE FROM auth_challenges WHERE id = ? AND kind = ? RETURNING value, user_id, expires_at`).bind(await sha256(secret), kind)
    .first<{ value: string; user_id: string | null; expires_at: string }>()
  return row && row.expires_at > now.toISOString() ? { value: row.value, userId: row.user_id } : undefined
}
