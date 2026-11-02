#!/usr/bin/env node
// The App Store listing in apps/ios/store/listing.json, and App Store Connect (.github/workflows/app-store.yml):
//   --test    checks the checks below on made-up listings, and api()'s refusals. Prints nothing when they pass.
//   --check   offline: listing.json within Apple's limits. Any breach fails; a doubt is a warning.
//   --report  read-only: what App Store Connect has now beside what listing.json says, field by field.
//   --apply   writes listing.json to App Store Connect: the app info and version localizations, the categories, an App
//             Store version when none is editable (MARKETING_VERSION, or 1.0 if Apple refuses it), the review notes,
//             the age rating, the content rights, a free price, every territory, and the screenshots in SHOTS_DIR
//             (<display type>/<locale>/*.png, from apps/ios/scripts/store-shots.py), replacing each set's old ones.
// Never submits the app for review, attaches a build or releases anything: api() refuses those paths and bodies.
// The App Review contact is the owner's to enter on the App Store Connect website, and is never read out.
// Env (--report, --apply): KEY_PATH (the .p8), KEY_ID, ISSUER_ID, APP_ID; SHOTS_DIR for --apply. Prints nothing secret.
import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs'
import { sign, createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LISTING = join(here, '../store/listing.json')
const PROJECT = join(here, '../AquaTome.xcodeproj/project.pbxproj')
const HOST = 'https://api.appstoreconnect.apple.com/'
const { KEY_PATH, KEY_ID, ISSUER_ID, APP_ID, SHOTS_DIR, GITHUB_STEP_SUMMARY } = process.env

// ---- Apple's rules for the listing (App Store Connect Help: App information, Platform version information, Screenshot
// specifications; the API's AgeRatingDeclaration, App and ScreenshotDisplayType), as of 2026-11-03.

const APP_INFO_FIELDS = ['name', 'subtitle', 'privacyPolicyUrl']
const VERSION_FIELDS = ['description', 'keywords', 'marketingUrl', 'promotionalText', 'supportUrl']
const FREQUENCY = ['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE', 'INFREQUENT', 'FREQUENT']
const AGE_BOOLEAN = ['advertising', 'ageAssurance', 'gambling', 'healthOrWellnessTopics', 'lootBox', 'messagingAndChat',
  'parentalControls', 'socialMedia', 'unrestrictedWebAccess', 'userGeneratedContent']
const AGE_FREQUENCY = ['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons',
  'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor',
  'sexualContentGraphicAndNudity', 'sexualContentOrNudity', 'violenceCartoonOrFantasy', 'violenceRealistic',
  'violenceRealisticProlongedGraphicOrSadistic']
const AGE_OVERRIDE = ['NONE', 'NINE_PLUS', 'THIRTEEN_PLUS', 'SIXTEEN_PLUS', 'EIGHTEEN_PLUS', 'UNRATED']
const CONTENT_RIGHTS = ['DOES_NOT_USE_THIRD_PARTY_CONTENT', 'USES_THIRD_PARTY_CONTENT']
const DISPLAY_TYPES = ['APP_IPHONE_67', 'APP_IPHONE_65', 'APP_IPHONE_61', 'APP_IPHONE_58', 'APP_IPHONE_55',
  'APP_IPHONE_47', 'APP_IPHONE_40', 'APP_IPHONE_35', 'APP_IPAD_PRO_3GEN_129', 'APP_IPAD_PRO_3GEN_11', 'APP_IPAD_PRO_129',
  'APP_IPAD_105', 'APP_IPAD_97']
const TOP = ['primaryLocale', 'categories', 'price', 'availability', 'contentRightsDeclaration', 'ageRating', 'review',
  'screenshots', 'locales']
// A version App Store Connect lets us edit: never one in review, waiting for it, or on sale.
const EDITABLE_VERSION = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']
const EDITABLE_INFO = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED']

const chars = (s) => [...s].length
const bytes = (s) => Buffer.byteLength(s, 'utf8')

/** listing.json's breaches of Apple's rules (`errors`) and what may be wrong (`warnings`), for the project given. */
function check(listing, project) {
  const errors = []
  const warnings = []
  const no = (m) => errors.push(m)
  const text = (where, s, { min = 0, max, maxBytes, required = true, html = false } = {}) => {
    if (s === undefined && !required) return
    if (typeof s !== 'string' || (required && !s.trim())) return no(`${where}: missing`)
    // Vietnamese typed as base letters plus marks counts each mark: Apple's limits are for the composed letters.
    if (s !== s.normalize('NFC')) no(`${where}: not in composed (NFC) form`)
    if (chars(s) < min) no(`${where}: ${chars(s)} characters, at least ${min}`)
    if (max && chars(s) > max) no(`${where}: ${chars(s)} characters, at most ${max}`)
    if (maxBytes && bytes(s) > maxBytes) no(`${where}: ${bytes(s)} bytes, at most ${maxBytes}`)
    if (!html && /<\/?[a-z!][^>]*>/i.test(s)) no(`${where}: HTML isn't supported`)
  }
  const url = (where, s, required = true) => {
    if (s === undefined && !required) return
    let u
    try { u = new URL(s) } catch { return no(`${where}: not a URL`) }
    if (u.protocol !== 'https:') no(`${where}: not https`)
  }

  for (const k of Object.keys(listing)) if (!TOP.includes(k)) no(`${k}: not a field the script knows`)
  const locales = listing.locales ?? {}
  if (!Object.keys(locales).length) no('locales: none')
  if (!locales[listing.primaryLocale]) no(`primaryLocale: ${listing.primaryLocale} has no copy in locales`)
  for (const [locale, l] of Object.entries(locales)) {
    if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(locale)) no(`locales.${locale}: not a locale code`)
    for (const k of Object.keys(l)) if (![...APP_INFO_FIELDS, ...VERSION_FIELDS].includes(k)) no(`${locale}.${k}: not a listing field`)
    text(`${locale}.name`, l.name, { min: 2, max: 30 })
    text(`${locale}.subtitle`, l.subtitle, { max: 30, required: false })
    text(`${locale}.promotionalText`, l.promotionalText, { max: 170, required: false })
    text(`${locale}.description`, l.description, { max: 4000 })
    text(`${locale}.keywords`, l.keywords, { maxBytes: 100 })
    url(`${locale}.supportUrl`, l.supportUrl)
    url(`${locale}.marketingUrl`, l.marketingUrl, false)
    url(`${locale}.privacyPolicyUrl`, l.privacyPolicyUrl)
    if (typeof l.keywords === 'string') {
      const words = l.keywords.split(',').map((w) => w.trim())
      if (words.some((w) => !w)) no(`${locale}.keywords: an empty keyword`)
      const seen = new Set()
      for (const w of words) {
        if (seen.has(w.toLowerCase())) no(`${locale}.keywords: "${w}" twice`)
        seen.add(w.toLowerCase())
        // Apple's help: "each greater than two characters". App Store Connect is known to take shorter ones.
        if (w && chars(w) <= 2) warnings.push(`${locale}.keywords: "${w}" is ${chars(w)} characters; Apple's help asks for more than two`)
        if (typeof l.name === 'string' && w.toLowerCase() === l.name.toLowerCase()) warnings.push(`${locale}.keywords: "${w}" repeats the app's name, which is searched already`)
      }
    }
  }

  const c = listing.categories ?? {}
  if (!/^[A-Z_]+$/.test(c.primary ?? '')) no('categories.primary: not a category id')
  if (c.secondary !== undefined && !/^[A-Z_]+$/.test(c.secondary)) no('categories.secondary: not a category id')
  if (c.primary && c.primary === c.secondary) no('categories: the same twice')
  // The App Store's primary category matches the app's own (Info.plist's LSApplicationCategoryType).
  const own = project && /LSApplicationCategoryType = "public\.app-category\.([a-z-]+)"/.exec(project)?.[1]
  if (own && own.replace(/-/g, '_').toUpperCase() !== c.primary) no(`categories.primary: ${c.primary}, but the app says ${own}`)
  if (listing.price !== 'free') no('price: only "free" is supported')
  const a = listing.availability ?? {}
  if (a.territories !== 'all') no('availability.territories: only "all" is supported')
  if (typeof a.availableInNewTerritories !== 'boolean') no('availability.availableInNewTerritories: not true or false')
  if (!CONTENT_RIGHTS.includes(listing.contentRightsDeclaration)) no(`contentRightsDeclaration: one of ${CONTENT_RIGHTS.join(', ')}`)

  const age = listing.ageRating ?? {}
  for (const k of AGE_BOOLEAN) if (typeof age[k] !== 'boolean') no(`ageRating.${k}: not answered true or false`)
  for (const k of AGE_FREQUENCY) if (!FREQUENCY.includes(age[k])) no(`ageRating.${k}: not one of ${FREQUENCY.join(', ')}`)
  if (!AGE_OVERRIDE.includes(age.ageRatingOverrideV2)) no(`ageRating.ageRatingOverrideV2: not one of ${AGE_OVERRIDE.join(', ')}`)
  for (const k of Object.keys(age)) if (![...AGE_BOOLEAN, ...AGE_FREQUENCY, 'ageRatingOverrideV2'].includes(k)) no(`ageRating.${k}: not a question the script knows`)

  // The review notes only: the public repository holds no one's name, phone, email or account.
  const r = listing.review ?? {}
  for (const k of Object.keys(r)) if (!['notes', 'demoAccountRequired'].includes(k)) no(`review.${k}: entered on the App Store Connect website, not here`)
  text('review.notes', r.notes, { maxBytes: 4000, html: true })
  if (typeof r.demoAccountRequired !== 'boolean') no('review.demoAccountRequired: not true or false')
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(r.notes ?? '')) no('review.notes: an email address')
  // Nine digits or more in a run (a date has eight).
  if ((r.notes ?? '').match(/\+?\d[\d ().-]{7,}\d/g)?.some((m) => m.replace(/\D/g, '').length >= 9)) no('review.notes: a phone number')

  for (const [type, s] of Object.entries(listing.screenshots ?? {})) {
    if (!DISPLAY_TYPES.includes(type)) no(`screenshots.${type}: not an iPhone or iPad screenshot display type`)
    if (typeof s.simulator !== 'string' || !s.simulator) no(`screenshots.${type}.simulator: missing`)
    if (!Array.isArray(s.sizes) || !s.sizes.length || !s.sizes.every((z) => Array.isArray(z) && z.length === 2 && z.every(Number.isInteger))) no(`screenshots.${type}.sizes: not [[width, height], …]`)
  }
  return { errors, warnings }
}

