import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addDays, cardShownIn, CardSchema, CurationSchema, LANGS, loadAll, resolveDataCard, STAPLE_SPECIES, POPULAR, POPULAR_BREEDS, type CardEntity, type Content, type Curation, type CurationDay, type CurationWeek, type Photo } from '@aq/schema'
import { fitKey, type FitState } from './fit'
import { gateChecks } from './gate'
import { loadPages, type Page } from './pages'
import type { PhotoVerdict } from './photo-check'

/**
 * The editorial calendar's planner. It fills Hôm nay's days and checks every pick against what a featured page needs:
 * - it passes the reader-fit gate (gate.ts): not held back, and no finding the gate holds a page for;
 * - its card photo is checked (the right fish, typical, no person, logo or watermark) and big enough for the card.
 * A person's choice (`fixed`, or a week's own lists) is kept while it passes; a pick that stops passing is replaced.
 * Picks come from the week's theme (its `tags` and lists), how well known a fish is, readers' searches (Search Console),
 * and what's new, never the same fish twice in four weeks.
 */

/** Card shapes, width over height: Hôm nay's cards are about 400×420 pt, Khám phá's top cards are wider than tall. */
export const SLOT_RATIO = { square: 400 / 420, wide: 1.6 } as const
export type Slot = keyof typeof SLOT_RATIO
/** A large card is about 1,200 px across at 3×: this is the least a photo may give it after the crop (a 5% stretch). */
export const LARGE_PX = 1140
/** A photo's pixels across a card of this shape, once cropped to it. */
export const across = (p: Pick<Photo, 'width' | 'height'>, slot: Slot) => Math.round(Math.min(p.width, p.height * SLOT_RATIO[slot]))

/** No fish or guide comes back on Hôm nay within this many days. */
export const REPEAT_DAYS = 28

/** Each tag as the owner's daily report says it, in the day's `why`. */
const TAG_WORDS: Record<string, string> = { cold: 'takes cool water', heater: 'needs a heater when it turns cold', beginner: 'easy to keep', nano: 'a small schooling fish for a small tank', local: 'native to Vietnam' }

/** What a week can ask its fish to be (a week's `tags`): how the planner reads each from a page's figures. */
export const TAGS: Record<string, (f: Facts) => boolean> = {
  /** Takes cooler water than tropical fish: by the page's own lowest temperature, and by its kind only when the page
   * gives none (editors, 2026-11-08: a koi whose page says 20–27 °C was on the cold shelf). */
  cold: f => (f.tempMin !== undefined ? f.tempMin <= 18 : f.coldwater),
  /** Needs a heater when the north turns cold. */
  heater: f => f.tempMin !== undefined && f.tempMin >= 24,
  beginner: f => f.difficulty !== undefined && f.difficulty <= 3,
  /** A fish (not a snail or shrimp) of 4 cm at most, kept in a group of 5 or more, whose page asks for a tank of 60 cm at
   * most: the small-tank week is "small schooling fish" (a ram, small but no schooler, had filled one of its days). */
  nano: f => !f.invert && f.sizeMax !== undefined && f.sizeMax <= 4 && (f.schoolMin ?? 0) >= 5 && (f.tankCm ?? 0) <= 60,
  /** Native to Vietnam by the page's native range; by where it's recorded only when the page has no native range
   * (editors, 2026-11-08: Betta splendens is recorded in Vietnam, but its page says native to Thailand only). */
  local: f => (f.native ? f.native.includes('VN') : f.places.includes('vietnam')),
}

export type Facts = { tempMin?: number; difficulty?: number; sizeMax?: number; tankCm?: number; schoolMin?: number; places: string[]; native?: string[]; coldwater: boolean; invert?: boolean }
export type Candidate = {
  kind: 'species' | 'breeds' | 'guides'
  id: string
  /** How the calendar names it: "species/<id>". */
  ref: string
  /** Its Vietnamese address, for people reading the plan. */
  path: string
  name: string
  /** The best checked photo for each card shape, and its pixels across. */
  photo: Partial<Record<Slot, { url: string; px: number }>>
  /** Every checked photo of the page by address, with its pixels across each card shape: what a calendar's `img` may be. */
  checked: Record<string, Record<Slot, number>>
  /** Passes the reader-fit gate in Vietnamese. */
  fit: boolean
  /** Why not, when it doesn't. */
  fitWhy?: string
  indexable: boolean
  facts: Facts
  /** Its place in the site's order of well-known fish (0 first), or none. */
  known?: number
  /** Search Console impressions over its pages in every language. */
  demand: number
  updatedAt?: string
  group?: string
}

