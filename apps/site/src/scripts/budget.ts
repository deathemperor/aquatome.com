import type { Lang, T } from '../lib/i18n'
import { msg } from '../i18n/msg'
import { WATER_SHARE } from './calc'

/**
 * The whole-setup budget planner (pages/cong-cu/du-toan-be.astro): what a tank's kit costs to buy and to run, always as
 * a range. Plain data and arithmetic with no DOM, so the page draws its default on the server and its script redraws
 * with the same code, and the iOS app can share it. Every figure is from docs/research/smart-tank-and-budget.md §5
 * (Vietnamese aquarium shops' list prices, read on READ); shops aren't named here, only the tables' prices.
 *
 * A table's cell becomes a range by one rule (`cell`), which the page states too:
 * - a cell holds the list prices the research found for that tier and size;
 * - two or more: lowest to highest;
 * - one: up to the next price listed in the same table (down to the one below, for the table's top price);
 * - none: the prices at the sizes either side when both have some, else the nearest tier's range (mid's, for budget
 *   and premium; budget's, for mid).
 */
export const READ = '2026-11-06'

/** Tank lengths the research priced (cm), and the presets the page offers for them: ready-made sizes from the tank volume tool. */
export const BANDS = [30, 45, 60, 90, 120] as const
export const PRESETS: readonly (readonly [number, number, number])[] = [[30, 20, 20], [40, 25, 25], [60, 30, 36], [90, 45, 45], [120, 50, 55]]
export const TIERS = ['tiet-kiem', 'tam-trung', 'cao-cap'] as const
export type Tier = (typeof TIERS)[number]
export const TIER_NAMES: Record<Tier, string> = { 'tiet-kiem': msg('Tiết kiệm'), 'tam-trung': msg('Tầm trung'), 'cao-cap': msg('Cao cấp') }
export type Range = readonly [number, number]

/** A research table: per tier, the list prices in thousand đồng at 30, 45, 60, 90 and 120 cm ([] where it found none). */
type Table = Record<Tier, readonly (readonly number[])[]>
const NEAREST: Record<Tier, Tier> = { 'tiet-kiem': 'tam-trung', 'tam-trung': 'tiet-kiem', 'cao-cap': 'tam-trung' }

/** A cell's range in đồng, and the tier whose prices gave it (its description goes with it). */
export function cell(table: Table, tier: Tier, i: number, seen: string[] = []): { range: Range; from: Tier } {
  if (seen.includes(tier)) throw new Error(`no prices at size ${i} in any tier`)
  const own = table[tier][i]!
  const k = (lo: number, hi: number) => ({ range: [lo * 1000, hi * 1000] as const, from: tier })
  if (own.length > 0) {
    const lo = Math.min(...own), hi = Math.max(...own)
    if (lo < hi) return k(lo, hi)
    const all = Object.values(table).flat(2)
    const up = all.filter(p => p > lo)
    return up.length > 0 ? k(lo, Math.min(...up)) : k(Math.max(...all.filter(p => p < lo)), lo)
  }
  const left = table[tier][i - 1], right = table[tier][i + 1]
  if (left?.length && right?.length) return k(Math.min(...left), Math.max(...right))
  return cell(table, NEAREST[tier], i, [...seen, tier])
}

