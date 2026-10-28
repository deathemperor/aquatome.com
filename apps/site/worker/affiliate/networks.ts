export const NETWORK_IDS = ['shopee', 'lazada', 'tiki'] as const
export type NetworkId = (typeof NETWORK_IDS)[number]
export type Product = { id: string; network: NetworkId; url: string; price_vnd: number | null; status: 'active' | 'inactive'; fail_count: number; checked_at: string | null }
export type CheckResult = { result: 'ok'; price_vnd?: number } | { result: 'dead'; detail: string } | { result: 'unknown'; detail?: string }
export type AffEnv = Partial<Record<`AFF_TEMPLATE_${Uppercase<NetworkId>}`, string>>

export type Adapter = {
  id: NetworkId
  /** Hosts a plain (unwrapped) link may point to. */
  hosts: string[]
  searchUrl: (keyword: string) => string
  /** Official API check; 'unknown' until the network's API credentials exist (never deactivates). */
  check: (p: Product, env: AffEnv) => Promise<CheckResult>
}

const noApi = async (): Promise<CheckResult> => ({ result: 'unknown', detail: 'no API credentials' })

export const NETWORKS: Record<NetworkId, Adapter> = {
  shopee: { id: 'shopee', hosts: ['shopee.vn', 's.shopee.vn', 'shope.ee'], searchUrl: k => `https://shopee.vn/search?keyword=${encodeURIComponent(k)}`, check: noApi },
  lazada: { id: 'lazada', hosts: ['www.lazada.vn', 's.lazada.vn', 'c.lazada.vn'], searchUrl: k => `https://www.lazada.vn/catalog/?q=${encodeURIComponent(k)}`, check: noApi },
  tiki: { id: 'tiki', hosts: ['tiki.vn'], searchUrl: k => `https://tiki.vn/search?q=${encodeURIComponent(k)}`, check: noApi },
}
export const isNetwork = (n: unknown): n is NetworkId => typeof n === 'string' && (NETWORK_IDS as readonly string[]).includes(n)

const templateOf = (n: NetworkId, env: AffEnv) => env[`AFF_TEMPLATE_${n.toUpperCase() as Uppercase<NetworkId>}`]

/** Owner-provided deeplink template (AccessTrade, Involve Asia, a network's own), e.g. https://go.isclix.com/deep_link/ID?url={url}. */
export function wrap(n: NetworkId, url: string, env: AffEnv): string {
  const t = templateOf(n, env)
  return t && t.startsWith('https://') && t.includes('{url}') ? t.replace('{url}', encodeURIComponent(url)) : url
}

/** Marketplace search for the keyword, wrapped when allowed; the link that never dies. */
export function searchTarget(n: NetworkId, keyword: string, env: AffEnv): string {
  const plain = NETWORKS[n].searchUrl(keyword)
  const wrapped = wrap(n, plain, env)
  return allowedTarget(n, wrapped, env) ? wrapped : plain
}

/** Redirect targets are limited to the network's hosts and the host of its configured template: never an open redirect. */
export function allowedTarget(n: NetworkId, location: string, env: AffEnv): boolean {
  try {
    const u = new URL(location)
    if (u.protocol !== 'https:') return false
    const t = templateOf(n, env)
    const tHost = t?.startsWith('https://') ? new URL(t.replace('{url}', 'x')).host : undefined
    return NETWORKS[n].hosts.includes(u.host) || u.host === tHost
  } catch {
    return false
  }
}
