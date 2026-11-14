# The editors' record

How well each seat of the editors (`.claude/skills/editors/SKILL.md`) judges what reads natural, per language: its
naturalness findings, and how many the corpus check held (the phrase is far rarer in hobbyists' own writing than on
the site, and hobbyists use the replacement). A seat that judges a language well has most of its findings held over two
rounds or more; the skill's "Weighing the seats" says what that changes.

## To read again after 16 Nov 2026, with whichever seats exist then

Until 10 Nov the editors sat with Anthropic and xAI only (the owner, 2026-11-08). What first shipped on those two-editor
scores, to be read again:
- the app's card copy: the calendar's themes, shelf titles and story cards (`content/curation.json`);
- the first two Hôm nay cards, medaka and climbing perch (`content/cards`);
- the chat screen's new Vietnamese strings, read in the Design Lead's rounds (`docs/design/chat.md`, "Editors");
- the guide writer's voice A (prompts from rounds 9 to 11), on the three sample guides: blue-green algae, quarantine, shopping list.
- the privacy page's Hỏi AquaTome section in all five languages, with its lines in the retention and account-deletion lists (`apps/site/src/pages/chinh-sach-bao-mat/index.astro`).
- the chat's first lines, in all four languages (`OPENING_SYSTEM`, `apps/site/worker/chat/agent.ts`): merged at round five's prompt, plus three changes no editor has read: when a line may open "về chuyện", no "về việc" or "việc + động từ", and a long post's earlier questions passed along with its end.

## The chat's first lines (2026-11-10)

Five rounds, on 75, 80, 67, 66 and 68 lines, with the Anthropic and xAI seats only; OpenAI and Google were out on the
Cursor limit. These aren't in the tallies below, which count pages. Scores, lowest of four (Anthropic, xAI):

| Round | Vietnamese | Indonesian | Malay | Thai |
|---|---|---|---|---|
| 1 | 7, 6 | 7, 5 | 4, 4 | 6, 4 |
| 2 | 6, 7 | 7, 8 | 8, 8 | 8, 8 |
| 3 | 6, 7 | 8, 7 | 9, 9 | 8, 8 |
| 4 | long posts 4, 5; short questions 7, 8 | 7, 7 | 8, 8 | 8, 8 |
| 5 | long posts 6, 6; short questions 7.5, 7 | 8, 7 | 8, 8 | 8.5, 8 |

Round 1:
- **Vietnamese, held by the references:** "cẩm nang mục" (0 in the site and the references), "kinh phí" for "ngân sách"
  (forum 24.4 against 4.6), "bỏ không" for "bỏ trống" (videos 14.8 against 0), and "tần suất" for a heater or a filter (forum
  0.7, site 7 to 11). "Cường độ ánh sáng" is 2.0 in the forum against 26 in the guides. Both seats raised each of these.
