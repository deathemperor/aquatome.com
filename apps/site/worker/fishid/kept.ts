/**
 * Photos a reader lets AquaTome keep, ticking "Cho phép AquaTome giữ ảnh này để cải thiện nhận diện" (the fish-ID page,
 * the app): in the private UPLOADS bucket, fish-id/<account>/<id>, or fish-id/anon/<id> when sent signed out (tied to
 * no one), with the date and Claude's result as the object's metadata. No address, location or file name, and the
 * JPEG's own metadata (Exif, XMP, IPTC, comments) is cut before it is stored. Only the owner's dashboard shows a
 * photo; a reader lists and deletes their own, without the image (protocols/fishid.openapi.json). Six months on they
 * are deleted: the bucket's lifecycle rule for fish-id/, and sweepKept in the daily cron.
 */
export const KEEP_DAYS = 183
const PREFIX = 'fish-id/'
const ANON = 'anon'
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** An account id as accounts/users.ts makes them (randomUUID), and only such: a key is never built from anything else. */
const ACCOUNT = /^[0-9a-z-]{1,64}$/
const named = (account: string | undefined, id: string) => ID.test(id) && (account === undefined || (account !== ANON && ACCOUNT.test(account)))

export type KeptGuess = { scientificName: string; commonName: string; variety: string | null; confidence: number }
/** A kept photo as its reader sees it: no image, no key. */
export type Kept = { id: string; created: string; verdict: string; guesses: KeptGuess[] }
/** As the owner's dashboard sees it: whose (an account id, or none), the model and language, and its run's transcript (fishid/transcript.ts). */
export type KeptRow = Kept & { account?: string; model: string; lang: string; run?: { day: string; id: string } }

/**
 * The JPEG without its APP1 (Exif, XMP), APP13 (IPTC) and comment segments; null when it isn't a JPEG this can walk.
 * The page and the app already send a re-encoded JPEG: this is for what they missed.
 */
export function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null
  const keep: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  for (;;) {
    if (i + 4 > b.length || b[i] !== 0xff) return null
    const marker = b[i + 1]!
    // Start of scan: the image data runs to the end.
    if (marker === 0xda) { keep.push(b.subarray(i)); break }
    const len = (b[i + 2]! << 8) | b[i + 3]!
    if (len < 2 || i + 2 + len > b.length) return null
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) keep.push(b.subarray(i, i + 2 + len))
    i += 2 + len
  }
  const out = new Uint8Array(keep.reduce((n, k) => n + k.length, 0))
  let o = 0
  for (const k of keep) { out.set(k, o); o += k.length }
  return out
}

const key = (account: string | undefined, id: string) => `${PREFIX}${account ?? ANON}/${id}`
const cut = (s: string, n: number) => s.slice(0, n)

/** Keeps a JPEG with its result; its id, or null when it isn't a JPEG (nothing kept). */
export async function keepPhoto(bucket: R2Bucket, account: string | undefined, jpeg: Uint8Array, r: { verdict: string; guesses: KeptGuess[]; model: string; lang: string; run?: string }, now: Date): Promise<string | null> {
  const bytes = stripJpeg(jpeg)
  if (!bytes) return null
  const id = crypto.randomUUID()
  // Custom metadata is 2 KB at most: the top 3 guesses, names cut short, no reasons.
  const guesses = r.guesses.slice(0, 3).map(g => ({ scientificName: cut(g.scientificName, 80), commonName: cut(g.commonName, 80), variety: g.variety ? cut(g.variety, 60) : null, confidence: Math.round(g.confidence * 100) / 100 }))
  await bucket.put(key(account, id), bytes, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { created: now.toISOString(), verdict: r.verdict, guesses: JSON.stringify(guesses), model: cut(r.model, 60), lang: r.lang, ...(r.run ? { run: r.run } : {}) },
  })
  return id
}

type Listed = { key: string; uploaded: Date; customMetadata?: Record<string, string> }
async function listAll(bucket: R2Bucket, prefix: string): Promise<Listed[]> {
  const out: Listed[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor, include: ['customMetadata'] })
    out.push(...page.objects)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return out
}
const row = (o: Listed): KeptRow => {
  const m = o.customMetadata ?? {}
  const [, owner = '', id = ''] = o.key.slice(PREFIX.length).match(/^([^/]+)\/(.+)$/) ?? []
  let guesses: KeptGuess[] = []
  try { guesses = JSON.parse(m.guesses ?? '[]') as KeptGuess[] } catch { /* an old or broken record: no guesses */ }
  const created = m.created ?? o.uploaded.toISOString()
  // Its run's transcript is kept under the day the run began, which is the photo's (kept in the same run).
  const run = m.run && ID.test(m.run) ? { day: created.slice(0, 10), id: m.run } : undefined
  return { id, created, verdict: m.verdict ?? '', guesses, model: m.model ?? '', lang: m.lang ?? '', ...(owner !== ANON ? { account: owner } : {}), ...(run ? { run } : {}) }
}
const newestFirst = (a: Kept, b: Kept) => b.created.localeCompare(a.created)

/** A reader's kept photos, newest first. */
export async function listKept(bucket: R2Bucket, account: string): Promise<Kept[]> {
  return (await listAll(bucket, `${PREFIX}${account}/`)).map(row).map(({ id, created, verdict, guesses }) => ({ id, created, verdict, guesses })).sort(newestFirst)
}

/** Deletes one of a reader's photos (or, for the owner, anyone's: `account` undefined is a signed-out one); false when there was none. */
export async function deleteKept(bucket: R2Bucket, account: string | undefined, id: string): Promise<boolean> {
  if (!named(account, id)) return false
  const k = key(account, id)
  if (!(await bucket.head(k))) return false
  await bucket.delete(k)
  return true
}

/** Everything an account kept, when the account is deleted. */
export async function deleteAllKept(bucket: R2Bucket, account: string): Promise<void> {
  const keys = (await listAll(bucket, `${PREFIX}${account}/`)).map(o => o.key)
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000))
}

/** The daily cron: photos kept KEEP_DAYS or longer are deleted (the lifecycle rule should have done it). How many. */
export async function sweepKept(bucket: R2Bucket, now: Date): Promise<number> {
  const cutoff = now.getTime() - KEEP_DAYS * 86_400_000
  const old = (await listAll(bucket, PREFIX)).filter(o => o.uploaded.getTime() <= cutoff).map(o => o.key)
  for (let i = 0; i < old.length; i += 1000) await bucket.delete(old.slice(i, i + 1000))
  return old.length
}

/** The owner's dashboard: the newest `limit`. */
export async function recentKept(bucket: R2Bucket, limit = 120): Promise<KeptRow[]> {
  return (await listAll(bucket, PREFIX)).map(row).sort(newestFirst).slice(0, limit)
}

/** One photo's bytes, for the owner's dashboard only. */
export async function keptImage(bucket: R2Bucket, account: string | undefined, id: string): Promise<R2ObjectBody | null> {
  if (!named(account, id)) return null
  return bucket.get(key(account, id))
}
