import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { breedLeads, parseThread, parseThreadList, provenanceClues, readForum, topicLeads, type ForumState } from '../src/forum'
import { makeBreed } from '../src/breeds'
import { makeTopic } from '../src/topics'

// Pages shaped like the forum's (XenForo 1): placeholder words, never the forum's own text.
const B = 'https://www.diendancacanh.com/'
const SECTION = `${B}forums/bai-viet-tuyen-chon-ca-dia.135/`
const item = (id: number, title: string, author: string, cls = '') =>
  `<li id="thread-${id}" class="discussionListItem visible ${cls}" data-author="${author}"><h3 class="title"><a href="threads/${title.toLowerCase().replace(/\s+/g, '-')}.${id}/" class="PreviewTooltip">${title}</a></h3></li>`
const list = (items: string[], last = 2) => `<html><head><base href="${B}" /></head><body><div class="PageNav" data-page="1" data-last="${last}"></div><ol class="discussionListItems">${items.join('')}</ol></body></html>`
const post = (id: number, author: string, body: string) => `<li id="post-${id}" class="message" data-author="${author}"><div class="messageContent"><article><blockquote class="messageText SelectQuoteContainer ugc baseHtml">${body}</blockquote></article></div><div class="messageMeta"><span class="DateTime" title="5/3/16 lúc 06:43">5/3/16</span></div></li>`
const thread = (title: string, posts: string[]) => `<html><head><base href="${B}" /><title>${title} | Diễn Đàn Cá Cảnh</title></head><body><div class="titleBar"><h1>${title}</h1></div><ol class="messageList">${posts.join('')}</ol></body></html>`

test('a section page: its threads (relative links against <base>), sticky marked, moved ones left out, and its page count', () => {
  const r = parseThreadList(list([item(1, 'Alpha one', 'admin', 'sticky'), item(2, 'Beta two', 'member'), item(3, 'Gone', 'x', 'moved')], 3), SECTION)
  expect(r.last).toBe(3)
  expect(r.threads).toEqual([
    { url: `${B}threads/alpha-one.1/`, title: 'Alpha one', author: 'admin', sticky: true },
    { url: `${B}threads/beta-two.2/`, title: 'Beta two', author: 'member', sticky: false },
  ])
})

test("a thread: the author's opening posts, up to the first post by someone else", () => {
  const t = parseThread(thread('Gamma', [post(10, 'admin', '<p>one</p>'), post(11, 'admin', '<p>two</p>'), post(12, 'reader', '<p>thanks</p>'), post(13, 'admin', '<p>later</p>')]))
  expect(t).toMatchObject({ title: 'Gamma', author: 'admin', date: '5/3/16 lúc 06:43' })
  expect(t.posts.map(p => p.id)).toEqual(['10', '11'])
})

test('clues: credit lines, outside links (not the forum, not images), pictures without ads or avatars', () => {
  const html = `Lorem ipsum dolor.<br />Nguồn: Example Magazine 1998<br /><a href="https://example.org/original-article">x</a> <a href="threads/other.5/">y</a> <a href="http://www.diendancacanh.com/threads/z.6/">z</a> <a href="https://example.org/p.jpg">p</a>
    <img src="http://www.diendancacanh.com/pictures/discusclass/a.jpg" class="bbCodeImage" data-url="http://www.diendancacanh.com/pictures/discusclass/a.jpg" />
    <img src="https://www.diendancacanh.com/pictures/advertisement/logo.png" class="bbCodeImage" /><img src="http://i1.example.com/b.jpg" class="bbCodeImage" />`
  const c = provenanceClues([{ html }], `${B}threads/gamma.9/`)
  expect(c.credits).toEqual(['Nguồn: Example Magazine 1998'])
  expect(c.links).toEqual(['https://example.org/original-article'])
  expect(c.images).toEqual([`${B}pictures/discusclass/a.jpg`, 'http://i1.example.com/b.jpg'])
})