/** The app's version (MARKETING_VERSION), which every target and configuration of the project share. */
function marketingVersion(project) {
  const all = new Set([...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim()))
  if (all.size !== 1) throw new Error(`the project has ${all.size ? [...all].join(', ') : 'no'} MARKETING_VERSION`)
  return [...all][0]
}

/** A PNG's size and whether it has an alpha channel (colour types 4 and 6), from its header. */
function png(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha: [4, 6].includes(buf[25]) }
}

/** What's wrong with a screenshot set's files for its display type (`slot`: listing.json's), if anything. */
function shotProblems(files, slot) {
  const out = []
  if (!files.length || files.length > 10) out.push(`${files.length} screenshots, from 1 to 10`)
  for (const f of files) {
    const p = png(f.data)
    if (!p) out.push(`${f.name}: not a PNG`)
    else {
      if (!slot.sizes.some(([w, h]) => w === p.width && h === p.height)) out.push(`${f.name}: ${p.width}×${p.height}, not ${slot.sizes.map((z) => z.join('×')).join(' or ')}`)
      if (p.alpha) out.push(`${f.name}: has an alpha channel, which the App Store refuses`)
    }
  }
  return out
}

// ---- App Store Connect.

/** Why a request is refused before it's sent: submitting, a build, a release. None of those are this script's to do. */
function refused(method, path, body) {
  if (/reviewSubmission|appStoreVersionSubmission|appStoreVersionReleaseRequest|appStoreVersionPhasedRelease/i.test(path)) return 'submitting or releasing'
  if (/\/relationships\/build\b|\/builds?\b/i.test(path) && method !== 'GET') return 'a build'
  if (body?.relationships?.build) return 'a build'
  return null
}