// The research's tables (§5), thousand đồng, at 30, 45, 60, 90, 120 cm.
const TANK: Table = {
  'tiet-kiem': [[77], [197, 259], [235, 498], [820, 1296], [1920]], // 90: none listed, the 80 and 100 cm tanks (as the research has them)
  'tam-trung': [[187, 300, 350], [450], [510, 600, 800], [700, 3700], [700, 3700]], // 90, 120: made to order, 0.7–3.7M across sizes
  'cao-cap': [[], [], [1150, 1600], [5934, 7723], [9149]],
}
// Budget: the reader's own furniture (₫0) or an iron frame; mid: an iron frame; premium: an aluminium kit. No frame at 90 cm.
const STAND: Table = {
  'tiet-kiem': [[0, 600], [0, 600], [0, 650], [], [0, 1200]],
  'tam-trung': [[600], [600], [650], [], [1200]],
  'cao-cap': [[], [], [2725], [3089, 3483], [4069]],
}
const HANG_ON: Table = {
  'tiet-kiem': [[75, 90], [120], [180], [], []],
  'tam-trung': [[110], [280, 330], [361, 364], [], []],
  'cao-cap': [[], [], [462, 797], [], []],
}
const CANISTER: Table = {
  'tiet-kiem': [[], [550], [800, 850], [1100], [1300, 1370]],
  'tam-trung': [[], [], [1050, 1200], [1285, 1380], [1585, 1850]],
  'cao-cap': [[], [], [2202, 4390], [3788, 5000], [4508, 6380]],
}
const LIGHT: Table = {
  'tiet-kiem': [[400], [450], [500, 900], [600], [1300]],
  'tam-trung': [[669, 1250], [803, 1300, 1400], [848, 1050, 1600], [1116, 2070], [1473, 1800, 3430]],
  'cao-cap': [[1850, 2000, 2400], [2300, 2400, 2900, 3270], [2900, 3200, 3450, 4020], [3850, 4200, 4900, 5530], [4650, 5000, 7045]],
}
// The research's own arithmetic for a 5 cm layer of each tier's soil at each size.
const SUBSTRATE: Table = {
  'tiet-kiem': [[100], [250, 300], [250, 300], [500, 600], [750, 900]],
  'tam-trung': [[205, 260], [480, 600], [480, 600], [1000, 1800], [1900, 2400]],
  'cao-cap': [[360], [760, 1100], [760, 1100], [1500, 3300], [3000, 4400]],
}
// Budget: a mini kit for 30 cm; mid: a 2–3 kg cylinder with a solenoid, 45 cm up; premium: an aluminium cylinder,
// solenoid and inline diffuser (2,400 + 480–550 + 350), or a brand's kit.
const CO2: Table = {
  'tiet-kiem': [[160], [], [], [], []],
  'tam-trung': [[], [1050, 1550, 1600], [1050, 1550, 1600], [1050, 1550, 1600], [1050, 1550, 1600]],
  'cao-cap': [[], [1100, 3230, 3300], [1100, 3230, 3300], [1100, 3230, 3300], [1100, 3230, 3300]],
}
const every = (prices: number[]) => [prices, prices, prices, prices, prices]
const TESTS: Table = { 'tiet-kiem': every([82, 195]), 'tam-trung': every([160, 170, 245]), 'cao-cap': every([350, 400, 1300]) }
// Heaters are sold by watts, not tank size; a fan is the other way to hold the temperature (one up to 40 cm, two to
// 100 cm, four above). A chiller (3.85–8.8M) isn't counted.
const HEATERS: Record<Tier, number[]> = { 'tiet-kiem': [70, 112, 150, 200], 'tam-trung': [200, 220, 320], 'cao-cap': [850, 1000] }
const FANS = [130, 270, 270, 270, 350]
// Budget: a one-outlet Wi-Fi timer; mid: a Tuya strip; premium: a strip, an ESP32 with a temperature probe, and a box
// for Home Assistant (a used mini PC, or a Raspberry Pi 5 with its power supply), each part's lowest to highest added up.
const SMART: Table = {
  'tiet-kiem': every([125, 140, 150, 213, 235]),
  'tam-trung': every([250, 400, 420, 435, 450, 480, 650]),
  'cao-cap': every([250 + 135 + 35 + 3500, 650 + 230 + 75 + 5500]),
}

export type PartId = 'be' | 'chan' | 'loc' | 'nhiet' | 'den' | 'nen' | 'co2' | 'test' | 'thong-minh'
type Part = {
  id: PartId
  name: string
  /** The equipment category of the site's shop searches (/go/, lib/format goLink); none for kit the site has no search for. */
  category?: string
  only?: 'co2' | 'smart'
  price: (tier: Tier, i: number) => { range: Range; what: string; keyword?: string; kind?: 'treo' | 'thung' }
}
const by = (table: Table, what: Record<Tier, string>, keyword?: string) => (tier: Tier, i: number) => {
  const c = cell(table, tier, i)
  return { range: c.range, what: what[c.from], keyword }
}
/** Hang-on filters for the small tanks (to 60 cm on a budget), canisters above. */
const hangOn = (tier: Tier, i: number) => i <= (tier === 'tiet-kiem' ? 2 : 1)

