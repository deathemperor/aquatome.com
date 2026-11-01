// Built by apps/site/scripts/app-tank-check.mjs from the site's tank-mates code: don't edit, run it again.
var aqTankCheckStrings = {
 "id": {
  "Bể dài tối thiểu cho cả nhóm: <strong>{n} cm</strong>.": "Panjang akuarium minimum untuk seluruh kelompok: <strong>{n} cm</strong>.",
  "Chưa có kích thước của {names}: chưa tính vào mật độ.": "Ukuran {names} belum tersedia: belum dihitung dalam kepadatan.",
  "Chưa thấy điểm xung khắc, nhưng chưa đủ dữ liệu để chắc": "Belum terlihat ketidakcocokan, tetapi datanya belum cukup untuk memastikan",
  "Còn thưa": "Masih longgar",
  "Cần để ý, và chưa đủ dữ liệu để chắc": "Perlu diawasi, dan datanya belum cukup untuk memastikan",
  "Hiền": "Damai",
  "Hung dữ": "Agresif",
  "Hơi dữ": "Agak agresif",
  "Không nên nuôi chung": "Sebaiknya tidak dipelihara bersama",
  "Nuôi chung được": "Bisa dipelihara bersama",
  "Nuôi chung được, nhưng cần để ý": "Bisa dipelihara bersama, tetapi perlu diawasi",
  "Nuôi {name} theo đàn từ {n} con.": "Pelihara {name} dalam kelompok minimal {n} ekor.",
  "Quá tải": "Kelebihan muatan",
  "Săn mồi": "Predator",
  "Vừa phải": "Moderat",
  "bể ổn định với lọc và thay nước thường lệ.": "akuarium stabil dengan filter dan ganti air rutin.",
  "bớt cá hoặc dùng bể lớn hơn.": "kurangi ikan atau gunakan akuarium yang lebih besar.",
  "chưa có {fields} của {name}": "belum ada data {fields} untuk {name}",
  "cần lọc tốt và thay nước đều mỗi tuần.": "perlu filter yang baik dan ganti air rutin setiap minggu.",
  "kích thước": "ukuran",
  "nhiệt độ": "suhu",
  "nhiệt độ không có khoảng chung": "rentang suhu tidak ada yang sama",
  "nước có khoảng chung, kích thước và tính cách hợp nhau": "parameter air punya rentang yang sama, ukuran dan sifat saling cocok",
  "pH không có khoảng chung": "rentang pH tidak ada yang sama",
  "thả thêm được.": "masih bisa ditambah ikan.",
  "tính cách": "sifat",
  "{big} ({bigCm} cm) có thể ăn {small} ({smallCm} cm).": "{big} ({bigCm} cm) bisa memangsa {small} ({smallCm} cm).",
  "{big} có thể ăn {small}": "{big} bisa memangsa {small}",
  "{name} có thể rượt đuổi {others}": "{name} bisa mengejar-ngejar {others}",
  "{name} cần bể dài từ {n} cm.": "{name} butuh akuarium dengan panjang minimal {n} cm.",
  "{name} hay cắn vây": "{name} suka menggigit sirip",
  "{name} hay cắn vây cá khác: tránh nuôi chung với cá vây dài, bơi chậm.": "{name} suka menggigit sirip ikan lain: hindari mencampurnya dengan ikan bersirip panjang yang berenang lambat.",
  "{name} hung dữ": "{name} agresif",
  "{name} hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.": "{name} agresif, biasanya harus dipelihara sendiri atau di akuarium satu spesies.",
  "{name} hơi dữ, có thể rượt đuổi {others}. Cần bể rộng, nhiều chỗ trốn.": "{name} agak agresif, bisa mengejar {others}. Butuh akuarium luas dengan banyak tempat sembunyi.",
  "{name} là cá săn mồi": "{name} adalah ikan predator",
  "{name} là cá săn mồi: con nào vừa miệng đều có thể bị ăn.": "{name} adalah ikan predator: ikan apa pun yang muat di mulutnya bisa dimakan.",
  "{name} sống theo đàn: nên nuôi từ {min} con (đang chọn {count}).": "{name} hidup berkelompok: sebaiknya dipelihara minimal {min} ekor (saat ini dipilih {count}).",
  "Đã đầy": "Sudah penuh",
  "độ cứng": "kesadahan",
  "độ cứng không có khoảng chung": "rentang kesadahan tidak ada yang sama"
 },
 "th": {
  "Bể dài tối thiểu cho cả nhóm: <strong>{n} cm</strong>.": "ความยาวตู้ขั้นต่ำสำหรับทั้งกลุ่ม: <strong>{n} cm</strong>",
  "Chưa có kích thước của {names}: chưa tính vào mật độ.": "ยังไม่มีข้อมูลขนาดของ {names} จึงยังไม่นำมาคำนวณความหนาแน่น",
  "Chưa thấy điểm xung khắc, nhưng chưa đủ dữ liệu để chắc": "ยังไม่พบจุดที่เข้ากันไม่ได้ แต่ข้อมูลยังไม่พอจะยืนยันได้",
  "Còn thưa": "ยังเลี้ยงเพิ่มได้",
  "Cần để ý, và chưa đủ dữ liệu để chắc": "ต้องคอยสังเกต และข้อมูลยังไม่พอจะยืนยันได้",
  "Hiền": "นิสัยสงบ",
  "Hung dữ": "ดุร้าย",
  "Hơi dữ": "ค่อนข้างดุ",
  "Không nên nuôi chung": "ไม่ควรเลี้ยงรวมกัน",
  "Nuôi chung được": "เลี้ยงรวมกันได้",
  "Nuôi chung được, nhưng cần để ý": "เลี้ยงรวมกันได้ แต่ต้องคอยสังเกต",
  "Nuôi {name} theo đàn từ {n} con.": "เลี้ยง{name}เป็นฝูงตั้งแต่ {n} ตัวขึ้นไป",
  "Quá tải": "หนาแน่นเกินไป",
  "Săn mồi": "ล่าเหยื่อ",
  "Vừa phải": "ปานกลาง",
  "bể ổn định với lọc và thay nước thường lệ.": "ตู้จะคงที่ได้ด้วยระบบกรองและการเปลี่ยนน้ำตามปกติ",
  "bớt cá hoặc dùng bể lớn hơn.": "ลดจำนวนปลาหรือใช้ตู้ที่ใหญ่ขึ้น",
  "chưa có {fields} của {name}": "ยังไม่มีข้อมูล{fields}ของ {name}",
  "cần lọc tốt và thay nước đều mỗi tuần.": "ต้องมีระบบกรองที่ดีและเปลี่ยนน้ำสม่ำเสมอทุกสัปดาห์",
  "kích thước": "ขนาด",
  "nhiệt độ": "อุณหภูมิ",
  "nhiệt độ không có khoảng chung": "ช่วงอุณหภูมิไม่ทับซ้อนกัน",
  "nước có khoảng chung, kích thước và tính cách hợp nhau": "ค่าน้ำมีช่วงที่ทับซ้อนกัน ขนาดและนิสัยเข้ากันได้",
  "pH không có khoảng chung": "ช่วงค่า pH ไม่ทับซ้อนกัน",
  "thả thêm được.": "ยังเพิ่มปลาได้อีก",
  "tính cách": "นิสัย",
  "{big} ({bigCm} cm) có thể ăn {small} ({smallCm} cm).": "{big} ({bigCm} cm) อาจกิน {small} ({smallCm} cm) ได้",
  "{big} có thể ăn {small}": "{big} อาจกิน {small}",
  "{name} có thể rượt đuổi {others}": "{name} อาจไล่ {others}",
  "{name} cần bể dài từ {n} cm.": "{name} ต้องใช้ตู้ยาวตั้งแต่ {n} cm ขึ้นไป",
  "{name} hay cắn vây": "{name} ชอบตอดครีบ",
  "{name} hay cắn vây cá khác: tránh nuôi chung với cá vây dài, bơi chậm.": "{name} มักกัดครีบปลาอื่น ควรหลีกเลี่ยงการเลี้ยงร่วมกับปลาครีบยาวที่ว่ายช้า",
  "{name} hung dữ": "{name} ดุร้าย",
  "{name} hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.": "{name} ดุร้าย มักต้องเลี้ยงเดี่ยวหรือเลี้ยงในตู้ชนิดเดียว",
  "{name} hơi dữ, có thể rượt đuổi {others}. Cần bể rộng, nhiều chỗ trốn.": "{name} ค่อนข้างดุ อาจไล่กัด {others} ต้องใช้ตู้กว้างและมีที่หลบซ่อนมาก",
  "{name} là cá săn mồi": "{name} เป็นปลานักล่า",
  "{name} là cá săn mồi: con nào vừa miệng đều có thể bị ăn.": "{name} เป็นปลานักล่า ตัวใดที่ขนาดพอดีปากอาจถูกกินได้",
  "{name} sống theo đàn: nên nuôi từ {min} con (đang chọn {count}).": "{name} อยู่เป็นฝูง ควรเลี้ยงอย่างน้อย {min} ตัว (เลือกไว้ {count})",
  "Đã đầy": "เต็มแล้ว",
  "độ cứng": "ความกระด้าง",
  "độ cứng không có khoảng chung": "ช่วงความกระด้างไม่ทับซ้อนกัน"
 }
};
(() => {
  // apps/site/src/i18n/msg.ts
  var msg = (s) => s;

  // apps/site/src/scripts/calc.ts
  var WATER_SHARE = 0.85;
  function tankVolume(lengthCm, widthCm, heightCm) {
    const litres = lengthCm * widthCm * heightCm / 1e3;
    return { litres, water: litres * WATER_SHARE };
  }

  // apps/site/src/scripts/stocking.ts
  var UNIT_CM = 3.5;
  var LITRES_PER_UNIT = 1.5;
  var bioload = (sizeCm) => (sizeCm / UNIT_CM) ** 2.25;
  var levelOf = (p) => p < 50 ? "light" : p < 85 ? "ok" : p <= 100 ? "full" : "over";
  function stocking(fish, waterLitres, o = {}) {
    const sized = fish.filter((f) => f.sizeCm && f.count > 0);
    const units = sized.map((f) => ({ name: f.name, units: f.count * bioload(f.sizeCm) }));
    const total = units.reduce((a, f) => a + f.units, 0);
    const percent = waterLitres > 0 ? total * LITRES_PER_UNIT * 100 / waterLitres : Infinity;
    return {
      percent,
      level: levelOf(percent),
      perFish: units.map((f) => ({ ...f, share: total ? f.units / total : 0 })).sort((a, b) => b.units - a.units),
      unknown: fish.filter((f) => !f.sizeCm).map((f) => f.name),
      school: fish.filter((f) => f.schoolMin && f.count > 0 && f.count < f.schoolMin).map((f) => ({ name: f.name, count: f.count, min: f.schoolMin })),
      tooShort: o.tankCm ? fish.filter((f) => f.tankCm && f.tankCm > o.tankCm).map((f) => ({ name: f.name, tankCm: f.tankCm })) : [],
      ...o.filterLph && o.grossLitres ? { turnover: o.filterLph / o.grossLitres } : {}
    };
  }

  // apps/site/src/scripts/tankmates.ts
  var EAT_RATIO = 3;
  var TEMPERAMENT_LABELS = { peaceful: msg("Hiền"), "semi-aggressive": msg("Hơi dữ"), aggressive: msg("Hung dữ"), predator: msg("Săn mồi") };
  function behaviour(fish, ct) {
    const notes = [];
    for (const f of fish) {
      const others = fish.filter((o) => o !== f);
      if (f.temperament === "aggressive") notes.push({ level: "bad", text: ct("{name} hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.", { name: f.name }), short: ct("{name} hung dữ", { name: f.name }) });
      if (f.temperament === "predator") notes.push({ level: "bad", text: ct("{name} là cá săn mồi: con nào vừa miệng đều có thể bị ăn.", { name: f.name }), short: ct("{name} là cá săn mồi", { name: f.name }) });
      if (f.temperament === "semi-aggressive") {
        const meek = others.filter((o) => o.temperament === "peaceful").map((o) => o.name);
        if (meek.length) notes.push({ level: "warn", text: ct("{name} hơi dữ, có thể rượt đuổi {others}. Cần bể rộng, nhiều chỗ trốn.", { name: f.name, others: meek.join(", ") }), short: ct("{name} có thể rượt đuổi {others}", { name: f.name, others: meek.join(", ") }) });
      }
      if (f.finNipper) notes.push({ level: "warn", text: ct("{name} hay cắn vây cá khác: tránh nuôi chung với cá vây dài, bơi chậm.", { name: f.name }), short: ct("{name} hay cắn vây", { name: f.name }) });
    }
    for (const f of fish) if (f.schoolMin) notes.push({ level: "info", text: ct("Nuôi {name} theo đàn từ {n} con.", { name: f.name, n: f.schoolMin }) });
    return notes;
  }
  function checkTankmates(fish, ct) {
    const params = ["tempC", "ph", "gh"].map((field) => {
      const known = fish.filter((f) => f[field]);
      const missing = fish.filter((f) => !f[field]).map((f) => f.name);
      if (known.length === 0) return { field, missing };
      const min = Math.max(...known.map((f) => f[field].min));
      const max = Math.min(...known.map((f) => f[field].max));
      return { field, missing, ...min <= max ? { shared: { min, max } } : {} };
    });
    const sized = fish.filter((f) => f.sizeCm).sort((a, b) => b.sizeCm - a.sizeCm);
    const eats = sized.flatMap((big, i) => sized.slice(i + 1).filter((s) => big.sizeCm >= EAT_RATIO * s.sizeCm).map((s) => ({ big: big.name, bigCm: big.sizeCm, small: s.name, smallCm: s.sizeCm })));
    const tanks = fish.flatMap((f) => f.tankCm ? [f.tankCm] : []);
    return { params, eats, notes: behaviour(fish, ct), ...tanks.length ? { minTankCm: Math.max(...tanks) } : {} };
  }
  function verdictOf(fish, r, ct) {
    const eaters = [...new Set(r.eats.map((e) => e.big))];
    const no = [
      ...eaters.map((big) => ct("{big} có thể ăn {small}", { big, small: r.eats.filter((e) => e.big === big).map((e) => e.small).join(", ") })),
      ...r.params.filter((p) => !p.shared && fish.length - p.missing.length >= 2).map((p) => ct(CLASH[p.field])),
      ...r.notes.filter((n) => n.level === "bad").map((n) => n.short ?? n.text)
    ];
    const care = r.notes.filter((n) => n.level === "warn").map((n) => n.short ?? n.text);
    const gaps = fish.flatMap((f) => {
      const lack = GAP_FIELDS.filter((k) => f[k] === void 0).map((k) => ct(GAP_LABEL[k]));
      return lack.length ? [ct("chưa có {fields} của {name}", { fields: lack.join(", "), name: f.name })] : [];
    });
    if (no.length) return { level: "no", head: ct("Không nên nuôi chung"), reasons: no, gaps };
    if (care.length && gaps.length) return { level: "unsure", head: ct("Cần để ý, và chưa đủ dữ liệu để chắc"), reasons: [...care, ...gaps], gaps };
    if (care.length) return { level: "care", head: ct("Nuôi chung được, nhưng cần để ý"), reasons: care, gaps };
    if (gaps.length) return { level: "unsure", head: ct("Chưa thấy điểm xung khắc, nhưng chưa đủ dữ liệu để chắc"), reasons: gaps, gaps };
    return { level: "yes", head: ct("Nuôi chung được"), reasons: [ct("nước có khoảng chung, kích thước và tính cách hợp nhau")], gaps };
  }
  var CLASH = { tempC: msg("nhiệt độ không có khoảng chung"), ph: msg("pH không có khoảng chung"), gh: msg("độ cứng không có khoảng chung") };
  var GAP_FIELDS = ["tempC", "ph", "gh", "sizeCm", "temperament"];
  var GAP_LABEL = { tempC: msg("nhiệt độ"), ph: "pH", gh: msg("độ cứng"), sizeCm: msg("kích thước"), temperament: msg("tính cách") };

  // apps/site/src/scripts/tank-check.ts
  var same = (s) => s;
  var verdictSentence = (v, esc = same, strong = same) => `${strong(esc(v.head))}: ${v.reasons.map(esc).join("; ")}.`;
  var warningsOf = (r, ct, fmt, esc = same) => [
    ...r.eats.map((e) => ct("{big} ({bigCm} cm) có thể ăn {small} ({smallCm} cm).", { big: esc(e.big), bigCm: fmt(e.bigCm), small: esc(e.small), smallCm: fmt(e.smallCm) })),
    ...r.notes.filter((n) => n.level !== "info").map((n) => esc(n.text))
  ];
  var stockingNotes = (s, ct, fmt, esc = same) => [
    ...s.school.map((x) => ct("{name} sống theo đàn: nên nuôi từ {min} con (đang chọn {count}).", { name: esc(x.name), min: x.min, count: x.count })),
    ...s.tooShort.map((x) => ct("{name} cần bể dài từ {n} cm.", { name: esc(x.name), n: fmt(x.tankCm) })),
    ...s.unknown.length ? [unsizedNote(s.unknown, ct, esc)] : []
  ];
  var unsizedNote = (names, ct, esc = same) => ct("Chưa có kích thước của {names}: chưa tính vào mật độ.", { names: names.map(esc).join(", ") });
  function tankCheck(fish, size, ct, fmt) {
    const mates = fish;
    const r = checkTankmates(mates, ct);
    const out = { warnings: [] };
    if (fish.length >= 2) {
      const v = verdictOf(mates, r, ct);
      out.verdict = { level: v.level, text: verdictSentence(v) };
      out.warnings = warningsOf(r, ct, fmt);
    }
    const water = size.litres ? size.litres * WATER_SHARE : size.dims ? tankVolume(size.dims.l, size.dims.w, size.dims.h).water : void 0;
    const counted = fish.map((f) => ({ name: f.name, count: f.count ?? f.schoolMin ?? 1, sizeCm: f.sizeCm, schoolMin: f.schoolMin, tankCm: f.tankCm }));
    if (fish.length && !fish.some((f) => f.sizeCm)) {
      out.unsized = unsizedNote(fish.map((f) => f.name), ct);
    } else if (fish.length && water) {
      const s = stocking(counted, water, { tankCm: size.dims?.l });
      const [label, advice] = LEVEL[s.level];
      out.stocking = { percent: Math.round(s.percent), level: s.level, text: `${fmt(s.percent, 0)}% · ${ct(label)}: ${ct(advice)}`, notes: stockingNotes(s, ct, fmt) };
    }
    if (!size.dims && r.minTankCm) {
      out.minTank = ct("Bể dài tối thiểu cho cả nhóm: <strong>{n} cm</strong>.", { n: fmt(r.minTankCm) }).replace(/<\/?strong>/g, "");
    }
    return out;
  }
  var LEVEL = {
    light: [msg("Còn thưa"), msg("thả thêm được.")],
    ok: [msg("Vừa phải"), msg("bể ổn định với lọc và thay nước thường lệ.")],
    full: [msg("Đã đầy"), msg("cần lọc tốt và thay nước đều mỗi tuần.")],
    over: [msg("Quá tải"), msg("bớt cá hoặc dùng bể lớn hơn.")]
  };

  // apps/site/app-tank-check
  var formats = {};
  globalThis.aqTankCheck = (input) => {
    const { lang, fish, size } = JSON.parse(input);
    const dict = aqTankCheckStrings[lang] ?? {};
    const ct = (s, vars) => {
      const t = dict[s] ?? s;
      return vars ? t.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m) : t;
    };
    const fmt = (n, d = 1) => {
      var _a;
      return (formats[_a = lang + d] ?? (formats[_a] = new Intl.NumberFormat(lang, { maximumFractionDigits: d }))).format(n);
    };
    return JSON.stringify(tankCheck(fish, size, ct, fmt));
  };
})();
