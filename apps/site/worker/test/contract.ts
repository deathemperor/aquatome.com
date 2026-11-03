import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

/**
 * A contract in protocols/ the app builds against, for checking the Worker's answers: every answer's status is one the
 * contract lists, and its body has the contract's shape (talk.test.ts, fishid.test.ts).
 */
export type Schema = { $ref?: string; type?: string | string[]; required?: string[]; properties?: Record<string, Schema>; additionalProperties?: boolean; items?: Schema; enum?: unknown[]; const?: unknown; minimum?: number; minLength?: number; maxLength?: number; pattern?: string }
export type Op = { responses: Record<string, { description: string; content: { 'application/json': { schema: Schema } } }> }

export function contract(file: string) {
  const api = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../protocols/${file}`, import.meta.url).href), 'utf8'))
  const resolve = (s: Schema): Schema => (s.$ref ? resolve(s.$ref.slice(2).split('/').reduce((o, k) => o[k], api)) : s)

  /** What in `v` the schema refuses: [] when it conforms. */
  function misfits(v: unknown, schema: Schema, at = '$'): string[] {
    const s = resolve(schema)
    const out: string[] = []
    const types = [s.type ?? []].flat()
    if (v === null && types.includes('null')) return out
    const type = types.find(t => t !== 'null')
    if (s.const !== undefined && v !== s.const) out.push(`${at}: ${JSON.stringify(v)} is not ${JSON.stringify(s.const)}`)
    if (s.enum && !s.enum.includes(v)) out.push(`${at}: ${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum)}`)
    if (type === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return [...out, `${at}: not an object`]
      const o = v as Record<string, unknown>
      for (const k of s.required ?? []) if (!(k in o)) out.push(`${at}.${k}: missing`)
      for (const [k, p] of Object.entries(s.properties ?? {})) if (k in o) out.push(...misfits(o[k], p, `${at}.${k}`))
      if (s.additionalProperties === false) for (const k of Object.keys(o)) if (!(k in (s.properties ?? {}))) out.push(`${at}.${k}: not allowed`)
    } else if (type === 'array') {
      if (!Array.isArray(v)) return [...out, `${at}: not an array`]
      v.forEach((x, i) => out.push(...misfits(x, s.items ?? {}, `${at}[${i}]`)))
    } else if (type === 'string') {
      if (typeof v !== 'string') return [...out, `${at}: not a string`]
      if (v.length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity)) out.push(`${at}: length ${v.length}`)
      if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${at}: ${JSON.stringify(v)} doesn't match ${s.pattern}`)
    } else if (type === 'integer') {
      if (!Number.isInteger(v) || (v as number) < (s.minimum ?? -Infinity)) out.push(`${at}: not an integer ≥ ${s.minimum}`)
    } else if (type === 'number') {
      if (typeof v !== 'number' || v < (s.minimum ?? -Infinity)) out.push(`${at}: not a number ≥ ${s.minimum}`)
    } else if (type === 'boolean' && typeof v !== 'boolean') out.push(`${at}: not a boolean`)
    return out
  }

  /** The answer's body, after checking it against the contract's answer for its status; an error's code is one it names. */
  async function answer(path: string, method: 'get' | 'post' | 'delete', res: Response): Promise<Record<string, unknown>> {
    const body = (await res.json()) as Record<string, unknown>
    const r = (api.paths[path][method] as Op).responses[String(res.status)]
    expect(r, `${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(body)} is not in the contract`).toBeDefined()
    expect(misfits(body, r!.content['application/json'].schema), `${method.toUpperCase()} ${path} → ${res.status}`).toEqual([])
    if (res.status >= 400) {
      const codes = r!.description.replace(/^Error: /, '').split(' | ').map(c => c.replace(/ \(.*\)$/, ''))
      expect(codes, `${method.toUpperCase()} ${path} → ${res.status}`).toContain(body.error)
    }
    return body
  }
  return { api, misfits, answer }
}
