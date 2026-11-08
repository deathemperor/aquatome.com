# The chat against plain Claude, on hard problems

2026-11-08, `packages/engine/scripts/chat-vs-plain.ts`. 48 questions (all of them) from public Vietnamese hobby forums, reworded with no names (`packages/engine/scripts/hard-questions.vi.json`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and limits at commit `9c51eba48`, claude-haiku-5-5, over https://aquatome.com's handbook. Plain: claude-haiku-5-5, the same effort, no system prompt, no tools, no handbook. Judge: claude-opus-5-5 through the Claude CLI, rubric version 2 (`chat-vs-plain-lib.ts`).

- **post:** both answer the whole forum post. **tank:** both get a short question. The eval saves the post's tank for the reader (size, fish, plants, substrate, age; the light, CO₂ and fertiliser as the tank's notes), and ours sees only what the chat's code reads of a saved tank; plain Claude sees only the question. The judge is told everything the post said about the tank.
- **Blind, as far as it goes:** the judge isn't told which answer is ours, and both lose the site's name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.
- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.
- **Failed:** when one side failed (ours: the limits ran out, a call timed out) and the other answered, that reader got an error: the other side wins it on every count, with no score. A failed answer is kept in the cache, so a rerun is the same run; `--retry-failed` asks again.
- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).
- **Cost** per question, at list price: ours $0.0049, plain $0.0011. The judge runs on the owner's Claude accounts.

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post | 16 / 21 / 11 of 48, ours failed 1 | 5.9 · 6.1 | 15–16 | 14–22 | 14–16 | 17–12 | 12–15 | 36/47 | 3 / 44 / 1 |
| tank | 30 / 11 / 7 of 48 | 6.0 · 4.7 | 27–8 | 25–4 | 30–10 | 17–9 | 20–3 | 41/48 | 15 / 33 / 0 |

## Time

- **post:** 48 turns, 1 failed (on the forced last call 1). The turn: median 17.2 s, 90th percentile 20.6 s. The call that wrote the answer: median 9.9 s (90th 13.4 s), 1871 tokens out, with 19.9 s left for it. A reading call: median 2.3 s (90th 3.5 s).
- **tank:** 48 turns, 0 failed. The turn: median 16.3 s, 90th percentile 19.3 s. The call that wrote the answer: median 8.9 s (90th 12.3 s), 1715 tokens out, with 19.9 s left for it. A reading call: median 1.8 s (90th 2.8 s).

## By problem

| | Ours / plain / tie or split | Score: ours · plain | correct | fits | actionable | grounded | local | Orders agree | Ours stopped: answered / at a limit / failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| post · algae | 3 / 5 / 4 of 12 | 6.1 · 6.5 | 3–4 | 3–3 | 3–4 | 6–2 | 4–1 | 8/12 | 0 / 12 / 0 |
| post · setup | 2 / 5 / 2 of 9, ours failed 1 | 5.2 · 6.5 | 2–5 | 2–5 | 3–5 | 1–5 | 1–5 | 6/8 | 0 / 8 / 1 |
| post · cycling | 3 / 3 / 2 of 8 | 6.0 · 6.2 | 3–1 | 2–5 | 1–2 | 4–0 | 3–4 | 6/8 | 2 / 6 / 0 |
| post · sick | 4 / 4 / 1 of 9 | 6.3 · 5.9 | 3–3 | 3–4 | 4–2 | 2–2 | 1–3 | 8/9 | 1 / 8 / 0 |
| post · stocking | 4 / 4 / 2 of 10 | 5.8 · 5.3 | 4–3 | 4–5 | 3–3 | 4–3 | 3–2 | 8/10 | 0 / 10 / 0 |
| tank · algae | 10 / 2 / 0 of 12 | 6.3 · 4.7 | 9–1 | 7–1 | 10–2 | 6–2 | 6–0 | 12/12 | 3 / 9 / 0 |
| tank · setup | 4 / 3 / 2 of 9 | 5.7 · 4.5 | 4–2 | 4–1 | 4–3 | 3–0 | 3–1 | 7/9 | 1 / 8 / 0 |
| tank · cycling | 4 / 1 / 3 of 8 | 6.2 · 5.2 | 4–1 | 1–1 | 5–1 | 3–1 | 4–0 | 5/8 | 4 / 4 / 0 |
| tank · sick | 5 / 4 / 0 of 9 | 5.7 · 5.3 | 3–4 | 4–1 | 5–3 | 2–3 | 2–1 | 9/9 | 2 / 7 / 0 |
| tank · stocking | 7 / 1 / 2 of 10 | 6.0 · 4.2 | 7–0 | 9–0 | 6–1 | 3–3 | 5–1 | 8/10 | 5 / 5 / 0 |

## What each lacks, as the judge tagged it

| | Ours | Plain |
| --- | --- | --- |
| post | tank-fit 29, figures 21, diagnosis 18, local 15, wrong 14, too-thin 9, follow-up 7, plan 6, off-topic 1, unsafe 1, asks-only 1 | too-long 29, follow-up 18, local 13, wrong 13, diagnosis 12, tank-fit 10, plan 7, figures 3, unsafe 1, off-topic 1, asks-only 1 |
| tank | tank-fit 30, figures 19, diagnosis 14, local 11, follow-up 10, wrong 7, plan 7, too-thin 2 | tank-fit 47, too-long 19, follow-up 17, plan 15, diagnosis 13, asks-only 13, wrong 9, local 6, figures 3 |

Tags: plan, diagnosis, tank-fit, figures, follow-up, local, too-thin, too-long, asks-only, wrong, unsafe, off-topic.

## Errors the judge found

- ours, algae-01 post: Says 7 hours straight is too long, then recommends 8–10 hours a day in total. That gives the tank more light, which feeds hair algae in a new tank with no CO₂.
- ours, algae-01 post: Says to stop Brighty K and Green Brighty Mineral even though the NMC's white new leaves point to a lack of iron or trace elements.
- ours, algae-01 post: Applies the guide's 'tank under two weeks' rule to a tank that has already run more than two weeks, and says to change water less often, without giving a reason.
- ours, algae-01 post: Doesn't mention the algae remover the hobbyist is dosing.
- ours, algae-01 post: "tổng 8 đến 10 tiếng mỗi ngày" and "hai đợt mỗi đợt 4 tiếng": this raises the total light from 7 hours to 8 hours or more while the tank already has hair algae, which goes the wrong way
- ours, algae-01 post: The excerpts come from a guide for Dutch-style tanks (Hà Lan) and don't match a tank with bucep/nmc
- ours, algae-01 post: It doesn't mention the algae-control chemical or the light intensity at 20cm, and it doesn't ask about CO₂
- plain, algae-01 post: 'Thay 30% mỗi 2 ngày là khá nhiều… làm chậm vi khuẩn': in a new planted tank, frequent water changes are standard advice. Cutting to 20–30% a week is not the right advice at this stage.
- plain, algae-01 post: Lists 'rêu' (moss) as a fast-growing plant to compete for nutrients, which is wrong. 'Rau muống nước' is also an odd suggestion for an aquascape.
- plain, algae-01 post: Nerite snails eat little hair algae.
- plain, algae-01 post: "Thay 30% mỗi 2 ngày là khá nhiều... Nên thay 20–30% mỗi tuần": with a newly set tank, the soil leaches nutrients and there is a lot of excess, so frequent water changes are the right call. Cutting to once a week makes algae more likely
- plain, algae-01 post: "làm chậm vi khuẩn nitrat hóa": water changes don't really slow the bacteria much, because the bacteria live on the substrate and in the filter
- plain, algae-01 post: Suggests "rau muống nước, rêu" as fast-growing plants to compete with algae: this is an odd suggestion for an aquascape, and moss doesn't grow fast
- ours, algae-01 tank: "Giảm giờ đèn xuống khoảng 8 đến 10 tiếng": the tank already runs 7h/day, so this would mean more light, not less.
- ours, algae-01 tank: "chia thành nhiều đợt, mỗi đợt không quá 4 tiếng": a split photoperiod is not a standard fix for hair algae, and the figure has no source.
- ours, algae-01 tank: "khi hết rêu chúng sẽ ăn cây và rễ": Amano shrimp and nerite snails don't normally eat healthy plants or roots.
- ours, algae-01 tank: 'Giảm giờ đèn xuống khoảng 8 đến 10 tiếng': bể này đang bật 7h/ngày với Flat One, làm theo thì đèn lại tăng lên, sai hướng khi đang bị rêu tóc.
- ours, algae-01 tank: 'khi hết rêu chúng sẽ ăn cây và rễ': tôm Amano và ốc ăn rêu thông thường không phá cây khỏe, nói vậy là phóng đại.
- ours, algae-01 tank: Nói thiếu CO2 là thủ phạm chính, trong khi bucep/NMC là bể low-tech; nguyên nhân hợp lý hơn là phân mới châm cộng với đèn mạnh.
- plain, algae-01 tank: "Thay 20–30% nước mỗi tuần": for a 2-week-old tank already changing 30% every 2 days, this would mean changing less water.
- plain, algae-01 tank: Liệt kê Otocinclus và ốc Nerite là sinh vật ăn rêu tóc: thực tế chúng hầu như không ăn rêu tóc, chủ yếu ăn rêu bám mặt kính/lá.
- ours, algae-02 post: "nhân 40 ra khoảng 3.300 lumen... ưu tiên loại RGB": tính lumen theo thể tích chỉ là ước lượng thô, và ráy, rêu trong bể không CO2 không cần nhiều sáng đến vậy. Không nói rõ lumen nào hợp với ráy và rêu.
- ours, algae-02 post: Không nhắc đến dòng chảy yếu, một nguyên nhân hay gặp gây BBA trên lá ráy và rêu.
- ours, algae-02 post: Bảo việc ngưng phân không liên quan. Nhưng bể không nền mà không châm phân thì cây yếu đi, và cây yếu thì rêu dễ lấn.
- ours, algae-02 post: "nhân 40 ra khoảng 3.300 lumen... ưu tiên loại RGB": a lumen-per-litre rule is a rough guide, and RGB doesn't matter for ráy and rêu, so the light advice looks more precise than it is
- ours, algae-02 post: "Gỡ tay các chùm BBA": BBA holds on hard and grows back from what's left, so pulling by hand barely works compared with dabbing it
- plain, algae-02 post: "Nuôi tép Amano... kiểm soát rêu chùm đen khá tốt": tép Amano gần như không ăn BBA. Cá bút chì (SAE) thì ăn được, nhưng vẫn không ăn nhiều.
- ours, algae-02 tank: "khoảng 60–70% là do đèn": con số xác suất bịa ra, không có cơ sở nào
- ours, algae-02 tank: "không có cá": tự cho là bể không có cá, trong khi hồ sơ bể không ghi điều này
- ours, algae-02 tank: Xịt oxy già 3% lên lá rồi để 5 phút ngoài nước có thể làm cháy rêu (moss) và lá ráy; câu trả lời không dặn tránh cây
- ours, algae-02 tank: "không có cá": tự suy ra, thông tin bể không hề nói vậy
- ours, algae-02 tank: "khoảng 60–70% là do đèn": con số tự đặt ra, không có căn cứ
- ours, algae-02 tank: "BBA có thể mất vài tháng mới bám chắc": câu này khó hiểu, vì người hỏi đang bị BBA rồi
- plain, algae-02 tank: Hỏi lại người chơi dùng đèn gì, dù hồ sơ bể đã ghi là Chihiros A601 plus
- plain, algae-02 tank: Đưa ốc Nerite, Otocinclus vào danh sách xử lý BBA: hai loài này gần như không ăn rêu chùm đen
- plain, algae-02 tank: Hỏi lại bể dùng đèn gì dù app đã có sẵn thông tin (Chihiros A601 plus)
- ours, algae-03 post: 'Việc thay 30% nước mỗi ngày' – the hobbyist did one 30% water change, not one a day.
- ours, algae-03 post: Says each water change 'đưa thêm dinh dưỡng vào bể'. That is stated as the cause with no basis, and in a 3-day-old tank with aqua soil, frequent water changes are normally recommended.
- ours, algae-03 post: It never considers that water going cloudy after 1–2 days may not be green water (algae) yet.
- ours, algae-03 post: "Thay khoảng 20% một lần mỗi tuần" – hồ mới 3 ngày, nhất là khi trải phân nền, thường cần thay nước thường xuyên hơn trong mấy tuần đầu để xả amoniac nền nhả ra
- plain, algae-03 post: 'Thay bông lọc trong hồ mới có thể làm mất phần lớn vi khuẩn có lợi' overstates the risk: a 3-day-old tank has almost no beneficial bacteria yet.
- plain, algae-03 post: It suggests 'bèo tây', which is water hyacinth and far too big for a small planted tank.
- plain, algae-03 post: It suggests changing water only when tests show ammonia or nitrite. That is not practical for a tank with fresh aqua soil.
- plain, algae-03 post: "bèo tây" – lục bình quá to cho hồ thủy sinh, gợi ý không hợp
- plain, algae-03 post: Lo mất vi sinh do thay bông lọc ở hồ mới 3 ngày là phóng đại, vì hồ gần như chưa có vi sinh
- ours, algae-03 tank: "bật đèn không quá 6 đến 8 giờ mỗi ngày": đèn của họ đang chạy 4 giờ/ngày, nên câu này thực tế khiến họ tăng giờ đèn trong khi bể vừa bị nở tảo.
- ours, algae-03 tank: "bật đèn không quá 6 đến 8 giờ": higher than the user's current 4h/day; for a new tank that has just had green water, the light should stay short
- plain, algae-03 tank: "bật đèn lại... 6–8 giờ/ngày và tăng dần": đèn của họ đang chạy 4 giờ/ngày, nên câu này khiến họ bật đèn lâu hơn ngay sau khi tảo nở.
- plain, algae-03 tank: Bước "Vệ sinh lọc" bỏ qua việc họ đã thay bông lọc, tức đã làm mất vi sinh. Bể cần để yên phần lọc, không nên vệ sinh thêm.
- plain, algae-03 tank: "Vệ sinh lọc": a tank this new doesn't need its filter cleaned, and the user just replaced the floss, which may have set the bacteria back further
- plain, algae-03 tank: "bật đèn lại 6–8 giờ/ngày": more than the 4h/day the user already runs, which could bring the green water back
- ours, algae-04 post: "Tạm dừng hoặc giảm mạnh phân đạm và phân lân": a Dutch tank running CO2 needs N and P. Cutting them can starve the stem plants and make algae worse, not better.
- ours, algae-04 post: Doesn't address the daily 30% water change, even though tap water can bring in fresh silicate each time.
- ours, algae-04 post: Says the tank has been set up 'vài tuần' when the hobbyist said it is only 7 days old (a small slip).
- ours, algae-04 post: Cutting N and P sharply in a CO₂ Dutch tank could stunt the plants if it goes on too long.
- plain, algae-04 post: It calls the daily water change a likely main cause and says to cut back to 1–2 changes a week. Frequent changes in the first weeks are normally good for a new tank, so this overstates the risk.
- plain, algae-04 post: "Chuyển sang thay 30-50% mỗi tuần 1-2 lần": in the first weeks of a CO₂ Dutch tank with a new substrate, frequent water changes help keep ammonia and excess nutrients from the substrate down. Cutting them back in week 1 because of tap-water silicate is risky advice, and silicate in the tap water hasn't been confirmed.
- ours, algae-04 tank: "nên dùng phân không chứa đạm và phốt phát": với bể Hà Lan có CO₂, cắt hẳn N và P dễ làm cây thiếu chất. Kiểu cây này cần phân đủ chất ở mức vừa phải.
- ours, algae-04 tank: "Phân không chứa đạm và phốt phát" giai đoạn đầu: cách này không hợp với bể Hà Lan có CO₂, nơi cây cần N và P đầy đủ ngay từ đầu.
- plain, algae-04 tank: "Ốc táo: ăn tảo rất tốt, không phá cây": ốc táo hay ăn cây thủy sinh mềm. Bể Hà Lan càng không nên thả.
- plain, algae-04 tank: "Đây là nguyên nhân chính" (ánh sáng): tảo cát ở bể mới chủ yếu do silicat và hệ vi sinh chưa ổn định, đèn chỉ là yếu tố phụ.
- plain, algae-04 tank: "Không bón phân nước... trong giai đoạn đầu": cắt hết phân ở bể Hà Lan có CO₂ là không ổn.
- plain, algae-04 tank: "Ốc táo: ăn tảo rất tốt, không phá cây": ốc táo hay gặm cây thủy sinh, không hợp với bể kiểu Hà Lan nhiều cây mềm.
- plain, algae-04 tank: "Không bón phân nước... trong giai đoạn đầu": bể Hà Lan có CO₂ cần phân, cắt hẳn phân sẽ làm cây yếu, và cây yếu thì tảo càng có lợi thế.
- plain, algae-04 tank: "Đây là nguyên nhân chính" (đèn): tảo nâu ở bể mới chủ yếu do silicat và hệ vi sinh chưa ổn định, không phải chủ yếu do đèn.
- plain, algae-04 tank: Đề nghị thả Otocinclus khi bể mới 1–2 tuần là quá sớm với loài cá nhạy cảm này.
- ours, algae-05 post: "Giảm đèn còn khoảng 2–3 tiếng mỗi ngày trong vài tuần": quá gắt với bể Hà Lan đang lên cây tốt, cây thân sẽ còi, rụng lá
- ours, algae-05 post: "dùng viên erythromycin rắc đúng chỗ": dùng kháng sinh trị nhớt là biện pháp mạnh, không nên đưa ra cho bể mới chưa ổn định, và rắc viên thuốc tại chỗ cũng không phải cách dùng đúng
- ours, algae-05 post: Ngầm cho rằng đèn phòng là một nguyên nhân, trong khi gần như không ảnh hưởng
- ours, algae-05 post: "Giảm đèn còn khoảng 2–3 tiếng mỗi ngày trong vài tuần": quá ít cho bể Hà Lan nhiều cây, cây sẽ còi và yếu đi. Thường chỉ nên giảm xuống khoảng 6 tiếng.
- ours, algae-05 post: "Viên erythromycin rắc đúng chỗ": đây không phải cách dùng chuẩn. Erythromycin được hòa theo liều cho cả bể, còn chấm tại chỗ thì người ta dùng oxy già.
- plain, algae-05 post: "Tạm ngưng bón phân": với bể Hà Lan nhiều cây, cắt phân dễ làm cây yếu, và rêu nhớt hay đi kèm nitrat thấp chứ không phải dư phân
- plain, algae-05 post: Phần Nerita biển với Neritina hơi thừa, vì ốc nerita bán ở VN là loại nước ngọt
- plain, algae-05 post: "Tạm ngưng bón phân": cây trong bể Hà Lan đang lên tốt, ngưng phân dễ làm cây yếu đi. Tảo nhớt còn hay bùng lên khi nitrat thấp.
- plain, algae-05 post: Gợi ý thả Otocinclus vào bể mới 1 tháng là rủi ro, vì cá Oto cần bể đã ổn định và đủ thức ăn.
- ours, algae-05 tank: "nếu bể có cá" blackout: bể này chỉ có ốc nerita, không có cá, nên câu này không khớp với bể
- plain, algae-05 tank: "dương xỉ" được xếp vào cây sinh trưởng nhanh: dương xỉ lớn rất chậm, không cạnh tranh được với tảo
- plain, algae-05 tank: Khuyên nuôi thêm ốc Nerite trong khi bể đã có ốc nerita và con ốc đang nằm im, có thể bị yếu
- plain, algae-05 tank: Khuyên thay 20–30% mỗi tuần trong khi họ đang thay nước 2 ngày/lần
- plain, algae-05 tank: "dương xỉ" listed as a fast-growing plant to compete with algae: ferns grow slowly and are a poor choice for this.
- plain, algae-05 tank: "Cá lưng gù" as an algae eater: this isn't a recognised algae-eater name in the Vietnamese hobby and looks made up.
- ours, algae-06 post: Says lack of CO2 is the most common cause of all three algae types, but the guide says this only about hair algae (rêu tóc).
- ours, algae-06 post: "đảm bảo có bọt oxy ở mặt nước" is vague and doesn't say to set the CO2 to turn on before the lights.
- ours, algae-06 post: Bảo giảm thẳng từ 6-7 về 1 bọt/giây: CO2 tụt đột ngột như vậy dễ làm rêu sừng hươu nặng thêm; nên giảm dần theo drop checker
- plain, algae-06 post: "Mức giảm khoảng 0.3-0.5 là hợp lý... Giảm nhiều hơn 1 đơn vị là dư": a pH drop of about 1 is the usual sign of roughly 30 ppm, so this contradicts its own 20-30 mg/L target.
- plain, algae-06 post: Calls air sucked into the pump "cavitation". That is the wrong term; the problem is air entrainment and air lock.
- plain, algae-06 post: "drop checker ... khuyến nghị 30 ppm": what is normally recommended is a 4 dKH reference solution, not '30 ppm'.
- plain, algae-06 post: Suggests moving the diffuser to the inlet of the 603 canister, which just causes the same problem in the smaller filter.
- plain, algae-06 post: "Mức giảm khoảng 0.3-0.5 là hợp lý": khoảng 30 ppm thường ứng với pH giảm chừng 1 đơn vị; nhắm 0.3-0.5 thì bể dư rêu sẽ bị thiếu CO2
- plain, algae-06 post: "cavitation (xâm thực)": tiếng lọc xọc là do khí tích trong cốc lọc và đầu bơm, không phải xâm thực
- plain, algae-06 post: "Thiếu dinh dưỡng là nguyên nhân phổ biến nhất": rêu sừng hươu và rêu tóc thường gắn với CO2 thiếu hoặc dao động và dòng chảy yếu
- ours, algae-06 tank: "khoảng 1 bọt mỗi giây rồi chỉnh dần lên": bể đang chạy 6-7 giọt/giây rồi, nên lời khuyên này không hợp với bể; vấn đề thật là CO2 không hòa tan được (lọc kêu xọc, bọt to ở đầu out)
- ours, algae-06 tank: "rêu tóc thường đi cùng sắt trên 0,15 ppm": ngưỡng đưa ra quá chính xác mà không có căn cứ chắc chắn
- ours, algae-06 tank: "Tăng CO2 từ từ, khoảng 1 bọt mỗi giây rồi chỉnh dần lên" – không hợp với bể này: bể đang sủi 6–7 giọt/giây rồi, nên không cần bắt đầu lại từ 1 bọt/giây.
- plain, algae-06 tank: "drop checker xanh lam là đủ, vàng là thừa": sai, xanh lam là thiếu CO2, xanh lá mới là đủ
- plain, algae-06 tank: "pH giảm khoảng 0.2–0.3 so với nền là hợp lý": sai, để đạt khoảng 30 ppm thì pH cần giảm khoảng 1 đơn vị
- plain, algae-06 tank: "cá otocinclus (rêu lông tơ)": oto không ăn rêu chùm đen/BBA
- plain, algae-06 tank: "xanh lam là đủ, vàng là thừa" – sai: drop checker màu xanh dương nghĩa là thiếu CO2, xanh lá mới là đủ.
- plain, algae-06 tank: "pH giảm khoảng 0.2–0.3 so với nền là hợp lý" – sai: muốn CO2 khoảng 20–30 ppm thì pH thường phải giảm khoảng 1 đơn vị, giảm 0.2–0.3 thì CO2 còn rất thấp.
- plain, algae-06 tank: Gợi ý cá otocinclus cho rêu lông tơ/sừng hươu – sai: oto không ăn loại rêu này.
- ours, algae-07 post: Recommends 6–8h of light, but the guide excerpt shown right below says 8–12h, so the answer contradicts its own source on screen.
- ours, algae-07 post: "Nền trộn có thể đã hết dưỡng sau vài tuần" is a guess, and it doesn't fit a rich mixed substrate that is causing problems right from setup.
- ours, algae-07 post: 'Nền trộn có thể đã hết dưỡng sau vài tuần': a rich mixed substrate does not normally run out in a few weeks. This guess is weak.
- ours, algae-07 post: The excerpt shown recommends 8–12h of light, which contradicts the answer's own advice to cut back to 6–8h.
- plain, algae-07 post: "vi lượng (sắt, mangan, kali, magie...)": kali is a macronutrient and magie is a secondary nutrient, not micronutrients.
- plain, algae-07 post: Treats cốt nền as an inert support layer (đất sét nung, laterite, Flourite) that "không tự phân hủy". In the Vietnamese hobby, cốt nền means the nutrient-rich bottom layer, so this misses the point of the question about nutrition.
- plain, algae-07 post: Puts Dennerle Deponit under nền công nghiệp, but it is a nutrient base layer (cốt nền).
- plain, algae-07 post: Says cốt nền is an inert support/drainage layer (laterite, Flourite, 'Tropica Clay') that never breaks down. In Vietnam, cốt nền means the nutrient base layer under the soil, and it does get used up.
- plain, algae-07 post: Lists Dennerle Deponit as a nền công nghiệp (aqua soil). It is actually a base fertiliser, i.e. a cốt nền.
- plain, algae-07 post: Calls kali and magie vi lượng. They are macro and secondary nutrients, not micronutrients.
- ours, algae-07 tank: "Giảm CO₂ xuống mức vừa phải": cắt CO₂ khi rêu bùng thường làm rêu nặng hơn; nên giữ CO₂ ổn định, chỉnh theo drop checker và giảm đèn trước
- ours, algae-07 tank: "thay quá nhiều một lúc" xem việc thay 100% nước mỗi ngày trong 2 tuần đầu là lỗi, trong khi với nền giàu dưỡng mới set thì đó là cách làm bình thường để xả amoni
- ours, algae-07 tank: "Giảm CO₂ xuống mức vừa phải": bể có quạt làm CO₂ thoát ra nhanh, cây đang yếu thì giảm CO₂ có thể làm rêu và ngọn xoắn nặng hơn; nên đo bằng drop checker trước rồi mới chỉnh
- ours, algae-07 tank: Bước 7 ngầm chê việc thay nước nhiều, trong khi thay nước nhiều ở 2 tuần đầu với nền giàu dưỡng là đúng; Y cũng không nhắc đến chuyện nền nhả amoni gây rêu
- plain, algae-07 tank: Đổ cho thiếu sắt là nguyên nhân chính của ngọn xoắn, trắng; ngọn non xoắn thường do thiếu Ca/nước mềm, còn thiếu sắt làm lá non vàng nhạt
- plain, algae-07 tank: Hỏi lại thời gian bật đèn và việc dùng CO₂, những điều app đã có; khuyên cho cá ăn ít mà không biết bể có cá nhiều không
- plain, algae-07 tank: "Bổ sung sắt riêng nếu ngọn bị trắng": ngọn non xoắn, trắng thường do thiếu Ca/GH thấp hoặc CO₂ không ổn, không phải do sắt; châm thêm Fe vào nền giàu dưỡng dễ làm rêu nặng hơn
- plain, algae-07 tank: Hỏi lại về đèn, CO₂ và phân bón trong khi app đã có sẵn các thông tin này
- ours, algae-08 post: "khoảng 34 con": the tank holds 10+9+5 = 24 fish now; X added the first batch to the current one
- ours, algae-08 post: "khoảng 34 con": đếm trùng, thực tế bây giờ là 24 con
- plain, algae-08 post: "Khoảng 33 con (... 9 + 5 mún, 2 sọc... và các loài khác)": wrong and muddled count; there are 24 fish and no other species
- plain, algae-08 post: "350 L/h là đủ": 350K is the price (350,000 VND), not the flow rate
- plain, algae-08 post: Lists cây ráy, rêu java and dương xỉ java as "cây nhanh": all three grow slowly and do little against algae
- plain, algae-08 post: Suggests bèo tây (water hyacinth) for a 50cm tank: far too big for it
- plain, algae-08 post: Suggests adding Otocinclus/ốc to a tank it just called overstocked: more load, and oto needs a stable tank
- plain, algae-08 post: "Khoảng 33 con (... 9 + 5 mún, 2 sọc...)": đếm trùng đàn cá ban đầu với đàn hiện tại, thực tế bây giờ là 10+9+5 = 24 con
- plain, algae-08 post: Liệt kê cây ráy (Anubias) trong mục 'cây nhanh' để hút dinh dưỡng, trong khi ráy mọc rất chậm và bể đã có sẵn 2 cây ráy
- plain, algae-08 post: Khuyên thả thêm Otocinclus vào bể đang quá tải và chưa ổn định, ngược với lời khuyên giảm số cá
- plain, algae-08 post: Bèo tây quá to so với bể đúc 50cm
- plain, algae-08 post: "Thay quá nhiều làm... mất vi khuẩn có lợi": vi sinh nằm chủ yếu trong lọc và trên bề mặt, không nằm trong nước
- ours, algae-08 tank: "Nếu che tối thì nên chuyển cá sang bể tạm": cá vẫn ở yên trong bể che tối được miễn là có sủi; bắt 24 con cá ra là không cần thiết và làm cá stress.
- ours, algae-08 tank: "Ngừng châm phân nước": bể này không châm phân, nên bước này không áp dụng được.
- ours, algae-08 tank: "Nếu che tối thì nên chuyển cá sang bể tạm": không cần thiết, cá chịu được vài ngày che tối, chuyển bể chỉ thêm stress
- ours, algae-08 tank: "Ngừng châm phân nước": bể này không châm phân, nên bước này không áp dụng
- plain, algae-08 tank: "ốc bươu vàng": đây là loài xâm hại, phá cây ở Việt Nam, không nên khuyên thả vào bể.
- plain, algae-08 tank: "cá cory" được nêu là cá ăn tảo: cory không ăn tảo cát.
- plain, algae-08 tank: "Tăng ánh sáng nhẹ": mâu thuẫn với lời khuyên giảm sáng, trong khi bể đang thừa sáng (10 giờ đèn trắng cộng đèn màu buổi tối).
- plain, algae-08 tank: "điên điển": không phải cây thủy sinh để trồng trong bể.
- plain, algae-08 tank: "ốc bươu vàng nhỏ": đây là loài ngoại lai gây hại ở Việt Nam, ăn cây và làm bẩn bể, không nên khuyên thả
- plain, algae-08 tank: "Tăng ánh sáng nhẹ" để chữa tảo nâu: bể này đã bật đèn quá lâu, tăng sáng sẽ làm tảo xanh nặng hơn
- plain, algae-08 tank: Gợi ý cá otto, cory, cá lau kính cho một bể đúc nhỏ đã nuôi 24 con cá: bể sẽ càng quá tải và thêm dinh dưỡng
- ours, algae-09 post: "Dời bể vào chỗ râm": a large cast tank can't really be moved; shading it with a cover is the practical step
- ours, algae-09 post: "Hạn chế đèn bể 6-8 giờ": a balcony tank with no light has no lamp to limit, so this step is filler
- ours, algae-09 post: 'Dời bể vào chỗ râm' (move the tank into shade): a large concrete tank can hardly be moved
- ours, algae-09 post: Light-hour limit (6–8 h/day) applies to an aquarium lamp and does not fit a tank lit by sunlight on a balcony
- ours, algae-09 post: Plants given by English/Latin names (Salvinia, water sprite, hornwort) instead of the Vietnamese names hobbyists use (bèo tai chuột, dương xỉ nước, rong đuôi chó)
- plain, algae-09 post: "Bèo tây... bèo lục bình": these are the same plant (water hyacinth), listed twice
- plain, algae-09 post: "bông lọc" listed as biological filter media: filter wool mainly does mechanical filtration
- plain, algae-09 post: Barley straw is hard to find in Vietnam
- plain, algae-09 post: Lists 'bèo tây' and 'bèo lục bình' as if they were two different plants, but they are the same plant (water hyacinth)
- plain, algae-09 post: Calls 'bông lọc' a biological filter medium, when it is really a mechanical filter
- plain, algae-09 post: Recommends barley straw, which is hard to find in Vietnam
- ours, algae-09 tank: "chỉ bật đèn 6 đến 8 giờ mỗi ngày" doesn't apply: the tank is lit by natural balcony sun, not a lamp, so the real fix is shading
- ours, algae-09 tank: "Dời bể khỏi chỗ nắng chiếu" is hard to do with a large concrete tank; shading it is the realistic option
- ours, algae-09 tank: "Dời bể khỏi chỗ nắng chiếu": bể đúc khá to thì khó dời, che nắng mới làm được (dù Y có ghi thêm "hoặc che bớt ánh sáng").
- ours, algae-09 tank: "chỉ bật đèn 6 đến 8 giờ": bể không dùng đèn, chỉ có nắng tự nhiên.
- plain, algae-09 tank: "Ánh sáng quá nhiều: đèn bật trên 8 giờ/ngày": bể này dùng nắng ban công, không có đèn, nên lời khuyên chỉnh giờ đèn không đúng với bể của họ.
- plain, algae-09 tank: "Bật đèn khoảng 8 giờ/ngày và tránh ánh nắng trực tiếp": lời khuyên chung chung, bỏ qua việc bể đặt ngoài nắng trực tiếp, là nguyên nhân chính.
- plain, algae-10 post: "Rêu nâu dạng sợi thường do ánh sáng quá nhiều" – lớp rêu nâu bám rồi dính bụi, tép dọn sạch nhanh, gần như chắc là tảo silic, liên quan đến silicate và bể chưa ổn định chứ không phải do thừa đèn
- plain, algae-10 post: "Cá SAE... có thể gây hấn" – SAE thật thì hiền, loài hay gây hấn là cá bú (Chinese algae eater); SAE cũng không ăn tảo silic tốt bằng otto
- plain, algae-10 post: "rau mác" được kể là cây nhanh lớn – rau mác lớn chậm
- plain, algae-10 post: "Rêu nâu thường bùng lên khi... nitrat tích tụ": vague and often wrong; soft brown fuzz that shrimp clear quickly is usually diatoms, which come from silicate and a young tank, not nitrate
- plain, algae-10 post: "cá chùm râu" is not a name Vietnamese shops commonly use for Ancistrus; it looks invented
- ours, algae-10 tank: "Thả tép vào buổi tối... sau khi cá đã được cho ăn no": cá thần tiên vẫn săn tép nhỏ, nên cách này không giữ được tép.
- ours, algae-10 tank: Bảo thả tép buổi tối sau khi cho cá ăn no: cách này không cứu được tép khỏi thần tiên, vì thần tiên vẫn ăn tép trưởng thành cỡ nhỏ
- ours, algae-10 tank: Mặc định bể có CO2 ("Ổn định CO2") dù người hỏi không hề nhắc tới
- plain, algae-10 tank: "cá lia thia lùn" được xếp vào cá hiền không ăn tép, nhưng ngay sau đó lại bảo tránh betta. Ở Việt Nam, lia thia chính là betta, nên hai câu này mâu thuẫn nhau.
- plain, algae-10 tank: "Cá Otocinclus (cá chân tay)": tên này có vẻ bịa. Dân chơi ở Việt Nam gọi là cá otto.
- plain, algae-10 tank: "lồng nhựa có khe nhỏ để tép ra vào ăn rêu": tép đã ra khỏi lồng thì thần tiên vẫn ăn được.
- plain, algae-10 tank: "Chọn cá hiền": người hỏi đang nuôi thần tiên, nên lời khuyên chọn cá khác không áp dụng được cho bể của họ.
- plain, algae-10 tank: "Cá Otocinclus (cá chân tay)": ở Việt Nam không ai gọi oto là "cá chân tay"; thường gọi là cá oto hoặc cá chuột oto
- plain, algae-10 tank: "Siamese algae eater (cá sà nhỏ)": ở Việt Nam thường gọi là cá bút chì/SAE, không phải "cá sà nhỏ"
- plain, algae-10 tank: Gợi ý "chọn cá hiền... neon" mà không nói rõ là thần tiên sẽ ăn neon, đồng thời lại cho betta vào nhóm cá săn mồi lớn
- ours, algae-11 post: "cá chết thường vì amoniac hoặc clo chứ không phải vì thiếu oxy": wrong to rule this out. With water this green, the algae use up oxygen at night and that can kill fish, yet X gives no advice on aeration for the main tank.
- ours, algae-11 post: Step 1 depends on a water test kit. Many hobbyists in Vietnam don't have one, and X gives no first step for someone without it.
- ours, algae-11 post: "cá chết thường vì amoniac hoặc clo chứ không phải vì thiếu oxy": nói vậy là gạt bỏ nguy cơ tụt oxy về đêm khi tảo nở rộ trong nước xanh đậm, một nguyên nhân rất có thể ở đây.
- ours, algae-11 post: "Cloramin trong nước nuôi cá nên giữ dưới 0,1 mg/L": con số không rõ nguồn và người chơi bình thường cũng không có cách đo.
- plain, algae-11 post: "Nhiều nơi ở Việt Nam dùng chloramine": not backed up. Tap water in Vietnam is mostly treated with plain chlorine.
- plain, algae-11 post: "Amoniac và nitrit ... là thức ăn cho tảo": nitrite is not really a main nutrient for algae. Also, java moss is not a floating plant.
- plain, algae-11 post: "Nhiều nơi ở Việt Nam dùng chloramine": nói chắc như vậy là không có căn cứ, vì nước máy ở Việt Nam chủ yếu khử trùng bằng clo thường.
- plain, algae-11 post: "bèo tây, rêu java" được xếp vào cây nổi: rêu java không phải cây nổi, còn bèo tây quá to so với một bể cá thông thường.
- ours, algae-11 tank: "Cá vừa chuyển từ chỗ cũ, từng dùng gói oxy, cũng đang yếu" – đọc sai ghi chú: gói tăng oxy và chuyện mấy tháng mới thay nước là thói quen chăm bể cũ của người nuôi, không phải lý do khiến con cá yếu
- ours, algae-11 tank: "Cá vừa chuyển từ chỗ cũ, từng dùng gói oxy, cũng đang yếu" — đọc chưa đúng ghi chú: gói tăng oxy là thứ người nuôi từng dùng trong bể, và ghi chú về chỗ cũ là chuyện mấy tháng mới thay nước, không phải cá bị yếu do vận chuyển
- plain, algae-11 tank: "ban đêm pH có thể giảm đột ngột, gây sốc cho cá" – nói quá; pH dao động ngày đêm thì có, nhưng hiếm khi là nguyên nhân chính làm cá chết trong vụ nước xanh
- ours, setup-01 post: "Sưởi không cần bật 24/24... bật khi nước xuống thấp" — sai: sưởi có thermostat nên cắm điện suốt và để nó tự bật tắt. Bật tắt bằng tay vào mùa lạnh Hà Nội sẽ làm nhiệt độ nước dao động.
- ours, setup-01 post: "Cá trưởng thành nhịn được cả tuần" — dễ hiểu nhầm và không nên nói với người mới chơi.
- ours, setup-01 post: Trả lời cách cho cá ăn mà không nói trước rằng bể mới chưa nên thả cá ngay.
- ours, setup-01 post: "Sưởi không cần bật 24/24": sai. Sưởi có bộ điều nhiệt phải cắm liên tục, nhất là mùa lạnh ở Hà Nội. Bật lúc có lúc không làm nhiệt độ dao động, cá dễ bị sốc.
- ours, setup-01 post: "Cá trưởng thành nhịn được cả tuần": nói vậy dễ khiến người mới coi nhẹ chuyện cho cá ăn, và không đúng với nhiều loài cá nhỏ.
- ours, setup-01 post: Không nói rõ bể mới chưa nên thả cá ngay, chỉ nhắc ở câu cuối và nói khá mơ hồ.
- ours, setup-01 tank: "bể 20 lít khoảng 25 W; phòng máy lạnh thì nên chọn 50 W": the example is for a 20 L tank. For a 1 m tank in a Hanoi winter, this would steer them toward a heater far too small.
- ours, setup-01 tank: Ví dụ "bể 20 lít khoảng 25 W" và lời khuyên cho phòng máy lạnh không áp dụng được cho bể 1m ở Hà Nội mùa lạnh, nên dễ làm người đọc hiểu sai công suất sưởi cần dùng.
- plain, setup-01 tank: "2-3W/lít nếu phòng lạnh": this is on the high side. For a 1 m tank it means about 400–600 W, more than is usually needed, though with a thermostat it isn't dangerous.
- plain, setup-01 tank: "2-3W/lít nếu phòng lạnh": quá cao. Với bể 1m (~200–300 lít) thì thành 400–900W, quá thừa và có nguy cơ nấu cá nếu sưởi bị kẹt; ở Hà Nội mùa lạnh, khoảng 1–1,5W/lít là đủ.
- ours, setup-02 post: "chạy 8 đến 10 giờ mỗi ngày": quá dài cho một hồ mới set. Thường nên bắt đầu khoảng 6–7 giờ để tránh bùng rêu hại.
- ours, setup-02 post: "8 đến 10 giờ mỗi ngày" is on the long side for a new tank with moss and no CO₂, and it raises the risk of algae. 6-8 hours is safer at the start.
- plain, setup-02 post: Hiểu "trân châu ngọc trai" là tôm/tép. Ở VN đây là tên cây thủy sinh (Hemianthus micranthemoides), nên cả phần cảnh báo la hán ăn tôm bị lệch hẳn.
- plain, setup-02 post: "đặt thêm lớp... đá vôi nhỏ bên dưới" nền Gex: đá vôi đẩy pH/KH lên, làm mất tác dụng của phân nền và không hợp cây thủy sinh.
- plain, setup-02 post: "Sưởi 50-100W, giữ 24-26°C": ở VN nước thường nóng sẵn. Thứ cần là quạt hoặc chiller, không phải sưởi.
- plain, setup-02 post: "Eheim Classic 2213 (tầm 600 L/h)": lưu lượng của máy này khoảng 440 L/h.
- plain, setup-02 post: Leads with a long warning that treats 'la hán' as the flowerhorn fish and 'trân châu' as shrimp. In a bonsai layout list these are plants, so the main point is off-target.
- plain, setup-02 post: "đặt thêm lớp... đá vôi nhỏ bên dưới" Gex: limestone pushes pH and KH up, which works against the aqua soil and is bad advice.
- plain, setup-02 post: "Eheim Classic 2213 (tầm 600 L/h)": the 2213 is rated around 440 L/h.
- plain, setup-02 post: Says to buy a 50-100W heater, which is usually unnecessary in Vietnam's heat. Cooling matters more there.
- plain, setup-02 post: "cá tuyết" is not a normal name for a small community aquarium fish.
- ours, setup-02 tank: "Lọc thùng hay bị rò nước": nói quá. Lọc thùng của hãng có tiếng ít khi rò nếu lắp gioăng đúng cách.
- ours, setup-02 tank: Khuyên trồng cây ưa sáng yếu như anubias, trong khi người hỏi đã chọn trân châu và rêu, nên lời khuyên này không giúp họ chọn đèn.
- ours, setup-02 tank: Tells a beginner to start with anubias, crypt and fern without CO2. That ignores their trân châu ngọc trai carpet, which needs strong light and usually CO2.
- ours, setup-02 tank: 'Lọc thùng hay bị rò nước' overstates the leak risk of canister filters.
- plain, setup-02 tank: "Bật khoảng 8-10 tiếng/ngày": quá dài cho bể mới set. Giai đoạn đầu nên để 6-8 tiếng để hạn chế rêu hại.
- plain, setup-02 tank: "Bông lọc" được xếp vào vật liệu sinh học, nhưng bông chủ yếu là lọc cơ học.
- plain, setup-02 tank: Calls 'bông lọc' a biological filter medium; it is mainly mechanical filtration.
- plain, setup-02 tank: Suggests HOB for a 60–150 L tank. For a ~96 L planted bonsai tank with a carpet, a canister filter is the usual and better choice.
- ours, setup-03 post: "trang bị lại từ đầu: bể..." / gợi ý mua bể 35-55 lít: người hỏi đã có sẵn bể, đâu cần mua bể mới
- ours, setup-03 post: "lọc ... 400 lít/giờ là đủ cho bể 55 lít": lưu lượng này quá mạnh với đàn cá tí hon, còn dễ hút cá con
- ours, setup-03 post: "sưởi 50 W ... nên có để an toàn": ở Việt Nam nhiệt độ phòng đa số thời gian đã trên 25°C, sưởi thường không cần
- ours, setup-03 post: "chốt cỡ bể trước khi mua đồ khác" / "Ngân sách... đủ cho bể": the hobbyist already has a tank, so this misreads the question
- ours, setup-03 post: Tells them to buy a 50W heater at 25°C "để an toàn": usually unnecessary in Vietnam's climate and a waste of a tight budget
- ours, setup-03 post: "cá và phụ kiện làm thêm sau": a 3-4 triệu budget easily covers fish too, so this advice is wrong
- plain, setup-03 post: Cho Otocinclus vào bể mới setup là sớm quá: chúng cần bể đã chạy ổn định và có sẵn rêu để ăn
- plain, setup-03 post: Celestial pearl danio và chili rasbora thích nước mát hơn, nên có thể bị stress khi phòng ở Việt Nam nóng khoảng 30°C mà không có lưu ý gì
- plain, setup-03 post: "Dương" in the plant list looks like a truncated "Dương xỉ" (Java fern), which is also listed separately
- plain, setup-03 post: Otocinclus suggested for a new tank: they need a mature tank with plenty of algae, so they shouldn't go into a fresh setup
- ours, setup-03 tank: "Mua bể kính thường, không viền, khoảng 36-60 cm": người hỏi đã có bể trống rồi, nên khoản này làm lệch cả ngân sách
- ours, setup-03 tank: "bể, đèn, lọc, sưởi và nền có thể gần hết 3-4 triệu": cách tính này gồm cả tiền mua bể, mà người hỏi không cần mua bể
- ours, setup-03 tank: "sưởi... cài cố định khoảng 25°C": câu này nói như thể sưởi là thứ bắt buộc, nhưng ở phần lớn Việt Nam, nhất là miền Nam, thường không cần sưởi
- ours, setup-03 tank: "Mua bể kính thường, không viền, khoảng 36-60 cm": người hỏi đã có bể, khuyên mua bể mới là lãng phí ngân sách
- ours, setup-03 tank: "bể, đèn, lọc, sưởi và nền có thể gần hết 3-4 triệu": cách chia ngân sách này tính cả tiền một cái bể họ không cần mua
- plain, setup-03 tank: "Cá tẩy/cá tàu (Corydoras)": ở Việt Nam, người chơi gọi Corydoras là cá chuột, không gọi là cá tẩy hay cá tàu
- plain, setup-03 tank: "Tránh... cá bảy màu lớn vì cần bể lớn hơn": sai, cá bảy màu sống tốt trong bể khoảng 60 lít
- plain, setup-03 tank: "thủy trúc" trong danh sách cây dễ sống: thủy trúc là cây bán cạn, ngâm chìm hẳn trong nước thì sẽ thối
- plain, setup-03 tank: Máy sưởi được ghi là "nên có": ở khí hậu Việt Nam thường không cần thiết
- plain, setup-03 tank: "Cá tẩy/cá tàu (Corydoras)": ở Việt Nam Corydoras thường gọi là cá chuột, không phải cá tẩy/cá tàu
- plain, setup-03 tank: "Tránh... cá bảy màu lớn vì cần bể lớn hơn": cá bảy màu là cá nhỏ, hợp với bể 60 lít
- plain, setup-03 tank: "cà na" không phải tên cây thủy sinh phổ biến, có vẻ bịa
- plain, setup-03 tank: Nền ghi ADA/Tropica giá 150–300k: giá đó không thực tế cho đất nền hãng
- ours, setup-04 post: "nặng khoảng 80 đến 90 kg": nước đã khoảng 78 kg, cộng kính, nền và đá thì phải hơn 100 kg. Con số này quá thấp cho một bể đặt trên kệ tivi.
- ours, setup-04 post: "dày khoảng 4 đến 5 cm... cần khoảng 11 đến 13 lít": đáy 0,216 m², nền dốc 4–5 cm chỉ cần khoảng 8–10 lít, nên con số này hơi cao.
- ours, setup-04 post: "nặng khoảng 80 đến 90 kg": ước thấp. Riêng nước đã khoảng 70 kg, cộng nền, đá và kính thì phải trên 100 kg. Đây là điểm cần chắc chắn vì liên quan đến an toàn của kệ tivi.
- ours, setup-04 post: "rong La Hán không có trong cẩm nang": để lộ nguồn nội bộ và không đưa ra cây thay thế cụ thể.
- plain, setup-04 post: "dòng chảy tạo oxy hòa tan tốt, giúp bù phần nào việc không có CO2": khuấy động mặt nước làm CO2 thoát ra chứ không bù được CO2.
- plain, setup-04 post: "không để trực tiếp lên kính khi chưa có lớp đệm": câu này mâu thuẫn với lời khuyên vừa nói là "chồng đá trên đáy bể".
- plain, setup-04 post: Gom ráy lá nhỏ vào nhóm cây bám đá để kết luận "không cần nền dinh dưỡng", nhưng crypt là cây ăn rễ.
- plain, setup-04 post: "dòng chảy tạo oxy hòa tan tốt, giúp bù phần nào việc không có CO2": sai. Khuấy mặt nước làm CO2 thoát ra nhiều hơn, oxy không thay được CO2 cho cây.
- plain, setup-04 post: "Vesicularia dubyana (rêu Christmas)": V. dubyana là rêu Java, rêu Christmas là V. montagnei.
- plain, setup-04 post: "~10–13 kg" sỏi cho 8–12 lít: hơi thấp, sỏi nặng khoảng 1,5 kg/lít nên cần khoảng 12–18 kg.
- ours, setup-04 tank: "8–9 lít" cho nền 3–4 cm hơi cao: tính ra 60×36×3–4 cm chỉ khoảng 6,5–8,6 lít, nhưng lệch không nhiều và mua dư một chút vẫn an toàn
- ours, setup-04 tank: "Chỉ khi trồng thêm cây ăn rễ mạnh thì mới cần nhét viên phân nền": rong La Hán là cây thân có rễ, nên vẫn có lợi khi cắm viên phân nền dưới gốc
- plain, setup-04 tank: Ví dụ bể 60×30 cm: hướng dẫn chung chung, không dùng đáy 60×36 của bể này
- plain, setup-04 tank: "ADA Aqua Soil... Thường cần bón thêm phân": nói lẫn lộn, vì phân nền có sẵn dinh dưỡng trong những tháng đầu
- ours, setup-05 post: "bể 100x50x50": the hobbyist wrote 1m2, so the tank is 120 cm and the substrate volume comes out wrong
- ours, setup-05 post: "Không nên trộn thêm Aquafor... không cần thêm chế phẩm nào": X treats Aquafor as an additive, but it is an aquasoil sold in Vietnam that people layer over a mixed base
- ours, setup-05 post: Recommends Akadama and a "nền dành cho dương xỉ/Anubias" instead of answering the Aquafor question; these suggestions don't fit and look invented
- ours, setup-05 post: Answers in kg/bags of 9 L for the wrong tank size and never gives the weight in kg the hobbyist asked for
- ours, setup-05 post: Ghi sai kích thước hồ là 100x50x50, trong khi hồ thật là 1m2 (120cm)
- ours, setup-05 post: "Không nên trộn thêm Aquafor vào phân nền công nghiệp": Aquafor chính là phân nền công nghiệp của Việt Nam, còn 'nền trộn' là đất trộn tự làm; câu trả lời hiểu sai câu hỏi
- ours, setup-05 post: Gợi ý Akadama làm 'phân nền công nghiệp nhả chậm' là sai: Akadama là đất nung, gần như không có dinh dưỡng
- ours, setup-05 post: "nền dành cho dương xỉ/Anubias" là loại nền nghe như bịa, không có thật
- plain, setup-05 post: Calls the 6500K/10K/pink mix "hợp lý" but later suggests cutting to 2x6500K, which is a bit inconsistent; there are no real errors
- plain, setup-05 post: "Nên rửa sạch đất nền trước khi cho vào": nền trộn tự làm không rửa được, rửa chỉ làm nát và trôi dinh dưỡng
- plain, setup-05 post: "giảm xuống còn 2x 6500K + 1x 10K và giữ bóng hồng": vẫn là 4 bóng, nên không tiết kiệm điện cũng không giảm sáng
- plain, setup-05 post: "20–25 kg Aquafor" không khớp với lớp Aquafor chỉ dày 3–4 cm mà chính câu trả lời đề xuất; lớp đó cần ít hơn
- ours, setup-05 tank: "Bóng hồng gần như không góp thêm ánh sáng cho cây": nói quá. Bóng hồng vẫn cho phổ đỏ và xanh dương mà cây dùng được, chỉ là độ sáng cảm nhận thấp hơn.
- ours, setup-05 tank: "Bóng hồng gần như không góp thêm ánh sáng cho cây": sai một phần. Bóng T5 hồng phát nhiều phổ đỏ, cây vẫn dùng được, và nó giúp cây đỏ trông đỏ hơn.
- plain, setup-05 tank: Hỏi lại kích thước bể và loại đèn dù đã có sẵn (120×50×50, T5HO 4 bóng). Đưa ra mức W/lít của LED, không dùng được cho T5HO. Ví dụ tính toán lại dùng bể 60×30 chứ không phải bể của người hỏi.
- ours, setup-06 post: "chờ vài ngày cho nước trong trước khi thả cây": hồ thủy sinh thường trồng cây ngay khi setup, lúc nước còn thấp hoặc nền mới phun ẩm. Chờ cây sau khi đổ đầy nước là ngược quy trình.
- ours, setup-06 post: 'chờ vài ngày cho nước trong trước khi thả cây' – in a planted tank the usual way is to plant first, then fill slowly. Planting after the tank is full is harder and stirs up the soil.
- plain, setup-06 post: "Sạn hoặc cát thô dễ trôi xuống và làm lẫn vào lớp nền Aquafor": thực ra cát mịn mới dễ lọt vào khe giữa các hạt phân nền hơn sạn thô, nên lý do này bị ngược.
- plain, setup-06 post: "Bể cao 36 cm làm ánh sáng bị suy giảm... nên 2 bóng... vừa đủ": lập luận không chặt, độ sâu lớn hơn thì cần sáng nhiều hơn chứ không phải ít đi.
- plain, setup-06 post: Gợi ý chọn máng 2 bóng có chỉnh độ sáng: máng T5 Odyssea phổ thông thường không có dimmer.
- plain, setup-06 post: 'Sạn hoặc cát thô dễ trôi xuống và làm lẫn vào lớp nền Aquafor' – this is backwards: fine sand is what sifts down into the gaps in soil granules, while coarse gravel stays on top.
- plain, setup-06 post: 'Trải cát trước khi thả cây, nhớ dùng đĩa hoặc bát hứng để không xới nền' – this mixes up the order. The plate or bowl is used when pouring in water, not when spreading sand.
- ours, setup-06 tank: "số bóng là số đèn bạn cần": nhầm giữa số bóng trên một máng với số máng đèn
- ours, setup-06 tank: "khó để cây thảm bám": bể này không trồng cây thảm, nên lý do này không liên quan
- ours, setup-06 tank: "sạn to dễ trôi": lý do sai, sạn to nặng nên không trôi; lý do đúng để rải nền mịn ở mặt tiền là dễ vệ sinh, giữ phân nền không lẫn lên và trông đẹp hơn
- ours, setup-06 tank: Câu hỏi gợi ý "60x40x40" không đúng với bể 60x30x36 của người hỏi
- plain, setup-06 tank: "phủ lớp sạn mỏng lên aqua soil" được nói như việc luôn phải làm, trong khi phân nền dạng hạt thường để trần; tính W/lít cũng là cách cũ với đèn LED
- plain, setup-06 tank: "không bị trầy mang": khi cory bới đáy, sỏi sắc làm hỏng râu và miệng chứ không làm trầy mang
- plain, setup-06 tank: Quy tắc W/lít là cách tính cũ, chưa nói rõ loại đèn nên chỉ dùng để ước lượng thô
- ours, setup-07 tank: Bảo trồng khoai lang ở nền phía sau, trong khi khoai lang thường để ngọn nổi trên mặt nước hoặc cắm củ ở miệng bể, không trồng chìm
- ours, setup-07 tank: "Đặt bể tránh nắng trực tiếp": bể đã âm vào hốc cửa sổ nên không dời được; chỉ có cách che kính hoặc lưới là làm được
- plain, setup-07 tank: Quy tắc '1 cm cá trên 1 lít' quá chung chung, không có nguồn rõ ràng, và không gắn với bể của bạn
- plain, setup-07 tank: "1 cm cá trưởng thành trên 1 lít nước" là quy tắc thô, dễ sai, nhất là với bể hẹp 20 cm
- ours, setup-08 post: "cần sưởi khoảng 25–27°C": in most of Vietnam the water already sits at or above that temperature, so a heater isn't really needed, and the answer doesn't say so
- ours, setup-08 post: "Cá betta nuôi riêng là lựa chọn rẻ và dễ": one betta alone in a 120-litre tank wastes the tank and doesn't fit the stocking advice around it
- ours, setup-08 post: Says a heater at 25–27°C is 'cần' (needed). In most of Vietnam a heater usually isn't necessary.
- ours, setup-08 post: A filter rated at 10x tank volume (1000–1200 L/h) is on the high side for a small budget. 5–8x is enough for a planted tank.
- plain, setup-08 post: It suggests a male betta ("cá đá đực") together with guppies ("cá bảy màu"). The betta tends to attack guppies because their long fins look like a rival's.
- plain, setup-08 post: "công suất gấp 3-5 lần thể tích bể mỗi giờ": that flow is on the low side for a planted tank
- plain, setup-08 post: It never mentions that the bottom glass carries the most load in a planted tank, so the 5 mm glass question is only half answered
- plain, setup-08 post: Suggests keeping a male betta (cá đá) together with guppies. The betta will nip and fight the guppies' long fins.
- plain, setup-08 post: Suggests Neocaridina shrimp in the same tank as a betta, guppies and a crowded community. Baby shrimp will mostly get eaten.
- plain, setup-08 post: Treats 5mm glass as clearly acceptable for a 45cm-tall tank. That is borderline, and it doesn't mention moving up to 6mm.
- ours, setup-08 tank: "cho ăn 2 đến 3 ngày một lần": cá nhỏ như neon, rasbora nên được cho ăn ít mỗi ngày. Ăn 2-3 ngày một lần là bỏ đói cá kéo dài.
- ours, setup-08 tank: "cho ăn 2 đến 3 ngày một lần" — quá thưa cho cá đàn nhỏ như neon, rasbora; thường nên cho ăn ít, mỗi ngày 1 lần
- ours, setup-08 tank: Bảo không cần phân rồi cuối lại bảo kiểm tra 'lượng phân', tự mâu thuẫn
- plain, setup-08 tank: "cá khoang cổ" ở Việt Nam là cá hề, một loài cá biển, không nuôi được trong bể nước ngọt.
- plain, setup-08 tank: "Trân châu" được xếp vào nhóm cây dễ sống, nhưng trải thảm trân châu mà không có CO2 và đèn mạnh thì khó, không hợp với bể tiết kiệm.
- plain, setup-08 tank: "Với bể nhỏ, nên thả ít cá": bể khoảng 120 lít này không phải bể nhỏ.
- plain, setup-08 tank: "cá khoang cổ" — tên tiếng Việt này chỉ cá hề, là cá biển, không nuôi được trong bể nước ngọt
- plain, setup-08 tank: "Trân châu... nhiều loại dễ sống" — trân châu trải thảm cần đèn mạnh và CO2, không dễ với bể kinh phí ít
- ours, setup-09 post: "Lỗ nên đặt khoảng 2 đến 3 cm dưới mặt nước, lấy nước vào thấp": tự mâu thuẫn. Lỗ hút phải đặt thấp, không thể cả hai lỗ đều sát mặt nước.
- ours, setup-09 post: "đường kính khớp với ống lọc (thường 12 đến 16 mm)": lỗ khoan cho ốc xuyên kính (bulkhead) phải lớn hơn nhiều, khoảng 25–32 mm, chứ không bằng cỡ ống.
- ours, setup-09 post: "Chọn cá nhỏ đi đàn như tép": tép không phải cá và cũng không đi đàn.
- ours, setup-09 post: 'đường kính khớp với ống lọc (thường 12 đến 16 mm)': a bulkhead needs a much bigger hole, around 25-32 mm, so a 12-16 mm hole won't take one.
- ours, setup-09 post: 'Lỗ nên đặt khoảng 2 đến 3 cm dưới mặt nước' contradicts its own advice to draw water in low; the intake hole belongs near the bottom.
- ours, setup-09 post: Suggests drilling the bottom glass, which is impractical in a bookshelf cubby.
- plain, setup-09 post: "Cá thia nhỏ": cá thia khá hung, dễ cắn cá nhỏ, không hợp bể cá đàn hiền.
- plain, setup-09 post: "đáy nên dùng kính dày khoảng 10-12 mm": dày quá mức cần cho bể cao 35 cm, thường 8–10 mm là đủ. Đây là chỗ dư chứ không nguy hiểm.
- plain, setup-09 post: 'Sưởi 100-200 W' is presented as needed, but most tanks in Vietnam's heat don't need a heater; a minor point.
- plain, setup-09 post: Lists 'cá thia nhỏ' among the small schooling fish; thia are not schooling fish.
- plain, setup-09 tank: "Thay khoảng 20–30% nước mỗi tuần" là lời khuyên chung chung, trái với ý muốn ít thay nước của bạn này mà không giải thích cách giảm số lần thay (lọc dư, mật độ thấp)
- plain, setup-09 tank: "Ốc táo (ốc nhồi nhỏ)": ốc táo (Pomacea) gần với ốc bươu vàng, một loài xâm hại ở Việt Nam, không phải ốc nhồi; nó còn ăn cây.
- plain, setup-09 tank: "Thay khoảng 20–30% nước mỗi tuần" đi ngược ý muốn ít thay nước của người hỏi, trong khi bể ~178 L ít cá vẫn có thể giãn lịch thay.
- ours, cycling-01 post: "thay 50% mỗi ngày làm mất vi khuẩn có lợi": vi khuẩn sống trong lọc và nền, không phải trong nước. Với nền nhiều chất mới, thay nước nhiều trong mấy tuần đầu lại là cách làm chuẩn để giảm amoniac do nền nhả ra.
- ours, cycling-01 post: Không nói gì về chuyện đá sủi làm thoát CO2 trong bể đang chạy CO2
- ours, cycling-01 post: Đặt đá sủi gần đáy mà không nói là bể có CO2 thì sục sẽ đẩy CO2 bay ra, nên chỉ bật lúc tắt CO2 ban đêm
- plain, cycling-01 post: "bổ sung amoniac (như nước rửa bát không mùi...)": nước rửa bát là chất tẩy rửa, không phải amoniac, sẽ hại cá và vi khuẩn. Lời khuyên này nguy hiểm. Hơn nữa nền nhiều chất vốn đã nhả amoniac nên không cần châm thêm.
- plain, cycling-01 post: "Thay 50% nước mỗi ngày là vấn đề lớn nhất... rửa trôi vi khuẩn": sai nguyên nhân. Với nền nhiều chất mới, thay nước nhiều lúc đầu là có lợi.
- plain, cycling-01 post: 'nước rửa bát không mùi' làm nguồn amoniac: nước rửa bát là chất tẩy rửa, không phải amoniac, và độc cho bể
- plain, cycling-01 post: Khuyên thêm amoniac lên 2 ppm trong khi nền thủy sinh đang tự nhả amoniac: không cần, còn dễ làm rêu bùng
- plain, cycling-01 post: 'đặt hướng bọt chạy về phía mặt nước': mẹo vô nghĩa, bọt khí nào cũng nổi lên mặt nước
- plain, cycling-01 tank: "Bảy màu (rainbowfish)" — cá bảy màu là guppy (Poecilia reticulata), không phải cá cầu vồng (rainbowfish).
- plain, cycling-01 tank: "Không thay nước nhiều trong giai đoạn này" — bể này dùng nền nhiều dưỡng, nền nhả amoniac mạnh trong mấy tuần đầu, nên dân thủy sinh vẫn thay nước nhiều, đúng như người hỏi đang thay 50% mỗi ngày. Lời khuyên này không hợp với bể của họ.
- plain, cycling-01 tank: "Bảy màu (rainbowfish)": bảy màu là cá guppy (Poecilia reticulata), không phải cá cầu vồng (rainbowfish).
- plain, cycling-01 tank: "Không thay nước nhiều trong giai đoạn này": bể dùng nền nhiều dưỡng nhả amoniac mạnh nên những tuần đầu cần thay nước thường xuyên. Bỏ thay nước dễ làm amoniac tăng vọt và gây bùng rêu.
- plain, cycling-01 tank: Khuyên nhỏ thêm amoniac hoặc thức ăn để nuôi vi sinh: không cần với nền nhiều dưỡng vốn đã nhả amoniac sẵn.
- ours, cycling-02 post: Không trả lời câu hỏi nên mua cá gì sống khỏe cho con, lại khuyên nuôi neon ở bể 60 cm, trong khi bể của họ chỉ 50 cm
- ours, cycling-02 post: 'Bể 50 cm quá nhỏ cho 14 con': 10 con neon cộng 4 cá vàng nhỏ không phải lý do chính, vấn đề chính là bể mới
- plain, cycling-02 post: "Cá kiếm (platy)": ở Việt Nam cá kiếm là swordtail, còn platy là cá hà lan.
- plain, cycling-02 post: "Cá lòng tong (danio)": lòng tong là rasbora, danio là cá sọc ngựa.
- plain, cycling-02 post: "Ốc nhồi" là ốc to, ăn cây, không nên thả bể nhỏ 50cm.
- plain, cycling-02 post: Lúc đầu nói bể cần 3–6 tuần để chín, phần quy trình lại ghi chạy bể 1–4 tuần, hai chỗ mâu thuẫn nhau; khuyên dùng sưởi mà không nói ở Việt Nam thường không cần.
- plain, cycling-02 post: 'Cá kiếm (platy)': ở Việt Nam cá kiếm là swordtail, platy thường gọi là cá hà lan/cá platy
- plain, cycling-02 post: 'Cá lòng tong (danio)': lòng tong là rasbora, danio là cá ngựa vằn
- plain, cycling-02 post: 'Dùng nhiệt kế và sưởi': ở khí hậu Việt Nam phần lớn không cần sưởi cho neon
- ours, cycling-02 tank: "chạy lọc vài tuần trước khi thả cá": chạy lọc không có nguồn amoniac hay vi sinh thì không lên chu trình được, nên lời khuyên này dễ gây hiểu lầm.
- plain, cycling-02 tank: "vài giọt nước rửa chén không mùi" as an ammonia source is a mistranslation of unscented pure ammonia. Dish soap is surfactant and toxic to fish and bacteria, so this step is harmful.
- plain, cycling-02 tank: Asks for fish type, tank size and fish count, all of which the app already holds.
- plain, cycling-02 tank: "vài giọt nước rửa chén không mùi" làm nguồn amoniac: sai và nguy hiểm. Phải dùng amoniac nguyên chất không mùi. Nước rửa chén có chất tẩy rửa, độc với cá và vi sinh.
- ours, cycling-03 post: "không nên nuôi chung với bảy màu": the species card shown doesn't say this, so the guide is being cited for a claim it doesn't make. It also tells them to drop guppies, which their new plan never had.
- ours, cycling-03 post: "Nếu có số đo, thay 30-50%": water changes are needed even without test numbers when fish are dying, so making them conditional on testing is wrong.
- ours, cycling-03 post: "Bảy màu nhạy amoniac nên chết trước": thực tế bảy màu là loài khá chịu đựng, chết nhiều nhiều khả năng do cá yếu từ chỗ bán cộng với hồ chưa chạy chu trình
- ours, cycling-03 post: "không nên nuôi chung với bảy màu": nói quá. Hai loài sống chung được, chỉ lệch nhau về nước cứng/mềm
- ours, cycling-03 post: Gọi rêu trắng là rêu do chưa ổn định, không nói nó là nấm/màng vi khuẩn ăn trên cây thối
- plain, cycling-03 post: "Tỳ bà bướm có thể lớn và cần hồ rộng hơn": a butterfly hillstream loach stays small, about 5-7 cm. What it actually needs is strong flow, cool water and high oxygen, which is the real problem in Vietnam's heat.
- plain, cycling-03 post: "đàn cá trâm và bảy màu đang hơi đông": the new plan has no guppies.
- plain, cycling-03 post: "1 cm cá trên 1 lít": a rough, unreliable stocking rule.
- plain, cycling-03 post: "Với trân châu, dùng ống hút đáy để hút cặn kẽ hạt": trân châu ngọc trai lùn (HC Cuba) là cây trải thảm, không phải hạt nền. Hút như vậy làm bật thảm cây
- plain, cycling-03 post: "đừng dùng quá dày": lại hiểu trân châu là nền chứ không phải cây
- plain, cycling-03 post: Không nói được "rêu trắng" là gì: đó là nấm/màng vi khuẩn mọc trên cây đang mục, không phải rêu do đèn
- ours, cycling-03 tank: "nước trắng lan" reads their rêu trắng as cloudy water. The hobbyist means a white fuzz that is rotting the trân châu, not a bacterial bloom in the water
- ours, cycling-03 tank: The excerpt shown under it says to stop feeding about 7 days, which contradicts the 1–2 days in the main text
- ours, cycling-03 tank: Đọc "rêu trắng lan" thành "nước trắng"/bùng vi sinh, rồi trích bài về nước đục, trong khi người hỏi tả một lớp mảng trắng phủ lên trân châu và làm cây thối.
- plain, cycling-03 tank: Calls the white fuzz "tảo silic (diatom)". Diatoms are brown. A white fuzz rotting plants is more likely fungus or biofilm on decaying plants and leftover food
- plain, cycling-03 tank: Calls it "không nguy hiểm", but the fuzz is already rotting their trân châu
- plain, cycling-03 tank: "Rêu trắng... thường là tảo silic (diatom)": tảo silic có màu nâu, không trắng; mảng trắng làm thối trân châu thường là màng vi khuẩn/nấm mọc trên cây đang phân hủy.
- plain, cycling-03 tank: "không nguy hiểm": ở đây nó đang làm thối trân châu và làm nước bẩn thêm.
- ours, cycling-04 post: "handbook không đặt lịch cố định": this mentions an internal source the reader can't see and gives them no clear weekly routine
- ours, cycling-04 post: "handbook không đặt lịch cố định": lộ tài liệu nội bộ, người đọc không biết handbook là gì.
- plain, cycling-04 post: "do nước máy chưa khử clo" gây bọt trắng: clo không tạo bọt. Nó gây hại cho cá, nhưng không phải nguyên nhân của bọt.
- ours, cycling-04 tank: "rửa sạch ... lọc bằng nước sạch": rửa vật liệu lọc bằng nước máy sẽ làm mất chỗ vi sinh ít ỏi mà bể đang gây
- ours, cycling-04 tank: "Kiểm tra máy lọc và sục khí có chạy đều không": bể này không có sủi, nên cần khuyên lắp sủi chứ không phải kiểm tra
- plain, cycling-04 tank: "Thay nhỏ nhưng thường xuyên an toàn hơn thay một lần lớn": câu này mâu thuẫn với lời khuyên thay 30–50% ngay ở cùng bước
- plain, cycling-04 tank: Xếp betta vào nhóm cá rất nhạy là sai, vì betta khá chịu được bể mới
- plain, cycling-04 tank: "cá rất nhạy như betta": betta chịu được bể mới tương đối tốt, không phải loài rất nhạy
- plain, cycling-04 tank: "Thay nhỏ nhưng thường xuyên an toàn hơn" ngay sau khi bảo thay 30–50%: hai lời khuyên mâu thuẫn nhau
- ours, cycling-05 post: "Nếu amoni trên 0,1 mg/L hoặc nitrit trên 0, bạn thay một phần nước ngay": these are fish-in thresholds. In a fishless cycle, changing water like this stalls the cycle, and it contradicts step 6, which raises ammonia to 2 ppm.
- ours, cycling-05 post: "giữ nhiệt độ 24–26°C": in Vietnam an unheated tank sits at 28–30°C, and that warmth helps bacteria grow. Cooling the tank to this range is impractical and unnecessary.
- ours, cycling-05 post: "Mình chưa biết dung tích thực của bể 845": in the Vietnamese hobby, 845 means 80x40x50 cm, about 160 L, so the dose could have been worked out.
- ours, cycling-05 post: 'Nitrit trên 0 thì thay nước ngay' khi đang chạy không cá: thay liên tục như vậy làm vi sinh thiếu thức ăn, chu trình bị chững
- ours, cycling-05 post: 'Giữ nhiệt độ 24–26°C': không thực tế ở Việt Nam, nước hồ thường 28–30°C. Nước ấm còn giúp chu trình chạy nhanh hơn, nên không cần ép nhiệt độ xuống
- ours, cycling-05 post: Bảo không biết dung tích bể 845, trong khi dân chơi ở Việt Nam đều hiểu đó là cỡ khoảng 80×45×45, tức khoảng 150 L
- plain, cycling-05 post: "Thay nước... (trên 0,5 ppm) để không làm chết vi khuẩn": this reason is off. Ammonia at 0.5 ppm doesn't kill nitrifying bacteria. The real reason to change water is to protect fish if there are any.
- plain, cycling-05 post: Bỏ sót nguồn amoni cho bể chạy không cá: không có amoni thì vi sinh không có gì để ăn, chu trình không lên được
- plain, cycling-05 post: 'Thay nước khi amoniac/nitrit trên 0,5 ppm để không làm chết vi khuẩn': lý do sai. Lúc chạy không cá, vi sinh chịu được mức cao hơn nhiều, thay nước kiểu này chỉ làm chu trình chậm lại
- ours, cycling-05 tank: "một con cá nhỏ cho mỗi 38 lít nước": the figure is a converted 10-gallon rule of thumb. It's oddly precise and makes no sense for a 160 L tank.
- ours, cycling-05 tank: Says to pick vi khuẩn sống but names no product, so it doesn't actually answer "loại nào".
- ours, cycling-05 tank: "một con cá nhỏ cho mỗi 38 lít" là quy đổi máy móc từ 10 gallon, con số trông bịa và không nói rõ cỡ cá, cũng không áp vào bể ~160 lít của người hỏi
- plain, cycling-05 tank: "Thay nước sạch đã khử clo": the tank was just filled, so it should say to dechlorinate the water already in it, not change the water.
- plain, cycling-05 tank: Suggests cá chuột (corydoras) as a hardy fish for a brand-new tank, but they are fairly sensitive while the tank is still cycling.
- ours, cycling-06 post: "Giảm đèn còn khoảng 8–10 tiếng": với bể mới thì 8–10 tiếng không hẳn là giảm, mà đèn cũng không phải nguyên nhân gây đục vi khuẩn.
- ours, cycling-06 post: Bước 6 lẫn lộn giữa đục vi khuẩn và tảo ("giữ xác tảo", UV), dù đã nói nguyên nhân là bùng vi sinh.
- plain, cycling-06 post: "Bạn thay nước thường xuyên nên amonia được loại bỏ": the hobbyist said they only change water now and then, so this misreads them.
- plain, cycling-06 post: "rửa lại [nền] rồi lắp đặt lại": pulling apart a newly planted low-tech tank, often on soil, upsets the plants and the new tank's balance. It isn't needed for a bacterial bloom.
- plain, cycling-06 post: "Tắt đèn 2-3 ngày": this doesn't help a bacterial bloom, which isn't driven by light, and it stresses the new plants.
- plain, cycling-06 post: "Đừng dùng ... UV ... vì có thể làm chậm quá trình hình thành vi sinh": UV only treats bacteria floating in the water. It doesn't hurt the useful bacteria living on the filter.
- plain, cycling-06 post: "Bạn thay nước thường xuyên nên amonia được loại bỏ": bạn ấy nói thùng xốp chỉ thỉnh thoảng mới hút cặn và châm nước, nên X đọc sai câu hỏi.
- plain, cycling-06 post: "Tắt đèn 2-3 ngày... Ánh sáng nhiều làm bloom mạnh hơn": bùng vi khuẩn không phụ thuộc vào ánh sáng, nên tắt đèn chỉ có ích khi đục do tảo.
- ours, cycling-06 tank: "Giảm đèn còn khoảng 8–12 tiếng": 12 tiếng không phải là giảm đèn với bể lowtech mới set, nên để khoảng 6–8 tiếng
- ours, cycling-06 tank: "Giảm đèn còn khoảng 8–12 tiếng": 12 hours is not really a cut during a bloom; 6–8 hours fits better
- plain, cycling-06 tank: "nước rửa chén không mùi" làm nguồn amonia: nước rửa chén là chất tẩy, không phải amonia, đổ vào bể sẽ hại vi sinh và cá
- plain, cycling-06 tank: Cuối bài hỏi lại kích thước bể, trong khi app đã có sẵn thông tin bể 20 cm lowtech
- plain, cycling-06 tank: "nước rửa chén không mùi" as an ammonia source: dish soap is not ammonia, and adding it harms fish
- ours, cycling-07 post: "thay nước 2-3 ngày một lần là quá dày": with brand-new aquasoil, frequent changes in the first 1-2 weeks are normal practice, because the soil releases ammonia. The seller was not wrong for this stage.
- ours, cycling-07 post: "Thay nước 2-3 ngày một lần là quá dày" — với phân nền mới không lọc, thay nước 2-3 ngày một lần trong 2-3 tuần đầu là đúng cách để rút amoniac từ nền ra, không phải quá dày
- plain, cycling-07 post: "Thay nước quá thường xuyên làm mất lượng vi khuẩn có lợi": the bacteria live on the substrate and other surfaces, not in the water, so water changes barely remove them.
- plain, cycling-07 post: "Mỗi lần thay nước, cây và nền aquasoil bị sốc thông số, dễ gây rêu": wrong. Changing water in a new aquasoil tank actually helps cut algae.
- plain, cycling-07 post: "Chỉ thay 10-20% khi nước đục" in weeks 1-3: this ignores the ammonia that new aquasoil releases.
- plain, cycling-07 post: "Không lọc... được nếu hồ nhỏ, ít cây": backwards. A tank without a filter needs many plants.
- plain, cycling-07 post: "Thay nước quá thường xuyên làm mất lượng vi khuẩn có lợi" — vi sinh bám trên nền và bề mặt, không trôi theo nước thay, nên thay nước không làm mất chúng
- plain, cycling-07 post: "Hồ không lọc, không cá thì tải chất thải rất thấp" — phân nền mới nhả amoniac mạnh trong những tuần đầu, nên tải thật ra cao
- plain, cycling-07 post: "Tuần 1-3: chỉ thay 10-20% khi nước đục" — hồ phân nền mới không lọc thì cần thay nhiều và thường xuyên, nếu không sẽ lên rêu
- plain, cycling-07 post: Gợi ý bèo Nhật (lục bình) là cây quá to so với một hồ thủy sinh trong phòng ngủ
- ours, cycling-07 tank: "Vi khuẩn này chỉ hình thành khi có lọc hoạt động liên tục": nói quá. Vi khuẩn còn bám trên nền, cây và mặt kính, nên bể không lọc vẫn cycle được.
- ours, cycling-07 tank: "Ngày đầu thay khoảng 50% nước, sau đó thay khoảng 25 đến 30% mỗi tuần": với phân nền mới đang nhả amoniac, mấy tuần đầu nên thay dày hơn. Ở điểm này lời người bán bảo 2-3 ngày thay một lần lại hợp hơn.
- ours, cycling-07 tank: Câu về thử nghiệm dùng aquasoil, "nên đó không phải lý do để bỏ lọc", khó hiểu, trong khi bể của người hỏi cũng đang dùng phân nền.
- ours, cycling-07 tank: "Vi khuẩn này chỉ hình thành khi có lọc hoạt động liên tục": sai, vi khuẩn vẫn bám và phát triển trên nền, cây và kính khi không có lọc.
- ours, cycling-07 tank: Câu so sánh với aquasoil gây rối: phân nền của họ cũng nhả amoniac giống aquasoil, nên ví dụ đó thật ra liên quan đến bể này chứ không phải để gạt đi.
- plain, cycling-07 tank: "Thay nước liên tục... có thể làm vi khuẩn còn ít bị mất theo": sai. Vi khuẩn nitrat hóa sống bám trên bề mặt chứ gần như không trôi nổi trong nước, nên thay nước không làm mất chúng.
- plain, cycling-07 tank: "Thay nước liên tục ... có thể làm vi khuẩn còn ít bị mất theo": vi khuẩn nitrat hóa bám trên bề mặt và nền chứ không trôi theo nước, nên thay nước gần như không làm mất chúng.
- plain, cycling-07 tank: Đây là bể trồng cây không có lọc, vậy mà nói lọc là "phần quan trọng nhất" của bể là quá mức: bể cây không lọc vẫn có thể ổn nếu thay nước thường xuyên lúc đầu.
- ours, cycling-08 post: Bỏ qua 3 mặt xi măng: xi măng mới làm pH tăng cao, nếu thả cá ngay theo kiểu fish-in là rủi ro lớn
- ours, cycling-08 post: "hồ đặt ngoài trời hứng nắng": hồ nằm dưới mái hiên, nên lời khuyên này không khớp với chỗ đặt hồ của bạn
- ours, cycling-08 post: Tells them to put fish in from day one without mentioning the 3 new cement walls, which push pH and hardness up and can kill fish before the cement is cured
- ours, cycling-08 post: Says the tank 'hứng nắng' (sits in direct sun), but the hobbyist said it is under the roof overhang
- plain, cycling-08 post: Gợi ý ông tiên cho hồ 30 lít chỉ cao 20 cm: cá ông tiên lớn lên cao thân, hồ này không đủ chỗ
- plain, cycling-08 post: Xếp trân châu vào nhóm cây dễ, không cần CO2: trân châu thường cần đèn mạnh và CO2
- plain, cycling-08 post: Nói xốp tiếp xúc với nước là "không an toàn": thật ra xốp khá trơ, chỉ là dễ vỡ
- plain, cycling-08 post: Lists 'ông tiên' (angelfish) for a ~30 L tank, but angelfish grow too big and too tall for it
- plain, cycling-08 post: Calls 'trân châu' an easy plant that needs no CO2, but carpeting trân châu usually struggles without CO2 and strong light
- plain, cycling-08 post: Suggests 'bèo tây' and 'rau muống nước', which are too big for a 40x40 tank
- ours, cycling-08 tank: "1 con nhỏ cho mỗi 38 lít": quy đổi máy móc từ quy tắc 10 gallon, với bể 32 lít thì ra chưa tới một con, người đọc không dùng được
- ours, cycling-08 tank: "bật đèn và nhiệt": bể thùng xốp trên sân thượng ở Việt Nam thì không cần sưởi; cái phải lo là nước nóng lên và nhiệt độ dao động trong bể cạn 20 cm
- ours, cycling-08 tank: Nói bể chưa có cá thì chưa có gì để xử lý nhưng không chỉ cách tạo nguồn amoniac (thả chút thức ăn) để chạy bể không cá
- ours, cycling-08 tank: Xi măng mới phải ngâm xả cho hết vôi kiềm, chứ không chỉ kiểm tra chống thấm
- ours, cycling-08 tank: "1 con nhỏ cho mỗi 38 lít": a 10-gallon rule converted straight to litres. For a 32 L tank it means less than one fish, so it doesn't work as advice.
- ours, cycling-08 tank: "bật đèn và nhiệt": a heater isn't needed on a hot rooftop in Vietnam, and the answer never mentions rooftop overheating.
- plain, cycling-08 tank: "Bạn chưa cho biết dung tích bể và loại lọc": app đã có sẵn kích thước bể và lọc Sobo 400 l/h, nên câu trả lời thành chung chung và quay sang hỏi lại
- ours, sick-01 post: Nhiệt độ "18–25°C" quá thấp và không hợp Việt Nam: nước bể ở nhà thường 27–30°C, và cá ngựa vằn vẫn sống tốt ở mức đó, nên người nuôi có thể hoang mang hoặc cố hạ nhiệt.
- ours, sick-01 post: Bỏ sót bệnh lao cá (Mycobacterium), một nguyên nhân phổ biến làm cá ngựa vằn già bị cong cột sống và gầy dần.
- ours, sick-01 post: "nhiệt độ 18–25°C": in Vietnam tanks normally sit at 28–30°C and zebra danios handle that fine. Telling the hobbyist to hold 18–25°C isn't practical there and isn't what's causing the losses
- plain, sick-01 post: Hiểu nhầm cá ngựa vằn thành "chim sẻ ngựa vằn" (zebra finch), nên toàn bộ phần chẩn đoán bệnh chim (Chlamydia, Bornavirus, kẹt trứng) và cách chăm sóc chuồng chim đều không dùng được cho đàn cá.
- plain, sick-01 post: "chim sẻ ngựa vằn xanh (zebra finch)": the hobbyist is asking about zebra danios (cá ngựa vằn), not birds, so the whole answer is about the wrong animal
- plain, sick-01 post: Advice on an avian vet, Chlamydia, egg binding and cages has nothing to do with an aquarium
- ours, sick-01 tank: 'Cá ngựa vằn hợp 18–25°C' — too narrow and cool. Zebra danios do fine at 26–28°C, so this figure would worry someone keeping fish at Vietnamese room temperature for no reason.
- ours, sick-01 tank: 'dị tật bẩm sinh' is offered as a possible cause, but fish that have lived nearly 3 years without problems are unlikely to have a birth defect. Old age is the more likely non-disease cause, and X leaves it out.
- ours, sick-01 tank: Đưa "dị tật bẩm sinh" vào nguyên nhân là không hợp với cá đã nuôi gần 3 năm rồi mới cong người.
- ours, sick-01 tank: Ghi 18–25°C từ thẻ loài: mức này thấp so với nhiệt độ bể bình thường ở Việt Nam, trong khi cá ngựa vằn vẫn sống tốt ở 26–28°C.
- ours, sick-01 tank: Đoạn trích về cá neon dị dạng do khâu sinh sản ít liên quan, dễ làm người đọc hiểu nhầm.
- plain, sick-01 tank: Lists Pleistophora as a separate 'ký sinh trùng đơn bào'. It is a microsporidian closely related to Pseudoloma, which Y already covered, so this is a double count with the wrong label.
- plain, sick-01 tank: Calls bad water 'nguyên nhân gây chết hàng loạt' and tells them to quarantine new fish, but here fish die one at a time every few weeks and no new fish have been added.
- plain, sick-01 tank: "ngâm trong nước đá lạnh": an tử bằng nước đá được nhiều người coi là không nhân đạo với cá nhiệt đới nhỏ. Dùng quá liều tinh dầu đinh hương thì nên hơn.
- plain, sick-01 tank: Gọi Pleistophora là "ký sinh trùng đơn bào" là chưa chính xác. Đây là microsporidia, cùng nhóm với Pseudoloma mà X đã nêu.
- ours, sick-02 post: "Cá vàng và cá bảy màu thải rất nhiều chất bẩn": cá vàng thì đúng, nhưng cá bảy màu thải ít.
- ours, sick-02 post: "Cá vàng và cá bảy màu thải rất nhiều chất bẩn": cá vàng thải nhiều, còn cá bảy màu là loài nhỏ, thải ít, nên câu này gộp hai loài sai.
- plain, sick-02 post: "Chỉ khi nước đục mới thay thì đã muộn, vì nitrat đã tích tụ lâu": nước đục không liên quan gì đến nitrat, nên lý do đưa ra ở đây là lẫn lộn.
- ours, sick-02 tank: "chuyển cá sang bể tạm, vệ sinh và chạy lại toàn bộ hệ lọc" khi pH dưới 6: làm lại toàn bộ lọc sẽ xóa sạch vi sinh, trong khi bể này đang mất vi sinh sẵn. Chỉ nên thay nước dần để nâng pH và KH lên.
- plain, sick-02 tank: "thay nước quá nhiều" làm mất vi khuẩn có lợi: vi khuẩn lọc sống chủ yếu trong vật liệu lọc, không phải trong cột nước, nên thay nhiều nước không phải là nguyên nhân chính
- plain, sick-02 tank: Hỏi lại dung tích, loài cá, cách thay nước dù app đã có các thông tin này, nên câu trả lời không bám vào bể của người hỏi
- ours, sick-03 post: "tăng dần lên khoảng 1 bọt/giây mỗi 10 lít": đây không phải quy tắc chuẩn. Với hồ lớn có tép, làm theo cách này dễ quá liều CO2.
- ours, sick-03 post: Đoạn trích về ốc bladder và mồi ống xi phông không liên quan, chỉ làm dài thêm.
- ours, sick-03 post: "1 bọt/giây mỗi 10 lít" is only a loose rule of thumb, and the attached excerpt about bladder snails does not fit the question.
- plain, sick-03 post: "pH 7 và KH 4, CO2 chỉ khoảng 2-3 mg/L": tính đúng ra khoảng 12 mg/L.
- plain, sick-03 post: "KH cao làm đệm pH nên CO2 không hạ được pH": KH 4 không cao. Lượng CO2 hòa tan phụ thuộc vào lượng bơm vào, không tự tăng lên khi hạ KH.
- plain, sick-03 post: Đặt mục tiêu TDS 150-220 nhưng hỗn hợp pha lại cho TDS 80-100, hai con số mâu thuẫn nhau.
- plain, sick-03 post: Bỏ qua điểm chính: TDS hồ 360 trong khi nước nguồn chỉ 160-200, tức là chất đang tích tụ trong hồ.
- plain, sick-03 post: "pH 7 và KH 4 ... CO2 chỉ khoảng 2-3 mg/L": the standard table gives about 12 mg/L for these numbers, so this figure is wrong.
- plain, sick-03 post: "KH cao làm đệm pH, nên CO2 bơm vào không hạ được pH": KH 4 is not high, and KH does not stop CO2 from dissolving. Lowering KH does not add CO2; it only changes what the pH reads.
- plain, sick-03 post: "Khi KH giảm xuống 2-3 ... CO2 hoà tan sẽ tăng lên 10-20 mg/L": the reasoning is wrong; lowering KH does not raise dissolved CO2.
- plain, sick-03 post: It puts the blame on water hardness and leaves out that TDS rising from 160-200 to 360 points to built-up fertilizer and waste.
- ours, sick-03 tank: Bảo 'đừng đông lạnh' con chết nhưng không dặn để ngăn mát, nên lời dặn bảo quản xác để soi nguyên nhân chưa đủ rõ
- ours, sick-03 tank: Cảnh báo dư CO2 mà không nhắc test CO2 của bạn đang báo thiếu, và với pH 7, KH 4 thì CO2 trong bể thực ra đang thấp
- plain, sick-03 tank: Viết 'Caridina (cherry đỏ, tiger, bee...)' là sai: red cherry thuộc Neocaridina, không phải Caridina
- plain, sick-03 tank: Hỏi lại loài tép, cá, TDS, pH, GH, KH dù những thông tin này đã có trong hồ sơ bể
- plain, sick-03 tank: "Caridina (cherry đỏ, tiger, bee...)": sai, cherry đỏ là Neocaridina chứ không phải Caridina
- plain, sick-03 tank: Hỏi lại loài nuôi, TDS/pH/GH/KH và TDS nước máy, trong khi các số này đã có sẵn
- ours, sick-04 post: "nếu vỏ mòn thêm thì cân nhắc bổ sung khoáng": vảy ốc xanh/đỏ là cây Rotala chứ không phải con ốc, nên câu này hiểu sai cả vấn đề
- ours, sick-04 post: Có câu nhắc tới cái 'cẩm nang' của chính trợ lý. Câu đó vô ích với người đọc và không giúp đoán được cái gì đã làm tép chết
- ours, sick-04 post: 'nếu vỏ mòn thêm thì cân nhắc bổ sung khoáng': câu này cũng hiểu vảy ốc (cây Rotala) thành con ốc có vỏ.
- plain, sick-04 post: "Vết gãy đỉnh vỏ thường do nước acid... Ốc vẫn xanh": nhầm cây vảy ốc (Rotala) thành con ốc. Cả mục 5 dựa trên cách hiểu sai đó
- plain, sick-04 post: Mục 'Ốc': 'Vết gãy đỉnh vỏ thường do nước acid tạm thời hoặc thiếu canxi'. Vảy ốc ở đây là cây Rotala chứ không phải con ốc, nên chẩn đoán vỏ ốc thiếu canxi là sai đối tượng.
- ours, sick-04 tank: "tăng dần bằng sản phẩm nâng KH": bể có đá da voi (đá vôi) và pH 8,4 nên KH gần như chắc chắn đang cao, gợi ý nâng KH ở đây là lạc hướng
- ours, sick-04 tank: "tăng dần bằng sản phẩm nâng KH": bể có núi đá da voi trắng và pH 8,4 thì KH gần như chắc chắn cao, nên lời khuyên này khó dùng được với bể này (dù Y có ghi điều kiện là chỉ làm khi KH thấp).
- plain, sick-04 tank: "Thay 30–50% nước": nước đầu vào pH ≤7,0 mà bể đang 8,4, thay nhiều như vậy lúc tép đang sốc dễ làm pH dao động thêm
- plain, sick-04 tank: "ngâm túi nước tép 30–60 phút": nói chuyện thả tép mới, không liên quan đến tình huống tép đang chết trong bể
- plain, sick-04 tank: "Tép Neocaridina... cần pH trung tính, khoảng 6.5–7.5": cách nói này quá hẹp, Neocaridina vẫn chịu được pH khoảng 7–8, nên dễ khiến người nuôi cố hạ pH thêm.
- plain, sick-04 tank: "nhả axit hoặc tannin": Neo Soft là vật liệu đệm hạ pH/KH chứ không phải nguồn tannin, nên nói vậy là nhầm cơ chế.
- ours, sick-05 post: Calls a pH drop 'hội chứng bể cũ'. That is old tank syndrome, and it doesn't fit a 2-month tank. Here the likely cause is CO₂ in water with almost no KH.
- ours, sick-05 post: Tells them to measure dissolved oxygen. Most hobbyists in Vietnam have no way to test it, so the step is hard to act on.
- ours, sick-05 post: "Màu vàng nâu thường do lũa... nhả tannin": khẳng định nguyên nhân dù người hỏi không hề nhắc tới lũa.
- ours, sick-05 post: Gọi pH dưới 6 là "hội chứng bể cũ" ở một bể mới 2 tháng là sai. Bể này có CO2, nên pH tụt rất có thể do bơm CO2 nhiều khi KH thấp, mà Y bỏ qua hẳn khả năng đó.
- ours, sick-05 post: Bảo đo oxy hòa tan: người chơi bình thường hầu như không có dụng cụ đo được.
- plain, sick-05 post: Lists Seachem Equilibrium as a way to keep KH stable. Equilibrium only raises GH, not KH.
- plain, sick-05 post: "Nước lọc/nước đóng chai (RO) gần như không có khoáng": không phải nước uống đóng chai nào cũng là RO. Một số loại là nước khoáng, nên nói vậy hơi quá.
- ours, sick-05 tank: "old tank syndrome: bể đã chạy lâu": cái bể này mới chạy 8,6 tuần, chưa phải bể lâu năm.
- ours, sick-05 tank: "chỉ thay khoảng 10%... đây là lỗi chính": người hỏi thay 50% nước cách ngày. Thay quá ít không phải nguyên nhân.
- ours, sick-05 tank: "Tăng lượng thay lên khoảng 30–40% mỗi tháng": như vậy là thay ít hơn rất nhiều so với hiện tại. Lời khuyên này mâu thuẫn và làm người đọc hiểu sai.
- ours, sick-05 tank: "khoáng từ nước máy tích dần": người hỏi dùng nước uống đóng bình, không dùng nước máy. Vấn đề có khả năng là nước thiếu khoáng chứ không phải khoáng tích tụ.
- ours, sick-05 tank: "old tank syndrome: bể đã chạy lâu" — bể mới chạy 8,6 tuần, tức là còn mới
- ours, sick-05 tank: "khoáng từ nước máy tích dần" — họ dùng nước lọc đóng bình, nên vấn đề là thiếu khoáng chứ không phải khoáng tích tụ
- ours, sick-05 tank: Đoán là chỉ thay 10% nước, trong khi thực tế họ thay 50% cách ngày
- ours, sick-05 tank: "Tăng lượng thay lên khoảng 30–40% mỗi tháng" — mức này còn ít hơn nhiều so với lượng họ đang thay, và nói ngược với chính lập luận của câu trả lời
- plain, sick-05 tank: Cho rằng nước thay là nước máy chứa chloramine, trong khi người này thay bằng nước uống đóng bình, gần như không có khoáng; bỏ qua việc KH gần 0 cộng với CO₂ làm pH sụt mạnh
- ours, sick-06 post: "Tạm ngừng cho ăn hẳn một bữa": cá đã bỏ ăn gần 1 tuần, cá mồi vẫn có sẵn trong bể, nên bảo ngừng cho ăn là thừa và không hợp với tình huống.
- ours, sick-06 tank: "giữ trong khoảng 22–28°C": 22°C is too low for arowana. In Vietnam they are usually kept at 26–30°C.
- ours, sick-06 tank: "mồi sống đã rã đông": tự mâu thuẫn, mồi sống thì không rã đông được
- ours, sick-06 tank: "22–28°C": hơi thấp so với mức 26–30°C người chơi cá rồng hay giữ, nhưng vẫn ổn với khí hậu nóng ở VN
- plain, sick-06 tank: "Nếu cá vẫn bỏ ăn quá 2 tuần... thì cần can thiệp": waiting two weeks is too relaxed. In a 1-week-old tank that hasn't cycled, ammonia can build up quickly.
- ours, sick-07 post: "1 muỗng canh cho 11,4 lít" là quy đổi từ gallon Mỹ, con số lẻ trông như chính xác giả, với người Việt thì nên nói theo g/lít
- ours, sick-07 post: "muối ăn có i-ốt không nên dùng" là nói quá: lượng i-ốt nhỏ thường không gây hại, cái đáng tránh là chất chống đóng cục
- ours, sick-07 post: "1 muỗng canh muối cho 11,4 lít nước": con số 11,4 lít đổi máy móc từ 2,5 gallon của Mỹ, trông chính xác giả tạo. Liều thì vẫn an toàn (khoảng 1,5 g/l).
- ours, sick-07 post: "không chất chống đông": dịch sai, đúng ra là chất chống đóng vón (chống đóng cục).
- plain, sick-07 post: "Nếu em đã vứt nền sỏi cũ thì không sao" bỏ qua việc mất nền là mất vi sinh, có thể làm vỡ chu trình nitơ và tăng amoniac, mà đây chính là nguyên nhân dễ gây bệnh
- plain, sick-07 post: "Nếu em đã vứt nền sỏi cũ thì không sao": bỏ hết nền sỏi là mất một phần lớn vi sinh, nên bể dễ bị vọt amoniac. Đó chính là nguyên nhân dễ làm cá yếu, không phải chuyện "không sao".
- plain, sick-07 post: Dành phần lớn bài nói về đốm trắng (Ich) trong khi người hỏi tả là búi "như nấm trắng". Bài cũng không nhắc tới columnaris, bệnh rất hay bị nhầm với nấm ở nước nóng như Việt Nam.
- ours, sick-07 tank: "không dùng muối ăn hay muối biển": muối hột không i-ốt, loại người chơi ở Việt Nam hay dùng, vẫn dùng được, nên câu này làm người hỏi tưởng họ đang dùng sai muối
- ours, sick-07 tank: "Nếu nấm lan... hãy làm thêm bước điều trị ngay": không nói bước đó là gì (xanh methylene hay thuốc trị nấm), nên người hỏi không biết làm gì tiếp
- ours, sick-07 tank: "không dùng muối ăn hay muối biển": người nuôi đã dùng muối hột, loại muối không i-ốt mà dân chơi cá ở Việt Nam vẫn dùng bình thường, nên câu này làm họ hoang mang không cần thiết
- ours, sick-07 tank: "1 muỗng canh cho 11,4 lít" chỉ là quy đổi từ 3 gallon của Mỹ, không ghi gam/lít, và trích đoạn bên dưới lại bảo có thể đổ muối thẳng vào, mâu thuẫn với lời dặn pha sẵn ở trên
- ours, sick-07 tank: "Giữ muối đến khi cá trông khỏe hẳn" không cho số ngày điều trị cụ thể
- plain, sick-07 tank: Cho cá ông tiên vào nhóm nhạy muối là sai: ông tiên chịu được muối liều thấp
- plain, sick-07 tank: "cá nhạy cảm với muối như... cá ông tiên": cá ông tiên chịu được muối ở liều điều trị, nên xếp chúng vào nhóm nhạy cảm là không đúng
- ours, sick-08 post: "Với đàn otto còn lại" / "Theo dõi đàn otto còn lại": người hỏi nói cả 3 con đã chết hết, nên không còn con nào để theo dõi
- ours, sick-08 post: Đặt thiếu oxy lên đầu dù đàn neon trong cùng bể vẫn khỏe. Bỏ qua các nguyên nhân hay gặp hơn với otto mới thả: cá yếu hoặc đói từ trước khi mua, sốc khi thả, thuốc diệt rêu
- ours, sick-08 post: "Với đàn otto còn lại" / "Theo dõi đàn otto còn lại": cả 3 con đã chết hết, không còn con nào, nên cho thấy đọc sai tình huống
- ours, sick-08 post: Cho thiếu oxy là nguyên nhân hàng đầu, trong khi đàn neon cùng bể vẫn ổn, và bỏ qua các khả năng hợp hơn như cá yếu và đói sẵn từ lúc nhập, thuần nước chưa kỹ, hay dư thuốc diệt rêu
- plain, sick-08 post: Gợi ý thả ốc táo để trị rêu: ốc táo có thể ăn cây thủy sinh, không hợp với bể thủy sinh
- plain, sick-08 post: "ốc táo" được gợi ý để trị rêu, nhưng ốc táo hay ăn cây thủy sinh nên không hợp với bể cây
- ours, sick-08 tank: "đồng trên 0,2 mg/L giết cá đột ngột": with ottos, copper is dangerous well below 0.2 mg/L, so this threshold makes it sound safer than it is
- ours, sick-08 tank: "đồng trên 0,2 mg/L giết cá đột ngột": otto là loài cá da trơn rất nhạy cảm, có thể chết ở nồng độ đồng thấp hơn nhiều, nên câu này dễ khiến người đọc nghĩ dưới mức đó là an toàn
- ours, sick-08 tank: Hỏi lại số otto đã mua trong khi đã biết là 3 con
- plain, sick-08 tank: "bể mới thường không có đủ rêu, nên chúng dễ đói": bể này đang có rêu hại, nên đói qua một đêm không phải nguyên nhân hợp lý
- ours, sick-09 post: "Trời lạnh nước giữ oxy kém": sai, nước lạnh hòa tan được nhiều oxy hơn nước ấm
- ours, sick-09 post: Đoạn trích về sưởi 1 W/lít không hợp với hồ ngoài trời 1,35 khối (phải cần sưởi khoảng 1.350 W), lại không ăn nhập với câu hỏi
- ours, sick-09 post: Bỏ qua khả năng bệnh/ký sinh trùng do cá mới mang vào, dù koi chết chỉ sau vài ngày
- ours, sick-09 post: "Trời lạnh nước giữ oxy kém": sai, nước lạnh hòa tan được nhiều oxy hơn
- ours, sick-09 post: Trích đoạn chọn sưởi 1 W/lít dành cho bể kính trong nhà, không hợp với hồ ngoài trời 1,35 khối
- ours, sick-09 post: Không nhắc tới bệnh cá mới mang vào như KHV hay ký sinh trùng, dù koi chết chỉ vài ngày sau khi mua
- plain, sick-09 post: "nên giữ khoảng 5-6 con" cho 1.350 lít: con số này mâu thuẫn với câu trước, nơi X nói 6-7 con là đông, và vẫn quá nhiều nếu là koi lớn
- ours, sick-09 tank: Đổ cho old tank syndrome 'cá cũ vẫn khỏe': hồ koi mới thả thì chết, nên khả năng cao là hồ chưa chín, sốc hoặc bệnh, không phải nitrate tích lâu năm
- ours, sick-09 tank: '1 W cho mỗi lít' sưởi: hồ ngoài trời khoảng 1.350 L thì phải ~1.350 W, vừa không thực tế vừa không cần cho koi, cá chép là cá nước lạnh
- ours, sick-09 tank: Khuyên đậy nắp cho hồ ngoài trời mà không nói gì đến chuyện hồ chỉ sâu 30 cm, nhiệt độ dao động mạnh
- ours, sick-09 tank: Kết luận nguyên nhân chính là old tank syndrome và "cá cũ vẫn khỏe": không có gì cho thấy điều này. Cá chết ngay sau khi thả hợp với bể chưa chín, bệnh theo cá mới hoặc sốc nhiệt hơn.
- ours, sick-09 tank: "1 W cho mỗi lít": hồ 300×150×30 cm khoảng 1.350 lít, tức cần sưởi khoảng 1.350 W cho hồ ngoài trời. Con số này không thực tế với hồ koi.
- ours, sick-09 tank: "đậy nắp": lời khuyên này hợp với bể kính trong nhà, không hợp với hồ koi ngoài trời.
- plain, sick-09 tank: Mục tiêu sưởi 24–27°C là cho cá nhiệt đới, không hợp với koi ở hồ ngoài trời
- plain, sick-09 tank: "thường 24–27°C cho cá nhiệt đới" kèm máy sưởi: koi/chép trong hồ ngoài trời không cần sưởi tới mức cá nhiệt đới. Cái cần là giữ nhiệt ổn định và tránh sốc nhiệt.
- ours, stocking-01 post: "Nếu có số đo, thay khoảng 30% nước": viết khó hiểu. Thay nước thì nên làm ngay, không cần chờ có số đo.
- ours, stocking-01 post: "Nếu có số đo, thay khoảng 30% nước": câu này tối nghĩa, nên thay nước bất kể đã đo hay chưa
- plain, stocking-01 post: "Cá 7 màu (họ cichlid) có tính lãnh thổ, hung dữ": sai. Cá 7 màu (guppy) thuộc họ cá đẻ con Poeciliidae, rất hiền.
- plain, stocking-01 post: "7 màu trưởng thành cần khoảng 100 lít trở lên": sai. Guppy nuôi bể nhỏ hơn nhiều vẫn ổn.
- plain, stocking-01 post: "Dọn bể cần nền cát mịn, nước mát": sai với các loại cá dọn bể bán ở VN (pleco, otto, mút đá), đều là cá nhiệt đới.
- plain, stocking-01 post: Liệt kê "7 màu... cá bảy màu" như hai loài khác nhau, cho thấy người viết nhầm loài.
- plain, stocking-01 post: Tự cho là "bể mới chạy vài tuần" trong khi người hỏi không nói vậy.
- plain, stocking-01 post: "Cá 7 màu (họ cichlid) có tính lãnh thổ, hung dữ": cá 7 màu (guppy) thuộc họ Poeciliidae, là cá đẻ con hiền, không phải cichlid
- plain, stocking-01 post: "7 màu trưởng thành cần khoảng 100 lít trở lên": guppy nuôi tốt trong bể nhỏ hơn nhiều, con số này bịa
- plain, stocking-01 post: "Dọn bể cần nền cát mịn, nước mát": cá dọn bể bán ở VN là cá nhiệt đới, không cần nước mát
- plain, stocking-01 post: Tự mâu thuẫn: lúc nói nước bẩn là nguyên nhân 'khả năng cao nhất', lúc lại bảo không hợp loài là 'lý do chính'
- ours, stocking-01 tank: "cá tỳ bà leopard": the tank only lists 'cá dọn bể', so the leopard species is made up
- ours, stocking-01 tank: Says the tỳ bà 'có thể ăn cá bảy màu': plecos mostly eat fish that are already dead, they rarely hunt live adult guppies
- ours, stocking-01 tank: Doesn't mention the gobies (bống) as possible predators, or guppies jumping out of the tank
- ours, stocking-01 tank: "cá tỳ bà leopard": hồ sơ chỉ ghi "cá dọn bể", tên loài này là tự đoán thêm
- ours, stocking-01 tank: "cá tỳ bà ... có thể ăn cá bảy màu": tỳ bà gần như không săn bảy màu còn sống, chỉ ăn xác cá đã chết
- ours, stocking-02 post: "mún (molly)": in Vietnam, cá mún is the platy (Xiphophorus maculatus). Molly is cá bình tích, so the whole compatibility answer is about the wrong fish.
- ours, stocking-02 post: "mún và neon thường không hợp nhau": platies and neons that are farmed and sold in Vietnam live together fine in ordinary tap water. This is a very common pairing.
- ours, stocking-02 post: "bể nên khoảng 90 cm... bể 60 cm đã hơi chật cho 5 mún": the molly tank size applied to platies, which are fine in a 60 cm tank.
- ours, stocking-02 post: Suggesting only 8–10 neons is too cautious for a 96 L tank.
- ours, stocking-02 post: "mún (molly) và neon thường không hợp nhau": this overstates the problem. Farm-bred neons sold in Vietnam adapt to the medium hardness and pH of local tap water, and molly and neon are kept together commonly and successfully.
- ours, stocking-02 post: "thả một nhóm nhỏ khoảng 8–10 con": this is too conservative for about 96 L that only holds 5 mollies and 5 corys. Around 15–20 neons would be fine once the tank has cycled.
- plain, stocking-02 post: Doesn't know what cá mún is and asks back. Any Vietnamese hobbyist knows mún means platy, a peaceful fish that is fine with neons.
- plain, stocking-02 post: Doesn't know that "mún" is the common Vietnamese name for molly. It asks which species it is and gives generic warnings about aggressive or cold-water fish, so the main question goes unanswered.
- plain, stocking-02 post: "5 con cá chuột là hơi ít, nên nuôi theo nhóm 6 con trở lên": calling 5 too few when the minimum is 6 is nitpicking. It also pushes the keeper to add more fish to a 1-week-old tank.
- ours, stocking-02 tank: Says 'Mình không tìm thấy cá nào tên mún' right after counting 5 platy. Mún is platy, so X contradicts itself.
- ours, stocking-02 tank: 'chuột đồng... cần bể dài từ 80 cm': common corydoras do fine in a 60 cm tank, so this claim is dubious.
- ours, stocking-02 tank: '195% so với sức chứa' is a figure with no basis shown.
- ours, stocking-02 tank: It never says that a tank running only one week isn't cycled yet, so adding 40 neons at once is risky.
- ours, stocking-02 tank: "195% so với sức chứa": the precision looks made up
- ours, stocking-02 tank: "chuột đồng cần bể dài từ 80 cm": bronze corys do fine in a 60 cm tank
- ours, stocking-02 tank: Says "5 platy" and then says it found no fish called "mún", which contradicts itself
- ours, stocking-02 tank: Ignores that the tank has run only 1 week; adding 40 fish at once to an uncycled tank is the main risk
- plain, stocking-02 tank: 'Cá ông tiên (otocinclus)' is wrong. Cá ông tiên is angelfish, which eats neons, and otocinclus is a different fish.
- plain, stocking-02 tank: '40 con thường không quá nhiều' with 100–120 L as the threshold sounds reassuring for a 96 L tank that already holds 10 fish and is only one week old.
- plain, stocking-02 tank: It ignores the known tank details and asks for the size and for what mún is.
- plain, stocking-02 tank: "cá ông tiên (otocinclus)": ông tiên is angelfish, which eats neons, not otocinclus
- plain, stocking-02 tank: Does not recognise "mún" as platy, a common Vietnamese name, and asks for it back
- ours, stocking-03 post: "quy tắc khoảng 2 lít nước cho một con cá nhỏ khi không có lọc... chỉ nên có khoảng 6 con nếu không có lọc": bịa ra quy tắc, và gợi ý nuôi cá trong bể 15 lít không có lọc là rủi ro cho người mới
- ours, stocking-03 post: Thẻ loài ember tetra ghi "bể từ 45 cm" nhưng vẫn gợi ý cho bể 35 cm, tự mâu thuẫn
- ours, stocking-03 post: "chạy ít nhất 1 đến 2 tuần": quá ngắn để chu trình nitơ hoàn tất, lại mâu thuẫn với câu "vài tuần" ở trên
- ours, stocking-03 post: Gợi ý cá neon và cá chuột lùn cho bể 15 lít: chật, cá chuột lùn lại cần nền cát và bể ổn định
- ours, stocking-03 post: "khoảng 2 lít nước cho một con cá nhỏ khi không có lọc... khoảng 6 con nếu không có lọc hay sục khí": quy tắc tự đặt ra, nghe như bể không lọc nuôi được 6 con, dễ làm người mới chết cá.
- ours, stocking-03 post: Gợi ý nuôi ember tetra trong khi thẻ loài ngay bên dưới ghi "bể từ 45 cm", trái với bể 35 cm của bạn ấy.
- ours, stocking-03 post: "chạy ít nhất 1 đến 2 tuần": quá ngắn cho người mới, dù có kèm điều kiện test.
- plain, stocking-03 post: "cá neon (5-6 con)" trong 15 lít: neon là cá bơi nhiều, hơi chật cho bể 35cm, nhất là với người mới.
- ours, stocking-03 tank: "cá hồng nhung (harlequin rasbora)": harlequin dài tới khoảng 4–5 cm, quá lớn để nuôi 6–8 con trong 15 lít, và ở VN harlequin thường gọi là cá tam giác chứ không phải hồng nhung
- ours, stocking-03 tank: Gợi ý nuôi 6–8 con neon trong 15 lít là khá chật cho người mới
- ours, stocking-03 tank: "cá hồng nhung (harlequin rasbora)... 6 đến 8 con": harlequin lớn tới khoảng 4–5 cm và bơi nhiều, nên không hợp bể khoảng 15 lít
- ours, stocking-03 tank: Đề xuất 6–8 con neon trong 15 lít là hơi chật với người mới, nhất là khi trời nóng ở Việt Nam (neon chịu nhiệt kém, trên khoảng 28°C dễ yếu). Bảy màu, endler hoặc 1 con betta hợp hơn
- ours, stocking-04 post: Gives tankmate advice for 'bống đế vương', a different fish from the algae-eating 'bống vàng', so it doesn't apply here.
- ours, stocking-04 post: 'không cho ăn lâu ngày có thể bẩn nước': not feeding doesn't foul the water. Leftover food does.
- ours, stocking-04 post: Nhắc tới 'bống đế vương' và các loài nên tránh của nó: đó là loài khác, không liên quan, dễ làm người đọc rối.
- plain, stocking-04 post: Treats it as a true goby that 'ăn cá nhỏ'. The algae-scraping bống vàng (Gyrinocheilus) doesn't eat fish. It latches onto them and sucks their slime coat, and Y never mentions this, though it's the real cause.
- plain, stocking-04 post: Says the bống is 'thường không phải nguyên nhân chính', which plays down the most likely cause.
- plain, stocking-04 post: "Bống chủ yếu ăn đáy và ăn cá nhỏ": con 'bống vàng' ăn rêu, bám đá là cá mút đá/chuột vàng (Gyrinocheilus), không phải bống thật. Nó không ăn cá mà hại cá bằng cách mút nhớt.
- plain, stocking-04 post: Cho rằng thiếu thức ăn là nguyên nhân 'đáng nghi nhất' và bỏ qua thói mút nhớt, tức nguyên nhân rõ nhất.
- plain, stocking-04 post: Gợi ý nuôi neon, rasbora chung với nó: những cá nhỏ này vẫn bị mút nhớt.
- ours, stocking-04 tank: Says for certain that "bể đã chạy lâu mà ít thay nước", but nothing in the tank info says how long the tank has run or how often the water is changed; it misses the more likely cause: an algae-eating 'bống vàng' is often a gold Chinese algae eater, which as it grows sucks the slime coat off other fish
- ours, stocking-04 tank: Khẳng định old tank syndrome là nguyên nhân chính dù không biết bể chạy bao lâu hay lịch thay nước; chưa xét đến khả năng bống vàng cần nước lợ/hung dữ hoặc không hợp với cá mún, cá kiếm
- plain, stocking-04 tank: "Tiger Barb ít hung dữ": tiger barbs are well-known fin-nippers
- plain, stocking-04 tank: Suggests cá bảy màu for a small tank, but bảy màu already died one by one in this tank
- plain, stocking-04 tank: Asks which fish they keep, which the app already shows (bống vàng)
- plain, stocking-04 tank: "Tiger Barb ít hung dữ": cá tứ vân (tiger barb) nổi tiếng hay rỉa vây, không phải loại hiền
- plain, stocking-04 tank: Gợi ý lại bảy màu cho bể nhỏ dù chủ bể đã nuôi bảy màu và cá chết dần, không xét đến tình trạng thực tế
- ours, stocking-05 post: Assumes 'cá chép' means koi, but the hobbyist could have bought common carp (chép thường)
- ours, stocking-05 post: The koi card says 'tính peaceful', which clashes with the attacks the hobbyist describes and isn't explained
- ours, stocking-05 post: 'không nuôi chung cá vàng với loài nhỏ mà chúng có thể nuốt' doesn't apply here and is just filler
- ours, stocking-05 post: Mặc định con cá là koi trong khi bạn ấy chỉ nói "cá chép"; khuyên chuyển ra hồ ngoài trời 1000 L thì phần lớn người nuôi ở Việt Nam khó làm được
- plain, stocking-05 post: 'tính hung' overstates it: carp aren't normally aggressive, and the attacks more often come from size difference and fighting over food
- plain, stocking-05 post: "tính hung, hay rượt và cắn cá nhỏ hơn" – chép/koi vốn hiền; cắn nhau thường là do tranh ăn, bể chật hoặc mùa sinh sản rượt đuổi, không phải bản tính hung dữ
- ours, stocking-05 tank: "bể hiện tại chỉ có một con cá vàng và một con chép... bể hiện tại không đủ": X không biết số cá hay dung tích bể, đây là đoán.
- ours, stocking-05 tank: Thẻ loài ghi koi 'tính peaceful', trái với lời khuyên tách cá trong chính câu trả lời.
- ours, stocking-05 tank: "bể hiện tại chỉ có một con cá vàng và một con chép": the tank data doesn't show the number of fish, so this is assumed
- ours, stocking-05 tank: The species card says koi are "peaceful" while the text says the fish is aggressive, which may confuse the reader
- plain, stocking-05 tank: "Nhu cầu nhiệt độ và nước hơi khác nhau": chép và cá vàng cùng họ, nhu cầu nước gần như giống nhau, nên lý do này sai.
- plain, stocking-05 tank: Gợi ý đổi sang cá neon, bảy màu, ông tiên: cá vàng dễ ăn neon và bảy màu nhỏ, cá ông tiên lại hay rỉa vây cá vàng, nên đây không phải bạn cùng bể hợp.
- plain, stocking-05 tank: "Nếu muốn giữ cả hai... phải tách riêng hoàn toàn": câu này tự mâu thuẫn.
- plain, stocking-05 tank: "đổi sang loài hiền hơn như cá tích, cá neon, cá bảy màu, cá ông tiên": these are tropical fish that need warmer water than goldfish, and goldfish can eat neons, so they are poor tankmates for the remaining goldfish
- plain, stocking-05 tank: "Nếu muốn giữ cả hai... phải tách riêng hoàn toàn": this contradicts itself and is unclear
- ours, stocking-06 post: "thay mút lọc nếu đã bẩn": in a newly set-up tank, replacing the sponge throws away the beneficial bacteria and makes the smell and ammonia worse. Rinse it in old tank water instead.
- ours, stocking-06 post: "cá kiếm có thể cắn vây... gây căng thẳng" cho platy: overstated. Swordtails usually live fine with platies; the trouble is mostly males fighting each other.
- ours, stocking-06 post: "thay mút lọc nếu đã bẩn": bể mới set mà thay mút lọc sẽ làm mất vi khuẩn có lợi, khiến mùi hôi và amoniac nặng hơn. Chỉ nên giũ mút trong nước bể
- ours, stocking-06 post: "cá kiếm cần bể khoảng 108 lít": con số này đổi thẳng từ 30 gallon nên trông chính xác giả, và không gắn với bể cubic của bạn
- plain, stocking-06 post: "rau muống nước" as a hiding plant for fry: this isn't a common aquarium plant. Java moss or hornwort would be the usual picks.
- plain, stocking-06 post: "cá kiếm chịu được nhiều điều kiện hơn" mún: both fish like hard, alkaline water about equally, so this contrast is a little off.
- plain, stocking-06 post: "rau muống nước" là cây trốn cho cá con: đây không phải cây thủy sinh thông dụng trong bể, nên gợi ý này lạ và khó làm theo
- ours, stocking-06 tank: "tách vào khoảng ngày 18–25 của thai kỳ": đây là mốc của cá bảy màu; mún mang thai lâu hơn (~50–60 ngày), nên mốc này không áp dụng được
- ours, stocking-06 tank: Lấy cẩm nang cá bảy màu áp cho mún và nói kiểu "cẩm nang không ghi", câu trả lời vì vậy bị dài dòng
- plain, stocking-06 tank: "rong nổi (như rêu java, bèo)": rêu java không phải cây nổi
- plain, stocking-06 tank: "24–26°C": nước ở Việt Nam thường 27–30°C, mún vẫn chịu tốt ở mức đó, nên mốc này không sát với thực tế
- plain, stocking-06 tank: "rong nổi (như rêu java, bèo)": rêu java không phải cây nổi
- plain, stocking-06 tank: "khoảng 24–26°C": ở Việt Nam nước bể thường 27–30°C, không cần ép về mức này với mún
- ours, stocking-07 post: "chạch sóc đuôi đỏ ... ưa nước mát 15–21°C": this is a doubtful guess at the species. In Vietnam, "sóc đỏ" usually means a small schooling fish like rummy nose (sóc đầu đỏ) or red medaka, not a cold-water loach.
- ours, stocking-07 post: 'Chạch sóc đuôi đỏ ưa nước mát 15–21°C' là thông tin có vẻ bịa: tên loài này không thông dụng và khoảng nhiệt độ cũng không có căn cứ
- ours, stocking-07 post: Không đưa ra số lượng nào cho sóc đỏ, chỉ hỏi ngược lại người nuôi
- plain, stocking-07 post: "Sóc đỏ: chỉ nên nuôi 1 con... hung dữ... dài 12–15 cm": sóc đỏ is a small, peaceful schooling fish. Keeping just one is wrong, and the size and aggression claims are made up.
- plain, stocking-07 post: "sóc đỏ có thể rượt neon": this follows from the same wrong idea of which fish it is.
- plain, stocking-07 post: Nói chắc 'sóc đỏ' là cá dữ dài 12–15 cm (kiểu cá mập đuôi đỏ) mà không hỏi lại, trong khi ở Việt Nam tên này gọi được nhiều loài khác nhau
- plain, stocking-07 post: Mức 'neon 10–15 con' cho bể 84 lít là quá dè dặt, bể này nuôi được nhiều hơn
- ours, stocking-07 tank: Reads "sóc đỏ" as Aborichthys elongatus, a hillstream loach nobody sells in Vietnam. Here "sóc đầu đỏ" usually means rummy-nose tetra, which lives well with neon.
- ours, stocking-07 tank: "giữ nước ổn định quanh 21°C": not realistic in Vietnam's heat without a chiller, and the advice only follows from the wrong species.
- ours, stocking-07 tank: "neon cần 21–25°C": neons do fine at 26–27°C, the normal tank temperature in Vietnam.
- ours, stocking-07 tank: Hiểu 'sóc đỏ' là chạch sóc đuôi đỏ Aborichthys, loài cá suối hầu như không ai bán ở VN; ý người hỏi là sóc đầu đỏ, loài nuôi chung tốt với neon ở 24–28°C
- ours, stocking-07 tank: "neon cần 21–25°C", giữ bể 21°C: ở VN không làm được nếu không có chiller, và đây là kết luận sai vì nhầm loài
- ours, stocking-07 tank: Không nói thả được bao nhiêu neon trong bể ~84 L, dù người ta hỏi đúng chuyện đó
- plain, stocking-07 tank: "cá Corydoras đỏ (thường gọi là cá sóc)": in Vietnam Corydoras are called cá chuột, not cá sóc.
- plain, stocking-07 tank: Never gives a count for this tank. It asks for the size instead of working it out (60×35×40 is about 84 L).
- plain, stocking-07 tank: "cá Corydoras đỏ (thường gọi là cá sóc)": ở Việt Nam Corydoras gọi là cá chuột; 'sóc đỏ' gần như chắc chắn là cá sóc đầu đỏ (rummy-nose tetra)
- plain, stocking-07 tank: Hỏi lại kích thước bể dù app đã có sẵn 60×35×40
- plain, stocking-08 post: "cá nhỏ như neon... giữ khoảng 3-4 con" trong 4 lít: neon là cá bầy, bơi nhiều, không hợp với bể 4 lít
- plain, stocking-08 post: "chùm xương cá đều là loại tăng trưởng chậm": khẳng định khi chưa rõ đó là cây gì
- plain, stocking-08 post: "bể quá nhỏ làm mất cân bằng dinh dưỡng và CO₂": lý do mơ hồ cho bể ráy không dùng CO₂
- plain, stocking-08 post: "nếu là cá nhỏ như neon... giữ khoảng 3-4 con": neon là cá đàn, bơi nhiều, không hợp bể 4 lít dù chỉ 3-4 con
- plain, stocking-08 post: "Cây ráy và chùm xương cá đều là loại tăng trưởng chậm": X không biết chắc chùm xương cá là cây gì. Nếu là cây thân hoặc rong thì cây mọc nhanh
- plain, stocking-08 post: "bể quá nhỏ làm mất cân bằng dinh dưỡng và CO₂": nói mơ hồ, không có cơ sở, mà bể này cũng không dùng CO₂
- ours, stocking-08 tank: "chuyển bớt cá sang bể lớn hơn, khoảng 115-200 lít": a range that looks arbitrary and far bigger than needed for a handful of small fish
- ours, stocking-08 tank: "thay 20-30% nước mỗi tuần": too little for 8 fish in a 4 L tank that has only run 1 week and isn't cycled yet. It needs water changes every day or every 2 days until ammonia stays at 0
- ours, stocking-08 tank: "bể lớn hơn, khoảng 115-200 lít": con số không hợp với vài con cá nhỏ, có vẻ chép từ cẩm nang chứ không ăn nhập với bể này
- ours, stocking-08 tank: "thay 20-30% nước mỗi tuần": với bể 4 lít mới chạy 1 tuần mà đang quá tải thì như vậy là quá ít; nên thay vài lần mỗi tuần và theo dõi ammonia
- plain, stocking-08 tank: "khoảng 1 lít nước cho 1-2 cm cá trưởng thành": too generous. It would let a tiny tank like this be heavily overstocked
- plain, stocking-08 tank: "1 lít nước cho 1-2 cm cá trưởng thành": quy tắc quá dễ dãi, đọc theo đó thì 4 lít nuôi được tới 8 cm cá, mà với bể nano mới set thì vậy là quá tải
- ours, stocking-09 post: "ít nhất 100 cm" cho 2 con ông tiên: quá khắt khe. Ở Việt Nam nhiều người nuôi 2 con trong bể 80 cm cao 45 cm vẫn ổn
- ours, stocking-09 post: "ghép với ... cá hỏa tiễn": cá hỏa tiễn (cá mập đuôi đỏ) hay giữ lãnh thổ, không phải bạn ghép an toàn cho ông tiên
- ours, stocking-09 post: Gợi ý ghép ông tiên với "cá hỏa tiễn": không rõ đây là loài nào và có thể không hợp với ông tiên
- plain, stocking-09 post: Hiểu "cá ông tiên" là cá chùm/Ancistrus: sai. Cá ông tiên là Pterophyllum (angelfish), loài có thể ăn neon xanh
- plain, stocking-09 post: "Được": kết luận dựa trên nhận nhầm loài, nên bỏ qua nguy cơ ông tiên lớn ăn neon
- plain, stocking-09 post: Giả định "cá ông tiên" là cá chùm/Ancistrus: ở Việt Nam, cá ông tiên là cá thần tiên (Pterophyllum scalare), vì vậy toàn bộ phần đánh giá đều sai loài
- plain, stocking-09 post: Kết luận "Được" mà không nhắc gì đến việc cá ông tiên trưởng thành ăn được neon
- ours, stocking-09 tank: "bể... còn hẹp: cá ông tiên trưởng thành cần bể ít nhất 100 cm" — too strict: an 80×35×45 cm tank (~126 L) commonly holds 2 angelfish; the risk is real but this isn't a flat no
- ours, stocking-09 tank: Flat 'Không nên nuôi chung' ignores that angels raised small with neons in a well-planted tank often live together fine
- ours, stocking-09 tank: Gọi bể 80×35×45 (~126 L) là 'hẹp', cần dài 100 cm và cao 50 cm: quá khắt khe. 2 con ông tiên vẫn thường được nuôi ổn trong bể 80 cm cao 45 cm
- ours, stocking-09 tank: Gợi ý cá hỏa tiễn và cá nheo lông vũ là 'cá hiền hơn' để nuôi chung: cá hỏa tiễn giữ lãnh thổ, cá nheo lông vũ lớn rất to
- ours, stocking-09 tank: Kết luận dứt khoát 'không nên nuôi chung', trong khi ông tiên + neon là combo phổ biến, ổn nếu thả ông tiên lúc nhỏ và có nhiều cây che
- plain, stocking-09 tank: "Nếu là cá vàng (goldfish)" — in Vietnam 'cá ông tiên' means angelfish, not goldfish, so this whole section is off-topic
- plain, stocking-09 tank: Asks for the tank size even though the tank (80×35×45 cm) is already known
- plain, stocking-09 tank: Nói 'cá ông tiên' có thể là cá vàng: ở Việt Nam cá ông tiên luôn là Pterophyllum, nên đoạn về cá vàng chỉ là lan man
- ours, stocking-10 post: "Không nên nuôi chung": nói cứng là không được, trong khi betta với neon trong bể 60 cm nhiều cây vẫn nuôi chung phổ biến nếu theo dõi kỹ
- ours, stocking-10 post: "neon nhỏ dễ bị ăn": neon trưởng thành khoảng 3 cm, betta hiếm khi ăn được
- ours, stocking-10 post: "chọn loài hiền và nhỏ mà cẩm nang gợi ý": nói vậy nhưng không nêu tên loài nào
- ours, stocking-10 post: "Mức đầy bể: 36%": con số tải bể không giải thích cách tính
- ours, stocking-10 post: "phải nuôi riêng hoặc bể chỉ một loài": quá cứng nhắc. Betta splendens thường được nuôi trong bể cộng đồng có trồng cây, và bể ~65 L với neon là cách ghép phổ biến, nuôi thành công nhiều.
- ours, stocking-10 post: "neon nhỏ dễ bị... ăn": betta hiếm khi ăn được neon trưởng thành, nói vậy là phóng đại rủi ro.
- ours, stocking-10 post: Bước 3 bảo chọn loài "mà cẩm nang gợi ý" nhưng không nêu tên loài nào, lại bảo người đọc "kiểm tra bằng công cụ tank-mates". Đó là thuật ngữ của công cụ, người đọc không biết dùng ở đâu.
- ours, stocking-10 post: Phần theo dõi "nếu đã có betta trong bể neon" mâu thuẫn với lời khuyên không thả betta ngay phía trên.
- plain, stocking-10 post: "Thả betta trước rồi mới thả neon": nên làm ngược lại, thả betta sau cùng để nó không chiếm lãnh thổ trước, mà đàn neon thì đã có sẵn trong bể rồi
- plain, stocking-10 post: "Thả betta trước rồi mới thả neon": neon đã ở trong bể rồi. Lời khuyên đúng là thả betta vào sau cùng để nó bớt giữ lãnh thổ, nên bước này vừa ngược vừa không dùng được cho bể này.
- plain, stocking-10 post: Không nhắc tới việc neon có thể rỉa vây betta, nhất là betta vây dài. Đây là rủi ro thường gặp không kém chuyện betta rượt neon.
- ours, stocking-10 tank: "không khuyên thả thêm vào bể này": this is too strict. A tank of about 60 L can usually take one male betta with a school of neons if there are plants and the keeper watches for chasing or fin-nipping. Its own guide excerpt says one male can live with small, peaceful fish.
- ours, stocking-10 tank: "cá betta hung dữ, thường phải nuôi riêng": this overstates it. A betta is fierce toward other bettas, but it is usually only moderately aggressive toward other kinds of fish.
- ours, stocking-10 tank: "thường phải nuôi riêng hoặc bể chỉ một loài" overstates it. Its own excerpt says a single male can live with small, peaceful fish, and many keepers keep one betta with neons in a tank of about 65 L.
- plain, stocking-10 tank: It assumes the tank may already have a male betta and spends most of the answer on keeping several bettas together. That has nothing to do with this tank, which has 12 neon tetras and no betta.
- plain, stocking-10 tank: Assumes the tank already has a betta and asks for size and stocking, which the app already holds.
- plain, stocking-10 tank: "bể rất lớn, thường từ 40 lít trở lên" for several bettas: 40 L is not a very large tank, and the figure looks made up.
- ours, algae-12 post: "liều thấp hơn liều trên nhãn" rồi lại "Hãy làm theo liều in trên nhãn": hai lời khuyên mâu thuẫn nhau về liều phân
- ours, algae-12 post: "châm phân dưỡng nền": người hỏi dùng phân nước, gọi vậy là lẫn khái niệm
- ours, algae-12 post: 'Giảm... liều thấp hơn liều trên nhãn' rồi lại 'Hãy làm theo liều in trên nhãn sản phẩm': hai câu mâu thuẫn, người đọc không biết nên châm bao nhiêu
- ours, algae-12 post: 'châm phân dưỡng nền': người chơi đang châm phân nước, không phải phân nền, nên câu này lạc đề
- ours, algae-12 post: 'Tổng 8 tiếng vẫn nằm trong khoảng cây cần' nhưng ngay sau đó lại khuyên giảm xuống 6 tiếng, hơi lệch nhau
- plain, algae-12 post: "Dư phân (đặc biệt phosphate...) là nguyên nhân chính": tảo đốm xanh (GSA) thường gắn với thiếu phosphate và ánh sáng mạnh, nên câu này đáng bàn
- ours, algae-12 tank: "8–12 tiếng mà cẩm nang khuyến nghị cho bể đã trồng": 12 tiếng là quá nhiều cho bể mới 4 tuần, cây ưa sáng yếu, không CO₂; chính đoạn trích lại ghi bể mới nên bắt đầu với 6–8 tiếng
- ours, algae-12 tank: "kiểm tra lại ánh sáng và CO₂": rêu java, ráy và dương xỉ java không cần CO₂, nên lời khuyên này không hợp với bể của họ
- ours, algae-12 tank: "khoảng 8–12 tiếng mà cẩm nang khuyến nghị cho bể đã trồng": 12 hours is too long for a 4-week tank with no CO₂ and low-light plants. The excerpt Y quotes itself says to start a new tank at 6–8 hours.
- ours, algae-12 tank: "kiểm tra lại ánh sáng và CO₂": the tank has no CO₂, so this part is generic advice.
- plain, algae-12 tank: "giúp cá và cây đỡ căng thẳng hơn": nói chia đèn giảm căng thẳng mà không có căn cứ
- plain, algae-12 tank: "Rêu chủ yếu do dư dinh dưỡng": nói quá đơn giản; tảo thường do mất cân bằng giữa ánh sáng và dinh dưỡng, nhất là ở bể mới
- plain, algae-12 tank: "Rêu chủ yếu do dư dinh dưỡng (nitrat, phosphat)" oversimplifies: algae comes from light, CO₂ and nutrients being out of balance, and in a 4-week tank it is often just the tank still settling.
- plain, algae-12 tank: "giúp cá và cây đỡ căng thẳng hơn": a midday break isn't shown to reduce stress. A siesta mainly matters in CO₂ tanks, and this tank has no CO₂.

## Failed

- setup-07 post: ours Request timed out.

## Each question

### algae-01 · post · plain wins (4 · 6.75)

**Asked:** Bể em mới set được hơn 2 tuần mà đã có chút rêu tóc trên lá bucep và nmc. Em dùng đèn Flat One treo cách mặt nước 20cm, lúc đầu để chế độ giả lập ánh sáng mặt trời, giờ em hạ xuống còn 7 tiếng chạy một mạch không ngắt quãng. Cứ 2 hôm em thay 30% nước một lần, có cho Seachem khử clo, Advance và thuốc khử rêu. Em mới châm thêm 2 lọ phân nước ADA là Brighty K và Green Brighty Mineral vì thấy nmc bị trắng lá, chỉ có ít lá xanh mọc từ dưới lên. Em làm vậy có sai không, rêu tóc này xử lý sao ạ?

**Judge:** X says the light is too long, then tells them to raise it to 8–10 hours, and it stops the fertiliser the NMC needs. Y gets the main cause right (too much light for the CO₂ and nutrients), cuts the light to 5–6 hours, warns about the algae remover, and correctly reads the white NMC leaves as a lack of iron or trace elements. Its one mistake is telling them to change water less often. / X looks at the light, the algae-control chemical, the fertilizers and the white nmc leaves, and gives sensible steps (manual removal, Amano shrimp/Nerite snails, H₂O₂, asking about CO₂). Its one mistake is cutting water changes to once a week. Y tells the hobbyist to raise the total light to 8–10 hours while the tank already has algae, and its analysis is thin.

**Ours lacks:** wrong, diagnosis, tank-fit. **Plain lacks:** too-long, plan.

**Ours** (read 2 pages, stopped at the time limit):

> Mình nghĩ rêu tóc đang bùng lên vì bể còn non: cây chưa ra rễ nên chưa hút hết dinh dưỡng, và đèn bật một mạch 7 tiếng là hơi lâu. Cẩm nang khuyên bể mới set nên chia đèn thành nhiều đợt, mỗi đợt không quá 4 tiếng, tổng 8 đến 10 tiếng mỗi ngày.
> 1. Tạm ngừng châm Brighty K và Green Brighty Mineral cho đến khi cây ra rễ mới.
> 2. Chia đèn thành hai đợt, mỗi đợt khoảng 4 tiếng, cách nhau vài tiếng.
> 3. Trong hai tuần đầu, thay 30 đến 50% nước mỗi 3 ngày, thay vì 2 ngày.
> 4. Gỡ rêu tóc bằng tay, xoắn sợi rêu quanh que rồi kéo ra, đừng để nó bám lại trên lá.
> Lá trắng của nmc có thể do cây đang thích n…

**Plain** (2894 characters):

> Bể mới 2 tuần mà đã có rêu tóc là chuyện khá thường gặp. Nguyên nhân chính thường là **ánh sáng quá dài và mạnh so với lượng CO₂ và dinh dưỡng**, cộng với việc bể chưa ổn định. Lá trắng ở NMC có thể liên quan đến chính việc thiếu dinh dưỡng vi lượng, nên hai vấn đề này có thể đang liên quan nhau.
> 
> ## 1. Về đèn và thời gian chiếu sáng
> 
> - **7 tiếng liên tục là quá dài** cho bể mới, nhất là khi đèn đặt cao 20cm và cường độ không thấp. Nên chiếu khoảng **5–6 tiếng**, chia thành 2 đợt, ví dụ 4 tiếng sáng, nghỉ 2 tiếng, rồi 2 tiếng sáng, để đèn không bật liên tục.
> - Nếu bạn không có CO₂, nên **giảm…

### algae-01 · tank · plain wins (4 · 5)

**Asked:** Bể mới set của tôi đã có rêu tóc bám lên lá cây, xử lý sao?

**Judge:** Neither answer uses the tank's details: the light is already 7h, the fertiliser is Brighty K only, an algae remover is already in use, and the ngưu mao chiên leaves are turning white. X tells them to raise the light to 8–10h and repeats doubtful claims about shrimp and snails. Y is a generic answer but more accurate, and spot-dosing H₂O₂ plus removing the algae by hand is a practical way to deal with it. / Cả hai đều không đọc được thông tin bể của bạn: không nhắc chuyện thuốc khử rêu có thể làm NMC trắng lá, cũng không để ý phân mới châm. X chung chung nhưng an toàn: khuyên giảm hoặc tạm ngưng phân, giữ đèn 6–8h, chấm H2O2 cục bộ. Y viết tiếng Việt tự nhiên hơn nhưng khuyên đèn 8–10h, tức là tăng giờ đèn so với 7h hiện tại, và nhấn mạnh CO2 dù bể không châm CO2.

**Ours lacks:** tank-fit, wrong, diagnosis. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Rêu tóc trên lá bể mới set thường do cây chưa ra rễ nên hút ít dinh dưỡng, trong khi nước còn dư phân và đèn bật lâu, nên rêu được ăn trước. Nếu bể bạn đang châm CO2 hoặc có phân nền, thiếu CO2 cũng hay là thủ phạm, nên bạn nên kiểm tra thêm.
> 1. Giảm giờ đèn xuống khoảng 8 đến 10 tiếng mỗi ngày, và chia thành nhiều đợt, mỗi đợt không quá 4 tiếng.
> 2. Thay 30 đến 50% nước mỗi 3 ngày trong hai tuần đầu để kéo dinh dưỡng dư xuống khi cây chưa hút được.
> 3. Gỡ tay các sợi rêu tóc ra khỏi lá và thân, hoặc quấn quanh que gỡ rêu, rồi hút bỏ phần rêu rơi xuống nền.
> 4. Tạm chưa cắt tỉa trong hai tuần đầ…

**Plain** (1784 characters):

> Rêu tóc (thường là *Cladophora* hoặc *Rhizoclonium*) rất phổ biến ở bể mới setup. Thường nó xuất hiện khi cây chưa ổn định, dinh dưỡng và ánh sáng chưa cân bằng. Bạn có thể xử lý theo các bước sau:
> 
> **1. Gỡ bằng tay ngay**
> - Dùng nhíp, đũa hoặc bàn chải đánh răng cuộn sợi rêu quanh để kéo ra.
> - Gỡ càng sớm càng tốt, vì rêu sinh sản nhanh.
> - Có thể cắt bỏ lá quá nhiễm rêu.
> 
> **2. Kiểm soát ánh sáng**
> - Giảm thời gian bật đèn xuống còn 6–8 tiếng/ngày.
> - Tránh để bể nhận ánh sáng trực tiếp từ cửa sổ.
> 
> **3. Giảm dinh dưỡng thừa**
> - Cho cá ăn ít lại, chỉ cho ăn lượng cá ăn hết trong 2–3 phút.
> - Tha…

### algae-02 · post · plain wins (6.25 · 7)

**Asked:** Mình có hồ 70x30x40, cây chủ yếu là ráy và rêu. Đang dùng đèn Chihiros A601 plus mà bị rêu chùm đen, dù hồ không nền và hơn tuần nay không châm phân. Mình tính thay đèn, nên chọn đèn nào cho bể này?

**Judge:** Cả hai đều khuyên chỉnh đèn trước khi thay. Y nên được chọn vì có số liệu cụ thể (giảm còn 50-70% cường độ, chiếu 6-7 tiếng mỗi ngày), có cách chấm H2O2 trực tiếp lên lá ráy, có nhắc dòng chảy và châm phân nhẹ cho bể không nền, và có gợi ý đèn cụ thể. X có nêu đúng chuyện CO2 dao động, nhưng chọn đèn theo công thức lumen thô và bỏ sót dòng chảy. / Both say to adjust the A601 Plus before buying a new light. Y gets the cause more right (unstable CO₂) and says what to watch over 2–3 weeks. X gives what actually clears the BBA: dabbing H₂O₂ 3% on the ráy, low-dose fertiliser, more water flow, Amano shrimp or SAE, and a real light suggestion. So X is a bit more useful in practice.

**Ours lacks:** figures, tank-fit. **Plain lacks:** follow-up, local, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng rêu chùm đen (BBA) đến từ CO2 không ổn định và thời lượng hoặc cường độ đèn quá mức, chưa chắc do thiếu sáng. Bể không nền và đã hơn một tuần không châm phân nên phân không phải thủ phạm chính. Ráy và rêu lớn chậm, ít hút dinh dưỡng, nên đèn A601 Plus có thể đang dư sáng so với lượng CO2 bạn đang có. Mình chưa biết bạn có châm CO2 không, nên đây là chẩn đoán khá chắc nhưng cần kiểm tra thêm.
> 1. Trước khi đổi đèn, giảm thời gian chiếu sáng xuống khoảng 6 đến 8 tiếng mỗi ngày. Cẩm nang khuyên khoảng 8 tiếng, không quá 10 tiếng.
> 2. Giảm cường độ đèn A601 Plus xuống mức vừa đủ cho …

**Plain** (1868 characters):

> Với bể 70x30x40 (khoảng 84 lít) trồng ráy và rêu, bạn **không nhất thiết phải thay đèn ngay**. Rêu chùm đen (black beard algae) thường do ánh sáng quá mạnh so với dinh dưỡng và CO₂, hoặc do dòng chảy yếu, chứ không chỉ do đèn yếu hay mạnh. Nên chỉnh lại trước khi đổi đèn.
> 
> **1. Chỉnh đèn A601 Plus trước**
> - Giảm cường độ xuống khoảng 50-70% (hoặc hạ đèn nếu có thể).
> - Giảm thời gian chiếu sáng còn 6-7 giờ/ngày, dùng timer.
> - Ráy và rêu là cây ưa sáng yếu đến trung bình, nên thường không cần cường độ cao.
> 
> **2. Kiểm tra dinh dưỡng và dòng chảy**
> - Bể không nền nên cây hấp thụ dinh dưỡng chủ yế…

### algae-02 · tank · ours wins (7.25 · 5)

**Asked:** Bể của tôi bị rêu chùm đen dù không châm phân, có phải do đèn không?

**Judge:** X bám sát bể của người chơi (đèn A601 plus mạnh, không nền, chỉ có ráy và rêu, đã ngưng phân) và đưa ra các bước theo thứ tự rõ ràng, có số giờ bật đèn và % thay nước cụ thể. Điểm trừ của X là con số 60–70% tự đặt ra và cách xịt oxy già hơi mạnh tay với cây. Y chỉ liệt kê nguyên nhân chung chung, không dùng thông tin bể nào, lại còn hỏi lại loại đèn dù hồ sơ đã có. / Y dùng đúng thông tin bể của người hỏi (A601 plus đèn mạnh, chỉ có ráy và rêu, không nền, ngưng phân đột ngột) và đưa ra các bước theo thứ tự, có số giờ, % và lịch theo dõi. X chỉ liệt kê chung chung, đã vậy còn hỏi lại những thông tin app đã có sẵn.

**Ours lacks:** follow-up. **Plain lacks:** tank-fit, asks-only, plan, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Đèn là nghi phạm hợp lý nhất, nhưng thường không phải đèn một mình. Bể 70x30x40 của bạn dùng Chihiros A601 plus, loại đèn khá mạnh, trong khi bạn không nền, chỉ có ráy và rêu, không có cá, và đã hơn một tuần không châm phân. Khi đèn mạnh mà CO2 và lượng cây chưa đủ để dùng hết năng lượng, rêu chùm đen (BBA) dễ bùng lên. Mình đoán khoảng 60–70% là do đèn cộng với CO2 thiếu hoặc dao động; chưa chắc vì mình chưa biết bạn có châm CO2 không, bật đèn mấy giờ và cây có đang lên tốt không.
> 1. Giảm thời gian bật đèn xuống còn khoảng 6–7 giờ mỗi ngày, rồi quan sát 2–3 tuần; nếu đèn có chỉnh cường độ, h…

**Plain** (2079 characters):

> Đèn **có thể** là một nguyên nhân chính, nhưng thường không phải nguyên nhân duy nhất. Rêu chùm đen (black beard algae) thường xuất hiện khi có nhiều yếu tố cùng lúc.
> 
> **Các nguyên nhân phổ biến:**
> 
> 1. **Ánh sáng quá mạnh hoặc quá lâu:** Đèn LED công suất cao, bật trên 8-10 giờ/ngày, hoặc bể đặt gần cửa sổ có nắng.
> 2. **CO2 không ổn định:** Rêu chùm đen rất hay xuất hiện khi CO2 dao động (lúc đủ, lúc thiếu) hoặc khi chiếu sáng mạnh mà CO2 không đủ. Nếu bạn không dùng CO2, đây có thể là nguyên nhân quan trọng.
> 3. **Dinh dưỡng vẫn có, dù không châm phân:** Thức ăn thừa, chất thải của cá, phân h…

### algae-03 · post · ours wins (6.75 · 6)

**Asked:** Mình mới chơi, hồ đầu tiên trồng trân châu ngọc trai, vừa set được 3 ngày. Từ 2 hôm trước nước chuyển xanh, mình nghi là rêu nước xanh. Mình thay 30% nước thì hôm sau nước còn xanh hơn. Hôm nay mình tháo bớt 1 bóng của đèn Odyssea dual, chỉnh timer từ 7 tiếng xuống 4 tiếng và thay bông lọc. Có nên tiếp tục thay nước mỗi ngày không? Đèn như vậy có dư không hay nên tắt luôn vài ngày?

**Judge:** X keeps what the hobbyist already did right and gives a short, ordered plan: stop the daily changes, skip fertiliser, then black out the tank if it is still green after 5–7 days. Y gives roughly the same advice, but it is longer, overstates the filter-floss risk, suggests a floating plant too big for the tank, and ends with a list of questions. / Hai câu trả lời đều chưa nói tới khả năng nước đục/xanh ở hồ mới 3 ngày là do bụi nền hoặc bùng vi khuẩn chứ chưa chắc là tảo. Y gọn hơn, xếp bước rõ ràng, có hướng dẫn theo dõi cá thiếu oxy và có trích cẩm nang làm cơ sở. X có ý hay là gợi ý dùng đèn UV và cách thay nước theo kết quả test hợp với hồ mới hơn, nhưng dài và kết thúc bằng một loạt câu hỏi lại.

**Ours lacks:** diagnosis, figures. **Plain lacks:** too-long, diagnosis.

**Ours** (read 1 pages, stopped at the tools limit):

> Nước xanh do tảo phù du nở rộ, thường gặp ở bể mới: đèn bật 7 tiếng trong khi bể chưa có vi sinh ổn định, lại thêm chất dinh dưỡng từ nước máy và thức ăn, nên tảo sinh sản nhanh hơn tốc độ bạn thay nước. Việc thay 30% nước mỗi ngày làm nước xanh hơn vì mỗi lần thay lại đưa thêm dinh dưỡng vào bể, và tảo mọc lại rất nhanh sau mỗi lần thay. Theo cẩm nang, thay nước không hết xanh; phải cắt nguyên nhân trước. Bạn đã làm đúng hai bước là giảm đèn xuống 4 tiếng và bớt một bóng, nên giữ nguyên hai thay đổi này.
> 1. Ngừng thay 30% mỗi ngày. Thay khoảng 20% một lần mỗi tuần, dùng nước đã khử clo và cù…

**Plain** (2308 characters):

> Với hồ mới 3 ngày, nước xanh thường là **tảo nước xanh (free-floating algae)** nở ra khi hồ chưa ổn định. Bạn xử lý đúng hướng khi giảm đèn, nhưng nên **dừng thay nước hằng ngày** và làm vài việc khác.
> 
> **1. Dừng thay 30% mỗi ngày**
> - Thay nước liên tục làm hệ vi sinh chưa ổn định bị xáo trộn, và nước máy có thể đưa thêm nitrat, phosphat, hoặc clo/chloramine nếu không xử lý đúng.
> - Thay nước không giải quyết gốc vấn đề. Tảo chỉ ăn nhờ dinh dưỡng và ánh sáng, nên xanh hơn sau khi thay là bình thường trong giai đoạn này.
> - Nếu cần thay, chỉ làm khi test thấy amoniac hoặc nitrit tăng, mỗi lần kh…

### algae-03 · tank · ours wins (6.5 · 5)

**Asked:** Bể mới set vài ngày đã bị nước xanh, nên thay nước hay tắt đèn?

**Judge:** Không câu trả lời nào nói đến chuyện đèn đã giảm còn 4 giờ hay chuyện đã thay bông lọc. X khớp hơn với điều bạn ấy đã thấy: X nói thay nước không làm hết xanh. X cũng cảnh báo amoniac tăng khi tảo chết và nói rõ cần theo dõi gì. Y dài hơn, có thêm phần nước đục trắng không liên quan, và lại bảo vệ sinh lọc trong khi bạn ấy vừa thay bông lọc. / Y explains why a water change doesn't clear green water, sets a blackout limit that protects the plants, says to keep the filter and air running, and warns about ammonia from dying algae and the signs to watch in the fish. X is more generic and tells the user to clean the filter in a new tank. Neither uses the 4h/day the user already runs.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 2 pages):

> Nước xanh ở bể mới thường do đèn bật quá lâu (hoặc nắng chiếu vào) kết hợp với chất thải chưa được vi sinh xử lý hết, nên tảo nở rộ. Mình nghĩ bạn nên tắt đèn trước, thay nước chỉ là bước sau. Thay nước một lần không làm hết xanh vì tảo sinh sản rất nhanh và sẽ mọc lại.
> 1. Tắt đèn bể và che kín bể khoảng 3 đến 7 ngày. Lọc và sủi vẫn chạy bình thường. Cẩm nang khuyên không che quá 7 ngày, vì cây sẽ chịu khổ.
> 2. Ngừng hoặc giảm cho ăn trong lúc này, và không châm phân nước vào bể đang xanh.
> 3. Nếu có thể, chuyển cá và tép sang bể tạm trong lúc che tối.
> 4. Sau khi nước trong lại, thay khoảng 30 …

**Plain** (1452 characters):

> Bể mới bị nước xanh thường do **tảo nở hoa** (tảo lơ lửng). Nguyên nhân chính là ánh sáng quá nhiều và dinh dưỡng dư thừa, trong khi hệ vi sinh chưa ổn định. Với bể mới, **nên tắt đèn trước, không nên thay nước lớn ngay**.
> 
> **Cách xử lý:**
> 
> 1. **Tắt đèn hoàn toàn 3–5 ngày.** Có thể che bể bằng vải hoặc bìa tối. Đây là cách hiệu quả nhất. Tảo không quang hợp được sẽ tự chết dần.
> 2. **Ngừng cho ăn** trong thời gian này. Thức ăn thừa là nguồn dinh dưỡng nuôi tảo.
> 3. **Thay nước một phần (20–30%)** nếu nước quá xanh hoặc sau vài ngày vẫn chưa trong. Dùng nước đã khử clo và có nhiệt độ gần bằng bể…

### algae-04 · post · tie or split (6.5 · 6.5)

**Asked:** Mình chơi hồ 60x40x40 theo kiểu Hà Lan, dùng 2 cây đèn trắng Aquablue, 1 cây dài 60cm và 1 cây 45cm, vậy có bị dư sáng không? Hồ mới set được 7 ngày mà tảo nâu phát triển nhiều quá, CO2 và dinh dưỡng thì tương đối ổn định, mỗi ngày thay 30% nước kèm vệ sinh hồ, vậy mà rêu nâu cứ bám hoài trên đá và mặt kính. Hồ mình đang bị gì, nên làm sao?

**Judge:** Y answers the light question directly: two lights on a 60x40x40 Dutch tank with CO2 is moderate, and the photoperiod matters more. It also names silicate from tap water and gives a fuller plan: algae eaters timed safely, fast-growing plants and NO3/PO4 targets. X is shorter and uses the familiar Vietnamese term "tảo cát", but its advice to cut N and P is weak for a Dutch tank, and it misses the water-change angle. / Y keeps the daily water changes and adds siphoning off the algae, cuts the light to 6–7 hours and dims it, and is short and written the way Vietnamese hobbyists talk. X has good ideas (Nerite snails, otos, fast-growing stem plants) but tells them to cut water changes in a tank that is only one week old, which goes against what usually works with a new tank, and it is long.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Hồ của bạn đang bị rêu tảo cát (tảo nâu), và đây là hiện tượng rất thường gặp ở bể mới set được vài tuần. Nguyên nhân khả năng cao là bể chưa ổn định sinh học, đèn hai cây Aquablue (60 cm và 45 cm) trên hồ 60x40x40 đang hơi mạnh cho giai đoạn đầu, cộng với dinh dưỡng và CO2 đang đủ để tảo bùng lên. Mình chưa đo được cường độ đèn thực tế nên chưa chắc chắn đèn có quá mạnh hay không, nhưng theo cẩm nang, bể mới có đèn mạnh đi kèm dinh dưỡng cao là điều kiện khiến tảo cát phát triển nhanh.
> 1. Hẹn giờ đèn khoảng 6 đến 7 tiếng mỗi ngày và chưa tăng giờ đèn trong 2 đến 3 tuần tới.
> 2. Nếu đèn có chỉ…

**Plain** (2555 characters):

> # Chẩn đoán: Gần như chắc chắn là tảo silic (diatom)
> 
> Lớp nâu bụi, dễ lau bằng tay hoặc miếng bọt biển, xuất hiện trong 1-3 tuần đầu sau khi set hồ là đặc trưng của tảo silic. Đây là hiện tượng rất phổ biến ở hồ mới và thường tự hết khi hệ sinh thái ổn định. Nếu là lớp nhầy, dai, có sợi hoặc xanh lục đen thì là loại khác.
> 
> ## Nguyên nhân khả dĩ
> 
> - **Silicate:** Tảo silic cần silicate (Si) để tạo vỏ. Silicate đến từ nước máy, cát/đá mới, và đặc biệt là **thay nước hằng ngày bằng nước máy** làm bổ sung silicate liên tục. Đây có thể là nguyên nhân chính của bạn.
> - **Cây chưa đủ để cạnh tranh:** …

### algae-04 · tank · ours wins (6 · 4)

**Asked:** Bể mới set một tuần bị tảo nâu bám kín đá và kính, làm sao?

**Judge:** X nói đúng nguyên nhân là bể mới chưa ổn định, và đưa ra bước cấy vi sinh, trồng thêm cây có ích. Tuy vậy, X không dùng thông tin đèn và phân có sẵn trong app. Y chung chung hơn: khuyên cho cá ăn ít dù không biết bể có cá, nói sai về ốc táo, và hỏi lại kích thước bể dù đã có. / Y nói đúng là tảo cát ở bể mới và đưa ra các bước hợp hơn: cấy vi sinh từ bông lọc cũ, tăng số cây, giảm đèn, không có lỗi về ốc táo. Cả hai câu trả lời đều bỏ qua dữ liệu đèn, phân và việc bạn đã thay 30% nước mỗi ngày. X còn khuyên dừng hẳn phân cho bể Hà Lan và nói sai rằng ốc táo không phá cây.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, diagnosis, wrong.

**Ours** (read 3 pages):

> Bể mới một tuần mà tảo nâu phủ kính và đá thường là tảo cát (tảo silic), loại hay bùng trong vài tuần đầu khi hệ vi sinh chưa ổn định. Thường nó tự hết sau khoảng 4–6 tuần khi bể ổn định, nên bạn chưa cần lo quá. Mình chưa biết đèn và phân bạn đang dùng, nên hãy kiểm tra hai thứ này trước.
> 1. Giảm đèn: nếu đang bật lâu hoặc cường độ cao, hạ về khoảng 6–8 giờ mỗi ngày. Với bể chỉ có cây xanh, cường độ ở nền khoảng PAR 40–60 µmol là mức khởi đầu tốt, tăng dần khi bể trưởng thành.
> 2. Tạm dừng hoặc giảm phân: đừng châm phân nhiều cùng lúc với đèn mạnh. Trong giai đoạn đầu, nên dùng phân không chứ…

**Plain** (1589 characters):

> Tảo nâu (tảo silic, hay tảo diatom) rất phổ biến ở bể mới setup, thường tự biến mất sau vài tuần khi hệ sinh thái ổn định. Bạn có thể xử lý như sau:
> 
> **1. Vệ sinh ngay**
> - Dùng miếng bọt biển hoặc cọ mềm chà kính và đá. Không dùng xà phòng hay hóa chất.
> - Hút đáy để loại bớt tảo và thức ăn thừa.
> - Thay khoảng 20-30% nước, lặp lại vài lần trong tuần đầu.
> 
> **2. Giảm ánh sáng**
> - Chỉ bật đèn khoảng 6-8 tiếng/ngày, tránh để nắng chiếu trực tiếp vào bể.
> - Đây là nguyên nhân chính khiến tảo phát triển mạnh ở bể mới.
> 
> **3. Kiểm soát dinh dưỡng**
> - Cho ăn ít, chỉ đủ lượng cá ăn hết trong 2-3 phút, tr…

### algae-05 · post · plain wins (5 · 7)

**Asked:** Em set bể Hà Lan được gần 1 tháng, đèn mới lên 8h/ngày (10h sáng đến 18h), cây phát triển rất tốt, không có rêu hại. Phía trước dưới nền em trồng rau thơm. Nhưng ở mặt kính phía dưới, chỗ giáp nền, có tảo nâu bám kính và một chút tảo nhớt xanh, có phải do đèn trong nhà buổi tối hắt vào bể không? Bucep em buộc giá thể thả vào được 1 tuần cũng có tảo nâu trên lá. Em thay nước đều 2 ngày 1 lần. Em có thả ốc nerita nhưng nó chỉ nằm im không bò, kiểm tra thì vẫn sống. Xử lý tảo nâu với rêu nhớt sao ạ?

**Judge:** Y nói đúng là đèn phòng gần như không ảnh hưởng. Y cũng nêu nguyên nhân tảo cát do bể mới, chỉ rõ cách xử lý từng loại tảo, khuyên test NH3/NO2 và đề xuất dùng oxy già 3% chấm tại chỗ an toàn hơn. Còn X khuyên cắt đèn xuống 2–3 tiếng, quá gắt với bể Hà Lan, và khuyên dùng erythromycin. / X đúng khi cho rằng đèn phòng gần như không phải nguyên nhân mà là do bể còn mới. Cách xử lý của X an toàn (giảm đèn còn 6–7 tiếng, chấm oxy già, test NH3/NO2), dù hơi dài và khuyên ngưng phân là chưa hợp lý. Y gọn và có thứ tự rõ, nhưng khuyên cắt đèn còn 2–3 tiếng trong nhiều tuần sẽ hại cây trong bể Hà Lan, và cách rắc erythromycin cũng không đúng.

**Ours lacks:** wrong, diagnosis. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể mới một tháng nên hệ vi sinh còn non, tảo nâu (tảo cát) bám kính và lá là chuyện thường gặp, và đèn 8 tiếng mỗi ngày là hơi dài ở giai đoạn này. Đèn phòng hắt vào buổi tối có thể góp phần, nhưng nguyên nhân chính vẫn là bể chưa ổn định và đèn bật lâu. Cách xử lý theo thứ tự: 1. Giảm đèn còn khoảng 2–3 tiếng mỗi ngày trong vài tuần tới, ví dụ bật từ 10h đến 13h, rồi tăng dần khi tảo hết. 2. Che mặt kính phía sau và hai bên bằng giấy bìa hoặc tắt đèn phòng buổi tối để ánh sáng bên ngoài không chiếu vào bể. 3. Tiếp tục thay khoảng 30% nước mỗi 2 ngày như bạn đang làm, và hút lớp tảo ở kính và…

**Plain** (2834 characters):

> Chào bạn, tình trạng này khá phổ biến ở bể mới, nên bạn không cần quá lo.
> 
> **1. Đèn trong nhà buổi tối có phải nguyên nhân không?**
> Gần như không. Ánh sáng đèn phòng yếu hơn đèn bể rất nhiều, và tảo không cần ánh sáng mạnh như vậy để phát triển. Nguyên nhân thường gặp hơn là:
> - **Bể mới (chưa ổn định):** tảo nâu (diatom) thường xuất hiện trong 2–6 tuần đầu, khi lượng silicat từ nước máy, nền và chất hữu cơ còn cao. Nó thường tự giảm khi cây phát triển đủ mạnh.
> - **Dòng chảy yếu ở góc dưới:** vùng sát nền ít được khuấy, chất bẩn và dinh dưỡng dễ tích tụ.
> - **Dinh dưỡng dư thừa:** cho ăn nhiều,…

### algae-05 · tank · ours wins (6 · 4)

**Asked:** Bể tôi có tảo nâu và tảo nhớt xanh ở chân kính sát nền, xử lý thế nào?

**Judge:** X đúng hơn: X chỉ ra tảo nâu là do bể còn non, đưa ra cách che tối bể chuẩn để trị tảo lam, có trích cẩm nang kèm theo. Còn Y là lời khuyên chung chung, hỏi lại những thông tin app đã có, khuyên nuôi thêm ốc trong khi bể đã có và gọi dương xỉ là cây nhanh lớn. Cả hai đều bỏ qua chuyện ốc nằm im và ánh đèn trong nhà hắt vào bể buổi tối. / Neither answer used the tank details: it is a 4-week-old tank where the nerites have stopped moving, water is changed every 2 days and room light reaches the tank in the evening. X even suggests buying nerites, which they already have, and asks for details the app holds. Y is better: it ties brown algae (tảo cát) to young tanks, and it gives a clear blackout procedure, a nitrate threshold and a 1–2 week window to watch for change.

**Ours lacks:** tank-fit, follow-up. **Plain lacks:** tank-fit, diagnosis, too-long, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Hai loại này thường xuất hiện cùng lúc khi bể có nhiều dinh dưỡng, ánh sáng hơi nhiều và chỗ đáy ít dòng chảy. Tảo nâu ở chân kính thường là tảo cát, hay gặp ở bể còn non hoặc khi đèn và dinh dưỡng đang cao. Tảo nhớt xanh là tảo lam (vi khuẩn lam), thích chỗ nước tù sát nền và nền bị nén chặt. Nguyên nhân có thể là một hoặc nhiều yếu tố cộng lại, nên bạn nên xử lý cả hai hướng.
> 1. Chải nhẹ kính và nền bằng bàn chải mềm, hút đáy để lấy thức ăn thừa và mùn, rồi thay khoảng 30% nước.
> 2. Đặt đèn còn 6–8 tiếng mỗi ngày, và giảm dần nếu tảo còn nhiều.
> 3. Cho cá ăn ít hơn, vớt thức ăn thừa sớm và kh…

**Plain** (2208 characters):

> Tảo nâu (tảo silic) và tảo nhớt xanh (vi khuẩn lam) thường xuất hiện khi bể có **dư dinh dưỡng, ánh sáng quá nhiều hoặc chỗ nước lưu thông kém**. Bạn xử lý theo các bước sau:
> 
> ## 1. Vệ sinh ngay
> - **Tảo nâu:** Dùng miếng cọ kính hoặc cạo lưỡi lam, lau sạch kính và đá/trang trí.
> - **Tảo nhớt xanh:** Lấy khăn giấy hoặc khăn mềm gạt bỏ lớp nhớt. Nếu bám ở nền, dùng ống siphon hút sạch phần này, vì nó dễ mọc lại từ cặn bẩn.
> 
> ## 2. Siphon nền và thay nước
> - Hút cặn ở nền, đặc biệt những chỗ thức ăn và phân tích tụ.
> - Thay 20–30% nước mỗi tuần. Nước mới phải cùng nhiệt độ và đã khử clo.
> 
> ## 3. Giảm…

### algae-06 · post · tie or split (6.25 · 6.5)

**Asked:** Em đang dùng bể 6-4-4, lọc Sunsun 702B (1000L/h), lọc phụ Sunsun 603. CO2 cho qua sủi đánh thẳng vào đầu in của lọc, có van điện bật tắt theo đèn. Thỉnh thoảng nghe trong lọc chính có tiếng lọc xọc, lúc khác lại thấy đầu out bắn ra bọt khí to cỡ hạt đỗ. Bể đang nhiều rêu tóc, rêu sừng hươu và rêu lông tơ nên em đang cho CO2 dồi dào hơn, tầm 6-7 giọt/giây. Trộn như vậy có ổn không khi CO2 nhiều? Lọc phụ gắn thêm trộn cánh quạt ở out được không hay sẽ yếu dòng? Cá tép có nguy cơ chết vì ngạt CO2 không?

**Judge:** Both correctly diagnose the CO2 diffuser at the filter inlet as the cause of the noise and big bubbles. Y covers more of this tank's needs: venting the air from the filter, turning the CO2 on 1-2 hours before the lights, what to do right away if the shrimp show signs of CO2 poisoning, and fixing the lighting and fertiliser for the algae. Y's pH-drop figure is wrong, but it still gives a more complete and usable plan than X's short answer. / Cả hai đều xác định đúng là khí bị lọc hút vào và khuyên chuyển điểm sủi. Y gọn hơn và đúng với cách nhìn phổ biến về rêu (thiếu CO2 là nguyên nhân hay gặp). X đầy đủ hơn, có dấu hiệu ngạt và cách cấp cứu, nhưng mức pH giảm 0.3-0.5 là sai và đổ lỗi rêu cho thiếu dinh dưỡng, dễ khiến người hỏi chỉnh sai hướng.

**Ours lacks:** figures, too-thin, plan. **Plain lacks:** too-long, wrong.

**Ours** (read 4 pages, stopped at the tools limit):

> Nhiều khả năng bạn đang châm CO2 quá nhanh và đầu sủi đặt ngay cửa hút của lọc chính, nên khí bị lọc hút vào rồi đẩy ra thành bọt lớn, gây tiếng xọc. Cẩm nang chỉ nói chung về cách đưa CO2 vào nước, chưa nói riêng trường hợp đặt sủi ở đầu in của lọc, nên phần này mình dựa thêm vào kinh nghiệm thực tế.
> 1. Giảm CO2 về khoảng 1 bọt mỗi giây ở bộ điều áp, đây là mức cẩm nang khuyên để bắt đầu. 6-7 bọt mỗi giây là quá nhiều so với mức này.
> 2. Chuyển đầu sủi vào trong bể, đặt dưới dòng chảy để bọt được cuốn đi khắp bể. Cẩm nang gọi đây là cách sủi đặt trong bể, cách đơn giản nhất. Nếu muốn giữ sủi …

**Plain** (3618 characters):

> ## 1. CO2 đưa vào đầu hút của lọc có ổn không?
> 
> Không nên. Đây có thể là nguyên nhân gây tiếng "lọc xọc" và bọt to ở đầu out:
> 
> - **Bọt khí vào bơm:** Bơm lọc hút cả khí lẫn nước, gây hiện tượng cavitation (xâm thực), làm bơm kêu xọc xạch, giảm lưu lượng và có thể bị "khóa khí" (gas lock) đến mức dòng gần như dừng.
> - **Bọt to ở out:** Bọt "cỡ hạt đỗ" nghĩa là CO2 không kịp hòa tan mà bị đẩy thẳng ra ngoài, tức là bạn đang lãng phí CO2 và tốn điện bơm để xử lý khí.
> - **Dễ gây tích khí trong lọc:** Khí tích trong buồng lọc làm giảm hiệu suất lọc và có thể tạo hiện tượng nước chảy không đều.
> 
> **C…

### algae-06 · tank · ours wins (5 · 3.5)

**Asked:** Bể tôi nhiều rêu tóc, rêu sừng hươu và rêu lông tơ, tăng CO2 có giúp được không?

**Judge:** Không câu nào nhận ra rằng bể đang sủi 6-7 giọt/giây vào đầu in lọc mà lọc lại kêu xọc và có bọt to ở đầu out, tức là CO2 đang bị phí và hòa tan kém. Y đọc sai màu drop checker và mức giảm pH, nên có thể khiến người nuôi châm thiếu CO2. X đúng về cơ bản và gọn hơn. / Cả hai đều bỏ sót nguyên nhân rõ nhất. Bể đã sủi CO2 6–7 giọt/giây vào đầu in lọc, lọc kêu xọc xọc và đầu out phun bọt to, tức là khí CO2 đang đọng lại trong thùng lọc chứ không hòa tan đều vào nước. Vấn đề có lẽ nằm ở cách sủi CO2 vào lọc, không phải do thiếu CO2. Dù vậy, Y đọc màu drop checker đúng, có dẫn cẩm nang và có bước theo dõi sau 2–4 tuần. Còn X đọc ngược màu drop checker và đưa sai mức giảm pH, làm theo dễ dẫn đến tăng CO2 quá liều cho cá tép.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, wrong, diagnosis.

**Ours** (read 3 pages, stopped at the calls limit):

> Có, tăng CO2 thường giúp được với rêu tóc và rêu sừng hươu, vì đây là hai loại hay mọc khi CO2 thiếu hoặc dinh dưỡng bị lệch. Cẩm nang nói rêu tóc phần nhiều do thiếu CO2, và rêu sừng hươu mọc khi dinh dưỡng mất cân bằng kèm thiếu CO2. Rêu lông tơ thì cẩm nang chưa nêu rõ, nên mình chỉ suy ra từ kinh nghiệm: loại rêu sợi dày này thường đi cùng dư đèn hoặc thiếu cân bằng dinh dưỡng, nên CO2 chỉ là một phần của bài toán.
> 1. Đặt ống drop checker trong bể. Nếu dung dịch chuyển xanh lá thì CO2 đã đủ, còn nếu vẫn xanh dương thì bạn cần tăng CO2.
> 2. Tăng CO2 từ từ, khoảng 1 bọt mỗi giây rồi chỉnh dầ…

**Plain** (2013 characters):

> Có, tăng CO2 thường giúp, nhất là với rêu sừng hươu và rêu lông tơ (black beard algae). Nhưng CO2 chỉ là một phần của giải pháp. Nếu chỉ thêm CO2 mà không xử lý ánh sáng, dinh dưỡng và cây thủy sinh thì rêu vẫn có thể tiếp tục phát triển.
> 
> **Vì sao CO2 giúp?**
> - Rêu thường thắng thế khi CO2 thiếu hoặc không ổn định, trong khi cây thủy sinh cần CO2 để lớn nhanh. Khi cây phát triển mạnh, chúng cạnh tranh ánh sáng và dinh dưỡng với rêu, nên rêu dần bị kìm hãm.
> - Rêu sừng hươu và rêu lông tơ đặc biệt hay xuất hiện khi CO2 dao động hoặc thiếu kết hợp với ánh sáng mạnh.
> 
> **Cách làm hiệu quả:**
> 1. *…

### algae-07 · post · plain wins (5 · 7)

**Asked:** Em là tân binh theo trường phái Hà Lan, phần cứng gần như đủ cho một bể Hà Lan cơ bản: lọc chuẩn, CO2 dồi dào, nền trộn giàu dưỡng, đèn WRGB, quạt... Vậy mà em thất bại liên tiếp 5 bể, bể nào cũng bị: cây xoắn ngọn, xoắn tít, mất màu, teo ngọn, ngọn trắng toát và dị dạng; rêu hại bùng phát. Đèn bật 9h liên tục, CO2 3-4 giọt/giây, mới setup em thay hơn 100% nước hằng ngày trong 2 tuần (vì nghe nói nền trộn rất giàu dưỡng, mà nền mua nên em không biết công thức). Giờ em muốn chuyển qua nền công nghiệp + cốt nền nhưng lăn tăn về tuổi thọ và dinh dưỡng cho bể Hà Lan vốn rất háu ăn. Em nên làm sao?

**Judge:** Y gives the hobbyist more to act on: it says to set CO2 by drop checker and pH drop instead of bubble count, gives a clear fertiliser method, lists what to test, and puts the steps in order. X is thin and skips the substrate question. But Y gets the Vietnamese meaning of cốt nền wrong and mixes up macro- and micronutrients. / Both say the problem is how the tanks are run, not the substrate. X does more with that: it gives figures, says to set CO2 by drop checker and pH/KH, sets out a nutrient plan with root tabs, and answers the question about substrate lifespan, though it gets the term cốt nền wrong. Y says outright it doesn't know how long a commercial substrate lasts, gives fewer details, and its excerpt contradicts its light advice.

**Ours lacks:** too-thin, figures, tank-fit, follow-up. **Plain lacks:** local, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là ánh sáng và CO2 mạnh hơn khả năng cây dùng được, trong khi dinh dưỡng bị thiếu và nước bị rút đi liên tục. Đèn bật 9 giờ liên tục không làm cây khỏe hơn: cẩm nang nói rõ kéo dài giờ đèn không bù được ánh sáng thiếu, mà chỉ làm rêu mọc nhiều hơn, và chỉ tăng đèn thì không bù được CO2. Thay hơn 100% nước mỗi ngày cũng cuốn theo sắt, vi lượng và phần dinh dưỡng bạn bơm vào, nên cây thiếu dần. Nền trộn có thể đã hết dưỡng sau vài tuần, nên các triệu chứng xoắn ngọn, ngọn trắng và mất màu rất hợp với thiếu dinh dưỡng kết hợp mất cân bằng ánh sáng–CO2. Mình chưa chắc …

**Plain** (3991 characters):

> Em không hỏng vì thiếu phần cứng. Năm bể hỏng theo cùng một kiểu, nên nguyên nhân nằm ở **cách vận hành**, và nhiều khả năng là ba thứ: thay nước quá nhiều, ánh sáng quá dài so với dinh dưỡng, và CO2 cùng dinh dưỡng không cân bằng. Nền công nghiệp hay cốt nền không phải là lý do chính.
> 
> ## 1. Chẩn đoán nhanh các triệu chứng
> 
> - **Ngọn trắng, mất màu, xoắn, teo, dị dạng** thường là thiếu vi lượng (sắt, mangan, kali, magie...) hoặc dinh dưỡng bị mất cân bằng. Thay 100% nước mỗi ngày trong 2 tuần đã rửa trôi phần lớn dinh dưỡng, nên cây đói liên tục.
> - **Rêu hại bùng phát** thường là do ánh sáng …

### algae-07 · tank · ours wins (7 · 4)

**Asked:** Bể tôi cứ bị rêu hại bùng phát và cây xoắn ngọn, trắng ngọn, phải làm sao?

**Judge:** X dựa vào đúng bể của họ (WRGB 9h, CO₂ mạnh, nền giàu dưỡng) và chỉ ra thiếu Ca/nước mềm là nguyên nhân hợp lý của ngọn xoắn, có các bước theo thứ tự. Tuy vậy, X khuyên giảm CO₂ là điều dễ gây hại. Y chung chung, chẩn đoán thiếu sắt là chưa đúng, còn hỏi lại những thông tin đã có. / Y dùng đúng thông tin bể của bạn (đèn 9h, CO₂, nền giàu dưỡng), chỉ ra được nguyên nhân hợp lý là thiếu Ca hoặc GH thấp, đưa mức thông số cần nhắm tới và các bước theo thứ tự, tuy khuyên giảm CO₂ là chưa ổn. X chung chung cho mọi bể, khuyên châm sắt chữa trắng ngọn là sai hướng, và hỏi lại những thông tin app đã có.

**Ours lacks:** follow-up, diagnosis. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Nguyên nhân có khả năng nhất là bể đang mất cân bằng giữa ánh sáng, CO₂ và dinh dưỡng. Đèn WRGB bật 9 giờ liên tục, CO₂ 3-4 giọt/giây khá mạnh, còn nền trộn giàu dưỡng không rõ công thức, nên rêu được nuôi nhiều hơn cây. Ngọn non xoắn và trắng thường liên quan đến thiếu canxi hoặc nước có độ cứng thấp, theo cẩm nang. Mình chưa biết độ cứng và nitrat của bể nên chưa chắc chắn, bạn đo trước khi chữa.
> 1. Đo nitrat, photphat, KH và GH bằng bộ test. Mục tiêu theo cẩm nang là N khoảng 10-20 ppm, P khoảng 0.5-2 ppm, K khoảng 10-20 ppm, Ca khoảng 10-30 ppm, Mg khoảng 2-5 ppm, CO₂ khoảng 20-30 ppm.
> 2.…

**Plain** (2324 characters):

> Hiện tượng rêu bùng phát kèm cây xoắn ngọn, trắng ngọn thường do **mất cân bằng dinh dưỡng và ánh sáng**. Cây yếu thì không cạnh tranh được với rêu. Bạn có thể xử lý theo các bước sau.
> 
> ## 1. Kiểm tra nước trước
> Dùng bộ test (NO₃, PO₄, pH, KH, GH, NH₃/NO₂) để biết nguyên nhân:
> - **Nitrat, phosphat cao** (thường >20–30 mg/L NO₃): rêu phát triển mạnh, thường do cho ăn quá nhiều, ít thay nước, quá nhiều cá.
> - **Amoniac hoặc nitrit có mặt**: cá và cây đều bị stress, cần xử lý ngay.
> - **pH, KH, nhiệt độ** lệch quá nhiều cũng làm cây xoắn, trắng ngọn.
> 
> ## 2. Chỉnh ánh sáng
> - Bật đèn **6–8 tiếng/ngà…

### algae-08 · post · ours wins (7.5 · 5.5)

**Asked:** Em mới chơi, bể đúc 50cm, lúc đầu nuôi 9 mún + 3 bảy màu + 2 sọc ngựa, giờ là 10 bảy màu, 9 sọc ngựa, 5 mún đỏ với 2 cây ráy. Bể không trải nền, chỉ có vài hòn đá; có lọc thác (có lúc chạy cả ngày, có lúc em không bật) và đèn RGB 9W, ban ngày bật trắng khoảng 10 tiếng, tối chuyển đèn màu đến lúc đi ngủ mới tắt. Cho ăn ngày 2 lần. Được hơn 3 tuần thì tảo nâu bám đầy bể, mún với bảy màu ăn hằng ngày cũng không hết, nước đục đục như phân cá rã ra. Tuần thay 50% nước vẫn đục, thành bể có một lớp mờ mờ như rêu tảo bám. Giờ thì thay nước xong được vài ngày là nước lại chuyển xanh đục, tuần nào cũng phải thay gần như hết nước. Lọc thác không ăn thua, em đang tính mua lọc thùng Sunsun 350K thay vào. Do lọc hay do gì, làm sao để nước luôn trong?

**Judge:** X gives the right cause and a short, ordered plan that fits this tank: run the filter 24/7, cut the light, feed less, keep fewer fish, and only then change the filter. Y is long and makes several mistakes: it miscounts the fish, reads the price 350K as the filter's flow rate, calls slow plants fast, and suggests adding more fish to a tank it says is overstocked. / Y chẩn đoán đúng nguyên nhân rồi đưa ra các bước gọn, có thứ tự: bật lọc 24/24, bỏ đèn màu buổi tối, giảm cho ăn, giảm cá, thay lọc sau. Y còn ghi rõ ráy mọc chậm, dặn theo dõi dấu hiệu thiếu oxy, và kèm trích đoạn hướng dẫn hữu ích. X dài hơn và có vài lời khuyên sai, như xếp ráy vào cây nhanh hay thả thêm cá vào bể đang quá tải.

**Ours lacks:** figures. **Plain lacks:** too-long, wrong, tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân chính là bể đang quá tải: khoảng 34 con trong bể 50 cm (cỡ 50 lít) là quá đông, nên lượng thức ăn thừa và chất thải tích tụ nhanh hơn lọc xử lý được. Thêm vào đó, lọc thác chạy không đều làm vi sinh lọc yếu, còn đèn sáng khoảng 10 tiếng cộng thêm đèn màu buổi tối nuôi tảo nâu và nước xanh. Cái đục như phân cá rã và lớp mờ trên kính là dấu hiệu bể đang thừa dinh dưỡng, nên đổi lọc chưa phải là việc đầu tiên. Bạn làm theo thứ tự sau:
> 1. Bật lọc 24/24 và đừng tắt nữa, vì lọc tắt làm vi sinh chết và nước xấu nhanh hơn.
> 2. Giảm đèn còn khoảng 6–8 tiếng mỗi ngày, bỏ đèn màu bu…

**Plain** (3418 characters):

> Theo mô tả, nguyên nhân chính **không phải chỉ do lọc**. Bể đang bị quá tải sinh học (quá nhiều cá, cho ăn dư, ánh sáng nhiều), nên tảo và vi khuẩn bùng phát. Lọc thùng 350K sẽ giúp, nhưng nếu không sửa các yếu tố dưới đây thì nước vẫn sẽ đục.
> 
> ## 1. Nguyên nhân chính
> 
> **Quá tải cá:** Khoảng 33 con (10 bảy màu, 9 sọc ngựa, 9 + 5 mún, 2 sọc... và các loài khác) trong bể 50cm là nhiều. Lượng chất thải (phân, thức ăn thừa) vượt khả năng xử lý của lọc và vi khuẩn.
> 
> **Cho ăn quá nhiều:** Ăn 2 lần/ngày và cá ăn hằng ngày không hết nghĩa là thức ăn dư. Thức ăn thừa thối rữa làm tăng amoniac, nitrat,…

### algae-08 · tank · ours wins (6 · 4.5)

**Asked:** Bể tôi thay nước xong vài ngày lại xanh đục và bám tảo nâu, làm sao giữ nước trong?

**Judge:** X đưa ra kế hoạch gọn, theo thứ tự: giảm đèn, che tối hoặc dùng UV, kiểm tra amoniac khi tảo chết, và có dặn theo dõi. Tuy vậy, X không nói đến việc người này đang thay gần 100% nước mỗi tuần và bật đèn màu vào buổi tối. Y có nhắc thay 20–30% và chuyện bể mới, nhưng lại khuyên sai: thả ốc bươu vàng, coi cory là cá ăn tảo, và bảo tăng ánh sáng. / Cả hai câu trả lời đều không đọc thông tin bể của bạn: đèn trắng 10 tiếng rồi tối bật thêm đèn màu, thay gần 100% nước mỗi tuần, cho ăn 2 lần/ngày, nuôi đông cá mà chỉ có 2 cây ráy. Y đưa các bước theo thứ tự rõ ràng, có cách làm trong nước (che tối hoặc đèn UV) và dặn theo dõi amoniac, oxy. X khuyên thả ốc bươu vàng (loài gây hại), khuyên tăng sáng và rốt cuộc chủ yếu hỏi ngược lại người hỏi.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, plan, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Nước xanh đục sau khi thay nước thường là tảo phù du nở lại, còn tảo nâu là tảo cát. Cả hai thường do bể thừa sáng hoặc thừa dinh dưỡng. Nước thay vào có thể mang thêm nitrat, phốt phát và silicat, nên tảo mọc lại ngay nếu nguyên nhân chưa được cắt. Mình chưa biết đèn bạn bật bao lâu, có nắng chiếu vào không, bạn có châm phân và cho ăn nhiều không, nên đây là nhận định dựa trên triệu chứng.
> 1. Rút thời gian bật đèn còn khoảng 6–8 giờ mỗi ngày, dời bể khỏi chỗ nắng chiếu hoặc hắt từ cửa sổ.
> 2. Ngừng châm phân nước trong lúc bể đang xanh, và cho ăn ít lại, chỉ lượng cá ăn hết trong vài phút.
> 3.…

**Plain** (1913 characters):

> Nước xanh đục và tảo nâu thường do **mất cân bằng dinh dưỡng và ánh sáng**. Sau khi thay nước, tảo có thể bùng lên vì nước mới thường chứa nhiều chất dinh dưỡng (nitrat, phosphat, silicat) từ nước máy hoặc nước giếng.
> 
> **1. Xanh đục (tảo lơ lửng)**
> - **Giảm ánh sáng:** Chỉ bật đèn khoảng 6–8 tiếng/ngày, tránh ánh nắng trực tiếp chiếu vào bể.
> - **Không cho ăn quá nhiều:** Thức ăn thừa phân hủy làm tăng dinh dưỡng. Chỉ cho ăn lượng cá ăn hết trong 2–3 phút.
> - **Kiểm tra nitrat và phosphat:** Nếu cao, thay 20–30% nước thường xuyên hơn, hoặc dùng nước RO/pha loãng nếu nước máy nhiều dinh dưỡng.
> -…

### algae-09 · post · plain wins (6 · 7)

**Asked:** Có cách nào trị rêu xanh nước không ạ? Em được cho cái bể đúc khá to nên phải để ngoài ban công. 2-3 tháng đầu chỉ bị bám rêu lên thành bể, phải cọ rêu thay nước nhưng nước vẫn trong. Giờ không hiểu sao cứ thay nước được khoảng 3 tuần là nước xanh lè, cá chết lăn quay. Bể có sục khí với lọc tuần hoàn thường thôi, không làm thủy sinh, đáy trống.

**Judge:** Y fits the real situation better. It suggests shade cloth for a tank on a sunny balcony and floating plants sold locally (bèo, rau muống). It also flags that a standard filter is likely too small for a big tank and that a concrete tank can push pH up. X is shorter and clearly ordered, but it says to move a tank that can't be moved, includes a lamp step that doesn't apply, and names plants by foreign names. / X fits the actual setup better: it gives shade-cover percentages for a balcony tank, uses plants people buy locally in Vietnam, warns about lime leaching and high pH from the concrete tank, and points out the filter is too small, though it is long and ends with a lot of questions. Y is shorter and well ordered, but it tells them to move a heavy concrete tank, its lamp advice doesn't apply to an outdoor tank, and it uses English plant names.

**Ours lacks:** tank-fit, local. **Plain lacks:** too-long, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Nước xanh lè là tảo phù du nở rộ. Nguyên nhân có khả năng cao nhất là bể đặt ngoài ban công, nắng chiếu vào, cộng với chất dinh dưỡng tích lại sau mỗi lần thay nước; sau khoảng 3 tuần là đủ để tảo bùng lên. Cá chết hàng loạt có thể do tảo tàn đột ngột làm thiếu oxy vào ban đêm, hoặc amoniac tăng. Mình chưa biết chắc cá chết vì nguyên nhân nào, nên làm theo thứ tự sau ngay hôm nay:
> 1. Kiểm tra cá ngay: nếu cá nổi đầu đớp khí, bật sủi hết cỡ và thay khoảng 30% nước bằng nước đã khử clo, rồi vớt xác cá ra.
> 2. Dời bể vào chỗ râm hoặc che kín để nắng không chiếu trực tiếp vào bể.
> 3. Cho ăn rất ít,…

**Plain** (3174 characters):

> Nước xanh lè lặp lại sau vài tuần thường do **dinh dưỡng tích tụ + nắng nhiều**. Thay nước làm trong nước nhanh, nhưng tảo và chất thải quay lại rất nhanh nếu không xử lý gốc. Bể đúc ngoài ban công, đáy trống, không có cây thì rất dễ bị vậy.
> 
> ## 1. Xử lý ngay khi nước đang xanh và cá có dấu hiệu yếu
> - **Kiểm tra nhanh:** Nếu cá nổi đầu há miệng vào sáng sớm, đó là **thiếu oxy ban đêm** do tảo nở dày. Tăng sục khí ngay, có thể dùng thêm máy sục dự phòng.
> - **Thay 20–30% nước**, dùng nước đã khử clo (để qua đêm hoặc dùng thuốc khử clo). Nước máy có clo sẽ giết vi sinh có lợi trong lọc.
> - **Ngừn…

### algae-09 · tank · ours wins (7.75 · 5)

**Asked:** Bể tôi cứ khoảng ba tuần sau khi thay nước lại xanh lè và cá chết, trị sao?

**Judge:** X starts from their actual tank: direct balcony sun, no plants, bare bottom. It gives the likely cause (too much sun and nutrients, then oxygen crashes at night and when the algae die off) and a clear order of steps, including shading, blackout and adding fast-growing plants. Y is a generic checklist that treats the tank as lamp-lit and ends by asking for details the app already holds. Its UV-lamp tip is useful, but it doesn't make up for the rest. / Y nói đúng nguyên nhân dựa trên bể của họ: nắng ban công, không cây, đáy trống nên tảo không bị gì cạnh tranh. Y cũng giải thích cá chết vì thiếu oxy ban đêm hoặc khi tảo tàn, và đưa ra các bước theo thứ tự kèm điều cần theo dõi. X là bài chung chung về đèn và lọc, bỏ qua chuyện bể đặt ngoài nắng, và cuối bài còn hỏi lại thông tin.

**Ours lacks:** figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 1 pages, stopped at the calls limit):

> Nhiều khả năng bể đang thừa dinh dưỡng và thừa sáng: bể đặt ngoài ban công nắng tự nhiên, không có cây, không có CO2, đáy trống nên không có gì tranh chất dinh dưỡng với tảo. Nước máy khi thay có thể mang theo nitrat và phốt phát nuôi tảo, nên khoảng ba tuần lại xanh. Cá chết thường là do ban đêm tảo tiêu thụ oxy, rồi khi tảo tàn loạt thì oxy cạn và amoniac tăng, nhất là khi bể thay nước xong mà sục khí yếu. Mình chưa rõ chắc chắn nguyên nhân nào gây chết cá nên bạn nên kiểm tra theo các bước dưới đây.
> 1. Dời bể khỏi chỗ nắng chiếu hoặc che bớt ánh sáng, và chỉ bật đèn 6 đến 8 giờ mỗi ngày.
> 2…

**Plain** (2248 characters):

> Bể xanh lại sau khoảng 3 tuần và cá chết thường là dấu hiệu nước bị mất cân bằng sinh học. Có hai vấn đề cần xử lý: **tảo nở hoa** (nước xanh) và **nước độc** (amoniac/nitrit tăng, làm cá chết).
> 
> ## 1. Nguyên nhân thường gặp
> 
> - **Ánh sáng quá nhiều**: đèn bật trên 8 giờ/ngày, hoặc bể đặt gần cửa sổ có nắng.
> - **Dư dinh dưỡng**: cho ăn quá nhiều, thức ăn thừa, phân và xác cá tích tụ ở nền, hoặc nước máy có nhiều nitrat.
> - **Vi khuẩn có lợi bị chết**: rửa lọc bằng nước máy có clo, thay hết vật liệu lọc, hoặc vệ sinh quá kỹ. Sau vài tuần, amoniac và nitrit tăng dần, cá yếu rồi chết.
> - **Thiếu ox…

### algae-10 · post · ours wins (7 · 5.5)

**Asked:** Có cách nào cứu bể em không: rêu hại dạng sợi màu nâu nhỏ nhỏ bám trên lá cây, sau đó bụi nền dính đầy vào. Thả nhiều tép thì sạch ngay, nhưng bể em nuôi nhiều thần tiên, thả tép vào thì tép bị ăn hết trước cả rêu.

**Judge:** X nhận ra rêu nâu bám rồi dính bụi là tảo silic. X cũng đưa ra các bước hợp lý: chà tay, thay nước, kiểm tra nguồn silicate, thả otto hoặc ốc nerite vì thần tiên không ăn, và có hẹn thời gian theo dõi. Y quy nguyên nhân chung chung cho đèn và dinh dưỡng, và có vài chi tiết về SAE và cây bị sai. / Y names the likely cause: diatoms (tảo silic), the soft brown algae shrimp clean off fast. It suggests otto and nerite snails, which are safe with angelfish, and tells the hobbyist to check silicate in tap water, rocks and sand. X lists generic causes, gives a doubtful common name for Ancistrus, and is longer without adding much. Y doesn't give daily light hours, though.

**Ours lacks:** figures. **Plain lacks:** diagnosis, too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Rêu nâu dạng bụi dính vào lá và nền thường là tảo silic (diatom). Trong cẩm nang, loại rêu này chủ yếu gặp ở bể mới hoặc khi nước máy, đá hay cát có nhiều silicate, và nó tự hết khi silicate cạn. Tép bị thần tiên ăn hết là chuyện bình thường, nên đừng dựa vào tép để dọn rêu trong bể này. Mình làm theo hướng dọn tay, giảm nguồn silicate và thả sinh vật khác không bị thần tiên ăn.
> 1. Chà kính, đá và lá bằng mút hoặc bàn chải đánh răng, cắt bỏ lá nào phủ rêu nặng. Làm trong buổi vệ sinh định kỳ, mỗi tuần một lần.
> 2. Thay khoảng 25–30% nước và hút bụi nền bằng ống siphon, để bỏ bớt bụi và silicat…

**Plain** (2170 characters):

> Bể của bạn vẫn cứu được. Rêu nâu dạng sợi thường do ánh sáng quá nhiều hoặc kéo dài, dinh dưỡng mất cân bằng, hoặc lưu thông nước kém. Bạn nên xử lý theo ba hướng: giảm nguyên nhân, dọn trực tiếp, và dùng sinh vật ăn rêu phù hợp với thần tiên.
> 
> **1. Giảm nguyên nhân (quan trọng nhất)**
> - **Ánh sáng:** Chỉ bật đèn 6–8 tiếng/ngày, tránh ánh nắng trực tiếp chiếu vào bể.
> - **Thay nước:** Thay 25–30% mỗi tuần, hút sạch bụi nền khi thay. Rêu nâu thường bùng lên khi nước ít thay và nitrat tích tụ.
> - **Cho ăn vừa phải:** Thức ăn thừa phân hủy làm tăng dinh dưỡng cho rêu. Chỉ cho ăn lượng cá ăn hết tr…

### algae-10 · tank · plain wins (5 · 6)

**Asked:** Lá cây trong bể tôi bị rêu sợi nâu bám, mà thả tép thì bị cá ăn mất, xử lý sao?

**Judge:** Y đưa ra cách thực tế nhất cho bể có thần tiên: thay tép bằng ốc Nerite hoặc cá otto, đồng thời giảm đèn và giảm dinh dưỡng. Tuy vậy Y có vài lỗi về tên cá. X an toàn hơn nhưng bỏ qua chuyện người hỏi nuôi thần tiên và không gợi ý sinh vật ăn rêu nào khác thay cho tép. / Cả hai đều không nói thẳng rằng cá thần tiên sẽ ăn tép. Tuy vậy, X đưa ra cách thay thế dùng được ngay, hợp với bể có thần tiên, là thả ốc nerite hoặc cá oto, kèm lồng bảo vệ tép và các bước giảm đèn, giảm dinh dưỡng. Y thì vẫn cố giữ tép bằng mẹo thả buổi tối, gần như vô ích với thần tiên, và không gợi ý con nào khác để ăn rêu.

**Ours lacks:** tank-fit, plan, diagnosis. **Plain lacks:** tank-fit, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Mình đoán lá bị bám rêu sợi nâu thường do cây yếu hoặc thiếu carbon, thiếu dinh dưỡng, hoặc bể còn mới nên rêu nâu (tảo silic) đang nở. Bạn nói rõ hơn giúp mình: rêu có dạng sợi dài bám chắc hay chỉ là lớp nâu mỏng dễ chà bằng tay, và bể chạy được bao lâu. Theo cẩm nang, rêu sợi thường mọc khi cây yếu kéo dài, cây mới bị stress, hoặc amoniac tăng khi đèn đang mạnh. Rêu nâu ở bể mới thường tự hết sau vài tuần.
> 1. Kiểm tra amoniac và nitrit bằng bộ test. Nếu amoniac có số, hãy thay khoảng 30% nước và tắt bớt đèn còn 6 đến 8 giờ mỗi ngày trong vài ngày.
> 2. Dùng nhíp hoặc tay gỡ sợi rêu trên lá, …

**Plain** (1829 characters):

> Rêu sợi nâu thường xuất hiện khi **ánh sáng mạnh/kéo dài** hoặc **dinh dưỡng dư thừa** (nhất là phosphate, nitrate), hoặc khi bể mới chưa cân bằng. Thả tép là cách sinh học tốt, nhưng cần bảo vệ tép khỏi cá trước. Bạn có thể làm như sau:
> 
> **1. Xử lý nguyên nhân trước**
> - Giảm thời gian đèn xuống còn 6–8 giờ/ngày, tránh ánh nắng trực tiếp chiếu vào bể.
> - Thay nước 20–30% mỗi tuần, hút sạch cặn đáy.
> - Giảm lượng thức ăn cho cá và bớt phân bón nếu đang dùng.
> - Kiểm tra nitrate và phosphate; nếu cao thì thay nước thường xuyên hơn.
> 
> **2. Làm sạch trực tiếp**
> - Dùng tay hoặc bàn chải mềm chà nhẹ lê…

### algae-11 · post · tie or split (6.5 · 6.5)

**Asked:** Nhà mình dùng nước máy làm nước bể cá. Trước ở chỗ khác, thả cá vào mấy tháng mới phải thay nước một lần. Giờ chuyển về chỗ mới, để bể không có cá (chỉ 1 con cá dọn bể) thì không sao, nhưng cứ thả cá vào chưa đến một tuần là nước chuyển sang màu xanh lá cây, xanh đậm dần rồi cá chết. Bể không, không có cây cỏ gì cả. Trước có bỏ mấy gói tăng oxy gì đó, giờ không cho cũng vẫn vậy. Bắt bệnh giúp mình với.

**Judge:** Y is the better answer. It covers the likely causes in the hobbyist's tank (sunlight at the new spot, the tank not yet cycled, the tap water) and says to add aeration, which matters once the water turns green. X is tidier, but it rules out oxygen loss as a cause of death and its first step depends on having a test kit. / Y cho các bước rõ thứ tự, có ngưỡng đo cụ thể (0,5 mg/L), thay nước hằng ngày và dặn theo dõi mỗi ngày, nên người chơi làm theo được ngay. X giải thích rộng hơn và nhắc đúng chuyện tụt oxy do tảo, nhưng dài dòng, nói chắc chuyện cloramin ở Việt Nam mà không có căn cứ, và kết thúc bằng một loạt câu hỏi ngược lại.

**Ours lacks:** diagnosis, tank-fit. **Plain lacks:** too-long, figures, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là bể mới chưa có vi sinh lọc nên amoniac tăng khi thả cá, còn nước máy ở chỗ mới có thể chứa cloramin chưa được khử, làm cá yếu và chết. Nước chuyển xanh là tảo phù du nở rộ do amoniac và ánh sáng, và cá chết thường vì amoniac hoặc clo chứ không phải vì thiếu oxy, nên gói tăng oxy không giải quyết được gì. Mình chưa đo được thông số nào nên chưa chắc chắn, bạn cần đo để xác nhận.
> 1. Ngay bây giờ, đo amoniac và nitrit bằng bộ test nước. Nếu amoniac hoặc nitrit trên 0,5 mg/L thì bạn nên chuyển cá sang xô nước đã khử clo và có sủi.
> 2. Trước mỗi lần thay nước, khử clo…

**Plain** (2596 characters):

> Mình đoán có vài nguyên nhân chính, và nguyên nhân quan trọng nhất là **bể mới chưa có hệ vi sinh lọc**.
> 
> **1. Bể chưa "chín" (chưa có vi khuẩn lọc)**
> - Khi chỉ có 1 con cá dọn bể, lượng chất thải rất ít nên không đáng kể.
> - Khi thả thêm cá, chất thải (amoniac, nitrit) tăng nhanh mà vi khuẩn có ích chưa đủ để phân hủy.
> - Amoniac và nitrit độc với cá, và đồng thời là "thức ăn" cho tảo nên nước chuyển xanh.
> - Ở chỗ cũ, bể chạy được nhiều tháng vì đã có vi khuẩn sẵn trong bể lọc, sỏi, đá hoặc miếng bọt biển. Khi chuyển nhà, nếu bạn chỉ mang bể mà không mang bộ lọc/vật liệu cũ hoặc không để nước …

### algae-11 · tank · ours wins (7.75 · 5.25)

**Asked:** Bể tôi cứ thả cá vào là chưa tới một tuần nước xanh lè rồi cá chết, vì sao?

**Judge:** X dựa vào chi tiết thật của bể: bể trống không cây, nước máy, con cá dọn bể (tỳ bà). X nêu nguyên nhân rõ (bể chưa chạy chu trình nitơ, tảo nở, ban đêm thiếu oxy) và đưa các bước theo thứ tự, có số liệu: đo amoniac và nitrit, thay 30–50% nước nếu đo thấy, tắt bớt đèn, thêm cây mọc nhanh. Y nói chung chung cho mọi bể, dài, rồi hỏi lại những thông tin app đã có sẵn. / Y đưa ra cùng nguyên nhân chính (bể chưa chạy chu trình nitơ, tảo nở ban đêm ăn hết oxy) nhưng gắn với bể của người hỏi: bể trống không cây, nước máy, cá dọn bể/tỳ bà. Y có các bước theo thứ tự, ngưỡng để thay nước và dặn cần theo dõi gì. X đúng nhưng chung chung, dài, và kết thúc bằng việc hỏi lại những điều app đã có.

**Ours lacks:** follow-up, figures. **Plain lacks:** tank-fit, too-long, asks-only, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng bể chưa kịp chạy chu trình nitơ, nên amoniac từ cá và thức ăn tích lại nhanh trong tuần đầu, còn cây trong bể thì chưa có để hút bớt. Nước xanh là tảo phù du nở lên nhờ lượng đạm dư và ánh sáng, và ban đêm tảo cùng vi khuẩn dùng hết oxy, nên cá dễ chết. Bể lại không có cây, tức không có chỗ nào khác hấp thụ chất thải. Cá vừa chuyển từ chỗ cũ, từng dùng gói oxy, cũng đang yếu nên dễ chết hơn khi nước xấu. Mình chưa biết bể dung tích bao nhiêu nên chưa chắc chắn hoàn toàn.
> 1. Mua bộ thử nước và đo amoniac, nitrit ngay hôm nay; nếu amoniac hoặc nitrit trên 0 thì thay 30–50% nước b…

**Plain** (2740 characters):

> Nước xanh lè và cá chết nhanh thường có liên quan với nhau. Nguyên nhân thường gặp nhất là **bể chưa chu trình nitơ (chưa "chín")**, kết hợp với việc cho cá vào quá sớm.
> 
> ## 1. Nguyên nhân chính
> 
> **a. Bể chưa có vi khuẩn có lợi (chu trình nitơ chưa hoàn thiện)**
> - Cá thải ra amoniac (NH₃/NH₄⁺), và thức ăn thừa phân hủy cũng tạo amoniac.
> - Bình thường vi khuẩn có lợi sẽ chuyển amoniac thành nitrit rồi thành nitrat. Nếu bể mới, chưa đủ vi khuẩn, amoniac và nitrit tăng cao và giết cá trong vài ngày.
> - Đây cũng là lý do cá chết sau khi thả, dù nước trông "có vẻ" bình thường.
> 
> **b. Tảo lục đơn bào…

### setup-01 · post · plain wins (5 · 8.25)

**Asked:** Vợ em vừa bắt em đầu tư một bể thủy sinh, em đặt mua trọn bộ: bể dài 1m + chân gỗ + sục + lọc + đèn (2 bóng LED) + sưởi. Em ở Hà Nội, trời đang lạnh. Em mù mờ khoản này nên hỏi: 1) Bên setup bảo bật đèn liên tục 3 ngày đầu rồi khoảng 8h/ngày, nhưng em đọc trên mạng thì tuần đầu chỉ bật 50% công suất rồi tăng dần lên 100%, 8h/ngày để tránh rêu và cho cây thích nghi. Cách nào đúng? 2) Cho cá ăn tần suất thế nào? 3) Sưởi có nên bật 24/24 không? 4) Có nên mua thêm bình CO2 không, vì em thấy phải có cái này cây mới đủ chất? 5) Lọc họ trang bị chỉ qua sợi bông đơn giản, em đọc thấy phải lọc qua sứ, mà lọc ngoài thì không có chỗ đặt vì bể dùng chân gỗ, không có tủ. Lọc như của em có ổn không? 6) Nên thay nước mấy ngày một lần, lúc mới setup và lúc đã ổn định?

**Judge:** Y trả lời đúng câu hỏi về sưởi: cắm 24/24 cho thermostat tự ngắt, và nhắc rút điện khi thay nước. Y cũng dặn chưa thả cá trong lúc bể chạy vi sinh, gợi ý thêm lọc bọt biển hợp với bể dùng chân gỗ, và nhắc nước máy Hà Nội có clo. X khuyên sai về sưởi và bám sát tình huống của người hỏi kém hơn. / X trả lời đúng câu về sưởi: bật 24/24 và để bộ điều nhiệt tự ngắt. X còn dặn rút phích sưởi trước khi thay nước, nói rõ lọc chỉ có bông là chưa đủ, gợi ý thêm lọc vi sinh chạy bằng sục và dặn chưa thả cá ngay. Y trả lời sai câu về sưởi và có câu đệm thừa kiểu "chưa đối chiếu cẩm nang".

**Ours lacks:** wrong, tank-fit, follow-up. **Plain lacks:** –.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình trả lời theo từng câu bạn hỏi. Về đèn, cách hợp lý là bắt đầu thấp rồi tăng dần, không nên bật liên tục 3 ngày. Một cách làm phổ biến là bật 6–8 giờ mỗi ngày, tuần đầu chỉ cho đèn chạy khoảng 50% công suất, sau đó tăng dần lên 100% trong 1–2 tuần, để tảo ít có cơ hội bùng lên khi nước chưa ổn định. Mình chưa đối chiếu được chi tiết lịch đèn trong cẩm nang lúc này, nên bạn hãy đối chiếu thêm với hướng dẫn của hãng đèn.
> 1. Cài timer cho đèn 6–8 giờ mỗi ngày, bắt đầu ở 50% công suất trong tuần đầu, rồi tăng dần lên 100% ở tuần thứ hai hoặc thứ ba; không bật 24/24.
> 2. Cho cá ăn một lần mỗi n…

**Plain** (3255 characters):

> Em hỏi đúng lúc, vì mấy tuần đầu quyết định khá nhiều đến việc bể có ổn định hay không. Chị em trả lời từng câu nhé.
> 
> **1) Đèn: nên bật bao lâu?**
> Cách đọc trên mạng hợp lý hơn. Bật 3 ngày liên tục là không chuẩn, vì đèn sáng quá lâu trong bể mới chưa cân bằng dinh dưỡng rất dễ bùng rêu.
> - **Tuần 1-2:** bật khoảng 4-6 giờ/ngày. Nếu đèn chỉnh được cường độ thì để mức thấp (khoảng 50%).
> - **Từ tuần 2-3:** tăng dần lên 6-8 giờ/ngày, nếu cây vẫn ổn và rêu chưa bùng thì giữ mức này.
> - Nên dùng **timer cắm ổ** để bật tắt đều đặn, đừng bật tắt bằng tay.
> 
> **2) Cho cá ăn thế nào?**
> - Bể mới setup **ch…

### setup-01 · tank · tie or split (5.5 · 5.75)

**Asked:** Bể mới mua của tôi nên bật đèn, sưởi, thay nước thế nào và có cần mua thêm CO2 không?

**Judge:** Neither answer uses the details of their tank: the 1 m size, the Hanoi winter, the sponge filter, or whether to run the 2 LEDs for 3 days straight. Y still gives a fuller and more practical plan: fishless cycling, starting the light at 6 hours and raising it, heater safety, matching the temperature of new water in winter, and rinsing filter media in old tank water. X's heater example is for a 20 L tank, which doesn't fit theirs. / Cả hai câu trả lời đều không dùng đến chi tiết của bể: bể 1m, 2 bóng LED, câu hỏi bật đèn 3 ngày liền hay 50% rồi tăng dần, và mùa lạnh ở Hà Nội. Y gọn hơn, đưa ra mức W/lít hợp lý và dặn những thứ cần theo dõi, còn X dài, phải hỏi lại người dùng, và đưa ra mức sưởi 2–3W/lít quá cao.

**Ours lacks:** tank-fit, figures, follow-up. **Plain lacks:** tank-fit, too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Bể mới bạn nên bật sưởi và đèn để nước ổn định dần, nhưng chưa thả cá ngay vì lọc chưa có vi khuẩn để xử lý amoniac. Nếu bể chưa trồng cây thì bạn không cần mua CO2.
> 1. Sưởi: chọn loại chỉnh được nhiệt, giữ nước khoảng 23–27°C. Với bể có nắp và nước chỉ cao hơn phòng 5–6°C, một mức khởi đầu là khoảng 1,3 W mỗi lít, ví dụ bể 20 lít khoảng 25 W; nếu đặt trong phòng máy lạnh thì nên chọn 50 W. Nhớ thêm nhiệt kế để biết sưởi vẫn chạy.
> 2. Đèn: nếu chưa trồng cây thì đèn vừa cỡ bể là đủ, bật khoảng 6–8 giờ mỗi ngày. Giai đoạn đầu nên để đèn yếu và bón ít phân để rêu ít có cơ hội mọc.
> 3. Nước: khử c…

**Plain** (2643 characters):

> # Hướng dẫn cơ bản cho bể cá mới
> 
> ## 1. Chu trình nitrogen (quan trọng nhất)
> 
> Trước khi thả cá, bể cần vi khuẩn có lợi để phân hủy amoniac từ chất thải và thức ăn thừa. Quá trình này mất khoảng **4-8 tuần**.
> 
> - Chạy máy lọc và sưởi trước, chưa thả cá.
> - Dùng bộ test (NH₃/NH₄⁺, NO₂⁻, NO₃⁻) để theo dõi. Có thể dùng men vi sinh (bio-starter) để rút ngắn thời gian.
> - Khi amoniac và nitrit đều về 0 và có nitrat, bể đã sẵn sàng.
> - Không thả cá ngay, vì amoniac và nitrit rất độc.
> 
> ## 2. Đèn
> 
> - Bật **6-8 tiếng/ngày**, nên dùng timer để giữ lịch cố định.
> - Tránh ánh nắng trực tiếp, vì dễ gây rêu xanh.…

### setup-02 · post · ours wins (6 · 3)

**Asked:** Mình đang gom đồ để set hồ 60x40x40 chơi rêu taiwan, trân châu ngọc trai, la hán và ráy, bố cục bonsai. Phân nền dùng Gex xanh. Tư vấn giúp mình nên mua đèn và lọc loại nào?

**Judge:** X là câu trả lời tốt hơn. X hiểu đúng trân châu ngọc trai là cây và hỏi lại la hán là cây hay cá. X cũng đưa đủ công suất đèn và lưu lượng lọc dùng được ngay, chỉ có thời gian chiếu sáng hơi dài. Y hiểu nhầm trân châu là tôm nên cả phần cảnh báo bị lệch, còn khuyên lót đá vôi dưới nền Gex và mua sưởi, cả hai đều không hợp với khí hậu VN. / Y reads the list correctly as plants and gives usable light and filter figures, a buying order, and a reasonable question about la hán. X takes the plants for a flowerhorn and shrimp, builds the answer around that mistake, and adds errors: limestone under Gex, the wrong Eheim flow rate, and a heater that isn't needed in Vietnam.

**Ours lacks:** local, follow-up. **Plain lacks:** wrong, tank-fit, local, too-long.

**Ours** (read 0 pages, stopped at the tools limit):

> Với bể 60x40x40 (khoảng 96 lít) có rêu Taiwan, trân châu ngọc trai, ráy và bonsai, mình nghĩ bạn nên chọn đèn LED có thể chỉnh cường độ, khoảng 0,5 đến 0,6 W mỗi lít, tức khoảng 50 đến 60 W, và lọc ngoài hoặc lọc treo sau có lưu lượng khoảng 400 đến 600 lít mỗi giờ, tức 4 đến 6 lần thể tích bể, để nước lưu thông nhưng không làm trôi rêu. Đây là kinh nghiệm chung của mình, chưa đối chiếu với cẩm nang. Các bước mua sắm: 1. Mua đèn LED 50 đến 60 W có thể chỉnh cường độ, chạy 8 đến 10 giờ mỗi ngày; trân châu ngọc trai cần ánh sáng mạnh hơn, còn rêu Taiwan và ráy chịu sáng vừa. 2. Mua lọc ngoài ho…

**Plain** (1926 characters):

> Bạn đang lên ý tưởng khá hay, nhưng có một vấn đề lớn cần cân nhắc trước khi mua đèn và lọc.
> 
> ## Cảnh báo về La hán
> 
> **La hán không hợp với tôm/tép trân châu** và cũng không hợp với bố cục rêu và cây mềm:
> - La hán ăn tôm, tép, nên tôm trân châu sẽ bị ăn hết.
> - La hán có tính phá hoại, hay nhổ, ủi cây và làm đổ bố cục bonsai.
> - Trưởng thành La hán dài 25-30cm, hồ 96L (60x40x40) là hơi nhỏ, không đủ không gian lâu dài.
> 
> **Gợi ý:** Nếu muốn giữ tôm trân châu, bạn nên bỏ La hán. Nếu thích cá lớn, nên chọn cá hiền hơn như cá cảnh nhỏ (cá neon, cá tuyết, cá ông tiên...) hoặc để hồ chỉ có tôm/tép và…

### setup-02 · tank · plain wins (4 · 5)

**Asked:** Bể tôi sắp set nên mua đèn và lọc loại nào?

**Judge:** Cả hai câu trả lời đều hỏi lại kích thước bể và không dùng thông tin bể 60×40×40 (~96 L) trồng trân châu và rêu theo bố cục bonsai. Vì vậy cả hai đều không nói tới chuyện cần đèn đủ mạnh, có thể cần CO₂, và lọc thùng là lựa chọn hợp lý. Y nhỉnh hơn vì nêu các hãng dễ mua ở VN (Chihiros, Sunsun...) và đưa ra con số lưu lượng lọc cụ thể. X thì lạc đề khi khuyên trồng cây ưa sáng yếu. / Neither answer used the tank data: 60×40×40 cm, about 96 L, with a carpet that needs strong light and CO2. Both mostly ask questions back. X is somewhat more useful: it says planted tanks need stronger full-spectrum light, gives a 4–6× per hour flow guideline, and names brands sold in Vietnam (Chihiros, Sunsun). Y's low-light beginner plant advice doesn't fit their planned plants.

**Ours lacks:** tank-fit, figures, local, plan. **Plain lacks:** tank-fit, plan, figures.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình cần biết kích thước bể (dài x rộng x cao, cm), bạn định nuôi cá, tép hay chỉ trồng cây, và bạn có ý định châm CO2 không. Những thứ đó quyết định công suất đèn và loại lọc. Trong khi chờ, đây là hướng chọn chung trong cẩm nang.
> 1. Đèn: chọn đèn LED, và nên có chỉnh được độ sáng. Nếu bạn mới chơi, hãy bắt đầu với cây ưa sáng yếu như anubias, cryptocoryne và dương xỉ, không cần CO2. Bể càng cao thì đèn càng phải mạnh hơn để ánh sáng xuống tới đáy. Đừng mua đèn chỉ dựa vào chữ W trên hộp, hãy xem đèn có phủ hết chiều dài bể không.
> 2. Lọc: với bể cá thông thường, lọc thùng hoặc lọc treo là lự…

**Plain** (1464 characters):

> Mình cần biết thêm vài thông tin để gợi ý chính xác hơn:
> 
> - **Kích thước bể** (dài × rộng × cao, hoặc số lít)
> - **Nuôi gì:** chỉ cá, cá + cây thủy sinh, hay có tôm/cá nhỏ nhạy cảm như betta, tép?
> - **Ngân sách** dự kiến
> 
> Trong lúc chờ, đây là gợi ý chung:
> 
> **Đèn**
> - Nên chọn **đèn LED**: tiết kiệm điện, ít tỏa nhiệt, tuổi thọ cao.
> - **Bể chỉ có cá:** đèn LED phổ thông, khoảng 6500K, công suất vừa đủ chiếu sáng là được.
> - **Bể có cây thủy sinh:** nên chọn đèn chuyên cho cây, có phổ ánh sáng đầy đủ (full spectrum) và có thể chỉnh độ sáng. Cây cần ánh sáng mạnh hơn nhiều so với cá.
> - Nên có **hẹ…

### setup-03 · post · plain wins (3.5 · 8)

**Asked:** Em có cái bể đang bỏ không, hiện chỉ có mỗi bể, không đèn không lọc không gì hết. Với tầm 3-4 triệu thì nên làm gì để hồi sinh nó? Thủy sinh rong rêu cũng được, còn cá thì em thích kiểu thả nhiều con cá nhỏ tí ti.

**Judge:** Y tận dụng cái bể bạn ấy đang có: kiểm tra rò rỉ trước, rồi chia ngân sách theo giá VNĐ hợp lý, chọn lọc bọt biển cho cá nhỏ, chỉ mua sưởi khi phòng lạnh, và đưa ra danh sách cá kèm các bước có số liệu cụ thể. X bảo mua lại cả bể, gợi ý lọc quá mạnh và sưởi không cần thiết, lại không có bảng chi phí. / X builds on the tank the hobbyist already has. It gives a realistic budget table, a well-chosen list of small schooling fish, and clear steps for cycling the tank. Y assumes they still need to buy a tank, pushes an unnecessary heater, and gives almost no fish suggestions or numbers.

**Ours lacks:** tank-fit, figures, local. **Plain lacks:** –.

**Ours** (read 2 pages, stopped at the tools limit):

> Bể của bạn đang trống nên việc cần làm là trang bị lại từ đầu: bể, đèn, lọc, sưởi, rồi mới đến cây và cá. Với 3-4 triệu, cẩm nang gợi ý bắt đầu bằng bể 35-55 lít không viền, vì cỡ này dễ chăm và đủ chỗ cho một đàn cá nhỏ. Bạn cho mình biết kích thước bể (dài, rộng, cao) để mình tính đèn và lọc cho đúng.
> 1. Đo bể và kệ, kiểm tra kệ có chịu nổi bể đầy nước không, rồi chốt cỡ bể trước khi mua đồ khác.
> 2. Mua đèn đúng bằng chiều dài bể. Nếu chơi cây thủy sinh thì chọn đèn LED đủ sáng, nhưng ban đầu nên bật ít giờ để tránh rêu.
> 3. Mua một lọc trong giá rẻ, cẩm nang gợi ý khoảng 400 lít/giờ là đủ c…

**Plain** (2636 characters):

> Bể không đèn, không lọc vẫn hồi sinh được với 3-4 triệu. Hướng hợp lý nhất là làm bể **thủy sinh low-tech** (ít đèn, không CO2, không phân bón phức tạp), vừa rẻ vừa dễ giữ cho người mới.
> 
> ## 1. Kiểm tra bể trước
> - Rửa sạch, kiểm tra keo silicon và các mép kính có rò rỉ không. Đổ nước thử 1-2 ngày.
> - Nếu bể nứt hoặc keo hở, nên sửa hoặc đổi bể trước khi đầu tư thiết bị.
> - Cho em biết kích thước bể (ví dụ 40×25×25 cm hay 60×30×30 cm) để anh tính chính xác hơn.
> 
> ## 2. Phân bổ ngân sách (ước tính, bể khoảng 40-60 cm)
> 
> | Hạng mục | Gợi ý | Chi phí ước tính |
> |---|---|---|
> | **Đèn LED thủy sinh** |…

### setup-03 · tank · plain wins (4 · 6.75)

**Asked:** Tôi có bể trống và 3-4 triệu, nên mua gì để làm bể thủy sinh nuôi đàn cá nhỏ?

**Judge:** Câu trả lời X bỏ qua chuyện người hỏi đã có bể trống, vẫn bảo mua bể và tính tiền bể vào ngân sách, lại không cho giá tiền cụ thể nào. Câu trả lời Y dùng đúng cái bể sẵn có, chia ngân sách bằng giá tiền VND sát thực tế, gợi ý cá đàn và nhắc phải chạy chu trình nitơ cho bể. Dù Y có vài lỗi nhỏ về tên gọi và về cá bảy màu, Y vẫn hữu ích hơn hẳn. / Theo ghi chú, bạn này đã có bể sẵn. Y vẫn bảo đi mua bể nên ngân sách bị chia sai và không nói gì cụ thể về cá. X làm việc với cái bể đã có: có bảng giá từng món, gợi ý cá đàn, nhắc chạy bể 2–4 tuần trước khi thả cá và cách chăm sóc. X còn vài chỗ sai về tên gọi trong nước nhưng vẫn giúp được nhiều hơn.

**Ours lacks:** tank-fit, figures, local, plan. **Plain lacks:** local.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể trống và khoảng 3-4 triệu, bạn nên bắt đầu bằng một bể nano không viền khoảng 35-55 lít, rồi chọn đèn, lọc và sưởi vừa với bể. Cẩm nang khuyên người mới nên chọn bể cỡ này vì đủ để học hết các bước, còn bể quá nhỏ thì hợp tép hơn cá.
> 1. Đo chỗ đặt bể và kiểm tra kệ có chịu nổi sức nặng không. Bể đã có nước, nền và thiết bị có thể nặng gần 1,2 kg mỗi lít, nên với bể 55 lít bạn cần kệ chắc.
> 2. Mua bể kính thường, không viền, khoảng 36-60 cm. Kính thường ở cửa hàng cá cảnh dùng tốt, không cần kính siêu trong. Nên mua thêm tấm lót đáy, rẻ và giúp đáy bể phẳng.
> 3. Mua đèn LED chuyên cho bể …

**Plain** (2184 characters):

> Với bể trống và khoảng 3–4 triệu, bạn đủ để làm một bể thủy sinh cơ bản đẹp và ổn định. Giả sử bể khoảng 60x30x35 cm (~60 lít), bạn có thể chia ngân sách như sau (giá tham khảo, có thể chênh lệch tùy cửa hàng):
> 
> ## Danh sách mua sắm
> 
> | Hạng mục | Gợi ý | Giá ước tính |
> |---|---|---|
> | **Lọc nước** | Lọc thác hoặc lọc hộp (Sunsun, Resun, Jebao) công suất phù hợp thể tích | 150–300k |
> | **Đèn LED** | Đèn thủy sinh LED đủ dài cho bể (60 cm), có chế độ hẹn giờ | 250–400k |
> | **Nền** | Sỏi thủy sinh hoặc đất nền (ADA, Tropica, hoặc loại rẻ hơn) | 150–300k |
> | **Máy sưởi** | Chỉnh nhiệt tự động 50–…

### setup-04 · post · tie or split (6.25 · 6)

**Asked:** Mình muốn set hồ 60x36x36 để trên kệ tivi phòng khách chung cư nên cần tinh gọn, không có chỗ cho bình CO2, thùng lọc. Phương án của mình: bố cục đá Tiger + rêu mini fiss và ráy lá nhỏ ở tiền cảnh, rong La Hán + dương xỉ Java ở hậu cảnh, đều là cây cần ít CO2. Mình tính dùng lọc thác. Bố cục vậy có ổn không, nên dùng nền nào và bao nhiêu?

**Judge:** Y nói đầy đủ hơn: đèn, thay nước, dòng chảy cho rêu, tiếng ồn khi đặt trong phòng khách, và ước tính tải trọng kệ đúng. X gọn nhưng đánh giá thấp trọng lượng bể và chỉ né câu hỏi về rong La Hán bằng câu "không có trong cẩm nang". / Y cho các bước làm được ngay: buộc dương xỉ lên đá, không chôn thân rễ, đặt viên phân nền cho ráy, đậy nắp chống bốc hơi, và nói rõ cần theo dõi gì trong 2–4 tuần đầu. Tuy vậy Y ước tải trọng thấp và nhắc "cẩm nang" nghe gượng. X viết tự nhiên hơn và ước tải trọng đúng hơn, nhưng sai về chuyện lọc thác bù CO2 và gọi nhầm tên rêu, lại thiếu hướng dẫn trồng cụ thể và phần theo dõi.

**Ours lacks:** figures, tank-fit, local. **Plain lacks:** too-long, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Bố cục của bạn khá ổn cho một bể 60x36x36 không CO2: đá Tiger, rêu Fissidens, dương xỉ Java và ráy nhỏ đều chịu được bể low-tech, và bể nhỏ, tinh gọn trên kệ TV là hợp lý. Có một điểm cần sửa: rong La Hán không có trong cẩm nang, nên mình không chắc về nó. Nếu muốn một cây hậu cảnh dễ, bạn có thể chọn cây thân cao nào đó đã được cẩm nang ghi là chịu được bể không CO2, hoặc hỏi thêm người bán về cây này trước khi mua.
> 1. Nền: dùng sỏi mịn hoặc cát trơ (ít dinh dưỡng), dày khoảng 4 đến 5 cm ở phía sau và thấp dần về phía trước; với 60x36 cm, bạn cần khoảng 11 đến 13 lít. Cẩm nang nói nền trơ gầ…

**Plain** (3432 characters):

> # Đánh giá: ổn, nhưng cần vài chỉnh sửa
> 
> Hướng low-tech của bạn hợp lý cho hồ nhỏ trên kệ tivi. Đá Tiger, rêu Fissidens, ráy lá nhỏ và dương xỉ Java đều chịu ánh sáng vừa phải và không cần CO2. Tuy nhiên, có vài điểm cần lưu ý.
> 
> ## 1. Điểm cần xem lại
> 
> **Rong La Hán ở hậu cảnh là mắt xích yếu nhất.** Nhiều loại rong thân (stem plant) tăng trưởng nhanh, cần CO2 và dinh dưỡng nền để lên màu và phát triển đều. Không có CO2, chúng dễ vàng lá, tàn lụi hoặc mọc chậm, lệch dáng. Bạn nên kiểm tra kỹ tên khoa học hoặc tên thương mại vì "La Hán" được gọi cho nhiều loại khác nhau. Nếu nó thuộc nhóm cần …

### setup-04 · tank · ours wins (8 · 3)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu, và chọn cây như vậy có ổn không?

**Judge:** X dùng đúng thông số bể của bạn: không CO₂, phần lớn là cây bám đá, lũa. Nó khuyên dùng nền trơ, tính lượng sỏi theo đáy 60×36, nhắc không chôn thân rễ, và lưu ý tải trọng kệ tivi khoảng 100 kg. Y hỏi lại kích thước và danh sách cây dù app đã có sẵn, rồi chỉ đưa nguyên tắc chung. Ví dụ tính của Y lại dùng bể 60×30, không phải bể 60×36 của bạn. / Y nhắm đúng bể của bạn này. Nó khuyên dùng nền trơ cho nhóm cây buộc lên đá, lũa và không cần CO₂, tính đúng lượng nền cho đáy 60×36, dặn buộc rêu, ráy, dương xỉ chứ không chôn, và nhắc kiểm tra tải trọng kệ tivi. X chủ yếu hỏi lại những thông tin app đã có sẵn và chỉ đưa lời khuyên chung chung.

**Ours lacks:** local, tank-fit. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 1 pages):

> Với bể 60x36x36 cm không dùng CO₂ và các cây bạn đã chọn (rêu mini fissidens, ráy lá nhỏ, dương xỉ Java, rong La Hán), nền trơ như sỏi hoặc cát thô là hợp lý. Các cây này lấy dinh dưỡng chủ yếu từ nước, nên không cần nền giàu dinh dưỡng.
> 1. Chọn sỏi núi lửa hoặc sỏi thường hạt vừa, tránh cát quá mịn vì rễ khó lan. Nếu muốn giữ dinh dưỡng tốt hơn thì dùng loại như CaribSea Eco-Complete hoặc Seachem Flourite, còn sỏi thường vẫn trồng tốt.
> 2. Với đáy 60x36 cm, lớp nền 3–4 cm cần khoảng 8–9 lít, tức khoảng 12–14 kg sỏi thường. Bạn kiểm tra trọng lượng trên bao để mua đúng.
> 3. Rửa sỏi thật sạch tr…

**Plain** (1460 characters):

> Mình cần thêm thông tin để tư vấn chính xác hơn. Bạn cho mình biết:
> 
> 1. **Kích thước bể** (dài × rộng × cao, hoặc số lít).
> 2. **Danh sách cây** bạn định trồng.
> 3. **Cá hoặc sinh vật** sẽ nuôi chung (nếu có).
> 4. **Đèn và CO2:** bạn dùng đèn LED loại nào, công suất bao nhiêu, có bơm CO2 không?
> 
> Trong lúc chờ, bạn có thể tham khảo các nguyên tắc chung sau:
> 
> **Chọn nền**
> - **Nền dinh dưỡng chuyên dụng** (ADA Aqua Soil, Tropica, Fluval Stratum...): tốt nhất cho cây khó trồng, cây cần nhiều dinh dưỡng. Thường cần bón thêm phân và có thể tróc chất ở vài tháng đầu.
> - **Đất sét nung / sỏi nền chuyên d…

### setup-05 · post · plain wins (3 · 7)

**Asked:** Em định set hồ 1m2x50x50 phong cách natural, chủ yếu rêu, ráy với ít cây cắt cắm lá đỏ. Nên chọn nền thế nào, bao nhiêu kg cho phù hợp và kinh tế? Em tính xài nền trộn kết hợp Aquafor thì ổn không? Đèn em xài T5HO, 2 bóng 10k, 1 bóng 6k5, 1 bóng hồng có hợp lý không?

**Judge:** Y reads the tank size right (120 cm, about 300 L). It gives a layered plan, mixed base under and Aquafor on top, the way Vietnamese keepers do it, with kg figures and a sensible review of the lights. X uses the wrong tank size and treats Aquafor as an additive. / X đúng kích thước 120cm và hiểu đúng nền trộn với Aquafor. X đưa cách lót lớp đất trộn bên dưới, Aquafor bên trên, kèm số kg và phân tích bộ đèn T5HO, chỉ sai vài chỗ nhỏ. Y ghi sai kích thước hồ, hiểu nhầm Aquafor và gợi ý Akadama sai, nên người chơi bị dẫn sai hướng.

**Ours lacks:** wrong, tank-fit, local. **Plain lacks:** follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể 100x50x50 kiểu natural chủ yếu rêu và ráy, bạn không cần nền trộn nhiều. Cẩm nang cho rằng cây kiểu này mọc chậm nên chỉ cần một lớp phân nền công nghiệp nhả chậm là đủ, và người mới nên dùng phân nền công nghiệp vì dễ hơn và ít bung nền hơn. Về đèn, 2 bóng 10k và 1 bóng 6k5 là đủ cho rêu và ráy; bóng hồng không cần thiết và làm giảm ánh sáng nhìn thấy, nên bạn có thể bỏ hoặc thay bằng bóng 6k5.
> 1. Chọn một loại phân nền công nghiệp nhả chậm làm nền chính. Cẩm nang gợi ý Akadama (rẻ, nhả chậm, kết quả trung bình) hoặc nền dành cho dương xỉ/Anubias nếu bạn muốn ổn định hơn.
> 2. Với bể 50…

**Plain** (2940 characters):

> # Tư vấn set hồ 120x50x50 (300L) phong cách natural
> 
> ## 1. Nền nên chọn thế nào?
> 
> Với rêu và ráy, nền không quan trọng bằng hardscape (đá, lũa). Ráy bám lên đá hoặc lũa, rêu cũng vậy. Nền chủ yếu nuôi cây cắt cắm lá đỏ.
> 
> **Cấu trúc đề xuất (tiết kiệm mà vẫn ổn):**
> - **Lớp dưới:** đất nền rẻ hoặc đất sét trộn, khoảng 2–3 cm, để cung cấp dinh dưỡng lâu dài.
> - **Lớp trên:** Aquafor khoảng 3–4 cm ở phần sau, mỏng hơn ở phần trước.
> - **Độ dốc:** phần sau dày 6–7 cm, phần trước 3–4 cm. Cách này tạo chiều sâu cho bố cục natural.
> - Nếu muốn giảm chi phí hơn nữa, có thể dùng sỏi mịn hoặc cát mịn làm l…

### setup-05 · tank · ours wins (7 · 3)

**Asked:** Bể tôi định set nên dùng nền gì, bao nhiêu kg, và đèn như vậy có đủ cho cây đỏ không?

**Judge:** X dùng đúng thông số bể của bạn: tính được khoảng 30 lít, tức 25–30 kg nền, chỉ thứ tự lót nền, và nói thẳng là đèn đủ cho rêu, ráy nhưng cây đỏ cần thêm CO₂ thì mới lên màu. Y hỏi lại những thông tin đã có sẵn và chỉ đưa lời khuyên chung chung, kèm mức W/lít của LED không áp dụng được cho T5. / Y dùng đúng bể 120×50×50, dàn T5HO 4 bóng và nền trộn + Aquafor của người hỏi, nên tính được lượng nền cụ thể, chỉ rõ thứ tự lót nền và nói thẳng là cây đỏ cần CO₂. X hỏi lại những thông tin app đã có sẵn, rồi chỉ đưa ví dụ cho bể 60 cm và mức W/lít của LED, không áp dụng được cho dàn T5 của họ.

**Ours lacks:** figures. **Plain lacks:** tank-fit, asks-only, local, plan.

**Ours** (read 3 pages, stopped at the tools limit):

> Với bể 120×50×50 cm (khoảng 300 lít), bạn nên dùng nền đất trộn kèm phân nền dạng viên hoặc bột theo đúng hướng dẫn trên bao. Cẩm nang chưa có số kg cho đúng loại nền bạn định trộn, nên con số dưới đây là ước lượng từ kinh nghiệm chung.
> 1. Lớp nền nên dày khoảng 5–6 cm, dốc nhẹ từ trước ra sau. Với đáy 120×50 cm, cần khoảng 30 lít nền, tức khoảng 25–30 kg tùy loại đất (bạn nên cân thử một bao để tính lại).
> 2. Rắc vi sinh dạng bột xuống đáy trước, rồi trải lớp đất trộn, cuối cùng phủ lớp nền mỏng hoặc cát lên trên. Cẩm nang cũng khuyên làm theo thứ tự này.
> 3. Phân nền Aquafor, nếu bạn dùng, hã…

**Plain** (1493 characters):

> Để tư vấn chính xác, bạn cho mình biết thêm:
> 
> - **Kích thước bể** (dài × rộng × cao, cm)
> - **Đèn**: công suất (W), loại LED hay T5, và hãng/model nếu có
> - **Có CO2 không?**
> - **Các loại cây đỏ** bạn định trồng (ví dụ: Rotala, Ludwigia red, Alternanthera, Cryptocoryne…)
> 
> Trong lúc chờ, đây là hướng dẫn chung:
> 
> **1. Nền**
> - **Nền dinh dưỡng** (ADA Aqua Soil, Tropica, hoặc loại tương đương): nên dùng nếu trồng nhiều cây thân, cây đỏ, cây cần nhiều dinh dưỡng. Lớp nền dày khoảng 3–5 cm.
> - **Sỏi/cát thường**: rẻ, dễ vệ sinh, nhưng cần bón phân nước đều đặn. Nếu dùng thì nên thêm viên bón rễ (root …

### setup-06 · post · tie or split (6.5 · 6.5)

**Asked:** Em đang set hồ 60x30x36, bố cục lũa đá nature. Cốt nền JBL Aquabasic Plus 1 bao (2,5 lít), phân nền Aquafor 2,5 bao (7,5 lít), quây phần nền bằng đá cuội. Cây dự kiến: rêu, ráy, ít bucep, dương xỉ, hậu cảnh cắt cắm táo lớn, hồng thái dương. Phần trống mặt tiền có nên trải sạn hoặc cát không? Với bố cục và kích thước này nên dùng máng Odyssea 2 bóng hay 4 bóng?

**Judge:** Hai bên đều khuyên dùng 2 bóng và trải lớp cát 1–2 cm, đều đúng hướng. Y nói rõ hơn về loại cát (cát vàng hoặc cát trắng, hạt 0,5–2 mm), độ dày Aquafor phía trước và chuyện chưa có CO₂. X có các bước theo thứ tự nhưng sơ sài hơn, lại khuyên chờ vài ngày mới thả cây, không đúng cách setup hồ thủy sinh. / Both answers say a thin layer at the front and a 2-bulb light because there is no CO₂, which is reasonable. Y gives clear steps in order, fits the substrate amounts the hobbyist listed, and says what to watch for. X is longer and has the backwards claim that coarse gravel sinks into the soil.

**Ours lacks:** tank-fit, too-thin, figures. **Plain lacks:** too-long, plan, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Về phần mặt tiền: nên trải một lớp sạn hoặc cát mịn mỏng, khoảng 1–2 cm, phía trước vòng đá cuội. Lớp này giúp bố cục gọn và che mép phân nền. Đừng để lớp sạn lẫn vào phân nền Aquafor, vì phân nền dễ làm nước đục khi bị xáo.
> 1. Đặt vòng đá cuội quanh khu nền trước, rồi đổ cốt nền JBL Aquabasic Plus (2,5 lít) thành lớp mỏng dồn vào giữa, chừa khoảng cách với kính.
> 2. Phủ phân nền Aquafor (7,5 lít) lên cốt nền, nền sau nên dày khoảng 5–6 cm, nền trước mỏng dần. Phân nền nên dày tối thiểu 3–4 cm để rễ cây bám được.
> 3. Trải sạn hoặc cát mịn ở phía mặt tiền, lớp mỏng, sát vòng đá cuội để giữ ranh …

**Plain** (2144 characters):

> # 1. Phần trống mặt tiền: nên trải cát hay sạn?
> 
> **Nên trải cát mịn**, hạt khoảng 0.5-2 mm (cát vàng hoặc cát trắng đã rửa sạch). Lý do:
> 
> - **Hợp phong cách nature.** Cát mịn tạo cảm giác bãi sông hoặc suối, đi cùng đá cuội quây và lũa.
> - **Dễ giữ sạch.** Sạn lớn dễ kẹt rác và cặn thức ăn, khó hút.
> - **Tương thích với nền.** Sạn hoặc cát thô dễ trôi xuống và làm lẫn vào lớp nền Aquafor.
> 
> Cách làm:
> 
> - **Tạo dốc từ sau ra trước.** Lớp nền phía sau dày khoảng 5-6 cm, phía trước giảm xuống. Nếu muốn lớp cát phía trước dày 1.5-2 cm thì lớp Aquafor phía trước chỉ nên khoảng 2-3 cm.
> - **Lớp cát giữ …

### setup-06 · tank · tie or split (4.5 · 4.5)

**Asked:** Bể thủy sinh tôi đang set có nên trải sạn mặt tiền không, và cần đèn mấy bóng?

**Judge:** Tôi thấy Y hơn X một chút. Cả hai đều không dùng thông tin bể đã có (60×30×36 cm, khoảng 65 lít, cây đa số ưa sáng yếu như rêu, ráy, bucep, dương xỉ, cộng táo lớn và hồng thái dương), nên đều không trả lời được câu "Odyssea 2 bóng hay 4 bóng". Y nói về sạn mặt tiền thực tế hơn: dốc về sau, mặt tiền dùng sạn mịn để dễ vệ sinh. Ví dụ bể 60 lít của Y cũng gần với bể này. X thì ngắn, lẫn lộn số bóng với số đèn, và lấy lý do cây thảm trong khi bể không trồng cây thảm. / Không câu nào đọc được thông tin bể (khoảng 65 lít, chủ yếu cây ráy, rêu, dương xỉ, đang phân vân máng Odyssea 2 hay 4 bóng), nên cả hai đều không đưa ra câu trả lời thẳng. Y hơn một chút vì có các bước tính số bóng theo lumen, có lịch giờ đèn cho bể mới và dặn theo dõi rêu. X nói về sạn kỹ hơn nhưng phần đèn chỉ là quy tắc chung chung, lại có chỗ sai nhỏ về cá cory.

**Ours lacks:** tank-fit, too-thin, diagnosis. **Plain lacks:** tank-fit, asks-only, plan, follow-up.

**Ours** (read 1 pages, stopped at the calls limit):

> Về đèn, mình chưa biết kích thước bể của bạn nên chưa tính được số bóng. Cẩm nang hướng dẫn tính theo lumen: lấy số lít nước nhân khoảng 40 lumen, rồi chọn đèn LED có tổng lumen gần con số đó, ưu tiên loại RGB. Ví dụ bể 50 lít cần khoảng 2.000 lumen.
> 1. Đo chiều dài, rộng, cao lòng bể để ra số lít (dài x rộng x cao chia 1.000).
> 2. Nhân số lít với 40 để biết cần bao nhiêu lumen.
> 3. Đọc lumen in trên hộp từng đèn, cộng lại và chọn tổng gần con số đó; số bóng là số đèn bạn cần để đạt tổng ấy.
> 4. Bể mới set thì bật đèn 6 tiếng mỗi ngày trước, sau đó tăng dần lên 8 tiếng, không quá 10 tiếng.
> Về vi…

**Plain** (1199 characters):

> Để tư vấn chính xác, bạn cho mình biết **kích thước bể** (dài x rộng x cao, hoặc số lít), **loại cây và cá** định nuôi, và có dùng **CO2** hay không. Trong lúc chờ, mình gợi ý chung như sau.
> 
> **Về sạn mặt tiền**
> - Thường nên để **phần trước thấp, phần sau cao dần** (dốc về phía sau). Cách này tạo chiều sâu và dễ nhìn cá từ phía trước.
> - Ở mặt tiền nên dùng **sạn mịn hoặc cát** để dễ vệ sinh, tránh rác và thức ăn thừa mắc kẹt.
> - Nếu nuôi cá đáy như cory, cá nhỏ thì nên dùng cát hoặc sạn rất mịn để chúng không bị trầy mang khi tìm thức ăn.
> - Nếu bể có nền đất (aqua soil) thì nên phủ lớp sạn hoặ…

### setup-07 · post · not judged

**Asked:** Cửa sổ nhà em bị bít nên em tháo ra, được một hõm sâu 20cm, cao 90cm, dài 100cm, em định làm bể cá âm vào đó kiểu bán cạn: hồ kính dài 90cm (chừa 10cm bố trí lọc), sâu 20cm, cao 50cm (mực nước 40cm), đèn 90cm treo phía trên. Thả 1 cục lũa cao hơn mặt nước, xếp ít đá xung quanh, phía sau trải nền trồng cây dễ sống, phía trước trải cát, trồng thêm ít cây vượt mặt nước như dương xỉ, cỏ đồng tiền, khoai lang. Cá nuôi tầm 10 con bảy màu, ít con bống dọn bể. Lọc em định dùng 1 lọc thác 8W và 1 lọc vi sinh (chạy bằng bơm oxy) với vật liệu lọc là sứ vì nuôi ít cá. Các cụ góp ý giúp em.

**Ours** (read 4 pages, stopped at the error limit):

failed: Request timed out.

**Plain** (3912 characters):

> Ý tưởng bể bán cạn trong hốc tường rất hay, vì tiết kiệm diện tích và tạo được mảng xanh đẹp. Em có vài điểm cần chỉnh để bể vận hành ổn định.
> 
> ## 1. Vấn đề lớn nhất: đèn đang quá cao
> 
> Bể cao 50cm, nước 40cm, nên mặt nước cách đỉnh hốc (90cm) khoảng 50cm. Nếu treo đèn sát trần hốc thì đèn cách mặt nước gần 50cm, ánh sáng xuống rất yếu. Cây thủy sinh ở nền sẽ vươn lên, cây vượt mặt nước cũng không đủ sáng để phát triển.
> 
> - Nên đặt đèn sát phía trên thành bể, khoảng 55–60cm tính từ đáy, để cách mặt nước khoảng 15–20cm.
> - Cây vượt mặt nước cần thêm không gian phía trên, nên chừa ít nhất 20–30cm …

### setup-07 · tank · ours wins (7.5 · 2.5)

**Asked:** Kế hoạch lọc, cây và cá cho bể tôi định làm như vậy có ổn không?

**Judge:** X dùng đúng chi tiết bể của bạn (cỡ khoảng 72 lít, bể trong hốc cửa sổ dễ lên rêu, lọc thác 8W kèm lọc vi sinh, 10 bảy màu) và đưa ra các bước cụ thể, có số giờ đèn và tỉ lệ thay nước, tuy chưa nhắc chuyện nắng Việt Nam làm nước nóng lên. Y không đọc được thông tin bể nên chủ yếu hỏi lại, kèm vài quy tắc chung chung. / Y dùng đúng thông số bể của bạn (khoảng 70 lít, 10 bảy màu, lọc thác 8W kèm lọc vi sinh) và chỉ ra rủi ro chính là nắng từ cửa sổ làm lên rêu. Y đưa giờ đèn, tỷ lệ thay nước và nói rõ cần theo dõi gì. X không đọc được dữ liệu bể nên chỉ hỏi lại và đưa lời khuyên chung chung.

**Ours lacks:** local. **Plain lacks:** asks-only, tank-fit, plan.

**Ours** (read 0 pages, stopped at the tools limit):

> Nhìn chung kế hoạch của bạn khá ổn cho bể 90 x 20 x 50 cm, mực nước 40 cm (khoảng 70 lít): 10 cá bảy màu cùng cây dễ sống, dương xỉ, cỏ đồng tiền và khoai lang là bộ đôi dễ nuôi. Điểm cần chú ý nhất là bể đặt trong hốc cửa sổ, nên nắng chiếu vào sẽ dễ sinh rêu hại. Mình chưa kiểm tra được con bống dọn bể bạn nuôi trong cẩm nang, nên chưa chắc nó hợp với bể này.
> 1. Đặt bể tránh nắng trực tiếp, hoặc che kính và lưới phía cửa sổ, rồi bật đèn 90 cm khoảng 6 đến 8 giờ mỗi ngày bằng hẹn giờ.
> 2. Lọc thác 8W cộng lọc vi sinh chạy bơm oxy là đủ cho 10 cá bảy màu trong bể cỡ này; giữ lọc vi sinh luôn c…

**Plain** (1244 characters):

> Mình sẵn lòng xem giúp, nhưng bạn chưa gửi chi tiết kế hoạch. Bạn có thể cho mình biết:
> 
> 1. **Kích thước bể** (dài × rộng × cao, và dung tích tính bằng lít).
> 2. **Lọc:** loại lọc (lọc thác, lọc hộp, lọc trong, lọc đáy...), công suất ghi trên máy, và có sục khí không.
> 3. **Cây:** loại cây định trồng, có dùng đèn và CO₂ không, nền đất hay sỏi.
> 4. **Cá:** loài, số lượng, kích thước trưởng thành, tính cách (hiền, hung dữ, hay đàn).
> 5. **Nhiệt độ và pH** mà các loài cá cần, nếu bạn đã chọn.
> 
> Trong lúc chờ, mình có thể nêu vài điểm thường được kiểm tra:
> 
> - **Lọc:** nên chọn lọc có lưu lượng ít nhất…

### setup-08 · post · ours wins (7 · 6)

**Asked:** Mình đang có bể dán 60x45x45, kính 5 ly. Bể vậy có mỏng quá không? Tư vấn giúp mình độ dày nền, các phụ kiện cần có và nên nuôi loại cá nào để có bể thủy sinh hợp lý. Kinh phí mình cũng không được nhiều lắm.

**Judge:** X is short and in order. It works out the 13–14 litres of aquasoil from the tank's own size, says plainly that 5 mm glass is the minimum and points to the guide's section on bottom glass. Y fits Vietnam better (heater note for the South, dechlorinator), but it is padded, pairs a male betta with guppies, and its filter flow is weak for a planted tank. / Y is more concise and gives clear, ordered steps. It works out the aquasoil volume correctly (about 13.5 L), suggests a cheaper base layer under the aquasoil, sets an 8-hour light period, and suggests 6mm glass if the hardscape is heavy. X contains incompatible stocking advice (betta with guppies and shrimp), and its wording is longer and less like how Vietnamese hobbyists talk.

**Ours lacks:** local, figures. **Plain lacks:** too-long, tank-fit, local.

**Ours** (read 4 pages, stopped at the tools limit):

> Bể 60x45x45 (khoảng 120 lít) dùng kính 5 ly là mức tối thiểu, chưa phải mỏng quá. Bể dán thủy sinh thường chịu được với kính này nếu bể đặt trên chân chắc, đều và không bị va đập. Nếu bạn định trồng nhiều, đặt nền dày hoặc đá lũa nặng, nên cân nhắc kính 6 ly hoặc chân bể chắc hơn. Trong cẩm nang, phần chọn kính và chân bể cho bể từ 60 cm trở lên nói rõ là chân bể rất quan trọng.
> 1. Chân bể: chọn chân hoặc kệ chịu được ít nhất 150 kg, mặt đặt phẳng tuyệt đối, dùng ke thăng bằng trước khi đổ nước.
> 2. Nền: lót khoảng 5 cm phân nền (aquasoil), tức chiều dài x chiều rộng x 5 cm, khoảng 13–14 lít, …

**Plain** (2849 characters):

> # Tư vấn bể thủy sinh 60x45x45 kính 5 ly
> 
> ## 1. Kính 5 ly có mỏng không?
> 
> Bể khoảng **120 lít**, kính 5 ly là **mức chấp nhận được** cho kích thước này, nhiều cửa hàng cũng dùng phổ biến. Nhưng nó không dư an toàn, nên lưu ý:
> 
> - **Keo silicon** quyết định độ bền nhiều hơn độ dày kính. Chọn silicon chuyên bể cá, trung tính, không dùng keo xây dựng thông thường.
> - **Nền phải phẳng, cứng, đều** (nên dùng đế gỗ hoặc khung inox/sắt chịu lực). Tổng khối lượng khi đầy nước khoảng 170-200 kg, không đặt trên kệ mỏng hay tủ yếu.
> - **Không để bể nằm lệch** hoặc chịu va đập, rung lắc mạnh.
> - **Kiểm tra**…

### setup-08 · tank · plain wins (4.5 · 6)

**Asked:** Tôi có sẵn bể, cần mua gì và nuôi cá gì để làm bể thủy sinh tiết kiệm?

**Judge:** Cả hai đều không dùng kích thước 60×45×45 của bể, khoảng 120 lít. Y cho danh sách mua sắm đầy đủ, có ước tính chi phí bằng tiền Việt, có quy trình chạy bể và lịch thay nước, dù nhầm cá khoang cổ là cá nước ngọt. X mỏng, chung chung và khuyên cho cá ăn quá thưa. / X cho danh sách đồ cần mua, cây, cá, cách chạy chu trình nitơ, lịch thay nước và chi phí đầy đủ hơn, dù nhầm cá khoang cổ là cá nước ngọt. Không bản nào để ý bể khoảng 120 lít mà kính chỉ 5 ly. Y dùng từ dân chơi Việt quen thuộc hơn nhưng mỏng, thiếu chu trình nitơ và thay nước, và khuyên cho ăn quá thưa.

**Ours lacks:** tank-fit, too-thin, figures, plan. **Plain lacks:** tank-fit.

**Ours** (read 4 pages, stopped at the tools limit):

> Muốn làm bể thủy sinh tiết kiệm thì bạn nên đầu tư đúng vài thứ quan trọng và chọn cây, cá dễ nuôi, còn lại tận dụng đồ sẵn có. Cẩm nang khuyên đừng mua bể quá to rồi thiết bị lại thiếu: cây sẽ yếu dần và bể nhanh chán. Mình chưa biết kích thước bể của bạn, nên các gợi ý dưới đây là chung.
> 1. Kiểm tra bể trước: đo dài, rộng, cao, vì cỡ bể quyết định số đèn, lọc và số cá bạn nuôi được.
> 2. Mua đèn LED khoảng 6000 K có chuẩn chống nước; bể trồng cây dễ thì một bóng là đủ, muốn trải thảm thì cần hai bóng. Đây là thứ không nên tiết kiệm.
> 3. Mua một bơm lọc có núm chỉnh lưu lượng, công suất đủ để n…

**Plain** (3086 characters):

> Với bể sẵn có, bạn chỉ cần mua khoảng 5-6 món chính. Các mức giá dưới đây chỉ là ước lượng, khác nhau tùy nơi bạn mua.
> 
> ## 1. Thiết bị cần mua
> 
> - **Nền:** sỏi hoặc cát sông rửa sạch, rẻ hơn nền dinh dưỡng nhiều. Nếu muốn trồng cây khỏe hơn, bạn có thể mua viên bón nền (root tabs) để nhét dưới gốc cây.
> - **Đèn LED:** chọn đèn full phổ, công suất vừa đủ cho bể. Bể 40-60cm thường đủ với đèn khoảng 150-300k. Mỗi ngày bật 6-8 tiếng.
> - **Lọc:** lọc bọt biển (sponge filter) hoặc lọc treo thành bể loại nhỏ. Hai loại này rẻ, dễ bảo trì, và an toàn cho cá con lẫn tôm.
> - **Sưởi (nếu cần):** chỉ cần nếu …

### setup-09 · post · plain wins (4.5 · 7.5)

**Asked:** Em có cái hộc giá sách, định làm bể dài 170x30x35, mặt trước kính siêu trong để vào đó. Layout đơn giản: nền cát và cuội hoặc đá, thêm ít lũa và ráy; cá thì loại size nhỏ dễ nuôi, ít tốn công chăm và ít thay nước. Em định dùng lọc thùng, với size bể này có phù hợp không? Em định dặn bên làm bể chừa lỗ chờ cho lọc ở 2 đầu bể.

**Judge:** Y lưu ý rằng đặt lỗ ở 2 đầu bể sẽ sát vách hộc, không còn chỗ lắp khớp nối, và đề xuất chuyển lỗ ra kính sau. Y cũng nói đúng vị trí lỗ hút/lỗ đẩy, cỡ lỗ, việc phải khoan trước khi dán, cùng các lưu ý về tải trọng và thông gió. X ngắn và có hướng dẫn tự mâu thuẫn về vị trí lỗ. X còn ghi sai cỡ lỗ khoan. / X answers the actual question about holes at the two ends of the tank. It points out that the end panels sit against the wood and suggests moving the holes to the back glass. It also gives sensible bulkhead hole sizes and says to drill before gluing. Y gives the wrong hole diameter, places the holes in a contradictory way, and is vaguer overall.

**Ours lacks:** tank-fit, wrong, too-thin. **Plain lacks:** too-long, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể 170x30x35 cm chứa khoảng 178 lít, sau khi trừ nền và lũa còn khoảng 160 lít. Lọc thùng hợp với bể này vì cẩm nang nói lọc thùng mạnh hay yếu chủ yếu nằm ở lượng vật liệu lọc chứa được, và loại này khá êm, ít chiếm chỗ trong bể. Bể nông và dài nên bạn cần chọn loại đủ lưu lượng và đủ chỗ chứa vật liệu.
> 1. Chọn lọc thùng cho khoảng 150 đến 200 lít, lưu lượng khoảng 700 đến 1000 lít mỗi giờ, tức khoảng 4 đến 6 lần lưu thông mỗi giờ. Ưu tiên mẫu có khay chứa nhiều vật liệu sinh học.
> 2. Hỏi bên làm bể khoan 2 lỗ ở vách sau hoặc ở đáy gần một đầu, đường kính khớp với ống lọc (thường 12 đến 16 mm…

**Plain** (2981 characters):

> ## Kết luận nhanh
> 
> Bể 170×30×35 cm rất hợp với lọc thùng. Bể này tương đương khoảng **178 lít** (chưa trừ nền, đá, lũa), thực nước còn khoảng **150-160 lít**. Với cá nhỏ, lọc thùng cỡ **800-1200 L/h** là phù hợp, và cái này cũng dễ chọn.
> 
> ## Chọn lọc thùng
> 
> - **Lưu lượng:** Với bể cá nhỏ, nên lọc lưu lượng khoảng 5-8 lần thể tích mỗi giờ, tức khoảng 800-1200 L/h. Nên chọn loại có van chỉnh dòng để tránh dòng quá mạnh làm cá mệt, nhất là khi có cá tép hoặc cá nhỏ.
> - **Lưu ý chiều cao đẩy (head):** Lưu lượng ghi trên hộp thường đo ở độ cao rất thấp. Thực tế khi lọc đặt dưới hộc, ống đẩy lên mặt…

### setup-09 · tank · ours wins (6 · 4.25)

**Asked:** Bể tôi định làm dùng lọc thùng có hợp không, và nuôi cá gì cho ít phải chăm?

**Judge:** Cả hai đều không dùng số đo bể 170×30×35 (~178 lít), cũng không nói đến hộc giá sách hay lỗ lọc ở 2 đầu. X vẫn gần hơn: ví dụ bể ~150 lít của X sát với thể tích thật, X khuyên lắp gấp đôi lọc để ít phải thay nước, gợi ý cây buộc đá (hợp với ráy) và cho số lít/con. Y là danh sách chung chung và còn bảo thay nước hằng tuần. / Không bên nào dùng kích thước bể 170×30×35 (~178 L). Tuy vậy, Y đưa ví dụ bể ~150 L gần đúng cỡ này, gợi ý lắp hai lọc thùng (hợp với ý chừa lỗ lọc ở 2 đầu bể) và cây buộc đá (hợp với ráy), lại có các bước lắp đặt và vệ sinh theo thứ tự. X thì chung chung, ghi nhầm ốc táo là ốc nhồi và khuyên thay nước hằng tuần, trái với ý người hỏi.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, plan, follow-up.

**Ours** (read 3 pages, stopped at the calls limit):

> Lọc thùng hợp với bể bạn định làm, nhất là khi bạn muốn ít phải chăm. Theo cẩm nang, lọc thùng là một trong những loại lọc mạnh và êm nhất, và độ mạnh nằm ở lượng vật liệu lọc chứa được chứ không chỉ ở lưu lượng. Đổi lại, nó khó bảo trì hơn lọc treo: vệ sinh thường phải tháo cả hệ thống, dễ đổ nước ra sàn, và vật liệu nằm trong hộp kín nên khi mất điện vi khuẩn có lợi dễ chết hơn. Bạn chưa cho biết kích thước bể, nên mình chưa tính được công suất cụ thể; với bể cỡ 90 x 45 cm, khoảng hơn 150 lít, cẩm nang gợi ý dùng ít nhất một lọc thùng cỡ 1300 lít/giờ, và nếu muốn ít phải thay nước và ít chă…

**Plain** (1728 characters):

> ## Lọc thùng có hợp không?
> 
> **Hợp nếu:**
> - Bể từ khoảng 60 lít trở lên, hoặc bể trồng cây, bể đông cá.
> - Bạn muốn lọc mạnh, lượng vật liệu lọc nhiều, ít phải vệ sinh thường xuyên hơn lọc treo.
> - Bạn muốn thiết bị giấu trong tủ, ít tiếng ồn, không làm vướng khung bể.
> 
> **Cần lưu ý:**
> - Giá thành cao hơn lọc treo hoặc lọc hộp.
> - Cần chọn lưu lượng phù hợp. Thường nên chọn công suất lọc đạt khoảng 4–6 lần thể tích bể mỗi giờ. Nếu lọc quá mạnh, cá nhỏ hoặc cá betta sẽ bị dòng nước xô đẩy.
> - Phải mồi nước (prime) khi khởi động, và có thể rò rỉ nếu siết ống không chặt. Nên kiểm tra định kỳ.
> - Với bể…

### cycling-01 · post · ours wins (6.5 · 5)

**Asked:** Bể em dài 90cm rộng 40, đã mua bình CO2 + trộn cánh quạt, lọc thùng DF1300, đèn Odyssea, nền 10kg loại nhiều chất, trồng trân châu ngọc trai, sao nhỏ và một đống cây cắm lưa thưa. Tuần đầu em lật ra lật vào 3 lần, mất một đống cây vì nhổ ra bị úa, nền mua thiếu thấy mỏng lại hút nước ra cho thêm. Hiện ngày nào em cũng thay 50% nước. Bể đang ổn định được 3 ngày, em định 1 tuần thì thả cá nhỏ như neon, 7 màu. Vậy đã thả được chưa, và nên mua sục oxy loại nào?

**Judge:** Y chi tiết hơn: có lưu ý đá sủi làm thoát CO2 và gợi ý máy sục bán ở VN như Resun, Sunsun, Hailea. Nhưng Y khuyên dùng nước rửa bát làm nguồn amoniac, vừa sai vừa có hại, và còn bị dài dòng. X ngắn gọn, an toàn và đủ các bước để làm theo. / Hai bên đều trả lời đúng là chưa thả cá được và nên ngừng thay nước hằng ngày. X dài hơn lại có lỗi nguy hiểm: khuyên dùng nước rửa bát làm nguồn amoniac. Y gọn, các bước đúng và làm theo được ngay, chỉ thiếu lưu ý sục khí làm mất CO2.

**Ours lacks:** figures, tank-fit, diagnosis. **Plain lacks:** unsafe, too-long, wrong.

**Ours** (read 3 pages, stopped at the time limit):

> Chưa thả được. Bể mới 3 ngày chưa qua chu trình nitơ, nền đất mới còn nhả amoniac, và thay 50% mỗi ngày làm mất vi khuẩn có lợi nên bể chưa ổn định. Cẩm nang nói cá neon không hợp bể mới, chỉ nên thả khi bể đã chạy xong chu trình.
> 1. Ngừng thay nước hằng ngày, chỉ thay khoảng 20-30% mỗi tuần khi cần.
> 2. Cứ 2-3 ngày test amoniac và nitrit; khi cả hai đều bằng 0 và đã có nitrat thì bể đã chạy xong.
> 3. Tạm dừng lật nền để cây ổn định rễ.
> 4. Khi đạt chỉ số trên, thả neon theo đàn 6 con trở lên.
> Sục oxy: lọc DF1300 đã tạo dòng chảy và oxy bề mặt, nên chưa bắt buộc. Nếu muốn thêm, chọn máy bơm khí …

**Plain** (2622 characters):

> **Chưa nên thả cá neon lúc này.** Bể mới chạy 3 ngày, nên "ổn định" chưa có nghĩa là đã an toàn cho cá.
> 
> ## Vì sao chưa nên thả
> 
> - **Chu trình nitơ chưa hình thành.** Vi khuẩn có lợi cần khoảng 3-6 tuần để phát triển đủ để xử lý amoniac từ cá và phân hủy. Bể mới chưa có đủ số lượng này.
> - **Nền mới đang nhả amoniac.** Loại nền nhiều chất dinh dưỡng thường nhả NH₃/NH₄⁺ trong vài tuần đầu. Cộng thêm việc cây đang úa và rã, lượng amoniac có thể đang khá cao.
> - **Thay 50% nước mỗi ngày là vấn đề lớn nhất.** Việc này liên tục rửa trôi vi khuẩn có lợi, làm chu trình nitơ không bao giờ hình thành, đ…

### cycling-01 · tank · ours wins (6 · 4)

**Asked:** Bể thủy sinh mới set được ít ngày, khi nào thì thả neon và bảy màu được?

**Judge:** X nói đúng bảy màu là guppy, dùng thẻ loài để đưa ra thông số nước có căn cứ và cảnh báo hai loài cần nước khác nhau. Tuy vậy cả hai câu trả lời đều bỏ qua chi tiết bể: nền nhiều dưỡng, đã chạy được 1,5 tuần, đang thay nước mỗi ngày. Y nhầm bảy màu với cá cầu vồng và bảo không thay nước nhiều, trong khi bể nền dưỡng lại cần thay nhiều. / Tôi chọn Y. Y đưa ra các bước theo thứ tự, thông số loài chính xác và có lưu ý về việc neon và bảy màu cần nước khác nhau. X gọi nhầm bảy màu là rainbowfish và khuyên ngừng thay nước, điều này sai với bể nền nhiều dưỡng. Cả hai đều không dùng chi tiết bể của người hỏi: nền nhiều dưỡng, thay 50% nước mỗi ngày và bể đã chạy 1,5 tuần.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, wrong.

**Ours** (read 3 pages, stopped at the tools limit):

> Bể mới set vài ngày thì chưa nên thả neon hay bảy màu, vì nước chưa ổn định: vi khuẩn có lợi trong lọc chưa đủ để phân hủy amoniac và nitrit mà cá thải ra. Cẩm nang nói rõ cá neon không hợp với bể mới, vì chúng không chịu được những biến động của giai đoạn khởi động, nên chỉ thả khi bể đã trưởng thành và thông số nước ổn định.
> 1. Bây giờ bạn chỉ cần châm nước, bật lọc và sưởi nếu cần, rồi chờ chạy chu trình nitơ. Nếu chưa có, mua bộ test amoniac và nitrit.
> 2. Mỗi vài ngày test một lần. Khi amoniac và nitrit đều về 0 và đã có nitrat, bể đã chạy xong chu trình. Thường mất khoảng 4 đến 6 tuần, t…

**Plain** (1486 characters):

> Bể mới set chưa nên thả cá ngay. Thường phải chờ **khoảng 3–6 tuần** để bể "chạy chu trình nitơ" (cycle), tức là vi khuẩn có lợi đã đủ để phân hủy amoniac và nitrit do cá thải ra.
> 
> **Cách biết bể đã sẵn sàng:**
> - Dùng bộ test nước (API hoặc tương đương) kiểm tra:
>   - **Amoniac (NH₃/NH₄⁺)**: 0 ppm
>   - **Nitrit (NO₂⁻)**: 0 ppm
>   - **Nitrat (NO₃⁻)**: có đo được, thường 5–40 ppm tùy bể
> - Nếu amoniac và nitrit đều về 0 trong vài ngày liên tiếp sau khi đã bón amoniac hoặc thức ăn để nuôi vi khuẩn, bể đã sẵn sàng.
> 
> **Mẹo để chạy bể nhanh hơn:**
> - Dùng vi sinh khởi động (bio-starter) hoặc lấy một ít …

### cycling-02 · post · plain wins (4.5 · 7)

**Asked:** Em mới nhập môn, mua bể đúc 50cm + đèn 3 màu + lọc thác. Hai bố con mua 7 đôi cá: 5 đôi neon xanh đỏ + 2 đôi cá vàng nhỏ xíu. Sau 2 ngày cá lăn ra chết, chỉ còn 3 con cá vàng nhỏ. Vì sao vậy, và nên mua loại cá nào sống dai, sống khỏe cho con chăm?

**Judge:** X chẩn đoán đúng và gọn nhưng bỏ hẳn câu hỏi thứ hai, tức nên mua cá gì cho con chăm. Y trả lời đủ cả hai câu: có danh sách cá khỏe, cách tắm cá trước khi thả và việc cần làm ngay. Đổi lại, Y gọi sai vài tên cá theo cách gọi ở Việt Nam và hơi dài. / X tìm đúng nguyên nhân là bể mới chưa chạy vi sinh, cũng nhắc chuyện thả cá sai cách và chưa khử clo, rồi trả lời đúng câu hỏi nên nuôi cá gì kèm quy trình rõ ràng. Có vài chỗ gọi sai tên cá và lời khuyên dùng sưởi không hợp Việt Nam. Y đúng về nguyên nhân nhưng quá ngắn, bỏ qua phần chọn cá dễ nuôi cho bé.

**Ours lacks:** too-thin, tank-fit, off-topic. **Plain lacks:** too-long, local.

**Ours** (read 3 pages, stopped at the time limit):

> Nguyên nhân có khả năng cao nhất là bể mới chưa chạy chu trình nitơ, nên amoniac và nitrit tích tụ và làm cá chết trong vài ngày đầu. Bể 50 cm cũng quá nhỏ cho 14 con, và cẩm nang ghi cá neon không hợp với bể mới.
> 1. Thay ngay khoảng 30% nước bằng nước đã khử clo, và nếu có bộ test thì kiểm tra amoniac, nitrit.
> 2. Chưa thả thêm cá. Để bể chạy chu trình nitơ trước, thường khoảng 4 đến 6 tuần.
> 3. Cá vàng cần bể ít nhất 80 lít, nên 3 con còn lại nên chuyển sang bể lớn hơn hoặc trả cửa hàng.
> 4. Sau khi bể ổn định, nuôi cá neon thành đàn từ 6 con trở lên trong bể 60 cm trở lên.
> Cần theo dõi: nếu c…

**Plain** (3164 characters):

> Chúc mừng hai bố con đã bắt đầu chơi cá! Chuyện cá chết hàng loạt sau vài ngày rất phổ biến với người mới, và nguyên nhân thường nằm ở vài điểm sau.
> 
> ## Vì sao cá chết?
> 
> **1. Bể mới chưa "chín" (hội chứng bể mới).** Đây là nguyên nhân chính. Bể mới chưa có vi khuẩn có lợi để phân hủy amoniac và nitrit do cá thải ra. Amoniac và nitrit tăng vọt trong vài ngày đầu và giết cá, đặc biệt là cá nhỏ, cá nhạy cảm như neon. Bể cần khoảng 3–6 tuần để ổn định sinh học.
> 
> **2. Thả quá nhiều cá cùng lúc.** 14 con trong bể 50cm mới chạy là quá tải. Lượng chất thải vượt xa khả năng xử lý của bể.
> 
> **3. Hai loạ…

### cycling-02 · tank · ours wins (6.75 · 5)

**Asked:** Tôi vừa mua bể và thả cá, mới 2 ngày cá đã chết gần hết, vì sao?

**Judge:** X gives the right likely cause, an uncycled tank where ammonia and nitrite built up, followed by short, ordered first steps. Y covers the same ground but is padded, recommends dish soap for cycling, and asks for details the app already has. Neither answer notices that neon tetras and goldfish need different water temperatures, which fits the fact that only goldfish survived. / Cả hai đều đoán đúng nguyên nhân là bể mới chưa chạy chu trình nitơ, nhưng không câu nào dùng thông tin bể của bạn: cá vàng nuôi chung với neon, bể đúc mới chưa rửa kỹ, 3 con cá vàng còn sống. Y có các bước theo thứ tự rõ ràng và dặn theo dõi amoniac, nitrit mỗi ngày. X dài, cuối bài còn hỏi lại những điều app đã có, và khuyên dùng nước rửa chén làm nguồn amoniac, điều này có hại cho cá.

**Ours lacks:** tank-fit, figures. **Plain lacks:** tank-fit, too-long, asks-only.

**Ours** (read 4 pages, stopped at the time limit):

> Nguyên nhân khả dĩ nhất là bể mới chưa chạy xong chu trình nitơ, nên amoniac và nitrit từ cá thải ra tích tụ và giết cá trong vài ngày đầu. Clo trong nước máy hoặc chênh nhiệt độ khi thả cá cũng có thể góp phần.
> 1. Thử ngay amoniac và nitrit bằng bộ test nhỏ; nếu cả hai đều cao thì đây là nguyên nhân chính.
> 2. Thay khoảng 30–50% nước bằng nước đã khử clo, nhiệt độ gần bằng bể.
> 3. Ngừng cho ăn, không thả thêm cá, và giữ sục khí mạnh.
> 4. Chuyển cá còn sống sang một xô nước sạch, cùng nhiệt độ, nếu bể vẫn xấu.
> 5. Với bể sau này, chạy lọc vài tuần trước khi thả cá.
> Cần theo dõi amoniac và nitrit …

**Plain** (2241 characters):

> Cá chết nhanh sau 2 ngày thường do **hội chứng bể mới (new tank syndrome)**, tức là nước chưa có vi khuẩn có lợi để phân hủy chất thải. Các nguyên nhân hay gặp nhất:
> 
> **1. Chưa chu trình nitơ (nguyên nhân phổ biến nhất)**
> - Cá thải ra amoniac (NH₃/NH₄⁺), rất độc. Bể mới chưa có vi khuẩn để chuyển amoniac thành nitrit rồi thành nitrat, nên amoniac và nitrit tăng vọt trong vài ngày.
> - Cá bị ngộ độc, mang sưng hoặc đỏ, bơi lờ đờ, nổi đầu lên mặt nước, há miệng thở gấp.
> 
> **2. Nước máy chứa clo hoặc cloramin**
> - Nếu chưa khử clo, cá bị bỏng mang và chết rất nhanh. Cloramin khó bay hơi hơn clo nên …

### cycling-03 · post · tie or split (6 · 5.5)

**Asked:** Em mới chơi lần đầu, nghe người bán cá chỉ và hơi hấp tấp nên trong một tuần em set nền full trân châu ngọc trai lùn, trồng cây xếp cảnh. Sau đó em thả 2 ngàn đồng cá trâm, 5 con tép RC, 1 tỳ bà baby, chục con bảy màu. Đổ nước vào được một tuần thì rêu hại tràn lan, loại rêu trắng trắng làm thối rữa trân châu và lan rất nhanh. Bảy màu chết 7 con, cá trâm chết gần nửa đàn, tép trốn biệt vài ngày mới thấy ló mặt. Cây đang chết dần chết mòn, em đã thay nước, vớt bớt rêu, thả tép mồi số lượng lớn mà bất lực. Em đang định bỏ hồ này set lại theo kiểu nền đá đen, tường full rêu, mấy cây lá to dày, nuôi đội vệ sinh tỳ bà bướm, chuột panda, tép RC, cá trâm. Nên làm sao?

**Judge:** Both say the cause is an uncycled tank. Y gives a fuller rescue-then-rebuild plan with timings: 4-8 weeks to cycle, move fish to a bucket, the order to add fish. But it's padded and has errors. X is shorter and closer to their tank, but it's thin, cites the guide for a claim it doesn't make, and neither answer addresses the hillstream loach's need for cool water in Vietnam's heat. / Y đoán đúng nguyên nhân chính là hồ chưa chạy chu trình nitơ. Y đưa các bước ngắn gọn theo thứ tự và chỉnh lại kế hoạch set mới dựa trên thẻ cá trâm và chuyện chuột panda cần nền cát. X dài, chung chung, còn hiểu nhầm trân châu là hạt nền. Cả hai đều không gọi đúng tên thứ "rêu trắng" (thật ra là nấm/màng vi khuẩn).

**Ours lacks:** plan, figures, too-thin, diagnosis. **Plain lacks:** too-long, tank-fit, local, diagnosis.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình đoán nguyên nhân chính là hồ chưa ổn định sinh học: nền trân châu và cây vừa set xong, thả cá ngay sau một tuần nên amoniac và chất hữu cơ từ cây chết, thức ăn thừa tích tụ, làm nước dơ và rêu bùng lên. Bảy màu nhạy amoniac nên chết trước, cá trâm và tép yếu hơn cũng bị ảnh hưởng. Mức chắc chắn là khá, nhưng bạn nên tự test để xác nhận.
> 1. Ngưng cho ăn vài ngày, vớt hết lá cây đã thối và rác dưới đáy, không hút cả lớp nền.
> 2. Test amoniac và nitrit bằng bộ test. Nếu có số đo, thay khoảng 30-50% nước mỗi ngày bằng nước đã khử clo, giữ nhiệt độ gần bằng bể.
> 3. Chỉnh đèn còn khoảng 6-8 tiến…

**Plain** (3988 characters):

> Hồ của bạn đang bị **hội chứng hồ mới chưa chu kỳ nitơ** (cycling), đây là lỗi rất phổ biến khi mới chơi. Lỗi này gây ra cá chết, rêu bùng phát và cây chết. Set lại nền là hợp lý, nhưng cần xử lý hồ hiện tại trước và làm lại theo thứ tự đúng.
> 
> ## 1. Cứu hồ hiện tại (làm ngay)
> 
> **Kiểm tra nước.** Mua bộ test nước (API hoặc test strip) và đo:
> - **Amoniac (NH3/NH4)** và **Nitrit (NO2)**: nếu có dấu hiệu tăng, đây là thủ phạm chính gây cá chết. Mục tiêu là về 0.
> - **Nitrat (NO3)**: nên dưới 20-40 ppm.
> - **pH, nhiệt độ**: giữ ổn định, tránh dao động lớn trong ngày.
> 
> **Xử lý cấp tốc:**
> - **Ngừng ch…

### cycling-03 · tank · tie or split (6 · 5.25)

**Asked:** Bể mới set một tuần thì rêu trắng lan và cá chết gần nửa, có nên lật bể làm lại không?

**Judge:** Both answers say not to restart the tank yet, blame ammonia and nitrite from a tank that hasn't finished cycling, and give the same core steps. Neither notices the shrimp or the fish they listed, and both misread the white fuzz. X tells them when the cycle is done and what to watch; Y says more clearly when a restart is worth it and suggests bottled bacteria, but ends by asking for details their app already holds. / Cả hai đều nhận ra đúng gốc rễ là bể chưa chạy xong chu trình nitơ, và đều không dùng thông tin bể của họ: không bảo vớt chỗ trân châu đang thối, không nhắc rằng thả thêm tép mồi làm tải sinh học tăng lên. Y tốt hơn vì có thứ tự xử lý rõ, có dấu hiệu nhận biết chu trình đã xong, có lịch theo dõi và nhắc kiểm tra nhiệt độ cho trời nóng. X thì gọi sai rêu trắng là tảo silic và kết thúc bằng hỏi lại.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, diagnosis, follow-up, wrong.

**Ours** (read 4 pages, stopped at the calls limit):

> Mình khuyên bạn chưa nên lật bể. Bể mới chạy một tuần, cá chết gần nửa và nước trắng lan thường là do amoniac và nitrit tăng cao khi chu trình nitơ chưa kịp hình thành, cộng với việc bể mới hay bùng vi sinh. Chu trình thường mất vài tuần đến vài tháng, nên lật bể bây giờ chỉ làm mất thêm thời gian và đưa thêm sốc cho cá còn lại. Điều cần làm là đo ngay để biết nguyên nhân.
> 1. Đo amoniac và nitrit bằng que thử ngay hôm nay. Nếu amoniac hoặc nitrit trên 0,2 ppm thì đó là thủ phạm chính.
> 2. Vớt cá chết ra ngay, vì xác cá phân hủy làm amoniac tăng thêm.
> 3. Ngừng cho ăn hoàn toàn trong 1 đến 2 ngà…

**Plain** (1618 characters):

> Thường **chưa cần lật bể ngay**. Bể mới một tuần chết nửa đàn thường do nước chưa ổn định chu trình đạm (ammonia/nitrite cao), chứ chưa chắc bể hỏng hẳn. Bạn nên xử lý theo các bước sau trước.
> 
> **Xử lý ngay:**
> 1. **Test nước** (ammonia/NH3, nitrite/NO2, nitrate, pH). Nếu ammonia hoặc nitrite trên 0 là đang độc cho cá.
> 2. **Thay 30–50% nước** bằng nước đã khử clo, cùng nhiệt độ với bể. Làm nhẹ nhàng, đừng thay quá nhiều một lúc.
> 3. **Ngừng cho ăn** 1–2 ngày. Thức ăn thừa phân hủy là nguồn ammonia chính.
> 4. **Vớt cá chết** ngay, vì xác phân hủy làm nước xấu thêm.
> 5. **Tăng sục khí**, và có thể …

### cycling-04 · post · plain wins (7 · 7.75)

**Asked:** Hồ mình 40x30x30, vừa set up được 5 ngày thì có hiện tượng cá chết, mặt hồ có bọt trắng là sao? Hồ như vậy có cần thay nước thường xuyên không, có cần sục sủi không? Mình chỉ để chạy máy lọc nước thôi.

**Judge:** Both answers correctly blame new tank syndrome. Y answers the hobbyist's water-change and aeration questions directly. It works out the tank is 36 L and suggests dechlorinator and starter bacteria (vi sinh), which are easy to buy in Vietnam. It also points out that warm water holds less oxygen. X is tight and gives a useful 0.2 ppm threshold, but it mentions a "handbook" the reader can't see and gives no routine for once the tank is stable. / Hai bài đều chẩn đoán đúng là bể chưa chạy xong chu trình nitơ và đưa ra các bước hợp lý. X hợp với người chơi Việt Nam hơn: tính ra thể tích 36 lít, nhắc châm vi sinh và dùng Prime, đều là thứ dễ mua ở đây. Y gọn và có ngưỡng đo rõ, nhưng lại nhắc tới "handbook", dùng từ tiếng Anh "cycling" và không nói tới vi sinh.

**Ours lacks:** local, tank-fit. **Plain lacks:** too-long, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Nhiều khả năng bể chưa chạy xong chu trình nitơ, nên amoniac và nitrit đang tích tụ và giết cá. Bể mới 5 ngày chưa đủ vi khuẩn có lợi để xử lý chất thải của cá. Bọt trắng trên mặt nước thường là chất hữu cơ và chất thải mới, hoặc vi khuẩn bùng phát làm nước đục, nên nó cho thấy bể còn nhiều chất bẩn chưa được phân hủy. Mình chưa thể chắc chắn chỉ từ mô tả, nên bạn cần đo nước để xác định.
> 1. Đo amoniac và nitrit ngay bằng que thử hoặc bộ thử nước, rồi lặp lại mỗi 1 đến 2 ngày.
> 2. Nếu amoniac hoặc nitrit trên 0,2 ppm, thay khoảng 30 đến 50% nước bằng nước đã khử clo, cùng nhiệt độ với bể. Làm …

**Plain** (2631 characters):

> ## Nguyên nhân có thể
> 
> Bể mới set up 5 ngày mà cá chết thường là do **chu trình nitơ chưa ổn định** (new tank syndrome):
> 
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻) tăng cao.** Vi khuẩn có lợi trong lọc cần vài tuần để hình thành. Trước đó, chất thải cá và thức ăn thừa phân hủy thành amoniac, gây độc cho cá.
> - **Bọt trắng trên mặt nước** thường do protein và chất hữu cơ dư thừa (thức ăn thừa, chất nhờn, chất thải), hoặc do nước máy chưa khử clo, hay còn dư chất tẩy rửa từ bể và dụng cụ. Bọt kéo dài đi kèm cá chết thường là dấu hiệu nước đang bẩn, có khả năng amoniac cao.
> - **Các nguyên nhân khác…

### cycling-04 · tank · tie or split (6.5 · 6.25)

**Asked:** Bể mới set 5 ngày cá chết và mặt nước có bọt trắng, là sao?

**Judge:** Cả hai đều chẩn đoán đúng là bể chưa chạy xong chu trình nitơ, cho test nước, thay nước và ngừng cho ăn. Y nhỉnh hơn vì khuyên lắp thêm sủi để tăng oxy, rất hợp với bể chỉ chạy lọc mà không có sủi. Y còn chỉ ra các dấu hiệu cá bị ngộ độc để theo dõi, nhưng dài dòng và hỏi lại những thông tin app đã có. / Cả hai đều đoán đúng nguyên nhân là bể chưa chạy xong chu trình nitơ và đưa ra các bước giống nhau. Y gọn hơn, viết đúng giọng dân chơi cá Việt, có hẹn test amoniac và nitrit mỗi ngày, và có trích cẩm nang. X thì đúng hoàn cảnh hơn ở chỗ bảo gắn thêm sủi cho bể không có sủi, nhưng lại dài dòng và hỏi lại những chi tiết đã biết.

**Ours lacks:** tank-fit, figures. **Plain lacks:** too-long, tank-fit, follow-up.

**Ours** (read 1 pages):

> Nhiều khả năng cá chết vì amoniac và nitrit chưa được xử lý. Bể mới 5 ngày thường chưa có đủ vi khuẩn có lợi, nên chất thải của cá biến thành amoniac và nitrit mà bể chưa kịp phân hủy. Bọt trắng trên mặt nước thường là chất hữu cơ hoặc protein từ thức ăn và chất thải chưa được phân huỷ, hay cặn xà phòng, bụi bẩn còn sót lại khi set bể. Cẩm nang chưa nói riêng về bọt trắng, nên phần này mình suy ra từ kinh nghiệm chung, chưa chắc chắn.
> 1. Ngay bây giờ, thử amoniac và nitrit bằng que thử. Nếu amoniac hoặc nitrit trên 0 ppm, đây là nguyên nhân chính.
> 2. Ngừng cho ăn và không thả thêm cá. Cá còn …

**Plain** (2341 characters):

> Bể mới 5 ngày mà cá đã chết thường là do **chưa đủ chu trình nitơ (cycle)**, tức là vi khuẩn có lợi chưa phát triển đủ để phân hủy chất thải.
> 
> ## Nguyên nhân thường gặp
> 
> 1. **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻) tăng cao.** Cá thải amoniac qua mang và phân. Bể mới chưa có vi khuẩn chuyển hóa chúng, nên độc tố tích tụ và giết cá. Đây là nguyên nhân phổ biến nhất. Bể thường cần 3–6 tuần để ổn định.
> 2. **Bọt trắng trên mặt nước** có thể do:
>    - Chất hữu cơ, protein, chất nhờn cá tiết ra khi stress, cá chết phân hủy, thức ăn thừa.
>    - Chất tẩy rửa hoặc xà phòng còn sót lại khi rửa bể, sỏi, decor…

### cycling-05 · post · tie or split (5.75 · 6.5)

**Asked:** Mình mới tập set một hồ biotop 845, chỉ có lũa hải sa quỳ, đá đen và đá cuội, vài cây thủy sinh không cần CO2, lọc thùng Atman, đèn rọi vàng-trắng. Giai đoạn mới châm đầy nước và chạy lọc thì nên châm loại vi sinh nào?

**Judge:** Y names the right bacteria and products and suggests seeding with filter media from an established tank, a very practical tip in Vietnam. It also covers the driftwood, the no-CO₂ plants and the Atman filter. X gets the Stability dose right, but it mixes fish-in and fishless steps in ways that contradict each other, gives a temperature that doesn't fit Vietnam, and says it doesn't know the volume of an 845 tank. / Y cho quy trình đủ hơn: liều Stability đúng theo nhãn, có cách bổ sung nguồn amoni và có phép thử 2 ppm trong 24 giờ trước khi thả cá. Bù lại, Y có ngưỡng thay nước quá chặt và mức nhiệt không hợp khí hậu Việt Nam. X sát với setup hơn (dặn ngâm lũa, xin media từ bể đang chạy ổn) nhưng thiếu nguồn amoni nên bạn khó chạy xong chu trình.

**Ours lacks:** tank-fit, local, wrong. **Plain lacks:** figures, follow-up, plan.

**Ours** (read 2 pages):

> Bạn nên châm men vi sinh nitrat hóa, loại có vi khuẩn chuyển amoni thành nitrit rồi thành nitrat, chứ không phải loại chỉ để làm trong nước. Đây là nhóm tạo chu trình nitơ cho bể mới. Cẩm nang nói rõ men không làm bể chạy xong ngay, nên bạn vẫn phải chờ và test nước. Mình chưa biết dung tích thực của bể 845, nên các liều dưới đây bạn tính lại theo số lít nước.
> 1. Khử clo cho nước máy trước, chờ 30 phút rồi mới châm men.
> 2. Chạy lọc thùng Atman và giữ nhiệt độ 24–26°C trước khi châm men.
> 3. Ngày 1, đổ men theo nhãn. Với Seachem Stability, liều là 5 mL (1 nắp) cho 40 L; từ ngày 2 đến ngày 7, mỗ…

**Plain** (1837 characters):

> Khi mới châm nước và chạy lọc, bạn nên dùng **vi sinh nitrifying (vi khuẩn nitrat hóa)**, thường chứa *Nitrosomonas* và *Nitrobacter*. Chúng chuyển amoniac (NH₃/NH₄⁺) thành nitrit (NO₂⁻) rồi thành nitrat (NO₃⁻), là nền tảng để bể ổn định. Bạn có thể tìm các dòng như Seachem Stability, Tetra SafeStart, Dr.Tim's, Nitrivec... (tên sản phẩm chỉ là ví dụ, chọn loại có sẵn ở chỗ bạn).
> 
> **Cách làm:**
> 
> 1. **Khử clo** nước trước khi châm, để tránh diệt vi khuẩn.
> 2. **Bật lọc và đèn** sau khi châm nước, rồi thả vi sinh theo hướng dẫn trên bao bì. Thường thêm vào lúc châm đầy, và có thể lặp lại sau vài …

### cycling-05 · tank · plain wins (5.5 · 7)

**Asked:** Bể mới đổ nước chạy lọc, nên châm vi sinh loại nào để sớm thả cá?

**Judge:** I'd rather this hobbyist got Y. It answers "loại nào" by naming real live-bacteria products sold in Vietnam (SafeStart, Stability, Quick Start, Nite Out II), says to feed an ammonia source, and gives clear test points for when to add fish. X names no product and uses an odd 38-litre stocking rule. Neither answer uses the 160 L biotope tank or the Atman canister filter. / X tốt hơn một chút. X nói rõ phải chọn chai có vi khuẩn nitrat hóa sống và nêu tên sản phẩm có thật. X còn nhắc cấp amoniac để nuôi vi sinh, có mốc cụ thể để biết lúc nào thả cá được và cho số tuần chạy bể. Y đúng hướng (chạy bể có cá, xin vật liệu lọc cũ) nhưng mỏng hơn và con số 38 lít có vẻ bịa. Cả hai đều bỏ qua bể 845 với lọc thùng Atman và lũa hải sa, cũng không gợi ý vi sinh bán phổ biến ở Việt Nam.

**Ours lacks:** tank-fit, local, figures. **Plain lacks:** tank-fit, local.

**Ours** (read 2 pages, stopped at the calls limit):

> Với bể mới, lựa chọn phù hợp nhất là vi khuẩn nitrat hóa sống (loại chai hoặc gói có ghi vi khuẩn sống), hoặc xin một ít vật liệu lọc, nền đã chạy lâu từ bể đang ổn định của bạn bè. Vì bể chưa có vi khuẩn có lợi nên amoniac từ cá sẽ tích lại, nên bạn nên châm vi sinh rồi mới thả cá, và chỉ thả vài con nhỏ lúc đầu.
> 1. Châm vi khuẩn sống theo đúng liều ghi trên nhãn sản phẩm, hoặc đặt vật liệu lọc đã chạy vào ngăn lọc ngay sau khi đổ nước đã khử clo.
> 2. Thả khoảng một con cá nhỏ cho mỗi 38 lít nước, chọn loài khỏe, bền để bắt đầu.
> 3. Cho ăn rất ít, rồi tăng dần trong bốn đến sáu tuần, đừng cho …

**Plain** (1934 characters):

> Với bể mới, bạn nên dùng **vi sinh nitrifying (vi khuẩn nitrat hóa)**. Nhóm này gồm *Nitrosomonas* (chuyển amoniac thành nitrit) và *Nitrospira/Nitrobacter* (chuyển nitrit thành nitrat). Đây là nhóm vi khuẩn giúp nước an toàn cho cá.
> 
> **Loại vi sinh nên chọn:**
> - Sản phẩm có ghi rõ chứa vi khuẩn nitrat hóa sống, ví dụ: **Tetra SafeStart**, **Seachem Stability**, **API Quick Start**, **Microbe-Lift Nite Out II** hoặc các dòng vi sinh cho bể mới tương tự.
> - Tránh các loại chỉ là enzyme hay "khử mùi" mà không ghi vi khuẩn nitrat hóa.
> 
> **Cách làm:**
> 1. Thay nước sạch đã khử clo (lưu ý nước máy có…

### cycling-06 · post · ours wins (7.75 · 6)

**Asked:** Em mới set một bể cubic 20 loại lowtech, mấy hôm nay nước trong bể tự nhiên rất đục, mờ mờ như lớp sương mù. Mọi người bảo do vi sinh bị chết. Làm sao khắc phục và tạo lại vi sinh? Em cũng nuôi cá trong thùng xốp, nước trong đó rất trong dù thỉnh thoảng mới hút cặn và châm thêm nước. Em lấy nước thùng xốp đó châm mồi vi sinh cho bể mới được không?

**Judge:** Both say the cloudiness is a bacterial bloom, not dead bacteria. X gives clear steps in order, adds advice for Vietnam's heat and sun, and explains why the foam-box water won't seed the tank. Y misreads the hobbyist's water changes and suggests pulling the substrate apart and turning the light off. It mixes in English terms and ends by asking questions back. / Cả hai đều chỉ đúng là bùng vi sinh chứ không phải vi sinh chết, và đều khuyên không đổ nước thùng xốp sang. Y được ưu tiên vì giải thích rõ hơn lý do vi sinh bám trên vật liệu lọc chứ không trôi trong nước, cho bước đo amoniac trước rồi mới làm, có dặn theo dõi, và hợp với điều kiện Việt Nam (trời nóng, nắng chiếu). X thì đọc sai chuyện thay nước thùng xốp và gợi ý sản phẩm ít hợp với chỗ mình.

**Ours lacks:** tank-fit, figures. **Plain lacks:** local, tank-fit, follow-up.

**Ours** (read 4 pages):

> Nước trắng đục như sương mù trong bể mới set thường là bùng vi sinh (vi khuẩn bùng phát), không phải vi sinh bị chết. Cẩm nang ghi rõ nhiều người hay nhầm hai chuyện này. Bể mới chưa cân bằng nên hiện tượng này khá phổ biến, và thường tự hết sau vài ngày đến vài tuần. Mình khá chắc về nguyên nhân này vì bạn mới set bể.
> 1. Đo amoniac (và nitrit nếu có bộ test). Nếu amoniac bằng 0 thì cứ để bể tự cân bằng, không cần xử lý gì gấp.
> 2. Ngưng cho ăn khoảng 7 ngày và không bón thêm phân nước trong lúc này.
> 3. Giảm đèn còn khoảng 8–10 tiếng mỗi ngày và tránh để bể gần cửa sổ hay chỗ nắng chiếu trực t…

**Plain** (2340 characters):

> Nước đục mờ như sương trong bể mới thường là **bloom vi khuẩn**, tức là vi khuẩn đang sinh sôi mạnh khi hệ vi sinh chưa ổn định. Đây thường là dấu hiệu bể đang chạy, không phải vi sinh chết. Hiện tượng này thường tự hết sau khoảng 1-3 tuần.
> 
> ## Cách xử lý
> 
> 1. **Giảm ánh sáng:** Tắt đèn 2-3 ngày hoặc chỉ bật 4-5 tiếng/ngày. Ánh sáng nhiều làm bloom mạnh hơn.
> 2. **Không cho ăn nhiều, không thả cá sớm:** Thức ăn thừa phân hủy làm tăng amonia và nuôi bloom. Nếu chưa có cá, cứ đợi. Nếu có cá, cho ăn rất ít.
> 3. **Thay nước nhẹ:** Thay khoảng 20-30% nước bằng nước đã khử clo. Không thay quá nhiều vì…

### cycling-06 · tank · ours wins (7 · 5)

**Asked:** Bể mới set bỗng đục mờ như sương, có phải vi sinh chết và làm sao gây lại?

**Judge:** X nói đúng nguyên nhân là bùng vi sinh, rồi đưa các bước theo kết quả test với ngưỡng và liều amoni clorua rõ ràng. Y khuyên dùng nước rửa chén làm nguồn amonia, như vậy là sai và nguy hiểm, lại hỏi lại kích thước bể. Cả hai đều chưa nói gì đến việc lấy nước ở thùng xốp để mồi vi sinh. / Y gives a clear test-first plan with sound numbers (thresholds, the Dr. Tim's dose, a test to confirm the cycle is done) and a section written for Vietnam. X recommends dish soap as an ammonia source, which is wrong, and asks for tank details the app already has. Neither uses the 20 cm cube or the foam-box water.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, too-long, follow-up, wrong.

**Ours** (read 2 pages):

> Thường thì đây là bùng vi sinh (vi khuẩn bùng phát, nước đục trắng như nước vo gạo) chứ chưa phải vi sinh chết, vì bể mới set hay gặp chuyện này và cẩm nang cũng nói nhiều người hay nhầm hai việc. Nhưng bể vừa bị sốc như đổi pH, châm clo, thay quá nhiều nước hay mất điện lâu thì vi sinh có thể chết thật, nên bạn cần test để biết.
> 1. Test amoni và nitrit ngay hôm nay. Nếu amoni bằng 0 thì để bể tự cân bằng, ngừng cho ăn khoảng 7 ngày, không đụng vào lọc, không rửa vật liệu lọc bằng nước máy còn clo; nước thường trong lại sau vài ngày.
> 2. Nếu amoni trên 0,1 mg/L hoặc nitrit trên 0, thay khoảng …

**Plain** (2662 characters):

> Bể mới bị đục trắng như sương thường **không phải vi sinh chết hết**. Nguyên nhân phổ biến nhất là **bloom vi khuẩn** (bùng phát vi khuẩn dị dưỡng). Chúng nhân lên nhanh để ăn chất hữu cơ và amonia còn dư trong bể, nên nước đục đều, trắng mờ, thường xuất hiện trong vài ngày đến 2 tuần đầu sau khi setup. Hiện tượng này thường là dấu hiệu bể đang "khởi động" chu trình nitơ, không phải bể hỏng.
> 
> ## Cách phân biệt nguyên nhân
> 
> - **Đục trắng như sữa/sương, lan đều:** bloom vi khuẩn (thường gặp nhất).
> - **Đục xanh lá:** tảo nở hoa, do ánh sáng mạnh hoặc thừa dinh dưỡng.
> - **Bụi li ti lơ lửng, đục k…

### cycling-07 · post · ours wins (5.5 · 4.5)

**Asked:** Hồ em mới set hôm nay, có phân nền và chỉ một số cây cắt cắm dễ trồng. Em đặt trong phòng ngủ nên không thích sủi và lọc vì tiếng ồn. Người bán bảo chỉ cần 2-3 ngày thay nước một lần là được, vậy có ổn không, có cách nào khác không?

**Judge:** Both answers miss that new aquasoil releases ammonia, which is why frequent water changes early on make sense. Y is also wrong about water changes removing beneficial bacteria and about them causing algae, though it does usefully suggest a quiet sponge filter. X is more concise and right on the main points: low light at the start, add fish later and only hardy ones, plant floating plants, and test the water. / Cả hai đều bỏ qua việc phân nền mới nhả amoniac, nên lời khuyên của người bán là thay nước 2-3 ngày một lần trong những tuần đầu thực ra hợp lý, nhưng cả hai lại bác bỏ nó. X còn sai thêm về chuyện vi sinh, dù có nêu được phương án lọc êm (lọc bọt biển, đặt máy bơm xa giường). Y ít lỗi hơn, có bước làm rõ ràng, có thứ cần theo dõi và có ví dụ cá khỏe ở Việt Nam, nên giúp người hỏi nhỉnh hơn một chút.

**Ours lacks:** diagnosis, tank-fit, wrong. **Plain lacks:** wrong, too-long, diagnosis.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình hiểu là bạn muốn yên tĩnh trong phòng ngủ. Lời người bán chỉ đúng một phần: thay nước 2-3 ngày một lần là quá dày, còn việc bể có cần lọc hay sủi hay không phụ thuộc vào số cá và loài cá bạn thả. Cẩm nang có ghi một bể kiểu biotope chỉ có cá, cây và bèo vẫn phát triển tốt sau hơn một tháng không lọc, không sủi khí, nhưng chỉ hợp với cá khỏe chịu được nước ít oxy như cá bã trầu, cá sặc, cá cờ.
> 1. Bạn có thể bỏ sủi và lọc ồn, nhưng đừng thả cá ngay hôm nay. Bể mới set cần vài tuần để cây bén rễ và vi sinh hình thành, nên hãy chờ rồi mới thả ít cá khỏe.
> 2. Để đèn 5-6 tiếng mỗi ngày trong và…

**Plain** (1843 characters):

> Theo mình, lời người bán **chưa hợp lý**, hoặc ít nhất là cần hỏi lại họ cụ thể.
> 
> **Vì sao thay nước 2-3 ngày/lần không ổn:**
> - Hồ mới chưa có vi sinh ổn định. Thay nước quá thường xuyên làm mất lượng vi khuẩn có lợi đang hình thành, và cây cũng khó ổn định.
> - Hồ không lọc, không cá thì tải chất thải rất thấp, không cần thay nước dày như vậy.
> - Mỗi lần thay nước, cây và nền aquasoil bị sốc thông số, dễ gây rêu hoặc cây tàn lá.
> 
> **Cách làm hợp lý hơn (hồ không lọc, không sủi, không cá):**
> - **Tuần 1-3:** Không thả cá hay tép. Chỉ thay khoảng 10-20% khi nước đục trắng hoặc có mùi lạ. Aquasoil t…

### cycling-07 · tank · tie or split (5 · 5)

**Asked:** Bể mới set của tôi chỉ thay nước vài ngày một lần thay cho lọc thì có ổn không?

**Judge:** Cả hai đều không dùng chi tiết của bể: phân nền mới, không lọc, không sủi, đặt trong phòng ngủ. Cả hai cũng không nói rằng mấy tuần đầu thay nước dày với phân nền là đúng. Y rõ ràng hơn và có nhắc khử clo, hợp với nước máy ở Việt Nam. X dài, có câu khó hiểu về aquasoil, lại khuyên thay nước hằng tuần quá sớm. / Cả hai đều nói không ổn và khuyên chạy lọc, nhưng không bàn đến chuyện bể cây không lọc trong phòng ngủ vẫn có thể làm được, cũng không nhắc việc phân nền nhả amoniac. Y nhỉnh hơn vì có lịch thay nước cụ thể cho giai đoạn đầu, nhắc đến cây, có mốc chờ trước khi thả cá và dấu hiệu cần theo dõi. X chung chung và có một lỗi nhỏ về vi khuẩn.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** tank-fit, figures, follow-up.

**Ours** (read 3 pages):

> Bể mới set mà không chạy lọc, chỉ thay nước vài ngày một lần thì chưa ổn. Bể mới cần vi khuẩn có lợi sống trên lọc và nền để phân hủy amoniac từ cá và thức ăn thừa. Vi khuẩn này chỉ hình thành khi có lọc hoạt động liên tục, còn thay nước chỉ pha loãng chất thải chứ không tạo ra chúng. Cẩm nang nói chu trình nitơ thường mất từ vài tuần tới vài tháng. Thử nghiệm 5 tuần trong cẩm nang có bể không thay nước bị rêu bụi xanh phủ kín, nhưng bể đó dùng nền aquasoil, nên đó không phải lý do để bỏ lọc.
> 1. Chạy lọc liên tục từ ngày đầu, chỉ tắt lúc thay nước.
> 2. Ngày đầu thay khoảng 50% nước, sau đó tha…

**Plain** (1284 characters):

> Nếu bạn đang nói đến việc **thay nước thường xuyên nhưng không dùng lọc** (hoặc chỉ dựa vào thay nước để giữ nước sạch), thì **không ổn** với bể mới. Lọc sinh học là phần quan trọng nhất của bể, không chỉ để lọc cặn.
> 
> **Vì sao không ổn:**
> - Bể mới chưa có vi khuẩn có lợi để phân hủy amoniac (từ phân cá, thức ăn thừa, xác cây). Quá trình này (chu trình nitơ) mất khoảng 2–6 tuần.
> - Thay nước liên tục làm loãng chất thải nhưng không xử lý được nguồn gốc, và có thể làm vi khuẩn còn ít bị mất theo, khiến chu trình nitơ càng lâu.
> - Nếu có cá, amoniac và nitrit tích tụ có thể gây stress, bệnh hoặc c…

### cycling-08 · post · plain wins (5 · 7)

**Asked:** Hồ của em làm từ thùng xốp 40x40x20, 2 mặt kính, 3 mặt xi măng, để trên sân thượng trong mái hiên. Em dùng lọc thác Sobo 400l/h có đủ không? Hồ như vậy có cần CO2 không? Bao lâu thì thả cá được?

**Judge:** Y nhắc ngâm xi măng mới để xả kiềm và nên phủ epoxy, đây là mối nguy chính với hồ của bạn. Y cũng hướng dẫn cycling rõ từng bước. X hoàn toàn bỏ qua xi măng mà lại bảo thả cá ngay từ đầu. Y có vài lỗi nhỏ khi gợi ý cá và cây. / X covers the most important risk in this build: the 3 new cement walls, which need soaking or sealing before any fish go in. X also flags the styrofoam and the rooftop heat. Y skips the cement and tells them to put fish in straight away, which could kill those fish. X has a few poor fish and plant picks, but it still helps this hobbyist much more.

**Ours lacks:** tank-fit, diagnosis, unsafe. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình tính nhanh: hồ 40x40x20 cm là khoảng 32 lít nước. Lọc thác Sobo 400 l/h là đủ, thậm chí hơi mạnh cho hồ nhỏ thế này, vì nó đảo nước khoảng 12 lần mỗi giờ. Nếu cá nhỏ hoặc nước bị xô mạnh, bạn có thể chặn bớt dòng bằng miếng xốp hoặc đặt máy lệch một bên. Hồ này không cần CO2 nếu bạn chỉ trồng cây dễ như rêu java, dương xỉ java, anubias, cây cắm ngọn; cây loại này lớn được với ánh sáng vừa phải mà không cần bơm khí. CO2 chỉ cần khi bạn muốn trồng cây đòi hỏi cao với đèn mạnh. Về thời gian: bạn cần cycling trước khi thả cá, thường khoảng 4 đến 6 tuần. Bạn có thể thả vài con cá nhỏ ngay từ …

**Plain** (2477 characters):

> # Hồ 40x40x20 trên sân thượng
> 
> **Thể tích:** khoảng 30 lít nước thực tế.
> 
> ## 1. Lọc Sobo 400 L/h có đủ không?
> 
> Lọc **đủ, thậm chí dư**. Với hồ 30 lít, 400 L/h tương đương khoảng 13 lần lưu thông mỗi giờ, trong khi hồ cảnh thường chỉ cần 4-6 lần/giờ. Lưu lượng mạnh dễ làm cá nhỏ, cá betta, tôm bị stress, nên bạn có thể:
> - Điều chỉnh van hoặc gắn tấm chắn để giảm dòng chảy.
> - Hướng miệng xả vào thành kính hoặc cho nước chảy dọc mặt nước thay vì xối thẳng.
> - Dùng mút lọc, sứ lọc vi sinh để tăng vi khuẩn có lợi, quan trọng hơn lọc cơ học.
> 
> ## 2. Có cần CO2 không?
> 
> **Không cần** nếu bạn chỉ nuôi c…

### cycling-08 · tank · ours wins (7 · 4)

**Asked:** Bể mới làm của tôi bao lâu thì thả cá được, lọc như vậy có đủ không?

**Judge:** X dùng đúng kích thước bể (32 lít) và lọc Sobo 400 l/h, khẳng định lưu lượng dư, đưa các bước có thứ tự để chạy bể và có nhắc tới mặt xi măng. Tuy vậy X vẫn có chỗ sai: con số 38 lít mỗi con, khuyên bật sưởi trên sân thượng, và không nói chuyện nắng nóng. Y bỏ qua thông tin bể đã có, trả lời chung chung rồi hỏi lại. / Y is the better answer. It works out the volume (about 32 L), shows the Sobo 400 l/h gives roughly 12 turnovers an hour, gives testing steps in order and warns that cement walls can make the water harder and more alkaline. It could say more about soaking and rinsing new cement and about heat on the rooftop. X ignores the tank details the app already has, gives generic advice and asks for information it could have read.

**Ours lacks:** local, figures. **Plain lacks:** tank-fit, asks-only, local.

**Ours** (read 2 pages):

> Bể của bạn 40×40×20 cm, khoảng 32 lít, và hiện chưa có cá nên chưa có gì để chu trình nitơ xử lý. Trong cẩm nang, chu trình thường mất vài tuần đến vài tháng, nên không có một số ngày cố định; bạn đo nước để biết, không tính theo lịch. Lọc Sobo 400 l/h cho bể này thì lưu lượng dư (khoảng 12 lần đảo nước mỗi giờ), nên vấn đề không nằm ở lưu lượng. Điều quyết định là lọc sinh học: bông lọc và vật liệu lọc có đủ vi khuẩn hay chưa, và việc đó chỉ biết khi đo.
> 1. Đặt lọc chạy ngay, bật đèn và nhiệt cho ổn định, rồi mua que thử amoniac và nitrit (hoặc que đa chỉ tiêu).
> 2. Nếu có thể, xin vài miếng …

**Plain** (1752 characters):

> Bạn chưa cho biết dung tích bể và loại lọc đang dùng, nên tôi chỉ trả lời được phần chung. Bạn có thể cho tôi biết thêm để tư vấn cụ thể hơn.
> 
> **Thời gian chờ trước khi thả cá: thường 3–6 tuần**
> 
> Bể mới cần thời gian để hình thành vi khuẩn có lợi, gọi là chu trình nitơ (nitrogen cycle). Vi khuẩn này chuyển hóa chất thải của cá (amoniac, rất độc) thành nitrit (cũng độc), rồi thành nitrat (ít độc hơn, xử lý bằng thay nước định kỳ).
> 
> Cách kiểm tra bể đã "chạy" xong:
> - Dùng bộ test nước (ammonia, nitrite, nitrate).
> - Khi amoniac và nitrit đều về **0** trong ít nhất 1–2 tuần liên tiếp, và đã có ni…

### sick-01 · post · ours wins (7.5 · 1)

**Asked:** Đàn ngựa vằn xanh nhà em nuôi gần 3 năm, rơi rụng dần. Giống này không đẻ nổi, giờ cứ 1 vài tuần lại có con cong người, 1-2 tuần sau là chết. Có phải do già quá không, hay bị bệnh gì?

**Judge:** Y hiểu nhầm cá thành chim nên toàn bộ câu trả lời lạc đề. X nêu đúng các nguyên nhân hợp lý (bệnh vi bào tử trùng, cá đã già) và đưa ra bước cách ly, theo dõi cụ thể. Tuy vậy, khoảng nhiệt độ X đưa ra lại không hợp với khí hậu Việt Nam. / X mistook the zebra danio for a zebra finch, so none of its answer helps. Y is about the right fish: it points to microsporidiosis (Pseudoloma), which fits the bent bodies and slow deaths, explains the fish's age and inbreeding, and gives clear steps for isolating sick fish and what to watch for. Its one weak spot is the 18–25°C temperature range, which doesn't fit tanks in Vietnam's heat.

**Ours lacks:** local, diagnosis. **Plain lacks:** off-topic, wrong.

**Ours** (read 2 pages):

> Nhiều khả năng không chỉ do già. Cá cong người, gầy dần rồi chết trong 1–2 tuần rất giống bệnh vi bào tử trùng (microsporidiosis), dân gian gọi là bệnh gầy (skinny disease). Bệnh do ký sinh trùng Pseudoloma neurofilia gây ra, lây qua đường miệng, tấn công hệ thần kinh và cột sống, và thường không có thuốc chữa. Cá ngựa vằn sống khoảng 3–5 năm nên 3 năm tuổi đã gần cuối đời, còn dòng làm cảnh bị cận huyết vì nhân giống quá nhiều cũng yếu hơn, đó là lý do đàn không đẻ nổi. Mình không khám được cá nên chưa thể chắc chắn; cũng cần loại trừ bệnh neon tetra (NTD), vì nó gây triệu chứng tương tự và …

**Plain** (2131 characters):

> Nếu đây là **chim sẻ ngựa vằn xanh** (zebra finch, màu xanh là biến thể màu), thì có thể không chỉ do già. Tuổi thọ của giống này thường khoảng 5-7 năm, nên 3 năm chưa phải là già. Triệu chứng "cong người, chết sau 1-2 tuần" và việc không đẻ được cho thấy có bệnh mạn tính hoặc vấn đề di truyền/chăm sóc.
> 
> **Các nguyên nhân thường gặp:**
> 
> 1. **Suy giảm do cận huyết (inbreeding):** Đàn nuôi lâu năm, ghép cặp trong nhóm nhỏ, dễ suy yếu sinh sản, yếu sức đề kháng, nhiều dị tật. Đây là lý do hàng đầu nếu đàn "không đẻ nổi" và dần suy.
> 2. **Bệnh do vi khuẩn/ký sinh trùng:**
>    - Chlamydia (bệnh vẹt/…

### sick-01 · tank · plain wins (5 · 6.25)

**Asked:** Cá ngựa vằn của tôi cứ vài tuần lại có con cong người rồi chết, là bệnh gì?

**Judge:** Y is the better answer. It names both likely chronic diseases in zebra danios (mycobacteriosis and Pseudoloma), warns that mycobacteriosis can spread to people, and gives fuller steps: disinfect equipment, send a dead fish for testing, and euthanise sick fish humanely. X is thinner and quotes a 18–25°C range that doesn't suit Vietnam's heat. Neither answer considers that fish kept for nearly 3 years may simply be getting old. / X nêu cả lao cá lẫn Pseudoloma, hai nguyên nhân hay gặp nhất gây cong người ở cá ngựa vằn, và nhắc bệnh có thể lây sang người. Y gọn hơn và dễ làm theo hơn nhưng chẩn đoán kém hơn. Cả hai đều bỏ qua chuyện cá đã gần 3 năm tuổi, nên lão hóa cũng có thể là một nguyên nhân.

**Ours lacks:** tank-fit, diagnosis, local. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 2 pages, stopped at the calls limit):

> Mình chưa thể chắc bệnh gì chỉ từ mô tả, nhưng cá cong người rồi chết lặp đi lặp lại trong bể là dấu hiệu nên nghi nhiễm khuẩn kéo dài như lao cá (mycobacteriosis), bệnh hay gặp ở cá ngựa vằn. Cong người cũng có thể do dị tật bẩm sinh hoặc chấn thương, nên cần quan sát thêm. Cẩm nang chưa có trang nào nói rõ bệnh này ở cá ngựa vằn, nên phần này mình dựa vào kinh nghiệm chung. Các bước làm ngay:
> 1. Vớt ngay con đã chết và con đang cong ra khỏi bể, không để xác phân hủy trong nước.
> 2. Đo nhiệt độ, pH, amoniac và nitrit. Cá ngựa vằn hợp 18–25°C và pH 6–8 theo cẩm nang. Nếu amoniac hoặc nitrit có…

**Plain** (2051 characters):

> Cá ngựa vằn bị cong người rồi chết lặp lại theo từng đợt thường gợi ý một **bệnh truyền nhiễm mạn tính trong bể**. Hai nguyên nhân phổ biến nhất là:
> 
> **1. Lao cá (Mycobacteriosis)**: nguyên nhân hay gặp nhất ở cá ngựa vằn.
> - Cá gầy dần dù vẫn ăn, bụng hoặc lưng có thể nhô lên, vảy dựng.
> - Cong vẹo cột sống, cong người, bơi lờ đờ hoặc nằm đáy.
> - Có thể xuất hiện u hạt, loét da, sưng.
> - Diễn tiến chậm, nhiều tuần đến nhiều tháng, cá chết dần.
> - **Lưu ý:** bệnh có thể lây sang người qua vết xước trên da. Nên đeo găng tay khi xử lý cá và rửa tay kỹ.
> 
> **2. Nhiễm microsporidia (Pseudoloma neurophil…

### sick-02 · post · ours wins (8 · 7)

**Asked:** Nguyên nhân cá chết là gì ạ? Em có bể cá vàng, 7 màu và mấy loại linh tinh rẻ rẻ cho con chơi, nuôi trong nhà, mật độ thưa. Lọc với sục oxy chạy 24/24, nước trong sạch; em cho ăn rất ít, thức ăn viên mua sẵn; ít thay nước, chỉ thay khi thấy vẩn đục, có xử lý clo trước khi cho nước vào. Cái mút xốp lọc em giặt nước lã suốt vì phân cá hút lên nhanh bẩn. Vậy mà tuần nào cũng có con chết, tháng nào cũng đi mua thêm mà cứ chết dần.

**Judge:** Cả hai đều đoán đúng nguyên nhân: giặt mút bằng nước lã làm mất vi khuẩn, cộng với ít thay nước. X tốt hơn vì đưa các bước theo thứ tự: đo test, thay 30–50% nước ngay, ngừng mua cá. Y nêu được việc cách ly cá mới (hợp với chuyện tháng nào bạn ấy cũng mua thêm cá), nhưng lại không có bước thay nước khẩn cấp và nhiều chữ hơn. / Cả hai đều chỉ đúng nguyên nhân: giặt mút bằng nước lã làm chết vi khuẩn có lợi, cộng với thay nước quá ít. Y hơn vì có kế hoạch theo thứ tự: test ngay, thay 30–50% nước ngay, ngừng mua thêm cá cho tới khi amoniac và nitrit bằng 0, và nói rõ cần theo dõi gì. X liệt kê nhiều nguyên nhân và có thêm việc cách ly cá mới, nhưng không có bước cấp cứu ngay hôm nay.

**Ours lacks:** tank-fit. **Plain lacks:** plan, too-long, follow-up.

**Ours** (read 3 pages, stopped at the tools limit):

> Nhiều khả năng cá chết dần vì amoniac và nitrit tích lại trong bể, do thay nước quá ít và giặt mút bằng nước lã làm mất vi khuẩn có lợi. Cá vàng và cá bảy màu thải rất nhiều chất bẩn, nên lọc sinh học phải làm việc liên tục. Mình chưa thấy số đo nào của bể, nên đây là suy đoán mạnh chứ chưa chắc chắn.
> 1. Mua bộ test amoniac và nitrit (loại thả giấy hoặc nhỏ dung dịch) và đo ngay hôm nay. Nếu amoniac hoặc nitrit trên 0 thì bể đang độc, phải xử lý trước khi cho ăn tiếp.
> 2. Thay 30 đến 50% nước ngay, không đợi đến khi vẩn đục. Nước mới phải khử clo, đúng nhiệt độ với bể, và đổ nhẹ từ trên xuống.…

**Plain** (2360 characters):

> Nguyên nhân rất có thể là **chu trình nitơ trong bể bị phá vỡ**. Bể trông sạch nhưng chất độc vô hình vẫn tích tụ.
> 
> **1. Giặt mút lọc bằng nước máy là nguyên nhân chính.**
> Mút lọc là nơi trú ngụ của vi khuẩn có lợi, loại chuyển hóa amoniac (NH₃) từ phân và thức ăn thừa thành nitrit (NO₂), rồi thành nitrat (NO₃) ít độc hơn. Giặt bằng nước máy (có clo hoặc cloramin) sẽ diệt phần lớn vi khuẩn này. Bể mất khả năng xử lý chất thải, amoniac và nitrit tăng vọt, cá chết dần. Cá chết từng con theo tuần rất giống kiểu này.
> 
> **2. Nước trong không có nghĩa là an toàn.**
> Amoniac và nitrit không đổi màu nư…

### sick-02 · tank · ours wins (8 · 4)

**Asked:** Bể tôi tuần nào cũng có cá chết dù nước trong và cho ăn ít, nguyên nhân là gì?

**Judge:** X nêu đúng hai nguyên nhân có thật trong bể này: giặt mút lọc bằng nước lã có clo làm chết vi khuẩn lọc, và chỉ thay nước khi nước đục. X đưa ra các bước theo thứ tự kèm số liệu, và nhắc chuyện cá vàng nuôi chung với bảy màu bị lệch nhiệt độ. Y chỉ liệt kê chung chung bảy nhóm nguyên nhân, không chỉ ra thủ phạm, rồi lại hỏi những điều app đã có sẵn. / Y chỉ ra hai thói quen có trong ghi chú của bạn ấy: giặt mút lọc bằng nước máy có clo và chỉ thay nước khi nước đục. Đây gần như chắc chắn là lý do cá chết lẻ tẻ mỗi tuần. Y cũng đưa các bước sửa cụ thể kèm cách theo dõi. X chỉ liệt kê chung chung mọi nguyên nhân có thể có rồi hỏi lại những điều app đã có sẵn.

**Ours lacks:** –. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 1 pages, stopped at the calls limit):

> Nước trong không có nghĩa là nước an toàn: amoniac và nitrit không đổi màu nước nên bạn không thấy chúng, và chúng có thể đang tích dần trong bể. Theo chi tiết bạn kể, mình nghi hai nguyên nhân chính: bạn chỉ thay nước khi nước vẩn đục nên amoniac, nitrit và nitrat không được rút đi đều, và bạn giặt mút lọc bằng nước máy thường xuyên, mà clo trong nước máy giết vi khuẩn lọc sinh học. Khi vi khuẩn này chết, amoniac và nitrit tăng dần và giết cá từng con một, đúng kiểu chết lẻ tẻ mỗi tuần. Mình chưa chắc chắn cho đến khi bạn đo nước.
> 1. Mua bộ test nước và đo ngay amoniac, nitrit, nitrat, pH và…

**Plain** (3014 characters):

> Nước trong không có nghĩa là nước an toàn. Cá chết hằng tuần mà nước vẫn trong thường do các yếu tố **không nhìn thấy bằng mắt**. Các nguyên nhân phổ biến nhất:
> 
> ## 1. Chất độc trong nước (thường gặp nhất)
> - **Amoniac (NH₃/NH₄⁺) và nitrit (NO₂⁻)**: rất độc với cá, và không có màu hay mùi rõ rệt. Chúng sinh ra từ chất thải, thức ăn thừa, xác cá/ốc/lá mục.
> - Nguyên nhân thường gặp: **chu trình nitơ chưa ổn định** (bể mới chưa "chạy" xong), lọc quá yếu, hoặc **vệ sinh quá kỹ** làm mất vi khuẩn có lợi (ví dụ rửa lọc bằng nước máy nóng, thay nước quá nhiều).
> - Ngay cả khi cho ăn ít, nếu bể quá tải…

### sick-03 · post · ours wins (6.75 · 4.5)

**Asked:** Hồ em trồng minifiss, ráy và ít cắt cắm (sunset, rong la hán), nuôi tép màu và ít cá (bảy màu, otto, pigmy). pH lúc có CO2 đo được 7, KH 4, GH 8, TDS 360; nước nguồn TDS cao (160-200). Rong èo uột không phát triển, ráy ra lá non nhưng không khỏe, có rêu xanh bám lá, fiss phát triển chậm. CO2 em để 2-3 giọt/giây nhưng test CO2 vẫn báo thiếu. Tép bị chết lai rai, cá tầm 1-2 tuần chết 1 con. Có cách nào hạ TDS không, hay do đâu?

**Judge:** X chỉ ra đúng chuyện TDS tích tụ do phân bón và ít thay nước, kèm các bước làm hợp lý (kiểm tra rò rỉ CO2, thay nước RO, giảm phân, giảm giờ đèn). Tuy vậy X đưa ra một quy tắc liều CO2 đáng ngờ. Y tính sai CO2 và giải thích sai cơ chế KH, dù gợi ý pha nước RO thì dùng được. / Y is the better answer. It spots that TDS has climbed from the source's 160-200 to 360, which means fertilizer and waste are building up. It also tells the hobbyist to check the CO2 setup for leaks, cut back fertilizer, shorten the lighting hours, test ammonia and nitrite, and what to watch for over the next weeks. X gets the CO2 numbers wrong and blames KH 4 for the CO2 shortage, which is not the cause.

**Ours lacks:** figures, diagnosis, tank-fit. **Plain lacks:** wrong, diagnosis, follow-up.

**Ours** (read 4 pages, stopped at the tools limit):

> Nhiều khả năng bể đang thiếu CO2 và dinh dưỡng, còn TDS 360 cao chủ yếu do nước nguồn đã cứng (TDS 160-200, GH 8) cộng với phân bón tích tụ lâu ngày. Lá non yếu, rêu xanh bám lá và cây lớn chậm là dấu hiệu cây đang đói CO2 hoặc thiếu chất, còn tép chết lai rai và cá chết dần thường do nước không ổn định, TDS quá cao hoặc tép lột xác hỏng.
> 1. Đo lại CO2 bằng dung dịch chỉ thị hoặc ống đo màu (drop checker) thay vì chỉ đếm giọt, vì đếm giọt không cho biết lượng CO2 hòa tan thật. Kiểm tra gioăng ở cổ bình, van và nắp đếm giọt, vì khí thường rò ở đó nên dù chỉnh 2-3 giọt/giây vẫn thiếu. Với bể câ…

**Plain** (2265 characters):

> ## Nguyên nhân chính: nước cứng và KH cao làm CO2 không đủ
> 
> Với pH 7 và KH 4 dKH, lượng CO2 hoà tan chỉ khoảng **2-3 mg/L**, còn cây cần khoảng **15-30 mg/L**. KH cao làm đệm pH, nên CO2 bơm vào không hạ được pH xuống. Vì vậy dù bạn sục 2-3 bọt/giây, test vẫn báo thiếu. Đây là lý do rong èo uột, ráy và fissidens không lên tốt, còn rêu xanh bám lá là dấu hiệu cây thiếu carbon nên không cạnh tranh được với rêu.
> 
> Tép và cá chết lai rai có thể do:
> - **Nước quá cứng và TDS cao** (GH 8, TDS 360). Tép màu rất nhạy với độ cứng và dễ gặp lỗi lột xác.
> - **pH và CO2 dao động** giữa ngày và đêm.
> - **Amon…

### sick-03 · tank · ours wins (7 · 4)

**Asked:** Tép trong bể tôi chết lai rai và cá thỉnh thoảng chết một con, có phải do TDS cao không?

**Judge:** X dùng đúng số liệu bể của bạn (GH 8, KH 4, TDS 360, nước nguồn 160–200) để kết luận TDS không phải thủ phạm chính, rồi đưa ra các bước kiểm tra theo thứ tự kèm việc cần theo dõi. Y xếp red cherry vào nhóm Caridina là sai, liệt kê chung chung kiểu bể nào cũng áp được, và quay lại hỏi những thông tin đã có sẵn. / Y dùng đúng số liệu của bể (TDS 360, GH 8, KH 4, nước nguồn 160–200) và đưa ra các bước kiểm tra có thứ tự kèm việc cần theo dõi. Y chưa nói rõ rằng TDS tăng từ khoảng 180 lên 360 cho thấy thay nước chưa đủ. X nói chung chung, xếp nhầm cherry vào nhóm Caridina và hỏi lại thông tin đã có.

**Ours lacks:** follow-up, diagnosis. **Plain lacks:** tank-fit, plan, wrong, diagnosis.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình nghĩ TDS 360 chưa phải thủ phạm chính. Tép red cherry chịu được pH 6,5–8,5 và GH từ 6 trở lên, bể bạn có KH 4 và GH 8, nên TDS này không đủ để giết tép đều đặn; nước nguồn 160–200 cũng là mức tép thường sống được. Tép chết lai rai kèm cá chết lẻ tẻ thường là dấu hiệu nước đang xấu dần: amoniac hoặc nitrit, pH dao động, đồng hoặc clo, hoặc thiếu oxy.
> 1. Đo amoniac, nitrit và nitrat bằng bộ test nhỏ giọt, ưu tiên đo sáng sớm khi oxy thấp nhất. Amoniac hay nitrit trên 0 là dấu hiệu lọc sinh học đang yếu, nên thay khoảng 30–50% nước và rút nước cũ ra, đừng chỉ châm thêm.
> 2. Đo pH buổi sáng v…

**Plain** (2167 characters):

> Có thể TDS cao là một nguyên nhân, nhưng chưa chắc là nguyên nhân chính. Tép chết rải rác kéo dài thường liên quan đến chất lượng nước nói chung hơn là một thông số đơn lẻ.
> 
> **TDS cao có thể gây hại khi:**
> - Tép thuộc nhóm nhạy cảm như Caridina (cherry đỏ, tiger, bee...) cần TDS thấp, thường khoảng 100–180 ppm, và GH thấp. Neocaridina (cherry xanh, sakura...) chịu được TDS khoảng 150–250 ppm.
> - TDS tăng do nước máy cứng, phân bón, muối, hoặc bay hơi nước mà không bù đúng cách, nên TDS tăng dần qua thời gian.
> - Tép lột xác khó khăn, thường thấy là tép chết khi lột vỏ hoặc có con bị dị dạng.
> 
> *…

### sick-04 · post · plain wins (5.5 · 6.25)

**Asked:** Mình chơi bể 60x40x40, set được gần 3 tháng, layout núi đá dùng đá da voi màu trắng nên pH ở ngưỡng 7,8-8. Thảm nền trồng trân châu ngọc trai, mấy ngọn rau thơm cắm khe đá, có vảy ốc xanh và vảy ốc đỏ. Để hạ pH, mình bổ sung thêm vật liệu lọc Neo Soft, vừa cho vào chạy thì chỉ khoảng 10 giây sau tép chạy loạn hết rồi chết dần. Sau đó thảm trân châu và rau thơm bị rữa lá, pH luôn ở 8,4, sục CO2 cũng chỉ xuống 7,4 trong khi nước đầu vào 7,0 trở xuống. Vảy ốc thì có vết như gãy ngang ngọn lá nhưng lá vẫn xanh, không rụng. Mình nên xử lý sao?

**Judge:** Cả hai trả lời đều hiểu nhầm vảy ốc là con ốc, trong khi đây là cây Rotala. Y vẫn giúp được nhiều hơn: Y cắt tỉa và phục hồi trân châu với rau thơm, đề xuất bọc epoxy hoặc bỏ bớt đá vôi, đặt mức KH cần nhắm tới, và hướng dẫn thả tép lại. X mỏng hơn, lại có câu nhắc tới cái 'cẩm nang' của trợ lý, chẳng giúp gì cho người hỏi. / Cả hai câu trả lời đều đúng ở chỗ bảo gỡ Neo Soft ngay và chỉ ra đá da voi (đá vôi) làm KH cao, nên phải hạ KH bằng nước RO. Cả hai cũng đều hiểu nhầm vảy ốc (cây Rotala) thành con ốc, nhưng X sai rõ hơn vì dành hẳn một mục bàn về vỏ ốc thiếu canxi. Dù vậy X vẫn nhỉnh hơn vì cho thêm việc cụ thể: cắt bỏ lá rữa, đo KH/GH, đặt mục tiêu KH 2–4, bọc keo hoặc bớt đá, và đợi bao lâu mới thả tép lại. Y gọn hơn và có ý kiểm tra đầu sủi CO2 hợp với bể này, nhưng gần như không hướng dẫn cứu thảm trân châu và rau thơm.

**Ours lacks:** tank-fit, plan, diagnosis, wrong. **Plain lacks:** too-long, wrong.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng Neo Soft là thủ phạm: tép chạy loạn rồi chết trong vài chục giây là dấu hiệu sốc hóa chất hoặc pH đổi đột ngột, và cây rữa lá sau đó cũng hay do cùng nguyên nhân. Cẩm nang chưa có trang nào nói về sản phẩm Neo Soft, nên mình không biết chắc thành phần của nó. Với đá da voi trắng (đá vôi), KH cao là gốc khiến pH luôn 8 trở lên, nên hạ pH bền phải giảm KH bằng nước RO hoặc nước ít khoáng, không phải bằng vật liệu thả vào lọc, vì cẩm nang ghi thuốc hạ pH chỉ tạm thời.
> 1. Tháo Neo Soft ra khỏi lọc ngay và đừng thả thêm thứ gì để chỉnh pH.
> 2. Test amoniac và nitrit; nếu có số đo bất…

**Plain** (2709 characters):

> Mình sẽ xử lý theo thứ tự: dừng nguyên nhân gây sốc, kiểm tra nước, rồi mới phục hồi cây và ốc.
> 
> ## 1. Gỡ Neo Soft ngay
> 
> Tép chết trong khoảng 10 giây sau khi cho vật liệu vào là dấu hiệu sốc cấp tính, không phải do pH 8 vì tép Neocaridina chịu được pH 6,5–8,5. Có thể vật liệu đang nhả chất hoặc làm pH/độ cứng biến động mạnh. Bạn nên:
> - Lấy Neo Soft ra hoàn toàn, rửa sạch hoặc bỏ luôn.
> - Kiểm tra lại thông tin sản phẩm. Nếu nhà sản xuất không công bố rõ thành phần hoặc cách dùng cho bể thủy sinh có tép, đừng dùng lại.
> 
> ## 2. Kiểm tra nước ngay
> 
> Thay khoảng 30–40% nước bằng nước đã khử clo, cù…

### sick-04 · tank · ours wins (6.25 · 5)

**Asked:** Tôi vừa thêm vật liệu lọc hạ pH thì tép chạy loạn rồi chết dần, phải làm gì?

**Judge:** Hai câu trả lời đều chẩn đoán đúng ý chính là sốc pH và bảo lấy Neo Soft ra ngay. Nhưng không câu nào chỉ ra chỗ mâu thuẫn thật trong bể: đá da voi giữ pH 8,4 trong khi Neo Soft kéo pH xuống, nên pH cứ dao động. X gọn hơn và có thứ tự rõ: vớt tép chết, thay 20–30% nước, đo lại sau 1–2 giờ, theo dõi 24–48 giờ. Y dài, khuyên thay nước nhiều hơn mức an toàn, có phần thả tép mới không liên quan, và cuối bài còn hỏi lại những thông tin mà app đã có sẵn. / Y đưa ra các bước xử lý gọn và đúng thứ tự: vớt tép chết, thay nước ít để tránh sốc thêm, đo lại pH sau 1–2 giờ, rồi theo dõi trong 24–48 giờ tới. X thì có nhiều phần lan man (dặn cách thả tép mới, bàn về Caridina) và cuối bài còn hỏi lại các thông tin mà app đã có sẵn. Cả hai đều không nhận ra mâu thuẫn chính của bể: đá da voi đẩy pH lên 8,4 trong khi Neo Soft kéo pH và KH xuống, gây dao động mạnh.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, too-long, follow-up.

**Ours** (read 2 pages, stopped at the calls limit):

> Nguyên nhân có khả năng nhất là pH bị kéo xuống quá nhanh sau khi thêm vật liệu, hoặc vật liệu làm KH (độ cứng carbonate) xuống thấp, nên tép bị sốc và stress. Mình chưa thấy trong cẩm nang trang nào nói về vật liệu hạ pH nên đây là kinh nghiệm chung của người nuôi, mức chắc chắn vừa phải.
> 1. Lấy vật liệu hạ pH ra khỏi lọc ngay, đừng thêm gì để hạ pH thêm lúc này.
> 2. Đo pH, KH, amoniac và nitrit ngay bây giờ để biết bể đang ở đâu.
> 3. Vớt tép chết ra ngay, vì xác phân hủy làm tăng amoniac.
> 4. Thay khoảng 20–30% nước bằng nước có pH và nhiệt độ gần với bể; đổ từ từ và chừng 1–2 giờ đo lại để xe…

**Plain** (1913 characters):

> Tép chạy loạn rồi chết thường là dấu hiệu **sốc pH** (pH giảm quá nhanh) hoặc nhiễm độc từ vật liệu lọc. Bạn làm theo các bước sau:
> 
> **1. Xử lý ngay**
> - **Lấy vật liệu lọc hạ pH ra khỏi bể** ngay lập tức, không để nó tiếp tục nhả axit hoặc tannin.
> - **Thay 30–50% nước** bằng nước đã khử clo, có nhiệt độ tương đương bể và pH gần với pH cũ của bể. Thay từ từ, không thay một lần quá nhiều.
> - **Tăng sục khí** để nước giàu oxy hơn, vì tép đang yếu rất dễ thiếu oxy.
> - **Tắt đèn và hạn chế cho ăn** cho đỡ ảnh hưởng đến nước.
> 
> **2. Kiểm tra thông số**
> Dùng bộ test nước để kiểm tra:
> - **pH, KH, GH**: …

### sick-05 · post · plain wins (6 · 7)

**Asked:** Bể của tôi set được 2 tháng, có đèn, oxy, CO2, nhưng gần đây nước trong bể có màu vàng nâu, cá thì chết lai rai. Tôi thay nước cách ngày 50% (dùng nước lọc loại mua uống hằng ngày) mà vẫn không hết. Giúp tôi với.

**Judge:** Y links the bottled water they use (almost no KH) with the CO₂ they inject to explain the pH crash, which is the most likely cause in this tank. It also gives a sensible mix ratio for water changes. X is shorter, but it assumes the colour comes from driftwood, ignores the CO₂, and wrongly calls the problem old tank syndrome in a 2-month tank. / X dùng đúng chi tiết của bể: nước uống đóng chai rất mềm, KH thấp, lại bơm CO2 nên pH dễ tụt. X cũng cho bước làm cụ thể như giảm CO2 khi pH dưới 6 và pha thêm nước máy đã khử clo. Y có phần theo dõi gọn gàng nhưng bỏ qua CO2, đoán màu nước là do lũa trong khi người hỏi không nhắc tới, và áp sai "hội chứng bể cũ" cho bể mới 2 tháng.

**Ours lacks:** tank-fit, diagnosis. **Plain lacks:** too-long, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Màu vàng nâu thường do lũa hoặc gỗ nhả tannin, và màu này tự nó không giết cá. Cá chết dần sau 2 tháng thì nhiều khả năng là chất lượng nước: bể mới chưa ổn định nên amoniac hoặc nitrit có thể còn cao, pH có thể đang tụt, hoặc nước thay vào quá mềm và ít đệm nên pH dao động mạnh. Mình chưa biết chắc, nên bạn cần đo trước khi làm gì tiếp.
> 1. Ngay bây giờ, ngưng cho ăn và sục khí mạnh hơn, vì cẩm nang nói oxy và amoniac là hai thứ giết cá nhanh nhất.
> 2. Đo amoniac, nitrit, nitrat, pH, độ cứng và độ kiềm, nhiệt độ, và oxy hòa tan. Nếu amoniac hoặc nitrit trên 0,1 mg/L, đó là nguyên nhân chính.
> 3…

**Plain** (2514 characters):

> Nước vàng nâu kèm cá chết dần là dấu hiệu bể đang có vấn đề về chất lượng nước, không chỉ là màu nước. Thay 50% mà vẫn không hết màu cho thấy nguồn gây màu vẫn còn trong bể, và nguyên nhân thường nằm ở một trong mấy điểm sau:
> 
> **Các nguyên nhân hay gặp nhất (bể mới 2 tháng):**
> 1. **Chu trình nitơ chưa ổn định hoặc đang bị sốc:** Amoniac và nitrit tăng sẽ giết cá dần dần. Đây là nguyên nhân nguy hiểm nhất, cần kiểm tra ngay.
> 2. **Thức ăn dư, xác cá/lá cây thối, rễ thối:** Phân hủy hữu cơ tạo màu vàng nâu, làm tăng amoniac.
> 3. **Gỗ lũa hoặc lá khô (lá bàng, lá dừa khô...):** Thường nhả tannin l…

### sick-05 · tank · plain wins (2 · 4.5)

**Asked:** Nước bể tôi ngả vàng nâu và cá chết lai rai dù thay nước thường xuyên, vì sao?

**Judge:** Khả năng cao nguyên nhân là nước uống đóng bình gần như không có khoáng (KH/GH thấp) cộng với việc bơm CO₂, khiến pH sụt và dao động mỗi lần thay 50% cách ngày. X chẩn đoán sai thành old tank syndrome do thay ít nước, và còn khuyên thay ít hơn hiện tại. Y viết chung chung và dài, nhưng có nhắc đến pH/KH sụt mạnh, có hỏi về nước RO, và các bước xử lý của Y an toàn. / Không câu nào nhận ra nguyên nhân chính: thay nước bằng nước uống đóng bình gần như không có khoáng, KH bằng 0, lại thêm CO₂ nên pH sụt và dao động liên tục. X tuy chung chung nhưng có nhắc tới pH/KH sụt và bảo đo KH/GH. Y thì chẩn đoán sai hẳn: gọi là old tank syndrome với bể mới 8,6 tuần, và đưa ra lượng nước thay mâu thuẫn với chính mình.

**Ours lacks:** wrong, tank-fit, diagnosis. **Plain lacks:** tank-fit, diagnosis, too-long.

**Ours** (read 2 pages, stopped at the calls limit):

> Có khả năng cao đây là old tank syndrome: bể đã chạy lâu, nitrate và khoáng từ nước máy tích dần, nên cá cũ còn sống nhưng cá chết lai rai. Việc bạn thay nước thường xuyên chưa chắc đã đủ nếu mỗi lần chỉ thay khoảng 10%, vì lượng ra ít hơn lượng thức ăn và phân sinh thêm mỗi tuần. Màu vàng nâu có thể do tannin từ lũa hoặc chất hữu cơ tích lại, và màu này tự nó thường không gây chết cá, nhưng nếu bể có amoniac hoặc nitrit thì cá sẽ chết thật. Mình chưa biết bể có lũa không, bể bao lâu và bạn thay bao nhiêu mỗi lần, nên hãy kiểm tra theo các bước sau.
> 1. Dùng bộ test để đo amoniac, nitrit, nitr…

**Plain** (3169 characters):

> Nước ngả vàng nâu kèm cá chết dần thường cho thấy **chất lượng nước đang xấu đi âm thầm**. Thay nước vẫn có thể không đủ nếu nguyên nhân nằm ở vi sinh trong lọc, lượng chất thải tích tụ, hoặc nước thay vào có vấn đề. Các nguyên nhân thường gặp:
> 
> ## 1. Chất hữu cơ phân hủy tích tụ
> - Cho ăn quá nhiều, thức ăn thừa thối rữa dưới nền.
> - Cá chết không được vớt kịp, lá cây hoặc cây thủy sinh mục.
> - Nền (sỏi, cát) bẩn, bùn đáy tích tụ, chỉ thay nước phía trên mà không hút đáy.
> 
> Đây là nguyên nhân phổ biến nhất. Chất hữu cơ phân hủy tạo ra **amoniac (NH₃) và nitrit (NO₂⁻)**, rất độc với cá dù nước tr…

### sick-06 · post · tie or split (7 · 7)

**Asked:** Bể cá rồng nhà em dùng hơn 20 năm bị rò nên phải thay bể mới. Từ hôm chuyển sang bể mới, 2 con cá rồng bỏ ăn luôn, được gần 1 tuần rồi. Cá mồi vẫn bơi trong bể mà rồng không chịu ăn. Em theo dõi thì 2 con vẫn bơi bình thường, chưa nằm đáy. Phải làm sao?

**Judge:** Y sát với chuyện thay bể mới hơn: nhắc mùi keo silicon, đưa khoảng nhiệt 26–30°C, gợi ý lá bàng, giun quế, dế mà người chơi ở Việt Nam dễ kiếm, và có mốc 2 tuần để đi khám. X gọn nhưng không có số nhiệt độ, lại bảo ngừng cho ăn trong khi cá đã bỏ ăn sẵn. / Cả hai đều đoán đúng nguyên nhân: cá bị stress khi chuyển bể và bể mới chưa có vi sinh. Y tốt hơn vì các bước ngắn gọn, đúng thứ tự, và bám sát chi tiết người hỏi kể: cá mồi bơi khỏe chưa chắc nước đã an toàn cho rồng. Y cũng dặn rõ khi nào là cấp cứu. Bù lại, X có ý hay khi nhắc kiểm tra mùi keo silicon của bể mới dán, nhưng X dài dòng hơn và gợi ý những thứ không cần, như thêm cây và lũa vào bể rồng.

**Ours lacks:** figures, tank-fit, diagnosis. **Plain lacks:** too-long, tank-fit.

**Ours** (read 3 pages, stopped at the tools limit):

> Nhiều khả năng cá đang bị sốc vì chuyển bể và nước bể mới chưa ổn định. Bể mới chưa có vi sinh đủ, nên amoniac hoặc nitrit có thể đang tích lại. Nhiệt độ lệch so với bể cũ cũng hay làm cá chán ăn. Cá vẫn bơi bình thường là tín hiệu tốt, nên bạn chưa cần hoảng, nhưng gần một tuần là đã dài, bạn nên kiểm tra nước ngay trong hôm nay.
> 1. Test amoniac, nitrit, nitrat và pH bằng bộ test nhỏ giọt. Nếu amoniac hoặc nitrit trên 0, bạn thay 30–50% nước bằng nước đã cùng nhiệt độ và đã khử clo, và làm lại sau 1–2 ngày.
> 2. Đo nhiệt độ bằng một nhiệt kế thứ hai để chắc chắn nhiệt kế đang dùng đúng. Nếu nư…

**Plain** (2409 characters):

> Cá rồng bỏ ăn sau khi chuyển bể là chuyện khá thường gặp, vì chúng rất nhạy với stress. Nếu cá vẫn bơi bình thường, không nằm đáy, không có triệu chứng bệnh thì thường chưa nguy hiểm ngay. Tuy vậy, gần 1 tuần là đã đáng lo, bạn nên xử lý theo các bước sau.
> 
> **1. Kiểm tra chất lượng nước trước tiên (quan trọng nhất)**
> - Bể mới có thể chứa chất độc từ keo silicon chưa khô hẳn, nhất là nếu bể mới dán xong vài ngày. Hãy ngửi thử, nếu còn mùi keo hắc thì rửa bể kỹ và thay nước nhiều lần.
> - Dùng bộ test (hoặc test strip) kiểm tra **amoniac (NH3/NH4+), nitrit (NO2-), nitrat (NO3-), pH**. Amoniac và …

### sick-06 · tank · ours wins (7 · 6)

**Asked:** Cá rồng của tôi bỏ ăn gần một tuần từ khi chuyển sang bể mới, làm sao?

**Judge:** Both answers name the new, uncycled tank as the likely cause. X is shorter, gives ordered steps, uses the Vietnamese term "chạy vi sinh", tells the keeper to fit the lid tightly, and gives a 2–3 day check. Y is longer, spends a lot of space on a generic list of disease signs, and ends with a block of questions. Neither suggests moving the filter media from the 20-year-old tank to speed up cycling. / Y chỉ ra ngay nguyên nhân khả dĩ nhất: bể mới mới chạy 1 tuần, chưa có vi sinh nên amoniac/nitrit tích lại. Y cũng nhắc chuyện cá vẫn bơi bình thường và đưa các bước theo thứ tự, kèm mốc theo dõi 2–3 ngày. X thì chung chung, dài, còn hỏi lại loại cá dù đã biết, nhưng có ưu điểm là nhắc chuyện hai con rồng có thể bắt nạt nhau. Cả hai đều bỏ sót mẹo dời vật liệu lọc từ bể cũ sang.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ nguyên nhân hay gặp nhất là cá đang stress vì đổi bể, và nước trong bể mới chưa ổn định nên amoniac hoặc nitrit có thể đang tích lại. Cá rồng vẫn bơi bình thường là dấu hiệu tốt, nhưng bỏ ăn gần một tuần thì bạn phải kiểm tra nước ngay. Cẩm nang ghi rằng cá rồng bỏ ăn thường do nước bẩn, lọc ngừng chạy, amoniac hoặc nitrit cao, nhiệt độ sai, hoặc vừa qua vận chuyển và đổi bể. Các bước làm như sau: 1. Test amoniac, nitrit, nitrat, pH và độ cứng bằng bộ test nhỏ giọt ngay hôm nay. 2. Nếu amoniac hoặc nitrit trên 0, hoặc nitrat trên 40 ppm, thay 30–50% nước bằng nước đã khử clo (nước m…

**Plain** (2200 characters):

> Cá rồng thường bỏ ăn vài ngày đến một tuần sau khi chuyển bể vì stress, nên chưa chắc là bệnh. Tuy vậy, gần một tuần là đã đáng lo, bạn nên kiểm tra các điểm sau:
> 
> **1. Kiểm tra chất lượng nước (quan trọng nhất)**
> - Dùng bộ test để đo **amoniac (NH₃/NH₄⁺), nitrit (NO₂⁻)** — cả hai nên bằng 0. Nếu có, thay 30–50% nước ngay và kiểm tra lại sau vài giờ.
> - Đo **nitrat**, nên dưới 20–40 ppm tùy loài.
> - Nhiệt độ thường khoảng 26–30°C, pH và độ cứng phù hợp với nguồn nước cũ. Nếu nước mới khác nhiều so với bể cũ, hãy chuyển dần.
> - Luôn khử clo trong nước máy trước khi dùng.
> - Bể mới chưa chu trình n…

### sick-07 · post · ours wins (7.25 · 5.75)

**Asked:** Em vừa lật bể, vứt nền sỏi nhỏ đi vì thấy bẩn quá, thì tự nhiên thấy 1 con bị như nấm trắng. Em đang tách riêng, cho ít muối hột vào xem có khỏi không. Như vậy đã đúng chưa, cần làm gì thêm?

**Judge:** X gắn được việc vứt nền với chuyện mất vi sinh và amoniac tăng, chẩn đoán nấm thủy mi kèm cách phân biệt với columnaris, và cho các bước rõ ràng. Y dàn trải sang bệnh Ich mà không nói gì về chu trình nitơ sau khi bỏ nền, dù Y viết tiếng Việt tự nhiên hơn và liều muối theo g/lít dễ dùng hơn. / Y nối đúng vết nấm với chuyện lật bể, vứt sỏi làm mất vi sinh, và nhắc phải phân biệt với columnaris, nên sát với bể của người hỏi hơn. X chẩn đoán lan sang đốm trắng (Ich) và cho rằng vứt sỏi \"không sao\". Đổi lại, X dùng con số gọn hơn và gợi ý được thuốc cụ thể có bán ở tiệm.

**Ours lacks:** local, figures. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng đây là nấm thủy mi (Saprolegnia), bệnh thường bám vào chỗ da hoặc vây đã bị xước hay yếu sẵn, và cẩm nang nói phần lớn ca nấm là bệnh thứ phát. Việc lật bể, bới sỏi làm nước đục và có thể làm tăng amoniac, cộng với cá bị va quệt, là những thứ dễ làm cá yếu đi. Tách cá ra là đúng. Muối hột với liều thấp cũng hợp lý, nhưng bạn cần làm thêm mấy việc sau.
> 1. Tách cá sang bể nhỏ có sục khí, nước đã ổn định, và không để chung với cá khác để tránh lây.
> 2. Pha muối theo mức nhẹ của cẩm nang: khoảng 1 muỗng canh muối cho 11,4 lít nước, hòa muối vào nước trước rồi mới đổ vào bể. Dùng muố…

**Plain** (2163 characters):

> Cách em đang làm là đúng: **tách riêng con bị bệnh** để tránh lây sang cả bể. Tuy nhiên, muối hột chỉ là bước đầu, em nên làm thêm mấy việc sau.
> 
> **1. Xác định bệnh**
> - Nếu các chấm trắng **nhỏ như hạt muối, rải khắp thân**, có thể là bệnh **đốm trắng (Ich)**. Bệnh này lây nhanh, và ký sinh trùng cũng đang nằm trong bể lớn.
> - Nếu là **mảng trắng như bông, xơ ra, thường ở vết thương**, có thể là **nấm**, thường do cá bị xước khi vệ sinh hoặc do nước kém.
> 
> **2. Cách xử lý trong bể tách**
> - **Muối:** dùng khoảng **1 muỗng cà phê muối hột (~5g) cho 5 lít nước**, hòa tan hoàn toàn trước khi cho cá…

### sick-07 · tank · plain wins (6 · 7)

**Asked:** Sau khi lật bể, một con cá của tôi bị nấm trắng, tách riêng và cho muối đã đủ chưa?

**Judge:** Y cho liều muối theo g/lít, nêu xanh methylene khi đúng là nấm, điều trị 5–7 ngày, thay nước hằng ngày sau khi lật bể. X giải thích nguyên nhân tốt và có phân biệt với columnaris, nhưng không có thuốc cụ thể nào ngoài muối, lại còn nói như thể muối hột là dùng sai. / X tách bạch đốm trắng (Ich) với nấm, đưa liều 2–3 g/lít, thời gian 5–7 ngày và việc kiểm tra NH3/NO2 sau khi lật bể, nên người nuôi dễ làm theo hơn. Y bám sát chuyện lật bể và có nhắc đến columnaris, nhưng liều muối tính theo đơn vị Mỹ và lời dặn không dùng muối biển lại mâu thuẫn với muối hột mà người nuôi đang dùng.

**Ours lacks:** plan, figures, local. **Plain lacks:** tank-fit.

**Ours** (read 2 pages):

> Tách riêng cá và cho muối là đúng hướng, nhưng chưa đủ. Nấm thủy mi thường chỉ bám vào chỗ da hoặc mang đã bị tổn thương, và việc lật bể rất dễ gây tổn thương đó (cá va quệt, stress) cùng làm đục nước, tăng chất hữu cơ. Vì vậy bạn phải xử lý cả nguyên nhân, không chỉ chữa con cá này. Cẩm nang cũng nói nấm không bao giờ hết hẳn trong bể, nên bệnh sẽ quay lại nếu điều kiện nước vẫn kém.
> 1. Hãy xem lại bể ngay: kiểm tra nhiệt độ, amoniac và nitrit, dọn chất hữu cơ, trứng chết và cặn đang phân hủy, rồi kiểm tra lại lưu thông nước và oxy. Nếu nước đang có amoniac hoặc nitrit, thay khoảng 30% nước …

**Plain** (1814 characters):

> Muối **có thể giúp nhưng thường chưa đủ** nếu bạn chỉ dựa vào muối. Trước hết, cần xác định bệnh và nguyên nhân.
> 
> **1. Xác định đúng bệnh**
> - **Đốm trắng nhỏ như hạt muối, rải khắp thân/vây** thường là bệnh đốm trắng (Ich). Đây là ký sinh trùng, không phải nấm thật.
> - **Lông bông trắng như bông, bám thành mảng** thường là nấm (Saprolegnia). Thường xuất hiện ở vết thương hoặc cá yếu.
> 
> **2. Cách xử lý cá đang bệnh**
> - Cách ly sang bể riêng (bể nhỏ, có sục khí, có lọc nhẹ).
> - **Muối:** dùng muối hồ chuyên dụng (không i-ốt), khoảng **2–3 g/lít** (tương đương 0,2–0,3%). Hòa muối vào nước trước rồi…

### sick-08 · post · plain wins (5 · 6.5)

**Asked:** Hồ mình đang có rêu tảo hại nên mình thử nuôi otto. Thả vào thì cá rất khỏe, bơi kiếm ăn (không quá manh động), nhưng sau một đêm 3 con chết hết, sáng ra thấy nằm im, đụng vào không nhúc nhích. Cùng lúc đó có một đàn neon trong bể vẫn bình thường mà otto thì chết. Vì sao vậy?

**Judge:** Y kể ra nhiều nguyên nhân thực tế hơn với otto ở Việt Nam: cá yếu ngay từ nguồn nhập, sốc khi thả, thuốc diệt rêu, clo trong nước máy. Y cũng có các bước kiểm tra cụ thể. X thì tập trung vào thiếu oxy dù neon trong cùng bể vẫn khỏe, lại còn khuyên chăm sóc "đàn otto còn lại" trong khi cả 3 con đã chết. Không bên nào nhắc tới nhiệt độ nước cao ở Việt Nam, một yếu tố quan trọng với otto. / X nêu đủ các nguyên nhân hay gặp nhất khi otto chết trong một đêm còn neon thì không sao: cá yếu từ lúc vận chuyển, thuần nước, dư thuốc diệt rêu, clo. X cũng có các bước xử lý, chỉ hơi dài. Y gọn và có trích nguồn, nhưng chăm chăm vào chuyện thiếu oxy, và còn khuyên chăm sóc "đàn otto còn lại" trong khi cả 3 con đã chết hết.

**Ours lacks:** diagnosis, tank-fit, local. **Plain lacks:** too-long, local, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng bể đang thiếu oxy hoặc có amoniac/nitrit tăng, và otto nhạy với điều này hơn neon. Cá otto thường yếu sau khi vận chuyển, và cá chết trong đêm hay gặp khi oxy hòa tan xuống thấp, vì ban đêm cây và rêu không còn quang hợp nên oxy giảm. Theo cẩm nang, oxy trên 5 mg/L là tốt nhất, dưới 5 mg/L cá bắt đầu stress và từ 4 mg/L trở xuống cá có thể chết. Amoniac hoặc nitrit cao, nhất là ở bể mới chưa chạy lọc sinh học ổn định, cũng làm cá yếu và chết dần. Mình chưa biết chắc, nên cần đo để xác định.
> 1. Ngay tối nay, đo amoniac, nitrit, pH và nhiệt độ (otto thích 21–26°C, pH 5,5–7,5); nế…

**Plain** (2403 characters):

> Otto là loài nhạy cảm nhất trong bể, nên thường là con đầu tiên chết khi nước có vấn đề. Neon khỏe hơn nên có thể chịu được điều kiện mà otto không chịu nổi. Cá nằm im ở đáy, không phản ứng khi chạm vào thường là dấu hiệu nhiễm độc hoặc sốc, không phải do bệnh truyền nhiễm thông thường. Các nguyên nhân hay gặp nhất:
> 
> 1. **Amoniac hoặc nitrit trong nước.** Đây là nguyên nhân phổ biến nhất. Nếu bể mới chưa chạy xong chu trình nitơ, hoặc vừa thả cá đông, vừa dọn bể mạnh, vừa thay nước không đều, nồng độ NH₃/NH₄⁺ và NO₂⁻ có thể tăng lên mức gây chết trong một đêm. Otto rất nhạy với hai chất này.
> …

### sick-08 · tank · ours wins (7 · 5.5)

**Asked:** Tôi thả cá otto ăn rêu mà sau một đêm chết hết trong khi neon vẫn khỏe, vì sao?

**Judge:** X tells the reader what to do right now: test ammonia and nitrite, check chlorine and copper, add aeration, and watch the neons. Y gives a fuller list of causes, including acclimation shock and copper from the shop, but has no steps for the tank as it is now and ignores that the tank already has algae. / Y cho các bước làm ngay (đo amoniac/nitrit, thay 50% nước, kiểm tra clo và đồng, tăng sục khí) và dặn theo dõi neon. X chỉ liệt kê nguyên nhân và cách phòng cho lần sau, chưa nói cần xử lý gì ngay cho bể đang có neon.

**Ours lacks:** diagnosis, tank-fit. **Plain lacks:** plan, follow-up, tank-fit.

**Ours** (read 2 pages):

> Cá otto (otocinclus) vốn yếu và nhạy với nước hơn neon. Chết qua đêm trong khi neon vẫn khỏe thường là do cá otto đã yếu từ lúc mua hoặc vận chuyển, hoặc do một thay đổi nhỏ về nước (amoniac, nitrit, clo, đồng, oxy) mà neon chịu được còn otto thì không. Cẩm nang chưa cho biết chắc nguyên nhân nào, nên mình chỉ đoán từ chi tiết bạn kể. Bạn làm theo các bước sau:
> 1. Đo ngay amoniac, nitrit, pH và nhiệt độ bể. Nếu amoniac hoặc nitrit có số đo cao, thay ít nhất 50% nước và ngưng cho ăn một hai ngày.
> 2. Nếu bạn dùng nước máy, kiểm tra đã khử clo chưa. Clo gây hại từ 0,02 mg/L và giết cá từ 0,04 mg…

**Plain** (2010 characters):

> Cá otto (*Otocinclus*) chết sau một đêm trong khi neon vẫn khỏe thường do một số nguyên nhân sau:
> 
> 1. **Cá yếu sẵn từ cửa hàng.** Otto hay được nhập khẩu và vận chuyển đường dài, thường bị đói, stress và suy kiệt. Nhiều con đã yếu khi bạn mua, nên chỉ cần một thay đổi nhỏ cũng đủ làm chúng chết.
> 
> 2. **Sốc môi trường khi thả.** Otto nhạy cảm với thay đổi nhiệt độ, pH, độ cứng nước hơn neon. Nếu bạn thả thẳng từ túi nilon vào bể mà không thuần hóa (nhỏ nước bể vào túi từ từ khoảng 30–60 phút), chênh lệch nhiệt độ và pH có thể gây sốc.
> 
> 3. **Bể mới chưa chu trình nitơ (cycling).** Đây là nguyên …

### sick-09 · post · plain wins (4 · 7.75)

**Asked:** Nhà mình có bể cá ngoài trời 3x1,5m, sâu có 30 phân, đáy lát đá hoa, có hệ thống lọc nước và hút đáy, thêm 1 bơm nước tạo oxy. Trước mua koi về được mấy hôm là lăn ra chết, thế là thả cá chép cho khỏe, mà nay 6-7 con lại chết. Trời đang lạnh ngắt, mình không có dụng cụ đo oxy, không biết do trời lạnh hay sao. Bể này bố mình làm, trước có thả hoa súng nhưng cá rỉa hết. Bắt bệnh giúp mình, nên sửa lọc thế nào, có cần đào sâu thêm không, đáy lát đá hoa có ổn không?

**Judge:** X đổ lỗi chính cho thiếu oxy vì lạnh, mà nhận định này sai về mặt khoa học. X cũng đính kèm đoạn hướng dẫn chọn sưởi không dùng được cho hồ ngoài trời. Y nói đúng các nguyên nhân hay gặp: amoniac/nitrit tăng khi vi sinh trong lọc yếu đi lúc trời lạnh, bệnh do cá mới mang vào (có cả KHV), và mật độ cá quá đông. Y cũng có các bước làm ngay và trả lời đủ chuyện độ sâu, đáy đá hoa và hoa súng, chỉ hơi dài. / X nói đúng về oxy khi trời lạnh, cảnh báo được KHV và ký sinh trùng do cá mới mang vào, đưa ra các bước rõ ràng và trả lời đủ chuyện độ sâu, đá hoa, hoa súng. Y nói sai rằng nước lạnh giữ oxy kém, phần trích về sưởi thì lạc đề, còn lời khuyên sửa lọc quá sơ sài.

**Ours lacks:** wrong, too-thin, diagnosis. **Plain lacks:** too-long.

**Ours** (read 3 pages, stopped at the time limit):

> Nhiều khả năng cá chết do thiếu oxy và sốc khi chuyển nước lạnh, kết hợp với bể nông 30 cm quá tải, chứ chưa chắc do bệnh. Trời lạnh nước giữ oxy kém, cá vừa đi chuyển nên yếu, lại thêm cá chết phân hủy làm amoniac tăng. Bạn nên làm ngay: 1. Chạy bơm tạo oxy 24/24 và để mặt nước xao động. 2. Vớt hết cá chết ngay, ngừng cho ăn trong lúc trời lạnh. 3. Thử amoniac và nitrit bằng que thử rẻ tiền, nếu cao thì thay khoảng 20 phần trăm nước bằng nước đã khử clo và cùng nhiệt độ. 4. Nuôi cá mới riêng vài tuần trước khi thả chung. Bể 3x1,5x0,3 m chỉ khoảng 1,35 khối, koi cần khoảng 1000 lít mỗi con, n…

**Plain** (4418 characters):

> Bể của bạn có nhiều điểm rủi ro cùng lúc, nên khả năng cao không phải chỉ do trời lạnh. Mình chưa thấy cá nên không chắc chắn được, nhưng có vài nguyên nhân chính cần kiểm tra.
> 
> ## Nguyên nhân có thể
> 
> 1. **Chất lượng nước xấu, nhất là amoniac/nitrit.** Đây là nghi ngờ hàng đầu. Khi nước dưới 12-15°C, vi khuẩn lọc sinh học gần như ngừng hoạt động, thức ăn thừa và phân cá phân hủy làm amoniac tăng vọt. Bể 1,35 m³ với 6-7 con cá chép/koi là khá đông, và bể nông làm nước biến động nhanh.
> 2. **Ký sinh trùng hoặc bệnh do cá mới mang vào.** Koi và cá chép cùng loài nên dễ lây bệnh cho nhau. Cần loại…

### sick-09 · tank · plain wins (3 · 5)

**Asked:** Cá trong bể tôi thả vào mấy hôm là chết, trời lạnh lại chết thêm, do đâu?

**Judge:** Không câu nào biết đây là hồ koi ngoài trời, sâu 30 cm. Y nêu đúng các nguyên nhân dễ xảy ra hơn (hồ chưa chín, vi khuẩn chậm lại khi lạnh, bệnh mang vào, cho ăn quá nhiều) và có các bước xử lý dùng được. X thì chẩn đoán old tank syndrome, không khớp tình huống, lại khuyên dùng sưởi 1 W/lít, không thực tế. / Không câu nào dùng chi tiết hồ koi ngoài trời nông 30 cm. X liệt kê đủ các nguyên nhân hợp lý hơn (bể chưa chín, bệnh theo cá mới, cách ly, sốc nhiệt). Y khẳng định chắc old tank syndrome mà không có căn cứ, và khuyên sưởi 1 W/lít không hợp với hồ koi.

**Ours lacks:** wrong, diagnosis, tank-fit. **Plain lacks:** tank-fit, too-long.

**Ours** (read 2 pages, stopped at the time limit):

> Nguyên nhân hay gặp nhất là bể đã chạy lâu, nitrate và khoáng tích dần, nên cá mới thả vào dễ chết sau vài ngày, còn cá cũ vẫn khỏe. Trời lạnh làm nước đổi nhiệt và thiếu oxy, khiến cá yếu hơn. Mình chưa chắc đây là nguyên nhân duy nhất, nên bạn nên kiểm tra trước.
> 1. Test nước ngay: amoniac, nitrit, nitrate và pH. Nếu amoniac hoặc nitrit khác 0 thì bể chưa ổn định.
> 2. Thay 30% nước bằng nước đã khử clo, cùng nhiệt độ với bể.
> 3. Giữ nhiệt ổn định, khoảng 1 W cho mỗi lít nước, đặt sưởi ở chỗ nước chảy tốt.
> 4. Thêm sủi khí và đậy nắp để giữ nhiệt và oxy.
> 5. Thả cá mới từ từ, sau khi đã kiểm tra…

**Plain** (2494 characters):

> Cá chết vài ngày sau khi thả, và chết nhiều hơn khi trời lạnh, thường do mấy nguyên nhân chính sau:
> 
> **1. Chất lượng nước kém (thường gặp nhất)**
> - **Bể chưa "chín" (chưa chu trình nitơ):** Bể mới hoặc mới thay nhiều nước thường chưa có vi khuẩn có ích để phân hủy amoniac (NH₃) và nitrit (NO₂⁻) do cá thải ra và thức ăn thừa. Amoniac và nitrit tích tụ sẽ đầu độc cá trong vài ngày. Cá chết sau khi thả thêm là dấu hiệu rất điển hình.
> - **Cách kiểm tra:** Dùng bộ test kit để đo NH₃/NH₄⁺, NO₂⁻, NO₃⁻, pH. Với bể đã chín, NH₃ và NO₂⁻ phải gần 0.
> - **Trời lạnh làm tệ thêm:** Nhiệt độ thấp làm vi khuẩ…

### stocking-01 · post · ours wins (7 · 3)

**Asked:** Em mới tập chơi lại bể cá. Ban đầu hỏi loại nào dễ nuôi, khỏe thì được tư vấn mua 2 cá vàng, 2 con bống (bảo nó ăn phân thừa) và 2 con dọn bể. Được vài hôm 1 con cá vàng chết, nghi đánh nhau. Em mua thêm 10 con 7 màu bé thả vào, vài hôm còn 9, 8 rồi 7 mà không thấy xác. Lạ nhất là 1 con 7 màu bụng to như chửa cũng biến mất. Hôm qua 1 con bống chết, nay con dọn bể chết và mất thêm 2 con 7 màu. Con bống với con dọn bể còn nửa xác, thấy con bống còn lại thỉnh thoảng rỉa. Có phải chúng đánh nhau và con to ăn con bé không? Vậy chỉ được thả cá sàn sàn nhau thôi à?

**Judge:** X đưa ra nguyên nhân hợp lý: con bống ăn thịt, kèm việc nuôi lẫn cá vàng với cá nhiệt đới. X cũng có các bước ngắn gọn, làm được ngay. Y dài và có sai sót nghiêm trọng: gọi cá 7 màu là cichlid hung dữ, và đổ lỗi cho chính cá 7 màu ăn đồng loại. / Y chỉ đúng thủ phạm hợp lý nhất (con bống ăn cá nhỏ và rỉa xác, cá vàng nước lạnh không hợp nuôi chung) và đưa ra các bước rõ ràng: vớt xác, bắt bống ra, tách cá vàng. X dài, tự mâu thuẫn và sai nặng khi gọi cá 7 màu là cichlid hung dữ, một ý sai đi thẳng vào câu hỏi 'con to ăn con bé' của người hỏi.

**Ours lacks:** follow-up, figures, diagnosis. **Plain lacks:** wrong, too-long, plan.

**Ours** (read 0 pages, stopped at the time limit):

> Có khả năng cao là con bống ăn thịt cá nhỏ và xác cá, nên cá 7 màu và dọn bể mất dần. Cá vàng là cá nước lạnh, khác với cá 7 màu và dọn bể nhiệt đới, nên nhốt chung cũng làm cá yếu và dễ chết.
> 1. Vớt hết xác cá ngay, vì xác thối làm bẩn nước.
> 2. Đo amoniac và nitrit. Nếu có số đo, thay khoảng 30% nước bằng nước đã khử clo.
> 3. Bắt con bống còn lại ra khỏi bể.
> 4. Tách cá vàng sang bể riêng, vì nó cần nước mát hơn.
> 5. Cho cá 7 màu và dọn bể ăn đủ, nhưng đừng cho dư thức ăn.
> Theo dõi hằng ngày. Nếu cá bỏ ăn, thở gấp hoặc có đốm trắng, hãy báo lại để mình xem tiếp.
> 
> [Gợi ý hỏi tiếp] Cá vàng nuôi c…

**Plain** (3406 characters):

> Có thể bạn đang gặp **nhiều vấn đề cùng lúc**, trong đó **chất lượng nước** là nguyên nhân dễ bị bỏ qua nhất. Cá đánh nhau và ăn nhau có thể là hệ quả, không phải nguyên nhân gốc.
> 
> ## 1. Nguyên nhân có khả năng cao nhất: nước bẩn/độc
> 
> Bể mới chạy vài tuần, chưa ổn định vi sinh, cộng với việc thả thêm 10 con rồi 2 con bống, 2 con dọn, nên amoniac và nitrit rất dễ tăng vọt. Cá chết dần dần, nhất là khi con nhỏ yếu trước, rất giống triệu chứng này. Dấu hiệu gồm: cá bơi lờ đờ, ngoi đầu lên mặt nước, mang đỏ hoặc thâm, nước đục hoặc có mùi hôi.
> 
> **Việc nên làm ngay:**
> - Mua bộ test nước (amoniac, …

### stocking-01 · tank · ours wins (7 · 5)

**Asked:** Bảy màu trong bể tôi cứ biến mất không thấy xác, có phải bị cá khác ăn không?

**Judge:** X is the better answer. It uses this tank's actual fish and points to the likely cause: the goldfish eat the guppies and the gobies pick the bodies clean. Its steps come in order, though it makes up the 'leopard' species and blames the pleco too much. Y gives a generic list of causes, names fish this tank doesn't have, and ends by asking for details the app already holds. / Y dùng đúng thông tin bể của bạn: cá vàng có thể ăn bảy màu và cá con, còn bống rỉa xác nên không thấy xác cá. Y đưa ra các bước làm theo thứ tự, nhưng tự đoán thêm tên loài cá dọn bể và quy cho nó tội ăn cá. X đúng về lý thuyết nhưng nói chung chung cho mọi bể, rồi hỏi lại những thông tin mà Y đã sử dụng.

**Ours lacks:** figures. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 2 pages, stopped at the tools limit):

> Rất có thể cá bảy màu bị các cá lớn trong bể ăn, vì bể bạn có cá vàng và cá tỳ bà leopard, hai loài đều có thể ăn cá bảy màu. Bống trong bể cũng hay rỉa xác nên xác cá có thể biến mất rất nhanh. Nếu bảy màu đang đẻ, cá con mới sinh cũng dễ bị ăn hết mà không để lại dấu vết. Cẩm nang cũng cho biết cá lớn thường ăn cá con mới đẻ nếu không có chỗ trốn hoặc không tách ra.
> 1. Trong 1 đến 2 ngày tới, đếm số cá bảy màu mỗi buổi tối để biết chính xác con nào mất và mất vào lúc nào.
> 2. Nếu có thể, chuyển cá vàng và cá tỳ bà leopard sang bể khác, vì hai loài này không hợp nuôi chung với bảy màu.
> 3. Trồ…

**Plain** (1811 characters):

> Cá bảy màu (guppy) thường nhỏ và mỏng manh, nên việc biến mất không để lại xác có thể có nhiều nguyên nhân. Bị cá khác ăn là một khả năng, nhưng không phải duy nhất.
> 
> **Các nguyên nhân thường gặp:**
> 
> 1. **Cá lớn hoặc cá hung dữ trong bể:** Cichlid, cá betta, cá la hán, cá sặc hoặc cá chép có thể ăn cá bảy màu, đặc biệt là cá con. Cá lớn thường nuốt chửng cá nhỏ rất nhanh.
> 2. **Cá lớn ăn cá con:** Nếu bể có cá bảy màu trưởng thành, chúng có thể ăn cá con của chính mình. Nếu bạn không thấy cá con, đây là nguyên nhân rất phổ biến.
> 3. **Cá chết rồi bị ăn hoặc phân hủy:** Cá chết có thể bị cá khác…

### stocking-02 · post · tie or split (5.5 · 5.5)

**Asked:** Hồ em 60x40x40, được 1 tuần, đang thả 5 mún + 5 chuột, cá đang tung tăng tốt. Em tính thả thêm 40 neon nữa vậy có nhiều không? Mún có sống chung với neon được không?

**Judge:** X thinks mún is a molly, so it gets the size limit wrong and wrongly says mún and neons don't get along. Y's advice is reasonable: wait for the tank to cycle, keep 15–25 neons and add them in batches. Y's weak point is not knowing that mún means platy, which is a peaceful fish that lives well with neons. / Y correctly reads mún as molly, warns that the 1-week tank isn't cycled yet, and gives a clear plan with water tests. It is too strict about molly and neon water needs and about how many neons to add. X doesn't know what mún is and has to ask, so it misses half of what the hobbyist asked.

**Ours lacks:** wrong, local, figures. **Plain lacks:** local, diagnosis, tank-fit, asks-only.

**Ours** (read 1 pages, stopped at the tools limit):

> Mình thấy có ba điểm cần lưu ý trước khi thả thêm cá. Thứ nhất, bể mới chạy được 1 tuần nên chu trình nitơ có thể chưa ổn định, thả thêm lúc này dễ làm amoniac và nitrit tăng. Thứ hai, 40 neon là quá nhiều cho bể 96 lít. Thứ ba, mún (molly) và neon thường không hợp nhau vì molly cần nước cứng, kiềm, còn neon cần nước mềm, hơi axit. Theo cẩm nang, molly cần nước pH 7–8,5 và độ cứng 15–30 dGH, nhiệt độ 21–28 °C, và bể nên khoảng 90 cm, nên bể 60 cm của bạn đã hơi chật cho 5 mún.
> 1. Trước tiên, mỗi ngày hoặc vài ngày một lần, test amoniac và nitrit; khi cả hai về 0 liên tục khoảng 2 tuần thì bể …

**Plain** (1680 characters):

> Tank 60x40x40 (khoảng 90-96 lít) nuôi được neon, nhưng **40 con là hơi nhiều**, và **hồ mới 1 tuần thì chưa nên thả thêm cá**.
> 
> **1. Hồ mới 1 tuần chưa ổn định**
> Hồ thường cần 4-6 tuần để vi khuẩn có lợi phát triển đủ, tức là chu trình đạm (nitrogen cycle) hoàn chỉnh. Nếu thả thêm lúc này, amoniac và nitrit có thể tăng cao và gây chết cá. Trước khi thả, bạn nên test amoniac, nitrit và nitrat. Khi amoniac và nitrit đều về 0 và nitrat có mặt, hồ đã chạy ổn.
> 
> **2. Số lượng neon**
> - Neon nên nuôi theo đàn, tối thiểu 6 con, lý tưởng 10-20 con trở lên.
> - Với hồ khoảng 90 lít, khoảng **15-25 con** l…

### stocking-02 · tank · ours wins (5.5 · 4)

**Asked:** Bể của tôi thả thêm 40 con neon có nhiều quá không, nuôi chung với mún được không?

**Judge:** X uses the real tank and gives the right answer: 40 is too many, aim for 15–20, and the fish can live together. It does muddle the platy/mún naming and skips the one-week cycling risk. Y is generic, asks for details the app already holds, and calls angelfish 'ông tiên (otocinclus)', which could lead them to buy a fish that eats neons. / Y uses the real tank (about 96 L) and gives a sensible 15–20 neons, but it has made-up figures, contradicts itself about mún and leaves out the 1-week cycling risk. X is generic, doesn't know mún is platy, and wrongly calls cá ông tiên otocinclus when angelfish would eat the neons.

**Ours lacks:** follow-up, plan, local, figures. **Plain lacks:** tank-fit, wrong, too-long, local, asks-only.

**Ours** (read 1 pages):

> Nuôi chung được: nước có khoảng chung, kích thước và tính cách hợp nhau. Nhưng 40 con neon là quá nhiều cho bể 60 × 40 × 40 cm (khoảng 96 lít): với 5 platy và 5 chuột đồng thì bể đang ở mức 195% so với sức chứa, tức là quá tải. Cá neon xanh là loài đàn, nên bạn nên thả khoảng 15–20 con (đàn tối thiểu là 6 con theo cẩm nang) thay vì 40 con. Với 40 con, bể sẽ dễ bẩn nước, nhiều amoniac và nitrit hơn, và cá dễ stress. Về chuột đồng, cẩm nang ghi loài này cần bể dài từ 80 cm, nên bể 60 cm hiện tại chưa đủ chỗ cho chúng. Mình không tìm thấy cá nào tên "mún" trong cẩm nang; nếu bạn đang nói đến một…

**Plain** (1490 characters):

> Với neon, **40 con thường không quá nhiều nếu bể đủ lớn**, vì chúng là loài sống thành đàn và càng đông thì càng khỏe, ít stress. Bạn cần xem các yếu tố sau:
> 
> **1. Dung tích bể**
> - Tham khảo nhanh: mỗi con neon cần khoảng 2-3 lít nước. Vậy 40 con cần khoảng **100-120 lít trở lên**.
> - Nếu bể chỉ khoảng 60 lít trở xuống thì 40 con là quá tải, nên giảm xuống khoảng 15-20 con.
> 
> **2. Lọc và thay nước**
> - Lọc phải đủ công suất cho bể, nên chọn lọc chạy được lớn hơn dung tích bể một chút.
> - Thay khoảng 20-30% nước mỗi tuần, vì đàn đông thì chất thải nhiều hơn.
> 
> **3. Chất lượng nước**
> - Kiểm tra amon…

### stocking-03 · post · plain wins (5.5 · 7.5)

**Asked:** Em mới kiếm được cái bể kích thước 35x20x22cm, chưa chơi bao giờ. Nên nuôi loại cá nào cho đẹp, dự định 1 tuần thay nước 1 lần? Có cần mua lọc và sục khí cho bể không?

**Judge:** Y gợi ý nuôi betta, có thể thêm tép cherry, rất hợp bể 15 lít và hợp với người mới ở Việt Nam. Y cũng dặn chạy bể 3–4 tuần, cho mức thay nước, cách cho ăn và giá bộ test sát thực tế. X tự mâu thuẫn ở thẻ loài (ghi bể từ 45 cm), đưa ra quy tắc 2 lít/con không có lọc tự bịa, và chỉ cho chạy bể 1–2 tuần, quá ngắn. / X gợi ý đúng những loài dễ nuôi, dễ mua ở VN cho bể 35cm (betta, tép cherry), chạy bể 3–4 tuần và trả lời rõ chuyện lọc với sục khí. Y có các bước làm rõ ràng hơn, nhưng lại đưa ra quy tắc không lọc tự đặt, gợi ý loài mà chính thẻ loài của nó ghi là cần bể 45cm, và kể nhiều loài nano đắt, khó kiếm.

**Ours lacks:** tank-fit, wrong, local. **Plain lacks:** plan, follow-up.

**Ours** (read 4 pages, stopped at the tools limit):

> Bể 35x20x22 cm chỉ khoảng 15 lít, nên bạn nên chọn cá nano nhỏ và chạy bể có lọc nhẹ, chưa thả cá ngay. Theo cẩm nang, cá nano đẹp và hợp bể nhỏ gồm cá ngân hà (Celestial Pearl Danio), cá rasbora ớt, cá tetra lửa (ember tetra, khoảng 2 cm, màu cam đỏ, nuôi đàn), cá neon xanh và cá chuột lùn (Pygmy Corydoras, khoảng 2,5 cm, nuôi đàn ở tầng đáy). Với bể 15 lít, mình gợi ý chọn một loài đàn như tetra lửa, khoảng 6 con, hoặc chuột lùn 5 đến 6 con, không nuôi lẫn quá nhiều loài. Cẩm nang theo quy tắc khoảng 2 lít nước cho một con cá nhỏ khi không có lọc, nên bể này chỉ nên có khoảng 6 con nếu khôn…

**Plain** (2254 characters):

> Bể 35x20x22cm chứa khoảng **15 lít**, khá nhỏ nên bạn cần chọn cá ít và đơn giản, đồng thời chăm kỹ hơn bể lớn.
> 
> ## Nên nuôi gì?
> 
> **1. Betta (cá chọi/cá xiêm đực) – 1 con**
> - Đẹp nhất trong nhóm cá nhỏ, nhiều màu và kiểu vây.
> - Chỉ nuôi **một con mỗi bể**, vì hai con đực sẽ đánh nhau.
> - Thích nước yên, không chảy mạnh. Nên có sưởi nếu nhiệt độ phòng dưới 24°C.
> 
> **2. Tép cảnh (tép cherry, tép ngọc, tép Nhật)**
> - Nhỏ, màu sắc đẹp, nhiều con trông rất sinh động.
> - Ăn rêu và thức ăn thừa, giúp bể sạch hơn.
> - Rất nhạy với nước, nên chỉ thả khi bể đã ổn định.
> 
> **3. Nhóm cá nhỏ như cá bảy màu hoặc c…

### stocking-03 · tank · ours wins (7 · 4)

**Asked:** Bể tôi nên nuôi cá gì, bao nhiêu con, có cần lọc và sục khí không?

**Judge:** X dùng đúng kích thước bể (~15 lít), trả lời thẳng là cần lọc bọt biển kèm sục khí, và đưa ra các bước theo thứ tự (cycling, thả cá từ từ, thay nước). Chỗ yếu là có gợi ý cá hơi to so với bể. Y không biết kích thước bể nên hỏi lại, rồi đưa hướng dẫn chung cho mọi cỡ bể, người mới khó biết phải làm gì trước. / Y tính đúng bể khoảng 15 lít. Y cũng giải thích việc cần lọc và sục khí rõ ràng, chỉ cách chạy vi sinh (cycling), thay nước và cho ăn theo thứ tự, dù gợi ý harlequin là quá lớn so với bể và chưa tính tới cái nóng ở Việt Nam. X không dùng thông tin về bể mà hỏi lại kích thước, rồi đưa ra hướng dẫn chung cho mọi cỡ bể.

**Ours lacks:** figures, local. **Plain lacks:** tank-fit, asks-only, plan, too-long.

**Ours** (read 4 pages, stopped at the tools limit):

> Với bể 35 x 20 x 22 cm (khoảng 15 lít), bạn nên nuôi một đàn cá nhỏ, bơi đàn, và nên có lọc. Bể nhỏ bẩn nhanh, nên lọc và sục khí là cần thiết chứ không thừa. Cẩm nang cho biết lọc bọt biển chạy bằng khí nên bắt buộc có máy sục khí, còn lọc treo chạy bằng mô tơ điện thì không cần. Với người mới, lọc bọt biển chạy máy sục khí là lựa chọn dễ dùng và êm.
> 1. Chọn cá nhỏ bơi đàn như cá neon xanh, cá tetra lửa (chỉ khoảng 2 cm, hợp bể nano) hoặc cá hồng nhung (harlequin rasbora). Nuôi ít nhất 6 đến 8 con cùng loài để cá đỡ stress.
> 2. Mua một lọc bọt biển cỡ nhỏ cho bể 15 lít, kèm máy sục khí loại v…

**Plain** (1957 characters):

> Để gợi ý chính xác, bạn cho mình biết **kích thước bể** (dài × rộng × cao, hoặc số lít), và bạn muốn **nước ngọt hay nước mặn**. Trong lúc chờ, đây là hướng dẫn chung.
> 
> ## Lọc và sục khí
> 
> - **Lọc: nên có.** Lọc giúp duy trì vi sinh có lợi, phân hủy chất thải và amoniac (chất độc với cá). Gần như mọi bể cá đều cần lọc.
> - **Sục khí: không bắt buộc nhưng nên có** nếu bạn nuôi nhiều cá, nuôi cá cần nhiều oxy, hoặc nhiệt độ phòng cao. Nếu bể có cây thủy sinh, lọc tạo dòng chảy và bề mặt nước xao động thì có thể không cần sục khí thêm.
> 
> ## Số lượng cá
> 
> Quy tắc tham khảo: **khoảng 1 cm cá trưởng thà…

### stocking-04 · post · ours wins (6 · 4)

**Asked:** Em thích con cá bống vàng vì nó khá sinh động (lúc núp dưới đá, lúc đậu trên cây, trên đá) và dọn bể rất sạch, từ ngày nuôi không phải cạo rêu thành bể nữa, cũng chả cần cho ăn gì mà vẫn sống. Nuôi loại gì chung với bống này được? Trước em nuôi mún, rồi kiếm, rồi cá bảy màu, đều cứ chết dần, không biết có phải bị con bống xử không?

**Judge:** X is better. It correctly says the algae-eating bống vàng latches onto other fish and sucks their slime coat as it grows, which is most likely why the mún, kiếm and bảy màu kept dying. X is short, though, and its tankmate advice is for the wrong species. Y gives a longer step-by-step plan, but it treats the fish as a goby that eats small fish and misses the real cause. / Y nhận ra đúng con 'bống vàng' ăn rêu là cá mút đá, lớn lên hay mút nhớt cá khác, và khuyên bắt riêng nó ra. Đây là nguyên nhân thật khiến mún, kiếm, bảy màu chết dần. X tuy dài và có các bước làm, nhưng coi nó là bống ăn cá, chẩn đoán sai và còn gợi ý nuôi chung những cá nhỏ dễ bị mút nhớt.

**Ours lacks:** plan, follow-up, too-thin, figures. **Plain lacks:** diagnosis, too-long, wrong.

**Ours** (read 2 pages, stopped at the time limit):

> Nhiều khả năng là con bống vàng đã lớn và quấy, hay bám vào cá khác để mút nhớt, nên các con nhỏ yếu dần; cẩm nang ghi đúng hiện tượng này với bống vàng. Bạn nên bắt riêng bống ra, quan sát xem cá có vết trầy, đốm trắng hay bơi lờ đờ không, rồi kiểm tra nước (amoniac, nitrit) vì bể không cạo rêu và không cho ăn lâu ngày có thể bẩn nước. Về bạn cùng bể, với bống đế vương cẩm nang khuyên tránh cá betta, neon xanh và tép red cherry. Bạn nói rõ tên khoa học hoặc ảnh con bống vàng để mình xem kỹ hơn nhé.
> 
> [Gợi ý hỏi tiếp] Con bống vàng của bạn là loài nào, bạn có ảnh không? · Bể nên thả thêm cá gì…

**Plain** (2151 characters):

> Bống thường hiền với cá cùng cỡ, nhưng có vài loại hay giành lãnh thổ hoặc ăn cá con, nên cần xem lại một số thứ trước khi thêm cá mới.
> 
> **Có thể bống xử cá không?**
> Có khả năng, nhưng thường không phải nguyên nhân chính. Bống chủ yếu ăn đáy và ăn cá nhỏ, nên các con như cá con, cá bảy màu nhỏ hoặc cá mún dễ bị ăn. Cá trưởng thành thì ít bị bống giết trực tiếp, trừ khi bống hung dữ hoặc cá kia yếu.
> 
> **Nguyên nhân dễ xảy ra hơn cần kiểm tra:**
> - **Thiếu thức ăn:** Nếu bể gần như không cho ăn, bống có thể sống nhờ rêu, vi sinh, ấu trùng hoặc thức ăn tự nhiên trong bể. Cá khác như mún, kiếm, bảy…

### stocking-04 · tank · ours wins (6.5 · 3.5)

**Asked:** Bể tôi nuôi chung được những cá nào, khi cá thả thêm cứ chết dần?

**Judge:** X is the better answer for this hobbyist. It uses their tank details (the bống vàng, the mún, kiếm and bảy màu that died, the bống not being fed) and gives clear steps in order, though it guesses old tank syndrome without evidence and misses that an algae-eating bống vàng may be attacking the other fish. Y is generic, asks for details the app already has, and recommends bảy màu, which have already died in this tank. / Y dựa vào ghi chú của bể (mún, kiếm, bảy màu đều chết dần; bống không được cho ăn), đưa ra nguyên nhân có thể đúng và các bước làm theo thứ tự, gồm cả việc cho bống ăn thêm. X dài, chung chung, hỏi lại những thông tin app đã có, gợi ý lại cả bảy màu dù cá này đã chết dần, và sai khi nói tiger barb ít hung dữ.

**Ours lacks:** diagnosis, figures. **Plain lacks:** tank-fit, too-long, diagnosis.

**Ours** (read 1 pages, stopped at the calls limit):

> Mình đoán nguyên nhân chính là bể đã chạy lâu mà ít thay nước, nên nitrate và khoáng tích dần, cá mới thả vào sẽ yếu và chết dần (hội chứng bể cũ, old tank syndrome). Mún, kiếm và bảy màu đều chết dần đúng kiểu đó. Thêm một điều: bống của bạn chỉ ăn rêu thành bể mà không được cho ăn, nên có thể nó đang thiếu thức ăn và cũng yếu dần. Trong cẩm nang, mình không tìm thấy trang nào về cá bống vàng, nên chưa thể nói bống này nuôi chung được với cá nào. Bạn làm theo các bước sau:
> 1. Thử nước bằng bộ test: amoniac, nitrit, nitrate, pH và độ cứng. Ghi lại để so sánh sau này.
> 2. Thay khoảng 30% nước m…

**Plain** (2198 characters):

> Cá chết dần mỗi khi thả thêm thường do **chất lượng nước**, không phải do bản thân loài cá. Bạn cho mình biết thêm **dung tích bể, loài cá đang nuôi, và cá chết trong bao lâu sau khi thả** để chẩn đoán chính xác hơn. Trong lúc đó, bạn có thể tham khảo:
> 
> ## 1. Nguyên nhân hay gặp nhất
> 
> - **Nước chưa ổn định (chưa chu trình nitơ):** Cá thải amoniac, nếu bể chưa có vi khuẩn có lợi để phân huỷ thì amoniac và nitrit tăng cao, gây chết. Mỗi lần thả thêm cá mà không kiểm soát được thì tải lượng chất thải tăng đột ngột và cá cũ cũng bị ảnh hưởng.
> - **Quá tải (quá nhiều cá):** Bể nhỏ mà nuôi nhiều cá …

### stocking-05 · post · plain wins (6.25 · 7.25)

**Asked:** Em mới mua thêm mấy con cá chép thả chung với cá vàng, mà nó tấn công cá vàng kinh quá, một con chết rồi. Hỏi cửa hàng thì họ bảo thả chung được em mới mua. Giờ em nên làm sao, chép với cá vàng có nuôi chung được không?

**Judge:** Both answers say to separate the fish and change the water. I'd rather the hobbyist got Y. It covers both common carp and koi, suggests returning the fish to the shop, gives a reasonable salt dose for the injured goldfish (1–2 g/lít) and asks about tank size. Its Vietnamese also sounds more like how hobbyists here talk. X assumes the fish is koi, and its guide-based content doesn't fit this case well. / Hai câu trả lời đều khuyên tách chép ra, kiểm tra cá vàng và thay nước. X tự nhiên hơn, có ghi liều muối hạt 1–2 g/lít, gợi ý đổi trả với cửa hàng và hỏi lại loại chép, kích thước bể. Y có nguồn cẩm nang và thời gian theo dõi 1–2 tuần, nhưng lại mặc định đó là koi và khuyên dùng hồ ngoài trời, khó áp dụng.

**Ours lacks:** tank-fit, local, diagnosis. **Plain lacks:** tank-fit, diagnosis, follow-up.

**Ours** (read 2 pages, stopped at the tools limit):

> Mình nghĩ lời cửa hàng chưa đúng. Cá chép koi là loài lớn, dài tới khoảng 90 cm, cẩm nang ghi mỗi con cần ít nhất khoảng 1000 lít nước, và chúng chỉ hợp với hồ ngoài trời rộng. Cá chép ăn tạp, kiếm ăn dưới đáy và rất khỏe, còn cá vàng bơi chậm, vây dài nên dễ bị cắn, nhất là khi bị stress hay tranh ăn. Trong bể thường thì hai loài này không nên nuôi chung, nên việc con chép cắn cá vàng là điều dễ xảy ra. Cẩm nang cũng khuyên không nuôi chung cá vàng với loài nhỏ mà chúng có thể nuốt, và cá vàng nên ở cùng các loại cá vàng khác.
> 1. Vớt cá chép ra ngay và chuyển sang hồ hoặc bể đủ lớn, tốt nhất…

**Plain** (1587 characters):

> Em nên **tách chép ra ngay**. Cá chép và cá vàng thường không nuôi chung được, nhất là khi chép hung dữ như trường hợp của em.
> 
> **Lý do:**
> - Cá chép lớn nhanh (chép thường có thể dài 30–50 cm, koi còn lớn hơn), tính hung, hay rượt và cắn cá nhỏ hơn.
> - Cá vàng bơi chậm, vây dài, mắt lồi (với các giống vàng kiểng) nên rất dễ bị cắn, rách vây, nhiễm trùng.
> - Chép thải nhiều chất bẩn, làm nước ô nhiễm nhanh, cả hai loài đều dễ bệnh.
> - Hai loài có nhu cầu bể khác nhau: chép cần bể rất lớn, nhiều oxy; cá vàng kiểng cần bể rộng nhưng không cần lớn như vậy.
> 
> **Việc nên làm bây giờ:**
> 1. **Tách chép r…

### stocking-05 · tank · ours wins (7.25 · 5)

**Asked:** Cá chép mới thả cứ tấn công cá vàng trong bể tôi, có nuôi chung được không?

**Judge:** X dùng chi tiết cá vàng đã chết và bảo tách cá ngay, kiểm tra amoniac và nitrit, thay nước, rồi theo dõi con cá vàng còn lại. Y bỏ qua chi tiết cá chết, không kiểm tra nước, đưa ra lý do nhiệt độ sai và gợi ý những loài không hợp với cá vàng. / Y is the better answer. It uses the fact that a goldfish already died, adds an ammonia and nitrite check with a 20–30% water change, and says what to watch over the next few days. X misses the death, gives no follow-up checks, and suggests tropical replacement fish that don't suit goldfish.

**Ours lacks:** tank-fit. **Plain lacks:** tank-fit, follow-up, wrong, figures.

**Ours** (read 2 pages, stopped at the tools limit):

> Nhiều khả năng cá chép đang lớn hơn nhiều và hung hơn cá vàng, còn cá vàng bơi chậm, vây dài nên dễ bị đuổi và cắn. Bạn ghi là một con cá vàng đã chết sau khi thả chép, nên cần tách chép ra ngay. Cẩm nang có nói cá vàng và koi là họ hàng gần, nhiều người tưởng không nuôi chung được nhưng thực ra có thể, miễn là bể đủ rộng và cá cùng cỡ. Với một bể hiện tại chỉ có một con cá vàng và một con chép thì mình không nên giữ chung.
> 1. Tách cá chép sang bể riêng hoặc thùng có sục khí ngay hôm nay.
> 2. Soi cá vàng còn lại: vây rách, vết cắn đỏ, đốm trắng hay nằm một chỗ thì cho vào bể cách ly để theo dõ…

**Plain** (1172 characters):

> **Không nên nuôi chung.** Cá chép (kể cả koi) thường không hợp với cá vàng, vì:
> 
> - **Cá chép lớn nhanh** và có thể dài 30–60 cm hoặc hơn, cần bể rất lớn. Cá vàng cũng cần bể rộng nên hai loài tranh chấp không gian và thức ăn.
> - **Cá chép hung dữ hơn**, hay rượt đuổi, húc và cắn vây cá khác.
> - **Cá vàng, nhất là loại vàng có vây dài, mắt lồi, đuôi voan** (ranchu, oranda, thời trang...), bơi chậm và vây mỏng nên dễ bị thương, dễ nhiễm trùng và stress.
> - **Nhu cầu nhiệt độ và nước hơi khác nhau**, nên khó duy trì môi trường phù hợp cho cả hai.
> 
> **Cách xử lý:**
> 
> 1. **Tách ngay cá vàng** (hoặc cá …

### stocking-06 · post · plain wins (6 · 7.25)

**Asked:** Em vừa set cái bể cubic theo tư vấn, đáy bể để 5 con nerita. Ra cửa hàng thấy cá kiếm mắt đỏ đẹp quá nên mua thử vài con. Mấy con mún đỏ sắp đẻ nên em đang tính chuyển sang chỗ khác vì sợ bị ăn hết trứng, cá con, bắt đầu thấy ngại rồi. Bể có lọc thác, có cần thay nước hàng tuần không vì thấy nước có mùi hôi?

**Judge:** Y corrects the 'eggs' idea (both fish give birth to live young). It says a cubic tank is small, so it is probably overstocked, and it warns not to rinse the filter in tap water. X tells them to replace the filter sponge in a new tank, which hurts cycling, and it gives a 108 L figure without linking it to their small cubic tank. Y's Vietnamese is a bit awkward: it calls the reader 'em', and the hobbyist already calls themselves 'em'. / X dặn đúng là chỉ giũ lõi lọc bằng nước bể. X cũng chỉ ra bể cubic nhỏ nên có thể đang nuôi quá đông, và lời văn tự nhiên với người đọc xưng "em". Y có các bước rõ thứ tự và cả cách cho cá bột ăn, nhưng lại khuyên thay mút lọc trong bể mới set. Con số 108 lít của Y thì đổi thẳng từ đơn vị gallon chứ không xét đến bể của bạn.

**Ours lacks:** tank-fit, follow-up. **Plain lacks:** follow-up, local.

**Ours** (read 3 pages, stopped at the tools limit):

> Mình thấy rủi ro lớn nhất là cá kiếm và cá mún (platy) đều đẻ con, và cá lớn sẽ ăn cá bột, nên việc bạn tính tách mấy con cái sắp đẻ là đúng. Ốc nerita thì không ăn cá bột hay trứng cá, bạn có thể giữ chúng ở đáy bể. Mùi hôi thường là dấu hiệu chất bẩn tích tụ, nên thay nước định kỳ là cần thiết.
> 1. Chuẩn bị một hộp đẻ hoặc bể nhỏ có cây dày, rồi chuyển con mún đỏ đang chửa sang đó khi bụng bắt đầu to và sẫm màu, để cá bột rơi ra không bị ăn.
> 2. Sau khi đẻ xong, lấy mẹ ra khỏi hộp đẻ để tránh mẹ ăn con, và cho cá bột ăn thức ăn nhỏ mịn vài lần mỗi ngày.
> 3. Thay khoảng 20–30% nước mỗi tuần bằn…

**Plain** (1511 characters):

> Em có vài điểm cần xem lại:
> 
> **1. Về cá con:** Cá kiếm và cá mún đều đẻ con sống chứ không đẻ trứng. Cá bố mẹ, nhất là cá mẹ, thường ăn cá con ngay sau khi sinh. Ốc nerita thì không ăn cá con hay trứng cá, nên 5 con ốc không gây vấn đề gì ở đây.
> 
> Nếu muốn giữ cá con:
> - Chuyển cá mẹ sang bể khác hoặc hộp đẻ trước khi sinh vài ngày.
> - Hoặc để nhiều cây thủy sinh dày (rêu java, rau muống nước...) để cá con có chỗ trốn.
> - Sau khi sinh thì bắt cá mẹ ra, cá con sẽ an toàn hơn.
> 
> **2. Về mùi hôi:** Bể mới set thường bị mùi vì chu trình nitơ chưa ổn định. Em nên kiểm tra:
> - Mùi trứng thối thường là do…

### stocking-06 · tank · plain wins (4.5 · 5.25)

**Asked:** Mún trong bể tôi sắp đẻ, có cần tách ra không, và có phải thay nước hàng tuần không?

**Judge:** Cả hai đều bỏ qua việc bể cubic mới set mà nước đã hôi, nhiều khả năng do bể chưa chạy vi sinh và amoniac đang cao, nên chưa thể chỉ thay 20–30% nước mỗi tuần. Y dễ đọc hơn, có nêu dấu hiệu sắp đẻ và khuyên test amoniac/nitrit. X có điểm hay là dặn không bắt cá mẹ chuyển bể khi đã sát ngày đẻ, nhưng cứ nhắc lại "cẩm nang" về cá bảy màu nên đọc vướng. / Cả hai đều bỏ qua chuyện bể cubic mới set mà nước có mùi hôi, dấu hiệu bể chưa chạy vi sinh và có amoniac, trong khi đây mới là vấn đề gấp nhất với mún sắp đẻ. X gọn gàng và đúng hơn. Y lấy mốc thai kỳ của cá bảy màu áp cho mún, nên sai.

**Ours lacks:** tank-fit, diagnosis, follow-up, wrong. **Plain lacks:** tank-fit, diagnosis.

**Ours** (read 1 pages):

> Cá mún (molly) thuộc nhóm cá đẻ con như cá bảy màu, nên cách làm trong cẩm nang về cá bảy màu áp dụng được. Bạn nên tách cá mẹ, nhưng cách tách tùy lúc: cẩm nang ghi có người chuyển cá mái sang bể đẻ khi thấy rõ là có thai, có người tách vào khoảng ngày 18–25 của thai kỳ. Nếu cá đã sát ngày đẻ thì không nên bắt chuyển bể vì cá có thể sẩy thai hoặc chết, lúc đó dùng vách ngăn ngay trong bể.
> 1. Chuẩn bị bể đẻ riêng khoảng 40 lít, hoặc treo một hộp đẻ trong bể chính, có chỗ trốn cho cá con như rêu java hoặc rong đuôi chó.
> 2. Nếu chưa kịp chuyển bể, đặt vách ngăn hoặc lưới để cá mẹ ở một bên và c…

**Plain** (1338 characters):

> Có, bạn nên **tách mún mẹ** hoặc chuẩn bị chỗ cho cá con. Mún trưởng thành thường ăn cá con của chính chúng, nên nếu để chung, phần lớn cá con sẽ mất.
> 
> **Cách xử lý:**
> 
> - **Dùng hộp đẻ hoặc lồng đẻ** treo trong bể: mún mẹ được đưa vào, cá con rơi qua khe thì an toàn.
> - **Hoặc chuyển mún mẹ sang bể riêng** (bể nhỏ khoảng 10–20 lít có sủi và lọc nhẹ). Sau khi đẻ xong, bạn đưa mẹ về bể chính.
> - **Nếu không có dụng cụ**, có thể để nhiều rong nổi (như rêu java, bèo) trong bể để cá con có chỗ trốn, nhưng tỷ lệ sống thấp hơn.
> 
> **Dấu hiệu sắp đẻ:** bụng to và vuông, vùng gần hậu môn (gravid spot) sẫm…

### stocking-07 · post · tie or split (4 · 4.5)

**Asked:** Bể nhà em kích cỡ 60x35x40, thả neon và sóc đỏ khoảng bao nhiêu con thì được ạ?

**Judge:** Y's advice sounds sure but misidentifies sóc đỏ as an aggressive 12–15 cm fish and says to keep only 1, which is harmful for a schooling fish. X gives a sensible neon count and asks which fish they mean. Its loach guess is doubtful, but it is less likely to mislead. / X trả lời thẳng số lượng cho cả neon và sóc đỏ, kèm cách bố trí bể, thứ tự thả cá, lọc, thay nước và nhiệt độ, nên người nuôi làm theo được ngay, dù nó tự đoán loài cá mà không hỏi lại. Y chỉ trả lời phần neon, còn sóc đỏ thì gán cho một loài và nhiệt độ có vẻ bịa rồi hỏi ngược lại.

**Ours lacks:** too-thin, figures, plan, asks-only, wrong. **Plain lacks:** wrong, diagnosis.

**Ours** (read 2 pages, stopped at the time limit):

> Với bể 60x35x40 (khoảng 84 lít), bạn nên nuôi đàn neon từ 6 con trở lên, khoảng 8 đến 10 con sẽ đẹp và ổn định hơn, vì neon là loài sống theo đàn. Bạn ghi "sóc đỏ" nhưng chưa rõ là loài nào. Nếu là chạch sóc đuôi đỏ thì loài này ưa nước mát, khoảng 15 đến 21°C, còn neon cần 21 đến 25°C, nên hai loài khó sống chung lâu dài trong một bể. Bạn cho mình biết tên đầy đủ hoặc gửi ảnh con cá để mình xem kỹ hơn.
> 
> [Thẻ loài] Cá neon xanh (Paracheirodon innesi): nhiệt độ 21–25 °C; pH 4–7.5; GH 1–12; dài 3 cm; bể từ 60 cm; đàn từ 6 con; tính peaceful; độ khó 2/8
> 
> [Gợi ý hỏi tiếp] Chạch sóc đuôi đỏ cần bể…

**Plain** (985 characters):

> Với bể 60x35x40 cm (khoảng 84 lít), bạn có thể nuôi:
> 
> - **Neon: khoảng 10–15 con.** Cá neon sống theo đàn, nên nuôi ít nhất 6 con, tốt nhất là trên 10 con để chúng bơi tự nhiên và ít nhát.
> - **Sóc đỏ: chỉ nên nuôi 1 con.** Loài này khá hung dữ với cá cùng loài và có thể dài tới 12–15 cm. Hai con trở lên trong bể nhỏ thường đánh nhau.
> 
> Một số lưu ý:
> 
> - **Bể hơi nhỏ cho sóc đỏ trưởng thành.** Bạn nên bố trí nhiều hang đá, gỗ lũa và cây thủy sinh dày để nó có chỗ ẩn nấp và giữ lãnh thổ.
> - **Nên thả neon trước, sóc đỏ sau.** Khi thả cùng lúc, sóc đỏ có thể rượt neon nếu không có chỗ trốn.
> - **Lọc…

### stocking-07 · tank · tie or split (3.5 · 3.5)

**Asked:** Bể của tôi thả được bao nhiêu con neon và sóc đỏ?

**Judge:** Both answers guess the wrong fish for "sóc đỏ", which most likely means rummy-nose tetra (sóc đầu đỏ). X is slightly better because it uses the real tank size and gives a stocking figure, but its 21°C advice comes from that wrong guess and won't work in Vietnam. Y never answers how many fish fit this tank and gets the local name for Corydoras wrong. / Không câu nào trả lời được. Cả hai đều đoán sai loài: 'sóc đỏ' là cá sóc đầu đỏ (rummy-nose). Y có dùng kích thước bể, nhưng vì nhầm sang một loài chạch nước lạnh nên đưa ra cảnh báo nhiệt độ sai và không làm được ở VN. X chung chung và hỏi lại, nhưng số lượng cá đàn nó đưa ra ít gây hiểu nhầm hơn.

**Ours lacks:** wrong, figures, local. **Plain lacks:** tank-fit, asks-only, wrong.

**Ours** (read 2 pages):

> Nuôi chung được, nhưng cần để ý: cá chạch sóc đuôi đỏ có thể rượt cá neon và hay cắn vây. Mình hiểu "sóc đỏ" là cá chạch sóc đuôi đỏ, loài gần nhất trong cẩm nang; nếu bạn đang nói loài khác thì cho mình biết tên. Bể 60 × 35 × 40 cm đang trống, và cả hai loài đều là cá đàn nên mỗi loài nên thả ít nhất 6 con. Có 6 neon và 6 chạch thì tải bể khoảng 79%, đủ ổn nếu lọc tốt và thay nước đều. Điểm khó nhất là nhiệt độ: neon cần 21–25°C còn chạch cần 15–21°C, chỉ trùng nhau quanh 21°C. Nếu giữ cả hai, bạn phải giữ nước ổn định quanh 21°C và trồng nhiều cây, đặt đá hang để chạch có chỗ trốn; nếu khôn…

**Plain** (1121 characters):

> Để trả lời chính xác, tôi cần biết **dung tích bể** (lít hoặc kích thước dài × rộng × cao). Tôi cũng chưa chắc "sóc đỏ" là loài nào. Nếu bạn muốn nói **cá Corydoras đỏ** (thường gọi là cá sóc) hoặc **tép đỏ** (Red Cherry Shrimp), hãy cho tôi biết để tôi tính chính xác hơn.
> 
> Dưới đây là hướng dẫn chung:
> 
> **Cá neon (Neon tetra):**
> - Nuôi thành đàn, tối thiểu 6 con, tốt nhất 10 con trở lên.
> - Bể khoảng 40 lít có thể nuôi khoảng 10-15 con neon cùng vài loài hiền khác.
> 
> **Cá sóc (Corydoras):**
> - Nuôi theo đàn, tối thiểu 4-6 con.
> - Bể 40 lít nuôi được khoảng 5-6 con, bể lớn hơn thì nhiều hơn.
> 
> **Té…

### stocking-08 · post · ours wins (7.5 · 5.5)

**Asked:** Em mới chơi, ban đầu chỉ định mua cá với cây nhựa, nhưng tìm hiểu thấy mê thủy sinh quá nên mua thêm cây ráy nhỏ và chùm xương cá thay cây nhựa. Bể bé tí 4 lít mà thích đẹp em thả 7-8 con. Nuôi được 1 tuần rồi vẫn ổn, lâu dài có ổn không ạ?

**Judge:** Cả hai câu trả lời đều chỉ ra đúng là thả 7-8 con quá đông và giải thích vì sao tuần đầu ổn chưa nói lên điều gì. X tốt hơn vì khuyên giảm còn 2-3 con, cho mốc theo dõi cụ thể (ammonia/nitrite về 0, nitrat dưới 40 ppm, cá đớp khí) và nói thẳng là chưa biết cây chùm xương cá là cây gì. Y gợi ý nuôi neon trong 4 lít và khẳng định chùm xương cá lên chậm mà không có căn cứ, dù lời khuyên nâng lên bể 10-20 lít là hữu ích. / Y nói đúng là sau một tuần chưa kết luận được gì. Y cho các bước theo thứ tự, có số liệu rõ (ammonia/nitrite 0, nitrat dưới 40 ppm, thay 1/3 nước), có dấu hiệu cần theo dõi và mốc 2-3 tuần, và nói thẳng là chưa biết cây chùm xương cá. X gợi ý nuôi neon trong 4 lít và đoán đặc tính cây không có cơ sở.

**Ours lacks:** local. **Plain lacks:** follow-up, figures, wrong.

**Ours** (read 3 pages, stopped at the calls limit):

> Với bể 4 lít, 7-8 con là quá đông, và sau một tuần chưa nói lên điều gì: vấn đề thường lộ ra sau vài tuần khi lượng chất thải của cá tích lại, còn vi sinh trong bể chưa kịp phát triển theo. Cây ráy là lựa chọn tốt vì lên chậm và sạch, nhưng với thể tích nhỏ như vậy, cá vẫn là yếu tố quyết định. Theo cẩm nang, bể bền nhất thường nhiều cây và ít cá, và nên thả từng đợt nhỏ, chỉ thả thêm khi nước vẫn tốt.
> 1. Đếm lại số cá và tra xem từng loài lớn tới cỡ nào, vì bể 4 lít (khoảng 3-3,5 lít nước sau khi trừ cây và đá) chỉ hợp với vài con cá rất nhỏ, hoặc một nhóm tép.
> 2. Giảm xuống khoảng 2-3 con n…

**Plain** (1431 characters):

> Với **4 lít và 7-8 con cá thì lâu dài sẽ không ổn**, dù một tuần đầu vẫn bình thường. Lý do:
> 
> - **Chất thải tích tụ nhanh:** Cá thải amoniac liên tục. Vi khuẩn có lợi trong bể cần vài tuần để ổn định, nên amoniac và nitrit có thể tăng dần ở các tuần sau, lúc này cá mới bắt đầu yếu hoặc chết.
> - **Thiếu oxy và nhiệt độ dao động mạnh:** Bể nhỏ mất nhiệt và thay đổi nhiệt độ rất nhanh, oxy hòa tan cũng ít.
> - **Nước dễ bẩn và khó kiểm soát:** Chỉ cần cho ăn dư một chút hoặc quên thay nước vài ngày là chất lượng nước xấu đi rõ rệt.
> - **Cây khó sống hơn:** Cây thủy sinh cũng cần ổn định, và bể quá n…

### stocking-08 · tank · ours wins (6.75 · 3)

**Asked:** Bể của tôi đang thả 7-8 con cá, lâu dài có ổn không?

**Judge:** X uses the 4 L size, tells the hobbyist plainly that 7-8 fish is too many, and gives steps in order plus what to watch. It misses that the tank has only run for a week, though, and its water-change schedule is too light for that. Y mostly asks questions back that the tank details already answer, and its stocking rule is loose. / Y dùng đúng dung tích 4 lít, nói thẳng là 7-8 con là quá tải và đưa ra các bước làm, thông số cần đo, dấu hiệu cần theo dõi. Tuy vậy Y không nhắc bể mới chạy 1 tuần (chưa có vi sinh), và lịch thay nước nó đưa ra là quá thưa. X chỉ hỏi lại và đưa nguyên tắc chung chung, bỏ qua thông tin đã có trong hồ sơ.

**Ours lacks:** tank-fit, figures. **Plain lacks:** asks-only, tank-fit, plan.

**Ours** (read 1 pages, stopped at the calls limit):

> Với 7-8 con cá trong bể khoảng 4 lít thì nhiều khả năng là quá tải, trừ khi đây là loài rất nhỏ. Bể nhỏ mất nước sạch nhanh, và cá tiêu oxy nhiều hơn mức bể gánh được. Bạn chưa ghi rõ loài nên mình chưa tính chính xác được.
> 1. Ghi tên từng loài và cỡ trưởng thành của nó (tra trong cẩm nang), đừng tính theo cỡ cá lúc mua ở tiệm.
> 2. Đo lại thể tích bể bằng dài × rộng × cao, trừ khoảng 10% cho đá và cây. Hồ sơ đang ghi 4 lít, bạn kiểm tra lại xem đúng chưa.
> 3. Cộng tổng chiều dài trưởng thành của cả đàn rồi so với thể tích. Theo quy tắc ước lượng trong cẩm nang, 1 cm cá cần khoảng 1,5 lít nước, …

**Plain** (1184 characters):

> Điều này **tùy vào kích thước bể, loài cá và hệ lọc**, nên tôi chưa thể kết luận ngay. Bạn cho tôi biết thêm vài thông tin:
> 
> 1. **Dung tích bể** (lít hoặc kích thước dài x rộng x cao)
> 2. **Loài cá** (ví dụ bảy màu, neon, betta, cá vàng, cá rô đầu vàng...)
> 3. **Kích thước trưởng thành** của từng loài, vì nhiều con cá nhỏ lúc mua sẽ lớn lên khá nhiều
> 4. **Hệ lọc** đang dùng và tần suất thay nước
> 
> **Một số nguyên tắc tham khảo:**
> - Cá nhiệt đới nhỏ (bảy màu, neon, tetra): khoảng 1 lít nước cho 1-2 cm cá trưởng thành, và nên nuôi thành đàn nên cần bể đủ rộng.
> - Cá lớn hoặc cá vàng: cần bể lớn hơn…

### stocking-09 · post · ours wins (6.5 · 2)

**Asked:** Bể dài 80, rộng 35, cao 45 cm thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** Y nhận nhầm cá ông tiên là cá chùm Ancistrus, nên kết luận \"được\" và bỏ qua nguy cơ chính là ông tiên lớn ăn neon. X nói đúng nguy cơ đó và đưa ra các lựa chọn khác, dù mức bể tối thiểu nó đưa ra hơi khắt khe và gợi ý ghép với cá hỏa tiễn chưa ổn. / X hiểu sai cá ông tiên thành cá chùm, nên câu trả lời \"Được\" và các lưu ý đi kèm đều không dùng được. Y xác định đúng loài và cảnh báo đúng rủi ro ông tiên ăn neon, kèm phương án thay thế. Tuy vậy, Y còn khá cứng nhắc: không nói đến cách giảm rủi ro như thả ông tiên lúc còn nhỏ, và cũng không nói cần theo dõi gì sau khi thả.

**Ours lacks:** figures, follow-up. **Plain lacks:** wrong, diagnosis.

**Ours** (read 2 pages, stopped at the time limit):

> Không nên nuôi chung: cá ông tiên có thể ăn cá neon xanh, vì ông tiên dài tới 15 cm còn neon chỉ khoảng 3 cm, và ông tiên còn hơi dữ, hay rượt đuổi đàn neon. Bể 80 × 35 × 45 cm cũng nhỏ hơn mức tối thiểu 100 × 40 × 50 cm mà cẩm nang đưa ra cho ông tiên.
> 1. Nếu muốn giữ neon, bạn nên chọn cá hiền như cá bảy màu hoặc cá tam giác, hoặc thêm tép red cherry.
> 2. Nếu muốn giữ ông tiên, bạn cần bể lớn hơn, ít nhất 100 cm, và nên ghép với cá sặc bướm hoặc cá hỏa tiễn, không ghép với neon.
> 3. Trước khi thả, hãy kiểm tra lại danh sách cá bằng công cụ ghép cá của cẩm nang.
> Nếu bạn cho mình biết mục tiêu,…

**Plain** (1213 characters):

> **Được.** Bể khoảng 126 lít (80×35×45 cm) đủ rộng cho 2 con cá ông tiên và 10 con neon xanh.
> 
> Mình giả định "cá ông tiên" là loài cá chùm/Ancistrus (cá hút, sống đáy, ăn rêu). Nếu bạn nói rõ loài khác thì mình kiểm tra lại giúp.
> 
> **Lý do phù hợp:**
> - **Neon xanh** hiền, bơi tầng giữa và tầng trên, hợp bày đàn đông.
> - **Ancistrus** sống đáy, ăn rêu và thức ăn chìm, ít tranh chấp với neon.
> - Hai loài có nhu cầu nhiệt độ và pH gần nhau: khoảng 22–26°C, pH 6–7.5.
> 
> **Lưu ý khi nuôi:**
> - **Số lượng:** Neon nên nuôi thành đàn từ 6 con trở lên, 10 con là hợp lý.
> - **Ancistrus:** Nếu có con đực, không…

### stocking-09 · tank · tie or split (5 · 4.5)

**Asked:** Bể của tôi thả 2 con cá ông tiên với 10 con neon xanh được không?

**Judge:** X uses the real tank and states the real risk (adult angelfish eat neons) clearly, but it's too strict about tank size and gives a flat no. Y gets the nuance about the angelfish half right, but it wastes space on goldfish, which isn't what "ông tiên" means in Vietnam, ignores the tank and ends by asking a question back. / X đưa ra câu trả lời đúng hơn: được, có điều kiện, và nói rõ rủi ro ông tiên lớn sẽ ăn neon. Tuy vậy X lan man chuyện cá vàng và không dùng kích thước bể. Y có dùng kích thước bể nhưng lại đánh giá sai là bể quá hẹp, cấm hẳn một combo phổ biến, và gợi ý cá nuôi chung không hợp.

**Ours lacks:** plan, follow-up, wrong. **Plain lacks:** tank-fit, local, plan.

**Ours** (read 2 pages):

> Không nên nuôi chung: cá ông tiên dài tới 15 cm và có thể ăn cá neon xanh chỉ dài khoảng 3 cm, còn khi rượt đuổi thì neon cũng dễ bị stress. Ngoài ra bể 80 × 35 × 45 cm của bạn còn hẹp: cá ông tiên trưởng thành cần bể ít nhất 100 cm dài và cao khoảng 50 cm. Nếu muốn nuôi ông tiên, bạn nên chọn cá hiền hơn như cá sặc bướm, cá hỏa tiễn hay cá nheo lông vũ, là những loài cá ông tiên hợp trong cẩm nang, và đổi sang bể lớn hơn.
> 
> [Công cụ: Nuôi chung cho Bể của tôi 80×35×45 cm]
> Không nên nuôi chung: Cá ông tiên có thể ăn Cá neon xanh.
> Cá ông tiên (15 cm) có thể ăn Cá neon xanh (3 cm).
> Cá ông tiên h…

**Plain** (939 characters):

> Điều này phụ thuộc vào loài "cá ông tiên" mà bạn nuôi, vì tên gọi này có thể được dùng cho nhiều loài khác nhau.
> 
> **Nếu là cá thiên thần (angelfish, Pterophyllum):** Được, với điều kiện:
> - **Bể tối thiểu khoảng 100 lít** (bể càng lớn càng tốt). Bể nhỏ hơn sẽ dễ gây stress và tranh giành lãnh thổ.
> - **Nhiệt độ 24–28°C** và pH trung tính, phù hợp với neon.
> - **Thả cá thiên thần lúc còn nhỏ** cùng nhau, hoặc thả neon trước để chúng quen môi trường.
> - **Lưu ý:** Cá thiên thần trưởng thành có thể ăn cá nhỏ hơn, nên neon có thể bị săn bắt, nhất là khi cá thiên thần lớn và bể ít cây thủy sinh che ch…

### stocking-10 · post · plain wins (4 · 7)

**Asked:** Bể 60x30x36 cm của mình đang nuôi 12 con neon xanh, thả thêm 1 con cá betta được không?

**Judge:** Y trả lời đúng thực tế hơn: có thể nuôi chung nhưng có rủi ro, kèm các bước cụ thể (trồng nhiều cây, giữ dòng chảy nhẹ, đậy nắp, theo dõi 1–2 tuần rồi tách nếu cần), chỉ sai ở thứ tự thả cá. X thì cấm hẳn dựa vào cẩm nang, phóng đại chuyện neon bị ăn, và gợi ý thay thế quá chung chung. / Bể 65 L có cây thì ghép betta với neon vẫn được nếu theo dõi kỹ. X trả lời đúng như vậy và đưa dấu hiệu cụ thể để tách cá, dù bước thả betta trước là ngược với bể đang có neon. Y từ chối thẳng dựa vào nhãn "hung dữ" quá cứng nhắc và không gợi ý được loài thay thế cụ thể nào.

**Ours lacks:** plan, tank-fit, wrong. **Plain lacks:** local, tank-fit.

**Ours** (read 1 pages, stopped at the calls limit):

> Không nên nuôi chung: cá betta (cá xiêm) hung dữ, và cẩm nang xếp loài này vào nhóm phải nuôi riêng hoặc bể chỉ một loài. Bể 60x30x36 cm của bạn đang ở mức 36% tải, còn thưa, nên đủ chỗ cho 12 con neon xanh, nhưng betta đực có thể rượt đuổi hoặc cắn đàn neon hiền, và neon nhỏ dễ bị stress hoặc bị ăn.
> 1. Nếu bạn muốn giữ neon, cứ giữ đàn 12 con này và không thả betta vào bể.
> 2. Nếu bạn muốn nuôi betta, nên làm bể riêng hoặc dùng hộp nhựa treo trong bể để tách cá, không thả thẳng vào bể neon.
> 3. Nếu chỉ muốn thêm một con cá cho bể này, chọn loài hiền và nhỏ mà cẩm nang gợi ý, rồi kiểm tra lại b…

**Plain** (1444 characters):

> **Có thể, nhưng có rủi ro, và bạn nên chuẩn bị kỹ trước khi thả.**
> 
> **Điểm thuận lợi:**
> - Bể khoảng 65 lít (60×30×36 cm) đủ rộng cho 1 con betta cùng đàn neon nếu bố trí tốt.
> - Neon và betta đều ưa nước ấm, khoảng 24–26°C, nên nhiệt độ có thể dùng chung.
> 
> **Rủi ro:**
> - Betta đực có tính lãnh thổ. Nó có thể rượt đuổi hoặc tấn công neon, nhất là khi neon nhỏ và đàn chỉ có 12 con.
> - Neon dễ bị stress, và cá stress thường dễ bệnh hơn.
> - Betta có vây dài, dễ bị tổn thương nếu có cá khác bơi quấy rầy.
> 
> **Cách làm để tăng cơ hội thành công:**
> 1. **Trồng nhiều cây thủy sinh** (dương xỉ Java, rêu Java…

### stocking-10 · tank · ours wins (6.5 · 4)

**Asked:** Bể của tôi thả thêm 1 con cá betta được không?

**Judge:** X uses the real tank (60×30×36 cm, 12 neon tetras) and gives a clear answer with something to watch for, but its "don't add it" is stricter than needed and goes against its own excerpt. Y mostly talks about bettas living with other bettas and asks for tank details the app already has, though it does correctly hint that neons can live with a betta. / Y uses the real tank (60×30×36 cm, 12 neons), gives a safe answer and says to separate the fish if the betta chases them, though it is too strict about community tanks. X ignores the tank, wrongly assumes there is already a betta and mostly asks questions back.

**Ours lacks:** wrong, follow-up, figures. **Plain lacks:** tank-fit, asks-only, plan.

**Ours** (read 1 pages):

> Không nên nuôi chung: cá betta hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài. Bể của bạn 60×30×36 cm đang có 12 cá neon xanh; về số lượng thì bể còn thưa (khoảng 36%), nhưng betta dễ rượt đuổi và làm neon nhỏ bị stress, nên mình không khuyên thả thêm vào bể này. Nếu bạn muốn nuôi betta, nên để riêng một bể cho betta; theo cẩm nang, betta đực không nuôi chung được với con đực khác trừ khi có vách ngăn, còn một vài con cái có thể nuôi chung dễ hơn. Khi thấy betta rượt hoặc cắn neon, bạn nên tách ngay.
> 
> [Trích: Cá betta (cá xiêm) › Nuôi chung với con gì?]
> Không thể nuôi chung các con đực …

**Plain** (1079 characters):

> **Thường thì không nên**, đặc biệt nếu bể đang có sẵn một con betta đực.
> 
> - **Betta đực** rất hung dữ với các con đực khác. Hai con đực sống chung gần như chắc chắn sẽ đánh nhau, gây stress, thương tích và có thể chết.
> - **Betta cái** cũng có thể đánh nhau với nhau, và thường phải thả cùng lúc, có nhiều chỗ ẩn nấp. Ghép cái với đực chỉ nên làm khi có kinh nghiệm, vì con cái dễ bị đực rượt đuổi hoặc cắn.
> - **Thể tích bể** là yếu tố quan trọng. Muốn nuôi nhiều betta, bạn cần bể rất lớn, thường từ 40 lít trở lên, có nhiều cây thủy sinh, lũa, đá để tạo vùng lãnh thổ.
> 
> **Nếu muốn thêm cá an toàn h…

### algae-12 · post · tie or split (6.75 · 7)

**Asked:** Bể 60x30x36 của mình set được 4 tuần, không CO2, trồng rêu java, ráy nana với dương xỉ java, đèn LED bật liền 8 tiếng mỗi ngày, châm phân nước 1 lần/tuần. Lá ráy bắt đầu có đốm rêu xanh. Có nên chia đèn ra làm hai đợt sáng chiều, mỗi đợt không quá 4 tiếng không?

**Judge:** Hai câu trả lời đều khuyên giảm đèn xuống 6 tiếng và nói chia đợt không trị được rêu. Y gọn và rõ hơn, gọi đúng tên tảo đốm xanh, gợi ý thả ốc Nerite và cắt bỏ lá ráy bị phủ nặng. X thì tự mâu thuẫn về liều phân. / Cả hai đều có cùng cách chữa đúng: giảm đèn xuống 6 tiếng, châm ít phân lại, thay 20–30% nước mỗi tuần và lau tảo trên lá. Y nhỉnh hơn vì các bước có thứ tự, có mốc theo dõi 2–3 tuần và cách tăng đèn lại dần, dù phần liều phân bị mâu thuẫn. X giải thích rõ hơn vì sao chia đèn hai đợt ít tác dụng và gợi ý thả ốc nerite, nhưng không nói cần theo dõi gì và khi nào.

**Ours lacks:** wrong. **Plain lacks:** follow-up, local, plan.

**Ours** (read 4 pages, stopped at the tools limit):

> Chia đèn thành hai đợt sáng và chiều là cách nhiều người chơi làm, và trong cẩm nang có nhắc tới. Tổng 8 tiếng mỗi ngày vẫn nằm trong khoảng cây cần, nên việc chia đợt không sai. Nhưng chia đợt chỉ là cách sắp xếp giờ, không phải thứ trị rêu. Đốm rêu xanh trên lá ráy thường xuất hiện trong bể mới 4 tuần, khi bể chưa ổn định, và thường bớt dần khi bể già đi. Với bể không CO2 và được châm phân mỗi tuần, nguyên nhân khả năng cao là lượng sáng và chất dinh dưỡng đang nhiều hơn mức cây và bể cần lúc này. Mình khá chắc về điều này, nhưng chưa xem được hết thông số nước nên chưa thể chắc hẳn.
> 1. Dùn…

**Plain** (1543 characters):

> **Ngắn gọn:** Chia đèn ra hai đợt có thể giúp một chút, nhưng **giảm tổng thời gian chiếu sáng** mới là cách hiệu quả hơn. Với bể mới 4 tuần, không CO2, bật 8 tiếng liền là hơi nhiều.
> 
> **Vì sao chia đợt ít hiệu quả?** Rêu và tảo phát triển theo tổng lượng ánh sáng và dinh dưỡng dư thừa, không phụ thuộc nhiều vào việc bật liên tục hay ngắt quãng. Chia 2 đợt chỉ giúp cây nghỉ một chút, còn lượng sáng tổng vẫn như cũ.
> 
> **Nên làm:**
> - **Giảm photoperiod xuống khoảng 6 tiếng/ngày.** Bể không CO2 với Java moss, Nana và dương xỉ Java vẫn đủ sáng ở mức này. Nếu muốn chia, có thể làm 2 đợt (ví dụ 3 ti…

### algae-12 · tank · ours wins (7.5 · 5)

**Asked:** Bể của tôi có nên chia đèn làm hai đợt, mỗi đợt không quá 4 tiếng không?

**Judge:** X dùng đúng thông số bể của họ (đèn 8 tiếng, không CO₂, cây ưa sáng yếu), nói rõ cách chia đèn không quan trọng bằng tổng số giờ, và đưa lịch cụ thể kèm cách theo dõi. Y nói chung chung, còn hỏi lại xem bể có trồng cây không dù bể đã có sẵn thông tin đó. / Y uses the hobbyist's tank details: a 60 cm tank, no CO₂, and java moss, anubias nana and java fern under 8 hours of light. It says correctly that splitting the light makes little difference here, then gives a concrete timer schedule and what to watch for. X gives generic advice for any tank, asks for details the app already holds, and oversimplifies what causes algae.

**Ours lacks:** –. **Plain lacks:** tank-fit, plan, follow-up.

**Ours** (read 3 pages):

> Được, chia đèn làm hai đợt là cách mà cẩm nang nói tới: một số người bật buổi sáng, tắt giữa ngày cho bể "ngủ trưa", rồi bật lại buổi tối. Với bể của bạn (60×30×36 cm, đèn LED đang bật liền 8 tiếng, không CO₂, cây là rêu java, ráy nana và dương xỉ java), tổng 8 tiếng là vừa, và chia thành hai đợt 4 tiếng vẫn nằm trong khoảng 8–12 tiếng mà cẩm nang khuyến nghị cho bể đã trồng. Cách chia không làm cây lên tốt hơn hay kém đi nhiều, nên hãy chọn theo sinh hoạt của bạn. Điều quan trọng hơn là tổng số giờ và việc đèn không bật qua đêm.
> 1. Đặt hai mốc bật tắt, ví dụ bật 7 giờ sáng, tắt 11 giờ, rồi b…

**Plain** (1251 characters):

> Chia đèn thành hai đợt là cách làm hợp lý, nhưng không bắt buộc. Nó hữu ích trong vài trường hợp cụ thể.
> 
> **Nên chia khi:**
> - Bể hay bị rêu (rêu xanh, rêu tơ) và bạn muốn giảm thời gian chiếu sáng liên tục.
> - Bể trồng cây và đèn khá mạnh, nhất là đèn LED công suất cao.
> - Bạn muốn mô phỏng nhịp tự nhiên, có "giờ nghỉ" giữa trưa, giúp cá và cây đỡ căng thẳng hơn.
> 
> **Lưu ý về tổng thời gian:**
> - Hai đợt 4 tiếng tức tổng cộng 8 tiếng, nằm trong mức phổ biến. Bể trồng cây thường dùng 6–8 tiếng/ngày, bể cá không trồng cây có thể 8–10 tiếng.
> - Nếu đèn mạnh, nên giảm tổng xuống khoảng 6–7 tiếng trước…

