# Words hobbyists rarely write

The engine's writers lean on some words and turns far more than people do. This is how the lists in
`packages/engine/src/phrases.ts` were found, and the counts behind each entry. The editors
(`.claude/skills/editors/SKILL.md`) check every wording finding the same way before it changes a prompt.

## Method

1. **The site's text**, per language: every page's prose (references left out), from `content/*/*/<lang>.json`.
2. **A reference of real hobbyist writing** in the same language, kept on the owner's machine and never committed
   (`~/.cache/aquatome/corpus/<lang>/`, its licence is its authors'): forum threads first, hobbyists' blogs, the
   transcripts of hobbyists' own videos, and the language's Wikipedia as a general baseline. Fetched plainly: a site
   that answers with a challenge page or wants a login is skipped. Shop and SEO blogs are tagged apart: they are often
   machine-written themselves.
3. **Rates per million words** (per million characters for Thai and Chinese, written without spaces), for every
   phrase of one to five words: on the site, and in each reference. A phrase is a candidate when the site uses it at
   least ten times as often as the forum and the videos alike, on many pages (a few, marked, less: the
   bar is a guide, the reading below decides).
4. **A person reads the candidates.** Most are the subject, not the style: species pages talk about river basins and
   type localities, and a forum about one person's fish doesn't. What stays is register: hedges, connectives, calques
   of English, and words where hobbyists have their own. Each gets the words hobbyists use for the same thing, checked
   in the same references (`node .claude/skills/editors/phrase-check.mjs "<phrase>"`).
5. **One word for one word, right in every sentence**, goes in the sweep (`sanitize.ts` WORDING), which fixes every
   page each cycle. Anything that needs its sentence rewritten goes in the list: the writers' prompts carry it, the
   `phrasing` content rule counts it (docs/review/content-rules.md), and the style rewrite takes the pages up a batch
   at a time (`pnpm engine rewrite-vi --phrases`).

## Vietnamese, 2026-11-07

References: a Vietnamese fish-keeping forum (1.5M words, posts from 2007 to 2020, before AI writing tools), the transcripts of 176 Vietnamese planted-tank
videos (0.27M words), and the shop blogs (0.13M words) and Vietnamese Wikipedia (0.3M words) kept apart. The site: 3.3M words on 2,824 pages.

Per million words, site | forum | videos:

| On the site | site | forum | videos | Hobbyists write |
|---|---|---|---|---|
| nhiều khả năng | 473 | 5 | 0 | chắc là (149, 122), có lẽ (202, 181) |
| dù vậy, tuy vậy | 568, 560 | 5, 3 | 0, 26 | nhưng, tuy nhiên (236, 650) |
| phần lớn | 1,100 | 25 | 15 | thường, chủ yếu (146, 96), or nothing; hầu hết (91, 111) and đa số (88, 33) once, not everywhere |
| nhìn chung | 167 | 14 | 15 | thường, or nothing; nói chung (161, 137) once |
| nhờ vậy, nhờ đó | 169 | 12 | 0 | thế là (144, 336), or the next sentence alone |
| lý do là | 153 | 6 | 19 | là do (235, 159), vì |
| thủ phạm | 70 | 6 | 0 | nguyên nhân (203, 159) |
| lý tưởng | 230 | 34 | 15 | hợp nhất, tốt nhất, or the figure itself |
| khuyến nghị | 43 | 0 | 0 | nên, khuyên |
| bắt buộc phải | 103 | 7 | 37 | phải |
| tốt nhất bạn nên | 41 | 3 | 0 | nên, tốt nhất là |
| bạn nên, bạn cần | 848, 366 | 187, 51 | 240, 137 | nên, cần, or the step itself |
| hung hăng | 189 | 9 | 0 | dữ (244 in the forum) |
| bạn cùng bể | 222 | 0 | 0 | nuôi chung với… |
| giới chơi | 220 | 4 | 0 | người chơi (128, 144), or nothing |
| thị trường cá cảnh | 126 | 2 | 0 | tiệm cá (84 in the forum), trên thị trường |
| thức ăn sống, mồi sống | 427 | 9 | 0 | thức ăn tươi sống, đồ tươi |
| giữ lãnh thổ | 124 | 0 | 0 | hay đuổi cá khác khỏi chỗ của nó |
| chỗ trú | 107 | 0 | 0 | chỗ trốn (3, 22) |
| keo siêu dính | 5 | 0 | 0 | keo 502 (30 in the videos) |
| một cách + adjective | 9 pages | | | the adjective alone; vi-style.md already bans it |
| rất nên | 41 | 0 | 0 | nên, tốt nhất là |
| loricariid | 48 | 0 | 0 | tỳ bà (30 in the forum), lau kiếng (26), pleco (11 in the videos) |
| muối bể cá | 4 | 0 | 0 | muối hột (63 in the forum) |
| dân chơi | 170 | 24 | 7 | usually nothing ("gọi là…"); người chơi when it matters who. The list used to offer it for "giới chơi" |
| được chuộng | 20 | 0 | 0 | nhiều người nuôi, dễ kiếm, or why |
| cây thân đứng | 20 | 0 | 0 | cây cắt cắm (59 in the videos) |
| lọc sponge | 10 | 0 | 0 | lọc bio (22 in the videos) |
| sản xuất hàng loạt | 3 | 0 | 0 | nuôi đại trà, nuôi hàng loạt |

In the sweep instead: **và/hoặc** → hoặc (102 pages; never in either reference).

**Tics.** The editors' third round found the rewrite swapping a listed word for its neighbour everywhere: "phần lớn"
became "hầu hết", then "đa số", five times on one page, and "nên" piled up ("Thế nên nên mua"). Each of these words is
fine once. So the hints point at recasting ("thường", "chủ yếu", or nothing) rather than a twin, and the style
rewrite's second pass also takes up a part that uses one kind three times or more (phần lớn / hầu hết / đa số; dù vậy /
tuy vậy / tuy nhiên; nhìn chung / nói chung; vì vậy / thế nên / nhờ vậy / do đó / thế là), or two "nên" a word apart
(`TICS` in phrases.ts). Before the rewrite, 1,165 of the site's 3,269 Vietnamese parts had one.

