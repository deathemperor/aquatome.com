import { GALLON, givesDose, keeperFigure, US_TANKS, usTankOf } from './round'

/**
 * A breed page's units, mended by the reader-fit rewrite (fit-rewrite.ts; the chief of staff, 2026-11-12). A breed page
 * has no English beside it to keep a figure from: its facts (engine-state/breeds/<id>.json, breeds.ts) give a source's US
 * figure, and the page's litres are our conversion, so naming it as keepers here say is the rounding's job. Code works
 * out each figure from the source's own US figure, the rewriter is told it, its reviewer too, and a rewrite is kept only
 * with each one in it:
 * - a US tank in the table (US_TANKS) is the size it names: 29 or 30 gallons 120 lít;
 * - any other (35 gallons, 1,000 gallons, 3 gallons a fish) is keeperFigure's: 130, 4.000, 12 lít;
 * - "for each 2,5 cm" of a fish is a source's "per inch": given per cm, 10 gallons an inch 15 lít mỗi cm.
 * The US figure is the facts' own beside the page's figure ("35 US gal (about 132 L)"), else the facts' nearest within a
 * twentieth of it, else the table's for a volume only a gallon conversion gives (usTankOf: 110 lít is 29 gallons). A
 * finding is left to a person (`unitsLeft`) when a litre figure in it has neither, or a dose is given near it (round.ts
 * givesDose; an FAQ answer's question too), whose water stays exact, or it is given per a length other than an inch or a
 * cm; and (fit-rewrite.ts) when code works out no figure for it at all: gallons or a length in it, or a figure already
 * the size keepers say. A figure is read whole, from the paragraph its quote is in: "38 lít" there followed by "mỗi 2,5
 * cm" is per inch. A rewrite is kept only with each paragraph's litres as they were, in their order, each mended figure
 * in place of its old one and nothing else moved (`keepsFigures`): 15 lít mỗi cm, not 15 lít mỗi 2,5 cm, not the same
 * litres left in another paragraph, and not two figures trading places.
 */
/**
 * `was` and `is`: the figure as a quantity before and after ("132", "40/2.5cm" → "130", "15/cm"). `at`: where it is in
 * the text it was read from, so two findings quoting one figure mend it once.
 */
export type BreedFigure = { from: string; to: string; litres: number; why: string; was: string; is: string; at: string; perCm?: true; n?: number }
/** A figure with the block of the part it is in, and (`n`) which of that block's litres it is. */
export type PlacedFigure = BreedFigure & { block: number }