let key
function token() {
  key ??= readFileSync(KEY_PATH)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const body = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss: ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`
  return `${body}.${sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}

/** One request; `path` from the API's root ("v1/apps/…") or a `links.next` Apple gave. The whole answer, or null. */
async function api(method, path, data, included) {
  path = path.startsWith(HOST) ? path.slice(HOST.length) : path
  const why = refused(method, path, data)
  if (why) throw new Error(`refused: ${method} ${path} would be ${why}, which this script never does`)
  const res = await fetch(HOST + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: data && JSON.stringify(included ? { data, included } : { data }),
  })
  if (!res.ok) {
    // Apple says why in the body (a limit, a value it refuses, a state that doesn't allow it).
    const detail = await res.json().then((j) => j.errors?.map((e) => e.detail ?? e.title).join('; ')).catch(() => '')
    const e = new Error(`${method} ${path.split('?')[0]} answered ${res.status}${detail ? `: ${detail}` : ''}`)
    e.status = res.status
    throw e
  }
  return res.status === 204 ? null : res.json()
}
const get = async (path) => (await api('GET', path)).data
/** null where App Store Connect has nothing (404, or no data). */
const getOrNone = (path) => get(path).catch((e) => { if (e.status === 404) return null; throw e })
/** Every page of a list. */
async function all(path) {
  const out = []
  for (let next = path; next;) {
    const page = await api('GET', next)
    out.push(...page.data)
    next = page.links?.next
  }
  return out
}

/** What App Store Connect has now for the listing's parts. Reads only. */
async function read(listing) {
  const s = { app: await get(`v1/apps/${APP_ID}`) }
  const infos = await api('GET', `v1/apps/${APP_ID}/appInfos?include=primaryCategory,secondaryCategory`)
  s.infos = infos.data
  s.info = infos.data.find((i) => EDITABLE_INFO.includes(i.attributes.state ?? i.attributes.appStoreState))
  if (s.info) {
    s.infoLocs = await all(`v1/appInfos/${s.info.id}/appInfoLocalizations?limit=50`)
    s.age = await getOrNone(`v1/appInfos/${s.info.id}/ageRatingDeclaration`)
  }
  s.versions = await all(`v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=50`)
  s.version = s.versions.find((v) => EDITABLE_VERSION.includes(v.attributes.appVersionState ?? v.attributes.appStoreState))
  if (s.version) {
    s.versionLocs = await all(`v1/appStoreVersions/${s.version.id}/appStoreVersionLocalizations?limit=50`)
    s.review = await getOrNone(`v1/appStoreVersions/${s.version.id}/appStoreReviewDetail`)
    s.sets = {}
    for (const l of s.versionLocs) {
      s.sets[l.attributes.locale] = {}
      for (const set of await all(`v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets?limit=50`))
        s.sets[l.attributes.locale][set.attributes.screenshotDisplayType] = { id: set.id, shots: await all(`v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`) }
    }
  }
  s.schedule = await getOrNone(`v1/apps/${APP_ID}/appPriceSchedule`)
  if (s.schedule) {
    // An app with no price yet has a schedule all the same, whose prices aren't there (404).
    const prices = await api('GET', `v1/appPriceSchedules/${s.schedule.id}/manualPrices?include=appPricePoint,territory&limit=200`)
      .catch((e) => { if (e.status === 404) return { data: [] }; throw e })
    s.prices = prices.data.map((p) => ({
      territory: p.relationships?.territory?.data?.id,
      start: p.attributes.startDate,
      customerPrice: prices.included?.find((i) => i.type === 'appPricePoints' && i.id === p.relationships?.appPricePoint?.data?.id)?.attributes.customerPrice,
    }))
  }
  s.availability = await getOrNone(`v1/apps/${APP_ID}/appAvailabilityV2`)
  s.territories = await all('v1/territories?limit=200')
  // As with prices, a list App Store Connect doesn't have yet answers 404.
  if (s.availability) s.territoryAvailabilities = await all(`v2/appAvailabilities/${s.availability.id}/territoryAvailabilities?include=territory&limit=200`)
    .catch((e) => { if (e.status === 404) return []; throw e })
  return s
}

const free = (s) => !!s.prices?.length && s.prices.every((p) => p.customerPrice !== undefined && Number(p.customerPrice) === 0)
const short = (v) => {
  if (v === undefined || v === null || v === '') return '(none)'
  const t = String(v).replace(/\s+/g, ' ')
  return chars(t) > 60 ? `${[...t].slice(0, 57).join('')}… (${chars(String(v))} characters)` : t
}