/** The parts of a setup, in the order a reader buys them. Keywords are the site's own shop searches for that kind of kit. */
export const PARTS: readonly Part[] = [
  { id: 'be', name: msg('Bể kính'), category: 'be-ca', price: (tier, i) => ({ ...by(TANK, { 'tiet-kiem': msg('Bể kính loại rẻ'), 'tam-trung': msg('Bể kính siêu trong'), 'cao-cap': msg('Bể siêu trong, kính dày') })(tier, i), keyword: i <= 1 ? 'bể cá mini' : `bể cá ${BANDS[i]}cm` }) },
  { id: 'chan', name: msg('Chân, tủ'), price: by(STAND, { 'tiet-kiem': msg('Kệ sẵn có hoặc chân sắt'), 'tam-trung': msg('Chân sắt'), 'cao-cap': msg('Bộ chân nhôm') }) },
  {
    id: 'loc', name: msg('Lọc'), category: 'loc',
    price: (tier, i) => {
      const treo = hangOn(tier, i)
      return { range: cell(treo ? HANG_ON : CANISTER, tier, i).range, what: treo ? msg('Lọc treo') : msg('Lọc thùng'), keyword: treo ? 'lọc treo bể cá' : 'lọc thùng bể cá', kind: treo ? 'treo' : 'thung' }
    },
  },
  {
    id: 'nhiet', name: msg('Sưởi hoặc quạt'), category: 'suoi',
    price: (tier, i) => {
      const all = [...HEATERS[tier], FANS[i]!]
      return { range: [Math.min(...all) * 1000, Math.max(...all) * 1000], what: msg('Sưởi có chỉnh nhiệt, hoặc quạt mát'), keyword: 'sưởi bể cá có chỉnh nhiệt' }
    },
  },
  { id: 'den', name: msg('Đèn'), category: 'den', price: by(LIGHT, { 'tiet-kiem': msg('Đèn LED'), 'tam-trung': msg('Đèn LED có Bluetooth'), 'cao-cap': msg('Đèn RGB cao cấp có Bluetooth') }, 'đèn led thủy sinh') },
  { id: 'nen', name: msg('Phân nền'), category: 'phan-nen', price: by(SUBSTRATE, { 'tiet-kiem': msg('Akadama hoặc phân nền giá rẻ, lớp 5 cm'), 'tam-trung': msg('Phân nền thủy sinh, lớp 5 cm'), 'cao-cap': msg('Phân nền cao cấp, lớp 5 cm') }, 'phân nền thủy sinh') },
  {
    id: 'co2', name: msg('Bộ CO₂'), category: 'co2', only: 'co2',
    price: (tier, i) => ({ ...by(CO2, { 'tiet-kiem': msg('Bộ CO₂ mini, hoặc bình 3 kg'), 'tam-trung': msg('Bình CO₂ 2–3 kg có van điện'), 'cao-cap': msg('Bình nhôm hoặc bộ CO₂ của hãng, van điện') })(tier, i), keyword: i === 0 ? 'bình co2 mini thủy sinh' : 'bộ co2 thủy sinh' }),
  },
  { id: 'test', name: msg('Bộ test nước'), category: 'test-nuoc', price: by(TESTS, { 'tiet-kiem': msg('Que thử nhiều chỉ số'), 'tam-trung': msg('Bộ test dạng nước'), 'cao-cap': msg('Test từng chỉ số, máy đo pH') }, 'bộ test nước bể cá') },
  { id: 'thong-minh', name: msg('Thiết bị thông minh'), only: 'smart', price: by(SMART, { 'tiet-kiem': msg('Ổ cắm hẹn giờ Wi-Fi'), 'tam-trung': msg('Ổ cắm Wi-Fi nhiều ổ'), 'cao-cap': msg('Ổ cắm Wi-Fi, cảm biến nhiệt và hộp Home Assistant') }) },
]

/**
 * Running costs. Watts (§5 "wattage"): the light runs 8 hours a day, the rest all day. A light's range is the Chihiros
 * WRGB II one size down to the one for the size (30 cm: the research's 13 W example up to the WRGB II Pro's 37 W;
 * 120 cm: up to the Pro's 138 W). A heater runs only below its set point and the research found no figure for how often,
 * so heaters, fans and chillers aren't counted; nor are a CO₂ solenoid or a smart strip (no wattage found).
 */
export const LIGHT_W: readonly Range[] = [[13, 37], [33, 49], [49, 67], [67, 100], [100, 138]]
export const FILTER_W: Record<'treo' | 'thung', Range> = { treo: [2.5, 8], thung: [8, 22] }
/** A Home Assistant Green, idle to working: the only box the research has a figure for. */
export const HUB_W: Range = [1.7, 3]
export const LIGHT_HOURS = 8

