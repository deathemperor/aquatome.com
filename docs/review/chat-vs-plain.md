# The chat against plain Claude, on hard problems

2026-11-08, `packages/engine/scripts/chat-vs-plain.ts`. 48 questions (all of them) from public Vietnamese hobby forums, reworded with no names (`packages/engine/scripts/hard-questions.vi.json`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and limits at commit `d247e3daf`, claude-haiku-5-5, over https://aquatome.com's handbook. Plain: claude-haiku-5-5, the same effort, no system prompt, no tools, no handbook. Judge: claude-opus-5-5 through the Claude CLI, rubric version 2 (`chat-vs-plain-lib.ts`).

- **post:** both answer the whole forum post. **tank:** both get a short question. The eval saves the post's tank for the reader (size, fish, plants, substrate, age; the light, CO₂ and fertiliser as the tank's notes), and ours sees only what the chat's code reads of a saved tank; plain Claude sees only the question. The judge is told everything the post said about the tank.
- **Blind, as far as it goes:** the judge isn't told which answer is ours, and both lose the site's name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.
- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.
- **Failed:** when one side failed (ours: the limits ran out, a call timed out) and the other answered, that reader got an error: the other side wins it on every count, with no score. A failed answer is kept in the cache, so a rerun is the same run; `--retry-failed` asks again.
- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).
- **Cost** per question, at list price: ours $0.0041, plain $0.0012. The judge runs on the owner's Claude accounts.

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post | 12 / 33 / 3 of 48 | 5.6 · 6.4 | 14–23 | 11–25 | 9–30 | 13–13 | 14–13 | 45/48 | 9 / 39 / 0 |
| tank | 32 / 14 / 2 of 48 | 5.9 · 4.8 | 25–11 | 29–2 | 34–12 | 16–11 | 23–6 | 46/48 | 15 / 33 / 0 |

## Time

- **post:** 48 turns, 0 failed. The turn: median 17.5 s, 90th percentile 21.0 s. The call that wrote the answer: median 10.5 s (90th 14.8 s), 2138 tokens out, with 20.1 s left for it. A reading call: median 2.0 s (90th 3.0 s).
- **tank:** 48 turns, 0 failed. The turn: median 15.8 s, 90th percentile 18.5 s. The call that wrote the answer: median 8.9 s (90th 12.0 s), 1807 tokens out, with 20.0 s left for it. A reading call: median 1.8 s (90th 2.6 s).

## By problem

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post · algae | 4 / 7 / 1 of 12 | 6.0 · 6.3 | 5–4 | 4–6 | 3–7 | 6–2 | 4–2 | 11/12 | 1 / 11 / 0 |
| post · setup | 0 / 9 / 0 of 9 | 4.6 · 7.2 | 1–5 | 0–9 | 0–9 | 0–3 | 1–4 | 9/9 | 1 / 8 / 0 |
| post · cycling | 2 / 5 / 1 of 8 | 5.8 · 6.3 | 2–3 | 1–4 | 1–3 | 2–1 | 3–2 | 7/8 | 3 / 5 / 0 |
| post · sick | 3 / 5 / 1 of 9 | 6.0 · 6.3 | 3–4 | 3–2 | 2–5 | 3–1 | 3–2 | 8/9 | 1 / 8 / 0 |
| post · stocking | 3 / 7 / 0 of 10 | 5.3 · 6.2 | 3–7 | 3–4 | 3–6 | 2–6 | 3–3 | 10/10 | 3 / 7 / 0 |
| tank · algae | 10 / 2 / 0 of 12 | 6.1 · 4.7 | 6–2 | 8–0 | 9–3 | 6–1 | 9–0 | 12/12 | 4 / 8 / 0 |
| tank · setup | 4 / 5 / 0 of 9 | 5.4 · 4.6 | 4–4 | 4–2 | 4–4 | 3–3 | 3–1 | 9/9 | 0 / 9 / 0 |
| tank · cycling | 5 / 3 / 0 of 8 | 5.6 · 5.1 | 4–2 | 4–0 | 5–3 | 1–2 | 3–2 | 8/8 | 4 / 4 / 0 |
| tank · sick | 4 / 3 / 2 of 9 | 6.1 · 5.4 | 3–2 | 3–0 | 7–1 | 1–3 | 4–1 | 7/9 | 3 / 6 / 0 |
| tank · stocking | 9 / 1 / 0 of 10 | 6.2 · 4.3 | 8–1 | 10–0 | 9–1 | 5–2 | 4–2 | 10/10 | 4 / 6 / 0 |

## What each lacks, as the judge tagged it

| | Ours | Plain |
| --- | --- | --- |
| post | tank-fit 35, figures 30, diagnosis 18, too-thin 13, wrong 11, local 10, plan 9, follow-up 7, off-topic 1 | too-long 34, tank-fit 15, wrong 13, local 12, follow-up 9, diagnosis 8, figures 4, asks-only 1, plan 1 |
| tank | figures 35, tank-fit 31, diagnosis 21, local 8, plan 7, wrong 6, too-thin 5, follow-up 3, off-topic 1 | tank-fit 47, too-long 32, diagnosis 14, follow-up 11, plan 11, asks-only 11, local 10, wrong 7, unsafe 1, figures 1, off-topic 1 |

Tags: plan, diagnosis, tank-fit, figures, follow-up, local, too-thin, too-long, asks-only, wrong, unsafe, off-topic.

## Errors the judge found

- ours, algae-01 post: "nếu chỉ thị chuyển xanh, CO2 đang thiếu" – drop checker màu xanh lá là CO2 đủ; xanh dương mới là thiếu
- ours, algae-01 post: Bảo tạm ngưng hết phân nước trong khi NMC đang trắng lá do thiếu dinh dưỡng có thể làm cây yếu thêm
- ours, algae-01 post: Không bảo ngưng dùng thuốc diệt rêu dù bạn này đang châm mỗi lần thay nước, 2 ngày một lần, ở bể mới set
- ours, algae-01 post: 'nếu chỉ thị chuyển xanh, CO2 đang thiếu' – this is backwards: a green drop checker means CO₂ is about right, and blue means CO₂ is low
- ours, algae-01 post: 'Tăng CO2 (bơm hoặc viên sủi)' – CO₂ tablets give very little CO₂, so they won't fix hair algae
- ours, algae-01 post: Says to keep using the algae remover at the label dose, without warning that it can damage Bucephalandra and hairgrass in a new tank
- ours, algae-01 post: Says 20 cm and 7 hours of light are not a cause, and never suggests lowering the light, though the tank most likely has no CO₂
- plain, algae-01 post: Chia đèn thành 2 đợt (4h + 2h) không được chứng minh là giảm rêu, có khi còn kích rêu, nên đây chỉ là gợi ý phụ
- plain, algae-01 post: 'thả ốc Nerite... để ăn rêu' – Nerite snails eat film algae and do little against hair algae
- ours, algae-01 tank: "Chỉnh đèn xuống tổng 8–10 tiếng": the tank runs 7h now, so this adds light while there is already algae, and Flat One at 20cm is strong for bucep and nmc
- ours, algae-01 tank: "thay 30–50% nước mỗi ba ngày": they already change 30% every 2 days, so this asks for less, not more
- ours, algae-01 tank: "Đừng cắt tỉa trong hai tuần đầu": the tank is already 2 weeks old
- ours, algae-01 tank: "thiếu CO2 là nguyên nhân hay gặp nhất" plus drop checker: the setup shows no CO₂ system, and it skips the much likelier cause, strong light over slow-growing plants
- ours, algae-01 tank: "Chỉnh đèn xuống tổng 8–10 tiếng" — they're at 7h now, so this actually raises the light for slow, low-light bucep/nmc under a Flat One hung 20cm above the water. That feeds hair algae.
- ours, algae-01 tank: "thiếu CO2 là nguyên nhân hay gặp nhất" + drop checker — this doesn't fit a tank with no CO2 being injected, and it misses the light and new fertiliser as causes
- ours, algae-01 tank: "Đừng cắt tỉa trong hai tuần đầu" — the tank is already 2 weeks old, and cutting leaves covered in algae is fine
- ours, algae-01 tank: "bắt chúng ra… để tránh chúng ăn cây" — Amano shrimp rarely eat healthy plants
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": in Vietnam 'cá rìu' is the hatchetfish, not the SAE (usually called cá bút chì)
- plain, algae-01 tank: "Thay 30–50% nước mỗi tuần": they already change water far more often than this, so it doesn't fit their tank
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater" — in Vietnam, cá rìu means hatchetfish, not SAE (usually called cá bú/cá dọn bể), which may lead them to buy the wrong fish
- plain, algae-01 tank: "Thay 30–50% nước mỗi tuần" — they already change 30% every 2 days, so this is generic advice that doesn't apply
- ours, algae-02 post: Assumes the tank has no CO₂ ('bể không châm CO2') when the hobbyist never said so, then tells them to 'kiểm tra lại CO2', which contradicts that assumption.
- ours, algae-02 post: Assumes the tank has no CO₂ ("bể không châm CO2") though the hobbyist never said so
- ours, algae-02 post: Meta remark "Cẩm nang chưa có trang riêng..." adds nothing for the reader
- plain, algae-02 post: 'rau ngổ' as a floating plant: rau ngổ (Limnophila) is a rooted stem plant, not a floater.
- plain, algae-02 post: 'dòng C series' is a vague product reference that looks made up.
- plain, algae-02 post: "rau ngổ" listed as a floating plant: it's a stem plant, not a proper floating plant for blocking light
- plain, algae-02 post: "CO₂ dao động" given as a cause even though CO₂ use is unknown
- plain, algae-02 tank: "cá Siamese (cá cày Xiêm)": this isn't a name used in Vietnam. Hobbyists here call the Siamese algae eater cá bút chì or cá ăn rêu.
- plain, algae-02 tank: "tôm Amano" is offered as a BBA eater, but Amano shrimp hardly touch black beard algae.
- plain, algae-02 tank: It asks for "loại đèn" even though the tank already uses a Chihiros A601 plus. The question shows it didn't use the tank's details.
- ours, algae-03 post: Says to cut back on feeding, but a tank set up 3 days ago likely has no fish yet, so this advice doesn't fit; it also says nothing about having swapped out the filter floss
- ours, algae-03 post: Recommends cutting water changes to 20–30% a week. A new planted tank on aquasoil usually needs frequent water changes in its first weeks to pull out the leached ammonia and nutrients.
- ours, algae-03 post: Mentions moving fish to a spare tank in a 3-day-old tank that may have no fish yet. This is generic advice that doesn't fit their setup.
- plain, algae-03 post: Suggests the Odyssea light might be a UV unit and says to 'run both bulbs continuously'. The Odyssea dual is a lighting fixture, so this advice is confusing and could raise light levels
- plain, algae-03 post: Asks what 'trân châu ngọc trai' is, even though it is a well-known aquarium plant in Vietnam
- plain, algae-03 post: Says 'Giảm xuống 4 tiếng và bỏ 1 bóng làm tảo dễ quay lại', which contradicts the right step the hobbyist already took
- plain, algae-03 post: Treats the Odyssea dual as possibly a UV sterilizer and says to run both tubes continuously. It is a planted-tank lighting fixture, so following this would make the green water worse.
- plain, algae-03 post: Asks whether 'trân châu ngọc trai' is a plant, which shows it doesn't recognise a common carpet plant and ignores the planted-tank setup.
- plain, algae-03 post: Blames the bloom on leftover food and fish waste in a 3-day-old planted tank and skips the likely cause: nutrients leaching from new substrate (aquasoil).
- ours, algae-03 tank: "thay khoảng một phần lớn nước" is vague and doesn't say how much
- ours, algae-03 tank: "thay khoảng một phần lớn nước": vague and awkwardly worded, with no %
- ours, algae-03 tank: "bật đèn không quá 6 đến 8 giờ": ignores that they already run 4h, and a 7-day blackout is hard on a newly planted trân châu carpet
- plain, algae-03 tank: Suggesting rau muống nước for a planted carpet tank doesn't fit an aquascape
- plain, algae-03 tank: Saying big water changes slow the cycle misses that new soil leaches ammonia, and in a new planted tank frequent water changes are usually the right call
- plain, algae-03 tank: "chỉ bật 6-8 tiếng/ngày": this is longer than the 4h a day they already run, so it would bring the bloom back
- plain, algae-03 tank: "rau muống nước, bèo" as fast plants: rau muống is not a sensible aquarium plant to add, and floating plants would shade their trân châu carpet
- plain, algae-03 tank: "thay quá nhiều nước có thể làm chậm quá trình này": the nitrifying bacteria live in the filter and substrate, so this is mostly a myth
- plain, algae-04 post: "Thay nước 30% mỗi ngày... làm hệ vi sinh chưa kịp ổn định": vi sinh sống trong lọc và nền, không ở trong nước. Thay nước nhiều trong tuần đầu với phân nền (aquasoil) giúp hạ amoniac, nên giảm xuống mỗi tuần 1 lần ngay từ tuần 1 là việc rủi ro.
- plain, algae-04 post: "nước máy ở Việt Nam thường có hàm lượng silicate khá cao": nói chung chung cho cả nước, không có nguồn; mức silicate khác nhau theo vùng và nguồn nước.
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển": luận cứ yếu và hầu như không liên quan với khí hậu nóng ở Việt Nam.
- plain, algae-04 post: "thay liên tục làm hệ vi sinh chưa kịp ổn định" — vi sinh sống chủ yếu trong lọc và nền, thay nước gần như không ảnh hưởng đến chúng; thay nước nhiều trong vài tuần đầu là cách làm phổ biến ở hồ Hà Lan/high-tech
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển" — không liên quan với khí hậu nóng ở Việt Nam
- plain, algae-04 post: "nước máy ở Việt Nam thường có silicate khá cao" — nói chung chung, không có nguồn
- plain, algae-04 tank: "dùng bộ lọc than hoạt tính ... khử silicat": than hoạt tính không lọc được silicat, chỉ resin chuyên dụng mới khử được
- plain, algae-04 tank: "Thay 20-30% mỗi tuần": với bể thủy sinh mới có CO₂ và phân, bạn ấy đang thay 30% mỗi ngày; giảm xuống mức mỗi tuần một lần thì tảo dễ bùng thêm
- plain, algae-04 tank: Phần cho cá ăn ít lại và hỏi lại bể mấy lít, có cây không là không trúng: app đã có sẵn thông tin bể, mà bể mới một tuần thường chưa thả cá
- plain, algae-04 tank: "bộ lọc than hoạt tính ... khử silicat": than hoạt tính không lọc được silicat, chỉ resin chuyên dụng mới khử được
- plain, algae-04 tank: "Ốc Trochus": đây là ốc biển, không sống được trong bể nước ngọt
- plain, algae-04 tank: "Cá chuột Otocinclus": ở Việt Nam cá chuột là Corydoras, Otocinclus gọi là cá otto
- plain, algae-04 tank: "Thay 20-30% mỗi tuần": bỏ qua việc họ đang thay 30% mỗi ngày, và hỏi lại bể mấy lít, có cây không, trong khi app đã có sẵn các thông tin này
- ours, algae-05 post: "Giảm đèn bể xuống khoảng 2 đến 3 tiếng mỗi ngày": far too little light for a planted Dutch tank whose plants are growing well. It would stunt the stem plants, and diatoms don't need that drastic a cut.
- ours, algae-05 post: Never says that the slimy green growth is cyanobacteria (vi khuẩn lam), and never tells them that weak room light at night is only a minor factor.
- ours, algae-05 post: "Giảm đèn bể xuống khoảng 2 đến 3 tiếng mỗi ngày": quá mạnh tay với bể Hà Lan đang lên cây tốt, cây thân dài dễ bị còi và rụng lá; tảo cát vốn tự hết khi bể ổn định
- ours, algae-05 post: Đề xuất rắc Erythromycin khi chưa thử tắt đèn hay tăng dòng chảy: kháng sinh có thể ảnh hưởng vi sinh của bể mới 1 tháng
- ours, algae-05 post: "cẩm nang chưa nói về ánh sáng phòng": để lộ chuyện nội bộ của trợ lý, không giúp gì cho người đọc
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": a guess. The plant itself doesn't add nutrients to the water.
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": đoán mò, không có căn cứ rằng cây tiền cảnh gây dư dinh dưỡng
- plain, algae-05 post: "Ốc mới thả thường nằm im": người hỏi không nói ốc mới thả, đây là giả định
- ours, algae-05 tank: "Không dùng thuốc diệt tảo... nếu cần dùng erythromycin" tự mâu thuẫn: vừa bảo không dùng thuốc vừa gợi ý dùng
- ours, algae-05 tank: Contradicts itself: says not to use algae killer, then says to follow the manufacturer's directions if using erythromycin.
- plain, algae-05 tank: Gợi ý thêm ốc nerite trong khi bể đã có nerita, còn chuyện ốc nằm im không bò thì không nhắc tới
- plain, algae-05 tank: "cá chùy (cá ăn tảo Siamese)" và "cá tỳ hưu (Otocinclus)" là tên gọi lạ, không phải tên giới chơi ở Việt Nam hay dùng
- plain, algae-05 tank: Khuyên giảm đèn xuống 6–8h trong khi bể đang chạy 8h, bỏ sót nguồn sáng thật là đèn trong nhà hắt vào buổi tối
- plain, algae-05 tank: 'cá tỳ hưu (Otocinclus), cá chùy (cá ăn tảo Siamese)': these are not the names used in Vietnam. Otocinclus is called cá otto/chuột otto, and the Siamese algae eater is cá bút chì.
- plain, algae-05 tank: Tells the hobbyist to get nerite snails, which they already keep, and doesn't notice that their nerites are lying still and not moving.
- plain, algae-05 tank: Tells them to cut light to 6–8 h/day when they already run 8 h. It misses the indoor room light that shines on the tank every evening.
- ours, algae-06 post: "chưa nên gắn thêm cánh quạt hay vòi phun": this reads 'trộn cánh quạt' as an ordinary flow nozzle, not the impeller CO₂ mixer the hobbyist meant, and never says gas is building up inside the canister
- ours, algae-06 post: Khuyên chưa gắn cả vòi phun lẫn cánh quạt ở đầu out mà không nói rõ lý do cụ thể. Cũng không giải thích túi khí đọng trong lọc (cần xả khí lọc)
- plain, algae-06 post: "Vàng-xanh lá nhẹ là khoảng 20-30 mg/L": the colours are mixed up. Plain green is about 30 mg/L and yellow-green is already high
- plain, algae-06 post: "Tăng dần, mỗi lần khoảng 1 giọt, chờ 2-3 ngày": the hobbyist already gives too much CO₂ and needs to cut down, so advice on raising it is the wrong direction
- plain, algae-06 post: "rêu sừng hươu và rêu lông tơ thường kém bền khi bị loại bỏ thủ công": this sentence is garbled and doesn't say anything clear
- plain, algae-06 post: Nói drop checker 'vàng-xanh lá nhẹ là khoảng 20-30 mg/L' là sai: màu xanh lá chanh mới là khoảng 30 mg/L, còn ngả vàng nghĩa là CO2 đã quá cao
- plain, algae-06 post: Hiểu 'cánh quạt trộn' ở đầu out thành bộ chỉnh dòng nên khuyên dùng spray bar. Thật ra hỏi về bộ trộn bọt CO2 kiểu cánh quạt
- plain, algae-06 post: Tắt CO2 cùng lúc với đèn. Thường nên tắt CO2 sớm hơn đèn khoảng 1 giờ
- ours, algae-06 tank: "Cắt phân nước xuống mức tối thiểu" — với bể có châm CO2, cắt phân thường làm rêu tóc/sừng hươu nặng hơn, vì cây thiếu dinh dưỡng; cách này không chắc chắn đúng
- ours, algae-06 tank: "tăng CO2 từ từ" misses the real problem: at 6-7 bubbles per second in a 96 L tank, the filter gurgling and big bubbles at the outlet show the CO₂ isn't dissolving. Fix how it dissolves before adding more.
- ours, algae-06 tank: "Cắt phân nước xuống mức tối thiểu" can starve the plants in a CO₂ tank and make the algae worse.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3" — sai; để đạt khoảng 30 ppm CO2, pH thường phải giảm khoảng 1 đơn vị
- plain, algae-06 tank: "cá tỳ bà (ăn rêu lông tơ và rêu tóc)" — cá tỳ bà gần như không ăn rêu tóc
- plain, algae-06 tank: "khuấy nước tốt để CO2 ... không thoát ra ngoài" — mâu thuẫn, vì khuấy mặt nước mạnh lại làm CO2 thoát ra
- plain, algae-06 tank: Hỏi lại kích thước bể và có CO2 hay chưa, trong khi app đã có sẵn các thông tin này
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3" is wrong: about 30 ppm CO₂ needs a pH drop of roughly 1.0 unit.
- plain, algae-06 tank: "cá tỳ bà (ăn rêu lông tơ và rêu tóc)" is wrong: plecos don't really eat hair algae, and they're a poor choice for a shrimp tank.
- plain, algae-06 tank: "rau muống nước" is an odd suggestion for a fast-growing plant in a planted tank.
- plain, algae-06 tank: It asks whether the tank has CO₂ and how big it is, when the tank already runs CO₂ at 6-7 bubbles per second.
- ours, algae-07 post: "Nền công nghiệp thường hết dưỡng sau vài tháng": too vague, and it doesn't really answer the lifespan question the hobbyist asked
- ours, algae-07 post: Leaves out GH/Ca-Mg and KH/pH swings, a likely cause of twisted, white, deformed tips given the soft tap water in Vietnam and the daily 100% water changes
- ours, algae-07 post: "Nền công nghiệp thường hết dưỡng sau vài tháng": this understates how long it lasts. Aqua soils usually keep releasing nutrients for about 6–12 months or more.
- ours, algae-07 post: Same narrow diagnosis: blames only nutrients washed out by water changes and misses Ca/GH and ammonia from the rich soil.
- plain, algae-07 post: Lists "Fluval Stratum" as an inert substrate with no nutrients: it's actually an aqua soil that has some nutrients and lowers KH
- plain, algae-07 post: Doesn't point out that twisted, deformed tips also commonly come from low Ca/GH; it only asks for a GH test and doesn't explain why
- plain, algae-07 post: Calls Fluval Stratum an inert, nutrient-free substrate like gravel. It is actually a light nutrient soil.
- plain, algae-07 post: Blames the deformities mainly on daily water changes washing out nutrients, without mentioning calcium/boron deficiency from low GH (common in soft Vietnamese tap water) or ammonia released by rich mixed soil.
- ours, algae-07 tank: "chuyển sang thay khoảng 20 đến 30% mỗi tuần": nền giàu dưỡng mới còn nhả amoni mạnh, nên giảm dần (ví dụ 30–50%, 2–3 lần/tuần trong tháng đầu). Cắt đột ngột xuống mỗi tuần một lần dễ làm rêu bùng thêm
- ours, algae-07 tank: Bỏ qua nền giàu dưỡng không rõ công thức (nhả amoni, dư dưỡng) là thủ phạm chính hay gặp khi thất bại liên tiếp. Lại đổ cho dinh dưỡng trong nước "không theo kịp" trong khi nền đang giàu dưỡng
- ours, algae-07 tank: Bỏ qua nền giàu dưỡng mới set, vốn hay nhả amoni và gây rêu; lại cho rằng nguyên nhân là dinh dưỡng trong nước "không theo kịp", có thể chẩn đoán sai hướng
- ours, algae-07 tank: "nếu bọt quá dày thì giảm bớt": nói mơ hồ, không rõ ý
- plain, algae-07 tank: Gợi ý thả "ốc táo": loài này ăn cây thủy sinh non, không hợp bể trồng cây Hà Lan
- plain, algae-07 tank: Gợi ý thả "cá tỳ bà": cá lớn nhanh, xới nền và làm hại lá, không hợp bể thủy sinh
- plain, algae-07 tank: Hỏi lại về đèn, CO₂ và hỏi bể là ao hay hồ ngoài trời, trong khi những thông tin này đã có sẵn
- plain, algae-07 tank: "Ốc táo: ăn rêu xanh": ốc táo (ốc bươu vàng) ăn cả cây thủy sinh, nên thả vào bể cây Hà Lan là sai
- plain, algae-07 tank: "cá chuột (cá sọc ngựa): ăn rêu đáy": cá sọc ngựa là zebra danio, không phải cá ăn rêu
- plain, algae-07 tank: Hỏi lại về đèn, CO₂, ao ngoài trời trong khi app đã có sẵn thông tin bể; khuyên trồng bèo tây trong bể thủy sinh là không hợp
- ours, algae-08 post: "Nếu một trong hai trên 0, đừng thay 50% nữa": khi ammonia/nitrite đang cao, thay nhiều nước (cùng nhiệt độ, đã khử clo) vẫn an toàn và còn có lợi; lý do bớt thay ở đây chưa đúng
- ours, algae-08 post: "hút thức ăn thừa dưới nền": bể không trải nền; lỗi nhỏ
- ours, algae-08 post: Ghi "sửa bốn việc trên" trong khi liệt kê năm bước
- ours, algae-08 post: "Nếu một trong hai trên 0, đừng thay 50% nữa": a small caution that is debatable. With ammonia present, a large water change of the same temperature and dechlorinated actually helps.
- plain, algae-08 post: "khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ)": tính sai; hiện bể có 24 con, 9 mún là số lúc đầu
- plain, algae-08 post: "Bể xi măng non thường làm pH tăng": ở Việt Nam 'bể đúc' là bể kính/nhựa đúc liền khối, không phải bể xi măng
- plain, algae-08 post: "bèo tây": quá to so với bể 50cm
- plain, algae-08 post: "Đây là lỗi lớn nhất" (lọc tắt bật) nhưng lại gọi mật độ cá là nguyên nhân chính, tự mâu thuẫn
- plain, algae-08 post: "Có thể do bể đúc mới. Bể xi măng non...": in Vietnam "bể đúc" means a seamless molded glass tank, not a cement tank, so the pH-from-cement advice doesn't apply here.
- plain, algae-08 post: "khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ)": it adds the old 9 mún to the current stock. The tank now holds 24 fish.
- plain, algae-08 post: Says the on-off filter is "lỗi lớn nhất" (the biggest mistake) right under a heading that names overstocking and overfeeding as the main cause, so it contradicts itself.
- plain, algae-08 post: Suggests bèo tây (water hyacinth) for a 50cm tank. It's too big for a tank that size.
- ours, algae-08 tank: "tảo silic, hay gặp khi bể nhiều sáng": tảo silic thường gặp ở bể mới (bể này mới 8 tuần) và bể thiếu sáng, không phải bể dư sáng. X cũng không nói bể mới là nguyên nhân chính của tảo nâu.
- ours, algae-08 tank: "tảo silic hay gặp khi bể nhiều sáng": tảo nâu thường gắn với bể mới chạy, nhiều silicat và ánh sáng yếu, không phải với bể nhiều sáng.
- ours, algae-08 tank: "chuyển cá sang bể tạm" khi che tối: không cần làm vậy, vì có thể che tối cả bể mà vẫn để cá trong bể.
- plain, algae-08 tank: "Đừng thay nước quá ít": ngược với tình trạng của người hỏi, họ đang thay gần 100% mỗi tuần, tức là thay quá nhiều chứ không phải quá ít.
- plain, algae-08 tank: Gợi ý nuôi ốc nhồi và ốc táo để ăn tảo: hai loài này ăn cả cây, sẽ phá 2 cây ráy. Cory cũng không phải cá ăn tảo.
- plain, algae-08 tank: Hỏi lại cỡ bể, loài cá, cây và giờ đèn: app đã có sẵn các thông tin này.
- plain, algae-08 tank: "nếu nước máy có nitrate/phosphate cao, hãy để nước lắng": để nước lắng chỉ giúp bay bớt clo, không làm giảm nitrate hay phosphate.
- plain, algae-08 tank: "Đừng thay nước quá ít": người này đang thay gần 100% nước mỗi tuần, nên lời khuyên này ngược với tình trạng thật của họ.
- plain, algae-08 tank: Gợi ý ốc táo/ốc nhồi để ăn tảo: các loại ốc này có thể ăn cả cây, và cory/otocinclus không hợp với một bể đúc nhỏ không có nền.
- ours, algae-09 tank: "Bật đèn không quá 6–8 giờ mỗi ngày": bể dùng nắng ban công, không có đèn, nên lời khuyên này lệch; việc cần làm là che nắng.
- ours, algae-09 tank: "Bật sủi khí và lọc liên tục": bể đã có sẵn sục khí và lọc tuần hoàn, nên bước này không thêm gì mới.
- ours, algae-09 tank: 'Bật đèn không quá 6–8 giờ' doesn't fit this tank: it sits outdoors in natural sunlight and has no lamp to switch off, so shading is the only real way to cut light.
- plain, algae-09 tank: Đổ lỗi chính cho chu trình nitơ bị phá vỡ do vệ sinh lọc, trong khi nguyên nhân rõ nhất là nắng trực tiếp ngoài ban công và bể không có cây.
- plain, algae-09 tank: "ốc nerite, cá otto": chúng ăn tảo bám, không ăn tảo phù du làm nước xanh.
- plain, algae-09 tank: "dương xỉ java" được xếp vào cây tăng trưởng nhanh, nhưng loài này mọc rất chậm.
- plain, algae-09 tank: Puts the main blame on a broken nitrogen cycle from cleaning the filter. That doesn't fit a tank that stayed clear for 2-3 months and gets direct sun on a balcony with no plants.
- plain, algae-09 tank: 'dương xỉ java' is listed as a fast-growing plant, but java fern grows slowly and won't compete well with algae for nutrients.
- ours, algae-10 post: "handbook nói" / "kiểm tra bằng công cụ tank-mates": these point to internal sources the hobbyist can't see or use, so they read as filler
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo is the apple snail, a different snail that also eats plants
- plain, algae-10 post: "Cá nhớt Siamese (cá chét đuôi đỏ)": wrong Vietnamese name. The Siamese algae eater is not called that here, and it barely eats brown diatoms
- plain, algae-10 post: "rêu hornwort": hornwort is a stem plant (rong đuôi chồn), not a moss or algae
- plain, algae-10 post: "Cá tỳ bà (bristlenose pleco)": in Vietnam, tỳ bà usually means the common pleco, which grows large
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo là ốc bươu vàng/apple snail, không phải nerite, và nó còn ăn cây thủy sinh
- plain, algae-10 post: "rêu hornwort": hornwort là cây rong đuôi chồn, không phải rêu
- plain, algae-10 post: "cá chét đuôi đỏ" cho Siamese algae eater: sai tên, ở VN gọi là cá bút chì
- plain, algae-10 post: "Cá lau kính (Otocinclus)": ở VN cá lau kính thường là pleco lớn, còn otto gọi là cá otto
- plain, algae-10 post: Bảo chấm H2O2 nhưng không nói liều dùng
- ours, algae-10 tank: "Chờ bể chạy khoảng 5–7 ngày rồi mới thả tép": không liên quan đến bể đang có cá thần tiên, và 5–7 ngày là quá ngắn so với bể mới
- ours, algae-10 tank: "ngâm bịch tép khoảng 10 phút": quá ngắn, tép cần thuần nước (nhỏ giọt) lâu hơn nhiều
- ours, algae-10 tank: Thả tép lúc tắt đèn và thêm chỗ trốn không cứu được tép trước cá thần tiên, vì chúng vẫn săn tép
- ours, algae-10 tank: "Thả tép vào lúc đèn tắt": angelfish still hunt shrimp in the dark, so releasing them at night won't stop the shrimp being eaten.
- ours, algae-10 tank: "Chờ bể chạy khoảng 5–7 ngày rồi mới thả tép": this doesn't fit an established tank, and a week isn't enough for a new tank to be stable either.
- ours, algae-10 tank: It still pushes adding shrimp to a tank with angelfish, which the hobbyist has already tried and failed.
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus" và "cá hút nhớt (Bristlenose)": nhập nhằng tên gọi, otto không phải cá tỳ bà, còn cá hút nhớt thường chỉ cá bám đá Trung Quốc, không phải Bristlenose
- plain, algae-10 tank: Hỏi lại đang nuôi cá gì trong khi app đã có thông tin cá thần tiên, và không nói rõ thần tiên chính là loại cichlid ăn tép
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus" treats two different fish as one: in Vietnam, "tỳ bà" usually means the big common pleco, not the otto.
- plain, algae-10 tank: "nhiều loại không đẻ trứng trong nước ngọt": Nerite snails do lay eggs in fresh water. The eggs just don't hatch.
- plain, algae-10 tank: Suggests H₂O₂ but gives no dose (only "liều thấp").
- plain, algae-11 post: 'chất khử ghi rõ khử chloramine, ví dụ sản phẩm có chứa sodium thiosulfate': thiosulfate alone breaks chloramine but leaves the ammonia behind, so it is a poor example of a chloramine treatment.
- plain, algae-11 post: Gives "sản phẩm có chứa sodium thiosulfate" as an example of a chloramine remover. Plain thiosulfate breaks the chloramine bond but leaves the ammonia behind, so it is a poor example of a chloramine treatment.
- ours, algae-11 tank: Gợi ý hỏi tiếp 'Cá tỳ bà leopard': hồ sơ chỉ ghi 'cá dọn bể', còn 'leopard' là chi tiết tự bịa ra
- ours, algae-11 tank: Suggested question says 'cá tỳ bà leopard', which assumes a variety the hobbyist never named
- ours, setup-01 post: "không cần chạy cứng 24/24": nghe như có thể rút điện sưởi. Sưởi có rơ-le nhiệt nên cứ cắm 24/24, nhất là khi Hà Nội đang lạnh.
- ours, setup-01 post: Bỏ dở câu hỏi đầu: không nói được cách của bên setup (bật đèn liên tục 3 ngày đầu) sai ở chỗ nào, chỉ bảo "hỏi lại họ".
- ours, setup-01 post: "không cần chạy cứng 24/24": câu này dễ gây hiểu nhầm. Sưởi có rơ-le nhiệt thì vẫn cắm điện 24/24 để nó tự ngắt; người mới có thể hiểu sai là phải rút điện.
- plain, setup-01 post: "Không thay nhiều" trong 3–6 tuần đầu: bể cây dùng phân nền thường nhả amoniac, ở VN người ta hay thay nhiều nước trong tuần đầu, nên khuyên vậy chưa hợp với bể thủy sinh có cây.
- plain, setup-01 post: Ước 150–200kg là hơi thấp: bể 1m khoảng 200L nước, cộng kính và nền thì dễ quá 200kg.
- plain, setup-01 post: "Không thay nhiều, vì làm mất vi sinh vật có lợi": vi sinh sống chủ yếu trên vật liệu lọc chứ không phải trong nước. Bể thủy sinh mới có phân nền nhả amoniac thì vẫn cần thay nước nhiều trong tuần đầu.
- plain, setup-01 post: "khoảng 150–200kg": bể 1m khoảng 200 lít, tính cả nền và kính thì thường trên 200kg, nên con số này hơi thấp.
- ours, setup-01 tank: 'cây sủi bọt khoảng hai tiếng rưỡi sau khi bật đèn là bình thường': a made-up, overly precise figure. Pearling depends on light, CO₂ and how mature the tank is.
- ours, setup-01 tank: The excerpt describes setting up a canister filter with UV and a Milwaukee regulator, but this person has no space for a canister filter, so it doesn't apply to them.
- ours, setup-01 tank: "cây sủi bọt khoảng hai tiếng rưỡi sau khi bật đèn là bình thường" – con số chính xác kiểu bịa, sủi bọt phụ thuộc đèn, CO2 và cây
- ours, setup-01 tank: Đoạn trích về điều áp Milwaukee và lọc thùng nối UV không hợp với người không có chỗ đặt lọc ngoài và chưa có CO2
- plain, setup-01 tank: It lists 'lá vàng' (yellow leaves) as a sign of low CO₂. Yellowing usually comes from missing nutrients (N, Fe), so this is a misleading diagnosis.
- ours, setup-02 post: Đọc nhầm 'trân châu ngọc trai' và 'la hán' thành tên cá. Trong danh sách cây cho bố cục bonsai thì đây là tên cây thủy sinh, nên phần cảnh báo cá La Hán (Flowerhorn) to 30 cm là lạc đề.
- ours, setup-02 post: Không nói gì tới nền Gex, cũng không gợi ý dòng đèn hay lọc nào cụ thể, chỉ khuyên chung chung, trong khi người hỏi đang cần biết nên mua loại nào.
- ours, setup-02 post: Bể mới set mà khuyên chiếu 8–10 tiếng/ngày là hơi dài, dễ lên tảo.
- ours, setup-02 post: Hiểu nhầm La Hán là cá Flowerhorn và trân châu ngọc trai là cá, trong khi bạn ấy đang liệt kê cây cho bố cục bonsai
- ours, setup-02 post: "8 đến 10 tiếng mỗi ngày": quá dài cho hồ mới set, dễ lên rêu hại
- plain, setup-02 post: Bảo Twinstar 'giá mềm hơn' Chihiros là sai: Twinstar thường đắt hơn.
- plain, setup-02 post: Eheim 2211 hơi yếu so với bể 96 lít.
- plain, setup-02 post: Câu cuối lại hiểu 'la hán' là cá cichlid, nhưng chỉ là câu có điều kiện nên không ảnh hưởng nhiều.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar thường đắt ngang hoặc hơn Chihiros, không phải lựa chọn rẻ hơn
- plain, setup-02 post: "Eheim 2211": lọc này quá nhỏ cho hồ khoảng 96 lít
- plain, setup-02 post: "Nếu bạn định nuôi cá la hán (cichlid)": ở đây la hán là cây trong danh sách cây, không phải cá
- plain, setup-02 post: "Chihiros C 60": dòng C là đèn kẹp cho hồ nano, không hợp hồ 60cm
- ours, setup-02 tank: "cường độ vừa phải vì rêu, la hán và ráy đều chịu bóng": this leaves out trân châu ngọc trai, the one plant on their list that needs stronger light to spread as a carpet. A dim light will make it grow leggy.
- plain, setup-02 tank: "0,5–1 W/lít": the watts-per-litre rule is outdated for LEDs. Light output (lumen/PAR) differs a lot between brands, so this figure doesn't reliably tell the hobbyist how bright a light is.
- plain, setup-02 tank: It asks for the tank size and plants, which the app already has, and its advice is generic instead of fitted to this 96-litre bonsai tank.
- plain, setup-02 tank: "0,5–1 W/lít": đây là quy tắc watt/lít cũ, không còn đúng với đèn LED; với bể 96 lít sẽ ra 48–96W, quá mạnh với rêu, la hán và ráy, dễ gây rêu hại
- ours, setup-03 post: "tuần đầu thay khoảng 30% nước mỗi ngày": thay nhiều nước mỗi ngày khi bể chưa có cá thì không cần, lại làm chậm chu trình nitơ
- ours, setup-03 post: Bàn về ngân sách 15 triệu rồi nói 3-4 triệu là "dưới mức cẩm nang đề xuất": làm người chơi nản, trong khi 3-4 triệu đủ dựng một bể low-tech nhỏ
- ours, setup-03 post: Gợi ý sưởi Dennerle 50 W mà không nói rằng khí hậu nóng ở Việt Nam thường không cần sưởi
- ours, setup-03 post: Gợi ý sưởi Dennerle 50 W cho cá nhiệt đới. Ở Việt Nam nước quanh năm đủ ấm nên phần lớn không cần sưởi, mà loại này đắt so với ngân sách 3-4 triệu.
- plain, setup-03 post: "Có thể dùng cá Otocinclus để dọn rêu tảo": Oto cần bể đã chạy lâu, có sẵn tảo bám. Thả vào bể mới dễ chết đói.
- plain, setup-03 post: Bảo chạy bể 3-4 tuần chờ amoniac và nitrit về 0 nhưng không nói phải cho nguồn amoniac vào (thức ăn, phân cá). Không có nguồn amoniac thì chu trình nitơ không chạy.
- ours, setup-03 tank: "bắt đầu bằng một bể nano hoặc bể nhỏ khoảng 40-60 lít": người hỏi đã có sẵn bể, không cần chọn bể mới
- ours, setup-03 tank: "thả nhóm dọn bể như cá otto... trước": otto cần bể đã ổn định, có sẵn rêu và màng sinh học, thả đầu tiên vào bể mới 2-3 tuần dễ bị chết đói
- ours, setup-03 tank: "bắt đầu bằng một bể nano hoặc bể nhỏ khoảng 40-60 lít": the hobbyist already has a tank, so advice on which tank to pick does not apply.
- ours, setup-03 tank: Putting cá otto into a 2-3 week old tank before the schooling fish: otto need mature algae and biofilm, so they often starve or die in a new tank.
- plain, setup-03 tank: "Lọc treo thành bể hoặc lọc hộp kiểu HOB": HOB là lọc treo, không phải lọc hộp, nên bị nhầm hai loại
- plain, setup-03 tank: "Trân châu" được xếp vào cây dễ: trân châu (cuba, ngưu mao chiên) thường cần CO₂ và đèn mạnh, không hợp người mới
- plain, setup-03 tank: "crystal red": tép crystal cần nước mềm, mát, khó nuôi trong cái nóng ở Việt Nam, không phải tép dọn bể cho người mới
- plain, setup-03 tank: "Trân châu" listed as an easy beginner plant: it is a carpet plant that needs strong light and CO₂, and usually fails in a basic tank without CO₂.
- plain, setup-03 tank: "lọc hộp kiểu HOB": a HOB filter is a lọc treo (hang-on-back), not a lọc hộp (canister filter). This mixes up two filter types.
- plain, setup-03 tank: Crystal red shrimp suggested for a beginner: they need soft, stable water, which Vietnamese tap water does not give, so they are hard for a beginner to keep.
- ours, setup-04 post: "dùng lớp nền mỏng hoặc sỏi mịn để rêu mini... dễ trải và bám": rêu mini fiss nên buộc lên đá Tiger, không trải trên sỏi nền, nếu không sẽ bị bẩn và bong ra
- ours, setup-04 post: Hỏi lượng nền thì Y nói 'cẩm nang chưa ghi rõ' rồi bảo đọc bao bì. Trong khi chỉ cần một phép tính đơn giản: 60×36×4 cm ≈ 8,6 lít.
- plain, setup-04 post: 'rêu nâu hoặc bong tróc thì thường do thiếu ánh sáng hoặc cặn bẩn': ở Việt Nam, Fissidens thường nâu đi vì nước quá nóng. Câu trả lời không nhắc tới nhiệt độ hay cách làm mát (quạt).
- plain, setup-04 post: Ước tính kính + khung 15–20 kg là hơi cao với hồ 60 cm. Tổng 100–120 kg nghiêng về phía an toàn nên chấp nhận được.
- ours, setup-04 tank: "đèn không mạnh": X assumes the light is weak without being told; the hobbyist never mentioned their light
- ours, setup-04 tank: Says the light is 'không mạnh' even though the hobbyist never gave their light, so this is an assumption. It also says 'phân nền sẽ ít tác dụng', which overstates the point: root tabs can still help a stem plant like rong La Hán.
- plain, setup-04 tank: Lists Anubias among "cây có rễ" that need a rich substrate, but Anubias (ráy) is an epiphyte and its rhizome rots if buried
- plain, setup-04 tank: Its worked example uses a 60×30 cm footprint, while the real tank is 60×36
- plain, setup-04 tank: Calls Anubias a rooted plant that needs rich substrate. It is a rhizome plant that grows attached to rock or wood, and burying the rhizome makes it rot. The answer also lists Anubias as a low-light epiphyte elsewhere, so it contradicts itself.
- ours, setup-05 post: "Bóng hồng chỉ thêm màu, ít tác dụng quang hợp": bóng hồng kiểu grolux phát đỏ/xanh dương, có ích cho quang hợp chứ không chỉ để lên màu
- ours, setup-05 post: "handbook dùng đèn 90 cm cho bể 1m2": không liên quan tới bộ 4 bóng T5HO của người hỏi, đọc dễ rối
- ours, setup-05 post: "handbook dùng đèn 90 cm cho bể 1m2": this has nothing to do with their 4-tube T5HO and is confusing
- ours, setup-05 post: It never warns that 4 T5HO tubes over 300 L is strong light for moss and anubias, so moss/algae can take off without CO₂
- plain, setup-05 post: Không biết Aquafor là phân nền (aqua soil) nội địa phổ biến ở VN, lại đoán nó có thể chỉ là phụ gia
- plain, setup-05 post: Khuyên rải cát phủ lên aqua soil chỗ trồng cây đỏ: không phải cách làm thường thấy, lớp cát còn cản rễ cây cắt cắm
- plain, setup-05 post: "bóng hồng... rất có lợi": nói quá công dụng của bóng
- plain, setup-05 post: "Mình không chắc thành phần cụ thể của Aquafor": Aquafor is a well-known Vietnamese phân nền (aqua soil), and the answer should have known that
- plain, setup-05 post: "1 bóng hồng: tăng cường màu đỏ/hồng của lá cây": the pink tube mainly makes red leaves look redder; it does little to make them actually colour up
- ours, setup-05 tank: "để bể chạy vài ngày trước khi trồng cây đỏ": bể thủy sinh thường trồng cây ngay khi set nền, chờ không trồng thì dễ lên rêu hại; đây là lỗi nhỏ
- ours, setup-05 tank: "khoảng 30 lít": 120×50 at 5–6 cm comes to 30–36 L, so this is slightly low
- ours, setup-05 tank: "để bể chạy vài ngày trước khi trồng cây đỏ": planted tanks are usually planted right away to fight algae; waiting isn't necessary
- plain, setup-05 tank: Hỏi lại kích thước bể, đèn, cây dù những thông tin này đã có trong app; ví dụ tính toán lại dùng bể 60×30 thay vì bể 120×50 của bạn
- plain, setup-05 tank: Dùng mốc W/lít cho LED trong khi bạn đang dùng T5HO
- plain, setup-05 tank: "0,6-1 W/lít (đèn LED thực tế)": watts per litre is an outdated and unreliable way to judge light, and it's useless for their T5HO setup
- plain, setup-05 tank: Its worked example is for a 60×30 tank when their tank's size was already known
- ours, setup-06 post: "lớp phủ sẽ giữ phân nền": hiểu sai. Mặt tiền là vùng trống ngoài gờ đá cuội nên cát trải thẳng xuống kính, không phải phủ lên Aquafor.
- ours, setup-06 post: "0,5 đến 1 W mỗi lít": quy tắc W/lít đã lỗi thời và không giúp chọn giữa máng 2 bóng và 4 bóng.
- ours, setup-06 post: Nói đi nói lại "handbook chưa có" là chuyện nội bộ của bot, người đọc không cần biết.
- ours, setup-06 post: Lấy quy tắc W/lít để chọn đèn, cách này đã cũ và không đáng tin với LED/T5 hiện nay
- ours, setup-06 post: Không trả lời câu hỏi 2 bóng hay 4 bóng dù Odyssea là máng phổ biến ở VN
- plain, setup-06 post: "Phủ cát lên Aquafor khoảng 1–2 cm": hiểu lẫn vùng mặt tiền trống với vùng nền đã quây bằng đá cuội.
- plain, setup-06 post: "Rêu, bucep và ráy ở gần nền cần đủ sáng": đây là các cây ưa sáng yếu, nên nêu chúng ra làm lý do chọn 4 bóng là sai.
- plain, setup-06 post: "Hồ sâu 30 cm": 30 cm là chiều trước-sau của hồ, chiều cao là 36 cm.
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm": độ cao nước là 36 cm, còn 30 cm là chiều sâu từ trước ra sau
- plain, setup-06 post: "Phủ cát lên Aquafor 1–2 cm": phân nền đã được quây đá cuội, mặt tiền trống nằm trên kính trơn; rải cát đè lên phân nền thì lâu ngày cát lọt xuống lẫn vào nền
- plain, setup-06 post: Khuyên "chọn đèn LED" trong khi máng Odyssea 2/4 bóng thường là T5, chưa làm rõ điểm này
- ours, setup-06 tank: "chỉ rải lớp sạn mỏng phía trước" trên nền giàu dinh dưỡng: không có vách ngăn thì phân nền sẽ trồi lên lẫn vào sạn mặt tiền. Bể này đã quây phân nền bằng đá cuội, nên cách đúng là để sạn nằm riêng ngoài vách đá chứ không phủ lên phân nền.
- ours, setup-06 tank: Bước 3 chọn máng theo chiều rộng bể (dưới 30 cm dùng máng kẹp, 40–50 cm dùng đèn treo) là quy tắc mơ hồ, nghe như tự đặt ra, không giúp chọn giữa máng 2 bóng và 4 bóng
- plain, setup-06 tank: "cá đào bới (cichlid, cá hoàng kim...)": ở VN cá hoàng kim thường là cá kiếm/platy, không phải cichlid và không phải cá hay đào bới
- ours, setup-07 post: "Nhiều loài bống dọn bể nước ngọt như ốc vặn hoặc lau kính": ốc vặn và cá lau kính không phải là bống, câu này lẫn lộn và dễ gây hiểu nhầm.
- ours, setup-07 post: "1 lít vật liệu ngập nước cho mỗi 10 g chất thải mỗi ngày": con số lấy từ cẩm nang nhưng không áp vào bể 10 con bảy màu thì bao nhiêu, người đọc không dùng được.
- ours, setup-07 post: "Nhiều loài bống dọn bể nước ngọt như ốc vặn hoặc lau kính": ốc vặn là ốc, không phải cá bống, gộp chung như vậy dễ gây hiểu lầm.
- ours, setup-07 post: Nhắc tới "bống neon" là cá biển, chẳng liên quan gì tới bể này.
- ours, setup-07 post: "1 lít vật liệu ngập nước cho mỗi 10 g chất thải mỗi ngày": con số chính xác giả, không giúp ích gì khi chỉ nuôi 10 con bảy màu.
- plain, setup-07 post: "luộc lũa... tránh rong nâu": luộc lũa để bớt tanin làm nước ngả vàng, không liên quan đến rêu nâu.
- plain, setup-07 post: "Khoai lang... trồng ở phần đất cao để rễ không bị ngập lâu": khoai lang thả thủy sinh vẫn để rễ trong nước bình thường, lời khuyên này không cần thiết.
- plain, setup-07 post: "lưu lượng khoảng 4–5 lần thể tích mỗi giờ": con số đoán, không có thông số thật của lọc thác 8W.
- plain, setup-07 post: "ngâm... để loại bớt tanin và tránh rong nâu": tanin chỉ làm nước ngả màu trà, không gây ra rêu nâu.
- plain, setup-07 post: "8–10 giờ/ngày": bể mới setup nên để đèn 6–8 giờ để tránh rêu, sau đó mới tăng dần.
- ours, setup-07 tank: Gọi bống dọn bể là bống neon biển (pH 8,1-8,4): ở Việt Nam 'bống dọn bể' thường là cá nước ngọt ăn rêu, nên ghép thông số biển vào dễ gây hiểu nhầm, dù X có dặn xác nhận lại
- ours, setup-07 tank: 'bể 90 lít': mực nước 40 cm thì chỉ khoảng 72 lít nước
- ours, setup-07 tank: Kiểm tra số tải với 20 con trong khi người hỏi chỉ có 10 con nên con số 136% gây rối
- ours, setup-07 tank: It treats 'bống dọn bể' as the marine neon goby (pH 8.1–8.4). In Vietnam, a 'bống dọn bể' sold for freshwater tanks is usually a freshwater fish, so this likely misreads the fish. It does hedge by asking for confirmation.
- ours, setup-07 tank: It calls the tank 'bể 90 lít', but the water level is 40 cm, so it holds only about 72 L of water.
- ours, setup-07 tank: It contradicts itself: the text says 10 guppies is about right, but the tool shows 136% overloaded and the text talks about checking 20 fish the hobbyist doesn't have.
- ours, setup-08 post: "cá thần tiên vì cần bể từ khoảng 208 lít": the 208-litre figure is oddly exact and the limit is too strict. Most keepers would keep a pair in a tank around 120–150 litres if it is tall enough.
- ours, setup-08 post: "cá thần tiên vì cần bể từ khoảng 208 lít": con số bê từ chuẩn 55 gallon của Mỹ, ghi chính xác như vậy là quá mức.
- ours, setup-08 post: Lời kể kiểu 'phần kiểm tra độ dày kính mình đọc chưa hết' là thông tin nội bộ, không giúp gì cho người đọc.
- plain, setup-08 post: "Kính 5 ly là ổn, không quá mỏng": this is wrong for a 45 cm tall tank. Shops in Vietnam usually use 8 ly glass at this height, and 5 ly is borderline.
- plain, setup-08 post: "Lia thia (betta)... hoặc một cặp": a male and female betta cannot be kept together long-term.
- plain, setup-08 post: "Cá sóc (corydoras)": in Vietnam, corydoras are called cá chuột, not cá sóc.
- plain, setup-08 post: Y suggests putting in 1–2 fish to cycle the tank. A fish-in cycle puts those fish at risk.
- plain, setup-08 post: "Kính 5 ly là ổn, không quá mỏng": với bể cao 45 cm, 5 ly là mức sát giới hạn. Dân chơi thường dùng 6–8 ly, nên X trấn an quá mức.
- plain, setup-08 post: "Lia thia... nuôi chung" lại để cạnh gợi ý nuôi bảy màu: lia thia dễ cắn đuôi bảy màu.
- plain, setup-08 post: "cá bảng" không phải tên cá thông dụng ở VN (có lẽ ý là cá hà lan/platy).
- plain, setup-08 post: Nhắc 'chạy chu trình nitơ' chỉ là đề xuất chung. Neon dễ yếu khi nước nóng quá 28°C ở miền Nam, X không nhắc.
- ours, setup-08 tank: "bể khoảng 57 lít" và "bơm mini 300 lít/giờ... hơn 5 lần mỗi giờ": bể của họ 60×45×45 là khoảng 120 lít, nên 300 L/h chỉ quay vòng khoảng 2,5 lần mỗi giờ
- ours, setup-08 tank: Gọi Hemianthus và Myriophyllum là cây dễ cho người mới: trân châu (HC) cần sáng mạnh và CO2, Myriophyllum cũng không dễ
- ours, setup-08 tank: "CO2 không bắt buộc với bể nhỏ" lấy theo bể nano, trong khi bể này không phải bể nhỏ
- ours, setup-08 tank: Lấy con số bể 57 lít từ video và gợi ý bơm 300 L/h, trong khi bể thật khoảng 120 lít, nên với bể này bơm đó chỉ quay vòng khoảng 2,5 lần mỗi giờ.
- ours, setup-08 tank: Gợi ý Hemianthus và Gratiola là cây dễ để bắt đầu: Hemianthus cần CO₂ và đèn mạnh, còn Gratiola ở Việt Nam ít bán.
- plain, setup-08 tank: "Ốc Nerite không đẻ trứng trong nước ngọt": thực ra ốc vẫn đẻ trứng bám lên kính và đá, chỉ là trứng không nở
- plain, setup-08 tank: Xếp trân châu vào nhóm cây dễ và rẻ: cây này cần sáng mạnh và thường cần CO2
- plain, setup-08 tank: Ghi sưởi là "thiết yếu": ở phần lớn Việt Nam thường không cần, dải "25–300W" lại quá rộng, không giúp gì cho việc chọn
- plain, setup-08 tank: "Sưởi 25–300W... cần sưởi": ở Việt Nam nước thường đã 26–30°C quanh năm, nên người tiết kiệm phần lớn không cần sưởi (cùng lắm vài tuần lạnh ở miền Bắc). Khoảng 25–300W cũng quá rộng, không giúp gì.
- plain, setup-08 tank: Xếp Trân châu (Hemianthus) và Bucephalandra vào nhóm cây dễ, rẻ: trân châu thiếu CO₂ thì khó lên thảm, còn Bucephalandra khá đắt.
- plain, setup-08 tank: Đoán bể 60 lít, trong khi bể thật 60×45×45 cm là khoảng 120 lít, nên ước lượng đèn, lọc và chi phí đều tính thấp.
- ours, setup-09 post: "Handbook khuyên...": dẫn một nguồn mơ hồ mà không nói rõ là sách nào
- plain, setup-09 post: "Lỗ hút... cách đáy khoảng 2–3 cm": quá sát lớp nền cát, dễ hút cát vào lọc, nên đặt cao hơn mặt nền vài cm
- plain, setup-09 post: "Lỗ hút nên gần đáy bể, cách đáy khoảng 2–3 cm": khoan lỗ sát mép đáy kính vậy là dễ nứt kính, lại hút cả cát; lỗ phải cách mép xa hơn và đầu hút nên nằm trên mặt nền
- plain, setup-09 post: "cá đuôi kiếm nhỏ đàn lớn": cá đuôi kiếm không phải cá đàn nhỏ, gợi ý không hợp
- plain, setup-09 post: Kính 10–12 mm cho bể cao 35 cm là dư; thường 8 mm, đáy 10 mm là đủ
- ours, setup-09 tank: "Với bể nhỏ... lọc treo thành có thể đủ": bể 170×30×35 khoảng 178 lít gộp, không phải bể nhỏ, nên lọc treo không đủ. X còn hỏi lại kích thước dù app đã có số đo.
- ours, setup-09 tank: "Với bể nhỏ... lọc treo thành có thể đủ": this tank is about 178 litres, so the small-tank framing does not apply.
- ours, setup-09 tank: "hay rò nước" overstates the leak risk of a properly fitted canister filter.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus": ở Việt Nam tên tỳ bà thường chỉ cá lau kiếng (pleco), loài lớn và thải nhiều, không phải Otocinclus.
- plain, setup-09 tank: "cá chép mini (rasbora)": tên gọi lạ, ở Việt Nam thường gọi là cá mũi đỏ hoặc cá tam giác.
- plain, setup-09 tank: "1 cm cá trên 1 lít": quy tắc thô, dễ làm người mới thả quá đông.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus": in Vietnam, cá tỳ bà usually means the pleco, which grows big and makes a lot of waste. Treating it as the same fish as Otocinclus can mislead a buyer.
- plain, setup-09 tank: "Neon" is listed as easy, but neon tetras do poorly in Vietnam's heat and are not a low-care choice.
- ours, cycling-01 post: 'Ngừng thay nước hằng ngày… 20-30%': với nền nhiều chất mới, nền thường nhả amoniac trong 2-3 tuần đầu, nên thay nước nhiều và thường xuyên lúc này là đúng. Bảo dừng lại có thể làm amoniac tăng cao.
- ours, cycling-01 post: 'Cuốn cẩm nang chưa có mục nào…': câu nói về hệ thống, không có ích gì cho người đọc.
- ours, cycling-01 post: "Ngừng thay nước hằng ngày... 20-30% mỗi lần": với nền nhiều chất mới thì giai đoạn đầu vẫn nên thay nước nhiều, thường xuyên để xả amoniac do nền nhả ra.
- plain, cycling-01 post: 'giảm xuống 1-2 lần/tuần': với nền nhiều chất mới, giảm thay nước sớm như vậy dễ để amoniac nhả từ nền tích lại.
- plain, cycling-01 post: Hỏi lại 'neon 7 màu' như thể đó là một loài cá, trong khi người hỏi đang nói hai loài khác nhau: neon và bảy màu (guppy).
- plain, cycling-01 post: "giảm xuống 1-2 lần/tuần": nền nhiều chất mới nhả amoniac mạnh trong vài tuần đầu, nên thay nước nhiều, thường xuyên mới là cách làm chuẩn, không nên cắt bớt.
- plain, cycling-01 post: "thả 2-3 con... như tép" làm cá thử: tép nhạy với amoniac hơn cá, lại khuyên chạy chu trình có cá trên nền đang nhả amoniac thì không an toàn.
- plain, cycling-01 post: Hiểu "neon, 7 màu" thành một loài "neon 7 màu" rồi hỏi lại. Thật ra người hỏi nói hai loài: neon và cá bảy màu.
- ours, cycling-01 tank: "nếu nước nhà mềm thì cần cân nhắc" — this is worded backwards. Guppies are the ones that struggle in soft water. The point is roughly right, but the phrasing is confusing.
- plain, cycling-01 tank: "vài giọt nước rửa chén" làm nguồn amoniac: nước rửa chén chứa chất hoạt động bề mặt, độc cho vi sinh và cá. Đây là nhầm với amoniac nguyên chất.
- plain, cycling-01 tank: Hỏi lại loại nền và lọc trong khi app đã có sẵn (nền nhiều dưỡng, lọc thùng DF1300). Với nền dưỡng vốn đã nhả amoniac thì không cần thêm nguồn amoniac.
- plain, cycling-01 tank: "vài giọt nước rửa chén... làm nguồn amoniac" — dish soap isn't an ammonia source, and surfactants harm the bacteria, fish and plants. Use pure ammonia or a pinch of fish food instead.
- plain, cycling-01 tank: Asks what substrate they use, but the tank info already says it is a nutrient-rich soil substrate (nền nhiều dưỡng).
- ours, cycling-02 post: "Chuyển 3 con cá vàng còn lại sang chậu hoặc bể tạm": a fresh bowl or temporary tank has no cycle either, so moving the fish only adds stress; doing water changes in the main tank is better.
- ours, cycling-02 post: Does not answer the second half of the question (which fish to buy), and never says that goldfish and neons should not be kept together.
- ours, cycling-02 post: "Chuyển 3 con cá vàng sang chậu hoặc bể tạm": chậu tạm cũng chưa có vi sinh, nên cá còn dễ bị ngộ độc hơn. Để cá ở bể chính và thay nước thường xuyên thì tốt hơn.
- ours, cycling-02 post: Trích đoạn hướng dẫn nói về chạy chu trình có cá (fish-in), nhưng bước 4 lại bảo chạy bể 4–6 tuần rồi mới thả cá tiếp. Hai ý này ngược nhau, người đọc dễ rối.
- plain, cycling-02 post: "Cá kiếm (platy)": in Vietnam cá kiếm is the swordtail; the platy is called cá platy or cá hà lan.
- plain, cycling-02 post: "Mua máy sưởi" and betta "cần sưởi": in most of Vietnam a heater is rarely needed, except in the North in winter.
- plain, cycling-02 post: "Chạy bể trước 3-4 tuần (không thả cá)" contradicts the 3 goldfish still living in the tank.
- plain, cycling-02 post: "Cá kiếm (platy)": cá kiếm là swordtail. Platy ở Việt Nam thường gọi là cá hà lan, không phải cá kiếm.
- plain, cycling-02 post: "Neon và cá vàng đều thải nhiều chất bẩn": neon nhỏ, thải rất ít. Chỉ cá vàng mới thải nhiều.
- plain, cycling-02 post: Khuyên mua máy sưởi cho cá nhiệt đới: ở Việt Nam trời nóng quanh năm nên thường không cần sưởi, ngoài vài tháng rét ở miền Bắc.
- plain, cycling-02 post: Gợi ý thả cá chuột (corydoras) cho người mới vào bể chưa ổn định: cá chuột khá nhạy với nước bẩn, không phải loài dễ cho bể mới.
- ours, cycling-02 tank: Bước 3 'thuần nước chậm... trước khi thả' cho cá còn sống: những con cá này đã ở trong bể rồi, nên bước này không áp dụng được và làm người đọc rối.
- ours, cycling-02 tank: Nói thay nước nhưng không nhắc khử clo nước máy, trong khi ở Việt Nam đây là nguyên nhân rất phổ biến khi vừa set bể đã thả cá ngay.
- ours, cycling-02 tank: Water change only says "nước sạch cùng nhiệt độ" and never says to remove chlorine from Vietnamese tap water, which may be part of what killed the fish
- ours, cycling-02 tank: Step 3 says to acclimate the surviving fish "trước khi thả", but they are already in the tank
- plain, cycling-02 tank: 'dùng nguồn amoniac như vi sinh/amoniac tinh khiết': vi sinh không phải là nguồn amoniac, nên câu này gộp sai hai thứ khác nhau.
- plain, cycling-02 tank: "dùng nguồn amoniac như vi sinh" — vi sinh is bacteria, not an ammonia source
- plain, cycling-02 tank: Lists "bể đầy" as a cause of low oxygen, which is misleading
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": trân châu ở đây là cây trải nền (Hemianthus/Micranthemum), không phải sỏi, nên cả phần 2 về chuyện xử lý nền là đọc sai câu hỏi
- plain, cycling-03 post: "Tỳ bà bướm cần nhiều không gian và có thể ăn cây non": tỳ bà bướm ăn rêu bám, không ăn cây; cái chúng cần là dòng chảy mạnh và nước mát, khó hợp với cá trâm
- plain, cycling-03 post: Đưa bảy màu vào phần kế hoạch mới trong khi bạn không định nuôi lại bảy màu
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": trân châu ngọc trai lùn là cây trải nền, không phải sỏi, nên cả phần tư vấn về nền đều sai
- plain, cycling-03 post: "Tỳ bà bướm... có thể ăn cây non": tỳ bà bướm ăn màng rêu và biofilm, không ăn cây; điều nó thật sự cần là dòng chảy mạnh và nước mát, oxy cao
- plain, cycling-03 post: "vớt cây lùn ra khỏi nền, rửa sạch cây và nền rồi cho lại vào": gỡ cả thảm cây đang yếu ra rửa sẽ làm hồ xáo trộn thêm
- ours, cycling-03 tank: "Lật bể chỉ nên làm khi nghi hội chứng bể cũ (pH tụt dưới 6, amoniac trên 10 mg/L)": these cutoffs look made up, and old-tank syndrome is handled with gradual water changes, not by tearing the tank down.
- ours, cycling-03 tank: "phần này handbook chưa nói rõ trong các trang mình đã đọc": talk about its own sources that gets in the way of advice for a hobbyist.
- ours, cycling-03 tank: Waiting until "amoniac trên 5 mg/L" before moving the fish sets the bar far too high; bảy màu and tép are dying well below that
- ours, cycling-03 tank: Bringing up "hội chứng bể cũ" (old tank syndrome) as the reason to tear down a one-week-old tank doesn't fit this case
- ours, cycling-03 tank: "thả lại ít cá" (add a few fish back) assumes the tank is empty, but fish are still in it
- ours, cycling-03 tank: Talk about "handbook" pages is assistant meta-talk, not natural hobby Vietnamese
- plain, cycling-03 tank: "không nguy hiểm trực tiếp": the hobbyist says the white growth is already rotting the trân châu, so playing it down misses that it is feeding on dying plants.
- plain, cycling-03 tank: It asks for the fish types and how many were stocked, which the app already has, and it numbers two steps as "5.".
- plain, cycling-03 tank: "Rêu trắng... không nguy hiểm trực tiếp": the hobbyist says it is already rotting their trân châu, so the rotting patches need to be pulled out, not waited out
- plain, cycling-03 tank: "trồng cây thủy sinh nếu có thể": they already have trân châu; this ignores what they told the app
- plain, cycling-03 tank: Asks for fish species and counts that the app already holds
- plain, cycling-04 post: "neon, guppy, betta thì khoảng 5–8 con": betta đực không nuôi chung 5–8 con được, hồ cỡ này chỉ nên 1 con betta.
- ours, cycling-05 post: Không nhắc phải cho nguồn amoni khi chạy hồ không cá, nhưng lại bảo chờ amoni và nitrit về 0. Không có amoni thì hai chỉ số này về 0 ngay từ đầu, nên người chơi tưởng hồ đã chạy xong vi sinh mà thật ra chưa.
- ours, cycling-05 post: Câu 'amoni vượt 0,1 mg/L thì thay nước ngay' trong lúc hồ chưa có cá sẽ làm vi sinh thiếu thức ăn và kéo dài thời gian chạy hồ.
- ours, cycling-05 post: Câu 'giữ nhiệt độ 24–26°C' không hợp với Việt Nam: nước hồ ở đây thường 28–30°C, và vi sinh vẫn phát triển tốt ở mức này.
- ours, cycling-05 post: Không nói đến nguồn amoni khi bể chưa có cá. Không có amoni thì test amoni/nitrit 'về 0' chẳng chứng tỏ bể đã chạy xong vi sinh.
- ours, cycling-05 post: "Nếu amoni vượt 0,1 mg/L thì thay một phần nước ngay": khi chạy bể không cá, thay nước kiểu này làm vi sinh thiếu thức ăn và kéo dài thời gian chạy bể.
- ours, cycling-05 post: "giữ nhiệt độ khoảng 24–26°C": ở Việt Nam bể thường 28–30°C, khó giữ mức đó, và vi sinh nitrat hóa vẫn phát triển tốt ở nhiệt độ cao hơn.
- plain, cycling-05 post: 'Dùng nước để qua đêm' không khử được cloramin. Y có hỏi lại về cloramin nhưng vẫn đưa cách này ra như một lựa chọn.
- plain, cycling-05 post: Bảo ngâm lũa trong khi hồ đã châm đầy nước là hơi lệch so với tình trạng hiện tại của bạn ấy.
- plain, cycling-05 post: "Dùng nước đã để qua đêm": để qua đêm chỉ làm bay clo, không khử được cloramin.
- plain, cycling-05 post: "Ngâm lũa trước": bể đã châm đầy nước rồi, nên bước này đến muộn so với tình trạng hiện tại.
- ours, cycling-05 tank: "1 con nhỏ cho 38 lít": quy đổi máy móc từ 10 gallon, không phải quy tắc thả cá có cơ sở, nên trông như số bịa
- ours, cycling-05 tank: '1 con nhỏ cho 38 lít' is a converted gallon rule. It's vague and doesn't say how many fish that means for a tank of about 160 L.
- plain, cycling-05 tank: Coi cá neon là loại "chịu được biến động": neon nhạy cảm, không hợp với bể mới
- plain, cycling-05 tank: Gợi ý thả 3-5 con lia thìa: lia thìa đực phải nuôi riêng, không thả theo đàn
- plain, cycling-05 tank: Hỏi lại kích thước bể dù app đã có (80×40×50, khoảng 160 lít)
- plain, cycling-05 tank: Calls neon a hardy fish for a new tank. Neons are sensitive and shouldn't be the first fish in a freshly cycled tank.
- plain, cycling-05 tank: Asks for tank size and type even though the app already holds them (80×40×50 cm, biotope).
- ours, cycling-06 post: "Giảm đèn còn khoảng 8–12 tiếng mỗi ngày": 12 tiếng là quá dài cho bể lowtech, nhất là khi đang có vấn đề, nên đây không phải là giảm đèn mà còn dễ gây rêu hại.
- ours, cycling-06 post: "Nước thùng xốp trong vì có lọc hoặc được thay đều": bạn ấy nói rõ là chỉ thỉnh thoảng mới hút cặn và châm nước, không hề nhắc tới lọc, nên câu này giải thích sai tình trạng của bạn ấy.
- ours, cycling-06 post: "Ngưng cho ăn khoảng 7 ngày, và chỉ cho ăn ít khi bể có cá": hai ý này mâu thuẫn nhau và không nói rõ có cá trong bể thì phải làm gì.
- ours, cycling-06 post: "Giảm đèn còn khoảng 8–12 tiếng": that isn't a cut. 12 hours is too long for a new low-tech tank and invites algae.
- ours, cycling-06 post: "Nước thùng xốp trong vì có lọc hoặc được thay đều": the hobbyist said they only siphon now and then and never mentioned a filter.
- ours, cycling-06 post: "nước đó còn nhiều nitrat, phosphat": a guess stated as fact, with no test to back it.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": vi khuẩn dị dưỡng gây đục nước sống nhờ chất hữu cơ chứ không nhờ ánh sáng. Lỗi này nhỏ.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": light doesn't feed the heterotrophic bacteria that cause a white bloom, so cutting light helps with algae, not with the cloudiness.
- ours, cycling-06 tank: "ngưng cho ăn khoảng 7 ngày": đưa ra mà không giải thích lý do. Nếu bể đang nuôi cá con hay tép nhỏ thì nhịn lâu như vậy là quá dài
- plain, cycling-06 tank: "Tắt hoặc giảm đèn để hạn chế tảo": tắt đèn không giúp bloom vi khuẩn tan nhanh hơn, và với bể thủy sinh lowtech mới set thì việc này làm cây yếu đi.
- plain, cycling-06 tank: "ammonia tinh khiết… đạt khoảng 2-4 ppm": dạy cách chạy chu trình không cá theo kiểu nước ngoài. Ở Việt Nam khó mua amoniac tinh khiết, mà bể 8 lít đang có thể có cá thì không hợp với bước này
- ours, cycling-07 post: "Thay nước 2-3 ngày một lần không theo kịp": với phân nền mới, thay nước nhiều và thường xuyên chính là cách xả amoniac từ nền. X không nói rõ là nên thay thường xuyên trong vài tuần đầu.
- ours, cycling-07 post: Bước 4 bảo đổi sang ráy/thanh đản buộc lũa vì "không cần phân nền", trong khi hồ đã có phân nền và cây cắt cắm, nên bước này lệch với hồ của bạn.
- ours, cycling-07 post: "Thay nước 2-3 ngày một lần không theo kịp": thay dày là cách đúng để kéo amoniac từ phân nền mới xuống, nên bác lời người bán là không đúng.
- ours, cycling-07 post: Gợi ý trồng ráy, thanh đản buộc lũa vì "không cần phân nền" là không hợp, vì người hỏi đã có phân nền và cây cắt cắm.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": sai, vì vi sinh bám trên nền và bề mặt chứ không sống trong nước.
- plain, cycling-07 post: Khuyên thay 20-30% mỗi 1-2 tuần cho hồ phân nền mới set: phân nền mới nhả amoniac nhiều nên cách này dễ gây rêu và dư amoniac. Tuần đầu nên thay nước thường xuyên.
- plain, cycling-07 post: Nói rau muống nước là cây nổi: không hợp với hồ thủy sinh trong phòng ngủ.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": vi sinh lọc bám trên bề mặt (nền, cây, lũa), không trôi trong nước, nên thay nước nhiều không làm mất chúng. Đây là ngộ nhận phổ biến.
- plain, cycling-07 post: Bảo hồ phân nền mới set chỉ cần thay 20-30% mỗi 1-2 tuần: phân nền mới nhả nhiều amoniac, mấy tuần đầu thay nước dày (2-3 ngày một lần) mới là cách làm chuẩn để tránh ngộ độc và rêu bùng.
- ours, cycling-07 tank: Reads the question as 'thay nước thay cho rửa lọc' and spends steps 2–5 on cleaning a filter, but the tank has no filter at all.
- ours, cycling-07 tank: 'Cho cá ăn ít hơn khoảng 30 phần trăm' after a filter clean: there is no filter, and no fish are known in a tank running 0 weeks.
- ours, cycling-07 tank: 'Dòng nước ra yếu hơn 50%' is a made-up threshold, and it is irrelevant here.
- ours, cycling-07 tank: Assumes the tank has a filter and gives filter-cleaning steps, but the tank has no filter and no airstone
- ours, cycling-07 tank: "dòng nước ra yếu hơn 50%" and "cho ăn ít hơn khoảng 30 phần trăm" are made-up precision with no reason given
- plain, cycling-07 tank: Also assumes there is a filter to clean, and never addresses the fact that the tank has no filter or air pump.
- plain, cycling-07 tank: 'Nếu chưa có cá, không cần thay nước quá nhiều': with fresh phân nền, frequent changes in the first weeks are what keep ammonia and algae down, so this steers them away from what helps.
- plain, cycling-07 tank: Reads "thay cho lọc" as replacing filter cleaning, but the tank has no filter at all, so the filter-cleaning advice doesn't apply
- plain, cycling-07 tank: "Nếu chưa có cá, không cần thay nước quá nhiều": new phân nền releases ammonia and nutrients, so it needs frequent large water changes in the first weeks even with no fish
- ours, cycling-08 post: Says the cement walls need sealing but never warns that fresh cement makes the water very alkaline and leaches lime, or how to soak and flush it, and that's the biggest danger in this tank.
- ours, cycling-08 post: "phần này cẩm nang chưa nói tới": exposes internal source talk to the reader, which doesn't help them.
- plain, cycling-08 post: Suggests "bèo tây" (water hyacinth) for a 30-litre tank. It grows far too big for a box this size.
- plain, cycling-08 post: "Nên chọn lọc có ngăn chứa bông lọc...": they already own the Sobo waterfall filter, so advice about which filter to choose doesn't fit. It should say what media to put in that filter.
- plain, cycling-08 post: Gợi ý 'bèo tây' (lục bình) cho hồ 30 lít là không hợp: cây quá to, sẽ chiếm hết mặt nước
- plain, cycling-08 post: Gợi ý cá neon cho hồ ngoài trời nóng ở Việt Nam là chưa hợp lắm, vì neon chịu nóng kém
- ours, cycling-08 tank: "thay khoảng một phần nước": doesn't say how much water to change, so the reader can't act on it.
- ours, cycling-08 tank: Misses the 3 fresh cement sides, which leach lime and push pH up. That is a key risk before adding fish.
- ours, cycling-08 tank: "thay khoảng một phần nước" is too vague: it should give a figure, such as 30–50%.
- plain, cycling-08 tank: Asks for tank volume and filter type, which were already known (32 L, Sobo hang-on filter at 400 l/h), so it never actually says whether the filter is enough.
- plain, cycling-08 tank: Also misses the cement leaching lime and the hot rooftop.
- ours, sick-01 post: "sống khoảng 3 đến 5 năm": danio thường sống 2–3,5 năm, nên đàn 3 năm tuổi đã là cá già
- ours, sick-01 post: Bỏ sót bệnh lao cá (Mycobacterium), một nguyên nhân hàng đầu gây cong người, gầy mòn ở cá ngựa vằn, và không nhắc đeo găng tay
- ours, sick-01 post: Thẻ loài ghi 18–25 °C, thấp hơn nhiệt độ bể thường gặp ở Việt Nam, trong khi danio vẫn chịu được khoảng 26–28 °C
- ours, sick-01 post: Phần trích dẫn lấy từ cẩm nang cá đẻ con, không phải tài liệu về danio
- ours, sick-01 post: Bỏ sót lao cá (Mycobacterium), một nguyên nhân rất hay gặp gây cong người và gầy mòn ở cá ngựa vằn, và không cảnh báo bệnh này có thể lây sang người.
- ours, sick-01 post: Thẻ loài ghi bể "từ 90 cm" là hơi lớn so với nhu cầu thực của cá ngựa vằn, và mức 18–25 °C không nói gì đến cái nóng ở Việt Nam.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này": cá ngựa vằn già rất hay bị cong cột sống
- plain, sick-01 post: Lan man sang cichlid và Hexamita dù người hỏi đã nói rõ là ngựa vằn nuôi theo đàn
- plain, sick-01 post: "Columnaris... gây cong người": Columnaris thường không gây cong người
- plain, sick-01 post: Nói Columnaris gây "cong người": cong cột sống không phải dấu hiệu điển hình của Columnaris, nên liệt kê vậy dễ gây hiểu lầm.
- plain, sick-01 post: Không biết chắc đây là loài nào ("zebra danio hoặc cichlid vằn xanh"), trong khi "không đẻ nổi" và tên gọi đã cho thấy khá rõ là cá ngựa vằn.
- ours, sick-01 tank: "cong người, gầy dần": nói cá gầy dần, nhưng người hỏi không hề nói vậy
- ours, sick-01 tank: Không nhắc tới bệnh lao cá (Mycobacterium), một nguyên nhân chính gây cong cột sống ở cá ngựa vằn và có thể lây sang người. Vì vậy cũng không dặn đeo găng tay
- ours, sick-01 tank: "handbook không có cách chữa": nhắc tới tài liệu nội bộ, người đọc không hiểu handbook là gì
- ours, sick-01 tank: Bỏ sót bệnh lao cá (mycobacteriosis), nguyên nhân hàng đầu gây cong cột sống ở cá ngựa vằn, và không cảnh báo bệnh này có thể lây sang người
- ours, sick-01 tank: "handbook không có cách chữa" nhắc tới nguồn nội bộ mà người đọc không biết là gì
- plain, sick-01 tank: "Nhiễm virus Nodavirus (VNN)": rất hiếm gặp ở cá ngựa vằn nuôi cảnh, đưa vào danh sách chỉ thêm nhiễu
- plain, sick-01 tank: "Nhiễm khuẩn cấp tính... chết nhanh": không khớp với kiểu cá chết rải rác, kéo dài vài tuần lại một con
- plain, sick-01 tank: "Nodavirus (VNN)" là bệnh chủ yếu của cá biển nuôi thương phẩm, rất khó xảy ra ở bể cá ngựa vằn cảnh nên dễ gây hiểu nhầm
- plain, sick-02 post: 'bộ test nước (amoniac, nitrit, nitrat, pH) khoảng 100–200 nghìn đồng': this price looks made up. A liquid kit that tests all four usually costs a lot more in Vietnam, and at that price you mostly get test strips.
- plain, sick-02 post: Asking which species '7 màu' is: in Vietnam '7 màu' clearly means guppy, so the question is unnecessary.
- plain, sick-02 post: Its list of warning signs includes 'rụng vảy hoặc có đốm trắng'. Those point to injury or white spot (ich), not ammonia or nitrite poisoning, so they can send the reader the wrong way.
- plain, sick-02 tank: "Giảm số lượng cá hoặc tăng dung tích": bể này nuôi thưa, nên lời khuyên này lệch hướng
- plain, sick-02 tank: "Đo nhiệt độ bằng nhiệt kế để kiểm tra heater": bể này không có heater, đây là lời khuyên chung chung
- plain, sick-02 tank: "kiểm tra bằng bút thử điện": cách kiểm tra rò điện qua nước bể này không đáng tin và có thể nguy hiểm
- plain, sick-02 tank: "kiểm tra bằng bút thử điện" — a test pen won't reliably pick up a small leak in the water, so it isn't a real way to check for stray current
- ours, sick-03 post: 'tép chết lai rai thường đi cùng nhau khi nước cứng, nhiều khoáng': GH 8 is not lethal hard water for Neocaridina, so this is a weak causal link
- plain, sick-03 post: 'CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển': 12 ppm is low for a CO2-injected tank, so the test reading 'thiếu' is probably right. Blaming the kit points the hobbyist the wrong way
- plain, sick-03 post: Reads 'tầm 1-2 tuần' as a fish called 'tầm (nếu là loài nhạy cảm)', but in the question 'tầm' means 'about'
- plain, sick-03 post: 'Ráy thích nước hơi mềm và không quá nhiều dinh dưỡng trong nước' is debatable and doesn't help here
- plain, sick-03 post: "CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển": a CO2-injected planted tank needs about 20–30 ppm, so 12 ppm really is too low.
- plain, sick-03 post: "khả năng cao là kit đã hết hạn, đọc sai bảng màu": this blames the test kit, when the kit is right that CO2 is low.
- plain, sick-03 post: "Otto, pygmy và tầm (nếu là loài nhạy cảm)": X read "tầm" (meaning "about") as the name of a fish.
- ours, sick-03 tank: "TDS chỉ cho biết tổng chất rắn hòa tan, tức nước cứng hay mềm": TDS không phải là độ cứng. Nitrat, phốt phát, phân nước và muối natri cũng làm TDS tăng, nên phải đo GH riêng.
- plain, sick-03 tank: Phần nói về độ nhạy với GH/KH lấy tép Caridina (Crystal, Bee) làm ví dụ, trong khi bạn này nuôi tép màu (Neocaridina). Tép màu chịu được GH 8, KH 4 dễ dàng, nên phần này dễ làm bạn ấy hiểu sai.
- plain, sick-03 tank: Puts the focus on Caridina (Crystal, Bee, Taiwan bee), but the hobbyist keeps tép màu (Neocaridina), which handles GH 8 and KH 4 fine, so the hardness warning doesn't fit.
- ours, sick-04 post: "tảo vi sinh cùng cây rữa lá" – người hỏi không hề nhắc đến tảo, chi tiết này là bịa ra
- ours, sick-04 post: "vết gãy có thể do ốc gặm" – trong bể không có ốc nào được nhắc đến, nên đây chỉ là suy đoán
- ours, sick-04 post: "vết gãy có thể do ốc gặm": không có ốc nào được nhắc tới, nên lý giải này không có cơ sở.
- ours, sick-04 post: "tảo vi sinh": cách gọi này mơ hồ, không khớp với chuyện người hỏi kể.
- plain, sick-04 post: "Ốc vảy (Neritina)... vết gãy trên vỏ" – vảy ốc xanh/đỏ là cây Rotala, không phải ốc Neritina. Đọc nhầm hoàn toàn
- plain, sick-04 post: "Tắt đèn vài ngày để giảm tảo" – người hỏi không nhắc đến tảo, mà tắt đèn nhiều ngày còn làm thảm trân châu và Rotala đang yếu thêm suy
- plain, sick-04 post: "Thay 40-50% nước bằng nước RO" – đổ nước RO tinh khiết vào nhiều như vậy một lần làm GH/KH đổi đột ngột, chính là kiểu sốc mà bài vừa dặn tránh
- plain, sick-04 post: Lá bàng để hạ pH gần như vô tác dụng khi đá vôi liên tục đẩy KH lên
- plain, sick-04 post: "Ốc vảy (Neritina)... Vết gãy hoặc mòn trên vỏ": vảy ốc xanh/đỏ ở đây là cây Rotala, không phải ốc Neritina. Người hỏi nói rõ lá gãy ngang ngọn nhưng vẫn xanh.
- plain, sick-04 post: "Thay 40-50% nước bằng nước RO": thay nhiều nước RO cùng lúc vào bể đang pH 8,4 và KH cao sẽ làm pH/KH tụt đột ngột, ngược với chính lời khuyên tránh sốc pH của X.
- plain, sick-04 post: "Tắt đèn vài ngày": thảm trân châu đang yếu mà tắt đèn nhiều ngày dễ rữa thêm.
- ours, sick-04 tank: "bổ sung khoáng bằng san hô vụn hoặc Wonder Shell" — bể đã có đá da voi giữ pH 8,4, thêm san hô vụn chỉ đẩy pH/KH lên thêm và làm thông số dao động nhiều hơn
- ours, sick-04 tank: "Wonder Shell/Seachem Equilibrium" to raise KH or GH: Equilibrium only adds GH, not KH, so it can't fix low KH
- plain, sick-04 tank: Khoảng pH "6,5-7,5" cho tép đặt ra quá hẹp với Neocaridina, khiến người nuôi nghĩ phải tiếp tục hạ pH 8,4, mà chính việc hạ pH đó là thứ gây chết tép
- plain, sick-04 tank: Hỏi lại loại vật liệu và loài tép trong khi ứng dụng đã có thông tin này (Neo Soft)
- ours, sick-05 post: "Màu vàng nâu có thể do tannin từ lũa": it treats the tank as having driftwood when the hobbyist never mentioned any, and it never checks CO₂ overdose, a likely cause in a tank running CO₂ where fish keep dying.
- ours, sick-05 post: The second guide excerpt (about arranging a maintenance schedule and tools) has nothing to do with the problem.
- plain, sick-05 post: "Khử clo (hoặc để qua đêm)": leaving water to stand overnight doesn't fully remove chlorine, and it doesn't remove chloramine at all. A water conditioner is safer.
- plain, sick-05 post: "Thay khoảng 20–30% mỗi tuần" is advised while ammonia or nitrite may still be high. Weekly changes are too few until the test readings are back to normal.
- plain, sick-05 post: "màu vàng khi đèn tắt là quá cao" – drop checker vàng lúc nào cũng là CO2 quá cao, không chỉ khi đèn tắt; chỗ này chỉ hơi thiếu chính xác
- ours, sick-05 tank: Không bảo giảm CO₂ hay tắt CO₂ ban đêm, dù pH tụt do KH thấp cộng với CO₂ là nghi phạm chính; đoạn trích cẩm nang về sắp xếp lịch chăm bể thì lạc đề
- ours, sick-05 tank: Đoạn trích kèm theo nói về cách sắp lịch và dụng cụ cho đỡ mệt, không liên quan tới nước vàng hay cá chết
- ours, sick-05 tank: Nhắc tới tannin của lũa dù người hỏi không nói bể có lũa
- plain, sick-05 tank: Đổ lỗi cho nước máy chưa khử clo, trong khi bạn này thay bằng nước uống đóng bình; khuyên 'Thay 30–50% nước', mà bạn ấy đã thay 50% cách ngày rồi
- plain, sick-05 tank: Nghi clo/cloramin và kim loại từ nước máy, trong khi họ thay bằng nước uống đóng bình, nên nguyên nhân này không áp dụng cho bể này
- plain, sick-05 tank: Khuyên 'Thay 30–50% nước' như bước đầu, trong khi họ đã thay 50% cách ngày và việc đó không giúp được
- ours, sick-06 post: "22–28°C" taken from the species card is too low for how arowana are usually kept in Vietnam (about 28–30°C), so the owner may think a cool tank is fine.
- ours, sick-06 post: "thay một phần nước ngay" gives no amount or how often, which matters a lot if the new tank hasn't cycled.
- ours, sick-06 post: "22–28°C" lấy từ thẻ loài là hơi thấp so với cách nuôi rồng thực tế ở Việt Nam (thường 28–30°C); dải pH 5–8 quá rộng nên không giúp được nhiều
- plain, sick-06 post: "cá nhỏ sống" is suggested as a food, but the owner already has live feeder fish the arowana won't eat, so this repeats what isn't working.
- plain, sick-06 post: "để nước qua một đêm" only removes chlorine. It doesn't work if the tap water has chloramine.
- plain, sick-06 post: "thường chỉ cần kiên nhẫn vài ngày đến một tuần" — cá đã nhịn gần 1 tuần rồi, nên câu này không giúp được gì cho tình huống hiện tại
- ours, sick-06 tank: "cá thường ăn lại sau 2–3 ngày": cá rồng thường nhịn một đến hai tuần sau khi đổi bể, nên câu này khiến người nuôi lo quá mức
- ours, sick-06 tank: "22–28°C": ở Việt Nam cá rồng thường được nuôi ở 26–30°C, mốc 22°C là quá thấp với cá rồng
- ours, sick-06 tank: "giữ nước ổn định trong khoảng 22–28°C": too cool for arowana. In Vietnam they are usually kept at 28–30°C, and warmer water helps a stressed fish start eating again.
- ours, sick-06 tank: "cá thường ăn lại sau 2–3 ngày": arowanas often refuse food for 1–2 weeks after a move, so this overstates the alarm.
- plain, sick-06 tank: "cho ăn vào buổi tối khi đèn tắt": cá rồng săn mồi trên mặt nước bằng mắt, nên tắt đèn không giúp cá ăn
- plain, sick-06 tank: Hỏi lại kích thước bể và bể đã chạy bao lâu dù app đã có thông tin bể chạy 1 tuần
- ours, sick-07 post: "1 muỗng canh cho 11,4 lít" is a US 3-gallon figure turned into metric. It reads as made-up precision and is awkward for a Vietnamese hobbyist.
- ours, sick-07 post: "nước sạch lấy từ bể chính": the main tank was just torn down and is likely cloudy and unstable, so its water is a poor choice for the quarantine tank.
- ours, sick-07 post: "1 muỗng canh cho 11,4 lít nước": con số quy đổi lệch từ đơn vị gallon của Mỹ (nhãn gốc thường ghi 1 muỗng canh cho 5 gallon, khoảng 19 lít), nghe thì chính xác nhưng thực ra là bịa, cũng không nói ra g/lít
- ours, sick-07 post: "nước sạch lấy từ bể chính": bể chính vừa lật nền, có thể đang tăng amoniac, lấy nước đó sang bể cách ly là không ổn
- ours, sick-07 post: Không trả lời câu hỏi muối hột người hỏi đang dùng có được không, chỉ nói chung chung là 'muối hồ cá mức 1'
- ours, sick-07 tank: Tells them to remove activated carbon because it absorbs medicine, but never says which antifungal to use, so the medicine step is left open
- ours, sick-07 tank: '1 muỗng canh cho 11,4 lít' is a direct conversion of the US 3-gallon rule, plus a Neosporin reference; neither is a measure Vietnamese hobbyists use, where people dose salt in grams per litre
- ours, sick-08 post: "Theo dõi đàn còn lại trong 2–3 ngày": cả 3 con otto đã chết, không còn con nào để theo dõi.
- ours, sick-08 post: "sốc và không ăn được... chỉ sau một đêm đã yếu hẳn": nhịn đói không làm cá chết chỉ sau một đêm; bước cho ăn thêm rau, viên chìm không liên quan khi cá đã chết hết.
- ours, sick-08 post: Không nhắc đến hóa chất diệt rêu, dù bạn này đang xử lý rêu hại và đó là nguyên nhân hay gặp khiến otto chết còn neon sống.
- ours, sick-08 post: "otto chết vì sốc và không ăn được": hunger can't kill a fish in one night. Starvation takes days to weeks.
- ours, sick-08 post: Y never asks about algae killers, even though the hobbyist said the tank has bad algae. That is one of the most likely causes of a sudden die-off that spares the neon.
- plain, sick-08 post: "Chết đột ngột, nằm im là dấu hiệu điển hình của độc tố": nói hơi quá chắc. Sốc nước hay thiếu oxy cũng cho triệu chứng y hệt.
- plain, sick-08 post: "Thiếu oxy vào ban đêm (khả năng cao nhất)": overstated. Otto can gulp air at the surface, and the neon in the same tank were fine, so low oxygen is unlikely to be the main cause.
- ours, sick-08 tank: "làm quen nước 4–5 tiếng": dài hơn mức cần thiết, nhỏ giọt khoảng 1–2 tiếng là đủ
- ours, sick-08 tank: Không nhắc tới thuốc diệt rêu có đồng hay clo trong nước máy, trong khi hồ đang có rêu hại nên rất có thể bạn đã dùng thuốc diệt rêu
- ours, sick-08 tank: "làm quen nước 4–5 tiếng" — far longer than needed; letting fish sit that long in shipping water lets ammonia build up. 1–2 hours of drip acclimation is enough.
- ours, sick-08 tank: Doesn't raise algae-killer or copper medication as a possible cause, even though the tank has a nuisance algae problem.
- plain, sick-08 tank: "Nuôi một hai con đơn lẻ": bạn nuôi 3 con nên ý này không đúng với bể của bạn, và stress vì ít bạn đàn không làm cá chết sau một đêm
- plain, sick-08 tank: Hỏi lại số lượng và loài cá trong khi app đã có sẵn thông tin này
- plain, sick-08 tank: "Nuôi một hai con đơn lẻ dễ bị stress" — the hobbyist had 3 otto, so this cause doesn't fit their case.
- ours, sick-09 post: Coi "thiếu oxy trong nước lạnh" là nguyên nhân nhiều khả năng nhất: nước lạnh hòa tan nhiều oxy hơn, mà bể đã có bơm tạo oxy, nên khả năng cao hơn là bể chưa chạy vi sinh (amoniac/nitrit), nhiệt độ dao động mạnh trong bể nông, hoặc cá mua về mang bệnh.
- plain, sick-09 post: "Với 6–7 con cá vừa mua/thả thì mật độ có thể đã vượt mức chịu của bể": 6–7 is how many fish died, not how many are in the tank. Also, 6–7 carp in about 1,350 L is not obviously overstocked.
- plain, sick-09 post: "cá rỉa hoa súng cho thấy cá đang đói": koi and carp eat plants even when they are well fed, so this conclusion is a stretch.
- plain, sick-09 post: "mùa lạnh nước cũng dễ thiếu oxy": nước lạnh giữ được nhiều oxy hơn, nhất là khi đã có bơm tạo oxy.
- plain, sick-09 post: "mật độ có thể đã vượt mức chịu của bể": 6–7 con chép trong khoảng 1.350 lít không phải là quá dày.
- ours, sick-09 tank: "sưởi nên có công suất khoảng 1 W cho mỗi lít nước": với hồ koi ngoài trời khoảng 1.350 L thì phải dùng sưởi khoảng 1,35 kW. Làm vậy không thực tế, mà koi chịu lạnh tốt nên cũng không cần sưởi.
- ours, sick-09 tank: "Nếu amoniac hoặc nitrit có số đo": câu này mơ hồ, không nói rõ ngưỡng bao nhiêu thì phải thay nước.
- ours, sick-09 tank: "sưởi nên có công suất khoảng 1 W cho mỗi lít nước": với bể ngoài trời khoảng 1.350 lít thì phải cỡ 1.350 W, không thực tế, mà koi cũng không cần sưởi
- ours, sick-09 tank: Không nhắc rằng vào mùa lạnh phải giảm hoặc ngừng cho koi ăn, và không nhắc nguy cơ bể xây mới còn ra vôi xi măng
- plain, sick-09 tank: "Ổn định nhiệt độ ... 24–26°C cho cá nhiệt đới" và ví dụ betta, neon, guppy: các mốc này không áp dụng cho koi và cá chép ở hồ ngoài trời. Bê nguyên lời khuyên này sang hồ koi là sai.
- plain, sick-09 tank: "Ổn định nhiệt độ... 24–26°C... bằng heater": cá koi, cá chép là cá nước lạnh, không cần sưởi lên mức cá nhiệt đới, và bể ngoài trời khoảng 1.350 lít thì sưởi như vậy không thực tế
- plain, sick-09 tank: Nói về betta, neon, guppy, tetra không liên quan gì tới bể koi ngoài trời
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": cá bảy màu hiền. Nhiều khả năng chính chúng là con mồi của cá vàng và bống, chứ không phải con đi ăn cá khác.
- plain, stocking-01 post: "nên nuôi cùng cá cỡ lớn... bể tối thiểu khoảng 200 lít": sai ngược. Bảy màu cần nuôi chung với cá nhỏ, hiền. Con số 200 lít là bịa.
- plain, stocking-01 post: "Cá vàng thích nước mát (khoảng 18–23°C)": hẹp quá mức cần thiết. Ở Việt Nam cá vàng vẫn sống được ở nhiệt độ phòng nếu nước sạch.
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ, và sẽ ăn luôn cá yếu" — cá 7 màu hiền. Ở đây nó là con bị ăn chứ không phải thủ phạm. Thủ phạm khả năng cao là cá vàng và bống.
- plain, stocking-01 post: "Nếu muốn nuôi cá 7 màu: nên nuôi cùng cá cỡ lớn... bể tối thiểu khoảng 200 lít" — sai hẳn. Cá 7 màu nuôi bể nhỏ được và nên nuôi với cá nhỏ hiền, không phải cá lớn.
- plain, stocking-01 post: Không nói cá vàng ăn cá 7 màu nhỏ, mà đây gần như chắc là lý do cá mất không thấy xác.
- plain, stocking-01 tank: Lists suspect fish the tank doesn't have (cá rô, cichlid, lia thia, cá lóc con) and misses the goldfish that is actually in it.
- plain, stocking-01 tank: "cá chùy (cá tỳ bà, cá chuột)" is confused naming: cá chùy isn't the usual name for plecos or cory catfish.
- ours, stocking-02 post: Gợi ý '10 đến 12 con neon' hơi dè dặt cho bể 96 lít chỉ có 5 mún và 5 chuột. Bể này nuôi được khoảng 20 con neon.
- ours, stocking-02 post: Trích đoạn lấy từ bài hướng dẫn cho bể không lọc. Mức 4 lít/con mún trong bài đó không hẳn áp dụng cho bể có lọc.
- ours, stocking-02 post: The quoted excerpt is from a guide for tanks without a filter, so it fits this case only loosely. The stocking math also leaves out the 5 corydoras.
- ours, stocking-02 post: Suggesting 10-12 neon is more conservative than it needs to be. A filtered tank of about 96 L can hold around 20-30 neon once it has cycled.
- plain, stocking-02 post: Không biết 'mún' là cá platy, lại đoán có thể là cá dữ như cá rô hay betta đực. Mún là cá hiền, ai chơi cá ở Việt Nam cũng biết.
- plain, stocking-02 post: Ghi nhiệt độ 22-26°C nhưng không nói gì đến chuyện nước ở Việt Nam thường nóng 28-30°C.
- plain, stocking-02 post: Doesn't know that 'mún' means platy and guesses it might be an aggressive fish like a gourami or a male betta. That is a wrong reading of a common Vietnamese hobby word, and it leaves the compatibility question unanswered.
- plain, stocking-02 post: 'Nhiệt độ khoảng 22-26°C' ignores how hot Vietnam is. Most tanks there sit at 27-30°C, and the answer gives no advice on handling that.
- ours, stocking-02 tank: Calls the mún 'platy' in the text, then says it can't confirm what mún is. That contradicts itself, since cá mún is the platy.
- ours, stocking-02 tank: 'chuột đồng cần bể dài từ 80 cm': too strict. Bronze corydoras do fine in a 60 cm tank.
- ours, stocking-02 tank: Never says the tank has only been running 1 week, which is the real reason not to add many fish at once.
- ours, stocking-02 tank: Calls mún "platy" in the stocking count but then says it isn't sure which species mún is, which contradicts itself.
- ours, stocking-02 tank: "Chuột đồng cần bể dài từ 80 cm": too strict; a group of 5 corydoras does fine in a 60 cm tank.
- ours, stocking-02 tank: Never says the tank has only run 1 week (likely not cycled yet), which is the main reason not to add many fish at once.
- plain, stocking-02 tank: Doesn't recognise 'mún' even though it's the common Vietnamese name for platy, and asks for the tank size even though it's already known.
- plain, stocking-02 tank: Says adding 40 neon is usually fine without considering that the tank is only 1 week old.
- plain, stocking-02 tank: Says it doesn't know what "mún" is, but in Vietnam cá mún is the common name for platy, a very common fish that does fine with neon.
- plain, stocking-02 tank: Asks for the tank size even though the app already has it (60×40×40), and gives a conditional "usually fine" when the real answer is that 40 at once is too many for a 1-week-old tank.
- ours, stocking-03 post: Recommends a school of 6+ black neons for a ~15 L tank, while its own species card says they need a tank of at least 80 cm and a school of 8+.
- ours, stocking-03 post: "cá cherry" is ambiguous. If it means cherry barbs, they need more room than a 15 L tank gives.
- ours, stocking-03 post: Khuyên nuôi cá neon đen theo đàn 6 con trở lên trong bể 15 lít, trong khi chính thẻ loài đi kèm ghi bể từ 80 cm và đàn từ 8 con.
- ours, stocking-03 post: Cá cherry (cherry barb) hiếu động, cần bể dài hơn 35 cm.
- ours, stocking-03 post: "Bể nhỏ đổi nước nhanh, nên thay 1 tuần một lần là hợp lý": lập luận ngược. Bể nhỏ nước dễ biến động thì càng phải để ý hơn, chứ không phải lý do để coi thay 1 tuần/lần là đủ.
- plain, stocking-03 post: Lists "cá lia thia" as a big schooling fish. Lia thia are a betta-type fighting fish, not a schooling fish.
- plain, stocking-03 post: "Tránh cá đàn lớn như neon, cá chuột, cá lia thia": lia thia không phải cá đàn. Đây là cá đá sống đơn lẻ, giống cá xiêm, nuôi 1 con trong bể 15 lít được.
- ours, stocking-03 tank: "chưa tìm được loài cá nào ... hợp với bể này": quá khắt khe, bể khoảng 15 lít vẫn nuôi được 1 betta hoặc một đàn tép, nhưng X không gợi ý loài nào cụ thể
- ours, stocking-03 tank: "Thay khoảng một phần nước" / "vài tuần": nói mơ hồ, không có con số % hay số tuần
- plain, stocking-03 tank: "cá thái lan (cá dĩa nhỏ hiền)": sai, cá thái lan không phải cá dĩa, mà cá dĩa cũng không phải cá cho người mới hay cho bể nhỏ
- plain, stocking-03 tank: Hỏi lại kích thước bể dù app đã có số đo; gợi ý cá chuột, molly, cá vàng không hợp với bể khoảng 15 lít
- plain, stocking-03 tank: "cá thái lan (cá dĩa nhỏ hiền)": cá dĩa (discus) là cá lớn và khó nuôi, không hợp với người mới hay bể nhỏ
- plain, stocking-03 tank: Lists neon and goldfish-type suggestions with the rule "2–3 lít mỗi con", which would let the reader overstock a 15 L tank with fish that need more space
- ours, stocking-04 post: Đoạn trích về đèn Rạng Đông kèm dưới câu trả lời không liên quan gì đến câu hỏi
- ours, stocking-04 post: The attached excerpt on choosing aquarium lights has nothing to do with the question
- plain, stocking-04 post: "khả năng cao cá chết không phải do bống xử": bống vàng (cá mút đá vàng, Gyrinocheilus) lớn lên hay bám vào cá chậm như bảy màu, mún, kiếm để mút nhớt. Đây là thủ phạm có khả năng cao nhất
- plain, stocking-04 post: "dễ bị bống ăn" cá nhỏ, tôm con: loài này không phải cá săn mồi. Nó hại cá vì bám mút nhớt chứ không phải vì ăn cá
- plain, stocking-04 post: Coi "không cạo rêu" là dấu hiệu nước bẩn tích tụ: bể sạch rêu là do bống ăn rêu
- plain, stocking-04 post: Treats 'bống vàng' as a generic goby. In the Vietnamese hobby it is the golden algae eater (Gyrinocheilus), which is known to suck slime off other fish once it grows
- plain, stocking-04 post: 'khả năng cao cá chết không phải do bống xử': this dismisses the most likely cause
- plain, stocking-04 post: Suggests vague or odd tankmates such as 'cá bạc má nhỏ' and 'cá thái lan nhỏ'
- ours, stocking-04 tank: "đang thay 10% mỗi tuần thì chuyển sang thay khoảng 30–40% mỗi tháng": tổng lượng nước thay vẫn như cũ hoặc ít hơn, và còn ngược với đoạn trích hướng dẫn ngay bên dưới (30% mỗi hai tuần)
- ours, stocking-04 tank: Không nghĩ tới việc bống vàng ăn rêu (thường là cá bống/chuột ăn rêu vàng) bị bỏ đói sẽ hung dữ, bám mút nhớt thân các loài bơi chậm như mún, kiếm, bảy màu. Đây có lẽ là nguyên nhân chính.
- ours, stocking-04 tank: "thay 10% mỗi tuần thì chuyển sang 30–40% mỗi tháng": thế là thay ít nước hơn chứ không nhiều hơn (10%/tuần ≈ 40%/tháng)
- ours, stocking-04 tank: Kết luận old tank syndrome khi chưa biết bể đã chạy bao lâu, và bỏ qua khả năng con bống ăn rêu (nếu là cá bống vàng loại Chinese algae eater) lớn lên sẽ rượt và gặm nhớt cá khác, nhất là khi không được cho ăn
- plain, stocking-04 tank: Gọi cá kiếm là platy và cá hồng kim là neon tetra: dịch tên sai
- plain, stocking-04 tank: Gợi ý nuôi bảy màu, kiếm, những loài đã chết trong chính bể này
- plain, stocking-04 tank: Xếp cá dĩa vào nhóm cá vừa dễ nuôi chung: sai
- plain, stocking-04 tank: Đưa ra quy tắc 1 inch/gallon: lỗi thời và không đáng tin
- plain, stocking-04 tank: Bỏ qua con bống vàng ăn rêu, có thể là thủ phạm tấn công cá
- plain, stocking-04 tank: "cá kiếm (platy)": cá kiếm là swordtail, platy là cá hà lan/platy, và X còn liệt kê đuôi kiếm riêng
- plain, stocking-04 tank: Gợi ý lại bảy màu, kiếm, là những loài đã chết dần trong bể này, mà không hỏi vì sao chúng chết
- plain, stocking-04 tank: Cho cá dĩa vào danh sách nuôi chung với guppy/tetra là gợi ý không hợp với một bể cộng đồng thông thường
- ours, stocking-05 post: "nhiệt độ ổn định khoảng 20–23°C": most home tanks in Vietnam can't be kept that cool without a chiller, and goldfish do fine at room temperature, so this step isn't practical
- ours, stocking-05 post: Says it "chưa đọc hết mục đó" and so gives no clear answer, which leaves the main question unanswered
- ours, stocking-05 post: Assumes 'cá chép' means koi, but the hobbyist may have common carp; the fish card also calls koi 'peaceful', which contradicts the explanation given
- ours, stocking-05 post: "giữ nhiệt độ ổn định khoảng 20–23°C": tanks in Vietnam can't hold this without a chiller, so it doesn't fit local conditions.
- ours, stocking-05 post: The hedge "mình chưa đọc hết mục đó nên chưa có kết luận rõ" weakens the answer, and the koi card under it says "peaceful", which contradicts the warning.
- plain, stocking-05 post: "Cá chép thường hung hăng": carp aren't really aggressive. The problems come from their bigger size and fighting for food, so this overstates it
- plain, stocking-05 post: Mixes forms of address ('em' then 'anh/chị'), which reads awkwardly
- plain, stocking-05 post: "tắm muối loãng 3-5 g/lít trong 10-15 phút": this strength suits a long bath, so a 10–15-minute dip at it does little. Harmless but weak.
- plain, stocking-05 post: "Cá chép thường hung hăng, hay rượt và cắn vây": this overstates it. Carp are pushy and boisterous and win the food more than they nip fins.
- plain, stocking-05 tank: "Cho ăn đầy đủ để cá chép bớt tranh ăn": cho ăn nhiều hơn dễ làm bẩn nước, nhất là khi vừa có cá chết, mà chưa chắc đã làm chép bớt hung
- plain, stocking-05 tank: "xanh methylen hoặc muối (liều nhẹ)": không đưa liều cụ thể nên người đọc dễ pha sai
- plain, stocking-05 tank: "Cho ăn đầy đủ để cá chép bớt tranh ăn và hung hăng hơn" – cho ăn nhiều hơn không làm cá chép bớt đuổi cá vàng, mà còn làm nước bẩn thêm, nhất là khi bể vừa có cá chết
- plain, stocking-05 tank: "muối (liều nhẹ)" – không nói liều bao nhiêu nên người đọc không làm theo được
- ours, stocking-06 post: "Cá kiếm và molly" / "molly cần nước kiềm": mún đỏ là cá platy, không phải molly, nên X đọc sai con cá người nuôi đang có.
- ours, stocking-06 post: "Thay khoảng 30–50% nước" rồi lại "đừng thay nhiều một lúc": hai lời khuyên mâu thuẫn nhau, và X không trả lời thẳng câu hỏi có cần thay nước hàng tuần không.
- ours, stocking-06 post: "Cá kiếm và molly đều đẻ con" / "molly cần nước kiềm": mún là cá platy, không phải molly, nên lời khuyên về nước đã nhầm loài
- ours, stocking-06 post: "nguyên nhân chính là cá lớn đang ăn cá bột, không phải ốc": bạn này chưa hề nói cá bột bị ăn. Câu này chẩn đoán một chuyện chưa xảy ra
- ours, stocking-06 post: Bảo thay 30–50% nước rồi ngay sau lại dặn bể mới thì đừng thay nhiều. Hai câu ngược nhau, lại không trả lời thẳng câu hỏi có cần thay nước hàng tuần không
- plain, stocking-06 post: "bèo tây": lục bình quá to so với một bể cubic nhỏ. Lỗi nhỏ.
- ours, stocking-06 tank: "chưa thấy trang riêng về 'mún'... giả định đó là cá đẻ con cùng nhóm với platy": mún is the Vietnamese name for platy, so this sounds unsure and confusing
- ours, stocking-06 tank: "bể đẻ... khoảng 40 lít": too big for a fry tank, an unneeded figure
- ours, stocking-06 tank: Doesn't know that 'mún' is the common Vietnamese name for platy. It treats mún as an unknown fish 'in the same group as platy' and wrongly says the tank has platy as a separate fish.
- ours, stocking-06 tank: 'hộp đẻ khoảng 40 lít': a hang-on breeder box is never 40 litres. The figure is confused.
- ours, stocking-06 tank: 'ngày 18–25 của thai kỳ' comes from guppy guides, and a hobbyist can rarely tell which day of pregnancy the fish is on.
- plain, stocking-06 tank: "Thường khi thấy vậy thì còn khoảng 1–2 ngày": the gravid spot can stay dark for days, so this timing is too precise
- plain, stocking-06 tank: Treats weekly 20–30% changes as routine in a new tank that smells foul and may not have finished cycling
- plain, stocking-06 tank: Says to move the mother out with no warning that moving a female who is about to give birth can make her drop dead or unready fry. This is exactly this hobbyist's situation.
- plain, stocking-06 tank: Ignores that the tank is newly set up and smells bad. It gives a routine water-change schedule without first saying to check whether the tank has cycled.
- ours, stocking-07 post: "chạch sóc đuôi đỏ thích 15–21°C": botia are tropical fish (about 24–30°C), so this range is made up and would wrongly put off a keeper in Vietnam's heat
- ours, stocking-07 post: "đủ cho... 6 con chạch" in 84 L: botia like Yasuhikotakia modesta grow large and are active, so 6 of them is far too many for a 60 cm tank
- ours, stocking-07 post: Only 10 neons with an "85%" stocking level is a made-up figure that undersells what the tank can hold
- ours, stocking-07 post: "chạch sóc đuôi đỏ thích 15–21°C": red-tailed botia-type loaches are tropical and like about 25–30°C, so this wrong figure could put the hobbyist off a mix that works.
- ours, stocking-07 post: "đủ cho khoảng 10 con neon" in 84 L: this undercounts badly; a planted 60 cm tank easily holds 20+ neon tetras.
- ours, stocking-07 post: Telling the hobbyist to reconsider the mix if the tank is above 22°C makes no sense in Vietnam's heat and rests on the wrong temperature.
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": in Vietnam Corydoras are called "cá chuột", so this guess at the species is probably wrong (though Y does ask the hobbyist to confirm)
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": in Vietnam Corydoras are called cá chuột, not sóc, so this is probably the wrong fish (it does ask the reader to confirm).
- ours, stocking-07 tank: "Giữ nhiệt độ ổn định quanh 21°C": ở Việt Nam bể thường 27–30°C, muốn giữ 21°C phải có máy làm lạnh. Lời khuyên này không thực tế, mà cũng không cảnh báo người nuôi.
- ours, stocking-07 tank: "cá vây dài hoặc bơi chậm như cá ngựa vằn": cá ngựa vằn (danio) bơi nhanh, vây ngắn, lấy làm ví dụ là sai.
- ours, stocking-07 tank: Ở Việt Nam, "sóc đỏ" nhiều khả năng là cá sóc (medaka) đỏ chứ không phải chạch. Câu trả lời có nói rõ là mình đoán loài, nhưng vẫn có thể đoán sai.
- ours, stocking-07 tank: "Giữ nhiệt độ ổn định quanh 21°C": in Vietnam's heat tanks run at 27–30°C, so this needs a chiller and isn't practical. Neon also do fine up to about 26–27°C
- ours, stocking-07 tank: Reading "sóc đỏ" as a red-tailed loach that likes 15–21°C is shaky. Hobbyists would more likely mean red medaka (cá sóc đỏ)
- plain, stocking-07 tank: Câu trả lời bỏ qua kích thước bể (60×35×40 ≈ 84 L) mà vẫn quay lại hỏi dung tích, rồi lại đưa gợi ý cho bể 60 lít.
- plain, stocking-07 tank: "10 con cho mỗi 20 lít": mật độ này quá dày, không phải quy tắc hợp lý.
- plain, stocking-07 tank: Gọi "cá sóc" là Corydoras là sai: ở Việt Nam người ta gọi Corydoras là cá chuột. Câu trả lời còn lạc đề sang tôm đỏ.
- plain, stocking-07 tank: "Cá sóc (Corydoras)": in Vietnam Corydoras are called cá chuột. "Cá sóc" usually means medaka (Oryzias), so the guess is wrong
- plain, stocking-07 tank: "10 con cho mỗi 20 lít": this stocking rule is made up and too dense
- plain, stocking-07 tank: It asks for the tank size even though the tank is known to be 60×35×40 cm
- ours, stocking-08 post: "Mình chưa tra được chùm xương cá": this is a common name used by Vietnamese hobbyists, so admitting it couldn't find it looks weak and leaves the plant question unanswered
- ours, stocking-08 post: Never mentions a filter or aeration, which is the most urgent gap in a crowded 4-litre tank
- plain, stocking-08 post: "giảm xuống 3-4 con... (neon, endler, ember)": 3–4 neon in 4 litres is still too many, since neon are schooling fish that need far more room
- plain, stocking-08 post: The mini heater advice matters little in Vietnam's heat, apart from winter in the north
- plain, stocking-08 post: "Giảm số cá xuống khoảng 3-4 con": 3–4 con vẫn là nhiều cho 4 lít, nên khuyên ít hơn nữa hoặc lên bể to
- plain, stocking-08 post: Khuyên mua máy sưởi: ở khí hậu Việt Nam thường không cần, trừ mùa đông miền Bắc
- ours, stocking-08 tank: Excerpt: '91 x 30 x 38 cm chứa khoảng 106 lít' – this works out to about 104 L, a small arithmetic slip.
- ours, stocking-08 tank: 'khoảng vài ngày một lần' – too infrequent for a 4 L tank holding 7-8 fish that has only run for 1 week (not yet cycled). It needs small water changes daily or every other day.
- plain, stocking-08 tank: Liệt kê 'cá bảy màu' là cá đàn cần đông con cùng loài: guppy không phải cá đàn bắt buộc như neon/tetra
- ours, stocking-09 post: "Bể 80 cm còn chưa đủ chỗ cho cá ông tiên... cần bể dài từ 100 cm" — quá khắt khe: bể 80×35×45 (~126 L) vẫn nuôi được một cặp ông tiên, và chiều cao 45 cm mới là điều quan trọng.
- ours, stocking-09 post: Bước 2 bảo chỉ nuôi ông tiên trong bể 80 cm, trái với chính câu trước đó nói bể này chưa đủ.
- ours, stocking-09 post: "Mức đầy bể: 84%" là con số tự đặt ra, không giải thích cách tính.
- ours, stocking-09 post: Nói bể 80 cm chưa đủ cho ông tiên nhưng lại khuyên 'bỏ neon, chỉ nuôi ông tiên' trong chính bể đó, tự mâu thuẫn
- ours, stocking-09 post: "cần bể dài từ 100 cm" là quá khắt khe: bể khoảng 126 lít, cao 45 cm vẫn nuôi được một cặp ông tiên, dân chơi vẫn nuôi phổ biến
- ours, stocking-09 post: Khuyên nuôi neon ở bể riêng là không cần thiết, vì thả neon trước rồi mới thả ông tiên con là cách người chơi vẫn làm thành công
- plain, stocking-09 post: "rêu java, trạch, mơ, cỏ nến" — tên cây viết không rõ ràng, khó hiểu với người chơi ở Việt Nam.
- plain, stocking-09 post: "Thêm cá lớn hoặc hung dữ (cichlid...)": cá ông tiên cũng là cichlid nên nói vậy dễ gây nhầm
- plain, stocking-09 post: "bổ sung thêm neon để chia đều sự chú ý": nếu ông tiên đang săn neon thì thả thêm neon chỉ là thêm mồi, không giải quyết được vấn đề
- plain, stocking-09 post: 24–27°C mà không nhắc gì đến cái nóng ở Việt Nam: mùa hè nước bể thường lên 29–31°C, neon chịu nóng kém
- ours, stocking-09 tank: "Bể 80 cm của bạn cũng chưa đủ rộng, vì cá ông tiên cần bể dài từ 100 cm trở lên": too strict. 80×35×45 cm holds about 126 L, and the 45 cm height suits angelfish. That is enough for 2 angels.
- ours, stocking-09 tank: "Không nên nuôi chung": too absolute. Angelfish with neons is a common pairing in Vietnam. There is a risk, but you can manage it by stocking the neons first, adding them while the angels are small, and feeding well.
- ours, stocking-09 tank: "Bể 80 cm của bạn cũng chưa đủ rộng, cá ông tiên cần bể dài từ 100 cm" — quá khắt khe: bể 80×35×45 (~126 L, cao 45 cm) nuôi được một cặp ông tiên
- ours, stocking-09 tank: "Không nên nuôi chung" nói tuyệt đối, trong khi ông tiên với neon là combo phổ biến, nuôi được nếu thả neon khi ông tiên còn nhỏ và có nhiều cây che
- ours, stocking-10 post: "thường phải nuôi riêng hoặc bể chỉ một loài": that rule is for keeping two male bettas together. A betta often lives fine with neons in a planted 65 L tank.
- ours, stocking-10 post: "Mức đầy bể 36%": a precise figure with no stated basis.
- ours, stocking-10 post: "bể riêng, nhỏ hơn": telling them to use a smaller tank for the betta is odd advice with no reason given.
- ours, stocking-10 post: "betta hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài": nói tuyệt đối quá; betta đực thường sống chung được với đàn neon trong bể khoảng 65 lít trồng nhiều cây, miễn là có theo dõi
- ours, stocking-10 post: "Sau khi thay đổi, hãy quan sát neon xanh": mâu thuẫn, vì chính câu trả lời đã khuyên không thả betta
- plain, stocking-10 post: "thường dùng máy sưởi là hợp lý": in Vietnam's climate a heater is usually not needed.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon": the neons are already in the tank, so this order can't be followed.
- plain, stocking-10 post: Listing "cá đuôi bảng" as a fin-nipper is unclear and questionable.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon": đàn neon đã có sẵn trong bể, và betta thường được thả sau cùng để nó bớt giành lãnh thổ
- plain, stocking-10 post: "cá đá/tiger barb": ở Việt Nam "cá đá" thường là cá betta đá, còn tiger barb gọi là cá tứ vân
- plain, stocking-10 post: "thường dùng máy sưởi là hợp lý": ở Việt Nam nước trong nhà thường đã đủ ấm, mùa nóng cái cần lo là nước quá nóng chứ không phải sưởi
- plain, stocking-10 post: Không nhắc rằng neon đôi khi rỉa vây dài của betta
- ours, stocking-10 tank: 'betta dễ rượt và cắn cá neon nhỏ' / 'bể chỉ một loài' goes too far: one male betta with a school of neons in a ~65 L planted tank is a common pairing that often works. The bigger risk is neons nipping the betta's fins
- plain, stocking-10 tank: "cá tế bào (cá neon, cá rasbora)" — sai từ: neon và rasbora không phải "cá tế bào"; dân chơi gọi là cá tetra/cá bầy
- plain, stocking-10 tank: Y hỏi dung tích bể và hỏi đã có betta chưa dù app đã có sẵn dữ liệu bể (60×30×36, chỉ có 12 neon), lại còn tự cho là trong bể đang có betta
- plain, stocking-10 tank: Assumes the tank already has a betta ('đặc biệt nếu bể đang có một con betta đực'), but the tank has only 12 neon tetras
- plain, stocking-10 tank: 'cá tế bào (cá neon, cá rasbora)': this isn't a normal Vietnamese hobby term for these fish
- plain, stocking-10 tank: Asks for the tank volume, even though the tank size is already known (≈65 L)
- ours, algae-12 post: "Chấm xanh cứng khoảng 1 mm": người hỏi chỉ nói "đốm rêu xanh", không hề tả đốm cứng hay to cỡ 1 mm, nên chi tiết này là tự thêm vào.
- ours, algae-12 post: "thủ phạm gần như luôn là phosphate chứ không phải đèn": nói quá. Với ráy chậm lớn trong bể không CO2, cường độ đèn và số giờ chiếu cũng là nguyên nhân chính.
- ours, algae-12 post: "Thủ phạm gần như luôn là phosphate chứ không phải đèn" nói quá: ở bể không CO2 trồng cây chậm lớn, đèn mạnh hoặc bật lâu cũng góp phần gây GSA.
- ours, algae-12 post: Đoán bể có phân nền giàu dinh dưỡng trong khi người hỏi không hề nhắc tới.
- plain, algae-12 post: Bước 4 và 5 (thay nước để giảm phosphat, giảm phân): nếu đó là rêu đốm (GSA) thì nguyên nhân thường là thiếu PO4, nên cắt phân và thay nước nhiều có thể làm rêu nặng thêm.
- plain, algae-12 post: "Kiểm tra cho ăn": người hỏi không nhắc đến cá, nên đây là lời khuyên chung chung, không khớp với bể của họ.
- plain, algae-12 post: "Thay nước 25-30% để giảm... phosphat" và giảm phân: rêu đốm xanh (GSA) thường đi kèm phosphate thấp, nên cắt phân hoặc pha loãng PO4 có thể làm rêu nặng hơn.
- ours, algae-12 tank: Ví dụ "3 tiếng buổi sáng và 5 tiếng buổi tối" vượt mức mỗi đợt không quá 4 tiếng mà người hỏi đặt ra
- ours, algae-12 tank: Lý do "để bể không bị bật sáng khi không ai theo dõi" không có cơ sở, bể không cần người theo dõi khi đèn bật
- ours, algae-12 tank: "3 tiếng buổi sáng và 5 tiếng buổi tối": the 5-hour block breaks the hobbyist's own limit of 4 hours per block.
- ours, algae-12 tank: It keeps the total at 8 tiếng. For a 4-week-old low-tech tank of slow plants with no CO₂, 6–7 tiếng is the safer starting point.
- plain, algae-12 tank: Dùng "rêu" để chỉ tảo, dễ gây nhầm vì bể có trồng rêu java
- plain, algae-12 tank: Nói về canh giờ bơm CO₂ và hỏi lại loại bể, trong khi bể này không có CO₂ và đã rõ là bể trồng cây
- plain, algae-12 tank: "Nếu có bơm CO₂, hãy canh giờ bơm..." and the mention of bể san hô: this is filler that doesn't apply to a tank with no CO₂ and no reef.
- plain, algae-12 tank: "Có thể hạn chế rêu phát triển": it oversells splitting the light as a way to cut algae, though it partly takes this back later. It also says "rêu" for algae in a tank that holds rêu java, which is confusing.

## Failed


## Each question

### algae-01 · post · plain wins (4 · 7)

**Asked:** Bể em mới set được hơn 2 tuần mà đã có chút rêu tóc trên lá bucep và nmc. Em dùng đèn Flat One treo cách mặt nước 20cm, lúc đầu để chế độ giả lập ánh sáng mặt trời, giờ em hạ xuống còn 7 tiếng chạy một mạch không ngắt quãng. Cứ 2 hôm em thay 30% nước một lần, có cho Seachem khử clo, Advance và thuốc khử rêu. Em mới châm thêm 2 lọ phân nước ADA là Brighty K và Green Brighty Mineral vì thấy nmc bị trắng lá, chỉ có ít lá xanh mọc từ dưới lên. Em làm vậy có sai không, rêu tóc này xử lý sao ạ?

**Judge:** Y bám sát những gì bạn này đã làm: chỉ ra cường độ đèn, bảo ngưng thuốc diệt rêu, test NO₃/PO₄ trước khi châm phân, và có đủ các bước gỡ rêu cơ học và sinh học. X đọc ngược màu drop checker, bảo dừng hết phân trong khi NMC đang thiếu chất, và bỏ qua phần lớn chi tiết của bể. / X goes through every step the hobbyist took. It says to dim the light, stop the algae remover, and test before adding fertiliser, and it gives target figures. Y gets the drop checker reading backwards and ignores the light, which is the main thing to change in a tank that probably has no CO₂.

**Ours lacks:** wrong, tank-fit, figures. **Plain lacks:** follow-up.

**Ours** (read 1 pages, stopped at the tools limit):

> Nhiều khả năng rêu tóc đến từ thiếu CO2, vì đây là nguyên nhân hay gặp nhất theo cẩm nang; bể mới set cũng dễ bị rêu khi dinh dưỡng chưa cân bằng. Bạn chưa nhắc đến CO2 nên mình chưa chắc, bạn kiểm tra trước đã. Đèn treo cao 20 cm và chạy 7 tiếng không tự gây rêu nếu bể đủ CO2 và phân. Việc châm thêm Brighty K và Green Brighty Mineral khi chưa rõ CO2 có thể nuôi rêu thêm, nên mình khuyên tạm dừng châm phân cho đến khi xử lý được CO2.
> 1. Thả drop checker vào bể để xem CO2; nếu chỉ thị chuyển xanh, CO2 đang thiếu và cần tăng.
> 2. Tăng CO2 (bơm hoặc viên sủi) từ từ, hoặc nếu bể không châm CO2 thì…

**Plain** (2410 characters):

> Bể mới 2 tuần mà có rêu tóc là khá phổ biến, và nguyên nhân thường là **ánh sáng quá mạnh, quá dài so với độ ổn định của bể**. Có vài điểm em nên điều chỉnh.
> 
> **1. Ánh sáng (nguyên nhân chính)**
> - Flat One treo 20 cm ở chế độ giả lập nắng là cường độ khá cao. Bể mới chưa ổn định về CO₂ và dinh dưỡng nên rất dễ bị rêu.
> - 7 tiếng liên tục vẫn hơi dài. Em nên:
>   - Hạ cường độ xuống khoảng 50–60% trong vài tháng đầu.
>   - Chạy 6–7 tiếng, hoặc chia 2 đợt (ví dụ 4 tiếng sáng + 2 tiếng chiều) để tránh đỉnh sáng quá lâu.
> - Lá nmc bị trắng có thể là dấu hiệu ánh sáng quá mạnh (bị cháy/bạc lá) kết hợp t…

### algae-01 · tank · plain wins (3.5 · 5)

**Asked:** Bể mới set của tôi đã có rêu tóc bám lên lá cây, xử lý sao?

**Judge:** Neither answer uses the tank's details: a strong Flat One over slow-growing bucep and nmc, fertiliser just started, chemical algae remover, nmc leaves turning white. X tells them to raise the light to 8–10h while algae is already growing. Y is generic and long, but its advice is mostly sound: 6–8h light, cut back the fertiliser, add fast-growing or floating plants, and spot-treat with H₂O₂. / Both answers ignore the tank's details: the Flat One hung close over slow plants, the Brighty K just started, and the algae remover, which may be behind the nmc whitening. Y's advice to raise lighting to 8–10h is a harmful step. X is generic and long, but its advice on light and cutting back fertiliser is in the right direction.

**Ours lacks:** tank-fit, wrong, diagnosis. **Plain lacks:** tank-fit, too-long, follow-up, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Rêu tóc bám lá ở bể mới set thường do cây mới trồng chưa ra rễ nên ăn ít, dinh dưỡng dư còn lại trong nước, cộng với đèn bật quá lâu. Nếu bể của bạn là low tech không châm CO2 thì thiếu CO2 cũng có thể là thủ phạm, nên mình chưa chắc chắn hoàn toàn.
> 1. Trong hai tuần đầu, thay 30–50% nước mỗi ba ngày để kéo dinh dưỡng dư xuống.
> 2. Chỉnh đèn xuống tổng 8–10 tiếng mỗi ngày, chia thành nhiều đợt, mỗi đợt không quá 4 tiếng.
> 3. Dùng bàn chải đánh răng xoay vào đám rêu rồi rút ra; làm vậy gỡ được phần lớn, nhưng sẽ không sạch hết.
> 4. Nếu muốn thêm trợ thủ, thả vài con tép Amano, và bắt chúng ra khi…

**Plain** (2014 characters):

> Rêu tóc (thường là *Cladophora*, *Rhizoclonium* hoặc *Oedogonium*) rất phổ biến ở bể mới set. Nó thường xuất hiện khi ánh sáng dư, dinh dưỡng thừa trong nước, hoặc cây chưa phát triển đủ để cạnh tranh. Bạn có thể xử lý theo các bước sau:
> 
> **1. Loại bỏ thủ công ngay**
> - Quấn rêu quanh đũa, cọ hoặc dùng tay xoắn rồi kéo ra.
> - Cắt bỏ những lá cây bị phủ nhiều rêu.
> - Hút đáy bể để lấy cặn bẩn và rêu chết.
> 
> **2. Giảm ánh sáng**
> - Chỉ bật đèn khoảng 6–8 tiếng/ngày, nên dùng timer.
> - Tránh để bể gần cửa sổ hoặc nơi có nắng chiếu trực tiếp.
> 
> **3. Kiểm soát dinh dưỡng**
> - Thay 30–50% nước mỗi tuần.
> - …

### algae-02 · post · plain wins (6 · 7)

**Asked:** Mình có hồ 70x30x40, cây chủ yếu là ráy và rêu. Đang dùng đèn Chihiros A601 plus mà bị rêu chùm đen, dù hồ không nền và hơn tuần nay không châm phân. Mình tính thay đèn, nên chọn đèn nào cho bể này?

**Judge:** Both answers treat strong light as the likely cause of the BBA. Y also explains that stopping fertilizer won't fix it and can make it worse, which corrects the hobbyist's assumption. Y gives concrete figures (40–60% intensity, 6–7 hours a day, a 20–30W light), names real replacement lights, and says when it would actually be worth changing the light. It has small errors (rau ngổ is not a floating plant) and runs a bit long. X is cleaner but never recommends a specific light and assumes the tank has no CO₂. / X answers the actual question. It says not to swap the light yet and to fix the photoperiod first, gives a dimming range (40–60%), and names specific lower-power light options to check. Y is shorter and its point about organic waste is good, but it guesses about CO₂, gives no figures and doesn't name a single light.

**Ours lacks:** figures, tank-fit. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là đèn quá mạnh so với bể không châm CO2: ráy và rêu chỉ cần ánh sáng vừa, còn BBA thường bùng khi đèn mạnh mà CO2 không ổn định, hoặc khi đèn mạnh đi cùng bể có chất thải hữu cơ. Cẩm nang chưa có trang riêng cho đèn Chihiros A601 Plus, nên mình chỉ dựa vào nguyên tắc chọn đèn và nguyên nhân gây BBA; mình chưa biết bạn đang bật đèn bao nhiêu giờ và ở mức độ nào, nên mức chắc chắn là vừa.
> 1. Giảm giờ bật đèn xuống khoảng 6 đến 7 tiếng mỗi ngày, và nếu đèn chỉnh được thì hạ cường độ xuống mức vừa.
> 2. Gỡ búi rêu trên lá ráy bằng tay hoặc nhíp, cắt bỏ lá nào bám rêu nặ…

**Plain** (2238 characters):

> Với hồ 70x30x40 (khoảng 84L) trồng ráy và rêu, mình nghĩ **bạn chưa cần thay đèn ngay**. Rêu chùm đen (BBA) thường xuất hiện khi ánh sáng quá mạnh hoặc kéo dài so với khả năng hấp thụ dinh dưỡng và CO₂ của cây, và ráy với rêu vốn là nhóm cây ưa ánh sáng thấp đến vừa.
> 
> **Nguyên nhân có khả năng nhất:**
> - **Cường độ hoặc thời gian chiếu sáng quá mức.** A601 Plus khá mạnh cho hồ 70cm, nhất là khi hồ không có nền và cây ít sinh trưởng.
> - **Cây không tăng trưởng đủ để cạnh tranh.** Ráy chậm lớn nên không hấp thụ hết dinh dưỡng, và rêu chùm đen tận dụng phần dư đó.
> - **Lịch chiếu sáng không ổn định…

### algae-02 · tank · ours wins (6.5 · 5.25)

**Asked:** Bể của tôi bị rêu chùm đen dù không châm phân, có phải do đèn không?

**Judge:** X uses the strong Chihiros light and the week without fertiliser, says CO₂ is unknown, and sets out ordered checks by where the algae grows. It lacks light hours and doesn't mention that ráy and rêu grow slowly. Y gives useful numbers (6–8 h of light, 20–30% water changes), but it's a generic list that ignores the tank, asks what light they use, and uses a fish name nobody uses in Vietnam. / Y dựa vào bể thật của người hỏi: nhắc đèn Chihiros A601 plus, việc ngưng phân và tránh bảo hút nền khi bể không có nền. Bảng "BBA bám ở đâu" kèm theo cũng giúp đoán nguyên nhân. Tuy vậy Y thiếu số liệu cụ thể (giờ đèn, % thay nước) và không chỉ ra rằng ráy với rêu là cây chậm lớn, dễ bị BBA dưới đèn mạnh. X có số liệu rõ hơn nhưng viết chung chung cho bể nào cũng được, và còn hỏi lại loại đèn dù thông tin này đã có sẵn.

**Ours lacks:** figures, tank-fit, diagnosis. **Plain lacks:** tank-fit, local.

**Ours** (read 2 pages, stopped at the calls limit):

> Mình nghĩ đèn chưa chắc là thủ phạm duy nhất. Cẩm nang nói BBA thường do ba nhóm: CO2 thiếu hoặc dao động, chất thải hữu cơ nhiều, và cây yếu. Đèn mạnh tự nó không sinh ra BBA, nhưng khi đèn mạnh mà CO2 và dinh dưỡng không theo kịp thì bể mất cân bằng và rêu dễ bùng. Bể của bạn dùng Chihiros A601 plus, không châm phân hơn một tuần, nên khả năng cao là đèn đang mạnh hơn lượng dinh dưỡng và CO2 cây nhận được. Mình chưa biết bạn có châm CO2 không, nên đây là phỏng đoán từ thông tin bạn đưa.
> 1. Nhìn BBA mọc ở đâu: nếu trên lá cây thì nghi CO2 hoặc cây yếu, nếu trên lũa hay đá thì nghi chất thải t…

**Plain** (1709 characters):

> Đèn **có thể là một nguyên nhân**, nhưng thường không phải là nguyên nhân duy nhất. Rêu chùm đen (BBA) thường xuất hiện khi có nhiều yếu tố cùng lúc.
> 
> **Các nguyên nhân thường gặp:**
> 
> 1. **Đèn quá mạnh hoặc bật quá lâu:** Cường độ sáng cao hoặc thời gian chiếu trên 8-10 giờ/ngày rất dễ kích rêu phát triển, đặc biệt khi CO2 không ổn định.
> 2. **CO2 thiếu hoặc dao động:** Nếu bể trồng cây có đèn mạnh mà CO2 thấp hoặc không đều, cây phát triển kém và rêu có lợi thế cạnh tranh.
> 3. **Dinh dưỡng vẫn có, dù không châm phân:** Thức ăn thừa, chất thải của cá, và phốt phát/nitrat trong nước máy đều là n…

### algae-03 · post · ours wins (6.5 · 3.5)

**Asked:** Mình mới chơi, hồ đầu tiên trồng trân châu ngọc trai, vừa set được 3 ngày. Từ 2 hôm trước nước chuyển xanh, mình nghi là rêu nước xanh. Mình thay 30% nước thì hôm sau nước còn xanh hơn. Hôm nay mình tháo bớt 1 bóng của đèn Odyssea dual, chỉnh timer từ 7 tiếng xuống 4 tiếng và thay bông lọc. Có nên tiếp tục thay nước mỗi ngày không? Đèn như vậy có dư không hay nên tắt luôn vài ngày?

**Judge:** X got the main cause right (a new tank with too much light and nutrients). It says to stop the daily water changes and keep the light at 4 hours, gives a blackout option, and says to watch for low oxygen. Y misreads the Odyssea light as possibly a UV unit, which muddles the lighting advice, and it asks basic questions back. Its only clearly useful point is not to replace the filter floss. / X misreads the Odyssea light as a possible UV sterilizer and tells them to run it nonstop at full power, which is the opposite of what they need. Y correctly treats it as a grow light, gives clear numbered steps (keep 4 hours, cut feeding and fertiliser, blackout, watch the fish for oxygen trouble), and adds a guide excerpt. Its weakness is that it doesn't mention the new substrate.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** wrong, asks-only, tank-fit, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Nước xanh trong bể mới 3 ngày thường là tảo phù du nở rộ, do ánh sáng và chất dinh dưỡng dư khi bể còn non, nên việc thay nước 30% mỗi ngày chưa xử lý được gốc. Mỗi lần thay, tảo lại có thêm dinh dưỡng và mọc lại nhanh. Bạn làm đúng hướng khi giảm đèn xuống 4 tiếng. Mình chưa tìm thấy trang nào trong cẩm nang về trân châu ngọc trai nên phần này mình chỉ nói theo kinh nghiệm chung.
> 1. Dừng thay nước hàng ngày, để nước ổn định. Khi cần thì thay 20–30% mỗi tuần.
> 2. Giữ đèn 4 tiếng, không bật thêm, và dời bể khỏi chỗ nắng hoặc ánh sáng hắt từ cửa sổ.
> 3. Ngưng cho ăn nhiều và không châm phân lúc n…

**Plain** (1616 characters):

> Mình khuyên **đừng thay nước mỗi ngày**, và **đừng tắt hẳn đèn**, nhất là nếu đây là đèn UV diệt tảo.
> 
> **Vì sao nước xanh:** Hồ mới set 3 ngày thường chưa có hệ vi sinh ổn định, nên dinh dưỡng (thức ăn thừa, phân, nước máy) dư thừa, cộng với nắng và ánh sáng, làm tảo nổi (nước xanh) bùng lên. Thay 30% mỗi ngày đưa thêm nước máy vào, có thể mang thêm dinh dưỡng và làm hồ không kịp ổn định. Thường thì nước xanh kiểu này tự hết sau 1-3 tuần khi hồ ổn định.
> 
> **Việc nên làm:**
> - **Ngừng thay nước hằng ngày.** Chỉ thay khi thử nước thấy amonia hoặc nitrit tăng, và mỗi lần chỉ khoảng 10-15%.
> - **Thử…

### algae-03 · tank · ours wins (5.75 · 5)

**Asked:** Bể mới set vài ngày đã bị nước xanh, nên thay nước hay tắt đèn?

**Judge:** Neither answer uses what the hobbyist already tried: light already cut to 4h with one bulb removed, a 30% change that made it greener, and swapped filter floss that strips the young bacteria. Neither warns that a blackout puts the trân châu carpet at risk. X gives a clearer step-by-step plan and caps the blackout at 7 days for the plants. Y is longer and less focused. / Neither answer uses what the hobbyist already tried: they've cut the light to 4h, and the water change made the tank greener. Y still gives a shorter step-by-step plan. It says why changing water doesn't clear the bloom, which matches what they saw, and it says to keep the filter running, move the tank away from sunlight and watch the fish. X runs long and suggests odd plants.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, plan, too-long, follow-up.

**Ours** (read 1 pages):

> Bạn nên tắt đèn trước, chưa cần thay nước vội. Bể mới thường nở xanh vì quá nhiều ánh sáng cộng với chất dinh dưỡng từ nền và thức ăn mới, nên cắt sáng là việc đầu tiên. Cẩm nang nói thay thật nhiều nước một lần không hết xanh, vì tảo sinh sản rất nhanh và sẽ mọc lại.
> 1. Tắt đèn bể và đặt bể xa chỗ nắng chiếu hoặc nắng hắt từ cửa sổ.
> 2. Che kín bể trong khoảng 3 đến 7 ngày, vẫn để lọc và sủi chạy liên tục. Cẩm nang ghi không quá 7 ngày, vì cây sẽ chịu khổ.
> 3. Không châm phân nước và cho ăn ít lại trong lúc này.
> 4. Khi nước đã trong, thay khoảng một phần lớn nước để vớt xác tảo và giảm amoniac…

**Plain** (1484 characters):

> Nước xanh trong bể mới thường là **tảo nở hoa (bloom)**. Nguyên nhân chủ yếu là bể mới có nhiều dinh dưỡng (đạm, lân từ thức ăn, phân cá, quá trình chu trình nitơ chưa ổn định) và đèn chiếu quá nhiều. Nó thường tự hết sau 1-3 tuần nếu xử lý đúng.
> 
> **Nên làm trước: tắt đèn**
> - Tắt đèn hoàn toàn 3-5 ngày, hoặc phủ kín bể bằng vải/bìa tối để tránh ánh sáng.
> - Đừng bật đèn lâu. Sau khi hết xanh, chỉ bật 6-8 tiếng/ngày.
> - Đây là cách hiệu quả và không hại gì cho bể.
> 
> **Thay nước: chỉ nên làm vừa phải**
> - Nếu bể đang chạy chu trình nitơ (chưa có vi khuẩn có lợi đủ mạnh), thay quá nhiều nước có thể …

### algae-04 · post · plain wins (6 · 7)

**Asked:** Mình chơi hồ 60x40x40 theo kiểu Hà Lan, dùng 2 cây đèn trắng Aquablue, 1 cây dài 60cm và 1 cây 45cm, vậy có bị dư sáng không? Hồ mới set được 7 ngày mà tảo nâu phát triển nhiều quá, CO2 và dinh dưỡng thì tương đối ổn định, mỗi ngày thay 30% nước kèm vệ sinh hồ, vậy mà rêu nâu cứ bám hoài trên đá và mặt kính. Hồ mình đang bị gì, nên làm sao?

**Judge:** Y trả lời thẳng câu hỏi có dư sáng không, có tính đến việc bạn thay nước mỗi ngày và nguồn silicate, lại gợi ý ốc Nerite. Nhưng khuyên giảm thay nước khi hồ mới 7 ngày, với lý do "vi sinh không kịp ổn định", là sai. X đúng và gọn hơn (như cấy bông lọc cũ, thêm cây), nhưng né câu hỏi về đèn và bỏ qua lịch thay nước của bạn. / X trả lời thẳng câu hỏi dư sáng với số liệu cụ thể (6-7 tiếng, hồ ~96L) và nói tới silicate cùng lịch thay nước bạn đang làm, nên khớp với hồ của bạn hơn, dù lý do khuyên thay nước ít lại là sai. Y an toàn và có dặn theo dõi, nhưng mỏng hơn, không đả động gì tới việc bạn thay nước mỗi ngày và cũng không trả lời rõ đèn có dư hay không.

**Ours lacks:** tank-fit, figures. **Plain lacks:** follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ đây là tảo nâu (tảo cát) bùng lên ở bể mới, khá bình thường trong vài tuần đầu. Bể mới 7 ngày chưa ổn định sinh học, còn đèn khá mạnh cùng dinh dưỡng và CO2 đều đặn nên tảo dễ bùng; mình chưa biết chắc cường độ đèn có đang vượt mức không vì chưa đo được, nên hãy kiểm tra thời gian chiếu sáng trước.
> 1. Đặt hẹn giờ cho đèn, chỉ bật khoảng 6 đến 7 tiếng mỗi ngày và tránh để nắng chiếu vào bể.
> 2. Nếu có thể, giảm cường độ một cây đèn hoặc đưa đèn lên cao hơn để giảm ánh sáng trực tiếp xuống nền.
> 3. Giảm lượng phân nước đang châm hoặc giữ đúng liều thấp, vì phân dư nuôi tảo nhanh hơn cây…

**Plain** (2537 characters):

> # Tảo nâu trong hồ mới là khá phổ biến
> 
> Lớp nâu bám trên đá và kính thường là **tảo silic (diatom)**. Nếu lau bằng tay thì bong ra dễ dàng, đó là dấu hiệu nhận biết. Tảo nâu hay xuất hiện trong 2-8 tuần đầu của hồ mới, vì lúc này hệ vi sinh chưa ổn định, cây chưa hấp thụ hết dinh dưỡng, và nước thường giàu **silicate**.
> 
> ## 1. Có bị dư sáng không?
> 
> Với hồ khoảng 96L và 2 đèn (60cm + 45cm) thì **cường độ ở mức trung bình-khá**, chưa phải là quá dư, nhất là với kiểu Hà Lan vốn cần sáng tương đối. Tuy nhiên, trong giai đoạn mới set, **thời gian bật đèn** mới là yếu tố dễ gây tảo:
> - Nên bật **6-7…

### algae-04 · tank · ours wins (6.75 · 4.25)

**Asked:** Bể mới set một tuần bị tảo nâu bám kín đá và kính, làm sao?

**Judge:** X nói đúng nguyên nhân (bể mới, vi sinh chưa ổn định, đèn và phân mạnh) và đưa ra các bước gọn, đúng cho bể có CO₂: giảm đèn, cấy vi sinh, châm phân nhẹ, theo dõi sau 2–3 tuần. Y dài, có chỗ sai (than hoạt tính khử silicat, thay nước mỗi tuần), có phần cho ăn không áp dụng được và lại hỏi những thông tin app đã có. Cả hai đều chưa dùng chi tiết hai đèn Aquablue hay việc bạn ấy đang thay nước mỗi ngày. / Cả hai đều đoán đúng nguyên nhân là tảo cát của bể mới. Nhưng Y đưa các bước làm theo thứ tự, gợi ý cấy vi sinh, bảo châm phân nhẹ, và nói rõ cần theo dõi gì. X sai ở mấy điểm: bảo than hoạt tính khử được silicat, khuyên dùng ốc Trochus là ốc biển, gọi otto là cá chuột, và còn hỏi lại thông tin bể mà app đã có. Y vẫn còn thiếu số giờ bật đèn cụ thể.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, wrong.

**Ours** (read 2 pages):

> Bể mới được một tuần mà đã có tảo nâu (tảo cát) phủ kính và đá là chuyện rất thường gặp. Cẩm nang cho biết tảo cát thường bùng trong vài tuần đầu vì vi sinh trong bể chưa ổn định, và đèn mạnh hoặc phân nhiều sẽ làm nó mọc nhanh hơn. Lớp này thường tự hết sau khoảng 4–6 tuần khi bể ổn định, nên bạn chưa cần diệt bằng hóa chất.
> 1. Dùng khăn hoặc miếng cọ mềm lau kính, và hút các mảng tảo lớn khi thay nước.
> 2. Giảm thời gian bật đèn và cường độ đèn trong giai đoạn đầu, tăng dần khi bể trưởng thành.
> 3. Cấy vi sinh bằng cách bóp bông lọc cũ hoặc mulm từ bể đang chạy tốt vào bể mới, rồi cho lọc chạ…

**Plain** (1723 characters):

> Tảo nâu (thường là tảo silic/diatom) rất phổ biến ở bể mới setup, thường tự hết sau vài tuần khi hệ vi sinh ổn định. Bạn có thể xử lý như sau:
> 
> **1. Làm sạch cơ học ngay**
> - Dùng miếng bọt biển hoặc cạo kính chuyên dụng lau kính, dùng cọ mềm chà đá, lá cây giả/thật.
> - Với kính, lau xong nên thay khoảng 20-30% nước để tảo bị cuốn đi, tránh để lơ lửng rồi lắng lại.
> - Có thể dùng ống hút siphon hút cặn tảo ra khi thay nước.
> 
> **2. Giảm nguyên nhân**
> - **Ánh sáng:** Giảm thời gian đèn xuống còn 6-8 tiếng/ngày, tránh đặt bể gần cửa sổ có nắng trực tiếp.
> - **Dinh dưỡng:** Cho ăn ít lại, chỉ cho ăn l…

### algae-05 · post · plain wins (4.5 · 7)

**Asked:** Em set bể Hà Lan được gần 1 tháng, đèn mới lên 8h/ngày (10h sáng đến 18h), cây phát triển rất tốt, không có rêu hại. Phía trước dưới nền em trồng rau thơm. Nhưng ở mặt kính phía dưới, chỗ giáp nền, có tảo nâu bám kính và một chút tảo nhớt xanh, có phải do đèn trong nhà buổi tối hắt vào bể không? Bucep em buộc giá thể thả vào được 1 tuần cũng có tảo nâu trên lá. Em thay nước đều 2 ngày 1 lần. Em có thả ốc nerita nhưng nó chỉ nằm im không bò, kiểm tra thì vẫn sống. Xử lý tảo nâu với rêu nhớt sao ạ?

**Judge:** Y names both problems correctly: diatoms that normally show up in a new tank, and cyanobacteria where water sits still. It says room light plays only a small part and gives the usual fixes: siphon, more flow, a 2–3 day blackout, Amano shrimp. X tells them to cut the tank light to 2–3 hours a day, which would hurt a planted tank whose plants are growing well. / X tách bạch tảo cát với vi khuẩn lam và đưa ra cách xử lý chuẩn: lau tảo, giảm đèn còn 6–7h, tắt đèn 2–3 ngày, tăng dòng chảy ở đáy, hút mùn. Y viết tiếng Việt tự nhiên hơn nhưng khuyên cắt đèn xuống 2–3h/ngày, có thể làm hại bể Hà Lan đang phát triển tốt, và đưa kháng sinh ra quá sớm.

**Ours lacks:** wrong, tank-fit, diagnosis. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Tảo nâu (tảo cát) gần như bể mới set nào cũng có trong 2 đến 6 tuần đầu, và bể của bạn đang ở đúng giai đoạn đó. Nguyên nhân chính là hệ vi sinh chưa ổn định kết hợp với đèn bật lâu, nên bạn nên giảm đèn trước. Đèn nhà hắt vào buổi tối có thể góp phần nuôi tảo ở mặt kính, nhưng đây là suy đoán của mình, cẩm nang chưa nói về ánh sáng phòng.
> Các bước bạn làm được ngay:
> 1. Giảm đèn bể xuống khoảng 2 đến 3 tiếng mỗi ngày trong lúc còn tảo nâu, rồi tăng dần lại về 6 đến 8 tiếng khi tảo hết.
> 2. Chà nhẹ kính, hút phần tảo nhớt xanh ra khỏi nền, và gỡ hoặc lau lá bucep đang dính tảo nâu.
> 3. Giữ nhịp …

**Plain** (2581 characters):

> Tảo nâu thường gặp ở bể mới khoảng 1–2 tháng. Thường là **tảo silic (diatom)**, xuất hiện khi bể chưa cân bằng, nguồn sáng và dinh dưỡng đang dư. Tình trạng này thường tự giảm khi bể ổn định. Còn lớp nhớt xanh có thể là **vi khuẩn lam (cyanobacteria)**, dễ xuất hiện ở vùng đáy kính, nơi ít dòng chảy và tích tụ mùn bã hữu cơ.
> 
> **1. Đèn trong nhà hắt vào bể có phải nguyên nhân không?**
> Có thể góp phần, nhưng thường không phải nguyên nhân chính. Ánh sáng yếu từ đèn phòng vào buổi tối ít ảnh hưởng đến tảo. Bạn nên kiểm tra:
> - Ánh nắng hoặc đèn phòng có chiếu trực tiếp vào mặt kính không.
> - Đèn bể…

### algae-05 · tank · ours wins (6 · 4)

**Asked:** Bể tôi có tảo nâu và tảo nhớt xanh ở chân kính sát nền, xử lý thế nào?

**Judge:** X ngắn gọn, nêu đúng nguyên nhân là bể còn non và góc chết, cặn nền, các bước làm theo thứ tự rõ ràng và có hẹn theo dõi sau 1–2 tuần. Y dài, chung chung, còn hỏi ngược lại thông tin bể. Cả hai đều bỏ qua chuyện ốc nằm im, đèn trong nhà hắt vào buổi tối và việc đang thay nước 2 ngày/lần. / Y gives the more likely cause (a young tank, dead spots with weak flow, and debris on the substrate), short steps in order, and a check-in after 1–2 weeks. X is long and generic, suggests buying snails the hobbyist already has, and uses odd fish names. Neither one picks up on the 4-week-old tank, the evening room light, or the nerites that aren't moving.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, diagnosis, follow-up.

**Ours** (read 2 pages):

> Tảo nâu (tảo cát) thường bám ở bể còn non hoặc khi nền có nhiều cặn hữu cơ. Lớp nhớt xanh là vi khuẩn lam, hay gặp ở chỗ nước chảy yếu và oxy thấp sát nền. Hai thứ này thường mọc cùng nhau ở chân kính, nên mình đoán nguyên nhân là góc chết và cặn nền. Bạn xử lý theo các bước sau:
> 1. Hút cặn nền và thay khoảng 20–30% nước để bớt chất hữu cơ.
> 2. Chỉnh vòi xả của lọc hoặc bơm hướng về chân kính để nước chảy qua vùng đó.
> 3. Gỡ tay mảng nhớt xanh còn nhỏ, chà nhẹ tảo nâu bằng bàn chải mềm rồi hút ra khi thay nước.
> 4. Trồng thêm cây để cạnh tranh dinh dưỡng với tảo, và châm phân đều theo lịch, khôn…

**Plain** (2489 characters):

> Tảo nâu và tảo nhớt xanh ở chân kính thường xuất hiện khi bể dư dinh dưỡng, ánh sáng hoặc dòng chảy chưa tốt. Bạn xử lý theo các bước sau:
> 
> ## 1. Xác định loại tảo
> - **Tảo nâu** (diatom): lớp bột nâu dễ lau, thường xuất hiện ở bể mới hoặc khi ánh sáng yếu. Thường tự biến mất khi bể ổn định.
> - **Nhớt xanh** (vi khuẩn lam, cyanobacteria): lớp nhầy, có thể dày, màu xanh hoặc đen, dễ bong thành mảng. Đây là loại khó xử lý hơn và cho thấy bể đang dư chất dinh dưỡng hoặc thiếu oxy/lưu thông nước ở đáy.
> 
> ## 2. Xử lý ngay
> - **Cọ và lau kính** bằng miếng cọ mềm hoặc nam châm lau kính. Với vi khuẩn lam…

### algae-06 · post · tie or split (6.25 · 6.5)

**Asked:** Em đang dùng bể 6-4-4, lọc Sunsun 702B (1000L/h), lọc phụ Sunsun 603. CO2 cho qua sủi đánh thẳng vào đầu in của lọc, có van điện bật tắt theo đèn. Thỉnh thoảng nghe trong lọc chính có tiếng lọc xọc, lúc khác lại thấy đầu out bắn ra bọt khí to cỡ hạt đỗ. Bể đang nhiều rêu tóc, rêu sừng hươu và rêu lông tơ nên em đang cho CO2 dồi dào hơn, tầm 6-7 giọt/giây. Trộn như vậy có ổn không khi CO2 nhiều? Lọc phụ gắn thêm trộn cánh quạt ở out được không hay sẽ yếu dòng? Cá tép có nguy cơ chết vì ngạt CO2 không?

**Judge:** Both answers find the same cause: CO₂ is fed straight into the filter intake and the dose is too high. X gives short steps in a clear order, using the drop checker and watching the shrimp. Y adds useful points like a check valve and light hours, but it is long, gets the drop checker colours wrong, and talks about raising CO₂ when the hobbyist needs to lower it. / X nói đúng nguyên nhân là khí bị hút vào lọc. X chỉ thêm van một chiều, reactor gắn trên đường out, mức giọt/giây cần nhắm tới, dấu hiệu tép bị ngạt và số giờ chiếu đèn để trị rêu, nhưng bài dài và có vài lỗi nhỏ về màu drop checker. Y gọn, có các bước theo thứ tự và mẹo sục khí ban đêm, nhưng thiếu con số và cách xử lý cụ thể cho lọc.

**Ours lacks:** figures, diagnosis. **Plain lacks:** too-long, wrong.

**Ours** (read 3 pages, stopped at the tools limit):

> Nhiều khả năng bạn đang châm CO2 quá tay và đưa khí vào sai chỗ: bọt CO2 đi thẳng vào đầu hút của lọc nên gây tiếng lọc xọc và bọt to ở đầu ra. Cẩm nang cho biết phần lớn rêu tóc do thiếu CO2, nhưng cũng có ý kiến châm quá nhiều vẫn sinh rêu, nên bạn cần đo CO2 thực trong nước thay vì đếm bọt.
> 1. Chuyển điểm sủi CO2 ra khỏi đầu hút lọc, đặt đá sủi hoặc diffuser trong bể, ở chỗ có dòng nước đi qua.
> 2. Đặt drop checker trong bể, chỉnh van để dung dịch chuyển xanh lá, rồi giảm dần số bọt mỗi giây thay vì giữ 6-7 bọt.
> 3. Chỉnh từng bước nhỏ, đợi vài giờ rồi xem lại màu drop checker trước khi chỉn…

**Plain** (3807 characters):

> # Trả lời ngắn gọn
> 
> **Trộn CO2 vào đầu hút của lọc chính đang gây tiếng xọc và bọt lớn.** Với lượng 6-7 giọt/giây, bể 96-100L dễ bị dư CO2, nhất là khi bạn tăng đột ngột. Nên giảm lượng CO2, dùng đo drop checker để kiểm soát, và chuyển điểm bơm CO2 ra khỏi đầu hút lọc chính.
> 
> ## 1. Tiếng "lọc xọc" và bọt to ở đầu out
> 
> - **Khí bị hút vào bơm:** Bọt CO2 đi vào đầu hút, bơm 702B hút cả khí lẫn nước. Khí làm bơm mất mồi, chạy ồn, lưu lượng giảm, lâu dài có thể mòn cánh bơm và phớt.
> - **Bọt to ở out:** CO2 không kịp hòa tan nên thoát ra theo dòng nước. Bọt to cỡ hạt đỗ nghĩa là lượng khí đang vượt…

### algae-06 · tank · ours wins (5 · 4)

**Asked:** Bể tôi nhiều rêu tóc, rêu sừng hươu và rêu lông tơ, tăng CO2 có giúp được không?

**Judge:** Cả hai câu trả lời đều bỏ qua đầu mối quan trọng nhất trong bể này: CO2 sủi vào đầu in lọc, lọc kêu xọc xọc và có bọt khí to ở đầu out. Điều đó cho thấy khí CO2 bị kẹt trong lọc và hòa tan kém, nên việc cần làm là sửa cách hòa tan chứ chưa phải tăng thêm giọt. X ngắn gọn hơn, có các bước theo thứ tự, có trích cẩm nang và ít sai hơn. Y chứa các con số sai như mức giảm pH, và hỏi lại những thông tin app đã có. / Neither answer noticed the clearest clue: the filter gurgling and big bubbles at the outlet mean CO₂ gas is collecting in the canister and not dissolving. Y still gives clear steps in order, links the staghorn algae (rêu sừng hươu) to the filter outlet, and backs its claims with the guide. X is generic, has a wrong pH-drop target, and asks for details the tank profile already gives.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, diagnosis, plan, too-long.

**Ours** (read 4 pages, stopped at the calls limit):

> Có, CO2 thường là thứ đầu tiên nên chỉnh cho rêu tóc. Cẩm nang ghi thiếu CO2 là nguyên nhân hay gặp nhất, và khoảng 90% trường hợp chỉ đơn giản là thiếu CO2. Rêu sừng hươu hay bám ở chỗ nước ra của lọc, nơi CO2 bị đẩy thoát đi nhanh, nên nhiều khả năng cùng nguyên nhân. Với rêu lông tơ, cẩm nang mình đã đọc không nói rõ, nên mình chỉ suy luận từ nguyên tắc chung: rêu nào cũng lên khi đèn, CO2 và dinh dưỡng lệch nhau.
> 1. Gỡ rêu tóc và rêu sừng hươu bằng tay hoặc dụng cụ xoay, tránh để chúng tiếp tục sinh sôi.
> 2. Lắp drop checker để xem CO2 thực tế, rồi tăng CO2 từ từ cho đến khi dung dịch chuy…

**Plain** (1978 characters):

> **Có, tăng CO₂ thường giúp**, nhưng thường chỉ là một phần của giải pháp. Rêu tóc, rêu sừng hươu và rêu lông tơ hay xuất hiện khi bể mất cân bằng: ánh sáng quá mạnh hoặc kéo dài, dinh dưỡng (đặc biệt là phosphate và nitrate) dư thừa, còn cây thủy sinh thì thiếu CO₂ nên phát triển chậm. Khi cây được cấp đủ CO₂, chúng lớn nhanh hơn, hấp thụ dinh dưỡng và cạnh tranh ánh sáng tốt hơn rêu.
> 
> **Cách tăng CO₂ hiệu quả**
> - Đo bằng drop checker hoặc theo pH: mục tiêu thường là pH giảm khoảng 0,2–0,3 so với nước không CO₂, hoặc drop checker chuyển xanh vàng nhẹ (khoảng 25–30 ppm).
> - Bật CO₂ cùng lúc với…

### algae-07 · post · plain wins (5 · 6.75)

**Asked:** Em là tân binh theo trường phái Hà Lan, phần cứng gần như đủ cho một bể Hà Lan cơ bản: lọc chuẩn, CO2 dồi dào, nền trộn giàu dưỡng, đèn WRGB, quạt... Vậy mà em thất bại liên tiếp 5 bể, bể nào cũng bị: cây xoắn ngọn, xoắn tít, mất màu, teo ngọn, ngọn trắng toát và dị dạng; rêu hại bùng phát. Đèn bật 9h liên tục, CO2 3-4 giọt/giây, mới setup em thay hơn 100% nước hằng ngày trong 2 tuần (vì nghe nói nền trộn rất giàu dưỡng, mà nền mua nên em không biết công thức). Giờ em muốn chuyển qua nền công nghiệp + cốt nền nhưng lăn tăn về tuổi thọ và dinh dưỡng cho bể Hà Lan vốn rất háu ăn. Em nên làm sao?

**Judge:** Both put the problem down to nutrients being washed out by the water changes. Y also covers KH/pH, says to test parameters, gives fertiliser targets and a schedule, explains how the substrate and root layer should be built, and gives a week-by-week plan. X is too thin, gives no doses, and barely answers the question about the substrate. / X gives a fuller plan: it says to test KH/GH, gives target ranges for KH, NO3, PO4 and K, explains how long industrial vs inert substrates last and how to layer cốt nền, and lays out a recovery timeline. Y is right but thin: it just says to dose by the label and barely answers the substrate question. Both miss Ca/GH deficiency as a likely cause.

**Ours lacks:** figures, too-thin, diagnosis. **Plain lacks:** too-long, diagnosis.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là bể đang thiếu dinh dưỡng, không phải do nền mua hay bể sai, vì bạn thay trên 100% nước mỗi ngày trong 2 tuần nên đã rửa trôi phần lớn phân, trong khi đèn 9 giờ và CO2 dồi dào làm cây cần nhiều dưỡng hơn. Ngọn xoắn, trắng, dị dạng và rêu bùng phát đúng kiểu cây thiếu dưỡng khi ánh sáng và CO2 vượt khả năng nuôi của nước. Mình chưa đọc được trang chi tiết về cách bón phân bổ sung cho bể Hà Lan, nên phần liều lượng bạn làm theo nhãn sản phẩm.
> 1. Ngừng thay nước hằng ngày; mỗi tuần chỉ thay khoảng 30-50% nước.
> 2. Bổ sung phân nước đủ đa lượng và vi lượng (có sắt) th…

**Plain** (3164 characters):

> Em không nên đổ lỗi cho nền trộn hay bỏ phương pháp Hà Lan. Theo mô tả, nguyên nhân nhiều khả năng nằm ở **thiếu dinh dưỡng do thay nước quá nhiều**, cộng với **CO2 và ánh sáng cao mà không có bón phân tương ứng**.
> 
> ## 1. Chẩn đoán
> 
> - **Thay 100% nước mỗi ngày trong 2 tuần** đã rửa trôi phần lớn dưỡng chất hòa tan và vi lượng (sắt, mangan, kẽm...). Nền trộn giàu dưỡng chỉ bổ sung từ từ, nên sau khi bị rửa trôi, cây đói ngay. Đây là lý do cây non bị xoắn, trắng ngọn, dị dạng.
> - **Ánh sáng 9h + CO2 3-4 giọt/giây + không bón phân đều** là tổ hợp khiến cây tiêu thụ nhanh, trong khi nguồn cung khô…

### algae-07 · tank · ours wins (6.75 · 3.25)

**Asked:** Bể tôi cứ bị rêu hại bùng phát và cây xoắn ngọn, trắng ngọn, phải làm sao?

**Judge:** X dùng đúng thông số bể của bạn này (đèn 9h, CO₂, việc thay nước) và đưa ra kế hoạch có thứ tự, có số liệu và có mốc theo dõi, dù xem nhẹ vai trò của nền giàu dưỡng và khuyên giảm thay nước quá đột ngột. Y chung chung, dài dòng, có gợi ý sinh vật ăn rêu không hợp bể trồng cây, lại hỏi lại những thông tin đã có. / Y dùng đúng dữ liệu bể của bạn này (đèn 9h, CO₂ 3-4 giọt/giây, thay nước hơn 100% mỗi ngày), đưa ra 5 bước có số liệu dẫn từ cẩm nang và nói rõ cần theo dõi gì trong 1-2 tuần. X thì chung chung, hỏi lại những thông tin app đã có, và có lời khuyên sai như thả ốc táo, cá sọc ngựa để ăn rêu.

**Ours lacks:** diagnosis, tank-fit. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Nguyên nhân có khả năng cao nhất là đèn bật quá lâu (9 giờ liên tục) cùng CO2 khá mạnh, trong khi dinh dưỡng trong nước không theo kịp. Rêu thắng thế và lá ngọn non thiếu dưỡng chất nên bị trắng hoặc xoắn. Mình chưa chắc 100% vì chưa biết nitrate, phosphate và sắt trong bể đang ở mức nào. Cẩm nang nói rõ đèn quá lâu, quá mạnh là thủ phạm hay gặp của rêu hại, còn phần ngọn trắng xoắn thì mình dựa trên kinh nghiệm chung.
> 1. Giảm đèn còn 6 đến 8 giờ mỗi ngày, cố định giờ bật tắt, rồi tăng dần nếu cây khỏe.
> 2. Đo nitrate và phosphate; nếu gần bằng 0 thì bổ sung dinh dưỡng đến khoảng N 10 đến 20 p…

**Plain** (2889 characters):

> Hiện tượng rêu bùng phát kèm cây xoắn ngọn, trắng ngọn thường do **mất cân bằng dinh dưỡng và ánh sáng**, hoặc **thiếu vi lượng (đặc biệt là sắt)**. Bạn có thể xử lý theo các bước sau.
> 
> ## 1. Kiểm tra nước trước
> Nên dùng bộ test (NH₃/NH₄⁺, NO₂⁻, NO₃⁻, PO₄³⁻, pH, KH, GH). Nếu chưa có, ít nhất hãy để ý:
> - **Amoniac hoặc nitrit > 0**: có thể do cá quá tải, cho ăn dư, lọc chưa chín hoặc thiếu vi sinh. Đây là nguyên nhân nguy hiểm nhất, phải thay nước ngay.
> - **Nitrat và photphat cao**: là "thức ăn" của rêu. Nên giữ nitrat dưới khoảng 20–30 mg/L.
> 
> ## 2. Giảm ánh sáng và kiểm soát thời gian chiếu s…

### algae-08 · post · ours wins (7.75 · 5)

**Asked:** Em mới chơi, bể đúc 50cm, lúc đầu nuôi 9 mún + 3 bảy màu + 2 sọc ngựa, giờ là 10 bảy màu, 9 sọc ngựa, 5 mún đỏ với 2 cây ráy. Bể không trải nền, chỉ có vài hòn đá; có lọc thác (có lúc chạy cả ngày, có lúc em không bật) và đèn RGB 9W, ban ngày bật trắng khoảng 10 tiếng, tối chuyển đèn màu đến lúc đi ngủ mới tắt. Cho ăn ngày 2 lần. Được hơn 3 tuần thì tảo nâu bám đầy bể, mún với bảy màu ăn hằng ngày cũng không hết, nước đục đục như phân cá rã ra. Tuần thay 50% nước vẫn đục, thành bể có một lớp mờ mờ như rêu tảo bám. Giờ thì thay nước xong được vài ngày là nước lại chuyển xanh đục, tuần nào cũng phải thay gần như hết nước. Lọc thác không ăn thua, em đang tính mua lọc thùng Sunsun 350K thay vào. Do lọc hay do gì, làm sao để nước luôn trong?

**Judge:** X chẩn đoán đúng (quá tải cá, thức ăn, đèn, lọc tắt bật) và đưa ra kế hoạch gọn, có thứ tự, có mốc theo dõi, lại khuyên chưa vội mua lọc thùng. Y dài dòng, đếm sai số cá, hiểu nhầm 'bể đúc' là bể xi măng và gợi ý cây không hợp bể nhỏ. / I'd rather the hobbyist got Y. It names the cause (too many fish, too much food, light on too long, filter switched on and off) and gives clear steps in order. It also says to fix those before buying the 350K Sunsun canister and what to watch afterwards. X reads "bể đúc" as a cement tank, which is wrong, miscounts the fish, contradicts itself on the main cause and is padded.

**Ours lacks:** figures. **Plain lacks:** too-long, wrong.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là bể đang bị quá tải dinh dưỡng: cá quá đông so với bể 50cm, cho ăn hai lần một ngày, đèn bật gần 12 tiếng kể cả đèn màu buổi tối, và lọc lúc tắt lúc bật nên thức ăn thừa và phân cá phân hủy liên tục. Đó là thức ăn cho tảo xanh và vi khuẩn nở ra, nên nước đục xanh lại ngay sau mỗi lần thay. Lớp nâu bám kính là tảo silic, hay gặp ở bể còn mới. Mình khá chắc về hướng này, nhưng chưa biết ammonia và nitrite của bạn, nên đo trước là việc cần làm đầu tiên.
> 1. Đo ammonia và nitrite ngay hôm nay. Nếu một trong hai trên 0, đừng thay 50% nữa, chỉ thay khoảng 20 đến 30% mỗi…

**Plain** (2806 characters):

> # Nguyên nhân chính: quá tải cá và thức ăn, cộng thêm ánh sáng quá nhiều
> 
> Lọc thác không đủ vì bể đang chứa nhiều chất thải hơn khả năng phân hủy của hệ vi sinh. Lọc thùng có thể giúp, nhưng nếu chỉ thay lọc mà không sửa các yếu tố dưới đây thì nước vẫn sẽ đục lại.
> 
> **1. Mật độ cá quá cao.** Bể 50cm với khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ) là khá đông. Mỗi con thải ra amoniac, và bể non chưa đủ vi khuẩn để xử lý hết.
> 
> **2. Cho ăn quá nhiều.** Thức ăn thừa phân hủy và làm nước đục, làm tăng dinh dưỡng cho tảo. Cho ăn 2 lần/ngày là ổn, nhưng mỗi lần chỉ nên cho lượng cá ăn hế…

### algae-08 · tank · ours wins (7.75 · 4.25)

**Asked:** Bể tôi thay nước xong vài ngày lại xanh đục và bám tảo nâu, làm sao giữ nước trong?

**Judge:** X dùng đúng chi tiết của bể này: đèn trắng 10 tiếng cộng đèn màu buổi tối, thay gần 100% mỗi tuần, cho ăn 2 lần, chỉ có 2 cây ráy. X đưa các bước theo thứ tự rõ ràng, có cả việc cần theo dõi. Y viết chung chung cho bể nào cũng được và dài. Y khuyên ngược với tình trạng thay nước của họ, gợi ý ốc ăn cây, rồi hỏi lại những thông tin đã có sẵn. / Y nói đúng các nguyên nhân có thật trong bể này: đèn bật khoảng 10 giờ cộng thêm đèn màu buổi tối, cho ăn 2 lần mỗi ngày, thay gần 100% nước và chỉ có 2 cây ráy. Y cũng đưa ra các bước theo thứ tự và dặn những dấu hiệu cần theo dõi. X là lời khuyên chung cho bể nào cũng được, có vài ý sai, và cuối bài còn hỏi lại những thông tin mà ứng dụng đã có sẵn.

**Ours lacks:** diagnosis, figures. **Plain lacks:** tank-fit, too-long, wrong, plan.

**Ours** (read 2 pages, stopped at the tools limit):

> Nước xanh đục lặp lại sau mỗi lần thay thường là tảo phù du nở rộ. Bể của bạn có vài điểm dễ gây ra chuyện này: đèn sáng khoảng 10 giờ ban ngày rồi còn bật đèn màu buổi tối, cho ăn 2 lần mỗi ngày với khoảng 24 con cá, và thay gần 100% nước mỗi tuần làm nước dao động mạnh, trong khi chỉ có 2 cây ráy để tranh dinh dưỡng với tảo. Lớp nâu bám kính nhiều khả năng là tảo silic, hay gặp khi bể nhiều sáng và nước dư silicat. Handbook chưa có trang riêng cho tảo nâu nên phần này mình nói theo kinh nghiệm chung.
> 1. Cắt đèn xuống khoảng 6–8 giờ mỗi ngày và tắt đèn màu buổi tối.
> 2. Ngừng thay gần 100% nư…

**Plain** (2142 characters):

> Nước xanh đục và tảo nâu bám thường do **dư dinh dưỡng + dư ánh sáng**, và thay nước chỉ xử lý được triệu chứng tạm thời. Muốn giữ nước trong lâu dài, bạn cần xử lý nguyên nhân.
> 
> ## 1. Kiểm soát ánh sáng
> - Chỉ bật đèn **6–8 giờ/ngày**, hẹn giờ bằng ổ cắm timer.
> - Không đặt bể gần cửa sổ hoặc chỗ có nắng trực tiếp.
> - Nước xanh lá đục (tảo lơ lửng) thường do đèn quá sáng hoặc quá lâu.
> 
> ## 2. Giảm dinh dưỡng thừa
> - **Cho cá ăn ít lại**: chỉ cho ăn lượng cá ăn hết trong 2–3 phút, cách 1–2 ngày nếu cần.
> - **Hút đáy (siphon) mỗi tuần** để loại bỏ thức ăn thừa, phân cá và mùn bã.
> - **Đừng thay nước …

### algae-09 · post · plain wins (6.5 · 8)

**Asked:** Có cách nào trị rêu xanh nước không ạ? Em được cho cái bể đúc khá to nên phải để ngoài ban công. 2-3 tháng đầu chỉ bị bám rêu lên thành bể, phải cọ rêu thay nước nhưng nước vẫn trong. Giờ không hiểu sao cứ thay nước được khoảng 3 tuần là nước xanh lè, cá chết lăn quay. Bể có sục khí với lọc tuần hoàn thường thôi, không làm thủy sinh, đáy trống.

**Judge:** Y gives the same correct diagnosis (sunlight plus nutrient buildup, low oxygen at night), but it also fits this hobbyist's case better. It points out that cement in a cast tank can push pH up, gives a shading percentage, and suggests floating plants. It also mentions a backup air pump in case the power cuts out, and gives a rescue step for fish that are still alive. X is correct and concise. But it tells them to move a large cast tank, which is hard to do, and it ignores the cement-pH issue. / X gives the reader more to work with for this tank: shade cloth covering 50–70% plus floating plants like bèo and lục bình, which are cheap and easy to find in Vietnam, weekly siphoning of the bare bottom, warning against changing almost all the water at once, a possible pH problem from a cement tank, stocking density, and a backup air pump for power cuts. Y is correct and neatly ordered with good follow-up, but it is thinner, and it tells them to move a big tank that they said has to stay on the balcony.

**Ours lacks:** tank-fit, figures. **Plain lacks:** too-long.

**Ours** (read 1 pages):

> Nhiều khả năng bể ngoài ban công đang nhận nắng, và nước thay ra không đủ nên nitrat, phosphat cùng chất thải tích lại sau khoảng 3 tuần, tảo nở rộ thành nước xanh. Mình chưa chắc hẳn vì chưa đo được nitrat và phosphat, nên bạn đo thử để xác nhận. Cá chết nhiều khả năng do ban đêm tảo dùng hết oxy, hoặc khi tảo tàn đi làm oxy tụt và amoniac tăng.
> Các bước nên làm:
> 1. Dời bể khỏi chỗ nắng chiếu trực tiếp, hoặc che bớt bằng tấm lưới đen hoặc tấm che.
> 2. Cho ăn ít lại, chỉ cho lượng cá ăn hết trong vài phút.
> 3. Thay 20–30% nước ngay, rồi duy trì thay ít nhất 20% mỗi tuần để kéo nitrat và phospha…

**Plain** (2214 characters):

> Nước xanh lè thường do **tảo đơn bào** bùng phát. Bể ngoài trời, đáy trống, có nhiều cá, cho ăn đều thì rất dễ gặp. Chu kỳ khoảng 3 tuần cho thấy dinh dưỡng (phân cá, thức ăn thừa) tích tụ dần rồi tảo bùng lên.
> 
> **Cá chết đột ngột có thể do:**
> - **Thiếu oxy vào ban đêm**: tảo tạo nhiều oxy ban ngày nhưng tiêu thụ oxy ban đêm. Khi tảo chết hàng loạt, oxy tụt rất nhanh. Cá thường nổi đầu, há miệng vào sáng sớm.
> - **Amoniac/nitrit tăng**: do phân và thức ăn thừa phân hủy, nhất là khi lọc sinh học yếu.
> - **pH dao động mạnh**: ban ngày pH lên cao vì tảo quang hợp, và bể đúc mới thường có pH cao do…

### algae-09 · tank · ours wins (7.5 · 4.5)

**Asked:** Bể tôi cứ khoảng ba tuần sau khi thay nước lại xanh lè và cá chết, trị sao?

**Judge:** X nêu đúng nguyên nhân: bể ngoài ban công bị nắng trực tiếp và không có cây nên tảo phù du nở lại. X cũng cho các bước theo thứ tự và dấu hiệu cần theo dõi. Y viết chung chung, đoán sai nguyên nhân là lỗi chu trình nitơ, gợi ý con vật ăn tảo không hợp với nước xanh, và hỏi lại những thông tin mà app đã có. / Y uses the hobbyist's own setup: balcony sun, no plants, bare bottom. It names the real cause, phytoplankton blooms driven by sunlight, and links the fish deaths to oxygen crashes at night, then gives clear steps in order with things to watch. X is generic: it blames the filter and nitrogen cycle, treats sun only as a maybe ('gần cửa sổ'), and ends by asking for details the app already has.

**Ours lacks:** tank-fit, figures. **Plain lacks:** diagnosis, tank-fit, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Nước xanh lặp lại sau khoảng ba tuần thường là do tảo phù du nở lại vì bể nhận quá nhiều ánh sáng và chưa có cây để tranh dinh dưỡng. Bể của bạn đặt ngoài ban công dưới nắng tự nhiên, không có CO₂, không có cây và đáy trống, nên thay nước xong nước vẫn có chất dinh dưỡng để tảo sinh lại. Cá chết nhiều khả năng do tảo nở dày làm thiếu oxy ban đêm, hoặc amoniac tăng khi tảo tàn. Mình chưa thấy cá nào trong bể đã lưu của bạn, nên bạn xem lại giúp mình có đang nuôi con nào không.
> 1. Dời bể ra khỏi nắng trực tiếp hoặc che kín bể để cắt ánh sáng ngay hôm nay.
> 2. Đo oxy và amoniac bằng bộ test; nếu …

**Plain** (2324 characters):

> Bể xanh lè (nước xanh do tảo đơn bào hoặc vi khuẩn bùng phát) và cá chết sau mỗi vài tuần thường có nguyên nhân liên quan đến **chu trình nitơ bị phá vỡ** hoặc **nước máy/cách thay nước**. Chu kỳ 3 tuần khá gợi ý: khi bạn thay nước hoặc vệ sinh lọc quá mạnh, vi khuẩn có lợi bị mất, amoniac/nitrit tăng, rồi tảo bùng lên khi hệ vi sinh tái lập.
> 
> ## 1. Xử lý ngay khi đang xanh và cá yếu
> - **Test nước** (amoniac NH3/NH4⁺, nitrit NO2⁻, nitrat NO3⁻, pH, nhiệt độ). Nếu amoniac hoặc nitrit > 0, đây là nguyên nhân chính làm cá chết.
> - **Thay 30–50% nước** bằng nước đã khử clo, nhiệt độ gần bằng nước b…

### algae-10 · post · ours wins (7 · 5)

**Asked:** Có cách nào cứu bể em không: rêu hại dạng sợi màu nâu nhỏ nhỏ bám trên lá cây, sau đó bụi nền dính đầy vào. Thả nhiều tép thì sạch ngay, nhưng bể em nuôi nhiều thần tiên, thả tép vào thì tép bị ăn hết trước cả rêu.

**Judge:** X gives a clearer diagnosis (brown diatoms with slime trapping the substrate dust, common in new tanks or silica-rich water) and offers fitting substitutes for the shrimp: nerite snails and otos. Y is longer and gets several Vietnamese names wrong (ốc táo, cá chét đuôi đỏ, rêu hornwort), and it never points out that the algae is likely diatoms. / Y nói ra nguyên nhân hợp lý (tảo silic/nhớt giữ bụi nền), đưa các bước gọn theo thứ tự, có mốc theo dõi 2–3 tuần và gợi ý cá dọn rêu an toàn khi nuôi chung với thần tiên. Tuy vậy, Y nhắc "handbook" và "công cụ tank-mates" khá gượng với người đọc. X dài hơn nhưng nhầm nhiều tên loài (gọi ốc táo là nerite, tên cá bút chì, cá lau kính), dễ làm người chơi ở VN mua nhầm con.

**Ours lacks:** follow-up, local, figures. **Plain lacks:** diagnosis, too-long, local, wrong.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể bạn có khả năng là tảo nâu (tảo silic) hoặc rêu sợi nâu, và bụi nền bám vào là do lớp rêu nhớt giữ bụi lại. Nguyên nhân hay gặp là bể còn mới, nước nhiều silica, hoặc đèn bật quá lâu so với lượng phân. Mình chưa biết chắc loại nào vì chưa thấy bể; bạn cho biết bể chạy được bao lâu và đèn bật mấy giờ mỗi ngày để mình khoanh hơn.
> 1. Giảm đèn xuống còn khoảng 6 đến 8 tiếng mỗi ngày, vì handbook nói rêu sợi mới chớm nên giảm giờ bật đèn ngay.
> 2. Dùng bàn chải đánh răng cuốn rêu ra khỏi lá, cắt bỏ lá già phủ rêu nặng, rồi hút bụi nền.
> 3. Thay khoảng 20 đến 30% nước mỗi tuần, sau đó cân lại phân…

**Plain** (2133 characters):

> Bể của bạn vẫn cứu được. Rêu nâu dạng sợi thường do ánh sáng, dinh dưỡng và cân bằng CO2 chưa ổn, nên cần xử lý cả nguyên nhân lẫn phần rêu đã có.
> 
> **1. Xử lý ngay**
> - Dùng bàn chải đánh răng cũ hoặc que quấn bông để gỡ sợi rêu trên lá. Với cây cứng như anubias, java fern thì cắt bỏ lá quá nhiễm.
> - Hút đáy (siphon) kỹ để loại bụi và mảnh thức ăn thừa đang là nguồn dinh dưỡng cho rêu.
> - Thay 25-30% nước, lặp lại mỗi tuần 2-3 lần trong 2-3 tuần đầu.
> - Vệ sinh lưới lọc, sứ lọc, nhưng đừng rửa bằng nước máy quá nhiều để giữ vi sinh.
> 
> **2. Điều chỉnh nguyên nhân**
> - **Ánh sáng:** giảm còn 6-8 giờ/…

### algae-10 · tank · plain wins (4 · 6.25)

**Asked:** Lá cây trong bể tôi bị rêu sợi nâu bám, mà thả tép thì bị cá ăn mất, xử lý sao?

**Judge:** Y đưa ra cách thay thế thực tế (ốc nerite, otto, SAE) và có cách giảm nguyên nhân gây rêu (giờ đèn, thay nước), dù nói chung chung và không nhắc tới cá thần tiên. X khăng khăng thả tép lại kèm mẹo sai (chờ 5–7 ngày, thuần 10 phút), trong khi tép vẫn sẽ bị thần tiên ăn. / X is the better answer. It offers algae eaters that can live with angelfish (Nerite snails, otto, bristlenose pleco) and covers light and feeding properly. Y keeps trying to make shrimp work in an angelfish tank, and its night-release tip doesn't actually work.

**Ours lacks:** tank-fit, wrong, figures. **Plain lacks:** tank-fit, diagnosis, too-long, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Rêu sợi nâu bám lá thường là rêu nâu silic nếu bể còn mới (khoảng 3–4 tuần đầu), còn nếu bể đã chạy lâu thì nhiều khả năng là rêu tóc do thiếu CO2. Hai loại nhìn giống nhau nên bạn xem bể mới hay cũ trước. Tép bị cá ăn vì tép nhát, ban ngày hay trốn và bò ra lộ diện, nên cần tạo chỗ ẩn và chọn thời điểm thả hợp lý.
> 1. Chà rêu bằng mút hoặc bàn chải đánh răng khi thay nước; lá mỏng thì chà nhẹ, lá nặng rêu thì cắt bỏ.
> 2. Chờ bể chạy khoảng 5–7 ngày rồi mới thả tép, ngâm bịch tép trong bể khoảng 10 phút trước khi thả.
> 3. Thả tép vào lúc đèn tắt hoặc tối, vì tép thường ra ăn rêu ban đêm khi cá đ…

**Plain** (2088 characters):

> Rêu sợi nâu thường xuất hiện khi bể dư dinh dưỡng, đèn sáng hoặc chiếu quá lâu, hoặc nước không ổn định. Bạn nên xử lý cả nguyên nhân lẫn rêu đang có.
> 
> **1. Xử lý rêu đang bám**
> - Dùng tay (đeo găng) hoặc bàn chải mềm lau, gỡ sợi rêu khỏi lá. Với rêu sợi thì gỡ bằng tay hoặc dùng que/đũa cuốn rêu rồi kéo ra.
> - Cắt bỏ những lá đã bị bám nặng, đặc biệt là lá già.
> - Nếu rêu bám quá nhiều, có thể tạm dùng H₂O₂ (oxy già) nhỏ trực tiếp lên chỗ rêu (liều thấp, dùng ống tiêm, tránh dính vào cá và cây mềm), rồi thay nước ngay sau đó. Cách này có thể làm hại cây nhỏ nên thử trước trên một lá.
> 
> **2. Giả…

### algae-11 · post · plain wins (6 · 7)

**Asked:** Nhà mình dùng nước máy làm nước bể cá. Trước ở chỗ khác, thả cá vào mấy tháng mới phải thay nước một lần. Giờ chuyển về chỗ mới, để bể không có cá (chỉ 1 con cá dọn bể) thì không sao, nhưng cứ thả cá vào chưa đến một tuần là nước chuyển sang màu xanh lá cây, xanh đậm dần rồi cá chết. Bể không, không có cây cỏ gì cả. Trước có bỏ mấy gói tăng oxy gì đó, giờ không cho cũng vẫn vậy. Bắt bệnh giúp mình với.

**Judge:** Both answers name an uncycled filter plus an algae bloom as the cause. Y fits this tank better: it explains why the tank was fine with only the cleaner fish, and it points out that green water drains oxygen at night, so it adds aeration and plants. Those are the real fixes for fish dying in green water. X misses the oxygen risk. Y is long and gives one weak product example. / X gives two causes: the bacteria in the filter were lost in the move and need to rebuild (cycle), and green water drains oxygen at night, which kills fish fast. X explains why the tank was fine with only one cleaner fish, and it adds aeration, feeding less and adding plants. Y is shorter and correct but never mentions the night oxygen drop or aeration, and it uses less of what the hobbyist told us.

**Ours lacks:** tank-fit, follow-up, diagnosis. **Plain lacks:** too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Nhiều khả năng bể mới chưa có vi sinh lọc đủ, nên khi thả cá vào thì amoniac tăng vọt. Amoniac và chất thải dư làm tảo phù du nở rộ thành nước xanh, và cá chết vì độc. Chuyển bể sang chỗ mới cũng dễ làm mất lớp vi khuẩn cũ trong lọc. Nước máy chỗ mới cũng có thể chứa cloramin, khác với chỗ cũ. Mình chưa đo được thông số nào nên chưa chắc chắn, bạn cần đo để xác định.
> 1. Mua bộ test amoniac, nitrit và nitrat, rồi đo nước bể hiện tại.
> 2. Nếu amoniac hoặc nitrit lớn hơn 0, ngừng cho ăn và thay khoảng 30–50% nước bằng nước đã khử clo.
> 3. Mỗi lần thay nước, dùng chất khử clo ghi rõ xử lý được cả c…

**Plain** (3129 characters):

> Triệu chứng này khớp nhất với **chu trình nitơ chưa ổn định** kết hợp với **tảo nở hoa (nước xanh)**. Cá chết thường do amoniac/nitrit tăng cao hoặc thiếu oxy khi tảo bùng lên.
> 
> ## Nguyên nhân có thể
> 
> **1. Lọc sinh học chưa hoạt động tốt ở chỗ mới (khả năng cao nhất)**
> - Ở chỗ cũ, bể chạy mấy tháng nên vi khuẩn có lợi trong vật liệu lọc và thành bể đã phát triển đủ.
> - Khi chuyển đi, vi khuẩn có thể bị giảm mạnh (rửa vật liệu lọc bằng nước máy có clo, thời gian gián đoạn, hoặc bể mới setup lại).
> - Khi thả cá, chất thải làm amoniac tăng. Bể chưa đủ vi khuẩn để chuyển hóa nên amoniac và nitrit t…

### algae-11 · tank · ours wins (7.5 · 6)

**Asked:** Bể tôi cứ thả cá vào là chưa tới một tuần nước xanh lè rồi cá chết, vì sao?

**Judge:** Hai câu trả lời đều chẩn đoán đúng là bể chưa cycle và tảo nở theo amoniac dư. X dùng đúng thông tin của bể này (một con cá dọn bể, bể không cây, mấy tháng không thay nước) và đưa ra các bước gọn, có thứ tự. Y viết chung chung và dài, lại hỏi lại những điều ứng dụng đã có sẵn như nước máy. / Y reads the hobbyist's tank details (one cá dọn bể, no plants, months without a water change) to pin the cause on a tank that never cycled or lost its bacteria. It then gives short steps in order with what to watch for. X is correct but generic, runs longer than it needs to, and asks for details the app already holds, like the tap water. Neither answer brings up the oxygen packs they used before.

**Ours lacks:** figures, tank-fit. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là bể chưa đủ vi sinh để xử lý chất thải của cá. Khi thả cá vào, amoniac tăng vọt và cá chết, còn nước xanh là tảo phù du nở theo chất dinh dưỡng đó. Bể của bạn chỉ có một con cá tỳ bà, không có cây, và từng để nhiều tháng không thay nước, nên khả năng cao là bể chưa cycle hoặc vi sinh đã mất. Mình chưa chắc, cần đo amoniac và nitrit để xác nhận.
> 1. Ngừng cho ăn và đo amoniac, nitrit nếu bạn có bộ test.
> 2. Thay khoảng 30 đến 50% nước bằng nước đã khử clo, không thay hết một lần.
> 3. Giữ lọc và sủi chạy liên tục để đủ oxy, nhất là ban đêm.
> 4. Chưa thả thêm cá; đợi bể…

**Plain** (2070 characters):

> Nước xanh lè và cá chết trong vòng một tuần thường có hai nguyên nhân chính, và chúng thường đi cùng nhau:
> 
> **1. Bể chưa chu trình nitơ (chưa "chín bể") – nguyên nhân hay gặp nhất**
> - Cá thải ra **amoniac (NH₃)** qua mang, phân và thức ăn thừa. Amoniac rất độc.
> - Bình thường, vi khuẩn có lợi trong bể sẽ chuyển amoniac → **nitrit (NO₂⁻)** → **nitrat (NO₃⁻)** ít độc hơn. Bể mới chưa có đủ vi khuẩn này nên amoniac và nitrit tích tụ, làm cá bị ngộ độc, mang bị tổn thương và chết.
> - Amoniac và nitrat dư cũng là "thức ăn" cho tảo, nên tảo bùng nổ và làm nước xanh.
> 
> **2. Tảo đơn bào nở hoa (nước xan…

### setup-01 · post · plain wins (5.5 · 7.25)

**Asked:** Vợ em vừa bắt em đầu tư một bể thủy sinh, em đặt mua trọn bộ: bể dài 1m + chân gỗ + sục + lọc + đèn (2 bóng LED) + sưởi. Em ở Hà Nội, trời đang lạnh. Em mù mờ khoản này nên hỏi: 1) Bên setup bảo bật đèn liên tục 3 ngày đầu rồi khoảng 8h/ngày, nhưng em đọc trên mạng thì tuần đầu chỉ bật 50% công suất rồi tăng dần lên 100%, 8h/ngày để tránh rêu và cho cây thích nghi. Cách nào đúng? 2) Cho cá ăn tần suất thế nào? 3) Sưởi có nên bật 24/24 không? 4) Có nên mua thêm bình CO2 không, vì em thấy phải có cái này cây mới đủ chất? 5) Lọc họ trang bị chỉ qua sợi bông đơn giản, em đọc thấy phải lọc qua sứ, mà lọc ngoài thì không có chỗ đặt vì bể dùng chân gỗ, không có tủ. Lọc như của em có ổn không? 6) Nên thay nước mấy ngày một lần, lúc mới setup và lúc đã ổn định?

**Judge:** Y trả lời đủ cả 6 câu, rõ ràng, có số liệu và nhắc đúng chuyện trời lạnh ở Hà Nội, nước máy có clo, lọc treo hoặc lọc bọt biển cho bể đặt trên chân gỗ. X thì vội, đáp ít về sưởi, CO2 và lọc, lại có câu về sưởi dễ hiểu nhầm thành nên rút điện. / X trả lời đủ cả 6 câu và giải thích rõ chu trình nitơ, bộ test, cách chọn lọc thay khi không có tủ, nên rất hợp với người mới. Lỗi của X là khuyên ít thay nước tuần đầu. Y sát cách chơi thủy sinh ở Việt Nam hơn (thay 50% mỗi ngày, bỏ thêm sứ vào lọc), nhưng sơ sài hơn và câu về sưởi dễ gây hiểu nhầm.

**Ours lacks:** plan, tank-fit, follow-up, too-thin, diagnosis. **Plain lacks:** too-long, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Cách đúng là cách trong cẩm nang: tuần đầu không chiếu đèn mạnh. Bên setup đang bật đèn quá sớm và quá lâu, nên bạn nên hỏi lại họ và chỉnh lại lịch đèn.
> 1. Tuần đầu hạ đèn xuống khoảng 50% và chỉ bật khoảng 5 tiếng mỗi ngày.
> 2. Sang tuần thứ hai và thứ ba, tăng dần lên khoảng 70% rồi 80%, giờ chiếu lên 7 rồi 8 tiếng.
> 3. Tuần đầu thay khoảng 50% nước mỗi ngày, tắt lọc khi thay. Chờ khoảng 7 đến 10 ngày sau khi set rồi mới thả cá.
> 4. Cho cá ăn một lần mỗi ngày, lượng vừa ăn hết trong vài phút. Nếu cá bụng căng hoặc thải nhiều phân thì giảm bớt.
> 5. Sưởi nên đặt bằng núm chỉnh nhiệt (khoảng 24 đ…

**Plain** (3730 characters):

> Em hỏi đúng lúc, vì mấy việc đầu tiên quyết định bể có ổn định hay không. Dưới đây là trả lời từng câu.
> 
> ## 1) Đèn: bật thế nào?
> 
> Cả hai cách trên mạng đều có cơ sở, nhưng cách **giảm dần** an toàn hơn. Bể mới chưa có hệ vi sinh ổn định nên dễ bùng rêu nếu đèn sáng quá lâu hoặc quá mạnh.
> 
> Gợi ý:
> - **Tuần 1–2:** 4–6 giờ/ngày, độ sáng khoảng 50–60% (nếu đèn chỉnh được). Nếu đèn không chỉnh được, có thể bật 4–5 giờ.
> - **Tuần 3–4:** tăng lên 6–7 giờ, tăng dần độ sáng.
> - **Từ tuần 4 trở đi:** 6–8 giờ/ngày là đủ. Không nên vượt 8 giờ.
> 
> Nên dùng ổ hẹn giờ cắm điện để bật/tắt đúng giờ, cây và cá sẽ c…

### setup-01 · tank · plain wins (4.5 · 6)

**Asked:** Bể mới mua của tôi nên bật đèn, sưởi, thay nước thế nào và có cần mua thêm CO2 không?

**Judge:** Neither answer uses the tank's details: the 1 m tank, the sponge filter, the Hanoi winter, or the question of running the lights for 3 days straight versus starting at 50%. Y is better because it covers cycling, heater wattage with extra power for a cold room, heater safety, rinsing filter media, and CO₂ options including liquid carbon. X is thin, includes a made-up pearling time, and attaches a canister-filter excerpt that doesn't apply to this tank. / Cả hai câu trả lời đều chung chung, không dùng đến chi tiết bể 1m ở Hà Nội đang mùa lạnh, và không trả lời câu bật đèn 3 ngày liền hay 50% rồi tăng dần. X đầy đủ hơn vì có công suất sưởi (khoảng 1W/lít, phòng lạnh thì tăng thêm), lưu ý chỉ cắm sưởi khi đã ngập nước, và gợi ý carbon lỏng thay cho CO2. Y gọn và có thứ tự rõ hơn, nhưng có con số sủi bọt kiểu bịa và kèm đoạn trích về thiết bị CO2, lọc thùng không hợp với bể của người hỏi.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** tank-fit, too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Bể mới thường cần chạy ổn định trước khi thả cá, và đèn, sưởi, thay nước, CO2 đều nên làm theo thứ tự. Handbook khuyên bật đèn khoảng 6 đến 8 tiếng mỗi ngày, giữ cố định một khung giờ; CO2 không bắt buộc, chỉ cần khi bạn muốn bể trồng cây công nghệ cao với đèn mạnh. Phần sưởi, chu trình nitơ và tỉ lệ thay nước mình đưa theo kinh nghiệm chung vì các trang đó chưa đủ chi tiết.
> 1. Lắp lọc và sưởi, chạy máy với nước thật vài ngày, đặt nhiệt độ theo loài cá bạn định nuôi (cá nhiệt đới thường khoảng 24 đến 26 độ).
> 2. Bật đèn theo timer cố định 6 đến 8 tiếng mỗi ngày, chưa cần bật cả ngày để tránh t…

**Plain** (2787 characters):

> # Hướng dẫn cài đặt bể cá mới
> 
> ## 1. Chu trình nitơ (quan trọng nhất)
> 
> Trước khi thả cá, bể phải "chín" để vi khuẩn có lợi phát triển, phân huỷ amoniac và nitrit độc từ cá và thức ăn thừa.
> 
> - Lắp đặt đầy đủ: lọc, nền, trang trí, cây thủy sinh (nếu có). Đổ nước, chạy lọc.
> - Dùng bộ test (NH3/NH4, NO2, NO3) để theo dõi. Có thể thêm một chút thức ăn cá hoặc amoniac nguyên chất để tạo nguồn "thức ăn" cho vi khuẩn. Vi khuẩn sinh học dạng chai có thể giúp đẩy nhanh quá trình.
> - Quá trình thường kéo dài 3–6 tuần. Khi amoniac và nitrit đều về 0 và có nitrat, bể đã sẵn sàng.
> - Trong thời gian này, **k…

### setup-02 · post · plain wins (3 · 6.5)

**Asked:** Mình đang gom đồ để set hồ 60x40x40 chơi rêu taiwan, trân châu ngọc trai, la hán và ráy, bố cục bonsai. Phân nền dùng Gex xanh. Tư vấn giúp mình nên mua đèn và lọc loại nào?

**Judge:** Y hiểu đúng đây là bể trồng cây. Y đưa thông số đèn và lọc hợp với bể 96 lít, gợi ý các dòng đèn, lọc có bán ở Việt Nam và có tính tới nền Gex, dù nói sai giá Twinstar. X hiểu nhầm tên cây thành tên cá và chỉ khuyên chung chung, gần như không giúp người hỏi chọn được đồ để mua. / X đưa ra thông số và tên đèn, lọc cụ thể, bán ở Việt Nam, đúng hồ cây 96 lít, chỉ sai vài chi tiết về sản phẩm. Y hiểu nhầm la hán và trân châu ngọc trai là cá, lại hầu như không gợi ý thiết bị nào cụ thể.

**Ours lacks:** wrong, tank-fit, figures. **Plain lacks:** follow-up, too-long.

**Ours** (read 0 pages, stopped at the tools limit):

> Mình chưa mở được nội dung chi tiết của các cẩm nang đèn và lọc, nên phần chọn thiết bị dưới đây mình nói theo kinh nghiệm chung cho bể cây thấp sáng. Trước khi mua, bạn nên xem lại hai điều: La Hán (Flowerhorn) lớn khá nhanh, có thể tới 30 cm trở lên, và thường nhổ hoặc ăn cây, nên khó hợp với bể 60x40x40 bố cục bonsai có rêu Taiwan và ráy. Còn trân châu ngọc trai là cá nào thì bạn cho mình biết tên khoa học hoặc ảnh, vì có loài nhỏ hợp bể trồng cây và có loài lớn hơn.
> Về đèn: rêu Taiwan và ráy đều chịu sáng vừa phải, nên bạn chọn đèn LED dải hoặc đèn thanh chuyên thủy sinh, ánh sáng trắng k…

**Plain** (2038 characters):

> Với hồ 60x40x40 (khoảng 96 lít) trồng rêu Taiwan, trân châu, ráy, kiểu bonsai và nền Gex xanh, bạn nên chọn **đèn LED cường độ vừa phải** và **lọc có lưu lượng dịu, điều chỉnh được**.
> 
> ## 1. Đèn
> 
> **Thông số nên chọn:**
> - Dải ánh sáng: **trắng 6500K–8000K**, có thể thêm xanh lam nhẹ để cây lên màu đẹp
> - Công suất khoảng **40–50W** (tương đương 0,4–0,5 W/lít)
> - Có **chỉnh độ sáng** và **hẹn giờ** (khoảng 6–8 giờ/ngày)
> 
> **Gợi ý:**
> - **Chihiros C series** (ví dụ C 60) hoặc **Chihiros WRGB II Slim 60**: đẹp, dễ chỉnh, phổ biến ở Việt Nam
> - **Twinstar** hoặc **Ista** nếu muốn giá mềm hơn
> - **Nicrew…

### setup-02 · tank · ours wins (7 · 4)

**Asked:** Bể tôi sắp set nên mua đèn và lọc loại nào?

**Judge:** X is better. It works from the real tank (60 cm, about 96 litres, bonsai layout, their plants) and gives a light length, colour temperature, lighting hours, how to choose a filter, and a cycling step. It does miss that trân châu needs stronger light, and it names no brands. Y asks again for details that are already known and gives generic rules, including the outdated watts-per-litre figure, though it does name filter brands sold in Vietnam. / Y dùng đúng bể 60×40×40 (~96 lít) và bộ cây chịu bóng của bạn: khuyên đèn LED 60 cm cường độ vừa, có hẹn giờ 7–8 tiếng, và lọc chứa nhiều vật liệu, kèm trích cẩm nang. X hỏi lại những thông tin app đã có, chỉ đưa lời khuyên chung chung, và dùng quy tắc W/lít đã lỗi thời. Điểm yếu của Y: không có số lưu lượng lọc và không gợi ý mẫu đèn, lọc nào bán ở Việt Nam.

**Ours lacks:** figures, local. **Plain lacks:** tank-fit, asks-only.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể 60 x 40 x 40 cm (khoảng 96 lít) đang trồng bonsai với rêu, trân châu, la hán và ráy, bạn nên chọn đèn LED thủy sinh dài khoảng 60 cm có hẹn giờ, và lọc thùng hoặc lọc treo sau có nhiều vật liệu lọc. Cẩm nang không có model cụ thể cho đúng kích thước này, nên đây là hướng dẫn chung dựa trên các trang về đèn và lọc, cộng thêm kinh nghiệm của mình.
> 1. Đèn: chọn LED 60 cm, nhiệt màu khoảng 5000K đến 6500K, và chọn cường độ vừa phải vì rêu, la hán và ráy đều chịu bóng khá tốt. Cẩm nang nói cường độ đèn phụ thuộc loại cây bạn trồng.
> 2. Hẹn giờ: đặt đèn chạy khoảng 7 đến 8 tiếng mỗi ngày, nên…

**Plain** (1445 characters):

> Để chọn đúng, mình cần biết thêm vài thông tin:
> 
> - **Kích thước bể** (dài × rộng × cao, hoặc số lít)
> - **Nuôi gì:** cá cảnh (loại nào), tôm, hay bể thủy sinh có cây
> - **Có trồng cây không?** Đây là yếu tố quyết định nhiều nhất khi chọn đèn
> - **Ngân sách** dự kiến
> 
> Trong lúc chờ, bạn có thể tham khảo các nguyên tắc chung sau.
> 
> **Lọc**
> - **Bể dưới 30 lít:** lọc bọt biển (sponge filter) hoặc lọc hộp nhỏ. Nhẹ nhàng, an toàn cho cá betta, tôm, cá con.
> - **Bể 30–100 lít:** lọc treo sau (hang-on-back) như Sunsun, Atman, Jebao. Dễ lắp và bảo trì.
> - **Bể trên 100 lít hoặc nuôi nhiều cá:** lọc thùng (c…

### setup-03 · post · plain wins (4 · 8)

**Asked:** Em có cái bể đang bỏ không, hiện chỉ có mỗi bể, không đèn không lọc không gì hết. Với tầm 3-4 triệu thì nên làm gì để hồi sinh nó? Thủy sinh rong rêu cũng được, còn cá thì em thích kiểu thả nhiều con cá nhỏ tí ti.

**Judge:** Y chia ngân sách 3-4 triệu với giá sát thị trường Việt Nam, khuyên dùng lọc bọt biển cho cá nhỏ, kể tên cây dễ sống và cá nhỏ đàn, rồi đưa lộ trình chạy chu trình nitơ rõ ràng theo tuần. X bám vào con số 15 triệu không liên quan, ít số liệu cụ thể và khuyên thay 30% nước mỗi ngày trong tuần đầu, điều này không cần khi bể chưa có cá. / X chia sẵn ngân sách 3-4 triệu ra từng món, chỉ rõ nên dùng lọc bọt biển, cây dễ sống, cá nhỏ đi đàn, và có lộ trình theo tuần kèm chu trình nitơ. Y chủ yếu dẫn lại cẩm nang 15 triệu, chê ngân sách thấp, gợi ý sưởi đắt không hợp khí hậu Việt Nam, và không gợi ý tên cá cụ thể nào.

**Ours lacks:** figures, tank-fit, plan, local. **Plain lacks:** tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Với 3-4 triệu thì bạn làm lại được một bể thủy sinh low-tech nhỏ từ cái bể đang có, nhưng phải chọn đồ có ưu tiên. Cẩm nang tính cả bộ đồ (đèn, lọc, sưởi, nền, cây, cá) vào khoảng 15 triệu, và nói rằng chơi tiết kiệm cũng chỉ cần khoảng 2/3 con số đó, nên 3-4 triệu là dưới mức cẩm nang đề xuất. Mình khuyên bạn làm từng bước, mua đồ thiết yếu trước.
> 1. Kiểm tra bể: rửa sạch, thử rò rỉ, đo kích thước; cẩm nang nói bể nano khoảng 35-55 lít là dễ bắt đầu nhất.
> 2. Mua đèn đúng chiều dài bể: cẩm nang cho biết đèn Odyssea hoặc T5HO chỉ vài trăm nghìn, rẻ hơn nhiều so với đèn cao cấp.
> 3. Chọn lọc và …

**Plain** (2478 characters):

> Với 3-4 triệu, bạn hoàn toàn làm được một bể thủy sinh nhỏ, cây dễ sống và đàn cá nhỏ xinh. Mình gợi ý lộ trình như sau.
> 
> ## 1. Kiểm tra bể trước
> - Rửa sạch bằng nước, tuyệt đối không dùng xà phòng hay hóa chất.
> - Đổ đầy nước thử 1-2 ngày xem có rò rỉ ở keo silicone không. Nếu keo bong thì phải xử lý trước.
> 
> ## 2. Phân bổ ngân sách (ước tính, bể khoảng 30-60 lít)
> 
> | Hạng mục | Chi phí ước tính |
> |---|---|
> | Lọc bọt biển (sponge filter) + máy sủi khí | 150-250k |
> | Đèn LED thủy sinh 20-30W | 300-500k |
> | Nền: sỏi/cát + nền dinh dưỡng (nếu muốn cây khỏe) | 300-500k |
> | Máy sưởi (chỉ cần nếu nhà…

### setup-03 · tank · plain wins (5 · 7)

**Asked:** Tôi có bể trống và 3-4 triệu, nên mua gì để làm bể thủy sinh nuôi đàn cá nhỏ?

**Judge:** Y bám sát câu hỏi: chia ngân sách 3-4 triệu thành từng món, giá theo thị trường Việt Nam, có tính đến chuyện sưởi cho miền Bắc mùa đông và có nhắc chạy bể trước khi thả cá. Y còn vài lỗi nhỏ về cây và tép. X không chia tiền cho từng món, khuyên chọn bể trong khi người hỏi đã có bể, và gợi ý thả otto vào bể mới là không ổn. / X answers the actual question: it splits the 3-4 triệu budget into items with VND prices, gives a Vietnam-specific note on heaters for miền Bắc in winter, and covers cycling the tank. Y gives the right order of steps and good sizing rules, but it puts no money figures against the budget and gives advice on choosing a tank to someone who already has one.

**Ours lacks:** figures, tank-fit, plan. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Với 3-4 triệu và bể trống, bạn nên bắt đầu bằng một bể nano hoặc bể nhỏ khoảng 40-60 lít, rồi chi tiền cho lọc, đèn và nền trước, còn đá lũa và cây thì mua sau. Cẩm nang hướng dẫn người mới chọn bể nhỏ, lọc, đèn, phân nền và chờ vi sinh ổn định trước khi thả cá. Các giá cụ thể là ước lượng của mình, bạn cần hỏi cửa hàng để biết giá thật.
> 1. Đo kích thước trong của bể (dài x rộng x cao) rồi chọn lọc khoảng 10 lần thể tích bể mỗi giờ, ví dụ bể 60 lít thì lọc khoảng 600 lít/giờ.
> 2. Ưu tiên đèn LED chuyên cho thủy sinh đúng cỡ bể, kèm ổ hẹn giờ, rồi mua phân nền loại tốt. Bể 60 x 30 cm cần khoảng…

**Plain** (2414 characters):

> Với 3-4 triệu, bạn đủ để làm một bể thủy sinh cơ bản, đẹp và ổn định cho đàn cá nhỏ. Giá dưới đây là ước tính, khác nhau tùy cửa hàng và kích thước bể.
> 
> ## Danh sách nên mua (ước tính)
> 
> **1. Hệ thống lọc (~250-400k)**
> - Lọc treo thành bể hoặc lọc hộp kiểu HOB (ví dụ Sunsun, Resun) có công suất phù hợp thể tích bể.
> - Lọc nhẹ, êm, ít dòng chảy mạnh để cá nhỏ và cây không bị bật gốc.
> 
> **2. Đèn LED thủy sinh (~250-500k)**
> - Chọn đèn chuyên cho bể cây, ánh sáng trắng 6500-8000K.
> - Cây khỏe cần đèn đủ sáng, nên đây là khoản đáng tiền.
> 
> **3. Nền bể (~200-400k)**
> - Đất nền thủy sinh (aqua soil) giúp …

### setup-04 · post · plain wins (5 · 8)

**Asked:** Mình muốn set hồ 60x36x36 để trên kệ tivi phòng khách chung cư nên cần tinh gọn, không có chỗ cho bình CO2, thùng lọc. Phương án của mình: bố cục đá Tiger + rêu mini fiss và ráy lá nhỏ ở tiền cảnh, rong La Hán + dương xỉ Java ở hậu cảnh, đều là cây cần ít CO2. Mình tính dùng lọc thác. Bố cục vậy có ổn không, nên dùng nền nào và bao nhiêu?

**Judge:** Y trả lời thẳng câu hỏi "nền bao nhiêu": tính ra khoảng 8–9 lít nền cho đáy 60x36 dày 4 cm, đúng phép tính. Y còn đưa con số cho đèn và lưu lượng lọc thác, và cảnh báo tải trọng kệ tivi khoảng 110 kg, điều rất quan trọng với hồ đặt trong chung cư. X không nói lượng nền, chỉ bảo người chơi xem bao bì, và lại khuyên trải rêu mini lên sỏi. / X bám sát hồ 60x36x36 của bạn này: tính ra khoảng 8–9 lít nền cho lớp dày trung bình 4 cm, nói rõ chọn nền theo từng loại cây, cho lưu lượng lọc thác, chỉnh tiếng ồn, và cảnh báo sức chịu tải của kệ TV. Y không trả lời được câu hỏi "bao nhiêu nền" và nhìn chung mỏng hơn.

**Ours lacks:** figures, tank-fit, too-thin. **Plain lacks:** too-long, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Bố cục này khá ổn cho bể không CO2: đá Tiger, Java fern và ráy là nhóm cây chịu thiếu CO2, sống tốt khi bám lên đá hoặc gỗ chứ không cần chôn rễ. Điểm cần lưu ý là phần nền. Cẩm nang so sánh các loại nền sau 1 tháng không CO2 cho thấy nền đất hồ phủ (Tropica Powder Soil) cho cây lên tốt nhất, còn các ngăn nền sỏi lại dễ bị rêu hại. Với rong La Hán (cây thân mềm, cần nhiều sáng và dinh dưỡng hơn), mình chưa đủ thông tin chắc chắn từ cẩm nang, nên bạn nên cân nhắc lại xem nó có hợp với bể không CO2 và đèn của bạn không.
> 1. Chọn nền đất hồ phủ dày khoảng 4 đến 5 cm ở hậu cảnh và trung cảnh, làm …

**Plain** (3463 characters):

> **Nhìn chung phương án ổn**, đặc biệt với hồ 60x36x36 (khoảng 78 lít) và yêu cầu gọn nhẹ. Các cây bạn chọn đều chịu được ánh sáng thấp và CO2 thấp, không cần bình CO2 hay thùng lọc.
> 
> ## 1. Bố cục và cây
> 
> - **Đá Tiger**: hợp lý, bền, không làm đổi pH đáng kể. Nên đặt đá lệch một bên, cao dần về hậu cảnh để tạo chiều sâu.
> - **Rêu Fissidens mini và ráy lá nhỏ (Anubias nana) ở tiền cảnh**: ổn. Cả hai đều bám trên đá hoặc gỗ, không cần nền dinh dưỡng. Buộc hoặc keo (loại an toàn cho cá) ráy lên đá, **không vùi thân rễ xuống nền**, nếu không sẽ thối. Fissidens mini hơi khó giữ hơn, cần nước sạch, í…

### setup-04 · tank · ours wins (8 · 3)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu, và chọn cây như vậy có ổn không?

**Judge:** X uses the real tank (60×36, no CO₂, đá Tiger). It recommends plain sand at 3–4 cm (about 12–15 kg), says to tie ráy, dương xỉ and rêu onto the stone, and flags rong La Hán to watch. Y asks for details the app already holds, then gives generic advice with a wrong example size and wrongly calls Anubias a rooted plant. / Y uses the real tank (60×36, no CO₂, Tiger rock) and gives a sensible substrate depth and weight. It correctly says to tie the epiphytes onto rock instead of burying them, and it flags rong La Hán as the risky plant without CO₂. X asks for details the app already had and gives generic advice based on a 60×30 example tank.

**Ours lacks:** figures. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 2 pages, stopped at the calls limit):

> Với bể 60x36x36 cm, cây bạn chọn (rêu mini fissidens, ráy lá nhỏ, dương xỉ Java) là nhóm cây ít đòi hỏi, sống bám trên đá hoặc lũa và không cần nền giàu dinh dưỡng, nên nền thường không phải là phần khó nhất. Cẩm nang chỉ so sánh nền aquasoil với nền đất trong bể đèn mạnh có CO2, chưa nói lượng nền cho bể của bạn, nên phần lượng là kinh nghiệm chung của mình.
> 1. Dùng cát hoặc sỏi mịn thường, lớp dày khoảng 3 đến 4 cm, thoai thoải cao về phía sau, khoảng 12 đến 15 kg cho đáy 60x36 cm.
> 2. Không cần aquasoil hay nền đất ao vì bể không có CO2 và đèn không mạnh, phân nền sẽ ít tác dụng.
> 3. Cố định…

**Plain** (1597 characters):

> Để tư vấn chính xác, bạn cho mình biết thêm:
> 
> - **Kích thước bể** (dài × rộng × cao, hoặc số lít)
> - **Đèn** (loại và công suất) và **có CO2 hay không**
> - **Danh sách cây** bạn định trồng
> - **Cá hoặc tôm** nuôi chung (nếu có)
> 
> Trong lúc chờ, đây là hướng dẫn chung:
> 
> **Chọn nền**
> - **Nền dinh dưỡng chuyên dụng** (Aquasoil, ADA, Tropica...): tốt nhất cho bể thủy sinh trồng cây, đặc biệt cây có rễ và cây thảm. Giá cao hơn nhưng cây lên rất khỏe.
> - **Sỏi hoặc cát thường**: rẻ, dễ vệ sinh, nhưng cần thêm phân nền (viên nén, bùn nền) nếu trồng cây cần dinh dưỡng ở rễ.
> - **Đất nền thông thường**: chỉ…

### setup-05 · post · plain wins (5 · 6)

**Asked:** Em định set hồ 1m2x50x50 phong cách natural, chủ yếu rêu, ráy với ít cây cắt cắm lá đỏ. Nên chọn nền thế nào, bao nhiêu kg cho phù hợp và kinh tế? Em tính xài nền trộn kết hợp Aquafor thì ổn không? Đèn em xài T5HO, 2 bóng 10k, 1 bóng 6k5, 1 bóng hồng có hợp lý không?

**Judge:** Y cho số kg cụ thể và nói rõ 4 bóng T5HO trên 300 lít mạnh thế nào, ít đèn hay nhiều đèn tùy có CO₂ hay không. Đó đúng là điều người hỏi cần. Bù lại Y không biết Aquafor là gì và khuyên phủ cát. X thì đúng về Aquafor nhưng sơ sài: không nói số kg, không đánh giá cường độ đèn, và nhắc tới handbook làm người đọc rối. / X answers every part of the question. It gives layer depths and a kg estimate, and it warns that 4 T5HO tubes are strong light that needs CO₂ or fewer hours, though it doesn't know Aquafor. Y sidesteps the mixed-substrate question, gives no kg, and adds an odd handbook remark about the light. Y is right that red stem plants need CO₂.

**Ours lacks:** figures, tank-fit. **Plain lacks:** local, too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Với hồ 1m2 (tính khoảng 120 cm) x 50 x 50, mình nghĩ bạn nên dùng phân nền công nghiệp như Aquafor thay vì tự trộn. Handbook ghi Aquafor là lựa chọn tiết kiệm mà vẫn đủ dùng cho người mới, và phân nền đã là sản phẩm trọn gói nên không cần thêm gì vào. Cây rêu, ráy vốn mọc chậm, hút dinh dưỡng ít, nên nền công nghiệp là đủ.
> 1. Đáy khoảng 120 x 50 cm, rải nền dày 4 cm phía trước và 5 đến 6 cm phía sau, cần khoảng 30 đến 35 lít. Đổ theo thể tích, tra kg theo bao rồi mua dư một chút.
> 2. Nếu muốn lót thêm, có thể rải đá nham thạch (lava rock) đập nhỏ dưới lớp nền để nâng độ cao và giữ vi sinh. Đây…

**Plain** (2561 characters):

> # Nền và đèn cho hồ 120x50x50 (300 lít)
> 
> ## 1. Nền
> 
> Với phong cách natural có rêu, ráy và cây đỏ, nên dùng **nền dinh dưỡng + lớp phủ sỏi/cát**:
> 
> - **Lớp dưới:** nền dinh dưỡng (aqua soil hoặc nền trộn). Cây cắt cắm đỏ cần rễ và dinh dưỡng, nên lớp này quan trọng.
> - **Lớp trên:** cát hoặc sỏi mịn (1–3 mm) để giữ nền dinh dưỡng và tạo bề mặt đẹp cho rêu, ráy.
> - **Độ dày:**
>   - Phía sau: 6–7 cm
>   - Phía trước: 3–4 cm
>   - Tạo dốc từ sau ra trước theo kiểu natural.
> 
> ## 2. Số kg cần dùng
> 
> Thể tích nền khoảng 120 × 50 × 6 cm ≈ 36 lít (tính trung bình).
> 
> | Thành phần | Lượng gợi ý | Ghi chú |
> |---|-…

### setup-05 · tank · ours wins (7 · 3)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu kg, và đèn như vậy có đủ cho cây đỏ không?

**Judge:** X dùng đúng bể 120×50 để ra khoảng 30 lít, tức 25–35 kg nền. X cũng nhận định 4 bóng T5HO là đủ cho cây đỏ, kèm lưu ý về CO₂ và phân, và đưa ra các bước làm cụ thể. Y lại hỏi những thông tin đã có sẵn và chỉ đưa hướng dẫn chung với ví dụ cho bể 60 cm. / Y works from the real 120×50 tank and the 4-bulb T5HO. It gives a substrate amount (about 25–35 kg) and a photoperiod, says plainly that CO₂ is needed, and lays out ordered steps. X asks for details the app already had, then gives generic advice with an example for some other tank.

**Ours lacks:** figures. **Plain lacks:** tank-fit, asks-only, too-long, plan.

**Ours** (read 3 pages, stopped at the tools limit):

> Cẩm nang chưa ghi rõ số kg nền cho bể 120 x 50 x 50 cm của bạn, nên phần này mình dùng kinh nghiệm chung: với lớp nền khoảng 5–6 cm, bạn cần khoảng 30 lít, tức chừng 25–35 kg tùy loại nền trộn, bạn nên kiểm tra khối lượng ghi trên bao. Về đèn, cẩm nang ghi rằng cây đỏ cần cường độ sáng mạnh hơn là thời gian chiếu, và 4 bóng T5HO trên bể dài 120 cm thường là đủ mạnh cho nhóm cây này. Nhưng đèn mạnh thì phải có CO₂ và phân đi kèm, nếu không cây đỏ sẽ đói và nhạt màu. Bạn nên bật đèn 6–8 tiếng mỗi ngày bằng hẹn giờ, và cho Aquafor đúng theo hướng dẫn trên bao.
> 1. Trải lớp nền trộn đều, đổ khoảng…

**Plain** (1466 characters):

> Để tư vấn chính xác, bạn cho mình biết thêm:
> 
> 1. **Kích thước bể** (dài × rộng × cao, cm) và dung tích (lít)
> 2. **Đèn**: hãng, model, công suất (W), và nếu có thì thông số PAR hoặc ảnh chụp
> 3. **Các loại cây đỏ** bạn định trồng (ví dụ: Ludwigia red, Rotala, Alternanthera, Hygrophila...)
> 4. **Có dùng CO₂ hay không** và ngân sách nền
> 
> Trong lúc chờ, đây là hướng dẫn chung:
> 
> **Nền**
> - Cây đỏ cần dinh dưỡng tốt, nên dùng **nền dinh dưỡng** (Aqua Soil, ADA Amazonia, Tropica...) lót dưới, phủ **sỏi hoặc cát mịn** lên trên khoảng 1-2 cm.
> - Nền dày khoảng **5-7 cm** ở phía sau, thấp dần về phía trước…

### setup-06 · post · plain wins (4 · 7)

**Asked:** Em đang set hồ 60x30x36, bố cục lũa đá nature. Cốt nền JBL Aquabasic Plus 1 bao (2,5 lít), phân nền Aquafor 2,5 bao (7,5 lít), quây phần nền bằng đá cuội. Cây dự kiến: rêu, ráy, ít bucep, dương xỉ, hậu cảnh cắt cắm táo lớn, hồng thái dương. Phần trống mặt tiền có nên trải sạn hoặc cát không? Với bố cục và kích thước này nên dùng máng Odyssea 2 bóng hay 4 bóng?

**Judge:** Y trả lời thẳng hai câu hỏi: nên trải cát mịn, và chọn 4 bóng nếu có CO₂ vì có hồng thái dương với táo lớn, có kèm điều kiện và số giờ bật đèn. X né câu hỏi 2 bóng hay 4 bóng, chỉ đưa quy tắc W/lít chung chung, lại hay nhắc đến \"handbook\". / X trả lời thẳng cả hai câu: nên rải cát mịn, và chọn 4 bóng nếu chạy CO₂ hoặc bón phân đủ, 2 bóng nếu chạy low-tech. Lời khuyên bám theo từng cây trong danh sách và có tính đến chuyện nóng, tốn điện. Tuy vậy X nhầm con số độ sâu và hiểu sai chỗ rải cát. Y né câu hỏi chính về máng Odyssea, chỉ đưa quy tắc W/lít chung chung, nên người hỏi vẫn chưa biết chọn loại nào.

**Ours lacks:** tank-fit, plan, local. **Plain lacks:** figures, tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Với hồ 60x30x36 (khoảng 65 lít), mình khuyên bạn trải một lớp cát mịn hoặc sạn nhỏ ở mặt tiền. Phân nền Aquafor khá nhẹ và dễ bung khi hút đáy hoặc khi cá đào, lớp phủ sẽ giữ phân nền và làm mặt tiền gọn. Handbook chưa có trang riêng về việc trải cát mặt tiền, nên đây là kinh nghiệm chung của mình: dùng cát hoặc sạn đã rửa sạch, lớp mỏng khoảng 1 đến 2 cm, và để lớp này thấp hơn đá cuội quây để không lộ phân nền. Về máng đèn, handbook ghi bể tiêu chuẩn thường chỉ cần một máng, với mức khoảng 0,5 đến 1 W mỗi lít, tức khoảng 33 đến 65 W cho bể này, và đèn LED nên đánh giá bằng lumen, khoảng 20 …

**Plain** (2354 characters):

> # 1. Phần trống mặt tiền: nên trải sạn hay cát?
> 
> **Nên trải cát mịn** (hạt khoảng 0,5–1 mm), đặc biệt với bố cục lũa đá nature. Cát tạo cảm giác bờ suối hoặc bãi sông, và đường chuyển từ cát sang đá cuội sẽ tự nhiên hơn.
> 
> Lưu ý khi làm:
> - **Phủ cát lên Aquafor khoảng 1–2 cm.** Aquafor khá mềm và dễ bở, nếu để lộ ra mặt tiền sẽ dễ làm nước đục khi thay nước, cắm cây hoặc dọn đáy. Lớp cát phủ ngăn việc này.
> - **Dùng cát đã rửa sạch**, không dùng cát xây dựng vì có thể làm tăng độ cứng và đục nước.
> - **Làm gờ đá cuội trước rồi mới đổ cát** để giữ ranh giới và tránh cát trôi sang phần nền.
> - Nếu …

### setup-06 · tank · plain wins (4 · 5)

**Asked:** Bể thủy sinh tôi đang set có nên trải sạn mặt tiền không, và cần đèn mấy bóng?

**Judge:** Cả hai đều hỏi lại kích thước bể và không trả lời chuyện chọn máng Odyssea 2 bóng hay 4 bóng. Y tốt hơn một chút vì ví dụ của Y trùng đúng bể 60×30×36 (~65 L, 30–40 W), có mẹo tách sạn khỏi phân nền và gợi ý bật đèn 6–8 tiếng mỗi ngày. Tuy vậy Y có đoạn về cá đáy và cá đào bới không liên quan đến bể này. / Cả hai đều không đọc được thông tin bể và quay lại hỏi kích thước. Riêng X tình cờ đưa ví dụ đúng bể 60×30×36 (~65 L, cần 30–40 W), cho giờ bật đèn và mẹo lót lưới ngăn giữa phân nền với sạn, nên dùng được ngay hơn. Y chỉ đưa công thức, không có con số cụ thể, và cũng không bàn được chuyện chọn Odyssea 2 bóng hay 4 bóng.

**Ours lacks:** tank-fit, figures, diagnosis, plan. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Trải sạn mặt tiền được, miễn chọn hạt vừa, không quá mịn, để nước và rễ cây đi qua dễ. Cát quá mịn dễ nén chặt, rễ khó lan. Số bóng đèn thì phụ thuộc vào kích thước bể, bạn cho mình dài × rộng × cao (cm) để tính chính xác.
> 1. Đo bể dài × rộng × cao rồi chia 1000 để ra số lít nước.
> 2. Nhân số lít với 0,5 và với 1 để ra khoảng công suất đèn cần mua, tính bằng W.
> 3. Đo chiều rộng bể: dưới khoảng 30 cm thì một máng kẹp thành bể là đủ; khoảng 40–50 cm thì một đèn treo là đủ; rộng hơn thì cần thêm máng.
> 4. Chọn đèn có nhiệt độ màu 6500K–10000K. Bể chủ yếu cây xanh thì LED trắng đủ, muốn cây đỏ lên …

**Plain** (1822 characters):

> Để tư vấn chính xác hơn, bạn cho mình biết **kích thước bể (dài x rộng x cao)**, **loại cá** và **loại cây** bạn định nuôi. Trong lúc chờ, đây là gợi ý chung.
> 
> ## 1. Có nên trải sạn mặt tiền không?
> 
> **Nên**, nếu bạn muốn bố cục có chiều sâu, kiểu "bãi cát" dốc từ sau ra trước. Sạn mặt tiền làm bể trông gọn và thoáng hơn.
> 
> **Lưu ý khi làm:**
> - **Bố cục dốc:** cao ở phía sau (khoảng 5–8 cm), thấp dần về phía trước (2–3 cm). Cây và đá lớn đặt ở phía sau.
> - **Nếu dùng nền dinh dưỡng** (đất nền, soil) cho cây thủy sinh: không nên để sạn trộn lẫn với đất. Hãy trải đất trước, phủ một lớp lưới hoặc g…

### setup-07 · post · plain wins (4 · 8)

**Asked:** Cửa sổ nhà em bị bít nên em tháo ra, được một hõm sâu 20cm, cao 90cm, dài 100cm, em định làm bể cá âm vào đó kiểu bán cạn: hồ kính dài 90cm (chừa 10cm bố trí lọc), sâu 20cm, cao 50cm (mực nước 40cm), đèn 90cm treo phía trên. Thả 1 cục lũa cao hơn mặt nước, xếp ít đá xung quanh, phía sau trải nền trồng cây dễ sống, phía trước trải cát, trồng thêm ít cây vượt mặt nước như dương xỉ, cỏ đồng tiền, khoai lang. Cá nuôi tầm 10 con bảy màu, ít con bống dọn bể. Lọc em định dùng 1 lọc thác 8W và 1 lọc vi sinh (chạy bằng bơm oxy) với vật liệu lọc là sứ vì nuôi ít cá. Các cụ góp ý giúp em.

**Judge:** Y bàn đúng những điểm riêng của bể âm hõm cửa sổ: chống thấm, đáy phẳng, an toàn điện, khe hở quanh kính, ngăn đất với cát, cây vượt mặt nước và lớp mút trước lớp sứ. X sơ sài, không nhắc phần lắp đặt và chống thấm, lại lẫn ốc vặn và cá lau kính với bống. / X đi sát đúng bể âm tường của bạn: tính tải trọng khoảng 72 kg nước, chống thấm, khe hở quanh kính, an toàn điện, cách chia nền cây/cát, cố định lũa, chọn cá dọn bể nhỏ như cá chuột, otto, ốc nerite, và nhắc đặt mút lọc trước lớp sứ. Y thì mỏng, mấy đoạn trích dẫn lạc đề, nói về bống dọn bể thì lẫn lộn, lại bỏ qua hẳn chuyện kết cấu và chống thấm của hõm tường.

**Ours lacks:** tank-fit, too-thin, plan, wrong. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình thấy ý tưởng bán cạn này làm được và hợp với bảy màu, vì cá này hiền, chịu được nhiều sai sót và sống khỏe trong bể có cây. Điểm cần chú ý nhất là lọc và sưởi, còn phần bống dọn bể bạn cần xác định đúng loài trước. Cẩm nang chưa có trang nào nói riêng về cỏ đồng tiền và khoai lang trong bể bán cạn, nên phần cây mình chỉ góp ý theo kinh nghiệm chung.
> 1. Lọc: với khoảng 70 lít nước và 10 bảy màu, một lọc thác 8W cộng một lọc vi sinh là đủ. Cẩm nang khuyên đừng chọn lọc quá cỡ vì dễ làm bể xoáy và tốn điện, nên chọn loại chỉnh được lưu lượng.
> 2. Vật liệu vi sinh: cẩm nang tính khoảng 1 lít …

**Plain** (4665 characters):

> Ý tưởng tận dụng hõm cửa sổ làm bể bán cạn rất hay, và kích thước của em khá hợp lý. Em nên kiểm tra kỹ một số điểm trước khi làm.
> 
> ## 1. Kết cấu và chịu tải (quan trọng nhất)
> 
> - **Khối lượng:** Nước 90×20×40 cm ≈ **72 lít ≈ 72 kg**. Cộng thêm kính, nền cát, đá, lũa và cây thì tổng khoảng **90–110 kg**. Em cần chắc rằng phần tường và lanh tô phía trên hõm chịu được tải này, đặc biệt nếu hõm là chỗ cũ của khung cửa sổ.
> - **Đáy hõm:** Phải phẳng và chắc, nên trát lại bằng vữa để đáy bể đặt đều. Nếu đáy lệch, kính dễ nứt.
> - **Chống thấm:** Trong hõm nên quét chống thấm trước khi đặt bể. Nếu nước…

### setup-07 · tank · ours wins (6 · 2.5)

**Asked:** Kế hoạch lọc, cây và cá cho bể tôi định làm như vậy có ổn không?

**Judge:** X dùng đúng thông số bể của bạn và đưa ra các bước làm được ngay: che nắng vì bể đặt ở hốc cửa sổ, bật đèn 8 giờ mỗi ngày, rửa vật liệu lọc bằng nước bể, giữ khoảng 10 con bảy màu. X có vài chỗ sai: nhận nhầm con bống là bống biển, tính sai dung tích nước (khoảng 72 lít chứ không phải 90 lít), và kiểm tra tải theo 20 con. Y chỉ hỏi lại những thông tin đã có sẵn và đưa lời khuyên chung chung. / Y is better. It uses the actual tank (window recess, 8W hang-on filter, ceramic media, 10 guppies) and gives concrete steps: shade the window glass, run the light about 8 hours, rinse filter media only in tank water, test the water. It does have mistakes: the goby is probably misidentified, it uses the wrong volume, and its stocking figures contradict each other. X only asks back for details the app already has and adds generic tips.

**Ours lacks:** figures, follow-up. **Plain lacks:** asks-only, tank-fit, plan.

**Ours** (read 1 pages, stopped at the calls limit):

> Nuôi chung được: nước có khoảng chung, kích thước và tính cách hợp nhau, nhưng mình chưa tin con bống dọn bể trong bể này. Trang cá bống neon ghi đây là bống biển, cần pH 8,1-8,4, độ cứng 8-12 dGH và 22-26 °C, không hợp với bể nước ngọt có cá bảy màu. Với đàn cá bảy màu thì bể 90 x 20 x 50 cm chỉ chứa khoảng 10 con là vừa, còn kiểm tra 20 con kèm bống thì đã quá tải (136%).
> 1. Xác nhận lại tên khoa học hoặc gửi ảnh con bống dọn bể đang nuôi; nếu là bống neon biển thì không giữ trong bể nước ngọt này.
> 2. Giữ đàn bảy màu khoảng 10 con, không thêm đến 20 con trong bể 90 lít này.
> 3. Che nắng chiế…

**Plain** (1347 characters):

> Bạn chưa gửi kế hoạch cụ thể, nên mình chưa đánh giá được. Bạn cho mình biết thêm nhé:
> 
> 1. **Kích thước bể** (dài × rộng × cao, và dung tích tính bằng lít)
> 2. **Lọc:** loại lọc (lọc thùng, lọc hộp, lọc treo, lọc đáy...), công suất (lưu lượng L/h), và có dùng thêm sục khí không
> 3. **Cây:** loại cây định trồng, cây thân/lá/thảm, và có dùng đèn, phân nền hay CO₂ không
> 4. **Cá:** loài cá, số lượng, kích thước trưởng thành, và tính cách (hòa bình hay hung dữ)
> 5. **Nền và trang trí:** sỏi, cát, nền phân hay nền thường
> 6. **Thời gian:** bạn định thả cá ngay hay cần cycle bể trước
> 
> Trong lúc chờ, bạn…

### setup-08 · post · plain wins (5 · 6.25)

**Asked:** Mình đang có bể dán 60x45x45, kính 5 ly. Bể vậy có mỏng quá không? Tư vấn giúp mình độ dày nền, các phụ kiện cần có và nên nuôi loại cá nào để có bể thủy sinh hợp lý. Kinh phí mình cũng không được nhiều lắm.

**Judge:** On the main question, X is more correct: it calls 5 ly glass a bit thin at 45 cm and has the reader do a water test first, but it gives too little on accessories and fish. Y gives a complete, budget-ordered plan with substrate depth, lighting hours, cycling and fish counts, but it wrongly calls 5 ly safe and makes a few naming and stocking mistakes. Overall Y helps more. / Y đánh giá kính 5 ly hơi mỏng là đúng hơn, và bước ngâm thử nước 1–2 ngày rất có ích. Nhưng phần phụ kiện và cá của Y quá sơ sài. X trả lời đủ cả ba câu: nền, phụ kiện theo ngân sách, cá. Điểm trừ của X là trấn an quá mức về độ dày kính.

**Ours lacks:** too-thin, figures. **Plain lacks:** wrong.

**Ours** (read 4 pages, stopped at the tools limit):

> Với bể 60x45x45 cm (khoảng 120 lít) dùng kính 5 ly thì đúng là hơi mỏng, nhất là khi chiều cao 45 cm và bạn đặt nền, đá, lũa nặng. Theo cẩm nang, bể thủy sinh chứa cả nền và vật liệu nên lực đè lên các tấm kính bên lớn hơn bể cá thường, và bể từ 60 cm trở lên thì chân bể rất quan trọng. Phần kiểm tra độ dày kính cụ thể mình đọc chưa hết, nên phần này là kinh nghiệm chung của mình: bể này dùng được nếu kính sạch, mối dán chắc và đặt trên chân phẳng, chắc. Đừng tăng thêm mực nước cao hơn mức bạn đã thử.
> 1. Đặt bể lên chân hoặc kệ phẳng, chịu được khoảng 150 kg (nước khoảng 120 kg cộng nền và vậ…

**Plain** (3252 characters):

> # Bể 60x45x45 kính 5 ly
> 
> **Kính 5 ly là ổn, không quá mỏng.** Với bể cao 45 cm và dài 60 cm, 5 ly là mức phổ biến và đủ an toàn. Điều quan trọng hơn là **keo silicone** (nên dùng loại chuyên bể cá, như Dow Corning, Sikasil hoặc loại tương đương) và **đế bể phẳng, chắc**.
> 
> ## 1. Nền
> 
> **Nền đáy (lớp dưới cùng):**
> - Nếu trồng cây: lớp nền dinh dưỡng khoảng **3–5 cm** (đất nền, phân nền chuyên dụng hoặc đất sét nung), phủ thêm **sỏi/cát 2–3 cm**. Tổng khoảng **5–7 cm**.
> - Nếu chỉ nuôi cá, không trồng cây: sỏi hoặc cát **3–5 cm** là đủ.
> - Tiết kiệm: dùng sỏi thường thay nền dinh dưỡng, rồi bón phâ…

### setup-08 · tank · plain wins (4 · 6)

**Asked:** Tôi có sẵn bể, cần mua gì và nuôi cá gì để làm bể thủy sinh tiết kiệm?

**Judge:** Cả hai câu trả lời đều không dùng kích thước bể 60×45×45 (khoảng 120 lít). X còn tính đèn và bơm theo bể nano 57 lít, nên số liệu sai. X cũng gần như bỏ qua phần chọn cá. Y vẫn hỏi lại kích thước dù đã có sẵn, nhưng đưa danh sách đồ cần mua, cây, cá và chi phí thực tế ở Việt Nam, đúng với nhu cầu làm bể tiết kiệm hơn. / Cả hai đều không dùng đúng kích thước bể (khoảng 120 lít), và không câu nào nhắc rằng kính 5 ly là mỏng với bể cao 45 cm. X trả lời đủ cả câu hỏi: cần mua gì, cây gì, cá gì, mẹo tiết kiệm và chi phí ước tính, dù khuyên mua sưởi là thừa ở khí hậu Việt Nam. Y có mẹo tự làm hợp túi tiền như lọc bông góc và CO₂ tự chế, nhưng phần cá quá sơ sài và các con số lấy từ bể 57 lít.

**Ours lacks:** tank-fit, too-thin, figures, wrong. **Plain lacks:** tank-fit, too-long, local.

**Ours** (read 4 pages, stopped at the tools limit):

> Với bể sẵn có, mình khuyên quyết định cây trước, rồi mới mua đèn, lọc và CO2, vì cây quyết định bạn cần đèn mạnh đến mức nào. Đèn là chỗ không nên tiết kiệm, vì thiếu sáng thì cây không quang hợp được và sẽ tàn dần. Theo một cách làm trong video, bể khoảng 57 lít dùng đèn LED khoảng 6000 K có chuẩn chống nước: một bóng cho bể trồng cây dễ, hai bóng nếu muốn trải thảm. Lọc có thể tự làm bằng bông góc, bơm mini khoảng 300 lít/giờ là đủ để nước quay vòng hơn 5 lần mỗi giờ. CO2 không bắt buộc với bể nhỏ: có thể tự chế bằng axit citric với baking soda, hoặc đường với men nở, và nếu nhà đã có bình …

**Plain** (2910 characters):

> # Bể thủy sinh tiết kiệm
> 
> Bạn cho mình biết **kích thước bể** (ví dụ 60×30×35 cm, khoảng 60 lít) để mình tính cụ thể hơn. Trong lúc đó, đây là gợi ý chung.
> 
> ## 1. Thiết bị cần mua
> 
> **Thiết yếu:**
> - **Nền:** Sỏi thủy sinh rẻ hoặc sỏi sông rửa sạch, dày 3–5 cm. Không cần đất nền đắt tiền nếu chỉ trồng cây dễ.
> - **Đèn LED:** Chọn loại đủ sáng, công suất vừa phải. Bể 60 cm thì đèn LED 15–25W là đủ cho cây dễ sống. Đây là thứ nên đầu tư một chút vì ảnh hưởng lớn đến cây.
> - **Lọc:** Lọc hang (lọc thác) hoặc lọc thùng nhỏ, công suất gấp 3–5 lần thể tích bể mỗi giờ. Lọc hang rẻ và dễ bảo trì.
> - **Sưở…

### setup-09 · post · plain wins (6 · 7.5)

**Asked:** Em có cái hộc giá sách, định làm bể dài 170x30x35, mặt trước kính siêu trong để vào đó. Layout đơn giản: nền cát và cuội hoặc đá, thêm ít lũa và ráy; cá thì loại size nhỏ dễ nuôi, ít tốn công chăm và ít thay nước. Em định dùng lọc thùng, với size bể này có phù hợp không? Em định dặn bên làm bể chừa lỗ chờ cho lọc ở 2 đầu bể.

**Judge:** Y có ích hơn. Y nói đến những việc quan trọng khi đặt bể vào hộc giá sách: hộc phải chịu được khoảng 230–250 kg, cần đáy phẳng, lót xốp, chọn độ dày kính, bố trí lỗ hút và lỗ xả chéo nhau, gợi ý cá, cây hợp với bể, và nói rõ vẫn phải thay nước định kỳ. X đúng nhưng mỏng, không nhắc gì đến tải trọng của hộc hay việc chọn cá. / X trả lời được nhiều phần hơn mà người hỏi cần: lưu lượng lọc, bố trí ống hút/xả chéo nhau, sức chịu tải và lót đáy hộc, chọn cá hợp nền cát, và nói rõ vẫn phải thay nước. Có điều X khuyên khoan lỗ cách đáy chỉ 2–3 cm là sai và nguy hiểm, kính dễ nứt. Y an toàn hơn ở khâu khoan lỗ và thử rò nước trước khi đổ nền, nhưng mỏng, bỏ qua chuyện chọn cá, sức chịu tải của hộc và chuyện ít thay nước.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** too-long.

**Ours** (read 3 pages):

> Lọc thùng hoàn toàn hợp với bể 170x30x35, nhưng bạn nên chọn theo thể tích nước thật chứ không theo kích thước bể. Kích thước này khoảng 178 lít khi đầy kính, còn sau khi trừ cát, đá và lũa thì khoảng 150 đến 160 lít nước. Handbook khuyên lọc có lưu lượng mỗi giờ gấp 5 đến 6 lần thể tích nước, tức khoảng 800 đến 1000 lít mỗi giờ cho bể này. Với lọc thùng, thứ quyết định độ mạnh là lượng vật liệu bên trong nhiều hơn lưu lượng, nên hãy chọn loại có khoang vật liệu rộng.
> 1. Trước khi đặt lỗ, chọn sẵn mẫu lọc và ghi lại đường kính ống, khớp nối và vị trí cần khoan.
> 2. Nhờ bên làm bể khoan lỗ đúng…

**Plain** (2866 characters):

> Bể 170×30×35 cm, khoảng 178 lít tổng, nên đủ rộng để nuôi cá nhỏ đẹp. **Lọc thùng rất hợp** với kích thước này, thậm chí là lựa chọn tốt nhất trong các loại lọc thường dùng, vì bể dài và sâu nên cần lưu lượng lớn và bể ít tốn chỗ cho lọc.
> 
> **1. Chọn công suất lọc**
> - Với bể cá nhỏ, nên lọc đảo nước khoảng **6–8 lần/giờ** (tổng thể tích bể) cho cá nhỏ, và có nhiều cây thì vẫn tốt.
> - Tức là khoảng **1000–1400 L/h** là hợp lý. Chọn thùng có công suất thực tế (không chỉ ghi trên hộp) khoảng 1000 L/h trở lên, loại có thể chỉnh lưu lượng.
> - Có thể dùng thùng cỡ vừa đến lớn (ví dụ dòng Sunsun, Eheim…

### setup-09 · tank · plain wins (3 · 5)

**Asked:** Bể tôi định làm dùng lọc thùng có hợp không, và nuôi cá gì cho ít phải chăm?

**Judge:** Cả hai đều bỏ qua thông số bể. X còn nói sai đây là bể nhỏ và khuyên lọc treo. Y khẳng định lọc thùng hợp với bể từ 80 lít trở lên (đúng với bể khoảng 178 lít này), có danh sách cá và mẹo giảm công chăm theo thứ tự, nhưng chung chung và nhầm tỳ bà với Otocinclus. / Neither answer uses the tank's details: about 178 litres, set in a bookshelf niche, filter holes planned at both ends, few water changes wanted. X at least gives a correct conditional ("from 80 litres up") and a usable list of fish and care tips. Y is thin, recommends only one fish, and steers toward a hang-on filter for a tank it assumes is small.

**Ours lacks:** tank-fit, too-thin, plan. **Plain lacks:** tank-fit, local, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Lọc thùng làm được việc cho bể bạn định làm nếu bạn chấp nhận chi phí cao hơn và chịu bảo trì. Cẩm nang nói đây là loại mạnh và êm, chứa được nhiều vật liệu lọc, nhưng giá khá cao, khó vệ sinh và hay rò nước. Với bể nhỏ mà bạn muốn ít việc nhất, một lọc treo thành chất lượng tốt có thể đủ, nên bạn cho mình biết kích thước bể để mình gợi ý cụ thể hơn. Nếu nuôi cá ít phải chăm, cẩm nang gợi ý cá chuột (Corydoras): hiền, không kén ăn, dễ đẻ trong bể. Hầu hết loài cần bể từ 75 lít, loài lùn có thể nuôi trong 38 lít, và chúng cần nền cát mịn hoặc sỏi nhẵn vì râu mảnh dùng để tìm ăn ở đáy. Với lọc …

**Plain** (2074 characters):

> ## Lọc thùng có hợp không?
> 
> **Có, lọc thùng (canister) là lựa chọn tốt** nếu bể của bạn từ khoảng 80 lít trở lên:
> 
> - **Ưu điểm:** Lọc mạnh, chứa được nhiều vật liệu lọc (sinh học, cơ học, hóa học), ít ồn, không chiếm chỗ trong bể, nước trong ổn định.
> - **Nhược điểm:** Giá cao hơn lọc hộp, lắp đặt phức tạp hơn (phải mồi nước, kiểm tra ống hút và ống xả), vệ sinh định kỳ mất công hơn.
> - **Lưu ý:** Chọn đúng công suất cho dung tích bể, nên có lưu lượng gấp khoảng 4-6 lần thể tích bể mỗi giờ. Với bể nhỏ dưới 40-50 lít thì lọc thùng hơi "quá tay", lọc hộp hoặc lọc treo thành là đủ.
> 
> ## Cá ít phải …

### cycling-01 · post · tie or split (5.5 · 6)

**Asked:** Bể em dài 90cm rộng 40, đã mua bình CO2 + trộn cánh quạt, lọc thùng DF1300, đèn Odyssea, nền 10kg loại nhiều chất, trồng trân châu ngọc trai, sao nhỏ và một đống cây cắm lưa thưa. Tuần đầu em lật ra lật vào 3 lần, mất một đống cây vì nhổ ra bị úa, nền mua thiếu thấy mỏng lại hút nước ra cho thêm. Hiện ngày nào em cũng thay 50% nước. Bể đang ổn định được 3 ngày, em định 1 tuần thì thả cá nhỏ như neon, 7 màu. Vậy đã thả được chưa, và nên mua sục oxy loại nào?

**Judge:** Cả hai đều khuyên giảm thay nước, mà không nhắc rằng nền nhiều chất mới sẽ nhả amoniac. Nhưng Y bám sát bể này hơn: nhắc DF1300, khuyên đặt đá sủi xa luồng CO₂, nói thời gian chạy chu trình 3-4 tuần, mật độ neon cho bể, và tên các hãng máy sục có bán ở Việt Nam. X mỏng và chung chung. / Cả hai đều khuyên sai là bớt thay nước, dù nền nhiều chất mới nhả amoniac mạnh trong vài tuần đầu. X sai thêm hai chỗ: khuyên thả tép làm cá thử, và đọc nhầm neon với bảy màu thành một loài. Y gọn, có các bước theo thứ tự và ít sai hơn, nhưng thiếu số liệu cụ thể.

**Ours lacks:** too-thin, tank-fit, figures, diagnosis. **Plain lacks:** tank-fit, wrong, too-long.

**Ours** (read 0 pages, stopped at the time limit):

> Bạn chưa nên thả neon ngay. Bể mới chạy được 3 ngày thì vi khuẩn có lợi chưa đủ để phân hủy amoniac từ cá, và việc thay 50% nước mỗi ngày đang cuốn bớt chúng đi cùng chất dinh dưỡng. Phần cây bị úa khi nhổ lên cũng cho thấy bể đang bị xáo trộn quá nhiều. Cuốn cẩm nang chưa có mục nào trả lời trực tiếp câu hỏi về sục oxy cho bể này, nên phần dưới là kinh nghiệm chung.
> 1. Ngừng thay nước hằng ngày, chỉ thay khi cần và khoảng 20-30% mỗi lần.
> 2. Để nguyên cây, không nhổ lên xem nữa, cho cây bén rễ và nền ổn định.
> 3. Mua bộ test amoniac và nitrit, kiểm tra mỗi vài ngày; khi amoniac và nitrit về 0 …

**Plain** (1970 characters):

> **Chưa nên thả cá lúc này.** Ba ngày là quá sớm, và có vài lý do:
> 
> - **Bể chưa chu trình nitơ.** Nền dinh dưỡng và vi sinh có lợi cần vài tuần mới hình thành đủ. Trong giai đoạn này amoniac có thể tăng đột ngột, và cá nhỏ như neon rất nhạy với nó.
> - **Thay 50% nước mỗi ngày làm chậm quá trình này.** Nó loại bỏ amoniac và vi khuẩn ngay khi chúng vừa hình thành, nên bể chưa có cơ hội ổn định. Bạn có thể giảm xuống 1-2 lần/tuần, chỉ thay thêm khi đo thấy chỉ số xấu.
> - **Cây đang hồi phục.** Cây mới trồng và vừa bị nhổ lên nhổ xuống cần vài tuần để bám rễ và ra rễ mới. Trân châu ngọc trai rất khó…

### cycling-01 · tank · ours wins (6.25 · 3.5)

**Asked:** Bể thủy sinh mới set được ít ngày, khi nào thì thả neon và bảy màu được?

**Judge:** Cả hai đều bỏ qua chi tiết bể: mới 1,5 tuần, nền 10kg loại nhiều dưỡng đang nhả amoniac, đang thay 50% nước mỗi ngày. Dù vậy X an toàn, các bước có thứ tự rõ: test, thả bảy màu trước rồi mới thả neon, lưu ý độ cứng nước. Y khuyên nhỏ nước rửa chén vào bể, một lời khuyên nguy hiểm, và còn hỏi lại thông tin mà app đã có. / I'd rather this hobbyist got Y. X tells them to use dish soap as an ammonia source, which is harmful, and asks about a substrate the tank info already gives. Y lays out safe steps in order, and its species cards show the neon/guppy water mismatch. Neither answer uses the key details of this tank: the rich soil substrate leaches ammonia, and changing 50% of the water every day in the first weeks is normal for that kind of substrate.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, unsafe, wrong.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể mới set vài ngày thì chưa nên thả neon hay bảy màu. Cẩm nang nói rõ cá neon không hợp với bể mới vì không chịu được biến động của giai đoạn khởi động, chỉ nên thả khi bể đã trưởng thành và thông số nước ổn định. Bảy màu chịu được nhiều hơn nhưng vẫn cần bể đã chạy xong chu trình nitơ, nếu không amoniac và nitrit sẽ làm cá yếu và dễ chết. Thời gian chạy xong thường kéo dài vài tuần, mình ghi theo kinh nghiệm chung chứ cẩm nang không đưa con số cụ thể.
> 1. Mua bộ test amoniac và nitrit, rồi đo nước mỗi 2 đến 3 ngày.
> 2. Chờ đến khi amoniac và nitrit đều bằng 0 sau khi đã cho ăn, và đã có nitra…

**Plain** (1389 characters):

> Bạn nên **chờ bể chu trình nitơ (cycle) xong rồi mới thả cá**, thường mất khoảng **3–6 tuần** tính từ khi set bể. Vài ngày thì chưa đủ.
> 
> **Cách kiểm tra bể đã sẵn sàng:**
> - Dùng bộ test nước (test kit) đo **amoniac (NH₃/NH₄⁺)** và **nitrit (NO₂⁻)**.
> - Khi cả hai đều về **0 ppm** và đã có **nitrat (NO₃⁻)** thì bể đã ổn định.
> - Nếu chưa có test kit, bạn phải chờ lâu hơn, vì rất khó đoán chính xác.
> 
> **Cách làm để đẩy nhanh chu trình:**
> - Thêm một nguồn amoniac (vài giọt nước rửa chén không có chất tẩy mạnh, hoặc chế phẩm vi sinh/cycle bacteria) để nuôi vi khuẩn có lợi.
> - Có thể dùng vi sinh từ b…

### cycling-02 · post · plain wins (5 · 6.5)

**Asked:** Em mới nhập môn, mua bể đúc 50cm + đèn 3 màu + lọc thác. Hai bố con mua 7 đôi cá: 5 đôi neon xanh đỏ + 2 đôi cá vàng nhỏ xíu. Sau 2 ngày cá lăn ra chết, chỉ còn 3 con cá vàng nhỏ. Vì sao vậy, và nên mua loại cá nào sống dai, sống khỏe cho con chăm?

**Judge:** Both answers name the main cause correctly: the tank had not finished its nitrogen cycle. Y is better because it also covers stocking too many fish, the goldfish–neon mismatch, and how to acclimatise new fish, and it answers the question about hardy fish with concrete species. It has a few naming and local-fit slips. X is clear but skips the fish suggestions and gives a doubtful step of moving the fish to a temporary tank. / Hai câu trả lời đều chỉ đúng nguyên nhân chính là bể mới chưa chạy chu trình nitơ. Y không trả lời câu hỏi thứ hai về loài cá dễ nuôi cho con chăm, và cũng không nói cá vàng không hợp nuôi chung với neon. X trả lời đủ cả hai câu và có lộ trình rõ ràng, dù dài và có vài lỗi về tên cá và về việc mua máy sưởi ở Việt Nam.

**Ours lacks:** tank-fit, too-thin. **Plain lacks:** too-long, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là bể mới chưa kịp chạy chu trình nitơ: vi khuẩn có lợi chưa đủ để phân hủy amoniac từ cá, nên amoniac và nitrit tăng rất nhanh và giết cá. Thả 14 con cùng lúc vào bể 50 cm làm tình hình tệ hơn. Cá neon đặc biệt nhạy với bể mới, handbook ghi rõ bể mới không hợp với chúng. Mình chắc về hướng này nhưng chưa biết chắc số đo, nên bạn nên thử nước ngay.
> 1. Thử amoniac và nitrit bằng que thử ngay hôm nay; nếu có số đo trên 0,2 ppm, thay khoảng 30–50% nước bằng nước đã khử clo.
> 2. Ngừng cho ăn hoàn toàn, vì thức ăn thừa thối làm amoniac tăng thêm.
> 3. Chuyển 3 con cá vàng …

**Plain** (3305 characters):

> Chào hai bố con, lỗi này rất hay gặp ở người mới nuôi, không phải do các bạn vụng. Có mấy nguyên nhân chính:
> 
> ## Vì sao cá chết?
> 
> **1. Bể chưa "chín" (new tank syndrome) - nguyên nhân chính**
> Bể mới chưa có vi sinh vật có lợi để phân hủy amoniac (NH₃) và nitrit (NO₂) do cá thải ra. Thả nhiều cá vào bể mới chưa chạy chu trình nitơ thì amoniac và nitrit tăng rất nhanh, đầu độc cá. Cá chết trong 1-3 ngày là dấu hiệu điển hình.
> 
> **2. Thả quá đông**
> 14 con cá trong bể 50cm, lại chưa có hệ vi sinh, là quá tải. Neon và cá vàng đều thải nhiều chất bẩn.
> 
> **3. Hai loài không hợp nhau**
> - Neon là cá nhi…

### cycling-02 · tank · plain wins (5 · 6.25)

**Asked:** Tôi vừa mua bể và thả cá, mới 2 ngày cá đã chết gần hết, vì sao?

**Judge:** Cả hai câu trả lời đều không dùng thông tin bể của người hỏi: bể đúc mới mua thả cá ngay, nuôi chung neon với cá vàng là không hợp, và còn 3 con cá vàng sống. Y nêu thêm clo trong nước máy và thiếu oxy, cho tỉ lệ thay nước cụ thể (25–50%) kèm khử clo, nên hữu ích hơn với người chơi ở Việt Nam. X ngắn gọn nhưng bỏ sót clo và có một bước thuần nước không áp dụng được cho cá đang ở trong bể. / Both answers ignore the tank details: a new cast tank stocked the same day, neons kept with goldfish, and the neons dying first. X covers chlorine and dechlorinated water changes, stopping feeding and adding bacteria, which suit Vietnamese tap water, though it is long. Y is shorter but never mentions chlorine and gives an acclimation step that doesn't apply to fish already in the tank.

**Ours lacks:** tank-fit, diagnosis, local, figures. **Plain lacks:** tank-fit, too-long.

**Ours** (read 3 pages):

> Nhiều khả năng bể còn mới chưa đủ vi sinh, nên amoniac hoặc nitrit tăng cao và làm cá sốc và chết nhanh. Cá mua về yếu hoặc chênh nhiệt độ, pH, chưa thuần nước cũng dễ chết sớm. Mình chưa biết bể đã chạy được bao lâu hay bạn thả loài nào, nên đây là mức khá chắc, chưa phải kết luận hẳn.
> 1. Test amoniac và nitrit ngay bằng que thử; nếu trên 0,2 ppm thì thay một phần nước sạch cùng nhiệt độ.
> 2. Ngừng cho ăn và kiểm tra lọc đang chạy, nước không quá đục hay có mùi lạ.
> 3. Với cá còn sống, thuần nước chậm: nhỏ từ từ nước bể vào chỗ chứa cá trong 30 đến 60 phút trước khi thả.
> 4. Từ nay chỉ thả thêm…

**Plain** (2432 characters):

> Cá chết nhanh sau 2 ngày thường do **hội chứng bể mới (new tank syndrome)**, tức là nước chưa có vi khuẩn có lợi để phân hủy chất thải. Đây là nguyên nhân phổ biến nhất.
> 
> ## Nguyên nhân thường gặp
> 
> 1. **Bể chưa chu trình nitơ (chưa cycle), nhiễm độc amoniac/nitrit (nguyên nhân chính):**
>    - Cá thải ra amoniac (NH₃/NH₄⁺), thức ăn thừa và xác lá cũng phân hủy thành amoniac.
>    - Bể mới chưa có vi khuẩn có lợi để chuyển amoniac thành nitrit, rồi thành nitrat (ít độc hơn).
>    - Amoniac và nitrit tích tụ đến mức gây độc, làm cá ngạt, mang sưng hoặc đỏ, bơi lờ đờ, nổi đầu, há miệng thở gấp.
> 
> 2. **…

### cycling-03 · post · ours wins (7 · 5)

**Asked:** Em mới chơi lần đầu, nghe người bán cá chỉ và hơi hấp tấp nên trong một tuần em set nền full trân châu ngọc trai lùn, trồng cây xếp cảnh. Sau đó em thả 2 ngàn đồng cá trâm, 5 con tép RC, 1 tỳ bà baby, chục con bảy màu. Đổ nước vào được một tuần thì rêu hại tràn lan, loại rêu trắng trắng làm thối rữa trân châu và lan rất nhanh. Bảy màu chết 7 con, cá trâm chết gần nửa đàn, tép trốn biệt vài ngày mới thấy ló mặt. Cây đang chết dần chết mòn, em đã thay nước, vớt bớt rêu, thả tép mồi số lượng lớn mà bất lực. Em đang định bỏ hồ này set lại theo kiểu nền đá đen, tường full rêu, mấy cây lá to dày, nuôi đội vệ sinh tỳ bà bướm, chuột panda, tép RC, cá trâm. Nên làm sao?

**Judge:** Cả hai đều chỉ ra đúng nguyên nhân là bể chưa chạy xong chu trình nitơ. X ngắn, xếp bước theo thứ tự rõ ràng, nói đúng lớp trắng là vi khuẩn bùng trên chất hữu cơ thừa, và có thẻ loài cá trâm đi kèm. Y dài và có thêm vài ý hay, nhưng hiểu nhầm trân châu là sỏi nền và nói sai về tỳ bà bướm. / Y chỉ đúng nguyên nhân: hồ chưa chạy chu trình nitơ và phân nền mới đang nhả amoniac. Y đưa ra các bước gọn, có thứ tự, có con số, và lưu ý đúng về nhu cầu nước của cá trâm. X hiểu nhầm trân châu là sỏi nền, nói sai rằng tỳ bà bướm ăn cây, và viết dài lan man.

**Ours lacks:** follow-up, tank-fit. **Plain lacks:** wrong, too-long, tank-fit.

**Ours** (read 4 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là bể chưa kịp chạy chu trình nitơ: thả cá sau một tuần khi nền mới đang nhả amoniac và nitrit nên bảy màu và cá trâm chết hàng loạt. Lớp trắng bết trên trân châu và cây là vi khuẩn bùng lên trên chất hữu cơ thừa, còn cây chết dần vì thiếu ổn định và nền đang nhả dinh dưỡng quá nhiều. Mình chưa xác định được chắc loại rêu trắng này, nên bạn cần test nước để biết rõ hơn.
> 1. Test amoniac và nitrit ngay hôm nay; nếu còn có số, thay 50% nước mỗi ngày và ngừng cho ăn.
> 2. Vớt xác cá, lá rữa và rêu chết, hút bỏ cặn dưới nền trân châu mỗi lần thay nước.
> 3. Giảm đèn còn kho…

**Plain** (3273 characters):

> Mình hiểu cảm giác bất lực khi cá chết và cây tàn dần. Chuyện này rất phổ biến với người mới, và phần lớn là do **hồ chưa chu trình (chưa cycle)** cộng với **thả quá tải, cho ăn nhiều** trong khi hệ vi sinh chưa đủ để xử lý chất thải. Rêu trắng bùng lên chính là dấu hiệu của chất hữu cơ dư thừa đang phân hủy.
> 
> ## 1. Việc cần làm ngay (vài ngày tới)
> 
> **Kiểm tra nước trước tiên.** Mua bộ test API Liquid (NH3/NH4, NO2, NO3, pH). Nếu NH3 hoặc NO2 khác 0 thì đó gần như chắc chắn là nguyên nhân cá chết.
> 
> **Xử lý tình trạng cấp bách:**
> - **Ngưng cho ăn 2-3 ngày.** Thức ăn thừa là nguồn amoniac chính…

### cycling-03 · tank · plain wins (5 · 6)

**Asked:** Bể mới set một tuần thì rêu trắng lan và cá chết gần nửa, có nên lật bể làm lại không?

**Judge:** Both answers correctly say this is new-tank syndrome and that the tank shouldn't be torn down. Y explains why: tearing down throws away the bacteria and restarts the cycle. Y also gives a 30–50% daily water-change plan, says to use bottled bacteria (vi sinh), which shops in Vietnam sell, and sets clear conditions for when tearing down makes sense. X's tear-down cutoffs look invented, and it adds talk about its own sources. Neither answer uses the tank's details: the shrimp, the feeder shrimp they just added, or the water change they already did. / Both answers correctly blame new tank syndrome and advise against tearing down the tank. Neither uses the hobbyist's fish or the rotting trân châu. X gives clearer daily steps (30-50% water changes every day, stop feeding, add bacteria). Y's 5 mg/L threshold for moving fish is too high, and it brings in old tank syndrome and handbook talk that don't help.

**Ours lacks:** tank-fit, local, figures. **Plain lacks:** tank-fit, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể mới set một tuần mà cá chết gần nửa thường là hội chứng bể mới: amoniac tăng vọt khi vi khuẩn lọc sinh học chưa đủ để xử lý chất thải, và đây là nguyên nhân phổ biến nhất trong giai đoạn này. Mình chưa thấy bạn đo nước nên chưa chắc chắn, nên chưa cần lật bể làm lại ngay.
> 1. Đo ngay amoniac, nitrit, pH, nhiệt độ; nếu có, đo thêm oxy hòa tan.
> 2. Ngưng cho ăn, rồi thay khoảng 50% nước bằng nước đã khử clo, cùng nhiệt độ với bể.
> 3. Sục khí mạnh, kiểm tra máy sủi và máy lọc còn chạy, vớt cá chết ra ngay.
> 4. Nếu amoniac trên 5 mg/L và pH dưới 7, chuyển cá còn lại sang một bể tạm có nước sạch, p…

**Plain** (1555 characters):

> **Thường không cần lật bể.** Bể mới một tuần mà cá chết nhiều thường là do **chu trình nitơ chưa ổn định** (amoniac và nitrit tăng cao), không phải bể hỏng không cứu được. Vi khuẩn có lợi nằm trong lọc, sỏi và trang trí, nếu đổ đi làm lại thì bạn phải chờ chu trình chạy lại từ đầu, thường mất thêm 3-6 tuần.
> 
> **Việc nên làm ngay:**
> 
> 1. **Test nước** (amoniac, nitrit, nitrat, pH). Nếu amoniac hoặc nitrit trên 0 là đang độc, cần xử lý gấp.
> 2. **Thay nước 30-50% mỗi ngày** nếu có amoniac/nitrit, dùng nước đã khử clo, cùng nhiệt độ với bể. Dùng thuốc khử độc amoniac nếu có.
> 3. **Ngừng cho ăn 1-2 n…

### cycling-04 · post · plain wins (7 · 7.75)

**Asked:** Hồ mình 40x30x30, vừa set up được 5 ngày thì có hiện tượng cá chết, mặt hồ có bọt trắng là sao? Hồ như vậy có cần thay nước thường xuyên không, có cần sục sủi không? Mình chỉ để chạy máy lọc nước thôi.

**Judge:** Cả hai câu trả lời đều chẩn đoán đúng là hồ chưa chạy xong chu trình nitơ (cycling). Y tốt hơn vì nói thêm các nguyên nhân khác hay gặp: nước máy chưa khử clo, xà phòng còn sót lại, thả cá bị sốc nhiệt hoặc chênh pH. Y cũng gợi ý dùng chất giải độc amoniac, tính đúng thể tích hồ 36 lít kèm lời khuyên về số lượng cá, và nói rõ có nên sục khí hay không khi trời nóng. X ngắn gọn và đúng, nhưng ít bám vào cái hồ cụ thể của người hỏi. / Cả hai đều đoán đúng là hồ chưa chạy xong chu trình nitơ, và các bước xử lý gần như giống nhau. X hợp với hồ này hơn: tính ra thể tích 36 lít, gợi ý chất khử độc kiểu Prime, nhắc trời nóng thì nên có sủi, và trả lời đủ chuyện thay nước khi hồ còn mới lẫn khi đã ổn định. Đổi lại X hơi dài và có một lỗi nhỏ về số lượng betta. Y gọn và có lịch theo dõi rõ ràng nhưng ít dùng đến chi tiết của hồ này.

**Ours lacks:** tank-fit, local. **Plain lacks:** too-long.

**Ours** (read 1 pages):

> Mình đoán nguyên nhân chính là bể mới 5 ngày chưa đủ vi khuẩn có lợi để phân hủy amoniac và nitrit từ cá, thức ăn thừa và chất thải. Chất độc tích tụ thì cá dễ chết, còn bọt trắng thường là protein và chất hữu cơ nổi lên từ thức ăn, chất thải hoặc cặn bẩn còn sót lại khi set bể. Mình chưa thể chắc chắn chỉ từ bọt, nên cần đo nước để xác định.
> 1. Đo amoniac và nitrit ngay bằng que thử. Nếu trên 0,2 ppm, thay khoảng 25 đến 30% nước bằng nước đã khử clo.
> 2. Ngừng cho ăn hoặc chỉ cho ăn rất ít, và vớt hết cá chết cùng thức ăn thừa dưới đáy.
> 3. Giữ máy lọc chạy liên tục, không tắt. Nếu mặt nước ít…

**Plain** (2320 characters):

> ## Nguyên nhân có thể
> 
> Hồ mới 5 ngày thường chưa đủ **chu trình nitơ** (cycling). Hồ mới chưa có vi khuẩn có lợi để phân hủy chất thải của cá:
> 
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻) tích tụ** từ phân cá, thức ăn thừa, xác lá. Đây là nguyên nhân chết cá phổ biến nhất ở hồ mới. Amoniac và nitrit rất độc, còn cá thì yếu dần.
> - **Bọt trắng trên mặt** thường là bọt protein từ chất hữu cơ, hoặc do vi khuẩn bùng phát trong giai đoạn đầu. Bọt có thể do thức ăn thừa, phân, hoặc dư chất tẩy rửa/xà phòng còn sót lại khi vệ sinh hồ và trang trí.
> - Các nguyên nhân khác: nước máy chưa khử clo, nhiệt độ h…

### cycling-04 · tank · ours wins (7.25 · 6.25)

**Asked:** Bể mới set 5 ngày cá chết và mặt nước có bọt trắng, là sao?

**Judge:** Both answers get it right: the tank is only 5 days old and hasn't cycled, so ammonia built up. X gives a short plan in the right order (test, remove the dead fish, change water, add air, don't add fish yet) and says to test every day. Y covers more possible causes, like soap and chlorine, and suggests Prime, but it is long and padded. Y also asks for the tank size, which the app already holds, and neither answer links the advice to the tank having no air pump. / Cả hai đều đúng: bể mới chưa chạy xong chu trình nitơ nên amoniac/nitrit tăng cao. Y gọn hơn, các bước có thứ tự rõ, có dặn thử amoniac mỗi ngày và chờ amoniac/nitrit về 0 rồi mới thả thêm cá. X dài, liệt kê nhiều khả năng như một bài hướng dẫn chung, lại hỏi lại thể tích bể dù đã có kích thước 40×30×30 (~36 lít). Bù lại, X có nhắc clo trong nước máy và xà phòng, là những nguyên nhân hay gặp ở Việt Nam mà Y bỏ qua. Cả hai đều không tận dụng chi tiết bể chỉ chạy lọc, không có sủi.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** too-long, tank-fit, follow-up.

**Ours** (read 2 pages):

> Nhiều khả năng bể chưa đủ vi khuẩn có lợi để xử lý amoniac, nên amoniac từ phân cá, thức ăn thừa và cá chết tích lên đến mức làm cá chết. Bọt trắng trên mặt nước thường là chất hữu cơ phân hủy hoặc lớp màng protein trong bể mới, chưa chắc là dấu hiệu riêng, nhưng cùng lúc với cá chết thì rất đáng ngờ. Mình chưa có trang nào trong cẩm nang chẩn đoán đúng bọt này, nên đây là suy đoán từ kinh nghiệm chung, bạn cần thử nước để xác nhận.
> 1. Thử amoniac và nitrit ngay bằng que thử; nếu amoniac hoặc nitrit trên 0 thì bể chưa chạy xong chu trình nitơ.
> 2. Vớt hết cá chết ra ngay và ngừng cho ăn ít nhấ…

**Plain** (2085 characters):

> Bể mới 5 ngày mà cá đã chết và có bọt trắng thường là dấu hiệu **bể chưa ổn định, nước đang bị nhiễm độc**. Nguyên nhân hay gặp nhất:
> 
> ## Nguyên nhân có thể
> 
> 1. **Ammonia (NH₃/NH₄⁺) hoặc Nitrite (NO₂⁻) tăng cao.** Đây là nguyên nhân phổ biến nhất. Bể mới chưa có vi khuẩn có lợi để phân hủy chất thải, nên khí độc tích tụ và giết cá. Cá thường bơi ngoi lên mặt, há miệng, mang đỏ hoặc tím.
> 2. **Bọt trắng** thường do chất hữu cơ dư thừa: thức ăn thừa, phân cá, cá chết phân hủy, nhớt cá, hoặc còn sót xà phòng/chất tẩy rửa khi vệ sinh bể, lọc, đá, cây.
> 3. **Sốc môi trường:** nước máy chứa clo/chlor…

### cycling-05 · post · plain wins (5 · 7)

**Asked:** Mình mới tập set một hồ biotop 845, chỉ có lũa hải sa quỳ, đá đen và đá cuội, vài cây thủy sinh không cần CO2, lọc thùng Atman, đèn rọi vàng-trắng. Giai đoạn mới châm đầy nước và chạy lọc thì nên châm loại vi sinh nào?

**Judge:** Y nói đúng ý chính: hồ không cá thì phải cho vi sinh 'thức ăn' (thức ăn khô hoặc amoni), và có nhắc tanin từ lũa. X đưa liều Stability đúng nhãn, nhưng thiếu nguồn amoni, nên chờ test về 0 sẽ báo sai là hồ đã chạy xong, và lời khuyên thay nước khi amoni vượt 0,1 lại làm chậm việc chạy hồ. / X đưa ra quy trình chạy bể không cá đủ ý: thêm nguồn amoni 2–4 ppm, test cả ba chỉ số và cấy vật liệu lọc từ bể cũ. Y bỏ mất bước cấp amoni cho vi sinh và khuyên thay nước khi amoni vượt 0,1, nên dễ báo sai là bể đã chạy xong. Cả hai đều không tính liều theo thể tích bể 845 (khoảng 160 L).

**Ours lacks:** wrong, tank-fit, local. **Plain lacks:** figures, too-long, local.

**Ours** (read 2 pages):

> Bạn nên châm men vi sinh (vi khuẩn đóng chai, ví dụ Seachem Stability hoặc FritzZyme, hay loại tương đương) ngay khi bể đã có nước và lọc đã chạy, vì bể mới chưa có hệ vi sinh để phân hủy amoni và nitrit. Bể không CO2 và chưa có cá vẫn cần bước này. Cách nhanh hơn nữa là xin thêm vật liệu lọc đã chạy từ một bể khỏe để mồi vi sinh.
> 1. Trung hòa clo trong nước máy, rồi chờ 30 phút trước khi châm men.
> 2. Chạy lọc Atman liên tục và giữ nhiệt độ khoảng 24–26°C trước khi châm men.
> 3. Châm men đúng liều in trên nhãn chai, ví dụ Seachem Stability khoảng 5 mL cho 40 lít vào ngày đầu, rồi thêm theo nhã…

**Plain** (2095 characters):

> Với giai đoạn châm nước và chạy lọc, bạn nên dùng **vi sinh nitrat hóa** (nitrifying bacteria), thường ghi là chứa *Nitrosomonas* và *Nitrobacter*. Nhóm vi khuẩn này chuyển hóa amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻), hai chất rất độc với cá, thành nitrat (NO₃⁻) ít độc hơn. Các dòng phổ biến gồm Seachem Stability, Tetra SafeStart, API Quick Start, Tetra Nitrivec và các dòng vi sinh tươi từ bể đã chạy ổn định.
> 
> **Các bước nên làm:**
> 
> 1. **Khử clo trước khi châm nước.** Clo sẽ diệt vi khuẩn. Dùng nước đã để qua đêm, hoặc dùng chất khử clo, và chỉ thả vi sinh sau khi nước đã xử lý xong.
> 2. **Ngâm lũ…

### cycling-05 · tank · plain wins (5.25 · 6.75)

**Asked:** Bể mới đổ nước chạy lọc, nên châm vi sinh loại nào để sớm thả cá?

**Judge:** Y trả lời đúng câu hỏi: kể tên các loại vi sinh sống có thật, bán ở VN, và đưa quy trình cycle cùng mốc kiểm tra rõ ràng. Nhưng Y gợi ý sai loại cá để thả đầu (neon, lia thìa). X chung chung, không nêu tên sản phẩm, và có con số 38 lít khó hiểu. Cả hai đều không dùng thông tin bể 160 lít, biotop, có lũa. / X answers 'which kind' directly: it names real live-bacteria products and gives a clear fishless-cycle plan with ammonia figures and when the cycle is done, although listing neon as a hardy fish is wrong. Y is safe but vague: it repeats the guide, names no product, and neither answer uses the 160 L biotope tank with the Atman canister filter.

**Ours lacks:** tank-fit, figures, local. **Plain lacks:** tank-fit, local.

**Ours** (read 2 pages):

> Muốn thả cá sớm, bạn nên dùng vi khuẩn nitrat hóa sống, không chỉ loại vi sinh ghi chung chung. Cẩm nang nói bạn có thể mua một chai vi khuẩn nitrat hóa sống, xin ít vật liệu lọc đã chạy lâu từ bạn bè, hoặc trồng cây thủy sinh để rút ngắn thời gian cycle. Khi bể mới chưa có đủ vi khuẩn, amoniac và nitrit từ cá dễ tích lại, nên cần làm đồng thời các bước dưới đây.
> 1. Mua vi khuẩn nitrat hóa sống và làm theo hướng dẫn in trên nhãn, chọn loại ghi rõ là vi khuẩn sống.
> 2. Nếu có bể đã ổn định, xin ít vật liệu lọc hoặc nền từ bể đó và cho vào ngăn lọc của bể mới.
> 3. Trồng thêm cây thủy sinh để cây …

**Plain** (1429 characters):

> Với bể mới, bạn nên chọn **vi sinh chứa vi khuẩn nitrat hóa sống** (thường có *Nitrosomonas* và *Nitrobacter*). Các loại phổ biến gồm **Seachem Stability**, **Tetra SafeStart**, **API Quick Start**, **Dr. Tim's** hoặc **Sera Bio Nitrivec**. Tránh loại chỉ có enzyme hoặc chỉ khử clo, vì chúng không giúp hình thành chu trình nitơ.
> 
> **Cách làm:**
> 1. **Châm vi sinh ngay** sau khi đổ nước và chạy lọc, liều theo hướng dẫn trên bao bì. Có thể châm lại sau 1-2 tuần để bù lượng vi khuẩn.
> 2. **Nuôi vi khuẩn bằng nguồn amoniac:** cho ăn một ít thức ăn mỗi ngày, hoặc dùng amoniac nguyên chất (không có ch…

### cycling-06 · post · plain wins (6 · 7)

**Asked:** Em mới set một bể cubic 20 loại lowtech, mấy hôm nay nước trong bể tự nhiên rất đục, mờ mờ như lớp sương mù. Mọi người bảo do vi sinh bị chết. Làm sao khắc phục và tạo lại vi sinh? Em cũng nuôi cá trong thùng xốp, nước trong đó rất trong dù thỉnh thoảng mới hút cặn và châm thêm nước. Em lấy nước thùng xốp đó châm mồi vi sinh cho bể mới được không?

**Judge:** Cả hai đều nói đúng nguyên nhân là bùng vi khuẩn chứ không phải vi sinh chết. Y hợp với bể lowtech hơn: Y khuyên thêm cây mọc nhanh, cảnh báo nguy cơ mang bệnh từ thùng xốp sang, và nói thật là dùng nước thùng xốp được nhưng ít hiệu quả. X thì khuyên để đèn tới 12 tiếng và tự cho rằng thùng xốp có lọc, trái với lời bạn ấy kể, dù X có trích dẫn bài viết sát với điều kiện ở Việt Nam. / Both answers say the cloudiness is a bacterial bloom, not dead bacteria, and that it's better to move filter media than pour in water from the foam box. X's advice is safer and also warns that fish diseases could come along with the water. Y adds a useful polyester floss tip and Vietnam-specific guide excerpts, but its 8–12 hours of light per day is wrong for a new low-tech tank.

**Ours lacks:** tank-fit, wrong. **Plain lacks:** local, follow-up.

**Ours** (read 5 pages):

> Nước trắng đục như sương mù trong bể mới thường là bùng vi sinh, chứ chưa chắc vi sinh đã chết. Vi khuẩn sinh sôi rất nhanh khi bể còn non, nhiều chất hữu cơ, thức ăn dư hoặc cặn từ nền. Nếu ammonia đo được bằng 0 thì chưa đáng lo.
> 1. Đo ammonia bằng que thử; nếu bằng 0 thì để bể tự cân bằng và đừng đụng vào lọc.
> 2. Ngưng cho ăn khoảng 7 ngày, và chỉ cho ăn ít khi bể có cá.
> 3. Giảm đèn còn khoảng 8–12 tiếng mỗi ngày và đặt bể tránh nắng chiếu trực tiếp.
> 4. Nếu vài ngày vẫn chưa bớt, lót bông tấm polyester 100% vào tầng lọc cơ học để giữ lại cặn lơ lửng; không dùng loại ghi chống nấm mốc.
> 5. K…

**Plain** (2164 characters):

> ## Nước đục có phải do vi sinh chết không?
> 
> Nhiều khả năng **không**. Nước đục mờ như sương ở bể mới thường là **bloom vi khuẩn** (vi khuẩn sinh sôi quá mức khi có nhiều chất hữu cơ từ thức ăn, lá rụng, phân, hoặc nước máy mới). Đây là giai đoạn bình thường khi bể đang chạy (cycling), kéo dài khoảng 1-3 tuần. Vi sinh có ích (nitrat hóa) chủ yếu bám trên bề mặt lọc, nền, đá, kính, cây, nên nước đục không có nghĩa là chúng chết.
> 
> ## Cách xử lý
> 
> - **Đừng thay nước lớn** hoặc rửa lọc bằng nước máy mạnh. Việc này loại bỏ vi sinh bám và làm bloom kéo dài.
> - **Giảm ánh sáng** xuống khoảng 4-6 giờ/ng…

### cycling-06 · tank · ours wins (6.25 · 5.25)

**Asked:** Bể mới set bỗng đục mờ như sương, có phải vi sinh chết và làm sao gây lại?

**Judge:** Cả hai đều nói đúng rằng nước đục là bùng vi khuẩn chứ không phải vi sinh chết, nhưng cả hai đều bỏ qua bể cubic 20 cm và thùng xốp của bạn này: nên lấy bông lọc hoặc nền từ thùng xốp để mồi vi sinh thì tốt hơn lấy nước. X ngắn gọn, làm theo thứ tự đo rồi mới xử lý, dễ làm ngay. Y có thêm số liệu (thay 20–30% nước, amoni 2–4 ppm, chạy 4–8 tuần) nhưng dài và lan man, khuyên tắt đèn bất lợi cho cây, dùng chữ "bloom" tiếng Anh và cuối bài thì hỏi lại. / Cả hai đều nói đúng rằng đây là bùng vi khuẩn chứ không phải vi sinh chết. Y gọn hơn và làm theo thứ tự đo trước rồi rẽ nhánh theo kết quả. Y còn chỉ cách phân biệt với bụi nền và nêu dấu hiệu cá bị ngộ độc. X dài, chung chung, kèm cách chạy chu trình bằng amoniac kiểu nước ngoài. Không bên nào để ý đến bể cubic 20 hay ý định lấy nước thùng xốp để mồi vi sinh, trong khi nước thì mang rất ít vi sinh.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, local.

**Ours** (read 2 pages, stopped at the calls limit):

> Nhiều khả năng đây là bùng vi sinh chứ không phải vi sinh chết: bể mới hay đục trắng như nước vo gạo khi vi khuẩn nở hoa, thường là lúc bể đang chạy chu trình nitơ. Mình chưa biết chỉ số trong bể bạn, nên việc đầu tiên là đo.
> 1. Đo ammonia và nitrite ngay, đồng thời kiểm tra nhiệt độ nước.
> 2. Nếu ammonia và nitrite đều bằng 0 thì chưa cần làm gì: ngưng cho ăn khoảng 7 ngày và để nguyên bộ lọc, không vệ sinh hay đổi gì trong lọc.
> 3. Nếu ammonia hoặc nitrite trên 0, thay một phần nước (đừng thay 75% một lần) và đo mỗi ngày cho đến khi về 0.
> 4. Nếu bể thật sự vỡ vi sinh, mồi lại bằng vật liệu lọ…

**Plain** (1912 characters):

> Bể mới bị đục trắng như sương thường **không phải vi sinh chết**. Phổ biến nhất là **bloom vi khuẩn** (bùng phát vi khuẩn dị dưỡng), xảy ra trong 1-2 tuần đầu khi bể đang chu trình nitơ. Nguyên nhân thường gặp là dư thức ăn, chất hữu cơ thừa, cá chết hoặc phân cá tích tụ, hoặc vật liệu lọc và nền mới còn bụi. Đây là dấu hiệu vi sinh đang hình thành, không phải vi sinh chết.
> 
> Tuy nhiên, nếu bể đã ổn định rồi bỗng đục sau khi rửa lọc bằng nước máy, dùng thuốc, hoặc thay nước quá nhiều, thì có thể vi sinh có ích đã bị giết và bạn cần gây lại.
> 
> **Cách xử lý khi bloom:**
> - Đừng hoảng và đừng thay …

### cycling-07 · post · ours wins (5.5 · 3.5)

**Asked:** Hồ em mới set hôm nay, có phân nền và chỉ một số cây cắt cắm dễ trồng. Em đặt trong phòng ngủ nên không thích sủi và lọc vì tiếng ồn. Người bán bảo chỉ cần 2-3 ngày thay nước một lần là được, vậy có ổn không, có cách nào khác không?

**Judge:** Y nói sai rằng thay nước thường làm mất vi sinh, và lịch 1-2 tuần mới thay nước là rủi ro với phân nền mới. X nhận ra đúng chuyện amoniac trong hồ chưa có chu trình, và đưa ra cách làm êm hợp lý (lọc mút với máy sủi để xa, giảm đèn, thả bèo). Tuy vậy X vẫn chưa nói rõ là nên thay nước thường xuyên trong thời gian đầu. / Cả hai đều bác sai việc thay nước dày, mà với hồ phân nền mới thì đó lại là cách đúng. Trong khi đó X còn lặp lại ngộ nhận thay nước làm mất vi sinh và đẩy lịch thay lên 1-2 tuần. Y an toàn hơn vì có chạy chu trình, giảm đèn và thay ngay khi amoniac lên, dù đề xuất cây buộc lũa lệch với hồ của người hỏi.

**Ours lacks:** figures, tank-fit, diagnosis. **Plain lacks:** wrong, too-long, tank-fit, figures.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ lời người bán chưa ổn. Bể mới set hôm nay chưa có vi sinh lọc, nên dù chưa thả cá, phân nền và lá cây mục vẫn sinh amoniac. Thay nước 2-3 ngày một lần không theo kịp, và cẩm nang cũng nói bể không lọc thì amoniac tích lại nhanh. Cẩm nang chưa có con số riêng cho bể mới không lọc, nên các bước dưới đây là kinh nghiệm chung của mình.
> 1. Chưa thả cá, và chạy chu trình nitơ trước, thường vài tuần đến vài tháng.
> 2. Nếu muốn không tiếng ồn, dùng lọc mút (sponge) chạy bằng máy sủi đặt ngoài phòng ngủ hoặc dưới tủ, lót đệm cao su và chỉnh bọt thật nhỏ.
> 3. Hạ đèn xuống khoảng 50-60%, chiếu k…

**Plain** (2058 characters):

> **Thay nước 2-3 ngày một lần thường là không cần thiết.** Hồ mới set, nhất là hồ thủy sinh có phân nền, cần vài tuần để ổn định. Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi đang hình thành, và bạn phải xử lý nước máy liên tục. Cách làm hợp lý hơn:
> 
> - **Nếu chưa có cá hoặc chỉ có rất ít cá:** thay 20-30% nước mỗi 1-2 tuần, hoặc khi nitrate (NO₃) cao. Khi có cá, lượng thức ăn và chất thải mới là nguồn gây bẩn chính.
> - **Chỉ châm thêm nước** khi bị bay hơi, dùng nước đã khử clo.
> - **Dùng bộ test nước** (NH₃/NH₄⁺, NO₂⁻, NO₃⁻) để quyết định khi nào thay nước, thay vì theo lịch cố đị…

### cycling-07 · tank · ours wins (4 · 3)

**Asked:** Bể mới set của tôi chỉ thay nước vài ngày một lần thay cho lọc thì có ổn không?

**Judge:** Neither answer notices that the tank has no filter, so neither one actually answers the question. X at least confirms that changing water every few days is right for new phân nền and points to the algae risk, while Y gives generic advice and ends by asking questions back. / Both answers misread the question. The hobbyist means water changes instead of having a filter, and neither one talks about a tank with no filter and no airstone sitting in a bedroom. Y is a little better: it agrees that frequent 30–50% changes suit new phân nền, which matches the seller's advice, and it says to watch for algae and cloudy water. X adds little that fits and mostly asks questions back.

**Ours lacks:** tank-fit, diagnosis, follow-up, off-topic. **Plain lacks:** tank-fit, asks-only, plan, diagnosis.

**Ours** (read 5 pages):

> Với bể mới set, thay nước vài ngày một lần là hợp lý, nhất là khi nền mới còn nhả nhiều dinh dưỡng. Cẩm nang có thí nghiệm hai bể giống hệt nhau: bể không thay nước bị rêu hại phủ kín sau 5 tuần, còn bể được thay nước ổn định hơn. Mình hiểu bạn thay nước thay cho việc rửa lọc. Cách đó ổn, miễn là bạn không rửa lọc quá kỹ làm mất vi sinh có lợi.
> 1. Tiếp tục thay nước đều đặn, khoảng 30 đến 50 phần trăm mỗi lần, đặc biệt trong vài tuần đầu.
> 2. Chỉ rửa lọc khi dòng nước ra yếu hơn 50% so với bình thường, hoặc nước vẫn đục, có mùi dù vừa thay nước.
> 3. Khi rửa lọc, hút 3 đến 5 lít nước bể ra xô và…

**Plain** (1338 characters):

> Tùy bạn đang hiểu "thay cho lọc" là thay nước **thay cho** việc vệ sinh lọc, hay là thay nước **và** vệ sinh lọc. Mình trả lời theo hướng bạn đang hỏi có nên thay nước thường xuyên hơn để thay thế việc vệ sinh lọc không.
> 
> **Thay nước không thay thế được việc vệ sinh lọc.** Hai việc này có tác dụng khác nhau:
> - **Thay nước** giúp giảm amoniac, nitrit, nitrat và các chất bẩn hòa tan.
> - **Vệ sinh lọc** chỉ cần khi lọc bị tắc hoặc dòng chảy yếu đi rõ rệt. Vệ sinh quá kỹ hoặc quá thường xuyên có thể làm mất vi khuẩn có lợi.
> 
> **Với bể mới, bạn nên lưu ý:**
> - **Bể chưa chạy xong chu trình nitơ (chưa…

### cycling-08 · post · plain wins (5.5 · 8)

**Asked:** Hồ của em làm từ thùng xốp 40x40x20, 2 mặt kính, 3 mặt xi măng, để trên sân thượng trong mái hiên. Em dùng lọc thác Sobo 400l/h có đủ không? Hồ như vậy có cần CO2 không? Bao lâu thì thả cá được?

**Judge:** Y explains the danger of fresh cement: high pH and leaching lime. It gives the order of steps for cycling, soaking and flushing the cement, plus how to handle rain, chlorine and the heat on the rooftop, all fitted to this tank. X is right but thin and skips the part about curing the cement. / Rủi ro lớn nhất với hồ này là phần xi măng mới làm nước kiềm và thải vôi. X giải thích rõ chuyện này: phủ epoxy, ngâm 1–2 tuần, thay nước nhiều lần cho tới khi pH ổn định. X cũng đưa các bước cycling theo thứ tự và lưu ý chuyện khử clo nước máy. Y trả lời đúng nhưng sơ sài: phần xi măng chỉ nhắc qua rồi nói thẳng là cẩm nang chưa đề cập, nên người hỏi không có hướng làm cụ thể.

**Ours lacks:** plan, too-thin, figures, tank-fit. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể 40x40x20 cm chứa khoảng 32 lít, nên lọc Sobo 400 lít/giờ là đủ và khá dư: cẩm nang khuyến nghị tối thiểu gấp 5 lần thể tích (khoảng 160 lít/giờ) và tốt hơn là gấp 10 lần (khoảng 320 lít/giờ), còn 400 lít/giờ tương đương gần 12 lần. Bể nhỏ, không trồng nhiều cây và không cần CO2 vẫn nuôi được cá bình thường; CO2 chỉ cần khi bạn chơi bể thủy sinh công nghệ cao, trồng nhiều cây ưa carbon và đèn mạnh. Thời gian cycling theo kinh nghiệm chung thường khoảng 3 đến 6 tuần, nên thả cá khi amoniac và nitrit đều đo về 0 và nitrat có mặt. Vì bể đặt trên sân thượng dưới mái hiên, bạn nên tránh nắng trự…

**Plain** (2777 characters):

> ## 1. Lọc Sobo 400 L/h có đủ không?
> 
> Thể tích nước của bể khoảng **25-30 lít** (40x40x20 cm, trừ phần sỏi và đá). Với lưu lượng 400 L/h, nước luân chuyển khoảng **13-16 lần/giờ**, nên **lọc là đủ, thậm chí dư**. Cái cần lưu ý là dòng chảy hơi mạnh cho bể nhỏ:
> 
> - Nếu nuôi cá nhỏ, cá bơi chậm hoặc betta, dòng nước dễ làm cá mệt. Bạn có thể siết van để giảm lưu lượng, hoặc dùng bọt biển che miệng hút.
> - Nên chọn lọc có ngăn chứa bông lọc, sứ lọc hoặc bio ball để tăng vi sinh.
> - Vệ sinh bông lọc mỗi 1-2 tuần, nhưng đừng giặt bằng nước máy nguyên chất. Hãy dùng nước bể đã thay ra để giữ vi sinh.
> 
> …

### cycling-08 · tank · ours wins (6 · 4)

**Asked:** Bể mới làm của tôi bao lâu thì thả cá được, lọc như vậy có đủ không?

**Judge:** X uses the real tank (about 32 L, Sobo 400 l/h), says directly whether the filter is enough, and gives steps in order with what to watch. Y gives generic advice and asks back for information that was already available. Neither warns about the fresh cement walls or the heat on the rooftop. / Y uses the tank's real details: about 32 L, and the Sobo 400 l/h is plenty of flow but light on bio media. It also gives steps in order and what to watch for. X asks for the size and filter even though it should already know them, so the filter half of the question goes unanswered. Neither answer warns that new cement walls can leach lime and raise the pH, which needs curing before any fish go in.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, asks-only, local.

**Ours** (read 2 pages, stopped at the calls limit):

> Bể 40x40x20 cm (khoảng 32 lít) thường cần vài tuần đến vài tháng để cycle, nên bạn chưa nên thả cá ngay. Cẩm nang nói chu trình hoàn tất khi cho cá ăn bình thường trong một tuần mà amoniac và nitrit đều ở 0 ppm, còn nitrat trên 0. Về lọc: lưu lượng 400 l/h của Sobo là đủ cho bể này, nhưng lọc thác có ít vật liệu sinh học nên chưa chắc đủ một mình. Đây là kinh nghiệm chung của mình, cẩm nang không có thông số riêng cho máy này.
> 1. Trồng vài cây thủy sinh hoặc cho thêm vật liệu lọc đã chạy lâu từ bạn bè để có sẵn vi khuẩn có lợi.
> 2. Nếu muốn thả cá sớm, chỉ thả 1 con nhỏ và cho ăn rất ít.
> 3. Đo…

**Plain** (1336 characters):

> Thường thì bể mới cần **khoảng 3–6 tuần** để chu trình nitơ (nitrogen cycle) ổn định trước khi thả cá. Trong thời gian này, vi khuẩn có lợi phải phát triển đủ để xử lý amoniac (NH₃) và nitrit (NO₂⁻) do cá thải ra. Nếu thả cá sớm, amoniac và nitrit sẽ tích tụ và dễ làm cá chết.
> 
> **Cách biết bể đã sẵn sàng:**
> - Dùng bộ test nước (nên dùng loại giọt, chính xác hơn que thử) kiểm tra amoniac và nitrit.
> - Khi **amoniac = 0** và **nitrit = 0** trong ít nhất 2–3 ngày liên tiếp, và đã có nitrat (NO₃⁻) xuất hiện, bể đã chạy xong chu trình.
> - Ngược lại, nếu amoniac hoặc nitrit vẫn đo được thì chưa nên t…

### sick-01 · post · ours wins (6.5 · 5.5)

**Asked:** Đàn ngựa vằn xanh nhà em nuôi gần 3 năm, rơi rụng dần. Giống này không đẻ nổi, giờ cứ 1 vài tuần lại có con cong người, 1-2 tuần sau là chết. Có phải do già quá không, hay bị bệnh gì?

**Judge:** X bám sát loài danio và nêu Pseudoloma, một bệnh điển hình ở cá ngựa vằn, kèm các bước làm theo thứ tự, nhưng bỏ sót bệnh lao và đánh giá thấp yếu tố tuổi già. Y có điểm cộng là nêu bệnh lao cùng cảnh báo lây sang người, nhưng lại sai khi gạt bỏ yếu tố tuổi già, lạc đề sang cichlid và hỏi lại quá nhiều. / Y trả lời thẳng câu hỏi về tuổi (cá sống 3–5 năm). Y cũng nêu đúng Pseudoloma, bệnh kinh điển gây cong cột sống ở cá ngựa vằn, và đưa ra các bước gọn, có hẹn theo dõi sau 2–3 tuần. X liệt kê dàn trải, không chắc đây là loài gì và kết thúc bằng nhiều câu hỏi ngược lại người nuôi, dù X có ưu điểm là nêu lao cá kèm cảnh báo lây sang người.

**Ours lacks:** diagnosis, figures. **Plain lacks:** tank-fit, too-long, wrong, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Cá ngựa vằn thường sống khoảng 3 đến 5 năm, nên đàn gần 3 năm đã là lớn tuổi, nhưng mình nghĩ nguyên nhân chính không phải chỉ là già. Cá cong người, gầy dần rồi chết trong 1 đến 2 tuần, lặp đi lặp lại trong đàn, rất giống bệnh ký sinh trùng ở hệ thần kinh hoặc bệnh gầy mòn do giun ruột. Cẩm nang có mô tả hai bệnh này. Bệnh vi bào tử (Pseudoloma) làm cá gầy mòn kéo dài và cong cột sống, khó chẩn đoán vì có khi cả con trông khỏe. Bệnh neon tetra (Pleistophora) làm cá bồn chồn, da có mảng trắng, và gần như không chữa được khi đã nặng. Mình chưa đọc được đủ để xác định chắc bệnh nào, nên phần nà…

**Plain** (2113 characters):

> Nếu "ngựa vằn xanh" là cá (zebra danio hoặc cichlid vằn xanh), thì tuổi già thường không gây ra triệu chứng này. Cá già thường yếu dần, ăn ít, đẻ kém, chứ không cong người rồi chết trong 1-2 tuần. Biểu hiện cong người kèm chết nhanh thường là bệnh, và có vài nguyên nhân chính:
> 
> 1. **Lao cá (Mycobacteriosis)**: Đây là nghi ngờ hàng đầu với triệu chứng bạn mô tả: gầy dần, rụng dần, cong cột sống, bụng hõm, có thể có vết loét hoặc u hạt. Bệnh âm ỉ, lây lan chậm, khó chữa. Lao cá có thể lây sang người qua vết xước, nên khi xử lý cá bệnh hoặc xác chết phải đeo găng tay và rửa tay kỹ.
> 2. **Nhiễm kh…

### sick-01 · tank · plain wins (5 · 6)

**Asked:** Cá ngựa vằn của tôi cứ vài tuần lại có con cong người rồi chết, là bệnh gì?

**Judge:** Y nêu đúng hai nguyên nhân hay gặp nhất ở cá ngựa vằn bị cong người rồi chết dần: lao cá và vi bào tử trùng Pseudoloma. Y còn cảnh báo bệnh lao có thể lây sang người và dặn đeo găng tay, nên an toàn hơn X, dù danh sách dài và có vài khả năng ít liên quan. Không câu trả lời nào nhắc rằng đàn cá đã nuôi gần 3 năm, đã có tuổi, nên chết dần cũng có thể một phần do già. / X nêu đúng hai nguyên nhân chính ở cá ngựa vằn là lao cá và Pseudoloma, và dặn đeo găng tay vì lao cá lây sang người. Y chỉ nói chung chung về vi bào tử trùng và bỏ sót lao cá. Cả hai đều không nhắc rằng đàn cá đã gần 3 năm tuổi, đã khá già.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages, stopped at the calls limit):

> Triệu chứng cá cong người, gầy dần rồi chết, lặp lại sau vài tuần, rất giống bệnh vi bào tử trùng (microsporidiosis, dân gian gọi là bệnh gầy, skinny disease) hoặc bệnh neon tetra (NTD). Cả hai đều do ký sinh trùng vào cá qua đường miệng và ảnh hưởng đến cột sống, cơ và thần kinh. Mình chỉ đoán từ mô tả, nên chưa chắc chắn, và handbook không có cách chữa khỏi cho hai bệnh này.
> 1. Vớt con đang cong người ra một bể cách ly riêng, đặt xa các bể khác nếu có thể.
> 2. Không thả thêm cá mới vào bể này, và cá mới nào cũng nên cách ly trước khi nhập.
> 3. Kiểm tra nước (amoniac, nitrit, pH, nhiệt độ) để …

**Plain** (1884 characters):

> Cá ngựa vằn bị cong người rồi chết thường gặp trong vài bệnh sau. Tôi không thể chẩn đoán chắc chắn chỉ từ mô tả, nhưng các khả năng phổ biến nhất là:
> 
> 1. **Bệnh lao cá (mycobacteriosis)** do *Mycobacterium* spp. Đây là bệnh mạn tính, hay gặp ở cá ngựa vằn và hay gây cong cột sống, gầy rộc, bụng phình, có thể có u hạt. Cá bệnh thường chết dần trong nhiều tuần, lây qua cá khác và có thể lây cho người.
> 
> 2. **Microsporidia *Pseudoloma neurophilia*** là ký sinh trùng gây tổn thương thần kinh và cột sống. Cá thường bơi bất thường, co giật, cong vẹo rồi gầy yếu và chết dần.
> 
> 3. **Nhiễm virus Nodavi…

### sick-02 · post · tie or split (7.5 · 7.25)

**Asked:** Nguyên nhân cá chết là gì ạ? Em có bể cá vàng, 7 màu và mấy loại linh tinh rẻ rẻ cho con chơi, nuôi trong nhà, mật độ thưa. Lọc với sục oxy chạy 24/24, nước trong sạch; em cho ăn rất ít, thức ăn viên mua sẵn; ít thay nước, chỉ thay khi thấy vẩn đục, có xử lý clo trước khi cho nước vào. Cái mút xốp lọc em giặt nước lã suốt vì phân cá hút lên nhanh bẩn. Vậy mà tuần nào cũng có con chết, tháng nào cũng đi mua thêm mà cứ chết dần.

**Judge:** Both answers name the right cause: washing the sponge in tap water and changing water too rarely. Y is slightly better because it also flags the problem of keeping goldfish, which like cool water, with tropical guppies, and it gives an emergency step (a big water change plus an ammonia/nitrite detoxifier). X is more concise and follows a clear order with a follow-up check, but it misses the point about mixing the two kinds of fish. / Both answers find the same likely cause: washing the filter sponge in tap water kills the filter bacteria, and rare water changes let ammonia build up. Y gives short steps in order, says what to recheck after 2–3 days, and notes that goldfish make a lot of waste. X adds a useful emergency water change and the point that goldfish and guppies (cá 7 màu) like different temperatures, but it is padded with general advice, has no clear recheck plan, and ends by asking questions.

**Ours lacks:** tank-fit, figures. **Plain lacks:** too-long, follow-up.

**Ours** (read 2 pages, stopped at the calls limit):

> Nhiều khả năng nước bể đang tích amoniac và nitrit, vì vi khuẩn lọc sinh học bị giết dần. Giặt mút lọc bằng nước máy là thủ phạm hay gặp nhất, vì clo trong nước máy diệt vi khuẩn sống trong mút. Thay nước chỉ khi đã vẩn đục làm chất bẩn tích lâu, trong khi cá vàng thải rất nhiều chất bẩn nên bể ít cá vẫn bẩn nhanh. Mình chưa đo được nước của bạn nên chưa chắc chắn hoàn toàn, nhưng đây là hướng cần kiểm tra trước.
> 1. Mua bộ test amoniac và nitrit, đo nước hôm nay và ghi lại kết quả.
> 2. Ngưng giặt mút bằng nước máy; từ nay chỉ xả mút trong nước đã rút ra từ chính bể.
> 3. Thay 30–50% nước mỗi tuầ…

**Plain** (2226 characters):

> Nguyên nhân khả năng cao nhất là **độc tố amoniac/nitrit do hệ vi sinh lọc bị phá hỏng**. Cá chết dần, tháng nào cũng phải mua thêm là dấu hiệu điển hình của việc này.
> 
> **Vì sao xảy ra:**
> 
> 1. **Giặt mút lọc bằng nước máy/nước lã là nguyên nhân chính.** Trên mút lọc có một lớp vi khuẩn có lợi (vi khuẩn nitrat hóa) chuyên phân hủy amoniac từ phân và thức ăn thừa thành nitrit, rồi thành nitrat ít độc hơn. Clo trong nước máy và việc giặt sạch làm chết lớp vi khuẩn này. Bể mất khả năng "dọn" chất thải, amoniac tích tụ dần, cá chết từ từ. Bể trông vẫn trong nhưng độc tố vô hình.
> 
> 2. **Thay nước quá…

### sick-02 · tank · ours wins (8.25 · 5)

**Asked:** Bể tôi tuần nào cũng có cá chết dù nước trong và cho ăn ít, nguyên nhân là gì?

**Judge:** X chỉ đúng hai thói quen của người hỏi đang làm hỏng lọc vi sinh: giặt mút lọc bằng nước lã (nước máy có clo) và chỉ thay nước khi vẩn đục. X còn đưa ra các bước theo thứ tự, có số liệu và có dặn theo dõi gì. Y liệt kê 10 nguyên nhân chung chung, không dựa vào bể cụ thể này, và có lời khuyên không hợp (giảm bớt cá, kiểm tra heater). / Y names the two likely causes in this tank: the filter sponge washed often in tap water kills the good bacteria, and water changed only when cloudy lets ammonia and nitrite build up. It then gives clear steps in order with tests and what to watch for. X lists ten general causes for any tank, including a heater the user may not have, and never points to the problem in this tank.

**Ours lacks:** –. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 1 pages):

> Nước trong không có nghĩa là nước an toàn. Khi cá chết lặp lại mỗi tuần, nguyên nhân hay gặp nhất là amoniac hoặc nitrit tích lại vì lọc vi sinh yếu dần, và cá chết trước khi bạn thấy nước đục. Bể của bạn có hai điểm dễ làm lọc yếu: mút lọc được giặt bằng nước máy thường xuyên (clo giết vi khuẩn có lợi), và nước chỉ được thay khi vẩn đục nên chất độc có thể tích lâu. Mình chưa thể chắc đây là nguyên nhân duy nhất khi chưa đo nước, nên hãy kiểm tra trước.
> 1. Mua bộ thử amoniac, nitrit, nitrat và clo, rồi đo nước bể ngay hôm nay.
> 2. Từ nay chỉ rửa mút lọc bằng nước lấy từ chính bể, không dùng n…

**Plain** (3042 characters):

> Nước trong **không có nghĩa là nước an toàn**. Cá chết lặp lại hằng tuần thường do một vấn đề ẩn mà mắt thường không thấy. Các nguyên nhân phổ biến nhất:
> 
> ## 1. Amoniac (NH₃/NH₄⁺) hoặc nitrit (NO₂⁻) tích tụ
> Đây là nguyên nhân hay gặp nhất.
> - Hệ vi sinh lọc sinh học chưa đủ mạnh hoặc bị mất do rửa lọc bằng nước máy, thay hết nước, hoặc vệ sinh vật liệu lọc quá kỹ.
> - Chất thải, thức ăn thừa và xác lá phân hủy sinh ra amoniac.
> - Cá yếu mang, đỏ mang, nằm đáy, bơi lờ đờ thường là dấu hiệu.
> 
> ## 2. Nuôi quá nhiều cá so với dung tích
> Cho ăn ít nhưng số lượng cá nhiều vẫn tạo ra nhiều chất thải, làm …

### sick-03 · post · ours wins (7 · 4.5)

**Asked:** Hồ em trồng minifiss, ráy và ít cắt cắm (sunset, rong la hán), nuôi tép màu và ít cá (bảy màu, otto, pigmy). pH lúc có CO2 đo được 7, KH 4, GH 8, TDS 360; nước nguồn TDS cao (160-200). Rong èo uột không phát triển, ráy ra lá non nhưng không khỏe, có rêu xanh bám lá, fiss phát triển chậm. CO2 em để 2-3 giọt/giây nhưng test CO2 vẫn báo thiếu. Tép bị chết lai rai, cá tầm 1-2 tuần chết 1 con. Có cách nào hạ TDS không, hay do đâu?

**Judge:** X is the better answer. It works out CO2 correctly from pH 7 and KH 4 (about 12 ppm, which is too low) and gives a short plan that fits this tank. Y says 12 ppm is enough and blames the test kit, so it gets the main problem wrong, misreads 'tầm' as a fish species, and runs long. Its useful points (evaporation top-up raising TDS, copper, Neocaridina vs Caridina) don't make up for that. / Y works out CO2 at about 10–12 ppm, says that is below what plants need, agrees with the test kit, and gives short, ordered steps that fit this tank. X says 12 ppm is enough and blames the test kit, which is the wrong cause. It also reads "tầm" as a fish name and is padded.

**Ours lacks:** figures. **Plain lacks:** too-long, wrong, diagnosis.

**Ours** (read 4 pages, stopped at the tools limit):

> Nhiều khả năng bể đang thiếu dinh dưỡng và CO2 đồng thời, còn nước nguồn có TDS 160–200 nên tổng khoáng đã cao sẵn. Với pH 7 và KH 4, CO2 ước chừng khoảng 10–12 ppm theo công thức thường dùng, thấp hơn mức 20–30 ppm mà cây thủy sinh cần, nên test báo thiếu là hợp lý. Cây lá non yếu, rêu xanh bám lá và tép chết lai rai thường đi cùng nhau khi nước cứng, nhiều khoáng và cây không hấp thu đủ. Mình chưa đo được nitrat, phosphat, amoniac hay oxy nên chưa biết chắc thủ phạm nào mạnh nhất.
> 1. Đo nitrat, phosphat, amoniac và nitrit trước khi thêm phân; nitrat thấp hay làm cây còi và tạo điều kiện cho…

**Plain** (3801 characters):

> Mình nghĩ vấn đề không nằm ở một yếu tố mà là chuỗi liên quan: nước cứng và TDS cao, phần đo CO2 chưa chắc đúng, và có thể dinh dưỡng hoặc độc tố đang gây stress cho tép và cá.
> 
> ## 1. Đọc lại thông số
> 
> - **CO2:** Với KH 4 dKH (~71 ppm) và pH 7, lý thuyết CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển. Nếu test kit báo thiếu thì khả năng cao là kit đã hết hạn, đọc sai bảng màu, hoặc pH meter chưa hiệu chuẩn. Bạn nên:
>   - Hiệu chuẩn lại pH meter bằng dung dịch chuẩn 4.0 và 7.0.
>   - Dùng drop checker để theo dõi xu hướng (xanh vàng là đủ CO2 hay chưa).
>   - Đo pH sáng sớm trước khi bật đèn và …

### sick-03 · tank · tie or split (5.25 · 5)

**Asked:** Tép trong bể tôi chết lai rai và cá thỉnh thoảng chết một con, có phải do TDS cao không?

**Judge:** Không câu nào dùng số liệu bể của bạn ấy: TDS bể 360 trong khi nước nguồn chỉ 160-200, tức là chất hòa tan đang tích tụ và cần thay nước đều hơn. Y gần với hướng này hơn vì bảo so TDS bể với nước nguồn, có nhắc nitrat và nhiệt độ cao kiểu khí hậu Việt Nam. X gọn gàng, các bước có thứ tự, nhưng lại đồng nhất TDS với độ cứng và nhận định nguyên nhân còn chung chung. / Neither answer used the tank data. Their TDS of 360 is well above the 160–200 of their source water, which points to waste and fertiliser building up and means more regular water changes; the 2–3 bubbles/s of CO₂ also matters. Y still gives short, ordered steps, covers oxygen and dead shrimp, says what to recheck, and links useful guide sections. X is a long generic list aimed at the wrong kind of shrimp and ends by asking for details the app already has.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, too-long, plan.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình chưa thấy trang nào trong cẩm nang nói TDS cao là nguyên nhân giết tép hay cá, nên mình không dám khẳng định đó là thủ phạm. TDS chỉ cho biết tổng chất rắn hòa tan, tức nước cứng hay mềm. Tép nhạy với thay đổi đột ngột hơn cá, nên TDS lệch nhiều có thể góp phần. Nhưng tép chết lai rai kèm cá thỉnh thoảng chết thường là do chất lượng nước: amoniac hoặc nitrit tích lại, oxy thấp, pH tụt, clo từ nước máy, hoặc tép bị kẹt vỏ khi lột xác. Mình đoán nguyên nhân về nước là khả năng cao hơn, nhưng cần đo mới biết chắc.
> 1. Đo ngay amoniac, nitrit, pH, độ cứng (GH/KH) và TDS để xem chỉ số nào đang…

**Plain** (2006 characters):

> TDS cao **có thể** là một nguyên nhân, nhưng thường không phải nguyên nhân duy nhất, và bản thân con số TDS không độc. Điều quan trọng là **thành phần** tạo nên TDS.
> 
> **Vì sao TDS liên quan đến tép:**
> - Tép (nhất là Caridina như tép Crystal, Bee, Taiwan bee) rất nhạy với độ cứng (GH) và độ kiềm (KH). Nếu nước quá cứng hoặc khác xa điều kiện chúng quen, tép sẽ stress, khó lột xác và chết dần.
> - TDS cao do muối khoáng, nitrat, phốt phát hoặc đồng (nếu có) cũng gây hại.
> - Tép con và tép vừa lột xác là nhạy cảm nhất.
> 
> **Nhưng cần kiểm tra các nguyên nhân phổ biến khác:**
> - **Amoniac (NH3/NH4+) và…

### sick-04 · post · ours wins (6 · 4)

**Asked:** Mình chơi bể 60x40x40, set được gần 3 tháng, layout núi đá dùng đá da voi màu trắng nên pH ở ngưỡng 7,8-8. Thảm nền trồng trân châu ngọc trai, mấy ngọn rau thơm cắm khe đá, có vảy ốc xanh và vảy ốc đỏ. Để hạ pH, mình bổ sung thêm vật liệu lọc Neo Soft, vừa cho vào chạy thì chỉ khoảng 10 giây sau tép chạy loạn hết rồi chết dần. Sau đó thảm trân châu và rau thơm bị rữa lá, pH luôn ở 8,4, sục CO2 cũng chỉ xuống 7,4 trong khi nước đầu vào 7,0 trở xuống. Vảy ốc thì có vết như gãy ngang ngọn lá nhưng lá vẫn xanh, không rụng. Mình nên xử lý sao?

**Judge:** Y viết có cấu trúc rõ ràng nhưng nhầm vảy ốc (cây Rotala) thành ốc Neritina, và khuyên thay 40-50% nước RO cùng tắt đèn nhiều ngày, đều có thể gây hại. X ngắn hơn nhưng hiểu đúng vảy ốc là cây, đổi nước từ từ và an toàn hơn, chỉ có một chi tiết bịa về tảo. / X tưởng vảy ốc là ốc Neritina, trong khi đó là cây Rotala, lại còn khuyên thay 40-50% nước RO cùng lúc, dễ gây sốc pH. Y gọn hơn và hiểu đúng vảy ốc là cây. Y khuyên lấy Neo Soft ra, đo amoniac/nitrit/KH trước, rồi thay 20-30% nước thật chậm, an toàn hơn cho bể.

**Ours lacks:** figures, diagnosis. **Plain lacks:** wrong, too-long, tank-fit.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là cú sốc hóa học khi bạn cho Neo Soft chạy thẳng vào bể đang có tép: tép chết trong vài giây đến vài phút thường là do thay đổi đột ngột của nước, và tảo vi sinh cùng cây rữa lá phía sau có thể là hệ quả. Đá da voi trắng có thành phần vôi nên giữ độ cứng (KH) cao, khiến CO₂ khó kéo pH xuống, đó là lý do pH vẫn kẹt ở 8,4. Handbook chưa có trang nào về Neo Soft hay vật liệu hạ pH, nên mình không khẳng định được thành phần của nó; mình đoán chắc hơn là bạn cần kiểm tra nước trước khi làm thêm gì.
> 1. Ngưng cho Neo Soft vào thêm và lấy ra khỏi ngăn lọc, không cần thay …

**Plain** (2824 characters):

> Tép chết trong vài phút sau khi cho Neo Soft vào, cùng với thảm và rau bị rữa, cho thấy tank đang bị ảnh hưởng nặng. Bạn nên xử lý theo thứ tự sau.
> 
> ## 1. Làm ngay hôm nay
> 
> - **Gỡ Neo Soft ra khỏi bể** và ngừng mọi vật liệu lọc mới cho đến khi xác định được nguyên nhân.
> - **Thay 40-50% nước** bằng nước RO hoặc nước đã khử clo, cùng nhiệt độ. Việc này giúp pha loãng mọi chất có thể đã thoát ra từ vật liệu.
> - **Vớt hết xác tép** và lá rữa. Xác phân hủy làm tăng amoniac, dễ gây sốc thêm cho các sinh vật còn lại.
> - **Tắt đèn** vài ngày để giảm tảo và bớt áp lực cho cây đang yếu.
> 
> ## 2. Kiểm tra n…

### sick-04 · tank · ours wins (6 · 5)

**Asked:** Tôi vừa thêm vật liệu lọc hạ pH thì tép chạy loạn rồi chết dần, phải làm gì?

**Judge:** X đúng ở chỗ Neo Soft kéo cả KH/GH xuống, kế hoạch gọn và có dặn theo dõi 2–3 ngày. Y dài hơn, đưa khoảng pH quá hẹp dễ khiến người nuôi tiếp tục hạ pH. Cả hai đều không nhắc đến đá da voi là thứ đẩy pH lên 8,4, và cũng không khuyên giảm CO₂ cho bớt sốc. / Neither answer names the real cause. The white elephant-skin rock (đá da voi) keeps the tank at pH 8.4, Neo Soft stripped KH/GH and pH fast against it, and the shrimp crashed from the swing. Neither says to deal with the rock or drop the goal of lowering pH, and with CO₂ running, X's tip to aerate hard matters. Still, Y explains the KH/GH drop and the moulting risk, gives clear steps, and says what to watch over the next 2–3 days. X is more generic, adds a block of target ranges, and ends by asking questions.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, too-long, diagnosis, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Nhiều khả năng tép bị sốc vì pH tụt quá nhanh sau khi thêm vật liệu hạ pH, và vật liệu này cũng làm KH, GH giảm, nên tép khó lột xác. Cẩm nang chưa có bài riêng về trường hợp này. Phần nước của trang tép red cherry chỉ ghi tép cần pH 6,5–8,5, GH từ 6 dGH trở lên và KH từ 2 dKH trở lên để tạo vỏ mới, và thay đổi đột ngột làm tép bị ảnh hưởng xấu. Các bước dưới đây là kinh nghiệm chung, bạn kiểm tra thêm để chắc.
> 1. Lấy vật liệu hạ pH ra khỏi lọc ngay và không thêm lại.
> 2. Đo pH, KH, GH, nhiệt độ, amoniac và nitrit để biết bể đang lệch ở đâu.
> 3. Thay một phần nước (khoảng 20–30%) bằng nước có t…

**Plain** (1635 characters):

> Tép bơi loạn và chết dần thường là dấu hiệu **sốc pH hoặc nhiễm độc**. Tép rất nhạy với thay đổi đột ngột, nên bạn cần xử lý ngay.
> 
> ## Làm ngay bây giờ
> 
> 1. **Lấy vật liệu hạ pH ra khỏi bể** (than bùn, nhựa trao đổi ion, hóa chất...). Đừng để nó tiếp tục nhả chất vào nước.
> 2. **Sục khí mạnh** hoặc tăng dòng chảy để bù oxy, vì tép dễ thiếu oxy khi nước bị xáo trộn hóa học.
> 3. **Ngừng cho ăn** và hạn chế làm phiền bể.
> 4. **Thay khoảng 20-30% nước** bằng nước đã khử clo, có pH và độ cứng gần với bể hiện tại. Không thay quá nhiều một lúc, vì làm vậy có thể gây sốc thêm.
> 5. **Vớt tép chết** để trán…

### sick-05 · post · plain wins (6 · 7.25)

**Asked:** Bể của tôi set được 2 tháng, có đèn, oxy, CO2, nhưng gần đây nước trong bể có màu vàng nâu, cá thì chết lai rai. Tôi thay nước cách ngày 50% (dùng nước lọc loại mua uống hằng ngày) mà vẫn không hết. Giúp tôi với.

**Judge:** Y is better for this hobbyist. Both answers name the two main causes: ammonia or nitrite building up, and bottled water with almost no minerals, which lets pH crash. Only Y tells them to check for too much CO₂ with a drop checker, which matters because the tank runs CO₂. Y also gives numbers and clearer steps in order. X assumes driftwood that wasn't mentioned and shows a guide excerpt that's off-topic. Y's downside is that it runs long and asks a lot of questions at the end. / Cả hai đều đoán đúng nguyên nhân: amoniac/nitrit tích tụ, cộng với nước lọc đóng chai quá mềm làm pH tụt khi đang bơm CO2. Y nói gọn hơn và gắn CO2 với pH rõ hơn. Nhưng X cho người chơi nhiều thứ để làm hơn: có con số cụ thể (thay 20–30%, chiếu đèn 6–8 giờ, ngừng ăn 2–3 ngày, NO3 >50), có cách kiểm tra drop checker và oxy. Y thiếu con số, và một đoạn trích dẫn kèm theo không liên quan đến vấn đề.

**Ours lacks:** figures, tank-fit, diagnosis, too-thin. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân nhiều khả năng là chất lượng nước đang xấu đi, không chỉ do màu. Màu vàng nâu có thể do tannin từ lũa, và lũa thì không hại cá. Nhưng cá chết lai rai sau 2 tháng cho thấy có thể amoniac hoặc nitrit đang tích tụ (bể chưa chạy ổn định hoặc cho ăn dư), hoặc pH tụt. Nước lọc đóng chai thường rất mềm, ít khoáng, nên thay 50% liên tục có thể làm độ cứng và pH xuống thấp, nhất là khi bể đang bón CO2. Mình chưa đo được nên chưa chắc chắn, bạn cần đo mới biết.
> 1. Ngừng cho ăn vài ngày, vớt hết thức ăn thừa và xác cá chết ra khỏi bể.
> 2. Đo ngay amoniac, nitrit, nitrat và pH bằng b…

**Plain** (3054 characters):

> Nước vàng nâu kéo dài kèm cá chết dần thường có nguyên nhân chính không phải là "nước bẩn" đơn thuần. Bạn nên kiểm tra theo thứ tự sau.
> 
> ## 1. Xác định màu nước do đâu
> 
> - **Tannin (chất màu từ gỗ, lá):** Nếu bạn có lũa, lá bàng, lá khô, hoặc than bùn, nước sẽ vàng nâu như trà. Loại này thường không gây hại trực tiếp, nhưng không thể gây cá chết hàng loạt.
> - **Chất hữu cơ phân hủy:** Thức ăn thừa, cá chết, lá úa, phân cá tích tụ, nền đất/sỏi bị thối. Đây là nguyên nhân hay gặp nhất khi bể mới 2 tháng.
> - **Tảo silic (diatom):** Lớp màu nâu bám trên kính, lá, sỏi, thường gặp ở bể mới có đèn mạnh…

### sick-05 · tank · ours wins (7 · 4)

**Asked:** Nước bể tôi ngả vàng nâu và cá chết lai rai dù thay nước thường xuyên, vì sao?

**Judge:** X dùng đúng chi tiết của bể: nước đóng bình ít khoáng làm KH thấp, cộng thêm CO₂ nên pH tụt và dao động, và X cho bước sửa hợp với Việt Nam là pha thêm nước máy đã khử clo. Y chỉ liệt kê nguyên nhân chung chung, bỏ qua CO₂ và nước đóng bình, dài và hỏi lại nhiều. / Y nối đúng hai chi tiết của bể: nước đóng bình gần như không có khoáng, KH thấp, cộng với sục CO₂ nên pH dễ tụt và dao động, cá yếu dần. Hướng sửa cũng hợp lý: đo pH sáng và tối, thêm khoáng hoặc pha nước máy đã khử clo. Y vẫn thiếu con số KH cần đạt và không nói giảm hay tắt CO₂ ban đêm. X chỉ liệt kê chung chung, bỏ qua dữ liệu bể và hỏi lại rất nhiều.

**Ours lacks:** figures, plan. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 1 pages, stopped at the calls limit):

> Nước ngả vàng nâu kèm cá chết dần thường do nước bể không ổn định hơn là do thiếu thay nước. Cẩm nang ghi rằng lũa nhả tannin làm nước nâu và pH cũng giảm. Bể của bạn có sục CO2 và thay 50% cách ngày bằng nước uống đóng bình. Nước đóng bình thường rất ít khoáng, nên độ cứng KH thấp, pH dễ tụt rồi dao động mạnh giữa ngày và đêm, và cá dễ yếu dần dù bạn thay nước đều. Mình chưa đọc hết bài về cá chết hàng loạt trong cẩm nang nên chưa chắc đây là nguyên nhân duy nhất. Bạn hãy kiểm tra các điểm sau.
> 1. Đo ngay amoniac, nitrit, nitrat và pH; nếu amoniac hoặc nitrit có số đo thì đó là ưu tiên số mộ…

**Plain** (3373 characters):

> Nước ngả vàng nâu và cá chết dần dù bạn thay nước thường xuyên thường có nghĩa là **chất bẩn hữu cơ hoặc độc tố đang tích tụ nhanh hơn mức bạn thay**, hoặc nguyên nhân nằm ở hệ thống lọc, nguồn nước, hoặc quá tải sinh học.
> 
> ## Các nguyên nhân thường gặp
> 
> **1. Quá tải chất thải hữu cơ (thường gặp nhất)**
> - Cho ăn quá nhiều, thức ăn thừa phân hủy ở đáy.
> - Cá quá đông so với thể tích bể.
> - Đáy bể có nhiều chất thải, mảnh lá mục, xác cá/ốc/cây chết chưa được hút ra.
> - Phân hủy tạo ra **amoniac (NH₃)** và **nitrit (NO₂⁻)**, rất độc với cá. Cá chết dần vì bị nhiễm độc mãn tính.
> 
> **2. Hệ vi sinh chư…

### sick-06 · post · plain wins (6 · 7)

**Asked:** Bể cá rồng nhà em dùng hơn 20 năm bị rò nên phải thay bể mới. Từ hôm chuyển sang bể mới, 2 con cá rồng bỏ ăn luôn, được gần 1 tuần rồi. Cá mồi vẫn bơi trong bể mà rồng không chịu ăn. Em theo dõi thì 2 con vẫn bơi bình thường, chưa nằm đáy. Phải làm sao?

**Judge:** Y is more likely to fix the problem. It names an uncycled new tank as a likely cause, which fits this case. It gives a 20–30% water change daily or every other day, suggests moving filter media from the old tank, and sets clear points for when to worry. X is correct but thin: it doesn't say how much water to change, and its temperature range is too low for Vietnam. / X chỉ ra đúng nguyên nhân dễ gặp nhất: bể mới chưa có vi sinh sau khi bỏ bể đã chạy 20 năm. X còn đưa cách xử lý cụ thể: chuyển vật liệu lọc từ bể cũ sang, thay 20–30% nước mỗi ngày, ngưỡng NH₃/NO₂ 0,25 ppm. Y gọn và minh bạch về nguồn nhưng thiếu bước chuyển vật liệu lọc cũ và không nói thay bao nhiêu nước. Tuy vậy X hơi dài.

**Ours lacks:** figures, too-thin, diagnosis, plan. **Plain lacks:** too-long, tank-fit.

**Ours** (read 2 pages, stopped at the calls limit):

> Mình đoán nguyên nhân chính là cá đang sốc vì vừa chuyển bể, cộng với nước bể mới có thể chưa giống bể cũ. Cá rồng hay bỏ ăn vài ngày đến vài tuần sau khi chuyển, nên gần một tuần chưa phải quá lâu, nhưng bạn nên kiểm tra nước trước.
> 1. Đo nhiệt độ và pH của bể mới, so với bể cũ. Cá rồng châu Á sống tốt ở 22–28°C và pH 5–8, và bài chuyển cá nói nhiệt độ hai bể phải bằng nhau.
> 2. Nếu bể mới mới chạy lọc, đo amoniac và nitrit. Nếu có chỉ số bất thường, thay một phần nước ngay.
> 3. Đừng ép ăn. Thử cho mồi chết, tôm nguyên con hoặc thịt cá thái miếng, hoặc giun đất, vào buổi tối khi bể yên.
> 4. Bớt…

**Plain** (3108 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là chuyện khá thường gặp. Nếu cá vẫn bơi bình thường, không nằm đáy, không đổi màu thì chưa phải cấp cứu, nhưng bỏ ăn gần 1 tuần thì bạn cần xử lý ngay. Bạn nên làm theo các bước sau.
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻):** Bể mới chưa chạy nitơ (chưa "cycle") thì hai chỉ số này dễ tăng cao và gây stress, mất cảm giác thèm ăn. Mục tiêu là 0 ppm cho cả hai.
> - **Nitrat:** Giữ dưới 40 ppm, lý tưởng dưới 20 ppm.
> - **pH và độ cứng:** Khác biệt lớn so với bể cũ cũng gây sốc. Nếu nước bể cũ và bể mới khác nhau nhiề…

### sick-06 · tank · plain wins (5.75 · 6.25)

**Asked:** Cá rồng của tôi bỏ ăn gần một tuần từ khi chuyển sang bể mới, làm sao?

**Judge:** Y nói rõ bể mới chạy 1 tuần chưa xong chu trình nitơ, đưa mốc nhịn ăn 1–2 tuần sát thực tế hơn với cá rồng và nhắc kiểm tra hai con rồng có cắn nhau không. Tuy vậy Y dài và hỏi lại điều đã biết. X gọn và làm theo được ngay, nhưng mốc thời gian và nhiệt độ chưa chuẩn. Cả hai đều không nhắc chuyển vật liệu lọc từ bể cũ sang, cũng không nhắc lượng chất thải và mầm bệnh từ cá mồi. / I'd rather they got X. Its facts are more accurate: 26–30°C, a 1–2 week fast being normal for arowana, and the warning that a new tank may not have finished cycling. Y is shorter and uses the note that the fish still swim normally, but it gives a temperature range too low for arowana and says they usually eat again after 2–3 days, which is too short. Neither one asks whether the filter media came over from the 20-year-old tank, which is the likely cause, or mentions that there are two arowanas and feeder fish in the tank.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** too-long, tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Cá rồng bỏ ăn gần một tuần sau khi chuyển bể thường do stress vì vận chuyển và đổi chỗ, nhưng bể mới cũng có thể chưa ổn định nên bạn cần kiểm tra nước trước. Cá vẫn bơi bình thường là dấu hiệu tốt, nhưng cá thường ăn lại sau 2–3 ngày, nên một tuần đã là lâu và đáng để ý.
> 1. Test ngay amoniac, nitrit, nitrat và pH bằng bộ test nhỏ giọt; nếu amoniac hoặc nitrit trên 0 thì thay 30–50% nước, dùng nước có nhiệt độ và pH gần với bể.
> 2. Đo nhiệt độ bằng nhiệt kế thứ hai và giữ nước ổn định trong khoảng 22–28°C; kiểm tra sưởi nếu bể mới có sưởi.
> 3. Kiểm tra lọc đang chạy đều, nắp bể đậy kín, và khôn…

**Plain** (2612 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là phản ứng khá phổ biến vì chúng rất nhạy với stress. Tuy vậy, một tuần là đủ lâu để bạn cần kiểm tra kỹ. Bạn có thể làm theo các bước sau:
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - Dùng bộ test để đo **amonia (NH₃/NH₄⁺), nitrit (NO₂⁻), nitrat (NO₃⁻), pH, nhiệt độ**.
> - Amonia hoặc nitrit lớn hơn 0 là dấu hiệu nguy hiểm. Bể mới chưa chạy xong chu trình nitơ (cycling) rất dễ xảy ra tình trạng này.
> - Nếu có amonia/nitrit: thay 25–30% nước mỗi ngày, dùng nước đã khử clo và có nhiệt độ, pH gần với bể cũ. Không thay quá nhiều một lúc vì sẽ gây sốc thêm.
> -…

### sick-07 · post · plain wins (5.5 · 7.5)

**Asked:** Em vừa lật bể, vứt nền sỏi nhỏ đi vì thấy bẩn quá, thì tự nhiên thấy 1 con bị như nấm trắng. Em đang tách riêng, cho ít muối hột vào xem có khỏi không. Như vậy đã đúng chưa, cần làm gì thêm?

**Judge:** Y is the more useful answer. It helps the hobbyist tell ich from cotton-like fungus, which matters because "nấm trắng" could be either. It gives a sensible salt dose (1–2 g/l), a temperature range, a water-change schedule, methylene blue (sold everywhere in Vietnam), and clear warning signs. X is correct but thinner, and its salt dose is a converted US measure. / X đáp trúng việc người hỏi đang làm. X chỉ cách phân biệt đốm trắng, nấm bông và vi khuẩn, cho liều muối 1–2 g/lít rõ ràng, xác nhận dùng muối hột không i-ốt là được, nêu những loài và cây không chịu được muối, và giải thích việc vứt sỏi làm mất vi sinh. Y gọn hơn và có kèm trích hướng dẫn, nhưng liều muối thì quy đổi kiểu Mỹ, lệch số, lại bảo lấy nước từ bể chính đang có thể bị nhiễm amoniac.

**Ours lacks:** figures, local, follow-up, diagnosis. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình thấy việc tách cá ra là đúng hướng. Nấm trắng dạng bông thường là bệnh thứ phát: cá đã có vết xước hoặc yếu từ trước rồi nấm mới bám vào. Việc lật bể và bỏ nền làm nước đục, khuấy chất bẩn và có thể làm cá va quệt, nên nguy cơ càng cao. Muối hột chỉ là bước hỗ trợ, không thay được việc tìm và sửa nguyên nhân. Mình chưa biết loài cá và nhiệt độ hiện tại, nên phần nguyên nhân này là suy đoán.
> 1. Chuyển cá sang thùng hoặc bể cách ly có nước sạch lấy từ bể chính, có sục khí và sưởi ổn định.
> 2. Cho muối hồ cá theo mức 1 (khoảng 1 muỗng canh cho 11,4 lít nước), đổ thẳng hoặc hòa trước, và khôn…

**Plain** (2176 characters):

> Tách riêng con cá là đúng, vì vậy bạn nên làm ngay. Nhưng để chắc hơn, bạn cần xác định bệnh và kiểm tra lại bể chính.
> 
> **1. Xác định bệnh**
> - **Đốm trắng nhỏ như hạt muối, rải khắp người, vây** (thường là bệnh đốm trắng/ich): đây là bệnh phổ biến nhất sau khi cá bị stress.
> - **Mảng trắng như bông, bám thành cụm, thường ở đầu, vây hoặc chỗ bị thương** (thường là nấm): thường do cá bị xây xát hoặc yếu.
> - Nếu mảng trắng dính và loét, có thể là vi khuẩn, cần xử lý khác.
> 
> **2. Về muối**
> - Dùng muối hạt không i-ốt (muối ăn sạch cũng được, tốt nhất là muối hồ cá). Hòa tan trước rồi mới cho vào.
> - L…

### sick-07 · tank · plain wins (6 · 7)

**Asked:** Sau khi lật bể, một con cá của tôi bị nấm trắng, tách riêng và cho muối đã đủ chưa?

**Judge:** Y says clearly that salt alone isn't enough, names a medicine sold in Vietnam (xanh methylene), and covers testing the water after the tank flip, temperature, and how long to treat. X fits their situation better and usefully warns about columnaris, but its only treatment is salt with an imperial-based dose (1 muỗng canh per 11,4 lít), and it gives no temperature or medicine. / X answers clearly that salt alone isn't enough. It names a medicine sold in Vietnam (xanh methylene), says to test for ammonia and nitrite after the rescape, and gives the salt dose in grams per litre. Y has a useful point about telling true fungus apart from columnaris, but it never names a medicine and its dosing comes from a foreign guide.

**Ours lacks:** figures, plan, local. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages):

> Cách bạn tách cá và cho muối là đúng hướng nhưng chưa đủ. Nấm thủy mi thường chỉ bám vào chỗ da hoặc mang đã xây xát trước đó, nên sau khi lật bể cá có thể đã bị va quệt, sốc hoặc nước bị xáo động làm yếu đi. Nấm là hệ quả, còn nguyên nhân thì cần tìm và xử lý luôn, nếu không bệnh sẽ quay lại. Mình chưa biết loại cá nên chưa chắc chắn được; cẩm nang nói phải xem kỹ vết bệnh trước.
> 1. Xem kỹ vết bệnh: búi trắng xốp như bông gòn là nấm; mảng xám loang, mất bóng thì nên nghi columnaris, khi đó cần thuốc kháng khuẩn chứ không phải thuốc trị nấm.
> 2. Giữ cá trong bể cách ly nước sạch, cho muối mức …

**Plain** (1892 characters):

> Muối **chưa đủ** nếu bạn chỉ dùng muối. Cá bị nấm sau khi lật bể thường là hệ quả của nước xấu (amoniac, nitrit tăng cao), nên cần xử lý cả nguyên nhân lẫn con cá.
> 
> **Việc nên làm ngay:**
> 
> 1. **Cách ly cá đúng cách:** Dùng bể riêng có sục khí, lọc nhẹ hoặc không lọc (tránh hút cá vào máy), không trồng cây, không đặt nền sỏi.
> 2. **Kiểm tra nước bể cũ và bể cách ly:** Dùng bộ test để đo NH3/NH4+, NO2-, NO3-, pH. Nếu amoniac hoặc nitrit > 0, thay nước ngay (khoảng 30-50%) và thay từng phần hằng ngày cho đến khi ổn định. Nước bể cách ly phải sạch, cùng nhiệt độ và pH với bể cũ.
> 3. **Thuốc trị nấm…

### sick-08 · post · plain wins (4.75 · 6.75)

**Asked:** Hồ mình đang có rêu tảo hại nên mình thử nuôi otto. Thả vào thì cá rất khỏe, bơi kiếm ăn (không quá manh động), nhưng sau một đêm 3 con chết hết, sáng ra thấy nằm im, đụng vào không nhúc nhích. Cùng lúc đó có một đàn neon trong bể vẫn bình thường mà otto thì chết. Vì sao vậy?

**Judge:** Y nêu được những nguyên nhân thật sự làm otto chết qua đêm mà neon vẫn sống: hóa chất diệt rêu, thiếu oxy ban đêm, bể chưa ổn định, sốc khi thả. Y cũng đưa bước xử lý rõ ràng và cách diệt rêu an toàn cho otto. X thì đoán nguyên nhân yếu, khuyên theo dõi đàn otto dù cả 3 con đã chết, và bỏ sót khả năng do hóa chất diệt rêu. / X asks whether algae killers or H₂O₂ were used, which fits the hobbyist saying their tank has algae, and it covers acclimation shock and fish already weak from transport. But it is long, and its top cause (low oxygen) is shaky. Y is shorter, reads more naturally in Vietnamese and has good acclimation steps, but blames hunger for an overnight death and never mentions chemicals.

**Ours lacks:** diagnosis, tank-fit, wrong. **Plain lacks:** too-long, diagnosis.

**Ours** (read 2 pages):

> Nhiều khả năng otto chết vì sốc và không ăn được, chứ không phải do bể bị độc với riêng loài này. Neon vẫn khỏe nên nước bể không đến mức xấu. Otto nhạy hơn: cá bắt tự nhiên hoặc vừa vận chuyển về thường mệt, không chịu ăn, và chỉ sau một đêm đã yếu hẳn. Hay gặp hơn là lệch pH hoặc nhiệt độ so với nước cũ, hoặc bể chưa thật ổn định. Mình chưa biết cá mua ở đâu nên chưa chắc được nguyên nhân nào, bạn cho mình biết thêm nhé.
> 1. Kiểm tra ngay pH, nhiệt độ, amoniac và nitrit của bể, và so với nước ở chỗ mua cá.
> 2. Nếu bể còn ít rêu, cho cá ăn thêm viên chìm và rau như dưa leo, xà lách hoặc bí ngò…

**Plain** (2455 characters):

> Otto chết còn neon thì sống thường gặp vì **Otto nhạy với chất lượng nước hơn neon nhiều**. Các nguyên nhân hay gặp nhất:
> 
> **1. Thiếu oxy vào ban đêm (khả năng cao nhất)**
> - Cây thủy sinh và rêu hoạt động quang hợp ban ngày nhưng hô hấp ban đêm, nên oxy hòa tan giảm.
> - Rêu và lá chết phân hủy cũng tiêu thụ oxy.
> - Otto là loài ưa nước giàu oxy, thường yếu đi rồi nằm im trước khi chết. Neon chịu thiếu oxy tốt hơn.
> - Hãy kiểm tra xem bể có sục khí hoặc lọc tạo dòng chảy mặt nước không, và thử bật sục khí ban đêm.
> 
> **2. Hóa chất diệt rêu**
> Đây là nguyên nhân rất thường gặp với rêu tảo hại. Nếu tr…

### sick-08 · tank · ours wins (7 · 6)

**Asked:** Tôi thả cá otto ăn rêu mà sau một đêm chết hết trong khi neon vẫn khỏe, vì sao?

**Judge:** X đưa ra nguyên nhân hợp lý nhất (otto yếu sẵn hoặc bị sốc khi thả, còn neon đã quen nước) cùng các bước kiểm tra cụ thể, ngắn gọn. Y liệt kê bảy nguyên nhân chung chung, không xếp theo khả năng, và hỏi lại thông tin đã có sẵn, dù Y có nhắc tới clo và thuốc diệt rêu chứa đồng, hai ý đáng lưu ý. / Y gives the cause that most often explains this (weak, wild-caught or just-shipped otto) and short, ordered steps that fit the case, plus a species card and a guide excerpt. X is a long generic checklist that ends by asking for details. X does mention copper in algae treatments, which matters for a tank with algae, but its cause list doesn't fit this tank closely.

**Ours lacks:** diagnosis, figures. **Plain lacks:** tank-fit, too-long, plan.

**Ours** (read 3 pages):

> Nhiều khả năng đàn otto bạn mua là cá bắt tự nhiên hoặc vừa qua vận chuyển, nên rất yếu, còn neon đã quen nước nên sống được. Cẩm nang ghi otto bắt tự nhiên chịu stress kém, và cá mới thả hay chết khi bể chưa ổn định hoặc thông số nước đổi đột ngột. Mình chưa biết nguồn cá và thông số bể của bạn nên chưa chắc chắn, bạn nên kiểm tra theo các bước sau.
> 1. Hỏi lại tiệm xem cá là bắt tự nhiên hay nuôi sinh sản, và lô đó đã ở đó bao lâu.
> 2. Đo ngay amoniac, nitrit và pH trong bể; nếu amoniac hay nitrit khác 0 thì bể chưa ổn định, cần thay nước trước khi thả thêm cá.
> 3. Lần sau thả cá chậm bằng các…

**Plain** (2215 characters):

> Otto (*Otocinclus*) rất nhạy cảm, nên việc chết hết qua một đêm thường có vài nguyên nhân chính. Neon thường cứng hơn nên có thể vẫn sống.
> 
> **Nguyên nhân thường gặp nhất:**
> 
> 1. **Chất lượng nước kém, đặc biệt là amoniac hoặc nitrit.** Nếu bể chưa chu trình nitơ ổn định, hoặc vừa mới thay nước, vừa cho thêm cá, nồng độ NH₃/NO₂ có thể tăng vọt. Otto bị ảnh hưởng nặng hơn neon.
> 
> 2. **Thiếu oxy, nhất là vào ban đêm.** Cây thủy sinh và vi sinh phân hủy tiêu thụ oxy khi không có ánh sáng. Bể đông cá, ít sục khí, hoặc có nhiều chất hữu cơ thối sẽ dễ thiếu oxy. Otto cần nước giàu oxy.
> 
> 3. **Sốc do th…

### sick-09 · post · plain wins (5 · 7)

**Asked:** Nhà mình có bể cá ngoài trời 3x1,5m, sâu có 30 phân, đáy lát đá hoa, có hệ thống lọc nước và hút đáy, thêm 1 bơm nước tạo oxy. Trước mua koi về được mấy hôm là lăn ra chết, thế là thả cá chép cho khỏe, mà nay 6-7 con lại chết. Trời đang lạnh ngắt, mình không có dụng cụ đo oxy, không biết do trời lạnh hay sao. Bể này bố mình làm, trước có thả hoa súng nhưng cá rỉa hết. Bắt bệnh giúp mình, nên sửa lọc thế nào, có cần đào sâu thêm không, đáy lát đá hoa có ổn không?

**Judge:** Y answers every question the hobbyist asked. It explains how to fix the filter, including the flow rate and washing the bio media in tank water. It suggests digging just one corner down to 80–100 cm, and says correctly that a marble floor makes the water harder and raises the pH. X is safe but admits its guide has nothing on the filter or the marble floor, so it leaves out half of what the hobbyist needs. Y is long, though. / X chỉ ra được nguyên nhân hợp lý hơn: bể chưa chạy vi sinh nên amoniac/nitrit tăng, bể nông nên nhiệt độ thay đổi nhanh, và cá mới mua có thể mang bệnh. X cũng trả lời đủ cả ba câu về lọc, đào sâu và đáy đá hoa, có số liệu cụ thể. Y lại đặt nặng chuyện thiếu oxy trong nước lạnh, trong khi nước lạnh giữ oxy tốt hơn, và Y né hẳn câu hỏi về lọc và đáy đá hoa.

**Ours lacks:** tank-fit, too-thin, figures, diagnosis, plan. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình chưa đo được oxy nên chỉ đoán được nguyên nhân nhiều khả năng nhất: thiếu oxy trong nước lạnh, kết hợp với cá stress sau khi chuyển về, và có thể có bệnh. Cẩm nang ghi thiếu oxy làm nhiều con chết cùng lúc, còn amoniac hay clo cũng giết cá. Bể sâu 30 cm lại đông cá, trời lạnh nước ít xáo động nên dễ thiếu oxy. Cá chết dần sau khi về cũng hay do bệnh mang theo.
> 1. Sáng sớm xem cá có ngoi lên đớp khí không. Nếu có, bật máy sục khí chạy liên tục và đặt đá sủi sâu sát đáy.
> 2. Tạo xáo động mặt nước bằng vòi phun hoặc bơm, và kiểm tra bơm oxy và lọc có chạy đều không.
> 3. Thử amoniac, nitrit và…

**Plain** (4648 characters):

> Bể này có một số vấn đề chồng lên nhau. Mình nghĩ nguyên nhân chính là **nước bẩn (amoniac/nitrit) + bể quá nông + mật độ cá quá dày**, còn lạnh chỉ làm mọi thứ tệ hơn.
> 
> ## 1. Nguyên nhân có khả năng cao
> 
> **a) Bể quá nông (30 cm) so với cá koi/chép**
> - Koi cần sâu tối thiểu khoảng 80–100 cm, nhất là ở miền Bắc có mùa đông lạnh. Bể 30 cm nhiệt độ nước thay đổi rất nhanh theo ngày đêm và theo thời tiết, và mùa lạnh nước cũng dễ thiếu oxy.
> - Thể tích khoảng 1.350 lít. Với 6–7 con cá vừa mua/thả thì mật độ có thể đã vượt mức chịu của bể, nhất là khi lọc chưa đủ mạnh.
> 
> **b) Lọc sinh học chưa đủ ho…

### sick-09 · tank · tie or split (4.5 · 4.5)

**Asked:** Cá trong bể tôi thả vào mấy hôm là chết, trời lạnh lại chết thêm, do đâu?

**Judge:** Cả hai câu trả lời đều chung chung kiểu bể cá cảnh trong nhà và bỏ qua chuyện đây là hồ koi ngoài trời. X khuyên dùng sưởi theo mức 1 W cho mỗi lít, không hợp với hồ koi. Y rộng hơn: có đo pH, nhắc nguy cơ cá mới mang bệnh từ cửa hàng, thả quá dày và thiếu oxy, và nói vi khuẩn lọc chậm lại khi nước dưới khoảng 20°C. Những ý này sát với nguyên nhân cá chết thật hơn, dù Y dài và có mốc nhiệt độ cá nhiệt đới không liên quan. / Cả hai câu trả lời đều coi đây là bể kính trong nhà có sưởi, bỏ qua chuyện đây là bể koi ngoài trời nông 30 cm, và cũng không nhắc tới vôi xi măng của bể mới xây. Y gọn hơn, có các bước theo thứ tự và dặn dấu hiệu cần theo dõi; lời khuyên đậy nắp, tăng xáo động mặt nước dùng được cho bể ngoài trời. Còn X dài, chung chung, và khuyên sưởi lên mức cá nhiệt đới, không hợp với koi.

**Ours lacks:** tank-fit, diagnosis, wrong, figures. **Plain lacks:** tank-fit, too-long, wrong.

**Ours** (read 2 pages, stopped at the calls limit):

> Mình đoán nguyên nhân nhiều khả năng nhất là bể chưa ổn định chu trình nitơ: cá mới thả thì amoniac hoặc nitrit tăng lên, vài ngày sau cá chết, và trời lạnh làm cá yếu hơn nên chết thêm. Nếu bể mới set thì đây là khả năng cao nhất. Nếu bể đã chạy lâu thì nghi nhiệt độ tụt hoặc sưởi chưa đủ công suất, hoặc nước bị đổi đột ngột khi thay hay thả cá. Mình chưa biết bể đã chạy bao lâu, nên bạn cho mình biết thêm nhé.
> 1. Test amoniac và nitrit ngay bằng bộ test nước; nếu có số đo thì ghi lại.
> 2. Nếu amoniac hoặc nitrit có số đo, thay khoảng một phần ba nước bằng nước đã khử clo, cùng nhiệt độ với b…

**Plain** (2551 characters):

> Cá chết sau vài ngày thả vào và chết thêm khi trời lạnh thường có liên quan đến **chất lượng nước** và **nhiệt độ**. Các nguyên nhân thường gặp:
> 
> ## 1. Nước chưa "chín" (chưa cycling)
> Đây là nguyên nhân phổ biến nhất với bể mới.
> - Cá thải ra **amoniac (NH₃/NH₄⁺)**, và amoniac rất độc. Vi khuẩn có lợi trong bể chuyển nó thành nitrit, rồi thành nitrat, nhưng bể mới chưa đủ vi khuẩn nên amoniac và nitrit tích tụ.
> - Cá chết sau 2–7 ngày, thường có dấu hiệu thở gấp, nổi đầu lên mặt nước, mang đỏ hoặc tái, lờ đờ, bơi lảo đảo.
> - **Cách kiểm tra:** dùng bộ test nước (API hoặc tương đương) đo amoniac,…

### stocking-01 · post · ours wins (7 · 4)

**Asked:** Em mới tập chơi lại bể cá. Ban đầu hỏi loại nào dễ nuôi, khỏe thì được tư vấn mua 2 cá vàng, 2 con bống (bảo nó ăn phân thừa) và 2 con dọn bể. Được vài hôm 1 con cá vàng chết, nghi đánh nhau. Em mua thêm 10 con 7 màu bé thả vào, vài hôm còn 9, 8 rồi 7 mà không thấy xác. Lạ nhất là 1 con 7 màu bụng to như chửa cũng biến mất. Hôm qua 1 con bống chết, nay con dọn bể chết và mất thêm 2 con 7 màu. Con bống với con dọn bể còn nửa xác, thấy con bống còn lại thỉnh thoảng rỉa. Có phải chúng đánh nhau và con to ăn con bé không? Vậy chỉ được thả cá sàn sàn nhau thôi à?

**Judge:** Cả hai câu trả lời đều nghĩ trước tiên tới chất lượng nước và chuyện cá lớn ăn cá bé. X chỉ đúng thủ phạm là cá vàng và bống, các bước làm gọn và dễ theo. Y đổ lỗi cho bảy màu là loài hung dữ, rồi khuyên nuôi bảy màu chung với cá lớn trong bể 200 lít. Lời khuyên này sai và có hại cho cá. / Y nói đúng thủ phạm: cá vàng và bống ăn cá 7 màu nhỏ, cộng thêm nước xấu. Y cho các bước rõ ràng, có tách cá vàng ra, và dặn theo dõi trong 24–48 giờ. X lại đổ lỗi cho cá 7 màu là "hung dữ" và khuyên nuôi cá 7 màu chung với cá lớn trong bể 200 lít, cả hai đều sai và làm người mới chơi hiểu nhầm.

**Ours lacks:** figures, tank-fit. **Plain lacks:** wrong, too-long, diagnosis.

**Ours** (read 0 pages, stopped at the time limit):

> Mình nghĩ nguyên nhân nhiều khả năng là bể đang quá tải, nước bẩn và có nồng độ amoniac hoặc nitrit cao, cộng với việc cá lớn ăn cá bé và cá yếu. Cá vàng và bống có thể ăn luôn xác cá chết và cá con, nên bạn mới thấy cá biến mất không để lại xác và chỉ còn nửa con. Chuyện đánh nhau thì có thể có, nhưng không phải lý do chính. Cẩm nang của mình chưa có trang nào nói đúng trường hợp này nên phần dưới là kinh nghiệm chung của người nuôi cá.
> 1. Thử nước ngay bằng bộ test amoniac và nitrit, nếu có số đo thì thay khoảng một phần ba nước bằng nước đã khử clo, cùng nhiệt độ.
> 2. Vớt hết xác cá, lá úa …

**Plain** (2150 characters):

> Có thể đúng là đánh nhau và ăn thịt lẫn nhau, nhưng nhiều khả năng **chất lượng nước** là nguyên nhân gốc, còn chuyện ăn thịt làm tình hình nặng thêm.
> 
> **Vì sao nghi ngờ nước trước:**
> - Cá vàng là con đầu tiên chết, mà cá vàng rất nhạy với nước xấu.
> - Cá chết hàng loạt, sức khỏe giảm thì dễ bị cá khác ăn xác hoặc tấn công.
> - Bể mới thả nhiều cá khi chưa ổn định sinh học rất dễ tích amoniac và nitrit, gây chết dần.
> 
> **Vì sao mất xác:**
> - Cá 7 màu là loài ăn tạp, hung dữ, và sẽ ăn luôn cá yếu hoặc cá chết.
> - Bống và dọn bể ăn xác, nên xác cá biến mất hoặc chỉ còn nửa.
> - Con bụng to như chửa có …

### stocking-01 · tank · ours wins (7 · 5)

**Asked:** Bảy màu trong bể tôi cứ biến mất không thấy xác, có phải bị cá khác ăn không?

**Judge:** X dùng đúng thông tin bể của bạn (cá vàng, bống, bống rỉa xác) và đưa ra kế hoạch theo dõi trong một tuần, có cách phân biệt cá bị ăn với cá chết vì nước. Tuy vậy X bỏ sót khả năng cá nhảy ra ngoài và không nói thẳng rằng cá vàng ăn cá bột lẫn bảy màu nhỏ. Y kể đủ các nguyên nhân phổ biến, kể cả cá nhảy, nhưng chung chung: nêu những loài không có trong bể và hỏi lại thành phần cá dù app đã có sẵn. / Y points to the goldfish and gobies actually in the tank and to the note that the gobies pick at dead bodies, and it gives ordered steps with a one-week check that tells being eaten apart from dying. X is a generic list built around fish they don't keep, and it skips the possibility of being eaten by the goldfish. Y also leaves out jumping out of the tank, a common way guppies go missing.

**Ours lacks:** diagnosis, figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ có khả năng cao là cá khác ăn bảy màu, nhất là cá bột, vì trong bể bạn có cá vàng và bống, và cá bảy màu lại đẻ liên tục. Handbook không nói rõ bống hay cá vàng có ăn cá bảy màu trưởng thành không, nên mình chỉ chắc được một phần. Ngoài ra, bạn ghi là bống rỉa xác, nên cá chết vì lý do khác cũng có thể biến mất mà không để lại xác.
> 1. Đếm lại số bảy màu mỗi ngày và ghi lại, để biết con nào mất và mất lúc nào.
> 2. Tách cá bột sang hộp lọc riêng hoặc bể nhỏ, hoặc trồng nhiều cây nổi để cá bột có chỗ trốn.
> 3. Quan sát bể buổi tối, xem bống hay cá vàng có đuổi, rượt hoặc ăn cá bảy màu kh…

**Plain** (1926 characters):

> Có thể, nhưng cá bảy màu biến mất không để lại xác thường có nhiều nguyên nhân. Bạn nên kiểm tra theo thứ tự sau:
> 
> **1. Cá lớn ăn cá nhỏ hoặc cá bột**
> - Cá bảy màu trưởng thành, nhất là con đực hoặc cá lớn hơn trong bể, có thể ăn cá bột, và cá bảy màu còn ăn chính con non của mình.
> - Nếu bể có cá rô, cá đầu bạc, cichlid, cá lia thia, hoặc cá lóc con, đó là thủ phạm rất có thể.
> - Cá bột biến mất hàng loạt thường là do cá lớn ăn chúng, chứ không phải do chết.
> 
> **2. Cá bị nhảy ra ngoài**
> - Cá bảy màu khá hay nhảy, đặc biệt khi nước bẩn, thiếu oxy hoặc bị hoảng sợ. Kiểm tra nắp bể, khe hở, và sàn…

### stocking-02 · post · ours wins (7 · 5)

**Asked:** Hồ em 60x40x40, được 1 tuần, đang thả 5 mún + 5 chuột, cá đang tung tăng tốt. Em tính thả thêm 40 neon nữa vậy có nhiều không? Mún có sống chung với neon được không?

**Judge:** X biết mún là cá platy, xác nhận nuôi chung với neon được, và đưa các bước rõ ràng: đo nước, chờ vi sinh, thả neon theo đợt. Y không biết mún là cá gì nên bỏ ngỏ đúng câu hỏi chính. Bù lại, mức 20-30 con neon mà Y đề xuất sát thực tế hơn. / Y correctly recognises mún as platy, so it can answer the compatibility question outright. It also gives a clear order of steps: test the water, wait for the tank to cycle, add the neon in batches, then watch for signs of nitrite trouble. X doesn't know what mún is, falls back on asking the hobbyist, and its temperature range ignores Vietnam's heat.

**Ours lacks:** figures, tank-fit. **Plain lacks:** local, tank-fit, plan.

**Ours** (read 2 pages, stopped at the tools limit):

> Mún (cá platy) và neon đều hiền, và trang cá platy trong cẩm nang ghi neon xanh là loài hợp sống chung, nên bạn không phải lo chuyện đối đầu. Điều cần cân nhắc là số lượng: bể 60x40x40 khoảng 96 lít, 40 con neon là quá nhiều, và bể mới một tuần chưa chắc đã ổn định. Theo hướng dẫn tính số cá, mỗi con mún cần khoảng 4 lít, nên 5 con mún đã chiếm khoảng 20 lít, phần còn lại nên để dành cho đàn neon vừa phải. Với bể có lọc, mình gợi ý thả khoảng 10 đến 12 con neon là hợp lý, không nên 40 con.
> 1. Trước khi thả thêm, đo amoniac và nitrit; cả hai nên về 0, nếu chưa về 0 thì bể chưa đủ ổn định.
> 2. C…

**Plain** (1147 characters):

> Hồ 60x40x40 (khoảng 96 lít) nuôi được neon, nhưng **40 con là hơi nhiều**, nhất là khi hồ mới được 1 tuần.
> 
> **Về số lượng:**
> - Hồ mới 1 tuần thường chưa ổn định vi sinh. Thả 40 con cùng lúc dễ làm tăng amonia và nitrit, gây chết cá.
> - Nên kiểm tra NH3/NH4+ và NO2- trước. Nếu cả hai đều bằng 0 và NO3- dưới khoảng 20-40 mg/l, hồ mới ổn định.
> - Với hồ khoảng 100 lít, thường nuôi 20-30 con neon là vừa, nếu lọc tốt và thay nước đều. Nên thả thành 2-3 đợt, cách nhau 1-2 tuần, và quan sát lại chất nước sau mỗi đợt.
> 
> **Về sống chung với mún:**
> - Neon hiền, bơi thành đàn, thường sống khá tốt với các l…

### stocking-02 · tank · ours wins (6.5 · 3.5)

**Asked:** Bể của tôi thả thêm 40 con neon có nhiều quá không, nuôi chung với mún được không?

**Judge:** X is the better answer. It uses the real tank (about 96 L, platy and cory already in it) and gives a clear step: add only 10–12 neon first. But it contradicts itself about what mún is and never mentions that the tank is only 1 week old. Y is generic and asks for details it should already have. / Y uses the real tank size and stock and clearly says to add only 10–12 neon first and watch the water. X doesn't know that mún is platy, asks for information the app already has, and leans toward saying 40 is fine.

**Ours lacks:** diagnosis, figures, tank-fit. **Plain lacks:** tank-fit, asks-only, diagnosis, local.

**Ours** (read 2 pages, stopped at the time limit):

> Nuôi chung được: nước có khoảng chung, kích thước và tính cách hợp nhau. Nhưng 40 con neon là quá nhiều cho bể 60×40×40 cm (khoảng 96 lít), vì cùng với 5 platy và 5 chuột đồng thì bể đang quá tải, khoảng 195%. Cá neon là loài đàn, nên chỉ cần một đàn khoảng 10 đến 12 con là đủ đẹp và thoải mái, không cần 40 con.
> 1. Đừng thả thêm 40 con neon; thả khoảng 10 đến 12 con trước.
> 2. Theo dõi nước vài tuần: amoniac, nitrit phải về 0, và thay nước định kỳ.
> 3. Nếu muốn nuôi đông hơn, nên dùng bể dài hơn; chuột đồng cần bể dài từ 80 cm.
> 4. Về cá mún: cẩm nang chỉ dùng mún như một cỡ cá (khoảng 4 lít mỗi…

**Plain** (1103 characters):

> Nếu bể của bạn khoảng **100 lít trở lên** và có lọc tốt, thả thêm 40 con neon thường vẫn được, vì neon là cá đàn nhỏ, hiền. Nhưng 40 con khá đông, nên bạn cần kiểm tra vài điều:
> 
> - **Kích thước bể:** Bể dưới 60 lít mà có 40 con neon sẽ rất chật, dễ phát sinh ô nhiễm và stress. Neon nên được nuôi đàn từ 10 con trở lên, và càng nhiều càng tốt nếu bể đủ rộng.
> - **Lọc và thay nước:** Đàn đông thải nhiều chất bẩn hơn. Bạn cần lọc đủ công suất (ít nhất gấp 4-5 lần thể tích bể mỗi giờ) và thay 25-30% nước mỗi tuần.
> - **Chỉ số nước:** Sau khi thả, theo dõi amoniac và nitrit. Hai chỉ số này phải luôn …

### stocking-03 · post · plain wins (4.5 · 8)

**Asked:** Em mới kiếm được cái bể kích thước 35x20x22cm, chưa chơi bao giờ. Nên nuôi loại cá nào cho đẹp, dự định 1 tuần thay nước 1 lần? Có cần mua lọc và sục khí cho bể không?

**Judge:** Y picks livestock that suits 15 L (one betta, cherry shrimp, a few guppies) and adds practical tips for Vietnam: dechlorinating tap water, beginner plants, lights, and a heater if the room is cold. X suggests black neons, which its own card says need a much bigger tank. / X chọn đúng loài hợp với bể 15 lít (1 cá xiêm đực, tôm cherry, vài con bảy màu) và có lời khuyên đầy đủ, đúng: lọc bọt biển, chạy bể trước, khử clo, trồng cây. Y khuyên nuôi đàn neon đen và cherry barb trong 15 lít, trái với chính thẻ loài nó đưa ra (bể từ 80 cm).

**Ours lacks:** tank-fit, wrong, local, follow-up. **Plain lacks:** –.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể 35x20x22 cm (khoảng 15 lít), bạn nên chọn cá nhỏ, đi đàn và hiền như cá neon đen, cá cherry hoặc cá Endler, nuôi đàn từ 6 con trở lên. Bể nhỏ đổi nước nhanh, nên thay 1 tuần một lần là hợp lý. Bạn cần lọc và sục khí: lọc bọt biển chạy bằng máy sục khí là lựa chọn dễ nhất cho bể nhỏ, vì dòng nước nhẹ và không làm cá mệt.
> 1. Mua một lọc bọt biển nhỏ và một máy sục khí êm, đặt máy ngoài bể, nối bằng dây khí.
> 2. Trước khi thả cá, chạy lọc khoảng 4 đến 6 tuần để vi khuẩn có lợi lên đủ, rồi mới thả cá.
> 3. Mỗi tuần thay khoảng 25 đến 30% nước, dùng nước đã khử clo và đúng nhiệt độ với bể.
> 4. …

**Plain** (2058 characters):

> Bể 35x20x22cm tương đương khoảng **15 lít**. Đây là bể nhỏ, dễ biến động nước nên bạn nên chọn ít cá và đầu tư vào lọc.
> 
> ## Gợi ý loại cá/sinh vật
> 
> 1. **Cá xiêm đực (betta)**: Đẹp, nổi bật, nuôi 1 con trong bể này là phù hợp nhất. Không nuôi chung với cá xiêm đực khác.
> 2. **Tôm cherry hoặc tôm ngọc (Neocaridina)**: Rất đẹp, dễ nuôi, nuôi đàn khoảng 10-15 con. Sinh sản nhanh nên dễ có thêm tôm.
> 3. **Cá bảy màu (guppy) hoặc cá tỉ muội**: Nuôi 3-5 con. Đẹp và dễ nuôi, nhưng sinh sản nhanh, cần theo dõi mật độ.
> 
> Tránh cá đàn lớn như neon, cá chuột, cá lia thia... vì bể quá nhỏ.
> 
> ## Thay nước 1 tu…

### stocking-03 · tank · ours wins (6 · 4)

**Asked:** Bể tôi nên nuôi cá gì, bao nhiêu con, có cần lọc và sục khí không?

**Judge:** X tính được thể tích bể (khoảng 15 lít) và trả lời thẳng: nên dùng lọc bọt biển chạy bằng máy sục khí, rồi chạy bể trước khi thả. Nhưng X không gợi ý được loài nào cụ thể. Y hỏi lại những điều app đã có, rồi đưa lời khuyên chung chung có lỗi, và trong đó có những loài không hợp bể nhỏ. / Y nhận ra bể chỉ khoảng 15 lít và đưa ra hướng làm đúng: dùng lọc bọt biển chạy bằng máy sục khí, chạy vi sinh và test amoniac/nitrit trước khi thả cá. Nhưng Y không gợi ý cụ thể loài nào hay bao nhiêu con (ví dụ 1 con betta hoặc một đàn tép), và nói mơ hồ "vài tuần", "một phần nước". X không dùng thông tin bể, hỏi lại kích thước, chỉ đưa con số chung chung và có lỗi gọi cá dĩa là cá nhỏ, dễ nuôi.

**Ours lacks:** figures, too-thin. **Plain lacks:** tank-fit, asks-only, too-long, wrong.

**Ours** (read 3 pages, stopped at the calls limit):

> Bể 35 × 20 × 22 cm (khoảng 15 lít) còn nhỏ, và các loài nhỏ mà mình đã đọc trong cẩm nang đều cần bể lớn hơn: cá neon xanh cần bể 60 cm, cá Jewel minnow (cá neon Việt Nam) cần bể tối thiểu 45 cm. Vì vậy mình chưa tìm được loài cá nào trong cẩm nang hợp với bể này, nên bạn đừng mua cá theo các loài đó. Bể cần lọc và sục khí: bạn nên dùng lọc bọt biển chạy bằng máy sục khí, vì lọc này nhẹ, không hút cá bột hay tép con, và vi khuẩn có lợi bám trên bọt biển giúp nước ổn định.
> 1. Mua một máy sục khí và một lọc bọt biển nhỏ, rồi lắp và chạy thử trước khi thả bất kỳ con gì vào bể.
> 2. Để bể chạy khoả…

**Plain** (1774 characters):

> Để gợi ý chính xác, bạn cho mình biết thêm:
> - **Kích thước bể** (dài x rộng x cao, hoặc số lít)
> - **Nước ngọt hay nước mặn**
> - **Bạn mới chơi hay đã có kinh nghiệm**
> - **Bạn thích loại cá nào** (đẹp, dễ chăm, cá đàn, cá đơn...)
> 
> Trong lúc chờ, đây là gợi ý chung cho **bể nước ngọt** cho người mới:
> 
> **Số lượng cá (tham khảo):**
> - **Bể 30 lít:** khoảng 8–10 con cá nhỏ (neon, bảy màu, molly...) hoặc 1 con betta + vài con cá nhỏ hiền.
> - **Bể 60 lít:** khoảng 15–20 con cá nhỏ, hoặc vài loài kết hợp.
> - **Bể 100 lít trở lên:** dễ ổn định hơn, nên chọn được nhiều loài hơn.
> 
> Nguyên tắc: đừng nuôi quá …

### stocking-04 · post · ours wins (7 · 4)

**Asked:** Em thích con cá bống vàng vì nó khá sinh động (lúc núp dưới đá, lúc đậu trên cây, trên đá) và dọn bể rất sạch, từ ngày nuôi không phải cạo rêu thành bể nữa, cũng chả cần cho ăn gì mà vẫn sống. Nuôi loại gì chung với bống này được? Trước em nuôi mún, rồi kiếm, rồi cá bảy màu, đều cứ chết dần, không biết có phải bị con bống xử không?

**Judge:** Con bống vàng trong câu hỏi chính là cá mút đá vàng. Khi lớn nó hay bám vào cá khác để mút nhớt. X chỉ đúng thủ phạm và đưa ra các bước hợp lý: soi vết trầy trên cá, tách bống ra và cho cá ăn đều. Y lại gạt bống ra khỏi diện nghi ngờ và đưa một danh sách nguyên nhân chung chung, áp vào bể nào cũng được. / Y correctly blames the golden algae eater, which sucks slime off other fish as it gets bigger. That fits the hobbyist's description and their fish dying one by one, and Y gives clear steps: separate it, feed the other fish, and watch them. X takes it for a gentle goby, rules it out as the cause, and gives a generic water-quality checklist. Y's light excerpt is off-topic, though.

**Ours lacks:** figures, off-topic. **Plain lacks:** diagnosis, tank-fit, wrong, too-long.

**Ours** (read 1 pages):

> Cẩm nang chưa có trang riêng cho cá bống vàng, nên mình không có danh sách cá nuôi chung chính thức cho loài này. Chỉ có một đoạn trong bài chăm bể thủy sinh, do một người chơi kể theo video của họ: bống vàng ăn rêu nâu rất tốt, nhưng khi lớn thì quậy, lười ăn rêu và hay bám vào cá khác để mút nhớt. Vì vậy mình nghi bống vàng là thủ phạm làm mún, kiếm và bảy màu chết dần, nhất là khi cá bị mút nhớt mà không kịp lành. Tuy nhiên cẩm nang không có dấu hiệu cụ thể để khẳng định, nên bạn cần quan sát thêm.
> 1. Soi kỹ cá còn lại: nếu có vết trầy, nhớt bị bong, vây rách hoặc cá nằm một chỗ thì khả nă…

**Plain** (1911 characters):

> Bống thường hiền với cá cùng cỡ, nhưng một số loài bống có tính lãnh thổ và có thể rượt hoặc cắn cá nhỏ, nhất là cá nằm đáy. Dù vậy, khả năng cao cá chết không phải do bống "xử". Mình nghĩ có mấy nguyên nhân hay gặp hơn:
> 
> 1. **Chất lượng nước**: Bể không cần cạo rêu, không thay nước, không cho ăn có thể đang tích tụ amoniac, nitrit hoặc nitrat. Đây là nguyên nhân phổ biến nhất khiến cá chết dần. Nên test nước (kit amoniac, nitrit, nitrat, pH) và thay 20–30% nước nếu chỉ số cao.
> 2. **Thiếu thức ăn**: Bống có thể sống nhờ rêu, màng sinh học và thức ăn tự nhiên trong bể, nhưng cá mún, kiếm, bảy …

### stocking-04 · tank · ours wins (5.5 · 3.5)

**Asked:** Bể tôi nuôi chung được những cá nào, khi cá thả thêm cứ chết dần?

**Judge:** Cả hai câu đều bỏ sót khả năng con bống vàng ăn rêu bị bỏ đói đang mút nhớt thân giết cá mới. X ít ra có dùng ghi chú của bể và nhắc phải cho bống ăn, tuy lời khuyên thay nước bị lẫn lộn. Y chung chung, dịch tên cá sai và còn khuyên thả lại đúng những loài đã chết. / Y dùng thông tin trong bể (bống vàng, mún/kiếm/bảy màu chết dần, không cho ăn), có các bước làm theo thứ tự và bảo cho bống ăn thêm. Tuy vậy, Y tính sai lượng nước thay và chưa nghĩ tới việc con bống ăn rêu có thể tấn công cá khác. X thì chung chung, gợi ý lại đúng những loài đã chết và gọi nhầm tên cá kiếm.

**Ours lacks:** diagnosis, tank-fit, figures. **Plain lacks:** tank-fit, diagnosis, wrong, too-long.

**Ours** (read 1 pages):

> Có khả năng cao bể của bạn bị old tank syndrome: bể lâu năm đã tích nitrate, khoáng từ nước máy và phosphate qua nhiều tháng, nên cá mới từ tiệm đưa vào nước có nồng độ cao hơn hẳn và dễ chết, còn bống vàng quen dần nên vẫn sống. Mún, kiếm và bảy màu chết dần cũng hợp với kiểu này. Mình chưa đo được nước của bạn nên mức độ chắc chắn vừa phải, bạn nên kiểm tra nitrate và độ cứng trước. Các bước làm: 1. Mua bộ test nitrate và độ cứng GH, đo nước hiện tại để biết bể đã tích bao nhiêu. 2. Tăng lượng thay nước: nếu đang thay 10% mỗi tuần thì chuyển sang thay khoảng 30–40% mỗi tháng, hoặc thay nhỏ …

**Plain** (2273 characters):

> Cá chết dần mỗi lần thả thêm thường không phải do loài không hợp nhau mà chủ yếu do **chất lượng nước**. Bạn nên kiểm tra các điểm sau trước.
> 
> ## 1. Nguyên nhân hay gặp nhất
> 
> - **Nước chưa ổn định (chu trình nitơ chưa hoàn thiện):** Mỗi lần thả thêm cá, lượng amoniac và nitrit tăng đột ngột, làm cá yếu và chết. Bạn nên dùng bộ test (API hoặc tương tự) để đo NH3/NH4+ và NO2-. Hai chỉ số này phải bằng 0. NO3- nên dưới 20-40 ppm.
> - **Quá tải cá:** Quy tắc tham khảo là khoảng 1 inch (2,5 cm) cá trưởng thành cho 1 gallon (3,8 lít) nước, nhưng thực tế nên thưa hơn. Bể nhỏ dưới 60 lít chỉ nên nuôi v…

### stocking-05 · post · plain wins (5 · 7)

**Asked:** Em mới mua thêm mấy con cá chép thả chung với cá vàng, mà nó tấn công cá vàng kinh quá, một con chết rồi. Hỏi cửa hàng thì họ bảo thả chung được em mới mua. Giờ em nên làm sao, chép với cá vàng có nuôi chung được không?

**Judge:** Y is better for this hobbyist. It answers the question directly: carp and goldfish shouldn't be kept together, and the shop was wrong. Its steps are practical: separate the carp, remove the dead fish, test the water, change 30% of the water, and treat wounds with a mild salt bath or methylene blue. X is unsure of its own answer, assumes the carp is a koi, and recommends 20–23°C, which most tanks in Vietnam can't reach without a chiller. / Both answers tell the hobbyist to take the carp out first. X gives clearer follow-up steps: check the water, change 30%, add aeration, and treat any wounds. Y hedges, its 20–23°C target is impractical in Vietnam, and the 'peaceful' koi card under it works against its own advice.

**Ours lacks:** diagnosis, local, figures. **Plain lacks:** tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình tiếc con cá vàng. Nhiều khả năng con chép lớn hơn và hung hơn nên đuổi, cắn cá vàng, còn cá vàng thân ngắn, vây dài, bơi chậm nên không thoát được. Cẩm nang có trang cá koi (cá chép Nhật, cùng họ với cá vàng), nói koi có thể dài trên 60 cm và cần khoảng 950 lít nước cho mỗi con khi lớn, nên bể nhỏ dễ dẫn đến cắn nhau. Cẩm nang cũng nói nuôi chung koi với cá vàng không phải là không được, nhưng mình chưa đọc hết mục đó nên chưa có kết luận rõ cho trường hợp của bạn. Lời cửa hàng chỉ đúng khi bể đủ rộng và cá chép còn nhỏ.
> 1. Tách con chép còn lại ra ngay, nuôi riêng trong bể khác hoặc hồ …

**Plain** (1438 characters):

> Em xin lỗi vì chuyện này. **Cá chép và cá vàng thường không nên nuôi chung.** Cửa hàng nói "thả chung được" là chưa đúng, hoặc chỉ đúng trong điều kiện rất lý tưởng.
> 
> **Lý do:**
> - Cá chép lớn nhanh, có thể dài 30-60 cm, trong khi cá vàng (nhất là các loại có vây dài như ranchu, oranda, bong bóng) bơi chậm và dễ bị bắt nạt.
> - Cá chép thường hung hăng, hay rượt và cắn vây cá khác, nên cá vàng dễ bị thương, nhiễm trùng rồi chết.
> - Hai loài có nhu cầu môi trường và thức ăn hơi khác nhau, khó chăm chung.
> 
> **Em nên làm ngay:**
> 1. **Tách chép ra riêng** càng sớm càng tốt, nếu được thì nuôi trong bể …

### stocking-05 · tank · ours wins (7.25 · 6)

**Asked:** Cá chép mới thả cứ tấn công cá vàng trong bể tôi, có nuôi chung được không?

**Judge:** X để ý đến con cá vàng đã chết: bảo đo amoniac/nitrit, thay 1/3 nước cùng nhiệt độ, tách cá ngay, và chỉ đưa con số có dẫn nguồn. Y viết tiếng Việt tự nhiên hơn nhưng bỏ qua con cá chết, lại khuyên cho ăn nhiều hơn và dùng thuốc mà không có liều. / Y biết bạn đã có một con cá vàng chết. Y bảo tách cá ngay, đo amoniac và nitrit, thay khoảng 1/3 nước, rồi theo dõi cá vàng còn lại trong 1–2 tuần. Con số 950 lít cho mỗi con koi cũng lấy từ cẩm nang. X chung chung, không nhắc đến con cá đã chết, không bảo kiểm tra nước, và khuyên cho ăn nhiều hơn để cá bớt hung, lời khuyên này sai. Tiếng Việt của X tự nhiên hơn: Y mở đầu bằng một đoạn giải thích về công cụ khá lủng củng.

**Ours lacks:** local. **Plain lacks:** tank-fit, figures, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình chưa kiểm tra được cặp này: cẩm nang chưa có trang riêng cho cá chép nên công cụ tank-mates không có số liệu để so, và trang cá koi cũng không nói rõ chuyện cắn cá vàng. Theo trang cá vàng trong cẩm nang, cá vàng hiền nhưng hay bị cắn vây khi stress hoặc tranh ăn, và không nên nuôi chung với cá có thể nuốt hay quấy nó. Cá chép và koi lớn nhanh, có thể dài trên 60 cm và cần rất nhiều nước, nên trong một bể nhỏ chúng gần như chắc chắn làm cá vàng stress. Nhiều khả năng cá vàng chết vì bị đuổi, bị thương hoặc vì stress, nhưng mình chưa thấy trang nào nói rõ trường hợp của bạn.
> 1. Tách ngay:…

**Plain** (1280 characters):

> **Thường thì không nên nuôi chung.** Cá chép lớn nhanh, có thể dài 30-60 cm hoặc hơn, khỏe và hiếu động hơn nhiều. Cá vàng bơi chậm, vây dài, dễ bị thương, nên cá chép thường xuyên đuổi, húc hoặc cắn vây cá vàng. Ngay cả khi cá chép còn nhỏ, sau vài tháng nó sẽ lớn và gây hại nhiều hơn.
> 
> **Bạn nên làm ngay:**
> 
> 1. **Tách cá chép ra** nếu có thể, bằng một bể riêng hoặc ngăn tạm bằng lưới/tấm nhựa trong bể.
> 2. **Kiểm tra cá vàng**: tìm vết cắn, rách vây, trầy xước, đốm đỏ hoặc nấm trắng. Nếu có vết thương, nên thay một phần nước và theo dõi, có thể dùng thuốc xanh methylen hoặc muối (liều nhẹ) đ…

### stocking-06 · post · plain wins (5 · 7)

**Asked:** Em vừa set cái bể cubic theo tư vấn, đáy bể để 5 con nerita. Ra cửa hàng thấy cá kiếm mắt đỏ đẹp quá nên mua thử vài con. Mấy con mún đỏ sắp đẻ nên em đang tính chuyển sang chỗ khác vì sợ bị ăn hết trứng, cá con, bắt đầu thấy ngại rồi. Bể có lọc thác, có cần thay nước hàng tuần không vì thấy nước có mùi hôi?

**Judge:** Y nên được chọn. Y nói đúng là mún và kiếm đẻ con chứ không đẻ trứng, trả lời thẳng là nên thay 20–30% nước mỗi tuần, và kể ra các nguyên nhân gây hôi, trong đó có chuyện bể cubic nhỏ nuôi đông cá. X nhầm mún đỏ thành molly, và lời khuyên thay nước của X mâu thuẫn nhau. Cả hai đều không nói rõ là cá kiếm không hợp với bể cubic nhỏ (thẻ loài của X ghi bể từ 120 cm nhưng phần trả lời không nhắc tới). / X đúng khi nhắc mún và kiếm đẻ con chứ không đẻ trứng, nhờ vậy gỡ được hiểu lầm của bạn này, và trả lời thẳng là thay 20–30% nước mỗi tuần, có kèm các nguyên nhân gây mùi hôi. Y nhầm mún thành molly, chẩn đoán chuyện chưa xảy ra và tự mâu thuẫn về lượng nước thay. Tuy vậy thẻ loài của Y có ghi cá kiếm dài tới 14 cm và cần bể từ 120 cm, điều mà cả hai câu trả lời đều không nói ra với một bể cubic.

**Ours lacks:** tank-fit, follow-up, diagnosis. **Plain lacks:** tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là cá lớn đang ăn cá bột, không phải ốc. Cá kiếm và molly đều đẻ con, con lớn hay ăn con non ngay, và ốc nerita không ăn trứng hay cá bột nên 5 con ở đáy bạn giữ được. Mùi hôi thường đến từ xác hoặc thức ăn thừa dưới nền, nên thay nước chỉ là một phần của việc xử lý. Bạn không cần chuyển cả bể, chỉ cần tách con sắp đẻ.
> 1. Khi con cái bụng to và quầng đen gần bụng sẫm lại, chuyển nó sang hộp đẻ hoặc bể nhỏ có nhiều cây, rồi lấy ra sau khi đẻ xong.
> 2. Nếu chưa kịp tách, để nhiều cây dày như rêu java hoặc bèo để cá bột có chỗ trốn.
> 3. Vớt sạch xác cá, ốc, lá mục và th…

**Plain** (1544 characters):

> Em nhớ là mún và kiếm đẻ **cá bột sống**, không đẻ trứng. Cá mẹ thường ăn chính cá con nên em cần tách ra.
> 
> **Về cá sinh sản**
> - Em có thể chuyển cá mẹ sang hộp đẻ (breeding box) hoặc bể nhỏ khác khi thấy bụng gần chuyển dạ. Cá sinh xong thì để mẹ về lại bể chính.
> - Nếu không có hộp đẻ, em trồng dày rêu java, bèo tây hoặc cây rậm để cá con có chỗ trốn, nhưng tỉ lệ sống sẽ thấp.
> - Ốc Nerita không ăn cá con và không sinh sản được trong nước ngọt nên em không cần lo về chúng.
> 
> **Về mùi hôi**
> Mùi hôi thường là dấu hiệu của amoniac hoặc chất hữu cơ phân hủy, không nên bỏ qua. Nguyên nhân hay gặp:
> …

### stocking-06 · tank · ours wins (6.5 · 5.5)

**Asked:** Mún trong bể tôi sắp đẻ, có cần tách ra không, và có phải thay nước hàng tuần không?

**Judge:** X catches that the tank is newly set up and the water smells bad, and says to test ammonia and nitrite first. Y misses this completely. X also warns against moving the mother when she is about to give birth. But X wrongly doesn't recognise that mún is platy. / Y is the better answer for this hobbyist. It warns against moving a female who is close to giving birth and suggests a divider inside the tank instead. It also connects the bad smell and the new tank to the nitrogen cycle and says to test ammonia and nitrite before changing water. X gives sensible general advice but ignores the new tank and the smell. Y loses some points for not recognising 'mún' as platy and for a few made-up figures.

**Ours lacks:** local, figures. **Plain lacks:** tank-fit, diagnosis, follow-up.

**Ours** (read 1 pages, stopped at the calls limit):

> Mình chưa thấy trong cẩm nang trang riêng về "mún", nên mình giả định đó là cá đẻ con cùng nhóm với platy hoặc bảy màu, vì bể bạn đang có cá kiếm và platy. Cẩm nang khuyên đừng bắt cá mẹ chuyển bể khi đã sát ngày đẻ, vì cá có thể sẩy thai hoặc chết. Nên nếu chưa gần đẻ thì chuyển sang bể đẻ riêng, còn sát ngày thì dùng vách ngăn ngay trong bể.
> Còn chuyện thay nước hàng tuần, cẩm nang mình đọc không ghi tần suất cho cá trưởng thành. Mình chỉ thấy mức 20–30% cho cá con. Theo kinh nghiệm chung, bạn nên thay khoảng 20–30% mỗi tuần khi bể đã chạy ổn. Bể bạn mới set và nước đang có mùi hôi, nên trư…

**Plain** (1246 characters):

> Bạn nên **tách mún mẹ ra** nếu muốn giữ được cá con. Mún là loài đẻ con, và cá lớn thường ăn cá con ngay sau khi chúng được sinh ra.
> 
> **Cách tách và chuẩn bị:**
> - **Dùng lồng đẻ (breeder box)** treo trong bể hoặc **bể nhỏ riêng** có cây thủy sinh dày như rêu java, rong đuôi chó để cá con có chỗ trốn.
> - **Nhận biết sắp đẻ:** bụng to và vuông, có một đốm đen gần gốc vây hậu môn (gravid spot) sẫm dần. Thường khi thấy vậy thì còn khoảng 1–2 ngày.
> - **Sau khi đẻ:** đưa mẹ về bể chính hoặc để trong lồng đẻ, và lấy cá con ra khi cần.
> - **Cho cá con ăn:** artemia con, bột thức ăn cho cá con, hoặc thứ…

### stocking-07 · post · plain wins (3.5 · 6)

**Asked:** Bể nhà em kích cỡ 60x35x40, thả neon và sóc đỏ khoảng bao nhiêu con thì được ạ?

**Judge:** X guessed the species as botia and then gave a wrong cold-water temperature range and too many fish that grow large. Y may also have the species wrong, but its numbers are reasonable and safe, and it gives clear basics: cycle the tank 3–6 weeks, change 25–30% of the water weekly, keep it at 23–26°C. / X gives believable stocking numbers and sound basic care, though it probably guesses the wrong fish for "sóc đỏ". Y's loach guess is plausible, but its 15–21°C range is wrong, its neon count is too low, and the temperature warning it builds on those figures could mislead the hobbyist.

**Ours lacks:** wrong, local, tank-fit, figures. **Plain lacks:** local, follow-up.

**Ours** (read 2 pages, stopped at the calls limit):

> Nuôi chung được, nhưng cần để ý: chạch sóc đuôi đỏ có thể rượt đuổi cá neon và hay cắn vây cá khác. Mình hiểu "sóc đỏ" là chạch sóc đuôi đỏ, nếu bạn nói loài khác thì cho mình biết để kiểm tra lại. Bể 60x35x40 (khoảng 84 lít) đủ cho khoảng 10 con neon xanh và 6 con chạch, mức nuôi khoảng 85%. Có một điểm quan trọng hơn số lượng: cá neon thích 21–25°C, còn chạch sóc đuôi đỏ thích 15–21°C, hai khoảng này chỉ trùng nhau quanh 21°C. Nếu bể của bạn thường xuyên trên 22°C thì nên cân nhắc lại việc nuôi chung.
> 1. Đo nhiệt độ bể vài ngày liên tiếp, nhất là buổi chiều, trước khi thả cá.
> 2. Thả neon tr…

**Plain** (944 characters):

> Bể 60x35x40 cm có thể tích khoảng **84 lít** (thể tích thực khoảng **70-75 lít** sau khi trừ nền, đá, cây và lớp nước trống trên mặt).
> 
> Với thể tích này, bạn có thể nuôi khoảng:
> - **Neon: 20-25 con**. Cá neon sống theo đàn, nên nuôi ít nhất 8-10 con, càng đông càng ổn định.
> - **Sóc đỏ (cá Corydoras): 6-8 con**. Cá sóc sống theo nhóm, nên nuôi ít nhất 5-6 con. Chúng ăn ở đáy bể và cần nền cát mịn để không bị tổn thương râu.
> 
> Lưu ý:
> - Nếu "sóc đỏ" bạn nói là loài khác (ví dụ cá ember, cá sóc khác), hãy cho mình biết tên chính xác để tính lại.
> - Bể cần **chu trình nitơ ổn định** (cycle) trước kh…

### stocking-07 · tank · ours wins (5 · 2.5)

**Asked:** Bể của tôi thả được bao nhiêu con neon và sóc đỏ?

**Judge:** X dùng đúng kích thước bể và đưa ra số lượng cụ thể (10 neon, 6 con), có kiểm tra khả năng nuôi chung. Tuy vậy, X đoán sai loài có thể xảy ra và khuyên giữ 21°C là không hợp với Việt Nam. Y bỏ qua dữ liệu bể, đoán loài sai, đưa mật độ quá dày và phần lớn chỉ hỏi lại. / Y works from the real tank (about 84 L), gives concrete numbers and steps, and says what it assumed "sóc đỏ" means. Its 21°C advice doesn't suit Vietnam, though. X ignores the known tank size, reads "sóc" as Corydoras (wrong), and mostly asks questions back.

**Ours lacks:** local, wrong. **Plain lacks:** tank-fit, asks-only, wrong, local.

**Ours** (read 2 pages):

> Nuôi chung được, nhưng cần để ý: mình hiểu "sóc đỏ" là cá chạch sóc đuôi đỏ, nên nếu bạn nói loài khác thì mình sẽ kiểm tra lại. Với bể 60 × 35 × 40 cm (khoảng 84 lít), 10 neon xanh và 6 chạch sóc đuôi đỏ làm bể đầy khoảng 85%, mức vừa phải. Hai điểm cần lưu ý: chạch có thể rượt neon và hay cắn vây cá khác, còn nhiệt độ thì neon thích 21–25°C, chạch thích 15–21°C, hai loài chỉ trùng nhau ở khoảng 21°C.
> 1. Giữ nhiệt độ ổn định quanh 21°C, không để nước lên cao hơn.
> 2. Set nhiều đá hang, rễ cây và cây thủy sinh để chạch có chỗ trốn.
> 3. Thả neon trước, đợi bể ổn định, rồi thả chạch, mỗi loài nên…

**Plain** (1001 characters):

> Số lượng phù hợp phụ thuộc vào **dung tích bể** và **loài "sóc đỏ"** bạn nuôi. Tôi chưa rõ "sóc đỏ" là loài nào, nên bạn cho mình biết thêm nhé. Trong lúc đó, đây là gợi ý chung:
> 
> **Cá neon (neon tetra):**
> - Nên nuôi thành đàn tối thiểu 6 con, tốt nhất 10 con trở lên vì loài này sống theo bầy và dễ stress khi ít con.
> - Quy tắc tham khảo: khoảng 10 con cho mỗi 20 lít nước, nhưng nên thả thưa hơn nếu bể có nhiều cây thủy sinh và lọc tốt.
> 
> **Cá sóc (Corydoras) hoặc cá đáy tương tự:**
> - Nên nuôi thành nhóm từ 5-6 con trở lên.
> - Chúng cần đáy cát mịn hoặc sỏi nhỏ, không nên dùng sỏi sắc.
> 
> **Tôm đỏ…

### stocking-08 · post · plain wins (6 · 7)

**Asked:** Em mới chơi, ban đầu chỉ định mua cá với cây nhựa, nhưng tìm hiểu thấy mê thủy sinh quá nên mua thêm cây ráy nhỏ và chùm xương cá thay cây nhựa. Bể bé tí 4 lít mà thích đẹp em thả 7-8 con. Nuôi được 1 tuần rồi vẫn ổn, lâu dài có ổn không ạ?

**Judge:** Y explains the right causes (waste build-up, no cycled filter bacteria yet, temperature swings, low oxygen). It also adds the most practical fix, an air-driven sponge filter, and gives clear feeding and water-change advice. X is shorter and its stocking figure is conservative, but it leaves out the filter and aeration and couldn't identify the plant. / X đủ hơn. Nó nói đúng các rủi ro của bể 4 lít và có những bước then chốt như thêm lọc bọt biển chạy khí để vừa lọc vừa có oxy, cho ăn ít, đậy nắp, cùng dấu hiệu cần theo dõi. Y gọn và thực tế hơn khi khuyên chỉ giữ 1–2 con, nhưng bỏ qua lọc/sục khí. Bước đầu của Y (ghi tên loài rồi cộng chiều dài) lại chỉ là việc vặt, và Y không trả lời được gì về cây chùm xương cá.

**Ours lacks:** tank-fit, plan. **Plain lacks:** too-long, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng bể này chưa ổn lâu dài: bể 4 lít chỉ gánh được khoảng 2–3 cm cá tổng cộng, mà 7–8 con đang vượt mức đó rất nhiều. Một tuần vẫn ổn chưa có nghĩa là bể đã ổn, vì ammonia thường tích dần khi vi sinh chưa theo kịp và cá dễ thiếu oxy. Mình chưa tra được chùm xương cá trong cẩm nang, nên phần cây này bạn kiểm tra lại tên với người bán giúp mình.
> Các bước nên làm:
> 1. Ghi tên từng loài cá và cỡ khi trưởng thành, rồi cộng tổng chiều dài.
> 2. Đo ammonia, nitrite và nitrate bằng bộ test; nếu ammonia hoặc nitrite trên 0 thì giảm cá ngay.
> 3. Chuyển bớt cá sang bể lớn hơn, khoảng 20 lít trở l…

**Plain** (2035 characters):

> Với bể 4 lít và 7-8 con cá, **lâu dài thì chưa ổn**. Một tuần đầu chưa nói lên được gì, vì các vấn đề của bể nhỏ thường xuất hiện sau vài tuần.
> 
> **Vì sao bể nhỏ dễ có vấn đề:**
> - **Chất thải tích tụ nhanh:** Cá thải amoniac và nước nhanh bẩn. Lượng nước ít nên amoniac, nitrit tăng rất nhanh, có thể gây độc cho cá.
> - **Chu trình nitơ chưa ổn định:** Bể mới thường cần 4-6 tuần để vi khuẩn có lợi phát triển đủ. Cây thủy sinh giúp hấp thụ một phần chất thải nhưng không thay thế được vi khuẩn lọc.
> - **Nhiệt độ dao động mạnh:** Nước ít nên thay đổi theo nhiệt độ phòng rất nhanh, dễ gây sốc.
> - **Thi…

### stocking-08 · tank · ours wins (7 · 3)

**Asked:** Bể của tôi đang thả 7-8 con cá, lâu dài có ổn không?

**Judge:** X dùng đúng bể 4 L và nói thẳng là 7-8 con thì quá tải. X cũng cho các bước cụ thể: ngừng thả thêm, chuyển bớt cá đi, đo ammonia/nitrite, thay nước. Tuy vậy, X không nhắc bể mới chạy 1 tuần nên chưa có hệ vi sinh, và tần suất thay nước nói chưa rõ. Y bỏ qua thông tin bể, chỉ nói chung chung cho bể 40-60 L rồi hỏi lại, nên người chơi không biết phải làm gì ngay. / Y uses the 4 L size, says plainly that the tank is overstocked, and gives clear steps: rehome some fish, test the water, change water. It doesn't point out that a 1-week-old tank hasn't cycled yet, and its water-change schedule is too loose. X ignores the tank size, gives generic examples for 40-60 L tanks, and mostly asks questions back.

**Ours lacks:** figures, tank-fit, diagnosis. **Plain lacks:** tank-fit, asks-only, too-long, plan.

**Ours** (read 1 pages, stopped at the calls limit):

> Với bể khoảng 4 lít thì 7-8 con cá là quá tải, nên lâu dài chưa ổn. Trong bể nhỏ, chất thải và ammonia tăng rất nhanh, nước đổi xấu trong vài ngày. Cẩm nang chỉ có cách tính chung, không có con số riêng cho bể 4 lít, và bạn chưa cho biết loài nào nên mình chưa tính được cụ thể.
> 1. Xác định từng loài và cỡ trưởng thành của chúng, không tính theo cỡ con mua ở tiệm.
> 2. Đo ammonia và nitrite, cả hai nên bằng 0; nitrate nên dưới 40 ppm.
> 3. Ngừng thả thêm, và chuyển bớt cá sang bể lớn hơn hoặc trả lại cửa hàng.
> 4. Thay một phần nước bằng nước đã khử clo thường xuyên, khoảng vài ngày một lần theo ki…

**Plain** (1607 characters):

> Câu trả lời phụ thuộc vào **kích thước bể**, **loài cá** và **hệ lọc**. Bạn cho mình biết thêm thì mình đánh giá cụ thể hơn được.
> 
> **Vài tiêu chí để kiểm tra:**
> 
> 1. **Thể tích bể:** Quy tắc phổ biến là khoảng 1 lít nước cho 1 cm cá trưởng thành (tính cả chiều dài thân, không tính đuôi). Nhiều loài cá nhỏ như neon hay tetra thường được nuôi theo đàn, nên 7-8 con nhỏ có thể ổn trong bể 40-60 lít. Còn nếu là cá lớn như cichlid, cá vàng hay cá la hán thì 7-8 con có thể là quá đông.
> 
> 2. **Loài cá:** Cá đàn (neon, tetra, cá bảy màu) cần nhiều con cùng loài và thường thoải mái hơn khi đông. Cá lãnh …

### stocking-09 · post · plain wins (4.5 · 7)

**Asked:** Bể dài 80, rộng 35, cao 45 cm thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** Ở Việt Nam, nuôi ông tiên chung với neon là kiểu bể rất phổ biến. Y trả lời đúng thực tế: nuôi được nhưng có rủi ro ông tiên lớn lên sẽ ăn neon, và chỉ cách giảm rủi ro như trồng nhiều cây, thả lúc ông tiên còn nhỏ, rồi theo dõi. X cấm hẳn, lấy lý do bể phải dài 100 cm là quá khắt khe, lời khuyên lại tự mâu thuẫn và thiếu cụ thể. / X nói đúng thực tế mà dân chơi đã làm: nuôi chung được nếu thả neon trước khi ông tiên còn nhỏ, trồng nhiều cây và theo dõi. Tuy vậy X chưa nhắc đến nhiệt độ nước mùa nóng ở Việt Nam. Y cứng nhắc, nêu một con số bể 100 cm quá khắt khe và tự mâu thuẫn khi bảo chỉ nuôi ông tiên trong cái bể mà nó vừa nói là chưa đủ.

**Ours lacks:** wrong, tank-fit, plan. **Plain lacks:** figures, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên dài tới 15 cm nên có thể ăn cá neon xanh chỉ dài 3 cm, và nó cũng hay rượt đuổi cá nhỏ. Bể 80 cm còn chưa đủ chỗ cho cá ông tiên, vì handbook ghi loài này cần bể dài từ 100 cm.
> 1. Nếu muốn giữ ông tiên, bạn nên chọn bể dài từ 100 cm trở lên và trồng nhiều cây để cá có chỗ trốn.
> 2. Trong bể 80 cm này, bạn nên bỏ neon xanh và chỉ nuôi ông tiên, hoặc chọn loài nhỏ, hiền hơn, không đủ lớn để bị ăn.
> 3. Nếu muốn giữ neon xanh, bạn nên nuôi chúng thành đàn lớn trong bể riêng, có cá hiền cùng kích cỡ.
> Bạn nên theo dõi cá ông tiên vài tuần đầu khi thả vào bể mới, xem …

**Plain** (1504 characters):

> **Có thể nuôi chung được**, với điều kiện bạn chuẩn bị kỹ một số yếu tố sau.
> 
> **Điều kiện thuận lợi:**
> - **Kích thước bể:** Bể 80×35×45 cm (khoảng 126 lít) khá phù hợp. Cá ông tiên cần bể cao, và 45 cm là đủ cho một cặp.
> - **Nhiệt độ và nước:** Cả hai loài đều thích nước ấm, khoảng 24–27°C, pH trung tính đến hơi axit (6,5–7,5). Bạn chỉ cần giữ nhiệt ổn định ở mức này.
> - **Số lượng neon:** 10 con là số lượng tốt vì neon sống theo đàn, nên đàn đông sẽ giúp chúng bớt rụt rè.
> 
> **Những điểm cần lưu ý:**
> 1. **Ông tiên lớn dần:** Cá trưởng thành cao khoảng 15 cm (tính cả vây). Khi đã trưởng thành, c…

### stocking-09 · tank · plain wins (4.5 · 7)

**Asked:** Bể của tôi thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** X is wrong to rule this out and to call an 80 cm (about 126 L) tank too small, and it gives no workable way to keep them. Y gets the real risk right (big angels can eat neons, and angels turn aggressive when spawning) and says how to handle it. Y's ≥100 L minimum fits this tank, but Y doesn't work out the volume for them or mention keeping the water cool in the Vietnamese heat. / Bể của bạn khoảng 126 lít, nuôi được 2 con ông tiên. X nói đúng combo này nuôi được và chỉ cách giảm rủi ro ông tiên ăn neon. Y dùng kích thước bể nhưng lại cấm hẳn, dựa vào mức 100 cm bị nói quá, và không chỉ cách làm cho được.

**Ours lacks:** wrong, plan, too-thin. **Plain lacks:** tank-fit, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên dài khoảng 15 cm và có thể ăn cá neon xanh chỉ dài 3 cm, lại hay rượt đuổi cá nhỏ. Bể 80 cm của bạn cũng chưa đủ rộng, vì cá ông tiên cần bể dài từ 100 cm trở lên. Nếu muốn nuôi ông tiên, bạn nên chọn cá to hơn hoặc tính lại bể; còn neon xanh thì nên nuôi cùng cá nhỏ, hiền và cùng cỡ.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 80×35×45 cm]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon xanh (3 cm).
> Cá ông tiên hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Mức đầy bể: 84% — 84% · Vừa phải: bể ổn …

**Plain** (1253 characters):

> Có thể nuôi chung được, và đây là combo khá phổ biến. Nhưng bạn cần lưu ý vài điểm:
> 
> **Điều kiện phù hợp**
> - **Kích thước bể:** Tối thiểu khoảng 100 lít, tốt nhất từ 120 lít trở lên. Cá ông tiên trưởng thành cao khoảng 15 cm, cần không gian bơi và lãnh thổ.
> - **Nhiệt độ:** Cá ông tiên thích 24–28°C, neon xanh chịu được 22–26°C. Nên giữ khoảng 25–26°C để cả hai đều ổn.
> - **Độ pH:** Cả hai đều thích nước hơi acid đến trung tính (pH khoảng 6–7,5) và nước mềm.
> 
> **Rủi ro cần biết**
> - **Cá ông tiên ăn neon:** Ông tiên lớn có thể ăn neon nếu neon đủ nhỏ để vừa miệng. Vì vậy nên thả neon cùng lúc hoặ…

### stocking-10 · post · plain wins (4 · 6.5)

**Asked:** Bể 60x30x36 cm của mình đang nuôi 12 con neon xanh, thả thêm 1 con cá betta được không?

**Judge:** Y matches how hobbyists actually keep fish: a betta with a school of neons in a planted 65 L tank usually works. It tells them what to watch for and when to separate the fish. Its weak points are the heater advice, which doesn't fit Vietnam, and a stocking order that doesn't apply to this tank. X just says no on a blanket rule that's wrong and is too thin to help. / Bể khoảng 65 lít, cây nhiều, nuôi 1 betta chung với đàn neon thì thường là được. X trả lời đúng hướng này, kèm điều kiện và dấu hiệu cần theo dõi, dù có vài lỗi nhỏ như khuyên thứ tự thả cá và dùng tên gọi chưa chuẩn. Y cấm hẳn theo một quy tắc cứng, không đúng thực tế nuôi, còn tự mâu thuẫn ở bước theo dõi.

**Ours lacks:** wrong, too-thin, tank-fit, diagnosis. **Plain lacks:** local, tank-fit, follow-up.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài. Bể 60x30x36 cm đang nuôi 12 con neon xanh chỉ dùng khoảng 36% tải nên còn chỗ, nhưng vấn đề nằm ở tính cách betta chứ không phải dung tích.
> 1. Đừng thả betta vào bể neon hiện tại.
> 2. Giữ nguyên 12 con neon xanh, vì bể đang ở mức tải thưa.
> 3. Nếu muốn nuôi betta, chuẩn bị một bể riêng, nhỏ hơn và có nắp đậy.
> 4. Khi thêm cá mới vào bể này, kiểm tra lại tính cách và số lượng trước.
> Sau khi thay đổi, hãy quan sát neon xanh vài ngày để chắc chúng không bị rượt hay cắn.
> 
> [Công cụ: Nuôi chung]
> Không nên nuôi chung: …

**Plain** (1406 characters):

> **Có thể nuôi được**, bể 60x30x36 cm (khoảng 65 lít) đủ rộng cho 1 con betta cùng 12 con neon. Neon là cá hiền, đi đàn, ít khi gây hấn, và betta thường sống chung được với chúng. Tuy nhiên, bạn nên lưu ý mấy điểm sau:
> 
> **Điều kiện để sống chung tốt:**
> - **Nhiều chỗ ẩn nấp:** Trồng thêm cây thủy sinh như dương xỉ Java, rêu Java, trâm bầu, hoặc đặt đá, lũa. Betta cần chỗ tránh khi bị rượt đuổi.
> - **Dòng nước nhẹ:** Betta bơi chậm và không thích dòng chảy mạnh, nên chọn lọc không quá mạnh hoặc để bớt vòi phun.
> - **Nhiệt độ:** Cả hai loài đều ưa nước ấm, khoảng 24–27°C, nên thường dùng máy sưởi l…

### stocking-10 · tank · ours wins (6.5 · 3)

**Asked:** Bể của tôi thả thêm 1 con cá betta được không?

**Judge:** X dùng đúng thông tin bể (khoảng 65 lít, 12 neon, mới đầy 36%) và trả lời thẳng là nên nuôi betta bể riêng. Lời khuyên này hơi thận trọng quá mức, vì thực tế một con betta trong bể 65 lít với đàn neon vẫn thường nuôi được, nhưng vẫn an toàn. Y bỏ qua dữ liệu bể, tưởng trong bể đã có betta, dùng sai từ "cá tế bào" và chủ yếu hỏi lại người hỏi. / Y uses the actual tank (60×30×36 cm, 12 neons, still lightly stocked) and gives a clear answer, though it is overcautious. X answers a different question (betta with another betta) and asks for details the app already has.

**Ours lacks:** follow-up, plan. **Plain lacks:** tank-fit, asks-only, local, off-topic.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài. Bể 60×30×36 cm của bạn đang có 12 con cá neon xanh, còn thưa (khoảng 36%), nên về mật độ thì thả thêm được, nhưng betta dễ rượt và cắn cá neon nhỏ, nhất là khi cá mới vào. Nếu muốn nuôi betta, bạn nên làm một bể riêng.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 60×30×36 cm]
> Không nên nuôi chung: Cá betta (cá xiêm) hung dữ.
> Cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.
> Mức đầy bể: 36% — 36% · Còn thưa: thả thêm được.
> 
> [Gợi ý hỏi tiếp] Bể nhỏ bao nhiêu lít thì nuôi một con betta đ…

**Plain** (1081 characters):

> **Thường thì không nên**, đặc biệt nếu bể đang có một con betta đực. Betta đực rất hung dữ với các con đực khác và sẽ đánh nhau đến khi bị thương nặng hoặc chết. Chúng cũng có thể căng thẳng và bệnh tật khi phải sống chung với cá khác.
> 
> **Một số trường hợp cụ thể:**
> 
> - **Betta đực + betta đực:** Không nên. Gần như chắc chắn sẽ đánh nhau.
> - **Betta đực + betta cái:** Chỉ có thể thử trong bể rất lớn (thường từ 80 lít trở lên), có nhiều cây thủy sinh và chỗ ẩn nấp, và phải quan sát liên tục. Con cái có thể bị đực rượt đuổi hoặc cắn. Nếu thấy cá cái bị thương hoặc stress, phải tách ra ngay.
> - **B…

### algae-12 · post · ours wins (7 · 6)

**Asked:** Bể 60x30x36 của mình set được 4 tuần, không CO2, trồng rêu java, ráy nana với dương xỉ java, đèn LED bật liền 8 tiếng mỗi ngày, châm phân nước 1 lần/tuần. Lá ráy bắt đầu có đốm rêu xanh. Có nên chia đèn ra làm hai đợt sáng chiều, mỗi đợt không quá 4 tiếng không?

**Judge:** X nhận ra rêu đốm (GSA) trên lá ráy, cho cách lau thử để phân biệt, rồi đi theo thứ tự hợp lý: đo PO4, có khoảng mục tiêu và ngưỡng để quyết định. X cũng trả lời thẳng câu hỏi về chia đèn. Y dài và chung chung hơn, lại khuyên giảm phân và thay nước để giảm phosphat, điều này có thể làm GSA nặng thêm. / Y chỉ ra rêu đốm xanh (GSA) và cho cách xác định: lau thử chấm rêu, đo PO4 theo mốc 0,5–2 ppm và theo dõi 2–3 tuần. X đưa ra danh sách chung chung, có cả bước giảm phân và giảm phosphate, mà bước này có thể làm GSA nặng thêm. Cả hai đều trả lời đúng câu hỏi chia đèn: chia làm hai đợt không phải là cách sửa chính.

**Ours lacks:** local. **Plain lacks:** diagnosis, too-long, tank-fit, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Chấm xanh cứng khoảng 1 mm bám trên lá ráy thường là rêu chấm xanh (GSA). Theo cẩm nang, thủ phạm gần như luôn là phosphate chứ không phải đèn, nên việc chia đèn sáng chiều chưa phải là cách sửa đầu tiên. Bể 4 tuần, châm phân mỗi tuần và có thể có phân nền giàu dinh dưỡng là những điều dễ làm phosphate lệch. 1. Lau thử một chấm: nếu bám chặt và không lau trôi thì đúng là GSA, không phải rêu bụi. 2. Cạo kính và cắt bỏ những lá ráy phủ dày đốm, lá ít đốm thì giữ lại. 3. Đo PO4 bằng bộ test: nếu gần 0 thì bổ sung phosphate, nếu đã cao thì giảm phân. Cẩm nang nhắm PO4 khoảng 0,5 đến 2 ppm, nhưng …

**Plain** (1952 characters):

> Chia đèn thành hai đợt sáng-chiều **không phải là cách giải quyết chính**, nhưng bạn có thể thử. Quan trọng hơn là xác định loại rêu và giảm lượng ánh sáng dư thừa.
> 
> **Về việc chia đèn:**
> - Tổng thời gian chiếu sáng quyết định lượng năng lượng cây nhận được. Chia hai đợt 4 tiếng vẫn là 8 tiếng, nên cây không hưởng lợi thêm.
> - Có một số người nói nghỉ giữa ngày giúp hạn chế rêu, nhưng bằng chứng chưa rõ ràng. Đây chỉ là mẹo phụ.
> - Nếu muốn thử, bạn có thể đặt 2 khung 3-4 tiếng (ví dụ 7-10h và 17-20h). Nhưng đừng kỳ vọng nó giải quyết được rêu.
> 
> **Hướng xử lý hiệu quả hơn:**
> 1. **Xác định loại …

### algae-12 · tank · ours wins (6.5 · 5)

**Asked:** Bể của tôi có nên chia đèn làm hai đợt, mỗi đợt không quá 4 tiếng không?

**Judge:** X dựa vào chính bể này: 8 tiếng bật liền, không CO₂, phân nước mỗi tuần. X cũng cho các bước làm theo thứ tự kèm cách theo dõi, nhưng ví dụ một đợt 5 tiếng lại trái với điều kiện mỗi đợt không quá 4 tiếng của người hỏi. Y có lịch mẫu hợp lý, nhưng lời khuyên chung chung, nhắc đến CO₂ mà bể không có, và kết thúc bằng câu hỏi lại về loại bể. / Y is the better answer. It uses this tank's facts (no CO₂, phân nước once a week, 8 tiếng straight) and says plainly that algae comes from too much light for the nutrients and CO₂, not from how the hours are split. It also gives clear steps and what to watch for. Its example schedule does break the 4-hour limit the hobbyist set. X is generic and padded with CO₂ and reef notes that don't apply, and it ends by asking what kind of tank it is.

**Ours lacks:** figures. **Plain lacks:** tank-fit, follow-up, plan.

**Ours** (read 2 pages):

> Có, bạn có thể chia đèn làm hai đợt, tổng cộng vẫn khoảng 8 tiếng mỗi ngày, và cây không bị hại vì việc đó. Cẩm nang nói đây là cách một số người chơi làm để bể có lúc nghỉ giữa ngày, còn bật liền một lần cũng ổn. Điều quan trọng hơn là tổng số giờ và việc không để đèn sáng qua đêm. Bể của bạn bật liền 8 tiếng, không có CO2 và phân nước 1 lần mỗi tuần, nên nếu tảo xuất hiện thì nguyên nhân dễ nhất là ánh sáng dư so với dinh dưỡng và CO2, chứ không phải do cách chia giờ.
> 1. Dùng ổ cắm hẹn giờ để đèn bật đúng hai khung, ví dụ 3 tiếng buổi sáng và 5 tiếng buổi tối, tổng không quá 8 tiếng.
> 2. Đặt…

**Plain** (1331 characters):

> Có, chia đèn thành hai đợt, mỗi đợt không quá 4 tiếng, là cách làm phổ biến và thường có lợi, nhất là với bể thủy sinh. Bạn nên giữ **tổng thời gian chiếu sáng khoảng 6–8 tiếng/ngày**, còn cách chia thì tùy mục đích.
> 
> **Lợi ích:**
> - Mô phỏng ánh sáng tự nhiên, có khoảng nghỉ giữa trưa hoặc khi trời có mây, giúp cá và cây đỡ căng thẳng hơn.
> - Có thể hạn chế rêu phát triển, vì rêu thường bùng phát khi đèn sáng liên tục quá lâu.
> - Giảm nhiệt độ bể vào giờ cao điểm nếu đèn tỏa nhiệt mạnh.
> 
> **Lưu ý:**
> - Nếu bể trồng cây, cây cần đủ tổng thời gian quang hợp, nên không nghỉ quá lâu. Khoảng nghỉ thườ…