async function forumSite() {
  const pages: Record<string, string> = {
    [SECTION]: list([item(1, 'Own spawning', 'admin'), item(2, 'Translated care', 'member')], 2),
    [`${SECTION}page-2`]: list([item(3, 'Third', 'member')], 2),
    [`${B}threads/own-spawning.1/`]: thread('Own spawning', [post(1, 'admin', 'SECRET-BODY-ONE my tanks <img class="bbCodeImage" src="http://www.diendancacanh.com/pictures/x/own.jpg" /><img class="bbCodeImage" src="http://i1.example.com/elsewhere.jpg" />')]),
    [`${B}threads/translated-care.2/`]: thread('Translated care', [post(2, 'member', 'SECRET-BODY-TWO Dịch từ: Some Magazine <a href="https://example.org/orig">orig</a><img class="bbCodeImage" src="http://www.diendancacanh.com/pictures/y/t.jpg" />')]),
    [`${B}threads/third.3/`]: thread('Third', [post(3, 'member', 'SECRET-BODY-THREE')]),
  }
  const fetched: string[] = []
  const sleeps: number[] = []
  const get = async (u: string) => { fetched.push(u); if (!(u in pages)) throw new Error('HTTP 404'); return pages[u]! }
  const llm: Llm = async ({ prompt }) => (prompt.includes('SECRET-BODY-TWO')
    ? { provenance: 'translated', evidence: 'credit line names a magazine', original: { title: 'Care', author: 'A. Writer', url: 'https://example.org/orig' }, topic: 'discus care', terms: [{ vi: 'lam phấn', en: 'Blue Diamond' }], taxa: ['Symphysodon aequifasciatus'], breeds: ['Blue Diamond discus'] }
    : prompt.includes('SECRET-BODY-ONE')
      ? { provenance: 'original', evidence: 'author describes his own tanks', original: { url: 'https://made-up.example/x' }, topic: 'discus spawning', terms: [], taxa: [], breeds: [] }
      : { provenance: 'unclear', evidence: '', topic: 'x', terms: [], taxa: [], breeds: [] }) as never
  const root = await mkdtemp(join(tmpdir(), 'aq-forum-'))
  return { root, fetched, sleeps, d: { get, llm, sleep: async (ms: number) => { sleeps.push(ms) }, now: () => new Date('2026-11-01T00:00:00Z') } }
}

test('readForum: walks the section 5 s apart, notes each thread without keeping its text; own pictures only in original posts', async () => {
  const { root, fetched, sleeps, d } = await forumSite()
  const r = await readForum(root, d, { limit: 2, sections: [SECTION] })
  expect(r).toMatchObject({ listed: 2, found: 3, failed: [], stopped: '' })
  expect(fetched).toEqual([SECTION, `${SECTION}page-2`, `${B}threads/own-spawning.1/`, `${B}threads/translated-care.2/`])
  expect(sleeps).toEqual([5000, 5000, 5000]) // every request after the first waits 5 s
  const raw = await readFile(join(root, 'engine-state/forum/diendancacanh.json'), 'utf8')
  expect(raw).not.toMatch(/SECRET-BODY|my tanks|Dịch từ/) // notes, never the posts' words
  const s = JSON.parse(raw) as ForumState
  expect(s.threads[`${B}threads/own-spawning.1/`]).toMatchObject({ provenance: 'original', author: 'admin', posts: 1, images: [{ src: `${B}pictures/x/own.jpg`, own: true }, { src: 'http://i1.example.com/elsewhere.jpg', own: false }] })
  expect(s.threads[`${B}threads/own-spawning.1/`]!.original).toBeUndefined() // an original has none, and a URL the post never gave is dropped
  expect(s.threads[`${B}threads/translated-care.2/`]).toMatchObject({ provenance: 'translated', original: { title: 'Care', author: 'A. Writer', url: 'https://example.org/orig' }, images: [{ src: `${B}pictures/y/t.jpg`, own: false }] })
  expect(s.queue.map(q => q.url)).toEqual([`${B}threads/third.3/`])
  expect(s.sections[SECTION]).toMatchObject({ last: 2, next: 3, readAt: '2026-11-01' })

  // The next run: the section was walked this month, so only the queue is read.
  fetched.length = 0
  await readForum(root, d, { limit: 5, sections: [SECTION] })
  expect(fetched).toEqual([`${B}threads/third.3/`])
})