/** The report's rows: [what, App Store Connect, listing.json, same?]. */
function compare(listing, s) {
  const rows = []
  const row = (what, now, want, same = now === want) => rows.push([what, short(now), short(want), same ? 'same' : 'differs'])
  const a = s.app.attributes
  row('App name (as created)', a.name, listing.locales[listing.primaryLocale].name)
  row('Bundle ID', a.bundleId, a.bundleId)
  row('Primary locale', a.primaryLocale, listing.primaryLocale)
  row('Content rights', a.contentRightsDeclaration, listing.contentRightsDeclaration)
  row('App info editable', s.info ? `${s.info.attributes.state ?? s.info.attributes.appStoreState}` : `none (${s.infos.map((i) => i.attributes.state ?? i.attributes.appStoreState).join(', ')})`, 'one', !!s.info)
  if (s.info) {
    row('Primary category', s.info.relationships?.primaryCategory?.data?.id, listing.categories.primary)
    row('Secondary category', s.info.relationships?.secondaryCategory?.data?.id, listing.categories.secondary)
    row('Age rating on the App Store', s.info.attributes.appStoreAgeRating, '(Apple works it out)', true)
    const asked = Object.keys(listing.ageRating)
    const differ = asked.filter((k) => s.age?.attributes?.[k] !== listing.ageRating[k])
    row('Age rating answers', s.age ? `${asked.length - differ.length} of ${asked.length} as listed` : '(none)', `${asked.length} answers`, !differ.length)
    if (differ.length) row('Age rating answers that differ', differ.join(', '), '', false)
    for (const [locale, l] of Object.entries(listing.locales)) {
      const now = s.infoLocs.find((x) => x.attributes.locale === locale)?.attributes
      for (const k of APP_INFO_FIELDS) row(`${locale} ${k}`, now?.[k], l[k])
    }
  }
  row('Version in PREPARE_FOR_SUBMISSION', s.versions.find((v) => (v.attributes.appVersionState ?? v.attributes.appStoreState) === 'PREPARE_FOR_SUBMISSION')?.attributes.versionString ?? 'none', 'one', true)
  row('App Store versions', s.versions.map((v) => `${v.attributes.versionString} (${v.attributes.appVersionState ?? v.attributes.appStoreState})`).join(', ') || 'none', '', true)
  if (s.version) {
    for (const [locale, l] of Object.entries(listing.locales)) {
      const now = s.versionLocs.find((x) => x.attributes.locale === locale)?.attributes
      for (const k of VERSION_FIELDS) row(`${locale} ${k}`, now?.[k], l[k])
      for (const type of Object.keys(listing.screenshots)) {
        const have = s.sets[locale]?.[type]?.shots.length ?? 0
        const files = shotFiles(type, locale)
        row(`${locale} ${type} screenshots`, String(have), files ? String(files.length) : '(made by the workflow)', files ? !!files.length && sameShots(s.sets[locale]?.[type]?.shots ?? [], files) : true)
      }
    }
    // Never the contact or demo account: personal details, in a public log.
    const r = s.review?.attributes
    row('Review notes', r?.notes, listing.review.notes)
    row('Review demo account required', r?.demoAccountRequired, listing.review.demoAccountRequired)
    row('Review contact', r && [r.contactFirstName, r.contactLastName, r.contactPhone, r.contactEmail].every(Boolean) ? 'set' : 'not set', 'set on the website', true)
  }
  row('Price', !s.prices?.length ? 'none' : free(s) ? 'free' : `${s.prices.length} prices, not all free`, listing.price, free(s))
  const available = s.territoryAvailabilities?.filter((t) => t.attributes.available).length ?? 0
  row('Territories available', s.availability ? `${available} of ${s.territories.length}` : 'none set', `all ${s.territories.length}`, !!s.availability && available === s.territories.length)
  row('Available in new territories', s.availability?.attributes.availableInNewTerritories, listing.availability.availableInNewTerritories)
  return rows
}

/** A set's screenshots from SHOTS_DIR, in order: none when it has none, null without a SHOTS_DIR. */
function shotFiles(type, locale) {
  if (!SHOTS_DIR) return null
  const dir = join(SHOTS_DIR, type, locale)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((name) => {
    const data = readFileSync(join(dir, name))
    return { name, data, md5: createHash('md5').update(data).digest('hex') }
  })
}
// Apple's checksum is kept from the commit on, processed or not: only a screenshot it finished counts as there.
const sameShots = (have, files) => have.length === files.length && have.every((h, i) => h.attributes.sourceFileChecksum === files[i].md5 && h.attributes.assetDeliveryState?.state === 'COMPLETE')

