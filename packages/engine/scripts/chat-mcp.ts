/**
 * The chat's four tools (search_handbook, read_page, check_tank_mates, read_tanks) served to the Claude CLI over stdio, as
 * an MCP server, so the board can run our prompt and tools on the owner's subscription (chat-board.ts `cli`) instead of
 * the chat's billed keys. The tools are the checkout's own (apps/site/worker/chat/tools.ts) over the site's app files
 * saved in a folder, with one saved tank; past `--limit` tool calls each one answers that the limit is reached, as the
 * Worker's loop does. Each call goes to `--log` as a line, for the board's record of what was read.
 *
 *   tsx scripts/chat-mcp.ts --chat <checkout> --site <folder> [--tank <file>] --log <file> [--limit 16]
 *
 * JSON-RPC over stdin and stdout, one message a line (MCP's stdio transport); nothing else is written to stdout.
 */
import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: { chat: { type: 'string' }, site: { type: 'string' }, tank: { type: 'string' }, log: { type: 'string' }, limit: { type: 'string', default: '16' } },
})
if (!args.chat || !args.site || !args.log) throw new Error('chat-mcp: --chat <checkout> --site <folder> --log <file>')
const W = args.chat
const { chatTools } = await import(`${W}/apps/site/worker/chat/tools.ts`)
const { handbookOf } = await import(`${W}/apps/site/worker/chat/handbook.ts`)
const get = async (path: string) => { try { return JSON.parse(await readFile(join(args.site!, path.replace(/^\//, '').replace(/\//g, '_')), 'utf8')) } catch { return null } }
const hb = await handbookOf({ index: (l: string) => get(`/app/${l}.json`), shard: (l: string, k: string, n: number) => get(`/app/pages/${l}/${k}-${n}.json`), topics: (l: string) => get(`/app/chat/${l}.json`) }, 'vi')
if (!hb) throw new Error(`chat-mcp: no handbook in ${args.site}`)
const tanks = args.tank ? [JSON.parse(await readFile(args.tank, 'utf8'))] : []
const tools = chatTools({ handbook: hb, tanks: async () => tanks, checks: [] }) as { name: string; description: string; input_schema: object; run: (i: Record<string, unknown>, c: { photosLeft: number }) => Promise<string | { type: string; text?: string }[]> }[]
const byName = new Map(tools.map(t => [t.name, t]))
const limit = Number(args.limit)
let used = 0

const send = (m: object) => process.stdout.write(`${JSON.stringify(m)}\n`)
const reply = (id: unknown, result: object) => send({ jsonrpc: '2.0', id, result })
const text = (s: string, isError = false) => ({ content: [{ type: 'text', text: s }], ...(isError ? { isError: true } : {}) })

async function call(name: string, input: Record<string, unknown>) {
  appendFileSync(args.log!, `${JSON.stringify({ at: Date.now(), name, input })}\n`)
  const tool = byName.get(name)
  if (!tool) return text(`No tool named ${name}.`, true)
  if (++used > limit) return text('Limit reached: no more tool calls in this answer. Answer with what you have.', true)
  try {
    const out = await tool.run(input, { photosLeft: 0 })
    return text(typeof out === 'string' ? out : out.map(b => b.text ?? '').join('\n'))
  } catch (e) {
    return text((e as Error).message, true)
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue
  let m: { id?: unknown; method?: string; params?: Record<string, unknown> }
  try { m = JSON.parse(line) } catch { continue }
  if (m.id === undefined) continue // a notification
  if (m.method === 'initialize') reply(m.id, { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'aquatome-chat', version: '1' } })
  else if (m.method === 'tools/list') reply(m.id, { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) })
  else if (m.method === 'tools/call') reply(m.id, await call(String(m.params?.name), (m.params?.arguments ?? {}) as Record<string, unknown>))
  else if (m.method === 'ping') reply(m.id, {})
  else send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `No method ${m.method}` } })
}
