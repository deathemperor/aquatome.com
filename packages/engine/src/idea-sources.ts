import type { SourceId } from '@aq/schema'

/**
 * The sites read for ideas (ideas.ts): their posts' titles, never their text. Data only, so research's list of the hosts it
 * never reads (cycle-only.ts) can name theirs without reading the ideas step.
 */
export type Listing = { kind: 'sitemap'; url: string; prefix: string | string[] } | { kind: 'wordpress'; base: string; category: string }
/**
 * A rule that leaves a post out by its address's last part, the words between its last two slashes ("a-visit-to-x"): its
 * name, as the run prints how many each rule left out, and the words, hyphen-separated as an address has them.
 */
export type Drop = readonly [name: string, words: RegExp]
export type IdeaSource = { id: SourceId; name: string; list: Listing; magazine?: true; drop?: readonly Drop[] }

/**
 * The magazine's posts about someone, not a topic, or not a topic at all (the chief of staff, 14 Nov 2026): its sections are
 * chosen by address, so a keeper's fish room under features/ would pass. Clear cases only. Read against its sitemap of
 * 14 Nov (1,396 posts under the three sections): there "meet the" opens a feature on a fish group, "contest" an
 * aquascaping guide and "win" a how-to on algae, so none of them is a rule; a how-to on setting up a fish room is a topic.
 */
const MAGAZINE_DROP: readonly Drop[] = [
  ['a visit', /(^|-)visit(s|ing|ed)?(-|$)/],
  ['a fish room', /^(?!how-to-).*(^|-)(fish-?rooms?|fish-?house)(-|$)/],
  ["a reader's tank", /(^|-)(readers?(-s)?-tanks?|tanks?-of-the-(month|year))(-|$)/],
  ['an interview', /(^|-)(interview(s|ed)?|in-conversation|a-day-in-the-life|shares-(his|her|their))(-|$)/],
  ['a profile', /^profiles?-|(^|-)(species|fish|keeper|breeder)-profiles?(-|$)/],
  ['an obituary', /(^|-)(obituar(y|ies)|tribute|in-memoriam)(-|$)/],
  ['a review', /(^|-)(reviews?|reviewed|on-test)(-|$)/],
  ['a competition', /(^|-)(competitions?|giveaways?|prizes?|win-an?|readers-poll|winners?)(-|$)/],
  ['news', /(^|-)news(-|$)/],
  ['a shop tour', /(^|-)((shop|store)-tours?|shop-of-the-(month|year)|retailers?)(-|$)/],
]

export const IDEA_SOURCES: IdeaSource[] = [
  { id: 'aquazonefish', name: 'AquaZone', list: { kind: 'sitemap', url: 'https://aquazonefish.vn/sitemap_blogs_1.xml', prefix: 'https://aquazonefish.vn/blogs/kien-thuc/' } },
  { id: 'aquahouse', name: 'Aqua House', list: { kind: 'wordpress', base: 'https://aquahouse.vn', category: 'tin-tuc-aqua' } },
  { id: 'cacanhtailoc', name: 'Cá Cảnh Tài Lộc', list: { kind: 'sitemap', url: 'https://cacanhtailoc.com/sitemap_blogs_1.xml', prefix: 'https://cacanhtailoc.com/blogs/tin-tuc/' } },
  {
    id: 'practicalfishkeeping', name: 'Practical Fishkeeping', magazine: true, drop: MAGAZINE_DROP,
    list: { kind: 'sitemap', url: 'https://www.practicalfishkeeping.co.uk/sitemap-1.xml', prefix: ['features/', 'fishkeeping-answers/', 'beginners-hub/'].map(s => `https://www.practicalfishkeeping.co.uk/${s}`) },
  },
]

/** The host an idea source's posts stand on, bare ("www." off). */
export const ideaHost = (s: IdeaSource) => new URL(s.list.kind === 'sitemap' ? s.list.url : s.list.base).hostname.toLowerCase().replace(/^www\./, '')

/**
 * The magazine's hosts, which research never opens (the chief of staff, 14 Nov 2026): research's call returns only its
 * answer, so nothing records what it opened. Its titles are ideas, and its guides are researched from other sources.
 * Opening its posts is a later change, once what research opens is recorded and the owner has answered.
 */
export const NEVER_RESEARCHED: readonly string[] = IDEA_SOURCES.filter(s => s.magazine).flatMap(s => [ideaHost(s), `*.${ideaHost(s)}`])
