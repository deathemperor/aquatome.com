#!/usr/bin/env node
// Sends the chief of staff's list of the owner's asks, the file on this Mac, to the dashboard's page of it
// (apps/site/worker/admin/asks.ts) when it has changed. launchd runs it every minute (install-owner-asks-schedule.sh).
//
// One run: the same file as the last one tried sends nothing; a changed one goes with the dashboard token, and the site
// keeps it or says why not. Each run writes its result beside the list, for the chief's watch: when, sent, unchanged,
// refused or failed, and why. Never the list's words, there or in the log.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SITE = 'https://aquatome.com'
const COS = join(homedir(), '.cache/aquatome/cos')
const LIST = join(COS, 'owner-todo.json')
const RESULT = join(COS, 'owner-asks-sent.json')
const TOKEN = join(homedir(), '.config/aquatome/ab-dash-token')

/**
 * One run. `deps` are the outside world, so tests can stand in for it. Returns what it wrote to `result`:
 * `{ at, result, why?, hash, sent? }`: `hash` the file last tried, `sent` when a list last went. The return adds `again`,
 * not written: the same result and reason as the run before (the log says a refusal or failure once, not every minute).
 */
export async function sendOnce({ site = SITE, list = LIST, result = RESULT, token, http = fetch, now = () => new Date() }) {
  const last = await readFile(result, 'utf8').then(JSON.parse).catch(() => ({}))
  const record = async r => {
    const out = { at: now().toISOString(), ...r, ...(last.sent && !r.sent ? { sent: last.sent } : {}) }
    await mkdir(dirname(result), { recursive: true })
    await writeFile(`${result}.tmp`, `${JSON.stringify(out, null, 1)}\n`)
    await rename(`${result}.tmp`, result)
    return { ...out, again: last.result === out.result && last.why === out.why }
  }
  let text, info
  try {
    ;[text, info] = await Promise.all([readFile(list, 'utf8'), stat(list)])
  } catch (e) {
    return record({ result: 'failed', why: `the list can't be read: ${e.code ?? 'error'}`, hash: last.hash })
  }
  const hash = createHash('sha256').update(text).digest('hex')
  // Tried already: kept (nothing new to send), or refused (the same file would be refused again, until it changes).
  if (hash === last.hash && ['sent', 'unchanged'].includes(last.result)) return record({ result: 'unchanged', hash })
  if (hash === last.hash && last.result === 'refused') return record({ result: 'refused', why: last.why, hash })
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return record({ result: 'refused', why: "the list isn't JSON", hash })
  }
  let res
  try {
    res = await http(`${site}/_ab/asks`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ modified: info.mtime.toISOString(), list: body }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    return record({ result: 'failed', why: `no answer: ${e?.name ?? 'error'}`, hash: last.hash })
  }
  if (res.ok) return record({ result: 'sent', hash, sent: now().toISOString() })
  if (res.status === 400) {
    const why = await res.json().then(j => j.why, () => undefined)
    return record({ result: 'refused', why: String(why ?? 'no reason given').slice(0, 300), hash })
  }
  // Anything else (the token refused, the site down) tries again next run.
  return record({ result: 'failed', why: `HTTP ${res.status}`, hash: last.hash })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const token = (await readFile(TOKEN, 'utf8')).trim()
  const r = await sendOnce({ token })
  if (r.result !== 'unchanged' && !r.again) console.log(`${r.at} ${r.result}${r.why ? `: ${r.why}` : ''}`)
}
