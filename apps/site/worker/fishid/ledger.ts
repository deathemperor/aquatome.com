/**
 * The fish-ID tool's counts in one Durable Object (binding FISHID_LEDGER): each reader's day, the site's day and the
 * site's spend at list price. KV can't hold them: its read, compare, write let parallel requests through one place, and
 * a late write could overwrite another request's count.
 *
 * - Admission is one step: the reader's day, the site's count and its spend are checked and counted together, so N
 *   parallel requests at a limit of 1 admit one.
 * - Admission reserves the run's worst cost (api.ts `worstCost`). Each call's cost is recorded as it lands (`spend`);
 *   a run that spends past its reservation raises it. The settle gives back what the run reserved and didn't spend, so
 *   the day's `usd` is never below what the open runs could still cost, and a request is admitted only when the day's
 *   spend plus its reservation stays within the cap.
 * - A run that never settles (cut off past the platform's grace period) keeps the spend its calls recorded, and its
 *   reservation until the next admission past `STALE_MS` gives the unspent part back. A spend that lands after its run
 *   settled still counts.
 * - A reader's count goes back only when the settle says so (api.ts: our side failed). The site's count never does.
 *
 * Atomic in two ways: a Durable Object delivers no other request while one waits on its own storage, and here a day's
 * state is one object in memory that every request shares (loaded once), checked and changed with no wait in between.
 * The classic form (no `cloudflare:workers` import), so the Worker's tests load it in Node with a storage of their own.
 */
export type Counts = {
  /** Agent runs that fell back to today's single call. */
  fallback: number
  /** Agent runs whose last call the call limit forced. */
  callLimit: number
  /** Agent calls after the first that Claude's API refused as our request (400): a reference photo it couldn't fetch, say. */
  later400: number
  /** Facts shards the agent couldn't read (it went on with the page's name only). */
  facts: number
  /** Readers' counts given back. */
  refunds: number
}
/** An open run: its reader key, what it reserved and spent (USD), when it was admitted (ms). */
export type Run = { reader: string; reserved: number; spent: number; at: number }
export type LedgerDay = {
  /** Identifications admitted: the site's day. */
  calls: number
  /** Calls to Claude per key hash, and the answers among them. */
  keys: Record<string, number>
  ok: Record<string, number>
  /** Spend at list price, USD, with the reservations of runs not yet settled. */
  usd: number
  /** Identifications counted per reader key (fishid:ip:… or fishid:acct:…, already hashed with the day). */
  readers: Record<string, number>
  /** Counts given back per reader key. */
  refunds: Record<string, number>
  runs: Record<string, Run>
  counts: Counts
}

export type AdmitInput = { day: string; reader: string; perReader: number; perDay: number; usdCap: number; reserve: number; healthy: boolean }
export type Admitted = { ok: true; run: string } | { ok: false; error: 'rate'; limit: number } | { ok: false; error: 'busy' | 'resting' }
export type SettleInput = { day: string; run: string; refund: boolean; keys: Record<string, number>; ok?: string; counts?: Partial<Counts> }

/** The storage the ledger needs: a Durable Object's, or a map in tests. */
export type LedgerStore = {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  list<T>(options: { prefix: string }): Promise<Map<string, T>>
}

/** Days kept: today and the two before (the dashboard reads today). */
const KEEP_DAYS = 3
/** A run open this long was cut off (a run ends within 30 s): the next admission gives back what it reserved and didn't spend. */
export const STALE_MS = 10 * 60_000
const ZERO: Counts = { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0 }
export const emptyDay = (): LedgerDay => ({ calls: 0, keys: {}, ok: {}, usd: 0, readers: {}, refunds: {}, runs: {}, counts: { ...ZERO } })

export class Ledger {
  private days = new Map<string, Promise<LedgerDay>>()
  constructor(private store: LedgerStore, private newId: () => string = () => crypto.randomUUID(), private clock: () => number = Date.now) {}

  /** The day's state, loaded once and shared by every request after (a new day also clears the days past keeping). */
  private day(d: string): Promise<LedgerDay> {
    let p = this.days.get(d)
    if (!p) {
      p = (async () => {
        const kept = await this.store.get<LedgerDay>(`day:${d}`)
        if (!kept) await this.sweep(d)
        return { ...emptyDay(), ...kept, counts: { ...ZERO, ...kept?.counts } }
      })()
      this.days.set(d, p)
      for (const k of [...this.days.keys()]) if (k < shift(d, -KEEP_DAYS)) this.days.delete(k)
    }
    return p
  }
  private async sweep(d: string) {
    const old = [...(await this.store.list<LedgerDay>({ prefix: 'day:' })).keys()].filter(k => k.slice(4) <= shift(d, -KEEP_DAYS))
    for (const k of old) await this.store.delete(k)
  }
  private save(d: string, day: LedgerDay) { return this.store.put(`day:${d}`, day) }

