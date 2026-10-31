#!/usr/bin/env node
// Waits until App Store Connect has processed an uploaded build: exit 0 once it is ready for TestFlight, 1 if Apple
// refused it. A build still processing after the wait is reported, not failed (processing sometimes takes an hour).
//
// Without BUILD (a pull request's dry run) it only reports the newest build, which checks the key and this script.
// Env: KEY_PATH (the .p8), KEY_ID, ISSUER_ID, APP_ID, BUILD (the build number). Prints nothing secret.
import { readFileSync, appendFileSync } from 'node:fs'
import { sign } from 'node:crypto'

const { KEY_PATH, KEY_ID, ISSUER_ID, APP_ID, BUILD, GITHUB_STEP_SUMMARY } = process.env
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
  return (await res.json()).data.map((b) => b.attributes)
}
const state = async () => (await builds(`filter[version]=${BUILD}`))[0]?.processingState // undefined until listed

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
  const s = await state().catch((e) => (console.log(e.message), last))
  if (s !== last) console.log(`build ${BUILD}: ${s ?? 'not listed yet'}`)
  last = s
  if (s === 'VALID') { report(`Build ${BUILD} is on TestFlight.`); process.exit(0) }
  if (s === 'FAILED' || s === 'INVALID') { report(`Build ${BUILD} was refused by App Store Connect (${s}); Apple's email says why.`); process.exit(1) }
  await new Promise((r) => setTimeout(r, 30_000))
}
report(`Build ${BUILD} is still ${last ?? 'not listed'} after 45 minutes; it reaches TestFlight when Apple finishes.`)
