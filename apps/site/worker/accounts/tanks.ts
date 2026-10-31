import { DeviceRecord, STORED_MAX, STORE_VERSION, TankRecord, isTombstone, mergeRecords, newer, type TankStore as Store } from '@aq/schema/tanks'

/**
 * An account's saved tanks and devices (docs/my-tanks-sync.md). Each record is stored as its JSON; the merge rule
 * (`newer` in packages/schema) runs inside the upsert, so two syncs at once can't undo each other.
 */
export const MAX_RECORD_BYTES = 16_384
/** All of an account's records together (a tank with notes and 200 species is ~15 KB; most are well under 2 KB). */
export const MAX_ACCOUNT_BYTES = 1_000_000
/** Tombstones kept per kind; past it the oldest go (a device offline since then could bring those records back). */
export const MAX_TOMBSTONES = 1000
const MAX_SENT = 2000
const LOCK_MS = 30_000
type Kind = 'tank' | 'device'
type Rec = { id: string; updatedAt: string; deletedAt?: string; createdAt?: string }
export type Refused = { kind: Kind; id: string | null; issues: { path: PropertyKey[]; message: string }[] }

export async function loadStore(db: D1Database, userId: string): Promise<Store> {
  const { results } = await db.prepare(`SELECT kind, body FROM tank_records WHERE user_id = ? ORDER BY kind, id`).bind(userId).all<{ kind: Kind; body: string }>()
  const of = (k: Kind) => results.filter(r => r.kind === k).map(r => JSON.parse(r.body))
  return { v: STORE_VERSION, tanks: of('tank'), devices: of('device') }
}

/** A time later than the server's own clock becomes the server's time: a phone whose clock runs fast can't win every merge. */
export function clampFuture<R extends Rec>(r: R, now: string): R {
  const out = { ...r }
  if (out.updatedAt > now) out.updatedAt = now
  if (out.deletedAt !== undefined && out.deletedAt > now) out.deletedAt = now
  if (out.createdAt !== undefined && out.createdAt > out.updatedAt) out.createdAt = out.updatedAt
  return out
}

/** The records that validate, one per id; the others listed with why. */
function check(kind: Kind, list: unknown[], now: string): { ok: Rec[]; refused: Refused[] } {
  const schema = kind === 'tank' ? TankRecord : DeviceRecord
  const ok: Rec[] = []
  const refused: Refused[] = []
  for (const raw of list) {
    const p = schema.safeParse(raw)
    const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id.slice(0, 64) : null
    if (!p.success) refused.push({ kind, id, issues: p.error.issues.slice(0, 5).map(i => ({ path: i.path, message: i.message })) })
    else if (JSON.stringify(p.data).length > MAX_RECORD_BYTES) refused.push({ kind, id, issues: [{ path: [], message: `larger than ${MAX_RECORD_BYTES} bytes` }] })
    // A tombstone is stored as its three keys only: nothing of a deleted record, whatever the client sent.
    else ok.push(clampFuture(isTombstone(p.data) ? { id: p.data.id, updatedAt: p.data.updatedAt, deletedAt: p.data.deletedAt } : (p.data as Rec), now))
  }
  return { ok: mergeRecords([], ok), refused }
}

export type SyncResult = { store: Store; refused: Refused[] } | { error: 'bad_store' | 'too_many' | 'busy' }

/**
 * Merges a client's records into the account's: the account's store after the merge, and the records refused. One sync
 * per account at a time (users.sync_until), so the limits checked before writing still hold after it.
 */
export async function syncStore(db: D1Database, userId: string, body: unknown, now: Date): Promise<SyncResult> {
  const s = body as { v?: unknown; tanks?: unknown; devices?: unknown } | null
  if (!s || s.v !== STORE_VERSION || !Array.isArray(s.tanks) || !Array.isArray(s.devices) || s.tanks.length + s.devices.length > MAX_SENT) return { error: 'bad_store' }
  const at = now.toISOString()
  const locked = await db.prepare(`UPDATE users SET sync_until = ? WHERE id = ? AND (sync_until IS NULL OR sync_until < ?) RETURNING id`)
    .bind(new Date(now.getTime() + LOCK_MS).toISOString(), userId, at).first()
  if (!locked) return { error: 'busy' }
  try {
    const tanks = check('tank', s.tanks, at)
    const devices = check('device', s.devices, at)
    const rows: [Kind, Rec][] = [...tanks.ok.map(r => ['tank', r] as [Kind, Rec]), ...devices.ok.map(r => ['device', r] as [Kind, Rec])]

    // The account's limits hold for the result: what would be live, and its size, after the merge.
    const { results } = await db.prepare(`SELECT kind, id, updated_at, deleted, length(body) AS bytes FROM tank_records WHERE user_id = ?`).bind(userId)
      .all<{ kind: Kind; id: string; updated_at: string; deleted: number; bytes: number }>()
    const after = new Map(results.map(r => [`${r.kind}:${r.id}`, { rec: { id: r.id, updatedAt: r.updated_at, ...(r.deleted ? { deletedAt: r.updated_at } : {}) } as Rec, bytes: r.bytes }]))
    for (const [k, r] of rows) {
      const cur = after.get(`${k}:${r.id}`)
      if (!cur || newer(cur.rec, r) === r) after.set(`${k}:${r.id}`, { rec: r, bytes: JSON.stringify(r).length })
    }
    const kept = [...after].map(([key, v]) => ({ kind: key.slice(0, key.indexOf(':')) as Kind, ...v }))
    const liveCount = (k: Kind) => kept.filter(x => x.kind === k && !isTombstone(x.rec)).length
    const liveBytes = kept.filter(x => !isTombstone(x.rec)).reduce((n, x) => n + x.bytes, 0)
    if (liveCount('tank') > STORED_MAX.tanks || liveCount('device') > STORED_MAX.devices || liveBytes > MAX_ACCOUNT_BYTES) return { error: 'too_many' }

    // Insert, or replace only when the incoming copy wins: later updatedAt, or the same one and a tombstone over a live copy.
    const upsert = db.prepare(`INSERT INTO tank_records (user_id, kind, id, updated_at, deleted, body) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, kind, id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, body = excluded.body
      WHERE excluded.updated_at > tank_records.updated_at OR (excluded.updated_at = tank_records.updated_at AND excluded.deleted = 1 AND tank_records.deleted = 0)`)
    for (let i = 0; i < rows.length; i += 50) {
      await db.batch(rows.slice(i, i + 50).map(([k, r]) => upsert.bind(userId, k, r.id, r.updatedAt, isTombstone(r) ? 1 : 0, JSON.stringify(r))))
    }
    // Only the newest MAX_TOMBSTONES tombstones of each kind stay.
    await db.batch((['tank', 'device'] as const).map(k => db.prepare(`DELETE FROM tank_records WHERE user_id = ? AND kind = ? AND deleted = 1 AND id IN
      (SELECT id FROM tank_records WHERE user_id = ? AND kind = ? AND deleted = 1 ORDER BY updated_at DESC, id LIMIT -1 OFFSET ?)`).bind(userId, k, userId, k, MAX_TOMBSTONES)))
    return { store: await loadStore(db, userId), refused: [...tanks.refused, ...devices.refused] }
  } finally {
    await db.prepare(`UPDATE users SET sync_until = NULL WHERE id = ?`).bind(userId).run()
  }
}
