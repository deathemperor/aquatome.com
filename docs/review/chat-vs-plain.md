# The chat against plain Claude, on hard problems

2026-11-07, `packages/engine/scripts/chat-vs-plain.ts`. 47 questions from public Vietnamese hobby forums, reworded with no names (`packages/engine/scripts/hard-questions.vi.json`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and limits at commit `b41dac763`, claude-haiku-5-5, over https://aquatome.com's handbook. Plain: claude-haiku-5-5, the same effort, no system prompt, no tools, no handbook. Judge: claude-opus-5-5 through the Claude CLI, rubric version 1 (`chat-vs-plain-lib.ts`).

- **post:** both answer the whole forum post. **tank:** both get a short question; ours reads the reader's saved tank as the chat reads it today (size, fish and counts; not plants, light, CO₂ or notes), plain Claude only the question. The judge is told everything the post said about the tank.
- **Blind, as far as it goes:** the judge isn't told which answer is ours, and both lose the site's name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.
- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.
- **Failed:** when ours failed (the limits ran out, a call timed out) and plain answered, the reader got an error: plain wins it on every count, with no score.
- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).
- **Cost** per question, at list price: ours $0.0031, plain $0.0012. The judge runs on the owner's Claude accounts.

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post | 4 / 43 / 0 of 47, ours failed 2 | 3.4 · 6.9 | 4–40 | 3–44 | 1–46 | 7–30 | 6–32 | 45/45 |
| tank | 8 / 33 / 6 of 47, ours failed 1 | 4.0 · 5.5 | 12–31 | 13–15 | 4–39 | 12–17 | 13–21 | 40/46 |

## By problem

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post · algae | 1 / 10 / 0 of 11 | 3.8 · 6.8 | 1–9 | 1–10 | 1–10 | 2–7 | 2–6 | 11/11 |
| post · setup | 1 / 8 / 0 of 9, ours failed 1 | 2.6 · 7.2 | 1–8 | 0–9 | 0–9 | 2–7 | 0–8 | 8/8 |
| post · cycling | 0 / 8 / 0 of 8 | 3.7 · 7.0 | 0–6 | 0–8 | 0–8 | 1–3 | 2–5 | 8/8 |
| post · sick | 1 / 8 / 0 of 9, ours failed 1 | 3.7 · 7.0 | 1–8 | 1–8 | 0–9 | 1–7 | 0–6 | 8/8 |
| post · stocking | 1 / 9 / 0 of 10 | 3.1 · 6.5 | 1–9 | 1–9 | 0–10 | 1–6 | 2–7 | 10/10 |
| tank · algae | 2 / 5 / 4 of 11 | 4.7 · 5.3 | 5–3 | 2–0 | 0–8 | 6–1 | 5–1 | 7/11 |
| tank · setup | 1 / 8 / 0 of 9, ours failed 1 | 3.5 · 5.5 | 1–7 | 3–5 | 0–9 | 1–2 | 2–6 | 8/8 |
| tank · cycling | 3 / 5 / 0 of 8 | 4.6 · 5.6 | 3–5 | 1–2 | 2–6 | 2–3 | 3–3 | 8/8 |
| tank · sick | 0 / 9 / 0 of 9 | 3.3 · 6.2 | 0–9 | 0–6 | 0–9 | 0–7 | 0–6 | 9/9 |
| tank · stocking | 2 / 6 / 2 of 10 | 4.0 · 5.1 | 3–7 | 7–2 | 2–7 | 3–4 | 3–5 | 8/10 |

## What each lacks, as the judge tagged it

| | Ours | Plain |
| --- | --- | --- |
| post | plan 41, tank-fit 33, diagnosis 18, too-thin 17, too-long 14, follow-up 11, wrong 6, figures 4, asks-only 3, off-topic 2 | local 17, follow-up 12, too-long 10, diagnosis 9, tank-fit 9, figures 8, wrong 6, asks-only 2, unsafe 1 |
| tank | tank-fit 39, plan 32, too-long 16, too-thin 16, diagnosis 15, follow-up 12, figures 10, local 5, off-topic 5, wrong 4, asks-only 1 | tank-fit 46, diagnosis 18, local 13, too-long 12, asks-only 10, follow-up 6, figures 5, wrong 5, plan 3, unsafe 1 |

Tags: plan, diagnosis, tank-fit, figures, follow-up, local, too-thin, too-long, asks-only, wrong, unsafe, off-topic.

## Errors the judge found

- ours, algae-01 post: Calls 7 hours of light 'too long' but then recommends 8–10 hours a day. That contradicts itself and would give a new tank with algae more light, not less.
- ours, algae-01 post: 'Each block no more than 4 hours' is presented as a firm rule. It isn't standard practice, and split photoperiods are known to cause algae themselves.
- ours, algae-01 post: Never answers about the algae remover or the 2-day water changes beyond comparing them to the guide, and gives no steps for removing the algae.
- ours, algae-01 post: Says 7 hours of light in a row is 'quá lâu', then recommends 8–10 hours a day in total. That adds light to a new tank that already has algae, and the two statements contradict each other.
- ours, algae-01 post: 'Khoảng 90% ca' do thiếu CO2: the figure is made up and has no source.
- ours, algae-01 post: Never mentions the algaecide the hobbyist is using, though it can harm the bucep and nmc.
- plain, algae-01 post: Recommends Nerite snails for hair algae. Nerites hardly eat hair algae; Amano shrimp and SAE are the right choices.
- plain, algae-01 post: Blames the white NMC leaves on light burn. In a 2-week-old tank this is more likely the plant adjusting from emersed to submerged growth, or a lack of nitrogen or iron.
- plain, algae-01 post: Puts the main blame for the pale nmc leaves on light burn ('bị cháy/bạc lá'). In a new tank with strong light, pale new leaves usually come from too little CO₂ or nutrients (N, Fe), so this cause is weak.
- plain, algae-01 post: Asks about CO₂ only as an aside, when it is likely a key cause here.
- ours, algae-01 tank: 'không sáng liên tục quá 4 tiếng' – chia đèn thành nhiều đợt là mẹo gây tranh cãi, không phải quy tắc chuẩn, và đưa ra như thể chắc chắn
- ours, algae-01 tank: 'khoảng 90% trường hợp là do thiếu CO2' – con số tự đặt ra, không có nguồn
- ours, algae-01 tank: Khuyên nâng lên 8 tiếng trong khi người hỏi đang bật 7 tiếng và đã có rêu
- ours, algae-01 tank: "không sáng liên tục quá 4 tiếng": the 4-hour cap per lighting period is a made-up rule. Splitting the photoperiod is debated, not standard advice.
- ours, algae-01 tank: "khoảng 90% trường hợp là do thiếu CO2": the 90% figure has no source.
- ours, algae-01 tank: Saying algae eaters move on to eating plants and roots once the algae is gone, so they must be removed, is wrong for Amano shrimp, which don't harm healthy plants.
- ours, algae-01 tank: Advice about the first trim of stem plants doesn't apply here. Bucep and nmc aren't stem plants.
- plain, algae-01 tank: 'Cá rìu/cá Siamese algae eater' – cá rìu là cá hatchet, còn SAE ở VN thường gọi là cá bút chì
- plain, algae-01 tank: Thay nước '30–50% mỗi tuần' là quá thưa với bể mới set 2 tuần
- plain, algae-01 tank: Nói dùng H₂O₂ 'liều thấp' nhưng không đưa ra liều cụ thể
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": in Vietnam, cá rìu means hatchetfish. The SAE is usually called cá bút chì, so this name would send the hobbyist to buy the wrong fish.
- ours, algae-02 post: "Rêu râu đen thường do CO2, nên hãy kiểm tra CO2 bằng drop checker": the hobbyist never mentions CO₂ and is probably running low-tech, so this points them to the wrong check instead of cutting light hours and intensity.
- ours, algae-02 post: The 40 lumen/lít rule is a generic number that doesn't help with a low-light ráy + rêu tank that already has BBA, and the answer never actually recommends a light.
- ours, algae-02 post: It points to CO₂ as the cause and gives a 30 mg/l CO₂ target with a drop checker, which is irrelevant to a likely no-CO₂ ráy/moss tank.
- ours, algae-02 post: It suggests brushing 3% hydrogen peroxide on BBA, which risks killing the moss the hobbyist grows.
- ours, algae-02 post: Choosing a light by 40 lumen per litre ignores tank depth and the fact that ráy and moss need little light.
- plain, algae-02 post: "rau ngổ" listed as a floating plant: it is a stem plant, not a floating plant.
- plain, algae-02 post: "Dòng A361" suggested as a replacement: it is built for 36cm tanks and does not fit a 70cm tank.
- plain, algae-02 post: 'Chihiros WRGB II Slim' is offered as a gentler light, but it is stronger than an A601 Plus, so it would not help with BBA.
- plain, algae-02 post: 'A361' is a 36cm light and would not cover a 70cm tank.
- plain, algae-02 post: 'rau ngổ' is listed as a floating plant, but it is a stem plant, not a true floating plant.
- ours, algae-02 tank: "Không hẳn là do đèn": bể này chỉ có ráy và rêu, là những cây mọc chậm, không có CO₂ và không châm phân, lại dùng đèn A601 plus khá mạnh. Đèn mạnh vì thế là một nguyên nhân quan trọng, không nên gạt đi.
- ours, algae-02 tank: "hút nền kỹ hơn": bể không có nền nên lời khuyên này không áp dụng được.
- ours, algae-02 tank: Tells them to 'hút nền kỹ hơn', but the tank has no substrate
- ours, algae-02 tank: "Cây khỏe còn tiết ra enzyme giúp đẩy lùi rêu hại" is stated as fact when the evidence for it is weak
- plain, algae-02 tank: "cá cày Xiêm": tên gọi cá Siamese (SAE) này không quen thuộc với dân chơi thủy sinh ở Việt Nam.
- plain, algae-02 tank: "cá cày Xiêm" is not a name Vietnamese hobbyists use for the Siamese algae eater; they say cá bút chì or SAE
- plain, algae-02 tank: Asks for the light type, which is already known: the tank uses a Chihiros A601 plus
- ours, algae-03 post: "Cẩm nang không nói về công suất đèn Odyssea dual nên không trả lời được đèn có dư không": X dodges the main light question, even though 4 hours with one tube is clearly fine for a new tank.
- plain, algae-03 post: Treats the Odyssea dual as a possible UV lamp and says to run both tubes all the time. It is an LED or tube light for planted tanks, so this advice would give the tank a lot more light and make the algae worse.
- plain, algae-03 post: "Ngừng thay nước hằng ngày... chỉ 10-15%": this goes against the usual practice for a planted tank set up 3 days ago, which is frequent large water changes to remove nutrients leaching from the soil.
- plain, algae-03 post: Doesn't recognise trân châu ngọc trai as a carpet plant and asks the hobbyist whether it is a plant.
- plain, algae-03 post: Treats the Odyssea dual as a possible UV lamp and says to run both tubes all day. It is a lighting fixture, so following that would make the algae worse.
- plain, algae-03 post: "Đừng thay nước mỗi ngày": the usual practice for a newly set planted tank is to change about 30% every day in the first week to keep nutrients down, and X tells them to stop.
- plain, algae-03 post: It doesn't recognise trân châu ngọc trai as a carpeting plant, asks what it is, and gives feeding advice as if there were fish.
- ours, algae-03 tank: The stray word "Ceh" is a typo that makes the opening sentence read oddly.
- ours, algae-03 tank: It tells them to "rút ngắn thời gian bật đèn", but they already cut the light to 4 hours a day with one bulb removed, so the advice doesn't fit their tank.
- ours, algae-03 tank: Typo 'Ceh' in the opening paragraph.
- ours, algae-03 tank: The guide excerpt repeats the opening summary almost word for word, which is padding the reader has to wade through.
- plain, algae-03 tank: It says blackout is "không hại gì cho bể". That overstates it: a long blackout stresses carpet plants like trân châu ngọc trai.
- plain, algae-03 tank: 'Sau khi hết xanh, chỉ bật 6-8 tiếng/ngày' — the hobbyist already cut the light to 4h, so this would raise it again for a new tank that is blooming.
- plain, algae-03 tank: Treats leftover fish food as the main cause, but this is a brand-new planted tank that may have no fish yet. The likely sources are the substrate/soil releasing nutrients and too much light.
- ours, algae-04 post: 'thường xuất hiện từ tuần thứ 3–4' does not match this tank, which already has brown algae at day 7
- ours, algae-04 post: Suggests adding otto to a 7-day-old tank; otos are delicate and starve or die in an immature tank
- ours, algae-04 post: The '90% trường hợp' figure is stated with no source
- ours, algae-04 post: The guide FAQ says to neutralise hydrogen peroxide with 2–3x the dechlorinator dose, which is dubious and has nothing to do with this problem
- ours, algae-04 post: Bảo rêu nâu thường xuất hiện từ tuần 3–4 nhưng bể của bạn mới 7 ngày, lại khuyên 'đừng thay đổi lung tung' mà không nói gì về việc bạn đang thay 30% nước mỗi ngày
- plain, algae-04 post: 'nước máy ở Việt Nam thường có hàm lượng silicate khá cao' is an overgeneralisation with no source
- plain, algae-04 post: 'Nhiệt độ thấp' as a cause hardly applies to a tank in Vietnam's heat
- plain, algae-04 post: Claims daily water changes keep the bacteria from settling, but the bacteria live mostly in the filter and substrate, and frequent changes in the first weeks are a normal practice
- plain, algae-04 post: "nước máy ở Việt Nam thường có hàm lượng silicate khá cao": nói chắc mà không có nguồn, mức silicate khác nhau tùy vùng
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển": hầu như không liên quan với hồ ở Việt Nam, nơi nước thường ấm
- plain, algae-04 post: Nói thay nước hằng ngày làm hệ vi sinh chậm ổn định là chưa đúng hẳn: vi sinh sống chủ yếu trong lọc và nền, nên thay nhiều trong giai đoạn đầu vẫn thường được khuyên
- ours, algae-04 tank: Phần trích FAQ lan sang những chuyện không liên quan (oxy già, rêu chùm đen, cá bút chì, Cladophora), người đọc phải lướt qua cả đống chữ thừa
- plain, algae-04 tank: "dùng bộ lọc than hoạt tính ... khử silicat": than hoạt tính không loại được silicat
- plain, algae-04 tank: "Cá chuột Otocinclus": ở VN 'cá chuột' là Corydoras; Otocinclus gọi là cá otto
- plain, algae-04 tank: "Thay 20-30% mỗi tuần": người này đang thay 30% mỗi ngày, nên lời khuyên này không hợp
- plain, algae-04 tank: Hỏi lại thể tích bể và có cây không, trong khi app đã có sẵn thông tin này
- plain, algae-04 tank: "dùng bộ lọc than hoạt tính... khử silicat": than hoạt tính không loại được silicat, chỉ có resin chuyên dụng mới làm được việc này
- plain, algae-04 tank: "Thay 20-30% mỗi tuần": người chơi đang thay 30% mỗi ngày rồi, nên lời khuyên này không hợp và còn có thể hiểu là bảo họ thay ít đi
- plain, algae-04 tank: Hỏi lại thể tích bể, cây và đèn, trong khi app đã có sẵn các thông tin này
- ours, algae-05 post: Pastes FAQ items that don't apply to this tank (dosing hydrogen peroxide, pencil fish for black beard algae, Cladophora), which pads the answer and could mislead
- ours, algae-05 post: It says outright that it can't answer the room-light question or the nerita question, both of which the hobbyist asked directly
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": rau thơm là cây thủy sinh hút dinh dưỡng, bản thân nó không làm dư dinh dưỡng.
- plain, algae-05 post: 'Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa' is a guess with no basis; a growing plant takes up nutrients rather than adding them
- plain, algae-05 post: 'Ngưng cho ăn... là nguyên nhân phổ biến nhất' assumes there are fish being fed, which the hobbyist never mentioned
- plain, algae-05 tank: "Có thể dùng H₂O₂ nhỏ giọt": gives no dose, and too much H₂O₂ can harm the nerite snails and soft plants.
- plain, algae-05 tank: "Ốc: ốc nerite": recommends a snail they already keep, and doesn't notice their nerites are lying still, which may mean the snails are stressed.
- plain, algae-05 tank: "Thay nước 25–40% và lặp lại vài lần": they already change water every 2 days, so this adds nothing and ignores what they've tried.
- plain, algae-05 tank: Says diatoms are linked to weak light. In a 4-week-old tank the main cause is that the tank is still maturing.
- plain, algae-05 tank: Suggests adding nerite snails, but the hobbyist already keeps them. It also doesn't notice that their nerites are lying still.
- plain, algae-05 tank: Says to use H₂O₂ but gives no dose.
- plain, algae-05 tank: Calls the Siamese algae eater 'cá chùy'. That isn't a common Vietnamese name for this fish.
- ours, algae-06 post: "Lọc thùng thực tế thường chỉ chạy dưới một nửa lưu lượng ghi trên hộp": this is stated as a general rule but is an overclaim. The quoted guide only says the real flow is lower than the box figure.
- ours, algae-06 post: 'Vàng \| CO2 bão hòa, rất hiếm gặp': gây hiểu sai. Màu vàng nghĩa là dư CO2, nguy hiểm cho cá và tép. Ở mức 6-7 giọt/giây thì rất dễ gặp chứ không hề hiếm.
- ours, algae-06 post: Không trả lời được nguyên nhân tiếng lọc xọc và có nguy cơ tép bị ngạt, dù đây là câu hỏi chính về an toàn.
- plain, algae-06 post: "Vàng-xanh lá nhẹ là khoảng 20-30 mg/L": the drop checker colours are mixed up. Lime/yellow-green already means CO2 is high, and green is about 30 mg/L.
- plain, algae-06 post: "Đặt diffuser ở vị trí cách đầu hút lọc chính khoảng 5-10 cm": a diffuser that close lets the intake suck in bubbles, which is the problem the answer is trying to fix.
- plain, algae-06 post: "ban đêm... CO2 tích tụ": the reason given is off. With the CO2 cut at night, the risk is low oxygen from respiration, not CO2 building up from injection.
- plain, algae-06 post: Y never says to bleed the trapped air out of the 702B canister, which is the direct fix for the rattling.
- plain, algae-06 post: 'Vàng-xanh lá nhẹ là khoảng 20-30 mg/L': lệch nhẹ. Xanh lá thường ứng với khoảng 30 mg/L, còn ngả vàng là đã vượt mức đó.
- plain, algae-06 post: 'rêu sợi, rêu sừng hươu và rêu lông tơ thường kém bền khi bị loại bỏ thủ công': câu khó hiểu và không đúng. Gỡ tay không diệt hết các loại rêu này, nhất là rêu sừng hươu.
- ours, algae-06 tank: "thiếu CO2 là nguyên nhân chính khiến rêu tóc mọc" oversimplifies: rêu tóc thường do dư đèn/dinh dưỡng mất cân bằng với CO2
- ours, algae-06 tank: Đoạn trích nói thuốc diệt rêu chùm đen "không ảnh hưởng tới cá, tép". Loại thuốc gốc glutaraldehyde vẫn có thể hại tép, mà bể này có nuôi tép
- ours, algae-06 tank: "Liều lượng tính vừa phải... không ảnh hưởng tới cá, tép": thuốc diệt rêu gốc glutaraldehyde có thể hại tép khi bơm cục bộ hoặc dùng quá liều, mà bể này có tép.
- ours, algae-06 tank: Không nói gì về rêu lông tơ, dù đây là một trong ba loại rêu người hỏi nêu.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3" is wrong; the usual target with CO2 is a drop of about 1 pH unit, so following this gives far too little CO2
- plain, algae-06 tank: "khuấy nước tốt để CO2... không thoát ra ngoài" is contradictory: strong surface agitation drives CO2 out
- plain, algae-06 tank: Cá tỳ bà grows too big for a 60 cm tank and does little against fuzz algae; rau muống nước is an odd plant to suggest
- plain, algae-06 tank: Asks for tank details the app already holds
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3": khoảng 30 ppm CO₂ cần pH giảm khoảng 1 đơn vị. Giảm 0,2–0,3 là thiếu CO₂ nặng.
- plain, algae-06 tank: "Đảm bảo khuấy nước tốt để CO₂ hòa tan và không thoát ra ngoài" tự mâu thuẫn: khuấy mặt nước mạnh làm CO₂ thoát ra nhanh hơn.
- plain, algae-06 tank: Khuyên dùng cá tỳ bà cho rêu tóc và rêu lông tơ là không thực tế: cá lớn rất to, không hợp bể 60 cm, cũng ăn rêu dạng sợi kém.
- plain, algae-06 tank: Hỏi lại kích thước bể và tình trạng CO₂ trong khi các thông tin này đã có.
- ours, algae-07 post: Excerpts push Easy Green / Easy Root Tabs, which are hard to find in Vietnam and have nothing to do with this high-tech Dutch-style tank
- ours, algae-07 post: "không xác định được nguyên nhân": it gives up on the diagnosis even though the clues are clear (100% daily water changes, the light and CO2 levels)
- ours, algae-07 post: The quoted nitrogen-deficiency and melting excerpts describe older leaves yellowing. They don't match twisted, white new tips, so they mislead more than they help.
- ours, algae-07 post: Recommends Easy Green and Easy Root Tabs, which are hard to find in Vietnam, and doesn't address the hobbyist's CO2 or light settings at all.
- plain, algae-07 post: Fluval Stratum is not an inert substrate: it is a soil that carries some nutrients
- plain, algae-07 post: It assumes the hobbyist "không bón phân đều", which they never said. It also misses calcium/boron shortage and low GH, the usual causes of twisted, white new tips
- plain, algae-07 post: "Fluval Stratum... không có dinh dưỡng": Stratum is an active soil, not an inert substrate like Flourite or gravel.
- plain, algae-07 post: Assumes the hobbyist is "không bón phân đều" and blames the 2 weeks of water changes, though the problems continued across 5 tanks. It skips calcium/GH and boron, the usual cause of twisted, white, deformed tips, and only mentions measuring GH in passing.
- ours, algae-07 tank: The excerpts blame too few water changes for the algae, but this hobbyist already changed more than 100% of the water every day, so that cause doesn't fit
- ours, algae-07 tank: 'Carbon lỏng... chỉ châm một ít' — không nói liều lượng, và không nhắc rằng carbon lỏng có thể làm hại một số loài cây.
- plain, algae-07 tank: It names iron deficiency as the cause of twisted, white tips. Iron shortage turns new leaves pale or yellow; twisted, deformed tips point to calcium or boron, or to unstable CO₂
- plain, algae-07 tank: It suggests apple snails (ốc táo), which eat stem plants in a planted tank
- plain, algae-07 tank: It suggests plecos (cá tỳ bà) and water hyacinth (bèo tây) without regard to a Dutch-style stem-plant tank
- plain, algae-07 tank: Weekly 20–30% water changes are generic advice that ignores the hobbyist's daily 100% changes
- plain, algae-07 tank: 'Ốc táo: ăn rêu xanh' — ốc táo ăn cây, không nên thả vào bể thủy sinh cây Hà Lan.
- plain, algae-07 tank: 'Trồng cây nổi như bèo tây' — bèo tây quá lớn, không hợp với bể thủy sinh trong nhà.
- plain, algae-07 tank: Hỏi lại loại đèn, CO₂ và số giờ chiếu sáng dù app đã có những thông tin này; câu trả lời bỏ qua nền giàu dưỡng và việc đã thay 100% nước mỗi ngày.
- plain, algae-08 post: "Bể xi măng non thường làm pH tăng": here 'bể đúc' means a seamless glass tank (bể kính đúc), not a cement tank, so this cause doesn't apply.
- plain, algae-08 post: "khoảng 26 con (... 9 mún, 5 mún đỏ)": this adds the old stocking to the new one. The tank now has about 24 fish.
- plain, algae-08 post: "bèo tây": water hyacinth is too big for a 50cm tank. Small floating plants like bèo cái or bèo tấm would fit better.
- plain, algae-08 post: Counts '9 mún' in with the current stock to get 26 fish. The 9 platies were the starting stock, and the tank now holds 24 fish (10 guppies, 9 zebra danios, 5 red platies).
- plain, algae-08 post: Reads 'bể đúc' as a new cement tank that raises pH. In Vietnam 'bể đúc' means a seamless one-piece glass tank, so this cause doesn't apply.
- plain, algae-08 post: Suggests bèo tây (water hyacinth), which is too large for a 50cm tank.
- plain, algae-08 tank: "nước máy có nitrate/phosphate cao, hãy để nước lắng": để nước lắng chỉ giúp bay clo, không giảm nitrat hay phosphat
- plain, algae-08 tank: "cỏ đuôi chồn (Hornwort), rong đuôi chó": Hornwort chính là rong đuôi chó, nên cùng một cây bị kể hai lần
- plain, algae-08 tank: "ốc nhồi" và "cory" để ăn tảo nâu: ốc nhồi phá cây và ít khi được nuôi để ăn tảo bám, còn cory không ăn tảo trên kính
- plain, algae-08 tank: "nếu nước máy có nitrate/phosphate cao, hãy để nước lắng": để nước lắng không làm giảm nitrate hay phosphate, nó chỉ giúp clo bay bớt.
- plain, algae-08 tank: "Nuôi ốc (ốc nhồi...)": ốc nhồi ăn cây và làm bẩn bể, không phải loài ăn tảo nên thả.
- plain, algae-08 tank: "otocinclus": cá này cần bể đã ổn định, khó nuôi trong bể mới 8 tuần lại ít tảo bám để ăn.
- ours, algae-09 post: "dời bể khỏi chỗ nắng": the hobbyist said the tank is big and has to stay on the balcony, so moving it isn't realistic. Shading is the practical fix.
- ours, algae-09 post: Excerpt says to "rút ngắn thời gian bật đèn": an outdoor tank has no aquarium light to shorten.
- ours, algae-09 post: 'dời bể khỏi chỗ nắng': the hobbyist said the tank is too big and has to stay on the balcony, so moving it isn't practical.
- ours, algae-09 post: The blackout time contradicts itself ('che ít nhất một tuần' vs 'không quá 7 ngày'), which leaves the reader unsure what to do.
- ours, algae-09 post: Generic indoor advice like 'rút ngắn thời gian bật đèn' and 'cây sẽ chịu khổ' doesn't apply to an outdoor, sunlit tank with no plants.
- plain, algae-09 post: Assumes 'bể đúc' could be a new cement tank leaching high pH; after 2-3 months of running, and with 'bể đúc' often meaning a one-piece molded tank, this is a weak lead. It is hedged, though.
- ours, algae-09 tank: "dời bể khỏi chỗ nắng chiếu": a big concrete tank can't be moved; it needs a shade net or a roof over it instead
- plain, algae-09 tank: Blames a broken nitrogen cycle as the main cause ("tảo bùng lên khi hệ vi sinh tái lập"). For a bare tank in direct balcony sun, the likely cause is sunlight feeding the algae, then oxygen crashing
- plain, algae-09 tank: "ốc nerite, cá otto" do not clear green water (free-floating algae)
- plain, algae-09 tank: Misses the strong direct sun: it only mentions "gần cửa sổ" or "đèn bật quá 8 giờ"
- plain, algae-09 tank: "tảo bùng lên khi hệ vi sinh tái lập": this cause is made up. Green water in an outdoor tank comes from sunlight plus nutrients, not from bacteria re-establishing themselves.
- plain, algae-09 tank: "đèn bật quá 8 giờ/ngày. Giảm còn 6–8 giờ": this doesn't apply. The tank sits on a balcony in natural sunlight, so there is no light timer to cut.
- ours, algae-10 post: Says it can't tell whether angelfish eat shrimp, even though the hobbyist already reported it and it's well known. This dodges their main constraint.
- ours, algae-10 post: Cutting light to 2–3 hours a day is advice for a newly set-up tank. Applied without knowing how old the tank is, it can starve the plants if kept up.
- ours, algae-10 post: Calls it diatoms outright, but the hobbyist described fine filaments, which could be brown hair algae trapping mulm; diatoms don't form threads
- ours, algae-10 post: Cutting the light to 2–3 h/day is taken from a guide about new tanks and could starve the plants in an established, densely planted tank
- plain, algae-10 post: 'Ốc nerite (ốc núi, ốc táo)': ốc táo is the apple snail, not a nerite, so this confuses which snail to buy.
- plain, algae-10 post: 'cá nhớt Siamese (cá chét đuôi đỏ)': these are not the Vietnamese names for the Siamese algae eater (usually cá bút chì), and it eats little diatom algae anyway.
- plain, algae-10 post: Calls hornwort 'rêu' (moss) and suggests rau muống as a tank plant; both are odd or loose.
- plain, algae-10 post: 'Ốc nerite (ốc núi, ốc táo)': ốc táo is the apple snail, not nerite, so the hobbyist could buy the wrong snail
- plain, algae-10 post: 'rêu hornwort': hornwort (rong đuôi chồn) is a stem plant, not a moss
- plain, algae-10 post: 'cá chét đuôi đỏ' is the wrong common name for the Siamese algae eater; 'rau muống' is an odd choice of fast-growing plant for a fish tank
- ours, algae-10 tank: It hands the leaves to "cá, tép hoặc ốc" to clean, but the user already said cá thần tiên eat the shrimp.
- ours, algae-10 tank: It treats the problem as new-tank diatoms that will clear on their own and ignores that the user describes it as "sợi" (threads).
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus": treats tỳ bà (pleco) and otto as the same fish, but they are different fish.
- plain, algae-10 tank: "nhiều loại không đẻ trứng trong nước ngọt": nerite snails do lay eggs in fresh water. The eggs just don't hatch.
- plain, algae-10 tank: H₂O₂ "liều thấp": no dose is given, so the step is risky and hard to follow.
- plain, algae-10 tank: Asks what fish they keep, though the tank holds angelfish, and suggests neon. Angelfish eat neon.
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus" treats tỳ bà (pleco) and otto as the same fish, but they are different fish.
- plain, algae-10 tank: The H₂O₂ step only says "liều thấp" and gives no actual dose, which is risky.
- plain, algae-10 tank: It doesn't say that cá thần tiên is a cichlid that eats shrimp. Instead it asks what fish they keep, even though the user already said.
- plain, algae-11 post: Y suggests a dechlorinator containing sodium thiosulfate as a chloramine remover, but thiosulfate alone only breaks the chloramine and leaves the ammonia in the water. It also puts too much weight on chloramine: Vietnamese tap water is mostly treated with chlorine.
- plain, algae-11 post: 'chọn chất khử ghi rõ khử chloramine, ví dụ sản phẩm có chứa sodium thiosulfate': thiosulfate alone breaks chloramine but leaves the ammonia, so it doesn't fully treat chloramine. Chloramine is also uncommon in Vietnamese tap water, so it gets too much weight here.
- ours, algae-11 tank: "Một nguồn bảo che ít nhất một tuần, nguồn khác bảo không quá 7 ngày" – the two sources conflict, so the reader gets no usable number for how long to keep the tank covered
- plain, algae-11 tank: "để bể chạy 3–6 tuần với... không cá": a tank with no fish and no ammonia source won't cycle, and the answer doesn't say to add one.
- plain, algae-11 tank: "cho ăn lượng cá ăn hết trong 2–3 phút": this doesn't suit a cá dọn bể, which grazes slowly on the bottom.
- ours, setup-01 post: Không nói rõ việc bật đèn liên tục 3 ngày đầu như bên setup bảo là sai và dễ gây bùng rêu
- ours, setup-01 post: Đoạn trích có bước 'Nếu dùng lọc thùng, lắp thêm lọc phụ', không liên quan vì người hỏi không có lọc thùng
- ours, setup-01 post: It doesn't answer 4 of the 6 questions (heater, CO2, filter, water changes). The heater question matters most in Hanoi's cold season.
- ours, setup-01 post: The quoted guide excerpt about adding a pre-filter to a canister filter (lọc thùng) is irrelevant: the hobbyist has no canister and no cabinet for one.
- plain, setup-01 post: 'Không thay nhiều' khi đang chạy chu trình hơi bảo thủ: thay nước không làm mất vi sinh, vì vi sinh nằm chủ yếu trên vật liệu lọc chứ không trôi theo nước
- plain, setup-01 post: "khoảng 150–200kg" is a little low for a 1m tank (about 180–200L of water plus glass and substrate, likely 220kg or more). It doesn't change the advice to check the stand.
- plain, setup-01 post: It never says outright that leaving the light on for 3 days straight, as the setup shop said, is a bad idea. It only implies it by recommending a gradual ramp-up instead.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar là đèn cao cấp, thường đắt hơn Chihiros, không phải lựa chọn giá mềm
- plain, setup-02 post: "Sunsun HW-304B": lưu lượng khoảng 1400 L/h, dành cho bể lớn, quá cỡ với bể 96 lít so với mức 400–600 L/h chính nó đề xuất
- plain, setup-02 post: Hiểu "la hán" là cá la hán trong khi ở đây khả năng cao là tên một loại cây trong danh sách cây (có rào đón nhưng lạc đề)
- plain, setup-02 post: "Nếu bạn định nuôi cá la hán (cichlid)": the hobbyist listed la hán among the plants for a bonsai layout, so reading it as a flowerhorn fish is a misreading.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar is a premium brand and is not cheaper than Chihiros.
- plain, setup-02 post: Sunsun HW-304B is rated well above 400–600 L/h, so it is stronger than the flow X itself recommends for moss and pearlweed.
- plain, setup-02 tank: '0,5–1 W/lít' cho đèn LED: đây là quy tắc cũ thời đèn huỳnh quang, với LED thì quá cao (khoảng 50–96 W cho bể 96 lít), dễ bùng rêu hại.
- plain, setup-02 tank: Bảng chọn lọc theo thể tích xếp bể 96 lít của họ vào nhóm lọc treo, trong khi bể thủy sinh bố cục bonsai 60 cm nên dùng lọc thùng.
- plain, setup-02 tank: "0,5–1 W/lít" is an outdated rule of thumb. For a 96 L tank it gives 48–96 W of LED, which is far too much for moss, anubias (la hán) and ráy, and would invite algae.
- plain, setup-02 tank: Its size bands put a 96 L planted tank in the hang-on-back range. In Vietnam most people would run a canister on a 60 cm planted tank.
- plain, setup-03 post: "Có thể dùng cá Otocinclus để dọn rêu tảo": Otocinclus does poorly in a newly set-up tank with little biofilm, so a beginner shouldn't add them until the tank has run for a few months.
- plain, setup-03 post: Cycling plan: it waits 3-4 weeks for ammonia and nitrite to read 0 but never says to add an ammonia source (a little fish food, or the bacteria product sold here as 'vi sinh'). Without one, the tank won't actually cycle.
- plain, setup-03 post: "Cá ngọc trai (Celestial pearl danio), Galaxy rasbora" is listed as two fish, but they are the same species (Danio margaritatus). In Vietnam it is usually sold as cá thiên hà.
- plain, setup-03 post: It says to let the tank run 3-4 weeks until ammonia and nitrite read 0, but gives no ammonia source. Without a source such as fish food, pure ammonia or old filter media, the tank does not really cycle, so the zero readings can mislead.
- plain, setup-03 post: It suggests Otocinclus for a new tank. Otos are fragile and need an established tank with algae, so they should go in last.
- ours, setup-03 tank: Gives a 15-million budget breakdown and prices in euros, which don't help with a 3–4 million budget in Vietnam
- ours, setup-03 tank: Suggests DIY CO2 and CO2 timing to a beginner who only has an empty tank and wants a simple setup for small fish; that's off-priority
- ours, setup-03 tank: Nói không đưa ra được danh sách cho 3-4 triệu rồi dán trích dẫn tính giá bằng euro và bảng chia ngân sách 15 triệu: không hợp với ngân sách của người hỏi.
- ours, setup-03 tank: Đẩy sang CO₂ tự chế và đất ao trong khi người hỏi chỉ cần một bể đơn giản nuôi đàn cá nhỏ: lạc đề và không cần thiết với người mới.
- plain, setup-03 tank: 'Trân châu' (a carpeting plant) is listed as easy for beginners, but it usually needs strong light and CO2 to grow well
- plain, setup-03 tank: Crystal red shrimp are sensitive and not a good pick for a beginner's new tank
- plain, setup-03 tank: 'lọc hộp kiểu HOB' is mislabelled: HOB means a hang-on-back filter, not a canister filter
- plain, setup-03 tank: "Lọc hộp kiểu HOB" nhầm loại lọc: HOB là lọc treo thành bể, không phải lọc thùng (lọc hộp).
- plain, setup-03 tank: Xếp "trân châu" vào nhóm cây dễ cho người mới là sai: cây trải thảm này thường cần CO₂ và đèn mạnh.
- plain, setup-03 tank: Gợi ý tép crystal red cho người mới là không hợp: tép này nhạy với chất lượng nước và cần nền và nước riêng.
- plain, setup-04 post: "thường do thiếu ánh sáng" (rêu nâu): Fissidens bị nâu thường do nước nóng hoặc bẩn hơn là do thiếu sáng, nên nêu thiếu sáng là nguyên nhân chính thì chưa chuẩn
- plain, setup-04 post: "25–35 W LED" is on the high side for a low-tech tank with no CO2. Without CO2 that much light invites algae, though it's only a small slip.
- ours, setup-05 tank: 'chiếu 12 đến 15 tiếng mỗi ngày' để ép đỏ: kéo dài quá mức trên bể 120cm có rêu và ráy rất dễ bùng rêu hại; 7–8 tiếng là mức hợp lý
- ours, setup-05 tank: Hỏi lại loại đèn dù họ đã ghi T5HO 4 bóng
- ours, setup-05 tank: "chiếu 12 đến 15 tiếng mỗi ngày" để ép đỏ: thời gian chiếu này quá dài và dễ gây bùng rêu hại, nhất là trên bể 300 lít dùng 4 bóng T5HO.
- ours, setup-05 tank: Bỏ qua phần hỏi về kg nền dù có thể tính được từ kích thước bể, rồi lại hỏi loại đèn trong khi bể đã ghi rõ T5HO 4 bóng.
- plain, setup-05 tank: 'phủ sỏi hoặc cát mịn lên trên' nền dinh dưỡng: với phân nền Aquafor + soil, thường phủ soil lên trên chứ không phủ sỏi/cát
- plain, setup-05 tank: Lấy ví dụ bể 60×30 thay vì bể 120×50 của họ, và hỏi lại kích thước dù đã có sẵn
- plain, setup-05 tank: "nền dinh dưỡng lót dưới, phủ sỏi hoặc cát mịn lên trên": người chơi thủy sinh thường dùng phân nền như Aqua Soil làm lớp trên cùng, không phủ sỏi lên. Lời khuyên này cũng không khớp với nền trộn + Aquafor mà người hỏi định dùng.
- ours, setup-06 post: "một máng kẹp thành bể khoảng 30 cm là đủ, nên bể này không cần 4 bóng": the rule about how many fixtures cover the tank's width says nothing about 2 vs 4 tubes in one Odyssea fixture, which spans the whole tank, so the conclusion doesn't follow.
- ours, setup-06 post: "một máng kẹp thành bể khoảng 30 cm là đủ, nên bể này không cần 4 bóng" applies a rule about how many fixtures to use to how many tubes one fixture has. That's the wrong logic, and it ignores the red stem plant that needs strong light.
- ours, setup-06 post: It never answers whether to put sand or gravel at the front. It only quotes guide passages that don't cover this case.
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm nhiều khi xuống đáy": 30 cm is the front-to-back width. Light has to travel through the 36 cm height.
- plain, setup-06 post: "Rêu, bucep và ráy ở gần nền cần đủ sáng": these are low-light plants, so this is a weak reason to pick 4 tubes.
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm nhiều khi xuống đáy" mixes up front-to-back width (30 cm) with water height (36 cm).
- plain, setup-06 post: "Nên chọn đèn LED" ignores that Odyssea 2-tube and 4-tube fixtures are T5 fluorescent, so the advice doesn't match the product they asked about.
- ours, setup-06 tank: Tính theo ví dụ bể 60×30×30 cm (54 L) trong khi bể thật cao 36 cm, khoảng 65 L, và chỉ nói số máng đèn chứ không trả lời câu 2 bóng hay 4 bóng
- plain, setup-06 tank: "phủ một lớp lưới hoặc giấy ngăn": giấy sẽ mục trong nước. Nên dùng túi lưới, hoặc kè bằng đá như đá cuội họ đang dùng.
- plain, setup-06 tank: "phủ một lớp lưới hoặc giấy ngăn rồi mới trải sạn lên trên": giấy sẽ mục trong nước, và cách người chơi thường làm là quây đá hoặc kính chắn (bạn này đã quây bằng đá cuội rồi)
- plain, setup-06 tank: Xếp "cá hoàng kim" vào nhóm cá đào bới cùng cichlid là không đúng
- ours, setup-07 post: 'cây bán cạn chỉ phát triển tốt khi nước khoảng 26–28°C, trên 30°C thì gần như không lớn': không có cơ sở. Dương xỉ, cỏ đồng tiền và khoai lang vẫn lớn tốt khi trời nóng ở Việt Nam.
- ours, setup-07 post: Bỏ ngỏ đúng phần bạn hỏi là lọc thác 8W, lọc vi sinh dùng sứ và cá bống, mà lại chèn đoạn trích tính lọc cho cá Oscar, không liên quan đến bể này.
- ours, setup-07 post: 'cây bán cạn chỉ phát triển tốt khi nước khoảng 26–28°C, trên 30°C thì gần như không lớn' — khái quát hóa không có cơ sở cho các loại cây như dương xỉ, cỏ đồng tiền, khoai lang
- ours, setup-07 post: Trích phần tính vật liệu lọc theo cá Oscar không liên quan đến bể 10 con bảy màu
- plain, setup-07 post: 'Khoai lang... trồng ở phần đất cao để rễ không bị ngập lâu': khoai lang thủy canh vẫn sống tốt dù rễ ngập trong nước.
- plain, setup-07 post: 'luộc lũa... tránh rong nâu': tanin chỉ làm nước ngả vàng chứ không gây rêu nâu (tảo cát).
- plain, setup-07 post: Gợi ý Otocinclus cho bể mới set là rủi ro, vì loài này dễ chết đói khi bể chưa đủ rêu.
- plain, setup-07 post: 'loại bớt tanin và tránh rong nâu' — tannin từ lũa không gây rêu nâu, chỉ làm nước ngả màu trà
- plain, setup-07 post: 'lanh tô phía trên hõm chịu được tải' — tải của bể dồn xuống đáy hõm/bệ cửa sổ, không dồn lên lanh tô
- ours, setup-07 tank: "1 bống dọn bể": the number of bống isn't recorded anywhere, so the count is made up
- ours, setup-08 post: Suggests downsizing to a 40x30x30 tank, but the hobbyist already owns this tank. It never says what to do with the 5 mm tank they have, such as not filling it all the way or re-gluing it with thicker glass.
- ours, setup-08 post: It bases the 8 mm figure only on the tank's length (60–80 cm) and never says the 45 cm height is what makes it risky. The conclusion is right, but the reason is incomplete.
- plain, setup-08 post: Says "Kính 5 ly là ổn, không quá mỏng" (5 mm glass is fine, not too thin). That is wrong: a tank 60 cm long and 45 cm tall holds about 120 L, and in Vietnam this size is usually built with 8 mm glass. 5 mm is a real risk of bulging or bursting, especially once heavy substrate and rock go in.
- plain, setup-08 post: Says Betta or dwarf gourami can be kept as "một cặp nếu bể đủ rộng" (a pair if the tank is big enough). Male Betta fight, so this needs a warning.
- plain, setup-08 post: 'Kính 5 ly là ổn, không quá mỏng... đủ an toàn' — a tank 45 cm tall holding about 120 L normally needs 8 mm glass. 5 mm leaves a thin safety margin and risks a burst, especially once substrate and rock go in.
- plain, setup-08 post: 'Lót mút xốp... 3–5 mm' — fine for a rimmed tank, but it doesn't make up for the thin glass, and X gives no warning about it.
- ours, setup-08 tank: Gives specs for a 57 L nano and suggests building a mica tank, but the hobbyist already has a 60×45×45 tank (about 120 L). A 300 L/h pump is only about 2.5 turnovers an hour for that volume.
- ours, setup-08 tank: Doesn't answer the fish half of the question at all.
- ours, setup-08 tank: Suggests building a 57 L mica nano tank when the hobbyist already has a tank (60×45×45, about 120 L), so the 300 L/h pump figure doesn't fit their tank
- ours, setup-08 tank: Doesn't answer the fish question at all
- plain, setup-08 tank: "Cần sưởi 25–300W" for most tropical fish: in Vietnam's heat a heater usually isn't needed, and listing it adds a needless cost to a budget tank.
- plain, setup-08 tank: Lists "Trân châu" (HC Cuba/tiny) among plants that tolerate low light and low CO₂, but carpeting it really needs CO₂.
- plain, setup-08 tank: "Ốc Nerite không đẻ trứng trong nước ngọt": Nerites do lay eggs in fresh water, the eggs just don't hatch.
- plain, setup-08 tank: 'Trân châu... cỏ nhung' listed as cheap easy plants: carpets like these need CO2 and strong light, so they don't fit a budget low-tech tank
- plain, setup-08 tank: 'cần sưởi 25–300W': at Vietnamese temperatures a heater is usually unnecessary, and the wattage range is meaningless
- plain, setup-08 tank: 'Ốc Nerite không đẻ trứng trong nước ngọt': they do lay eggs in fresh water; the eggs just don't hatch
- plain, setup-08 tank: Says a betta suits the tank alongside guppies and neons, which risks fin-nipping and fighting
- ours, setup-09 post: Không trả lời câu hỏi lọc thùng có hợp bể này không, dù đây là câu hỏi dễ (lọc thùng hợp với bể khoảng 178 L).
- plain, setup-09 post: 'Lỗ hút... cách đáy khoảng 2–3 cm' — on a sand bed this sucks up sand into the canister; the intake should sit higher or have a strainer/pre-filter sponge
- plain, setup-09 post: 'cá đuôi kiếm nhỏ đàn lớn' — swordtails aren't small schooling fish; it's an odd pick for a small-fish community
- plain, setup-09 post: 'Kính... 10–12 mm' for a 35 cm-tall tank is on the thick side; 8–10 mm is usually enough, though not unsafe
- plain, setup-09 post: "Kính nên dày khoảng 10–12 mm": quá dày cho bể cao 35 cm; thường 8–10 mm là đủ, nên tốn tiền không cần thiết.
- plain, setup-09 post: "Lỗ hút... cách đáy khoảng 2–3 cm": quá sát nền cát, dễ hút cát vào lọc; thường nên đặt cao hơn.
- plain, setup-09 post: Gợi ý cá neon không nhắc rằng neon chịu nóng kém trong mùa hè ở Việt Nam.
- ours, setup-09 tank: Treats the canister filter as a poor choice for someone who wants less work ('bảo trì khá khó'). In practice a canister on a tank of about 178 L only needs cleaning every 1–3 months and is one of the least-work options.
- ours, setup-09 tank: Gần như khuyên không nên dùng lọc thùng, trong khi bể dài 170 cm (khoảng 178 lít) có chừa lỗ ở 2 đầu lại rất hợp lọc thùng, đặt hút một đầu, xả một đầu.
- plain, setup-09 tank: 'Cá tỳ bà/Otocinclus': in Vietnam, 'tỳ bà' means the large pleco, not the small oto, so this name mixes up two very different fish.
- plain, setup-09 tank: '1 cm cá trên 1 lít': this rough stocking rule is crude and ignores body bulk.
- plain, setup-09 tank: Recommends changing 20–30% of the water every week, against the stated wish to change water less, and never mentions that a well-planted, lightly stocked tank can go longer between changes.
- plain, setup-09 tank: Neon tetras are suggested with no warning that they struggle in Vietnam's heat.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus": ở Việt Nam, cá tỳ bà thường là cá lau kính/pleco lớn, không phải Oto; gộp chung hai loài dễ làm người mua nhầm.
- plain, setup-09 tank: "1 cm cá trên 1 lít": quy tắc quá thô, nhất là khi người này muốn ít thay nước.
- plain, cycling-01 post: "Thay 50% nước mỗi ngày... loại bỏ amoniac và vi khuẩn": vi sinh sống chủ yếu trong lọc và nền, không ở trong nước. Với nền nhiều dinh dưỡng, thay nhiều nước trong mấy tuần đầu là cần để kiểm soát amoniac nhả ra từ nền. Khuyên giảm xuống 1-2 lần/tuần dễ làm amoniac tăng vọt.
- plain, cycling-01 post: "loại 'neon 7 màu' cụ thể": hiểu sai câu hỏi. Người hỏi muốn thả neon và cá 7 màu (guppy), là hai loài khác nhau.
- plain, cycling-01 post: Không nói nên chạy sục khí ban đêm, khi tắt CO2. Đây là điểm quan trọng nhất khi bể có bình CO2.
- plain, cycling-01 post: "Thay 50% nước mỗi ngày... loại bỏ vi khuẩn": vi sinh bám ở lọc và nền chứ không trôi theo nước thay. Với nền nhiều chất mới làm, nền xả amoniac nên trong tuần đầu thay nước nhiều là hợp lý. Khuyên giảm xuống 1–2 lần/tuần ngay là chưa đúng lúc.
- plain, cycling-01 post: Hiểu "neon, 7 màu" là một loài rồi hỏi lại, trong khi người hỏi nói hai loài: neon và cá bảy màu (guppy).
- plain, cycling-01 post: Không nói rằng sục khí làm thất thoát CO₂, nên chỉ chạy sục vào ban đêm khi tắt CO₂.
- plain, cycling-01 tank: "vài giọt nước rửa chén... làm nguồn amoniac": nước rửa chén là chất tẩy rửa, độc với cá và vi sinh, không phải nguồn amoniac; nền nhiều dưỡng của bể này đã tự nhả amoniac sẵn
- plain, cycling-01 tank: Hỏi lại bể dùng nền gì, có lọc sinh học chưa, trong khi đã biết là nền nhiều dưỡng và lọc thùng DF1300
- plain, cycling-01 tank: "vài giọt nước rửa chén... để nuôi vi khuẩn": nước rửa chén không phải nguồn amoniac. Nó có chất hoạt động bề mặt, độc với cá và vi sinh. Người hỏi đã nhầm với amoniac nguyên chất.
- plain, cycling-01 tank: Câu hỏi lại về nền và lọc sinh học dù người dùng đã có nền nhiều dưỡng và lọc thùng DF1300. Câu trả lời cũng không nhắc rằng nền nhiều dưỡng thường nhả amoniac trong vài tuần đầu.
- ours, cycling-02 post: "bể 50cm với cá neon nhiệt đới rất dễ gây sốc" is muddled: a 50cm tank does not shock neons. The real cause, an uncycled tank stocked with 14 fish at once, is never stated plainly.
- ours, cycling-02 post: It refuses to name a cause ("chưa thể khẳng định") when new tank syndrome is the obvious one.
- ours, cycling-02 post: 'Cẩm nang chưa nói rõ nguyên nhân cá chết, nên em chưa thể khẳng định': the cause is clear (14 fish put into an uncycled new tank, plus mixing two incompatible species), and the answer dodges it
- ours, cycling-02 post: Suggests white cloud, a cool-water fish that does poorly in Vietnam's heat
- ours, cycling-02 post: Calls itself 'em' toward the hobbyist, when the hobbyist is the one who called himself 'em'
- plain, cycling-02 post: "Cá kiếm (platy)": in Vietnam, cá kiếm is the swordtail; the platy is cá hà lan/platy.
- plain, cycling-02 post: "Neon và cá vàng đều thải nhiều chất bẩn": neons are small and produce little waste.
- plain, cycling-02 post: It stresses buying a heater for tropical fish, which is rarely needed given Vietnam's heat.
- plain, cycling-02 post: 'Cá kiếm (platy)': in Vietnam cá kiếm is the swordtail; the platy is called cá hà lan or platy
- plain, cycling-02 post: 'Mua máy sưởi' / 'cá chọi... cần sưởi': in most of Vietnam a heater isn't needed for neon or betta, except in northern winters, so this is a cost the hobbyist mostly doesn't need
- plain, cycling-02 tank: "để nước máy qua 24 giờ" is offered as a way to dechlorinate, but standing water does not remove chloramine. The mention of a chloramine remover only partly covers this.
- plain, cycling-02 tank: 'để nước máy qua 24 giờ' does not remove chloramine. In Vietnam tap water is mostly chlorinated, though, so this matters little.
- ours, cycling-03 post: Cho rằng phân nền mới gây bùng rêu, trong khi người hỏi không hề nhắc tới phân nền
- ours, cycling-03 post: Không có bước xử lý nào, chỉ đẩy người hỏi sang 'công cụ tank-mates'
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": trong giới thủy sinh Việt Nam, trân châu ngọc trai lùn là cây trải thảm, không phải sỏi. Vì hiểu nhầm như vậy nên cả phần 2 sai hướng.
- plain, cycling-03 post: "Tỳ bà bướm... có thể ăn cây non": tỳ bà bướm chủ yếu gặm rêu bám và màng sinh học, không phá cây. Câu trả lời cũng không cảnh báo rằng loài này cần nước mát, chảy mạnh, khó nuôi trong cái nóng ở Việt Nam.
- plain, cycling-03 post: 'Trân châu là sỏi trơ, không giữ dinh dưỡng': trân châu ngọc trai lùn ở đây là cây trải thảm (Micranthemum/Hemianthus), không phải sỏi, nên cả mục 2 hiểu sai
- plain, cycling-03 post: 'Tỳ bà bướm... có thể ăn cây non': tỳ bà bướm ăn rêu bám và màng sinh học, không ăn cây. Câu trả lời cũng bỏ qua chuyện loài này cần nước mát, nhiều oxy và dòng chảy mạnh, điều khó giữ được trong cái nóng ở Việt Nam
- ours, cycling-03 tank: Includes a power-outage procedure, which has nothing to do with this problem and is just padding
- ours, cycling-03 tank: Never addresses the white growth that is rotting the trân châu
- ours, cycling-03 tank: Includes power-outage steps that have nothing to do with this question, so the reader has to wade through them.
- ours, cycling-03 tank: Says nothing about the white growth that is rotting the trân châu, which is half of what they asked.
- plain, cycling-03 tank: 'không nguy hiểm trực tiếp': the white growth is already rotting their trân châu, so it is doing harm
- plain, cycling-03 tank: 'trồng cây thủy sinh nếu có thể': they already have trân châu planted
- plain, cycling-03 tank: Asks for fish species and numbers, which their tank record already holds
- plain, cycling-03 tank: Says the white growth comes from too many nutrients and too much light. White film on a new tank is usually a bacterial or fungal film living on rotting plants and leftover food, and light plays little part in it.
- plain, cycling-03 tank: Tells them to add aquatic plants 'if possible', but the tank is already planted with trân châu ngọc trai lùn.
- ours, cycling-04 post: "chỉ thay nước khi nitrat lên từ 40 ppm trở lên" — in a 5-day-old tank where fish are dying, ammonia and nitrite are the urgent problem. Waiting for nitrate means no water change while the fish are being poisoned.
- ours, cycling-04 post: Won't diagnose ("không dám chẩn đoán") even though fish dying in a 5-day-old tank is the textbook sign of an uncycled tank ("hội chứng hồ mới").
- ours, cycling-04 post: "chỉ thay nước khi nitrat lên từ 40 ppm trở lên": sai và nguy hiểm cho hồ mới 5 ngày đang chết cá, lúc này phải thay nước ngay theo amoniac/nitrit chứ không đợi nitrat
- ours, cycling-04 tank: "Cẩm nang chưa giải thích bọt trắng": it leaves the foam unexplained, though in a 5-day-old tank foam usually means a build-up of organic waste or leftover soap
- ours, cycling-04 tank: It pads the answer with steps that don't apply here (old-tank syndrome, power outages, slaked lime, sensitivity of channel catfish and bass), and the step of adding an air pump is buried even though their tank has no air stone
- ours, cycling-04 tank: Says the guide doesn't explain the white foam and leaves it there; foam in a new tank usually means organic waste or detergent residue, and it can be explained
- ours, cycling-04 tank: Excerpt is padded with irrelevant items (channel catfish/Centrarchidae, aflatoxin, slaked lime, power-outage steps) that bury the actual advice
- plain, cycling-04 tank: It asks how many litres the tank holds and doesn't tie the advice to the setup the app already holds: a 40×30×30 tank of about 36 L, 5 days old, running only a filter with no air stone
- ours, cycling-05 post: "Tắt UV, ozone, skimmer" — this is reef/marine gear and has nothing to do with a freshwater biotope tank on an Atman canister, so it adds noise.
- ours, cycling-05 post: 'Tắt UV, ozone, skimmer': this is for saltwater or koi ponds and doesn't apply to a freshwater biotope tank with an Atman canister filter
- ours, cycling-05 post: 'giữ nhiệt 24–26°C': in Vietnam's heat this is rarely needed, and it ignores the conditions here
- plain, cycling-05 post: "Dùng nước đã để qua đêm" — leaving water out overnight does not remove chloramine. That is only a small problem, because most Vietnamese tap water uses chlorine.
- plain, cycling-05 post: "Ngâm lũa trước" — the tank is already filled and set up, so soaking the wood first comes too late in the order.
- plain, cycling-05 post: 'Ngâm lũa trước': the tank is already filled, so this step comes too late for this hobbyist
- plain, cycling-05 post: 'Tetra Nitrivec': doubtful product name, probably mixed up with another brand
- plain, cycling-05 post: 'để qua đêm' only works for chlorine; it does nothing against chloramine
- plain, cycling-05 tank: Gợi ý thả 3-5 con 'cá lia thìa' làm cá mở bể: lia thìa đực sẽ đánh nhau, nuôi chung 3-5 con là không ổn
- plain, cycling-05 tank: Gọi cá neon là loài 'chịu được biến động': neon nhạy cảm, không hợp thả vào bể vừa mới chạy vi sinh xong
- plain, cycling-05 tank: Nêu Nitrobacter là vi khuẩn chính: trong bể nước ngọt, vi khuẩn oxy hóa nitrit chủ yếu là Nitrospira
- plain, cycling-05 tank: Hỏi lại kích thước và loại bể dù app đã có thông tin này
- plain, cycling-05 tank: "3-5 con... cá lia thìa hoặc cá neon" chịu được biến động: thả chung 3-5 con lia thìa thì chúng đánh nhau, còn neon là loài nhạy cảm, không hợp thả đầu tiên vào bể mới
- plain, cycling-05 tank: Đề nghị cho biết kích thước và loại bể, trong khi các thông tin này đã có sẵn (80×40×50, biotop)
- ours, cycling-06 post: "giảm đèn còn 8–12 tiếng": this comes from the excerpt's advice on green water. It isn't a real cut in light for a low-tech tank, and light doesn't cause a bacterial bloom.
- ours, cycling-06 post: The excerpts are mostly off-topic padding: Oscar fish, UV bulbs, polyester batting for filter floss.
- ours, cycling-06 post: "giảm đèn còn 8–12 tiếng": 12 hours of light is too long for a low-tech planted tank and isn't a cut at all.
- ours, cycling-06 post: The excerpts add unrelated advice (UV bulbs, Oscars jumping, polyester batting) that doesn't fit a new 20 cm cube.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": the bacteria in a bloom live on organic matter, not on light, so cutting light mainly helps against algae.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": light doesn't feed the heterotrophic bacteria that cause a bacterial bloom; cutting light mostly helps against algae.
- plain, cycling-06 post: Suggests taking filter material from the foam box, which usually has no filter. Only the sponge or substrate in it, if there is any, would actually help.
- ours, cycling-06 tank: The excerpt's "Giảm đèn còn khoảng 8–12 tiếng" for green water: 12 hours of light is still too much to clear an algae bloom. It is also off-topic for white cloudiness.
- ours, cycling-06 tank: "Giảm đèn còn khoảng 8–12 tiếng" — 12 tiếng không phải là giảm; với bể lowtech 6–8 tiếng mới hợp lý
- ours, cycling-06 tank: Lời khuyên về đèn UV và thay bóng 6 tháng thuộc chuyện nước xanh, không hợp với cubic 20 (~8 lít) đang đục trắng
- plain, cycling-06 tank: "Đây là dấu hiệu vi sinh đang hình thành": the cloudiness comes from heterotrophic bacteria, which are not the nitrifying bacteria that make up the 'vi sinh'. This overstates it a little.
- ours, cycling-07 post: Calls the seller's schedule unnecessary because water changes aren't required in an established tank. This tank was set up today on fresh aqua soil, which leaches ammonia for the first few weeks, so frequent water changes early on are actually useful.
- ours, cycling-07 post: Says to leave tap water out overnight with no need for dechlorinator. That only works for chlorine, not chloramine.
- ours, cycling-07 post: It applies guide advice for an established, stable tank ("không bắt buộc", just top up when water drops) to a tank set up today on fresh aquasoil, where early water changes do matter.
- plain, cycling-07 post: Says frequent water changes 'làm mất các vi khuẩn có lợi'. That's wrong: the bacteria live on surfaces, not in the water, and in a new aqua-soil tank frequent changes help.
- plain, cycling-07 post: Says 2–3-day changes are usually unnecessary while the tank has just been set up on fresh aqua soil.
- plain, cycling-07 post: "Thay nước 2-3 ngày một lần thường là không cần thiết": with fresh aquasoil and no filter, frequent changes in the first 1–2 weeks are the standard way to deal with the ammonia the soil releases. The seller's advice is roughly right for this stage.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": beneficial bacteria live on surfaces and the substrate, not in the water column, so water changes don't remove them in any meaningful amount.
- plain, cycling-07 post: Rau muống nước listed as a floating plant for a small bedroom tank is impractical.
- ours, cycling-07 tank: It opens with "thay vài ngày một lần là chưa đủ", but its own second excerpt says changing every 2–3 days at 50–100% is fine, so the answer contradicts itself.
- ours, cycling-07 tank: The steps say "Tắt hết lọc thùng, lọc váng và quạt" (turn off the canister filter, skimmer and fan), but this tank has no filter and no aeration. It never says whether running with no filter is OK.
- ours, cycling-07 tank: 'Tắt hết lọc thùng, lọc váng và quạt': bể này không có lọc, không có sủi. Đây là trích nguyên cẩm nang mà không áp vào bể của bạn.
- ours, cycling-07 tank: Tự mâu thuẫn: phần đầu bảo tuần 1 thay 50% mỗi ngày, đoạn trích sau lại bảo thay 2–3 ngày một lần, mỗi lần 50–100%.
- ours, cycling-07 tank: 'Thay 50–100% không có hại gì' là nói quá: nếu đã có cá thì thay 100% nước có thể làm cá sốc.
- plain, cycling-07 tank: It reads "thay cho lọc" as "in place of cleaning the filter". The hobbyist actually has no filter at all, so the whole answer is about the wrong question.
- plain, cycling-07 tank: "Nếu chưa có cá, không cần thay nước quá nhiều" (if there are no fish yet, there's no need to change much water) is bad advice for a new tank on aqua soil. The soil releases a lot of ammonia and nutrients early on, so frequent big water changes are needed to keep algae down.
- plain, cycling-07 tank: Đọc sai câu hỏi: hiểu 'thay cho lọc' là thay cho việc vệ sinh lọc, trong khi bể này không có lọc. Vì vậy cả câu trả lời nói về vệ sinh một bộ lọc mà bể không có.
- ours, cycling-08 post: It says it can't give a cycling time ("chưa đọc được mốc ngày cụ thể"), and the cycling excerpt shown under it is empty, so the hobbyist gets no answer to that question
- plain, cycling-08 post: "bèo tây" (lục bình) mọc quá to cho một hồ 40x40x20
- plain, cycling-08 post: Gợi ý nuôi neon trong hồ ngoài trời dễ nóng: neon chịu nóng kém
- plain, cycling-08 post: "bèo tây" (lục bình) is too big for a 40x40x20 tank; a small floating plant like bèo cái or bèo tấm would suit it better
- plain, cycling-08 post: "quét chống thấm" is risky advice: many waterproofing products are not safe for fish unless they are labelled fish-safe
- ours, cycling-08 tank: "nâng nhiệt độ nước lên 27°C" – nhắc cần sưởi, không phù hợp với bể đặt trên sân thượng ở Việt Nam, nơi vấn đề là nước quá nóng chứ không phải quá lạnh
- plain, cycling-08 tank: Lists 'Thả cá từ từ' as a way to speed up cycling. That is about stocking after the cycle and does not shorten it.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này... chứ không cong người" — cá ngựa vằn già rất hay cong cột sống do thoái hóa cơ sau năm thứ 2; ở đàn gần 3 năm đây là nguyên nhân hàng đầu
- plain, sick-01 post: "cichlid vằn xanh" — người hỏi rõ ràng nói về đàn cá ngựa vằn, nên đoán loài khác chỉ gây nhiễu
- plain, sick-01 post: Xếp Columnaris là bệnh mạn tính gây cong người là không đúng; Columnaris thường diễn tiến cấp tính, gây mảng trắng và thối vây/mang
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này": zebra danio thường bị cong cột sống do thoái hóa cơ khi già, nhất là sau năm thứ 2, nên đàn gần 3 tuổi rất khớp với nguyên nhân tuổi già
- plain, sick-01 post: Không chắc đây là loài gì, còn đoán cả "cichlid vằn xanh", trong khi ngựa vằn xanh ở Việt Nam là zebra danio
- plain, sick-01 post: Đưa thiếu vitamin C lên như nguyên nhân chính trong khi cá đã nuôi gần 3 năm, khó khớp
- ours, sick-01 tank: The excerpt pushes the Maracyn + Ich-X + ParaCleanse broad-spectrum trio. That won't cure chronic mycobacteriosis or Pseudoloma, and these brands are hard to find in Vietnam.
- ours, sick-01 tank: Recommends a broad-spectrum trio (Maracyn, Ich-X, ParaCleanse). It won't help against mycobacteriosis or microsporidia, the likely causes of slow spinal curving and death, and these products are hard to find in Vietnam.
- ours, sick-01 tank: The guide excerpt's marketing line ('hàng chục nghìn đô la...') is padding that doesn't help the fish.
- plain, sick-01 tank: It calls 26–28°C ideal, which sits at the top of the range for zebra danios. Around 22–26°C is more typical, though this is minor in Vietnam's heat.
- plain, sick-01 tank: It leaves out old age as a cause. These fish have been kept for almost 3 years, and older zebra danios often get bent spines.
- plain, sick-01 tank: Lists Nodavirus as a main cause. It's rare in pet zebra danios, so it pulls attention from the likelier causes (mycobacteriosis, Pseudoloma) and old age at 3 years.
- ours, sick-02 post: "chỉ châm thêm nước mà không rút nước cũ ra": nhầm tình huống. Bạn ấy có thay nước khi nước đục, chỉ là thay quá ít.
- ours, sick-02 post: Dồn vào nhiều thứ lạc đề với bể cá cảnh trong nhà: ví dụ cá nheo Mỹ và cá bass, ống đồng, vôi tôi, gửi mẫu cá đi phòng xét nghiệm, làm chết cá nhân đạo trước khi gửi.
- ours, sick-02 post: "chỉ châm thêm nước mà không rút nước cũ ra": người hỏi không nói vậy, họ có thay nước, chỉ là thay ít
- ours, sick-02 post: Đưa vào chuyện gửi mẫu cho phòng xét nghiệm, ngộ độc đồng, vôi tôi, cá nheo Mỹ, đo bằng quart: không liên quan đến một bể cá cảnh trong nhà ở Việt Nam
- ours, sick-02 post: Lời khuyên đo oxy hòa tan, H2S, CO2 không thực tế với người nuôi chơi
- plain, sick-02 post: "Cá vàng thích nước mát... không hợp môi trường": nói hơi quá. Cá vàng và cá 7 màu nuôi chung trong nhà ở Việt Nam vẫn ổn.
- plain, sick-02 post: "nước máy ở nhiều nơi dùng chloramin": hầu hết nước máy ở Việt Nam khử trùng bằng clo, nên cảnh báo này ít liên quan ở đây.
- plain, sick-02 post: "bộ test nước... khoảng 100–200 nghìn đồng": thường chỉ mua được que test giấy với giá này, bộ test nhỏ giọt đủ 4 chỉ số đắt hơn khá nhiều
- plain, sick-02 post: Phần cá vàng và cá nhiệt đới không hợp nhiệt độ ít liên quan với khí hậu nóng ở Việt Nam, nghe như một nguyên nhân chính trong khi không phải
- ours, sick-02 tank: Gives a lab-submission protocol (4–6 live fish, 1 quart of water, humane euthanasia) that a Vietnamese home hobbyist can't use and doesn't need.
- ours, sick-02 tank: "Amoniac lúc đó thường trên 10 mg/L" is a made-up-looking precise figure for old-tank syndrome.
- ours, sick-02 tank: Cites channel catfish, bass and bluegill, and asks for DO, H2S and copper tests, which are irrelevant to a home goldfish/guppy tank.
- ours, sick-02 tank: "Amoniac lúc đó thường trên 10 mg/L": a vague figure with no source, and it doesn't fit a lightly stocked home tank.
- ours, sick-02 tank: Lab sample submission (4–6 live fish, 1 quart of water) and the channel catfish/bluegill comparison don't fit a Vietnamese home tank of goldfish and guppies, and those labs aren't available to a hobbyist here.
- ours, sick-03 post: Blames hard rocks (đá da voi, đá kẹp kem) for the high TDS, but the hobbyist never said they use rocks, so this is a guess presented as the cause
- ours, sick-03 post: Most of the attached excerpts (bladder snails, priming a siphon, using tweezers) have nothing to do with this tank
- ours, sick-03 post: Most of the excerpts are off-topic: bladder snails, priming a siphon, using tweezers. The hobbyist has to read through all of it.
- ours, sick-03 post: It blames hardscape stone (đá da voi, đá kẹp kem) for the high TDS, but the hobbyist never mentioned using stone. It also gives no cause for the shrimp and fish deaths, which was the main worry.
- plain, sick-03 post: Reads 'tầm 1-2 tuần' (about every 1–2 weeks) as the fish species 'cá tầm'
- plain, sick-03 post: Calls about 12 mg/L CO2 'đủ cho cây phát triển' (enough for the plants) and blames the test kit, but 12 ppm is low for a CO2 tank, so the kit's 'thiếu' reading is likely right
- plain, sick-03 post: "CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển": 12 ppm is on the low side for a CO2 tank, where 20–30 ppm is the usual target. So the test kit saying CO2 is short is probably right, not a faulty kit.
- plain, sick-03 post: "Otto, pygmy và tầm (nếu là loài nhạy cảm)": it read "tầm" as a fish species. The hobbyist meant "khoảng" (roughly), as in a fish dies roughly every 1–2 weeks.
- plain, sick-03 post: "xanh vàng là đủ CO2 hay chưa": this is unclear. A drop checker that is green means enough CO2, and yellow means too much.
- ours, sick-03 tank: Đoạn trích ghi "CO2 độc khi vượt 12 mg/L": con số này lấy từ tài liệu ao nuôi. Bể thủy sinh thường chạy 20–30 ppm, nên câu này gây hiểu sai cho người đang chạy CO2.
- ours, sick-03 tank: Phần lớn đoạn trích nói về cá chết hàng loạt (cá nheo Mỹ, cá bluegill, vôi tôi, aflatoxin), không liên quan đến chuyện tép chết lai rai trong bể thủy sinh.
- ours, sick-03 tank: 'CO2 độc khi vượt 12 mg/L' is a pond/aquaculture threshold. It misleads a CO₂-injected planted tank, which normally runs about 20–30 ppm.
- ours, sick-03 tank: The excerpt is padded with irrelevant items (channel catfish, vôi tôi, aflatoxin, old-tank pH crash) that don't apply here.
- plain, sick-03 tank: Nói tép rất nhạy với GH/KH qua ví dụ Caridina (Crystal, Bee). Tép màu thường là Neocaridina, chịu được GH 8, KH 4 khá tốt, nên lý do này dễ làm người đọc hiểu sai.
- plain, sick-03 tank: Focuses on Caridina sensitivity, but 'tép màu' in Vietnam is usually Neocaridina, which tolerates GH 8 / TDS 360 better.
- ours, sick-04 post: Trích phần xử lý pH tụt (tắt CO2, thêm baking soda nâng KH), trong khi bể bị pH cao. Nâng KH sẽ làm vấn đề nặng hơn.
- ours, sick-04 post: It quotes a guide for pH that has dropped, including 'tắt CO2' and adding baking soda to raise KH. That is the opposite of what this tank needs, since its pH and KH are already high.
- ours, sick-04 post: It admits it cannot diagnose and gives no steps that fit this tank: nothing about removing the Neo Soft, the limestone rock pushing KH up, or the dead shrimp.
- plain, sick-04 post: Hiểu 'vảy ốc xanh/đỏ' là ốc Neritina, nhưng đây là cây Rotala (vảy ốc). Người hỏi tả 'gãy ngang ngọn lá', tức là nói về cây, nên phần tư vấn về ốc sai hoàn toàn.
- plain, sick-04 post: Khuyên tắt đèn vài ngày cho bể thủy sinh đang có cây yếu thì hơi quá tay. Giảm giờ đèn sẽ hợp lý hơn.
- plain, sick-04 post: 'Ốc vảy (Neritina) chịu nước cứng...vết gãy trên vỏ': in the Vietnamese hobby, vảy ốc xanh/đỏ is Rotala, a stem plant, not a snail. The hobbyist was describing broken leaf tips, so this whole section misreads the question.
- plain, sick-04 post: 'Tắt đèn vài ngày': in a CO₂ planted tank, leaving the lights off for days weakens plants that are already melting. Shortening the photoperiod would be safer.
- plain, sick-04 tank: Gộp Caridina vào khoảng 'pH 6,5-7,5, KH 3-6, GH 6-8' là sai: Caridina cần nước mềm, KH khoảng 0 và pH thấp hơn nhiều
- plain, sick-04 tank: Không nhắc gì đến đá da voi trắng (đá vôi) đang đẩy pH lên 8,4, nên bỏ sót nguyên nhân gốc là pH bị kéo lệch giữa đá và Neo Soft
- ours, sick-05 post: "CO2 độc khi vượt 12 mg/L": this is an aquaculture threshold. Planted tanks normally run 20–30 mg/L, so the figure would mislead someone who doses CO2.
- ours, sick-05 post: It never points out that changing 50% every other day with bottled drinking water (often RO, with almost no KH) can crash the pH and keep killing fish.
- ours, sick-05 post: Most of the excerpt doesn't apply to a home tank: channel catfish and bass, slaked lime, copper pipes, well water, power outages.
- ours, sick-05 post: "CO2 độc khi vượt 12 mg/L": ngưỡng này lấy từ ao nuôi, không hợp với bể thủy sinh có châm CO2, vốn thường chạy khoảng 20–30 mg/L
- ours, sick-05 post: Bỏ qua chuyện thay 50% cách ngày bằng nước tinh khiết, gần như không có KH, trong khi bể đang châm CO2: đây là nguyên nhân rất có thể làm pH sụp và cá chết
- plain, sick-05 post: "Để qua đêm" can't remove chloramine if the tap water uses it, so it should recommend a water conditioner instead.
- plain, sick-05 post: "để qua đêm" để khử clo: chỉ đúng với clo, không khử được chloramine, và nên khuyên dùng thuốc khử clo cho chắc
- plain, sick-05 post: Khuyên chuyển sang thay 20–30% mỗi tuần khi cá vẫn đang chết, trước khi có kết quả test, nên có thể chưa đủ nếu amoniac/nitrit đang cao
- ours, sick-05 tank: Blames 'old tank syndrome' building up 'qua nhiều tháng', but the tank has only run 8.6 weeks and gets 50% changes every other day, so that cause can't fit
- ours, sick-05 tank: Tells them to change more water and quotes '30–40% mỗi tháng', which is far less than they already do and points them the wrong way
- ours, sick-05 tank: Long pasted excerpts about gasping fish and power cuts are off-topic padding
- ours, sick-05 tank: Đổ cho 'old tank syndrome' (chất bẩn tích qua nhiều tháng) ở một bể mới chạy 8,6 tuần và được thay 50% cách ngày. Không thể có tích tụ kiểu đó.
- ours, sick-05 tank: Khuyên 'tăng lượng thay' 30–40% mỗi tháng, ít hơn rất nhiều so với mức họ đang thay, và không nhắm vào nguyên nhân thật.
- ours, sick-05 tank: Các đoạn trích về mất điện và betta đớp khí không liên quan đến vấn đề, chỉ làm loãng câu trả lời.
- plain, sick-05 tank: Tells them to change water with 'nước đã khử clo' and lists tap-water chlorine as a cause, but they use bottled drinking water. It never raises the likely problem: low-mineral (low KH/GH) water plus CO₂ makes the pH crash and swing, and 50% changes every other day make the swings worse
- plain, sick-05 tank: Bảo 'Thay 30–50% nước' khi người nuôi đã thay 50% cách ngày. Thay thêm không giải quyết được gì, và không nhận ra rằng nước lọc đóng bình gần như không có khoáng (KH/GH thấp) sẽ làm pH sụt mạnh khi chạy CO₂.
- plain, sick-05 tank: Dành nhiều chỗ nói clo/cloramin trong nước máy, trong khi họ không dùng nước máy.
- ours, sick-06 post: "hãy tách cá sớm": this comes from the tankmate guide and means separating tankmates. Here the only other fish are feeders, so the advice doesn't apply and is confusing.
- ours, sick-06 post: Says nothing about the new tank's filter not being cycled yet, which is the most likely cause after moving out of a 20-year-old tank.
- ours, sick-06 post: "hãy tách cá sớm" comes from a guide about tank mates. It doesn't fit this case of 2 arowanas that stopped eating after the tank move, and it gives no reason for separating them.
- ours, sick-06 post: "thường khoảng một tuần thì ăn lại" doesn't help: the fish have already gone almost a week without eating.
- ours, sick-06 post: It never says the likely cause: a new tank that hasn't cycled yet, with ammonia and nitrite building up.
- ours, sick-06 post: The excerpts about choosing tank mates, a drip system and betta are mostly off-topic padding.
- ours, sick-06 tank: Nói 'nếu quá một tuần' trong khi cá đã nhịn gần một tuần, và không nhắc rằng bể mới một tuần nhiều khả năng chưa chạy xong chu trình nitơ, đây là nguyên nhân chính
- ours, sick-06 tank: Phần trích về chọn cá bạn (cá đô la, lũa, râu bị cắn) không liên quan đến người hỏi, làm loãng câu trả lời
- ours, sick-06 tank: Gợi ý 'cho ăn giun sống' nhưng không cảnh báo giun sống dễ mang ký sinh trùng và mầm bệnh vào bể
- ours, sick-06 tank: Phần lớn trích đoạn nói về ghép cá bạn (cá đô la, lũa, râu bị cắn), không liên quan đến việc cá bỏ ăn sau khi chuyển sang bể mới chưa chạy vi sinh
- plain, sick-06 tank: Khuyên đặt cây, đá hoặc ống cho cá ẩn nấp: cách này không hợp với bể cá rồng lớn, che kính mới là cách đúng
- ours, sick-07 post: "hút đáy, vệ sinh lọc" trước khi châm muối: không phân biệt bể cách ly với bể chính. Bể chính vừa lật và vừa mất nền, nếu vệ sinh lọc thêm thì vi sinh càng hao, dễ sốc amoniac.
- ours, sick-07 post: Gợi ý Maracyn cho nấm miệng: ở Việt Nam khó mua loại này, nên lời khuyên khó làm theo
- ours, sick-08 post: "Nhiệt độ khoảng 21–26°C, nước nhiệt độ phòng là được": ở Việt Nam nước nhiệt độ phòng thường 28–32°C, cao hơn khoảng này, nên câu này gây hiểu nhầm.
- ours, sick-08 post: "Nhiệt độ khoảng 21–26°C, nước nhiệt độ phòng là được" contradicts itself in Vietnam, where room temperature is often 28–32°C, above the range it just gave.
- ours, sick-08 post: Starvation as a cause doesn't fit fish that died after one night.
- plain, sick-08 post: "Thiếu oxy vào ban đêm (khả năng cao nhất)": nói quá chắc. Khi otto chết ngay đêm đầu mà neon vẫn sống, nguyên nhân hay gặp hơn là sốc do thả không thuần nước, cá đã yếu sẵn, hoặc thuốc diệt rêu.
- plain, sick-08 post: Puts night-time oxygen shortage as the most likely cause, but it is less likely than stress from the trip and acclimation, or algae-killer chemicals, when all the fish die within a single night. Also, if oxygen were low, the neons would usually show signs too.
- ours, sick-08 tank: Gives starvation (wild-caught otto not eating pellets) as a main cause. Starvation can't kill all 3 within one night.
- ours, sick-08 tank: "Nhiệt độ khoảng 21–26°C": it doesn't address Vietnamese tanks, which usually run at 28–30°C, so the advice doesn't fit local conditions.
- ours, sick-08 tank: Gives starvation as a main cause, but starving fish do not die overnight, and the tank has algae for them to eat
- ours, sick-08 tank: "Nhiệt độ khoảng 21–26°C, nước nhiệt độ phòng là được" contradicts itself in Vietnam, where room-temperature water is often 28–32°C
- ours, sick-08 tank: Telling them to drip-acclimate for 4–5 hours is far longer than usual and isn't explained
- plain, sick-08 tank: "Nuôi một hai con đơn lẻ dễ bị stress" – they kept 3, and stress from a small group does not kill fish in one night, so this cause doesn't apply here
- ours, sick-09 tank: Recommends a heater at about 1 W per litre, a polystyrene wrap and a lid. That suits an indoor glass tank, not a shallow outdoor koi pond of about 1,350 L. Koi don't need tropical heating.
- ours, sick-09 tank: Leads with old tank syndrome, which doesn't fit new koi dying a few days after they go in during cold weather.
- ours, sick-09 tank: "sưởi khoảng 1 W cho mỗi lít nước": với hồ khoảng 13.500 lít thì ra cỡ 13,5 kW, vừa phi thực tế vừa không cần cho koi
- ours, sick-09 tank: Đưa "old tank syndrome" lên làm hướng chính, trong khi cá đã chết hàng loạt ở hồ có vẻ mới làm; không đề cập khả năng xi măng/đá mới làm tăng pH
- ours, sick-09 tank: "Đậy nắp bể để giữ nhiệt từ đèn": không áp dụng được cho hồ ngoài trời
- plain, sick-09 tank: Recommends holding the water at 24–26 °C with a heater and talks about tropical fish like betta and neon. That doesn't fit koi or common carp in an outdoor pond.
- plain, sick-09 tank: "Ổn định nhiệt độ... 24–26°C... bằng heater": đây là hồ koi ngoài trời khoảng 13.500 lít; koi và cá chép là cá nước lạnh, không cần sưởi lên mức nhiệt đới
- plain, sick-09 tank: Phần nói về betta, neon, guppy không liên quan gì đến hồ koi
- ours, stocking-01 post: "bể nhóm này cần dài tới 180 cm": this figure has no basis and doesn't help a beginner with a small tank.
- ours, stocking-01 post: The guppy card says to use a heater ("có sưởi") and lists 20–26°C. That doesn't match Vietnam, where the card itself says the summer problem is overheating. It also gives guppies a 6 cm size, which is too large.
- ours, stocking-01 post: "bể nhóm này cần dài tới 180 cm": con số lấy từ đâu không rõ và gây hiểu nhầm cho người mới
- ours, stocking-01 post: Trích dẫn nói nhiệt độ 20–26°C ở chỗ này nhưng tối đa 28°C ở chỗ khác, tự mâu thuẫn
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": guppies are peaceful, not aggressive.
- plain, stocking-01 post: "nuôi 7 màu cùng cá cỡ lớn... bể tối thiểu 200 lít, tránh thả cá nhỏ chung": this is backwards. Guppies are small fish that do well in small tanks with other small fish.
- plain, stocking-01 post: It never says plainly that the goldfish can swallow the small guppies, which most likely explains the missing bodies.
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": cá bảy màu hiền, không phải loài hung dữ ăn cá khác
- plain, stocking-01 post: "nuôi cá 7 màu... cùng cá cỡ lớn, bể tối thiểu khoảng 200 lít, tránh thả cá nhỏ": sai hẳn, cá bảy màu hợp với bể nhỏ và cá nhỏ hiền
- ours, stocking-01 tank: "cá tỳ bà leopard ... có thể ăn cá bảy màu": tỳ bà ăn tảo và thức ăn đáy, không săn được bảy màu trưởng thành; nó chỉ rỉa xác cá đã chết
- ours, stocking-01 tank: "Bể dài tối thiểu cho cả nhóm: 180 cm": con số máy tính ra, không liên quan đến chuyện cá mất
- ours, stocking-01 tank: Bảo cẩm nang chưa có trang về bống, trong khi ghi chú bể đã nói bống rỉa xác, mà đó chính là lý do không thấy xác
- ours, stocking-01 tank: "Cá tỳ bà leopard có thể ăn cá bảy màu": plecos graze and scavenge. They eat dead fish but don't hunt live guppies, so this blames the wrong fish.
- ours, stocking-01 tank: It assumes 'cá dọn bể' means a 50 cm leopard pleco and adds an irrelevant '180 cm' minimum tank length.
- ours, stocking-01 tank: It skips the goby (bống), even though the notes say the gobies pick at the dead fish. The gobies are a likely suspect.
- plain, stocking-01 tank: Kể cá rô, cichlid, lia thia, cá lóc là thủ phạm nhưng bể không có loài nào trong số đó, còn cá vàng có trong bể thì lại không nhắc tới
- plain, stocking-01 tank: Spends space on cichlids, cá lia thia and cá lóc con, none of which are in this tank, and asks for species the app already holds.
- ours, stocking-02 post: 'hai loài khó sống lâu dài trong cùng một nước' – overstated: platy and neon are commonly kept together at pH ~7, GH ~8–12, and in practice it works
- ours, stocking-02 post: Never warns that a 1-week-old tank isn't cycled, so adding 40 neon at once is risky
- ours, stocking-02 post: "hai loài khó sống lâu dài trong cùng một nước": this overstates the clash. In practice platy and neon live together fine in the neutral tap water common in Vietnam.
- ours, stocking-02 post: Doesn't answer the stocking question at all. It ignores that the tank is only 1 week old and that adding 40 fish at once risks an ammonia spike.
- plain, stocking-02 post: Doesn't recognise 'mún' as platy, a common Vietnamese name, and suggests it might be a predator like cá rô or betta, which adds confusion
- plain, stocking-02 post: Doesn't recognise 'mún' as platy, a common Vietnamese name. It guesses it might be an aggressive fish like a gourami or male betta, which is wrong and adds needless doubt.
- plain, stocking-02 post: Says neon prefer 22–26°C without saying that the 27–30°C common in Vietnam is still fine for neons kept in shops here.
- ours, stocking-02 tank: Applies the 'bể không lọc' (no-filter) rule without knowing whether the tank has a filter, so its conclusion that 40 neon is far too many rests on an assumption.
- ours, stocking-02 tank: It does not answer whether mún (platy) can live with neon, though the two are well known to live together peacefully.
- ours, stocking-02 tank: It never mentions that a tank running only 1 week is probably not cycled yet.
- ours, stocking-02 tank: Bases the stocking count on a rule for tanks without a filter (2 L per small fish), which doesn't fit a normal 96 L tank and is misleading.
- ours, stocking-02 tank: Doesn't say whether platy can live with neon (they can), and doesn't mention that the tank is only 1 week old.
- plain, stocking-02 tank: It doesn't recognise 'mún' (platy, a very common fish in Vietnam), so it never answers the question about keeping them together.
- plain, stocking-02 tank: It asks for the tank size even though the app already has it (60×40×40, about 96 L), and the 'under 60 L' point does not apply to this tank.
- plain, stocking-02 tank: It lists 'cá tỳ bà' as a tankmate, but many plecos grow large and are not a good fit for a small community tank.
- plain, stocking-02 tank: Says it doesn't know what 'mún' is. Mún is the everyday Vietnamese name for platy, which lives fine with neon, so the main question goes unanswered.
- plain, stocking-02 tank: Never notices the tank has only run for 1 week. Adding 40 neon to a tank that hasn't finished cycling is the real risk here.
- ours, stocking-03 post: Gợi ý neon đen, rasbora, cá chuột, white cloud cho bể khoảng 15 lít: đây đều là cá đàn, cần bể rộng hơn. White cloud lại ưa nước mát, không hợp với cái nóng ở Việt Nam
- ours, stocking-03 post: Khuyên thay 30–50% nước mỗi ngày trong 2 tuần đầu: lịch này dành cho bể thủy sinh dùng phân nền mới, không áp dụng cho bể cá cơ bản của người mới, và cũng không trả lời câu hỏi thay nước 1 tuần/lần
- ours, stocking-03 post: Ảnh cá chép kèm theo không liên quan đến bể nhỏ này
- ours, stocking-03 post: Gợi ý white cloud cho bể 15 lít ở Việt Nam: đây là cá nước lạnh, chịu nóng kém trong mùa hè ở Việt Nam.
- ours, stocking-03 post: Gợi ý cá đàn như neon đen, rasbora, cá chuột cho bể khoảng 15 lít mà không nói số lượng: bể này quá nhỏ cho một đàn đúng nghĩa.
- ours, stocking-03 post: Áp lịch thay nước 30–50% mỗi ngày trong 2 tuần đầu: lịch này dành cho bể thủy sinh dùng phân nền, không hợp với bể của người mới. Đoạn trích còn nói thả cá ngay là sai, nhưng câu trả lời không nói rõ phải chạy bể trước bao lâu rồi mới thả cá.
- plain, stocking-03 post: Xếp cá lia thia vào nhóm 'cá đàn lớn': lia thia không phải cá đàn, chỉ là cá hiếu chiến. Đây là lỗi nhỏ
- plain, stocking-03 post: "Tránh cá đàn lớn như neon, cá chuột, cá lia thia": cá lia thia là cá xiêm hoang dã, không phải cá đàn, và nuôi 1 con trong bể 15 lít vẫn được.
- ours, stocking-03 tank: Excerpt promotes the 'Aquarium Co-Op' air ring and Easy Flow kit. That brand isn't relevant to a hobbyist in Vietnam, and the excerpt never answers whether this tank needs a filter.
- ours, stocking-03 tank: It never says plainly that the tank needs a filter, even though the tank has no filter or air pump yet.
- ours, stocking-03 tank: It implies a 15 L tank isn't enough for one betta. In practice a 15 L tank with a filter suits one betta well.
- ours, stocking-03 tank: It never states clearly that a tank without a filter needs one. It also promotes Aquarium Co-Op's air ring, which is irrelevant to a hobbyist in Vietnam.
- plain, stocking-03 tank: 'cá thái lan (cá dĩa nhỏ hiền)' is wrong: cá thái lan is not a small, peaceful discus.
- plain, stocking-03 tank: It lists goldfish among beginner fish, which doesn't suit a ~15 L tank. It does add a caveat that goldfish need a big tank.
- plain, stocking-03 tank: 'cá thái lan (cá dĩa nhỏ hiền)': this lumps discus in as a beginner fish. Discus need a large, warm tank with very clean water, so they are not an easy beginner fish.
- plain, stocking-03 tank: '2–3 lít nước mỗi con': the rule is rough and doesn't account for fish size or tank size. It would let someone overstock a 15 L tank.
- ours, stocking-04 post: "không thể khẳng định nguyên nhân cái chết là do nó" – it hedges too much. A grown golden algae eater (Gyrinocheilus) sucking slime off slow fish like platies, swordtails and guppies is the most likely cause.
- ours, stocking-04 post: Hedges with "không thể khẳng định" even though slime-sucking is the likely cause, and never says to remove or feed the bống.
- plain, stocking-04 post: It treats bống vàng as an ordinary goby ("bống có tính lãnh thổ", "ăn cá con"). In the Vietnamese hobby, bống vàng is the golden algae eater (Gyrinocheilus aymonieri), which sucks slime off other fish.
- plain, stocking-04 post: "khả năng cao cá chết không phải do bống xử" – this is wrong for this fish, and it kills slow fish exactly like platies, swordtails and guppies.
- plain, stocking-04 post: It suggests tankmates such as neon and lòng tong without warning that a grown algae eater may also latch onto them at night.
- plain, stocking-04 post: Treats bống vàng as a territorial goby. It is actually Gyrinocheilus aymonieri, the Chinese algae eater, which latches onto other fish and sucks their slime.
- plain, stocking-04 post: "khả năng cao cá chết không phải do bống": this steers the hobbyist away from the most likely cause, since the bống isn't fed and is harassing slow fish like guppies and swordtails.
- plain, stocking-04 post: Suggests neon and small fish as tankmates, but they would still get latched onto by a grown bống vàng.
- plain, stocking-04 tank: "cá kiếm (platy)": ở Việt Nam cá kiếm là swordtail; platy là cá mún/hà lan, nên tên bị lẫn.
- plain, stocking-04 tank: "cá hồng kim (neon tetra)": hồng kim là một dạng mún/kiếm đỏ, không phải neon tetra; xếp hồng kim vào nhóm cá ăn tép cũng sai.
- plain, stocking-04 tank: Gợi ý nuôi bảy màu, kiếm, mún dù đó chính là những loài đã chết dần trong bể này.
- plain, stocking-04 tank: "cá heo nhỏ" trong nhóm cá ăn thịt lớn là tên khó hiểu hoặc sai.
- plain, stocking-04 tank: "cá kiếm (platy)": in Vietnam, cá kiếm means swordtail. Platy is cá hà lan/mún, and the answer then lists swordtail a second time.
- plain, stocking-04 tank: "cá hồng kim (neon tetra)": hồng kim is a red swordtail/platy, not a neon tetra.
- plain, stocking-04 tank: "ốc hương" is a saltwater snail, so it isn't suitable for a freshwater tank.
- plain, stocking-04 tank: It recommends guppy, platy and swordtail, the very fish that already died one by one in this tank.
- ours, stocking-05 post: Cites the koi page as calling the idea that the two can't be kept together a 'hiểu lầm' (misunderstanding), while the hobbyist's own tank shows they can't. That muddles the answer to their question.
- ours, stocking-05 post: Talks about its own sources ('Cẩm nang chưa có trang nào', 'chưa đọc hết'), which is no use to the hobbyist and makes the answer unclear.
- ours, stocking-05 post: Dẫn trang koi nói việc koi không nuôi chung được với cá vàng là "hiểu lầm", trong khi chủ bể vừa mất một con cá vàng. Dẫn vậy dễ khiến người đọc thả chung tiếp.
- ours, stocking-05 post: Phần trích nói cá vàng cắn vây nhau nên lạc đề, vì ở đây chính cá chép tấn công cá vàng.
- plain, stocking-05 post: Salt bath at '3-5 g muối/lít trong 10-15 phút' mixes up two methods. That strength suits a long soak, and a short dip needs more salt. It's weak but not harmful.
- plain, stocking-05 post: Mixes 'em xin lỗi' with 'anh/chị có thể gợi ý', so the way it addresses the reader is inconsistent.
- plain, stocking-05 post: Ghi "Cá chép thường hung hăng": nói quá. Cá chép thường hiền. Cá vàng bị hại chủ yếu vì chép to hơn, giành ăn và rượt đuổi, chứ chép không phải loài hung dữ.
- plain, stocking-05 post: Tắm muối "3-5 g/lít trong 10-15 phút" lẫn lộn hai cách: nồng độ đó dùng để ngâm lâu dài, còn tắm ngắn thì phải đậm hơn nhiều. Không gây hại, nhưng tắm như vậy gần như không có tác dụng.
- ours, stocking-05 tank: Says the koi 'có thể ăn cá vàng', yet its own species card lists koi as 'peaceful'. The two contradict each other, and koi don't really prey on goldfish that size.
- ours, stocking-05 tank: Answers about koi instead of common carp and leaves the hobbyist without a clear verdict on their own fish.
- ours, stocking-05 tank: Dùng thẻ cá koi thay cho cá chép thường, nhưng thẻ lại ghi 'tính peaceful', trái với câu kết luận 'không nên nuôi chung' ngay bên trên
- ours, stocking-05 tank: Câu chữ lẫn tiếng Anh ('peaceful') và lời rào đón kiểu máy về chuyện cẩm nang không có trang riêng
- plain, stocking-05 tank: Recommends 'muối (liều nhẹ)' without giving a dose, which is too vague to act on safely.
- plain, stocking-05 tank: Ignores that a goldfish already died after the carp went in. A newly added fish can bring disease, and the answer never mentions quarantine or checking for it.
- plain, stocking-05 tank: 'muối (liều nhẹ)' và 'xanh methylen' nhưng không ghi liều, người đọc không biết dùng bao nhiêu
- plain, stocking-05 tank: 'Cho ăn đầy đủ để cá chép bớt hung hăng' là biện pháp yếu, không giải quyết được việc cá chép cứ tấn công cá vàng
- plain, stocking-06 post: "bèo tây" (lục bình) quá to, không hợp làm chỗ trốn cho cá con trong bể cubic nhỏ; nên dùng bèo nhỏ hoặc rêu
- plain, stocking-06 post: Gọi người hỏi lúc là "em" lúc là "mình", xưng hô lẫn lộn
- plain, stocking-06 post: "bèo tây": lục bình không hợp với bể cubic nhỏ. Nên dùng bèo nổi nhỏ như bèo tấm hoặc bèo rễ đỏ.
- ours, stocking-06 tank: "cá lớn không ăn cá con": this is wrong, and the swordtails in this tank will eat fry. X's own excerpt later says the fry should be separated so they don't get eaten.
- ours, stocking-06 tank: It pastes long platy excerpts about genetic diversity and lab mating studies that have nothing to do with the question.
- ours, stocking-06 tank: "cá lớn không ăn cá con": sai. Mún và nhất là cá kiếm trưởng thành vẫn hay ăn cá con, nên cần tách là vì vậy.
- ours, stocking-06 tank: Đoạn trích dài toàn chi tiết phòng thí nghiệm (giao phối, đa dạng dòng) không liên quan, người đọc phải lội qua quá nhiều.
- ours, stocking-07 post: Assumes 'sóc đỏ' is Aborichthys elongatus, a rare cold-water hillstream loach that no Vietnamese hobbyist means by that name. The temperature-conflict and fin-nipping warnings all follow from that wrong guess.
- ours, stocking-07 post: Never says how many fish to stock. It only gives the 6+6 minimums and a '79%' fill level with no basis given.
- ours, stocking-07 post: Hiểu sóc đỏ là Aborichthys elongatus, một loài chạch suối nước lạnh gần như không bán ở VN, nên đoán sai loài
- ours, stocking-07 post: Kết luận nhiệt độ 15–21°C không hợp neon dựa trên loài đoán sai, dễ làm người hỏi hoang mang
- ours, stocking-07 post: Chỉ nêu đàn tối thiểu 6 con, không trả lời bể này nuôi được tối đa bao nhiêu con
- plain, stocking-07 post: 'Sóc đỏ (cá Corydoras)': in Vietnam Corydoras are called 'cá chuột', not 'sóc', so this identification is probably wrong. It does at least ask the user to confirm the species.
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": ở Việt Nam Corydoras thường gọi là cá chuột, không phải sóc đỏ, nên đoán sai loài, dù X có hỏi lại
- ours, stocking-07 tank: Calls 6 neon + 6 red-tail hillstream loaches in an ~84 L tank '79% đầy' (79% full), which looks inflated and has no stated basis.
- ours, stocking-07 tank: The tool says they can be kept together ('nuôi chung được'), but X's own excerpt says the loach needs strong flow and suits few community tanks. X never warns that neon and this loach want different conditions, including that the loach needs cool, fast water, which is hard in Vietnam's heat.
- ours, stocking-07 tank: Gives only one 6+6 combination and doesn't answer the maximum number asked; the 79% stocking figure looks high for a tank of about 84 L and has no stated basis
- ours, stocking-07 tank: The excerpt says the loach needs strong flow, but the answer doesn't connect that to keeping neons alongside it
- plain, stocking-07 tank: Equates 'cá sóc' with Corydoras, but Vietnamese hobbyists call Corydoras 'cá chuột'.
- plain, stocking-07 tank: '10 con cho mỗi 20 lít' (10 neon per 20 L) is a heavy stocking rule, and Y states it with no source.
- plain, stocking-07 tank: Asks for the tank volume even though the tank is known to be 60×35×40 cm (about 84 L), then guesses '60 lít'.
- plain, stocking-07 tank: "Cá sóc (Corydoras)": in Vietnam Corydoras is called cá chuột, not cá sóc, so the advice is about the wrong fish
- plain, stocking-07 tank: "khoảng 10 con cho mỗi 20 lít": far too dense as a rule of thumb, and it calls itself conservative
- plain, stocking-07 tank: Asks for the tank volume and guesses about 60 L, when the 60×35×40 cm size is already known (about 84 L)
- ours, stocking-08 post: Lấy quy tắc thả thêm cá khi nitrate dưới 40 ppm, đo 2–3 tuần một lần, từ ví dụ bể 96 lít áp vào bể nano 4 lít đang quá tải: trong bể này nước bẩn nhanh hơn nhiều, nên quy tắc đó không phù hợp.
- plain, stocking-08 post: "Giảm số cá xuống khoảng 3-4 con nếu là loài nhỏ (neon...)": neon là cá bơi đàn, cần bể rộng hơn nhiều so với 4 lít, nên đây vẫn không phải lựa chọn tốt
- plain, stocking-08 post: "máy sưởi mini có điều nhiệt": ở phần lớn Việt Nam thường không cần, trừ mùa đông miền Bắc
- plain, stocking-08 post: "Ổn định nhiệt độ bằng máy sưởi mini": ở Việt Nam nước thường đủ ấm, nên sưởi ít khi cần. Trong bể 4 lít, việc giữ nước không quá nóng vào mùa hè quan trọng hơn.
- plain, stocking-08 post: "3-4 con" trong 4 lít vẫn hơi nhiều với nhiều loài. Câu này không nhắc đến lựa chọn tép hoặc chỉ nuôi 1 con betta.
- plain, stocking-08 tank: "1 lít nước cho 1 cm cá" is a loose rule, and Y gives it without warning that it doesn't hold for very small or new tanks; it never gets to the 4 L tank this hobbyist actually has
- ours, stocking-09 post: 'Cá ông tiên sống theo đàn nên nuôi từ 6 con' — cá ông tiên trưởng thành thường ghép cặp và giữ lãnh thổ; 6 con trong bể 80 cm còn chật và dễ đánh nhau hơn 2 con
- ours, stocking-09 post: 'cần bể dài từ 100 cm' — bể 80×45 cm (~126 L) vẫn nuôi ổn 1 cặp ông tiên; với loài này chiều cao bể quan trọng hơn chiều dài
- ours, stocking-09 post: Kết luận 'không nên nuôi chung' quá tuyệt đối: ở VN nuôi ông tiên chung neon rất phổ biến nếu thả lúc ông tiên còn nhỏ
- ours, stocking-09 post: 'Cá ông tiên sống theo đàn nên nuôi từ 6 con' — sai: ông tiên thường được nuôi theo cặp, và cá trưởng thành hay gây gổ trong nhóm nhỏ
- ours, stocking-09 post: 'cần bể dài từ 100 cm' — nói quá: bể khoảng 126 L, cao 45 cm, đủ cho một cặp
- ours, stocking-09 post: Kết luận cứng 'không nên nuôi chung' — thực tế cặp ghép ông tiên + neon rất phổ biến, rủi ro có thể kiểm soát
- ours, stocking-09 post: Công cụ báo 'Mức đầy bể 84% · Vừa phải' nhưng lại kết luận bể không phù hợp, tự mâu thuẫn
- plain, stocking-09 post: Liệt kê cây 'trạch, mơ' không rõ là cây gì, có thể gây nhầm, nhưng chỉ là lỗi nhỏ
- plain, stocking-09 post: 'Thêm cá lớn hoặc hung dữ (cichlid, ...)' — cá ông tiên cũng là một loài cichlid, nên cách diễn đạt này dễ gây hiểu nhầm (lỗi nhỏ)
- plain, stocking-09 post: Không nhắc rằng mùa hè ở Việt Nam nước bể thường lên 30°C trở lên, cao hơn khoảng 24–27°C mà bài nêu
- ours, stocking-09 tank: "cá ông tiên nên nuôi theo đàn từ 6 con": cá ông tiên thường nuôi theo cặp. Thả 6 con vào bể 80 cm sẽ chật hơn và cá đánh nhau nhiều hơn.
- ours, stocking-09 tank: "cần bể dài từ 100 cm": nói quá. Với cá ông tiên, chiều cao bể quan trọng hơn, và bể 80×35×45 (~126 L) nuôi 1 cặp là được.
- ours, stocking-09 tank: "Không nên nuôi chung": phủ nhận hẳn một combo phổ biến, vẫn làm được nếu thả neon to hoặc nuôi hai loài lớn lên cùng nhau.
- ours, stocking-09 tank: "Mức đầy bể: 84%": con số chính xác giả, không có căn cứ.
- ours, stocking-09 tank: "Cá ông tiên nên nuôi theo đàn từ 6 con" is wrong: keeping a pair of angelfish is standard practice, and six adults would need a far bigger tank, so this would make things worse.
- ours, stocking-09 tank: "cần bể dài từ 100 cm" is too strict: an 80×35×45 cm tank (about 126 L, 45 cm tall) is commonly used for a pair of angelfish.
- ours, stocking-09 tank: Its flat "Không nên nuôi chung" contradicts its own tool result, which rates the stocking at 84% ("Vừa phải"). It is overcautious about a common pairing that works with precautions.
- plain, stocking-09 tank: "tối thiểu khoảng 100 lít" rồi lại "nếu bể nhỏ hơn 80 lít thì nên cân nhắc": hai ngưỡng mâu thuẫn nhau.
- plain, stocking-09 tank: "Nên giữ khoảng 25–26°C" doesn't fit Vietnam's heat: most unchilled tanks there sit at 28–30°C, and the answer never warns that neons struggle at that temperature.
- ours, stocking-10 post: "thường phải nuôi riêng hoặc trong bể chỉ có một loài": quá cứng nhắc. Một con betta đực thường sống được với đàn neon trong bể 65 lít có cây.
- ours, stocking-10 post: "Mức đầy bể: 36%": con số không nói rõ cách tính, nhìn như tự đặt ra.
- ours, stocking-10 post: Khẳng định betta 'không nên nuôi chung', 'phải nuôi riêng' là quá cứng nhắc. Một con betta trong bể 65 lít nhiều cây với đàn neon là cách nuôi phổ biến và thường ổn.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon": bể đã có neon rồi. Thường người ta thả betta vào sau cùng để nó bớt giữ lãnh thổ.
- plain, stocking-10 post: "cá đá/tiger barb": ở Việt Nam "cá đá" thường là cá betta (cá chọi). Tiger barb là cá xê-cờ (cá hổ).
- plain, stocking-10 post: "thường dùng máy sưởi là hợp lý": ở phần lớn Việt Nam nước thường đã đủ ấm, chỉ cần sưởi vào mùa đông ở miền Bắc.
- plain, stocking-10 post: Bảo nên thả betta trước rồi mới thả neon, nhưng bể của bạn này đã có sẵn neon nên lời khuyên này không dùng được.
- plain, stocking-10 post: Nói dùng máy sưởi là hợp lý, trong khi ở Việt Nam nhiệt độ nước thường đã đủ 26–30°C nên phần lớn thời gian không cần sưởi.
- plain, stocking-10 post: Chưa cảnh báo việc neon có thể rỉa vây dài của betta.
- ours, stocking-10 tank: "cá betta... thường phải nuôi riêng hoặc bể chỉ một loài": this is too strict. One male betta with a school of neons in a planted tank of about 54 net litres is a common setup that often works. The real risks are neons nipping fins and the betta chasing neons, and the answer doesn't mention them.
- ours, stocking-10 tank: 'thường phải nuôi riêng hoặc bể chỉ một loài' goes too far: one betta with a school of neons in a ~55–60 L tank usually works if you watch it.
- ours, stocking-10 tank: Says not to add the betta to this tank. That is the wrong answer for 60×30×36 cm with 12 neons.
- plain, stocking-10 tank: It assumes the tank already has a betta ("nếu bể đang có một con betta đực"), but the tank only has neons.
- plain, stocking-10 tank: "cá tế bào (cá neon, cá rasbora)": this is a bad translation of "tetra", and Vietnamese hobbyists don't use it.
- plain, stocking-10 tank: It asks for the tank size even though the tank data is already known.
- plain, stocking-10 tank: Assumes there is already a betta in the tank ('đặc biệt nếu bể đang có một con betta đực'), but the tank only has 12 neons.
- plain, stocking-10 tank: 'cá tế bào (cá neon, cá rasbora)' is not a term Vietnamese hobbyists use for these fish.

## Failed

- setup-04 tank: ours Request timed out.
- setup-05 post: ours out of time
- sick-09 post: ours Request timed out.

## Each question

### algae-01 · post · plain wins (3 · 7)

**Asked:** Bể em mới set được hơn 2 tuần mà đã có chút rêu tóc trên lá bucep và nmc. Em dùng đèn Flat One treo cách mặt nước 20cm, lúc đầu để chế độ giả lập ánh sáng mặt trời, giờ em hạ xuống còn 7 tiếng chạy một mạch không ngắt quãng. Cứ 2 hôm em thay 30% nước một lần, có cho Seachem khử clo, Advance và thuốc khử rêu. Em mới châm thêm 2 lọ phân nước ADA là Brighty K và Green Brighty Mineral vì thấy nmc bị trắng lá, chỉ có ít lá xanh mọc từ dưới lên. Em làm vậy có sai không, rêu tóc này xử lý sao ạ?

**Judge:** Y gives a clear plan that fits this tank: lower the Flat One's intensity, stop the algae remover, test NO₃ and PO₄ before adding more fertiliser, and remove the algae by hand. X contradicts itself on light hours (calls 7 too long, then suggests 8–10), which could make the algae worse, and it gives almost no steps to follow. / I'd rather this hobbyist got X. It works through their own setup and gives clear steps in order: cut light intensity and hours, stop the algaecide, test NO₃ and PO₄ before adding more fertiliser, remove the algae by hand, and add Amano shrimp or Nerite snails. Y mostly repeats guide excerpts: it recommends 8–10 hours of light, which contradicts its own point that 7 hours is too long, and it gives no real plan.

**Ours lacks:** plan, tank-fit, follow-up. **Plain lacks:** diagnosis.

**Ours** (read 4 pages, stopped at the tools limit):

> Theo cẩm nang, bật đèn 7 tiếng liền là quá lâu: tổng nên khoảng 8–10 tiếng mỗi ngày và mỗi đợt không quá 4 tiếng, nên bạn nên chia thành nhiều đợt. Thay 30% nước mỗi 2 ngày gần với gợi ý 30–50% mỗi 3 ngày cho bể mới set dưới 2 tuần. Rêu tóc hay do thiếu CO2 (khoảng 90% ca), bể còn mới, hoặc phân thiếu hay thừa. Tôi chưa đọc được trang nào trong cẩm nang nói Brighty K và Green Brighty Mineral có đúng cho nmc bị trắng lá hay không, nên bạn nên kiểm tra thêm trước khi châm tiếp.
> 
> [Trích: Xử lý rêu tóc ở bể thủy sinh Hà Lan mới set › Chia giờ đèn ra sao]
> Tổng thời gian đèn mỗi ngày nên ở khoảng 8…

**Plain** (2410 characters):

> Bể mới 2 tuần mà có rêu tóc là khá phổ biến, và nguyên nhân thường là **ánh sáng quá mạnh, quá dài so với độ ổn định của bể**. Có vài điểm em nên điều chỉnh.
> 
> **1. Ánh sáng (nguyên nhân chính)**
> - Flat One treo 20 cm ở chế độ giả lập nắng là cường độ khá cao. Bể mới chưa ổn định về CO₂ và dinh dưỡng nên rất dễ bị rêu.
> - 7 tiếng liên tục vẫn hơi dài. Em nên:
>   - Hạ cường độ xuống khoảng 50–60% trong vài tháng đầu.
>   - Chạy 6–7 tiếng, hoặc chia 2 đợt (ví dụ 4 tiếng sáng + 2 tiếng chiều) để tránh đỉnh sáng quá lâu.
> - Lá nmc bị trắng có thể là dấu hiệu ánh sáng quá mạnh (bị cháy/bạc lá) kết hợp t…

### algae-01 · tank · tie or split (4.5 · 5)

**Asked:** Bể mới set của tôi đã có rêu tóc bám lên lá cây, xử lý sao?

**Judge:** Cả hai đều bỏ qua dữ liệu bể: không nhắc đến việc họ đang thay 30% nước mỗi 2 ngày, đang dùng thuốc khử rêu, hay nmc bị trắng lá. X ngắn gọn hơn, hợp với bể mới set (thay nước dày, cây chưa ra rễ, kiểm tra CO₂). Tuy vậy, mẹo không bật đèn liên tục quá 4 tiếng còn gây tranh cãi, và phần trích dẫn bên dưới lặp lại nhiều, đọc khá dài. Y đầy đủ hơn nhưng chung chung: gọi SAE là cá rìu là sai tên, lịch thay nước hằng tuần quá thưa, và kết thúc bằng việc hỏi lại. / Neither answer uses the tank's details: the Flat One hung 20cm above the water with no CO₂, the newly dosed Brighty fertiliser, the algae-remover chemical that may be behind the nmc's white leaves, or the slow-growing bucep. X gives a clearer, safer generic plan. Y repeats itself across several pasted excerpts, includes invented rules and figures, and tells this hobbyist to raise their light from 7 to 8 hours.

**Ours lacks:** tank-fit, diagnosis, too-long. **Plain lacks:** tank-fit, figures, too-long, diagnosis.

**Ours** (read 6 pages, stopped at the calls limit):

> Bể mới set bị rêu tóc thường do cây mới trồng chưa ra rễ nên hút ít dinh dưỡng, cộng với đèn bật quá lâu. Hãy chỉnh đèn về khoảng 8 tiếng mỗi ngày (không sáng liên tục quá 4 tiếng), thay 30–50% nước cứ ba ngày một lần trong hai tuần đầu, rồi gỡ rêu bằng bàn chải đánh răng và thả vài con tép Amano để ăn phần còn sót. Nếu bể có CO2, hãy treo drop checker và chỉnh cho nó xanh lá.
> 
> [Trích: Xử lý rêu tóc ở bể thủy sinh Hà Lan mới set › Bắt đầu từ đâu]
> 1. Nếu bể mới set dưới hai tuần, đặt lịch thay 30–50% nước mỗi ba ngày.
> 2. Xem lại giờ đèn: tổng 8–10 tiếng mỗi ngày, mỗi đợt không quá 4 tiếng.
> 3. …

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

### algae-02 · post · plain wins (3 · 7)

**Asked:** Mình có hồ 70x30x40, cây chủ yếu là ráy và rêu. Đang dùng đèn Chihiros A601 plus mà bị rêu chùm đen, dù hồ không nền và hơn tuần nay không châm phân. Mình tính thay đèn, nên chọn đèn nào cho bể này?

**Judge:** Y tells the hobbyist not to buy a new light yet. It blames the light being too strong for slow-growing ráy and rêu, and gives clear steps (shorter hours, lower intensity, scrub off the BBA, water changes) plus guidance if they still want a new light, with only small mistakes. X mostly pastes a guide, blames CO₂ the hobbyist likely doesn't use, and never answers which light to choose. / X answers this hobbyist's real problem. It says the light is too strong and on too long for slow-growing ráy and moss, and it gives clear first steps before buying anything: shorter light hours, lower intensity, removing the BBA by hand, and dosing fertiliser. It does slip on a few model names. Y pastes generic guide excerpts, blames CO₂ in a tank that probably has none, uses a rough lumen rule, and never answers which light to buy.

**Ours lacks:** tank-fit, plan, diagnosis, too-long. **Plain lacks:** too-long, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang tính theo lumen: bể 70x30x40 chứa khoảng 84 lít, nên cần khoảng 3.360 lumen tổng (40 lumen mỗi lít), và nên ưu tiên đèn LED RGB. Cẩm nang chưa ghi thông số lumen của Chihiros A601 Plus nên mình chưa xác nhận được đèn này đủ hay quá mạnh cho bể bạn. Rêu râu đen thường do CO2, nên hãy kiểm tra CO2 bằng drop checker trước khi thay đèn.
> 
> [Trích: Chọn đèn bể thủy sinh: loại đèn, giờ chiếu, lumen và phổ màu › Bắt đầu từ đâu]
> 1. Xem thể tích bể của bạn là bao nhiêu lít, rồi nhân với 40 để biết cần khoảng bao nhiêu lumen.
> 2. Chọn đèn LED có tổng lumen gần con số đó, ưu tiên loại RGB.
> 3. Với …

**Plain** (2238 characters):

> Với hồ 70x30x40 (khoảng 84L) trồng ráy và rêu, mình nghĩ **bạn chưa cần thay đèn ngay**. Rêu chùm đen (BBA) thường xuất hiện khi ánh sáng quá mạnh hoặc kéo dài so với khả năng hấp thụ dinh dưỡng và CO₂ của cây, và ráy với rêu vốn là nhóm cây ưa ánh sáng thấp đến vừa.
> 
> **Nguyên nhân có khả năng nhất:**
> - **Cường độ hoặc thời gian chiếu sáng quá mức.** A601 Plus khá mạnh cho hồ 70cm, nhất là khi hồ không có nền và cây ít sinh trưởng.
> - **Cây không tăng trưởng đủ để cạnh tranh.** Ráy chậm lớn nên không hấp thụ hết dinh dưỡng, và rêu chùm đen tận dụng phần dư đó.
> - **Lịch chiếu sáng không ổn định…

### algae-02 · tank · plain wins (4 · 6)

**Asked:** Bể của tôi bị rêu chùm đen dù không châm phân, có phải do đèn không?

**Judge:** Bể này có đèn mạnh trong khi chỉ trồng cây chậm lớn như ráy và rêu, không CO₂, không phân, nên Y nói đèn có thể là một nguyên nhân là đúng hơn. Y còn đưa ra cách xử lý cụ thể như số giờ chiếu đèn, tỉa lá, thay nước và thêm cây mọc nhanh. X chủ yếu trích lại cẩm nang mà không có bước làm cụ thể, lại còn gạt vai trò của đèn đi. / X gives a clear fix plan with numbers: 6–8 hours of light, 20–30% weekly water changes, removing affected leaves, and adding fast-growing plants. That fits a tank of slow-growing anubias and moss under a strong light with no CO2 or fertiliser, even though X doesn't say so directly. Y only explains causes from the guide, never tells them what to do, and ignores their tank details.

**Ours lacks:** plan, figures, tank-fit. **Plain lacks:** tank-fit, follow-up.

**Ours** (read 3 pages):

> Không hẳn là do đèn. Cẩm nang cho biết rêu chùm đen (BBA) thường đến từ ba nhóm: CO2 thiếu hoặc dao động, chất thải hữu cơ tích nhiều (bể bẩn), và cây yếu. Đèn mạnh tự nó không gây BBA, nhưng làm bể mất cân bằng nếu CO2 và dinh dưỡng không theo kịp, nên bạn nên kiểm tra CO2, vệ sinh bể và sức khỏe cây trước.
> 
> [Trích: Rêu râu đen BBA: 7 nguyên nhân và cách phòng trong bể thủy sinh › Ba nguyên nhân chính gây BBA]
> Phần lớn trường hợp BBA rơi vào một trong ba nhóm sau, hoặc kết hợp vài nhóm.
> [photo: Tảo BBA mọc thành chùm đen xơ xác trên lá cây trong bể.]
> [video at 162s: Bể thủy sinh trồng nhiều …

**Plain** (1709 characters):

> Đèn **có thể là một nguyên nhân**, nhưng thường không phải là nguyên nhân duy nhất. Rêu chùm đen (BBA) thường xuất hiện khi có nhiều yếu tố cùng lúc.
> 
> **Các nguyên nhân thường gặp:**
> 
> 1. **Đèn quá mạnh hoặc bật quá lâu:** Cường độ sáng cao hoặc thời gian chiếu trên 8-10 giờ/ngày rất dễ kích rêu phát triển, đặc biệt khi CO2 không ổn định.
> 2. **CO2 thiếu hoặc dao động:** Nếu bể trồng cây có đèn mạnh mà CO2 thấp hoặc không đều, cây phát triển kém và rêu có lợi thế cạnh tranh.
> 3. **Dinh dưỡng vẫn có, dù không châm phân:** Thức ăn thừa, chất thải của cá, và phốt phát/nitrat trong nước máy đều là n…

### algae-03 · post · ours wins (6 · 3)

**Asked:** Mình mới chơi, hồ đầu tiên trồng trân châu ngọc trai, vừa set được 3 ngày. Từ 2 hôm trước nước chuyển xanh, mình nghi là rêu nước xanh. Mình thay 30% nước thì hôm sau nước còn xanh hơn. Hôm nay mình tháo bớt 1 bóng của đèn Odyssea dual, chỉnh timer từ 7 tiếng xuống 4 tiếng và thay bông lọc. Có nên tiếp tục thay nước mỗi ngày không? Đèn như vậy có dư không hay nên tắt luôn vài ngày?

**Judge:** X would help this hobbyist more. It names floating algae as the cause and backs keeping 30% daily water changes in the first week and shorter light hours. It also offers a blackout or a UV lamp as options. Y mistakes the Odyssea light for a UV lamp and says to run both tubes all the time. It also says to stop water changes, which is wrong for a new planted tank. / Y is better. It says the green water is free-floating algae fed by too much light and nutrients, and its new-tank guide supports keeping up 30% daily changes in the first week. It also covers cutting the light and blacking out the tank, though it doesn't say whether 4 hours is enough. X treats the light as a UV lamp, which could lead them to keep the light on longer, and it wrongly tells them to stop changing water.

**Ours lacks:** tank-fit, diagnosis, plan. **Plain lacks:** wrong, tank-fit, asks-only.

**Ours** (read 6 pages, stopped at the tools limit):

> Nước xanh là tảo phù du nở do thừa sáng hoặc thừa dinh dưỡng, và thay nước nhiều một lần thường không hết vì tảo mọc lại rất nhanh. Cẩm nang khuyên cắt nguyên nhân trước: rút ngắn giờ bật đèn (phòng ngừa thì không quá 6–8 tiếng mỗi ngày), cho ăn ít lại, đo nitrat và phosphat, và giãn lịch thay nước 30% mỗi ngày khi cây đã lên đều. Cẩm nang không nói về công suất đèn Odyssea dual nên không trả lời được đèn có dư không; nếu nước vẫn xanh hoặc cá nổi mặt đớp khí buổi sáng thì cần xử lý gấp.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Chữa]
> Phần lớn trường hợp chỉ cần…

**Plain** (1616 characters):

> Mình khuyên **đừng thay nước mỗi ngày**, và **đừng tắt hẳn đèn**, nhất là nếu đây là đèn UV diệt tảo.
> 
> **Vì sao nước xanh:** Hồ mới set 3 ngày thường chưa có hệ vi sinh ổn định, nên dinh dưỡng (thức ăn thừa, phân, nước máy) dư thừa, cộng với nắng và ánh sáng, làm tảo nổi (nước xanh) bùng lên. Thay 30% mỗi ngày đưa thêm nước máy vào, có thể mang thêm dinh dưỡng và làm hồ không kịp ổn định. Thường thì nước xanh kiểu này tự hết sau 1-3 tuần khi hồ ổn định.
> 
> **Việc nên làm:**
> - **Ngừng thay nước hằng ngày.** Chỉ thay khi thử nước thấy amonia hoặc nitrit tăng, và mỗi lần chỉ khoảng 10-15%.
> - **Thử…

### algae-03 · tank · tie or split (5.5 · 5.5)

**Asked:** Bể mới set vài ngày đã bị nước xanh, nên thay nước hay tắt đèn?

**Judge:** Y answers the question directly: blackout first, then only moderate water changes. It explains why changing water alone won't fix it, and that fits what they saw when a 30% change made the water greener. Neither answer uses their details, such as the 4-hour light schedule or the filter floss they just replaced in a tank that is only a few days old. X repeats advice they have already followed and buries it under a long, generic excerpt. / Y answers the actual question: water changes alone won't fix it, which matches their experience of the water getting greener after a 30% change. It then gives a clear order of steps: blackout or a UV lamp (sold in Vietnamese fish shops), then a large water change, while warning that blackout is hard on the plants. Neither answer uses the tank's details: neither notices the light is already at 4h or warns against swapping filter floss in a new tank. X's advice to go back up to 6-8h of light is a step backwards.

**Ours lacks:** tank-fit, too-long, follow-up. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 3 pages, stopped at the calls limit):

> Đừng chỉ thay nước: nước xanh là tảo nở rộ và sẽ mọc lại ngay sau khi thay. Ceh, hãy cắt nguyên nhân trước (rút ngắn thời gian bật đèn, tránh nắng chiếu vào bể), rồi làm trong nước bằng cách che tối tối đa 7 ngày hoặc dùng đèn UV, cho lọc và sủi vẫn chạy. Sau khi nước trong, thay nhiều nước để vớt xác tảo và giữ thay ít nhất 20% nước mỗi tuần.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Chữa]
> Phần lớn trường hợp chỉ cần làm đủ các bước sau:
> 1. Tìm và cắt nguyên nhân: rút ngắn thời gian bật đèn, dời bể khỏi chỗ nắng chiếu, cho ăn ít lại, đo nitrat và phosphat.
> 2. L…

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

### algae-04 · post · plain wins (4.25 · 7.25)

**Asked:** Mình chơi hồ 60x40x40 theo kiểu Hà Lan, dùng 2 cây đèn trắng Aquablue, 1 cây dài 60cm và 1 cây 45cm, vậy có bị dư sáng không? Hồ mới set được 7 ngày mà tảo nâu phát triển nhiều quá, CO2 và dinh dưỡng thì tương đối ổn định, mỗi ngày thay 30% nước kèm vệ sinh hồ, vậy mà rêu nâu cứ bám hoài trên đá và mặt kính. Hồ mình đang bị gì, nên làm sao?

**Judge:** Y answers the light question directly, giving 6–7 hours a day and a timer. It addresses the daily 30% water changes and gives an ordered plan with figures. X is mostly pasted guide excerpts, with off-topic hydrogen peroxide and BBA material, and never says whether the light is too strong. / Mình chọn X vì nó trả lời thẳng câu hỏi đèn có dư sáng không, cho số giờ bật đèn cụ thể, góp ý về việc thay nước mỗi ngày và đưa các bước xử lý theo thứ tự. Y thì né câu hỏi về đèn, bỏ qua lịch thay nước hằng ngày của bạn, lại kèm nhiều trích đoạn lạc đề (oxy già, rêu chùm đen, dark start) khiến người đọc phải lọc mới thấy ý chính.

**Ours lacks:** tank-fit, too-long, plan. **Plain lacks:** follow-up.

**Ours** (read 4 pages, stopped at the calls limit):

> Bể mới 7 ngày mà đã có rêu nâu (tảo silic) là chuyện thường: cẩm nang cho biết khoảng 90% trường hợp do bể còn mới, thường xuất hiện từ tuần thứ 3–4 và tự hết khi bể ổn định, nên bạn đừng thay đổi lung tung. Cẩm nang chưa có tiêu chuẩn nào để kết luận 2 đèn của bạn có dư sáng hay không, nhưng mục kiểm tra lại có đủ các điểm để bạn tự soát: đèn bật quá lâu hay quá mạnh không, bể có dính nắng không, nitrate và PO4 có tụt về 0 không (dù bạn bón đều thì vẫn nên đo), và lọc có chạy đủ 5–7 lần thể tích bể mỗi giờ không. Trong lúc chờ, bạn chà kính và đá bằng mút hoặc bàn chải đánh răng, và có thể t…

**Plain** (2537 characters):

> # Tảo nâu trong hồ mới là khá phổ biến
> 
> Lớp nâu bám trên đá và kính thường là **tảo silic (diatom)**. Nếu lau bằng tay thì bong ra dễ dàng, đó là dấu hiệu nhận biết. Tảo nâu hay xuất hiện trong 2-8 tuần đầu của hồ mới, vì lúc này hệ vi sinh chưa ổn định, cây chưa hấp thụ hết dinh dưỡng, và nước thường giàu **silicate**.
> 
> ## 1. Có bị dư sáng không?
> 
> Với hồ khoảng 96L và 2 đèn (60cm + 45cm) thì **cường độ ở mức trung bình-khá**, chưa phải là quá dư, nhất là với kiểu Hà Lan vốn cần sáng tương đối. Tuy nhiên, trong giai đoạn mới set, **thời gian bật đèn** mới là yếu tố dễ gây tảo:
> - Nên bật **6-7…

### algae-04 · tank · tie or split (5.5 · 5.25)

**Asked:** Bể mới set một tuần bị tảo nâu bám kín đá và kính, làm sao?

**Judge:** X nói đúng và gọn nguyên nhân (bể mới chưa ổn định) và cách xử lý lâu dài (cấy bông lọc cũ, tăng cây). Nhưng X không dùng thông tin bể của người hỏi, còn phần trích dẫn thì độn nhiều câu FAQ không liên quan. Y có nhiều bước cụ thể hơn, như số giờ bật đèn. Tuy vậy Y có lỗi sai (than hoạt tính khử silicat, gọi Otocinclus là 'cá chuột'), khuyên thay nước hàng tuần trong khi họ đang thay hàng ngày, và hỏi lại những thông tin đã biết. / Cả hai đáp án đều chẩn đoán đúng là tảo cát, loại hay gặp ở bể mới, và đều không dùng tới thông số bể của người hỏi. X có các bước rõ ràng hơn kèm số giờ bật đèn, nhưng có một lỗi nhỏ về than hoạt tính và hỏi lại những thông tin app đã có. Y đưa ra cách lâu dài hay hơn (lấy bông lọc cũ để cấy vi sinh, trồng thêm cây), nhưng quá ngắn và bị độn bằng FAQ không liên quan.

**Ours lacks:** tank-fit, figures, too-long, plan. **Plain lacks:** tank-fit, wrong.

**Ours** (read 4 pages):

> Tảo nâu phủ kính và đá trong tuần đầu của bể mới là chuyện thường gặp. Cẩm nang cho biết nó thường tự hết sau 4–6 tuần khi bể ổn định, lớp tảo lau là trôi, và bạn có thể chà sạch, kiểm tra lại đèn rồi thay 30–50% nước vài lần. Cách lâu dài là đẩy nhanh quá trình trưởng thành của bể bằng bông lọc cũ hoặc mulm, và tăng số cây để cây cạnh tranh với tảo.
> 
> [Trích: Cách kiểm soát tảo nâu (tảo cát) trong bể thủy sinh › Xử lý tảo cát trong bể mới]
> Tảo cát bùng trong vài tuần đầu sau khi set là chuyện thường gặp ở bể thủy sinh. Xử lý tảo cát ở bể mới gồm hai phần. Phần thứ nhất là đẩy nhanh quá trình …

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

### algae-05 · post · plain wins (3.75 · 7.25)

**Asked:** Em set bể Hà Lan được gần 1 tháng, đèn mới lên 8h/ngày (10h sáng đến 18h), cây phát triển rất tốt, không có rêu hại. Phía trước dưới nền em trồng rau thơm. Nhưng ở mặt kính phía dưới, chỗ giáp nền, có tảo nâu bám kính và một chút tảo nhớt xanh, có phải do đèn trong nhà buổi tối hắt vào bể không? Bucep em buộc giá thể thả vào được 1 tuần cũng có tảo nâu trên lá. Em thay nước đều 2 ngày 1 lần. Em có thả ốc nerita nhưng nó chỉ nằm im không bò, kiểm tra thì vẫn sống. Xử lý tảo nâu với rêu nhớt sao ạ?

**Judge:** Y trả lời từng câu bạn hỏi: đèn phòng hắt vào chỉ góp phần nhỏ, tảo nâu, rêu nhớt và ốc nerita nằm im. Y đưa ra các bước xử lý cụ thể, hợp với bể mới khoảng 1 tháng. Y chỉ có một lỗi nhỏ: nói rau thơm làm dư dinh dưỡng, trong khi đây là cây hút dinh dưỡng. X chủ yếu dán nguyên đoạn trích từ cẩm nang, lan sang oxy già, cá bút chì, rêu chùm đen không liên quan. X cũng không trả lời câu hỏi về đèn phòng hay ốc nerita. / X is the better answer. It speaks to this tank directly: it says the room light isn't the main cause, explains why a new tank gets diatoms, gives separate steps for diatoms and cyanobacteria, and explains why the nerita is sitting still. Y mostly pastes guide excerpts that don't fit this tank, skips two of the questions, and doesn't give the hobbyist steps in order.

**Ours lacks:** plan, tank-fit, too-long. **Plain lacks:** figures, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa nói rõ đèn nhà hắt vào bể buổi tối có gây tảo hay không, và chưa có trang nào về ốc nerita nằm im. Theo cẩm nang, tảo nâu ở bể mới thường tự hết sau 4–6 tuần khi bể ổn định, lau bằng tay khi thay nước, còn rêu nhớt xanh có mùi đầm lầy thì có thể là vi khuẩn lam, cần kiểm tra nitrat và phốt phát.
> 
> [Trích: Rêu hại trong bể thủy sinh: nhận biết từng loại rêu và cách diệt › Kiểm tra lại]
> - Bạn đã xác định đúng loại rêu chưa?
> - Đèn có bật quá lâu, quá mạnh không? Bể có dính nắng trực tiếp không?
> - Nitrate có bị tụt về 0 không? PO4 có bị cạn không? Sắt có vượt 0.15ppm không?
> - Drop ch…

**Plain** (2581 characters):

> Tảo nâu thường gặp ở bể mới khoảng 1–2 tháng. Thường là **tảo silic (diatom)**, xuất hiện khi bể chưa cân bằng, nguồn sáng và dinh dưỡng đang dư. Tình trạng này thường tự giảm khi bể ổn định. Còn lớp nhớt xanh có thể là **vi khuẩn lam (cyanobacteria)**, dễ xuất hiện ở vùng đáy kính, nơi ít dòng chảy và tích tụ mùn bã hữu cơ.
> 
> **1. Đèn trong nhà hắt vào bể có phải nguyên nhân không?**
> Có thể góp phần, nhưng thường không phải nguyên nhân chính. Ánh sáng yếu từ đèn phòng vào buổi tối ít ảnh hưởng đến tảo. Bạn nên kiểm tra:
> - Ánh nắng hoặc đèn phòng có chiếu trực tiếp vào mặt kính không.
> - Đèn bể…

### algae-05 · tank · ours wins (5.5 · 4.75)

**Asked:** Bể tôi có tảo nâu và tảo nhớt xanh ở chân kính sát nền, xử lý thế nào?

**Judge:** X correctly ties the brown algae (diatoms) to a tank that's still new, which fits a tank running 4 weeks, and it stays short and sticks to its guide. Neither answer uses the tank's details: the indoor light hitting the tank in the evening, water changes every 2 days, or the nerites lying still. Y lays out more steps but is generic, suggests snails they already have, and gives no H₂O₂ dose, so X comes out slightly ahead. / I'd rather this hobbyist got answer Y. It correctly says the brown algae is diatoms, which are normal in a tank this new, and warns against algae-killing chemicals. X gives longer, ordered steps, but they could fit any tank: it recommends nerites the hobbyist already keeps and lists too many treatments. Neither answer uses the tank's details: the indoor light hitting the tank at night, or the nerites that aren't moving.

**Ours lacks:** plan, tank-fit, follow-up. **Plain lacks:** tank-fit, too-long, figures, diagnosis.

**Ours** (read 5 pages):

> Tảo nâu dạng mảng như phủ bụi thường là tảo cát, hay gặp ở bể mới set; cạo chà chỉ đỡ tạm, muốn hết hẳn phải trồng đủ cây để tranh dinh dưỡng, châm APT 1 đều theo lịch và không dùng thuốc diệt tảo. Lớp nhớt xanh lục sẫm là vi khuẩn lam: với mảng nhỏ thì gỡ tay hoặc nhỏ APT Fix, tăng lưu thông nước và oxy ở chỗ bị bám, thay nước và hút nền nhẹ. Với đợt bùng phát nặng, cẩm nang có nhắc đến che tối bể 3-5 ngày và một số thuốc, nhưng bạn nên xem kỹ mục xử lý trước khi dùng.
> 
> [Trích: Cách loại bỏ tảo nâu (tảo cát) trong bể thủy sinh › Làm sao để hết tảo nâu?]
> Muốn dọn sạch tảo cát thì phải làm cùn…

**Plain** (2489 characters):

> Tảo nâu và tảo nhớt xanh ở chân kính thường xuất hiện khi bể dư dinh dưỡng, ánh sáng hoặc dòng chảy chưa tốt. Bạn xử lý theo các bước sau:
> 
> ## 1. Xác định loại tảo
> - **Tảo nâu** (diatom): lớp bột nâu dễ lau, thường xuất hiện ở bể mới hoặc khi ánh sáng yếu. Thường tự biến mất khi bể ổn định.
> - **Nhớt xanh** (vi khuẩn lam, cyanobacteria): lớp nhầy, có thể dày, màu xanh hoặc đen, dễ bong thành mảng. Đây là loại khó xử lý hơn và cho thấy bể đang dư chất dinh dưỡng hoặc thiếu oxy/lưu thông nước ở đáy.
> 
> ## 2. Xử lý ngay
> - **Cọ và lau kính** bằng miếng cọ mềm hoặc nam châm lau kính. Với vi khuẩn lam…

### algae-06 · post · plain wins (2.75 · 7.25)

**Asked:** Em đang dùng bể 6-4-4, lọc Sunsun 702B (1000L/h), lọc phụ Sunsun 603. CO2 cho qua sủi đánh thẳng vào đầu in của lọc, có van điện bật tắt theo đèn. Thỉnh thoảng nghe trong lọc chính có tiếng lọc xọc, lúc khác lại thấy đầu out bắn ra bọt khí to cỡ hạt đỗ. Bể đang nhiều rêu tóc, rêu sừng hươu và rêu lông tơ nên em đang cho CO2 dồi dào hơn, tầm 6-7 giọt/giây. Trộn như vậy có ổn không khi CO2 nhiều? Lọc phụ gắn thêm trộn cánh quạt ở out được không hay sẽ yếu dòng? Cá tép có nguy cơ chết vì ngạt CO2 không?

**Judge:** X mostly says it can't answer and pastes guide excerpts. It never explains the noise or the bubbles, and it doesn't answer the shrimp question. Y names the cause (CO2 gas pulled into the pump), gives the dose to cut back to, warning signs and a check valve, plus advice on the algae. Y has a few small mistakes, like mixing up the drop checker colours and where to put the diffuser, but it is still far more useful. / X là câu trả lời giúp được người hỏi. Nó chỉ đúng nguyên nhân: khí CO2 bị hút vào bơm 702B gây tiếng lọc xọc và mất mồi. X khuyên giảm CO2 và theo dõi bằng drop checker, nêu các dấu hiệu cá tép bị ngạt, rồi trả lời từng câu hỏi theo đúng bể của người hỏi. Y bỏ qua phần lớn câu hỏi, chủ yếu chép lại cẩm nang và còn ghi sai rằng drop checker chuyển vàng là 'rất hiếm gặp'.

**Ours lacks:** diagnosis, plan, tank-fit, too-thin. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa trả lời được chắc chắn việc tép có nguy cơ ngạt vì CO2 hay không, cũng chưa nói về nguyên nhân tiếng lọc xọc và bọt từ đầu out, nên phần này mình không trả lời được. Theo cẩm nang, bộ trộn gắn ngoài làm giảm lưu lượng lọc, còn sủi đặt trong bể dễ dùng hơn, và nên chỉnh CO2 dần theo màu drop checker (xanh lá là vừa đủ, xanh dương là thiếu) thay vì tăng theo cảm tính. Lọc thùng thực tế thường chỉ chạy dưới một nửa lưu lượng ghi trên hộp, nên trước khi gắn thêm gì vào lọc phụ, bạn nên vệ sinh cánh quạt và lưới chắn đầu hút trước.
> 
> [Trích: Lắp phụ kiện bể thủy sinh: đèn, timer, CO2,…

**Plain** (3807 characters):

> # Trả lời ngắn gọn
> 
> **Trộn CO2 vào đầu hút của lọc chính đang gây tiếng xọc và bọt lớn.** Với lượng 6-7 giọt/giây, bể 96-100L dễ bị dư CO2, nhất là khi bạn tăng đột ngột. Nên giảm lượng CO2, dùng đo drop checker để kiểm soát, và chuyển điểm bơm CO2 ra khỏi đầu hút lọc chính.
> 
> ## 1. Tiếng "lọc xọc" và bọt to ở đầu out
> 
> - **Khí bị hút vào bơm:** Bọt CO2 đi vào đầu hút, bơm 702B hút cả khí lẫn nước. Khí làm bơm mất mồi, chạy ồn, lưu lượng giảm, lâu dài có thể mòn cánh bơm và phớt.
> - **Bọt to ở out:** CO2 không kịp hòa tan nên thoát ra theo dòng nước. Bọt to cỡ hạt đỗ nghĩa là lượng khí đang vượt…

### algae-06 · tank · plain wins (4 · 5)

**Asked:** Bể tôi nhiều rêu tóc, rêu sừng hươu và rêu lông tơ, tăng CO2 có giúp được không?

**Judge:** Neither answer notices what the tank details show: the gurgling filter and the big bubbles at the outlet mean CO2 is collecting as gas in the filter and not dissolving, which fits the staghorn algae. Y gives a fuller plan (shorter light hours, water changes, cleanup crew, spot treatment) despite a wrong pH figure. X is thin and leaves the fuzz algae out. / Không answer nào thấy vấn đề chính của bể này. CO₂ đang ở 6-7 giọt/giây, đã nhiều cho một bể khoảng 96 L. Lọc kêu xọc xọc và đầu out ra bọt khí to cho thấy CO₂ không tan hết, khí bị kẹt trong thùng lọc. Vì vậy chưa nên tăng CO₂ mà phải sửa cách hòa tan trước. X có các bước rõ hơn (giảm giờ đèn, thay nước, gỡ rêu bằng tay, dùng H₂O₂ cho rêu sừng hươu) nên làm theo được nhiều hơn, nhưng mục tiêu giảm pH ghi sai. Y viết tiếng Việt tự nhiên hơn và dựa vào cẩm nang, nhưng mỏng và bỏ qua rêu lông tơ.

**Ours lacks:** tank-fit, plan, too-thin. **Plain lacks:** tank-fit, diagnosis, local.

**Ours** (read 6 pages, stopped at the tools limit):

> Theo cẩm nang, thiếu CO2 là nguyên nhân chính khiến rêu tóc mọc, nên châm CO2 đủ là hướng đúng; cách kiểm tra là treo drop checker trong bể và chỉnh cho nó chuyển xanh lá. Với rêu sừng hươu, cẩm nang khuyên bơm thuốc diệt rêu chùm đen dạng lỏng thẳng vào chỗ rêu bám, còn rêu lông tơ thì cẩm nang chưa nói riêng, nên bạn nên xác định đúng loại rêu trước khi xử lý.
> 
> [Trích: Rêu tóc trong bể thủy sinh: vì sao mọc và cách dứt điểm › Sửa gốc để rêu không quay lại]
> Dọn rêu xong mới được nửa việc. Nửa còn lại là sửa thứ đã khiến rêu mọc.
> Bể có châm CO2. Nhiều người hỏi bể bao nhiêu lít thì cần bao nh…

**Plain** (1978 characters):

> **Có, tăng CO₂ thường giúp**, nhưng thường chỉ là một phần của giải pháp. Rêu tóc, rêu sừng hươu và rêu lông tơ hay xuất hiện khi bể mất cân bằng: ánh sáng quá mạnh hoặc kéo dài, dinh dưỡng (đặc biệt là phosphate và nitrate) dư thừa, còn cây thủy sinh thì thiếu CO₂ nên phát triển chậm. Khi cây được cấp đủ CO₂, chúng lớn nhanh hơn, hấp thụ dinh dưỡng và cạnh tranh ánh sáng tốt hơn rêu.
> 
> **Cách tăng CO₂ hiệu quả**
> - Đo bằng drop checker hoặc theo pH: mục tiêu thường là pH giảm khoảng 0,2–0,3 so với nước không CO₂, hoặc drop checker chuyển xanh vàng nhẹ (khoảng 25–30 ppm).
> - Bật CO₂ cùng lúc với…

### algae-07 · post · plain wins (3 · 6.5)

**Asked:** Em là tân binh theo trường phái Hà Lan, phần cứng gần như đủ cho một bể Hà Lan cơ bản: lọc chuẩn, CO2 dồi dào, nền trộn giàu dưỡng, đèn WRGB, quạt... Vậy mà em thất bại liên tiếp 5 bể, bể nào cũng bị: cây xoắn ngọn, xoắn tít, mất màu, teo ngọn, ngọn trắng toát và dị dạng; rêu hại bùng phát. Đèn bật 9h liên tục, CO2 3-4 giọt/giây, mới setup em thay hơn 100% nước hằng ngày trong 2 tuần (vì nghe nói nền trộn rất giàu dưỡng, mà nền mua nên em không biết công thức). Giờ em muốn chuyển qua nền công nghiệp + cốt nền nhưng lăn tăn về tuổi thọ và dinh dưỡng cho bể Hà Lan vốn rất háu ăn. Em nên làm sao?

**Judge:** Y is the one I'd want this hobbyist to get. It pins the problem on the huge water changes plus strong light and CO2 without matching fertiliser, gives steps in order with figures (KH, NO3, PO4, light hours), and answers the question about substrate lifespan. X mostly pastes guide excerpts, says it can't find the cause, and gives no plan for this tank. / X gives a clear order of steps: stop the daily 100% water changes, cut the light, keep CO2 steady with a drop checker, fertilize, and set up the substrate in two layers. It has a mistake about Stratum and doesn't point to calcium. Y does mention calcium for twisted new leaves, but the rest is mostly long excerpts about the wrong deficiency, with no plan for this Dutch tank.

**Ours lacks:** plan, tank-fit, too-long. **Plain lacks:** diagnosis.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa có công thức hay hướng dẫn riêng cho bể Hà Lan, nên mình không xác định được nguyên nhân 5 bể trước hỏng, cũng như tuổi thọ cụ thể của nền công nghiệp. Cẩm nang nói nền công nghiệp mua về đổ vào là trồng được nhưng hết dinh dưỡng nhanh hơn nền tự trộn, và cảnh báo thay nước đều mà không đo nitrat có thể làm cây thiếu nitơ. Lá non xoắn thường là dấu hiệu thiếu canxi hoặc nước thiếu độ cứng; cách xử lý là châm đúng chất cây đang thiếu, và chờ 2 đến 3 tuần mới thấy kết quả.
> 
> [Trích: Cách chọn phân nền thủy sinh cho người mới: loại nào, mua bao nhiêu › Nền trộn hay phân nền công ngh…

**Plain** (3164 characters):

> Em không nên đổ lỗi cho nền trộn hay bỏ phương pháp Hà Lan. Theo mô tả, nguyên nhân nhiều khả năng nằm ở **thiếu dinh dưỡng do thay nước quá nhiều**, cộng với **CO2 và ánh sáng cao mà không có bón phân tương ứng**.
> 
> ## 1. Chẩn đoán
> 
> - **Thay 100% nước mỗi ngày trong 2 tuần** đã rửa trôi phần lớn dưỡng chất hòa tan và vi lượng (sắt, mangan, kẽm...). Nền trộn giàu dưỡng chỉ bổ sung từ từ, nên sau khi bị rửa trôi, cây đói ngay. Đây là lý do cây non bị xoắn, trắng ngọn, dị dạng.
> - **Ánh sáng 9h + CO2 3-4 giọt/giây + không bón phân đều** là tổ hợp khiến cây tiêu thụ nhanh, trong khi nguồn cung khô…

### algae-07 · tank · plain wins (4 · 4.75)

**Asked:** Bể tôi cứ bị rêu hại bùng phát và cây xoắn ngọn, trắng ngọn, phải làm sao?

**Judge:** X's point about checking CO₂ with a drop checker matters for a tank with a fan and strong light, but X gives no answer at all about the twisted, white tips, and its excerpts blame too few water changes when this hobbyist did 100% daily. Y is generic, gets the cause of the tips wrong and asks for details the app already has, but it gives usable steps (cut the light to 6–8 hours, keep CO₂ stable, trim the damaged tips), so it is slightly more useful. / Cả hai câu trả lời đều không dùng thông tin bể của bạn này (đèn bật 9 giờ, CO₂ 3-4 giọt/giây, nền giàu dưỡng, đã hỏng 5 bể). X ít ra cũng cho các bước làm được ngay: giảm đèn xuống 6-8 giờ, giữ CO₂ ổn định, bổ sung vi lượng. X có vài lỗi (khuyên thả ốc táo, trồng bèo tây) và hỏi lại những điều đã biết. Y không giải thích được hiện tượng xoắn ngọn, trắng ngọn và chủ yếu chỉ trích dẫn tài liệu.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** tank-fit, diagnosis, asks-only, too-long.

**Ours** (read 3 pages, stopped at the time limit):

> Cẩm nang chưa có mục nào giải thích lá non xoắn và trắng ngọn, nên phần này mình không trả lời được. Về rêu hại, cẩm nang cho rằng nguyên nhân thường là dinh dưỡng dư do thay nước ít, và với rêu chỉ hay rêu râu, bạn nên kiểm tra CO2 bằng ống thử drop checker trước khi đổ lỗi cho phân. Với rêu râu hoặc rêu chỉ, carbon lỏng là cách xử lý nhanh, chỉ châm một ít trong lúc có rêu.
> 
> [Trích: Lịch châm phân nước đơn giản cho từng kiểu bể thủy sinh › Rêu hại bùng lên: kiểm tra CO2 trước khi đổ lỗi cho phân]
> Ở bể rừng, rêu tóc (hair algae) mọc lên do CO2 bị thiếu. Khi set bể, CO2 đã được chỉnh cho drop…

**Plain** (2889 characters):

> Hiện tượng rêu bùng phát kèm cây xoắn ngọn, trắng ngọn thường do **mất cân bằng dinh dưỡng và ánh sáng**, hoặc **thiếu vi lượng (đặc biệt là sắt)**. Bạn có thể xử lý theo các bước sau.
> 
> ## 1. Kiểm tra nước trước
> Nên dùng bộ test (NH₃/NH₄⁺, NO₂⁻, NO₃⁻, PO₄³⁻, pH, KH, GH). Nếu chưa có, ít nhất hãy để ý:
> - **Amoniac hoặc nitrit > 0**: có thể do cá quá tải, cho ăn dư, lọc chưa chín hoặc thiếu vi sinh. Đây là nguyên nhân nguy hiểm nhất, phải thay nước ngay.
> - **Nitrat và photphat cao**: là "thức ăn" của rêu. Nên giữ nitrat dưới khoảng 20–30 mg/L.
> 
> ## 2. Giảm ánh sáng và kiểm soát thời gian chiếu s…

### algae-08 · post · plain wins (3.5 · 7.5)

**Asked:** Em mới chơi, bể đúc 50cm, lúc đầu nuôi 9 mún + 3 bảy màu + 2 sọc ngựa, giờ là 10 bảy màu, 9 sọc ngựa, 5 mún đỏ với 2 cây ráy. Bể không trải nền, chỉ có vài hòn đá; có lọc thác (có lúc chạy cả ngày, có lúc em không bật) và đèn RGB 9W, ban ngày bật trắng khoảng 10 tiếng, tối chuyển đèn màu đến lúc đi ngủ mới tắt. Cho ăn ngày 2 lần. Được hơn 3 tuần thì tảo nâu bám đầy bể, mún với bảy màu ăn hằng ngày cũng không hết, nước đục đục như phân cá rã ra. Tuần thay 50% nước vẫn đục, thành bể có một lớp mờ mờ như rêu tảo bám. Giờ thì thay nước xong được vài ngày là nước lại chuyển xanh đục, tuần nào cũng phải thay gần như hết nước. Lọc thác không ăn thua, em đang tính mua lọc thùng Sunsun 350K thay vào. Do lọc hay do gì, làm sao để nước luôn trong?

**Judge:** Y names the real problem in this tank: the filter switched on and off, too many fish, too much feeding, and white light for 10 hours plus RGB in the evening. It gives a clear order of steps and also answers the Sunsun question. Its mistakes (reading the tank as cement, a small miscount of the fish) are minor. X mostly pastes generic guide excerpts. It doesn't mention the filter being switched off or the evening RGB light, and it gives no concrete steps. / X names the main causes for this tank: the filter switched on and off, light on for about 14 hours, a heavy stock and overfeeding. It gives clear steps, and its advice on the Sunsun filter and the 50% water changes is sound, despite a wrong fish count and misreading 'bể đúc' as a cement tank. Y mostly pastes general guide excerpts. It never points out that turning the filter off is a problem, and it gives no ordered plan for this tank.

**Ours lacks:** tank-fit, plan, diagnosis, follow-up. **Plain lacks:** –.

**Ours** (read 5 pages, stopped at the tools limit):

> Theo cẩm nang, nước xanh đục thường do thừa ánh sáng và thừa dinh dưỡng: đèn bật quá 8–12 tiếng mỗi ngày, bể nuôi quá dày, cho ăn nhiều, hoặc lâu không vệ sinh làm phosphate và nitrate tăng, là thức ăn của tảo. Với bể của bạn, nên giảm thời gian đèn và giảm lượng cá, lượng ăn trước, rồi mới đánh giá lọc; cẩm nang không nói Sunsun 350K có giải quyết được hay không nên mình chưa thể xác nhận việc mua lọc mới.
> 
> [Trích: Nước bể cá bị đục trắng, đục xanh: nguyên nhân và cách làm nước trong › Nguyên nhân]
> Nước đục trắng thường do một trong mấy nguyên nhân sau:
> - Cặn li ti quá nhỏ nên lọc không giữ …

**Plain** (2806 characters):

> # Nguyên nhân chính: quá tải cá và thức ăn, cộng thêm ánh sáng quá nhiều
> 
> Lọc thác không đủ vì bể đang chứa nhiều chất thải hơn khả năng phân hủy của hệ vi sinh. Lọc thùng có thể giúp, nhưng nếu chỉ thay lọc mà không sửa các yếu tố dưới đây thì nước vẫn sẽ đục lại.
> 
> **1. Mật độ cá quá cao.** Bể 50cm với khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ) là khá đông. Mỗi con thải ra amoniac, và bể non chưa đủ vi khuẩn để xử lý hết.
> 
> **2. Cho ăn quá nhiều.** Thức ăn thừa phân hủy và làm nước đục, làm tăng dinh dưỡng cho tảo. Cho ăn 2 lần/ngày là ổn, nhưng mỗi lần chỉ nên cho lượng cá ăn hế…

### algae-08 · tank · tie or split (5.5 · 5.5)

**Asked:** Bể tôi thay nước xong vài ngày lại xanh đục và bám tảo nâu, làm sao giữ nước trong?

**Judge:** Cả hai câu đều không đọc dữ liệu bể nên bỏ sót những nguyên nhân rõ nhất: đèn trắng 10 tiếng cộng thêm đèn màu buổi tối, bể chỉ có 2 cây ráy, và việc thay gần 100% nước mỗi tuần. Y vẫn cho người chơi nhiều bước cụ thể hơn để làm ngay (đèn 6–8 tiếng/ngày, thay 20–30%/tuần, che tối 2–3 ngày, mốc nitrat 40 ppm), dù có vài lỗi nhỏ về sự thật. X đúng hơn nhưng chung chung và thiếu số liệu. / Cả hai đều bỏ qua dữ liệu bể của bạn này: đèn bật khoảng 10 giờ cộng thêm đèn màu buổi tối, cho ăn 2 lần/ngày với 24 con cá, chỉ có 2 cây ráy, và thay gần 100% nước mỗi tuần. Y gọn hơn, ít sai hơn và có nói đèn UV bán ở Việt Nam, nhưng thiếu con số giờ bật đèn. X có con số cụ thể (6–8 giờ đèn, cho ăn hết trong 2–3 phút) nhưng dài, chung chung, có lời khuyên sai và kết thúc bằng việc hỏi lại.

**Ours lacks:** tank-fit, figures, follow-up. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 6 pages, stopped at the calls limit):

> Nước xanh đục thường do tảo phù du nở rộ vì bể thừa sáng hoặc thừa dinh dưỡng, nên thay nước xong chỉ hết tạm thời. Cẩm nang khuyên cắt nguyên nhân trước: rút ngắn thời gian bật đèn, cho ăn ít lại, đo nitrat và phosphat, rồi làm trong nước bằng cách che tối tối đa 7 ngày hoặc dùng đèn UV, sau đó thay nhiều nước và giữ thay ít nhất 20% mỗi tuần. Tảo nâu (tảo cát) bám kính và cây thường gặp ở bể mới, nên hãy đẩy nhanh quá trình trưởng thành của bể, tăng cây và hút tảo bằng tay khi thay nước.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Chữa]
> Phần lớn trường hợp chỉ c…

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

### algae-09 · post · plain wins (5 · 8)

**Asked:** Có cách nào trị rêu xanh nước không ạ? Em được cho cái bể đúc khá to nên phải để ngoài ban công. 2-3 tháng đầu chỉ bị bám rêu lên thành bể, phải cọ rêu thay nước nhưng nước vẫn trong. Giờ không hiểu sao cứ thay nước được khoảng 3 tuần là nước xanh lè, cá chết lăn quay. Bể có sục khí với lọc tuần hoàn thường thôi, không làm thủy sinh, đáy trống.

**Judge:** Y is the better answer. It explains why the water turns green about 3 weeks after each change (nutrients build up) and gives practical fixes for a balcony tank in Vietnam: a shade net, floating plants such as bèo or lục bình, less food, bottom siphoning, UV, a backup air pump, and checking pH because the tank is cast. X mostly repeats a generic guide built for indoor tanks. It tells them to move a tank they can't move and to cut light hours on a tank that has no light. / X fits the outdoor tank: shade cloth, floating plants, UV, stronger aeration with a backup pump, steady partial water changes instead of big ones every 3 weeks, and it gives clear first-aid steps. Y is a generic indoor-tank excerpt that repeats itself, contradicts itself on blackout time, and suggests moving a tank the hobbyist can't move.

**Ours lacks:** tank-fit, plan, too-long, figures. **Plain lacks:** follow-up.

**Ours** (read 5 pages):

> Nước xanh là tảo phù du nở rộ, thường do nắng hắt vào bể ngoài ban công, thừa dinh dưỡng hoặc cho ăn thừa. Ban đêm tảo lấy oxy, và khi tảo chết hàng loạt thì oxy có thể cạn, nên cá chết là dấu hiệu cần xử lý gấp; hãy giữ sủi và lọc chạy liên tục. Cách trị gồm cắt nguyên nhân (dời bể khỏi chỗ nắng, bớt cho ăn), làm trong bằng cách che tối tối đa 7 ngày hoặc dùng đèn UV, rồi thay nước đều đặn ít nhất 20% mỗi tuần, vì chỉ thay nước nhiều thì tảo mọc lại ngay.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Chữa]
> Phần lớn trường hợp chỉ cần làm đủ các bước sau:
> 1. Tìm và …

**Plain** (2214 characters):

> Nước xanh lè thường do **tảo đơn bào** bùng phát. Bể ngoài trời, đáy trống, có nhiều cá, cho ăn đều thì rất dễ gặp. Chu kỳ khoảng 3 tuần cho thấy dinh dưỡng (phân cá, thức ăn thừa) tích tụ dần rồi tảo bùng lên.
> 
> **Cá chết đột ngột có thể do:**
> - **Thiếu oxy vào ban đêm**: tảo tạo nhiều oxy ban ngày nhưng tiêu thụ oxy ban đêm. Khi tảo chết hàng loạt, oxy tụt rất nhanh. Cá thường nổi đầu, há miệng vào sáng sớm.
> - **Amoniac/nitrit tăng**: do phân và thức ăn thừa phân hủy, nhất là khi lọc sinh học yếu.
> - **pH dao động mạnh**: ban ngày pH lên cao vì tảo quang hợp, và bể đúc mới thường có pH cao do…

### algae-09 · tank · ours wins (6 · 4.5)

**Asked:** Bể tôi cứ khoảng ba tuần sau khi thay nước lại xanh lè và cá chết, trị sao?

**Judge:** X is the better answer. Its cause is right: sun-fed algae blooms that crash and use up the oxygen. It gives clear steps: blackout or UV, keep the aeration running, change water after treatment, and watch for oxygen-starved fish. But it is padded with a long guide excerpt and tells them to move a tank that can't be moved. Y puts the blame mostly on the filter bacteria and misses the strong balcony sun. It also suggests algae eaters that don't eat green water. / Neither answer uses the tank details from the app. For a big concrete tank with no plants, sitting in balcony sun, Y names the real cause better: too much sun, which feeds algae. It also gives the right fixes (move the tank out of the sun, blackout, UV), the oxygen crash that kills fish, and notes that UV lamps are sold in Vietnam. Y is long and repeats itself. X mainly blames the nitrogen cycle and filter cleaning, which is a guess, and it ends by asking questions back.

**Ours lacks:** tank-fit, too-long, figures. **Plain lacks:** diagnosis, tank-fit, wrong.

**Ours** (read 4 pages):

> Nước xanh tái đi tái lại thường do tảo phù du nở rộ vì thừa sáng, thừa dinh dưỡng (cho ăn nhiều, châm phân quá tay) hoặc ít thay nước, nên phải tìm và cắt đúng nguyên nhân trước. Cẩm nang hướng dẫn trị bằng che tối tối đa 7 ngày hoặc đèn UV, để lọc và sủi chạy suốt, rồi thay nhiều nước để vớt xác tảo và amoniac, sau đó thay ít nhất 20% nước mỗi tuần. Với cá đang chết, hãy kiểm tra oxy ngay: cá treo ở mặt nước, đớp khí hoặc lờ đờ là dấu hiệu thiếu oxy, và tảo chết hàng loạt có thể làm cạn oxy.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Chữa]
> Phần lớn trường hợp ch…

**Plain** (2324 characters):

> Bể xanh lè (nước xanh do tảo đơn bào hoặc vi khuẩn bùng phát) và cá chết sau mỗi vài tuần thường có nguyên nhân liên quan đến **chu trình nitơ bị phá vỡ** hoặc **nước máy/cách thay nước**. Chu kỳ 3 tuần khá gợi ý: khi bạn thay nước hoặc vệ sinh lọc quá mạnh, vi khuẩn có lợi bị mất, amoniac/nitrit tăng, rồi tảo bùng lên khi hệ vi sinh tái lập.
> 
> ## 1. Xử lý ngay khi đang xanh và cá yếu
> - **Test nước** (amoniac NH3/NH4⁺, nitrit NO2⁻, nitrat NO3⁻, pH, nhiệt độ). Nếu amoniac hoặc nitrit > 0, đây là nguyên nhân chính làm cá chết.
> - **Thay 30–50% nước** bằng nước đã khử clo, nhiệt độ gần bằng nước b…

### algae-10 · post · plain wins (5 · 6)

**Asked:** Có cách nào cứu bể em không: rêu hại dạng sợi màu nâu nhỏ nhỏ bám trên lá cây, sau đó bụi nền dính đầy vào. Thả nhiều tép thì sạch ngay, nhưng bể em nuôi nhiều thần tiên, thả tép vào thì tép bị ăn hết trước cả rêu.

**Judge:** Y tackles the hobbyist's real constraint with angelfish-safe cleaners (nerite, otocinclus, bristlenose pleco) plus siphoning and feeding control, but it gets some Vietnamese names wrong. X diagnoses the brown algae correctly and grounds it in the guide, but it dodges the angelfish question and gives drastic light advice without knowing how old the tank is. / X answers the hobbyist's real constraint: it offers clean-up crew that can live with angelfish (nerite snails, bristlenose pleco, otocinclus, SAE) and lays out a full step-by-step plan, though it gets some snail and plant names wrong. Y gives a clear, sourced diatom routine but assumes a new tank and skips the angelfish–shrimp problem, which is the core of the question.

**Ours lacks:** tank-fit, follow-up, diagnosis. **Plain lacks:** diagnosis, local, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Lớp nâu bám trên lá rồi bám bụi như bạn tả là tảo nâu (tảo silic), thường do hệ vi sinh bể chưa ổn định và đèn bật quá lâu. Cẩm nang khuyên cắt giờ đèn xuống còn 2–3 tiếng mỗi ngày, thay khoảng 30% nước hai ngày một lần, và thả ốc Nerita để ăn tảo. Cẩm nang chưa cho tôi thông tin về việc thần tiên có ăn tép hay không, nên tôi chưa thể nói loại tép nào sống chung được với bể của bạn.
> 
> [Trích: Nhận biết và xử lý 6 loại rêu hại hay gặp trong bể thủy sinh › Tảo nâu: vì sao bể mới nào cũng bị]
> Tảo nâu (tảo silic, diatoms) là những vệt màu nâu phủ lên lá cây, mặt đá và mặt kính. Nó làm bể trông bẩn…

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

### algae-10 · tank · plain wins (3.5 · 6)

**Asked:** Lá cây trong bể tôi bị rêu sợi nâu bám, mà thả tép thì bị cá ăn mất, xử lý sao?

**Judge:** Y gives an ordered plan: remove the algae, fix the light and nutrients, and switch to algae-eaters other than shrimp (otto, nerite snails, SAE). These work with angelfish even though Y never names them. X is mostly a guide excerpt about diatoms with no steps for this tank. It also admits it can't answer the shrimp problem. / X is better. It deals with the cause (light, nutrients, water changes) and suggests algae eaters that work alongside cá thần tiên, like ốc Nerite and otto. Y only quotes a guide about new-tank diatoms, offers otto, and admits it doesn't cover the problem of fish eating the shrimp, so the user gets almost nothing they can act on.

**Ours lacks:** tank-fit, plan, too-thin. **Plain lacks:** tank-fit, figures, too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Cẩm nang nói rêu nâu (tảo silic) thường chỉ là giai đoạn của bể mới và sẽ tự hết; bạn có thể chà kính và đá bằng mút hoặc bàn chải đánh răng, còn phần lá cây thì để cá, tép hoặc ốc ăn. Cẩm nang gợi ý cá otto (Otocinclus) là lựa chọn đỡ công nhất, nhưng không nói cách giữ tép an toàn khi có cá ăn tạp trong bể, nên phần đó bạn cần tìm thêm.
> 
> [Trích: Rêu nâu (tảo silic) trong bể thủy sinh: nguyên nhân và cách xử lý › Cách xử lý rêu nâu]
> Có ba cách, và bạn có thể kết hợp chúng với nhau.
> 1. Chờ. Vì đây chỉ là một giai đoạn, bạn hoàn toàn có thể để mặc, rêu sẽ tự hết. Nhược điểm là bể nhìn xấu tron…

**Plain** (2088 characters):

> Rêu sợi nâu thường xuất hiện khi bể dư dinh dưỡng, đèn sáng hoặc chiếu quá lâu, hoặc nước không ổn định. Bạn nên xử lý cả nguyên nhân lẫn rêu đang có.
> 
> **1. Xử lý rêu đang bám**
> - Dùng tay (đeo găng) hoặc bàn chải mềm lau, gỡ sợi rêu khỏi lá. Với rêu sợi thì gỡ bằng tay hoặc dùng que/đũa cuốn rêu rồi kéo ra.
> - Cắt bỏ những lá đã bị bám nặng, đặc biệt là lá già.
> - Nếu rêu bám quá nhiều, có thể tạm dùng H₂O₂ (oxy già) nhỏ trực tiếp lên chỗ rêu (liều thấp, dùng ống tiêm, tránh dính vào cá và cây mềm), rồi thay nước ngay sau đó. Cách này có thể làm hại cây nhỏ nên thử trước trên một lá.
> 
> **2. Giả…

### algae-11 · post · plain wins (3 · 7.75)

**Asked:** Nhà mình dùng nước máy làm nước bể cá. Trước ở chỗ khác, thả cá vào mấy tháng mới phải thay nước một lần. Giờ chuyển về chỗ mới, để bể không có cá (chỉ 1 con cá dọn bể) thì không sao, nhưng cứ thả cá vào chưa đến một tuần là nước chuyển sang màu xanh lá cây, xanh đậm dần rồi cá chết. Bể không, không có cây cỏ gì cả. Trước có bỏ mấy gói tăng oxy gì đó, giờ không cho cũng vẫn vậy. Bắt bệnh giúp mình với.

**Judge:** Y explains the likely cause: the bacteria that break down fish waste aren't working at the new place, so ammonia builds up, and the algae bloom drains oxygen at night. It gives a clear plan with test targets, daily water changes and more aeration. X only says ammonia might be the cause and admits it hasn't read how to fix it. Its quoted guide text cuts off mid-sentence, so the hobbyist gets no steps. / X is better. It finds the likely causes for this tank: the bacteria colony that breaks down fish waste isn't established yet, light or sun is driving the algae, and the algae uses up oxygen at night. It then gives clear steps in order with numbers: 30–50% water changes, 6–8 hours of light a day, stronger aeration, and fewer fish. Y gives a correct but thin diagnosis, says it hasn't read the treatment section, and its guide excerpt is cut off, so the hobbyist has almost nothing to act on.

**Ours lacks:** plan, too-thin, tank-fit, figures. **Plain lacks:** local, too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Theo cẩm nang, nước xanh do tảo phù du nở rộ, bản thân nước xanh không trực tiếp giết cá. Nguyên nhân hay gặp ở bể mới chưa chạy vi sinh là amoniac tăng vọt, và có thể đây là lý do cá chết sau một tuần. Bạn nên chạy chu trình nitơ cho bể trước khi thả cá, và phần cách xử lý chi tiết tôi chưa đọc đủ, nên xem thêm cẩm nang về chu trình nitơ.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Nguyên nhân]
> - Thừa sáng. Thủ phạm hay gặp là nắng chiếu thẳng vào bể, nắng hắt từ cửa sổ, hoặc bật đèn quá lâu.
> - Thừa dinh dưỡng. Ví dụ lỡ tay châm phân gấp đôi, hoặc châm phân nước.…

**Plain** (3129 characters):

> Triệu chứng này khớp nhất với **chu trình nitơ chưa ổn định** kết hợp với **tảo nở hoa (nước xanh)**. Cá chết thường do amoniac/nitrit tăng cao hoặc thiếu oxy khi tảo bùng lên.
> 
> ## Nguyên nhân có thể
> 
> **1. Lọc sinh học chưa hoạt động tốt ở chỗ mới (khả năng cao nhất)**
> - Ở chỗ cũ, bể chạy mấy tháng nên vi khuẩn có lợi trong vật liệu lọc và thành bể đã phát triển đủ.
> - Khi chuyển đi, vi khuẩn có thể bị giảm mạnh (rửa vật liệu lọc bằng nước máy có clo, thời gian gián đoạn, hoặc bể mới setup lại).
> - Khi thả cá, chất thải làm amoniac tăng. Bể chưa đủ vi khuẩn để chuyển hóa nên amoniac và nitrit t…

### algae-11 · tank · plain wins (4 · 6.5)

**Asked:** Bể tôi cứ thả cá vào là chưa tới một tuần nước xanh lè rồi cá chết, vì sao?

**Judge:** Y gives a clear cause (the tank never cycled, plus too much light and food) and steps in order with numbers: change water, dechlorinate tap water, cut the light, add plants, cycle before adding fish. That fits a bare tank on tap water that rarely gets water changes, though Y never picks up the oxygen-packet note to suggest a proper air pump. X is mostly guide excerpts, with a two-line answer and no steps to follow. / X is the better answer for this hobbyist. It explains the likely causes (a tank that hasn't finished cycling, plus too much light and too many nutrients) and gives steps in order with numbers: change 30–50% of the water, keep the light on 6–8 hours a day, cycle for 3–6 weeks. Its weak spots are that it ignores their known situation (tap water, a tank with no plants, a cleaner fish, rare water changes), asks again whether they use tap water, and never mentions adding an air stone. Y's own text is only a short summary, and the guide excerpts under it are long and leave the reader with no clear plan. Y doesn't use the tank details either.

**Ours lacks:** plan, tank-fit, figures, too-long. **Plain lacks:** tank-fit.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang cho biết nước xanh là do tảo phù du nở rộ, bản thân nó không trực tiếp giết cá, nhưng ban đêm tảo dùng oxy và khi tảo chết hàng loạt oxy có thể cạn. Nguyên nhân hay gặp nhất với bể mới là amoniac tăng vọt vì bể chưa chạy vi sinh, cộng với thừa sáng, thừa dinh dưỡng hoặc cho ăn quá nhiều. Cẩm nang không chẩn đoán riêng cho bể của bạn, nên hãy kiểm tra amoniac và oxy trong bể ngay.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Nguyên nhân]
> - Thừa sáng. Thủ phạm hay gặp là nắng chiếu thẳng vào bể, nắng hắt từ cửa sổ, hoặc bật đèn quá lâu.
> - Thừa dinh dưỡng. Ví…

**Plain** (2070 characters):

> Nước xanh lè và cá chết trong vòng một tuần thường có hai nguyên nhân chính, và chúng thường đi cùng nhau:
> 
> **1. Bể chưa chu trình nitơ (chưa "chín bể") – nguyên nhân hay gặp nhất**
> - Cá thải ra **amoniac (NH₃)** qua mang, phân và thức ăn thừa. Amoniac rất độc.
> - Bình thường, vi khuẩn có lợi trong bể sẽ chuyển amoniac → **nitrit (NO₂⁻)** → **nitrat (NO₃⁻)** ít độc hơn. Bể mới chưa có đủ vi khuẩn này nên amoniac và nitrit tích tụ, làm cá bị ngộ độc, mang bị tổn thương và chết.
> - Amoniac và nitrat dư cũng là "thức ăn" cho tảo, nên tảo bùng nổ và làm nước xanh.
> 
> **2. Tảo đơn bào nở hoa (nước xan…

### setup-01 · post · plain wins (2 · 8)

**Asked:** Vợ em vừa bắt em đầu tư một bể thủy sinh, em đặt mua trọn bộ: bể dài 1m + chân gỗ + sục + lọc + đèn (2 bóng LED) + sưởi. Em ở Hà Nội, trời đang lạnh. Em mù mờ khoản này nên hỏi: 1) Bên setup bảo bật đèn liên tục 3 ngày đầu rồi khoảng 8h/ngày, nhưng em đọc trên mạng thì tuần đầu chỉ bật 50% công suất rồi tăng dần lên 100%, 8h/ngày để tránh rêu và cho cây thích nghi. Cách nào đúng? 2) Cho cá ăn tần suất thế nào? 3) Sưởi có nên bật 24/24 không? 4) Có nên mua thêm bình CO2 không, vì em thấy phải có cái này cây mới đủ chất? 5) Lọc họ trang bị chỉ qua sợi bông đơn giản, em đọc thấy phải lọc qua sứ, mà lọc ngoài thì không có chỗ đặt vì bể dùng chân gỗ, không có tủ. Lọc như của em có ổn không? 6) Nên thay nước mấy ngày một lần, lúc mới setup và lúc đã ổn định?

**Judge:** X chỉ trả lời 2 trên 6 câu, lại nói thẳng là phần còn lại không có trong cẩm nang. Y trả lời đủ cả sáu câu có số liệu cụ thể và hợp với bể 1m ở Hà Nội đang lạnh: lịch tăng đèn dần, sưởi 24–26°C bật 24/24, chưa cần CO2, thêm sứ hoặc dùng lọc treo khi không có tủ, khử clo nước máy, thêm cả lưu ý tải trọng của chân gỗ. / X answers all six questions with sensible numbers: light hours, heater set to 24–26°C and left on 24/7, no CO2 needed yet, adding ceramic rings or a HOB/sponge filter, cycling the tank, and dechlorinating tap water. Y answers only the light and feeding questions and pads its reply with quoted excerpts that don't fit this tank.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** local.

**Ours** (read 2 pages, stopped at the tools limit):

> Cẩm nang mình đã đọc khuyên giữ đèn 6 đến 8 tiếng mỗi ngày, cố định cùng một khung giờ, nên mức 8 tiếng của bên setup nằm trong khoảng này; cá thường chỉ cần cho ăn một lần mỗi ngày, có thể chia hai bữa nhỏ. Mình chưa đọc được phần nào về việc bật đèn 50% tuần đầu, sưởi 24/24, CO2, lọc sứ hay lịch thay nước khi mới set, nên các câu đó hiện cẩm nang chưa trả lời rõ trong phần mình có.
> 
> [Trích: Bể thủy sinh nên bật đèn mấy tiếng mỗi ngày, liên tục hay chia buổi › Bắt đầu từ đâu]
> 1. Chọn một khung giờ bật đèn từ 6 đến 8 tiếng và giữ cố định mỗi ngày.
> 2. Nếu đang chia buổi, thử bật liên tục một t…

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

### setup-01 · tank · plain wins (4 · 6.75)

**Asked:** Bể mới mua của tôi nên bật đèn, sưởi, thay nước thế nào và có cần mua thêm CO2 không?

**Judge:** X trả lời được giờ bật đèn và lịch thay nước, nhưng bỏ trống hai câu hỏi về sưởi và CO2, chỉ bảo người hỏi tự xem thêm cẩm nang. Y trả lời đủ cả bốn ý, có nhiệt độ cần giữ, công suất sưởi theo lít nước và nhắc tăng công suất khi phòng lạnh, kèm các lựa chọn CO2 rõ ràng. Tuy vậy, Y viết chung chung, không dùng chi tiết bể 1m ở Hà Nội vào mùa lạnh. / X trả lời đủ cả bốn câu hỏi: đèn 6–8 tiếng, sưởi 24–28°C với khoảng 1W/lít, cách thay nước và có cần CO2 không. Nhưng X không nhắc tới bể 1m, mùa lạnh Hà Nội hay chuyện chỉ có lọc bông. Y chỉ nói về đèn và thay nước. Y tự nhận chưa có thông tin về sưởi và CO2, rồi thêm một đoạn trích về cycling gần như không có nội dung dùng được.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** tank-fit, local.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang khuyên bật đèn khoảng 6 đến 8 tiếng mỗi ngày, chọn một khung giờ cố định, và tuần đầu thay khoảng 30% nước mỗi ngày, sau đó giãn dần xuống 2 ngày rồi 3 ngày một lần, khi bể ổn định thì thay rất ít. Phần đã đọc chưa có hướng dẫn về máy sưởi, và chưa nói rõ bể của bạn có cần CO2 hay không, nên hai ý này bạn xem thêm trong cẩm nang. Trước khi thả cá, bạn có thể đọc phần cycle bể trong cẩm nang.
> 
> [Trích: Bể thủy sinh nên bật đèn mấy tiếng mỗi ngày, liên tục hay chia buổi › Bật đèn bao nhiêu tiếng mỗi ngày]
> Mức được nhiều người khuyên là từ 6 đến 8 tiếng mỗi ngày. Bạn chọn khung giờ nào c…

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

### setup-02 · post · plain wins (3 · 7)

**Asked:** Mình đang gom đồ để set hồ 60x40x40 chơi rêu taiwan, trân châu ngọc trai, la hán và ráy, bố cục bonsai. Phân nền dùng Gex xanh. Tư vấn giúp mình nên mua đèn và lọc loại nào?

**Judge:** Y đưa ra thông số đèn và lọc cụ thể, gợi ý các mẫu đang bán ở Việt Nam, hợp với bể low-tech trồng rêu và ráy. Y có vài lỗi nhỏ: xếp Twinstar vào nhóm giá mềm và gợi ý HW-304B quá cỡ cho bể này. X gần như không trả lời, không gợi ý đèn hay lọc nào, chỉ trích cẩm nang chung chung. / X names specific lights and filters sold in Vietnam, gives a light period and flow figures, and sees that this plant list can grow low-tech on Gex. It does mix up la hán and has a few small errors about brands and models. Y only gives two generic rules and a long excerpt, names no products, and never mentions pearlweed or the bonsai layout.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa cho mình một mẫu đèn hay lọc cụ thể cho bể 60x40x40 này, và mình chưa kiểm tra được nhu cầu ánh sáng của rêu Đài Loan hay ráy. Theo cẩm nang, cây ưa sáng yếu như anubias, dương xỉ thì không cần đèn quá mạnh, và đèn LED chỉnh được độ sáng là lựa chọn hợp hơn. Về lọc, cẩm nang khuyên chọn loại có công suất ghi trên hộp gấp đôi thể tích bể, tức bể 96 lít nên dùng lọc ghi khoảng 200 lít trở lên.
> 
> [Trích: Cách chọn đèn tốt nhất cho bể thủy sinh nước ngọt › #2 Cường độ ánh sáng]
> [photo: Planted aquarium with vallisneria in the background]
> Đèn nên sáng đến mức nào? Trước hết, câu trả l…

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

### setup-02 · tank · plain wins (4 · 5)

**Asked:** Bể tôi sắp set nên mua đèn và lọc loại nào?

**Judge:** X có nhắc kích thước bể nhưng lại bảo bạn chọn đèn theo cây định trồng, dù bạn đã có danh sách cây rồi, và X không đưa mẫu cụ thể hay con số nào. Y hỏi lại cả những thông tin đã có và quy tắc W/lít đã lỗi thời, nhưng ít ra Y cho được hãng bán ở Việt Nam, lưu lượng, nhiệt độ màu, giờ chiếu sáng và thời gian chạy lọc trước khi thả cá, nên bạn có thể làm theo được. / Neither answer uses their plants: mostly moss, la hán and ráy, which need only low to medium light. X still gives concrete steps: brands sold in Vietnam, a flow figure, a timer with 6–8 hours, and cycling for 2–4 weeks. However, X asks for the size the app already has, and its watts-per-litre rule is outdated. Y rightly recommends a canister, but it leaves the choice of light open, and its translated guide excerpt is padded with things that don't apply, such as breeding-tank sponge filters.

**Ours lacks:** plan, figures, too-thin, tank-fit. **Plain lacks:** tank-fit, asks-only.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang khuyên chọn lọc theo lượng vật liệu lọc chứa được chứ không theo lưu lượng: lọc thùng chứa nhiều mút, sinh học là lựa chọn tốt, còn lọc treo dùng hộp lõi nhỏ thì thường chưa đủ cho phần lớn bể. Đèn thì tùy loài cây bạn muốn trồng, cường độ ánh sáng họ cần, kích thước bể và ngân sách; cẩm nang chưa có mẫu đèn cụ thể cho bể 60×40×40 cm của bạn, nên hãy chọn theo cây định trồng trước khi mua.
> 
> [Trích: Lọc thùng, lọc treo cho bể cá: cách chọn, xếp vật liệu và vệ sinh › Chọn lọc nào]
> Một chiếc lọc thùng mạnh hay yếu chủ yếu nằm ở chỗ nó chứa được bao nhiêu vật liệu và đó là vật liệu gì. L…

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

### setup-03 · post · plain wins (1.5 · 7.75)

**Asked:** Em có cái bể đang bỏ không, hiện chỉ có mỗi bể, không đèn không lọc không gì hết. Với tầm 3-4 triệu thì nên làm gì để hồi sinh nó? Thủy sinh rong rêu cũng được, còn cá thì em thích kiểu thả nhiều con cá nhỏ tí ti.

**Judge:** Y is the answer I'd want this hobbyist to get. It gives a cost breakdown in đồng that fits 3-4 triệu, sensible gear (a sponge filter, an LED light, easy plants that need no CO₂), the small schooling fish they asked for, and a week-by-week plan built around cycling the tank. Its slips are small: Otocinclus too early, no ammonia source for the cycle, and little about Vietnam's heat. X only says it hasn't read the guide and asks them to ask again, so it gives them nothing to act on. / X gives a full plan that fits the 3-4 million budget: equipment, easy plants, small schooling fish, cycling and a week-by-week schedule, with only minor errors. Y answers nothing and only points to other questions.

**Ours lacks:** too-thin, plan, asks-only. **Plain lacks:** local.

**Ours** (read 0 pages, stopped at the time limit):

> Cẩm nang hiện có các bài hướng dẫn set up bể thủy sinh low tech cho người mới và bài mua đồ set bể (bể, đèn, lọc, CO2), nhưng em chưa đọc được nội dung chi tiết nên chưa thể trả lời chắc chắn cách chia ngân sách 3-4 triệu hay nên chọn cá nhỏ đi đàn nào. Em có thể hỏi tiếp về từng phần cụ thể, như cách set bể low tech hoặc các loại cây dễ trồng, để em đọc đúng trang đó.
> 
> [Gợi ý hỏi tiếp] Cách set bể thủy sinh low tech cho người mới bắt đầu là gì? · Người mới nên mua đồ set bể gì: bể, đèn, lọc, CO2? · Loại cây thủy sinh nào dễ trồng cho người mới?

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

### setup-03 · tank · plain wins (3 · 7.5)

**Asked:** Tôi có bể trống và 3-4 triệu, nên mua gì để làm bể thủy sinh nuôi đàn cá nhỏ?

**Judge:** Y gives a full shopping list in Vietnamese prices that fits the 3–4 million budget, with easy plants, schooling fish, and a reminder to cycle the tank 2–4 weeks before adding fish. It also asks for the tank size. X won't give a list, and its excerpts are mostly about euro prices, a 15-million budget and DIY CO2, which don't fit this hobbyist. / X là câu trả lời tốt hơn. X đưa danh sách mua sắm có giá ước tính hợp với 3-4 triệu, có lời khuyên chạy bể 2-4 tuần trước khi thả cá, và hỏi kích thước bể. X chỉ có vài lỗi nhỏ: gọi nhầm loại lọc, xếp trân châu và tép crystal red vào nhóm dễ nuôi. Y không đưa ra danh sách, chỉ dán các đoạn cẩm nang tính giá bằng euro, nói về CO₂ tự chế và ngân sách 15 triệu, nên người hỏi không biết phải mua gì.

**Ours lacks:** plan, tank-fit, local, off-topic. **Plain lacks:** tank-fit.

**Ours** (read 6 pages, stopped at the tools limit):

> Cẩm nang chưa có danh sách riêng cho ngân sách 3–4 triệu, nên tôi chưa thể đưa ra một bộ đồ cụ thể. Phần tiết kiệm nhất theo cẩm nang là lọc rẻ, bể kính thường, nền trơ như sỏi thay cho phân nền, và đèn LED thủy sinh có hẹn giờ. Bạn nên chọn loài cá trước khi mua, vì tôi chưa kiểm tra loài cá nhỏ nào hợp đàn trong bể này.
> 
> [Trích: Set bể thủy sinh 20 lít: thiết bị giá rẻ và thiết bị đắt tiền › Bắt đầu từ đâu]
> - Nếu tiền eo hẹp, cứ chọn lọc trong rẻ tiền, vì lọc là khoản dễ tiết kiệm nhất.
> - Với bể nhỏ, có thể thử đất ao phủ sỏi kèm phân viên. Tiền ban đầu ngang phân nền, còn túi đất dùng được…

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

### setup-04 · post · plain wins (1.5 · 8)

**Asked:** Mình muốn set hồ 60x36x36 để trên kệ tivi phòng khách chung cư nên cần tinh gọn, không có chỗ cho bình CO2, thùng lọc. Phương án của mình: bố cục đá Tiger + rêu mini fiss và ráy lá nhỏ ở tiền cảnh, rong La Hán + dương xỉ Java ở hậu cảnh, đều là cây cần ít CO2. Mình tính dùng lọc thác. Bố cục vậy có ổn không, nên dùng nền nào và bao nhiêu?

**Judge:** Y trả lời thẳng câu hỏi. Y xác nhận bố cục, nói rõ nền nào hợp với từng nhóm cây, tính đúng lượng nền (~8–9 lít) và đưa thông số lọc, đèn. Y còn nhắc kiểm tra kệ TV chịu tải khoảng 110 kg, điều rất quan trọng với hồ đặt trong chung cư. Y chỉ thiếu phần lưu ý về nhiệt độ nóng ở Việt Nam. X gần như không trả lời gì: X chỉ nói cẩm nang thiếu thông tin rồi bảo hỏi lại. / X answers the actual question. It checks the layout, gives the substrate choice and how much to buy (2160 cm² × 4 cm ≈ 8–9 L), sizes the hang-on filter and warns about the weight on a TV stand, though it doesn't cover cycling the tank or what to watch afterwards. Y says it doesn't have enough information, gives no advice, and only suggests follow-up questions.

**Ours lacks:** asks-only, too-thin, tank-fit. **Plain lacks:** local, follow-up.

**Ours** (read 1 pages, stopped at the tools limit):

> Cẩm nang chưa cho mình đủ thông tin để xác nhận bố cục này, vì mình chưa đọc được phần nền, lượng nền và loại lọc thác cho bể 60x36x36 của bạn. Cẩm nang có hướng dẫn set bể thủy sinh low tech cho người mới, nói rằng cây giúp bể tự nhiên hơn và hút bớt chất thải trong nước, và giai đoạn đầu nên để đèn yếu, châm phân ít. Rong La Hán và ráy lá nhỏ mình không tìm thấy trang riêng trong cẩm nang, nên bạn nên hỏi lại cụ thể hơn về các cây này.
> 
> [Trích: Hướng dẫn set up bể thủy sinh low tech cho người mới bắt đầu]
> Muốn lên tay nghề nuôi cá thì bạn thử trồng thêm cây thủy sinh sống. Có cây, bể trông …

**Plain** (3463 characters):

> **Nhìn chung phương án ổn**, đặc biệt với hồ 60x36x36 (khoảng 78 lít) và yêu cầu gọn nhẹ. Các cây bạn chọn đều chịu được ánh sáng thấp và CO2 thấp, không cần bình CO2 hay thùng lọc.
> 
> ## 1. Bố cục và cây
> 
> - **Đá Tiger**: hợp lý, bền, không làm đổi pH đáng kể. Nên đặt đá lệch một bên, cao dần về hậu cảnh để tạo chiều sâu.
> - **Rêu Fissidens mini và ráy lá nhỏ (Anubias nana) ở tiền cảnh**: ổn. Cả hai đều bám trên đá hoặc gỗ, không cần nền dinh dưỡng. Buộc hoặc keo (loại an toàn cho cá) ráy lên đá, **không vùi thân rễ xuống nền**, nếu không sẽ thối. Fissidens mini hơi khó giữ hơn, cần nước sạch, í…

### setup-04 · tank · not judged

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu, và chọn cây như vậy có ổn không?

**Ours** (read 0 pages, stopped at the error limit):

failed: Request timed out.

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

### setup-05 · post · not judged

**Asked:** Em định set hồ 1m2x50x50 phong cách natural, chủ yếu rêu, ráy với ít cây cắt cắm lá đỏ. Nên chọn nền thế nào, bao nhiêu kg cho phù hợp và kinh tế? Em tính xài nền trộn kết hợp Aquafor thì ổn không? Đèn em xài T5HO, 2 bóng 10k, 1 bóng 6k5, 1 bóng hồng có hợp lý không?

**Ours** (read 0 pages, stopped at the error limit):

failed: out of time

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

### setup-05 · tank · plain wins (3 · 5)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu kg, và đèn như vậy có đủ cho cây đỏ không?

**Judge:** Cả hai đều không dùng thông tin bể đã có. Y ít ra đưa công thức tính kg nền, độ dày nền và các mức ánh sáng cụ thể nên người chơi tự tính được. X không trả lời phần nền và khuyên chiếu đèn 12–15 tiếng, dễ gây bùng rêu. / Không câu nào dùng thông tin bể của người hỏi. X ít nhất đưa ra công thức tính kg đúng và đủ dùng (bể 120×50 nền 5 cm ra khoảng 45 kg sỏi), kèm hướng dẫn về đèn hợp lý. Y từ chối tính lượng nền, khuyên chiếu 12–15 tiếng dễ gây rêu, và chèn đoạn trích dài mà người đọc không dùng được.

**Ours lacks:** tank-fit, figures, plan. **Plain lacks:** tank-fit, asks-only, local.

**Ours** (read 3 pages, stopped at the calls limit):

> Cẩm nang chưa cho tôi con số kg nền cho bể 120x50x50 cm, nên tôi chưa thể trả lời phần này. Về nền, bài chọn nền nói không có loại nào đúng cho mọi bể, vì nước máy mỗi nhà khác nhau. Về đèn, cẩm nang ghi bóng T5 6500K hoặc LED thường đều đủ dải màu cho cây đỏ; để ép đỏ thì chiếu 12 đến 15 tiếng mỗi ngày nhưng nguy cơ rêu tăng, và giữ nhiệt độ 25–28°C. Bạn cho tôi biết loại đèn và công suất để tôi xem đèn đó có hợp không.
> 
> [Trích: Cách ép đỏ cây thủy sinh: nước, phân, CO2, đèn và chọn giống › Đèn và thời gian chiếu sáng khi ép màu]
> Không nhất thiết phải có đèn đắt tiền thì cây mới đỏ. Bóng T5 …

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

### setup-06 · post · plain wins (3 · 7)

**Asked:** Em đang set hồ 60x30x36, bố cục lũa đá nature. Cốt nền JBL Aquabasic Plus 1 bao (2,5 lít), phân nền Aquafor 2,5 bao (7,5 lít), quây phần nền bằng đá cuội. Cây dự kiến: rêu, ráy, ít bucep, dương xỉ, hậu cảnh cắt cắm táo lớn, hồng thái dương. Phần trống mặt tiền có nên trải sạn hoặc cát không? Với bố cục và kích thước này nên dùng máng Odyssea 2 bóng hay 4 bóng?

**Judge:** Y answers both questions directly: fine sand in front with a cobble edge, and 4 tubes if they run CO₂ for the red stem plants, or 2 if low-tech. It ties each choice to this hobbyist's plants. X barely answers and bases its light advice on a rule about clip-on fixtures that doesn't apply here. / X answers both questions with practical advice tied to their plants: sand at the front, and 4 tubes if they run CO₂ for the red stem plant. Y hedges, uses a fixture-count rule to wrongly rule out the 4-tube unit, and leaves the sand question unanswered.

**Ours lacks:** too-thin, tank-fit, plan, wrong. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa có hướng dẫn riêng về việc trải sạn hay cát ở mặt tiền bể 60x30x36 nên mình chưa khẳng định được; nếu có cây tiền cảnh cần phân nền thì cẩm nang khuyên dùng phân nền ở khu vực đó, còn cát trơn trong bể sâu thì khó lên thảm. Về đèn, cẩm nang tính theo chiều rộng từ trước ra sau (30 cm ở bể này): một máng kẹp thành bể khoảng 30 cm là đủ, nên bể này không cần 4 bóng. Mình chưa đọc được trang Odyssea nên không nói được 2 bóng hay loại cụ thể nào.
> 
> [Trích: Cách chọn đèn thủy sinh: nhiệt độ màu, công suất và số máng đèn › Bể cần mấy máng đèn]
> Bể kích thước tiêu chuẩn thường chỉ cần mộ…

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

### setup-06 · tank · plain wins (3 · 5.5)

**Asked:** Bể thủy sinh tôi đang set có nên trải sạn mặt tiền không, và cần đèn mấy bóng?

**Judge:** X không trả lời câu hỏi về sạn mặt tiền. Phần đèn của X chỉ đưa quy tắc W/lít chung chung, ví dụ lại tính cho bể 30 cm cao chứ không phải bể của họ, và không giúp chọn máng 2 bóng hay 4 bóng. Y trả lời cả hai câu: có nên trải sạn và cách làm, kèm mức W/lít. Ví dụ của Y lại trùng đúng bể 60×30×36 (khoảng 30–40 W). Tuy vậy Y hỏi lại những thông tin app đã có, bỏ qua lớp đá cuội quây sẵn của họ và chưa chốt nên chọn 2 bóng hay 4 bóng. / X có trả lời câu hỏi về sạn mặt tiền, và con số 30–40 W đưa ra trùng đúng cỡ bể 60×30×36. Tuy vậy X chưa biết bạn này đã quây đá cuội, chưa so sánh máng Odyssea 2 bóng với 4 bóng, và còn hỏi lại những thông tin đã có trong hồ sơ bể. Y không trả lời phần sạn, chỉ dán nguyên trích đoạn tính theo bể 54 L và hoàn toàn không đụng đến chuyện chọn 2 hay 4 bóng.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** tank-fit, plan, asks-only.

**Ours** (read 4 pages, stopped at the calls limit):

> Cẩm nang hiện chưa có hướng dẫn nào về việc có nên trải sạn ở mặt tiền bể hay không, nên mình không trả lời được phần đó. Về đèn, cẩm nang nói người mới chỉ cần nhớ 0,5 đến 1 W cho mỗi lít nước (lấy dài × rộng × cao cm chia 1000 để ra số lít), và bể rộng 40–50 cm thường chỉ cần một máng đèn treo, còn đèn kẹp thành bể thì một máng đủ cho bể rộng khoảng 30 cm.
> 
> [Trích: Cách chọn đèn thủy sinh: nhiệt độ màu, công suất và số máng đèn › Tính công suất đèn cho bể]
> Với người mới, chỉ cần nhớ mức 0,5 đến 1 W cho mỗi lít nước. Muốn biết bể bao nhiêu lít thì lấy dài × rộng × cao (đơn vị cm) rồi chia ch…

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

### setup-07 · post · plain wins (3 · 8)

**Asked:** Cửa sổ nhà em bị bít nên em tháo ra, được một hõm sâu 20cm, cao 90cm, dài 100cm, em định làm bể cá âm vào đó kiểu bán cạn: hồ kính dài 90cm (chừa 10cm bố trí lọc), sâu 20cm, cao 50cm (mực nước 40cm), đèn 90cm treo phía trên. Thả 1 cục lũa cao hơn mặt nước, xếp ít đá xung quanh, phía sau trải nền trồng cây dễ sống, phía trước trải cát, trồng thêm ít cây vượt mặt nước như dương xỉ, cỏ đồng tiền, khoai lang. Cá nuôi tầm 10 con bảy màu, ít con bống dọn bể. Lọc em định dùng 1 lọc thác 8W và 1 lọc vi sinh (chạy bằng bơm oxy) với vật liệu lọc là sứ vì nuôi ít cá. Các cụ góp ý giúp em.

**Judge:** Y góp ý đúng những điểm bạn hỏi: lọc thác 8W, đặt lớp bông lọc cơ học trước lớp sứ, chọn loại bống, chạy chu trình vi sinh, chịu tải, chống thấm và an toàn điện. Y chỉ có vài lỗi nhỏ. X thì quá sơ sài, né phần lọc và cá bống, lại kèm một con số nhiệt độ không có cơ sở. / X bám sát cái bể âm tường của bạn này: tính tải, chống thấm, an toàn điện, đặt lọc trong khoang 10 cm, thêm lớp bọt biển trước lớp sứ, chọn loài bống phù hợp. Nó chỉ sai vài chi tiết nhỏ. Y tự nhận là không trả lời được phần lọc và phần cá bống, lại kèm một đoạn trích tính lọc cho cá Oscar chẳng liên quan, chỗ dùng được duy nhất là gợi ý dùng bơm tưới ẩm cho cây trên lũa.

**Ours lacks:** too-thin, plan, tank-fit. **Plain lacks:** too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Theo cẩm nang, cá bảy màu hiền, cần bể tối thiểu khoảng 40 lít và nước 17–28°C, nên bể 90×20×40 cm (khoảng 72 lít nước) đủ thể tích cho nhóm cá này. Phần lũa và cây trên mặt nước phải được tưới ẩm đều bằng bơm, còn cây bán cạn chỉ phát triển tốt khi nước khoảng 26–28°C, trên 30°C thì gần như không lớn. Cẩm nang chưa trả lời được cỡ lọc thác 8W, lọc vi sinh bằng sứ, loài bống dọn bể và việc chúng sống chung với bảy màu, nên em chưa có ý kiến chắc về các phần đó.
> 
> [Thẻ loài] Cá bảy màu (Poecilia reticulata): nhiệt độ 17–28 °C; pH 7–8.5; GH 8–30; dài 6 cm; bể từ 45 cm; tính peaceful; độ khó 1/8
> …

**Plain** (4665 characters):

> Ý tưởng tận dụng hõm cửa sổ làm bể bán cạn rất hay, và kích thước của em khá hợp lý. Em nên kiểm tra kỹ một số điểm trước khi làm.
> 
> ## 1. Kết cấu và chịu tải (quan trọng nhất)
> 
> - **Khối lượng:** Nước 90×20×40 cm ≈ **72 lít ≈ 72 kg**. Cộng thêm kính, nền cát, đá, lũa và cây thì tổng khoảng **90–110 kg**. Em cần chắc rằng phần tường và lanh tô phía trên hõm chịu được tải này, đặc biệt nếu hõm là chỗ cũ của khung cửa sổ.
> - **Đáy hõm:** Phải phẳng và chắc, nên trát lại bằng vữa để đáy bể đặt đều. Nếu đáy lệch, kính dễ nứt.
> - **Chống thấm:** Trong hõm nên quét chống thấm trước khi đặt bể. Nếu nước…

### setup-07 · tank · ours wins (4 · 3)

**Asked:** Kế hoạch lọc, cây và cá cho bể tôi định làm như vậy có ổn không?

**Judge:** Neither answer looks at the plan already saved in the tank notes: the 8W waterfall filter, the air-driven sponge filter, the ceramic media and the plant list. X at least uses the tank size and fish and asks a short, focused question. Y asks again for things the app already has, like the tank size, and its tips are generic and use foreign units (inch/gallon). / Both answers ask the hobbyist for the plan even though the filter, plants and setup are already saved. Y at least uses the saved tank size and fish and offers a volume tool. X asks again for the size it should already have and adds generic tips that don't fit this tank.

**Ours lacks:** asks-only, too-thin, tank-fit. **Plain lacks:** tank-fit, asks-only, local, too-long.

**Ours** (read 0 pages):

> Tôi chưa thấy rõ kế hoạch lọc, cây và cá mà bạn nói tới, nên chưa thể đánh giá. Bể đã lưu của bạn là 90 x 20 x 50 cm, đang có 10 cá bảy màu và 1 bống dọn bể. Bạn cho tôi biết loại lọc, các loài cây và cá bạn định thêm (kèm số lượng) để tôi kiểm tra trong cẩm nang.
> 
> [Công cụ: Thể tích bể (đã điền sẵn: hinh=chu-nhat, l=90, w=20, h=50)]
> 
> [Gợi ý hỏi tiếp] Bể 90 x 20 x 50 cm có bao nhiêu lít? · Cá bảy màu có sống chung được với bống dọn bể không? · Bể cá bảy màu cần lọc loại nào?

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

### setup-08 · post · ours wins (5 · 4)

**Asked:** Mình đang có bể dán 60x45x45, kính 5 ly. Bể vậy có mỏng quá không? Tư vấn giúp mình độ dày nền, các phụ kiện cần có và nên nuôi loại cá nào để có bể thủy sinh hợp lý. Kinh phí mình cũng không được nhiều lắm.

**Judge:** Y covers substrate, equipment and fish in detail, but it gets the first and most dangerous question wrong by saying 5 mm glass is fine for a 45 cm tall tank. That could leave a burst tank. X is thin and skips substrate and fish, but it correctly warns that the glass is too thin, which matters most here. / X is full and easy to act on (substrate depth, equipment, fish), but it gets the safety question wrong. It tells the hobbyist that 5 mm glass on a 45 cm tall, 120 L tank is safe, and that could lead to a burst tank. Y correctly says the glass is too thin, but then refuses to give advice on substrate or fish. It is too thin to help much, though it is still safer than X.

**Ours lacks:** too-thin, plan, tank-fit. **Plain lacks:** wrong, unsafe.

**Ours** (read 4 pages, stopped at the calls limit):

> Theo cẩm nang, bể 60–80 cm cần kính tối thiểu 8 ly, và nên dùng đáy 10 ly nếu bố cục nhiều đá, nên kính 5 ly của bạn là mỏng. Cẩm nang cũng khuyên bể từ 60 cm trở lên cần chân sắt hộp chắc chắn và tấm lót đáy trước khi đổ nền, và người ít ngân sách nên chọn bể nhỏ hơn như 40x30x30 cm; phần cứng khoảng 1–3 triệu. Phần độ dày lớp nền và danh sách cá hợp với bể của bạn thì tôi chưa tìm được trong cẩm nang, nên chưa tư vấn được.
> 
> [Trích: Cách chọn bể thủy sinh: kích thước, độ dày kính và loại kính › Kính dày bao nhiêu là an toàn]
> Bể cá thông thường chỉ chứa nước và cá, lực đè chủ yếu lên bốn mặt …

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

### setup-08 · tank · plain wins (3 · 6)

**Asked:** Tôi có sẵn bể, cần mua gì và nuôi cá gì để làm bể thủy sinh tiết kiệm?

**Judge:** Y gives a usable budget list of equipment, easy plants, cheap fish, cycling first and weekly water changes, though it asks for the tank size and suggests a heater that Vietnam's heat makes unnecessary. X plans a 57 L nano they don't have and recommends no fish at all. / X ignores the real 120 L size and makes some plant and heater mistakes, but it covers equipment, plants, fish, cycling and cost in a way the hobbyist can follow. Y mainly repeats a guide excerpt about building a nano tank, suggests no fish, and doesn't fit someone who already has a tank.

**Ours lacks:** tank-fit, off-topic, too-thin. **Plain lacks:** tank-fit, local.

**Ours** (read 3 pages, stopped at the calls limit):

> Cẩm nang chỉ dẫn được phần bể và thiết bị: bể nano khoảng 57 lít có thể tự làm bằng mica, dùng lọc bông góc tự chế, một bơm mini khoảng 300 lít/giờ có núm chỉnh lưu lượng, đèn LED 6000 K (một bóng nếu trồng cây dễ, hai bóng nếu trải thảm), và CO2 tự chế rẻ. Nên tận dụng thiết bị sẵn có trước khi mua thêm, và không nên mua bể lớn rồi tiết kiệm thiết bị. Cẩm nang tôi đọc được chưa nói rõ loài cá nào rẻ và dễ nuôi nhất, nên tôi chưa thể gợi ý cá cụ thể cho bể tiết kiệm của bạn.
> 
> [Trích: Set bể thủy sinh nano tiết kiệm: tự làm lọc bông góc, đèn LED và CO2 › Bắt đầu từ đâu]
> 1. Chọn kích thước bể v…

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

### setup-09 · post · plain wins (2 · 8)

**Asked:** Em có cái hộc giá sách, định làm bể dài 170x30x35, mặt trước kính siêu trong để vào đó. Layout đơn giản: nền cát và cuội hoặc đá, thêm ít lũa và ráy; cá thì loại size nhỏ dễ nuôi, ít tốn công chăm và ít thay nước. Em định dùng lọc thùng, với size bể này có phù hợp không? Em định dặn bên làm bể chừa lỗ chờ cho lọc ở 2 đầu bể.

**Judge:** X never answers whether a canister filter suits this tank and just tells the hobbyist to ask the tank builder. Y confirms it does and gives a real plan: flow rate, intake and outlet placement at the two ends, room for the canister, load on the shelf, plants and fish. Its few errors are minor. / X trả lời thẳng là lọc thùng hợp, rồi đưa ra lưu lượng, cách bố trí lỗ chờ hút/xả chéo nhau, bulkhead, tải trọng hộc và chọn cá hợp nền. Y gần như từ chối trả lời và chỉ trích một đoạn chung chung về lọc, không dùng gì đến chi tiết bể của bạn này.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** local.

**Ours** (read 2 pages, stopped at the calls limit):

> Cẩm nang hiện chưa có hướng dẫn cụ thể cho bể 170x30x35 cm hay cách chừa lỗ ở hai đầu bể, nên mình chưa khẳng định được lọc thùng có hợp với bể này không. Theo cẩm nang, lọc thùng mạnh hay yếu chủ yếu nằm ở lượng và loại vật liệu lọc nó chứa được, còn lưu lượng không quan trọng bằng. Bạn nên hỏi bên làm bể về vị trí lỗ và chọn lọc theo thể tích thực tế của bể.
> 
> [Trích: Lọc thùng, lọc treo cho bể cá: cách chọn, xếp vật liệu và vệ sinh › Chọn lọc nào]
> Một chiếc lọc thùng mạnh hay yếu chủ yếu nằm ở chỗ nó chứa được bao nhiêu vật liệu và đó là vật liệu gì. Lưu lượng không quan trọng bằng. Các mẫu…

**Plain** (2866 characters):

> Bể 170×30×35 cm, khoảng 178 lít tổng, nên đủ rộng để nuôi cá nhỏ đẹp. **Lọc thùng rất hợp** với kích thước này, thậm chí là lựa chọn tốt nhất trong các loại lọc thường dùng, vì bể dài và sâu nên cần lưu lượng lớn và bể ít tốn chỗ cho lọc.
> 
> **1. Chọn công suất lọc**
> - Với bể cá nhỏ, nên lọc đảo nước khoảng **6–8 lần/giờ** (tổng thể tích bể) cho cá nhỏ, và có nhiều cây thì vẫn tốt.
> - Tức là khoảng **1000–1400 L/h** là hợp lý. Chọn thùng có công suất thực tế (không chỉ ghi trên hộp) khoảng 1000 L/h trở lên, loại có thể chỉnh lưu lượng.
> - Có thể dùng thùng cỡ vừa đến lớn (ví dụ dòng Sunsun, Eheim…

### setup-09 · tank · plain wins (4 · 5.5)

**Asked:** Bể tôi định làm dùng lọc thùng có hợp không, và nuôi cá gì cho ít phải chăm?

**Judge:** X uses the tank size but is thin: it suggests only one fish, wrongly suggests a canister means a lot of upkeep, and fills the screen with long excerpts. Y is generic, ignores the 170 cm tank and the holes planned at both ends, and has a few mistakes, but it says yes to the canister with flow figures and gives a usable list of easy fish plus tips for cutting down care. / Lời khuyên của X chung chung và vẫn hỏi lại dung tích bể, nhưng xác nhận đúng là lọc thùng hợp, cho lưu lượng, danh sách cá dễ nuôi và cách chăm cụ thể. Y có dùng kích thước bể nhưng nghiêng về can người chơi không dùng lọc thùng, chỉ gợi ý được mỗi cá chuột, và đoạn trích dài mà ít giúp được bể này.

**Ours lacks:** too-thin, plan, tank-fit. **Plain lacks:** tank-fit, local.

**Ours** (read 4 pages, stopped at the tools limit):

> Theo cẩm nang, lọc thùng mạnh và êm, nhưng bảo trì khá khó vì gần như lần nào vệ sinh cũng phải tháo cả hệ thống, và vật liệu lọc sinh học dễ chết khi mất điện, nên nếu bạn muốn ít việc thì cần cân nhắc. Để nuôi ít phải chăm, cẩm nang gợi ý cá chuột (Corydoras): hiền, không kén ăn, dễ sinh sản, và hầu hết loài cần bể từ 75 lít trở lên; bể 170 x 30 x 35 cm của bạn đủ điều kiện đó. Tôi chưa tra thêm được danh sách các loài dễ nuôi khác, nên đây là gợi ý duy nhất tôi đã đọc.
> 
> [Trích: Lọc hồ cá: Bạn nên chọn loại nào? Tổng quan về lọc hồ cá › Lọc thùng (canister filter)]
> Lọc thùng về cơ bản là cả…

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

### cycling-01 · post · plain wins (3.5 · 6)

**Asked:** Bể em dài 90cm rộng 40, đã mua bình CO2 + trộn cánh quạt, lọc thùng DF1300, đèn Odyssea, nền 10kg loại nhiều chất, trồng trân châu ngọc trai, sao nhỏ và một đống cây cắm lưa thưa. Tuần đầu em lật ra lật vào 3 lần, mất một đống cây vì nhổ ra bị úa, nền mua thiếu thấy mỏng lại hút nước ra cho thêm. Hiện ngày nào em cũng thay 50% nước. Bể đang ổn định được 3 ngày, em định 1 tuần thì thả cá nhỏ như neon, 7 màu. Vậy đã thả được chưa, và nên mua sục oxy loại nào?

**Judge:** Y có ích hơn: trả lời rõ là chưa nên thả, đưa tiêu chí để biết khi nào thả được, giải thích chuyện nhổ trồng lại nhiều lần và có trả lời về sục khí. Tuy vậy Y sai khi khuyên giảm thay nước với nền nhiều dinh dưỡng và đọc nhầm neon với 7 màu thành một loài. X quá mỏng, gần như chỉ trích lại cẩm nang và bỏ trống câu hỏi về sục oxy. / Tôi chọn X. X trả lời thẳng là chưa nên thả cá, đưa các bước kiểm tra trước khi thả, khuyên để yên cây và gợi ý máy sục có bán ở Việt Nam. Tuy vậy, X khuyên giảm thay nước quá sớm và hiểu nhầm \"neon, 7 màu\" là một loài. Y nói đúng nhưng quá mỏng: không nói gì về chuyện thay 50% nước mỗi ngày hay việc lật bể nhiều lần, cũng không trả lời câu hỏi về máy sục.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** wrong, figures, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Theo cẩm nang, bể trồng cây có thể chạy chu trình nitơ nhờ cây, và trước khi thả cá bạn nên dùng que thử để kiểm tra: amoniac và nitrit ở 0 ppm, nitrat dưới 40 ppm, rồi mới thả dần vài con và cho ăn ít. Bể mới 3 ngày chưa chắc đã đạt các chỉ số này, nên thử nước trước rồi mới quyết định thả neon. Về máy sục oxy, tôi chưa tìm được trang nào trong cẩm nang nêu loại cụ thể nên chưa thể gợi ý.
> 
> [Trích: Cycling bể cá nước ngọt: cách chuẩn bị trước khi thả cá mới › Cycling bằng cây thủy sinh]
> Đây là phương pháp Aquarium Co-Op yêu thích nhất vì nó thực sự biến bể thành một hệ sinh thái tự nhiên, cả …

**Plain** (1970 characters):

> **Chưa nên thả cá lúc này.** Ba ngày là quá sớm, và có vài lý do:
> 
> - **Bể chưa chu trình nitơ.** Nền dinh dưỡng và vi sinh có lợi cần vài tuần mới hình thành đủ. Trong giai đoạn này amoniac có thể tăng đột ngột, và cá nhỏ như neon rất nhạy với nó.
> - **Thay 50% nước mỗi ngày làm chậm quá trình này.** Nó loại bỏ amoniac và vi khuẩn ngay khi chúng vừa hình thành, nên bể chưa có cơ hội ổn định. Bạn có thể giảm xuống 1-2 lần/tuần, chỉ thay thêm khi đo thấy chỉ số xấu.
> - **Cây đang hồi phục.** Cây mới trồng và vừa bị nhổ lên nhổ xuống cần vài tuần để bám rễ và ra rễ mới. Trân châu ngọc trai rất khó…

### cycling-01 · tank · ours wins (4.5 · 4)

**Asked:** Bể thủy sinh mới set được ít ngày, khi nào thì thả neon và bảy màu được?

**Judge:** Y cho mốc 3–6 tuần và cách test NH3/NO2 rất hữu ích, nhưng lại khuyên nhỏ nước rửa chén vào bể, một bước có hại. X an toàn nhưng quá mỏng: không có mốc thời gian, không có các bước làm. Cả hai đều bỏ qua nền nhiều dưỡng và việc chủ bể thay nước 50% mỗi ngày. / X có các bước cụ thể và mốc 3–6 tuần, nhưng lại khuyên dùng nước rửa chén để cycle, một lời khuyên sai và gây hại cho cá lẫn vi sinh. Y đúng và an toàn (neon chỉ thả khi bể đã ổn định, bảy màu cứng hơn), nhưng quá mỏng: không có mốc thời gian, không dùng thông tin bể của người hỏi (nền nhiều dưỡng, mới 1,5 tuần, đang thay 50% nước mỗi ngày), và đoạn trích cẩm nang bị cắt dở.

**Ours lacks:** plan, figures, tank-fit. **Plain lacks:** tank-fit, unsafe, wrong.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang nói rõ cá neon không hợp với bể mới set: chúng không chịu được biến động của giai đoạn khởi động, nên chỉ nên thả khi bể đã trưởng thành hoàn toàn và thông số nước ổn định. Với cá bảy màu, cẩm nang mô tả là loài dễ nuôi, chịu được vài sai sót của người mới, nhưng trong phần tôi đọc không có mốc số ngày cụ thể. Bạn nên chờ bể chạy xong chu trình nitơ (mục cách cycling bể cá trong cẩm nang) rồi mới thả, và đo nước để chắc chắn ổn định.
> 
> [So sánh]
> - Cá neon xanh (Paracheirodon innesi): nhiệt độ 21–25 °C; pH 4–7.5; GH 1–12; dài 3 cm; bể từ 60 cm; đàn từ 6 con; tính peaceful; độ khó 2/8
> -…

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

### cycling-02 · post · plain wins (3 · 8)

**Asked:** Em mới nhập môn, mua bể đúc 50cm + đèn 3 màu + lọc thác. Hai bố con mua 7 đôi cá: 5 đôi neon xanh đỏ + 2 đôi cá vàng nhỏ xíu. Sau 2 ngày cá lăn ra chết, chỉ còn 3 con cá vàng nhỏ. Vì sao vậy, và nên mua loại cá nào sống dai, sống khỏe cho con chăm?

**Judge:** Y names the likely cause (an uncycled tank, too many fish, and goldfish kept with neons). It tells them how to save the 3 surviving goldfish and lists hardy fish suited to a 50cm tank, with an order of steps. X is thin, won't name a cause, and gives almost no steps. / X names the right cause: an uncycled new tank that was overstocked with two incompatible species. It also says what to do for the 3 surviving goldfish, gives a step-by-step plan for starting over, and lists hardy fish that suit a 50cm tank. Y avoids naming a cause, gives no steps, and its suggestions include white cloud, which doesn't handle Vietnam's heat well.

**Ours lacks:** diagnosis, plan, too-thin. **Plain lacks:** local.

**Ours** (read 4 pages, stopped at the tools limit):

> Cẩm nang chưa nói rõ nguyên nhân cá chết, nên em chưa thể khẳng định. Tuy vậy, cẩm nang nhấn mạnh bể cần chạy chu trình nitơ trước khi thả cá, và cá vàng cần nước mát 20–23°C cùng bể tối thiểu 80 lít, nên bể 50cm với cá neon nhiệt đới rất dễ gây sốc. Với người mới, cẩm nang gợi ý các loài như cá rasbora tam giác, cá chuột albino hay white cloud, là những loài khỏe và dễ nuôi hơn.
> 
> [Thẻ loài] Cá vàng (Carassius auratus): nhiệt độ 10–27 °C; pH 6–9; GH 6–15; dài 20 cm; tính peaceful; độ khó 2/8
> 
> [Trích: Cycling bể cá nước ngọt: cách chuẩn bị trước khi thả cá mới › Chu trình nitơ trong bể cá là g…

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

### cycling-02 · tank · plain wins (4 · 7)

**Asked:** Tôi vừa mua bể và thả cá, mới 2 ngày cá đã chết gần hết, vì sao?

**Judge:** Both answers correctly blame new tank syndrome. Y gives emergency steps for the 3 goldfish still alive: a daily 25–50% water change with dechlorinated water, stop feeding, strong aeration, testing and adding bacteria. X only says to test the water and points to long guide excerpts with no rescue plan. Neither uses the tank details. Neither says that neon and goldfish don't belong in the same tank. Y also asks for details the app already has. / Both answers name the right cause: a new tank that hasn't cycled, so ammonia and nitrite build up. X adds clear first steps: change water daily, stop feeding, test the water, aerate, add bacteria starter (vi sinh). Y only says to test, and its guide excerpts cover setting up a tank next time, not saving the 3 goldfish still alive. Neither says that keeping goldfish (cá vàng) with neon is a mismatch.

**Ours lacks:** plan, tank-fit, too-long, follow-up. **Plain lacks:** tank-fit.

**Ours** (read 4 pages):

> Nguyên nhân thường gặp là bể còn mới, chưa đủ vi sinh có lợi để xử lý amoniac và nitrit, nên hai chất này tăng lên và làm cá sốc, bỏng mang rồi chết. Cẩm nang cho biết cycle bể thường mất từ vài tuần tới vài tháng, và cá mua về đã yếu hoặc được thuần nước vội cũng dễ chết sớm. Bạn nên kiểm tra amoniac và nitrit trong bể ngay, và tham khảo phần cẩm nang về chu trình nitơ.
> 
> [Trích: Cách nuôi cá neon, neon vua không bị rụng đàn cho người mới › Bắt đầu từ đâu]
> 1. Set bể và để chạy ít nhất 3 tuần, tốt nhất 5 tuần, có lá bàng khô, cây nổi, đèn vừa và dòng chảy nhẹ.
> 2. Thả thử 2 đến 3 con neon trước…

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

### cycling-03 · post · plain wins (3 · 6.25)

**Asked:** Em mới chơi lần đầu, nghe người bán cá chỉ và hơi hấp tấp nên trong một tuần em set nền full trân châu ngọc trai lùn, trồng cây xếp cảnh. Sau đó em thả 2 ngàn đồng cá trâm, 5 con tép RC, 1 tỳ bà baby, chục con bảy màu. Đổ nước vào được một tuần thì rêu hại tràn lan, loại rêu trắng trắng làm thối rữa trân châu và lan rất nhanh. Bảy màu chết 7 con, cá trâm chết gần nửa đàn, tép trốn biệt vài ngày mới thấy ló mặt. Cây đang chết dần chết mòn, em đã thay nước, vớt bớt rêu, thả tép mồi số lượng lớn mà bất lực. Em đang định bỏ hồ này set lại theo kiểu nền đá đen, tường full rêu, mấy cây lá to dày, nuôi đội vệ sinh tỳ bà bướm, chuột panda, tép RC, cá trâm. Nên làm sao?

**Judge:** Y chẩn đoán đúng là hồ chưa cycle mà đã thả quá nhiều cá. Y đưa ra các bước cụ thể: test nước, thay nước, giảm đèn, cycle lại 4–6 tuần, thả cá dần. Tuy vậy, Y nhầm trân châu là sỏi và không nói rõ lớp mảng trắng là gì. X chỉ chép trích đoạn từ cẩm nang, không có kế hoạch nào để làm theo. / X nói đúng nguyên nhân chính là hồ chưa chạy xong chu trình nitơ mà đã thả quá nhiều cá. X cũng đưa ra kế hoạch theo thứ tự rõ ràng: test nước, thay nước, ngưng cho ăn, cycle lại. Dù vậy, X hiểu nhầm trân châu là sỏi nền và nói sai về tỳ bà bướm. Y chỉ trích dẫn tài liệu chung chung, không có bước xử lý nào và còn giả định hồ có phân nền mà người hỏi không hề nhắc tới.

**Ours lacks:** plan, follow-up, too-thin. **Plain lacks:** diagnosis, too-long, local, tank-fit.

**Ours** (read 4 pages, stopped at the tools limit):

> Mình chưa kiểm tra được đủ để trả lời trọn kế hoạch này: chưa xem được tỳ bà bướm, chuột panda có hợp với cá trâm và tép RC không, nên bạn nên kiểm tra lại bằng công cụ tank-mates trước khi thả. Cẩm nang nói bể mới thường mất vài tuần tới vài tháng để chu trình nitơ ổn định, nên thả cá quá sớm và quá nhiều là nguyên nhân hay làm cá, tép chết; phân nền mới cũng nhả nhiều dinh dưỡng ở giai đoạn đầu, nên rêu bùng lên là chuyện thường. Cá trâm cần nước mềm, hơi axit, bể khoảng 45 cm và đàn ít nhất 8 con, còn cá bảy màu nằm trong nhóm nên tránh chung với nó.
> 
> [Trích: Hướng dẫn cơ bản về chu trình …

**Plain** (3273 characters):

> Mình hiểu cảm giác bất lực khi cá chết và cây tàn dần. Chuyện này rất phổ biến với người mới, và phần lớn là do **hồ chưa chu trình (chưa cycle)** cộng với **thả quá tải, cho ăn nhiều** trong khi hệ vi sinh chưa đủ để xử lý chất thải. Rêu trắng bùng lên chính là dấu hiệu của chất hữu cơ dư thừa đang phân hủy.
> 
> ## 1. Việc cần làm ngay (vài ngày tới)
> 
> **Kiểm tra nước trước tiên.** Mua bộ test API Liquid (NH3/NH4, NO2, NO3, pH). Nếu NH3 hoặc NO2 khác 0 thì đó gần như chắc chắn là nguyên nhân cá chết.
> 
> **Xử lý tình trạng cấp bách:**
> - **Ngưng cho ăn 2-3 ngày.** Thức ăn thừa là nguồn amoniac chính…

### cycling-03 · tank · plain wins (3.5 · 7)

**Asked:** Bể mới set một tuần thì rêu trắng lan và cá chết gần nửa, có nên lật bể làm lại không?

**Judge:** Y answers the question directly (don't tear down the tank), names the likely cause as the new tank's nitrogen cycle, and gives clear steps in order with figures and conditions for when to start over. X pastes guide excerpts, including an unrelated section on power cuts, and never deals with the white growth. / X answers the question directly: it says not to tear the tank down, names the likely cause (an uncycled tank after adding fish in week one), gives steps in order with figures, and says when a restart would make sense. Y pastes guide excerpts with padding (including power-outage advice), never deals with the white growth, and gives no clear answer.

**Ours lacks:** too-long, tank-fit, diagnosis. **Plain lacks:** tank-fit.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang chưa nói rõ có nên lật bể hay không. Nhưng bể mới set một tuần thường còn đang chạy chu trình nitơ, và cẩm nang hướng dẫn xử lý ngay: đo amoniac và nitrit, nếu amoniac cao thì thay ít nhất 50% nước và ngưng hoặc giảm cho ăn. Bạn nên làm các bước này trước, rồi quyết định có làm lại bể hay không.
> 
> [Trích: Cá chết hàng loạt trong bể: làm gì ngay và tìm nguyên nhân thế nào › Làm gì ngay]
> Cách xử lý tùy vào thủ phạm, nên đo nước trước rồi làm theo trường hợp:
> - Amoniac cao: thay ít nhất 50% nước, ngưng hoặc giảm cho ăn.
> - Amoniac tổng trên 5 mg/L và pH dưới 7: chuyển cá sang một hệ nước …

**Plain** (1555 characters):

> **Thường không cần lật bể.** Bể mới một tuần mà cá chết nhiều thường là do **chu trình nitơ chưa ổn định** (amoniac và nitrit tăng cao), không phải bể hỏng không cứu được. Vi khuẩn có lợi nằm trong lọc, sỏi và trang trí, nếu đổ đi làm lại thì bạn phải chờ chu trình chạy lại từ đầu, thường mất thêm 3-6 tuần.
> 
> **Việc nên làm ngay:**
> 
> 1. **Test nước** (amoniac, nitrit, nitrat, pH). Nếu amoniac hoặc nitrit trên 0 là đang độc, cần xử lý gấp.
> 2. **Thay nước 30-50% mỗi ngày** nếu có amoniac/nitrit, dùng nước đã khử clo, cùng nhiệt độ với bể. Dùng thuốc khử độc amoniac nếu có.
> 3. **Ngừng cho ăn 1-2 n…

### cycling-04 · post · plain wins (3 · 8)

**Asked:** Hồ mình 40x30x30, vừa set up được 5 ngày thì có hiện tượng cá chết, mặt hồ có bọt trắng là sao? Hồ như vậy có cần thay nước thường xuyên không, có cần sục sủi không? Mình chỉ để chạy máy lọc nước thôi.

**Judge:** Y names the likely cause, that the tank hasn't finished cycling, and explains the white foam. It gives first steps in order with sensible numbers (stop feeding 2–3 days, change 25–30% of the water, act when ammonia or nitrite is above 0.25 ppm), and it covers dechlorinating tap water and the low oxygen in hot weather. X won't diagnose, and its rule to change water only when nitrate reaches 40 ppm is wrong for an emergency in a new tank. / X nêu đúng nguyên nhân hay gặp nhất là hồ mới chưa chạy vi sinh, gây ngộ độc amoniac/nitrit. X giải thích được bọt trắng, đưa ra các bước cấp cứu có thứ tự kèm con số, và tính đến hồ 36L cùng khí hậu nóng ở Việt Nam. Y từ chối chẩn đoán, không có bước nào để làm ngay, và khuyên chỉ thay nước khi nitrat lên 40 ppm, lời khuyên này gây hại trong tình huống cá đang chết.

**Ours lacks:** diagnosis, plan, tank-fit. **Plain lacks:** –.

**Ours** (read 4 pages, stopped at the tools limit):

> Cẩm nang chưa giải thích bọt trắng trên mặt hồ hay nguyên nhân cá chết sau 5 ngày, nên mình không dám chẩn đoán. Cẩm nang nói rằng amoniac sinh ra từ chất thải của cá rất độc và có thể làm bỏng mang, bỏng da, nên bể mới cần đủ vi khuẩn có lợi để xử lý amoniac và nitrit; bạn nên thử amoniac và nitrit (lý tưởng là 0 ppm), và chỉ thay nước khi nitrat lên từ 40 ppm trở lên. Về sục khí: lọc treo và lọc thùng chạy bằng mô tơ điện nên không bắt buộc máy sục khí, còn lọc bọt biển và lọc đáy thì bắt buộc phải có.
> 
> [Trích: Hướng dẫn cơ bản về chu trình nitơ trong bể cá › Chu trình nitơ trong bể cá là g…

**Plain** (2320 characters):

> ## Nguyên nhân có thể
> 
> Hồ mới 5 ngày thường chưa đủ **chu trình nitơ** (cycling). Hồ mới chưa có vi khuẩn có lợi để phân hủy chất thải của cá:
> 
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻) tích tụ** từ phân cá, thức ăn thừa, xác lá. Đây là nguyên nhân chết cá phổ biến nhất ở hồ mới. Amoniac và nitrit rất độc, còn cá thì yếu dần.
> - **Bọt trắng trên mặt** thường là bọt protein từ chất hữu cơ, hoặc do vi khuẩn bùng phát trong giai đoạn đầu. Bọt có thể do thức ăn thừa, phân, hoặc dư chất tẩy rửa/xà phòng còn sót lại khi vệ sinh hồ và trang trí.
> - Các nguyên nhân khác: nước máy chưa khử clo, nhiệt độ h…

### cycling-04 · tank · plain wins (4 · 7.25)

**Asked:** Bể mới set 5 ngày cá chết và mặt nước có bọt trắng, là sao?

**Judge:** Y names the likely causes, new-tank syndrome with ammonia/nitrite and foam from organic waste or soap, and gives ordered steps: add aeration, stop feeding, test, change water, use a detoxifier. X pastes a long, generic excerpt, can't explain the foam, and buries the step of adding aeration, which their filter-only tank needs. / X names the likely cause (a new, uncycled tank with ammonia/nitrite building up), explains the foam, and gives clear steps in order, including adding an air pump. That fits this filter-only tank with no aeration. Y leaves the foam unexplained and is buried in a long generic excerpt that never ties back to this tank.

**Ours lacks:** diagnosis, too-long, tank-fit. **Plain lacks:** tank-fit, local, follow-up.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang có ghi hội chứng bể mới: amoniac tăng vọt, thường 1 đến 3 tuần sau khi thả cá vào bể chưa có lọc vi sinh chạy, có thể làm cá chết. Nếu cá đang chết, hãy đo amoniac, nitrit và oxy, rồi thay ít nhất 50% nước và ngưng cho ăn khi amoniac cao. Cẩm nang chưa giải thích bọt trắng trên mặt nước, nên phần này bạn cần kiểm tra thêm.
> 
> [Trích: Cá chết hàng loạt trong bể: làm gì ngay và tìm nguyên nhân thế nào › Nguyên nhân]
> Oxy đứng đầu danh sách. Ngay sau oxy là amoniac. Dưới đây là các thủ phạm cùng ngưỡng gây hại:
> - Thiếu oxy hòa tan. Oxy trên 5 mg/L là tốt nhất. Dưới 5 mg/L cá bắt đầu bị str…

**Plain** (2085 characters):

> Bể mới 5 ngày mà cá đã chết và có bọt trắng thường là dấu hiệu **bể chưa ổn định, nước đang bị nhiễm độc**. Nguyên nhân hay gặp nhất:
> 
> ## Nguyên nhân có thể
> 
> 1. **Ammonia (NH₃/NH₄⁺) hoặc Nitrite (NO₂⁻) tăng cao.** Đây là nguyên nhân phổ biến nhất. Bể mới chưa có vi khuẩn có lợi để phân hủy chất thải, nên khí độc tích tụ và giết cá. Cá thường bơi ngoi lên mặt, há miệng, mang đỏ hoặc tím.
> 2. **Bọt trắng** thường do chất hữu cơ dư thừa: thức ăn thừa, phân cá, cá chết phân hủy, nhớt cá, hoặc còn sót xà phòng/chất tẩy rửa khi vệ sinh bể, lọc, đá, cây.
> 3. **Sốc môi trường:** nước máy chứa clo/chlor…

### cycling-05 · post · plain wins (5.5 · 7)

**Asked:** Mình mới tập set một hồ biotop 845, chỉ có lũa hải sa quỳ, đá đen và đá cuội, vài cây thủy sinh không cần CO2, lọc thùng Atman, đèn rọi vàng-trắng. Giai đoạn mới châm đầy nước và chạy lọc thì nên châm loại vi sinh nào?

**Judge:** Y answers the question directly: dose nitrifying bacteria. It also gives cycling steps that fit this tank (tannins from the driftwood, the Atman filter, plants that don't need CO2). X avoids naming a bacteria type and pastes a long excerpt with marine-only steps. X's one real strength is naming Vietnamese products, Extrabio and Koica. / X answers the question directly: it says to use nitrifying bacteria and gives a fishless-cycling plan in order, with test targets, which suits this tank. Y names Vietnamese brands (Extrabio, Koica), which is a plus, but it is long, mixes in saltwater steps (UV, skimmer, ozone) and doesn't use the hobbyist's own tank details.

**Ours lacks:** tank-fit, too-long, diagnosis. **Plain lacks:** local.

**Ours** (read 4 pages):

> Cẩm nang không chỉ đích danh loại vi sinh nào cho hồ biotop của bạn, mà hướng dẫn chọn theo nguồn gốc: chai nên ghi rõ công ty sản xuất, thành phần, hướng dẫn cụ thể và đầu mối hỏi khi có vấn đề. Khi chạy bể mới, bạn khử clo và giữ nhiệt 24–26°C trước, rồi châm men theo nhãn chai và test amoni, nitrit mỗi ngày hoặc cách ngày. Thường phải 4–6 tuần bể mới chạy xong, và bạn nên thả cá từ từ, mỗi lần 2–3 con.
> 
> [Trích: Châm vi sinh cho bể cá, bể thủy sinh: chọn loại nào, châm ra sao › Chọn chai vi sinh thế nào]
> Không ai nhìn, đo hay đếm được vi khuẩn trong chai. Vì vậy tiêu chí quan trọng nhất là …

**Plain** (2095 characters):

> Với giai đoạn châm nước và chạy lọc, bạn nên dùng **vi sinh nitrat hóa** (nitrifying bacteria), thường ghi là chứa *Nitrosomonas* và *Nitrobacter*. Nhóm vi khuẩn này chuyển hóa amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻), hai chất rất độc với cá, thành nitrat (NO₃⁻) ít độc hơn. Các dòng phổ biến gồm Seachem Stability, Tetra SafeStart, API Quick Start, Tetra Nitrivec và các dòng vi sinh tươi từ bể đã chạy ổn định.
> 
> **Các bước nên làm:**
> 
> 1. **Khử clo trước khi châm nước.** Clo sẽ diệt vi khuẩn. Dùng nước đã để qua đêm, hoặc dùng chất khử clo, và chỉ thả vi sinh sau khi nước đã xử lý xong.
> 2. **Ngâm lũ…

### cycling-05 · tank · ours wins (7 · 5)

**Asked:** Bể mới đổ nước chạy lọc, nên châm vi sinh loại nào để sớm thả cá?

**Judge:** Cả hai câu trả lời đều không dùng tới thông tin bể 80×40×50 biotop của người hỏi. X có kế hoạch dựa trên số liệu thử nghiệm và nói rõ phải dựa vào que thử. Y nêu tên hàng chai thật, nhưng gợi ý thả cá mở bể thì sai: lia thìa đực đánh nhau, còn neon nhạy cảm, không hợp bể mới. / Y đưa ra thứ tự rõ ràng: kiểm nhiệt độ, chọn sứ cấy sẵn hoặc vi sinh chai kèm giá thể, châm amoniac 1–2 ppm, rồi chờ test về 0 mới thả cá. Các con số của Y đều có nguồn từ thử nghiệm. X thì chung chung, chỉ liệt kê nhãn hàng ngoại và gợi ý cá thả đầu tiên sai (lia thìa, neon). Cả hai đều chưa tận dụng thông tin bể biotop 845 lọc thùng của người hỏi.

**Ours lacks:** tank-fit, too-long. **Plain lacks:** tank-fit, local.

**Ours** (read 4 pages):

> Cẩm nang khuyên dùng sứ lọc đã cấy sẵn vi sinh lấy từ bể khỏe đang nuôi cá, cho kết quả nhanh nhất, khoảng 7–8 ngày ở nước ấm. Nếu dùng vi sinh đóng chai thì nên bỏ kèm sứ hoặc vật liệu lọc vào lọc, mất khoảng 14 ngày; và giữ nước ở 24–26°C. Đừng thả cá chỉ vì bao bì ghi chạy tức thì, hãy đợi que thử báo amoniac và nitrit đều về 0.
> 
> [Trích: Chạy vi sinh bể mới: sứ cấy sẵn, vi sinh chai hay chỉ châm amoniac › Bắt đầu từ đâu]
> 1. Đo nhiệt độ nước bể mới. Nếu dưới 24°C, gắn sưởi để giữ khoảng 24–26°C trong thời gian chạy vi sinh.
> 2. Chọn nguồn vi sinh. Sứ cấy sẵn từ bể đang nuôi cá cho kết quả nh…

**Plain** (1429 characters):

> Với bể mới, bạn nên chọn **vi sinh chứa vi khuẩn nitrat hóa sống** (thường có *Nitrosomonas* và *Nitrobacter*). Các loại phổ biến gồm **Seachem Stability**, **Tetra SafeStart**, **API Quick Start**, **Dr. Tim's** hoặc **Sera Bio Nitrivec**. Tránh loại chỉ có enzyme hoặc chỉ khử clo, vì chúng không giúp hình thành chu trình nitơ.
> 
> **Cách làm:**
> 1. **Châm vi sinh ngay** sau khi đổ nước và chạy lọc, liều theo hướng dẫn trên bao bì. Có thể châm lại sau 1-2 tuần để bù lượng vi khuẩn.
> 2. **Nuôi vi khuẩn bằng nguồn amoniac:** cho ăn một ít thức ăn mỗi ngày, hoặc dùng amoniac nguyên chất (không có ch…

### cycling-06 · post · plain wins (4.5 · 7)

**Asked:** Em mới set một bể cubic 20 loại lowtech, mấy hôm nay nước trong bể tự nhiên rất đục, mờ mờ như lớp sương mù. Mọi người bảo do vi sinh bị chết. Làm sao khắc phục và tạo lại vi sinh? Em cũng nuôi cá trong thùng xốp, nước trong đó rất trong dù thỉnh thoảng mới hút cặn và châm thêm nước. Em lấy nước thùng xốp đó châm mồi vi sinh cho bể mới được không?

**Judge:** Both answers correctly say the haze is a bacterial bloom, not dead bacteria. Y fits this tank and question better. It deals directly with the foam-box idea: the water helps a little, it can carry disease, and taking some substrate or squeezing a sponge from the box works better. Its steps are clear and include testing ammonia and nitrite. X's text is short but buried under long, mostly off-topic excerpts, and its light advice was taken from the section on green water. / X answers both questions directly. It names the bacterial bloom, gives steps in order, and explains why the foam-box water does little and can carry disease. Y's short answer is right in essence, but its light advice is wrong and it is buried under long, mostly off-topic guide excerpts.

**Ours lacks:** tank-fit, too-long, follow-up, plan. **Plain lacks:** local, tank-fit.

**Ours** (read 6 pages, stopped at the tools limit):

> Nước mờ như sương trong bể mới thường là bùng vi sinh chứ không phải vi sinh chết. Cẩm nang khuyên đo ammonia trước; nếu ammonia bằng 0 thì ngưng cho ăn khoảng 7 ngày, không đụng vào lọc và để bể tự cân bằng, còn nếu kéo dài thì giảm đèn còn 8–12 tiếng, che nắng, cho ăn ít lại và thêm cây. Về nước thùng xốp, cẩm nang nói vi sinh bám trên bề mặt vật liệu lọc chứ không trôi trong nước, nên nước đó gần như không mồi được vi sinh; muốn mồi thì vắt bông lọc từ bể đang chạy ổn định sang lọc mới, và đổ đầy bể bằng nước đã khử clo.
> 
> [Trích: Nước bể cá bị đục trắng, đục xanh: nguyên nhân và cách làm n…

**Plain** (2164 characters):

> ## Nước đục có phải do vi sinh chết không?
> 
> Nhiều khả năng **không**. Nước đục mờ như sương ở bể mới thường là **bloom vi khuẩn** (vi khuẩn sinh sôi quá mức khi có nhiều chất hữu cơ từ thức ăn, lá rụng, phân, hoặc nước máy mới). Đây là giai đoạn bình thường khi bể đang chạy (cycling), kéo dài khoảng 1-3 tuần. Vi sinh có ích (nitrat hóa) chủ yếu bám trên bề mặt lọc, nền, đá, kính, cây, nên nước đục không có nghĩa là chúng chết.
> 
> ## Cách xử lý
> 
> - **Đừng thay nước lớn** hoặc rửa lọc bằng nước máy mạnh. Việc này loại bỏ vi sinh bám và làm bloom kéo dài.
> - **Giảm ánh sáng** xuống khoảng 4-6 giờ/ng…

### cycling-06 · tank · plain wins (5 · 6.25)

**Asked:** Bể mới set bỗng đục mờ như sương, có phải vi sinh chết và làm sao gây lại?

**Judge:** Both answers correctly say this is a bacterial bloom (bùng vi sinh), not dead bacteria. Y gives a fuller plan: keep the aeration on, test, and change water by a set percentage. It also adds a clear way to reseed the tank. X is thin and padded with off-topic excerpts about green water and UV lamps. Neither answer mentions the 20cm cubic tank or explains that water from the foam box carries few bacteria, so it seeds a tank poorly compared with used filter media. / Cả hai đều đoán đúng là bùng vi sinh, nhưng không câu nào nói đến bể khoảng 8 lít hay chuyện lấy nước thùng xốp để mồi (nước mồi ít tác dụng, vi sinh nằm ở vật liệu lọc và nền). X đưa ra quy trình gây lại vi sinh rõ ràng, có các con số cần theo dõi. Y viết tiếng Việt quen thuộc hơn nhưng phần trích dẫn lại kéo sang chuyện nước xanh và đèn UV, không liên quan.

**Ours lacks:** tank-fit, plan, too-long, off-topic. **Plain lacks:** tank-fit, local, too-long.

**Ours** (read 4 pages):

> Thường thì không phải vi sinh chết. Nước đục trắng như sương hay nước vo gạo thường là bùng vi sinh, một đợt vi khuẩn bùng lên khi bể mới chạy. Hãy đo ammonia: nếu bằng 0 thì ngừng cho ăn khoảng 7 ngày, không đụng vào lọc và để bể tự cân bằng; nếu ammonia trên 0,1 mg/L thì thay một phần nước. Cẩm nang cũng lưu ý nếu bể bị vỡ vi sinh thật, bạn có thể gây lại bằng vật liệu lọc đã chạy từ một bể khỏe, thả cá từ từ và xả vật liệu lọc bằng nước đã khử clo.
> 
> [Trích: Nước bể cá bị đục trắng, đục xanh: nguyên nhân và cách làm nước trong › Ở Việt Nam]
> Nước ở mình ấm, vì vậy nhiệt độ thay đổi đột ngột …

**Plain** (1912 characters):

> Bể mới bị đục trắng như sương thường **không phải vi sinh chết**. Phổ biến nhất là **bloom vi khuẩn** (bùng phát vi khuẩn dị dưỡng), xảy ra trong 1-2 tuần đầu khi bể đang chu trình nitơ. Nguyên nhân thường gặp là dư thức ăn, chất hữu cơ thừa, cá chết hoặc phân cá tích tụ, hoặc vật liệu lọc và nền mới còn bụi. Đây là dấu hiệu vi sinh đang hình thành, không phải vi sinh chết.
> 
> Tuy nhiên, nếu bể đã ổn định rồi bỗng đục sau khi rửa lọc bằng nước máy, dùng thuốc, hoặc thay nước quá nhiều, thì có thể vi sinh có ích đã bị giết và bạn cần gây lại.
> 
> **Cách xử lý khi bloom:**
> - Đừng hoảng và đừng thay …

### cycling-07 · post · plain wins (4 · 5.5)

**Asked:** Hồ em mới set hôm nay, có phân nền và chỉ một số cây cắt cắm dễ trồng. Em đặt trong phòng ngủ nên không thích sủi và lọc vì tiếng ồn. Người bán bảo chỉ cần 2-3 ngày thay nước một lần là được, vậy có ổn không, có cách nào khác không?

**Judge:** I'd rather this hobbyist got Y. Both answers miss that fresh aqua soil releases ammonia, so changing water every 2–3 days in the first weeks is actually reasonable. Y still gives practical steps for this tank: a sponge filter with its pump far from the bed, floating plants, few fish and testing water for the first 2–4 weeks. X is generic guide text that assumes an established tank. / Both answers miss that fresh aquasoil releases ammonia, so frequent water changes in the first weeks are right, and X adds a false claim about water changes removing bacteria. X is still more useful: it notices the tank is new, says to test NH₃/NO₂ for 2–4 weeks, and offers a quiet option (a sponge filter with the air pump placed far away). Y only quotes advice meant for an established tank.

**Ours lacks:** tank-fit, diagnosis, plan, follow-up. **Plain lacks:** diagnosis, too-long, wrong.

**Ours** (read 4 pages):

> Theo cẩm nang, thay nước không bắt buộc với bể thủy sinh bền vững: mỗi lần thay khoảng 30% là ổn, còn nếu lười thì chỉ cần châm bù khi nước hụt, nên lịch 2–3 ngày một lần mà người bán nói không phải là yêu cầu của cẩm nang. Nước máy nên để qua đêm (8–12 tiếng, 24 tiếng càng tốt) rồi mới dùng, không cần thuốc khử clo. Về oxy, cẩm nang cho rằng nguồn chính là cây quang hợp khi đèn bật khoảng 6–8 tiếng mỗi ngày và mặt nước thoáng, nên bể không sủi vẫn có thể ổn; bạn chỉ cần để ý nếu cá lờ đờ hoặc ngoi lên mặt nước.
> 
> [Trích: Bể thủy sinh bền vững có cần thay nước không, thay thế nào › Có bắt buộc…

**Plain** (2058 characters):

> **Thay nước 2-3 ngày một lần thường là không cần thiết.** Hồ mới set, nhất là hồ thủy sinh có phân nền, cần vài tuần để ổn định. Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi đang hình thành, và bạn phải xử lý nước máy liên tục. Cách làm hợp lý hơn:
> 
> - **Nếu chưa có cá hoặc chỉ có rất ít cá:** thay 20-30% nước mỗi 1-2 tuần, hoặc khi nitrate (NO₃) cao. Khi có cá, lượng thức ăn và chất thải mới là nguồn gây bẩn chính.
> - **Chỉ châm thêm nước** khi bị bay hơi, dùng nước đã khử clo.
> - **Dùng bộ test nước** (NH₃/NH₄⁺, NO₂⁻, NO₃⁻) để quyết định khi nào thay nước, thay vì theo lịch cố đị…

### cycling-07 · tank · ours wins (5.5 · 3)

**Asked:** Bể mới set của tôi chỉ thay nước vài ngày một lần thay cho lọc thì có ổn không?

**Judge:** X at least backs heavy water changes for a new aqua-soil tank and gives a step-by-step routine, though it contradicts itself and assumes equipment this tank doesn't have. Y misunderstands the question, gives generic advice that's wrong for an aqua-soil tank, and ends by asking questions. / X hiểu sai câu hỏi và nói về vệ sinh lọc trong khi bể không có lọc, nên câu trả lời chung chung rồi hỏi ngược lại. Y bám vào việc bể mới set dùng phân nền và đưa lịch thay nước dày cụ thể, dù có bước tắt lọc không hợp với bể này và tự mâu thuẫn về lịch thay. Cả hai đều chưa nói thẳng bể không lọc có ổn không, nhất là khi đã có cá.

**Ours lacks:** tank-fit, diagnosis, follow-up, too-long. **Plain lacks:** tank-fit, wrong, asks-only, diagnosis.

**Ours** (read 4 pages):

> Trong giai đoạn đầu, thay vài ngày một lần là chưa đủ. Cẩm nang khuyên tuần đầu thay 50% nước mỗi ngày, tuần thứ 2 và 3 cách ngày thay 40%, và mỗi lần thay phải tắt lọc, hút cặn và nhớt trước. Khi cây đã lên đều và bể ổn định thì mới giãn lịch thay nước ra.
> 
> [Trích: Chăm hồ thủy sinh mới set 3 tuần đầu: đèn, thay nước, cắt tỉa › Lịch thay nước và cách thay cho sạch]
> Giai đoạn đầu nước chưa ổn định, vì nền nhả dinh dưỡng nhiều, lũa ra nhớt và ra màu. Vì thế hồ cần thay nước dày:
> [video at 616s: Cận cảnh lũa phủ rêu và cây thủy sinh cần soi kỹ trước khi thay nước.]
> - Tuần 1: thay 50% nước mỗi n…

**Plain** (1338 characters):

> Tùy bạn đang hiểu "thay cho lọc" là thay nước **thay cho** việc vệ sinh lọc, hay là thay nước **và** vệ sinh lọc. Mình trả lời theo hướng bạn đang hỏi có nên thay nước thường xuyên hơn để thay thế việc vệ sinh lọc không.
> 
> **Thay nước không thay thế được việc vệ sinh lọc.** Hai việc này có tác dụng khác nhau:
> - **Thay nước** giúp giảm amoniac, nitrit, nitrat và các chất bẩn hòa tan.
> - **Vệ sinh lọc** chỉ cần khi lọc bị tắc hoặc dòng chảy yếu đi rõ rệt. Vệ sinh quá kỹ hoặc quá thường xuyên có thể làm mất vi khuẩn có lợi.
> 
> **Với bể mới, bạn nên lưu ý:**
> - **Bể chưa chạy xong chu trình nitơ (chưa…

### cycling-08 · post · plain wins (3 · 8)

**Asked:** Hồ của em làm từ thùng xốp 40x40x20, 2 mặt kính, 3 mặt xi măng, để trên sân thượng trong mái hiên. Em dùng lọc thác Sobo 400l/h có đủ không? Hồ như vậy có cần CO2 không? Bao lâu thì thả cá được?

**Judge:** Y trả lời đủ cả ba câu hỏi bằng con số rõ ràng: lọc dư, chỉ cần giảm dòng; không cần CO2; cycling mất 3-6 tuần. Y còn cảnh báo xi măng mới làm pH tăng cao, rất hợp với hồ tự làm này. X không đưa ra được mốc thời gian, không nhắc đến xi măng, và chủ yếu dán các trích đoạn cẩm nang, trong đó có cả giá bộ CO2 không liên quan. / X answers all three questions with workable numbers (the filter is enough but can be turned down, no CO2 needed, cycle for 3–6 weeks with steps). It also warns about the alkaline new cement, heat on the rooftop and dechlorinating tap water, which suits this hobbyist's setup. Y is hedged and mostly guide excerpts, gives no cycling time, never mentions the cement risk, and the hobbyist has to read through long quotes that don't help.

**Ours lacks:** plan, figures, tank-fit, too-long. **Plain lacks:** –.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa có con số riêng cho hồ 40x40x20 (khoảng 32 lít) dùng lọc thác Sobo, nhưng mục lưu lượng ghi lọc treo hay lọc thùng nên chạy khoảng 6–8 lần thể tích bể mỗi giờ, nên 400 l/h có thể quá mạnh và làm nước xoáy; cẩm nang cũng nói lọc thác rẻ thì chất lượng chỉ tương đối nên chỉ nuôi lượng cá vừa phải. CO2 được cẩm nang gắn với bể có cây thủy sinh, còn hồ chỉ nuôi cá thì trang này không nói là cần, và nước trên 30°C thường xuyên là không nên chơi kiểu bể cây. Về thời gian trước khi thả cá, cẩm nang có hướng dẫn cycling nhưng em chưa đọc được mốc ngày cụ thể, nên bạn xem mục cycling trư…

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

### cycling-08 · tank · plain wins (3 · 5)

**Asked:** Bể mới làm của tôi bao lâu thì thả cá được, lọc như vậy có đủ không?

**Judge:** Neither answer used the tank's details. The tank is about 32 L, so a 400 L/h Sobo turns the water over about 12 times an hour, which is plenty. The new cement walls need to be soaked and flushed before fish go in, and neither answer mentions this. Y still gives a clear 3–6 week timeline, says how to test, and gives the 4–6× turnover rule, which lets the hobbyist work out that the filter is enough. X just dumps a long excerpt built around pure ammonia, which is hard to find in Vietnam, and doesn't answer whether the filter is enough. / Cả hai câu trả lời đều không đọc được thông số bể: khoảng 32 lít, thành xi măng mới (đổ mới thường tiết vôi, đẩy pH lên cao nên cần ngâm xả kỹ trước), đặt trên sân thượng nắng nóng, và lọc thác Sobo 400 l/h (tức hơn 12 lần thể tích bể mỗi giờ, quá đủ). X dù vậy vẫn cho mốc thời gian rõ, cách test để biết bể đã sẵn sàng, mẹo rút ngắn chu trình và quy tắc 4–6 lần thể tích mỗi giờ, nên người chơi tự kết luận được là lọc đủ. Y trích nguyên một đoạn dài lấy từ tài liệu nước ngoài (châm amoniac nguyên chất, sưởi lên 27°C) và từ chối nhận xét về lọc.

**Ours lacks:** tank-fit, too-long, plan, local. **Plain lacks:** tank-fit, diagnosis, asks-only.

**Ours** (read 5 pages, stopped at the calls limit):

> Theo cẩm nang, chu trình nitơ của bể mới thường mất từ vài tuần đến vài tháng, và không nên thả cá sống cho đến khi bể đã chạy xong chu trình. Cẩm nang chưa cho tôi đủ căn cứ để nói lọc hiện tại của bạn có đủ hay không, nên bạn hãy đối chiếu với thể tích bể và mục lọc trong cẩm nang, và kiểm tra amoniac, nitrit hằng ngày theo hướng dẫn.
> 
> [Trích: Chu trình hóa bể cá (Cycling an Aquarium) › 3. Cách chạy chu trình]
> Bài viết này tập trung vào chu trình không dùng cá vì dùng cá gây hại cho sức khỏe của chúng. Nếu chẳng may bạn đã mua cá cho bể hoàn toàn mới, hãy hỏi trên diễn đàn và chúng tôi sẽ g…

**Plain** (1336 characters):

> Thường thì bể mới cần **khoảng 3–6 tuần** để chu trình nitơ (nitrogen cycle) ổn định trước khi thả cá. Trong thời gian này, vi khuẩn có lợi phải phát triển đủ để xử lý amoniac (NH₃) và nitrit (NO₂⁻) do cá thải ra. Nếu thả cá sớm, amoniac và nitrit sẽ tích tụ và dễ làm cá chết.
> 
> **Cách biết bể đã sẵn sàng:**
> - Dùng bộ test nước (nên dùng loại giọt, chính xác hơn que thử) kiểm tra amoniac và nitrit.
> - Khi **amoniac = 0** và **nitrit = 0** trong ít nhất 2–3 ngày liên tiếp, và đã có nitrat (NO₃⁻) xuất hiện, bể đã chạy xong chu trình.
> - Ngược lại, nếu amoniac hoặc nitrit vẫn đo được thì chưa nên t…

### sick-01 · post · ours wins (6 · 5)

**Asked:** Đàn ngựa vằn xanh nhà em nuôi gần 3 năm, rơi rụng dần. Giống này không đẻ nổi, giờ cứ 1 vài tuần lại có con cong người, 1-2 tuần sau là chết. Có phải do già quá không, hay bị bệnh gì?

**Judge:** X nhận đúng hai nguyên nhân hợp với đàn cá ngựa vằn gần 3 năm là tuổi già và bệnh Pseudoloma (bệnh gầy), nhưng phần làm gì tiếp thì sơ sài và đoạn trích dài toàn chuyện phân loại, Glofish không liên quan. Y có bước xử lý và lưu ý đeo găng vì lao cá lây sang người, nhưng lại phủ nhận sai vai trò của tuổi già, liệt kê bệnh dàn trải và hỏi lại khá nhiều. / Y biết đúng đây là zebra danio và nêu hai nguyên nhân khớp nhất: tuổi già và bệnh gầy do Pseudoloma. Đoạn trích của Y còn ghi rõ cá cong cột sống sau năm thứ 2 là dấu hiệu tuổi già, nhưng đoạn trích quá dài và phần lớn không liên quan, các bước xử lý cũng sơ sài. X sai khi bác bỏ nguyên nhân tuổi già, liệt kê nhiều nguyên nhân chung chung và hỏi lại nhiều, dù có vài bước làm ngay như cách ly và đo nước.

**Ours lacks:** plan, follow-up, too-long. **Plain lacks:** tank-fit, wrong, asks-only, diagnosis.

**Ours** (read 2 pages):

> Cẩm nang ghi tuổi thọ cá ngựa vằn khoảng 3–5 năm, nên gần 3 năm là đã sát tuổi cuối đời, nhưng không chỉ có tuổi. Các triệu chứng cong người, gầy mòn kéo dài và chết sau 1–2 tuần khớp với bệnh vi bào tử trùng (ký sinh trùng Pseudoloma neurofilia), gọi dân gian là 'bệnh gầy', có thể đã lan trong đàn; cẩm nang cũng nói bệnh này khó chẩn đoán và có cả con trông khỏe vẫn nhiễm. Nên cách ly con yếu, theo dõi kỹ đàn và cân nhắc mua cá mới từ nguồn tốt, vì cẩm nang lưu ý loài này bị nhân giống hàng loạt, cận huyết nhiều nên khó tìm cá chất lượng.
> 
> [Trích: Cá ngựa vằn › Ghi chú]
> D. rerio là một trong…

**Plain** (2113 characters):

> Nếu "ngựa vằn xanh" là cá (zebra danio hoặc cichlid vằn xanh), thì tuổi già thường không gây ra triệu chứng này. Cá già thường yếu dần, ăn ít, đẻ kém, chứ không cong người rồi chết trong 1-2 tuần. Biểu hiện cong người kèm chết nhanh thường là bệnh, và có vài nguyên nhân chính:
> 
> 1. **Lao cá (Mycobacteriosis)**: Đây là nghi ngờ hàng đầu với triệu chứng bạn mô tả: gầy dần, rụng dần, cong cột sống, bụng hõm, có thể có vết loét hoặc u hạt. Bệnh âm ỉ, lây lan chậm, khó chữa. Lao cá có thể lây sang người qua vết xước, nên khi xử lý cá bệnh hoặc xác chết phải đeo găng tay và rửa tay kỹ.
> 2. **Nhiễm kh…

### sick-01 · tank · plain wins (3 · 7)

**Asked:** Cá ngựa vằn của tôi cứ vài tuần lại có con cong người rồi chết, là bệnh gì?

**Judge:** Y names the most likely causes for fish that bend and die slowly over weeks: fish TB (mycobacteriosis) and Pseudoloma. It also warns that TB can pass to people and gives clear first steps. X won't guess a cause and points to imported medicines that wouldn't fix the problem. Neither one uses the fact that the fish are nearly 3 years old. / X correctly puts mycobacteriosis and Pseudoloma first, the usual causes of chronic spinal curving in zebra danios. It also warns that the disease can spread to people and gives sensible first steps, though it misses that these fish are about 3 years old and may be dying of old age. Y won't name any cause, pastes a long guide excerpt, and pushes imported broad-spectrum medicines that won't fix this problem.

**Ours lacks:** diagnosis, tank-fit, local. **Plain lacks:** tank-fit, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Cẩm nang chưa cho biết cá ngựa vằn bị cong người rồi chết là bệnh gì, nên tôi không dám đoán tên bệnh. Cẩm nang gợi ý trước hết hãy đo nhiệt độ, amoniac và các thông số nước, vì khi cá có dấu hiệu bệnh hoặc chết dần, thông số nước thay đổi bất thường hoặc quá nhanh có thể làm cá bệnh. Bạn nên tách cá nghi bệnh ra bể cách ly và xử lý sớm.
> 
> [Trích: Cách kiểm tra nước bể cá (và tần suất kiểm tra) để cá và cây khỏe mạnh › Cá bệnh]
> Khi cá, tép có dấu hiệu bệnh hoặc trong bể có vài con chết, bạn cần đo mọi thông số có thể để tìm ra nguyên nhân. Hãy bắt đầu với nhiệt độ nước, que thử amoniac và que …

**Plain** (1884 characters):

> Cá ngựa vằn bị cong người rồi chết thường gặp trong vài bệnh sau. Tôi không thể chẩn đoán chắc chắn chỉ từ mô tả, nhưng các khả năng phổ biến nhất là:
> 
> 1. **Bệnh lao cá (mycobacteriosis)** do *Mycobacterium* spp. Đây là bệnh mạn tính, hay gặp ở cá ngựa vằn và hay gây cong cột sống, gầy rộc, bụng phình, có thể có u hạt. Cá bệnh thường chết dần trong nhiều tuần, lây qua cá khác và có thể lây cho người.
> 
> 2. **Microsporidia *Pseudoloma neurophilia*** là ký sinh trùng gây tổn thương thần kinh và cột sống. Cá thường bơi bất thường, co giật, cong vẹo rồi gầy yếu và chết dần.
> 
> 3. **Nhiễm virus Nodavi…

### sick-02 · post · plain wins (3 · 8)

**Asked:** Nguyên nhân cá chết là gì ạ? Em có bể cá vàng, 7 màu và mấy loại linh tinh rẻ rẻ cho con chơi, nuôi trong nhà, mật độ thưa. Lọc với sục oxy chạy 24/24, nước trong sạch; em cho ăn rất ít, thức ăn viên mua sẵn; ít thay nước, chỉ thay khi thấy vẩn đục, có xử lý clo trước khi cho nước vào. Cái mút xốp lọc em giặt nước lã suốt vì phân cá hút lên nhanh bẩn. Vậy mà tuần nào cũng có con chết, tháng nào cũng đi mua thêm mà cứ chết dần.

**Judge:** Y chỉ đúng nguyên nhân chính: giặt mút lọc bằng nước lã làm chết vi sinh, cộng với thay nước quá ít. Y cũng đưa ra các bước sửa cụ thể, có số liệu (thay 20–30% nước mỗi tuần, mua bộ test nước, ngừng mua thêm cá). X chỉ dán nguyên một danh sách dài chung chung, phần lớn không liên quan, rồi từ chối chẩn đoán. / X đã nêu đúng nguyên nhân rất có thể: người hỏi giặt mút lọc bằng nước lã nên lớp vi sinh bị phá, lại thay nước quá ít. X cũng đưa ra các bước khắc phục cụ thể theo thứ tự. Y chép nguyên một bài cẩm nang dài, phần lớn không liên quan đến bể này, còn hiểu sai là người hỏi chỉ châm thêm nước mà không rút nước cũ ra.

**Ours lacks:** diagnosis, too-long, tank-fit, plan. **Plain lacks:** follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang xếp nước xấu là nguyên nhân hay gặp nhất: thiếu oxy, amoniac và nitrit tích lại, và clo gây hại cá từ 0,02 mg/L. Hai điểm đáng nghi trong cách bạn nuôi là chỉ châm thêm nước mà không rút nước cũ ra, và giặt mút lọc bằng nước lã. Cẩm nang khuyên đo oxy, amoniac, nitrit, pH và clo để biết thủ phạm cụ thể, vì tôi không thể chẩn đoán chính xác từ mô tả này.
> 
> [Trích: Cá chết hàng loạt trong bể: làm gì ngay và tìm nguyên nhân thế nào › Nguyên nhân]
> Oxy đứng đầu danh sách. Ngay sau oxy là amoniac. Dưới đây là các thủ phạm cùng ngưỡng gây hại:
> - Thiếu oxy hòa tan. Oxy trên 5 mg/L là tốt nhất…

**Plain** (2226 characters):

> Nguyên nhân khả năng cao nhất là **độc tố amoniac/nitrit do hệ vi sinh lọc bị phá hỏng**. Cá chết dần, tháng nào cũng phải mua thêm là dấu hiệu điển hình của việc này.
> 
> **Vì sao xảy ra:**
> 
> 1. **Giặt mút lọc bằng nước máy/nước lã là nguyên nhân chính.** Trên mút lọc có một lớp vi khuẩn có lợi (vi khuẩn nitrat hóa) chuyên phân hủy amoniac từ phân và thức ăn thừa thành nitrit, rồi thành nitrat ít độc hơn. Clo trong nước máy và việc giặt sạch làm chết lớp vi khuẩn này. Bể mất khả năng "dọn" chất thải, amoniac tích tụ dần, cá chết từ từ. Bể trông vẫn trong nhưng độc tố vô hình.
> 
> 2. **Thay nước quá…

### sick-02 · tank · plain wins (3 · 7)

**Asked:** Bể tôi tuần nào cũng có cá chết dù nước trong và cho ăn ít, nguyên nhân là gì?

**Judge:** Y doesn't use the tank notes, but it still names this tank's likely causes. Rinsing filter media in tap water kills the bacteria, changing water only when it turns cloudy lets waste build up, and cold-water goldfish are being kept with warm-water fish. It also gives fixes in order: change 25–30% of the water weekly, rinse the sponge in old tank water, and quarantine new fish. X pastes a long, generic guide on mass fish deaths, with lab-submission steps and foreign fish species, and never reaches the real problem. / X never read the tank notes, but it still names the two most likely causes for this tank: rinsing the filter sponge in tap water, which kills the beneficial bacteria, and changing water only when it turns cloudy. It then gives clear fixes: rinse the sponge in old tank water and change 25–30% every week. Y pastes a generic mass-die-off guide full of thresholds and lab-submission steps, and it misses the filter-washing habit that is probably killing the fish.

**Ours lacks:** tank-fit, plan, too-long, local. **Plain lacks:** tank-fit, follow-up, too-long.

**Ours** (read 3 pages):

> Nước trong không có nghĩa là nước an toàn: cẩm nang liệt kê nhiều thủ phạm vô hình như thiếu oxy hòa tan, amoniac, nitrit, clo, pH tụt đột ngột hoặc lọc vi sinh ngưng chạy. Hãy đo oxy, amoniac, nitrit, nitrat, pH, nhiệt độ và clo trước, rồi xử lý theo kết quả; nếu cá chết đều mỗi tuần, nên đối chiếu thêm với lịch thay nước và tình trạng bộ lọc.
> 
> [Trích: Cá chết hàng loạt trong bể: làm gì ngay và tìm nguyên nhân thế nào › Nguyên nhân]
> Oxy đứng đầu danh sách. Ngay sau oxy là amoniac. Dưới đây là các thủ phạm cùng ngưỡng gây hại:
> - Thiếu oxy hòa tan. Oxy trên 5 mg/L là tốt nhất. Dưới 5 mg/L cá b…

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

### sick-03 · post · plain wins (2.5 · 7)

**Asked:** Hồ em trồng minifiss, ráy và ít cắt cắm (sunset, rong la hán), nuôi tép màu và ít cá (bảy màu, otto, pigmy). pH lúc có CO2 đo được 7, KH 4, GH 8, TDS 360; nước nguồn TDS cao (160-200). Rong èo uột không phát triển, ráy ra lá non nhưng không khỏe, có rêu xanh bám lá, fiss phát triển chậm. CO2 em để 2-3 giọt/giây nhưng test CO2 vẫn báo thiếu. Tép bị chết lai rai, cá tầm 1-2 tuần chết 1 con. Có cách nào hạ TDS không, hay do đâu?

**Judge:** I'd rather this hobbyist got Y. It gives a plan in order: check ammonia, nitrite and copper, check how much pH and CO2 swing, and top up with RO water while lowering TDS slowly so the shrimp aren't shocked. X is mostly pasted guide excerpts that ignore this tank and says outright it can't explain why the shrimp and fish are dying. / X is the better answer. It works from the hobbyist's own numbers, explains why TDS keeps climbing (topping up with tap water and fertiliser), gives a step-by-step plan to lower it with RO water, and lists the likely causes of the shrimp deaths in order. Its weak spots are calling 12 ppm CO2 enough and reading "tầm" as a fish. Y mostly pastes guide excerpts, many of them unrelated, and admits it has no explanation for the deaths.

**Ours lacks:** diagnosis, tank-fit, plan. **Plain lacks:** too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Trong cẩm nang, nước nguồn TDS cao thường do đá cứng: đá da voi và đá kẹp kem nhả khoáng mạnh, nên bể cây và tép ưa nước mềm nên hạn chế, dùng lũa và phân nền gốc than bùn thay thế. Cẩm nang cũng nhắc mốc TDS 120–160 sau mỗi lần thay nước, và bể qua 3 tháng thường pH tự về 6,5–7,0 mà không cần hóa chất hạ pH. Về CO2 thiếu, cẩm nang khuyên treo drop checker và chỉnh cho nó xanh lá, còn nguyên nhân tép và cá chết lai rai thì phần tôi đọc chưa có câu trả lời, nên bạn cần kiểm tra thêm.
> 
> [Trích: Đá thủy sinh ảnh hưởng pH, TDS ra sao và cách hạ pH cho bể › Bắt đầu từ đâu]
> - Sắm một bút đo TDS và m…

**Plain** (3801 characters):

> Mình nghĩ vấn đề không nằm ở một yếu tố mà là chuỗi liên quan: nước cứng và TDS cao, phần đo CO2 chưa chắc đúng, và có thể dinh dưỡng hoặc độc tố đang gây stress cho tép và cá.
> 
> ## 1. Đọc lại thông số
> 
> - **CO2:** Với KH 4 dKH (~71 ppm) và pH 7, lý thuyết CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển. Nếu test kit báo thiếu thì khả năng cao là kit đã hết hạn, đọc sai bảng màu, hoặc pH meter chưa hiệu chuẩn. Bạn nên:
>   - Hiệu chuẩn lại pH meter bằng dung dịch chuẩn 4.0 và 7.0.
>   - Dùng drop checker để theo dõi xu hướng (xanh vàng là đủ CO2 hay chưa).
>   - Đo pH sáng sớm trước khi bật đèn và …

### sick-03 · tank · plain wins (3 · 5.5)

**Asked:** Tép trong bể tôi chết lai rai và cá thỉnh thoảng chết một con, có phải do TDS cao không?

**Judge:** Y nói rõ con số TDS tự nó không độc. Y có danh sách việc cần đo và cách xử lý (thay 20–30% nước mỗi tuần, pha nước RO, đo cả nước nguồn), dù chưa dùng dữ liệu bể là TDS 360 so với nước nguồn 160–200. X chủ yếu dán đoạn trích về cá chết hàng loạt, dài mà lạc đề, gần như không có bước xử lý, lại có con số CO2 dễ gây hiểu lầm. / Neither answer used the tank data: TDS rose from 160–200 at the source to 360, the CO₂ test still reads low, and there's algae. X still gives a usable plan: test NH3/NO2, compare tank TDS with source water, and do gradual 20–30% water changes. Y dumps long guide excerpts about mass fish deaths and gives a misleading 12 mg/L CO₂ limit.

**Ours lacks:** plan, tank-fit, too-long. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang chưa nêu TDS cao là nguyên nhân làm tép hay cá chết. Cẩm nang chỉ ghi mức TDS khoảng 100–150 là dễ chịu cho bể trồng cây, còn các nguyên nhân cá chết được liệt kê là thiếu oxy, amoniac, nitrit, lọc vi sinh ngưng chạy, clo và các cú sốc đột ngột. Tép chết lẻ tẻ có thể do lột xác hỏng hoặc già, nên bạn nên đo oxy, amoniac và nitrit trước.
> 
> [Trích: Cá chết hàng loạt trong bể: làm gì ngay và tìm nguyên nhân thế nào › Nguyên nhân]
> Oxy đứng đầu danh sách. Ngay sau oxy là amoniac. Dưới đây là các thủ phạm cùng ngưỡng gây hại:
> - Thiếu oxy hòa tan. Oxy trên 5 mg/L là tốt nhất. Dưới 5 mg/L cá …

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

### sick-04 · post · plain wins (2 · 6)

**Asked:** Mình chơi bể 60x40x40, set được gần 3 tháng, layout núi đá dùng đá da voi màu trắng nên pH ở ngưỡng 7,8-8. Thảm nền trồng trân châu ngọc trai, mấy ngọn rau thơm cắm khe đá, có vảy ốc xanh và vảy ốc đỏ. Để hạ pH, mình bổ sung thêm vật liệu lọc Neo Soft, vừa cho vào chạy thì chỉ khoảng 10 giây sau tép chạy loạn hết rồi chết dần. Sau đó thảm trân châu và rau thơm bị rữa lá, pH luôn ở 8,4, sục CO2 cũng chỉ xuống 7,4 trong khi nước đầu vào 7,0 trở xuống. Vảy ốc thì có vết như gãy ngang ngọn lá nhưng lá vẫn xanh, không rụng. Mình nên xử lý sao?

**Judge:** X không chẩn đoán được gì, còn trích nhầm hướng dẫn xử lý pH tụt, có cả bước nâng KH, trái với tình huống pH cao của bạn. Y có kế hoạch rõ ràng: gỡ Neo Soft, thay nước, test KH/amoniac, dùng nước RO và giảm đá vôi. Tuy vậy Y hiểu nhầm vảy ốc là con ốc chứ không phải cây Rotala. / X gives a sensible emergency plan: remove Neo Soft, change the water, test NH₃ and KH, and explain how the limestone keeps pH high. Its main flaw is mistaking the Rotala (vảy ốc) for snails. Y has almost no usable content, and the guide it quotes about pH dropping could lead the hobbyist to raise KH even further.

**Ours lacks:** diagnosis, plan, off-topic, wrong. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 4 pages, stopped at the calls limit):

> Cẩm nang chưa có trang nào nói về Neo Soft, về việc tép chết ngay sau khi cho vật liệu vào, hay về lá trân châu và rau thơm bị rữa, nên mình không đủ căn cứ để chẩn đoán nguyên nhân. Trang gần nhất là cách xử lý pH đổi đột ngột: thay 20–30% nước đã khử clo, không thay quá 50% một lần, và pH chỉ nên đổi tối đa khoảng 0,3–0,5 đơn vị mỗi giờ. Trang này viết về pH tụt, không phải pH cao, nên bạn chỉ nên áp dụng nguyên tắc thay nước từ từ, còn lại cần hỏi người có kinh nghiệm hoặc tra thêm trong cẩm nang.
> 
> [Trích: pH, GH, KH trong bể cá là gì: cách đo, chỉnh và xử lý pH tụt › Làm gì ngay khi pH tụ…

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

### sick-04 · tank · plain wins (2 · 6)

**Asked:** Tôi vừa thêm vật liệu lọc hạ pH thì tép chạy loạn rồi chết dần, phải làm gì?

**Judge:** X không đưa ra cách xử lý nào, chỉ chép một đoạn thông số chung chung. Y cho các bước cấp cứu hợp lý theo thứ tự: bỏ vật liệu lọc ra, sục khí, thay 20–30% nước có pH và độ cứng gần với bể, rồi đo các chỉ số. Tuy vậy Y không nhắc đến Neo Soft và cũng không nói rằng đá da voi đang kéo pH lên 8,4, nên đây vẫn là lời khuyên chung chung. / X đưa ra các bước cấp cứu hợp lý theo đúng thứ tự: lấy vật liệu lọc ra, sục khí, thay nước ít một, đo lại thông số. Tuy vậy X bỏ qua việc pH 8,4 là do đá da voi, Neo Soft kéo pH tụt mạnh từ 8,4, và cũng không nhắc tắt hoặc giảm CO2. Y từ chối tư vấn, chỉ dẫn một đoạn trích chung chung về pH, người nuôi không biết phải làm gì để cứu tép.

**Ours lacks:** plan, diagnosis, too-thin. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 2 pages, stopped at the calls limit):

> Cẩm nang chưa có trang nào tôi đọc trả lời rõ việc tép chạy loạn và chết sau khi thêm vật liệu hạ pH, nên tôi không dám đưa ra cách xử lý từ trí nhớ. Phần gần nhất là mục thông số nước trong cẩm nang tổng quan về tép cảnh nước ngọt, bạn xem trước để kiểm tra lại nước trong bể.
> 
> [Trích: Tổng quan về tép cảnh nước ngọt: các loại phổ biến, chăm sóc, thức ăn và hơn thế nữa › Thông số nước]
> Nhìn chung, những con vật không xương sống dẻo dai này là bạn đồng hành ấn tượng và rất thú vị trong bể cảnh. Nuôi đúng điều kiện thì chúng phát triển rất tốt. Phần lớn các loài khá dễ tính về thông số nước. Té…

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

### sick-05 · post · plain wins (3.25 · 7.75)

**Asked:** Bể của tôi set được 2 tháng, có đèn, oxy, CO2, nhưng gần đây nước trong bể có màu vàng nâu, cá thì chết lai rai. Tôi thay nước cách ngày 50% (dùng nước lọc loại mua uống hằng ngày) mà vẫn không hết. Giúp tôi với.

**Judge:** Y is the better answer. It spots the most likely mistakes: bottled drinking water with no buffering, big water changes that swing the parameters, and CO2 to check at night. It then gives first steps in order. X pastes a generic mass-fish-death guide that ignores the bottled water and the CO2, and it includes a misleading CO2 threshold. / X đi đúng vào chi tiết quan trọng của người hỏi: thay nước bằng nước uống tinh khiết thì không có KH, cộng với châm CO2 dễ làm pH sụp. X cũng cho các bước làm theo thứ tự và cách kiểm tra drop checker. Y chép nguyên cẩm nang chung chung với nhiều mục lạc đề (mất điện, vôi tôi, cá nheo Mỹ, aflatoxin) và bỏ qua hẳn chuyện nước tinh khiết.

**Ours lacks:** tank-fit, plan, too-long. **Plain lacks:** figures, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Theo cẩm nang, màu vàng nâu thường do tanin từ lũa hoặc lá bàng, không hại cá, nên màu nước chưa phải là thủ phạm. Cá chết lai rai thì cần đo nước trước: cẩm nang ghi amoniac trên 0,05 mg/L (dạng NH3) đã hại mang, nitrit trên 0,1 mg/L bắt đầu độc, và oxy dưới 5 mg/L làm cá stress. Nếu amoniac cao, cẩm nang khuyên thay ít nhất 50% nước và ngừng hoặc giảm cho ăn; nếu lọc sinh học chưa chạy ổn thì thay nước chưa đủ, nên kiểm tra thêm lọc và oxy. Cẩm nang chưa chẩn đoán được đúng nguyên nhân cho bể của bạn, nên hãy đo amoniac, nitrit, oxy và pH rồi đối chiếu các mục bên dưới.
> 
> [Trích: Cá chết hàn…

**Plain** (3054 characters):

> Nước vàng nâu kéo dài kèm cá chết dần thường có nguyên nhân chính không phải là "nước bẩn" đơn thuần. Bạn nên kiểm tra theo thứ tự sau.
> 
> ## 1. Xác định màu nước do đâu
> 
> - **Tannin (chất màu từ gỗ, lá):** Nếu bạn có lũa, lá bàng, lá khô, hoặc than bùn, nước sẽ vàng nâu như trà. Loại này thường không gây hại trực tiếp, nhưng không thể gây cá chết hàng loạt.
> - **Chất hữu cơ phân hủy:** Thức ăn thừa, cá chết, lá úa, phân cá tích tụ, nền đất/sỏi bị thối. Đây là nguyên nhân hay gặp nhất khi bể mới 2 tháng.
> - **Tảo silic (diatom):** Lớp màu nâu bám trên kính, lá, sỏi, thường gặp ở bể mới có đèn mạnh…

### sick-05 · tank · plain wins (2.5 · 4.5)

**Asked:** Nước bể tôi ngả vàng nâu và cá chết lai rai dù thay nước thường xuyên, vì sao?

**Judge:** Neither answer uses the tank's details: bottled drinking water with almost no minerals, CO₂ injection and 50% changes every other day. X is worse because it gives a wrong cause (old tank syndrome in an 8-week tank) and tells them to change more water. Y is generic, but it lists the right checks (pH, KH/GH, sudden pH changes, ammonia and nitrite) and gives clear first steps. / Cả hai đều bỏ sót nguyên nhân dễ xảy ra nhất. Thay nước 50% cách ngày bằng nước uống đóng bình gần như không có KH/GH, nên khi chạy CO₂ pH sụt mạnh và dao động liên tục. X vẫn khá chung chung nhưng có hướng dẫn test pH/GH/KH, NH₃/NO₂ và các bước xử lý hợp lý. Y chẩn đoán sai là old tank syndrome và khuyên thay nước theo mức không hợp với bể của họ.

**Ours lacks:** tank-fit, wrong, too-long, diagnosis. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 4 pages):

> Theo cẩm nang, màu vàng nâu thường do lũa nhả tannin và làm pH giảm, còn cá chết dần dù có thay nước có thể do old tank syndrome: nitrate, khoáng và phosphate tích dần qua nhiều tháng khi lượng nước thay còn ít so với lượng thức ăn và cá. Bạn nên tăng lượng thay (cẩm nang gợi ý 30–40% mỗi tháng hoặc thay nhiều hơn), và nếu test thấy amoniac hoặc nitrit thì thay nước ngay bằng nước đã khử clo.
> 
> [Trích: Old tank syndrome: vì sao bể lâu năm thả cá mới là chết › Khắc phục bằng cách thay nước nhiều hơn]
> Cách dễ nhất là tăng lượng nước thay. Trước hết, hãy xem lượng nước bạn thay có theo kịp lượng …

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

### sick-06 · post · plain wins (4 · 7)

**Asked:** Bể cá rồng nhà em dùng hơn 20 năm bị rò nên phải thay bể mới. Từ hôm chuyển sang bể mới, 2 con cá rồng bỏ ăn luôn, được gần 1 tuần rồi. Cá mồi vẫn bơi trong bể mà rồng không chịu ăn. Em theo dõi thì 2 con vẫn bơi bình thường, chưa nằm đáy. Phải làm sao?

**Judge:** Y is better. It names the most likely cause: the new tank's filter isn't cycled yet, so ammonia and nitrite can build up. It then gives steps in order: test the water, do water changes, move filter media from the old tank, reduce stress and try other foods. X is thin and padded with off-topic guide excerpts about tankmates and drip systems, and it just says to wait, even though the fish have already gone almost a week without eating. / X names the most likely cause, a new tank that hasn't cycled yet. It gives steps in order: test the water, do daily water changes, reduce stress, then try to get the fish eating. It also says when to worry. Y's text is short and doesn't explain the cause. Its excerpts are mostly off-topic (tank mates, drip system), and its advice to separate the fish doesn't fit.

**Ours lacks:** diagnosis, plan, off-topic. **Plain lacks:** too-long, local.

**Ours** (read 6 pages, stopped at the tools limit):

> Theo cẩm nang, cá rồng chuyển bể thường khoảng một tuần thì ăn lại. Bạn có thể nâng nhiệt độ lên một chút và cho ăn giun sống để kích thích nó ăn, đồng thời kiểm tra nhiệt độ, pH và amoniac của bể mới. Nếu quá một tuần rồng vẫn bỏ ăn hoặc bắt đầu gầy đi thì đừng tăng lượng thức ăn; hãy tách cá sớm, và nếu có ngáp mặt nước, chướng bụng hay xù vảy thì cần đưa đi bác sĩ thú y thủy sản ngay.
> 
> [Trích: Chọn cá bạn cho cá rồng: tiêu chí, cách thả và khi nào phải tách › Bắt đầu từ đâu]
> 1. Đối chiếu loài cá bạn định mua với từng tiêu chí ở trên, nhất là kích thước khi mua và cách nó tranh ăn so với rồ…

**Plain** (3108 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là chuyện khá thường gặp. Nếu cá vẫn bơi bình thường, không nằm đáy, không đổi màu thì chưa phải cấp cứu, nhưng bỏ ăn gần 1 tuần thì bạn cần xử lý ngay. Bạn nên làm theo các bước sau.
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻):** Bể mới chưa chạy nitơ (chưa "cycle") thì hai chỉ số này dễ tăng cao và gây stress, mất cảm giác thèm ăn. Mục tiêu là 0 ppm cho cả hai.
> - **Nitrat:** Giữ dưới 40 ppm, lý tưởng dưới 20 ppm.
> - **pH và độ cứng:** Khác biệt lớn so với bể cũ cũng gây sốc. Nếu nước bể cũ và bể mới khác nhau nhiề…

### sick-06 · tank · plain wins (4 · 6.5)

**Asked:** Cá rồng của tôi bỏ ăn gần một tuần từ khi chuyển sang bể mới, làm sao?

**Judge:** Y nêu đúng nguyên nhân dễ gặp nhất: bể mới mới chạy một tuần nên chưa xong chu trình nitơ, và pH lệch so với bể cũ. Y còn cho các bước xử lý theo thứ tự, mốc thời gian đáng lo và mức thay nước an toàn. X thì sơ sài, không nhắc đến chu trình nitơ, còn đi kèm phần trích về ghép cá không liên quan. / X nêu đúng nguyên nhân dễ gặp nhất là bể mới chưa chạy xong chu trình nitơ, kèm các bước làm theo thứ tự và mốc khi nào cần lo, dù hỏi lại những điều đã biết và chưa bám vào việc cá chuyển từ bể cũ hơn 20 năm. Y không nói đến việc bể mới chưa có vi sinh, lại để phần lớn nội dung trích về ghép cá bạn, gần như không liên quan.

**Ours lacks:** diagnosis, tank-fit, plan, off-topic. **Plain lacks:** tank-fit, too-long.

**Ours** (read 6 pages, stopped at the tools limit):

> Cẩm nang cho biết cá rồng thường bắt đầu ăn lại sau khoảng một tuần chuyển bể. Bạn có thể nâng nhiệt độ nước lên một chút và cho ăn giun sống để kích thích nó ăn, đồng thời test amoniac, nitrit, nitrat và thay 30–50% nước nếu chỉ số vượt ngưỡng. Nếu quá một tuần rồng vẫn bỏ ăn và gầy đi, đừng tăng lượng thức ăn; hãy xem lại việc ghép cá và tách rồng ra sớm.
> 
> [Trích: Chọn cá bạn cho cá rồng: tiêu chí, cách thả và khi nào phải tách › Bắt đầu từ đâu]
> 1. Đối chiếu loài cá bạn định mua với từng tiêu chí ở trên, nhất là kích thước khi mua và cách nó tranh ăn so với rồng của bạn.
> 2. Chuẩn bị chỗ các…

**Plain** (2612 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là phản ứng khá phổ biến vì chúng rất nhạy với stress. Tuy vậy, một tuần là đủ lâu để bạn cần kiểm tra kỹ. Bạn có thể làm theo các bước sau:
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - Dùng bộ test để đo **amonia (NH₃/NH₄⁺), nitrit (NO₂⁻), nitrat (NO₃⁻), pH, nhiệt độ**.
> - Amonia hoặc nitrit lớn hơn 0 là dấu hiệu nguy hiểm. Bể mới chưa chạy xong chu trình nitơ (cycling) rất dễ xảy ra tình trạng này.
> - Nếu có amonia/nitrit: thay 25–30% nước mỗi ngày, dùng nước đã khử clo và có nhiệt độ, pH gần với bể cũ. Không thay quá nhiều một lúc vì sẽ gây sốc thêm.
> -…

### sick-07 · post · plain wins (5 · 7.5)

**Asked:** Em vừa lật bể, vứt nền sỏi nhỏ đi vì thấy bẩn quá, thì tự nhiên thấy 1 con bị như nấm trắng. Em đang tách riêng, cho ít muối hột vào xem có khỏi không. Như vậy đã đúng chưa, cần làm gì thêm?

**Judge:** Y chỉ ra nguyên nhân khả dĩ là bể chính mất vi sinh sau khi lật bể và bỏ sỏi. Y cũng giúp phân biệt đốm trắng với nấm, cho liều muối hợp lý (1–2 g/lít), hướng dẫn dựng bể cách ly và nêu các dấu hiệu cần theo dõi. X chỉ chép lại cẩm nang về các mức muối, khá dài, mà bỏ qua chuyện lật bể của người hỏi. / X thấy được nguyên nhân chính: lật bể, bỏ sỏi làm mất vi khuẩn có lợi, amoniac và nitrit tăng lên, cá bị stress. X dặn test nước bể chính, cho liều muối 1–2 g/l kèm cách nhận biết đốm trắng hay nấm. Y chỉ chép nguyên phần cẩm nang về muối, dài, và bỏ qua hẳn chuyện bạn ấy vừa lật bể bỏ sỏi.

**Ours lacks:** diagnosis, tank-fit, too-long. **Plain lacks:** figures.

**Ours** (read 4 pages):

> Tách riêng cá ra bể cách ly là đúng hướng. Cẩm nang cho biết muối hột trị nấm thân khá hiệu quả, bắt đầu ở mức 1 (1 muỗng canh cho khoảng 11 lít nước) và ngâm 5–7 ngày; nếu cá hết triệu chứng thì rút muối dần bằng cách thay 30% nước mỗi tuần, còn nấm thì tăng lên mức kế tiếp. Trước khi châm muối, hãy hút đáy, vệ sinh lọc và ghi lại liều đã dùng, và đừng dừng sớm khi cá vừa khỏi vì mầm bệnh có thể còn.
> 
> [Trích: Cá bị nấm trắng: nguyên nhân, cách chữa bằng thuốc và muối › Không có thuốc thì dùng muối thế nào]
> Muối hột dành cho bể cá trị nấm thân và nấm miệng rất hiệu quả. Nó không được xếp lên …

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

### sick-07 · tank · plain wins (5.5 · 7.5)

**Asked:** Sau khi lật bể, một con cá của tôi bị nấm trắng, tách riêng và cho muối đã đủ chưa?

**Judge:** Y links the fungus to poor water after the tank flip and the substrate change. It tells the hobbyist to test ammonia and nitrite, change water, and add methylene blue alongside salt. X gives a usable plan for raising the salt dose step by step and rightly warns that white patches around the mouth are bacterial. But it never deals with the cause in the main tank, and the guide excerpt below it repeats most of the same points. / X đưa ra phương án đầy đủ: liều muối hợp lý, thêm xanh methylene, nâng nhiệt độ và kiểm tra NH3/NO2. X cũng gắn bệnh nấm với chu trình nitơ bị xáo trộn sau khi lật bể, dù không nhắc cụ thể việc bỏ nền sỏi. Y chỉ đưa thang liều muối theo cẩm nang. Y bỏ qua nguyên nhân là lật bể và bỏ nền làm mất vi sinh, cũng không nói cách xử lý nước. Ở mức 3, Y dùng muối khá đặm mà không có cảnh báo nào.

**Ours lacks:** diagnosis, tank-fit, follow-up. **Plain lacks:** tank-fit.

**Ours** (read 4 pages):

> Cách ly và châm muối là đúng hướng, nhưng bạn chưa thể biết đã đủ hay chưa. Cẩm nang khuyên bắt đầu ở mức 1 (1 muỗng canh muối cho khoảng 11 lít nước) trong 5–7 ngày; nếu cá hết triệu chứng thì thay 30% nước mỗi tuần để rút muối, còn nấm vẫn còn thì tăng lên mức 2, rồi mức 3. Nếu mảng trắng nằm quanh miệng, cẩm nang cho rằng thường là nhiễm khuẩn và nên dùng kháng sinh, không chỉ muối.
> 
> [Trích: Cá bị nấm trắng: nguyên nhân, cách chữa bằng thuốc và muối › Không có thuốc thì dùng muối thế nào]
> Muối hột dành cho bể cá trị nấm thân và nấm miệng rất hiệu quả. Nó không được xếp lên đầu vì mấy điểm …

**Plain** (1892 characters):

> Muối **chưa đủ** nếu bạn chỉ dùng muối. Cá bị nấm sau khi lật bể thường là hệ quả của nước xấu (amoniac, nitrit tăng cao), nên cần xử lý cả nguyên nhân lẫn con cá.
> 
> **Việc nên làm ngay:**
> 
> 1. **Cách ly cá đúng cách:** Dùng bể riêng có sục khí, lọc nhẹ hoặc không lọc (tránh hút cá vào máy), không trồng cây, không đặt nền sỏi.
> 2. **Kiểm tra nước bể cũ và bể cách ly:** Dùng bộ test để đo NH3/NH4+, NO2-, NO3-, pH. Nếu amoniac hoặc nitrit > 0, thay nước ngay (khoảng 30-50%) và thay từng phần hằng ngày cho đến khi ổn định. Nước bể cách ly phải sạch, cùng nhiệt độ và pH với bể cũ.
> 3. **Thuốc trị nấm…

### sick-08 · post · plain wins (3.5 · 7.5)

**Asked:** Hồ mình đang có rêu tảo hại nên mình thử nuôi otto. Thả vào thì cá rất khỏe, bơi kiếm ăn (không quá manh động), nhưng sau một đêm 3 con chết hết, sáng ra thấy nằm im, đụng vào không nhúc nhích. Cùng lúc đó có một đàn neon trong bể vẫn bình thường mà otto thì chết. Vì sao vậy?

**Judge:** Mình chọn Y. Y giải thích được vì sao otto chết mà neon vẫn sống. Y nhắc đúng nguyên nhân hay gặp ở bể đang trị rêu là thuốc diệt rêu như Excel hoặc glutaraldehyde, rồi đưa các bước kiểm tra và xử lý theo thứ tự. X chỉ chép lại cẩm nang chung chung, không bám vào trường hợp cụ thể của bạn ấy, lại ghi nhiệt độ không hợp với khí hậu Việt Nam. / X is better. It gives the likely causes for sudden overnight deaths (algae-killer chemicals, acclimation shock, fish already weak from the shop, oxygen) and tells the hobbyist what to test and what to do right away. Y mostly repeats a general care guide, admits it doesn't cover this case, and gives a temperature range that doesn't fit Vietnam.

**Ours lacks:** diagnosis, tank-fit, plan. **Plain lacks:** figures, local, too-long.

**Ours** (read 2 pages):

> Cẩm nang nêu hai nguyên nhân hay gặp khi otto chết sau khi thả: bể mới chưa ổn định hoặc thông số nước thay đổi đột ngột, và cá otto bắt tự nhiên chịu stress kém nên dễ chết dù ban đầu vẫn bơi kiếm ăn. Cẩm nang không mô tả riêng trường hợp otto chết qua đêm trong khi neon vẫn bình thường, nên hãy kiểm tra bể đã chạy ổn định chưa và hỏi tiệm xem otto là cá bắt tự nhiên hay cá nuôi sinh sản.
> 
> [Trích: Nuôi cá otto (Otocinclus): thả cá, cho ăn và giữ nước ổn định › Bắt đầu từ đâu]
> - Kiểm tra bể đã chạy ổn định chưa. Bể mới set thì chờ thêm, chưa nên mua otto.
> - Hỏi rõ cá là cá bắt tự nhiên hay cá…

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

### sick-08 · tank · plain wins (4 · 6.5)

**Asked:** Tôi thả cá otto ăn rêu mà sau một đêm chết hết trong khi neon vẫn khỏe, vì sao?

**Judge:** Y is the better answer. It names the causes that can actually kill fish in one night: rushed acclimation, ammonia/nitrite, chlorine, low oxygen, and copper from algae-killing products. That last one matters because this tank has an algae problem. Y also lists what to test right away. X's main cause, starvation, can't happen overnight, and X mostly repeats a care-guide excerpt instead of giving the hobbyist steps to take. / X is the better answer. It lists the causes that actually kill otto overnight: ammonia or nitrite, lack of oxygen at night, shock when moving them into the tank, chlorine, and copper in algae killers (likely here, since the tank has algae). It also tells them to test the water right away. Y relies on a guide excerpt that blames starvation, which can't explain deaths after one night, and its temperature advice doesn't suit Vietnam.

**Ours lacks:** diagnosis, plan, tank-fit. **Plain lacks:** tank-fit, too-long.

**Ours** (read 1 pages):

> Cẩm nang nêu hai nguyên nhân hay gặp: cá bắt tự nhiên không chịu ăn thức ăn viên nên chết đói khi bể không đủ rêu, và thả vào bể chưa ổn định hoặc thông số nước thay đổi đột ngột làm cá bị sốc. Otto nhạy hơn neon, nên neon sống mà otto chết không lạ; hãy kiểm tra bể đã chạy ổn định chưa và cá là bắt tự nhiên hay nuôi sinh sản.
> 
> [Trích: Nuôi cá otto (Otocinclus): thả cá, cho ăn và giữ nước ổn định › Bắt đầu từ đâu]
> - Kiểm tra bể đã chạy ổn định chưa. Bể mới set thì chờ thêm, chưa nên mua otto.
> - Hỏi rõ cá là cá bắt tự nhiên hay cá nuôi sinh sản, ưu tiên cá nuôi sinh sản vì dễ tập ăn hơn.
> - Mua…

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

### sick-09 · post · not judged

**Asked:** Nhà mình có bể cá ngoài trời 3x1,5m, sâu có 30 phân, đáy lát đá hoa, có hệ thống lọc nước và hút đáy, thêm 1 bơm nước tạo oxy. Trước mua koi về được mấy hôm là lăn ra chết, thế là thả cá chép cho khỏe, mà nay 6-7 con lại chết. Trời đang lạnh ngắt, mình không có dụng cụ đo oxy, không biết do trời lạnh hay sao. Bể này bố mình làm, trước có thả hoa súng nhưng cá rỉa hết. Bắt bệnh giúp mình, nên sửa lọc thế nào, có cần đào sâu thêm không, đáy lát đá hoa có ổn không?

**Ours** (read 5 pages, stopped at the error limit):

failed: Request timed out.

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

### sick-09 · tank · plain wins (2.5 · 5)

**Asked:** Cá trong bể tôi thả vào mấy hôm là chết, trời lạnh lại chết thêm, do đâu?

**Judge:** Y names the likely causes: an uncycled pond, filter bacteria slowing in the cold, shock at release, chlorine and disease. It also gives a usable plan: test the water, change 20–30% of it and stop feeding. X is mostly pasted guide excerpts aimed at indoor tropical tanks, offers no clear diagnosis, and its heater advice is unrealistic for this pond. / X giải thích đúng nguyên nhân hay gặp nhất là nước chưa chạy chu trình nitơ, giải thích được vì sao trời lạnh cá chết thêm, và đưa ra các bước cụ thể (đo nước, thay 20–30% nước, ngừng cho ăn, thả ít cá). Tuy vậy, X vẫn khuyên dùng sưởi theo mức cho cá nhiệt đới, không hợp với hồ koi. Y chủ yếu dán nguyên các đoạn trích từ cẩm nang cho bể trong nhà, khuyên sưởi 1 W mỗi lít, một mức vô lý với hồ ngoài trời rộng như vậy, lại đưa old tank syndrome lên làm nguyên nhân chính và không có kế hoạch xử lý rõ ràng.

**Ours lacks:** diagnosis, tank-fit, plan, wrong. **Plain lacks:** tank-fit, follow-up, diagnosis.

**Ours** (read 4 pages, stopped at the calls limit):

> Cẩm nang chưa đủ để kết luận nguyên nhân trong bể của bạn, vì cần biết bể mới hay đã lâu và nước đã chạy chu trình nitơ chưa. Cẩm nang nêu hai hướng: bể mới chưa chạy chu trình nitơ thường mất vài tuần đến vài tháng mới ổn định, còn bể lâu năm tích nitrat và khoáng khiến cá mới chết trong khi cá cũ vẫn khỏe. Mùa lạnh làm nhiệt độ tụt, cá yếu hơn, nên cẩm nang khuyên sưởi khoảng 1 W cho mỗi lít nước, ốp xốp quanh thành bể và đậy nắp.
> 
> [Trích: Bể cá mùa nóng, mùa lạnh, mùa mưa: giữ nhiệt độ, oxy và xử lý khi mất điện › Mùa lạnh: giữ ấm cho bể]
> 1. Chọn sưởi công suất khoảng 1 W cho mỗi lít nước.…

**Plain** (2551 characters):

> Cá chết sau vài ngày thả vào và chết thêm khi trời lạnh thường có liên quan đến **chất lượng nước** và **nhiệt độ**. Các nguyên nhân thường gặp:
> 
> ## 1. Nước chưa "chín" (chưa cycling)
> Đây là nguyên nhân phổ biến nhất với bể mới.
> - Cá thải ra **amoniac (NH₃/NH₄⁺)**, và amoniac rất độc. Vi khuẩn có lợi trong bể chuyển nó thành nitrit, rồi thành nitrat, nhưng bể mới chưa đủ vi khuẩn nên amoniac và nitrit tích tụ.
> - Cá chết sau 2–7 ngày, thường có dấu hiệu thở gấp, nổi đầu lên mặt nước, mang đỏ hoặc tái, lờ đờ, bơi lảo đảo.
> - **Cách kiểm tra:** dùng bộ test nước (API hoặc tương đương) đo amoniac,…

### stocking-01 · post · plain wins (3 · 6)

**Asked:** Em mới tập chơi lại bể cá. Ban đầu hỏi loại nào dễ nuôi, khỏe thì được tư vấn mua 2 cá vàng, 2 con bống (bảo nó ăn phân thừa) và 2 con dọn bể. Được vài hôm 1 con cá vàng chết, nghi đánh nhau. Em mua thêm 10 con 7 màu bé thả vào, vài hôm còn 9, 8 rồi 7 mà không thấy xác. Lạ nhất là 1 con 7 màu bụng to như chửa cũng biến mất. Hôm qua 1 con bống chết, nay con dọn bể chết và mất thêm 2 con 7 màu. Con bống với con dọn bể còn nửa xác, thấy con bống còn lại thỉnh thoảng rỉa. Có phải chúng đánh nhau và con to ăn con bé không? Vậy chỉ được thả cá sàn sàn nhau thôi à?

**Judge:** Y is the better answer. It names the most likely root cause, a new tank that hasn't cycled yet, and gives clear first steps: test the water, change some of it, remove dead fish and feed less. It does contain some wrong statements about guppies. X only repeats the guidebook's warning that goldfish eat small fish, gives no action steps and includes figures that don't fit Vietnam. / Câu trả lời X nêu đúng các nguyên nhân có thể có: bể mới chưa ổn định nên nước xấu, cá bống là cá ăn thịt chứ không dọn phân, cá vàng nuôi chung với bảy màu không hợp. X cũng có các bước xử lý ngay theo thứ tự. Tuy vậy, X sai ở chỗ nói cá bảy màu hung dữ và cần bể 200 lít. Câu trả lời Y chủ yếu chép lại thẻ thông tin cá, không giải thích vì sao cá chết, không nói đến con bống hay chất lượng nước, và không chỉ người nuôi cần làm gì.

**Ours lacks:** plan, diagnosis, follow-up. **Plain lacks:** figures, tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Cẩm nang ghi cá vàng có thể ăn cá bảy màu và cá bống nhỏ như bống neon xanh, và kiểm tra cho cả nhóm cho kết quả "Không nên nuôi chung". Không chỉ cần cá sàn sàn nhau: cá vàng thích nước 20–23°C, cá bảy màu cần nước ấm hơn và bể nhóm này cần dài tới 180 cm. Cẩm nang không có trang nào mô tả việc cá biến mất hay chết trong bể em, nên nguyên nhân cụ thể chỉ là suy đoán từ cảnh báo ăn thịt này.
> 
> [Trích: Cá vàng › Nuôi chung với con gì?]
> Cá vàng nhìn chung hiền và điềm đạm. Tuy vậy, chúng có thể cắn vây nhau khi bị stress, khi bể quá đông hoặc khi tranh ăn. Cá vàng bơi nhiều, hay lục lọi nền và c…

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

### stocking-01 · tank · plain wins (4 · 6)

**Asked:** Bảy màu trong bể tôi cứ biến mất không thấy xác, có phải bị cá khác ăn không?

**Judge:** X có đọc bể của bạn nhưng đổ lỗi cho cá tỳ bà ăn bảy màu, điều này khó xảy ra, và không có bước xử lý nào. Y viết chung chung và không nhắc cá vàng, nhưng giải thích đúng là bống và tỳ bà rỉa xác cá chết nên mới không thấy xác, kèm các bước kiểm tra rõ ràng: thử nước, đậy nắp bể, cho cá con chỗ trốn. / Y does use the tank: it names the goldfish, which can really eat guppies. But it wrongly blames the pleco, skips the gobies and gives no steps. X is generic, but it covers the real causes: predation, jumping out, gobies eating the dead fish, and water quality. It also gives a usable checklist (test the water, cover the tank, add hiding spots).

**Ours lacks:** plan, follow-up, diagnosis. **Plain lacks:** tank-fit, figures, diagnosis.

**Ours** (read 2 pages):

> Không nên nuôi chung: trong bể của bạn, cá tỳ bà leopard và cá vàng có thể ăn cá bảy màu (6 cm), nên cá con và cả cá lớn đều có thể biến mất mà không để lại xác. Cẩm nang cũng cho biết cá bảy màu con dễ thành mồi cho các loài khác trong bể, vì cá cái đẻ liên tục. Cẩm nang chưa có trang nào về bống, nên chưa kiểm tra được loài này.
> 
> [Công cụ: Nuôi chung cho Bể của tôi]
> Không nên nuôi chung: Cá tỳ bà leopard có thể ăn Cá bảy màu; Cá vàng có thể ăn Cá bảy màu.
> Cá tỳ bà leopard (50 cm) có thể ăn Cá bảy màu (6 cm).
> Cá vàng (20 cm) có thể ăn Cá bảy màu (6 cm).
> Cá vàng hay cắn vây cá khác: tránh nuô…

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

### stocking-02 · post · plain wins (4 · 6)

**Asked:** Hồ em 60x40x40, được 1 tuần, đang thả 5 mún + 5 chuột, cá đang tung tăng tốt. Em tính thả thêm 40 neon nữa vậy có nhiều không? Mún có sống chung với neon được không?

**Judge:** Y answers the real risk: the tank is only 1 week old and not cycled. It says to test NH3/NO2, keep to 20–30 neon and add them in batches. X correctly identifies mún as platy, but it never answers the question about 40 neon or the new tank. It also overstates the water mismatch between the two fish. / X gets to the real risk: adding 40 neons at once to a 1-week-old tank. It suggests testing NH3/NO2 and adding the fish in batches, though it doesn't know that 'mún' is platy. Y names the species correctly but exaggerates the water mismatch and gives no answer on how many neons or how to add them.

**Ours lacks:** plan, tank-fit, follow-up. **Plain lacks:** local, diagnosis.

**Ours** (read 2 pages, stopped at the calls limit):

> Cẩm nang gọi cá mún là cá platy, và trang platy ghi là hợp với cá neon xanh. Nhưng trang neon ghi nước phải mềm, pH không quá 7,0 và độ cứng không quá 10 dGH, còn platy cần pH 7–8,2 và 10–30 dGH, nên hai loài khó sống lâu dài trong cùng một nước. Cẩm nang mình đọc không có giới hạn số neon theo lít nước, nên mình chưa kết luận được 40 con có nhiều quá không và chưa chạy kiểm tra tank-mates cho cặp này.
> 
> [So sánh]
> - Cá platy (Xiphophorus maculatus): nhiệt độ 20–26 °C; pH 7–8.2; GH 10–30; dài 5 cm; bể từ 60 cm; đàn từ 6 con; tính peaceful; độ khó 1/8
> - Cá neon xanh (Paracheirodon innesi): nhiệt…

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

### stocking-02 · tank · plain wins (3 · 4.5)

**Asked:** Bể của tôi thả thêm 40 con neon có nhiều quá không, nuôi chung với mún được không?

**Judge:** Neither answer is good. Y is the better one because it gives practical steps (adequate filtration, weekly water changes, keep ammonia and nitrite at 0, add the fish in batches), which matter a lot in a tank that has only run for a week. However, Y doesn't recognise mún and ignores the tank details. X uses the tank size but rests on a no-filter assumption, doesn't answer the mún question, and gives no next steps. / X is the better answer, but only narrowly, and both are weak. X doesn't recognise "mún" (the Vietnamese name for platy) and asks back for things the app already holds, but it still gives useful steps: add the neon in batches, keep ammonia and nitrite at 0, and change water weekly. Y uses the real tank details but rests on an irrelevant no-filter rule, never answers the platy question, and leaves the hobbyist with nothing to do. Neither notices that the tank has only been running for a week.

**Ours lacks:** plan, follow-up, diagnosis, too-thin. **Plain lacks:** tank-fit, local, diagnosis.

**Ours** (read 3 pages, stopped at the time limit):

> Theo cẩm nang, bể không lọc cần khoảng 2 lít nước cho mỗi con cá nhỏ và 4 lít cho cá cỡ mún; bể của bạn 60×40×40 cm (khoảng 96 lít) đang có 5 cá mún và 5 cá chuột, nên 40 neon vượt xa mức đó nếu bể không lọc. Cẩm nang cũng khuyên nuôi neon thành đàn 8–10 con trở lên, nên bạn có thể chọn số lượng nhỏ hơn. Chưa kiểm tra được cá mún nuôi chung với neon có ổn không, và cẩm nang chưa cho tôi mức số lượng cho bể có lọc, nên tôi chưa thể kết luận chắc chắn.
> 
> [Thẻ loài] Cá neon xanh (Paracheirodon innesi): nhiệt độ 21–25 °C; pH 4–7.5; GH 1–12; dài 3 cm; bể từ 60 cm; đàn từ 6 con; tính peaceful; độ kh…

**Plain** (1103 characters):

> Nếu bể của bạn khoảng **100 lít trở lên** và có lọc tốt, thả thêm 40 con neon thường vẫn được, vì neon là cá đàn nhỏ, hiền. Nhưng 40 con khá đông, nên bạn cần kiểm tra vài điều:
> 
> - **Kích thước bể:** Bể dưới 60 lít mà có 40 con neon sẽ rất chật, dễ phát sinh ô nhiễm và stress. Neon nên được nuôi đàn từ 10 con trở lên, và càng nhiều càng tốt nếu bể đủ rộng.
> - **Lọc và thay nước:** Đàn đông thải nhiều chất bẩn hơn. Bạn cần lọc đủ công suất (ít nhất gấp 4-5 lần thể tích bể mỗi giờ) và thay 25-30% nước mỗi tuần.
> - **Chỉ số nước:** Sau khi thả, theo dõi amoniac và nitrit. Hai chỉ số này phải luôn …

### stocking-03 · post · plain wins (3.5 · 8)

**Asked:** Em mới kiếm được cái bể kích thước 35x20x22cm, chưa chơi bao giờ. Nên nuôi loại cá nào cho đẹp, dự định 1 tuần thay nước 1 lần? Có cần mua lọc và sục khí cho bể không?

**Judge:** Y tính ra thể tích bể khoảng 15 lít và gợi ý cá hợp với bể: cá xiêm, tôm cherry, vài con bảy màu. Y trả lời thẳng là thay nước 1 tuần/lần, mỗi lần 25–30% là được, nên có lọc bọt biển, và dặn chạy bể 2–4 tuần trước khi thả cá. X chép nguyên các đoạn trích từ cẩm nang, gợi ý cá đàn không hợp với bể nhỏ, và đưa lịch thay nước hằng ngày vốn dành cho bể thủy sinh dùng phân nền mới. / X tính bể ra khoảng 15 lít và chọn cá vừa với bể đó (1 con cá xiêm hoặc một đàn tôm). Nó cũng trả lời thẳng hai câu hỏi về thay nước và lọc: thay mỗi tuần 25–30%, dùng lọc bọt biển chạy bằng máy sủi khí, và nhắc chạy bể trước khi thả cá. Y gợi ý cá đàn và cả white cloud là cá nước lạnh, nói chung chung không dựa vào bể của người hỏi, và chèn nhiều đoạn trích dài, có đoạn không liên quan.

**Ours lacks:** tank-fit, plan, wrong, too-long. **Plain lacks:** –.

**Ours** (read 5 pages, stopped at the tools limit):

> Với bể 35x20x22cm, cẩm nang gợi ý bắt đầu từ các loài dễ nuôi như neon đen, rasbora tam giác, cá chuột albino hay white cloud; em nên kiểm tra kích thước trưởng thành của từng loài trước khi mua vì bể này khá nhỏ. Cẩm nang khuyên người mới không nên mua lọc thùng ngay từ đầu, và nếu dùng lọc chạy bằng khí thì cần máy sục khí, chạy suốt ngày đêm. Về lịch thay nước, cẩm nang khuyên 1–2 lần mỗi tuần và giữ đúng lịch, còn bể mới set thì nên thay 30–50% mỗi ngày trong 2 tuần đầu.
> 
> [Trích: Thay nước bể thủy sinh: lịch thay, cách hút cặn và xử lý cá sốc nước › Nên thay nước bao lâu một lần]
> Với bể n…

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

### stocking-03 · tank · plain wins (3 · 6)

**Asked:** Bể tôi nên nuôi cá gì, bao nhiêu con, có cần lọc và sục khí không?

**Judge:** X knows the tank is about 15 L, but it names no fish, gives no count and doesn't clearly say whether a filter is needed. Most of it is an off-topic product excerpt. Y doesn't know the tank size and has a few slips, but it uses Vietnamese hobby terms and gives a usable stocking rule, beginner fish, a clear 'filter: yes, air pump: optional', cycling for 2–4 weeks and 20–30% weekly water changes. / X is the better answer. It ignores the tank size, but it still gives a beginner the basics they need: get a filter, cycle the tank for 2–4 weeks, change 20–30% of the water each week, and a list of easy fish. Y works out the volume (about 15 L) but doesn't say which fish or how many, and it fills the space with excerpts about a foreign product.

**Ours lacks:** plan, too-thin, off-topic, local. **Plain lacks:** tank-fit, follow-up.

**Ours** (read 4 pages, stopped at the calls limit):

> Bể của bạn (35×20×22 cm, khoảng 15 lít) hiện chưa có cá. Cẩm nang cho biết không phải bể nào cũng cần máy sục khí: lọc treo và lọc thùng dùng mô tơ để đẩy nước nên không cần khí, còn lọc bọt biển thì cần, và nhìn chung nên để máy chạy suốt ngày đêm. Cẩm nang gợi ý nuôi betta riêng trong bể khoảng 19 lít, còn bể của bạn nhỏ hơn mức đó, và cẩm nang chưa đưa số con cho bể này nên tôi chưa thể trả lời chắc về số lượng.
> 
> [Trích: Cách dùng máy sục khí cho bể cá (và làm cho máy êm hơn) › Bể của mình có cần máy sục khí không?]
> Không phải bể nào cũng cần. Một số loại lọc như lọc treo và lọc thùng đẩy …

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

### stocking-04 · post · ours wins (5 · 4)

**Asked:** Em thích con cá bống vàng vì nó khá sinh động (lúc núp dưới đá, lúc đậu trên cây, trên đá) và dọn bể rất sạch, từ ngày nuôi không phải cạo rêu thành bể nữa, cũng chả cần cho ăn gì mà vẫn sống. Nuôi loại gì chung với bống này được? Trước em nuôi mún, rồi kiếm, rồi cá bảy màu, đều cứ chết dần, không biết có phải bị con bống xử không?

**Judge:** Bống vàng is the golden algae eater (Gyrinocheilus). Once grown, it sucks slime off slow fish like platies, swordtails and guppies, so the hobbyist's suspicion is probably right. X gives that key detail, though it hedges and pads the answer with an off-topic excerpt about water changes and algae. Y has more steps but misidentifies the fish and points the hobbyist toward the wrong causes. / Y catches the key fact: a grown bống vàng clings to other fish and sucks their slime, which is the most likely reason the guppies and swordtails kept dying. But Y buries it under unrelated excerpts and gives no steps. X looks more practical, but it gets the fish wrong, rules out the real cause and suggests tankmates that would also get harassed.

**Ours lacks:** diagnosis, plan, too-long. **Plain lacks:** diagnosis, wrong.

**Ours** (read 1 pages):

> Cẩm nang chưa có trang riêng cho cá bống vàng, nên không có danh sách cá ăn chung cụ thể. Mục hỏi đáp về thay nước và kiểm soát rêu nói rằng bống vàng ăn tảo nâu tốt, nhưng khi lớn nó hay bám vào nhớt của cá khác, làm cá đĩa và cá thần tiên dễ stress, nên nên bắt bống vàng ra trước khi thả các loài cá đẹp này. Cẩm nang không nói bống vàng làm chết mún, kiếm hay cá bảy màu, nên không thể khẳng định nguyên nhân cái chết là do nó.
> 
> [Trích: Thay nước, vệ sinh bể và kiểm soát rêu hại trong bể thủy sinh › Bắt đầu từ đâu]
> 1. Nếu đang hút cặn bằng ống mà thấy phí nước, hãy thử dùng một lọc thùng nhỏ …

**Plain** (1911 characters):

> Bống thường hiền với cá cùng cỡ, nhưng một số loài bống có tính lãnh thổ và có thể rượt hoặc cắn cá nhỏ, nhất là cá nằm đáy. Dù vậy, khả năng cao cá chết không phải do bống "xử". Mình nghĩ có mấy nguyên nhân hay gặp hơn:
> 
> 1. **Chất lượng nước**: Bể không cần cạo rêu, không thay nước, không cho ăn có thể đang tích tụ amoniac, nitrit hoặc nitrat. Đây là nguyên nhân phổ biến nhất khiến cá chết dần. Nên test nước (kit amoniac, nitrit, nitrat, pH) và thay 20–30% nước nếu chỉ số cao.
> 2. **Thiếu thức ăn**: Bống có thể sống nhờ rêu, màng sinh học và thức ăn tự nhiên trong bể, nhưng cá mún, kiếm, bảy …

### stocking-04 · tank · tie or split (4.25 · 4.5)

**Asked:** Bể tôi nuôi chung được những cá nào, khi cá thả thêm cứ chết dần?

**Judge:** Cả hai đều bỏ qua ghi chú về bể: bống vàng ăn rêu, không được cho ăn, và mún, kiếm, bảy màu đã lần lượt chết. Y vẫn đưa ra chẩn đoán có thể làm theo được (đo NH3/NO2, cách thả và cách ly cá, thay nước), nhưng gọi sai tên cá theo cách dùng ở Việt Nam và còn gợi ý lại đúng những loài đã chết. X ngắn, an toàn nhưng gần như chỉ hỏi lại và không trả lời câu hỏi nuôi chung. / Neither answer looks at the bống vàng or the fact that it isn't fed. Y is short but honest, uses no wrong Vietnamese names, and still covers testing for NH3/NO2, acclimating and quarantining. X has more steps but gets local fish names wrong and recommends the fish that already died.

**Ours lacks:** diagnosis, tank-fit, too-thin. **Plain lacks:** tank-fit, local, diagnosis, too-long.

**Ours** (read 2 pages, stopped at the calls limit):

> Cẩm nang chưa có trang nào về cá bống vàng, nên tôi chưa thể nói bống vàng nuôi chung được với cá nào. Cá chết dần sau khi thả thường liên quan đến sốc nước: cẩm nang khuyên thuần nước chậm để cá quen nhiệt độ và chỉ số nước, và nuôi cá mới riêng trong bể cách ly trước khi cho vào bể đang chạy. Bạn cho tôi biết kích thước bể và tên loài cá định thả thêm để tôi kiểm tra cùng nhau.
> 
> [Trích: Thả cá mới mua vào bể: cách thuần nước đúng để cá không sốc › Sau khi thả cá]
> - Tắt đèn. Mỗi nguồn ghi một khác. Một nguồn khuyên tắt đèn bể và để phòng tối ít nhất 12 giờ đầu, để cá bớt căng thẳng và bạn cù…

**Plain** (2273 characters):

> Cá chết dần mỗi lần thả thêm thường không phải do loài không hợp nhau mà chủ yếu do **chất lượng nước**. Bạn nên kiểm tra các điểm sau trước.
> 
> ## 1. Nguyên nhân hay gặp nhất
> 
> - **Nước chưa ổn định (chu trình nitơ chưa hoàn thiện):** Mỗi lần thả thêm cá, lượng amoniac và nitrit tăng đột ngột, làm cá yếu và chết. Bạn nên dùng bộ test (API hoặc tương tự) để đo NH3/NH4+ và NO2-. Hai chỉ số này phải bằng 0. NO3- nên dưới 20-40 ppm.
> - **Quá tải cá:** Quy tắc tham khảo là khoảng 1 inch (2,5 cm) cá trưởng thành cho 1 gallon (3,8 lít) nước, nhưng thực tế nên thưa hơn. Bể nhỏ dưới 60 lít chỉ nên nuôi v…

### stocking-05 · post · plain wins (3 · 7.5)

**Asked:** Em mới mua thêm mấy con cá chép thả chung với cá vàng, mà nó tấn công cá vàng kinh quá, một con chết rồi. Hỏi cửa hàng thì họ bảo thả chung được em mới mua. Giờ em nên làm sao, chép với cá vàng có nuôi chung được không?

**Judge:** Y says plainly that carp and goldfish shouldn't be kept together and explains why: carp grow big and fast and chase slow fancy goldfish. It then gives clear steps: separate the carp, check the goldfish for wounds, remove the dead fish, change water and watch them for a few days. X barely answers, describes its own sources, and only says to separate the carp. / X trả lời thẳng là không nên nuôi chung và đưa các bước làm ngay: tách chép, kiểm tra vết thương, vớt cá chết, thay nước. Vài chi tiết hơi lệch nhưng không gây hại. Y chủ yếu nói cẩm nang chưa có thông tin, lại dẫn một ý gây nhầm và chỉ có đúng một bước là tách cá.

**Ours lacks:** plan, diagnosis, follow-up. **Plain lacks:** figures.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang chưa có trang nào trả lời rõ việc cá chép có nuôi chung được với cá vàng hay không, và em cũng chưa có bảng kiểm tra cho hai loài này. Trang cá koi nói koi và cá vàng là họ hàng trong nhà cá chép, và cho rằng việc hai loài không nuôi chung được là hiểu lầm, nhưng phần điều kiện cụ thể tôi chưa đọc hết. Trang cá vàng ghi rằng cá vàng có thể cắn vây nhau khi bị stress, bể đông hoặc tranh ăn, và bạn cùng bể tốt nhất vẫn là các loại cá vàng khác; em nên tách con cá chép đã gây thương tích ra khỏi bể cá vàng trước.
> 
> [Thẻ loài] Cá vàng (Carassius auratus): nhiệt độ 10–27 °C; pH 6–9; GH 6–1…

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

### stocking-05 · tank · plain wins (3 · 6.5)

**Asked:** Cá chép mới thả cứ tấn công cá vàng trong bể tôi, có nuôi chung được không?

**Judge:** Y gives a clear answer (don't keep them together) and steps in order: separate the fish, check the goldfish for injuries, add hiding places, then a long-term plan. X only quotes guide entries about koi, which don't match the hobbyist's carp and contradict each other, and gives no plan. Neither answer deals with the dead goldfish or the chance the new carp brought in disease. / Tôi chọn X. X nói rõ là không nên nuôi chung và đưa ra các bước làm ngay: tách cá chép ra, kiểm tra vết thương trên cá vàng, thêm chỗ cho cá vàng trốn, rồi hướng lâu dài là chuyển cá chép ra hồ ngoài trời. Tuy vậy X không nhắc tới con cá vàng đã chết và không ghi liều thuốc. Y chủ yếu rào đón và dựa vào thẻ cá koi có thông tin mâu thuẫn, gần như không đưa ra bước nào để làm.

**Ours lacks:** plan, tank-fit, follow-up, too-thin. **Plain lacks:** diagnosis, figures, tank-fit.

**Ours** (read 1 pages):

> Cẩm nang chưa có trang riêng cho cá chép thường, nên tôi không khẳng định được cho loài của bạn. Cá koi cùng chi Cyprinus thì có trong cẩm nang, và kiểm tra ghép cặp cho kết quả "Không nên nuôi chung": cá koi có thể ăn cá vàng (koi dài tới 90 cm, cá vàng 20 cm). Nếu cá chép của bạn cũng lớn và thô bạo như vậy, nên tách riêng cá vàng ra.
> 
> [Thẻ loài] Cá koi (Cyprinus rubrofuscus): pH 6.5–9; dài 90 cm; đàn từ 3 con; tính peaceful; độ khó 2/8
> 
> [Trích: Cá vàng › Nuôi chung với con gì?]
> Cá vàng nhìn chung hiền và điềm đạm. Tuy vậy, chúng có thể cắn vây nhau khi bị stress, khi bể quá đông hoặc khi t…

**Plain** (1280 characters):

> **Thường thì không nên nuôi chung.** Cá chép lớn nhanh, có thể dài 30-60 cm hoặc hơn, khỏe và hiếu động hơn nhiều. Cá vàng bơi chậm, vây dài, dễ bị thương, nên cá chép thường xuyên đuổi, húc hoặc cắn vây cá vàng. Ngay cả khi cá chép còn nhỏ, sau vài tháng nó sẽ lớn và gây hại nhiều hơn.
> 
> **Bạn nên làm ngay:**
> 
> 1. **Tách cá chép ra** nếu có thể, bằng một bể riêng hoặc ngăn tạm bằng lưới/tấm nhựa trong bể.
> 2. **Kiểm tra cá vàng**: tìm vết cắn, rách vây, trầy xước, đốm đỏ hoặc nấm trắng. Nếu có vết thương, nên thay một phần nước và theo dõi, có thể dùng thuốc xanh methylen hoặc muối (liều nhẹ) đ…

### stocking-06 · post · plain wins (1 · 7)

**Asked:** Em vừa set cái bể cubic theo tư vấn, đáy bể để 5 con nerita. Ra cửa hàng thấy cá kiếm mắt đỏ đẹp quá nên mua thử vài con. Mấy con mún đỏ sắp đẻ nên em đang tính chuyển sang chỗ khác vì sợ bị ăn hết trứng, cá con, bắt đầu thấy ngại rồi. Bể có lọc thác, có cần thay nước hàng tuần không vì thấy nước có mùi hôi?

**Judge:** X không trả lời được gì, chỉ bảo người hỏi hỏi lại. Y nói đúng rằng mún và kiếm đẻ con chứ không đẻ trứng, chỉ cách tách cá mẹ, nêu các nguyên nhân gây mùi hôi ở bể mới set và đưa lịch thay nước kèm các bước xử lý rõ ràng. / X sửa đúng một hiểu lầm: mún và kiếm đẻ con, không đẻ trứng. X chỉ cách tách cá mẹ, giải thích nguyên nhân nước hôi trong bể mới (vi sinh chưa ổn định, cho ăn dư, nuôi đông) và đưa ra lịch thay nước 20–30% mỗi tuần có thứ tự rõ ràng. X còn hơi chung chung: chưa nhắc rằng cá kiếm lớn nhanh, dễ chật bể cubic, và chưa nói khi nào thì kiểm tra lại. Y không trả lời được gì, chỉ nói chưa đọc được tài liệu.

**Ours lacks:** asks-only, too-thin, plan. **Plain lacks:** tank-fit, local, follow-up.

**Ours** (read 0 pages, stopped at the tools limit):

> Hiện tại em chưa đọc được nội dung các trang cẩm nang về cá bảy màu, cá kiếm và ốc nerita, nên chưa thể trả lời chắc việc chuyển cá con hay có sống chung được không. Em cũng chưa đọc được trang thay nước, nên chưa có lịch thay nước theo cẩm nang; anh/chị có thể hỏi lại để em đọc tiếp các trang này.
> 
> [Gợi ý hỏi tiếp] Cá bảy màu có ăn trứng và cá con không? · Bao lâu phải thay nước bể cá một lần? · Cá kiếm có sống chung được với ốc nerita không?

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

### stocking-06 · tank · plain wins (3 · 6)

**Asked:** Mún trong bể tôi sắp đẻ, có cần tách ra không, và có phải thay nước hàng tuần không?

**Judge:** Y is right that the adults eat fry and gives a plan the hobbyist can follow: how to spot the gravid female, where to put her, what to feed the fry, how much water to change, and to keep ammonia and nitrite at 0. X claims the adults don't eat fry, which is wrong, and buries its answer under long excerpts. Neither answer picks up that this is a newly set-up tank whose water smells, which probably means it hasn't finished cycling. / X đưa ra cách làm rõ ràng: tách cá mẹ, cho cá con ăn, thay 20–30% nước mỗi tuần, giữ amoniac và nitrit ở 0. Lời dặn amoniac/nitrit rất hợp với bể mới set, dù X không nói thẳng bể chưa chạy xong chu trình nitơ (cycle) và nước có mùi hôi. Y nói sai rằng cá lớn không ăn cá con, trong khi bể có cá kiếm, lại chèn một đoạn trích dài lan man và cũng bỏ qua tình trạng bể.

**Ours lacks:** tank-fit, too-long, plan. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 3 pages):

> Cẩm nang cho biết cách tốt nhất để nuôi cá con là bắt cá cái sắp đẻ sang bể riêng, để nó đẻ xong rồi mới thả lại bể chính; cá lớn không ăn cá con, nhưng bể riêng vẫn giúp cá con sống tốt hơn. Về thay nước, cẩm nang khuyên thay 20–25% nước mỗi tuần, nước mới phải khử clo trước khi cho vào bể.
> 
> [Trích: Cá platy › Sinh sản ra sao?]
> Khi cho những dòng cá như thế này sinh sản lâu dài, cái khó nhất là giữ được sự đa dạng. Người nuôi rất dễ bị cám dỗ, chỉ chọn những con đặc biệt đẹp để giữ lại. Làm vậy thì chỉ sau vài thế hệ, cả đàn sẽ thành một kiểu đồng nhất, chẳng còn mấy điểm giống quần thể hoan…

**Plain** (1246 characters):

> Bạn nên **tách mún mẹ ra** nếu muốn giữ được cá con. Mún là loài đẻ con, và cá lớn thường ăn cá con ngay sau khi chúng được sinh ra.
> 
> **Cách tách và chuẩn bị:**
> - **Dùng lồng đẻ (breeder box)** treo trong bể hoặc **bể nhỏ riêng** có cây thủy sinh dày như rêu java, rong đuôi chó để cá con có chỗ trốn.
> - **Nhận biết sắp đẻ:** bụng to và vuông, có một đốm đen gần gốc vây hậu môn (gravid spot) sẫm dần. Thường khi thấy vậy thì còn khoảng 1–2 ngày.
> - **Sau khi đẻ:** đưa mẹ về bể chính hoặc để trong lồng đẻ, và lấy cá con ra khi cần.
> - **Cho cá con ăn:** artemia con, bột thức ăn cho cá con, hoặc thứ…

### stocking-07 · post · plain wins (2 · 6)

**Asked:** Bể nhà em kích cỡ 60x35x40, thả neon và sóc đỏ khoảng bao nhiêu con thì được ạ?

**Judge:** I'd rather the hobbyist got Y. It works out the volume correctly (about 84 L gross, 70–75 L real), gives reasonable fish numbers for the tank, and adds basic steps like cycling and weekly water changes. Y's guess that 'sóc đỏ' means Corydoras is probably wrong, but it asks the user to confirm. X guesses an obscure cold-water loach, which makes its compatibility warnings misleading, and it never says how many fish to keep. / X trả lời thẳng câu hỏi bằng số lượng hợp lý (20–25 neon), có các bước cơ bản như cycle bể và thay nước, và hỏi lại tên loài. Y đoán sai sóc đỏ là một loài chạch suối nước lạnh, đưa ra cảnh báo nhiệt độ và tính hung dữ không đúng với tình huống, và không cho biết nên thả bao nhiêu con.

**Ours lacks:** wrong, plan, tank-fit, figures. **Plain lacks:** follow-up, tank-fit.

**Ours** (read 2 pages, stopped at the time limit):

> Cẩm nang ghi cá neon xanh nên nuôi đàn từ 6 con trở lên, và cá chạch sóc đuôi đỏ cũng cần đàn từ 6 con, bể đáy tối thiểu khoảng 60×30 cm. Với bể 60×35×40 cm, 6 neon và 6 chạch được đánh giá là nuôi chung được nhưng cần để ý, vì chạch có thể rượt neon và hay cắn vây; bể đang ở mức 79%. Ngoài ra, nhiệt độ hai loài không trùng nhau (neon 21–25°C, chạch 15–21°C), nên bạn cân nhắc kỹ trước khi thả chung. Tôi hiểu “sóc đỏ” là cá chạch sóc đuôi đỏ; nếu bạn nói loài khác thì cho tôi biết.
> 
> [Công cụ: Nuôi chung]
> Nuôi chung được, nhưng cần để ý: Cá chạch sóc đuôi đỏ có thể rượt đuổi Cá neon xanh; Cá ch…

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

### stocking-07 · tank · ours wins (5.5 · 3.5)

**Asked:** Bể của tôi thả được bao nhiêu con neon và sóc đỏ?

**Judge:** X is the better answer. It uses the actual tank size, reads 'sóc đỏ' as the red-tail hillstream loach (a plausible local reading) and warns that it may chase and nip the neons. But it never gives a clear maximum number of fish. Y ignores the known tank size, mistranslates 'sóc' as Corydoras, gives loose stocking rules and mostly asks questions back. / Y uses the actual tank size and warns that the loach may chase neons and nip fins. It still doesn't give a full maximum count. X reads 'sóc' as Corydoras, ignores the known size, and gives a crowding rule that is too dense.

**Ours lacks:** figures, plan. **Plain lacks:** tank-fit, wrong, asks-only.

**Ours** (read 3 pages):

> Nuôi chung được, nhưng cần để ý: cá neon xanh nên nuôi đàn từ 6 con trở lên, và 6 neon cùng 6 chạch sóc đuôi đỏ trong bể 60×35×40 cm được tính là 79% đầy, mức vừa phải. Tôi hiểu "sóc đỏ" là chạch sóc đuôi đỏ; chạch này có thể rượt neon và hay cắn vây, nên cần bể rộng và nhiều chỗ trốn.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 60×35×40 cm]
> Nuôi chung được, nhưng cần để ý: Cá chạch sóc đuôi đỏ có thể rượt đuổi Cá neon xanh; Cá chạch sóc đuôi đỏ hay cắn vây.
> Cá chạch sóc đuôi đỏ hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Cá chạch sóc đuôi đỏ hay cắn vây cá khác: tránh nuôi c…

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

### stocking-08 · post · plain wins (3.5 · 7)

**Asked:** Em mới chơi, ban đầu chỉ định mua cá với cây nhựa, nhưng tìm hiểu thấy mê thủy sinh quá nên mua thêm cây ráy nhỏ và chùm xương cá thay cây nhựa. Bể bé tí 4 lít mà thích đẹp em thả 7-8 con. Nuôi được 1 tuần rồi vẫn ổn, lâu dài có ổn không ạ?

**Judge:** Y nói rõ vì sao bể 4 lít với 7–8 con là không ổn, kể ra các dấu hiệu cần để ý và đưa kế hoạch xử lý theo thứ tự: bớt cá, mua test kit, thêm lọc, thay nước, cho ăn ít. X chỉ đúng ở chỗ nói là quá tải, phần còn lại gần như chép cẩm nang tính cho bể lớn, không có bước nào cụ thể cho bể 4 lít của bạn này. / X nói rõ bể đang quá tải và chỉ ra những rủi ro thật của bể nhỏ: amoniac, oxy, chu trình nitơ chưa ổn định. X còn đưa các bước cụ thể (bớt cá, thêm lọc bọt, thay nước, cho ăn ít) và các dấu hiệu cần theo dõi. Y chỉ trích lại cách tính mật độ cho bể lớn, không có kế hoạch chăm sóc và không nhận ra cây chùm xương cá.

**Ours lacks:** plan, follow-up, too-thin, tank-fit. **Plain lacks:** local, tank-fit.

**Ours** (read 4 pages):

> Cẩm nang AquaTome không đưa con số riêng cho bể 4 lít, nhưng theo cách tính trong cẩm nang, bể 4 lít sau khi trừ chỗ trang trí chỉ còn khoảng 3,6 lít, nên 7–8 con là quá tải. Một tuần ổn chưa nói lên gì, vì cẩm nang khuyên tính theo cỡ trưởng thành của từng loài chứ không theo cỡ lúc mua, thả từng đợt nhỏ và đo nitrate 2–3 tuần một lần, chỉ thêm cá khi nitrate dưới 40 ppm. Ráy nana là cây dễ, cần ánh sáng thấp, hợp với bể nhỏ; còn chùm xương cá em nêu thì mình chưa tìm thấy trong cẩm nang, em gửi tên khoa học hoặc tên khác để mình tra thêm.
> 
> [Trích: Bể cá nuôi bao nhiêu con là vừa: cách tính …

**Plain** (2035 characters):

> Với bể 4 lít và 7-8 con cá, **lâu dài thì chưa ổn**. Một tuần đầu chưa nói lên được gì, vì các vấn đề của bể nhỏ thường xuất hiện sau vài tuần.
> 
> **Vì sao bể nhỏ dễ có vấn đề:**
> - **Chất thải tích tụ nhanh:** Cá thải amoniac và nước nhanh bẩn. Lượng nước ít nên amoniac, nitrit tăng rất nhanh, có thể gây độc cho cá.
> - **Chu trình nitơ chưa ổn định:** Bể mới thường cần 4-6 tuần để vi khuẩn có lợi phát triển đủ. Cây thủy sinh giúp hấp thụ một phần chất thải nhưng không thay thế được vi khuẩn lọc.
> - **Nhiệt độ dao động mạnh:** Nước ít nên thay đổi theo nhiệt độ phòng rất nhanh, dễ gây sốc.
> - **Thi…

### stocking-08 · tank · ours wins (6 · 3)

**Asked:** Bể của tôi đang thả 7-8 con cá, lâu dài có ổn không?

**Judge:** X uses the 4 L size and clearly says 7–8 fish is overstocked. But it doesn't say what to do now: move most of the fish out and do frequent water changes, since a tank only a week old hasn't cycled yet. Y never uses the tank size, stays generic about 40–60 L tanks, and mostly asks questions back. / Y uses the real tank size and gives the right answer: 7–8 fish in 4 L is overstocked (about 2–3 cm of fish in total). It doesn't say what to do next, though: move most of the fish to another tank, change water often while this one-week-old tank is still cycling, and test for ammonia. X ignores the tank's details, talks about 40–60 L tanks and ends up mostly asking questions back.

**Ours lacks:** plan, follow-up, tank-fit, figures. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 3 pages, stopped at the calls limit):

> Theo cẩm nang, bể 4 lít của bạn chỉ chứa được khoảng 2–3 cm cá tổng cộng (quy tắc 1 cm cho 1,5 lít, chỉ áp dụng cho bể đã ổn định có vi sinh và cây), nên 7–8 con là quá tải. Cẩm nang cũng cảnh báo thả quá dày làm chất thải tích lại, nước xấu dần, rồi cá bệnh và chết. Bạn chưa cho biết loài cá nên cẩm nang chưa thể nói riêng về loài của bạn; hãy cho biết tên loài để kiểm tra kỹ hơn.
> 
> [Trích: Bể cá nuôi bao nhiêu con là vừa: cách tính mật độ thả theo thể tích và loài › Mật độ thả là gì, vì sao phải tính]
> Mật độ thả là số cá bể của bạn gánh được mà nước vẫn sạch. Thả quá dày thì chất thải tích l…

**Plain** (1607 characters):

> Câu trả lời phụ thuộc vào **kích thước bể**, **loài cá** và **hệ lọc**. Bạn cho mình biết thêm thì mình đánh giá cụ thể hơn được.
> 
> **Vài tiêu chí để kiểm tra:**
> 
> 1. **Thể tích bể:** Quy tắc phổ biến là khoảng 1 lít nước cho 1 cm cá trưởng thành (tính cả chiều dài thân, không tính đuôi). Nhiều loài cá nhỏ như neon hay tetra thường được nuôi theo đàn, nên 7-8 con nhỏ có thể ổn trong bể 40-60 lít. Còn nếu là cá lớn như cichlid, cá vàng hay cá la hán thì 7-8 con có thể là quá đông.
> 
> 2. **Loài cá:** Cá đàn (neon, tetra, cá bảy màu) cần nhiều con cùng loài và thường thoải mái hơn khi đông. Cá lãnh …

### stocking-09 · post · plain wins (3 · 7)

**Asked:** Bể dài 80, rộng 35, cao 45 cm thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** Y đánh giá đúng là nuôi được nhưng có rủi ro: ông tiên lớn có thể ăn neon và hung dữ khi đẻ. Y cũng đưa cách làm cụ thể như thả neon khi ông tiên còn nhỏ, trồng dày cây và theo dõi xem neon có bị rượt không. X thì khuyên sai rằng nên nuôi 6 con ông tiên và cần bể dài 100 cm, đồng thời bác bỏ một cách nuôi chung vốn rất phổ biến. / X nói đúng: nuôi được nhưng có rủi ro khi ông tiên lớn. X đưa ra cách xử lý cụ thể như trồng nhiều cây, thả neon to và nói khi nào cần tách cá. Y bác bỏ thẳng thừng dựa trên hai luận điểm sai: ông tiên cần nuôi từ 6 con và cần bể dài 100 cm. Y cũng không cho người hỏi bước nào để làm.

**Ours lacks:** wrong, too-thin, plan. **Plain lacks:** figures, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên có thể ăn cá neon xanh (cá ông tiên dài khoảng 15 cm, neon xanh khoảng 3 cm), và cá ông tiên hơi dữ nên có thể rượt đuổi neon. Cá ông tiên còn sống theo đàn nên nên nuôi từ 6 con và cần bể dài từ 100 cm, nên bể 80 cm này chưa phù hợp.
> 
> [Công cụ: Nuôi chung]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon xanh (3 cm).
> Cá ông tiên hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Mức đầy bể: 84% — 84% · Vừa phải: bể ổn định với lọc và thay nước thường lệ. (Cá ông tiên sống theo đàn: nên nuôi từ 6…

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

### stocking-09 · tank · plain wins (4 · 7)

**Asked:** Bể của tôi thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** Bể ~126 L của bạn này nuôi 2 con ông tiên với 10 neon xanh được, nếu kiểm soát rủi ro. Y nói đúng điều đó và có mẹo thực tế: thả neon cùng lúc hoặc trước, cho ăn đủ, trồng cây dày, tách neon khi ông tiên đẻ. X thì từ chối thẳng, lại dựa vào lời khuyên sai là nuôi đàn 6 con và quy định bể dài 100 cm. / I'd rather this hobbyist got X. It correctly says the pairing works with precautions (buy the neons full-grown or before the angels get big, feed well, give cover, and watch for aggression when the angels spawn), and their 126 L tank meets its 100 L minimum. Y uses the tank size but reaches a wrong flat "no" based on a bad rule (at least 6 angelfish) and a too-strict tank length, and it gives no way forward.

**Ours lacks:** wrong, plan, follow-up, too-thin. **Plain lacks:** tank-fit, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên có thể ăn cá neon xanh, vì loài này lớn tới 15 cm còn neon chỉ khoảng 3 cm. Cẩm nang cũng ghi cá ông tiên nên nuôi theo đàn từ 6 con và cần bể dài từ 100 cm, trong khi bể của bạn dài 80 cm.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 80×35×45 cm]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon xanh (3 cm).
> Cá ông tiên hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Mức đầy bể: 84% — 84% · Vừa phải: bể ổn định với lọc và thay nước thường lệ. (Cá ông tiên sống theo đàn: nên nuôi từ 6 con (đang chọn 2)…

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

### stocking-10 · post · plain wins (3 · 7)

**Asked:** Bể 60x30x36 cm của mình đang nuôi 12 con neon xanh, thả thêm 1 con cá betta được không?

**Judge:** Một con betta đực với 12 con neon trong bể 65 lít thường nuôi chung được. Y nói đúng điều đó, kèm cách bố trí bể và dấu hiệu cần theo dõi để tách cá. X từ chối thẳng dựa trên một quy tắc quá cứng và gần như không giải thích gì. Y có vài lỗi nhỏ: dùng sai tên cá, dặn thả betta trước dù bể đã có neon, và gợi ý dùng sưởi. / X đúng với thực tế hơn: một con betta trong bể 65 lít có nhiều cây thường sống chung được với neon. X cũng chỉ rõ cần chuẩn bị gì và theo dõi trong 1–2 tuần đầu. Y cấm hẳn theo quy tắc chung chung, không đưa ra cách làm nào.

**Ours lacks:** too-thin, wrong, plan. **Plain lacks:** local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta hung dữ, thường phải nuôi riêng hoặc trong bể chỉ có một loài. Bể 60x30x36 cm của bạn còn thưa (khoảng 36%) nên đủ chỗ cho 12 con neon, nhưng việc thả thêm betta vào đây là không phù hợp theo cẩm nang.
> 
> [Công cụ: Nuôi chung]
> Không nên nuôi chung: Cá betta (cá xiêm) hung dữ.
> Cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.
> Mức đầy bể: 36% — 36% · Còn thưa: thả thêm được.
> 
> [Gợi ý hỏi tiếp] Bể 60x30x36 cm nuôi được những loài nào khác? · Cá neon xanh cần điều kiện nước thế nào? · Cá betta nuôi riêng cần bể bao nhiêu lít?

**Plain** (1406 characters):

> **Có thể nuôi được**, bể 60x30x36 cm (khoảng 65 lít) đủ rộng cho 1 con betta cùng 12 con neon. Neon là cá hiền, đi đàn, ít khi gây hấn, và betta thường sống chung được với chúng. Tuy nhiên, bạn nên lưu ý mấy điểm sau:
> 
> **Điều kiện để sống chung tốt:**
> - **Nhiều chỗ ẩn nấp:** Trồng thêm cây thủy sinh như dương xỉ Java, rêu Java, trâm bầu, hoặc đặt đá, lũa. Betta cần chỗ tránh khi bị rượt đuổi.
> - **Dòng nước nhẹ:** Betta bơi chậm và không thích dòng chảy mạnh, nên chọn lọc không quá mạnh hoặc để bớt vòi phun.
> - **Nhiệt độ:** Cả hai loài đều ưa nước ấm, khoảng 24–27°C, nên thường dùng máy sưởi l…

### stocking-10 · tank · tie or split (4 · 4)

**Asked:** Bể của tôi thả thêm 1 con cá betta được không?

**Judge:** I'd rather this hobbyist got X, though neither answer is good. X uses their real tank, gives a clear answer and uses the local name \"cá xiêm\". But its flat \"no\" is too strict: one betta with 12 neons in a tank this size can often work if you watch for fin-nipping and chasing. Y's facts about betta and neons are closer to right, but it misreads the question as if a betta is already in the tank, ignores the tank data and mostly asks questions back. / Y uses the tank details, but it gives the wrong verdict: one betta can usually live with 12 neons in a ~60 L tank. X gets the tank wrong and asks questions back, but it does say betta and neons can work if the tank is big enough and you watch them, so it misleads the hobbyist less.

**Ours lacks:** too-thin, diagnosis, follow-up, wrong, plan. **Plain lacks:** tank-fit, asks-only, local, plan.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài theo cẩm nang. Bể của bạn đang có 12 cá neon xanh, nên thêm một con betta vào đây không được khuyến nghị dù mật độ cá vẫn ở mức vừa phải.
> 
> [Gợi ý hỏi tiếp] Cá betta nên nuôi trong bể bao nhiêu lít? · Cá neon xanh nuôi chung với loài nào? · Cá betta cần điều kiện nước thế nào?

**Plain** (1081 characters):

> **Thường thì không nên**, đặc biệt nếu bể đang có một con betta đực. Betta đực rất hung dữ với các con đực khác và sẽ đánh nhau đến khi bị thương nặng hoặc chết. Chúng cũng có thể căng thẳng và bệnh tật khi phải sống chung với cá khác.
> 
> **Một số trường hợp cụ thể:**
> 
> - **Betta đực + betta đực:** Không nên. Gần như chắc chắn sẽ đánh nhau.
> - **Betta đực + betta cái:** Chỉ có thể thử trong bể rất lớn (thường từ 80 lít trở lên), có nhiều cây thủy sinh và chỗ ẩn nấp, và phải quan sát liên tục. Con cái có thể bị đực rượt đuổi hoặc cắn. Nếu thấy cá cái bị thương hoặc stress, phải tách ra ngay.
> - **B…

