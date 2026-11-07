import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

/**
 * A contract in protocols/ the app builds against, for checking the Worker's answers: every answer's status is one the
 * contract lists, and its body has the contract's shape (talk.test.ts, fishid.test.ts).
 */
export type Schema = {
  $ref?: string; type?: string | string[]; required?: string[]; properties?: Record<string, Schema>; additionalProperties?: boolean | Schema; propertyNames?: Schema
  minProperties?: number; items?: Schema; minItems?: number; maxItems?: number; oneOf?: Schema[]; anyOf?: Schema[]; allOf?: Schema[]; not?: Schema; enum?: unknown[]; const?: unknown
  minimum?: number; maximum?: number; exclusiveMinimum?: number; exclusiveMaximum?: number; minLength?: number; maxLength?: number; pattern?: string
}
/**
 * A response's body by media type; a text/event-stream one names each event's schema (`x-events`), the events that end
 * it (`x-end`: `result` and `error` when missing, as fish ID's), the order its other events come in (`x-order`: all of
 * one name before the next name's first), the end event that holds the whole of what was streamed (`x-whole`: its
 * `text` the `text` events' pieces joined, its `blocks` the `block` events, its `steps` the `step` events; chat's
 * `done`) and the recorded streams that follow it (`x-fixtures`, files in protocols/).
 */
export type Media = { schema: Schema; 'x-events'?: Record<string, Schema>; 'x-end'?: string[]; 'x-order'?: string[]; 'x-whole'?: string; 'x-fixtures'?: string[] }
export type Op = { responses: Record<string, { description: string; content: { 'application/json': Media; 'text/event-stream'?: Media } }> }

/** One block of a server-sent events body: an event with its data, or a comment line (`: ping`). */
export type SseBlock = { event?: string; data?: string; comment?: string }
/** A text/event-stream body's blocks, in order (blocks end at a blank line). */
export function parseSse(text: string): SseBlock[] {
  return text.split(/\n\n/).filter(b => b.trim()).map(b => {
    const out: SseBlock = {}
    for (const line of b.split('\n')) {
      if (line.startsWith(':')) out.comment = line.slice(1).trim()
      else if (line.startsWith('event: ')) out.event = line.slice(7)
      else if (line.startsWith('data: ')) out.data = (out.data === undefined ? '' : `${out.data}\n`) + line.slice(6)
      else out.comment = `not an SSE line: ${line}`
    }
    return out
  })
}

