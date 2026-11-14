#!/usr/bin/env node
// Waits until App Store Connect has processed an uploaded build: exit 0 once it is ready for TestFlight, 1 if Apple
// refused it. A build still processing after the wait is reported, not failed (processing sometimes takes an hour).
// Once it's ready, WHATS_NEW (if any, already within TestFlight's limits: testflight-notes.py) becomes its "What to
// Test" for testers: in en-US, in Vietnamese (the app's own language), and in any other language the build already
// has one for. Each language is set on its own; one that can't be set is a warning, and the build is up anyway.
//
// Without BUILD (a pull request's dry run) it only reports the newest build, which checks the key and this script.
// A note Apple refuses for characters it names is sent once more without them, so a build never goes out with no note.
// `--test` checks reading those characters, with no key.
// Env: KEY_PATH (the .p8), KEY_ID, ISSUER_ID, APP_ID, BUILD (the build number), WHATS_NEW. Prints nothing secret.
import { readFileSync, appendFileSync } from 'node:fs'
import { sign } from 'node:crypto'
import assert from 'node:assert/strict'

// The characters Apple names when it refuses a note: build 363's answer (14 Nov) was "Text for whatsNew contains invalid
// characters:'[✕]'". Several, it lists them comma-separated (Java's list form); none, an empty list.
export const refused = (message) => (message.match(/invalid characters:\s*'\[(.*)\]'/s)?.[1] ?? '').split(', ').filter(Boolean)
const without = (text, chars) => chars.reduce((t, c) => t.split(c).join(''), text)

if (process.argv[2] === '--test') {
  const apple = "PATCH betaBuildLocalizations/x answered 409: Text for whatsNew contains invalid characters:'[✕]'."
  assert.deepEqual(refused(apple), ['✕'])
  assert.deepEqual(refused("... invalid characters:'[✕, ⋯]'"), ['✕', '⋯'])
  assert.deepEqual(refused('POST betaBuildLocalizations answered 409: The provided entity includes an unknown locale'), [])
  assert.equal(without('Tap ✕: closed. ✕ again', refused(apple)), 'Tap : closed.  again')
  process.exit(0)
}

const { KEY_PATH, KEY_ID, ISSUER_ID, APP_ID, BUILD, WHATS_NEW, GITHUB_STEP_SUMMARY } = process.env
const key = readFileSync(KEY_PATH)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

function token() {
  const now = Math.floor(Date.now() / 1000)
  const body = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss: ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`
  return `${body}.${sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}

async function builds(query) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/builds?filter[app]=${APP_ID}&fields[builds]=version,processingState&${query}`,
    { headers: { Authorization: `Bearer ${token()}` } })
  // A refused key or a wrong app is not a wait: fail now. Apple's own hiccups (5xx) are retried.
  if (res.status >= 400 && res.status < 500) { report(`App Store Connect refused the request (${res.status}).`); process.exit(1) }
  if (!res.ok) throw new Error(`App Store Connect answered ${res.status}`)
  return (await res.json()).data.map((b) => ({ id: b.id, ...b.attributes }))
}
const build = async () => (await builds(`filter[version]=${BUILD}`))[0] // undefined until listed

async function api(method, path, data) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: data && JSON.stringify({ data }),
  })
  if (!res.ok) {
    // Apple says why in the body (a limit, a character it refuses, a language it doesn't know): kept for the warning.
    const why = await res.json().then((j) => j.errors?.map((e) => e.detail ?? e.title).join('; ')).catch(() => '')
    throw new Error(`${method} ${path} answered ${res.status}${why ? `: ${why}` : ''}`)
  }
  return res.status === 204 ? null : (await res.json()).data
}

async function whatToTest(id) {
  const whatsNew = WHATS_NEW // within the limits already (testflight-notes.py)
  const have = await api('GET', `builds/${id}/betaBuildLocalizations`)
  const set = []
  // Once more without the characters Apple names, if it names any: testflight-notes.py swaps the ones known so far.
  const each = async (locale, call) => {
    let bad
    try { await call(whatsNew); set.push(locale); return } catch (e) {
      bad = refused(e.message)
      if (!bad.length) { console.log(`::warning title=What to Test not set (${locale})::${e.message}`); return }
      console.log(`::warning title=What to Test (${locale})::Apple refused ${bad.join(' ')}; sending it again without them`)
    }
    try { await call(without(whatsNew, bad)); set.push(locale) } catch (e) { console.log(`::warning title=What to Test not set (${locale})::${e.message}`) }
  }
  for (const l of have)
    await each(l.attributes.locale, (text) => api('PATCH', `betaBuildLocalizations/${l.id}`, { type: 'betaBuildLocalizations', id: l.id, attributes: { whatsNew: text } }))
  for (const locale of ['en-US', 'vi'].filter((x) => !have.some((l) => l.attributes.locale === x)))
    await each(locale, (text) => api('POST', 'betaBuildLocalizations', {
      type: 'betaBuildLocalizations', attributes: { locale, whatsNew: text }, relationships: { build: { data: { type: 'builds', id } } },
    }))
  report(set.length ? `What to Test set (${set.join(', ')}).` : 'What to Test not set: see the warnings.')
}

function report(line) {
  console.log(line)
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${line}\n`)
}

if (!BUILD) {
  const [b] = await builds('sort=-uploadedDate&limit=1')
  report(b ? `Newest build on App Store Connect: ${b.version}, ${b.processingState}.` : 'No build on App Store Connect yet.')
  process.exit(0)
}

const deadline = Date.now() + 45 * 60_000
let last
while (Date.now() < deadline) {
  const b = await build().catch((e) => (console.log(e.message), undefined))
  const s = b ? b.processingState : last
  if (s !== last) console.log(`build ${BUILD}: ${s ?? 'not listed yet'}`)
  last = s
  if (s === 'VALID') {
    report(`Build ${BUILD} is on TestFlight.`)
    if (WHATS_NEW) await whatToTest(b.id).catch((e) => { console.log(`::warning title=What to Test not set::${e.message}`); report(`What to Test not set: ${e.message}.`) })
    process.exit(0)
  }
  if (s === 'FAILED' || s === 'INVALID') { report(`Build ${BUILD} was refused by App Store Connect (${s}); Apple's email says why.`); process.exit(1) }
  await new Promise((r) => setTimeout(r, 30_000))
}
report(`Build ${BUILD} is still ${last ?? 'not listed'} after 45 minutes; it reaches TestFlight when Apple finishes.`)
if (WHATS_NEW) console.log('::warning title=What to Test not set::the build was still processing')