function report(rows) {
  const width = rows.reduce((w, r) => Math.max(w, chars(r[0])), 0)
  for (const r of rows) console.log(`${r[3] === 'same' ? ' ' : '≠'} ${r[0].padEnd(width)}  ${r[1]}${r[3] === 'same' ? '' : `  →  ${r[2]}`}`)
  if (GITHUB_STEP_SUMMARY) {
    const cell = (v) => String(v).replace(/\|/g, '\\|')
    appendFileSync(GITHUB_STEP_SUMMARY, ['### App Store Connect beside listing.json', '', '| | App Store Connect | listing.json | |', '| --- | --- | --- | --- |',
      ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`), ''].join('\n'))
  }
}

// ---- Writing.

/** Each part of the listing written on its own: one Apple refuses is reported, and the rest still go. */
async function apply(listing, project) {
  const failed = []
  const step = async (what, fn) => {
    try {
      const done = await fn()
      console.log(`${what}: ${done ?? 'done'}`)
    } catch (e) {
      failed.push(what)
      console.log(`::error title=${what}::${e.message}`)
    }
  }
  // The screenshots first: a set that's missing or wrong stops the run before anything is written.
  if (SHOTS_DIR) {
    const problems = Object.entries(listing.screenshots).flatMap(([type, slot]) => Object.keys(listing.locales).flatMap((locale) =>
      shotProblems(shotFiles(type, locale), slot).map((p) => `${locale} ${type}: ${p}`)))
    if (problems.length) {
      for (const p of problems) console.log(`::error title=Screenshots::${p}`)
      process.exit(1)
    }
  }
  let s = await read(listing)
  const id = (type, i) => ({ data: { type, id: i } })
  const changed = (now, want) => Object.fromEntries(Object.entries(want).filter(([k, v]) => v !== undefined && now?.[k] !== v))

  await step('Content rights', async () => {
    const attributes = changed(s.app.attributes, { contentRightsDeclaration: listing.contentRightsDeclaration })
    if (!Object.keys(attributes).length) return 'already as listed'
    await api('PATCH', `v1/apps/${APP_ID}`, { type: 'apps', id: APP_ID, attributes })
  })
  if (!s.info) {
    failed.push('App info')
    console.log(`::error title=App info::no app info App Store Connect lets us edit (${s.infos.map((i) => i.attributes.state ?? i.attributes.appStoreState).join(', ')})`)
  } else {
    for (const [locale, l] of Object.entries(listing.locales)) {
      await step(`App info, ${locale}`, async () => {
        const now = s.infoLocs.find((x) => x.attributes.locale === locale)
        const want = Object.fromEntries(APP_INFO_FIELDS.map((k) => [k, l[k]]))
        if (!now) return void await api('POST', 'v1/appInfoLocalizations', { type: 'appInfoLocalizations', attributes: { locale, ...want }, relationships: { appInfo: id('appInfos', s.info.id) } })
        const attributes = changed(now.attributes, want)
        if (!Object.keys(attributes).length) return 'already as listed'
        await api('PATCH', `v1/appInfoLocalizations/${now.id}`, { type: 'appInfoLocalizations', id: now.id, attributes })
      })
    }
    await step('Categories', async () => {
      const r = s.info.relationships ?? {}
      if (r.primaryCategory?.data?.id === listing.categories.primary && r.secondaryCategory?.data?.id === listing.categories.secondary) return 'already as listed'
      await api('PATCH', `v1/appInfos/${s.info.id}`, { type: 'appInfos', id: s.info.id, relationships: {
        primaryCategory: id('appCategories', listing.categories.primary), secondaryCategory: id('appCategories', listing.categories.secondary) } })
    })
    await step('Age rating', async () => {
      if (!s.age) throw new Error('App Store Connect has no age rating declaration for the app info')
      const attributes = changed(s.age.attributes, listing.ageRating)
      if (!Object.keys(attributes).length) return 'already as listed'
      await api('PATCH', `v1/ageRatingDeclarations/${s.age.id}`, { type: 'ageRatingDeclarations', id: s.age.id, attributes })
    })
  }
  // After the localizations: the primary locale is one the app info has.
  await step('Primary locale', async () => {
    if (s.app.attributes.primaryLocale === listing.primaryLocale) return 'already as listed'
    await api('PATCH', `v1/apps/${APP_ID}`, { type: 'apps', id: APP_ID, attributes: { primaryLocale: listing.primaryLocale } })
  })

  await step('App Store version', async () => {
    if (s.version) return `${s.version.attributes.versionString} (${s.version.attributes.appVersionState ?? s.version.attributes.appStoreState}) already`
    const create = (versionString) => api('POST', 'v1/appStoreVersions', { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString }, relationships: { app: id('apps', APP_ID) } })
    const ours = marketingVersion(project)
    try {
      await create(ours)
      return `${ours} created`
    } catch (e) {
      if (ours === '1.0' || !(e.status >= 400 && e.status < 500)) throw e
      console.log(`::warning title=App Store version::${ours} refused (${e.message}); 1.0 instead, and a build for it needs MARKETING_VERSION 1.0`)
      await create('1.0')
      return '1.0 created'
    }
  })
  s = await read(listing) // the version and its first localization, if just made

  if (s.version) {
    for (const [locale, l] of Object.entries(listing.locales)) {
      await step(`Version copy, ${locale}`, async () => {
        const now = s.versionLocs.find((x) => x.attributes.locale === locale)
        const want = Object.fromEntries(VERSION_FIELDS.map((k) => [k, l[k]]))
        if (!now) return void await api('POST', 'v1/appStoreVersionLocalizations', { type: 'appStoreVersionLocalizations', attributes: { locale, ...want }, relationships: { appStoreVersion: id('appStoreVersions', s.version.id) } })
        const attributes = changed(now.attributes, want)
        if (!Object.keys(attributes).length) return 'already as listed'
        await api('PATCH', `v1/appStoreVersionLocalizations/${now.id}`, { type: 'appStoreVersionLocalizations', id: now.id, attributes })
      })
    }
    await step('Review notes', async () => {
      const want = { notes: listing.review.notes, demoAccountRequired: listing.review.demoAccountRequired }
      if (!s.review) return void await api('POST', 'v1/appStoreReviewDetails', { type: 'appStoreReviewDetails', attributes: want, relationships: { appStoreVersion: id('appStoreVersions', s.version.id) } })
      const attributes = changed(s.review.attributes, want)
      if (!Object.keys(attributes).length) return 'already as listed'
      await api('PATCH', `v1/appStoreReviewDetails/${s.review.id}`, { type: 'appStoreReviewDetails', id: s.review.id, attributes })
    })
  }

  await step('Price', async () => {
    if (free(s)) return 'already free'
    // The free price point, in the base territory; Apple sets every other territory's from it.
    const points = await all(`v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=200`)
    const zero = points.find((p) => Number(p.attributes.customerPrice) === 0)
    if (!zero) throw new Error('no free price point for the United States')
    await api('POST', 'v1/appPriceSchedules', { type: 'appPriceSchedules', relationships: {
      app: id('apps', APP_ID), baseTerritory: id('territories', 'USA'), manualPrices: { data: [{ type: 'appPrices', id: '${free}' }] } } },
    [{ type: 'appPrices', id: '${free}', attributes: { startDate: null }, relationships: { appPricePoint: id('appPricePoints', zero.id) } }])
  })

  await step('Availability', async () => {
    if (!s.availability) {
      const local = (t) => `\${${t.id}}`
      await api('POST', 'v2/appAvailabilities', { type: 'appAvailabilities', attributes: { availableInNewTerritories: listing.availability.availableInNewTerritories },
        relationships: { app: id('apps', APP_ID), territoryAvailabilities: { data: s.territories.map((t) => ({ type: 'territoryAvailabilities', id: local(t) })) } } },
      s.territories.map((t) => ({ type: 'territoryAvailabilities', id: local(t), attributes: { available: true }, relationships: { territory: id('territories', t.id) } })))
      return `all ${s.territories.length} territories`
    }
    if (!s.territoryAvailabilities.length) throw new Error('App Store Connect lists no territories for the app\'s availability')
    const off = s.territoryAvailabilities.filter((t) => !t.attributes.available)
    for (const t of off) await api('PATCH', `v1/territoryAvailabilities/${t.id}`, { type: 'territoryAvailabilities', id: t.id, attributes: { available: true } })
    // The API can't change this once set (no PATCH for appAvailabilities): the website can.
    if (s.availability.attributes.availableInNewTerritories !== listing.availability.availableInNewTerritories)
      throw new Error(`"available in new territories" is ${s.availability.attributes.availableInNewTerritories}: change it on the App Store Connect website (Pricing and Availability)`)
    return off.length ? `${off.length} more territories` : 'already everywhere'
  })

  // Again: the version's localizations just made, which the screenshot sets go on.
  if (s.version) await screenshots(listing, await read(listing), step)
  if (failed.length) {
    console.log(`Not written: ${failed.join('; ')}.`)
    process.exit(1)
  }
  console.log('The listing is on App Store Connect. Nothing was submitted.')
}

/** Each set in SHOTS_DIR uploaded in its order, its old screenshots deleted first (a set holds 10 at most). */
async function screenshots(listing, s, step) {
  if (!SHOTS_DIR) return console.log('Screenshots: no SHOTS_DIR, none uploaded')
  for (const [type, slot] of Object.entries(listing.screenshots)) {
    for (const locale of Object.keys(listing.locales)) {
      await step(`Screenshots, ${locale} ${type}`, async () => {
        const files = shotFiles(type, locale) // checked before anything was written
        const loc = s.versionLocs.find((x) => x.attributes.locale === locale)
        if (!loc) throw new Error(`the version has no ${locale} copy`)
        let set = s.sets[locale]?.[type]
        if (set && sameShots(set.shots, files)) return 'already these'
        if (!set) {
          const made = await api('POST', 'v1/appScreenshotSets', { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } })
          set = { id: made.data.id, shots: [] }
        }
        for (const old of set.shots) await api('DELETE', `v1/appScreenshots/${old.id}`)
        const ids = []
        for (const f of files) ids.push(await upload(set.id, f))
        await processed(ids)
        await api('PATCH', `v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, ids.map((i) => ({ type: 'appScreenshots', id: i })))
        return `${files.length} uploaded`
      })
    }
  }
}

