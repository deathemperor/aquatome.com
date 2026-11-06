/**
 * How the owner gets the daily report: by email, by a notification on the phone, both or neither. One key in KV `AB`,
 * set from /_ab/bao-cao/ or the app (POST /api/owner/report-settings). Unset, it is email on and push off, as before
 * push existed. The report is kept in the log either way (daily/log.ts).
 */
export type ReportSettings = { email: boolean; push: boolean }
export const SETTINGS_KEY = 'report-settings'
export const DEFAULT_SETTINGS: ReportSettings = { email: true, push: false }

export async function getSettings(kv: KVNamespace): Promise<ReportSettings> {
  const v = await kv.get<Partial<ReportSettings>>(SETTINGS_KEY, 'json')
  return {
    email: typeof v?.email === 'boolean' ? v.email : DEFAULT_SETTINGS.email,
    push: typeof v?.push === 'boolean' ? v.push : DEFAULT_SETTINGS.push,
  }
}

/** The change, when it is one or both of the two switches and nothing else; undefined otherwise. */
export function settingsChange(body: unknown): Partial<ReportSettings> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  const o = body as Record<string, unknown>
  const keys = Object.keys(o)
  if (!keys.length || keys.some(k => (k !== 'email' && k !== 'push') || typeof o[k] !== 'boolean')) return undefined
  return o as Partial<ReportSettings>
}

/** Sets one or both; `changed`: false when they were already so (nothing written). */
export async function setSettings(kv: KVNamespace, change: Partial<ReportSettings>): Promise<{ settings: ReportSettings; changed: boolean }> {
  const was = await getSettings(kv)
  const settings = { ...was, ...change }
  const changed = settings.email !== was.email || settings.push !== was.push
  if (changed) await kv.put(SETTINGS_KEY, JSON.stringify(settings))
  return { settings, changed }
}
