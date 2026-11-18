#!/usr/bin/env node
// Asks the live chat as its test account (apps/site/worker/accounts/tester.ts), for the chief of staff:
//
//   node scripts/chat-tester.mjs "<question>"            (Vietnamese)
//   node scripts/chat-tester.mjs --lang th "<question>"  (vi, id, th or ms)
//
// It asks aquatome.com for a sign-in code with the Mac's dashboard bearer (~/.config/aquatome/ab-dash-token), signs in
// to the test account with it (a session of 15 minutes), asks once in a new conversation, and prints the first line and
// the answer as they come. It prints no code, session or bearer, and holds nothing of the owner's sign-in. Each run is one
// question on the live chat: its model, its ledger and the site's daily ceilings, 20 a day for this account.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SITE = 'https://aquatome.com'
const LANGS = ['vi', 'id', 'th', 'ms']

/** An error's code, if it is a plain one: never anything else the site sent. */
const codeOf = (b, or) => (typeof b?.error === 'string' && /^[a-z_]{1,40}$/.test(b.error) ? b.error : or)
/** A body read as JSON; one that isn't says so, never what it held (a parser's message quotes it). */
const jsonOf = async (r) => {
  try {
    return await r.json()
  } catch {
    throw new Error(`the site sent something that isn't JSON (${r.status})`)
  }
}
/** What a refusal says, by its error code alone: never the body as sent, never a header. */
const said = async (r) => codeOf(await r.json().catch(() => null), `HTTP ${r.status}`)

/** The events of a text/event-stream body, as they come. */
async function* events(body) {
  const dec = new TextDecoder()
  let buf = ''
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true })
    let end
    while ((end = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, end)
      buf = buf.slice(end + 2)
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (!event || !data) continue
      let parsed
      try { parsed = JSON.parse(data) } catch { throw new Error(`the chat sent an event that isn't JSON (${event})`) }
      yield { event, data: parsed }
    }
  }
}

/**
 * One question as the test account. `say` gets each line to print. Every line, and the message of anything thrown, has
 * the bearer, the flow, the code and the session cut out, wherever the site put them.
 */
export async function ask({ question, lang = 'vi', bearer, fetch = globalThis.fetch, say, site = SITE, clock = Date.now }) {
  const secrets = [bearer]
  const hide = (text) => secrets.filter(x => typeof x === 'string' && x.length >= 6).reduce((t, x) => t.split(x).join('[hidden]'), String(text))
  try {
    await asked({ question, lang, bearer, fetch, say: line => say(hide(line)), site, clock, keep: x => secrets.push(x) })
  } catch (e) {
    throw new Error(hide(e instanceof Error ? e.message : 'failed'))
  }
}

async function asked({ question, lang, bearer, fetch, say, site, clock, keep }) {
  const json = (path, body, headers = {}) => fetch(`${site}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const c = await json('/api/v1/chat-tester/code', {}, { authorization: `Bearer ${bearer}` })
  if (!c.ok) throw new Error(`no sign-in code (${c.status}): the test account is off, the bearer isn't the site's, or today's codes are used`)
  const { flow, code } = await jsonOf(c)
  keep(flow); keep(code)
  const v = await json('/api/v1/auth/email/verify', { flow, code, client: 'app' })
  if (!v.ok) throw new Error(`the sign-in was refused: ${await said(v)}`)
  const { token } = await jsonOf(v)
  keep(token)
  const began = clock()
  const r = await json('/api/chat', { conversation: randomUUID(), question, lang }, { authorization: `Bearer ${token}`, accept: 'text/event-stream', 'idempotency-key': randomUUID() })
  if (!r.ok || !r.body) throw new Error(`the chat refused: ${await said(r)}`)
  const at = () => `${((clock() - began) / 1000).toFixed(1)} s`
  let words = false
  for await (const { event, data } of events(r.body)) {
    if (event === 'opening') say(`first line, ${at()}: ${data.text}`)
    else if (event === 'text' && !words) { words = true; say(`first words, ${at()}`) }
    else if (event === 'done') { say(`answer, ${at()}:\n${data.text}`); return }
    else if (event === 'error') throw new Error(`the chat stopped: ${codeOf(data, 'unknown')}`)
  }
  throw new Error('the chat ended without an answer')
}

async function main(argv) {
  const i = argv.indexOf('--lang')
  const lang = i >= 0 ? argv[i + 1] : 'vi'
  const question = argv.filter((_, j) => i < 0 || (j !== i && j !== i + 1)).join(' ').trim()
  if (!LANGS.includes(lang) || !question) {
    console.error('usage: node scripts/chat-tester.mjs [--lang vi|id|th|ms] "<question>"')
    return 2
  }
  const bearer = await readFile(join(homedir(), '.config/aquatome/ab-dash-token'), 'utf8').then(t => t.trim(), () => '')
  if (!bearer) {
    console.error('no dashboard bearer in ~/.config/aquatome/ab-dash-token')
    return 1
  }
  try {
    await ask({ question, lang, bearer, say: line => console.log(line) })
    return 0
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'failed')
    return 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2))