/** Goldfish and koi lines: cold-water fish whatever their pages' figures say. */
const COLDWATER_OF = ['carassius-auratus', 'cyprinus-rubrofuscus', 'cyprinus-carpio']

export type Verdicts = { subjects: Record<string, Record<string, PhotoVerdict>>; legacy: Record<string, PhotoVerdict>; rejected: Record<string, string>; faces: Record<string, number> }
/** The photo checks' verdicts (engine-state), as cardWorthy reads them. */
export const readVerdicts = async (root: string): Promise<Verdicts> => {
  const state = join(root, 'engine-state')
  return {
    subjects: await json(join(state, '_photo-subjects.json'), {}),
    legacy: await json(join(state, '_photo-check.json'), {}),
    rejected: await json(join(state, '_photo-rejected.json'), {}),
    faces: await json(join(state, '_photo-faces.json'), {}),
  }
}

/** Whether a photo may lead a card for this page: judged the right subject and typical, with no person or logo. */
export function cardWorthy(url: string, page: string, v: Verdicts, avoid: Record<string, string>, guide = false): boolean {
  if (url in v.rejected || url in avoid || (v.faces[url] ?? 0) > 0) return false
  const own = v.subjects[url]?.[page]
  const verdict = own && !own.guide ? own : v.legacy[url]?.ok !== 'unsure' ? v.legacy[url] : undefined
  // A guide's photo is judged against its caption when it names a fish; one with no verdict has passed the face and
  // watermark checks only, so a person looks at it before it leads (the planner lists it).
  if (guide) return !verdict || (!verdict.person && !verdict.logo && verdict.ok !== 'dead')
  return !!verdict && verdict.ok === 'yes' && verdict.typical && !verdict.person && !verdict.logo
}

/**
 * A page's checked photos: the best for each card shape, and every one with its size across each. A photo with a large
 * copy (large-photos.ts) leads by that copy, the address the app loads; its page copy stays one a calendar may name.
 */
export function photosFor(photos: Photo[], ok: (p: Photo) => boolean): Pick<Candidate, 'photo' | 'checked'> {
  const photo: Candidate['photo'] = {}
  const checked: Candidate['checked'] = {}
  for (const p of photos.filter(ok)) {
    for (const x of p.large ? [p, p.large] : [p]) checked[x.url] = { square: across(x, 'square'), wide: across(x, 'wide') }
    const big = p.large ?? p
    for (const slot of ['square', 'wide'] as const) if (!photo[slot] || across(big, slot) > photo[slot].px) photo[slot] = { url: big.url, px: across(big, slot) }
  }
  return { photo, checked }
}

const json = async <T>(path: string, fallback: T): Promise<T> => JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) ?? fallback

export async function readCalendar(root: string): Promise<Curation> {
  const raw = await json<unknown>(join(root, 'content/curation.json'), { version: 1, weeks: [], days: [] })
  return CurationSchema.parse(raw)
}

export async function writeCalendar(root: string, cur: Curation) {
  const days = [...cur.days].sort((a, b) => a.date.localeCompare(b.date))
  const weeks = [...cur.weeks].sort((a, b) => a.from.localeCompare(b.from))
  await writeFile(join(root, 'content/curation.json'), `${JSON.stringify({ ...cur, weeks, days }, null, 1)}\n`)
}