  async admit(a: AdmitInput): Promise<Admitted> {
    const day = await this.day(a.day)
    // From here to the change, no wait: no other request can see the day between the checks and the counts.
    const now = this.clock()
    for (const [id, r] of Object.entries(day.runs)) if (now - r.at > STALE_MS) { day.usd = Math.max(0, day.usd - (r.reserved - r.spent)); delete day.runs[id] }
    const used = day.readers[a.reader] ?? 0
    if (used >= a.perReader) return { ok: false, error: 'rate', limit: a.perReader }
    if (day.calls >= a.perDay || day.usd + a.reserve > a.usdCap) return { ok: false, error: 'busy' }
    if (!a.healthy) return { ok: false, error: 'resting' }
    const run = this.newId()
    day.readers[a.reader] = used + 1
    day.calls++
    day.usd += a.reserve
    day.runs[run] = { reader: a.reader, reserved: a.reserve, spent: 0, at: now }
    await this.save(a.day, day)
    return { ok: true, run }
  }

  /**
   * A call's cost, as soon as it lands: past the run's reservation, the reservation (and the day's spend) grows with it.
   * A run already settled or given up (a spend that arrived late) adds to the day's spend as it is.
   */
  async spend(d: string, run: string, usd: number): Promise<void> {
    if (!(usd > 0)) return
    const day = await this.day(d)
    const r = day.runs[run]
    if (!r) { day.usd += usd; return this.save(d, day) }
    r.spent += usd
    if (r.spent > r.reserved) { day.usd += r.spent - r.reserved; r.reserved = r.spent }
    await this.save(d, day)
  }

  /** The run's end: what it reserved and didn't spend goes back to the day; the reader's count too when `refund`. */
  async settle(s: SettleInput): Promise<void> {
    const day = await this.day(s.day)
    const r = day.runs[s.run]
    if (!r) return
    delete day.runs[s.run]
    day.usd = Math.max(0, day.usd - (r.reserved - r.spent))
    for (const [h, n] of Object.entries(s.keys)) day.keys[h] = (day.keys[h] ?? 0) + n
    if (s.ok) day.ok[s.ok] = (day.ok[s.ok] ?? 0) + 1
    for (const [k, n] of Object.entries(s.counts ?? {}) as [keyof Counts, number][]) day.counts[k] += n
    if (s.refund) {
      day.readers[r.reader] = Math.max(0, (day.readers[r.reader] ?? 0) - 1)
      day.refunds[r.reader] = (day.refunds[r.reader] ?? 0) + 1
      day.counts.refunds++
    }
    await this.save(s.day, day)
  }

  /** The day as the dashboard reads it: no reader keys, no runs; the biggest number of refunds one reader had. */
  async read(d: string): Promise<DayView> {
    const day = await this.day(d)
    return { calls: day.calls, keys: { ...day.keys }, ok: { ...day.ok }, usd: day.usd, open: Object.keys(day.runs).length, counts: { ...day.counts }, mostRefunds: Math.max(0, ...Object.values(day.refunds)) }
  }
}
export type DayView = { calls: number; keys: Record<string, number>; ok: Record<string, number>; usd: number; open: number; counts: Counts; mostRefunds: number }

/** `d` (YYYY-MM-DD) moved by `n` days. */
function shift(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** The Durable Object: one instance (`LEDGER_ID`), the ledger over its storage, a JSON request per operation. */
export class FishIdLedger {
  private ledger: Ledger
  constructor(state: { storage: LedgerStore }) {
    this.ledger = new Ledger(state.storage)
  }
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response(null, { status: 405 })
    const op = new URL(req.url).pathname.slice(1)
    const body = await req.json() as Record<string, unknown>
    if (op === 'admit') return Response.json(await this.ledger.admit(body as AdmitInput))
    if (op === 'spend') return Response.json(await this.ledger.spend(String(body.day), String(body.run), Number(body.usd)) ?? null)
    if (op === 'settle') return Response.json(await this.ledger.settle(body as SettleInput) ?? null)
    if (op === 'read') return Response.json(await this.ledger.read(String(body.day)))
    return new Response(null, { status: 404 })
  }
}

export const LEDGER_ID = 'ledger'
/** The Worker's side: the one ledger, near the readers (they are in Southeast Asia). */
export function ledgerClient(ns: DurableObjectNamespace) {
  const call = async <T>(op: string, body: unknown): Promise<T> => {
    const res = await ns.get(ns.idFromName(LEDGER_ID), { locationHint: 'apac' }).fetch(new Request(`https://ledger/${op}`, { method: 'POST', body: JSON.stringify(body) }))
    if (!res.ok) throw new Error(`fish-id ledger ${op}: ${res.status}`)
    return res.json() as Promise<T>
  }
  return {
    admit: (a: AdmitInput) => call<Admitted>('admit', a),
    spend: (day: string, run: string, usd: number) => call<null>('spend', { day, run, usd }),
    settle: (s: SettleInput) => call<null>('settle', s),
    read: (day: string) => call<DayView>('read', { day }),
  }
}
export type LedgerClient = ReturnType<typeof ledgerClient>