test('readForum: a usage limit stops the run and keeps the thread queued', async () => {
  const { root, d } = await forumSite()
  const r = await readForum(root, { ...d, llm: async () => { throw new LlmError('usage limit') } }, { limit: 5, sections: [SECTION] })
  expect(r.stopped).toBe('usage limit')
  const s = JSON.parse(await readFile(join(root, 'engine-state/forum/diendancacanh.json'), 'utf8')) as ForumState
  expect(Object.keys(s.threads)).toEqual([])
  expect(s.queue).toHaveLength(3)
})

const notes: ForumState = {
  sections: {}, queue: [],
  threads: {
    [`${B}threads/a.1/`]: { title: 'Phân loại cá dĩa', author: 'admin', posts: 1, provenance: 'translated', evidence: 'from a book', original: { title: 'Discus book', author: 'B. Author' }, topic: 'discus classification', terms: [{ vi: 'lam phấn', en: 'Blue Diamond' }, { vi: 'bồ câu', en: 'Pigeon Blood' }], taxa: [], breeds: ['Blue Diamond discus'], images: [], readAt: '2026-11-01' },
    [`${B}threads/b.2/`]: { title: 'Kinh nghiệm ép cá dĩa đẻ', author: 'keeper', posts: 2, provenance: 'original', evidence: 'own tanks', topic: 'discus breeding', terms: [], taxa: [], breeds: [], images: [], readAt: '2026-11-01' },
  },
}

test('leads: a breed gets the names keepers use; a topic gets threads, a translation pointing to its original', () => {
  expect(breedLeads(notes, ['Blue Diamond discus'])).toContain(`${B}threads/a.1/ (Phân loại cá dĩa): "lam phấn" = Blue Diamond`)
  expect(breedLeads(notes, ['Flowerhorn'])).toBe('')
  const t = topicLeads(notes, 'Phân loại cá dĩa thuần dưỡng theo lớp')
  expect(t).toContain(`${B}threads/a.1/ is a translation of "Discus book" by B. Author: find the original and cite it for the facts, not the forum (cite the thread only for the Vietnamese names it gives).`)
  expect(t).not.toContain('threads/b.2/')
  expect(topicLeads(notes, 'Ép cá dĩa đẻ')).toContain("keeper's own experience")
})

test('topic leads match words with their accents: a thread on fungus (nấm) is no lead for a topic about Việt Nam', () => {
  const fungus: ForumState = { ...notes, threads: { [`${B}threads/c.3/`]: { title: 'Bệnh viện dành cho cá đĩa', author: 'k', posts: 1, provenance: 'original', evidence: '', topic: 'chữa nấm', terms: [{ vi: 'nấm', en: 'fungus' }], taxa: [], breeds: [], images: [], readAt: '2026-11-01' } } }
  expect(topicLeads(fungus, 'Phân loại cá dĩa và tên gọi Việt Nam')).toBe('')
  expect(topicLeads(fungus, 'Chữa nấm cho cá dĩa')).toContain('threads/c.3/')
})

test('breed and guide research get the forum leads; research kept from before is not asked again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-forum-leads-'))
  await mkdir(join(root, 'engine-state/forum'), { recursive: true })
  await writeFile(join(root, 'engine-state/forum/diendancacanh.json'), JSON.stringify(notes))
  const asked: string[] = []
  const research: Llm = async ({ prompt }) => { asked.push(prompt); return { found: false } as never }
  await makeTopic(root, { research, llm: research }, { topic: 'Phân loại cá dĩa thuần dưỡng', kind: 'discovery' })
  await makeBreed(root, { research, llm: research, gallery: {} as never }, { name: 'Blue Diamond discus' })
  expect(asked[0]).toContain('find the original and cite it for the facts, not the forum')
  expect(asked[1]).toContain('"lam phấn" = Blue Diamond')
})