/** Reserved, sent in the parts Apple asks for (to its upload hosts, not the API), then committed with its MD5. */
async function upload(setId, f) {
  const made = (await api('POST', 'v1/appScreenshots', { type: 'appScreenshots', attributes: { fileName: f.name, fileSize: f.data.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } })).data
  for (const op of made.attributes.uploadOperations) {
    const res = await fetch(op.url, { method: op.method, headers: Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value])), body: f.data.subarray(op.offset, op.offset + op.length) })
    if (!res.ok) throw new Error(`${f.name}: part at ${op.offset} answered ${res.status}`)
  }
  await api('PATCH', `v1/appScreenshots/${made.id}`, { type: 'appScreenshots', id: made.id, attributes: { uploaded: true, sourceFileChecksum: f.md5 } })
  return made.id
}

/** Waits for Apple to process the screenshots: only then does it say whether it takes their size. */
async function processed(ids) {
  const deadline = Date.now() + 10 * 60_000
  for (let left = ids; left.length;) {
    if (Date.now() > deadline) throw new Error(`${left.length} screenshots still processing after 10 minutes`)
    await new Promise((r) => setTimeout(r, 5000))
    const next = []
    for (const i of left) {
      const st = (await get(`v1/appScreenshots/${i}`)).attributes.assetDeliveryState
      if (st?.state === 'FAILED') throw new Error(`a screenshot was refused: ${st.errors?.map((e) => `${e.code} ${e.description}`).join('; ') || 'no reason given'}`)
      if (st?.state !== 'COMPLETE') next.push(i)
    }
    left = next
  }
}

// ---- The checks' own test.

