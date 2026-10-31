# Aquarium device control: market and feasibility research

For: AquaTome (aquatome.com), VN / ID / TH audience
Date: 2026-10-31
Scope: which aquarium devices an AquaTome app could connect to and control over Bluetooth or Wi-Fi, and in what order to support them.

---

## TL;DR

- **Lights first: Chihiros (BLE), then Week Aqua (BLE).** Both are sold widely in Vietnamese aquascape shops, and Chihiros is also easy to find in Thailand. Both have open-source BLE implementations. Chihiros has a written protocol doc: plaintext frames, an XOR checksum, no encryption.
- **Most popular CO2 timing in VN right now is a Tuya "Smart Life" Wi-Fi timer strip.** VN aquascape shops sell 4-outlet strips aimed at lights, CO2 and filter for ₫435–450k. These are cloud devices, so a browser app can't reach them without a backend.
- **A web-only app on aquatome.com can reach BLE devices and nothing else.** That works on Chrome or Edge on Android and desktop. It does not work on iPhone Safari, or in any iOS browser except Web-BLE browsers such as Bluefy. Local Wi-Fi devices (EHEIM, Red Sea, Apex, Jebao) and cloud devices (Tuya, Tapo, Xiaomi) need a native app or a server.
- **Web Bluetooth has no background mode, and that's OK.** Chihiros, Week Aqua and Fluval lights all store their schedules on the fixture. The app sets them up and then isn't needed.
- **iPhone matters in Vietnam:** iOS is about 40% of mobile in VN, 21% in ID and 26% in TH (StatCounter, Sep 2026). So plan a Capacitor wrapper (same TypeScript BLE code) soon after a web v1.
- **#1 thing to test before building:** check whether Chrome on Android lists a Chihiros WRGB II in its Bluetooth device picker. One open-source author says Chihiros uses BLE 5 extended advertising, which older hardware can't see.
- **Official apps rate badly:** My Chihiros 1.0★ (3 UK ratings), WEEK AQUA 2.5★ (24), TWINSTAR LightControl 1.6★ (20). There is room for a better app.
- **Reef gear** (Red Sea, AI, EcoTech, Apex, GHL, Kessil) is technically reachable, but I found no evidence it sells in volume in VN/ID/TH. Leave it for later.

Confidence labels used below: **High** = several independent shop/distributor pages in that country. **Medium** = one or two sources. **Low** = indirect or none. **Unconfirmed** = I could not find a primary source.

Owner's rule followed: no Shopee, Lazada or Tiki pages were fetched or cited. Tokopedia appears only as a search-result mention (not fetched). ThaiPick pages, which mirror Shopee, are not used.

---

## 1. Brand-by-brand overview

### 1.1 Summary table

| Brand / line | Device types | Connection | Official app | Protocol status (open library) | Code licence | Price band (seen) | VN / ID / TH presence |
|---|---|---|---|---|---|---|---|
| **Chihiros** (WRGB II, A II, B, Universal WRGB, Commander, Doctor, dosing pump, CO2 controller, heater, Wi-Fi Hub) | Light, doser, CO2 solenoid timer, heater, algae "Doctor", fan, smart power strip | BLE; optional Wi-Fi Hub (cloud) | My Chihiros | Reverse-engineered, **documented protocol** (TheMicDiet, AquaBle, chihiros-esphome) | MIT (TheMicDiet, AquaBle); esphome repo: none stated | VN ₫0.45–5M; TH ฿2,850–14,500; ID Rp2.29–2.95M (WRGB II Slim) | VN **High**, TH **High**, ID **Medium-High** |
| **Week Aqua** (M / L / P / Z Pro) | Light (RGB-UV), fan | BLE | WEEK AQUA | Reverse-engineered (3 repos); several protocol variants by model code | MIT (alokauz); none stated (smaurer3, ad960009) | VN ₫0.99–4.5M; TH ฿1,450–4,700 | VN **High**, TH **Medium**, ID **Low** |
| **Twinstar** (B / C / S Line + LightControl dongle) | Light | BLE (LightControl dongle) | TWINSTAR LightControl | **No open library found** | n/a | VN B Line ₫1.19M; LightControl ≈ US$37 | VN **Medium**; ID/TH unconfirmed |
| **Jebao** (MDP/EP Wi-Fi pumps, MOW wavemakers, MD-4.4 / Doser 3.4) | Pump, wavemaker, doser | Wi-Fi (2.4 GHz) | Jebao Aqua | Doser: reverse-engineered **local TCP** library. Pumps/wavemakers: none found | MIT (jebao-md44) | VN pumps ₫2.65–4.4M | VN **Medium** (reef/large-tank shops) |
| **Sunsun** | Filters, pumps (mostly non-smart); some "smart" pump/heater/tank | Wi-Fi (app exists; transport unconfirmed) | SunsunHome | **None found** | n/a | — | VN **High for non-smart gear**; smart models unconfirmed |
| **Hidom** | DC pumps with wired controller | No Wi-Fi/app found | — | n/a | n/a | — | Wi-Fi models **unconfirmed** |
| **Nicrew** | Lights | App control **unconfirmed** (external controller mentioned) | — | None found | n/a | — | Unconfirmed |
| **Hygger** (HG-028 BT light) | Light | BLE, reportedly via Tuya Smart app | Tuya Smart (per one review) | Tuya BLE: local control needs keys from Tuya cloud | n/a | — | Unconfirmed |
| **Fluval** (Plant 3.0/4.0, Aquasky 2.0/3.0) | Light | BLE | FluvalSmart → FluvalConnect | Reverse-engineered, incl. Fluval's "encryption" (fluvalble) | Apache-2.0 | — (not checked) | **No SEA evidence found** |
| **EHEIM Digital** (professionel 5e, classicLEDcontrol+e, thermocontrol+e, autofeeder+, reeflexUV+e) | Filter, light, heater, feeder, UV, pH | Wi-Fi, **local HTTP/WebSocket** to a "main device" | Browser UI on the device (no app needed per EHEIM) | Unofficial library, **in Home Assistant core** (eheimdigital); origin not stated, no vendor API docs found | MIT | 5e 350 ≈ US$400–470; LEDcontrol+e ≈ US$139; thermocontrol+e ≈ €56–88 | **No SEA evidence found** |
| **Kessil** (A360X + Wi-Fi dongle) | Light | Wi-Fi dongle (2.4 GHz) | Kessil app | **None found** | n/a | — | No SEA evidence |
| **Red Sea** (ReefLED, ReefDose, ReefWave, ReefRun, ReefMat, ReefATO+) | Light, doser, wavemaker, pump, roller mat, ATO | Wi-Fi, local HTTP + cloud | ReefBeat | Reverse-engineered **local** API (ha-reefbeat-component) | MIT | ReefLED 90 ≈ CA$599 | No SEA evidence |
| **AquaIllumination Hydra** | Light | Wi-Fi local; BLE on Mobius-era models | myAI | Reverse-engineered (AquaIPy, aqua_illumination-ha); also python-mobius | — / GPLv2 (python-mobius) | Hydra 32HD ≈ US$430 (one listing) | No SEA evidence |
| **EcoTech** (Radion, VorTech via Mobius) | Light, wavemaker | BLE ("Mobius", Thread mesh between devices) | Mobius | Reverse-engineered (python-mobius, alpha) | **GPLv2** | — (not checked) | No SEA evidence |
| **Neptune Apex** | Controller (probes, outlets) | Wi-Fi/LAN, local REST (undocumented) | Apex Fusion | Reverse-engineered (apex-ha, MQTT bridges) | — | A3 Apex Pro US$989.99 | No SEA evidence |
| **GHL** (ProfiLux 4, Mitras LX7/LX8) | Controller, light, doser | LAN, TCP or WebSocket | GHL Connect / Control Center | **Official API** (as-is, no support) | Vendor docs | — (not checked) | No SEA evidence |
| **Zetlight** | Light | Wi-Fi (A100/A200 switch or built-in); some listings say Wi-Fi + BLE | ZetLight System / Horizon (conflicting) | None found | n/a | — | Singapore shops list it; VN/ID/TH unconfirmed |
| **Inkbird** (ITC-306A aquarium heater controller) | Heater controller | Wi-Fi via **Tuya** (listed in tuya-local) | INKBIRD app | Via Tuya libraries | — | — (fetch failed) | Unconfirmed |
| **Xiaomi Mijia smart fish tank** (MYG100; 2 Pro is China-only) | All-in-one tank: light, pump, feeder | Wi-Fi, Xiaomi cloud (MIoT) | Mi Home | Generic MIoT support (hass-xiaomi-miot), tokens from Xiaomi account | Apache-2.0 | VN ≈ ₫1.5–2.6M | VN **Low-Medium** |
| **Tuya Wi-Fi plugs / timer strips** (white-label) | Light/CO2/filter on-off, power meter | Wi-Fi, Tuya cloud; local with "local key" | Smart Life / Tuya Smart | Official cloud API; local via tinytuya / LocalTuya / tuya-local | MIT (tinytuya) | VN 4-outlet aquascape strip ₫435–450k | VN **High**; ID/TH generic plugs common (Medium) |
| **TP-Link Tapo / Kasa plugs** | On/off, energy metering | Wi-Fi; local API needs TP-Link account login; P110M also Matter | Tapo | Official HA integration, local; HA docs point to python-kasa | — | P110M ≈ US$30 | VN **Medium** (sold by VN smart-home shops) |