/** Search Console impressions by page path ("/vi/ca/x/", "/th/fish/x/"), from a saved export ({rows: [{keys: [url], impressions}]}). */
export function demandByPath(rows: { keys: string[]; impressions: number }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const path = new URL(r.keys[0]!).pathname.replace(/\/(photos|foto|anh)\/$/, '/')
    const vi = /^\/(id|th|ms|vi)\//.test(path) ? path : `/vi${path}`
    out.set(vi, (out.get(vi) ?? 0) + r.impressions)
  }
  return out
}

/** Every fish, breed and guide page in Vietnamese, with what the planner needs to know of it. */
export async function candidates(root: string, o: { demand?: Map<string, number>; avoid?: Record<string, string> } = {}): Promise<Candidate[]> {
  const content = join(root, 'content')
  const c: Content = await loadAll({ root: content, lang: 'vi', publicBuild: true })
  const state = join(root, 'engine-state')
  const v = await readVerdicts(root)
  const fitState = await json<FitState>(join(state, '_fit.json'), {})
  const pages = new Map((await loadPages(content, ['vi'])).map(p => [`${p.kind}/${p.id}`, p]))
  const avoid = o.avoid ?? {}
  const demandOf = (kind: string, id: string) => {
    let n = 0
    for (const [path, x] of o.demand ?? []) if (path.endsWith(`/${id}/`) || pages.get(`${kind}/${id}`)?.path === path) n += x
    return n
  }
  const fitOf = async (kind: string, id: string): Promise<{ fit: boolean; fitWhy?: string }> => {
    const held = (await json<{ held?: { checks: string[] } }>(join(content, kind, id, 'vi.json'), {})).held
    if (held) return { fit: false, fitWhy: `held: ${held.checks.join(', ')}` }
    const p: Page | undefined = pages.get(`${kind}/${id}`)
    if (!p) return { fit: false, fitWhy: 'no page' }
    const checks = [...gateChecks(p, fitState[fitKey(p)])]
    return checks.length ? { fit: false, fitWhy: checks.join(', ') } : { fit: true }
  }
  const known = [...STAPLE_SPECIES, ...POPULAR.filter(id => !STAPLE_SPECIES.includes(id)), ...POPULAR_BREEDS]
  const out: Candidate[] = []
  const photosOf = (id: string, own: Photo[]) => [...own, ...(c.galleries[id] ?? [])]
  for (const s of c.species) {
    const ok = (p: Photo) => cardWorthy(p.url, s.id, v, avoid)
    const all = photosOf(s.id, s.photos)
    const t = resolveDataCard(s.dataCard.tempC ?? [], 'tempC')?.value
    const size = resolveDataCard(s.dataCard.sizeCm ?? [], 'sizeCm')?.value
    const diff = resolveDataCard(s.dataCard.difficulty ?? [], 'difficulty')?.value
    const tank = resolveDataCard(s.dataCard.tankCm ?? [], 'tankCm')?.value
    // The group size the page asks for, as read from its text for the tank-mates checker (traits.ts).
    const school = (await json<{ schoolMin?: number | null }>(join(content, 'traits', `${s.id}.json`), {})).schoolMin ?? undefined
    out.push({
      kind: 'species', id: s.id, ref: `species/${s.id}`, path: `/vi/ca/${s.t.slug}/`, name: s.t.name, ...photosFor(all, ok),
      ...(await fitOf('species', s.id)), indexable: s.t.quality.indexable, group: s.group, updatedAt: s.updatedAt,
      facts: {
        tempMin: typeof t === 'number' ? t : t?.min, sizeMax: typeof size === 'number' ? size : size?.max,
        difficulty: typeof diff === 'number' ? diff : diff?.max, tankCm: typeof tank === 'number' ? tank : tank?.min, schoolMin: school, places: s.places,
        native: s.range?.native?.countries,
        coldwater: COLDWATER_OF.includes(s.id), invert: s.group === 'snails' || s.group === 'shrimp',
      },
      known: known.includes(s.id) ? known.indexOf(s.id) : undefined, demand: demandOf('species', s.id),
    })
  }
  for (const b of c.breeds) {
    const ok = (p: Photo) => cardWorthy(p.url, b.id, v, avoid)
    const t = b.care.tempC?.[0]?.value
    out.push({
      kind: 'breeds', id: b.id, ref: `breeds/${b.id}`, path: `/vi/ca/${b.t.slug}/`, name: b.t.name, ...photosFor(photosOf(b.id, b.photos), ok),
      ...(await fitOf('breeds', b.id)), indexable: b.t.quality?.indexable ?? true, updatedAt: b.updatedAt,
      facts: { tempMin: typeof t === 'number' ? t : t?.min, places: [], coldwater: COLDWATER_OF.includes(b.basedOn ?? '') || /goldfish|koi/.test(b.id) },
      known: known.includes(b.id) ? known.indexOf(b.id) : undefined, demand: demandOf('breeds', b.id),
    })
  }
  for (const g of c.guides) {
    const ok = (p: Photo) => cardWorthy(p.url, g.id, v, avoid, true)
    out.push({
      kind: 'guides', id: g.id, ref: `guides/${g.id}`, path: `/vi/huong-dan/${g.t.slug}/`, name: g.t.name, ...photosFor(g.photos, ok),
      ...(await fitOf('guides', g.id)), indexable: g.t.quality?.indexable ?? true, updatedAt: g.updatedAt, facts: { places: [], coldwater: false }, demand: demandOf('guides', g.id),
    })
  }
  return out
}