The style guide itself taught three of them: it told the writers to write "likely" as "nhiều khả năng", to name a
cause with "thủ phạm thường là", and gave "Nhờ vậy…" as its model of natural Vietnamese (vi-style.md, vi-rewrite.md,
changed with this list).

In the style guide instead: algae in a tank is **"rêu"** (rêu hại, rêu tóc, cá ăn rêu). The site writes "tảo" 735 times a
million words, the forum 129 and the videos 155, while the videos say "rêu" 1,734. "Tảo" stays for diatoms, blue-green
algae, spirulina and algae in the wild, so no list entry can tell the two apart.

Names and units the translator's prompt (process.md) now gives, from the editors' third and fourth rounds, each
checked here: the Siamese algae eater is "cá bút chì" (15 in the forum, 41 in the videos; the site had "cá bống đá
Xiêm", "cá rạn Xiêm"); hillstream loaches "cá tỳ bà bướm" (12.5 in the forum, against 0.7 for "cá bám đá"); plecos
"cá lau kiếng" or "cá tỳ bà"; betta "cá xiêm" or "cá chọi" (99 and 119 in the forum); crayfish "tôm hùm đất", since
"tôm càng" is Macrobrachium. A tank of 5 gallons or more rounds to the nearest 5 litres: the site wrote "38 lít" 218
times and "19 lít" 85, which no reference writes, where hobbyists say 40 and 20.

Left out on purpose:
- Topic words the references don't cover (lưu vực, mẫu chuẩn, quần thể, thông số nước): a species profile needs them.
- Words the site overuses only two or three times over (vì vậy, khá, ngoài ra, cân nhắc): the style guide's "one idea
  per sentence" covers them better than a ban.
- Regional words: forum writers in the south say "hồ" where the site says "bể"; both are right.
- Words one model flagged but neither reference settles (gai sinh dục for gonopodium, nước chua, đánh muối): they wait
  for a second member or a larger reference.
