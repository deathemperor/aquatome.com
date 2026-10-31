⚠️ DEGRADED: single-context (delegated child; the harness forbids nested sub-agents unless the brief asks for them)

# Site-wide design critique, 2026-10-31

Review of the live site (https://aquatome.com) for UX and design quality. Nothing was changed; this is the fix list.

**How it was done.** Playwright against the live pages on 2026-10-31, as a Pixel 7 phone (412×839 viewport) and a 1280×800
computer, in light and dark. For each surface: the first screen plus 3 to 6 scrolled screens, and measurements of tap
targets, broken images, console errors and failed requests. State checks: search with a real word, a nonsense word and
nothing; the fish list with filters; the tank-mates tool with an incompatible trio, a nonsense name and a partial name;
the gallery lightbox; a 404. A sample of 47 species pages (11 linked from the home page, 36 random) was fetched to see
how common the species-page problems are. The `impeccable` detector ran on `apps/site/src` after the findings below were
written down, so it could not steer them. Screenshots are in `/tmp/aqcrit/shots/` on the reviewing machine (not in the
repo); the evidence index at the end lists the ones each finding comes from.

PRODUCT.md is not in this checkout, so the rubric is the brief's version of it: beginners and experienced keepers served
equally, phone first, answer first, a simple path plus full control, show don't make them imagine, nothing
half-finished, cite quietly. The Chihiros light controller is out of scope (being rebuilt).

**Scoring.** Impact (I) is 1 to 5: how many readers hit it and how badly it misleads or blocks them. Effort (E) is 1 to
5: 1 is CSS or copy, under a day; 2 is one component or one script; 3 is a new feature block or a content-pipeline
change; 5 is weeks. Priority (P) = I × (6 − E). Ties are ordered by impact, then by how many pages share the problem.

## Top 20

| # | Surface | Problem (where seen) | Fix | I | E | P |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | All pages | The phone header is 199 px of an 839 px viewport (24%): logo, two-line tagline, "Tìm", units pill, theme, language on its own row, then 7 links on two rows. Units (69×26) and language (59×26) are under 44 px. | One 56 px row: logo, search icon, menu button. Units, theme, language and the section links go in the menu sheet. | 5 | 2 | 20 |
| 2 | Home form → `/vi/ca/` | "Xem loài hợp bể" (60 cm, 26 °C, pH 7) returns 327 "loài phù hợp", and 244 of them have no temperature, pH or tank data. The filter counts missing data as a match. | List species whose data matches first. Put the rest in a collapsed group, "Chưa đủ dữ liệu để chắc (244)". Show both counts in the result line. | 5 | 2 | 20 |
| 3 | Tank-mates tool | A name with no match clears the box and nothing happens. "neon" adds Cá bống neon (neon goby), not a neon tetra, because the first substring hit wins. | A suggestion list under the input (photo, Vietnamese and Latin name, top 6). A no-match message: "Không thấy 'xyzq'. Thử tên khoa học." Never auto-pick on a partial match. | 5 | 2 | 20 |
| 4 | Tank-mates tool | The answer is the footer row of a 6-column table that scrolls sideways on the phone ("Độ cứng (" is cut off). Nothing says yes or no in a sentence. | Lead with one verdict line ("Không nên nuôi chung: Cá bắn cung ăn Cá neon vua; pH không có khoảng chung"), then the warnings, then the table. | 5 | 2 | 20 |
| 5 | Species page, phone | The first screen is the header, a breadcrumb and the photo. The name starts at 615 px and the data card at 759 px of 839 px visible. No answer before scrolling. | Above the photo on phones: name, Latin name, and a 4-fact strip (nhiệt độ, pH, bể tối thiểu, độ khó). A 16:9 photo under it. With #1 the card fits on the first screen. | 5 | 2 | 20 |
| 6 | Search | Excerpts show index junk: "ca neon xanh ca neon ca neon tetra neon tetra neon fish ca neon thuong…" and the gallery's lightbox buttons as "→ ‹›×". | Mark alias lists, redirect notes and lightbox controls `data-pagefind-ignore`. Use the page description as the excerpt. | 4 | 1 | 20 |
| 7 | Search | Gallery pages take 4 of the first 5 results for "neon" ("Ảnh Cá neon vua", "Ảnh Cá neon đen"…). The Cá neon vua species page is not in the first 5. | `data-pagefind-ignore="all"` on gallery pages, or weight species pages higher. | 4 | 1 | 20 |
| 8 | Tools `/vi/cong-cu/` | The tools page stacks 6 calculators in one 3,663 px column. The phone's first screen shows only the intro and half of the first tool. There is no list of what tools exist. | Open with 6 tool cards (icon, name, one-line purpose). Give tank-mates its own URL like the volume tool. | 4 | 2 | 16 |
| 9 | Species page | 23,590 px on the phone (about 28 screens) and 20 sections, with no way to jump. Guides have a table of contents; species pages do not. | A sticky chip row under the data card: Bể · Nước · Thức ăn · Nuôi chung · Sinh sản · Ảnh. | 4 | 2 | 16 |
| 10 | Guide list | 158 guides in one 54,615 px column on the phone (about 65 screens). No category filter, sort or search. | Category chips (the labels already exist: Chăm sóc, Sinh sản, Bố cục, Chăm cây, Bệnh, Setup bể), a "Bắt đầu từ đây" row for beginners, and compact two-column rows on phones. | 4 | 2 | 16 |
| 11 | Plant list | 165 plants and no filters, though the intro promises "nhu cầu ánh sáng, CO2 và vị trí trồng". | The fish-list filter bar with Ánh sáng, CO₂, Vị trí, Độ khó. | 4 | 2 | 16 |
| 12 | Home and featured lists | Featured species with empty data. Cá ông tiên (angelfish) is on the Thai home with no numbers, and its Vietnamese page card has one cell (15 cm). 12 of 36 random species show 3 or fewer of the 6 card cells. | Feature only species with complete core data. Fill the top 50 beginner species first. | 4 | 2 | 16 |
| 13 | Species page | No compatibility at a glance. The only link is "Kiểm tra nuôi chung với loài khác →"; "Nuôi chung với con gì?" is section 8 of 20. | A "Nuôi chung" block under the data card: tính cách, đàn tối thiểu, "hợp với" (5 species chips), "tránh" (3 chips), and the tool link pre-filled with this species. | 5 | 3 | 15 |
| 14 | Species page | The page contradicts itself. Cá neon vua: card 3,5 cm, Dễ, 60 cm, pH 4,6–6,2; text 5 cm, "Trung bình", "khoảng 75 lít", "54 lít", pH 3,5–7,5. Cá chạch bùn: card 30 cm and 15–25 °C; text 25 cm and 4–25 °C, with "Họ: Cobitidae" listed twice. | The card is the single source. Section text that restates a number either matches it or says which source differs. Drop "Thông tin nhanh" lists that repeat the card. | 5 | 3 | 15 |
| 15 | Species page | The care summary ("Tóm tắt nhanh" with "Lỗi hay gặp") is on 1 of 47 sampled species pages, and on none of the 11 species the home page links (neon vua, betta, guppy…). | Generate it for every species, the most visited first. | 5 | 3 | 15 |
| 16 | Species data card | Every cell carries a disclosure ("Mức mọi nguồn cùng khuyên ▾", "Mỗi nguồn ghi một mức ▾"), 6 per card, with tap targets 17 px tall. | One "Nguồn và độ tin cậy" toggle per card. Mark only the cells where sources disagree. | 3 | 1 | 15 |
| 17 | Nav, all pages | The glossary has no nav entry. "Khám phá" is a recently-updated list plus photo credits, and its name does not say so. "Video" overlaps "Hướng dẫn". | Nav: Loài cá, Cây, Hướng dẫn, Công cụ, Thuật ngữ. Video goes inside Hướng dẫn. Thiết bị and Mới cập nhật go in the menu and footer. | 3 | 1 | 15 |
| 18 | Search | A nonsense query ("xyzzyq") returns "4 kết quả": fuzzy hits on "X.-Y." in reference lists and "ô-xy". There is no no-results state. | Keep reference lists out of the index. When nothing scores well, say so and offer "Xem tất cả loài" and a Latin-name hint. | 3 | 1 | 15 |
| 19 | Fish list filters | After filtering, "232 loài phù hợp" shows with no chips for the active filters and no clear-all link. | Active-filter chips with ×, plus "Xóa lọc". | 3 | 1 | 15 |
| 20 | Plant list | Plants with no photo show an empty white strip where the image should be (Cây rau dền đỏ mini). It reads as a broken image. | A leaf glyph on the plate colour, same aspect ratio as the photos. | 3 | 1 | 15 |

## Site-level verdict

**Design specificity.** The visual language is authored for this product. The paper and ink palette, the serif display
type over a clean sans, the field-guide data plate with range bars, and the "Nuôi ở Việt Nam" block that turns a
temperature range into "Mùa đông miền Bắc: cần sưởi" could not be lifted onto another site unchanged. The prototype feel
does not come from the look. It comes from states and seams: data that disagrees with itself on one page, cards half
filled, a tool that fails without a word, search excerpts made of index junk, and a phone header that pushes every
answer below the first screen. Fix those and the site will read as finished with the visual design mostly as it is.

**What works.**

- "Nuôi ở Việt Nam" on species pages. It answers the question a Vietnamese keeper actually has (do I need a heater in a
  Hà Nội winter, a chiller in summer) in three lines.
- The volume tool (`/vi/cong-cu/the-tich-be/`). Drawn shape icons, an instant answer, real water after substrate, glass
  thickness, and a link on to the heater. It is the most finished surface on the site.
- The gallery lightbox. Caption, credit, "1/22", arrows in the thumb zone, a URL per photo.
- Dark mode is complete. Every page reviewed works in it; the problems are a few colours (see minor observations).
- Localisation goes beyond translation: the Indonesian and Thai homes swap in native-fish sections ("Ikan asli
  Indonesia", "ปลาพื้นถิ่นไทย").

**Nielsen heuristics (site level).**

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 2 | Tank-mates gives no feedback on a failed add; search reports "4 kết quả" for junk; no active-filter chips. |
| 2 | Match with the real world | 3 | Question headings ("Cần bể bao lớn?") and plain Vietnamese are good. "Cá Acrossocheilus parallens", the "cm · °C" pill and "Khám phá" are not. |
| 3 | User control and freedom | 3 | Shareable tank-mates URL, search "Xóa", lightbox close. No clear-all on filters. |
| 4 | Consistency and standards | 2 | Card versus text numbers disagree; the summary box is on 1 of 47 sampled species pages; plant cards and data cards have empty cells. |
| 5 | Error prevention | 2 | Tank-mates picks the wrong fish on a partial name; unknown data passes filters. Number inputs do have min and max. |
| 6 | Recognition rather than recall | 2 | Tools refer to "kích thước bể ở trên"; no search field outside home; the datalist is the only suggestion aid. |
| 7 | Flexibility and efficiency | 3 | Remembered tank, units and theme toggles, URL state. No sort on any list. |
| 8 | Aesthetic and minimalist design | 3 | Calm, readable pages. Noise from 6 disclosures per card, dense glossary underlines, and attribution on every guide card. |
| 9 | Error recovery | 1 | Silent no-match in tank-mates, no empty state in search, a two-link 404. |
| 10 | Help and documentation | 3 | Glossary plus inline term tips and guides. The glossary is missing from the nav and term pages are dead ends. |
| | **Total** | **24/40** | **Acceptable**: a good base with clear gaps in states and data trust. |

**Cognitive load.** 3 of 8 checklist items fail (moderate): the phone header and nav give 11 controls before content
(minimal choices); species pages ask the reader to reconcile two sets of numbers (working memory); the tools page shows
all six tools at once (one thing at a time).

**Detector (`impeccable detect`, 6 findings, exit 2).**

- 3 × side-tab on the title tag over video thumbnails: `apps/site/src/components/GuideCard.astro:26`,
  `apps/site/src/components/VideoPlayer.astro:121`, `apps/site/src/pages/vi/video/[slug].astro:59`. This is a label on
  an image, not a card side-stripe, so the rule fires on the wrong thing. The tag still needs work for a different
  reason. It sits on YouTube thumbnails that already have English text burned in ("GOOD…", "ALGAE"), so the home "Video
  hướng dẫn" row shows two layers of text. Listed under minor observations.
- 2 × side-tab on the `.verdict` callout: `apps/site/src/pages/vi/ca/[breed].astro:114`,
  `apps/site/src/pages/vi/san-pham/[slug].astro:82`. A left rule on a verdict box fits the handbook style. Low priority;
  a top rule would match the data card.
- 1 × broken-image at `apps/site/src/pages/vi/ca/[slug]/anh.astro:45`. False positive: it is the lightbox `<img>` that
  the script fills; the lightbox worked when tested.
- Browser overlay injection was skipped: this was a headless run with no tab for anyone to see it in.

The detector found nothing the review had missed. It cannot see the main problems here because they are states and
data, not markup patterns.

## Per-surface details

Each item: what is wrong and where it shows, why the reader cares, the fix, and the score. Items in the top 20 carry
their rank.

### All pages (header, nav, footer)

**G1. Phone header takes a quarter of the screen.** Top 20 #1. I5 E2 P20.
- What (phone): 199 px of 839. Logo plus a tagline on two lines, "Tìm", "cm · °C", the theme icon, then "VI" alone on a
  second row, then 7 links on two more rows. Every page.
- Why: every answer starts lower. On species pages the name starts at 615 px.
- Fix: one 56 px row with logo, a search icon and a menu button. The menu sheet holds sections, units, theme and language.

**G2. Search is a text link.** I4 E2 P16.
- What: "Tìm" is a 26 px wide text link to a separate page. Outside the home page there is no search field.
- Why: search is how most readers arrive at a fish. Making it a word among nav links hides the main way in.
- Fix: a search icon in the header that opens `/vi/tim-kiem/` with the field focused. On computers, a field in the header.

**G3. Header controls under 44 px.** I3 E1 P15 (goes away with G1).
- What: units pill 69×26, language 59×26, theme icon fine at 44×44.
- Fix: 44 px hit areas, or move them into the menu as G1 suggests.

**G4. The units pill does not say what it is.** I2 E1 P10.
- What: "cm · °C" changes to "in · °F" when tapped, with no label.
- Why: it reads like a status badge, not a control.
- Fix: in the menu, a two-option control labelled "Đơn vị".

**G5. Nav naming and missing glossary.** Top 20 #17. I3 E1 P15.
- What: Loài cá, Cây, Hướng dẫn, Video, Thiết bị, Khám phá, Công cụ. The glossary (58 terms) is reachable only from
  inline term links. "Khám phá" holds "Mới cập nhật" and photo credits.
- Fix: Loài cá, Cây, Hướng dẫn (videos inside), Công cụ, Thuật ngữ. The rest in the menu and footer.

**G6. The comment widget loads Cloudflare Turnstile on every species, plant and guide page.** I2 E2 P8.
- What: each of those pages logs CSP errors ("Connecting to 'data:,' violates…") and two 401s from
  `challenges.cloudflare.com`, and the page never goes network-idle.
- Why: data and battery on phones, and the console is never clean, which hides real script errors.
- Fix: load Turnstile when the reader focuses the comment form.

### Home `/vi/`

**H1. The tank form oversells its answer.** Top 20 #2. I5 E2 P20.
- What: the defaults lead to `/vi/ca/?tankCm=60&tempC=26&ph=7`, "327 loài phù hợp". 244 of those have no temperature,
  pH or tank length. `filterSpecies` in `apps/site/src/scripts/filter.ts` treats a missing value as a pass.
- Why: the promise is "loài nào sống khỏe trong đó". A beginner will take every result as safe.
- Fix: two groups. "Hợp bể của bạn (83)" first; "Chưa đủ dữ liệu để chắc (244)" collapsed below.

**H2. Range bars on cards have no scale.** I3 E2 P12.
- What (phone and computer): coloured bars under Nhiệt độ and pH, blue to orange and yellow to blue, with no end values
  or legend.
- Why: a beginner cannot tell what the position means. An experienced keeper reads the numbers and ignores the bars.
- Fix: thin end labels (for example 15 and 32 °C) on the first card of each grid, or a one-line legend above the grid.
  When the reader's tank is remembered, mark the tank's value on the bar.

**H3. Decorative hero photo takes a full phone screen.** I2 E1 P10.
- What (phone): the paludarium photo sits under the form, about 500 px tall, not linked and not captioned.
- Fix: hide it on phones or crop it to a short strip. Keep it on computers, where it sits beside the form.

**H4. Featured species with empty data.** Top 20 #12. I4 E2 P16.
- What: Cá ông tiên appears in the Thai home's popular grid with only a name. Its Vietnamese card has one cell (15 cm).
  In the random sample, 12 of 36 species show 3 or fewer of 6 card cells.
- Why: "show, don't make them imagine". A featured card with no data says the site is unfinished.
- Fix: featured lists only take species with temperature, pH, tank and difficulty. Fill the top 50 beginner species.

### Search `/vi/tim-kiem/`

**S1. Excerpts show index junk.** Top 20 #6. I4 E1 P20.
- What (phone, both themes): "Brazil. ca neon xanh ca neon ca neon tetra neon tetra neon fish ca neon thuong ca neon
  xanh duong. Cá neon xanh. (Chuyển hướng từ Cá neon xanh)." Gallery results end in "→ ‹›×".
- Fix: `data-pagefind-ignore` on alias lists, redirect notes and lightbox buttons. Use the meta description for the
  excerpt.

**S2. Gallery pages crowd out species.** Top 20 #7. I4 E1 P20.
- What: for "neon", 4 of the first 5 results are "Ảnh Cá neon …" galleries, and the Cá neon vua species page is not among them.
- Fix: leave galleries out of the index, or weight species pages.

**S3. No empty state.** Top 20 #18. I3 E1 P15.
- What: "xyzzyq" gives "4 kết quả" from fuzzy hits on "X.-Y." in references and "ô-xy". The first of those has no
  thumbnail and leaves a gap.
- Fix: keep reference lists out of the index. When nothing scores well: "Không có kết quả cho 'xyzzyq'", then "Xem tất
  cả loài" and "Thử tên khoa học".

**S4. Blank search page is bare.** I2 E1 P10.
- What: a field and nothing else.
- Fix: six popular species and the section links under the field.

**S5. All result types look the same.** I3 E2 P12.
- What: species, plant, guide, gallery and glossary results share one layout with no label.
- Fix: a type label on each result and filter tabs (Pagefind filters support this).

**S6. Highlight is the browser's pure yellow in dark mode.** I2 E1 P10.
- What (phone, dark): `<mark>` keeps the default `rgb(255, 255, 0)` with black text on the dark page.
- Fix: a muted amber highlight token for each theme.

### Fish list `/vi/ca/`

**L1. Bred strains come first.** I3 E1 P15.
- What (phone and computer): with no filter, the first section is "Cá lai và các dòng cá cảnh" (betta strains,
  flowerhorn, GloFish) before the 747 species.
- Fix: species first, sorted with beginner species on top; strains as their own group further down.

**L2. No active-filter chips or clear-all.** Top 20 #19. I3 E1 P15.
- What (phone): after filtering, a count ("232 loài phù hợp") with the form above it. To undo, clear each field by hand.
- Fix: chips for each active filter with ×, plus "Xóa lọc".

**L3. No sort.** I2 E2 P8.
- Fix: sort by "Dễ nuôi trước", size, name.

**L4. Latin names dressed as Vietnamese.** I2 E1 P10.
- What: 43 species have no Vietnamese name and show as "Cá Acrossocheilus parallens".
- Fix: show the Latin name in italics once, with a small "chưa có tên Việt" note. Do not prefix a binomial with "Cá".

**L5. Uneven cards.** I2 E1 P10.
- What: cards drop rows they have no data for, so heights differ and the grid looks ragged. Some images are museum line
  drawings or fish held in a hand (Cá trê Bagrus bajad, Cá trê banjo đuôi lươn).
- Fix: a fixed set of rows with a muted "—". Prefer live photos; mark drawings as such.

### Species pages (`/vi/ca/ca-neon-vua/`, `/vi/ca/ca-chach-bun/`)

**P1. First screen is a photo.** Top 20 #5. I5 E2 P20.
- What (phone): header, breadcrumb, photo. Name at 615 px, data card at 759 px of 839 px visible. On computers the
  layout is fine: photo left, name and card right.
- Fix: on phones, name and a 4-fact strip above a 16:9 photo.

**P2. No compatibility at a glance.** Top 20 #13. I5 E3 P15.
- What: compatibility lives in a link and in section 8 of 20.
- Why: "what can I keep it with" is the second question every reader has.
- Fix: a "Nuôi chung" block under the card: tính cách chip, đàn tối thiểu, "Hợp với" chips, "Tránh" chips, and "Kiểm
  tra với loài khác" opening the tool with `?ca=<slug>:<schoolMin>`.

**P3. Numbers contradict each other.** Top 20 #14. I5 E3 P15.
- What: Cá neon vua card says 3,5 cm, Dễ 2/8, bể 60 cm, pH 4,6–6,2, 23–27 °C. "Thông tin nhanh" says 5 cm and "Độ khó:
  Trung bình". "Cần bể bao lớn?" says 54 lít and 75 lít. "Nước cần thế nào?" says pH 3,5–7,5 and 23–29 °C. Cá chạch
  bùn's card says 30 cm and 15–25 °C; the text says 25 cm and 4–25 °C, and "Thông tin nhanh" lists "Họ: Cobitidae" twice.
- Why: the reader cannot tell which number to buy a tank or heater by. This, more than anything visual, is what reads as
  unfinished.
- Fix: the card is the single source. Restated numbers in sections match the card or say "Seriously Fish ghi …". Drop
  "Thông tin nhanh" where it repeats the card.

**P4. Care summary missing on most pages.** Top 20 #15. I5 E3 P15.
- What: `QuickSummary` ("Tóm tắt nhanh" plus "Lỗi hay gặp") renders on 1 of 47 sampled species pages and on none of
  the 11 species the home page links. Acrossocheilus parallens, a page few readers will open, has one.
- Fix: generate summaries for all species, most visited first.

**P5. Six disclosures per data card.** Top 20 #16. I3 E1 P15.
- What (phone and computer): "Mức mọi nguồn cùng khuyên ▾" or "Mỗi nguồn ghi một mức ▾" under every value; the second
  kind is 17 px tall.
- Fix: one toggle per card, and a small marker on cells where sources disagree.

**P6. No jump navigation.** Top 20 #9. I4 E2 P16.
- What: 23,590 px and 20 sections on the phone.
- Fix: a sticky chip row (Bể · Nước · Thức ăn · Nuôi chung · Sinh sản · Ảnh).

**P7. Sparse profiles show half-empty cards.** I3 E1 P15.
- What: Acrossocheilus parallens and Cá ông tiên show 1 or 2 cells.
- Fix: show all 6 cells, missing ones muted ("chưa có"), so the card's shape is the same on every page.

**P8. Source marks are tiny.** I2 E1 P10.
- What: citation numbers 14×14 px, the photo "©" 11×19 px.
- Fix: keep them visually small; pad the hit area to 44 px.

### Plant pages (`/vi/cay/`, `/vi/cay/tao-cau-marimo/`)

**C1. No filters on the plant list.** Top 20 #11. I4 E2 P16.
- What: 165 plants, 23,646 px on the phone.
- Fix: Ánh sáng, CO₂, Vị trí, Độ khó filters.

**C2. Empty photo slot.** Top 20 #20. I3 E1 P15.
- What (phone, both themes): Cây rau dền đỏ mini shows a white strip where the image goes.
- Fix: a leaf glyph placeholder at the photo aspect ratio.

**C3. Empty cell in the plant card.** I2 E1 P10.
- What (Tảo cầu Marimo): five values in a six-cell grid; the last cell is blank.
- Fix: let the grid fit its content.

**C4. The quick facts contradict the text.** I3 E1 P15.
- What: "Loại: Rêu", then the next paragraph says "Marimo không phải rêu cũng không phải cây thủy sinh". "Thông tin
  nhanh" also repeats the card.
- Fix: correct the type to "Tảo"; drop facts that repeat the card.

### Guides (`/vi/huong-dan/`, `/vi/huong-dan/ve-sinh-loc-be-ca/`)

**D1. 158 guides, no way in.** Top 20 #10. I4 E2 P16.
- What (phone): one card per row with a full-width image, 54,615 px.
- Fix: category chips, a beginner row at the top, compact rows on phones.

**D2. Attribution on every card.** I2 E1 P10.
- What: "Dịch từ Aquarium Breeder" is the only line of metadata on each card.
- Why: "cite quietly". The source belongs on the guide page, and the card has room for something more useful.
- Fix: read time and level on the card.

**D3. Thumbnails with English text, and one card without a picture.** I2 E2 P8.
- What (computer): "DRY ROCKS", "HOW TO OPTIMIZE BIOFILTER"; the carbon lỏng card has no image and breaks the grid row.
- Fix: crop or replace text-heavy thumbnails; the placeholder from C2.

**D4. Long table of contents on phones.** I2 E1 P10.
- What: 12 entries take a full screen between the summary and the first section.
- Fix: collapse it on phones: "Trong bài này (12) ▾".

**D5. Glossary underlines on every mention.** I2 E1 P10.
- What: "dòng nước", "thay nước", "vi sinh có lợi", "lọc" all dotted in one paragraph.
- Fix: underline the first mention per section.

The guide page itself is good. "Tóm tắt nhanh" comes first, the read time sits in the kicker, sources are counted
quietly ("tổng hợp từ 7 nguồn").

### Tools (`/vi/cong-cu/`, tank-mates at `/vi/cong-cu/#nuoi-chung`)

**T1. Not an index.** Top 20 #8. I4 E2 P16.
- What (phone): intro, then tank-mates, volume, substrate, heater, fertiliser, light, stacked. The volume block repeats
  `/vi/cong-cu/the-tich-be/` in a smaller form.
- Fix: 6 cards at the top with anchors; tank-mates gets its own page.

**T2. Tank-mates input fails silently or picks the wrong fish.** Top 20 #3. I5 E2 P20.
- What: "xyzq" plus "Thêm" clears the box, shows nothing. "neon" adds Cá bống neon. The suggestion aid is the native
  datalist, which many phone browsers show poorly.
- Fix: a custom suggestion list with photos; a no-match message; no auto-pick on a partial match.

**T3. The verdict is a table footer.** Top 20 #4. I5 E2 P20.
- What (phone): the "Khoảng chung" row reads "25°C · Không có · Không có · Chênh lệch lớn · Xung đột", and the last two
  columns are off-screen.
- Fix: a verdict sentence first, warnings next, the table last.

**T4. "1.043% · Quá tải".** I3 E1 P15.
- What: the stocking bar shows a four-digit percentage; the marker sits mid-bar.
- Fix: show "Quá tải (hơn 10 lần)" and the tank size that would fit; cap the bar and mark the overflow.

**T5. Small controls in the species chips.** I3 E1 P15.
- What (phone): remove "×" is 22×20 px, the count input 58×28 px, right next to each other.
- Fix: 44 px targets; a − / + stepper for the count.

**T6. Sections depend on "the tank above".** I3 E2 P12.
- What: substrate, heater and fertiliser all say "Dùng kích thước bể ở trên". On a phone that is two screens up.
- Fix: a tank chip in each section ("Bể 60×30×36 · sửa").

### Volume tool `/vi/cong-cu/the-tich-be/`

**V1. Twelve shapes before the inputs on phones.** I3 E1 P15.
- What (phone): the shape grid takes 1.3 screens; inputs and the answer are below it.
- Fix: rectangle preselected, inputs and answer first, "Đổi kiểu bể" opens the grid.

**V2. Ragged input rows.** I1 E1 P5.
- What (phone): Dài and Rộng share a row, Cao sits alone under them.
- Fix: three across, as on the tools page.

Everything else on this page works: instant answer, gallons, real water, glass thickness, the ready-made tank table.

### Glossary (`/vi/thuat-ngu/`, `/vi/thuat-ngu/vi-khuan-co-loi/`)

**GL1. One long list.** I3 E1 P15.
- What: 58 terms with full definitions, 13,250 px on the phone, no A–Z bar, no filter.
- Fix: a letter bar and a filter field; optional topic groups (nước, giải phẫu, sinh sản, bệnh).

**GL2. Term pages are dead ends.** I3 E2 P12.
- What: the term page is the definition and the footer, 991 px.
- Fix: "Bài viết nhắc đến" (the mention index in `apps/site/src/lib/mentions.ts` already knows them) and related terms.

**GL3. English name repeated.** I1 E1 P5.
- What: "Aufwuchs Aufwuchs".
- Fix: hide the English name when it matches.

### Gallery `/vi/ca/ca-neon-vua/anh/`

**GA1. Credit link hard to read in the dark lightbox, and raw usernames.** I2 E1 P10.
- What: the green credit link on near-black; "Ảnh: User:Lerdsuwa".
- Fix: a lighter link colour in the lightbox; strip "User:".

**GA2. The grid has no labels.** I2 E1 P10.
- What: 22 photos, no caption until opened. The lightbox captions exist.
- Fix: show the caption on tap-and-hold or under each photo on computers.

### Indonesian and Thai homes (`/id/`, `/th/`)

**I1. Thai tagline breaks inside a word.** I2 E1 P10.
- What (phone): "คู่มือปลาสวยงามและตู้ไม้ / น้ำ" splits ไม้น้ำ (aquatic plant).
- Fix: break at word boundaries (Intl.Segmenter at build time, or `<wbr>` in the string).

**I2. Equipment URLs keep Vietnamese slugs in Thai and Indonesian.** I1 E2 P4.
- What: `/th/equipment/be-ca/`, `/th/equipment/phan-nen/`, `/id/peralatan/cay-thuy-sinh/`. Species URLs are already
  translated (`/id/ikan/neon-tetra/`, `/th/fish/betta-splendens/`).
- Fix: translated or English slugs, with redirects.

**I3. Same empty-data cards as H4.** The Thai home shows ปลาเทวดา (angelfish) with no numbers.

### 404

**N1. Two links and no search.** I2 E1 P10.
- What: "Xem tất cả loài hoặc tìm kiếm."
- Fix: a search field on the page and four popular sections.

## Persona red flags

**Beginner (first tank, phone).** Taps "Xem loài hợp bể" and gets 327 species, including catfish with no data and names
like "Cá Acrossocheilus parallens", and believes all of them are safe. On Cá neon vua reads "Dễ" in the card and "Trung
bình" lower down. Types "neon" into tank-mates and gets a neon goby. Cannot read the coloured range bars.

**Phone reader, one hand.** Every page opens with 199 px of header. The species page's first screen is a photo. The ×
to remove a fish in tank-mates is 22×20 px beside a 58×28 px number box. The tank-mates table needs a sideways scroll
for its last two columns. The guide list is 65 screens with no filter.

**Experienced keeper.** No sort on any list and no way to exclude species with unknown data. The data card and the text
disagree, so the card is not trusted. Search cannot be limited to species. The glossary has no A–Z. Only the volume tool
and the light controller have their own pages; tank-mates is an anchor on a long page.

## Minor observations

- Video title tags over YouTube thumbnails stack on burned-in English text (detector side-tab hits). Drop the tag when the
  thumbnail already has text, or crop the thumbnail. I2 E2.
- `.verdict` callouts on strain and product pages use a left rule; a top rule would match the data card. I1 E1.
- Range-bar tracks almost vanish in dark mode on species cards. I1 E1.
- Guide hero images are sometimes generic (a goldfish for "Vệ sinh lọc bể cá"); a photo of filter media would teach
  more. I2 E2.
- Tank-mates "Thêm" button is 76×36 px. I1 E1.

## Questions to consider

- What if every species page answered three things on the first phone screen: can my tank hold it, what can live with
  it, and how hard is it?
- Should a species with unknown water data ever appear in a "hợp bể của bạn" list without a label?
- Would the tools work better as six small pages with one shared, remembered tank than as one long page?

Questions skipped: output format fixed by the brief (non-interactive review sub-agent; 20+ priority issues).

## Evidence index

Screenshots live in `/tmp/aqcrit/shots/` on the reviewing machine (`<page>.<phone|desk>.<light|dark>.s<n>.png`,
s0 = first screen). Measurements are in `/tmp/aqcrit/manifest.json`; the capture scripts are `/tmp/aqcrit/shoot.mjs`
and `/tmp/aqcrit/probe.mjs`.

| Finding | Screens |
| --- | --- |
| G1, P1 | `home.phone.light.s0`, `sp-neon-vua.phone.light.s0`, `sp-neon-vua.desk.light.s0` |
| H1 | `probe-homeflow.phone.png`, `fish-filtered.phone.light.s0` |
| H2, H4, I3 | `home.phone.light.s2`, `th-home.phone.light.s2`, `probe-angelfish.phone.png` |
| S1–S3, S6 | `search-neon.phone.light.s0`–`s2`, `search-empty.phone.light.s0`, `search-neon.phone.dark.s0` |
| L1–L5 | `fish-list.phone.light.s0`–`s3`, `fish-list.desk.light.s0`, `fish-filtered.phone.light.s0`–`s5` |
| P2–P7 | `sp-neon-vua.phone.light.s0`–`s5`, `sp-chach-bun.phone.light.s0`–`s5`, `sp-noname.phone.light.s0`–`s5` |
| C1–C4 | `plant-list.phone.light.s0`, `plant-list.phone.dark.s0`, `plant-marimo.phone.light.s0`–`s1` |
| D1–D5 | `guide-list.phone.light.s0`–`s1`, `guide-list.desk.light.s0`, `guide-loc.phone.light.s0`–`s2` |
| T1–T6 | `tools.phone.light.s0`–`s1`, `tool-tankmates.phone.light.s0`–`s2`, `tool-tankmates.desk.light.s0`, `probe-tm-partial.phone.png` |
| V1–V2 | `tool-volume.phone.light.s0`–`s2`, `tool-volume.desk.light.s0` |
| GL1–GL3 | `glossary.phone.light.s0`–`s1`, `term.phone.light.s0` |
| GA1–GA2 | `gallery.phone.light.s0`–`s1`, `probe-gallery-tap.phone.png` |
| I1–I2 | `th-home.phone.light.s0`, `id-home.phone.light.s0` |
| N1 | `404.phone.light.s0` |
