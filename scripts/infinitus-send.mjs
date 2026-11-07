// Puts a message with images into an Infinitus thread from a script on this Mac, with no agent and no change to Infinitus.
//
// `t3 thread send` takes text only, and a session `t3 auth session issue` gives can't reach a full-access thread (its
// limit is approval-required). So this signs in as an outside client would, on the server's own port: a one-use pairing
// code from the t3 CLI, approved for full access, swapped for a bearer. That bearer opens the server's tool endpoint for
// the one send, and is revoked after, so no key to the thread stays on disk.
import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const T3 = process.env.T3_CLI ?? join(homedir(), '.infinitus/bin/t3')
const RUNTIME = join(process.env.T3CODE_HOME ?? join(homedir(), '.infinitus'), 'userdata/server-runtime.json')
/** How the sign-in shows in `t3 auth session list`, and how a leftover one is found and revoked. */
export const CLIENT = 'aquatome owner report'
const REDIRECT = 'http://127.0.0.1/owner-report'
/** What a full-access client needs a pairing code to carry (Infinitus' mcpClientScopes). */
const SCOPES = ['orchestration:read', 'orchestration:operate', 'settings:write', 'source-control:write']

const b64url = buf => Buffer.from(buf).toString('base64url')
const t3 = async (...args) => (await run(T3, args, { maxBuffer: 1 << 20, timeout: 60_000 })).stdout
const postJson = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** A response's JSON, or an error with its status and none of its body (a sign-in's answers carry credentials). */
async function okJson(res, step) {
  if (!res.ok) throw new Error(`${step}: HTTP ${res.status}`)
  return res.json()
}

export async function serverOrigin() {
  return JSON.parse(await readFile(RUNTIME, 'utf8')).origin
}

async function signIn(origin) {
  // The server first: with Infinitus closed, this fails here and the t3 CLI, a whole app to start, is never run.
  const { client_id } = await okJson(await postJson(`${origin}/oauth/mcp/register`, { client_name: CLIENT, redirect_uris: [REDIRECT] }), 'register')
  const { credential: code } = JSON.parse(await t3('auth', 'pairing', 'create', '--ttl', '2m', '--json', '--label', CLIENT, ...SCOPES.flatMap(s => ['--scope', s])))
  const verifier = b64url(randomBytes(32))
  const authorization = {
    response_type: 'code',
    client_id,
    redirect_uri: REDIRECT,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    state: b64url(randomBytes(16)),
    resource: `${origin}/mcp`,
  }
  const decided = await okJson(await postJson(`${origin}/oauth/mcp/decision`, { authorization, decision: { _tag: 'pairing-code', access: 'full-access', code } }), 'approve')
  const approved = new URL(decided.redirectTo).searchParams.get('code')
  if (!approved) throw new Error('approve: no code came back')
  const token = await okJson(await fetch(`${origin}/oauth/mcp/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: approved, redirect_uri: REDIRECT, client_id, code_verifier: verifier, resource: `${origin}/mcp` }),
  }), 'token')
  return token.access_token
}

/** Revokes every session this script signed in with, so one left by a run that died goes too. */
async function signOut() {
  const sessions = JSON.parse(await t3('auth', 'session', 'list', '--json'))
  for (const s of sessions) if (s.client?.label === CLIENT) await t3('auth', 'session', 'revoke', s.sessionId)
}

/** The JSON-RPC answer in a tool endpoint's reply, which is plain JSON or an event stream. */
async function rpcReply(res, id) {
  const text = await res.text()
  const type = res.headers.get('content-type') ?? ''
  const bodies = type.includes('event-stream')
    ? text.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean)
    : [text]
  for (const b of bodies) {
    const m = JSON.parse(b)
    if (m.id === id) return m
  }
  throw new Error('the tool endpoint sent no answer')
}

/** A client of the server's tool endpoint: `call(tool, args)` gives the tool's structured result, or throws its failure. */
async function toolSession(origin, bearer) {
  let session
  let protocol
  let next = 1
  const headers = () => ({
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${bearer}`,
    ...(session ? { 'mcp-session-id': session } : {}),
    ...(protocol ? { 'mcp-protocol-version': protocol } : {}),
  })
  const post = body => fetch(`${origin}/mcp`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  const request = async (method, params) => {
    const id = next++
    const res = await post({ jsonrpc: '2.0', id, method, params })
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`)
    session = res.headers.get('mcp-session-id') ?? session
    const reply = await rpcReply(res, id)
    if (reply.error) throw new Error(`${method}: ${reply.error.message}`)
    return reply.result
  }
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: CLIENT, version: '1' } })
  protocol = init.protocolVersion
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
  return {
    async call(name, args) {
      const result = await request('tools/call', { name, arguments: args })
      if (result.isError) throw new Error(`${name}: ${result.content?.find(c => c.text)?.text ?? 'failed'}`)
      return result.structuredContent
    },
  }
}

/**
 * Sends `message` with `images` ([{ name, mimeType, bytes }]) to the thread. An idle thread starts a turn on it; a running
 * one reads it mid-turn (the tool's own rule, `mode: "auto"`). Throws when it didn't go: the caller keeps the report.
 */
export async function sendToThread({ threadId, message, images = [] }) {
  const origin = await serverOrigin()
  const bearer = await signIn(origin)
  try {
    const tools = await toolSession(origin, bearer)
    const attachments = []
    for (const image of images) {
      const sizeBytes = image.bytes.length
      const { attachmentId, relativeUrl } = await tools.call('t3_attachment_prepare_upload', { upload: { type: 'image', name: image.name, mimeType: image.mimeType, sizeBytes } })
      const up = await fetch(new URL(relativeUrl, origin), { method: 'POST', headers: { 'content-type': image.mimeType, 'content-length': String(sizeBytes) }, body: image.bytes })
      if (!up.ok) throw new Error(`upload: HTTP ${up.status}`)
      attachments.push({ type: 'image', id: attachmentId, name: image.name, mimeType: image.mimeType, sizeBytes })
    }
    return attachments.length
      ? await tools.call('t3_thread_send_attachments', { threadId, message, attachments })
      : await tools.call('t3_thread_send', { threadId, message, mode: 'queue' })
  } finally {
    await signOut().catch(e => console.error('sign-out:', e.message))
  }
}