const read = (file: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../protocols/${file}`, import.meta.url).href), 'utf8'))

export function contract(file: string) {
  const api = read(file)
  // A schema and the file its own $refs are in: a `#/…` ref is in the same file, a `<file>#/…` one in that file of
  // protocols/ (the chat's sections hold page.schema.json's blocks).
  type In = { s: Schema; doc: unknown }
  const docs = new Map<string, unknown>([[file, api]])
  const resolve = ({ s, doc }: In): In => {
    if (!s.$ref) return { s, doc }
    const [name, pointer] = s.$ref.split('#')
    const target = name ? (docs.get(name) ?? docs.set(name, read(name)).get(name)) : doc
    return resolve({ s: pointer!.slice(1).split('/').reduce((o: any, k) => o[k], target), doc: target })
  }

  /** What in `v` the schema refuses: [] when it conforms. */
  function misfits(v: unknown, schema: Schema, at = '$', within: unknown = api): string[] {
    const { s, doc } = resolve({ s: schema, doc: within })
    const fit = (x: unknown, sub: Schema, where: string) => misfits(x, sub, where, doc)
    const out: string[] = []
    // oneOf: exactly one of its schemas takes the value; anyOf: at least one.
    if (s.oneOf) {
      const fits = s.oneOf.filter(x => !fit(v, x, at).length).length
      if (fits !== 1) out.push(`${at}: fits ${fits} of oneOf's ${s.oneOf.length} schemas, not 1`)
    }
    if (s.anyOf && !s.anyOf.some(x => !fit(v, x, at).length)) out.push(`${at}: fits none of anyOf's ${s.anyOf.length} schemas`)
    for (const x of s.allOf ?? []) out.push(...fit(v, x, at))
    if (s.not && !fit(v, s.not, at).length) out.push(`${at}: is what \`not\` refuses`)
    const types = [s.type ?? []].flat()
    if (v === null && types.includes('null')) return out
    const type = types.find(t => t !== 'null')
    if (s.const !== undefined && v !== s.const) out.push(`${at}: ${JSON.stringify(v)} is not ${JSON.stringify(s.const)}`)
    if (s.enum && !s.enum.includes(v)) out.push(`${at}: ${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum)}`)
    if (type === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return [...out, `${at}: not an object`]
      const o = v as Record<string, unknown>
      for (const k of s.required ?? []) if (!(k in o)) out.push(`${at}.${k}: missing`)
      if (Object.keys(o).length < (s.minProperties ?? 0)) out.push(`${at}: fewer than ${s.minProperties} properties`)
      for (const [k, p] of Object.entries(s.properties ?? {})) if (k in o) out.push(...fit(o[k], p, `${at}.${k}`))
      for (const k of Object.keys(o)) {
        if (s.propertyNames) out.push(...fit(k, s.propertyNames, `${at} key ${JSON.stringify(k)}`))
        if (k in (s.properties ?? {}) || s.additionalProperties === undefined || s.additionalProperties === true) continue
        if (s.additionalProperties === false) out.push(`${at}.${k}: not allowed`)
        else out.push(...fit(o[k], s.additionalProperties, `${at}.${k}`))
      }
    } else if (type === 'array') {
      if (!Array.isArray(v)) return [...out, `${at}: not an array`]
      if (v.length < (s.minItems ?? 0) || v.length > (s.maxItems ?? Infinity)) out.push(`${at}: ${v.length} items`)
      v.forEach((x, i) => out.push(...fit(x, s.items ?? {}, `${at}[${i}]`)))
    } else if (type === 'string') {
      if (typeof v !== 'string') return [...out, `${at}: not a string`]
      if (v.length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity)) out.push(`${at}: length ${v.length}`)
      if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${at}: ${JSON.stringify(v)} doesn't match ${s.pattern}`)
    } else if (type === 'integer' || type === 'number') {
      const n = v as number
      if (typeof v !== 'number' || (type === 'integer' && !Number.isInteger(v))) out.push(`${at}: not ${type === 'integer' ? 'an integer' : 'a number'}`)
      else if (n < (s.minimum ?? -Infinity) || n > (s.maximum ?? Infinity) || n <= (s.exclusiveMinimum ?? -Infinity) || n >= (s.exclusiveMaximum ?? Infinity)) {
        out.push(`${at}: ${n} is out of ${s.minimum ?? s.exclusiveMinimum ?? '…'}–${s.maximum ?? s.exclusiveMaximum ?? '…'}`)
      }
    } else if (type === 'boolean' && typeof v !== 'boolean') out.push(`${at}: not a boolean`)
    return out
  }

  /**
   * What in a text/event-stream body the contract refuses: [] when every block is an event `x-events` names with one
   * line of JSON data of its schema, or a comment; and it is zero or more of its other events, then one of `x-end`
   * (fish ID's: steps, then one `result` or `error`), last of all.
   */
  function streamMisfits(text: string, media: Media): string[] {
    const blocks = parseSse(text)
    const out: string[] = []
    const events = blocks.filter(b => b.comment === undefined || b.event !== undefined)
    for (const b of blocks) if (b.comment?.startsWith('not an SSE line')) out.push(b.comment)
    events.forEach((b, i) => {
      const schema = b.event ? media['x-events']?.[b.event] : undefined
      if (!schema) return void out.push(`[${i}]: event ${JSON.stringify(b.event)} is not in the contract`)
      if (b.data === undefined || b.data.includes('\n')) return void out.push(`[${i}] ${b.event}: data is not one line`)
      let v: unknown
      try { v = JSON.parse(b.data) } catch { return void out.push(`[${i}] ${b.event}: data is not JSON`) }
      out.push(...misfits(v, schema, `[${i}] ${b.event}`))
    })
    const names = events.map(b => b.event)
    const ends = media['x-end'] ?? ['result', 'error']
    const end = names.at(-1)
    if (!ends.includes(end!)) out.push(`the stream ends with ${JSON.stringify(end)}, not ${ends.join(' or ')}`)
    if (names.slice(0, -1).some(n => ends.includes(n!))) out.push(`only one of ${ends.join(', ')}, last: ${names.join(', ')}`)
    if (blocks.at(-1)?.event === undefined) out.push('a comment after the last event')
    const order = media['x-order'] ?? []
    const rank = names.map(n => order.indexOf(n!))
    rank.forEach((r, i) => { if (r >= 0 && rank.slice(0, i).some(p => p > r)) out.push(`[${i}] ${names[i]}: after a later kind of event (${order.join(', ')}, in that order)`) })
    const whole = media['x-whole'] && events.find(b => b.event === media['x-whole'])
    if (whole) {
      const data = (name: string) => events.filter(b => b.event === name).map(b => { try { return JSON.parse(b.data!) } catch { return undefined } })
      let turn: { text?: string; blocks?: unknown[]; steps?: unknown[] } = {}
      try { turn = JSON.parse(whole.data!) } catch { /* reported above */ }
      if (data('text').map(p => p?.text).join('') !== turn.text) out.push(`${whole.event}: its text isn't the pieces joined`)
      if (JSON.stringify(data('block')) !== JSON.stringify(turn.blocks ?? [])) out.push(`${whole.event}: its blocks aren't the blocks streamed`)
      if (JSON.stringify(data('step')) !== JSON.stringify(turn.steps ?? [])) out.push(`${whole.event}: its steps aren't the steps streamed`)
    }
    return out
  }

  /** The answer's body, after checking it against the contract's answer for its status; an error's code is one it names. A stream's body is its last event's data. */
  async function answer(path: string, method: 'get' | 'post' | 'delete', res: Response): Promise<Record<string, unknown>> {
    const r = (api.paths[path][method] as Op).responses[String(res.status)]
    if (res.headers.get('content-type')?.startsWith('text/event-stream')) {
      const text = await res.text()
      const media = r?.content['text/event-stream']
      expect(media, `${method.toUpperCase()} ${path} → ${res.status} as a stream is not in the contract`).toBeDefined()
      expect(streamMisfits(text, media!), `${method.toUpperCase()} ${path} → ${res.status} stream`).toEqual([])
      return JSON.parse(parseSse(text).filter(b => b.event).at(-1)!.data!) as Record<string, unknown>
    }
    const body = (await res.json()) as Record<string, unknown>
    expect(r, `${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(body)} is not in the contract`).toBeDefined()
    expect(misfits(body, r!.content['application/json'].schema), `${method.toUpperCase()} ${path} → ${res.status}`).toEqual([])
    if (res.status >= 400) {
      const codes = r!.description.replace(/^Error: /, '').split(' | ').map(c => c.replace(/ \(.*\)$/, ''))
      expect(codes, `${method.toUpperCase()} ${path} → ${res.status}`).toContain(body.error)
    }
    return body
  }
  /** Every recorded answer a response names (`x-fixtures`, in protocols/), checked as that response: a stream as a stream, a JSON one ({ status, headers, body }) by its status. */
  function fixtures(): { file: string; problems: string[] }[] {
    const out: { file: string; problems: string[] }[] = []
    for (const [path, ops] of Object.entries(api.paths as Record<string, Record<string, Op>>)) {
      for (const [method, op] of Object.entries(ops)) {
        for (const [status, r] of Object.entries(op.responses)) {
          for (const [type, media] of Object.entries(r.content ?? {}) as [string, Media][]) {
            for (const file of media['x-fixtures'] ?? []) {
              const text = readFileSync(fileURLToPath(new URL(`../../../../protocols/${file}`, import.meta.url).href), 'utf8')
              const at = `${method.toUpperCase()} ${path} ${status} ${file}`
              if (type === 'text/event-stream') { out.push({ file, problems: streamMisfits(text, media).map(p => `${at}: ${p}`) }); continue }
              const rec = JSON.parse(text) as { status?: number; headers?: Record<string, string>; body?: unknown }
              const problems = misfits(rec.body, media.schema).map(p => `${at}: ${p}`)
              if (String(rec.status) !== status) problems.push(`${at}: status ${rec.status}, not ${status}`)
              if (!rec.headers?.['content-type']?.startsWith(type)) problems.push(`${at}: content-type ${rec.headers?.['content-type']}, not ${type}`)
              const codes = r.description.replace(/^Error: /, '').split(' | ').map(c => c.replace(/ \(.*\)$/, ''))
              if (Number(status) >= 400 && !codes.includes(String((rec.body as { error?: unknown })?.error))) problems.push(`${at}: error ${JSON.stringify((rec.body as { error?: unknown })?.error)} is not one of ${codes.join(', ')}`)
              out.push({ file, problems })
            }
          }
        }
      }
    }
    return out
  }
  return { api, misfits, answer, streamMisfits, fixtures }
}