function test() {
  const assert = (ok, what) => { if (!ok) throw new Error(`self-test: ${what}`) }
  const real = JSON.parse(readFileSync(LISTING, 'utf8'))
  const project = readFileSync(PROJECT, 'utf8')
  const base = () => structuredClone(real)
  const fails = (change, what, pattern) => {
    const l = base()
    change(l)
    const { errors } = check(l, project)
    assert(errors.some((e) => pattern.test(e)), `${what} not caught (${errors.join(' | ') || 'no errors'})`)
  }
  const passes = (change, what) => {
    const l = base()
    change(l)
    const { errors } = check(l, project)
    assert(!errors.length, `${what} refused: ${errors.join(' | ')}`)
  }
  passes(() => {}, 'listing.json')
  const vi = (l) => l.locales.vi
  passes((l) => { vi(l).name = 'A'.repeat(30) }, 'a 30-character name')
  fails((l) => { vi(l).name = 'A'.repeat(31) }, 'a 31-character name', /vi\.name: 31 characters/)
  fails((l) => { vi(l).name = 'A' }, 'a 1-character name', /vi\.name: 1 characters, at least 2/)
  passes((l) => { vi(l).subtitle = 'ể'.repeat(30) }, 'a 30-letter Vietnamese subtitle (60 bytes)')
  fails((l) => { vi(l).subtitle = 'ể'.repeat(31) }, 'a 31-character subtitle', /vi\.subtitle: 31 characters/)
  fails((l) => { vi(l).subtitle = 'Cẩm nang'.normalize('NFD') }, 'a decomposed subtitle', /vi\.subtitle: not in composed/)
  passes((l) => { vi(l).promotionalText = 'x'.repeat(170) }, '170 characters of promotional text')
  fails((l) => { vi(l).promotionalText = 'x'.repeat(171) }, '171 characters of promotional text', /promotionalText: 171 characters/)
  passes((l) => { vi(l).description = 'x'.repeat(4000) }, 'a 4,000-character description')
  fails((l) => { vi(l).description = 'x'.repeat(4001) }, 'a 4,001-character description', /description: 4001 characters/)
  fails((l) => { vi(l).description = 'Cá <b>neon</b>' }, 'HTML in a description', /description: HTML/)
  fails((l) => { delete vi(l).description }, 'no description', /vi\.description: missing/)
  passes((l) => { l.locales.th.keywords = 'ก'.repeat(33) }, '99 bytes of Thai keywords')
  fails((l) => { l.locales.th.keywords = 'ก'.repeat(34) }, '34 Thai letters of keywords (102 bytes)', /th\.keywords: 102 bytes/)
  fails((l) => { vi(l).keywords = 'neon,,betta' }, 'an empty keyword', /an empty keyword/)
  fails((l) => { vi(l).keywords = 'neon,betta,Neon' }, 'a keyword twice', /"Neon" twice/)
  assert(check(real, project).warnings.some((w) => /"pH" is 2 characters/.test(w)), 'a 2-character keyword not warned about')
  fails((l) => { vi(l).supportUrl = 'http://aquatome.com/vi/lien-he/' }, 'an http support URL', /supportUrl: not https/)
  fails((l) => { vi(l).privacyPolicyUrl = 'aquatome.com' }, 'a privacy URL with no scheme', /privacyPolicyUrl: not a URL/)
  passes((l) => { delete vi(l).marketingUrl }, 'no marketing URL')
  fails((l) => { vi(l).whatsNew = 'x' }, 'a field the listing has no place for', /vi\.whatsNew: not a listing field/)
  fails((l) => { l.primaryLocale = 'en-US' }, 'a primary locale with no copy', /primaryLocale: en-US/)
  fails((l) => { l.categories.primary = 'LIFESTYLE'; l.categories.secondary = 'REFERENCE' }, 'a primary category the app doesn\'t say', /the app says reference/)
  fails((l) => { l.categories.secondary = 'REFERENCE' }, 'one category twice', /the same twice/)
  fails((l) => { l.price = '0.99' }, 'a price', /price/)
  fails((l) => { l.contentRightsDeclaration = 'YES' }, 'a content rights answer Apple doesn\'t have', /contentRightsDeclaration/)
  fails((l) => { delete l.ageRating.userGeneratedContent }, 'an age rating question unanswered', /userGeneratedContent: not answered/)
  fails((l) => { l.ageRating.horrorOrFearThemes = 'SOME' }, 'an age rating answer Apple doesn\'t have', /horrorOrFearThemes: not one of/)
  fails((l) => { l.ageRating.advertising = 'no' }, 'a yes-or-no answered in words', /advertising: not answered/)
  fails((l) => { l.ageRating.kidsAgeBand = 'NINE_TO_ELEVEN' }, 'a question the script doesn\'t know', /kidsAgeBand: not a question/)
  passes((l) => { l.review.notes = 'x'.repeat(4000) }, '4,000 bytes of review notes')
  fails((l) => { l.review.notes = 'ể'.repeat(1334) }, '4,002 bytes of review notes', /review\.notes: 4002 bytes/)
  fails((l) => { l.review.notes += ' Write to someone@example.org.' }, 'an email in the review notes', /an email address/)
  fails((l) => { l.review.notes += ' Call +84 90 123 4567.' }, 'a phone number in the review notes', /a phone number/)
  passes((l) => { l.review.notes += ' Updated 2026-11-03.' }, 'a date in the review notes')
  fails((l) => { l.review.contactEmail = 'x' }, 'a review contact in the repository', /review\.contactEmail: entered on the App Store Connect website/)
  fails((l) => { l.screenshots.APP_IPHONE_69 = { simulator: 'x', sizes: [[1, 2]] } }, 'a display type Apple doesn\'t have', /APP_IPHONE_69: not an iPhone/)
  fails((l) => { l.screenshots.APP_IPHONE_67.sizes = [[1320]] }, 'a size without a height', /sizes: not/)
  fails((l) => { l.extra = 1 }, 'a top-level field the script doesn\'t know', /extra: not a field/)

  // A version every target shares, or none.
  assert(marketingVersion('MARKETING_VERSION = 0.1;\nMARKETING_VERSION = 0.1;') === '0.1', 'the project\'s version not read')
  let threw = false
  try { marketingVersion('MARKETING_VERSION = 0.1;\nMARKETING_VERSION = 0.2;') } catch { threw = true }
  assert(threw, 'two versions not caught')
  assert(/^\d+(\.\d+){0,2}$/.test(marketingVersion(project)), 'the project\'s version isn\'t a version')

  // Screenshots: the size the set takes, no alpha, 1 to 10.
  const header = (w, h, colour) => {
    const b = Buffer.alloc(33)
    b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1')
    b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = colour
    return { name: `${w}x${h}.png`, data: b }
  }
  const phone = real.screenshots.APP_IPHONE_67
  assert(!shotProblems([header(1320, 2868, 2)], phone).length, 'a 1320×2868 RGB screenshot refused')
  assert(shotProblems([header(1320, 2868, 6)], phone).some((p) => /alpha/.test(p)), 'an alpha channel not caught')
  assert(shotProblems([header(2868, 1320, 2)], phone).some((p) => /2868×1320, not 1320×2868/.test(p)), 'a landscape screenshot not caught')
  assert(shotProblems([header(2064, 2752, 2)], real.screenshots.APP_IPAD_PRO_3GEN_129).length === 0, 'a 2064×2752 iPad screenshot refused')
  assert(shotProblems(Array(11).fill(header(1320, 2868, 2)), phone).some((p) => /11 screenshots/.test(p)), '11 screenshots not caught')
  assert(shotProblems([], phone).some((p) => /0 screenshots/.test(p)), 'an empty set not caught')
  assert(shotProblems([{ name: 'a.png', data: Buffer.from('not a png') }], phone).some((p) => /not a PNG/.test(p)), 'a file that isn\'t a PNG not caught')

  // Never submitted, never a build, never released.
  for (const [method, path, body] of [
    ['POST', 'v1/reviewSubmissions', { type: 'reviewSubmissions' }],
    ['PATCH', 'v1/reviewSubmissions/1', { type: 'reviewSubmissions', id: '1', attributes: { submitted: true } }],
    ['POST', 'v1/reviewSubmissionItems', { type: 'reviewSubmissionItems' }],
    ['GET', 'v1/apps/1/reviewSubmissions'],
    ['POST', 'v1/appStoreVersionSubmissions', { type: 'appStoreVersionSubmissions' }],
    ['POST', 'v1/appStoreVersionReleaseRequests', { type: 'appStoreVersionReleaseRequests' }],
    ['POST', 'v1/appStoreVersionPhasedReleases', { type: 'appStoreVersionPhasedReleases' }],
    ['PATCH', 'v1/appStoreVersions/1/relationships/build', { type: 'builds', id: '2' }],
    ['POST', 'v1/appStoreVersions', { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: '1.0' }, relationships: { build: { data: { type: 'builds', id: '2' } } } }],
    ['PATCH', 'v1/appStoreVersions/1', { type: 'appStoreVersions', id: '1', relationships: { build: { data: { type: 'builds', id: '2' } } } }],
  ]) assert(refused(method, path, body), `${method} ${path} not refused`)
  for (const [method, path, body] of [
    ['PATCH', 'v1/appStoreVersionLocalizations/1', { type: 'appStoreVersionLocalizations', id: '1', attributes: { keywords: 'neon' } }],
    ['POST', 'v1/appStoreVersions', { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: '1.0' }, relationships: { app: { data: { type: 'apps', id: '1' } } } }],
    ['GET', 'v1/apps/1/appStoreVersions?filter[platform]=IOS'],
    ['DELETE', 'v1/appScreenshots/1'],
  ]) assert(!refused(method, path, body), `${method} ${path} refused`)
}

