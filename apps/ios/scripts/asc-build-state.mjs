#!/usr/bin/env node
// Waits until App Store Connect has processed an uploaded build: exit 0 once it is ready for TestFlight, 1 if Apple
// refused it. A build still processing after the wait is reported, not failed (processing sometimes takes an hour).
// Once it's ready, WHATS_NEW (if any) becomes its "What to Test" for testers: in en-US, and in any language the build
// already has one for, so a phone in Vietnamese shows it too. A note that can't be set is a warning: the build is up.
//
// Without BUILD (a pull request's dry run) it only reports the newest build, which checks the key and this script.
// Env: KEY_PATH (the .p8), KEY_ID, ISSUER_ID, APP_ID, BUILD (the build number), WHATS_NEW. Prints nothing secret.
import { readFileSync, appendFileSync } from 'node:fs'
import { sign } from 'node:crypto'

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
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}`)
  return res.status === 204 ? null : (await res.json()).data
}

async function whatToTest(id) {
  const whatsNew = WHATS_NEW.slice(0, 4000)
  const have = await api('GET', `builds/${id}/betaBuildLocalizations`)
  for (const l of have) await api('PATCH', `betaBuildLocalizations/${l.id}`, { type: 'betaBuildLocalizations', id: l.id, attributes: { whatsNew } })
  if (!have.some((l) => l.attributes.locale === 'en-US'))
    await api('POST', 'betaBuildLocalizations', {
      type: 'betaBuildLocalizations', attributes: { locale: 'en-US', whatsNew }, relationships: { build: { data: { type: 'builds', id } } },
    })
  report(`What to Test set (${[...new Set(['en-US', ...have.map((l) => l.attributes.locale)])].join(', ')}).`)
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
