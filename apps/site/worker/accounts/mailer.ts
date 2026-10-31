import type { SendMail } from './email'

/**
 * Sign-in codes go out through Cloudflare Email Sending (the `send_email` binding EMAIL, wrangler.jsonc), from
 * aquatome.com, which is onboarded for sending in the Cloudflare dashboard. Plain text only.
 */
export type EmailBinding = {
  send(message: { to: string; from: { email: string; name: string }; subject: string; text: string }): Promise<{ messageId: string }>
}
export const MAIL_FROM = { email: 'dang-nhap@aquatome.com', name: 'AquaTome' }

/** A SendMail over the binding: false when Cloudflare refuses (logged by its error code, never the address). */
export function cloudflareMailer(binding: EmailBinding, log: (...a: unknown[]) => void = console.error): SendMail {
  return async mail => {
    try {
      await binding.send({ to: mail.to, from: MAIL_FROM, subject: mail.subject, text: mail.text })
      return true
    } catch (e) {
      log('sign-in mail not sent:', (e as { code?: string }).code ?? (e as Error).message)
      return false
    }
  }
}
