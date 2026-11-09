# The editors' record

How well each seat of the editors (`.claude/skills/editors/SKILL.md`) judges what reads natural, per language: its
naturalness findings, and how many the corpus check held (the phrase is far rarer in hobbyists' own writing than on
the site, and hobbyists use the replacement). A seat that judges a language well has most of its findings held over two
rounds or more; the skill's "Weighing the seats" says what that changes.

## To read again with all four seats, after 16 Nov 2026

Until 16 Nov the editors sit with Anthropic and xAI only (the owner, 2026-11-08). What first shipped on those two-editor
scores, to be read again by all four:
- the app's card copy: the calendar's themes, shelf titles and story cards (`content/curation.json`);
- the first two Hôm nay cards, medaka and climbing perch (`content/cards`);
- the chat screen's new Vietnamese strings, read in the Design Lead's rounds (`docs/design/chat.md`, "Editors");
- the guide writer's voice A (prompts from rounds 9 to 11), on the three sample guides: blue-green algae, quarantine, shopping list.
- the privacy page's Hỏi AquaTome section in all five languages, with its lines in the retention and account-deletion lists (`apps/site/src/pages/chinh-sach-bao-mat/index.astro`).
- the chat's first lines, in all four languages, once their prompt is fixed (`OPENING_SYSTEM`, `apps/site/worker/chat/agent.ts`).

## The chat's first lines (2026-11-10)

One round on 75 lines, with the Anthropic and xAI seats only; OpenAI and Google were out on the Cursor limit. These aren't
in the tallies below, which count pages. Scores, lowest of four (Anthropic, xAI): Vietnamese 7, 6; Indonesian 7, 5; Malay
4, 4; Thai 6, 4.
- **Vietnamese, held by the references:** "cẩm nang mục" (0 in the site and the references), "kinh phí" for "ngân sách"
  (forum 24.4 against 4.6), "bỏ không" for "bỏ trống" (videos 14.8 against 0), and "tần suất" for a heater or a filter (forum
  0.7, site 7 to 11). "Cường độ ánh sáng" is 2.0 in the forum against 26 in the guides. Both seats raised each of these.
- **Vietnamese, dropped:** "tình trạng" (both seats; forum 117, site 118). Open: "đánh CO2" for "đưa CO2" (Anthropic; both rare).
- **Indonesian, Thai and Malay** have no hobbyist corpus. A finding held when both seats raised it: 9 Indonesian lines,
  15 Malay and 10 Thai. Open: whether a Thai line needs "เรา" (Anthropic says yes, xAI says it's normal Thai), and the
  chat's "ครับ" and "ค่ะ".
- **The packet's fault:** xAI marked a fish as added on five lines where the reader asked from that fish's page or a
  photo. The packet didn't show that. A packet for these lines carries where the question was asked from.

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

