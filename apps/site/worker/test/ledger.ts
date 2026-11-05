import { FishIdLedger, type LedgerDay, type LedgerStore } from '../fishid/ledger'

/**
 * A Durable Object's storage in memory: values cloned as the real one serializes them. `slow`: every read and write
 * waits a turn of the event loop, so parallel requests interleave wherever the ledger waits.
 */
export function memoryStorage(opts: { slow?: boolean } = {}): LedgerStore & { m: Map<string, unknown> } {
  const m = new Map<string, unknown>()
  const turn = () => (opts.slow ? new Promise(r => setTimeout(r, 0)) : Promise.resolve())
  return {
    m,
    get: async <T>(k: string) => { await turn(); const v = m.get(k); return v === undefined ? undefined : structuredClone(v) as T },
    put: async <T>(k: string, v: T) => { await turn(); m.set(k, structuredClone(v)) },
    delete: async (k: string) => m.delete(k),
    list: async <T>({ prefix }: { prefix: string }) => new Map([...m].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v) as T])),
  }
}

/** The FISHID_LEDGER binding over one ledger in memory, reached as the Worker reaches it (a fetch per operation); `day` reads what it stored. */
export function memoryLedger(storage = memoryStorage()) {
  const obj = new FishIdLedger({ storage })
  const ns = { idFromName: (n: string) => n, get: () => ({ fetch: (r: Request) => obj.fetch(r) }) } as unknown as DurableObjectNamespace
  return { ns, storage, day: (d = new Date().toISOString().slice(0, 10)) => storage.m.get(`day:${d}`) as LedgerDay | undefined }
}
