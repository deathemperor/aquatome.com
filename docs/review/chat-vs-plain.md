# The chat against plain Claude, on hard problems

2026-11-07, `packages/engine/scripts/chat-vs-plain.ts`. 47 questions (all of them) from public Vietnamese hobby forums, reworded with no names (`packages/engine/scripts/hard-questions.vi.json`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and limits at commit `b41dac763`, claude-haiku-5-5, over https://aquatome.com's handbook. Plain: claude-haiku-5-5, the same effort, no system prompt, no tools, no handbook. Judge: claude-opus-5-5 through the Claude CLI, rubric version 2 (`chat-vs-plain-lib.ts`).

- **post:** both answer the whole forum post. **tank:** both get a short question; ours reads the reader's saved tank as the chat reads it today (size, fish and counts; not plants, light, CO₂ or notes), plain Claude only the question. The judge is told everything the post said about the tank.
- **Blind, as far as it goes:** the judge isn't told which answer is ours, and both lose the site's name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.
- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.
- **Failed:** when ours failed (the limits ran out, a call timed out) and plain answered, the reader got an error: plain wins it on every count, with no score.
- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).
- **Cost** per question, at list price: ours $0.0030, plain $0.0012. The judge runs on the owner's Claude accounts.

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post | 4 / 43 / 0 of 47, ours failed 4 | 3.5 · 6.8 | 4–38 | 4–43 | 1–46 | 9–23 | 7–29 | 43/43 | 9 / 34 / 4 |
| tank | 8 / 36 / 3 of 47, ours failed 4 | 3.9 · 5.5 | 11–29 | 11–14 | 4–42 | 12–21 | 12–14 | 40/43 | 16 / 27 / 4 |

## By problem

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post · algae | 1 / 10 / 0 of 11 | 3.8 · 6.7 | 1–9 | 1–10 | 1–10 | 5–2 | 3–5 | 11/11 | 1 / 10 / 0 |
| post · setup | 1 / 8 / 0 of 9, ours failed 1 | 3.2 · 7.0 | 1–8 | 0–9 | 0–9 | 2–4 | 0–6 | 8/8 | 0 / 8 / 1 |
| post · cycling | 1 / 7 / 0 of 8 | 4.4 · 6.9 | 1–4 | 1–7 | 0–8 | 1–2 | 3–4 | 8/8 | 2 / 6 / 0 |
| post · sick | 0 / 9 / 0 of 9, ours failed 2 | 3.1 · 7.1 | 0–8 | 1–8 | 0–9 | 0–7 | 0–7 | 7/7 | 1 / 6 / 2 |
| post · stocking | 1 / 9 / 0 of 10, ours failed 1 | 2.9 · 6.6 | 1–9 | 1–9 | 0–10 | 1–8 | 1–7 | 9/9 | 5 / 4 / 1 |
| tank · algae | 2 / 7 / 2 of 11 | 4.3 · 5.4 | 5–6 | 2–0 | 0–11 | 5–3 | 4–0 | 9/11 | 4 / 7 / 0 |
| tank · setup | 2 / 7 / 0 of 9 | 3.3 · 5.1 | 1–6 | 3–4 | 1–8 | 2–4 | 2–4 | 9/9 | 1 / 8 / 0 |
| tank · cycling | 1 / 7 / 0 of 8 | 4.0 · 5.8 | 2–3 | 1–1 | 1–7 | 3–3 | 3–2 | 8/8 | 3 / 5 / 0 |
| tank · sick | 0 / 9 / 0 of 9, ours failed 1 | 3.2 · 6.3 | 0–9 | 0–5 | 0–9 | 0–6 | 0–3 | 8/8 | 3 / 5 / 1 |
| tank · stocking | 3 / 6 / 1 of 10, ours failed 3 | 4.5 · 4.7 | 3–5 | 5–4 | 2–7 | 2–5 | 3–5 | 6/7 | 5 / 2 / 3 |

## What each lacks, as the judge tagged it

| | Ours | Plain |
| --- | --- | --- |
| post | plan 37, too-thin 37, tank-fit 30, diagnosis 14, figures 8, follow-up 8, wrong 5, asks-only 3 | too-long 21, local 14, tank-fit 10, follow-up 6, diagnosis 6, wrong 5, figures 2, asks-only 1, unsafe 1 |
| tank | plan 36, too-thin 34, tank-fit 30, diagnosis 16, figures 12, follow-up 12, wrong 6, asks-only 2 | tank-fit 43, too-long 22, diagnosis 13, asks-only 8, local 7, figures 4, wrong 3, plan 3, follow-up 2, off-topic 1 |

Tags: plan, diagnosis, tank-fit, figures, follow-up, local, too-thin, too-long, asks-only, wrong, unsafe, off-topic.

## Errors the judge found

- ours, algae-01 post: "tổng đèn khoảng 8–10 tiếng": nghĩa là bạn ấy phải tăng giờ đèn lên trong khi bể mới đang có rêu, tức là đi ngược hướng cần làm
- ours, algae-01 post: Không nhắc gì đến việc đang dùng thuốc khử rêu và không trả lời được chuyện lá nmc bị trắng
- ours, algae-01 post: Bảo 'tổng đèn khoảng 8–10 tiếng' trong khi bể mới đang lên rêu và mới chạy 7 tiếng: nghe theo thì người chơi sẽ tăng giờ đèn, làm rêu nặng thêm.
- ours, algae-01 post: Phần trả lời không nhắc gì đến thuốc khử rêu đang dùng trên Bucep và ngưu mao chiên mới trồng.
- ours, algae-01 post: Nói 'phần cẩm nang mình đã đọc chưa xác nhận đúng hay sai' là kể chuyện nội bộ của trợ lý, người hỏi không cần biết điều đó.
- plain, algae-01 post: Gợi ý thả ốc Nerite để ăn rêu tóc: Nerite hầu như không ăn rêu tóc, chủ yếu ăn rêu bám mảng; tép Amano mới là lựa chọn hợp lý.
- plain, algae-01 post: Xưng 'anh/chị' nghe gượng, hơi lạc giọng so với cách dân chơi thủy sinh nói chuyện với nhau.
- ours, algae-01 tank: "tổng thời gian đèn về khoảng 8–10 tiếng": the hobbyist already runs 7h. For a hair-algae outbreak in a 2-week tank, this tells them to add light.
- ours, algae-01 tank: "mỗi đợt không quá 4 tiếng": a split photoperiod given as a fixed rule, with no reason and no evidence behind it.
- ours, algae-01 tank: "Carbon nước cũng giúp": suggests liquid carbon while they already dose an algae remover and the nmc is whitening, so it risks more plant damage.
- ours, algae-01 tank: "Tổng thời gian đèn 8–10 tiếng" — bể đang lên rêu và đèn đã bật 7h, khuyên vậy là tăng đèn, đi ngược hướng cần làm
- ours, algae-01 tank: "Mỗi đợt không quá 4 tiếng" — chia đèn thành nhiều đợt, đưa ra như quy tắc mà không có cơ sở, rêu tóc vẫn có thể mọc
- ours, algae-01 tank: Khuyên dùng "carbon nước" mà không cho liều và không lưu ý họ đang dùng thuốc khử rêu
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": in Vietnam "cá rìu" means hatchetfish, not SAE, so the name is misleading.
- plain, algae-01 tank: "nhỏ H₂O₂... liều thấp": no dose is given for spot-treating with H₂O₂, which is risky in a new tank with fragile plants.
- plain, algae-01 tank: "Thay 30–50% nước mỗi tuần": this is less than they already change (30% every 2 days) and does not engage with what they do.
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater" — cá rìu là cá hatchet, không phải SAE; gọi sai tên sẽ khiến người đọc mua nhầm cá
- plain, algae-01 tank: Nhỏ H₂O₂ theo kiểu "liều thấp" mà không cho con số nào — đây là bước có rủi ro nên cần liều cụ thể
- plain, algae-01 tank: "Thay 30–50% nước mỗi tuần" — ít hơn mức họ đang làm (30% mỗi 2 ngày) và không ăn khớp với tình trạng bể mới
- plain, algae-02 post: 'Dòng A361… nếu muốn giữ cùng hệ sinh thái Chihiros': A361 is a 36cm light and would not cover a 70cm tank.
- plain, algae-02 post: 'Chihiros WRGB II Slim' suggested as a moderate light: WRGB II is a high-output light, not a fit for low-light ráy and rêu.
- plain, algae-02 post: 'rau ngổ' listed as a floating plant: it is a stem plant, not a floater.
- plain, algae-02 post: 'Flourish Excel' spot-dosing has no warning that it can burn some mosses, which are a main plant in this tank.
- plain, algae-02 post: "rau ngổ" listed as a floating plant: rau ngổ (Limnophila aromatica) is a stem plant, not a floating plant that shades the surface
- plain, algae-02 post: "Dòng A361" suggested as an option: A361 is made for a 36cm tank and is far too short for a 70cm tank
- plain, algae-02 post: "dòng C series" suggested for a 70cm tank: Chihiros C series are small clip-on lights for nano tanks
- plain, algae-02 post: Gives the cause of BBA mainly as too much light, while sitting this low on the possible causes CO₂ fluctuation and organic waste, which are the most common causes in tanks of slow-growing plants
- ours, algae-02 tank: "vệ sinh nền": bể này không có nền nên bước này không áp dụng được
- ours, algae-02 tank: Bảo người hỏi kiểm tra CO2 trước khi giảm đèn, trong khi bể ráy và rêu dưới đèn A601 plus mạnh, nhiều khả năng không có CO2, nên đèn mới là thứ đầu tiên cần chỉnh
- ours, algae-02 tank: "vệ sinh nền": the tank has no substrate, so there is no substrate to clean
- ours, algae-02 tank: "trước khi giảm đèn": with slow-growing anubias and moss under a Chihiros A601 plus and no CO2 or fertiliser, cutting light is a sensible first step, not one to put off
- plain, algae-02 tank: "cá cày Xiêm" không phải tên quen dùng ở Việt Nam cho cá SAE; dân chơi thường gọi là cá bút chì hoặc SAE
- plain, algae-02 tank: "cá cày Xiêm": in Vietnam the Siamese algae eater is usually called cá bút chì, so this name may confuse the reader
- ours, algae-03 post: Says it can't judge the Odyssea light because the guide doesn't cover it. The Odyssea dual is a common LED planted-tank light, and the question of whether to turn it off for a few days goes unanswered. The excerpt does mention a blackout of up to 7 days.
- plain, algae-03 post: Treats the Odyssea as possibly a UV sterilizer and says to run both tubes continuously. It's an LED lighting fixture, so following this would mean longer light and more algae.
- plain, algae-03 post: Says to stop daily water changes and only change 10-15%. A new planted tank, especially on aquasoil, needs large frequent changes in the first weeks to strip excess nutrients.
- plain, algae-03 post: Doesn't know that 'trân châu ngọc trai' is a carpeting plant, and asks about it.
- plain, algae-03 post: "nếu đây là đèn UV... cần bật đủ 2 bóng và chạy liên tục": Odyssea là đèn LED chiếu sáng thủy sinh phổ biến ở VN, không phải đèn UV; nếu người đọc làm theo thì sẽ tăng sáng và tảo nở mạnh hơn
- plain, algae-03 post: "Ngừng thay nước hằng ngày... chỉ 10-15%": hồ thủy sinh mới set thường được thay nước nhiều và thường xuyên để giảm dinh dưỡng dư từ phân nền, nên lời khuyên này đi ngược thực hành chuẩn
- plain, algae-03 post: Hỏi lại "Trân châu ngọc trai là cây thủy sinh hay loài nào": đây là cây trải thảm quen thuộc, câu hỏi cho thấy không nắm được hồ của người hỏi
- ours, algae-03 tank: "giảm đèn": they already cut to one tube for 4h a day, so this tells them to repeat what they already did.
- ours, algae-03 tank: "Nếu cá nổi đớp khí": this is a new tank only a few days old and probably has no fish yet, so the warning doesn't apply.
- ours, algae-03 tank: Nói "giảm đèn" như bước đầu tiên, trong khi người hỏi đã giảm đèn xuống 4 tiếng. Đây là lời khuyên chung, không mới với họ, chứ không phải lỗi sai về kiến thức.
- plain, algae-03 tank: "không hại gì cho bể": a full blackout of several days still weakens new trân châu ngọc trai, so it is not harmless.
- plain, algae-03 tank: "chỉ bật 6-8 tiếng/ngày": they are on 4h now, so this would mean more light while the tank is still unstable.
- plain, algae-03 tank: "rau muống nước" đề xuất trồng trong bể thủy sinh là không phù hợp; nên dùng cây nổi như bèo hoặc cây ngoại cảnh trồng thủy canh.
- plain, algae-03 tank: "Không dùng thuốc diệt tảo liều cao" đúng nhưng không nhắc rằng việc thay bông lọc đã làm mất vi sinh. Đây là thiếu sót chứ không phải lỗi sai.
- ours, algae-04 post: The quoted guide says brown algae usually shows up in week 3–4, but this tank is only on day 7, and the answer doesn't address the mismatch.
- plain, algae-04 post: "Nước máy ở Việt Nam thường có hàm lượng silicate khá cao": this is stated as a general fact with no source. It is true of some groundwater, not of all tap water.
- plain, algae-04 post: "Cường độ ở mức trung bình-khá": the hobbyist never gave the lights' wattage, so this verdict on the light is a guess.
- plain, algae-04 post: "Nhiệt độ thấp" as a cause hardly applies in Vietnam's heat. And daily water changes in a newly set tank are a common, valid practice, so calling them too much is debatable.
- plain, algae-04 post: "Thay nước 30% mỗi ngày là hơi nhiều... hệ vi sinh chưa kịp ổn định": thay nước không làm hại vi sinh nằm trong lọc. Thay nước thường xuyên trong những tuần đầu của hồ cây có CO2 là cách làm chuẩn, nên khuyên giảm xuống mỗi tuần một lần là lời khuyên không chắc chắn.
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển hơn": yếu tố này hầu như không liên quan với hồ đặt trong khí hậu nóng ở Việt Nam.
- plain, algae-04 post: "nước máy ở Việt Nam thường có hàm lượng silicate khá cao": đưa ra như một nhận định chung mà không có nguồn.
- ours, algae-04 tank: "cắt giờ đèn xuống còn 2–3 tiếng mỗi ngày": in a Dutch tank with CO₂ and fertiliser, this starves the plants for weeks. Diatoms don't need that.
- ours, algae-04 tank: "thả cá bống vàng… để mút tảo": cá bống vàng is not a known diatom eater. The fish for this job is Otocinclus (cá otto).
- ours, algae-04 tank: "thay khoảng 30% nước hai ngày một lần": they already change 30% every day, so this cuts back their routine without saying why.
- ours, algae-04 tank: "cắt giờ đèn xuống còn 2–3 tiếng mỗi ngày": bể cây Hà Lan có CO₂ mà chỉ chiếu 2–3 tiếng thì cây thiếu sáng, đuối và tàn; nên giữ khoảng 6–7 tiếng.
- ours, algae-04 tank: "cá bống vàng" để mút tảo nâu: đây không phải tên quen thuộc của một loài ăn tảo nâu; Otto hoặc ốc Nerita mới là lựa chọn đúng.
- plain, algae-04 tank: "dùng bộ lọc than hoạt tính… khử silicat": activated carbon does not remove silicate. Only silicate-removing resin does.
- plain, algae-04 tank: Suggests cá tỳ bà for a Dutch tank. Large plecos can damage plants.
- plain, algae-04 tank: Asks for tank size, plants and light, which the app already holds. Advice on cutting feeding and weekly water changes ignores the daily changes they already do.
- plain, algae-04 tank: "bộ lọc than hoạt tính... khử silicat": than hoạt tính không khử được silicat; chỉ resin khử silicat mới có tác dụng.
- plain, algae-04 tank: "Thay 20-30% mỗi tuần": họ đang thay 30% mỗi ngày rồi, nên lời khuyên này không trúng với bể của họ.
- ours, algae-05 post: "giảm đèn còn 2–3 tiếng mỗi ngày": far too little light for a Dutch tank where the plants are growing well. It would starve the stem plants, and diatoms don't call for it.
- ours, algae-05 post: "thả ốc Nerita để dọn": the hobbyist already has a Nerita in the tank. The answer ignores that and also skips the questions about room light and the snail.
- ours, algae-05 post: "giảm đèn còn 2–3 tiếng mỗi ngày": giảm quá mạnh với bể Hà Lan đang lên tốt, cây sẽ thiếu sáng và yếu đi; hạ xuống khoảng 6 tiếng là đủ.
- ours, algae-05 post: "thả ốc Nerita để dọn": bạn ấy đã thả Nerita rồi, câu trả lời bỏ qua chi tiết này.
- ours, algae-05 post: Bỏ ngỏ hai câu hỏi trực tiếp của bạn ấy (đèn phòng buổi tối hắt vào bể và ốc Nerita nằm im).
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": this is a weak guess. A foreground plant doesn't add nutrients to the water.
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": nói không có căn cứ; cây trồng nền hút dinh dưỡng chứ không làm dư thêm.
- plain, algae-05 post: "Cho ăn quá nhiều là nguyên nhân phổ biến nhất": nói như đã biết chắc, dù bạn ấy không hề nhắc đến cá hay chuyện cho ăn.
- plain, algae-05 tank: "ốc nerite hoặc ốc táo": the hobbyist already keeps nerite snails, and apple snails eat plants, so suggesting them for a planted tank is a poor fit
- plain, algae-05 tank: "thuốc chuyên dụng (thường chứa erythromycin)" and H₂O₂: reaching for chemicals in a 4-week-old tank is premature, can hit the young bacteria colony, and H₂O₂ is risky for the snails
- plain, algae-05 tank: "cá tỳ hưu (Otocinclus), cá chùy": these Vietnamese names don't match what VN hobbyists usually call these fish
- plain, algae-05 tank: "Thay nước 25–40% và lặp lại vài lần": they already change water every 2 days, so this ignores their routine
- plain, algae-05 tank: 'cá chùy (cá ăn tảo Siamese)': this is not the usual Vietnamese name for the Siamese algae eater, which is normally called cá bút chì, so the name looks made up
- plain, algae-05 tank: 'cá tỳ hưu (Otocinclus)': in Vietnam Otocinclus is usually sold as cá otto, so this name is doubtful
- plain, algae-05 tank: It recommends nerite snails, which they already keep, and doesn't mention that the snails are lying still and not moving
- plain, algae-05 tank: Pointing to erythromycin and H₂O₂ is premature for a 4-week-old tank, and it gives no dose
- plain, algae-06 post: "bơm CO2 vào lọc phụ 603": lọc phụ nằm trên đường in của lọc chính, nên khí vẫn bị hút vào bơm 702B và không giải quyết được tiếng lọc xọc
- plain, algae-06 post: "rêu ... thường kém bền khi bị loại bỏ thủ công" và "tép hoặc ốc ăn tạp không cắn cây khỏe": câu bị lộn xộn, khó hiểu
- plain, algae-06 post: Bảo tránh hẳn việc trộn CO2 ở đầu in là hơi quá tay. Ở VN trộn đầu in là cách làm phổ biến, vấn đề thật ở đây là cho quá nhiều khí, khí tích lại trong lọc không kịp tan
- plain, algae-06 post: Coi lọc phụ 603 như lọc có lưu lượng riêng ('bơm CO2 vào lọc phụ 603, lưu lượng thấp hơn'). Thực ra HW-603 là lọc phụ không có bơm, nối vào đường IN của lọc chính.
- plain, algae-06 post: Bảo chuyển CO2 ra khỏi đầu hút nhưng lại khuyên đặt diffuser cách đầu hút chỉ 5-10 cm, tự mâu thuẫn.
- plain, algae-06 post: 'rêu sừng hươu và rêu lông tơ thường kém bền khi bị loại bỏ thủ công' viết khó hiểu, gần như sai ý.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3" để đạt 25–30 ppm: sai. Muốn đạt khoảng 30 ppm thì pH phải giảm chừng 1 đơn vị, giảm 0,2–0,3 chỉ ứng với lượng CO₂ rất thấp.
- plain, algae-06 tank: "khuấy nước tốt để CO₂ hòa tan và không thoát ra ngoài": nói lẫn lộn. Khuấy mặt nước làm CO₂ thoát ra nhiều hơn chứ không giữ CO₂ lại.
- plain, algae-06 tank: "cá tỳ bà (ăn rêu lông tơ và rêu tóc)": cá tỳ bà chủ yếu ăn rêu bám mặt kính, gần như không ăn rêu tóc.
- plain, algae-06 tank: Hỏi lại bể "có CO₂ chưa" và kích thước bể trong khi app đã có sẵn: bể 60×40×40, CO₂ 6–7 giọt/giây.
- plain, algae-06 tank: 'pH giảm khoảng 0,2–0,3 … (khoảng 25–30 ppm)': để đạt khoảng 30 ppm thì pH phải giảm khoảng 1 đơn vị, giảm 0,2–0,3 chỉ là rất ít CO₂
- plain, algae-06 tank: 'Có, tăng CO₂ thường giúp': bể đang chạy 6-7 giọt/giây cho khoảng 96 L, có cả tép, mà CO₂ thất thoát qua bọt khí to ở đầu out. Bảo tăng tiếp là có hại cho tép, chưa nói đến chuyện CO₂ đang hòa tan kém
- plain, algae-06 tank: 'cá tỳ bà (ăn rêu lông tơ và rêu tóc)': cá tỳ bà ăn rêu tóc kém; còn gọi SAE là 'cá đầu đen' thì không phải tên giới chơi bể ở Việt Nam hay dùng
- plain, algae-06 tank: Hỏi lại 'có CO₂ chưa', trong khi bể đã có sẵn CO₂
- plain, algae-07 post: "Nền trơ như Seachem Flourite... không có dinh dưỡng": Flourite là đất sét nung có sẵn sắt và khoáng, không hoàn toàn trơ.
- plain, algae-07 post: Đọc thiếu chẩn đoán: ngọn trắng, xoắn ở cây non thường do thiếu canxi/GH thấp hoặc thiếu vi lượng không di động, nhưng Y chỉ nhắc đo GH chứ không nêu ra khả năng này.
- plain, algae-07 post: Calls Fluval Stratum an inert substrate ("nền trơ ... Fluval Stratum"). It is a soil-based substrate that releases some nutrients and breaks down over time.
- plain, algae-07 post: Assumes the hobbyist isn't dosing fertiliser regularly ("không bón phân đều"), which they never said, and leaves out calcium deficiency or soft water as a cause of twisted, white new growth.
- plain, algae-07 tank: "Ốc táo: ăn rêu xanh": ốc táo ăn cả cây thủy sinh, không nên thả vào bể cây Hà Lan
- plain, algae-07 tank: "Cá tỳ bà... ăn rêu đáy": cá tỳ bà lớn nhanh, phá cây và thải nhiều, không hợp bể thủy sinh
- plain, algae-07 tank: "bèo tây" làm cây nổi trong bể: lục bình quá to so với bể kính, nên dùng bèo nhỏ
- plain, algae-07 tank: Đổ ngọn xoắn, trắng ngọn chủ yếu cho thiếu sắt: ngọn non xoắn, biến dạng thường do thiếu canxi/bo hoặc thiếu CO2; thiếu sắt thường làm lá non vàng nhạt chứ không xoắn
- plain, algae-07 tank: "Ốc táo: ăn rêu" — ốc táo ăn cây thủy sinh, không nên thả vào bể cây Hà Lan.
- plain, algae-07 tank: "cá chuột (cá sọc ngựa)" — cá chuột là Corydoras, sọc ngựa là cá khác, và cả hai đều không phải cá ăn rêu.
- plain, algae-07 tank: Cho rằng xoắn ngọn, trắng ngọn "thường là thiếu sắt". Thiếu sắt làm lá non vàng nhạt. Ngọn xoắn, trắng thường do thiếu canxi hoặc bo, hoặc do CO₂ và ánh sáng mất cân bằng.
- plain, algae-07 tank: Gợi ý thả bèo tây vào bể thủy sinh là không thực tế.
- plain, algae-08 post: "Có thể do bể đúc mới... Bể xi măng non": ở Việt Nam "bể đúc" thường là bể kính đúc liền khối, không phải bể xi măng, nên nguyên nhân pH do xi măng không đúng.
- plain, algae-08 post: "khoảng 26 con (... 9 mún, 5 mún đỏ)": đếm sai. Bể hiện có 10 bảy màu, 9 sọc ngựa và 5 mún đỏ, tức 24 con; 9 mún là số lúc đầu.
- plain, algae-08 post: "rau muống, bèo tây": bèo tây quá to so với bể 50cm, còn rêu java mọc chậm nên không hút được nhiều dinh dưỡng thừa.
- plain, algae-08 post: "Bể xi măng non thường làm pH tăng": in Vietnam, "bể đúc" means a seamless bent-glass tank, not a cement one.
- plain, algae-08 post: Fish count "khoảng 26 con… 9 mún, 5 mún đỏ": it double-counts the original platies. The tank now has 24 fish.
- plain, algae-08 post: "Thay 20–30% thay vì 50%… làm mất vi khuẩn có lợi": the bacteria live mainly in the filter and on surfaces, so a 50% weekly change in an overstocked tank is fine.
- plain, algae-08 post: Suggesting bèo tây (water hyacinth) for a 50cm tank is impractical, and java moss grows too slowly to soak up excess nutrients.
- plain, algae-08 tank: "để nước lắng" để giảm nitrate/phosphate: để nước lắng không làm giảm nitrate hay phosphate.
- plain, algae-08 tank: Gợi ý "ốc nhồi, ốc táo" để ăn tảo: hai loại ốc này ăn cả cây và làm bẩn nước nhanh, nên không hợp để trị tảo.
- plain, algae-08 tank: "Hút đáy mỗi tuần": bể này không có nền, nên khuyên hút đáy cho thấy câu trả lời không dùng thông tin bể.
- plain, algae-08 tank: "Đừng thay nước quá ít": người hỏi đang thay gần 100% mỗi tuần, nên vấn đề của họ là thay quá nhiều, không phải quá ít.
- plain, algae-08 tank: "nếu nước máy có nitrate/phosphate cao, hãy để nước lắng" — để lắng không làm giảm nitrate/phosphate
- plain, algae-08 tank: "Tảo nâu thường gặp ở bể... ánh sáng yếu" — đây là quan niệm cũ; tảo cát bùng chủ yếu do bể mới và silicat, không phải do đèn yếu
- plain, algae-08 tank: Gợi ý "ốc nhồi" để ăn tảo — ốc nhồi phá cây và làm bẩn bể, không phù hợp để dọn tảo trong bể kính
- plain, algae-08 tank: "Đừng thay nước quá ít: 20–30%" — người nuôi đang thay gần 100%/tuần, nên lời khuyên này lệch hẳn với tình trạng thực tế
- plain, algae-09 post: "mất điện là cá chết ngay" overstates it: a power cut is risky in a crowded tank but doesn't kill fish instantly
- plain, algae-09 post: The cement/pH point assumes a concrete tank. In Vietnam "bể đúc" often means a one-piece glass tank, and this one ran 2–3 months without trouble, so it's unlikely to be the cause
- ours, algae-09 tank: Says 'dời bể khỏi chỗ nắng chiếu', but a large cast tank can hardly be moved. It should suggest shading it with a net or awning instead.
- plain, algae-09 tank: "tảo bùng lên khi hệ vi sinh tái lập": vi khuẩn lọc phục hồi không làm tảo bùng. Đây là cơ chế bịa ra để giải thích chu kỳ 3 tuần
- plain, algae-09 tank: "bể đặt gần cửa sổ hoặc đèn bật quá 8 giờ": bể nằm ngoài ban công dưới nắng trực tiếp, nên giới hạn giờ đèn không áp dụng được
- plain, algae-09 tank: Treats a broken nitrogen cycle from cleaning the filter or changing water as the main cause. That is unlikely here: a big tank with no plants in direct balcony sun that goes green after a water change is a classic case of nutrients plus strong sunlight.
- plain, algae-09 tank: Says 'bể đặt gần cửa sổ hoặc đèn bật quá 8 giờ' and advises cutting to 6–8 hours. That ignores the real issue, which is all-day natural sun on a balcony, and the hours of light can't be controlled the way a lamp can.
- ours, algae-10 post: "Cẩm nang chưa cho tôi thông tin về việc thần tiên có ăn tép hay không": thần tiên ăn tép là điều cơ bản, và chính người hỏi đã nói vậy. Câu trả lời né đúng vấn đề họ đang gặp.
- ours, algae-10 post: "Cẩm nang chưa cho tôi thông tin về việc thần tiên có ăn tép hay không": the hobbyist already said the angelfish eat the shrimp, and the answer offers no other algae eater
- ours, algae-10 post: Says it is mostly a new-tank phase that passes by itself, without knowing how long the tank has run
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo là ốc bươu vàng/mystery snail, không phải nerite.
- plain, algae-10 post: "rêu hornwort": hornwort là rong đuôi chồn, một loại cây, không phải rêu.
- plain, algae-10 post: "Cá nhớt Siamese (cá chét đuôi đỏ)": đặt tên sai. SAE ở VN thường gọi là cá bút chì.
- plain, algae-10 post: "Cá lau kính (Otocinclus)": ở VN, cá lau kính thường chỉ pleco; Otocinclus thường gọi là cá otto.
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo is the apple snail, not a nerite, so this could lead them to buy the wrong snail
- plain, algae-10 post: "Cá nhớt Siamese (cá chét đuôi đỏ)": wrong Vietnamese name for the Siamese algae eater, so a shop would not know what they mean
- plain, algae-10 post: "rêu hornwort": hornwort is a stem plant (rong đuôi chồn), not a moss, and rau muống is an odd pick as a tank plant
- plain, algae-10 post: Blames the cause loosely on light, CO2 and nutrients without naming tảo cát (diatoms) or silicate as the main cause
- ours, algae-10 tank: Assumes 'rêu sợi nâu' is diatom that clears by itself in 3–4 weeks. It ignores that it may be filamentous algae and doesn't ask how long the tank has been running.
- ours, algae-10 tank: Tells them to 'kiểm tra xem loài cá đang nuôi có ăn tép không', but they already know their angelfish eat shrimp, so the advice doesn't help.
- ours, algae-10 tank: "nên kiểm tra xem loài cá đang nuôi có ăn tép không": the tank has angelfish, which are known shrimp eaters. It also leaves the main problem, finding a safe algae eater, unsolved.
- plain, algae-10 tank: 'Cá tỳ bà/cá Otocinclus' treats two different fish as one: tỳ bà is a pleco, and Otocinclus is usually called cá otto.
- plain, algae-10 tank: Says to use H₂O₂ at a 'liều thấp' but gives no actual dose.
- plain, algae-10 tank: Never says that angelfish are cichlids that eat shrimp. It asks which fish they keep even though the app already shows angelfish.
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus": treats two different fish as one. In Vietnam, cá tỳ bà usually means the large pleco, while Otocinclus is the small cá otto.
- plain, algae-10 tank: "nhiều loại không đẻ trứng trong nước ngọt": Nerite snails do lay eggs in freshwater. The eggs just don't hatch.
- plain, algae-10 tank: The H₂O₂ dose is given only as "liều thấp" (low dose), with no actual figure.
- plain, algae-10 tank: Asks what fish they keep, even though the tank already has angelfish (cá thần tiên), and doesn't say that angelfish are well known for eating shrimp.
- ours, algae-11 post: 'thay ít nhất 20% nước mỗi tuần' is far too little when fish are dying from an ammonia spike in a new tank. They need large water changes every day.
- ours, algae-11 post: It never mentions dechlorinating tap water or testing ammonia and nitrite before adding fish again.
- ours, algae-11 post: 'thay ít nhất 20% nước mỗi tuần' là quá ít khi amoniac đang tăng vọt và cá đang chết; lúc này cần thay nhiều và thay hằng ngày.
- plain, algae-11 post: It talks up chloramine and says to 'hỏi công ty nước'. Tap water in Vietnam is mostly treated with chlorine, so this doesn't fit well locally.
- plain, algae-11 post: 'sản phẩm có chứa sodium thiosulfate' to remove chloramine: thiosulfate alone breaks the chlorine bond but leaves the ammonia behind. You need a product that also binds ammonia.
- plain, algae-11 post: 'chất khử ghi rõ khử chloramine, ví dụ sản phẩm có chứa sodium thiosulfate': thiosulfate tách clo nhưng để lại amoniac, nên nó không xử lý hết chloramine. Hơn nữa nước máy ở Việt Nam chủ yếu khử trùng bằng clo, nên nhấn mạnh chloramine và khuyên hỏi công ty nước là ít sát thực tế.
- plain, setup-01 post: "Không thay nhiều, vì làm mất vi sinh vật có lợi": vi sinh sống chủ yếu trên vật liệu lọc, nền và bề mặt, không sống trong nước. Bể thủy sinh mới thường cần thay nước nhiều và thường xuyên để chặn rêu và amoniac từ phân nền.
- plain, setup-01 post: "khoảng 150–200kg": bể 1m đầy nước, có nền và đá, thường nặng hơn mức này, nên con số đưa ra hơi thấp.
- plain, setup-01 post: "Cả hai cách đều có cơ sở": không nói rõ rằng bật đèn liên tục 3 ngày đầu là không nên, vì dễ bùng rêu.
- plain, setup-01 post: "Không thay nhiều, vì làm mất vi sinh vật có lợi": vi sinh chủ yếu bám ở vật liệu lọc và nền, không ở trong nước, nên thay nước không làm mất vi sinh. Bể thủy sinh mới, nhất là bể dùng phân nền, thường cần thay nước nhiều trong mấy tuần đầu.
- ours, setup-01 tank: 'bể 38 lít dùng 50W hoặc 100W': this example is for a different tank and doesn't fit a 1m tank in a Hanoi winter
- ours, setup-01 tank: Admits it has no water-change guidance, so it never answers the light-schedule or water-change questions
- ours, setup-01 tank: "bể 38 lít dùng 50W hoặc 100W" – ví dụ này không liên quan đến bể 1m (khoảng 200–300 lít), nên người hỏi không có con số sưởi dùng được cho bể của mình
- ours, setup-01 tank: "đèn LED có hẹn giờ chỉ cần nếu bạn trồng cây" – người hỏi đã có 2 bóng LED; câu này không trả lời họ nên bật đèn mấy tiếng
- plain, setup-01 tank: 'không có bọt khí nhỏ bám trên lá' as a sign of CO2 deficiency is a loose sign, not a reliable one
- plain, setup-01 tank: Suggests 'amoniac nguyên chất' and Seachem Excel without saying these products are hard to find in Vietnam
- ours, setup-02 post: "0,5–1 W cho mỗi lít, tức khoảng 48–96 W": this watts-per-litre rule is outdated for LEDs, and 96 W is far too much for a low-light tank of moss and ráy. It invites algae.
- ours, setup-02 post: Suggested question "Cá la hán có sống chung với trân châu không?": in this list of plants, la hán is a plant, not the flowerhorn fish.
- ours, setup-02 post: Gọi 'la hán' là 'các loài cá trong bố cục' và gợi ý hỏi 'Cá la hán có sống chung với trân châu không?': coi một cái tên có lẽ là cây thành cá
- ours, setup-02 post: Mức 0,5–1 W/lít (48–96 W) là quy tắc cũ, quá mạnh cho hồ rêu và ráy dùng đèn LED, dễ sinh rêu hại
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar usually costs more than Chihiros, not less.
- plain, setup-02 post: "Sunsun HW-304B ... Eheim 2211": these don't fit its own 400–600 L/h target. The HW-304B pushes much more water than that, and the Eheim 2211 is too small for 96 L.
- plain, setup-02 post: "Nếu bạn định nuôi cá la hán (cichlid)": it mistakes the plant la hán for the flowerhorn fish.
- plain, setup-02 post: 'Twinstar hoặc Ista nếu muốn giá mềm hơn': Twinstar thường đắt ngang hoặc hơn Chihiros, không phải lựa chọn giá mềm
- plain, setup-02 post: 'Sunsun HW-304B' cho hồ 96 lít: máy khoảng 1400 L/h, quá dư so với mức 400–600 L/h mà chính X đề xuất
- plain, setup-02 post: Hiểu 'la hán' là cá la hán (cichlid) trong khi ở đây có lẽ là tên một loại cây trong bố cục; may là X có nói theo kiểu giả định
- plain, setup-02 post: 'Rêu Taiwan... bị bật gốc': rêu không có rễ để bật gốc, dòng mạnh chỉ làm rêu bị thổi bung khỏi lũa
- plain, setup-02 tank: '0,5–1 W/lít' is an outdated rule for LED; for 96 L it means 48–96 W, which is too much for low-light plants like rêu, ráy and la hán and invites algae
- plain, setup-02 tank: Lưu lượng '4–6 lần thể tích' is low for a planted tank, where people usually go higher to move nutrients and CO2
- plain, setup-02 tank: "0,5–1 W/lít" là quy tắc cũ của đèn huỳnh quang, không dùng được cho đèn LED, nên dễ chọn sai đèn
- plain, setup-02 tank: "4–6 lần thể tích/giờ" là thấp so với bể thủy sinh. Bể 96 lít trồng cây thường cần khoảng 10 lần để nước lưu thông và phân tán CO₂
- ours, setup-03 post: Recommends cá kim tơ as the best fit, but its own card gives 14–22 °C, which is too cool for room temperature in Vietnam without a chiller, and the card says it needs a tank of at least 60 cm, while X suggests a 35–55 L nano
- ours, setup-03 post: Says to start with a 35–55 L nano tank even though the hobbyist already owns a tank
- ours, setup-03 post: Suggests kiếm Amazon, which grows too big for a nano tank
- ours, setup-03 post: Gợi ý cá kim tơ là 'hợp nhất', trong khi thẻ loài ghi 14–22 °C. Đây là cá nước lạnh, không hợp với nhiệt độ phòng ở Việt Nam, nhất là miền Nam, khi bể không có làm mát.
- ours, setup-03 post: Gợi ý bể nano 35–55 lít, nhưng thẻ cá kim tơ lại ghi 'bể từ 60 cm', tự mâu thuẫn.
- ours, setup-03 post: Cây kiếm Amazon lớn nhanh và to, không hợp bể nano.
- plain, setup-03 post: Suggests Otocinclus for a newly set-up tank. They are delicate and need a mature tank with biofilm, so this is not ideal.
- plain, setup-03 post: Có mục máy sưởi trong ngân sách. Ở phần lớn Việt Nam, nhất là miền Nam, gần như không cần sưởi. Mục này có ghi điều kiện, nhưng vẫn ăn vào ngân sách.
- plain, setup-03 post: Cá ngọc trai (CPD) ưa nước mát, khó giữ trong nhà nóng ở Việt Nam mà không có quạt hay chiller. Câu trả lời không cảnh báo điều này.
- ours, setup-03 tank: Bảo bắt đầu bằng bể nano 35–55 lít, trong khi người hỏi đã có sẵn bể và chỉ cần mua đồ cho bể đó
- ours, setup-03 tank: Dựa vào ngân sách tham khảo 15 triệu, không khớp với 3–4 triệu của người hỏi, và không đưa ra cách chia tiền nào dùng được
- ours, setup-03 tank: Bàn chuyện chọn mua bể nano 35–55 lít trong khi người hỏi đã có bể rồi, nên phần ngân sách bị chia sai chỗ
- ours, setup-03 tank: Chỉ đưa cách chia ngân sách 15 triệu và không có danh sách đồ cần mua cho 3–4 triệu
- plain, setup-03 tank: Xếp 'trân châu' vào nhóm cây dễ cho người mới: ở Việt Nam trân châu thường cần CO₂ và đèn mạnh, bể không CO₂ hay bị bong và chết
- plain, setup-03 tank: Gợi ý tép crystal red cho người mới: tép này cần nước mềm và mát, khó giữ trong bể không làm mát ở Việt Nam
- plain, setup-03 tank: Gọi 'lọc hộp kiểu HOB' là gộp nhầm hai loại lọc khác nhau (lọc thùng và lọc treo)
- plain, setup-03 tank: "Trân châu" ghi là cây dễ cho người mới: trân châu thường cần đèn mạnh và CO₂, không dễ với bể không CO₂
- plain, setup-03 tank: "Thủy tùng (Anubias)": ở Việt Nam Anubias thường gọi là ráy, không phải thủy tùng
- plain, setup-03 tank: "crystal red" ghi là tép dọn bể dễ nuôi: tép này khó và cần nước mềm, không hợp người mới; cá bảy màu cũng không phải cá đi đàn
- plain, setup-04 post: "phủ sỏi mịn lên trên khoảng 1–2 cm để giữ nền không bị trôi": people don't usually cap aquasoil with gravel. It isn't needed, and the gravel gets mixed into the soil over time.
- plain, setup-04 post: "Rong La Hán (có thể là nhóm Rotala/Ammannia)": the species identification is uncertain, but it is clearly marked as a guess.
- plain, setup-04 post: "rêu nâu hoặc bong tróc thì thường do thiếu ánh sáng hoặc cặn bẩn": ở Việt Nam, Fissidens chuyển nâu thường do nước nóng trên 28–30°C. Câu trả lời bỏ sót nguyên nhân này, trong khi hồ để trong phòng chung cư không quạt rất dễ nóng.
- ours, setup-04 tank: Quotes 18 kg of pool-filter sand from a different sample tank. That figure isn't sized for a 60×36 cm tank, and the answer itself says so.
- plain, setup-04 tank: "Cây có rễ (Anubias...) hợp với nền giàu dinh dưỡng": ráy (Anubias) là cây bám đá/lũa. Vùi thân rễ xuống nền dễ làm thối thân.
- plain, setup-04 tank: Puts Anubias (ráy) in the 'cây có rễ' group that needs a rich substrate. Anubias is an epiphyte. It should be tied to stone or wood, and burying the rhizome rots it.
- plain, setup-05 post: "1 bóng hồng: tăng cường màu đỏ/hồng của lá cây": a pink tube mostly makes red show up stronger to the eye. Plants turn red from strong light, low nitrate and CO₂, not from the tube colour.
- plain, setup-05 post: Doesn't know Aquafor, which is a substrate brand sold in Vietnam. It hedges sensibly but gives no real verdict.
- plain, setup-05 post: Calls 2×10K + 6500K 'tốt cho phát triển rêu, ráy': 10K tubes are mainly there for looks. The 6500K tube does most of the growing.
- plain, setup-05 post: Doesn't recognise Aquafor, a common substrate brand in Vietnam, and asks the hobbyist to check the bag instead.
- ours, setup-05 tank: "0,5–1 W mỗi lít… cần khoảng 150–300 W" is far too much for a 300 L tank of modern LED and ignores the T5HO 4-tube light already in the profile
- ours, setup-05 tank: "muốn cây đỏ… nên dùng LED RGB hoặc WRGB" ignores that they use T5HO, which already includes a pink tube for colour
- ours, setup-05 tank: It offers an 18 kg pool-sand example from a different tank and never mentions the planned nền trộn + Aquafor
- ours, setup-05 tank: Says the hobbyist hasn't named their light, but they have 4×T5HO, including a pink tube for red plants. It also implies they need RGB LED
- ours, setup-05 tank: Cites 18 kg of pool-filter sand from an unrelated build. That tells them nothing about mixed substrate plus Aquafor for a 120×50 tank
- plain, setup-05 tank: It asks for the tank size and light even though the profile already has them (120×50×50, T5HO 4 bóng)
- plain, setup-05 tank: "40-60 µmol/m²/s" at the substrate is on the low side for keeping red stem plants red
- plain, setup-05 tank: Asks for tank size, light and plants, but the app already has them; it never sizes the substrate for 120×50 or judges the 4-tube T5HO
- plain, setup-05 tank: In its example, a 2 cm sand cap on a 60×30 tank is about 3.6 L × 1.5 ≈ 5.4 kg, not the 3-4 kg it states
- ours, setup-06 post: "bể này ít cây cần nền": sai, vì táo lớn và hồng thái dương là cây thân cắt cắm cần nền.
- ours, setup-06 post: "cát hạt thô hoặc sỏi vừa trồng cây tốt hơn cát quá mịn" — chỗ trống mặt tiền không trồng cây nên tiêu chí này không liên quan
- ours, setup-06 post: Không trả lời câu hỏi 2 hay 4 bóng, chỉ nói bể rộng 30 cm cần một máng
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm nhiều khi xuống đáy": nhầm số đo. Ánh sáng phải đi qua chiều cao 36 cm, còn 30 cm là chiều rộng từ trước ra sau.
- plain, setup-06 post: "Phủ cát lên Aquafor khoảng 1–2 cm" ở mặt tiền: không khớp với thiết kế. Người hỏi đã quây phân nền bằng đá cuội nên phần mặt tiền trống không có Aquafor.
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm nhiều khi xuống đáy" — 30 cm là chiều rộng trước-sau; chiều cao nước là 36 cm, nên lý do này nhầm kích thước
- plain, setup-06 post: "Nên chọn đèn LED" trong khi máng Odyssea 2/4 bóng phổ biến ở VN thường là bóng T5/T8, nên lời khuyên này lệch khỏi lựa chọn thực tế của người hỏi
- ours, setup-06 tank: Uses 'bể 60×30×30 cm (54 lít)' as its example. The hobbyist's tank is 36 cm tall (about 65 L), so the wattage range is worked out for the wrong volume.
- ours, setup-06 tank: Never answers the 2-bulb vs 4-bulb Odyssea question or the front-sand question; it just says the guide doesn't cover it.
- ours, setup-06 tank: Calculates for a 60×30×30 cm (54 L) tank, not the user's 60×30×36
- ours, setup-06 tank: Says it can't answer the front-sand question at all, which a hobbyist can answer easily
- plain, setup-06 tank: Lists 'cá hoàng kim' among digging fish that churn up the sand. That's questionable, and it doesn't apply to this tank anyway.
- plain, setup-06 tank: "cá hoàng kim" listed as a digging fish alongside cichlids: hoàng kim (swordtail) is not a digger
- plain, setup-06 tank: "phủ một lớp lưới hoặc giấy ngăn": paper rots in substrate. The usual way is to wall the soil off with rock/cuội, which this tank already does
- ours, setup-07 post: "khoảng 82% sức chứa" là con số chính xác giả tạo, không nói dựa vào đâu
- ours, setup-07 post: Trích hướng dẫn bể cho cóc bụng lửa và lọc Repto, không liên quan đến bể cá bảy màu bán cạn
- ours, setup-07 post: Mức dưới 17°C cho bảy màu là quá thấp để khuyên làm mốc an toàn
- plain, setup-07 post: "loại bớt tanin và tránh rong nâu": tanin làm nước ngả vàng, không gây rêu nâu
- plain, setup-07 post: "lanh tô phía trên chịu được tải này": bể đặt trên đáy hõm, lanh tô phía trên không chịu sức nặng của bể
- plain, setup-07 post: "lưu lượng khoảng 4–5 lần thể tích mỗi giờ": con số đoán ra từ công suất 8W, không có nguồn
- plain, setup-07 post: "Khoai lang... để rễ không bị ngập lâu": rễ khoai lang thủy canh ngập nước vẫn sống tốt
- plain, setup-07 post: "ngâm... để loại bớt tanin và tránh rong nâu": ngâm lũa giúp giảm tanin và nấm trắng, không phải để tránh rong nâu
- plain, setup-07 post: "Otocinclus" được gợi ý nhưng không nói rằng loài này cần bể đã chạy ổn định, dễ chết đói trong bể mới
- plain, setup-07 post: Nói tải đè lên lanh tô là chưa chính xác: bể đặt trên đáy hõm, nên đáy hõm mới là chỗ chịu tải chính
- ours, setup-07 tank: "Cẩm nang chưa có thông tin về bộ lọc và cây bạn định dùng": the app already lists the 8W hang-on filter, the air-pump sponge filter with ceramic media, and the plants, yet the answer asks for them again.
- ours, setup-07 tank: Asks for the filter type and plants even though the saved tank already lists the 8W hang-on filter, the air-driven sponge filter with ceramic media, and the plants (ferns, dollarweed, sweet potato vine), so its claim that it has no information is wrong.
- plain, setup-07 tank: Lists "cá bống" among fish that dig and wreck plants. A tank-cleaning goby (bống dọn bể) doesn't destroy fern, Java fern-type plants or pennywort, so this could worry the keeper for nothing.
- plain, setup-08 post: "Kính 5 ly là ổn, không quá mỏng": a tank 45 cm high with 5 mm glass is under-spec. Common thickness charts call for about 8 mm at that height, especially with substrate and rocks on the bottom pane, so it could crack or burst.
- plain, setup-08 post: "ốc táo... dọn rêu": apple snails eat soft plants and add a lot of waste, so they're a poor choice for a planted tank.
- plain, setup-08 post: "cá bảng" is not a clear or common fish name in the Vietnamese hobby.
- plain, setup-08 post: "Kính 5 ly là ổn, không quá mỏng... đủ an toàn": a 45 cm tall planted tank normally needs about 8 ly, especially with substrate, rocks and driftwood loading the bottom glass. 5 ly is a real risk of the tank bursting or leaking.
- plain, setup-08 post: "Lia thia hoặc gouramy lùn: nuôi... một cặp": male bettas or a betta pair in a community tank often fight; the advice is vague and risky.
- ours, setup-08 tank: "bể 57 lít": bể 60×45×45 cm chứa khoảng 120 lít, không phải 57 lít
- ours, setup-08 tank: "Bơm mini khoảng 300 lít/giờ đủ": chỉ khoảng 2,5 lần thể tích mỗi giờ, quá yếu cho bể khoảng 120 lít
- ours, setup-08 tank: Không gợi ý loài cá nào, dù đó là một nửa câu hỏi
- ours, setup-08 tank: "Bơm mini khoảng 300 lít/giờ đủ cho bể 57 lít": the tank is about 120 L, not 57 L
- ours, setup-08 tank: Gives no fish suggestions at all, though choosing fish was half the question
- ours, setup-08 tank: Never warns that 5 mm glass is thin for a tank 45 cm tall
- plain, setup-08 tank: Tính theo bể 60 lít, trong khi bể thật khoảng 120 lít, nên đèn, lọc và chi phí đều tính thấp
- plain, setup-08 tank: "Sưởi... cần": khí hậu Việt Nam nóng, thường không cần mua sưởi, tốn thêm tiền vô ích
- plain, setup-08 tank: "Trân châu" xếp vào nhóm cây dễ, chịu thiếu CO2: trân châu (HC Cuba) thực tế cần CO2 và đèn mạnh mới lên thảm được
- plain, setup-08 tank: "sưởi 25–300W": khoảng công suất mơ hồ, không gắn với bể này
- plain, setup-08 tank: Asks for the tank size and guesses about 60 L, but the tank is 60×45×45 cm, about 120 L, so the cost and equipment figures are sized for the wrong tank
- plain, setup-08 tank: Treats a heater as essential for most tropical fish, but Vietnam's warm climate usually makes one unnecessary, which wastes money on a budget build
- plain, setup-08 tank: Lists Trân châu (HC Cuba) as easy and cheap, but it generally needs CO₂ and strong light to grow a carpet
- plain, setup-08 tank: "Ốc Nerite... không đẻ trứng trong nước ngọt": Nerites do lay eggs in fresh water; the eggs just don't hatch
- plain, setup-08 tank: Never warns that 5 mm glass is thin for a tank 45 cm tall
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus": in Vietnam, cá tỳ bà usually means plecos or hillstream loaches, not otos. Otocinclus are also fragile and often starve in a new tank, so they are a poor pick for a low-care tank.
- plain, setup-09 tank: "1 cm cá trên 1 lít nước" is an outdated rule of thumb with no real basis.
- plain, setup-09 tank: "cá chép mini (rasbora)" is not a name Vietnamese hobbyists use for rasboras.
- plain, setup-09 tank: It suggests neons for a low-care tank without warning that they struggle in Vietnam's summer heat.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus" — ở Việt Nam cá tỳ bà là pleco, một loài lớn và thải nhiều; Otocinclus là loài khác hẳn, gộp chung dễ khiến người nuôi mua nhầm
- plain, setup-09 tank: "cá chép mini (rasbora)" — gọi rasbora như vậy là sai, người chơi Việt không dùng tên này
- plain, setup-09 tank: "1 cm cá trên 1 lít" — quy tắc này thô, không tính đến khối lượng chất thải của từng loài
- plain, setup-09 tank: Hỏi lại dung tích bể dù kích thước 170×30×35 (khoảng 178 lít) đã có sẵn
- ours, cycling-01 post: Lý do không cần sục khí là 'lọc thùng không chạy bằng máy sục khí'. Lý do này không liên quan đến chuyện bể có cần thêm oxy hay không. Bể chích CO2 thường nên sục vào ban đêm, Y không nhắc đến.
- plain, cycling-01 post: "Thay 50% nước mỗi ngày... loại bỏ amoniac và vi khuẩn": vi sinh sống chủ yếu trong lọc và nền, không phải trong nước, nên thay nước gần như không lấy mất vi sinh. Với nền nhiều chất mới setup, thay nước nhiều trong 2–3 tuần đầu lại là cách hay dùng để xả amoniac từ nền và hạn chế rêu.
- plain, cycling-01 post: "giảm xuống 1-2 lần/tuần": với nền dinh dưỡng mới, làm vậy dễ để amoniac tích lại và gây rêu hại.
- plain, cycling-01 post: Đọc "neon, 7 màu" thành một loài cá, trong khi người hỏi đang nói hai loài: neon và cá bảy màu (guppy).
- plain, cycling-01 post: Gợi ý đặt máy sục mà không dặn chỉ bật vào ban đêm. Bể có CO₂, sục cả ngày sẽ đẩy CO₂ ra khỏi nước.
- plain, cycling-01 post: "Thay 50% nước mỗi ngày làm chậm... loại bỏ vi khuẩn": vi sinh chủ yếu sống trong lọc và nền, không ở trong nước. Với nền nhiều chất mới setup, nền nhả amoniac nhiều nên thay nước thường xuyên lại là cách được khuyên dùng. Bảo giảm còn 1-2 lần/tuần ngay bây giờ là có rủi ro.
- plain, cycling-01 post: Gợi ý thả tép để thử bể: tép rất nhạy với amoniac và nền mới, không hợp để thử bể đang chạy chu trình.
- plain, cycling-01 post: Hỏi lại loại 'neon 7 màu': đọc sai câu hỏi, người hỏi muốn nói hai loài riêng là neon và cá bảy màu.
- plain, cycling-01 tank: "vài giọt nước rửa chén" làm nguồn amoniac: nước rửa chén không phải nguồn amoniac, và chất hoạt động bề mặt trong đó hại vi sinh và cá; phải dùng amoniac nguyên chất hoặc thức ăn cá
- plain, cycling-01 tank: Bảo thêm nguồn amoniac nhưng không biết bể dùng nền nhiều dưỡng, loại nền tự nhả amoniac nên không cần thêm; lại còn hỏi ngược về loại nền dù app đã có thông tin này
- plain, cycling-01 tank: "vài giọt nước rửa chén" làm nguồn amoniac: sai và có hại. Nước rửa chén là chất tẩy, không phải amoniac, nó hại vi sinh và cá. Nên dùng amoniac tinh khiết hoặc thức ăn cá.
- plain, cycling-01 tank: Hỏi lại loại nền dù bể dùng nền nhiều dưỡng. Loại nền này nhả amoniac mạnh. Thay 50% nước mỗi ngày giúp giảm amoniac nhưng cũng làm chu trình chậm lại, mà X không nhắc đến.
- ours, cycling-02 post: Recommends 'cá vàng thường' for beginners without warning that goldfish make a lot of waste and outgrow a 50cm tank
- plain, cycling-02 post: 'Cá kiếm (platy)': in Vietnam, cá kiếm means the swordtail. The platy is sold as cá hà lan/platy
- plain, cycling-02 post: 'Neon và cá vàng đều thải nhiều chất bẩn': neons produce very little waste
- plain, cycling-02 post: Says a heater is needed for tropical fish and betta, which is mostly unnecessary in Vietnam's heat
- plain, cycling-02 post: 'Cá kiếm (platy)': in Vietnam, cá kiếm is the swordtail. The platy is sold as cá hà lan or cá mún.
- plain, cycling-02 post: 'Mua máy sưởi': in most of Vietnam, room temperature already suits neon, guppy and betta, so a heater is usually unnecessary.
- plain, cycling-02 post: 'Cá vàng... thích khoảng 18-23°C': goldfish live fine at normal Vietnamese room temperature, so this overstates the clash with neon.
- plain, cycling-02 tank: "dùng nguồn amoniac như vi sinh" — vi sinh adds bacteria, not ammonia, so it can't be the ammonia source for a fishless cycle
- plain, cycling-02 tank: "để nước máy qua 24 giờ" chỉ khử được clo, không khử được cloramin (X có nêu thuốc khử cloramin như một lựa chọn khác nên lỗi nhỏ)
- ours, cycling-03 post: Câu đầu dùng "em" để tự xưng rồi lại gọi người hỏi là "em", đọc rất rối. Câu "em tạm chưa thả thêm cá" cũng không rõ ai làm gì.
- plain, cycling-03 post: "Tỳ bà bướm... có thể ăn cây non": tỳ bà bướm (hillstream loach) ăn rêu bám và màng sinh học, thường không phá cây. Y cũng không nhắc điểm quan trọng hơn: loài này cần nước mát, dòng chảy mạnh và nhiều oxy, khó giữ được trong cái nóng ở Việt Nam.
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": X hiểu nhầm. Trân châu ngọc trai/trân châu lùn là cây trải thảm, không phải sỏi, nên phần lời khuyên về nền đi sai hướng.
- plain, cycling-03 post: "Tỳ bà bướm ... có thể ăn cây non": tỳ bà bướm chủ yếu gặm rêu bám, không phá cây. Cái chúng cần là nước mát, dòng chảy mạnh và nhiều oxy, nhưng X không nhắc tới. Ở Việt Nam trời nóng nên điểm này rất quan trọng.
- plain, cycling-03 tank: "Rêu trắng... không nguy hiểm trực tiếp" — in this tank the white growth is already rotting the trân châu, so it needs the dead and rotting carpet removed, not just waiting it out.
- plain, cycling-03 tank: "trồng cây thủy sinh nếu có thể" — the tank is already planted with trân châu; it also asks for the fish species, which the tank record already holds.
- plain, cycling-03 tank: "Rêu trắng... không nguy hiểm trực tiếp": nhưng ở bể này nó đang làm thối trân châu, và phần cây thối, xác cá làm amoniac tăng thêm.
- plain, cycling-03 tank: "trồng cây thủy sinh nếu có thể": bể đã có trân châu rồi, lời khuyên này không dựa vào bể của họ.
- plain, cycling-03 tank: Hỏi lại loại cá và số lượng dù app đã có thông tin này; không nói rằng thả tép mồi làm tăng tải chất thải cho bể chưa cycle.
- ours, cycling-04 post: Says only that hang-on and canister filters don't need an air pump. That skips the real oxygen question in a new, hot Vietnamese tank where fish are already dying.
- ours, cycling-04 post: "lọc treo và lọc thùng... nên không cần máy sục khí": nói chung chung, không tính tới nước nóng ở Việt Nam và hồ mới đang chết cá, nên dễ bị hiểu là không cần sục khí.
- plain, cycling-04 post: "neon, guppy, betta thì khoảng 5–8 con": it lumps betta in with the others, but a 36 L tank should hold only one male betta. The 'tùy loài' hedge softens this a little.
- plain, cycling-05 post: 'Dùng nước đã để qua đêm' để khử clo: cách này không khử được cloramin, và nước để một đêm cũng chưa chắc hết clo.
- plain, cycling-05 post: Khuyên ngâm/luộc lũa và đặt lũa từ đầu, trong khi hồ đã châm đầy nước và đang chạy lọc.
- plain, cycling-05 post: "Ngâm lũa trước... luộc lũa vài ngày": the tank is already filled with the driftwood inside, so this step comes too late for this hobbyist
- plain, cycling-05 post: "Nên trồng sớm" cây không cần CO₂: they have already planted, so this advice doesn't fit their tank
- ours, cycling-05 tank: "giữ nước khoảng 24–26°C" (và gắn sưởi nếu dưới 24°C): mức này hơi lệch với Việt Nam. Bể thường chạy 27–30°C, và vi sinh nitrat hóa phát triển tốt hơn khi nước ấm, nên không cần cố giữ nước mát hơn.
- ours, cycling-05 tank: Câu chữ có lỗi gõ 'Ccẩm nang'. Lời khuyên gắn sưởi ít hợp với khí hậu nóng ở Việt Nam, dù có đặt điều kiện nếu nước dưới 24°C.
- plain, cycling-05 tank: "Seachem Stability… vi khuẩn nitrat hóa sống (Nitrosomonas và Nitrobacter)": Stability chủ yếu chứa Bacillus. Vi khuẩn oxy hóa nitrit chính trong bể là Nitrospira, không phải Nitrobacter.
- plain, cycling-05 tank: Gợi ý cá neon là loài "chịu được biến động" để thả đầu tiên: neon khá nhạy cảm, không hợp thả vào bể vừa chạy xong vi sinh.
- plain, cycling-05 tank: Hỏi lại kích thước bể dù app đã có sẵn thông tin bể (80×40×50, lọc thùng Atman).
- plain, cycling-05 tank: Gợi ý cá neon là loài chịu biến động để thả đầu tiên. Neon nhạy cảm với bể mới, không hợp để thả trước.
- plain, cycling-05 tank: Mô tả chung là vi khuẩn Nitrosomonas và Nitrobacter. Ở bể cá, vi khuẩn chuyển nitrit thành nitrat chủ yếu là Nitrospira.
- plain, cycling-05 tank: Kể Dr. Tim's và Tetra SafeStart, hai loại ít thấy bán ở Việt Nam, rồi còn hỏi lại kích thước bể dù đã có thông tin này.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": a bacterial bloom feeds on organic matter, not light. Cutting light only helps against algae or green water.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": light doesn't feed the heterotrophic bacteria behind the cloudy bloom. Cutting the light hours only helps against algae.
- ours, cycling-06 tank: "ngưng cho ăn khoảng 7 ngày" là quá dài nếu bể đã có cá; thường chỉ cần cho ăn rất ít hoặc nhịn 2–3 ngày
- plain, cycling-06 tank: "ammonia tinh khiết" for dosing: pure ammonia is hard to find in Vietnam, where keepers use amoni clorua, and the answer doesn't warn against doing this with fish in an 8 L tank
- plain, cycling-07 post: "Thay nước 2-3 ngày một lần thường là không cần thiết": phân nền mới nhả nhiều amoni trong những tuần đầu, nên thay nước thường xuyên lúc đầu là đúng, không thừa.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": vi sinh bám trên nền, cây và bề mặt chứ không sống trôi trong nước, nên thay nước không làm mất vi sinh.
- plain, cycling-07 post: "thay 20-30% nước mỗi 1-2 tuần" cho bể phân nền mới set: quá thưa, dễ bùng rêu và tích amoni.
- plain, cycling-07 post: Gợi ý trồng rau muống nước trong hồ thủy sinh để phòng ngủ là không thực tế.
- plain, cycling-07 post: "Thay nước 2-3 ngày một lần thường là không cần thiết" / "thay 20-30% nước mỗi 1-2 tuần": a tank set up today on aqua soil leaches ammonia, so frequent large water changes in the first weeks are standard practice to head off algae
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": beneficial bacteria live on surfaces and in the substrate, not in the water column
- plain, cycling-07 post: "Đặt bơm khí ở phòng khác": impractical for a bedroom tank and needs very long air tubing
- ours, cycling-07 tank: "Cẩm nang không nói về việc vệ sinh lọc" – hiểu sai câu hỏi: bể không có lọc, người hỏi muốn dùng thay nước thay cho lọc, không phải hỏi chuyện vệ sinh lọc
- ours, cycling-07 tank: "Cẩm nang không nói về việc vệ sinh lọc": Y cũng hiểu câu hỏi là chuyện vệ sinh lọc, nên không nói gì về việc bể này không có lọc và không có sủi.
- plain, cycling-07 tank: Hiểu "thay cho lọc" là thay cho việc vệ sinh lọc, trong khi bể không có lọc, nên phần hướng dẫn rửa vật liệu lọc không dùng được
- plain, cycling-07 tank: "Nếu chưa có cá, không cần thay nước quá nhiều" – bể mới dùng phân nền nhả nhiều amoniac và dinh dưỡng, nên tuần đầu cần thay nước nhiều để chặn rêu hại
- plain, cycling-07 tank: Hiểu "thay cho lọc" là thay cho việc vệ sinh lọc, trong khi bể không có lọc. Cả câu trả lời nói về cách vệ sinh lọc, không trả lời được câu hỏi bể không lọc có ổn không.
- ours, cycling-08 post: Says the Sobo 400 l/h 'là đủ' while quoting a 100–130 l/h target and a warning about oversized filters. At about 12 times the tank's volume per hour, that same guide would call it oversized, and X never says to turn the flow down.
- plain, cycling-08 post: 'để nước qua lọc/phơi khoảng 24 giờ': running water through a filter doesn't reliably remove chlorine, and letting it stand doesn't remove chloramine.
- plain, cycling-08 post: 'ngâm nước 1-2 tuần' for new cement may be too short for the lime to stop leaching. The hobbyist needs to keep testing pH before adding fish.
- plain, cycling-08 post: Gợi ý 'bèo tây' (lục bình) cho bể khoảng 30 lít là không hợp vì cây quá to, nhưng đây chỉ là lỗi nhỏ.
- plain, cycling-08 post: Viết 'thức ăn cho cá mục' nghe lủng củng; ý đúng là để thức ăn tự phân hủy trong bể, nhưng câu dễ gây hiểu nhầm.
- plain, cycling-08 tank: Asks for the tank volume and filter type even though the app already holds them (about 32 L, Sobo 400 l/h waterfall filter), so the filter question is left unanswered.
- plain, cycling-08 tank: Lists 'thả cá từ từ' and light feeding as ways to speed up the cycle. They make cycling safer but do not speed it up.
- ours, sick-01 post: Species card's 18–25 °C range is presented without comment, but it doesn't fit tanks in Vietnam, which usually run warmer, and the answer doesn't address this.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này" is overstated. Zebra danios kept for about 3 years often develop age-related spinal curvature (scoliosis).
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này... chứ không cong người" — cá ngựa vằn già (khoảng 3 năm) rất hay bị cong cột sống do lão hóa, nên tuổi già vẫn là một nguyên nhân có thể
- plain, sick-01 post: "Columnaris... gây cong người" — columnaris gây mòn vây, đốm trắng, chết nhanh, không phải nguyên nhân thường gặp của cong cột sống
- ours, sick-01 tank: Đưa ra dải nhiệt 18–25°C mà không lưu ý rằng bể ở Việt Nam thường nóng hơn mức này; cá ngựa vằn vẫn sống tốt ở 26–28°C, nên con số này có thể khiến người nuôi lo lắng không cần thiết
- plain, sick-01 tank: Nodavirus (VNN) is listed as a common cause, but it is mainly a marine and farmed-fish disease and is unlikely in a home zebra danio tank
- plain, sick-01 tank: "lý tưởng khoảng 26–28°C" is on the warm side for zebra danio, and it contradicts the 18–25°C range on the species card
- plain, sick-01 tank: It never mentions that fish nearly 3 years old bend their spines from old age, which is a likely cause here
- plain, sick-01 tank: Đưa Nodavirus (VNN) vào nhóm 'phổ biến nhất' là quá mức: bệnh này chủ yếu gặp ở cá biển nuôi, hiếm khi là nguyên nhân ở cá ngựa vằn nuôi cảnh
- ours, sick-02 post: Puts low oxygen first, but the hobbyist runs an air pump 24/7, so it is an unlikely cause here.
- ours, sick-02 post: Warns about only topping up without removing old water, which the hobbyist never said they do.
- ours, sick-02 post: Says the guide has nothing on washing the filter sponge in tap water and gives no view on it, which skips the most likely cause.
- ours, sick-02 post: Nói về việc "chỉ châm thêm nước cho đầy mà không rút nước cũ" như một nguyên nhân, trong khi người hỏi không làm vậy; ngược lại bỏ qua nguyên nhân rõ nhất là giặt mút lọc bằng nước máy
- plain, sick-02 post: Says tap water in many places uses chloramine. Vietnamese tap water is mostly treated with chlorine, so this warning matters little here, though it is hedged.
- plain, sick-02 post: The 100–200 nghìn đồng price for a test kit fits test strips. A liquid kit like API usually costs more in Vietnam.
- plain, sick-02 post: "nước máy ở nhiều nơi dùng chloramin": nước máy ở Việt Nam chủ yếu khử trùng bằng clo, không phải chloramin, nên câu này dễ làm người đọc lo không cần thiết
- plain, sick-02 post: "bộ test... khoảng 100–200 nghìn đồng": giá này chỉ đúng với que thử; bộ test dạng nhỏ giọt (amoniac/nitrit/nitrat/pH) thường đắt hơn nhiều
- ours, sick-02 tank: Puts dissolved oxygen first ("Oxy đứng đầu danh sách") even though this tank runs a filter and air pump 24/7, so it points the hobbyist away from the likelier causes. It also asks for a lab-style set of tests (DO in mg/L and % saturation, salinity, free and total chlorine) that a home hobbyist can't realistically do.
- ours, sick-03 post: Nhắc lá non xoắn do thiếu canxi hoặc nước mềm, trong khi bể có GH 8 và TDS 360, nên trích đoạn này không liên quan và dễ làm người hỏi hiểu sai.
- ours, sick-03 post: Bảo người hỏi xem lại chuyện lột xác trước khi nghĩ đến nước là gạt đi mất khả năng do nước hoặc độc tố, dù cá cũng đang chết.
- ours, sick-03 post: Points to young leaves curling from soft water or low calcium, which doesn't fit GH 8 (hard water)
- ours, sick-03 post: Puts the shrimp deaths down to failed molts before looking at the water, which skips ammonia, nitrite and copper
- plain, sick-03 post: Đọc nhầm 'cá tầm 1-2 tuần chết 1 con' thành tên một loài cá 'tầm', trong khi 'tầm' ở đây nghĩa là 'khoảng'.
- plain, sick-03 post: Câu 'drop checker xanh vàng là đủ' viết mơ hồ: thực ra màu xanh lá mới là đủ CO2, còn màu vàng là dư.
- plain, sick-03 post: Câu 'ráy thích ít dinh dưỡng trong nước' chỉ là ý kiến, chưa có căn cứ chắc chắn.
- plain, sick-03 post: "Otto, pygmy và tầm (nếu là loài nhạy cảm)": reads "tầm" as a fish, but here it means "about", as in "about 1-2 weeks"
- plain, sick-03 post: "CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển": 12 ppm is on the low side for a CO2 tank. The usual target is about 20-30 ppm, a pH drop of about 1.
- plain, sick-03 tank: Tập trung vào tép Caridina (Crystal, Bee) trong khi tép màu thường là Neocaridina, vốn chịu tốt GH 8, KH 4, nên lời giải thích về độ cứng ở đây ít liên quan
- plain, sick-03 tank: Answer centres on Caridina (Crystal, Bee). The hobbyist keeps tép màu, which are usually Neocaridina, and GH 8 with TDS 360 is within what those tolerate.
- ours, sick-04 post: Applies the 'pH tụt' (falling pH) guide even though the tank's pH is high (8.4)
- ours, sick-04 post: "Tắt CO2" would push an already high pH even higher and doesn't fix the problem
- ours, sick-04 post: Never names the white limestone/high KH as the reason pH won't drop
- ours, sick-04 post: Uses a guide for when pH crashes, but this tank's pH is high (8.4). 'Tắt CO2' would push pH even higher and goes the wrong way.
- ours, sick-04 post: Quotes 'mỗi giờ pH chỉ nên tăng tối đa 0,3–0,5' as if pH needed raising. That doesn't apply here.
- ours, sick-04 post: Doesn't mention the KH that the white da voi rock (limestone) is releasing. That is why CO₂ can't bring pH down.
- plain, sick-04 post: Reads 'vảy ốc xanh/đỏ' as snails (Neritina), but they are Rotala stem plants, so the whole snail section is wrong
- plain, sick-04 post: Tắt đèn vài ngày for a carpet that is already melting is debatable, and a 40-50% change in one go is quite a lot
- plain, sick-04 post: Treats 'vảy ốc xanh/đỏ' as Neritina snails with damaged shells; these are Rotala plants (vảy ốc), and the 'gãy ngang ngọn lá' is leaf damage on the plant, not on a shell.
- plain, sick-04 post: Doesn't connect the shrimp deaths within 10 seconds to a sudden chemistry change from the media. Ammonia can't build up that fast.
- ours, sick-04 tank: Never says to take out the newly added pH-lowering filter media, which is still dropping the pH and is the most important first step.
- ours, sick-04 tank: Never says to take the Neo Soft out of the filter, so whatever caused the shock keeps working on the water
- ours, sick-04 tank: The excerpt treats this as a crash to low pH that must be brought back up ('pH vẫn thấp…'), but this tank was at pH 8.4. The likely harm is the sudden swing, not pH ending up too low
- ours, sick-05 post: Puts the brown water down to tannin without knowing there's driftwood or catappa leaves in the tank, and never mentions that bottled water has almost no minerals, which is the likely cause of the deaths
- ours, sick-05 post: The excerpt says 'thay ít nhất 50% nước' (change at least 50%), which is what the hobbyist is already doing and isn't working
- ours, sick-05 post: Assumes tannin from driftwood or Indian almond leaves even though the hobbyist never mentioned either, and misses the more likely cause: bottled water with almost no minerals being changed at 50% every other day
- ours, sick-05 post: Tells the hobbyist to measure dissolved oxygen first, which few hobbyists in Vietnam have a test for
- plain, sick-05 post: 'không thể gây cá chết hàng loạt' (tannin can't cause mass deaths) is too absolute, though the point is mostly right
- ours, sick-05 tank: Blames old tank syndrome, which builds up over months or years. This tank has only run 8.6 weeks.
- ours, sick-05 tank: Says to change more water, but they already change 50% every other day.
- ours, sick-05 tank: Chẩn đoán "hội chứng bể cũ" tích tụ qua nhiều tháng, nhiều năm, trong khi bể mới chạy 8,6 tuần
- ours, sick-05 tank: Khuyên tăng lượng nước thay (ví dụ từ 10%/tuần), trong khi người nuôi đã thay 50% cách ngày
- ours, sick-05 tank: Trích đoạn về sắp xếp lịch chăm bể không liên quan đến cá chết
- plain, sick-05 tank: Tells them to change 30–50% with dechlorinated water and blames chlorine in tap water. They already use bottled drinking water, so it misses that very soft bottled water with CO₂ can crash pH and KH.
- plain, sick-05 tank: "Tảo silic... làm nước đục màu nâu": tảo nâu bám lên kính và nền, thường không làm cả cột nước ngả nâu
- plain, sick-05 tank: Nghi nước máy chưa khử clo là nguyên nhân, trong khi bể này thay bằng nước lọc đóng bình. Câu trả lời bỏ qua khả năng nước uống đóng bình có KH/GH gần 0, khiến pH tụt mạnh khi chạy CO₂
- ours, sick-06 post: Đoạn trích về chọn cá bạn và cách ly không liên quan: bể của bạn này chỉ có 2 con rồng và cá mồi.
- ours, sick-06 post: 'Cho ăn giun sống' mà không cảnh báo nguy cơ mang ký sinh trùng vào bể. Mốc 'quá một tuần' cũng không giúp gì, vì cá đã nhịn gần một tuần rồi.
- ours, sick-06 post: Không nhắc tới khả năng bể mới chưa chạy vi sinh, là nguyên nhân có khả năng cao nhất.
- ours, sick-06 post: Đoạn trích đầu tiên nói về chọn và cách ly cá bạn, không liên quan đến chuyện chuyển bể, còn lời khuyên "tách cá sớm" thì không hợp với hai con rồng đang bơi bình thường
- ours, sick-06 post: Nói rồng "thường ăn lại sau khoảng một tuần" trong khi cá đã nhịn gần đúng một tuần. Câu này không giúp được gì và bỏ qua khả năng bể mới chưa chạy vi sinh
- ours, sick-06 tank: Says 'nâng nhiệt độ nước lên một chút' with no target or limit. Raising the temperature in a new, uncycled tank lowers oxygen and makes ammonia more toxic.
- ours, sick-06 tank: The first excerpt, on choosing tankmates for an arowana, is off-topic for a fish that has stopped eating.
- ours, sick-06 tank: "nâng nhiệt độ nước lên một chút" — in a 1-week-old, probably uncycled tank, warmer water raises the toxic share of ammonia (NH₃) and lowers oxygen, and Vietnamese room heat rarely calls for it
- ours, sick-06 tank: First excerpt on choosing tank mates is off-topic for a fish refusing food after a tank move
- ours, sick-08 post: Đưa ra 'không chịu ăn thức ăn viên nên yếu dần' làm nguyên nhân, nhưng chết đói phải mất nhiều ngày đến vài tuần, không thể làm cả 3 con chết chỉ sau một đêm
- ours, sick-08 post: 'Nhỏ giọt khoảng 4–5 tiếng' là quá lâu so với cách làm thông thường (khoảng 1–2 tiếng)
- ours, sick-08 post: Gives starvation of wild-caught otto, which won't eat pellets, as a main cause. Starving takes days to weeks, so it can't explain three fish dying the first night.
- plain, sick-08 post: Coi thiếu oxy ban đêm là 'khả năng cao nhất' mà không có căn cứ, trong khi neon cùng bể vẫn khỏe; với ca chết trong một đêm, sốc khi thả hoặc hóa chất diệt rêu nhiều khả năng là nguyên nhân hơn
- plain, sick-08 post: Calls lack of oxygen at night 'khả năng cao nhất', but the hobbyist gives no sign of low oxygen. Overnight deaths of fish that were just added point more to acclimation shock or chemicals.
- ours, sick-08 tank: Câu "chết khi bể không đủ rêu" không giải thích được cá chết sau một đêm: chết đói phải mất nhiều ngày đến nhiều tuần, mà bể này còn đang có rêu hại.
- ours, sick-08 tank: "để cá làm quen nước 4–5 tiếng" là quá lâu và không có lý do kèm theo. Nhỏ giọt khoảng 1–2 tiếng là đủ.
- ours, sick-08 tank: Đổ cho otto bắt tự nhiên chết đói vì bể không đủ rêu: cá chết đói phải mất nhiều ngày đến vài tuần, không thể chết sau một đêm, huống chi bể này đang có rêu hại
- ours, sick-08 tank: "làm quen nước 4–5 tiếng": quá lâu và không có lý do; để cá trong túi lâu như vậy thì amoniac tích tụ, cá còn yếu thêm
- plain, sick-08 tank: Phần nhắc otto nuôi đơn lẻ một hai con dễ stress là thừa, vì hồ này có 3 con, nên nguyên nhân này không áp dụng.
- plain, sick-08 tank: "Nuôi một hai con đơn lẻ dễ bị stress": họ thả 3 con, và việc nuôi lẻ cũng không làm cá chết sau một đêm, nên ý này không giải thích được chuyện xảy ra
- ours, stocking-02 post: Không biết "mún" là cá platy, loài rất phổ biến ở Việt Nam, rồi không trả lời gì cả
- ours, stocking-02 post: Gives no answer at all: it says it couldn't find 'mún' and only points the hobbyist to the neon page. A Vietnamese keeper would know mún is the platy.
- plain, stocking-02 post: Không nhận ra "mún" là cá platy (Xiphophorus), một loài hiền. Lại gợi ý mún có thể là cá rô, betta đực, nên người đọc dễ hoang mang không cần thiết
- plain, stocking-02 post: Nói 20-30 neon là vừa cho hồ 96 L là hơi khắt khe. Nếu thả từ từ thì 40 neon vẫn nuôi được về lâu dài
- plain, stocking-02 post: Nhiệt độ 22-26°C khó giữ ở Việt Nam mà không có chiller. Neon vẫn chịu được 27-28°C, nhưng câu trả lời không nhắc đến
- plain, stocking-02 post: Doesn't recognise 'cá mún' as the platy, a peaceful livebearer that lives fine with neons. Instead it hedges that mún might be a carnivore like cá rô or a male betta, which leaves the hobbyist unsure about something that's actually safe.
- plain, stocking-02 post: Gives neons 22-26°C, a range most Vietnamese tanks can't hold without a chiller. Neons cope with 26-28°C, so it should have spoken to the local heat.
- plain, stocking-03 post: 'Tránh cá đàn lớn như ... cá lia thia' — lia thia là cá sống đơn lẻ, họ hàng cá xiêm, không phải cá đàn; nó cũng hợp với bể nhỏ này
- plain, stocking-03 post: 'không hút cá nhỏ vào như lọc hộp' — lọc hộp không hợp với bể 15 lít; ở đây đúng ra phải so với lọc thác hoặc lọc treo
- plain, stocking-03 post: "Tránh cá đàn lớn như neon, cá chuột, cá lia thia": lia thia is a solitary fighting fish (the betta/paradise-fish type), not a schooling fish, so it does not belong in this list
- plain, stocking-03 post: "cá tỉ muội" is not a common Vietnamese hobby name, so the reader may not know which fish is meant
- ours, stocking-04 post: "nguyên nhân ... chết dần chưa rõ": it notes the slime-sucking habit but doesn't link it to the deaths. A grown algae eater latching onto slow guppies, platies and swordtails is the most likely cause.
- ours, stocking-04 post: Says "nguyên nhân... chưa rõ" even though the fact it just quoted (bống vàng latches onto other fish's slime coat) explains the slow deaths.
- ours, stocking-04 post: The quoted section on vacuuming and light hours has nothing to do with this question.
- plain, stocking-04 post: Treats bống vàng as a generic goby, but in the Vietnamese hobby it is the golden algae eater (Gyrinocheilus). That leads to "khả năng cao cá chết không phải do bống", which is likely wrong.
- plain, stocking-04 post: "cá bạc má" is a sea mackerel, not an aquarium fish.
- plain, stocking-04 post: Suggesting neon and lòng tong as tankmates ignores the adult algae eater's habit of harassing fish and sucking their slime.
- plain, stocking-04 post: Assumes the other fish weren't fed. The hobbyist only said the bống didn't need feeding.
- plain, stocking-04 post: "khả năng cao cá chết không phải do bống": in Vietnam, cá bống vàng is the golden Chinese algae eater, which is well known for latching onto other fish and eating their slime coat as it grows. That is the most likely reason the platies, swordtails and guppies died one by one.
- plain, stocking-04 post: Treats it as a true goby ("tính lãnh thổ", "ăn tôm con") and misses that this fish sucks onto other fish.
- plain, stocking-04 post: Suggests "cá bạc má nhỏ" as a tankmate, but bạc má is a sea mackerel, not an aquarium fish.
- plain, stocking-04 tank: "cá kiếm (platy)" – ở VN cá kiếm là swordtail, platy là cá hà lan
- plain, stocking-04 tank: "cá hồng kim (neon tetra)" – hồng kim là platy/kiếm đỏ, neon tetra là cá neon
- plain, stocking-04 tank: Recommends guppy and swordtail again, though these already died in this tank, and never mentions the bống vàng (Chinese algae eater) that sucks other fish's slime
- plain, stocking-04 tank: "cá heo nhỏ" is listed as a big predatory fish, which is a confusing name to use here
- plain, stocking-04 tank: "cá kiếm (platy)": cá kiếm là swordtail, còn platy là cá mún
- plain, stocking-04 tank: Gợi ý bảy màu, mún, kiếm, nhưng chính những loài này đã chết dần trong bể có bống vàng
- plain, stocking-04 tank: "cá heo nhỏ" bị xếp vào nhóm cá ăn thịt lớn là sai: cá heo (botia) không phải cá săn mồi
- ours, stocking-05 post: It cites the koi page saying it is a 'misconception' that koi and goldfish can't live together, which goes against what is happening in this tank and leaves the reader unsure what to do.
- ours, stocking-05 post: Trích trang koi nói chuyện koi và cá vàng không nuôi chung được là "hiểu lầm". Câu này dễ làm người nuôi nghĩ chép với cá vàng vẫn thả chung được, trong khi cá vàng của họ đã bị chép giết.
- plain, stocking-05 post: 'Cá chép thường hung hăng' is overstated. Carp aren't truly aggressive; mostly they push in and take the food, and they grow too big for the tank.
- plain, stocking-05 post: A salt bath at 3-5 g/L for only 10-15 minutes is too weak to do much at that short time. It is harmless, but the dose and timing don't fit together.
- plain, stocking-05 post: The answer calls itself 'em' at the start and 'anh/chị' at the end, which reads awkwardly.
- plain, stocking-05 post: "Cá chép thường hung hăng, hay rượt và cắn vây": chép thường không hung dữ đến vậy. Vấn đề chủ yếu là chép to, khỏe và giành ăn, nên bắt nạt cá vàng.
- plain, stocking-05 post: "3-5 g muối/lít trong 10-15 phút": nồng độ này hợp để ngâm lâu. Nếu chỉ tắm ngắn 10-15 phút thì quá nhẹ, ít tác dụng (nhưng không gây hại).
- ours, stocking-05 tank: "cá koi có thể ăn cá vàng": koi doesn't usually eat goldfish, and certainly not a 20 cm goldfish. The real problem is chasing, ramming and fin nipping, plus the tank being too small for carp.
- ours, stocking-05 tank: It swaps cá chép for koi and treats the 90 cm adult size as if the carp were that big now. The likely cause in this tank is left wrong.
- ours, stocking-05 tank: Treats the common carp as koi, a different fish, instead of answering about the cá chép the reader actually has
- ours, stocking-05 tank: "cá koi có thể ăn cá vàng": koi rarely eat adult goldfish. The likely cause is chasing, bumping and fighting over food
- ours, stocking-05 tank: "Cá vàng hay cắn vây cá khác" doesn't fit this case, because here the carp is the one attacking
- plain, stocking-05 tank: "thuốc xanh methylen hoặc muối (liều nhẹ)": it gives no dose, so the hobbyist can't act on it safely.
- plain, stocking-05 tank: "muối (liều nhẹ)" gives no dose, so the reader can't act on it safely
- plain, stocking-05 tank: Puts the death down to attacks only and never mentions that a new, unquarantined fish can bring in disease, which could also have killed the goldfish
- ours, stocking-06 post: Không trả lời câu nào, chỉ nói chưa mở được trang. Trong cùng một câu trả lời lúc xưng 'em', lúc lại gọi người đọc là 'anh/chị'.
- plain, stocking-06 post: "Cá mẹ thường ăn chính cá con": không chỉ cá mẹ, mà cả cá kiếm và các con trưởng thành khác trong bể cũng ăn cá con, nên tách riêng cá mẹ thôi chưa đủ giải thích vì sao phải bảo vệ cá con.
- plain, stocking-06 post: "bèo tây": bèo tây to và không hợp với bể cubic nhỏ; nên dùng rêu, bèo Nhật hoặc cây rậm thì hợp hơn.
- plain, stocking-06 post: Gợi ý 'bèo tây' làm chỗ trốn cho cá con: bèo tây (lục bình) quá to, không hợp với bể cubic nhỏ. Nên dùng bèo Nhật, rong đuôi chó hoặc rêu.
- plain, stocking-06 post: Không nói rằng cá kiếm cũng ăn cá con và có thể quá to so với bể cubic nhỏ.
- ours, stocking-06 tank: The first excerpt is from a guppy (cá bảy màu) guide, not a platy guide, and its timing advice ('ngày 18–25 của thai kỳ') is guppy-specific and contradicts the answer's own advice.
- plain, stocking-06 tank: 'nhiệt độ khoảng 24–27°C' is hard to hold in Vietnam's heat, and platy do fine at 28–30°C. This is a minor issue.
- plain, stocking-06 tank: "nhiệt độ khoảng 24–27°C" sits below normal room-temperature tanks in Vietnam (28–30°C), and platies handle that heat fine, so the reader may think they need to cool the tank
- ours, stocking-07 post: Reads "sóc đỏ" as "chạch sóc đuôi đỏ", an aggressive fin-nipper. In Vietnam, "cá sóc" means small, peaceful schooling rasboras.
- ours, stocking-07 post: Says 6 neon and 6 sóc fill an 84 L tank to 79%. That badly understates what the tank can hold.
- ours, stocking-07 post: "chạch sóc ưa 15–21°C" is a cold-water range that doesn't fit the fish the hobbyist means, and it contradicts the neon range given in the same answer.
- ours, stocking-07 post: Reads 'sóc đỏ' as 'chạch sóc đuôi đỏ' (red-tailed shark/loach). That is almost certainly not the fish the hobbyist means.
- ours, stocking-07 post: 'chạch sóc ưa 15–21°C': this is a cold-water range that doesn't fit a red-tail shark or Vietnamese water temperatures. It looks made up.
- ours, stocking-07 post: '6 neon và 6 chạch sóc ... 79% tải': putting 12 small fish in an ~84 L tank is nowhere near 79% of its capacity, so the figure is wrong.
- ours, stocking-07 post: Recommends a group of 6 or more red-tailed sharks, a fish that is territorial toward its own kind. Keeping six together in a 60 cm tank leads to fighting.
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": in Vietnam, Corydoras are called cá chuột, not cá sóc. The answer does ask the hobbyist to confirm the species.
- plain, stocking-07 post: 'Sóc đỏ (cá Corydoras)': in Vietnam, Corydoras are called 'cá chuột'. 'Sóc' usually means a rasbora or rummy-nose type (e.g. 'sóc đầu đỏ'), so the identification is probably wrong. X does ask the hobbyist to confirm the species, which softens this.
- plain, stocking-07 post: '23-26°C' is low for Vietnam: tanks there sit at 28-30°C most of the year unless chilled, and X doesn't mention this.
- ours, stocking-07 tank: Reads "sóc đỏ" as chạch sóc đuôi đỏ, a botia that is aggressive and grows large. Six of them in an 84 L tank (60×35×40 cm) is risky, but the answer calls the stocking 'vừa phải'.
- ours, stocking-07 tank: It gives only the minimum of 6 of each fish. It never says the most the tank can hold, which is what the hobbyist asked.
- ours, stocking-07 tank: Chỉ đưa con số tối thiểu (6+6) mà không nói bể này chứa tối đa được bao nhiêu con, trong khi đó mới là điều người hỏi muốn biết.
- ours, stocking-07 tank: Mức 79% cho 12 con cá nhỏ trong khoảng 84 lít nghe hơi cao. Con số này đến từ công cụ mà không giải thích cách tính.
- plain, stocking-07 tank: Equates 'cá sóc' with Corydoras. In Vietnam, Corydoras is called cá chuột.
- plain, stocking-07 tank: '10 con neon cho mỗi 20 lít' is too dense and has no basis.
- plain, stocking-07 tank: Adds red cherry shrimp, which the hobbyist didn't ask about.
- plain, stocking-07 tank: Asks for the tank volume and guesses about 60 L. The actual tank is about 84 L.
- plain, stocking-07 tank: Gọi Corydoras là 'cá sóc': dân chơi Việt Nam gọi Corydoras là 'cá chuột', không phải 'sóc'.
- plain, stocking-07 tank: Đề xuất cho 'bể khoảng 60 lít' và hỏi dung tích, trong khi bể 60×35×40 cm chứa khoảng 84 lít.
- plain, stocking-07 tank: '10 con neon cho mỗi 20 lít' là mật độ quá dày để làm quy tắc chung.
- ours, stocking-08 post: "cá nổi đớp khí dù sủi vẫn chạy": câu này mặc định bể có sủi, trong khi người hỏi không nhắc tới sủi.
- plain, stocking-08 post: "Giảm số cá xuống khoảng 3-4 con nếu là loài nhỏ (neon...)": 3–4 con trong 4 lít vẫn là quá dày, và cá neon là cá bầy, cần bể lớn hơn nhiều
- plain, stocking-08 post: "máy sưởi mini có điều nhiệt": ở Việt Nam bể trong nhà gần như quanh năm đủ ấm, nên sưởi thường không cần. Lời khuyên này bê nguyên từ tài liệu nước ngoài.
- plain, stocking-08 post: "3-4 con" trong 4 lít vẫn là nhiều, kể cả cá nhỏ, và con số này không kèm cách tính.
- plain, stocking-08 tank: Asks for the tank size even though the app records it as 4 L. Its conclusion, 'nếu bể khoảng 40-60 lít… 7-8 con có thể ổn', has nothing to do with this 4 L tank, so it reads as reassurance the hobbyist shouldn't get.
- plain, stocking-08 tank: Its overload warning starts at 'bể nhỏ dưới 30 lít'. That is too vague for a 4 L tank holding 7-8 fish after only one week, where ammonia can build up quickly.
- ours, stocking-09 post: "nên nuôi đàn từ 6 con": in a 126 L tank, a pair of angelfish is the normal choice. Six adults would overcrowd it.
- ours, stocking-09 post: "cần bể dài từ 100 cm": this is too strict. For angelfish, tank height matters more, and 80 cm is long enough for a pair.
- ours, stocking-09 post: "Mức đầy bể: 84%": a stocking figure with no basis given, and it contradicts the "not suitable" verdict.
- ours, stocking-09 post: "nên nuôi đàn từ 6 con" is wrong advice for a 126-litre tank: 6 adult angelfish need much more water, and a pair is the usual and correct choice here
- ours, stocking-09 post: "cần bể dài từ 100 cm" is too strict: 2 angelfish do well in an 80 cm, 126-litre tank
- ours, stocking-09 post: A flat "không nên nuôi chung" ignores the common practice of putting adult neons in with young angelfish that grow up with them
- plain, stocking-09 post: "bổ sung thêm neon để chia đều sự chú ý": more neons just means more prey for the angelfish. It doesn't lower the risk.
- plain, stocking-09 post: "45 cm là đủ": this is borderline. Full-grown angelfish with long fins need a tank 45–50 cm tall or more.
- plain, stocking-09 post: "trạch, mơ" are unclear plant names that most Vietnamese hobbyists would not recognise as aquarium plants
- plain, stocking-09 post: "45 cm là đủ cho một cặp" is borderline: once substrate is in, the water column is under 40 cm, which is tight for adult angelfish with full fins
- ours, stocking-09 tank: "nên nuôi đàn từ 6 con" — cá ông tiên nuôi cặp hoặc nhóm nhỏ là bình thường; 6 con trưởng thành thì bể 80 hay 100 cm đều quá chật
- ours, stocking-09 tank: "Không nên nuôi chung" plus "Bể 80 cm của bạn cũng chưa đủ" — bể 80×35×45 (~126 L) cao 45 cm vẫn đủ cho 1 cặp ông tiên; ông tiên với neon là combo phổ biến, chỉ cần thả neon trước khi ông tiên lớn
- ours, stocking-09 tank: "Mức đầy bể: 84%" — con số tính ra mà không giải thích dựa vào đâu
- ours, stocking-09 tank: "nên nuôi đàn từ 6 con" (keep a group of at least 6 angelfish): adult angelfish do not need to be kept in a group of 6, a pair is normal, and 6 adults would overload this tank.
- ours, stocking-09 tank: Says the 80 cm tank is not enough because it needs 100 cm. That is too strict: an 80×35×45 tank holds about 126 L and is 45 cm tall, which keeps 2 angelfish fine.
- ours, stocking-09 tank: A flat "không nên nuôi chung" overstates the risk. Angelfish with neon tetras is a common combo when the fish are added while the angels are young and there are plants to hide in.
- plain, stocking-09 tank: "Nếu bể nhỏ hơn 80 lít thì nên cân nhắc lại" contradicts its own minimum of 100 L; it is confusing, not dangerous.
- ours, stocking-10 post: "Không nên nuôi chung... thường phải nuôi riêng": quá cứng nhắc. Một con betta trong bể ~65 L với đàn neon là kiểu ghép phổ biến và thường ổn
- ours, stocking-10 post: "Mức đầy bể: 36%": con số có vẻ chính xác nhưng không giải thích cách tính
- ours, stocking-10 post: Thẻ loài ghi "tính aggressive" bằng tiếng Anh
- ours, stocking-10 post: 'Không nên nuôi chung... thường phải nuôi riêng': nói quá tuyệt đối. Betta chủ yếu hung dữ với betta khác, còn nuôi chung với đàn neon trong bể 65 lít nhiều cây thì thường vẫn ổn nếu chịu theo dõi
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon": neon đã có sẵn trong bể, nên lời khuyên này ngược. Thả betta vào sau cùng thì nó ít giữ lãnh thổ hơn
- plain, stocking-10 post: "thường dùng máy sưởi là hợp lý": ở khí hậu Việt Nam thường không cần sưởi, trừ mùa lạnh ở miền Bắc
- plain, stocking-10 post: 'Nên thả betta vào trước... rồi mới thả neon': ở đây neon đã có sẵn trong bể, và thường người ta thả betta sau cùng để nó bớt giành lãnh thổ
- plain, stocking-10 post: 'thường dùng máy sưởi là hợp lý': ở phần lớn Việt Nam nước đã đủ ấm quanh năm, chủ yếu chỉ cần sưởi vào mùa đông miền Bắc
- plain, stocking-10 post: Gọi tiger barb là 'cá đá' là tên không quen thuộc, dân chơi Việt Nam thường gọi là cá xê-cọp
- plain, stocking-10 post: Không nhắc rằng neon đôi khi cũng rỉa vây betta
- ours, stocking-10 tank: "bạn không nên thả thêm betta vào bể này": a single betta in a planted tank of about 65 L with 12 neons is a common, workable setup. Calling betta flatly unsuitable is too strict.
- ours, stocking-10 tank: It says the tank is still sparsely stocked ("mật độ còn thưa") but still says no, and never explains what to watch for or how to try it safely.
- ours, stocking-10 tank: It flatly says a betta must be kept alone or in a single-species tank. That is too strict: one betta with a school of neons in a ~65 L tank is often kept successfully, with care about fin-nipping and chasing.
- ours, stocking-10 tank: It contradicts itself: 'Còn thưa: thả thêm được' (still sparse, can add more) sits next to 'không nên thả thêm betta', and it never explains that the problem is temperament, not stocking.
- plain, stocking-10 tank: Assumes the tank already has a betta ("nếu bể đang có một con betta đực"), but the tank only has neons.
- plain, stocking-10 tank: "cá tế bào (cá neon, cá rasbora)": this is not a usual hobby term in Vietnam.
- plain, stocking-10 tank: Asks for the tank size, even though the tank details were available.
- plain, stocking-10 tank: Assumes there is already a betta in the tank ('đặc biệt nếu bể đang có một con betta đực'), but the tank holds only 12 neon tetras, so most of the answer is about the wrong situation.
- plain, stocking-10 tank: 'cá tế bào (cá neon, cá rasbora)': 'cá tế bào' is not a usual Vietnamese hobby term for these fish.

## Failed

- setup-09 post: ours Request timed out.
- sick-07 post: ours Request timed out.
- sick-09 post: ours Request timed out.
- sick-09 tank: ours Request timed out.
- stocking-01 post: ours Request timed out.
- stocking-01 tank: ours Request timed out.
- stocking-02 tank: ours Request timed out.
- stocking-03 tank: ours Request timed out.

## Each question

### algae-01 · post · plain wins (3 · 7.5)

**Asked:** Bể em mới set được hơn 2 tuần mà đã có chút rêu tóc trên lá bucep và nmc. Em dùng đèn Flat One treo cách mặt nước 20cm, lúc đầu để chế độ giả lập ánh sáng mặt trời, giờ em hạ xuống còn 7 tiếng chạy một mạch không ngắt quãng. Cứ 2 hôm em thay 30% nước một lần, có cho Seachem khử clo, Advance và thuốc khử rêu. Em mới châm thêm 2 lọ phân nước ADA là Brighty K và Green Brighty Mineral vì thấy nmc bị trắng lá, chỉ có ít lá xanh mọc từ dưới lên. Em làm vậy có sai không, rêu tóc này xử lý sao ạ?

**Judge:** Y nhắm đúng cường độ đèn Flat One treo 20 cm, khuyên ngừng thuốc khử rêu, test NO₃/PO₄ trước khi châm thêm phân và gỡ rêu bằng tay, đưa ra các bước rõ ràng. X quá mỏng, chưa trả lời được câu hỏi về phân, và khuyên tổng đèn 8–10 tiếng thì thực chất là bảo bạn ấy tăng giờ đèn lên. / X trả lời đúng từng việc người chơi đã làm: giảm cường độ Flat One, ngừng thuốc khử rêu, đo NO₃/PO₄ trước khi châm thêm phân, gỡ rêu bằng tay, và đưa ra con số cụ thể. Y quá mỏng, lại có thể khiến người chơi tăng giờ đèn lên 8–10 tiếng, và bỏ qua chuyện thuốc khử rêu.

**Ours lacks:** plan, too-thin, diagnosis, tank-fit. **Plain lacks:** follow-up.

**Ours** (read 4 pages, stopped at the tools limit):

> Rêu tóc ở bể mới set thường do dư dinh dưỡng khi cây chưa ra rễ và do bật đèn quá lâu. Cẩm nang khuyên tổng đèn khoảng 8–10 tiếng mỗi ngày nhưng mỗi đợt bật không quá 4 tiếng, nên 7 tiếng liền của bạn là dài; bạn nên chia thành nhiều đợt. Việc thay 30% nước hai ngày một lần là phù hợp, còn việc châm thêm Brighty K và Green Brighty khi lá trắng thì phần cẩm nang mình đã đọc chưa xác nhận đúng hay sai, nên bạn cân nhắc giảm phân trong lúc chờ.
> 
> [Trích: Xử lý rêu tóc ở bể thủy sinh Hà Lan mới set › Chia giờ đèn ra sao]
> Tổng thời gian đèn mỗi ngày nên ở khoảng 8 đến 10 tiếng. Điểm cần chú ý là kh…

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

**Judge:** Neither answer uses their tank details: the 7h of light, the algae remover, the nmc whitening, the new fertilisers. X is thin and tells them to raise the light to 8–10h, which can make the algae worse. Y is generic and wordy and ends by asking questions, but it gives a usable plan in order: remove by hand, cap the light, cut fertiliser, add fast-growing plants, add algae eaters. / Cả hai đều không dùng thông tin bể của họ: cây mọc chậm (bucep, nmc), đèn đã 7h, đã thay nước thường xuyên, mới châm phân, đang dùng thuốc khử rêu, nmc bị trắng lá. X nên được chọn: nó chỉ đúng nguyên nhân (đèn dư, phân thừa, cây chậm chưa cạnh tranh được) và kế hoạch có hướng hợp lý (giảm đèn, bớt phân, thêm cây mọc nhanh), dù dài và gọi nhầm SAE là cá rìu. Y lại khuyên tăng đèn lên 8–10h, đi ngược với tình trạng bể.

**Ours lacks:** tank-fit, diagnosis, too-thin. **Plain lacks:** tank-fit, figures, too-long.

**Ours** (read 5 pages):

> Với bể thủy sinh mới set, cẩm nang cho biết rêu tóc thường mọc vì cây mới trồng chưa ra rễ nên hút ít dinh dưỡng, và đèn bật quá lâu. Trong hai tuần đầu, hãy thay 30–50% nước mỗi ba ngày, chỉnh tổng thời gian đèn về khoảng 8–10 tiếng (mỗi đợt không quá 4 tiếng), rồi gỡ rêu bằng tay hoặc thả tép Amano. Carbon nước cũng giúp với phần lớn ca rêu tóc.
> 
> [Trích: Xử lý rêu tóc ở bể thủy sinh Hà Lan mới set › Bắt đầu từ đâu]
> 1. Nếu bể mới set dưới hai tuần, đặt lịch thay 30–50% nước mỗi ba ngày.
> 2. Xem lại giờ đèn: tổng 8–10 tiếng mỗi ngày, mỗi đợt không quá 4 tiếng.
> 3. Rêu tóc đã lên thì thả sinh vậ…

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

**Judge:** Y says the likely cause and tells the hobbyist not to buy a new light yet. It gives clear steps with figures (6–7 hours of light, 40–60% intensity, 20–30% water changes) and when to check back, though a few of its light picks are wrong for a 70cm tank. X only names possible causes and points to guide excerpts, with no steps and no light suggestion. / X tells them not to rush into a new light and gives clear steps in order with numbers: 6–7 hours of light, 40–60% intensity, scrubbing off the BBA, regular fertilizer, 20–30% water changes and a 2–3 week check. A few of its product and plant suggestions are wrong, though. Y only says it has no specific light to recommend and lists a few causes, with no steps to take, so the hobbyist can do almost nothing with it.

**Ours lacks:** plan, too-thin, figures. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang chưa cho mình đủ thông tin để gợi ý đúng một mẫu đèn cho hồ 70x30x40 này. Theo cẩm nang, ráy và rêu thuộc nhóm cây ưa sáng yếu, nên đèn cường độ thấp là đủ, và người mới nên bắt đầu với nhóm cây này. Rêu râu đen thường đến từ CO2 dao động, chất thải hữu cơ tích nhiều hoặc cây yếu, nên trước khi thay đèn bạn nên kiểm tra các yếu tố này.
> 
> [Trích: Cách chọn đèn tốt nhất cho bể thủy sinh nước ngọt › #2 Cường độ ánh sáng]
> [photo: Planted aquarium with vallisneria in the background]
> Đèn nên sáng đến mức nào? Trước hết, câu trả lời phụ thuộc vào loại cây thủy sinh bạn muốn trồng. Đèn yếu (h…

**Plain** (2238 characters):

> Với hồ 70x30x40 (khoảng 84L) trồng ráy và rêu, mình nghĩ **bạn chưa cần thay đèn ngay**. Rêu chùm đen (BBA) thường xuất hiện khi ánh sáng quá mạnh hoặc kéo dài so với khả năng hấp thụ dinh dưỡng và CO₂ của cây, và ráy với rêu vốn là nhóm cây ưa ánh sáng thấp đến vừa.
> 
> **Nguyên nhân có khả năng nhất:**
> - **Cường độ hoặc thời gian chiếu sáng quá mức.** A601 Plus khá mạnh cho hồ 70cm, nhất là khi hồ không có nền và cây ít sinh trưởng.
> - **Cây không tăng trưởng đủ để cạnh tranh.** Ráy chậm lớn nên không hấp thụ hết dinh dưỡng, và rêu chùm đen tận dụng phần dư đó.
> - **Lịch chiếu sáng không ổn định…

### algae-02 · tank · plain wins (3.5 · 6)

**Asked:** Bể của tôi bị rêu chùm đen dù không châm phân, có phải do đèn không?

**Judge:** Y cho các bước làm được ngay, có số liệu: giảm đèn còn 6–8 giờ, thay 20–30% nước mỗi tuần, tăng dòng chảy, tỉa lá già, thêm cây mọc nhanh. Đây là cách xử lý đúng cho một bể ráy và rêu mọc chậm dưới đèn mạnh. X thì quá mỏng: bảo kiểm tra CO2 và vệ sinh nền dù bể không có nền, và gạt đèn sang một bên trong khi đèn có lẽ lại là nguyên nhân chính. Cả hai đều không dùng đến thông tin bể của người hỏi. / X gives a usable plan with numbers (light down to 6–8 hours a day, 20–30% water changes, fast-growing plants, trimming, algae eaters), though it is generic and asks about the light the app already shows. Y is thin, doesn't use the tank's details (it tells them to clean a substrate they don't have), and talks them out of reducing light, which is the most likely fix for anubias and moss under a strong light with no CO2.

**Ours lacks:** plan, figures, tank-fit. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 3 pages):

> Đèn không phải nguyên nhân duy nhất. Cẩm nang cho biết BBA thường do ba nhóm chính: CO2 thiếu hoặc dao động, chất thải hữu cơ tích nhiều (bể bẩn), và cây yếu; đèn mạnh chỉ gây rêu khi làm bể mất cân bằng, tức cây cần thêm CO2 và dinh dưỡng mà không đủ. Vì bạn không châm phân, hãy kiểm tra CO2, vệ sinh nền và lọc, rồi xem cây có khỏe không trước khi giảm đèn.
> 
> [Trích: Rêu râu đen BBA: 7 nguyên nhân và cách phòng trong bể thủy sinh › Ba nguyên nhân chính gây BBA]
> Phần lớn trường hợp BBA rơi vào một trong ba nhóm sau, hoặc kết hợp vài nhóm.
> [photo: Tảo BBA mọc thành chùm đen xơ xác trên lá cây t…

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

**Judge:** X gets it right: this is planktonic green algae, the hobbyist should keep changing 30% daily in the first week and then space the changes out, and should cut light, food and fertiliser. Its main gap is leaving the light question open. Y mistakes the Odyssea for a UV light and says to stop water changes, which is wrong for a new planted tank. Its one useful tip is not to swap in brand-new filter wool. / X đoán nhầm Odyssea là đèn UV và khuyên ngừng thay nước, cả hai đều sai với hồ thủy sinh mới set. Y đưa đúng lịch thay nước 30% mỗi ngày trong tuần đầu, khuyên giảm đèn và cho ăn ít lại, có trích phần che tối. Tuy vậy Y chưa trả lời thẳng câu hỏi nên tắt đèn vài ngày hay không.

**Ours lacks:** tank-fit, plan, follow-up, figures. **Plain lacks:** wrong, tank-fit, asks-only.

**Ours** (read 6 pages, stopped at the tools limit):

> Theo cẩm nang, nước xanh là tảo phù du nở rộ, bản thân không hại trực tiếp cá nhưng ban đêm tảo dùng oxy, nên hãy theo dõi cá nổi đầu hoặc đớp khí. Trong tuần đầu cẩm nang gợi ý thay khoảng 30% nước mỗi ngày, rồi giãn dần xuống 2 ngày, 3 ngày một lần khi cây lên đều và rêu hại không phát triển; không nên thay dày mãi. Cẩm nang cũng khuyên cắt nguyên nhân trước, như rút ngắn thời gian bật đèn, cho ăn ít lại và không châm thêm phân khi bể đang thừa sáng, nhưng với đèn Odyssea của bạn thì cẩm nang không nói về công suất nên mình chưa đánh giá được là có dư hay không.
> 
> [Trích: Nước bể cá bị xanh:…

**Plain** (1616 characters):

> Mình khuyên **đừng thay nước mỗi ngày**, và **đừng tắt hẳn đèn**, nhất là nếu đây là đèn UV diệt tảo.
> 
> **Vì sao nước xanh:** Hồ mới set 3 ngày thường chưa có hệ vi sinh ổn định, nên dinh dưỡng (thức ăn thừa, phân, nước máy) dư thừa, cộng với nắng và ánh sáng, làm tảo nổi (nước xanh) bùng lên. Thay 30% mỗi ngày đưa thêm nước máy vào, có thể mang thêm dinh dưỡng và làm hồ không kịp ổn định. Thường thì nước xanh kiểu này tự hết sau 1-3 tuần khi hồ ổn định.
> 
> **Việc nên làm:**
> - **Ngừng thay nước hằng ngày.** Chỉ thay khi thử nước thấy amonia hoặc nitrit tăng, và mỗi lần chỉ khoảng 10-15%.
> - **Thử…

### algae-03 · tank · plain wins (4.5 · 6)

**Asked:** Bể mới set vài ngày đã bị nước xanh, nên thay nước hay tắt đèn?

**Judge:** Y answers the question directly: turn the light off first, and don't change much water while the tank is still cycling. That explains why their 30% change made the water greener, and it gives clear steps with times. X is thin, repeats steps they already took, and neither answer notices that changing the filter floss set back the beneficial bacteria. / Không câu nào dùng chi tiết bể của người hỏi: đèn đã giảm còn 4 tiếng, mới thay bông lọc, và trồng trân châu. X trả lời thẳng câu hỏi tắt đèn hay thay nước, có thứ tự làm và mốc thời gian rõ, nên giúp được hơn. Y quá ngắn và chủ yếu dựa vào đoạn trích cẩm nang.

**Ours lacks:** tank-fit, diagnosis, too-thin, plan. **Plain lacks:** tank-fit, too-long.

**Ours** (read 3 pages):

> Thay nước một lần thì nước xanh sẽ mọc lại nhanh, nên bạn nên cắt nguyên nhân trước: giảm đèn, tránh nắng chiếu vào bể, cho ăn ít lại. Cẩm nang khuyên che tối tối đa 7 ngày hoặc dùng đèn UV, rồi mới thay nhiều nước để vớt xác tảo, và duy trì thay ít nhất 20% nước mỗi tuần. Nếu cá nổi đớp khí hoặc lờ đờ thì cần xử lý ngay vì bể đang thiếu oxy.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Chữa]
> Phần lớn trường hợp chỉ cần làm đủ các bước sau:
> 1. Tìm và cắt nguyên nhân: rút ngắn thời gian bật đèn, dời bể khỏi chỗ nắng chiếu, cho ăn ít lại, đo nitrat và phosphat.
> 2. Là…

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

### algae-04 · post · plain wins (4 · 7)

**Asked:** Mình chơi hồ 60x40x40 theo kiểu Hà Lan, dùng 2 cây đèn trắng Aquablue, 1 cây dài 60cm và 1 cây 45cm, vậy có bị dư sáng không? Hồ mới set được 7 ngày mà tảo nâu phát triển nhiều quá, CO2 và dinh dưỡng thì tương đối ổn định, mỗi ngày thay 30% nước kèm vệ sinh hồ, vậy mà rêu nâu cứ bám hoài trên đá và mặt kính. Hồ mình đang bị gì, nên làm sao?

**Judge:** Y gives the hobbyist more to work with. It answers the light question with a 6–7 hour photoperiod, deals with the daily 30% water changes and tap-water silicate, and lays out steps in order with algae eaters. Some of its claims go further than the facts support. X is thin: it mostly points to the guide, never gives a verdict on the two lights, and doesn't touch their water-change routine. / X tốt hơn. X trả lời thẳng câu hỏi về đèn: hai đèn ở mức trung bình–khá, chưa dư sáng, và nên bật 6–7 tiếng mỗi ngày. X cũng xác định đúng đây là tảo silic của hồ mới, có trình tự xử lý, có số liệu và gợi ý sinh vật ăn tảo, dù lời khuyên giảm thay nước còn gây tranh cãi. Y bám sát cẩm nang và đúng, nhưng quá mỏng: không đánh giá bộ đèn cụ thể, không nhắc đến việc người chơi đang thay nước mỗi ngày, cũng không có số giờ bật đèn.

**Ours lacks:** tank-fit, plan, figures, too-thin. **Plain lacks:** follow-up.

**Ours** (read 5 pages):

> Theo cẩm nang, khoảng 90% trường hợp rêu nâu xuất hiện vì bể còn mới, chưa đủ vi khuẩn có lợi, và thường tự hết sau khoảng 4–6 tuần khi bể ổn định, nên bạn không làm gì sai. Cách xử lý là chà kính và đá bằng mút hoặc bàn chải đánh răng trong lúc vệ sinh định kỳ, và có thể thả cá, tép hoặc ốc ăn rêu để dọn lá. Cẩm nang không đưa ra kết luận riêng cho bộ hai đèn của bạn, nhưng có danh sách kiểm tra: đèn có bật quá lâu, quá mạnh không, và bể có bị nắng chiếu trực tiếp không.
> 
> [Trích: Rêu nâu (tảo silic) trong bể thủy sinh: nguyên nhân và cách xử lý › Vì sao bể mới hay bị rêu nâu]
> Khoảng 90% trườ…

**Plain** (2537 characters):

> # Tảo nâu trong hồ mới là khá phổ biến
> 
> Lớp nâu bám trên đá và kính thường là **tảo silic (diatom)**. Nếu lau bằng tay thì bong ra dễ dàng, đó là dấu hiệu nhận biết. Tảo nâu hay xuất hiện trong 2-8 tuần đầu của hồ mới, vì lúc này hệ vi sinh chưa ổn định, cây chưa hấp thụ hết dinh dưỡng, và nước thường giàu **silicate**.
> 
> ## 1. Có bị dư sáng không?
> 
> Với hồ khoảng 96L và 2 đèn (60cm + 45cm) thì **cường độ ở mức trung bình-khá**, chưa phải là quá dư, nhất là với kiểu Hà Lan vốn cần sáng tương đối. Tuy nhiên, trong giai đoạn mới set, **thời gian bật đèn** mới là yếu tố dễ gây tảo:
> - Nên bật **6-7…

### algae-04 · tank · plain wins (3.5 · 5.5)

**Asked:** Bể mới set một tuần bị tảo nâu bám kín đá và kính, làm sao?

**Judge:** X tells them to cut the light to 2–3 hours, which harms a Dutch tank running CO₂, and its answer is thin. Y is generic and has a few small errors, but it gives safe, ordered steps: wipe the algae by hand, keep the light at 6–8 hours, add Otocinclus and nerite snails, and wait for the tank to settle. / Cả hai câu trả lời đều không nhắc gì đến bể của họ: thay 30% nước mỗi ngày, có CO₂ và trồng cây Hà Lan. X còn hỏi lại những thông tin app đã có sẵn. Dù vậy, X đưa ra 6–8 tiếng đèn hợp lý và các bước rõ ràng. Y lại khuyên cắt đèn còn 2–3 tiếng, mức này gây hại cho bể cây Hà Lan có CO₂, và nhắc một loài ăn tảo đáng ngờ. Bù lại, đoạn trích checklist dưới câu trả lời Y có ích.

**Ours lacks:** tank-fit, too-thin, wrong, plan, follow-up. **Plain lacks:** tank-fit, too-long.

**Ours** (read 3 pages):

> Tảo nâu (tảo silic) ở bể mới set là chuyện bình thường và thường tự hết sau 4–6 tuần khi bể ổn định. Cổ điển nhất là cắt giờ đèn xuống còn 2–3 tiếng mỗi ngày (bình thường 6–8 tiếng), thả cá bống vàng hoặc ốc Nerita để mút tảo, và thay khoảng 30% nước hai ngày một lần; lớp tảo lau bằng tay thường trôi đi.
> 
> [Trích: Nhận biết và xử lý 6 loại rêu hại hay gặp trong bể thủy sinh › Tảo nâu: vì sao bể mới nào cũng bị]
> Tảo nâu (tảo silic, diatoms) là những vệt màu nâu phủ lên lá cây, mặt đá và mặt kính. Nó làm bể trông bẩn, phủ dày trên lá thì cây cũng lên chậm hơn.
> [video at 30s: Hình minh họa rêu nâ…

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

### algae-05 · post · plain wins (3 · 7)

**Asked:** Em set bể Hà Lan được gần 1 tháng, đèn mới lên 8h/ngày (10h sáng đến 18h), cây phát triển rất tốt, không có rêu hại. Phía trước dưới nền em trồng rau thơm. Nhưng ở mặt kính phía dưới, chỗ giáp nền, có tảo nâu bám kính và một chút tảo nhớt xanh, có phải do đèn trong nhà buổi tối hắt vào bể không? Bucep em buộc giá thể thả vào được 1 tuần cũng có tảo nâu trên lá. Em thay nước đều 2 ngày 1 lần. Em có thả ốc nerita nhưng nó chỉ nằm im không bò, kiểm tra thì vẫn sống. Xử lý tảo nâu với rêu nhớt sao ạ?

**Judge:** I'd rather the hobbyist got Y. It answers every question they asked: the evening room light, diatoms in a new tank, cyanobacteria in low-flow spots, and the Nerita that isn't moving. It also gives practical steps: wipe the glass and leaves, siphon the bottom, do a short blackout and add flow. X tells them to cut the light to 2–3 hours a day, which would hurt a healthy Dutch tank, and it repeats advice they've already followed. / X đoán đúng nguyên nhân: tảo silic do bể mới, rêu nhớt xanh là vi khuẩn lam. X đưa ra cách xử lý từng bước, trả lời đủ câu hỏi về đèn phòng và về ốc. Y khuyên giảm đèn còn 2–3 tiếng, quá mạnh và hại cây, bảo thả ốc Nerita dù bạn ấy đã thả rồi, và bỏ qua hai câu hỏi của bạn ấy.

**Ours lacks:** tank-fit, too-thin, wrong. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Theo cẩm nang, tảo nâu thường do hệ vi sinh bể mới chưa ổn định, và bật đèn càng lâu thì càng lan nhanh. Bạn nên tạm giảm đèn còn 2–3 tiếng mỗi ngày, thả ốc Nerita để dọn, và tiếp tục thay 30% nước 2 ngày một lần như bạn đang làm. Rêu nhớt xanh mọc ở chỗ nước lưu thông kém, sát nền và quanh gốc cây, nên hãy chỉnh lại dòng chảy ở góc đó. Cẩm nang chưa nói về đèn trong nhà hắt vào bể buổi tối hay vì sao ốc Nerita nằm im, nên hai điểm này mình chưa trả lời được.
> 
> [Trích: Nhận biết và xử lý 6 loại rêu hại hay gặp trong bể thủy sinh › Tảo nâu: vì sao bể mới nào cũng bị]
> Tảo nâu (tảo silic, diatoms…

**Plain** (2581 characters):

> Tảo nâu thường gặp ở bể mới khoảng 1–2 tháng. Thường là **tảo silic (diatom)**, xuất hiện khi bể chưa cân bằng, nguồn sáng và dinh dưỡng đang dư. Tình trạng này thường tự giảm khi bể ổn định. Còn lớp nhớt xanh có thể là **vi khuẩn lam (cyanobacteria)**, dễ xuất hiện ở vùng đáy kính, nơi ít dòng chảy và tích tụ mùn bã hữu cơ.
> 
> **1. Đèn trong nhà hắt vào bể có phải nguyên nhân không?**
> Có thể góp phần, nhưng thường không phải nguyên nhân chính. Ánh sáng yếu từ đèn phòng vào buổi tối ít ảnh hưởng đến tảo. Bạn nên kiểm tra:
> - Ánh nắng hoặc đèn phòng có chiếu trực tiếp vào mặt kính không.
> - Đèn bể…

### algae-05 · tank · ours wins (5.75 · 4.75)

**Asked:** Bể tôi có tảo nâu và tảo nhớt xanh ở chân kính sát nền, xử lý thế nào?

**Judge:** X is short and doesn't use the tank details. Still, it correctly says that diatoms in a new tank (4 weeks) usually clear up as the tank matures, and that cyano needs scrubbing plus a 3–4 day blackout. Y is long and generic. It suggests chemicals too early, recommends snails they already have, and neither answer mentions the evening house light hitting the glass or the nerite snails not moving. / Y is better. It correctly ties the brown algae (diatoms) to a new tank, gives a 3–4 day blackout for the green slime (cyanobacteria) taken from its guide, and correctly says no fish or shrimp eat cyanobacteria. It is thin, though: no ordered steps, and nothing about their snails lying still or the room light at night. X is longer and more generic and asks for tank details they already had. It also suggests nerite snails they already keep and uses doubtful Vietnamese names for algae-eating fish.

**Ours lacks:** tank-fit, follow-up, plan. **Plain lacks:** tank-fit, too-long, diagnosis, follow-up.

**Ours** (read 6 pages, stopped at the calls limit):

> Tảo nâu ở đây là tảo cát, và cẩm nang hướng dẫn hút bỏ tảo bằng tay khi thay nước, tăng khối lượng cây để cây lấn át tảo, và hạn chế châm phân đạm hoặc phốt phát khi bể còn mới. Tảo nhớt xanh là vi khuẩn lam: cẩm nang nói phải xử lý ngay, gỡ bằng tay bằng bàn chải lông mềm, và có thể che tối bể 3–4 ngày (tắt CO2, không châm phân, trùm kín) rồi thay nước. Cẩm nang cũng ghi rằng không loài cá hay tép nào ăn được tảo lam.
> 
> [Trích: Cách kiểm soát tảo nâu (tảo cát) trong bể thủy sinh › Cách xử lý]
> - Đẩy nhanh quá trình trưởng thành sinh học của bể bằng mulm hoặc vật liệu lọc cũ.
> - Tăng khối lượng …

**Plain** (2489 characters):

> Tảo nâu và tảo nhớt xanh ở chân kính thường xuất hiện khi bể dư dinh dưỡng, ánh sáng hoặc dòng chảy chưa tốt. Bạn xử lý theo các bước sau:
> 
> ## 1. Xác định loại tảo
> - **Tảo nâu** (diatom): lớp bột nâu dễ lau, thường xuất hiện ở bể mới hoặc khi ánh sáng yếu. Thường tự biến mất khi bể ổn định.
> - **Nhớt xanh** (vi khuẩn lam, cyanobacteria): lớp nhầy, có thể dày, màu xanh hoặc đen, dễ bong thành mảng. Đây là loại khó xử lý hơn và cho thấy bể đang dư chất dinh dưỡng hoặc thiếu oxy/lưu thông nước ở đáy.
> 
> ## 2. Xử lý ngay
> - **Cọ và lau kính** bằng miếng cọ mềm hoặc nam châm lau kính. Với vi khuẩn lam…

### algae-06 · post · plain wins (2.5 · 7)

**Asked:** Em đang dùng bể 6-4-4, lọc Sunsun 702B (1000L/h), lọc phụ Sunsun 603. CO2 cho qua sủi đánh thẳng vào đầu in của lọc, có van điện bật tắt theo đèn. Thỉnh thoảng nghe trong lọc chính có tiếng lọc xọc, lúc khác lại thấy đầu out bắn ra bọt khí to cỡ hạt đỗ. Bể đang nhiều rêu tóc, rêu sừng hươu và rêu lông tơ nên em đang cho CO2 dồi dào hơn, tầm 6-7 giọt/giây. Trộn như vậy có ổn không khi CO2 nhiều? Lọc phụ gắn thêm trộn cánh quạt ở out được không hay sẽ yếu dòng? Cá tép có nguy cơ chết vì ngạt CO2 không?

**Judge:** X chỉ nói cẩm nang không có thông tin rồi gợi ý dùng cốc trộn, không trả lời câu nào trong ba câu hỏi. Y giải thích đúng là dư khí bị hút vào bơm, khuyên giảm CO2 và theo dõi bằng drop checker, nói được dấu hiệu tép bị ngạt và chuyện cánh quạt ở lọc phụ. Y có vài chỗ chưa chuẩn nhưng nhìn chung giúp người hỏi nhiều hơn hẳn. / Câu trả lời X nói đúng nguyên nhân: khí dư tích trong lọc làm lọc kêu lọc xọc, và bọt to ở đầu out là CO2 không tan hết. X cho số cụ thể (1-2 giọt/giây, drop checker, giới hạn an toàn cho tép), dấu hiệu tép bị ngạt và cách xử lý. Y chỉ nhận là cẩm nang không có thông tin, gợi ý dùng cốc trộn ở đầu out rồi dừng ở đó, không trả lời câu hỏi về nguy cơ ngạt cho tép.

**Ours lacks:** diagnosis, plan, too-thin. **Plain lacks:** too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Cẩm nang chưa trả lời được đầy đủ câu hỏi này: không có trang nào nói về mức CO2 phù hợp khi bể nhiều rêu, nguyên nhân tiếng lọc xọc hay bọt khí ở đầu out, việc gắn cánh quạt vào lọc phụ, hay nguy cơ ngạt cho tép. Điều cẩm nang nói là hệ CO2 nên đi qua cốc trộn nối vào đầu ra của lọc để khí tan đều trước khi chảy vào bể, và sủi CO2 trong bể chỉ là tùy chọn, không cần khi đã có cốc trộn. Lọc phụ được đặt trước lọc chính để chặn cặn bẩn.
> 
> [Trích: Set bể thủy sinh có CO2 và lọc thùng từ đầu đến lúc thả cá › Lắp CO2 thế nào cho tan tốt]
> Hệ CO2 gồm bình, van điện Mufan và cốc trộn. Ống đầu ra của …

**Plain** (3807 characters):

> # Trả lời ngắn gọn
> 
> **Trộn CO2 vào đầu hút của lọc chính đang gây tiếng xọc và bọt lớn.** Với lượng 6-7 giọt/giây, bể 96-100L dễ bị dư CO2, nhất là khi bạn tăng đột ngột. Nên giảm lượng CO2, dùng đo drop checker để kiểm soát, và chuyển điểm bơm CO2 ra khỏi đầu hút lọc chính.
> 
> ## 1. Tiếng "lọc xọc" và bọt to ở đầu out
> 
> - **Khí bị hút vào bơm:** Bọt CO2 đi vào đầu hút, bơm 702B hút cả khí lẫn nước. Khí làm bơm mất mồi, chạy ồn, lưu lượng giảm, lâu dài có thể mòn cánh bơm và phớt.
> - **Bọt to ở out:** CO2 không kịp hòa tan nên thoát ra theo dòng nước. Bọt to cỡ hạt đỗ nghĩa là lượng khí đang vượt…

### algae-06 · tank · tie or split (4.5 · 4.5)

**Asked:** Bể tôi nhiều rêu tóc, rêu sừng hươu và rêu lông tơ, tăng CO2 có giúp được không?

**Judge:** Không câu trả lời nào nhận ra vấn đề chính: CO₂ 6–7 giọt/giây sủi vào đầu in lọc, lọc kêu xọc và đầu out ra bọt to, tức là CO₂ đang tích khí trong lọc và không hòa tan được. Vì vậy chưa phải lúc tăng CO₂ mà phải sửa cách hòa tan trước. X đúng về nguyên tắc nhưng quá mỏng, không có bước làm nào. Y có kế hoạch dùng được (giảm giờ đèn, thay nước, gỡ rêu bằng tay, chấm H₂O₂) nhưng sai mức giảm pH và hỏi lại thông tin app đã có. / Không câu trả lời nào nhận ra bể đã sủi 6-7 giọt/giây vào đầu in lọc, và tiếng lọc xọc cùng bọt khí to ở đầu out cho thấy CO₂ đọng khí trong lọc, hòa tan kém. Y đúng hơn khi nói CO₂ chỉ giúp nếu bể đang thiếu, có hướng xử lý rêu tóc và rêu sừng hươu, dù còn mỏng. X đưa nhiều bước làm hơn nhưng khuyên tăng CO₂ khi bể đang có tép, và số liệu pH sai.

**Ours lacks:** too-thin, plan, tank-fit. **Plain lacks:** tank-fit, diagnosis, wrong.

**Ours** (read 5 pages, stopped at the calls limit):

> Theo cẩm nang, CO2 chỉ giúp khi bể đang thiếu CO2: nếu đèn và phân bón đã tương xứng, cây khỏe sẽ tranh được ánh sáng và dinh dưỡng với rêu, còn CO2 không tự diệt được rêu. Rêu tóc thì cẩm nang nói tép và cá không dọn sạch, phải gỡ bằng tay; rêu sừng hươu có thể xử lý bằng thuốc diệt BBA dạng lỏng bơm trực tiếp vào chỗ rêu. Riêng rêu lông tơ, tôi chưa đọc được phần cẩm nang trả lời trực tiếp nên chưa thể nói cụ thể cho loại này.
> 
> [Trích: CO2 trong bể thủy sinh: CO2 thực sự làm gì và có tự nhiên không? › CO2 giúp hạn chế tảo phát triển quá mức]
> Bể càng nhiều ánh sáng thì cây càng có điều kiện …

**Plain** (1978 characters):

> **Có, tăng CO₂ thường giúp**, nhưng thường chỉ là một phần của giải pháp. Rêu tóc, rêu sừng hươu và rêu lông tơ hay xuất hiện khi bể mất cân bằng: ánh sáng quá mạnh hoặc kéo dài, dinh dưỡng (đặc biệt là phosphate và nitrate) dư thừa, còn cây thủy sinh thì thiếu CO₂ nên phát triển chậm. Khi cây được cấp đủ CO₂, chúng lớn nhanh hơn, hấp thụ dinh dưỡng và cạnh tranh ánh sáng tốt hơn rêu.
> 
> **Cách tăng CO₂ hiệu quả**
> - Đo bằng drop checker hoặc theo pH: mục tiêu thường là pH giảm khoảng 0,2–0,3 so với nước không CO₂, hoặc drop checker chuyển xanh vàng nhẹ (khoảng 25–30 ppm).
> - Bật CO₂ cùng lúc với…

### algae-07 · post · plain wins (3.25 · 6.75)

**Asked:** Em là tân binh theo trường phái Hà Lan, phần cứng gần như đủ cho một bể Hà Lan cơ bản: lọc chuẩn, CO2 dồi dào, nền trộn giàu dưỡng, đèn WRGB, quạt... Vậy mà em thất bại liên tiếp 5 bể, bể nào cũng bị: cây xoắn ngọn, xoắn tít, mất màu, teo ngọn, ngọn trắng toát và dị dạng; rêu hại bùng phát. Đèn bật 9h liên tục, CO2 3-4 giọt/giây, mới setup em thay hơn 100% nước hằng ngày trong 2 tuần (vì nghe nói nền trộn rất giàu dưỡng, mà nền mua nên em không biết công thức). Giờ em muốn chuyển qua nền công nghiệp + cốt nền nhưng lăn tăn về tuổi thọ và dinh dưỡng cho bể Hà Lan vốn rất háu ăn. Em nên làm sao?

**Judge:** Y bám vào chính các thông số người hỏi đưa ra: thay nước 100% mỗi ngày, đèn 9h, CO2 3-4 giọt/giây. Y có lộ trình theo tuần, chỉ số mục tiêu và trả lời đúng câu hỏi về tuổi thọ của nền công nghiệp và cốt nền. X quá mỏng: chủ yếu là trích dẫn cẩm nang, không có kế hoạch, dù X có nhắc đúng khả năng thiếu canxi. / X addresses the hobbyist's actual mistakes: the daily 100% water changes, CO2, the 9-hour photoperiod and fertilising. It also gives target numbers and a week-by-week recovery plan, but it misses calcium or GH as a cause. Y correctly raises calcium and soft water, but it is thin, never mentions the water changes, and gives no plan.

**Ours lacks:** plan, too-thin, tank-fit. **Plain lacks:** diagnosis.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa có công thức hay quy trình riêng cho bể Hà Lan, nên không thể xác định chắc nguyên nhân 5 bể thất bại từ đây. Nhưng cẩm nang nói rõ: thay nước đều mà không đo nitrat có thể làm cây thiếu nitơ, lá non xoắn thường là dấu hiệu thiếu canxi hoặc nước mềm, và phân nền công nghiệp hết dinh dưỡng nhanh hơn nền tự trộn. Khi dùng nền công nghiệp, bạn nên đo nitrat, cân lượng phân theo tốc độ lớn của cây, và chờ ít nhất 2 đến 3 tuần sau mỗi lần chỉnh để thấy kết quả.
> 
> [Trích: Cách chọn phân nền thủy sinh cho người mới: loại nào, mua bao nhiêu › Nền trộn hay phân nền công nghiệp]
> Hồi thủy s…

**Plain** (3164 characters):

> Em không nên đổ lỗi cho nền trộn hay bỏ phương pháp Hà Lan. Theo mô tả, nguyên nhân nhiều khả năng nằm ở **thiếu dinh dưỡng do thay nước quá nhiều**, cộng với **CO2 và ánh sáng cao mà không có bón phân tương ứng**.
> 
> ## 1. Chẩn đoán
> 
> - **Thay 100% nước mỗi ngày trong 2 tuần** đã rửa trôi phần lớn dưỡng chất hòa tan và vi lượng (sắt, mangan, kẽm...). Nền trộn giàu dưỡng chỉ bổ sung từ từ, nên sau khi bị rửa trôi, cây đói ngay. Đây là lý do cây non bị xoắn, trắng ngọn, dị dạng.
> - **Ánh sáng 9h + CO2 3-4 giọt/giây + không bón phân đều** là tổ hợp khiến cây tiêu thụ nhanh, trong khi nguồn cung khô…

### algae-07 · tank · plain wins (3.5 · 4.5)

**Asked:** Bể tôi cứ bị rêu hại bùng phát và cây xoắn ngọn, trắng ngọn, phải làm sao?

**Judge:** Cả hai câu trả lời đều không dùng thông tin bể của người chơi: đèn 9h, CO2 3–4 giọt/giây mà vẫn chạy quạt, nền giàu dưỡng. X chỉ đúng hướng là kiểm tra CO2 trước, nhưng quá ngắn và bỏ hẳn phần cây xoắn ngọn, trắng ngọn. Y dài và chung chung, có vài lời khuyên sai như ốc táo, cá tỳ bà, và hỏi lại những điều đã biết, nhưng vẫn cho được các bước làm ngay: giảm đèn xuống 6–8h, giữ CO2 ổn định, bổ sung vi lượng. Vì vậy Y giúp người chơi nhiều hơn một chút. / Cả hai câu trả lời đều không dùng dữ liệu bể: đèn chạy 9 tiếng, có quạt làm thoát CO₂, nền giàu dưỡng, thay nước 100% mỗi ngày. Y đúng hướng khi bảo kiểm tra CO₂ bằng drop checker nhưng quá mỏng và bỏ trống hẳn phần xoắn ngọn. X dài, chung chung, có vài lỗi (ốc táo, cá chuột, đổ cho thiếu sắt) nhưng vẫn cho người chơi các bước làm được ngay: giảm đèn xuống 6–8 tiếng, giữ CO₂ ổn định, cắt bỏ ngọn hỏng.

**Ours lacks:** too-thin, plan, diagnosis. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 2 pages, stopped at the calls limit):

> Theo cẩm nang, rêu hại thường bùng lên khi nước dư dinh dưỡng từ phân nền hoặc khi CO2 bị thiếu, nên hãy kiểm tra CO2 bằng drop checker trước khi đổ lỗi cho phân, và thay nước đều đặn. Khi đã có rêu chỉ hoặc rêu râu, cẩm nang gợi ý dùng carbon lỏng trong thời gian có rêu, không cần châm thường xuyên. Phần cây xoắn ngọn, trắng ngọn thì các trang tôi đã đọc chưa đề cập, nên tôi chưa trả lời được phần đó.
> 
> [Trích: Lịch châm phân nước đơn giản cho từng kiểu bể thủy sinh › Rêu hại bùng lên: kiểm tra CO2 trước khi đổ lỗi cho phân]
> Ở bể rừng, rêu tóc (hair algae) mọc lên do CO2 bị thiếu. Khi set bể,…

**Plain** (2889 characters):

> Hiện tượng rêu bùng phát kèm cây xoắn ngọn, trắng ngọn thường do **mất cân bằng dinh dưỡng và ánh sáng**, hoặc **thiếu vi lượng (đặc biệt là sắt)**. Bạn có thể xử lý theo các bước sau.
> 
> ## 1. Kiểm tra nước trước
> Nên dùng bộ test (NH₃/NH₄⁺, NO₂⁻, NO₃⁻, PO₄³⁻, pH, KH, GH). Nếu chưa có, ít nhất hãy để ý:
> - **Amoniac hoặc nitrit > 0**: có thể do cá quá tải, cho ăn dư, lọc chưa chín hoặc thiếu vi sinh. Đây là nguyên nhân nguy hiểm nhất, phải thay nước ngay.
> - **Nitrat và photphat cao**: là "thức ăn" của rêu. Nên giữ nitrat dưới khoảng 20–30 mg/L.
> 
> ## 2. Giảm ánh sáng và kiểm soát thời gian chiếu s…

### algae-08 · post · plain wins (4 · 6.5)

**Asked:** Em mới chơi, bể đúc 50cm, lúc đầu nuôi 9 mún + 3 bảy màu + 2 sọc ngựa, giờ là 10 bảy màu, 9 sọc ngựa, 5 mún đỏ với 2 cây ráy. Bể không trải nền, chỉ có vài hòn đá; có lọc thác (có lúc chạy cả ngày, có lúc em không bật) và đèn RGB 9W, ban ngày bật trắng khoảng 10 tiếng, tối chuyển đèn màu đến lúc đi ngủ mới tắt. Cho ăn ngày 2 lần. Được hơn 3 tuần thì tảo nâu bám đầy bể, mún với bảy màu ăn hằng ngày cũng không hết, nước đục đục như phân cá rã ra. Tuần thay 50% nước vẫn đục, thành bể có một lớp mờ mờ như rêu tảo bám. Giờ thì thay nước xong được vài ngày là nước lại chuyển xanh đục, tuần nào cũng phải thay gần như hết nước. Lọc thác không ăn thua, em đang tính mua lọc thùng Sunsun 350K thay vào. Do lọc hay do gì, làm sao để nước luôn trong?

**Judge:** Y chỉ ra lỗi quan trọng nhất là lọc bật tắt thất thường. Y cũng nói rõ các nguyên nhân khác (đèn, cho ăn, mật độ cá) và đưa kế hoạch xử lý cụ thể. Tuy vậy Y hiểu sai \"bể đúc\" thành bể xi măng và gợi ý vài loại cây không hợp với bể 50cm. X quá ngắn, bỏ sót chuyện lọc bị tắt và không có các bước làm theo thứ tự. / X names the biggest fault: the filter is switched on and off, so the beneficial bacteria die and the water clouds again. It also gives clear steps on lighting, feeding and the Sunsun filter. It has some errors, though: it treats the tank as cement, miscounts the fish and calls a 50% water change harmful. Y is accurate but thin. It misses the filter being turned off and gives no step-by-step plan.

**Ours lacks:** too-thin, plan, tank-fit, diagnosis. **Plain lacks:** too-long, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Theo cẩm nang, nước xanh đục thường do thừa ánh sáng và thừa dinh dưỡng: đèn bật quá 8–12 tiếng mỗi ngày, bể nuôi quá dày, cho ăn nhiều, và thay nước nhiều lần hoặc thất thường cũng làm bể dễ bùng vi sinh. Với bể 50cm đang nhiều cá, bạn nên giảm đèn, giảm lượng ăn và thay nước đều đặn, nhỏ hơn mỗi tuần. Cẩm nang không nói lọc mới sẽ tự làm nước trong, nên nên sửa các nguyên nhân này trước khi mua lọc.
> 
> [Trích: Nước bể cá bị đục trắng, đục xanh: nguyên nhân và cách làm nước trong › Nguyên nhân]
> Nước đục trắng thường do một trong mấy nguyên nhân sau:
> - Cặn li ti quá nhỏ nên lọc không giữ lại đư…

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

**Judge:** Không câu trả lời nào nhắc đến việc bể bật đèn trắng 10 tiếng rồi tối lại bật đèn màu, hay việc thay gần 100% nước mỗi tuần. Y vẫn giúp được nhiều hơn vì có con số cụ thể: đèn 6–8 tiếng, cho ăn hết trong 2–3 phút, thêm cây vào bể đang chỉ có 2 cây ráy. Đổi lại, Y có vài lỗi nhỏ (gợi ý nuôi ốc nhồi, khuyên để nước lắng) và hơi dài. X đúng nhưng quá mỏng và chung chung. / Cả hai câu trả lời đều chung chung, không câu nào nhắc tới việc đèn trắng bật 10 tiếng cộng thêm đèn màu buổi tối, cho ăn 2 lần/ngày hay thay gần 100% nước. Y ngắn gọn, đúng và có phần trích cẩm nang để đọc tiếp. X dài, có vài chi tiết sai (để nước lắng để giảm nitrate, dùng ốc nhồi ăn tảo) và kết thúc bằng việc hỏi lại.

**Ours lacks:** tank-fit, figures, too-thin, follow-up. **Plain lacks:** tank-fit, too-long.

**Ours** (read 6 pages, stopped at the tools limit):

> Nước xanh đục là do tảo phù du nở rộ, thường vì thừa sáng, thừa dinh dưỡng hoặc cho ăn thừa. Cẩm nang khuyên cắt nguyên nhân trước (rút ngắn đèn, dời bể khỏi nắng, cho ăn ít lại), rồi che tối tối đa 7 ngày hoặc dùng đèn UV, và duy trì thay ít nhất 20% nước mỗi tuần. Tảo nâu thường là tảo cát, hay bùng ở bể mới: hạn chế châm phân nhiều và đèn mạnh, và hút bớt các mảng lớn khi thay nước.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Nguyên nhân]
> - Thừa sáng. Thủ phạm hay gặp là nắng chiếu thẳng vào bể, nắng hắt từ cửa sổ, hoặc bật đèn quá lâu.
> - Thừa dinh dưỡng. Ví dụ…

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

**Judge:** Y explains why the water turns green every 3 weeks: waste builds up while the balcony sun drives algae. It also gives other reasons the fish die and steps that fit an outdoor balcony tank in Vietnam: shade netting, water hyacinth (lục bình) and other floating plants, less feeding, partial water changes, UV and a backup air pump. X is mostly a generic guide excerpt. It doesn't explain why this tank keeps going green or what else kills the fish, and it doesn't fit their setup. / Answer X explains why the water turns green on a roughly 3-week cycle in an outdoor tank: nutrients build up and the algae bloom. It names the likely reasons the fish die (no oxygen at night, ammonia, pH from the cement) and gives steps that fit the tank: shade cloth, floating plants, small weekly water changes, UV, a backup air pump. Answer Y is correct but thin. Its guide excerpts talk about light hours and fertiliser, which don't apply to an outdoor tank with no plants.

**Ours lacks:** tank-fit, diagnosis, too-thin. **Plain lacks:** too-long.

**Ours** (read 6 pages, stopped at the tools limit):

> Theo cẩm nang, bể để nắng gắt ngoài trời là nguyên nhân hay gặp nhất. Hãy che bớt nắng hoặc dời bể trước, rồi làm trong nước bằng cách che tối tối đa 7 ngày hoặc dùng đèn UV, xong thay nhiều nước để vớt xác tảo, và duy trì thay ít nhất 20% nước mỗi tuần. Nước xanh tự nó không giết cá, nhưng ban đêm tảo lấy oxy và khi tảo chết hàng loạt oxy có thể cạn, nên bể phải sủi liên tục; nếu cá nổi đầu sáng sớm hoặc đớp khí thì cần xử lý oxy ngay.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Chữa]
> Phần lớn trường hợp chỉ cần làm đủ các bước sau:
> 1. Tìm và cắt nguyên nhân: rút…

**Plain** (2214 characters):

> Nước xanh lè thường do **tảo đơn bào** bùng phát. Bể ngoài trời, đáy trống, có nhiều cá, cho ăn đều thì rất dễ gặp. Chu kỳ khoảng 3 tuần cho thấy dinh dưỡng (phân cá, thức ăn thừa) tích tụ dần rồi tảo bùng lên.
> 
> **Cá chết đột ngột có thể do:**
> - **Thiếu oxy vào ban đêm**: tảo tạo nhiều oxy ban ngày nhưng tiêu thụ oxy ban đêm. Khi tảo chết hàng loạt, oxy tụt rất nhanh. Cá thường nổi đầu, há miệng vào sáng sớm.
> - **Amoniac/nitrit tăng**: do phân và thức ăn thừa phân hủy, nhất là khi lọc sinh học yếu.
> - **pH dao động mạnh**: ban ngày pH lên cao vì tảo quang hợp, và bể đúc mới thường có pH cao do…

### algae-09 · tank · ours wins (6 · 5)

**Asked:** Bể tôi cứ khoảng ba tuần sau khi thay nước lại xanh lè và cá chết, trị sao?

**Judge:** X đúng trọng tâm hơn: nắng là nguyên nhân chính, và nó cảnh báo đúng chuyện tảo hút oxy ban đêm hoặc chết hàng loạt làm cá chết. Nhưng X mỏng và không nói thẳng về bể đúc ngoài ban công. Y dài, chung chung, đưa ra cơ chế chu kỳ nitơ đáng ngờ và khuyên giảm giờ đèn trong khi bể dùng nắng tự nhiên. Điểm cộng của Y là bảo test amoniac/nitrit. / Y doesn't read the tank details closely, but it names direct sun as the cause and explains the oxygen crash, which together account for both the green water and the dead fish. X gives a longer step-by-step plan, but it is generic, and its main diagnosis (a broken nitrogen cycle) probably misses the real cause, which is the balcony sun.

**Ours lacks:** tank-fit, diagnosis, figures, plan, too-thin. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 6 pages, stopped at the calls limit):

> Theo cẩm nang, nước xanh tự nó không giết cá, nhưng ban đêm tảo lấy oxy và khi tảo chết hàng loạt oxy có thể cạn, nên cần để sủi và lọc chạy liên tục và xem cá có đớp khí hay lờ đờ không. Cách trị là cắt nguyên nhân (rút ngắn đèn, tránh nắng, cho ăn ít lại, đo nitrat và phosphat), làm trong bằng che tối tối đa 7 ngày hoặc đèn UV, rồi thay nhiều nước và duy trì thay ít nhất 20% mỗi tuần. Cẩm nang không giải thích vì sao bể cứ tái xanh sau khoảng ba tuần, nên bạn nên kiểm tra lại đèn, lượng thức ăn và nitrat sau mỗi lần thay nước.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tả…

**Plain** (2324 characters):

> Bể xanh lè (nước xanh do tảo đơn bào hoặc vi khuẩn bùng phát) và cá chết sau mỗi vài tuần thường có nguyên nhân liên quan đến **chu trình nitơ bị phá vỡ** hoặc **nước máy/cách thay nước**. Chu kỳ 3 tuần khá gợi ý: khi bạn thay nước hoặc vệ sinh lọc quá mạnh, vi khuẩn có lợi bị mất, amoniac/nitrit tăng, rồi tảo bùng lên khi hệ vi sinh tái lập.
> 
> ## 1. Xử lý ngay khi đang xanh và cá yếu
> - **Test nước** (amoniac NH3/NH4⁺, nitrit NO2⁻, nitrat NO3⁻, pH, nhiệt độ). Nếu amoniac hoặc nitrit > 0, đây là nguyên nhân chính làm cá chết.
> - **Thay 30–50% nước** bằng nước đã khử clo, nhiệt độ gần bằng nước b…

### algae-10 · post · plain wins (4 · 6.5)

**Asked:** Có cách nào cứu bể em không: rêu hại dạng sợi màu nâu nhỏ nhỏ bám trên lá cây, sau đó bụi nền dính đầy vào. Thả nhiều tép thì sạch ngay, nhưng bể em nuôi nhiều thần tiên, thả tép vào thì tép bị ăn hết trước cả rêu.

**Judge:** Y là câu trả lời giúp được người hỏi. Bạn ấy biết làm gì trước, làm gì sau. Y cũng trả lời thẳng chuyện tép bị thần tiên ăn và gợi ý con ăn rêu thay thế như ốc nerite và cá tỳ bà, dù vài tên tiếng Việt bị gọi sai. X chỉ nói chung chung kiểu bể mới, không có các bước cụ thể, và còn né câu hỏi thần tiên có ăn tép không. / X gives a full plan and deals with the angelfish problem by suggesting snails, otos and plecos in place of shrimp, though it gets some Vietnamese names wrong. Y names tảo cát correctly but is thin and ignores the angelfish issue the hobbyist already described.

**Ours lacks:** plan, tank-fit, too-thin. **Plain lacks:** diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Đám sợi nâu bám lá rồi bụi nền dính vào thường là tảo cát (rêu nâu), và cẩm nang ghi phần lớn trường hợp chỉ là giai đoạn của bể mới, sẽ tự qua. Cách xử lý trong cẩm nang gồm đẩy nhanh quá trình trưởng thành của bể bằng mulm hoặc vật liệu lọc cũ, tăng khối lượng cây để cây cạnh tranh với tảo, và chà rêu thủ công. Cẩm nang chưa cho tôi thông tin về việc thần tiên có ăn tép hay không, nên bạn cần tự kiểm tra thêm trước khi thả tép.
> 
> [Trích: Cách kiểm soát tảo nâu (tảo cát) trong bể thủy sinh › Cách xử lý]
> - Đẩy nhanh quá trình trưởng thành sinh học của bể bằng mulm hoặc vật liệu lọc cũ.
> - Tăng …

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

**Judge:** Y is the more useful answer. It gives a real plan: remove the algae by hand, cut light to 6–8 hours a day and change 20–30% of the water. It also suggests algae eaters other than shrimp, such as Nerite snails and otto, which suits a tank with angelfish. Its weak points are that it doesn't use the fact that they keep angelfish, it mixes up two fish names, and it gives no H₂O₂ dose. X only says to wait for the algae to clear and doesn't solve the problem of angelfish eating the shrimp. / X gives a usable plan: remove the algae by hand, cut back light and nutrients, and swap shrimp for nerite snails or otos, which are safe with angelfish. It does have a few small factual slips and doesn't use the fact that they keep angelfish. Y is thin and ignores the angelfish. It doesn't solve the shrimp problem and only links to guide excerpts.

**Ours lacks:** tank-fit, plan, too-thin. **Plain lacks:** tank-fit, figures, too-long.

**Ours** (read 6 pages, stopped at the calls limit):

> Cẩm nang nói rêu nâu (tảo silic) thường chỉ là giai đoạn của bể mới và sẽ tự hết sau khoảng 3–4 tuần; kính và đá thì chà bằng mút hoặc bàn chải đánh răng, còn lá cây để cá, tép, ốc dọn. Về tép bị cá ăn, cẩm nang chỉ ghi rằng tép nhát, ban ngày trốn trong bể rậm cây và ra ăn rêu lúc tắt đèn, nên chưa có hướng dẫn riêng để bảo vệ tép khỏi cá; bạn nên kiểm tra xem loài cá đang nuôi có ăn tép không trước khi thả thêm.
> 
> [Trích: Rêu nâu (tảo silic) trong bể thủy sinh: nguyên nhân và cách xử lý › Cách xử lý rêu nâu]
> Có ba cách, và bạn có thể kết hợp chúng với nhau.
> 1. Chờ. Vì đây chỉ là một giai đoạ…

**Plain** (2088 characters):

> Rêu sợi nâu thường xuất hiện khi bể dư dinh dưỡng, đèn sáng hoặc chiếu quá lâu, hoặc nước không ổn định. Bạn nên xử lý cả nguyên nhân lẫn rêu đang có.
> 
> **1. Xử lý rêu đang bám**
> - Dùng tay (đeo găng) hoặc bàn chải mềm lau, gỡ sợi rêu khỏi lá. Với rêu sợi thì gỡ bằng tay hoặc dùng que/đũa cuốn rêu rồi kéo ra.
> - Cắt bỏ những lá đã bị bám nặng, đặc biệt là lá già.
> - Nếu rêu bám quá nhiều, có thể tạm dùng H₂O₂ (oxy già) nhỏ trực tiếp lên chỗ rêu (liều thấp, dùng ống tiêm, tránh dính vào cá và cây mềm), rồi thay nước ngay sau đó. Cách này có thể làm hại cây nhỏ nên thử trước trên một lá.
> 
> **2. Giả…

### algae-11 · post · plain wins (4.5 · 7)

**Asked:** Nhà mình dùng nước máy làm nước bể cá. Trước ở chỗ khác, thả cá vào mấy tháng mới phải thay nước một lần. Giờ chuyển về chỗ mới, để bể không có cá (chỉ 1 con cá dọn bể) thì không sao, nhưng cứ thả cá vào chưa đến một tuần là nước chuyển sang màu xanh lá cây, xanh đậm dần rồi cá chết. Bể không, không có cây cỏ gì cả. Trước có bỏ mấy gói tăng oxy gì đó, giờ không cho cũng vẫn vậy. Bắt bệnh giúp mình với.

**Judge:** Y is better. It names the right causes: a filter with too few beneficial bacteria, too much light with no plants, and low oxygen at night. It gives steps in order with numbers: change 30–50% of the water every day, cut lighting to 6–8 hours, increase aeration and stock only a few fish at first. X gets the cause right but is too thin. Its 20% weekly change is too weak for fish that are dying. / Cả hai đều đoán đúng nguyên nhân: bể mới chưa có vi sinh và nắng chiếu thẳng vào bể. X đưa ra kế hoạch đầy đủ hơn: thay 30–50% nước mỗi ngày, cấy vi sinh, tăng sục khí, thả ít cá, kèm danh sách thứ cần đo. Y thì quá mỏng, còn khuyên thay 20% mỗi tuần, quá yếu cho tình huống cá đang chết.

**Ours lacks:** plan, too-thin, figures. **Plain lacks:** too-long, local.

**Ours** (read 6 pages, stopped at the calls limit):

> Cẩm nang cho biết nước xanh là do tảo phù du nở rộ, bản thân nước xanh không trực tiếp giết cá, nhưng cá chết trong bể mới thường do amoniac tăng vọt khi bể chưa chạy vi sinh. Bể chuyển chỗ mà không mang theo bông lọc và vật liệu lọc cũ thì vi sinh có lợi thường không còn, nên bạn nên xem lại việc này. Trước mắt, hãy cho ăn ít lại, rút thời gian bật đèn xuống khoảng 6–8 giờ mỗi ngày, thay ít nhất 20% nước mỗi tuần, và nếu cá nổi đớp khí thì cần thêm oxy ngay; tôi chưa kiểm tra được chỉ số amoniac nên bạn nên đo thử.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Nguy…

**Plain** (3129 characters):

> Triệu chứng này khớp nhất với **chu trình nitơ chưa ổn định** kết hợp với **tảo nở hoa (nước xanh)**. Cá chết thường do amoniac/nitrit tăng cao hoặc thiếu oxy khi tảo bùng lên.
> 
> ## Nguyên nhân có thể
> 
> **1. Lọc sinh học chưa hoạt động tốt ở chỗ mới (khả năng cao nhất)**
> - Ở chỗ cũ, bể chạy mấy tháng nên vi khuẩn có lợi trong vật liệu lọc và thành bể đã phát triển đủ.
> - Khi chuyển đi, vi khuẩn có thể bị giảm mạnh (rửa vật liệu lọc bằng nước máy có clo, thời gian gián đoạn, hoặc bể mới setup lại).
> - Khi thả cá, chất thải làm amoniac tăng. Bể chưa đủ vi khuẩn để chuyển hóa nên amoniac và nitrit t…

### algae-11 · tank · plain wins (3.5 · 7)

**Asked:** Bể tôi cứ thả cá vào là chưa tới một tuần nước xanh lè rồi cá chết, vì sao?

**Judge:** Y nói rõ nguyên nhân chính là bể chưa chạy vi sinh và tảo nở hoa, có nhắc khử clo nước máy, rồi đưa ra các bước xử lý theo thứ tự kèm con số cụ thể. Có điều Y không dùng thông tin bể đã có: bể không cây, chỉ có một con cá dọn bể, từng dùng gói tăng oxy, ở chỗ cũ mấy tháng mới thay nước. Y còn hỏi lại họ dùng nước máy hay RO, dù đã biết là nước máy. X chủ yếu chỉ trích cẩm nang, không có các bước xử lý và không bám vào bể của người hỏi. / X names the likely cause: the tank isn't cycled (chưa chín bể), so ammonia builds up, plus an algae bloom. It then gives ordered steps with numbers: change 30–50% of the water, keep the light to 6–8 hours a day, cycle the tank for 3–6 weeks before adding fish. It does ignore what the app knows about this tank (tap water, no plants, months between water changes before), and it even asks whether they use tap water. Y only points to guide excerpts and gives no step-by-step plan.

**Ours lacks:** plan, too-thin, tank-fit. **Plain lacks:** tank-fit.

**Ours** (read 6 pages, stopped at the calls limit):

> Theo cẩm nang, nước xanh tự nó không trực tiếp giết cá, nhưng ban đêm tảo dùng nhiều oxy và cá có thể chết nếu bể thiếu oxy. Với bể mới chưa chạy vi sinh, amoniac thường tăng vọt, và cho ăn quá nhiều cũng làm vậy, nên đây là nguyên nhân cần kiểm tra đầu tiên. Cẩm nang không chẩn đoán được đúng nguyên nhân trong bể của bạn, nên hãy xem các nguyên nhân liệt kê bên dưới và kiểm tra amoniac, oxy cùng lượng thức ăn.
> 
> [Trích: Nước bể cá bị xanh: nguyên nhân, cách xử lý và phòng tảo xanh › Nguyên nhân]
> - Thừa sáng. Thủ phạm hay gặp là nắng chiếu thẳng vào bể, nắng hắt từ cửa sổ, hoặc bật đèn quá lâu…

**Plain** (2070 characters):

> Nước xanh lè và cá chết trong vòng một tuần thường có hai nguyên nhân chính, và chúng thường đi cùng nhau:
> 
> **1. Bể chưa chu trình nitơ (chưa "chín bể") – nguyên nhân hay gặp nhất**
> - Cá thải ra **amoniac (NH₃)** qua mang, phân và thức ăn thừa. Amoniac rất độc.
> - Bình thường, vi khuẩn có lợi trong bể sẽ chuyển amoniac → **nitrit (NO₂⁻)** → **nitrat (NO₃⁻)** ít độc hơn. Bể mới chưa có đủ vi khuẩn này nên amoniac và nitrit tích tụ, làm cá bị ngộ độc, mang bị tổn thương và chết.
> - Amoniac và nitrat dư cũng là "thức ăn" cho tảo, nên tảo bùng nổ và làm nước xanh.
> 
> **2. Tảo đơn bào nở hoa (nước xan…

### setup-01 · post · plain wins (3 · 8)

**Asked:** Vợ em vừa bắt em đầu tư một bể thủy sinh, em đặt mua trọn bộ: bể dài 1m + chân gỗ + sục + lọc + đèn (2 bóng LED) + sưởi. Em ở Hà Nội, trời đang lạnh. Em mù mờ khoản này nên hỏi: 1) Bên setup bảo bật đèn liên tục 3 ngày đầu rồi khoảng 8h/ngày, nhưng em đọc trên mạng thì tuần đầu chỉ bật 50% công suất rồi tăng dần lên 100%, 8h/ngày để tránh rêu và cho cây thích nghi. Cách nào đúng? 2) Cho cá ăn tần suất thế nào? 3) Sưởi có nên bật 24/24 không? 4) Có nên mua thêm bình CO2 không, vì em thấy phải có cái này cây mới đủ chất? 5) Lọc họ trang bị chỉ qua sợi bông đơn giản, em đọc thấy phải lọc qua sứ, mà lọc ngoài thì không có chỗ đặt vì bể dùng chân gỗ, không có tủ. Lọc như của em có ổn không? 6) Nên thay nước mấy ngày một lần, lúc mới setup và lúc đã ổn định?

**Judge:** X chỉ trả lời câu về đèn và câu về thay nước, còn 4 câu kia thì tự nhận là chưa đọc được trong cẩm nang. Y trả lời đủ cả 6 câu, có con số cụ thể và hợp với bể 1m ở Hà Nội đang lạnh. Y còn đưa cách lọc thay thế khi bể không có tủ. Lời khuyên hạn chế thay nước lúc mới setup là chỗ yếu nhỏ của Y. / X trả lời đủ cả 6 câu với con số hợp lý (lịch đèn tăng dần, sưởi 24/24 ở 24–26°C, chưa cần CO2, thêm sứ hoặc dùng lọc treo/lọc vi sinh khi không có tủ, thay 20–30% mỗi tuần), lại nhắc thêm việc khử clo nước máy Hà Nội. Y chỉ trả lời câu đèn và câu thay nước rồi tự nhận không trả lời được 4 câu còn lại, nên người mới chơi gần như không có gì để làm theo.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** local.

**Ours** (read 2 pages, stopped at the tools limit):

> Cẩm nang chỉ rõ cách tăng dần: tuần đầu chỉ bật khoảng 5 tiếng ở 50% độ sáng, tuần hai 7 tiếng ở 70%, tuần ba 8 tiếng ở 80%, và nên giữ khung giờ cố định, không cần bật 24/24. Tuần đầu cũng nên thay 50% nước mỗi ngày, và cẩm nang khuyên chờ 7 đến 10 ngày trước khi thả cá. Các câu về tần suất cho cá ăn, sưởi 24/24, có nên mua bình CO2 và lọc sợi bông có ổn không thì mình chưa đọc được phần trả lời trong cẩm nang, nên chưa thể khẳng định.
> 
> [Trích: Chăm hồ thủy sinh mới set 3 tuần đầu: đèn, thay nước, cắt tỉa › Bắt đầu từ đâu]
> 1. Tuần đầu hạ đèn xuống 50%, bật 5 tiếng mỗi ngày, rồi lên lịch tăng…

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

### setup-01 · tank · plain wins (3 · 6)

**Asked:** Bể mới mua của tôi nên bật đèn, sưởi, thay nước thế nào và có cần mua thêm CO2 không?

**Judge:** Y gives a clear plan in order: cycle the tank, then light for 6–8 hours, heat to 24–28°C at about 1W/litre, change 20–30% of the water each week with a dechlorinator, and treat CO2 as optional. But Y doesn't use the 1m tank or Hanoi's cold season, and it doesn't answer whether to run the lights for 3 straight days or start at 50%. X barely gives any steps and says it has no guidance on water changes. / X là kế hoạch dùng được ngay: cho bể chạy cho chín (chu trình nitơ) trước, đèn 6–8 tiếng, sưởi 24–28°C, thay 20–30% nước mỗi tuần, và giải thích được khi nào cần CO2. Tuy vậy X viết chung chung, không dùng đến bể 1m, mùa lạnh Hà Nội hay câu họ đang phân vân về cách bật đèn. Y thì mỏng: tự nhận chưa có hướng dẫn thay nước, ví dụ công suất sưởi lại cho bể 38 lít, gần như không có bước nào để làm theo.

**Ours lacks:** plan, figures, tank-fit, too-thin. **Plain lacks:** tank-fit, local.

**Ours** (read 4 pages, stopped at the tools limit):

> Cẩm nang chưa có hướng dẫn đầy đủ về cách thay nước cho bể mới, và tôi chưa đọc được phần đó. Về CO2, cẩm nang nói không nhất thiết phải mua: bể không CO2 vẫn ổn, nhưng cây lên chậm hơn, ít loài để chọn và không rậm bằng. Với sưởi, cẩm nang có gợi ý công suất theo kích thước bể (ví dụ bể 38 lít dùng 50W hoặc 100W), còn đèn LED có hẹn giờ chỉ cần nếu bạn trồng cây.
> 
> [Trích: Danh sách cần mua cho bể cá mới (từ 21 đến 284 lít)]
> Câu người mới chơi hỏi nhiều nhất là: "Set một bể cá mới thì cần mua những gì?" Câu này không dễ trả lời. Đèn, sưởi hay phụ kiện mỗi bể một khác, tùy kích thước bể và nhi…

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

### setup-02 · post · plain wins (3.75 · 6.25)

**Asked:** Mình đang gom đồ để set hồ 60x40x40 chơi rêu taiwan, trân châu ngọc trai, la hán và ráy, bố cục bonsai. Phân nền dùng Gex xanh. Tư vấn giúp mình nên mua đèn và lọc loại nào?

**Judge:** Y gives light and filter specs, a photoperiod, models sold in Vietnam and a low-tech note that fits Gex. It does have some wrong pricing and filter-size mismatches. X only repeats generic rules of thumb with an oversized wattage range, says nothing about Gex or the plants' needs, and recommends no actual products. / X cho những lựa chọn đèn và lọc cụ thể, mua được ở Việt Nam, kèm số giờ chiếu và lưu lượng hợp với hồ rêu/ráy, dù có vài chỗ sai nhỏ về giá và công suất máy. Y chỉ đưa quy tắc chung chung, không gợi ý sản phẩm nào, tự nhận chưa tra phân nền Gex, và mức W/lít nó đưa ra quá cao cho kiểu hồ này.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** tank-fit.

**Ours** (read 5 pages, stopped at the tools limit):

> Với bể 60×40×40 cm (khoảng 96 lít), cẩm nang gợi ý đèn 0,5–1 W cho mỗi lít, tức khoảng 48–96 W; nếu bạn chỉ trồng cây xanh như rêu và ráy thì đèn LED trắng là đủ, RGB chỉ cần khi muốn lên màu cây đỏ. Về lọc, cẩm nang khuyên chọn loại ghi công suất khoảng gấp đôi thể tích bể, vì con số trên hộp thường lạc quan và thực tế nên chia đôi. Phần phân nền Gex xanh và các loài cá trong bố cục chưa mình kiểm tra được trong lần tra cứu này.
> 
> [Trích: Cách chọn đèn thủy sinh: nhiệt độ màu, công suất và số máng đèn › Tính công suất đèn cho bể]
> Với người mới, chỉ cần nhớ mức 0,5 đến 1 W cho mỗi lít nước. Mu…

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

### setup-02 · tank · ours wins (6.5 · 3.5)

**Asked:** Bể tôi sắp set nên mua đèn và lọc loại nào?

**Judge:** X uses the tank's real size: it works out 96 L and 960 L/h, compares lọc thùng with lọc treo, and names light brands sold in Vietnam in the right length. But it misses that rêu, ráy and la hán are low-light plants, so a mid-range light is enough. Y asks for details the app already holds and gives generic rules, and its W/lít rule is wrong. / Y dùng đúng kích thước bể 60×40×40 (khoảng 96 lít) để đưa ra lưu lượng lọc cụ thể khoảng 960 L/h, chọn giữa lọc thùng và lọc treo, gợi ý đèn 60 cm và các hãng có bán ở Việt Nam. Tuy vậy Y chưa nói đến nhu cầu sáng của trân châu ngọc trai và CO₂. X hỏi lại những thông tin app đã có sẵn, chỉ đưa quy tắc chung cho bể nào cũng được, và vài con số đã lỗi thời.

**Ours lacks:** tank-fit, figures, too-thin, follow-up. **Plain lacks:** tank-fit, asks-only.

**Ours** (read 5 pages, stopped at the tools limit):

> Với bể 60×40×40 cm trong "Bể của tôi" (khoảng 96 lít), cẩm nang khuyên chọn lọc có lưu lượng khoảng 10 lần thể tích bể mỗi giờ, tức khoảng 960 lít/giờ. Nếu muốn nhiều vật liệu lọc và vi sinh ổn định hơn thì chọn lọc thùng, còn ít tiền hoặc muốn đơn giản thì lọc treo vẫn làm tốt. Về đèn, cẩm nang gợi ý chọn đèn của hãng uy tín như Chihiros, Twinstar hoặc Skylight, đúng cỡ với bể, và đèn dài khoảng 61 cm là cỡ đi kèm bể 60 cm trong danh sách mua sắm.
> 
> [Trích: Set bể thủy sinh đầu tiên: thiết bị, các bước và tháng đầu › Chọn bể, lọc và đèn thế nào]
> Bể. Chọn bể bạn thích, hợp với nhà và hợp túi t…

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

### setup-03 · post · plain wins (3 · 8)

**Asked:** Em có cái bể đang bỏ không, hiện chỉ có mỗi bể, không đèn không lọc không gì hết. Với tầm 3-4 triệu thì nên làm gì để hồi sinh nó? Thủy sinh rong rêu cũng được, còn cá thì em thích kiểu thả nhiều con cá nhỏ tí ti.

**Judge:** Y is better. It leaks-tests the tank the hobbyist already has, splits the 3–4 triệu budget at plausible local prices, picks suitable plants and small schooling fish, and gives a week-by-week plan that includes cycling the tank. X never answers the budget, tells them to buy a new tank, and recommends a cold-water fish that won't do well in Vietnam's heat. / X cho người chơi một kế hoạch đầy đủ, gồm chia ngân sách theo giá ở Việt Nam, chọn thiết bị, cây, nhiều loại cá đàn nhỏ, chu trình nitơ và lịch theo từng tuần. Y thì mỏng, không trả lời được câu hỏi về ngân sách, và gợi ý cá kim tơ là loài nước lạnh, không hợp với khí hậu Việt Nam.

**Ours lacks:** tank-fit, plan, figures, too-thin. **Plain lacks:** local.

**Ours** (read 4 pages, stopped at the tools limit):

> Với bể trống, cẩm nang gợi ý bắt đầu bằng bể nano 35–55 lít không viền, rồi tự chọn đèn và lọc đúng chiều dài bể; đèn yếu lúc đầu để rêu ít có cơ hội mọc. Cây dễ trồng như kiếm Amazon, Anubias hay Cryptocoryne sẽ giúp nước sạch hơn. Cá nhỏ đàn hợp nhất là cá kim tơ, hiền và dễ nuôi, nhưng nên nuôi từ sáu con trở lên. Cẩm nang không ghi giá tiền nên mình chưa xác nhận được mức 3–4 triệu có đủ hay không.
> 
> [Trích: Mua đồ set bể thủy sinh cho người mới: bể, đèn, lọc, sưởi, CO2 › Bắt đầu từ đâu]
> 1. Đo chỗ đặt bể và kiểm tra kệ có chịu nổi sức nặng không. Khoan sẵn lỗ luồn ổ điện nếu dùng tủ kín.
> 2…

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

### setup-03 · tank · plain wins (3 · 7)

**Asked:** Tôi có bể trống và 3-4 triệu, nên mua gì để làm bể thủy sinh nuôi đàn cá nhỏ?

**Judge:** X không biết người hỏi đã có bể, lại khuyên mua bể nano và chỉ nói theo ngân sách 15 triệu, nên không cho được danh sách mua nào để làm theo. Y liệt kê từng món kèm giá sát thị trường Việt Nam, có nhắc chạy bể cho đủ chu trình nitơ trước khi thả cá và hỏi kích thước bể. Y vẫn có vài lỗi chọn loài, như trân châu và tép crystal red không hợp người mới. / X đưa ra danh sách đồ cần mua kèm giá ước tính vừa với 3–4 triệu, có nhắc chạy bể 2–4 tuần cho chu trình nitơ trước khi thả cá và có lưu ý theo miền. Vẫn còn vài lỗi nhỏ về cây và tép. Y bỏ qua chuyện người hỏi đã có bể, dựa vào khung 15 triệu và không cho họ bước nào để làm ngay.

**Ours lacks:** tank-fit, plan, too-thin. **Plain lacks:** tank-fit.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang gợi ý bắt đầu với bể nano 35–55 lít không viền, rồi tự chọn đèn và lọc; bể 10–20 lít thì quá nhỏ cho cá. Cẩm nang tính cho cả bể khoảng 15 triệu (phần cứng khoảng 10 triệu, bố cục 2 triệu, cây 3 triệu, cá vài trăm nghìn), và nói có thể cắt còn khoảng 2/3 mà vẫn chơi ổn, nhưng không có phương án riêng cho 3–4 triệu. Với ngân sách đó bạn nên ưu tiên bể, đèn và lọc, chọn bố cục đơn giản và cây dễ trồng, rồi mới tính đến đàn cá.
> 
> [Trích: Mua đồ set bể thủy sinh cho người mới: bể, đèn, lọc, sưởi, CO2 › Chọn bể cỡ nào, loại nào]
> Người mới không cần lao vào bể lớn ngay. Bể nano là đủ để học…

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

### setup-04 · post · plain wins (2 · 8)

**Asked:** Mình muốn set hồ 60x36x36 để trên kệ tivi phòng khách chung cư nên cần tinh gọn, không có chỗ cho bình CO2, thùng lọc. Phương án của mình: bố cục đá Tiger + rêu mini fiss và ráy lá nhỏ ở tiền cảnh, rong La Hán + dương xỉ Java ở hậu cảnh, đều là cây cần ít CO2. Mình tính dùng lọc thác. Bố cục vậy có ổn không, nên dùng nền nào và bao nhiêu?

**Judge:** Y is the better answer. It checks the layout plant by plant, works out a correct amount of substrate (about 8–9 L), gives sensible light and flow figures, and points out the important weight risk on a TV stand. It never mentions cycling the tank or the heat in Vietnam. X answers nothing: it only points to a guide and asks the user to look up the plant name themselves. / X trả lời đúng câu hỏi. Nó nhận xét bố cục, chọn nền theo cây, tính lượng nền đúng (2160 cm² × 4 cm ≈ 8–9 lít), chọn lưu lượng lọc thác và cảnh báo tải trọng kệ TV. X chỉ thiếu lưu ý về nhiệt độ cho rêu Fissidens trong khí hậu nóng ở Việt Nam. Y không trả lời được gì, chỉ chuyển người hỏi sang cẩm nang và hỏi lại tên cây.

**Ours lacks:** asks-only, too-thin, tank-fit. **Plain lacks:** follow-up, local.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình chưa đọc được phần nền và bố cục trong cẩm nang nên chưa thể xác nhận phương án của bạn hay gợi ý lượng nền cụ thể. Cẩm nang có hướng dẫn set bể thủy sinh low-tech cho người mới, bạn nên đọc phần đó trước. Riêng "rong La Hán" mình chưa tìm thấy trong cẩm nang, bạn kiểm tra lại tên hoặc tên khoa học giúp mình.
> 
> [Trích: Hướng dẫn set up bể thủy sinh low tech cho người mới bắt đầu]
> Muốn lên tay nghề nuôi cá thì bạn thử trồng thêm cây thủy sinh sống. Có cây, bể trông tự nhiên hơn hẳn. Cây còn hút bớt chất thải độc trong nước nên nước sạch hơn cho cá. Phần dưới đây đi lần lượt từng bước set m…

**Plain** (3463 characters):

> **Nhìn chung phương án ổn**, đặc biệt với hồ 60x36x36 (khoảng 78 lít) và yêu cầu gọn nhẹ. Các cây bạn chọn đều chịu được ánh sáng thấp và CO2 thấp, không cần bình CO2 hay thùng lọc.
> 
> ## 1. Bố cục và cây
> 
> - **Đá Tiger**: hợp lý, bền, không làm đổi pH đáng kể. Nên đặt đá lệch một bên, cao dần về hậu cảnh để tạo chiều sâu.
> - **Rêu Fissidens mini và ráy lá nhỏ (Anubias nana) ở tiền cảnh**: ổn. Cả hai đều bám trên đá hoặc gỗ, không cần nền dinh dưỡng. Buộc hoặc keo (loại an toàn cho cá) ráy lên đá, **không vùi thân rễ xuống nền**, nếu không sẽ thối. Fissidens mini hơi khó giữ hơn, cần nước sạch, í…

### setup-04 · tank · plain wins (2 · 5)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu, và chọn cây như vậy có ổn không?

**Judge:** Cả hai đều không dùng thông tin bể 60×36×36 và bộ cây của bạn. Y vẫn có công thức tính lượng nền, độ dày nền và xếp được rêu, ráy, dương xỉ Java vào nhóm cây hợp với đèn yếu, không CO₂, nên dùng được ngay. Nhưng Y không nói ra điều quan trọng nhất: bộ cây này hầu hết là cây bám đá/lũa, nên chỉ cần nền mỏng, rẻ, rồi buộc cây lên đá Tiger. X chỉ trích đoạn cát lọc hồ bơi 18 kg của một bể mẫu, ngoài ra chỉ hỏi lại tên cây. / X asks again for details the app already had, and its example uses 60×30 cm. Still, it gives a usable substrate depth (3–5 cm), a formula with kg-per-litre figures for working out the amount, and a note that moss, Anubias and Java fern grow fine without CO₂. Y mostly asks back for the plant list. Its only figure, 18 kg of pool-filter sand, comes from another tank, so the hobbyist has almost nothing to act on.

**Ours lacks:** too-thin, tank-fit, asks-only. **Plain lacks:** tank-fit, diagnosis, plan.

**Ours** (read 3 pages, stopped at the calls limit):

> Cẩm nang mới chỉ cho biết nền cát lọc hồ bơi khoảng 18 kg trong một bể mẫu, chưa nói lượng cho bể 60×36×36 cm của bạn, và tôi chưa đọc được phần chọn nền theo từng loại. Về bộ cây, cẩm nang có danh sách cây dễ cho người mới nhưng chưa thể kiểm tra cây của bạn nếu chưa biết tên. Bạn cho tôi danh sách cây định trồng để tôi đối chiếu với cẩm nang.
> 
> [Trích: Set bể cá tự làm: đèn LED dây, nền cát, lọc vi sinh và chống sự cố › Đổ nền cát cho bể nuôi cá]
> Nền dùng ở đây là cát lọc hồ bơi, khoảng 18 kg. Loại cát này sạch và rẻ hơn hẳn cát bán riêng cho thủy sinh. Có loại vẫn cần rửa, nhưng loại dùng t…

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

### setup-05 · post · plain wins (3 · 7)

**Asked:** Em định set hồ 1m2x50x50 phong cách natural, chủ yếu rêu, ráy với ít cây cắt cắm lá đỏ. Nên chọn nền thế nào, bao nhiêu kg cho phù hợp và kinh tế? Em tính xài nền trộn kết hợp Aquafor thì ổn không? Đèn em xài T5HO, 2 bóng 10k, 1 bóng 6k5, 1 bóng hồng có hợp lý không?

**Judge:** Y answers all three questions: substrate amounts for the 120×50 base with a slope from back to front, the Aquafor mix, and the lights, including the warning that 4 T5HO tubes are strong without CO₂. X only answers part of the substrate question and says outright that it can't cover Aquafor or the lights. / X is the better answer. It covers all three questions: how to layer the substrate, how many kg for 120×50, and whether the 4-tube T5HO setup works. It also warns that this much light without CO₂ invites algae and suggests cutting tubes or the photoperiod. Y gives only a volume figure and a few brand names, and openly says it can't answer the Aquafor or lighting questions.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** local.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang khuyên người mới dùng phân nền công nghiệp tầm trung như Gex xanh hoặc Control Soil; tự trộn nền thì rẻ hơn nhưng cần kinh nghiệm và dễ bung nền. Phân nền bán theo lít chứ không theo kg, và lớp nền nên dày tối thiểu 3–4 cm, nên với đáy 120×50 cm bạn cần khoảng 24 lít rồi mua dư thêm. Cẩm nang chưa nói về việc trộn thêm Aquafor hay về đèn T5HO của bạn, nên mình chưa trả lời được hai phần đó.
> 
> [Trích: Cách chọn phân nền thủy sinh cho người mới: loại nào, mua bao nhiêu › Nền trộn hay phân nền công nghiệp]
> Hồi thủy sinh chưa phổ biến và chưa có nhiều sản phẩm làm sẵn, dân chơi thường tự …

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

### setup-05 · tank · plain wins (3 · 4.5)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu kg, và đèn như vậy có đủ cho cây đỏ không?

**Judge:** Neither answer uses the T5HO light or the Aquafor in the profile. Y is still more useful: it gives a correct formula for working out how many kg of substrate to buy (120×50×6 cm ≈ 36 L), explains layering, and covers the light/CO₂/fertiliser balance red plants need. X says it can't calculate substrate, points to an unrelated 18 kg pool-sand example, and gives an inflated wattage target. / Neither answer uses the tank details the app holds. X at least gives a substrate formula, a sensible depth and the balance of light, CO₂ and nutrients for red plants, so the hobbyist could work out their own numbers. Y uses the tank size but mostly says the guide doesn't have the answer, points to an unrelated 18 kg sand example, and wrongly treats their light as unknown.

**Ours lacks:** plan, tank-fit, too-thin. **Plain lacks:** tank-fit, asks-only.

**Ours** (read 2 pages, stopped at the calls limit):

> Cẩm nang chưa cho đủ thông tin để tôi trả lời trọn vẹn. Về đèn, cẩm nang ghi LED trắng chủ yếu hợp cây xanh, muốn cây đỏ lên màu thì nên dùng LED RGB hoặc WRGB, và công suất nên khoảng 0,5–1 W mỗi lít nước; bể 120 × 50 × 50 cm (khoảng 300 lít) sẽ cần khoảng 150–300 W, nhưng bạn chưa nói đèn của mình là loại nào nên tôi chưa kiểm tra được. Về nền, cẩm nang chỉ có ví dụ khoảng 18 kg cát lọc hồ bơi cho một bể cụ thể, không có công thức tính kg theo kích thước bể.
> 
> [Trích: Cách chọn đèn thủy sinh: nhiệt độ màu, công suất và số máng đèn › Bắt đầu từ đâu]
> 1. Đo bể và tính số lít nước, rồi nhân với …

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

**Judge:** Y trả lời trực tiếp cả hai câu hỏi và bám theo danh sách cây của người hỏi, nhất là hồng thái dương cần sáng mạnh. Lời khuyên chọn 4 bóng nếu có CO₂, 2 bóng nếu chạy low-tech là hợp lý, dù có vài chỗ nhầm nhỏ. X né câu hỏi về đèn, nói sai rằng bể ít cây cần nền và quá sơ sài nên khó làm theo. / X trả lời được cả hai câu: trải cát mặt tiền, viền bằng đá cuội để giữ ranh giới với phân nền, và chọn 4 bóng nếu có CO₂ vì có hồng thái dương, 2 bóng nếu chạy low-tech. X có nhầm nhẹ chiều sâu với chiều cao hồ. Y quá mỏng, không chọn giữa 2 và 4 bóng, còn khuyên cát hạt thô để trồng cây cho một khoảng trống không trồng gì.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa có so sánh máng Odyssea 2 bóng và 4 bóng nên mình không chọn hãng hay số bóng cụ thể được. Theo cẩm nang, bể rộng 30 cm chỉ cần một máng đèn (đèn mảnh kẹp thành bể chiếu được khoảng 30 cm, đèn treo khoảng 40–50 cm). Phần trống mặt tiền có thể phủ cát rẻ tiền trông tự nhiên vì bể này ít cây cần nền; cát hạt thô hoặc sỏi vừa trồng cây tốt hơn cát quá mịn.
> 
> [Trích: Cách chọn đèn thủy sinh: nhiệt độ màu, công suất và số máng đèn › Bể cần mấy máng đèn]
> Bể kích thước tiêu chuẩn thường chỉ cần một máng đèn. Số máng phụ thuộc vào chiều rộng (chiều sâu từ trước ra sau) của bể và kiểu đèn…

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

**Judge:** Y is the better answer. It covers both questions: build a sloped front sand strip kept separate from the soil, and use about 30–40 W for a 60×30×36 tank (around 65 L). Like X, it never directly says whether 2 or 4 Odyssea bulbs is right. X skips the sand question entirely and works out the wattage for the wrong tank volume. / Neither answer used the tank details or answered the real choice between the 2-bulb and 4-bulb Odyssea. X still says yes to sạn mặt tiền with practical tips, and by luck its example for 60×30×36 (30–40 W) matches their tank. Y skips half the question and works out the light for the wrong size.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** tank-fit, too-long.

**Ours** (read 5 pages, stopped at the calls limit):

> Cẩm nang chưa nói rõ việc trải sạn riêng ở mặt tiền bể, nên mình chưa trả lời được phần này. Về nền, cẩm nang chỉ viết rằng cây ít cần dinh dưỡng thì có thể rải cát rẻ tiền hoặc sỏi, và nên chọn nền theo loài cây bạn định trồng. Về đèn, cẩm nang tính 0,5 đến 1 W cho mỗi lít nước: bể 60×30×30 cm (54 lít) cần khoảng 27 đến 54 W, còn đèn LED thì xét theo lumen, khoảng 20 lumen cho mỗi lít.
> 
> [Trích: Cách chọn đèn thủy sinh: nhiệt độ màu, công suất và số máng đèn › Tính công suất đèn cho bể]
> Với người mới, chỉ cần nhớ mức 0,5 đến 1 W cho mỗi lít nước. Muốn biết bể bao nhiêu lít thì lấy dài × rộng …

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

### setup-07 · post · plain wins (2.5 · 7.5)

**Asked:** Cửa sổ nhà em bị bít nên em tháo ra, được một hõm sâu 20cm, cao 90cm, dài 100cm, em định làm bể cá âm vào đó kiểu bán cạn: hồ kính dài 90cm (chừa 10cm bố trí lọc), sâu 20cm, cao 50cm (mực nước 40cm), đèn 90cm treo phía trên. Thả 1 cục lũa cao hơn mặt nước, xếp ít đá xung quanh, phía sau trải nền trồng cây dễ sống, phía trước trải cát, trồng thêm ít cây vượt mặt nước như dương xỉ, cỏ đồng tiền, khoai lang. Cá nuôi tầm 10 con bảy màu, ít con bống dọn bể. Lọc em định dùng 1 lọc thác 8W và 1 lọc vi sinh (chạy bằng bơm oxy) với vật liệu lọc là sứ vì nuôi ít cá. Các cụ góp ý giúp em.

**Judge:** Y đi qua đúng những việc dễ hỏng khi làm bể âm tường: sức nặng, chống thấm, an toàn điện, bảo trì, phải có lọc cơ học trước lớp sứ, chọn bống cỡ nhỏ và chạy chu trình nitơ. Vẫn còn vài lỗi nhỏ nhưng người chơi có thể làm theo được. X quá sơ sài, gần như chỉ nhắc lại sức chứa và tự nhận chưa đọc được phần lọc với cây. / X đi qua hết các điểm thực tế của bể âm tường: chịu tải, chống thấm, an toàn điện, nền, cây, chọn loại bống, lót bông lọc trước lớp sứ và cách chạy chu trình vi sinh. Y gần như không góp ý được gì, tự nhận chưa đọc tài liệu và còn trích một hướng dẫn về bể cóc không liên quan.

**Ours lacks:** too-thin, plan, tank-fit. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Theo cẩm nang, 10 con bảy màu trong hồ 90x20x40 cm ở mức ổn (khoảng 82% sức chứa), và bảy màu là cá hiền, sống tốt ở 17–28°C. Phần lọc bằng sứ, danh sách cây và con bống dọn bể mình chưa đọc được trang chi tiết nên chưa dám khẳng định; trước khi đổ cát và trồng cây, bạn nên đổ nước thử để tìm mực nước thấp nhất mà lọc vẫn chạy ổn, như cẩm nang bể bán cạn hướng dẫn.
> 
> [Công cụ: Nuôi chung (đã điền sẵn: ca=ca-bay-mau:10, l=90, w=20, h=40)]
> 
> [Trích: Dựng bể bán cạn (paludarium) có thác nước cho cóc bụng lửa › Chọn lọc và xác định mực nước trước tiên]
> Thác nước cần dòng chảy ổn định, không cần quá…

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

**Judge:** X at least reads the size and fish from the app and gives a stocking load of 66%. But it ignores the filter, plants and the window-alcove setup that are already saved, so it adds little. Y ignores the saved tank completely, asks for everything again and gives only generic tips. Neither one flags the risks of sunlight and heat in a window alcove. / Neither answer is very useful. Y at least reads the saved tank (size, 10 guppies plus a bottom cleaner) and gives a stocking figure, but it ignores the filter and plant details that are already saved. It also says nothing about the window alcove (sun, heat, algae) or that the guppies will breed. X ignores the tank completely, asks again for everything, and only offers general advice.

**Ours lacks:** too-thin, tank-fit, asks-only, plan. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 0 pages):

> Mình thấy bể đã lưu của bạn (90×20×50 cm) đang có 10 cá bảy màu và 1 bống dọn bể; theo kiểm tra, mức tải hiện là 66%, ở mức vừa phải nên ổn định với lọc và thay nước thường lệ. Cẩm nang chưa có thông tin về bộ lọc và cây bạn định dùng, nên bạn cho mình biết loại lọc và các loại cây dự định để mình kiểm tra cụ thể hơn.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 90×20×50 cm]
> Mức đầy bể: 66% — 66% · Vừa phải: bể ổn định với lọc và thay nước thường lệ.
> Chưa kiểm tra bống dọn bể: cẩm nang chưa có trang nên chưa có số liệu để so.
> 
> [Gợi ý hỏi tiếp] Thêm cây thủy sinh nào hợp với bể này? · Bể 90×20×50 cần …

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

**Judge:** Y gives useful advice on substrate depth, accessories and fish. But it wrongly tells the hobbyist that 5 mm glass is fine for a 45 cm-high tank, which is a real breakage and flooding risk. X gets the most important safety point right (the glass is too thin), even though it doesn't answer the questions about substrate and fish. / Neither answer is good. X tells the reader that 5 ly glass is safe for a 45 cm tall tank, which is wrong on the main safety question. Y gets the glass question right and shows the guide on substrate depth, but it skips the substrate, accessory and fish questions. Y is still slightly better because it avoids a dangerous mistake.

**Ours lacks:** too-thin, plan, tank-fit, figures. **Plain lacks:** wrong, unsafe, too-long.

**Ours** (read 5 pages, stopped at the calls limit):

> Theo cẩm nang, bể dài 60–80 cm cần kính tối thiểu 8 ly, và nếu bố cục nhiều đá thì nên làm đáy 10 ly, nên kính 5 ly của bạn là mỏng so với mức này. Cẩm nang cũng khuyên bể từ 60 cm trở lên dùng chân sắt hộp chắc chắn và tấm lót đáy, không dùng tủ gỗ ép. Cẩm nang chưa ghi độ dày nền cụ thể hay danh sách cá hợp với bể này, nên phần đó mình chưa trả lời được.
> 
> [Trích: Cách chọn bể thủy sinh: kích thước, độ dày kính và loại kính › Kính dày bao nhiêu là an toàn]
> Bể cá thông thường chỉ chứa nước và cá, lực đè chủ yếu lên bốn mặt kính bên. Bể thủy sinh thì chứa cả nền, phân nền, lũa, đá. Vì vậy tấm …

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

### setup-08 · tank · plain wins (2 · 6)

**Asked:** Tôi có sẵn bể, cần mua gì và nuôi cá gì để làm bể thủy sinh tiết kiệm?

**Judge:** Y đưa kế hoạch đầy đủ, dùng được ngay: thiết bị, cây, cá, chu trình nitơ, thay nước. Tuy vậy Y hỏi lại kích thước bể, tính theo bể 60 lít, và khuyên mua sưởi dù ở Việt Nam thường không cần. X tính sai thể tích bể (57 lít thay vì khoảng 120 lít), gợi ý bơm quá yếu và không gợi ý loài cá nào. / I'd rather this hobbyist got X. It gives a complete, usable budget plan covering equipment, easy plants, cheap fish and cycling the tank, though it guesses the wrong tank size and has a few small mistakes. Y is very thin, uses the wrong volume, and offers no fish advice at all.

**Ours lacks:** too-thin, wrong, plan, tank-fit. **Plain lacks:** tank-fit, local.

**Ours** (read 4 pages, stopped at the calls limit):

> Theo cẩm nang, với bể sẵn có bạn nên tận dụng thiết bị đang dùng hoặc mica, nhựa thừa trước, rồi mới mua phần còn thiếu. Bơm mini khoảng 300 lít/giờ đủ cho bể 57 lít, và CO2 tự chế từ axit citric với baking soda là lựa chọn rẻ. Phần chọn loài cá tiết kiệm thì tôi chưa đọc được mục nào trả lời, nên chưa thể gợi ý cụ thể.
> 
> [Trích: Set bể thủy sinh nano tiết kiệm: tự làm lọc bông góc, đèn LED và CO2 › Bắt đầu từ đâu]
> 1. Chọn kích thước bể và quyết định trồng cây gì. Có định trải thảm hay không sẽ quyết định cần một hay hai bóng đèn và có cần CO2 mạnh không.
> 2. Làm lọc bông góc trước khi đổ nền, …

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

### setup-09 · post · not judged

**Asked:** Em có cái hộc giá sách, định làm bể dài 170x30x35, mặt trước kính siêu trong để vào đó. Layout đơn giản: nền cát và cuội hoặc đá, thêm ít lũa và ráy; cá thì loại size nhỏ dễ nuôi, ít tốn công chăm và ít thay nước. Em định dùng lọc thùng, với size bể này có phù hợp không? Em định dặn bên làm bể chừa lỗ chờ cho lọc ở 2 đầu bể.

**Ours** (read 4 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (2866 characters):

> Bể 170×30×35 cm, khoảng 178 lít tổng, nên đủ rộng để nuôi cá nhỏ đẹp. **Lọc thùng rất hợp** với kích thước này, thậm chí là lựa chọn tốt nhất trong các loại lọc thường dùng, vì bể dài và sâu nên cần lưu lượng lớn và bể ít tốn chỗ cho lọc.
> 
> **1. Chọn công suất lọc**
> - Với bể cá nhỏ, nên lọc đảo nước khoảng **6–8 lần/giờ** (tổng thể tích bể) cho cá nhỏ, và có nhiều cây thì vẫn tốt.
> - Tức là khoảng **1000–1400 L/h** là hợp lý. Chọn thùng có công suất thực tế (không chỉ ghi trên hộp) khoảng 1000 L/h trở lên, loại có thể chỉnh lưu lượng.
> - Có thể dùng thùng cỡ vừa đến lớn (ví dụ dòng Sunsun, Eheim…

### setup-09 · tank · plain wins (3 · 5.5)

**Asked:** Bể tôi định làm dùng lọc thùng có hợp không, và nuôi cá gì cho ít phải chăm?

**Judge:** X stays close to the guide, but it says almost nothing about fish and never uses the tank's ~178 L size. Y answers both questions with a usable fish list and care tips, though it ignores the tank's details (the tank sits inside a bookshelf, the filter holes are at both ends, and the keeper wants few water changes), asks for a volume that is already known, and has some naming and fish-choice slips. / X là câu trả lời chung chung: không dùng kích thước bể khoảng 178 lít, không nói đến việc bể dài nên đặt đầu hút và đầu xả ở hai đầu, và có lỗi tên cá. Dù vậy X vẫn trả lời được cả hai câu hỏi. Y chỉ nói sơ về lọc thùng (có nhắc rủi ro mất điện, đúng với hoàn cảnh ở Việt Nam) và hoàn toàn bỏ ngỏ phần chọn cá ít phải chăm.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** tank-fit, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Theo cẩm nang, lọc thùng là loại mạnh và êm, rất hợp nếu bạn sẵn sàng bảo trì: muốn vệ sinh thường phải tháo rời cả hệ thống, và vật liệu lọc nằm kín ngoài hồ nên khi mất điện lâu vi khuẩn có lợi dễ chết. Cẩm nang cũng nói sức lọc phụ thuộc vào lượng và loại vật liệu chứa được hơn là lưu lượng. Còn phần cá ít phải chăm, tôi chưa mở được trang chăm sóc nào để xác nhận, nên chưa thể gợi ý chắc chắn.
> 
> [Trích: Lọc thùng, lọc treo cho bể cá: cách chọn, xếp vật liệu và vệ sinh › Chọn lọc nào]
> Một chiếc lọc thùng mạnh hay yếu chủ yếu nằm ở chỗ nó chứa được bao nhiêu vật liệu và đó là vật liệu gì. Lư…

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

### cycling-01 · post · plain wins (4 · 6)

**Asked:** Bể em dài 90cm rộng 40, đã mua bình CO2 + trộn cánh quạt, lọc thùng DF1300, đèn Odyssea, nền 10kg loại nhiều chất, trồng trân châu ngọc trai, sao nhỏ và một đống cây cắm lưa thưa. Tuần đầu em lật ra lật vào 3 lần, mất một đống cây vì nhổ ra bị úa, nền mua thiếu thấy mỏng lại hút nước ra cho thêm. Hiện ngày nào em cũng thay 50% nước. Bể đang ổn định được 3 ngày, em định 1 tuần thì thả cá nhỏ như neon, 7 màu. Vậy đã thả được chưa, và nên mua sục oxy loại nào?

**Judge:** Y giúp người hỏi nhiều hơn. Y bám vào tình hình thực của bể: cây bị nhổ lên trồng lại nhiều lần, nền thiếu, đang thay nước mỗi ngày. Y cũng đưa mốc thời gian, mật độ cá neon cho bể 90×40 và lời khuyên về máy sục cụ thể. Tuy vậy Y khuyên sai khi bảo giảm thay nước với nền nhiều chất mới setup. X đúng về ý chính là chưa nên thả cá, nhưng quá mỏng và bỏ qua phần lớn những gì người hỏi kể. / X trả lời sát tình huống của người hỏi: chuyện thay nước, cây bị xáo trộn, nền, cách kiểm tra bể đã sẵn sàng và chuyện sục khí. X có vài sai sót như khuyên giảm thay nước khi nền nhiều chất còn đang nhả amoniac, và gợi ý thả tép để thử bể. Y đúng nhưng quá mỏng, bỏ qua chuyện thay nước 50% mỗi ngày, cây bị úa và nền mỏng, còn lý do không cần sục khí thì lẫn lộn.

**Ours lacks:** tank-fit, too-thin, follow-up, plan. **Plain lacks:** wrong, tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Theo cẩm nang, bể bạn chưa nên thả cá ngay: chu trình nitơ chỉ được coi là hoàn tất khi bạn cho cá ăn bình thường trong một tuần mà amoniac và nitrit vẫn ở 0 ppm, còn nitrat trên 0. Bể mới ổn định 3 ngày chưa đạt điều kiện này, nên hãy đo amoniac và nitrit mỗi 1-2 ngày, và khi đạt rồi mới thả cá từ từ, có khoảng chờ giữa các đợt. Với lọc thùng DF1300, cẩm nang nói lọc thùng đẩy nước bằng mô tơ điện nên không chạy bằng máy sục khí, bạn không cần mua thêm máy sục khí.
> 
> [Trích: Cycling bể cá nước ngọt: cách chuẩn bị trước khi thả cá mới › Cycling có cá (fish-in)]
> Cách này phổ biến nhất, được cả …

**Plain** (1970 characters):

> **Chưa nên thả cá lúc này.** Ba ngày là quá sớm, và có vài lý do:
> 
> - **Bể chưa chu trình nitơ.** Nền dinh dưỡng và vi sinh có lợi cần vài tuần mới hình thành đủ. Trong giai đoạn này amoniac có thể tăng đột ngột, và cá nhỏ như neon rất nhạy với nó.
> - **Thay 50% nước mỗi ngày làm chậm quá trình này.** Nó loại bỏ amoniac và vi khuẩn ngay khi chúng vừa hình thành, nên bể chưa có cơ hội ổn định. Bạn có thể giảm xuống 1-2 lần/tuần, chỉ thay thêm khi đo thấy chỉ số xấu.
> - **Cây đang hồi phục.** Cây mới trồng và vừa bị nhổ lên nhổ xuống cần vài tuần để bám rễ và ra rễ mới. Trân châu ngọc trai rất khó…

### cycling-01 · tank · plain wins (4 · 5.5)

**Asked:** Bể thủy sinh mới set được ít ngày, khi nào thì thả neon và bảy màu được?

**Judge:** Y cho mốc thời gian 3–6 tuần, cách test NH3/NO2 về 0 và cách thả cá dần, nên người hỏi biết phải làm gì. Nhưng Y khuyên dùng nước rửa chén, một lời khuyên sai, và bỏ qua nền nhiều dưỡng cùng chuyện thay 50% nước mỗi ngày. X chỉ trích cẩm nang, không có con số hay các bước cụ thể, và còn nói không biết bảy màu phải chờ bao lâu. / X cho thời gian chờ, mốc test NH3/NO2 về 0 và cách thả cá dần, nên người hỏi làm theo được. Nhưng mẹo dùng nước rửa chén là sai. Y an toàn nhưng gần như chỉ trích cẩm nang, không có số ngày hay các bước cụ thể. Cả hai đều bỏ qua nền nhiều dưỡng và việc đang thay 50% nước mỗi ngày.

**Ours lacks:** figures, plan, too-thin. **Plain lacks:** tank-fit, wrong.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang nói rõ cá neon chỉ nên thả khi bể đã trưởng thành hoàn toàn và thông số nước ổn định, vì bể mới set không hợp với chúng. Với cá bảy màu, phần tôi đọc được không ghi số ngày phải chờ, nên bạn nên xem thêm mục cycling trong cẩm nang trước khi thả. Cẩm nang có hướng dẫn cycling bể nước ngọt và cách chuẩn bị trước khi thả cá mới.
> 
> [Thẻ loài] Cá neon xanh (Paracheirodon innesi): nhiệt độ 21–25 °C; pH 4–7.5; GH 1–12; dài 3 cm; bể từ 60 cm; đàn từ 6 con; tính peaceful; độ khó 2/8
> 
> [Trích: Cá neon xanh › Chăm sóc ra sao?]
> Bể mới thiết lập không phù hợp với cá neon vì chúng không chịu được nh…

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

### cycling-02 · post · plain wins (4 · 7.5)

**Asked:** Em mới nhập môn, mua bể đúc 50cm + đèn 3 màu + lọc thác. Hai bố con mua 7 đôi cá: 5 đôi neon xanh đỏ + 2 đôi cá vàng nhỏ xíu. Sau 2 ngày cá lăn ra chết, chỉ còn 3 con cá vàng nhỏ. Vì sao vậy, và nên mua loại cá nào sống dai, sống khỏe cho con chăm?

**Judge:** Y names new tank syndrome as the main cause, says what to do right away for the 3 surviving goldfish (test the water, change 30-50%, feed less), and gives a step-by-step plan for the tank plus a fish line-up that fits 50cm. X only quotes guide excerpts and never says what to do now. Y has a few small slips: the wrong Vietnamese fish name for the platy, and heater advice that doesn't fit Vietnam's climate. / X is better. It names the likely cause (the tank was new and not cycled yet) and explains the neon–goldfish mismatch. It gives steps for the 3 surviving goldfish and a starter plan, though it has a few local slips: it calls the platy "cá kiếm" and assumes a heater is needed. Y only quotes guide excerpts. It says nothing about the remaining goldfish, gives no steps to take now, and suggests ordinary goldfish without mentioning the fish they already have.

**Ours lacks:** plan, tank-fit, follow-up. **Plain lacks:** local, too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Theo cẩm nang, neon rất nhạy khi bể còn mới: bể chưa đủ vi sinh nên amoniac và nitrit lên xuống thất thường, cá dễ sốc, và hai tuần đầu là giai đoạn nguy hiểm nhất. Cẩm nang khuyên chạy bể tối thiểu 3 đến 5 tuần trước khi thả neon, và người mới nên bắt đầu bằng các loài dễ nuôi như rasbora, cá vàng thường, platy, betta hoặc cá chuột.
> 
> [Trích: Cách nuôi cá neon, neon vua không bị rụng đàn cho người mới › Vì sao cá neon dễ chết cả đàn]
> Có thể ước chừng 70% số lần thất bại đến từ hai chỗ: bể chưa ổn định, hoặc nguồn cá không chuẩn. Cụ thể hơn:
> [photo: Cá neon bơi trong bể thủy sinh có rêu và lũa…

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

### cycling-02 · tank · plain wins (3 · 7)

**Asked:** Tôi vừa mua bể và thả cá, mới 2 ngày cá đã chết gần hết, vì sao?

**Judge:** X names the right cause (an uncycled tank) but gives no steps to save the 3 goldfish that are still alive. Y gives first steps in order: change water with dechlorinated water, stop feeding, test the water, add vi sinh and strong aeration. Neither answer uses the tank details: neither points out that neons and goldfish shouldn't share a tank, or that fish went into a brand-new cast tank the same day. / Cả hai đều chẩn đoán đúng là bể chưa cycle. X đưa ra các bước cấp cứu cụ thể (thay 25–50% nước, ngưng cho ăn, test NH₃/NO₂, sục khí, cho vi sinh) để cứu 3 con cá vàng còn sống, kèm cách làm đúng cho lần sau. Y quá mỏng, không nói phải làm gì ngay với số cá còn lại. Cả hai đều không nhắc đến việc nuôi chung neon với cá vàng trong bể đúc vừa mua về, và X còn hỏi lại thông tin mà app đã có.

**Ours lacks:** plan, too-thin, tank-fit. **Plain lacks:** tank-fit.

**Ours** (read 3 pages, stopped at the calls limit):

> Theo cẩm nang, bể mới chưa cycle xong thì vi khuẩn có lợi chưa đủ để xử lý chất thải của cá. Việc cycle thường mất vài tuần đến vài tháng, nên thả cá quá sớm, nhất là nhiều cá, dễ khiến cá chết sớm. Bạn nên kiểm tra nước và chờ bể cycle xong trước khi thả thêm cá.
> 
> [Trích: Hướng dẫn cơ bản về chu trình nitơ trong bể cá › Cycle bể mất bao lâu?]
> Chuyện này tùy từng bể, nhưng thường mất từ vài tuần tới vài tháng. Có mấy cách để rút ngắn thời gian. Bạn có thể mua một chai vi khuẩn nitrat hóa sống, xin ít vật liệu lọc đã chạy lâu từ bạn bè, hoặc trồng cây thủy… [chạm để đọc tiếp]
> 
> [Gợi ý hỏi tiếp]…

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

### cycling-03 · post · plain wins (3 · 7.5)

**Asked:** Em mới chơi lần đầu, nghe người bán cá chỉ và hơi hấp tấp nên trong một tuần em set nền full trân châu ngọc trai lùn, trồng cây xếp cảnh. Sau đó em thả 2 ngàn đồng cá trâm, 5 con tép RC, 1 tỳ bà baby, chục con bảy màu. Đổ nước vào được một tuần thì rêu hại tràn lan, loại rêu trắng trắng làm thối rữa trân châu và lan rất nhanh. Bảy màu chết 7 con, cá trâm chết gần nửa đàn, tép trốn biệt vài ngày mới thấy ló mặt. Cây đang chết dần chết mòn, em đã thay nước, vớt bớt rêu, thả tép mồi số lượng lớn mà bất lực. Em đang định bỏ hồ này set lại theo kiểu nền đá đen, tường full rêu, mấy cây lá to dày, nuôi đội vệ sinh tỳ bà bướm, chuột panda, tép RC, cá trâm. Nên làm sao?

**Judge:** Y nói đúng nguyên nhân: hồ chưa chạy xong chu trình nitơ (cycle) mà đã thả nhiều cá, nên chất hữu cơ thối rữa. Y đưa các bước cấp cứu theo thứ tự có kèm con số (ngưng cho ăn 2–3 ngày, thay 30–50% nước, bật đèn 6–8 tiếng/ngày) và kế hoạch cycle lại 4–6 tuần. X gần như không cho bước nào để làm ngay và còn né không giải thích rêu trắng là gì. / X đoán đúng nguyên nhân chính là hồ chưa chạy xong chu trình nitơ mà đã thả quá nhiều cá cùng lúc. X cũng cho các bước làm ngay có số liệu cụ thể (thay 30–50% nước, đèn 6–8 tiếng, cycle 4–6 tuần) và nhận xét được kế hoạch set lại, dù hiểu nhầm trân châu là sỏi. Y thì mỏng, gần như không có bước nào để làm và không giải thích loại rêu trắng.

**Ours lacks:** plan, diagnosis, too-thin. **Plain lacks:** local, too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Cẩm nang chưa đủ để em kết luận về loại rêu trắng đang làm thối trân châu, cũng như việc ghép tỳ bà bướm và chuột panda với cá trâm, nên em tạm chưa thả thêm cá. Theo cẩm nang, chu trình nitơ thường mất từ vài tuần tới vài tháng, và bể chỉ xử lý được lượng chất thải của số cá nó đã quen, thả đột ngột nhiều cá sẽ làm nước xấu đi. Cá trâm trong cẩm nang cần bể từ 45 cm, nước mềm hơi axit, nuôi đàn ít nhất 8 con và không hợp với cá bảy màu, nên em nên cân nhắc lại đàn trước khi set lại.
> 
> [Trích: Hướng dẫn cơ bản về chu trình nitơ trong bể cá › Cycle bể mất bao lâu?]
> Chuyện này tùy từng bể, nhưng…

**Plain** (3273 characters):

> Mình hiểu cảm giác bất lực khi cá chết và cây tàn dần. Chuyện này rất phổ biến với người mới, và phần lớn là do **hồ chưa chu trình (chưa cycle)** cộng với **thả quá tải, cho ăn nhiều** trong khi hệ vi sinh chưa đủ để xử lý chất thải. Rêu trắng bùng lên chính là dấu hiệu của chất hữu cơ dư thừa đang phân hủy.
> 
> ## 1. Việc cần làm ngay (vài ngày tới)
> 
> **Kiểm tra nước trước tiên.** Mua bộ test API Liquid (NH3/NH4, NO2, NO3, pH). Nếu NH3 hoặc NO2 khác 0 thì đó gần như chắc chắn là nguyên nhân cá chết.
> 
> **Xử lý tình trạng cấp bách:**
> - **Ngưng cho ăn 2-3 ngày.** Thức ăn thừa là nguồn amoniac chính…

### cycling-03 · tank · plain wins (3 · 6.5)

**Asked:** Bể mới set một tuần thì rêu trắng lan và cá chết gần nửa, có nên lật bể làm lại không?

**Judge:** Y gives the likely cause (fish added before the tank had cycled), says plainly not to tear the tank down, and lists steps in order with figures and when a teardown would make sense. X only paraphrases guide excerpts, refuses to give a verdict and gives no steps. Y does miss some tank details: the rotting carpet, the 10 guppies plus the trâm crowding a one-week-old tank, and the extra shrimp they just added. / X không trả lời sát bể này: không nhắc tới bảy màu, trâm hay chuyện trân châu đang thối. Nhưng X trả lời thẳng là không cần lật bể, chỉ ra nguyên nhân là chu trình nitơ, và cho các bước làm theo thứ tự có số liệu cụ thể (thay nước 30-50% mỗi ngày, nhịn ăn 1-2 ngày, bật đèn 6-8 giờ). Y nói không thể kết luận, chỉ dán các đoạn trích cẩm nang và không cho người chơi bước nào để cứu số cá còn lại.

**Ours lacks:** plan, diagnosis, too-thin, follow-up. **Plain lacks:** tank-fit.

**Ours** (read 6 pages, stopped at the calls limit):

> Cẩm nang chưa có mục nào trả lời trực tiếp chuyện cá chết gần nửa sau một tuần, nên mình không thể khẳng định có nên lật bể hay không. Cẩm nang nói rêu trong ba tuần đầu là chuyện bình thường, còn bể thường mất vài tuần tới vài tháng để chu trình nitơ ổn định, và bể chưa đủ vi sinh thì không xử lý kịp lượng chất thải của cá. Cẩm nang cũng nhắc không phải bể bẩn là phải dỡ, chỉ nên dỡ khi có lý do rõ ràng.
> 
> [Trích: Hướng dẫn cơ bản về chu trình nitơ trong bể cá › Cycle bể mất bao lâu?]
> Chuyện này tùy từng bể, nhưng thường mất từ vài tuần tới vài tháng. Có mấy cách để rút ngắn thời gian. Bạn có…

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

**Judge:** Y names the likely cause, a tank only 5 days old that hasn't finished cycling, so ammonia and nitrite build up. It explains the foam and gives steps in order: remove dead fish, stop feeding, test, change 25–30% of the water, use Prime. It also answers both the water-change and aeration questions with Vietnam's heat in mind. X hedges, never explains the foam, and leaves the reader to tap into the guide excerpts for the answers. / X nói rõ nguyên nhân hay gặp nhất là hồ mới chưa chạy xong chu trình nitơ (cycling) nên amoniac và nitrit tăng cao, giải thích bọt trắng, rồi đưa các bước làm theo thứ tự, có số liệu cụ thể (thay 25–30% nước, ngưỡng 0,25 ppm), dặn ngưng cho ăn, gợi ý dùng Prime, và hợp với hồ 36 lít trong khí hậu nóng. Y không dám nói nguyên nhân, không có bước cứu cá ngay, câu trả lời mỏng và chủ yếu bảo người đọc tự đọc đoạn trích.

**Ours lacks:** diagnosis, plan, too-thin. **Plain lacks:** –.

**Ours** (read 4 pages, stopped at the tools limit):

> Cẩm nang chưa cho biết bọt trắng trên mặt hồ là gì, nên mình chưa dám kết luận nguyên nhân cá chết. Hồ mới set thường chưa có vi khuẩn lọc đủ, nên cẩm nang khuyên đo amoniac và nitrit mỗi một đến hai ngày, và hễ đo được trên 0,2 ppm thì thay một phần nước; cho cá ăn ít lúc đầu. Về sục khí, cẩm nang chỉ nói lọc treo và lọc thùng đẩy nước bằng mô tơ nên không cần máy sục khí; mình chưa đọc đủ phần này, nên bạn xem kỹ mục bên dưới.
> 
> [Trích: Cycling bể cá nước ngọt: cách chuẩn bị trước khi thả cá mới › Cycling có cá (fish-in)]
> Cách này phổ biến nhất, được cả người mới lẫn người chơi lâu năm sử dụ…

**Plain** (2320 characters):

> ## Nguyên nhân có thể
> 
> Hồ mới 5 ngày thường chưa đủ **chu trình nitơ** (cycling). Hồ mới chưa có vi khuẩn có lợi để phân hủy chất thải của cá:
> 
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻) tích tụ** từ phân cá, thức ăn thừa, xác lá. Đây là nguyên nhân chết cá phổ biến nhất ở hồ mới. Amoniac và nitrit rất độc, còn cá thì yếu dần.
> - **Bọt trắng trên mặt** thường là bọt protein từ chất hữu cơ, hoặc do vi khuẩn bùng phát trong giai đoạn đầu. Bọt có thể do thức ăn thừa, phân, hoặc dư chất tẩy rửa/xà phòng còn sót lại khi vệ sinh hồ và trang trí.
> - Các nguyên nhân khác: nước máy chưa khử clo, nhiệt độ h…

### cycling-04 · tank · plain wins (2.5 · 7.5)

**Asked:** Bể mới set 5 ngày cá chết và mặt nước có bọt trắng, là sao?

**Judge:** Y nêu rõ nguyên nhân có khả năng nhất: ammonia/nitrite tăng vì bể chưa cycling, và bọt do chất hữu cơ. Y cũng đưa các bước xử lý ngay theo thứ tự (vớt cá chết, ngừng cho ăn, thêm sủi vì bể đang không có sủi, test nước, thay nước 30–50%, dùng Prime), nhưng lại hỏi dung tích bể dù đã có kích thước 40×30×30 (khoảng 36 lít). X từ chối chẩn đoán và chỉ dẫn sang phần cycling trong cẩm nang, không có bước nào để cứu số cá còn lại. / X gives the most likely cause: ammonia or nitrite in a tank that hasn't finished cycling, with the foam coming from organic waste. It then lists clear steps (remove dead fish, stop feeding, add an air pump, test the water, change 30–50%, use Prime). It doesn't use the tank's 36 L or say outright that there's no air pump, though it does tell them to add aeration. Y only says the guide doesn't cover this and points to a cycling guide, with no steps to save the fish that are still alive.

**Ours lacks:** plan, diagnosis, too-thin. **Plain lacks:** tank-fit, too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Cẩm nang chưa giải thích bọt trắng trên mặt nước hay nguyên nhân cá chết, nên mình không thể chẩn đoán chắc cho bể của bạn. Cẩm nang có nói rằng bể vừa set chỉ với nước máy, sỏi và đồ trang trí chưa có vi khuẩn có lợi để phân hủy amoniac (chất thải độc do cá thải ra), nên bạn cần cycling bể trước khi thả cá. Bạn nên xem phần chu trình nitơ và cách cycling trong cẩm nang trước khi thả thêm cá.
> 
> [Trích: Cycling bể cá nước ngọt: cách chuẩn bị trước khi thả cá mới › Chu trình nitơ trong bể cá là gì?]
> Cách tự nhiên tái chế chất dinh dưỡng được gọi là chu trình nitơ. Ở mức rất tổng quát, vi khuẩn v…

**Plain** (2085 characters):

> Bể mới 5 ngày mà cá đã chết và có bọt trắng thường là dấu hiệu **bể chưa ổn định, nước đang bị nhiễm độc**. Nguyên nhân hay gặp nhất:
> 
> ## Nguyên nhân có thể
> 
> 1. **Ammonia (NH₃/NH₄⁺) hoặc Nitrite (NO₂⁻) tăng cao.** Đây là nguyên nhân phổ biến nhất. Bể mới chưa có vi khuẩn có lợi để phân hủy chất thải, nên khí độc tích tụ và giết cá. Cá thường bơi ngoi lên mặt, há miệng, mang đỏ hoặc tím.
> 2. **Bọt trắng** thường do chất hữu cơ dư thừa: thức ăn thừa, phân cá, cá chết phân hủy, nhớt cá, hoặc còn sót xà phòng/chất tẩy rửa khi vệ sinh bể, lọc, đá, cây.
> 3. **Sốc môi trường:** nước máy chứa clo/chlor…

### cycling-05 · post · plain wins (6 · 7)

**Asked:** Mình mới tập set một hồ biotop 845, chỉ có lũa hải sa quỳ, đá đen và đá cuội, vài cây thủy sinh không cần CO2, lọc thùng Atman, đèn rọi vàng-trắng. Giai đoạn mới châm đầy nước và chạy lọc thì nên châm loại vi sinh nào?

**Judge:** Y trả lời thẳng câu hỏi "châm loại vi sinh nào": vi sinh nitrat hóa, kèm tên vài dòng bán ở VN. Y cũng có quy trình đủ bước, gồm khử clo, nuôi amoniac 2–4 ppm, test và thời gian 3–6 tuần, có nhắc lọc Atman. X đúng hướng và gọn nhưng chủ yếu dựa vào trích dẫn, ít bám vào hồ của bạn, và khuyên gắn sưởi trong khi ở VN thường không cần. / X answers the actual question directly: use nitrifying bacteria (Nitrosomonas/Nitrobacter). It gives a clear order of steps: dechlorinate, add bacteria, feed ammonia at 2–4 ppm, and test until ammonia and nitrite read 0. It runs a little long, and some steps don't fit a tank that is already set up. Y is short and grounded in its guides. Its main text never says which kind of bacteria to dose, and it adds a heater step that Vietnam's warm water rarely needs.

**Ours lacks:** too-thin, tank-fit. **Plain lacks:** too-long, local.

**Ours** (read 4 pages):

> Cẩm nang khuyên nguồn nhanh nhất là sứ lọc cấy sẵn lấy từ bể đang nuôi cá khỏe; nếu dùng vi sinh đóng chai thì bỏ kèm sứ hoặc vật liệu lọc vào lọc. Dù chọn cách nào, bạn giữ nước 24–26°C, châm amoniac khoảng 2 ppm và đo đến khi amoniac và nitrit về 0 rồi mới thả cá, không thả chỉ vì bao bì ghi chạy tức thì.
> 
> [Trích: Chạy vi sinh bể mới: sứ cấy sẵn, vi sinh chai hay chỉ châm amoniac › Bắt đầu từ đâu]
> 1. Đo nhiệt độ nước bể mới. Nếu dưới 24°C, gắn sưởi để giữ khoảng 24–26°C trong thời gian chạy vi sinh.
> 2. Chọn nguồn vi sinh. Sứ cấy sẵn từ bể đang nuôi cá cho kết quả nhanh nhất. Nếu dùng vi sin…

**Plain** (2095 characters):

> Với giai đoạn châm nước và chạy lọc, bạn nên dùng **vi sinh nitrat hóa** (nitrifying bacteria), thường ghi là chứa *Nitrosomonas* và *Nitrobacter*. Nhóm vi khuẩn này chuyển hóa amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻), hai chất rất độc với cá, thành nitrat (NO₃⁻) ít độc hơn. Các dòng phổ biến gồm Seachem Stability, Tetra SafeStart, API Quick Start, Tetra Nitrivec và các dòng vi sinh tươi từ bể đã chạy ổn định.
> 
> **Các bước nên làm:**
> 
> 1. **Khử clo trước khi châm nước.** Clo sẽ diệt vi khuẩn. Dùng nước đã để qua đêm, hoặc dùng chất khử clo, và chỉ thả vi sinh sau khi nước đã xử lý xong.
> 2. **Ngâm lũ…

### cycling-05 · tank · plain wins (5 · 6)

**Asked:** Bể mới đổ nước chạy lọc, nên châm vi sinh loại nào để sớm thả cá?

**Judge:** Y trả lời thẳng câu \"loại nào\": nêu các sản phẩm cụ thể, có quy trình từng bước, mốc thời gian 2–4 tuần và cách nhận biết vi sinh đã chạy xong. Tuy vậy Y có vài lỗi nhỏ về loài vi khuẩn và về cá neon. X đúng hướng (dùng sứ cấy sẵn, châm 2 ppm amoniac, chờ NH3 và NO2 về 0) nhưng quá ngắn, không nêu tên loại vi sinh nào, và lời khuyên về nhiệt độ chưa hợp khí hậu Việt Nam. Cả hai đều không dùng đến thông tin bể của người hỏi. / Tôi chọn X vì nó trả lời thẳng câu 'loại nào' và đưa ra quy trình có các mốc rõ ràng: liều amoniac, khi nào thì xong chu trình, thời gian chờ và cách thả cá. Dù vậy X kể vài sản phẩm khó mua ở Việt Nam và gợi ý neon chưa hợp cho bể mới. Y đúng về hướng dùng sứ cấy sẵn và ít lỗi hơn, nhưng quá mỏng, không nêu tên sản phẩm cũng không nói phải chờ bao lâu. Cả hai đều không dùng thông tin về bể 845 với lọc thùng Atman.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** tank-fit, local.

**Ours** (read 4 pages):

> Cách nhanh và chắc nhất là dùng sứ hoặc vật liệu lọc cấy sẵn vi sinh từ một bể đang nuôi cá khỏe. Nếu dùng vi sinh đóng chai thì bỏ kèm sứ hoặc vật liệu lọc vào lọc, và giữ nước khoảng 24–26°C. Ccẩm nang khuyên châm amoniac khoảng 2 ppm, đo amoniac và nitrit đến khi cả hai về 0 rồi mới thả cá, đừng tin theo nhãn ghi chạy tức thì.
> 
> [Trích: Chạy vi sinh bể mới: sứ cấy sẵn, vi sinh chai hay chỉ châm amoniac › Bắt đầu từ đâu]
> 1. Đo nhiệt độ nước bể mới. Nếu dưới 24°C, gắn sưởi để giữ khoảng 24–26°C trong thời gian chạy vi sinh.
> 2. Chọn nguồn vi sinh. Sứ cấy sẵn từ bể đang nuôi cá cho kết quả nhan…

**Plain** (1429 characters):

> Với bể mới, bạn nên chọn **vi sinh chứa vi khuẩn nitrat hóa sống** (thường có *Nitrosomonas* và *Nitrobacter*). Các loại phổ biến gồm **Seachem Stability**, **Tetra SafeStart**, **API Quick Start**, **Dr. Tim's** hoặc **Sera Bio Nitrivec**. Tránh loại chỉ có enzyme hoặc chỉ khử clo, vì chúng không giúp hình thành chu trình nitơ.
> 
> **Cách làm:**
> 1. **Châm vi sinh ngay** sau khi đổ nước và chạy lọc, liều theo hướng dẫn trên bao bì. Có thể châm lại sau 1-2 tuần để bù lượng vi khuẩn.
> 2. **Nuôi vi khuẩn bằng nguồn amoniac:** cho ăn một ít thức ăn mỗi ngày, hoặc dùng amoniac nguyên chất (không có ch…

### cycling-06 · post · plain wins (6 · 7)

**Asked:** Em mới set một bể cubic 20 loại lowtech, mấy hôm nay nước trong bể tự nhiên rất đục, mờ mờ như lớp sương mù. Mọi người bảo do vi sinh bị chết. Làm sao khắc phục và tạo lại vi sinh? Em cũng nuôi cá trong thùng xốp, nước trong đó rất trong dù thỉnh thoảng mới hút cặn và châm thêm nước. Em lấy nước thùng xốp đó châm mồi vi sinh cho bể mới được không?

**Judge:** Both answers correctly say the haze is a bacterial bloom, not dead bacteria, and that the bacteria live on filter media rather than in the water. Y does more with the hobbyist's own setup: it suggests taking media or substrate from the styrofoam box, warns about carrying disease over, and says to wait for ammonia and nitrite at 0 before adding fish. X is right but thin, and it assumes they have a stable tank to take media from. / Both answers say this is a bacterial bloom, not dead bacteria, and that styrofoam-box water does little to seed the tank. X gives a fuller step-by-step plan: don't do big water changes, cut feeding, add fast-growing plants for a lowtech tank, measure NH3/NO2 and what to do if they rise, then use filter media instead of the water. Y sounds more natural to a Vietnamese hobbyist, but it's thin and generic. It says nothing about plants or the lowtech setup, or what to do if ammonia is high.

**Ours lacks:** too-thin, tank-fit, follow-up. **Plain lacks:** local, too-long.

**Ours** (read 3 pages):

> Theo cẩm nang, nước đục trắng như sương trong bể mới thường là bùng vi sinh chứ không phải vi sinh chết; hãy đo ammonia, và nếu bằng 0 thì ngừng cho ăn khoảng 7 ngày, không đụng vào lọc để bể tự cân bằng. Vi sinh bám trên vật liệu lọc chứ không trôi trong nước, nên nước từ thùng xốp gần như không giúp mồi vi sinh cho bể mới; em nên vắt bông lọc và chuyển sứ lọc từ một bể đang chạy ổn định, hoặc ngâm vật liệu lọc trong xô có sủi khí rồi châm vi sinh đóng chai.
> 
> [Trích: Nước bể cá bị đục trắng, đục xanh: nguyên nhân và cách làm nước trong › Ở Việt Nam]
> Nước ở mình ấm, vì vậy nhiệt độ thay đổi đ…

**Plain** (2164 characters):

> ## Nước đục có phải do vi sinh chết không?
> 
> Nhiều khả năng **không**. Nước đục mờ như sương ở bể mới thường là **bloom vi khuẩn** (vi khuẩn sinh sôi quá mức khi có nhiều chất hữu cơ từ thức ăn, lá rụng, phân, hoặc nước máy mới). Đây là giai đoạn bình thường khi bể đang chạy (cycling), kéo dài khoảng 1-3 tuần. Vi sinh có ích (nitrat hóa) chủ yếu bám trên bề mặt lọc, nền, đá, kính, cây, nên nước đục không có nghĩa là chúng chết.
> 
> ## Cách xử lý
> 
> - **Đừng thay nước lớn** hoặc rửa lọc bằng nước máy mạnh. Việc này loại bỏ vi sinh bám và làm bloom kéo dài.
> - **Giảm ánh sáng** xuống khoảng 4-6 giờ/ng…

### cycling-06 · tank · plain wins (5 · 6)

**Asked:** Bể mới set bỗng đục mờ như sương, có phải vi sinh chết và làm sao gây lại?

**Judge:** Both answers say correctly that the cloudiness is most likely a bacterial bloom, not the bacteria dying, and neither one uses the 20 cm cube or the hobbyist's plan to seed it with water from the styrofoam box. Y gives clearer steps (test, cut feeding, keep aeration on, reuse mature filter media) and says how long the bloom usually takes to clear. X is shorter and reads more naturally to a Vietnamese keeper, but on its own text it's too thin to act on. / Cả hai đều xác định đúng là bùng vi khuẩn chứ không phải vi sinh chết. Cả hai cũng bỏ qua chi tiết bể cubic 20 và ý định lấy nước thùng xốp để mồi vi sinh. X dài và chung chung nhưng có các bước rõ ràng, kèm số liệu thay nước, ngưng cho ăn và thời gian chạy vi sinh. Y viết tự nhiên hơn, đúng cách nói trong giới chơi cá ở Việt Nam, nhưng quá mỏng: phần lớn hướng dẫn nằm trong trích đoạn phải chạm để đọc tiếp.

**Ours lacks:** tank-fit, too-thin, follow-up, figures. **Plain lacks:** tank-fit, too-long, local.

**Ours** (read 4 pages):

> Thường thì không phải vi sinh chết. Nước đục trắng như nước vo gạo thường là bùng vi sinh, và cẩm nang nói nhiều người hay nhầm với chết vi sinh. Nếu test amoni bằng 0 thì cứ để bể tự cân bằng, ngưng cho ăn khoảng 7 ngày và không đụng vào lọc; chỉ khi amoni hoặc nitrit lên thì mới cần chạy lại vi sinh theo các bước trong cẩm nang.
> 
> [Trích: Nước bể cá bị đục trắng, đục xanh: nguyên nhân và cách làm nước trong › Ở Việt Nam]
> Nước ở mình ấm, vì vậy nhiệt độ thay đổi đột ngột là một nguyên nhân bùng vi sinh đáng để ý. Bể đặt cạnh cửa sổ hay ngoài hiên, nơi nắng chiếu thẳng vào, rất dễ bị nước xanh…

**Plain** (1912 characters):

> Bể mới bị đục trắng như sương thường **không phải vi sinh chết**. Phổ biến nhất là **bloom vi khuẩn** (bùng phát vi khuẩn dị dưỡng), xảy ra trong 1-2 tuần đầu khi bể đang chu trình nitơ. Nguyên nhân thường gặp là dư thức ăn, chất hữu cơ thừa, cá chết hoặc phân cá tích tụ, hoặc vật liệu lọc và nền mới còn bụi. Đây là dấu hiệu vi sinh đang hình thành, không phải vi sinh chết.
> 
> Tuy nhiên, nếu bể đã ổn định rồi bỗng đục sau khi rửa lọc bằng nước máy, dùng thuốc, hoặc thay nước quá nhiều, thì có thể vi sinh có ích đã bị giết và bạn cần gây lại.
> 
> **Cách xử lý khi bloom:**
> - Đừng hoảng và đừng thay …

### cycling-07 · post · ours wins (6 · 4)

**Asked:** Hồ em mới set hôm nay, có phân nền và chỉ một số cây cắt cắm dễ trồng. Em đặt trong phòng ngủ nên không thích sủi và lọc vì tiếng ồn. Người bán bảo chỉ cần 2-3 ngày thay nước một lần là được, vậy có ổn không, có cách nào khác không?

**Judge:** X đúng ý chính: bể phân nền mới cần thay nước dày lúc đầu (khoảng 30% mỗi ngày trong tuần đầu rồi giãn dần), và gợi ý lọc bông chạy sủi chỉ tốn khoảng 5 W. Tuy vậy X còn sơ sài, chưa nói rõ phân nền nhả amoni. Y dài và có nhiều mẹo giảm tiếng ồn, nhưng sai ở điểm cốt lõi: Y bảo không cần thay nước dày, cho rằng thay nước làm mất vi sinh, và đề xuất thay 1–2 tuần một lần, quá thưa cho bể phân nền mới. / Y is right that the seller's 2–3-day schedule fits the first weeks of a new tank, and it suggests a quiet ~5 W sponge filter, with Vietnam-specific context on heat. X gets this tank wrong: it says the frequent water changes aren't needed even though new aqua soil is leaching ammonia, and it gives a wrong reason about bacteria. X does have more practical tips on reducing noise.

**Ours lacks:** plan, diagnosis, follow-up, tank-fit. **Plain lacks:** wrong, diagnosis, too-long, tank-fit.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang không xác nhận cách này: bình không lọc thiếu vi sinh xử lý chất thải nên amoniac tích lại nhanh, và cây không thay hẳn được máy sủi vì ban đêm cây cạnh tranh oxy với cá. Lịch thay 2–3 ngày của người bán chỉ khớp với giai đoạn đầu của bể có lọc (tuần đầu thay khoảng 30% mỗi ngày, rồi giãn dần), và sau 1–2 tháng bể ổn định thì nên thay ít hơn. Nếu muốn yên lặng, cẩm nang gợi ý một bộ lọc bông đơn giản chạy bằng máy sủi chỉ tốn khoảng 5 W.
> 
> [Trích: Nuôi cá trong bình không lọc, không sủi oxy: loài nào sống được, chăm thế nào › Chuyện ở Việt Nam: trời nóng, mất điện, nước máy]
> - Trời nó…

**Plain** (2058 characters):

> **Thay nước 2-3 ngày một lần thường là không cần thiết.** Hồ mới set, nhất là hồ thủy sinh có phân nền, cần vài tuần để ổn định. Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi đang hình thành, và bạn phải xử lý nước máy liên tục. Cách làm hợp lý hơn:
> 
> - **Nếu chưa có cá hoặc chỉ có rất ít cá:** thay 20-30% nước mỗi 1-2 tuần, hoặc khi nitrate (NO₃) cao. Khi có cá, lượng thức ăn và chất thải mới là nguồn gây bẩn chính.
> - **Chỉ châm thêm nước** khi bị bay hơi, dùng nước đã khử clo.
> - **Dùng bộ test nước** (NH₃/NH₄⁺, NO₂⁻, NO₃⁻) để quyết định khi nào thay nước, thay vì theo lịch cố đị…

### cycling-07 · tank · ours wins (5.5 · 3)

**Asked:** Bể mới set của tôi chỉ thay nước vài ngày một lần thay cho lọc thì có ổn không?

**Judge:** X đưa lịch thay nước cụ thể, hợp với bể phân nền mới set: tuần đầu thay 30% mỗi ngày rồi giãn dần, dày hơn lịch 2–3 ngày người bán khuyên. Tuy vậy X vẫn chưa trả lời thẳng là bể không lọc, không sủi có ổn không. Y hiểu nhầm câu hỏi thành chuyện vệ sinh lọc, đưa lời khuyên rửa lọc không dùng được cho bể này rồi hỏi ngược lại. / Y nên được chọn: Y đưa ra lịch thay nước cho tuần đầu, hợp với bể mới nền phân nền và cây cắt cắm: tuần đầu thay 30% mỗi ngày, rồi giãn dần ra 2–3 ngày một lần. Y cũng chỉ ra rằng 2–3 ngày một lần là quá thưa cho lúc mới set. X hiểu sai câu hỏi thành chuyện vệ sinh lọc. Dù vậy, cả hai đều không nói thẳng bể không lọc, không sủi thì có nuôi cá được không.

**Ours lacks:** diagnosis, tank-fit, follow-up. **Plain lacks:** tank-fit, off-topic, asks-only, diagnosis.

**Ours** (read 6 pages, stopped at the calls limit):

> Với bể mới set, cẩm nang khuyên thay nước dày hơn lúc đầu, không phải ít hơn: tuần đầu thay khoảng 30% nước mỗi ngày, sau đó giãn dần thành 2 ngày rồi 3 ngày một lần, tùy cây lên đều và rêu hại có phát triển hay không. Khoảng 1 đến 2 tháng sau, khi bể đã chạy xong chu trình nitơ và ổn định, mới thay rất ít. Cẩm nang không nói về việc vệ sinh lọc trong trường hợp này, nên phần đó bạn cần xem thêm ở trang khác.
> 
> [Trích: Chăm bể thủy sinh mới set: đèn, thay nước, vệ sinh rêu và ngân sách › Thay nước trong những tuần đầu]
> Thay nước nhiều là cách giảm lượng dinh dưỡng dư trong nước, để rêu hại khô…

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

**Judge:** Y is the better answer. It answers all three questions for this tank: the filter is more than enough, so turn down the flow; CO2 isn't needed; and the tank needs 3–6 weeks of cycling before fish. It also warns that the cement raises pH and gives sensible advice for a rooftop tank. X only answers the filter question, skips CO2 and how long to wait before adding fish, and its own guide excerpt contradicts its verdict on the filter. / X trả lời đủ cả ba câu hỏi bằng số liệu hợp lý: lọc dư nên cần giảm dòng, không cần CO2, và chạy chu trình nitơ 3–6 tuần trước khi thả cá. X còn nhắc rủi ro thật của hồ này là xi măng làm nước kiềm và nóng trên sân thượng. Y chỉ trả lời câu về lọc, bỏ ngỏ CO2 và thời gian thả cá, nên quá mỏng để làm theo.

**Ours lacks:** too-thin, plan, tank-fit. **Plain lacks:** –.

**Ours** (read 4 pages, stopped at the tools limit):

> Theo cẩm nang, lọc tự lo dòng chảy nên đạt khoảng 3–4 lần thể tích bể mỗi giờ; bể 40x40x20 (khoảng 32 lít) cần khoảng 100–130 lít/giờ, nên Sobo 400 l/h là đủ, và cẩm nang cảnh báo lọc quá cỡ làm bể xoáy nước và tốn điện. Phần CO2 và thời gian chạy chu trình nitơ trước khi thả cá, mình chưa đọc được trong lần tra này nên chưa trả lời chắc; bạn có thể xem thêm bài cycling bể cá trong cẩm nang.
> 
> [Trích: Tính lượng vật liệu lọc vi sinh và lưu lượng lọc theo đàn cá › Lưu lượng bao nhiêu là vừa]
> Các mức dưới đây áp dụng khi lọc phải tự lo toàn bộ dòng chảy trong bể, không có sủi khí hay bơm thổi hỗ…

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

### cycling-08 · tank · plain wins (4 · 5)

**Asked:** Bể mới làm của tôi bao lâu thì thả cá được, lọc như vậy có đủ không?

**Judge:** Neither answer uses the tank details: about 32 L, a Sobo 400 l/h filter that is plenty for that volume, and new cement walls that leach lime and push the pH up, which needs curing first. Y is more useful anyway. It gives a time frame, says how to test, lists ways to speed up the cycle, and gives a 4–6× turnover rule the hobbyist can check their filter against. X only restates the guide in general terms and never says whether the filter is enough. / Neither answer used the tank details. A 32 L tank with a Sobo 400 l/h filter is well filtered, even counting the real flow at about half the box figure. Neither warned that the new cement walls will leach lime and need curing/soaking before fish go in, or about rooftop heat. X gives clearer steps (testing, nitrite at 0 for several days, seeding bacteria) and the 4–6× turnover rule. Y is vaguer and thinner.

**Ours lacks:** tank-fit, plan, too-thin. **Plain lacks:** tank-fit, local, asks-only.

**Ours** (read 4 pages):

> Theo cẩm nang, chu trình nitơ của bể mới thường mất từ vài tuần đến vài tháng. Bạn nên thả cá khi cho ăn lượng bình thường suốt một tuần mà amoniac và nitrit vẫn ở 0 ppm (nitrat trên 0), và thả từ từ, mỗi đợt cách nhau một khoảng. Về lọc, cẩm nang nói lọc nào cũng làm được nếu đúng cỡ với bể; con số in trên hộp thường lạc quan, nên hãy tính công suất thật bằng khoảng một nửa con số đó.
> 
> [Trích: Cycling bể cá nước ngọt: cách chuẩn bị trước khi thả cá mới › Cycling có cá (fish-in)]
> Cách này phổ biến nhất, được cả người mới lẫn người chơi lâu năm sử dụng. Hầu hết mọi người không thể ngồi nhìn mộ…

**Plain** (1336 characters):

> Thường thì bể mới cần **khoảng 3–6 tuần** để chu trình nitơ (nitrogen cycle) ổn định trước khi thả cá. Trong thời gian này, vi khuẩn có lợi phải phát triển đủ để xử lý amoniac (NH₃) và nitrit (NO₂⁻) do cá thải ra. Nếu thả cá sớm, amoniac và nitrit sẽ tích tụ và dễ làm cá chết.
> 
> **Cách biết bể đã sẵn sàng:**
> - Dùng bộ test nước (nên dùng loại giọt, chính xác hơn que thử) kiểm tra amoniac và nitrit.
> - Khi **amoniac = 0** và **nitrit = 0** trong ít nhất 2–3 ngày liên tiếp, và đã có nitrat (NO₃⁻) xuất hiện, bể đã chạy xong chu trình.
> - Ngược lại, nếu amoniac hoặc nitrit vẫn đo được thì chưa nên t…

### sick-01 · post · plain wins (4 · 6)

**Asked:** Đàn ngựa vằn xanh nhà em nuôi gần 3 năm, rơi rụng dần. Giống này không đẻ nổi, giờ cứ 1 vài tuần lại có con cong người, 1-2 tuần sau là chết. Có phải do già quá không, hay bị bệnh gì?

**Judge:** X correctly links the problem to the zebra danio and names Pseudoloma, age and inbreeding as possible causes, but gives no steps to take. Y puts mycobacteriosis first, warns that it can spread to people, and gives concrete first steps: isolate sick fish, test the water, change water. It does play down age as a cause, hedges about whether the fish is a cichlid, and ends with many questions. / Y nhận đúng loài, nêu tuổi thọ 3–5 năm và bệnh vi bào tử trùng Pseudoloma, nhưng không đưa ra bước nào để làm, không dặn theo dõi gì và còn bỏ lửng. Thẻ loài ghi 18–25 °C nhưng Y không nói gì về nhiệt độ nóng ở Việt Nam. X nghi lao cá hàng đầu (hợp lý), có các bước làm ngay như cách ly, đo nước và đeo găng tay khi xử lý cá vì bệnh lây sang người, nhưng lại sai khi loại tuổi già khỏi các nguyên nhân gây cong người và liệt kê nhiều nguyên nhân chung chung.

**Ours lacks:** plan, follow-up, too-thin. **Plain lacks:** tank-fit, figures, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Theo cẩm nang, cá ngựa vằn sống khoảng 3–5 năm, nên đàn gần 3 năm tuổi đã vào giai đoạn cuối đời. Tuy vậy, cá cong người và gầy mòn kéo dài có thể là bệnh vi bào tử trùng (Pseudoloma neurofilia), hay gọi là bệnh gầy; cẩm nang nói bệnh này khó chẩn đoán và có cá trông khỏe vẫn nhiễm. Cẩm nang cũng cảnh báo cận huyết đang phổ biến ở cá ngựa vằn, có thể là lý do đàn khó đẻ, và cẩm nang không ghi cách chữa cho bệnh này.
> 
> [Thẻ loài] Cá ngựa vằn (Danio rerio): nhiệt độ 18–25 °C; pH 6–8; GH 5–20; dài 5 cm; bể từ 90 cm; đàn từ 8 con; tính peaceful; độ khó 1/8
> 
> [Trích: Cá ngựa vằn › Ghi chú]
> D. rerio …

**Plain** (2113 characters):

> Nếu "ngựa vằn xanh" là cá (zebra danio hoặc cichlid vằn xanh), thì tuổi già thường không gây ra triệu chứng này. Cá già thường yếu dần, ăn ít, đẻ kém, chứ không cong người rồi chết trong 1-2 tuần. Biểu hiện cong người kèm chết nhanh thường là bệnh, và có vài nguyên nhân chính:
> 
> 1. **Lao cá (Mycobacteriosis)**: Đây là nghi ngờ hàng đầu với triệu chứng bạn mô tả: gầy dần, rụng dần, cong cột sống, bụng hõm, có thể có vết loét hoặc u hạt. Bệnh âm ỉ, lây lan chậm, khó chữa. Lao cá có thể lây sang người qua vết xước, nên khi xử lý cá bệnh hoặc xác chết phải đeo găng tay và rửa tay kỹ.
> 2. **Nhiễm kh…

### sick-01 · tank · plain wins (2 · 6)

**Asked:** Cá ngựa vằn của tôi cứ vài tuần lại có con cong người rồi chết, là bệnh gì?

**Judge:** Y is better. It names the causes that most likely fit, fish TB (mycobacteriosis) and the microsporidian Pseudoloma, and gives first steps: test the water, isolate sick fish, protect your hands. It misses that these fish are nearly 3 years old, so old-age spine bending is likely, and it adds Nodavirus, which is unlikely in a home tank. X names no cause and gives almost no steps, apart from the species card's numbers. / Đáp án X nêu đúng các nguyên nhân hay gặp nhất khi cá ngựa vằn bị cong người rồi chết dần: bệnh lao cá (Mycobacterium) và ký sinh trùng Pseudoloma. X cũng đưa ra các bước xử lý cụ thể. Tuy vậy, X bỏ qua chi tiết đàn cá đã nuôi gần 3 năm, tức là đã già, nên tuổi già cũng có thể gây cong cột sống. Đáp án Y không đưa ra chẩn đoán nào, chỉ chép lại thông số trên thẻ loài.

**Ours lacks:** diagnosis, plan, too-thin. **Plain lacks:** tank-fit, figures, too-long.

**Ours** (read 1 pages, stopped at the calls limit):

> Cẩm nang chưa nêu bệnh nào gây ra tình trạng cá ngựa vằn cong người rồi chết, nên tôi không thể xác định bệnh từ đây. Trang cá ngựa vằn ghi nhiệt độ 18–25°C, pH 6,0–8,0 và độ cứng 5–20 dGH, bạn có thể đối chiếu với bể của mình; nếu cá cứ chết lặp lại, nên kiểm tra nước và tìm hiểu thêm về cách cách ly cá mới trong cẩm nang.
> 
> [Thẻ loài] Cá ngựa vằn (Danio rerio): nhiệt độ 18–25 °C; pH 6–8; GH 5–20; dài 5 cm; bể từ 90 cm; đàn từ 8 con; tính peaceful; độ khó 1/8
> 
> [Gợi ý hỏi tiếp] Nước cho cá ngựa vằn cần thế nào? · Cách cách ly cá mới để phòng bệnh? · Cá ngựa vằn nuôi chung với loài nào?

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

**Judge:** Y nói đúng thủ phạm chính: giặt mút lọc bằng nước lã làm chết vi sinh, rồi thay nước quá ít. Y đưa ra các bước sửa cụ thể: vắt mút trong nước bể, thay 20–30% mỗi tuần, mua bộ test, ngừng mua thêm cá. X chỉ nói chung chung về oxy và amoniac, trong khi bể đã sục 24/24, và X còn bỏ qua chuyện giặt mút. / X chỉ đúng thủ phạm: giặt mút lọc bằng nước máy làm chết vi sinh, cộng với thay nước quá ít. X cũng đưa các bước sửa cụ thể theo thứ tự. Y chỉ nói chung chung về nước xấu, tự thừa nhận không trả lời được chuyện giặt mút lọc, và gần như không có hướng dẫn làm gì.

**Ours lacks:** diagnosis, plan, tank-fit. **Plain lacks:** follow-up.

**Ours** (read 4 pages, stopped at the tools limit):

> Cẩm nang về cá chết hàng loạt cho thấy nguyên nhân hay gặp nhất là nước xấu: thiếu oxy, amoniac và nitrit tích lại khi lọc sinh học không chạy tốt, và chỉ châm thêm nước cho đầy mà không rút nước cũ ra có thể làm pH tụt và giết vi khuẩn trong lọc. Cá vàng thải rất nhiều chất bẩn, nên bạn nên đo oxy, amoniac, nitrit và pH để tìm đúng thủ phạm. Cẩm nang chưa có trang nói riêng về việc giặt mút lọc bằng nước máy, nên phần này bạn cần kiểm tra thêm.
> 
> [Trích: Cá chết hàng loạt trong bể: làm gì ngay và tìm nguyên nhân thế nào › Nguyên nhân]
> Oxy đứng đầu danh sách. Ngay sau oxy là amoniac. Dưới đây …

**Plain** (2226 characters):

> Nguyên nhân khả năng cao nhất là **độc tố amoniac/nitrit do hệ vi sinh lọc bị phá hỏng**. Cá chết dần, tháng nào cũng phải mua thêm là dấu hiệu điển hình của việc này.
> 
> **Vì sao xảy ra:**
> 
> 1. **Giặt mút lọc bằng nước máy/nước lã là nguyên nhân chính.** Trên mút lọc có một lớp vi khuẩn có lợi (vi khuẩn nitrat hóa) chuyên phân hủy amoniac từ phân và thức ăn thừa thành nitrit, rồi thành nitrat ít độc hơn. Clo trong nước máy và việc giặt sạch làm chết lớp vi khuẩn này. Bể mất khả năng "dọn" chất thải, amoniac tích tụ dần, cá chết từ từ. Bể trông vẫn trong nhưng độc tố vô hình.
> 
> 2. **Thay nước quá…

### sick-02 · tank · plain wins (3.5 · 6.5)

**Asked:** Bể tôi tuần nào cũng có cá chết dù nước trong và cho ăn ít, nguyên nhân là gì?

**Judge:** I'd pick Y. It names the two most likely culprits in this tank: washing the filter sponge in tap water, which kills the filter bacteria, and changing water only when it turns cloudy, so nitrate builds up and pH drifts. It then gives the fixes: change 25–30% every week, rinse the filter in old tank water, and see that goldfish are cold-water fish while 7 màu (guppies) need warm water. X only says to measure many readings with no steps to fix anything, and it puts oxygen first even though this tank is aerated 24/7. / X is the better answer. It is a generic list, but it covers the two habits most likely killing their fish: washing the filter sponge in tap water, which kills the filter bacteria, and changing water only when it turns cloudy. It gives the right fixes too: change 25–30% every week and rinse the sponge only in old tank water. It also mentions cold-water fish kept in warm water, which matters because they keep goldfish together with guppies (cá 7 màu). Y mainly tells them to run a long list of tests, and leads with low oxygen even though their tank has aeration running 24/24. It never mentions their filter-washing habit and gives no steps to take.

**Ours lacks:** plan, tank-fit, diagnosis. **Plain lacks:** tank-fit, too-long.

**Ours** (read 3 pages):

> Nước trong không có nghĩa là an toàn: cá chết hàng tuần thường do chất lượng nước không nhìn thấy được, như thiếu oxy hòa tan, amoniac hoặc nitrit tích tụ, lọc vi sinh ngừng chạy, hoặc pH tụt đột ngột khi chỉ châm thêm nước mà không rút nước cũ ra. Cẩm nang khuyên bạn đo oxy, amoniac tổng, nitrit, nitrat, pH, độ kiềm, nhiệt độ và clo (nếu dùng nước máy) để tìm đúng thủ phạm trước khi làm gì khác.
> 
> [Trích: Cá chết hàng loạt trong bể: làm gì ngay và tìm nguyên nhân thế nào › Nguyên nhân]
> Oxy đứng đầu danh sách. Ngay sau oxy là amoniac. Dưới đây là các thủ phạm cùng ngưỡng gây hại:
> - Thiếu oxy h…

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

### sick-03 · post · plain wins (2 · 7)

**Asked:** Hồ em trồng minifiss, ráy và ít cắt cắm (sunset, rong la hán), nuôi tép màu và ít cá (bảy màu, otto, pigmy). pH lúc có CO2 đo được 7, KH 4, GH 8, TDS 360; nước nguồn TDS cao (160-200). Rong èo uột không phát triển, ráy ra lá non nhưng không khỏe, có rêu xanh bám lá, fiss phát triển chậm. CO2 em để 2-3 giọt/giây nhưng test CO2 vẫn báo thiếu. Tép bị chết lai rai, cá tầm 1-2 tuần chết 1 con. Có cách nào hạ TDS không, hay do đâu?

**Judge:** X gần như không trả lời câu hỏi: không nói cách hạ TDS, không chỉ ra nguyên nhân và không có bước làm nào. Y tính đúng CO2 khoảng 12 ppm từ KH 4 và pH 7, nên nghi test kit hoặc dao động CO2, chỉ cách hạ TDS bằng nước RO kèm số liệu cụ thể, liệt kê nguyên nhân tép và cá chết theo thứ tự cần kiểm tra và đưa ra kế hoạch làm từng bước. Y chỉ có vài lỗi nhỏ, như đọc nhầm 'tầm' thành tên loài cá. / X works through the hobbyist's own numbers. Its CO2 calculation is right, it explains why TDS keeps rising from evaporation and fertiliser, it gives a safe way to lower TDS with RO water, and it sets out the checks in order. Y never diagnoses anything. It mostly quotes guide excerpts that don't fit this tank (soft water, failed molts) and gives no steps.

**Ours lacks:** diagnosis, plan, too-thin, tank-fit. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Cẩm nang chưa có trang nào em đọc được trả lời rõ cách hạ TDS hay vì sao CO2 vẫn báo thiếu, nên em chưa thể kết luận nguyên nhân từ đâu. Phần kiểm tra thông số nước và CO2 trong cẩm nang nói độ khoáng và mức CO2 ảnh hưởng trực tiếp đến cây, và phần dinh dưỡng ghi rằng lá non bị xoắn có thể do độ cứng nước thấp hoặc thiếu canxi. Với tép chết lai rai, cẩm nang cho biết tép thường chết khi lột xác bị kẹt vỏ, nên bạn nên xem lại việc lột xác trước khi đổ cho nước.
> 
> [Trích: Ánh sáng, CO2 và dinh dưỡng: Vì sao cây thủy sinh khó phát triển › Bước 2: Kiểm tra xem CO2 có đủ không]
> Việc thứ hai là xem …

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

**Judge:** Cả hai đều không dùng số liệu bể của người hỏi. Trong bể này, TDS 360 so với nước nguồn 160-200 cho thấy chất thải tích tụ do thay nước chưa đủ. Y cho bước kiểm tra cụ thể, bảo đo cả TDS nước nguồn để so sánh, và có hướng thay 20-30% nước mỗi tuần. X chỉ liệt kê nguyên nhân rồi dẫn sang cẩm nang, không có kế hoạch xử lý. / Neither answer uses the tank data. Tank TDS is 360 against 160-200 in the source water, which points to minerals building up from too few water changes. Even so, X gives a usable plan: test NH3/NO2/NO3, compare the tank's TDS with the source water's, and do gradual weekly 20-30% water changes with RO or rainwater mixed in. Y only says to test a few readings and blames failed molts, so it is too thin to act on.

**Ours lacks:** plan, tank-fit, too-thin. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 4 pages):

> Cẩm nang không nói TDS cao là nguyên nhân làm tép và cá chết. Các nguyên nhân cẩm nang liệt kê gồm thiếu oxy, amoniac, nitrit, pH tụt đột ngột và clo, nên bạn nên đo những chỉ số này trước. Tép còn có thể chết khi lột xác bị kẹt vỏ, nên tép chết lẻ tẻ chưa chắc là do nước.
> 
> [Trích: Cá chết hàng loạt trong bể: làm gì ngay và tìm nguyên nhân thế nào › Nguyên nhân]
> Oxy đứng đầu danh sách. Ngay sau oxy là amoniac. Dưới đây là các thủ phạm cùng ngưỡng gây hại:
> - Thiếu oxy hòa tan. Oxy trên 5 mg/L là tốt nhất. Dưới 5 mg/L cá bắt đầu bị stress. Từ 4 mg/L trở xuống cá có thể chết, tùy… [chạm để đọc t…

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

**Judge:** Y finds the likely cause: the white limestone keeps KH high, so CO2 can't bring pH down. It also gives clear steps in order: remove the media, change water, test, and use RO water. Its mistake of reading vảy ốc (Rotala plants) as snails is a real flaw. X uses a guide for falling pH on a tank whose pH is too high, and its advice to turn off CO2 points the wrong way. / X gives the right steps in order: take out Neo Soft, change water, and test KH. It also explains why the limestone keeps KH and pH high, but it mistakes the vảy ốc plants for snails. Y follows a guide for a pH drop and tells the hobbyist to turn off CO2, which is the wrong direction for a tank already at pH 8.4.

**Ours lacks:** wrong, diagnosis, tank-fit. **Plain lacks:** too-long, diagnosis, tank-fit.

**Ours** (read 5 pages, stopped at the tools limit):

> Cẩm nang chưa có trang nào về Neo Soft, nên mình không biết vật liệu này gây ra chuyện gì và không thể khẳng định nguyên nhân tép chết. Theo cẩm nang, khi pH tụt hoặc đổi đột ngột thì trước hết tắt CO2, tăng sục khí, rồi thay 20–30% nước đã khử clo (không thay từ 50% trở lên một lần), và mỗi giờ pH chỉ nên tăng tối đa khoảng 0,3–0,5 đơn vị. Vì vậy bạn nên tạm gỡ Neo Soft khỏi lọc và làm các bước trên trước.
> 
> [Trích: pH, GH, KH trong bể cá là gì: cách đo, chỉnh và xử lý pH tụt › Làm gì ngay khi pH tụt]
> 1. Tắt CO2. Tăng sục khí và làm mặt nước xáo động mạnh hơn.
> 2. Thay 20–30% nước bằng nước đã…

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

### sick-04 · tank · plain wins (4 · 6)

**Asked:** Tôi vừa thêm vật liệu lọc hạ pH thì tép chạy loạn rồi chết dần, phải làm gì?

**Judge:** Y's first step is to take out the pH-lowering media that caused the crash, then aerate and do a careful water change. X turns off CO2 but leaves the media in, so the pH keeps dropping. Neither answer picks up that the tank sits at pH 8.4 because of the white đá da voi, which is what makes adding Neo Soft cause such a big swing. / X's first step is to remove the pH-lowering media, which is the most important fix, and it then gives a sensible order of steps and what to test. Neither answer links the problem to the white elephant-skin rock pushing pH up to 8.4. Y never says to remove the Neo Soft, and its guide excerpt is written for a low-pH crash.

**Ours lacks:** diagnosis, tank-fit, plan. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 3 pages, stopped at the tools limit):

> Tép đang chạy loạn và chết dần là dấu hiệu pH tụt đột ngột, nên cần xử lý ngay. Cẩm nang hướng dẫn: tắt CO2, tăng sục khí và xáo động mặt nước, rồi thay 20–30% nước bằng nước đã khử clo, không thay từ 50% trở lên trong một lần. Cẩm nang không có trang riêng về loại vật liệu bạn vừa cho vào, nên hãy đo lại pH và KH trước khi thêm gì nữa.
> 
> [Trích: pH, GH, KH trong bể cá là gì: cách đo, chỉnh và xử lý pH tụt › Làm gì ngay khi pH tụt]
> 1. Tắt CO2. Tăng sục khí và làm mặt nước xáo động mạnh hơn.
> 2. Thay 20–30% nước bằng nước đã khử clo. Đừng thay từ 50% trở lên trong một lần. Mỗi giờ chỉ nên để pH …

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

### sick-05 · post · plain wins (3.5 · 8)

**Asked:** Bể của tôi set được 2 tháng, có đèn, oxy, CO2, nhưng gần đây nước trong bể có màu vàng nâu, cá thì chết lai rai. Tôi thay nước cách ngày 50% (dùng nước lọc loại mua uống hằng ngày) mà vẫn không hết. Giúp tôi với.

**Judge:** Y catches the real mistake: the hobbyist is changing 50% every other day with bottled water, which has no GH/KH buffer, so the pH crashes and the parameters keep swinging. It also checks for too much CO₂ and gives clear steps in order. X only blames tannin and says to test the water, and it ignores both the bottled water and the CO₂. / X saw the real mistake: the bottled drinking water has almost no minerals, so changing 50% every other day makes pH unstable and stresses the fish. It also checks CO₂ excess and ammonia, and gives clear steps in order. Y only guesses tannin, ignores the CO₂ and the water changes the hobbyist described, and leaves them with little more than "test first".

**Ours lacks:** tank-fit, plan, too-thin, figures. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Màu vàng nâu thường là tanin tiết ra từ lũa hoặc lá bàng, và cẩm nang nói tanin không hại cá; thay nước không hết vì nguồn tanin vẫn còn trong bể, nên có thể dùng than hoạt tính hoặc Purigen trong lọc. Còn cá chết lai rai thì cẩm nang ghi thiếu oxy hòa tan và amoniac cao là hai thứ giết cá nhanh nhất, nên bạn nên đo oxy và amoniac, nitrit trước khi làm tiếp.
> 
> [Trích: Cách làm trong nước bể cá bị đục bằng 5 phương pháp đơn giản › 4. Nước màu nâu]
> Nước bể ngả nâu chứ không xanh hay trắng đục thì thủ phạm thường là tanin. Đây là một hợp chất hữu cơ có sẵn trong lá bàng (catappa), lũa và các vật …

**Plain** (3054 characters):

> Nước vàng nâu kéo dài kèm cá chết dần thường có nguyên nhân chính không phải là "nước bẩn" đơn thuần. Bạn nên kiểm tra theo thứ tự sau.
> 
> ## 1. Xác định màu nước do đâu
> 
> - **Tannin (chất màu từ gỗ, lá):** Nếu bạn có lũa, lá bàng, lá khô, hoặc than bùn, nước sẽ vàng nâu như trà. Loại này thường không gây hại trực tiếp, nhưng không thể gây cá chết hàng loạt.
> - **Chất hữu cơ phân hủy:** Thức ăn thừa, cá chết, lá úa, phân cá tích tụ, nền đất/sỏi bị thối. Đây là nguyên nhân hay gặp nhất khi bể mới 2 tháng.
> - **Tảo silic (diatom):** Lớp màu nâu bám trên kính, lá, sỏi, thường gặp ở bể mới có đèn mạnh…

### sick-05 · tank · plain wins (2 · 5)

**Asked:** Nước bể tôi ngả vàng nâu và cá chết lai rai dù thay nước thường xuyên, vì sao?

**Judge:** Neither answer catches the likely cause: soft, low-mineral bottled water with CO₂ and big, frequent water changes, which can make pH and KH swing. Y at least gives tests to run, including pH, GH and KH, with clear first steps. X gives the wrong cause for an 8-week-old tank and says to change more water, which they already do. / Cả hai đều bỏ sót nguyên nhân dễ xảy ra nhất: nước uống đóng bình gần như không có khoáng, cộng với CO₂, làm pH trồi sụt mạnh. Dù vậy X vẫn đưa cách kiểm tra (gồm KH/GH, pH) và các bước xử lý an toàn. Còn Y chẩn đoán sai là hội chứng bể cũ và khuyên thay thêm nước, trong khi người nuôi đã thay rất nhiều.

**Ours lacks:** wrong, tank-fit, plan, diagnosis. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 2 pages, stopped at the time limit):

> Cẩm nang có một bài về hội chứng bể cũ (old tank syndrome): nitrate, khoáng từ nước máy và phosphate tích dần qua nhiều tháng, nhiều năm, và thay nước chưa đủ lượng thì chất bẩn vẫn tăng, cá chết lai rai dù bạn vẫn thay nước đều. Cẩm nang khuyên tăng lượng nước thay, ví dụ đang thay 10% mỗi tuần thì thử thay nhiều hơn. Màu vàng nâu thì cẩm nang chỉ giải thích trường hợp do lũa nhả tannin; nguyên nhân khác thì tôi chưa đọc được trong cẩm nang, nên bạn nên kiểm tra lại bể.
> 
> [Trích: Old tank syndrome: vì sao bể lâu năm thả cá mới là chết › Khắc phục bằng cách thay nước nhiều hơn]
> Cách dễ nhất là…

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

### sick-06 · post · plain wins (3 · 7.5)

**Asked:** Bể cá rồng nhà em dùng hơn 20 năm bị rò nên phải thay bể mới. Từ hôm chuyển sang bể mới, 2 con cá rồng bỏ ăn luôn, được gần 1 tuần rồi. Cá mồi vẫn bơi trong bể mà rồng không chịu ăn. Em theo dõi thì 2 con vẫn bơi bình thường, chưa nằm đáy. Phải làm sao?

**Judge:** Y nêu đúng nguyên nhân dễ gặp nhất là bể mới chưa ổn định vi sinh. Y cũng đưa ra các bước theo thứ tự: test nước, thay nước, lấy vật liệu lọc từ bể cũ, giảm stress, đổi mồi, và dấu hiệu cần lo gấp. X mỏng, kèm đoạn trích lạc đề về cá bạn và không nói tới việc bể mới chưa có vi sinh. / X nêu đúng nguyên nhân khả dĩ nhất là bể mới chưa chạy vi sinh và cá bị stress khi chuyển bể. X còn đưa các bước theo thứ tự: test nước, thay nước, chuyển vật liệu lọc từ bể cũ sang, giảm stress, kích thích ăn và theo dõi, dù hơi dài. Y quá mỏng, chưa gắn với tình huống thay bể, và còn đưa kèm một đoạn trích lạc đề về cá bạn.

**Ours lacks:** diagnosis, plan, too-thin, tank-fit. **Plain lacks:** too-long.

**Ours** (read 6 pages, stopped at the tools limit):

> Theo cẩm nang, cá rồng thường bắt đầu ăn lại sau khoảng một tuần khi chuyển bể. Có thể nâng nhiệt độ nước lên một chút và cho ăn giun sống để kích thích nó ăn. Nếu quá một tuần rồng vẫn bỏ ăn, đang gầy đi, hoặc có cá bạn tranh mồi, bạn nên kiểm tra nước, không tăng lượng thức ăn để chữa cháy, và tách cá sớm.
> 
> [Trích: Chọn cá bạn cho cá rồng: tiêu chí, cách thả và khi nào phải tách › Bắt đầu từ đâu]
> 1. Đối chiếu loài cá bạn định mua với từng tiêu chí ở trên, nhất là kích thước khi mua và cách nó tranh ăn so với rồng của bạn.
> 2. Chuẩn bị chỗ cách ly ít nhất một tháng và chuẩn bị sẵn phương án c…

**Plain** (3108 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là chuyện khá thường gặp. Nếu cá vẫn bơi bình thường, không nằm đáy, không đổi màu thì chưa phải cấp cứu, nhưng bỏ ăn gần 1 tuần thì bạn cần xử lý ngay. Bạn nên làm theo các bước sau.
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻):** Bể mới chưa chạy nitơ (chưa "cycle") thì hai chỉ số này dễ tăng cao và gây stress, mất cảm giác thèm ăn. Mục tiêu là 0 ppm cho cả hai.
> - **Nitrat:** Giữ dưới 40 ppm, lý tưởng dưới 20 ppm.
> - **pH và độ cứng:** Khác biệt lớn so với bể cũ cũng gây sốc. Nếu nước bể cũ và bể mới khác nhau nhiề…

### sick-06 · tank · plain wins (4 · 7)

**Asked:** Cá rồng của tôi bỏ ăn gần một tuần từ khi chuyển sang bể mới, làm sao?

**Judge:** The likely cause is a tank only one week old whose nitrogen cycle hasn't finished. Y says this directly and gives the steps in order: test the water, change 25–30% daily, reduce stress, tempt the fish with food, then watch for disease signs, with a clear 2-week threshold. X is short, never mentions that the new tank is uncycled, and shows one guide excerpt that is off-topic. / X is the better answer. It names an uncycled new tank (ammonia/nitrite) as the main suspect, which fits a tank that has run one week. It also gives clear steps: test the water, change water gradually, reduce stress, offer tempting food and know when to worry. It is generic, though, and asks for details the app already has. Y is thin and never links the refusal to the new, uncycled tank. It suggests raising the temperature, which carries some risk, and its first excerpt (on choosing tank mates) is off-topic.

**Ours lacks:** diagnosis, plan, figures, too-thin. **Plain lacks:** too-long, tank-fit.

**Ours** (read 5 pages, stopped at the tools limit):

> Theo cẩm nang, cá rồng thường bắt đầu ăn lại sau khoảng một tuần kể từ khi chuyển bể; bạn có thể nâng nhiệt độ nước lên một chút và cho ăn giun sống để kích thích. Nếu quá một tuần rồng vẫn bỏ ăn, nhất là khi có cá khác tranh mồi hoặc rồng bắt đầu gầy đi, đừng tăng lượng thức ăn: hãy test nước ngay, thay nước nếu chỉ số xấu và tách cá sớm.
> 
> [Trích: Chọn cá bạn cho cá rồng: tiêu chí, cách thả và khi nào phải tách › Bắt đầu từ đâu]
> 1. Đối chiếu loài cá bạn định mua với từng tiêu chí ở trên, nhất là kích thước khi mua và cách nó tranh ăn so với rồng của bạn.
> 2. Chuẩn bị chỗ cách ly ít nhất một t…

**Plain** (2612 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là phản ứng khá phổ biến vì chúng rất nhạy với stress. Tuy vậy, một tuần là đủ lâu để bạn cần kiểm tra kỹ. Bạn có thể làm theo các bước sau:
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - Dùng bộ test để đo **amonia (NH₃/NH₄⁺), nitrit (NO₂⁻), nitrat (NO₃⁻), pH, nhiệt độ**.
> - Amonia hoặc nitrit lớn hơn 0 là dấu hiệu nguy hiểm. Bể mới chưa chạy xong chu trình nitơ (cycling) rất dễ xảy ra tình trạng này.
> - Nếu có amonia/nitrit: thay 25–30% nước mỗi ngày, dùng nước đã khử clo và có nhiệt độ, pH gần với bể cũ. Không thay quá nhiều một lúc vì sẽ gây sốc thêm.
> -…

### sick-07 · post · not judged

**Asked:** Em vừa lật bể, vứt nền sỏi nhỏ đi vì thấy bẩn quá, thì tự nhiên thấy 1 con bị như nấm trắng. Em đang tách riêng, cho ít muối hột vào xem có khỏi không. Như vậy đã đúng chưa, cần làm gì thêm?

**Ours** (read 4 pages, stopped at the error limit):

failed: Request timed out.

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

### sick-07 · tank · plain wins (3 · 7)

**Asked:** Sau khi lật bể, một con cá của tôi bị nấm trắng, tách riêng và cho muối đã đủ chưa?

**Judge:** Y trả lời thẳng câu hỏi: chỉ có muối thì chưa đủ. Y nói nguyên nhân hay gặp sau khi lật bể là chu trình nitơ bị xáo trộn, và đưa các bước theo thứ tự với liều muối, nhiệt độ và số ngày điều trị hợp lý. X thừa nhận chưa đọc tới phần liều muối, không trả lời được câu hỏi, cũng không có bước nào để làm ngay. / X trả lời thẳng câu hỏi: chỉ dùng muối là chưa đủ. Nó cũng nêu nguyên nhân hay gặp sau khi lật bể (amoniac/nitrit tăng), cho liều muối hợp lý và các bước làm theo thứ tự với xanh methylene, test nước và thay nước. Y tự nhận chưa đọc tới phần liều nên không trả lời được, chỉ đẩy người hỏi sang đoạn trích, gần như không có việc gì để làm ngay.

**Ours lacks:** plan, figures, too-thin. **Plain lacks:** tank-fit, too-long.

**Ours** (read 1 pages, stopped at the time limit):

> Cẩm nang nói muối hột trị nấm trên thân và nấm miệng khá hiệu quả, nhưng không đặt muối lên đầu danh sách vì có một số điểm bất lợi. Với nấm bám trên thân hoặc vây, cẩm nang khuyên dùng thuốc trị nấm cùng lúc với kháng sinh, và dọn bể thật kỹ trước khi dùng thuốc. Phần liều muối và cách dùng mình chưa đọc tới, nên chưa thể xác nhận muối một mình đã đủ hay chưa; bạn xem mục bên dưới để biết rõ hơn.
> 
> [Trích: Cá bị nấm trắng: nguyên nhân, cách chữa bằng thuốc và muối › Không có thuốc thì dùng muối thế nào]
> Muối hột dành cho bể cá trị nấm thân và nấm miệng rất hiệu quả. Nó không được xếp lên đầu …

**Plain** (1892 characters):

> Muối **chưa đủ** nếu bạn chỉ dùng muối. Cá bị nấm sau khi lật bể thường là hệ quả của nước xấu (amoniac, nitrit tăng cao), nên cần xử lý cả nguyên nhân lẫn con cá.
> 
> **Việc nên làm ngay:**
> 
> 1. **Cách ly cá đúng cách:** Dùng bể riêng có sục khí, lọc nhẹ hoặc không lọc (tránh hút cá vào máy), không trồng cây, không đặt nền sỏi.
> 2. **Kiểm tra nước bể cũ và bể cách ly:** Dùng bộ test để đo NH3/NH4+, NO2-, NO3-, pH. Nếu amoniac hoặc nitrit > 0, thay nước ngay (khoảng 30-50%) và thay từng phần hằng ngày cho đến khi ổn định. Nước bể cách ly phải sạch, cùng nhiệt độ và pH với bể cũ.
> 3. **Thuốc trị nấm…

### sick-08 · post · plain wins (4 · 7)

**Asked:** Hồ mình đang có rêu tảo hại nên mình thử nuôi otto. Thả vào thì cá rất khỏe, bơi kiếm ăn (không quá manh động), nhưng sau một đêm 3 con chết hết, sáng ra thấy nằm im, đụng vào không nhúc nhích. Cùng lúc đó có một đàn neon trong bể vẫn bình thường mà otto thì chết. Vì sao vậy?

**Judge:** Cả 3 con otto chết chỉ sau một đêm. X gán việc này cho cá không chịu ăn, nhưng chết đói không nhanh đến vậy, và X gần như không có bước nào để làm ngay. Y nêu đúng những nguyên nhân hợp với tình huống: hóa chất diệt rêu (bạn đang có tảo hại), sốc khi thả và bể chưa ổn định vi sinh. Y cũng có các bước kiểm tra, xử lý cụ thể, dù hơi dài và xếp sai thứ tự khả năng. / X covers the causes that fit fast deaths: acclimation shock, algae-killing chemicals (which matter because the hobbyist has an algae problem), ammonia and oxygen. It also gives clear steps to check and fix things now. Y is thin and leads with starvation, which can't kill fish in one night. Its main advice is to ask the seller, which doesn't help the tank today.

**Ours lacks:** too-thin, plan, tank-fit. **Plain lacks:** too-long.

**Ours** (read 2 pages):

> Cẩm nang nêu hai nguyên nhân hay gặp khi otto chết sau khi thả: cá bắt tự nhiên không chịu ăn thức ăn viên nên yếu dần, và bể mới hoặc thông số nước thay đổi đột ngột làm cá bị sốc. Neon khỏe hơn nên vẫn sống được trong cùng điều kiện. Bạn nên hỏi người bán cá là cá bắt tự nhiên hay nuôi sinh sản, và thả cá qua xô và ống nhỏ giọt khoảng 4–5 tiếng để cá làm quen nước.
> 
> [Trích: Nuôi cá otto (Otocinclus): thả cá, cho ăn và giữ nước ổn định › Bắt đầu từ đâu]
> - Kiểm tra bể đã chạy ổn định chưa. Bể mới set thì chờ thêm, chưa nên mua otto.
> - Hỏi rõ cá là cá bắt tự nhiên hay cá nuôi sinh sản, ưu tiên…

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

### sick-08 · tank · plain wins (4 · 7)

**Asked:** Tôi thả cá otto ăn rêu mà sau một đêm chết hết trong khi neon vẫn khỏe, vì sao?

**Judge:** Y nêu đúng các nguyên nhân khiến cá chết trong một đêm: sốc nước, NH₃/NO₂, clo, cá yếu sẵn và đồng. Y cũng chỉ cách kiểm tra ngay, nhưng câu trả lời dài và chung chung. X đổ cho việc cá chết đói, điều không thể xảy ra sau một đêm khi hồ còn rêu, và không cho hướng kiểm tra nào ngay lúc này. / X liệt kê đúng những nguyên nhân làm cá chết sau một đêm: sốc nước, NH₃/NO₂, clo, thiếu oxy và đồng trong thuốc diệt rêu. Ý thuốc diệt rêu rất sát vì hồ đang có rêu hại. X cũng chỉ cần đo gì ngay. Y quá ngắn, đưa ra nguyên nhân chết đói không khớp với việc cá chết qua một đêm, không có bước kiểm tra nào, và con số 4–5 tiếng làm quen nước là đáng ngờ.

**Ours lacks:** diagnosis, follow-up, plan. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages):

> Cẩm nang cho biết có hai nguyên nhân hay gặp: bể mới chưa ổn định, hoặc cá otto bắt tự nhiên chịu stress kém và không chịu ăn thức ăn viên nên chết khi bể không đủ rêu. Neon thường khỏe hơn nên có thể sống sót khi otto không qua được. Lần sau, hãy mua đàn 5 con trở lên đã nuôi ở cửa hàng vài tuần, thả khi bể đã chạy ổn định và để cá làm quen nước 4–5 tiếng.
> 
> [Trích: Nuôi cá otto (Otocinclus): thả cá, cho ăn và giữ nước ổn định › Bắt đầu từ đâu]
> - Kiểm tra bể đã chạy ổn định chưa. Bể mới set thì chờ thêm, chưa nên mua otto.
> - Hỏi rõ cá là cá bắt tự nhiên hay cá nuôi sinh sản, ưu tiên cá nuôi s…

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

**Ours** (read 4 pages, stopped at the error limit):

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

### sick-09 · tank · not judged

**Asked:** Cá trong bể tôi thả vào mấy hôm là chết, trời lạnh lại chết thêm, do đâu?

**Ours** (read 4 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (2551 characters):

> Cá chết sau vài ngày thả vào và chết thêm khi trời lạnh thường có liên quan đến **chất lượng nước** và **nhiệt độ**. Các nguyên nhân thường gặp:
> 
> ## 1. Nước chưa "chín" (chưa cycling)
> Đây là nguyên nhân phổ biến nhất với bể mới.
> - Cá thải ra **amoniac (NH₃/NH₄⁺)**, và amoniac rất độc. Vi khuẩn có lợi trong bể chuyển nó thành nitrit, rồi thành nitrat, nhưng bể mới chưa đủ vi khuẩn nên amoniac và nitrit tích tụ.
> - Cá chết sau 2–7 ngày, thường có dấu hiệu thở gấp, nổi đầu lên mặt nước, mang đỏ hoặc tái, lờ đờ, bơi lảo đảo.
> - **Cách kiểm tra:** dùng bộ test nước (API hoặc tương đương) đo amoniac,…

### stocking-01 · post · not judged

**Asked:** Em mới tập chơi lại bể cá. Ban đầu hỏi loại nào dễ nuôi, khỏe thì được tư vấn mua 2 cá vàng, 2 con bống (bảo nó ăn phân thừa) và 2 con dọn bể. Được vài hôm 1 con cá vàng chết, nghi đánh nhau. Em mua thêm 10 con 7 màu bé thả vào, vài hôm còn 9, 8 rồi 7 mà không thấy xác. Lạ nhất là 1 con 7 màu bụng to như chửa cũng biến mất. Hôm qua 1 con bống chết, nay con dọn bể chết và mất thêm 2 con 7 màu. Con bống với con dọn bể còn nửa xác, thấy con bống còn lại thỉnh thoảng rỉa. Có phải chúng đánh nhau và con to ăn con bé không? Vậy chỉ được thả cá sàn sàn nhau thôi à?

**Ours** (read 0 pages, stopped at the error limit):

failed: Request timed out.

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

### stocking-01 · tank · not judged

**Asked:** Bảy màu trong bể tôi cứ biến mất không thấy xác, có phải bị cá khác ăn không?

**Ours** (read 1 pages, stopped at the error limit):

failed: Request timed out.

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

### stocking-02 · post · plain wins (2 · 6)

**Asked:** Hồ em 60x40x40, được 1 tuần, đang thả 5 mún + 5 chuột, cá đang tung tăng tốt. Em tính thả thêm 40 neon nữa vậy có nhiều không? Mún có sống chung với neon được không?

**Judge:** Y nói đúng điểm quan trọng nhất: hồ mới chạy 1 tuần thì đừng thả 40 neon một lúc, nên đo NH3/NO2 rồi chia ra thả nhiều đợt. Y cũng xác nhận cá chuột sống chung với neon tốt. Tiếc là Y không biết mún là cá platy, loài hiền sống chung được với neon. X thì chẳng giúp gì, chỉ hỏi lại người hỏi. / X is the better answer. It flags the real risk of a tank that's only one week old, says 40 neons is too many to add now, and gives a sound plan: test ammonia and nitrite first, then add the neons in 2-3 batches. It also correctly says cá chuột (corydoras) are fine with neons. Its weak points are not knowing that mún is the platy and giving a temperature range that's too cool for Vietnam. Y gives no advice and only asks questions back.

**Ours lacks:** asks-only, too-thin, tank-fit, plan. **Plain lacks:** local, diagnosis, tank-fit.

**Ours** (read 0 pages, stopped at the time limit):

> Trong cẩm nang, tôi chưa tìm thấy trang nào cho "mún" nên chưa xác nhận được loài này, và chưa kiểm tra được việc nuôi chung với neon hay mật độ 40 con neon trong bể 60x40x40 cm. Bạn có thể cho tôi tên khoa học hoặc tên khác của loài "mún" để tôi tra lại. Trong lúc đó, bạn nên xem trang từng loài neon để biết nhu cầu của chúng trước khi thả thêm.
> 
> [Gợi ý hỏi tiếp] Cá mún là loài nào, tên khoa học là gì? · Cá neon xanh cần nuôi thế nào? · Bể 60x40x40 nuôi được bao nhiêu cá?

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

### stocking-02 · tank · not judged

**Asked:** Bể của tôi thả thêm 40 con neon có nhiều quá không, nuôi chung với mún được không?

**Ours** (read 1 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (1103 characters):

> Nếu bể của bạn khoảng **100 lít trở lên** và có lọc tốt, thả thêm 40 con neon thường vẫn được, vì neon là cá đàn nhỏ, hiền. Nhưng 40 con khá đông, nên bạn cần kiểm tra vài điều:
> 
> - **Kích thước bể:** Bể dưới 60 lít mà có 40 con neon sẽ rất chật, dễ phát sinh ô nhiễm và stress. Neon nên được nuôi đàn từ 10 con trở lên, và càng nhiều càng tốt nếu bể đủ rộng.
> - **Lọc và thay nước:** Đàn đông thải nhiều chất bẩn hơn. Bạn cần lọc đủ công suất (ít nhất gấp 4-5 lần thể tích bể mỗi giờ) và thay 25-30% nước mỗi tuần.
> - **Chỉ số nước:** Sau khi thả, theo dõi amoniac và nitrit. Hai chỉ số này phải luôn …

### stocking-03 · post · plain wins (2 · 8)

**Asked:** Em mới kiếm được cái bể kích thước 35x20x22cm, chưa chơi bao giờ. Nên nuôi loại cá nào cho đẹp, dự định 1 tuần thay nước 1 lần? Có cần mua lọc và sục khí cho bể không?

**Judge:** X không trả lời được câu nào, chỉ đưa ra hai đoạn trích chung chung rồi gợi ý hỏi lại. Y tính đúng bể khoảng 15 lít, gợi ý cá xiêm, tôm cherry hoặc vài con bảy màu, thay 25–30% mỗi tuần, dùng lọc bọt biển chạy bằng máy sủi, chạy bể 2–4 tuần và khử clo. Đó là những gì người mới ở Việt Nam cần, chỉ có vài lỗi nhỏ. / X answers all three questions for a 15 L tank. It suggests one male betta or a group of shrimp, a 25–30% water change once a week, and a sponge filter run by an air pump. It also tells the beginner to cycle the tank first and to treat tap water to remove chlorine. Y admits it couldn't open the guide's details. It only shows two excerpts, one of them about a 55 L tank, and doesn't answer any of the questions.

**Ours lacks:** too-thin, tank-fit, plan, asks-only. **Plain lacks:** –.

**Ours** (read 0 pages, stopped at the time limit):

> Em chưa mở được nội dung chi tiết nên chưa thể trả lời chắc về loài cá phù hợp hay tần suất thay nước cho bể 35x20x22 cm. Trong cẩm nang, em xem thử phần lọc bọt biển có cần đá sục khí không và phần bảo dưỡng định kỳ gồm thay nước, lọc, cắt tỉa.
> 
> [Trích: Lọc bọt biển (sponge filter): loại lọc bể cá dễ dùng nhất › Lọc bọt biển có cần đá sục khí không?]
> Một số người chơi thích thêm đá sục khí vào bên trong lọc bọt biển, nhưng đá có thể tuột ra theo thời gian hoặc để bọt khí thoát ra bên hông khối bọt biển. Thay vào đó, lọc bọt biển Aquarium Co-Op (và bộ nâng cấp Easy… [chạm để đọc tiếp]
> 
> [Trích…

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

### stocking-03 · tank · not judged

**Asked:** Bể tôi nên nuôi cá gì, bao nhiêu con, có cần lọc và sục khí không?

**Ours** (read 0 pages, stopped at the error limit):

failed: Request timed out.

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

### stocking-04 · post · ours wins (4.5 · 3.5)

**Asked:** Em thích con cá bống vàng vì nó khá sinh động (lúc núp dưới đá, lúc đậu trên cây, trên đá) và dọn bể rất sạch, từ ngày nuôi không phải cạo rêu thành bể nữa, cũng chả cần cho ăn gì mà vẫn sống. Nuôi loại gì chung với bống này được? Trước em nuôi mún, rồi kiếm, rồi cá bảy màu, đều cứ chết dần, không biết có phải bị con bống xử không?

**Judge:** X is thin and doesn't name the cause outright. Still, it correctly says a grown bống vàng clings to other fish and sucks their slime, which is the likely reason the guppies, platies and swordtails kept dying. Y gives a tidy checklist, but it misidentifies the fish, clears the bống as the culprit, and lists a sea fish as a tankmate. / Y gives the key fact: bống vàng (the golden Chinese algae eater) latches onto other fish and eats their slime coat. That is very likely why the platies, swordtails and guppies kept dying, but Y doesn't connect the two or give a plan. X is more structured, but it says the bống is probably not the cause and adds a wrong tankmate suggestion, which steers the hobbyist away from the real fix: take the bống out or keep it alone.

**Ours lacks:** diagnosis, plan, too-thin. **Plain lacks:** diagnosis, wrong, tank-fit.

**Ours** (read 1 pages):

> Cẩm nang chưa có trang riêng về cá bống vàng, nên em chưa thể tra cụ thể nó nuôi chung với loài nào. Điều duy nhất cẩm nang ghi là bống vàng ăn tảo nâu tốt, nhưng khi lớn nó lười ăn rêu và hay bám vào mút nhớt của cá khác, làm cá đĩa, cá thần tiên dễ bị stress, nên nên bắt bống ra trước khi thả cá đẹp. Cẩm nang không nói bống vàng làm cá khác chết, nên nguyên nhân cá mún, kiếm, bảy màu chết dần chưa rõ.
> 
> [Trích: Thay nước, vệ sinh bể và kiểm soát rêu hại trong bể thủy sinh › Bắt đầu từ đâu]
> 1. Nếu đang hút cặn bằng ống mà thấy phí nước, hãy thử dùng một lọc thùng nhỏ chỉ để hút cặn quanh gốc …

**Plain** (1911 characters):

> Bống thường hiền với cá cùng cỡ, nhưng một số loài bống có tính lãnh thổ và có thể rượt hoặc cắn cá nhỏ, nhất là cá nằm đáy. Dù vậy, khả năng cao cá chết không phải do bống "xử". Mình nghĩ có mấy nguyên nhân hay gặp hơn:
> 
> 1. **Chất lượng nước**: Bể không cần cạo rêu, không thay nước, không cho ăn có thể đang tích tụ amoniac, nitrit hoặc nitrat. Đây là nguyên nhân phổ biến nhất khiến cá chết dần. Nên test nước (kit amoniac, nitrit, nitrat, pH) và thay 20–30% nước nếu chỉ số cao.
> 2. **Thiếu thức ăn**: Bống có thể sống nhờ rêu, màng sinh học và thức ăn tự nhiên trong bể, nhưng cá mún, kiếm, bảy …

### stocking-04 · tank · ours wins (5 · 3)

**Asked:** Bể tôi nuôi chung được những cá nào, khi cá thả thêm cứ chết dần?

**Judge:** The likely cause is the bống vàng. It sucks the slime coat off other fish, and this one is hungry because it isn't fed, so the mollies, swordtails and guppies died one after another. X brings up this slime-sucking habit, which is the key fact, but doesn't tie it to their deaths and doesn't say what to do next. Y gives generic water-quality causes, ignores the bống vàng, suggests fish that already died here, and uses fish names wrongly for Vietnam. / Y nêu được điểm mấu chốt là bống vàng khi lớn hay mút nhớt cá khác, và đây nhiều khả năng là lý do mún, kiếm, bảy màu chết dần. Tuy vậy Y không nói thẳng điều này, không bảo bắt bống ra hay cho bống ăn, và trả lời quá ngắn. X chung chung, bỏ qua con bống, còn gợi ý nuôi lại đúng những loài đã chết và gọi nhầm tên cá.

**Ours lacks:** diagnosis, plan, too-thin. **Plain lacks:** tank-fit, diagnosis, local, too-long.

**Ours** (read 2 pages, stopped at the calls limit):

> Cẩm nang chưa cho biết cụ thể loài nào nuôi chung được với bống vàng trong bể của bạn, vì bạn chưa nói sẽ thả thêm cá nào. Cẩm nang có hai gợi ý: cá mua về phải được tập nước khoảng 10 phút trong bịch rồi chuyển từ từ bằng dây sủi khí trước khi thả, và bống vàng khi lớn hay bám mút nhớt cá khác, nên bắt ra trước khi thả cá đĩa hoặc cá thần tiên. Bạn gửi tên loài cá định thả để tôi kiểm tra có sống chung được không.
> 
> [Trích: Trị rêu hại bằng cá, tép, ốc ăn rêu cho bể thủy sinh › Thả cá, tép thế nào để chúng không chết]
> Cá, ốc, tép mua về cần được tập nước trước khi thả. Làm theo các bước sau:
> …

**Plain** (2273 characters):

> Cá chết dần mỗi lần thả thêm thường không phải do loài không hợp nhau mà chủ yếu do **chất lượng nước**. Bạn nên kiểm tra các điểm sau trước.
> 
> ## 1. Nguyên nhân hay gặp nhất
> 
> - **Nước chưa ổn định (chu trình nitơ chưa hoàn thiện):** Mỗi lần thả thêm cá, lượng amoniac và nitrit tăng đột ngột, làm cá yếu và chết. Bạn nên dùng bộ test (API hoặc tương tự) để đo NH3/NH4+ và NO2-. Hai chỉ số này phải bằng 0. NO3- nên dưới 20-40 ppm.
> - **Quá tải cá:** Quy tắc tham khảo là khoảng 1 inch (2,5 cm) cá trưởng thành cho 1 gallon (3,8 lít) nước, nhưng thực tế nên thưa hơn. Bể nhỏ dưới 60 lít chỉ nên nuôi v…

### stocking-05 · post · plain wins (3 · 7)

**Asked:** Em mới mua thêm mấy con cá chép thả chung với cá vàng, mà nó tấn công cá vàng kinh quá, một con chết rồi. Hỏi cửa hàng thì họ bảo thả chung được em mới mua. Giờ em nên làm sao, chép với cá vàng có nuôi chung được không?

**Judge:** Y says plainly that carp and goldfish shouldn't share a tank and gives clear steps in order: separate the carp, check the goldfish for wounds, remove the dead fish, change water, add aeration and watch for a few days. X hedges, quotes a confusing line from the koi page and gives the hobbyist almost nothing to act on. / X trả lời thẳng là không nên thả chung và đưa các bước theo thứ tự: tách chép, xem vết thương cá vàng, vớt cá chết, thay nước. Y chủ yếu nói cẩm nang không có trang về chép, lại dẫn ý koi nuôi chung cá vàng được. Y gần như không có bước nào để làm ngoài việc tách chép.

**Ours lacks:** plan, diagnosis, too-thin. **Plain lacks:** tank-fit.

**Ours** (read 3 pages, stopped at the calls limit):

> Cẩm nang chưa có trang riêng cho cá chép thường nên em chưa xác nhận được chép có tấn công cá vàng hay không. Cẩm nang ghi cá vàng vốn hiền nhưng có thể cắn vây nhau khi bị stress, khi bể quá đông hoặc khi tranh ăn; trang cá koi (cùng họ cá chép) cho rằng chuyện koi và cá vàng không nuôi chung được là hiểu lầm, nhưng em cần đọc kỹ điều kiện ở phần đó. Trước mắt em nên tách riêng chép ra, kiểm tra kích thước và chỗ bơi, rồi cho ăn đủ để giảm tranh giành.
> 
> [Trích: Cá vàng]
> Nuôi chung
> Tránh: Cá betta (cá xiêm), Cá bảy màu, Cá tam giác
> Gợi ý theo nhiệt độ, pH, kích thước và tính cách của từng loà…

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

**Judge:** Y explains the cause well enough: carp are strong, chase and nip fins, and outgrow the tank. Then it gives clear steps: separate the carp, check the goldfish for wounds, add hiding places, and move the carp to a pond. X only reads out a tool result about koi eating goldfish, which is wrong, and gives no steps. Neither answer brings up the goldfish that already died or says to check the water. / X answers clearly that the two shouldn't share a tank and gives a usable plan: separate the carp now, check the goldfish for wounds, and move the carp to an outdoor pond. Y answers about koi instead of their carp, claims it may eat the goldfish, and gives no steps. Neither mentions the goldfish that already died or the risk of disease from a new, unquarantined fish.

**Ours lacks:** plan, diagnosis, follow-up, wrong, tank-fit. **Plain lacks:** tank-fit, figures, diagnosis.

**Ours** (read 2 pages):

> Không nên nuôi chung: cá koi có thể ăn cá vàng, vì koi lớn tới 90 cm còn cá vàng khoảng 20 cm. Cẩm nang chưa có trang riêng cho cá chép nói chung, nên kết quả này xét theo cá koi; nếu cá chép trong bể là loài khác, bạn hãy cho biết tên để kiểm tra lại.
> 
> [Công cụ: Nuôi chung cho Bể của tôi]
> Không nên nuôi chung: Cá koi có thể ăn Cá vàng.
> Cá koi (90 cm) có thể ăn Cá vàng (20 cm).
> Cá vàng hay cắn vây cá khác: tránh nuôi chung với cá vây dài, bơi chậm.
> Chưa kiểm tra cá chép: cẩm nang chưa có trang nên chưa có số liệu để so.
> 
> [Gợi ý hỏi tiếp] Cá koi cần bể lớn bao nhiêu lít? · Cá vàng nên nuôi chu…

**Plain** (1280 characters):

> **Thường thì không nên nuôi chung.** Cá chép lớn nhanh, có thể dài 30-60 cm hoặc hơn, khỏe và hiếu động hơn nhiều. Cá vàng bơi chậm, vây dài, dễ bị thương, nên cá chép thường xuyên đuổi, húc hoặc cắn vây cá vàng. Ngay cả khi cá chép còn nhỏ, sau vài tháng nó sẽ lớn và gây hại nhiều hơn.
> 
> **Bạn nên làm ngay:**
> 
> 1. **Tách cá chép ra** nếu có thể, bằng một bể riêng hoặc ngăn tạm bằng lưới/tấm nhựa trong bể.
> 2. **Kiểm tra cá vàng**: tìm vết cắn, rách vây, trầy xước, đốm đỏ hoặc nấm trắng. Nếu có vết thương, nên thay một phần nước và theo dõi, có thể dùng thuốc xanh methylen hoặc muối (liều nhẹ) đ…

### stocking-06 · post · plain wins (1 · 7)

**Asked:** Em vừa set cái bể cubic theo tư vấn, đáy bể để 5 con nerita. Ra cửa hàng thấy cá kiếm mắt đỏ đẹp quá nên mua thử vài con. Mấy con mún đỏ sắp đẻ nên em đang tính chuyển sang chỗ khác vì sợ bị ăn hết trứng, cá con, bắt đầu thấy ngại rồi. Bể có lọc thác, có cần thay nước hàng tuần không vì thấy nước có mùi hôi?

**Judge:** X không trả lời gì, chỉ chỉ sang các bài trong cẩm nang. Y giải thích đúng rằng mún và kiếm đẻ con, cho các bước tách cá con, nói rõ ốc nerita vô hại, chẩn đoán mùi hôi là do bể mới chưa chạy vi sinh, cho ăn dư hoặc nuôi đông, rồi đưa lịch thay nước và cách rửa lọc theo thứ tự. Y chỉ còn vài điểm nhỏ: xưng hô lẫn lộn và không cảnh báo rằng thả thêm cá vào bể mới làm nước nặng thêm. / X sửa đúng hiểu lầm (mún và kiếm đẻ con chứ không đẻ trứng), chỉ cách tách cá mẹ, nói ốc nerita không đáng lo, giải thích vì sao nước bể mới có mùi hôi và đưa các bước thay nước, vệ sinh lọc theo thứ tự. Y không đưa ra lời khuyên nào cả.

**Ours lacks:** too-thin, plan, diagnosis. **Plain lacks:** tank-fit.

**Ours** (read 0 pages, stopped at the tools limit):

> Hiện em chưa mở được nội dung trang nào nên chưa thể trả lời chắc chắn cho các câu hỏi về cá kiếm mắt đỏ, việc chuyển cá khi mún sắp đẻ, nerita và thay nước. Trong cẩm nang có các hướng dẫn gần nhất như 'Thay nước bể thủy sinh: lịch thay, cách hút cặn và xử lý cá sốc nước' và 'Bao lâu phải vệ sinh hoặc thay nước bể cá một lần?', anh/chị có thể tham khảo để biết lịch thay nước khi nước có mùi hôi.
> 
> [Gợi ý hỏi tiếp] Lịch thay nước cho bể thủy sinh mới set là bao lâu? · Cá molly đẻ thì cần chuẩn bị gì? · Ốc nerita có ăn cá con không?

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

### stocking-06 · tank · plain wins (4 · 6)

**Asked:** Mún trong bể tôi sắp đẻ, có cần tách ra không, và có phải thay nước hàng tuần không?

**Judge:** Y gives a usable plan: how to separate the mother, how to tell birth is close, how to feed the fry, and weekly water-change percentages. It also points to ammonia and nitrite, which matters here. X is thin and shows a guppy excerpt. Neither answer notices that this is a newly set-up tank with smelly water, which likely means it hasn't cycled yet and needs more water changes now. / X gives the clearer plan: how to separate the fry, how to tell the birth is close, what to feed the fry, and weekly water changes with figures. It also says to keep ammonia and nitrite at 0. Neither answer notices that the cubic tank is newly set up and smells bad, or that the kiếm (swordtail) will eat the fry. Y gives a sensible warning about not moving the mother when she is close to giving birth, but it is thin, and one of its excerpts is about guppies.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 4 pages):

> Mún chính là cá platy (cá platy còn được gọi là cá mún). Cẩm nang khuyên không bắt cá mẹ chuyển bể khi đã sát ngày đẻ vì có thể sẩy thai hoặc chết, nên dùng vách ngăn trong bể; sau khi đẻ thì vớt cá mẹ ra và nuôi cá con tách khỏi cá lớn. Về nước, cẩm nang ghi mỗi tuần thay 20–25% nước, nhưng tỷ lệ phù hợp có thể khác tùy lọc và các yếu tố khác của bể.
> 
> [Trích: Cá bảy màu sắp đẻ: dấu hiệu, cách tách cá mẹ và nuôi cá con › Tách cá mẹ]
> Tách cá mẹ lúc nào thì các nguồn nói hơi khác nhau. Một nguồn khuyên chuyển cá mái sang bể đẻ hoặc hộp đẻ ngay khi thấy rõ là có thai. Nhiều người chơi khác lại t…

**Plain** (1246 characters):

> Bạn nên **tách mún mẹ ra** nếu muốn giữ được cá con. Mún là loài đẻ con, và cá lớn thường ăn cá con ngay sau khi chúng được sinh ra.
> 
> **Cách tách và chuẩn bị:**
> - **Dùng lồng đẻ (breeder box)** treo trong bể hoặc **bể nhỏ riêng** có cây thủy sinh dày như rêu java, rong đuôi chó để cá con có chỗ trốn.
> - **Nhận biết sắp đẻ:** bụng to và vuông, có một đốm đen gần gốc vây hậu môn (gravid spot) sẫm dần. Thường khi thấy vậy thì còn khoảng 1–2 ngày.
> - **Sau khi đẻ:** đưa mẹ về bể chính hoặc để trong lồng đẻ, và lấy cá con ra khi cần.
> - **Cho cá con ăn:** artemia con, bột thức ăn cho cá con, hoặc thứ…

### stocking-07 · post · plain wins (2.5 · 6.5)

**Asked:** Bể nhà em kích cỡ 60x35x40, thả neon và sóc đỏ khoảng bao nhiêu con thì được ạ?

**Judge:** Y is better. It works out the volume from the hobbyist's tank size and gives sensible numbers, about 20–25 neon and 6–8 sóc. It also covers cycling the tank, weekly water changes and temperature, and it asks which species "sóc đỏ" is. X picks the wrong fish, which leads to a false aggression warning and a cold-water temperature. Its stocking figure is also far too low. / X gives reasonable numbers based on the tank's volume and adds basic advice on cycling, water changes and adding fish gradually. It may misidentify 'sóc đỏ', but it asks the hobbyist to confirm. Y misidentifies the fish, gives a cold-water temperature range and a load figure that doesn't make sense, and recommends a bad group size for a territorial fish.

**Ours lacks:** wrong, figures, plan. **Plain lacks:** local.

**Ours** (read 2 pages):

> Nuôi chung được, nhưng cần để ý: cá chạch sóc đuôi đỏ có thể rượt đuổi cá neon xanh và hay cắn vây, nên cần bể rộng nhiều chỗ trốn. Cả hai loài đều nên nuôi đàn từ 6 con trở lên; với bể 60x35x40 cm, 6 neon và 6 chạch sóc đuôi đỏ được tính ở mức 79% tải. Theo cẩm nang, neon ưa 21–25°C còn chạch sóc ưa 15–21°C, nên cần chọn nhiệt độ nước phù hợp cho cả hai.
> 
> [Công cụ: Nuôi chung]
> Nuôi chung được, nhưng cần để ý: Cá chạch sóc đuôi đỏ có thể rượt đuổi Cá neon xanh; Cá chạch sóc đuôi đỏ hay cắn vây.
> Cá chạch sóc đuôi đỏ hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Cá chạch s…

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

**Judge:** I'd rather the hobbyist got X. It uses their actual 60×35×40 cm tank, warns about chasing and fin-nipping, and states which fish it took 'sóc đỏ' to mean. Its weak spots are that it never gives a maximum count and its fish pick is questionable. Y ignores the tank size, gets the Vietnamese fish names wrong, drifts off to shrimp and mostly asks questions back. / Y nên được chọn: Y dùng đúng kích thước bể, nói rõ mình hiểu 'sóc đỏ' là loài nào và cảnh báo chuyện rượt đuổi, cắn vây. Tuy vậy, Y chỉ đưa số con tối thiểu chứ chưa nói tối đa. X bỏ qua kích thước bể, đoán sai bể khoảng 60 lít (thực tế khoảng 84 lít) và gọi Corydoras là 'cá sóc', trong khi ở Việt Nam loài này được gọi là 'cá chuột'.

**Ours lacks:** figures, follow-up, plan. **Plain lacks:** tank-fit, asks-only, wrong.

**Ours** (read 2 pages):

> Nuôi chung được, nhưng cần để ý: cá chạch sóc đuôi đỏ có thể rượt đuổi cá neon xanh và hay cắn vây, nên cần bể rộng, nhiều chỗ trốn. Cẩm nang ghi cả hai loài nên nuôi thành đàn ít nhất 6 con; với bể 60 × 35 × 40 cm, 6 neon xanh và 6 chạch sóc đuôi đỏ lấp đầy khoảng 79% thể tích, mức vừa phải. Tôi hiểu “sóc đỏ” là cá chạch sóc đuôi đỏ; nếu bạn muốn loài khác, hãy cho tôi biết tên.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 60×35×40 cm]
> Nuôi chung được, nhưng cần để ý: Cá chạch sóc đuôi đỏ có thể rượt đuổi Cá neon xanh; Cá chạch sóc đuôi đỏ hay cắn vây.
> Cá chạch sóc đuôi đỏ hơi dữ, có thể rượt đuổi C…

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

### stocking-08 · post · plain wins (4.5 · 7)

**Asked:** Em mới chơi, ban đầu chỉ định mua cá với cây nhựa, nhưng tìm hiểu thấy mê thủy sinh quá nên mua thêm cây ráy nhỏ và chùm xương cá thay cây nhựa. Bể bé tí 4 lít mà thích đẹp em thả 7-8 con. Nuôi được 1 tuần rồi vẫn ổn, lâu dài có ổn không ạ?

**Judge:** Cả hai đều kết luận đúng là bể đang quá tải. Y cho kế hoạch đủ: bớt cá, mua bộ test, lắp lọc vi sinh, thay nước, cho ăn ít, dấu hiệu cần theo dõi, rồi lên bể 10–20 lít. Tuy vậy, mức 3–4 con neon cho 4 lít của Y vẫn quá dày, và Y nói hơi dài. X chính xác nhưng quá ngắn, gần như không có bước làm cụ thể. / X nói rõ bể 4 lít với 7-8 con là quá tải. X có các bước làm theo thứ tự (giảm cá, test nước, lọc bọt biển, thay nước, cho ăn ít) và các dấu hiệu cần theo dõi. Chỗ sai nhỏ là khuyên lắp sưởi, không hợp với khí hậu Việt Nam. Y có trích nguồn cách tính mật độ thả nhưng mỏng, gần như không bảo người mới nên làm gì ngay bây giờ.

**Ours lacks:** plan, follow-up, too-thin. **Plain lacks:** local, too-long.

**Ours** (read 4 pages):

> Một tuần ổn chưa nói lên được gì về lâu dài. Cẩm nang ước lượng 1 cm cá cho 1,5 lít nước, nhưng chỉ áp dụng cho bể đã ổn định có vi sinh và cây, và chỉ với cá nhỏ; theo đó bể 4 lít chỉ chứa khoảng 2–3 cm cá tổng cộng, nên 7–8 con gần như chắc chắn quá tải. Khi bể quá sức, ammonia có thể cứ cao mãi, và cá nổi đớp khí dù sủi vẫn chạy là dấu hiệu thiếu oxy, nên em nên tính theo cỡ cá trưởng thành và cân nhắc chuyển bớt cá sang bể lớn hơn.
> 
> [Trích: Bể cá nuôi bao nhiêu con là vừa: cách tính mật độ thả theo thể tích và loài › Mật độ thả là gì, vì sao phải tính]
> Mật độ thả là số cá bể của bạn gánh …

**Plain** (2035 characters):

> Với bể 4 lít và 7-8 con cá, **lâu dài thì chưa ổn**. Một tuần đầu chưa nói lên được gì, vì các vấn đề của bể nhỏ thường xuất hiện sau vài tuần.
> 
> **Vì sao bể nhỏ dễ có vấn đề:**
> - **Chất thải tích tụ nhanh:** Cá thải amoniac và nước nhanh bẩn. Lượng nước ít nên amoniac, nitrit tăng rất nhanh, có thể gây độc cho cá.
> - **Chu trình nitơ chưa ổn định:** Bể mới thường cần 4-6 tuần để vi khuẩn có lợi phát triển đủ. Cây thủy sinh giúp hấp thụ một phần chất thải nhưng không thay thế được vi khuẩn lọc.
> - **Nhiệt độ dao động mạnh:** Nước ít nên thay đổi theo nhiệt độ phòng rất nhanh, dễ gây sốc.
> - **Thi…

### stocking-08 · tank · ours wins (5.5 · 3)

**Asked:** Bể của tôi đang thả 7-8 con cá, lâu dài có ổn không?

**Judge:** X dùng đúng dữ liệu bể 4 lít và nói rõ 7-8 con là quá tải. Tuy vậy X không đưa bước xử lý nào: không bảo chuyển bớt cá, không nhắc bể mới chạy 1 tuần chưa chu trình xong, cũng không nói nên thay nước bao nhiêu. Y bỏ qua bể 4 lít mà nói về bể 40-60 lít, nên phần lớn chung chung và rốt cuộc chủ yếu hỏi lại người hỏi. / Y uses the 4 L figure and says clearly that 7-8 fish is overloaded. But it gives no urgent steps: test ammonia, change water often, and move or rehome some fish, which matters because the tank has only run for one week. X ignores the tank's details and gives a generic answer built around 40-60 L tanks that could mislead the hobbyist.

**Ours lacks:** plan, follow-up, too-thin, figures. **Plain lacks:** tank-fit, asks-only, too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Mình chưa xác nhận được là ổn lâu dài, vì bể của bạn đang ghi 4 lít và chưa rõ là loài cá nào. Cẩm nang tính theo quy tắc ước lượng 1 cm cá cho 1,5 lít nước, chỉ áp dụng cho cá cộng đồng nhỏ trong bể đã ổn định, nên 4 lít chỉ chứa khoảng 2-3 cm cá tổng cộng, còn 7-8 con thường là quá tải. Bạn cho mình biết tên loài và kích thước bể thật, mình sẽ tính lại theo cỡ cá lúc trưởng thành.
> 
> [Trích: Bể cá nuôi bao nhiêu con là vừa: cách tính mật độ thả theo thể tích và loài › Mật độ thả là gì, vì sao phải tính]
> Mật độ thả là số cá bể của bạn gánh được mà nước vẫn sạch. Thả quá dày thì chất thải tích …

**Plain** (1607 characters):

> Câu trả lời phụ thuộc vào **kích thước bể**, **loài cá** và **hệ lọc**. Bạn cho mình biết thêm thì mình đánh giá cụ thể hơn được.
> 
> **Vài tiêu chí để kiểm tra:**
> 
> 1. **Thể tích bể:** Quy tắc phổ biến là khoảng 1 lít nước cho 1 cm cá trưởng thành (tính cả chiều dài thân, không tính đuôi). Nhiều loài cá nhỏ như neon hay tetra thường được nuôi theo đàn, nên 7-8 con nhỏ có thể ổn trong bể 40-60 lít. Còn nếu là cá lớn như cichlid, cá vàng hay cá la hán thì 7-8 con có thể là quá đông.
> 
> 2. **Loài cá:** Cá đàn (neon, tetra, cá bảy màu) cần nhiều con cùng loài và thường thoải mái hơn khi đông. Cá lãnh …

### stocking-09 · post · plain wins (4 · 7)

**Asked:** Bể dài 80, rộng 35, cao 45 cm thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** Y is better. It names the real risk, that grown angelfish eat neons, and gives workable steps for this tank: use larger neons, add both while the angelfish are small, plant heavily, and watch for chasing. X just says no, using rules from its tool that are wrong (a group of 6 angelfish, a 100 cm tank) and offering no other options. / X is the better answer for this hobbyist. It gives a realistic yes with conditions, names the main risk (adult angelfish can eat neons) and says what to do about it: plant densely, add neons that are already full-sized, and act if the angels chase them. Y flatly says no, based on tool rules that don't fit this tank (a group of 6 angels in 126 litres would be worse, not better), and it gives no practical way forward.

**Ours lacks:** plan, wrong, too-thin. **Plain lacks:** follow-up, figures.

**Ours** (read 1 pages):

> Không nên nuôi chung: cá ông tiên (dài tới 15 cm) có thể ăn cá neon xanh (3 cm), và hơi dữ nên có thể rượt đuổi chúng. Cẩm nang cũng cho biết cá ông tiên cần bể dài từ 100 cm và nên nuôi đàn từ 6 con, nên bể 80 × 35 × 45 cm với 2 con là chưa phù hợp.
> 
> [Trích: Cá ông tiên › Nuôi chung với con gì?]
> Cá ông tiên nhìn chung là loài cichlid hiền, nhưng có thể gây gổ với đồng loại. Vì vậy tốt nhất bạn nên nuôi chúng thành nhóm nhỏ. Đây là loài hợp với bể cộng đồng, có điều cá vẫn có thể ăn các loài cá nhỏ như… [chạm để đọc tiếp]
> 
> [Công cụ: Nuôi chung]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá n…

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

**Judge:** Y trả lời đúng hơn: bể khoảng 126 L của bạn nuôi được 2 con ông tiên với 10 con neon. Y nêu rủi ro ông tiên ăn neon, cách giảm rủi ro và các thông số nước, dù không nhắc tới kích thước bể thật của bạn. X dựa vào công cụ nên khuyên không nuôi chung, lại bảo phải nuôi ông tiên theo đàn 6 con và bể phải dài 100 cm. Cả ba điều này đều quá khắt khe hoặc sai, và X không đưa ra bước nào để làm. / Their tank is about 126 L and 45 cm tall, which is enough for 2 angelfish and 10 neons with the precautions X gives: add the neons early, plant densely, and watch for chasing when the angels spawn. Y uses the tank's measurements but gets the answer wrong. It flatly says no and tells them to keep 6 or more angelfish, which is wrong.

**Ours lacks:** wrong, plan, too-thin. **Plain lacks:** tank-fit, follow-up.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên (15 cm) có thể ăn cá neon xanh (3 cm), và cá ông tiên hơi dữ nên có thể rượt đuổi cá neon. Bể 80 cm của bạn cũng chưa đủ, vì cẩm nang ghi cá ông tiên cần bể dài từ 100 cm và nên nuôi đàn từ 6 con.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 80×35×45 cm]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon xanh (3 cm).
> Cá ông tiên hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Mức đầy bể: 84% — 84% · Vừa phải: bể ổn định với lọc và thay nước thường lệ. (Cá ông tiên sống theo đàn: nên nuôi từ 6 con (đang …

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

**Judge:** Y nói đúng điều người chơi lâu năm sẽ nói: thả được, kèm điều kiện (nhiều chỗ trốn, dòng nước nhẹ) và cách theo dõi trong 1–2 tuần đầu, dù có lỗi về thứ tự thả cá và lời khuyên dùng sưởi chưa hợp với Việt Nam. X cấm hẳn, không có cơ sở thực tế, lại mỏng và có con số 36% không giải thích cách tính. / X đúng khi cho rằng betta thường sống chung được với neon trong bể 65 lít. X cũng chỉ ra điều kiện cần (nhiều cây, chỗ trốn, dòng nước nhẹ), dấu hiệu cần để ý và lúc nào phải tách betta ra, dù có vài chỗ sai nhỏ. Y thì cấm hẳn dựa trên một nhãn chung chung, không đưa ra cách nào để thử cho an toàn.

**Ours lacks:** wrong, too-thin, plan, follow-up. **Plain lacks:** too-long, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta (cá xiêm) hung dữ, theo cẩm nang thường phải nuôi riêng hoặc trong bể chỉ một loài. Bể 60x30x36 cm của bạn còn thưa (khoảng 36%), nên vấn đề nằm ở tính cách cá betta chứ không phải dung tích bể.
> 
> [Thẻ loài] Cá betta (cá xiêm) (Betta splendens): nhiệt độ 22–30 °C; pH 6–8; GH 1–15; dài 7 cm; bể từ 45 cm; tính aggressive; độ khó 3/8
> 
> [Công cụ: Nuôi chung]
> Không nên nuôi chung: Cá betta (cá xiêm) hung dữ.
> Cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.
> Mức đầy bể: 36% — 36% · Còn thưa: thả thêm được.
> 
> [Gợi ý hỏi tiếp] Bể 60x30x36 cm nuôi đượ…

**Plain** (1406 characters):

> **Có thể nuôi được**, bể 60x30x36 cm (khoảng 65 lít) đủ rộng cho 1 con betta cùng 12 con neon. Neon là cá hiền, đi đàn, ít khi gây hấn, và betta thường sống chung được với chúng. Tuy nhiên, bạn nên lưu ý mấy điểm sau:
> 
> **Điều kiện để sống chung tốt:**
> - **Nhiều chỗ ẩn nấp:** Trồng thêm cây thủy sinh như dương xỉ Java, rêu Java, trâm bầu, hoặc đặt đá, lũa. Betta cần chỗ tránh khi bị rượt đuổi.
> - **Dòng nước nhẹ:** Betta bơi chậm và không thích dòng chảy mạnh, nên chọn lọc không quá mạnh hoặc để bớt vòi phun.
> - **Nhiệt độ:** Cả hai loài đều ưa nước ấm, khoảng 24–27°C, nên thường dùng máy sưởi l…

### stocking-10 · tank · tie or split (4.5 · 4)

**Asked:** Bể của tôi thả thêm 1 con cá betta được không?

**Judge:** X uses the hobbyist's tank and answers clearly, but its flat "no" is too strict: one betta with 12 neons in about 65 L usually works. Y gets closer on the facts by saying neons can live with a betta, but it misreads the question as being about an existing betta, gives only general advice and mostly asks questions back. / Y uses the hobbyist's real tank (60×30×36 cm, 12 neon tetras) and gives a clear answer, though it is too strict and never explains the actual risks. X wrongly assumes a betta is already in the tank and mostly asks questions back.

**Ours lacks:** wrong, too-thin, plan, diagnosis, follow-up. **Plain lacks:** tank-fit, asks-only, plan, too-long.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài, theo cẩm nang. Bể 60x30x36 cm của bạn đang có 12 cá neon xanh; dù mật độ còn thưa, bạn không nên thả thêm betta vào bể này.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 60×30×36 cm]
> Không nên nuôi chung: Cá betta (cá xiêm) hung dữ.
> Cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.
> Mức đầy bể: 36% — 36% · Còn thưa: thả thêm được.
> 
> [Gợi ý hỏi tiếp] Cá neon xanh có nuôi chung được với cá nào khác không? · Bể 60x30x36 cm nuôi được bao nhiêu cá? · Cá betta nuôi riêng cần bể bao nhiêu lít?

**Plain** (1081 characters):

> **Thường thì không nên**, đặc biệt nếu bể đang có một con betta đực. Betta đực rất hung dữ với các con đực khác và sẽ đánh nhau đến khi bị thương nặng hoặc chết. Chúng cũng có thể căng thẳng và bệnh tật khi phải sống chung với cá khác.
> 
> **Một số trường hợp cụ thể:**
> 
> - **Betta đực + betta đực:** Không nên. Gần như chắc chắn sẽ đánh nhau.
> - **Betta đực + betta cái:** Chỉ có thể thử trong bể rất lớn (thường từ 80 lít trở lên), có nhiều cây thủy sinh và chỗ ẩn nấp, và phải quan sát liên tục. Con cái có thể bị đực rượt đuổi hoặc cắn. Nếu thấy cá cái bị thương hoặc stress, phải tách ra ngay.
> - **B…

