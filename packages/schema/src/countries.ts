/**
 * Countries by their ISO 3166-1 alpha-2 code, as a species' range names them (content `range`, engine range.ts): which
 * codes are countries, the code a name in a source's text stands for, and a country's name in a language
 * (`Intl.DisplayNames`; the site prefers its own place pages' names where it has one).
 */

/** Codes `Intl.DisplayNames` names that are not current countries: old, reserved, groupings and test codes. Kosovo (XK) stays: GBIF uses it. */
const NOT_COUNTRIES = new Set('AC AN BU CP CQ CS DD DG DY EA EU EZ FX HV IC NH QO RH SU TA TP UK UN VD XA XB YD YU ZR ZZ'.split(' '))

const english = () => new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })

let codes: string[] | undefined
/** Every country code, from A to Z: the 249 of ISO 3166-1, and Kosovo. */
export function countryCodes(): string[] {
  if (codes) return codes
  const en = english()
  const out: string[] = []
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const c = String.fromCharCode(a, b)
    if (!NOT_COUNTRIES.has(c) && en.of(c)) out.push(c)
  }
  return (codes = out)
}

export const isCountryCode = (code: string) => /^[A-Z]{2}$/.test(code) && countryCodes().includes(code)

/** A country's name in a language (vi, id, th, en …), as `Intl.DisplayNames` gives it. */
export const countryName = (code: string, lang: string) => new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code

/**
 * The other names sources write for a country: older names, short and long forms, a common misspelling, and the adjective
 * ("the Brazilian state of Amapá"). Not "Congo" or "Korea" alone, which name two countries, nor "Borneo", "Guiana" or
 * "New Guinea", which aren't one.
 */
const ALIASES: Record<string, string[]> = {
  AR: ['Argentine', 'Argentinian', 'Argentinean'], AU: ['Australian'], BD: ['Bangladeshi'], BN: ['Brunei Darussalam', 'Bruneian'],
  BO: ['Bolivian'], BR: ['Brazilian'], CD: ['DR Congo', 'D R Congo', 'DRC', 'Democratic Republic of Congo', 'Democratic Republic of the Congo', 'Zaire', 'Congo Kinshasa'],
  CG: ['Republic of Congo', 'Republic of the Congo', 'Congo Republic', 'Congo Brazzaville'], CI: ['Ivory Coast', 'Ivorian'], CL: ['Chilean'],
  CM: ['Cameroonian'], CN: ['Chinese', 'PR China', "People's Republic of China"],
  // Spruce Pets writes the neon tetra's range as "Brazil, Columbia, and Peru".
  CO: ['Colombian', 'Columbia'], CR: ['Costa Rican'], CU: ['Cuban'], CZ: ['Czech Republic'], EC: ['Ecuadorian', 'Ecuadorean'], ET: ['Ethiopian'],
  GA: ['Gabonese'], GB: ['UK', 'Britain', 'Great Britain', 'British'], GF: ['French Guianan'], GH: ['Ghanaian'], GN: ['Guinean'],
  GT: ['Guatemalan'], GY: ['Guyanese', 'British Guiana'], HK: ['Hong Kong'], HN: ['Honduran'], ID: ['Indonesian'], IN: ['Indian'],
  JP: ['Japanese'], KE: ['Kenyan'], KH: ['Cambodian', 'Kampuchea'], LA: ['Laotian', 'Lao', 'Lao PDR'], LK: ['Sri Lankan', 'Ceylon'],
  MG: ['Malagasy'], MK: ['Macedonia'], MM: ['Burmese'], MO: ['Macao', 'Macau'], MW: ['Malawian'], MX: ['Mexican'], MY: ['Malaysian'],
  MZ: ['Mozambican', 'Mozambiquan'], NG: ['Nigerian'], NI: ['Nicaraguan'], NL: ['Dutch', 'Holland'], NP: ['Nepalese', 'Nepali'],
  PA: ['Panamanian'], PE: ['Peruvian'], PG: ['Papuan'], PH: ['Philippine', 'Filipino'], PK: ['Pakistani'], PS: ['Palestine'],
  PY: ['Paraguayan'], RU: ['Russian'], SL: ['Sierra Leonean'], SR: ['Surinamese', 'Surinam', 'Dutch Guiana'], SZ: ['Swaziland'],
  TH: ['Thai', 'Siam', 'Siamese'], TL: ['East Timor'], TR: ['Turkey', 'Turkish'], TT: ['Trinidadian'], TW: ['Taiwanese'],
  TZ: ['Tanzanian'], UG: ['Ugandan'], US: ['USA', 'US', 'U S', 'U S A', 'United States of America', 'American'], UY: ['Uruguayan'],
  VE: ['Venezuelan'], VN: ['Vietnamese', 'Viet Nam'], ZA: ['South African'], ZM: ['Zambian'], ZW: ['Zimbabwean'],
}

/** Words before a country's name that only narrow it ("central Thailand", "northern India"). */
const LEADING = /^(?:the |(?:north|south|east|west|central|upper|lower|coastal|peninsular|mainland|inland|far)(?:ern|ernmost|most)?(?:[ -]?(?:north|south|east|west)(?:ern)?)? )+/

/** A name as the table keys it: no accents, case, punctuation or possessive. */
export function countryKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]s\b/g, '').replace(/&/g, ' and ').replace(/\bst\.?(?= )/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

let table: Map<string, string | null> | undefined
/** Name key → code; null where two countries share the key. */
function names(): Map<string, string | null> {
  if (table) return table
  const en = english()
  const t = new Map<string, string | null>()
  const add = (name: string, code: string) => {
    const k = countryKey(name)
    if (k) t.set(k, t.has(k) && t.get(k) !== code ? null : code)
  }
  for (const code of countryCodes()) {
    const name = en.of(code)!
    add(name, code)
    // "Myanmar (Burma)": both; "Hong Kong SAR China": its alias below.
    const paren = /^(.*?)\s*\((.*)\)$/.exec(name)
    if (paren) { add(paren[1]!, code); add(paren[2]!, code) }
    for (const a of ALIASES[code] ?? []) add(a, code)
  }
  return (table = t)
}

/**
 * The country a name stands for ("Thailand", "central Thailand", "Thailand's", "Siam", "Brazilian", "Côte d'Ivoire"); none
 * for a name of two countries or of none. Narrowing words count only when the whole name is no country: "South Africa"
 * and "South Sudan" are countries of their own.
 */
export function countryOf(name: string): string | undefined {
  const k = countryKey(name)
  const t = names()
  return (t.has(k) ? t.get(k) : t.get(k.replace(LEADING, '').trim())) ?? undefined
}

/** Names two countries share: a source's "Congo" or "Korea" is the one its sentence means, which only a reader can say. */
const SHARED: Record<string, string[]> = { congo: ['CG', 'CD'], korea: ['KR', 'KP'] }

/**
 * Whether a name a source writes can stand for this country: its own name (countryOf), or a name it shares with another
 * (Congo, Korea), when the reader of the sentence says it is this one.
 */
export function namesCountry(name: string, code: string): boolean {
  if (countryOf(name) === code) return true
  const k = countryKey(name)
  return (SHARED[k] ?? SHARED[k.replace(LEADING, '').trim()] ?? []).includes(code)
}

/** The country a place page is ("thailand", "democratic-republic-of-the-congo"); none for a region or a name of two ("congo", "korea"). */
export const placeCountry = (placeId: string) => countryOf(placeId.replace(/-/g, ' '))