const EN_N = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`
const en = (s: string) => Number(s.replaceAll(',', ''))
const LITRE = String.raw`(?:L|litres?|liters?)`
const GAL = String.raw`(?:US\s+)?gal(?:lons?)?`
const ABOUT = String.raw`(?:about|roughly|approx\.?|~)?\s*`
/** "35 US gal (about 132 L)", "11 L (3 gal)": a single figure each side, never a range's end. */
const GAL_FIRST = new RegExp(String.raw`(?<![\d.,–-])(${EN_N})\+?\s*${GAL}\s*\(\s*${ABOUT}(${EN_N})\s*${LITRE}(?![\p{L}\d–-])`, 'giu')
const LITRE_FIRST = new RegExp(String.raw`(?<![\d.,–-])(${EN_N})\s*${LITRE}\s*\(\s*${ABOUT}(${EN_N})\+?\s*${GAL}(?![\p{L}])`, 'giu')

/** The US gallon figures a breed's facts give, each with the litre figure beside it. */
export function factsPairs(facts: string): [gallons: number, litres: number][] {
  return [...[...facts.matchAll(GAL_FIRST)].map(m => [en(m[1]!), en(m[2]!)] as [number, number]), ...[...facts.matchAll(LITRE_FIRST)].map(m => [en(m[2]!), en(m[1]!)] as [number, number])]
}

const VI_N = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`
const vi = (s: string) => Number(s.replaceAll('.', '').replace(',', '.'))
const viFigure = (n: number) => (n >= 1000 ? `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}` : String(n))
/** Litres in Vietnamese text: "132 lít", "3.800 lít", "75–115 lít". */
const VOLUME = new RegExp(String.raw`(?<![\d.,])(${VI_N})(?:\s*(?:[–-]|đến)\s*(${VI_N}))?\s*(?:lít|L|l)(?![\p{L}\p{N}])`, 'giu')
/**
 * An allowance per a length of fish, right after a volume ("nước" between at most): "cho mỗi", "trên mỗi", "mỗi", "từng", "/" and the
 * length; "cho" or "trên" and the length only with the fish after it ("trên 2,5 cm chiều dài cá"), since "đặt trên 2,5
 * cm xốp" is where a tank stands (Astra, 2026-11-13).
 */
/** What a length after a volume is of when it isn't the fish: the water's level, the tank, what's in or under it. */
const NOT_FISH = String.raw`\s*(?:mực\s+nước|nước|chiều\s+(?:cao|rộng)|(?:chiều\s+dài\s+)?(?:của\s+)?(?:bể|hồ|kính|thùng)|xốp|nền|sỏi|cát|đá)(?![\p{L}])`
const per = (length: string) => new RegExp(String.raw`^(?:\s+nước(?:\s+sạch)?)?\s*(?:(?:(?:(?:cho|trên)\s+)?(?:mỗi|từng)|\/)\s*${length}(?![\p{L}\p{N}])(?!${NOT_FISH})|(?:cho|trên)\s+${length}\s+(?:chiều\s+dài\s+)?(?:của\s+)?(?:thân\s+)?cá(?![\p{L}]))`, 'iu')
/** "mỗi 2,5 cm" (2,54 cm, "1 inch"): a source's "per inch". */
const PER_INCH = per(String.raw`(?:2,54?\s*cm|(?:1\s*)?inch)`)
/** "cho mỗi cm": a figure per cm of fish. */
const PER_CM = per(String.raw`(?:1\s*)?cm`)
/** Any other length ("mỗi 5 cm", "cho 3 inch cá"): an allowance code doesn't work from, left to a person. */
const PER_LENGTH = per(String.raw`\d[\d.,]*\s*(?:cm|mm|inch)`)
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const norm = (s: string) => flat(s.normalize('NFC')).toLowerCase()
/**
 * Any length after a volume in its clause (up to ", " or another figure) that none of the above reads ("38 lít nước đã khử clo mỗi 2,5 cm", "cho 2,5 cm",
 * "mỗi 2,5 cm mực nước", "cho mỗi khoảng 2,5 cm", "ứng với 2,5 cm", "mỗi 5–7,5 cm"): what it is per can't be told, so
 * it is for a person, never a tank (Astra, 2026-11-13). A tank set on something ("đặt trên tấm xốp dày 2,5 cm") is a
 * tank, and so is one given with its own size ("dài 60 cm", "60 × 30 × 30 cm") when no fish is named between.
 */
const LENGTH_NEAR = /^((?:(?!,\s)[^.;:!?\n\d]){0,60}?)\d[\d.,]*(?:\s*(?:[–-]|đến)\s*\d[\d.,]*)?\s*(?:cm|mm|inch)(?![\p{L}])/iu
const STANDS_ON = /^[^.;:!?\n]{0,40}?(?:đặt|kê|để)\s+trên(?:\s+\p{L}+){0,4}?\s+\d[\d.,]*\s*(?:cm|mm|inch)(?![\p{L}])/iu
/**
 * The tank's own size after its volume ("dài 60 cm", "dài khoảng 90 cm", "60 × 30 × 30 cm", "kính dày 5 mm"), with no
 * fish named before the length or after it in its clause ("ứng với chiều dài 2,5 cm của cá" is the fish's).
 */
const OWN_SIZE = /(?:dài|rộng|cao|sâu|dày|kích\s+thước|[×x*])(?:\s+\p{L}+){0,3}?\s*\(?\s*$/iu
const FISH = /(?<![\p{L}])(?:cá|con)(?![\p{L}])/iu
/** What a volume is given per, by the words after it. */
const perOf = (after: string) => {
  if (PER_INCH.test(after)) return '/2.5cm'
  if (PER_CM.test(after)) return '/cm'
  if (PER_LENGTH.test(after)) return '/length'
  const near = LENGTH_NEAR.exec(after)
  if (!near || STANDS_ON.test(after)) return ''
  const rest = after.slice(near[0].length).split(/,\s|[.;:!?\n]/)[0] ?? ''
  return OWN_SIZE.test(near[1]!) && !FISH.test(near[1]!) && !FISH.test(rest) ? '' : '/length'
}

/**
 * A reading of the water, so much in each litre ("oxy hòa tan 2,5 mg/l", "nitrat dưới 20 mg/l"): how the water is, not an
 * amount put into it, so it gives no dose's water to keep exact. Only a reading named as one: a treatment's rate ("xanh
 * methylen với liều 2 mg/l", "oxy già 1 ml/l", "thêm CO2 với liều 20 mg/l") is a dose. Read out of a units finding's section beyond its paragraph and the ones beside it
 * (fit-rewrite.ts), which are read whole: koi's oxygen, three paragraphs below its tank, leaves the tank.
 */
const READS_AS = String.raw`(?:\s*[:=<>≤≥~]\s*|\s+(?:hòa\s+tan|trong\s+(?:nước|bể|hồ)|dưới|trên|không\s+(?:được\s+)?(?:vượt\s+)?quá|ổn\s+định|tối\s+(?:đa|thiểu)|ít\s+nhất|khoảng|chừng|từ|ở|mức|nồng\s+độ|đạt|giữ|nên|phải|luôn|cần|là|còn|lên\s+(?:tới|đến)|vượt|quá|thấp\s+hơn|cao\s+hơn)(?![\p{L}])|\s+)*`
/**
 * The substance, then only the words a reading is said with ("hòa tan", "dưới", "giữ ở mức", ":"): a substance with
 * anything else before the figure ("khử nitrit bằng muối 1 g/l") is a treatment, and its figure a dose (Astra, 2026-11-13).
 */
const SUBSTANCE = String.raw`(?:[oô]xy|o[2₂]|amoni(?:ac|a)?|ammonia|nitrit|nitrat|nh[34₃₄][⁺+]?|no[23₂₃][⁻-]?|phốt\s*phát|phosphat|po[4₄][³]?[⁻-]?|co2|co₂)`
/**
 * A dose's words: "cho" as "cho vào", "cho thêm" or straight before the substance ("Cho ammonia 2 mg/l"), never "cho koi: oxy";
 * "phân" only as a fertiliser or before the substance, never waste ("phân hủy", "phân cá").
 */
const DOSE_WORD = String.raw`(?:liều|thêm|cho\s+(?:vào|thêm)|cho(?=\s+(?:(?:thêm|vào)\s+(?:bể\s+|nước\s+)?)?${SUBSTANCE}(?![\p{L}]))|bổ\s+sung|châm|dùng|pha|bơm|dung\s+dịch|thuốc|bón|phân(?=\s+(?:bón|nước|nền|lỏng|vi\s+lượng|đa\s+lượng|kali|đạm|lân|npk|${SUBSTANCE})(?![\p{L}])))(?![\p{L}])`
/** The substance after a dose's words anywhere before it in its sentence, a label's colon between too ("Liều dùng: ammonia 2 mg/l"). */
const READING = String.raw`(?<![\p{L}])(?<!${DOSE_WORD}[^.;!?\n]*)(?:[oô]xy(?!\s+già)|o[2₂]|amoni(?:ac|a)?|ammonia|nitrit|nitrat|nh[34₃₄][⁺+]?|no[23₂₃][⁻-]?|phốt\s*phát|phosphat|po[4₄][³]?[⁻-]?|co2|co₂)(?![\p{L}])${READS_AS}`
const CONCENTRATION = new RegExp(String.raw`(${READING})(?<![\d.,])\d[\d.,–-]*\s*(?:mg|g|gam|gram|ml|cc|ppm)\s*(?:\/|mỗi|trên)\s*(?:1\s*)?(?:l|lít)(?![\p{L}])`, 'giu')
export const withoutConcentrations = (text: string) => text.replace(CONCENTRATION, '$1 ')

/** The litres a Vietnamese text gives, each end of a range on its own. */
export const litresIn = (text: string) => [...text.matchAll(VOLUME)].flatMap(m => [vi(m[1]!), ...(m[2] ? [vi(m[2])] : [])])

/** The source's US gallons for a page's litre figure: the facts' own beside that figure, else their nearest within a twentieth, else a US tank's. */
function usGallons(l: number, pairs: [number, number][]): number | undefined {
  return pairs.find(([, L]) => L === l)?.[0] ??
    pairs.map(([g]) => [g, Math.abs(g * GALLON - l) / l] as const).filter(([, d]) => d <= 0.05).sort((a, b) => a[1] - b[1])[0]?.[0] ??
    usTankOf(l)?.[0]
}

/**
 * The volumes a quote touches, each read whole in `block`, the paragraph it is in (or in the quote alone, when it isn't
 * found there): what it is given per, and (`n`, only in its block) which of the block's litres its first end is.
 */
function volumesOf(quote: string, block?: string) {
  const q = norm(quote)
  const b = block === undefined ? '' : norm(block)
  const pos = q ? b.indexOf(q) : -1
  const [text, from, to] = pos >= 0 ? [b, pos, pos + q.length] : [q, 0, q.length]
  let k = 0
  return [...text.matchAll(VOLUME)].flatMap(m => {
    const ends = [m[1]!, ...(m[2] ? [m[2]] : [])]
    const n = k
    k += ends.length
    const end = m.index + m[0].length
    return end <= from || m.index >= to ? [] : [{ m, ends, end, text, per: perOf(text.slice(end)), n: pos >= 0 ? n : undefined }]
  })
}

/**
 * What keepers here say for each litre figure a units finding quotes, from the source's US figure. With `block`, the
 * paragraph the quote is in, each figure is read whole there: "38 lít" followed by "mỗi 2,5 cm" is per inch.
 */
export function breedFigures(quote: string, facts: string, block?: string): BreedFigure[] {
  const pairs = factsPairs(facts)
  const out: BreedFigure[] = []
  for (const { m, ends, end, text, per, n } of volumesOf(quote, block)) {
    // Already given per cm of fish: no US figure is a tank for it; per another length, it's for a person (unitsLeft).
    if (per === '/cm' || per === '/length') continue
    const perInch = per === '/2.5cm'
    const phrase = perInch ? text.slice(m.index, end + PER_INCH.exec(text.slice(end))![0].length) : ''
    for (const [i, s] of ends.entries()) {
      const l = vi(s)
      const g = usGallons(l, pairs)
      if (g === undefined) continue
      const table = US_TANKS.find(([x]) => x === g)?.[1]
      const litres = perInch ? keeperFigure((g * GALLON) / 2.54) : table ?? keeperFigure(g * GALLON)
      const gal = `${g.toLocaleString('en-US')} US gallon${g === 1 ? '' : 's'}`
      const at = `${m.index}:${s}`
      const place = n === undefined ? {} : { n: n + i }
      if (perInch) out.push({ from: phrase, to: `${viFigure(litres)} lít cho mỗi cm`, litres, why: `${gal} per inch`, was: `${l}/2.5cm`, is: `${litres}/cm`, at, perCm: true, ...place })
      else if (litres !== l) out.push({ from: `${s} lít`, to: `${viFigure(litres)} lít`, litres, why: gal, was: `${l}${per}`, is: `${litres}${per}`, at, ...place })
    }
  }
  return out
}

/**
 * The figures as the rewriter and its reviewer are told them: a range per inch once, as a range ("38–76 lít cho mỗi 2,5
 * cm" → "15–30 lít cho mỗi cm"), never its two ends apart.
 */
export const figuresSaid = (figures: BreedFigure[]) => figures.reduce<BreedFigure[][]>((out, f) => {
  const last = out.at(-1)
  const block = (x: BreedFigure) => (x as Partial<PlacedFigure>).block
  if (f.perCm && last?.[0]!.perCm && last[0].from === f.from && last[0].at.split(':')[0] === f.at.split(':')[0] && block(last[0]) === block(f)) last.push(f)
  else out.push([f])
  return out
}, []).map(g => (g.length === 1 ? `"${g[0]!.from}" → "${g[0]!.to}" (${g[0]!.why})`
  : `"${g[0]!.from}" → "${g.map(f => viFigure(f.litres)).join('–')} lít cho mỗi cm" (${g.map(f => f.why.replace(/ per inch$/, '')).join(' to ')} per inch)`)).join('; ')

/** A text's litres as whole quantities, each as often as it is given: "130", "15/cm" per cm of fish, "40/2.5cm" per inch. */
const quantities = (text: string) => [...text.matchAll(VOLUME)].flatMap(m => {
  const per = perOf(text.slice(m.index + m[0].length))
  return [m[1]!, ...(m[2] ? [m[2]] : [])].map(s => `${vi(s)}${per}`)
})
/** A clause's end: not a decimal or thousands mark ("2,5 cm", "1.100 lít"). */
const CLAUSE_END = /[;:!?\n]|[.,](?!\d)/
const FIGURES = new RegExp(String.raw`${VOLUME.source}|(?<![\d.,])(?:\d[\d.,]*(?:\s*(?:[–-]|đến)\s*\d[\d.,]*)?\s*)?(?:cm|mm|inch)(?![\p{L}])`, 'giu')
/** A clause with its litre and length figures set aside (they are what a mend changes) and its other numbers kept ("Bể 1"). */
const bare = (s: string) => s.replace(FIGURES, ' ').replace(/[,;:()]/g, ' ').replace(/\s+/g, ' ').trim()
/** A sentence's end: not a decimal or thousands mark. */
const SENTENCE_END = /[;!?\n]|\.(?!\d)/
/**
 * The words around a text's nth litre figure, figures aside: what the figure is of. Before it, its sentence back to its
 * start, a label before a colon too ("Bể chính: tối thiểu 132 lít"); after it, its clause ("132 lít cho bể chính").
 */
const leadOf = (text: string, n: number) => {
  let k = 0
  for (const m of text.matchAll(VOLUME)) {
    const ends = m[2] ? 2 : 1
    if (n < k + ends) {
      const before = text.slice(0, m.index).split(SENTENCE_END).map(bare).findLast(c => /\p{L}/u.test(c)) ?? ''
      return { before, after: bare(text.slice(m.index + m[0].length).split(CLAUSE_END)[0] ?? '') }
    }
    k += ends
  }
  return undefined
}
const tally = (xs: string[]) => xs.reduce((t, x) => t.set(x, (t.get(x) ?? 0) + 1), new Map<string, number>())
const said = (k: string) => `${viFigure(Number(k.split('/')[0]))} lít${k.endsWith('/cm') ? ' cho mỗi cm' : k.endsWith('/2.5cm') ? ' cho mỗi 2,5 cm' : ''}`

/**
 * A rewrite keeps each figure in its place: each paragraph's litres as they were, in their order, each mended figure in
 * place of its old one (`block`, `n`) and no other moved, so neither the same litres in another paragraph nor two figures
 * trading places pass; and the quote it mends gone from its paragraph. Texts are the part's paragraphs, one a line; a
 * rewrite that splits or joins them, or a figure not where it was read, is for a person.
 */
export function keepsFigures(before: string, after: string, quotes: string[], figures: PlacedFigure[]): string | undefined {
  const was = before.split('\n').map(norm)
  const now = after.split('\n').map(norm)
  if (was.length !== now.length) return `its paragraphs went from ${was.length} to ${now.length}, so its figures can't be held to their places`
  const missing = new Set<string>()
  const moved: string[] = []
  let swapped = false
  for (const [j, text] of was.entries()) {
    const want = quantities(text)
    const mine = figures.filter(f => f.block === j)
    for (const f of mine) {
      if (f.n === undefined || want[f.n] !== f.was) return `"${f.from}" isn't where it was read, so it can't be held to its place`
      want[f.n] = f.is
    }
    const have = quantities(now[j]!)
    if (want.join('|') === have.join('|')) continue
    const w = tally(want)
    const h = tally(have)
    for (const f of mine) if ((h.get(f.is) ?? 0) < (w.get(f.is) ?? 0)) missing.add(f.to)
    const off = [...new Set([...w.keys(), ...h.keys()])].filter(k => (w.get(k) ?? 0) !== (h.get(k) ?? 0))
    moved.push(...off.filter(k => !mine.some(f => f.is === k && (h.get(k) ?? 0) < (w.get(k) ?? 0))).map(k => `${said(k)} ${(h.get(k) ?? 0) > (w.get(k) ?? 0) ? 'added' : 'gone'}`))
    if (!off.length) swapped = true
  }
  if (missing.size) return `the figures as keepers say them aren't there: ${[...missing].join(', ')}`
  if (moved.length) return `another figure changed: ${moved.join(', ')}`
  if (swapped) return 'its figures changed places'
  // As often as before in its paragraph: one of two "132 lít" mended, the other, a spare tank's, may stay, but only with
  // each mended figure after the same words as before ("bể chính"), so the spare's can't be mended in its place by
  // trading the sentences round (Astra, 2026-11-13). Otherwise the quote must be gone.
  const times = (text: string, q: string) => text.split(q).length - 1
  // A figure per cm is held by the words before it: the words after it are its own "cho mỗi cm", which the mend writes.
  const astray = (j: number) => figures.filter(f => {
    if (f.block !== j) return false
    const a = leadOf(was[j]!, f.n!), b = leadOf(now[j]!, f.n!)
    return a?.before !== b?.before || (!f.perCm && a?.after !== b?.after)
  })
  const inPlace = (j: number) => !astray(j).length
  // Two tanks or more in a paragraph: each mended figure after its own words, or two different tanks could trade their
  // mends ("Bể chính: 132 lít. Thùng dự phòng: 190 lít.", Astra, 2026-11-13). Alone in its paragraph, it can't trade.
  const strays = was.flatMap((b, j) => (quantities(b).length > 1 ? astray(j) : []))
  if (strays.length) return `a mended figure isn't after its own words: ${strays.map(f => f.to).join(', ')}`
  const left = quotes.filter(q => {
    const i = q ? was.findIndex(b => b.includes(norm(q))) : -1
    return i >= 0 && (inPlace(i) ? times(now[i]!, norm(q)) >= times(was[i]!, norm(q)) : times(now[i]!, norm(q)) > 0)
  })
  return left.length ? `the figure it mends is still there: ${left.join('; ')}` : undefined
}

/**
 * Why a breed page's units finding is left to a person: a dose is given near it (`around`: its paragraph, the ones
 * before and after it, and the rest of its section, between the headings either side of it, fit-rewrite.ts), so a figure
 * in it may be the water the dose goes into, which stays exact; or a litre figure with no US figure to work from. Its
 * section and not the whole part: a breed page's body is one part of 30 to 40 paragraphs under about 7 headings, and a
 * treatment under its own heading would leave koi's tank (round.ts givesDose: a sentence or a clause is too narrow, a
 * dose's amount and its water can sit in two paragraphs or three).
 */
export function unitsLeft(quote: string, facts: string, around = quote, block?: string): string | undefined {
  const litres = litresIn(quote)
  if (!litres.length) return undefined
  if (givesDose(around) || givesDose(quote)) return 'a dose is given beside it, whose water stays exact'
  if (volumesOf(quote, block).some(v => v.per === '/length')) return 'a figure per a length code doesn\'t work from (only per inch or per cm)'
  const pairs = factsPairs(facts)
  const none = litres.filter(l => usGallons(l, pairs) === undefined)
  return none.length ? `no US figure to work ${none.map(l => l.toLocaleString('vi-VN')).join(', ')} lít from` : undefined
}
/**
 * Where a quote's litres are once another mend of the part reworded it, in the block it was in: the one sentence there
 * giving each of them. None, or two (a spare tank of the same size beside the minimum), and it's for a person.
 */
export function moved(quote: string, block: string): string | undefined {
  const want = litresIn(quote)
  const found = want.length ? flat(block).split(/(?<=[.!?…])\s+/).filter(s => want.every(l => litresIn(s).includes(l))) : []
  return found.length === 1 ? found[0] : undefined
}