// ---- Main.

const mode = process.argv[2]
if (mode === '--test') {
  test()
} else if (mode === '--check') {
  const { errors, warnings } = check(JSON.parse(readFileSync(LISTING, 'utf8')), readFileSync(PROJECT, 'utf8'))
  for (const w of warnings) console.log(`::warning title=listing.json::${w}`)
  for (const e of errors) console.log(`::error title=listing.json::${e}`)
  if (errors.length) process.exit(1)
  console.log(`listing.json is within Apple's limits (${warnings.length} warnings).`)
} else if (mode === '--report' || mode === '--apply') {
  for (const k of ['KEY_PATH', 'KEY_ID', 'ISSUER_ID', 'APP_ID']) if (!process.env[k]) { console.log(`${k} is not set`); process.exit(1) }
  const listing = JSON.parse(readFileSync(LISTING, 'utf8'))
  const project = readFileSync(PROJECT, 'utf8')
  const { errors } = check(listing, project)
  if (errors.length) { for (const e of errors) console.log(`::error title=listing.json::${e}`); process.exit(1) }
  try {
    if (mode === '--report') report(compare(listing, await read(listing)))
    else await apply(listing, project)
  } catch (e) {
    console.log(`::error title=App Store Connect::${e.message}`)
    process.exit(1)
  }
} else {
  console.log('usage: asc-listing.mjs --test | --check | --report | --apply')
  process.exit(2)
}