/**
 * Why a pick can't be featured in a slot of this shape, or nothing when it can. `img` is the photo the calendar sets;
 * `photo: false` is a card drawn without one (a guide or a story whose photos are all too small), which needs none.
 */
export function problem(c: Candidate | undefined, slot: Slot, img?: string, o: { photo?: boolean } = {}): string | undefined {
  if (!c) return 'no such page'
  if (!c.fit) return `reader fit: ${c.fitWhy}`
  if (o.photo === false && !img) return undefined
  const px = img ? c.checked[img]?.[slot] : c.photo[slot]?.px
  if (px === undefined) return img ? `photo ${img} isn't one of the page's checked photos` : 'no checked photo'
  if (px < LARGE_PX) return `photo ${px} px across, under ${LARGE_PX}`
  return undefined
}

const score = (c: Candidate, w: CurationWeek | undefined, today: string) => {
  // A week's own list comes first, in its order.
  const list = c.kind === 'guides' ? w?.guides : w?.fish
  const inList = list?.includes(c.ref) ? 100 - list.indexOf(c.ref) : 0
  const tags = (w?.tags ?? []).filter(t => TAGS[t]?.(c.facts)).length
  const known = c.known === undefined ? 0 : 2 - c.known / 50
  const fresh = c.updatedAt && c.updatedAt >= addDays(today, -14) ? 0.5 : 0
  const photo = (c.photo.square?.px ?? 0) >= LARGE_PX ? 1 : 0
  return inList + tags * 2 + known + photo + Math.log1p(c.demand) + fresh + (c.indexable ? 0.5 : 0)
}

/** A week with tags takes only fish that match one, or that are on its own list (editors, 2026-11-08: a 30 cm catfish and
 * a 40 cm predator had filled small-tank days). */
const fitsWeek = (c: Candidate, w: CurationWeek | undefined) => !w?.tags.length || w.fish.includes(c.ref) || w.tags.some(t => TAGS[t]?.(c.facts))

export type PlanReport = { kept: string[]; filled: string[]; replaced: { date: string; slot: string; was: string; why: string }[]; empty: string[] }

/**
 * Fill `days` days from `from`: a day a person chose keeps its picks while they pass; any other pick that no longer
 * passes, and any slot left empty, gets the best-scoring page that passes and wasn't on Hôm nay in the last four weeks.
 */
