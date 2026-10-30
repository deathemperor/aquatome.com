import { langOf, localizePath } from '../lib/i18n'
/**
 * UI text in browser scripts: ct('Vietnamese string', { n }). Vietnamese pages use the string as is; other languages'
 * pages carry the translations of every ct() string (Base.astro, from src/i18n/client.json, which
 * scripts/i18n-client.mjs builds from the ct() calls in src/).
 */
let dict: Record<string, string> | undefined
export function ct(s: string, vars?: Record<string, string | number>): string {
  dict ??= JSON.parse(document.getElementById('aq-i18n')?.textContent || '{}') as Record<string, string>
  const out = dict[s] ?? s
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out
}

/** A /vi/… link a browser script writes, in the page's language (lib/i18n localizePath; no dictionaries come along). */
export const cpath = (path: string) => localizePath(langOf(location.pathname), path)
