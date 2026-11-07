# The chat against plain Claude, on hard problems

2026-11-07, `packages/engine/scripts/chat-vs-plain.ts`. 48 questions (all of them) from public Vietnamese hobby forums, reworded with no names (`packages/engine/scripts/hard-questions.vi.json`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and limits at commit `07bc80d04`, claude-haiku-5-5, over https://aquatome.com's handbook. Plain: claude-haiku-5-5, the same effort, no system prompt, no tools, no handbook. Judge: claude-opus-5-5 through the Claude CLI, rubric version 2 (`chat-vs-plain-lib.ts`).

- **post:** both answer the whole forum post. **tank:** both get a short question. The eval saves the post's tank for the reader (size, fish, plants, substrate, age; the light, CO₂ and fertiliser as the tank's notes), and ours sees only what the chat's code reads of a saved tank; plain Claude sees only the question. The judge is told everything the post said about the tank.
- **Blind, as far as it goes:** the judge isn't told which answer is ours, and both lose the site's name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.
- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.
- **Failed:** when one side failed (ours: the limits ran out, a call timed out) and the other answered, that reader got an error: the other side wins it on every count, with no score. A failed answer is kept in the cache, so a rerun is the same run; `--retry-failed` asks again.
- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).
- **Cost** per question, at list price: ours $0.0039, plain $0.0012. The judge runs on the owner's Claude accounts.

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post | 10 / 31 / 7 of 48, ours failed 1 | 5.8 · 6.6 | 13–19 | 5–29 | 11–30 | 15–5 | 15–14 | 40/47 | 5 / 42 / 1 |
| tank | 28 / 14 / 6 of 48 | 6.2 · 5.0 | 27–8 | 28–4 | 29–14 | 22–5 | 30–5 | 42/48 | 13 / 35 / 0 |

## By problem

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post · algae | 2 / 8 / 2 of 12 | 5.8 · 6.7 | 3–6 | 2–7 | 3–6 | 6–2 | 5–1 | 10/12 | 0 / 12 / 0 |
| post · setup | 1 / 8 / 0 of 9, ours failed 1 | 5.1 · 7.1 | 1–5 | 0–8 | 0–9 | 2–1 | 0–6 | 8/8 | 0 / 8 / 1 |
| post · cycling | 1 / 5 / 2 of 8 | 5.8 · 6.6 | 3–2 | 0–6 | 2–5 | 4–0 | 3–2 | 6/8 | 0 / 8 / 0 |
| post · sick | 4 / 4 / 1 of 9 | 6.4 · 6.3 | 4–3 | 2–4 | 3–4 | 1–0 | 4–3 | 8/9 | 2 / 7 / 0 |
| post · stocking | 2 / 6 / 2 of 10 | 6.0 · 6.4 | 2–3 | 1–4 | 3–6 | 2–2 | 3–2 | 8/10 | 3 / 7 / 0 |
| tank · algae | 9 / 1 / 2 of 12 | 6.6 · 4.9 | 9–1 | 8–1 | 10–0 | 7–2 | 9–0 | 10/12 | 4 / 8 / 0 |
| tank · setup | 3 / 4 / 2 of 9 | 5.6 · 4.8 | 4–0 | 3–3 | 3–5 | 5–0 | 5–2 | 7/9 | 1 / 8 / 0 |
| tank · cycling | 4 / 3 / 1 of 8 | 5.9 · 5.4 | 3–2 | 2–0 | 3–3 | 3–1 | 4–1 | 7/8 | 2 / 6 / 0 |
| tank · sick | 5 / 3 / 1 of 9 | 6.6 · 5.4 | 4–3 | 6–0 | 7–2 | 1–0 | 7–1 | 8/9 | 3 / 6 / 0 |
| tank · stocking | 7 / 3 / 0 of 10 | 6.0 · 4.6 | 7–2 | 9–0 | 6–4 | 6–2 | 5–1 | 10/10 | 3 / 7 / 0 |

## What each lacks, as the judge tagged it

| | Ours | Plain |
| --- | --- | --- |
| post | tank-fit 35, figures 31, too-thin 22, plan 14, diagnosis 11, follow-up 9, local 8, wrong 2, unsafe 1, asks-only 1 | too-long 34, follow-up 21, plan 13, tank-fit 11, local 11, wrong 8, diagnosis 6, figures 3, asks-only 1, unsafe 1 |
| tank | tank-fit 33, figures 32, diagnosis 12, too-thin 10, plan 10, follow-up 8, local 4, wrong 2, unsafe 2, asks-only 1 | tank-fit 47, too-long 29, follow-up 23, plan 21, diagnosis 10, local 9, asks-only 7, wrong 3, figures 2, unsafe 1, off-topic 1 |

Tags: plan, diagnosis, tank-fit, figures, follow-up, local, too-thin, too-long, asks-only, wrong, unsafe, off-topic.

## Errors the judge found

- ours, algae-01 post: "tổng khoảng 8 đến 10 tiếng mỗi ngày": raises total light above the current 7 hours while the tank has hair algae, and never mentions lowering intensity or the 20cm hanging height.
- ours, algae-01 post: "cách 3 ngày, thay vì 30% cách 2 ngày... để kéo dinh dưỡng dư xuống": changing water less often does not pull excess nutrients down better, so the reason given is weak for a 2-week-old tank.
- ours, algae-01 post: "tổng khoảng 8 đến 10 tiếng mỗi ngày": người chơi đang 7 tiếng và đã có rêu mà lại tăng tổng giờ đèn, dễ làm rêu nặng hơn.
- ours, algae-01 post: "thay 30 đến 50% cách 3 ngày, thay vì 30% cách 2 ngày": bể mới 2 tuần đang có rêu mà lại giãn lịch thay nước, không có lý do rõ ràng, trong khi nói là để kéo dinh dưỡng dư xuống.
- ours, algae-01 post: Xem NMC như chưa rõ là cây gì và không chẩn đoán lá trắng, bỏ ngỏ đúng phần người hỏi đang lo.
- plain, algae-01 post: "Siamese algae eater... từ khoảng 60 lít trở lên": this fish grows to about 15cm and is active, so 60 litres is on the tight side.
- plain, algae-01 post: "bàn chải đánh răng cũ gỡ rêu trên lá Bucephalandra": brushing can damage the leaves, though the answer does say to be gentle.
- plain, algae-01 post: Coi việc chia đèn "4 tiếng sáng + 2 tiếng chiều" là cách giảm rêu: lợi ích không rõ và không cần thiết, nhưng không gây hại đáng kể.
- ours, algae-01 tank: "Chia đèn tổng 8–10 tiếng mỗi ngày": blames too-long light, yet this is more than the 7h this tank already runs, so following it adds light to a tank with hair algae and slow-growing bucep and NMC.
- ours, algae-01 tank: "mỗi đợt bật không quá 4 tiếng": a split photoperiod stated as a rule with no reason given; it is not a reliable fix for hair algae.
- ours, algae-01 tank: "Hai nguyên nhân này khá chắc chắn": overconfident, because this keeper already changes 30% every 2 days and lights 7h, so the prescribed fixes change little or make things worse.
- ours, algae-01 tank: "Chia đèn tổng 8–10 tiếng mỗi ngày": is more light than the hobbyist's current 7h, which is too long for a new tank with hair algae and shade plants like bucep.
- ours, algae-01 tank: "khi hết rêu chúng sẽ ăn cây": is overstated, since Amano shrimp do not normally eat healthy plants, so removing them is unnecessary.
- ours, algae-01 tank: "Hai nguyên nhân này khá chắc chắn": is overconfident given that it knows nothing about this tank's light or dosing.
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": 'cá rìu' is not the usual Vietnamese name for Crossocheilus oblongus and could lead the buyer to the wrong fish.
- plain, algae-01 tank: "Thay 30–50% nước mỗi tuần": a generic schedule, less frequent than this keeper's current changes and looser than ideal for a two-week-old tank with algae.
- plain, algae-01 tank: "rau muống nước": an odd choice to suggest as a nutrient-competing plant for a planted aquarium, and it adds little.
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": cá rìu is not the common Vietnamese name for the Siamese algae eater, so the hobbyist could buy the wrong fish.
- plain, algae-01 tank: "nhỏ H₂O₂... liều thấp": gives no actual dose, which leaves a risky step on already stressed bucep and ngưu mao chiên to guesswork.
- plain, algae-01 tank: "Thay 30–50% nước mỗi tuần": is a weaker schedule than a new tank at this stage needs, and less than the hobbyist already does.
- plain, algae-02 post: "Dòng A361 có cường độ thấp hơn A601 Plus": A361 is a roughly 36 cm light, too short to cover a 70 cm tank evenly, so it is a poor suggestion here.
- plain, algae-02 post: "cây nổi như bèo hoa dâu hoặc rau ngổ": rau ngổ is not a typical floating plant for shading, so this example is questionable.
- plain, algae-02 post: "Dòng A361": đèn 36cm quá ngắn cho hồ dài 70cm, chiếu không đều hai đầu hồ.
- plain, algae-02 post: "cây nổi như... rau ngổ": rau ngổ không phải cây nổi điển hình để che sáng như bèo.
- ours, algae-02 tank: "BBA có thể mất 6 đến 8 tháng mới bám chắc": con số đáng ngờ và gây hiểu nhầm, vì BBA có thể bám và lan trong vài tuần.
- ours, algae-02 tank: "Bạn không châm phân nên không phải do phân": kết luận quá chắc, vì dinh dưỡng vẫn đến từ chất thải và nước máy, còn thiếu phân có thể làm cây yếu.
- ours, algae-02 tank: "không châm phân nên không phải do phân": kết luận quá chắc, vì thiếu dinh dưỡng làm cây yếu cũng có thể góp phần gây BBA.
- ours, algae-02 tank: "BBA có thể mất 6 đến 8 tháng mới bám chắc": con số khó kiểm chứng và lạc ý, không giúp được người đang có BBA, dù có dẫn cẩm nang.
- plain, algae-02 tank: "cá Siamese (cá cày Xiêm)": tên gọi lạ, người chơi Việt Nam thường gọi là cá bút chì nên khó tìm mua đúng loài.
- plain, algae-02 tank: "Thêm cây mọc nhanh (như rong đuôi chó, cây thủy sinh dễ trồng)": "cây thủy sinh dễ trồng" không phải tên một loại cây, nên ví dụ này không giúp được gì.
- plain, algae-02 tank: "cá Siamese (cá cày Xiêm)": tên gọi không chuẩn, người chơi Việt Nam thường gọi là cá bút chì, nên khó tìm mua đúng loài.
- plain, algae-03 post: "nếu đây là đèn UV... bật đủ 2 bóng và chạy liên tục": Odyssea dual trên hồ thủy sinh là đèn chiếu sáng, không phải UV; nếu làm theo mà bật đèn liên tục thì tảo càng nở mạnh.
- plain, algae-03 post: "Giảm xuống 4 tiếng và bỏ 1 bóng làm tảo dễ quay lại": sai với đèn chiếu sáng, phủ nhận bước giảm sáng đúng mà người chơi vừa làm.
- plain, algae-03 post: "'Trân châu ngọc trai' là cây thủy sinh hay loài nào cụ thể?" và phần giả định thức ăn thừa: không nhận ra đây là cây trải nền quen thuộc, hồ mới có thể chưa có cá.
- plain, algae-03 post: "đừng tắt hẳn đèn, nhất là nếu đây là đèn UV" và "bật đủ 2 bóng và chạy liên tục": Odyssea dual là đèn chiếu sáng cho hồ, không phải UV. Lời khuyên này đi ngược việc giảm sáng và nếu làm theo sẽ khiến tảo nặng thêm.
- plain, algae-03 post: "Giảm xuống 4 tiếng và bỏ 1 bóng làm tảo dễ quay lại": sai với đèn chiếu sáng, vì giảm sáng là bước đúng để hạn chế tảo.
- plain, algae-03 post: "Thường nước sẽ trong sau khoảng 3-7 ngày" gắn với kịch bản UV không áp dụng cho đèn này, nên tạo kỳ vọng sai.
- ours, algae-03 tank: "bật đèn lại khoảng 6–8 giờ mỗi ngày": dễ gây tái phát với bể mới vài ngày; nên tăng dần từ mức thấp, đặc biệt khi chủ bể đang để 4h/ngày.
- ours, algae-03 tank: "chuyển cá, tép sang bể tạm... vì cây cũng sẽ yếu đi": lý do không ăn nhập; cây yếu không phải lý do để chuyển cá.
- ours, algae-03 tank: "bật đèn lại khoảng 6–8 giờ mỗi ngày": người hỏi đang để 4 giờ, nên mức này nhảy lên quá nhanh; nên tăng dần sau khi hết xanh.
- plain, algae-03 tank: "Đây là cách hiệu quả và không hại gì cho bể": nói quá; che tối làm cây yếu và tảo chết có thể làm tăng amoniac.
- plain, algae-03 tank: "Thức ăn thừa là nguồn dinh dưỡng chính cho tảo": giả định bể đã có cá và cho ăn; bể mới vài ngày thường do nền mới và ánh sáng.
- plain, algae-03 tank: "Sau khi hết xanh, chỉ bật 6-8 tiếng/ngày": dễ gây tái phát với bể mới, và cao hơn mức 4h chủ bể đang để.
- plain, algae-03 tank: "không hại gì cho bể": blackout nhiều ngày làm cây yếu, nhất là trân châu mới trồng, và tảo chết có thể làm tăng amoniac.
- plain, algae-03 tank: "Thức ăn thừa là nguồn dinh dưỡng chính cho tảo": ở bể mới vài ngày, nguồn chính thường là nền mới và cây đang bén rễ; lời khuyên này chưa đúng trọng tâm.
- plain, algae-03 tank: "chỉ bật 6-8 tiếng/ngày": người hỏi đã giảm còn 4 giờ, nên đây là tăng đèn cho bể vừa bị tảo.
- ours, algae-04 post: "hai đèn trắng 60cm": the hobbyist has one 60cm light and one 45cm light.
- ours, algae-04 post: "đèn 'dư sáng' là khá chắc chắn": this is overconfident, as the answer admits it has no PAR reading, and diatoms in a 7-day-old tank are not mainly caused by excess light.
- ours, algae-04 post: "Tạm ngưng phân đạm và phốt phát": cutting N and P entirely can starve newly planted Dutch-style stems, and the cut is not tied to any test.
- ours, algae-04 post: "hai đèn trắng 60cm": misreads the tank; the hobbyist has one 60cm and one 45cm light.
- ours, algae-04 post: "đèn 'dư sáng' là khá chắc chắn": a firm verdict, then it admits it has no PAR figure for this tank.
- plain, algae-04 post: "Thay nước 30% mỗi ngày... hệ vi sinh chưa kịp ổn định": beneficial bacteria live mostly in the filter and substrate, so water changes do not significantly stop them establishing.
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển hơn": this does not help in Vietnam's warm climate and has no bearing on this tank as described.
- plain, algae-04 post: "nước máy ở Việt Nam thường có hàm lượng silicate khá cao": this is a broad claim with no source, and it is called the possible main cause without considering new substrate or stones.
- plain, algae-04 post: "Thay nước 30% mỗi ngày là hơi nhiều": overstated; frequent changes are normal in a new planted tank, and they do not much slow the bacteria, which live in the filter and substrate.
- plain, algae-04 post: "nước máy ở Việt Nam thường có hàm lượng silicate khá cao": a sweeping claim with no source, then named as the likely main cause.
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển hơn": rarely relevant in Vietnam's heat.
- plain, algae-04 tank: "bộ lọc than hoạt tính... khử silicat": activated carbon does not remove silicate; only the resin does.
- plain, algae-04 tank: "Cá chuột Otocinclus": in Vietnam, cá chuột usually means corydoras, while Otocinclus is called cá otto, so this may lead to buying the wrong fish.
- plain, algae-04 tank: "ốc Malaysia" listed as an algae eater: Malaysian trumpet snails mainly burrow and eat detritus, so they will not clear diatoms from glass and rock.
- plain, algae-04 tank: "bộ lọc than hoạt tính hoặc resin khử silicat": than hoạt tính không khử được silicat, chỉ resin chuyên dụng mới có tác dụng.
- plain, algae-04 tank: "Ốc Trochus hoặc ốc Malaysia": Trochus là ốc biển, không hợp bể nước ngọt; ốc Malaysia chủ yếu ăn cặn và đào nền, không phải loài diệt tảo nâu hiệu quả.
- ours, algae-05 post: "Tảo nhớt xanh thường đi kèm đèn chạy dài và dinh dưỡng dư": sai trọng tâm, vì nhớt xanh là vi khuẩn lam, thường gắn với dòng chảy yếu và mùn tích tụ ở đáy; thêm nữa, câu trả lời không nêu cách xử lý trực tiếp như hút nhớt, tắt đèn vài ngày hay tăng dòng chảy.
- ours, algae-05 post: "Tảo nhớt xanh thường đi kèm đèn chạy dài và dinh dưỡng dư": bỏ qua các yếu tố hay gặp là dòng chảy yếu, mùn đọng ở đáy và có thể thiếu nitrat, nên dễ xử lý sai hướng.
- ours, algae-05 post: "nếu đang cao thì bớt bón phân" kết hợp "giảm đèn thêm" cho tảo nhớt xanh: chưa phải cách xử lý trực tiếp, vì không hút bỏ lớp nhớt, không tăng dòng chảy và không tắt đèn vài ngày.
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": khó đúng, vì cây đang lớn tốt thì chủ yếu hấp thụ dinh dưỡng; lý do này dễ làm người nuôi lo sai chỗ.
- plain, algae-05 post: "Cho ăn quá nhiều là nguyên nhân phổ biến nhất": khẳng định quá chắc khi người hỏi không hề nhắc đến cá hay việc cho ăn.
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": cây đang sống và phát triển tốt hút dinh dưỡng, không phải nguồn gây dư.
- plain, algae-05 post: "Cho ăn quá nhiều là nguyên nhân phổ biến nhất": khẳng định quá chắc, người hỏi không hề nhắc đến việc cho ăn; ở đây dòng chảy yếu và mùn đáy sát kính cũng đáng nghi không kém.
- plain, algae-05 post: "tắt đèn phòng khi bể đang bật đèn": không khớp câu hỏi, vì đèn bể tắt lúc 18h còn đèn phòng hắt vào buổi tối, tức là sau khi đèn bể đã tắt.
- ours, algae-05 tank: "đèn mạnh đi kèm dinh dưỡng cao": tảo cát ở bể non chủ yếu do bể chưa ổn định sinh học, nguyên nhân đèn mạnh và dinh dưỡng cao nêu ra chưa sát.
- plain, algae-05 tank: "cá tỳ hưu (Otocinclus)": tên gọi không khớp, Otocinclus ở Việt Nam thường gọi là cá otto.
- plain, algae-05 tank: "cá chùy (cá ăn tảo Siamese với tảo râu đen)": tên có vẻ tự đặt, và loài này không liên quan đến hai loại tảo đang hỏi.
- plain, algae-05 tank: "Thay nước khoảng 25–40% và lặp lại vài lần trong tuần đầu": người nuôi đã thay nước 2 ngày/lần, nên thay nhiều hơn không giải quyết gốc vấn đề; bể 4 tuần chủ yếu cần ổn định và tăng lưu thông.
- plain, algae-05 tank: "cá tỳ hưu (Otocinclus)": tên gọi không khớp với cách gọi Otocinclus quen thuộc trong giới chơi, người đọc dễ mua nhầm cá.
- plain, algae-05 tank: "cá chùy (cá ăn tảo Siamese với tảo râu đen)": câu lẫn lộn và tên gọi lạ; loài này cũng không xử lý tảo nâu hay nhớt xanh, nên gợi ý lạc đề.
- plain, algae-05 tank: "ốc táo" được gợi ý như sinh vật ăn tảo: không phải giải pháp đáng tin cho vấn đề này, và có nguy cơ ăn cây.
- plain, algae-05 tank: "H₂O₂ nhỏ giọt" không có liều lượng: thiếu liều là không an toàn, nhất là với bể có ốc nerita và tép/cá nhạy cảm.
- ours, algae-06 post: "chỗ đặt van ở đầu in lọc": what sits at the filter intake is the diffuser/CO2 injection point, not the solenoid valve, so the wording is confused.
- ours, algae-06 post: "đèn dài cộng CO2 dư là cách rêu tóc bùng lên nhanh": excess CO2 is not a recognised cause of hair algae, and this sits awkwardly beside its own statement that hair algae mostly comes from too little CO2.
- ours, algae-06 post: "chỗ đặt van ở đầu in lọc": nhầm, thứ đặt ở đầu in là sủi CO2 chứ không phải van.
- ours, algae-06 post: "đang châm CO2 quá tay" đi liền với "phần lớn rêu tóc là do thiếu CO2": hai ý chưa được nối lại cho rõ, người đọc không biết nên giảm hay giữ CO2.
- ours, algae-06 post: "đèn dài cộng CO2 dư là cách rêu tóc bùng lên nhanh": CO2 dư không phải nguyên nhân gây rêu tóc đã được công nhận; thường là CO2 thiếu hoặc dao động.
- plain, algae-06 post: "Đặt diffuser ở vị trí cách đầu hút lọc chính khoảng 5-10 cm": bubbles this close still get sucked into the filter, which contradicts its advice to move injection away from the intake.
- plain, algae-06 post: "Gỡ tay rêu sợi, rêu sừng hươu và rêu lông tơ thường kém bền khi bị loại bỏ thủ công": the sentence is garbled and gives no clear instruction.
- plain, algae-06 post: "Phosphat cao thường đi kèm rêu": this is a dated oversimplification that can send the keeper chasing the wrong cause.
- plain, algae-06 post: "sau đó mới tính tới CO2": this downplays CO2, a major factor in the hair algae and BBA this tank has.
- plain, algae-06 post: "Vàng-xanh lá nhẹ là khoảng 20-30 mg/L": the 'yellow-green' reading is imprecise, and the ppm limits look more exact than a drop checker can show.
- plain, algae-06 post: "Đặt diffuser ở vị trí cách đầu hút lọc chính khoảng 5-10 cm": gần như vậy đầu hút vẫn dễ hút bọt vào lọc, không giải quyết được tiếng xọc; khoảng cách này cũng không có căn cứ rõ.
- plain, algae-06 post: "rêu sừng hươu và rêu lông tơ thường kém bền khi bị loại bỏ thủ công": câu lủng củng, ý không rõ và không cho thấy cách xử lý thực tế; rêu sừng hươu thường khó gỡ tay, hay phải cắt lá hoặc chấm thuốc.
- plain, algae-06 post: "Tăng dần, mỗi lần khoảng 1 giọt" ngay sau khi khuyên giảm về 1-2 giọt/giây: mức 1-2 giọt nêu như mức phù hợp chung, trong khi hiệu suất hòa tan của từng cách trộn khác nhau nên con số này chỉ mang tính tham khảo.
- ours, algae-06 tank: "chỗ nước ra của lọc treo": their tank runs a Sunsun 702B canister plus a 603 auxiliary filter, not a hang-on filter, so the description does not match their setup.
- ours, algae-06 tank: "Nếu đang châm CO2 mà checker vẫn vàng thì tăng thêm từ từ": this is reversed. Yellow means too much CO₂, so raising it further risks killing the fish and shrimp; blue is the colour that calls for more.
- ours, algae-06 tank: "khoảng 90% trường hợp rêu tóc là do thiếu CO2": a precise figure with only the guide behind it, and it looks overstated.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3": this drop is far too small; about 30 ppm CO₂ needs a drop of roughly 1 pH unit, so following it leaves the tank short of CO₂.
- plain, algae-06 tank: "dinh dưỡng (đặc biệt là phosphate và nitrate) dư thừa" and "Nếu phosphate cao, rêu sẽ rất khó kiểm soát": this is the old myth; high PO₄/NO₃ alone does not cause these algae, and it steers the keeper away from the CO₂/flow/light causes.
- plain, algae-06 tank: "khuấy nước tốt để CO₂ hòa tan và không thoát ra ngoài": muddled, because surface agitation drives CO₂ off rather than keeping it in.
- plain, algae-06 tank: "cá tỳ bà (ăn rêu lông tơ và rêu tóc)": overstated; pleco-type fish are not reliable eaters of these algae, and it adds a large fish that does not suit a 60 cm tank well.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3": the usual target for about 30 ppm CO₂ is a drop of about 1 pH unit, so this would badly under-dose CO₂.
- plain, algae-06 tank: "cá tỳ bà (ăn rêu lông tơ và rêu tóc)": plecos mainly graze soft film and diatoms, not these algae, and many grow too large for a 60 cm tank.
- plain, algae-06 tank: "Nếu phosphate cao, rêu sẽ rất khó kiểm soát": high phosphate alone does not drive algae; this is an old myth.
- plain, algae-06 tank: "rau muống nước": an odd suggestion as a fast-growing plant for a submerged planted tank.
- ours, algae-07 post: "thiếu dinh dưỡng và thiếu nitrat": xoắn, trắng và teo ngọn thường liên quan đến vi lượng hoặc Ca/độ cứng, không phải thiếu nitrat; đặt nitrat làm trọng tâm dễ lệch hướng xử lý.
- ours, algae-07 post: "vài tháng đến một năm": mức tuổi thọ này khá ngắn với nền công nghiệp có cốt nền và lại nêu theo phỏng đoán; có thể khiến người mới lo quá mức.
- ours, algae-07 post: "thiếu dinh dưỡng và thiếu nitrat": nitrate shortage mainly causes pale or yellow older leaves. It does not typically explain twisted, white, deformed tips, which point to calcium, GH or micronutrient problems.
- ours, algae-07 post: "Mua bộ test nitrat và phosphat, đo để biết bể đang thiếu chất nào": these tests cannot detect the deficiencies most likely behind the tip symptoms, and GH and KH are left out.
- plain, algae-07 post: "Nền trơ như Seachem Flourite, Fluval Stratum": Fluval Stratum là nền đất nung có một ít dinh dưỡng, không hẳn là nền trơ.
- plain, algae-07 post: "ADA Amazonia, Tropica, Aqua Soil": liệt kê Aqua Soil như một loại riêng là không chính xác, vì Amazonia thuộc dòng Aqua Soil của ADA.
- plain, algae-07 post: "Fluval Stratum... không có dinh dưỡng": Stratum is a volcanic soil substrate, not a truly inert gravel like Flourite or plain sand, so grouping it this way is inaccurate.
- plain, algae-07 post: "không bón phân đều": treats lack of regular dosing as fact, though the hobbyist never described their fertilizer routine.
- plain, algae-07 post: Links the twisted, white tips to micronutrients but never names low calcium or GH, or boron, which are key suspects for these symptoms.
- ours, algae-07 tank: "nếu chúng tụt về 0 thì rêu sẽ được nuôi dưỡng": loosely worded. Zero nutrients do not directly feed algae; they weaken the plants so algae gains the advantage. The fix given (dose more evenly) is still right.
- plain, algae-07 tank: "Nitrat và photphat cao: là 'thức ăn' của rêu": outdated view; high NO3/PO4 alone does not cause algae, and limiting them can worsen stunted tips in a CO2 tank.
- plain, algae-07 tank: "thiếu sắt hoặc vi lượng" as the main cause of twisted tips: iron shortage mainly yellows or pales new leaves; twisted new growth points first to calcium or water hardness.
- plain, algae-07 tank: "Ốc táo" and "cá tỳ bà" as algae control: weak or risky suggestions for a Dutch-style planted tank, since apple snails may eat soft plants and plecos grow large and can damage leaves.
- plain, algae-07 tank: "bèo tây" as a floating plant: water hyacinth is unsuitable for an indoor planted tank, and shading would hurt the stem plants underneath.
- plain, algae-07 tank: "thiếu sắt hoặc vi lượng" as the main cause: twisted, white new growth points more to low Ca/GH or boron; pale iron chlorosis does not usually twist tips, so adding iron can miss the problem and may feed algae.
- plain, algae-07 tank: "Nitrat và photphat cao: là 'thức ăn' của rêu": an outdated view. In a CO₂ planted tank, keeping NO₃/PO₄ too low often worsens algae and stunts plants.
- plain, algae-07 tank: "Ốc nerite, ốc táo" and "bèo tây": apple snails can eat soft plants, and water hyacinth is unsuitable for this kind of indoor planted tank, especially for stem plants needing light.
- plain, algae-07 tank: "Cá tỳ bà": sold as an algae eater but grows large, produces heavy waste and is a poor fit for a Dutch-style tank.
- ours, algae-08 post: "khoảng 26 con": số cá hiện tại là 10 + 9 + 5 = 24 con; sai lệch nhỏ, không đổi lời khuyên.
- ours, algae-08 post: "chưa chạy xong chu trình nitơ, cần chờ và hạn chế cho ăn": waiting alone is weak advice when ammonia or nitrite is above 0, because water changes are needed to protect the fish.
- plain, algae-08 post: "Bể xi măng non thường làm pH tăng": bể đúc ở đây là bể kính đúc liền khối, không phải bể xi măng, nên đây là nguyên nhân sai.
- plain, algae-08 post: "khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ)": các số liệt kê cộng ra 33 và tính nhầm cả 9 mún ban đầu; hiện tại chỉ có 24 con.
- plain, algae-08 post: "rau muống, bèo tây, rêu java": bèo tây quá to cho bể 50cm, còn rêu java mọc chậm, không phải cây hút dinh dưỡng nhanh.
- plain, algae-08 post: "Bạn cho mình biết thêm... thời gian bể đã chạy cá": hỏi lại điều người chơi đã nói (hơn 3 tuần, và diễn biến sau đó).
- plain, algae-08 post: "Bể xi măng non": "bể đúc" here most likely means a one-piece moulded glass tank, so the cement cause is a misreading.
- plain, algae-08 post: "khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ)": the listed numbers add up to 33, and the 9 mún were from the original stock, not the current one.
- plain, algae-08 post: "Đây là lỗi lớn nhất": this calls the on-off filter the biggest fault, while the heading names overstocking, food and light as the main cause.
- plain, algae-08 post: "bèo tây": water hyacinth is a poor fit for a 50cm tank because it grows too large.
- plain, algae-08 tank: "nếu nước máy có nitrate/phosphate cao, hãy để nước lắng": để lắng không làm giảm nitrate hay phosphate.
- plain, algae-08 tank: "cỏ đuôi chồn (Hornwort), rong đuôi chó": liệt kê như hai loại khác nhau trong khi Hornwort thường chính là rong đuôi chó/đuôi chồn, gây rối.
- plain, algae-08 tank: "để nước lắng" to deal with high nitrate/phosphate in tap water: letting water stand does not remove either one.
- plain, algae-08 tank: "cỏ đuôi chồn (Hornwort), rong đuôi chó" listed as two separate plants, though both names are commonly used for hornwort.
- plain, algae-08 tank: "ốc nhồi" recommended as an algae eater: it is a poor choice for grazing diatoms from glass, and adding clean-up animals adds bioload to an already crowded tank.
- ours, algae-09 post: "Dời bể ra chỗ không có nắng chiếu": a large cast tank is hardly movable, and the hobbyist put it on the balcony because of its size.
- ours, algae-09 post: "Tắt đèn bể": the hobbyist never mentioned a light, and a balcony tank gets its light from the sun, so this step is generic.
- ours, algae-09 post: "nếu có số đo cao, thay khoảng 30% nước": this makes the emergency water change depend on a test the hobbyist may not own, even though fish are already dying.
- ours, algae-09 post: "Dời bể ra chỗ không có nắng chiếu": impractical for a large cast tank that the hobbyist had to put on the balcony.
- ours, algae-09 post: "Tắt đèn bể": generic step, as this outdoor tank is lit by the sun and no lamp is mentioned.
- plain, algae-09 post: "Bể ngoài trời, đáy trống, có nhiều cá, cho ăn đều": the hobbyist never said the tank is heavily stocked or how often they feed, so this is an assumption.
- plain, algae-09 post: "vật liệu vi sinh, bông lọc, sứ lọc" under biological filtration: filter wool is mainly mechanical, a minor imprecision.
- plain, algae-09 post: "mất điện là cá chết ngay": overstated, since fish do not always die immediately, though the backup-aerator advice is sound.
- plain, algae-09 post: "Bèo tây, bèo cái, lục bình": bèo tây and lục bình are the same plant, so the list is redundant.
- ours, algae-09 tank: "Bật sủi" ngay and "bật sủi khí liên tục": minor, the tank already runs aeration and the answer does not acknowledge it.
- ours, algae-09 tank: "Mỗi lần thay nước lại đưa thêm chất dinh dưỡng vào": stated as the cause without testing the tap water; plausible but only a guess, though it is flagged as one.
- ours, algae-09 tank: "Mỗi lần thay nước lại đưa thêm chất dinh dưỡng vào": nêu chắc như nguyên nhân chính trong khi chưa đo nước máy; thức ăn và chất thải cá thường là nguồn dinh dưỡng lớn hơn.
- plain, algae-09 tank: "tảo bùng lên khi hệ vi sinh tái lập": a shaky mechanism; it blames a broken nitrogen cycle and misses direct balcony sun as the main driver.
- plain, algae-09 tank: "bể đặt gần cửa sổ hoặc đèn bật quá 8 giờ/ngày": wrong for this tank, which sits outdoors in natural sun, so cutting light hours does not apply.
- plain, algae-09 tank: "ốc nerite, cá otto": algae grazers do not eat free-floating green-water algae, and otto do poorly in this outdoor setting.
- plain, algae-09 tank: "dương xỉ java" as a fast-growing nutrient competitor: java fern grows slowly and does little to take up nutrients.
- plain, algae-09 tank: "cân nhắc RO": impractical for a large concrete outdoor tank.
- plain, algae-09 tank: "chu trình nitơ bị phá vỡ" là nguyên nhân chính, "tảo bùng lên khi hệ vi sinh tái lập": chẩn đoán lệch, nguyên nhân rõ nhất là nắng ban công và bể không cây; thay nước không làm mất vi khuẩn có lợi vì vi khuẩn chủ yếu ở lọc.
- plain, algae-09 tank: "cá otto", "ốc nerite": ăn tảo bám chứ không xử lý được tảo phù du làm nước xanh, nên gợi ý này vô tác dụng.
- plain, algae-09 tank: "Che tối bể 3–5 ngày" nêu mà không cảnh báo tảo chết hàng loạt gây tụt oxy, tăng amoniac, và không dặn thay nước sau khi che.
- ours, algae-10 post: "Nếu nước máy nhà bạn nhiều silicate thì nên dùng thêm nước lọc RO": this is costly and rarely needed for a brown-algae problem, though it is hedged as general experience.
- ours, algae-10 post: "Chà kính, đá và lũa": the scrubbing targets hard surfaces, while the algae and stuck dirt are on the leaves. This is misdirected rather than false.
- ours, algae-10 post: "chỉ thả khi thần tiên đã lớn": larger angelfish hunt shrimp more easily, so waiting until they grow makes things worse.
- ours, algae-10 post: "Nếu bể mới set khoảng 3–4 tuần... tự hết": the hobbyist never said the tank is new, and a tank stocked with many angelfish may well be established, so this step may not apply.
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo is the apple snail, not nerite, so the buyer may get the wrong snail.
- plain, algae-10 post: "rêu hornwort": hornwort is a stem plant, not a moss, and rau muống is an odd suggestion for a typical planted tank.
- plain, algae-10 post: "Cá nhớt Siamese (cá chét đuôi đỏ)": this does not look like a real Vietnamese name for the Siamese algae eater, so it is confusing when buying the fish.
- plain, algae-10 post: "Rêu nâu dạng sợi thường do ánh sáng, dinh dưỡng và cân bằng CO2": the cause is generic and stated too confidently, with no check against the tank's actual conditions.
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo is the apple snail, a different animal from nerite, and it can eat soft plants, so the buyer could get the wrong snail.
- plain, algae-10 post: "rêu hornwort": hornwort (rong đuôi chồn) is a stem plant, not a moss.
- plain, algae-10 post: "Cá nhớt Siamese (cá chét đuôi đỏ...)": this is not a recognised Vietnamese name for the Siamese algae eater and could lead to buying the wrong fish.
- plain, algae-10 post: "Rêu nâu dạng sợi thường do ánh sáng, dinh dưỡng và cân bằng CO2": too generic; it names no algae type, and the tank's CO₂ is unknown.
- ours, algae-10 tank: "loài này hiền và không đụng tới ông tiên": this looks at the wrong risk. A grown angelfish can eat or harass small otos, so they need to be sized up against the angel, and no warning is given.
- ours, algae-10 tank: "đang có một con ông tiên": the tank data lists angelfish but not that there is only one, so the count is assumed.
- ours, algae-10 tank: "đừng đổi nước": telling a new tank to skip water changes is poor advice, because routine changes do not hurt and help a new tank.
- ours, algae-10 tank: "đang có một con ông tiên": số lượng "một con" không có trong dữ liệu.
- ours, algae-10 tank: Coi rêu sợi là tảo silic làm chẩn đoán chính và khuyên "đừng đổi nước" khi bể mới: không khớp với mô tả rêu sợi, tuổi bể chưa biết, và không có hướng xử lý nếu đúng là rêu sợi.
- ours, algae-10 tank: Khuyên thả otto "hiền và không đụng tới ông tiên": bỏ qua việc otto nhỏ có thể bị thần tiên lớn đớp, và thẻ loài ghi 21–26 °C, dễ khó sống trong nhiệt độ nóng ở Việt Nam.
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus": this treats the two as the same. Common tỳ bà grow large and are poor algae eaters for a planted tank.
- plain, algae-10 tank: "H₂O₂... liều thấp": it suggests spot-treating with hydrogen peroxide but gives no actual dose, which is risky for the fish and soft plants.
- plain, algae-10 tank: "Tránh cá rồng, cichlid lớn, betta..." and "cá thái": the list never names angelfish, and "cá thái" is too vague to act on as a shrimp-safe fish.
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus": gộp hai nhóm cá khác nhau; cá tỳ bà thường lớn rất to, không tương đương otto.
- plain, algae-10 tank: "nhiều loại không đẻ trứng trong nước ngọt": ốc Nerite vẫn đẻ trứng trong nước ngọt, chỉ là trứng không nở.
- plain, algae-10 tank: "cá neon" được nêu là lựa chọn cá hiền để nuôi tép mà không cảnh báo rằng neon cũng dễ bị thần tiên ăn; chi tiết này lạc khỏi bể của họ.
- plain, algae-11 post: "chọn chất khử ghi rõ 'khử chloramine', ví dụ sản phẩm có chứa sodium thiosulfate": thiosulfate alone breaks the chlorine-ammonia bond but leaves ammonia behind, so it is a poor example of a chloramine treatment.
- plain, algae-11 post: "Nhiều nơi dùng chloramine thay vì clo": this is given prominence without evidence for Vietnam, where tap water is usually treated with chlorine, so it may send the reader down the wrong path.
- plain, algae-11 post: "lấy một ít vật liệu lọc hoặc nước từ bể cũ": old tank water carries very little of the useful bacteria, which live mainly on filter media and surfaces.
- plain, algae-11 post: "chọn chất khử ghi rõ 'khử chloramine', ví dụ sản phẩm có chứa sodium thiosulfate": thiosulfate alone removes chlorine but leaves the ammonia released from chloramine, so it is a poor example of a chloramine treatment.
- plain, algae-11 post: "Nhiều nơi dùng chloramine thay vì clo": stated generally and given prominence, although Vietnamese tap water is typically chlorinated, so it may send the hobbyist after an unlikely cause.
- plain, algae-11 tank: "để bể chạy 3–6 tuần với lượng cá rất ít hoặc không cá": a tank with no fish and no ammonia source does not build up bacteria, and cycling with a few fish still exposes them to ammonia.
- ours, setup-01 post: "Sưởi... không cần 24/24": gây hiểu nhầm, vì sưởi có bộ điều nhiệt nên cần cắm liên tục, nhất là mùa lạnh Hà Nội; rút điện khiến nhiệt dao động.
- ours, setup-01 post: "Sưởi... không cần 24/24 nếu nhiệt ổn định": giữa mùa lạnh Hà Nội, sưởi có bộ điều nhiệt nên để cắm liên tục; câu này gây hiểu nhầm và có thể khiến nhiệt độ dao động, sốc cá.
- ours, setup-01 post: "Chờ đủ 7 ngày rồi mới thả 1–2 con": mốc 7 ngày cố định chưa chắc lọc đã đủ vi sinh, nhất là khi lọc sinh học yếu và không có bước test amoniac/nitrit.
- plain, setup-01 post: "Không thay nhiều, vì làm mất vi sinh vật có lợi": vi sinh chủ yếu bám ở vật liệu lọc và nền, không ở nước; bể thủy sinh mới thường cần thay nước thường xuyên để giảm amoniac và rêu.
- plain, setup-01 post: "Không thay nhiều, vì làm mất vi sinh vật có lợi": vi sinh chủ yếu bám ở vật liệu lọc và nền, không nằm trong nước, nên thay nước không làm mất nhiều; bể cây mới set thường còn cần thay nước khá đều để hạn chế rêu.
- plain, setup-01 post: "Cả hai cách trên mạng đều có cơ sở": không bác rõ việc bật đèn liên tục 3 ngày của bên setup, trong khi cách này dễ gây rêu và không cần thiết.
- ours, setup-01 tank: "cycling có cá" được nêu ngang hàng với các cách khác mà không cảnh báo: cách này gây hại cho cá và không nên gợi ý cho người mới.
- ours, setup-01 tank: "cycling có cá" được liệt kê ngang hàng mà không cảnh báo rủi ro: cá dễ bị ngộ độc amoniac/nitrit nếu người mới làm theo.
- plain, setup-01 tank: "Dấu hiệu thiếu CO2: ... lá vàng": lá vàng thường do thiếu dinh dưỡng hoặc thiếu sáng, nên đây không phải dấu hiệu đặc trưng của thiếu CO2.
- plain, setup-01 tank: "không có bọt khí nhỏ bám trên lá khi có đủ ánh sáng" nêu như dấu hiệu thiếu CO2: không đáng tin, cây vẫn có thể sủi bọt hoặc không tùy điều kiện, dễ gây chẩn đoán sai.
- plain, setup-01 tank: "betta và nhiều loài cá cảnh phổ biến ở khoảng 24–27°C": ví dụ betta không hợp cho bể 1m và không liên quan đến người hỏi; chỉ là chi tiết lạc đề, không gây hại lớn.
- ours, setup-02 post: "Nếu la hán là cá la hán": in a planted bonsai list, la hán is most likely a plant, so the fish warning is probably off-target, though it is hedged.
- ours, setup-02 post: "bật khoảng 8 tiếng" cho bể mới: trái với đoạn trích ngay bên dưới, vốn khuyên bể mới set bắt đầu 6 tiếng.
- ours, setup-02 post: "ưu tiên loại RGB" không kèm lý do, không phải yêu cầu thiết yếu với nhóm cây này.
- plain, setup-02 post: "Sunsun HW-304B hoặc HW-302" after advising 400–600 L/h: these canister filters are rated far above that flow, so the pick contradicts its own figure and needs heavy throttling.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar is not a cheaper alternative to Chihiros.
- plain, setup-02 post: "Nicrew hoặc Jebao" and "Chihiros C60": these light suggestions look loosely recalled; Jebao is known mainly for pumps, and the C60 model name is doubtful.
- plain, setup-02 post: "cá la hán (cichlid)": treats la hán as a possible fish in what is most likely a plant list, though only conditionally.
- plain, setup-02 post: "Sunsun HW-304B hoặc HW-302" kèm mức 400–600 lít/giờ: hai máy này có lưu lượng danh định khoảng 1000–1400 L/h, vượt xa con số nó vừa khuyên và cần khóa bớt dòng.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar thường là dòng đèn cao cấp, không phải lựa chọn rẻ hơn Chihiros.
- plain, setup-02 post: "Chihiros C series (ví dụ C 60)": tên model này khó xác minh, người đọc có thể khó tìm đúng sản phẩm.
- plain, setup-02 post: "low-tech, không cần CO2" áp cho cả trân châu: nhóm cây thảm này khó dày đẹp nếu không có CO₂, nên lời khuyên quá lạc quan.
- ours, setup-02 tank: "Lọc treo với hộp lõi nhỏ thường không đủ cho phần lớn bể": nói quá chung, vì lọc treo vẫn dùng được cho bể nhỏ hoặc nuôi ít cá nếu có đủ vật liệu.
- ours, setup-02 tank: "Lọc treo với hộp lõi nhỏ thường không đủ cho phần lớn bể": this is overstated, since such filters can be enough for small or lightly stocked tanks.
- plain, setup-02 tank: "Bể 30–100 lít: lọc treo sau": bể 60×40×40 khoảng 96 lít sẽ rơi vào nhóm này, trong khi bể bố cục bonsai cỡ đó thường hợp lọc thùng hơn vì nhiều vật liệu, gọn và dễ giấu thiết bị.
- plain, setup-02 tank: "Bể 30–100 lít: lọc treo sau": a 96 L planted bonsai tank falls in this band, and a hang-on-back is a weak choice for it. A canister suits it better, because it holds more media and keeps the tank tidier.
- ours, setup-03 post: "lọc trong khoảng 400 lít/giờ cho bể 35–55 lít": this flow is too strong for the tiny schooling fish the hobbyist wants, and no gentler option is offered.
- ours, setup-03 post: "sưởi cố định khoảng 50 W giữ 25°C": presents a heater as a main purchase, though it is unnecessary for much of the year in most of Vietnam.
- ours, setup-03 post: "sưởi cố định khoảng 50 W giữ 25°C": coi sưởi là khoản mua bắt buộc và tốn nhiều tiền, trong khi phần lớn Việt Nam không cần, nhất là miền Nam; đây là tiền phí trong ngân sách 3-4 triệu.
- ours, setup-03 post: "làm một bể low-tech cỡ 35–55 lít, không viền": bạn này đã có sẵn bể, nên chọn cỡ và kiểu bể mới là lệch với tình huống.
- plain, setup-03 post: "Tổng cộng khoảng 2.5-3.5 triệu": the table actually adds up to about 2.3-3.3 million, a minor arithmetic slip.
- plain, setup-03 post: "Rotala" under "Cây dễ sống", with Otocinclus suggested for a new tank: Rotala is less forgiving in low-tech setups, and Otocinclus does poorly in tanks that have not matured.
- plain, setup-03 post: "Cá ngọc trai (Celestial pearl danio), Galaxy rasbora": liệt kê như hai loài, nhưng đây là cùng một loài cá (Danio margaritatus).
- plain, setup-03 post: "Harlequin": được xếp chung vào nhóm cá nhỏ, nhưng loài này lớn hơn hẳn và không thuộc kiểu cá "nhỏ tí ti" mà bạn này thích.
- ours, setup-03 tank: "chi phần lớn cho đèn, lọc và sưởi": treats the heater as a core expense, though it is often unnecessary in much of Vietnam, especially the South.
- ours, setup-03 tank: "bắt đầu bằng bể 35-55 lít không viền": irrelevant because the hobbyist already owns a tank, and it steers them toward a tank style they need not buy.
- ours, setup-03 tank: "chi phần lớn cho đèn, lọc và sưởi": sưởi không phải khoản quyết định ở miền Nam hay vùng ấm, nhưng câu này nêu chung như bắt buộc cho mọi nơi tại Việt Nam.
- plain, setup-03 tank: "Trân châu" is listed as an easy plant, but this carpet plant is usually difficult without CO₂ and strong light.
- plain, setup-03 tank: "Thủy tùng (Anubias)": the common hobby name for Anubias in Vietnam is "ráy", so this name is misleading when shopping.
- plain, setup-03 tank: "crystal red" is suggested as an easy cleanup shrimp, but it is sensitive to warm water and poor conditions, making it unsuitable for a beginner in Vietnam's heat.
- plain, setup-03 tank: "Lọc treo thành bể hoặc lọc hộp kiểu HOB": this muddles hang-on-back and canister filters, which are different types.
- plain, setup-03 tank: "Trân châu" được xếp vào cây dễ sống cho người mới: trân châu thường khó hơn, cần đèn mạnh và thường cần CO₂ để trải thảm đẹp.
- plain, setup-03 tank: "Cá bảy màu" được nêu trong nhóm loài đi đàn: bảy màu không phải cá đi đàn thực sự.
- plain, setup-03 tank: "crystal red" được gợi ý cho bể người mới: tép này nhạy với chất lượng nước, không dễ nuôi trong bể mới bằng nước máy.
- plain, setup-03 tank: "Thủy tùng (Anubias)": giới chơi Việt Nam thường gọi Anubias là ráy, nên tên này dễ gây nhầm khi mua.
- ours, setup-04 post: "dùng aquasoil hoặc đất nền... dày khoảng 4-5 cm": mặc định nền dinh dưỡng dày dù hầu hết cây trong bố cục bám đá và không cần nền, nên dễ tốn tiền và thêm tải cho kệ tivi.
- ours, setup-04 post: "hướng vòi nước lên mặt nước": khó áp dụng với lọc thác, vì nước chảy tràn từ miệng thác chứ thường không có vòi để chỉnh hướng.
- ours, setup-04 tank: "Rong La Hán thì lên chậm": unverified and doubtful if it is a stem plant, which usually grows faster than the moss, anubias and fern in this tank; the watch-it advice is still harmless.
- plain, setup-04 tank: "Cây có rễ (Anubias...) hợp với nền giàu dinh dưỡng": ráy (Anubias) chủ yếu gắn đá/lũa, không cần nền giàu và vùi thân rễ xuống nền dễ thối.
- ours, setup-05 post: "nền nhả chậm là đủ, không cần thêm nền trộn phức tạp": đúng với rêu, ráy (vốn buộc lũa đá) nhưng bỏ qua nhóm cây đỏ cắt cắm mà chủ hồ đã nêu, nhóm này cần nền giàu dinh dưỡng.
- ours, setup-05 post: "nếu 3 bóng 10k và 6k5 là T5HO": người hỏi đã nói rõ dùng T5HO; câu trả lời vẫn đặt điều kiện và bắt họ tự cộng W, không đưa ra kết luận cho dàn 4 bóng.
- ours, setup-05 post: "nền nhả chậm là đủ": chỉ đúng với rêu, ráy, trong khi hồ này còn có cây cắt cắm lá đỏ cần nền và dinh dưỡng tốt hơn; câu trả lời không xử lý rõ phần này.
- plain, setup-05 post: "1 bóng hồng... rất có lợi": nói hơi quá, bóng hồng chủ yếu làm màu lên đẹp hơn trong mắt người xem, còn màu đỏ thật của cây phụ thuộc nhiều vào cường độ sáng, CO₂ và dinh dưỡng.
- plain, setup-05 post: "đất sét nung" được xếp vào nền dinh dưỡng rẻ: đất sét nung thường nghèo dinh dưỡng nếu không bổ sung phân.
- plain, setup-05 post: "1 bóng hồng... rất có lợi": nói quá, bóng hồng chủ yếu làm màu đỏ lên đẹp hơn khi nhìn và chỉ hỗ trợ phần nào, không tự làm cây đỏ nếu thiếu CO₂ và dinh dưỡng.
- plain, setup-05 tank: "nền dinh dưỡng lót 3 cm + sỏi 2 cm... 3-4 kg sỏi": with its own formula, 60×30×2 cm at 1.5 kg/L is about 5.4 kg of gravel, so the example contradicts itself.
- plain, setup-05 tank: "40-60 µmol/m²/s trở lên" at the bottom is on the low side for holding good red colour, so it may mislead the reader about how much light is enough.
- plain, setup-05 tank: "nền dinh dưỡng lót 3 cm + sỏi 2 cm... 3-4 kg sỏi": bể 60×30 với 2 cm sỏi là 3,6 lít, khoảng 5 kg theo chính tỷ trọng 1,5 kg/lít mà câu trả lời đưa ra, nên ví dụ tự mâu thuẫn.
- ours, setup-06 post: "phủ ở mặt tiền một lớp sạn hoặc cát... để nền dinh dưỡng ít bị trôi": treats the sand as a cap on the soil, though the soil is walled off by pebbles and the front is the empty area.
- ours, setup-06 post: "Đừng trải quá dày, vì cây thấp sẽ khó bám rễ": the hobbyist's front area is left unplanted, so this concern does not apply.
- ours, setup-06 post: "bucep và hồng thái dương cần sáng mạnh hơn": bucep is a low-to-moderate light plant and should not be grouped with a red stem plant that needs strong light.
- ours, setup-06 post: "phủ... để nền dinh dưỡng ít bị trôi": assumes soil lies under the front, although the hobbyist's pebble wall is meant to contain it.
- ours, setup-06 post: "Đừng trải quá dày, vì cây thấp sẽ khó bám rễ": the front is meant to be empty, so this reason does not fit the hobbyist's layout.
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm nhiều khi xuống đáy": 30 cm is the front-to-back width; the height that matters for light is 36 cm.
- plain, setup-06 post: "Phủ cát lên Aquafor khoảng 1–2 cm": misreads the layout and conflicts with its own advice to use the pebble edge to separate sand from soil.
- plain, setup-06 post: "Với 2 bóng thường chỉ xanh hoặc nhạt màu": stated flatly without knowing the Odyssea model's type or wattage.
- plain, setup-06 post: "Hồ sâu 30 cm nên ánh sáng bị giảm nhiều": the tank is 36 cm tall and 30 cm is its front-to-back depth, so the wrong dimension is used for light penetration.
- plain, setup-06 post: "Phủ cát lên Aquafor khoảng 1–2 cm": the hobbyist walls the soil in with pebbles to leave the front empty, so there may be no Aquafor there to cover. The sand can go directly on the glass.
- plain, setup-06 post: "Với 2 bóng thường chỉ xanh hoặc nhạt màu": stated flatly without knowing whether the lamps are T5 or LED, or their wattage.
- ours, setup-06 tank: "bể rộng khoảng 60 cm trở xuống thường dùng một máng": dùng chữ "rộng" dễ gây nhầm vì 60 cm thường là chiều dài bể, và ý này không trả lời được nên chọn máng 2 hay 4 bóng.
- plain, setup-06 tank: "phủ một lớp lưới hoặc giấy ngăn": giấy sẽ mục trong nước và không ngăn sạn bền; nên dùng lưới hoặc quây đá như hobbyist đang làm.
- plain, setup-06 tank: "cá đào bới (cichlid, cá hoàng kim...)": ví dụ cá hoàng kim không rõ ràng và không liên quan tới bể này.
- plain, setup-06 tank: "phủ một lớp lưới hoặc giấy ngăn": giấy sẽ mủn trong nước nên không ngăn được lâu dài; lưới mới là vật liệu phù hợp.
- plain, setup-06 tank: "cá hoàng kim" được xếp vào nhóm cá đào bới: ví dụ này không chính xác và cũng không liên quan đến bể của họ.
- ours, setup-07 tank: "Đặt bể tránh nắng trực tiếp qua hốc cửa sổ": bể đã âm cố định vào hốc cửa sổ nên không thể đặt lại; lẽ ra phải khuyên che rèm hoặc dán phim chắn nắng.
- ours, setup-07 tank: "Bật đèn 90 cm khoảng 8 đến 10 giờ mỗi ngày": hơi dài với bể sát cửa sổ đã nhận thêm ánh sáng tự nhiên, dễ gây tảo.
- ours, setup-07 tank: "có vẻ còn yếu": judges the filter weak from wattage alone, without knowing its flow; a 8W hang-on filter plus an air-driven bio filter is usually adequate for 10 guppies in 72 L.
- ours, setup-07 tank: "Đặt bể tránh nắng trực tiếp qua hốc cửa sổ": the tank is built into the window niche, so it cannot simply be placed elsewhere; it needed shading advice such as a film or curtain.
- plain, setup-07 tank: "cá khoang, cá bống, cá vàng... sẽ phá cây": gộp chung quá rộng, nhiều loại bống nhỏ dọn bể không phá cây.
- ours, setup-08 post: "chưa ghi con số an toàn": the attached glass guide excerpt has a minimum-thickness section, so X dodges the main question instead of using it.
- ours, setup-08 post: "cần bể từ khoảng 208 lít trở lên": the figure is stated too precisely and categorically; angelfish do need a larger tank, but this looks like a converted 55 gal rather than a firm limit.
- ours, setup-08 post: "Cá thần tiên... cần bể từ khoảng 208 lít trở lên": con số quá chính xác và khắt khe, bể 120 lít cao 45 cm vẫn nuôi được vài con hoặc một cặp cá thần tiên.
- plain, setup-08 post: "Kính 5 ly là ổn... đủ an toàn": 5 mm is thin for a tank 45 cm high and 45 cm deep; 6–8 mm is the usual choice, especially with a heavy planted-tank load, so this is false reassurance.
- plain, setup-08 post: "Lia thia (betta)... một cặp nếu bể đủ rộng": keeping a betta pair in a community tank risks fighting and injury.
- plain, setup-08 post: "Cá sóc (corydoras)": corydoras are usually called cá chuột in Vietnam, so this name could send the buyer to the wrong fish.
- plain, setup-08 post: "Đèn và đá trang trí có thể mua sau": light cannot wait in a planted tank, which is the setup the hobbyist asked about.
- plain, setup-08 post: "Kính 5 ly là ổn... đủ an toàn": bể cao 45 cm, khoảng 120 lít, thường nên dùng kính dày hơn (khoảng 8 ly), nhất là bể có nền và đá nặng, nên khẳng định này có nguy cơ gây phình hoặc bục bể.
- plain, setup-08 post: "Cá sóc (corydoras)": gọi sai tên, corydoras ở Việt Nam là cá chuột.
- plain, setup-08 post: "Cá kim/neon": gộp hai loại cá khác nhau, cá kim không phải neon tetra.
- plain, setup-08 post: "Lia thia (betta)... một cặp nếu bể đủ rộng": nuôi cặp betta chung trong bể cộng đồng dễ cắn nhau, trống có thể đánh mái.
- plain, setup-08 post: Liệt kê "trạch" là cây dễ trồng: tên cây không rõ ràng, nghe như nhầm tên.
- ours, setup-08 tank: "lọc trong khoảng 400 lít/giờ... sưởi 50 W": sized for 35–55 L, while the real tank is about 120 L, so a buyer following this gets gear too small.
- ours, setup-08 tank: "dùng bể không viền": the hobbyist already owns a tank, so this tip does not apply.
- ours, setup-08 tank: "Theo dõi... trong tuần đầu": omits the nitrogen cycle and when to add fish, a major risk for a new tank.
- ours, setup-08 tank: "Lọc trong khoảng 400 lít/giờ... sưởi 50 W" tính cho bể 35–55 lít: bể thật khoảng 120 lít nên cấu hình này thiếu, nhất là sưởi.
- ours, setup-08 tank: "Dùng bể không viền" là cách tiết kiệm: người hỏi đã có sẵn bể nên ý này vô ích.
- ours, setup-08 tank: "Superfish AquaFlow 200": gợi ý theo cẩm nang nước ngoài, không phải loại lọc rẻ phổ biến ở VN, không chắc dễ mua.
- ours, setup-08 tank: "Chịu được nhiệt 24–26°C" và cố định 25°C: mức nhiệt khó giữ trong khí hậu nóng ở VN nếu không có làm mát.
- plain, setup-08 tank: "Trân châu... Cỏ nhung, Rotala" under plants tolerating low light and no CO₂: carpet and stem plants like these usually struggle in a cheap no-CO₂ setup.
- plain, setup-08 tank: "Ốc Nerite (... không đẻ trứng trong nước ngọt)": they do lay eggs in fresh water; the eggs just do not hatch.
- plain, setup-08 tank: "Lọc hang (lọc thác)": treats two different filter types as one.
- plain, setup-08 tank: "sưởi 25–300W tùy kích thước bể": the range is too wide to guide a purchase, and heaters are not always essential in much of Vietnam.
- plain, setup-08 tank: "Trân châu" được xếp vào nhóm cây chịu thiếu sáng và thiếu CO2: trải thảm trân châu thường cần sáng mạnh và CO2, khó hợp bể tiết kiệm.
- plain, setup-08 tank: "Cỏ nhung, Rotala, Bucephalandra" được liệt kê như cây dễ rẻ: Bucephalandra thường không rẻ, Rotala cần sáng khá hơn.
- plain, setup-08 tank: "Sưởi 25–300W": khoảng quá rộng nên không giúp chọn mua, và ghi là thiết yếu dù kinh phí ít, trong khi nhiều vùng ở VN ít cần sưởi trừ mùa lạnh.
- plain, setup-08 tank: "Lọc hang (lọc thác)": gộp hai loại lọc khác nhau.
- ours, setup-09 post: "máy ghi khoảng 400 lít trở lên là thoải mái": with its own halving rule, that is about 200 L/h, too weak to move water along a 170 cm tank.
- ours, setup-09 post: "thường từ khoảng 8 mm": this is on the thin side for a 170 cm tank, although it does tell the reader to check with the glass shop.
- plain, setup-09 post: "Lỗ hút nên gần đáy bể, cách đáy khoảng 2–3 cm": với nền cát, lỗ này nằm ngang hoặc dưới lớp nền nên dễ hút cát vào lọc; lỗ khoan thấp cũng có nguy cơ xả cạn bể nếu rò.
- plain, setup-09 post: "bể dài và sâu nên cần lưu lượng lớn": bể chỉ cao 35 cm, không sâu; lý do chọn lọc thùng này không chuẩn.
- plain, setup-09 post: "Lỗ hút... cách đáy khoảng 2–3 cm": with a sand and gravel bed this inlet would be buried or suck up sand, and a hole that low risks draining the tank if it leaks.
- plain, setup-09 post: "công tắc hoặc timer để bật tắt đèn và lọc": a canister filter should run continuously; putting it on a timer harms the bacteria and the water.
- plain, setup-09 post: "cá đuôi kiếm nhỏ": swordtails are not really small fish and do not suit a nano-fish shoal suggestion.
- plain, setup-09 post: "bể dài và sâu": at 35 cm high and 30 cm wide, this tank is long but shallow, so the reason given is partly wrong.
- ours, setup-09 tank: "Thay than hoạt tính khi đã dùng quá khoảng 30 ngày": than hoạt tính không cần thiết cho một bể chạy thường xuyên, nên việc này chỉ thêm công cho người muốn ít chăm.
- ours, setup-09 tank: "Thay than hoạt tính khi đã dùng quá khoảng 30 ngày": than hoạt tính không bắt buộc trong bể cá thông thường, nên bước này thêm việc và chi phí cho người muốn ít chăm.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus" được xếp vào nhóm ít chăm: Otocinclus khá nhạy với bể mới và dễ hao, không thật sự dễ nuôi; tên tỳ bà ở Việt Nam cũng thường chỉ pleco lớn.
- plain, setup-09 tank: "Khoảng 1 cm cá trên 1 lít nước là mức an toàn": quy tắc thô, không tính đến kích thước, độ thải của từng loài và cách bố trí bể.
- plain, setup-09 tank: "Bảy màu... sinh sản nhanh" nêu như ưu điểm cho người ít chăm: đàn đông nhanh làm tăng tải bể và thêm việc phải xử lý.
- plain, setup-09 tank: "Hạc đỏ/Platy": platy thường được gọi là cá hạc đỉnh, nên tên này dễ làm người đọc nhầm khi đi mua.
- plain, setup-09 tank: "cá chép mini (rasbora)": đây không phải tên gọi quen thuộc của rasbora trong giới chơi cá Việt Nam.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus": ở Việt Nam, tỳ bà thường chỉ nhóm pleco lớn hơn nhiều, nên gộp tên với Otocinclus dễ dẫn đến mua nhầm.
- plain, setup-09 tank: "Thay nước định kỳ: Khoảng 20-30% mỗi tuần": đây là mức tiêu chuẩn chung, không bám theo mong muốn ít thay nước của chủ bể và cũng không nói cách giảm nhu cầu thay nước.
- ours, cycling-01 post: "chỉ thay khoảng 20 đến 30% mỗi tuần": giảm quá mạnh với bể nền dinh dưỡng mới đang nhả amoniac; tuần đầu vẫn nên thay nhiều và thường xuyên.
- ours, cycling-01 post: "nước thay liên tục kéo theo vi khuẩn": vi khuẩn có lợi chủ yếu nằm ở vật liệu lọc và nền, không trôi đi nhiều theo nước thay.
- ours, cycling-01 post: "thay khoảng 20 đến 30% mỗi tuần nếu nước không có mùi lạ": giảm quá mạnh với nền nhiều chất mới đang nhả amoniac, và mùi không phải cách đánh giá; nên dựa vào số đo.
- ours, cycling-01 post: "nước thay liên tục kéo theo vi khuẩn": vi sinh chủ yếu bám ở lọc và nền, không trôi đáng kể theo nước thay.
- ours, cycling-01 post: "cả hai đều về 0 trong vài tuần liên tiếp": yêu cầu chờ dài hơn mức cần thiết; ổn định khoảng một tuần là đủ để thả cá.
- plain, cycling-01 post: "thả 2-3 con ... tép hoặc vài con cá bảy màu" để thử: dùng sinh vật sống thử bể chưa cycle là gây hại, và tép lại rất nhạy với amoniac.
- plain, cycling-01 post: "loại "neon 7 màu" cụ thể": đọc nhầm neon và 7 màu (guppy) thành một loài.
- plain, cycling-01 post: Máy sục mini dự phòng "khi cắt điện": máy chạy điện lưới không hoạt động khi mất điện, phải là loại có pin/tích điện.
- plain, cycling-01 post: "thả 2-3 con cá cảnh chịu đựng tốt (như tép hoặc vài con cá bảy màu)": dùng sinh vật sống để thử bể đang có nền mới nhả amoniac là gây hại cho chúng, và tép rất nhạy, không phải loài chịu đựng tốt.
- plain, cycling-01 post: "Thay 50% nước mỗi ngày... loại bỏ amoniac và vi khuẩn": vi sinh chủ yếu bám ở lọc và nền, nên thay nước không làm mất đáng kể; với nền nhiều chất mới, thay nước nhiều những tuần đầu vẫn có ích.
- plain, cycling-01 post: "loại 'neon 7 màu' cụ thể": người hỏi nói hai loài là neon và cá 7 màu (guppy), hỏi lại như một loài là đọc sai.
- ours, cycling-01 tank: "thả trước vài con bảy màu khỏe để bể có cá mà vẫn an toàn": thả cá khi bể chưa xong chu trình vẫn có rủi ro ngộ độc amoniac/nitrit, và điều này mâu thuẫn với lời khuyên chờ xong chu trình ngay trước đó.
- ours, cycling-01 tank: "thả trước vài con bảy màu khỏe để bể có cá mà vẫn an toàn": bể 1,5 tuần với nền nhiều dưỡng vẫn có thể còn amoniac/nitrit, nên nói "an toàn" là quá lời và mâu thuẫn với lời khuyên chờ xong chu trình.
- plain, cycling-01 tank: "vài giọt nước rửa chén không có chất tẩy mạnh" làm nguồn amoniac: nước rửa chén là chất hoạt động bề mặt, không phải nguồn amoniac đáng tin, và có thể gây hại cho cá và vi sinh. Lời khuyên này sai và không an toàn.
- plain, cycling-01 tank: "vài giọt nước rửa chén không có chất tẩy mạnh" làm nguồn amoniac: nước rửa chén là chất hoạt động bề mặt, không phải nguồn amoniac an toàn, có thể hại vi sinh, cá và cây; ở đây lại không cần vì nền nhiều dưỡng đã nhả amoniac.
- plain, cycling-02 post: "Cá kiếm (platy)": sai tên, ở Việt Nam cá kiếm là swordtail, còn platy thường gọi là cá hột lựu, dễ mua nhầm.
- plain, cycling-02 post: "Neon và cá vàng đều thải nhiều chất bẩn": neon nhỏ và thải ít, chỉ cá vàng mới là loài thải nhiều.
- plain, cycling-02 post: "Mua máy sưởi nếu nuôi cá nhiệt đới" và betta "cần sưởi": đặt thành yêu cầu chung là không sát Việt Nam, vì miền Nam gần như không cần sưởi, chủ yếu chỉ miền Bắc mùa đông mới cần.
- plain, cycling-02 post: "Cá sọc ngựa 18-24°C": dải nhiệt nêu thấp hơn nhiệt độ bể thường gặp ở Việt Nam, dù loài này vẫn sống khỏe ở nhiệt độ cao hơn, nên con số dễ gây hiểu lầm.
- plain, cycling-02 post: "Cá kiếm (platy)": ở Việt Nam cá kiếm là swordtail, không phải platy, nên người mới dễ mua nhầm.
- plain, cycling-02 post: "Neon và cá vàng đều thải nhiều chất bẩn": neon rất nhỏ và thải ít, chỉ cá vàng mới thải nhiều.
- plain, cycling-02 post: "Mua máy sưởi nếu nuôi cá nhiệt đới": ở khí hậu Việt Nam, nhất là miền Nam, thường không cần; đây là khoản chi và rủi ro thừa, trừ mùa đông miền Bắc.
- plain, cycling-02 post: "Chạy bể trước 3-4 tuần (không thả cá)": mâu thuẫn với việc còn 3 con cá vàng trong bể mà không nói rõ cách xử lý.
- plain, cycling-02 tank: "dùng nguồn amoniac như vi sinh/ amoniac tinh khiết": vi sinh is bacteria, not an ammonia source, so this confuses the cycling method.
- plain, cycling-02 tank: "bể đầy ... làm oxy hòa tan thấp": a full tank is not in itself a cause of low oxygen; this is a dubious cause.
- plain, cycling-02 tank: "dùng nguồn amoniac như vi sinh": vi sinh là vi khuẩn, không phải nguồn amoniac để nuôi chu trình.
- plain, cycling-02 tank: "bể đầy" được nêu là nguyên nhân thiếu oxy: bể đầy nước không tự nó làm thiếu oxy, nhất là khi có lọc thác khuấy mặt nước.
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": trân châu ngọc trai lùn ở đây là cây trải nền, không phải sỏi, nên cả mục về nền đã đọc sai tình huống.
- plain, cycling-03 post: "vớt cây lùn ra khỏi nền, rửa sạch cây và nền rồi cho lại vào": lời khuyên dựa trên việc hiểu sai, nhổ và trồng lại thảm cây đang thối thì làm xáo nền và không cứu được cây.
- plain, cycling-03 post: "Nền đá đen cũng dễ vệ sinh hơn trân châu": so sánh hai loại nền trong khi trân châu là cây, không phải vật liệu nền.
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": trân châu ngọc trai lùn ở đây là cây trải nền, không phải sỏi, nên cả phần phân tích nền đều sai.
- plain, cycling-03 post: "các kẽ trân châu dễ đọng xác bã" và "Nền đá đen cũng dễ vệ sinh hơn trân châu": lập luận dựa trên việc hiểu nhầm cây thành sỏi.
- plain, cycling-03 post: "Tỳ bà bướm... có thể ăn cây non": nhóm cá này chủ yếu cạo màng rêu bám, nên đây là cảnh báo thiếu cơ sở.
- ours, cycling-03 tank: "Lật bể làm mất hết vi khuẩn": overstated, since a filter and substrate kept wet would retain much of the bacteria, though the advice not to strip the tank is sound.
- plain, cycling-03 tank: "vi khuẩn bùng phát do dư dinh dưỡng và ánh sáng nhiều": bacterial film is driven by excess organics and a new tank, not by light.
- plain, cycling-03 tank: "chuyển cá sang một thùng nước tạm": an unfiltered, uncycled bucket adds stress and its own ammonia build-up for already weak fish, and no daily water-change warning is given.
- plain, cycling-03 tank: "trồng cây thủy sinh nếu có thể": generic advice that ignores the rotting trân châu already in the tank, which should be removed rather than added to.
- plain, cycling-03 tank: "không nguy hiểm trực tiếp": dismisses the white growth without knowing the tank; here it is rotting the trân châu, and rotting plant matter adds to ammonia.
- plain, cycling-03 tank: "Chỉ nên lật bể làm lại khi... Sau 2-3 tuần xử lý, amoniac/nitrit vẫn không giảm" and when fish are sick: stripping the tank fixes neither persistent ammonia nor disease, and restarts the cycle.
- plain, cycling-03 tank: "Chuyển cá sang một thùng nước tạm có sục khí": offered with no warning that an unfiltered bucket builds ammonia fast and needs frequent water changes.
- ours, cycling-04 post: "không thay theo lịch cố định": it gives this without any routine for after the cycle, so the hobbyist has no long-term water-change plan.
- ours, cycling-04 post: "cần bác sĩ thú y": vets for aquarium fish are rarely a practical option in Vietnam, so this step is not much use.
- ours, cycling-04 post: "không thay theo lịch cố định": chỉ đúng trong giai đoạn chạy bể, nhưng câu trả lời không nói lịch thay nước sau khi hồ đã ổn định.
- ours, cycling-04 post: "cần bác sĩ thú y": lời khuyên khó thực hiện với cá cảnh ở Việt Nam.
- plain, cycling-04 post: "neon, guppy, betta thì khoảng 5–8 con": lumping betta in with schooling fish is misleading, because a betta is usually kept alone or with care in a 36-litre tank.
- plain, cycling-04 post: "neon, guppy, betta thì khoảng 5–8 con": gộp cả betta vào mức 5–8 con là sai, vì betta thường nuôi đơn, nhất là con trống.
- plain, cycling-04 post: Không nhắc men vi sinh hay mượn vật liệu lọc đã chạy, hai cách thực tế nhất để tạo vi sinh cho hồ mới.
- ours, cycling-04 tank: "nếu trên 0,2 ppm thì thay một phần nước": ngưỡng không nêu lý do và không có % thay; cá vừa chết mà có amoniac/nitrit dưới mức này vẫn nên thay nước.
- ours, cycling-04 tank: "Giữ lọc và sục khí chạy liên tục": hiểu như bể đã có sủi, trong khi bể chỉ chạy lọc, nên không chỉ ra việc cần thêm oxy.
- ours, cycling-05 post: "cho ăn dè" while also saying no fish yet: the step is confusing, and it never explains that an empty tank needs an ammonia source to feed the bacteria.
- ours, cycling-05 post: Omits dechlorinating the water before dosing live bacteria, a key step with Vietnamese tap water, so the bacteria may be killed.
- ours, cycling-05 post: "cho ăn dè" ở bước chưa thả cá: gây rối vì hồ chưa có cá để cho ăn, và câu này không giải thích đó là việc cấp nguồn amoniac cho vi sinh.
- plain, cycling-05 post: "Tetra Nitrivec" looks like a doubtful product name in the list of brands.
- plain, cycling-05 post: "Ngâm lũa trước" comes as step 2, though the hobbyist's tank is already filled and running, so the order doesn't match their stage.
- plain, cycling-05 post: "Dùng nước đã để qua đêm" only removes chlorine and may not handle chloramine, though it does also offer a dechlorinator.
- plain, cycling-05 post: "Dùng nước đã để qua đêm": để qua đêm chỉ giúp bay clo, không xử lý được cloramin; câu này chưa nêu rõ giới hạn đó ngay tại bước khử clo.
- plain, cycling-05 post: "Ngâm lũa trước": hồ đã châm đầy nước và đã đặt lũa nên bước này không còn đúng giai đoạn, lại không nói cách xử lý khi lũa đã nằm trong hồ.
- plain, cycling-05 tank: "cá khỏe, chịu được biến động như... cá lia thìa hoặc cá neon": neon khá nhạy với bể mới, không phải cá chịu biến động; lia thìa đực lại đánh nhau nên không hợp gợi ý thả nhóm 3-5 con.
- plain, cycling-05 tank: "chịu được biến động như cá bảy màu, cá lia thìa hoặc cá neon": cá neon khá nhạy với bể mới và biến động nước, không phải loại nên thả đầu tiên.
- ours, cycling-06 post: "bật đèn khoảng 8–12 tiếng mỗi ngày": 12 tiếng là quá dài cho bể lowtech mới set, dễ gây tảo.
- ours, cycling-06 post: "bật đèn khoảng 8–12 tiếng mỗi ngày": 12 hours is long for a low-tech 20 cm cube and invites algae in a new tank.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": vi khuẩn gây đục sống nhờ chất hữu cơ, không nhờ ánh sáng, nên giảm đèn không xử lý được nguyên nhân.
- plain, cycling-06 post: "Thùng xốp ít dinh dưỡng nên nước trong": suy đoán thiếu căn cứ, vì thùng có cá và ít hút cặn thì không hẳn ít dinh dưỡng.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": light does not feed the heterotrophic bacteria behind a bloom, so cutting it to 4-6 hours will not clear this haze.
- plain, cycling-06 post: "Lấy vật liệu lọc... từ thùng xốp": a styrofoam tub kept with only occasional siphoning and top-ups often has no filter media, so this may not apply unless taken from the tub's substrate or another tank.
- ours, cycling-06 tank: "Ngưng cho ăn khoảng 7 ngày" is stated with no caveat: it is longer than most new tanks need and harsh on small or young fish.
- ours, cycling-06 tank: "ammonia phải bằng 0": đúng là mức an toàn, nhưng bể mới chưa xong chu trình thường đo ra trên 0, mà câu trả lời không giải thích điều này.
- plain, cycling-06 tank: "ammonia đạt khoảng 2-4 ppm" gives no warning that this is only safe with no fish in the tank; in an 8 L tank with fish, this dose would be dangerous.
- plain, cycling-06 tank: "Tạo nguồn ammonia... đạt khoảng 2-4 ppm": không nói rõ chỉ làm khi bể chưa có cá; nếu bể đã có cá thì mức này gây độc, và cũng không cần thiết với một ca bùng vi sinh.
- ours, cycling-07 post: "lũa ra nhớt": hồ này chỉ có phân nền và cây cắt cắm, người hỏi không nhắc đến lũa, nên lý do này không khớp với hồ.
- ours, cycling-07 post: "lũa ra nhớt": the hobbyist mentioned no driftwood, so this reason is copied from the guide and does not fit the tank.
- ours, cycling-07 post: "hút sát nền": vacuuming close to fresh aqua soil can stir it up and break down the granules, so it should be done gently above the surface.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": vi sinh chủ yếu bám trên nền và bề mặt, không nằm trong nước, nên thay nước không làm mất đáng kể.
- plain, cycling-07 post: "thay 20-30% nước mỗi 1-2 tuần": quá thưa cho hồ phân nền mới không lọc, vì nền đang nhả nhiều dinh dưỡng và amoni, dễ gây rêu và nước xấu.
- plain, cycling-07 post: "rau muống nước" được xếp cùng cây nổi cho hồ phòng ngủ: gợi ý lạ, không phải cây phổ biến cho hồ thủy sinh nhỏ.
- plain, cycling-07 post: "Thay nước 2-3 ngày một lần thường là không cần thiết": a new tank with aqua soil and no filter is exactly when frequent changes are needed, because the soil leaches ammonia and nutrients.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": beneficial bacteria live on the substrate and surfaces, not mainly in the water, so changes barely remove them.
- plain, cycling-07 post: "thay 20-30% nước mỗi 1-2 tuần": too little for the first weeks on new aqua soil without filtration, and invites algae and ammonia buildup.
- plain, cycling-07 post: "rau muống nước" is listed among floating plants as if a standard choice: it is a poor and confusing suggestion for a small bedroom tank.
- ours, cycling-07 tank: "Bật lọc liên tục từ bây giờ": assumes a filter is already there, while this tank has none, so the step should be to buy and install one.
- ours, cycling-07 tank: "Bật lọc liên tục từ bây giờ": bể này chưa có lọc, nên phải mua và lắp lọc trước; câu này ngầm coi như đã có sẵn.
- plain, cycling-07 tank: Reads "thay cho lọc" as replacing filter cleaning, but the hobbyist means having no filter at all, so the filter-cleaning advice does not apply.
- plain, cycling-07 tank: "Thay nước không thay thế được việc vệ sinh lọc": hiểu sai câu hỏi. Người hỏi không có lọc và muốn thay nước thay cho việc chạy lọc, không phải thay cho việc vệ sinh lọc.
- ours, cycling-08 post: Bỏ qua 3 mặt xi măng: kế hoạch đi thẳng từ đặt bể đến trồng cây, chạy lọc và thả cá mà không xử lý độ kiềm, vôi của xi măng mới, có thể làm pH cao và hại cá.
- ours, cycling-08 post: "Đặt bể ở chỗ có bóng râm một phần": hồ đã nằm trong mái hiên, nên đây là lời khuyên chung, không bám tình huống.
- ours, cycling-08 post: "Đặt bể ở chỗ có bóng râm một phần": the tank is already under the eaves, so this step ignores the stated placement.
- ours, cycling-08 post: Omits the alkalinity and lime risk from the three cement walls: following its steps straight to cycling and fish, with only ammonia and nitrite tests and no pH check, could harm fish if the cement is new.
- plain, cycling-08 post: "bèo tây": loại này lớn nhanh, dễ chiếm hết mặt nước của hồ 40x40 và cần vớt thường xuyên, nên không phải lựa chọn tốt cho hồ nhỏ.
- ours, cycling-08 tank: "khoảng 1 con nhỏ cho mỗi 38 lít nước": a literal 1-fish-per-10-gallon conversion; a 32 L tank would get less than one fish, so it is unusable here.
- ours, cycling-08 tank: "Lọc mạnh cũng chưa chắc đủ" leaves the filter question open: it never assesses the 400 l/h filter and gives no usable rule.
- ours, cycling-08 tank: Các bước bắt đầu bằng "Chỉ thả vài con cá khỏe lúc đầu": khuyên cycle có cá ngay, rủi ro với bể xi măng mới chưa được xử lý vì chưa kiểm soát kiềm/pH.
- ours, cycling-08 tank: "1 con nhỏ cho mỗi 38 lít": con số quy đổi từ 10 gallon, máy móc; bể này khoảng 32 lít nên không thả nổi một con, trái với "vài con".
- ours, cycling-08 tank: "Đo amoniac và nitrit bằng que thử": que thử kém chính xác để bám ngưỡng 0,2 ppm.
- plain, cycling-08 tank: "Thả cá từ từ" is listed as a tip to speed up cycling, but stocking slowly does not speed it up and it muddles the advice to wait before adding fish.
- plain, cycling-08 tank: "amoniac = 0 và nitrit = 0 ... trong 2–3 ngày": không nói phải có nguồn amoniac để nuôi vi sinh; bể trống cũng có thể đo 0 và bị hiểu nhầm là đã xong chu trình.
- plain, cycling-08 tank: "Thả cá từ từ" được xếp vào mẹo đẩy nhanh, lẫn với giai đoạn chờ trước khi thả cá nên hơi mâu thuẫn.
- ours, sick-01 post: "nhiệt độ giữ 18–25°C": unrealistic in Vietnam's heat without a chiller, and needless since zebra danio live fine at normal room temperature up to about 28°C.
- ours, sick-01 post: "nếu vài tuần nữa vẫn có con mới cong người, bệnh đã lan trong đàn": too categorical, because new bent fish could also come from old age or mycobacteriosis. It also never mentions mycobacteriosis, a main alternative that can infect people.
- ours, sick-01 post: "nhiệt độ giữ 18–25°C": hard to hold in Vietnam's heat without a chiller and stated with no practical guidance; zebra danios also tolerate warmer room-temperature water, so this is an impractical target.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này": too absolute, since spinal curvature is common in old zebra danio and a nearly 3-year-old group is already old.
- plain, sick-01 post: "cichlid vằn xanh": brings in a doubtful species reading, then adds cichlid-focused causes that blur the answer for a hobbyist keeping a danio group.
- plain, sick-01 post: "Nhiễm khuẩn mạn tính (Columnaris, Aeromonas...)": presented as a cause of bent bodies, but columnaris is usually an acute skin and gill infection, not a typical cause of a slow bend.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này": spinal curvature is common in old zebra danios, and a nearly 3-year-old group is already near the end of its lifespan, so age is dismissed too firmly.
- plain, sick-01 post: "Columnaris, Aeromonas... Gây tổn thương, cong người": these are usually acute skin, gill or systemic infections, not a typical cause of this slow pattern of one bent fish every few weeks.
- ours, sick-01 tank: "Cho cá nhịn ăn 2–3 ngày... để cá nuốt ít không khí": this swim-bladder advice has little bearing on spinal curvature from chronic infection or parasites, and it could further weaken a thin fish.
- ours, sick-01 tank: "Cho cá nhịn ăn 2–3 ngày... để cá nuốt ít không khí và đỡ tải cho ruột": this swim-bladder advice is carried over and does nothing for a bent spine caused by chronic infection or age.
- plain, sick-01 tank: "Khử trùng: vệ sinh dụng cụ, lọc, và đá nền": with no limits given, disinfecting the filter and substrate of a running tank could destroy the biofilter and cause an ammonia spike.
- plain, sick-01 tank: "Nhiễm virus Nodavirus (VNN)": listed as a common cause, but it is an unlikely explanation for slow, recurring deaths in pet danios over years.
- plain, sick-01 tank: "Khử trùng: vệ sinh dụng cụ, lọc, và đá nền": told with no qualifier, disinfecting the filter and substrate in a running tank can destroy the biofilter and cause an ammonia spike.
- plain, sick-01 tank: "Nhiễm virus Nodavirus (VNN)": listed as a common cause, but it is a stretch for a pet zebra danio tank and adds a cause the hobbyist cannot test or act on.
- ours, sick-02 post: "chỉ châm thêm khi thấy đục": người hỏi nói là thay nước khi đục, không nói chỉ châm thêm, nên đây là đọc sai tình huống.
- ours, sick-02 post: "chỉ châm thêm khi thấy đục": the hobbyist said they change water when it turns cloudy, not that they only top up, so this misreads the situation.
- plain, sick-02 post: "rụng vảy hoặc có đốm trắng" listed as signs of ammonia poisoning: white spots point to ich or another disease, not ammonia.
- plain, sick-02 post: "nước máy ở nhiều nơi dùng chloramin": overstated for Vietnam, where tap water is mainly treated with chlorine.
- ours, sick-02 tank: "chỉ châm thêm": người hỏi không nói vậy; họ thay nước khi vẩn đục, nên đây là chi tiết suy diễn.
- ours, sick-02 tank: "mỗi tháng 30–40%": mức thay này quá thưa cho bể có cá vàng đang chết hằng tuần.
- ours, sick-02 tank: "Đo ... oxy hòa tan": hầu hết người chơi không có dụng cụ đo, và bể đã sục 24/24 nên oxy khó là nguyên nhân chính.
- ours, sick-02 tank: "chỉ châm thêm": states the hobbyist only tops up, which their tank notes do not say.
- ours, sick-02 tank: "Đo ngay... oxy hòa tan": a dissolved-oxygen test is impractical for most home hobbyists and of little use with a filter and aeration running 24/7.
- plain, sick-02 tank: "kiểm tra bằng bút thử điện": bút thử điện không phải cách đáng tin để phát hiện rò điện nhẹ trong nước.
- plain, sick-02 tank: "làm bẩn nước ngầm": dùng từ sai và khó hiểu trong ngữ cảnh bể cá.
- plain, sick-02 tank: "Giảm số lượng cá hoặc tăng dung tích": listed as a basic fix although the tank is sparsely stocked, so it points effort away from the real cause.
- ours, sick-03 post: "giống kiểu bể lâu năm... old tank syndrome": the hobbyist never said how old the tank is or how often they change water, so this is an assumption, though it is hedged.
- plain, sick-03 post: "CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển... khả năng cao là kit đã hết hạn": 12 ppm is low for a CO2 planted tank, and the test reading low agrees with the calculation, so this blames the kit and steers away from fixing CO2.
- plain, sick-03 post: "Otto, pygmy và tầm (nếu là loài nhạy cảm)": misreads "tầm 1-2 tuần" (about 1-2 weeks) as a fish species.
- plain, sick-03 post: "ban đêm tích tụ" CO2 is offered as a stress cause with no evidence that the CO2 runs overnight; the hobbyist's reading points to too little CO2.
- plain, sick-03 post: "CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển": 12 ppm is low for an injected planted tank, and it wrongly suggests the plants have enough CO2.
- plain, sick-03 post: "khả năng cao là kit đã hết hạn, đọc sai bảng màu": blames the test even though the pH/KH reading agrees that CO2 is low, sending the hobbyist away from the real shortfall.
- plain, sick-03 post: "Otto, pygmy và tầm (nếu là loài nhạy cảm)": misreads "tầm 1-2 tuần" (about 1-2 weeks) as a kind of fish.
- ours, sick-03 tank: "TDS nên hạ dần về 120–160": nước nguồn đã 160-200, nên chỉ thay nước máy thì không đạt được; không nói phải pha RO hay nước mưa.
- ours, sick-03 tank: "châm nước có TDS gần với bể": mâu thuẫn với mục tiêu hạ TDS, vì nước gần 360 sẽ không làm TDS giảm.
- ours, sick-03 tank: "đo... sáng sớm để xem oxy và pH có tụt": sáng sớm, sau một đêm tắt CO2, pH thường cao hơn chứ không tụt; riêng oxy mới thấp lúc đó.
- ours, sick-03 tank: "TDS nên hạ dần về 120–160": nước nguồn đã 160-200, nên chỉ thay nước máy thì không đạt được mốc này nếu không pha RO, và tép màu cũng không cần thấp đến vậy.
- ours, sick-03 tank: "châm nước có TDS gần với bể" trong khi lại muốn hạ TDS: hai ý hơi mâu thuẫn và không nói rõ cách pha.
- plain, sick-03 tank: "Nếu bạn cho tôi biết... TDS/GH/KH/pH hiện tại... loại cá đang nuôi": hỏi lại thông số có trong hồ sơ bể; đây là thiếu sót về độ khớp chứ không phải sai kiến thức.
- plain, sick-03 tank: Nêu ví dụ tép Caridina (Crystal, Bee) trong khi bể nuôi tép màu; phần lý giải về độ nhạy GH/KH vì vậy lệch khỏi trường hợp này.
- plain, sick-03 tank: Đặt trọng tâm vào Caridina (Crystal, Bee, Taiwan bee): tép màu của bạn này nhiều khả năng là Neocaridina, chịu GH 8 và TDS cao hơn nhiều, nên phần giải thích dễ làm họ lo sai hướng.
- ours, sick-04 post: "Vết khuyết trên ngọn lá nhiều khả năng do ốc hoặc tép gặm": đoán yếu, vì tình trạng gãy ngang ngọn xuất hiện cùng cú sốc nước, nhiều khả năng do sốc pH hoặc thông số nước; tuy vậy câu này có nói rõ là chưa chắc.
- ours, sick-04 post: "Vết khuyết trên ngọn lá nhiều khả năng do ốc hoặc tép gặm": lá gãy ngang ngọn mà vẫn xanh sau cú sốc nước khó là do gặm, dù câu này có nói rõ là chưa đủ căn cứ.
- plain, sick-04 post: "Ốc vảy (Neritina)... Vết gãy hoặc mòn trên vỏ": hiểu sai vảy ốc, vốn là cây thủy sinh Rotala, thành ốc Neritina nên toàn bộ phần tư vấn về nhóm cây này bị lệch.
- plain, sick-04 post: "Amoniac... là thủ phạm đáng ngờ nhất": tép hoảng loạn ngay khoảng 10 giây sau khi cho vật liệu vào không thể do amoniac từ xác phân hủy; nguyên nhân bám sát hơn là chất nhả ra từ vật liệu.
- plain, sick-04 post: "Tép chết trong vài phút": hobbyist nói tép chạy loạn chỉ sau khoảng 10 giây rồi chết dần, nên câu này diễn đạt lại không chính xác.
- plain, sick-04 post: "Bổ sung... lá bàng khô hoặc gỗ lũa để hạ pH": gần như không có tác dụng đáng kể khi nước có KH cao do đá da voi liên tục hòa tan.
- plain, sick-04 post: "Ốc vảy (Neritina)... Vết gãy hoặc mòn trên vỏ": vảy ốc xanh/đỏ là cây Rotala, không phải ốc; người hỏi tả lá gãy ngang ngọn, nên cả mục này sai đối tượng.
- plain, sick-04 post: "Amoniac là thủ phạm đáng ngờ nhất": tép loạn sau khoảng 10 giây khi vừa cho vật liệu vào là sốc hóa chất hoặc thông số nước; amoniac từ xác và lá rữa chỉ xuất hiện về sau.
- plain, sick-04 post: "Tép chết trong vài phút": người hỏi nói tép chạy loạn sau khoảng 10 giây rồi chết dần, không nói chết trong vài phút.
- ours, sick-04 tank: "có nhiệt độ và pH gần với bể ... để kéo pH về gần mức cũ": self-contradictory, since water matched to the current pH cannot move pH back toward the old level.
- plain, sick-05 post: "bộ test API Freshwater Master... NH3/NH4, NO2, NO3, pH, KH, GH": the API Freshwater Master kit does not include KH/GH tests; those are sold separately.
- plain, sick-05 post: "Vệ sinh lọc" listed among immediate steps: cleaning the filter while the cycle is unstable can further disturb the bacteria, even when using old tank water.
- plain, sick-05 post: "Tảo silic (diatom)" is listed as a cause of the water colour, but diatoms form a film on surfaces and do not explain yellow-brown water.
- plain, sick-05 post: "Vi khuẩn có lợi trong lọc cũng yếu đi" is stated as a direct effect of bottled water without qualification; this is only an indirect effect through low KH and falling pH.
- ours, sick-05 tank: "Lũa chỉ giải thích màu vàng nâu" nói như thể bể có lũa, trong khi người hỏi không hề nhắc đến lũa; đây là giả định chưa xác nhận, dù nhận định về tannin là đúng.
- ours, sick-05 tank: 'Lũa chỉ giải thích màu vàng nâu...' nói như thể bể có lũa, trong khi thông tin bể không ghi có lũa; đây là giả định chưa được xác nhận.
- plain, sick-05 tank: "Tảo silic... làm nước đục màu nâu" sai phần lớn: tảo silic chủ yếu bám trên kính và nền, không phải nguyên nhân điển hình khiến nước ngả màu nâu.
- plain, sick-05 tank: "Nước máy có vấn đề" và "Clo/cloramin chưa khử hoàn toàn" không áp dụng cho bể này vì người nuôi thay bằng nước uống đóng bình, nên hướng nghi ngờ bị sai.
- plain, sick-05 tank: Tập trung vào rủi ro nước máy ('nước máy có vấn đề', 'thay nước bằng nước máy chưa xử lý') trong khi hobbyist dùng nước uống đóng bình, nên bỏ sót nguyên nhân thiếu KH/GH.
- plain, sick-05 tank: 'Thay 30–50% nước' như bước xử lý ngay, trong khi họ đã thay 50% cách ngày; lời khuyên này không thay đổi được gì và vẫn không nói đổi nguồn nước.
- ours, sick-06 post: "nhiệt độ bể mới trong khoảng 22–28°C": mức 22°C quá thấp cho cá rồng đang bỏ ăn; người nuôi ở Việt Nam thường giữ khoảng 27–30°C.
- ours, sick-06 post: "nhiệt độ bể mới trong khoảng 22–28°C": the low end is too cold for arowana, which are usually kept around 26–30°C; a keeper could accept a cool tank that further suppresses appetite.
- plain, sick-06 post: "Giảm lượng mồi cho cá mồi": muddled and off target, because the hobbyist's problem is uneaten live feeders; it never says to net them out so they stop stressing the arowana and adding bioload.
- ours, sick-06 tank: "lâu hơn mức cá mới hay ăn lại sau 2–3 ngày": cá rồng chuyển bể thường có thể bỏ ăn lâu hơn nhiều, nên mốc này không có cơ sở vững và dễ gây lo quá mức.
- plain, sick-06 tank: "đặt cây thủy sinh, đá hoặc ống để cá có chỗ ẩn nấp": cá rồng là cá tầng mặt cỡ lớn, cần khoảng bơi rộng; vật trang trí ẩn nấp không phải cách xử lý thực tế và có thể làm cá va chạm.
- plain, sick-06 tank: "cho ăn vào buổi tối khi đèn tắt": cá rồng săn mồi trên mặt nước chủ yếu bằng mắt; cho ăn trong tối làm khó quan sát và vớt mồi thừa, nên đây là mẹo đáng ngờ.
- ours, sick-07 post: "sau khi xới sỏi": the hobbyist threw the gravel out rather than stirring it, so the answer misses the lost beneficial bacteria and the resulting ammonia risk.
- ours, sick-07 post: "không dùng muối ăn": stated flatly without addressing the hobbyist's muối hột, which is usable if clean and additive-free, so it leaves them unsure about what they already did.
- ours, sick-07 post: "sau khi xới sỏi": bạn này đã vứt hẳn sỏi chứ không xới, nên bỏ sót nguy cơ mất vi sinh và bể chu trình lại.
- ours, sick-07 post: "không dùng muối ăn": cấm quá mức; muối hột không phụ gia mà người hỏi đang dùng vẫn dùng được.
- ours, sick-07 post: "ngừng muối và hỏi thêm" khi nghi columnaris: không cho hướng xử lý cụ thể cho bệnh tiến triển nhanh, trong khi ngừng muối cũng không phải điều bắt buộc với cá có vảy.
- plain, sick-07 tank: "Cá bị nấm sau khi lật bể thường là hệ quả của nước xấu": too sure of one cause; it ignores handling injuries from the flip, the usual opening for water mould.
- plain, sick-07 tank: "Không dùng muối cho bể có cây thủy sinh, cá trơn như cá trê, hoặc tôm, ốc": too absolute, since low doses and short use are often tolerated by plants and many fish, though caution is fair.
- ours, sick-08 post: "ngâm túi cá 4–5 tiếng": read literally, this leaves the fish in the bag far too long, so ammonia and oxygen problems build up. Floating needs only 15–30 minutes, followed by slow drip acclimation in a bucket.
- ours, sick-08 post: "cá còn lại vẫn bơi lờ đờ": all 3 otto have already died, so this does not fit unless it means the neon.
- ours, sick-08 post: "không phải lỗi chung của cả bể": neon surviving does not rule out a water problem, because otto are more sensitive. The answer does partly correct this by asking for tests.
- ours, sick-08 post: "Neon vẫn bình thường nên không phải lỗi chung của cả bể": overconfident; otto are more sensitive than neon, so healthy neon do not rule out a water problem.
- ours, sick-08 post: "ngâm túi cá 4–5 tiếng": too long if read literally as keeping fish in a sealed bag; oxygen falls and waste builds up, and it should be a shorter float followed by slow drip acclimation.
- ours, sick-08 post: "nếu cá còn lại vẫn bơi lờ đờ": all 3 otto are already dead, so the wording fits the situation poorly unless it means the neon.
- plain, sick-08 post: "Thiếu oxy vào ban đêm (khả năng cao nhất)": ranked most likely with no evidence of low oxygen in this tank. Weak fish and poor acclimation fit at least as well.
- plain, sick-08 post: "Chết đột ngột, nằm im là dấu hiệu điển hình của độc tố": an overclaim, since this sign is not specific and fits many causes.
- plain, sick-08 post: "Thiếu oxy vào ban đêm (khả năng cao nhất)": ranked most likely without evidence; a night-time oxygen crash is a weak lead for fish that die within one night of being added while the neon in the same water stay normal.
- plain, sick-08 post: "Chết đột ngột, nằm im là dấu hiệu điển hình của độc tố": overstated; lying still and dead is not specific to toxins and also fits shock or weak new fish.
- ours, sick-08 tank: "cá otto bắt tự nhiên, chưa quen thức ăn viên": not eating pellets causes slow starvation over days or weeks, so it cannot explain all the fish dying overnight, especially in a tank with algae.
- ours, sick-08 tank: "Với đàn còn lại" and "theo dõi những con còn lại": the hobbyist said all the otto died, so this advice has no fish to apply to.
- ours, sick-08 tank: "chưa quen thức ăn viên" được nêu như nguyên nhân hàng đầu: chưa quen thức ăn không làm cả đàn chết sau một đêm.
- ours, sick-08 tank: "Với đàn còn lại... giữ tảo cho cá gặm": otto đã chết hết, nên lời khuyên và phần theo dõi 'những con còn lại' không khớp tình huống.
- plain, sick-08 tank: "Nuôi một hai con đơn lẻ dễ bị stress": hobbyist thả 3 con, và thiếu đàn không giải thích được cái chết sau một đêm.
- ours, sick-09 post: "khả năng cao nhất là bệnh lây từ cá koi": overweights contagious disease and treats water quality as secondary in a 30 cm cold tank; KHV is also less typical in very cold water.
- ours, sick-09 post: "Khi trời ấm nên đào sâu thêm": gives no practical option, and the filter question is not answered at all.
- ours, sick-09 post: "Kiểm tra oxy... nếu mượn được bộ test": the 5 mg/L trigger is unusable for someone who said they have no oxygen meter, and no way of judging oxygen without one is given beyond watching for fish gasping.
- plain, sick-09 post: "cho thấy cá đang đói": koi and carp naturally pick at water lilies, even when well fed.
- plain, sick-09 post: "6–7 con... mật độ có thể đã vượt mức": misreads the 6-7 dead as the stock count, and 1,350 L is not obviously overstocked by that number.
- plain, sick-09 post: "Thay 10–20% nước" when ammonia/nitrite are high: this is rather small if readings are truly high.
- plain, sick-09 post: "cho thấy cá đang đói hoặc thiếu thức ăn tự nhiên": koi and carp pick at water lilies by habit, so this does not show hunger.
- plain, sick-09 post: "Với 6–7 con... mật độ có thể đã vượt mức": 6-7 is the number that died, not the stock, and that many fish in about 1,350 L with a filter is not clearly overstocked, so the cause is overweighted.
- ours, sick-09 tank: "kê bể lên đệm cách nhiệt": tip for a small glass tank, not practical for a 3 m outdoor koi pond with a stone floor.
- ours, sick-09 tank: Excerpt "sưởi khoảng 1 W cho mỗi lít": would mean about 1.3 kW for this roughly 1,350 L outdoor pond; impractical and unnecessary for koi.
- ours, sick-09 tank: "kê bể lên đệm cách nhiệt": không hợp với bể ngoài trời lớn, đáy lát đá; đây là mẹo cho bể kính.
- ours, sick-09 tank: Trích dẫn "sưởi khoảng 1 W cho mỗi lít": với bể khoảng 1.350 lít ngoài trời thì không thực tế cho koi.
- plain, sick-09 tank: "Ổn định nhiệt độ... 24–26°C cho cá nhiệt đới bằng heater": targets tropical fish; koi and carp tolerate cold and an outdoor pond this size is not heated this way.
- plain, sick-09 tank: "betta, neon, guppy, tetra... rất nhạy với lạnh": irrelevant to this koi and carp pond.
- plain, sick-09 tank: "Ổn định nhiệt độ... 24–26°C cho cá nhiệt đới bằng heater": sai đối tượng, koi và cá chép là cá nước lạnh, bể ngoài trời cỡ này không cần và khó sưởi như vậy.
- plain, sick-09 tank: "Vi khuẩn lọc chậm lại dưới ~20°C... gần như ngừng": nói quá, ở mức dưới 20°C vi sinh chậm đi nhưng chưa gần như ngừng.
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": bảy màu là cá hiền, không phải thủ phạm săn mồi; câu này làm lệch chẩn đoán.
- plain, stocking-01 post: "nuôi cá 7 màu: nên nuôi cùng cá cỡ lớn... bể tối thiểu khoảng 200 lít": sai hẳn, bảy màu nhỏ dễ bị cá lớn ăn và nuôi tốt trong bể nhỏ hơn nhiều.
- plain, stocking-01 post: "Bống và dọn bể: chỉ nên nuôi chung với cá to": khái quát quá mức, không rõ loài và vô lý khi vừa nói bống ăn cá nhỏ là vấn đề của nhóm bảy màu.
- plain, stocking-01 post: "Bống không phải 'công nhân vệ sinh'... là cá ăn thịt nhỏ": đúng về ý không ăn phân, nhưng bống có nhiều loài nên nói gộp là quá tay.
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": guppy are peaceful, not aggressive, and do not attack tankmates.
- plain, stocking-01 post: "Nếu muốn nuôi cá 7 màu: nên nuôi cùng cá cỡ lớn... bể tối thiểu khoảng 200 lít... tránh thả cá nhỏ": backwards, since guppies are small fish that large fish eat, and they do not need 200 L.
- plain, stocking-01 post: "Bống và dọn bể: chỉ nên nuôi chung với cá to": an invented, overly broad rule that does not fit a small community tank.
- plain, stocking-01 tank: "cá rô, cá đầu bạc, cichlid, cá lia thia, hoặc cá lóc con" là thủ phạm: liệt kê những loài không có trong bể, trong khi bỏ qua cá vàng đang nuôi chung
- plain, stocking-01 tank: "cá bảy màu trưởng thành, nhất là con đực" ăn cá bột: nói con đực ăn nhiều hơn là không có cơ sở
- plain, stocking-01 tank: "cá chùy (cá tỳ bà, cá chuột)": gộp tên gọi lộn xộn, "cá chùy" không phải tên thông dụng của cá tỳ bà
- plain, stocking-01 tank: "cá chùy (cá tỳ bà, cá chuột)": lumps cá tỳ bà and cá chuột under an odd name that is not normal hobby usage in Vietnam.
- ours, stocking-02 post: "khoảng 140 lít, nên 40 neon vẫn sát giới hạn": theo chính phép tính này, tổng tải khoảng 110 lít, còn cách xa mức 140 lít, nên kết luận không khớp với con số đưa ra.
- plain, stocking-02 post: "Nếu 'mún' của bạn là loài cá ăn thịt hoặc có tính hung dữ (ví dụ cá rô, cá betta đực...)": mún là tên quen thuộc của cá platy, loài hiền, nên answer không nhận ra loài và không trả lời dứt khoát câu hỏi sống chung.
- plain, stocking-02 post: "Nếu 'mún' của bạn là loài cá ăn thịt hoặc có tính hung dữ (ví dụ cá rô, cá betta đực...)": mún là tên quen thuộc của cá platy, một loài hiền, nên phần này không trả lời được câu hỏi và gây lo không cần thiết.
- ours, stocking-02 tank: "Đo nitrat ... trước khi thả thêm": a tank running only 1 week may not have cycled, so ammonia and nitrite are the key checks; nitrate alone can miss the danger.
- ours, stocking-02 tank: "Giữ nước mềm, pH không quá 7 và nhiệt độ 21–25°C": this conflicts with platy, which prefer harder water, and 21–25°C is hard to hold in Vietnam's heat without a chiller.
- ours, stocking-02 tank: "chưa tìm thấy trang loài nào tên mún": it already calls the fish platy in its first sentence, then says it cannot identify mún, which is contradictory and leaves the compatibility question unanswered.
- ours, stocking-02 tank: "đo nitrat": relies on nitrate to judge stocking and never asks for ammonia/nitrite, the key tests for a 1-week-old tank.
- ours, stocking-02 tank: "Kiểm tra bể đã chạy ổn định": does not tell the hobbyist that their tank has run only 1 week and is probably uncycled.
- ours, stocking-02 tank: "mình chưa tìm thấy trang loài nào tên mún": contradicts its own use of 'platy' for the same fish and leaves platy-neon compatibility unanswered.
- ours, stocking-02 tank: "pH không quá 7 và nhiệt độ 21–25°C": the pH limit is stricter than its own card (4–7.5), and 21–25°C is hard to hold in Vietnam's heat without a chiller; no practical guidance is given.
- plain, stocking-02 tank: "thả thêm 40 con neon thường vẫn được" at 100 lít: this ignores the 10 existing fish and the 1-week-old tank, so it leans towards an overstock and a possible ammonia spike.
- plain, stocking-02 tank: "cá lia thia lùn" listed as a good neon tankmate: bettas can be territorial and this is a loose, unreliable recommendation.
- plain, stocking-02 tank: "thả thêm 40 con neon thường vẫn được": too permissive for a 96 L tank running only 1 week, which is not yet cycled and already holds 10 fish.
- plain, stocking-02 tank: "mình chưa chắc bạn đang nói loài nào": mún is the common Vietnamese name for platy, so the compatibility question goes unanswered.
- ours, stocking-03 post: "tetra mõm đỏ... đẹp và dễ nuôi": rummy nose is active, needs a real school and is sensitive to unstable water, so it is a poor fit for a beginner's 15 L tank.
- ours, stocking-03 post: "Trong 2–3 tuần đầu... thả cá từ từ": this implies stocking during the unstable period and never tells a beginner to cycle the tank first.
- ours, stocking-03 post: "tetra mõm đỏ" được gợi ý là lựa chọn đẹp, dễ nuôi: cá này dài khoảng 5 cm, bơi nhiều, sống theo đàn lớn và khá nhạy nước, không hợp bể 15 lít mới chạy với người mới.
- ours, stocking-03 post: "neon vua... dễ nuôi hơn" cho bể 15 lít: cá đàn cần số lượng nhưng câu trả lời không nêu số con, dễ khiến người mới thả quá dày.
- plain, stocking-03 post: "Tránh cá đàn lớn như neon, cá chuột, cá lia thia": lia thia is not a schooling fish; it is a territorial fighting fish closely related to betta.
- plain, stocking-03 post: "Tránh cá đàn lớn như neon, cá chuột, cá lia thia": lia thia không phải cá đàn; nó là cá chọi, nên xếp chung nhóm này là sai, dù khuyên tránh nuôi chung trong bể nhỏ vẫn không hại.
- ours, stocking-03 tank: "cá tetra mõm đỏ" được gợi ý cho bể 15 lít: loài bơi nhiều, sống theo đàn, nhạy nước, không hợp bể nhỏ thế này và người mới.
- ours, stocking-03 tank: "ít nhất 1 đến 2 tuần" để vi sinh bám: thường chưa đủ để chu trình nitơ ổn định, dễ khiến người mới thả cá sớm.
- ours, stocking-03 tank: "khoảng 6 con trở lên" cá đàn trong khoảng 15 lít mà không kèm cảnh báo: khá sát giới hạn với bể nhỏ, thả từng đợt và theo dõi nước là cần thiết.
- ours, stocking-03 tank: "cá tetra mõm đỏ": cá này lớn hơn, bơi khỏe và nhạy nước, không hợp bể 35 cm khoảng 15 lít mới setup.
- ours, stocking-03 tank: "ít nhất 1 đến 2 tuần" chạy lọc không có nguồn amoniac: thường chưa đủ để bể vào chu trình, dễ tạo cảm giác an toàn giả cho người mới.
- ours, stocking-03 tank: "khoảng một phần nước mỗi tuần": không nêu phần trăm cụ thể nên người mới không biết thay bao nhiêu.
- plain, stocking-03 tank: "cá thái lan (cá dĩa nhỏ hiền)": nhầm lẫn tên gọi; cá dĩa là loài lớn, khó nuôi, không phải cá dễ cho người mới.
- plain, stocking-03 tank: "Cá vàng: cần bể lớn, nước lạnh": cá vàng không cần nước lạnh thật sự, chỉ không ưa nóng kéo dài.
- plain, stocking-03 tank: "1 con betta + vài con cá nhỏ hiền" và cá chuột, molly trong danh sách chung: không lọc theo bể 15 lít, molly và cá chuột không hợp bể này.
- plain, stocking-03 tank: "cá thái lan (cá dĩa nhỏ hiền)": sai định danh, cá dĩa là loài lớn, khó nuôi, không phải cá cho người mới hay bể nhỏ.
- plain, stocking-03 tank: "Cá nhỏ cần khoảng 2–3 lít nước mỗi con": quy tắc thô và dễ khiến nuôi quá đông; bể 15 lít có thể bị hiểu là nuôi được 5–7 con cá bất kỳ, kể cả molly hay cory.
- plain, stocking-03 tank: Gợi ý molly và cá chuột cho người mới mà không lưu ý kích thước, trong khi các loài này không hợp với bể khoảng 15 lít của họ.
- ours, stocking-04 post: Nêu Stiphodon ornatus 'hợp với cá bảy màu' dựa trên suy đoán về loài, trong khi chính bảy màu là loài đã chết trong bể này, nên gợi ý này không giúp được gì
- ours, stocking-04 post: "Stiphodon ornatus... có người bán tên gold fin" with the card's "dài 7 cm; bể từ 80 cm": the size and tank figures look too large for this small goby, and the closest guess may be the wrong species.
- ours, stocking-04 post: It never clearly answers which fish can live with the goby, beyond the guide's note that this guessed species suits guppies.
- plain, stocking-04 post: 'Bể không cần cạo rêu, không thay nước, không cho ăn': người hỏi không nói là không thay nước, và chỉ nói bống không cần cho ăn
- plain, stocking-04 post: Khuyên 'tránh cá nhỏ quá' vì dễ bị bống ăn nhưng lại gợi ý neon, lòng tong mà chưa biết bống loài gì; 'cá thái lan nhỏ' cũng là tên mơ hồ
- plain, stocking-04 post: "khả năng cao cá chết không phải do bống": said without knowing the species. A golden sucker-type algae eater sold under such a name can harass fish and rasp their slime coat, so the fish may well be the cause.
- plain, stocking-04 post: "không thay nước": the hobbyist never said this; the assumption is used as the basis for the top cause.
- plain, stocking-04 post: "cá bạc má nhỏ hoặc cá thái lan nhỏ": vague or wrong tankmate names. Bạc má is usually a marine fish, and 'cá thái lan' does not identify a species.
- plain, stocking-04 tank: "cá kiếm (platy)": cá kiếm là swordtail, không phải platy (cá hạc đỉnh), và mục sau lại liệt kê "cá đuôi kiếm (swordtail)" như một loài khác.
- plain, stocking-04 tank: "ốc hương" được gợi ý cho bể nước ngọt: ốc hương là ốc biển, không sống được trong bể này.
- plain, stocking-04 tank: Xếp "cá dĩa" và "cá đá (betta)" vào danh sách nuôi chung với bảy màu, hồng kim: cá dĩa cần nước ấm và ổn định hơn, còn betta dễ cắn bảy màu, trái với chính lưu ý của answer.
- plain, stocking-04 tank: Gợi ý bảy màu và cá kiếm: đây chính là những loài đã chết dần trong bể, mà answer không nhận ra.
- plain, stocking-04 tank: "cá kiếm (platy)" is a wrong name: cá kiếm is the swordtail, which it then lists separately as "cá đuôi kiếm".
- plain, stocking-04 tank: "cá hồng kim (neon tetra)" is a wrong name: hồng kim is a red platy/swordtail type, not neon tetra.
- plain, stocking-04 tank: It lists bảy màu and kiếm as the fish to keep, though these same fish already died in this tank, and it does not address that.
- plain, stocking-04 tank: It lists cá dĩa and betta in one community group; discus needs hotter, cleaner water and betta can nip guppies, so this is poor compatibility advice.
- ours, stocking-05 post: "cá chép (cùng họ với cá koi...)": understated and awkward, since koi are simply ornamental common carp, not just a relative; the 'cùng họ' framing is a weak basis for applying the koi data.
- ours, stocking-05 post: "làm theo nhãn của thuốc": names no medicine for open wounds, so it is not usable treatment advice.
- ours, stocking-05 post: The attached card lists koi as 'peaceful', which sits uneasily with the claim that carp attack goldfish and is left unexplained.
- ours, stocking-05 post: "cùng họ với cá koi": understates the link, since koi are ornamental carp and much closer than merely the same family.
- ours, stocking-05 post: The card lists koi as "peaceful" without explanation, which sits awkwardly with the advice and the attacks the hobbyist saw.
- plain, stocking-05 post: "Hai loài có nhu cầu môi trường và thức ăn hơi khác nhau, khó chăm chung": weak reason, since both are hardy omnivorous cyprinids with very similar needs; the real issues are size and vigour.
- plain, stocking-05 post: "Cá chép thường hung hăng": overgeneralised, since carp are not typically aggressive by nature, though it matches what this hobbyist is seeing.
- plain, stocking-05 post: "Cá chép thường hung hăng": overgeneralised, since carp are usually not aggressive by nature; harm more often comes from size difference, food competition or spawning chases.
- ours, stocking-05 tank: "cá koi (cá chép Nhật)": the hobbyist said cá chép, not koi; the answer swaps in koi without basis.
- ours, stocking-05 tank: "nguyên nhân khả dĩ nhất là kích thước chênh lệch quá lớn": states size difference as the likely cause of death without knowing the fish sizes; stress, injury or water problems after adding a new fish were not considered.
- ours, stocking-05 tank: "nguyên nhân khả dĩ nhất là kích thước chênh lệch quá lớn": kết luận khi chưa biết kích thước hai con; cái chết còn có thể do stress, vết thương, chất lượng nước hoặc bệnh từ cá mới thả.
- ours, stocking-05 tank: "con koi thả vào bể cá vàng có thể đang săn cá nhỏ hơn": tự coi cá chép là koi và suy đoán hành vi săn mồi dù hobbyist không nói đó là koi.
- plain, stocking-05 tank: "Cho ăn đầy đủ để cá chép bớt tranh ăn và hung hăng hơn": extra feeding does little for this aggression and can foul the water in an already crowded tank; the sentence is also ambiguous.
- plain, stocking-05 tank: "Cho ăn đầy đủ để cá chép bớt tranh ăn và hung hăng hơn": cho ăn thêm khó giảm việc đuổi cắn và dễ làm bẩn nước, nên không phải cách xử lý đáng tin.
- ours, stocking-06 post: "Bể mới chưa cần thay nước hàng tuần đều đặn; thường thay khoảng 20 đến 30% mỗi tuần": tự mâu thuẫn, và bể mới đang chạy vi sinh, có mùi hôi lại càng cần thay đều.
- ours, stocking-06 post: "Không thay hết một lần vì sẽ mất vi sinh": vi sinh chủ yếu bám ở lọc và nền, không nằm trong nước; lý do này không chính xác.
- ours, stocking-06 post: Không sửa hiểu lầm "trứng": mún và kiếm đẻ con, không đẻ trứng.
- ours, stocking-06 post: "Bể mới chưa cần thay nước hàng tuần đều đặn; thường thay khoảng 20 đến 30% mỗi tuần là đủ": tự mâu thuẫn, trong khi bể mới có cá và đang hôi lại càng cần thay đều.
- plain, stocking-06 post: "Nước có mùi tanh nhẹ là bình thường": dễ khiến người nuôi chủ quan, nhất là với bể mới đang có mùi; nước bể khỏe thường chỉ có mùi đất nhẹ.
- ours, stocking-06 tank: "khoảng ngày 18 đến 25 của thai kỳ": this is a guppy timing borrowed for molly, whose gestation usually runs longer, and few keepers can count the days anyway.
- ours, stocking-06 tank: "Bể chính thì thay theo lượng nước và độ sạch hiện tại của bạn": this dodges the weekly water-change question and is poor guidance for a newly set tank with smelly water.
- ours, stocking-06 tank: "Bể chính thì thay theo lượng nước và độ sạch hiện tại của bạn": no real answer on weekly changes, and it effectively endorses the current routine in a new tank whose water already smells.
- ours, stocking-06 tank: "khoảng ngày 18 đến 25 của thai kỳ": a guppy timeline carried over to mún, which the hobbyist can rarely track and which is not established for this species.
- plain, stocking-06 tank: "đưa mẹ về bể chính hoặc để trong lồng đẻ": leaving the mother in the breeder box with the fry risks her eating them, unless the box has a fry separator.
- plain, stocking-06 tank: "Thường khi thấy vậy thì còn khoảng 1–2 ngày": this is overly precise, as a dark gravid spot and swollen belly can precede birth by much longer.
- ours, stocking-07 post: "cá chạch sóc đuôi đỏ... 15–21°C": an unlikely match for a small fish commonly kept with neon, and the warning that the two can hardly live together rests on this guess.
- ours, stocking-07 post: "bể 76 lít chỉ nuôi neon thì khoảng 10–15 con là vừa": far too conservative for a 3 cm schooling fish in a 60 cm tank.
- ours, stocking-07 post: "Gần nhất trong cẩm nang là cá chạch sóc đuôi đỏ": ghép từ khớp tên, rất khó là loài người hỏi định thả chung với neon; kết luận khó sống chung và lời dặn theo dõi nhiệt độ cuối bài vì thế dễ gây hoang mang
- ours, stocking-07 post: "chỉ nuôi neon thì khoảng 10–15 con là vừa": quá dè dặt với bể khoảng 76 lít có lọc tốt, nhưng không gây hại cho cá
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": Corydoras is usually called cá chuột in Vietnam, so this identification is doubtful, although the answer does ask for the exact name if it means another fish.
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": khẳng định sai tên, ở Việt Nam Corydoras thường gọi là cá chuột, không phải sóc; dù cuối bài có dặn báo lại nếu là loài khác, số 6-8 con và lời khuyên nền cát đều dựa trên giả định này
- ours, stocking-07 tank: "chạch sóc đuôi đỏ" and "killifish sọc đỏ" are unlikely readings of "sóc đỏ", so the 15–21°C incompatibility warning probably concerns the wrong fish.
- plain, stocking-07 tank: "Cá sóc (Corydoras)": Vietnamese hobbyists usually call Corydoras "cá chuột", so the stocking advice rests on a wrong identification.
- plain, stocking-07 tank: "khoảng 10 con cho mỗi 20 lít": this rule is overly dense and has no stated basis.
- plain, stocking-07 tank: "bể khoảng 60 lít": this appears to confuse the 60 cm length with volume; 60×35×40 cm is about 84 L gross.
- plain, stocking-07 tank: "Tôm đỏ": shrimp is an off-target guess, since the hobbyist asked about a stocking number alongside neon.
- plain, stocking-07 tank: "Cá sóc (Corydoras)": Corydoras is called cá chuột in Vietnam, and "cá sóc" usually means something else, so the stocking figure of 6-8 may be for the wrong fish.
- plain, stocking-07 tank: "nên thả thưa hơn nếu bể có nhiều cây thủy sinh và lọc tốt": the logic is backwards, since dense plants and good filtration allow more stock, not less.
- ours, stocking-08 post: "Bể nhỏ mất nước nhanh": muddled claim; the real problem is that little water dilutes waste poorly, not water loss, and the sentence does not explain that clearly.
- ours, stocking-08 post: "Thay khoảng 20-30% nước mỗi tuần": too little for a week-old, overstocked 4 L tank that may have no filter, so ammonia can still build up.
- ours, stocking-08 post: "Bể nhỏ mất nước nhanh": wrong or confusing wording; the issue is low water volume, not water loss.
- ours, stocking-08 post: "Thay khoảng 20-30% nước mỗi tuần": light for an overstocked one-week-old 4 L tank that is probably still cycling, and it gives no filter to support it.
- plain, stocking-08 post: "(neon, endler, ember...)" as 3-4 fish for 4 L: neon and ember are schooling fish and a 4 L tank is too small for them to be kept well long term.
- plain, stocking-08 post: "máy sưởi mini có điều nhiệt": generally unnecessary in much of Vietnam; heat is the more common concern, and a heater in 4 L carries its own overheating risk.
- plain, stocking-08 post: "máy sưởi mini có điều nhiệt": generally unnecessary in much of Vietnam's climate and risky to fit in a 4 L tank, so it is a poor default step.
- plain, stocking-08 post: "3-4 con nếu là loài nhỏ (neon, endler, ember...)": neon are schooling fish that need more room, so 3-4 in 4 L is still unsuitable.
- plain, stocking-08 tank: "cá bảy màu" listed as a schooling fish needing many of its kind: guppies are livebearers and not true schooling fish.
- plain, stocking-08 tank: "7-8 con nhỏ có thể ổn trong bể 40-60 lít" and the whole conclusion assume a tank about 10x larger than the actual 4 L, so the reassurance does not apply.
- plain, stocking-08 tank: "Cá đàn (neon, tetra, cá bảy màu)": cá bảy màu không phải cá đàn đúng nghĩa như neon/tetra.
- plain, stocking-08 tank: "1 lít nước cho 1 cm cá" kèm kết luận chỉ xét bể 40-60 lít và dưới 30 lít: không đề cập bể 4 lít nên người đọc không nhận được cảnh báo rõ về mức quá tải nghiêm trọng.
- ours, stocking-09 post: "Bể 80 cm cũng chưa đủ cho cá ông tiên": quá cứng nhắc, vì bể 80×35×45 cm (khoảng 126 lít) vẫn nuôi được một cặp ông tiên, dù rộng hơn thì tốt hơn.
- ours, stocking-09 post: "Bể 80 cm cũng chưa đủ cho cá ông tiên": quá cứng nhắc, bể 80×35×45 cm khoảng 126 lít vẫn nuôi được 2 con ông tiên, dù chật hơn khi cá ghép cặp và lớn hẳn.
- plain, stocking-09 post: "Có thể nuôi chung được": kết luận quá lạc quan, vì ông tiên trưởng thành có thể nuốt neon khoảng 3 cm và nguy cơ này còn nguyên về lâu dài.
- plain, stocking-09 post: "cho ăn đầy đủ để giảm rủi ro": cho ăn no không ngăn được ông tiên lớn săn neon, nhất là vào ban đêm.
- plain, stocking-09 post: "bổ sung thêm neon để chia đều sự chú ý": thêm neon không giải quyết được việc bị rượt đuổi, chỉ tăng số cá có nguy cơ bị ăn.
- plain, stocking-09 post: "trạch, mơ": tên cây lạ, người chơi khó nhận ra và khó tìm mua đúng loại.
- plain, stocking-09 post: "bổ sung thêm neon để chia đều sự chú ý": thêm neon không giải quyết được việc ông tiên rượt hoặc ăn neon, chỉ thêm mồi.
- plain, stocking-09 post: "trạch, mơ": tên cây thủy sinh không rõ ràng, người chơi khó biết để mua.
- ours, stocking-09 tank: "Bể 80 cm của bạn cũng chưa đủ": too strict as a flat verdict. A tank of about 126 L and 45 cm high can hold a pair of angelfish, though it is not generous.
- ours, stocking-09 tank: "Bể 80 cm của bạn cũng chưa đủ" is too strict: this tank is about 126 litres gross and 45 cm tall, which can suit 2 angelfish.
- ours, stocking-09 tank: "Không nên nuôi chung" treats a real predation risk as a flat ban, although this mix often works when the angels are young, well fed and the tank has dense cover.
- ours, stocking-09 tank: "Mức đầy bể: 84%" looks falsely precise, and its "Vừa phải" rating sits awkwardly beside the claim that the tank is not big enough.
- plain, stocking-09 tank: "Nếu bể nhỏ hơn 80 lít thì nên cân nhắc lại": contradicts its own stated minimum of about 100 L.
- plain, stocking-09 tank: "Nếu bể nhỏ hơn 80 lít thì nên cân nhắc lại" conflicts with its own stated minimum of about 100 litres, leaving 80–100 litres unclear.
- ours, stocking-10 post: "Không nên nuôi chung: cá betta hung dữ": overstated as a flat no. One betta with 12 neons in about 65 L with plants often works, depending on the individual fish.
- ours, stocking-10 post: "cắn vây cá neon, làm neon luôn stress": presented as the expected outcome, when it is only a risk. It also omits the risk of neons nipping a long-finned betta.
- ours, stocking-10 post: "Không nên nuôi chung... thường được nuôi riêng hoặc trong bể chỉ có một loài": too absolute, since one betta with a neon school in a planted tank of about 65 L is a common setup that often works, though it carries some risk.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon": does not fit, because the neons are already in the tank. Letting a betta claim territory first also makes it more aggressive.
- plain, stocking-10 post: "thường dùng máy sưởi là hợp lý": a heater is usually unnecessary for most of the year in much of Vietnam, and heat is often the bigger problem.
- plain, stocking-10 post: "trâm bầu": listed as an aquarium plant, but it is not a recognised aquatic plant for hiding cover.
- plain, stocking-10 post: "cá đá/tiger barb": a confusing name for tiger barb, and the list of fish to avoid is partly muddled.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon, hoặc thả cả hai cùng lúc": the neons are already in the tank, and a betta is normally added last so it does not claim the tank as territory.
- plain, stocking-10 post: "thường dùng máy sưởi là hợp lý": a heater is usually unnecessary for much of the year in southern Vietnam; the advice ignores the local climate.
- plain, stocking-10 post: "cá đuôi bảng, cá đá/tiger barb": confusing fish names; "cá đá" normally suggests fighting fish, not tiger barb.
- ours, stocking-10 tank: "thường phải nuôi riêng hoặc bể chỉ một loài": overstated, since a single betta sometimes lives with small peaceful fish in a planted tank of about 65 L, though the cautious advice is still safe.
- plain, stocking-10 tank: "đặc biệt nếu bể đang có một con betta đực" / "Con betta hiện tại là đực hay cái?": assumes a betta already in the tank, but the tank holds only 12 neon tetras.
- plain, stocking-10 tank: "cá tế bào (cá neon, cá rasbora)": "cá tế bào" is not a real hobby term for tetras, so it reads as a garbled translation.
- plain, stocking-10 tank: "không hợp với cá có màu sắc sặc sỡ" then listing neon as commonly tried: confusing and gives no verdict for the user's neons.
- plain, stocking-10 tank: "cá tế bào (cá neon, cá rasbora)": this is not a hobby term in Vietnam; it looks like a garbled word for tetra, and rasbora is not a tetra either.
- plain, stocking-10 tank: "đặc biệt nếu bể đang có một con betta đực": assumes the tank may already hold a betta when it holds only 12 neon tetras, so most of the answer addresses the wrong situation.
- ours, algae-12 post: "Giảm lượng phân châm hàng tuần một nửa... vì dư đạm và lân dễ nuôi tảo": đổ cho dư lân là sai hướng với rêu đốm xanh, loại thường gắn với lân thấp; 1 lần phân/tuần trong bể không CO2 cũng chưa chắc là dư.
- ours, algae-12 post: "Dùng khăn mềm lau nhẹ lá ráy": rêu đốm xanh bám rất chặt, lau bằng khăn mềm thường không sạch, và câu trả lời không tách rêu đốm khỏi rêu bụi.
- ours, algae-12 post: "dư đạm và lân dễ nuôi tảo": halving fertilizer is applied to green spot algae, which is not typically caused by excess phosphate and is often linked to low phosphate.
- ours, algae-12 post: "khuyến nghị 8 đến 12 giờ mỗi ngày": too long for a non-CO2 tank with algae, and it contradicts the answer's own advice to cut to 7 hours.
- plain, algae-12 post: "Thay nước 25-30%... để giảm chất dinh dưỡng dư thừa (đặc biệt là nitrat và phosphat)": mặc định dư lân là quá đơn giản với rêu đốm xanh, vốn thường gắn với lân thấp.
- plain, algae-12 post: "Tôm Amano ăn rêu khá tốt... rêu bám lá": Amano does little against hard green spot algae; only the nerite really handles it.
- plain, algae-12 post: "Thay nước... giảm nitrat và phosphat": excess phosphate is not the typical cause of green spot algae, which is more often linked to low phosphate.
- ours, algae-12 tank: "Giữ tổng số giờ đèn ở khoảng 8 đến 10 giờ": hơi cao với bể không CO₂ mới 4 tuần, toàn cây ưa sáng yếu (ráy, dương xỉ, rêu java); 10 giờ dễ làm tảo nhiều hơn, trong khi 6–8 giờ an toàn hơn.
- ours, algae-12 tank: "Giữ tổng số giờ đèn ở khoảng 8 đến 10 giờ": the upper end is on the long side for a 4-week-old, no-CO₂ tank of slow growers; 8 hours is already enough, and more invites algae.
- plain, algae-12 tank: "giúp cá và cây đỡ căng thẳng hơn": lợi ích này không có cơ sở rõ ràng; bật tắt đèn thêm một lần không chứng minh giúp cá bớt stress.
- plain, algae-12 tank: "timer thông thường chỉ có một khung": sai với phần lớn timer bán phổ biến; timer cơ và timer điện tử thường đặt được nhiều khung giờ.
- plain, algae-12 tank: "Có... thường có lợi": khẳng định quá mạnh cho bể cây dễ, không CO₂, chưa có vấn đề tảo; ở đây không nhất thiết phải chia đèn.
- plain, algae-12 tank: "giúp cá và cây đỡ căng thẳng hơn": claims a midday break reduces stress for fish and plants, which has no solid basis and oversells the split.
- plain, algae-12 tank: "timer thông thường chỉ có một khung": common mechanical timers and many digital ones allow several on/off periods, so this is wrong.
- plain, algae-12 tank: "Rêu chủ yếu phụ thuộc vào dinh dưỡng (nhất là phosphate, nitrate)": an oversimplified cause of algae, and using "rêu" for algae is confusing in a tank that grows rêu java.

## Failed

- setup-07 post: ours Request timed out.

## Each question

### algae-01 · post · plain wins (3.75 · 7.25)

**Asked:** Bể em mới set được hơn 2 tuần mà đã có chút rêu tóc trên lá bucep và nmc. Em dùng đèn Flat One treo cách mặt nước 20cm, lúc đầu để chế độ giả lập ánh sáng mặt trời, giờ em hạ xuống còn 7 tiếng chạy một mạch không ngắt quãng. Cứ 2 hôm em thay 30% nước một lần, có cho Seachem khử clo, Advance và thuốc khử rêu. Em mới châm thêm 2 lọ phân nước ADA là Brighty K và Green Brighty Mineral vì thấy nmc bị trắng lá, chỉ có ít lá xanh mọc từ dưới lên. Em làm vậy có sai không, rêu tóc này xử lý sao ạ?

**Judge:** Y targets the real levers: lower light intensity, stop the algae remover, test NO₃/PO₄ before dosing, remove algae by hand, and it explains the white leaves. X raises total light hours, ignores the algae remover and the 20cm/sun-mode setting, and gives no cause for the white leaves. / X nhắm đúng cường độ đèn Flat One treo thấp, khuyên giảm sáng, ngừng thuốc khử rêu, gỡ tay và đo NO₃/PO₄ trước khi châm phân, lại có giải thích cho lá trắng. Y tăng tổng giờ đèn lên 8–10 tiếng, không nói gì về thuốc khử rêu và không chẩn đoán lá trắng, nên kém hữu ích và có phần phản tác dụng.

**Ours lacks:** tank-fit, diagnosis, wrong. **Plain lacks:** plan, follow-up, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình thấy rêu tóc trong bể mới set thường do ánh sáng và dinh dưỡng đang lệch nhau khi rễ cây chưa kịp hút, nên khả năng cao là đèn bật liên tục 7 tiếng (quá 4 tiếng một đợt, cách handbook khuyên cho bể Hà Lan mới set) cộng với việc thêm 2 lọ phân nước khi bể còn non. Chưa khẳng định được vì mình chưa đọc được hướng dẫn riêng cho phân ADA và cho loại cây NMC, nên phần đó bạn cân nhắc thêm.
> 1. Chia đèn thành hai đợt, mỗi đợt không quá 4 tiếng, tổng khoảng 8 đến 10 tiếng mỗi ngày.
> 2. Tạm ngừng châm phân Brighty K và Green Brighty Mineral vài ngày, để rêu và cây cùng chờ rễ ra.
> 3. Giữ thay nước …

**Plain** (2410 characters):

> Bể mới 2 tuần mà có rêu tóc là khá phổ biến, và nguyên nhân thường là **ánh sáng quá mạnh, quá dài so với độ ổn định của bể**. Có vài điểm em nên điều chỉnh.
> 
> **1. Ánh sáng (nguyên nhân chính)**
> - Flat One treo 20 cm ở chế độ giả lập nắng là cường độ khá cao. Bể mới chưa ổn định về CO₂ và dinh dưỡng nên rất dễ bị rêu.
> - 7 tiếng liên tục vẫn hơi dài. Em nên:
>   - Hạ cường độ xuống khoảng 50–60% trong vài tháng đầu.
>   - Chạy 6–7 tiếng, hoặc chia 2 đợt (ví dụ 4 tiếng sáng + 2 tiếng chiều) để tránh đỉnh sáng quá lâu.
> - Lá nmc bị trắng có thể là dấu hiệu ánh sáng quá mạnh (bị cháy/bạc lá) kết hợp t…

### algae-01 · tank · plain wins (4.25 · 5.5)

**Asked:** Bể mới set của tôi đã có rêu tóc bám lên lá cây, xử lý sao?

**Judge:** Y is generic and long, but its 6–8h light, physical removal, feeding and fertiliser control, added fast-growing plants, Amano shrimp and spot H₂O₂ would actually work. X is tidier, but its main light step raises this tank's 7h to 8–10h and its water-change step is less frequent than what they already do, so it gives them little real fix. / Neither answer uses the tank's details or addresses the algaecide or whitening ngưu mao chiên. X is long and generic, but its 6–8h light, manual removal and cutting back fertiliser are mostly sound, whereas Y is tidier yet would raise the light and only repeats water changes the hobbyist already exceeds.

**Ours lacks:** tank-fit, wrong, diagnosis, too-thin. **Plain lacks:** tank-fit, too-long, follow-up, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể mới set có rêu tóc thường là do cây mới trồng chưa ra rễ nên ăn ít, dinh dưỡng dư còn lại trong nước, cộng với đèn bật quá lâu để rêu có điều kiện mọc. Hai nguyên nhân này khá chắc chắn với bể đang trong hai tuần đầu, nên bạn sửa thay nước và giờ đèn trước.
> 1. Trong hai tuần đầu, thay 30–50% nước cứ ba ngày một lần, kể cả khi rêu chưa nhiều.
> 2. Chia đèn tổng 8–10 tiếng mỗi ngày, mỗi đợt bật không quá 4 tiếng, dùng hẹn giờ nếu cần.
> 3. Gỡ tay phần rêu tóc đang bám lá và đá, nhẹ tay để khỏi làm đứt lá non.
> 4. Chưa cắt tỉa trong hai tuần đầu, để cây ra rễ rồi mới tỉa lần đầu vào tuần thứ ba.
> 5…

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

### algae-02 · post · plain wins (5.5 · 7.25)

**Asked:** Mình có hồ 70x30x40, cây chủ yếu là ráy và rêu. Đang dùng đèn Chihiros A601 plus mà bị rêu chùm đen, dù hồ không nền và hơn tuần nay không châm phân. Mình tính thay đèn, nên chọn đèn nào cho bể này?

**Judge:** Both correctly advise fixing light, cleaning and feeding before replacing the light, but only Y answers the question with a dimming level (40–60%) and light criteria, though its A361 suggestion fits poorly. X admits it has no light-selection information, gives no recommendation, and barely uses the tank's details. / Cả hai đều khuyên chỉnh đèn và chăm bể trước khi đổi đèn, nhưng X còn trả lời câu hỏi chọn đèn với mức 20–30W và vài dòng cụ thể, dù gợi ý A361 không hợp hồ 70cm. Y gọn, có mục theo dõi và nhắc chất thải hữu cơ, nhưng nói thẳng là không có thông tin chọn đèn nên bỏ ngỏ điều người hỏi cần.

**Ours lacks:** tank-fit, figures. **Plain lacks:** too-long, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Rêu râu đen (BBA) thường xuất hiện khi đèn mạnh hơn khả năng CO2 và dinh dưỡng của bể, hoặc khi bể có nhiều chất thải hữu cơ. Với bể không nền chỉ trồng ráy và rêu, đèn A601 Plus có thể đang mạnh so với nhu cầu, và việc ngừng châm phân một tuần làm cây yếu đi, khiến rêu dễ bám hơn. Mình chưa đọc được phần chọn đèn cụ thể cho bể này, nên bạn nên khắc phục nguyên nhân trước rồi mới đổi đèn.
> 1. Kiểm tra số giờ bật đèn và giảm xuống khoảng 6 đến 8 tiếng mỗi ngày, hạ cường độ nếu đèn chỉnh được.
> 2. Hút sạch lá úa, rêu chết và cặn bẩn, thay khoảng 30 phần trăm nước rồi vệ sinh lọc.
> 3. Châm lại phân…

**Plain** (2238 characters):

> Với hồ 70x30x40 (khoảng 84L) trồng ráy và rêu, mình nghĩ **bạn chưa cần thay đèn ngay**. Rêu chùm đen (BBA) thường xuất hiện khi ánh sáng quá mạnh hoặc kéo dài so với khả năng hấp thụ dinh dưỡng và CO₂ của cây, và ráy với rêu vốn là nhóm cây ưa ánh sáng thấp đến vừa.
> 
> **Nguyên nhân có khả năng nhất:**
> - **Cường độ hoặc thời gian chiếu sáng quá mức.** A601 Plus khá mạnh cho hồ 70cm, nhất là khi hồ không có nền và cây ít sinh trưởng.
> - **Cây không tăng trưởng đủ để cạnh tranh.** Ráy chậm lớn nên không hấp thụ hết dinh dưỡng, và rêu chùm đen tận dụng phần dư đó.
> - **Lịch chiếu sáng không ổn định…

### algae-02 · tank · ours wins (7.25 · 4.75)

**Asked:** Bể của tôi bị rêu chùm đen dù không châm phân, có phải do đèn không?

**Judge:** X nêu đúng đèn A601 plus và lá ráy, rồi đưa các bước theo thứ tự, cách xử lý tại chỗ bằng oxy già và mốc theo dõi 2-3 tuần. Y liệt kê đúng nhưng chung chung, còn hỏi lại loại đèn, dù có nhắc dòng chảy và cây mọc nhanh mà X bỏ sót. / Y gọi đúng đèn A601 plus và cây ráy, cho các bước có thứ tự, cách xử lý tại chỗ bằng oxy già và mốc theo dõi 2-3 tuần, dù có một con số lạ và một kết luận hơi chắc về phân. X chỉ liệt kê chung chung, không dùng dữ liệu bể, không có thứ tự ưu tiên hay mốc theo dõi, lại còn hỏi ngược loại đèn.

**Ours lacks:** –. **Plain lacks:** tank-fit, plan, follow-up, too-long.

**Ours** (read 2 pages, stopped at the calls limit):

> Đèn là một nghi ngờ hợp lý, nhưng gần như chắc chắn không phải nguyên nhân duy nhất. Bạn không châm phân nên không phải do phân. Rêu chùm đen (BBA) thường mọc khi đèn khá mạnh mà CO2 không ổn định, chất hữu cơ tích lại, hoặc cây yếu. Bể của bạn dùng đèn Chihiros A601 plus, khá mạnh, nên đèn là thủ phạm cần kiểm tra đầu tiên. Nhưng bạn chưa nói có châm CO2 không và đèn bật bao nhiêu giờ, nên mình chưa thể khẳng định chỉ do đèn.
> 1. Giảm thời gian đèn xuống khoảng 6 đến 7 giờ mỗi ngày, và hạ cường độ đèn nếu đèn có chỉnh được (kinh nghiệm chung).
> 2. Thay khoảng 25 đến 30% nước mỗi tuần và hút sạ…

**Plain** (1709 characters):

> Đèn **có thể là một nguyên nhân**, nhưng thường không phải là nguyên nhân duy nhất. Rêu chùm đen (BBA) thường xuất hiện khi có nhiều yếu tố cùng lúc.
> 
> **Các nguyên nhân thường gặp:**
> 
> 1. **Đèn quá mạnh hoặc bật quá lâu:** Cường độ sáng cao hoặc thời gian chiếu trên 8-10 giờ/ngày rất dễ kích rêu phát triển, đặc biệt khi CO2 không ổn định.
> 2. **CO2 thiếu hoặc dao động:** Nếu bể trồng cây có đèn mạnh mà CO2 thấp hoặc không đều, cây phát triển kém và rêu có lợi thế cạnh tranh.
> 3. **Dinh dưỡng vẫn có, dù không châm phân:** Thức ăn thừa, chất thải của cá, và phốt phát/nitrat trong nước máy đều là n…

### algae-03 · post · ours wins (7.5 · 3.25)

**Asked:** Mình mới chơi, hồ đầu tiên trồng trân châu ngọc trai, vừa set được 3 ngày. Từ 2 hôm trước nước chuyển xanh, mình nghi là rêu nước xanh. Mình thay 30% nước thì hôm sau nước còn xanh hơn. Hôm nay mình tháo bớt 1 bóng của đèn Odyssea dual, chỉnh timer từ 7 tiếng xuống 4 tiếng và thay bông lọc. Có nên tiếp tục thay nước mỗi ngày không? Đèn như vậy có dư không hay nên tắt luôn vài ngày?

**Judge:** X trả lời thẳng: ngừng thay nước hằng ngày, giữ đèn 4 tiếng, chỉ che tối tối đa 7 ngày nếu sau 3-5 ngày vẫn xanh, có cảnh báo cho cây và cá, dù bỏ sót chuyện thay bông lọc. Y có lưu ý bông lọc hữu ích nhưng lại lạc sang giả định đèn UV, không chốt được chuyện đèn và còn hỏi lại cả cây trân châu là gì. / Y trả lời thẳng cả hai câu hỏi: ngừng thay nước hằng ngày, giữ đèn 4 tiếng, và chỉ che tối tối đa 7 ngày nếu sau 3-5 ngày vẫn xanh, kèm dấu hiệu cần theo dõi, tuy chưa nhắc đến việc thay bông lọc. X nhầm Odyssea dual có thể là đèn UV, khuyên bật đủ 2 bóng liên tục, và còn hỏi trân châu ngọc trai là gì, dù có điểm đúng về bông lọc.

**Ours lacks:** tank-fit. **Plain lacks:** wrong, tank-fit, asks-only, plan.

**Ours** (read 1 pages, stopped at the tools limit):

> Nhiều khả năng đây là nước xanh do tảo phù du nở rộ, thường gặp ở bể mới set vì bể chưa ổn định và được chiếu sáng khá lâu. Thay nước hằng ngày không cắt được nguồn gây tảo nên nước vẫn xanh lại nhanh. Cẩm nang nói bạn cần cắt nguyên nhân trước, rồi mới làm trong nước.
> 1. Ngừng thay nước hằng ngày. Giữ đèn ở 4 tiếng như hiện tại và không bật thêm.
> 2. Kiểm tra bể có nắng chiếu trực tiếp hoặc nắng hắt từ cửa sổ không, nếu có thì dời bể đi.
> 3. Không cho ăn thừa và không châm phân nước trong lúc bể đang xanh.
> 4. Nếu sau khoảng 3 đến 5 ngày nước vẫn xanh, che kín bể tối đa 7 ngày, lọc và sủi vẫn c…

**Plain** (1616 characters):

> Mình khuyên **đừng thay nước mỗi ngày**, và **đừng tắt hẳn đèn**, nhất là nếu đây là đèn UV diệt tảo.
> 
> **Vì sao nước xanh:** Hồ mới set 3 ngày thường chưa có hệ vi sinh ổn định, nên dinh dưỡng (thức ăn thừa, phân, nước máy) dư thừa, cộng với nắng và ánh sáng, làm tảo nổi (nước xanh) bùng lên. Thay 30% mỗi ngày đưa thêm nước máy vào, có thể mang thêm dinh dưỡng và làm hồ không kịp ổn định. Thường thì nước xanh kiểu này tự hết sau 1-3 tuần khi hồ ổn định.
> 
> **Việc nên làm:**
> - **Ngừng thay nước hằng ngày.** Chỉ thay khi thử nước thấy amonia hoặc nitrit tăng, và mỗi lần chỉ khoảng 10-15%.
> - **Thử…

### algae-03 · tank · ours wins (7 · 5.25)

**Asked:** Bể mới set vài ngày đã bị nước xanh, nên thay nước hay tắt đèn?

**Judge:** X trả lời rõ tắt đèn trước rồi mới thay nước, giải thích được vì sao thay nước làm xanh lại, có các bước theo thứ tự, cảnh báo amoniac khi tảo chết và dấu hiệu cá ngạt. Y cũng chọn tắt đèn nhưng dàn trải, đoán nguyên nhân từ thức ăn và cá, lại nói che tối không hại gì; cả hai đều bỏ qua việc đèn đã giảm còn 4h. / Y trả lời thẳng: che tối trước, giữ lọc và sủi, thay nước sau khi trong, kèm giới hạn 7 ngày, cảnh báo cây yếu, amoniac tăng và dấu hiệu cá ngạt; điều này cũng giải thích vì sao thay 30% xong lại xanh hơn. X cũng chọn tắt đèn nhưng lại bảo không hại gì, tập trung vào thức ăn, thêm nhiều việc phụ và ít theo dõi hơn; cả hai đều không nhắc tới timer 4 giờ hay bóng đã tháo.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, plan, too-long, follow-up.

**Ours** (read 1 pages, stopped at the calls limit):

> Nước xanh trong bể mới thường là tảo phù du nở rộ, do bể chưa ổn định, đèn bật lâu và chất dinh dưỡng từ nền mới. Nước xanh tự nó chưa làm hại cá, nên thay nước ngay chỉ để hết xanh thì tảo sẽ mọc lại nhanh. Vì vậy bạn nên tắt đèn trước, rồi mới thay nước.
> 1. Tắt đèn hoặc che kín bể tối đa 7 ngày, vẫn để lọc và sủi chạy liên tục.
> 2. Nếu được, chuyển cá, tép sang bể tạm trong lúc che tối, vì cây cũng sẽ yếu đi.
> 3. Khi nước đã trong, thay khoảng 30% nước để vớt xác tảo và giảm amoniac, vì tảo chết có thể làm amoniac tăng vọt.
> 4. Sau đó bật đèn lại khoảng 6–8 giờ mỗi ngày và thay ít nhất 20% nướ…

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

### algae-04 · post · plain wins (5.5 · 7)

**Asked:** Mình chơi hồ 60x40x40 theo kiểu Hà Lan, dùng 2 cây đèn trắng Aquablue, 1 cây dài 60cm và 1 cây 45cm, vậy có bị dư sáng không? Hồ mới set được 7 ngày mà tảo nâu phát triển nhiều quá, CO2 và dinh dưỡng thì tương đối ổn định, mỗi ngày thay 30% nước kèm vệ sinh hồ, vậy mà rêu nâu cứ bám hoài trên đá và mặt kính. Hồ mình đang bị gì, nên làm sao?

**Judge:** Y directly answers the light question for the actual 60cm + 45cm setup, addresses the daily water changes, and gives practical steps including Nerite snails and when to add grazers, though it overstates the silicate and water-change points. X is tidier and has a useful seeding tip, but it misreads the lights, is overconfident about excess light, and ignores the hobbyist's daily water-change routine. / X correctly identifies diatoms as normal new-tank algae, directly answers the light and water-change questions, and gives a fuller plan with a photoperiod, cleaning, algae eaters and a timeline, despite overplaying silicate and water changes. Y is concise and has useful steps like seeding from old filter floss and testing ammonia, but it misreads the lights, overclaims excess light, and barely addresses the daily water changes.

**Ours lacks:** tank-fit, diagnosis, follow-up. **Plain lacks:** follow-up, too-long, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ hồ đang bị tảo cát (tảo nâu) bùng lên vì bể còn non. Sau 7 ngày, vi sinh chưa đủ để ăn hết chất dinh dưỡng, và hai đèn trắng 60cm cộng với CO₂ và phân đang cho tảo đủ điều kiện phát triển. Với hồ mới, đèn 'dư sáng' là khá chắc chắn: handbook gợi ý bể mới chỉ có cây xanh nên bắt đầu ở khoảng 40-60 µmol PAR ở mặt nền, còn bể nhiều cây khó tính thì 80-100 µmol. Mình chưa đo được PAR của hồ bạn nên không chắc con số cụ thể.
> 1. Giảm thời gian bật đèn xuống khoảng 6 tiếng mỗi ngày, hoặc chỉ bật một cây đèn trong 3-4 tuần đầu.
> 2. Nâng đèn lên cao hơn hoặc giảm độ sáng nếu máng đèn có chỉnh…

**Plain** (2537 characters):

> # Tảo nâu trong hồ mới là khá phổ biến
> 
> Lớp nâu bám trên đá và kính thường là **tảo silic (diatom)**. Nếu lau bằng tay thì bong ra dễ dàng, đó là dấu hiệu nhận biết. Tảo nâu hay xuất hiện trong 2-8 tuần đầu của hồ mới, vì lúc này hệ vi sinh chưa ổn định, cây chưa hấp thụ hết dinh dưỡng, và nước thường giàu **silicate**.
> 
> ## 1. Có bị dư sáng không?
> 
> Với hồ khoảng 96L và 2 đèn (60cm + 45cm) thì **cường độ ở mức trung bình-khá**, chưa phải là quá dư, nhất là với kiểu Hà Lan vốn cần sáng tương đối. Tuy nhiên, trong giai đoạn mới set, **thời gian bật đèn** mới là yếu tố dễ gây tảo:
> - Nên bật **6-7…

### algae-04 · tank · ours wins (7.25 · 4.75)

**Asked:** Bể mới set một tuần bị tảo nâu bám kín đá và kính, làm sao?

**Judge:** X correctly identifies new-tank diatoms and gives a short ordered plan for a planted tank, covering cleaning, light, fertiliser, plants and seeding, with a 4–6 week timeline, though it gives PAR instead of light hours and ignores the daily water changes. Y is generic, focuses on feeding and weekly water changes, contains errors, and ends by asking about details the app already holds, although it does give light hours and algae-eater options. / Y đúng nguyên nhân, dùng từ \"tảo cát\" quen thuộc, nêu mốc 4–6 tuần và các bước gọn hợp bể cây có phân, CO₂ như giảm đèn, giảm phân, cấy vi sinh, dù chưa nêu số giờ đèn. X chung chung, bỏ qua việc họ đã thay 30% nước mỗi ngày, có lỗi về than hoạt tính và ốc Trochus, lại hỏi những điều app đã biết.

**Ours lacks:** figures, tank-fit. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 2 pages):

> Bể mới set một tuần mà tảo nâu phủ kính và đá thường là tảo cát, loại hay bùng trong vài tuần đầu khi vi sinh chưa ổn định. Cẩm nang cho biết lớp này thường tự hết sau 4–6 tuần, và lau là trôi.
> 1. Hút bỏ các mảng tảo lớn khi thay nước, chà nhẹ kính và đá để lớp tảo không phủ kín cây.
> 2. Giảm giờ đèn và cường độ: bể chỉ có cây xanh nên bắt đầu khoảng PAR 40–60 µmol tại nền, và tăng dần khi bể trưởng thành.
> 3. Tạm ngưng hoặc châm rất nhẹ phân có đạm và phốt phát, dùng loại không đạm, không phốt phát trước.
> 4. Trồng thêm cây hoặc tỉa lá úa để cây cạnh tranh với tảo và thích nghi nhanh hơn.
> 5. Cấ…

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

### algae-05 · post · plain wins (5.25 · 7.25)

**Asked:** Em set bể Hà Lan được gần 1 tháng, đèn mới lên 8h/ngày (10h sáng đến 18h), cây phát triển rất tốt, không có rêu hại. Phía trước dưới nền em trồng rau thơm. Nhưng ở mặt kính phía dưới, chỗ giáp nền, có tảo nâu bám kính và một chút tảo nhớt xanh, có phải do đèn trong nhà buổi tối hắt vào bể không? Bucep em buộc giá thể thả vào được 1 tuần cũng có tảo nâu trên lá. Em thay nước đều 2 ngày 1 lần. Em có thả ốc nerita nhưng nó chỉ nằm im không bò, kiểm tra thì vẫn sống. Xử lý tảo nâu với rêu nhớt sao ạ?

**Judge:** Y nhận đúng nhớt xanh là vi khuẩn lam ở vùng đáy ít dòng chảy và đưa cách xử lý riêng (siphon, tắt đèn 2–3 ngày, tăng dòng chảy), đồng thời giải thích ốc nerita mới thả nằm im để thích nghi, dù hơi dài. X gọn và có mẹo mồi vi sinh hay, nhưng xử lý nhớt xanh quá yếu, chỉ giảm đèn và kiểm tra dinh dưỡng, nên chưa giải quyết được phần người hỏi cần. / X nhận ra lớp nhớt xanh có thể là vi khuẩn lam và cho cách xử lý thật: hút siphon, tắt đèn 2–3 ngày, tăng dòng chảy đáy, kèm tép Amano và giải thích về nerita, dù hơi dài và có vài ý suy diễn. Y gọn và lành, xử lý tảo nâu ổn với mulm hoặc bông lọc cũ, nhưng gần như bỏ ngỏ phần rêu nhớt mà người hỏi cần giải quyết, và phần nerita cũng rất sơ sài.

**Ours lacks:** diagnosis, plan, tank-fit, too-thin. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể mới set khoảng 1 tháng thường bùng tảo nâu (tảo cát) ở kính và lá, nhất là phía dưới giáp nền, nên đây là nguyên nhân khả dĩ nhất. Đèn phòng hắt ban đêm có thể góp phần nhỏ, nhưng mình nghĩ đèn bể và độ trưởng thành của bể quan trọng hơn. Tảo nhớt xanh thường đi kèm đèn chạy dài và dinh dưỡng dư, nên bạn nên xử lý cả hai.
> 1. Hút tảo nâu bằng tay hoặc lau kính khi thay nước, không dùng thuốc diệt rêu lúc này.
> 2. Giảm đèn bể xuống khoảng 6–7 giờ mỗi ngày, và tắt đèn phòng hoặc che mặt kính để ánh sáng phòng không chiếu vào bể.
> 3. Thêm cây cho đủ dày để cạnh tranh với tảo, và bóp bông lọc cũ …

**Plain** (2581 characters):

> Tảo nâu thường gặp ở bể mới khoảng 1–2 tháng. Thường là **tảo silic (diatom)**, xuất hiện khi bể chưa cân bằng, nguồn sáng và dinh dưỡng đang dư. Tình trạng này thường tự giảm khi bể ổn định. Còn lớp nhớt xanh có thể là **vi khuẩn lam (cyanobacteria)**, dễ xuất hiện ở vùng đáy kính, nơi ít dòng chảy và tích tụ mùn bã hữu cơ.
> 
> **1. Đèn trong nhà hắt vào bể có phải nguyên nhân không?**
> Có thể góp phần, nhưng thường không phải nguyên nhân chính. Ánh sáng yếu từ đèn phòng vào buổi tối ít ảnh hưởng đến tảo. Bạn nên kiểm tra:
> - Ánh nắng hoặc đèn phòng có chiếu trực tiếp vào mặt kính không.
> - Đèn bể…

### algae-05 · tank · ours wins (7 · 4.75)

**Asked:** Bể tôi có tảo nâu và tảo nhớt xanh ở chân kính sát nền, xử lý thế nào?

**Judge:** X gọn, nhận đúng bể non và góc chết ít lưu thông, có các bước theo thứ tự và mốc theo dõi; guide kèm theo cũng hữu ích. Y dài, chung chung, liệt kê sinh vật ăn tảo với tên sai hoặc lạc đề; cả hai đều không dùng dữ kiện bể và bỏ qua việc ốc nerita nằm im. / Y gọn, nêu đúng hướng bể non và góc chết ít lưu thông, có các bước theo thứ tự, mốc theo dõi và trích dẫn hữu ích, dù chưa dùng dữ liệu bể và bỏ qua ốc nerita nằm im. X dàn trải, gợi ý thêm sinh vật với tên gọi sai hoặc lạ, nhắc H₂O₂ không liều và cũng không bám vào tình trạng bể 4 tuần tuổi.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, local, follow-up.

**Ours** (read 2 pages, stopped at the calls limit):

> Bạn đang gặp hai loại tảo thường đi cùng nhau ở bể mới hoặc bể chưa ổn định sinh học. Tảo nâu là tảo cát, hay gặp khi bể còn non hoặc đèn mạnh đi kèm dinh dưỡng cao. Lớp nhớt xanh (vi khuẩn lam) thì hay bám ở góc chết, nơi nước lưu thông yếu và có cặn hữu cơ tích lại. Mình chưa biết bể đã chạy bao lâu, đèn bật mấy giờ và có bón phân không, nên đây là hướng xử lý chung.
> 1. Hút nền nhẹ và thay một phần nước để dọn cặn hữu cơ.
> 2. Chỉnh vòi lọc hoặc quạt nước hướng vào chỗ bám để tăng lưu thông ở góc chết.
> 3. Gỡ tay các mảng nhớt xanh khi còn nhỏ, rồi hút tảo nâu khi thay nước.
> 4. Giảm thời gian …

**Plain** (2489 characters):

> Tảo nâu và tảo nhớt xanh ở chân kính thường xuất hiện khi bể dư dinh dưỡng, ánh sáng hoặc dòng chảy chưa tốt. Bạn xử lý theo các bước sau:
> 
> ## 1. Xác định loại tảo
> - **Tảo nâu** (diatom): lớp bột nâu dễ lau, thường xuất hiện ở bể mới hoặc khi ánh sáng yếu. Thường tự biến mất khi bể ổn định.
> - **Nhớt xanh** (vi khuẩn lam, cyanobacteria): lớp nhầy, có thể dày, màu xanh hoặc đen, dễ bong thành mảng. Đây là loại khó xử lý hơn và cho thấy bể đang dư chất dinh dưỡng hoặc thiếu oxy/lưu thông nước ở đáy.
> 
> ## 2. Xử lý ngay
> - **Cọ và lau kính** bằng miếng cọ mềm hoặc nam châm lau kính. Với vi khuẩn lam…

### algae-06 · post · tie or split (6.5 · 6.5)

**Asked:** Em đang dùng bể 6-4-4, lọc Sunsun 702B (1000L/h), lọc phụ Sunsun 603. CO2 cho qua sủi đánh thẳng vào đầu in của lọc, có van điện bật tắt theo đèn. Thỉnh thoảng nghe trong lọc chính có tiếng lọc xọc, lúc khác lại thấy đầu out bắn ra bọt khí to cỡ hạt đỗ. Bể đang nhiều rêu tóc, rêu sừng hươu và rêu lông tơ nên em đang cho CO2 dồi dào hơn, tầm 6-7 giọt/giây. Trộn như vậy có ổn không khi CO2 nhiều? Lọc phụ gắn thêm trộn cánh quạt ở out được không hay sẽ yếu dòng? Cá tép có nguy cơ chết vì ngạt CO2 không?

**Judge:** X gives a short, ordered plan: check with a drop checker, move injection to an inline mixer on the output, then watch the shrimp, though it lacks numbers and says 'Handbook' awkwardly. Y covers more, including a useful check valve and bubble-rate figures, but it is long and has contradictory diffuser placement, a garbled algae step and shaky algae claims. / X trả lời đủ cả ba câu hỏi, có số CO2 và ngưỡng an toàn, dấu hiệu ngạt, van một chiều và xử lý cả ba loại rêu, tuy dài và có vài chỗ lủng củng. Y gọn, thứ tự rõ và khuyên cốc trộn trên đường out rất đúng, nhưng thiếu số liệu, bỏ qua rêu sừng hươu và lông tơ, không trả lời thẳng nguy cơ ngạt và có câu chữ 'Handbook' gây lạ.

**Ours lacks:** figures, diagnosis, too-thin. **Plain lacks:** too-long, plan.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ bạn đang châm CO2 quá tay, và chỗ đặt van ở đầu in lọc là nguyên nhân khiến khí bị đẩy vào lọc: đó là lý do có tiếng lọc xọc và bọt to ở đầu out. Handbook nói phần lớn rêu tóc là do thiếu CO2, nên đếm giọt không cho biết bể đủ hay thừa; bạn cần drop checker. Handbook không có số liệu về CO2 với tép, cánh quạt trên lọc phụ, nên phần đó là kinh nghiệm chung của mình.
> 1. Treo drop checker trong bể và chỉnh lưu lượng CO2 cho nó ra xanh lá; nếu chuyển sang vàng thì bạn đang thừa CO2, giảm ngay.
> 2. Chuyển điểm bơm CO2 sang cốc trộn nối trên đường out của lọc chính, thay vì đầu in, để khí …

**Plain** (3807 characters):

> # Trả lời ngắn gọn
> 
> **Trộn CO2 vào đầu hút của lọc chính đang gây tiếng xọc và bọt lớn.** Với lượng 6-7 giọt/giây, bể 96-100L dễ bị dư CO2, nhất là khi bạn tăng đột ngột. Nên giảm lượng CO2, dùng đo drop checker để kiểm soát, và chuyển điểm bơm CO2 ra khỏi đầu hút lọc chính.
> 
> ## 1. Tiếng "lọc xọc" và bọt to ở đầu out
> 
> - **Khí bị hút vào bơm:** Bọt CO2 đi vào đầu hút, bơm 702B hút cả khí lẫn nước. Khí làm bơm mất mồi, chạy ồn, lưu lượng giảm, lâu dài có thể mòn cánh bơm và phớt.
> - **Bọt to ở out:** CO2 không kịp hòa tan nên thoát ra theo dòng nước. Bọt to cỡ hạt đỗ nghĩa là lượng khí đang vượt…

### algae-06 · tank · tie or split (5.5 · 4.25)

**Asked:** Bể tôi nhiều rêu tóc, rêu sừng hươu và rêu lông tơ, tăng CO2 có giúp được không?

**Judge:** X gives an ordered, checkable plan (light hours, drop checker, redirect flow, manual removal, Amano, 2–3 week check) centred on CO₂, the real question, though it misses their rattling filter and CO₂ bubbles. Y is a generic list with a wrong pH target and the excess-phosphate myth, and it asks for tank details the app already holds. / Neither answer spots the real clue: 6-7 bps fed into the filter inlet, with a rattling filter and big bubbles at the outlet, points to poor dissolution rather than too little gas. Y has the tidier plan and better Vietnamese, but its reversed drop-checker advice could harm livestock in a tank already on heavy CO₂, so X narrowly wins for its safe CO₂ guidance and fish-gasping warning, despite being generic and getting the pH target wrong.

**Ours lacks:** tank-fit, diagnosis, unsafe. **Plain lacks:** tank-fit, plan, wrong, too-long.

**Ours** (read 3 pages):

> Có, tăng CO2 giúp được, nhưng chỉ khi bể đang thiếu CO2. Theo cẩm nang, khoảng 90% trường hợp rêu tóc là do thiếu CO2, nên bạn nên kiểm tra trước. Rêu sừng hươu hay mọc quanh chỗ nước ra của lọc treo vì dòng chảy đẩy CO2 thoát khỏi nước, nên cây ở đó thiếu CO2 hơn. Rêu lông tơ bạn nói thì mình chưa chắc là loại nào, bạn cho mình biết rõ hơn nếu cần.
> 1. Kiểm tra giờ đèn: nếu đang bật trên 10 tiếng thì hẹn giờ về khoảng 8 tiếng.
> 2. Treo drop checker và chỉnh CO2 cho nó xanh lá. Nếu đang châm CO2 mà checker vẫn vàng thì tăng thêm từ từ.
> 3. Nếu bể không châm CO2, giảm đèn và giảm khuấy động mặt n…

**Plain** (1978 characters):

> **Có, tăng CO₂ thường giúp**, nhưng thường chỉ là một phần của giải pháp. Rêu tóc, rêu sừng hươu và rêu lông tơ hay xuất hiện khi bể mất cân bằng: ánh sáng quá mạnh hoặc kéo dài, dinh dưỡng (đặc biệt là phosphate và nitrate) dư thừa, còn cây thủy sinh thì thiếu CO₂ nên phát triển chậm. Khi cây được cấp đủ CO₂, chúng lớn nhanh hơn, hấp thụ dinh dưỡng và cạnh tranh ánh sáng tốt hơn rêu.
> 
> **Cách tăng CO₂ hiệu quả**
> - Đo bằng drop checker hoặc theo pH: mục tiêu thường là pH giảm khoảng 0,2–0,3 so với nước không CO₂, hoặc drop checker chuyển xanh vàng nhẹ (khoảng 25–30 ppm).
> - Bật CO₂ cùng lúc với…

### algae-07 · post · plain wins (4.25 · 7.25)

**Asked:** Em là tân binh theo trường phái Hà Lan, phần cứng gần như đủ cho một bể Hà Lan cơ bản: lọc chuẩn, CO2 dồi dào, nền trộn giàu dưỡng, đèn WRGB, quạt... Vậy mà em thất bại liên tiếp 5 bể, bể nào cũng bị: cây xoắn ngọn, xoắn tít, mất màu, teo ngọn, ngọn trắng toát và dị dạng; rêu hại bùng phát. Đèn bật 9h liên tục, CO2 3-4 giọt/giây, mới setup em thay hơn 100% nước hằng ngày trong 2 tuần (vì nghe nói nền trộn rất giàu dưỡng, mà nền mua nên em không biết công thức). Giờ em muốn chuyển qua nền công nghiệp + cốt nền nhưng lăn tăn về tuổi thọ và dinh dưỡng cho bể Hà Lan vốn rất háu ăn. Em nên làm sao?

**Judge:** Y chỉ ra việc rửa trôi vi lượng khớp với triệu chứng ngọn, thêm KH/CO2, giảm đèn, nêu mức phân, cấu trúc nền, tuổi thọ nền và lộ trình theo tuần. X đúng hướng về thay nước nhưng quy về thiếu nitrat, các bước còn chung chung và gần như không có số liệu cho bể Hà Lan. / X connects the symptoms to washed-out micronutrients, adds KH/GH and CO2 checks, and gives target figures, a timeline and a clear substrate plan. It still misses calcium and has a substrate slip. Y blames nitrate, gives few numbers and offers only general steps.

**Ours lacks:** figures, diagnosis, too-thin. **Plain lacks:** local, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là bể đang thiếu dinh dưỡng và thiếu nitrat, chứ không phải do phần cứng. Bạn thay hơn 100% nước mỗi ngày trong 2 tuần, nên nitrat và phân bị rút gần hết, trong khi đèn 9 giờ và CO2 dày vẫn kéo cây ăn mạnh. Cây thiếu chất thì ngọn xoắn, nhạt màu, còn rêu lợi dụng lúc cây yếu. Cẩm nang nói rõ: bể trồng cây phải đo nitrat thực tế, không chỉ thay nước đều. Phần công thức phân cho bể Hà Lan thì cẩm nang chưa có, nên mình nêu theo kinh nghiệm chung.
> 1. Ngừng thay nước quá nhiều mỗi ngày, chỉ thay khoảng 20–30% mỗi tuần.
> 2. Mua bộ test nitrat và phosphat, đo để biết bể đ…

**Plain** (3164 characters):

> Em không nên đổ lỗi cho nền trộn hay bỏ phương pháp Hà Lan. Theo mô tả, nguyên nhân nhiều khả năng nằm ở **thiếu dinh dưỡng do thay nước quá nhiều**, cộng với **CO2 và ánh sáng cao mà không có bón phân tương ứng**.
> 
> ## 1. Chẩn đoán
> 
> - **Thay 100% nước mỗi ngày trong 2 tuần** đã rửa trôi phần lớn dưỡng chất hòa tan và vi lượng (sắt, mangan, kẽm...). Nền trộn giàu dưỡng chỉ bổ sung từ từ, nên sau khi bị rửa trôi, cây đói ngay. Đây là lý do cây non bị xoắn, trắng ngọn, dị dạng.
> - **Ánh sáng 9h + CO2 3-4 giọt/giây + không bón phân đều** là tổ hợp khiến cây tiêu thụ nhanh, trong khi nguồn cung khô…

### algae-07 · tank · ours wins (6.5 · 3.5)

**Asked:** Bể tôi cứ bị rêu hại bùng phát và cây xoắn ngọn, trắng ngọn, phải làm sao?

**Judge:** X links twisted new leaves to calcium or low hardness, gives a short ordered plan with a check period, and avoids the low-nutrient trap, though it ignores the rich substrate and past water changes. Y is long and generic, even asking whether this is an outdoor pond, blames iron and high nutrients, and adds poor algae-eater and floating-plant suggestions. / Y links twisted new growth to low calcium/hardness, which is likely with soft water and huge water changes, and gives a short ordered plan with a 2–3 week check, though it misses the substrate and water-change history. X is a long generic checklist that blames iron and high nutrients, suggests poor livestock and plants, and even asks if this is a pond.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán có hai chuyện đang chạy cùng nhau: rêu hại bùng lên thường do đèn bật quá lâu hoặc quá mạnh, cây trồng chưa đủ dày, và chất thải hữu cơ chưa được hút đi. Lá non xoắn quăn thường là dấu hiệu thiếu canxi hoặc nước có độ cứng thấp, còn trắng ngọn thì mình chưa đọc đủ để khẳng định, nên bạn cần kiểm tra thêm.
> 1. Giảm đèn xuống còn khoảng 6–8 giờ mỗi ngày và tránh để nắng chiếu trực tiếp vào bể.
> 2. Trồng thêm cây và chọn vài loại mọc nhanh để giành chất dinh dưỡng với rêu.
> 3. Đo nitrat và photphat; nếu chúng tụt về 0 thì rêu sẽ được nuôi dưỡng, nên bổ sung phân đều hơn.
> 4. Hút cặn đáy, c…

**Plain** (2889 characters):

> Hiện tượng rêu bùng phát kèm cây xoắn ngọn, trắng ngọn thường do **mất cân bằng dinh dưỡng và ánh sáng**, hoặc **thiếu vi lượng (đặc biệt là sắt)**. Bạn có thể xử lý theo các bước sau.
> 
> ## 1. Kiểm tra nước trước
> Nên dùng bộ test (NH₃/NH₄⁺, NO₂⁻, NO₃⁻, PO₄³⁻, pH, KH, GH). Nếu chưa có, ít nhất hãy để ý:
> - **Amoniac hoặc nitrit > 0**: có thể do cá quá tải, cho ăn dư, lọc chưa chín hoặc thiếu vi sinh. Đây là nguyên nhân nguy hiểm nhất, phải thay nước ngay.
> - **Nitrat và photphat cao**: là "thức ăn" của rêu. Nên giữ nitrat dưới khoảng 20–30 mg/L.
> 
> ## 2. Giảm ánh sáng và kiểm soát thời gian chiếu s…

### algae-08 · post · ours wins (7.5 · 6)

**Asked:** Em mới chơi, bể đúc 50cm, lúc đầu nuôi 9 mún + 3 bảy màu + 2 sọc ngựa, giờ là 10 bảy màu, 9 sọc ngựa, 5 mún đỏ với 2 cây ráy. Bể không trải nền, chỉ có vài hòn đá; có lọc thác (có lúc chạy cả ngày, có lúc em không bật) và đèn RGB 9W, ban ngày bật trắng khoảng 10 tiếng, tối chuyển đèn màu đến lúc đi ngủ mới tắt. Cho ăn ngày 2 lần. Được hơn 3 tuần thì tảo nâu bám đầy bể, mún với bảy màu ăn hằng ngày cũng không hết, nước đục đục như phân cá rã ra. Tuần thay 50% nước vẫn đục, thành bể có một lớp mờ mờ như rêu tảo bám. Giờ thì thay nước xong được vài ngày là nước lại chuyển xanh đục, tuần nào cũng phải thay gần như hết nước. Lọc thác không ăn thua, em đang tính mua lọc thùng Sunsun 350K thay vào. Do lọc hay do gì, làm sao để nước luôn trong?

**Judge:** X chẩn đoán đúng (thừa đèn, thừa thức ăn, lọc chập chờn), đưa 5 bước theo thứ tự và hoãn mua lọc thùng hợp lý, dù chưa nói đến việc bớt cá khi bảy màu đang sinh sản. Y có thêm vài ý hay như bớt cá, đặt ráy lên đá, cách rửa lọc, nhưng hiểu nhầm bể đúc thành bể xi măng, đếm sai cá, gợi ý cây chưa hợp, lại dài và hỏi lại điều đã biết. / Y directly answers that the filter is not the main cause, then gives a short ordered plan with a 1–2 week checkpoint before buying the canister filter, though it never suggests thinning the breeding fish. X has useful extras such as siphoning, cleaning the filter in old tank water and rehoming fish, but it is scattered, miscounts the fish, misreads the tank as cement and asks for the tank's age after being told it.

**Ours lacks:** tank-fit, follow-up, figures. **Plain lacks:** too-long, plan, wrong, tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là bể đang thừa ánh sáng và thừa dinh dưỡng, chứ chưa phải do lọc. Đèn bật khoảng 10 tiếng trắng cộng thêm đèn màu buổi tối nên tổng thời gian chiếu sáng quá dài, còn cho ăn 2 lần mỗi ngày với đàn cá khá đông (khoảng 26 con trong bể 50cm mới chạy hơn 3 tuần) khiến thức ăn thừa và chất thải tích tụ. Đó là đúng kiểu tảo nâu (tảo cát) và tảo đơn bào xanh bùng lên ở bể mới. Lọc thác chạy lúc được lúc không cũng làm vi sinh lọc không ổn định, nên nước khó trong. Thay 50% mà vài ngày lại đục thì cho thấy nguồn thức ăn và ánh sáng vẫn còn nguyên, nên thay nước chỉ là xử l…

**Plain** (2806 characters):

> # Nguyên nhân chính: quá tải cá và thức ăn, cộng thêm ánh sáng quá nhiều
> 
> Lọc thác không đủ vì bể đang chứa nhiều chất thải hơn khả năng phân hủy của hệ vi sinh. Lọc thùng có thể giúp, nhưng nếu chỉ thay lọc mà không sửa các yếu tố dưới đây thì nước vẫn sẽ đục lại.
> 
> **1. Mật độ cá quá cao.** Bể 50cm với khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ) là khá đông. Mỗi con thải ra amoniac, và bể non chưa đủ vi khuẩn để xử lý hết.
> 
> **2. Cho ăn quá nhiều.** Thức ăn thừa phân hủy và làm nước đục, làm tăng dinh dưỡng cho tảo. Cho ăn 2 lần/ngày là ổn, nhưng mỗi lần chỉ nên cho lượng cá ăn hế…

### algae-08 · tank · ours wins (7 · 5)

**Asked:** Bể tôi thay nước xong vài ngày lại xanh đục và bám tảo nâu, làm sao giữ nước trong?

**Judge:** X nêu đúng hướng bể non, thừa sáng và dinh dưỡng, rồi cho thứ tự rõ ràng: đo ammonia/nitrite, rút đèn, giảm ăn, che tối, kèm dấu hiệu cần theo dõi, tuy quên khuyên thêm cây. Y có ý thêm cây rất hợp với bể chỉ có 2 cây ráy, nhưng dài, chung chung, có mẹo để lắng nước sai và kết bằng việc hỏi lại. / Y gives a short, ordered plan that checks ammonia and nitrite first, cuts light and food, covers blackout safely, and says what to watch, though it omits adding plants and doesn't read the tank's details. X has useful points on plants and filter care, but it is a long generic list with some weak tips, and its 20–30% water change advice misses that this keeper already changes far more.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, too-long, plan, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán bể còn non hoặc đang thừa ánh sáng và dinh dưỡng, nên tảo phù du (nước xanh) và tảo cát (màu nâu) dễ nở lại ngay sau khi thay nước. Mình chưa biết chi tiết bể nên đây là nguyên nhân khả dĩ nhất, chưa phải chắc chắn.
> 1. Đo ammonia và nitrite trước; nếu trên 0 thì xử lý trước, vì tảo chết dễ làm ammonia tăng.
> 2. Rút đèn còn khoảng 6–8 giờ mỗi ngày và dời bể khỏi chỗ nắng chiếu hoặc nắng hắt từ cửa sổ.
> 3. Cho ăn ít lại, vớt thức ăn thừa, và tạm ngưng châm phân nước khi nước đang xanh.
> 4. Nếu nước vẫn xanh đậm, che tối bể tối đa 7 ngày trong lúc lọc và sủi vẫn chạy, hoặc dùng đèn UV; nế…

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

### algae-09 · post · plain wins (5.75 · 8)

**Asked:** Có cách nào trị rêu xanh nước không ạ? Em được cho cái bể đúc khá to nên phải để ngoài ban công. 2-3 tháng đầu chỉ bị bám rêu lên thành bể, phải cọ rêu thay nước nhưng nước vẫn trong. Giờ không hiểu sao cứ thay nước được khoảng 3 tuần là nước xanh lè, cá chết lăn quay. Bể có sục khí với lọc tuần hoàn thường thôi, không làm thủy sinh, đáy trống.

**Judge:** Y fits a cast tank on a balcony better: it gives partial shade with netting and floating plants, explains the 3-week nutrient cycle, and covers cement pH, overstocking, bottom siphoning and emergency steps, though it is longer and its urgent steps come last. X is concise and mostly sound but generic, as it suggests moving a huge tank, turning off a light, and changing water only after a high test result. / X explains the 3-week cycle and fish deaths, and gives practical steps for a large outdoor tank: 50-70% shade, floating plants, less feeding, siphoning, partial water changes, more aeration and a cement pH check. Y identifies the likely cause but is generic, ignores the cast tank, and suggests moving a large tank and turning off a lamp it does not appear to have.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng bể bị nước xanh do tảo phù du nở rộ, thường vì bể ngoài ban công dính nắng trực tiếp, cộng với dinh dưỡng tích lại giữa các lần thay nước. Cá chết nhiều khả năng do oxy tụt vào ban đêm khi tảo chết hàng loạt, hoặc do amoniac tăng vọt, nên mình không chắc chắn đến mức nào nếu chưa đo nước. Làm theo các bước sau:
> 1. Dời bể ra chỗ không có nắng chiếu, hoặc che kín bể bằng vải tối màu hoặc tấm che.
> 2. Tắt đèn bể và giữ sủi khí với lọc chạy liên tục, kể cả ban đêm.
> 3. Đo amoniac và nitrit; nếu có số đo cao, thay khoảng 30% nước bằng nước đã khử clo.
> 4. Thay ít nhất 20% nước mỗi tuần…

**Plain** (2214 characters):

> Nước xanh lè thường do **tảo đơn bào** bùng phát. Bể ngoài trời, đáy trống, có nhiều cá, cho ăn đều thì rất dễ gặp. Chu kỳ khoảng 3 tuần cho thấy dinh dưỡng (phân cá, thức ăn thừa) tích tụ dần rồi tảo bùng lên.
> 
> **Cá chết đột ngột có thể do:**
> - **Thiếu oxy vào ban đêm**: tảo tạo nhiều oxy ban ngày nhưng tiêu thụ oxy ban đêm. Khi tảo chết hàng loạt, oxy tụt rất nhanh. Cá thường nổi đầu, há miệng vào sáng sớm.
> - **Amoniac/nitrit tăng**: do phân và thức ăn thừa phân hủy, nhất là khi lọc sinh học yếu.
> - **pH dao động mạnh**: ban ngày pH lên cao vì tảo quang hợp, và bể đúc mới thường có pH cao do…

### algae-09 · tank · ours wins (7.75 · 4.5)

**Asked:** Bể tôi cứ khoảng ba tuần sau khi thay nước lại xanh lè và cá chết, trị sao?

**Judge:** X names the real cause (phytoplankton bloom from balcony sun with no plants, then a crash that drops oxygen and spikes ammonia) and gives ordered steps fitted to the tank. Y offers a generic checklist centred on a doubtful nitrogen-cycle theory, ignores the outdoor sun, and ends by asking for details. / Y nhận ra đúng nắng ban công, bể không cây là gốc của tảo phù du và giải thích cá chết do tảo tàn gây tụt oxy, tăng amoniac, kèm các bước khớp với bể. X chẩn đoán lệch sang chu trình nitơ, liệt kê chung chung, không dùng được thông tin bể ban công và còn gợi ý cá, ốc ăn tảo vô ích với nước xanh.

**Ours lacks:** figures. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 1 pages):

> Mình đoán nguyên nhân chính là tảo phù du nở rộ. Bể bạn đặt ngoài ban công dưới nắng tự nhiên, không có cây, không có CO₂, đáy trống nên không có gì tranh dinh dưỡng với tảo. Mỗi lần thay nước lại đưa thêm chất dinh dưỡng vào, nên khoảng ba tuần tảo lại nở. Tảo không trực tiếp giết cá, nhưng khi nó tàn hàng loạt, vi khuẩn phân hủy xác tảo làm oxy ban đêm tụt xuống, còn amoniac có thể tăng vọt. Cá chết nhiều khả năng là do hai việc này, nên cần xử lý cả hai.
> 1. Dời bể ra khỏi chỗ nắng chiếu trực tiếp, hoặc che bớt nắng; nếu có đèn thì chỉ bật 6–8 giờ mỗi ngày.
> 2. Cho cá ăn ít lại, vớt ngay xác…

**Plain** (2324 characters):

> Bể xanh lè (nước xanh do tảo đơn bào hoặc vi khuẩn bùng phát) và cá chết sau mỗi vài tuần thường có nguyên nhân liên quan đến **chu trình nitơ bị phá vỡ** hoặc **nước máy/cách thay nước**. Chu kỳ 3 tuần khá gợi ý: khi bạn thay nước hoặc vệ sinh lọc quá mạnh, vi khuẩn có lợi bị mất, amoniac/nitrit tăng, rồi tảo bùng lên khi hệ vi sinh tái lập.
> 
> ## 1. Xử lý ngay khi đang xanh và cá yếu
> - **Test nước** (amoniac NH3/NH4⁺, nitrit NO2⁻, nitrat NO3⁻, pH, nhiệt độ). Nếu amoniac hoặc nitrit > 0, đây là nguyên nhân chính làm cá chết.
> - **Thay 30–50% nước** bằng nước đã khử clo, nhiệt độ gần bằng nước b…

### algae-10 · post · plain wins (6 · 6.75)

**Asked:** Có cách nào cứu bể em không: rêu hại dạng sợi màu nâu nhỏ nhỏ bám trên lá cây, sau đó bụi nền dính đầy vào. Thả nhiều tép thì sạch ngay, nhưng bể em nuôi nhiều thần tiên, thả tép vào thì tép bị ăn hết trước cả rêu.

**Judge:** Y gives the fuller fix: it cleans the leaves, siphons the dirt, sets water-change, light and feeding routines, and offers more shrimp alternatives including bristlenose, despite some wrong fish and plant names. X is cleaner and more honest, with a useful wipe test, but it leans on a new-tank diatom assumption, barely deals with the dirt on the leaves, and gives little routine beyond otto and nerite. / Y gives a clearer diagnosis and picks the two safest shrimp substitutes, but it assumes a new tank and offers little on leaf cleaning, siphoning mulm or feeding. X has naming errors and some padding, yet its fuller plan on cleaning, water changes, light, feeding and algae eaters would help an established angelfish tank more.

**Ours lacks:** plan, figures, tank-fit. **Plain lacks:** diagnosis, too-long, tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng đây là tảo nâu (tảo silic), loại hay gặp ở bể còn mới, vì nó bám lá rồi bụi nền dính vào. Bạn lau thử: nếu lớp nâu trôi nhẹ như bùn là đúng loại này. Sợi nâu li ti mà không trôi thì có thể là loại rêu khác, nên xem lại bảng nhận biết rêu trong cẩm nang.
> 1. Chà kính, đá và lũa bằng mút hoặc bàn chải đánh răng trong buổi thay nước, và cắt bỏ lá quá rối.
> 2. Nếu bể mới set khoảng 3–4 tuần, đừng thay đổi lung tung; rêu nâu thường tự hết sau vài tuần.
> 3. Thả cá otto, loài cẩm nang ghi là ăn tảo nâu và rêu mềm; cá này hiền và thường sống được với thần tiên, bạn nên kiểm tra lại trước …

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

### algae-10 · tank · tie or split (6 · 5.5)

**Asked:** Lá cây trong bể tôi bị rêu sợi nâu bám, mà thả tép thì bị cá ăn mất, xử lý sao?

**Judge:** X recognises the angelfish, rules out shrimp, and gives a short ordered plan with a replacement algae eater and a follow-up window, though it leans on diatoms despite the \"sợi\" and ignores the angel-eats-otto risk. Y handles filament removal and offers useful nerites, but it is generic, ignores the angelfish, asks what fish they keep, and pads with a long list of options. / Y biết bể có ông tiên và dứt khoát bỏ tép, nhưng chẩn đoán nghiêng về tảo silic, chỉ dựa vào otto và không có cách xử lý nếu đúng là rêu sợi. X chung chung và không biết cá của họ, song có gỡ rêu tay, giảm đèn 6–8 tiếng, thay nước và ốc Nerite, nên giải quyết được vấn đề hơn.

**Ours lacks:** diagnosis, plan, figures. **Plain lacks:** tank-fit, too-long, figures.

**Ours** (read 1 pages, stopped at the calls limit):

> Mình đoán đây là rêu nâu (tảo silic), thường gặp khi bể còn mới, khoảng tuần thứ ba đến thứ tư sau khi set bể, hoặc khi nước máy hay cát trang trí có nhiều silicate. Mình chưa chắc 100% vì bạn ghi là rêu sợi, nên nếu sợi dài, bám chắc và không chà ra thì có thể là loại khác. Với bể của bạn, đang có một con ông tiên, nên tép thả vào sẽ bị ăn, bạn không nên thả tép nữa.
> 1. Dùng mút hoặc bàn chải đánh răng chà kính và đá trong lần vệ sinh tới, rêu nâu không bám chắc nên chà ra dễ.
> 2. Với lá cây, chà từng lá rất mất công, nên thả cá otto (Otocinclus) để dọn rêu trên lá, loài này hiền và không đụn…

**Plain** (2088 characters):

> Rêu sợi nâu thường xuất hiện khi bể dư dinh dưỡng, đèn sáng hoặc chiếu quá lâu, hoặc nước không ổn định. Bạn nên xử lý cả nguyên nhân lẫn rêu đang có.
> 
> **1. Xử lý rêu đang bám**
> - Dùng tay (đeo găng) hoặc bàn chải mềm lau, gỡ sợi rêu khỏi lá. Với rêu sợi thì gỡ bằng tay hoặc dùng que/đũa cuốn rêu rồi kéo ra.
> - Cắt bỏ những lá đã bị bám nặng, đặc biệt là lá già.
> - Nếu rêu bám quá nhiều, có thể tạm dùng H₂O₂ (oxy già) nhỏ trực tiếp lên chỗ rêu (liều thấp, dùng ống tiêm, tránh dính vào cá và cây mềm), rồi thay nước ngay sau đó. Cách này có thể làm hại cây nhỏ nên thử trước trên một lá.
> 
> **2. Giả…

### algae-11 · post · tie or split (6.75 · 6.5)

**Asked:** Nhà mình dùng nước máy làm nước bể cá. Trước ở chỗ khác, thả cá vào mấy tháng mới phải thay nước một lần. Giờ chuyển về chỗ mới, để bể không có cá (chỉ 1 con cá dọn bể) thì không sao, nhưng cứ thả cá vào chưa đến một tuần là nước chuyển sang màu xanh lá cây, xanh đậm dần rồi cá chết. Bể không, không có cây cỏ gì cả. Trước có bỏ mấy gói tăng oxy gì đó, giờ không cho cũng vẫn vậy. Bắt bệnh giúp mình với.

**Judge:** Y explains the hobbyist's actual puzzle better: why one cleaner fish was fine, how the old and new sites differ, what the oxygen packets do, and to test nitrate in the tap water. Its chloramine advice is shaky and it runs long. X is cleaner and safe with a tidy plan, but its generic new-tank diagnosis barely uses those details. / Both name the same likely causes: an uncycled tank, a green-water bloom and low oxygen at night. X ties this better to the cleaner fish and the move, but it is long, scattered and has a chloramine misstep. Y gives a short, ordered plan with what to monitor and when to act urgently, plus useful guide excerpts, though it is less tailored.

**Ours lacks:** tank-fit, figures. **Plain lacks:** too-long, local, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng bể mới chưa chạy xong chu trình nitơ, nên khi thả cá vào, amoniac và nitrit tăng lên và làm cá chết. Nước xanh là tảo phù du nở do bể mới có nhiều ánh sáng và chất dinh dưỡng dư, và tảo nở dày còn làm cạn oxy ban đêm. Mình chưa đo được nước nên đây là suy đoán từ những gì bạn kể.
> 1. Dùng bộ test nhỏ đo amoniac và nitrit; nếu cao, thay khoảng 30–50% nước bằng nước đã khử clo.
> 2. Khử clo cho nước máy trước khi đổ vào bể, làm theo hướng dẫn trên nhãn thuốc khử clo.
> 3. Bật đèn không quá 6–8 giờ mỗi ngày, dời bể khỏi chỗ nắng chiếu, và cho ăn ít lại.
> 4. Thêm vi khuẩn nitrat hóa hoặc…

**Plain** (3129 characters):

> Triệu chứng này khớp nhất với **chu trình nitơ chưa ổn định** kết hợp với **tảo nở hoa (nước xanh)**. Cá chết thường do amoniac/nitrit tăng cao hoặc thiếu oxy khi tảo bùng lên.
> 
> ## Nguyên nhân có thể
> 
> **1. Lọc sinh học chưa hoạt động tốt ở chỗ mới (khả năng cao nhất)**
> - Ở chỗ cũ, bể chạy mấy tháng nên vi khuẩn có lợi trong vật liệu lọc và thành bể đã phát triển đủ.
> - Khi chuyển đi, vi khuẩn có thể bị giảm mạnh (rửa vật liệu lọc bằng nước máy có clo, thời gian gián đoạn, hoặc bể mới setup lại).
> - Khi thả cá, chất thải làm amoniac tăng. Bể chưa đủ vi khuẩn để chuyển hóa nên amoniac và nitrit t…

### algae-11 · tank · ours wins (7 · 6)

**Asked:** Bể tôi cứ thả cá vào là chưa tới một tuần nước xanh lè rồi cá chết, vì sao?

**Judge:** X names the likely cause directly, correctly separates green water from what actually kills the fish, and gives a short ordered rescue plan with daily monitoring and warning signs. Y is sound and usefully mentions chlorine, adding plants and how to cycle, but it is more generic and textbook-like, has no what-to-watch step, and neither answer really uses the tank's details such as the oxygen packets or long gaps between water changes. / Y names the uncycled tank as the killer, correctly says green water alone doesn't kill, and gives ordered rescue steps with daily checks and gasping signs, though it barely explains how to cycle. X covers cycling, dechlorination and adding plants, which suits this bare tap-water tank by chance, but it is more scattered and has no what-to-watch; neither uses the old oxygen packets or the habit of rarely changing water.

**Ours lacks:** tank-fit, plan. **Plain lacks:** follow-up, tank-fit, too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Mình đoán nguyên nhân chính là bể mới chưa chạy xong chu trình nitơ: thả cá khi vi sinh chưa đủ nên amoniac (và nitrit) tăng vọt, cá chết vì độc. Nước xanh trong vòng một tuần thường là tảo phù du nở rộ khi bể mới có nhiều chất dinh dưỡng và đèn sáng; nước xanh tự nó chưa giết cá, nhưng ban đêm tảo lấy oxy nên có thể làm cá thiếu oxy thêm. Mình chưa biết bạn đo được gì, nên hãy làm theo các bước sau:
> 1. Đo amoniac và nitrit ngay hôm nay bằng bộ test; nếu có số trên 0 thì đó là thủ phạm chính.
> 2. Ngừng cho ăn, tắt đèn hoặc chỉ bật 6–8 giờ mỗi ngày, dời bể khỏi chỗ nắng chiếu.
> 3. Thay khoảng 30…

**Plain** (2070 characters):

> Nước xanh lè và cá chết trong vòng một tuần thường có hai nguyên nhân chính, và chúng thường đi cùng nhau:
> 
> **1. Bể chưa chu trình nitơ (chưa "chín bể") – nguyên nhân hay gặp nhất**
> - Cá thải ra **amoniac (NH₃)** qua mang, phân và thức ăn thừa. Amoniac rất độc.
> - Bình thường, vi khuẩn có lợi trong bể sẽ chuyển amoniac → **nitrit (NO₂⁻)** → **nitrat (NO₃⁻)** ít độc hơn. Bể mới chưa có đủ vi khuẩn này nên amoniac và nitrit tích tụ, làm cá bị ngộ độc, mang bị tổn thương và chết.
> - Amoniac và nitrat dư cũng là "thức ăn" cho tảo, nên tảo bùng nổ và làm nước xanh.
> 
> **2. Tảo đơn bào nở hoa (nước xan…

### setup-01 · post · plain wins (5 · 7.75)

**Asked:** Vợ em vừa bắt em đầu tư một bể thủy sinh, em đặt mua trọn bộ: bể dài 1m + chân gỗ + sục + lọc + đèn (2 bóng LED) + sưởi. Em ở Hà Nội, trời đang lạnh. Em mù mờ khoản này nên hỏi: 1) Bên setup bảo bật đèn liên tục 3 ngày đầu rồi khoảng 8h/ngày, nhưng em đọc trên mạng thì tuần đầu chỉ bật 50% công suất rồi tăng dần lên 100%, 8h/ngày để tránh rêu và cho cây thích nghi. Cách nào đúng? 2) Cho cá ăn tần suất thế nào? 3) Sưởi có nên bật 24/24 không? 4) Có nên mua thêm bình CO2 không, vì em thấy phải có cái này cây mới đủ chất? 5) Lọc họ trang bị chỉ qua sợi bông đơn giản, em đọc thấy phải lọc qua sứ, mà lọc ngoài thì không có chỗ đặt vì bể dùng chân gỗ, không có tủ. Lọc như của em có ổn không? 6) Nên thay nước mấy ngày một lần, lúc mới setup và lúc đã ổn định?

**Judge:** Y trả lời đủ cả sáu câu, nói rõ nên cắm sưởi 24/24, đưa phương án lọc treo hoặc lọc bọt biển cho bể không có tủ và có lịch thay nước khi bể đã ổn định, dù khuyên thay ít nước lúc đầu chưa ổn. X có lịch tuần đầu gọn và hợp bể thủy sinh, nhưng sai ý về sưởi, bỏ sót lịch thay nước khi ổn định, câu lọc còn lấp lửng và không giải quyết chuyện không có chỗ đặt lọc. / X trả lời đủ cả 6 câu, có số giờ đèn, nhiệt độ, lịch thay nước, cách xử lý lọc khi không có tủ và khuyên test nước trước khi thả cá. Y bác rõ việc bật đèn 3 ngày và có kế hoạch ngắn gọn, nhưng khuyên sai về sưởi, bỏ sót lịch thay nước khi bể đã ổn định, trả lời lọc và CO2 sơ sài, lại hay viện dẫn \"cẩm nang\".

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nói thẳng: bên setup bảo bật liên tục 3 ngày rồi 8 tiếng không đúng với cẩm nang, và dễ sinh rêu hơn. Cẩm nang khuyên bật 6 tiếng mỗi ngày với giờ cố định, rồi tăng lên 8 tiếng liền một mạch khi cây ra lá mới. Cách giảm 50% công suất tuần đầu là cách của một số người, cẩm nang không nêu; nếu đèn chỉnh được mức thì bạn cứ làm, nhưng quan trọng nhất là giờ bật đều mỗi ngày.
> 1. Cài hẹn giờ đèn 6 tiếng mỗi ngày, bật cố định, không bật liên tục.
> 2. Khi cây ra lá mới (thường vài ngày đến 10 ngày), tăng lên 8 tiếng liền một mạch.
> 3. Trong 10 ngày đầu, thay 30–50% nước mỗi ngày hoặc cách ngày, v…

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

### setup-01 · tank · tie or split (6.25 · 5.75)

**Asked:** Bể mới mua của tôi nên bật đèn, sưởi, thay nước thế nào và có cần mua thêm CO2 không?

**Judge:** X gọn, có thứ tự và trả lời thẳng là chưa cần mua CO2, nhưng phần sưởi và thay nước còn mỏng, lại thiếu thời gian cycling. Y dài và chung chung, song đủ hơn cho bể mới mùa lạnh: 3–6 tuần cycling, 1W/lít và tăng thêm nếu phòng lạnh, chỉ cắm sưởi khi đã ngập nước, nước thay gần bằng nhiệt độ bể, cùng các lựa chọn CO2; cả hai đều không dùng chi tiết bể 1m ở Hà Nội. / Y trả lời ngắn gọn, theo thứ tự, kết luận rõ chưa cần mua CO2, có giờ đèn, nhiệt độ, % thay nước và mốc kiểm tra, lại nói thẳng phần nào chỉ là kinh nghiệm chung; X đúng phần lớn nhưng là hướng dẫn chung dài dòng, CO2 chỉ nói tùy kiểu bể. Cả hai đều không dùng chi tiết bể 1m, Hà Nội mùa lạnh, lọc bông và 2 bóng LED, cũng không trả lời trực tiếp băn khoăn bật đèn 3 ngày liền hay tăng dần.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, follow-up, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể mới, mình sẽ làm theo thứ tự: chạy nước và chu trình trước, rồi mới tính đến đèn chi tiết và CO2. Phần cẩm nang mình đọc được nói rõ về chu trình nitơ, CO2 và thời gian chiếu sáng, còn phần sưởi và thay nước thì mình chưa đọc được trang nào nên phần đó là kinh nghiệm chung.
> 1. Lắp bể, đổ nước đã khử clo, lắp lọc và sưởi, rồi để chạy vài ngày trước khi thả bất cứ con cá nào.
> 2. Sưởi: cài nhiệt theo loài cá bạn định nuôi, thường khoảng 24–26°C với cá nhiệt đới, và đo bằng nhiệt kế để chắc chắn.
> 3. Đèn: bắt đầu khoảng 6–8 giờ mỗi ngày, rồi tăng dần lên 8–10 giờ khi cây đã lên; cẩm nang kh…

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

### setup-02 · post · plain wins (4.5 · 6.5)

**Asked:** Mình đang gom đồ để set hồ 60x40x40 chơi rêu taiwan, trân châu ngọc trai, la hán và ráy, bố cục bonsai. Phân nền dùng Gex xanh. Tư vấn giúp mình nên mua đèn và lọc loại nào?

**Judge:** Y directly answers what to buy, with wattage, flow, Kelvin and named models for this 96 L tank, despite an oversized Sunsun pick and some shaky brand claims. X is cleaner and safer, but it names no products, gives no filter flow figure, and skips trân châu and la hán, leaving the buying question largely unanswered. / X trả lời đúng câu hỏi mua gì, có công suất, lưu lượng và tên hãng dù vài gợi ý sai về giá hoặc lưu lượng. Y gọn và thận trọng hơn nhưng không nêu sản phẩm nào, phần lọc rất chung chung và bỏ ngỏ trân châu, la hán, nên khó dùng để đi mua đồ.

**Ours lacks:** too-thin, tank-fit, figures, local. **Plain lacks:** follow-up, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Với bố cục bonsai, rêu Taiwan và ráy đều là cây ánh sáng yếu, nên bạn không cần đèn quá mạnh. Cẩm nang khuyên dùng đèn LED, bật khoảng 8 tiếng mỗi ngày và không quá 10 tiếng. Phần lọc cẩm nang chưa trả lời cụ thể, nên mình nói theo kinh nghiệm chung.
> 1. Chọn đèn LED có tổng lumen khoảng 3.800, vì bể 60x40x40 khoảng 96 lít nhân 40 ra con số này; ưu tiên loại RGB.
> 2. Đặt bật tắt đèn bằng timer, mỗi ngày khoảng 8 tiếng.
> 3. Chọn lọc thùng hoặc lọc treo sau có lưu lượng vừa phải, có núm chỉnh dòng để rêu Taiwan không bị thổi bật khỏi lũa hay đá.
> 4. Buộc rêu Taiwan và ráy lên lũa hoặc đá, không chô…

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

### setup-02 · tank · tie or split (5.25 · 5)

**Asked:** Bể tôi sắp set nên mua đèn và lọc loại nào?

**Judge:** Cả hai đều không dùng thông tin bể và đều hỏi lại, nhưng Y cho khung chọn lọc theo số lít, kèm hãng, lưu lượng, giờ đèn và thời gian chạy vi sinh, nên người chơi có thể đi mua ngay dù gợi ý lọc treo cho 96 lít chưa tối ưu. X có định hướng lọc đúng hơn (ưu tiên vật liệu) và cách tính đèn, số máng hữu ích, nhưng không chốt được nên mua loại lọc nào. / Both ignore the tank's details and ask for its size, but Y's light formula, tray-width check, white-LED advice for green plants and emphasis on filter media lead this 96 L tank to a better setup. X is tidier and adds a timer and cycling time, but its size bands steer this tank to a hang-on-back filter.

**Ours lacks:** tank-fit, plan, follow-up, figures. **Plain lacks:** tank-fit, plan.

**Ours** (read 4 pages, stopped at the tools limit):

> Mình cần biết kích thước bể (dài x rộng x cao, cm) và bạn định trồng cây hay chỉ nuôi cá để chọn đúng đèn và lọc. Trong lúc chờ, cẩm nang gợi ý như sau. Đèn: tính số lít nước rồi nhân với 0,5 đến 1 W mỗi lít, ví dụ bể 60x30x30 cm (khoảng 54 lít) cần khoảng 27 đến 54 W. Chọn đèn LED nhiệt độ màu 6500K đến 10000K, ưu tiên thương hiệu uy tín dù là dòng rẻ. Bể rộng thì đo chiều rộng để biết cần một hay hai máng đèn. Nếu chỉ trồng cây xanh thì LED trắng là đủ; muốn cây đỏ lên màu thì dùng LED RGB hoặc WRGB. Lọc: bể nào cũng cần lọc cơ học và lọc sinh học, nên chọn lọc có nhiều vật liệu, vì lưu lượ…

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

**Judge:** Y gives a budget split, a gentle sponge filter, named easy plants and tiny schooling fish, cycling checks and a week-by-week plan, so it directly answers the 3-4 million question. X is generic, gives no prices or species, recommends a strong filter and treats the hobbyist's existing tank as a size choice, leaving them without the fish and budget help they asked for. / X chia ngân sách rõ từng hạng mục, chọn lọc bọt biển hợp cá nhỏ, nêu tên cây và cá cụ thể, có lộ trình chạy bể theo tuần với đo amoniac/nitrit, chỉ vướng vài lỗi nhỏ về tên cá. Y quá mỏng: không chia 3-4 triệu, không gợi ý loài cá nào dù bạn này đã nói thích cá nhỏ, lại đẩy tiền vào sưởi và lọc 400 lít/giờ khá mạnh cho cá tí hon.

**Ours lacks:** figures, tank-fit, too-thin. **Plain lacks:** local.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể để trống lâu thì phần đáng giữ nhất thường là kính và keo silicone, nên việc đầu tiên là kiểm tra chúng. Với 3–4 triệu, mình sẽ làm một bể low-tech cỡ 35–55 lít, không viền, trồng vài loại cây dễ rồi mới thả cá nhỏ. Phần lớn tiền sẽ đi vào đèn, lọc và sưởi; giá cụ thể tùy cửa hàng, mình chỉ ước chừng theo kinh nghiệm chung.
> 1. Kiểm tra kính và keo silicone; nếu không rò thì rửa bể bằng nước sạch, không dùng xà phòng.
> 2. Mua đèn đúng chiều dài bể, lọc trong khoảng 400 lít/giờ cho bể 35–55 lít, và sưởi cố định khoảng 50 W giữ 25°C.
> 3. Trồng 3–5 loại cây dễ, giai đoạn đầu để đèn yếu và châm p…

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

**Judge:** Y answers the budget question directly with a priced shopping list, named fish, a conditional heater recommendation and cycling advice, despite some plant and shrimp missteps. X has a tidier order and safer basics, but gives no budget split, names no fish or plants, and says little about how to spend 3-4 triệu. / X trả lời đúng câu hỏi bằng danh sách đồ có giá ước tính khớp ngân sách, gợi ý loài cá và cây, nhắc chạy bể 2-4 tuần, dù có vài gợi ý loài chưa chuẩn. Y có thứ tự mua rõ và ít lỗi hơn nhưng không phân bổ tiền, không nêu loài cá hay cây cụ thể, lại dựa vào cỡ bể 35-55 lít trong khi chưa biết bể của họ.

**Ours lacks:** figures, tank-fit, too-thin, local. **Plain lacks:** plan, follow-up.

**Ours** (read 2 pages):

> Với bể trống và ngân sách 3-4 triệu, bạn nên chi phần lớn cho đèn, lọc và sưởi, vì đó là ba thứ quyết định cá và cây sống ổn định. Cẩm nang khuyên người mới bắt đầu bằng bể 35-55 lít không viền, nền trơ như sỏi hoặc cát hạt thô, và cây dễ trồng. Bạn cho mình biết kích thước bể trống (dài, rộng, cao) để mình chọn đúng cỡ đèn và lọc, và chọn loài cá phù hợp.
> 1. Đo bể và kiểm tra kệ có chịu được sức nặng (bể đầy nước, nền, đồ trang trí nặng khoảng 1,2 kg mỗi lít), rồi chọn đèn LED thủy sinh đúng chiều dài bể, kèm bộ hẹn giờ.
> 2. Mua lọc trong giá rẻ, lưu lượng khoảng 400 lít/giờ là đủ cho bể 55 l…

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

### setup-04 · post · plain wins (5.5 · 8)

**Asked:** Mình muốn set hồ 60x36x36 để trên kệ tivi phòng khách chung cư nên cần tinh gọn, không có chỗ cho bình CO2, thùng lọc. Phương án của mình: bố cục đá Tiger + rêu mini fiss và ráy lá nhỏ ở tiền cảnh, rong La Hán + dương xỉ Java ở hậu cảnh, đều là cây cần ít CO2. Mình tính dùng lọc thác. Bố cục vậy có ổn không, nên dùng nền nào và bao nhiêu?

**Judge:** Y chọn nền theo đúng danh sách cây: cây bám đá gần như không cần nền, chỉ dùng nền dinh dưỡng nếu trồng La Hán ở gốc. Y còn nêu rủi ro của cây thân khi không CO2, cho số đèn, lưu lượng lọc và cảnh báo tải kệ tivi rõ ràng. X gọn nhưng mặc định aquasoil dày, xen lời xin lỗi về việc chưa đọc được cẩm nang và thiếu số liệu lọc, đèn. / X đánh giá từng cây, nói rõ rong La Hán không CO2 sẽ yếu hơn, chọn nền theo việc có trồng gốc hay không, có số liệu về nền, đèn, lưu lượng lọc và cảnh báo tải kệ TV. Y gọn và đúng hướng nhưng mỏng, chèn lời xin lỗi về cẩm nang, không đánh giá La Hán và thiếu số liệu đèn, lọc.

**Ours lacks:** tank-fit, diagnosis, figures, too-thin. **Plain lacks:** too-long, follow-up.

**Ours** (read 0 pages, stopped at the tools limit):

> Bố cục của bạn hợp với low-tech: đá Tiger, rêu Fissidens, ráy lá nhỏ và dương xỉ Java đều chịu ánh sáng vừa và ít CO2. Lần này mình chưa đọc được nội dung chi tiết các trang hướng dẫn low-tech, so sánh nền và trang cây, nên phần nền, số lượng và cách đặt dưới đây là kinh nghiệm chung của mình, chưa phải từ cẩm nang. Mình cũng chưa tìm thấy trang riêng cho rong La Hán, bạn cho mình tên khoa học hoặc ảnh để xác nhận loài đó có hợp low-tech không.
> 1. Nền: dùng aquasoil hoặc đất nền phủ sỏi, phía sau dày khoảng 4-5 cm và mỏng dần về phía trước. Với đáy 60x36 cm, 5 cm nền cần khoảng 10-11 lít, bạn…

**Plain** (3463 characters):

> **Nhìn chung phương án ổn**, đặc biệt với hồ 60x36x36 (khoảng 78 lít) và yêu cầu gọn nhẹ. Các cây bạn chọn đều chịu được ánh sáng thấp và CO2 thấp, không cần bình CO2 hay thùng lọc.
> 
> ## 1. Bố cục và cây
> 
> - **Đá Tiger**: hợp lý, bền, không làm đổi pH đáng kể. Nên đặt đá lệch một bên, cao dần về hậu cảnh để tạo chiều sâu.
> - **Rêu Fissidens mini và ráy lá nhỏ (Anubias nana) ở tiền cảnh**: ổn. Cả hai đều bám trên đá hoặc gỗ, không cần nền dinh dưỡng. Buộc hoặc keo (loại an toàn cho cá) ráy lên đá, **không vùi thân rễ xuống nền**, nếu không sẽ thối. Fissidens mini hơi khó giữ hơn, cần nước sạch, í…

### setup-04 · tank · ours wins (7.75 · 3)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu, và chọn cây như vậy có ổn không?

**Judge:** X đánh giá đúng bộ cây của bể 60×36 không CO₂, đưa lựa chọn nền kèm độ dày và số kg hợp lý, dặn gắn ráy và dương xỉ lên đá, và nói rõ cần theo dõi gì. Y hỏi lại những thông tin app đã có rồi chỉ nói chung chung, dùng ví dụ sai kích thước và nêu cây thảm không liên quan. / Y judges the actual plant list for a no-CO₂ 60×36×36 tank, gives substrate options with a checkable 18 kg for about 5 cm, says to attach ráy and fern to hardscape, and says what to monitor. X asks for details the app already holds, uses a 60×30 example and gives only generic advice, including carpet plants the hobbyist isn't growing.

**Ours lacks:** –. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 4 pages, stopped at the tools limit):

> Với bể 60x36x36 cm, không CO2, đặt trên kệ tivi, mình thấy hướng chọn cây của bạn ổn. Ráy, dương xỉ Java và rêu mini đều chịu ánh sáng vừa và không cần CO2, nên hợp với bể này. Rong La Hán thì lên chậm và dễ tàn nếu thiếu sáng hoặc dinh dưỡng, nên bạn cần theo dõi nó. Về nền, cẩm nang nói nền không phải điều kiện quyết định: ráy, dương xỉ và rêu vẫn sống tốt mà không cần nền giàu dinh dưỡng, còn nền dinh dưỡng thì giúp cây lên nhanh nhưng làm pH và KH giảm trong vài tuần đầu. Lượng nền thì cẩm nang chưa ghi cho kích thước này, nên phần này là kinh nghiệm chung của mình.
> 1. Nếu muốn tiết kiệm …

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

### setup-05 · post · plain wins (5 · 7.25)

**Asked:** Em định set hồ 1m2x50x50 phong cách natural, chủ yếu rêu, ráy với ít cây cắt cắm lá đỏ. Nên chọn nền thế nào, bao nhiêu kg cho phù hợp và kinh tế? Em tính xài nền trộn kết hợp Aquafor thì ổn không? Đèn em xài T5HO, 2 bóng 10k, 1 bóng 6k5, 1 bóng hồng có hợp lý không?

**Judge:** Y trả lời đủ cả ba ý: cấu trúc nền có dốc, số kg từng lớp kèm cách tiết kiệm, đánh giá dàn 4 bóng và cảnh báo rêu hại, giảm bóng hoặc giờ đèn nếu không có CO₂. X mỏng hơn, hay dẫn lại \"cẩm nang\", bắt người hỏi tự cộng W, không nói đến CO₂ và không đưa ra kết luận rõ về nền trộn cho hồ này. / X gives a usable substrate plan with layer depths, kg amounts, a way to save money, and a clear verdict on the 4-tube light tied to CO₂ and photoperiod. Y is thin and handbook-driven, leaves the light calculation to the hobbyist, and never addresses CO₂ for the red plants, though it does warn sensibly that mixed substrate can leach.

**Ours lacks:** tank-fit, too-thin, figures. **Plain lacks:** plan, local, follow-up.

**Ours** (read 4 pages, stopped at the tools limit):

> Mình tính sơ bộ cho bể 120x50x50 (khoảng 300 lít). Với đèn, nếu 3 bóng 10k và 6k5 là T5HO thì ổn, còn bóng hồng nên coi là phụ, vì nó chủ yếu thêm màu đỏ, không đủ để làm chính. Bạn cộng tổng công suất các bóng, mục tiêu khoảng 0,5–1 W mỗi lít, tức khoảng 150–300 W. Handbook không ghi rõ T5HO bao nhiêu W, nên bạn kiểm tra thông số trên bóng để tính. Cẩm nang cũng ghi máng đèn treo thường chiếu được bể rộng khoảng 40–50 cm, nên bể 50 cm của bạn vừa một máng; hãy chọn máng đủ dài và đặt bóng đều.
> 
> Về nền, cẩm nang nói người mới nên dùng phân nền công nghiệp vì đổ vào là trồng được; nền tự trộn …

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

**Judge:** X uses the 120×50×50 tank to give a sensible 25–30 kg estimate, says the 4 T5HO tubes are only enough with CO₂ or paler reds, and warns about ammonia, though it skips the planned mixed substrate and the tube mix. Y asks for details already held, uses a 60×30 example, and never answers for this tank. / Y dùng đúng bể 120×50×50 (khoảng 300 lít), cho 25–30 kg nền hợp lý và kết luận 4 bóng T5HO chỉ đủ nếu có CO₂ hoặc chấp nhận đỏ nhạt, dù chưa bàn kỹ nền trộn, Aquafor và bóng hồng. X hỏi lại những thông tin app đã có, chỉ đưa công thức và ví dụ bể 60×30 không liên quan nên không trả lời được cho bể này.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể của bạn lưu là 120x50x50 cm, khoảng 300 lít, nên mình ước lượng theo kích thước đó. Với bể trồng cây, nền phù hợp nhất là phân nền aqua soil, đổ thẳng vào bể không cần rửa. Cây đỏ cần đèn đủ mạnh và thường phải có CO₂, nên 4 bóng T5HO của bạn ở mức trung bình khá, chỉ đủ nếu bạn có châm CO₂ hoặc chấp nhận màu đỏ nhạt hơn.
> 1. Dùng phân nền chất lượng tốt, lót lớp dày khoảng 5 cm ở phía sau và 3 cm ở phía trước; mình ước tính cần khoảng 25–30 kg cho cả bể (ước lượng từ kinh nghiệm, không lấy từ handbook).
> 2. Nếu bạn định trộn thêm Aquafor hay bất kỳ chế phẩm nào, làm theo đúng hướng dẫn trên…

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

### setup-06 · post · plain wins (5 · 7)

**Asked:** Em đang set hồ 60x30x36, bố cục lũa đá nature. Cốt nền JBL Aquabasic Plus 1 bao (2,5 lít), phân nền Aquafor 2,5 bao (7,5 lít), quây phần nền bằng đá cuội. Cây dự kiến: rêu, ráy, ít bucep, dương xỉ, hậu cảnh cắt cắm táo lớn, hồng thái dương. Phần trống mặt tiền có nên trải sạn hoặc cát không? Với bố cục và kích thước này nên dùng máng Odyssea 2 bóng hay 4 bóng?

**Judge:** Y gives a clear choice (fine sand, 4 bulbs with CO₂ or good fertilising, 2 bulbs for low-tech) with practical sand and lighting tips tied to the listed plants, despite a dimension slip and some padding. X is honest but hedged and thin, with awkward handbook talk and no firm lighting decision; both wrongly suggest sand as a cap over the soil. / X makes clear choices: fine sand at the front, built after the pebble edge, and 4 lamps if using CO₂ or good fertilising, or 2 for low-tech, with reasons tied to each plant and a photoperiod, despite a depth/height slip. Y is honest and concise but hedges on sand versus gravel, spends words on what the handbook lacks, and gives few concrete steps.

**Ours lacks:** too-thin, tank-fit, figures, plan. **Plain lacks:** too-long, follow-up.

**Ours** (read 1 pages, stopped at the tools limit):

> Về phần trống mặt tiền, handbook mình chưa tìm được trang nào nói về việc trải sạn hay cát trên nền đất, nên phần này là kinh nghiệm chung của người chơi. Với lớp Aquabasic và Aquafor bên dưới, bạn có thể phủ ở mặt tiền một lớp sạn hoặc cát mịn mỏng khoảng 1 đến 2 cm để nền dinh dưỡng ít bị trôi và nước ít đục. Cát mịn nhìn gọn hơn, sạn nhỏ dễ cắm cây thấp hơn. Đừng trải quá dày, vì cây thấp sẽ khó bám rễ.
> 
> Về máng đèn, handbook có trang về cách chọn đèn cho bể thủy sinh nước ngọt, gồm phần cường độ sáng và độ lan tỏa, nhưng mình chưa mở được thông số riêng của Odyssea. Theo kinh nghiệm chung…

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

### setup-06 · tank · plain wins (4.75 · 5.75)

**Asked:** Bể thủy sinh tôi đang set có nên trải sạn mặt tiền không, và cần đèn mấy bóng?

**Judge:** Neither answer uses the hobbyist's setup or settles Odyssea 2 vs 4 bulbs, but Y gives a clear yes on front gravel, slope heights, a way to keep gravel from sinking into soil, a W/L table by tank type, 30–40 W for a 60×30×36 tank, and 6–8 light hours. X is honest and sourced, but thinner, uses a 30 cm-high example, and gives a broad 0.5–1 W/L with little guidance on what to do. / Cả hai đều không đọc được bể và không chốt 2 hay 4 bóng, nhưng X trả lời thẳng là nên trải, có cách làm cụ thể, có đúng ví dụ 60×30×36 cm (30–40 W) và giờ chiếu sáng, dù lan man sang bể to và cá đào bới. Y gọn và trung thực về giới hạn nguồn, có ý nền giàu dinh dưỡng chỉ đặt quanh cây rất hợp với bể này, nhưng ví dụ lệch kích thước và ít việc cụ thể để làm.

**Ours lacks:** tank-fit, figures, too-thin, plan. **Plain lacks:** tank-fit, too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Mình chưa có trang nào trong cẩm nang nói riêng về việc trải sạn ở phía trước (mặt tiền) nên cẩm nang chưa trả lời trọn vẹn câu này. Theo kinh nghiệm chung, bạn có thể làm đáy dốc nhẹ, cao phía sau và thấp phía trước, rồi rải lớp sạn hoặc cát mịn đều ở mặt tiền để nhìn gọn và dễ hút đáy. Cẩm nang khuyên dùng loại nền rẻ, trông tự nhiên cho phần không trồng nhiều cây, còn nền giàu dinh dưỡng chỉ nên dùng quanh chỗ cây cần nó.
> 
> Về đèn, cẩm nang tính theo công suất: với người mới, lấy 0,5 đến 1 W cho mỗi lít nước. Cách tính: dài × rộng × cao (cm) chia cho 1000 ra số lít. Ví dụ bể 60 × 30 × 30 cm…

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

### setup-07 · post · not judged

**Asked:** Cửa sổ nhà em bị bít nên em tháo ra, được một hõm sâu 20cm, cao 90cm, dài 100cm, em định làm bể cá âm vào đó kiểu bán cạn: hồ kính dài 90cm (chừa 10cm bố trí lọc), sâu 20cm, cao 50cm (mực nước 40cm), đèn 90cm treo phía trên. Thả 1 cục lũa cao hơn mặt nước, xếp ít đá xung quanh, phía sau trải nền trồng cây dễ sống, phía trước trải cát, trồng thêm ít cây vượt mặt nước như dương xỉ, cỏ đồng tiền, khoai lang. Cá nuôi tầm 10 con bảy màu, ít con bống dọn bể. Lọc em định dùng 1 lọc thác 8W và 1 lọc vi sinh (chạy bằng bơm oxy) với vật liệu lọc là sứ vì nuôi ít cá. Các cụ góp ý giúp em.

**Ours** (read 4 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (4665 characters):

> Ý tưởng tận dụng hõm cửa sổ làm bể bán cạn rất hay, và kích thước của em khá hợp lý. Em nên kiểm tra kỹ một số điểm trước khi làm.
> 
> ## 1. Kết cấu và chịu tải (quan trọng nhất)
> 
> - **Khối lượng:** Nước 90×20×40 cm ≈ **72 lít ≈ 72 kg**. Cộng thêm kính, nền cát, đá, lũa và cây thì tổng khoảng **90–110 kg**. Em cần chắc rằng phần tường và lanh tô phía trên hõm chịu được tải này, đặc biệt nếu hõm là chỗ cũ của khung cửa sổ.
> - **Đáy hõm:** Phải phẳng và chắc, nên trát lại bằng vữa để đáy bể đặt đều. Nếu đáy lệch, kính dễ nứt.
> - **Chống thấm:** Trong hõm nên quét chống thấm trước khi đặt bể. Nếu nước…

### setup-07 · tank · ours wins (6.5 · 2)

**Asked:** Kế hoạch lọc, cây và cá cho bể tôi định làm như vậy có ổn không?

**Judge:** X dùng đúng thông số bể đã lưu, chỉ ra lọc là điểm cần xem và đưa ra các bước theo thứ tự, dù chưa xử lý kỹ chuyện nắng hốc cửa sổ và chi tiết cây. Y không đọc được bể, chủ yếu hỏi lại và chỉ cho lời khuyên chung áp dụng cho bể nào cũng được. / Y reads the saved tank and gives a usable verdict and ordered steps, though its filter worry is shaky and it says little about window sun and heat. X claims no plan was sent, asks for details the app already holds, and offers only generic tips.

**Ours lacks:** tank-fit, figures. **Plain lacks:** asks-only, tank-fit, plan.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình xem bể đã lưu của bạn: 90×20×50 cm, mực nước 40 cm, 10 cá bảy màu và 1 bống dọn bể, cùng cây dễ sống, dương xỉ, cỏ đồng tiền và khoai lang. Phần cá đang ổn: cẩm nang tính mật độ là 66%, mức vừa phải. Chỗ mình lo nhất là lọc. Một lọc thác 8W cộng lọc vi sinh chạy bơm oxy có vẻ còn yếu cho khoảng 72 lít nước. Cẩm nang nói dung lượng và loại vật liệu quan trọng hơn lưu lượng, nên bạn nên kiểm tra vật liệu trong lọc trước. Theo kinh nghiệm chung của mình (không phải từ cẩm nang), tổng lưu lượng thường nên khoảng 5 đến 10 lần thể tích nước mỗi giờ. Cẩm nang không có trang riêng cho bống dọn b…

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

### setup-08 · post · ours wins (6 · 5)

**Asked:** Mình đang có bể dán 60x45x45, kính 5 ly. Bể vậy có mỏng quá không? Tư vấn giúp mình độ dày nền, các phụ kiện cần có và nên nuôi loại cá nào để có bể thủy sinh hợp lý. Kinh phí mình cũng không được nhiều lắm.

**Judge:** Y is more complete and easier to act on, with concrete figures for substrate, light and cycling, but it wrongly assures the hobbyist that 5 mm glass is safe and adds some poor fish advice. X is thinner and avoids a verdict on the glass, yet it prompts safety checks, links the guide, and gives a sound low-tech plan with compatible fish. / X đầy đủ và dễ làm theo hơn, nhưng lại khẳng định sai rằng kính 5 ly là an toàn cho bể cao 45 cm, đúng câu hỏi quan trọng nhất và có nguy cơ bục bể, kèm vài tên cá sai. Y không chốt được độ dày và khá mỏng về số liệu, nhưng cảnh báo đúng hướng, có trích cẩm nang về độ dày kính, và lời khuyên về nền, phụ kiện, cá đều an toàn.

**Ours lacks:** figures, plan, too-thin. **Plain lacks:** wrong, too-long, tank-fit, unsafe, local.

**Ours** (read 4 pages, stopped at the tools limit):

> Bể 60x45x45 (khoảng 120 lít) là cỡ rất hợp để chơi thủy sinh, và ngân sách vừa phải vẫn làm được. Về kính 5 ly, cẩm nang mình đọc tới chỉ nói chung là bể dùng kính mỏng so với thể tích nước sẽ dễ phình thành, nhưng chưa ghi con số an toàn cho cỡ bể này, nên mình chưa đưa ra kết luận chắc về độ dày. Khi đã đầy nước, nền và đá, bạn nên kiểm tra các mối dán có đều không, thành có phình không và có chân đỡ chắc chắn không. Nếu bể cao 45 cm mà kính thành mỏng, nhiều người chọn thêm nẹp hoặc đổi sang kính dày hơn khi làm bố cục nặng.
> Nền: với bể cây sống, bạn nên trải lớp nền khoảng 4 đến 6 cm (đây…

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

### setup-08 · tank · plain wins (4 · 6.25)

**Asked:** Tôi có sẵn bể, cần mua gì và nuôi cá gì để làm bể thủy sinh tiết kiệm?

**Judge:** Neither uses the real 120 L size, and X's filter and heater sizing would be too small for it. Y gives a fuller and more useful budget guide, with skip-list, fish, cycling, water changes and rough cost, despite some plant and detail errors. / Cả hai đều không biết bể 120 lít kính 5 ly, nhưng X trả lời đủ cần mua gì, cây, cá, chu trình nitơ, thay nước và chi phí ước tính, nên dùng được ngay. Y có thứ tự nhưng cấu hình theo bể 35–55 lít bị thiếu cho bể thật, phần cá sơ sài và không nhắc chờ chu trình trước khi thả cá.

**Ours lacks:** tank-fit, follow-up, too-thin. **Plain lacks:** tank-fit, plan, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Bạn chưa cho mình biết kích thước bể, nên mình gợi ý theo bể 35–55 lít, cỡ dễ bắt đầu nhất theo cẩm nang. Với bể có sẵn, cách tiết kiệm là dùng bể không viền, lọc trong giá rẻ, sưởi cố định và nền trơ, rồi chọn cây dễ sống. Cẩm nang chưa có danh sách cá riêng cho bể tiết kiệm nên phần cá là kinh nghiệm chung của mình.
> 1. Đo bể và kệ, kiểm tra kệ chịu được sức nặng (bể có thể nặng gần 1,2 kg mỗi lít khi đầy đủ đồ).
> 2. Mua đèn LED đúng chiều dài bể, kèm bộ hẹn giờ để ánh sáng đều mỗi ngày và rêu khó bùng.
> 3. Mua lọc trong khoảng 400 lít/giờ (ví dụ Superfish AquaFlow 200), đủ cho bể 55 lít, và s…

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

### setup-09 · post · plain wins (5.75 · 7)

**Asked:** Em có cái hộc giá sách, định làm bể dài 170x30x35, mặt trước kính siêu trong để vào đó. Layout đơn giản: nền cát và cuội hoặc đá, thêm ít lũa và ráy; cá thì loại size nhỏ dễ nuôi, ít tốn công chăm và ít thay nước. Em định dùng lọc thùng, với size bể này có phù hợp không? Em định dặn bên làm bể chừa lỗ chờ cho lọc ở 2 đầu bể.

**Judge:** Y trả lời trực tiếp chuyện lỗ chờ, công suất lọc, cá và ráy nên sát kế hoạch của bạn này hơn, dù vị trí lỗ hút sát đáy không hợp với nền cát. X an toàn và có mẹo hay (khay hứng, van khóa, chạy thử) nhưng nói rất ít về vị trí lỗ và bỏ qua cá lẫn layout. / X answers the filter question with usable flow figures, explains how to place the inlet and outlet for a 170 cm tank, and covers fish and water changes, despite a too-low inlet and a filter timer slip. Y has useful practical tips on valves, a drip tray, waterproofing and a leak test, but it undersizes the filter, says nothing about flow along the tank, and skips stocking.

**Ours lacks:** tank-fit, too-thin, figures. **Plain lacks:** too-long, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Lọc thùng cho bể khoảng 178 lít (170 x 30 x 35 cm) là hợp lý. Tuy vậy, cẩm nang chưa có trang nào nói riêng về bể âm trong hộc giá sách, nên phần làm hộc mình nói theo kinh nghiệm chung, không phải theo một hướng dẫn cụ thể.
> 1. Chọn lọc thùng theo lượng vật liệu lọc chứ không theo lưu lượng: cẩm nang nói vật liệu quyết định độ mạnh của máy. Với bể này, chọn máy ghi khoảng 400 lít trở lên là thoải mái, vì cẩm nang đề nghị chỉ lấy một nửa con số hãng ghi cho bể dùng được.
> 2. Đặt thùng lọc trong một ngăn riêng dưới đáy hộc, có khay hứng nước và cửa mở được để kéo lọc ra vệ sinh. Cẩm nang cho biế…

**Plain** (2866 characters):

> Bể 170×30×35 cm, khoảng 178 lít tổng, nên đủ rộng để nuôi cá nhỏ đẹp. **Lọc thùng rất hợp** với kích thước này, thậm chí là lựa chọn tốt nhất trong các loại lọc thường dùng, vì bể dài và sâu nên cần lưu lượng lớn và bể ít tốn chỗ cho lọc.
> 
> **1. Chọn công suất lọc**
> - Với bể cá nhỏ, nên lọc đảo nước khoảng **6–8 lần/giờ** (tổng thể tích bể) cho cá nhỏ, và có nhiều cây thì vẫn tốt.
> - Tức là khoảng **1000–1400 L/h** là hợp lý. Chọn thùng có công suất thực tế (không chỉ ghi trên hộp) khoảng 1000 L/h trở lên, loại có thể chỉnh lưu lượng.
> - Có thể dùng thùng cỡ vừa đến lớn (ví dụ dòng Sunsun, Eheim…

### setup-09 · tank · plain wins (3.5 · 5.5)

**Asked:** Bể tôi định làm dùng lọc thùng có hợp không, và nuôi cá gì cho ít phải chăm?

**Judge:** Cả hai đều bỏ qua bể dài hẹp đặt trong hộc giá sách và lỗ lọc ở 2 đầu. Y vẫn trả lời được cả hai câu hỏi với ngưỡng dung tích, lưu lượng, danh sách cá và cách giữ bể ổn định, dù dàn trải và có vài chỗ chưa chuẩn; X quá mỏng, chỉ gợi ý mỗi Corydoras. / X xác nhận lọc thùng hợp với bể từ 80 lít, có lưu lượng tham khảo và danh sách cá, cách giảm công chăm dù còn chung chung và có vài tên gọi sai. Y nói khá đúng về lọc và bảo trì, nhưng hỏi lại kích thước, chỉ gợi ý Corydoras nên gần như chưa trả lời nuôi cá gì; cả hai đều không bám vào bể dài 170 cm, đặt trong hộc giá sách với lỗ lọc ở hai đầu.

**Ours lacks:** tank-fit, too-thin, figures. **Plain lacks:** tank-fit, too-long, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Lọc thùng hợp với bể cần lọc mạnh và êm, vì nó chứa được nhiều vật liệu và ít chiếm chỗ trong hồ. Đổi lại, nó khó vệ sinh hơn lọc treo, giá thường cao, và vật liệu sinh học nằm trong hộp kín nên dễ mất vi khuẩn nếu mất điện lâu. Bạn cho mình biết kích thước bể và loại cá định nuôi để mình xem kỹ hơn.
> Nếu muốn ít phải chăm, mình gợi ý:
> 1. Chọn lọc có khay và ống dễ tháo, để việc vệ sinh không mất quá nhiều thời gian.
> 2. Vệ sinh lọc khi lưu lượng nước ra giảm rõ, rửa vật liệu sinh học bằng nước lấy từ chính bể, không rửa khô.
> 3. Thay than hoạt tính khi đã dùng quá khoảng 30 ngày hoặc bị nhớt bá…

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

### cycling-01 · post · tie or split (5.75 · 6)

**Asked:** Bể em dài 90cm rộng 40, đã mua bình CO2 + trộn cánh quạt, lọc thùng DF1300, đèn Odyssea, nền 10kg loại nhiều chất, trồng trân châu ngọc trai, sao nhỏ và một đống cây cắm lưa thưa. Tuần đầu em lật ra lật vào 3 lần, mất một đống cây vì nhổ ra bị úa, nền mua thiếu thấy mỏng lại hút nước ra cho thêm. Hiện ngày nào em cũng thay 50% nước. Bể đang ổn định được 3 ngày, em định 1 tuần thì thả cá nhỏ như neon, 7 màu. Vậy đã thả được chưa, và nên mua sục oxy loại nào?

**Judge:** Y bám sát bể hơn (DF1300, trân châu, nền thiếu), trả lời đúng câu hỏi mua sục loại nào và giảm thay nước hợp lý hơn, dù gợi ý thả cá thử là sai. X có thứ tự rõ ràng nhưng cắt thay nước quá mạnh với nền mới, bỏ qua 7 màu và không gợi ý loại sục cụ thể. / Cả hai đều đúng là chưa nên thả cá nhưng đều khuyên giảm thay nước quá sớm với nền mới. X bám sát bể và có mốc 3-4 tuần, song gợi ý thả tép/guppy để thử bể và đọc sai \"neon, 7 màu\"; Y có các bước rõ, an toàn hơn và có dấu hiệu theo dõi, nên nhỉnh hơn dù ít bám chi tiết bể và bỏ sót cá 7 màu.

**Ours lacks:** tank-fit, local, figures. **Plain lacks:** plan, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Bạn chưa nên thả neon lúc này. Bể mới chạy được 3 ngày, vi khuẩn có lợi chưa đủ để xử lý amoniac và nitrit, và nền mới cùng cây vừa trồng lại đang nhả chất. Cá neon rất nhạy với giai đoạn này, cẩm nang cũng nói bể mới chưa hợp với neon vì chúng không chịu được biến động lúc khởi động, nên chỉ thả khi bể đã chạy ổn định. Việc nhổ cây ra xem nhiều lần và thay 50% nước mỗi ngày cũng làm chậm quá trình này, vì nước thay liên tục kéo theo vi khuẩn và chất dinh dưỡng cây cần.
> 1. Ngừng thay 50% nước mỗi ngày, chỉ thay khoảng 20 đến 30% mỗi tuần nếu nước không có mùi lạ.
> 2. Ngừng lật cây ra vào, để c…

**Plain** (1970 characters):

> **Chưa nên thả cá lúc này.** Ba ngày là quá sớm, và có vài lý do:
> 
> - **Bể chưa chu trình nitơ.** Nền dinh dưỡng và vi sinh có lợi cần vài tuần mới hình thành đủ. Trong giai đoạn này amoniac có thể tăng đột ngột, và cá nhỏ như neon rất nhạy với nó.
> - **Thay 50% nước mỗi ngày làm chậm quá trình này.** Nó loại bỏ amoniac và vi khuẩn ngay khi chúng vừa hình thành, nên bể chưa có cơ hội ổn định. Bạn có thể giảm xuống 1-2 lần/tuần, chỉ thay thêm khi đo thấy chỉ số xấu.
> - **Cây đang hồi phục.** Cây mới trồng và vừa bị nhổ lên nhổ xuống cần vài tuần để bám rễ và ra rễ mới. Trân châu ngọc trai rất khó…

### cycling-01 · tank · ours wins (5.75 · 4)

**Asked:** Bể thủy sinh mới set được ít ngày, khi nào thì thả neon và bảy màu được?

**Judge:** Cả hai đều đúng ý chính là chờ xong chu trình và test NH3/NO2, nhưng đều bỏ qua bể cụ thể của bạn này (nền dưỡng, thay 50% nước mỗi ngày, lọc DF1300). Y có các bước rõ hơn nhưng khuyên dùng nước rửa chén làm nguồn amoniac, một lỗi có hại, nên X dù ngắn và có chỗ mâu thuẫn về việc thả sớm bảy màu vẫn an toàn hơn. / Y đưa ra thứ tự thả đúng hướng (bảy màu trước, neon sau cùng khi bể ổn định) và tiêu chí test rõ, dù ngắn và chưa bám bể nền nhiều dưỡng đang thay nước mạnh. X có cấu trúc rõ hơn nhưng khuyên nhỏ nước rửa chén vào bể là sai và có hại, lại hỏi những điều về nền và lọc mà app đã có.

**Ours lacks:** tank-fit, plan, follow-up. **Plain lacks:** tank-fit, wrong, unsafe.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể mới set chỉ vài ngày thì chưa nên thả neon hay bảy màu. Cẩm nang nói cá neon không hợp với bể mới vì chúng không chịu được biến động của giai đoạn khởi động, chỉ thả khi bể đã trưởng thành và thông số nước ổn định. Bảy màu chịu đựng tốt hơn nhưng cũng cần bể đã có vi khuẩn lọc, nên bạn nên chờ đến khi bể chạy xong chu trình nitơ: thường mất khoảng 4 đến 8 tuần, và dùng bộ test để kiểm tra amoniac và nitrit đều về 0 trong vài ngày liên tiếp. Trong lúc chờ, bạn có thể thả trước vài con bảy màu khỏe để bể có cá mà vẫn an toàn, hoặc thả neon sau cùng khi nước đã ổn định.
> 
> [Trích: Cycling bể cá…

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

**Judge:** X chẩn đoán đúng, gọn và thận trọng khi hỏi lại \"cá vàng\" là loài nào, nhưng bỏ hẳn câu hỏi nên mua cá gì cho con chăm. Y dài và có lỗi tên cá, nhưng trả lời đủ cả hai ý: nguyên nhân, cách cứu 3 con còn lại, danh sách cá bền cùng cấu hình và lộ trình cụ thể, nên giúp hai bố con nhiều hơn. / X nêu đúng nguyên nhân (bể chưa chín, neon không hợp cá vàng), có việc cần làm ngay và trả lời câu hỏi nên mua cá gì kèm cấu hình cụ thể, dù dài và có vài lỗi nhỏ như gọi nhầm tên cá kiếm. Y chẩn đoán gọn, cẩn trọng và có bước rõ ràng nhưng bỏ hẳn câu hỏi về cá khỏe cho con chăm, chỉ để nó thành gợi ý hỏi tiếp.

**Ours lacks:** tank-fit, too-thin, figures. **Plain lacks:** local, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là bể mới chưa chạy xong chu trình nitơ, nên nước có amoniac hoặc nitrit độc, cộng thêm việc thả 14 con cùng lúc trong bể 50 cm và cá bị sốc khi vận chuyển. Cẩm nang nói rõ cá neon không chịu được những biến động của giai đoạn khởi động bể, nên chỉ thả khi bể đã trưởng thành và thông số nước ổn định. Mình chưa rõ "cá vàng nhỏ xíu" là loài nào. Nếu là cá vàng thật thì loài này cần nước mát, không hợp với bể nhiệt đới có neon, nên bạn kiểm tra lại tên trên hóa đơn hoặc cho mình biết.
> 1. Ngừng thả thêm cá và ngừng cho ăn dư, vì thức ăn thừa phân hủy làm amoniac tăng n…

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

### cycling-02 · tank · ours wins (7 · 5.25)

**Asked:** Tôi vừa mua bể và thả cá, mới 2 ngày cá đã chết gần hết, vì sao?

**Judge:** X gives a short, ordered rescue plan, names chlorine and transport stress alongside the uncycled tank, and shows relevant neon and acclimation guides. Y is correct on the main cause but is a long generic list with a few muddled details and asks for fish details. Neither notes that neon and goldfish are a poor match. / Cả hai đều chẩn đoán đúng là bể mới chưa có vi sinh nhưng đều không nói gì về 3 con cá vàng còn sống hay việc nuôi chung neon với cá vàng. Y gọn, có bước theo thứ tự và dặn theo dõi 1–2 ngày, còn X dài, liệt kê chung chung, có lỗi nhỏ và cuối bài hỏi lại những thông tin cơ bản.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, local, follow-up.

**Ours** (read 4 pages, stopped at the calls limit):

> Mình đoán nguyên nhân chính là bể mới chưa có vi sinh: amoniac và nitrit tăng vọt trong vài ngày đầu và làm cá chết sốc. Cá vừa vận chuyển cũng đang yếu, và nước máy có nhiều clo nếu bạn chưa khử. Mình chưa biết chắc vì chưa có số đo nước, nên hãy kiểm tra ngay.
> 1. Thử amoniac và nitrit bằng bộ test nếu có; nếu chưa có, cứ coi như đang độc.
> 2. Thay khoảng một phần ba nước bằng nước đã khử clo và cùng nhiệt độ với bể.
> 3. Ngừng cho ăn và hạn chế đụng vào bể, để đèn dịu và giữ bể tối vài giờ đầu.
> 4. Kiểm tra sục khí và nhiệt độ, vớt cá đã chết ra ngay.
> 5. Đừng thả thêm cá cho tới khi bể đã qua c…

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

### cycling-03 · post · plain wins (5.5 · 6)

**Asked:** Em mới chơi lần đầu, nghe người bán cá chỉ và hơi hấp tấp nên trong một tuần em set nền full trân châu ngọc trai lùn, trồng cây xếp cảnh. Sau đó em thả 2 ngàn đồng cá trâm, 5 con tép RC, 1 tỳ bà baby, chục con bảy màu. Đổ nước vào được một tuần thì rêu hại tràn lan, loại rêu trắng trắng làm thối rữa trân châu và lan rất nhanh. Bảy màu chết 7 con, cá trâm chết gần nửa đàn, tép trốn biệt vài ngày mới thấy ló mặt. Cây đang chết dần chết mòn, em đã thay nước, vớt bớt rêu, thả tép mồi số lượng lớn mà bất lực. Em đang định bỏ hồ này set lại theo kiểu nền đá đen, tường full rêu, mấy cây lá to dày, nuôi đội vệ sinh tỳ bà bướm, chuột panda, tép RC, cá trâm. Nên làm sao?

**Judge:** X chẩn đoán đúng, trung thực về chỗ chưa chắc và không có lỗi, nhưng gần như bỏ ngỏ kế hoạch set lại và không bảo dọn thảm cây đang thối. Y hiểu sai trân châu thành sỏi, một lỗi đáng tiếc, nhưng vẫn có chẩn đoán cycle đúng, xử lý khẩn cấp, gợi ý cây, cycle 4-6 tuần và cách thả dần, nên trả lời câu hỏi nhỉnh hơn. / X hiểu nhầm trân châu thành sỏi, nhưng vẫn chẩn đoán đúng hồ chưa cycle, có các bước cứu hồ và góp ý trực tiếp cho kế hoạch set lại (loại cây, cycle 4-6 tuần, thả từng đợt). Y chính xác, gọn và trung thực hơn nhưng gần như không đánh giá kế hoạch mới, chỉ nói về cá trâm rồi bảo hỏi lại về tỳ bà bướm và chuột panda.

**Ours lacks:** plan, tank-fit, too-thin. **Plain lacks:** wrong, too-long, figures.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là bể chưa chạy chu trình nitơ: bạn set xong mới một tuần đã thả cá, nên amoniac và nitrit tăng lên đốt cá bảy màu và cá trâm, còn tép trốn vì nước xấu. Rêu trắng và cây chết dần là hệ quả của nước giàu dinh dưỡng từ nền mới mà cây chưa đủ rễ để hấp thụ. Mình khá chắc về phần chu trình, còn loại rêu trắng cụ thể thì mình chưa chắc, có thể là màng vi khuẩn bùng lên.
> 1. Mua bộ test amoniac và nitrit, đo ngay hôm nay để biết bể đang ở đâu.
> 2. Ngừng cho ăn, không thả thêm cá hay tép, tạm giảm đèn còn khoảng 6 giờ mỗi ngày và không châm phân.
> 3. Nếu amoniac hoặc nitrit …

**Plain** (3273 characters):

> Mình hiểu cảm giác bất lực khi cá chết và cây tàn dần. Chuyện này rất phổ biến với người mới, và phần lớn là do **hồ chưa chu trình (chưa cycle)** cộng với **thả quá tải, cho ăn nhiều** trong khi hệ vi sinh chưa đủ để xử lý chất thải. Rêu trắng bùng lên chính là dấu hiệu của chất hữu cơ dư thừa đang phân hủy.
> 
> ## 1. Việc cần làm ngay (vài ngày tới)
> 
> **Kiểm tra nước trước tiên.** Mua bộ test API Liquid (NH3/NH4, NO2, NO3, pH). Nếu NH3 hoặc NO2 khác 0 thì đó gần như chắc chắn là nguyên nhân cá chết.
> 
> **Xử lý tình trạng cấp bách:**
> - **Ngưng cho ăn 2-3 ngày.** Thức ăn thừa là nguồn amoniac chính…

### cycling-03 · tank · tie or split (6.25 · 6)

**Asked:** Bể mới set một tuần thì rêu trắng lan và cá chết gần nửa, có nên lật bể làm lại không?

**Judge:** Both correctly say not to flip the tank and blame the uncycled tank, and neither uses the actual stock. X is cleaner and safer but barely deals with the white growth; Y has minor flaws but directly treats the white growth and gives daily water changes, a detoxifier and clear conditions for when flipping makes sense, so it answers more of the question. / Both correctly say not to strip the tank and blame the uncycled tank, and neither uses the hobbyist's stock or the rotting trân châu. Y is tighter and safer, with clear thresholds, daily re-testing, warning signs and a useful guide excerpt, though it barely treats the white growth; X covers that growth better but downplays it and gives weak reasons for stripping the tank later.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, follow-up.

**Ours** (read 4 pages, stopped at the calls limit):

> Mình nghĩ bạn chưa cần lật bể. Bể mới một tuần chưa có đủ vi sinh để xử lý amoni và nitrit, nên cá chết nhiều thường là do chất độc tích lên, kèm theo rêu trắng hoặc nước đục là bùng vi sinh. Đây là suy đoán từ triệu chứng bạn kể, bạn cần đo nước để chắc chắn. Bạn nên làm thế này:
> 1. Đo ngay amoni, nitrit, pH và nhiệt độ nước.
> 2. Nếu amoni trên 0,1 mg/L hoặc nitrit trên 0, thay một phần nước, không quá 50%, bằng nước đã khử clo và có nhiệt độ bằng nước trong bể.
> 3. Vớt cá chết và thức ăn thừa, tạm ngưng cho ăn một đến hai ngày.
> 4. Giữ lọc chạy liên tục, không rửa vật liệu lọc bằng nước máy, v…

**Plain** (1555 characters):

> **Thường không cần lật bể.** Bể mới một tuần mà cá chết nhiều thường là do **chu trình nitơ chưa ổn định** (amoniac và nitrit tăng cao), không phải bể hỏng không cứu được. Vi khuẩn có lợi nằm trong lọc, sỏi và trang trí, nếu đổ đi làm lại thì bạn phải chờ chu trình chạy lại từ đầu, thường mất thêm 3-6 tuần.
> 
> **Việc nên làm ngay:**
> 
> 1. **Test nước** (amoniac, nitrit, nitrat, pH). Nếu amoniac hoặc nitrit trên 0 là đang độc, cần xử lý gấp.
> 2. **Thay nước 30-50% mỗi ngày** nếu có amoniac/nitrit, dùng nước đã khử clo, cùng nhiệt độ với bể. Dùng thuốc khử độc amoniac nếu có.
> 3. **Ngừng cho ăn 1-2 n…

### cycling-04 · post · plain wins (6.25 · 7.5)

**Asked:** Hồ mình 40x30x30, vừa set up được 5 ngày thì có hiện tượng cá chết, mặt hồ có bọt trắng là sao? Hồ như vậy có cần thay nước thường xuyên không, có cần sục sủi không? Mình chỉ để chạy máy lọc nước thôi.

**Judge:** Both correctly blame an uncycled tank, but Y answers all the questions directly: foam cause and removal, a water-change routine during and after cycling, and aeration in hot weather, plus 36-litre stocking advice. X has clear emergency steps but is awkward with its handbook references, gives no routine water-change plan, and ignores the tank size. / X trả lời đủ nguyên nhân, cách xử lý, lịch thay nước trước và sau khi hồ ổn định, việc có cần sủi hay không, và mức thả cho hồ 36 lít, dù thiếu men vi sinh và gộp nhầm betta. Y có men vi sinh, mượn vật liệu lọc và phần theo dõi tốt, nhưng trả lời thiếu về thay nước lâu dài, không dùng kích thước hồ và văn phong còn lộ 'cẩm nang nói'.

**Ours lacks:** tank-fit, follow-up, local. **Plain lacks:** follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể 5 ngày tuổi mà cá đã chết, nguyên nhân khả nhất là hội chứng bể mới: bể chưa có vi sinh để phân hủy amoni từ cá và thức ăn thừa, nên amoni (và có thể nitrit) tích lại đến mức độc. Hiện mình chưa có đủ dữ liệu để chắc chắn. Cẩm nang nói rõ dấu hiệu này gồm cá ngáp mặt nước, thở nhanh, lờ đờ, bỏ ăn, nước đục và có mùi hôi; bể mới thường cho amoni cao, nitrit thấp hoặc bằng 0 và không có nitrat. Riêng lớp bọt trắng trên mặt, cẩm nang chưa giải thích nguyên nhân, nên mình không dám chắc. Thường gặp là cặn bẩn hoặc chất hữu cơ trên mặt nước, cặn xà phòng còn sót trong dụng cụ, hoặc bọt do d…

**Plain** (2320 characters):

> ## Nguyên nhân có thể
> 
> Hồ mới 5 ngày thường chưa đủ **chu trình nitơ** (cycling). Hồ mới chưa có vi khuẩn có lợi để phân hủy chất thải của cá:
> 
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻) tích tụ** từ phân cá, thức ăn thừa, xác lá. Đây là nguyên nhân chết cá phổ biến nhất ở hồ mới. Amoniac và nitrit rất độc, còn cá thì yếu dần.
> - **Bọt trắng trên mặt** thường là bọt protein từ chất hữu cơ, hoặc do vi khuẩn bùng phát trong giai đoạn đầu. Bọt có thể do thức ăn thừa, phân, hoặc dư chất tẩy rửa/xà phòng còn sót lại khi vệ sinh hồ và trang trí.
> - Các nguyên nhân khác: nước máy chưa khử clo, nhiệt độ h…

### cycling-04 · tank · plain wins (6 · 7.25)

**Asked:** Bể mới set 5 ngày cá chết và mặt nước có bọt trắng, là sao?

**Judge:** Cả hai đều chẩn đoán đúng bể chưa cycle, nhưng Y cứu cá tốt hơn nhờ có % thay nước, khử clo, tăng sục khí và chất khử độc, lại xét cả clo và xà phòng, hai nguyên nhân X bỏ sót. X gọn hơn nhưng thiếu số liệu thay nước và nguyên nhân từ nước máy; Y hơi dài và hỏi lại thể tích bể dù không dùng được dữ liệu bể. / Both correctly blame an uncycled tank, but X gives a clearer rescue: add aeration, change 30–50% of the water with dechlorinated water, use a detoxifier, and consider chlorine or soap residue. Y is tighter and has a good cycling-complete check, but it gives no water-change amount, barely covers tap water, and only says to keep aeration running though this tank has none.

**Ours lacks:** figures, tank-fit, diagnosis. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages):

> Mình đoán nguyên nhân chính là bể chưa cycle: mới set 5 ngày thì vi khuẩn có lợi chưa đủ để xử lý amoniac từ cá và thức ăn thừa, nên amoniac tích tụ đến mức độc và cá chết. Cách cycling trong cẩm nang nói rõ điều này. Còn lớp bọt trắng thì cẩm nang chưa nói cụ thể; thường là chất hữu cơ phân hủy, cặn từ vật liệu mới hoặc xác thức ăn, nên bạn cần đo nước để xác định thêm. Việc cần làm ngay:
> 1. Đo amoniac và nitrit bằng que thử ngay hôm nay; nếu trên 0,2 ppm thì thay một phần nước bằng nước sạch.
> 2. Ngừng cho ăn, vớt xác cá, thức ăn thừa và cặn nổi trên mặt nước.
> 3. Giữ lọc và sục khí chạy liên…

**Plain** (2085 characters):

> Bể mới 5 ngày mà cá đã chết và có bọt trắng thường là dấu hiệu **bể chưa ổn định, nước đang bị nhiễm độc**. Nguyên nhân hay gặp nhất:
> 
> ## Nguyên nhân có thể
> 
> 1. **Ammonia (NH₃/NH₄⁺) hoặc Nitrite (NO₂⁻) tăng cao.** Đây là nguyên nhân phổ biến nhất. Bể mới chưa có vi khuẩn có lợi để phân hủy chất thải, nên khí độc tích tụ và giết cá. Cá thường bơi ngoi lên mặt, há miệng, mang đỏ hoặc tím.
> 2. **Bọt trắng** thường do chất hữu cơ dư thừa: thức ăn thừa, phân cá, cá chết phân hủy, nhớt cá, hoặc còn sót xà phòng/chất tẩy rửa khi vệ sinh bể, lọc, đá, cây.
> 3. **Sốc môi trường:** nước máy chứa clo/chlor…

### cycling-05 · post · plain wins (6 · 7.25)

**Asked:** Mình mới tập set một hồ biotop 845, chỉ có lũa hải sa quỳ, đá đen và đá cuội, vài cây thủy sinh không cần CO2, lọc thùng Atman, đèn rọi vàng-trắng. Giai đoạn mới châm đầy nước và chạy lọc thì nên châm loại vi sinh nào?

**Judge:** Y names the bacteria type and example products, and covers dechlorination, an ammonia source, not washing filter media in tap water, and a test schedule with a 3–6 week timeframe, so the hobbyist can really run the cycle. X is concise and correct on the main point but misses dechlorination and an ammonia source, is vague on timing, and has an awkward \"cẩm nang không nêu tên hãng\" line. / X trả lời trúng loại vi sinh, có tên sản phẩm, nguồn amoniac, mốc test và thời gian 3–6 tuần nên dễ làm theo, dù hơi dài và vài bước không đúng giai đoạn. Y gọn, sát hồ và hợp cách cycling bằng cây, nhưng không nêu tên sản phẩm hay số liệu, lại có câu \"cho ăn dè\" gây rối khi chưa có cá.

**Ours lacks:** figures, plan, local, too-thin. **Plain lacks:** too-long, local, tank-fit.

**Ours** (read 3 pages, stopped at the calls limit):

> Với bể biotop chỉ có lũa, đá và cây không CO2 thì mình sẽ dùng vi khuẩn nitrat hóa sống (dạng chai) là lựa chọn chính, vì bể mới chưa có vi khuẩn có lợi để xử lý amoniac. Cẩm nang không nêu tên hãng cụ thể nên bạn chọn loại có ghi vi khuẩn nitrat hóa sống và làm theo liều trên nhãn.
> 1. Châm đầy nước, bật lọc Atman chạy trước, rồi nhỏ vi khuẩn sống vào theo liều ghi trên chai.
> 2. Đặt cây thủy sinh ngay, vì cây và rễ cũng mang vi khuẩn có lợi và hấp thụ amoniac, nitrat.
> 3. Chưa thả cá; cho ăn dè và dùng que thử nước theo dõi amoniac và nitrit.
> 4. Khi cây ra chồi lá mới và amoniac, nitrit về 0 t…

**Plain** (2095 characters):

> Với giai đoạn châm nước và chạy lọc, bạn nên dùng **vi sinh nitrat hóa** (nitrifying bacteria), thường ghi là chứa *Nitrosomonas* và *Nitrobacter*. Nhóm vi khuẩn này chuyển hóa amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻), hai chất rất độc với cá, thành nitrat (NO₃⁻) ít độc hơn. Các dòng phổ biến gồm Seachem Stability, Tetra SafeStart, API Quick Start, Tetra Nitrivec và các dòng vi sinh tươi từ bể đã chạy ổn định.
> 
> **Các bước nên làm:**
> 
> 1. **Khử clo trước khi châm nước.** Clo sẽ diệt vi khuẩn. Dùng nước đã để qua đêm, hoặc dùng chất khử clo, và chỉ thả vi sinh sau khi nước đã xử lý xong.
> 2. **Ngâm lũ…

### cycling-05 · tank · plain wins (5 · 7)

**Asked:** Bể mới đổ nước chạy lọc, nên châm vi sinh loại nào để sớm thả cá?

**Judge:** Y trả lời đúng câu hỏi bằng tên chế phẩm thật, có nguồn amoniac để nuôi vi sinh, mốc ppm và thời gian, dù gợi ý neon và lia thìa chưa chuẩn và còn hỏi lại kích thước bể. X an toàn và trung thực về thời gian nhưng không nêu sản phẩm nào, các bước chính thiếu nguồn amoniac, và cũng không dùng thông tin bể. / X trả lời đúng câu hỏi: nêu tên sản phẩm cụ thể, cách cấp amoniac nuôi vi sinh, mốc thời gian và điều kiện thả cá, dù chưa dùng thông tin bể và gợi ý neon chưa hợp. Y an toàn nhưng không nêu sản phẩm nào, các bước không có nguồn amoniac nuôi vi sinh (chỉ thoáng nhắc trong trích dẫn) và thời gian còn mơ hồ.

**Ours lacks:** figures, tank-fit, plan. **Plain lacks:** tank-fit, local.

**Ours** (read 3 pages, stopped at the calls limit):

> Bể mới chạy lọc thì vi sinh chưa đủ để xử lý chất thải, nên thả cá sớm dễ làm cá bị ngộ độc amoniac. Cẩm nang không nêu tên sản phẩm cụ thể nào, nhưng có ghi bạn có thể mua một chai vi khuẩn nitrat hóa dạng sống, xin vật liệu lọc đã chạy lâu từ bạn bè, hoặc trồng cây thủy sinh để có sẵn vi khuẩn có lợi bám theo. Theo cẩm nang, nuôi trước vật liệu giúp rút ngắn thời gian nhưng không có nghĩa là lắp xong là thả cá được ngay.
> 1. Chọn chế phẩm vi khuẩn nitrat hóa dạng sống, không phải loại đã diệt, và làm theo liều in trên nhãn.
> 2. Nếu xin được, cho vật liệu lọc đã nuôi vi sinh từ bể khác vào ngă…

**Plain** (1429 characters):

> Với bể mới, bạn nên chọn **vi sinh chứa vi khuẩn nitrat hóa sống** (thường có *Nitrosomonas* và *Nitrobacter*). Các loại phổ biến gồm **Seachem Stability**, **Tetra SafeStart**, **API Quick Start**, **Dr. Tim's** hoặc **Sera Bio Nitrivec**. Tránh loại chỉ có enzyme hoặc chỉ khử clo, vì chúng không giúp hình thành chu trình nitơ.
> 
> **Cách làm:**
> 1. **Châm vi sinh ngay** sau khi đổ nước và chạy lọc, liều theo hướng dẫn trên bao bì. Có thể châm lại sau 1-2 tuần để bù lượng vi khuẩn.
> 2. **Nuôi vi khuẩn bằng nguồn amoniac:** cho ăn một ít thức ăn mỗi ngày, hoặc dùng amoniac nguyên chất (không có ch…

### cycling-06 · post · tie or split (6.5 · 6.75)

**Asked:** Em mới set một bể cubic 20 loại lowtech, mấy hôm nay nước trong bể tự nhiên rất đục, mờ mờ như lớp sương mù. Mọi người bảo do vi sinh bị chết. Làm sao khắc phục và tạo lại vi sinh? Em cũng nuôi cá trong thùng xốp, nước trong đó rất trong dù thỉnh thoảng mới hút cặn và châm thêm nước. Em lấy nước thùng xốp đó châm mồi vi sinh cho bể mới được không?

**Judge:** X chẩn đoán đúng và cho các bước có thứ tự: đo ammonia, ngưng ăn, để yên lọc, biết khi nào thay nước và khi nào kiểm tra lại, dù câu \"cẩm nang không nói\" hơi lạ và phần mồi vi sinh còn dè dặt. Y trả lời việc mồi vi sinh rõ và thực tế hơn, nhưng phần xử lý đục là danh sách rời rạc, có giải thích sai về ánh sáng và khuyên lấy vật liệu lọc từ thùng xốp vốn có thể không có lọc. / Both correctly identify a bacterial bloom and warn against disturbing the tank. X is more useful because it directly answers the seeding question and shows how to seed with media or a squeezed sponge, while Y's steps are crisp but it hedges with \"cẩm nang không nói\" and gives only brief seeding advice.

**Ours lacks:** tank-fit. **Plain lacks:** plan, follow-up, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng bạn đang bị bùng vi sinh, hiện tượng hay gặp nhất ở bể mới set. Nước đục trắng như sương là vi khuẩn sinh sôi quá nhanh khi bể chưa ổn định, không phải vi sinh bị chết. Thường nó tự hết nếu bạn không làm xáo động bể.
> 1. Đo ammonia và nhiệt độ nước ngay. Nếu ammonia bằng 0 thì gần như không cần làm gì thêm.
> 2. Ngừng cho ăn khoảng 7 ngày, kể cả khi cá vẫn khỏe.
> 3. Để yên bộ lọc ít nhất 7 ngày, không vệ sinh và không đổi vật liệu lọc.
> 4. Nếu ammonia hoặc nitrite trên 0, đo mỗi ngày và thay khoảng 10–25% nước bằng nước có nhiệt độ gần bằng bể.
> 5. Đặt bể tránh nắng chiếu thẳng, bật …

**Plain** (2164 characters):

> ## Nước đục có phải do vi sinh chết không?
> 
> Nhiều khả năng **không**. Nước đục mờ như sương ở bể mới thường là **bloom vi khuẩn** (vi khuẩn sinh sôi quá mức khi có nhiều chất hữu cơ từ thức ăn, lá rụng, phân, hoặc nước máy mới). Đây là giai đoạn bình thường khi bể đang chạy (cycling), kéo dài khoảng 1-3 tuần. Vi sinh có ích (nitrat hóa) chủ yếu bám trên bề mặt lọc, nền, đá, kính, cây, nên nước đục không có nghĩa là chúng chết.
> 
> ## Cách xử lý
> 
> - **Đừng thay nước lớn** hoặc rửa lọc bằng nước máy mạnh. Việc này loại bỏ vi sinh bám và làm bloom kéo dài.
> - **Giảm ánh sáng** xuống khoảng 4-6 giờ/ng…

### cycling-06 · tank · ours wins (6.75 · 5.75)

**Asked:** Bể mới set bỗng đục mờ như sương, có phải vi sinh chết và làm sao gây lại?

**Judge:** X gives the right diagnosis and a short ordered plan with clear checks, while Y is also correct but more generic and less clearly sequenced, ending in questions. Neither addresses the hobbyist's styrofoam-box water or the 20 cm tank, though X's guide excerpts add useful follow-through. / Cả hai đều nhận đúng là bùng vi sinh chứ không phải vi sinh chết, nhưng đều bỏ qua bể cubic 20 và ý định lấy nước thùng xốp để mồi vi sinh. Y gọn hơn, có các bước theo thứ tự, biết khi nào thay nước và dùng từ quen thuộc; X dàn trải, chèn quy trình cycling dài và liều ammonia không cần cho ca này, dù phần gây lại vi sinh đầy đủ hơn.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, plan.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng đây là bùng vi sinh chứ không phải vi sinh chết. Bể mới set hay đục trắng như nước vo gạo khi vi khuẩn sinh sôi mạnh, và nhiệt độ đổi đột ngột hoặc cho ăn nhiều cũng dễ gây ra. Nước đục không đồng nghĩa với vi khuẩn chết; nếu chết thật thì ammonia và nitrite sẽ tăng lên. Để gây lại vi sinh nhanh hơn, bạn có thể cấy vi khuẩn bằng vật liệu lọc đã dùng từ một bể đang chạy tốt, hoặc dùng chế phẩm vi khuẩn theo hướng dẫn trên nhãn; không làm vậy thì sẽ phải chờ lâu.
> 1. Đo ammonia và nitrite ngay, ammonia phải bằng 0, và kiểm tra nhiệt độ nước.
> 2. Ngưng cho ăn khoảng 7 ngày; cá khỏe …

**Plain** (1912 characters):

> Bể mới bị đục trắng như sương thường **không phải vi sinh chết**. Phổ biến nhất là **bloom vi khuẩn** (bùng phát vi khuẩn dị dưỡng), xảy ra trong 1-2 tuần đầu khi bể đang chu trình nitơ. Nguyên nhân thường gặp là dư thức ăn, chất hữu cơ thừa, cá chết hoặc phân cá tích tụ, hoặc vật liệu lọc và nền mới còn bụi. Đây là dấu hiệu vi sinh đang hình thành, không phải vi sinh chết.
> 
> Tuy nhiên, nếu bể đã ổn định rồi bỗng đục sau khi rửa lọc bằng nước máy, dùng thuốc, hoặc thay nước quá nhiều, thì có thể vi sinh có ích đã bị giết và bạn cần gây lại.
> 
> **Cách xử lý khi bloom:**
> - Đừng hoảng và đừng thay …

### cycling-07 · post · ours wins (7 · 4.25)

**Asked:** Hồ em mới set hôm nay, có phân nền và chỉ một số cây cắt cắm dễ trồng. Em đặt trong phòng ngủ nên không thích sủi và lọc vì tiếng ồn. Người bán bảo chỉ cần 2-3 ngày thay nước một lần là được, vậy có ổn không, có cách nào khác không?

**Judge:** X đúng trọng tâm: phân nền mới cần thay nước dày, có lịch theo tuần, số phần trăm rõ, chưa thả sinh vật và biết cần theo dõi gì, dù phần cách khác ngoài thay nước còn mỏng. Y có nhiều gợi ý hữu ích về lọc bọt biển, cây nổi và test nước, nhưng lại khuyên thay nước thưa dựa trên lý do sai về vi sinh, nên sai ở đúng điều người hỏi cần biết. / Y correctly says a new soil tank with no filter needs more frequent changes than the seller suggested, and gives a dated schedule with what to watch for, though it offers little on no-filter alternatives or the long term. X has better quiet-setup ideas such as floating plants and a remote pump, but its core advice to change water less often rests on a false bacteria claim and is wrong for this stage.

**Ours lacks:** tank-fit, figures. **Plain lacks:** wrong, plan, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Lịch 2-3 ngày thay một lần chưa ổn cho hồ vừa set. Nền mới đang nhả nhiều dinh dưỡng và lũa ra nhớt, nên cẩm nang khuyên tuần đầu thay 50% nước mỗi ngày, tuần 2 và 3 thay 40% cách hai ngày. Không có lọc hay sủi thì nước càng dễ bẩn, nên lịch thay nước càng quan trọng.
> 1. Tuần đầu thay khoảng 50% nước mỗi ngày, nước mới phải khử clo trước khi đổ vào.
> 2. Tuần 2 và 3 thay 40% hai ngày một lần, hút sát nền bằng ống nhựa để nhặt cặn và lá rụng.
> 3. Mỗi lần thay, châm Seachem Prime theo liều in trên chai, và soi cây để cắt bỏ phần úng trước khi thay.
> 4. Chưa thả cá, tôm hay ốc. Cẩm nang khuyên chờ 7…

**Plain** (2058 characters):

> **Thay nước 2-3 ngày một lần thường là không cần thiết.** Hồ mới set, nhất là hồ thủy sinh có phân nền, cần vài tuần để ổn định. Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi đang hình thành, và bạn phải xử lý nước máy liên tục. Cách làm hợp lý hơn:
> 
> - **Nếu chưa có cá hoặc chỉ có rất ít cá:** thay 20-30% nước mỗi 1-2 tuần, hoặc khi nitrate (NO₃) cao. Khi có cá, lượng thức ăn và chất thải mới là nguồn gây bẩn chính.
> - **Chỉ châm thêm nước** khi bị bay hơi, dùng nước đã khử clo.
> - **Dùng bộ test nước** (NH₃/NH₄⁺, NO₂⁻, NO₃⁻) để quyết định khi nào thay nước, thay vì theo lịch cố đị…

### cycling-07 · tank · ours wins (7 · 3)

**Asked:** Bể mới set của tôi chỉ thay nước vài ngày một lần thay cho lọc thì có ổn không?

**Judge:** X understands the question, explains that water changes only dilute ammonia and do not build a biological filter, and gives ordered steps with test thresholds, though it misses the soil substrate and the tank's lack of a filter. Y misreads the question as being about filter cleaning, so much of its advice misses this filterless tank, and it ends by asking for details. / Y trả lời đúng điều được hỏi: thay nước chỉ làm loãng amoniac chứ không tạo lọc sinh học, rồi đưa các bước, ngưỡng đo và dấu hiệu cần theo dõi, dù bỏ qua phân nền mới và lời người bán. X hiểu nhầm thành vệ sinh lọc nên phần lớn lời khuyên lạc đề với bể không lọc, cuối cùng còn hỏi lại thông tin.

**Ours lacks:** tank-fit. **Plain lacks:** off-topic, plan, tank-fit.

**Ours** (read 2 pages, stopped at the calls limit):

> Mình nghĩ là chưa ổn, bạn nên chạy lọc ngay từ đầu. Thay nước làm loãng amoniac nhưng không tạo được lọc sinh học, vì bể mới chưa có vi khuẩn có lợi. Vi khuẩn này sống trên lọc, sỏi nền, kính và đồ trang trí, và cần thời gian để đủ số lượng. Trong lúc chờ, chất thải của cá vẫn tích tụ thành amoniac và nitrit giữa các lần thay nước. Cycle bể thường mất vài tuần đến vài tháng, nên bạn không thể bỏ qua bước này.
> 1. Bật lọc liên tục từ bây giờ, đừng tắt để thay cho việc lọc.
> 2. Mua vi khuẩn nitrat hóa sống hoặc xin ít vật liệu lọc đã chạy ổn từ bạn bè.
> 3. Trồng thêm cây thủy sinh để cây hút amoni…

**Plain** (1338 characters):

> Tùy bạn đang hiểu "thay cho lọc" là thay nước **thay cho** việc vệ sinh lọc, hay là thay nước **và** vệ sinh lọc. Mình trả lời theo hướng bạn đang hỏi có nên thay nước thường xuyên hơn để thay thế việc vệ sinh lọc không.
> 
> **Thay nước không thay thế được việc vệ sinh lọc.** Hai việc này có tác dụng khác nhau:
> - **Thay nước** giúp giảm amoniac, nitrit, nitrat và các chất bẩn hòa tan.
> - **Vệ sinh lọc** chỉ cần khi lọc bị tắc hoặc dòng chảy yếu đi rõ rệt. Vệ sinh quá kỹ hoặc quá thường xuyên có thể làm mất vi khuẩn có lợi.
> 
> **Với bể mới, bạn nên lưu ý:**
> - **Bể chưa chạy xong chu trình nitơ (chưa…

### cycling-08 · post · plain wins (4.75 · 8)

**Asked:** Hồ của em làm từ thùng xốp 40x40x20, 2 mặt kính, 3 mặt xi măng, để trên sân thượng trong mái hiên. Em dùng lọc thác Sobo 400l/h có đủ không? Hồ như vậy có cần CO2 không? Bao lâu thì thả cá được?

**Judge:** Y trả lời đủ ba câu và nêu đúng rủi ro lớn nhất của hồ này là xi măng mới làm pH cao, kèm cách quét chống thấm, ngâm xả và kiểm tra pH. X gọn và đúng về lọc, CO2, thời gian cycling nhưng bỏ sót xi măng, nên làm theo vẫn có thể hại cá. / X answers all three questions and catches the main hazard in this build, the alkaline cement walls, with sealing, soaking and pH-check steps, plus cycling detail and stocking numbers. Y is concise and its substrate advice is useful, but it treats this as an ordinary styrofoam tank and never mentions the cement, which is a serious omission before adding fish.

**Ours lacks:** tank-fit, unsafe, plan, too-thin. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Với bể 40x40x20 (khoảng 32 lít), Sobo 400 l/h là dư sức: lọc quay vòng khoảng 12 lần mỗi giờ, nên nếu cá bơi chao đảo hay nước xoáy mạnh thì bạn chỉnh bớt dòng chảy. Bể không bắt buộc có CO2 nếu bạn trồng các loại cây không CO2 dễ sống; với bể đặt ngoài sân thượng, nguy cơ lớn hơn là rêu do nắng chứ không phải thiếu CO2. Mình chưa đọc được hướng dẫn riêng về thời gian cycling cho bể xốp, nên thời gian chờ dưới đây là kinh nghiệm chung.
> 1. Đặt bể ở chỗ có bóng râm một phần, tránh nắng gắt cả ngày để hạn chế rêu.
> 2. Lót 4 đến 5 cm đất vườn sạch, phủ lớp than, rồi trồng cây không CO2 trước khi c…

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

### cycling-08 · tank · plain wins (3.5 · 4.75)

**Asked:** Bể mới làm của tôi bao lâu thì thả cá được, lọc như vậy có đủ không?

**Judge:** Neither answer uses the 32 L size or Sobo 400 l/h filter, and neither warns about new cement leaching lime and raising pH, which is the real risk here. Y is still more useful: it gives a clear 3–6 week wait, readiness criteria, and a flow rule to check the filter, while X has clearer steps but a vague timeline, an awkward 38 L stocking figure, and no filter guidance. / Cả hai đều bỏ qua việc xi măng mới cần ngâm xả và không tính được lọc 400 l/h cho bể khoảng 32 lít. X vẫn trả lời rõ 3–6 tuần, có tiêu chí sẵn sàng và quy tắc 4–6 lần/giờ để tự đối chiếu, còn Y trả lời mơ hồ và đẩy người chơi sang thả cá sớm với con số 38 lít không hợp bể.

**Ours lacks:** tank-fit, local, asks-only, figures, unsafe. **Plain lacks:** tank-fit, plan, follow-up.

**Ours** (read 2 pages):

> Thời gian chờ phụ thuộc vào việc bể đã có đủ vi khuẩn có lợi chưa, thường mất vài tuần đến vài tháng. Lọc chỉ là nơi vi khuẩn sống, nên lọc mạnh cũng chưa chắc đủ nếu bể chưa cycle xong. Bể được coi là đã cycle khi bạn cho cá ăn lượng bình thường trong một tuần mà amoniac và nitrit đều ở 0 ppm, và nitrat trên 0 ppm.
> 1. Chỉ thả vài con cá khỏe lúc đầu, khoảng 1 con nhỏ cho mỗi 38 lít nước.
> 2. Cho ăn ít lúc đầu, rồi tăng dần trong bốn đến sáu tuần.
> 3. Đo amoniac và nitrit bằng que thử mỗi một đến hai ngày.
> 4. Nếu amoniac hoặc nitrit trên 0,2 ppm, thay một phần nước.
> 5. Khi bể ổn định một tuần, …

**Plain** (1336 characters):

> Thường thì bể mới cần **khoảng 3–6 tuần** để chu trình nitơ (nitrogen cycle) ổn định trước khi thả cá. Trong thời gian này, vi khuẩn có lợi phải phát triển đủ để xử lý amoniac (NH₃) và nitrit (NO₂⁻) do cá thải ra. Nếu thả cá sớm, amoniac và nitrit sẽ tích tụ và dễ làm cá chết.
> 
> **Cách biết bể đã sẵn sàng:**
> - Dùng bộ test nước (nên dùng loại giọt, chính xác hơn que thử) kiểm tra amoniac và nitrit.
> - Khi **amoniac = 0** và **nitrit = 0** trong ít nhất 2–3 ngày liên tiếp, và đã có nitrat (NO₃⁻) xuất hiện, bể đã chạy xong chu trình.
> - Ngược lại, nếu amoniac hoặc nitrit vẫn đo được thì chưa nên t…

### sick-01 · post · ours wins (7 · 5)

**Asked:** Đàn ngựa vằn xanh nhà em nuôi gần 3 năm, rơi rụng dần. Giống này không đẻ nổi, giờ cứ 1 vài tuần lại có con cong người, 1-2 tuần sau là chết. Có phải do già quá không, hay bị bệnh gì?

**Judge:** X treats the fish as old zebra danio, names a likely wasting disease, answers the age question and gives ordered steps with something to track, though its 18–25°C target does not suit Vietnam. Y has a useful lao cá warning, but it doubts the species, lists six causes and ends with many questions, leaving the hobbyist with less clear direction. / Y treats the fish as zebra danio, gives its lifespan, names microsporidiosis, a classic cause of bent, wasting zebrafish, and is honest that it has no cure, then gives ordered steps and what to watch, though it omits fish TB and its 18–25°C target is impractical. X correctly warns about TB and infection risk to people, but it is unsure of the species, lists many causes, dismisses age too firmly and ends mostly with questions.

**Ours lacks:** local. **Plain lacks:** tank-fit, diagnosis, figures, plan, follow-up.

**Ours** (read 1 pages, stopped at the calls limit):

> Mình nghĩ nhiều khả năng đây là bệnh gầy (microsporidiosis, do ký sinh trùng Pseudoloma neurofilia), vì cá cong người, gầy dần rồi chết trong vài tuần. Cá ngựa vằn sống khoảng 3–5 năm, nên đàn gần 3 năm tuổi đã gần cuối đời, và giống thương mại đã cận huyết nhiều đời nên khó đẻ và yếu đề kháng. Tuổi già có thể làm cá cong người, nhưng thường không lan đều trong đàn như bạn đang thấy. Bệnh này khó chẩn đoán chắc nếu không mổ kiểm tra, và handbook ghi rằng hiện không có thuốc chữa, nên bạn làm như sau:
> 1. Vớt riêng con cong người, gầy hoặc bỏ ăn ra khỏi đàn, không để chúng sống chung với con kh…

**Plain** (2113 characters):

> Nếu "ngựa vằn xanh" là cá (zebra danio hoặc cichlid vằn xanh), thì tuổi già thường không gây ra triệu chứng này. Cá già thường yếu dần, ăn ít, đẻ kém, chứ không cong người rồi chết trong 1-2 tuần. Biểu hiện cong người kèm chết nhanh thường là bệnh, và có vài nguyên nhân chính:
> 
> 1. **Lao cá (Mycobacteriosis)**: Đây là nghi ngờ hàng đầu với triệu chứng bạn mô tả: gầy dần, rụng dần, cong cột sống, bụng hõm, có thể có vết loét hoặc u hạt. Bệnh âm ỉ, lây lan chậm, khó chữa. Lao cá có thể lây sang người qua vết xước, nên khi xử lý cá bệnh hoặc xác chết phải đeo găng tay và rửa tay kỹ.
> 2. **Nhiễm kh…

### sick-01 · tank · plain wins (5.75 · 6.5)

**Asked:** Cá ngựa vằn của tôi cứ vài tuần lại có con cong người rồi chết, là bệnh gì?

**Judge:** Y names the most likely causes in zebrafish, mycobacteriosis and Pseudoloma, matches them to slow recurring deaths, and warns that TB can infect people, though its steps are less focused. X has clearer ordered steps and follow-up but a thinner diagnosis, borrowed swim-bladder advice and no human-infection warning; neither considers that the fish are nearly 3 years old. / X better answers 'là bệnh gì' by naming lao cá and Pseudoloma, the classic causes of bent spines in zebrafish, and warns that lao can infect people, though its list is padded and its disinfection step is risky. Y is tidier and more natural with a clear order, but it gives a thinner diagnosis and leans on off-target swim-bladder material; neither considers the fish's nearly 3-year age or says these diseases are hard to cure.

**Ours lacks:** diagnosis, tank-fit, figures. **Plain lacks:** tank-fit, plan, follow-up, too-long, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình chưa tìm thấy trong cẩm nang trang nào mô tả đúng kiểu cá cong người rồi chết dần qua nhiều tuần. Trang gần nhất là bài về cá lệch bong bóng, nhưng triệu chứng đó thường là cá mất thăng bằng đột ngột chứ không phải cong người kéo dài. Với cá ngựa vằn bị cong người và chết lặp lại, mình nghi hai khả năng: nước bể đang có vấn đề kéo dài, hoặc cá bị nhiễm khuẩn mạn tính như bệnh lao cá (mycobacteriosis), loại này khó chữa và có thể lây sang cá khác. Bạn nên làm ngay các bước sau:
> 1. Đo amoniac, nitrit và nitrat hôm nay; chỉ số nào lệch thì thay nước từng phần và tìm nguyên nhân.
> 2. Cách ly …

**Plain** (1884 characters):

> Cá ngựa vằn bị cong người rồi chết thường gặp trong vài bệnh sau. Tôi không thể chẩn đoán chắc chắn chỉ từ mô tả, nhưng các khả năng phổ biến nhất là:
> 
> 1. **Bệnh lao cá (mycobacteriosis)** do *Mycobacterium* spp. Đây là bệnh mạn tính, hay gặp ở cá ngựa vằn và hay gây cong cột sống, gầy rộc, bụng phình, có thể có u hạt. Cá bệnh thường chết dần trong nhiều tuần, lây qua cá khác và có thể lây cho người.
> 
> 2. **Microsporidia *Pseudoloma neurophilia*** là ký sinh trùng gây tổn thương thần kinh và cột sống. Cá thường bơi bất thường, co giật, cong vẹo rồi gầy yếu và chết dần.
> 
> 3. **Nhiễm virus Nodavi…

### sick-02 · post · plain wins (6.5 · 7.5)

**Asked:** Nguyên nhân cá chết là gì ạ? Em có bể cá vàng, 7 màu và mấy loại linh tinh rẻ rẻ cho con chơi, nuôi trong nhà, mật độ thưa. Lọc với sục oxy chạy 24/24, nước trong sạch; em cho ăn rất ít, thức ăn viên mua sẵn; ít thay nước, chỉ thay khi thấy vẩn đục, có xử lý clo trước khi cho nước vào. Cái mút xốp lọc em giặt nước lã suốt vì phân cá hút lên nhanh bẩn. Vậy mà tuần nào cũng có con chết, tháng nào cũng đi mua thêm mà cứ chết dần.

**Judge:** Cả hai đều chỉ đúng thủ phạm là giặt mút bằng nước máy làm hỏng vi sinh, dẫn đến amoniac/nitrit. Y hơn nhờ đưa ra lịch thay 20–30% mỗi tuần, nêu chuyện nuôi chung cá vàng với cá nhiệt đới và cloramin, dù hỏi lại \"7 màu là loài nào\" hơi thừa; X có thứ tự và theo dõi rõ hơn nhưng thiếu lịch thay nước định kỳ. / Both correctly blame sponge washing and ammonia/nitrite, and Y has the clearer ordered plan and daily follow-up. X is more useful overall because it sets a weekly 20–30% water change, explains why clear water can still be toxic, and flags the goldfish–tropical temperature mismatch, while Y gives only a one-off change and misreads the hobbyist's routine.

**Ours lacks:** tank-fit, figures. **Plain lacks:** plan, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là bể đang tích amoniac và nitrit, vì lọc vi sinh bị yếu dần. Cái mút bạn giặt bằng nước lã là thủ phạm đáng ngờ nhất: nước máy có clo, và clo giết vi khuẩn có lợi sống trên mút, nên mỗi lần giặt lọc lại yếu thêm. Cộng với việc ít thay nước và chỉ châm thêm khi thấy đục, chất bẩn và amoniac cứ tích dần, rồi mỗi lần thả thêm cá mới lại gây thêm sốc. Cẩm nang ghi rằng amoniac, nitrit và clo đều giết cá, nên mình khuyên bạn đo nước trước khi đoán thêm. Mức chắc chắn của mình là khá, nhưng chỉ đo mới xác nhận được.
> 1. Mua bộ test nước (amoniac, nitrit, pH) và đo ngay h…

**Plain** (2226 characters):

> Nguyên nhân khả năng cao nhất là **độc tố amoniac/nitrit do hệ vi sinh lọc bị phá hỏng**. Cá chết dần, tháng nào cũng phải mua thêm là dấu hiệu điển hình của việc này.
> 
> **Vì sao xảy ra:**
> 
> 1. **Giặt mút lọc bằng nước máy/nước lã là nguyên nhân chính.** Trên mút lọc có một lớp vi khuẩn có lợi (vi khuẩn nitrat hóa) chuyên phân hủy amoniac từ phân và thức ăn thừa thành nitrit, rồi thành nitrat ít độc hơn. Clo trong nước máy và việc giặt sạch làm chết lớp vi khuẩn này. Bể mất khả năng "dọn" chất thải, amoniac tích tụ dần, cá chết từ từ. Bể trông vẫn trong nhưng độc tố vô hình.
> 
> 2. **Thay nước quá…

### sick-02 · tank · ours wins (7.75 · 4.75)

**Asked:** Bể tôi tuần nào cũng có cá chết dù nước trong và cho ăn ít, nguyên nhân là gì?

**Judge:** X chỉ đúng nguyên nhân từ thói quen của chính bể này (ít thay nước, giặt mút lọc bằng nước máy) và cho các bước theo thứ tự, dù lịch thay nước hơi thưa. Y chỉ liệt kê 10 nguyên nhân chung chung, không khoanh vùng, nên người đọc phải tự dò dù phần xử lý có ý đúng. / Y names the likely cause from this tank's own habits, infrequent water changes and sponge rinsing in tap water, then gives ordered steps and what to watch, though it hedges on the rinsing. X is a generic ten-cause list that buries the same fixes among unlikely causes and ignores the sparse stocking, aeration and dechlorination already in place.

**Ours lacks:** figures. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 2 pages):

> Nước trong không có nghĩa là nước an toàn. Amoniac, nitrit và nitrat không đổi màu nước, và bể của bạn đang có dấu hiệu tích bẩn lâu ngày: bạn chỉ thay nước khi vẩn đục, chỉ châm thêm, và có thể đang rửa mút lọc bằng nước máy, làm chết vi khuẩn có ích. Cá chết đều đặn mỗi tuần thường là do chất bẩn tích dần (giống hội chứng bể cũ trong cẩm nang), hoặc amoniac, nitrit đang lên mà bạn không thấy. Mình chưa biết thể tích bể và loại nước máy, nên mức chắc chắn là vừa phải; đo nước sẽ cho biết chắc hơn.
> 1. Đo ngay amoniac, nitrit, nitrat, pH và oxy hòa tan; nếu dùng nước máy thì đo thêm clo.
> 2. Th…

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

### sick-03 · post · ours wins (6.75 · 5.5)

**Asked:** Hồ em trồng minifiss, ráy và ít cắt cắm (sunset, rong la hán), nuôi tép màu và ít cá (bảy màu, otto, pigmy). pH lúc có CO2 đo được 7, KH 4, GH 8, TDS 360; nước nguồn TDS cao (160-200). Rong èo uột không phát triển, ráy ra lá non nhưng không khỏe, có rêu xanh bám lá, fiss phát triển chậm. CO2 em để 2-3 giọt/giây nhưng test CO2 vẫn báo thiếu. Tép bị chết lai rai, cá tầm 1-2 tuần chết 1 con. Có cách nào hạ TDS không, hay do đâu?

**Judge:** X correctly reads pH 7/KH 4 as about 10–15 ppm, confirms the test's low reading, and gives a short ordered plan, though it has no TDS target. Y has better TDS detail (RO top-off, targets, shrimp type) but wrongly blames the kit for the CO2 reading, misreads \"tầm\" as a fish, and is long. / Y correctly confirms CO2 is low from pH 7 and KH 4, then gives a short ordered plan, though its TDS guidance has no target or mix and it awkwardly admits the handbook gap. X gives more useful TDS and shrimp detail (RO top-off, target numbers, copper), but it calls 12 ppm enough, blames the test kit and misreads \"tầm\" as a fish, and it is long.

**Ours lacks:** figures, tank-fit. **Plain lacks:** too-long, wrong.

**Ours** (read 4 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là nước và dinh dưỡng chứ chưa phải lỗi đèn: TDS 360 với nguồn 160–200 cho thấy phần lớn khoáng đến từ nước máy và phân bón cộng dồn, còn pH 7 với KH 4 cho CO2 vào khoảng 10–15 ppm, thấp hơn mức 20–30 ppm cây cần, nên test CO2 báo thiếu là đúng. Cá và tép chết lai rai có thể do nitrat hoặc amoniac tích lại vì thay nước ít, giống kiểu bể lâu năm mà handbook gọi là old tank syndrome; mình chưa đo được nên chưa chắc chắn.
> 1. Đo ngay amoniac, nitrit và nitrat; nếu amoniac hoặc nitrit có số thì thay 30–50% nước và ngưng thêm thức ăn vài ngày.
> 2. Thay nước hằng tuần 30–5…

**Plain** (3801 characters):

> Mình nghĩ vấn đề không nằm ở một yếu tố mà là chuỗi liên quan: nước cứng và TDS cao, phần đo CO2 chưa chắc đúng, và có thể dinh dưỡng hoặc độc tố đang gây stress cho tép và cá.
> 
> ## 1. Đọc lại thông số
> 
> - **CO2:** Với KH 4 dKH (~71 ppm) và pH 7, lý thuyết CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển. Nếu test kit báo thiếu thì khả năng cao là kit đã hết hạn, đọc sai bảng màu, hoặc pH meter chưa hiệu chuẩn. Bạn nên:
>   - Hiệu chuẩn lại pH meter bằng dung dịch chuẩn 4.0 và 7.0.
>   - Dùng drop checker để theo dõi xu hướng (xanh vàng là đủ CO2 hay chưa).
>   - Đo pH sáng sớm trước khi bật đèn và …

### sick-03 · tank · ours wins (6.75 · 4.25)

**Asked:** Tép trong bể tôi chết lai rai và cá thỉnh thoảng chết một con, có phải do TDS cao không?

**Judge:** X dùng đúng số của bể (TDS 360, CO2 2–3 giọt/giây), nhận định thận trọng và cho các bước theo thứ tự kèm theo dõi, dù cách hạ TDS chưa khả thi với nước nguồn 160-200. Y đúng về TDS nói chung và có nhắc RO/nước mưa, nhưng chỉ là danh sách nguyên nhân chung, không dùng dữ liệu bể và còn hỏi lại những gì app đã có. / Y dùng đúng số liệu của bể (TDS 360, CO2 2-3 giọt/giây), trả lời thẳng rằng TDS chưa chắc là thủ phạm và cho các bước theo thứ tự kèm điều cần theo dõi, dù mốc 120–160 thấp hơn cả nước nguồn và một đoạn trích về ốc không liên quan. X là danh sách chung chung cho bể bất kỳ, nói nhiều về Caridina và hỏi lại những thông tin app đã có, nên khó biết làm gì trước.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, diagnosis, follow-up, plan.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình chưa chắc TDS là thủ phạm. Bể bạn đang 360, cao hơn mốc 120–160 mà handbook gợi ý sau khi thay nước, nên TDS có thể làm tép yếu và khó lột xác. Nhưng tép chết lai rai kèm cá thỉnh thoảng chết thường do chất lượng nước như amoniac, nitrit, oxy thấp hoặc CO2 thất thường. Handbook không nói rõ TDS cao giết tép nhanh, nên đây là suy đoán từ những gì bạn kể.
> 1. Đo amoniac, nitrit và pH ngay, nhất là vào sáng sớm để xem oxy và pH có tụt không.
> 2. Thay khoảng 20–30% nước, châm nước có TDS gần với bể, không đổi đột ngột để tránh sốc cho tép.
> 3. Kiểm tra máy lọc còn chạy, có sục khí đủ, và bể khô…

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

### sick-04 · post · ours wins (6.5 · 5)

**Asked:** Mình chơi bể 60x40x40, set được gần 3 tháng, layout núi đá dùng đá da voi màu trắng nên pH ở ngưỡng 7,8-8. Thảm nền trồng trân châu ngọc trai, mấy ngọn rau thơm cắm khe đá, có vảy ốc xanh và vảy ốc đỏ. Để hạ pH, mình bổ sung thêm vật liệu lọc Neo Soft, vừa cho vào chạy thì chỉ khoảng 10 giây sau tép chạy loạn hết rồi chết dần. Sau đó thảm trân châu và rau thơm bị rữa lá, pH luôn ở 8,4, sục CO2 cũng chỉ xuống 7,4 trong khi nước đầu vào 7,0 trở xuống. Vảy ốc thì có vết như gãy ngang ngọn lá nhưng lá vẫn xanh, không rụng. Mình nên xử lý sao?

**Judge:** X nhận đúng Neo Soft là nguyên nhân chính, hiểu vảy ốc là cây và đưa các bước gọn, an toàn, dù ít số liệu và nguyên nhân gãy ngọn còn đoán yếu. Y có lộ trình lâu dài với nước RO và KH chi tiết hơn, nhưng nhầm vảy ốc thành ốc Neritina và coi amoniac là thủ phạm chính, nên chẩn đoán lệch và kém tin cậy. / Y nhận đúng Neo Soft là nguyên nhân sốc, hiểu vảy ốc là cây và đưa ra các bước ngắn gọn, có theo dõi, dù hơi mỏng và thiếu chi tiết. X có kế hoạch và phần KH, RO kỹ hơn, nhưng nhầm vảy ốc thành ốc Neritina và đổ chính cho amoniac, nên chẩn đoán sai hướng.

**Ours lacks:** figures, too-thin. **Plain lacks:** diagnosis, wrong, too-long.

**Ours** (read 0 pages, stopped at the tools limit):

> Mình nghi nguyên nhân chính là Neo Soft: tép chạy loạn rồi chết chỉ sau khoảng 10 giây khi vật liệu vừa được cho vào chạy, cho thấy nước bị sốc hóa chất. Rau thơm và trân châu rữa lá sau đó, pH không xuống, và đá da voi trắng giữ độ cứng carbonate cao nên pH cứ bám ở 8,4. Cẩm nang chưa trả lời trực tiếp trường hợp này nên phần dưới là kinh nghiệm chung của mình, không phải từ trang cẩm nang.
> 1. Tháo Neo Soft khỏi bể lọc ngay và không cho chạy lại.
> 2. Thay khoảng 30% nước bằng nước đã khử clo, cùng nhiệt độ với bể, để đưa bể về trạng thái trước khi thêm vật liệu.
> 3. Test amoniac và nitrit; cắt…

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

### sick-04 · tank · plain wins (5.25 · 6.25)

**Asked:** Tôi vừa thêm vật liệu lọc hạ pH thì tép chạy loạn rồi chết dần, phải làm gì?

**Judge:** Both correctly say to remove the media and change 20-30% of the water, but neither addresses Neo Soft fighting the đá da voi at pH 8.4 or the CO₂ running in the tank. Y is more useful because it adds aeration, ammonia/nitrite and KH checks, target parameters and a safe rate of pH change, though it is longer and gives no recheck timing; X is tidier with a follow-up but thinner. / Both correctly say to remove the media and change 20-30% of the water, but neither sees that the elephant-skin rock (đá da voi) drives the pH 8.4 or names Neo Soft. X edges ahead with aeration, ammonia/nitrite checks and target ranges for shrimp, while Y has a clearer cause and follow-up but less to act on.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** tank-fit, follow-up, too-long.

**Ours** (read 2 pages, stopped at the calls limit):

> Mình đoán nguyên nhân khá chắc là pH giảm quá nhanh sau khi bạn thêm vật liệu hạ pH. Tép rất nhạy với thay đổi đột ngột, và sốc này dễ làm tép lột xác hỏng hoặc yếu dần rồi chết. Handbook chưa có trang riêng về vật liệu hạ pH cho tép, nên phần dưới là kinh nghiệm chung của mình.
> 1. Đo pH và độ cứng (GH, KH) ngay bằng bộ test, rồi so với lúc trước khi thêm vật liệu.
> 2. Lấy vật liệu hạ pH ra khỏi bể hoặc ngăn lọc, không thêm lại và không thêm hóa chất hạ pH nào khác.
> 3. Thay khoảng 20-30% nước bằng nước đã khử clo, có nhiệt độ và pH gần với bể, để kéo pH về gần mức cũ từ từ.
> 4. Giữ bể yên, khôn…

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

### sick-05 · post · tie or split (6.5 · 6.5)

**Asked:** Bể của tôi set được 2 tháng, có đèn, oxy, CO2, nhưng gần đây nước trong bể có màu vàng nâu, cá thì chết lai rai. Tôi thay nước cách ngày 50% (dùng nước lọc loại mua uống hằng ngày) mà vẫn không hết. Giúp tôi với.

**Judge:** Y names the mineral-poor drinking water as the likely mistake and checks CO2 excess, which matters in this CO2 tank, but it is long and ends with many questions. X is tidier and more clearly ordered, with sound advice, yet it treats the drinking water as a side note and never mentions CO2 as a possible killer. / Both name ammonia/nitrite and very soft bottled water as suspects, and both say tannin alone doesn't kill fish. X alone checks CO₂ and light, but it is long, its order is muddled and it ends in a long list of questions; Y gives a short ordered plan with a recheck time, though it misses the CO₂ the hobbyist mentioned, so Y wins narrowly.

**Ours lacks:** tank-fit, figures. **Plain lacks:** too-long, plan.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân nhiều khả năng là bể chưa ổn định sinh học hoặc nước đang bị xấu đi (amoniac, nitrit hoặc pH tụt), chứ màu vàng nâu chỉ là dấu hiệu đi kèm. Nước vàng nâu thường do tanin từ lá bàng, lũa hoặc vật liệu gỗ, nhưng tanin không giết cá. Cá chết lai rai trong bể 2 tháng tuổi thường do amoniac hoặc nitrit tích lại, hoặc thiếu oxy. Mình chưa đo được nước nên chưa chắc chắn, cẩm nang chưa có trang nào nối đúng trường hợp của bạn. Bạn làm theo các bước sau:
> 1. Đo ngay amoniac, nitrit, pH và độ cứng (KH) bằng bộ test. Ghi lại để so sánh sau mỗi lần thay nước.
> 2. Ngưng cho ăn ít nhất…

**Plain** (3054 characters):

> Nước vàng nâu kéo dài kèm cá chết dần thường có nguyên nhân chính không phải là "nước bẩn" đơn thuần. Bạn nên kiểm tra theo thứ tự sau.
> 
> ## 1. Xác định màu nước do đâu
> 
> - **Tannin (chất màu từ gỗ, lá):** Nếu bạn có lũa, lá bàng, lá khô, hoặc than bùn, nước sẽ vàng nâu như trà. Loại này thường không gây hại trực tiếp, nhưng không thể gây cá chết hàng loạt.
> - **Chất hữu cơ phân hủy:** Thức ăn thừa, cá chết, lá úa, phân cá tích tụ, nền đất/sỏi bị thối. Đây là nguyên nhân hay gặp nhất khi bể mới 2 tháng.
> - **Tảo silic (diatom):** Lớp màu nâu bám trên kính, lá, sỏi, thường gặp ở bể mới có đèn mạnh…

### sick-05 · tank · ours wins (8 · 4)

**Asked:** Nước bể tôi ngả vàng nâu và cá chết lai rai dù thay nước thường xuyên, vì sao?

**Judge:** X nhắm đúng điểm mấu chốt của bể này: thay 50% cách ngày bằng nước đóng bình nghèo khoáng cùng CO2 dễ làm tụt KH và pH, kèm phép thử CO2 cụ thể và thứ tự xử lý rõ. Y chỉ liệt kê nguyên nhân chung chung, bỏ qua CO2 và nguồn nước thực tế, lại dài và kết thúc bằng một loạt câu hỏi ngược. / Y nhắm đúng điểm mấu chốt: thay nhiều bằng nước uống đóng bình nghèo khoáng cộng CO₂ gây tụt pH, kèm bài thử CO₂ và các bước theo thứ tự, dù giả định có lũa. X chỉ liệt kê nguyên nhân chung chung, bỏ qua dữ kiện của bể và còn hỏi lại nguồn nước.

**Ours lacks:** figures. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là nước đang thiếu độ kiềm và độ cứng vì bạn chỉ thay bằng nước uống đóng bình, nên pH dễ tụt mạnh khi bể có CO2 và mỗi lần thay nước. Bể mới khoảng 60 ngày cũng có thể lọc vi sinh chưa ổn định, nên amoniac hoặc nitrit có thể tích lại giữa các lần thay. Lũa chỉ giải thích màu vàng nâu do tannin, không giải thích cá chết, nhưng nó cũng làm pH giảm. Mình chưa chắc chắn khi chưa đo, nên bạn cần kiểm tra trước.
> 1. Đo ngay pH, amoniac, nitrit, nitrat, oxy hòa tan, độ kiềm (KH) và độ cứng (GH) nếu có bộ test.
> 2. Làm thử CO2: múc một xô nước bể, sục khí 1 giờ rồi đo lại …

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

**Judge:** Y kiểm tra thêm pH, độ cứng và clo, đồng thời có cách giảm stress thực tế như che ba mặt kính, giảm đèn và cho ăn đều giờ, nên sát nguyên nhân sau chuyển bể hơn, dù dài và khá chung chung. X gọn và nhắc đúng việc chuyển vật liệu lọc cũ, nhưng bỏ sót pH và giảm stress, dải nhiệt có mức 22°C quá thấp, và hướng dẫn theo dõi còn mơ hồ. / X covers both likely causes with usable steps: water testing and changes, plus dark backing, lower light and tempting foods like crickets and shrimp, with clear warning signs, though it is long and generic. Y is tidy and states the cause up front, but it gives no way to reduce the stress it blames, uses a low temperature range, and reads awkwardly with its 'Handbook' and sourcing remarks.

**Ours lacks:** plan, follow-up, too-thin, local. **Plain lacks:** too-long, tank-fit.

**Ours** (read 3 pages, stopped at the calls limit):

> Gần một tuần sau khi chuyển bể mà cá rồng vẫn bỏ ăn, trong khi cá còn bơi bình thường và chưa nằm đáy, nhiều khả năng cá đang stress vì chuyển bể kèm nước bể mới chưa ổn định. Handbook ghi cá mới bị stress thường không đụng tới đồ ăn trong 24–72 giờ đầu, nên một tuần là lâu hơn bình thường. Bể mới chưa có vi sinh nên nước dễ xấu, đây là điều mình suy ra từ kinh nghiệm chung chứ không phải từ trang nào.
> 1. Test ngay amoniac, nitrit và nitrat bằng bộ test nhỏ giọt. Nếu amoniac hoặc nitrit trên 0, thay 30–50% nước.
> 2. Kiểm tra nhiệt độ bể mới trong khoảng 22–28°C và cho giống bể cũ.
> 3. Kiểm tra …

**Plain** (3108 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là chuyện khá thường gặp. Nếu cá vẫn bơi bình thường, không nằm đáy, không đổi màu thì chưa phải cấp cứu, nhưng bỏ ăn gần 1 tuần thì bạn cần xử lý ngay. Bạn nên làm theo các bước sau.
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻):** Bể mới chưa chạy nitơ (chưa "cycle") thì hai chỉ số này dễ tăng cao và gây stress, mất cảm giác thèm ăn. Mục tiêu là 0 ppm cho cả hai.
> - **Nitrat:** Giữ dưới 40 ppm, lý tưởng dưới 20 ppm.
> - **pH và độ cứng:** Khác biệt lớn so với bể cũ cũng gây sốc. Nếu nước bể cũ và bể mới khác nhau nhiề…

### sick-06 · tank · ours wins (7.25 · 5.75)

**Asked:** Cá rồng của tôi bỏ ăn gần một tuần từ khi chuyển sang bể mới, làm sao?

**Judge:** X names the likely cause, an uncycled new tank, and gives a short ordered plan with water-change triggers, surface feeding and warning signs, and it uses the note that the fish still swim normally. Y is sound, and its 1–2 week fasting reassurance is useful, but it is long and generic and asks for details rather than tying advice to this one-week-old tank; neither answer suggests carrying over old-tank filter media. / Y nêu ngay nghi vấn bể mới chưa ổn định, dùng chi tiết cá vẫn bơi bình thường và đưa ra các bước gọn cùng mốc theo dõi; X đúng hướng nhưng dài, chung chung và hỏi lại điều app đã biết. Cả hai đều bỏ sót việc chuyển vật liệu lọc cũ và tải bẩn từ cá mồi.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Cá rồng bỏ ăn sau khi chuyển bể thường do stress vì đổi chỗ, nhưng một tuần là lâu hơn mức cá mới hay ăn lại sau 2–3 ngày, nên mình nghi bể mới chưa ổn định về nước (amoniac, nitrit) hoặc nhiệt độ đổi đột ngột. Bạn ghi cá vẫn bơi bình thường là tín hiệu tốt, nhưng vẫn cần kiểm tra ngay.
> 1. Test amoniac, nitrit, nitrat, pH và nhiệt độ bằng bộ test nhỏ giọt, dùng thêm một nhiệt kế thứ hai để đối chiếu.
> 2. Nếu amoniac hoặc nitrit trên 0, thay 30–50% nước bằng nước đã khử clo và cùng nhiệt độ với bể.
> 3. Nếu bể mới chưa chạy hệ vi sinh, đừng thêm cá nào nữa và theo dõi test mỗi vài ngày cho tới kh…

**Plain** (2612 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là phản ứng khá phổ biến vì chúng rất nhạy với stress. Tuy vậy, một tuần là đủ lâu để bạn cần kiểm tra kỹ. Bạn có thể làm theo các bước sau:
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - Dùng bộ test để đo **amonia (NH₃/NH₄⁺), nitrit (NO₂⁻), nitrat (NO₃⁻), pH, nhiệt độ**.
> - Amonia hoặc nitrit lớn hơn 0 là dấu hiệu nguy hiểm. Bể mới chưa chạy xong chu trình nitơ (cycling) rất dễ xảy ra tình trạng này.
> - Nếu có amonia/nitrit: thay 25–30% nước mỗi ngày, dùng nước đã khử clo và có nhiệt độ, pH gần với bể cũ. Không thay quá nhiều một lúc vì sẽ gây sốc thêm.
> -…

### sick-07 · post · plain wins (6 · 7.5)

**Asked:** Em vừa lật bể, vứt nền sỏi nhỏ đi vì thấy bẩn quá, thì tự nhiên thấy 1 con bị như nấm trắng. Em đang tách riêng, cho ít muối hột vào xem có khỏi không. Như vậy đã đúng chưa, cần làm gì thêm?

**Judge:** Y correctly explains that discarding the gravel removes beneficial bacteria, and gives a usable salt dose, sensitive-species warnings, quarantine setup, a 3–5 day switch to methylene blue and warning signs. X names the fungus more decisively and is tighter, but misreads the gravel step, gives no treatment timeline or escalation, and its unnatural 11.4-litre dose reads like a translation. / X giúp phân biệt đốm trắng, nấm và vi khuẩn, nêu rõ liều muối, cách chăm bể cách ly, bước chuyển thuốc, và chỉ đúng rủi ro mất vi sinh khi bỏ sỏi. Y gọn và nêu đúng cơ chế nấm bám vết thương nhưng hiểu nhầm vứt sỏi thành xới sỏi, cấm muối ăn quá mức và không có hướng tiếp theo nếu muối không hiệu quả.

**Ours lacks:** tank-fit, figures, follow-up. **Plain lacks:** too-long.

**Ours** (read 2 pages):

> Mảng trắng như bông gòn thường là nấm thủy mi (Saprolegnia). Nấm hiếm khi đụng tới cá khỏe, nên nhiều khả năng con cá này bị xước hoặc stress khi bạn lật bể, xới sỏi làm đục nước, và nấm bám vào chỗ da hoặc vây đã tổn thương. Việc tách riêng và cho muối là đúng hướng. Mình chưa biết loài cá, nên bạn làm thêm các bước sau:
> 1. Trong bể cách ly, cho muối hồ cá theo mức 1: 1 muỗng canh cho 11,4 lít nước. Hòa muối trước rồi đổ vào, không dùng muối ăn.
> 2. Giữ muối trong bể cách ly đến khi cá trông khỏe hẳn, rồi thay khoảng 30% nước để rút muối ra.
> 3. Kiểm tra lại bể chính sau khi xới sỏi: đo amonia…

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

### sick-07 · tank · tie or split (6.75 · 6.75)

**Asked:** Sau khi lật bể, một con cá của tôi bị nấm trắng, tách riêng và cho muối đã đủ chưa?

**Judge:** X links the fungus to wounds and debris from the flip, gives a sourced salt dose, escalates only if needed and flags columnaris, the key look-alike, though it names no medicine and is vague on duration. Y is more concrete with water tests, methylene blue and 5-7 days, but it blames water quality alone, misses the wound cause and columnaris, and reads more generically. / X is easier to act on after a tank flip: it covers testing NH3/NO2, water changes, salt in g/L, methylene blue (easy to buy in Vietnam) and a 5-7 day course. Y explains wounds and stirred-up debris well and usefully flags columnaris, but it skips ammonia/nitrite testing, names no medicine in its text and uses a less familiar spoon-per-11.4-litre dose.

**Ours lacks:** figures, local, plan. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 2 pages):

> Mình nghĩ tách cá và cho muối là đúng hướng, nhưng muối một mình thường chưa đủ. Nấm thủy mi hầu như chỉ bám vào cá đã có vết thương hoặc đang yếu, mà lật bể dễ làm xước da, khuấy cặn bẩn và bào tử nấm lên. Cần xử lý nguyên nhân cùng lúc với chữa, nếu không bệnh sẽ quay lại.
> 1. Xem kỹ cá bị nấm: có vết xước, vây rách hay mang bị thương không, và búi nấm mọc ở đâu.
> 2. Dọn cặn, lá thối và chất hữu cơ dưới nền, rồi kiểm tra lại lọc và lượng oxy sau khi lật bể.
> 3. Nếu bạn dùng muối mức 1 (1 muỗng canh cho 11,4 lít nước) trong bể cách ly, giữ đến khi cá khỏe hẳn, rồi thay 30% nước không thêm muối …

**Plain** (1892 characters):

> Muối **chưa đủ** nếu bạn chỉ dùng muối. Cá bị nấm sau khi lật bể thường là hệ quả của nước xấu (amoniac, nitrit tăng cao), nên cần xử lý cả nguyên nhân lẫn con cá.
> 
> **Việc nên làm ngay:**
> 
> 1. **Cách ly cá đúng cách:** Dùng bể riêng có sục khí, lọc nhẹ hoặc không lọc (tránh hút cá vào máy), không trồng cây, không đặt nền sỏi.
> 2. **Kiểm tra nước bể cũ và bể cách ly:** Dùng bộ test để đo NH3/NH4+, NO2-, NO3-, pH. Nếu amoniac hoặc nitrit > 0, thay nước ngay (khoảng 30-50%) và thay từng phần hằng ngày cho đến khi ổn định. Nước bể cách ly phải sạch, cùng nhiệt độ và pH với bể cũ.
> 3. **Thuốc trị nấm…

### sick-08 · post · ours wins (7 · 5.75)

**Asked:** Hồ mình đang có rêu tảo hại nên mình thử nuôi otto. Thả vào thì cá rất khỏe, bơi kiếm ăn (không quá manh động), nhưng sau một đêm 3 con chết hết, sáng ra thấy nằm im, đụng vào không nhúc nhích. Cùng lúc đó có một đàn neon trong bể vẫn bình thường mà otto thì chết. Vì sao vậy?

**Judge:** X names a realistic main cause (weak, stressed, possibly wild-caught otto) and gives short ordered steps, though its 4–5 hour bag advice is flawed and it misses algae chemicals and oxygen. Y usefully raises chemicals and night aeration, but it is a long list of five causes with an unsupported top pick and a looser plan. / Y leads with the most realistic cause, weak wild-caught otto shocked on arrival, and gives ordered steps including water tests, acclimation and feeding, though its bag-soak advice is loose and it omits algae chemicals. X usefully raises algae chemicals but is a scattered list topped by a doubtful night-oxygen diagnosis.

**Ours lacks:** diagnosis, tank-fit, figures. **Plain lacks:** too-long, plan, follow-up, diagnosis, tank-fit.

**Ours** (read 3 pages):

> Mình nghĩ nguyên nhân nhiều khả năng là đàn otto bạn mua là cá bắt tự nhiên, sức chịu stress kém, nên sốc khi vào bể mới dù lúc đầu vẫn bơi khỏe. Neon vẫn bình thường nên không phải lỗi chung của cả bể. Cẩm nang ghi rằng otto bắt tự nhiên hay chết sau khi về, và thay đổi thông số nước đột ngột cũng làm cá sốc. Mình chưa biết bể đã chạy được bao lâu, nên cũng cần loại trừ chất lượng nước.
> 1. Kiểm tra ngay amoniac, nitrit và pH trong bể; nếu amoniac hoặc nitrit có số đo thì thay nước một phần trước.
> 2. Hỏi lại tiệm lô cá đó bắt tự nhiên hay nuôi sinh sản và đã ở tiệm bao lâu; lần sau ưu tiên lô…

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

### sick-08 · tank · plain wins (5.5 · 6.5)

**Asked:** Tôi thả cá otto ăn rêu mà sau một đêm chết hết trong khi neon vẫn khỏe, vì sao?

**Judge:** Y names the causes that really kill otto overnight (ammonia/nitrite, low oxygen, acclimation shock, chlorine, copper algae killers), with a sensible 30–60 minute drip, though it is a long, unranked list that asks for details. X is tidier and has ordered steps, but it leads with a feeding cause that cannot explain overnight death, and it gives care advice for fish that are already dead. / X giải thích đúng hơn các nguyên nhân chết nhanh như sốc nước, cá yếu sẵn sau vận chuyển, NH₃/NO₂, thiếu oxy và thuốc diệt rêu chứa đồng, dù dài và chưa xếp theo khả năng xảy ra. Y gọn và có bước làm rõ hơn nhưng đoán nguyên nhân thức ăn không hợp với cái chết sau một đêm và khuyên chăm 'đàn còn lại' dù otto đã chết hết.

**Ours lacks:** diagnosis, tank-fit. **Plain lacks:** plan, too-long, tank-fit, follow-up.

**Ours** (read 2 pages, stopped at the calls limit):

> Mình đoán nguyên nhân nhiều khả năng là cá otto bắt tự nhiên, chưa quen thức ăn viên, hoặc bể chưa đủ ổn định với loài nhạy như otto, trong khi neon khỏe hơn nên trụ được. Mình chưa thể chắc khi chưa biết cá mua từ đâu, bể đã chạy bao lâu và lúc thả có làm quen nước không, nên bạn kiểm tra theo các bước sau:
> 1. Test ngay amoniac và nitrit trong bể. Nếu có số đo cao, thay khoảng 30% nước bằng nước cùng nhiệt độ.
> 2. Nhớ lại lúc thả: nếu nước trong túi chênh nhiều về nhiệt độ hoặc pH so với bể, lần sau nên làm quen nước 4–5 tiếng bằng xô và ống nhỏ giọt.
> 3. Với đàn còn lại, giữ tảo trong bể cho …

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

### sick-09 · post · plain wins (5.25 · 7.25)

**Asked:** Nhà mình có bể cá ngoài trời 3x1,5m, sâu có 30 phân, đáy lát đá hoa, có hệ thống lọc nước và hút đáy, thêm 1 bơm nước tạo oxy. Trước mua koi về được mấy hôm là lăn ra chết, thế là thả cá chép cho khỏe, mà nay 6-7 con lại chết. Trời đang lạnh ngắt, mình không có dụng cụ đo oxy, không biết do trời lạnh hay sao. Bể này bố mình làm, trước có thả hoa súng nhưng cá rỉa hết. Bắt bệnh giúp mình, nên sửa lọc thế nào, có cần đào sâu thêm không, đáy lát đá hoa có ổn không?

**Judge:** Y answers everything asked (likely causes, filter fixes, depth with a deep-corner option, marble floor) and gives no-meter checks and first steps, though it is long and ends with many questions. X has a sensible disease warning and short steps, but it skips the filter question and offers little for this particular tank. / X answers every question asked: likely causes, how to fix the filter, digging a deep corner and the marble floor, with practical checks and steps, though it is long and leans on water quality. Y sensibly suspects disease from the koi and is concise, but it skips the filter question entirely and stays thin on digging.

**Ours lacks:** tank-fit, plan, too-thin. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình chưa thể chắc nguyên nhân khi chưa có số đo nước, nhưng khả năng cao nhất là bệnh lây từ cá koi mua về, vì koi chết ngay sau khi mua rồi cá chép thả sau cũng chết dần. Cẩm nang nói koi hay bị herpes (KHV) và bệnh vi-rút mùa xuân, cả hai đều chưa có thuốc chữa, nên lúc này việc chính là cách ly và giảm stress. Thiếu oxy và amoniac cao cũng dễ giết cá, nên mình nêu luôn để bạn kiểm tra song song.
> 1. Ngừng cho ăn khi nước xuống dưới khoảng 10–15°C, vì thức ăn thừa thối làm amoniac tăng.
> 2. Vớt cá đang lờ đờ hoặc có dấu hiệu bệnh ra thùng riêng có sục khí; không vứt cá chết xuống ao và đừng …

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

### sick-09 · tank · ours wins (6.5 · 4)

**Asked:** Cá trong bể tôi thả vào mấy hôm là chết, trời lạnh lại chết thêm, do đâu?

**Judge:** X gives a short ordered plan that suits cold-weather koi keeping: test ammonia and nitrite, make temperature-matched water changes, aerate, cut feeding, shelter the pond, and watch for ich, though it underplays an uncycled pond and has some small-tank tips. Y does name the cycling cause but is a generic checklist aimed at heated tropical tanks, and it ends by asking for details it doesn't have. / Y nêu thẳng nguyên nhân rét và mất ổn định kèm các bước gọn: đo nước, thay nước ấm, sục khí, giảm ăn, che gió, nên gần với bể ngoài trời hơn. X là danh sách chung cho bể cá nhiệt đới trong nhà, nói về heater 24–26°C và betta, neon, rồi hỏi ngược lại; cả hai đều bỏ sót độ nông 30 cm và bệnh koi như KHV.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 2 pages):

> Mình đoán nguyên nhân chính là đợt rét làm cá bị sốc nhiệt và bể mất ổn định. Nước lạnh làm vi sinh lọc chậm lại nên amoniac hoặc nitrit có thể tăng, còn cá thả mới thì chưa kịp quen nước. Mình chưa có số đo nước nên chưa chắc chắn, bạn nên kiểm tra theo thứ tự sau.
> 1. Hôm nay đo amoniac và nitrit bằng bộ test. Nếu một trong hai có chỉ số, thay khoảng 20–30% nước.
> 2. Khi thay nước, dùng nước đã khử clo và gần nhiệt độ nước bể, không đổ nước lạnh thẳng vào.
> 3. Bật sục khí và lọc suốt ngày đêm để bù oxy. Cá lớn bị thiếu oxy trước, nên nếu thấy cá ngoi lên đớp khí thì đây là dấu hiệu cần xử lý n…

**Plain** (2551 characters):

> Cá chết sau vài ngày thả vào và chết thêm khi trời lạnh thường có liên quan đến **chất lượng nước** và **nhiệt độ**. Các nguyên nhân thường gặp:
> 
> ## 1. Nước chưa "chín" (chưa cycling)
> Đây là nguyên nhân phổ biến nhất với bể mới.
> - Cá thải ra **amoniac (NH₃/NH₄⁺)**, và amoniac rất độc. Vi khuẩn có lợi trong bể chuyển nó thành nitrit, rồi thành nitrat, nhưng bể mới chưa đủ vi khuẩn nên amoniac và nitrit tích tụ.
> - Cá chết sau 2–7 ngày, thường có dấu hiệu thở gấp, nổi đầu lên mặt nước, mang đỏ hoặc tái, lờ đờ, bơi lảo đảo.
> - **Cách kiểm tra:** dùng bộ test nước (API hoặc tương đương) đo amoniac,…

### stocking-01 · post · ours wins (7.5 · 4.5)

**Asked:** Em mới tập chơi lại bể cá. Ban đầu hỏi loại nào dễ nuôi, khỏe thì được tư vấn mua 2 cá vàng, 2 con bống (bảo nó ăn phân thừa) và 2 con dọn bể. Được vài hôm 1 con cá vàng chết, nghi đánh nhau. Em mua thêm 10 con 7 màu bé thả vào, vài hôm còn 9, 8 rồi 7 mà không thấy xác. Lạ nhất là 1 con 7 màu bụng to như chửa cũng biến mất. Hôm qua 1 con bống chết, nay con dọn bể chết và mất thêm 2 con 7 màu. Con bống với con dọn bể còn nửa xác, thấy con bống còn lại thỉnh thoảng rỉa. Có phải chúng đánh nhau và con to ăn con bé không? Vậy chỉ được thả cá sàn sàn nhau thôi à?

**Judge:** X đưa ra chẩn đoán hợp lý (nước xấu, quá tải, cá chết rồi bị ăn xác, bống có thể ăn cá bé) kèm các bước xử lý rõ, thay nước mạnh theo kết quả đo và dấu hiệu cần theo dõi, dù chưa giải thích con bụng to. Y giải thích nhiều hơn nhưng gọi bảy màu là hung dữ và khuyên nuôi chúng với cá lớn trong bể 200 lít, là lời khuyên sai có thể khiến người chơi mất cá tiếp. / Y gives the likely cause (water and overstocking, with the bống and cleaner scavenging and the bống possibly preying on weak small fish) and an ordered plan with what to watch for, plus a relevant guide excerpt. X has the same water diagnosis but calls guppies aggressive and gives backwards stocking advice with an invented 200 L figure.

**Ours lacks:** tank-fit, figures. **Plain lacks:** wrong, figures, too-long.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là nước trong bể và mật độ cá, chưa chắc là cá to ăn cá bé. Cá vàng thải rất nhiều chất bẩn, bể nhỏ mà thả thêm 10 con bảy màu cùng lúc thì amoniac, nitrit tăng và thiếu oxy. Con yếu chết trước, rồi bống và cá dọn ăn xác. Bống có thể ăn cá bé yếu nên cũng có phần, nhưng mình chưa đủ dữ kiện để kết luận. Cẩm nang chưa có trang riêng cho bống và cá dọn nên phần này mình dựa trên kinh nghiệm chung.
> 1. Đo ngay amoniac, nitrit, pH và nhiệt độ nước; nếu amoniac hoặc nitrit cao, thay ít nhất 50% nước.
> 2. Vớt hết xác cá ra ngay, đừng để thối trong bể, và tạm ngưng cho ăn 1…

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

### stocking-01 · tank · ours wins (7.25 · 4.5)

**Asked:** Bảy màu trong bể tôi cứ biến mất không thấy xác, có phải bị cá khác ăn không?

**Judge:** X dựa vào đúng bể của người hỏi (cá vàng, tỳ bà, bống rỉa xác), trả lời thẳng và cho các bước đếm cá, quan sát, thử nước, tách cá kèm mốc 1–2 tuần, dù quên khả năng cá nhảy ra ngoài. Y có ý hay là kiểm tra cá nhảy và đậy nắp, nhưng chỉ là danh sách nguyên nhân chung, nêu các loài không có trong bể và còn hỏi lại những loài đang nuôi. / Y uses the actual tank (cá vàng, bống, cá dọn bể, the note that bống rỉa xác), names the likely cause, is honest about uncertainty, and gives ordered steps with a 1–2 week check, though it omits fish jumping out. X is a generic list that names fish this tank does not have, never addresses the goldfish or bống as suspects, and ends by asking for details the hobbyist's tank record already holds, though it does usefully mention checking the lid and floor.

**Ours lacks:** figures. **Plain lacks:** tank-fit, diagnosis, too-long, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ nhiều khả năng là bị cá khác ăn, nhưng chưa chắc chắn. Trong bể bạn có cá vàng, cá tỳ bà và bống. Ghi chú của bạn cho biết bống rỉa xác, nên xác cá bảy màu có thể đã bị ăn sạch trước khi bạn thấy. Cẩm nang nói cá bảy màu con rất dễ thành mồi cho cá khác trong bể. Cẩm nang chưa nói rõ bống có ăn cá trưởng thành hay không, nên phần này mình dựa vào kinh nghiệm chung.
> 1. Đếm lại cá bảy màu mỗi ngày, ghi riêng cá lớn và cá con để biết con nào mất.
> 2. Nếu mất chủ yếu là cá con, tạo nhiều cây dày hoặc lá khô ở một góc để cá con có chỗ trốn.
> 3. Nếu có cá cái sắp đẻ, đưa cá mẹ vào hộp đẻ để…

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

### stocking-02 · post · ours wins (8 · 4.75)

**Asked:** Hồ em 60x40x40, được 1 tuần, đang thả 5 mún + 5 chuột, cá đang tung tăng tốt. Em tính thả thêm 40 neon nữa vậy có nhiều không? Mún có sống chung với neon được không?

**Judge:** X nhận đúng mún là platy, khẳng định sống chung được, tính tải theo đúng đàn cá hiện có và đưa lộ trình thả theo đợt kèm dấu hiệu cần theo dõi. Y cũng khuyên giảm số lượng và thả dần, nhưng không biết mún là cá gì nên bỏ ngỏ câu hỏi chính và phải hỏi lại. / Y nhận đúng mún là platy, trả lời thẳng là sống chung được, rồi đưa kế hoạch thả theo đợt kèm dấu hiệu cần theo dõi; phép tính tải có chỗ hơi lệch và thiếu lưu ý về thay nước hay khác biệt pH. X có lời khuyên đúng về chia đợt nhưng không biết mún là cá gì nên bỏ lửng câu hỏi chính và phải hỏi ngược lại.

**Ours lacks:** figures. **Plain lacks:** tank-fit, follow-up, diagnosis, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Mún (cá platy) sống chung được với neon xanh: cả hai đều hiền, và trang cá platy ghi neon xanh là loài hợp. Nhưng 40 neon là nhiều, và bể 1 tuần tuổi chưa nên thả ngay.
> 
> Bể 60×40×40 khoảng 96 lít. Theo cách tính của cẩm nang, mún cần khoảng 4 lít mỗi con và cá nhỏ khoảng 2 lít. Hiện 5 mún và 5 chuột đã chiếm khoảng 30 lít. Nếu bể không lọc, 40 neon (khoảng 80 lít) sẽ vượt quá mức 96 lít. Nếu có lọc và sủi, cẩm nang cho phép thêm tối đa 30–50%, tức khoảng 140 lít, nên 40 neon vẫn sát giới hạn. Trang neon xanh còn ghi bể mới không phù hợp với neon vì chúng không chịu được biến động khi bể khởi …

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

### stocking-02 · tank · ours wins (6.25 · 3.75)

**Asked:** Bể của tôi thả thêm 40 con neon có nhiều quá không, nuôi chung với mún được không?

**Judge:** X uses the real tank and fish, says 40 is too many, and gives a staged plan starting at 10–15 neon, though it misses the 1-week cycling risk and fumbles mún despite naming platy. Y gives generic advice, asks for the tank size, leans towards allowing 40, and does not recognise mún, though it rightly mentions ammonia and nitrite. / Y uses the real tank (96 L, 5 platy, 5 cá chuột), says 40 is too many and gives a staged 10–15 fish plan with checks, though it misses the 1-week age and ammonia/nitrite tests. X is generic, asks for the tank size, doesn't recognise mún, and leans towards allowing 40 neon in a new tank.

**Ours lacks:** diagnosis, local. **Plain lacks:** tank-fit, plan, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình thấy 40 con neon là hơi nhiều với bể 60×40×40 cm (khoảng 96 lít) đang có 5 platy và 5 cá chuột. Theo cách tính trong cẩm nang, mỗi cá nhỏ cần khoảng 2 lít, nên tổng cộng gần hoặc vượt mức của bể. Chỉ khi bể có lọc và sủi tốt mới có thể thêm khoảng 30–50% số cá. Neon là cá đàn, thả từ nửa tá trở lên là đủ để chúng khỏe, nên bạn không cần thả 40 con một lúc.
> 1. Kiểm tra bể đã chạy ổn định và đo nitrat trước khi thả thêm.
> 2. Thả đợt đầu khoảng 10–15 con neon, không thả hết một lần.
> 3. Đo nitrat mỗi tuần trong 2–3 tuần và giữ dưới 40 ppm theo cẩm nang.
> 4. Nếu nitrat vẫn ổn, mới thả đợt tiếp …

**Plain** (1103 characters):

> Nếu bể của bạn khoảng **100 lít trở lên** và có lọc tốt, thả thêm 40 con neon thường vẫn được, vì neon là cá đàn nhỏ, hiền. Nhưng 40 con khá đông, nên bạn cần kiểm tra vài điều:
> 
> - **Kích thước bể:** Bể dưới 60 lít mà có 40 con neon sẽ rất chật, dễ phát sinh ô nhiễm và stress. Neon nên được nuôi đàn từ 10 con trở lên, và càng nhiều càng tốt nếu bể đủ rộng.
> - **Lọc và thay nước:** Đàn đông thải nhiều chất bẩn hơn. Bạn cần lọc đủ công suất (ít nhất gấp 4-5 lần thể tích bể mỗi giờ) và thay 25-30% nước mỗi tuần.
> - **Chỉ số nước:** Sau khi thả, theo dõi amoniac và nitrit. Hai chỉ số này phải luôn …

### stocking-03 · post · plain wins (5 · 8)

**Asked:** Em mới kiếm được cái bể kích thước 35x20x22cm, chưa chơi bao giờ. Nên nuôi loại cá nào cho đẹp, dự định 1 tuần thay nước 1 lần? Có cần mua lọc và sục khí cho bể không?

**Judge:** Y gives a beginner stocking options with quantities that suit 15 L, a clear sponge filter and air pump answer, and the key steps of cycling first and dechlorinating tap water. X answers the basics, but it suggests schooling fish without counts, includes a poor beginner pick, and barely explains how to start the tank. / X chốt được phương án cụ thể cho bể 15 lít (1 cá xiêm đực hoặc đàn tôm, kèm số lượng), giải thích rõ lọc mút, thay nước và chạy bể 2-4 tuần trước khi thả cá. Y mỏng hơn, gợi ý cá đàn không rõ số lượng, có loài quá lớn cho bể và không hướng dẫn cycling, khử clo nên người mới dễ thả cá vào bể chưa ổn định.

**Ours lacks:** plan, figures, too-thin. **Plain lacks:** –.

**Ours** (read 4 pages, stopped at the tools limit):

> Bể 35x20x22 cm chứa khoảng 15 lít, nhỏ nên nước dễ bẩn và đổi nhanh, bạn nên chọn ít cá và làm đều việc thay nước. Với người mới, cá đàn nhỏ như neon vua, tetra mõm đỏ hay lambchop rasbora là lựa chọn đẹp và dễ nuôi hơn, còn ember tetra chỉ khoảng 2 cm hợp bể nano. Cẩm nang khuyên người mới nên dùng lọc mút xốp (sponge filter) thay vì lọc thùng, vì dòng nhẹ, chạy ổn định và vệ sinh mỗi tháng một lần là đủ. Lọc mút xốp chạy bằng sủi khí nên bạn cần một máy sục khí, và nên để máy chạy suốt ngày đêm. Thay nước 1 tuần 1 lần là ổn, bạn thay khoảng 20–30% nước mỗi lần (mình nói theo kinh nghiệm chu…

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

### stocking-03 · tank · ours wins (7 · 3.75)

**Asked:** Bể tôi nên nuôi cá gì, bao nhiêu con, có cần lọc và sục khí không?

**Judge:** X dùng đúng bể 15 lít, trả lời thẳng là cần lọc mút và máy sủi, kèm các bước theo thứ tự, dù chọn loài chưa khéo và thời gian chạy bể hơi ngắn. Y hỏi lại kích thước rồi đưa bảng chung từ 30 lít trở lên, không có đáp án cho bể này và còn nhầm tên cá. / Y tính đúng khoảng 15 lít, trả lời thẳng là cần lọc mút và máy sục, rồi đưa các bước theo thứ tự, dù chọn cá chưa thật khớp và số con còn chung chung. X hỏi lại kích thước, chỉ đưa gợi ý chung cho các bể 30–100 lít và có lỗi nhận định về cá thái lan/cá dĩa.

**Ours lacks:** figures, follow-up. **Plain lacks:** tank-fit, plan, asks-only.

**Ours** (read 3 pages, stopped at the calls limit):

> Với bể 35 x 20 x 22 cm (khoảng 15 lít) chưa có lọc và sục khí, bạn nên có cả hai trước khi thả cá. Cẩm nang khuyên người mới dùng lọc mút xốp (sponge filter), vì dòng chảy nhẹ, chạy ổn định và dễ vệ sinh, và lọc mút này chạy bằng sủi khí nên cần thêm một máy sục khí. Sục khí giúp cá đủ oxy trong bể nhỏ. Về số lượng, cẩm nang mình đọc được chưa nêu con số cho bể dung tích này, nên phần số con là kinh nghiệm chung của mình: bể nhỏ nên chọn một đàn nhỏ vài con (khoảng 6 con trở lên nếu là cá đàn) thay vì nuôi nhiều loài.
> 1. Mua một lọc mút xốp và một máy sục khí có công suất nhỏ, đặt lọc trong b…

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

### stocking-04 · post · tie or split (5.75 · 5.5)

**Asked:** Em thích con cá bống vàng vì nó khá sinh động (lúc núp dưới đá, lúc đậu trên cây, trên đá) và dọn bể rất sạch, từ ngày nuôi không phải cạo rêu thành bể nữa, cũng chả cần cho ăn gì mà vẫn sống. Nuôi loại gì chung với bống này được? Trước em nuôi mún, rồi kiếm, rồi cá bảy màu, đều cứ chết dần, không biết có phải bị con bống xử không?

**Judge:** X có các bước rõ, trung thực về việc chưa rõ loài và có phép thử tách bống, nhưng gần như bỏ qua câu hỏi nên nuôi chung cá gì. Y danh sách nguyên nhân dài và chung chung hơn, nhưng trả lời cả hai câu hỏi, nêu ý cá khác có thể bị đói và gợi ý cá nuôi chung bằng tên quen thuộc, nên giúp người hỏi hơn một chút. / Y admits the species is unknown and gives an ordered plan: test water, change water, identify the fish, then separate it if deaths continue, though it skips the tankmate question and the unfed fish. X does answer tankmates and rightly flags hunger, but it is a scattered list that dismisses the goby without knowing the species and suggests dubious fish.

**Ours lacks:** tank-fit, too-thin, diagnosis, follow-up. **Plain lacks:** plan, follow-up, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình chưa tìm thấy "cá bống vàng" trong cẩm nang nên chưa chắc đó là loài nào, nên mình chưa dám khẳng định con bống của bạn có ăn cá khác hay không. Gần nhất là cá bống Stiphodon ornatus (bống cầu vồng, có người bán tên gold fin): loài này hiền, sống nhờ màng sinh học và tảo trên bề mặt, và cẩm nang ghi nó hợp với cá bảy màu. Cá chết dần qua nhiều loài thường do nước hơn là do bống xử, nên mình nghĩ nên kiểm tra nước trước.
> 1. Test amoniac, nitrit, pH và nhiệt độ ngay hôm nay; amoniac hay nitrit trên 0 là bể chưa ổn định hoặc đang quá tải.
> 2. Thay khoảng 25–30% nước bằng nước đã khử clo, cùn…

**Plain** (1911 characters):

> Bống thường hiền với cá cùng cỡ, nhưng một số loài bống có tính lãnh thổ và có thể rượt hoặc cắn cá nhỏ, nhất là cá nằm đáy. Dù vậy, khả năng cao cá chết không phải do bống "xử". Mình nghĩ có mấy nguyên nhân hay gặp hơn:
> 
> 1. **Chất lượng nước**: Bể không cần cạo rêu, không thay nước, không cho ăn có thể đang tích tụ amoniac, nitrit hoặc nitrat. Đây là nguyên nhân phổ biến nhất khiến cá chết dần. Nên test nước (kit amoniac, nitrit, nitrat, pH) và thay 20–30% nước nếu chỉ số cao.
> 2. **Thiếu thức ăn**: Bống có thể sống nhờ rêu, màng sinh học và thức ăn tự nhiên trong bể, nhưng cá mún, kiếm, bảy …

### stocking-04 · tank · ours wins (7 · 4.25)

**Asked:** Bể tôi nuôi chung được những cá nào, khi cá thả thêm cứ chết dần?

**Judge:** X nêu nguyên nhân nghi ngờ là nước, cho các bước cụ thể và dặn cho bống ăn thêm, dù chưa trả lời trực tiếp nên nuôi chung cá nào. Y có danh sách cá nhưng chung chung, có lỗi và lại gợi ý đúng những loài đã chết, không dùng gì về bể của họ. / Y uses the tank's history (several species dying, a bống living on algae with no feeding) and gives an ordered plan: test, change water, check the filter, stop adding fish, feed the bống. It doesn't list tankmates, but it is honest about its limits. X has the right cause but is a generic checklist that ignores the tank, confuses Vietnamese fish names and recommends fish that already died there.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 2 pages, stopped at the calls limit):

> Mình chưa tìm thấy trang nào trong cẩm nang về cá bống vàng, nên mình không xác nhận được nhu cầu riêng của loài này. Từ chuyện bạn kể, nguyên nhân dễ nghi nhất là chất lượng nước: nhiều loài cùng chết dần thường do amoniac hoặc nitrit tích tụ khi bể chưa có vi khuẩn lọc đủ, hoặc nước có clo, pH bị sốc. Mình chưa thể chắc vì chưa biết bể đã chạy chu trình nitơ chưa và đã chạy bao lâu.
> 1. Mua bộ test nước và đo amoniac, nitrit, nitrat, pH ngay hôm nay.
> 2. Nếu amoniac hoặc nitrit khác 0, thay khoảng 25–30% nước bằng nước đã khử clo, cùng nhiệt độ.
> 3. Kiểm tra bộ lọc: nếu vật liệu lọc vừa bị rửa…

**Plain** (2273 characters):

> Cá chết dần mỗi lần thả thêm thường không phải do loài không hợp nhau mà chủ yếu do **chất lượng nước**. Bạn nên kiểm tra các điểm sau trước.
> 
> ## 1. Nguyên nhân hay gặp nhất
> 
> - **Nước chưa ổn định (chu trình nitơ chưa hoàn thiện):** Mỗi lần thả thêm cá, lượng amoniac và nitrit tăng đột ngột, làm cá yếu và chết. Bạn nên dùng bộ test (API hoặc tương tự) để đo NH3/NH4+ và NO2-. Hai chỉ số này phải bằng 0. NO3- nên dưới 20-40 ppm.
> - **Quá tải cá:** Quy tắc tham khảo là khoảng 1 inch (2,5 cm) cá trưởng thành cho 1 gallon (3,8 lít) nước, nhưng thực tế nên thưa hơn. Bể nhỏ dưới 60 lít chỉ nên nuôi v…

### stocking-05 · post · plain wins (6 · 7.25)

**Asked:** Em mới mua thêm mấy con cá chép thả chung với cá vàng, mà nó tấn công cá vàng kinh quá, một con chết rồi. Hỏi cửa hàng thì họ bảo thả chung được em mới mua. Giờ em nên làm sao, chép với cá vàng có nuôi chung được không?

**Judge:** Both correctly say to separate the carp, but Y also covers removing the dead fish, testing ammonia and nitrite, a 30% water change, aeration and wound care using methylene blue and a salt bath with figures. X is sound but thinner on care for injured fish, and its repeated references to 'cẩm nang' read stiffly. / Both correctly say to separate the carp, but X gives a fuller recovery plan: treat wounds, test water, change 30% and add aeration. Y is tidy and offers returning the carp, but its care steps are vague, and its 'cẩm nang' references and koi card read less naturally.

**Ours lacks:** figures, follow-up, local, plan. **Plain lacks:** tank-fit.

**Ours** (read 2 pages):

> Không nên nuôi chung: cá chép (cùng họ với cá koi trong cẩm nang) lớn hơn cá vàng rất nhiều và có thể ăn hoặc cắn cá vàng, nên việc một con đã chết là dấu hiệu rõ ràng. Cá vàng vốn hiền, còn cá chép ăn tạp và lớn nhanh, nên thả chung là rủi ro lớn; lời người bán không đúng với cẩm nang.
> 1. Tách cá chép ra ngay, nhốt riêng hoặc trả lại cửa hàng, đừng để chung bể với cá vàng nữa.
> 2. Kiểm tra cá vàng còn lại: vây rách, vết cắn, bơi lờ đờ hay nằm đáy; giữ nước sạch và cho ăn ít, vừa đủ.
> 3. Nếu vẫn muốn nuôi chép, cần hồ ngoài trời đủ rộng, vì cẩm nang ghi koi cần khoảng 950 lít nước cho mỗi con k…

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

### stocking-05 · tank · plain wins (2.25 · 7)

**Asked:** Cá chép mới thả cứ tấn công cá vàng trong bể tôi, có nuôi chung được không?

**Judge:** Y gives a clear verdict and ordered steps (separate the carp, check for injuries, long-term pond), though it misses the dead goldfish and lacks doses. X notes the death but cuts off mid-sentence with no steps, so the hobbyist has nothing to act on. / X trả lời rõ là không nên nuôi chung và cho các bước cụ thể: tách cá, kiểm tra vết thương, hướng lâu dài, dù bỏ sót con cá vàng đã chết. Y có nhắc đến con cá chết nhưng bị cụt giữa câu, không có bước xử lý nào và suy đoán nguyên nhân thiếu căn cứ.

**Ours lacks:** plan, too-thin, follow-up. **Plain lacks:** tank-fit, figures, follow-up.

**Ours** (read 2 pages, stopped at the calls limit):

> Không nên nuôi chung: cá koi (cá chép Nhật) có thể ăn cá vàng. Koi lớn tới khoảng 90 cm, còn cá vàng chỉ khoảng 20 cm, nên con koi thả vào bể cá vàng có thể đang săn cá nhỏ hơn. Cá vàng trong bể của bạn đã chết sau khi thả chép, nên nguyên nhân khả dĩ nhất là kích thước chênh lệch quá lớn. Mình chưa chắc 

**Plain** (1280 characters):

> **Thường thì không nên nuôi chung.** Cá chép lớn nhanh, có thể dài 30-60 cm hoặc hơn, khỏe và hiếu động hơn nhiều. Cá vàng bơi chậm, vây dài, dễ bị thương, nên cá chép thường xuyên đuổi, húc hoặc cắn vây cá vàng. Ngay cả khi cá chép còn nhỏ, sau vài tháng nó sẽ lớn và gây hại nhiều hơn.
> 
> **Bạn nên làm ngay:**
> 
> 1. **Tách cá chép ra** nếu có thể, bằng một bể riêng hoặc ngăn tạm bằng lưới/tấm nhựa trong bể.
> 2. **Kiểm tra cá vàng**: tìm vết cắn, rách vây, trầy xước, đốm đỏ hoặc nấm trắng. Nếu có vết thương, nên thay một phần nước và theo dõi, có thể dùng thuốc xanh methylen hoặc muối (liều nhẹ) đ…

### stocking-06 · post · plain wins (6 · 7.5)

**Asked:** Em vừa set cái bể cubic theo tư vấn, đáy bể để 5 con nerita. Ra cửa hàng thấy cá kiếm mắt đỏ đẹp quá nên mua thử vài con. Mấy con mún đỏ sắp đẻ nên em đang tính chuyển sang chỗ khác vì sợ bị ăn hết trứng, cá con, bắt đầu thấy ngại rồi. Bể có lọc thác, có cần thay nước hàng tuần không vì thấy nước có mùi hôi?

**Judge:** Y sửa hiểu lầm về trứng, đưa phương án hộp đẻ và cây rậm, trả lời rõ việc thay 20–30% mỗi tuần, thêm cách rửa bông lọc và lượng cho ăn, tuy xưng hô hơi lẫn lộn. X có bước xử lý mùi gọn và hợp lý nhưng tự mâu thuẫn đúng ở câu hỏi chính, lộ câu \"chưa đọc được trang nào\" và bỏ qua lọc thác trong phần trả lời. / X đính chính mún và kiếm đẻ con chứ không đẻ trứng, trả lời rõ cần thay 20–30% mỗi tuần, có cách xử lý lọc thác đúng và nêu cả nguyên nhân nuôi đông. Y có bước xử lý mùi hôi tốt và nhắc kiếm cũng ăn cá con, nhưng câu trả lời về thay nước tự mâu thuẫn, không sửa hiểu lầm về trứng và phần tách cá còn thiếu tự tin.

**Ours lacks:** tank-fit, follow-up, plan. **Plain lacks:** follow-up.

**Ours** (read 1 pages, stopped at the tools limit):

> Mùi hôi sau khi set bể mới thường là do chất hữu cơ phân hủy ở nền hoặc sau lũa, hoặc do bể chưa chạy xong vi sinh nên chưa ổn định. Bạn kiểm tra xem có xác cá, ốc hay lá mục nằm khuất sau đá và lũa không trước.
> 1. Vớt sạch xác, lá mục và thức ăn thừa, soi kỹ khe đá và lũa.
> 2. Thay khoảng 30 đến 50% nước, vừa thay vừa hút nền. Không thay hết một lần vì sẽ mất vi sinh và làm cá bị sốc.
> 3. Nước mới phải xử lý clo trước khi cho vào bể.
> 4. Test amoniac và nitrit. Nếu cả hai đều bằng 0 mà vẫn hôi, cho ăn ít lại và kiểm tra lại sau vài ngày.
> Bể mới chưa cần thay nước hàng tuần đều đặn; thường thay …

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

### stocking-06 · tank · plain wins (5 · 6.25)

**Asked:** Mún trong bể tôi sắp đẻ, có cần tách ra không, và có phải thay nước hàng tuần không?

**Judge:** Y answers both questions directly, with 20–30% weekly water changes and a target of zero ammonia and nitrite, which is more useful for a smelly new tank. X gives good advice not to move a fish close to birth and to use a divider, but it leans on guppy material and dodges the main-tank water-change question. Neither addresses the smell or the new tank's cycle. / X answers both questions clearly, giving 20–30% weekly and ammonia/nitrite at 0, which is useful for a new tank, though it misses the smell and the new setup. Y has a good warning about moving a near-term female and clearer steps, but it dodges the main-tank water-change question and relies on guppy guidance.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, diagnosis, plan, follow-up.

**Ours** (read 1 pages):

> Có, nên tách. Cá mún là cá đẻ con, và cá lớn thường ăn cá con, kể cả chính cá mẹ. Cẩm nang viết về cá bảy màu, cùng nhóm cá đẻ con với mún nên cách làm áp dụng được. Cá đã sát ngày đẻ thì đừng bắt chuyển bể, vì cá có thể sẩy thai hoặc chết. Lúc đó dùng vách ngăn ngay trong bể.
> 1. Nếu còn sớm (khoảng ngày 18 đến 25 của thai kỳ), chuyển cá mẹ sang bể đẻ khoảng 40 lít hoặc hộp đẻ treo trong bể.
> 2. Nếu đã sát ngày, lắp vách ngăn hoặc hộp đẻ có lưới để cá con lọt xuống, cá lớn ở lại trên.
> 3. Thêm chỗ trốn cho cá con bằng cây lá mảnh như rêu java hoặc rong đuôi chó.
> 4. Sau khi đẻ, vớt cá mẹ ra và v…

**Plain** (1246 characters):

> Bạn nên **tách mún mẹ ra** nếu muốn giữ được cá con. Mún là loài đẻ con, và cá lớn thường ăn cá con ngay sau khi chúng được sinh ra.
> 
> **Cách tách và chuẩn bị:**
> - **Dùng lồng đẻ (breeder box)** treo trong bể hoặc **bể nhỏ riêng** có cây thủy sinh dày như rêu java, rong đuôi chó để cá con có chỗ trốn.
> - **Nhận biết sắp đẻ:** bụng to và vuông, có một đốm đen gần gốc vây hậu môn (gravid spot) sẫm dần. Thường khi thấy vậy thì còn khoảng 1–2 ngày.
> - **Sau khi đẻ:** đưa mẹ về bể chính hoặc để trong lồng đẻ, và lấy cá con ra khi cần.
> - **Cho cá con ăn:** artemia con, bột thức ăn cho cá con, hoặc thứ…

### stocking-07 · post · plain wins (4.25 · 6.75)

**Asked:** Bể nhà em kích cỡ 60x35x40, thả neon và sóc đỏ khoảng bao nhiêu con thì được ạ?

**Judge:** Y gives usable numbers for both fish in this tank, plus cycling, water-change and temperature basics, and it still flags that the species may differ. X mostly withholds an answer, guesses an unlikely cool-water loach, and gives only a low neon count, though it is more open about its uncertainty. / X trả lời thẳng bằng số lượng dùng được cho cả hai loài cá nhỏ kèm hướng dẫn cycle, thay nước và thả dần, dù nhận nhầm sóc đỏ là Corydoras nhưng có dặn báo lại nếu khác loài. Y trung thực khi chưa rõ loài và có các bước thả, nhưng không đưa số cho sóc đỏ, số neon lại thấp và lạc sang loài chạch nước lạnh có lẽ không liên quan.

**Ours lacks:** figures, tank-fit, asks-only. **Plain lacks:** follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình chưa chắc "sóc đỏ" bạn nói là con nào, nên chưa thể tính chính xác số lượng. Gần nhất trong cẩm nang là cá chạch sóc đuôi đỏ, loài này ưa nước 15–21°C, còn neon ưa 21–25°C, nên hai loài này khó sống chung dù số lượng vừa đủ. Bể 60x35x40 khoảng 84 lít, trừ khoảng 10% cho đồ trang trí còn khoảng 76 lít. Cẩm nang không đưa con số cố định cho bể này. Cách tính là dựa trên cỡ trưởng thành của từng loài, không dựa trên cỡ lúc mua. Theo kinh nghiệm chung, một bể 76 lít chỉ nuôi neon thì khoảng 10–15 con là vừa, còn nếu thêm loài khác thì phải giảm số neon xuống.
> 1. Cho mình biết tên đầy đủ hoặc…

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

### stocking-07 · tank · ours wins (5.25 · 3.75)

**Asked:** Bể của tôi thả được bao nhiêu con neon và sóc đỏ?

**Judge:** X uses the real tank and gives a sound neon group size, but gives no total and stalls on identifying sóc đỏ. Y gives a concrete number, but it ignores the known size, asks for it back, and bases its stocking on a guessed 60 L tank and a wrong species. / Y uses the real 60×35×40 tank, doesn't guess the species, and warns of a temperature clash, but it gives only a minimum shoal and no upper count. X gives a usable neon number, but it asks for a tank size the app already holds, assumes about 60 L, and maps \"sóc\" to Corydoras without basis.

**Ours lacks:** figures, plan, tank-fit, too-thin. **Plain lacks:** tank-fit, wrong, asks-only, local.

**Ours** (read 2 pages):

> Bể của bạn dài 60 cm, rộng 35 cm, cao 40 cm, hiện chưa có cá. Với cá neon xanh, cẩm nang khuyên nuôi đàn ít nhất 8–10 con, có cả đực lẫn cái, và không nuôi dưới nửa tá (6 con), vì chúng cần có đồng loại bên cạnh. Bể 60 cm của bạn đủ cho đàn này. Về sóc đỏ, mình chưa chắc bạn đang nói loài nào: cẩm nang có chạch sóc đuôi đỏ và cá killifish sọc đỏ đuôi đàn lia. Nếu là chạch sóc đuôi đỏ thì nó cần nước mát 15–21°C, còn neon cần 21–25°C, nên hai loài này khó sống chung. Bạn cho mình biết tên khoa học hoặc ảnh loài bạn muốn thả, mình sẽ kiểm tra cụ thể số lượng và khả năng sống chung.
> 
> [Thẻ loài] …

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

### stocking-08 · post · plain wins (6.25 · 7)

**Asked:** Em mới chơi, ban đầu chỉ định mua cá với cây nhựa, nhưng tìm hiểu thấy mê thủy sinh quá nên mua thêm cây ráy nhỏ và chùm xương cá thay cây nhựa. Bể bé tí 4 lít mà thích đẹp em thả 7-8 con. Nuôi được 1 tuần rồi vẫn ổn, lâu dài có ổn không ạ?

**Judge:** Y covers what actually decides this tank's future: the uncycled one-week-old tank, the need for a sponge filter and oxygen, stronger water changes and fewer fish, plus warning signs and a practical upgrade path. X is tidier and has a sound core, but it never mentions a filter or the nitrogen cycle, and its weekly water change is light, though Y is somewhat padded with lesser items such as the heater. / X explains the uncycled one-week tank and adds a filter with aeration, both key to long-term survival, though it is padded and its heater step fits Vietnam poorly. Y is tighter, names their plants and sets a retest schedule, but omits filtration and cycling and has awkward wording such as \"Handbook\" and \"mất nước nhanh\".

**Ours lacks:** diagnosis, plan, local. **Plain lacks:** too-long, local, tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình thấy bể 4 lít với 7-8 con cá là quá tải, và về lâu dài sẽ khó ổn. Bể nhỏ mất nước nhanh, nên chất thải như amoniac và nitrit tích lại rất nhanh, còn cây ráy và chùm xương cá không gánh nổi lượng đó. Cảm giác ổn sau một tuần chưa nói lên được gì, vì cá nhỏ thì mới đầu vẫn bình thường. Handbook không ghi con số cụ thể cho bể 4 lít, nhưng trang về mật độ thả cá nói rõ: khi bể chứa quá sức thì amoniac cứ cao mãi không xuống, và cá sẽ lên đớp khí. Bạn nên làm theo các bước sau:
> 1. Mua bộ test amoniac và nitrit, đo nước hôm nay và ghi lại; bể khỏe thì cả hai phải bằng 0.
> 2. Thay khoảng 20-30% …

**Plain** (2035 characters):

> Với bể 4 lít và 7-8 con cá, **lâu dài thì chưa ổn**. Một tuần đầu chưa nói lên được gì, vì các vấn đề của bể nhỏ thường xuất hiện sau vài tuần.
> 
> **Vì sao bể nhỏ dễ có vấn đề:**
> - **Chất thải tích tụ nhanh:** Cá thải amoniac và nước nhanh bẩn. Lượng nước ít nên amoniac, nitrit tăng rất nhanh, có thể gây độc cho cá.
> - **Chu trình nitơ chưa ổn định:** Bể mới thường cần 4-6 tuần để vi khuẩn có lợi phát triển đủ. Cây thủy sinh giúp hấp thụ một phần chất thải nhưng không thay thế được vi khuẩn lọc.
> - **Nhiệt độ dao động mạnh:** Nước ít nên thay đổi theo nhiệt độ phòng rất nhanh, dễ gây sốc.
> - **Thi…

### stocking-08 · tank · ours wins (8 · 2.75)

**Asked:** Bể của tôi đang thả 7-8 con cá, lâu dài có ổn không?

**Judge:** X uses the 4 L size, says plainly that 7-8 fish is too many, and gives ordered steps: identify species, test ammonia and nitrite, rehome fish, feed less, and watch for warning signs. Y ignores the tank details, reasons around 40-60 L, and mostly asks back for size and species, though its under-30 L note points vaguely toward reducing fish. / Y dùng đúng thể tích 4 L, khẳng định 7-8 con là quá đông và đưa ra các bước xử lý theo thứ tự cùng dấu hiệu cần theo dõi. X bỏ qua dữ liệu bể, chỉ nêu tiêu chí chung cho bể 40-60 L rồi hỏi lại, nên không cảnh báo được vấn đề thật.

**Ours lacks:** figures. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 1 pages, stopped at the calls limit):

> Với bể 4 lít thì 7-8 con cá là quá nhiều, và đây là điều mình lo nhất. Theo cách tính trong cẩm nang, quy tắc 1 cm cá cho 1,5 lít chỉ cho khoảng 2-3 cm tổng chiều dài cá, tức là mỗi con chỉ chừng 0,3-0,4 cm. Bể nhỏ như vậy dễ thiếu oxy và nước bẩn rất nhanh. Trong bể đang lưu là 4 lít, nếu bạn đo khác thì cho mình biết kích thước để tính lại. Mình chưa biết loài cá nào nên chưa thể nói chắc từng con. Cẩm nang không có trường hợp bể nhỏ thế này, nên mình dựa vào cách tính mật độ thả và kinh nghiệm chung.
> 1. Ghi tên loài và kích thước lúc trưởng thành của từng con, rồi cộng tổng chiều dài lại.
> …

**Plain** (1607 characters):

> Câu trả lời phụ thuộc vào **kích thước bể**, **loài cá** và **hệ lọc**. Bạn cho mình biết thêm thì mình đánh giá cụ thể hơn được.
> 
> **Vài tiêu chí để kiểm tra:**
> 
> 1. **Thể tích bể:** Quy tắc phổ biến là khoảng 1 lít nước cho 1 cm cá trưởng thành (tính cả chiều dài thân, không tính đuôi). Nhiều loài cá nhỏ như neon hay tetra thường được nuôi theo đàn, nên 7-8 con nhỏ có thể ổn trong bể 40-60 lít. Còn nếu là cá lớn như cichlid, cá vàng hay cá la hán thì 7-8 con có thể là quá đông.
> 
> 2. **Loài cá:** Cá đàn (neon, tetra, cá bảy màu) cần nhiều con cùng loài và thường thoải mái hơn khi đông. Cá lãnh …

### stocking-09 · post · tie or split (5.75 · 6.25)

**Asked:** Bể dài 80, rộng 35, cao 45 cm thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** X nêu thẳng rủi ro chính là ông tiên lớn sẽ ăn neon, ngắn gọn và an toàn cho cá, dù hơi cứng về bể 100 cm và thiếu bước làm cụ thể. Y thực dụng và bám bể hơn với cách trồng cây, thả cá lúc còn nhỏ, nhưng kết luận \"được\" làm nhẹ nguy cơ mất neon và kèm vài mẹo yếu. / X đúng thực tế hơn: bể này nuôi được 2 ông tiên, neon có rủi ro bị ăn khi ông tiên lớn, và có cách giảm rủi ro như thả lúc cá còn nhỏ, trồng nhiều cây, theo dõi rượt đuổi. Y nêu đúng nguy cơ bị ăn nhưng cấm thẳng, chê bể theo ngưỡng 100 cm quá cứng và gần như không có hướng dẫn cụ thể.

**Ours lacks:** plan, too-thin, follow-up, tank-fit. **Plain lacks:** too-long, follow-up.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên có thể ăn cá neon xanh. Cá ông tiên dài khoảng 15 cm, còn neon chỉ khoảng 3 cm, nên neon dễ thành mồi, và cá ông tiên khá hung nên hay rượt đuổi. Bể 80 cm cũng chưa đủ cho cá ông tiên, vì cần bể dài từ 100 cm trở lên. Nếu bạn muốn nuôi neon, nên chọn loài cá hiền hơn, cỡ nhỏ tương tự, hoặc nuôi cá ông tiên riêng trong bể lớn hơn.
> 
> [Công cụ: Nuôi chung]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon xanh (3 cm).
> Cá ông tiên hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Mức đầy bể: 84% — 84%…

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

### stocking-09 · tank · plain wins (5.25 · 6.75)

**Asked:** Bể của tôi thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** X uses the tank and rightly warns that angels eat neons, but its flat no overstates the size problem and leaves little to act on. Y never applies the 80×35×45 cm size and has a muddled litre limit, yet it gives the more realistic verdict: this common pairing can work, with concrete ways to reduce the predation and breeding risks. / X correctly says the mix can work and gives practical ways to manage predation, breeding aggression, temperature and water changes, though it never applies the size limit to this roughly 126-litre tank. Y uses the tank and rightly warns that neons may be eaten, but its flat no and claim that the 80 cm tank is too small are overly strict, and it offers little to act on.

**Ours lacks:** plan, too-thin, follow-up, wrong. **Plain lacks:** tank-fit, local, follow-up.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên có thể ăn cá neon xanh. Cá ông tiên dài khoảng 15 cm, còn neon chỉ khoảng 3 cm, và ông tiên hơi dữ nên hay rượt đuổi. Bể 80 cm của bạn cũng chưa đủ, vì ông tiên cần bể dài từ 100 cm. Nếu bạn muốn nuôi ông tiên, hãy chọn cá hiền cùng cỡ lớn, còn neon nên nuôi trong bể riêng.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 80×35×45 cm]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon xanh (3 cm).
> Cá ông tiên hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Mức đầy bể: 84% — 84% · Vừa phải: bể ổn định với lọ…

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

### stocking-10 · post · plain wins (5.5 · 6.5)

**Asked:** Bể 60x30x36 cm của mình đang nuôi 12 con neon xanh, thả thêm 1 con cá betta được không?

**Judge:** Y gives the verdict an experienced keeper would give: possible in a 65 L tank if planted and watched, with clear signs for separating the betta, though it has side errors on release order, heater and plant name. X is clean, short and safe, but its flat no overstates the risk and gives little on how to make the pairing work. / X gives the more realistic verdict for a 65-litre tank: it can work, with cover, gentle flow and clear signs for when to separate the betta, despite a misplaced stocking-order tip and some padding. Y is safe, concise and offers alternatives, but its flat 'no' overstates the risk and gives little help for trying the combination.

**Ours lacks:** wrong, figures, too-thin. **Plain lacks:** local, too-long.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta hung dữ, nên thường được nuôi riêng hoặc trong bể chỉ có một loài. Bể 60x30x36 cm của bạn đủ rộng, nên mật độ không phải vấn đề. Vấn đề là tính khí của betta: nó có thể rượt đuổi, cắn vây cá neon, làm neon luôn stress và dễ bệnh.
> 1. Nếu muốn nuôi betta, nên để riêng một bể nhỏ cho betta, có cây thủy sinh và nơi ẩn náu.
> 2. Nếu muốn giữ 12 con neon, có thể thả thêm neon hoặc các loài tetra hiền cùng nhóm, thay vì betta.
> 3. Nếu đã thả betta, hãy quan sát vài ngày đầu: nếu neon bị rượt hoặc vây bị rách, tách betta ra ngay.
> Nên kiểm tra lại sau một tuần để chắc chắn …

**Plain** (1406 characters):

> **Có thể nuôi được**, bể 60x30x36 cm (khoảng 65 lít) đủ rộng cho 1 con betta cùng 12 con neon. Neon là cá hiền, đi đàn, ít khi gây hấn, và betta thường sống chung được với chúng. Tuy nhiên, bạn nên lưu ý mấy điểm sau:
> 
> **Điều kiện để sống chung tốt:**
> - **Nhiều chỗ ẩn nấp:** Trồng thêm cây thủy sinh như dương xỉ Java, rêu Java, trâm bầu, hoặc đặt đá, lũa. Betta cần chỗ tránh khi bị rượt đuổi.
> - **Dòng nước nhẹ:** Betta bơi chậm và không thích dòng chảy mạnh, nên chọn lọc không quá mạnh hoặc để bớt vòi phun.
> - **Nhiệt độ:** Cả hai loài đều ưa nước ấm, khoảng 24–27°C, nên thường dùng máy sưởi l…

### stocking-10 · tank · ours wins (7 · 3)

**Asked:** Bể của tôi thả thêm 1 con cá betta được không?

**Judge:** X gives a clear verdict using the actual 60×30×36 tank and 12 neons, with a simple alternative of a separate betta tank, though it is rather cautious and thin on detail. Y ignores the tank, wrongly assumes an existing betta, uses a garbled term, and ends by asking questions instead of answering for this tank. / Y uses the actual tank and 12 neons, gives a clear safe answer and a separate-tank alternative, though it is brief and omits conditions for trying. X ignores the tank, wrongly assumes an existing betta, uses an odd term, and asks for details the app already holds.

**Ours lacks:** figures, follow-up. **Plain lacks:** tank-fit, asks-only, too-long, local.

**Ours** (read 0 pages, stopped at the time limit):

> Không nên nuôi chung: cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài. Với bể 60x30x36 cm đang có 12 con neon xanh, thêm một con betta dễ khiến neon bị rượt và rỉa vây, nên mình khuyên bạn đừng thả. Nếu muốn nuôi betta, bạn nên làm một bể riêng.
> 
> [Thẻ loài] Cá betta (cá xiêm) (Betta splendens): nhiệt độ 22–30 °C; pH 6–8; GH 1–15; dài 7 cm; bể từ 45 cm; tính aggressive; độ khó 3/8
> 
> [Gợi ý hỏi tiếp] Bể 60x30x36 cm nuôi được những loài nào hợp với neon xanh? · Cá betta cần bể tối thiểu bao nhiêu lít? · Cá betta nuôi một mình cần chăm sóc thế nào?

**Plain** (1081 characters):

> **Thường thì không nên**, đặc biệt nếu bể đang có một con betta đực. Betta đực rất hung dữ với các con đực khác và sẽ đánh nhau đến khi bị thương nặng hoặc chết. Chúng cũng có thể căng thẳng và bệnh tật khi phải sống chung với cá khác.
> 
> **Một số trường hợp cụ thể:**
> 
> - **Betta đực + betta đực:** Không nên. Gần như chắc chắn sẽ đánh nhau.
> - **Betta đực + betta cái:** Chỉ có thể thử trong bể rất lớn (thường từ 80 lít trở lên), có nhiều cây thủy sinh và chỗ ẩn nấp, và phải quan sát liên tục. Con cái có thể bị đực rượt đuổi hoặc cắn. Nếu thấy cá cái bị thương hoặc stress, phải tách ra ngay.
> - **B…

### algae-12 · post · plain wins (5.5 · 7.25)

**Asked:** Bể 60x30x36 của mình set được 4 tuần, không CO2, trồng rêu java, ráy nana với dương xỉ java, đèn LED bật liền 8 tiếng mỗi ngày, châm phân nước 1 lần/tuần. Lá ráy bắt đầu có đốm rêu xanh. Có nên chia đèn ra làm hai đợt sáng chiều, mỗi đợt không quá 4 tiếng không?

**Judge:** Y trả lời thẳng việc chia đèn (cùng tổng 8 tiếng, chỉ là mẹo phụ), có cách phân biệt rêu bụi với rêu đốm và kế hoạch đủ dùng, dù hơi dài và thiếu mốc theo dõi. X né câu hỏi vì cẩm nang không nói, không phân biệt loại rêu và đổ cho dư phân, dù các bước giảm đèn gọn và có mốc theo dõi rõ. / X directly answers the split-light question (same total hours, only a minor trick) and tells green dust from green spot, with a fuller plan including water changes and nerite snails. Y has a tidy stepwise light cut and clear follow-up, but it dodges the question and cites a confusing 8–12 hour guideline.

**Ours lacks:** diagnosis, tank-fit. **Plain lacks:** follow-up, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình chưa thấy trong cẩm nang nào nói về việc chia đèn thành hai đợt sáng chiều, nên mình không xác nhận được cách này. Điều cẩm nang nói rõ là kéo dài giờ đèn không bù được ánh sáng thiếu, và khuyến nghị 8 đến 12 giờ mỗi ngày, lý tưởng là chia đèn theo bậc để mô phỏng bình minh, trưa và hoàng hôn. Đốm xanh trên lá ráy thường là tảo đốm xanh, hay gặp khi bể có nhiều ánh sáng và dinh dưỡng so với mức cây hấp thụ, mà bể lại không có CO2 để cây lên nhanh. Bạn nên làm theo các bước sau.
> 1. Giảm thời gian bật đèn xuống 1 giờ, tức khoảng 7 giờ mỗi ngày, rồi chờ 3 đến 5 ngày xem đốm có ngừng lan khô…

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

### algae-12 · tank · ours wins (6.75 · 4.5)

**Asked:** Bể của tôi có nên chia đèn làm hai đợt, mỗi đợt không quá 4 tiếng không?

**Judge:** X dựa vào đúng lịch 8 tiếng của bể, nói rõ tổng giờ quan trọng hơn cách chia và cho bước theo dõi tảo, dù mức 8–10 giờ hơi cao và chưa nhắc đến nhóm cây ưa sáng yếu. Y có khoảng 6–8 giờ hợp lý và lịch mẫu cụ thể, nhưng trả lời chung chung, không dùng dữ liệu bể, còn hỏi lại loại bể và khẳng định lợi ích hơi quá. / Y reads their 8-hour schedule, says total hours matter more than the split, and gives a 4+4 option, one-change-at-a-time steps and an algae check. X is generic: it says yes on weak claims, asks whether the tank is planted, and adds irrelevant CO₂ and reef-tank points.

**Ours lacks:** diagnosis, follow-up. **Plain lacks:** tank-fit, follow-up, plan.

**Ours** (read 2 pages):

> Cẩm nang chưa bàn riêng về việc chia đèn thành hai đợt, nên đây là cách mình suy ra từ các trang về thời gian chiếu sáng. Cẩm nang nói bể trồng cây nên bật đèn 8 đến 12 giờ mỗi ngày, và lý tưởng là chia thành nhiều bậc để mô phỏng bình minh, giữa trưa và hoàng hôn. Bể của bạn đang bật liền 8 tiếng, tức mức thấp nhất của khoảng đó, nên chia 4 tiếng + 4 tiếng vẫn đủ tổng nếu bạn giữ đúng 8 tiếng. Quan trọng hơn là tổng số giờ, không phải cách chia.
> 1. Giữ tổng số giờ đèn ở khoảng 8 đến 10 giờ mỗi ngày.
> 2. Nếu muốn chia hai đợt, đặt đợt đầu buổi sáng và đợt sau buổi chiều, cách nhau vài giờ.
> 3. …

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

