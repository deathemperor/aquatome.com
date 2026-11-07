# The chat against plain Claude, on hard problems

2026-11-07, `packages/engine/scripts/chat-vs-plain.ts`. 48 questions (all of them) from public Vietnamese hobby forums, reworded with no names (`packages/engine/scripts/hard-questions.vi.json`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and limits at commit `19892f3e1`, claude-haiku-5-5, over https://aquatome.com's handbook. Plain: claude-haiku-5-5, the same effort, no system prompt, no tools, no handbook. Judge: claude-opus-5-5 through the Claude CLI, rubric version 2 (`chat-vs-plain-lib.ts`).

- **post:** both answer the whole forum post. **tank:** both get a short question. The eval saves the post's tank for the reader (size, fish, plants, substrate, age; the light, CO₂ and fertiliser as the tank's notes), and ours sees only what the chat's code reads of a saved tank; plain Claude sees only the question. The judge is told everything the post said about the tank.
- **Blind, as far as it goes:** the judge isn't told which answer is ours, and both lose the site's name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.
- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.
- **Failed:** when one side failed (ours: the limits ran out, a call timed out) and the other answered, that reader got an error: the other side wins it on every count, with no score. A failed answer is kept in the cache, so a rerun is the same run; `--retry-failed` asks again.
- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).
- **Cost** per question, at list price: ours $0.0039, plain $0.0012. The judge runs on the owner's Claude accounts.

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post | 13 / 33 / 2 of 48, ours failed 3 | 5.7 · 6.6 | 13–24 | 8–33 | 11–30 | 20–10 | 10–14 | 43/45 | 7 / 38 / 3 |
| tank | 28 / 17 / 3 of 48, ours failed 1 | 6.0 · 5.0 | 25–18 | 27–7 | 28–13 | 19–11 | 30–5 | 44/47 | 15 / 32 / 1 |

## By problem

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post · algae | 2 / 10 / 0 of 12, ours failed 1 | 5.8 · 6.6 | 3–8 | 1–9 | 2–7 | 8–3 | 5–3 | 11/11 | 1 / 10 / 1 |
| post · setup | 1 / 8 / 0 of 9, ours failed 1 | 4.9 · 7.0 | 2–6 | 0–8 | 0–8 | 3–3 | 0–3 | 8/8 | 0 / 8 / 1 |
| post · cycling | 2 / 5 / 1 of 8 | 6.0 · 6.6 | 2–2 | 1–6 | 2–5 | 3–1 | 1–2 | 7/8 | 0 / 8 / 0 |
| post · sick | 6 / 3 / 0 of 9, ours failed 1 | 6.3 · 6.3 | 3–3 | 5–3 | 5–4 | 3–1 | 3–2 | 8/8 | 1 / 7 / 1 |
| post · stocking | 2 / 7 / 1 of 10 | 5.4 · 6.3 | 3–5 | 1–7 | 2–6 | 3–2 | 1–4 | 9/10 | 5 / 5 / 0 |
| tank · algae | 9 / 3 / 0 of 12 | 6.4 · 4.9 | 8–3 | 7–2 | 9–1 | 8–1 | 9–0 | 12/12 | 6 / 6 / 0 |
| tank · setup | 3 / 5 / 1 of 9 | 5.2 · 4.9 | 4–5 | 4–3 | 3–4 | 4–2 | 5–2 | 8/9 | 1 / 8 / 0 |
| tank · cycling | 4 / 3 / 1 of 8 | 6.0 · 5.3 | 3–4 | 1–0 | 4–3 | 2–0 | 6–0 | 7/8 | 2 / 6 / 0 |
| tank · sick | 5 / 4 / 0 of 9, ours failed 1 | 6.0 · 5.6 | 3–4 | 5–2 | 5–3 | 1–4 | 6–1 | 8/8 | 2 / 6 / 1 |
| tank · stocking | 7 / 2 / 1 of 10 | 6.4 · 4.5 | 7–2 | 10–0 | 7–2 | 4–4 | 4–2 | 9/10 | 4 / 6 / 0 |

## What each lacks, as the judge tagged it

| | Ours | Plain |
| --- | --- | --- |
| post | tank-fit 37, figures 26, too-thin 24, plan 12, diagnosis 11, follow-up 9, local 6, wrong 3, unsafe 1 | too-long 34, local 14, tank-fit 13, plan 12, follow-up 11, wrong 11, diagnosis 5, figures 2, asks-only 1, unsafe 1 |
| tank | tank-fit 34, figures 31, diagnosis 14, follow-up 10, local 9, plan 9, too-thin 7, wrong 6, asks-only 1 | tank-fit 47, too-long 31, diagnosis 15, plan 15, follow-up 13, local 11, asks-only 9, wrong 4, figures 4, unsafe 1, off-topic 1 |

Tags: plan, diagnosis, tank-fit, figures, follow-up, local, too-thin, too-long, asks-only, wrong, unsafe, off-topic.

## Errors the judge found

- ours, algae-01 post: "Đèn 7 tiếng một mạch là hợp lý, nên đèn không phải thủ phạm chính": X không tính đến chuyện Flat One treo 20cm ở chế độ mạnh. Với Bucep và Monte Carlo trong bể mới 2 tuần, cường độ đó là quá mạnh và rất có thể là thủ phạm.
- ours, algae-01 post: "sau mỗi lần thay chỉ thêm một loại phân": đây là quy tắc tự đặt ra, không có cơ sở.
- ours, algae-01 post: X không nhắc gì đến thuốc khử rêu đang được dùng mỗi 2 ngày, trong khi thuốc này có thể hại Bucep và nmc.
- ours, algae-01 post: "Đèn 7 tiếng một mạch là hợp lý, nên đèn không phải thủ phạm chính": Flat One treo cách mặt nước 20 cm trên bể mới 2 tuần, có thể chưa có CO₂, là sáng mạnh và rất dễ gây rêu. Bỏ qua ánh sáng là chẩn đoán sai.
- ours, algae-01 post: "Sau mỗi lần thay chỉ thêm một loại phân, không chồng hai loại cùng lúc": đây là quy tắc tự đặt ra, không có cơ sở.
- ours, algae-01 post: Câu trả lời lộ chuyện nội bộ ("mình chưa đọc được trang phân ADA", "chưa tìm được trang của loại cây này") nên không giải thích được vì sao nmc trắng lá.
- ours, algae-01 post: Không nói gì về thuốc khử rêu, trong khi thuốc này có thể làm hại bucep và nmc.
- plain, algae-01 post: Gợi ý chia đèn 4 tiếng sáng + 2 tiếng chiều thì lợi ích không rõ ràng. Với bể có CO₂, chia đèn còn có thể làm rêu nặng hơn. Đây là lỗi nhỏ.
- plain, algae-01 post: "thả ốc Nerite... để ăn rêu": ốc Nerite gần như không ăn rêu tóc, chỉ ăn rêu bám mặt kính và mặt lá; tép Amano mới là lựa chọn đúng.
- plain, algae-01 post: Gợi ý chia đèn 2 đợt chỉ là một cách làm còn tranh cãi, không phải biện pháp chắc chắn trị được rêu.
- ours, algae-01 tank: "Đặt tổng đèn khoảng 8–10 tiếng mỗi ngày": người này đang bật 7 tiếng trên một bể mới 2 tuần đã có rêu tóc. Khuyên bật 8–10 tiếng là tăng giờ đèn, ngược với hướng cần làm.
- ours, algae-01 tank: "thiếu CO₂ là nguyên nhân hay gặp nhất của rêu tóc": nói quá. Ở bể mới, rêu tóc chủ yếu do dư dinh dưỡng và dư sáng.
- ours, algae-01 tank: "Chia thành nhiều đợt, mỗi đợt không quá 4 tiếng" được đưa ra như quy tắc chắc chắn, nhưng không có căn cứ rõ ràng.
- ours, algae-01 tank: "tổng đèn khoảng 8–10 tiếng... chia thành nhiều đợt": this tank already runs 7h a day, and with slow-growing bucep and NMC, raising light hours and splitting them into several periods would feed hair algae, not stop it
- ours, algae-01 tank: "bắt chúng ra... để tránh chúng ăn cây": Amano shrimp rarely eat healthy plants
- ours, algae-01 tank: "thiếu CO₂ là nguyên nhân hay gặp nhất" is stated as a fact even though the answer doesn't know whether the tank uses CO₂, and the claim isn't backed up
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": ở Việt Nam, cá rìu là cá hatchet. SAE thường gọi là cá bút chì.
- plain, algae-01 tank: Câu khuyên cho cá ăn ít được viết như thể chắc chắn bể có cá, dù câu hỏi không hề nhắc đến cá.
- plain, algae-01 tank: "Cá rìu/cá Siamese algae eater": in Vietnam, cá rìu means hatchetfish, not SAE, so the reader could buy the wrong fish
- ours, algae-02 post: 'bể cần khoảng 40 lumen mỗi lít… 3.400 lumen' – this general rule is too much for a non-CO₂ anubias and moss tank. It is about what the A601 Plus already puts out, so the 'new' light would cause the same BBA.
- ours, algae-02 post: It never says that stopping fertiliser doesn't help with BBA. It even admits it hasn't read the section on choosing lights.
- ours, algae-02 post: 'Bể của bạn không châm CO2': người hỏi không hề nói vậy, Y tự giả định
- ours, algae-02 post: Phần trích dẫn khuyên dùng drop checker để đạt CO2 30 mg/l, không khớp với chẩn đoán bể không CO2 mà Y vừa đưa ra
- plain, algae-02 post: 'rau ngổ' is not a floating plant. It is a rooted, half-emersed plant, so it won't shade the surface the way duckweed does.
- plain, algae-02 post: 'Dòng A361' is a 36cm light, too short for a 70cm tank. The WRGB II Slim is a fairly strong light and doesn't suit a low-tech anubias tank.
- plain, algae-02 post: Gợi ý 'Chihiros WRGB II Slim' cho đèn nhẹ hơn: dòng này khá mạnh, không phải lựa chọn ánh sáng thấp cho ráy và rêu
- plain, algae-02 post: 'rau ngổ' được đưa vào nhóm cây nổi, trong khi đây không phải cây nổi
- ours, algae-02 tank: "Hút sạch cặn và lá rụng ở nền": bể này không có nền, nên chỉ cần hút cặn dưới đáy kính.
- ours, algae-02 tank: Bảo bôi oxy già hoặc carbon nước lên từng chỗ nhưng không dặn tránh rêu trang trí. Bể có trồng rêu, và rêu dễ chết vì hai thứ này.
- ours, algae-02 tank: "quét oxy già 3%... nhỏ carbon nước": it doesn't warn that peroxide or liquid carbon can burn the moss (rêu) growing in this tank, so the hobbyist could damage it.
- plain, algae-02 tank: "Ổn định CO2": bể này không chạy CO2, nên lời khuyên này không áp dụng được.
- plain, algae-02 tank: "cá Siamese (cá cày Xiêm)": cái tên không chuẩn, người chơi ở Việt Nam thường gọi là cá bống bay Xiêm hoặc SAE.
- plain, algae-02 tank: Hỏi lại loại đèn và chuyện có dùng CO2 không, trong khi app đã có sẵn các thông tin này.
- plain, algae-02 tank: "cá Siamese (cá cày Xiêm)": this name isn't used in Vietnam. Hobbyists here call it cá bút chì or SAE.
- plain, algae-02 tank: "tôm Amano" is offered as a fix for rêu chùm đen, but Amano shrimp barely eat this algae.
- plain, algae-03 post: Treats the Odyssea dual as possibly a UV light and says to run both bulbs nonstop. It is a lighting fixture for planted tanks, and more light feeds the green water.
- plain, algae-03 post: "Ngừng thay nước hằng ngày… chỉ 10-15%": in a brand-new planted tank with fresh substrate, big frequent water changes are the standard way to pull out the excess nutrients.
- plain, algae-03 post: Asks whether 'trân châu ngọc trai' is a plant. It is a well-known aquarium plant in Vietnam (pearl grass), which shows the answer doesn't know local hobby terms.
- plain, algae-03 post: Treats the Odyssea dual as possibly a UV lamp and says to run both bulbs nonstop. It is a T5 light for lighting the tank, so this advice would make the green water worse.
- plain, algae-03 post: Says to stop daily water changes and only change 10-15% at a time. A tank on new soil that is only 3 days old needs large water changes to pull out the nutrients the soil releases.
- plain, algae-03 post: Asks what 'trân châu ngọc trai' is. It is a common plant (pearl weed), and asking shows the answer doesn't know the hobby.
- ours, algae-03 tank: "chỉ bật 6–8 giờ mỗi ngày": người này đã giảm còn 4h/ngày mà nước vẫn xanh, nên đây là khuyên tăng đèn so với hiện tại và không giải quyết được vấn đề.
- ours, algae-03 tank: "chỉ bật 6–8 giờ mỗi ngày": generic advice that would increase light for this tank, already cut to 4h/day and still green.
- ours, algae-03 tank: "Nếu che tối thì nên chuyển cá sang bể tạm": usually unnecessary for a blackout of up to 7 days and adds stress, especially while a new tank is unstable.
- plain, algae-03 tank: "Đây là cách hiệu quả và không hại gì cho bể": nói quá, che tối nhiều ngày vẫn làm cây yếu đi, nhất là trân châu mới trồng, và có thể làm cây tàn gây thêm dinh dưỡng.
- plain, algae-03 tank: "rau muống nước": gợi ý lạ, không phải cây thả bể thủy sinh thông dụng để cạnh tranh tảo, và không nói cách dùng.
- plain, algae-03 tank: "không hại gì cho bể": overclaims, since days of full darkness can weaken a light-hungry carpet plant like trân châu in a new tank.
- plain, algae-03 tank: "thả ốc/tôm ăn tảo": snails and shrimp do not clear free-floating green water, so this fix would not work.
- plain, algae-03 tank: "Thức ăn thừa là nguồn dinh dưỡng chính cho tảo": stated as a general rule, but a tank only days old may have little or no feeding, and substrate or fertiliser may be the source.
- ours, algae-04 post: "Có thể thả thêm cá otto": otto is sensitive and has little margin in a 7-day-old tank, so adding it now without waiting is risky.
- ours, algae-04 post: "Có thể thả thêm cá otto": offered with no warning for a 7-day-old tank, though otto is sensitive and often dies in an immature tank with little established food.
- ours, algae-04 post: "cân nhắc giảm thay nước... để vi sinh có thời gian hình thành": beneficial bacteria live mainly in the filter and substrate, so water changes barely slow them.
- plain, algae-04 post: "nước máy ở Việt Nam thường có hàm lượng silicate khá cao... nguyên nhân chính": a sweeping claim with no source, and it pushes the hobbyist toward RO or resin that a 7-day diatom bloom doesn't need.
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển hơn": padding that hardly applies to a tank in Vietnam's heat and to this hobbyist's case.
- plain, algae-04 post: "cường độ ở mức trung bình-khá, chưa phải là quá dư": concludes on light without knowing the fixtures' wattage or lumen output.
- plain, algae-04 post: "nước máy ở Việt Nam thường có hàm lượng silicate khá cao": stated as a blanket fact, though it varies by source and nothing supports it as the main cause; a 7-day tank's substrate and new setup are just as likely.
- plain, algae-04 post: "Thay nước 30% mỗi ngày là hơi nhiều... hệ vi sinh chưa kịp ổn định": beneficial bacteria live in the filter and substrate, so water changes barely disturb them, and frequent changes are normal for a new planted tank.
- plain, algae-04 post: "Nhiệt độ thấp cũng làm tảo silic dễ phát triển hơn": rarely relevant in Vietnam's heat, so it adds nothing here.
- ours, algae-04 tank: "Tạm ngưng phân": stopping fertiliser outright is overly cautious for a CO₂-injected Dutch tank that needs nutrients, though it is offered with a lighter-dosing alternative.
- ours, algae-04 tank: "Tạm ngưng phân": bể Hà Lan nhiều cây, có CO₂ ngưng phân lâu dễ làm cây đói; nên chỉ giảm tạm thời, và câu trả lời có nói tăng lại khi cây lên khỏe nên lỗi không nặng.
- plain, algae-04 tank: "bộ lọc than hoạt tính... khử silicat": activated carbon does not remove silicate; only the resin does.
- plain, algae-04 tank: "ốc Malaysia" listed as an algae grazer: Malaysian trumpet snails mainly burrow and eat detritus, and are not an effective fix for diatoms on glass and rock.
- plain, algae-04 tank: "cá tỳ bà": plecos can outgrow a 60 cm tank and are a poor suggestion without specifying a small species.
- plain, algae-04 tank: "dùng bộ lọc than hoạt tính hoặc resin khử silicat": than hoạt tính không khử được silicat, chỉ resin chuyên dụng mới có tác dụng.
- plain, algae-04 tank: "Thay 20-30% mỗi tuần để giảm nitrat và phosphat": tảo cát ở bể mới không do nitrat/phosphat, và mức này còn ít hơn nhiều so với 30% mỗi ngày họ đang thay.
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": cây đang sống và phát triển tốt thì hút dinh dưỡng, không phải nguồn gây dư.
- plain, algae-05 post: "Cho ăn quá nhiều là nguyên nhân phổ biến nhất": khẳng định quá chắc, trong khi người hỏi không hề nói về việc cho ăn; rêu nhớt lam còn hay đi với nitrat thấp và nước đọng, ý này bị bỏ sót.
- plain, algae-05 post: "Rau thơm trồng trong nền có thể làm dinh dưỡng dư thừa": cây đang sống và phát triển tốt hấp thụ dinh dưỡng, không phải nguồn gây dư.
- plain, algae-05 post: "Cho ăn quá nhiều là nguyên nhân phổ biến nhất": khẳng định chắc chắn dù người hỏi không hề nhắc đến cá hay việc cho ăn; rêu nhớt còn hay gắn với nitrat thấp và nước đọng.
- plain, algae-05 post: "tắt đèn phòng khi bể đang bật đèn": không khớp câu hỏi, vì lo ngại là đèn nhà hắt vào buổi tối sau khi đèn bể đã tắt.
- ours, algae-05 tank: "Không dùng thuốc diệt tảo" conflicts with step 1, which tells the reader to dose APT Fix directly on the patch, itself a spot algae treatment; this is confusing.
- ours, algae-05 tank: "tảo nâu... khi bể còn non và có nhiều dinh dưỡng": the young-tank part is right, but excess nutrients are not the main driver of diatoms; the immature tank biology and silicates matter more.
- plain, algae-05 tank: "cá chùy (cá ăn tảo Siamese với tảo râu đen)" is a muddled, wrong name for the Siamese algae eater and is not a hobby term that identifies the fish.
- plain, algae-05 tank: "cá tỳ hưu (Otocinclus)" uses the wrong local name; tỳ hưu does not normally refer to Otocinclus, so the hobbyist may buy the wrong fish.
- plain, algae-05 tank: "thường xuất hiện... khi ánh sáng yếu" repeats a weak explanation for diatoms; tank age is the main cause, and this tank is only 4 weeks old.
- plain, algae-05 tank: "Giảm thời gian chiếu sáng xuống còn 6–8 giờ/ngày" and repeated water changes in the first week are generic; the tank already runs 8h of light and changes water every 2 days.
- plain, algae-05 tank: "H₂O₂ nhỏ giọt" gives no dose, so it is risky around plants and the nerite snail.
- plain, algae-05 tank: "cá tỳ hưu (Otocinclus)": sai tên gọi, dân chơi Việt Nam không gọi Otocinclus như vậy nên khó tìm mua đúng loài.
- plain, algae-05 tank: "cá chùy (cá ăn tảo Siamese với tảo râu đen)": tên và mô tả lộn xộn, lại không liên quan vì cá này không phải giải pháp cho tảo nâu hay vi khuẩn lam ở chân kính.
- plain, algae-05 tank: "Có thể dùng H₂O₂ nhỏ giọt": không có liều lượng, thiếu an toàn với ốc và cây nếu dùng quá tay.
- ours, algae-06 post: "Đừng gắn cánh quạt ở đầu out của lọc 603: nó khuấy mặt nước": a mixer placed under the surface need not stir the surface, and the hobbyist's question about weaker flow goes unanswered.
- ours, algae-06 post: "rêu tóc đang mọc vì CO2 chưa ổn định": stated as the likely cause without checking light or nutrients, and it never says 6-7 bubbles/s is high or should be cut now.
- ours, algae-06 post: "Đừng gắn cánh quạt ở đầu out của lọc 603: nó khuấy mặt nước và làm CO2 thoát ra": a submerged mixer need not agitate the surface and can help break up and spread bubbles; the flat ban rests on a weak reason and skips the asked question about weaker flow.
- ours, algae-06 post: "tép thường chịu được": reassuring for a tank running 6-7 giọt/giây after a recent increase, with no instruction to cut the rate now.
- plain, algae-06 post: "cách đầu hút lọc chính khoảng 5-10 cm": this close, the bubbles still get sucked into the filter, so the noise may persist.
- plain, algae-06 post: "Mức phù hợp thường là khoảng 1-2 giọt/giây" and "giảm CO2 về khoảng 1-2 giọt/giây": a precise target that may be low for about 96 L, and it undercuts the advice to rely on measuring.
- plain, algae-06 post: "Gỡ tay rêu sợi, rêu sừng hươu và rêu lông tơ thường kém bền khi bị loại bỏ thủ công": garbled and unclear as advice.
- plain, algae-06 post: "Rêu lông tơ và rêu sừng hươu thường xuất hiện ở chỗ dòng yếu": overgeneralised, since these algae often grow in high-flow spots, such as near the filter outlet.
- plain, algae-06 post: "giảm CO2 về khoảng 1-2 giọt/giây": the target is given as a fixed figure although the answer itself says drop rate is unreliable, and it may underdose this tank, depending on how well the CO2 dissolves.
- plain, algae-06 post: "rêu sừng hươu và rêu lông tơ thường kém bền khi bị loại bỏ thủ công": muddled claim; staghorn and fuzz algae regrow readily if the cause is not fixed.
- plain, algae-06 post: "Đặt diffuser... cách đầu hút lọc chính khoảng 5-10 cm": this is too close, so the intake can still pull in gas and the rattling may continue.
- ours, algae-06 tank: "khoảng 90% trường hợp rêu tóc là do thiếu CO2": con số kinh nghiệm không có căn cứ đo đạc, nghe chính xác hơn thực tế dù có dẫn cẩm nang.
- ours, algae-06 tank: "xịt carbon nước hoặc bơm thẳng thuốc diệt BBA": không cảnh báo rủi ro cho tép có trong bể, dù đã nhắc theo liều trên nhãn.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3 so với nước không CO₂": sai, mức thường dùng là giảm khoảng 1 đơn vị pH; giảm 0,2–0,3 thì CO₂ vẫn rất thiếu.
- plain, algae-06 tank: "Nếu phosphate cao, rêu sẽ rất khó kiểm soát" và quy rêu cho nitrate/phosphate dư: quan niệm cũ, dễ khiến người chơi cắt nhầm dinh dưỡng và lạc hướng.
- plain, algae-06 tank: "dùng H₂O₂ nhỏ giọt trực tiếp lên chỗ rêu": không có liều, trong khi bể có tép dễ bị ảnh hưởng.
- plain, algae-06 tank: "Bạn có thể cho mình biết... kích thước... có CO₂ chưa": hỏi lại những thông tin bể đã có trong ứng dụng, và lời khuyên bật CO₂ cùng lúc đèn không thêm gì vì bể đã chạy van điện theo đèn.
- plain, algae-06 tank: "pH giảm khoảng 0,2–0,3 so với nước không CO₂": sai; khoảng 30 ppm CO₂ cần pH giảm cỡ 1 đơn vị, làm theo mốc này sẽ vẫn thiếu CO₂.
- plain, algae-06 tank: "Trồng thêm cây mọc nhanh như rau muống nước": gợi ý lạ, không phải cây trồng thủy sinh thông dụng cho bể 60 cm.
- plain, algae-06 tank: "cá tỳ bà (ăn rêu lông tơ và rêu tóc)": cá tỳ bà thường không xử lý được rêu tóc, và loại phổ biến lớn quá khổ so với bể 60 cm.
- ours, algae-07 post: "nền này nhả rất ít dinh dưỡng": sai với aqua soil kiểu ADA, loại giàu dưỡng ban đầu; nhận định này chỉ đúng với một số nền như akadama.
- ours, algae-07 post: "thủng lỗ": người hỏi không hề mô tả triệu chứng này.
- ours, algae-07 post: Quy nguyên nhân chính cho việc thay nước quá mạnh: việc này chỉ diễn ra 2 tuần đầu với nền giàu dưỡng, nên khó giải thích trọn vẹn thất bại ở cả 5 bể.
- ours, algae-07 post: "nền này nhả rất ít dinh dưỡng": nói chung chung là sai, vì nhiều nền công nghiệp như ADA Amazonia khá giàu dưỡng lúc đầu, thậm chí nhả đạm mạnh.
- ours, algae-07 post: "thủng lỗ": hobbyist không hề mô tả triệu chứng này, câu trả lời tự thêm vào.
- ours, algae-07 post: Trích đoạn về bể nhàn rêu, ráy, dương xỉ không liên quan đến bể Hà Lan háu ăn, có thể gây hiểu nhầm là không cần cốt nền.
- plain, algae-07 post: "Fluval Stratum" được xếp vào nền trơ không dinh dưỡng: đây là nền dạng đất nung, không phải nền trơ như sỏi.
- plain, algae-07 post: Nêu Seachem Flourish như phân đa lượng và vi lượng: Flourish chủ yếu là vi lượng, gần như không cung cấp đủ NO3 và K.
- plain, algae-07 post: "không bón phân đều": người hỏi không nói gì về việc bón phân, đây là giả định.
- plain, algae-07 post: Quy xoắn ngọn, trắng ngọn cho việc rửa trôi vi lượng nhưng không nêu thiếu canxi hoặc nước quá mềm, là hướng rất đáng nghi.
- plain, algae-07 post: "Đây là lý do cây non bị xoắn, trắng ngọn, dị dạng": khẳng định quá chắc rằng do thay nước; thay nhiều trong 2 tuần đầu với nền giàu dưỡng là cách làm phổ biến, còn xoắn ngọn kéo dài qua 5 bể cần nghi thêm thiếu Ca/B, nước mềm, và X không nêu các nguyên nhân này.
- plain, algae-07 post: "Fluval Stratum... không có dinh dưỡng": Stratum là nền đất nung có chút dinh dưỡng, không phải nền trơ như sỏi.
- ours, algae-07 tank: "Rêu hại bùng lên thường là do CO2 tụt... hoặc bỏ lỡ lần thay nước": lấy từ trường hợp trong cẩm nang, trong khi bể này thay nước rất nhiều; nguyên nhân không khớp, bỏ qua nền giàu dưỡng.
- plain, algae-07 tank: "Ốc táo: ăn rêu": ốc táo dễ ăn cả cây non, nguy hiểm với cây Hà Lan cắt cắm và không xử lý được rêu đáng tin cậy.
- plain, algae-07 tank: "Trồng cây nổi như bèo tây": bèo tây quá to cho bể thủy sinh, lại che sáng cây Hà Lan vốn cần nhiều sáng.
- plain, algae-07 tank: "thiếu sắt... (chelated iron)": xoắn ngọn kèm trắng ngọn thường nghiêng về thiếu canxi/bo hoặc CO2 không ổn định hơn là thiếu sắt, nên bổ sung sắt có thể không đúng hướng và thêm thức ăn cho rêu.
- plain, algae-07 tank: "Ốc nerite, ốc táo: ăn rêu": ốc táo dễ ăn cây non và đẻ nhiều, không hợp bể cây Hà Lan cắt cắm.
- plain, algae-07 tank: "Nitrat và photphat cao: là 'thức ăn' của rêu": đây là quan niệm cũ; NO3/PO4 cao không tự gây rêu, và cắt dinh dưỡng có thể làm cây còi thêm.
- plain, algae-07 tank: "Trồng cây nổi như bèo tây": bèo tây quá to cho bể thủy sinh, lại che mất sáng của cây Hà Lan ưa sáng mạnh.
- plain, algae-07 tank: "thiếu sắt hoặc vi lượng": thiếu sắt chủ yếu làm lá non vàng hoặc nhạt, còn xoắn ngọn thường nghiêng về thiếu Ca/B hoặc nước, CO2 bất ổn; X không nhắc đến canxi, chỉ nhắc chung phải kiểm tra GH.
- ours, algae-08 post: "khoảng 33 con (9 mún, 10 bảy màu, 9 sọc ngựa, 5 mún đỏ)": đếm nhầm, 9 mún là số lúc đầu, hiện tại chỉ khoảng 24 con.
- ours, algae-08 post: "khoảng 33 con (9 mún, 10 bảy màu, 9 sọc ngựa, 5 mún đỏ)": double-counts the original 9 mún; the current stock is about 24.
- plain, algae-08 post: "khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ)": tổng sai so với chính danh sách đã nêu (33), và số thực tế khoảng 24 con.
- plain, algae-08 post: "Bể xi măng non thường làm pH tăng": bể đúc của người chơi nhiều khả năng là bể kính đúc liền khối, không phải bể xi măng, nên đây là hướng chẩn đoán lạc.
- plain, algae-08 post: "Ốc nerite... Có thể thêm 2–3 con": thêm sinh vật vào bể đã quá tải và ốc không xử lý được nước xanh, gợi ý này chưa đúng lúc.
- plain, algae-08 post: "Bể xi măng non": "bể đúc" here most likely means a one-piece moulded glass tank, so the cement cause is a misreading, though it is hedged.
- plain, algae-08 post: "khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ)": the list adds up to 33, not 26, and the current stock is about 24 because the 9 mún were the original stock.
- plain, algae-08 post: "Thay nhiều quá làm mất vi khuẩn có lợi": beneficial bacteria live mostly in the filter and on surfaces, not in the water, so large water changes do not strip them this way.
- plain, algae-08 post: "Bạn cho mình biết... thời gian bể đã chạy cá": asks for something the hobbyist already gave (over 3 weeks at the time of the outbreak).
- ours, algae-08 tank: "nên chuyển cá sang bể tạm khi che tối": không cần thiết nếu có sục khí, và rất phiền với gần 24 con cá khi che tối chỉ vài ngày.
- ours, algae-08 tank: "bỏ bớt phân nước đang châm": bể này không châm phân, nên bước này không trúng nguyên nhân.
- ours, algae-08 tank: "bỏ bớt phân nước đang châm": mặc định người hỏi có châm phân, trong khi bể này không có dấu hiệu châm phân.
- ours, algae-08 tank: "nên chuyển cá sang bể tạm khi che tối": khó thực hiện và không cần thiết với gần 24 con cá, nhất là khi lọc và sủi vẫn chạy.
- plain, algae-08 tank: "cory ... để ăn tảo": cory không phải cá ăn tảo, lại thêm tải cho một bể đã khá đông cá.
- plain, algae-08 tank: "để nước lắng" nếu nitrate/phosphate cao: để lắng không làm giảm nitrate hay phosphate.
- plain, algae-08 tank: "cỏ đuôi chồn (Hornwort), rong đuôi chó": liệt kê như hai loại khác nhau trong khi Hornwort thường chính là rong đuôi chó.
- plain, algae-08 tank: "hãy để nước lắng" để xử lý nitrate/phosphate cao: để lắng không loại bỏ được hai chất này, chỉ RO mới có tác dụng rõ.
- plain, algae-08 tank: "cỏ đuôi chồn (Hornwort), rong đuôi chó": liệt kê như hai loại riêng, trong khi Hornwort chính là rong đuôi chó.
- plain, algae-08 tank: "Đừng thay nước quá ít": khuyên chung chung, không đúng với người đang thay 50–100%/tuần; vấn đề của họ không phải thay quá ít.
- ours, algae-09 post: "Dời bể vào chỗ có bóng râm": a large cast concrete tank is practically immovable, so this first option is unrealistic, although shading is offered as an alternative.
- ours, algae-09 post: "Dời bể vào chỗ có bóng râm": a large cast tank on a balcony is hardly movable, so this is impractical as the first option, although shading is offered as an alternative.
- plain, algae-09 post: "Bèo tây, bèo cái, lục bình": bèo tây and lục bình are the same plant, so the list is redundant, though the advice itself is fine.
- plain, algae-09 post: "Mất điện là cá chết ngay": overstated, since fish do not always die immediately in a power cut, although a backup aerator is still sensible.
- plain, algae-09 post: "mất điện là cá chết ngay": overstated; the risk is real in a crowded, green tank, but death is not immediate in every case.
- plain, algae-09 post: "bèo tây, bèo cái, lục bình": lists bèo tây and lục bình as if different, though they are the same plant.
- ours, algae-09 tank: "Dời bể khỏi chỗ nắng chiếu": a large cast (concrete) tank can hardly be moved; shading with a net or roof is the realistic step, and the answer doesn't offer it.
- ours, algae-09 tank: "bật đèn không quá 6–8 giờ mỗi ngày": does not apply to a balcony tank running on natural sunlight with no lamp.
- ours, algae-09 tank: "Dời bể khỏi chỗ nắng chiếu": a large built tank cannot realistically be moved; it should say to shade or roof it instead.
- plain, algae-09 tank: "chu trình nitơ bị phá vỡ" as the main cause: a three-week green-water cycle in a sunny, plantless balcony tank points first to sunlight plus excess nutrients, not filter cleaning.
- plain, algae-09 tank: "dương xỉ java" listed as fast-growing: java fern grows slowly and does little to compete with algae.
- plain, algae-09 tank: "cá otto" and "ốc nerite" as help: neither clears free-floating green water.
- plain, algae-09 tank: "cân nhắc RO": impractical and costly for a large cast tank.
- plain, algae-09 tank: "chu trình nitơ bị phá vỡ" as the lead cause, with algae blooming "khi hệ vi sinh tái lập": this is a shaky mechanism that misses the obvious cause, sun plus nutrients in a plantless tank.
- plain, algae-09 tank: "ốc nerite, cá otto" to support: these graze surface algae and do not clear free-floating green water.
- plain, algae-09 tank: "dương xỉ java" listed as a fast-growing plant: it grows slowly and competes poorly for nutrients.
- ours, algae-10 post: "Cắt giờ đèn xuống khoảng 2–3 tiếng mỗi ngày trong vài tuần": quá ít sáng, kéo dài vài tuần sẽ làm cây thủy sinh yếu và có thể khiến rêu nặng hơn; mức hợp lý thường khoảng 6–8 giờ.
- ours, algae-10 post: "vì bể mới nên thay nhiều hơn": người hỏi không hề nói bể mới, đây là giả định không có căn cứ.
- ours, algae-10 post: "thả khi đèn tắt vì tép hay trốn ban ngày": thả lúc tắt đèn không giải quyết được việc thần tiên ăn tép, dễ gây hiểu nhầm là có thể thả chung.
- ours, algae-10 post: "Cắt giờ đèn xuống khoảng 2–3 tiếng mỗi ngày trong vài tuần": quá thấp với bể có cây, dễ làm cây yếu và khiến rêu càng có lợi thế; thường chỉ cần giảm về khoảng 6 giờ.
- ours, algae-10 post: "vì bể mới nên thay nhiều hơn": người hỏi không hề nói bể mới, đây là giả định không có căn cứ.
- ours, algae-10 post: "thả khi đèn tắt vì tép hay trốn ban ngày": không giải quyết được việc thần tiên ăn tép; tép vẫn bị săn và lý do đưa ra yếu.
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo là apple snail, không phải nerite; gọi sai dễ khiến người đọc mua nhầm.
- plain, algae-10 post: "cá nhớt Siamese (cá chét đuôi đỏ...)": tên tiếng Việt không chuẩn, khó tìm đúng loài ngoài tiệm.
- plain, algae-10 post: "rêu hornwort": hornwort (rong đuôi chồn) là cây, không phải rêu.
- plain, algae-10 post: "rau muống" được liệt kê như cây thủy sinh mọc nhanh: không thực tế với đa số bể thủy sinh, dù có thể hút dinh dưỡng khi để ngọn trên mặt nước.
- plain, algae-10 post: "Ốc nerite (ốc núi, ốc táo)": ốc táo là apple snail, không phải Nerita, nên dễ mua nhầm.
- plain, algae-10 post: "rêu hornwort": hornwort là cây rong đuôi chồn, không phải rêu.
- plain, algae-10 post: "Cá nhớt Siamese (cá chét đuôi đỏ...)": tên gọi này không đúng với cá Siamese algae eater và không phải tên phổ biến trong giới chơi ở Việt Nam, khó mua đúng loài.
- plain, algae-10 post: "Nếu muốn dùng tép... chỉ thả khi bể có nhiều cây rậm": với đàn thần tiên, tép vẫn dễ bị ăn dù có chỗ trốn, đúng với điều người hỏi đã gặp.
- ours, algae-10 tank: "Thả tép vào khu cây rậm... lúc tắt đèn": repeats the step that already failed. Angelfish still hunt shrimp, so hiding spots and night release won't protect small shrimp for long.
- ours, algae-10 tank: Treats the algae only as diatoms ("tảo silic") and says it clears by itself, ignoring that the hobbyist described "rêu sợi", with no light or nutrient correction if it is filament algae.
- ours, algae-10 tank: "Thả tép vào khu cây rậm" và "Thả tép vào lúc tắt đèn": vẫn khuyên thả tép dù tép đã bị cá ăn; thần tiên vẫn săn được tép, nên cách này khó giải quyết vấn đề.
- ours, algae-10 tank: "Rêu nâu trên lá thường là tảo silic": bỏ qua chi tiết rêu dạng sợi, và tảo silic thường là lớp bột dễ lau, nên chẩn đoán này chưa chắc đúng.
- plain, algae-10 tank: "cá neon" as a shrimp-safe tankmate and omitting angelfish from the avoid list: neon are themselves prey for grown angelfish, and the advice doesn't address the actual predator.
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus": conflates common plecos with Otocinclus, and tiny Oto can be at risk from large angelfish.
- plain, algae-10 tank: "nhiều loại không đẻ trứng trong nước ngọt": Nerites do lay eggs in freshwater; the eggs just don't hatch.
- plain, algae-10 tank: H₂O₂ "liều thấp" has no actual dose, so it is vague and risky for the reader.
- plain, algae-10 tank: "Cá tỳ bà/cá Otocinclus": gộp hai loại cá khác nhau; tỳ bà thường lớn hơn và không tương đương Otocinclus.
- plain, algae-10 tank: "nhiều loại không đẻ trứng trong nước ngọt": ốc Nerite vẫn đẻ trứng trong nước ngọt, chỉ là trứng không nở được.
- plain, algae-10 tank: "Chọn cá hiền... (cá neon, cá thái,...)": gợi ý này không giúp được người đang nuôi thần tiên, và neon lại dễ thành mồi của thần tiên.
- ours, algae-11 post: "Nước xanh chưa đáng lo": downplays the night-time oxygen crash a dense algae bloom can cause, which may be part of why these fish die.
- ours, algae-11 post: "Nước xanh chưa đáng lo": this is too dismissive here, because deepening green water is what comes before the deaths and can cause low oxygen at night and early morning.
- plain, algae-11 post: "chất khử ghi rõ khử chloramine, ví dụ sản phẩm có chứa sodium thiosulfate": thiosulfate alone only splits chloramine and leaves ammonia behind, so it is a poor example of a chloramine remover.
- plain, algae-11 post: "Nhiều nơi dùng chloramine thay vì clo": a generic foreign warning; Vietnamese tap water is generally treated with chlorine, so this is unlikely to be the cause here.
- plain, algae-11 post: "Nhiều nơi dùng chloramine": this is presented as common, but it is not typical of Vietnamese tap water, where chlorine is the usual disinfectant, so it may send the reader the wrong way.
- plain, algae-11 post: "ví dụ sản phẩm có chứa sodium thiosulfate": plain thiosulfate breaks the chloramine bond but leaves ammonia behind, so it is a poor example of a chloramine treatment.
- ours, algae-11 tank: "thay một phần nước ngay" / "thay khoảng 20% nước mỗi tuần": never says to dechlorinate, which is unsafe for someone on chlorinated tap water whose fish keep dying within a week.
- plain, algae-11 tank: "để bể chạy 3–6 tuần với lượng cá rất ít hoặc không cá": a tank with no fish and no ammonia source will not build up bacteria, so the wait alone does not cycle it.
- ours, setup-01 post: "Mình chưa đọc kỹ phần lọc trong cẩm nang nên bạn nên kiểm tra thêm": not a factual error, but it leaves the filter question unresolved and offers no option for a stand without a cabinet.
- ours, setup-01 post: "thời gian chiếu sáng hợp lý là 8 đến 12 tiếng", sau đó "lên 8 đến 10 tiếng": quá dài với bể không CO2 của người mới, dễ bùng rêu.
- plain, setup-01 post: "Không thay nhiều, vì làm mất vi sinh vật có lợi": beneficial bacteria live mainly on filter media and surfaces, not in the water, and a new planted tank usually benefits from frequent water changes against ammonia and algae.
- plain, setup-01 post: "Không thay nhiều, vì làm mất vi sinh vật có lợi": vi sinh chủ yếu bám ở vật liệu lọc và nền, không phải trong nước; bể thủy sinh mới thường cần thay nước thường xuyên để hạn chế rêu.
- ours, setup-01 tank: "Chọn lọc có công suất ghi trên hộp gấp đôi thể tích bể": the kit already includes a sponge filter, and the excerpt pushes a canister filter they have no room for.
- ours, setup-01 tank: "Lắp sưởi (inline hoặc nhúng)": they already own a heater, and inline needs a canister line they cannot fit.
- ours, setup-01 tank: "Chọn lọc có công suất ghi trên hộp gấp đôi thể tích bể" and the canister-filter excerpt: this tank comes with a sponge filter and has no room for an external filter, so the first step does not apply.
- ours, setup-01 tank: "Lắp sưởi (inline hoặc nhúng)" and the excerpt praising inline heaters: an inline heater needs a canister line, which this setup cannot have.
- ours, setup-02 post: "Nếu đó là cá la hán thì nên bỏ khỏi bể": in a list of plants, la hán is most likely not the fish, so this guess misses the point, though it is hedged and harmless.
- ours, setup-02 post: "trân châu ngọc trai... thích ánh sáng vừa phải": this skips that trân châu usually needs stronger light and CO₂ to carpet well, and CO₂ is never mentioned.
- ours, setup-02 post: "Nếu đó là cá la hán thì nên bỏ khỏi bể": in a list of plants, la hán is probably a plant, although the answer hedges this and admits it could not verify it.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar is a premium brand, not a cheaper option.
- plain, setup-02 post: "Sunsun HW-304B": this canister is rated far above the 400–600 l/h it recommends, so it is oversized for 96 litres and for a gentle flow.
- plain, setup-02 post: "low-tech, không cần CO2": trân châu usually grows poorly and carpets badly without CO₂, so this is too optimistic even on Gex.
- plain, setup-02 post: "nuôi cá la hán... chọn lọc lớn hơn": it treats la hán as a possible fish without warning that a flowerhorn would wreck a planted bonsai layout.
- plain, setup-02 post: "Twinstar hoặc Ista nếu muốn giá mềm hơn": Twinstar is a premium brand, not a cheaper alternative to Chihiros.
- plain, setup-02 post: "Sunsun HW-304B" under a 400–600 L/h spec: this canister is rated well above that range (about 1400 L/h), so it contradicts the answer's own figure and is oversized for 96 L with moss and pearl weed.
- plain, setup-02 post: "Chihiros C60": this looks like an imprecise or invented model name, so the buyer may not find it as written.
- plain, setup-02 post: "Nếu bạn định nuôi cá la hán (cichlid)": in a list of plants, la hán is probably a plant, so reading it as a fish adds a misleading filter recommendation.
- ours, setup-02 tank: "Chọn sưởi theo cỡ bể": not wrong in itself, but the hobbyist did not ask about heaters and they are rarely a priority in most of Vietnam's climate, so it is imported advice.
- ours, setup-02 tank: "lọc bọt biển... là lựa chọn dễ dùng nhất" if it is the first tank: this is poor guidance for a 96 L planted bonsai layout, where a sponge filter is unsightly and gives weak flow.
- ours, setup-02 tank: "tránh lọc treo dùng hộp lõi nhỏ... cho phần lớn bể" is too sweeping; hang-on-back filters work on many small and lightly stocked tanks.
- ours, setup-02 tank: "Chọn sưởi theo cỡ bể" is off-target: the hobbyist did not ask about heaters, and a heater is generally not a priority purchase in much of Vietnam's warm climate.
- plain, setup-02 tank: "Bể 30–100 lít: lọc treo sau": this steers a 96 L planted bonsai tank towards a hang-on-back filter, when a canister suits that size and layout better. The size bands are too rigid.
- plain, setup-02 tank: "Bể 30–100 lít: lọc treo sau" sends a 96 L tank to a hang-on-back filter; for a planted bonsai layout a canister is the more suitable choice, so the size rule is a weak fit here.
- plain, setup-02 tank: "lọc treo sau... Jebao": Jebao is known mainly for pumps, so naming it as a typical hang-on-back brand is doubtful.
- ours, setup-03 post: "Chọn bể 35-55 lít không viền": người hỏi đã có sẵn bể và muốn hồi sinh nó, không cần chọn bể mới.
- ours, setup-03 post: "Thêm sưởi riêng... 50 W cố định 25°C": nêu như món phải mua, trong khi phần lớn thời gian ở Việt Nam không cần và còn ngốn ngân sách.
- ours, setup-03 post: "bật ánh sáng yếu lúc đầu để rêu ít có cơ hội mọc": không cho số giờ đèn nên khó áp dụng; đèn yếu một mình cũng không ngăn được rêu.
- ours, setup-03 post: "Chọn bể 35-55 lít": hobbyist đã có sẵn bể nên bước này không áp dụng được.
- ours, setup-03 post: "công suất khoảng 10 lần... với bể 55 lít thì mẫu 400 lít/giờ đã dư sức": 10 lần của 55 lít là 550 lít/giờ, nên 400 lít/giờ không đạt mức vừa nêu.
- ours, setup-03 post: "Thêm sưởi riêng" như một món mặc định: phần lớn bể ở Việt Nam, nhất là miền Nam, không cần sưởi; khoản này nên tùy nơi ở.
- plain, setup-03 post: "Cá ngọc trai (Celestial pearl danio)": tên gọi dễ nhầm, vì ở Việt Nam "ngọc trai" thường gợi đến cá sặc trân châu; loài này nên gọi theo tên Galaxy/CPD.
- plain, setup-03 post: "Có thể dùng cá Otocinclus": cá này nhạy cảm và cần bể đã ổn định, nhưng câu trả lời không cảnh báo.
- plain, setup-03 post: "Tổng cộng khoảng 2.5-3.5 triệu": cộng bảng thực tế khoảng 2.3-3.3 triệu, lệch nhẹ.
- plain, setup-03 post: "phải để bể chạy ổn định 3-4 tuần": không nói cần nguồn amoniac để gây vi sinh, nên chỉ chờ không thì chu trình có thể chưa hình thành đủ.
- plain, setup-03 post: "thả tôm trước, rồi thả cá": tép thường nhạy với nước hơn cá nên không phải lựa chọn an toàn để thả đầu tiên.
- plain, setup-03 post: "để bể chạy ổn định 3-4 tuần": không nói cần nguồn amoniac, nên bể không cá chưa chắc đã gây được vi sinh dù đo amoniac và nitrit bằng 0.
- ours, setup-03 tank: "bật khoảng 12 tiếng mỗi ngày": quá dài cho bể thủy sinh low-tech mới, dễ bùng rêu; thường chỉ nên 6-8 tiếng.
- ours, setup-03 tank: "chọn bể 35–55 lít không viền": người hỏi đã có bể trống, nên khuyên chọn bể là lệch câu hỏi và có thể làm họ tốn tiền.
- ours, setup-03 tank: "lọc trong cỡ khoảng 400 lít/giờ cho bể 55 lít": dòng khá mạnh cho đàn cá nhỏ và bể cây nhỏ nếu không có cách giảm dòng.
- ours, setup-03 tank: "bật khoảng 12 tiếng mỗi ngày": too long for a low-tech tank, inviting algae; 6-8 hours is usual.
- ours, setup-03 tank: "chọn bể 35–55 lít": the hobbyist already has a tank, so advising on tank choice misses the situation.
- ours, setup-03 tank: "phần trang trí và cây để sau": treats plants as optional leftovers when the hobbyist asked for a planted tank.
- plain, setup-03 tank: "Trân châu" được xếp vào cây dễ sống cho người mới: trân châu trải nền thường khó lên nếu không có CO2 và đèn mạnh.
- plain, setup-03 tank: "Tép cảnh (cherry, crystal red)": crystal red khá kén nước và không hợp người mới; nước máy và nền thường dễ làm tép chết.
- plain, setup-03 tank: "Lọc treo thành bể hoặc lọc hộp kiểu HOB": gộp lẫn hai loại lọc, vì lọc hộp và lọc treo HOB là khác nhau.
- plain, setup-03 tank: "Thủy tùng (Anubias)": tên gọi gây nhầm, vì Anubias thường được gọi là ráy ở Việt Nam.
- plain, setup-03 tank: "Trân châu" listed as an easy beginner plant: carpet trân châu generally struggles without CO₂ and strong light.
- plain, setup-03 tank: "Thủy tùng (Anubias)": Anubias is normally called ráy in the Vietnamese hobby, so this name is misleading when buying.
- plain, setup-03 tank: "Tép cảnh (cherry, crystal red)" suggested for beginners: crystal red is delicate and needs cool, stable water, a poor fit for a first tank in Vietnam's heat.
- ours, setup-04 post: "Đổ nền sỏi mịn hoặc cát 3–5 cm": chọn nền trơ cho cả hồ nhưng vẫn trồng rong La Hán là cây thân, không nói đến nền dinh dưỡng hay phân nước cho nó, dù chính X thừa nhận cây này cần dinh dưỡng hơn.
- ours, setup-04 post: "Dựng đá... gắn Fissidens và ráy lên đá" rồi mới "Đổ nền": đổ nền sau khi đã gắn rêu và cây dễ làm bẩn, vùi rêu; trình tự này bất tiện.
- ours, setup-04 post: Bước 1 gắn Fissidens và ráy lên đá rồi bước 2 mới đổ nền: wrong order, since pouring substrate after attaching moss risks dirtying and disturbing it, and the rock should sit on or be bedded in the substrate before planting.
- ours, setup-04 post: Recommends only inert gravel or sand yet still plants rong La Hán, which it says needs more nutrients, with no root tabs or liquid fertiliser offered as a fix.
- plain, setup-04 post: "Các cây bạn chọn đều chịu được ánh sáng thấp và CO2 thấp": nói hơi quá so với rong La Hán, và chính phần sau của Y cũng cho thấy cây này kém đẹp khi thiếu CO2.
- plain, setup-04 post: "Các cây bạn chọn đều chịu được ánh sáng thấp và CO2 thấp": overgeneralised, and contradicted by its own later caveat that the stem plant (rong La Hán) grows weakly without more light and nutrients.
- ours, setup-04 tank: "nền... không quyết định cây sống hay chết": too broad, since rong La Hán is the one plant rooted in the substrate and may need root tabs in plain sand, which X never mentions.
- plain, setup-04 tank: "Cây có rễ (Anubias...) hợp với nền giàu dinh dưỡng": misleading, because Anubias feeds well from the water column and its rhizome should not be buried; it is usually attached to rock or wood.
- plain, setup-04 tank: "Cây có rễ (Anubias, ...) hợp với nền giàu dinh dưỡng": Anubias là cây bám, thân rễ không nên chôn xuống nền; xếp vào nhóm cây cần nền giàu dinh dưỡng dễ khiến người chơi trồng sai.
- ours, setup-05 post: "Đèn 4 bóng T5HO cho bể 120 cm là đủ cho rêu và ráy": understates the issue; 4 T5HO is strong for moss and anubias, and it gives no warning about algae risk without CO2 beyond a generic later check.
- ours, setup-05 post: "với người mới phân nền công nghiệp đơn giản và hợp lý hơn": assumes a beginner and steers away from the mixed substrate the hobbyist asked about, without addressing the economy goal.
- ours, setup-05 post: "một lớp phân nền công nghiệp nhả chậm là đủ" với lý do rêu và ráy hút chậm: this overlooks the hobbyist's red stem plants, which feed from the roots and need more substrate nutrition.
- ours, setup-05 post: "khoảng 30 lít nền, tức khoảng 20 đến 25 kg": slightly low for many soils, though the advice to buy an extra bag offsets this.
- plain, setup-05 post: "1 bóng hồng... rất có lợi": overstated; a pink tube mainly improves how red looks and is only a minor help to plant colouring, which depends more on CO2, nutrients and light.
- plain, setup-05 post: "1 bóng hồng... rất có lợi": overstated, a pink tube mostly improves how red looks; actual leaf colour depends more on light intensity, CO₂ and nutrients.
- ours, setup-05 tank: "Cây đỏ và rêu cần nền và ánh sáng tốt hơn": rêu bám giá thể, không hút dinh dưỡng từ nền và không cần đèn mạnh.
- ours, setup-05 tank: "Dựng bố cục và đổ nền trước khi lắp lọc và đèn để tránh đục nước": thứ tự lắp thiết bị không phải là thứ quyết định nước có đục hay không.
- ours, setup-05 tank: "Cây đỏ và rêu cần nền... tốt hơn": moss attaches to hardscape and feeds from the water, so it does not need a rich substrate.
- ours, setup-05 tank: "đổ nền trước khi lắp lọc và đèn để tránh đục nước": installation order for the filter and light does not prevent cloudy water; the reason given is wrong.
- plain, setup-05 tank: "nền dinh dưỡng lót 3 cm + sỏi 2 cm... 3-4 kg sỏi": theo chính công thức của nó, 60×30×2 cm với 1,5 kg/lít là khoảng 5,4 kg, nên con số bị thấp.
- plain, setup-05 tank: "nền dinh dưỡng lót 3 cm + sỏi 2 cm... 3-4 kg sỏi": on 60×30 cm, 2 cm of gravel is 3.6 L, about 5.4 kg at X's own 1.5 kg/L, so the sum is wrong.
- plain, setup-05 tank: "nền dinh dưỡng (Aqua Soil, ADA Amazonia...) lót dưới, phủ sỏi hoặc cát mịn": aqua soil is normally used as the top layer, and capping it with gravel is unnecessary and makes planting and upkeep harder.
- ours, setup-06 post: "Chỉ cần lớp cát đủ dày để không lộ phân nền" treats the sand as covering the soil, although the hobbyist has fenced the soil with pebbles; sand on aquasoil gradually mixes with it.
- ours, setup-06 post: "Đổ cốt nền khoảng 2 cm sát đáy" ignores the actual volume: 2.5 L spread over the full 60x30 footprint is only about 1.4 cm, so 2 cm holds only if the soil area is smaller.
- ours, setup-06 post: "Bucep và hồng thái dương cần sáng hơn rêu, ráy, dương xỉ": this groups bucep with a high-light red stem, though bucep grows well in low to medium light and is often shaded.
- plain, setup-06 post: "Phủ cát lên Aquafor khoảng 1–2 cm" caps the soil with sand, which gradually mixes with it; the pebble border should keep sand and soil separate.
- plain, setup-06 post: "Hồ sâu 30 cm" uses the wrong dimension: 30 cm is the front-to-back width, while the height is 36 cm, which is what affects light reaching the bottom.
- plain, setup-06 post: "Hồ sâu 30 cm": the tank is 36 cm tall and 30 cm is its front-to-back width, so the light reasoning uses the wrong measurement.
- plain, setup-06 post: "Phủ cát lên Aquafor khoảng 1–2 cm": the soil is already corralled behind pebbles, so the empty front does not need sand laid over Aquafor unless soil has spilled forward.
- ours, setup-06 tank: "bể sáng bừng hơn đèn trần thì đủ" is not a reliable test: how bright a tank looks to the eye says little about whether light is enough for hồng thái dương or tảo lớn-type demanding plants.
- plain, setup-06 tank: "phủ một lớp lưới hoặc giấy ngăn": paper is a poor divider under water because it breaks down; only mesh, or stones as this tank already has, holds up.
- plain, setup-06 tank: "phủ một lớp lưới hoặc giấy ngăn": giấy sẽ mủn trong nước, nên không phải vật ngăn bền giữa soil và sạn; lưới hoặc gờ đá như đá cuội đang quây thì hợp lý hơn.
- ours, setup-07 tank: "nếu phòng lạnh thì cần sưởi": at a window niche in Vietnam, overheating is the likelier problem, and the answer gives no cooling advice such as a fan or shading.
- ours, setup-07 tank: "khoảng 21–26°C" conflicts with the 17–28 °C shown on its own species card and is too narrow for guppies kept in Vietnam without explanation.
- ours, setup-07 tank: "nếu phòng lạnh thì cần sưởi": đặt sai trọng tâm; với bể trong hốc cửa sổ ở Việt Nam, nguy cơ chính thường là nóng lên, và answer không nói cách hạ nhiệt.
- ours, setup-07 tank: "khoảng 21–26°C": lệch với thẻ loài ngay bên dưới (17–28 °C), khiến người đọc không rõ nên theo mốc nào.
- plain, setup-07 tank: "Cá cần ánh sáng nhiều hay ít cũng ảnh hưởng đến cách bố trí": vague and not useful, since light is planned mainly around plants and algae rather than fish needs.
- ours, setup-08 post: "đổi sang bể 60x40x40 cm dày 8 ly, thường rẻ hơn chi phí sửa sau này": the cost claim is unsupported, and the change of dimensions is unnecessary when 8 ly at the same size would solve the problem.
- plain, setup-08 post: "Kính 5 ly là ổn... đủ an toàn": a 60x45x45 tank is about 120 L and 45 cm tall, and also holds substrate and rocks; it normally needs about 8 ly, so this false reassurance risks a burst tank.
- plain, setup-08 post: "Cá sóc (corydoras)": wrong common name; corydoras are usually called cá chuột in Vietnam, while cá sóc is a different fish.
- plain, setup-08 post: "Cá kim/neon (neon tetra, cá kim vàng...)": conflates cá kim with neon tetra, which are unrelated fish.
- plain, setup-08 post: "5 ly là mức phổ biến và đủ an toàn": 5 mm is thin for a tank 45 cm high and about 120 litres; the reassurance is overconfident, and 8 ly is the safer choice, especially for the bottom pane under substrate and rock.
- plain, setup-08 post: "Cá sóc (corydoras)": corydoras is usually called cá chuột in Vietnam, so this name would confuse a buyer at the shop.
- plain, setup-08 post: "Cá kim/neon (neon tetra, cá kim vàng...)": cá kim is not the same as neon tetra, so the name is wrong and the shoaling advice is muddled.
- plain, setup-08 post: "cây thật như rêu java, dương xỉ java, trạch...": "trạch" is not a recognised easy aquarium plant name.
- plain, setup-08 post: "Lia thia... hoặc một cặp nếu bể đủ rộng": keeping a pair of betta together in a community tank risks fighting and injury.
- plain, setup-08 post: "Đèn và đá trang trí có thể mua sau": light is essential from the start in a planted tank, so it should not be deferred.
- ours, setup-08 tank: "Dùng lại mica, nhựa hay bình CO2 đang có": assumes materials the hobbyist never said they have, and it reads as copied from a guide.
- plain, setup-08 tank: "Sưởi... cần" listed as essential: most of Vietnam's tanks run warm enough without a heater for most of the year, so this adds needless cost on a tight budget.
- plain, setup-08 tank: "Lọc hang (lọc thác)" treats two different filter types as one.
- plain, setup-08 tank: "khoảng 1–2 triệu đồng" is an unsourced estimate for a 60-litre tank, about half the volume of this one.
- plain, setup-08 tank: "Sưởi 25–300W" listed under essentials: in most of Vietnam a heater is not essential for these fish, and it adds cost to a low-budget build; the range is also too wide to use.
- plain, setup-08 tank: "Trân châu", "Rotala" listed under plants that tolerate low light and no CO₂: trân châu struggles to carpet without strong light and usually CO₂.
- plain, setup-08 tank: "Ốc Nerite... không đẻ trứng trong nước ngọt": Nerites do lay eggs in fresh water; the eggs just don't hatch.
- plain, setup-08 tank: "Lọc hang (lọc thác)": treats a sump-style compartment filter and a hang-on-back filter as the same thing.
- plain, setup-08 tank: "Với bể khoảng 60 lít": the cost estimate is based on a guessed volume, about half of the real ~121 L tank.
- plain, setup-09 post: "Lỗ hút... cách đáy khoảng 2–3 cm": với nền cát, lỗ này nằm ngang lớp nền nên dễ hút cát vào lọc; lỗ khoan quá thấp cũng có thể làm cạn gần hết bể nếu rò hoặc tuột ống.
- plain, setup-09 post: "bể dài và sâu nên cần lưu lượng lớn": bể chỉ cao 35 cm, không sâu; lý do cần lưu lượng là chiều dài.
- plain, setup-09 post: "cá neon/cá đuôi kiếm nhỏ": cá đuôi kiếm khá lớn và hiếu động, không phải gợi ý tốt cho nhóm cá size nhỏ.
- plain, setup-09 post: "timer để bật tắt đèn và lọc": lọc phải chạy 24/7; tắt theo timer làm thiếu oxy cho vi sinh trong thùng và hại bể.
- plain, setup-09 post: "Lỗ hút... cách đáy khoảng 2–3 cm": bể có nền cát, lỗ thấp như vậy dễ bị vùi hoặc hút cát vào lọc.
- plain, setup-09 post: "cá đuôi kiếm nhỏ": cá đuôi kiếm không phải loại cá size nhỏ, lớn hơn hẳn neon.
- plain, setup-09 post: "bể dài và sâu": bể chỉ cao 35 cm, không sâu; chỉ có chiều dài mới là lý do cần tính dòng chảy.
- ours, setup-09 tank: "nên cân nhắc lọc treo thành hoặc lọc mút": a poor steer for a roughly 178 L, 170 cm long tank in a bookshelf niche, where a hang-on filter has little room and flow would not reach the far end.
- ours, setup-09 tank: "cá betta trong bể khoảng 40 lít": a single-fish suggestion for a different tank size, which does not answer what to stock in this long tank.
- ours, setup-09 tank: "Thay than hoạt tính khoảng mỗi tháng": carbon is not needed in a routine freshwater setup, and this adds work for someone who wants less care.
- ours, setup-09 tank: Suggests "lọc treo thành hoặc lọc mút" as the lowest-effort option; this is a poor fit for a roughly 178 L, 170 cm long tank in a shelf niche, where a single such filter cannot move water well end to end.
- ours, setup-09 tank: Betta in 40 L as the low-care fish suggestion does not fit the real 170 cm tank; a lone betta is no real stocking answer for it.
- plain, setup-09 tank: "cá chép mini (rasbora)": an odd, inaccurate name for rasbora that a hobbyist in Vietnam would not recognise.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus": listed as easy care, but otocinclus are fragile when newly stocked and need an established tank, and tỳ bà usually refers to larger plecos.
- plain, setup-09 tank: "Hạc đỏ/Platy": not the usual Vietnamese name for platy, which is commonly called hạc đỉnh.
- plain, setup-09 tank: "Cá chép mini (rasbora)": not a usual Vietnamese hobby name for rasbora, and it could confuse the reader.
- plain, setup-09 tank: "Cá tỳ bà/Otocinclus": equates otocinclus with tỳ bà, a name commonly used for larger plecos; otos are also fairly delicate, so a poor low-care pick.
- plain, setup-09 tank: Lists neon as an easy-care fish; neons are less hardy and often die when newly stocked, so this overstates it.
- ours, cycling-01 post: "Ngừng thay 50% nước mỗi ngày": với nền nhiều dinh dưỡng mới, thay nước nhiều trong giai đoạn đầu là cách phổ biến để giảm amoniac nhả từ nền và hạn chế rêu; khuyên dừng mà không nói điều này là chưa ổn.
- ours, cycling-01 post: "thả dần vài con cá nhỏ" rồi lại "thả cả đàn một lần": hai bước mâu thuẫn nhau, người đọc không biết nên thả thế nào.
- ours, cycling-01 post: "thả dần vài con cá nhỏ" rồi "thả cả đàn một lần": hai bước mâu thuẫn nhau về cách thả neon.
- ours, cycling-01 post: "Ngừng thay 50% nước mỗi ngày... chỉ thay 20-30% khi thật sự cần": hơi đột ngột với nền dinh dưỡng mới đang nhả amoniac, và không nói rõ khi nào là cần, dù có dặn đo mỗi ngày.
- plain, cycling-01 post: "thả 2-3 con cá cảnh chịu đựng tốt (như tép...)" khi bể chưa chín: dùng sinh vật sống để thử bể là gây hại, và tép không chịu đựng tốt amoniac hay nitrit.
- plain, cycling-01 post: "loại bỏ amoniac và vi khuẩn": vi sinh chủ yếu bám ở lọc và nền, không bị thay nước loại bỏ đáng kể; hơn nữa thay nhiều trong giai đoạn đầu với nền dinh dưỡng mới lại có ích.
- plain, cycling-01 post: Hỏi loại "neon 7 màu": hiểu sai vì người hỏi đang kể hai loài là neon và cá 7 màu (bảy màu).
- plain, cycling-01 post: "thả 2-3 con cá cảnh chịu đựng tốt (như tép...)" là "cách đơn giản hơn": dùng sinh vật sống để thử bể chưa chín gây hại cho chúng, và tép không hề chịu đựng tốt, nhất là khi nền mới đang nhả amoniac.
- plain, cycling-01 post: "loại bỏ amoniac và vi khuẩn ngay khi chúng vừa hình thành": vi sinh chủ yếu bám ở vật liệu lọc và nền, thay nước không cuốn đi đáng kể; với nền dinh dưỡng mới, thay nước nhiều trong tuần đầu còn có lợi.
- plain, cycling-01 post: "loại 'neon 7 màu' cụ thể": đọc nhầm hai loài neon và bảy màu thành một loài, dù phía trên lại nhắc cá bảy màu riêng.
- plain, cycling-01 post: "Bổ sung thêm nền cùng loại khi cần, nhưng đừng xới lại": đổ thêm nền vào bể đã trồng và có nước vẫn gây xáo trộn cây và đục nước, mà không nói cách làm.
- plain, cycling-01 tank: "vài giọt nước rửa chén không có chất tẩy mạnh" làm nguồn amoniac: sai và nguy hiểm, nước rửa chén là chất tẩy rửa, không phải nguồn amoniac, có thể gây hại cho cá, cây và vi sinh.
- plain, cycling-01 tank: "vài giọt nước rửa chén không có chất tẩy mạnh" làm nguồn amoniac: nước rửa chén chứa chất hoạt động bề mặt, hại cá, tép và vi sinh; không phải nguồn amoniac an toàn để cycle.
- ours, cycling-02 post: "Cá vàng cần ít nhất 80 lít cho mỗi con": con số nêu cứng, không kèm lý do; với cá vàng nhỏ xíu của người mới thì việc đổi bể lớn ngay là quá gắt và khó thực hiện.
- plain, cycling-02 post: "Cá kiếm (platy)": cá kiếm là swordtail, còn platy thường gọi là cá hạc đỉnh, nên dễ mua nhầm loài.
- plain, cycling-02 post: "Neon và cá vàng đều thải nhiều chất bẩn": neon nhỏ và thải rất ít, chỉ cá vàng thải nhiều.
- plain, cycling-02 post: "Cá sọc ngựa (zebra danio) 18-24°C": dải này quá thấp và lệch thực tế; loài này vẫn sống tốt ở nhiệt độ phòng cao hơn tại Việt Nam.
- plain, cycling-02 post: "Mua máy sưởi nếu nuôi cá nhiệt đới": nêu như việc bắt buộc, trong khi phần lớn thời gian ở Việt Nam không cần, trừ mùa lạnh miền Bắc.
- plain, cycling-02 post: "Cá kiếm (platy)": ở Việt Nam cá kiếm là swordtail, còn platy thường gọi là cá hà lan/platy, nên dễ mua nhầm.
- plain, cycling-02 post: "Neon và cá vàng đều thải nhiều chất bẩn": neon rất nhỏ, tải thải thấp; chỉ cá vàng mới thải nhiều.
- plain, cycling-02 post: "Mua máy sưởi", "cá chọi... cần sưởi": khí hậu Việt Nam, nhất là miền Nam, thường không cần sưởi cho các loài này; lời khuyên chưa tính đến mùa và vùng miền, gây tốn kém không cần thiết.
- plain, cycling-02 tank: "dùng nguồn amoniac như vi sinh": vi sinh is bacteria, not an ammonia source, so this confuses the cycling method.
- plain, cycling-02 tank: "để nước máy qua 24 giờ": offered as a dechlorination option without saying that it does not reliably remove chloramine.
- plain, cycling-02 tank: "dùng nguồn amoniac như vi sinh/ amoniac tinh khiết": men vi sinh is not an ammonia source, so this cycling instruction is muddled.
- plain, cycling-02 tank: "Có thể thả vài con cá rất ít" to cycle: this exposes fish to ammonia and is a poor suggestion right after a mass die-off.
- ours, cycling-03 post: "nền trân châu mới nhả dinh dưỡng": trân châu ngọc trai lùn là cây trải nền, không phải giá thể nhả dinh dưỡng; phần thối rữa của thảm cây mới là nguồn ô nhiễm.
- ours, cycling-03 post: "Thả thêm tép ăn rêu và vài con ốc Nerita": mâu thuẫn với bước 1 là ngừng thả tép, ốc; thêm tải vào hồ chưa cycle, và chủ hồ đã thả tép mồi số lượng lớn mà không hiệu quả.
- ours, cycling-03 post: "Thả thêm tép ăn rêu và vài con ốc Nerita": mâu thuẫn với bước 1 "ngừng thả thêm", tăng tải cho bể chưa cycle; người hỏi đã thả tép mồi số lượng lớn mà không hiệu quả.
- ours, cycling-03 post: "nền trân châu mới nhả dinh dưỡng": hiểu trân châu là vật liệu nền, trong khi đó là cây trải nền.
- ours, cycling-03 post: "khoảng 20 con cá và tép": con số đoán, vì không rõ 2 ngàn đồng cá trâm là bao nhiêu con.
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": hiểu nhầm cây trải nền trân châu thành sỏi nền, nên phân tích phần này sai.
- plain, cycling-03 post: "vớt cây lùn ra khỏi nền, rửa sạch cây và nền rồi cho lại vào": thảm cây đang thối thì nên bỏ phần thối; rửa rồi trồng lại dễ làm đục hồ và không giải quyết gốc vấn đề.
- plain, cycling-03 post: "Tỳ bà bướm cần nhiều không gian và có thể ăn cây non": tỳ bà bướm chủ yếu cạo màng rêu, biofilm và không phải loài phá cây non như vậy.
- plain, cycling-03 post: "Trân châu là sỏi trơ, không giữ dinh dưỡng": hiểu sai, trân châu ngọc trai lùn ở đây là cây trải nền, không phải sỏi.
- plain, cycling-03 post: "vớt cây lùn ra khỏi nền, rửa sạch cây và nền rồi cho lại vào": dựa trên cách hiểu sai đó; xới tung nền và thảm cây đang yếu dễ làm nước đục và bẩn thêm.
- plain, cycling-03 post: "Tỳ bà bướm... có thể ăn cây non": không đúng với loài này, và câu trả lời bỏ qua yêu cầu thực sự của nó là nước mát, giàu oxy, có dòng chảy.
- ours, cycling-03 tank: "lọc sinh học mới có vài tuần": bể mới chạy một tuần, nên câu này sai dữ kiện người hỏi đưa ra.
- ours, cycling-03 tank: "lớp trắng lan nhanh thường là bùng vi sinh": gộp lớp trắng bám và làm thối trân châu với đục trắng vi sinh; trích dẫn kèm theo lại nói về nước đục sữa, không giải quyết phần cây đang thối.
- ours, cycling-03 tank: "lọc sinh học mới có vài tuần": sai với tình huống, vì câu hỏi nói rõ bể mới set một tuần.
- ours, cycling-03 tank: Coi "lớp trắng" gần như đục trắng do bùng vi sinh và đính kèm mục về nước đục, trong khi vấn đề là rêu trắng lan và làm thối cây; không có bước xử lý lớp trắng.
- plain, cycling-03 tank: "do dư dinh dưỡng và ánh sáng nhiều": lớp trắng vi khuẩn hay nấm mốc chủ yếu ăn chất hữu cơ, không phải do ánh sáng, nên giảm đèn ít tác dụng với nó.
- plain, cycling-03 tank: "không nguy hiểm trực tiếp": bỏ qua việc lớp trắng đang đi cùng trân châu thối, phần cây cần được dọn để khỏi thêm amoniac.
- plain, cycling-03 tank: "chuyển cá sang một thùng nước tạm": thùng tạm không có lọc đã chín nên cũng tích amoniac nhanh, mà câu trả lời không dặn thay nước cho thùng.
- plain, cycling-03 tank: "do dư dinh dưỡng và ánh sáng nhiều": ánh sáng không phải nguyên nhân chính của lớp vi khuẩn/nấm trắng ở bể mới; chất hữu cơ dư mới là chính.
- plain, cycling-03 tank: "không nguy hiểm trực tiếp": nói quá nhẹ, vì lớp trắng đang làm thối trân châu và phần cây thối làm nước bẩn thêm.
- plain, cycling-03 tank: "trồng cây thủy sinh nếu có thể, cây giúp hấp thụ nitrat": chưa đúng trọng tâm, vì lúc này độc tố nguy hiểm là amoniac/nitrit và bể đã có trân châu.
- ours, cycling-04 post: "đổ nước mới từ trên xuống": đổ từ trên cao dễ khuấy nền và làm cá hoảng; nên châm nhẹ, cách này chỉ hỗ trợ oxy một chút
- ours, cycling-04 post: Nói về "váng trắng" trong khi người hỏi tả "bọt trắng", nên bỏ sót khả năng bọt do dư xà phòng, chất tẩy rửa
- plain, cycling-04 post: "neon, guppy, betta thì khoảng 5–8 con": betta đực không nuôi chung 5–8 con trong hồ 36 lít được vì chúng đánh nhau
- plain, cycling-04 post: "Thay 25–30% nước" khi amoniac cao: mức này hơi nhẹ cho hồ đang chết cá; lúc khẩn cấp thường nên thay khoảng 50%
- plain, cycling-04 post: "neon, guppy, betta thì khoảng 5–8 con": betta, especially males, can't be kept in a group of 5–8 in a 36 L tank, even with the 'tùy loài' hedge.
- plain, cycling-04 post: "Thay 25–30% nước": this is on the low side for a tank where fish are already dying from ammonia; about 50% lowers it faster, though repeating the change every 1–2 days partly makes up for this.
- ours, cycling-04 tank: "Nếu trên 0,2 ppm, thay khoảng 30 đến 50% nước": ngưỡng không nêu lý do và quá dễ dãi với bể vừa có cá chết, vì nitrit hay amoniac đo được trên 0 đã nên thay nước.
- ours, cycling-04 tank: "Giữ sủi khí hoặc bật lọc": bể này chỉ chạy lọc, không có sủi, nên chữ "giữ" không đúng và không nói rõ có cần thêm sủi hay không.
- ours, cycling-04 tank: "Giữ sủi khí hoặc bật lọc": this tank already runs only a filter and fish still died, so it adds no extra aeration.
- ours, cycling-04 tank: "đo lại mỗi một đến hai ngày" conflicts with "theo dõi que thử hằng ngày" later in the same answer.
- ours, cycling-05 post: "Nếu amoni vượt 0,1 mg/L hoặc nitrit trên 0, hãy thay một phần nước": this threshold suits a tank with fish. In a fishless tank, frequent water changes remove the bacteria's food and slow the cycle.
- ours, cycling-05 post: Never tells the reader to add an ammonia source to a fishless tank: with nothing feeding the bacteria, amoni 0 on the test can falsely look like a finished cycle.
- ours, cycling-05 post: "Nếu amoni vượt 0,1 mg/L hoặc nitrit trên 0, hãy thay một phần nước": ngưỡng này dành cho bể có cá; trong bể chưa có cá đang chạy chu trình, amoni và nitrit tăng là bình thường, thay nước theo ngưỡng này là thừa và lấy mất thức ăn của vi khuẩn.
- ours, cycling-05 post: Quy trình cho bể chưa có cá không nêu nguồn amoni, nên hồ gần như không có gì để vi khuẩn phát triển và tiêu chí "nitrat có mặt" có thể không đạt.
- ours, cycling-05 post: "giữ nhiệt độ khoảng 24–26°C": khó giữ ở Việt Nam nếu không có thiết bị làm mát, và cũng không cần thiết để chạy vi sinh.
- plain, cycling-05 post: "Dùng nước đã để qua đêm": standing overnight may not clear all chlorine and does not reliably remove chloramine. The dechlorinator option and the closing question about chloramine partly offset this.
- plain, cycling-05 post: "hấp thụ nitrat": undersells that plants also take up ammonium directly. This is a minor simplification.
- plain, cycling-05 post: "Dùng nước đã để qua đêm": để qua đêm chỉ giúp với clo, không xử lý được cloramin, mà câu này không nêu điều kiện đó.
- ours, cycling-05 tank: "chỉ thả cá khi cả hai đều về 0": không nói cần nguồn amoniac để nuôi vi khuẩn. Bể mới đổ nước vốn đo NH3 và NO2 bằng 0 nên người đọc có thể tưởng bể đã cycling xong.
- ours, cycling-05 tank: "chỉ thả cá khi cả hai đều về 0" mà không nhắc nguồn amoniac: bể chưa có cá thì NH3 và NO2 có thể bằng 0 ngay từ đầu, dễ khiến người đọc tưởng đã cycling xong và thả cá sớm.
- plain, cycling-05 tank: "chịu được biến động như... cá lia thìa hoặc cá neon": neon khá nhạy với bể mới, còn thả 3-5 con lia thia dễ đánh nhau.
- plain, cycling-05 tank: "(thường có Nitrosomonas và Nitrobacter)... Seachem Stability": Stability không được biết đến là chai chứa hai chủng này, và các chai hiện đại thường dùng Nitrospira thay vì Nitrobacter.
- plain, cycling-05 tank: "chịu được biến động như... cá neon": neon không phải cá chịu biến động, không hợp để thả đầu tiên trong bể mới.
- plain, cycling-05 tank: Xếp Seachem Stability vào nhóm có Nitrosomonas/Nitrobacter: sản phẩm này không được công bố là chứa đúng các chủng đó, nên ví dụ này không chuẩn.
- ours, cycling-06 post: "Giảm đèn còn khoảng 8 đến 12 tiếng": 12 tiếng không phải là giảm và quá dài cho bể lowtech mới; khoảng 6-8 tiếng hợp lý hơn.
- ours, cycling-06 post: "Ngưng cho ăn khoảng 7 ngày": đưa ra cứng nhắc, không hỏi trong bể có cá gì; cá con có thể không chịu được lâu như vậy.
- ours, cycling-06 post: "Giảm đèn còn khoảng 8 đến 12 tiếng mỗi ngày": 12 hours is not a reduction and is too long for a low-tech tank, inviting algae; about 6-8 hours is more sensible.
- ours, cycling-06 post: "thất thường như 75%": the hobbyist never mentioned a 75% water change, so this figure appears out of nowhere.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": ánh sáng không trực tiếp nuôi vi khuẩn dị dưỡng gây đục.
- plain, cycling-06 post: "Giảm ánh sáng xuống khoảng 4-6 giờ/ngày": hơi thấp cho cây bể mới và không giải quyết đúng nguyên nhân đục vi khuẩn.
- plain, cycling-06 post: "ánh sáng nuôi tảo và vi khuẩn": light does not feed the heterotrophic bacteria behind a white bloom; dimming mainly helps against algae.
- plain, cycling-06 post: "Lấy vật liệu lọc... từ thùng xốp": a thùng xốp usually has no filter, so this source may not exist, and the answer does not offer the bottom sediment or a clear fallback beyond 'bể đã chạy ổn định'.
- ours, cycling-06 tank: "Nếu ammonia hoặc nitrite trên 0... đo nước mỗi ngày": không nói thay nước khi có độc tố, thiếu an toàn với bể chỉ khoảng 8 lít nếu đã có cá.
- ours, cycling-06 tank: "Ngưng cho ăn khoảng 7 ngày" is given flatly, without checking whether the new tank has fish or how small they are; it is too blanket, since feeding lightly or fasting 2-3 days is usually enough.
- ours, cycling-06 tank: "bể đang chạy lại một chu trình nhỏ" treats a newly set tank as if it were re-cycling; it has probably not finished its first cycle, and no water change is offered when ammonia or nitrite is above 0.
- ours, cycling-07 post: "Bể không có lọc thì không có vi sinh xử lý amoniac": nói quá, vi sinh vẫn sống trên nền, cây và mặt kính, chỉ là ít hơn và kém ổn định hơn khi không có lọc.
- ours, cycling-07 post: "Bể không có lọc thì không có vi sinh xử lý amoniac": nói quá, vi sinh vẫn sống trên nền, bề mặt và cây, chỉ là ít hơn và kém ổn định hơn.
- plain, cycling-07 post: "Thay nước 2-3 ngày một lần thường là không cần thiết": sai với hồ mới có phân nền, vì giai đoạn đầu phân nền nhả amoniac và dinh dưỡng nên cần thay nhiều, hồ lại không có lọc.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": sai, vi sinh bám chủ yếu trên nền và các bề mặt, rất ít trôi theo nước thay.
- plain, cycling-07 post: "thay 20-30% nước mỗi 1-2 tuần": quá thưa cho hồ vừa set có phân nền, không lọc, dễ tích amoniac và bùng rêu.
- plain, cycling-07 post: "Thay nước 2-3 ngày một lần thường là không cần thiết" và thay 1-2 tuần một lần: sai với hồ mới có phân nền, vì giai đoạn đầu phân nền nhả nhiều amoni, nhất là khi không có lọc, nên cần thay nước dày.
- plain, cycling-07 post: "Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi": sai, vi sinh chủ yếu bám trên bề mặt nền và giá thể, không nằm trong nước.
- plain, cycling-07 post: "Đừng hút đáy quá mạnh" đi cùng lịch thay thưa khiến chất nhả từ phân nền tích tụ, dễ bùng rêu và hại cây non.
- ours, cycling-07 tank: "Thêm đồ trang trí hoặc sỏi nền để tăng diện tích bề mặt" is weak advice for a substrate-planted tank: it adds little and does not address the absence of filtration or water flow.
- ours, cycling-07 tank: "Xin vật liệu lọc đã chạy lâu" is awkward for a tank with no filter, since it does not say where to put the media.
- plain, cycling-07 tank: Misreads "thay cho lọc" as replacing filter cleaning, when the hobbyist is asking about having no filter at all; advice on rinsing filter media does not apply to this tank.
- plain, cycling-07 tank: "thay nước để thay thế việc vệ sinh lọc": misreads the question; the hobbyist has no filter and is asking about water changes instead of a filter, so the filter-cleaning advice does not apply.
- ours, cycling-08 post: Lịch chuẩn bị 'chạy lọc có nước trước' rồi cycling mà không nhắc xử lý xi măng: xi măng mới làm pH rất cao và thải vôi, có thể hại vi sinh và giết cá.
- ours, cycling-08 post: 'vớt hết cây nổi thì mới cần châm' CO2: lý do gây hiểu lầm, vớt cây nổi không tự làm bể cần CO2.
- ours, cycling-08 post: Bỏ sót hoàn toàn việc xử lý xi măng: chỉ dặn kiểm tra rò nước rồi chạy chu trình; xi măng chưa xử lý làm nước rất kiềm, có thể giết cá và tép.
- ours, cycling-08 post: "đặt miệng xả hướng vào thành": lọc thác treo thành thường không xoay được miệng xả như vậy, nên mẹo này khó áp dụng.
- plain, cycling-08 post: 'pH ổn định (khoảng 7-7,5)': mốc hơi cứng, vì nước máy nhiều nơi có pH khác; điều cần xem là pH ổn định và gần pH nước nguồn.
- plain, cycling-08 post: "Ánh sáng tự nhiên trên sân thượng rất mạnh" / "đặt ngoài trời": hồ này nằm trong mái hiên nên ánh sáng thường yếu hơn nhiều; lý do này chưa sát, dù sau đó X có công nhận vị trí dưới mái hiên là hợp lý.
- plain, cycling-08 tank: "Thả cá từ từ, bắt đầu với số lượng ít" is listed as a tip to speed up cycling, and it conflicts with the earlier advice not to stock until the cycle finishes.
- plain, cycling-08 tank: "Thả cá từ từ" được xếp vào mẹo đẩy nhanh chu trình: việc này không rút ngắn cycle, chỉ giảm tải, và lẫn lộn với lời khuyên chờ xong mới thả cá.
- plain, cycling-08 tank: Tiêu chí bể sẵn sàng không nói phải có nguồn amoniac: bể trống không có chất thải cũng có thể đo 0/0 mà chưa có đủ vi khuẩn, dù điều kiện có nitrat giảm bớt phần nào rủi ro này.
- ours, sick-01 post: "Kiểm tra nhiệt độ (18–25°C)": copied from the species card without adapting it; most unchilled tanks in Vietnam run warmer, and zebra danios cope, so this range could mislead the keeper into blaming the water.
- ours, sick-01 post: "Nếu muốn điều trị, hãy chọn thuốc đúng với bệnh": comes right after saying there is no cure once advanced, and names no medicine, so it gives no usable treatment guidance.
- ours, sick-01 post: "Kiểm tra nhiệt độ (18–25°C)": khoảng này quá thấp với nước bể ở Việt Nam, nơi danio vẫn sống ổn ở 26–28°C; người nuôi có thể tưởng nhầm nhiệt độ là vấn đề.
- ours, sick-01 post: Không nhắc lao cá (Mycobacteriosis), một nguyên nhân cong người mạn tính rất đáng nghi và có thể lây qua vết xước, nên thiếu cảnh báo an toàn.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này": too categorical; a 3-year-old zebra danio is old, and spinal curvature is common in aged fish.
- plain, sick-01 post: "Columnaris, Aeromonas... cong người": presented as a chronic cause of bent bodies, but columnaris is usually an acute skin and gill disease, so this is a weak fit.
- plain, sick-01 post: "tuổi già thường không gây ra triệu chứng này": cá ngựa vằn 3 năm tuổi đã già và cong cột sống khi về già khá thường gặp, nên không thể gạt yếu tố tuổi.
- plain, sick-01 post: "Columnaris, Aeromonas... Gây tổn thương, cong người": đây thường là bệnh cấp với tổn thương da, mang; không phải nguyên nhân điển hình của cong người rải rác nhiều tuần.
- plain, sick-01 post: "cichlid vằn xanh": đoán sai hướng về loài, trong khi 'không đẻ nổi' và đàn gần 3 năm hợp với danio hơn, khiến phần chẩn đoán bị loãng.
- ours, sick-01 tank: "thường là dấu hiệu cột sống cong do thiếu vitamin C, hoặc do chấn thương hay di truyền": these do not explain adults in a long-kept tank bending and dying one after another every few weeks; it misses the likely causes, fish TB and microsporidia.
- ours, sick-01 tank: "đưa một con đến bác sĩ thú y thủy sản để soi mang": a gill check is poorly targeted, since spinal curvature from TB or Pseudoloma needs necropsy or tissue testing.
- ours, sick-01 tank: Species card "nhiệt độ 18–25 °C": impractical for Vietnamese room temperatures and could mislead the keeper into thinking the tank is too warm.
- ours, sick-01 tank: "thường là dấu hiệu cột sống cong do thiếu vitamin C, hoặc do chấn thương hay di truyền": a poor main explanation for fish that keep bending and dying within 1-2 weeks, which points to mycobacteriosis, microsporidia or old age.
- ours, sick-01 tank: Species card "18–25 °C": sits below normal Vietnamese tank temperatures and the answer does not reconcile it with local heat, so it could needlessly worry the keeper.
- plain, sick-01 tank: "Nhiễm virus Nodavirus (VNN)": listed as a common cause, but it is mainly a marine and larval fish problem and an unlikely fit for this slow, recurring pattern in an established ornamental tank.
- plain, sick-01 tank: "Khử trùng: vệ sinh dụng cụ, lọc, và đá nền": too vague, and disinfecting the filter and substrate of a running tank would kill the beneficial bacteria and cause an ammonia spike.
- plain, sick-01 tank: "Nodavirus (VNN)": a stretch to list as a common cause for slow deaths in adult ornamental danios kept for 3 years.
- ours, sick-02 post: "nếu có số đo thì thay khoảng 50% nước": the wording is unclear, since it should say to change water if ammonia or nitrite reads above 0.
- plain, sick-02 post: "nước máy ở nhiều nơi dùng chloramin": stated as a general fact without a source, and Vietnamese tap water is mostly chlorinated, so this is overstated.
- plain, sick-02 post: "Cho ăn đúng lượng trong 2–3 phút": generic advice that ignores that the keeper already feeds very little, and it could encourage feeding more.
- plain, sick-02 post: "Dấu hiệu nhận biết: ... rụng vảy hoặc có đốm trắng" lists disease signs such as white spots as signs of ammonia or nitrite poisoning, which can mislead the diagnosis.
- plain, sick-02 post: "nước máy ở nhiều nơi dùng chloramin" overstates chloramine use for Vietnam, where tap water is mostly treated with chlorine, and it is stated without a source.
- ours, sick-02 tank: "thường châm thêm nước cho đầy": the tank notes do not say this; it is an assumed detail stated as fact.
- ours, sick-02 tank: "thay khoảng 30–40% mỗi tháng": too little for a tank with goldfish that is already losing fish; a weekly change would suit it better.
- ours, sick-02 tank: "hãy đo oxy hòa tan ngay": few hobbyists have a DO test, and this tank already runs a filter and aeration 24/24, so it is an impractical next step.
- ours, sick-02 tank: "thường châm thêm nước cho đầy" is an invented detail; the hobbyist never said they top up.
- ours, sick-02 tank: "thay khoảng 30–40% mỗi tháng" is on the low side for a tank with goldfish, though the alternative of smaller changes several times a week partly offsets this.
- ours, sick-02 tank: "hãy đo oxy hòa tan ngay" is impractical, since few Vietnamese hobbyists have a DO test, and the tank already runs filter and aeration 24/7.
- plain, sick-02 tank: "Nên kiểm tra bằng bút thử điện": a tester pen is an unreliable way to detect a small leak in water, so it can give false reassurance.
- plain, sick-02 tank: "Giảm số lượng cá": this tank is sparsely stocked, so the advice does not apply to it.
- plain, sick-02 tank: "Giảm số lượng cá" and the overstocking cause do not apply: this tank is sparsely stocked, so the advice misdirects the reader.
- plain, sick-02 tank: "Đo nhiệt độ... để kiểm tra heater" assumes a heater that nothing suggests this tank has; it is generic filler for an indoor tank in Vietnam.
- ours, sick-03 tank: "pha thêm nước RO hoặc nước đã để lắng" để giảm TDS: để lắng chỉ giúp bay clo, gần như không làm giảm TDS.
- ours, sick-03 tank: "Đo ... oxy hòa tan" ngay: dân chơi hầu như không có bộ đo DO, nên bước này khó làm và cần cách kiểm tra thay thế.
- ours, sick-03 tank: "pha thêm nước RO hoặc nước đã để lắng" để giảm TDS: để lắng không làm giảm khoáng hòa tan nên TDS gần như không đổi.
- ours, sick-03 tank: "CO2 dư" được nêu là nghi phạm: test CO2 của bể đang báo thiếu và pH 7, KH 4 không cho thấy dư CO2, nên hướng này ít khả năng đúng.
- ours, sick-03 tank: "TDS khoảng 100–150 hợp với bể thủy sinh": mốc này quá hẹp để áp cho mọi bể, nhất là khi nước nguồn đã 160-200.
- plain, sick-03 tank: "Tép (nhất là Caridina như tép Crystal, Bee, Taiwan bee)": lý giải theo nhóm Caridina, trong khi tép màu thường là Neocaridina, chịu được GH 8 và TDS cao hơn nhiều, nên làm nặng thêm nghi ngờ về độ cứng.
- plain, sick-03 tank: "Tép (nhất là Caridina như tép Crystal, Bee, Taiwan bee)": lấy nhóm tép khó làm trọng tâm, trong khi tép màu chịu được GH 8, KH 4 khá tốt, nên dễ dẫn người đọc đi sai hướng.
- ours, sick-04 post: "rêu trân châu": trân châu ngọc trai là cây thủy sinh trải thảm, không phải rêu; lỗi gọi tên nhỏ, không ảnh hưởng đến cách xử lý.
- ours, sick-04 post: "rêu trân châu": trân châu ngọc trai là cây thảm, không phải rêu; lỗi nhỏ về thuật ngữ, không ảnh hưởng hướng xử lý.
- plain, sick-04 post: "Ốc vảy (Neritina)... vết gãy hoặc mòn trên vỏ": vảy ốc xanh/đỏ là cây Rotala, không phải ốc; người hỏi đang tả ngọn lá bị gãy, nên cả đoạn này sai và vô dụng.
- plain, sick-04 post: "Amoniac là thủ phạm đáng ngờ nhất": tép hoảng loạn khoảng 10 giây sau khi cho Neo Soft vào thì không thể do amoniac từ xác và lá rữa, vì những thứ này chỉ xuất hiện sau đó; đây là sai nguyên nhân chính.
- plain, sick-04 post: "Tắt đèn vài ngày": trình bày như bước bắt buộc mà không nêu số ngày, trong khi cây có CO2 đang yếu không cần tắt hẳn đèn; giảm giờ chiếu sáng sẽ hợp lý hơn.
- plain, sick-04 post: "Ốc vảy (Neritina)... vết gãy hoặc mòn trên vỏ": vảy ốc là cây Rotala, không phải ốc, nên cả phần chẩn đoán này sai và triệu chứng gãy ngang ngọn của cây không được xử lý.
- plain, sick-04 post: "Amoniac... là thủ phạm đáng ngờ nhất": tép loạn khoảng 10 giây sau khi cho Neo Soft vào là sốc do vật liệu hoặc pH; amoniac từ xác và lá rữa chỉ là hệ quả về sau.
- plain, sick-04 post: "Thay 40-50% nước bằng nước RO": thay lớn bằng RO khi KH và pH đang cao có thể làm thông số đổi nhanh, gây thêm sốc cho tép còn sống.
- ours, sick-04 tank: "đưa pH về mức cũ trong khoảng 4–8 giờ": the old level here is 8.4, caused by the rock, which is too high for shrimp, so forcing it back in hours adds a second shock.
- ours, sick-04 tank: "hòa khoảng 5 g baking soda": pushing pH up with bicarbonate is risky here, since the tank was already at 8.4 on hard rock and any ammonia becomes more toxic at higher pH.
- ours, sick-04 tank: "đưa pH về mức cũ": in this tank the old pH is 8.4, caused by the đá da voi and too high for shrimp; returning there quickly in 4–8 hours is a second large swing, and the answer never names the rock as the root problem.
- ours, sick-04 tank: "thay thêm 15–20% nước" to raise pH: the source water is pH ≤ 7.0, so water changes may not raise pH as this step assumes.
- plain, sick-04 tank: Emergency list omits turning off CO₂: the tank injects CO₂, which adds to the pH swing and to the shrimps' breathing stress during the crisis.
- ours, sick-05 post: "tiếp tục thay ít nhất 50% nước": does not address that the hobbyist changes water with purified drinking water, so repeating this keeps stripping minerals and destabilising pH.
- ours, sick-05 post: "Bể mới set khoảng 2 tháng thường còn trong giai đoạn chạy chu trình nitơ": a tank should normally have cycled by 2 months; the likelier issues are overload or a damaged cycle, which this does not separate out.
- ours, sick-05 post: "cần vệ sinh và chạy lại hệ lọc": restarting the filter risks losing beneficial bacteria and worsening ammonia and nitrite while fish are still dying.
- ours, sick-05 post: "đừng bỏ vào ngăn đá": the freezer note about tissue testing is irrelevant to a home hobbyist and distracts from the fix.
- ours, sick-05 post: "tiếp tục thay ít nhất 50% nước": does not flag the bottled drinking water, so it keeps stripping minerals and buffer from a CO2 tank and risks further pH swings.
- ours, sick-05 post: "vệ sinh và chạy lại hệ lọc": restarting the filter wipes out beneficial bacteria and can worsen ammonia and nitrite in a struggling tank.
- ours, sick-05 post: "Bể mới set khoảng 2 tháng thường còn trong giai đoạn chạy chu trình nitơ": a two-month tank has normally finished cycling, so this overstates the cycle as the explanation without looking for why it is unstable.
- plain, sick-05 post: "Vệ sinh lọc" as a routine immediate step: even with old tank water, cleaning the filter during an unstable cycle can set it back, and the answer gives no caution about doing it gently or partially.
- plain, sick-05 post: "Tắt CO2 vài ngày" is acceptable as a test, but the answer does not warn that this can upset CO2-dependent plants or pH, a minor omission.
- ours, sick-05 tank: "kiểu old tank syndrome": bể mới chạy khoảng 8,6 tuần và thay 50% cách ngày, nên chất bẩn và khoáng không thể dồn lại kiểu bể cũ.
- ours, sick-05 tank: "Tăng lượng thay lên khoảng 30 đến 50 phần trăm": họ đã thay 50% cách ngày, nên đây không phải là tăng và bỏ qua việc nước uống đóng bình có thể nghèo khoáng.
- ours, sick-05 tank: "đổi sang thức ăn đông lạnh nếu đang dùng thức ăn khô": việc đổi này không có cơ sở là sẽ làm hết nước vàng hay cá chết.
- ours, sick-05 tank: "kiểu old tank syndrome": the tank has run only about 8.6 weeks, so old tank syndrome is the wrong lead diagnosis.
- ours, sick-05 tank: "lượng nước thay chưa theo kịp" and "Tăng lượng thay lên khoảng 30 đến 50 phần trăm": they already change 50% every other day, so this does not fit and adds nothing.
- ours, sick-05 tank: "đổi sang thức ăn đông lạnh": frozen food does not address the problem and can foul the water more if overfed.
- plain, sick-05 tank: "Thay 30–50% nước": họ đã thay 50% cách ngày, nên bước này không giải quyết được vấn đề và không xét đến nước đóng bình có thể nghèo khoáng.
- plain, sick-05 tank: "Tảo silic... thường do ánh sáng yếu": the low-light link is weak; diatoms in new tanks are mostly a matter of silicate and an immature tank, and the claim that they turn the water cloudy brown is also loose.
- plain, sick-06 post: "Giảm lượng mồi cho cá mồi vì thức ăn thừa": câu lẫn lộn và lệch trọng tâm, vì vấn đề là cá mồi sống trong bể và rồng không ăn, nên cần vớt bớt cá mồi.
- ours, sick-06 tank: "Giữ khoảng 22–28°C": this range is low for arowana, which are usually kept at about 26–30°C, and 22°C would discourage feeding.
- ours, sick-06 tank: "Chạy sủi oxy 4–6 giờ mỗi ngày": the fixed hours have no stated basis; a stressed arowana in a new tank should have continuous aeration.
- ours, sick-06 tank: "giữ khoảng 22–28°C": too cool as a target for Asian arowana, which keepers usually hold around 26–30°C; the lower end can further suppress appetite.
- ours, sick-06 tank: "chạy sủi oxy 4–6 giờ mỗi ngày": the fixed hours have no stated reason, and aeration in a new tank should not be rationed like this.
- plain, sick-06 tank: "Đặt cây thủy sinh, đá hoặc ống để cá có chỗ ẩn nấp": this is generic advice that suits arowana poorly, since they are large surface swimmers and clutter can cause injury when they startle.
- ours, sick-07 tank: "hút đáy, vệ sinh lọc": cleaning the filter right after a tank flip risks losing more beneficial bacteria unless done gently in tank water; the answer gives no such caution.
- ours, sick-07 tank: "nấm chỉ bám khi bể có vấn đề": overstated, since handling injuries from the flip alone can allow infection.
- ours, sick-07 tank: "vệ sinh lọc": said without warning to rinse the media gently in tank water; cleaning the filter right after a tank flip can lose beneficial bacteria and worsen the water.
- ours, sick-07 tank: "nấm chỉ bám khi bể có vấn đề": overstated, and it conflicts with its own point that injury and stress from the flip let fungus take hold.
- plain, sick-07 tank: "Cá bị nấm sau khi lật bể thường là hệ quả của nước xấu": too one-sided, because it omits scratches and handling stress from the flip, which are a likely trigger.
- plain, sick-07 tank: "Muối... không đủ để trị nấm đã bám rõ": too absolute, since properly dosed salt often helps with early external fungus.
- plain, sick-07 tank: "Tăng nhiệt độ nhẹ": applied without first ruling out columnaris, a bacterial infection that can look like fungus and may worsen in warmer water.
- plain, sick-07 tank: "Tăng nhiệt độ nhẹ (khoảng 27-28°C)... giúp tăng sức đề kháng": stated as a general benefit, but this is an unproven claim and of little use since many Vietnamese tanks already run this warm.
- ours, sick-08 post: "Theo dõi đàn otto còn lại": người hỏi nói cả 3 con đã chết, không còn otto để theo dõi.
- ours, sick-08 post: "Theo dõi đàn otto còn lại": the hobbyist said all 3 otto died, so there are none left to watch.
- ours, sick-08 post: "sốc và stress hơn là vì bể có vấn đề độc hại, vì neon trong cùng bể vẫn bình thường": healthy neon do not rule out a water problem, because otto are more sensitive.
- plain, sick-08 post: "Thiếu oxy vào ban đêm (khả năng cao nhất)": xếp hạng quá chắc khi chưa biết gì về sục khí, mật độ cây hay lọc, và bỏ qua nguyên nhân rất phổ biến là otto mới mua đã yếu, đói hoặc sốc khi thả.
- plain, sick-08 post: "Chết đột ngột, nằm im là dấu hiệu điển hình của độc tố": nói quá, vì sốc, cá yếu sẵn hay thiếu oxy đều có thể cho biểu hiện y hệt.
- plain, sick-08 post: "Chết đột ngột, nằm im là dấu hiệu điển hình của độc tố": overclaimed, since this sign is non-specific and also fits shock, low oxygen or already weak fish.
- plain, sick-08 post: "Thiếu oxy vào ban đêm (khả năng cao nhất)": ranked most likely with no evidence of low aeration or a heavily planted tank, and it is a shaky lead cause when neon stay normal.
- ours, sick-08 tank: "chưa tập ăn được... chết đói": đói không thể giết cả đàn sau một đêm, nên nguyên nhân này không khớp tình huống.
- ours, sick-08 tank: "nếu otto còn yếu hoặc chết thêm": cả 3 otto đã chết, nên điều kiện theo dõi này không áp dụng; việc đo NH₃/NO₂ lẽ ra phải làm ngay.
- ours, sick-08 tank: "Giữ nhiệt khoảng 21 đến 26°C": khó giữ ở hồ không có chiller trong mùa nóng Việt Nam, và câu trả lời không nói cách xử lý.
- ours, sick-08 tank: "vì chưa tập ăn được" / "chết đói": starvation takes days to weeks and cannot explain all the otto dying after one night.
- ours, sick-08 tank: "nếu otto còn yếu hoặc chết thêm": all 3 otto are already dead, so this follow-up does not apply, and it delays the ammonia and nitrite test that should happen now.
- ours, sick-08 tank: "Giữ nhiệt khoảng 21 đến 26°C": the range comes straight from the species card and is unrealistic for most unchilled tanks in Vietnam's heat, with no practical guidance on how to manage it.
- ours, sick-09 post: "thiếu oxy trong nước lạnh" as the lead cause: cold water holds more oxygen and cold fish use less, so with a pump running this is unlikely, and it never raises ammonia/nitrite.
- ours, sick-09 post: "Về đáy lát đá hoa... không làm đổi độ pH nhiều thì thường không sao": gives no real answer and misses that marble is calcium carbonate, which raises hardness and pH.
- ours, sick-09 post: "nhiều khả năng là thiếu oxy trong nước lạnh": nước lạnh giữ oxy tốt hơn và bể đã có bơm tạo oxy, nên đây khó là nguyên nhân chính; câu trả lời còn bỏ qua amoniac/nitrit và không đề nghị test nước.
- ours, sick-09 post: "che bóng cho hồ": đưa ra khi trời đang lạnh ngắt mà không nói rõ dành cho mùa nóng, nên không giúp gì cho vấn đề hiện tại.
- plain, sick-09 post: "cho thấy cá đang đói hoặc thiếu thức ăn tự nhiên": koi and carp nibble water lilies even when well fed, so this is not evidence of hunger.
- plain, sick-09 post: "Với 6–7 con cá vừa mua/thả thì mật độ có thể đã vượt mức": 6–7 is the number that died, not the stock, and that many fish in about 1,350 L is not clearly overstocked.
- plain, sick-09 post: "mùa lạnh nước cũng dễ thiếu oxy": nước lạnh giữ được nhiều oxy hơn và cá tiêu thụ ít hơn, nên đây không phải quy luật chung.
- plain, sick-09 post: "cho thấy cá đang đói hoặc thiếu thức ăn tự nhiên": koi và chép vốn hay rỉa, đào phá cây, kể cả khi no.
- plain, sick-09 post: "Với 6–7 con cá... mật độ có thể đã vượt mức chịu của bể": 6–7 là số cá chết, không phải tổng số cá, và kích thước cá chưa rõ nên nhận định này còn thiếu căn cứ.
- ours, stocking-01 post: "Vì vậy có con mất hẳn không thấy xác": weak reasoning, since it never says plainly that the goby or other tankmates likely ate the small guppies or scavenged them.
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": cá bảy màu rất hiền, chúng là nạn nhân trong bể này chứ không phải thủ phạm.
- plain, stocking-01 post: "Nếu muốn nuôi cá 7 màu: nên nuôi cùng cá cỡ lớn... bể tối thiểu khoảng 200 lít": sai và có hại; bảy màu nuôi tốt trong bể nhỏ và cá lớn sẽ ăn chúng.
- plain, stocking-01 post: "Cá vàng rất nhạy với nước xấu": cá vàng thuộc loại chịu nước khá tốt, nên dùng nó làm lý do nghi nước là suy luận yếu.
- plain, stocking-01 post: "Bống và dọn bể: chỉ nên nuôi chung với cá to": quy tắc chung vô căn cứ, nhất là khi chưa biết loài.
- plain, stocking-01 post: "Cá 7 màu là loài ăn tạp, hung dữ": guppy is a peaceful fish, and it did not cause these deaths or eat the larger fish.
- plain, stocking-01 post: "nên nuôi cùng cá cỡ lớn... bể tối thiểu khoảng 200 lít": guppies are small and do fine in far smaller tanks; large tankmates would eat them, which is the very problem here.
- plain, stocking-01 post: "Bống và dọn bể: chỉ nên nuôi chung với cá to": too sweeping, and it conflicts with keeping guppies safe; the species isn't known either.
- ours, stocking-01 tank: "cá tỳ bà leopard ... có thể ăn cá bảy màu": overstated, since tỳ bà rarely catches healthy guppies; it mostly scavenges weak or dead fish, so goldfish are the likelier predator.
- ours, stocking-01 tank: Treats "cá dọn bể" as tỳ bà leopard with a 50 cm figure, though the hobbyist's fish may be a different cleaner species.
- ours, stocking-01 tank: "Cá tỳ bà leopard có thể dài tới 50 cm": hồ sơ bể chỉ ghi cá dọn bể, nên việc coi đó là tỳ bà leopard và dùng con số này là suy đoán chưa được xác nhận.
- ours, stocking-01 tank: "cá vàng và cá tỳ bà leopard đều có thể ăn cá bảy màu": đặt tỳ bà ngang hàng với cá vàng là quá tay, vì tỳ bà hiếm khi săn được bảy màu khỏe và thường chỉ rỉa cá yếu hoặc cá chết.
- plain, stocking-01 tank: "cá chùy (cá tỳ bà, cá chuột)": an odd, non-standard name for these cleaner fish that would confuse the reader.
- plain, stocking-01 tank: Names "cá rô, cá đầu bạc, cichlid, cá lia thia, cá lóc con" as likely culprits, none of which are in this tank, while missing the goldfish that are.
- plain, stocking-01 tank: "cá chùy (cá tỳ bà, cá chuột)": gộp tên gọi lạ, không phải cách gọi quen của dân chơi cá và dễ gây nhầm giữa tỳ bà với cá chuột.
- plain, stocking-01 tank: "cá rô, cá đầu bạc, cichlid, cá lia thia, hoặc cá lóc con": nêu các loài không có trong bể, trong khi bỏ sót cá vàng là thủ phạm đáng nghi nhất.
- ours, stocking-02 post: "Trước mỗi đợt, cho mún và chuột vào bể mới xem cả đàn có ăn...": confusing step; these fish are already in the tank, and it makes little practical sense.
- ours, stocking-02 post: "chưa xác nhận được 'mún' là loài nào": mún is a common Vietnamese hobby name for platy, so half of the question goes unanswered.
- ours, stocking-02 post: "neon cần chỗ bơi và có thể lớn hơn ước lượng ban đầu": vague filler that gives no usable stocking limit.
- ours, stocking-02 post: "Mình chưa xác nhận được mún là loài nào": không nhận ra platy nên bỏ trống hẳn câu hỏi sống chung, dù đây là câu hỏi chính.
- ours, stocking-02 post: "cho mún và chuột vào bể mới xem cả đàn có ăn và bơi bình thường không": bước này vô lý vì cá đã ở sẵn trong hồ, dễ gây hiểu nhầm là phải chuyển cá.
- ours, stocking-02 post: "neon cần chỗ bơi và có thể lớn hơn ước lượng ban đầu": mơ hồ, không giúp gì; neon vốn nhỏ, chỉ khoảng 3-4 cm.
- plain, stocking-02 post: "Nếu 'mún' của bạn là loài cá ăn thịt hoặc có tính hung dữ (ví dụ cá rô, cá betta đực...)": fails to recognise mún as the peaceful platy, leaving the compatibility answer conditional.
- plain, stocking-02 post: Không nhận ra "mún" là cá platy, một loài hiền sống tốt với neon; nêu cá rô, betta đực làm ví dụ nên câu trả lời chỉ mang tính điều kiện và chưa khẳng định được.
- ours, stocking-02 tank: "Cá chuột đồng cần bể dài từ 80 cm": overstated, since a small group of corydoras lives fine in a 60 cm tank and the caution is unnecessary.
- ours, stocking-02 tank: "Chọn đàn neon khoảng 8–10 con, không cần 40 con": too conservative for 96 L, which can hold a larger school if it is built up gradually.
- ours, stocking-02 tank: "mình chưa xác định được loài mún": fails to recognise mún as the common platy, even though the answer still says they can be kept together.
- ours, stocking-02 tank: "Cá chuột đồng cần bể dài từ 80 cm": too strict; a small group of corydoras is commonly kept fine in a 60 cm tank, so there is little need to rethink the number.
- ours, stocking-02 tank: "Chọn đàn neon khoảng 8–10 con": overly conservative as the only option; a 96 L tank could take a larger school if stocked gradually, and it never says how many would fit.
- plain, stocking-02 tank: "thả thêm 40 con neon thường vẫn được" at about 100 L: too permissive for a tank running only 1 week that already holds 10 fish, and the opening does not warn about the immature tank.
- plain, stocking-02 tank: "mình chưa chắc bạn đang nói loài nào": does not recognise mún as platy, so the compatibility question goes unanswered.
- plain, stocking-02 tank: "cá lia thia lùn" listed as a safe companion: a loose name, and betta-type fish are not a reliably peaceful match for a neon school.
- plain, stocking-02 tank: "100 lít trở lên... thả thêm 40 con neon thường vẫn được": this comes close to approving 40 neons for a 96 L tank running only 1 week, which risks an ammonia spike; batching is only a conditional afterthought.
- plain, stocking-02 tank: "cá lia thia lùn" listed as a safe tankmate: this is not a clear, common Vietnamese fish name, and lia thia (bettas) are not a reliably peaceful match for neons.
- ours, stocking-03 post: "Lọc treo hợp bể 20 đến 100 lít" được dùng để khuyên mua lọc treo cho bể 15 lít, tức là bể nằm ngoài khoảng vừa nêu mà không giải thích.
- plain, stocking-03 post: "Tránh cá đàn lớn như neon, cá chuột, cá lia thia": lia thia is a betta-type fish kept singly, not a large schooling fish, and it conflicts with recommending a betta for this tank.
- plain, stocking-03 post: "Tránh cá đàn lớn như neon, cá chuột, cá lia thia": lia thia không phải cá đàn, mà là họ hàng gần của cá xiêm và cũng có thể nuôi một con trong bể này.
- ours, stocking-03 tank: "cá neon vua" được gợi ý cho bể 35 cm trong khi chính thẻ loài ghi bể từ 60 cm, đàn từ 8 con: không hợp bể 15 lít.
- ours, stocking-03 tank: "Lắp sưởi giữ nước khoảng 23–27°C": ở phần lớn Việt Nam thường không cần sưởi quanh năm; đây là chi phí thừa, nhất là khi không phân biệt miền Nam và mùa lạnh miền Bắc.
- ours, stocking-03 tank: "chạy chu trình nitơ khoảng 1–2 tuần": khá ngắn, chu trình thường mất 3–4 tuần và không nói phải test xác nhận trước khi thả cá.
- ours, stocking-03 tank: Gợi ý "cá neon vua" cho bể 35 cm: chính thẻ loài bên dưới ghi bể từ 60 cm và đàn từ 8 con, nên mâu thuẫn với bể này và với mức 6–8 con.
- ours, stocking-03 tank: "chạy chu trình nitơ khoảng 1–2 tuần": thường là quá ngắn; chu trình thường cần khoảng 3–4 tuần hoặc hơn, nên dễ thả cá sớm nếu không đo test.
- ours, stocking-03 tank: "Lắp sưởi giữ nước khoảng 23–27°C": nêu như bước bắt buộc, trong khi phần lớn thời gian ở Việt Nam, nhất là miền Nam, không cần sưởi; đáng lo hơn là nóng mùa hè.
- plain, stocking-03 tank: "cá thái lan (cá dĩa nhỏ hiền)": cách gọi sai và gây nhầm; cá dĩa là cá lớn, khó nuôi, không phải cá cho người mới.
- plain, stocking-03 tank: "Bể 30 lít: khoảng 8–10 con cá nhỏ (neon, bảy màu, molly...)": molly khá to và thải nhiều, xếp vào nhóm cá nhỏ là không hợp.
- plain, stocking-03 tank: Liệt kê cá vàng, molly, corydoras cho người mới mà không xét bể chỉ khoảng 15 lít, nên dễ khiến họ chọn loài quá khổ.
- plain, stocking-03 tank: "cá thái lan (cá dĩa nhỏ hiền)": mô tả sai và gây nhầm; cá dĩa là cá lớn, khó nuôi, không phải cá cho người mới hay bể nhỏ.
- plain, stocking-03 tank: "Cá nhỏ cần khoảng 2–3 lít nước mỗi con": quy tắc quá thoáng, dễ khiến người mới nuôi quá đông, nhất là khi gợi ý cả molly và corydoras vốn không hợp bể nhỏ.
- ours, stocking-04 post: "nuôi riêng một bể hoặc một hũ": a jar is unsuitable for this algae eater, which grows large and needs filtration and oxygen.
- ours, stocking-04 post: "bể bạn đã lâu không cho ăn gì": assumes the other fish went unfed; the hobbyist only said the bống survives without feeding.
- plain, stocking-04 post: "khả năng cao cá chết không phải do bống": misses that golden algae eaters are known to latch onto slow fish like mún, kiếm and guppies and suck their slime.
- plain, stocking-04 post: "Bống ăn cá nhỏ hoặc tôm": treats it as a predatory goby, not the algae-grazing fish described, so the risk is misidentified.
- plain, stocking-04 post: "cá neon... cá thái lan nhỏ": recommends tankmates using goby logic, with no warning that small or slow fish can be latched onto as the bống grows.
- plain, stocking-04 post: "Bể không cần cạo rêu, không thay nước": the hobbyist never said they skip water changes.
- plain, stocking-04 post: "khả năng cao cá chết không phải do bống 'xử'": the fish described, which cleans algae and clings to glass, rocks and plants, is most likely the golden algae eater, known for latching on and rasping slime off tankmates, so this clears the real suspect.
- plain, stocking-04 post: "Bống ăn cá nhỏ hoặc tôm... Tránh cá đáy": treats it as a predatory, territorial goby, not an algae eater that attacks by sucking slime.
- plain, stocking-04 post: "cá lòng tong, cá neon, cá bạc má nhỏ": recommends small, slow tankmates that are also at risk from a large slime-sucking fish.
- plain, stocking-04 post: "không thay nước": the hobbyist never said they don't change water, yet this is the basis for the top-ranked cause.
- ours, stocking-04 tank: "Nhịn ăn 24–48 giờ theo cẩm nang": the excerpt shown says to delay the first meal 12–24 hours, so the figure does not clearly match its cited source.
- ours, stocking-04 tank: "Bể đang chỉ có một bống vàng": the tank data lists the species but not that there is only one fish.
- ours, stocking-04 tank: "tắt đèn và nhịn ăn 24–48 giờ theo cẩm nang": con số gán cho cẩm nang không khớp với đoạn trích hiển thị (tắt đèn 6–12 giờ, hoãn bữa đầu 12–24 giờ).
- ours, stocking-04 tank: "Bể đang chỉ có một bống vàng": hồ sơ không cho biết số lượng, đây là suy đoán.
- plain, stocking-04 tank: "Cá kiếm (platy)": cá kiếm is swordtail; platy is cá mún, and the answer then lists swordtail again separately.
- plain, stocking-04 tank: "Cá hồng kim (neon tetra)": hồng kim is a red swordtail/platy-type fish, not neon tetra.
- plain, stocking-04 tank: "Ốc hương": this is a marine snail, not one for a freshwater community tank.
- plain, stocking-04 tank: Recommends bảy màu and kiếm again without noting these already died in this tank, and groups cá dĩa under a general community list despite its different needs.
- plain, stocking-04 tank: "cá kiếm (platy)", "cá hồng kim (neon tetra)" và "cá đuôi kiếm (swordtail)": gọi sai tên; ở Việt Nam cá kiếm là swordtail, hồng kim không phải neon tetra.
- plain, stocking-04 tank: Xếp "cá dĩa" và "cá đá (betta)" vào nhóm nuôi chung với bảy màu: cá dĩa cần nước ấm và bể riêng phù hợp, betta dễ cắn vây bảy màu, lại mâu thuẫn với lưu ý tránh ngay bên dưới.
- plain, stocking-04 tank: "1 inch cá cho 1 gallon": quy tắc thô, dễ gây hiểu lầm và không xét đến loài cá.
- plain, stocking-04 tank: "ốc hương": đây là ốc biển, không phải ốc nuôi bể nước ngọt.
- ours, stocking-05 post: "Mình chưa kiểm tra cặp này bằng công cụ tank-mates": lộ chuyện nội bộ của công cụ và né câu hỏi chính, không trả lời dứt khoát có nuôi chung được hay không.
- ours, stocking-05 post: "việc nuôi chung không phải là điều cấm": lấy thông tin về koi để suy ra cá chép, dễ khiến người nuôi vừa mất cá lại tiếp tục thử ghép chung.
- ours, stocking-05 post: "Vớt con cá chép ra": người hỏi mua mấy con, không phải một con.
- ours, stocking-05 post: "nếu còn cắn nhau... thì nên tách hẳn cá chép ra": this contradicts step 1, which already removes the carp, and it suggests waiting while the goldfish are still at risk.
- ours, stocking-05 post: "chưa khẳng định được": after a fish has already died, this hedge leaves the direct question unanswered and leans towards keeping them together again.
- plain, stocking-05 post: "Cá chép thường hung hăng, hay rượt và cắn vây cá khác": nói hơi quá, cá chép thường không hung dữ theo kiểu đó; rượt cắn chủ yếu do tranh ăn, chênh lệch kích cỡ hoặc bể chật.
- plain, stocking-05 post: "Cá chép thường hung hăng": this overgeneralizes, since carp are usually not aggressive by nature and the bullying often comes from size difference, food competition or crowding.
- plain, stocking-05 post: "nhu cầu môi trường và thức ăn hơi khác nhau": this is a weak reason, because carp and goldfish have very similar needs.
- ours, stocking-05 tank: "Cá koi có thể ăn Cá vàng": the hobbyist has cá chép, not koi. The answer swaps in koi figures, while its own tool says cá chép was not checked.
- ours, stocking-05 tank: "con cá vàng đã chết là hậu quả của việc này": states the cause of death as fact, without ruling out disease from the new fish or poor water.
- ours, stocking-05 tank: "tính peaceful" on the species card sits awkwardly beside a fish described as attacking and able to eat goldfish, which confuses the reader.
- ours, stocking-05 tank: "Cá koi có thể ăn Cá vàng" silently swaps the hobbyist's cá chép for koi; the figures and species card are for koi, while its own tool result admits it has no data for cá chép.
- ours, stocking-05 tank: "con cá vàng đã chết là hậu quả của việc này" states the cause of death as fact, with no sign of bite wounds and without considering water or newly introduced disease.
- plain, stocking-05 tank: "thuốc xanh methylen hoặc muối (liều nhẹ)": gives no actual dose, so the reader cannot apply it safely.
- plain, stocking-05 tank: "Cho ăn đầy đủ để cá chép bớt tranh ăn": a weak fix for aggression that can dirty the water, and it distracts from separating the fish.
- ours, stocking-06 post: "bạn không cần thay mỗi tuần": bể mới đang có mùi và chưa ổn định vi sinh thì nên duy trì thay nước đều, nên câu này dễ khiến người mới lơ là.
- ours, stocking-06 post: "theo dõi xem chúng có ăn trứng hay không": mún và kiếm đẻ con nên không có trứng cần lo, và nerita chủ yếu ăn rêu; câu này còn củng cố hiểu lầm của người hỏi.
- ours, stocking-06 post: "theo dõi xem chúng có ăn trứng hay không": mún và kiếm đẻ con, không có trứng để ăn, nên câu này củng cố hiểu lầm của người hỏi.
- ours, stocking-06 post: "không cần thay mỗi tuần": bể mới set, vừa thêm cá và nước đang hôi thì nói vậy dễ khiến người nuôi lơi việc thay nước định kỳ.
- plain, stocking-06 post: "Mùi hôi thường là dấu hiệu của amoniac": hơi quy kết quá; mùi thối thường đến từ chất hữu cơ phân hủy, còn amoniac phải đo mới biết, dù ý này không gây hại.
- plain, stocking-06 post: "bèo tây" là lựa chọn lạ cho bể cubic nhỏ: cây này to, không phù hợp để làm chỗ trốn cho cá bột trong bể nhỏ.
- ours, stocking-06 tank: "thay nước sẽ không xử lý được nếu bể chưa đủ vi sinh": nói quá; thay nước không tạo ra vi sinh nhưng vẫn là cách chính để hạ amoniac/nitrit trong bể mới, nên không nên làm người đọc nghĩ thay nước vô ích.
- ours, stocking-06 tank: "thay nước sẽ không xử lý được nếu bể chưa đủ vi sinh": nói hơi quá, vì thay nước vẫn giúp giảm amoniac và nitrit trong lúc bể chờ ổn định vi sinh.
- plain, stocking-06 tank: "Thường khi thấy vậy thì còn khoảng 1–2 ngày": đốm thai sẫm có thể xuất hiện nhiều ngày đến vài tuần trước khi đẻ, nên mốc này không đáng tin và không có cơ sở.
- plain, stocking-06 tank: "Thường khi thấy vậy thì còn khoảng 1–2 ngày": con số quá chắc chắn, đốm thai sẫm màu không dự báo được ngày đẻ chính xác như vậy.
- plain, stocking-06 tank: "nhiệt độ khoảng 24–27°C": nêu khoảng nhiệt mà không tính đến nhiệt độ bể ở Việt Nam, nơi nước thường cao hơn, nên khó áp dụng.
- ours, stocking-07 post: "chạch sóc đuôi đỏ" là loài nước mát 15-21°C: tên lấy từ handbook, không chắc là con hobbyist hỏi, nên kết luận "khó nuôi chung" dễ gây hiểu sai
- ours, stocking-07 post: "Chạch sóc đuôi đỏ": tên gọi lạ, không phổ biến trong giới chơi cá Việt Nam, dễ làm người đọc rối.
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": ở Việt Nam Corydoras thường gọi là cá chuột, nên đây là gán loài sai, và phần nền cát, râu có thể không liên quan
- plain, stocking-07 post: "cá ember, cá sóc khác": ember tetra không phải một loại sóc, ví dụ này gây nhầm
- plain, stocking-07 post: "Sóc đỏ (cá Corydoras)": ở Việt Nam Corydoras thường gọi là cá chuột, không phải sóc đỏ; số lượng và lời khuyên về nền cát có thể áp sai loài dù cuối bài có hỏi lại.
- plain, stocking-07 post: "Cá ember" được nêu như một khả năng của "sóc đỏ": đây là phỏng đoán không có căn cứ rõ ràng.
- ours, stocking-07 tank: "đủ cho đàn 6 con mỗi loài, nhưng đàn 6 chạch đã chiếm khoảng 79%": the message is muddled, and it never says how many neon can go in, which was the actual question.
- ours, stocking-07 tank: "chạch sóc chịu tốt ở 15–21°C": a cool-water range offered with no warning that Vietnamese tank water usually runs well above it without a chiller; the '79%' load figure also has no stated basis.
- ours, stocking-07 tank: "chạch sóc chịu tốt ở 15–21°C": nếu đây là cá đuôi đỏ kiểu red-tail shark thì đó là cá nhiệt đới, ưa khoảng 22–27°C; con số này sai và dẫn đến kết luận sai là hai loài gần như không hợp nhiệt.
- ours, stocking-07 tank: "đủ cho đàn 6 con mỗi loài": loài đuôi đỏ dạng này giữ lãnh thổ, thường nuôi một con; thả 6 con trong bể 84 lít dễ gây đánh nhau.
- ours, stocking-07 tank: "79% sức chứa": con số chính xác nhưng không nêu cơ sở, và không trả lời được nên thả bao nhiêu neon.
- plain, stocking-07 tank: "Cá sóc (Corydoras)": Vietnamese hobbyists call Corydoras 'cá chuột', so this misreads the name and bases its stocking suggestion on the wrong fish.
- plain, stocking-07 tank: "khoảng 10 con cho mỗi 20 lít": a rough rule that overstocks larger tanks if scaled up, and it is given with no reasoning.
- plain, stocking-07 tank: "Gợi ý cho một bể khoảng 60 lít": treats the tank as 60 litres, while 60×35×40 cm is about 84 litres gross.
- plain, stocking-07 tank: "Cá sóc (Corydoras)": ở Việt Nam Corydoras thường gọi là cá chuột, không phải cá sóc, nên phần tư vấn có thể nói sai loài.
- plain, stocking-07 tank: "nên thả thưa hơn nếu bể có nhiều cây thủy sinh và lọc tốt": ngược logic, vì lọc tốt và nhiều cây thường cho phép thả dày hơn chứ không phải thưa hơn.
- ours, stocking-08 post: "nếu có chỉ số thì thay 20-30% nước": chỉ thay khi test có chỉ số là chưa đủ, vì bể 4 lít quá tải cần thay nước định kỳ, và 20-30% có thể quá ít khi đã có amoniac hoặc nitrit.
- plain, stocking-08 post: "3-4 con nếu là loài nhỏ (neon, endler, ember...)": 4 lít vẫn quá chật cho cá đàn như neon hay ember, nên con số và ví dụ này quá thoáng.
- plain, stocking-08 post: "3-4 con nếu là loài nhỏ (neon, endler, ember...)": 4 lít vẫn quá chật cho cá đàn như neon hoặc ember, nên gợi ý này hơi thoáng.
- plain, stocking-08 post: "máy sưởi mini có điều nhiệt": thường không cần ở phần lớn Việt Nam và rủi ro trong 4 lít, trừ khi miền Bắc vào mùa lạnh.
- ours, stocking-08 tank: "chuyển bớt vài con sang bể lớn hơn, khoảng 115-210 lít": con số này quá lớn và không có lý do, vì chỉ cần một bể khoảng 20-40 lít là đã giải quyết được cho cá nhỏ.
- ours, stocking-08 tank: "kiểm tra lại chỉ số nước mỗi 2-3 tuần": quá thưa với bể 4 lít mới chạy 1 tuần và đang quá tải, giai đoạn này nên đo vài ngày một lần.
- ours, stocking-08 tank: "chuyển bớt vài con sang bể lớn hơn, khoảng 115-210 lít": con số vô lý với người đang nuôi bể 4 lít; bể 20-40 lít đã đủ.
- ours, stocking-08 tank: "Kiểm tra lại chỉ số nước mỗi 2-3 tuần": quá thưa với bể 4 lít mới chạy 1 tuần, quá tải và chưa qua chu kỳ nitơ; cần đo vài ngày một lần.
- ours, stocking-08 tank: "Chỉ thả thêm cá khi nước vẫn tốt": lạc lõng vì bể đã quá tải, gợi ý sai rằng còn có thể thả thêm.
- plain, stocking-08 tank: "Cá đàn (neon, tetra, cá bảy màu)": cá bảy màu không phải cá đàn thực thụ.
- plain, stocking-08 tank: "1 lít nước cho 1 cm cá" kèm kết luận chỉ xét ví dụ bể 40-60 lít: không áp dụng vào bể 4 lít của người hỏi, dễ gây hiểu sai rằng 7-8 con có thể ổn.
- plain, stocking-08 tank: "cá đàn (neon, tetra, cá bảy màu)": cá bảy màu không phải cá đàn đúng nghĩa như neon/tetra.
- plain, stocking-08 tank: "1 lít nước cho 1 cm cá" dùng làm chuẩn mà không nói điều kiện; quy tắc này quá lỏng với bể nhỏ.
- ours, stocking-09 post: "bể 80 x 35 x 45 cm chưa đủ cho chúng": bể khoảng 126 lít, cao 45 cm vẫn nuôi ổn một cặp ông tiên, nên kết luận này quá cứng.
- ours, stocking-09 post: "nên nuôi theo đàn từ 6 con": ông tiên trưởng thành ghép cặp và giữ lãnh thổ. Nuôi 2 con vẫn được, còn 6 con trưởng thành trong bể 100 cm dễ chật và đánh nhau.
- ours, stocking-09 post: "Chọn cá bạn cùng bể có kích thước lớn": quá chung chung và không nêu loài nào, trong khi cá lớn hoặc hung dữ lại không hợp với ông tiên.
- ours, stocking-09 post: "bể 80 x 35 x 45 cm chưa đủ cho chúng": quá cứng, bể khoảng 126 lít vẫn nuôi được một cặp ông tiên.
- ours, stocking-09 post: "nên nuôi theo đàn từ 6 con": không cần thiết với người nuôi cặp; 6 con trong bể 100 cm dễ chật và đánh nhau khi ghép đôi.
- ours, stocking-09 post: "Mức đầy bể: 84%": con số trông chính xác nhưng không có cơ sở rõ ràng, và cũng không ăn khớp với kết luận bể chưa đủ.
- plain, stocking-09 post: "Có thể nuôi chung được": kết luận quá lạc quan, vì ông tiên trưởng thành vẫn dễ ăn neon dù đã có cây và cho ăn đủ.
- plain, stocking-09 post: "cần thả neon đã đủ lớn": neon trưởng thành chỉ khoảng 3–4 cm, vẫn lọt miệng ông tiên lớn, nên cách này giảm rủi ro rất ít.
- plain, stocking-09 post: "bổ sung thêm neon để chia đều sự chú ý": thêm neon không giải quyết được việc rượt đuổi hay săn mồi của ông tiên.
- plain, stocking-09 post: "bổ sung thêm neon để chia đều sự chú ý": thêm neon không giải quyết được việc ông tiên rượt hoặc ăn neon, chỉ thêm mồi cho cá.
- plain, stocking-09 post: "Có thể nuôi chung được": kết luận hơi lạc quan so với rủi ro neon bị ăn khi ông tiên lớn, dù phần lưu ý có nhắc đến.
- plain, stocking-09 post: "trạch, mơ, cỏ nến": tên cây không rõ ràng, không phải cách gọi quen thuộc để người nuôi đi mua đúng cây.
- ours, stocking-09 tank: "Bể 80 x 35 x 45 cm của bạn cũng chưa đủ": a tank of about 126 L gross, 45 cm tall, can house a pair of angelfish, so this is too strict.
- ours, stocking-09 tank: "nên nuôi theo đàn từ 6 con, không phải 2 con": six adult angelfish need a much larger tank, and keeping two is common, so this rule misleads for this tank.
- ours, stocking-09 tank: "Không nên nuôi chung": the predation risk is real, but this flat ban ignores a widely kept combination that can be managed by adding the neons while the angels are young, feeding well and planting densely.
- ours, stocking-09 tank: "Bể 80 x 35 x 45 cm của bạn cũng chưa đủ": this roughly 126-litre, 45 cm tall tank is workable for 2 angelfish, so the verdict is too harsh.
- ours, stocking-09 tank: "nên nuôi theo đàn từ 6 con, không phải 2 con": a pair is a common, workable setup, and 6 adults would suit this tank far worse, so the advice contradicts its own size complaint.
- ours, stocking-09 tank: "Không nên nuôi chung": states a flat no to a widely kept combo, when the real risk can be reduced by stocking neons before the angels grow, feeding well and planting densely.
- plain, stocking-09 tank: "Nên giữ khoảng 25–26°C": hard to hold in Vietnam's heat without cooling, and the answer doesn't address this.
- plain, stocking-09 tank: "Nếu bể nhỏ hơn 80 lít thì nên cân nhắc lại": inconsistent with its own stated 100-litre minimum.
- ours, stocking-10 post: "thường phải nuôi riêng hoặc bể chỉ một loài": too absolute; one betta with neons in a planted 60 cm tank (about 65 L) often works.
- ours, stocking-10 post: "nuôi riêng một con trong bể này... rồi giữ đàn neon ở bể khác": impractical, since it means moving the existing school out to give a 65 L tank to one betta.
- ours, stocking-10 post: "theo dõi đàn neon sau khi thả": contradicts its own advice not to stock the betta.
- ours, stocking-10 post: "thường phải nuôi riêng hoặc bể chỉ một loài": overly absolute, since one betta often lives with neons in a planted 65-litre tank, with monitoring.
- ours, stocking-10 post: "ăn nhầm": overstated for adult neons, which are usually too large for a betta to eat easily.
- ours, stocking-10 post: "theo dõi đàn neon sau khi thả": contradicts its own advice not to keep them together.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon": ignores that the neons are already in the tank, and adding the betta last is the usual way to limit territorial behaviour.
- plain, stocking-10 post: "trâm bầu": not a recognised aquarium plant for this use, so the suggestion looks invented.
- plain, stocking-10 post: "cá đuôi bảng" is not a recognised hobby name, and "cá đá/tiger barb" is a dubious label.
- plain, stocking-10 post: "thường dùng máy sưởi là hợp lý": a heater is usually unnecessary for much of Vietnam's climate.
- plain, stocking-10 post: Does not warn that neons may nip a long-finned betta's fins, which is a main risk of this pairing.
- plain, stocking-10 post: "Nên thả betta vào trước... rồi mới thả neon": the neons are already in the tank, and betta should go in last to limit territorial behaviour.
- plain, stocking-10 post: "trâm bầu" listed as an aquarium plant: this is a land tree, not a common aquatic plant for hiding cover.
- plain, stocking-10 post: "cá đuôi bảng, cá đá/tiger barb": confusing fish names that are not clear hobby terms in Vietnam.
- plain, stocking-10 post: Does not warn that neons can sometimes nip a betta's long fins, and frames the heater as usual without considering Vietnam's warm climate.
- ours, stocking-10 tank: "thường phải nuôi riêng hoặc bể chỉ một loài" is too absolute: a single betta is often kept with neons in a 60 cm tank with plants, with mixed results, so the risk is overstated.
- ours, stocking-10 tank: "thường phải nuôi riêng hoặc bể chỉ một loài": overstated, since one betta is often kept successfully with small peaceful fish in a planted tank of about 60 cm, with monitoring.
- plain, stocking-10 tank: "đặc biệt nếu bể đang có một con betta đực" and "Con betta hiện tại là đực hay cái?" assume a betta already in the tank, but the tank holds only 12 neons.
- plain, stocking-10 tank: "cá tế bào (cá neon, cá rasbora)" is not a term hobbyists use for these fish.
- plain, stocking-10 tank: "thường từ 80 lít trở lên" for housing a male and female betta together is an unsupported figure that suggests pairing is workable.
- plain, stocking-10 tank: "đặc biệt nếu bể đang có một con betta đực" / "Con betta hiện tại là đực hay cái?": assumes a betta already lives in the tank, but the tank only holds 12 neon tetras.
- plain, stocking-10 tank: "cá tế bào (cá neon, cá rasbora)": wrong term, a garbled rendering of tetra; neon are called cá neon or nhóm tetra, and rasbora is not a tetra.
- plain, stocking-10 tank: "Thường thì không nên" is built mainly on betta-versus-betta fighting, which does not answer the actual case of adding one betta to a neon school.
- plain, algae-12 tank: "thường có lợi... giúp cá và cây đỡ căng thẳng hơn": this overstates the benefit; no real evidence of less stress, and a split brings little to a no-CO₂ tank of slow plants.
- plain, algae-12 tank: "timer thông thường chỉ có một khung": wrong, since common mechanical and digital timers sold in Vietnam allow several on/off periods.
- plain, algae-12 tank: "giúp cá và cây đỡ căng thẳng hơn" is an unsupported benefit claim; a midday break is not known to reduce stress in fish or plants.
- plain, algae-12 tank: "Mô phỏng ánh sáng tự nhiên" overstates the case for splitting; a siesta is not established as natural mimicry or as generally beneficial.
- plain, algae-12 tank: "thường có lợi" answers yes for a tank already at 8 continuous hours of low-demand plants without CO₂, where splitting is unnecessary.
- plain, algae-12 tank: "timer thông thường chỉ có một khung" is wrong; common mechanical and digital timers sold in Vietnam allow several on/off periods.

## Failed

- setup-07 post: ours Request timed out.
- sick-03 post: ours Request timed out.
- sick-09 tank: ours Request timed out.
- algae-12 post: ours Request timed out.

## Each question

### algae-01 · post · plain wins (4 · 7.75)

**Asked:** Bể em mới set được hơn 2 tuần mà đã có chút rêu tóc trên lá bucep và nmc. Em dùng đèn Flat One treo cách mặt nước 20cm, lúc đầu để chế độ giả lập ánh sáng mặt trời, giờ em hạ xuống còn 7 tiếng chạy một mạch không ngắt quãng. Cứ 2 hôm em thay 30% nước một lần, có cho Seachem khử clo, Advance và thuốc khử rêu. Em mới châm thêm 2 lọ phân nước ADA là Brighty K và Green Brighty Mineral vì thấy nmc bị trắng lá, chỉ có ít lá xanh mọc từ dưới lên. Em làm vậy có sai không, rêu tóc này xử lý sao ạ?

**Judge:** Y nhận ra đèn Flat One treo 20cm là quá mạnh, khuyên ngừng thuốc khử rêu và test NO₃/PO₄ trước khi châm phân. Y còn chỉ ra Brighty K chỉ bổ sung kali, không giải quyết được chuyện thiếu đạm. X thì coi đèn là ổn, bỏ qua thuốc khử rêu và bảo chưa biết vì sao nmc trắng lá. / X xác định đúng ánh sáng mạnh là nguyên nhân chính, khuyên ngừng thuốc khử rêu và đo NO₃/PO₄ trước khi châm phân, kèm cách gỡ rêu cụ thể. Y lại cho rằng đèn không phải thủ phạm, bỏ qua thuốc khử rêu, đưa ra quy tắc châm phân không có cơ sở và thừa nhận chưa tìm được thông tin về phân ADA và nmc.

**Ours lacks:** diagnosis, tank-fit, figures. **Plain lacks:** follow-up, too-long.

**Ours** (read 1 pages, stopped at the tools limit):

> Rêu tóc trong bể mới set 2 tuần thường do thiếu CO2 hoặc phân chưa cân bằng, và bể mới chưa có vi sinh ổn định nên giai đoạn này hay gặp. Đèn 7 tiếng một mạch là hợp lý, nên đèn không phải thủ phạm chính. Việc thêm hai loại phân ADA cùng lúc khi cây đang yếu là có thể làm lệch cân bằng, nhưng mình chưa đọc được trang phân ADA nên chưa khẳng định được.
> 1. Tạm dừng thêm Brighty K và Green Brighty Mineral, để bể ổn định vài ngày và làm theo đúng liều trên nhãn khi thêm lại.
> 2. Nếu bể có CO2, treo drop checker và chỉnh cho nó chuyển xanh lá; nếu không có CO2, cần cân nhắc bổ sung vì đây là nguyên…

**Plain** (2410 characters):

> Bể mới 2 tuần mà có rêu tóc là khá phổ biến, và nguyên nhân thường là **ánh sáng quá mạnh, quá dài so với độ ổn định của bể**. Có vài điểm em nên điều chỉnh.
> 
> **1. Ánh sáng (nguyên nhân chính)**
> - Flat One treo 20 cm ở chế độ giả lập nắng là cường độ khá cao. Bể mới chưa ổn định về CO₂ và dinh dưỡng nên rất dễ bị rêu.
> - 7 tiếng liên tục vẫn hơi dài. Em nên:
>   - Hạ cường độ xuống khoảng 50–60% trong vài tháng đầu.
>   - Chạy 6–7 tiếng, hoặc chia 2 đợt (ví dụ 4 tiếng sáng + 2 tiếng chiều) để tránh đỉnh sáng quá lâu.
> - Lá nmc bị trắng có thể là dấu hiệu ánh sáng quá mạnh (bị cháy/bạc lá) kết hợp t…

### algae-01 · tank · plain wins (4 · 5.5)

**Asked:** Bể mới set của tôi đã có rêu tóc bám lên lá cây, xử lý sao?

**Judge:** Cả hai đều không dùng thông tin bể của người hỏi: phân Brighty mới châm, thuốc khử rêu, NMC bị trắng lá. X còn khuyên tăng đèn lên 8–10 tiếng, sai hướng với một bể đang bị rêu tóc. Y khuyên giảm đèn xuống 6–8 tiếng và giảm phân, đúng với vấn đề hơn, có thêm cách nhỏ oxy già tại chỗ, nhưng còn chung chung, khá dài và gọi nhầm cá bút chì là cá rìu. / Neither answer uses the tank's details: the slow-growing bucep and NMC, the newly added ADA fertiliser, the algae remover, or the NMC leaves turning white. X's advice is safer: 6–8h of light, cut back the fertiliser, add fast-growing plants. Y is shorter and gives ordered steps, but it pushes light up to 8–10h split into several periods, which would make the algae worse.

**Ours lacks:** tank-fit, wrong, diagnosis. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể mới set thường lên rêu tóc vì cây chưa ra rễ nên hút ít, dinh dưỡng dư còn lại trong nước, và đèn bật lâu hơn mức cây dùng được. Mình chưa biết bạn có châm CO₂ không, nhưng với bể mới thì nguyên nhân này khá chắc.
> 1. Trong hai tuần đầu, thay 30–50% nước mỗi ba ngày để kéo dinh dưỡng dư xuống.
> 2. Đặt tổng đèn khoảng 8–10 tiếng mỗi ngày, chia thành nhiều đợt, mỗi đợt không quá 4 tiếng.
> 3. Gỡ rêu bằng tay: xoay bàn chải đánh răng trong đám rêu để sợi rêu quấn vào lông bàn chải rồi rút ra.
> 4. Nếu muốn, thả vài con tép Amano để ăn rêu, và bắt chúng ra khi rêu đã hết để tránh chúng ăn cây.
> 5. Ch…

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

### algae-02 · post · plain wins (5 · 7)

**Asked:** Mình có hồ 70x30x40, cây chủ yếu là ráy và rêu. Đang dùng đèn Chihiros A601 plus mà bị rêu chùm đen, dù hồ không nền và hơn tuần nay không châm phân. Mình tính thay đèn, nên chọn đèn nào cho bể này?

**Judge:** Y says it straight: keep the light, run it 6–7 hours and dim it, start fertilising again because stopping doesn't help, and remove the BBA. It also gives a sensible list of lights. It has a couple of small product slips. X follows the guide too literally: it suggests about 3,400 lumens, which is no less light than the current lamp, and it doesn't fit an anubias and moss tank. / X giải thích được vì sao hồ không nền mà vẫn bị rêu chùm đen: ráy và rêu lớn chậm trong khi đèn quá mạnh. X cho bước làm cụ thể (6–7 giờ, giảm còn 40–60%, cọ rêu, châm phân lại, thay nước) và khuyên chỉnh trước rồi mới thay đèn. X có một gợi ý mẫu đèn sai và xếp nhầm rau ngổ vào cây nổi. Y tự cho là bể không có CO₂, chẩn đoán sơ sài, nhưng có thêm mẹo xử lý trực tiếp bằng carbon nước, oxy già và con số lumen có kèm nguồn.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Theo cẩm nang, rêu chùm đen (BBA) phần lớn do CO2 không ổn định hoặc thiếu CO2 ở các góc bể, và bể đã có đèn mạnh mà thiếu CO2 và dinh dưỡng thì rêu dễ bùng lên. Bể của bạn không châm CO2 nên khả năng cao là đèn đang mạnh hơn mức bể cây không CO2 chịu được. Mình chưa đọc hết phần chọn đèn nên chưa chắc về thông số A601 Plus, nên bạn kiểm tra đèn trước khi mua đèn mới.
> 1. Giảm số giờ bật đèn xuống khoảng 8 tiếng mỗi ngày, không quá 10 tiếng.
> 2. Hạ đèn cao hơn hoặc giảm cường độ, rồi theo dõi thêm một hai tuần.
> 3. Xử lý chỗ đang có rêu bằng carbon nước xịt bằng xi lanh, hoặc oxy già 3% quét bằn…

**Plain** (2238 characters):

> Với hồ 70x30x40 (khoảng 84L) trồng ráy và rêu, mình nghĩ **bạn chưa cần thay đèn ngay**. Rêu chùm đen (BBA) thường xuất hiện khi ánh sáng quá mạnh hoặc kéo dài so với khả năng hấp thụ dinh dưỡng và CO₂ của cây, và ráy với rêu vốn là nhóm cây ưa ánh sáng thấp đến vừa.
> 
> **Nguyên nhân có khả năng nhất:**
> - **Cường độ hoặc thời gian chiếu sáng quá mức.** A601 Plus khá mạnh cho hồ 70cm, nhất là khi hồ không có nền và cây ít sinh trưởng.
> - **Cây không tăng trưởng đủ để cạnh tranh.** Ráy chậm lớn nên không hấp thụ hết dinh dưỡng, và rêu chùm đen tận dụng phần dư đó.
> - **Lịch chiếu sáng không ổn định…

### algae-02 · tank · ours wins (8 · 5)

**Asked:** Bể của tôi bị rêu chùm đen dù không châm phân, có phải do đèn không?

**Judge:** Nên đưa câu trả lời X: X trả lời thẳng câu hỏi về đèn, nói rõ đèn A601 plus là mạnh so với một bể không CO2 chỉ trồng ráy và rêu, rồi đưa các bước làm theo thứ tự và hẹn xem lại sau 2 tuần. Y chỉ liệt kê nguyên nhân chung chung, khuyên ổn định CO2 cho một bể không có CO2, và hỏi lại những thông tin đã có sẵn. / Y is better. It uses their tank: the strong A601 plus light on a 70 cm tank, no CO₂, only ráy and moss. It gives steps in order with figures and a 2-week check, and adds a guide excerpt. X gives a generic list of causes and asks for details, such as the light, that the app already holds. X also names the SAE oddly and suggests Amano shrimp, which barely eat this algae.

**Ours lacks:** follow-up. **Plain lacks:** tank-fit, diagnosis, follow-up, plan.

**Ours** (read 2 pages):

> Có khả năng cao là đèn góp phần. Bể của bạn không châm CO2 và chỉ có ráy với rêu, mà đèn Chihiros A601 plus khá mạnh cho bể 70x30x40 cm. Khi đèn mạnh hơn mức cây dùng được, rêu râu đen dễ bùng lên. Trong cẩm nang, bể không châm CO2 bị rêu râu đen thường do nhiều yếu tố cộng lại: đèn mạnh, bể bẩn, cây yếu. Vì vậy bạn nên xem đèn trước, rồi kiểm tra chất thải và dòng chảy.
> 1. Giảm thời gian bật đèn xuống khoảng 6 đến 8 tiếng mỗi ngày, hoặc hạ cường độ đèn, rồi theo dõi 2 đến 3 tuần.
> 2. Hút sạch cặn và lá rụng ở nền, thay khoảng 30 đến 50% nước, rồi vệ sinh lọc.
> 3. Xử lý từng chỗ đang có rêu: qu…

**Plain** (1709 characters):

> Đèn **có thể là một nguyên nhân**, nhưng thường không phải là nguyên nhân duy nhất. Rêu chùm đen (BBA) thường xuất hiện khi có nhiều yếu tố cùng lúc.
> 
> **Các nguyên nhân thường gặp:**
> 
> 1. **Đèn quá mạnh hoặc bật quá lâu:** Cường độ sáng cao hoặc thời gian chiếu trên 8-10 giờ/ngày rất dễ kích rêu phát triển, đặc biệt khi CO2 không ổn định.
> 2. **CO2 thiếu hoặc dao động:** Nếu bể trồng cây có đèn mạnh mà CO2 thấp hoặc không đều, cây phát triển kém và rêu có lợi thế cạnh tranh.
> 3. **Dinh dưỡng vẫn có, dù không châm phân:** Thức ăn thừa, chất thải của cá, và phốt phát/nitrat trong nước máy đều là n…

### algae-03 · post · ours wins (8 · 3)

**Asked:** Mình mới chơi, hồ đầu tiên trồng trân châu ngọc trai, vừa set được 3 ngày. Từ 2 hôm trước nước chuyển xanh, mình nghi là rêu nước xanh. Mình thay 30% nước thì hôm sau nước còn xanh hơn. Hôm nay mình tháo bớt 1 bóng của đèn Odyssea dual, chỉnh timer từ 7 tiếng xuống 4 tiếng và thay bông lọc. Có nên tiếp tục thay nước mỗi ngày không? Đèn như vậy có dư không hay nên tắt luôn vài ngày?

**Judge:** X has the cause right: phytoplankton blooming because the fresh substrate is releasing nutrients. It backs cutting the light, gives clear steps (water changes, a blackout if needed, testing ammonia), and adds the tip about rinsing the filter floss in old tank water. Y mistakes the light for a UV unit, which could make the green water worse, tells them to stop water changes, and doesn't recognize trân châu ngọc trai. / Y gets the cause right: an algae bloom in a new tank, from nutrients released by the fresh soil plus too much light. It confirms that cutting the light was the right move and gives clear steps: water changes, blackout as a last resort, and testing ammonia. X mistakes the light for a UV lamp, advises the wrong way on both the light and the water changes, and asks basic questions back.

**Ours lacks:** –. **Plain lacks:** wrong, tank-fit, local, asks-only.

**Ours** (read 2 pages, stopped at the calls limit):

> Nhiều khả năng đây là tảo phù du nở rộ, rất hay gặp ở hồ mới set vài ngày: nền mới nhả nhiều dinh dưỡng, cây chưa kịp ăn hết, và bật đèn 7 tiếng là dài với một hồ chưa ổn định. Thay nước nhiều không trị tận gốc vì tảo sinh sản nhanh và mọc lại ngay, nên việc bạn giảm đèn còn 4 tiếng và tháo bớt một bóng là đúng hướng.
> 1. Tuần đầu cứ thay khoảng 30% nước mỗi ngày như cẩm nang gợi ý, nhưng đừng châm thêm phân nước.
> 2. Cho cá ăn ít lại, chỉ lượng cá ăn hết trong vài phút, không để thức ăn thừa.
> 3. Giữ đèn 4 tiếng và không để nắng chiếu vào bể. Nếu sau 2 đến 3 ngày vẫn xanh, che tối kín khoảng 3 …

**Plain** (1616 characters):

> Mình khuyên **đừng thay nước mỗi ngày**, và **đừng tắt hẳn đèn**, nhất là nếu đây là đèn UV diệt tảo.
> 
> **Vì sao nước xanh:** Hồ mới set 3 ngày thường chưa có hệ vi sinh ổn định, nên dinh dưỡng (thức ăn thừa, phân, nước máy) dư thừa, cộng với nắng và ánh sáng, làm tảo nổi (nước xanh) bùng lên. Thay 30% mỗi ngày đưa thêm nước máy vào, có thể mang thêm dinh dưỡng và làm hồ không kịp ổn định. Thường thì nước xanh kiểu này tự hết sau 1-3 tuần khi hồ ổn định.
> 
> **Việc nên làm:**
> - **Ngừng thay nước hằng ngày.** Chỉ thay khi thử nước thấy amonia hoặc nitrit tăng, và mỗi lần chỉ khoảng 10-15%.
> - **Thử…

### algae-03 · tank · ours wins (6.5 · 5.5)

**Asked:** Bể mới set vài ngày đã bị nước xanh, nên thay nước hay tắt đèn?

**Judge:** Cả hai đều chọn cắt sáng trước, giải thích vì sao thay nước không hết xanh, nhưng đều không dùng chi tiết 4h/ngày, bông lọc hay trân châu. X nhỉnh hơn nhờ các bước rõ thứ tự, có giới hạn che tối, dấu hiệu nguy hiểm ở cá và mốc kiểm tra lại; Y dứt khoát và có gợi ý cây cạnh tranh, chưa thả cá nhưng dài hơn và thiếu theo dõi. / Y is better ordered, explains why a water change doesn't clear the green (matching what this hobbyist saw), and adds the sunlight check, UV, a capped blackout and warning signs with a recheck time. Neither uses the tank's details: X gives a clear blackout but makes dubious claims, while Y's 6–8h would raise the current 4h light and neither flags the replaced filter floss.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, follow-up, too-long.

**Ours** (read 1 pages):

> Với bể mới chạy vài ngày, nước xanh thường do tảo phù du nở rộ vì bể thừa sáng hoặc thừa dinh dưỡng, và vi sinh lọc chưa ổn định. Vì vậy bạn nên cắt sáng trước, thay nước chỉ khi cần. Thay nước một lần lớn không hết xanh, vì tảo sinh sản rất nhanh và mọc lại ngay.
> 1. Tắt đèn hoặc chỉ bật 6–8 giờ mỗi ngày, và dời bể khỏi chỗ nắng chiếu vào.
> 2. Ngừng châm phân và cho cá ăn ít lại, chỉ cho ăn lượng cá ăn hết trong vài phút.
> 3. Kiểm tra amoniac và nitrit. Nếu amoniac tăng thì thay khoảng 20–30% nước, không cần thay hết.
> 4. Làm trong nước bằng cách che tối tối đa 7 ngày hoặc dùng đèn UV, và vẫn để…

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

### algae-04 · post · plain wins (5.75 · 7)

**Asked:** Mình chơi hồ 60x40x40 theo kiểu Hà Lan, dùng 2 cây đèn trắng Aquablue, 1 cây dài 60cm và 1 cây 45cm, vậy có bị dư sáng không? Hồ mới set được 7 ngày mà tảo nâu phát triển nhiều quá, CO2 và dinh dưỡng thì tương đối ổn định, mỗi ngày thay 30% nước kèm vệ sinh hồ, vậy mà rêu nâu cứ bám hoài trên đá và mặt kính. Hồ mình đang bị gì, nên làm sao?

**Judge:** Y answers the light question directly, challenges the daily 30% water change with a concrete new schedule, and safely sequences algae eaters (Nerite now, otto later), though it overplays silicate and is longer. X is tight and honest about the unknown light, but leaves the main question open, is vague on water changes, and suggests otto in a 7-day tank. / X answers the lighting question directly using the tank's 96L and two lights, gives a clear plan and safely delays otto and Amano, though it overstates tap-water silicate and suggests overkill RO or resin. Y is concise and natural with a useful follow-up, but it dodges the light question despite the stated lamps and suggests otto for a 7-day tank without caution.

**Ours lacks:** tank-fit, figures. **Plain lacks:** too-long, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Gần như chắc chắn đây là tảo cát (tảo silic nâu), loại tảo rất hay bùng trong vài tuần đầu của bể mới. Hồ 7 ngày tuổi, đèn trắng mạnh cộng với dinh dưỡng và CO₂ đã ổn định nên nó nở nhanh. Mình chưa biết cường độ và số giờ đèn của bạn, nên chưa khẳng định được có dư sáng hay không, nhưng với bể mới thì đèn mạnh đúng là làm tảo phát triển nhanh hơn hẳn.
> 1. Giảm số giờ chiếu sáng xuống khoảng 6–7 giờ mỗi ngày, hoặc hạ cường độ đèn, rồi tăng dần khi cây lên ổn định.
> 2. Tạm dừng hoặc giảm phân có đạm và phốt phát, dùng phân nhẹ hoặc không đạm, lân trong giai đoạn này.
> 3. Khi thay nước, hút các mả…

**Plain** (2537 characters):

> # Tảo nâu trong hồ mới là khá phổ biến
> 
> Lớp nâu bám trên đá và kính thường là **tảo silic (diatom)**. Nếu lau bằng tay thì bong ra dễ dàng, đó là dấu hiệu nhận biết. Tảo nâu hay xuất hiện trong 2-8 tuần đầu của hồ mới, vì lúc này hệ vi sinh chưa ổn định, cây chưa hấp thụ hết dinh dưỡng, và nước thường giàu **silicate**.
> 
> ## 1. Có bị dư sáng không?
> 
> Với hồ khoảng 96L và 2 đèn (60cm + 45cm) thì **cường độ ở mức trung bình-khá**, chưa phải là quá dư, nhất là với kiểu Hà Lan vốn cần sáng tương đối. Tuy nhiên, trong giai đoạn mới set, **thời gian bật đèn** mới là yếu tố dễ gây tảo:
> - Nên bật **6-7…

### algae-04 · tank · ours wins (7 · 4.75)

**Asked:** Bể mới set một tuần bị tảo nâu bám kín đá và kính, làm sao?

**Judge:** X gives a correct diagnosis, a short ordered plan that addresses light and fertiliser, a way to speed up maturation and a clear checkpoint, though it lacks light hours and doesn't note the daily water changes. Y is generic: it assumes a fish-feeding cause, misses the known tank details, asks for them back, and wrongly suggests carbon for silicate. / Y chẩn đoán đúng tảo cát do bể mới, đèn và phân mạnh, cho các bước gọn theo thứ tự, có cấy vi sinh và mốc 4–6 tuần để theo dõi, dù thiếu số giờ đèn và không nhắc việc họ đang thay 30% mỗi ngày. X đúng ý chính nhưng chung chung, không dựa vào bể của họ (khuyên giảm thức ăn cho cá, hỏi lại có cây không), và sai về than hoạt tính khử silicat.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 2 pages):

> Lớp nâu bám kín đá và kính ở bể mới một tuần thường là tảo cát (tảo silic nâu). Loại tảo này hay bùng trong vài tuần đầu, khi vi sinh còn đang hình thành và đèn, phân đang mạnh. Cẩm nang cho biết ở bể mới, tảo nâu thường tự hết sau 4 đến 6 tuần khi bể ổn định, nên bạn chưa cần lo quá.
> 1. Chà kính và đá bằng tay, hút các mảng lớn khi thay nước. Lớp này lau là trôi.
> 2. Giảm đèn: bật ngắn lại và yếu hơn. Với bể chỉ có cây xanh, PAR khoảng 40–60 µmol ở mặt nền là đủ để khởi đầu.
> 3. Tạm ngưng phân, hoặc chỉ châm nhẹ loại không chứa đạm và phốt phát. Khi cây lên khỏe mới tăng dần.
> 4. Thay 30–50% nư…

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

### algae-05 · post · ours wins (7.25 · 6)

**Asked:** Em set bể Hà Lan được gần 1 tháng, đèn mới lên 8h/ngày (10h sáng đến 18h), cây phát triển rất tốt, không có rêu hại. Phía trước dưới nền em trồng rau thơm. Nhưng ở mặt kính phía dưới, chỗ giáp nền, có tảo nâu bám kính và một chút tảo nhớt xanh, có phải do đèn trong nhà buổi tối hắt vào bể không? Bucep em buộc giá thể thả vào được 1 tuần cũng có tảo nâu trên lá. Em thay nước đều 2 ngày 1 lần. Em có thả ốc nerita nhưng nó chỉ nằm im không bò, kiểm tra thì vẫn sống. Xử lý tảo nâu với rêu nhớt sao ạ?

**Judge:** X gọn, có bước theo thứ tự, phân biệt được rêu nhớt lam, nêu mốc nitrat và mốc theo dõi 2 tuần, dù thiếu biện pháp mạnh như tắt đèn hay tăng dòng chảy. Y có cách trị nhớt xanh đầy đủ hơn (hút, tắt đèn 2–3 ngày, tăng dòng chảy) và gợi ý tép Amano, nhưng dài, không có thứ tự rõ và đổ lỗi sai cho rau thơm và việc cho ăn. / Y chẩn đoán đúng, có bước theo thứ tự, mốc theo dõi 2 tuần, lưu ý nitrat thấp với rêu nhớt và dùng từ quen thuộc hơn, dù thiếu cách trị rêu nhớt mạnh như tắt đèn vài ngày. X có thêm cách tắt đèn và tăng dòng chảy nhưng dài, rời rạc, đổ lỗi cho rau thơm và cho ăn nhiều mà không có cơ sở.

**Ours lacks:** plan. **Plain lacks:** too-long, wrong, plan, tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Tảo nâu bám kính và trên lá bucep trong bể mới 1 tháng thường là chuyện bình thường, vì tảo cát hay bùng trong vài tuần đầu khi bể chưa ổn định hoặc nước dư silica. Đèn nhà hắt vào buổi tối có thể góp phần, nhưng nhiều khả năng nguyên nhân chính là bể còn non và chỗ kính sát nền ít nước lưu thông. Đám nhớt xanh thì cần ngửi thử: nếu có mùi đầm lầy thì là rêu nhớt lam, loại hay mọc ở nền nén chặt, nitrat thấp và chỗ nước đọng.
> 1. Ngửi thử đám nhớt xanh: mùi đầm lầy là rêu nhớt lam, còn tảo nâu gần như không có mùi.
> 2. Test nitrat, phosphat và nhiệt độ bể để biết nguyên nhân nằm ở đâu; nitrat n…

**Plain** (2581 characters):

> Tảo nâu thường gặp ở bể mới khoảng 1–2 tháng. Thường là **tảo silic (diatom)**, xuất hiện khi bể chưa cân bằng, nguồn sáng và dinh dưỡng đang dư. Tình trạng này thường tự giảm khi bể ổn định. Còn lớp nhớt xanh có thể là **vi khuẩn lam (cyanobacteria)**, dễ xuất hiện ở vùng đáy kính, nơi ít dòng chảy và tích tụ mùn bã hữu cơ.
> 
> **1. Đèn trong nhà hắt vào bể có phải nguyên nhân không?**
> Có thể góp phần, nhưng thường không phải nguyên nhân chính. Ánh sáng yếu từ đèn phòng vào buổi tối ít ảnh hưởng đến tảo. Bạn nên kiểm tra:
> - Ánh nắng hoặc đèn phòng có chiếu trực tiếp vào mặt kính không.
> - Đèn bể…

### algae-05 · tank · ours wins (6.75 · 4.5)

**Asked:** Bể tôi có tảo nâu và tảo nhớt xanh ở chân kính sát nền, xử lý thế nào?

**Judge:** X correctly links the location to a dead spot and young-tank diatoms, then gives a short ordered plan and what to expect over 2–6 weeks, though it misses the still snail and relies on APT products. Y is a long generic algae list with wrong fish names, advice about feeding and stocking that does not suit this tank, and an undosed H₂O₂ step. / Y chỉ đúng cơ chế bể non cộng góc chết ở chân kính, có 5 bước gọn và mốc theo dõi 2–6 tuần, kèm trích dẫn hướng dẫn liên quan, dù chưa dùng dữ liệu bể và bỏ sót chuyện ốc nằm im. X dài và chung chung, gợi ý mua thêm sinh vật với tên gọi sai, H₂O₂ không liều và không nhận ra bể mới 4 tuần đang thay nước dày.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, diagnosis, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình đoán đây là hai thứ hay đi cùng nhau ở góc bể thiếu lưu thông: tảo nâu (tảo cát) thường xuất hiện khi bể còn non và có nhiều dinh dưỡng, còn lớp nhớt xanh sẫm (vi khuẩn lam) hay bám ở chỗ nước lưu thông yếu, có cặn hữu cơ tích tụ. Chân kính sát nền đúng là chỗ dễ thành góc chết như vậy. Mình chưa thấy được bể nên chưa chắc chắn, bạn kiểm tra lại độ tuổi bể và lịch đèn, phân giúp mình.
> 1. Gỡ mảng nhớt xanh bằng tay, hoặc nhỏ thẳng APT Fix lên chỗ đang bám, và chà nhẹ tảo nâu bằng bàn chải mềm.
> 2. Hút cặn nền và phần tảo bong ra khi thay nước, thay một phần nước vừa phải.
> 3. Tăng lưu thông…

**Plain** (2489 characters):

> Tảo nâu và tảo nhớt xanh ở chân kính thường xuất hiện khi bể dư dinh dưỡng, ánh sáng hoặc dòng chảy chưa tốt. Bạn xử lý theo các bước sau:
> 
> ## 1. Xác định loại tảo
> - **Tảo nâu** (diatom): lớp bột nâu dễ lau, thường xuất hiện ở bể mới hoặc khi ánh sáng yếu. Thường tự biến mất khi bể ổn định.
> - **Nhớt xanh** (vi khuẩn lam, cyanobacteria): lớp nhầy, có thể dày, màu xanh hoặc đen, dễ bong thành mảng. Đây là loại khó xử lý hơn và cho thấy bể đang dư chất dinh dưỡng hoặc thiếu oxy/lưu thông nước ở đáy.
> 
> ## 2. Xử lý ngay
> - **Cọ và lau kính** bằng miếng cọ mềm hoặc nam châm lau kính. Với vi khuẩn lam…

### algae-06 · post · plain wins (5.75 · 6.75)

**Asked:** Em đang dùng bể 6-4-4, lọc Sunsun 702B (1000L/h), lọc phụ Sunsun 603. CO2 cho qua sủi đánh thẳng vào đầu in của lọc, có van điện bật tắt theo đèn. Thỉnh thoảng nghe trong lọc chính có tiếng lọc xọc, lúc khác lại thấy đầu out bắn ra bọt khí to cỡ hạt đỗ. Bể đang nhiều rêu tóc, rêu sừng hươu và rêu lông tơ nên em đang cho CO2 dồi dào hơn, tầm 6-7 giọt/giây. Trộn như vậy có ổn không khi CO2 nhiều? Lọc phụ gắn thêm trộn cánh quạt ở out được không hay sẽ yếu dòng? Cá tép có nguy cơ chết vì ngạt CO2 không?

**Judge:** Y answers all three questions directly: 6-7 bubbles/s is high for this tank, the impeller will weaken flow, and shrimp are at risk, and it adds a check valve and inline reactor, though it is long with some shaky figures. X is cleaner and better ordered, with the right diffuser move and drop checker, but it never tells them to cut the risky dose now, gives a weak reason against the impeller and skips two of the three algae types. / X explains the gas entering the pump, warns that the rate is high, and covers reducing CO2, moving the injection point, a reactor, a check valve, the mixer, shrimp rescue steps and all three algae types, despite some length and a rigid drop-rate target. Y is tidier and more honest about its limits, but it gives no immediate CO2 reduction, its mixer reasoning is weak, and it barely addresses staghorn or fuzz algae.

**Ours lacks:** tank-fit, figures, diagnosis, too-thin. **Plain lacks:** too-long, plan, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ rêu tóc đang mọc vì CO2 chưa ổn định, chứ đếm 6-7 giọt/giây không cho biết bể đủ hay thừa. Hướng dẫn rêu tóc cũng nói thiếu CO2 là nguyên nhân hay gặp nhất, và đèn bật lâu làm rêu bùng thêm. Bọt to và tiếng lọc xọc thường do khí đi thẳng vào đầu hút của lọc 1000 L/h, không hẳn do lượng CO2 quá nhiều (phần này mình dựa trên kinh nghiệm chung, chưa có trang nào trong cẩm nang nói riêng).
> 1. Treo drop checker trong bể và chỉnh CO2 cho nó chuyển xanh lá, đó là mức đúng thay cho việc đếm giọt.
> 2. Kiểm tra giờ đèn; nếu đang bật quá 10 tiếng thì cắm hẹn giờ đưa về khoảng 8 tiếng.
> 3. Đặt đầ…

**Plain** (3807 characters):

> # Trả lời ngắn gọn
> 
> **Trộn CO2 vào đầu hút của lọc chính đang gây tiếng xọc và bọt lớn.** Với lượng 6-7 giọt/giây, bể 96-100L dễ bị dư CO2, nhất là khi bạn tăng đột ngột. Nên giảm lượng CO2, dùng đo drop checker để kiểm soát, và chuyển điểm bơm CO2 ra khỏi đầu hút lọc chính.
> 
> ## 1. Tiếng "lọc xọc" và bọt to ở đầu out
> 
> - **Khí bị hút vào bơm:** Bọt CO2 đi vào đầu hút, bơm 702B hút cả khí lẫn nước. Khí làm bơm mất mồi, chạy ồn, lưu lượng giảm, lâu dài có thể mòn cánh bơm và phớt.
> - **Bọt to ở out:** CO2 không kịp hòa tan nên thoát ra theo dòng nước. Bọt to cỡ hạt đỗ nghĩa là lượng khí đang vượt…

### algae-06 · tank · ours wins (6.5 · 4.25)

**Asked:** Bể tôi nhiều rêu tóc, rêu sừng hươu và rêu lông tơ, tăng CO2 có giúp được không?

**Judge:** X có các bước theo thứ tự, chỉ rõ thiếu CO₂ là nguyên nhân khả dĩ, dùng drop checker và hẹn kiểm tra sau 2–3 tuần, dù bỏ lỡ chi tiết CO₂ sủi đầu in và bọt khí đầu out. Y chung chung, sai mục tiêu giảm pH, không dùng dữ liệu bể và còn hỏi lại thông số. / Y trả lời gọn, có bước theo thứ tự, nêu đúng nguyên nhân thiếu CO₂ so với đèn, nói rõ rêu sừng hươu hay ở đầu out và có mốc kiểm tra lại; X dài, có mốc pH sai và hỏi lại thông số. Cả hai đều không dùng chi tiết của bể như sủi CO₂ vào đầu in, tiếng lọc xọc và bọt khí to ở đầu out.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, plan, wrong, too-long.

**Ours** (read 5 pages):

> Có giúp, nhưng phải hiểu đúng: CO2 không tự diệt rêu, mà làm cây khỏe lên để lấn át rêu. Theo kinh nghiệm trong cẩm nang, khoảng 90% trường hợp rêu tóc là do thiếu CO2, nên nhiều khả năng bể bạn đang thiếu CO2 hoặc đèn sáng quá so với lượng CO2 có. Rêu sừng hươu hay tập trung ở chỗ nước ra của lọc, nơi CO2 bị đẩy thoát nhanh hơn.
> 1. Treo drop checker và chỉnh CO2 cho nó chuyển xanh lá mạ.
> 2. Đưa giờ đèn về khoảng 8 tiếng mỗi ngày, không để quá 10 tiếng.
> 3. Gỡ phần rêu tóc bằng bàn chải đánh răng, cắt lá dính rêu, rồi thả tép Amano để ăn phần còn sót.
> 4. Với rêu sừng hươu, xịt carbon nước hoặc…

**Plain** (1978 characters):

> **Có, tăng CO₂ thường giúp**, nhưng thường chỉ là một phần của giải pháp. Rêu tóc, rêu sừng hươu và rêu lông tơ hay xuất hiện khi bể mất cân bằng: ánh sáng quá mạnh hoặc kéo dài, dinh dưỡng (đặc biệt là phosphate và nitrate) dư thừa, còn cây thủy sinh thì thiếu CO₂ nên phát triển chậm. Khi cây được cấp đủ CO₂, chúng lớn nhanh hơn, hấp thụ dinh dưỡng và cạnh tranh ánh sáng tốt hơn rêu.
> 
> **Cách tăng CO₂ hiệu quả**
> - Đo bằng drop checker hoặc theo pH: mục tiêu thường là pH giảm khoảng 0,2–0,3 so với nước không CO₂, hoặc drop checker chuyển xanh vàng nhẹ (khoảng 25–30 ppm).
> - Bật CO₂ cùng lúc với…

### algae-07 · post · plain wins (5 · 6.75)

**Asked:** Em là tân binh theo trường phái Hà Lan, phần cứng gần như đủ cho một bể Hà Lan cơ bản: lọc chuẩn, CO2 dồi dào, nền trộn giàu dưỡng, đèn WRGB, quạt... Vậy mà em thất bại liên tiếp 5 bể, bể nào cũng bị: cây xoắn ngọn, xoắn tít, mất màu, teo ngọn, ngọn trắng toát và dị dạng; rêu hại bùng phát. Đèn bật 9h liên tục, CO2 3-4 giọt/giây, mới setup em thay hơn 100% nước hằng ngày trong 2 tuần (vì nghe nói nền trộn rất giàu dưỡng, mà nền mua nên em không biết công thức). Giờ em muốn chuyển qua nền công nghiệp + cốt nền nhưng lăn tăn về tuổi thọ và dinh dưỡng cho bể Hà Lan vốn rất háu ăn. Em nên làm sao?

**Judge:** Y trả lời đúng điều đang lăn tăn: tuổi thọ nền, cấu trúc cốt nền và lịch bón kèm mục tiêu NO3/PO4/K, thêm kiểm soát CO2/KH và lộ trình theo tuần, dù có vài lỗi phân loại sản phẩm. X có gợi ý canxi/độ cứng rất đáng giá nhưng quá mỏng, thiếu liều, không trả lời tuổi thọ nền và nói sai rằng nền công nghiệp nhả rất ít dưỡng. / X trả lời đúng câu hỏi về tuổi thọ nền và cốt nền, có mục tiêu NO3/PO4/K, KH/CO2 và lộ trình theo tuần, dù bỏ sót Ca/nước mềm và quy lỗi hơi quá cho việc thay nước. Y ngắn gọn và có nêu đúng hướng thiếu canxi/nước mềm, nhưng không trả lời tuổi thọ nền hay cốt nền, thiếu số liệu bón, và khái quát sai về nền công nghiệp.

**Ours lacks:** figures, tank-fit, too-thin. **Plain lacks:** diagnosis, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là bạn đang thay nước quá mạnh, khoảng hơn 100% mỗi ngày trong 2 tuần đầu, nên cây bị rút hết dinh dưỡng hòa tan và vi lượng, chưa kịp hình thành nền dinh dưỡng ổn định. Cộng thêm đèn 9 giờ liên tục và CO2 cao mà phân bón không theo kịp tốc độ lớn của cây, nên cây mới ra ngọn bị xoắn, nhợt màu, thủng lỗ và rêu bùng phát. Đây là suy đoán từ triệu chứng bạn mô tả, bạn nên đo thêm nitrat để chắc hơn.
> 1. Ngưng thay nước quá nhiều. Thay khoảng 20 đến 30% mỗi tuần, đo nitrat trước khi quyết định thay nhiều hơn.
> 2. Giảm đèn còn khoảng 6 đến 8 giờ mỗi ngày, rồi tăng dần nế…

**Plain** (3164 characters):

> Em không nên đổ lỗi cho nền trộn hay bỏ phương pháp Hà Lan. Theo mô tả, nguyên nhân nhiều khả năng nằm ở **thiếu dinh dưỡng do thay nước quá nhiều**, cộng với **CO2 và ánh sáng cao mà không có bón phân tương ứng**.
> 
> ## 1. Chẩn đoán
> 
> - **Thay 100% nước mỗi ngày trong 2 tuần** đã rửa trôi phần lớn dưỡng chất hòa tan và vi lượng (sắt, mangan, kẽm...). Nền trộn giàu dưỡng chỉ bổ sung từ từ, nên sau khi bị rửa trôi, cây đói ngay. Đây là lý do cây non bị xoắn, trắng ngọn, dị dạng.
> - **Ánh sáng 9h + CO2 3-4 giọt/giây + không bón phân đều** là tổ hợp khiến cây tiêu thụ nhanh, trong khi nguồn cung khô…

### algae-07 · tank · ours wins (5.5 · 3.75)

**Asked:** Bể tôi cứ bị rêu hại bùng phát và cây xoắn ngọn, trắng ngọn, phải làm sao?

**Judge:** X ngắn gọn, có thứ tự và trung thực khi nói phần xoắn, trắng ngọn chỉ là suy đoán; kiểm tra CO2 bằng drop checker là bước sát thực tế, dù không dùng dữ liệu bể và thiếu số giờ đèn cụ thể. Y dàn trải, khuyên chung chung, có gợi ý sai như ốc táo và bèo tây, lại hỏi cả bể cá hay ao ngoài trời nên không giúp người đã thất bại 5 bể. / Cả hai đều bỏ qua nền giàu dưỡng, việc thay hơn 100% nước mỗi ngày và 5 lần thất bại. Y gọn hơn, có thứ tự rõ, kiểm CO2 bằng drop checker, có hẹn theo dõi và thành thật về chỗ chỉ suy đoán; X dài, chung chung, có lời khuyên không hợp như ốc táo, bèo tây và còn hỏi cả có phải ao ngoài trời không.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 3 pages, stopped at the calls limit):

> Rêu hại bùng lên thường là do CO2 tụt không ai hay, hoặc dinh dưỡng tích tụ khi bạn bỏ lỡ lần thay nước. Cẩm nang có một bài nói rõ rằng áp suất CO2 có thể giảm dần mà không ai để ý, nên bạn nên kiểm tra CO2 trước khi đổ lỗi cho phân. Phần cây xoắn ngọn và trắng ngọn thì cẩm nang chưa có trang nào nói riêng, nên mình chỉ suy đoán từ kinh nghiệm: có thể do thiếu CO2 hoặc mất cân bằng dinh dưỡng, và lá đang bị rêu bám làm cây yếu đi.
> 1. Đặt ống thử CO2 (drop checker) trong bể và để luôn: xanh lá là CO2 đủ, vàng là thiếu.
> 2. Thay khoảng 30–50% nước mỗi tuần, đừng bỏ lỡ lịch thay nước khi đi xa.
> …

**Plain** (2889 characters):

> Hiện tượng rêu bùng phát kèm cây xoắn ngọn, trắng ngọn thường do **mất cân bằng dinh dưỡng và ánh sáng**, hoặc **thiếu vi lượng (đặc biệt là sắt)**. Bạn có thể xử lý theo các bước sau.
> 
> ## 1. Kiểm tra nước trước
> Nên dùng bộ test (NH₃/NH₄⁺, NO₂⁻, NO₃⁻, PO₄³⁻, pH, KH, GH). Nếu chưa có, ít nhất hãy để ý:
> - **Amoniac hoặc nitrit > 0**: có thể do cá quá tải, cho ăn dư, lọc chưa chín hoặc thiếu vi sinh. Đây là nguyên nhân nguy hiểm nhất, phải thay nước ngay.
> - **Nitrat và photphat cao**: là "thức ăn" của rêu. Nên giữ nitrat dưới khoảng 20–30 mg/L.
> 
> ## 2. Giảm ánh sáng và kiểm soát thời gian chiếu s…

### algae-08 · post · plain wins (6 · 6.5)

**Asked:** Em mới chơi, bể đúc 50cm, lúc đầu nuôi 9 mún + 3 bảy màu + 2 sọc ngựa, giờ là 10 bảy màu, 9 sọc ngựa, 5 mún đỏ với 2 cây ráy. Bể không trải nền, chỉ có vài hòn đá; có lọc thác (có lúc chạy cả ngày, có lúc em không bật) và đèn RGB 9W, ban ngày bật trắng khoảng 10 tiếng, tối chuyển đèn màu đến lúc đi ngủ mới tắt. Cho ăn ngày 2 lần. Được hơn 3 tuần thì tảo nâu bám đầy bể, mún với bảy màu ăn hằng ngày cũng không hết, nước đục đục như phân cá rã ra. Tuần thay 50% nước vẫn đục, thành bể có một lớp mờ mờ như rêu tảo bám. Giờ thì thay nước xong được vài ngày là nước lại chuyển xanh đục, tuần nào cũng phải thay gần như hết nước. Lọc thác không ăn thua, em đang tính mua lọc thùng Sunsun 350K thay vào. Do lọc hay do gì, làm sao để nước luôn trong?

**Judge:** Cả hai đều chẩn đoán đúng là dư cá, dư thức ăn, dư đèn và lọc chạy thất thường; X gọn, có thứ tự nhưng bỏ qua việc thay gần hết nước hằng tuần và ít nói về Sunsun. Y dài và lạc sang bể xi măng, nhưng nhỉnh hơn nhờ chỉnh lại lịch thay nước, hút cặn, cách chọn và vệ sinh lọc thùng, thêm cây và cách đặt ráy. / Both identify overfeeding, too much light, too many fish and the on-off filter. X is more complete, covering siphoning, water-change size, plants, diatoms and how to choose and clean the Sunsun, but it misreads bể đúc as cement and wrongly blames water changes for losing bacteria. Y is cleaner, better ordered and rightly puts fish reduction before a filter upgrade, but it leaves out water-change and siphon guidance and barely addresses brown algae, so it is too thin.

**Ours lacks:** tank-fit, too-thin, plan. **Plain lacks:** too-long, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là bể đang quá tải cá và quá dư thức ăn cùng ánh sáng, chứ chưa chắc do lọc. Với 50cm mà có khoảng 33 con (9 mún, 10 bảy màu, 9 sọc ngựa, 5 mún đỏ) thì cho ăn 2 lần mỗi ngày, thức ăn thừa phân hủy làm amoniac và dinh dưỡng tăng, đèn 10 tiếng trắng cộng thêm đèn màu buổi tối kéo dài thời gian sáng nên tảo nâu và nước xanh bùng lên. Lọc thác bật lúc có lúc không làm vi sinh không ổn định, nên nước sạch không giữ được lâu. Theo hướng dẫn, nước xanh như súp đậu là do thực vật phù du sinh sôi khi dư ánh sáng và dinh dưỡng, hoặc amoniac tăng vọt khi cho ăn quá tay, và th…

**Plain** (2806 characters):

> # Nguyên nhân chính: quá tải cá và thức ăn, cộng thêm ánh sáng quá nhiều
> 
> Lọc thác không đủ vì bể đang chứa nhiều chất thải hơn khả năng phân hủy của hệ vi sinh. Lọc thùng có thể giúp, nhưng nếu chỉ thay lọc mà không sửa các yếu tố dưới đây thì nước vẫn sẽ đục lại.
> 
> **1. Mật độ cá quá cao.** Bể 50cm với khoảng 26 con (10 bảy màu, 9 sọc ngựa, 9 mún, 5 mún đỏ) là khá đông. Mỗi con thải ra amoniac, và bể non chưa đủ vi khuẩn để xử lý hết.
> 
> **2. Cho ăn quá nhiều.** Thức ăn thừa phân hủy và làm nước đục, làm tăng dinh dưỡng cho tảo. Cho ăn 2 lần/ngày là ổn, nhưng mỗi lần chỉ nên cho lượng cá ăn hế…

### algae-08 · tank · ours wins (6.5 · 5.25)

**Asked:** Bể tôi thay nước xong vài ngày lại xanh đục và bám tảo nâu, làm sao giữ nước trong?

**Judge:** X ngắn, có thứ tự, nêu đúng gốc đèn và dư dinh dưỡng, có giới hạn che tối và dấu hiệu thiếu oxy cần theo dõi, nhưng bỏ sót việc thêm cây. Y có ý thêm cây rất đáng giá cho bể chỉ 2 cây ráy, nhưng dài, chung chung, có vài lời khuyên sai và gợi ý thêm cá vào bể đã đông. / Y gọn, có thứ tự, giải thích vì sao nước xanh lại sau khi thay, biết theo dõi cá thiếu oxy và lót bông lọc rất hợp lọc thác, nhưng bỏ sót việc thêm cây. X có nêu thêm cây, ý quan trọng với bể chỉ 2 cây ráy, song dàn trải như danh sách chung, có chi tiết sai và kết bằng câu hỏi lại.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, too-long, plan, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Nước xanh đục và tảo nâu thường cùng đến từ một gốc: thừa ánh sáng hoặc thừa dinh dưỡng, rất hay gặp khi bể còn non hoặc đèn chạy lâu. Thay nước xong vài ngày lại đục thì thường là tảo đã có sẵn trong bể và nhân lại nhanh, nên thay nước một lần chưa đủ. Mình chưa biết bể bạn đặt ở đâu và đèn bật bao lâu, nên hãy kiểm tra hai điểm này trước.
> 1. Rút thời gian bật đèn xuống còn khoảng 6–8 giờ mỗi ngày, và dời bể khỏi chỗ nắng chiếu hoặc nắng hắt qua cửa sổ.
> 2. Cho cá ăn ít lại và bỏ bớt phân nước đang châm, vì tảo ăn chính phần dinh dưỡng thừa đó.
> 3. Nếu nước vẫn xanh, che tối bể tối đa 7 ngày (…

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

### algae-09 · post · plain wins (6 · 8)

**Asked:** Có cách nào trị rêu xanh nước không ạ? Em được cho cái bể đúc khá to nên phải để ngoài ban công. 2-3 tháng đầu chỉ bị bám rêu lên thành bể, phải cọ rêu thay nước nhưng nước vẫn trong. Giờ không hiểu sao cứ thay nước được khoảng 3 tuần là nước xanh lè, cá chết lăn quay. Bể có sục khí với lọc tuần hoàn thường thôi, không làm thủy sinh, đáy trống.

**Judge:** Y explains the 3-week cycle, addresses the concrete tank's pH, and gives practical figures for shading, floating plants, water changes and vacuuming the bare bottom, though it is a bit long. X has the right diagnosis and a tidy, correctly ordered plan with daily monitoring, but it is generic, suggests moving a heavy concrete tank, and gives less to break the recurring cycle. / X gives the cause and a fuller fix suited to this tank: 50-70% shade, floating plants, partial water changes, cement pH checks, stocking and UV, plus emergency steps, though it runs a bit long. Y is tidy and has good daily monitoring, but it ignores the cast tank's cement and stocking, suggests moving a heavy tank, and gives less on prevention.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** too-long, follow-up.

**Ours** (read 1 pages):

> Nhiều khả năng bể đang bị tảo phù du nở rộ vì nắng chiếu vào bể ngoài ban công, kết hợp với việc chất bẩn và dinh dưỡng tích lại khi thay nước cách nhau quá lâu. Mình chưa thể chắc chắn từ mô tả, nhưng cá chết đột ngột thường là do tảo tàn làm oxy tụt xuống ban đêm hoặc amoniac tăng, nên bạn cần xử lý ngay.
> 1. Dời bể vào chỗ có bóng râm, hoặc che bớt nắng bằng lưới hay bạt, vì nắng gắt là thủ phạm hay gặp ở bể ngoài trời.
> 2. Cho cá ăn ít lại và vớt hết thức ăn thừa, không để chất thải tích trong bể.
> 3. Giữ sục khí và lọc chạy liên tục, nhất là ban đêm; sáng sớm nếu cá ngoi lên đớp khí thì phả…

**Plain** (2214 characters):

> Nước xanh lè thường do **tảo đơn bào** bùng phát. Bể ngoài trời, đáy trống, có nhiều cá, cho ăn đều thì rất dễ gặp. Chu kỳ khoảng 3 tuần cho thấy dinh dưỡng (phân cá, thức ăn thừa) tích tụ dần rồi tảo bùng lên.
> 
> **Cá chết đột ngột có thể do:**
> - **Thiếu oxy vào ban đêm**: tảo tạo nhiều oxy ban ngày nhưng tiêu thụ oxy ban đêm. Khi tảo chết hàng loạt, oxy tụt rất nhanh. Cá thường nổi đầu, há miệng vào sáng sớm.
> - **Amoniac/nitrit tăng**: do phân và thức ăn thừa phân hủy, nhất là khi lọc sinh học yếu.
> - **pH dao động mạnh**: ban ngày pH lên cao vì tảo quang hợp, và bể đúc mới thường có pH cao do…

### algae-09 · tank · ours wins (7.25 · 4.25)

**Asked:** Bể tôi cứ khoảng ba tuần sau khi thay nước lại xanh lè và cá chết, trị sao?

**Judge:** X names the likely cause from the real conditions (balcony sun, no plants, accumulating nutrients) and explains the fish deaths through night oxygen loss and algae die-off, with ordered steps, though moving the tank and limiting lamp hours fit poorly. Y is a generic checklist that leads with the wrong cause, overlooks the outdoor sun and ends by asking for more details. / Y names the likely cause, a phytoplankton bloom from balcony sun and nutrients with no plants, explains the fish deaths through night-time oxygen loss and algae die-off, and gives ordered steps with UV and follow-up, though moving a large built tank is impractical. X is a generic checklist that blames the nitrogen cycle, ignores the balcony sun, and adds weak fixes such as RO, otto and nerite.

**Ours lacks:** tank-fit, local. **Plain lacks:** diagnosis, tank-fit, too-long.

**Ours** (read 1 pages):

> Có khả năng cao là tảo phù du nở rộ. Bể đặt ngoài ban công, có nắng chiếu, không có cây và không có CO₂, nên phân cá và thức ăn thừa tích lại thành dinh dưỡng cho tảo, cứ vài tuần lại bùng lên. Cá chết có thể do ban đêm tảo dùng hết oxy, hoặc khi tảo tàn, xác tảo phân hủy làm oxy tụt và amoniac tăng. Mình chưa thể chắc từ những gì bạn kể, nên bạn cần đo thử trước.
> 1. Đo ngay amoniac, nitrit và nitrat. Nếu amoniac hoặc nitrit có số đo, thay khoảng 30% nước bằng nước đã khử clo, cùng nhiệt độ.
> 2. Dời bể khỏi chỗ nắng chiếu, và bật đèn không quá 6–8 giờ mỗi ngày.
> 3. Bật sủi khí liên tục, nhất là…

**Plain** (2324 characters):

> Bể xanh lè (nước xanh do tảo đơn bào hoặc vi khuẩn bùng phát) và cá chết sau mỗi vài tuần thường có nguyên nhân liên quan đến **chu trình nitơ bị phá vỡ** hoặc **nước máy/cách thay nước**. Chu kỳ 3 tuần khá gợi ý: khi bạn thay nước hoặc vệ sinh lọc quá mạnh, vi khuẩn có lợi bị mất, amoniac/nitrit tăng, rồi tảo bùng lên khi hệ vi sinh tái lập.
> 
> ## 1. Xử lý ngay khi đang xanh và cá yếu
> - **Test nước** (amoniac NH3/NH4⁺, nitrit NO2⁻, nitrat NO3⁻, pH, nhiệt độ). Nếu amoniac hoặc nitrit > 0, đây là nguyên nhân chính làm cá chết.
> - **Thay 30–50% nước** bằng nước đã khử clo, nhiệt độ gần bằng nước b…

### algae-10 · post · plain wins (4.75 · 6.75)

**Asked:** Có cách nào cứu bể em không: rêu hại dạng sợi màu nâu nhỏ nhỏ bám trên lá cây, sau đó bụi nền dính đầy vào. Thả nhiều tép thì sạch ngay, nhưng bể em nuôi nhiều thần tiên, thả tép vào thì tép bị ăn hết trước cả rêu.

**Judge:** Y cho mức đèn hợp lý, xử lý cả bụi nền và thức ăn thừa, đồng thời đưa ra các lựa chọn thay tép thực tế như tỳ bà, lau kính, nerite, dù có vài lỗi gọi tên và hơi dài. X gọn nhưng khuyên chỉ bật đèn 2–3 tiếng mỗi ngày trong vài tuần, gây hại cho cây, tự giả định bể mới và chỉ có một phương án thay tép là ốc. / X đưa ra kế hoạch an toàn và đầy đủ hơn: gỡ rêu, hút bụi, giảm đèn về mức hợp lý, kèm nhiều lựa chọn thay tép, dù dài và nhầm vài tên gọi. Y gọn, chẩn đoán tảo silic rõ và chọn ốc Nerita đúng hướng, nhưng mức đèn 2–3 giờ có hại cho cây và giả định bể mới không có căn cứ.

**Ours lacks:** wrong, too-thin, tank-fit. **Plain lacks:** too-long, local, tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán đây là rêu nâu (tảo silic) bám lá rồi bụi nền dính vào, thường gặp khi bể còn non hoặc đèn chạy nhiều giờ. Thần tiên ăn tép nên bạn không thả tép chung được; hãy dọn cơ học và dùng ốc Nerita song song.
> 1. Cắt giờ đèn xuống khoảng 2–3 tiếng mỗi ngày trong vài tuần.
> 2. Gỡ tay các sợi rêu trên lá, vớt bụi nền và lau kính mỗi lần thấy rêu.
> 3. Thay khoảng 30% nước 2 lần mỗi tuần, vì bể mới nên thay nhiều hơn.
> 4. Thả vài con ốc Nerita để ăn tảo nâu; ốc thường ít bị thần tiên động tới, nhưng bạn nên theo dõi.
> 5. Nếu muốn thả tép, tạm tách tép hoặc nuôi riêng, rồi thả khi đèn tắt vì tép hay…

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

### algae-10 · tank · plain wins (4.75 · 6)

**Asked:** Lá cây trong bể tôi bị rêu sợi nâu bám, mà thả tép thì bị cá ăn mất, xử lý sao?

**Judge:** Y moves away from shrimp to Nerites and other grazers, covers both filament and diatom algae, and gives light and water-change figures, though it is long, generic and misses the angelfish. X is tidier and its Nerite step is good, but it narrows the diagnosis to diatoms and tells them to release shrimp again, which is what already failed. / X giải quyết đúng vướng mắc hơn: gỡ rêu, giảm nguyên nhân và thay tép bằng ốc Nerite hoặc cá ăn rêu, dù hơi dài và không nhắc đến thần tiên. Y gọn và có gợi ý ốc Nerita tốt, nhưng mặc định là tảo silic và vẫn khuyên thả tép, điều mà người hỏi vừa nói là thất bại.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 2 pages, stopped at the calls limit):

> Rêu nâu trên lá thường là tảo silic, hay gặp ở bể còn mới hoặc khi nước có nhiều silicate. Lá mỏng và nhiều nên khó chà tay, và rêu phủ kín lá sẽ làm cây nhận ít ánh sáng và dinh dưỡng hơn. Bạn nên kết hợp chà thủ công với sinh vật ăn rêu, trong đó lá cây nên giao cho ốc và tép.
> 1. Khi thay nước, chà kính và đá bằng mút hoặc bàn chải đánh răng, còn lá thì cắt bỏ những lá quá bẩn.
> 2. Thả 2 đến 3 con ốc Nerita, loài này ăn tảo silic tốt và khỏe.
> 3. Thả tép vào khu cây rậm để tép có chỗ trốn, vì tép thường nhát và ban ngày ít ra ăn.
> 4. Thả tép vào lúc tắt đèn, và nhớ tập nước cẩn thận trước khi …

**Plain** (2088 characters):

> Rêu sợi nâu thường xuất hiện khi bể dư dinh dưỡng, đèn sáng hoặc chiếu quá lâu, hoặc nước không ổn định. Bạn nên xử lý cả nguyên nhân lẫn rêu đang có.
> 
> **1. Xử lý rêu đang bám**
> - Dùng tay (đeo găng) hoặc bàn chải mềm lau, gỡ sợi rêu khỏi lá. Với rêu sợi thì gỡ bằng tay hoặc dùng que/đũa cuốn rêu rồi kéo ra.
> - Cắt bỏ những lá đã bị bám nặng, đặc biệt là lá già.
> - Nếu rêu bám quá nhiều, có thể tạm dùng H₂O₂ (oxy già) nhỏ trực tiếp lên chỗ rêu (liều thấp, dùng ống tiêm, tránh dính vào cá và cây mềm), rồi thay nước ngay sau đó. Cách này có thể làm hại cây nhỏ nên thử trước trên một lá.
> 
> **2. Giả…

### algae-11 · post · plain wins (6.25 · 7)

**Asked:** Nhà mình dùng nước máy làm nước bể cá. Trước ở chỗ khác, thả cá vào mấy tháng mới phải thay nước một lần. Giờ chuyển về chỗ mới, để bể không có cá (chỉ 1 con cá dọn bể) thì không sao, nhưng cứ thả cá vào chưa đến một tuần là nước chuyển sang màu xanh lá cây, xanh đậm dần rồi cá chết. Bể không, không có cây cỏ gì cả. Trước có bỏ mấy gói tăng oxy gì đó, giờ không cho cũng vẫn vậy. Bắt bệnh giúp mình với.

**Judge:** Y explains why the problem appeared after the move (lost filter bacteria, different tap water, night-time oxygen loss) and gives the real fixes: seeding bacteria, aeration and stocking slowly. It is long and has a chloramine detour. X is tighter and cleaner, but it barely addresses the new location and gives no way to build up the filter bacteria. / X better answers the request to diagnose: it explains why the old place was fine and the new one is not, covering lost filter bacteria, nutrients in the new tap water, light and night-time oxygen crashes, though it is long and overplays chloramine. Y is concise, orderly and has clear warning signs, but it treats the tank as simply new, ignores the change of tap water and dismisses the green water.

**Ours lacks:** tank-fit, plan, diagnosis. **Plain lacks:** too-long, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Nhiều khả năng bể mới chưa đủ vi sinh lọc để phân hủy chất thải. Khi bạn thả cá vào, amoniac và nitrit tăng lên và làm cá chết, còn nước xanh là tảo nở nhờ chất dinh dưỡng dư cùng ánh sáng, vì bể không có cây nào để hấp thụ. Gói tăng oxy không xử lý được amoniac nên không cứu được bể. Mình chưa đo được chỉ số nước của bạn, nên đây là suy đoán từ mô tả; bạn thử amoniac và nitrit để xác nhận.
> 1. Ngừng cho ăn và giảm đèn, bật không quá 6–8 giờ mỗi ngày, đặt bể tránh nắng.
> 2. Thử amoniac và nitrit bằng bộ test nhỏ; nếu cao, thay khoảng 30–50% nước bằng nước máy đã khử clo mỗi ngày.
> 3. Trồng vài c…

**Plain** (3129 characters):

> Triệu chứng này khớp nhất với **chu trình nitơ chưa ổn định** kết hợp với **tảo nở hoa (nước xanh)**. Cá chết thường do amoniac/nitrit tăng cao hoặc thiếu oxy khi tảo bùng lên.
> 
> ## Nguyên nhân có thể
> 
> **1. Lọc sinh học chưa hoạt động tốt ở chỗ mới (khả năng cao nhất)**
> - Ở chỗ cũ, bể chạy mấy tháng nên vi khuẩn có lợi trong vật liệu lọc và thành bể đã phát triển đủ.
> - Khi chuyển đi, vi khuẩn có thể bị giảm mạnh (rửa vật liệu lọc bằng nước máy có clo, thời gian gián đoạn, hoặc bể mới setup lại).
> - Khi thả cá, chất thải làm amoniac tăng. Bể chưa đủ vi khuẩn để chuyển hóa nên amoniac và nitrit t…

### algae-11 · tank · plain wins (6 · 6.5)

**Asked:** Bể tôi cứ thả cá vào là chưa tới một tuần nước xanh lè rồi cá chết, vì sao?

**Judge:** X is tidier, with clear steps and warning signs, but it never mentions dechlorinating tap water and only calls for a water change after buying a test. Y is longer and has no what-to-watch, but it covers chlorine, an immediate 30–50% change with treated water, removing dead fish and adding plants, which better addresses the likely causes in this bare tap-water tank. / Both correctly blame an uncycled tank plus algae bloom, and neither explicitly uses the tank's notes. X edges it by covering tap-water chlorine, plants for the bare tank and how to re-cycle, while Y is tighter, more natural and has better warning signs but omits dechlorination.

**Ours lacks:** tank-fit, diagnosis, plan. **Plain lacks:** follow-up, too-long, tank-fit.

**Ours** (read 3 pages, stopped at the calls limit):

> Nhiều khả năng bể mới chưa đủ vi sinh lọc, nên khi thả cá vào, amoniac (và nitrit) tăng nhanh và làm cá chết. Nước xanh thường là tảo phù du nở vì bể mới nhiều dinh dưỡng và được chiếu sáng; bản thân nước xanh không trực tiếp giết cá, nhưng ban đêm tảo lấy oxy của cá. Mình chưa kiểm tra được bể cụ thể của bạn, nên hãy đo thử trước.
> 1. Mua que thử amoniac và nitrit, đo ngay hôm nay và mỗi một đến hai ngày; nếu trên 0,2 ppm thì thay một phần nước ngay.
> 2. Cho cá ăn rất ít, hoặc tạm nhịn ăn một đến hai ngày, vì thức ăn thừa là nguồn amoniac chính.
> 3. Giảm đèn còn khoảng 6–8 giờ mỗi ngày và dời b…

**Plain** (2070 characters):

> Nước xanh lè và cá chết trong vòng một tuần thường có hai nguyên nhân chính, và chúng thường đi cùng nhau:
> 
> **1. Bể chưa chu trình nitơ (chưa "chín bể") – nguyên nhân hay gặp nhất**
> - Cá thải ra **amoniac (NH₃)** qua mang, phân và thức ăn thừa. Amoniac rất độc.
> - Bình thường, vi khuẩn có lợi trong bể sẽ chuyển amoniac → **nitrit (NO₂⁻)** → **nitrat (NO₃⁻)** ít độc hơn. Bể mới chưa có đủ vi khuẩn này nên amoniac và nitrit tích tụ, làm cá bị ngộ độc, mang bị tổn thương và chết.
> - Amoniac và nitrat dư cũng là "thức ăn" cho tảo, nên tảo bùng nổ và làm nước xanh.
> 
> **2. Tảo đơn bào nở hoa (nước xan…

### setup-01 · post · plain wins (5.25 · 8)

**Asked:** Vợ em vừa bắt em đầu tư một bể thủy sinh, em đặt mua trọn bộ: bể dài 1m + chân gỗ + sục + lọc + đèn (2 bóng LED) + sưởi. Em ở Hà Nội, trời đang lạnh. Em mù mờ khoản này nên hỏi: 1) Bên setup bảo bật đèn liên tục 3 ngày đầu rồi khoảng 8h/ngày, nhưng em đọc trên mạng thì tuần đầu chỉ bật 50% công suất rồi tăng dần lên 100%, 8h/ngày để tránh rêu và cho cây thích nghi. Cách nào đúng? 2) Cho cá ăn tần suất thế nào? 3) Sưởi có nên bật 24/24 không? 4) Có nên mua thêm bình CO2 không, vì em thấy phải có cái này cây mới đủ chất? 5) Lọc họ trang bị chỉ qua sợi bông đơn giản, em đọc thấy phải lọc qua sứ, mà lọc ngoài thì không có chỗ đặt vì bể dùng chân gỗ, không có tủ. Lọc như của em có ổn không? 6) Nên thay nước mấy ngày một lần, lúc mới setup và lúc đã ổn định?

**Judge:** Y gives a clear light schedule, safe heater use, real filter options without a cabinet, dechlorination, nitrogen-cycle guidance and when to add fish, so a beginner can act on it despite its weak new-tank water-change advice. X is honest and has a good water-change schedule, but it is thin, leaves the filter question unresolved and misses the cycle and dechlorination. / X trả lời đủ sáu câu với lịch đèn, nhiệt độ và lưu lượng lọc cụ thể, lại đưa cách xử lý lọc khi không có tủ (thêm sứ, HOB, lọc bọt biển), nhắc chu trình nitơ và khử clo; điểm yếu là khuyên hạn chế thay nước lúc mới setup. Y có lịch thay 30% mỗi ngày tuần đầu khá hữu ích, nhưng giờ đèn quá dài, thừa nhận chưa đọc kỹ phần lọc, không giải quyết chuyện không có chỗ đặt lọc, và phần trích về đèn Chihiros không liên quan.

**Ours lacks:** tank-fit, plan, too-thin, follow-up. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình trả lời theo thứ tự bạn hỏi. Phần đèn và thay nước có trong cẩm nang. Phần cho ăn, CO2, sưởi và lọc mình dựa thêm vào kinh nghiệm chung, nên bạn coi đó là cách làm phổ biến chứ không phải quy định của cẩm nang.
> 1) Đèn: cẩm nang ghi thời gian chiếu sáng hợp lý là 8 đến 12 tiếng mỗi ngày, và nên chia thành nhiều mức sáng để mô phỏng bình minh và hoàng hôn. Cẩm nang cũng nói kéo dài giờ đèn không bù được ánh sáng thiếu mà còn dễ sinh rêu. Vì vậy mình không khuyên bật full 3 ngày đầu như bên setup nói. Bạn nên bật khoảng 6 đến 8 tiếng, mức sáng thấp hơn ở đầu, rồi tăng dần trong 1 đến 2 tuần…

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

### setup-01 · tank · plain wins (5.5 · 6)

**Asked:** Bể mới mua của tôi nên bật đèn, sưởi, thay nước thế nào và có cần mua thêm CO2 không?

**Judge:** X is tidy and answers CO2 first, but it opens by choosing equipment they already have, and it says little about cycling time or how to do water changes. Y is generic and padded, yet it gives more usable guidance: 3–6 weeks of cycling, heater wattage and safety, dechlorinating and matching water temperature, and cleaning filter media in tank water; neither addresses the 3-day versus 50% light question or Hanoi's cold. / X is generic and somewhat long, but it answers all four topics with usable details: top up only during cycling, dechlorinate tap water, heater safety and sizing, and clear CO2 conditions. Y gives a concise, decisive CO2 answer in natural Vietnamese, but it spends steps on buying a filter and inline heater that don't suit this tank, and it omits dechlorination and heater safety; neither addresses the 3-days-versus-50% light question.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** tank-fit, too-long, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Bạn chưa cần mua CO2 ngay. Cẩm nang nói bể nhỏ châm nhẹ có thể dùng tự chế hoặc chưa cần, và nên chạy bể vài tuần rồi mới tính có thật sự cần không. CO2 đáng đầu tư khi bể đèn mạnh, nhiều cây và bạn muốn cây lên nhanh. Mình gợi ý làm theo thứ tự này:
> 1. Chọn lọc có công suất ghi trên hộp gấp đôi thể tích bể, rồi chạy nước trước khi thả gì vào.
> 2. Lắp sưởi (inline hoặc nhúng) và đặt nhiệt khoảng 24–26°C tùy loài cá bạn định nuôi (kinh nghiệm chung, không phải số từ cẩm nang).
> 3. Bật đèn bằng ổ cắm hẹn giờ khoảng 6–8 tiếng mỗi ngày, không cần bộ điều khiển đắt tiền. UV thường không cần.
> 4. Chạy…

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

### setup-02 · post · plain wins (4.75 · 6.5)

**Asked:** Mình đang gom đồ để set hồ 60x40x40 chơi rêu taiwan, trân châu ngọc trai, la hán và ráy, bố cục bonsai. Phân nền dùng Gex xanh. Tư vấn giúp mình nên mua đèn và lọc loại nào?

**Judge:** Y actually answers what to buy, with flow, wattage, named products and a Gex tie-in, despite a few brand and CO₂ slips. X is more careful but names no product, gives no concrete flow figure or wattage, and never addresses Gex or CO₂, so the hobbyist still doesn't know what to buy. / X directly answers what to buy, with wattage, flow rate, and named lights and filters, despite errors on Twinstar's price and the HW-304B's size. Y is more careful and honest, but names no products and leaves the flow calculation to the reader, so it barely answers the buying question.

**Ours lacks:** figures, tank-fit, too-thin, local. **Plain lacks:** follow-up, wrong, tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể 60x40x40 khoảng 96 lít. Rêu Đài Loan, trân châu ngọc trai và ráy đều thích ánh sáng vừa phải, nên bạn không cần đèn quá gắt, nhưng đèn phải phủ đều 60 cm để bố cục bonsai không bị tối hai đầu. Trong cẩm nang mình chưa tìm thấy trang nào về la hán, nên mình không đối chiếu được. Nếu đó là cá la hán thì nên bỏ khỏi bể này vì nó hay bới và ăn cây (đây là kinh nghiệm chung, không phải từ cẩm nang).
> 1. Chọn đèn LED trắng trung tính khoảng 6500K, cường độ vừa, dài phủ được cả chiều 60 cm.
> 2. Bật đèn 6 đến 8 tiếng mỗi ngày, nên dùng timer để giờ sáng cố định.
> 3. Chọn lọc theo thể tích 96 lít: nhâ…

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

### setup-02 · tank · plain wins (3.75 · 5.25)

**Asked:** Bể tôi sắp set nên mua đèn và lọc loại nào?

**Judge:** Neither answer reads the tank (96 L, moss and carpet plants, bonsai). Y still gives usable buying criteria (W/L, 6500K, 6–8 hours, turnover, filter types by volume, brands sold in Vietnam), while X has few figures, uses imported litre examples and adds an unasked heater step, though it does rightly favour canister filters and biological media capacity. / Neither uses the 60×40×40 planted bonsai tank, but X gives a size-based filter guide, brands sold in Vietnam, W/L, 6500K, photoperiod and cycling time that the hobbyist can apply. Y offers fewer usable numbers, odd gallon-converted examples, an irrelevant heater step and no light hours, though its point about filter media and canisters is useful.

**Ours lacks:** tank-fit, figures, local. **Plain lacks:** tank-fit, plan.

**Ours** (read 4 pages, stopped at the tools limit):

> Mình chưa biết kích thước bể của bạn nên trả lời theo hướng chung trước. Đèn nên chọn theo ba điều: bạn muốn trồng cây gì, bể dài bao nhiêu, và ngân sách. Lọc nên chọn theo lượng vật liệu sinh học chứa được, không chỉ theo lưu lượng. Bạn cho mình kích thước dài, rộng, cao và loại cá hoặc cây định nuôi, mình sẽ chọn cụ thể hơn.
> 1. Đo chiều dài bể rồi chọn đèn LED cùng cỡ hoặc dài hơn một chút; ví dụ bể 38 lít dùng đèn 51 cm, bể 57 lít dùng đèn 61 cm.
> 2. Nếu trồng cây, chọn đèn LED có hẹn giờ và cường độ chỉnh được, vì mỗi loại cây cần ánh sáng khác nhau.
> 3. Chọn lọc thùng có nhiều vật liệu sin…

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

**Judge:** Y chia cụ thể 3-4 triệu theo từng món, chọn cây và đàn cá nhỏ đúng ý, giải thích chu trình nitơ và có lộ trình theo tuần. X bảo chọn bể dù người hỏi đã có bể, không chia ngân sách, không gợi ý cá hay cây cụ thể và còn đẩy mua sưởi. / X chia ngân sách 3-4 triệu thành từng khoản, gợi ý cụ thể cây, đàn cá nhỏ và lộ trình gây nước theo tuần, chỉ có vài điểm nhỏ cần chỉnh. Y bảo chọn bể dù đã có sẵn, tính lọc tự mâu thuẫn, không chia ngân sách và gần như không nói gì về loại cá nhỏ mà hobbyist thích.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể bỏ lâu thường chỉ cần làm sạch và trang bị lại vài món cơ bản, không phải làm lại từ đầu. Với 3-4 triệu, mình gợi ý làm kiểu low-tech: ít đèn, ít phân, cây dễ sống, rất hợp để thả đàn cá nhỏ.
> 1. Kiểm tra bể xem có rò rỉ, nứt keo hay đục ố không, rồi rửa sạch và bỏ nước cũ.
> 2. Chọn bể 35-55 lít không viền, mua đèn đúng chiều dài bể và bật ánh sáng yếu lúc đầu để rêu ít có cơ hội mọc.
> 3. Mua lọc trong giá rẻ. Cẩm nang cho biết công suất khoảng 10 lần thể tích bể mỗi giờ là đủ; với bể 55 lít thì mẫu 400 lít/giờ đã dư sức.
> 4. Thêm sưởi riêng, ví dụ loại 50 W cố định 25°C cho bể 35-55 lít.
> 5. T…

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

### setup-03 · tank · plain wins (3.75 · 7.25)

**Asked:** Tôi có bể trống và 3-4 triệu, nên mua gì để làm bể thủy sinh nuôi đàn cá nhỏ?

**Judge:** Y trả lời đúng câu hỏi: nên mua gì với 3-4 triệu, có giá từng khoản, cây, cá và cảnh báo chạy chu trình, dù còn vài gợi ý loài chưa hợp người mới. X không chia ngân sách, không nêu loài cá, lại khuyên chọn bể dù họ đã có và để đèn 12 tiếng dễ gây rêu. / X gives a priced shopping list that fits the 3-4 triệu budget, with named plants, schooling fish, a 2-4 week run-in and basic upkeep, despite a few plant and shrimp slips. Y has no prices or fish species, overlooks the existing tank, sidelines plants and recommends a 12-hour photoperiod that invites algae.

**Ours lacks:** tank-fit, figures, too-thin, wrong. **Plain lacks:** plan, tank-fit, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Với 3–4 triệu và bể trống, mình sẽ chọn bể 35–55 lít không viền, set low-tech (lọc trong, sưởi, đèn LED và nền trơ) là dễ đi nhất cho đàn cá nhỏ. Mình chưa biết kích thước bể bạn đã có, nên đây là hướng chung; bạn đo lại chỗ đặt trước khi mua.
> 1. Đo chỗ đặt và kiểm tra kệ chịu được sức nặng; khi có nước, nền và đồ trang trí, bể có thể nặng gần 1,2 kg mỗi lít.
> 2. Mua đèn LED thủy sinh đúng chiều dài bể, kèm bộ hẹn giờ để bật khoảng 12 tiếng mỗi ngày.
> 3. Mua lọc trong cỡ khoảng 400 lít/giờ cho bể 55 lít và một sưởi riêng cỡ 50 W cố định 25°C cho bể 35–55 lít.
> 4. Dùng nền sỏi hoặc cát hạt thô kh…

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

### setup-04 · post · plain wins (4.5 · 7.75)

**Asked:** Mình muốn set hồ 60x36x36 để trên kệ tivi phòng khách chung cư nên cần tinh gọn, không có chỗ cho bình CO2, thùng lọc. Phương án của mình: bố cục đá Tiger + rêu mini fiss và ráy lá nhỏ ở tiền cảnh, rong La Hán + dương xỉ Java ở hậu cảnh, đều là cây cần ít CO2. Mình tính dùng lọc thác. Bố cục vậy có ổn không, nên dùng nền nào và bao nhiêu?

**Judge:** Y tách lựa chọn nền theo việc có trồng rong La Hán hay không, cho lượng nền, thông số đèn và lọc rõ ràng, đồng thời cảnh báo đúng rủi ro lớn nhất là tải khoảng 110 kg trên kệ TV. X ngắn, chỉ cho nền trơ, tự nhận là kinh nghiệm chung và bỏ sót hoàn toàn vấn đề tải trọng. / X answers the layout and substrate questions by plant type, with correct volume and weight, plus light, filter flow, and the important TV-shelf load warning for a tank of about 100 kg. Y is thin, opens by admitting its lookup failed, gives a flawed setup order, and offers no wattage, filter figures, or shelf warning.

**Ours lacks:** tank-fit, too-thin, figures. **Plain lacks:** plan, too-long, local.

**Ours** (read 0 pages, stopped at the tools limit):

> Bố cục đá Tiger với rêu Fissidens, ráy và dương xỉ Java ở tiền cảnh, hậu cảnh là hướng ổn cho bể không CO2, nhưng mình chưa mở được trang của rong La Hán và lọc thác trong lần tra cứu này, nên phần dưới đây là kinh nghiệm chung của mình, không phải số liệu từ cẩm nang. Với 60x36x36 (khoảng 78 lít), mình sẽ chọn nền sỏi mịn hoặc cát khoảng 3–5 cm, vì rêu, ráy và dương xỉ bám đá hoặc gỗ, không cần nền dinh dưỡng dày. Rong La Hán cần ánh sáng và dinh dưỡng hơn nên bạn nên xác nhận đúng tên khoa học trước khi mua.
> 1. Dựng đá Tiger trước, cố định bằng keo hoặc dây cước, rồi gắn Fissidens và ráy lê…

**Plain** (3463 characters):

> **Nhìn chung phương án ổn**, đặc biệt với hồ 60x36x36 (khoảng 78 lít) và yêu cầu gọn nhẹ. Các cây bạn chọn đều chịu được ánh sáng thấp và CO2 thấp, không cần bình CO2 hay thùng lọc.
> 
> ## 1. Bố cục và cây
> 
> - **Đá Tiger**: hợp lý, bền, không làm đổi pH đáng kể. Nên đặt đá lệch một bên, cao dần về hậu cảnh để tạo chiều sâu.
> - **Rêu Fissidens mini và ráy lá nhỏ (Anubias nana) ở tiền cảnh**: ổn. Cả hai đều bám trên đá hoặc gỗ, không cần nền dinh dưỡng. Buộc hoặc keo (loại an toàn cho cá) ráy lên đá, **không vùi thân rễ xuống nền**, nếu không sẽ thối. Fissidens mini hơi khó giữ hơn, cần nước sạch, í…

### setup-04 · tank · ours wins (7.75 · 3)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu, và chọn cây như vậy có ổn không?

**Judge:** X reads the tank, approves the plant list, gives a sand type, a depth and a 15–18 kg figure with its source separated from its own estimate, then ordered steps, though it overlooks rong La Hán's root needs. Y asks for details the app already holds and gives a generic guide using a 60×30 example, leaving the hobbyist to work out their own amount and plant fit. / Y dùng đúng bể và danh sách cây: xác nhận cây hợp với bể không CO₂, nhóm cây bám không phụ thuộc nền, tính ra 15–18 kg cát hợp lý và cho các bước làm cụ thể. X hỏi lại những thông tin app đã có rồi chỉ đưa hướng dẫn chung, ví dụ lại dùng bể 60×30 và không đánh giá được bộ cây của họ.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 2 pages):

> Với bể 60x36x36 cm, không CO₂, đặt trên kệ tivi và lọc thác, mình thấy nhóm cây bạn chọn (rêu mini fissidens, ráy lá nhỏ, rong La Hán, dương xỉ Java) khá ổn vì đều chịu được ánh sáng vừa phải và không cần CO₂. Phần lớn chúng bám lên đá Tiger hoặc gỗ hơn là bám vào nền, nên nền chủ yếu ảnh hưởng đến thẩm mỹ và cách cá sống, không quyết định cây sống hay chết. Theo cẩm nang, nền cát lọc hồ bơi sạch và rẻ hơn cát thủy sinh, có loại đổ gần như dùng ngay, nhưng bạn nên rửa kỹ trước khi đổ. Lượng cát: cẩm nang dùng khoảng 18 kg cho bể của họ (không ghi kích thước), còn theo tính của mình, với lớp n…

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

### setup-05 · post · plain wins (5.5 · 6.75)

**Asked:** Em định set hồ 1m2x50x50 phong cách natural, chủ yếu rêu, ráy với ít cây cắt cắm lá đỏ. Nên chọn nền thế nào, bao nhiêu kg cho phù hợp và kinh tế? Em tính xài nền trộn kết hợp Aquafor thì ổn không? Đèn em xài T5HO, 2 bóng 10k, 1 bóng 6k5, 1 bóng hồng có hợp lý không?

**Judge:** Y answers every part: layered substrate with a capping layer, kg per layer, ways to save money, a conditional verdict on Aquafor, and a tube assessment tied to CO₂ and algae risk. X gives a tidy plan and useful excerpts, but it brushes off the mixed-substrate and economy question and leaks \"handbook\" while failing to judge Aquafor. / X answers every part for this tank: a sloped two-layer substrate with kg per layer, a way to save money by using costly soil only in the red-plant area, and a light setup tied to CO₂ with a warning about algae. Y reads more naturally and is concise with useful excerpts, but it brushes off the mixed-substrate plan, leaks \"handbook chưa có trang nào\", and sizes the substrate for moss and ráy rather than the red plants.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** plan, too-long, local.

**Ours** (read 4 pages, stopped at the tools limit):

> Mình hiểu 1m2 là bể 120 cm, nên kích thước là 120x50x50. Với kiểu natural nhiều rêu và ráy, bạn không cần tự trộn nền: rêu và ráy hút dinh dưỡng rất chậm, nên một lớp phân nền công nghiệp nhả chậm là đủ. Nền trộn tự làm rẻ hơn nhưng cần kinh nghiệm, dễ bung nền, còn với người mới phân nền công nghiệp đơn giản và hợp lý hơn. Aquafor thì handbook chưa có trang nào nên mình không xác nhận được cho bạn; nếu dùng thì nên chọn loại nhả dinh dưỡng chậm và đừng pha thêm bột vi sinh hay bột bổ sung vì không thật sự cần.
> 1. Chọn một loại phân nền công nghiệp nhả chậm, rải đều lớp dày khoảng 5 đến 6 cm …

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

**Judge:** X dùng đúng bể 120×50×50, đưa ra 25–35 kg cho nền dày 5 cm, nhận định 4 bóng T5HO đủ mạnh cho cây đỏ nếu có CO₂ và phân, kèm các bước làm, dù chưa bàn kỹ về nền trộn hay phổ đèn. Y hỏi lại những thông tin app đã có, chỉ cho ví dụ bể 60×30 và không trả lời được bể này cần bao nhiêu kg hay đèn có đủ không. / Y answers for this actual tank: about 300 L, a realistic 25–35 kg for 5 cm of substrate, a verdict that 4 T5HO is strong enough for red plants if CO₂ and fertiliser are added, and ordered steps. X asks for details and gives generic advice with a 60×30 cm example, so it never answers the kg or light question, though Y is thin on the mix and the pink tube.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 2 pages, stopped at the tools limit):

> Với bể 120x50x50 cm (khoảng 300 lít) kiểu natural, bạn nên chọn nền theo cây định trồng, không theo bể đẹp mẫu. Cây đỏ và rêu cần nền và ánh sáng tốt hơn, nên lớp nền nên giàu dưỡng chất và được bón thêm. Về số kg, mình không có con số trong cẩm nang nên chỉ nói theo kinh nghiệm: với nền dày khoảng 5 cm trên diện tích đáy 120x50 cm, bạn cần khoảng 25 đến 35 kg tùy loại nền, nên đối chiếu với độ phủ ghi trên bao. Về đèn, 4 bóng T5HO trên bể cao 50 cm là mức sáng khá mạnh, nên cây đỏ có thể lên màu tốt, nhưng nếu thiếu CO₂ và phân thì dễ bị rêu và lá nhạt.
> 1. Chọn nền giàu dưỡng cho khu trồng c…

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

**Judge:** Y clearly answers both questions, recommending fine sand and 4 bulbs, with reasons tied to the hobbyist's plants and a useful CO₂ condition, despite the sand-capping advice and a depth mix-up. X is hedged and generic, opens with talk about its handbook, gives only a tentative lamp answer, and never brings in CO₂. / X clearly chooses fine sand with a pebble edge and links 4 or 2 tubes to CO₂ and the red stem plant, despite a depth slip and an unnecessary sand-over-soil step. Y gives a hedged lamp answer from general experience, offers generic substrate steps, and shows excerpts from other tank sizes that barely address the choice.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Phần nền mình trả lời được từ cẩm nang, còn chọn máng 2 bóng hay 4 bóng thì cẩm nang chưa có trang so sánh mẫu Odyssea, nên mình không kết luận theo sách được.
> Về mặt tiền: cốt nền và phân nền nằm dưới, nên phần trống phía trước rải một lớp cát vàng mỏng hoặc sỏi mịn là hợp lý. Cẩm nang cũng lót cát vàng dưới đáy và rải sỏi quanh chân đá. Cát hay sỏi trang trí không nuôi cây, nhưng mặt tiền này không trồng gì nên không ảnh hưởng. Chỉ cần lớp cát đủ dày để không lộ phân nền.
> Các bước:
> 1. Đổ cốt nền khoảng 2 cm sát đáy, ép phẳng, rồi lên phân nền như cẩm nang hướng dẫn.
> 2. Làm ướt phân nền trướ…

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

### setup-06 · tank · plain wins (4 · 6)

**Asked:** Bể thủy sinh tôi đang set có nên trải sạn mặt tiền không, và cần đèn mấy bóng?

**Judge:** Y says outright to lay front sand, explains how to keep it separate from the soil, and happens to give 30–40 W for a 60×30×36 tank, plus photoperiod and colour temperature, though it never says 2 or 4 bulbs. X hedges on sand, uses a different tank size as its example, admits it can't answer the bulb count and offers only generic steps. / X trả lời thẳng là nên trải sạn, nêu cách ngăn với nền và độ dốc, lại có đúng ví dụ bể 60×30×36 cm cần 30–40 W kèm giờ bật đèn, dù vẫn chưa chốt 2 hay 4 bóng. Y không kết luận rõ về sạn, chỉ ví dụ bể 54 lít, thừa nhận chưa biết số bóng và bảo người hỏi đi đo bể, nên khó hành động hơn.

**Ours lacks:** tank-fit, diagnosis, asks-only, figures, too-thin. **Plain lacks:** tank-fit, too-long.

**Ours** (read 3 pages, stopped at the calls limit):

> Với bể đang set, mình trả lời theo hai phần đã đọc trong cẩm nang. Về nền mặt tiền: cẩm nang cho rằng nếu bể chủ yếu trồng vài cây ít đòi hỏi, phần còn lại chỉ cần rải loại cát hoặc sỏi rẻ tiền cho tự nhiên. Chỉ khi bạn định trồng thảm cây ở mặt tiền thì mới nên cân nhắc nền giàu dinh dưỡng, và chỉ bổ sung khoáng cho đúng khu vực trồng. Về đèn: người mới nên tính 0,5 đến 1 W cho mỗi lít nước, lấy dài × rộng × cao (cm) chia 1000 để ra số lít. Ví dụ bể 60×30×30 cm là 54 lít, cần khoảng 27 đến 54 W. Cẩm nang khuyên dùng đèn LED, và cách kiểm tra đơn giản là bể sáng bừng hơn đèn trần thì đủ. Mình…

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

**Ours** (read 3 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (4665 characters):

> Ý tưởng tận dụng hõm cửa sổ làm bể bán cạn rất hay, và kích thước của em khá hợp lý. Em nên kiểm tra kỹ một số điểm trước khi làm.
> 
> ## 1. Kết cấu và chịu tải (quan trọng nhất)
> 
> - **Khối lượng:** Nước 90×20×40 cm ≈ **72 lít ≈ 72 kg**. Cộng thêm kính, nền cát, đá, lũa và cây thì tổng khoảng **90–110 kg**. Em cần chắc rằng phần tường và lanh tô phía trên hõm chịu được tải này, đặc biệt nếu hõm là chỗ cũ của khung cửa sổ.
> - **Đáy hõm:** Phải phẳng và chắc, nên trát lại bằng vữa để đáy bể đặt đều. Nếu đáy lệch, kính dễ nứt.
> - **Chống thấm:** Trong hõm nên quét chống thấm trước khi đặt bể. Nếu nước…

### setup-07 · tank · ours wins (6.25 · 2)

**Asked:** Kế hoạch lọc, cây và cá cho bể tôi định làm như vậy có ổn không?

**Judge:** X reviews the real tank and gives usable steps on stocking, fry, window sun and filter cleaning, though it says little about the plants, focuses on heating rather than window heat, and doesn't assess the bống. Y sees none of the tank details, asks for everything again and offers only generic rules. / Y dùng đúng bể của bạn này, đánh giá mật độ, lọc và cây rồi đưa bước làm cụ thể (cá con, nắng qua cửa sổ, rửa lọc), dù xử lý nhiệt độ chưa hợp khí hậu Việt Nam. X không đọc được dữ liệu bể nên chủ yếu hỏi lại và chỉ đưa lời khuyên chung.

**Ours lacks:** tank-fit, figures, local. **Plain lacks:** asks-only, tank-fit, plan.

**Ours** (read 1 pages, stopped at the calls limit):

> 66% · Vừa phải: bể ổn định với lọc và thay nước thường lệ. Với 10 cá bảy màu trong bể 90×20×50 cm (nước khoảng 40 cm), mật độ cá ổn. Điểm cần lo hơn là nhiệt độ và việc cá sinh sản nhanh, còn lọc và cây đều hợp lý.
> 1. Đo nhiệt độ bể; cá bảy màu thích khoảng 21–26°C, nên nếu phòng lạnh thì cần sưởi để giữ mức đó.
> 2. Lên kế hoạch cho cá con: bảy màu sinh sản từ khoảng 2–3 tháng tuổi, nên chuẩn bị chỗ tách cá con hoặc nhận lại cá để đàn không phình quá mức.
> 3. Đặt đèn 90 cm ở mức vừa phải cho cây dễ sống, và tránh để bể hứng nắng trực tiếp qua cửa sổ vì dễ sinh rêu.
> 4. Giữ lọc thác 8W và lọc vi …

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

### setup-08 · post · ours wins (5.75 · 5)

**Asked:** Mình đang có bể dán 60x45x45, kính 5 ly. Bể vậy có mỏng quá không? Tư vấn giúp mình độ dày nền, các phụ kiện cần có và nên nuôi loại cá nào để có bể thủy sinh hợp lý. Kinh phí mình cũng không được nhiều lắm.

**Judge:** X gets the main safety question right by calling 5 ly thin and recommending 8 ly, but it is sparse on substrate, accessories and fish. Y is far more complete and practical on setup, yet its confident assurance that 5 ly is safe could lead to a failed tank, which outweighs its extra detail. / Y gets the headline safety question right: 5 ly is thin, so check the glass, consider 8 ly, and limit rock weight, though it is thin on substrate, accessories, fish and cycling. X is much fuller and more actionable, but it wrongly reassures on the glass, treats the planted setup as optional, and uses wrong fish and plant names.

**Ours lacks:** too-thin, figures, tank-fit, follow-up. **Plain lacks:** wrong, unsafe, tank-fit, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể 60 cm, kính 5 ly là mỏng so với chuẩn của handbook. Handbook ghi bể dưới 50 cm mới dùng tối thiểu 5 ly, còn bể 60–80 cm nên dùng 8 ly, và nếu bố cục nhiều đá thì nên dùng đáy 10 ly. Vì bể thủy sinh chứa cả nền, đá và lũa, kính đáy là tấm chịu lực nhiều nhất.
> Nếu bể đã dán, mình gợi ý thế này:
> 1. Kiểm tra lại độ dày kính đáy và kính hông với bên bán, hoặc nhờ thợ đo trước khi đổ nước.
> 2. Nếu chưa đổ nước, cân nhắc đổi sang bể 60x40x40 cm dày 8 ly, thường rẻ hơn chi phí sửa sau này.
> 3. Nếu đã dùng bể này, đừng đổ quá nhiều đá nặng lên đáy và đặt bể trên kệ hoặc chân chắc chắn, phân bố đề…

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

### setup-08 · tank · tie or split (5.75 · 5.5)

**Asked:** Tôi có sẵn bể, cần mua gì và nuôi cá gì để làm bể thủy sinh tiết kiệm?

**Judge:** X fits the 121-litre tank and gives a cheap light-and-sponge-filter priority, but it omits substrate, plants and cycling, which leaves a beginner unable to complete a planted tank and puts fish at risk. Y is generic, asks for the size and wrongly treats a heater as essential, yet it covers the full shopping list, easy plants, fish, cycling and water changes, so it is narrowly more usable. / Y uses the real tank (121 L, 600 L/h pump, sponge filter) and gives a clear, cheap buying order, but it omits substrate, plants and cycling, and leaks words like \"handbook\" and \"tank-mates\". X covers more ground but asks for a size and sizes everything for a 60 L tank, adds an unneeded heater, and calls demanding plants easy.

**Ours lacks:** plan, too-thin, follow-up, figures. **Plain lacks:** tank-fit, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể 60 x 45 x 45 cm (khoảng 121 lít) bạn đã có sẵn, phần đáng tiền nhất là đèn và lọc, còn tiết kiệm được ở CO2, phụ kiện và số lượng cây. Handbook nói rõ là nếu tiền có hạn thì bớt ở chỗ khác, đừng bớt ở đèn, vì thiếu ánh sáng cây sẽ tàn dần. Mình chưa kiểm tra được bộ cá nào sống chung với nhau, nên bạn chưa có kết luận về tank-mates; khi chọn xong cá, bạn gửi lại mình sẽ kiểm tra.
> 1. Mua một đèn LED khoảng 6000 K có chuẩn chống nước, ưu tiên đèn này trước mọi thứ khác.
> 2. Làm hoặc mua lọc bông góc: bể lớn nên dùng bông dày từ 5 cm, và lọc bông vừa giữ cặn vừa là chỗ cho vi sinh.
> 3. Chọn…

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

### setup-09 · post · plain wins (5 · 7.25)

**Asked:** Em có cái hộc giá sách, định làm bể dài 170x30x35, mặt trước kính siêu trong để vào đó. Layout đơn giản: nền cát và cuội hoặc đá, thêm ít lũa và ráy; cá thì loại size nhỏ dễ nuôi, ít tốn công chăm và ít thay nước. Em định dùng lọc thùng, với size bể này có phù hợp không? Em định dặn bên làm bể chừa lỗ chờ cho lọc ở 2 đầu bể.

**Judge:** Y trả lời trực tiếp chuyện lỗ chờ hai đầu, lưu lượng, tải trọng hộc, cá, ráy và thay nước, tuy lỗ hút đặt quá thấp và bài hơi dài. X đúng và thận trọng nhưng né câu hỏi về lỗ khoan, đẩy cho nhà bán và bỏ qua phần cá lẫn việc ít thay nước. / X trả lời trực tiếp phần lỗ chờ hai đầu, công suất lọc, tải trọng hộc, cá và việc thay nước, dù có vài chi tiết sai như để lọc chạy theo timer và lỗ hút quá sát nền. Y đúng và trung thực về việc chọn lọc theo vật liệu, nhưng đẩy câu hỏi lỗ chờ cho người bán và gần như bỏ qua cá, layout và chuyện ít thay nước.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Lọc thùng hoàn toàn hợp với bể 170x30x35. Bể này khoảng 178 lít theo thể tích hình hộp, còn thực tế ít hơn sau khi trừ nền và đá. Cách chọn lọc trong cẩm nang tập trung vào lượng vật liệu lọc chứa được chứ không phải lưu lượng, nên bạn nên chọn lọc thùng có ngăn chứa đủ mút, sứ hoặc vật liệu sinh học cho cỡ bể này. Cẩm nang có ví dụ một lọc thùng ghi 850 lít, và mình ước tính thận trọng là dùng cho bể tối đa khoảng 400 lít, tức là dư sức cho bể 170 cm. Phần vị trí lỗ khoan ở hai đầu bể thì các trang mình đọc không nói chi tiết, nên bạn hỏi bên làm bể và nhà bán lọc về vị trí và cỡ lỗ cho đúng…

**Plain** (2866 characters):

> Bể 170×30×35 cm, khoảng 178 lít tổng, nên đủ rộng để nuôi cá nhỏ đẹp. **Lọc thùng rất hợp** với kích thước này, thậm chí là lựa chọn tốt nhất trong các loại lọc thường dùng, vì bể dài và sâu nên cần lưu lượng lớn và bể ít tốn chỗ cho lọc.
> 
> **1. Chọn công suất lọc**
> - Với bể cá nhỏ, nên lọc đảo nước khoảng **6–8 lần/giờ** (tổng thể tích bể) cho cá nhỏ, và có nhiều cây thì vẫn tốt.
> - Tức là khoảng **1000–1400 L/h** là hợp lý. Chọn thùng có công suất thực tế (không chỉ ghi trên hộp) khoảng 1000 L/h trở lên, loại có thể chỉnh lưu lượng.
> - Có thể dùng thùng cỡ vừa đến lớn (ví dụ dòng Sunsun, Eheim…

### setup-09 · tank · plain wins (3.25 · 5.75)

**Asked:** Bể tôi định làm dùng lọc thùng có hợp không, và nuôi cá gì cho ít phải chăm?

**Judge:** Y gives a clear yes on the canister for tanks over 80 L, which covers this tank, plus a usable low-care fish list and routine, though it is generic and its weekly water change ignores the wish for fewer changes. X steers away from the canister towards filters that suit this tank poorly, offers only betta in a 40 L tank, and mostly relays filter-cleaning excerpts. / X clearly says a canister suits a tank of this volume, which is right for about 178 L, and gives a usable list of fish, a list of fish to avoid and care tips, though it is generic, ignores the tank's details and prescribes weekly changes despite the wish for few. Y steers away from the canister toward filters unsuited to this tank, offers only a betta in 40 L, and mostly gives filter-cleaning steps.

**Ours lacks:** tank-fit, too-thin, plan, wrong. **Plain lacks:** tank-fit, figures, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Lọc thùng là lựa chọn mạnh và êm, nhưng không phải để ít phải chăm: hộp lọc nằm ngoài bể, muốn vệ sinh bên trong thường phải tháo cả hệ thống, và dễ đổ nước ra ngoài. Nếu bạn cần ít công nhất thì nên cân nhắc lọc treo thành hoặc lọc mút. Lưu ý là mình chưa có thông tin kích thước bể và loài cá bạn định nuôi, nên đây là gợi ý ban đầu.
> 1. Nếu chọn lọc thùng, rửa vật liệu cơ học (bông, mút) khoảng mỗi tháng một lần ở bể nước ngọt.
> 2. Thay than hoạt tính khoảng mỗi tháng, vì than chỉ dùng khoảng 30 ngày.
> 3. Vật liệu sinh học chỉ rửa khi thấy bẩn, bằng chính nước bể, đừng rửa bằng nước máy.
> 4. Khi…

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

### cycling-01 · post · tie or split (6 · 5.75)

**Asked:** Bể em dài 90cm rộng 40, đã mua bình CO2 + trộn cánh quạt, lọc thùng DF1300, đèn Odyssea, nền 10kg loại nhiều chất, trồng trân châu ngọc trai, sao nhỏ và một đống cây cắm lưa thưa. Tuần đầu em lật ra lật vào 3 lần, mất một đống cây vì nhổ ra bị úa, nền mua thiếu thấy mỏng lại hút nước ra cho thêm. Hiện ngày nào em cũng thay 50% nước. Bể đang ổn định được 3 ngày, em định 1 tuần thì thả cá nhỏ như neon, 7 màu. Vậy đã thả được chưa, và nên mua sục oxy loại nào?

**Judge:** Y trả lời trọn cả hai câu hỏi: có mốc 3-4 tuần, số lượng cá, dựa vào DF1300 và gợi ý máy sục cụ thể, dù có lỗi khi thử bể bằng tép/cá và đọc nhầm \"neon, 7 màu\". X an toàn và có bước rõ hơn nhưng chung chung, bỏ qua cá 7 màu, không có mốc thời gian và trả lời sục oxy rất sơ sài. / Cả hai đều đúng là chưa nên thả cá và lọc thùng không bắt buộc cần sục. Y có các bước theo thứ tự, đo hằng ngày và an toàn hơn, dù ít cụ thể về thời gian và máy sục. X có mốc 3-4 tuần và gợi ý máy sục rõ hơn, nhưng lại khuyên thả tép hoặc cá để thử bể và đọc nhầm neon với bảy màu thành một loài.

**Ours lacks:** figures, tank-fit. **Plain lacks:** plan, wrong, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể mới 3 ngày chưa đủ chín, nên bạn chưa nên thả neon. Cá neon hợp bể đã ổn định, còn bể của bạn đang chạy chu trình nitơ, và việc lật nền, nhổ cây cùng thay 50% nước mỗi ngày làm cây và vi sinh chưa kịp bám. Theo hướng dẫn, cây thủy sinh hấp thụ amoniac và nitrat rất tốt, nên bể trồng cây có thể chín nhanh hơn, nhưng bạn cần để cây ổn định trước.
> 1. Ngừng thay 50% nước mỗi ngày, chỉ thay khoảng 20-30% khi thật sự cần.
> 2. Ngừng lật nền và nhổ cây, để cây bén rễ ít nhất vài tuần.
> 3. Đo amoniac và nitrit bằng que thử mỗi ngày, chờ cả hai về 0 ppm và nitrat dưới 40 ppm.
> 4. Khi cây ra chồi lá mới…

**Plain** (1970 characters):

> **Chưa nên thả cá lúc này.** Ba ngày là quá sớm, và có vài lý do:
> 
> - **Bể chưa chu trình nitơ.** Nền dinh dưỡng và vi sinh có lợi cần vài tuần mới hình thành đủ. Trong giai đoạn này amoniac có thể tăng đột ngột, và cá nhỏ như neon rất nhạy với nó.
> - **Thay 50% nước mỗi ngày làm chậm quá trình này.** Nó loại bỏ amoniac và vi khuẩn ngay khi chúng vừa hình thành, nên bể chưa có cơ hội ổn định. Bạn có thể giảm xuống 1-2 lần/tuần, chỉ thay thêm khi đo thấy chỉ số xấu.
> - **Cây đang hồi phục.** Cây mới trồng và vừa bị nhổ lên nhổ xuống cần vài tuần để bám rễ và ra rễ mới. Trân châu ngọc trai rất khó…

### cycling-01 · tank · ours wins (6.5 · 3.75)

**Asked:** Bể thủy sinh mới set được ít ngày, khi nào thì thả neon và bảy màu được?

**Judge:** X đưa lộ trình gọn, đúng: chạy cycle, test NH3/NO2, thả bảy màu trước rồi neon sau, dù chưa dùng dữ kiện bể (nền nhiều dưỡng, thay nước 50% mỗi ngày). Y cũng đúng ý chính nhưng khuyên dùng nước rửa chén làm nguồn amoniac là sai và có hại, lại hỏi về nền và lọc mà app đã có. / Y cho quy trình ngắn, đúng thứ tự, an toàn: chờ cycle, test, thả bảy màu trước rồi neon, và nói rõ con số 3–6 tuần là kinh nghiệm chung. X cũng đúng hướng nhưng khuyên dùng nước rửa chén làm nguồn amoniac là sai và nguy hiểm; cả hai đều chưa nhắc nền nhiều dưỡng và việc thay 50% nước mỗi ngày của bể này.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, wrong, too-long, unsafe.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể mới set vài ngày thì chưa nên thả cá, vì vi khuẩn nitơ chưa đủ để xử lý amoniac do cá thải ra. Cẩm nang nói cá neon chỉ nên thả khi bể đã trưởng thành và thông số nước ổn định. Bảy màu khỏe hơn nhưng cũng nên đợi bể chạy xong chu trình nitơ.
> 1. Chạy chu trình nitơ trước: có thể không cá (cho thêm một ít nguồn amoniac) hoặc cycling bằng cây thủy sinh, theo cẩm nang.
> 2. Cứ vài ngày test amoniac và nitrit bằng bộ test nhỏ.
> 3. Khi amoniac và nitrit đều về 0 và giữ được vài ngày, bể đã sẵn sàng.
> 4. Thả bảy màu trước, vài con một lần, rồi thả neon sau khoảng một tuần nước vẫn ổn định.
> Thường mất…

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

### cycling-02 · post · plain wins (5.75 · 7)

**Asked:** Em mới nhập môn, mua bể đúc 50cm + đèn 3 màu + lọc thác. Hai bố con mua 7 đôi cá: 5 đôi neon xanh đỏ + 2 đôi cá vàng nhỏ xíu. Sau 2 ngày cá lăn ra chết, chỉ còn 3 con cá vàng nhỏ. Vì sao vậy, và nên mua loại cá nào sống dai, sống khỏe cho con chăm?

**Judge:** Cả hai đều chẩn đoán đúng bể chưa chạy chu trình, và X gọn, ít lỗi hơn, nhưng gần như bỏ ngỏ câu hỏi nên mua cá gì cho con, chỉ nêu mỗi bạch vân. Y dài và có vài lỗi nhỏ về tên loài và nhiệt độ, nhưng trả lời đủ hai câu hỏi với danh sách cá, cấu hình cụ thể và lộ trình cho người mới. / X trả lời đủ cả hai câu hỏi: nguyên nhân cá chết và danh sách cá khỏe kèm cấu hình cụ thể, cùng lộ trình làm lại bể, dù hơi dài và có lỗi tên cá kiếm/platy, lời khuyên sưởi chưa hợp Việt Nam. Y gọn và chẩn đoán đúng trọng tâm nhưng gần như bỏ ngỏ câu hỏi nên mua cá gì cho con, chỉ nhắc bạch vân và trích đoạn.

**Ours lacks:** too-thin, tank-fit, plan. **Plain lacks:** too-long, local.

**Ours** (read 4 pages, stopped at the tools limit):

> Nhiều khả năng bể mới chưa chạy chu trình nitơ, nên amoniac và nitrit tăng vọt ngay khi thả 14 con. Cá neon yếu sau khi vận chuyển nên chết trước. Bể 50cm cũng quá nhỏ cho cá vàng. Mình chưa biết chỉ số nước của bạn nên đây là suy đoán mạnh, bạn đo để xác nhận.
> 1. Đo amoniac và nitrit nếu có bộ test. Nếu cao, thay khoảng 30–50% nước bằng nước đã khử clo, cùng nhiệt độ.
> 2. Ngừng cho ăn một đến hai ngày và không thả thêm con nào.
> 3. Cá vàng cần ít nhất 80 lít cho mỗi con, nên chuyển 3 con còn lại sang bể lớn hơn.
> 4. Chạy chu trình nitơ cho bể trước, đến khi amoniac và nitrit đều về 0 mới thả cá…

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

### cycling-02 · tank · ours wins (7 · 5.5)

**Asked:** Tôi vừa mua bể và thả cá, mới 2 ngày cá đã chết gần hết, vì sao?

**Judge:** Both correctly blame the uncycled new tank but ignore the surviving goldfish and thác filter. X gives a short ordered plan with viên C and daily testing, though its water change depends on having a test kit, while Y's immediate water change and vi sinh are useful but buried in a long generic list that ends by asking for details. / Both name the uncycled tank and mention chlorine and shock, but neither uses the neon/goldfish details or the new cast tank. Y gives a short ordered plan, local viên C sủi dechlorination and daily follow-up, while X is a longer generic list that ends by asking for details, though its unconditional water change is a useful first step.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, follow-up, local.

**Ours** (read 3 pages, stopped at the calls limit):

> Cá chết trong 2 ngày đầu thường là do bể mới chưa chạy xong chu trình nitơ, nên amoniac hoặc nitrit tăng vọt và đốt cá. Nước máy chưa khử clo hoặc cá bị sốc nhiệt khi thả cũng có thể góp phần, nên bạn kiểm tra cả hai.
> 1. Test ngay amoniac và nitrit trong bể bằng bộ test; nếu cao, thay khoảng 1/3 nước bằng nước đã khử clo, cùng nhiệt độ với bể.
> 2. Khử clo cho mọi nước máy bằng viên C sủi hoặc thuốc khử clo mua ở tiệm cá trước khi thêm vào bể.
> 3. Không thả thêm cá lúc này; cho ăn ít, vì thức ăn thừa cũng sinh amoniac.
> 4. Giữ sục khí mạnh và nhiệt độ ổn định cho số cá còn lại.
> 5. Lần sau, cycle …

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

### cycling-03 · post · plain wins (5 · 6)

**Asked:** Em mới chơi lần đầu, nghe người bán cá chỉ và hơi hấp tấp nên trong một tuần em set nền full trân châu ngọc trai lùn, trồng cây xếp cảnh. Sau đó em thả 2 ngàn đồng cá trâm, 5 con tép RC, 1 tỳ bà baby, chục con bảy màu. Đổ nước vào được một tuần thì rêu hại tràn lan, loại rêu trắng trắng làm thối rữa trân châu và lan rất nhanh. Bảy màu chết 7 con, cá trâm chết gần nửa đàn, tép trốn biệt vài ngày mới thấy ló mặt. Cây đang chết dần chết mòn, em đã thay nước, vớt bớt rêu, thả tép mồi số lượng lớn mà bất lực. Em đang định bỏ hồ này set lại theo kiểu nền đá đen, tường full rêu, mấy cây lá to dày, nuôi đội vệ sinh tỳ bà bướm, chuột panda, tép RC, cá trâm. Nên làm sao?

**Judge:** Y xử lý cấp cứu mạnh hơn (thay nước thường xuyên, khử độc, nhặt cây thối) và góp ý cụ thể cho kế hoạch set lại, dù hiểu nhầm trân châu là sỏi và hơi dài. X gọn và đúng hướng cycle nhưng mâu thuẫn khi bảo thả thêm tép, ốc, không xử lý thảm cây thối và gần như bỏ qua kế hoạch set lại. / Cả hai đều chẩn đoán đúng hướng là bể chưa cycle nhưng hiểu sai trân châu là nền. X có kế hoạch cấp cứu rõ hơn và góp ý thực chất cho kiểu set lại (cycle, thả dần, cây, đội vệ sinh), còn Y gọn nhưng mỏng, tự mâu thuẫn khi bảo thả thêm tép, ốc và gần như không xét kế hoạch mới.

**Ours lacks:** tank-fit, plan, follow-up, too-thin. **Plain lacks:** too-long, wrong.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là bể chưa kịp chu trình nitơ: bạn set được một tuần đã thả khoảng 20 con cá và tép, nên amoniac và nitrit từ cá, thức ăn thừa và nền trân châu mới nhả dinh dưỡng vượt quá lượng vi khuẩn có lợi trong bể. Đó là lý do cá chết liên tục, rêu trắng bùng lên và cây úa dần. Mình chưa biết đèn bạn chạy bao nhiêu giờ, nên đây là suy đoán có độ chắc vừa phải. Cách làm an toàn nhất là dừng việc thả thêm, kiểm tra nước trước rồi mới làm tiếp:
> 1. Ngừng thả thêm cá, tép, ốc; cho ăn ít, vớt thức ăn thừa và cá chết ngay.
> 2. Mua bộ test amoniac và nitrit, đo mỗi ngày trong vài ngày…

**Plain** (3273 characters):

> Mình hiểu cảm giác bất lực khi cá chết và cây tàn dần. Chuyện này rất phổ biến với người mới, và phần lớn là do **hồ chưa chu trình (chưa cycle)** cộng với **thả quá tải, cho ăn nhiều** trong khi hệ vi sinh chưa đủ để xử lý chất thải. Rêu trắng bùng lên chính là dấu hiệu của chất hữu cơ dư thừa đang phân hủy.
> 
> ## 1. Việc cần làm ngay (vài ngày tới)
> 
> **Kiểm tra nước trước tiên.** Mua bộ test API Liquid (NH3/NH4, NO2, NO3, pH). Nếu NH3 hoặc NO2 khác 0 thì đó gần như chắc chắn là nguyên nhân cá chết.
> 
> **Xử lý tình trạng cấp bách:**
> - **Ngưng cho ăn 2-3 ngày.** Thức ăn thừa là nguồn amoniac chính…

### cycling-03 · tank · plain wins (5.5 · 6.5)

**Asked:** Bể mới set một tuần thì rêu trắng lan và cá chết gần nửa, có nên lật bể làm lại không?

**Judge:** Cả hai đều chẩn đoán đúng bể chưa chín và khuyên không lật bể, nhưng Y hành động rõ hơn với lượng thay nước, khử clo, dọn xác và cặn, cùng điều kiện cụ thể khi nào mới lật. X trung thực hơn về độ chắc chắn nhưng sai thời gian chạy bể và xử lý sơ sài phần lớp trắng; cả hai đều không dùng chi tiết về trân châu thối, tép và số cá chết. / Cả hai đều chẩn đoán đúng bể chưa chín, khuyên không lật bể và không dùng chi tiết về cá, tép, trân châu của bể. X hơn nhờ có bước xử lý lớp trắng, lượng nước thay cụ thể và điều kiện khi nào mới nên lật bể; Y gọn và có tiêu chí bể chín tốt nhưng bỏ ngỏ lớp trắng và không nói thay bao nhiêu nước.

**Ours lacks:** tank-fit, figures, plan. **Plain lacks:** tank-fit, too-long.

**Ours** (read 4 pages, stopped at the calls limit):

> Mình nghĩ nguyên nhân khả năng cao nhất là bể chưa chín chu trình nitơ: lọc sinh học mới có vài tuần nên amoniac hoặc nitrit tăng cao, gây cá chết, còn lớp trắng lan nhanh thường là bùng vi sinh, hay gặp ở bể mới. Mình chưa đo được nồng độ nên mức độ chắc chắn chưa cao, bạn cần que thử để xác nhận. Bạn chưa cần lật bể: cẩm nang nói lọc sinh học thường mất vài tuần đến vài tháng để ổn định, và tháo bể lúc này sẽ mất luôn vi khuẩn đang hình thành.
> 1. Thử amoniac và nitrit ngay hôm nay, và lặp lại mỗi một đến hai ngày.
> 2. Nếu amoniac hoặc nitrit trên 0,2 ppm, thay một phần nước sạch ngay, không …

**Plain** (1555 characters):

> **Thường không cần lật bể.** Bể mới một tuần mà cá chết nhiều thường là do **chu trình nitơ chưa ổn định** (amoniac và nitrit tăng cao), không phải bể hỏng không cứu được. Vi khuẩn có lợi nằm trong lọc, sỏi và trang trí, nếu đổ đi làm lại thì bạn phải chờ chu trình chạy lại từ đầu, thường mất thêm 3-6 tuần.
> 
> **Việc nên làm ngay:**
> 
> 1. **Test nước** (amoniac, nitrit, nitrat, pH). Nếu amoniac hoặc nitrit trên 0 là đang độc, cần xử lý gấp.
> 2. **Thay nước 30-50% mỗi ngày** nếu có amoniac/nitrit, dùng nước đã khử clo, cùng nhiệt độ với bể. Dùng thuốc khử độc amoniac nếu có.
> 3. **Ngừng cho ăn 1-2 n…

### cycling-04 · post · plain wins (6 · 7.5)

**Asked:** Hồ mình 40x30x30, vừa set up được 5 ngày thì có hiện tượng cá chết, mặt hồ có bọt trắng là sao? Hồ như vậy có cần thay nước thường xuyên không, có cần sục sủi không? Mình chỉ để chạy máy lọc nước thôi.

**Judge:** Y trả lời đủ cả ba câu hỏi: nguyên nhân cá chết và bọt, lịch thay nước trong lúc cycle và về sau, có cần sục khí khi đã có lọc không, đồng thời tính 36 lít và nhắc khí hậu nóng. X gọn, xử lý khẩn cấp mạnh hơn với mức thay 50%, nhưng không trả lời rõ chuyện thay nước lâu dài, không nói sủi có bắt buộc không và ít bám vào kích thước hồ. / X directly answers all three questions, including a routine water-change schedule and whether aeration is needed, and it uses the 36 L tank size for stocking and a clear restocking condition, though its emergency water change is rather small. Y has a sound, concise emergency plan with a stronger 50% change, but it never gives a long-term water-change schedule, ignores the tank size, and reads less naturally with 'bể', 'váng' and 'handbook'.

**Ours lacks:** tank-fit, figures, follow-up, too-thin. **Plain lacks:** too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể mới 5 ngày chưa đủ vi khuẩn có ích để phân hủy chất thải, nên amoniac từ cá, thức ăn thừa và xác hữu cơ dễ tích tụ đến mức giết cá. Thiếu oxy cũng có thể góp phần. Váng trắng trên mặt nước thường là chất hữu cơ hoặc cặn từ lúc setup, hay một đợt vi khuẩn đang sinh sôi. Phần này mình nói theo kinh nghiệm chung, chứ handbook mình vừa đọc chưa nói rõ về váng.
> 1. Test amoniac và nitrit ngay bằng bộ test nước; nếu amoniac có số thì thay ít nhất 50% nước.
> 2. Vớt cá chết ra ngay và ngưng cho ăn cho đến khi amoniac về 0.
> 3. Bật sục khí hoặc cho nước chảy mạnh trên mặt để bổ sung oxy; oxy trên 5 mg…

**Plain** (2320 characters):

> ## Nguyên nhân có thể
> 
> Hồ mới 5 ngày thường chưa đủ **chu trình nitơ** (cycling). Hồ mới chưa có vi khuẩn có lợi để phân hủy chất thải của cá:
> 
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻) tích tụ** từ phân cá, thức ăn thừa, xác lá. Đây là nguyên nhân chết cá phổ biến nhất ở hồ mới. Amoniac và nitrit rất độc, còn cá thì yếu dần.
> - **Bọt trắng trên mặt** thường là bọt protein từ chất hữu cơ, hoặc do vi khuẩn bùng phát trong giai đoạn đầu. Bọt có thể do thức ăn thừa, phân, hoặc dư chất tẩy rửa/xà phòng còn sót lại khi vệ sinh hồ và trang trí.
> - Các nguyên nhân khác: nước máy chưa khử clo, nhiệt độ h…

### cycling-04 · tank · tie or split (6.5 · 6.5)

**Asked:** Bể mới set 5 ngày cá chết và mặt nước có bọt trắng, là sao?

**Judge:** Cả hai đều chẩn đoán đúng là bể chưa cycle, nhưng Y nhỉnh hơn nhờ nêu thêm clo và xà phòng, cho thay nước lặp lại, Prime và mốc 3–6 tuần. Y dài và chung chung, hỏi lại cả dung tích bể; X gọn và tự nhiên hơn nhưng bỏ sót clo, đặt ngưỡng 0,2 ppm tùy tiện và không nhận ra bể thiếu sủi. / Both correctly blame an uncycled tank with ammonia or nitrite and give safe water-change steps. X covers more causes (chlorine, soap) and adds aeration and Prime, but it is generic and long, while Y is tighter, more natural in Vietnamese, leads with a clear test-first plan and gives a cycle-finished criterion, so it narrowly wins despite missing chlorine and soap.

**Ours lacks:** diagnosis, tank-fit, figures. **Plain lacks:** too-long, tank-fit, local, follow-up.

**Ours** (read 2 pages):

> Khả năng cao bể chưa chạy xong chu trình nitơ, nên amoniac hoặc nitrit tăng cao trong 5 ngày đầu đã làm cá chết. Bọt trắng trên mặt nước thường là màng chất hữu cơ từ thức ăn thừa, cá chết phân hủy hoặc cặn còn lại sau khi setup. Mình chưa thể chắc đó là nguyên nhân duy nhất, nên bạn cần đo nước để xác định.
> 1. Đo amoniac và nitrit ngay bằng que thử. Nếu trên 0,2 ppm, thay khoảng 30 đến 50% nước bằng nước đã khử clo.
> 2. Vớt hết cá chết và thức ăn thừa ra khỏi bể.
> 3. Ngừng cho ăn và không thả thêm cá cho đến khi bể qua chu trình.
> 4. Giữ sủi khí hoặc bật lọc để nước có oxy và bề mặt được xáo độ…

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

**Judge:** Y gives the fuller fishless plan: nitrifying bacteria, seeding from a mature filter, an ammonia source, soaking the driftwood and protecting the Atman filter media. X correctly warns against Bacillus and gives a real Stability dose, but omits the ammonia source, advises needless water changes and barely uses the tank's details. / Y trả lời trúng hơn ở chỗ phân biệt vi sinh nitrat hóa với Bacillus và có liều Stability cụ thể, nhưng thiếu nguồn amoni, đặt ngưỡng thay nước sai cho bể chưa có cá và gần như bỏ qua lũa, đá, lọc của hồ. X dài hơn nhưng có quy trình chạy chu trình đầy đủ hơn (nguồn amoni, cấy vật liệu lọc, giữ vi sinh trong lọc, test) và bám sát hồ này hơn, nên hữu ích hơn.

**Ours lacks:** tank-fit, plan. **Plain lacks:** figures, too-long.

**Ours** (read 2 pages, stopped at the calls limit):

> Bể mới chưa có vi khuẩn nitrat hóa, nên thứ bạn cần châm là vi sinh nitrat hóa (nhóm Nitrosomonas và Nitrobacter) trong men có nguồn gốc rõ ràng, chứ không phải chai vi sinh phân hủy chất thải kiểu Bacillus. Với bể chưa có cá, hãy châm men rồi chạy chu trình nitơ, và tin kết quả test hơn là đếm ngày.
> 1. Khử clo hoặc cloramin trong nước máy, chờ khoảng 30 phút rồi mới châm men.
> 2. Chạy lọc tuần hoàn và giữ nhiệt độ khoảng 24–26°C trước khi châm.
> 3. Ngày đầu, châm men đúng liều ghi trên nhãn. Ví dụ Seachem Stability là 5 mL cho 40 lít vào ngày 1; hoặc châm theo cách của hãng bạn chọn.
> 4. Test a…

**Plain** (2095 characters):

> Với giai đoạn châm nước và chạy lọc, bạn nên dùng **vi sinh nitrat hóa** (nitrifying bacteria), thường ghi là chứa *Nitrosomonas* và *Nitrobacter*. Nhóm vi khuẩn này chuyển hóa amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻), hai chất rất độc với cá, thành nitrat (NO₃⁻) ít độc hơn. Các dòng phổ biến gồm Seachem Stability, Tetra SafeStart, API Quick Start, Tetra Nitrivec và các dòng vi sinh tươi từ bể đã chạy ổn định.
> 
> **Các bước nên làm:**
> 
> 1. **Khử clo trước khi châm nước.** Clo sẽ diệt vi khuẩn. Dùng nước đã để qua đêm, hoặc dùng chất khử clo, và chỉ thả vi sinh sau khi nước đã xử lý xong.
> 2. **Ngâm lũ…

### cycling-05 · tank · plain wins (5 · 6.75)

**Asked:** Bể mới đổ nước chạy lọc, nên châm vi sinh loại nào để sớm thả cá?

**Judge:** Y cho quy trình đủ hơn: châm vi sinh, nuôi bằng nguồn amoniac, cách đo, thời gian và mẹo lấy mút lọc bể cũ để rút ngắn, dù gợi ý cá chưa chuẩn và hỏi lại kích thước bể. X đúng tinh thần và gần thị trường Việt Nam hơn, nhưng thiếu nguồn amoniac nên mốc NH3/NO2 về 0 dễ khiến hobbyist thả cá quá sớm. / X có đủ quy trình để sớm thả cá: loại vi sinh, nguồn amoniac, mốc test, thời gian và mẹo xin vật liệu lọc đã chạy, dù tên hàng thiên về ngoại và vẫn hỏi lại kích thước bể. Y nói đúng trọng tâm và nêu được hãng quen ở Việt Nam, nhưng bỏ sót nguồn amoniac nên mốc test bằng 0 có thể đánh lừa người đọc, lại không có thời gian cụ thể hay cách rút ngắn.

**Ours lacks:** plan, figures, tank-fit. **Plain lacks:** tank-fit, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Chai vi sinh giúp vi khuẩn có nơi khởi đầu, nhưng không thay được việc cycling. Bể mới đổ nước vẫn cần vài tuần để vi khuẩn nitrat hóa ổn định, nên đừng thả cá chỉ vì đã châm vi sinh.
> 1. Chọn chai có nguồn gốc rõ: tên công ty và đăng ký sản phẩm, thành phần, hướng dẫn cụ thể, đầu mối liên hệ. Handbook nêu Extrabio (Đông Phong) và Koica làm ví dụ, còn nhiều loại khác chưa ai thử hết.
> 2. Châm đúng liều trên nhãn theo lượng nước đang có trong bể, không cần cân quá chính xác.
> 3. Chạy lọc liên tục, và nếu nền cát nhẵn thì bổ sung vật liệu lọc xốp để vi sinh có chỗ bám.
> 4. Đo amoniac và nitrit vài …

**Plain** (1429 characters):

> Với bể mới, bạn nên chọn **vi sinh chứa vi khuẩn nitrat hóa sống** (thường có *Nitrosomonas* và *Nitrobacter*). Các loại phổ biến gồm **Seachem Stability**, **Tetra SafeStart**, **API Quick Start**, **Dr. Tim's** hoặc **Sera Bio Nitrivec**. Tránh loại chỉ có enzyme hoặc chỉ khử clo, vì chúng không giúp hình thành chu trình nitơ.
> 
> **Cách làm:**
> 1. **Châm vi sinh ngay** sau khi đổ nước và chạy lọc, liều theo hướng dẫn trên bao bì. Có thể châm lại sau 1-2 tuần để bù lượng vi khuẩn.
> 2. **Nuôi vi khuẩn bằng nguồn amoniac:** cho ăn một ít thức ăn mỗi ngày, hoặc dùng amoniac nguyên chất (không có ch…

### cycling-06 · post · ours wins (7.25 · 6.75)

**Asked:** Em mới set một bể cubic 20 loại lowtech, mấy hôm nay nước trong bể tự nhiên rất đục, mờ mờ như lớp sương mù. Mọi người bảo do vi sinh bị chết. Làm sao khắc phục và tạo lại vi sinh? Em cũng nuôi cá trong thùng xốp, nước trong đó rất trong dù thỉnh thoảng mới hút cặn và châm thêm nước. Em lấy nước thùng xốp đó châm mồi vi sinh cho bể mới được không?

**Judge:** Cả hai đều chẩn đoán đúng là bùng vi khuẩn và nói đúng rằng vi sinh bám trên vật liệu lọc, nhưng X gọn, có bước theo thứ tự, biết khi nào cần kiểm tra lại và dùng từ quen thuộc, dù mốc đèn 8-12 tiếng còn lỏng. Y đầy đủ hơn (rủi ro mầm bệnh, thêm cây, vi sinh thương mại) nhưng dài và tản, ít rõ việc làm trước sau, lại sai về việc ánh sáng nuôi vi khuẩn. / Both correctly call it a bacterial bloom and say the bacteria live on surfaces, so styrofoam-box water seeds little. Y gives a tighter ordered plan, clear checks and natural local wording with useful guide excerpts, which narrowly outweighs its poor 8-12 hour light figure. X is somewhat more accurate on some details and flags the disease risk, but it is looser and longer.

**Ours lacks:** tank-fit. **Plain lacks:** plan, too-long, local, follow-up.

**Ours** (read 5 pages, stopped at the tools limit):

> Nhiều khả năng đây là bùng vi sinh, tức vi khuẩn bùng lên trong bể mới, chứ không phải vi sinh chết. Nước đục trắng mờ như sương là dấu hiệu hay gặp ở bể vừa set, nhất là khi bể chưa ổn định. Nước trong thùng xốp trong vì không có đợt bùng đó, nhưng vi sinh không trôi trong nước mà bám trên vật liệu lọc, nên châm nước thùng xốp gần như không mồi được vi sinh cho bể mới. Bạn đừng dựa vào cách đó.
> Cách làm:
> 1. Đo ammonia trước; nếu bằng 0 thì để bể tự cân bằng và không đụng vào lọc.
> 2. Ngưng cho ăn khoảng 7 ngày để bớt chất hữu cơ trong nước.
> 3. Đừng thay nước nhiều hay thất thường như 75%; nếu…

**Plain** (2164 characters):

> ## Nước đục có phải do vi sinh chết không?
> 
> Nhiều khả năng **không**. Nước đục mờ như sương ở bể mới thường là **bloom vi khuẩn** (vi khuẩn sinh sôi quá mức khi có nhiều chất hữu cơ từ thức ăn, lá rụng, phân, hoặc nước máy mới). Đây là giai đoạn bình thường khi bể đang chạy (cycling), kéo dài khoảng 1-3 tuần. Vi sinh có ích (nitrat hóa) chủ yếu bám trên bề mặt lọc, nền, đá, kính, cây, nên nước đục không có nghĩa là chúng chết.
> 
> ## Cách xử lý
> 
> - **Đừng thay nước lớn** hoặc rửa lọc bằng nước máy mạnh. Việc này loại bỏ vi sinh bám và làm bloom kéo dài.
> - **Giảm ánh sáng** xuống khoảng 4-6 giờ/ng…

### cycling-06 · tank · plain wins (5.75 · 6.75)

**Asked:** Bể mới set bỗng đục mờ như sương, có phải vi sinh chết và làm sao gây lại?

**Judge:** Cả hai đều chẩn đoán đúng là bùng vi khuẩn và đều bỏ qua cubic 20 lẫn nước thùng xốp. X gọn và rõ thứ tự nhưng gần như không trả lời cách gây vi sinh, còn Y có thay nước khi có độc tố, giữ oxy và cách gây lại bằng vật liệu lọc cũ, nên hữu ích hơn dù hơi dài và chung chung. / Both correctly say this is a bacterial bloom, not dead bacteria, and both ignore the 20 cm cube and the styrofoam-box water. X still answers how to seed, using mature filter media, bottled bacteria and an ammonia source, and covers water changes and aeration, while Y is tidier and more natural but barely covers seeding and offers no action for rising ammonia beyond testing and optional bacteria.

**Ours lacks:** tank-fit, plan, figures. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages, stopped at the calls limit):

> Nhiều khả năng đây là bùng vi sinh, hiện tượng rất hay gặp ở bể mới set: nước đột ngột đục trắng như nước vo gạo. Cách hiểu thường gặp là vi sinh có lợi đã chết, nhưng cẩm nang nói đây là hai chuyện khác nhau. Khi bể còn non, đám vi khuẩn đang nở ra trong nước, nên thường không cần gây lại từ đầu. Bạn làm theo các bước sau:
> 1. Đo ammonia trước, chỉ số này phải bằng 0, và kiểm tra luôn nhiệt độ nước.
> 2. Nếu ammonia bằng 0, không cần làm gì thêm, bể sẽ tự cân bằng lại.
> 3. Ngưng cho ăn khoảng 7 ngày, cá khỏe vẫn chịu được.
> 4. Để yên bộ lọc ít nhất 7 ngày, không vệ sinh và không đổi gì trong lọc.…

**Plain** (1912 characters):

> Bể mới bị đục trắng như sương thường **không phải vi sinh chết**. Phổ biến nhất là **bloom vi khuẩn** (bùng phát vi khuẩn dị dưỡng), xảy ra trong 1-2 tuần đầu khi bể đang chu trình nitơ. Nguyên nhân thường gặp là dư thức ăn, chất hữu cơ thừa, cá chết hoặc phân cá tích tụ, hoặc vật liệu lọc và nền mới còn bụi. Đây là dấu hiệu vi sinh đang hình thành, không phải vi sinh chết.
> 
> Tuy nhiên, nếu bể đã ổn định rồi bỗng đục sau khi rửa lọc bằng nước máy, dùng thuốc, hoặc thay nước quá nhiều, thì có thể vi sinh có ích đã bị giết và bạn cần gây lại.
> 
> **Cách xử lý khi bloom:**
> - Đừng hoảng và đừng thay …

### cycling-07 · post · ours wins (7 · 4.5)

**Asked:** Hồ em mới set hôm nay, có phân nền và chỉ một số cây cắt cắm dễ trồng. Em đặt trong phòng ngủ nên không thích sủi và lọc vì tiếng ồn. Người bán bảo chỉ cần 2-3 ngày thay nước một lần là được, vậy có ổn không, có cách nào khác không?

**Judge:** X đúng trọng tâm: hồ mới có phân nền cần thay nước nhiều trong hai tuần đầu và chưa nên thả cá, kèm các bước rõ ràng, dù ít mẹo về cây nổi hay lọc êm. Y có gợi ý lọc bọt biển và test nước hữu ích, nhưng lại khuyên giãn thay nước với lý do sai, rất dễ gây rêu và tích amoniac cho hồ mới. / Y nắm đúng điểm mấu chốt: hồ mới có phân nền và không lọc cần thay nước dày trong hai tuần đầu, kèm các bước rõ ràng và dấu hiệu cần theo dõi, dù mức thay hằng ngày hơi nặng tay. X có thêm giải pháp lọc bọt biển đặt bơm xa và cây nổi, nhưng lại khuyên giãn thay nước 1-2 tuần với lý do sai về vi sinh, dễ làm hồ mới tích amoni và bùng rêu.

**Ours lacks:** tank-fit, too-thin. **Plain lacks:** wrong, too-long, plan, tank-fit.

**Ours** (read 4 pages, stopped at the tools limit):

> Lời người bán chưa ổn cho bể vừa set. Bể mới có phân nền mới thường cần thay nước hàng ngày khoảng 30–50% trong hai tuần đầu, rồi giảm dần, theo cẩm nang. Bể không có lọc thì không có vi sinh xử lý amoniac, nên bể không sủi, không lọc chỉ hợp để trồng cây, chưa thả cá hoặc chỉ nuôi vài loài chịu được. Bạn làm theo các bước sau:
> 1. Thay 30–50% nước mỗi ngày trong hai tuần đầu, dùng nước đã khử clo và cùng nhiệt độ.
> 2. Nếu muốn yên tĩnh, để bể chỉ có cây, chưa thả cá, và bật đèn khoảng 6–8 tiếng mỗi ngày.
> 3. Nếu sau này thả cá, chạy chu trình nitơ trước, rồi mới thả cá với mật độ thấp.
> 4. Nếu v…

**Plain** (2058 characters):

> **Thay nước 2-3 ngày một lần thường là không cần thiết.** Hồ mới set, nhất là hồ thủy sinh có phân nền, cần vài tuần để ổn định. Thay nước quá thường xuyên lại làm mất các vi khuẩn có lợi đang hình thành, và bạn phải xử lý nước máy liên tục. Cách làm hợp lý hơn:
> 
> - **Nếu chưa có cá hoặc chỉ có rất ít cá:** thay 20-30% nước mỗi 1-2 tuần, hoặc khi nitrate (NO₃) cao. Khi có cá, lượng thức ăn và chất thải mới là nguồn gây bẩn chính.
> - **Chỉ châm thêm nước** khi bị bay hơi, dùng nước đã khử clo.
> - **Dùng bộ test nước** (NH₃/NH₄⁺, NO₂⁻, NO₃⁻) để quyết định khi nào thay nước, thay vì theo lịch cố đị…

### cycling-07 · tank · ours wins (6.75 · 2.75)

**Asked:** Bể mới set của tôi chỉ thay nước vài ngày một lần thay cho lọc thì có ổn không?

**Judge:** X correctly understands the question is about running without a filter, explains that water changes only dilute and don't replace biological filtration, then gives ordered steps and what to monitor, though it lacks change percentages and doesn't address the seller's 2-3 day schedule. Y misreads the question as being about filter cleaning, so much of its advice is irrelevant, although its water-change percentages are reasonable. / Y answers the real question about running without a filter, explaining that water changes only dilute waste and giving ordered steps for cycling a filterless tank, though it lacks water-change figures and misses the nutrient-rich substrate. X misreads the question as being about filter cleaning, so most of its advice does not apply to this tank.

**Ours lacks:** figures, tank-fit. **Plain lacks:** tank-fit, plan, off-topic.

**Ours** (read 2 pages, stopped at the calls limit):

> Thay nước vài ngày một lần là tốt, nhưng thay nước không thay được lọc sinh học. Theo cẩm nang, vi khuẩn có lợi sống trên mọi bề mặt trong bể như sỏi nền, kính, đồ trang trí và cây, không chỉ trong lọc, nên bể không lọc vẫn có thể có vi khuẩn nếu có đủ diện tích bám. Nhưng bể mới thường mất vài tuần tới vài tháng để cycle, nên trong thời gian đó amoniac và nitrit có thể tăng khi cá thải ra, và thay nước chỉ pha loãng chứ không xử lý liên tục. Mình chưa thấy cẩm nang nói riêng về bể không lọc, nên phần này là kinh nghiệm chung.
> 1. Trồng thêm cây thủy sinh, vì cây hấp thụ amoniac và nitrat từ c…

**Plain** (1338 characters):

> Tùy bạn đang hiểu "thay cho lọc" là thay nước **thay cho** việc vệ sinh lọc, hay là thay nước **và** vệ sinh lọc. Mình trả lời theo hướng bạn đang hỏi có nên thay nước thường xuyên hơn để thay thế việc vệ sinh lọc không.
> 
> **Thay nước không thay thế được việc vệ sinh lọc.** Hai việc này có tác dụng khác nhau:
> - **Thay nước** giúp giảm amoniac, nitrit, nitrat và các chất bẩn hòa tan.
> - **Vệ sinh lọc** chỉ cần khi lọc bị tắc hoặc dòng chảy yếu đi rõ rệt. Vệ sinh quá kỹ hoặc quá thường xuyên có thể làm mất vi khuẩn có lợi.
> 
> **Với bể mới, bạn nên lưu ý:**
> - **Bể chưa chạy xong chu trình nitơ (chưa…

### cycling-08 · post · plain wins (5 · 8)

**Asked:** Hồ của em làm từ thùng xốp 40x40x20, 2 mặt kính, 3 mặt xi măng, để trên sân thượng trong mái hiên. Em dùng lọc thác Sobo 400l/h có đủ không? Hồ như vậy có cần CO2 không? Bao lâu thì thả cá được?

**Judge:** Y trả lời rõ cả ba câu và nêu đúng rủi ro lớn nhất của hồ này: xi măng kiềm cần xử lý và ngâm xả, kèm khử clo, che nắng, chống lăng quăng. X đúng về lọc và cycling nhưng bỏ sót xi măng, văn phong dựa 'cẩm nang' và ít bám điều kiện sân thượng. / X nêu đúng rủi ro lớn nhất là xi măng làm nước kiềm và hướng dẫn cách xử lý, đồng thời trả lời rõ cả ba câu hỏi kèm cách chạy chu trình và mật độ cá. Y gọn và có ngưỡng theo dõi tốt nhưng bỏ sót xi măng, trả lời CO2 kém dứt khoát và văn phong \"cẩm nang\" gượng.

**Ours lacks:** tank-fit, unsafe, local. **Plain lacks:** too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Lọc Sobo 400 l/h là dư cho bể 40x40x20 (khoảng 32 lít). Cẩm nang chỉ cách chọn lọc: lấy công suất ghi trên hộp chia đôi, nên 400 l/h hợp với bể khoảng 200 lít, bể của bạn chạy mạnh hơn nhiều. Bạn nên siết van hoặc đặt miệng xả hướng vào thành để dòng nước êm cho cá. Về CO2, cẩm nang nói bể không châm CO2 vẫn trồng được cây nếu ánh sáng xuống bể thấp, chỉ khi muốn cây lên nhanh hoặc vớt hết cây nổi thì mới cần châm. Về thả cá, bạn chưa nên thả khi lọc vừa lắp xong, vì vi sinh chưa đủ để xử lý chất thải.
> 1. Chạy lọc có nước trước, rồi đo amoniac và nitrit mỗi một đến hai ngày.
> 2. Nếu vi sinh ch…

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

### cycling-08 · tank · ours wins (5 · 4)

**Asked:** Bể mới làm của tôi bao lâu thì thả cá được, lọc như vậy có đủ không?

**Judge:** Both miss the key risk: new cement can leach and raise pH, so it needs curing and rinsing before fish. Neither says that a 400 l/h Sobo gives about 12 turnovers an hour in this roughly 32 L tank. X still explains that a new filter lacks bacteria and gives clear steps and thresholds, while Y gives a useful 3–6 week estimate but sends the filter question back to the hobbyist. / Cả hai đều bỏ qua việc khử xi măng mới và không tính bể khoảng 32 lít với lọc 400 l/h là dư lưu lượng. Y nhỉnh hơn nhờ có các bước theo dõi, thay nước và tiêu chí xong cycle có cho ăn, còn X cho mốc 3–6 tuần rõ hơn nhưng phần lọc lại chủ yếu hỏi ngược.

**Ours lacks:** tank-fit, diagnosis, figures. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 2 pages):

> Bể mới thường cần vài tuần đến vài tháng để chu trình nitơ ổn định, nên không có con số ngày cố định. Lọc chỉ là chỗ để vi khuẩn có lợi bám vào. Lọc mới chưa có vi khuẩn, nên chưa đủ để xử lý chất thải của cá, và bạn chưa nên thả cá ngay chỉ vì đã có lọc.
> 1. Đo amoniac và nitrit bằng que thử mỗi một đến hai ngày.
> 2. Nếu amoniac hoặc nitrit trên 0,2 ppm, thay một phần nước để giảm chất độc.
> 3. Nếu thả cá trước, chỉ thả vài con và cho ăn rất ít trong bốn đến sáu tuần đầu.
> 4. Bể được coi là đã chạy xong khi amoniac và nitrit đều 0 ppm trong một tuần mà bạn vẫn cho ăn bình thường. Lúc đó mới thả …

**Plain** (1336 characters):

> Thường thì bể mới cần **khoảng 3–6 tuần** để chu trình nitơ (nitrogen cycle) ổn định trước khi thả cá. Trong thời gian này, vi khuẩn có lợi phải phát triển đủ để xử lý amoniac (NH₃) và nitrit (NO₂⁻) do cá thải ra. Nếu thả cá sớm, amoniac và nitrit sẽ tích tụ và dễ làm cá chết.
> 
> **Cách biết bể đã sẵn sàng:**
> - Dùng bộ test nước (nên dùng loại giọt, chính xác hơn que thử) kiểm tra amoniac và nitrit.
> - Khi **amoniac = 0** và **nitrit = 0** trong ít nhất 2–3 ngày liên tiếp, và đã có nitrat (NO₃⁻) xuất hiện, bể đã chạy xong chu trình.
> - Ngược lại, nếu amoniac hoặc nitrit vẫn đo được thì chưa nên t…

### sick-01 · post · ours wins (6.75 · 5.25)

**Asked:** Đàn ngựa vằn xanh nhà em nuôi gần 3 năm, rơi rụng dần. Giống này không đẻ nổi, giờ cứ 1 vài tuần lại có con cong người, 1-2 tuần sau là chết. Có phải do già quá không, hay bị bệnh gì?

**Judge:** X answers the age question directly and points to a chronic disease specific to zebra danios, with ordered steps, though it omits fish TB and its temperature range suits Vietnam poorly. Y rightly flags fish TB and the risk to humans, but it wrongly downplays age, is unsure of the species, lists six causes and ends with a long set of questions. / Y trả lời thẳng câu hỏi già hay bệnh: 3 năm là gần cuối tuổi thọ nhưng kiểu chết này giống bệnh mạn tính trong đàn, nêu đúng Pseudoloma, nói rõ khó chữa và cho các bước theo dõi, dù thiếu lao cá và dải 18–25°C không hợp Việt Nam. X có điểm tốt là nghi lao cá kèm cảnh báo lây sang người, nhưng gạt yếu tố tuổi, phân vân cả loài, liệt kê dàn trải và hỏi lại nhiều.

**Ours lacks:** follow-up, local, figures. **Plain lacks:** tank-fit, diagnosis, too-long, plan, follow-up.

**Ours** (read 4 pages, stopped at the calls limit):

> Ba năm là gần cuối tuổi thọ của cá ngựa vằn (khoảng 3–5 năm), nên già có thể là một phần. Nhưng việc cá cong người, gầy dần rồi chết sau 1–2 tuần, và cứ vài tuần lại thêm con, giống một bệnh mạn tính lây trong đàn hơn. Cẩm nang nhắc hai bệnh hay gặp ở loài này: bệnh gầy (microsporidiosis, do ký sinh trùng Pseudoloma neurofilia gây ra), làm cá gầy mòn và cong cột sống, và bệnh NTD (Pleistophora), làm cá bồn chồn, thở gấp, da nổi mảng trắng. Cả hai hiện chưa có thuốc chữa dứt điểm khi đã nặng, nên mình chỉ có thể nói là có khả năng cao, chưa chắc chắn.
> 1. Cách ly ngay những con đang cong người …

**Plain** (2113 characters):

> Nếu "ngựa vằn xanh" là cá (zebra danio hoặc cichlid vằn xanh), thì tuổi già thường không gây ra triệu chứng này. Cá già thường yếu dần, ăn ít, đẻ kém, chứ không cong người rồi chết trong 1-2 tuần. Biểu hiện cong người kèm chết nhanh thường là bệnh, và có vài nguyên nhân chính:
> 
> 1. **Lao cá (Mycobacteriosis)**: Đây là nghi ngờ hàng đầu với triệu chứng bạn mô tả: gầy dần, rụng dần, cong cột sống, bụng hõm, có thể có vết loét hoặc u hạt. Bệnh âm ỉ, lây lan chậm, khó chữa. Lao cá có thể lây sang người qua vết xước, nên khi xử lý cá bệnh hoặc xác chết phải đeo găng tay và rửa tay kỹ.
> 2. **Nhiễm kh…

### sick-01 · tank · plain wins (4.25 · 6.75)

**Asked:** Cá ngựa vằn của tôi cứ vài tuần lại có con cong người rồi chết, là bệnh gì?

**Judge:** Y puts fish TB and Pseudoloma first, the causes that best fit slow, recurring spinal curvature in zebra danios, and it adds the glove warning for human infection, though it misses the fish's age of nearly 3 years and the list is unfocused. X has tidy steps but points the keeper to vitamin C, injury or genetics, so its feed fix probably won't stop the deaths and it delays dealing with a contagious disease. / X names the causes an experienced keeper would suspect for recurring bent-spine deaths in danios, mycobacteriosis and Pseudoloma, and warns that fish TB can infect people, though its list is broad and it misses the fish's age. Y has a tidier plan but leads with vitamin C, injury or genetics, which sends the keeper to diet changes and misses the likely chronic infection.

**Ours lacks:** diagnosis, tank-fit, figures. **Plain lacks:** tank-fit, plan, too-long, follow-up.

**Ours** (read 4 pages, stopped at the calls limit):

> Mình chưa đủ căn cứ để gọi tên bệnh cụ thể. Cá cong người kéo dài nhiều tuần rồi chết thường là dấu hiệu cột sống cong do thiếu vitamin C, hoặc do chấn thương hay di truyền, như cẩm nang nói về cá bị cong lưng. Nếu cá có thêm bỏ ăn, lờ đờ hay xuất huyết thì nhiễm khuẩn là khả năng cần loại trừ, và cẩm nang chưa có hướng dẫn đủ rõ cho trường hợp này.
> 1. Tách ngay con đang cong người ra bể cách ly, để riêng để theo dõi.
> 2. Xem lại thức ăn: cho ăn đa dạng và có thức ăn giàu vitamin C, không chỉ một loại cám.
> 3. Quan sát nắp mang, da và vây của cá chết và cá còn lại, xem có biến dạng hay xuất huy…

**Plain** (1884 characters):

> Cá ngựa vằn bị cong người rồi chết thường gặp trong vài bệnh sau. Tôi không thể chẩn đoán chắc chắn chỉ từ mô tả, nhưng các khả năng phổ biến nhất là:
> 
> 1. **Bệnh lao cá (mycobacteriosis)** do *Mycobacterium* spp. Đây là bệnh mạn tính, hay gặp ở cá ngựa vằn và hay gây cong cột sống, gầy rộc, bụng phình, có thể có u hạt. Cá bệnh thường chết dần trong nhiều tuần, lây qua cá khác và có thể lây cho người.
> 
> 2. **Microsporidia *Pseudoloma neurophilia*** là ký sinh trùng gây tổn thương thần kinh và cột sống. Cá thường bơi bất thường, co giật, cong vẹo rồi gầy yếu và chết dần.
> 
> 3. **Nhiễm virus Nodavi…

### sick-02 · post · ours wins (7.5 · 6.75)

**Asked:** Nguyên nhân cá chết là gì ạ? Em có bể cá vàng, 7 màu và mấy loại linh tinh rẻ rẻ cho con chơi, nuôi trong nhà, mật độ thưa. Lọc với sục oxy chạy 24/24, nước trong sạch; em cho ăn rất ít, thức ăn viên mua sẵn; ít thay nước, chỉ thay khi thấy vẩn đục, có xử lý clo trước khi cho nước vào. Cái mút xốp lọc em giặt nước lã suốt vì phân cá hút lên nhanh bẩn. Vậy mà tuần nào cũng có con chết, tháng nào cũng đi mua thêm mà cứ chết dần.

**Judge:** Both correctly blame the tap-water sponge rinsing and infrequent water changes. X gives a short ordered plan, flags its diagnosis as an inference and treats the goldfish-guppy mix directly, though it omits telling them to stop buying fish. Y does say to stop buying fish, but it is a longer, more generic list that asks back about fish the hobbyist already named. / Both correctly blame the tap-water sponge washing and infrequent water changes. Y gives a clearer ordered plan with follow-up and directly addresses the goldfish-guppy mix, while X adds useful advice to stop buying fish but is looser, more generic and asks what '7 màu' is.

**Ours lacks:** follow-up, figures. **Plain lacks:** plan, tank-fit, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Nguyên nhân khả dĩ nhất là nước trong bể không ổn định, không phải do thức ăn hay oxy. Việc giặt mút lọc bằng nước máy thường xuyên giết vi khuẩn có ích đang phân hủy amoniac và nitrit, nên chất độc tích dần và cá chết lần lượt. Thay nước ít, chỉ khi thấy đục, cũng làm chất thải tích lại. Nếu 7 màu là cá bảy màu thì đó là loài nhiệt đới, không hợp với cá vàng là loài nước mát, nên bể đang nuôi lẫn các loài không hợp nhau. Đây là suy đoán từ những gì bạn kể, mình chưa đo được nước của bạn.
> 1. Ngừng giặt mút lọc bằng nước máy, chỉ vắt trong nước bể vừa rút ra khi thay nước.
> 2. Mua bộ test amoni…

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

**Judge:** X commits to a likely cause tied to this tank's habits (water changed only when cloudy, sponge washed in tap water) and gives ordered steps with follow-up, though its monthly change schedule is too light and it ignores the goldfish. Y's weekly 25–30% change and filter-washing advice are sound, but they sit inside a generic ten-cause list that includes causes that don't apply, so the hobbyist still doesn't know what is wrong. / Y names the likely cause from this tank's habits (rare water changes, sponge washed in tap water) and gives an ordered fix with a recheck, while X is a generic list of ten causes that ignores these details, though it does mention tap-water rinsing and weekly changes. Y's minor flaws are an assumed top-up habit and an impractical oxygen test.

**Ours lacks:** tank-fit, local. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 2 pages):

> Nguyên nhân khả năng cao nhất là chất bẩn tích dần trong bể, tức hội chứng bể cũ (old tank syndrome). Bể của bạn chỉ thay nước khi vẩn đục và thường châm thêm nước cho đầy, nên nitrat, khoáng và chất thải cứ tăng qua nhiều tuần. Cá quen dần nên không chết ngay, nhưng đến lúc có một con yếu hoặc thả thêm cá là chết liên tiếp. Mình chưa biết chỉ số nước thực tế nên độ chắc chắn ở mức vừa. Cần đo để chắc.
> 1. Đo amoniac, nitrit, nitrat, pH và clo (nếu dùng nước máy) để xem chất nào đang cao.
> 2. Thay 30–50% nước ngay, rút nước cũ ra trước rồi mới châm nước mới đã khử clo.
> 3. Giặt mút lọc bằng chín…

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

### sick-03 · post · not judged

**Asked:** Hồ em trồng minifiss, ráy và ít cắt cắm (sunset, rong la hán), nuôi tép màu và ít cá (bảy màu, otto, pigmy). pH lúc có CO2 đo được 7, KH 4, GH 8, TDS 360; nước nguồn TDS cao (160-200). Rong èo uột không phát triển, ráy ra lá non nhưng không khỏe, có rêu xanh bám lá, fiss phát triển chậm. CO2 em để 2-3 giọt/giây nhưng test CO2 vẫn báo thiếu. Tép bị chết lai rai, cá tầm 1-2 tuần chết 1 con. Có cách nào hạ TDS không, hay do đâu?

**Ours** (read 4 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (3801 characters):

> Mình nghĩ vấn đề không nằm ở một yếu tố mà là chuỗi liên quan: nước cứng và TDS cao, phần đo CO2 chưa chắc đúng, và có thể dinh dưỡng hoặc độc tố đang gây stress cho tép và cá.
> 
> ## 1. Đọc lại thông số
> 
> - **CO2:** Với KH 4 dKH (~71 ppm) và pH 7, lý thuyết CO2 khoảng 12 mg/L, mức này đủ cho cây phát triển. Nếu test kit báo thiếu thì khả năng cao là kit đã hết hạn, đọc sai bảng màu, hoặc pH meter chưa hiệu chuẩn. Bạn nên:
>   - Hiệu chuẩn lại pH meter bằng dung dịch chuẩn 4.0 và 7.0.
>   - Dùng drop checker để theo dõi xu hướng (xanh vàng là đủ CO2 hay chưa).
>   - Đo pH sáng sớm trước khi bật đèn và …

### sick-03 · tank · ours wins (6.75 · 4.5)

**Asked:** Tép trong bể tôi chết lai rai và cá thỉnh thoảng chết một con, có phải do TDS cao không?

**Judge:** X trả lời thẳng rằng TDS 360 chưa chắc là thủ phạm, nêu nghi can cụ thể (amoniac, nitrit, oxy, dư CO2, lỗi lột xác), có các bước theo thứ tự kèm ngưỡng và phép thử CO2 đáng giá cho bể chạy CO2. Y giải thích đúng về thành phần TDS nhưng chỉ là danh sách chung chung, không xếp thứ tự nghi can, bỏ qua CO2 và còn hỏi lại những thông tin bể đã có. / Y trả lời thẳng rằng TDS 360 chưa chắc là thủ phạm và đưa các bước có thứ tự kèm ngưỡng amoniac, nitrit, tuy còn nghi CO2 dư lệch với test và khuyên nước để lắng sai. X đúng ý chung nhưng là danh sách chung chung, lệch sang tép Caridina và hỏi lại những số bể đã có.

**Ours lacks:** tank-fit, follow-up. **Plain lacks:** tank-fit, diagnosis, too-long, local.

**Ours** (read 3 pages, stopped at the calls limit):

> Mình chưa thấy trong cẩm nang nào ghi TDS 360 tự giết tép hay cá, nên TDS cao chưa chắc là thủ phạm chính. Với bể của bạn, nguyên nhân dễ nghi hơn là nước có amoniac, nitrit, oxy thấp, CO2 dư hoặc tép lỗi lột xác. Cẩm nang có nói TDS khoảng 100–150 hợp với bể thủy sinh, nên 360 là cao, nhưng nó chỉ là một yếu tố cần xem thêm.
> 1. Đo ngay amoniac, nitrit, pH và oxy hòa tan. Amoniac trên 0,05 mg/L đã hại mang, nitrit trên 0,1 mg/L bắt đầu độc.
> 2. Kiểm tra CO2: múc một xô nước bể, sục khí 1 giờ rồi đo lại pH. Nếu pH tăng hơn 1 đơn vị thì bạn đang dư CO2, nên giảm lượng đang nhỏ giọt.
> 3. Nếu amoni…

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

### sick-04 · post · ours wins (6 · 4.75)

**Asked:** Mình chơi bể 60x40x40, set được gần 3 tháng, layout núi đá dùng đá da voi màu trắng nên pH ở ngưỡng 7,8-8. Thảm nền trồng trân châu ngọc trai, mấy ngọn rau thơm cắm khe đá, có vảy ốc xanh và vảy ốc đỏ. Để hạ pH, mình bổ sung thêm vật liệu lọc Neo Soft, vừa cho vào chạy thì chỉ khoảng 10 giây sau tép chạy loạn hết rồi chết dần. Sau đó thảm trân châu và rau thơm bị rữa lá, pH luôn ở 8,4, sục CO2 cũng chỉ xuống 7,4 trong khi nước đầu vào 7,0 trở xuống. Vảy ốc thì có vết như gãy ngang ngọn lá nhưng lá vẫn xanh, không rụng. Mình nên xử lý sao?

**Judge:** X đúng trọng tâm: quy cái chết tức thì của tép cho Neo Soft, thừa nhận chưa rõ thành phần và đưa các bước gọn, an toàn, dù bỏ sót triệu chứng ở vảy ốc và thiếu hướng xử lý đá. Y có kế hoạch dài hạn tốt hơn (giảm đá da voi, thay nước RO định kỳ) nhưng nhầm vảy ốc thành ốc Neritina và coi amoniac là thủ phạm chính, nên kém tin cậy hơn và còn dài dòng. / Y chỉ đúng Neo Soft là nguyên nhân chính và đưa ra các bước gọn, an toàn, nhưng bỏ sót vảy ốc và không xử lý tận gốc đá da voi. X có kế hoạch dài hạn đầy đủ hơn (KH, thay đá, RO) nhưng nhầm vảy ốc thành ốc Neritina và nghi amoniac là thủ phạm chính, làm giảm độ tin cậy.

**Ours lacks:** tank-fit, figures, too-thin. **Plain lacks:** tank-fit, too-long, wrong.

**Ours** (read 0 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là Neo Soft: tép chạy loạn ngay trong vài chục giây rồi chết, đó là dấu hiệu sốc hóa chất hoặc pH đổi đột ngột, và rêu trân châu với rau thơm rữa lá sau đó cũng hợp với việc nước bị xáo trộn. Mình chưa đọc được trang nào về Neo Soft nên chưa biết thành phần của nó, còn phần pH cao là do đá da voi trắng giữ KH cao, nên CO2 chỉ kéo xuống được 7,4.
> 1. Lấy Neo Soft ra khỏi bể và hộp lọc ngay, không để lại trong bể; đọc nhãn sản phẩm và làm theo hướng dẫn của hãng.
> 2. Thay khoảng 30% nước bằng nước đã khử clo, cùng nhiệt độ với bể, để pha loãng phần hóa chất đã tan ra.
> …

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

### sick-04 · tank · ours wins (6.5 · 5)

**Asked:** Tôi vừa thêm vật liệu lọc hạ pH thì tép chạy loạn rồi chết dần, phải làm gì?

**Judge:** X names the likely sudden pH drop and gives an ordered rescue plan with CO₂ off, water-change limits and hourly pH checks, though its goal of returning to the old pH is flawed and it misses the rock behind pH 8.4. Y is safer on rate but generic, omits CO₂, pads with parameter lists and also misses the rock. / Y names the likely cause (a sudden pH drop from the media) and gives an ordered rescue with CO₂ off, hourly pH checks, rate limits and what to watch, though it misses the white rock behind the pH of 8.4. X has sensible first steps and a useful GH/KH/ammonia checklist, but it is generic, never mentions CO₂ and drifts into general parameters and advice for next time.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, diagnosis, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Nhiều khả năng pH đã tụt quá nhanh sau khi bạn thêm vật liệu hạ pH, và tép rất nhạy với kiểu đổi pH đột ngột này. Cẩm nang gọi đó là pH crash. Mình chưa đo được pH hiện tại của bể nên chưa chắc chắn, bạn đo ngay để xác nhận.
> 1. Lấy vật liệu hạ pH vừa thêm ra khỏi lọc ngay.
> 2. Tắt CO2 nếu bể có châm, rồi tăng sục khí và làm mặt nước xáo động mạnh hơn.
> 3. Thay 20–30% nước bằng nước đã khử clo, không thay từ 50% trở lên trong một lần.
> 4. Đo pH mỗi giờ; nếu vẫn thấp thì thay thêm 15–20% nước, cách nhau khoảng một giờ. Mục tiêu là đưa pH về mức cũ trong khoảng 4–8 giờ, mỗi giờ chỉ tăng tối đa khoả…

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

### sick-05 · post · plain wins (4.25 · 7.75)

**Asked:** Bể của tôi set được 2 tháng, có đèn, oxy, CO2, nhưng gần đây nước trong bể có màu vàng nâu, cá thì chết lai rai. Tôi thay nước cách ngày 50% (dùng nước lọc loại mua uống hằng ngày) mà vẫn không hết. Giúp tôi với.

**Judge:** Y spots the key clue X misses, that large changes with mineral-poor drinking water can crash pH and stress fish, and it also checks CO₂ and gives a concrete replacement routine. It runs long and ends with many questions, but X ignores both the water source and CO₂ and gives thinner, partly generic steps. / X catches the key mistake of using low-mineral drinking water for large changes, checks CO2, and gives a corrective water routine and ordered first steps, though it is long and ends with many questions. Y ignores both the bottled water and CO2, tells them to keep making 50% changes, and adds a filter restart and a side note on freezing dead fish.

**Ours lacks:** tank-fit, diagnosis, figures, follow-up. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là chất lượng nước đang xấu dần, chưa phải chỉ do màu nước. Bể mới set khoảng 2 tháng thường còn trong giai đoạn chạy chu trình nitơ, nên amoniac hoặc nitrit có thể vẫn tăng, và cá chết lai rai là dấu hiệu hay gặp. Màu vàng nâu có thể do tannin từ lũa hoặc do tảo cát (tảo nâu), tảo này thường hết khi bể ổn định, còn tannin thì không hại cá. Thay nước 50% mà màu không hết cho thấy nguồn màu vẫn đang tiếp tục tiết ra.
> 1. Đo ngay amoniac, nitrit, pH và oxy hòa tan nếu có thể, rồi ghi lại kết quả mỗi ngày.
> 2. Ngưng hoặc giảm cho ăn, vì thức ăn thừa phân hủy sinh amonia…

**Plain** (3054 characters):

> Nước vàng nâu kéo dài kèm cá chết dần thường có nguyên nhân chính không phải là "nước bẩn" đơn thuần. Bạn nên kiểm tra theo thứ tự sau.
> 
> ## 1. Xác định màu nước do đâu
> 
> - **Tannin (chất màu từ gỗ, lá):** Nếu bạn có lũa, lá bàng, lá khô, hoặc than bùn, nước sẽ vàng nâu như trà. Loại này thường không gây hại trực tiếp, nhưng không thể gây cá chết hàng loạt.
> - **Chất hữu cơ phân hủy:** Thức ăn thừa, cá chết, lá úa, phân cá tích tụ, nền đất/sỏi bị thối. Đây là nguyên nhân hay gặp nhất khi bể mới 2 tháng.
> - **Tảo silic (diatom):** Lớp màu nâu bám trên kính, lá, sỏi, thường gặp ở bể mới có đèn mạnh…

### sick-05 · tank · plain wins (3 · 5)

**Asked:** Nước bể tôi ngả vàng nâu và cá chết lai rai dù thay nước thường xuyên, vì sao?

**Judge:** X khẳng định sai là hội chứng bể cũ và khuyên việc họ đã làm, nên dễ dẫn sai hướng. Y dài và chung chung, cũng không nhận ra rủi ro nước đóng bình nghèo khoáng kèm CO₂, nhưng có test amoniac, nitrit, pH, GH/KH và các bước xử lý an toàn, nên có thể lần ra nguyên nhân. / Neither spots the likely issue of low-mineral bottled water with CO₂ and very frequent large changes, which can make pH unstable. X is generic and long but includes the immature cycle, pH shock and GH/KH checks with sensible first steps, while Y's concise plan rests on a wrong old-tank diagnosis and water-change advice that misses this tank.

**Ours lacks:** wrong, tank-fit, diagnosis. **Plain lacks:** tank-fit, too-long, diagnosis, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là bể đang bị tích chất bẩn lâu ngày (kiểu old tank syndrome): nitrat, khoáng và chất hữu cơ dồn lại vì lượng nước thay chưa theo kịp lượng thức ăn và cá. Việc châm thêm nước cho đầy mà không rút nước cũ ra cũng làm chất bẩn tích dần. Màu vàng nâu có thể đến từ lũa nhả tannin, nhưng màu đó tự nó không giết cá. Mình chưa biết bể đã chạy bao lâu, có lũa hay không, nên mức chắc chắn ở mức vừa.
> 1. Đo ngay pH, amoniac, nitrit và nitrat để biết bể đang ở đâu.
> 2. Tăng lượng thay lên khoảng 30 đến 50 phần trăm mỗi lần, rút nước cũ ra thay vì chỉ châm thêm.
> 3. Giảm số cá h…

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

### sick-06 · post · ours wins (7.25 · 6)

**Asked:** Bể cá rồng nhà em dùng hơn 20 năm bị rò nên phải thay bể mới. Từ hôm chuyển sang bể mới, 2 con cá rồng bỏ ăn luôn, được gần 1 tuần rồi. Cá mồi vẫn bơi trong bể mà rồng không chịu ăn. Em theo dõi thì 2 con vẫn bơi bình thường, chưa nằm đáy. Phải làm sao?

**Judge:** X names the likely cause up front and gives a short ordered plan (test NH3/NO2, water change, dim light, offer favourite food, watch signs, when to escalate), with useful guide excerpts, though it omits pH, temperature and moving old filter media. Y does include those useful points, but they are buried in a long generic checklist that reads like advice for any sick fish and ends by asking for more details. / Y nói ngay nguyên nhân có khả năng nhất, đưa các bước ngắn theo thứ tự cùng mốc theo dõi và trích hướng dẫn đúng chuyện chuyển bể cá rồng, dù thiếu kiểm tra pH, nhiệt độ và mẹo dùng vật liệu lọc cũ. X đầy đủ hơn và có mẹo đó, nhưng dài, chung chung như checklist cho mọi bể và chốt bằng việc hỏi lại.

**Ours lacks:** figures, tank-fit. **Plain lacks:** too-long, tank-fit.

**Ours** (read 3 pages, stopped at the calls limit):

> Gần một tuần bỏ ăn sau khi chuyển bể, nhưng cá vẫn bơi bình thường và chưa nằm đáy, nên nhiều khả năng là stress do chuyển bể và nước lạ, chưa phải bệnh nặng. Tuy vậy, bể mới có thể chưa ổn định về nước nên bạn cần kiểm tra trước.
> 1. Test amoniac và nitrit trong bể mới bằng bộ test nhỏ giọt; nếu có số trên 0, thay 30–50% nước.
> 2. Giảm ánh sáng, che bớt mặt bể, để cá yên và đừng gõ kính hay bắt cá ra xem liên tục.
> 3. Thử cho ăn lại món cá rồng thích, như tôm nguyên con hoặc cá thái miếng nhỏ; cho ít, vớt phần thừa sau vài phút, không cho thịt bò hay gà.
> 4. Quan sát kỹ từng con: có trầy xước, n…

**Plain** (3108 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là chuyện khá thường gặp. Nếu cá vẫn bơi bình thường, không nằm đáy, không đổi màu thì chưa phải cấp cứu, nhưng bỏ ăn gần 1 tuần thì bạn cần xử lý ngay. Bạn nên làm theo các bước sau.
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻):** Bể mới chưa chạy nitơ (chưa "cycle") thì hai chỉ số này dễ tăng cao và gây stress, mất cảm giác thèm ăn. Mục tiêu là 0 ppm cho cả hai.
> - **Nitrat:** Giữ dưới 40 ppm, lý tưởng dưới 20 ppm.
> - **pH và độ cứng:** Khác biệt lớn so với bể cũ cũng gây sốc. Nếu nước bể cũ và bể mới khác nhau nhiề…

### sick-06 · tank · ours wins (7 · 6)

**Asked:** Cá rồng của tôi bỏ ăn gần một tuần từ khi chuyển sang bể mới, làm sao?

**Judge:** X names the likely cause (transfer stress plus an uncycled one-week tank), uses the fish's normal swimming and the feeder fish, and gives short ordered steps, though it omits practical stress reduction and has a low temperature range. Y has a better temperature range, useful calming tips and a realistic fasting timeline, but it is long and generic and asks for tank age and other details instead of tailoring its advice. / Y names the likely cause (move stress plus an uncycled new tank), uses 'still swimming normally' and the feeder fish, and gives short ordered steps, despite a low temperature range. X has sound advice, a better temperature and a clear two-week threshold, but it is long and generic and asks for details such as tank age.

**Ours lacks:** plan, follow-up. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Cá rồng bỏ ăn sau khi chuyển bể thường là do stress vì đổi bể, cộng với bể mới chưa ổn định: trong 1 đến 3 tuần đầu, vi sinh trong lọc chưa đủ nên amoniac và nitrit có thể tích lại. Bạn nói cá vẫn bơi bình thường, nên nhiều khả năng chưa phải bệnh nặng, nhưng hãy kiểm tra nước trước vì đó là nguyên nhân dễ gặp nhất và dễ xử lý nhất.
> 1. Test amoniac, nitrit và nitrat ngay bằng bộ test nhỏ giọt.
> 2. Nếu amoniac hoặc nitrit trên 0, hoặc nitrat trên 40 ppm, thay 30–50% nước bằng nước đã khử clo, nhiệt độ gần bằng bể.
> 3. Kiểm tra nhiệt độ bể, giữ khoảng 22–28°C, và thay sưởi nếu sưởi hỏng.
> 4. Cho ă…

**Plain** (2612 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là phản ứng khá phổ biến vì chúng rất nhạy với stress. Tuy vậy, một tuần là đủ lâu để bạn cần kiểm tra kỹ. Bạn có thể làm theo các bước sau:
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - Dùng bộ test để đo **amonia (NH₃/NH₄⁺), nitrit (NO₂⁻), nitrat (NO₃⁻), pH, nhiệt độ**.
> - Amonia hoặc nitrit lớn hơn 0 là dấu hiệu nguy hiểm. Bể mới chưa chạy xong chu trình nitơ (cycling) rất dễ xảy ra tình trạng này.
> - Nếu có amonia/nitrit: thay 25–30% nước mỗi ngày, dùng nước đã khử clo và có nhiệt độ, pH gần với bể cũ. Không thay quá nhiều một lúc vì sẽ gây sốc thêm.
> -…

### sick-07 · post · ours wins (7.5 · 6.5)

**Asked:** Em vừa lật bể, vứt nền sỏi nhỏ đi vì thấy bẩn quá, thì tự nhiên thấy 1 con bị như nấm trắng. Em đang tách riêng, cho ít muối hột vào xem có khỏi không. Như vậy đã đúng chưa, cần làm gì thêm?

**Judge:** X answers directly: it names opportunistic fungus linked to the tank flip, then gives ordered steps with a home-measurable salt dose, a 5–7 day course and a next step, though 'mức 1' is unexplained. Y has useful extras (columnaris differential, temperature, water changes, warning signs), but it hedges on the cause, gives no full course length, and reads more like a general checklist. / Y commits to the likely cause, an opportunistic fungus after the stress of tearing down the tank, then gives a short ordered plan with a salt dose, a course length and clear next steps, plus a relevant guide excerpt. X is sound and has useful extras (salt-sensitive species, quarantine water changes, warning signs), but it hedges on the diagnosis, reads more like a general checklist and is less natural in Vietnamese.

**Ours lacks:** figures. **Plain lacks:** diagnosis, too-long.

**Ours** (read 2 pages):

> Nhiều khả năng con cá bị nấm cơ hội: nấm chỉ bám khi cá đã yếu hoặc có vết xước, và việc lật bể, bỏ nền làm nước đục, khuấy bùn và xáo trộn vi khuẩn lọc khiến cá dễ stress. Tách riêng là đúng, nhưng muối chỉ trị phần ngọn, bạn vẫn phải tìm và sửa nguyên nhân để bệnh không quay lại.
> 1. Chuyển con bị sang bể cách ly đã rửa sạch, có sục khí nhẹ, và không dùng chung nước với bể chính.
> 2. Châm muối đúng liều đo được, bắt đầu mức 1 khoảng 1 muỗng canh cho 11 lít nước, ngâm 5 đến 7 ngày; đừng tự tăng liều.
> 3. Trong bể chính, kiểm tra amoniac và nitrit sau khi lật nền; nếu có chỉ số bất thường thì th…

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

### sick-07 · tank · ours wins (7.25 · 6.25)

**Asked:** Sau khi lật bể, một con cá của tôi bị nấm trắng, tách riêng và cho muối đã đủ chưa?

**Judge:** X links the fungus to skin damage and stress from the flip, then gives a clear salt plan with doses, duration, escalation and a warning about possible bacterial infection. Y usefully covers water testing, methylene blue and ich, but it is longer, less specific on treatment, and blames water quality too narrowly. / Y directly builds on the salt they already use, with a clear dose, duration, escalation step and antibiotic trigger, and links the fungus to stress and scrapes from the flip. X rightly flags water quality and offers methylene blue, but it gives no dose for it, repeats isolation advice they have already followed, and is more generic.

**Ours lacks:** figures, follow-up, tank-fit. **Plain lacks:** figures, too-long, tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ muối mới là bước đầu, chưa chắc đã đủ. Nấm thường bám vào cá đã có vết xước hoặc đang yếu, và việc lật bể dễ gây stress và làm trầy da cá, nên bạn nên kiểm tra thêm nguyên nhân. Theo cẩm nang, muối hột trị được nấm trên thân và nấm miệng, nhưng cần làm đúng cách:
> 1. Châm muối mức 1, khoảng 1 muỗng canh cho 11 lít nước, dùng muối hồ cá chứ không phải muối ăn.
> 2. Giữ 5 đến 7 ngày. Nếu cá hết triệu chứng, rút muối dần bằng cách thay 30% nước mỗi tuần.
> 3. Nếu nấm vẫn còn, nâng lên mức 2, khoảng 1 muỗng canh cho 7,5 lít nước.
> 4. Trong lúc đó, hút đáy, vệ sinh lọc và kiểm tra lại nước, vì…

**Plain** (1892 characters):

> Muối **chưa đủ** nếu bạn chỉ dùng muối. Cá bị nấm sau khi lật bể thường là hệ quả của nước xấu (amoniac, nitrit tăng cao), nên cần xử lý cả nguyên nhân lẫn con cá.
> 
> **Việc nên làm ngay:**
> 
> 1. **Cách ly cá đúng cách:** Dùng bể riêng có sục khí, lọc nhẹ hoặc không lọc (tránh hút cá vào máy), không trồng cây, không đặt nền sỏi.
> 2. **Kiểm tra nước bể cũ và bể cách ly:** Dùng bộ test để đo NH3/NH4+, NO2-, NO3-, pH. Nếu amoniac hoặc nitrit > 0, thay nước ngay (khoảng 30-50%) và thay từng phần hằng ngày cho đến khi ổn định. Nước bể cách ly phải sạch, cùng nhiệt độ và pH với bể cũ.
> 3. **Thuốc trị nấm…

### sick-08 · post · ours wins (6.75 · 5.75)

**Asked:** Hồ mình đang có rêu tảo hại nên mình thử nuôi otto. Thả vào thì cá rất khỏe, bơi kiếm ăn (không quá manh động), nhưng sau một đêm 3 con chết hết, sáng ra thấy nằm im, đụng vào không nhúc nhích. Cùng lúc đó có một đàn neon trong bể vẫn bình thường mà otto thì chết. Vì sao vậy?

**Judge:** X nêu đúng hướng hay gặp nhất là otto mới mua bị sốc hoặc yếu sẵn, có các bước rõ ràng và chỉ ra otto ít ăn rêu sợi, rêu đen, dù bỏ sót thiếu oxy và hóa chất diệt rêu. Y có nhắc hai ý hữu ích đó nhưng liệt kê dàn trải, khẳng định thiếu oxy là chính mà thiếu căn cứ và không nói otto có giải quyết được loại rêu này hay không. / Y gives a focused likely cause, purchase and drip-acclimation steps, and the useful point that otto eat little hair algae or black beard algae, though it slips on the 'remaining' otto. X correctly notes otto's sensitivity but offers a long shotgun list, ranks oxygen first without evidence, and is less clear on what to do next.

**Ours lacks:** diagnosis, tank-fit. **Plain lacks:** too-long, plan, tank-fit, figures.

**Ours** (read 4 pages, stopped at the calls limit):

> Nhiều khả năng otto chết vì sốc và stress hơn là vì bể có vấn đề độc hại, vì neon trong cùng bể vẫn bình thường. Cẩm nang ghi rằng otto hay chết sau khi mua về vì hai lý do: thả vào bể chưa ổn định, và cá bắt tự nhiên không chịu ăn nên đói khi bể không đủ rêu. Mình chưa biết cá là bắt tự nhiên hay nuôi sinh sản, bể đã chạy bao lâu, hay nước có khác nơi cá được nuôi không, nên đây là phán đoán từ thông tin bạn kể.
> 1. Lần sau chỉ mua otto đã ở cửa hàng vài tuần, ưu tiên cá nuôi sinh sản, và mua ít nhất 5 con.
> 2. Khi thả, cho cá làm quen nước trong xô hoặc túi khoảng 4 đến 5 tiếng, nhỏ dần nước …

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

### sick-08 · tank · plain wins (5.25 · 6.75)

**Asked:** Tôi thả cá otto ăn rêu mà sau một đêm chết hết trong khi neon vẫn khỏe, vì sao?

**Judge:** Y nêu đúng các nguyên nhân gây chết qua đêm, kể cả đồng trong thuốc diệt rêu, và bảo đo nước ngay, dù danh sách dài, thiếu ưu tiên và không dùng dữ liệu hồ. X gọn và có lịch trình thả rõ hơn, nhưng đưa nguyên nhân chết đói không hợp với cái chết sau một đêm, và phần theo dõi bỏ qua việc cả 3 otto đã chết. / X covers the realistic overnight killers (NH₃/NO₂, low oxygen, acclimation shock, chlorine, copper or algae-killer chemicals, weak stock) and says to test the water now, though it is a generic, fairly long list. Y is shorter and reads more naturally, but it leans partly on starvation, which cannot explain overnight death, omits oxygen and chemicals, and its follow-up assumes some otto are still alive.

**Ours lacks:** tank-fit, diagnosis, follow-up, local. **Plain lacks:** tank-fit, too-long, local.

**Ours** (read 2 pages):

> Nhiều khả năng cá otto chết vì sốc khi mới thả hoặc vì chưa tập ăn được, còn neon cứng hơn nên chịu được. Cá otto hay chết sau khi mua về theo hai nguyên nhân chính: bể mới chưa ổn định, và cá bắt tự nhiên không chịu ăn thức ăn viên nên chết đói khi bể thiếu rêu. Mình chưa biết bể của bạn đã chạy bao lâu và cá mua từ đâu, nên đây là mức độ chắc chắn vừa phải.
> 1. Kiểm tra bể đã ổn định chưa, nếu mới set thì nên chờ thêm trước khi thả otto.
> 2. Lần sau hỏi người bán xem cá là bắt tự nhiên hay nuôi sinh sản, ưu tiên cá nuôi sinh sản vì dễ tập ăn hơn.
> 3. Mua ít nhất 5 đến 6 con, và cho cá làm quen…

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

### sick-09 · post · plain wins (4.25 · 7.5)

**Asked:** Nhà mình có bể cá ngoài trời 3x1,5m, sâu có 30 phân, đáy lát đá hoa, có hệ thống lọc nước và hút đáy, thêm 1 bơm nước tạo oxy. Trước mua koi về được mấy hôm là lăn ra chết, thế là thả cá chép cho khỏe, mà nay 6-7 con lại chết. Trời đang lạnh ngắt, mình không có dụng cụ đo oxy, không biết do trời lạnh hay sao. Bể này bố mình làm, trước có thả hoa súng nhưng cá rỉa hết. Bắt bệnh giúp mình, nên sửa lọc thế nào, có cần đào sâu thêm không, đáy lát đá hoa có ổn không?

**Judge:** Y answers all three questions (filter, deepening, marble floor), points to the more likely ammonia/nitrite, shallow-tank and disease causes, and gives figures and a way to test. X leans on cold-water oxygen shortage, skips the filter question and hedges on the marble floor, despite being tidier and shorter. / X trả lời đủ các câu hỏi về nguyên nhân, sửa lọc, đào sâu và đáy đá hoa, kèm test amoniac/nitrit và các bước cụ thể, dù hơi dài và có vài nhận định chưa chuẩn. Y ngắn, đổ chính cho thiếu oxy, không nói gì về sửa lọc và trả lời đáy đá hoa rất dè dặt.

**Ours lacks:** tank-fit, figures, too-thin, diagnosis. **Plain lacks:** too-long.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân nhiều khả năng là thiếu oxy trong nước lạnh, cộng với stress vì bể sâu khoảng 30 cm nên nhiệt độ dao động mạnh, và cá vừa chuyển về còn yếu. Cá chết liên tiếp sau khi thả thêm nên cũng cần loại trừ bệnh lây, nhất là koi mới mua. Mình chưa đo được oxy, nên đây là suy đoán từ triệu chứng.
> 1. Tối nay và sáng mai, quan sát cá lúc sớm: nếu cá nổi đầu há miệng thì thiếu oxy. Bật bơm tạo oxy chạy suốt đêm và kiểm tra đá sủi hoặc vòi phun có làm mặt nước xao động.
> 2. Ngừng cho ăn khi nước đang lạnh. Thức ăn thừa phân hủy làm giảm oxy và làm bẩn nước thêm.
> 3. Cá nào lờ đờ, có đốm…

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

**Ours** (read 2 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (2551 characters):

> Cá chết sau vài ngày thả vào và chết thêm khi trời lạnh thường có liên quan đến **chất lượng nước** và **nhiệt độ**. Các nguyên nhân thường gặp:
> 
> ## 1. Nước chưa "chín" (chưa cycling)
> Đây là nguyên nhân phổ biến nhất với bể mới.
> - Cá thải ra **amoniac (NH₃/NH₄⁺)**, và amoniac rất độc. Vi khuẩn có lợi trong bể chuyển nó thành nitrit, rồi thành nitrat, nhưng bể mới chưa đủ vi khuẩn nên amoniac và nitrit tích tụ.
> - Cá chết sau 2–7 ngày, thường có dấu hiệu thở gấp, nổi đầu lên mặt nước, mang đỏ hoặc tái, lờ đờ, bơi lảo đảo.
> - **Cách kiểm tra:** dùng bộ test nước (API hoặc tương đương) đo amoniac,…

### stocking-01 · post · ours wins (6.75 · 4.75)

**Asked:** Em mới tập chơi lại bể cá. Ban đầu hỏi loại nào dễ nuôi, khỏe thì được tư vấn mua 2 cá vàng, 2 con bống (bảo nó ăn phân thừa) và 2 con dọn bể. Được vài hôm 1 con cá vàng chết, nghi đánh nhau. Em mua thêm 10 con 7 màu bé thả vào, vài hôm còn 9, 8 rồi 7 mà không thấy xác. Lạ nhất là 1 con 7 màu bụng to như chửa cũng biến mất. Hôm qua 1 con bống chết, nay con dọn bể chết và mất thêm 2 con 7 màu. Con bống với con dọn bể còn nửa xác, thấy con bống còn lại thỉnh thoảng rỉa. Có phải chúng đánh nhau và con to ăn con bé không? Vậy chỉ được thả cá sàn sàn nhau thôi à?

**Judge:** X nêu đúng gốc vấn đề (bể non, thả lẫn cá không hợp) và có các bước rõ ràng, gồm tách cá vàng khỏi bảy màu và theo dõi nước một tuần, dù chưa trả lời thẳng chuyện thả cá sàn sàn. Y bám sát chi tiết hơn và cũng đoán đúng là do nước, nhưng lại gọi bảy màu là hung dữ, khuyên nuôi chúng với cá lớn trong bể 200 lít, và không có bước tách cá. / X usefully says the goby eats small fish and corpses, but it wrongly calls guppies aggressive and gives a harmful recommendation of big tankmates and a 200 L tank. Y correctly names the immature tank and the bad goldfish mix, with safer ordered steps and daily monitoring, though it doesn't directly answer whether big fish eat small ones or whether fish must be similar in size.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** wrong, plan, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ có đánh nhau, nhưng gốc chính là thả lẫn cá không hợp nhau trong bể còn non. Cá vàng là loài nước mát, cần ít nhất 80 lít cho mỗi con, hay cắn vây khi bị stress hoặc tranh ăn, và cẩm nang ghi tránh nuôi chung với cá bảy màu. Bể mới chưa có vi sinh, cá vàng lại thải nhiều chất bẩn, nên amoniac và nitrit dễ tăng và làm cá yếu dần rồi chết. Vì vậy có con mất hẳn không thấy xác, còn xác thì bị rỉa. Mình chưa chắc chắn về nguyên nhân cụ thể khi chưa đếm lại và thử nước, nên bạn làm theo các bước sau:
> 1. Thử amoniac và nitrit ngay hôm nay, rồi thay khoảng một phần ba nước bằng nước đã khử…

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

### stocking-01 · tank · ours wins (7.5 · 4)

**Asked:** Bảy màu trong bể tôi cứ biến mất không thấy xác, có phải bị cá khác ăn không?

**Judge:** X names the goldfish as the likely predator, explains the missing bodies through the bống scavenging, and gives ordered steps to separate, watch and count, despite overstating the tỳ bà risk. Y is a generic checklist that dwells on fry and absent species, never identifies this tank's goldfish, and ends by asking what fish are kept. / Y dựa vào đúng đàn cá trong bể, chỉ ra cá vàng ăn bảy màu và bống rỉa xác, rồi đưa bước tách cá, đếm cá rõ ràng dù hơi quá tay khi đoán và buộc tội tỳ bà. X chỉ là danh sách chung chung, nói nhiều về cá bột và các loài không có trong bể, rồi hỏi lại thông tin.

**Ours lacks:** figures. **Plain lacks:** tank-fit, diagnosis, too-long, figures.

**Ours** (read 1 pages):

> Không nên nuôi chung: cá vàng và cá tỳ bà leopard đều có thể ăn cá bảy màu, nên khả năng cao là chúng đang ăn dần đàn cá của bạn. Cá tỳ bà leopard có thể dài tới 50 cm và cá vàng khoảng 20 cm, đều lớn hơn cá bảy màu (6 cm) nhiều. Bống thường rỉa xác, nên có thể nó đã ăn hết xác những con chết trước, khiến bạn không thấy xác. Mình chưa thể chắc chắn chỉ từ thông tin này, nhưng đây là nguyên nhân hợp lý nhất.
> 1. Tách cá bảy màu sang một bể riêng, hoặc tách cá vàng và cá tỳ bà ra khỏi bể.
> 2. Quan sát vài đêm xem cá vàng hay cá tỳ bà có rượt, đớp cá bảy màu không.
> 3. Thêm cây thủy sinh dày và chỗ…

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

### stocking-02 · post · plain wins (4.25 · 6.25)

**Asked:** Hồ em 60x40x40, được 1 tuần, đang thả 5 mún + 5 chuột, cá đang tung tăng tốt. Em tính thả thêm 40 neon nữa vậy có nhiều không? Mún có sống chung với neon được không?

**Judge:** Both miss that mún is platy, but Y still gives a usable answer: 40 is too many for a one-week-old tank, 20-30 neon in 2-3 batches, corydoras are fine, and small peaceful fish are compatible. X dodges compatibility and stocking numbers and includes a muddled step, though its staged plan and warning signs are decent. / Cả hai đều không biết mún là platy, nhưng X vẫn trả lời được phần lớn: 40 con là hơi nhiều, nên nuôi 20-30 con và thả làm 2-3 đợt, chuột hợp neon, kèm điều kiện nước. Y có các bước rõ hơn nhưng bỏ trống câu hỏi sống chung, không đưa ra số lượng tổng phù hợp, có bước 4 vô lý và giọng \"cẩm nang\" gượng.

**Ours lacks:** diagnosis, figures, tank-fit, local. **Plain lacks:** follow-up, local, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình chưa xác nhận được "mún" là loài nào trong cẩm nang, nên chưa kiểm tra được mún với neon sống chung. Cẩm nang cũng chưa có con số về mật độ cho riêng 60x40x40 với neon. Bể 60x40x40 chỉ khoảng 80–90 lít thực, mà 40 neon cộng thêm 10 cá đang có là khá đông, và bể mới một tuần thường chưa ổn định sinh học. Vì vậy mình không khuyên thả 40 con một lần.
> 1. Đo ammonia và nitrite trong vài ngày tới; cẩm nang ghi bể khỏe thì cả hai đều 0 ppm, nitrate dưới 40 ppm.
> 2. Nếu ammonia hoặc nitrite vẫn lên, chưa thả thêm và thay nước bằng nước đã khử clo.
> 3. Khi chỉ số ổn định, thả neon thành 2–3 đợt các…

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

### stocking-02 · tank · ours wins (6.5 · 3.75)

**Asked:** Bể của tôi thả thêm 40 con neon có nhiều quá không, nuôi chung với mún được không?

**Judge:** X uses the real tank size and answers both parts: they can live together and 40 is too many, with clear steps, though it misses the 1-week-old tank and is overly strict. Y gives a useful tip on checking ammonia and stocking in batches, but it stays conditional, ignores the tank's details, leans towards allowing 40 and leaves the mún question unanswered. / Y gives a direct verdict: compatible, but 40 is too many for this 96 L tank, with concrete steps, whereas X stays conditional, asks for a tank size and never answers on mún. Y still misses the 1-week-old cycling risk and overstates the cory tank length, and both fail to recognise mún as platy.

**Ours lacks:** diagnosis, follow-up, local, figures. **Plain lacks:** tank-fit, plan, asks-only, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Nuôi chung được: nước có khoảng chung, kích thước và tính cách hợp nhau. Nhưng 40 con neon là quá nhiều cho bể 60×40×40 cm (khoảng 96 lít) của bạn: công cụ tính mật độ cho ra 195%, tức quá tải. Cá neon nên nuôi thành đàn từ 8–10 con trở lên, nên bạn không cần 40 con.
> 1. Dừng thả thêm, và đếm lại cá hiện có trong bể trước khi mua thêm.
> 2. Chọn đàn neon khoảng 8–10 con, không cần 40 con.
> 3. Nếu muốn đàn lớn hơn, nên chuyển bớt cá sang bể lớn hơn trước khi thả thêm.
> 4. Cá chuột đồng cần bể dài từ 80 cm, nên với bể 60 cm bạn nên cân nhắc lại số lượng cá chuột.
> 5. Với cá mún, cẩm nang tính khoảng …

**Plain** (1103 characters):

> Nếu bể của bạn khoảng **100 lít trở lên** và có lọc tốt, thả thêm 40 con neon thường vẫn được, vì neon là cá đàn nhỏ, hiền. Nhưng 40 con khá đông, nên bạn cần kiểm tra vài điều:
> 
> - **Kích thước bể:** Bể dưới 60 lít mà có 40 con neon sẽ rất chật, dễ phát sinh ô nhiễm và stress. Neon nên được nuôi đàn từ 10 con trở lên, và càng nhiều càng tốt nếu bể đủ rộng.
> - **Lọc và thay nước:** Đàn đông thải nhiều chất bẩn hơn. Bạn cần lọc đủ công suất (ít nhất gấp 4-5 lần thể tích bể mỗi giờ) và thay 25-30% nước mỗi tuần.
> - **Chỉ số nước:** Sau khi thả, theo dõi amoniac và nitrit. Hai chỉ số này phải luôn …

### stocking-03 · post · plain wins (4 · 8)

**Asked:** Em mới kiếm được cái bể kích thước 35x20x22cm, chưa chơi bao giờ. Nên nuôi loại cá nào cho đẹp, dự định 1 tuần thay nước 1 lần? Có cần mua lọc và sục khí cho bể không?

**Judge:** Y answers all three questions: which fish suit 15 lít with counts, how much to change weekly, and a sponge filter with air pump that suits a beginner, plus cycling and water treatment. X gives sound filter advice but leaves out the main question of which fish to keep and asks the hobbyist to name a species instead. / X trả lời đủ cả ba câu: gợi ý cá xiêm, tép hoặc bảy màu với số lượng cụ thể, cách thay nước, lọc bọt biển kèm sủi và chạy bể trước khi thả cá, chỉ sai nhỏ khi xếp lia thia vào cá đàn. Y không trả lời câu chính là nuôi cá gì mà hỏi ngược lại người mới, dù phần chọn lọc và thay nước khá ổn.

**Ours lacks:** tank-fit, too-thin, local. **Plain lacks:** local, plan.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể khoảng 15 lít (35x20x22 cm), bạn nên có lọc, vì lọc giữ nước trong và nuôi vi sinh xử lý chất thải của cá. Handbook nói chọn lọc theo lưu lượng khoảng 4 đến 6 lần thể tích bể mỗi giờ, tức khoảng 60 đến 90 lít mỗi giờ cho bể này. Lọc treo hợp bể 20 đến 100 lít, rẻ và dễ thay bông. Sục khí không bắt buộc nếu đã có lọc tạo dòng chảy trên mặt nước, nhưng máy sủi khí tăng oxy khi trời nóng hoặc khi cá yếu, nên mình khuyên nên có. Phần chọn loài cá thì các trang mình mở được chưa có danh sách riêng cho bể cỡ này, nên bạn gửi tên loài định nuôi, mình sẽ kiểm tra chung với bạn.
> 1. Mua lọc treo…

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

### stocking-03 · tank · ours wins (6.75 · 3.5)

**Asked:** Bể tôi nên nuôi cá gì, bao nhiêu con, có cần lọc và sục khí không?

**Judge:** X dùng đúng bể 15 lít và cho kế hoạch rõ: lọc mút xốp kèm máy sục, chạy bể, 6–8 cá nhỏ; dù gợi ý neon vua và sưởi chưa hợp, thiếu % thay nước và chạy bể hơi ngắn. Y hỏi lại kích thước rồi chỉ đưa bảng chung cho bể từ 30 lít trở lên, có % thay nước và thời gian chạy bể tốt hơn nhưng không trả lời được bể này nuôi gì, bao nhiêu con. / Y dùng đúng bể khoảng 15 lít, trả lời thẳng về lọc, sục, loài và số con kèm các bước theo thứ tự, dù neon vua không hợp bể và thời gian chạy chu trình hơi ngắn. X hỏi lại kích thước và đưa gợi ý chung cho bể 30–100 lít, có lỗi về cá thái lan và không đưa ra lựa chọn cụ thể cho bể này.

**Ours lacks:** figures, local. **Plain lacks:** tank-fit, plan, asks-only.

**Ours** (read 3 pages, stopped at the calls limit):

> Với bể 35 x 20 x 22 cm (khoảng 15 lít) đang trống, mình khuyên bạn nên có lọc và sục khí ngay từ đầu, rồi thả một đàn cá nhỏ hiền. Cẩm nang khuyên người mới nên dùng lọc mút xốp (sponge filter) thay vì lọc thùng, vì dòng chảy nhẹ, chạy ổn định và chỉ cần vệ sinh khoảng một tháng một lần. Lọc mút xốp cần máy sục khí để chạy, nên bạn cần cả hai.
> 1. Mua một máy sục khí nhỏ và một lọc mút xốp hợp cỡ bể 15 lít, lắp và cho chạy trước khi thả cá.
> 2. Lắp sưởi giữ nước khoảng 23–27°C, mức phù hợp cho đa số cá nhiệt đới, và đậy nắp bể.
> 3. Dùng thuốc khử clo khi thay nước, vì nhiều nhà máy nước dùng chl…

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

**Judge:** X recognises the likely culprit, a golden algae eater that sucks slime from other fish, and gives a clear fix, though it names no suitable tankmates and its excerpt is off-topic. Y's generic checklist treats the fish as a true goby, largely clears it, and bases its tankmate advice on that mistake, though its water-testing and feeding tips are useful. / Y identifies the likely culprit, a grown bống vàng sucking slime from tankmates, and gives direct steps: remove it, feed the others and watch for 1–2 weeks. It admits it has no tankmate list, and its excerpt is off-topic. X reads the fish as a goby, downplays its role and spreads a generic checklist with risky tankmate picks.

**Ours lacks:** figures, tank-fit. **Plain lacks:** diagnosis, wrong, too-long.

**Ours** (read 1 pages):

> Mình nghĩ bống vàng có phần liên quan đến việc cá của bạn chết dần. Cẩm nang có một người nuôi chia sẻ rằng khi bống vàng lớn, nó hay bám vào và mút nhớt của cá khác, làm cá dễ stress và yếu dần. Mình không chắc đây là nguyên nhân duy nhất, vì mún, kiếm và bảy màu còn cần được cho ăn đều, mà bể bạn đã lâu không cho ăn gì.
> 1. Vớt bống vàng ra, nuôi riêng một bể hoặc một hũ để cá còn lại bớt bị mút nhớt.
> 2. Cho cá ăn đều mỗi ngày một ít thức ăn viên hoặc thức ăn đông lạnh, phù hợp với mún, kiếm, bảy màu.
> 3. Quan sát cá còn lại: nếu thấy nhớt bong, vây rách, đốm trắng hay cá nằm im thì xử lý the…

**Plain** (1911 characters):

> Bống thường hiền với cá cùng cỡ, nhưng một số loài bống có tính lãnh thổ và có thể rượt hoặc cắn cá nhỏ, nhất là cá nằm đáy. Dù vậy, khả năng cao cá chết không phải do bống "xử". Mình nghĩ có mấy nguyên nhân hay gặp hơn:
> 
> 1. **Chất lượng nước**: Bể không cần cạo rêu, không thay nước, không cho ăn có thể đang tích tụ amoniac, nitrit hoặc nitrat. Đây là nguyên nhân phổ biến nhất khiến cá chết dần. Nên test nước (kit amoniac, nitrit, nitrat, pH) và thay 20–30% nước nếu chỉ số cao.
> 2. **Thiếu thức ăn**: Bống có thể sống nhờ rêu, màng sinh học và thức ăn tự nhiên trong bể, nhưng cá mún, kiếm, bảy …

### stocking-04 · tank · ours wins (6.5 · 4)

**Asked:** Bể tôi nuôi chung được những cá nào, khi cá thả thêm cứ chết dần?

**Judge:** X reads the tank's history, links the repeated deaths to unstable water, says to stop adding fish and test first, and flags that the bống relies on algae, though it doesn't name compatible fish. Y does offer a fish list, but it is generic, muddles Vietnamese fish names, re-suggests species that already died, and asks for details the app already holds. / Y dùng đúng lịch sử bể (mún, kiếm, bảy màu chết dần, bống ăn rêu), chỉ ra nguyên nhân nước chưa ổn định và cho thứ tự bước rõ, dù chưa nêu được loài nuôi chung và thiếu số liệu cụ thể. X có danh sách cá nhưng chung chung, bỏ qua bể của họ, gọi sai tên cá và gợi ý ghép cá không hợp.

**Ours lacks:** figures, too-thin. **Plain lacks:** tank-fit, too-long, wrong, local.

**Ours** (read 3 pages, stopped at the calls limit):

> Mình chưa kiểm tra được cặp cá nào hợp với bống vàng, vì bạn chưa nói sẽ thả thêm loài nào. Điều đáng lo hơn là việc mún, kiếm và bảy màu chết dần, vì đó là dấu hiệu thường gặp của nước chưa ổn định (amoniac hoặc nitrit chưa được vi khuẩn xử lý), chứ không phải do từng loài. Bể đang chỉ có một bống vàng mà nó chủ yếu ăn rêu, nên bạn nên kiểm tra nước trước khi thả thêm.
> 1. Ngừng thả thêm cá mới cho đến khi nước ổn định.
> 2. Dùng bộ test để đo amoniac và nitrit; nếu có số đo, thay một phần nước ngay.
> 3. Nếu bể mới set, chạy chu trình nitơ trước khi thả cá; cách này thường mất từ vài tuần đến và…

**Plain** (2273 characters):

> Cá chết dần mỗi lần thả thêm thường không phải do loài không hợp nhau mà chủ yếu do **chất lượng nước**. Bạn nên kiểm tra các điểm sau trước.
> 
> ## 1. Nguyên nhân hay gặp nhất
> 
> - **Nước chưa ổn định (chu trình nitơ chưa hoàn thiện):** Mỗi lần thả thêm cá, lượng amoniac và nitrit tăng đột ngột, làm cá yếu và chết. Bạn nên dùng bộ test (API hoặc tương tự) để đo NH3/NH4+ và NO2-. Hai chỉ số này phải bằng 0. NO3- nên dưới 20-40 ppm.
> - **Quá tải cá:** Quy tắc tham khảo là khoảng 1 inch (2,5 cm) cá trưởng thành cho 1 gallon (3,8 lít) nước, nhưng thực tế nên thưa hơn. Bể nhỏ dưới 60 lít chỉ nên nuôi v…

### stocking-05 · post · plain wins (4.75 · 7.75)

**Asked:** Em mới mua thêm mấy con cá chép thả chung với cá vàng, mà nó tấn công cá vàng kinh quá, một con chết rồi. Hỏi cửa hàng thì họ bảo thả chung được em mới mua. Giờ em nên làm sao, chép với cá vàng có nuôi chung được không?

**Judge:** Y trả lời thẳng là không nên nuôi chung, giải thích vì sao và đưa ra các bước rõ ràng gồm tách cá, xử lý vết thương với liều muối, vớt cá chết và thay nước. X né câu trả lời chính, lộ chi tiết công cụ, còn để ngỏ khả năng ghép lại và không có con số hay bước xử lý nước nào. / X answers plainly that they should not be kept together, then gives ordered steps: separate them, check wounds, remove the dead fish, test and change water, and watch; its reasoning is slightly overgeneralized but the advice is safe. Y hedges, mentions an unused internal tool, leans towards reuniting the fish, and gives vague care with no figures.

**Ours lacks:** diagnosis, figures, follow-up, plan, local. **Plain lacks:** –.

**Ours** (read 2 pages, stopped at the calls limit):

> Nhiều khả năng cá chép lớn hơn và hung hơn cá vàng nên nó đang dồn và cắn cá vàng, đặc biệt là cá vàng có vây dài, bơi chậm. Mình chưa kiểm tra cặp này bằng công cụ tank-mates, nên chưa khẳng định được chúng có nuôi chung được trong bể của bạn hay không. Cẩm nang có nói cá vàng hiền nhưng hay cắn vây nhau khi bị stress, bể đông hoặc tranh ăn, và không nên nuôi chung với cá nhỏ đủ nhỏ để chúng nuốt. Cẩm nang cũng cho rằng cá koi và cá vàng là họ hàng trong nhà cá chép, nên việc nuôi chung không phải là điều cấm, nhưng koi lớn rất nhanh, cần bể rất rộng.
> 1. Vớt con cá chép ra ngay, nhốt riêng h…

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

### stocking-05 · tank · plain wins (6 · 7)

**Asked:** Cá chép mới thả cứ tấn công cá vàng trong bể tôi, có nuôi chung được không?

**Judge:** X is firm about removing the chép today and acknowledges the dead goldfish, but it treats the chép as a koi and leans on koi numbers. Y answers about the actual fish, explains the behaviour naturally and adds a temporary divider and wound care, though it ignores the death and is softer on urgency. / X addresses the actual cá chép, explains the size and temperament mismatch, and gives separation, injury care, and long-term housing, though it ignores the dead goldfish and gives no doses. Y is more decisive and uses the death note, but it answers from koi data, overstates the cause of death, and offers no care for injured fish.

**Ours lacks:** diagnosis, local. **Plain lacks:** tank-fit, figures.

**Ours** (read 1 pages, stopped at the calls limit):

> Không nên nuôi chung: Cá koi có thể ăn Cá vàng. Koi trưởng thành dài tới khoảng 90 cm, còn cá vàng khoảng 20 cm, nên con chép mới thả đang tấn công và có thể ăn cá vàng; con cá vàng đã chết là hậu quả của việc này. Cẩm nang cũng ghi koi cần ít nhất khoảng 950 lít nước cho mỗi con khi lớn, nên bể nhà thường không đủ chỗ cho chúng.
> 1. Vớt cá chép ra khỏi bể cá vàng ngay hôm nay và cho vào bể riêng hoặc hồ ngoài trời.
> 2. Kiểm tra cá vàng còn lại xem có vết cắn, vây rách hay đốm trắng không.
> 3. Cho cá vàng còn lại ăn bình thường và theo dõi xem có bỏ ăn hay nổi đầu không.
> 4. Nếu muốn nuôi koi, hã…

**Plain** (1280 characters):

> **Thường thì không nên nuôi chung.** Cá chép lớn nhanh, có thể dài 30-60 cm hoặc hơn, khỏe và hiếu động hơn nhiều. Cá vàng bơi chậm, vây dài, dễ bị thương, nên cá chép thường xuyên đuổi, húc hoặc cắn vây cá vàng. Ngay cả khi cá chép còn nhỏ, sau vài tháng nó sẽ lớn và gây hại nhiều hơn.
> 
> **Bạn nên làm ngay:**
> 
> 1. **Tách cá chép ra** nếu có thể, bằng một bể riêng hoặc ngăn tạm bằng lưới/tấm nhựa trong bể.
> 2. **Kiểm tra cá vàng**: tìm vết cắn, rách vây, trầy xước, đốm đỏ hoặc nấm trắng. Nếu có vết thương, nên thay một phần nước và theo dõi, có thể dùng thuốc xanh methylen hoặc muối (liều nhẹ) đ…

### stocking-06 · post · plain wins (5.75 · 7)

**Asked:** Em vừa set cái bể cubic theo tư vấn, đáy bể để 5 con nerita. Ra cửa hàng thấy cá kiếm mắt đỏ đẹp quá nên mua thử vài con. Mấy con mún đỏ sắp đẻ nên em đang tính chuyển sang chỗ khác vì sợ bị ăn hết trứng, cá con, bắt đầu thấy ngại rồi. Bể có lọc thác, có cần thay nước hàng tuần không vì thấy nước có mùi hôi?

**Judge:** Y sửa ngay hiểu lầm về trứng, trả lời thẳng là nên thay 20–30% mỗi tuần, chỉ rõ cách rửa lọc thác và có nêu khả năng bể cubic quá đông. X có bước xử lý mùi tốt và thẻ loài cho thấy cá kiếm cần bể lớn, nhưng phần chữ không cảnh báo điều đó, lại nói không cần thay nước hàng tuần và vẫn nhắc nerita ăn trứng. / X sửa đúng hiểu lầm về trứng (mún và kiếm đẻ con), trả lời thẳng là nên thay 20–30% mỗi tuần và nêu nguyên nhân bể mới chưa có vi sinh, chỉ thiếu cảnh báo cá kiếm quá lớn cho bể cubic. Y có bước xử lý mùi cụ thể và hẹn test lại, nhưng trả lời lửng lơ về lịch thay nước, nhắc đến trứng sai và chỉ để thẻ loài ngầm cho thấy cá kiếm cần bể lớn.

**Ours lacks:** tank-fit, follow-up, diagnosis. **Plain lacks:** tank-fit.

**Ours** (read 2 pages, stopped at the tools limit):

> Mùi hôi ở bể mới thường đến từ xác cá, ốc hoặc thức ăn thừa đang phân hủy, hay từ nền chưa ổn định. Cẩm nang không đặt lịch thay nước cố định cho mọi bể, nên bạn không cần thay mỗi tuần theo kiểu cứng nhắc, nhưng nên kiểm tra nước trước khi quyết định.
> 1. Vớt sạch xác, lá mục và thức ăn thừa, kể cả chỗ khuất sau đá và lũa.
> 2. Thay khoảng 30 đến 50 phần trăm nước, vừa thay vừa hút nền. Nước mới phải xử lý clo trước khi cho vào bể.
> 3. Test amoniac và nitrit. Nếu còn khác 0, thay nước thêm và cho cá ăn ít lại.
> 4. Khi cá mún hoặc cá kiếm sắp đẻ, chuyển cá cái sang hộp đẻ. Cá lớn có thể ăn cá bột,…

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

### stocking-06 · tank · ours wins (7.75 · 5.25)

**Asked:** Mún trong bể tôi sắp đẻ, có cần tách ra không, và có phải thay nước hàng tuần không?

**Judge:** X dùng đúng tình trạng bể: có cá kiếm ăn cá con, bể mới có mùi hôi cần đo amoniac/nitrit, không chuyển bể cá mẹ khi sát ngày đẻ và có bước làm theo thứ tự. Y gọn và đúng phần lớn nhưng chung chung, bỏ qua mùi hôi của bể mới và đưa mốc 1–2 ngày không đáng tin. / Y nắm đúng tình huống của bể: có cá kiếm lớn ăn cá con, bể mới có mùi hôi cần kiểm tra amoniac và nitrit, nên tách ngay trong bể thay vì chuyển bể lúc sát ngày đẻ, kèm các bước theo thứ tự và điều cần theo dõi. X đúng ở mức chung và có số liệu rõ, nhưng bỏ qua mùi hôi và tình trạng bể mới, nên không chạm tới rủi ro lớn nhất.

**Ours lacks:** figures. **Plain lacks:** tank-fit, diagnosis, follow-up, local.

**Ours** (read 2 pages, stopped at the tools limit):

> Mún ở đây là cá platy, và trong bể còn có cá kiếm lớn hơn. Cá lớn thường ăn cá con, kể cả con của chính mình, nên bạn nên chuẩn bị chỗ tách, nhưng đừng bắt cá mẹ chuyển bể khi đã sát ngày đẻ vì dễ gây sẩy thai hoặc chết.
> 1. Đặt một vách ngăn ngay trong bể hoặc treo một hộp đẻ để cá mẹ ở riêng.
> 2. Thêm chỗ trốn cho cá con như rêu java hoặc rong đuôi chó, hoặc dùng hộp đẻ đáy nghiêng.
> 3. Khi cá đẻ xong, vớt cá mẹ ra cùng những con chết lưu, để cá mẹ hồi sức một hai ngày rồi thả lại.
> 4. Cho cá con ăn artemia mới nở hoặc cám bột mịn, chia nhiều bữa nhỏ và không để thức ăn thừa.
> Về thay nước: cẩm …

**Plain** (1246 characters):

> Bạn nên **tách mún mẹ ra** nếu muốn giữ được cá con. Mún là loài đẻ con, và cá lớn thường ăn cá con ngay sau khi chúng được sinh ra.
> 
> **Cách tách và chuẩn bị:**
> - **Dùng lồng đẻ (breeder box)** treo trong bể hoặc **bể nhỏ riêng** có cây thủy sinh dày như rêu java, rong đuôi chó để cá con có chỗ trốn.
> - **Nhận biết sắp đẻ:** bụng to và vuông, có một đốm đen gần gốc vây hậu môn (gravid spot) sẫm dần. Thường khi thấy vậy thì còn khoảng 1–2 ngày.
> - **Sau khi đẻ:** đưa mẹ về bể chính hoặc để trong lồng đẻ, và lấy cá con ra khi cần.
> - **Cho cá con ăn:** artemia con, bột thức ăn cho cá con, hoặc thứ…

### stocking-07 · post · tie or split (5.5 · 5.75)

**Asked:** Bể nhà em kích cỡ 60x35x40, thả neon và sóc đỏ khoảng bao nhiêu con thì được ạ?

**Judge:** Y đưa ra được số lượng cho cả hai loài, mức 20-25 neon cộng 6-8 cá nhỏ khá hợp với bể 84 lít, kèm các bước cơ bản, dù gán sóc đỏ là Corydoras là sai và chỉ rào đón nhẹ. X trung thực hơn khi không đoán bừa, nhưng bỏ ngỏ nửa câu hỏi, chỉ cho 10-12 neon khi chưa tính loài thứ hai, và phần cảnh báo nước mát có thể lạc loài. / X gives a full, usable answer and a sensible neon count, but it confidently treats sóc đỏ as Corydoras, so half its stocking advice may be for the wrong fish. Y's neon count is conservative and it leaves sóc đỏ unanswered, but it honestly asks which species is meant and warns of a possible temperature clash, which is safer.

**Ours lacks:** too-thin, figures, plan. **Plain lacks:** wrong, local.

**Ours** (read 2 pages):

> Với bể 60x35x40 (khoảng 84 lít), bạn có thể thả khoảng 10 đến 12 con neon xanh. Neon là loài đàn, nên nuôi ít nhất 6 con, và bể này còn thưa, chưa đông. Mình chưa rõ "sóc đỏ" là loài nào, vì handbook có vài loài tên gần giống. Nếu bạn nói rõ tên đầy đủ hoặc tên khoa học, mình sẽ kiểm tra xem hai loài có sống chung được không và thả bao nhiêu con. Lưu ý: nếu là chạch sóc đuôi đỏ, loài này cần nước mát khoảng 15 đến 21°C, còn neon cần 21 đến 25°C, nên hai loài khó nuôi chung.
> 
> [Công cụ: Nuôi chung (đã điền sẵn: ca=ca-neon-xanh:10, l=60, w=35, h=40)]
> 
> [Gợi ý hỏi tiếp] Sóc đỏ là loài nào, bạn có …

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

### stocking-07 · tank · tie or split (5 · 4)

**Asked:** Bể của tôi thả được bao nhiêu con neon và sóc đỏ?

**Judge:** X uses the real tank (about 84 L), names its reading of 'sóc đỏ', and warns about chasing, fin-nipping and temperature mismatch, though it gives no clear neon count. Y ignores the tank, asks for its size, guesses Corydoras and shrimp, and its 20-25 neon figure is for a 60 L tank on a likely wrong species. / Y dùng đúng bể 84 lít và chọn một cách hiểu rõ ràng, nhưng sai về nhiệt độ và đàn 6 con, lại không chốt số neon nên người hỏi không biết thả bao nhiêu. X bỏ qua kích thước bể và hỏi lại dung tích, nhưng vẫn đưa ra con số cụ thể, an toàn và dùng được (20–25 neon, 6–8 cá đáy), nên nhỉnh hơn.

**Ours lacks:** figures, plan, local, wrong. **Plain lacks:** tank-fit, wrong, too-long, diagnosis.

**Ours** (read 2 pages):

> Nuôi chung được, nhưng cần để ý: chạch sóc đuôi đỏ có thể rượt đuổi cá neon xanh và hay cắn vây. Mình hiểu "sóc đỏ" là chạch sóc đuôi đỏ; nếu bạn nói loài khác thì cho mình biết. Bể 60 × 35 × 40 cm (khoảng 84 lít) đủ cho đàn 6 con mỗi loài, nhưng đàn 6 chạch đã chiếm khoảng 79% sức chứa, nên nên thả neon ít hơn hoặc chọn một loài. Hai loài cũng khác nhiệt độ: chạch sóc chịu tốt ở 15–21°C, còn neon cần 21–25°C, nên nếu nuôi chung bạn phải tìm mức nhiệt giao nhau rất hẹp. Bể của bạn hiện chưa có cá nào, nên bạn có thể chọn đàn neon hoặc đàn chạch trước rồi thêm loài kia sau.
> 
> [Công cụ: Nuôi chu…

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

**Judge:** X gọn, mức giảm cá thực tế hơn và có lưu ý cây ráy, nhưng bỏ sót chu trình nitơ, lọc/sục khí và khử clo, những thứ người mới cần nhất. Y hơi dài, gợi ý neon cho 4 lít là chưa hợp, song giải thích vì sao một tuần chưa nói lên gì và cho kế hoạch chăm sóc đầy đủ hơn. / X giải thích rõ chu trình nitơ và đưa kế hoạch đầy đủ hơn với giảm cá, lọc bọt biển, test nước và thay 30-50% mỗi tuần, dù hơi chung chung và thừa máy sưởi. Y gọn, có nhắc đến cây ráy nhưng bỏ sót lọc và thay nước định kỳ, nên chưa đủ để giữ bể 4 lít ổn lâu dài.

**Ours lacks:** plan, figures, too-thin. **Plain lacks:** too-long, local, tank-fit.

**Ours** (read 1 pages):

> Bể 4 lít nuôi 7-8 con là quá tải, nên lâu dài sẽ không ổn dù một tuần đầu vẫn bình thường. Cá thải ra amoniac và nitrit, bể nhỏ thì các chất này tăng rất nhanh và nhiệt độ, pH dao động mạnh. Cây ráy và chùm xương cá giúp hấp thụ một phần, nhưng không đủ để bù lượng cá này. Đây là suy đoán từ thể tích bể và số lượng cá, bạn nên kiểm tra nước để chắc chắn.
> 1. Giảm số cá xuống khoảng 2-3 con nhỏ, hoặc chỉ 1-2 con nếu là loài lớn hơn.
> 2. Trong vài tuần đầu, test amoniac và nitrit vài ngày một lần, nếu có chỉ số thì thay 20-30% nước.
> 3. Cho ăn lượng cá ăn hết trong khoảng 2 phút, một lần mỗi ngày,…

**Plain** (2035 characters):

> Với bể 4 lít và 7-8 con cá, **lâu dài thì chưa ổn**. Một tuần đầu chưa nói lên được gì, vì các vấn đề của bể nhỏ thường xuất hiện sau vài tuần.
> 
> **Vì sao bể nhỏ dễ có vấn đề:**
> - **Chất thải tích tụ nhanh:** Cá thải amoniac và nước nhanh bẩn. Lượng nước ít nên amoniac, nitrit tăng rất nhanh, có thể gây độc cho cá.
> - **Chu trình nitơ chưa ổn định:** Bể mới thường cần 4-6 tuần để vi khuẩn có lợi phát triển đủ. Cây thủy sinh giúp hấp thụ một phần chất thải nhưng không thay thế được vi khuẩn lọc.
> - **Nhiệt độ dao động mạnh:** Nước ít nên thay đổi theo nhiệt độ phòng rất nhanh, dễ gây sốc.
> - **Thi…

### stocking-08 · tank · ours wins (6.75 · 3)

**Asked:** Bể của tôi đang thả 7-8 con cá, lâu dài có ổn không?

**Judge:** X dùng đúng bể 4 lít, kết luận rõ là khó ổn lâu dài và đưa ra các bước cụ thể, dù con số 115-210 lít vô lý và chưa nhắc bể mới 1 tuần chưa ổn định vi sinh. Y không biết bể 4 lít, chỉ nói chung chung về bể 40-60 lít rồi hỏi ngược lại, nên không giúp người nuôi quyết định. / Y dùng đúng bể 4 L và kết luận rõ là quá chật, kèm các bước làm, dù con số bể 115-210 lít vô lý, nhịp đo quá thưa và bỏ sót rủi ro bể mới 1 tuần. X không dùng dữ liệu bể, bàn về bể 40-60 lít và chủ yếu hỏi lại nên người nuôi không biết bể mình đang quá tải nặng.

**Ours lacks:** tank-fit, figures, follow-up. **Plain lacks:** tank-fit, plan, asks-only, diagnosis.

**Ours** (read 1 pages, stopped at the calls limit):

> Với bể 4 lít và 7-8 con cá, mình nghĩ lâu dài sẽ khó ổn. Theo cẩm nang, quy tắc ước lượng là khoảng 1 cm cá cho 1,5 lít, và quy tắc này chỉ dùng cho cá nhỏ trong bể đã ổn định, có vi sinh và cây. Với 4 lít, tổng chiều dài cá chỉ khoảng 2-3 cm, trong khi 7-8 con dù nhỏ cũng đã vượt xa mức đó. Mình chưa biết loài cá nên chưa chắc chắn về mức độ quá tải, nhưng khả năng cao là bể đang chật.
> 1. Đo lại kích thước trong bể (dài × rộng × cao) để xác nhận đúng 4 lít, vì bản ghi chỉ ghi thể tích.
> 2. Ghi rõ tên từng loài và tra cỡ trưởng thành của chúng, không tính theo cỡ lúc mua.
> 3. Đo ammonia, nitrit…

**Plain** (1607 characters):

> Câu trả lời phụ thuộc vào **kích thước bể**, **loài cá** và **hệ lọc**. Bạn cho mình biết thêm thì mình đánh giá cụ thể hơn được.
> 
> **Vài tiêu chí để kiểm tra:**
> 
> 1. **Thể tích bể:** Quy tắc phổ biến là khoảng 1 lít nước cho 1 cm cá trưởng thành (tính cả chiều dài thân, không tính đuôi). Nhiều loài cá nhỏ như neon hay tetra thường được nuôi theo đàn, nên 7-8 con nhỏ có thể ổn trong bể 40-60 lít. Còn nếu là cá lớn như cichlid, cá vàng hay cá la hán thì 7-8 con có thể là quá đông.
> 
> 2. **Loài cá:** Cá đàn (neon, tetra, cá bảy màu) cần nhiều con cùng loài và thường thoải mái hơn khi đông. Cá lãnh …

### stocking-09 · post · plain wins (4.75 · 6.5)

**Asked:** Bể dài 80, rộng 35, cao 45 cm thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** X cảnh báo đúng nguy cơ ông tiên ăn neon, nhưng sai khi chê bể không đủ và đòi nuôi 6 con, đồng thời gần như không đưa ra lựa chọn cụ thể. Y quá lạc quan ở kết luận nhưng vẫn nêu rủi ro, đánh giá bể sát thực tế và cho cách làm dùng được ngay: thả neon cùng lúc khi ông tiên còn nhỏ, trồng nhiều cây và theo dõi rượt đuổi. / X trả lời đúng bể của người hỏi, nêu rõ nguy cơ neon bị ăn khi ông tiên lớn và cách giảm rủi ro như trồng nhiều cây, thả neon lớn, tuy kết luận hơi lạc quan. Y đúng ở cảnh báo chính nhưng từ chối cứng, đưa yêu cầu quá mức (bể 100 cm, 6 con) và gần như không có phương án cụ thể cho bể hiện tại.

**Ours lacks:** tank-fit, plan, wrong, too-thin. **Plain lacks:** follow-up.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên dài khoảng 15 cm và có thể ăn cá neon xanh chỉ khoảng 3 cm. Cá ông tiên cũng hơi dữ, hay rượt đuổi cá nhỏ, và bể 80 x 35 x 45 cm chưa đủ cho chúng. Cá ông tiên cần bể dài từ 100 cm và nên nuôi theo đàn từ 6 con.
> 1. Nếu giữ neon xanh, bạn nên bỏ cá ông tiên khỏi kế hoạch này.
> 2. Nếu muốn nuôi ông tiên, chọn bể dài từ 100 cm trở lên và nuôi từ 6 con.
> 3. Chọn cá bạn cùng bể có kích thước lớn, không đi kèm neon nhỏ.
> Bạn có thể kiểm tra lại bằng công cụ tank-mates trước khi mua cá.
> 
> [Công cụ: Nuôi chung]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá…

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

### stocking-09 · tank · plain wins (4.25 · 7)

**Asked:** Bể của tôi thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** Y gives the realistic answer: the combination is workable, angels may eat neons and turn aggressive when spawning, and it explains how to reduce those risks, though it never calculates that this tank is about 126 L. X correctly flags predation and uses the tank size, but its flat ban rests on overly strict size and group rules and it offers no named alternative or steps. / X correctly says this common combo is workable, names the real risks (large angels eating neons, aggression when spawning) and gives ways to reduce them, though it never calculates that this tank is about 126 litres. Y does use the tank's size and flags the predation risk, but its flat no rests on overly rigid rules (100 cm, 6 angels) and leaves only a vague next step.

**Ours lacks:** plan, too-thin, wrong. **Plain lacks:** tank-fit, follow-up, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá ông tiên (khoảng 15 cm) có thể ăn cá neon xanh (khoảng 3 cm) và hay rượt đuổi chúng. Bể 80 x 35 x 45 cm của bạn cũng chưa đủ, vì cá ông tiên cần bể dài từ 100 cm và nên nuôi theo đàn từ 6 con, không phải 2 con. Nếu muốn giữ neon xanh, bạn nên chọn cá hiền, cỡ nhỏ tương đương và thả cùng bể đã được kiểm tra trên cẩm nang.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 80×35×45 cm]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon xanh (3 cm).
> Cá ông tiên hơi dữ, có thể rượt đuổi Cá neon xanh. Cần bể rộng, nhiều chỗ trốn.
> Mức đầy bể: …

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

### stocking-10 · post · plain wins (4.75 · 6.25)

**Asked:** Bể 60x30x36 cm của mình đang nuôi 12 con neon xanh, thả thêm 1 con cá betta được không?

**Judge:** Y gives the more realistic verdict: this pairing can work in a 65 L tank with plants, gentle flow and a clear separation trigger, though its stocking order and some names are wrong. X is concise and safe but flatly overstates the incompatibility and offers little beyond an impractical separate-tank option. / X gives the realistic keeper's answer: it is possible in about 65 litres with cover, gentle flow and 1–2 weeks of watching, with a clear point to separate them, despite a wrong release order and some odd names. Y is a thin, tool-driven flat no with an impractical suggestion to move the neons to another tank, and it then contradicts itself by advising what to watch after adding the betta.

**Ours lacks:** plan, wrong, too-thin, tank-fit. **Plain lacks:** too-long, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài. Bể 60x30x36 cm của bạn còn thưa (khoảng 36%), nên vấn đề không nằm ở diện tích mà ở tính cách của betta. Neon xanh nhỏ và hiền, dễ bị betta rượt, cắn vây hoặc ăn nhầm.
> Nếu bạn muốn betta, có thể nuôi riêng một con trong bể này (thường từ khoảng 20 lít trở lên, kèm lọc nhẹ và nhiệt vừa phải), rồi giữ đàn neon ở bể khác. Nếu muốn giữ chung bể, hãy chọn cá hiền có kích cỡ tương tự và kiểm tra lại bằng công cụ trước khi thả.
> Hãy theo dõi đàn neon sau khi thả: nếu có con bị cắn vây hoặc nấp suốt, nên tách betta ng…

**Plain** (1406 characters):

> **Có thể nuôi được**, bể 60x30x36 cm (khoảng 65 lít) đủ rộng cho 1 con betta cùng 12 con neon. Neon là cá hiền, đi đàn, ít khi gây hấn, và betta thường sống chung được với chúng. Tuy nhiên, bạn nên lưu ý mấy điểm sau:
> 
> **Điều kiện để sống chung tốt:**
> - **Nhiều chỗ ẩn nấp:** Trồng thêm cây thủy sinh như dương xỉ Java, rêu Java, trâm bầu, hoặc đặt đá, lũa. Betta cần chỗ tránh khi bị rượt đuổi.
> - **Dòng nước nhẹ:** Betta bơi chậm và không thích dòng chảy mạnh, nên chọn lọc không quá mạnh hoặc để bớt vòi phun.
> - **Nhiệt độ:** Cả hai loài đều ưa nước ấm, khoảng 24–27°C, nên thường dùng máy sưởi l…

### stocking-10 · tank · ours wins (6.75 · 3)

**Asked:** Bể của tôi thả thêm 1 con cá betta được không?

**Judge:** X answers directly for this 60 cm tank with 12 neons and gives a clear choice: keep the betta in a separate tank, though it is a little too absolute. Y wrongly assumes a betta is already there, asks for details the app already holds, and never gives a clear answer about adding one to this tank. / Y uses the real tank and gives a clear, slightly over-cautious verdict for betta with 12 neon, plus a practical alternative of a separate tank. X ignores the tank data, assumes a betta already exists, uses the odd term 'cá tế bào' and ends by asking for details the app already holds.

**Ours lacks:** figures, follow-up. **Plain lacks:** tank-fit, asks-only, too-long, plan, local.

**Ours** (read 0 pages):

> Không nên nuôi chung: cá betta (cá xiêm) hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài. Bể 60×30×36 cm hiện có 12 cá neon xanh; betta dễ rượt và cắn vây đàn neon, còn đàn neon thì làm betta căng thẳng. Nếu muốn nuôi betta, bạn nên dành một bể riêng cho nó và giữ bể neon như hiện tại.
> 
> [Gợi ý hỏi tiếp] Cá betta nên nuôi bể bao nhiêu lít? · Cá neon xanh có hợp với cá nào khác không? · Bể 60 cm nuôi được những loài cá nào?

**Plain** (1081 characters):

> **Thường thì không nên**, đặc biệt nếu bể đang có một con betta đực. Betta đực rất hung dữ với các con đực khác và sẽ đánh nhau đến khi bị thương nặng hoặc chết. Chúng cũng có thể căng thẳng và bệnh tật khi phải sống chung với cá khác.
> 
> **Một số trường hợp cụ thể:**
> 
> - **Betta đực + betta đực:** Không nên. Gần như chắc chắn sẽ đánh nhau.
> - **Betta đực + betta cái:** Chỉ có thể thử trong bể rất lớn (thường từ 80 lít trở lên), có nhiều cây thủy sinh và chỗ ẩn nấp, và phải quan sát liên tục. Con cái có thể bị đực rượt đuổi hoặc cắn. Nếu thấy cá cái bị thương hoặc stress, phải tách ra ngay.
> - **B…

### algae-12 · post · not judged

**Asked:** Bể 60x30x36 của mình set được 4 tuần, không CO2, trồng rêu java, ráy nana với dương xỉ java, đèn LED bật liền 8 tiếng mỗi ngày, châm phân nước 1 lần/tuần. Lá ráy bắt đầu có đốm rêu xanh. Có nên chia đèn ra làm hai đợt sáng chiều, mỗi đợt không quá 4 tiếng không?

**Ours** (read 2 pages, stopped at the error limit):

failed: Request timed out.

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

### algae-12 · tank · ours wins (7.75 · 4)

**Asked:** Bể của tôi có nên chia đèn làm hai đợt, mỗi đợt không quá 4 tiếng không?

**Judge:** X gives the right verdict for this tank: 8 continuous hours is within range, and with no CO₂ and easy plants, splitting matters little and isn't needed. Y says yes generically, overstates the benefits, covers irrelevant CO₂ timing, and asks whether the tank is planted instead of using its details. / Y uses the tank's real details: 8 continuous hours is already fine, no CO₂ and easy plants mean splitting matters little, so no change is needed and there is a simple way to compare if they want to try. X is generic, oversells splitting with shaky benefits, mentions CO₂ and reef tanks irrelevantly, and asks about a setup it never used.

**Ours lacks:** follow-up, figures. **Plain lacks:** tank-fit, asks-only, too-long.

**Ours** (read 2 pages):

> Chia đèn thành hai đợt 4 tiếng vẫn được, nhiều người làm vậy và cẩm nang không coi đó là sai. Theo cẩm nang, mức hay được khuyên là 6 đến 8 tiếng mỗi ngày, và bể của bạn đang bật liền 8 tiếng nên đã nằm trong khoảng này. Bạn không cần chia đèn; nếu muốn thử, hãy giữ cố định khung giờ, so tốc độ lên của rêu java, ráy nana và dương xỉ java rồi chọn cách cho kết quả tốt hơn. Vì bể chưa dùng CO₂ và các cây này khá dễ, việc chia đèn ít ảnh hưởng; khi có rêu bụi xanh hoặc cây chậm lớn, hãy kiểm tra phân và ánh sáng trước.
> 
> [Trích: Bể thủy sinh nên bật đèn mấy tiếng mỗi ngày, liên tục hay chia buổi …

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