export type Country = 'vn' | 'id' | 'th'
export type Currency = 'VND' | 'IDR' | 'THB'
/**
 * Household electricity, per unit (kWh), the tiers a household's month reaches. A tank adds to the top of the bill, so
 * the reader picks the highest tier their household reaches; `pick` is the one the research worked its examples with.
 */
export const TARIFFS: Record<Country, { currency: Currency; tiers: readonly { label: string; rate: number }[]; pick: number; note: string }> = {
  // EVN from 2026-11-01, before VAT.
  vn: {
    currency: 'VND', pick: 2, note: msg('Giá điện sinh hoạt EVN từ 01/11/2026, chưa gồm VAT.'),
    tiers: [{ label: '0–100 kWh', rate: 1901 }, { label: '101–200 kWh', rate: 2289 }, { label: '201–400 kWh', rate: 2894 }, { label: '401–700 kWh', rate: 3456 }, { label: '≥ 701 kWh', rate: 3844 }],
  },
  // PLN, October to December 2026, the non-subsidised household classes.
  id: {
    currency: 'IDR', pick: 1, note: msg('Giá điện PLN tháng 10–12/2026, hộ không được trợ giá.'),
    tiers: [{ label: 'R-1 900 VA', rate: 1352 }, { label: 'R-1 1300–2200 VA', rate: 1444.7 }, { label: 'R-2, R-3 ≥ 3500 VA', rate: 1699.53 }],
  },
  // PEA and MEA from the September 2026 bill (type 1.1.2), plus the Ft of 0.1623 baht for September to December 2026.
  th: {
    currency: 'THB', pick: 0, note: msg('Giá điện Thái Lan từ kỳ tháng 9/2026, đã cộng Ft 0,1623 baht, chưa gồm phí dịch vụ và VAT.'),
    tiers: [{ label: '1–200 kWh', rate: 3 + 0.1623 }, { label: '201–400 kWh', rate: 4.1584 + 0.1623 }, { label: '≥ 401 kWh', rate: 4.3583 + 0.1623 }],
  },
}
/**
 * A page's own country, for the tariff it starts with. Malay has none, nor the page (lib/i18n.ts PAGES): Malaysia's tariff
 * isn't researched yet.
 */
export const COUNTRY_OF: Partial<Record<Lang, Country>> = { vi: 'vn', id: 'id', th: 'th' }
export const COUNTRY_NAMES: Record<Country, string> = { vn: msg('Việt Nam'), id: msg('Indonesia'), th: msg('Thái Lan') }
/** A tariff tier's price for one kWh: "2.894 ₫/kWh", "Rp 1.444,7/kWh", "฿3,1623/kWh". */
export const rateText = (rate: number, currency: Currency, locale: string) => `${new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 4 }).format(rate)}/kWh`

/** A 3 kg cylinder's refill (₫80–170k) over the 3 to 5 months shop pages say it lasts (not confirmed). */
export const CO2_MONTH: Range = [16_000, 57_000]
/** Seachem Flourish: ₫290k for 250 mL, 5 mL per 250 L once or twice a week. Other nutrients cost more on top. */
export const FERT = { price: 290_000, bottleMl: 250, mlPer250L: 5, perWeek: [1, 2] as const }
/** A pack of flake or pellet food; how long one lasts is the reader's to say. */
export const FOOD_PACK: Range = [50_000, 120_000]
export const FOOD_MONTHS = [1, 2, 3] as const

export type Size = { l?: number; w?: number; h?: number; litres?: number }
/** A tank's litres, from its sides (cm) or as given. */
export const litresOf = (s: Size) => (s.l && s.w && s.h ? (s.l * s.w * s.h) / 1000 : s.litres ?? 0)
// Litres between the presets (geometric means of their volumes): a tank given in litres takes the nearest preset's size.
const LITRE_EDGES = PRESETS.slice(1).map((p, i) => Math.sqrt(litresOf({ l: p[0], w: p[1], h: p[2] }) * litresOf({ l: PRESETS[i]![0], w: PRESETS[i]![1], h: PRESETS[i]![2] })))
const LENGTH_EDGES = BANDS.slice(1).map((b, i) => (b + BANDS[i]!) / 2)
/** Past this the research has no prices: a 150 cm or 600 L tank costs more than the 120 cm figures. */
export const OVER = { cm: 135, litres: 450 }

