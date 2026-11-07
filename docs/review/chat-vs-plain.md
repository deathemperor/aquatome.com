# The chat against plain Claude, on hard problems

2026-11-07, `packages/engine/scripts/chat-vs-plain.ts`. 48 questions (all of them) from public Vietnamese hobby forums, reworded with no names (`packages/engine/scripts/hard-questions.vi.json`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and limits at commit `6a5055fb8`, claude-haiku-5-5, over https://aquatome.com's handbook. Plain: claude-haiku-5-5, the same effort, no system prompt, no tools, no handbook. Judge: claude-opus-5-5 through the Claude CLI, rubric version 2 (`chat-vs-plain-lib.ts`).

- **post:** both answer the whole forum post. **tank:** both get a short question. The eval saves the post's tank for the reader (size, fish, plants, substrate, age; the light, CO₂ and fertiliser as the tank's notes), and ours sees only what the chat's code reads of a saved tank; plain Claude sees only the question. The judge is told everything the post said about the tank.
- **Blind, as far as it goes:** the judge isn't told which answer is ours, and both lose the site's name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.
- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.
- **Failed:** when one side failed (ours: the limits ran out, a call timed out) and the other answered, that reader got an error: the other side wins it on every count, with no score. A failed answer is kept in the cache, so a rerun is the same run; `--retry-failed` asks again.
- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).
- **Cost** per question, at list price: ours $0.0039, plain $0.0012. The judge runs on the owner's Claude accounts.

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post | 8 / 38 / 2 of 48, ours failed 2 | 4.7 · 6.7 | 8–31 | 6–35 | 5–38 | 8–18 | 8–24 | 44/46 | 3 / 43 / 2 |
| tank | 23 / 21 / 4 of 48, ours failed 1 | 5.3 · 5.1 | 18–18 | 28–3 | 20–21 | 16–17 | 15–8 | 43/47 | 12 / 35 / 1 |

## Other judges

Other providers' models, through Infinitus on the owner's Cursor plan, read the same pairs in one blind packet: each pair once, ours on a side its hash picks, with the judge's rubric. One order each, so a judge's lean to one side isn't cancelled out as above. "Same as claude-opus-5-5": the pairs where its pick matches the headline's (a split there counts as a tie).

| | Ours / plain / tie | Score: ours · plain | correct | fits | actionable | grounded | local | Same as claude-opus-5-5 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gemini-4-argon · post | 6 / 9 / 0 of 15 | 6.1 · 6.9 | 6–7 | 7–8 | 4–10 | 7–7 | 8–6 | 14/15 |
| gemini-4-argon · tank | 4 / 11 / 0 of 15 | 6.1 · 7.1 | 4–10 | 7–5 | 4–11 | 3–8 | 4–6 | 10/15 |
| gpt-5.6-sol · post | 8 / 7 / 0 of 15 | 6.1 · 5.5 | 11–4 | 7–7 | 6–8 | 9–2 | 6–5 | 12/15 |
| gpt-5.6-sol · tank | 7 / 7 / 1 of 15 | 5.7 · 5.7 | 6–7 | 10–2 | 6–7 | 5–5 | 7–1 | 8/15 |
| grok-4.7 · post | 7 / 8 / 0 of 15 | 6.4 · 6.6 | 7–7 | 3–7 | 4–7 | 8–2 | 5–3 | 13/15 |
| grok-4.7 · tank | 8 / 6 / 1 of 15 | 6.1 · 5.7 | 7–6 | 7–2 | 6–5 | 9–0 | 3–1 | 11/15 |

## By problem

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post · algae | 2 / 9 / 1 of 12 | 5.1 · 6.6 | 2–8 | 2–8 | 2–9 | 3–3 | 3–5 | 11/12 | 0 / 12 / 0 |
| post · setup | 1 / 8 / 0 of 9, ours failed 1 | 3.4 · 7.0 | 1–6 | 0–8 | 0–9 | 1–5 | 0–5 | 8/8 | 0 / 8 / 1 |
| post · cycling | 1 / 6 / 1 of 8 | 5.0 · 6.8 | 1–4 | 1–6 | 1–6 | 1–2 | 2–3 | 7/8 | 0 / 8 / 0 |
| post · sick | 1 / 8 / 0 of 9, ours failed 1 | 4.9 · 7.1 | 1–7 | 0–7 | 1–7 | 0–5 | 2–6 | 8/8 | 1 / 7 / 1 |
| post · stocking | 3 / 7 / 0 of 10 | 4.9 · 6.4 | 3–6 | 3–6 | 1–7 | 3–3 | 1–5 | 10/10 | 2 / 8 / 0 |
| tank · algae | 7 / 2 / 3 of 12 | 6.2 · 4.9 | 7–2 | 8–0 | 6–2 | 7–1 | 5–0 | 9/12 | 6 / 6 / 0 |
| tank · setup | 0 / 9 / 0 of 9, ours failed 1 | 3.6 · 5.8 | 0–6 | 2–3 | 0–9 | 2–6 | 1–4 | 8/8 | 0 / 8 / 1 |
| tank · cycling | 2 / 5 / 1 of 8 | 4.8 · 5.6 | 2–5 | 2–0 | 1–5 | 1–4 | 1–2 | 7/8 | 0 / 8 / 0 |
| tank · sick | 7 / 2 / 0 of 9 | 6.2 · 5.1 | 4–2 | 7–0 | 6–2 | 3–1 | 4–0 | 9/9 | 2 / 7 / 0 |
| tank · stocking | 7 / 3 / 0 of 10 | 5.3 · 4.5 | 5–3 | 9–0 | 7–3 | 3–5 | 4–2 | 10/10 | 4 / 6 / 0 |

## What each lacks, as the judge tagged it

| | Ours | Plain |
| --- | --- | --- |
| post | tank-fit 34, figures 27, too-thin 22, diagnosis 18, plan 16, local 10, wrong 8, follow-up 6, off-topic 2, too-long 1 | too-long 30, local 11, follow-up 10, wrong 9, tank-fit 9, diagnosis 9, figures 3, asks-only 1, unsafe 1, plan 1 |
| tank | figures 32, tank-fit 31, diagnosis 26, follow-up 13, plan 12, too-thin 11, wrong 4, asks-only 2, local 2 | tank-fit 47, too-long 25, diagnosis 16, asks-only 13, local 10, follow-up 7, wrong 6, plan 3, figures 3, unsafe 1 |

Tags: plan, diagnosis, tank-fit, figures, follow-up, local, too-thin, too-long, asks-only, wrong, unsafe, off-topic.

## Errors the judge found

- ours, algae-01 post: Says the hobbyist's lighting setup is fine based only on the 7 hours. It ignores the strong Flat One hung 20 cm above the water in a 2-week-old tank, and it never tells them to stop the algaecide.
- ours, algae-01 post: "7 tiếng đèn... không phải là sai, vì cẩm nang khuyên khoảng 8 tiếng": bỏ qua việc đèn Flat One treo 20 cm, để chế độ mạnh, trên bể mới 2 tuần. Khuyên giữ 7–8 tiếng là ngược với việc cần giảm sáng.
- ours, algae-01 post: Bảo tạm ngừng hết phân khi nmc đang trắng lá, có thể là do thiếu dinh dưỡng, mà không đề nghị test để biết thiếu gì.
- plain, algae-01 post: "Thả ốc Nerite… để ăn rêu": Nerite snails barely eat hair algae.
- plain, algae-01 post: Blames the whitening NMC leaves mostly on light burn, when lack of CO₂ or nutrients is the more likely cause.
- plain, algae-01 post: Splitting the light into 2 periods to stop algae isn't well supported.
- plain, algae-01 post: "thả ốc Nerite... để ăn rêu" trị rêu tóc: ốc Nerite gần như không ăn rêu tóc, chỉ cạo rêu bám dạng màng.
- ours, algae-01 tank: "tổng khoảng 8 đến 10 tiếng": the user already runs 7h, so this could push them to longer light while they have algae
- ours, algae-01 tank: "mỗi đợt không quá 4 tiếng": splitting the photoperiod into short blocks is not standard advice and has no clear basis
- ours, algae-01 tank: "khoảng 90% ca rêu tóc là do thiếu CO2": an invented figure
- ours, algae-01 tank: "thay 30 đến 50% nước mỗi ba ngày": less often than the user already changes water, so it does not help
- ours, algae-01 tank: "tổng 8 đến 10 tiếng": họ đang bật 7 tiếng, theo lời khuyên này họ có thể tăng giờ đèn khi đang bị rêu tóc.
- ours, algae-01 tank: "khoảng 90% ca rêu tóc là do thiếu CO2": con số không có cơ sở.
- ours, algae-01 tank: "khi hết rêu chúng sẽ ăn cây và rễ": nói quá. Tép Amano hiếm khi phá cây khỏe.
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": in Vietnam "cá rìu" means hatchetfish, not the Siamese algae eater
- plain, algae-01 tank: "Thay 30–50% nước mỗi tuần": too little for a 2-week-old tank, and less than the user already does
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": cá rìu là cá hatchet. Ở Việt Nam, SAE thường được gọi là cá bút chì.
- plain, algae-01 tank: Gợi ý nhỏ H₂O₂ mà không nêu liều. Cũng không cảnh báo chuyện họ đang dùng sẵn thuốc khử rêu.
- ours, algae-02 post: Assumes CO₂ is being injected ('kiểm tra CO2 có ổn định') when an anubias and moss tank is most likely low-tech, and never names too much light as a likely cause
- ours, algae-02 post: '40 lumen cho mỗi lít… 3.360 lumen' is a high-tech target, too strong for anubias and moss, and points toward more light
- ours, algae-02 post: Coi việc ngưng phân một tuần là nguyên nhân chính gây BBA, trong khi với ráy và rêu chậm lớn thì đèn quá mạnh và CO₂ dao động mới là lý do hay gặp hơn
- ours, algae-02 post: "Giữ đèn khoảng 8 tiếng, không quá 10 tiếng": 10 tiếng là quá dài với hồ đang bị BBA
- ours, algae-02 post: "40 lumen cho mỗi lít": quy tắc lumen theo lít đã lỗi thời và không giúp chọn được đèn cụ thể
- plain, algae-02 post: 'rau ngổ' as a floating plant: rau ngổ (Limnophila) is a stem plant, not a floater
- plain, algae-02 post: Suggests the A361, a light sized for 36 cm tanks, for a 70 cm tank
- plain, algae-02 post: Flourish Excel can harm some plants, and the answer only warns about fish and shrimp
- plain, algae-02 post: "thêm cây nổi như... rau ngổ": rau ngổ là cây thân đứng, không phải cây nổi để che sáng
- plain, algae-02 post: "Chihiros WRGB II Slim" được gợi ý như lựa chọn nhẹ hơn, nhưng công suất và độ mạnh của nó tương đương hoặc cao hơn A601 Plus, nên không giải quyết chuyện đèn quá mạnh
- ours, algae-02 tank: "chấm xử lý chỗ mới có rêu" with H2O2/carbon nước: there is no warning that this tank's rêu (moss) can be burned by these, so the spot treatment needs care around it
- ours, algae-02 tank: Says to dab liquid carbon or 3% hydrogen peroxide on the algae but doesn't warn that the moss in this tank is sensitive to both. It also says 'hút nền' when the tank has no substrate.
- plain, algae-02 tank: "cá Siamese (cá cày Xiêm)": this is not the usual Vietnamese name. SAE is usually called cá bút chì
- plain, algae-02 tank: Asks which light they use even though it is known to be a Chihiros A601 Plus
- plain, algae-02 tank: "cá Siamese (cá cày Xiêm)": 'cá cày Xiêm' isn't a name Vietnamese hobbyists use. The fish is usually sold as cá bút chì or SAE.
- plain, algae-02 tank: Asks for the light type even though the tank already has a Chihiros A601 Plus on record, and its tips (hút đáy) ignore that the tank has no substrate.
- ours, algae-03 post: Không nhắc việc thay bông lọc mới làm mất vi sinh trong bể đang chạy vi sinh
- ours, algae-03 post: "Cẩm nang cho phép che tối tối đa 7 ngày": viện dẫn cẩm nang nghe như máy, không giải thích vì sao lại là 7 ngày
- ours, algae-03 post: Đoạn trích cẩm nang dưới câu trả lời ghi tuần đầu thay 30% nước mỗi ngày, ngược với bước 4 là chờ nước trong rồi mới thay. Đây là điểm mâu thuẫn nhỏ.
- ours, algae-03 post: Che tối 3–5 ngày khá nặng với cây trải nền vừa trồng. Y có nói cây sẽ chịu khổ nhưng không cân nhắc thêm.
- plain, algae-03 post: "nếu đây là đèn UV... bật đủ 2 bóng và chạy liên tục": Odyssea dual là đèn chiếu sáng thủy sinh, không phải đèn UV, nên lời khuyên này sai hướng
- plain, algae-03 post: "Ngừng thay nước hằng ngày... chỉ 10-15%": trái với cách làm chuẩn cho bể mới set dùng phân nền, vốn cần thay nhiều nước trong tuần đầu
- plain, algae-03 post: Hỏi lại "trân châu ngọc trai là loài nào" cho thấy không biết đây là một loại cây thủy sinh phổ biến
- plain, algae-03 post: Đoán đèn Odyssea là đèn UV và khuyên bật đủ 2 bóng liên tục. Thực ra Odyssea dual là đèn chiếu sáng cho hồ thủy sinh, nên làm theo sẽ khiến tảo bùng thêm.
- plain, algae-03 post: Khuyên ngừng thay nước hằng ngày, trong khi hồ mới set với phân nền đang nhả dinh dưỡng thì thay nước nhiều là cách chuẩn.
- plain, algae-03 post: Không biết trân châu ngọc trai là cây trải nền nên hỏi lại, và bàn chuyện cho cá ăn như thể đây là hồ nuôi cá.
- ours, algae-03 tank: "chuyển sang bể tạm trước khi che tối": cá và tép chịu được vài ngày tối, chỉ cần sủi khí. Bắt chúng ra chỉ gây stress thêm.
- ours, algae-03 tank: "che tối tối đa 7 ngày": bể có trân châu ngọc trai mới trồng, che tối gần một tuần dễ làm cây yếu và rụng lá; 3–4 ngày an toàn hơn.
- ours, algae-03 tank: Khuyên bật đèn 6–8 giờ/ngày, trong khi người hỏi đã giảm còn 4 giờ. Câu này vô tình bảo họ tăng đèn lên.
- ours, algae-03 tank: "chuyển sang bể tạm trước khi che tối": fish don't need moving for a blackout of a few days, so this step only stresses them.
- ours, algae-03 tank: "sau này chỉ bật đèn khoảng 6 đến 8 giờ": they already run 4h, so this would raise the light.
- ours, algae-03 tank: Allows up to a 7-day blackout and never warns that this can hurt the trân châu carpet.
- plain, algae-03 tank: "thay quá nhiều nước có thể làm chậm quá trình này": vi sinh sống chủ yếu trên vật liệu lọc và nền, không ở trong nước, nên lý do này chỉ đúng một phần.
- plain, algae-03 tank: Khuyên bật đèn 6–8 tiếng/ngày, trong khi người hỏi đã giảm còn 4 tiếng.
- plain, algae-03 tank: "Sau khi hết xanh, chỉ bật 6-8 tiếng/ngày": they already run only 4h, so this tells them to raise the light while the bloom can still return.
- plain, algae-03 tank: "rau muống nước": an odd choice of fast-growing plant for a planted tank with trân châu ngọc trai.
- ours, algae-04 post: Says the lights are likely too strong ('khả năng cao là có'), but two budget Aquablue tubes over a 40cm-deep tank give only moderate light.
- ours, algae-04 post: 'Hạ đèn xuống khoảng 50%' assumes the lights can be dimmed, which these usually can't. It also cites the 5-hour schedule only as 'một người chơi trong video', with no reason given.
- ours, algae-04 post: Doesn't question the 30% daily water change, which keeps adding silicate from the tap. It just tells them to keep going.
- ours, algae-04 post: Mentions 'Handbook ghi rõ' and 'cẩm nang' as if the reader knows these sources. That is confusing meta wording.
- ours, algae-04 post: Trích nguồn mơ hồ ("một người chơi trong video", "Handbook") cho con số giảm đèn 50% và bật 5 tiếng, nên con số này thiếu căn cứ rõ ràng.
- plain, algae-04 post: 'Nhiệt độ thấp' as a cause doesn't apply in Vietnam's heat.
- plain, algae-04 post: Cutting water changes to 30% once a week right away could let ammonia build up if the tank uses aquasoil. The every-3–4-days option is safer.
- plain, algae-04 post: 'Nước máy ở Việt Nam thường có hàm lượng silicate khá cao' states a general claim with no source.
- plain, algae-04 post: "Thay nước 30% mỗi ngày là hơi nhiều... hệ vi sinh chưa kịp ổn định": vi sinh sống chủ yếu trong lọc và trên bề mặt, không phải trong nước. Thay nước nhiều trong tuần đầu là cách làm chuẩn cho hồ mới, nhất là khi dùng phân nền. Khuyên giảm xuống mỗi tuần một lần là quá sớm.
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển hơn": yếu tố này không đáng kể, và hồ ở nhiệt độ Việt Nam thì khó mà bị lạnh.
- ours, algae-04 tank: "Giảm đèn xuống còn 2–3 tiếng mỗi ngày": far too little light for a Dutch-style tank with CO₂. The stem plants will starve and melt, and that gives algae more room.
- ours, algae-04 tank: "cá bống vàng" to eat diatoms is an unclear, doubtful pick for scraping brown algae.
- ours, algae-04 tank: "Giảm đèn xuống còn 2–3 tiếng mỗi ngày": this is too drastic for a Dutch-style tank with CO₂ and fertiliser. Stem plants would weaken, so 5–6 hours would be more reasonable.
- ours, algae-04 tank: "đèn bật lâu làm tảo lan nhanh": this assumes a long photoperiod without knowing their lighting hours.
- plain, algae-04 tank: "dùng bộ lọc than hoạt tính... khử silicat": activated carbon does not remove silicate.
- plain, algae-04 tank: Suggests cá tỳ bà (pleco), which grows too big for a 60cm Dutch-style tank and can damage plants.
- plain, algae-04 tank: It asks for the tank size, plants and light hours even though the app already holds them.
- plain, algae-04 tank: "bộ lọc than hoạt tính... khử silicat": activated carbon doesn't remove silicate. Only silicate-removing resin does that.
- plain, algae-04 tank: "Ốc Trochus": Trochus is a saltwater snail and doesn't belong in a freshwater planted tank.
- plain, algae-04 tank: "cá tỳ bà": plecos grow large and make a lot of waste. They're a poor choice for a 60cm planted tank.
- plain, algae-04 tank: "Thay 20-30% mỗi tuần": this ignores that they already change 30% every day. It also asks for tank size, plants and lighting, which the app already holds.
- ours, algae-05 post: "giảm còn 2–3 tiếng mỗi ngày cho đến khi tảo nâu hết": too harsh for a Dutch tank where the plants are growing well. It would starve the plants for weeks, when 6–7 hours is enough.
- ours, algae-05 post: Erythromycin as the next BGA step in a 1-month tank: it can harm the still-young bacteria colony. A blackout and better flow should come first.
- ours, algae-05 post: "giảm còn 2–3 tiếng mỗi ngày cho đến khi tảo nâu hết": this is far too little light. A month-old Dutch tank packed with plants will weaken and melt. The usual advice is about 6 hours.
- ours, algae-05 post: It credits the handbook as saying how bad brown algae gets depends mainly on how long the light is on. That oversimplifies things, since brown algae in a new tank mostly comes from silicate and an unsettled tank.
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": living carpet plants take up nutrients rather than add them. The claim is only weakly true if the cause is overfeeding or root tabs.
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": there's no clear basis for this, and it reads the plant name too literally
- plain, algae-05 post: "Cho ăn quá nhiều là nguyên nhân phổ biến nhất": the tank only has Nerita snails, so assuming overfeeding doesn't fit
- ours, algae-05 tank: 'cá có thể cắn nhau' khi tắt đèn: bể này chỉ có ốc nerita, không có cá, nên lời cảnh báo này không áp dụng
- ours, algae-05 tank: Không nói gì về việc ốc nerita nằm im không bò, dù hobbyist đã ghi chú dấu hiệu này
- ours, algae-05 tank: 'cá có thể cắn nhau': the tank has no fish, only nerita snails
- ours, algae-05 tank: Doesn't address the nerita lying still, which could point to stress or a dying snail
- ours, algae-05 tank: 'APT 1' is a foreign product name with no reason given, and it may be hard to find in Vietnam
- plain, algae-05 tank: 'cá chùy (cá ăn tảo Siamese với tảo râu đen)': nhầm tên, Siamese algae eater là tên con cá chứ không phải một loại tảo
- plain, algae-05 tank: Tảo nâu xuất hiện 'khi ánh sáng yếu': nói vậy là quá đơn giản. Ở bể mới, tảo cát chủ yếu do silicat và hệ vi sinh chưa ổn định
- plain, algae-05 tank: Khuyên dùng erythromycin và H₂O₂ cho một bể mới 4 tuần mà không nói liều, dễ làm hại hệ vi sinh còn non
- plain, algae-05 tank: Khuyên thả ốc nerite để ăn tảo trong khi bể đã có sẵn ốc nerite
- plain, algae-05 tank: 'cá chùy (cá ăn tảo Siamese...)': this isn't the usual Vietnamese name for the Siamese algae eater, and 'cá tỳ hưu' for Otocinclus is just as odd, so the hobbyist can't ask for these fish at a shop
- plain, algae-05 tank: 'Có thể dùng H₂O₂ nhỏ giọt': gives no dose, and in a 4-week-old tank with a snail that's already lying still, that's risky
- plain, algae-05 tank: Suggests adding nerite snails, but the tank already has them, and asks for the light hours and plants even though the app already has them
- ours, algae-06 post: "Quan sát tép có tụ lại ở mặt nước... đó là dấu hiệu thiếu oxy" — ngạt ở đây là do dư CO2, không phải chỉ thiếu oxy; đúng một nửa và nghe lẫn lộn
- ours, algae-06 post: Bảo người hỏi đọc bài trong cẩm nang và hỏi người bán, thay vì tự trả lời
- plain, algae-06 post: 'Tắt CO2 cùng lúc tắt đèn... rất quan trọng' – thường nên tắt CO2 sớm hơn khoảng 1 giờ trước khi tắt đèn; nói vậy cũng không sai hẳn nhưng chưa tối ưu
- plain, algae-06 post: 'rêu sợi, rêu sừng hươu và rêu lông tơ thường kém bền khi bị loại bỏ thủ công' – câu này lủng củng, nghĩa không rõ
- plain, algae-06 post: Không nhắc rằng khí CO2 tích lại trong thùng lọc 702B (cần xả khí trong lọc) mới là nguyên nhân gây tiếng lọc xọc
- plain, algae-06 post: "Rêu lông tơ và rêu sừng hươu thường xuất hiện ở chỗ dòng yếu" — rêu sừng hươu (BBA) thường bám ở chỗ dòng mạnh, gần đầu out, nơi CO2 dao động
- plain, algae-06 post: "bơm CO2 vào lọc phụ 603 (... dễ gây mất mồi hơn nên cần cẩn thận)" — đề xuất mâu thuẫn, chỉ chuyển vấn đề khí lọt vào bơm sang lọc phụ
- plain, algae-06 post: Gọi người hỏi là "bạn" trong khi họ tự xưng "em", nghe hơi lạ với cách nói của dân chơi thủy sinh
- ours, algae-06 tank: "khoảng 90% trường hợp rêu tóc là do thiếu CO2": con số trông bịa, chỉ dẫn lại từ cẩm nang mà không nêu cơ sở.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3": khoảng 30 ppm CO2 thì pH phải giảm khoảng 1 đơn vị. Giảm 0,2–0,3 nghĩa là CO2 vẫn rất thiếu.
- plain, algae-06 tank: "khuấy nước tốt để CO2 hòa tan và không thoát ra ngoài": nói ngược nhau. Khuấy mặt nước mạnh chính là làm CO2 thoát ra.
- plain, algae-06 tank: "cá tỳ bà (ăn rêu lông tơ và rêu tóc)": cá tỳ bà hầu như không ăn rêu tóc, lại lớn quá to so với bể 60 cm có tép.
- plain, algae-06 tank: Hỏi lại kích thước bể và tình trạng CO2, trong khi app đã có sẵn các thông tin đó.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3": sai mục tiêu. Để đạt khoảng 30 ppm CO₂, pH thường phải giảm khoảng 1 đơn vị.
- plain, algae-06 tank: "cá tỳ bà (ăn rêu lông tơ và rêu tóc)": cá tỳ bà không ăn rêu tóc hiệu quả, lại lớn quá cỡ với bể 60 cm.
- plain, algae-06 tank: "khuấy nước tốt để CO₂ hòa tan và không thoát ra ngoài": câu tự mâu thuẫn, vì khuấy mặt nước mạnh làm CO₂ thoát ra nhiều hơn.
- ours, algae-07 post: "Giảm thời gian chiếu sáng về khoảng 8 đến 10 giờ": the hobbyist already runs 9h, so this changes nothing for a tank with algae and deformed tips
- ours, algae-07 post: Leaves the substrate question unanswered and only points to another guide section
- ours, algae-07 post: "Giảm thời gian chiếu sáng về khoảng 8 đến 10 giờ" (cut the light to about 8–10 hours): the tank already runs 9 hours and has an algae outbreak, so this range does not actually reduce the light.
- plain, algae-07 post: "Fluval Stratum ... không có dinh dưỡng": Stratum is a light active soil, not an inert substrate like Flourite or gravel
- plain, algae-07 post: Blames nutrient washout as the main cause. Big water changes on a nutrient-rich mixed substrate are standard practice to stop ammonia leaching, and unstable or excessive CO2 and Ca/B problems are equally likely causes of twisted white tips
- plain, algae-07 post: Calls Fluval Stratum an inert substrate with no nutrients. It is a volcanic soil with some nutrients that lowers pH, so it is not inert like Flourite or gravel.
- plain, algae-07 post: The twisted white tips are put down only to nutrients being washed out. It never mentions calcium or boron shortage (soft water plus heavy water changes), which is a common cause of twisted, deformed tips.
- ours, algae-07 tank: "nitrate có về 0 hay không": in a planted tank, nitrate dropping to 0 is not a goal. Starving the plants of nitrate causes its own deficiencies and can bring on algae.
- ours, algae-07 tank: "nitrate có về 0 hay không": để nitrat về 0 trong bể cây có CO₂ sẽ làm cây thiếu đạm và dễ lên rêu, không phải mục tiêu nên nhắm tới.
- ours, algae-07 tank: Không nhắc đến việc thay hơn 100% nước mỗi ngày trong 2 tuần đầu và quạt làm thất thoát CO₂, hai yếu tố có thể gây xoắn ngọn và trắng ngọn.
- plain, algae-07 tank: "Ốc táo: ăn rêu xanh": apple snails eat soft stem plants, so they are a bad pick for a tank of cây Hà Lan.
- plain, algae-07 tank: "Cá chuột... ăn rêu đáy": corydoras do not eat algae.
- plain, algae-07 tank: It blames white, twisted tips mainly on missing iron and says to add chelated iron. Low iron usually shows as yellow new leaves. White, twisted tips more often point to unstable CO₂ or low Ca/B. With a nutrient-rich substrate and algae already present, adding iron can make the algae worse.
- plain, algae-07 tank: "bèo tây" (water hyacinth) is too big for an aquarium.
- plain, algae-07 tank: "Ốc nerite, ốc táo: ăn rêu": ốc táo (ốc bươu vàng/apple snail) ăn cả cây thủy sinh, không nên thả vào bể cây Hà Lan.
- plain, algae-07 tank: Hỏi lại kích thước, đèn, CO₂, loại bể dù những thông tin này đã có trong app, và còn hỏi có phải ao ngoài trời không, nên lời khuyên chung chung, không khớp với bể này.
- plain, algae-07 tank: "Cá tỳ bà" ăn rêu: cá tỳ bà lớn nhanh, thải nhiều và có thể phá cây, không hợp bể thủy sinh.
- plain, algae-08 post: 'Bể xi măng non thường làm pH tăng' – bể đúc ở đây là bể kính đúc (kính uốn liền khối), không phải bể xi măng, nên lý do này không áp dụng
- plain, algae-08 post: Đếm sai đàn cá hiện tại: tính cả 9 mún lúc đầu cộng 5 mún đỏ thành 26 con
- plain, algae-08 post: Gợi ý bèo tây cho bể 50cm là không thực tế, còn rêu java mọc chậm nên không phải cây mọc nhanh
- plain, algae-08 post: 'Cho ăn 2 lần/ngày là ổn' rồi sau đó lại khuyên cho ăn 1 lần, hai lời khuyên mâu thuẫn
- plain, algae-08 post: "Bể xi măng non thường làm pH tăng": in Vietnam "bể đúc" means a seamless moulded glass tank, not a cement tank, so this cause and the pH check don't apply.
- plain, algae-08 post: Fish count "26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ)" counts the original 9 mún again. The tank now holds about 24 fish.
- plain, algae-08 post: Suggests "bèo tây" (water hyacinth) for a 50cm tank, which is impractical at that size.
- plain, algae-08 post: Asks for the tank volume and how long it has run, though the user already said 50cm and a little over 3 weeks.
- ours, algae-08 tank: "8–12 giờ mỗi ngày": mức trên quá rộng cho bể ít cây, không CO₂ đang bị nước xanh; nên cắt hẳn đèn màu buổi tối và giữ quanh 6–8 giờ
- ours, algae-08 tank: "8–12 giờ mỗi ngày, kể cả đèn màu": mức 12 giờ quá dài với bể ít cây, không CO₂ đang bị tảo. Hiện bể bật khoảng 10 giờ đèn trắng, tức đã nằm trong khoảng này, nên lời khuyên chưa đủ để giảm đèn. Nên giảm còn khoảng 6–8 giờ.
- plain, algae-08 tank: "Đừng thay nước quá ít": người nuôi đang thay gần 100%/tuần, nên lời khuyên này ngược với vấn đề thật của họ
- plain, algae-08 tank: Gợi ý nuôi ốc nhồi, cory, otocinclus trong bể đúc không nền, đã có 24 con cá: không hợp với bể này
- plain, algae-08 tank: Hỏi lại số cá, cây, giờ đèn trong khi app đã có sẵn các thông tin này
- plain, algae-08 tank: "để nước lắng" để giảm nitrate/phosphate: để lắng nước không làm giảm nitrate hay phosphate.
- plain, algae-08 tank: Gợi ý ốc nhồi, ốc táo, cory, otocinclus: ốc táo ăn cây, cory không hợp với bể không có nền, còn otocinclus khó sống trong bể mới 8 tuần.
- plain, algae-08 tank: "Đừng thay nước quá ít: 20–30%": không đúng với hobbyist đang thay gần 100% mỗi tuần, nên vấn đề thật bị bỏ qua.
- ours, algae-09 post: "Rút ngắn thời gian bật đèn": the tank is outdoors in sunlight with no light mentioned, so this step doesn't apply.
- ours, algae-09 post: "Dời bể ra chỗ không có nắng": a large concrete tank can't realistically be moved. Shading it is the practical fix.
- ours, algae-09 post: "Dời bể ra chỗ không có nắng": bể đúc to là lý do phải để ngoài ban công, nên không dời được
- ours, algae-09 post: "Rút ngắn thời gian bật đèn": bể ngoài trời không có đèn nên bước này vô nghĩa
- ours, algae-09 post: "chuyển cá sang bể tạm" trong lúc che tối 7 ngày: khó làm với bể đúc lớn, trong khi che kín bể lại làm oxy tụt thêm
- ours, algae-09 tank: "chỉ bật đèn khoảng 6–8 giờ mỗi ngày" – bể dùng nắng tự nhiên ngoài ban công, không có đèn để bật; lời khuyên này không hợp với bể của họ.
- ours, algae-09 tank: Says 'chỉ bật đèn khoảng 6–8 giờ mỗi ngày', but the tank gets natural sun and has no lamp, so the step barely applies; shading the tank is the real fix.
- plain, algae-09 tank: "Tảo nở ban đêm làm hụt oxy" – sai cơ chế: tảo không nở về đêm; ban đêm tảo hô hấp, tiêu thụ oxy, nên oxy tụt.
- plain, algae-09 tank: Đổ nguyên nhân chính cho chu trình nitơ hoặc rửa lọc sai, trong khi bể không cây phơi nắng trực tiếp thì nắng cộng dư dinh dưỡng mới là nguyên nhân rõ nhất.
- plain, algae-09 tank: Hỏi lại các thông tin như dung tích, nguồn sáng, loại lọc, dù app đã có; lại nói "gần cửa sổ" trong khi bể đặt ngoài ban công.
- plain, algae-09 tank: Gives the main cause as a broken nitrogen cycle from over-cleaning the filter. That ignores the obvious cause: a bare tank with no plants sitting in direct balcony sun.
- plain, algae-09 tank: Says 'tảo bùng lên khi hệ vi sinh tái lập'. Green water is not caused by bacteria re-establishing, so the explanation is speculative.
- ours, algae-10 post: Assumes the tank is new ('bể mới set 3-4 tuần') with no basis, and never deals with the substrate dust sticking to the algae (no siphoning or flow advice).
- ours, algae-10 post: Cho rằng bể mới set và khuyên chờ rêu tự hết, trong khi người hỏi không nói bể mới và mô tả rêu dạng sợi, không giống hẳn tảo silic
- plain, algae-10 post: 'Ốc nerite (ốc núi, ốc táo)': ốc táo is the apple snail, not a nerite.
- plain, algae-10 post: 'rêu hornwort': hornwort is rong đuôi chồn, a stem plant, not a moss. Listing 'rau muống' as an aquarium plant is odd.
- plain, algae-10 post: 'Cá nhớt Siamese (cá chét đuôi đỏ)': these local names are wrong. SAE also eats diatoms poorly, and the aggression warning really belongs to the Chinese algae eater.
- plain, algae-10 post: Blames light and CO2 generically, without pointing to diatoms or silicate as the likely cause.
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo là apple snail, không phải nerite; gọi sai tên dễ làm người đọc mua nhầm
- plain, algae-10 post: "rêu hornwort": hornwort là cây rong đuôi chồn, không phải rêu
- plain, algae-10 post: "rau muống" được gợi ý như cây thủy sinh hút dinh dưỡng, không phải lựa chọn thực tế trong bể cây
- plain, algae-10 post: "cá chét đuôi đỏ" không phải tên thường dùng ở Việt Nam cho Siamese algae eater
- ours, algae-10 tank: Recommends handing leaf algae to 'cá, tép, ốc' even though the hobbyist just said shrimp get eaten.
- ours, algae-10 tank: 'Cẩm nang không nói rõ loài cá nào sẽ ăn tép' — the fish is an angelfish, a known shrimp predator, and the user already knows the shrimp get eaten, so 'theo dõi tép có bị ăn không' is useless.
- ours, algae-10 tank: Assumes it is new-tank diatoms even though the user wrote 'rêu sợi' (thread algae), with little hedging about this.
- ours, algae-10 tank: It says the fish eating the shrimp is still unknown, but the hobbyist already said the thần tiên eat them.
- ours, algae-10 tank: It is too sure the "rêu sợi" is diatom, when brown thread algae is not always the dusty diatom film.
- plain, algae-10 tank: 'Cá tỳ bà/cá Otocinclus' lumps the pleco (tỳ bà) together with the otto as if they were one fish.
- plain, algae-10 tank: Suggests H₂O₂ spot-treatment at 'liều thấp' with no actual dose given.
- plain, algae-10 tank: Asks what fish the user keeps, though the tank is known to hold angelfish, and never points out directly that angelfish are cichlids that eat shrimp.
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus" treats otto as the same fish as a pleco (tỳ bà), which is a different, larger fish.
- plain, algae-10 tank: H₂O₂ advice gives no dose or concentration, only "liều thấp".
- plain, algae-11 post: 'chọn chất khử ghi rõ khử chloramine, ví dụ sản phẩm có chứa sodium thiosulfate': thiosulfate alone breaks chloramine but leaves the ammonia, so it isn't a good example of a chloramine remover
- plain, algae-11 post: "sản phẩm có chứa sodium thiosulfate" được nêu như dấu hiệu khử được cloramin: thiosulfate đơn thuần cắt được liên kết cloramin nhưng còn để lại amoniac, nên phải dùng loại có thêm chất khóa amoniac
- ours, algae-11 tank: Leaves out dechlorinating tap water (khử clo), even though this tank uses tap water. Untreated chlorine is a likely contributor to fish deaths in Vietnam.
- ours, algae-11 tank: "thay ít nhất 20% nước mỗi tuần" is a routine maintenance figure. It is too weak for an emergency with green water and dying fish, and the answer gives no emergency % for the changes.
- ours, algae-11 tank: "Sau một tuần, amoniac phải về 0 thì mới thả thêm cá": một tuần là quá ngắn, chạy vi sinh thường mất 3–6 tuần, nên con số này dễ khiến họ thả cá quá sớm.
- ours, setup-01 post: Bỏ hẳn các câu về cho ăn, sưởi và lọc; nói thẳng là chưa trả lời được, trong khi các câu này có câu trả lời phổ biến, không cần nguồn riêng
- ours, setup-01 post: "Tuần đầu thay khoảng 50% nước mỗi ngày": đưa ra như quy tắc chung mà không nói lý do (ví dụ nền phân xả amoniac) và cũng không trả lời lịch thay nước khi bể đã ổn định
- ours, setup-01 post: Bỏ qua các câu về cho ăn, sưởi và lọc, nói là chưa đọc được phần đó trong cẩm nang
- ours, setup-01 post: Dặn mở CO2 trước giờ đèn 1 tiếng trong khi người hỏi chưa có bình, và ngụ ý cây cắm cần CO2 mới lên tốt, nên không trả lời rõ câu có nên mua hay không
- plain, setup-01 post: "Không thay nhiều" lúc mới setup: nếu bể dùng nền phân thì giai đoạn đầu thường phải thay nước nhiều; lời khuyên này chỉ hợp với bể chạy vi sinh không cá
- plain, setup-01 post: 'Không thay nhiều' trong tuần đầu: với bể thủy sinh mới set, thay nước thường xuyên trong vài tuần đầu là cách phổ biến để chặn rêu và amoniac từ phân nền
- plain, setup-01 post: Ước '150–200kg' cho bể 1m đầy nước kèm nền và kính có lẽ hơi thấp; con số thật thường gần 200–250kg
- ours, setup-01 tank: "lắp trên đường nước để nhiệt đều": an inline heater needs an external canister filter, and this hobbyist has no space for one.
- ours, setup-01 tank: The excerpt recommends a canister filter rated at twice the tank volume and shows a 400 USD pendant light for a cube tank. Neither suits a 1m all-in-one tank with a sponge filter.
- ours, setup-01 tank: It assumes the tank has no fish or plants and gives no light hours or water-change figures at all.
- ours, setup-01 tank: "lắp trên đường nước" (fitting the heater on the water line): this needs a canister filter, but the hobbyist has a sponge filter and no room for an external one
- ours, setup-01 tank: The excerpt recommends a canister filter and a ~400 USD pendant light, which don't fit a 1m all-in-one kit with no room for an external filter
- ours, setup-01 tank: "Bể mới chưa có cá hay cây" is an unchecked assumption, and it gives no hours for the light or % for water changes even though that's what was asked
- plain, setup-01 tank: "thêm... amoniac nguyên chất": this is hard to find in Vietnam and easy to overdose for a beginner, so it's a poor suggestion here
- ours, setup-02 post: "lọc ... khoảng gấp đôi thể tích bể, tức khoảng 190 lít": 190 l/h is too weak for a 96 L tank. Planted tanks usually need 4–6× the volume per hour, and if the box rating is optimistic, you should buy a bigger filter, not a smaller one.
- ours, setup-02 post: "Đặt lọc và sưởi ra ngoài bể": a heater is usually unnecessary in Vietnam's climate.
- ours, setup-02 post: Ignores trân châu, la hán and Gex xanh, and admits it did not read the light and filter guides.
- ours, setup-02 post: "công suất ghi trên hộp khoảng gấp đôi thể tích bể, tức khoảng 190 lít": khoảng 190 l/h là quá yếu cho hồ 96 lít. Thường nên chọn lọc có lưu lượng ghi trên hộp gấp 4–6 lần thể tích bể
- plain, setup-02 post: "Nếu bạn định nuôi cá la hán (cichlid)": misreads 'la hán', which is a plant in this hobbyist's list, as the flowerhorn fish.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar is not cheaper than Chihiros.
- plain, setup-02 post: Says rêu Taiwan and trân châu dislike strong current so much they get 'bật gốc'. That is overstated, since moss is tied on rather than rooted.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar thường đắt ngang hoặc hơn Chihiros, nên không phải lựa chọn rẻ hơn
- plain, setup-02 post: "Nếu bạn định nuôi cá la hán (cichlid)": ở đây la hán là cây trong danh sách cây trồng. Gợi ý nuôi cá la hán trong hồ cây là đọc sai và không hợp với hồ thủy sinh
- plain, setup-02 post: "Sunsun HW-304B... lưu lượng 400–600 l/h": HW-304B có lưu lượng định mức khoảng 1000 l/h trở lên, mâu thuẫn với dòng nhẹ mà chính câu trả lời khuyên. Eheim 2211 thì quá nhỏ cho hồ 96 lít
- plain, setup-02 post: "Chihiros C60": dòng C của Chihiros là đèn kẹp cho hồ nhỏ, không có mẫu C60 cho hồ 60cm
- ours, setup-02 tank: Suggested follow-up questions mention 60-litre and 38-litre tanks, but this tank holds about 96 litres, so they do not fit it
- ours, setup-02 tank: It tells a beginner to switch to low-light plants, which ignores the plants already chosen for the bonsai layout (pearl weed, 'la hán')
- ours, setup-02 tank: The suggested follow-ups mention a 60-litre and a 38-litre tank. Neither matches this 60×40×40 tank, which holds about 96 litres.
- plain, setup-02 tank: '0,5–1 W/lít' is an outdated rule of thumb and gives too wide a range for LED lights
- plain, setup-02 tank: It recommends a hang-on-back filter for 30–100 L. For a ~96 L planted bonsai tank, a canister filter would suit better
- plain, setup-02 tank: "0,5–1 W/lít": this is an old fluorescent-era rule. For this roughly 96-litre tank it means 48–96 W of LED, which is too strong for moss, anubias and Java fern without CO₂ and invites algae.
- plain, setup-02 tank: Its size bands put a 96-litre planted tank on a hang-on-back filter. A canister suits a bonsai layout with plants better.
- ours, setup-03 post: "Cài đèn 12 tiếng": quá dài cho bể mới set, rất dễ bùng rêu. Bể mới nên để khoảng 6–8 tiếng.
- ours, setup-03 post: "Làm bố cục kiểu Hà Lan để tiết kiệm tiền cây": bể Hà Lan cần rất nhiều cây thân và tốn công chăm, không hề rẻ.
- ours, setup-03 post: "Bể bỏ không thường hỏng ở chỗ thiếu đèn và thiếu nước sạch": chẩn đoán vô nghĩa vì bể đang để trống, chẳng có gì hỏng.
- ours, setup-03 post: Không nhắc đến việc chạy chu trình nitơ trước khi thả cá, nên dễ làm cá chết khi thả vào bể mới.
- ours, setup-03 post: Nhắc đèn Chihiros 3,6 triệu là gây rối với ngân sách 3–4 triệu, còn "chưa cần lọc" thì không hợp với ý muốn thả đông cá nhỏ.
- ours, setup-03 post: "Làm bố cục kiểu Hà Lan để tiết kiệm tiền cây": bố cục Hà Lan cần rất nhiều cây thân đứng và phải tỉa thường xuyên, vừa tốn tiền vừa khó, không phải kiểu tiết kiệm
- ours, setup-03 post: "Cài đèn 12 tiếng" cho bể mới set: chiếu sáng quá lâu, dễ bùng rêu hại
- ours, setup-03 post: "Bể bỏ không thường hỏng ở chỗ thiếu đèn và thiếu nước sạch": câu này vô nghĩa, bể trống thì không có gì để hỏng theo kiểu đó
- ours, setup-03 post: Nhắc đèn Chihiros 3,6 triệu là không liên quan, vì riêng cái đèn đó đã gần hết ngân sách
- ours, setup-03 post: Không nhắc tới việc chạy vi sinh (chu trình nitơ) trước khi thả cá
- plain, setup-03 post: Galaxy rasbora và Celestial pearl danio thích nước mát, nuôi trong bể không làm mát ở Việt Nam dễ yếu. Đây là lỗi nhỏ.
- ours, setup-03 tank: "Chọn bể nano hợp với chỗ đặt": người hỏi đã có sẵn bể, nên không cần mua bể nữa.
- ours, setup-03 tank: "Chihiros, Twinstar hoặc Skylight": đèn Twinstar quá đắt với ngân sách 3-4 triệu, mà câu trả lời không nhắc gì đến giá.
- ours, setup-03 tank: Khuyên dùng nền trơ nhưng đoạn trích cẩm nang bên dưới lại hướng dẫn tính lượng phân nền, nên hai phần mâu thuẫn nhau.
- ours, setup-03 tank: Tells them to choose and buy a nano tank even though the hobbyist already has an empty tank
- ours, setup-03 tank: Suggests Twinstar lights, which are too expensive for a 3–4 million budget and don't fit it
- ours, setup-03 tank: States the cycling and plant advice but gives no fish suggestions and no budget split, which is the core of the question
- plain, setup-03 tank: "Trân châu" được xếp vào cây dễ trồng: thực ra cây trải thảm này cần CO₂ và đèn mạnh mới lên tốt.
- plain, setup-03 tank: "tép crystal red" được gợi ý làm sinh vật dọn bể: loài này khó nuôi, cần nước mềm và mát, không hợp người mới trong khí hậu nóng ở Việt Nam.
- plain, setup-03 tank: "Cá bảy màu" được xếp vào loài đi đàn: cá bảy màu không phải cá bơi đàn thật sự.
- plain, setup-03 tank: Lists 'Trân châu' (HC Cuba/Glosso, a carpeting plant) as an easy beginner plant; it usually needs CO₂ and strong light
- plain, setup-03 tank: Recommends crystal red shrimp for beginners; they are fussy about water parameters
- plain, setup-03 tank: Calls cá bảy màu (guppies) a schooling fish, which they are not
- plain, setup-03 tank: Says 'lọc hộp kiểu HOB', which mixes up two different filter types
- plain, setup-04 post: "rêu nâu hoặc bong tróc thì thường do thiếu ánh sáng hoặc cặn bẩn": nói thiếu. Ở Việt Nam, rêu Fissidens nâu thường do nước nóng trên 28–30°C, mà Y không nhắc chuyện nhiệt độ hay làm mát.
- plain, setup-04 post: "không làm đổi pH đáng kể": đá Tiger có thể làm tăng nhẹ KH/GH, nên thử bằng axit hoặc theo dõi thông số nước mới đúng
- ours, setup-04 tank: Đề xuất thêm Monte Carlo/Marsilea trải thảm trong khi người hỏi không chọn cây thảm, và không nhận xét gì về danh sách cây của họ (rêu, ráy, dương xỉ Java đều là cây bám lũa/đá, không cần nhiều nền)
- ours, setup-04 tank: Gợi ý Monte Carlo, Marsilea làm thảm, trong khi bộ cây của họ không có cây thảm và họ không hỏi về cây thảm
- ours, setup-04 tank: Nhắc 'khe giữa lũa và đá', trong khi bể dùng đá Tiger
- ours, setup-04 tank: Không trả lời bộ cây đã chọn có ổn không, cũng không nói cần bao nhiêu nền
- plain, setup-04 tank: Xếp Anubias (ráy) vào nhóm cây có rễ cần nền giàu dinh dưỡng: ráy là cây thân rễ, nên buộc lên đá/lũa, vùi thân xuống nền dễ bị thối
- plain, setup-04 tank: Ví dụ tính bằng bể 60×30 thay vì 60×36 như bể thật của họ
- plain, setup-04 tank: Ví dụ tính nền dùng bể 60×30, không phải 60×36 của họ, dù đã có số đo
- plain, setup-04 tank: Không nói rằng rêu, ráy và dương xỉ Java là cây bám lũa/đá, không cần chôn vào nền giàu dinh dưỡng
- ours, setup-05 tank: Bảo chọn nền 'theo nước máy nhà bạn' là lời khuyên mơ hồ, không giúp được gì cho bể nền trộn + Aquafor
- plain, setup-05 tank: In the 60×30 example, 2 cm of gravel works out to about 3.6 L × 1.5 ≈ 5.4 kg, not the 3–4 kg it says
- plain, setup-05 tank: Putting 1–2 cm of gravel or fine sand on top of aquasoil is unusual advice and pushes the hobbyist away from the mixed base + Aquafor they planned
- plain, setup-05 tank: Asks for the tank size and lights even though these were already known, and does the worked example for a 60×30 tank instead of their 120×50
- plain, setup-05 tank: Ví dụ 'sỏi 2 cm thì 3-4 kg' cho bể 60×30: 3,6 lít × 1,5 kg/lít ≈ 5,4 kg, theo chính công thức của X thì con số này bị tính thiếu
- plain, setup-05 tank: Hỏi lại kích thước bể, đèn và cây dù app đã có sẵn các thông tin đó
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm nhiều khi xuống đáy": 30 cm is the front-to-back depth. Light has to travel down the 36 cm height (about 33 cm of water), so the reason is mislabelled.
- plain, setup-06 post: "Phủ cát lên Aquafor khoảng 1–2 cm": the hobbyist is asking about the empty front area, where the pebble wall already keeps the soil back. Telling them to put sand over Aquafor there doesn't fit their layout.
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm nhiều khi xuống đáy": đèn chiếu xuống theo chiều cao 36 cm, còn 30 cm là chiều sâu từ trước ra sau, nên câu này nhầm kích thước
- plain, setup-06 post: "Phủ cát lên Aquafor 1–2 cm" ở mặt tiền: hồ này đã quây phân nền sau gờ đá cuội nên phần mặt tiền có thể chỉ cần trải cát, không phải phủ lên Aquafor; lời khuyên hơi lẫn lộn
- plain, setup-06 post: Bật đèn 8–10 giờ ngay từ đầu là hơi dài cho hồ mới set; thường nên bắt đầu khoảng 6–7 giờ để tránh rêu hại
- ours, setup-06 tank: Bước 4 bảo trải nham thạch rồi bột vi sinh theo bốn lớp của cẩm nang. Nền của bạn là JBL Aquabasic Plus và phân nền Aquafor, nên trình tự này không khớp.
- ours, setup-06 tank: Không trả lời có nên trải sạn mặt tiền hay không, chỉ bảo làm theo cẩm nang mà nó lại chưa đọc.
- ours, setup-06 tank: It never answers whether to put sand at the front ("cẩm nang chưa cho biết"), even though that was half the question.
- ours, setup-06 tank: It tells them to lay lava rock and bacteria powder as the base layers, which ignores the JBL Aquabasic and Aquafor substrate they already have, held back with river stones.
- ours, setup-06 tank: "Sáng hơn đèn trần nhà" is too vague to judge whether the light is strong enough.
- plain, setup-06 tank: Gợi ý dùng 'giấy ngăn' giữa phân nền và sạn: giấy sẽ mục trong nước. Lưới thì dùng được.
- plain, setup-06 tank: The advice about digging fish (cichlids, cá hoàng kim) and corydoras doesn't apply: this is a planted tank with moss, anubias and bucephalandra, so it's padding that pushes the useful part further down.
- ours, setup-07 post: Says cẩm nang 'chưa nói tới' cỏ đồng tiền/khoai lang and tells them to check before buying, when both are common, easy emersed plants in Vietnam, so the hobbyist gets no real advice on them
- ours, setup-07 post: Ignores the bống question and the waterproofing/structure of the wall niche
- ours, setup-07 post: "hõm cửa sổ thường đón nắng": cửa sổ đã bị bít nên hõm không có nắng chiếu vào. Lấy nhiệt độ làm mối lo đầu tiên là dựa trên một giả định sai.
- ours, setup-07 post: "Thông số in trên hộp lọc thác thường cao gấp đôi thực tế": con số này được nói chung chung, không có nguồn.
- plain, setup-07 post: 'luộc hoặc ngâm ... tránh rong nâu': boiling driftwood mainly leaches tannin; it doesn't stop diatoms
- plain, setup-07 post: 'Lọc thác 8W ... lưu lượng khoảng 4–5 lần thể tích': flow can't be read from wattage, so this is a guessed figure
- plain, setup-07 post: Corydoras described as eating algae, which they don't; Otocinclus is risky in a newly set-up tank
- plain, setup-07 post: Puts the load on the lintel ('lanh tô phía trên'), but the tank's weight rests on the sill below
- plain, setup-07 post: "tường và lanh tô phía trên hõm chịu được tải này": bệ dưới đáy hõm chịu sức nặng của bể, không phải lanh tô phía trên.
- plain, setup-07 post: "luộc... để loại bớt tanin và tránh rong nâu": tanin làm nước ngả vàng, nó không gây ra rong nâu.
- plain, setup-07 post: "Khoai lang... trồng ở phần đất cao để rễ không bị ngập lâu": dây khoai lang thủy canh để rễ ngập trong nước vẫn sống tốt.
- ours, setup-08 post: Gợi ý mua bể nhỏ hơn dù người hỏi đã có bể dán sẵn, nên chưa sát hoàn cảnh
- ours, setup-08 post: Không trả lời phần chọn cá và chỉ nói chung chung về độ dày nền, thiếu con số cụ thể
- ours, setup-08 post: Says glass thickness depends only on length and the bottom pane. In fact water height, here 45 cm, is the main factor for the side panes.
- ours, setup-08 post: Suggests switching to a smaller tank, which doesn't help much since the hobbyist already has this tank glued.
- plain, setup-08 post: "Kính 5 ly là ổn, không quá mỏng": với bể cao 45 cm, dài 60 cm, kính 5 ly có hệ số an toàn thấp. Dân chơi thường dùng 8 ly, có nền và đá thì càng cần dày hơn. Câu này có thể dẫn tới bể bị bục
- plain, setup-08 post: "Lia thia... hoặc một cặp": nuôi lia thia theo cặp trong bể chung dễ đánh nhau, và lia thia cũng dễ ăn tép cherry
- plain, setup-08 post: "Kính 5 ly là ổn, không quá mỏng": a 45 cm tall, roughly 120 L tank is normally built from 8 mm glass. 5 mm leaves too little safety margin, and the tank could crack or burst once it is filled with substrate and rock.
- plain, setup-08 post: "Ốc táo... dọn rêu": apple snails eat soft plants, so they are a poor choice for a planted tank.
- plain, setup-08 post: Suggests putting betta or dwarf gourami in with guppies and other fish, which invites fin-nipping and aggression problems.
- ours, setup-08 tank: "Dùng kính Việt Nhật thay kính siêu trong": người hỏi đã có sẵn bể 5 ly nên lời khuyên chọn loại kính không dùng được
- ours, setup-08 tank: Lấy mốc 15 triệu và 'còn khoảng 2/3' trong khi người hỏi nói kinh phí ít, nên con số này không có ích
- ours, setup-08 tank: "thay khoảng 30% nước mỗi ngày" kéo dài cả tuần đầu là nhiều quá mức cần thiết với bể rẻ, ít cây
- ours, setup-08 tank: "Chọn bố cục kiểu Hà Lan để giảm tiền cây": bố cục Hà Lan cần rất nhiều cây cắt cành, đèn mạnh, CO2 và phân, nên lại là kiểu tốn tiền
- ours, setup-08 tank: "Dùng kính Việt Nhật... chân sắt hộp": người hỏi đã có sẵn bể, lời khuyên này không dùng được
- ours, setup-08 tank: Lấy mốc 15 triệu làm chuẩn tham khảo là quá cao với người kinh phí ít
- plain, setup-08 tank: "cần sưởi 25–300W": khí hậu Việt Nam nóng, phần lớn cá nhiệt đới không cần sưởi, và khoảng công suất này quá rộng nên không giúp được gì
- plain, setup-08 tank: Xếp trân châu và cỏ nhung vào nhóm cây dễ, rẻ, trong khi để lên thảm chúng thường cần đèn mạnh và CO2
- plain, setup-08 tank: Bucephalandra khá đắt, không hợp với bể tiết kiệm
- plain, setup-08 tank: "Betta... hợp bể nhỏ": bể khoảng 120 lít, không phải bể nhỏ
- plain, setup-08 tank: "Sưởi... cần sưởi 25–300W": ở Việt Nam nước thường đã 26–30°C, phần lớn bể không cần sưởi, và khoảng 25–300W rộng đến mức không giúp được gì
- plain, setup-08 tank: "Trân châu" nằm trong danh sách cây chịu thiếu sáng và thiếu CO2: trân châu muốn lên thảm thì gần như phải có CO2 và đèn mạnh
- plain, setup-08 tank: "Ốc Nerite không đẻ trứng trong nước ngọt": thật ra nó vẫn đẻ trứng bám lên kính, chỉ là trứng không nở
- plain, setup-08 tank: Ước tính chi phí theo bể khoảng 60 lít, trong khi bể này 60×45×45 là khoảng 120 lít
- plain, setup-09 post: 'cá neon/cá đuôi kiếm nhỏ' — cá đuôi kiếm dài tới khoảng 10 cm, không phải cá nhỏ
- plain, setup-09 post: 'Lỗ hút... cách đáy khoảng 2–3 cm' — với nền cát thì đặt thấp vậy dễ hút cát vào lọc
- plain, setup-09 post: 'Kính nên dày khoảng 10–12 mm' — hơi dư với bể cao 35 cm, thường 8–10 mm là đủ
- plain, setup-09 post: "bể dài và sâu nên cần lưu lượng lớn": cao 35 cm thì không phải bể sâu; cái cần là luồng nước chạy hết chiều dài 170 cm
- plain, setup-09 post: Gợi ý neon mà không nói gì về nhiệt độ: ở Việt Nam mùa nóng nước dễ lên 30°C+, neon khó trụ
- plain, setup-09 post: "Kính 10–12 mm": 12 mm là thừa với bể cao 35 cm; khoảng 8–10 mm có thanh giằng là đủ
- ours, setup-09 tank: "tôi chưa đọc nội dung nên chưa xác nhận được được danh sách cá cụ thể" — it names no fish at all, and it asks for the tank size even though the app already holds it.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus" — in Vietnam 'tỳ bà' means the pleco, a much bigger fish; Otocinclus is a different fish (called 'cá otto' there).
- plain, setup-09 tank: "Khoảng 1 cm cá trên 1 lít nước" — this rough rule is presented as a safe limit without any caveat.
- plain, setup-09 tank: "Thay nước... 20-30% mỗi tuần" — generic advice that ignores the hobbyist's wish to change water less often, without explaining how to get there (a lightly stocked tank with ráy).
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus... ít phải chăm": otocinclus yếu và khó nuôi lúc mới thả, không hợp người muốn ít chăm. Ở VN "tỳ bà" cũng thường dùng để gọi pleco hoặc cá bám đá, không phải otocinclus.
- plain, setup-09 tank: "cá chép mini (rasbora)": tên gọi lạ, dân chơi ở VN không gọi rasbora như vậy.
- plain, setup-09 tank: Bảo thay 20-30% mỗi tuần nhưng không nói gì về chuyện người hỏi muốn ít thay nước.
- ours, cycling-01 post: 'cẩm nang khuyên để máy sục khí chạy suốt ngày đêm' — trong bể có bơm CO2, sục suốt ngày làm bay mất CO2; nên chỉ sục ban đêm khi tắt CO2/đèn
- ours, cycling-01 post: 'chỉ thay nước khi thật cần để vi khuẩn có chỗ bám' — vi sinh chủ yếu nằm trong lọc và nền, thay nước không lấy đi đáng kể; với nền nhiều dinh dưỡng mới, những tuần đầu nên thay nước thường xuyên để giảm amoniac nhả ra từ nền
- ours, cycling-01 post: Thẻ loài ghi neon 21–25 °C nhưng không nói gì đến nhiệt độ nước mùa nóng ở Việt Nam
- ours, cycling-01 post: "cẩm nang khuyên để máy sục khí chạy suốt ngày đêm": in a tank with injected CO₂, running the air pump during the lit hours drives the CO₂ out. It should run at night only.
- ours, cycling-01 post: Same mistake about stopping water changes. A new tank with aqua soil needs frequent big changes in the first weeks.
- ours, cycling-01 post: The species card gives 21–25 °C without noting that Vietnamese tanks often run at 28–30 °C. The line 'bể nên có đáy từ 60×30' adds nothing for a 90×40 tank.
- plain, cycling-01 post: Hiểu 'neon, 7 màu' thành một loài 'neon 7 màu' rồi hỏi lại, trong khi người hỏi nói hai loài là neon và cá bảy màu (guppy)
- plain, cycling-01 post: Khuyên giảm thay nước còn 1–2 lần/tuần ngay, trong khi nền nhiều dinh dưỡng mới nhả amoniac nên những tuần đầu thường cần thay nước nhiều
- plain, cycling-01 post: Lý do không đặt sủi đối diện đầu ra lọc nói chưa rõ; điều quan trọng hơn là sục khí làm thất thoát CO2, nên chỉ sục ban đêm, mà Y không nói
- plain, cycling-01 post: "Thay 50% nước mỗi ngày làm chậm quá trình này... loại bỏ vi khuẩn": the helpful bacteria live on the filter media and the soil, not in the water. With rich aqua soil, big frequent water changes in the first 1–2 weeks are the usual practice because the soil leaches ammonia. Cutting straight down to 1–2 times a week is not right yet.
- plain, cycling-01 post: Reads 'neon, 7 màu' as one fish ('neon 7 màu') and asks the hobbyist to clarify. They actually mean two fish: neon and guppies (cá 7 màu).
- plain, cycling-01 post: Doesn't say to run the air pump only at night (when the CO₂ is off) to avoid losing CO₂. It only advises placing the airstone away from the filter outlet.
- ours, cycling-01 tank: Gợi ý "cycling có cá" gây khổ cho cá và không cần thiết với bể đã trồng nhiều cây.
- ours, cycling-01 tank: Bảng so sánh cho thấy pH neon 4–7.5 và bảy màu 7–8.5, nhưng câu trả lời không nhắc rằng hai loài này hợp nước khác nhau.
- plain, cycling-01 tank: "vài giọt nước rửa chén không có chất tẩy mạnh" làm nguồn amoniac: sai và nguy hiểm. Nước rửa chén có chất hoạt động bề mặt độc với cá và vi sinh. Nguồn amoniac đúng là amoniac tinh khiết hoặc thức ăn cá.
- plain, cycling-01 tank: Khuyên thêm nguồn amoniac là không cần với nền nhiều dưỡng vốn đã nhả amoniac, mà bể lại đang thay 50% nước mỗi ngày.
- plain, cycling-01 tank: "vài giọt nước rửa chén" làm nguồn amoniac: nước rửa chén có chất hoạt động bề mặt, độc cho vi sinh và cá. Phải dùng amoniac tinh khiết hoặc thức ăn cá.
- plain, cycling-01 tank: Hỏi lại nền và lọc sinh học, trong khi người hỏi đã có nền nhiều dưỡng và lọc thùng DF1300.
- plain, cycling-02 post: "Cá kiếm (platy)": ở Việt Nam cá kiếm là swordtail; platy thường gọi là cá hột lựu hoặc cá platy
- plain, cycling-02 post: "Neon và cá vàng đều thải nhiều chất bẩn": neon thải rất ít, chỉ cá vàng mới thải nhiều
- plain, cycling-02 post: "Mua máy sưởi" khi nuôi cá nhiệt đới: ở khí hậu Việt Nam hầu như không cần; với neon, nóng quá mới là điều đáng lo
- plain, cycling-02 post: Lộ trình bảo chạy bể 3-4 tuần "không thả cá", trong khi bể vẫn đang có 3 con cá vàng
- plain, cycling-02 post: "Cá kiếm (platy)": in Vietnam, cá kiếm is the swordtail. The platy is usually sold as cá hà lan or cá platy.
- plain, cycling-02 post: "Mua máy sưởi nếu nuôi cá nhiệt đới": in most of Vietnam, room temperature already suits tropical fish, so a heater is usually unnecessary.
- plain, cycling-02 post: "Chạy bể trước 3-4 tuần (không thả cá)": this contradicts the situation, because 3 goldfish are still living in the tank. It should be a fish-in cycle.
- ours, cycling-02 tank: Bước 1 nói "theo cẩm nang hãy đưa chúng về mức an toàn" nhưng không nói đưa về bằng cách nào. Bước 2 không nêu thay bao nhiêu % nước, cũng không nhắc khử clo nước máy, trong khi nước máy ở Việt Nam có clo và bể này vừa đổ nước là thả cá ngay.
- ours, cycling-02 tank: "Thay một phần nước bể bằng nước sạch": doesn't say to dechlorinate the water first or how much to change. With chlorinated tap water in Vietnam, this can hurt the fish that are still alive.
- ours, cycling-02 tank: "theo cẩm nang hãy đưa chúng về mức an toàn trước": too vague to act on.
- plain, cycling-02 tank: Câu "dùng nguồn amoniac như vi sinh/ amoniac tinh khiết" sai: vi sinh không phải là nguồn amoniac. Lỗi nhỏ.
- ours, cycling-03 post: 'cá trâm không nên nuôi chung với bảy màu hay betta, nên kế hoạch tỳ bà bướm cùng cá trâm cần xem lại': this doesn't follow. A note about guppies and betta says nothing about hillstream loaches, and hillstream loaches can live with rasboras if the tank has good flow and cool, clean water.
- ours, cycling-03 post: Says nothing about the white growth that is rotting the carpet plants, though that is the hobbyist's main complaint.
- ours, cycling-03 post: "cá trâm không nên nuôi chung với bảy màu... nên kế hoạch tỳ bà bướm cùng cá trâm cần xem lại": kết luận không liên quan đến lý do đưa ra, và kế hoạch mới cũng không có bảy màu
- plain, cycling-03 post: 'Trân châu là sỏi trơ, không giữ dinh dưỡng': wrong. Trân châu ngọc trai lùn is a carpet plant, not a gravel substrate, so the advice to wash the substrate and replant is built on a misreading.
- plain, cycling-03 post: 'Tỳ bà bướm... có thể ăn cây non': doubtful. Hillstream loaches mostly graze on biofilm and algae and don't usually damage plants.
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": trân châu ngọc trai lùn là cây trải nền (Hemianthus), không phải sỏi, nên X hiểu sai hồ của bạn ấy
- plain, cycling-03 post: "Tỳ bà bướm... có thể ăn cây non": cá này chủ yếu ăn rêu bám, không ăn cây. X cũng bỏ sót điều quan trọng nhất là chúng cần dòng chảy mạnh, nhiều oxy và nước mát, khó giữ trong cái nóng ở VN
- ours, cycling-03 tank: Gọi lớp trắng đang làm thối trân châu là 'bùng vi sinh' và dẫn trích đoạn về nước đục: đây là lớp màng hoặc nấm mọc trên cây bị thối, không phải nước đục trắng
- ours, cycling-03 tank: 'Thay nước nhỏ' mà không nói bao nhiêu phần trăm, nên khi amoniac cao thì không đủ để cứu cá
- ours, cycling-03 tank: "Thay nước nhỏ… không thay một lần quá nhiều": khi amoniac/nitrit đang làm cá chết thì phải thay nhiều (30-50%), thay ít là quá yếu
- ours, cycling-03 tank: "Ngưng cho ăn khoảng 7 ngày": dễ nguy hiểm với tỳ bà baby và bảy màu
- ours, cycling-03 tank: Trích đoạn về nước đục trắng không khớp với lớp trắng đang làm thối cây
- plain, cycling-03 tank: Bảo 'trồng cây thủy sinh nếu có thể' dù bể đã có trân châu, mà trân châu lại đang thối
- plain, cycling-03 tank: Cho rằng rêu trắng là do 'ánh sáng nhiều' là không đúng: lớp trắng ăn vào chất hữu cơ đang phân hủy, ánh sáng không phải nguyên nhân
- plain, cycling-03 tank: Hỏi lại kích thước bể và loại cá dù những thông tin này đã có sẵn
- plain, cycling-03 tank: Nói rêu trắng do dư dinh dưỡng và ánh sáng nhiều: lớp trắng làm thối trân châu thường là nấm hoặc vi khuẩn mọc trên chất hữu cơ đang phân hủy, giảm đèn không xử lý được nguyên nhân
- plain, cycling-03 tank: "Trồng cây thủy sinh nếu có thể": bể đã có trân châu, nên lời khuyên này thừa
- plain, cycling-03 tank: Hỏi lại loại cá và số lượng dù những thông tin đó đã có
- ours, cycling-04 post: Says new tank syndrome usually appears 1–3 weeks after stocking, so 5 days is 'hơi sớm'. Ammonia often spikes within days in an uncycled, heavily stocked tank, so this downplays the likely cause.
- ours, cycling-04 post: Doesn't explain the white foam at all, and doesn't answer whether regular water changes are needed long-term.
- ours, cycling-04 post: "bể 5 ngày tuổi là hơi sớm" — ammonia can build to toxic levels within days in a newly stocked, uncycled tank, so this plays down the most likely cause
- plain, cycling-04 post: Lists betta alongside neon and guppy as '5–8 con'. Bettas should be kept alone or carefully mixed, never as a group of 5–8.
- plain, cycling-04 post: A 25–30% change may be too little if ammonia is high, though it does suggest repeating every 1–2 days.
- ours, cycling-04 tank: "Đo ngay... oxy hòa tan": hobbyists in Vietnam almost never have a dissolved-oxygen test, so this step can't be done.
- ours, cycling-04 tank: "cá chết đã đem đi xét nghiệm thì đừng cho vào ngăn đá": doesn't apply to a home tank and pulls attention from the fix.
- ours, cycling-04 tank: Step 5's rule (move the fish if ammonia is above 5 mg/L and pH is below 7) is lifted from the guide without context. At pH below 7 most ammonia is in the less toxic form, so the condition is confusing.
- ours, cycling-04 tank: "Đo ... oxy hòa tan": hầu như người chơi ở VN không có bộ test DO, nên bước này không làm được
- ours, cycling-04 tank: "cá chết đã đem đi xét nghiệm thì đừng cho vào ngăn đá": không liên quan đến một bể cá cảnh tại nhà
- plain, cycling-04 tank: It asks how many litres the tank is, though the tank size was already available. This is a fit gap, not a factual error.
- ours, cycling-05 post: "giữ nước ở 24–26°C": nước hồ ở Việt Nam thường 27–30°C, giữ ở mức này là không cần thiết, và nước ấm hơn còn giúp vi sinh phát triển nhanh hơn
- ours, cycling-05 post: "amoni trên 0,1 mg/L... thì thay một phần nước ngay": câu này mâu thuẫn với bước châm amoni để chạy vi sinh không cá
- ours, cycling-05 post: Telling the hobbyist to keep the water at 24–26°C doesn't fit Vietnam's heat, where tanks run at 28–30°C. Warmer water actually speeds up cycling, so there's no need to cool it.
- ours, cycling-05 post: 'Nitrat trên 20 mg/L hoặc amoni trên 0,1 thì thay nước ngay' is applied to the cycling stage. That contradicts its own step of dosing ammonia, and nitrate is expected to rise while the tank cycles.
- ours, cycling-05 post: It says the wood, rocks and plants don't affect cycling, which ignores the tannins from the driftwood and that plants absorb nitrogen.
- plain, cycling-05 post: "Nitrobacter": vi khuẩn chuyển hóa nitrit chủ yếu trong bể là Nitrospira, nhưng nhiều nhãn sản phẩm vẫn ghi Nitrobacter nên lỗi này nhỏ
- plain, cycling-05 post: "nước để qua đêm": để qua đêm không khử được cloramin
- plain, cycling-05 post: "Ngâm hoặc luộc lũa": hồ đã châm đầy nước rồi nên lời khuyên này hơi muộn
- plain, cycling-05 post: 'Ngâm hoặc luộc lũa vài ngày' comes too late: the hobbyist has already filled the tank with the driftwood inside.
- plain, cycling-05 post: Most of the named products (Tetra SafeStart, Nitrivec, API Quick Start) are uncommon in Vietnam, and X doesn't name any brand that is easy to buy locally.
- plain, cycling-05 tank: Lists neon among hardy fish that cope with swings, but neons are sensitive and a poor first fish for a new tank
- plain, cycling-05 tank: Suggests lia thìa (betta) as a starter fish in what is a biotope community tank, which is a poor fit
- plain, cycling-05 tank: Asks for tank size and type even though the tank is 80×40×50 cm, about 160 L
- plain, cycling-05 tank: Lists Seachem Stability as containing Nitrosomonas/Nitrobacter, but it is mainly a Bacillus-based blend, not a classic nitrifier product
- plain, cycling-05 tank: "cá neon" listed as a hardy fish that tolerates swings, but neon tetras are sensitive in a newly cycled tank
- ours, cycling-06 post: Không trả lời câu hỏi về nước thùng xốp mà nói 'chưa đọc được trong lần tra cứu', dù đây là kiến thức cơ bản (vi sinh sống bám trên giá thể, nước gần như không mang vi sinh).
- ours, cycling-06 post: Doesn't answer the foam-box water question ("chưa đọc được trong lần tra cứu này"). It also refers to itself as "em" when the hobbyist is the "em", which is confusing.
- plain, cycling-06 post: 'ánh sáng nuôi tảo và vi khuẩn': ánh sáng không nuôi trực tiếp đám vi khuẩn dị dưỡng gây đục, và giảm đèn còn 4-6 giờ có thể làm cây ở bể lowtech mới yếu đi.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": light doesn't drive a white bacterial bloom. Cutting light to 4-6 hours in a new low-tech tank mostly holds back the plants.
- ours, cycling-06 tank: "cân nhắc đèn UV đúng thể tích bể": quá mức cho một bể khoảng 8 lít, và đục vi khuẩn ở bể mới thường tự hết.
- ours, cycling-06 tank: "giảm đèn còn khoảng 8–12 tiếng": 12 tiếng không phải là giảm. Bể lowtech thường chỉ chiếu khoảng 6–8 tiếng.
- ours, cycling-06 tank: Lời khuyên mâu thuẫn: vừa bảo không nên thay nước nhiều, vừa dẫn một nguồn khuyên thay 30% kèm hút đáy, mà không nói khi nào nên làm cách nào.
- ours, cycling-06 tank: "giảm đèn còn khoảng 8–12 tiếng": 12 tiếng không phải là giảm; bể lowtech mới nên để khoảng 6–8 tiếng.
- ours, cycling-06 tank: Khuyên dùng đèn UV cho bể cubic 20 (~8 L) là quá mức cần cho một đợt bùng vi khuẩn sẽ tự hết.
- ours, cycling-06 tank: "Nitrosomonas và Nitrobacter": vi khuẩn oxy hóa nitrite chính trong bể cá là Nitrospira; lỗi nhỏ nhưng là ví dụ cho sự chính xác bị phóng đại.
- plain, cycling-06 tank: "Tắt hoặc giảm đèn để hạn chế tảo": tắt đèn hẳn ở bể thủy sinh mới sẽ làm hại cây, mà cây lại giúp bể ổn định; chỉ nên rút ngắn giờ đèn.
- ours, cycling-07 post: "cá nhỏ kiểu bảy màu khoảng 2 lít một con": quy tắc này quá thô cho một bể không có lọc và không nói rõ lý do.
- plain, cycling-07 post: "thay 20-30% nước mỗi 1-2 tuần": sai với bể mới dùng phân nền. Phân nền mới nhả nhiều amoni và dinh dưỡng, nên tuần đầu cần thay nước dày, nếu không sẽ dễ bùng rêu.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": sai. Vi sinh có lợi bám trên nền, đá, lũa và mặt kính, chứ hầu như không sống lơ lửng trong nước.
- plain, cycling-07 post: Nêu "rau muống nước" trong danh sách cây nổi để hút nitrate là gợi ý lạc, không hợp với một bể thủy sinh đặt trong phòng.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": vi sinh bám trên nền, lũa, cây, gần như không sống lơ lửng trong nước, nên thay nước không làm mất chúng.
- plain, cycling-07 post: Bảo thay 20-30% mỗi 1-2 tuần cho hồ phân nền mới set: phân nền mới nhả nhiều amoni/dinh dưỡng, tuần đầu cần thay nhiều và dày, nếu không rất dễ bùng rêu.
- ours, cycling-07 tank: "Giữ bộ lọc chạy liên tục và đừng vệ sinh hay bỏ vật liệu lọc": the tank has no filter, so this first step doesn't apply to them and misses the point that they need to add one
- ours, cycling-07 tank: "Sau khoảng 1 đến 2 tháng... hãy thay rất ít thay vì thay dày mãi": vague, and in a filterless tank it could be risky
- ours, cycling-07 tank: 'Giữ bộ lọc chạy liên tục và đừng vệ sinh hay bỏ vật liệu lọc': bể này không có lọc. Lẽ ra phải khuyên mua và lắp một bộ lọc (kèm sủi oxy, vì bể đặt trong phòng ngủ).
- plain, cycling-07 tank: It reads the question as asking whether water changes can replace cleaning the filter, but the hobbyist has no filter at all
- plain, cycling-07 tank: "Nếu chưa có cá, không cần thay nước quá nhiều": new soil substrate releases a lot of ammonia and nutrients, so the first weeks need frequent water changes to hold back algae
- plain, cycling-07 tank: Đọc sai câu hỏi thành 'thay nước thay cho vệ sinh lọc'. Bể này không có lọc, nên cả câu trả lời về cách rửa vật liệu lọc đều không dùng được.
- ours, cycling-08 post: Không hề nhắc xi măng mới làm nước rất kiềm và phải xử lý/ngâm xả trước khi thả cá, dù đây là rủi ro lớn nhất của hồ này
- ours, cycling-08 post: "mùa nuôi ngoài trời ở vùng ôn đới thường từ tháng 5 đến tháng 10" là lời khuyên cho vùng ôn đới, không hợp với Việt Nam
- ours, cycling-08 post: "một con cho mỗi 38 lít" là con số lạ, không có nguồn rõ ràng, không áp dụng được cho hồ 32 lít
- ours, cycling-08 post: Né câu hỏi CO2, bảo người hỏi tự quyết, trong khi câu trả lời rõ ràng là không cần
- ours, cycling-08 post: Không nhắc gì đến 3 mặt xi măng dù xi măng mới làm pH tăng vọt và có thể giết cá, đây là rủi ro lớn nhất của hồ này
- ours, cycling-08 post: "có người khuyên một con cho mỗi 38 lít" nghĩa là hồ 32 lít không thả nổi một con, con số vô nghĩa với hồ này
- ours, cycling-08 post: Mốc mùa nuôi ngoài trời "vùng ôn đới tháng 5 đến tháng 10" không áp dụng được ở Việt Nam
- ours, cycling-08 post: Né câu hỏi CO2, bảo người hỏi tự quyết
- plain, cycling-08 post: Gợi ý cá neon cho hồ ngoài trời nóng ở Việt Nam là lựa chọn kém, vì neon không chịu được nhiệt độ cao lâu ngày
- plain, cycling-08 post: "bèo tây" (lục bình) quá to cho hồ 30 lít, không hợp để gợi ý
- plain, cycling-08 post: "trúc bách" không phải cây thủy sinh sống ngập, gợi ý dễ gây nhầm
- ours, cycling-08 tank: '1 con cá nhỏ cho mỗi 38 lít nước': a poor conversion of the old 'one inch per gallon' rule. On a 32 L tank it means less than one fish, which is useless for planning.
- ours, cycling-08 tank: Never answers whether the Sobo 400 l/h is enough. That is about 12 tank volumes an hour on 32 L, so it is plenty and may even be too strong.
- ours, cycling-08 tank: '1 con cá nhỏ cho mỗi 38 lít' is a garbled one-inch-per-gallon rule. For a 32 L tank it implies less than one fish, so it can't guide anyone.
- ours, cycling-08 tank: It recommends fish-in cycling as the default plan, which puts fish through ammonia exposure when fishless cycling with bottled bacteria is easy and kinder.
- ours, cycling-08 tank: It says it can't judge the Sobo 400 l/h filter, but that is about 12 times the tank volume per hour, plenty for 32 L.
- plain, cycling-08 tank: Asks for the tank volume and filter type, which are already known. It also never applies its own 4–6x rule to show that 400 l/h is more than enough for about 32 L.
- ours, sick-01 post: "cá ngựa vằn cần 18–25°C": this range doesn't fit Vietnam. Tanks here usually sit at 27–30°C, and zebra danios handle that fine, so the reader might worry for nothing or try to cool the tank.
- ours, sick-01 post: "bể từ 90 cm": far bigger than zebra danios actually need.
- ours, sick-01 post: "cá ngựa vằn cần 18–25°C": quá hẹp và không hợp với Việt Nam. Danio chịu được khoảng 26–30°C của bể ở nhà mình, con số này dễ làm người nuôi lo sai chỗ hoặc lắp thêm thiết bị không cần.
- ours, sick-01 post: Không nêu ra lao cá (mycobacteriosis), là nguyên nhân hay gặp nhất khiến đàn danio lâu năm cong người rồi chết lai rai.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này": wrong. Old zebra danios often develop a bent spine (scoliosis), so age is a real possible cause.
- plain, sick-01 post: Columnaris causing a bent body is a weak link, and Hexamita in cichlids is a guess that doesn't fit this fish.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này": sai một phần. Cá ngựa vằn già (từ khoảng 3 năm) hay bị cong cột sống, nên tuổi già vẫn là một khả năng.
- plain, sick-01 post: Câu mở đầu còn băn khoăn đây là cichlid, trong khi "ngựa vằn xanh" rõ ràng là danio. Phần đó và mục Hexamita cho cichlid là thừa.
- ours, sick-01 tank: "Pseudoloma neurofilia": the correct spelling is neurophilia
- ours, sick-01 tank: Leaves out mycobacteriosis (fish TB), a leading cause of a curved spine and slow deaths in zebrafish, and does not warn that it can spread to people
- ours, sick-01 tank: Advice about inbred stock and quarantining new fish does little for a tank that has run almost 3 years without adding fish
- ours, sick-01 tank: Card gives 18–25 °C, but tanks in Vietnam usually run at 27–30 °C, and the answer does not address this
- ours, sick-01 tank: Viết sai tên loài 'Pseudoloma neurofilia', đúng là neurophilia
- ours, sick-01 tank: Bỏ sót bệnh lao cá (Mycobacterium), một nguyên nhân hàng đầu gây cong cột sống ở cá ngựa vằn, và không cảnh báo bệnh có thể lây sang người
- plain, sick-01 tank: Nodavirus/VNN is mainly a disease of marine and farmed fish and is unlikely in a home zebrafish tank
- plain, sick-01 tank: Disinfecting the substrate and filter goes too far and could crash the cycle
- plain, sick-01 tank: Nodavirus (VNN) chủ yếu là bệnh cá biển nuôi thương phẩm, khó có khả năng là nguyên nhân ở bể ngựa vằn cảnh
- ours, sick-02 post: "Giữ nước khoảng 20–23°C": a tank kept indoors in Vietnam without a chiller can't hold that range. It is also too cold for the guppies sharing the tank.
- ours, sick-02 post: Asks the hobbyist to measure dissolved oxygen. Ordinary hobbyists in Vietnam rarely have a kit for that, so the step doesn't fit them.
- ours, sick-02 post: "Giữ nước khoảng 20–23°C": bể đặt trong nhà ở Việt Nam không có máy làm lạnh thì gần như không giữ được mức này. Mức đó cũng mâu thuẫn với cá bảy màu nuôi chung và với thẻ loài ghi 10–27°C
- ours, sick-02 post: "đo ... oxy hòa tan và clo", "oxy trên 5 mg/L": người nuôi tại nhà hầu như không có dụng cụ đo oxy hòa tan, nên bước này khó thực hiện
- plain, sick-02 post: "nước máy ở nhiều nơi dùng chloramin": nói hơi quá với Việt Nam, nơi nước máy chủ yếu khử bằng clo, dù lời khuyên dùng thuốc khử clo vẫn an toàn
- plain, sick-02 post: "bộ test ... khoảng 100–200 nghìn": mức giá này chỉ đúng với que thử. Bộ test dạng dung dịch thường đắt hơn
- ours, sick-02 tank: "chỉ châm thêm nước khi hao hụt": the hobbyist's notes don't say this, so the answer adds a detail about their tank that isn't there
- ours, sick-02 tank: "cá bảy màu 6 cm": that's the top of the guppy size range. The bigger problem with keeping goldfish and guppies together is that goldfish like cooler water and guppies like warmer water, and the answer doesn't mention it
- ours, sick-02 tank: "chỉ châm thêm nước khi hao hụt" — the tank notes don't say this; it's an assumption stated as fact
- ours, sick-02 tank: Says to measure oxygen, but home keepers in Vietnam almost never have a dissolved-oxygen test kit
- ours, sick-03 post: Says it hasn't read the guide's sections on CO2 testing and water parameters, so it gives no answer on lowering TDS or on why the shrimp and fish are dying, which are the hobbyist's main questions.
- ours, sick-03 post: Tells them to 'tạm dừng... thay nước mạnh' but gives no way to bring TDS down, so the one thing they asked about goes unanswered.
- plain, sick-03 post: Reads 'cá tầm 1-2 tuần chết 1 con' as if 'tầm' were a kind of fish ('tầm (nếu là loài nhạy cảm)'). Here 'tầm' just means 'about', as in about one fish every 1-2 weeks.
- plain, sick-03 post: 'xanh vàng là đủ CO2 hay chưa' is unclear about the drop checker colours: green means CO2 is enough and yellow means too much.
- plain, sick-03 post: "CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển" — 12 ppm is low for a CO2-injected tank, where people usually aim for about 20–30 ppm, so the test kit is probably right. Blaming the kit points the hobbyist away from the real cause.
- plain, sick-03 post: "Otto, pygmy và tầm (nếu là loài nhạy cảm)" — misreads "tầm 1-2 tuần" (about every 1–2 weeks) as the name of a fish.
- plain, sick-03 post: "Dùng drop checker... (xanh vàng là đủ CO2 hay chưa)" — too vague: green means CO2 is about right and yellow means too much, and the answer doesn't say this.
- ours, sick-03 tank: "phần lớn TDS đến từ nước máy": bể 360 so với nước nguồn 160–200 nghĩa là gần một nửa TDS là phần tích tụ trong bể (phân nền, phân nước, ít thay nước), không phải chủ yếu từ nước máy
- ours, sick-03 tank: "đưa dần về khoảng 120–160 … bằng cách pha nước nguồn": nước nguồn đã 160–200 thì chỉ thay nước bằng nó không thể xuống tới 120–160; muốn thế phải pha nước RO hoặc nước mưa
- ours, sick-03 tank: 'phần lớn TDS đến từ nước máy' is a misreading: the source water is 160–200 and the tank is 360, so nearly half the TDS has built up inside the tank (fertiliser, waste)
- ours, sick-03 tank: 'đưa dần về khoảng 120–160 … bằng cách pha nước nguồn' can't work, because the source water is already 160–200
- ours, sick-03 tank: 'thay ít nhất 50% nước' with shrimp in the tank: the TDS drop from 360 to about 180 is a big swing and risks molting deaths, the very problem the hobbyist has
- plain, sick-03 tank: Tập trung vào tép Caridina (Crystal, Bee) trong khi tép màu là Neocaridina, vốn chịu được GH 8, KH 4, nên dễ làm người đọc lo sai chỗ
- plain, sick-03 tank: Hỏi lại loại cá, TDS/GH/KH/pH, những thông tin app đã có sẵn
- plain, sick-03 tank: Focuses on Caridina (Crystal, Bee) sensitivity, but the hobbyist keeps tép màu (Neocaridina), which handles GH 8/KH 4 fine
- plain, sick-03 tank: Asks for TDS/GH/KH/pH and the fish list, which the hobbyist already has on record
- ours, sick-04 post: "Tắt CO2 tạm thời, tăng sục khí... để đẩy bớt CO2" is first aid copied from a guide about pH dropping. This tank's pH is too high at 8.4, so cutting CO2 pushes it higher.
- ours, sick-04 post: The quoted guide sections are about pH tụt (pH falling), which is the opposite of this problem, so they don't apply.
- ours, sick-04 post: It never explains that the white elephant-skin rock (đá da voi) keeps raising KH, which is why CO2 can only bring pH down to 7.4, and it says nothing about vảy ốc.
- ours, sick-04 post: "Tắt CO2 tạm thời, tăng sục khí... để đẩy bớt CO2" — đây là cách xử lý khi pH tụt; bể đang ở pH 8,4 nên đẩy CO2 ra chỉ làm pH cao thêm và làm cây đang yếu thiếu CO2
- ours, sick-04 post: Đoạn trích kèm theo là phần 'xử lý pH tụt', không khớp với tình huống pH cao
- ours, sick-04 post: Không nói gì đến vảy ốc (cây Rotala) bị gãy ngọn
- plain, sick-04 post: "Ốc vảy (Neritina)... vết gãy trên vỏ": vảy ốc xanh/đỏ here is the plant Rotala, not a snail. Y misread the hobbyist's description of broken stem tips.
- plain, sick-04 post: "Ốc vảy (Neritina) chịu nước cứng..." — vảy ốc xanh/đỏ ở đây là cây Rotala, không phải ốc; X hiểu nhầm hoàn toàn triệu chứng gãy ngọn lá
- ours, sick-04 tank: Trích dẫn bài về tôm càng (crayfish) để nói về tép, không đúng loài
- ours, sick-04 tank: Assumes the shrimp are red cherry (Neocaridina) and builds the pH 6.5–8 reasoning on that; the hobbyist only wrote 'tép'
- ours, sick-04 tank: The quoted guide excerpt is about crayfish, not shrimp, so it is weak support
- plain, sick-04 tank: Hỏi lại loại vật liệu, loài tép và pH dù app đã có Neo Soft, tép, pH 8,4
- plain, sick-04 tank: Đưa khoảng pH 6,5-7,5 làm mục tiêu cho bể đang ở pH 8,4 do đá, dễ khiến người nuôi tiếp tục cố hạ pH
- plain, sick-04 tank: Asks which material and what pH they have, although the tank record already shows Neo Soft and pH 8.4, so the reply is generic instead of using their data
- ours, sick-05 tank: "Màu vàng nâu thường do tannin từ lũa": nó nói như thể chắc chắn bể có lũa, trong khi dữ liệu của bể không hề nhắc đến lũa
- ours, sick-05 tank: Đoạn trích về old tank syndrome không hợp với một bể mới chạy 8,6 tuần
- ours, sick-05 tank: "Màu vàng nâu thường do tannin từ lũa tiết ra" assumes the tank has driftwood, which the hobbyist never said.
- ours, sick-05 tank: Uses an old tank syndrome guide excerpt for a tank that has only run 8.6 weeks, so it doesn't really fit.
- plain, sick-05 tank: Bỏ qua chuyện thay 50% nước cách ngày bằng nước đóng bình ít khoáng. Lại còn cho rằng vấn đề có thể nằm ở nước máy chưa khử clo, trong khi người nuôi không dùng nước máy
- plain, sick-05 tank: "Tảo silic... thường do ánh sáng yếu": đây là cách giải thích quá đơn giản, chưa chắc đúng
- plain, sick-05 tank: Puts tap-water chlorine/chloramine high on the list and tells them to use dechlorinated water, but they change water with bottled drinking water, so this misses their real situation.
- ours, sick-06 post: "stress… bỏ ăn trong 24–72 giờ đầu, phần lớn ăn lại sau 2–3 ngày": áp mốc này cho cá rồng là sai, vì rồng chuyển bể thường bỏ ăn 1–2 tuần, nên kết luận "nhiều khả năng không chỉ là stress" là đánh giá quá mức
- ours, sick-06 post: "đưa cá tới bác sĩ thú y thủy sản": ở Việt Nam rất hiếm chỗ khám cho cá cảnh, đưa cá rồng lớn đi xa cũng gây stress thêm
- plain, sick-06 post: "để nước qua một đêm" để khử clo: không xử lý được chloramine, mà nước máy một số nơi ở Việt Nam có dùng chloramine
- ours, sick-06 tank: "cá mồi tranh mồi... xem lại việc ghép" and the tank-mate guide excerpt treat feeder fish as tank mates, which doesn't fit here: they are live food, and the real risk is that they bring in disease and add to the bio-load.
- ours, sick-06 tank: Treats the cá mồi as tankmates ('xem lại việc ghép') and shows a guide excerpt about choosing tankmates, which partly misreads live feeder fish; minor.
- plain, sick-06 tank: It asks how long the tank has been running and for other details already in the tank record, and it doesn't use the fact that there are 2 arowanas and feeder fish in the tank.
- plain, sick-06 tank: Asks for the tank's size and how long it has run, though the app already shows it has run for one week; it also never mentions the cá mồi already in the tank.
- ours, sick-07 post: Y chỉ đổ lỗi cho việc 'nước bị khuấy' mà bỏ qua nguyên nhân chính: vứt sỏi làm mất vi sinh, có thể khiến amoniac và nitrit tăng trong bể chính.
- plain, sick-07 post: 'Tách riêng con cá là đúng, vì vậy bạn nên làm ngay': người hỏi đã tách cá rồi, câu này cho thấy X đọc câu hỏi chưa kỹ.
- plain, sick-07 post: Xếp 'cá chốt' vào nhóm rất nhạy muối là nói quá, vì nhiều loài cá chốt vẫn chịu được muối liều thấp.
- plain, sick-07 tank: "thay nước mạnh hơn và điều trị lâu hơn" — vague, gives no dose, duration or other clear criterion for escalating
- ours, sick-08 post: "4–5 tiếng" nhỏ giọt là lâu hơn mức thường cần (1–2 tiếng). Không gây hại nhưng hơi quá tay.
- ours, sick-08 post: "làm quen nước 4–5 tiếng": longer than most guides advise (usually 1–2 hours of drip). Not harmful, but stated with no reason.
- plain, sick-08 post: Xếp "Thiếu oxy vào ban đêm (khả năng cao nhất)" là chưa hợp lý. Neon trong cùng bể vẫn khỏe, còn otto có thể đớp khí trên mặt nước, nên khó tin oxy là nguyên nhân chính.
- plain, sick-08 post: "Thiếu oxy vào ban đêm (khả năng cao nhất)": low night oxygen is ranked as the most likely cause without any evidence. Three ottos dying the first night with the neons fine points more to stress from shipping or acclimation, or to chemicals.
- plain, sick-08 post: "nhiễm ký sinh trùng (đốm trắng...)": white spot doesn't kill a fish that looked healthy within one night.
- ours, sick-08 tank: "Cả đàn chết trong một đêm thường là dấu hiệu của sốc hoặc đói": cá không chết đói chỉ sau một đêm. Chết đói mất nhiều ngày đến vài tuần, nên đây không thể là nguyên nhân.
- ours, sick-08 tank: "làm quen nước 4–5 tiếng": quá lâu. Amoniac tích lại trong túi hoặc xô có thể làm cá yếu thêm, thường chỉ cần khoảng 1–2 tiếng.
- ours, sick-08 tank: "Giữ… khoảng 21–26°C": ở Việt Nam bể thường 27–30°C, nên mức này khó giữ và không sát thực tế. Cũng không cần thiết vì otto vẫn chịu được khoảng 28°C.
- ours, sick-08 tank: "thường là dấu hiệu của sốc hoặc đói": cá không chết đói chỉ sau một đêm, nên đói không giải thích được việc cả đàn chết qua đêm.
- ours, sick-08 tank: "làm quen nước 4–5 tiếng": quá lâu so với khuyến nghị thường gặp (1–2 tiếng); túi cá dễ thiếu oxy và nóng lên trong khí hậu Việt Nam.
- ours, sick-08 tank: "giữ khoảng 21–26°C": nước hồ ở Việt Nam thường 28–30°C, mục tiêu này khó giữ mà không có máy làm lạnh; câu trả lời không bàn tới nhiệt và thiếu oxy ban đêm.
- ours, sick-09 post: "bạn đã thả thêm 6-7 con cá chép": misreads the question. The 6–7 fish are the ones that died, not extra fish added.
- ours, sick-09 post: Puts the deaths down to low oxygen in freezing weather, but cold water holds more oxygen. It ignores the more likely causes: a 30 cm tank whose temperature swings sharply, ammonia, and disease from new fish.
- ours, sick-09 post: Says it can't answer whether to dig deeper or whether the marble floor is OK, which were two of the hobbyist's direct questions.
- ours, sick-09 post: Names lack of oxygen from overstocking as the main cause in cold weather. Cold water holds more oxygen, so the likelier causes are cold shock and temperature swings in a 30 cm tank, an unfinished biological filter, and leftover food
- ours, sick-09 post: "bạn đã thả thêm 6-7 con cá chép": misreads the question. The 6-7 fish died; they were not the number stocked
- ours, sick-09 post: "bể này chỉ hợp với một con koi": a rigid 950 L-per-koi rule applied without knowing the fish size
- plain, sick-09 post: "mùa lạnh nước cũng dễ thiếu oxy": misleading, because cold water holds more dissolved oxygen.
- plain, sick-09 post: A filter flow of 1,000–1,500 L/h (one tank turnover every 1–2 hours) is on the low side for koi.
- plain, sick-09 post: "nối với bơm sục khí đang có": the hobbyist has a water pump, not an air pump, so an air stone cannot be hooked to it
- plain, sick-09 post: "Với 6-7 con cá vừa mua/thả thì mật độ có thể đã vượt": this misreads the question. The 6-7 fish are the ones that died, not the number stocked
- ours, sick-09 tank: "cẩm nang tính khoảng 1 W mỗi lít nước": với hồ koi ngoài trời khoảng 1.350 lít, mức này nghĩa là sưởi hơn 1.300 W. Không thực tế và cũng không cần cho koi, vốn là cá chịu lạnh.
- ours, sick-09 tank: Không nêu số liệu cụ thể khi thay nước ("theo nhãn sản phẩm"), trong khi đây là việc người chơi cần làm ngay.
- ours, sick-09 tank: "Sưởi khoảng 1 W mỗi lít nước": cho hồ koi ngoài trời khoảng 1.350 lít và chỉ sâu 30 cm thì cần khoảng 1,35 kW, rất khó làm được. Koi chịu được lạnh, nên che chắn và tránh để nhiệt độ dao động mới là việc quan trọng.
- plain, sick-09 tank: "Ổn định nhiệt độ ... 24–26°C cho cá nhiệt đới" và ví dụ betta, neon, guppy: koi và cá chép là cá nước lạnh, sống ở hồ ngoài trời. Lời khuyên này lấy từ bể cá nhiệt đới nên không hợp với hồ của họ.
- plain, sick-09 tank: Hỏi lại dung tích, loài cá và có sưởi hay không, trong khi chủ hồ đã có sẵn những thông tin đó.
- plain, sick-09 tank: "Ổn định nhiệt độ ... 24–26°C cho cá nhiệt đới bằng heater": koi và cá chép không phải cá nhiệt đới, và sưởi một hồ ngoài trời khoảng 1.350 lít lên 24–26°C vừa không thực tế vừa không cần.
- plain, sick-09 tank: Nói về betta, neon, guppy là chuyện ngoài lề, vì hồ này nuôi koi và cá chép.
- ours, stocking-01 post: "Cá bảy màu cần nước 21–26°C và có sưởi": in Vietnam's heat, guppies rarely need a heater, and the fish card it shows gives 17–28°C, which contradicts this.
- ours, stocking-01 post: "dừng cho ăn nhiều hơn một lần": the feeding instruction is worded so it is unclear what the reader should do.
- ours, stocking-01 post: "Cá bảy màu cần nước 21–26°C và có sưởi": ở Việt Nam thường không cần sưởi, và con số này không khớp với thẻ cá ghi 17–28°C.
- ours, stocking-01 post: "Bể tối thiểu 80 lít cho mỗi con cá vàng": con số này khá cao so với cách nói thường gặp. Có nguồn trích nhưng hơi cứng.
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": guppies are peaceful, and they are the likely victims here, not the culprits.
- plain, stocking-01 post: "Nếu muốn nuôi cá 7 màu: nên nuôi cùng cá cỡ lớn..., bể tối thiểu khoảng 200 lít": this is backwards. Guppies need small, peaceful tankmates and a small tank is fine.
- plain, stocking-01 post: "cá 7 màu cần nước ấm (khoảng 25–28°C)": this range is narrower than needed. Guppies tolerate a wider range.
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": guppy là cá hiền, chúng không giết cá khác.
- plain, stocking-01 post: "cá 7 màu nên nuôi cùng cá cỡ lớn..., bể tối thiểu 200 lít, tránh thả cá nhỏ chung": sai và ngược với thực tế, vì guppy nhỏ, sống tốt trong bể nhỏ và cá lớn sẽ ăn chúng.
- ours, stocking-01 tank: Blames unnamed 'cá khác' but never names the 2 goldfish, the most likely predators of guppy fry and small guppies in this tank, and doesn't warn about keeping goldfish with guppies
- ours, stocking-01 tank: Never names the 2 goldfish as the likely predator. Goldfish readily eat guppy fry and small guppies.
- plain, stocking-01 tank: Lists predators the hobbyist doesn't keep (cá rô, lia thia, cá lóc con) and misses the goldfish they do keep
- plain, stocking-01 tank: Names cá rô, cichlid, lia thia and cá lóc as likely culprits, which this tank doesn't have, and never mentions the goldfish it does have
- plain, stocking-01 tank: Asks which other species are in the tank when the app already holds that
- ours, stocking-02 post: "tôi chưa chạy được công cụ kiểm tra cá sống chung" – this tool talk is meaningless to the hobbyist and adds doubt to an answer that is right
- ours, stocking-02 post: "Hỏi thêm loài chuột cụ thể" – no need: corydoras of any common species live fine with neon and platy
- ours, stocking-02 post: 'Lúc này tôi chưa chạy được công cụ kiểm tra cá sống chung': lộ chuyện nội bộ của hệ thống, gây rối cho người đọc
- ours, stocking-02 post: Hỏi lại loài cá chuột là không cần, vì các loài corydoras đều hiền và nuôi chung với neon được
- plain, stocking-02 post: It doesn't know that 'mún' is platy and guesses it might be cá rô, betta or 'cá đầu to', so half of the question goes unanswered
- plain, stocking-02 post: Không biết 'mún' là cá platy, còn đoán có thể là cá rô hay betta đực, nên trả lời sai câu hỏi chính về việc nuôi chung
- plain, stocking-02 post: 'Nhiệt độ khoảng 22-26°C': gần như không giữ được ở Việt Nam nếu không có máy làm lạnh, và câu trả lời không nhắc đến cái nóng ở đây
- ours, stocking-02 tank: 'chưa kiểm tra được neon có sống chung với platy và cá chuột' – dodges the main question; neon, platy and corydoras are commonly kept together, though neon prefers cooler water than Vietnam's heat often gives
- ours, stocking-02 tank: 'cẩm nang chỉ cho thêm khoảng 30–50% số cá' – a stocking rule that looks made up
- ours, stocking-02 tank: It never says the tank has only been running 1 week and isn't cycled yet, which is the real reason to add only a few fish
- ours, stocking-02 tank: 'cẩm nang chỉ cho thêm khoảng 30–50% số cá, tức 3 đến 5 con' is an unexplained rule that looks invented
- ours, stocking-02 tank: Says it can't confirm whether neons can live with platy, though they get along fine; it also never says the tank is only 1 week old and not yet cycled
- ours, stocking-02 tank: Neon temperature of 21–25 °C clashes with Vietnam's heat, but the answer doesn't mention it
- plain, stocking-02 tank: 'thả thêm 40 con neon thường vẫn được' – this is risky for a 96 L tank that has run only 1 week and already holds platy and corydoras
- plain, stocking-02 tank: Asks for the tank size and what 'mún' is, though mún is the common Vietnamese name for platy and the tank details were available
- plain, stocking-02 tank: 'Bể 100 lít trở lên... thả thêm 40 con neon thường vẫn được' ignores that this tank has only run 1 week; adding 40 fish to an uncycled tank risks an ammonia spike
- plain, stocking-02 tank: Lists 'cá lia thia lùn' (betta) as a good neon tankmate, but bettas can chase and eat small neons
- plain, stocking-02 tank: Doesn't recognise 'mún' (platy), a common Vietnamese name, so it never answers the compatibility question
- ours, stocking-03 post: Points the reader to the cardinal/neon tetra page as an option for a 15-litre tank. Neon tetras are schooling fish and are not suitable for a tank this small.
- ours, stocking-03 post: Gợi ý mở trang cá neon xanh khi đang nói về bể 15 lít, trong khi cá neon là cá đàn, không hợp với bể nhỏ cỡ này.
- plain, stocking-03 post: "Tránh cá đàn lớn như ... cá lia thia" is wrong. Lia thia is the betta that the same answer recommends, and it is not a schooling fish.
- plain, stocking-03 post: "Đèn 8-10 tiếng" is a bit long for a brand-new tank and can easily cause algae. 6-8 hours is safer.
- plain, stocking-03 post: "Tránh cá đàn lớn như neon, cá chuột, cá lia thia": cá lia thia là cá đá sống đơn độc giống cá xiêm, không phải cá đàn, nên xếp vào nhóm này là sai.
- ours, stocking-03 tank: Suggests neon and cá chuột (corydoras) for a ~15 L tank. Corydoras need a larger footprint and group, so they're a poor fit.
- ours, stocking-03 tank: Implies 15 L is a bit small for a betta. In fact, a single betta is the best choice for this tank.
- ours, stocking-03 tank: Lists a heater in the setup steps. Most tanks in Vietnam's climate don't need one for tropical fish.
- ours, stocking-03 tank: Gợi ý cá chuột (corydoras) và rasbora cho bể 15 lít là quá chật; hai loài này cần bể lớn hơn và nuôi theo đàn.
- ours, stocking-03 tank: Phần trích có bước đặt sưởi, trong khi ở khí hậu Việt Nam thường không cần sưởi.
- plain, stocking-03 tank: "cá thái lan (cá dĩa nhỏ hiền)" is wrong. Discus are large, demanding fish and not for beginners.
- plain, stocking-03 tank: Suggests molly for a 30 L tank. Mollies need a bigger tank.
- plain, stocking-03 tank: "cá thái lan (cá dĩa nhỏ hiền)": cá dĩa (discus) là cá khó, cần bể lớn, không phải cá cho người mới.
- plain, stocking-03 tank: Gợi ý cá vàng và cá chuột trong danh sách chung cho người mới không hợp với bể nhỏ khoảng 15 lít.
- ours, stocking-04 post: Gợi ý cá nuôi chung theo trang Stiphodon ornatus (bống cầu vồng): đây là loài khác hẳn bống vàng (Gyrinocheilus), nên danh sách cá nuôi chung không áp dụng được
- ours, stocking-04 post: Chỉ nói bống bám nhớt làm cá đĩa, ông tiên stress, lại coi việc không cho ăn là nguyên nhân đáng nghi hơn, trong khi bống vàng lớn bám mút nhớt bảy màu, kiếm, mún lúc đêm là nguyên nhân rất có thể
- ours, stocking-04 post: It points to the Stiphodon ornatus page for tankmates, but that is a different fish from cá bống vàng, so that tankmate list doesn't apply.
- ours, stocking-04 post: It notes the slime-latching itself but plays it down ('chưa thể khẳng định', 'không ghi cắn chết cá'), even though it is the most likely cause of the deaths.
- plain, stocking-04 post: Coi bống vàng là bống thường và cho rằng nó ăn cá con, tép: bống vàng (Gyrinocheilus) hại cá bằng cách bám mút nhớt chứ không săn mồi
- plain, stocking-04 post: Gợi ý nuôi chung lòng tong, neon, bạc má: bống vàng lớn vẫn bám mút nhớt được các loài cá nhỏ chậm này
- plain, stocking-04 post: Cho rằng bể không thay nước, nhưng người hỏi không hề nói vậy
- plain, stocking-04 post: Treats 'bống vàng' as a true goby, but the fish described is almost certainly the golden Chinese algae eater (cá mút đá). Calling the bống an unlikely cause misses the classic reason mollies, swordtails and guppies die off slowly with it: as it grows it latches onto them and sucks their slime coat.
- plain, stocking-04 post: 'Bể ... không thay nước' assumes something the hobbyist never said.
- plain, stocking-04 post: The tankmate list (cá lòng tong, neon, ...) is based on goby behaviour and doesn't warn about the slime-sucking.
- ours, stocking-04 tank: "Bể của bạn đã chạy lâu": this is assumed, not given in the tank details.
- ours, stocking-04 tank: "tạm ngưng hoặc giảm cho ăn": the hobbyist already doesn't feed, so this step doesn't apply to their tank.
- ours, stocking-04 tank: Claims old tank syndrome from built-up nitrate, but in a tank where the fish are never fed there is little waste to build up. The likelier causes are a tiny bacteria colony that can't handle the ammonia spike when new fish go in, and new fish starving because nobody feeds them.
- ours, stocking-04 tank: Assumes the tank has run for a long time, which the hobbyist never said
- plain, stocking-04 tank: It recommends bảy màu, mún and kiếm, the same fish that already died in this tank.
- plain, stocking-04 tank: "cá kiếm (platy)": platy is cá mún; cá kiếm is swordtail, which it then lists again as a separate fish.
- plain, stocking-04 tank: "cá hồng kim (neon tetra)": in Vietnam, hồng kim is a red swordtail/platy, not neon tetra.
- plain, stocking-04 tank: It suggests cá dĩa as a community fish for an unknown tank, which is not suitable advice.
- plain, stocking-04 tank: "1 inch per gallon" is an imported rule of thumb and is unreliable.
- plain, stocking-04 tank: "cá kiếm (platy)": cá kiếm là swordtail, platy là cá mún
- plain, stocking-04 tank: "cá hồng kim (neon tetra)": hồng kim là một dòng cá kiếm đỏ, không phải neon
- plain, stocking-04 tank: Recommends guppy, platy and swordtail, the exact fish that already died in this tank
- plain, stocking-04 tank: "ốc hương" is a marine snail and doesn't belong in a freshwater tank
- plain, stocking-04 tank: Uses the US rule of 1 inch per gallon, which doesn't fit how hobbyists keep tanks in Vietnam
- ours, stocking-05 post: "sổ tay không có trang riêng cho cá chép thường": this exposes the tool's internals and hedges, which weakens the answer.
- ours, stocking-05 post: Step 5 suggests the fish can live together long-term if the tank is big enough. It never clearly answers the hobbyist's question of whether they can be kept together.
- ours, stocking-05 post: Bước 5 vẫn ngầm cho rằng có thể nuôi chung lâu dài nếu bể đủ lớn, nên không trả lời dứt khoát câu hỏi "có nuôi chung được không".
- ours, stocking-05 post: Câu "sổ tay không có trang riêng" để lộ nguồn nội bộ, và thẻ loài koi cùng bài trích không liên quan nhiều đến cá chép thường.
- plain, stocking-05 post: "Cá chép thường hung hăng, hay rượt và cắn vây": this overstates it. Carp are not truly aggressive; mostly they are big, push other fish around and grab the food.
- plain, stocking-05 post: The bath of "3-5 g muối/lít trong 10-15 phút" is mixed up: that is the strength for a long soak, while a short dip is usually made stronger. It is not dangerous, but it is not quite right.
- plain, stocking-05 post: The forms of address switch between "Em xin lỗi" and "anh/chị", which reads awkwardly.
- plain, stocking-05 post: Câu "Cá chép thường hung hăng, hay rượt và cắn vây" nói quá: chép thường không hung dữ. Nhiều khả năng cá vàng bị hại vì chép to hơn, tranh ăn và húc phải.
- plain, stocking-05 post: Câu "nhu cầu môi trường... hơi khác nhau" không chính xác: chép và cá vàng cần nước gần như giống nhau.
- plain, stocking-05 post: Xưng hô lẫn lộn: mở đầu "Em xin lỗi" nhưng cuối bài lại xưng "anh/chị".
- ours, stocking-05 tank: "nếu là koi thì tách nó khỏi cá vàng ngay": a goldfish has already died and the carp is attacking, so they need separating now whether it is koi or common carp
- ours, stocking-05 tank: "cần khoảng 950 lít nước cho mỗi con": an oddly exact figure given with no source
- ours, stocking-05 tank: "nếu là koi thì tách nó khỏi cá vàng ngay": this suggests ordinary carp could stay, but a goldfish has already died, so the carp needs separating whatever the species.
- ours, stocking-05 tank: "Tôi chưa chắc chắn vì cẩm nang chưa có trang riêng": the answer talks about its own guide, which confuses the reader and makes the advice sound unsure.
- plain, stocking-05 tank: "muối (liều nhẹ)": gives no dose, so the reader can't actually use the salt treatment
- plain, stocking-05 tank: "Cho ăn đầy đủ để cá chép bớt tranh ăn": feeding more can foul the water in a crowded tank and doesn't reliably stop the aggression
- ours, stocking-06 post: "Mình chưa đọc phần thay nước định kỳ nên chưa có lịch cụ thể": it never answers the main question about weekly water changes in a smelly new tank.
- ours, stocking-06 post: Không trả lời câu hỏi chính về thay nước hàng tuần ('chưa có lịch cụ thể'), dù đây là việc cơ bản cần làm ngay khi nước có mùi hôi.
- plain, stocking-06 post: "Em nhớ là...": the pronouns are muddled, since it calls the reader 'em' and also uses 'em' for itself. Minor.
- plain, stocking-06 post: Suggests 'bèo tây' (water hyacinth) as fry cover. It's a large floating plant that doesn't suit a small cubic tank. Minor.
- plain, stocking-06 post: Gợi ý 'bèo tây' làm chỗ trốn: bèo tây (lục bình) quá to, không hợp với bể cubic nhỏ; nên dùng bèo nhỏ hoặc rêu.
- ours, stocking-06 tank: Says it can't confirm whether weekly water changes are needed. That leaves half the question unanswered, even though weekly partial changes are standard advice.
- ours, stocking-06 tank: 'Cám dỗ lớn nhất là bể mới' is muddled, unnatural wording.
- ours, stocking-06 tank: The attached excerpt is from a guppy (cá bảy màu) guide, not a platy guide, and the species card's 'đàn từ 6 con' doesn't help with this question.
- ours, stocking-06 tank: Không trả lời câu hỏi thay nước ('chưa xác nhận được'), dù với bể mới đang có mùi hôi thì thay nước định kỳ là câu trả lời cơ bản và chắc chắn đúng.
- ours, stocking-06 tank: 'Cám dỗ lớn nhất là bể mới' là câu tối nghĩa, không có ý gì rõ ràng.
- ours, stocking-06 tank: Thẻ loài ghi 'đàn từ 6 con' là không cần thiết với cá mún, còn trích đoạn lại lấy từ bài về cá bảy màu.
- plain, stocking-06 tank: Doesn't link the bad smell in the newly set-up tank to an uncycled tank or waste buildup. In this tank, the ammonia/nitrite warning should come first.
- plain, stocking-06 tank: Nói 'Thường khi thấy vậy thì còn khoảng 1–2 ngày': đốm thai sẫm màu không cho biết chắc ngày đẻ, nên con số này chính xác giả.
- ours, stocking-07 post: Reads 'sóc đỏ' as Aborichthys elongatus, a cold-water loach that needs 15–21 °C and is rarely sold in VN. Vietnamese hobbyists usually mean 'sóc đầu đỏ' (rummy nose tetra).
- ours, stocking-07 post: '6 con neon' is far too few for about 76 L. That tank holds 20+ neon comfortably.
- ours, stocking-07 post: Puts a semi-aggressive fin-nipper with neon and doesn't warn that the two need very different temperatures.
- ours, stocking-07 post: Hiểu 'sóc đỏ' là chạch sóc đuôi đỏ (Aborichthys elongatus): người chơi ở VN không gọi loài này như vậy, và đây là cá suối nước lạnh
- ours, stocking-07 post: Khuyên thả chung với neon dù thẻ cá ghi 15–21°C, không hợp với neon và nhiệt độ nước ở VN
- ours, stocking-07 post: "khoảng 6 con neon" cho bể 84 lít là quá ít, chỉ bằng mức đàn tối thiểu
- plain, stocking-07 post: Reads 'sóc đỏ' as Corydoras. That is not the usual Vietnamese meaning: it most likely means rummy nose tetra (sóc đầu đỏ). Y does at least ask the reader to confirm the species.
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": ở Việt Nam Corydoras thường gọi là cá chuột; 'sóc đỏ/sóc đầu đỏ' thường chỉ cá sóc đầu đỏ (rummy nose) hoặc loài cá đàn nhỏ tương tự, nên lời khuyên về nền cát và râu không đúng loài
- ours, stocking-07 tank: 'neon xanh cần 21–25°C': neon tetra is normally kept at about 22–27°C, so this range is too narrow and too low
- ours, stocking-07 tank: 'chạch cần 15–21°C': this is cold-water advice that a tank in Vietnam's heat can't hold without a chiller, and it shouldn't be pushing neons down to 21°C
- ours, stocking-07 tank: '6 neon và 6 chạch ở mức 79%': an 84-litre tank holds well over 6 neons, so this figure badly understates how many it can take
- ours, stocking-07 tank: Khoảng nhiệt của chạch '15–21°C' và của neon '21–25°C' đáng ngờ và quá hẹp (neon chịu được khoảng 20–26°C). Câu trả lời cũng bỏ qua việc bể ở Việt Nam thường 27–30°C, nên khuyên 'giữ khoảng 21°C' là không thực tế
- ours, stocking-07 tank: '6 neon và 6 chạch đã đầy 79%' với bể 84 lít là quá dè dặt, thực tế bể này chứa được nhiều neon hơn hẳn
- plain, stocking-07 tank: 'khoảng 10 con cho mỗi 20 lít': a made-up rule that leads to overstocking
- plain, stocking-07 tank: Takes 'sóc' to mean Corydoras, which Vietnamese hobbyists call 'cá chuột', so the species is wrong
- plain, stocking-07 tank: Assumes the tank is 60 litres when it is about 84 litres, and brings in red shrimp, which nobody asked about
- plain, stocking-07 tank: Gọi Corydoras là 'cá sóc': ở Việt Nam người chơi gọi Corydoras là 'cá chuột'
- plain, stocking-07 tank: '10 con cho mỗi 20 lít': quy tắc tự đặt ra, không có cơ sở
- plain, stocking-07 tank: Đoán bể 60 lít trong khi bể thật khoảng 84 lít, và còn hỏi lại dung tích dù ứng dụng đã có số đo
- ours, stocking-08 post: "thay khoảng một phần nước" quá mơ hồ khi bể đang dư cá và có ammonia, không nói rõ thay bao nhiêu phần trăm
- ours, stocking-08 post: "trừ khoảng 10% thể tích cho cây" là chi tiết rườm rà, không giúp gì cho bể 4 lít
- plain, stocking-08 post: "3-4 con nếu là loài nhỏ (neon...)": neon cần bể lớn hơn và sống theo đàn, nên không hợp với bể 4 lít
- plain, stocking-08 post: "máy sưởi mini có điều nhiệt": ở khí hậu nóng của Việt Nam thường không cần sưởi, chỉ có thể cần vào mùa đông miền Bắc
- plain, stocking-08 post: "máy sưởi mini có điều nhiệt" là gợi ý ít cần thiết ở Việt Nam vì khí hậu nóng; với bể 4 lít, nhiệt độ quá cao vào mùa hè mới là rủi ro lớn hơn
- ours, stocking-08 tank: "bể lớn hơn, khoảng 115-210 lít": con số không có lý do, quá lớn so với 7-8 con cá nhỏ; nghe như số bịa ra
- ours, stocking-08 tank: "Đo ammonia, nitrite và nitrate sau mỗi 2-3 tuần": bể mới chạy 1 tuần lại nuôi quá dày thì phải đo hằng ngày hoặc cách ngày và thay nước thường xuyên. Câu trả lời không nhắc thay nước, cũng không nói bể chưa qua chu trình nitơ
- ours, stocking-08 tank: "bể lớn hơn, khoảng 115-210 lít": the figure looks made up and is far bigger than a few small fish need, so it isn't realistic advice for someone moving them out of a 4 L tank
- ours, stocking-08 tank: "Đo ammonia, nitrite và nitrate sau mỗi 2-3 tuần": the tank has only run for 1 week and is overloaded, so it needs testing every day or two plus frequent partial water changes, not every 2-3 weeks
- ours, stocking-08 tank: It doesn't point out that a 1-week-old tank hasn't finished cycling, which makes the overload risk much worse
- ours, stocking-09 post: "cá ông tiên nên nuôi từ 6 con": cá ông tiên không phải cá đàn. Nuôi từ 6 con chỉ là cách để cá non tự ghép đôi; nuôi 1 cặp là chuyện bình thường.
- ours, stocking-09 post: "bể 80 × 35 × 45 cm của bạn chưa đủ": bể khoảng 126 lít, cao 45 cm, vẫn nuôi được một cặp ông tiên.
- ours, stocking-09 post: Bác bỏ hẳn "Không nên nuôi chung" là quá cứng nhắc. Ông tiên và neon là combo kinh điển, chỉ có rủi ro khi ông tiên lớn hẳn mà neon còn nhỏ.
- ours, stocking-09 post: 'cá ông tiên nên nuôi từ 6 con': sai với thực tế, ông tiên thường nuôi theo cặp. Nuôi đàn chỉ là cách để chúng tự ghép đôi lúc còn nhỏ, trong bể lớn.
- ours, stocking-09 post: 'bể 80×35×45 chưa đủ' cho 2 con: một cặp ông tiên trong bể khoảng 126 lít là cách nuôi rất phổ biến.
- ours, stocking-09 post: 'Mức đầy bể 84%': con số có vẻ máy móc, không nói rõ cơ sở.
- plain, stocking-09 post: Nói 'có thể nuôi chung được' hơi chủ quan: ông tiên trưởng thành rất hay ăn neon, nhất là neon nhỏ ở VN hay bán. Có nhắc rủi ro nhưng giọng vẫn quá yên tâm.
- ours, stocking-09 tank: "cá ông tiên nên nuôi theo đàn từ 6 con": cá ông tiên không bắt buộc nuôi đàn 6 con. Nuôi 6 con trong bể 80 cm còn dễ đánh nhau hơn, còn 1 cặp là chuẩn.
- ours, stocking-09 tank: "cần bể dài từ 100 cm... bể chưa đủ": bể 80×35×45 khoảng 126 lít và cao 45 cm, đủ cho 2 con ông tiên.
- ours, stocking-09 tank: Mức đầy bể 84% bị tính quá cao vì dựa trên quy tắc nuôi đàn sai.
- ours, stocking-09 tank: "cá ông tiên nên nuôi theo đàn từ 6 con": angelfish are often kept as a pair, and 6 adults in an 80 cm tank would be badly overstocked
- ours, stocking-09 tank: "cần bể dài từ 100 cm": too strict. An 80×35×45 tank (~126 L, tall) is commonly used for one pair of angelfish
- ours, stocking-09 tank: "Không nên nuôi chung": this is a very common combo in Vietnam. The neons need to be added first, before the angelfish are full-grown, but a flat no is overly cautious. The tool also shows a mixed message with 84% 'Vừa phải'.
- plain, stocking-09 tank: "Nếu bể nhỏ hơn 80 lít thì nên cân nhắc lại" mâu thuẫn với mức tối thiểu 100 lít nêu ở trên.
- plain, stocking-09 tank: Nói hơi nhẹ nguy cơ ông tiên lớn ăn neon. Rủi ro này khá thực tế.
- plain, stocking-09 tank: "Nếu bể nhỏ hơn 80 lít thì nên cân nhắc lại" contradicts its own 100-litre minimum a few lines earlier
- ours, stocking-10 post: "cá betta hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài" — nói quá. Trong bể 60 cm (~65 lít) có trồng cây, một con betta đực thường sống chung được với đàn neon. Rủi ro tùy tính từng con, không phải lúc nào cũng phải nuôi riêng.
- ours, stocking-10 post: Bước 2 và 3 lòng vòng ("nên cân nhắc lại", "kiểm tra thêm kích thước"), người nuôi đọc xong vẫn không biết làm gì.
- ours, stocking-10 post: "betta hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài": too sweeping. A single betta with a group of neon in a planted 65 L tank is a common setup that often works, with monitoring.
- ours, stocking-10 post: "Mức đầy bể khoảng 36%": a stocking figure given with no basis or explanation.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon" — neon đã có sẵn trong bể nên lời khuyên này không áp dụng được. Thông thường người ta còn thả betta sau cùng để nó bớt giữ lãnh thổ.
- plain, stocking-10 post: Khuyên dùng máy sưởi là chuyện thường không cần ở Việt Nam. Ở đây nước hay bị nóng quá vào mùa hè chứ ít khi lạnh, mà câu trả lời lại không nhắc đến chuyện này.
- plain, stocking-10 post: Không nhắc rằng neon đôi khi rỉa vây dài của betta.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon": the neon are already in the tank, so this doesn't apply. The usual advice is also the opposite: add the betta last so it doesn't claim territory.
- plain, stocking-10 post: Says a heater is usually reasonable for 24–27°C, but in most of Vietnam tank water is already warm enough without one, except in winter in the north.
- ours, stocking-10 tank: "thêm 1 con betta vào bể đang có 12 cá neon xanh là không phù hợp" — too absolute: a single betta with a neon school in a ~65 L tank is a common setup that often works, as long as you watch for fin-nipping or chasing.
- ours, stocking-10 tank: "Mức đầy bể: 36%" — an exact stocking figure with no stated basis.
- ours, stocking-10 tank: "thường phải nuôi riêng hoặc bể chỉ một loài": too strict. One betta with a school of neons in a ~65 L planted tank is often kept successfully if you watch for fin-nipping and chasing.
- ours, stocking-10 tank: "36%" stocking figure is presented without explaining how it was calculated.
- plain, stocking-10 tank: It assumes the tank already has a betta ("đặc biệt nếu bể đang có một con betta đực") and asks for the tank size, even though the tank details were available.
- plain, stocking-10 tank: "từ 80 lít trở lên" — a figure with no stated source, and it doesn't relate to this tank.
- plain, stocking-10 tank: Assumes the tank already has a betta. It has 12 neon tetras and no betta.
- plain, stocking-10 tank: "cá tế bào (cá neon, cá rasbora)": 'tế bào' (cell) is a mistranslation of tetra. Vietnamese hobbyists don't call them that.
- plain, stocking-10 tank: Asks for the tank size and current fish, which the app already holds.
- ours, algae-12 post: "dùng phân nền giàu dinh dưỡng": the hobbyist never said they use a nutrient-rich substrate. X assumes it and builds its whole diagnosis on it.
- ours, algae-12 post: Refuses to answer the split-light question ("chưa có căn cứ để trả lời"), even though that is what the hobbyist asked and the photoperiod is a real factor.
- ours, algae-12 post: "dùng phân nền giàu dinh dưỡng" — người hỏi không hề nói dùng phân nền; cây của họ đều buộc lên đá/lũa, nên cả chẩn đoán dựa vào việc nền nhả phosphate là đoán không có căn cứ.
- ours, algae-12 post: Không trả lời được câu hỏi chính về chia đèn ("chưa có căn cứ"), và bỏ qua việc giảm số giờ đèn ở bể không CO2.
- plain, algae-12 post: "châm phân theo liều thấp hơn hoặc giảm tần suất": they already dose only once a week, so cutting further could make GSA worse if phosphate is low. The test-kit caveat only partly makes up for this.
- plain, algae-12 post: "châm phân theo liều thấp hơn hoặc giảm tần suất" — nếu đốm là GSA, thiếu phosphate thường là một nguyên nhân, nên giảm phân có thể làm nặng thêm.
- ours, algae-12 tank: "thay nước 1 lần mỗi tuần": the tank record shows liquid fertiliser once a week, not a water change, so X misread the data
- ours, algae-12 tank: "Cẩm nang ghi rằng ... nên bật khoảng 8 tiếng và chia 2 lần mỗi ngày": the excerpt shown gives 8–12 hours and doesn't say to split into 2 sessions, so the attribution looks overstated
- ours, algae-12 tank: "thay nước 1 lần mỗi tuần": the tank data says liquid fertiliser once a week, not a water change, so Y misread it
- plain, algae-12 tank: "giúp cá và cây đỡ căng thẳng hơn": there's no good evidence that a midday break reduces stress for fish or plants

## Failed

- setup-05 post: ours Request timed out.
- setup-07 tank: ours Request timed out.
- sick-05 post: ours Request timed out.

## Each question

### algae-01 · post · plain wins (4 · 7)

**Asked:** Bể em mới set được hơn 2 tuần mà đã có chút rêu tóc trên lá bucep và nmc. Em dùng đèn Flat One treo cách mặt nước 20cm, lúc đầu để chế độ giả lập ánh sáng mặt trời, giờ em hạ xuống còn 7 tiếng chạy một mạch không ngắt quãng. Cứ 2 hôm em thay 30% nước một lần, có cho Seachem khử clo, Advance và thuốc khử rêu. Em mới châm thêm 2 lọ phân nước ADA là Brighty K và Green Brighty Mineral vì thấy nmc bị trắng lá, chỉ có ít lá xanh mọc từ dưới lên. Em làm vậy có sai không, rêu tóc này xử lý sao ạ?

**Judge:** Y goes through each thing the hobbyist did: the strong light, the algaecide that can hurt bucep and NMC, the ADA fertiliser added without testing, and how to remove the algae now. It also gives NO₃ and PO₄ figures. X mostly asks back about CO₂, spends words on what its guide does and doesn't cover, and skips the light intensity and the algaecide. / X tìm đúng nguyên nhân chính: đèn Flat One treo 20 cm quá mạnh cho bể mới 2 tuần. X cũng bảo ngừng thuốc diệt rêu, test NO₃/PO₄ trước khi châm phân, và có cách gỡ rêu cụ thể. Y bỏ qua cường độ và độ cao của đèn, lại khẳng định 7–8 tiếng là ổn. Y còn khuyên ngừng phân khi cây có dấu hiệu thiếu dinh dưỡng, và nhắc tới việc chưa đọc cẩm nang khiến người đọc mất tin tưởng.

**Ours lacks:** tank-fit, diagnosis, too-thin, figures. **Plain lacks:** follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Rêu tóc ở bể mới set hơn 2 tuần là chuyện hay gặp. Theo cẩm nang, nguyên nhân phổ biến nhất là thiếu CO2, rồi đến bể còn non, phân thừa hoặc thiếu, và đèn quá mạnh. Với 7 tiếng đèn, cách làm của bạn hiện không phải là sai, vì cẩm nang khuyên khoảng 8 tiếng và chỉ cảnh báo khi bật trên 10 tiếng. Điều cần biết trước là bể có châm CO2 hay không. Tôi chưa đọc được phần cẩm nang về liều phân và về đèn chi tiết, nên phần dưới đây chỉ dựa trên những gì đã đọc. Việc thêm 2 lọ phân lúc này là điều cần cân nhắc, vì phân thừa cũng có thể làm rêu tóc mọc. Lá trắng và chỉ mọc vài lá xanh từ gốc có thể do …

**Plain** (2410 characters):

> Bể mới 2 tuần mà có rêu tóc là khá phổ biến, và nguyên nhân thường là **ánh sáng quá mạnh, quá dài so với độ ổn định của bể**. Có vài điểm em nên điều chỉnh.
> 
> **1. Ánh sáng (nguyên nhân chính)**
> - Flat One treo 20 cm ở chế độ giả lập nắng là cường độ khá cao. Bể mới chưa ổn định về CO₂ và dinh dưỡng nên rất dễ bị rêu.
> - 7 tiếng liên tục vẫn hơi dài. Em nên:
>   - Hạ cường độ xuống khoảng 50–60% trong vài tháng đầu.
>   - Chạy 6–7 tiếng, hoặc chia 2 đợt (ví dụ 4 tiếng sáng + 2 tiếng chiều) để tránh đỉnh sáng quá lâu.
> - Lá nmc bị trắng có thể là dấu hiệu ánh sáng quá mạnh (bị cháy/bạc lá) kết hợp t…

### algae-01 · tank · plain wins (4 · 5)

**Asked:** Bể mới set của tôi đã có rêu tóc bám lên lá cây, xử lý sao?

**Judge:** Neither answer used the tank details: 7h of light, newly added ADA fertilisers, and the algae remedy that may be turning the ngưu mao chiên white. Y is better because it gives more usable steps (cut light to 6–8h, cut back fertiliser, spot-dose H₂O₂, add fast-growing plants). X suggests longer light hours and an invented 90% figure. / Cả hai câu trả lời đều không dùng thông tin bể của họ: bể mới 2 tuần, đèn Flat One bật 7 tiếng, đang dùng thuốc khử rêu, nmc bị trắng lá, vừa châm Brighty. X tổng quát nhưng an toàn hơn: khuyên giảm đèn, giảm phân, gỡ rêu bằng tay. Y lại khuyên bật đèn 8–10 tiếng, tức là tăng sáng cho một bể đang lên rêu tóc, và đưa ra con số 90% không có cơ sở.

**Ours lacks:** tank-fit, diagnosis, wrong. **Plain lacks:** tank-fit, too-long.

**Ours** (read 6 pages, stopped at the tools limit):

> Bể mới set thường lên rêu tóc trong vài tuần đầu. Nguyên nhân khả dĩ nhất là cây mới trồng chưa ra rễ nên ăn ít, dinh dưỡng dư còn lại trong nước, cộng với đèn bật quá lâu. Cẩm nang chưa biết bạn có châm CO2 hay bật đèn bao nhiêu giờ, nên đây là suy đoán từ những gì bạn kể, độ chắc chắn vừa phải.
> 1. Kiểm tra giờ đèn: tổng khoảng 8 đến 10 tiếng mỗi ngày, mỗi đợt không quá 4 tiếng. Nếu đang bật trên 10 tiếng thì hẹn giờ về khoảng 8.
> 2. Trong hai tuần đầu, thay 30 đến 50% nước mỗi ba ngày để kéo dinh dưỡng dư xuống.
> 3. Gỡ rêu bằng tay: xoay bàn chải đánh răng trong đám rêu, sợi rêu quấn vào lông…

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

### algae-02 · post · plain wins (4.5 · 7)

**Asked:** Mình có hồ 70x30x40, cây chủ yếu là ráy và rêu. Đang dùng đèn Chihiros A601 plus mà bị rêu chùm đen, dù hồ không nền và hơn tuần nay không châm phân. Mình tính thay đèn, nên chọn đèn nào cho bể này?

**Judge:** Y is better. It names the likely cause: the A601 Plus is too strong for slow-growing anubias and moss. It also gives concrete fixes (6–7 hours, 40–60% intensity, floating plants) before any talk of replacing the light. X assumes CO₂ is injected and gives a lumen target that would push toward an even brighter light. / X đúng chỗ: ráy và rêu là cây ưa sáng yếu, mà A601 Plus thì khá mạnh. X cho bước cụ thể (bật đèn 6–7 giờ, giảm cường độ xuống 40–60%, cọ rêu, châm phân, thay nước) và gợi ý hướng chọn đèn, dù vài lựa chọn đèn và cây nổi chưa đúng. Y đổ lỗi chính cho thiếu phân và CO₂, mặc định là hồ có châm CO₂, cho bật đèn tới 10 tiếng và chỉ đưa quy tắc lumen cũ thay vì nói nên chọn đèn nào.

**Ours lacks:** diagnosis, tank-fit, figures. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Rêu chùm đen trên ráy và rêu thường là BBA. Với bể không nền và hơn một tuần chưa châm phân, nhiều khả năng cây đang thiếu dinh dưỡng và CO2 chưa cân bằng với đèn, nên cây yếu và rêu dễ bám. Mình chỉ chắc ở mức trung bình, vì cẩm nang không nói bạn đang châm CO2 bằng cách nào.
> 1. Test nitrat, phosphat và sắt trong nước để biết dinh dưỡng đang thấp đến đâu.
> 2. Châm lại phân nước với liều nhẹ, đều đặn, theo nhãn sản phẩm, vì bể không nền không có nguồn dinh dưỡng dự trữ.
> 3. Kiểm tra CO2 có ổn định suốt thời gian bật đèn không, tránh lên xuống trong ngày.
> 4. Giữ đèn khoảng 8 tiếng mỗi ngày, khôn…

**Plain** (2238 characters):

> Với hồ 70x30x40 (khoảng 84L) trồng ráy và rêu, mình nghĩ **bạn chưa cần thay đèn ngay**. Rêu chùm đen (BBA) thường xuất hiện khi ánh sáng quá mạnh hoặc kéo dài so với khả năng hấp thụ dinh dưỡng và CO₂ của cây, và ráy với rêu vốn là nhóm cây ưa ánh sáng thấp đến vừa.
> 
> **Nguyên nhân có khả năng nhất:**
> - **Cường độ hoặc thời gian chiếu sáng quá mức.** A601 Plus khá mạnh cho hồ 70cm, nhất là khi hồ không có nền và cây ít sinh trưởng.
> - **Cây không tăng trưởng đủ để cạnh tranh.** Ráy chậm lớn nên không hấp thụ hết dinh dưỡng, và rêu chùm đen tận dụng phần dư đó.
> - **Lịch chiếu sáng không ổn định…

### algae-02 · tank · ours wins (6.5 · 5)

**Asked:** Bể của tôi bị rêu chùm đen dù không châm phân, có phải do đèn không?

**Judge:** X gives the likely cause for this exact setup: a strong Chihiros A601 Plus with no CO₂ over slow-growing ráy and rêu. Its steps are targeted, but it leaves out light hours and doesn't warn about H₂O₂ on the moss. Y gives useful figures (6–8 hours of light, 20–30% water changes) and suggests floating rong đuôi chó, but it's a generic list that ignores this tank and asks for details the app already has. / Y points to the strong Chihiros A601 Plus over a tank of only slow-growing ráy and moss as the likely cause, then gives steps in order and a 1–2 week check. It doesn't give a target number of light hours. X is a generic checklist that ignores the tank's details and uses an odd local name for the fish.

**Ours lacks:** figures, tank-fit. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 4 pages):

> Đèn là nghi phạm chính, nhưng chưa chắc là thủ phạm duy nhất. Bể không châm phân nên thiếu dinh dưỡng thường không phải nguyên nhân. Cẩm nang cho biết rêu chùm đen (BBA) hay do CO2 thiếu hoặc dao động, chất thải hữu cơ tích nhiều, hoặc đèn quá mạnh so với bể khi không châm CO2. Đèn Chihiros A601 Plus khá mạnh, nên nếu bể không châm CO2 thì ánh sáng là điều đáng nghi nhất. Tôi chưa biết bạn có châm CO2 không và đèn bật bao nhiêu giờ, nên đây là suy đoán có độ chắc vừa phải.
> 1. Giảm cường độ đèn hoặc rút ngắn số giờ bật đèn, rồi theo dõi.
> 2. Nếu bể không châm CO2, để sẵn carbon nước và oxy già …

**Plain** (1709 characters):

> Đèn **có thể là một nguyên nhân**, nhưng thường không phải là nguyên nhân duy nhất. Rêu chùm đen (BBA) thường xuất hiện khi có nhiều yếu tố cùng lúc.
> 
> **Các nguyên nhân thường gặp:**
> 
> 1. **Đèn quá mạnh hoặc bật quá lâu:** Cường độ sáng cao hoặc thời gian chiếu trên 8-10 giờ/ngày rất dễ kích rêu phát triển, đặc biệt khi CO2 không ổn định.
> 2. **CO2 thiếu hoặc dao động:** Nếu bể trồng cây có đèn mạnh mà CO2 thấp hoặc không đều, cây phát triển kém và rêu có lợi thế cạnh tranh.
> 3. **Dinh dưỡng vẫn có, dù không châm phân:** Thức ăn thừa, chất thải của cá, và phốt phát/nitrat trong nước máy đều là n…

### algae-03 · post · ours wins (7 · 3)

**Asked:** Mình mới chơi, hồ đầu tiên trồng trân châu ngọc trai, vừa set được 3 ngày. Từ 2 hôm trước nước chuyển xanh, mình nghi là rêu nước xanh. Mình thay 30% nước thì hôm sau nước còn xanh hơn. Hôm nay mình tháo bớt 1 bóng của đèn Odyssea dual, chỉnh timer từ 7 tiếng xuống 4 tiếng và thay bông lọc. Có nên tiếp tục thay nước mỗi ngày không? Đèn như vậy có dư không hay nên tắt luôn vài ngày?

**Judge:** X đoán đúng nguyên nhân: phân nền mới đang nhả dinh dưỡng, cộng với đèn bật lâu. X đưa ra các bước rõ ràng (che tối, ngưng châm phân, thay nhiều nước sau khi nước trong) và dặn theo dõi amoniac. Y nhầm đèn Odyssea là đèn UV, khuyên ngưng thay nước dù bể có phân nền mới, lại không biết trân châu ngọc trai là cây thủy sinh. / Y nói đúng nguyên nhân: phân nền đang nhả dinh dưỡng, cộng với đèn 7 tiếng, làm tảo nước xanh bùng lên. Y đưa ra các bước rõ ràng theo thứ tự và dặn những gì cần theo dõi. X tưởng đèn chiếu sáng là đèn UV, khuyên bật đèn nhiều hơn và ngừng thay nước, nên làm theo X sẽ hại hồ.

**Ours lacks:** tank-fit. **Plain lacks:** wrong, tank-fit, diagnosis, asks-only.

**Ours** (read 5 pages, stopped at the tools limit):

> Nhiều khả năng đây là tảo phù du nở rộ (nước xanh) chứ chưa phải rêu bám, vì cả khối nước đục xanh. Bể mới 3 ngày, phân nền đang nhả nhiều dinh dưỡng mà cây chưa kịp ăn, lại bật đèn 7 tiếng, nên tảo sinh sản nhanh. Thay 30% chỉ loãng đi tạm thời rồi tảo mọc lại ngay, nên nước càng xanh. Mình khá chắc về nguyên nhân, nhưng chưa rõ amoniac và nitrat của bể nên cần kiểm tra thêm.
> 1. Giữ đèn 4 tiếng như bạn vừa chỉnh, dời bể khỏi chỗ có nắng chiếu vào, và tạm ngưng châm phân nước.
> 2. Tắt đèn và che kín bể khoảng 3 đến 5 ngày để nước trong dần; lọc và sủi vẫn chạy. Cẩm nang cho phép che tối tối đa…

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

**Judge:** Cả hai đều khuyên tắt đèn trước, nhưng đều bỏ qua việc người hỏi đã giảm đèn còn 4 giờ và đã thay bông lọc (mất vi sinh). Y nhỉnh hơn: che tối 3–5 ngày an toàn hơn cho trân châu ngọc trai, có giải thích vì sao thay nước xong lại xanh hơn, và gợi ý thả bèo hay cây mọc nhanh để giành dinh dưỡng với tảo. X thì khuyên bắt cá ra bể tạm, một bước không cần thiết. / Both answers rightly say to black out first and change water second, and neither uses the tank's details: the 4h light, the trân châu carpet, or the filter wool they just replaced. Y is the better pick because its steps are in order, it explains why the 30% water change made the water greener, it covers window sun (a real issue in Vietnam), and it says what to watch for, although moving the fish out is unnecessary.

**Ours lacks:** tank-fit, follow-up. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 5 pages):

> Nên tắt đèn (hoặc che tối) trước, thay nước chỉ là bước sau. Với bể mới vài ngày, nước xanh thường do tảo phù du nở rộ vì thừa sáng hoặc thừa dinh dưỡng, và bể chưa chạy vi sinh nên amoniac có thể tăng. Ccẩm nang nói rõ thay nhiều nước một lần không hết xanh vì tảo sinh sản rất nhanh và mọc lại ngay.
> 1. Tắt đèn bể hoặc che kín bể, để lọc và sủi chạy bình thường. Cẩm nang cho che tối tối đa 7 ngày; nếu có đèn UV thì dùng đèn UV, thường khoảng 2 đến 3 ngày là thấy đổi.
> 2. Dời bể khỏi chỗ nắng chiếu trực tiếp hoặc nắng hắt từ cửa sổ, và sau này chỉ bật đèn khoảng 6 đến 8 giờ mỗi ngày.
> 3. Không c…

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

### algae-04 · post · tie or split (6 · 6.5)

**Asked:** Mình chơi hồ 60x40x40 theo kiểu Hà Lan, dùng 2 cây đèn trắng Aquablue, 1 cây dài 60cm và 1 cây 45cm, vậy có bị dư sáng không? Hồ mới set được 7 ngày mà tảo nâu phát triển nhiều quá, CO2 và dinh dưỡng thì tương đối ổn định, mỗi ngày thay 30% nước kèm vệ sinh hồ, vậy mà rêu nâu cứ bám hoài trên đá và mặt kính. Hồ mình đang bị gì, nên làm sao?

**Judge:** Y is the better answer. It answers the lighting question directly and realistically, and it links the brown algae to silicate brought in by the daily tap-water changes. It gives a clear lighting schedule and adds Nerite snails, which are easy to buy in Vietnam. X probably overstates the light problem, never questions the daily water changes, and has awkward 'handbook/video' references. / Y giữ lịch thay nước nhiều, giảm sáng và tạm ngưng phân N/P, thêm cây và vi sinh từ bông lọc cũ. Hướng này đúng với cách xử lý tảo cát ở hồ mới. X thì trình bày gọn và có nói đến silicate trong nước máy, nhưng lại khuyên giảm thay nước xuống mỗi tuần một lần và nói thay nước làm hỏng hệ vi sinh, mà điều này không đúng.

**Ours lacks:** tank-fit, local, too-long. **Plain lacks:** follow-up, wrong.

**Ours** (read 6 pages, stopped at the tools limit):

> Hồ của bạn đang bị tảo cát (tảo silic nâu), loại rêu nâu thường gặp trong vài tuần đầu sau khi set. Nguyên nhân khả dĩ nhất là hai đèn trắng đang chiếu mạnh trong khi bể mới chưa trưởng thành sinh học, kết hợp với dinh dưỡng và CO2 đang chạy đều. Handbook ghi rõ: bể mới set có đèn mạnh đi kèm dinh dưỡng cao thì tảo cát bùng lên, và ở bể mới đèn mạnh làm tảo phát triển nhanh hơn hẳn. Tôi chưa biết cường độ thực tế của hai đèn nên chưa khẳng định được có dư sáng hay không, nhưng khả năng cao là có. Cách làm trong cẩm nang: 1. Hạ đèn xuống khoảng 50% và chỉ bật khoảng 5 tiếng mỗi ngày trong tuần…

**Plain** (2537 characters):

> # Tảo nâu trong hồ mới là khá phổ biến
> 
> Lớp nâu bám trên đá và kính thường là **tảo silic (diatom)**. Nếu lau bằng tay thì bong ra dễ dàng, đó là dấu hiệu nhận biết. Tảo nâu hay xuất hiện trong 2-8 tuần đầu của hồ mới, vì lúc này hệ vi sinh chưa ổn định, cây chưa hấp thụ hết dinh dưỡng, và nước thường giàu **silicate**.
> 
> ## 1. Có bị dư sáng không?
> 
> Với hồ khoảng 96L và 2 đèn (60cm + 45cm) thì **cường độ ở mức trung bình-khá**, chưa phải là quá dư, nhất là với kiểu Hà Lan vốn cần sáng tương đối. Tuy nhiên, trong giai đoạn mới set, **thời gian bật đèn** mới là yếu tố dễ gây tảo:
> - Nên bật **6-7…

### algae-04 · tank · tie or split (5.5 · 5)

**Asked:** Bể mới set một tuần bị tảo nâu bám kín đá và kính, làm sao?

**Judge:** Both answers correctly say this is diatoms in a new tank and that they usually clear up on their own. X is shorter and uses the guide, but cutting the light to 2–3 hours would harm a Dutch-style tank running CO₂. Y is more generic and wordier and makes a small mistake about carbon, but its 6–8 hours of light and its manual cleaning steps are safe. / Y explains clearly that brown algae in a new tank will clear up on its own, gives steps in order that take fertiliser and plant care into account, and shows a guide excerpt that adds useful advice (old filter media, more plants). Its main flaw is cutting the light to 2–3 hours, which is too much for this tank. X is generic and contains errors (carbon removing silicate, Trochus snails). It suggests weekly water changes when they already change water every day, and it asks for information the app already has.

**Ours lacks:** tank-fit, wrong, figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 5 pages):

> Bể mới một tuần mà tảo nâu (tảo silic) phủ kính và đá là chuyện rất thường gặp, vì hệ vi sinh trong bể chưa ổn định và đèn bật lâu làm tảo lan nhanh. Cẩm nang cho biết loại tảo này thường tự hết sau 4–6 tuần khi bể ổn định, nên bạn không cần diệt gấp. Bạn có thể làm như sau:
> 1. Giảm đèn xuống còn 2–3 tiếng mỗi ngày (bình thường là 6–8 tiếng) cho đến khi tảo bớt.
> 2. Thả ốc Nerita hoặc cá bống vàng để mút tảo nâu; khi bể sạch thì chuyển bớt quân dọn sang bể khác.
> 3. Trong lúc tảo còn nhiều, thay khoảng 30% nước 2 ngày một lần và hút các mảng tảo lớn bằng tay khi thay nước.
> 4. Châm phân nhẹ, trá…

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

### algae-05 · post · plain wins (4.5 · 7.5)

**Asked:** Em set bể Hà Lan được gần 1 tháng, đèn mới lên 8h/ngày (10h sáng đến 18h), cây phát triển rất tốt, không có rêu hại. Phía trước dưới nền em trồng rau thơm. Nhưng ở mặt kính phía dưới, chỗ giáp nền, có tảo nâu bám kính và một chút tảo nhớt xanh, có phải do đèn trong nhà buổi tối hắt vào bể không? Bucep em buộc giá thể thả vào được 1 tuần cũng có tảo nâu trên lá. Em thay nước đều 2 ngày 1 lần. Em có thả ốc nerita nhưng nó chỉ nằm im không bò, kiểm tra thì vẫn sống. Xử lý tảo nâu với rêu nhớt sao ạ?

**Judge:** Y gets the light right (6–7 hours), gives the standard BGA fix (siphon, 2–3 day blackout, more flow at the bottom, less feeding), and explains why the Nerita is still. X tells them to cut the light to 2–3 hours, which hurts the plants, and reaches for an antibiotic too early. / X gets the cause right (brown diatom algae and blue-green slime in a new tank), cuts the light to a sensible 6–7 hours, suggests a 2–3 day blackout for the green slime, more water flow near the bottom, Amano shrimp, and explains the Nerita snail. Y says to cut the light to 2–3 hours a day, which would hurt the plants.

**Ours lacks:** wrong, follow-up. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể mới set khoảng một tháng thường có tảo nâu, vì hệ vi sinh chưa ổn định. Cẩm nang nói mức độ phụ thuộc chủ yếu vào thời gian đèn bật. Đèn 8 tiếng nằm trong mức bình thường, nhưng khi đang bị tảo nâu nên giảm còn 2–3 tiếng mỗi ngày. Vệt xanh nhớt sát đáy kính và chỗ thảm cây dày thường là rêu nhớt xanh (BGA), loại hay mọc ở chỗ nước lưu thông kém. Đèn phòng hắt vào buổi tối có thể góp phần, nhưng các trang tôi đọc không xác nhận đây là nguyên nhân chính, nên hãy thử che kính bể buổi tối để kiểm tra.
> 1. Giảm đèn bể xuống 2–3 tiếng mỗi ngày cho đến khi tảo nâu hết.
> 2. Dùng bàn chải đánh răng h…

**Plain** (2581 characters):

> Tảo nâu thường gặp ở bể mới khoảng 1–2 tháng. Thường là **tảo silic (diatom)**, xuất hiện khi bể chưa cân bằng, nguồn sáng và dinh dưỡng đang dư. Tình trạng này thường tự giảm khi bể ổn định. Còn lớp nhớt xanh có thể là **vi khuẩn lam (cyanobacteria)**, dễ xuất hiện ở vùng đáy kính, nơi ít dòng chảy và tích tụ mùn bã hữu cơ.
> 
> **1. Đèn trong nhà hắt vào bể có phải nguyên nhân không?**
> Có thể góp phần, nhưng thường không phải nguyên nhân chính. Ánh sáng yếu từ đèn phòng vào buổi tối ít ảnh hưởng đến tảo. Bạn nên kiểm tra:
> - Ánh nắng hoặc đèn phòng có chiếu trực tiếp vào mặt kính không.
> - Đèn bể…

### algae-05 · tank · ours wins (7.25 · 4.75)

**Asked:** Bể tôi có tảo nâu và tảo nhớt xanh ở chân kính sát nền, xử lý thế nào?

**Judge:** X dựa vào đúng tình trạng của bể: bể mới chạy 4 tuần, đèn trong nhà hắt vào buổi tối, ốc nerita không ăn tảo lam. X đưa các bước theo thứ tự và có mốc thời gian để theo dõi. Y viết chung chung cho bể nào cũng được, có vài chỗ sai, gợi ý dùng thuốc không cần thiết, rồi lại hỏi những thông tin mà app đã có sẵn. Cả hai đều bỏ qua chuyện ốc nerita nằm im không bò. / I'd pick Y. It uses this tank's details: it's 4 weeks old, which is when tảo cát (diatoms) usually shows up, and the room light reaching the tank at night adds extra hours. Its steps come in order and it says what to watch for. X is generic and padded, uses odd Vietnamese fish names, and asks for information the app already has. Both answers miss that the nerita snails aren't moving.

**Ours lacks:** diagnosis, tank-fit. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 6 pages, stopped at the tools limit):

> Hai loại tảo này thường có chung một gốc: bể còn non về mặt sinh học, và chất thải đang đọng ở nền và góc kính. Tảo nâu là tảo cát, thường xuất hiện 1–3 tuần sau khi set bể, và bể của bạn mới chạy khoảng 28 ngày nên đây là giai đoạn dễ gặp. Tảo nhớt xanh là vi khuẩn lam, hay mọc ở chỗ nước chảy yếu và chất thải hữu cơ dễ đọng. Bạn đang có đèn 8 giờ mỗi ngày nhưng ban đêm đèn trong nhà vẫn hắt vào bể, nên bể đang nhận thêm ánh sáng ngoài lịch. Tôi chắc về hướng này nhưng chưa biết rõ dòng chảy và lượng thức ăn của bạn, nên cần kiểm tra cả hai.
> 1. Hút sạch lớp nhớt và đám tảo nâu ở chân kính và…

**Plain** (2489 characters):

> Tảo nâu và tảo nhớt xanh ở chân kính thường xuất hiện khi bể dư dinh dưỡng, ánh sáng hoặc dòng chảy chưa tốt. Bạn xử lý theo các bước sau:
> 
> ## 1. Xác định loại tảo
> - **Tảo nâu** (diatom): lớp bột nâu dễ lau, thường xuất hiện ở bể mới hoặc khi ánh sáng yếu. Thường tự biến mất khi bể ổn định.
> - **Nhớt xanh** (vi khuẩn lam, cyanobacteria): lớp nhầy, có thể dày, màu xanh hoặc đen, dễ bong thành mảng. Đây là loại khó xử lý hơn và cho thấy bể đang dư chất dinh dưỡng hoặc thiếu oxy/lưu thông nước ở đáy.
> 
> ## 2. Xử lý ngay
> - **Cọ và lau kính** bằng miếng cọ mềm hoặc nam châm lau kính. Với vi khuẩn lam…

### algae-06 · post · plain wins (3 · 7.5)

**Asked:** Em đang dùng bể 6-4-4, lọc Sunsun 702B (1000L/h), lọc phụ Sunsun 603. CO2 cho qua sủi đánh thẳng vào đầu in của lọc, có van điện bật tắt theo đèn. Thỉnh thoảng nghe trong lọc chính có tiếng lọc xọc, lúc khác lại thấy đầu out bắn ra bọt khí to cỡ hạt đỗ. Bể đang nhiều rêu tóc, rêu sừng hươu và rêu lông tơ nên em đang cho CO2 dồi dào hơn, tầm 6-7 giọt/giây. Trộn như vậy có ổn không khi CO2 nhiều? Lọc phụ gắn thêm trộn cánh quạt ở out được không hay sẽ yếu dòng? Cá tép có nguy cơ chết vì ngạt CO2 không?

**Judge:** Y chỉ ra khí bị hút vào bơm là nguyên nhân gây tiếng kêu và bọt, đưa ra mức CO2 cụ thể (1–2 giọt/giây, đo bằng drop checker), cách sửa chỗ đưa CO2 vào, nói về cánh quạt lắp ở lọc 603 và các dấu hiệu tép bị ngạt. X chủ yếu rào đón, không trả lời câu hỏi về lọc 603, chỉ có vài bước chung chung. Y thì dài và xưng 'bạn' thay vì 'em', nhưng vẫn giúp được người hỏi nhiều hơn hẳn. / X nói đúng nguyên nhân là khí CO2 lọt vào bơm 702B làm kêu và đẩy bọt ra. X cũng cho số liệu cụ thể (drop checker, 1-2 giọt/giây, pH tụt không quá 1), có van một chiều, reactor, và trả lời đủ ba câu hỏi. Chỉ có một lỗi nhỏ về chỗ rêu sừng hươu hay mọc. Y nói vòng vo, gần như không trả lời câu nào và không có con số để làm theo.

**Ours lacks:** too-thin, figures, plan, diagnosis. **Plain lacks:** too-long.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình chưa đọc được đủ trang để trả lời chắc các câu hỏi này, nên phần dưới đây chỉ là hướng xử lý tạm, không phải kết luận từ cẩm nang. Tiếng lọc xọc và bọt to từ đầu out rất có thể là khí CO2 đang lọt vào bơm của lọc 702B, nên bọt bị đẩy ngược ra. Lọc phụ 603 thì mình không có trang nào về việc gắn cánh quạt hay trộn ở đầu out, nên chưa thể nói là có làm yếu dòng hay không. Về rêu, cẩm nang có bài xử lý rêu tóc và phòng rêu, nhưng cách làm trong đó là kinh nghiệm của một người làm video, không phải quy tắc chung. Còn việc cá tép có bị ngạt CO2 không thì mình chưa tìm thấy mục nào trong cẩm n…

**Plain** (3807 characters):

> # Trả lời ngắn gọn
> 
> **Trộn CO2 vào đầu hút của lọc chính đang gây tiếng xọc và bọt lớn.** Với lượng 6-7 giọt/giây, bể 96-100L dễ bị dư CO2, nhất là khi bạn tăng đột ngột. Nên giảm lượng CO2, dùng đo drop checker để kiểm soát, và chuyển điểm bơm CO2 ra khỏi đầu hút lọc chính.
> 
> ## 1. Tiếng "lọc xọc" và bọt to ở đầu out
> 
> - **Khí bị hút vào bơm:** Bọt CO2 đi vào đầu hút, bơm 702B hút cả khí lẫn nước. Khí làm bơm mất mồi, chạy ồn, lưu lượng giảm, lâu dài có thể mòn cánh bơm và phớt.
> - **Bọt to ở out:** CO2 không kịp hòa tan nên thoát ra theo dòng nước. Bọt to cỡ hạt đỗ nghĩa là lượng khí đang vượt…

### algae-06 · tank · ours wins (5 · 3.5)

**Asked:** Bể tôi nhiều rêu tóc, rêu sừng hươu và rêu lông tơ, tăng CO2 có giúp được không?

**Judge:** Bể này có vấn đề rõ: sủi CO2 vào đầu in lọc, lọc kêu xọc và có bọt khí to ở đầu out, tức là CO2 hòa tan kém và bị kẹt trong lọc. Cả hai câu trả lời đều không nhắc tới điều này. X ngắn gọn, có các bước theo thứ tự và đúng hướng (giờ đèn, drop checker, gỡ rêu, thuốc diệt BBA). Y chung chung, lại sai mức pH mục tiêu, nói ngược về chuyện khuấy mặt nước, gợi ý cá không hợp với bể và còn hỏi lại thông số bể. / Cả hai đều bỏ qua dấu hiệu chính: CO₂ sủi vào đầu in lọc gây tiếng xọc và bọt to ở đầu out, tức CO₂ đang tích trong lọc và không hòa tan. Y vẫn có các bước rõ, ngắn gọn, ít sai. X dài hơn, sai mục tiêu giảm pH và còn hỏi lại những thông số đã có.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, plan, too-long, diagnosis.

**Ours** (read 5 pages, stopped at the calls limit):

> Khả năng cao bể đang thiếu CO2 hoặc đèn sáng quá lâu. Cẩm nang cho biết khoảng 90% trường hợp rêu tóc là do thiếu CO2, và CO2 giúp chủ yếu bằng cách làm cây khỏe để cây lấn át rêu, chứ không diệt rêu trực tiếp. Tôi chưa biết giờ đèn và tình trạng CO2 của bể bạn, nên hãy kiểm tra hai điều này trước. Cẩm nang không có mục riêng cho "rêu lông tơ"; với loại này, cách xử lý giống rêu tóc và rêu sừng hươu.
> Các bước:
> 1. Kiểm tra giờ đèn; nếu trên 10 tiếng thì cắm hẹn giờ đưa về khoảng 8 tiếng.
> 2. Nếu bể có CO2, treo drop checker và chỉnh cho nó xanh lá; nếu không có CO2, giảm đèn và giảm khuấy mặt n…

**Plain** (1978 characters):

> **Có, tăng CO₂ thường giúp**, nhưng thường chỉ là một phần của giải pháp. Rêu tóc, rêu sừng hươu và rêu lông tơ hay xuất hiện khi bể mất cân bằng: ánh sáng quá mạnh hoặc kéo dài, dinh dưỡng (đặc biệt là phosphate và nitrate) dư thừa, còn cây thủy sinh thì thiếu CO₂ nên phát triển chậm. Khi cây được cấp đủ CO₂, chúng lớn nhanh hơn, hấp thụ dinh dưỡng và cạnh tranh ánh sáng tốt hơn rêu.
> 
> **Cách tăng CO₂ hiệu quả**
> - Đo bằng drop checker hoặc theo pH: mục tiêu thường là pH giảm khoảng 0,2–0,3 so với nước không CO₂, hoặc drop checker chuyển xanh vàng nhẹ (khoảng 25–30 ppm).
> - Bật CO₂ cùng lúc với…

### algae-07 · post · plain wins (4 · 7)

**Asked:** Em là tân binh theo trường phái Hà Lan, phần cứng gần như đủ cho một bể Hà Lan cơ bản: lọc chuẩn, CO2 dồi dào, nền trộn giàu dưỡng, đèn WRGB, quạt... Vậy mà em thất bại liên tiếp 5 bể, bể nào cũng bị: cây xoắn ngọn, xoắn tít, mất màu, teo ngọn, ngọn trắng toát và dị dạng; rêu hại bùng phát. Đèn bật 9h liên tục, CO2 3-4 giọt/giây, mới setup em thay hơn 100% nước hằng ngày trong 2 tuần (vì nghe nói nền trộn rất giàu dưỡng, mà nền mua nên em không biết công thức). Giờ em muốn chuyển qua nền công nghiệp + cốt nền nhưng lăn tăn về tuổi thọ và dinh dưỡng cho bể Hà Lan vốn rất háu ăn. Em nên làm sao?

**Judge:** Y diagnoses the problem, gives a week-by-week plan with KH, ppm and photoperiod figures, and actually answers the question about substrate lifespan and root tabs. X is vague, keeps the light at 9h in practice, and sends the reader to other guides instead of answering. / X answers the real question about the industrial substrate plus a base layer: how long it lasts, how to layer it, and target nutrient levels. It also gives a week-by-week recovery plan with real numbers. Y is vague and sends the reader off to read the guide. Its light advice doesn't cut the hours, and it barely touches the substrate switch.

**Ours lacks:** figures, too-thin, tank-fit. **Plain lacks:** too-long.

**Ours** (read 1 pages, stopped at the tools limit):

> Theo cẩm nang, nguyên nhân khả dĩ nhất là mất cân bằng giữa ánh sáng, CO2 và dinh dưỡng, chứ không phải do thiếu đèn. Bạn chiếu sáng liên tục 9 giờ với CO2 mạnh trong khi thay trên 100% nước mỗi ngày trong hai tuần, nên có thể cây đã bị thiếu chất dinh dưỡng. Cẩm nang nói rõ không thể bù thiếu sáng bằng cách chỉ tăng đèn, và người mới hay xem nhẹ dinh dưỡng đa lượng và vi lượng. Tôi chưa mở được chi tiết các trang về từng triệu chứng thiếu hụt, nên chưa thể khẳng định ngọn trắng hay xoắn là thiếu chất nào; hãy đối chiếu thêm với trang thiếu hụt dinh dưỡng khi có điều kiện.
> 1. Ngừng thay trên …

**Plain** (3164 characters):

> Em không nên đổ lỗi cho nền trộn hay bỏ phương pháp Hà Lan. Theo mô tả, nguyên nhân nhiều khả năng nằm ở **thiếu dinh dưỡng do thay nước quá nhiều**, cộng với **CO2 và ánh sáng cao mà không có bón phân tương ứng**.
> 
> ## 1. Chẩn đoán
> 
> - **Thay 100% nước mỗi ngày trong 2 tuần** đã rửa trôi phần lớn dưỡng chất hòa tan và vi lượng (sắt, mangan, kẽm...). Nền trộn giàu dưỡng chỉ bổ sung từ từ, nên sau khi bị rửa trôi, cây đói ngay. Đây là lý do cây non bị xoắn, trắng ngọn, dị dạng.
> - **Ánh sáng 9h + CO2 3-4 giọt/giây + không bón phân đều** là tổ hợp khiến cây tiêu thụ nhanh, trong khi nguồn cung khô…

### algae-07 · tank · ours wins (6.25 · 3.25)

**Asked:** Bể tôi cứ bị rêu hại bùng phát và cây xoắn ngọn, trắng ngọn, phải làm sao?

**Judge:** X works from this tank's details (9 hours of light, a new tank of cây Hà Lan cuttings, a rich substrate) and gives clear steps in order. It is honest that it isn't sure what causes the twisted tips, though it never brings up the unstable CO₂ or the 100% daily water changes. Y is generic, asks again for facts the app already has, and suggests the wrong algae eaters and an iron dose that could feed the algae. / Y dùng đúng dữ liệu bể của bạn (đèn 9h, cây Hà Lan cắt cắm, nền giàu dưỡng) và đưa ra các bước có thứ tự kèm lịch theo dõi, dù có lỗi nhắm nitrat về 0 và chưa đụng tới quạt hay việc thay nước quá nhiều. X là bài viết chung cho bể nào cũng được, hỏi lại những thông tin đã có, và khuyên thả ốc táo vào bể cây.

**Ours lacks:** diagnosis, tank-fit, follow-up. **Plain lacks:** tank-fit, too-long, wrong, diagnosis.

**Ours** (read 4 pages, stopped at the tools limit):

> Nguyên nhân khả dĩ nhất là bể đang mất cân bằng giữa ánh sáng, CO2 và dinh dưỡng. Đèn WRGB bật 9 giờ liên tục là dài hơn mức khoảng 8 giờ mà cẩm nang gợi ý, trong khi cây Hà Lan cắt cắm còn ít và nền giàu dưỡng không rõ công thức. Cẩm nang cho biết rêu sợi như rêu tóc thường mọc khi dư sắt, đèn quá mạnh hoặc châm phân ít so với thời gian chiếu sáng dài. Tôi chưa đọc được trang riêng về lá non xoắn và trắng ngọn, nên chưa khẳng định được đó là thiếu hay dư dinh dưỡng; hãy kiểm tra cùng lúc các bước dưới đây.
> 1. Giảm đèn xuống khoảng 8 giờ mỗi ngày, và tắt sớm khi thấy cây khép lá lại vì đã đủ …

**Plain** (2889 characters):

> Hiện tượng rêu bùng phát kèm cây xoắn ngọn, trắng ngọn thường do **mất cân bằng dinh dưỡng và ánh sáng**, hoặc **thiếu vi lượng (đặc biệt là sắt)**. Bạn có thể xử lý theo các bước sau.
> 
> ## 1. Kiểm tra nước trước
> Nên dùng bộ test (NH₃/NH₄⁺, NO₂⁻, NO₃⁻, PO₄³⁻, pH, KH, GH). Nếu chưa có, ít nhất hãy để ý:
> - **Amoniac hoặc nitrit > 0**: có thể do cá quá tải, cho ăn dư, lọc chưa chín hoặc thiếu vi sinh. Đây là nguyên nhân nguy hiểm nhất, phải thay nước ngay.
> - **Nitrat và photphat cao**: là "thức ăn" của rêu. Nên giữ nitrat dưới khoảng 20–30 mg/L.
> 
> ## 2. Giảm ánh sáng và kiểm soát thời gian chiếu s…

### algae-08 · post · ours wins (7.75 · 5.75)

**Asked:** Em mới chơi, bể đúc 50cm, lúc đầu nuôi 9 mún + 3 bảy màu + 2 sọc ngựa, giờ là 10 bảy màu, 9 sọc ngựa, 5 mún đỏ với 2 cây ráy. Bể không trải nền, chỉ có vài hòn đá; có lọc thác (có lúc chạy cả ngày, có lúc em không bật) và đèn RGB 9W, ban ngày bật trắng khoảng 10 tiếng, tối chuyển đèn màu đến lúc đi ngủ mới tắt. Cho ăn ngày 2 lần. Được hơn 3 tuần thì tảo nâu bám đầy bể, mún với bảy màu ăn hằng ngày cũng không hết, nước đục đục như phân cá rã ra. Tuần thay 50% nước vẫn đục, thành bể có một lớp mờ mờ như rêu tảo bám. Giờ thì thay nước xong được vài ngày là nước lại chuyển xanh đục, tuần nào cũng phải thay gần như hết nước. Lọc thác không ăn thua, em đang tính mua lọc thùng Sunsun 350K thay vào. Do lọc hay do gì, làm sao để nước luôn trong?

**Judge:** X ngắn gọn, nói đúng nguyên nhân (đèn quá nhiều, cho ăn nhiều, bể dày cá, lọc tắt bật thất thường) và có các bước theo thứ tự rõ ràng. Y có ý đúng nhưng hiểu nhầm bể đúc thành bể xi măng, đếm sai số cá và gợi ý cây không hợp với bể nhỏ, lại dài dòng. / Y gets the cause right (too much light and food in a young, crowded tank), tells the user to run the filter all the time, lays out clear steps in order with what to watch for, and says when the Sunsun is worth buying. X has the same core advice but reads "bể đúc" as a cement tank, double-counts the fish, and is longer with weaker suggestions.

**Ours lacks:** follow-up, figures. **Plain lacks:** too-long, wrong.

**Ours** (read 5 pages, stopped at the tools limit):

> Nguyên nhân khả dĩ nhất là bể đang thừa ánh sáng và thừa dinh dưỡng: đèn bật khoảng 10 tiếng trắng cộng thêm đèn RGB buổi tối (tổng trên 12 tiếng), cho ăn 2 lần mỗi ngày, và 50 cm đang nuôi khoảng 25 con là khá dày. Cẩm nang ghi đèn bật quá 8–12 tiếng dễ gây nước xanh, còn tảo nâu hay bùng trong bể mới chạy chu trình (thường 4–6 tuần) rồi tự giảm khi bể ổn định. Tôi chắc về phần ánh sáng và thức ăn; phần lọc thì cẩm nang nói rõ là lọc phải chạy liên tục, nên việc tắt lọc lúc có lúc không có thể đang làm bể kém ổn định hơn. Lọc Sunsun 350K chỉ nên mua sau khi đã cắt ánh sáng và thức ăn, vì thi…

**Plain** (2806 characters):

> # Nguyên nhân chính: quá tải cá và thức ăn, cộng thêm ánh sáng quá nhiều
> 
> Lọc thác không đủ vì bể đang chứa nhiều chất thải hơn khả năng phân hủy của hệ vi sinh. Lọc thùng có thể giúp, nhưng nếu chỉ thay lọc mà không sửa các yếu tố dưới đây thì nước vẫn sẽ đục lại.
> 
> **1. Mật độ cá quá cao.** Bể 50cm với khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ) là khá đông. Mỗi con thải ra amoniac, và bể non chưa đủ vi khuẩn để xử lý hết.
> 
> **2. Cho ăn quá nhiều.** Thức ăn thừa phân hủy và làm nước đục, làm tăng dinh dưỡng cho tảo. Cho ăn 2 lần/ngày là ổn, nhưng mỗi lần chỉ nên cho lượng cá ăn hế…

### algae-08 · tank · ours wins (7.5 · 4.5)

**Asked:** Bể tôi thay nước xong vài ngày lại xanh đục và bám tảo nâu, làm sao giữ nước trong?

**Judge:** Nên đưa X cho bạn này. X chỉ ra đúng nguyên nhân từ chính bể của họ: thay gần 100% nước mỗi tuần, đèn trắng 10 giờ cộng thêm đèn màu buổi tối, cho ăn 2 lần/ngày và chỉ có 2 cây ráy. X cũng đưa các bước theo thứ tự và dặn theo dõi trong 1–2 tuần. Y là lời khuyên chung cho bể nào cũng được, dài dòng, còn khuyên "đừng thay nước quá ít" (ngược với chuyện họ đang thay quá nhiều), gợi ý cá dọn bể không hợp và hỏi lại những thông tin app đã có. / Y dùng đúng thông tin bể của người hỏi: thay gần 100% nước, đèn trắng 10 giờ cộng đèn màu buổi tối, chỉ 2 cây ráy, cho ăn 2 lần/ngày. Từ đó Y đưa ra các bước theo thứ tự, kèm việc cần theo dõi. X là lời khuyên chung chung, gợi ý vài con ăn tảo không hợp với bể này, cuối bài còn hỏi lại những thông tin mà app đã có.

**Ours lacks:** figures. **Plain lacks:** tank-fit, too-long, asks-only, diagnosis.

**Ours** (read 6 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là bể đang dư dinh dưỡng và nước không ổn định, do thay nước gần 100% mỗi tuần, đèn bật lâu (ban ngày khoảng 10 giờ trắng cộng thêm đèn màu buổi tối), cho ăn 2 lần/ngày và cây trong bể rất ít (chỉ 2 cây ráy, không CO₂). Cẩm nang nói tảo nâu (tảo cát) sống nhờ silicat, nitrat và photphat, còn nước xanh đục là tảo đơn bào trôi lơ lửng sinh sôi quá nhanh khi dư dinh dưỡng và đủ ánh sáng. Tôi khá chắc về hướng này, nhưng cần đo thêm amoniac và nitrit để loại trừ.
> 1. Ngừng thay gần 100% nước; thay khoảng 20–30% mỗi tuần, chỉ tăng lên 50% khi tảo nâu bùng nặng. Cẩm nang…

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

**Judge:** Y fits a concrete tank on a balcony: it suggests a shade net, floating plants such as bèo or lục bình, high pH from cement, partial water changes and a backup aerator. It also gives clear first steps for saving the fish. X gives generic advice, including cutting light hours on a tank that has no light and moving a heavy concrete tank. / X đúng với bể đúc ngoài trời của bạn này: che lưới đen, thả bèo che mặt nước, chuẩn bị máy sục dự phòng khi mất điện, lưu ý pH do xi măng, và có các bước cứu cá ngay. Y cho lời khuyên chung chung kiểu bể trong nhà, như dời bể hay giảm giờ bật đèn, nên không làm được với bể này.

**Ours lacks:** tank-fit, follow-up, figures. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Khả năng cao nhất là nắng: bể đặt ngoài ban công nhận nắng trực tiếp hoặc hắt, nên tảo phù du nở rộ và làm nước xanh lè. Cẩm nang ghi nước xanh thường do nắng chiếu vào và thừa dinh dưỡng, và bể để ngoài trời không có mái che là chỗ hay gặp. Cá chết có thể do oxy tụt: khi tảo nở quá rồi tự tàn, vi khuẩn phân hủy xác tảo, ban đêm tảo dùng oxy và oxy trong bể có thể tụt đến mức cá chết. Mình chưa đo được nước của bạn nên chưa chắc chắn hoàn toàn, nhưng cần xử lý ngay.
> 1. Dời bể ra chỗ không có nắng chiếu trực tiếp hoặc che kín một phần để cắt nắng.
> 2. Rút ngắn thời gian bật đèn, và tránh cho ăn…

**Plain** (2214 characters):

> Nước xanh lè thường do **tảo đơn bào** bùng phát. Bể ngoài trời, đáy trống, có nhiều cá, cho ăn đều thì rất dễ gặp. Chu kỳ khoảng 3 tuần cho thấy dinh dưỡng (phân cá, thức ăn thừa) tích tụ dần rồi tảo bùng lên.
> 
> **Cá chết đột ngột có thể do:**
> - **Thiếu oxy vào ban đêm**: tảo tạo nhiều oxy ban ngày nhưng tiêu thụ oxy ban đêm. Khi tảo chết hàng loạt, oxy tụt rất nhanh. Cá thường nổi đầu, há miệng vào sáng sớm.
> - **Amoniac/nitrit tăng**: do phân và thức ăn thừa phân hủy, nhất là khi lọc sinh học yếu.
> - **pH dao động mạnh**: ban ngày pH lên cao vì tảo quang hợp, và bể đúc mới thường có pH cao do…

### algae-09 · tank · ours wins (8 · 5)

**Asked:** Bể tôi cứ khoảng ba tuần sau khi thay nước lại xanh lè và cá chết, trị sao?

**Judge:** X dùng đúng chi tiết của bể (nắng ban công, không cây) để chỉ ra nguyên nhân là tảo nở rồi tàn làm tụt oxy, và đưa ra các bước gọn, có thứ tự. Y viết chung chung cho bể nào cũng được, đoán nguyên nhân chính là chu trình nitơ, sai cơ chế thiếu oxy ban đêm và dài dòng. / Y uses this tank's details: unshaded balcony sun, no plants, and green water every three weeks. It names the likely cause, explains why the fish die (oxygen crashes), and gives clear steps plus what to watch for. X is a generic checklist that blames the filter and asks for details the app already holds.

**Ours lacks:** figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 5 pages):

> Nhiều khả năng nguyên nhân là ánh sáng và dinh dưỡng. Bể đặt ngoài ban công, nắng tự nhiên chiếu vào không kiểm soát được, lại không có cây để tranh dinh dưỡng với tảo. Mỗi lần thay nước, nước mới và phân cá đưa thêm dinh dưỡng vào, nên tảo lại nở sau khoảng ba tuần. Cẩm nang nói tảo chết hàng loạt làm oxy trong bể tụt, và đó có thể là lý do cá chết. Mức chắc chắn của tôi là vừa, vì chưa biết kết quả đo nitrat, phosphat và cá chết lúc nào trong ngày.
> 1. Dời bể khỏi chỗ nắng chiếu trực tiếp, hoặc che bớt nắng ban công, và chỉ bật đèn khoảng 6–8 giờ mỗi ngày.
> 2. Cho cá ăn ít lại, đo nitrat và p…

**Plain** (2324 characters):

> Bể xanh lè (nước xanh do tảo đơn bào hoặc vi khuẩn bùng phát) và cá chết sau mỗi vài tuần thường có nguyên nhân liên quan đến **chu trình nitơ bị phá vỡ** hoặc **nước máy/cách thay nước**. Chu kỳ 3 tuần khá gợi ý: khi bạn thay nước hoặc vệ sinh lọc quá mạnh, vi khuẩn có lợi bị mất, amoniac/nitrit tăng, rồi tảo bùng lên khi hệ vi sinh tái lập.
> 
> ## 1. Xử lý ngay khi đang xanh và cá yếu
> - **Test nước** (amoniac NH3/NH4⁺, nitrit NO2⁻, nitrat NO3⁻, pH, nhiệt độ). Nếu amoniac hoặc nitrit > 0, đây là nguyên nhân chính làm cá chết.
> - **Thay 30–50% nước** bằng nước đã khử clo, nhiệt độ gần bằng nước b…

### algae-10 · post · plain wins (4.5 · 6)

**Asked:** Có cách nào cứu bể em không: rêu hại dạng sợi màu nâu nhỏ nhỏ bám trên lá cây, sau đó bụi nền dính đầy vào. Thả nhiều tép thì sạch ngay, nhưng bể em nuôi nhiều thần tiên, thả tép vào thì tép bị ăn hết trước cả rêu.

**Judge:** Y gives a usable order of work: clean the leaves by hand, siphon out the dust and leftover food, change water, cut the light, then add algae eaters such as nerites, bristlenose and otto that angelfish leave alone. Its local names have several mistakes, though. X names diatoms correctly and suggests otto, but it is thin, assumes the tank is new and ignores the dust. / X đưa ra kế hoạch rõ ràng: chà rêu, hút đáy, thay nước, giảm sáng và giảm cho ăn. X cũng gợi ý nhiều loài ăn rêu sống được với thần tiên, như ốc nerite, cá tỳ bà và SAE (cá ăn rêu Xiêm), dù gọi sai vài tên tiếng Việt. Y cho rằng đây là tảo silic ở bể mới và khuyên chờ, trong khi người hỏi không nói bể mới. Y cũng quá mỏng và chỉ gợi ý cá otto.

**Ours lacks:** tank-fit, too-thin, plan. **Plain lacks:** diagnosis, too-long, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Có khả năng đây là tảo silic (rêu nâu), loại thường gặp ở bể mới set cây, và thủ phạm hay là silicate. Tôi khá chắc về hướng xử lý, nhưng chưa chắc rêu của bạn đúng loài này nếu nó có sợi dài.
> 1. Chà kính, đá và lá bằng mút hoặc bàn chải đánh răng trong buổi vệ sinh định kỳ, vì rêu này bám không chắc.
> 2. Nếu bể mới set được 3 đến 4 tuần, cứ để và đừng thay đổi lung tung, vì đây thường là giai đoạn tự qua.
> 3. Kiểm tra nguồn silicate: nước máy, đá bố cục và cát trang trí có thủy tinh đều có thể đưa silicate vào bể.
> 4. Thay vì tép, hãy cân nhắc cá otto (Otocinclus), loài hiền, ăn rêu nâu; nhưng …

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

### algae-10 · tank · plain wins (4.5 · 6)

**Asked:** Lá cây trong bể tôi bị rêu sợi nâu bám, mà thả tép thì bị cá ăn mất, xử lý sao?

**Judge:** Neither answer uses the fact that the fish are angelfish. Y still does more for this hobbyist: it covers several likely causes, gives a light schedule (6–8 hours a day) and weekly water changes, and suggests algae eaters that are not shrimp (nerite snails, ottos, SAE), plus hiding cover or a separate tank for shrimp. X locks onto new-tank diatoms and still tells the user to use shrimp. / X is the better answer, though neither one uses the fact that the fish are thần tiên. X gives practical alternatives that fit, such as nerite snails, otto and SAE, plus light-hours and water-change steps. Y only offers otto and tells the hobbyist to watch which fish eats the shrimp, which they already know.

**Ours lacks:** tank-fit, plan, diagnosis, too-thin. **Plain lacks:** tank-fit, too-long, figures.

**Ours** (read 4 pages):

> Rêu sợi nâu trên lá thường là rêu silic (tảo silic). Cẩm nang cho biết phần lớn trường hợp chỉ là giai đoạn bình thường của bể mới, thường xuất hiện khoảng tuần thứ ba đến thứ tư, và rêu này sống nhờ silicate từ nước máy, đá bố cục hoặc cát trang trí. Tôi chưa biết tuổi bể của bạn nên chưa chắc chắn 100%.
> 1. Chà kính và đá bằng mút hoặc bàn chải đánh răng trong lần vệ sinh tới, vì rêu nâu không bám chắc.
> 2. Với lá cây, cẩm nang khuyên nên giao cho cá, tép, ốc ăn rêu thay vì lau tay từng lá, vì lau rất mất công.
> 3. Nếu bể đã đủ ổn, thả thêm vài con cá otto (Otocinclus), loài được cẩm nang gợi …

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

**Judge:** Y covers the causes that actually kill fish in a bloom in Vietnam's heat: the oxygen crash at night, nutrients from the new tap water, overfeeding and an uncycled filter. It also gives a clear water-change rate (30–50%), aeration, feeding and plants. X is tidy but vague ("thay nhiều nước theo cẩm nang"), and it misses oxygen and feeding. / Cả hai đều chỉ ra nguyên nhân là bể chưa có vi sinh, cộng với tảo bùng do không có cây. X nêu thêm việc thiếu oxy ban đêm khi tảo nở, điều rất hay gặp và giải thích được chuyện cá chết. X cũng cho số liệu thay nước cụ thể (30–50% mỗi ngày) và bảo tăng sục khí. Y gọn hơn nhưng chỉ ghi \"thay nhiều nước theo cẩm nang\", không có con số và không nhắc tới oxy.

**Ours lacks:** figures, diagnosis, too-thin. **Plain lacks:** too-long, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là bể mới chuyển về chưa chạy vi sinh, nên khi thả cá, amoniac tăng vọt trong vài ngày, nước chuyển xanh và cá chết. Bể không có cây nên không có gì hút bớt dinh dưỡng và amoniac. Cloramin trong nước máy cũng có thể góp phần, vì nó rất độc với cá và cần khử đúng cách. Tôi chưa biết thời gian bật đèn và chỗ đặt bể, nên chưa loại trừ được thừa sáng.
> 1. Tạm chuyển cá sang xô hoặc bể tạm có nước đã khử clo, đừng để cá trong bể đang xanh.
> 2. Đo amoniac và nitrit trong bể; nếu cao, thay nhiều nước theo cẩm nang, vì tảo chết cũng làm amoniac tăng.
> 3. Khử clo nước máy trư…

**Plain** (3129 characters):

> Triệu chứng này khớp nhất với **chu trình nitơ chưa ổn định** kết hợp với **tảo nở hoa (nước xanh)**. Cá chết thường do amoniac/nitrit tăng cao hoặc thiếu oxy khi tảo bùng lên.
> 
> ## Nguyên nhân có thể
> 
> **1. Lọc sinh học chưa hoạt động tốt ở chỗ mới (khả năng cao nhất)**
> - Ở chỗ cũ, bể chạy mấy tháng nên vi khuẩn có lợi trong vật liệu lọc và thành bể đã phát triển đủ.
> - Khi chuyển đi, vi khuẩn có thể bị giảm mạnh (rửa vật liệu lọc bằng nước máy có clo, thời gian gián đoạn, hoặc bể mới setup lại).
> - Khi thả cá, chất thải làm amoniac tăng. Bể chưa đủ vi khuẩn để chuyển hóa nên amoniac và nitrit t…

### algae-11 · tank · tie or split (6.5 · 6)

**Asked:** Bể tôi cứ thả cá vào là chưa tới một tuần nước xanh lè rồi cá chết, vì sao?

**Judge:** X fits the tank better: it notes the tank has no plants and warns about relying on oxygen packets. But it never says to dechlorinate tap water and gives no water-change % for the emergency. Y is more generic and asks about things the tank details already answer (tap water vs RO), but it covers chlorine, gives clear steps with figures (30–50% water change, light 6–8 hours/day, cycle the tank for 3–6 weeks) and explains how to cycle the tank properly. / Y nói rõ nguyên nhân là bể chưa chạy vi sinh, dùng đúng chi tiết bể trống không cây và việc dùng gói tăng oxy, rồi đưa ra các bước theo thứ tự kèm dấu hiệu cần theo dõi. Nhưng Y bỏ qua việc khử clo cho nước máy và thói quen mấy tháng mới thay nước. X khá chung chung, phần lớn không dùng thông tin bể của họ, còn hỏi lại cả chuyện nước máy hay RO dù đã biết.

**Ours lacks:** figures, diagnosis, tank-fit. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là bể chưa chạy xong chu trình nitơ, nên amoniac tăng vọt sau khi thả cá. Cẩm nang nói amoniac tăng vọt thường gặp ở bể mới chưa chạy vi sinh, và bể bạn đang trống không cây, nên chưa có gì hút amoniac. Nước xanh là hệ quả đi kèm: chất thải làm tảo phù du nở, và ban đêm tảo dùng oxy nên cá dễ thiếu oxy. Tôi chưa rõ tuổi bể và cách nuôi trước đó, nên hãy đo amoniac và nitrit trước để xác nhận.
> 1. Đo amoniac và nitrit ngay; nếu còn cao, đừng thả thêm cá và không cho ăn nhiều.
> 2. Thay nước nhiều lần để giảm amoniac và vớt bớt xác tảo; cẩm nang khuyên thay ít nhất 20%…

**Plain** (2070 characters):

> Nước xanh lè và cá chết trong vòng một tuần thường có hai nguyên nhân chính, và chúng thường đi cùng nhau:
> 
> **1. Bể chưa chu trình nitơ (chưa "chín bể") – nguyên nhân hay gặp nhất**
> - Cá thải ra **amoniac (NH₃)** qua mang, phân và thức ăn thừa. Amoniac rất độc.
> - Bình thường, vi khuẩn có lợi trong bể sẽ chuyển amoniac → **nitrit (NO₂⁻)** → **nitrat (NO₃⁻)** ít độc hơn. Bể mới chưa có đủ vi khuẩn này nên amoniac và nitrit tích tụ, làm cá bị ngộ độc, mang bị tổn thương và chết.
> - Amoniac và nitrat dư cũng là "thức ăn" cho tảo, nên tảo bùng nổ và làm nước xanh.
> 
> **2. Tảo đơn bào nở hoa (nước xan…

### setup-01 · post · plain wins (3.5 · 8)

**Asked:** Vợ em vừa bắt em đầu tư một bể thủy sinh, em đặt mua trọn bộ: bể dài 1m + chân gỗ + sục + lọc + đèn (2 bóng LED) + sưởi. Em ở Hà Nội, trời đang lạnh. Em mù mờ khoản này nên hỏi: 1) Bên setup bảo bật đèn liên tục 3 ngày đầu rồi khoảng 8h/ngày, nhưng em đọc trên mạng thì tuần đầu chỉ bật 50% công suất rồi tăng dần lên 100%, 8h/ngày để tránh rêu và cho cây thích nghi. Cách nào đúng? 2) Cho cá ăn tần suất thế nào? 3) Sưởi có nên bật 24/24 không? 4) Có nên mua thêm bình CO2 không, vì em thấy phải có cái này cây mới đủ chất? 5) Lọc họ trang bị chỉ qua sợi bông đơn giản, em đọc thấy phải lọc qua sứ, mà lọc ngoài thì không có chỗ đặt vì bể dùng chân gỗ, không có tủ. Lọc như của em có ổn không? 6) Nên thay nước mấy ngày một lần, lúc mới setup và lúc đã ổn định?

**Judge:** Y trả lời đủ cả 6 câu, có số liệu hợp lý (24–26°C, sưởi bật 24/24, lọc treo hoặc lọc bọt biển khi không có tủ, khử clo nước máy Hà Nội) và đúng hoàn cảnh của người hỏi. X chỉ trả lời được phần đèn, bỏ qua phần lớn các câu còn lại. / X trả lời đủ cả 6 câu, có số liệu cụ thể: giờ đèn theo từng tuần, sưởi 24–26°C bật 24/24, phương án lọc không cần tủ, lịch thay nước. Các ý đều đúng với bể và hoàn cảnh của anh ấy, chỉ có ý ít thay nước lúc đầu là hơi lệch so với cách chơi bể cây. Y chỉ trả lời chắc chắn câu về đèn và câu thay nước, còn bỏ qua phần cho ăn, sưởi và lọc.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Cách đúng hơn là cách của cẩm nang, không phải bật liên tục 3 ngày. Cẩm nang (một cách làm từ một video của một người chơi) khuyên tuần đầu hạ đèn xuống 50% và chỉ bật 5 tiếng mỗi ngày, sau đó tăng dần lên 70% với 7 tiếng rồi 80% với 8 tiếng. Lý do là cây mới cần thời gian quen, còn đèn mạnh ngay từ đầu dễ làm rêu bùng lên. Các câu hỏi còn lại tôi chưa đủ thông tin để trả lời chắc chắn: tôi chưa đọc được phần cho cá ăn, sưởi và lọc trong cẩm nang, nên xin đừng coi là đã có căn cứ.
> 1. Tuần đầu bật đèn 50% trong 5 tiếng mỗi ngày, không bật liên tục 3 ngày như bên setup nói.
> 2. Tuần đầu thay kho…

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

**Judge:** Y gives correct, usable figures: 6–8 hours of light, 24–28°C, 1W per litre plus more for a cold room, 20–30% water changes, and a nitrogen cycle of 3–6 weeks. It also gives a clear low-tech vs high-tech view on CO₂. X has no numbers, its heater tip and excerpts suit equipment this hobbyist can't use, and it doesn't answer the questions that were asked. / X gives the numbers a beginner needs: 6–8 hours of light, 24–28°C, about 1 W per litre, 20–30% water changes, 3–6 weeks of cycling, plus a clear answer on CO₂. Y uses a bit more of the tank context, but it admits it has no figures, and its excerpts and inline-heater advice suit a canister setup the hobbyist doesn't have.

**Ours lacks:** figures, too-thin, tank-fit. **Plain lacks:** tank-fit, local.

**Ours** (read 5 pages, stopped at the tools limit):

> Bể mới chưa có cá hay cây nên bạn chưa cần vội mua CO2. Cẩm nang nhấn mạnh cây cần chiếu sáng đều đặn, bật tắt đúng giờ mỗi ngày, nên việc quan trọng là giờ cố định chứ không phải cách tăng sáng dần trong vài ngày. Các trang tôi đọc không ghi số giờ chiếu sáng cụ thể, nên hãy theo nhãn đèn hoặc trang của loài cây bạn chọn. Cẩm nang cũng chưa cho con số thay nước cụ thể trong các trang tôi đọc; phần gần nhất là hướng dẫn cycling trước khi thả cá.
> 1. Cắm đèn LED vào ổ hẹn giờ rẻ tiền, đặt giờ bật tắt cố định mỗi ngày; độ sáng chỉnh ngay trên đèn.
> 2. Chạy lọc và sục ngay, chưa thả cá, để bể ổn đ…

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

### setup-02 · post · plain wins (3.5 · 6.5)

**Asked:** Mình đang gom đồ để set hồ 60x40x40 chơi rêu taiwan, trân châu ngọc trai, la hán và ráy, bố cục bonsai. Phân nền dùng Gex xanh. Tư vấn giúp mình nên mua đèn và lọc loại nào?

**Judge:** Y is more useful: it gives the light spectrum, wattage, photoperiod and filter flow, and names models sold in Vietnam. Its one real mistake is reading 'la hán' as the flowerhorn fish when it's a plant here. X is thin, recommends a filter that is too weak, adds a heater that isn't needed, and skips most of the hobbyist's plants and the substrate. / X cho thông số và tên sản phẩm cụ thể bán ở Việt Nam, đúng thứ người hỏi cần khi đi mua, dù có vài lỗi về giá, về mẫu lọc và đọc nhầm la hán là cá. Y an toàn hơn nhưng mỏng: không gợi ý được món nào để mua, hay nhắc chuyện "chưa đọc được hết cẩm nang", bỏ qua trân châu và la hán, và đưa ra mức lọc quá thấp.

**Ours lacks:** too-thin, tank-fit, figures. **Plain lacks:** tank-fit, wrong.

**Ours** (read 4 pages, stopped at the tools limit):

> Hồ 60x40x40 (khoảng 96 lít) trồng rêu Taiwan và ráy là nhóm cây ưa sáng yếu, nên bạn chưa cần đèn mạnh hay CO₂. Cẩm nang khuyên người mới bắt đầu với cây ưa sáng yếu vì đây là nhóm khỏe và dễ trồng nhất. Mình chưa đọc được hết trang chọn đèn và trang chọn lọc, nên chỉ nêu những điểm đã đọc. Với đèn, bạn chọn LED cường độ thấp đến vừa, có chỉnh độ sáng, vì cẩm nang nói LED cho độ sáng cao, tốn ít điện và chỉnh được độ sáng. Đèn đắt tiền chưa chắc đã cần.
> 1. Chọn đèn LED cường độ thấp đến vừa, có núm chỉnh độ sáng.
> 2. Chọn lọc thùng có công suất ghi trên hộp khoảng gấp đôi thể tích bể, tức khoả…

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

### setup-02 · tank · plain wins (3.5 · 5)

**Asked:** Bể tôi sắp set nên mua đèn và lọc loại nào?

**Judge:** Neither answer used the tank details (60×40×40, about 96 L, a planted bonsai layout), so both asked for the size again. Y still gave usable numbers: filter type by tank size, flow of 4–6× tank volume per hour, 6500K light, 6–8 hours a day on a timer, cycling for 2–4 weeks, and brands sold in Vietnam. X only restated general points from the guides and pushed the hobbyist toward low-light plants that are not the ones they chose. / Neither answer used the tank details, though both asked for them. X still gives concrete guidance with local brands (Sunsun, Jebao), flow rate, light hours and cycling time, even though its W/L figure is outdated. Y is better grounded and leans toward low-light plants, which suits their tank, but it is thin, has no numbers, and its suggested questions mention the wrong tank sizes.

**Ours lacks:** tank-fit, figures, plan, too-thin. **Plain lacks:** tank-fit.

**Ours** (read 6 pages, stopped at the tools limit):

> Bạn chưa cho biết kích thước bể và loài cây định trồng, nên mình chỉ nêu nguyên tắc chung trong cẩm nang. Đèn: cẩm nang khuyên dùng đèn LED thay cho huỳnh quang, và nên chọn cường độ theo loại cây; người mới nên bắt đầu với cây ưa sáng yếu như anubias, cryptocoryne, dương xỉ, vì bể đèn mạnh thường phải châm CO2 và dễ bùng tảo. Bể càng cao thì càng cần đèn mạnh hơn để ánh sáng xuống tới đáy, và đèn chỉnh được độ sáng sẽ linh hoạt hơn. Lọc: cẩm nang nói sức lọc phụ thuộc chủ yếu vào lượng và loại vật liệu lọc chứa được, không phải lưu lượng; lọc treo dùng lõi nhỏ thường chứa quá ít vật liệu sin…

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

### setup-03 · post · plain wins (3.5 · 8)

**Asked:** Em có cái bể đang bỏ không, hiện chỉ có mỗi bể, không đèn không lọc không gì hết. Với tầm 3-4 triệu thì nên làm gì để hồi sinh nó? Thủy sinh rong rêu cũng được, còn cá thì em thích kiểu thả nhiều con cá nhỏ tí ti.

**Judge:** Y cho bạn một lộ trình đầy đủ và đúng: thử rò bể, chia 3–4 triệu thành từng khoản, dùng lọc bọt biển, chọn cây dễ, chọn cá nhỏ đi đàn, chạy chu trình nitơ rồi mới thả cá. X thì bảo để đèn 12 tiếng, khuyên làm bố cục Hà Lan cho rẻ, và không hề nhắc chuyện chạy vi sinh trước khi thả cá. / X đưa ra một kế hoạch dựng bể đầy đủ, đúng thứ tự: bảng chia ngân sách 3–4 triệu, cây dễ sống, đàn cá nhỏ đúng ý người hỏi, và có phần chạy vi sinh trước khi thả cá. Y lộn xộn: khuyên bố cục Hà Lan để tiết kiệm (thực ra tốn hơn), đèn 12 tiếng dễ lên rêu, không gợi ý loài cá nào và bỏ qua bước chạy vi sinh.

**Ours lacks:** plan, wrong, tank-fit. **Plain lacks:** too-long, local.

**Ours** (read 5 pages, stopped at the tools limit):

> Bể bỏ không thường hỏng ở chỗ thiếu đèn và thiếu nước sạch, nên bạn bắt đầu lại từ nền và cây, chưa cần lọc đắt tiền. Cẩm nang nói phần cứng là nơi dễ bớt tiền nhất, nên với 3–4 triệu bạn nên chọn bể nhỏ và bố cục đơn giản. Mình chưa biết kích thước bể, nên hãy đo và cho mình biết để tính số cá cụ thể.
> 1. Đo bể (dài × rộng × cao, cm), nhân lại rồi chia 1000 để biết số lít nước.
> 2. Chọn đèn rẻ như Odyssea hoặc bóng T5HO, khoảng vài trăm nghìn; đèn Chihiros khoảng 3,6 triệu là khoản dễ cắt.
> 3. Cài đèn 12 tiếng, sáng yếu 3 tiếng đầu và 3 tiếng cuối, sáng mạnh nhất ở giữa; tuần đầu thay khoảng 30…

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

### setup-03 · tank · plain wins (4 · 7)

**Asked:** Tôi có bể trống và 3-4 triệu, nên mua gì để làm bể thủy sinh nuôi đàn cá nhỏ?

**Judge:** Y có danh sách đồ cần mua kèm giá ước tính hợp túi tiền ở Việt Nam, gợi ý loài cá đi đàn, cây dễ trồng và nhắc chạy bể cho đủ chu trình nitơ. X bảo đi mua bể nano dù người hỏi đã có bể, lại không có giá cũng không gợi ý cá nào. Y có vài lỗi nhỏ về chọn cây và tép, nhưng vẫn giúp ích hơn hẳn. / X answers what was asked. It splits the 3–4 million budget item by item, names brands sold in Vietnam (Sunsun, Resun), suggests fish for a small school, and notes a heater for northern winters. It has a few small slips about plants and shrimp. Y misreads the situation and tells them to buy a nano tank when they already have one. It also gives no prices and no fish choices.

**Ours lacks:** tank-fit, figures, plan, too-thin. **Plain lacks:** figures, tank-fit.

**Ours** (read 6 pages, stopped at the tools limit):

> Với 3-4 triệu và bể trống, bạn nên ưu tiên bể nano và thiết bị cơ bản, rồi để phần còn lại cho cây và cá. Cẩm nang khuyên người mới bắt đầu bằng bể nano vì nhỏ, rẻ, dễ set và đặt được mà không cần chân tủ. Bể kính thường mua ở cửa hàng cá cảnh dùng tốt, không nhất thiết phải là loại siêu trong không viền. Tôi chưa đọc hết phần phân bổ ngân sách của cẩm nang nên không đưa ra tỉ lệ tiền cụ thể cho từng món.
> 1. Chọn bể nano hợp với chỗ đặt, rồi tính lọc theo mốc khoảng 10 lần thể tích bể mỗi giờ, ví dụ bể 60 lít thì lọc khoảng 600 lít/giờ.
> 2. Mua đèn LED chuyên cho bể thủy sinh của hãng uy tín n…

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

**Judge:** Y nên đến tay người chơi này hơn. Y trả lời đúng câu hỏi: bố cục ổn, nền nào và cần khoảng 8–9 lít, kèm số liệu đèn và lưu lượng lọc thác hợp lý, lại còn nhắc chuyện kệ tivi phải chịu được khoảng 100–120 kg. Y chỉ thiếu cảnh báo về nhiệt độ nước, vì mùa nóng ở Việt Nam dễ làm hỏng rêu Fissidens. X gần như không trả lời gì, chỉ bảo người hỏi tự đi đọc cẩm nang. / X trả lời đúng cả ba câu hỏi: bố cục có ổn không, dùng nền gì và bao nhiêu (8–9 lít, tính theo diện tích đáy). X còn đưa ra con số cụ thể cho đèn và lọc thác, cảnh báo đúng về tải trọng lên kệ TV, và tách rõ lúc nào cần aquasoil (khi trồng La Hán vào nền) với lúc nào không cần. Y nói là không mở được trang và không trả lời gì, chỉ chỉ người hỏi tới các trang cẩm nang.

**Ours lacks:** too-thin, plan, figures. **Plain lacks:** local.

**Ours** (read 0 pages, stopped at the tools limit):

> Mình chưa mở được nội dung các trang nên chưa thể xác nhận bố cục, loại nền và lượng nền cho hồ 60x36x36 này. Cẩm nang có trang riêng cho ráy lá nhỏ (Anubias nana), dương xỉ Java và rêu Fissidens fontanus, và có mục "Bể nhỏ dùng lọc thác có ổn không?" trong hướng dẫn set bể thủy sinh nhàn cho người bận. Mình không tìm thấy trang nào về rong La Hán hay đá Tiger trong cẩm nang. Bạn nên đọc mục lọc thác trước, rồi kiểm tra từng cây trên trang riêng về ánh sáng và CO2 trước khi mua.
> 
> [Trích: Set bể thủy sinh nhàn cho người bận: chọn cây, đèn, CO2 và lọc › Bắt đầu từ đâu]
> 1. Chọn cây lớn chậm như …

**Plain** (3463 characters):

> **Nhìn chung phương án ổn**, đặc biệt với hồ 60x36x36 (khoảng 78 lít) và yêu cầu gọn nhẹ. Các cây bạn chọn đều chịu được ánh sáng thấp và CO2 thấp, không cần bình CO2 hay thùng lọc.
> 
> ## 1. Bố cục và cây
> 
> - **Đá Tiger**: hợp lý, bền, không làm đổi pH đáng kể. Nên đặt đá lệch một bên, cao dần về hậu cảnh để tạo chiều sâu.
> - **Rêu Fissidens mini và ráy lá nhỏ (Anubias nana) ở tiền cảnh**: ổn. Cả hai đều bám trên đá hoặc gỗ, không cần nền dinh dưỡng. Buộc hoặc keo (loại an toàn cho cá) ráy lên đá, **không vùi thân rễ xuống nền**, nếu không sẽ thối. Fissidens mini hơi khó giữ hơn, cần nước sạch, í…

### setup-04 · tank · plain wins (4 · 5)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu, và chọn cây như vậy có ổn không?

**Judge:** Cả hai đều không nhận ra rằng phần lớn cây đã chọn là cây bám lũa/đá, không cần nền dày. X có dùng đúng kích thước bể và việc không có CO₂ nhưng không đưa ra con số lượng nền, lại còn gợi ý cây thảm mà họ không định trồng. Y hỏi lại thông tin mà app đã có, nhưng vẫn trả lời được câu hỏi lượng nền: độ dày 3–5 cm, kèm công thức và số kg mà họ tự áp dụng được. / Cả hai đều bỏ qua điểm chính: rêu, ráy, dương xỉ Java là cây bám đá nên nền trơ là đủ. X có độ dày nền 3–5 cm và công thức tính lượng nền, áp vào bể 60×36 được ngay, lại xác nhận dương xỉ Java và rêu hợp đèn yếu, dù hỏi lại thông tin thừa. Y dùng được số đo bể và chuyện không CO2, nhưng không có con số nào và đẩy họ sang trồng cây thảm không liên quan.

**Ours lacks:** figures, tank-fit, diagnosis. **Plain lacks:** tank-fit, asks-only.

**Ours** (read 3 pages, stopped at the calls limit):

> Bể 60x36x36 cm không dùng CO2 nên cây sẽ lên chậm hơn hẳn. Cẩm nang nói rõ điều này: bể không CO2 vẫn trải thảm được, chỉ là phải chấp nhận tốc độ chậm và chọn cây hợp cỡ bể. Vì vậy chất lượng đèn và phân nền quan trọng hơn bình thường.
> Về lượng nền, các trang tôi đọc được chưa ghi độ dày cụ thể, nên tôi không báo con số. Bạn có thể làm theo cách sau:
> 1. Lót phân nền dành cho thủy sinh ở phía sau bể.
> 2. Để tiền cảnh là một dải cát trơ, như cách bể mẫu trong cẩm nang đã làm.
> 3. Lót bông vào các khe giữa lũa và đá để phân không trôi lẫn vào cát.
> 4. Với tiền cảnh, chọn cây mọc chậm nhưng phủ kín…

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

**Ours** (read 4 pages, stopped at the error limit):

failed: Request timed out.

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

### setup-05 · tank · plain wins (3.5 · 5)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu kg, và đèn như vậy có đủ cho cây đỏ không?

**Judge:** X reads their tank but won't give any numbers, not even substrate volume, which is easy to work out. On the light question it only says it can't be sure. Y ignores their tank and has small mistakes, but its formula and light figures let the hobbyist work it out themselves: about 36 L of substrate for a 6 cm layer. It also explains how weak light shows up in red plants and why CO₂ and nutrients have to be balanced with the light. / Không câu nào trả lời thẳng là cần bao nhiêu kg nền và 4 bóng T5HO có đủ cho cây đỏ không. Dù vậy, X đưa ra công thức tính khối lượng nền dùng được ngay (bể 120×50 lót 6 cm ra khoảng 36 lít nền) và ngưỡng PAR cho cây đỏ. Y có nhắc đến bể của họ nhưng từ chối đưa con số nào, nên gần như không làm theo được.

**Ours lacks:** figures, too-thin, diagnosis. **Plain lacks:** tank-fit, asks-only.

**Ours** (read 2 pages, stopped at the tools limit):

> Cẩm nang hiện tại chưa cho tôi con số kg nền cho bể 120x50x50 cm của bạn, nên tôi không dám ước lượng. Phần tôi đã đọc nói rằng không có một loại nền đúng duy nhất: nước máy mỗi nhà mỗi khác, nên nền phải hợp với nước nhà bạn và với loại cây bạn trồng. Với bể natural có rêu, ráy và cắt cắm lá đỏ, bạn nên chọn nền giàu dinh dưỡng hoặc nền trơ kèm phân nền theo hướng dẫn trong cẩm nang, rồi tính lượng nền theo nhà sản xuất và chiều cao lớp nền bạn muốn. Về đèn, bạn có 4 bóng T5HO (2 bóng 10000K, 1 bóng 6500K, 1 bóng hồng). Cẩm nang nói độ sáng cần thiết phụ thuộc vào loại cây, nhưng tôi chưa đọ…

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

### setup-06 · post · plain wins (2 · 7)

**Asked:** Em đang set hồ 60x30x36, bố cục lũa đá nature. Cốt nền JBL Aquabasic Plus 1 bao (2,5 lít), phân nền Aquafor 2,5 bao (7,5 lít), quây phần nền bằng đá cuội. Cây dự kiến: rêu, ráy, ít bucep, dương xỉ, hậu cảnh cắt cắm táo lớn, hồng thái dương. Phần trống mặt tiền có nên trải sạn hoặc cát không? Với bố cục và kích thước này nên dùng máng Odyssea 2 bóng hay 4 bóng?

**Judge:** X answers neither question. It just tells the hobbyist to go read the guide articles. Y gives a clear answer on both: fine sand at the front, and a 4-tube light if they run CO₂ or dose fertiliser well, otherwise 2. It ties both choices to the hobbyist's own plants and tank, though it slips on one dimension and on where the sand goes. / X trả lời thẳng cả hai câu: nên trải cát mịn ở mặt tiền, và chọn 4 bóng nếu có CO₂ hoặc bón phân đầy đủ, còn low-tech thì 2 bóng. Lời khuyên bám đúng danh sách cây của bạn, chỉ có vài lỗi nhỏ. Y không đưa ra câu trả lời nào mà chỉ bảo bạn tự đọc cẩm nang, nên gần như không giúp được gì.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** follow-up.

**Ours** (read 1 pages, stopped at the tools limit):

> Cẩm nang hiện mình chưa đọc đủ để trả lời chắc hai câu này. Trang nền trong cẩm nang mới cho thấy tiêu đề về cách chọn nền, chưa đọc nội dung nên mình chưa dám nói nên trải sạn hay cát ở mặt tiền. Về đèn, cẩm nang có bài chọn đèn bể thủy sinh nước ngọt, nói rằng cường độ sáng phụ thuộc vào loại cây bạn trồng, và cần xét ánh sáng lan được tới đâu. Với hồng thái dương và thảm rêu, bạn nên đối chiếu công suất của máng với phần cường độ sáng trong bài này. Cẩm nang không có thông số riêng cho máng Odyssea 2 bóng hay 4 bóng, nên mình không chọn được giữa hai loại theo tên hãng.
> 1. Mở bài chọn đèn …

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

### setup-06 · tank · plain wins (3 · 6)

**Asked:** Bể thủy sinh tôi đang set có nên trải sạn mặt tiền không, và cần đèn mấy bóng?

**Judge:** Y nói rõ nên trải sạn mặt tiền và cách giữ sạn không lẫn vào phân nền, kèm cách tính đèn có đúng ví dụ bể 60×30×36 (~65 L, 30–40 W). Dù vậy, Y vẫn hỏi lại thông tin bể và không bàn chuyện Odyssea 2 bóng hay 4 bóng. X bỏ qua câu hỏi về sạn, bắt bạn tự đo bể và đưa trình tự trải nền không hợp với nền bạn đang dùng. / Answer X is better. It gives a clear \"nên\" on the front sand with a slope and advice on keeping sand and soil apart, and by luck its example is exactly their 60×30×36 tank (30–40 W). Answer Y skips the sand question entirely, and its layering steps don't match the substrate they already bought. Neither answer reads their tank details or says whether to pick the 2-bulb or 4-bulb Odyssea.

**Ours lacks:** tank-fit, diagnosis, asks-only, too-thin, plan. **Plain lacks:** tank-fit, too-long.

**Ours** (read 6 pages, stopped at the tools limit):

> Cẩm nang chưa cho biết rõ có nên trải sạn phía trước hay không, vì mình chưa đọc được phần đó. Cẩm nang nói về đèn theo công suất (W) và số máng đèn chứ không theo số bóng, nên cần biết kích thước bể để tính. Bạn đo bể (dài x rộng x cao, cm) rồi làm như sau:
> 1. Lấy dài x rộng x cao rồi chia 1000 để ra số lít nước.
> 2. Nhân số lít với 0,5 đến 1 để ra công suất đèn cần mua (W).
> 3. Bể rộng khoảng 30 cm dùng một máng đèn kẹp thành bể. Bể rộng từ 40 cm trở lên thì cần thêm máng, còn đèn treo thông thường chiếu được khoảng 40 đến 50 cm.
> 4. Dựng đá và lũa trước, rồi trải nền từ dưới lên theo bốn lớp …

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

### setup-07 · post · plain wins (4.5 · 7)

**Asked:** Cửa sổ nhà em bị bít nên em tháo ra, được một hõm sâu 20cm, cao 90cm, dài 100cm, em định làm bể cá âm vào đó kiểu bán cạn: hồ kính dài 90cm (chừa 10cm bố trí lọc), sâu 20cm, cao 50cm (mực nước 40cm), đèn 90cm treo phía trên. Thả 1 cục lũa cao hơn mặt nước, xếp ít đá xung quanh, phía sau trải nền trồng cây dễ sống, phía trước trải cát, trồng thêm ít cây vượt mặt nước như dương xỉ, cỏ đồng tiền, khoai lang. Cá nuôi tầm 10 con bảy màu, ít con bống dọn bể. Lọc em định dùng 1 lọc thác 8W và 1 lọc vi sinh (chạy bằng bơm oxy) với vật liệu lọc là sứ vì nuôi ít cá. Các cụ góp ý giúp em.

**Judge:** Y covers what really matters for a tank built into a wall niche: waterproofing, a level base, electrical safety, a sponge stage ahead of the ceramic media, which goby to pick, cycling and the guppy breeding rate. It is long and misses the risk of sun heating the niche. X makes a good point about heat but is thin, dodges the plants they named and the goby question, and leans on its guides. / X bám sát tình huống chèn bể vào hõm tường. Bài nói kỹ về chịu tải, chống thấm, an toàn điện, cách bố trí nền, chọn cá dọn bể thay cho bống và cách lót lọc cơ học trước lớp sứ, chỉ sai vài chi tiết nhỏ. Y lại coi chuyện nắng chiếu vào cửa sổ là vấn đề chính, trong khi cửa sổ đã bị bít. Ngoài ra Y bỏ qua phần lớn những gì người hỏi mô tả và quá mỏng để làm theo.

**Ours lacks:** tank-fit, too-thin, plan. **Plain lacks:** too-long, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Ý tưởng hồ bán cạn trong hõm cửa sổ hợp với cẩm nang, và phần lũa cùng cây trên cao sẽ dễ sống nếu chọn đúng cây. Điều cần kiểm tra đầu tiên là nhiệt độ, vì hõm cửa sổ thường đón nắng. Cẩm nang nói nước khoảng 26–28°C là ổn cho kiểu bể này, còn nước thường xuyên trên 30°C thì cây gần như không lớn được, vùng nóng vừa phải nên lắp thêm quạt.
> 
> Các bước em nên làm:
> 1. Đo nhiệt độ nước ở hõm cửa sổ trong vài ngày nắng; nếu thường trên 30°C thì đổi vị trí hoặc đừng làm kiểu này.
> 2. Trồng các cây lớn chậm như rêu, dương xỉ Java hoặc dương xỉ Bolbitis, cây không khí, dứa Nam Mỹ bám trên lũa; cẩm nan…

**Plain** (4665 characters):

> Ý tưởng tận dụng hõm cửa sổ làm bể bán cạn rất hay, và kích thước của em khá hợp lý. Em nên kiểm tra kỹ một số điểm trước khi làm.
> 
> ## 1. Kết cấu và chịu tải (quan trọng nhất)
> 
> - **Khối lượng:** Nước 90×20×40 cm ≈ **72 lít ≈ 72 kg**. Cộng thêm kính, nền cát, đá, lũa và cây thì tổng khoảng **90–110 kg**. Em cần chắc rằng phần tường và lanh tô phía trên hõm chịu được tải này, đặc biệt nếu hõm là chỗ cũ của khung cửa sổ.
> - **Đáy hõm:** Phải phẳng và chắc, nên trát lại bằng vữa để đáy bể đặt đều. Nếu đáy lệch, kính dễ nứt.
> - **Chống thấm:** Trong hõm nên quét chống thấm trước khi đặt bể. Nếu nước…

### setup-07 · tank · not judged

**Asked:** Kế hoạch lọc, cây và cá cho bể tôi định làm như vậy có ổn không?

**Ours** (read 2 pages, stopped at the error limit):

failed: Request timed out.

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

**Judge:** Y trả lời đầy đủ hơn về nền, phụ kiện và cá, nhưng sai đúng câu hỏi an toàn chính khi nói kính 5 ly cho bể 60x45x45 là ổn. X trả lời đúng là kính mỏng và dặn chưa đổ nền, đá, nhưng lại quá sơ sài ở phần nền, phụ kiện và không gợi ý cá. / Answer X gives the wrong answer to the key question. Calling 5 mm glass on a 60x45x45 tank fine is dangerous, and that outweighs its long list of gear and fish. Answer Y correctly warns that the glass is too thin and says not to fill the tank yet. It is thin on substrate and gear advice and gives no fish suggestions, but it keeps the hobbyist safe.

**Ours lacks:** too-thin, plan, tank-fit, figures. **Plain lacks:** wrong, unsafe, too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Có, theo cẩm nang thì kính 5 ly mỏng so với bể 60 cm. Cẩm nang ghi kính 5 ly chỉ đủ cho bể dưới 50 cm; bể dài 60–80 cm cần tối thiểu 8 ly, và nếu bố cục nhiều đá thì nên dùng đáy 10 ly. Vì nền và đá nặng dồn lên kính đáy, đây là chỗ cần ưu tiên kiểm tra. Mình chưa tra được danh sách cá trong lần này nên chưa gợi ý cá cụ thể.
> 1. Nếu bể đã dán xong, đừng đổ nền và đá nặng vào trước khi đổi hoặc kiểm tra lại kính đáy.
> 2. Nếu bể có trẻ nhỏ trong nhà, cẩm nang khuyên không dùng bể kính mỏng.
> 3. Nếu ngân sách ít, cân nhắc bể nhỏ hơn như 60x40x40 cm hoặc 40x30x30 cm, cẩm nang gợi ý ưu tiên các cỡ nà…

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

**Judge:** Cả hai câu trả lời đều không dùng đến kích thước bể 60×45×45 mà người hỏi đã cung cấp. Câu trả lời Y trả lời đúng cả hai ý được hỏi (cần mua gì, nuôi cá gì) và có các bước như chạy chu trình nitơ, nhưng có lỗi khi khuyên dùng sưởi và xếp cây cần CO2 vào nhóm cây dễ. Câu trả lời X quá mỏng, gần như không nói nên nuôi cá gì, còn khuyên chọn loại kính và chân bể cho một bể người hỏi đã có sẵn. / X đưa ra danh sách đầy đủ, dùng được ngay: thiết bị, cây, cá và chu trình nitơ, dù có vài lỗi (sưởi, trân châu) và tính sai thể tích bể. Y quá mỏng, khuyên mua kính và chân bể dù người hỏi đã có bể, lại gợi ý bố cục Hà Lan vốn rất tốn kém.

**Ours lacks:** tank-fit, too-thin, plan, wrong. **Plain lacks:** tank-fit, local.

**Ours** (read 4 pages, stopped at the calls limit):

> Cách tiết kiệm nhất là giữ phần cứng ở mức vừa đủ, chọn bố cục đơn giản và thả ít cá. Cẩm nang nói phần cứng là chỗ dễ bớt tiền nhất, và với cách làm đơn giản tổng chi có thể còn khoảng 2/3 mức 15 triệu tham khảo, ước lượng theo cẩm nang. Bạn cho tôi kích thước bể (dài x rộng x cao, cm) để tôi khoanh cụ thể hơn.
> 1. Chọn bố cục kiểu Hà Lan để giảm tiền cây và vật liệu trang trí.
> 2. Mua đèn kiểu Odyssea hoặc bóng T5HO, chỉ vài trăm nghìn, thay vì đèn Chihiros khoảng 3,6 triệu.
> 3. Tự làm lọc bông góc thay vì mua lọc lớn, và chọn bơm mini có núm chỉnh lưu lượng.
> 4. Dùng kính Việt Nhật thay kính s…

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

### setup-09 · post · plain wins (3.25 · 7.75)

**Asked:** Em có cái hộc giá sách, định làm bể dài 170x30x35, mặt trước kính siêu trong để vào đó. Layout đơn giản: nền cát và cuội hoặc đá, thêm ít lũa và ráy; cá thì loại size nhỏ dễ nuôi, ít tốn công chăm và ít thay nước. Em định dùng lọc thùng, với size bể này có phù hợp không? Em định dặn bên làm bể chừa lỗ chờ cho lọc ở 2 đầu bể.

**Judge:** X chỉ xác nhận lọc thùng dùng được, còn lại thì nói cẩm nang không có số liệu. X không đưa ra lưu lượng nào và cũng không nói gì về vị trí lỗ chờ. Y đưa ra lưu lượng cụ thể và chỉ cách bố trí lỗ hút, lỗ xả chéo nhau ở 2 đầu, dùng bulkhead. Y còn nhắc độ chịu tải của hộc, chỗ đặt thùng lọc, cá và cây hợp với bể, và việc vẫn phải thay nước. Y có vài chi tiết nhỏ chưa chuẩn nhưng giúp người hỏi nhiều hơn hẳn. / X trả lời thẳng câu hỏi: lọc thùng có hợp không, lưu lượng bao nhiêu, đặt lỗ hút và xả chéo nhau ở hai đầu, hộc phải chịu tải và chừa chỗ, chọn cá thế nào và vẫn phải thay nước. Phần lớn đúng và dùng được ngay. Y thừa nhận không có số liệu, không chốt size lọc, gần như bỏ qua phần khoan lỗ và layout, nên người hỏi không có gì để làm tiếp.

**Ours lacks:** figures, too-thin, tank-fit. **Plain lacks:** local.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể 170x30x35 cm (khoảng 178 lít), lọc thùng hoàn toàn hợp lý, nhưng cẩm nang chưa cho tôi con số cụ thể để chọn size. Theo mục chọn lọc, sức lọc của lọc thùng phụ thuộc vào lượng và loại vật liệu nó chứa được, không phải lưu lượng ghi trên hộp, nên khi chọn model hãy xem dung tích khoang vật liệu trước. Cẩm nang có một mục riêng về bơm lọc cho bể 170 lít, nhưng tôi chưa đọc nội dung mục đó, nên chưa dám chốt size cho bạn.
> 1. Chọn lọc theo dung tích khoang vật liệu, rồi đối chiếu với mục bơm lọc cho bể 170 lít trước khi mua.
> 2. Chừa chỗ phía sau và bên cạnh hộc cho thân lọc, ống dẫn và việ…

**Plain** (2866 characters):

> Bể 170×30×35 cm, khoảng 178 lít tổng, nên đủ rộng để nuôi cá nhỏ đẹp. **Lọc thùng rất hợp** với kích thước này, thậm chí là lựa chọn tốt nhất trong các loại lọc thường dùng, vì bể dài và sâu nên cần lưu lượng lớn và bể ít tốn chỗ cho lọc.
> 
> **1. Chọn công suất lọc**
> - Với bể cá nhỏ, nên lọc đảo nước khoảng **6–8 lần/giờ** (tổng thể tích bể) cho cá nhỏ, và có nhiều cây thì vẫn tốt.
> - Tức là khoảng **1000–1400 L/h** là hợp lý. Chọn thùng có công suất thực tế (không chỉ ghi trên hộp) khoảng 1000 L/h trở lên, loại có thể chỉnh lưu lượng.
> - Có thể dùng thùng cỡ vừa đến lớn (ví dụ dòng Sunsun, Eheim…

### setup-09 · tank · plain wins (3 · 5.5)

**Asked:** Bể tôi định làm dùng lọc thùng có hợp không, và nuôi cá gì cho ít phải chăm?

**Judge:** Y actually answers both questions: it gives a usable verdict on the canister filter, a list of easy fish, and tips for keeping care low. X lists no fish and asks for details the app already has. Neither one uses the tank's real details (about 178 L, a long shallow tank in a bookshelf alcove, filter holes at both ends, ráy), and Y gives some generic numbers and one wrong local fish name. / Cả hai câu trả lời đều không dùng đến thông tin bể: bể khoảng 178 L đặt trong hộc giá sách, có chừa lỗ lọc ở 2 đầu. X ít ra cũng cho danh sách cá, tôm và mẹo giảm công chăm để người hỏi làm theo được, dù khuyên nuôi otocinclus là sai. Y quá sơ sài: nhận là chưa đọc hướng dẫn nên không đưa được loài cá nào, rồi chỉ hỏi lại.

**Ours lacks:** too-thin, tank-fit, asks-only. **Plain lacks:** tank-fit, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Lọc thùng hợp với bể nếu bạn cần lọc mạnh, êm và chịu được việc bảo trì hơn: nó chiếm ít chỗ trong bể, chứa được nhiều vật liệu, và cẩm nang nói chọn lọc theo lượng vật liệu chứa được chứ không theo lưu lượng. Nhược điểm là vệ sinh thường phải tháo cả hệ thống nên dễ đổ nước, và vật liệu nằm trong hộp kín nên khi mất điện lâu vi khuẩn có lợi dễ chết. Về cá ít phải chăm, cẩm nang có một hướng dẫn về cá chuột (Corydoras) cho bể cộng đồng, nhưng tôi chưa đọc nội dung nên chưa xác nhận được được danh sách cá cụ thể; nếu bạn cho tôi kích thước bể và loài cá định nuôi, tôi sẽ kiểm tra cùng nhau.
> 
> […

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

### cycling-01 · post · plain wins (3.5 · 6.5)

**Asked:** Bể em dài 90cm rộng 40, đã mua bình CO2 + trộn cánh quạt, lọc thùng DF1300, đèn Odyssea, nền 10kg loại nhiều chất, trồng trân châu ngọc trai, sao nhỏ và một đống cây cắm lưa thưa. Tuần đầu em lật ra lật vào 3 lần, mất một đống cây vì nhổ ra bị úa, nền mua thiếu thấy mỏng lại hút nước ra cho thêm. Hiện ngày nào em cũng thay 50% nước. Bể đang ổn định được 3 ngày, em định 1 tuần thì thả cá nhỏ như neon, 7 màu. Vậy đã thả được chưa, và nên mua sục oxy loại nào?

**Judge:** Y nêu được mốc thời gian (3–4 tuần), cách test NH3/NO2/NO3, dấu hiệu cây đã ổn và chỉ chọn máy sục hợp lý, nhưng hiểu nhầm 'neon, 7 màu' thành một loài. X mỏng, nói thẳng là không mở được hướng dẫn, và khuyên chạy sục khí suốt ngày đêm dù bể đang bơm CO2. / X is better: it gives a clear way to check the tank is ready (test kit, NH₃/NO₂ at 0), a time frame of 3–4 weeks, a stocking number and a suitable small air pump. Y is thin, admits it didn't read the detailed guide, and wrongly tells them to run the air pump day and night in a CO₂ tank. Both wrongly tell them to stop the daily water changes on new aqua soil.

**Ours lacks:** figures, follow-up, tank-fit, too-thin. **Plain lacks:** local, follow-up.

**Ours** (read 4 pages, stopped at the tools limit):

> Bể mới chạy được 3 ngày thì chưa nên thả neon. Cẩm nang nói cá neon không chịu được những biến động của giai đoạn khởi động, chỉ nên thả khi bể đã trưởng thành và thông số nước ổn định. Việc thay 50% nước mỗi ngày cũng làm trôi bớt vi khuẩn và chất dinh dưỡng mà bể mới cần, còn nhổ cây lên nhiều lần làm cây dễ úa. Tôi chưa mở được phần hướng dẫn chi tiết về cách chạy chu trình nitơ và cách xử lý cây úa, nên các bước dưới đây dựa trên phần tổng quan của cẩm nang.
> 1. Chưa thả neon, cứ để bể chạy chu trình nitơ trước, theo cẩm nang khởi động chu trình nitơ.
> 2. Ngừng thay 50% nước mỗi ngày, chỉ t…

**Plain** (1970 characters):

> **Chưa nên thả cá lúc này.** Ba ngày là quá sớm, và có vài lý do:
> 
> - **Bể chưa chu trình nitơ.** Nền dinh dưỡng và vi sinh có lợi cần vài tuần mới hình thành đủ. Trong giai đoạn này amoniac có thể tăng đột ngột, và cá nhỏ như neon rất nhạy với nó.
> - **Thay 50% nước mỗi ngày làm chậm quá trình này.** Nó loại bỏ amoniac và vi khuẩn ngay khi chúng vừa hình thành, nên bể chưa có cơ hội ổn định. Bạn có thể giảm xuống 1-2 lần/tuần, chỉ thay thêm khi đo thấy chỉ số xấu.
> - **Cây đang hồi phục.** Cây mới trồng và vừa bị nhổ lên nhổ xuống cần vài tuần để bám rễ và ra rễ mới. Trân châu ngọc trai rất khó…

### cycling-01 · tank · ours wins (5 · 4)

**Asked:** Bể thủy sinh mới set được ít ngày, khi nào thì thả neon và bảy màu được?

**Judge:** Y dễ làm theo hơn vì có mốc 3–6 tuần và mức 0 ppm, nhưng lại khuyên nhỏ nước rửa chén vào bể. Đây là lời khuyên sai và có hại. X không cho mốc thời gian cụ thể, nhưng an toàn và vẫn đúng hướng. Cả hai đều bỏ qua chi tiết bể: nền nhiều dưỡng nhả amoniac, bể đã chạy 1,5 tuần, đang thay nước mỗi ngày. / X đưa ra mốc 3–6 tuần nhưng khuyên dùng nước rửa chén để cycle bể, đây là lời khuyên gây hại. Y an toàn hơn và có trình tự rõ ràng, nhưng thiếu số ngày cụ thể. Cả hai đều bỏ qua việc bể đã chạy 1,5 tuần với nền nhiều dưỡng và đang thay 50% nước mỗi ngày.

**Ours lacks:** figures, tank-fit, diagnosis. **Plain lacks:** tank-fit, unsafe.

**Ours** (read 5 pages, stopped at the tools limit):

> Bể mới vài ngày thì chưa nên thả cá, vì vi khuẩn nitơ trong bể chưa đủ để xử lý chất thải của cá. Cẩm nang nói rõ cá neon không chịu được những biến động của giai đoạn khởi động, nên chỉ thả khi bể đã trưởng thành và thông số nước đã ổn định. Cá bảy màu chịu đựng tốt hơn, nhưng cẩm nang không ghi bể mới có thể thả được ngay, nên cũng nên đợi bể chạy xong.
> 1. Chạy chu trình nitơ trước: có thể cycling có cá, cycling bằng cây thủy sinh, hoặc cycling không cá theo cẩm nang.
> 2. Theo dõi amoniac và nitrit bằng bộ test, chờ đến khi cả hai về mức an toàn ổn định.
> 3. Kiểm tra thông số nước (nhiệt độ, …

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

### cycling-02 · post · plain wins (5 · 7)

**Asked:** Em mới nhập môn, mua bể đúc 50cm + đèn 3 màu + lọc thác. Hai bố con mua 7 đôi cá: 5 đôi neon xanh đỏ + 2 đôi cá vàng nhỏ xíu. Sau 2 ngày cá lăn ra chết, chỉ còn 3 con cá vàng nhỏ. Vì sao vậy, và nên mua loại cá nào sống dai, sống khỏe cho con chăm?

**Judge:** Cả hai đều nói đúng nguyên nhân chính là bể mới chưa chạy xong chu trình nitơ. Nhưng X bỏ hẳn nửa câu hỏi là nên nuôi cá gì cho con chăm. Y trả lời đủ cả hai phần, nêu thêm việc chưa khử clo, chưa cân bằng nhiệt khi thả cá và chuyện cá vàng không hợp nuôi chung với neon, và đưa ra danh sách cá dễ nuôi kèm lộ trình rõ ràng. Y có vài lỗi nhỏ: gọi platy là cá kiếm, và khuyên mua máy sưởi, điều không cần ở Việt Nam. / Both answers say the likely cause is a new tank that hasn't cycled yet. X also answers the second question with a list of hardy beginner fish and a stocking suggestion for a 50cm tank, though it is long and has a few local slips. Y is accurate and well grounded, but it skips which fish to buy, which is half of what the hobbyist asked.

**Ours lacks:** off-topic, plan, too-thin, tank-fit. **Plain lacks:** local, too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Nhiều khả năng cá chết vì bể mới chưa chạy xong chu trình nitơ: bể mới 2 ngày nên amoniac và nitrit chưa có vi khuẩn xử lý, còn 7 đôi (14 con) thả cùng lúc làm chất thải tăng nhanh. Cá neon đặc biệt không chịu được biến động của bể mới, theo trang cá neon của cẩm nang. Mình chỉ chắc chắn ở mức khá, vì chưa có số đo nước của bạn.
> 1. Mua que thử amoniac và nitrit, đo ngay hôm nay; nếu trên 0,2 ppm thì thay một phần nước.
> 2. Không thả thêm cá; cho ăn rất ít và tăng dần trong 4 đến 6 tuần, theo hướng dẫn cycling.
> 3. Chờ đến khi amoniac và nitrit đều 0 ppm, nitrat trên 0, và cá ăn bình thường một …

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

### cycling-02 · tank · plain wins (4.5 · 6.5)

**Asked:** Tôi vừa mua bể và thả cá, mới 2 ngày cá đã chết gần hết, vì sao?

**Judge:** Y nên được đưa cho người hỏi hơn. Y nêu nguyên nhân chính là bể mới chưa có vi sinh, nhắc cả clo trong nước máy (rất hay gặp ở Việt Nam khi đổ nước rồi thả cá ngay), và cho con số cụ thể: thay 25–50% nước, sục khí mạnh, cách thuần cá. X thì mỏng và mơ hồ. Cả hai đều bỏ qua chi tiết của bể: neon là cá nhiệt đới nhạy cảm, nuôi chung với cá vàng là cá nước lạnh, xả thải nhiều. Đây chính là lý do neon chết hết mà cá vàng còn sống, nhưng không bên nào nói ra. / X is better: it names the main causes, including uncycled water and chlorine in Vietnamese tap water, and gives figures you can act on (change 25–50% of the water, stop feeding for 1–2 days, acclimation times). Y is thin, never mentions removing chlorine and gives no amounts. Neither answer uses the tank's details: a new molded tank, and neons kept with goldfish.

**Ours lacks:** figures, tank-fit, too-thin. **Plain lacks:** tank-fit, too-long.

**Ours** (read 6 pages, stopped at the calls limit):

> Nguyên nhân có khả năng cao nhất là bể mới chưa đủ vi sinh để xử lý amoniac và nitrit, nên hai chất này tăng lên và làm cá sốc, chết nhanh trong vài ngày đầu. Cách thả cá vội hoặc thuần nước không đúng cũng có thể góp phần, và cần kiểm tra thêm để biết nguyên nhân nào đúng với bể của bạn.
> 1. Ngay bây giờ, dùng que thử kiểm tra amoniac và nitrit; nếu còn cá sống, theo cẩm nang hãy đưa chúng về mức an toàn trước.
> 2. Thay một phần nước bể bằng nước sạch, không thay hết, để giảm amoniac và nitrit.
> 3. Tắt đèn bể và tạm ngừng cho ăn để giảm chất thải thêm vào nước.
> 4. Không thả thêm cá cho đến khi …

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

### cycling-03 · post · plain wins (4.5 · 6.5)

**Asked:** Em mới chơi lần đầu, nghe người bán cá chỉ và hơi hấp tấp nên trong một tuần em set nền full trân châu ngọc trai lùn, trồng cây xếp cảnh. Sau đó em thả 2 ngàn đồng cá trâm, 5 con tép RC, 1 tỳ bà baby, chục con bảy màu. Đổ nước vào được một tuần thì rêu hại tràn lan, loại rêu trắng trắng làm thối rữa trân châu và lan rất nhanh. Bảy màu chết 7 con, cá trâm chết gần nửa đàn, tép trốn biệt vài ngày mới thấy ló mặt. Cây đang chết dần chết mòn, em đã thay nước, vớt bớt rêu, thả tép mồi số lượng lớn mà bất lực. Em đang định bỏ hồ này set lại theo kiểu nền đá đen, tường full rêu, mấy cây lá to dày, nuôi đội vệ sinh tỳ bà bướm, chuột panda, tép RC, cá trâm. Nên làm sao?

**Judge:** Both answers blame an uncycled tank that was overstocked. Y lays out a clear plan with numbers: stop feeding for 2–3 days, change 30–50% of the water, cut the light to 6–8 hours, and cycle the new tank for 4–6 weeks. Its Vietnamese also reads like a real hobbyist, though it mistakes the carpet plant for gravel. X is thin, gives few figures, and its stocking advice about the hillstream loach doesn't follow. / Cả hai đều chẩn đoán đúng là hồ chưa chạy xong chu trình nitơ và thả cá quá tải. X đưa ra bước xử lý cụ thể có số liệu: ngưng cho ăn 2-3 ngày, thay 30-50% nước, đèn 6-8 tiếng, chạy hồ 4-6 tuần, thêm cây mọc nhanh. Tuy vậy X hiểu nhầm trân châu là sỏi nền. Y ngắn và thiếu số liệu, không giải thích rêu trắng là gì, và đoạn bàn về ghép cá thì lộn xộn.

**Ours lacks:** figures, too-thin, tank-fit, diagnosis. **Plain lacks:** too-long, tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là bể chưa qua chu trình nitơ: bạn set nền, trồng cây và thả cá trong vòng một tuần, nên chất thải của cá chưa có vi khuẩn có lợi xử lý, nước bị bẩn nhanh, cá yếu rồi chết, còn rêu và trân châu thối rữa trong nước đó. Mức độ chắc chắn ở đây là khá cao dù tôi chưa kiểm tra được chất lượng nước cụ thể. Cẩm nang nói chu trình nitơ thường mất từ vài tuần tới vài tháng, và thả cá quá nhiều so với vi khuẩn đang có thì bể vẫn không xử lý kịp.
> 1. Dừng thả thêm con nào, vớt hết cá chết và lá, cây thối ra khỏi bể.
> 2. Giảm thời gian đèn và cho ăn ít lại, rồi dùng bộ test nướ…

**Plain** (3273 characters):

> Mình hiểu cảm giác bất lực khi cá chết và cây tàn dần. Chuyện này rất phổ biến với người mới, và phần lớn là do **hồ chưa chu trình (chưa cycle)** cộng với **thả quá tải, cho ăn nhiều** trong khi hệ vi sinh chưa đủ để xử lý chất thải. Rêu trắng bùng lên chính là dấu hiệu của chất hữu cơ dư thừa đang phân hủy.
> 
> ## 1. Việc cần làm ngay (vài ngày tới)
> 
> **Kiểm tra nước trước tiên.** Mua bộ test API Liquid (NH3/NH4, NO2, NO3, pH). Nếu NH3 hoặc NO2 khác 0 thì đó gần như chắc chắn là nguyên nhân cá chết.
> 
> **Xử lý tình trạng cấp bách:**
> - **Ngưng cho ăn 2-3 ngày.** Thức ăn thừa là nguồn amoniac chính…

### cycling-03 · tank · plain wins (4.5 · 6)

**Asked:** Bể mới set một tuần thì rêu trắng lan và cá chết gần nửa, có nên lật bể làm lại không?

**Judge:** Hai câu trả lời đều chẩn đoán đúng là bể chưa chạy xong chu trình nitơ và đều khuyên chưa nên lật bể. Y cho bước làm cụ thể hơn: thay 30-50% mỗi ngày bằng nước đã khử clo, ngừng thả thêm cá (bạn ấy vừa thả tép mồi), vớt xác cá và cây úa. X ngắn gọn nhưng không nói thay bao nhiêu nước và hiểu lớp trắng trên cây đang thối thành nước đục. / X là kế hoạch cấp cứu tốt hơn. Nó khuyên thay nước 30-50% mỗi ngày, dùng thuốc khử độc amoniac, vớt xác và thức ăn thừa, ngừng thả thêm cá, và nêu rõ khi nào mới cần lật bể. Y thì khuyên thay nước ít trong lúc cá đang chết, bắt nhịn ăn 7 ngày có thể làm hại tỳ bà baby, và không nói gì đến lớp trắng làm thối trân châu hay việc thả thêm tép mồi.

**Ours lacks:** tank-fit, figures, plan. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 6 pages, stopped at the calls limit):

> Gần như chắc chắn bể chưa ổn định chu trình nitơ: amoniac hoặc nitrit tăng cao trong tuần đầu nên cá chết, còn lớp trắng lan là bùng vi sinh, thường gặp ở bể mới set. Tôi chưa thấy số đo của bể bạn nên chưa chắc chắn tuyệt đối, nhưng việc cần làm trước là đo nước, chưa nên lật bể vội, vì lật bể không xử lý được nguyên nhân.
> 1. Đo amoniac, nitrit và nhiệt độ nước ngay hôm nay; amoniac phải bằng 0.
> 2. Ngưng cho ăn khoảng 7 ngày, cá khỏe vẫn chịu được.
> 3. Không vệ sinh, không thay vật liệu lọc, để yên bộ lọc ít nhất 7 ngày.
> 4. Nếu amoniac hoặc nitrit vẫn trên 0, đo mỗi ngày và thay nước nhỏ, đều…

**Plain** (1555 characters):

> **Thường không cần lật bể.** Bể mới một tuần mà cá chết nhiều thường là do **chu trình nitơ chưa ổn định** (amoniac và nitrit tăng cao), không phải bể hỏng không cứu được. Vi khuẩn có lợi nằm trong lọc, sỏi và trang trí, nếu đổ đi làm lại thì bạn phải chờ chu trình chạy lại từ đầu, thường mất thêm 3-6 tuần.
> 
> **Việc nên làm ngay:**
> 
> 1. **Test nước** (amoniac, nitrit, nitrat, pH). Nếu amoniac hoặc nitrit trên 0 là đang độc, cần xử lý gấp.
> 2. **Thay nước 30-50% mỗi ngày** nếu có amoniac/nitrit, dùng nước đã khử clo, cùng nhiệt độ với bể. Dùng thuốc khử độc amoniac nếu có.
> 3. **Ngừng cho ăn 1-2 n…

### cycling-04 · post · plain wins (5.5 · 8)

**Asked:** Hồ mình 40x30x30, vừa set up được 5 ngày thì có hiện tượng cá chết, mặt hồ có bọt trắng là sao? Hồ như vậy có cần thay nước thường xuyên không, có cần sục sủi không? Mình chỉ để chạy máy lọc nước thôi.

**Judge:** Y answers all three questions the hobbyist asked: why the fish died and the foam appeared (an uncycled tank, protein foam, leftover soap), whether to change water regularly, and whether to add aeration. It also gives clear steps and a stocking limit for the 36 L tank in natural Vietnamese hobby words. X hedges on the cause, skips the foam and long-term water changes, and reads like a reference lookup rather than advice from a fellow keeper. / X answers all three questions. It explains the likely causes of the fish deaths and the foam (an uncycled tank, organic waste, leftover soap), says how often to change water and when an air pump is needed in hot weather, and gives stocking advice for a 36 L tank. Y won't explain the foam, doesn't say how often to change water, and wrongly suggests 5 days is too early for an ammonia problem.

**Ours lacks:** diagnosis, tank-fit, plan. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Nhiều khả năng bể đang gặp hội chứng bể mới: amoniac tăng vọt vì vi khuẩn lọc chưa đủ để xử lý chất thải. Cẩm nang ghi hiện tượng này thường xuất hiện 1 đến 3 tuần sau khi thả cá, nên bể 5 ngày tuổi là hơi sớm, và mình chưa đo được nước nên chưa chắc chắn. Trong các trang mình đọc không có nói về bọt trắng trên mặt nước, nên chưa thể xác nhận bọt do đâu. Cẩm nang cũng ghi thiếu oxy và clo giết cá nhanh, nên cần đo cả những thứ này.
> 1. Đo ngay amoniac, nitrit và pH; nếu dùng nước máy thì đo thêm clo tự do.
> 2. Nếu amoniac hoặc nitrit lớn hơn 0, thay ít nhất 50% nước, rút nước cũ ra chứ đừng chỉ…

**Plain** (2320 characters):

> ## Nguyên nhân có thể
> 
> Hồ mới 5 ngày thường chưa đủ **chu trình nitơ** (cycling). Hồ mới chưa có vi khuẩn có lợi để phân hủy chất thải của cá:
> 
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻) tích tụ** từ phân cá, thức ăn thừa, xác lá. Đây là nguyên nhân chết cá phổ biến nhất ở hồ mới. Amoniac và nitrit rất độc, còn cá thì yếu dần.
> - **Bọt trắng trên mặt** thường là bọt protein từ chất hữu cơ, hoặc do vi khuẩn bùng phát trong giai đoạn đầu. Bọt có thể do thức ăn thừa, phân, hoặc dư chất tẩy rửa/xà phòng còn sót lại khi vệ sinh hồ và trang trí.
> - Các nguyên nhân khác: nước máy chưa khử clo, nhiệt độ h…

### cycling-04 · tank · plain wins (5 · 7)

**Asked:** Bể mới set 5 ngày cá chết và mặt nước có bọt trắng, là sao?

**Judge:** I'd rather this hobbyist got Y. It names the likely causes of both the deaths and the white foam: an uncycled tank, leftover organic matter, or soap left after cleaning. It gives clear first steps: take out the dead fish, stop feeding, add aeration, test the water, change 30–50% of the water, and use Prime. It also covers chlorine and how long cycling takes. X won't say what the foam is, and it adds steps that don't fit a home tank (testing dissolved oxygen, keeping the dead fish out of the freezer). Neither answer uses the tank's size, but Y also asks for details the app already held. / Cả hai đều nhận ra bể chưa chạy xong chu trình vi sinh, và cả hai đều bảo tăng sục khí, hợp với bể chỉ chạy lọc mà không sủi. X giải thích được bọt trắng (chất hữu cơ thừa, cặn xà phòng), có các bước xử lý theo thứ tự, nhắc dùng khử clo/Prime là những thứ có bán ở VN, và chỉ cách phòng về sau. Y không giải thích bọt, có bước đo oxy hòa tan khó làm được và lời dặn xét nghiệm cá chết không liên quan. Cả hai đều không dùng kích thước bể, còn X lại hỏi lại thông tin mà app đã có sẵn.

**Ours lacks:** diagnosis, tank-fit, figures, plan. **Plain lacks:** tank-fit, too-long.

**Ours** (read 5 pages, stopped at the calls limit):

> Bể 5 ngày tuổi mà cá đã chết thường là do chu trình nitơ chưa chạy xong: amoniac hoặc nitrit tăng cao vì vi sinh có lợi chưa đủ để phân hủy chất thải. Cẩm nang chưa giải thích riêng bọt trắng trên mặt nước, nên tôi không khẳng định được bọt là gì; bọt này có thể đi kèm amoniac cao, nhưng bạn cần đo nước để chắc chắn.
> Các bước nên làm ngay:
> 1. Đo ngay amoniac, nitrit, pH và oxy hòa tan; cá chết đã đem đi xét nghiệm thì đừng cho vào ngăn đá vì làm hỏng mô.
> 2. Nếu amoniac cao, thay ít nhất 50% nước và ngưng hoặc giảm cho ăn.
> 3. Sục khí thật mạnh để tăng oxy, và kiểm tra clo trong nước máy vì clo…

**Plain** (2085 characters):

> Bể mới 5 ngày mà cá đã chết và có bọt trắng thường là dấu hiệu **bể chưa ổn định, nước đang bị nhiễm độc**. Nguyên nhân hay gặp nhất:
> 
> ## Nguyên nhân có thể
> 
> 1. **Ammonia (NH₃/NH₄⁺) hoặc Nitrite (NO₂⁻) tăng cao.** Đây là nguyên nhân phổ biến nhất. Bể mới chưa có vi khuẩn có lợi để phân hủy chất thải, nên khí độc tích tụ và giết cá. Cá thường bơi ngoi lên mặt, há miệng, mang đỏ hoặc tím.
> 2. **Bọt trắng** thường do chất hữu cơ dư thừa: thức ăn thừa, phân cá, cá chết phân hủy, nhớt cá, hoặc còn sót xà phòng/chất tẩy rửa khi vệ sinh bể, lọc, đá, cây.
> 3. **Sốc môi trường:** nước máy chứa clo/chlor…

### cycling-05 · post · tie or split (5.75 · 6.5)

**Asked:** Mình mới tập set một hồ biotop 845, chỉ có lũa hải sa quỳ, đá đen và đá cuội, vài cây thủy sinh không cần CO2, lọc thùng Atman, đèn rọi vàng-trắng. Giai đoạn mới châm đầy nước và chạy lọc thì nên châm loại vi sinh nào?

**Judge:** Y trả lời đúng câu hỏi: nói rõ cần vi sinh nitrat hóa và kể tên các loại bán ở Việt Nam (Seachem Stability, API Quick Start, Tetra SafeStart), kèm liều amoni 2–4 ppm và thời gian chạy hồ 3–6 tuần. X không nói nên chọn loại vi sinh nào, lại đưa mức nhiệt 24–26°C không hợp khí hậu Việt Nam, và ngưỡng thay nước khi amoni trên 0,1 mg/L mâu thuẫn với việc châm amoni để chạy vi sinh. / Y is shorter, gives steps in order with timelines and a stocking schedule, and uses Vietnamese hobby words like sứ cấy sẵn and men vi sinh. But its temperature range doesn't suit Vietnam, and its water-change thresholds don't make sense during cycling. X explains the bacteria and the driftwood tannins better, but it's longer, and some of its advice comes too late for a tank that's already filled.

**Ours lacks:** tank-fit, local, diagnosis. **Plain lacks:** too-long, local.

**Ours** (read 4 pages, stopped at the calls limit):

> Với bể mới chạy lọc thùng Atman, vi sinh nên đưa vào lọc sau khi bạn khử clo và giữ nước ở 24–26°C. Cách chắc ăn nhất là sứ lọc cấy sẵn lấy từ một bể khỏe đang nuôi cá, rồi đổi sang men vi sinh đóng chai theo đúng liều trên nhãn nếu không kiếm được sứ. Cẩm nang không có liều cụ thể cho sản phẩm của bạn nên hãy đọc nhãn chai. Lũa, đá và cây không cần CO2 không ảnh hưởng đến việc chạy vi sinh.
> 1. Trung hòa clo hoặc cloramin trong nước, chờ 30 phút rồi mới châm vi sinh.
> 2. Cho lọc chạy tuần hoàn và giữ nhiệt độ nước 24–26°C trước khi châm.
> 3. Châm sứ cấy sẵn từ bể khỏe, hoặc men vi sinh đóng cha…

**Plain** (2095 characters):

> Với giai đoạn châm nước và chạy lọc, bạn nên dùng **vi sinh nitrat hóa** (nitrifying bacteria), thường ghi là chứa *Nitrosomonas* và *Nitrobacter*. Nhóm vi khuẩn này chuyển hóa amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻), hai chất rất độc với cá, thành nitrat (NO₃⁻) ít độc hơn. Các dòng phổ biến gồm Seachem Stability, Tetra SafeStart, API Quick Start, Tetra Nitrivec và các dòng vi sinh tươi từ bể đã chạy ổn định.
> 
> **Các bước nên làm:**
> 
> 1. **Khử clo trước khi châm nước.** Clo sẽ diệt vi khuẩn. Dùng nước đã để qua đêm, hoặc dùng chất khử clo, và chỉ thả vi sinh sau khi nước đã xử lý xong.
> 2. **Ngâm lũ…

### cycling-05 · tank · plain wins (4 · 7)

**Asked:** Bể mới đổ nước chạy lọc, nên châm vi sinh loại nào để sớm thả cá?

**Judge:** Y gives the hobbyist a full plan: use live nitrifying bacteria, feed them an ammonia source, test the water, use the signs that the cycle is done, and expect roughly 2–4 weeks. X only says to buy a reputable bottle and read the guide, with no timeline or way to check the tank. X does name products sold in Vietnam, and Y's brands are mostly imported. / X gives a full cycling plan: feed the bacteria an ammonia source, test regularly, wait for NH3 and NO2 to reach 0, and expect it to take 2–4 weeks before stocking slowly. Y names local Vietnamese products (Extrabio, Koica) but mostly sends the reader off to guides, with no timeline, no ammonia source and no testing steps. Neither answer uses the 80×40×50 tank or the Atman canister filter.

**Ours lacks:** plan, figures, follow-up. **Plain lacks:** tank-fit, local.

**Ours** (read 3 pages, stopped at the calls limit):

> Bể mới chạy lọc thì cần vi sinh có nguồn gốc rõ ràng, và vi sinh chỉ giúp bể nhanh ổn định khi nó có chỗ bám. Cẩm nang chưa cho thời gian cụ thể để bể chạy xong chu trình, nên đừng thả cá chỉ vì đã châm vi sinh.
> 1. Chọn chai có tên công ty sản xuất và đăng ký sản phẩm rõ ràng, thành phần đầy đủ, hướng dẫn cụ thể và đầu mối hỏi khi có vấn đề. Cẩm nang nêu Extrabio (Đông Phong) và Koica là hai ví dụ đạt các tiêu chí này.
> 2. Châm đúng liều ghi trên nhãn theo thể tích nước của bể; khi thay nước thì tính liều theo lượng nước mới.
> 3. Nếu nền là cát sỏi nhẵn và lọc ít vật liệu, bổ sung vật liệu lọc …

**Plain** (1429 characters):

> Với bể mới, bạn nên chọn **vi sinh chứa vi khuẩn nitrat hóa sống** (thường có *Nitrosomonas* và *Nitrobacter*). Các loại phổ biến gồm **Seachem Stability**, **Tetra SafeStart**, **API Quick Start**, **Dr. Tim's** hoặc **Sera Bio Nitrivec**. Tránh loại chỉ có enzyme hoặc chỉ khử clo, vì chúng không giúp hình thành chu trình nitơ.
> 
> **Cách làm:**
> 1. **Châm vi sinh ngay** sau khi đổ nước và chạy lọc, liều theo hướng dẫn trên bao bì. Có thể châm lại sau 1-2 tuần để bù lượng vi khuẩn.
> 2. **Nuôi vi khuẩn bằng nguồn amoniac:** cho ăn một ít thức ăn mỗi ngày, hoặc dùng amoniac nguyên chất (không có ch…

### cycling-06 · post · plain wins (5 · 7.5)

**Asked:** Em mới set một bể cubic 20 loại lowtech, mấy hôm nay nước trong bể tự nhiên rất đục, mờ mờ như lớp sương mù. Mọi người bảo do vi sinh bị chết. Làm sao khắc phục và tạo lại vi sinh? Em cũng nuôi cá trong thùng xốp, nước trong đó rất trong dù thỉnh thoảng mới hút cặn và châm thêm nước. Em lấy nước thùng xốp đó châm mồi vi sinh cho bể mới được không?

**Judge:** Cả hai đều nhận ra đây là bùng vi khuẩn chứ không phải vi sinh chết. Y trả lời được câu hỏi về nước thùng xốp và giải thích đúng: vi sinh sống bám trên giá thể, nên lấy bông lọc hoặc nền thì tốt hơn. X lại bỏ ngỏ đúng câu hỏi chính đó. / Both answers say the likely cause is a bacterial bloom (vi khuẩn bùng phát), not dead bacteria (vi sinh chết). X also answers the foam-box water question well. It explains that the useful bacteria live on surfaces, that the water could carry disease, and that moving filter media works better. Y leaves that question unanswered and doesn't use the 20 cm cube or the low-tech setup.

**Ours lacks:** tank-fit, too-thin. **Plain lacks:** follow-up, too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Nhiều khả năng đây là bùng vi sinh, không phải chết vi sinh. Cẩm nang nói nước đục trắng như nước vo gạo thường do vi khuẩn bùng phát, hay gặp ở bể mới set. Hiện tượng này khác với chết vi sinh, và thường tự cân bằng sau vài ngày.
> Các bước làm ngay:
> 1. Đo ammonia và nhiệt độ nước trước tiên. Ammonia phải bằng 0.
> 2. Nếu ammonia bằng 0, không cần làm gì thêm. Bể sẽ tự cân bằng.
> 3. Ngưng cho cá ăn khoảng 7 ngày. Cá khỏe chịu được chừng đó.
> 4. Để yên bộ lọc ít nhất 7 ngày, không vệ sinh và không đổi gì trong lọc.
> 5. Tránh thay 75% nước một lần, vì cách này làm bể dễ mất ổn định. Nếu cần thay thì …

**Plain** (2164 characters):

> ## Nước đục có phải do vi sinh chết không?
> 
> Nhiều khả năng **không**. Nước đục mờ như sương ở bể mới thường là **bloom vi khuẩn** (vi khuẩn sinh sôi quá mức khi có nhiều chất hữu cơ từ thức ăn, lá rụng, phân, hoặc nước máy mới). Đây là giai đoạn bình thường khi bể đang chạy (cycling), kéo dài khoảng 1-3 tuần. Vi sinh có ích (nitrat hóa) chủ yếu bám trên bề mặt lọc, nền, đá, kính, cây, nên nước đục không có nghĩa là chúng chết.
> 
> ## Cách xử lý
> 
> - **Đừng thay nước lớn** hoặc rửa lọc bằng nước máy mạnh. Việc này loại bỏ vi sinh bám và làm bloom kéo dài.
> - **Giảm ánh sáng** xuống khoảng 4-6 giờ/ng…

### cycling-06 · tank · tie or split (5.5 · 6)

**Asked:** Bể mới set bỗng đục mờ như sương, có phải vi sinh chết và làm sao gây lại?

**Judge:** Cả hai đều nói đúng là đục trắng do vi khuẩn bùng phát, không phải vi sinh chết. Nhưng Y giải thích nguyên nhân rõ hơn, tách riêng cách xử lý khi bloom với cách gây lại vi sinh, có các mốc để theo dõi (sục khí, test hằng ngày, 1–3 tuần, 4–8 tuần). X thì lộn xộn, có chỗ tự mâu thuẫn và khuyên dùng UV không cần thiết. Cả hai đều không nói đến bể 20cm hay chuyện lấy nước từ thùng xốp: chỉ mồi bằng nước thì không giúp được bao nhiêu, vì vi sinh sống chủ yếu trên bề mặt và vật liệu lọc. / Cả hai đều chẩn đoán đúng là bùng vi khuẩn chứ không phải vi sinh chết, nhưng không nói gì về bể 8 L của họ hay ý định lấy nước thùng xốp làm mồi (nước nuôi chứa rất ít vi sinh, nên xin bùi nhùi hoặc vật liệu lọc thay vào). Y gọn hơn, bắt đầu bằng đo ammonia, viết tự nhiên kiểu dân chơi Việt và có trích cẩm nang; X dài hơn, chung chung hơn và có khuyên tắt đèn.

**Ours lacks:** tank-fit, plan, follow-up, figures. **Plain lacks:** tank-fit, too-long.

**Ours** (read 5 pages, stopped at the calls limit):

> Thường thì không phải vi sinh chết. Nước đục trắng mờ như sương ở bể mới hay là bùng vi sinh, tức vi khuẩn bùng phát, và cẩm nang coi đây là chuyện khác với vi sinh chết. Việc cần làm đầu tiên là đo ammonia.
> 1. Đo ammonia (NH3). Nếu bằng 0 thì để bể tự cân bằng.
> 2. Ngưng cho ăn khoảng 7 ngày và không đụng vào lọc.
> 3. Không thay nước nhiều và thất thường, ví dụ 75% một lần, vì bể dễ mất ổn định. Một nguồn khuyên thay 30% kèm hút đáy.
> 4. Nếu ammonia khác 0, đó là bể chưa đủ vi khuẩn có lợi để xử lý chất thải. Lúc này gây lại bằng chế phẩm vi khuẩn nitrat hóa (chứa Nitrosomonas và Nitrobacter), …

**Plain** (1912 characters):

> Bể mới bị đục trắng như sương thường **không phải vi sinh chết**. Phổ biến nhất là **bloom vi khuẩn** (bùng phát vi khuẩn dị dưỡng), xảy ra trong 1-2 tuần đầu khi bể đang chu trình nitơ. Nguyên nhân thường gặp là dư thức ăn, chất hữu cơ thừa, cá chết hoặc phân cá tích tụ, hoặc vật liệu lọc và nền mới còn bụi. Đây là dấu hiệu vi sinh đang hình thành, không phải vi sinh chết.
> 
> Tuy nhiên, nếu bể đã ổn định rồi bỗng đục sau khi rửa lọc bằng nước máy, dùng thuốc, hoặc thay nước quá nhiều, thì có thể vi sinh có ích đã bị giết và bạn cần gây lại.
> 
> **Cách xử lý khi bloom:**
> - Đừng hoảng và đừng thay …

### cycling-07 · post · ours wins (7 · 4)

**Asked:** Hồ em mới set hôm nay, có phân nền và chỉ một số cây cắt cắm dễ trồng. Em đặt trong phòng ngủ nên không thích sủi và lọc vì tiếng ồn. Người bán bảo chỉ cần 2-3 ngày thay nước một lần là được, vậy có ổn không, có cách nào khác không?

**Judge:** X đưa ra lịch thay nước đúng cho bể phân nền mới set: tuần đầu thay dày rồi giãn dần, kèm dấu hiệu cần theo dõi. Y khuyên giãn ra 1–2 tuần mới thay và lý giải sai về vi sinh. Gợi ý của Y về lọc bọt biển đặt bơm xa giường thì có ích, nhưng không bù được lời khuyên sai cốt lõi về lịch thay nước. / Y nói đúng việc hồ phân nền mới cần thay nước dày (30% mỗi ngày ở tuần đầu rồi giãn dần), đưa ra mốc giảm dần rõ ràng và dấu hiệu cần theo dõi. X lại bảo thay nước thường xuyên sẽ làm mất vi sinh và khuyên giãn lịch ra, điều này sai với hồ phân nền mới, dù gợi ý lọc bọt biển đặt bơm ở xa là hữu ích.

**Ours lacks:** follow-up, diagnosis. **Plain lacks:** wrong, tank-fit, too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Bể mới chưa có cá nên chất thải ban đầu còn ít, nhưng phân nền mới đang nhả nhiều dinh dưỡng vào nước, dễ sinh rêu hại trong tuần đầu. Cẩm nang không nói rằng thay nước 2-3 ngày một lần là đủ cho bể không lọc, không sủi. Mốc 2-3 ngày chỉ là giai đoạn sau, khi đã thay dày ở tuần đầu và bể bắt đầu ổn định. Cách làm theo cẩm nang:
> 1. Tuần đầu thay khoảng 30% nước mỗi ngày.
> 2. Từ tuần thứ hai chuyển sang 2 ngày một lần, rồi 3 ngày một lần nếu cây lên đều và chưa có rêu hại.
> 3. Không che kín mặt nước, cho đèn sáng khoảng 6-8 tiếng mỗi ngày; cây nhả oxy khi có ánh sáng, nên bể không sủi vẫn có oxy …

**Plain** (2058 characters):

> **Thay nước 2-3 ngày một lần thường là không cần thiết.** Hồ mới set, nhất là hồ thủy sinh có phân nền, cần vài tuần để ổn định. Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi đang hình thành, và bạn phải xử lý nước máy liên tục. Cách làm hợp lý hơn:
> 
> - **Nếu chưa có cá hoặc chỉ có rất ít cá:** thay 20-30% nước mỗi 1-2 tuần, hoặc khi nitrate (NO₃) cao. Khi có cá, lượng thức ăn và chất thải mới là nguồn gây bẩn chính.
> - **Chỉ châm thêm nước** khi bị bay hơi, dùng nước đã khử clo.
> - **Dùng bộ test nước** (NH₃/NH₄⁺, NO₂⁻, NO₃⁻) để quyết định khi nào thay nước, thay vì theo lịch cố đị…

### cycling-07 · tank · ours wins (5.5 · 3)

**Asked:** Bể mới set của tôi chỉ thay nước vài ngày một lần thay cho lọc thì có ổn không?

**Judge:** X answers the real question: water changes only dilute waste and do not do the filter's job. It also gives a sensible water-change schedule for new soil substrate (30% a day in the first week), though it wrongly assumes there is a filter already. Y misreads the question as being about cleaning the filter, gives generic advice that doesn't fit a filterless tank with soil substrate, and ends by asking questions back. / Y trả lời đúng ý: thay nước chỉ pha loãng chất thải, không thay được lọc vi sinh. Y còn đưa lịch thay nước dày cho tuần đầu, hợp với bể dùng phân nền đang nhả amoniac. Tuy vậy Y lại coi như bể đã có lọc. X hiểu sai câu hỏi thành chuyện vệ sinh lọc và chủ yếu hỏi lại thông tin.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, asks-only, plan, diagnosis.

**Ours** (read 6 pages, stopped at the tools limit):

> Mình chưa thấy cẩm nang nói rằng thay nước thường xuyên có thể thay thế lọc sinh học, nên mình không dám khẳng định là ổn. Thay nước chỉ pha loãng chất thải, còn bể mới cần vi khuẩn có lợi để chuyển chất thải thành nitrat, và chu trình này thường mất vài tuần tới vài tháng.
> 1. Giữ bộ lọc chạy liên tục và đừng vệ sinh hay bỏ vật liệu lọc, vì đó là nơi vi khuẩn có lợi bám.
> 2. Tuần đầu thay khoảng 30% nước mỗi ngày, rồi giảm dần xuống 2 ngày một lần, sau đó 3 ngày một lần.
> 3. Trồng thêm cây thủy sinh, vì cây hút amoniac và nitrat, giúp bể ổn định hơn trong lúc chờ.
> 4. Chưa thả cá mới cho đến khi…

**Plain** (1338 characters):

> Tùy bạn đang hiểu "thay cho lọc" là thay nước **thay cho** việc vệ sinh lọc, hay là thay nước **và** vệ sinh lọc. Mình trả lời theo hướng bạn đang hỏi có nên thay nước thường xuyên hơn để thay thế việc vệ sinh lọc không.
> 
> **Thay nước không thay thế được việc vệ sinh lọc.** Hai việc này có tác dụng khác nhau:
> - **Thay nước** giúp giảm amoniac, nitrit, nitrat và các chất bẩn hòa tan.
> - **Vệ sinh lọc** chỉ cần khi lọc bị tắc hoặc dòng chảy yếu đi rõ rệt. Vệ sinh quá kỹ hoặc quá thường xuyên có thể làm mất vi khuẩn có lợi.
> 
> **Với bể mới, bạn nên lưu ý:**
> - **Bể chưa chạy xong chu trình nitơ (chưa…

### cycling-08 · post · plain wins (4 · 8)

**Asked:** Hồ của em làm từ thùng xốp 40x40x20, 2 mặt kính, 3 mặt xi măng, để trên sân thượng trong mái hiên. Em dùng lọc thác Sobo 400l/h có đủ không? Hồ như vậy có cần CO2 không? Bao lâu thì thả cá được?

**Judge:** Y trả lời thẳng cả ba câu: lọc đủ nhưng nên giảm dòng, không cần CO2, và cycling khoảng 3–6 tuần. Quan trọng nhất, Y cảnh báo xi măng mới làm nước kiềm và chỉ cách xử lý, còn có lời khuyên về nắng, mưa và nước máy hợp với sân thượng ở Việt Nam. X bỏ qua chuyện xi măng, né câu hỏi CO2 và đưa lời khuyên mùa vụ cho vùng ôn đới. / X trả lời thẳng cả ba câu hỏi và có con số hợp lý. X còn chỉ ra đúng nguy cơ chính: xi măng mới thải vôi, làm pH lên cao. Hồ ở sân thượng nóng thì X nhắc che nắng, có mưa thì nhắc đậy nắp. Y bỏ qua chuyện xi măng, không trả lời được câu CO2, và đưa số liệu theo khí hậu ôn đới không hợp với Việt Nam.

**Ours lacks:** tank-fit, local, diagnosis. **Plain lacks:** too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Hồ 40x40x20 cm chứa khoảng 32 lít nước. Cẩm nang nói hồ mini ngoài trời chỉ cần một máy sủi khí và một lọc vi sinh (lọc bọt biển), và lỗi hay gặp nhất là lọc quá mạnh, vì dòng mạnh hút và làm hại cá con. Với Sobo 400 l/h trên 32 lít, dòng chảy khá mạnh so với thể tích. Cẩm nang không đưa con số lưu lượng cho hồ này, nên đây là nhận định của tôi: nên giảm dòng hoặc chuyển sang lọc bọt biển có sủi khí. Về CO2, cẩm nang chỉ hướng dẫn CO2 cho bể thủy sinh có cây, và tôi không tìm được phần nào nói hồ không trồng cây hay trồng ít có cần CO2 không, nên phần này em tự quyết theo mục tiêu của hồ. Về …

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

### cycling-08 · tank · plain wins (4.25 · 5)

**Asked:** Bể mới làm của tôi bao lâu thì thả cá được, lọc như vậy có đủ không?

**Judge:** Neither answer warns about the new cement in this foam box, which can push pH up and needs soaking or curing first. Y still does better: it gives a usable 3–6 week cycling window, clear signs the tank is ready and the 4–6x turnover rule. X refers to the tank but leaves the filter question open and gives a strange stocking figure. / Neither answer says the Sobo 400 l/h (about 12 tank volumes per hour) is plenty for this 32 L tank. Neither warns that the fresh cement walls must be soaked and rinsed so the pH settles before cycling. X gives a correct time range (3–6 weeks), a clear test for when the tank is ready, and a turnover rule the hobbyist can apply. Y uses the tank size but pushes fish-in cycling with a garbled stocking figure and skips the filter question, so X is slightly better.

**Ours lacks:** diagnosis, tank-fit, figures. **Plain lacks:** tank-fit, asks-only, local.

**Ours** (read 3 pages, stopped at the calls limit):

> Bể 40×40×20 cm của bạn đang trống nên chưa thể thả cá ngay; trước hết cần chạy chu trình nitơ. Theo cẩm nang, chu trình thường mất từ vài tuần đến vài tháng, nên không có con số ngày cố định. Về lọc Sobo 400 l/h, cẩm nang có trang chọn lọc theo lưu lượng nhưng tôi chưa đọc đủ để xác nhận con số cho bể này, nên hãy đối chiếu trang đó trước khi quyết định.
> 1. Chạy chu trình bằng cách thả vài con cá rất ít lúc đầu; cẩm nang gợi ý khoảng 1 con cá nhỏ cho mỗi 38 lít nước, nên bể khoảng 32 lít chỉ nên có rất ít cá.
> 2. Cho cá ăn rất ít lúc đầu, rồi tăng dần trong bốn đến sáu tuần để vi khuẩn kịp xử …

**Plain** (1336 characters):

> Thường thì bể mới cần **khoảng 3–6 tuần** để chu trình nitơ (nitrogen cycle) ổn định trước khi thả cá. Trong thời gian này, vi khuẩn có lợi phải phát triển đủ để xử lý amoniac (NH₃) và nitrit (NO₂⁻) do cá thải ra. Nếu thả cá sớm, amoniac và nitrit sẽ tích tụ và dễ làm cá chết.
> 
> **Cách biết bể đã sẵn sàng:**
> - Dùng bộ test nước (nên dùng loại giọt, chính xác hơn que thử) kiểm tra amoniac và nitrit.
> - Khi **amoniac = 0** và **nitrit = 0** trong ít nhất 2–3 ngày liên tiếp, và đã có nitrat (NO₃⁻) xuất hiện, bể đã chạy xong chu trình.
> - Ngược lại, nếu amoniac hoặc nitrit vẫn đo được thì chưa nên t…

### sick-01 · post · plain wins (4 · 7)

**Asked:** Đàn ngựa vằn xanh nhà em nuôi gần 3 năm, rơi rụng dần. Giống này không đẻ nổi, giờ cứ 1 vài tuần lại có con cong người, 1-2 tuần sau là chết. Có phải do già quá không, hay bị bệnh gì?

**Judge:** Y names fish TB (mycobacteriosis) as the main suspect, which fits a group dying off slowly with bent spines, and warns that it can spread to people. Its first steps are clear and in order. X gives no diagnosis, and its 18–25°C temperature range doesn't fit tanks in Vietnam. Y's main mistake is saying old age can't cause a bent spine. / X đoán đúng bệnh hay gặp nhất là lao cá, có dặn đeo găng tay vì bệnh lây sang người, và đưa bước làm ngay dù câu trả lời hơi dài, hỏi lại nhiều và phủ nhận yếu tố tuổi già hơi quá. Y không chẩn đoán được bệnh, còn đưa mức nhiệt 18–25°C không hợp với bể ở Việt Nam.

**Ours lacks:** diagnosis, local, figures, too-thin. **Plain lacks:** tank-fit, plan, too-long, figures.

**Ours** (read 2 pages, stopped at the calls limit):

> Cẩm nang ghi cá ngựa vằn sống khoảng 3–5 năm, nên con 3 tuổi đã gần cuối đời, và đàn yếu dần cũng có thể do tuổi. Nhưng cá khỏe thì đẻ thường xuyên, nên việc đàn ngừng đẻ, con cong người rồi chết trong 1–2 tuần thường là dấu hiệu cá đang yếu hoặc bệnh chứ không chỉ là già. Cẩm nang chưa nói rõ nguyên nhân cá cong người, nên tôi chưa thể chắc là bệnh gì.
> 1. Cách ly con cá đang cong người sang một bể nhỏ để tránh lây sang cả đàn.
> 2. Đo nhiệt độ, pH và độ cứng nước; cá ngựa vằn cần 18–25°C, pH 6–8, độ cứng 5–20 dGH.
> 3. Quan sát cả đàn về bụng, vảy, mang và kiểu bơi, ghi lại từng con có triệu chứ…

**Plain** (2113 characters):

> Nếu "ngựa vằn xanh" là cá (zebra danio hoặc cichlid vằn xanh), thì tuổi già thường không gây ra triệu chứng này. Cá già thường yếu dần, ăn ít, đẻ kém, chứ không cong người rồi chết trong 1-2 tuần. Biểu hiện cong người kèm chết nhanh thường là bệnh, và có vài nguyên nhân chính:
> 
> 1. **Lao cá (Mycobacteriosis)**: Đây là nghi ngờ hàng đầu với triệu chứng bạn mô tả: gầy dần, rụng dần, cong cột sống, bụng hõm, có thể có vết loét hoặc u hạt. Bệnh âm ỉ, lây lan chậm, khó chữa. Lao cá có thể lây sang người qua vết xước, nên khi xử lý cá bệnh hoặc xác chết phải đeo găng tay và rửa tay kỹ.
> 2. **Nhiễm kh…

### sick-01 · tank · plain wins (5 · 6)

**Asked:** Cá ngựa vằn của tôi cứ vài tuần lại có con cong người rồi chết, là bệnh gì?

**Judge:** Y is the better answer: it puts fish TB first, which is likely for slow deaths with a curved spine, warns about glove use, and gives a clear checklist. Neither answer says that fish nearly 3 years old are old for zebra danios, and old age can also cause a curved spine. / Cả hai đều không nhắc rằng cá đã gần 3 năm tuổi, mà cong cột sống do già là chuyện thường gặp ở tuổi này. X nêu được bệnh lao cá và cảnh báo đeo găng tay vì bệnh có thể lây sang người. Y có các bước theo dõi rõ hơn nhưng bỏ sót bệnh lao và cứ dẫn "cẩm nang" mãi.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Triệu chứng cá cong người, gầy dần rồi chết từng đợt là giống bệnh gầy (microsporidiosis, do ký sinh trùng Pseudoloma neurofilia gây ra) mà cẩm nang mô tả ở cá ngựa vằn. Bệnh làm cá gầy mòn kéo dài và cong cột sống, lây qua đường miệng, và có thể có con trông khỏe mạnh vẫn đang mang bệnh. Tôi chỉ đoán được qua triệu chứng bạn kể, chưa chắc chắn, vì cẩm nang cũng nhắc đến bệnh neon tetra và bệnh do vi khuẩn Flavobacterium columnare có triệu chứng gần giống. Cẩm nang ghi cả hai bệnh này đều khó chữa khi đã nặng.
> 1. Vớt riêng ngay các con đang cong người, gầy hoặc bơi tách đàn, và để chúng ở bể …

**Plain** (1884 characters):

> Cá ngựa vằn bị cong người rồi chết thường gặp trong vài bệnh sau. Tôi không thể chẩn đoán chắc chắn chỉ từ mô tả, nhưng các khả năng phổ biến nhất là:
> 
> 1. **Bệnh lao cá (mycobacteriosis)** do *Mycobacterium* spp. Đây là bệnh mạn tính, hay gặp ở cá ngựa vằn và hay gây cong cột sống, gầy rộc, bụng phình, có thể có u hạt. Cá bệnh thường chết dần trong nhiều tuần, lây qua cá khác và có thể lây cho người.
> 
> 2. **Microsporidia *Pseudoloma neurophilia*** là ký sinh trùng gây tổn thương thần kinh và cột sống. Cá thường bơi bất thường, co giật, cong vẹo rồi gầy yếu và chết dần.
> 
> 3. **Nhiễm virus Nodavi…

### sick-02 · post · plain wins (6 · 8)

**Asked:** Nguyên nhân cá chết là gì ạ? Em có bể cá vàng, 7 màu và mấy loại linh tinh rẻ rẻ cho con chơi, nuôi trong nhà, mật độ thưa. Lọc với sục oxy chạy 24/24, nước trong sạch; em cho ăn rất ít, thức ăn viên mua sẵn; ít thay nước, chỉ thay khi thấy vẩn đục, có xử lý clo trước khi cho nước vào. Cái mút xốp lọc em giặt nước lã suốt vì phân cá hút lên nhanh bẩn. Vậy mà tuần nào cũng có con chết, tháng nào cũng đi mua thêm mà cứ chết dần.

**Judge:** Both answers name the same cause: the filter bacteria died and ammonia and nitrite built up. Y is better because it explains why that happened. It also gives a weekly water-change percentage, warns about chloramine, quotes a realistic price for a test kit and says to stop buying more fish. X gives a temperature range that can't be held in Vietnam's heat and leaves out the point about not adding new fish. / Cả hai đều chỉ đúng thủ phạm là mút lọc giặt nước lã cộng với ít thay nước. X đưa ra các bước thực tế hơn, có lượng thay nước hằng tuần, và cảnh báo đúng chuyện nuôi chung cá vàng với cá nhiệt đới. Y gọn và có trích cẩm nang hữu ích, nhưng lại khuyên giữ nước 20–23°C, điều khó làm ở Việt Nam, và bảo đo oxy hòa tan, điều người nuôi tại nhà khó làm được.

**Ours lacks:** local, tank-fit, figures. **Plain lacks:** too-long, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Nguyên nhân khả dĩ nhất là nước đang xấu dần dù nhìn vẫn trong. Vì ít thay nước nên amoniac và nitrit tích lại, và cá vàng thải rất nhiều chất bẩn. Cái mút lọc giặt bằng nước lã có thể đã giết vi khuẩn lọc sinh học, nên bể không còn phân hủy được chất thải. Em chưa có số đo nên chưa chắc chắn, hãy đo nước trước khi làm.
> 1. Mua bộ thử nước và đo amoniac, nitrit, nitrat, pH, oxy hòa tan và clo. Nếu amoniac hoặc nitrit có số đo, thay ít nhất 50% nước và ngưng cho ăn vài ngày.
> 2. Từ bây giờ không giặt mút lọc bằng nước lã. Rửa mút trong nước bể vừa rút ra khi thay nước.
> 3. Thay nước theo lịch cố …

**Plain** (2226 characters):

> Nguyên nhân khả năng cao nhất là **độc tố amoniac/nitrit do hệ vi sinh lọc bị phá hỏng**. Cá chết dần, tháng nào cũng phải mua thêm là dấu hiệu điển hình của việc này.
> 
> **Vì sao xảy ra:**
> 
> 1. **Giặt mút lọc bằng nước máy/nước lã là nguyên nhân chính.** Trên mút lọc có một lớp vi khuẩn có lợi (vi khuẩn nitrat hóa) chuyên phân hủy amoniac từ phân và thức ăn thừa thành nitrit, rồi thành nitrat ít độc hơn. Clo trong nước máy và việc giặt sạch làm chết lớp vi khuẩn này. Bể mất khả năng "dọn" chất thải, amoniac tích tụ dần, cá chết từ từ. Bể trông vẫn trong nhưng độc tố vô hình.
> 
> 2. **Thay nước quá…

### sick-02 · tank · ours wins (7.5 · 5)

**Asked:** Bể tôi tuần nào cũng có cá chết dù nước trong và cho ăn ít, nguyên nhân là gì?

**Judge:** X ties the deaths to this tank's own habits: water is changed only when it turns cloudy, and the filter sponge is washed in tap water. That points to waste building up and the filter bacteria getting killed off. X then gives steps in order with thresholds and flags that goldfish and guppies don't belong together. Y is a long generic list of ten causes, including overstocking and a heater, which don't fit this sparsely stocked tank, and it never says which cause is most likely here. / Y uses this keeper's own habits. It names the two likely causes: they only change water when it goes cloudy, so waste builds up (old tank syndrome), and they rinse the filter sponge in tap water, which kills the good bacteria. It gives safe ammonia and nitrite limits, steps in order, and flags the goldfish-and-guppy mix. X is a long generic list of ten causes, and its heater checks don't fit an unheated room-temperature tank in Vietnam. It never ties any cause to how this keeper runs their tank.

**Ours lacks:** figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 4 pages, stopped at the calls limit):

> Nguyên nhân có khả năng nhất là chất bẩn tích dần trong nước: amoniac, nitrit, nitrat và khoáng không nhìn thấy được, dù nước trong. Bể của bạn chỉ thay nước khi vẩn đục và chỉ châm thêm nước khi hao hụt, đúng kiểu mà cẩm nang gọi là hội chứng bể cũ (old tank syndrome). Lọc vi sinh cũng có thể yếu nếu mút lọc được giặt bằng nước máy. Tôi chưa thể khẳng định vì chưa có số đo nước của bạn, nên cần kiểm tra trước.
> 1. Đo ngay amoniac, nitrit, nitrat, pH, oxy và clo (nếu dùng nước máy); amoniac NH3 trên 0,05 mg/L đã hại mang, nitrit trên 0,1 mg/L bắt đầu độc.
> 2. Nếu amoniac hoặc nitrit cao, ngưng …

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

### sick-03 · post · plain wins (3 · 7)

**Asked:** Hồ em trồng minifiss, ráy và ít cắt cắm (sunset, rong la hán), nuôi tép màu và ít cá (bảy màu, otto, pigmy). pH lúc có CO2 đo được 7, KH 4, GH 8, TDS 360; nước nguồn TDS cao (160-200). Rong èo uột không phát triển, ráy ra lá non nhưng không khỏe, có rêu xanh bám lá, fiss phát triển chậm. CO2 em để 2-3 giọt/giây nhưng test CO2 vẫn báo thiếu. Tép bị chết lai rai, cá tầm 1-2 tuần chết 1 con. Có cách nào hạ TDS không, hay do đâu?

**Judge:** Y reads the numbers correctly: KH 4 at pH 7 gives about 12 ppm CO2, so the CO2 kit is probably reading wrong. It also explains that topping up evaporation with tap water pushes TDS up, says to lower TDS gradually with RO water, and gives an ordered checklist for the shrimp deaths (ammonia/nitrite, copper, chlorine). X is thin, hedges, and doesn't answer how to lower TDS or why the animals are dying. / X gives an ordered plan that fits this tank. It covers lowering TDS with RO/demineralised water, testing NH3/NO2 and copper, and Neocaridina vs Caridina. But it is wrong to say 12 ppm CO2 is enough, and it mistakes "tầm" for a fish. Y correctly puts CO2 first, but it is thin and vague, mostly sends the reader to the guide, and admits it hasn't read the water-parameter section.

**Ours lacks:** diagnosis, too-thin, figures, plan. **Plain lacks:** too-long, diagnosis.

**Ours** (read 1 pages, stopped at the tools limit):

> Nguyên nhân khả dĩ nhất là CO2 và cân bằng ánh sáng–CO2–dinh dưỡng chưa ổn, nên cây lên chậm, lá non yếu và rêu xanh bám. Hướng dẫn nói rõ chỉ tăng đèn thì không bù được thiếu CO2, và mức CO2 phải đi cùng cường độ sáng. Tôi chưa đọc được phần đo CO2 và phần thông số nước trong cẩm nang nên chưa chắc chắn về cách hạ TDS và về nguyên nhân tép, cá chết.
> 1. Đối chiếu số giọt/giây với thể tích bể và cường độ đèn theo mục cân bằng CO2 và ánh sáng, rồi tăng CO2 từ từ.
> 2. Kiểm tra lại thời gian chiếu sáng, theo cẩm nang nên khoảng 8 đến 12 giờ mỗi ngày và chia đèn thành nhiều đợt.
> 3. Xem lại lượng ph…

**Plain** (3801 characters):

> Mình nghĩ vấn đề không nằm ở một yếu tố mà là chuỗi liên quan: nước cứng và TDS cao, phần đo CO2 chưa chắc đúng, và có thể dinh dưỡng hoặc độc tố đang gây stress cho tép và cá.
> 
> ## 1. Đọc lại thông số
> 
> - **CO2:** Với KH 4 dKH (~71 ppm) và pH 7, lý thuyết CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển. Nếu test kit báo thiếu thì khả năng cao là kit đã hết hạn, đọc sai bảng màu, hoặc pH meter chưa hiệu chuẩn. Bạn nên:
>   - Hiệu chuẩn lại pH meter bằng dung dịch chuẩn 4.0 và 7.0.
>   - Dùng drop checker để theo dõi xu hướng (xanh vàng là đủ CO2 hay chưa).
>   - Đo pH sáng sớm trước khi bật đèn và …

### sick-03 · tank · ours wins (5.5 · 4)

**Asked:** Tép trong bể tôi chết lai rai và cá thỉnh thoảng chết một con, có phải do TDS cao không?

**Judge:** Tôi chọn X. X dùng số liệu của bể (TDS 360 so với nước nguồn 160–200), cho các bước làm theo thứ tự kèm ngưỡng amoniac/nitrit, và chỉ ra chuyện tép kẹt vỏ khi lột. Tuy vậy X đọc sai nguồn gốc TDS và không nhắc tới chuyện CO₂ không ổn định hay việc thay nước để hạ TDS tích tụ. Y thì chung chung, nói về tép Caridina, liệt kê dài và hỏi lại những thông tin đã có. / Y uses the tank's real numbers, tells the hobbyist to look for shrimp stuck in their molt, and gives toxicity limits. But it misreads where the TDS comes from, and its 50% water change risks shocking the shrimp. X is generic, assumes the wrong shrimp, and asks for data the hobbyist already has. Neither answer connects the death pattern to the TDS doubling inside the tank or to the CO₂ setup.

**Ours lacks:** diagnosis, tank-fit. **Plain lacks:** tank-fit, diagnosis, too-long, asks-only.

**Ours** (read 5 pages, stopped at the tools limit):

> Chưa đủ cơ sở để kết luận TDS cao là thủ phạm. Bể bạn đo TDS 360, cao hơn mốc 120–160 mà cẩm nang TDS dùng cho bể thủy sinh, nhưng nước nguồn của bạn đã 160–200 nên phần lớn TDS đến từ nước máy. Cẩm nang không ghi TDS cao tự giết tép hay cá. Tép chết lai rai thường do lột xác hỏng hoặc già, còn cá chết lẻ tẻ hay do chất lượng nước như oxy, amoniac, nitrit.
> 1. Nhặt xác tép và xem có con nào kẹt vỏ khi lột không, vì tép kẹt vỏ khi lột gần như luôn chết.
> 2. Đo amoniac, nitrit, oxy hòa tan và pH. Amoniac NH3 trên 0,05 mg/L đã hại mang, nitrit trên 0,1 mg/L bắt đầu độc, oxy dưới 5 mg/L cá bắt đầu …

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

### sick-04 · post · plain wins (4 · 6)

**Asked:** Mình chơi bể 60x40x40, set được gần 3 tháng, layout núi đá dùng đá da voi màu trắng nên pH ở ngưỡng 7,8-8. Thảm nền trồng trân châu ngọc trai, mấy ngọn rau thơm cắm khe đá, có vảy ốc xanh và vảy ốc đỏ. Để hạ pH, mình bổ sung thêm vật liệu lọc Neo Soft, vừa cho vào chạy thì chỉ khoảng 10 giây sau tép chạy loạn hết rồi chết dần. Sau đó thảm trân châu và rau thơm bị rữa lá, pH luôn ở 8,4, sục CO2 cũng chỉ xuống 7,4 trong khi nước đầu vào 7,0 trở xuống. Vảy ốc thì có vết như gãy ngang ngọn lá nhưng lá vẫn xanh, không rụng. Mình nên xử lý sao?

**Judge:** Y is more useful. It names the likely causes: the đá da voi rock pushing KH up so CO2 can't lower pH, and ammonia from dead shrimp and rotting leaves, which is more toxic at pH 8.4. It also gives the real fix: RO water and less of that rock. Y does mistake vảy ốc (Rotala) for a snail. X turns off CO2 using a guide meant for pH falling, which is the wrong direction for this tank, and it never addresses the rock or KH. / X giải thích đúng vì sao CO2 chỉ kéo được xuống 7,4: đá da voi đẩy KH lên cao, và hướng xử lý lâu dài bằng nước RO là hợp lý. Tuy vậy X hiểu nhầm vảy ốc là con ốc, trong khi đây là cây Rotala. Y lấy nguyên quy trình xử lý pH tụt (tắt CO2, sục khí) áp vào một bể đang bị pH cao, nên đi ngược hướng, và cũng bỏ qua triệu chứng của vảy ốc.

**Ours lacks:** diagnosis, tank-fit, wrong. **Plain lacks:** wrong, too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là sốc hóa học và pH sụt/nhảy đột ngột. Tép chạy loạn và chết chỉ 10 giây sau khi cho Neo Soft vào, nên vật liệu này gần như chắc chắn là thủ phạm. Cuốn cẩm nang chưa có trang nào về Neo Soft, nên mình không biết thành phần của nó. Đá da voi trắng cũng góp phần làm pH cao, vì cẩm nang ghi đá da voi đẩy pH và TDS lên. Cẩm nang cảnh báo pH đổi đột ngột là nguy hiểm, còn pH dao động nhẹ trong ngày thì bình thường.
> 1. Lấy Neo Soft ra khỏi lọc ngay và giữ nước bể ổn định, không đổ thêm gì nữa.
> 2. Tắt CO2 tạm thời, tăng sục khí và làm xáo động mặt nước để đẩy bớt CO2.
> 3…

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

**Judge:** X đọc được dữ liệu bể: pH 8,4 và vừa thêm Neo Soft. X chỉ đúng nguyên nhân là pH đổi đột ngột và bảo tháo Neo Soft ra, nhưng thiếu con số cụ thể và bỏ qua đá da voi cùng CO₂ làm pH dao động. Y có kế hoạch rõ hơn (sục khí, thay 20-30% nước) nhưng chung chung, không dùng dữ liệu bể và còn hỏi lại thông tin app đã có. / Y wins. It names the likely cause for this tank: Neo Soft pulled pH down fast from 8.4, and the speed of the change hurt the shrimp, not the lower pH itself. It also gives ordered steps. But it gives no water-change % and misses the root problem: the white elephant-skin stone (đá da voi) keeps pushing pH up. X has more numbers and tells them to add aeration, but its advice is generic and it asks for details the app already holds.

**Ours lacks:** figures, tank-fit. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 2 pages, stopped at the calls limit):

> Nguyên nhân khả dĩ nhất là pH bị đổi đột ngột: bể đang ở pH 8,4, nên việc thêm Neo Soft kéo pH xuống nhanh làm tép stress và có thể chết. Cẩm nang ghi tép red cherry thích pH 6,5-8,0, nên chính pH thấp hơn không phải vấn đề, mà là tốc độ thay đổi. Tôi chưa đọc được trang riêng về Neo Soft nên chưa xác định được vật liệu đó có thêm chất gì khác, mức độ chắc chắn ở đây là trung bình.
> 1. Đo pH ngay và tách tép còn sống sang một thùng nhỏ có nước cũ nếu có thể.
> 2. Lấy Neo Soft ra khỏi lọc, không thêm lại vật liệu này cho đến khi ổn định.
> 3. Thay nước từng phần nhỏ, dùng nước có pH gần với bể, để …

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

### sick-05 · post · not judged

**Asked:** Bể của tôi set được 2 tháng, có đèn, oxy, CO2, nhưng gần đây nước trong bể có màu vàng nâu, cá thì chết lai rai. Tôi thay nước cách ngày 50% (dùng nước lọc loại mua uống hằng ngày) mà vẫn không hết. Giúp tôi với.

**Ours** (read 5 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (3054 characters):

> Nước vàng nâu kéo dài kèm cá chết dần thường có nguyên nhân chính không phải là "nước bẩn" đơn thuần. Bạn nên kiểm tra theo thứ tự sau.
> 
> ## 1. Xác định màu nước do đâu
> 
> - **Tannin (chất màu từ gỗ, lá):** Nếu bạn có lũa, lá bàng, lá khô, hoặc than bùn, nước sẽ vàng nâu như trà. Loại này thường không gây hại trực tiếp, nhưng không thể gây cá chết hàng loạt.
> - **Chất hữu cơ phân hủy:** Thức ăn thừa, cá chết, lá úa, phân cá tích tụ, nền đất/sỏi bị thối. Đây là nguyên nhân hay gặp nhất khi bể mới 2 tháng.
> - **Tảo silic (diatom):** Lớp màu nâu bám trên kính, lá, sỏi, thường gặp ở bể mới có đèn mạnh…

### sick-05 · tank · ours wins (7.25 · 4)

**Asked:** Nước bể tôi ngả vàng nâu và cá chết lai rai dù thay nước thường xuyên, vì sao?

**Judge:** X chỉ ra đúng nguyên nhân có khả năng nhất trong bể này: nước đóng bình ít khoáng làm KH thấp, cộng thêm CO₂ nên pH dễ tụt mạnh. X cũng đưa ra các bước sửa có thứ tự. Y thì liệt kê đủ thứ nguyên nhân chung chung, không dùng đến thông tin về nước đóng bình và CO₂ của bể, rồi kết thúc bằng một loạt câu hỏi ngược lại. / Y is the better answer. It uses what we know about the tank: they change 50% of the water every other day with bottled drinking water, and they run CO₂. Low-mineral water plus CO₂ can make KH and pH crash, which is a likely cause of the slow fish deaths. Y gives steps in order: measure pH, KH and GH, mix in treated tap water, adjust or turn off CO₂ at night, and make smaller water changes. X is a long, generic list that misses the bottled water and the CO₂ completely.

**Ours lacks:** figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 4 pages, stopped at the tools limit):

> Màu vàng nâu thường do tannin từ lũa tiết ra, cẩm nang ghi rõ là không hại cá, nên đây chưa phải thủ phạm cá chết. Cá chết dần dù bạn thay nước đều thường liên quan đến chất lượng nước bị lệch: nước đóng bình ít khoáng làm pH và KH dễ tụt, và CO2 đang bật càng đẩy pH xuống. Tôi chưa đọc được hết trang về pH, GH, KH nên đây là suy đoán mạnh từ chi tiết của bạn, cần đo để xác nhận.
> 1. Đo pH, KH và GH bằng bộ test trước lần thay nước kế tiếp, và ghi lại mỗi ngày trong một tuần.
> 2. Ngừng thay bằng nước đóng bình 100%, pha thêm nước máy đã xử lý hoặc nước đã khử clo để khoáng ổn định hơn.
> 3. Nếu p…

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

### sick-06 · post · plain wins (5 · 7.5)

**Asked:** Bể cá rồng nhà em dùng hơn 20 năm bị rò nên phải thay bể mới. Từ hôm chuyển sang bể mới, 2 con cá rồng bỏ ăn luôn, được gần 1 tuần rồi. Cá mồi vẫn bơi trong bể mà rồng không chịu ăn. Em theo dõi thì 2 con vẫn bơi bình thường, chưa nằm đáy. Phải làm sao?

**Judge:** Y nói đúng nguyên nhân dễ gặp nhất là bể mới chưa chạy vi sinh (chưa "cycle"). Y cũng chỉ cách xử lý cụ thể cho cá rồng: chuyển vật liệu lọc từ bể cũ sang, thay nước từng phần, dán tối ba mặt bể, đậy nắp kỹ, kích thích ăn bằng mồi sống. Y có nói thêm khi nào phải lo gấp. X thì chung chung, tự nhận không có tài liệu về cá rồng chuyển bể, và không nhắc đến việc bể mới chưa chạy vi sinh. / X nắm đúng điểm chính với cá rồng: chuyển bể thì rồng hay bỏ ăn lâu, nên cần giảm stress (dán kín ba mặt kính, giảm đèn, đậy nắp vì rồng hay nhảy) và đổi sang mồi rồng thích như dế, tôm. Y lại áp mốc ăn lại sau 2–3 ngày của cá thường, nên báo động quá mức, và tự nhận là chưa đọc phần riêng về cá rồng.

**Ours lacks:** diagnosis, tank-fit, too-thin, local. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Theo cẩm nang, cá mới chuyển bể thường bị stress và bỏ ăn trong 24–72 giờ đầu, và phần lớn sẽ ăn lại sau 2–3 ngày. Hai con nhà bạn đã nhịn gần một tuần, nên nhiều khả năng không chỉ là stress. Cá vẫn bơi bình thường và không nằm đáy là dấu hiệu tốt, nhưng nước bể mới (amoniac, nitrit), nhiệt độ, thức ăn hoặc việc hai con tranh chỗ ăn có thể đang là nguyên nhân. Mình chưa đọc được các mục chi tiết về cá rồng chuyển bể, nên đây là suy luận từ cẩm nang chung về bỏ ăn.
> 1. Test nước ngay bằng bộ test nhỏ giọt: amoniac, nitrit, nitrat, pH. Nếu amoniac hoặc nitrit trên 0, thay 30–50% nước.
> 2. Đo nhi…

**Plain** (3108 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là chuyện khá thường gặp. Nếu cá vẫn bơi bình thường, không nằm đáy, không đổi màu thì chưa phải cấp cứu, nhưng bỏ ăn gần 1 tuần thì bạn cần xử lý ngay. Bạn nên làm theo các bước sau.
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻):** Bể mới chưa chạy nitơ (chưa "cycle") thì hai chỉ số này dễ tăng cao và gây stress, mất cảm giác thèm ăn. Mục tiêu là 0 ppm cho cả hai.
> - **Nitrat:** Giữ dưới 40 ppm, lý tưởng dưới 20 ppm.
> - **pH và độ cứng:** Khác biệt lớn so với bể cũ cũng gây sốc. Nếu nước bể cũ và bể mới khác nhau nhiề…

### sick-06 · tank · ours wins (7 · 6)

**Asked:** Cá rồng của tôi bỏ ăn gần một tuần từ khi chuyển sang bể mới, làm sao?

**Judge:** Both answers start with testing ammonia and nitrite, which is right for a tank that has run only 1 week. X is short, gives clear steps and uses the hobbyist's details. Y names the uncycled new tank as the likely cause more clearly, but it is long and generic and asks for information that is already known. / Neither answer says the most likely cause: the tank has run for only one week and may not have cycled yet. Neither asks whether the old filter media was moved over. Y is still the better answer: it is short and specific, mentions the cá mồi, and gives a local trick (warm the water slightly and feed live worms) with things to watch. X is a long checklist that would fit any tank and asks for details the app already holds.

**Ours lacks:** diagnosis, follow-up, tank-fit. **Plain lacks:** too-long, tank-fit.

**Ours** (read 4 pages, stopped at the tools limit):

> Cá rồng bỏ ăn gần một tuần sau khi chuyển sang bể mới thường là do stress vì bị bắt và thả vào chỗ lạ, nhất là khi bể mới chưa ổn định về nước. Cá vẫn bơi bình thường nên nhiều khả năng chưa bệnh nặng, nhưng bạn nên kiểm tra nước trước khi chờ thêm. Cẩm nang cho biết thường khoảng một tuần rồng sẽ bắt đầu ăn lại.
> 1. Test ngay amoniac và nitrit trong bể mới; nếu trên 0, hoặc nitrat trên 40 ppm, thay 30–50% nước.
> 2. Đo pH, độ cứng và nhiệt độ, dùng nhiệt kế thứ hai để chắc nhiệt kế đang dùng không bị sai.
> 3. Một cách làm của một người nuôi là nâng nhiệt độ lên một chút rồi cho ăn giun sống, thư…

**Plain** (2612 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là phản ứng khá phổ biến vì chúng rất nhạy với stress. Tuy vậy, một tuần là đủ lâu để bạn cần kiểm tra kỹ. Bạn có thể làm theo các bước sau:
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - Dùng bộ test để đo **amonia (NH₃/NH₄⁺), nitrit (NO₂⁻), nitrat (NO₃⁻), pH, nhiệt độ**.
> - Amonia hoặc nitrit lớn hơn 0 là dấu hiệu nguy hiểm. Bể mới chưa chạy xong chu trình nitơ (cycling) rất dễ xảy ra tình trạng này.
> - Nếu có amonia/nitrit: thay 25–30% nước mỗi ngày, dùng nước đã khử clo và có nhiệt độ, pH gần với bể cũ. Không thay quá nhiều một lúc vì sẽ gây sốc thêm.
> -…

### sick-07 · post · plain wins (6.25 · 7.5)

**Asked:** Em vừa lật bể, vứt nền sỏi nhỏ đi vì thấy bẩn quá, thì tự nhiên thấy 1 con bị như nấm trắng. Em đang tách riêng, cho ít muối hột vào xem có khỏi không. Như vậy đã đúng chưa, cần làm gì thêm?

**Judge:** Y nói đúng điều quan trọng nhất: bỏ hết nền sỏi là bỏ luôn vi sinh, nên amoniac và nitrit có thể tăng. Y cũng bảo test nước bể chính, đưa liều muối hợp lý (1–2 g/lít), cách phân biệt nấm, đốm trắng và vi khuẩn, và bước tiếp theo là xanh methylen. X thì liều muối và cách cách ly ổn, nhưng không nhắc tới chuyện vi sinh bị mất sau khi vứt sỏi, lại bảo chuyển cá sang bể cách ly dù bạn ấy đã tách rồi. / X nhận ra việc vứt sỏi làm mất vi sinh, dễ khiến amoniac và nitrit tăng, nên bảo test nước và thay nước bể chính. Đây là nguyên nhân gốc mà Y bỏ qua. Y gọn hơn và có liều muối theo cẩm nang, nhưng không xử lý được rủi ro ở bể chính.

**Ours lacks:** diagnosis, tank-fit, follow-up. **Plain lacks:** too-long.

**Ours** (read 6 pages, stopped at the tools limit):

> Nhiều khả năng con cá bị nấm vì yếu sau đợt lật bể: nước bị khuấy, cá stress, và nấm là bệnh cơ hội, chỉ bám vào cá đã suy yếu. Việc tách cá và dùng muối hột là đúng hướng theo cẩm nang, nhưng bạn cần làm chắc các bước sau:
> 1. Chuyển cá sang bể cách ly sạch, nước đã ổn định, không để muối vào bể chính có cây, tép hay ốc.
> 2. Châm muối hột mức 1: 1 muỗng canh cho khoảng 11 lít nước, ngâm 5 đến 7 ngày.
> 3. Khi cá hết triệu chứng, rút muối dần bằng cách thay 30% nước mỗi tuần. Nếu nấm vẫn còn, lên mức 2: 1 muỗng canh cho khoảng 7,5 lít nước.
> 4. Nếu dùng thêm thuốc, làm đúng theo nhãn, không tự tăn…

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

### sick-07 · tank · ours wins (7 · 6)

**Asked:** Sau khi lật bể, một con cá của tôi bị nấm trắng, tách riêng và cho muối đã đủ chưa?

**Judge:** X answers the hobbyist's question directly. It confirms that isolating the fish was right, gives salt doses in steps backed by the guide, says how to step the salt back down, and warns that a white patch on the mouth is usually a bacterial infection, not fungus. Y does well to point to bad water after the tank was redone and to suggest xanh methylene, but it is more generic. It asks for information the app already holds and does not use the fact that the fish is already isolated and getting rock salt. / Y is the better answer for this hobbyist. It confirms that separating the fish and using muối hột was right, then gives clear dose steps (level 1, raising to level 2 or 3), a 5–7 day course and how to withdraw the salt, and it backs this up with guide excerpts. Its main gap is that it never says to test the main tank, whose cycle was likely disrupted when the gravel came out. X does cover that cause (ammonia/nitrite after a tank flip) and suggests xanh methylene, but its advice is more generic, it ignores the muối hột the hobbyist already used, and it ends by asking for details. The overall pick is Y, though only narrowly.

**Ours lacks:** diagnosis, follow-up. **Plain lacks:** tank-fit, too-long, local.

**Ours** (read 6 pages, stopped at the calls limit):

> Muối có thể đang đúng hướng, nhưng chưa thể nói là đủ vì còn phụ thuộc vào liều và việc nấm có hết hay không. Cẩm nang cho biết muối hột trị được nấm thân và nấm miệng, và nấm thường bùng lên khi cá đang yếu hoặc stress, như sau khi bể bị xáo trộn. Bạn đã tách cá riêng là đúng, vì muối sẽ hại cây và tép trong bể chính.
> 1. Châm muối ở mức 1, tức 1 muỗng canh cho khoảng 11 lít nước, và ngâm 5 đến 7 ngày.
> 2. Nếu cá hết triệu chứng, rút muối dần bằng cách thay 30% nước mỗi tuần.
> 3. Nếu nấm vẫn còn, tăng lên mức 2 (1 muỗng canh cho khoảng 7,5 lít), rồi mức 3 nếu cần. Ca nặng có thể vào thẳng mức 2…

**Plain** (1892 characters):

> Muối **chưa đủ** nếu bạn chỉ dùng muối. Cá bị nấm sau khi lật bể thường là hệ quả của nước xấu (amoniac, nitrit tăng cao), nên cần xử lý cả nguyên nhân lẫn con cá.
> 
> **Việc nên làm ngay:**
> 
> 1. **Cách ly cá đúng cách:** Dùng bể riêng có sục khí, lọc nhẹ hoặc không lọc (tránh hút cá vào máy), không trồng cây, không đặt nền sỏi.
> 2. **Kiểm tra nước bể cũ và bể cách ly:** Dùng bộ test để đo NH3/NH4+, NO2-, NO3-, pH. Nếu amoniac hoặc nitrit > 0, thay nước ngay (khoảng 30-50%) và thay từng phần hằng ngày cho đến khi ổn định. Nước bể cách ly phải sạch, cùng nhiệt độ và pH với bể cũ.
> 3. **Thuốc trị nấm…

### sick-08 · post · ours wins (7 · 6)

**Asked:** Hồ mình đang có rêu tảo hại nên mình thử nuôi otto. Thả vào thì cá rất khỏe, bơi kiếm ăn (không quá manh động), nhưng sau một đêm 3 con chết hết, sáng ra thấy nằm im, đụng vào không nhúc nhích. Cùng lúc đó có một đàn neon trong bể vẫn bình thường mà otto thì chết. Vì sao vậy?

**Judge:** X chỉ ra nguyên nhân hay gặp nhất: otto thường là cá bắt tự nhiên, yếu sẵn, bị sốc khi thả hoặc thả vào bể còn non. X gọn và có các bước cụ thể. Y liệt kê rộng hơn và có nhắc đúng chuyện hóa chất diệt rêu, nhưng lại xếp thiếu oxy là khả năng cao nhất, điều này không khớp với việc neon vẫn khỏe. Y cũng dài và dàn trải. / Y names the most common real cause: ottos are often wild-caught, weak and stressed by acclimation. Its steps are short, in order, and give the otto's temperature and pH range, which matters in Vietnam's heat. Y does leave out the possibility of algae-killing chemicals. X spreads across five possible causes, ranks low night oxygen first without good reason, and is long. Its point about chemicals is useful, though.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** too-long, diagnosis.

**Ours** (read 4 pages):

> Nhiều khả năng otto bị sốc khi nhập bể, không phải do tảo. Theo cẩm nang, cá otto hay là cá bắt tự nhiên, chịu stress kém, nên mỗi đợt nhập thường có vài con chết trong những ngày đầu. Nếu bể còn mới hoặc pH, nhiệt độ lệch đột ngột lúc thả thì cá cũng dễ chết. Neon khỏe hơn nên vẫn bình thường. Mình chưa biết bể bạn đã chạy bao lâu hay cá mua từ đâu, nên đây là suy đoán từ cẩm nang.
> 1. Kiểm tra bể đã chạy ổn định chưa; nếu bể mới set thì chờ thêm trước khi thả otto nữa.
> 2. Đo pH và nhiệt độ bể, đối chiếu với otto: khoảng 21–26°C và pH 5,5–7,5, quan trọng nhất là giữ ổn định.
> 3. Lần sau, làm q…

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

### sick-08 · tank · plain wins (4.5 · 6.5)

**Asked:** Tôi thả cá otto ăn rêu mà sau một đêm chết hết trong khi neon vẫn khỏe, vì sao?

**Judge:** Y nêu đúng các nguyên nhân hay gặp khi otto chết qua đêm: amoniac hoặc nitrit, thiếu oxy ban đêm, sốc khi thả, clo, cá đã yếu từ cửa hàng. Y còn nhắc đồng trong thuốc diệt rêu, điều đáng lo vì bể đang có rêu hại, và cho các bước kiểm tra ngay. X đưa ra nguyên nhân chết đói, điều không thể xảy ra chỉ sau một đêm, và không bảo người nuôi kiểm tra nước ngay bây giờ. / X nêu đúng các nguyên nhân gây chết trong một đêm (NH₃/NO₂, thiếu oxy ban đêm, clo, thuốc diệt rêu chứa đồng, liên quan tới hồ đang có rêu hại) và bảo đo nước ngay. Y gọn hơn và bám tình huống hơn, nhưng đưa ra nguyên nhân sai (chết đói qua đêm), thời gian làm quen nước quá dài, và chỉ hướng dẫn cho lần thả sau.

**Ours lacks:** diagnosis, follow-up, local. **Plain lacks:** too-long, tank-fit, local.

**Ours** (read 3 pages):

> Nguyên nhân có khả năng nhất là cá bị sốc khi vào bể, không phải do bể có vấn đề với neon. Cá otto nhạy hơn neon với bể chưa ổn định, với thay đổi pH và nhiệt độ đột ngột, và với cá bắt tự nhiên không chịu ăn thức ăn viên. Cả đàn chết trong một đêm thường là dấu hiệu của sốc hoặc đói, không phải bệnh lây dần. Cẩm nang ghi hai nguyên nhân hay gặp là thả vào bể chưa ổn định, và cá bắt tự nhiên không ăn viên nên chết đói khi bể không đủ rêu; thông số nước đổi đột ngột cũng làm cá sốc. Tôi chưa biết bể của bạn đã chạy bao lâu, cá mua từ đâu và cách thả ra sao, nên đây là mức chắc chắn trung bình.…

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

### sick-09 · post · plain wins (4 · 7.75)

**Asked:** Nhà mình có bể cá ngoài trời 3x1,5m, sâu có 30 phân, đáy lát đá hoa, có hệ thống lọc nước và hút đáy, thêm 1 bơm nước tạo oxy. Trước mua koi về được mấy hôm là lăn ra chết, thế là thả cá chép cho khỏe, mà nay 6-7 con lại chết. Trời đang lạnh ngắt, mình không có dụng cụ đo oxy, không biết do trời lạnh hay sao. Bể này bố mình làm, trước có thả hoa súng nhưng cá rỉa hết. Bắt bệnh giúp mình, nên sửa lọc thế nào, có cần đào sâu thêm không, đáy lát đá hoa có ổn không?

**Judge:** X misreads the question (it thinks 6–7 carp were added when 6–7 died) and blames low oxygen, which is unlikely in cold weather. It also skips the depth and marble-floor questions. Y covers the likely causes: a 30 cm tank whose temperature swings sharply, ammonia from an immature filter, feeding in the cold, and disease from new fish. It gives clear steps, suggests buying a test kit, explains how to fix the filter, and answers the depth and marble questions properly. / X answers all three questions: the filter, digging deeper (a pit 80–100 cm deep) and the marble floor. It also covers stopping feeding in cold water and buying a test kit, with a sensible order of steps. Y blames low oxygen even though cold water holds more, misreads the 6-7 dead fish as fish that were added, and skips the depth and marble-floor questions.

**Ours lacks:** diagnosis, tank-fit, wrong, figures. **Plain lacks:** too-long.

**Ours** (read 5 pages, stopped at the tools limit):

> Nguyên nhân khả dĩ nhất là bể đang thiếu oxy, do nuôi quá đông so với thể tích nước, chứ chưa chắc do trời lạnh. Bể của bạn khoảng 3 x 1,5 x 0,3 m, tức khoảng 1.350 lít. Cẩm nang ghi mỗi con koi cần ít nhất khoảng 950 lít nước, nên bể này chỉ hợp với một con koi, trong khi bạn đã thả thêm 6-7 con cá chép. Dấu hiệu cá thiếu oxy trong cẩm nang là cá ngoi lên mặt nước đớp khí, mang banh ra và sẫm màu, cá lớn bị nặng hơn cá nhỏ, và trường hợp cấp tính có thể làm nhiều con chết cùng lúc. Nếu bạn thấy đúng các dấu hiệu này thì đây là nguyên nhân chính. Mình chưa đo được oxy, và chưa đọc được trong …

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

### sick-09 · tank · ours wins (6 · 3.5)

**Asked:** Cá trong bể tôi thả vào mấy hôm là chết, trời lạnh lại chết thêm, do đâu?

**Judge:** X ngắn gọn và đúng trọng tâm hơn: nêu được thiếu oxy, sốc khi thả và nước chưa ổn định, các bước làm có thứ tự, có dặn theo dõi bệnh đốm trắng. Tuy vậy X vẫn khuyên sưởi 1 W/lít, không thực tế cho hồ koi ngoài trời. Y viết chung chung kiểu bể cá nhiệt đới, đưa nhiệt độ 24–26°C, nhắc đến betta và neon, còn hỏi lại những thông tin đã có sẵn. / Y nắm được tình huống: bạn không đo được oxy, trời rét và cá là koi. Y đưa các bước theo thứ tự (đo nước, tăng sục khí, che chắn hồ) và dặn theo dõi đốm trắng, dù gợi ý sưởi 1 W/lít không thực tế với hồ ngoài trời. X trả lời chung chung như cho bể cá nhiệt đới trong nhà, bảo sưởi lên 24–26°C, rồi hỏi lại những thông tin mà bạn đã có sẵn.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, asks-only, wrong.

**Ours** (read 4 pages):

> Nhiều khả năng là hai việc cùng lúc: cá vừa thả bị sốc, và nước bể chưa ổn định (có thể thiếu oxy hoặc tích amoniac, nitrit) nên cá chết vài ngày sau khi thả. Đợt trời rét làm nhiệt độ tụt, cá yếu đi nên chết thêm. Bạn chưa đo được oxy, nên mình chưa chắc chắn, hãy kiểm tra trước. Theo cẩm nang, thiếu oxy làm cá ngoi lên đớp khí, mang banh và sẫm màu, và cá lớn thường bị nặng hơn.
> 1. Dùng bộ test nước đo amoniac, nitrit và oxy hòa tan ngay hôm nay.
> 2. Nếu amoniac hoặc nitrit cao, ngừng cho ăn và thay một phần nước bằng nước đã khử clo, theo nhãn sản phẩm.
> 3. Tăng sục khí và tạo xáo động mặt n…

**Plain** (2551 characters):

> Cá chết sau vài ngày thả vào và chết thêm khi trời lạnh thường có liên quan đến **chất lượng nước** và **nhiệt độ**. Các nguyên nhân thường gặp:
> 
> ## 1. Nước chưa "chín" (chưa cycling)
> Đây là nguyên nhân phổ biến nhất với bể mới.
> - Cá thải ra **amoniac (NH₃/NH₄⁺)**, và amoniac rất độc. Vi khuẩn có lợi trong bể chuyển nó thành nitrit, rồi thành nitrat, nhưng bể mới chưa đủ vi khuẩn nên amoniac và nitrit tích tụ.
> - Cá chết sau 2–7 ngày, thường có dấu hiệu thở gấp, nổi đầu lên mặt nước, mang đỏ hoặc tái, lờ đờ, bơi lảo đảo.
> - **Cách kiểm tra:** dùng bộ test nước (API hoặc tương đương) đo amoniac,…

### stocking-01 · post · ours wins (7 · 4.5)

**Asked:** Em mới tập chơi lại bể cá. Ban đầu hỏi loại nào dễ nuôi, khỏe thì được tư vấn mua 2 cá vàng, 2 con bống (bảo nó ăn phân thừa) và 2 con dọn bể. Được vài hôm 1 con cá vàng chết, nghi đánh nhau. Em mua thêm 10 con 7 màu bé thả vào, vài hôm còn 9, 8 rồi 7 mà không thấy xác. Lạ nhất là 1 con 7 màu bụng to như chửa cũng biến mất. Hôm qua 1 con bống chết, nay con dọn bể chết và mất thêm 2 con 7 màu. Con bống với con dọn bể còn nửa xác, thấy con bống còn lại thỉnh thoảng rỉa. Có phải chúng đánh nhau và con to ăn con bé không? Vậy chỉ được thả cá sàn sàn nhau thôi à?

**Judge:** X gets the likely cause right: the tank is overstocked and the water hasn't settled, then the fish eat the dead and weak ones. It also gives clear steps, like separating the guppies so fry can hide, and says what to watch for. Y gives some useful local context, for example that a bống is not a cleaner fish. But it calls guppies aggressive and says guppies should be kept with large fish in a tank of 200 litres or more, which is wrong and would mislead a beginner. / Cả hai đều nghi nước chưa ổn định là nguyên nhân chính, nhưng X nói sai về tính của cá bảy màu và đưa lời khuyên vô lý là nuôi chúng với cá lớn trong bể 200 lít. Y chẩn đoán đúng (cá chết trước rồi mới bị rỉa xác, cá lớn ăn cá nhỏ), các bước làm có thứ tự, có cách theo dõi và hướng tách bể hợp lý.

**Ours lacks:** figures, local. **Plain lacks:** wrong, too-long, tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng bể đang bị quá tải và nước chưa ổn định, rồi cá lớn hoặc cá đáy ăn luôn cá bảy màu con và xác cá chết. Cẩm nang ghi cá vàng cần bể tối thiểu 80 lít (một cặp là 160 lít), thải nhiều chất bẩn và cần nước mát 20–23°C. Cá bảy màu cần nước 21–26°C và có sưởi. Hai loài này khác nhau về nhiệt độ, và cẩm nang khuyên không nuôi chung cá vàng với cá bảy màu. Cá lớn cũng có thể ăn cá con mới đẻ, nên không chỉ cần cùng cỡ mà còn phải hợp nhiệt độ và chất nước. Tôi chưa biết loài bống và dọn bể em nuôi là gì nên chưa thể khẳng định hai con này ăn cá. Phần xác còn nửa cho thấy có cá chết trư…

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

### stocking-01 · tank · ours wins (6 · 5)

**Asked:** Bảy màu trong bể tôi cứ biến mất không thấy xác, có phải bị cá khác ăn không?

**Judge:** X uses this tank: it mentions the 10 guppies and the goby that picks at bodies, and gives ordered steps with a week of daily counting. It still misses that the goldfish are the likely culprit. Y is a generic checklist that names fish this hobbyist doesn't have and asks for details the app already holds, though its water-testing advice is useful. / Y uses the hobbyist's tank details (the 10 guppies and the gobies picking at bodies) and gives ordered steps plus a week of daily counts to follow up. X is a generic list that blames fish this tank doesn't have. Neither one points out the goldfish as the most likely culprit.

**Ours lacks:** diagnosis, follow-up, figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 3 pages):

> Nhiều khả năng là cá bột: bể bạn có 10 con bảy màu và cá mái đẻ liên tục, mà cá bột thì dễ thành mồi cho các cá khác trong bể, nên con mất đi nhanh đến mức không thấy xác. Cẩm nang ghi rằng cá con của cá bảy màu có thể thành mồi cho cá khác, và nuôi chung với loài nhỏ thì nhiều cá bột sống sót hơn. Ghi chú của bạn cũng cho thấy bống có rỉa xác, nên nếu có con chết thì bống có thể đã dọn mất. Tôi chưa chắc chắn tới mức nào vì chưa biết con mất là cá con hay cá lớn, bạn nên kiểm tra thêm để xác định.
> 1. Xem con mất có phải cá bột không; nếu bể có cá mái bụng to, cá bột có thể đang bị ăn ngay sa…

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

### stocking-02 · post · ours wins (6.5 · 5)

**Asked:** Hồ em 60x40x40, được 1 tuần, đang thả 5 mún + 5 chuột, cá đang tung tăng tốt. Em tính thả thêm 40 neon nữa vậy có nhiều không? Mún có sống chung với neon được không?

**Judge:** X is the better answer for this hobbyist. It correctly reads "mún" as platy, says plainly that platy can live with neon, and gives a safe way to add the fish: test the water, start with a small group of neon, then add more in batches. Y gives clearer numbers (20–30 neon, 2–3 batches 1–2 weeks apart), but it doesn't know what "mún" is and wrongly guesses at aggressive fish, so it misses half of what was asked. / Y nhận ra đúng mún là cá platy và xác nhận nuôi chung với neon được. Y cũng đưa ra kế hoạch thả cá theo đợt có thứ tự rõ ràng, gồm đo nước, thả trước 6 con, giữ nitrat dưới 40 ppm và theo dõi cá. X thì không biết mún là cá gì, đoán cả loài ăn thịt, rồi kết thúc bằng câu hỏi lại người hỏi.

**Ours lacks:** figures, local. **Plain lacks:** diagnosis, tank-fit, local, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Mún (cá platy) hợp với cá neon xanh theo trang cá platy trong cẩm nang, nên hai loài này có thể sống chung. Tuy nhiên, bể mới chạy được 1 tuần chưa đủ ổn định để nhận 40 con neon cùng lúc, nên em chưa nên thả hết một lần. Lúc này tôi chưa chạy được công cụ kiểm tra cá sống chung nên chưa có kết luận chính thức cho riêng cặp này.
> 1. Đo amoniac, nitrit và nitrat của bể trước, rồi tiếp tục theo dõi mỗi tuần trong 2 đến 3 tuần.
> 2. Thả trước một đàn nhỏ neon, khoảng 6 con là mức tối thiểu cẩm nang khuyến nghị cho đàn neon.
> 3. Khi nitrat luôn dưới 40 ppm và nước vẫn ổn, thả thêm đợt tiếp theo, khôn…

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

### stocking-02 · tank · ours wins (6 · 3.5)

**Asked:** Bể của tôi thả thêm 40 con neon có nhiều quá không, nuôi chung với mún được không?

**Judge:** X uses this hobbyist's 96 L tank, which already has platy and corydoras, and correctly advises adding only a few neons. It does duck the question of whether neon can live with platy, and it misses that the tank isn't cycled yet. Y doesn't recognise "mún", ignores the tank details, and suggests 40 neons could be fine, which is dangerous for a tank that's only one week old. / Y uses the real tank (96 L with platy and corydoras), says plainly that 40 is too many, and gives a cautious plan that suits a new tank, though its numbers rule looks made up and it doesn't answer whether neons get along with mún. X ignores the tank, doesn't recognise mún, and suggests 40 can be fine, which is risky in a tank that has only run 1 week.

**Ours lacks:** diagnosis, figures, follow-up. **Plain lacks:** tank-fit, asks-only, wrong, diagnosis.

**Ours** (read 4 pages, stopped at the calls limit):

> Theo cẩm nang, 40 con neon là quá nhiều cho bể của bạn. Bể 60×40×40 cm (khoảng 96 lít) đang có 5 cá platy (cá mún) và 5 cá chuột đồng. Với bể có lọc và sủi, cẩm nang chỉ cho thêm khoảng 30–50% số cá, tức khoảng 3 đến 5 con, và cá neon nên nuôi thành đàn từ 6 con trở lên. 40 con sẽ làm bể quá tải, dễ thiếu oxy và bẩn nước. Tôi chưa kiểm tra được neon có sống chung với platy và cá chuột đồng hay không, nên chưa thể khẳng định điều đó.
> 1. Giảm số neon xuống khoảng 6 con, không thả 40 con.
> 2. Kiểm tra lọc và sủi của bể trước; chỉ thêm neon khi lọc tốt và có sủi oxy.
> 3. Thả neon một lần số ít, rồi…

**Plain** (1103 characters):

> Nếu bể của bạn khoảng **100 lít trở lên** và có lọc tốt, thả thêm 40 con neon thường vẫn được, vì neon là cá đàn nhỏ, hiền. Nhưng 40 con khá đông, nên bạn cần kiểm tra vài điều:
> 
> - **Kích thước bể:** Bể dưới 60 lít mà có 40 con neon sẽ rất chật, dễ phát sinh ô nhiễm và stress. Neon nên được nuôi đàn từ 10 con trở lên, và càng nhiều càng tốt nếu bể đủ rộng.
> - **Lọc và thay nước:** Đàn đông thải nhiều chất bẩn hơn. Bạn cần lọc đủ công suất (ít nhất gấp 4-5 lần thể tích bể mỗi giờ) và thay 25-30% nước mỗi tuần.
> - **Chỉ số nước:** Sau khi thả, theo dõi amoniac và nitrit. Hai chỉ số này phải luôn …

### stocking-03 · post · plain wins (4 · 8)

**Asked:** Em mới kiếm được cái bể kích thước 35x20x22cm, chưa chơi bao giờ. Nên nuôi loại cá nào cho đẹp, dự định 1 tuần thay nước 1 lần? Có cần mua lọc và sục khí cho bể không?

**Judge:** Y gives a betta first, then shrimp or guppies with counts for each, 25–30% water changes once a week, a sponge filter with an air pump, cycling before adding fish and dechlorinating tap water. X answers almost none of the question: it doesn't say which fish to keep and doesn't say how much water to change. / X trả lời đủ cả ba câu hỏi: nên nuôi cá gì (1 cá xiêm đực hoặc tôm cherry), thay nước 25–30% mỗi tuần, và dùng lọc bọt biển chạy bằng máy sủi. X còn nhắc chạy bể trước khi thả cá và khử clo nước máy. Y không gợi ý cụ thể loài cá nào và bỏ ngỏ câu hỏi về lịch thay nước, chỉ bảo người hỏi tự đọc thêm cẩm nang.

**Ours lacks:** figures, too-thin, tank-fit. **Plain lacks:** –.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể 35x20x22 cm chứa khoảng 15 lít, khá nhỏ nên em nên chọn ít cá, cá nhỏ, và có lọc cùng sục khí. Cẩm nang nói lọc bọt biển là loại lọc cơ bản nhất, dễ dùng cho người mới, và cần ba phần: lọc bọt biển đặt trong bể, máy sục khí đặt ngoài bể, và dây khí nối hai phần.
> 1. Mua lọc bọt biển kèm máy sục khí và dây khí, rồi lắp theo hướng dẫn trong cẩm nang.
> 2. Trong tuần đầu, để đèn yếu và châm phân ít để rêu chưa có cơ hội mọc, theo cẩm nang thủy sinh cho người mới.
> 3. Trồng vài loại cây dễ sống để hút bớt chất thải và làm bể tự nhiên hơn.
> 4. Chọn cá nhỏ, ít con, và mở trang từng loài trong cẩm nan…

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

**Judge:** X uses the 35×20×22 cm (~15 L) tank, answers the filter-vs-air-pump question directly, and gives setup steps in order. However, it gives no fish count or cycle time and steers away from a betta, which is the best fit. Y asks for details the app already holds, gives generic advice for 30–100 L tanks, and wrongly lists discus as a beginner fish. Its cycling and water-change figures do help. / Y dùng đúng kích thước bể (khoảng 15 lít), trả lời rõ chuyện lọc và sục khí, và có các bước chạy bể theo thứ tự. Tuy vậy Y không đưa ra số lượng cá và gợi ý cá chuột cho bể nhỏ. X hỏi lại những thông tin đã có trong app, chỉ cho lời khuyên chung chung và có lỗi về cá dĩa.

**Ours lacks:** figures, tank-fit, follow-up. **Plain lacks:** tank-fit, asks-only, wrong.

**Ours** (read 4 pages, stopped at the calls limit):

> Bể 35 x 20 x 22 cm, khoảng 15 lít, còn trống và chưa có lọc hay sục khí, nên bạn cần chuẩn bị thiết bị trước khi nghĩ đến số lượng cá. Cẩm nang hướng dẫn đặt lọc vào bể, đổ nước, chạy chu trình nitơ rồi mới thả cá. Lọc treo và lọc thùng đẩy nước bằng mô tơ điện nên không cần máy sục khí. Lọc bọt biển và lọc đáy thì bắt buộc phải có máy sục khí. Về cá, cẩm nang gợi ý betta nuôi riêng với lọc dòng chảy nhẹ trong bể khoảng 19 lít, tức bể của bạn hơi nhỏ hơn mức đó. Các loài đàn hiền như rasbora, neon hay cá chuột hợp người mới, nhưng tôi chưa kiểm tra được số lượng cho bể này, nên hãy dùng công …

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

### stocking-04 · post · ours wins (5.5 · 4)

**Asked:** Em thích con cá bống vàng vì nó khá sinh động (lúc núp dưới đá, lúc đậu trên cây, trên đá) và dọn bể rất sạch, từ ngày nuôi không phải cạo rêu thành bể nữa, cũng chả cần cho ăn gì mà vẫn sống. Nuôi loại gì chung với bống này được? Trước em nuôi mún, rồi kiếm, rồi cá bảy màu, đều cứ chết dần, không biết có phải bị con bống xử không?

**Judge:** X nhận ra con bống vàng lớn lên thì lười ăn rêu và hay bám vào nhớt cá khác, nên gần với nguyên nhân thật hơn, dù bỏ dở ý này và gợi ý nhầm sang cá nuôi chung của bống Stiphodon. Y kiểm tra nước có thứ tự hơn nhưng coi nó là bống ăn thịt thông thường, bỏ sót việc bám nhớt và gợi ý những cá nuôi chung vẫn có thể bị bống mút nhớt. / Y is more helpful. It names the real problem, that the bống latches onto other fish's slime as it grows, and it suggests moving the bống out to see whether the deaths stop. X blames generic causes like water quality and largely clears the fish. Both mix it up with true gobies when suggesting tankmates.

**Ours lacks:** diagnosis, figures, tank-fit, wrong. **Plain lacks:** diagnosis, wrong, figures, tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Cẩm nang chưa có trang riêng cho cá bống vàng, nên em chưa thể khẳng định con bống đã giết cá của anh chị. Điều cẩm nang ghi nhận: bống vàng ăn tảo nâu tốt khi còn nhỏ, nhưng khi lớn nó lười ăn rêu và hay bám vào nhớt của cá khác, làm cá đĩa, cá thần tiên dễ stress. Cẩm nang không ghi bống vàng cắn chết cá. Cá mún, kiếm, bảy màu cần được cho ăn, nên việc bể không có thức ăn có thể là nguyên nhân đáng nghi hơn.
> 1. Quan sát xem bống có đuổi, bám hay cắn cá khác không, nhất là lúc cá mới thả, và xem cá chết có vết cắn không.
> 2. Cho cá còn lại ăn thức ăn đều đặn, vì cá bảy màu không sống bằng rêu…

**Plain** (1911 characters):

> Bống thường hiền với cá cùng cỡ, nhưng một số loài bống có tính lãnh thổ và có thể rượt hoặc cắn cá nhỏ, nhất là cá nằm đáy. Dù vậy, khả năng cao cá chết không phải do bống "xử". Mình nghĩ có mấy nguyên nhân hay gặp hơn:
> 
> 1. **Chất lượng nước**: Bể không cần cạo rêu, không thay nước, không cho ăn có thể đang tích tụ amoniac, nitrit hoặc nitrat. Đây là nguyên nhân phổ biến nhất khiến cá chết dần. Nên test nước (kit amoniac, nitrit, nitrat, pH) và thay 20–30% nước nếu chỉ số cao.
> 2. **Thiếu thức ăn**: Bống có thể sống nhờ rêu, màng sinh học và thức ăn tự nhiên trong bể, nhưng cá mún, kiếm, bảy …

### stocking-04 · tank · ours wins (5.5 · 3)

**Asked:** Bể tôi nuôi chung được những cá nào, khi cá thả thêm cứ chết dần?

**Judge:** X uses the fact that the bống vàng survives while new fish die, gives a plausible cause and a short, ordered plan built on testing the water and changing more of it, though it guesses the tank's age. Y is generic and gets Vietnamese fish names wrong, and it recommends the very livebearers that already died in this tank. / Y is built around their bống vàng and gives sensible steps in order (test the water, change water, add fish slowly, keep watching), but its old-tank-syndrome diagnosis is a stretch and it misses that the tank is never fed. X is generic, gets several Vietnamese fish names wrong, and recommends the very fish that already died.

**Ours lacks:** tank-fit, figures, diagnosis. **Plain lacks:** tank-fit, too-long, wrong, diagnosis, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể của bạn đã chạy lâu, và cá mới thả vào cứ chết dần, trong khi bống vàng còn sống. Nhiều khả năng đây là hội chứng bể lâu năm (old tank syndrome): nitrat và khoáng từ nước máy tích dần qua nhiều tháng, cá cũ quen dần còn cá mới thì không chịu nổi. Theo cẩm nang, cá chết dần thường khớp với kiểu này hơn là sốc cấp tính. Tôi chưa đo được nước nên chưa chắc chắn, cần đo để xác nhận.
> 1. Đo amoniac, nitrit, nitrat và pH của bể để biết thông số nào đang cao.
> 2. Tăng lượng nước thay định kỳ, vì cẩm nang nêu cách khắc phục đầu tiên là thay nhiều nước hơn so với lịch hiện tại.
> 3. Nếu amoniac hoặc ni…

**Plain** (2273 characters):

> Cá chết dần mỗi lần thả thêm thường không phải do loài không hợp nhau mà chủ yếu do **chất lượng nước**. Bạn nên kiểm tra các điểm sau trước.
> 
> ## 1. Nguyên nhân hay gặp nhất
> 
> - **Nước chưa ổn định (chu trình nitơ chưa hoàn thiện):** Mỗi lần thả thêm cá, lượng amoniac và nitrit tăng đột ngột, làm cá yếu và chết. Bạn nên dùng bộ test (API hoặc tương tự) để đo NH3/NH4+ và NO2-. Hai chỉ số này phải bằng 0. NO3- nên dưới 20-40 ppm.
> - **Quá tải cá:** Quy tắc tham khảo là khoảng 1 inch (2,5 cm) cá trưởng thành cho 1 gallon (3,8 lít) nước, nhưng thực tế nên thưa hơn. Bể nhỏ dưới 60 lít chỉ nên nuôi v…

### stocking-05 · post · plain wins (5.5 · 7)

**Asked:** Em mới mua thêm mấy con cá chép thả chung với cá vàng, mà nó tấn công cá vàng kinh quá, một con chết rồi. Hỏi cửa hàng thì họ bảo thả chung được em mới mua. Giờ em nên làm sao, chép với cá vàng có nuôi chung được không?

**Judge:** Y answers the question directly: carp and goldfish should not be kept together, and the shop was wrong. It then gives clear steps in order: move the carp out, remove the dead fish, check ammonia and nitrite, change 30% of the water and add aeration. X hedges, mentions its handbook, gives no clear verdict and leaves out a water change. / X nên được chọn: X trả lời thẳng là không nên nuôi chung chép với cá vàng, rồi đưa các bước cụ thể có số liệu: vớt cá chết, đo amoniac và nitrit, thay khoảng 30% nước, tắm muối hoặc dùng xanh methylene. Y đoán nguyên nhân sát hơn, là chép tranh ăn và húc cá vàng, nhưng còn lấp lửng chuyện nuôi chung, thiếu số liệu, lại kèm thẻ loài koi không liên quan.

**Ours lacks:** diagnosis, figures, local, off-topic. **Plain lacks:** diagnosis.

**Ours** (read 4 pages, stopped at the tools limit):

> Cá chép lớn và hay đi kiếm ăn ở đáy, nên rất có thể nó chiếm thức ăn và húc, cắn cá vàng chậm chạp; nhưng sổ tay không có trang riêng cho cá chép thường, nên đây là suy đoán từ trang cá vàng và cá koi (cùng họ cá chép). Các bước nên làm:
> 1. Tách cá chép ra khỏi bể cá vàng ngay, nuôi riêng trong bể lớn hơn.
> 2. Kiểm tra con cá vàng còn lại: vây rách, vết đỏ, nằm đáy hay bỏ ăn thì cách ly để theo dõi.
> 3. Cho ăn nhiều điểm, đủ lượng để cá vàng không phải tranh giành với cá chép.
> 4. Kiểm tra lọc và sục khí, vì cá vàng thải nhiều chất bẩn và cần nước sạch, giàu oxy.
> 5. Nếu muốn nuôi chung lâu dài, …

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

### stocking-05 · tank · plain wins (5 · 7)

**Asked:** Cá chép mới thả cứ tấn công cá vàng trong bể tôi, có nuôi chung được không?

**Judge:** Y says plainly not to keep them together, has them separate the carp now and check the goldfish for injuries, and gives a long-term fix, all in natural Vietnamese. X hedges over which species the carp is, only says to separate if it is koi (even though a goldfish has already died), and spends text on what the guide does and doesn't cover. Neither one deals with the goldfish that already died. / X gives a clear answer: don't keep them together. It says to separate the carp now, check the goldfish for wounds, and move the carp to a pond later, which is the right call once a goldfish has died. Y does seem aware of the dead fish ('cá vàng còn lại'), but it hedges about the species and only says to separate them if the chasing continues, which is too soft.

**Ours lacks:** plan, tank-fit, follow-up, diagnosis. **Plain lacks:** tank-fit, figures, follow-up.

**Ours** (read 4 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là con cá chép mới thả lớn hơn và hiếu động hơn cá vàng trong một bể còn nhỏ, nên nó rượt đuổi, cắn vây và tranh ăn. Tôi chưa chắc chắn vì cẩm nang chưa có trang riêng cho "cá chép" nên chưa xác nhận được loài. Cẩm nang nói cá vàng thường hiền nhưng hay cắn vây khi bị stress, bể đông hoặc tranh ăn, và không nên nuôi chung với cá nhỏ lọt miệng chúng. Còn koi, họ hàng của cá chép, có thể dài tới 90 cm và cần khoảng 950 lít nước cho mỗi con, nên rất dễ thành quá khổ trong bể nhỏ. Cẩm nang có nói hai loài là "anh em họ", nhưng điều đó không có nghĩa là bể nhỏ nuôi chu…

**Plain** (1280 characters):

> **Thường thì không nên nuôi chung.** Cá chép lớn nhanh, có thể dài 30-60 cm hoặc hơn, khỏe và hiếu động hơn nhiều. Cá vàng bơi chậm, vây dài, dễ bị thương, nên cá chép thường xuyên đuổi, húc hoặc cắn vây cá vàng. Ngay cả khi cá chép còn nhỏ, sau vài tháng nó sẽ lớn và gây hại nhiều hơn.
> 
> **Bạn nên làm ngay:**
> 
> 1. **Tách cá chép ra** nếu có thể, bằng một bể riêng hoặc ngăn tạm bằng lưới/tấm nhựa trong bể.
> 2. **Kiểm tra cá vàng**: tìm vết cắn, rách vây, trầy xước, đốm đỏ hoặc nấm trắng. Nếu có vết thương, nên thay một phần nước và theo dõi, có thể dùng thuốc xanh methylen hoặc muối (liều nhẹ) đ…

### stocking-06 · post · plain wins (4 · 7.5)

**Asked:** Em vừa set cái bể cubic theo tư vấn, đáy bể để 5 con nerita. Ra cửa hàng thấy cá kiếm mắt đỏ đẹp quá nên mua thử vài con. Mấy con mún đỏ sắp đẻ nên em đang tính chuyển sang chỗ khác vì sợ bị ăn hết trứng, cá con, bắt đầu thấy ngại rồi. Bể có lọc thác, có cần thay nước hàng tuần không vì thấy nước có mùi hôi?

**Judge:** Y answers the water-change question directly with 20–30% a week. It also says to rinse filter media in old tank water, not tap water, explains the likely causes of the smell and corrects the idea that platies lay eggs. X admits it has no water-change schedule, and its steps are vague. X's point that swordtails need about 108 L is useful, but it doesn't make up for this. / X trả lời thẳng câu hỏi thay nước: thay 20–30% mỗi tuần, rửa bông lọc bằng nước bể, cho ăn ít, test NH3/NO2. Như vậy người nuôi biết rõ phải làm gì. Y bỏ ngỏ chuyện thay nước nên kém hữu ích hơn, dù Y có lưu ý đúng là cá kiếm cần bể lớn, điều X bỏ sót.

**Ours lacks:** plan, figures, too-thin. **Plain lacks:** tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Cá mún là platy và cá kiếm đều là cá đẻ con, và cá mẹ có thể ăn cá bột của chính mình, nên chuyển con sắp đẻ đi là hợp lý. Cẩm nang nói rằng giữ cho cá bột sống sót là khâu quan trọng nhất khi cho cá sinh sản. Mùi hôi trong bể mới thường là dấu hiệu chu trình nitơ chưa xong. Mình chưa đọc phần thay nước định kỳ nên chưa có lịch cụ thể cho bạn.
> 1. Khi thấy cá mẹ sắp đẻ, chuyển con đó sang hộp đẻ hoặc bể nhỏ riêng, theo cách cẩm nang khuyên cho cá kiếm.
> 2. Đo amoniac và nitrit trong bể mới; nếu còn đo được thì bể chưa cycle xong, nên hạn chế thả thêm cá.
> 3. Trồng thêm cây thủy sinh dày, vì cẩm …

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

### stocking-06 · tank · plain wins (4 · 6.5)

**Asked:** Mún trong bể tôi sắp đẻ, có cần tách ra không, và có phải thay nước hàng tuần không?

**Judge:** Y is the better answer. It covers both questions with clear steps and reasonable numbers: when to move the mother, what to feed the fry, and 20–30% water changes each week. X does use the hobbyist's tank details (the new tank and the bad smell), but it never answers the water-change question and leaves the reader with little to act on. / X trả lời được cả hai câu hỏi: nên tách cá mẹ, và nên thay 20–30% nước mỗi tuần, kèm lời dặn kiểm tra amoniac và nitrit. Tuy vậy X bỏ qua chuyện bể mới có mùi hôi và việc cá kiếm sẽ ăn cá con. Y có nhắc đến bể mới và mùi hôi nhưng không trả lời phần thay nước, cũng không nói cần xử lý mùi hôi thế nào.

**Ours lacks:** plan, figures, too-thin, diagnosis. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 3 pages, stopped at the tools limit):

> Cá mún trong bể của bạn là cá platy (còn gọi là cá mún), một loài đẻ con. Nên tách cá mẹ hoặc cho cá con vào chỗ trốn, vì cá lớn thường ăn cá con, kể cả cá bố mẹ. Cám dỗ lớn nhất là bể mới, nơi cá con dễ bị ăn.
> 1. Khi đốm thai sau vây hậu môn sẫm và to dần, chuyển cá mái sang hộp đẻ hoặc bể đẻ riêng.
> 2. Sau khi đẻ, để cá con trong hộp nhốt hoặc bể ương nhỏ có chỗ trốn, nước giống bể chính.
> 3. Đừng để bể đang có mùi hôi mà chưa tìm nguyên nhân; nước kém có thể làm cá đẻ muộn hoặc mất thai, nên kiểm tra nước trước ngày dự kiến đẻ.
> 4. Về thay nước: cẩm nang chưa được đọc đầy đủ trong lượt này, n…

**Plain** (1246 characters):

> Bạn nên **tách mún mẹ ra** nếu muốn giữ được cá con. Mún là loài đẻ con, và cá lớn thường ăn cá con ngay sau khi chúng được sinh ra.
> 
> **Cách tách và chuẩn bị:**
> - **Dùng lồng đẻ (breeder box)** treo trong bể hoặc **bể nhỏ riêng** có cây thủy sinh dày như rêu java, rong đuôi chó để cá con có chỗ trốn.
> - **Nhận biết sắp đẻ:** bụng to và vuông, có một đốm đen gần gốc vây hậu môn (gravid spot) sẫm dần. Thường khi thấy vậy thì còn khoảng 1–2 ngày.
> - **Sau khi đẻ:** đưa mẹ về bể chính hoặc để trong lồng đẻ, và lấy cá con ra khi cần.
> - **Cho cá con ăn:** artemia con, bột thức ăn cho cá con, hoặc thứ…

### stocking-07 · post · plain wins (3 · 6)

**Asked:** Bể nhà em kích cỡ 60x35x40, thả neon và sóc đỏ khoảng bao nhiêu con thì được ạ?

**Judge:** Y gives sensible stocking numbers for about 75 L (20–25 neon), plus useful care figures for water changes and temperature that suit a warm Vietnamese room. X picks a cold-water loach that's hard to find in Vietnam and suggests only 6 neon, which badly understocks the tank. / X đưa số lượng neon hợp lý (20–25 con) và các bước cơ bản. X hiểu nhầm 'sóc đỏ' là Corydoras nhưng có hỏi lại để xác nhận. Y chọn một loài chạch suối nước lạnh, hung dữ, không hợp với neon và khí hậu VN, lại chỉ cho thả 6 con neon.

**Ours lacks:** wrong, local, figures, tank-fit. **Plain lacks:** diagnosis, local.

**Ours** (read 5 pages, stopped at the tools limit):

> Với bể 60x35x40 (khoảng 84 lít, trừ khoảng 10% chỗ trang trí còn khoảng 76 lít), bạn có thể thả khoảng 6 con neon và 6 con chạch sóc đuôi đỏ. Cẩm nang khuyên neon nên nuôi đàn từ nửa tá trở lên, còn chạch sóc nên nuôi đàn từ 6 con trở lên. Mình đang hiểu 'sóc đỏ' là chạch sóc đuôi đỏ; nếu bạn nuôi loài khác thì cho mình biết để xem lại.
> 
> Lưu ý: chạch sóc hơi hung, có thể cắn vây, nên không nên thả cùng cá bơi chậm hoặc vây dài. Neon thì hiền và hòa thuận với hầu hết loài trong bể cộng đồng. Lần này mình chưa kiểm tra được cặp cá này bằng công cụ tương thích, nên bạn nên kiểm tra lại trước khi…

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

### stocking-07 · tank · ours wins (5 · 3)

**Asked:** Bể của tôi thả được bao nhiêu con neon và sóc đỏ?

**Judge:** I'd rather this hobbyist got X. It works from their actual tank (60×35×40 cm, about 84 litres), says which fish it assumed, flags that they may not get along, and gives first steps. Its temperature ranges and the 79% fullness figure are questionable, though. Y ignores the tank size it was given, gets the species wrong, uses a made-up stocking rule and mostly asks the hobbyist to repeat information the app already has. / Y dùng đúng kích thước bể, đưa ra số lượng cụ thể, cảnh báo cá rượt đuổi và cắn vây, và dặn những gì cần theo dõi. Tuy vậy, số liệu nhiệt độ của Y đáng ngờ và không hợp với khí hậu nóng ở Việt Nam. X không đọc được kích thước bể, phải đoán số lít, gọi Corydoras sai tên và chủ yếu hỏi lại người chơi.

**Ours lacks:** figures, local. **Plain lacks:** tank-fit, wrong, asks-only, local.

**Ours** (read 2 pages):

> Nuôi chung được, nhưng cần để ý: Cá chạch sóc đuôi đỏ có thể rượt đuổi Cá neon xanh, và hay cắn vây cá khác. Tôi hiểu "sóc đỏ" là chạch sóc đuôi đỏ và "neon" là neon xanh; nếu bạn ý là loài khác, hãy cho tôi biết. Theo cẩm nang, neon xanh nên nuôi đàn từ 6 con trở lên và chạch sóc đuôi đỏ cũng nuôi đàn từ 6 con. Bể 60 × 35 × 40 cm (khoảng 84 lít) chứa được 6 neon và 6 chạch ở mức 79%, vừa phải nếu lọc tốt và thay nước đều. Điều đáng lo hơn số lượng là nhiệt độ: neon xanh cần 21–25°C còn chạch cần 15–21°C, hai khoảng chỉ trùng nhau ở 21°C, nên bạn nên chọn một loài theo nhiệt độ bể bạn giữ đượ…

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

### stocking-08 · post · plain wins (5.25 · 7.25)

**Asked:** Em mới chơi, ban đầu chỉ định mua cá với cây nhựa, nhưng tìm hiểu thấy mê thủy sinh quá nên mua thêm cây ráy nhỏ và chùm xương cá thay cây nhựa. Bể bé tí 4 lít mà thích đẹp em thả 7-8 con. Nuôi được 1 tuần rồi vẫn ổn, lâu dài có ổn không ạ?

**Judge:** Y nói rõ vì sao nuôi lâu dài sẽ có vấn đề: bể chưa qua chu trình nitơ, dễ thiếu oxy, cho ăn quá nhiều. Y còn đưa số cụ thể: giữ lại 3-4 con, thay 30-50% nước mỗi tuần, nên dùng lọc bọt biển và lên bể 10-20 lít, dù gợi ý cá neon và máy sưởi chưa hợp lắm. X đúng ở ý chính nhưng lời khuyên còn chung chung: chỉ bảo "thay một phần nước", "giảm số cá" mà không cho con số, không nhắc đến lọc hay cách cho ăn, phần trích cẩm nang cũng không thêm được nhiều. / X đưa ra kế hoạch cụ thể cho bể 4 lít: giảm còn 3-4 con, dùng lọc vi sinh chạy bằng khí, thay 30-50% nước, cho ăn ít, có test kit, nói rõ cây không thay được vi sinh và có dấu hiệu cần theo dõi. Y xưng hô hợp với người hỏi hơn nhưng thiếu số liệu thay nước, không nói đến lọc cho bể này và bỏ qua phần cây ráy, xương cá của người hỏi.

**Ours lacks:** figures, plan, tank-fit. **Plain lacks:** local, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Cá khỏe sau một tuần chưa có nghĩa là bể ổn lâu dài. Bể 4 lít chứa 7-8 con là quá tải, vì chất thải tích dần làm nước xấu đi. Cẩm nang khuyên trừ khoảng 10% thể tích cho cây và đồ trang trí, và cảnh báo không nên thả theo cỡ cá con vì cá sẽ lớn. Khi bể quá sức, ammonia có thể cứ cao mãi không xuống, và cá nổi lên đớp khí là dấu hiệu nguy hiểm.
> 1. Mua bộ test ammonia, nitrite và nitrate, đo nước ngay hôm nay và đo lại mỗi vài ngày.
> 2. Ammonia hoặc nitrite khác 0 ppm thì thay khoảng một phần nước bằng nước đã khử clo, rồi đo lại.
> 3. Giảm số cá ngay, ưu tiên chuyển bớt cá sang bể khác nếu có thể…

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

**Judge:** X dùng đúng thông số bể 4 lít của bạn và kết luận đúng là bể đang quá tải, nên giảm cá. Tuy vậy, X không nói bể mới chạy 1 tuần chưa qua chu trình nitơ và cũng không hướng dẫn thay nước gấp. Y không biết bể bạn chỉ 4 lít, đưa ra mốc 40-60 lít chung chung rồi chủ yếu hỏi lại. / Y is better because it uses the saved 4 L size, says plainly that 7-8 fish is too many, and tells them to rehome or cut down the fish. It loses points for the invented 115-210 L figure, testing every 2-3 weeks when this new tank needs daily checks, and no water-change plan. X ignores the 4 L tank, reasons as if it were 40-60 L, and mostly asks questions back.

**Ours lacks:** follow-up, figures, diagnosis. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 3 pages, stopped at the calls limit):

> Với bể 4 lít như bạn đã lưu, 7-8 con cá là quá tải, nên lâu dài sẽ không ổn. Cẩm nang tính khoảng 1 cm cá cho 1,5 lít nước sau khi trừ 10% thể tích cho đồ trang trí, và quy tắc này chỉ dùng cho cá nhỏ khoảng 2-7 cm trong bể đã ổn định. Bể 4 lít chỉ chứa khoảng 2-3 cm cá tổng cộng, nên 7-8 con sẽ vượt xa mức đó. Bạn chưa ghi loài cá, nên tôi chưa tính được cỡ trưởng thành của từng con; cá lớn còn làm bể quá tải nặng hơn.
> 1. Tra cỡ trưởng thành của từng loài trước khi giữ thêm bất kỳ con nào.
> 2. Chuyển bớt cá sang bể lớn hơn, khoảng 115-210 lít, dùng nước đã khử clo.
> 3. Nếu chưa có bể lớn, giảm…

**Plain** (1607 characters):

> Câu trả lời phụ thuộc vào **kích thước bể**, **loài cá** và **hệ lọc**. Bạn cho mình biết thêm thì mình đánh giá cụ thể hơn được.
> 
> **Vài tiêu chí để kiểm tra:**
> 
> 1. **Thể tích bể:** Quy tắc phổ biến là khoảng 1 lít nước cho 1 cm cá trưởng thành (tính cả chiều dài thân, không tính đuôi). Nhiều loài cá nhỏ như neon hay tetra thường được nuôi theo đàn, nên 7-8 con nhỏ có thể ổn trong bể 40-60 lít. Còn nếu là cá lớn như cichlid, cá vàng hay cá la hán thì 7-8 con có thể là quá đông.
> 
> 2. **Loài cá:** Cá đàn (neon, tetra, cá bảy màu) cần nhiều con cùng loài và thường thoải mái hơn khi đông. Cá lãnh …

### stocking-09 · post · plain wins (4 · 7.5)

**Asked:** Bể dài 80, rộng 35, cao 45 cm thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** Y đúng với thực tế chơi cá: 2 ông tiên và 10 neon nuôi được trong bể 126 lít. Y cũng nêu đúng rủi ro (ông tiên lớn ăn neon, hung dữ khi đẻ) và cách giảm rủi ro: trồng nhiều cây, thả neon trước hoặc thả cùng lúc khi ông tiên còn nhỏ. X lại cấm hẳn, dựa trên số liệu cẩm nang sai là ông tiên phải nuôi đàn 6 con và bể phải dài từ 100 cm. / X là câu trả lời tốt hơn. X đánh giá đúng là bể khoảng 126 lít nuôi được một cặp ông tiên. X cũng nêu rủi ro ông tiên ăn neon và cách giảm rủi ro: thả neon đã lớn, trồng dày cây, thả neon trước hoặc lúc ông tiên còn nhỏ, rồi theo dõi. Y thì cấm thẳng, dựa trên tiêu chí sai là ông tiên phải nuôi từ 6 con và cần bể dài 100 cm. Y lại không cho người nuôi bước nào làm được với bể họ đang có.

**Ours lacks:** wrong, plan, tank-fit. **Plain lacks:** follow-up, figures.

**Ours** (read 2 pages):

> Không nên nuôi chung: cá ông tiên có thể ăn cá neon xanh. Cá ông tiên dài tới 15 cm, còn neon chỉ khoảng 3 cm, nên cá ông tiên có thể săn neon và hay rượt đuổi chúng. Cẩm nang cũng ghi cá ông tiên nên nuôi từ 6 con, cần bể dài từ 100 cm (bể tối thiểu 100 × 40 × 50 cm), còn bể 80 × 35 × 45 cm của bạn chưa đủ. Cá neon xanh thì hợp hơn với cá bảy màu, neon vua, cá tam giác hoặc tép red cherry, và cẩm nang khuyên nuôi neon thành đàn từ nửa tá con trở lên. Nếu vẫn muốn nuôi cá ông tiên, nên chọn bể dài hơn và bỏ neon ra khỏi bể, hoặc nuôi neon với các loài trong danh sách hợp của nó.
> 
> [Thẻ loài] C…

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

### stocking-09 · tank · plain wins (3.5 · 6.5)

**Asked:** Bể của tôi thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** Bể 126 lít, cao 45 cm của người hỏi nuôi được 2 con ông tiên. Y trả lời đúng hướng: nuôi được nhưng có rủi ro, kèm mẹo thực tế như thả neon khi ông tiên còn nhỏ và trồng cây dày. X từ chối dựa trên quy tắc sai là ông tiên phải nuôi đàn 6 con và bể phải dài 100 cm. / X gives the right answer: this works if the neons go in before the angelfish are big, with dense plants, enough food, and a watch for spawning aggression. It doesn't use their tank size, but their ~126 L tank meets X's 100 L+ minimum. Y does use the tank size, but it bases a flat 'no' on wrong figures (groups of 6 angelfish, a 100 cm minimum length), which would mislead the hobbyist.

**Ours lacks:** wrong, plan, too-thin. **Plain lacks:** tank-fit, local, follow-up.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên dài tới 15 cm có thể ăn cá neon xanh chỉ khoảng 3 cm, và còn hay rượt đuổi chúng. Ngoài ra, cá ông tiên nên nuôi theo đàn từ 6 con và cần bể dài từ 100 cm, trong khi bể của bạn dài 80 cm, nên hiện tại bể chưa đủ cho cả hai loài. Nếu bạn muốn giữ neon xanh, nên nuôi chúng trong bể riêng hoặc chọn một loài cá nhỏ, hiền hơn trong cẩm nang; nếu vẫn muốn nuôi ông tiên, hãy xem cần bể lớn hơn và đủ chỗ trốn trước khi thả.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 80×35×45 cm]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon…

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

### stocking-10 · post · plain wins (4 · 7)

**Asked:** Bể 60x30x36 cm của mình đang nuôi 12 con neon xanh, thả thêm 1 con cá betta được không?

**Judge:** Y đánh giá thực tế hơn: betta và neon nuôi chung được trong bể 60 cm có nhiều cây. Y cũng cho điều kiện cụ thể và nói rõ dấu hiệu nào thì phải tách betta ra. Tuy vậy, Y khuyên thả betta trước dù neon đã có sẵn trong bể, và khuyên dùng máy sưởi dù ở Việt Nam thường không cần. X thì cấm hẳn, nói quá về tính hung dữ của betta, và các bước của X gần như không giúp người nuôi biết phải làm gì. / X gives the realistic answer that this often works in a 65 L tank, with the conditions (cover, gentle flow) and warning signs (fin-nipping, chasing). It has a few minor mistakes. Y flatly says no, which is too strict, and its steps are thin and repetitive, with a stocking figure it doesn't explain.

**Ours lacks:** plan, tank-fit, too-thin, wrong. **Plain lacks:** local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài. Bể 60x30x36 cm của bạn còn thưa (khoảng 36%), nên về kích thước thì vẫn đủ chỗ, nhưng vấn đề nằm ở tính cách của betta, không phải ở chỗ ở. Neon là loài đi đàn, nhỏ và nhát, dễ bị betta rượt đuổi và làm stress, nhất là khi neon ngủ hoặc ăn chậm.
> 1. Nếu muốn nuôi betta, nên chuẩn bị một bể riêng cho betta, còn neon giữ nguyên trong bể 60 cm.
> 2. Nếu muốn thả betta vào bể neon hiện tại, nên cân nhắc lại vì rủi ro cao cho cả hai.
> 3. Khi đã có bể riêng cho betta, hãy kiểm tra thêm kích thước và các cá cùng bể trướ…

**Plain** (1406 characters):

> **Có thể nuôi được**, bể 60x30x36 cm (khoảng 65 lít) đủ rộng cho 1 con betta cùng 12 con neon. Neon là cá hiền, đi đàn, ít khi gây hấn, và betta thường sống chung được với chúng. Tuy nhiên, bạn nên lưu ý mấy điểm sau:
> 
> **Điều kiện để sống chung tốt:**
> - **Nhiều chỗ ẩn nấp:** Trồng thêm cây thủy sinh như dương xỉ Java, rêu Java, trâm bầu, hoặc đặt đá, lũa. Betta cần chỗ tránh khi bị rượt đuổi.
> - **Dòng nước nhẹ:** Betta bơi chậm và không thích dòng chảy mạnh, nên chọn lọc không quá mạnh hoặc để bớt vòi phun.
> - **Nhiệt độ:** Cả hai loài đều ưa nước ấm, khoảng 24–27°C, nên thường dùng máy sưởi l…

### stocking-10 · tank · ours wins (6 · 3.5)

**Asked:** Bể của tôi thả thêm 1 con cá betta được không?

**Judge:** X uses the actual tank (60×30×36 cm with 12 neon xanh) and gives a clear answer, though it is too strict, since one betta with neons often works. Y misreads the situation, ignores the tank details and mostly asks questions back. / Y uses the real tank (60×30×36, 12 neons) and gives a clear, safe answer with a next step, though it is more cautious than it needs to be. X misreads the situation as an existing betta, uses an odd word for tetra, and mostly asks back for things the app already knows.

**Ours lacks:** diagnosis, follow-up, figures. **Plain lacks:** tank-fit, asks-only, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài, nên thêm 1 con betta vào bể đang có 12 cá neon xanh là không phù hợp. Bể 60x30x36 cm của bạn còn thưa (khoảng 36%) nên về không gian thì vẫn thả thêm được, nhưng vấn đề là tính cách của betta. Nếu muốn nuôi betta, bạn nên làm một bể riêng cho nó, còn bể hiện tại có thể giữ nguyên cho đàn neon xanh. Nếu muốn thêm cá vào bể này, hãy kiểm tra từng loài với cá neon trước khi thả, và xem thêm cẩm nang để chọn loài hiền.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 60×30×36 cm]
> Không nên nuôi chung: Cá betta (cá …

**Plain** (1081 characters):

> **Thường thì không nên**, đặc biệt nếu bể đang có một con betta đực. Betta đực rất hung dữ với các con đực khác và sẽ đánh nhau đến khi bị thương nặng hoặc chết. Chúng cũng có thể căng thẳng và bệnh tật khi phải sống chung với cá khác.
> 
> **Một số trường hợp cụ thể:**
> 
> - **Betta đực + betta đực:** Không nên. Gần như chắc chắn sẽ đánh nhau.
> - **Betta đực + betta cái:** Chỉ có thể thử trong bể rất lớn (thường từ 80 lít trở lên), có nhiều cây thủy sinh và chỗ ẩn nấp, và phải quan sát liên tục. Con cái có thể bị đực rượt đuổi hoặc cắn. Nếu thấy cá cái bị thương hoặc stress, phải tách ra ngay.
> - **B…

### algae-12 · post · plain wins (5 · 7)

**Asked:** Bể 60x30x36 của mình set được 4 tuần, không CO2, trồng rêu java, ráy nana với dương xỉ java, đèn LED bật liền 8 tiếng mỗi ngày, châm phân nước 1 lần/tuần. Lá ráy bắt đầu có đốm rêu xanh. Có nên chia đèn ra làm hai đợt sáng chiều, mỗi đợt không quá 4 tiếng không?

**Judge:** I'd rather this hobbyist got Y. It answers the question they actually asked: splitting the light into two blocks still gives 8 hours, so it won't fix the algae. It then gives a sensible order of steps: tell green spot algae from green dust algae, cut the light to 6–7 hours, do 25–30% weekly water changes, and add nerite snails or Amano shrimp. X builds its whole diagnosis on a nutrient-rich substrate the hobbyist never mentioned, and it won't answer the light question at all. / X trả lời thẳng câu hỏi chia đèn: chia đôi không giúp gì vì tổng vẫn 8 tiếng, nên giảm còn 6-7 tiếng. X cũng chỉ cách phân biệt loại rêu và đưa ra các bước hợp với bể không CO2. Y chẩn đoán dựa trên phân nền mà người hỏi không hề nhắc tới, và né luôn câu hỏi về đèn, dù lời khuyên đo phosphate và thả ốc nerite thì vẫn hữu ích.

**Ours lacks:** tank-fit, figures, plan. **Plain lacks:** too-long, diagnosis.

**Ours** (read 5 pages, stopped at the tools limit):

> Nhiều khả năng đây là rêu chấm xanh (GSA), và thủ phạm chính theo cẩm nang gần như luôn là phosphate. Bể set được khoảng 4 tuần, dùng phân nền giàu dinh dưỡng, là thời điểm phosphate trong nước thường tụt và GSA bắt đầu xuất hiện trên lá ráy. Việc bật đèn 8 tiếng hay không CO2 chỉ góp phần thứ yếu, nên tôi không khuyên chia đèn thành hai đợt. Cẩm nang tôi đọc không có nội dung nào về việc chia đèn sáng chiều, nên về đề xuất đó tôi chưa có căn cứ để trả lời.
> 1. Lau thử vài chấm: GSA bám chắc, khó lau sạch, còn rêu bụi xanh thì lau là trôi.
> 2. Mua bộ test phosphate, đo nước bể rồi giữ mức khoản…

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

### algae-12 · tank · ours wins (7.5 · 5)

**Asked:** Bể của tôi có nên chia đèn làm hai đợt, mỗi đợt không quá 4 tiếng không?

**Judge:** X is the better answer. It uses this tank's details (LED on for 8 hours straight, no CO₂, low-light plants) and gives a concrete 4h + 4h schedule with what to watch afterwards, though it misread weekly fertiliser as weekly water changes. Y is generic: it asks what kind of tank it is and gives CO₂ timing advice this tank doesn't need. Its point that nutrients matter more than splitting the light is good, but it isn't applied to this tank. / Y uses this tank's details: the 8 hours of light running straight, no CO₂, and the java fern, java moss and anubias nana. It gives a concrete 4+4 schedule backed by the guide, says what to watch for, and how to cut back light hours one step at a time. X is generic. It even mentions coral reef tanks and asks what kind of tank this is, which the app already knows.

**Ours lacks:** diagnosis. **Plain lacks:** tank-fit, asks-only, follow-up.

**Ours** (read 3 pages):

> Có, và đây là cách làm phù hợp với bể của bạn. Cẩm nang ghi rằng bể bình thường, hạn chế rêu hại, nên bật khoảng 8 tiếng và chia 2 lần mỗi ngày; bể bạn đang bật liền 8 tiếng, không có CO2, thay nước 1 lần mỗi tuần, nên chia thành 2 đợt 4 tiếng là đúng hướng. Cẩm nang không ghi cụ thể khoảng nghỉ giữa hai đợt, nên bạn tự chọn khoảng nghỉ hợp lý.
> 1. Đặt hẹn giờ cho đèn LED: đợt 1 bật 4 tiếng, ví dụ từ 7h đến 11h.
> 2. Đợt 2 bật 4 tiếng sau khoảng nghỉ, ví dụ từ 15h đến 19h, tổng vẫn là 8 tiếng.
> 3. Giữ nguyên cường độ đèn và lịch cho 1 đến 2 tuần, không đổi nhiều thứ cùng lúc.
> Theo dõi: nếu rêu ho…

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