### 1.2 Notes per brand (with sources)

**Chihiros**
- The official app is **My Chihiros**, from Shanghai Ogino Biotechnology. It lists 28 device types, including WRGB 2, Universal WRGB, A series II, B series, Doctor, Dosing Pump (and Pro), Wi-Fi Hub (and Pro), cooling fan and Smart Power Strip. It has 1.0★ from 3 UK ratings, and the reviews complain about connection problems. [App Store](https://apps.apple.com/gb/app/my-chihiros/id1478240739)
- **"Magic app": I found no Chihiros app by that name.** The only one I found is "My Chihiros". [search, retailer pages e.g. Aquasabi Magnetic Light 2](https://www.aquasabi.com/Chihiros-Magnetic-Light-2) → *open question for the owner*.
- WRGB II has a built-in BLE controller. Wi-Fi control needs the separate Wi-Fi Hub. [natureaquariums.com.au](https://www.natureaquariums.com.au/products/chihiros-wrgb-with-bluetooth) The Wi-Fi Hub Pro bridges BLE devices to the cloud; retailers say it handles up to 20 devices. [Aquasabi](https://www.aquasabi.com/Chihiros-Wifi-Hub-PRO)
- The BLE CO2 controller switches the solenoid on Chihiros regulators and is programmed in My Chihiros. [Aquasabi](https://aquasabi.com/Chihiros-Controller-for-CO2-Pressure-Regulator-with-Solenoid-Valve)
- **Open library: [TheMicDiet/chihiros-led-control](https://github.com/TheMicDiet/chihiros-led-control)** (MIT, Python CLI + HA integration)
  - Supports about 20 LED models (WRGB II / Pro / Slim, A2, C II, Universal WRGB, Commander 1/4, Vivid…), dosing pumps (`DYDOSE*`), heaters (`DYHET*`), and magnetic stirrers.
  - Features: per-channel brightness, on-device schedules with ramp, auto/manual mode, manual dosing, calibration, and reading dose totals and heater temperature/power.
  - The [protocol doc](https://github.com/TheMicDiet/chihiros-led-control/blob/main/docs/protocol.md) describes the Nordic-UART-style service `6e400001-…` with write `…0002` and notify `…0003`. Frames are `[0x5a|0xa5|0x5f, 0x01, len, msgId(2), cmd, params…, XOR]`. Brightness is `0x5a/0x07 [channel, level]`; schedules are `0xa5/0x19` (sunrise/sunset, ramp, weekday mask, per-channel levels); clock set is `0x5a/0x09`. **No encryption or authentication is described.**
  - Caveat from the author: some commands were derived from the APK only and not tested on hardware.
- [caleb-venner/AquaBle](https://github.com/caleb-venner/AquaBle) (MIT, HACS) builds on TheMicDiet. Lights: per-channel RGBW, auto schedules with sunrise/sunset/ramp, auto/manual/off. Doser: per-head daily schedules with weekdays, one-shot dose, and dosed-today readback.
- [BartdeJonge/chihiros-esphome](https://github.com/BartdeJonge/chihiros-esphome) (**no licence stated**) is an ESP32-S3 bridge for the **CO2 controller**, magnetic stirrer, cooling fan, Doctor Mate, WRGB II and dosing pump. It connects, sends and disconnects, because "devices run their schedules from their internal clocks." The author claims **"Chihiros devices use BLE 5.0 extended advertising"**, which means an ESP32 with BLE 4.2 can't see them. [HA forum post, Jun 2026](https://community.home-assistant.io/t/control-chihiros-aquarium-devices-from-home-assistant-via-esphome-ble-bridge-no-cloud-no-app/1013388) → **must test with Chrome on Android (see §4).**
- **SEA evidence (High in VN/TH, Medium-High in ID)**
  - VN shops: [Thủy Sinh 4U](https://thuysinh4u.com/danh-muc/phu-kien-thuy-sinh/den-thuy-sinh/chihiros) lists 20 Chihiros items, e.g. WRGB 2 ₫1.64–2.21M, WRGB 2 Pro ₫2.9–3.45M, A2 ₫1.12M, B series ₫0.87M, Doctor BT ₫1.61M. Also [Thủy Sinh Tím](https://thuysinhtim.vn/den-led-chihiros-b-series), [Vũ Aqua](https://vuaqua.vn/den/chihiros/), [Phương Nhi](https://phuongnhiaquarium.vn/products/den-chihiros-wrgb) and [Quoi Decor](https://thuysinhquoidecor.com/san-pham/den-led-chihiros-a-series/).
  - TH: [Tailybuddy](https://tailybuddy.com/product/8893/chihiros-wrgb-ii-30-120-aquari) WRGB II ฿3,950–14,500; [Thai Aquarium Center](https://thaiaquariumcenter.tarad.com/products_detail/view/7556847) WRGB II 45 ฿6,250; [GreeeenScape](https://greeeenscape.com/?product=chihiros-wrgb-2-pro-built-in-bluetooth-%E0%B9%84%E0%B8%9F%E0%B9%84%E0%B8%A1%E0%B9%89%E0%B8%99%E0%B9%89%E0%B8%B3-%E0%B9%84%E0%B8%9F%E0%B9%80%E0%B8%A5%E0%B8%B5%E0%B9%89%E0%B8%A2%E0%B8%87%E0%B9%84) WRGB 2 Pro ฿5,950; and a [Thai YouTube review](https://www.youtube.com/watch?v=0XO71ImcXxs).
  - ID: [Chihiros Indonesia (Facebook)](https://www.facebook.com/ChihirosIndonesia/) presents itself as the authorised distributor. [my-best ID](https://id.my-best.com/138821) lists WRGB 2 Slim at Rp2.29–2.95M. Also [Makassar Hobi](https://makassarhobi.com/product/lampu-chihiros-a-601-led-light-lighting-system-a-series-60cm-39w-a601/). A "Chihiros Official" Tokopedia store appears in search results (not fetched).

**Week Aqua**
- The official app is WEEK AQUA, by developer 周 段 (© 威尔康). It uses BLE and offers on/off, brightness, single-channel dimming, fan, multi-segment timers and sunrise/sunset. It has 2.5★ from 24 ratings, and reviewers say v3.0 removed features. [App Store](https://apps.apple.com/app/id1536538648) The Android package `com.weekled.weekaquas` shows 10k+ installs, per a third-party aggregator (unconfirmed). [APKCombo](https://apkcombo.com/week-aqua/com.weekled.weekaquas)
- **Open implementations (all reverse-engineered, all local BLE):**
  - [alokauz/ha-weekaqua](https://github.com/alokauz/ha-weekaqua) (**MIT**) covers model code **5746** ("WEK" protocol), R/G/B/UV + fan, tested on an L600 Pro. Features: per-channel sliders, fan, presets, on-device schedule, clock sync, plus CO2 interlock/control helpers. The author says codes 5745 and 5747–5752 use **different protocols** and aren't supported yet.
  - [smaurer3/homeassistant-weekaqua](https://github.com/smaurer3/homeassistant-weekaqua) (**no licence**, tested on M800 Pro K) does per-channel 0–100%, the daily on/off schedule and sunrise/sunset fade. There's no true "off" command. The phone app holds the connection, so you may need to force-stop it.
  - [ad960009/WeekAquaProject](https://github.com/ad960009/WeekAquaProject) (**no licence**) covers model codes 5745–5752 with 5/8/12-slot schedules, time sync and fan, and ships a protocol spec plus a Windows tool. HA side: [ad960009/ha-weekaqua](https://github.com/ad960009/ha-weekaqua).
  - **Key limit: Week Aqua lights do not report their state.** All three repos say the app can only show the last values it sent.
- **SEA evidence (VN High, TH Medium, ID Low)**
  - VN: [Vua Aqua](https://vuaqua.vn/week/den-week-l1200-pro/) L1200 Pro ₫3.1M; [Bách Khoa Aqua](https://bachkhoaaqua.com/san-pham/led-week-aqua-phien-ban-moi-p-pro-rgb-series) P Pro ₫2.85–4.5M; [ICDI](https://www.icdi-aquarium.com/den-thuy-sinh-week-m-pro-series) M Pro ₫993k; also [AquaZone](https://aquazonefish.vn/collections/vendors?q=week-aqua), [Bucep Việt](https://bucepviet.vn/den-week-m-raptor-pro-m-pro-series), [Shrimp Home](https://shrimphome.vn/week), [Phương Nhi](https://phuongnhiaquarium.vn/products/den-weekaqua-v-series) and [Ylang (Đà Nẵng)](https://cuahangthuysinh.vn/san-pham/den-thuy-sinh-week-pro-l-series-week-aqua/).
  - TH: [Aquamania](https://www.aquamaniath.com/product/456/week-aqua-m-series-%E0%B9%82%E0%B8%84%E0%B8%A1%E0%B9%84%E0%B8%9F%E0%B9%80%E0%B8%A5%E0%B8%B5%E0%B9%89%E0%B8%A2%E0%B8%87%E0%B9%84%E0%B8%A1%E0%B9%89%E0%B8%99%E0%B9%89%E0%B8%B3-%E0%B9%81%E0%B8%9A%E0%B8%9A-rgb-30cm-60cm) M Series ฿1,450–1,950; L 600D Pro "Bluetooth 3.0" ≈ ฿4,700.
  - ID: no local shop evidence found in this pass.

**Twinstar**
- The **TWINSTAR LightControl** app (Twinstar Inc) controls a BLE dimmer dongle. Standard = 1 channel; Pro = 4 channels (R/G/B/plant). It offers timers and sunrise/sunset. It has 1.6★ from 20 ratings and was first released 27 Mar 2025. The years on the 2.x versions are not shown. [App Store](https://apps.apple.com/app/id6743735243)
- Retailers say the dongle doesn't fit lights with a built-in inline controller. [Aquaforest](https://aquaforestaquarium.com/products/twinstar-lightcontrol-standard)
- **No open-source protocol found.**
- VN: B Line ₫1.19M and C Line III ₫1.39M at [Thủy Sinh Tím](https://thuysinhtim.vn/den-thuy-sinh-twinstar-b-line); also [Shrimp Home](https://shrimphome.vn/twinstar). LightControl ≈ US$36.99 at [Buce Plant](https://buceplant.com/products/twinstar-lightcontrol).

**Jebao**
- Wi-Fi (2.4 GHz only) pumps, wavemakers and dosers use the **Jebao Aqua** app. Setup is AP-mode, then home Wi-Fi. [Reef2Reef](https://www.reef2reef.com/threads/jebao-wifi.936843/)
- Doser MD-4.4: [jebao-md44 on PyPI](https://pypi.org/project/jebao-md44/) (MIT, v0.1.0, Jan 2026) uses **local TCP port 12416** with UDP discovery. It can start/stop pumps and read status. It is based on [tancou/jebao-dosing-pump-md-4.4](https://github.com/tancou/jebao-dosing-pump-md-4.4).
- **No open library found for MDP/EP pumps or MOW wavemakers.**
- VN: [Soha Aqua](https://sohaaqua.com/san-pham/bom-jebao-mdp-20000-dieu-khien-wifi-sieu-manh-danh-cho-khung) MDP-20000 Wi-Fi ₫4.4M; [EP-10000M](https://sohaaqua.com/san-pham/bom-jebao-ep-10000m-wifi-moi-nhat-2023-dieu-khien-qua-app) ₫2.65M (AP mode, feed timer); [MOW-22](https://sohaaqua.com/san-pham/tao-song-jebao-mow-22-thong-minh-wifi-man-hinh-lcd); and the DMP-30 is reportedly **Bluetooth** (unconfirmed).

**Sunsun / Hidom**
- Sunsun's app is **SunsunHome**, from Sensen Group (森森集团). Its release notes mention a smart fish tank, a variable-frequency pump, a heating rod and a pet feeder. The listing doesn't say whether it uses Wi-Fi or BLE. It has 4 ratings. [App Store](https://apps.apple.com/app/id1313653267) **No protocol library found.**
- Sunsun's mainstream VN products are non-smart filters and pumps. [Bucep Việt XQP](https://bucepviet.vn/may-bom-chim-sunsun-xqp), [bomhoca.com Sunsun brand page](https://bomhoca.com/product_brand/sunsun/)
- Hidom: the listings I found show DC pumps with a wired 12-step controller and no app. [eBay listing](https://www.ebay.co.uk/itm/254961938338) Wi-Fi Hidom is **unconfirmed**.

**Nicrew / Hygger**
- Nicrew: I found no official app. One guide says full control needs an external Nicrew controller. **Unconfirmed.**
- Hygger HG-028 "Bluetooth LED with app control" is sold at AU retailers. [Harvey Norman](https://www.harveynorman.com.au/hygger-aquarium-bluetooth-60w-led-light-with-app-control.html) One customer review says the app is **Tuya Smart** (unconfirmed). If it is Tuya BLE, local control needs a device key from the Tuya cloud. [ha_tuya_ble](https://github.com/PlusPlus-ua/ha_tuya_ble)

**Fluval**
- Plant 3.0 and Aquasky 2.0 were controlled by **FluvalSmart** (Aquasky 2.0 "exclusively via the FluvalSmart App"). [fluvalaquatics.com (DE)](https://fluvalaquatics.com/de/?p=215682) Fluval's FAQ says the newer **FluvalConnect** app has a "Bluetooth 1st Gen" section for older lights. This is from a search snippet; the page returned 403 to me. [fluvalaquatics.com FAQ](https://fluvalaquatics.com/us/faqs/fluvalconnect)
- [nphil/fluvalble](https://github.com/nphil/fluvalble) (**Apache-2.0**) is a local BLE HA integration covering Aquasky 2.0/3.0, Plant 3.0/4.0/Nano/PRO, Marine/Reef 3.0/4.0 and first-gen lights. It handles colour, Manual/Auto/Pro modes and on-fixture schedules, with mode/schedule readback. It credits [mrzottel](https://community.home-assistant.io/t/fluval-aquasky-ble-rgb-light/259598), who reverse-engineered what Fluval calls "encryption".
- No SEA distribution evidence found.

**EHEIM Digital**
- Wi-Fi devices group into a mesh-like setup run by a "main device". EHEIM says the autofeeder+ "needs no app" and works from a phone, tablet or PC browser. [EHEIM autofeeder+](https://eheim.com/en_GB/aquatics/accessories/feeding/autofeeder/eheim-autofeeder)
- The **official Home Assistant integration** (since 2025.1) talks locally to `eheimdigital.local` and polls every 15 s. [HA docs](https://www.home-assistant.io/integrations/eheimdigital)
  - classicLEDcontrol+e: brightness for 2 channels, day-cycle.
  - thermocontrol+e: target temperature, Bio/Smart modes, night offset.
  - classicVARIO+e and professionel 5e: speed, Pulse/Bio/Constant modes, service hours, pump on/off.
  - reeflexUV+e is also supported. Other devices are not yet supported.
- Library: [autinerd/eheimdigital](https://github.com/autinerd/eheimdigital) (MIT). Prices are in the table above, from [Bulk Reef Supply](https://www.bulkreefsupply.com/brands/eheim.html) and [Fishtanks Direct](https://fishtanksdirect.com/eheim-ledcontrol-e-wireless-controller/). No SEA evidence for the Digital line.

**Reef brands (low SEA priority)**
- **Red Sea**: [Elwinmage/ha-reefbeat-component](https://github.com/Elwinmage/ha-reefbeat-component) (MIT) gives local control of ReefLED G1/G2, ReefDose 2/4, ReefWave, ReefRun, ReefMat, ReefATO+ and ReefControl. The cloud is optional (wave/LED libraries, firmware notices). Its stated stance: "not an official RedSea repository."
- **AquaIllumination**: "no documented API… all reverse engineered." [mcclown repo](https://github.com/mcclown/home-assistant-custom-components) Library: [AquaIPy](https://github.com/mcclown/AquaIPy) (HD range over IP). Newest HA fork: [razza-t/aqua_illumination-ha](https://github.com/razza-t/aqua_illumination-ha/releases/tag/v2026.3.1).
- **EcoTech / Mobius**: [python-mobius](https://code.r3pek.org/r3pek/python-mobius) (**GPLv2**, alpha) is tested on Radion, Prime, Hydra, VorTech and Axis. It handles schedules, scenes and reads, and reaches same-tank devices over Thread mesh. It was derived from a decompiled Mobius Android app.
- **Neptune Apex**: [itchannel/apex-ha](https://github.com/itchannel/apex-ha) gives local outputs as switches and inputs as sensors. The REST API is undocumented and can change with firmware.
- **GHL**: the **only manufacturer-published API** I found, the [GHL API](https://www.aquariumcomputer.com/software/ghl-api/). It works over TCP or WebSocket and is off by default. It reads sensors and outlet states, and sets setpoints, light scenes and feed pause. It **cannot switch outputs**. It is provided "as is" with no free support, and GHL says it must not be the only means of controlling life support.
- **Kessil**: the A360X Wi-Fi dongle (K-Link, 2.4 GHz) works with the Kessil app. [Bulk Reef Supply](https://www.bulkreefsupply.com/a360x-wifi-dongle-kessil-1.html) **No protocol or library found.**
- **Zetlight**: the ZETLIGHT SYSTEM app works with the A100 Wi-Fi switch (Lancia, Qmaven…). [App Store](https://apps.apple.com/app/id1052640173) The newer A200 uses the Horizon app. [Reef Builders](https://reefbuilders.com/2017/12/12/zetlight-a200-wifi-controller-allows-you-to-control-many-devices) Listings conflict. No library found. Singapore shops list Zetlight ([FishyHub](https://fishyhub.com/product-detail/zetlight-f8-biotope-led-light-96w-freshwater-wifi-bluetooth-app-control-26419)); VN/ID/TH is unconfirmed.

**Inkbird**
- The ITC-306A Wi-Fi aquarium heater controller is 2.4 GHz and uses the INKBIRD app. [Inkbird EU](https://eu.inkbird.com/products/wifi-aquarium-temperature-controller-itc-306a) (page returned 429 on fetch; details are from a search snippet)
- It is listed as a Tuya device in [tuya-local DEVICES.md](https://raw.githubusercontent.com/make-all/tuya-local/main/DEVICES.md) ("Inkbird ITC306A, ITC308, C236T thermostat smartplugs").
- HA's core Inkbird integration covers **BLE sensors only**, not the controllers. [HA docs](https://www.home-assistant.io/integrations/inkbird/)

**Xiaomi / Mijia smart fish tank**
- MYG100: 20 L, Wi-Fi 2.4 GHz, with light, pump and remote feeding through Mi Home. VN shops list it at about ₫1.5–2.6M. [Phong Hoa](https://phonghoa.vn/be-ca-thong-minh-xiaomi-mijia-smart-fish-tank-myg100-20l), [Mi Hà Nội](https://mihanoi.vn/san-pham/be-ca-thuy-sinh-thong-minh-xiaomi-mijia-myg100-20l), [Tinh tế owner thread](https://tinhte.vn/thread/chia-se-ve-ho-ca-xiaomi-mija.3669251/). The 2 Pro is China-only. [Gizmochina](https://www.gizmochina.com/2022/12/26/xiaomi-mijia-smart-fish-tank-supports-remote-feeding/)
- [hass-xiaomi-miot](https://github.com/al-one/hass-xiaomi-miot) (Apache-2.0) lists "fish-tank" in its pet category. It needs a Xiaomi account or extracted tokens. Exact properties (siid/piid) for MYG100 are **unconfirmed**.

**Tuya plugs / timer strips (CO2 + light timing)**
- VN aquascape shops sell Tuya strips **specifically for aquariums**. [Quoi Decor](https://thuysinhquoidecor.com/san-pham/o-dien-hen-gio-wifi-5-cong/) sells a 4-outlet + 3 USB strip for ₫435–450k, using the Smart Life / Tuya Smart app, with "4 independently timed outlets" for lights, CO2, filter and fan. The shop says timers keep running if Wi-Fi drops. [Tạp Hóa Thủy Sinh](https://taphoathuysinh.com/o-cam-timer-wifi-thong-minh-hen-gio-bat-tat-den-thuy-sinh-van-dien-co2-id1068.html) sells a similar strip (title only; page didn't load).
- ID/TH: generic Tuya plugs are sold widely. [toko28](https://toko28.com/tool/stop-kontak-wifi-remote.html), [amsanelectronics](https://amsanelectronics.com/shop/watt-meter-stop-kontak-wifi-ac-220v-16a-timer-jadwal-countdown/), [LINE shop TH](https://shop.line.me/@cqsmart/product/1005415594) I found no aquascape-specific marketing there.
- Control routes:
  - The official HA Tuya integration now uses a QR code from the Smart Life app and is "Cloud Push". [HA docs](https://www.home-assistant.io/integrations/tuya/)
  - Local control ([tinytuya](https://github.com/jasonacox/tinytuya), MIT, protocol 3.1–3.5) needs a per-device **local key** fetched through a Tuya IoT developer project. The free IoT Core trial lasts about a month and must be renewed to fetch keys for new devices. Tuya's FAQ says you can request extensions of up to 6 months and that it "will completely prohibit cross-region API calls." [Tuya FAQ](https://raw.githubusercontent.com/tuya/tuya-home-assistant/main/docs/faq.md)
  - Tuya **BLE** devices: local control still needs a key from the Tuya cloud. [ha_tuya_ble](https://github.com/PlusPlus-ua/ha_tuya_ble)

**TP-Link Tapo / Kasa**
- The official HA TP-Link integration controls Tapo plugs (P100, P105, P110, P110M, P115…) **locally**, but needs the TP-Link cloud email and password to authenticate. [HA docs](https://www.home-assistant.io/integrations/tplink/)
- The P110M is Matter-certified. [TP-Link PH](https://www.tapo.com/ph/product/smart-plug/tapo-p110m)
- VN sellers: [smarthomekit.vn](https://smarthomekit.vn/san-pham/tapo-wifi-socket/), [vohoang.vn](https://vohoang.vn/tp-link-tapo-p105-o-cam-dien-thong-minh-dieu-khien-tu-xa-tieu-chuan-chau-au-smart-home).

---

## 2. What the open libraries can actually do

| Line | On/off | Per-channel brightness | Writes schedule to device | Reads state back | Notes |
|---|---|---|---|---|---|
| Chihiros lights (TheMicDiet/AquaBle) | Yes (auto/manual/off) | Yes (R/G/B/W) | Yes (sunrise/sunset, ramp, weekday mask; custom curves) | Partial (runtime, saved schedule snapshot; fan RPM/temp on VIVID III) | Clock set command exists |
| Chihiros doser | n/a | n/a | Yes (per-head, weekdays) | Yes (dosed today, lifetime) | Calibration supported |
| Chihiros CO2 controller | Yes | n/a | Yes (photoperiod-linked, pre-start offset) | Unconfirmed | Only in chihiros-esphome (no licence) |
| Chihiros heater | Yes | n/a | n/a | Yes (temp, power, alarms) | |
| Week Aqua (5746 / M Pro) | Partial (no true off on M800 Pro K) | Yes (R/G/B/UV) | Yes (5/8/12 slots by model) | **No** | Several protocol variants |
| Fluval (fluvalble) | Yes | Colour → channels (per-channel not explicit) | Yes (stored on fixture) | Yes (mode, schedule, firmware) | Fluval "encryption" reverse-engineered |
| EHEIM Digital | Yes (pump, UV) | Yes (2 ch) | Uses device day-cycle | Yes (speed, service hours) | Local HTTP/WebSocket |
| Red Sea (local) | Yes | Yes (LED) | Yes | Yes | Local HTTP |
| Jebao MD-4.4 | Start/stop pumps | n/a | Not documented | Yes (status) | Local TCP 12416 |
| Tuya plug/strip | Yes | n/a | Via Tuya cloud timers or device timers | Yes | Cloud or local-key |
| Tapo plug | Yes | n/a | Yes (app schedules) | Yes (energy on P110) | Local + TP-Link login |

---

## 3. Platform implications

### 3.1 Web Bluetooth support today

| Browser | Web Bluetooth | Source |
|---|---|---|
| Chrome desktop (Win 10+, macOS, ChromeOS) | Yes (since 56; Windows GATT since 70) | [caniuse](https://caniuse.com/web-bluetooth), [WebBluetoothCG status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md) |
| Edge (Chromium) | Yes (79+) | [caniuse](https://caniuse.com/web-bluetooth) |
| Chrome Android (6.0+) | Yes | [WebBluetoothCG status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md) |
| Samsung Internet | Yes (6.2+) | [caniuse](https://caniuse.com/web-bluetooth) |
| Chrome on Linux | Behind a flag only | [WebBluetoothCG status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md) |
| Firefox | No, no plans | same |
| Safari macOS / iOS, and **every iOS browser** (all use WebKit) | **No.** WebKit lists Web Bluetooth among features it won't implement for fingerprinting/privacy reasons | [WebKit tracking prevention](https://webkit.org/tracking-prevention/), [W3C list post, 2024](https://lists.w3.org/Archives/Public/public-web-bluetooth/2024Sep/0002.html) |
| iOS workarounds | **Bluefy** (free Web-BLE browser, PNN Soft, iOS 12+) or **WebBLE / iOSWebBLE** Safari extension (iOS 26+). Third-party, not native support | [Bluefy App Store](https://apps.apple.com/app/id1492822055), [WebBLE App Store](https://apps.apple.com/de/app/ioswebble/id6761301368) |

Other rules (MDN): HTTPS only. `requestDevice()` needs a user gesture and shows a device picker. Not available in workers. `getDevices()` (reconnect without the picker) and `watchAdvertisements()` are still behind flags. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API), [WebBluetoothCG status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)

Practical effect: **each visit means picking the device again** (until `getDevices()` ships unflagged), and there is no background execution.

### 3.2 What a web-only app on aquatome.com can and can't reach

| Device class | Reachable from a browser? | Why |
|---|---|---|
| BLE lights / CO2 controller / doser (Chihiros, Week Aqua, Fluval, Twinstar*) | **Yes** (Chrome/Edge on Android + desktop; Bluefy on iOS) | Web Bluetooth GATT |
| Local Wi-Fi devices (EHEIM, Red Sea, Apex, AI, GHL, Jebao doser) | **No** | Browsers block `fetch()`/XHR from an HTTPS page to `http://` addresses ([MDN mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)). These devices serve plain HTTP and don't send CORS headers (unconfirmed; none documents them), and a browser can't open raw TCP sockets (Jebao 12416, GHL) |
| Cloud devices (Tuya, Tapo, Xiaomi, Chihiros Wi-Fi Hub) | Only through **an AquaTome backend** plus an account link | Needs server-side API keys and OAuth/QR linking |

\*Twinstar would need its protocol reverse-engineered first.

**Why a web app is still viable:** Chihiros (`0xa5/0x19` schedule frames), Week Aqua (5/8/12-slot schedules) and Fluval ("schedules are stored on the fixture") all **run their schedules on the device**. The chihiros-esphome author connects, writes and disconnects for this reason. So the app is a **configurator**: connect, set the schedule and clock, disconnect. It doesn't need to stay connected.

### 3.3 Mobile OS share (why iPhone can't be ignored)

| Country | Android | iOS | Source (StatCounter, Sep 2026) |
|---|---|---|---|
| Vietnam | 59.8% | **40.2%** | [link](https://gs.statcounter.com/os-market-share/mobile/viet-nam) |
| Indonesia | 79.2% | 20.8% | [link](https://gs.statcounter.com/os-market-share/mobile/indonesia) |
| Thailand | 74.0% | 26.0% | [link](https://gs.statcounter.com/os-market-share/mobile/thailand) |

This is all-population share. Aquarium hobbyists may skew differently (unconfirmed).

### 3.4 Native options

| Option | Platforms | Licence | Fit for AquaTome | Source |
|---|---|---|---|---|
| **Capacitor + @capacitor-community/bluetooth-le** | iOS, Android, **and Web (falls back to Web Bluetooth)** | MIT | **Best fit**: one TypeScript BLE layer runs in the browser now and in a native shell later. On web, connect/read/write/notify work, but many methods (e.g. scanning) are unavailable or behind a Chrome flag. Version 8.x matches Capacitor 8 | [GitHub](https://github.com/capacitor-community/bluetooth-le) |
| React Native + react-native-ble-plx | iOS, Android | Apache-2.0 | Good, but needs a separate RN app (no Expo Go; needs prebuild) | [GitHub](https://github.com/dotintent/react-native-ble-plx) |
| Flutter + flutter_blue_plus | iOS, Android, macOS, Linux, web | **Custom licence: commercial use needs a paid licence** | Avoid unless you budget for it | [pub.dev](https://pub.dev/packages/flutter_blue_plus) |

A native app also unlocks local Wi-Fi (EHEIM, Red Sea, Jebao TCP) and reconnecting without a picker. Matter control of plugs like the Tapo P110M might also work, but I found no source for a third-party Matter control path.

### 3.5 Background limits (native)

- **iOS:** add the `bluetooth-central` background mode. Use state restoration (`restoreState`) to be relaunched. Woken apps get about 10 s of work. [flutter_blue_plus docs](https://pub.dev/packages/flutter_blue_plus), [Capacitor BLE docs](https://github.com/capacitor-community/bluetooth-le)
- **Android 12+:** needs the `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` runtime permissions ("Nearby devices"). Add `neverForLocation` to avoid asking for location. Android 10–11 background scans need `ACCESS_BACKGROUND_LOCATION`. [Android docs](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions) Background scans are forced to low-power mode. [Capacitor BLE docs](https://github.com/capacitor-community/bluetooth-le)
- **Takeaway:** on-device schedules make background work unnecessary for v1. Don't design features that need the phone to "fire" the CO2 or lights.

### 3.6 Cloud devices (Tuya, Tapo, Xiaomi)

- **Tuya:** a commercial app should use Tuya's official cloud project or App SDK. A third-party aggregator says the free "Trial Edition" is for debugging only and bans commercial use (**unconfirmed**; check Tuya's pricing page). [Tuya device-logs page, Trial $0](https://www.tuya.com/platform/clouddev/device-logs) Cross-region API calls are prohibited, so VN/ID/TH users' data-centre region matters. [Tuya FAQ](https://raw.githubusercontent.com/tuya/tuya-home-assistant/main/docs/faq.md) Local keys change when a device is re-paired. [Homey Tuya Local](https://community.homey.app/t/app-pro-tuya-local/154077)
- **Tapo:** local control works but needs the user's TP-Link login stored in the app. It is native-only (LAN). [HA docs](https://www.home-assistant.io/integrations/tplink/)
- **Xiaomi:** needs Xiaomi account tokens. [hass-xiaomi-miot](https://github.com/al-one/hass-xiaomi-miot)

### 3.7 Legal / ToS risk of reverse-engineered protocols

Not legal advice. This is a risk inventory.

- **No vendor gives permission except GHL**, whose API is free and as-is. EHEIM's unofficial library (origin not stated) ships in Home Assistant core, which suggests the vendor tolerates it. I found **no manufacturer terms that explicitly forbid** third-party BLE control (unconfirmed; app EULAs were not reviewed).
- **Low risk:** writing our own code from a **published protocol description**. Chihiros `protocol.md` describes plaintext frames, an XOR checksum and no authentication.
- **Greyer:** Fluval's protocol includes what Fluval calls "encryption". Re-implementing it may fall under anti-circumvention rules in some jurisdictions. python-mobius was built from a **decompiled** app.
- **Code licences:**
  - OK to reuse with attribution: MIT (TheMicDiet, AquaBle, alokauz, jebao-md44, tinytuya) and Apache-2.0 (fluvalble, hass-xiaomi-miot).
  - Don't paste into a proprietary app: **GPLv2** (python-mobius).
  - Treat as all rights reserved; learn the protocol, don't copy the code: **no licence** (smaurer3, ad960009, chihiros-esphome).
- **Breakage risk:** a firmware update can change the protocol without notice (the Apex REST API is explicitly undocumented). Keep brand adapters isolated and versioned.
- **Trademarks:** say "works with Chihiros", don't use logos, and don't imply endorsement.
- **Animal safety / liability:** CO2 and heater control can kill livestock if wrong. GHL warns its API must not be the only control for life support. Ship conservative defaults (CO2 off at lights-off, max-hours guard) and a clear disclaimer.

---

## 4. Ranked shortlist: what to support first

Scoring: each axis 1–3, total = product (max 27).
- **Pop** = SEA popularity (evidence above).
- **Feas** = an open, testable protocol exists and is easy to implement. 3 = documented + MIT; 2 = reverse-engineered with caveats, or cloud API; 1 = nothing found.
- **Use** = usefulness for planted tanks. 3 = lights / CO2 timing; 2 = dosing / heat / filter; 1 = reef-only.
- **Needs** = what platform it requires.

| Rank | Device line | Pop | Feas | Use | Score | Needs | Key evidence |
|---|---|---|---|---|---|---|---|
| 1 | **Chihiros BLE lights** (WRGB II / Pro / Slim, A II, B, Universal WRGB, Commander) | 3 | 3 | 3 | **27** | Web BLE | [protocol.md](https://github.com/TheMicDiet/chihiros-led-control/blob/main/docs/protocol.md); VN/TH/ID shops |
| 2 | **Week Aqua BLE lights** (start with model code 5746; then M Pro) | 3 | 2 | 3 | **18** | Web BLE | [alokauz (MIT)](https://github.com/alokauz/ha-weekaqua); 8 VN shops |
| 3 | **Tuya Wi-Fi timer strips / plugs** (light + CO2 + filter) | 3 | 2 | 3 | **18** | Backend + Tuya cloud project (or native + local key) | [Quoi Decor strip](https://thuysinhquoidecor.com/san-pham/o-dien-hen-gio-wifi-5-cong/); [Tuya FAQ](https://raw.githubusercontent.com/tuya/tuya-home-assistant/main/docs/faq.md) |
| 4 | **Chihiros BLE CO2 solenoid controller** | 2 | 2 | 3 | **12** | Web BLE | [chihiros-esphome](https://github.com/BartdeJonge/chihiros-esphome) (no licence; same NUS framing) |
| 5 | **Chihiros dosing pump** | 2 | 3 | 2 | **12** | Web BLE | [AquaBle](https://github.com/caleb-venner/AquaBle) |
| 6 | **TP-Link Tapo plugs** (light / CO2 timing) | 2 | 2 | 3 | **12** | Native (LAN + TP-Link login); Matter path unconfirmed | [HA TP-Link](https://www.home-assistant.io/integrations/tplink/) |
| 7 | **Fluval BLE lights** (Plant 3.0/4.0, Aquasky) | 1 | 2 | 3 | **6** | Web BLE | [fluvalble (Apache-2.0)](https://github.com/nphil/fluvalble); no SEA evidence |
| 8 | **Twinstar LightControl** (BLE dongle) | 2 | 1 | 3 | **6** | Web BLE, after reverse-engineering | [App Store](https://apps.apple.com/app/id6743735243); VN shops |
| 9 | **Chihiros heater** | 1 | 3 | 2 | **6** | Web BLE | [TheMicDiet](https://github.com/TheMicDiet/chihiros-led-control) |
| 10 | **EHEIM Digital** (5e, LEDcontrol+e, thermocontrol+e) | 1 | 2 | 2 | **4** | Native (local HTTP) | [HA core](https://www.home-assistant.io/integrations/eheimdigital) |
| 11 | **Inkbird ITC-306A** (Tuya heater controller) | 1 | 2 | 2 | **4** | Backend/Tuya | [tuya-local](https://raw.githubusercontent.com/make-all/tuya-local/main/DEVICES.md) |
| 12 | **Jebao Wi-Fi doser MD-4.4** | 1 | 2 | 1 | **2** | Native (TCP) | [jebao-md44](https://pypi.org/project/jebao-md44/) |

Left out of the top 12 (low SEA evidence and/or reef-only): Red Sea, AI Hydra, EcoTech/Mobius, Apex, GHL, Kessil, Zetlight. Also out: Jebao pumps/wavemakers, SunsunHome devices and Xiaomi tank (no usable protocol found).

### Tests to run before committing (in order)

1. **Chrome on Android: does a Chihiros WRGB II show up in the `requestDevice()` picker** and accept a brightness write? The BLE 5 extended-advertising claim is unverified for Chrome. If this fails, a web v1 can't support the most popular brand. In the same session, check whether Chrome reconnects on a later visit without the picker (`getDevices()` is listed as flagged, but that status page may be out of date). The answer changes the v1 UX a lot.
2. Same test on desktop Chrome (Windows/macOS) and in **Bluefy on iPhone**.
3. Read the model code of the owner's Week Aqua light. alokauz supports 5746 only; codes 5745 and 5747–5752 differ.
4. Confirm the Chihiros CO2 controller frames on real hardware (only documented in an unlicensed repo).
5. Check the clock-sync behaviour after a power cut on each light. On-device schedules depend on the clock.

---

## 5. Recommended v1

**Platform:** a web app on aquatome.com, built on **Capacitor's BLE plugin from day one**. In the browser it uses Web Bluetooth (connect/read/write/notify; scanning is native-only), so the same TypeScript works in a native shell later.
- Supported in v1: Chrome/Edge on Android and desktop.
- iPhone in v1: a tested "open this page in Bluefy" path.
- v1.1: wrap it as a Capacitor iOS/Android app, because 40% of VN mobile users are on iOS.

**v1 scope (BLE only, configurator model):**
1. **Chihiros lights:** connect, per-channel brightness (R/G/B/W), write the daily schedule (sunrise, sunset, ramp, weekdays), sync the clock, switch auto/manual/off.
2. **Chihiros CO2 controller** (if test 4 passes): CO2 on X minutes before lights-on and off at or before lights-off, enforced in the UI.
3. **Week Aqua lights** (model 5746 first): per-channel levels, on-device schedule, clock sync. Show "last sent" values, because the light can't report state.
4. **Planted-tank presets that link to AquaTome content:** suggested photoperiod and intensity ramp for new tanks, and algae-recovery mode. The handbook already has the guides; v1 lets users apply them to the light in one tap.
5. **CO2 timing guidance for Tuya/Tapo owners as content, not control.** Example: "set outlet 2 to start 1 h before lights." VN aquascape-shop guidance supports this. [aquasetup](https://aquasetup.com/cam-nang-cach-su-dung-he-thong-co2-cho-be-thuy-sinh/)

**Explicitly not in v1:** Tuya/Tapo/Xiaomi control (needs a backend and account linking, plus Tuya commercial terms), local-Wi-Fi brands (need native), and reef gear.

**v2 candidates:** Capacitor native app → Tapo plugs (local; Matter path unconfirmed) → Tuya via an official cloud project → Chihiros doser and heater → Fluval → EHEIM Digital.

---

## 6. Open questions for the owner

1. **Which devices do you own, or can borrow for testing?** Exact models and, for Week Aqua, the model code. Tests 1–5 need real hardware.
2. **What is the "Chihiros Magic app"?** I only found "My Chihiros". A screenshot would settle it.
3. **iPhone or Android for you and your core readers?** VN is 40% iOS. Is a "use Bluefy" stopgap acceptable for v1, or must iPhone work natively at launch (which means an App Store app)?
4. **Web-first or app-store-first?** Web ships faster with no review. An app store build adds iOS, background reconnects and local Wi-Fi devices.
5. **Is a backend acceptable?** Tuya/Tapo control means storing user tokens and agreeing to Tuya's developer terms.
6. **Do you have reader data?** Analytics on which brands your guides get traffic for, or a quick reader poll (VN/ID/TH Facebook groups), would confirm the popularity ranking. Indonesian and Thai evidence here is thin.
7. **Risk appetite:** are you comfortable shipping reverse-engineered control (no vendor permission) with a "works with, not endorsed by" disclaimer? Would you contact Chihiros or Week Aqua for official cooperation first?
8. **Safety stance on CO2/heater control:** what guard rails and disclaimer text do you want?

---

## Appendix: unconfirmed or weakly sourced items

- Chihiros devices are only discoverable by BLE 5 hardware (claim by one author; not tested with Chrome).
- Hygger HG-028 uses the Tuya Smart app (one customer review on a retailer page).
- Nicrew app control; Hidom Wi-Fi; SunsunHome transport and protocol; Kessil protocol; Zetlight's current app.
- Jebao DMP-30 being Bluetooth (one VN shop listing).
- Week Aqua Android install count (third-party aggregator); Twinstar app 2.x release years.
- Fluval FluvalConnect FAQ content (page returned 403; quoted from a search snippet).
- Inkbird ITC-306A page details (page returned 429; quoted from a search snippet).
- Tuya Trial Edition "no commercial use" and quota figures (secondary source).
- Xiaomi MYG100 property map (only generic MIoT support confirmed).
- Yamano / Kandila (popular budget lights in Indonesian "best of" lists, [my-best ID](https://id.my-best.com/138821)): app control not found.
- No SEA sales evidence found for Fluval, EHEIM Digital, Kessil, Red Sea, AI, EcoTech, Apex or GHL. This means none was found, not that none exists.