/** The priced size a tank falls in (index into BANDS): by length when given, else by litres. */
export function bandOf(s: Size): { i: number; over: boolean } | undefined {
  if (s.l && s.l > 0) return { i: LENGTH_EDGES.filter(e => s.l! > e).length, over: s.l > OVER.cm }
  if (s.litres && s.litres > 0) return { i: LITRE_EDGES.filter(e => s.litres! > e).length, over: s.litres > OVER.litres }
  return undefined
}

export type Input = { size: Size; tier: Tier; co2: boolean; smart: boolean; country: Country; tariff: number; foodMonths: number }
const add = (a: Range, b: Range): Range => [a[0] + b[0], a[1] + b[1]]
const times = (r: Range, k: number): Range => [r[0] * k, r[1] * k]

/** Everything the page shows, worked out. Undefined until the size is known. */
export function plan(x: Input) {
  const band = bandOf(x.size)
  if (!band) return undefined
  const litres = litresOf(x.size)
  const parts = PARTS.filter(p => !p.only || (p.only === 'co2' ? x.co2 : x.smart)).map(p => ({ id: p.id, name: p.name, category: p.category, ...p.price(x.tier, band.i) }))
  const total = parts.reduce<Range>((s, p) => add(s, p.range), [0, 0])
  // Watt-hours a day, then kWh in a 30-day month.
  const filter = FILTER_W[parts.find(p => p.id === 'loc')!.kind!]
  let wh = add(times(LIGHT_W[band.i]!, LIGHT_HOURS), times(filter, 24))
  if (x.smart && x.tier === 'cao-cap') wh = add(wh, times(HUB_W, 24))
  const kwh = times(wh, 30 / 1000)
  const tariff = TARIFFS[x.country]
  const rate = tariff.tiers[x.tariff]?.rate ?? tariff.tiers[tariff.pick]!.rate
  const power = times(kwh, rate)
  const water = litres * WATER_SHARE
  const fertMonth = (perWeek: number) => (water / 250) * FERT.mlPer250L * perWeek * (30 / 7) * (FERT.price / FERT.bottleMl)
  const fert: Range = [fertMonth(FERT.perWeek[0]), fertMonth(FERT.perWeek[1])]
  const food = times(FOOD_PACK, 1 / x.foodMonths)
  const co2 = x.co2 ? CO2_MONTH : undefined
  // Things bought in đồng add up; electricity is in the tariff's own currency and is added only when that's đồng too.
  const bought = [fert, food, ...(co2 ? [co2] : [])].reduce(add)
  return { band: BANDS[band.i]!, over: band.over, litres, parts, total, kwh, rate, currency: tariff.currency, power, fert, food, co2, month: tariff.currency === 'VND' ? add(bought, power) : bought }
}
export type Plan = NonNullable<ReturnType<typeof plan>>

/** Rounds a price to what's worth reading: hundreds under 10k, thousands under 100k, tens of thousands under a million, then 100k. */
export const nice = (n: number) => { const step = n < 10_000 ? 100 : n < 100_000 ? 1_000 : n < 1_000_000 ? 10_000 : 100_000; return Math.round(n / step) * step }

/** A range of money as the page writes it: "510–800 nghìn ₫", "1,2–3,7 triệu ₫", "Rp 25.200 – Rp 46.100". */
export function money(r: Range, currency: Currency, t: T, locale: string): string {
  const [lo, hi] = [nice(r[0]), nice(r[1])]
  if (currency !== 'VND') {
    const step = currency === 'IDR' ? 100 : 1
    const nf = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
    // Each end in full: Intl's own range format joins them differently from one browser to the next.
    return `${nf.format(Math.round(r[0] / step) * step)} – ${nf.format(Math.round(r[1] / step) * step)}`
  }
  const n = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)
  const m = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v)
  if (hi < 1_000_000) return t(msg('{a}–{b} nghìn ₫'), { a: n(lo / 1000), b: n(hi / 1000) })
  if (lo >= 1_000_000) return t(msg('{a}–{b} triệu ₫'), { a: m(lo / 1e6), b: m(hi / 1e6) })
  return t(msg('{a} nghìn – {b} triệu ₫'), { a: n(lo / 1000), b: m(hi / 1e6) })
}

/** "06/11/2026" in the page's own calendar. */
export const readDate = (locale: string, iso = READ) => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
