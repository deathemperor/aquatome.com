import { isSkin, type Skin } from './skins'

export type EventType = 'view' | 'scroll' | 'time' | 'aff'
export type AbEvent = { s: Skin; p: string; t: EventType; v: number; sid: string }
const TYPES = new Set<string>(['view', 'scroll', 'time', 'aff'])

/** Validate a beacon payload; anything unexpected is dropped. */
export function parseEvent(body: string): AbEvent | null {
  if (body.length > 4096) return null
  let e: Record<string, unknown>
  try { e = JSON.parse(body) } catch { return null }
  if (!e || typeof e !== 'object') return null
  const { s, p, t, v, sid } = e
  if (!isSkin(s) || typeof t !== 'string' || !TYPES.has(t)) return null
  if (typeof p !== 'string' || !p.startsWith('/') || p.length > 200) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e6) return null
  if (typeof sid !== 'string' || !/^[a-z0-9]{12}$/.test(sid)) return null
  return { s, p, t: t as EventType, v, sid }
}

/** Analytics Engine layout: blob1 skin, blob2 type, blob3 path, blob4 session; double1 value; index skin. */
export const toDataPoint = (e: AbEvent) => ({ blobs: [e.s, e.t, e.p, e.sid], doubles: [e.v], indexes: [e.s] })