- **Vietnamese, dropped:** "tình trạng" (both seats; forum 117, site 118). Open: "đánh CO2" for "đưa CO2" (Anthropic; both rare).
- **Indonesian, Thai and Malay** have no hobbyist corpus. A finding held when both seats raised it: 9 Indonesian lines,
  15 Malay and 10 Thai. Open: whether a Thai line needs "เรา" (Anthropic says yes, xAI says it's normal Thai), and the
  chat's "ครับ" and "ค่ะ".
- **The packet's fault:** xAI marked a fish as added on five lines where the reader asked from that fish's page or a
  photo. The packet didn't show that. A packet for these lines carries where the question was asked from.

Rounds 2 and 3:
- **Vietnamese, held by the references:** "tháng tuổi" for a tank (forum 53 a million words for fish, once with "bể" or
  "hồ"); "xuất hiện" for "bị rêu chùm đen" (both rare, both seats, both rounds); "hồ hiện tại" for "hồ này" (forum 0
  against 30.3, videos 3.7 against 494).
- **Vietnamese, not a fault of wording:** hobbyists write both "xử lý thế nào" and "xử lý sao" (forum 3.3 and 2.0), and both
  "nên làm gì" and "nên làm sao" (3.3 and 2.0). They count only because the prompt keeps the reader's own words.
- **Vietnamese, open:** "nguyên nhân là gì", "đang bị gì" and "bắt bệnh" (forum 1.3, 0.7 and 2.0).
- **Indonesian, Thai and Malay:** a finding held when both seats raised it. Round 2: 4 Indonesian lines, 5 Malay and 6
  Thai. Round 3: 6 Indonesian, 2 Malay and 3 Thai, and the reader's Thai space lost on 10 of 13 questions.
- **Length (round 3):** asked directly about long Vietnamese lines, both seats said length alone costs no points, that a
  cut to 140 characters lowers faithful, and that a line of about 180 is better than none on a long post.

Rounds 4 and 5, with Vietnamese read in two parts: 12 long posts, and every short question in the run (33, then 43):
- **Long posts:** writing the line from the post's last 240 or so characters took them from 4, 5 to 6, 6. Both seats named
  what it costs: a question, or what the question needs, that comes earlier in the post. 5 of the 22 posts cut (of 33) had
  an earlier question, so those now go along with the end.
- **Vietnamese, held by the references:** "việc bổ sung" (forum 1.3).
- **Vietnamese, not a fault of wording:** "về chuyện" (forum 16.5, videos 3.7), "về việc" (forum 48.1, videos 125; both
  seats called it office register, which the corpus doesn't bear out), "do đâu" (forum 5.3, videos 22.1) and "hàng loạt"
  (forum 16.5). What stood was a "về" frame on a line that asks, and facts changed from what the reader wrote.
- **Indonesian, Thai and Malay:** a finding held when both seats raised it. Round 4: 4 Indonesian lines, 2 Malay and 8
  Thai. Round 5: 4 Indonesian, 3 Malay and 9 Thai. The reader's Thai space was lost on 8 of 12 questions, then 8 of 11.
- **One run doesn't show a language holds (round 4):** Malay fell from 9, 9 to 8, 8 with 12 of its 16 lines word for word
  and no rule changed. From round 5 each question ran three times, and each line came from one run in turn.
- **Questions the team wrote (round 5):** 40 new ones, 10 a language. Neither seat named a Vietnamese or Indonesian one.
  xAI doubted three Malay ones and Anthropic one Thai. The 10 Vietnamese ones were easier than the older short questions
  (1 finding against 18), so a sample needs real ones too.

## The app's card copy (2026-11-08)

Seven rounds on the calendar's themes, shelf titles and story cards (`content/curation.json`), with the Anthropic and
xAI seats only; OpenAI and Google were out on the Cursor limit. These aren't in the tallies below, which count pages.
- **Vietnamese, held by the references:**
  - "trải nền cao dần về phía sau" for "dốc về sau" (Anthropic): 8 a million words in the video guides, against 0.
  - "lưu thông tốt" for "nước chảy tốt" (Anthropic): in the forum and the videos, while the other is in neither.
  - "bể thủy sinh" for "bể cây": 27.7 against 0.7.
  - "người mới" for "bể đầu tiên": 66.6 against 0.7.
  - Both seats, both rare: "đặt ở chỗ" for "đặt chỗ", and "phòng khi mất điện" for "phòng mất điện".
- **Indonesian, Thai and Malay** have no hobbyist corpus yet. A finding held when both seats raised it, or when the
  site's own pages bear it out:
  - Thai: "ปลาพื้นเมือง"; "ปลาหมอไทย", the climbing perch page's other name; "ปลาช่อนและปลาชะโด", since the giant
    snakehead's page never calls it ปลาช่อน.
  - Malay: "berkumpulan", 627 a million words on the site's Malay pages against 19 for the Indonesian "berkelompok",
    which round 4 had brought in.
  - The beginners' shelf in two beats (xAI alone): "cocok untuk pemula" and "sesuai untuk pemula", both the site's own
    words.
- **Week 4, African fish (rounds 12 and 14).** Vietnamese 9 from both seats in round 12. Two findings came from one
  seat each, and neither held:
  - Indonesian "Ikan aneh" for "Ikan unik" (xAI): the site's pages say "ikan unik (oddball)", never "ikan aneh".
  - Thai "ปลาหมอสี…" for the lakes shelf (Anthropic): the shelf holds a catfish, so "ปลาหมอสี" would be wrong once its
    Thai page exists.
  With those reasons given, both seats scored all three at 9 in round 14.
- **Labels, not wording.** Most findings were labels that promised more than the pages say: goldfish on a cold shelf,
  a Thai betta on a native one, a ram among small schooling fish. Each became a planner rule
  (`packages/engine/src/curation.ts`), so they're not counted against the seats.

## The app's trivia cards (2026-11-08)

Rounds 8–11 on the first two Hôm nay cards (`content/cards`), Vietnamese, each one fact from dated papers. The Anthropic
and xAI seats only; OpenAI and Google were out on the Cursor limit. Lowest of four, Anthropic then xAI: medaka 8/7, 9/7,
8/9, 9/9; climbing perch 6/6, 9/7, 9/9. Round 11's last finding (xAI: "Hai trong 8 con nở" read as only two
hatching, which Anthropic also stopped on) was taken after both scored 9. Not in the tallies below.
- **Faithfulness, both seats, every round:** a detail from the fish's page cited as the paper's ("vài trăm mét", "có
  gai", "thân sau", "xòe"); a hedge tightened ("chỉ" for the paper's "predominantly"); one clause carrying two facts,
  so the limit on one stuck to the other (the 43 eggs read as the first week's); a conclusion left outside its citation,
  so it read as ours. A card's every sentence now sits on the source it names.
- **Held, one seat:** "bắt cặp" for a third "giao phối" (Anthropic; 37 a million words in the forum, against 16); "hạ
  cánh" for "về mặt đất" (Anthropic); the hatch's second half, so 8 of 43 doesn't read as a failure (xAI).
- **The eyebrow:** both seats found "Có thể bạn chưa biết" a stale banner, close to the style guide's "bạn có biết".
  "Chuyện ít ai biết" (Anthropic) held; "Chuyện ít kể" (xAI) wasn't taken. Neither is in the references: a rubric.
- **The glass catfish's name (rounds 13 and 14):** 7 and 8, then 9 and 9. Both seats raised the same four, all taken:
  - "chứng minh" became "cho thấy", the paper's "indicates" (faithful);
  - "nhà ngư học" became "nhà khoa học" (0 in the forum, against 11 a million words);
  - "gọi nhầm bằng tên của … và" became "gọi nhầm là … hoặc";
  - "sách báo cũ vẫn" became "sách báo in trước năm 2013 thường", the page's "phần lớn tài liệu".
  No pronoun for the two authors, so as not to guess their gender.
- **Split:** "tạp chí" before a journal's name (Anthropic: always; xAI: never before "Journal of…", which stutters).
  It stays before a name that doesn't say it's a journal.

## The weeks' themes and shelf titles, 7 Dec 2026 – 7 Feb 2027 (2026-11-13)

The calendar's nine new weeks (`content/curation.json`). These aren't in the tallies below, which count pages.

| Round | Seats | Vietnamese | Indonesian | Thai | Malay |
|---|---|---|---|---|---|
| 1 | xAI alone | 8 | 7 | 7 | 7 |
| 2 | Anthropic, xAI | 8, 8 | 8, 9 | 8, 8 | 8, 8 |
| 3 | Anthropic, xAI | 9, 9 | 8, 8 | 8, 8 | 9, 8 |
| 4 | Anthropic, xAI | 9, 9 | 9, 9 | 8, 8 | 8, 9 |
| 5 | Anthropic, xAI | 9, 9 | 9, 9 | 8, 8 | 9, 8 |
| 6 | Anthropic, xAI | 9, 9 | 8, 8 | 9, 9 | 8, 8 |
| 7 | Anthropic, xAI | 9, 9 | 9, 9 | 9, 9 | 9, 8 |
| 8 | Anthropic, xAI | 9, 10 | 9, 9 | 9, 9 | 9, 8 |
| 9 | Anthropic, xAI | 9, 9 | 9, 9 | 9, 9 | 9, 8 |
| 10 | Anthropic, xAI | 9, 9 | 9, 9 | 9, 9 | 9, 9 |

Round 1 had the xAI seat alone: Cursor refused OpenAI and Google (not in that week's usage), and no Claude helper ran
before 14 Nov.
- **Vietnamese, held by the references:**
  - "ăn rêu" for "đội dọn bể": 110.7 a million words in the videos and 20.4 in the forum, against 0 in both (the site's
    guides have it at 30);
  - "rêu hại" for "rêu tảo": 579 in the videos and 10.6 in the forum, against 7.4 and 2.6. The verb stays "xử lý",
    which the videos use for it (22.1).
- **Indonesian, Thai and Malay** have no hobbyist corpus yet. Changed only where the source or the site's own pages bear
  the finding out:
  - the season themes had lost the fish the Vietnamese names;
  - Thai: the red-fish shelf takes the names its pages give, หลอฮั่น and ปลาหมอนกแก้ว, since หมอสี alone is the cichlids as a group;
  - Indonesian "air dingin" for "air sejuk", which is the Malay word; "alga" in the algae eaters' row, as the next
    shelf says;
  - "crew" carried over word for word in all four (Tim pembersih, ทีมทำความสะอาดตู้, Pasukan pembersih): the finding the
    Vietnamese references hold.
- **Open after round 1, answered in round 2:** Malay "saudaranya" (both seats: it reads as a sibling; changed) and
  "sempena" (one seat would change it, the other kept it; kept).

Round 2 (14 Nov): Anthropic and xAI. OpenAI and Google sat out again (not in Cursor's weekly usage).
- **Vietnamese, by the references:**
  - held: "set bể" for "dựng bể" (videos 29.5 a million words and forum 3.3, against 0 and 0);
  - held, both seats: the corydoras-and-plecos shelf drops "và họ hàng". xAI's "loài cùng họ" was as rare in the
    forum (0.7) as the old words, so the shelf names its two groups and nothing more;
  - held, xAI: "cá vàng" in the 1–7 Feb theme reads as the goldfish, which that week doesn't hold. "Cá màu đỏ"
    (forum 4.6) and "đỏ và vàng" (4.0) over xAI's "sắc đỏ" (5.9 against "màu đỏ" 152.3);
  - dropped, Anthropic: "những con cá" (forum 133.2, as on the site) and "những chú cá" (forum 61.3, against 23.7 in the
    site's guides); "cá thả đầu tiên" is in no forum or video.
- **Indonesian, Thai and Malay**, changed where both seats raised it or the site's own pages bear it out: Thai
  "สัตว์กินตะไคร่: …" (both), "กำจัดตะไคร่" (the site's guides 31.3 against 2.6), "ปลาคาร์ป" (the koi page's name); Malay
  "ikan bandaraya" (both seats on "saudaranya") and "musim tengkujuh" on the heater shelf. Dropped: "lumut" for "alga"
  (Indonesian pages say "pemakan alga" 39.2, "pemakan lumut" 0; the Malay interface writes "alga perosak"),
  Indonesian "heater" (the site uses "pemanas" as much), Malay "berkelompok" (the site's "berkumpulan" 589.8 against
  13.6), and "sempena" and "menyambut" (the seats split).

Round 3 (14 Nov): Vietnamese held 9 with both seats, no finding. Held: the Indonesian and Thai Tết themes, identical
across the two weeks where the Vietnamese differs (both seats; 25–31 Jan now names the goldfish by its page's name, 1–7
Feb the colours, with "berwarna" from the Indonesian pages, 174 uses of "berwarna merah"); one shape for both halves of
the Indonesian and Malay cold-season themes; the Thai super red arowana by its page's name. Dropped: Malay "Kelisa" for
the arowana shelf (it holds the silver arowana too); Thai "ปลาหมอสี" for the flowerhorn (the word for every cichlid);
"ikan merah" as red snapper (raised as unsure).

Round 4 (14 Nov): Vietnamese and Indonesian held 9 with both seats. Held: Thai "อะโรวาน่า" for the arowana shelf (both;
the Thai pages 94 against ปลามังกร 3), Thai algae eaters without a heading and colon (both), Vietnamese "Cá koi và cá đỏ cỡ
nhỏ" (both seats over two rounds, though the forum writes "những chú cá" at 61.3 a million words: a heading's padding,
not a word keepers avoid). The Thai flowerhorn became "ฟลาวเวอร์ฮอร์น" on the Writing Lead's word (the Thai pages 16,
against 3 and 2). Dropped: Malay "tangki" for "akuarium" (one seat; both read a bare "tangki" as a water tank in that
morning's video titles), Malay "menyambut" for "sempena" (split again), Thai "บลัดพารอท" (the page says ปลาหมอนกแก้ว),
Vietnamese "Cá thả trước" (one seat; "cá thả đầu tiên" is in no forum or video).

Round 5 (14 Nov): Vietnamese and Indonesian held 9 with both seats again. Held, by the shelf itself: the 1–7 Feb koi
shelf holds the koi betta and koi angelfish, not the koi carp (both seats on the Thai "ปลาคาร์ป"; round 4's Vietnamese
"Cá koi" had the same fault), now named by their pages; the Vietnamese cold-season theme, whose week holds no guides
for "giữ ấm cho bể". Dropped: Malay "musim tengkujuh" off the heater shelf (one seat; the week is for the rainy season's
cool nights, and the other seat asked for it in round 2), "menyambut" again, the otocinclus and twig catfish named on
the corydoras-and-plecos shelf (scored at 9; "lau kiếng" is the whole family on this site).

Round 6 (14 Nov): Vietnamese and Thai held 9 with both seats. Held, both seats: the Indonesian and Malay koi shelf's bare
"Koi" read as the koi carp, which it doesn't hold; Indonesian now names the koi betta and koi angelfish, Malay the
angelfish alone (no Malay koi betta page). Held, both in some form: the Vietnamese "Những con cá đầu tiên cho bể mới"
shortened to "Cá đầu tiên cho bể mới" (neither form is in the forum or the videos; a heading's padding). Dropped: Malay
"Kelisa" again (the arowana shelf doesn't show in Malay yet, and holds the silver arowana).

Round 7 (14 Nov): Vietnamese, Indonesian and Thai held 9 with both seats; Malay 9 and 8. Held, both seats: the Malay koi
shelf takes "ikan" before "angel", as the angelfish page's name does ("Ikan Angel"). Dropped: the Thai koi spelt one way
(one seat, unsure which; each half is its page's own name), Vietnamese "Cá thả đầu tiên" (one seat; in no forum or video),
Malay "musim hujan" for "musim tengkujuh" (split), Indonesian and Malay "ikan schooling" (one seat, unsure).

Round 8 (14 Nov): Vietnamese, Indonesian and Thai held 9 with both seats; Malay 9 and 8. Held, both seats in some form: a
bare "Ikan berkumpulan" reads off, so the Malay schooling labels say "yang hidup berkumpulan" (the site's Malay pages
230.5 a million words). Dropped: Malay "berkelompok" (xAI; the site 13.6 against "berkumpulan" 589.8, the Indonesian
word, as in round 4 of the short questions), Thai "บลัดพารอท" (the page says ปลาหมอนกแก้ว), Malay "kuning" for "emas"
(Anthropic). Open, one seat: Indonesian and Malay "tahan air dingin/sejuk" read as waterproof (xAI); Indonesian and
Malay cold themes naming "ikan" twice (Anthropic).

Round 9 (14 Nov): Vietnamese, Indonesian and Thai held 9 with both seats; Malay 9 and 8. xAI's Malay finding reversed its
own round-7 rewrite ("Ikan angel koi"), asking now for the page's title; held on the rule that a label names a fish as
its page does ("Koi angelfish"). Held, one seat over two rounds and the dictionary: Indonesian and Malay "tahan air"
reads as waterproof, so the cold shelf says "tahan dingin" / "tahan sejuk". Open, one seat each: Thai "ปลาฝูง" as one
school (xAI), the Thai flowerhorn label against its page (Anthropic; the Writing Lead's names change renames the page).

Round 10 (14 Nov): both seats held 9 in all four languages. Raised by both and left for later: the Vietnamese
corydoras-and-plecos shelf naming the otocinclus too, whose spelling the pages ("cá oto", 1.5 a million words) and the
style guide and references ("cá otto": forum 2.0, shop blogs 47.1) don't agree on. Dropped: Malay "berkumpulan" without
"hidup" (xAI, reversing round 8's change both seats asked for).

## Vietnamese

Rounds 1 and 2 (2026-11-07) had the Anthropic seat alone, and weren't tallied.

A finding is **held** when the references bear it out (the flagged words far rarer there than on the site, the
replacement used), or when both are rare and two seats raised it; **dropped** when hobbyists use the flagged words as
often as the site, or the name it offers isn't one they use; **open** when one seat raised it and both are rare.
Findings about a sentence's shape, which no count can settle, aren't tallied.

| Seat | Rounds | Findings | Held | Dropped | Open | Judges it well |
|---|---|---|---|---|---|---|
| Anthropic (`claude-opus-5-5`) | 3–11 | 117 | 80 | 18 | 19 | yes, but check every name it offers |
| OpenAI (`gpt-5.6-sol`) | 3–8 | 41 | 31 | 4 | 6 | yes |
| OpenAI (`gpt-6.1-sol`) | | | | | | not yet: a new model, so `gpt-5.6-sol`'s record doesn't carry over; its natural score is listed, not held to the bar, until it has two rounds behind it |
| Google (`gemini-4-argon`) | 3–8 | 72 | 58 | 9 | 5 | yes, but check every name it offers |
| xAI (`grok-4.7`) | 3–11 | 91 | 62 | 12 | 17 | yes, but check every name it offers |

Of the findings the check settled, every seat's held three times in four or better over six rounds (nine for
Anthropic and xAI). Where Anthropic, Google and xAI went wrong, it was mostly a name: a fish or a term they offered that
no hobbyist writes. A name a seat offers is checked in the references before it goes anywhere.

The app's switch back to the old look (2026-11-08, six rounds, the Anthropic and xAI seats; OpenAI and Google out on the
Cursor plan's limit) isn't tallied: its findings were about clarity beside the light/dark row, which no count settles,
and the references have none of an app's settings words ("giao diện cũ" 0). One held for a reason neither seat gave:
both called "bố cục cũ" bookish, but the guides from hobbyists' videos use it, 27 times a million words, for a tank's
old layout, so in this app it would read as the tank's.

Round 3 (2026-11-07), what was dropped:
- Google: "cho thuốc" → "đánh thuốc" (the forum writes "cho thuốc" 33 times a million words, more than the site);
  "đi kèm" (48 in the videos); "cá trực thăng mỏ neo" for the anchor catfish (in neither reference).
- xAI: "cá hút rêu Thái" for the Siamese algae eater, which it said the site uses (it doesn't, and neither reference
  does: hobbyists say "cá bút chì"); "ốc sừng" for Clithon (in neither reference); "đi kèm".

Round 4 (2026-11-07), what was dropped:
- Anthropic: "cá bình tích" for molly (the forum says "molly" three times as often); "có tiếng là" for "nổi tiếng là"
  (rarer in the references than what it replaces); "cá bạch vân" for the white cloud, first counted as held (the
  owner locked "cá kim tơ", and the references' "bạch vân" is a street and a disease).
- Google: "rễ gió" for the roots on a stem (in neither reference).
- xAI: "cá bạch vân" for the white cloud, as Anthropic, first counted as held.

Round 5 (2026-11-07), what was dropped:
- Anthropic: "cây đứng" for a plant that stops growing (in neither reference); "giữ con" and "hồ sơ" (the forum writes them
  as often as the site).
- Google: "trùn huyết" or "sâu đỏ" for "trùng huyết" (the forum writes all three about as often); "cá hồng đào" for the
  cherry barb (1.3 in the forum, 0 in the videos).
- xAI: "yếm khí" (78 in the shop blogs), "bị ảnh hưởng", "tác dụng phụ", "vì vậy nên" (the references write them as
  often as the site, or more).

Round 6 (2026-11-08), the facts-first writer. Three guides and the angelfish paragraph. What was dropped:
- Anthropic: "X thì Y" as a tic (guides 13–23% of sentences; forum 19%, videos 29%).
- OpenAI: "Buce" for "Bucep" (every "buce" in the references is "bucep").
- Google: "hên xui" in a warning about gill burns (the finding held, the offered words didn't).
- xAI: "việc đầu tiên" as an English frame (9 in the references).

Held by the references: "gỡ tay" (0; "gỡ bằng tay" 4), "viên phân nền" (0; "phân nhét" 19), "cá ram" (0; "phượng hoàng"
37), "ngâm phòng" (0; "ngâm thuốc" 102), "máy tạo dòng" (0; "thổi luồng" 14). "Vẫn ăn thuốc": both uses in the forum mean
feeding a fish a drug. "Bị bỏng do pH" stays open.

The packets left out the market table, which is the writer's second source. OpenAI and xAI, which didn't look for it, marked
the oxy già dose and the salt table as invented, and their faithful scores of 3–4 rest on that; those findings are dropped
from the guides, not from the seats' record, since the fault was the packet's. A writer's packet carries its table from
round 7.

Round 7 (2026-11-08), the same three guides written again, the packets now with their market table. What was dropped:
- Anthropic: "X thì Y" again, on the same counts as round 6.
- Google: "Vẫn nên có." as a robotic fragment (Anthropic and xAI both quote it as the human part of the guide).

Open: "Để thuốc nằm yên", "thuốc không ngấm vào được" (xAI); "nước an toàn" (OpenAI); a table's sentence on melting plants (Anthropic).

Round 8 (2026-11-08), the mending writer. Scores, lowest of four: blue-green algae 8, 7.5, 9, 7; quarantine 7, 6.5, 8, 7;
shopping list 8, 7, 8, 7 (Anthropic, OpenAI, Google, xAI). What was dropped:
- Anthropic: "tép đỏ" for "tép cherry" (15 in the references, against 0); "X thì Y" again.
- OpenAI: "rất sợ" (16 in the references); "cục sủi" for "đầu sủi" (33 against 6); "miếng mút" (Anthropic and xAI quote
  that sentence as the human part).
- Google: rounding the salt doses' 7,6 and 11,4 lít, which a dose may not be.

Held by the references: "gom cặn" (0), "ổ cắm nối" (0), "trị phòng" (3, against "phòng bệnh" 64). Open: "xáo mặt nước"
(xAI), "mùi rất riêng" (OpenAI), the bracketed "(Vallisneria)".

Round 9 (2026-11-08), voice A, the owner's pick: a keeper talking to another, warm and direct, and readable in every
region. The same three guides written again. OpenAI and Google sat out: the owner's Cursor plan reached its monthly
limit (it resets on 16 Nov). The packets again lacked the market table; both seats found it (xAI in the writer's note,
Anthropic in `market.ts`), so no finding rests on that. Scores, lowest of four: blue-green algae 7.5, 8; quarantine 7, 6;
shopping list 7.5, 7 (Anthropic, xAI).

The region: both seats keep "chả" out (Northern in speech; in the South it first means food), and Anthropic makes
"không" the plain "not": the three guides wrote "chẳng" 1,700 to 2,800 times a million words, the forum 539. Held as
one region's (a seat that judges Vietnamese well, and the neutral word as common in the references or more): "xổ giun"
(1.3 in the forum; "tẩy giun" 2.6), "ăn hiếp" (4.6; "bắt nạt" 9.9), "thấy liền" (1.3; "thấy ngay" 5.3), "thả qua", and
"hồ cá" on a page that says "bể". Kept: "sình bụng" (130 in the forum; "chướng bụng" 2), "muối hột", "muỗng canh".

Held by the references: "cá ram" (0; the ram's own page says "cá phượng hoàng"), "quả sủi" (2.6; "cục sủi" 18),
"nền trồng cây" (0; "phân nền" 24), "rải ra" (0; "chia ra" 22), "được cho là" (3.3, against the species pages' 147).
Both seats: "yêu cầu khác", "và/hoặc", "đúng phần ứng với". What was dropped:
- xAI: "hơn nữa" (99 in the forum); "người cho đẻ" (0, against "trại cá" 128).
- Anthropic: "có dịp" (93 in the forum); "bị ảnh hưởng", as in round 6; "khuôn" (10 in the forum, as on the site).

Open: "biết quang hợp", "bùn mốc", "hai vòi", "gầy nhom" (xAI); "trị diện rộng", "dáng lùn", "dứt" (Anthropic).
"Đa dạng" is five times the forum's rate on the site (Anthropic): for the next pass over the list.

Not the writer's doing: the facts step dropped "Maracyn Two", the wrong medicine the source warns about and the one
sold here, and hardened "a lot of times" into "a fungal infection means an open wound" (Anthropic). The quarantine
source tells readers to treat new fish that look healthy (xAI); the writer's rule on a hard-to-find product's schedule
leaves that out, and the chief decides it.

Round 10 (2026-11-08), the same three guides after round 9's fixes, the packets now with the facts and the market
table. OpenAI and Google still out on the Cursor limit. Scores, lowest of four: blue-green algae 8, 8; quarantine 7.5,
8; shopping list 7, 8 (Anthropic, xAI). Round 9's regional words were gone from all three; "coi bảng" (xAI) was the one
left, and the style guide now says "coi" for "xem" is one region's while "coi như" isn't.

Both seats: "người ta mô tả … là" (1.3 in the forum against the species pages' 34; "nghe nói" 138), "xao động" (0.7),
"ngửi lại", "trị rộng" (as round 9's "trị diện rộng"), "chỗ bắt đầu" (0; "tham khảo" 192), "rất dễ chết với nó",
"chấp nhận rủi ro" (0). Held by the references, one seat: "bể trồng cây", "đèn trồng cây" (0.7; "bể thủy sinh" 28, 841
in the videos), "dựng bể" (0; "set bể"), "sửa gốc" (0; "tận gốc" 4), "vì vậy đừng" (0), all Anthropic. Dropped:
"nhắc lại" (Anthropic; 18 in the forum). Open: "thay nước dày", "ăn đèn", "không nói được", "thừa dịp", "hàng" for a
table's row, "phân nước tổng hợp" (Anthropic); "bông than" (xAI). "Gầy rộc": xAI offered it in round 9 as the neutral
word, Anthropic calls it Northern now, and neither reference has it: open.

Both seats found the summary and a section's first line firmer than the facts ("thường do", "cá nào cũng chịu", "dễ
nhận nhất", "thì nó mới không quay lại"). Anthropic found the salt table's "không dùng muối biển" next to "muối hột",
which a Vietnamese reader takes for sea salt; the source means marine-tank salt.

Round 11 (2026-11-08), the same three guides written again after the facts step kept its hedges, the Maracyn 2 warning
reached the writer, preventive treatment became one way by each label, and a note that could harm fish began to hold a
guide (#869). The engine kept none of the three: quarantine for a hardened "can", algae for a safety claim that reads
as true of any shop product, the shopping list as a kit. Scores, lowest of four: blue-green algae 7, 6; quarantine 7,
6; shopping list 7, 7 (Anthropic, xAI). Faithfulness set every score: with the facts in the packet, both seats found the
"can"s the hedge check missed ("cũng yếu dần", "xử nốt phần chưa trị: tẩy giun", "cũng bị hại theo"), so the
reviewer is now handed the hedged facts by the code rather than left to find them. On the same three texts it then found
6 hardened sentences in quarantine (5 before, "xử nốt phần chưa trị: tẩy giun" among the new) and 4 in algae (1
before). Three of algae's were list items under "Nước có thể bị đọng trong mấy trường hợp sau:", whose lead-in carries
the hedge, so an item now takes its list's lead-in's hedge.

Held by the references, both seats: "kém chịu kháng sinh" (0), "bỏng pH" (0; the replacement is open: "sốc pH" 1.3 is
another harm, "bỏng da" 1.3), "gầy rộc" (0 in either reference, the species pages' 14; "gầy" 37), and "ăn đèn" (0;
"chiếu đèn" 16), which Anthropic left open in round 10. One seat: "gần như không" (4 in the forum against the pages'
142 to 168; "hầu như không" 18.5, "ít khi" 28) and "việc đầu tiên là" (0; "đầu tiên là" 129 in the videos), both xAI;
"dây hơi" (0; "dây oxy" 7.9) and "người cho đẻ" (0; "ép đẻ" 30), both Anthropic. The five not already on the list are
on it now. Dropped: "có dịp" (both; 93 in the forum, as in round 9), "căng thẳng" (Anthropic; 65 in the forum against
"bị stress" 21), "không bị ảnh hưởng", as in round 6, and "nhớt xanh" (Anthropic; 30 in the videos). Open: "đúng từng
chữ", "đi kèm" (Anthropic); "cuống" for "hoảng", "ngấm" (xAI).

Both seats: the safety claim placed beside "Ở tiệm có bán…", which the engine had already held; the plain "or" written
"một thứ hoặc cả hai", now the rule only for the facts' "and/or"; and the shopping list's merged tanks (two lids, the
1.2 m tanks' heaters and filters), which stays held as a kit. Anthropic found the prompt's own words in the prose ("theo
nhãn của chính thuốc đó", "mỗi thuốc theo liều và lịch trên nhãn của nó"), and the market table's house line on new
fish brought into the shopping list, whose facts never take it up: the writer now writes "Liều và lịch theo nhãn.", the
house line is a note, not a sentence, and it's written only where the facts take up that topic.

## Altum's water paragraph, one voice (Vietnamese, 2026-11-10)

One paragraph, read five rounds, the bar 9 from three seats. OpenAI is Sol, its natural score listed and not held to the
bar until two rounds behind it; Google sits out (Cursor refuses its model).

| Round | Anthropic | OpenAI | xAI |
| --- | --- | --- | --- |
| 1 | 7 | 8 | 6 |
| 2 | 8 | 8.5 | 8 |
| 3 | 8 | 9 | 9 |
| 4 | 8 | 9 (natural 8.5) | 8 |
| 5 | 9 | 9 | 9 |

Held by the references: "cứng vừa" for "cứng trung bình" (OpenAI, xAI; forum 2.0 and 2.6 a million words, the pages' 13.7
and 1.9), "khó mà sống khỏe" for "không khỏe chút nào" ("khó mà" 25, "sống khỏe" 23 in the forum; Anthropic's "yếu hẳn"
under 1). Both rare, two seats: "pH nước cần" (0), now one sentence with the temperature. Open, under no bar: "thường khó mà"
and "nuôi bình thường" for "nếu không cho cá đẻ" (Anthropic); "bắt buộc phải" (xAI; forum 7, the pages' 103).