export function plan(cur: Curation, cands: Candidate[], from: string, days: number): { calendar: Curation; report: PlanReport } {
  const byRef = new Map(cands.map(c => [c.ref, c]))
  const report: PlanReport = { kept: [], filled: [], replaced: [], empty: [] }
  const out = new Map(cur.days.map(d => [d.date, { ...d }]))
  // On Hôm nay in the four weeks either side, or as the day's own story.
  const used = (ref: string, date: string) => out.get(date)?.story?.page === ref || [...out.values()].some(d => d.date !== date && Math.abs(Date.parse(d.date) - Date.parse(date)) < REPEAT_DAYS * 86400_000 && (d.fish === ref || d.guide === ref || d.story?.page === ref))
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    // A day outside every week takes the nearest week's theme: the last one before it, else the next.
    const w = cur.weeks.find(x => x.from <= date && date <= x.to) ?? cur.weeks.filter(x => x.to < date).at(-1) ?? cur.weeks.find(x => x.from > date)
    const d: CurationDay = out.get(date) ?? { date }
    const why: string[] = []
    for (const slot of ['fish', 'guide'] as const) {
      const ref = d[slot]
      const c = ref ? byRef.get(ref) : undefined
      const p = ref
        ? (problem(c, 'square', slot === 'fish' ? d.img : d.guideImg, { photo: slot === 'fish' }) ??
          (slot === 'fish' && !d.fixed && c && !fitsWeek(c, w) ? `doesn't match this week's tags (${w!.tags.join(', ')})` : undefined))
        : 'empty'
      if (ref && !p) { report.kept.push(`${date} ${slot}`); continue }
      if (ref) report.replaced.push({ date, slot, was: ref, why: p! })
      const kind = slot === 'fish' ? ['species', 'breeds'] : ['guides']
      const pool = (slot === 'fish' ? w?.fish : w?.guides) ?? []
      const yesterday = out.get(addDays(date, -1))
      const best = cands
        .filter(x => kind.includes(x.kind) && !problem(x, 'square', undefined, { photo: slot === 'fish' }) && !used(x.ref, date))
        .filter(x => slot !== 'fish' || fitsWeek(x, w))
        // Not the same group two days running.
        .filter(x => slot !== 'fish' || !x.group || x.group !== byRef.get(yesterday?.fish ?? '')?.group)
        .map(x => ({ x, s: score(x, w, from) }))
        .sort((a, b) => b.s - a.s || a.x.ref.localeCompare(b.x.ref))[0]?.x
      if (!best) { delete d[slot]; report.empty.push(`${date} ${slot}`); continue }
      d[slot] = best.ref
      // The card shows the best checked photo, and a guide's only when it is big enough for the card.
      const ph = best.photo.square
      const key = slot === 'fish' ? 'img' : 'guideImg'
      if (ph && ph.px >= LARGE_PX) d[key] = ph.url
      else delete d[key]
      delete d.fixed
      report.filled.push(`${date} ${slot}: ${best.ref}`)
      const reasons = [
        ...(pool.includes(best.ref) ? ["on this week's list"] : []),
        ...(w?.tags ?? []).filter(t => TAGS[t]?.(best.facts)).map(t => TAG_WORDS[t] ?? t),
        ...(best.known !== undefined ? ['well known'] : []),
        ...(best.demand ? [`${best.demand} search impression${best.demand === 1 ? '' : 's'}`] : []),
      ]
      why.push(`${slot === 'fish' ? 'Fish' : 'Guide'}: ${best.name}, ${reasons.join(', ') || 'the best left with a big enough photo'}`)
    }
    // One plain sentence for the owner's daily report.
    if (why.length) d.why = `${why.join('. ')}.`.slice(0, 300)
    out.set(date, d)
  }
  const sorted = [...out.values()].sort((a, b) => a.date.localeCompare(b.date))
  return { calendar: { ...cur, days: sorted, off: offPages({ ...cur, days: sorted }, byRef, from) }, report }
}

/** The pages the weeks' top cards and shelves and the days' stories name, from `from` on, that don't pass reader fit. */
function offPages(cur: Curation, byRef: Map<string, Candidate>, from: string): Record<string, string> {
  const refs = [
    ...cur.weeks.filter(w => w.to >= from).flatMap(w => [...w.hero.map(h => h.page), ...w.shelves.flatMap(s => s.pages)]),
    ...cur.days.filter(d => d.date >= from).flatMap(d => (d.story ? [d.story.page] : [])),
  ]
  const off: Record<string, string> = {}
  for (const ref of [...new Set(refs)].sort()) {
    const c = byRef.get(ref)
    if (!c) off[ref] = 'no such page'
    else if (!c.fit) off[ref] = `reader fit: ${c.fitWhy}`
  }
  return off
}

/** The app's short cards (content/cards) by how the calendar names them: the days each may show, and the served languages
 * it's written in that the gate doesn't hold back; or why its files don't parse, so one broken card is a problem the
 * check lists rather than a planner run that stops (Site Lead, 2026-11-08). */
export type CardShow = { show: CardEntity['show']; langs: string[] } | { bad: string }
export async function cardsOf(root: string): Promise<Map<string, CardShow>> {
  const dir = join(root, 'content', 'cards')
  const out = new Map<string, CardShow>()
  for (const id of await readdir(dir).catch(() => [] as string[])) {
    try {
      const e = await json<unknown>(join(dir, id, 'entity.json'), null)
      if (!e) continue
      const parsed = CardSchema.safeParse(e)
      if (!parsed.success) {
        out.set(`cards/${id}`, { bad: parsed.error.issues.map(i => `${i.path.join('.') || 'entity'}: ${i.message}`).join('; ') })
        continue
      }
      const langs: string[] = []
      for (const lang of LANGS) {
        const t = await json<{ held?: unknown } | null>(join(dir, id, `${lang}.json`), null)
        if (t && !t.held && cardShownIn(parsed.data, lang)) langs.push(lang)
      }
      out.set(`cards/${id}`, { show: parsed.data.show, langs })
    } catch (err) {
      out.set(`cards/${id}`, { bad: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
}

/**
 * Everything wrong with the calendar from `from` on: each pick that can't be featured, each day of `days` with no pick,
 * and each card that isn't there to show that day. A page in `off` isn't one: the build leaves it out.
 */
export function checkCalendar(cur: Curation, cands: Candidate[], from: string, days: number, cards: Map<string, CardShow> = new Map()): string[] {
  const byRef = new Map(cands.map(c => [c.ref, c]))
  const out: string[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    const d = cur.days.find(x => x.date === date)
    if (!d?.fish) out.push(`${date}: no fish`)
    if (!d?.guide) out.push(`${date}: no guide`)
  }
  for (const d of cur.days.filter(x => x.date >= from)) {
    const fish = d.fish && (d.img ? problem(byRef.get(d.fish), 'square', d.img) : 'no photo set for the card')
    if (fish) out.push(`${d.date} fish ${d.fish}: ${fish}`)
    const guide = d.guide && problem(byRef.get(d.guide), 'square', d.guideImg, { photo: false })
    if (guide) out.push(`${d.date} guide ${d.guide}: ${guide}`)
    if (d.story && !cur.off[d.story.page]) {
      const st = problem(byRef.get(d.story.page), 'square', d.story.img, { photo: false })
      if (st) out.push(`${d.date} story ${d.story.page}: ${st}`)
    }
    if (d.card) {
      const c = cards.get(d.card)
      const p = !c ? 'no such card' : 'bad' in c ? `its files don't parse: ${c.bad}` : !c.langs.length ? 'held back or unwritten in every language'
        : d.date < c.show.from || d.date > c.show.until ? `outside its days, ${c.show.from} to ${c.show.until}` : undefined
      if (p) out.push(`${d.date} card ${d.card}: ${p}`)
    }
  }
  for (const w of cur.weeks.filter(x => x.to >= from)) {
    for (const h of w.hero.filter(h => !cur.off[h.page])) {
      const p = problem(byRef.get(h.page), 'wide', h.img)
      if (p) out.push(`week ${w.from} hero ${h.page}: ${p}`)
    }
    for (const s of w.shelves) for (const ref of s.pages.filter(r => !cur.off[r])) {
      const c = byRef.get(ref)
      if (!c) out.push(`week ${w.from} shelf ${s.id} ${ref}: no such page`)
      else if (!c.fit) out.push(`week ${w.from} shelf ${s.id} ${ref}: reader fit: ${c.fitWhy}`)
    }
  }
  return out
}
