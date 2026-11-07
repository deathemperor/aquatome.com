# Smart tanks, Home Assistant and what a setup costs

For: AquaTome (aquatome.com), VN / ID / TH audience
Date: 2026-11-06
Scope: what Home Assistant adds for aquarium keepers, which aquarium devices it reaches, what the cloud-only options can and can't do, and price and running-cost data for a whole-setup budget planner. This extends [aquarium-device-control.md](aquarium-device-control.md) and [../smart-plugs.md](../smart-plugs.md) and doesn't repeat them.

Every source is shown as a link followed by the date I read it. In the price tables the date is in the table's caption. Where I could only see a search snippet, or a site blocked me, the text says so. Marketplaces (Shopee, Lazada, Tiki, Tokopedia) were not used.

---

## TL;DR

- **The answer to "is there a cloud assistant?" is no, not one that replaces a box.** Home Assistant Cloud costs US$6.50 a month, but it's remote access and voice links for a Home Assistant you still run at home. Each brand's cloud automates that brand's Wi-Fi devices. None of them can reach a Chihiros light over Bluetooth (section 6).
- **Most tanks don't need a hub.** Lights keep their own schedule and strips keep their own timers. A hub earns its place when you want a rule across brands, an alert when something goes wrong, and history (section 1).
- **Chihiros in Home Assistant now has three maintained custom integrations**, one of them in the HACS default list. The weak spots: the light takes one Bluetooth connection, a proxy has 3 slots by default, and one open issue reports doses nobody asked for (section 2).
- **The earlier research is out of date in two places.** Jebao MDP and MDC pumps now have local Home Assistant integrations (it said none), and a Vietnamese shop lists a Neptune Apex doser (it found no SEA evidence). Tuya's "no commercial use on the trial" is now confirmed from Tuya's own pricing page (it was marked unconfirmed).
- **Vietnam's electricity tariff changed on 1 November 2026.** Six tiers became five, under Decision 2892/QĐ-BCT. Many pages still show the old table. A planner must use the new one (section 5).
- **Raspberry Pi is no longer the cheap hub in Vietnam.** A Pi 5 4 GB is about ₫3.6–3.8M, the same as a used Intel mini PC at ₫3.5–5.5M. I found no Vietnamese seller of Home Assistant Green (section 3).
- **A 60 cm tank's parts run from about ₫1.4M to ₫23M**, and its electricity is about ₫53–67k a month in Vietnam before VAT (section 5, my arithmetic from listed prices).

---

## 1. Home Assistant for aquarium keepers

**What it is.** A free program that runs on a small computer in your home and pulls all your smart devices into one app. Its own words: it "runs on your own hardware, so your smart home keeps working even when the internet is down and your data stays at home with you". [HA installation](https://www.home-assistant.io/installation/) (2026-11-06)

**What it needs.** An always-on box, on your network by cable.

- Home Assistant Green comes with everything installed. You plug in power and an Ethernet cable and use the app. It has 4 GB of RAM and 32 GB of storage, and draws about 1.7 W idle and 3 W under load. [HA Green](https://www.home-assistant.io/green/) (2026-11-06)
- Or a Raspberry Pi 4 or 5 with at least 2 GB of RAM, a proper power supply and a microSD card, or any x86-64 computer. [Pi install](https://www.home-assistant.io/installation/raspberrypi) (2026-11-06)
- Green's spec sheet lists Ethernet and two USB ports and no radio, and says Bluetooth comes from a third-party USB accessory. [HA Green](https://www.home-assistant.io/green/) (2026-11-06) Home Assistant's own Bluetooth page says an ESP32 proxy is often better than a local adapter, because Linux kernel updates have broken Bluetooth before. [HA Bluetooth](https://www.home-assistant.io/integrations/bluetooth/) (2026-11-06) Lights near the tank will need one anyway unless the box sits beside the tank.

**What it adds over the brand apps and over AquaTome.**

| You want | Brand apps | AquaTome today | Home Assistant adds |
|---|---|---|---|
| One place for every brand | One app per brand | Chihiros lights, plus Tuya plugs in the app ([smart-plugs.md](../smart-plugs.md)) | Everything with an integration, on one dashboard |
| A rule across devices ("CO2 on an hour before the light, off if the water is too warm") | Only inside one brand | None. Plugs switch only on a reader's tap, by design ([smart-plugs.md](../smart-plugs.md)) | [Triggers, conditions and actions](https://www.home-assistant.io/docs/automation/) (2026-11-06) across all of them |
| Control with no internet | Bluetooth apps yes, cloud plugs mostly no | Bluetooth yes, plugs no | Yes for local integrations. Tuya's official one is [Cloud Push](https://www.home-assistant.io/integrations/tuya/) (2026-11-06), so check each device in section 2 |
| An alert that reaches you | Varies by brand | None | [Critical notifications](https://companion.home-assistant.io/docs/notifications/critical-notifications/) (2026-11-06) sound through Do Not Disturb and mute on iPhone. That page names water-leak alarms as a use |
| History | Varies by brand | Doesn't keep live state | Keeps 10 days of history by default ([recorder](https://www.home-assistant.io/integrations/recorder/) (2026-11-06)), and you can raise it |

"HACS" below is the community store for custom integrations. Since Home Assistant 2026.11 it's built in and called Marketplace, but most READMEs still say HACS. [HACS](https://hacs.xyz/) (2026-11-06)

**When it's overkill.** My view: skip it for one tank with one light and one timer strip. The light runs its own schedule and the strip its own timers, and both keep going when nothing else is on (earlier research, §3.2). Add it when you have three or more brands, when you travel and want alerts, or when you enjoy this sort of thing. It's another computer to look after. Custom integrations can break on an update, and when the box is off, every rule that lives on it stops. So keep each device's own schedule as the base and let Home Assistant watch over it.

---

## 2. Device by device

Status read from each repository on 2026-11-06. "Open" counts open issues and pull requests together, as GitHub's API reports them. "HACS default" means the repo is in the [HACS default list](https://github.com/hacs/default/blob/master/integration) (2026-11-06); the others are added by hand as custom repositories. I checked Vietnamese shops for sale evidence. For Indonesia and Thailand, see the earlier research.

| Device | Home Assistant route | Local or cloud | Bluetooth proxy | Maintenance | Main pitfalls |
|---|---|---|---|---|---|
| Chihiros lights (BLE) | [SH1FT-W/chihiros](https://github.com/SH1FT-W/chihiros) (HACS default, Apache-2.0); [TheMicDiet/chihiros-led-control](https://github.com/TheMicDiet/chihiros-led-control) (custom, MIT); [caleb-venner/AquaBle](https://github.com/caleb-venner/AquaBle) (custom, MIT) | Local | Yes, needs an adapter or proxy in range | SH1FT-W 26.11.2, 2026-11-05, 0 open. TheMicDiet v0.19.2, 2026-10-31, 2 open. AquaBle v4.0.3, 2026-08-31, 2 open | One connection at a time. SH1FT-W tested only the C II RGB and doser on hardware. See notes |
| Chihiros doser, Doctor, CO2 controller | Doser: the same three. Doctor Mate and CO2 controller: only [BartdeJonge/chihiros-esphome](https://github.com/BartdeJonge/chihiros-esphome) | Local | ESP32-S3 bridge, not a plain proxy | chihiros-esphome: no release, no licence, last push 2026-07-09, 4 open | [Ghost doses reported](https://github.com/TheMicDiet/chihiros-led-control/issues/131), open |
| Tuya / Smart Life plugs | Official [Tuya](https://www.home-assistant.io/integrations/tuya/); [make-all/tuya-local](https://github.com/make-all/tuya-local) (custom, MIT); [xZetsubou/hass-localtuya](https://github.com/xZetsubou/hass-localtuya) (GPL-3.0); [rospogrigio/localtuya](https://github.com/rospogrigio/localtuya) (HACS default, GPL-3.0) | Official is cloud. The others are local, with a key from the cloud | No | tuya-local 2026.10.0, 2026-10-23, 236 open. hass-localtuya 2026.10.0, 2026-10-19, 51 open. localtuya v5.2.5, 2026-01-29, 1,601 open | Key changes on every re-pair. Many devices take one local connection |
| Sonoff / eWeLink plugs | [AlexxIT/SonoffLAN](https://github.com/AlexxIT/SonoffLAN) (HACS default, MIT). [No `sonoff` core integration](https://github.com/home-assistant/core/tree/dev/homeassistant/components) | Local and cloud together (`auto` mode) | No | v3.13.3, 2026-11-04, 184 open | Needs the eWeLink login even for local mode. See notes |
| Inkbird BLE sensors | Official [INKBIRD](https://www.home-assistant.io/integrations/inkbird/) (IBS-TH1, IBS-TH2, IBS-P01B pool thermometer and others) | Local push | Yes, most need active scans | Core, 3,308 active installs | Grill and air models fill the list. Pick a probe model |
| Inkbird Wi-Fi controllers (ITC-306A, ITC-308, C236T) | [tuya-local](https://raw.githubusercontent.com/make-all/tuya-local/main/DEVICES.md) | Local with a key | No | As tuya-local | I found no Vietnamese shop selling them. [ITC-308 is US$35.99](https://www.inkbird.com/products/temperature-controller-itc-308) (2026-11-06) at Inkbird's own US shop |
| ESPHome DIY sensors | Official [ESPHome](https://www.home-assistant.io/integrations/esphome/): [DS18B20](https://esphome.io/components/sensor/dallas_temp/), [ultrasonic level](https://esphome.io/components/sensor/ultrasonic/) | Local push | Doesn't need one, and can be one | Core, on 27.4% of installs | You solder and house it. Keep it on low voltage, away from mains |
| Kamoer dosers | Experimental only: [kairsato X1 Pro V2 BLE](https://github.com/kairsato/kamoer-x1-pro-v2-ble-hacs); [ffirenmatana X2SR proxy](https://github.com/ffirenmatana/kamoer); [rince-sp KH Carer](https://github.com/rince-sp/ha-kamoer-khcarer) | BLE; LAN by intercepting the pump's traffic; cloud | X1 Pro V2 yes | No releases on any. 0 to 2 stars | X1 Pro's start and stop are unverified, by its own README. KH Carer's cloud call is a stub |
| Jebao dosers and pumps | [chrisc123/jebao_aqua-homeassistant](https://github.com/chrisc123/jebao_aqua-homeassistant); [m0s4ik/ha-jebao-doser](https://github.com/m0s4ik/ha-jebao-doser); [jrigling/homeassistant-jebao](https://github.com/jrigling/homeassistant-jebao); [netrene/ha-jebao-mdc](https://github.com/netrene/ha-jebao-mdc) (all custom, MIT) | Local (optional cloud on chrisc123) | No | chrisc123 v0.4.2, 2026-08-29, 16 open. m0s4ik v0.3.1, 2026-11-04, 0 open. jrigling v0.1.4, 2026-07-20. netrene v0.4.9, 2026-07-06 | Doser support on chrisc123 is community-written and untested by the maintainer. netrene tested one pump |
| Auto top-off (ATO) | No integration found for Kamoer ATO or the shops' float kits. Red Sea ReefATO+ is in the [reefbeat integration](https://github.com/Elwinmage/ha-reefbeat-component) (earlier research). DIY: float switch and relay on ESPHome | Local if DIY | No | Reefbeat v2.7.1, 2026-10-08 | A stuck relay floods the room. Keep a mechanical float as the second stop (my advice) |
| Feeders | Tuya pet feeders have [meal-plan actions](https://www.home-assistant.io/integrations/tuya/), per product ID. Battery feeders from aquarium shops have no connection. DIY: [fish-feeder-esphome](https://github.com/fpayapaya/fish-feeder-esphome) | Cloud for Tuya | No | fish-feeder-esphome: last push 2025-03-01, 0 stars | Nothing I found is made for aquarium feeders sold in Vietnam |
| CO2 solenoid on a plug | Any plug route above | As the plug | No | As the plug | The plug fails however it fails. See notes |
| pH probes | ESPHome [EZO](https://esphome.io/components/sensor/ezo/) (Atlas Scientific, I²C, with calibration actions); [jdeath/BLE-YC01](https://github.com/jdeath/BLE-YC01) pool monitor (HACS custom, MIT) | Local | YC01 yes | YC01 0.6, 2025-06-24. Its author no longer owns the device | Pen meters from shops have no connection. Caper Plus Q1 and Kamoer Qijian: no route found |
| Seneye | No integration. Official [Local Data Exchange](https://github.com/seneye/LDE) posts signed readings to a URL you set. USB: [pyseneye](https://github.com/mcclown/pyseneye), [Seneye-MQTT-RPi](https://github.com/tamengual/Seneye-MQTT-RPi), [seneye-hass](https://github.com/83noit/seneye-hass) | Local | No | pyseneye 0.0.1, 2019. MQTT-RPi last push 2026-03-28, no licence. seneye-hass 2025-04-08, a prototype | LDE needs Seneye's Web Server or Connect app, and Seneye gives no support for it. Reading over USB with pyseneye doesn't sync to Seneye's cloud |
| Neptune Apex | [itchannel/apex-ha](https://github.com/itchannel/apex-ha) and [denov/home-assistant-apex-neptune](https://github.com/denov/home-assistant-apex-neptune) (both HACS default); [maxvitek/ha-neptune-apex](https://github.com/maxvitek/ha-neptune-apex) | Local | No | apex-ha 1.16, 2025-06-15, 32 open. denov v1.8.1, 2026-10-29, 1 open. maxvitek: no release | Change the default login (admin / 1234, per maxvitek). Local API is undocumented (earlier research) |

Week Aqua's Home Assistant routes are in the earlier research.

**Chihiros notes.**

- "Close the My Chihiros app: the device takes only one connection." [SH1FT-W/chihiros](https://github.com/SH1FT-W/chihiros) (2026-11-06)
- SH1FT-W is a rewrite of TheMicDiet with the same domain, so the two can't be installed together. It leaves out heaters and stirrers on purpose, so anyone with a Chihiros heater needs TheMicDiet. [SH1FT-W/chihiros](https://github.com/SH1FT-W/chihiros) (2026-11-06)
- An ESPHome proxy has 3 connection slots by default, and Ethernet proxies manage 4 reliably. [ESPHome Bluetooth proxy](https://esphome.io/components/bluetooth_proxy/) (2026-11-06) One user with 3 lights on one proxy had a light that stopped responding, and another found the proxy held the connection and locked out the phone app. [issue #35](https://github.com/TheMicDiet/chihiros-led-control/issues/35) (2026-11-06)
- A user saw 1 ml doses fired at random for weeks with no schedule in the Chihiros app. The issue is open and the cause isn't established. [issue #131](https://github.com/TheMicDiet/chihiros-led-control/issues/131) (2026-11-06) Check dose totals for a while before trusting any doser here, and start with a harmless liquid.
- One author says Chihiros devices use BLE 5 extended advertising, so a classic ESP32 can't see them and you need an S3, C3 or C6. [chihiros-esphome](https://github.com/BartdeJonge/chihiros-esphome) (2026-11-06) That's still one author's claim. Buy an ESP32-S3 and the question goes away.
- The same author's bridge connects, sends and disconnects, and doesn't reconnect on boot, because several connections at once crashed the chip. After a reboot you press a button per device to push settings. [chihiros-esphome](https://github.com/BartdeJonge/chihiros-esphome) (2026-11-06)

**Tuya notes.**

- tuya-local warns that many devices support only one local connection, and that the local key changes each time you pair the device. [tuya-local README](https://github.com/make-all/tuya-local) (2026-11-06)
- After adding a device in Smart Life, you reload the official integration before it appears. [HA Tuya](https://www.home-assistant.io/integrations/tuya/) (2026-11-06)

**Sonoff notes.**

- SonoffLAN's author strongly recommends `auto` mode over `local`, because "the local protocol is not always stable". Even local mode needs the eWeLink login, to fetch device encryption keys, and needs working multicast between the box and the devices. [SonoffLAN](https://github.com/AlexxIT/SonoffLAN) (2026-11-06)
- From 2026, power, current and voltage readings no longer update through the eWeLink cloud, which blocked them. So a power-monitoring plug only reports over LAN. [SonoffLAN](https://github.com/AlexxIT/SonoffLAN) (2026-11-06)

**CO2 on a plug.** A plug switching a solenoid does what it's told, or does nothing when the network, the box or the cloud is down. So the safe base is a timer the strip itself keeps, with Home Assistant only checking it. Tuya says local timers run offline and cloud timers don't, and that you have to ask them which your device uses. [Tuya: cloud or local timing](https://support.tuya.com/en/help/_detail/K8sdy5k3p5f0b) (2026-11-06) [Tuya: offline timing](https://support.tuya.com/en/help/_detail/K9d1qifd5qtcp) (2026-11-06)

---

## 3. Hub hardware and its price in Vietnam

Prices read 2026-11-06. Shops list these with VAT unless the row says otherwise.

| Hardware | Price | Where | Notes |
|---|---|---|---|
| Home Assistant Green | No Vietnamese seller found | Maker's price: [US$199 / €179](https://www.home-assistant.io/green/) | Raised in January and again by April 2026, mainly on RAM prices ([Nabu Casa](https://www.nabucasa.com/news/2026-01-08-green-pricing-change/)). You'd have to import one |
| Raspberry Pi 5, 2 / 4 / 8 GB | ₫2.43M / ₫3.618M / ₫5.508M | [hshop](https://hshop.vn/may-tinh-raspberry-pi-5-made-in-uk) | Board only, VAT included |
| Raspberry Pi 5, 2 / 4 / 8 GB | ₫2.754M / ₫3.834M / ₫5.994M | [Cytron](https://www.cytrontech.vn/c-raspberry-pi/c-raspberry-pi-5), [4 GB page](https://www.cytrontech.vn/p-raspberry-pi-5-with-4gb-ram) | Board only |
| Raspberry Pi 5 | From ₫3.3M; [starter kit from ₫4.08M](https://raspberrypi.vn/san-pham/raspberry-pi-5-starter-kit) | [raspberrypi.vn](https://raspberrypi.vn/san-pham/mach-may-tinh-raspberry-pi-5) | RAM option not shown at the "from" price |
| Raspberry Pi 5 | ₫3.538M | [PiVietnam](https://pivietnam.com.vn/raspberry-pi-5-pivietnam-com-vn.html) | RAM option not shown |
| Raspberry Pi 4 kit | ₫3.942–4.266M; [from ₫3.77M](https://raspberrypi.vn/san-pham/combo-raspberry-pi-4-starter-kit) | [hshop](https://hshop.vn/search?q=raspberry+pi+4) | About the price of a Pi 5, so buy the 5 |
| Pi 5 power supply, 27 W | ₫360k; ₫389k | [PiVietnam](https://pivietnam.com.vn/raspberry-pi-5-pivietnam-com-vn.html); [Cytron](https://www.cytrontech.vn/p-raspberry-pi-5-with-4gb-ram) | HA warns phone chargers may not do. [Pi install](https://www.home-assistant.io/installation/raspberrypi) |
| Used mini PC (Dell 3050 / 3060 Micro, i5, 8 GB, 256 GB SSD) | ₫3.5M (3050); ₫5.5M (3060); ₫4.35M (3060) | [ICT Sài Gòn 3050](https://ictsaigon.com.vn/mini-pc-dell-optiplex-3050-micro), [ICT Sài Gòn 3060](https://ictsaigon.com.vn/mini-pc-dell-optiplex-3060-micro), [Tân Thành PC 3060](https://tanthanhpc.vn/san-pham/may-bo-dell-optiplex-3060-micro-i5-8500t/) | Far more power than this needs, for the price of a Pi 5 kit |
| ESP32-S3 (Bluetooth proxy, sensors) | ₫135k module; ₫230k dev kit | [hshop](https://hshop.vn/search?q=esp32-s3) | No shop sells a "Bluetooth proxy". You flash an ESP32 with ESPHome |
| DS18B20 waterproof probe | ₫35k; ₫75k | [hshop](https://hshop.vn/search?q=ds18b20) | |

---

## 4. Typical aquarium automations

"No hub" says what you can do without Home Assistant. Rules that need a box are marked. All of it is my design, built on the sources cited.

| Automation | Devices | No hub | With Home Assistant |
|---|---|---|---|
| Light schedule | A light with its own clock (Chihiros, Week Aqua) | The light's own schedule, set once from AquaTome | Write the schedule to the light with [`chihiros.set_auto_curve`](https://github.com/SH1FT-W/chihiros) (2026-11-06). SH1FT-W also offers a schedule following real sunrise and sunset, and a slow ramp-up for a new tank |
| CO2 on before lights, off before lights-out | Solenoid on a smart plug or a Chihiros CO2 controller, and the light | Set the strip's outlet timer by hand, for example on an hour before the light and off before lights-out ([earlier research, §5](aquarium-device-control.md)) | One shared photoperiod drives both, as [chihiros-esphome](https://github.com/BartdeJonge/chihiros-esphome) (2026-11-06) does with its `fotoperiode` times and `co2_prestart` offset. Add a rule that alerts if the outlet is on outside those hours |
| Heater or fan thermostat with alerts | Temperature probe, a plug for the heater or fan | A heater's own thermostat. A fan switch that reads temperature ([Marine, ₫253k](https://aquazonefish.vn/products/cong-tac-dieu-chinh-quat-tan-nhiet-marine-the-he-moi)). Sonoff TH runs [up to 8 temperature and time programs](https://sonoff.tech/en-us/products/sonoff-th-origin-smart-temperature-and-humidity-monitoring-switch) (2026-11-06) | Plug on and off around set points from a [DS18B20](https://esphome.io/components/sensor/dallas_temp/) (2026-11-06), plus a critical alert if the water leaves a range. Leave the heater's own thermostat as the upper stop (my advice) |
| Feed mode that pauses pumps | Plug on the filter, or a Jebao pump | A timed pause on some pumps. EHEIM's autofeeder can [pause the filter after feeding](https://www.home-assistant.io/integrations/eheimdigital/) (2026-11-06) | A button: filter off, wait 10 minutes, on. A timer that always turns it back on, even if Home Assistant restarts midway, matters more than the button. [jrigling](https://github.com/jrigling/homeassistant-jebao) (2026-11-06) has a feed mode with auto-resume. [netrene](https://github.com/netrene/ha-jebao-mdc) (2026-11-06) lowers the pump speed, then restores it. SH1FT-W adds a [feeding light](https://github.com/SH1FT-W/chihiros) (2026-11-06) |
| Water-change mode | Plugs on filter, heater and CO2 | Switch by hand, in AquaTome or the brand app | One tap: filter, heater and CO2 off. A reminder if they're still off after 45 minutes. Heater off matters: a bare heater out of water can burn out or crack (my advice, check your heater's manual) |
| Power-cut recovery | Chihiros light, a plug or sensor that tells you power is back | Set the clock from AquaTome by hand | On power return, push the time to the light and read it back. A Chihiros light's clock reads zero after a cut until it's synced ([earlier research](aquarium-device-control.md)). [SH1FT-W](https://github.com/SH1FT-W/chihiros/blob/main/custom_components/chihiros/protocol.py) (2026-11-06) and [AquaBle](https://github.com/caleb-venner/AquaBle/blob/main/custom_components/aquable/commands/generators.py) (2026-11-06) both have a set-time command in their code, and AquaBle's [`hardware_sync` sensor](https://github.com/caleb-venner/AquaBle) (2026-11-06) reports the device clock. Neither lists a clock action of its own, so the rule may have to write the schedule again. Test this on a real light. A Tuya strip's local timers also return to their initial setting after a cut, and can't run until the device reconnects to recalibrate ([Tuya](https://support.tuya.com/en/help/_detail/K9d1qifd5qtcp) (2026-11-06)) |
| Leak or temperature alerts | Leak sensor or float switch, temperature probe | Nothing reaches the phone without a cloud app. See section 6 for the Tuya and eWeLink routes | Critical alert, plus optionally switching off the outlet that feeds a top-off pump. [Companion docs](https://companion.home-assistant.io/docs/notifications/critical-notifications/) (2026-11-06) name water-leak sensors as a use for these alerts |

One limit shapes all of these: the rule only runs while the box runs. A box on the same power strip as the tank goes down with it, so it can't report a power cut unless it has its own supply. A small UPS is the fix (my advice, I did not price one).

---

## 5. Budget planner data

### How the prices were read

On 2026-11-06, from the shops' own sites, through the public feeds their shop platforms provide. That keeps it repeatable.

- WooCommerce store feed (`/wp-json/wc/store/v1/products`): [Quoi Decor](https://thuysinhquoidecor.com/), [Ylang](https://cuahangthuysinh.vn/), [Soha Aqua](https://sohaaqua.com/).
- Haravan feed (`/collections/all/products.json`): [Aquazone](https://aquazonefish.vn/), [Phương Nhi](https://phuongnhiaquarium.vn/).
- Sapo product pages (`/<handle>.json`): [Thủy Sinh 4U](https://thuysinh4u.com/), [Thủy Sinh Tím](https://thuysinhtim.vn/), [Bucep Việt](https://bucepviet.vn/), [Shrimp Home](https://shrimphome.vn/).

In the tables, `*` means the shop's feed marked that item out of stock. These are list prices, so a shop's real price may differ. I left out one obvious typo: Phương Nhi's Chihiros A2 90 cm at ₫15.5M. Aquazone's codes (QL-, YD-) and low prices suggest it also sells wholesale, so its row is the low end, not what every shop charges. Tier labels are mine: budget is the cheapest that does the job, mid is common hobby brands, and premium is the top of what these shops list. "n/l" means I found no listing in these shops.

### Tank (prices read 2026-11-06)

| Tier | 30 cm | 45 cm | 60 cm | 90 cm | 120 cm |
|---|---|---|---|---|---|
| Budget | [₫77k, 30x20x20](https://aquazonefish.vn/products/be-kinh-sieu-trong) | [₫197k*, 45x28x30 cast](https://aquazonefish.vn/products/be-kinh-duc); [₫259k, 45x28x32](https://aquazonefish.vn/products/be-kinh-sieu-trong) | [₫235k, 60x25x30 cast](https://aquazonefish.vn/products/be-kinh-duc); [₫498k, 60x36x36](https://aquazonefish.vn/products/be-kinh-sieu-trong) | No 90 listed. [₫820k, 80x40x40; ₫1.296M, 100x45x45](https://aquazonefish.vn/products/be-kinh-sieu-trong) | [₫1.92M, 120x50x50](https://aquazonefish.vn/products/be-kinh-sieu-trong) |
| Mid | [₫187k*, 30x18x20](https://thuysinh4u.com/be-kinh-sieu-trong); [₫300k*](https://thuysinhtim.vn/be-kinh-sieu-trong-cubic-30x30x30) to [₫350k, 30 cube](https://phuongnhiaquarium.vn/products/ho-kinh-sieu-trong-vuong-cubic) | [₫450k, 45x28x30](https://phuongnhiaquarium.vn/products/ho-sieu-trong-size-45) | [₫510k*, 60x30x35](https://thuysinh4u.com/be-kinh-sieu-trong); [₫600–800k, 5 to 6 mm glass](https://phuongnhiaquarium.vn/products/ho-sieu-trong-60x35x40-cm) | Made to order: [₫0.7–3.7M across sizes](https://cuahangthuysinh.vn/san-pham/ho-kinh-viet-nhat-tu-dan-mai-vi-tinh-dan-dau-keo-chat-luong-cao-kich-thuoc-chuan/) | Same range, top end |
| Premium | n/l | n/l | [₫1.15M*, 8 mm; ₫1.6M*, 60x40x40](https://phuongnhiaquarium.vn/products/ho-sieu-trong-60x35x40-cm) | [₫5.934M, 80x50x50; ₫7.723M, 100x50x50](https://aquazonefish.vn/products/be-kinh-thuy-sinh) | [₫9.149M, 120x50x50](https://aquazonefish.vn/products/be-kinh-thuy-sinh) |

### Stand (prices read 2026-11-06)

Thin data: two shops. Wooden cabinets aren't listed; shops build them to order, so a planner should ask for a quote.

| Tier | 30 and 45 cm | 60 cm | 90 cm | 120 cm |
|---|---|---|---|---|
| Iron frame | [₫600k*, 50x30x75](https://phuongnhiaquarium.vn/products/chan-sat-vuong) | [₫650k*](https://phuongnhiaquarium.vn/products/chan-sat-vuong) | n/l | [₫1.2M*, 120x50x80](https://phuongnhiaquarium.vn/products/chan-sat-vuong) |
| Aluminium kit | n/l | [₫2.725M, AZ-60](https://aquazonefish.vn/products/bo-chan-ke-ket-hop-azone-cho-ho-size-60-80-100-120-ke-be-ca-khung-nhom-cao-cap-chiu-luc-tot-de-lap-dat) | [₫3.089–3.483M, AZ-80 and AZ-100](https://aquazonefish.vn/products/bo-chan-ke-ket-hop-azone-cho-ho-size-60-80-100-120-ke-be-ca-khung-nhom-cao-cap-chiu-luc-tot-de-lap-dat) | [₫4.069M, AZ-120](https://aquazonefish.vn/products/bo-chan-ke-ket-hop-azone-cho-ho-size-60-80-100-120-ke-be-ca-khung-nhom-cao-cap-chiu-luc-tot-de-lap-dat) |

### Filter (prices read 2026-11-06)

| Kind and tier | 30 cm | 45 cm | 60 cm | 90 cm | 120 cm |
|---|---|---|---|---|---|
| Sponge, plus an air pump | [₫95k*](https://phuongnhiaquarium.vn/products/loc-vi-sinh-qs-100a) to [₫120k](https://cuahangthuysinh.vn/san-pham/bo-loc-vi-sinh-qs-200a/), pump [₫50k](https://aquazonefish.vn/products/may-sui-khi-mini-fish-president-y99-sieu-em-tiet-kiem-dien-tang-oxy-ho-ca-thuy-sinh) to [₫153k](https://aquazonefish.vn/products/yee-sui-oxy-mini-sieu-em-1-5w) | Same | Same, or two | Not the main filter | Not the main filter |
| Hang-on, budget | [₫75k, XP-06](https://thuysinhquoidecor.com/san-pham/loc-thac-jeneca-xp-06/); [₫90k, Sobo 303H](https://phuongnhiaquarium.vn/products/loc-thac-sobo-303h) | [₫120k, Sobo 606H](https://phuongnhiaquarium.vn/products/loc-thac-sobo-303h) | [₫180k, Sobo 607H](https://phuongnhiaquarium.vn/products/loc-thac-sobo-303h) | n/l | n/l |
| Hang-on, mid | [₫110k, HBL-501](https://cuahangthuysinh.vn/san-pham/may-loc-thac-be-thuy-sinh-sunsun-hbl-501/) | [₫280k](https://cuahangthuysinh.vn/san-pham/may-loc-sunsun-hbl-802/) to [₫330k, HBL-802](https://thuysinhquoidecor.com/san-pham/loc-treo-sunsun-hbl-802/) | [₫361k, YBG600](https://aquazonefish.vn/products/may-loc-treo-sunsun-ybg400-ybg500-loc-da-tang-sieu-em-hut-day-hieu-qua-danh-cho-ho-ca-va-ho-rua); [₫364k, GFB680](https://aquazonefish.vn/products/sunsun-loc-gfb) | n/l | n/l |
| Hang-on, premium | n/l | n/l | [₫462k, YLT-500](https://aquazonefish.vn/products/yee-loc-ylt); [₫797k, Netlea NO1SP](https://aquazonefish.vn/products/may-loc-thac-treo-ho-ca-netlea-hob-no1sp-no1ss) | n/l | n/l |
| Canister, budget | n/l | [₫550k, hanging X500](https://phuongnhiaquarium.vn/products/loc-thung-treo-jingy) | [₫800k, EW 302](https://phuongnhiaquarium.vn/products/loc-thung-sunsun-ew); [₫850k, T610](https://phuongnhiaquarium.vn/products/loc-thung-jy-t620-10w) | [₫1.1M*, T630](https://phuongnhiaquarium.vn/products/loc-thung-jy-t620-10w) | [₫1.3M, T640](https://phuongnhiaquarium.vn/products/loc-thung-jy-t620-10w); [₫1.37M, HW-704A](https://cuahangthuysinh.vn/san-pham/loc-thung-sunsun-hw-704a/) |
| Canister, mid | n/l | n/l | [₫1.05M, XWA 600-5](https://thuysinhquoidecor.com/san-pham/loc-thung-sunsun-xwa-600-5-cho-ho-60-70cm-loc-thung-cho-ho-ca-canh-ho-thuy-sinh/); [₫1.2M, Atman RF 701](https://thuysinhquoidecor.com/san-pham/loc-thung-atman-rf-701/) | [₫1.285M, XWA 800-5](https://thuysinhquoidecor.com/san-pham/loc-thung-sunsun-xwa-800-5-cho-ho-80-90cm-loc-thung-cho-ho-ca-canh-ho-thuy-sinh/); [₫1.38M, KY-1000](https://aquazonefish.vn/products/loc-thung-be-ca-marine-ky-plus-danh-cho-be-ca) | [₫1.585M, XWA 1000-5](https://thuysinhquoidecor.com/san-pham/loc-thung-sunsun-xwa-1000-5-cho-ho-1m-1m1-loc-thung-cho-ho-ca-canh-ho-thuy-sinh/); [₫1.85M, ZW-3000](https://cuahangthuysinh.vn/san-pham/loc-thung-sunsun-zw-3000-phien-ban-nang-cap-tu-hw-3000/) |
| Canister, premium | n/l | n/l | [₫2.202M, ES350](https://aquazonefish.vn/products/loc-thung-inox-weekaqua-es350-900-ver-2-0-dieu-khien-qua-app-bien-tan-kem-bom-loc-ngoai-cho-ho-ca); [₫4.39M, Fluval 207](https://thuysinhquoidecor.com/san-pham/loc-thung-cao-cap-tu-chau-au-fluval-207/) | [₫3.788M, ES600](https://aquazonefish.vn/products/loc-thung-inox-weekaqua-es350-900-ver-2-0-dieu-khien-qua-app-bien-tan-kem-bom-loc-ngoai-cho-ho-ca); [₫5M, Fluval 307](https://thuysinhquoidecor.com/san-pham/loc-thung-cao-cap-tu-chau-au-fluval-307/) | [₫4.508M*, ES900](https://aquazonefish.vn/products/loc-thung-inox-weekaqua-es350-900-ver-2-0-dieu-khien-qua-app-bien-tan-kem-bom-loc-ngoai-cho-ho-ca); [₫6.38M, Fluval 407](https://thuysinhquoidecor.com/san-pham/loc-thung-cao-cap-tu-chau-au-fluval-407/) |

Sizes are the shop's own, where it states one (XWA 600-5 for 60–70 cm, HW-704A for 120–150 cm). Where a shop states none, the column is my match.

### Heating and cooling (prices read 2026-11-06)

Shops sell heaters by watts, not tank size, so a planner should ask for the tank's volume and pick the rating itself.

| Class | Budget | Mid | Premium |
|---|---|---|---|
| Heater | [₫70k, Y1](https://cuahangthuysinh.vn/san-pham/suoi-ho-ca-y1/); [₫112k, JBA Y1](https://bucepviet.vn/suoi-cho-be-ca-canh-suoi-thuy-tinh-jba-y1-50w-100w-200w-chong-bong-sjbay1cb); [₫150–200k*, Periha 100–500 W](https://thuysinh4u.com/suoi-periha-he) | [₫200–220k, BX-29](https://cuahangthuysinh.vn/san-pham/suoi-ho-ca-jeneca-bx-29/); [₫320k, Sunsun ARF](https://bucepviet.vn/search?query=s%C6%B0%E1%BB%9Fi) | [₫850k*, Eheim 300 W](https://thuysinh4u.com/suoi-eheim-300w); [₫1M, Fluval M100–M300](https://bucepviet.vn/search?query=s%C6%B0%E1%BB%9Fi) |
| Fan (often more use than a heater in southern Vietnam, my view) | [₫130k, one fan up to 40 cm](https://phuongnhiaquarium.vn/products/quat-lam-mat-ho-cooling) | [₫270k, two fans for 60–100 cm](https://phuongnhiaquarium.vn/products/quat-lam-mat-ho-cooling) | [₫350k, four fans for 100 cm up](https://phuongnhiaquarium.vn/products/quat-lam-mat-ho-cooling) |
| Chiller | n/l | [₫3.85M, AL SF102, under 160 L](https://sohaaqua.com/san-pham/chiller-al-sf102-cho-be) | [₫5.2–8.8M, Hailea HS](https://cuahangthuysinh.vn/san-pham/may-lam-mat-chiller-hailea-hs-series/) |

### Light (prices read 2026-11-06)

| Tier | 30 cm | 45 cm | 60 cm | 90 cm | 120 cm |
|---|---|---|---|---|---|
| Budget | [₫400k, Kaokui M30](https://phuongnhiaquarium.vn/products/den-led-kaokui-rgb-3-in-1-chuyen-cho-cay-mau-do) | [₫450k, M40](https://phuongnhiaquarium.vn/products/den-led-kaokui-rgb-3-in-1-chuyen-cho-cay-mau-do) | [₫500k, M60](https://phuongnhiaquarium.vn/products/den-led-kaokui-rgb-3-in-1-chuyen-cho-cay-mau-do); [₫900k, YJ-600S](https://phuongnhiaquarium.vn/products/den-led-rgb-jingye) | [₫600k, M80](https://phuongnhiaquarium.vn/products/den-led-kaokui-rgb-3-in-1-chuyen-cho-cay-mau-do) | [₫1.3M, YJ-1200S](https://phuongnhiaquarium.vn/products/den-led-rgb-jingye) |
| Mid (Bluetooth) | [₫669k*, Chihiros A2](https://thuysinh4u.com/co-bao-hanh-den-led-chihiros-a2); [₫1.25M*, Slim](https://thuysinhquoidecor.com/san-pham/den-chihiros-wrgb-2-slim-30cm/) | [₫803k*, A2](https://thuysinh4u.com/co-bao-hanh-den-led-chihiros-a2); [₫1.3M*, Week M450](https://thuysinhquoidecor.com/san-pham/den-week-m450-pro-week-raptor-pro/); [₫1.4M*, Slim](https://thuysinhquoidecor.com/san-pham/den-chihiros-wrgb-2-slim-45cm/) | [₫848k*](https://thuysinh4u.com/co-bao-hanh-den-led-chihiros-a2) to [₫1.05M, A2](https://phuongnhiaquarium.vn/products/chihiros-a2-601-led); [₫1.6M, Week M600](https://thuysinhquoidecor.com/san-pham/den-week-m600-pro-week-raptor-pro/) | [₫1.116M*, A2](https://thuysinh4u.com/co-bao-hanh-den-led-chihiros-a2); [₫2.07M, Week M900](https://thuysinhquoidecor.com/san-pham/den-week-m900-pro-week-raptor-pro/) | [₫1.473M*](https://thuysinh4u.com/co-bao-hanh-den-led-chihiros-a2) to [₫1.8M, A2](https://phuongnhiaquarium.vn/products/chihiros-a2-601-led); [₫3.43M, Slim](https://thuysinhquoidecor.com/san-pham/den-chihiros-wrgb-2-slim-120cm/) |
| Premium (Bluetooth) | [₫1.85M*](https://phuongnhiaquarium.vn/products/den-chihiros-wrgb) to [₫2M*, WRGB II](https://bucepviet.vn/den-chihiros-wrgb-2); [₫2.4M*, Pro](https://bucepviet.vn/den-chihiros-wrgb-2-pro-chip-led-sieu-sang-danh-mau-ca-dep-1) | [₫2.3M*](https://phuongnhiaquarium.vn/products/den-chihiros-wrgb) to [₫2.4M*, WRGB II](https://bucepviet.vn/den-chihiros-wrgb-2); [₫2.9M*](https://bucepviet.vn/den-chihiros-wrgb-2-pro-chip-led-sieu-sang-danh-mau-ca-dep-1) to [₫3.27M, Pro](https://thuysinhquoidecor.com/san-pham/den-chihiros-wrgb-2-pro-45cm/) | [₫2.9M*](https://phuongnhiaquarium.vn/products/den-chihiros-wrgb) to [₫3.2M, WRGB II](https://bucepviet.vn/den-chihiros-wrgb-2); [₫3.45M*](https://bucepviet.vn/den-chihiros-wrgb-2-pro-chip-led-sieu-sang-danh-mau-ca-dep-1) to [₫4.02M, Pro](https://thuysinhquoidecor.com/san-pham/den-chihiros-wrgb-2-pro-60cm/) | [₫3.85M](https://phuongnhiaquarium.vn/products/den-chihiros-wrgb) to [₫4.2M, WRGB II](https://bucepviet.vn/den-chihiros-wrgb-2); [₫4.9M*](https://bucepviet.vn/den-chihiros-wrgb-2-pro-chip-led-sieu-sang-danh-mau-ca-dep-1) to [₫5.53M, Pro](https://thuysinhquoidecor.com/san-pham/den-chihiros-wrgb-2-pro-90cm/) | [₫4.65M](https://phuongnhiaquarium.vn/products/den-chihiros-wrgb) to [₫5M*, WRGB II](https://bucepviet.vn/den-chihiros-wrgb-2); [₫7.045M, Pro](https://thuysinhquoidecor.com/san-pham/den-chihiros-wrgb-2-pro-120cm/) |

### Substrate (prices read 2026-11-06)

| Tier | Product and bag |
|---|---|
| Budget | [Akadama 14 L, ₫250k*](https://thuysinhtim.vn/phan-nen-akadama-light-ss) to [₫300k](https://cuahangthuysinh.vn/san-pham/phan-nen-akadama/); [GEX 8 kg, ₫500k](https://phuongnhiaquarium.vn/products/phan-nen-gex-xanh-hang-nhat) |
| Mid | [Chihiros Aqua Soil 9 L, ₫480k*](https://thuysinhtim.vn/phan-nen-chihiros-aqua-soil-9-lit); [Netlea 9 L, ₫476k*](https://thuysinh4u.com/phan-nen-netlea-professional); [Master Soil 8 L, ₫590–600k](https://thuysinh4u.com/phan-nen-master-soil) |
| Premium | [ADA Amazonia 9 L, ₫840k](https://cuahangthuysinh.vn/san-pham/phan-nen-ada-ver2/) to [₫1.1M](https://phuongnhiaquarium.vn/products/phan-nen-ada-amazonia); [Tropica 9 L, ₫760k](https://cuahangthuysinh.vn/san-pham/phan-nen-tropical-cao-cap-den-tu-chau-au-bao-9l/) to [₫850k](https://bucepviet.vn/phan-nen-tropica-aquarium-soil-9l) |

My arithmetic for a 5 cm layer: 30x18 cm is 2.7 L, 45x28 is 6.3 L, 60x30 is 9 L, 90x45 is 20 L, 120x50 is 30 L. So one 9 L bag does anything up to 60 cm, and 90 and 120 cm take about 2 to 4 bags.

| Tier | 30 cm | 45 and 60 cm | 90 cm | 120 cm |
|---|---|---|---|---|
| Budget | About ₫100k (loose, by the kilo) | About ₫250–300k | About ₫500–600k | About ₫750–900k |
| Mid | About ₫205–260k (3 L bag) | About ₫480–600k | About ₫1–1.8M | About ₫1.9–2.4M |
| Premium | About ₫360k (3 x [Tropica 1 L, ₫120k](https://bucepviet.vn/1-l-phan-nen-tropica)) | About ₫760k–1.1M | About ₫1.5–3.3M | About ₫3–4.4M |

### CO2 kit (prices read 2026-11-06)

| Tier | Fits | What's listed |
|---|---|---|
| Budget | 30 cm | [ISTA mini kit, ₫160k](https://thuysinhquoidecor.com/san-pham/bo-kit-co2-ista-mini/); [₫160k*, refills ₫80k* each](https://phuongnhiaquarium.vn/products/kid-co2) |
| Mid | 45 to 120 cm (a bigger tank just refills more often) | [3 kg cylinder, solenoid, bubble counter, tubing and diffuser, ₫1.05M](https://cuahangthuysinh.vn/san-pham/combo-binh-co2-3kg-van-dien-dem-giot-2m-day-co2-sui-co2-aquaup/); [2 to 3 kg combos with solenoid, ₫1.55–1.6M](https://phuongnhiaquarium.vn/products/combo-binh-co2) |
| Premium | 45 to 120 cm | [ISTA aluminium 2 L, ₫2.4M](https://thuysinhquoidecor.com/san-pham/binh-co2-nhom-ista-aluminum-van-ngang-2-lit/) plus a solenoid at [₫480k](https://thuysinh4u.com/van-dien-co2-mufan) to [₫550k](https://phuongnhiaquarium.vn/products/van-dien-co2-mufan) and an inline diffuser at [₫350k](https://bucepviet.vn/tron-co2-plant-care-gia-re-khuech-tan-co2-hieu-qua); [Chihiros kit, ₫1.1M*](https://thuysinhtim.vn/bo-kit-co2-chihiros) |

### Test kits (prices read 2026-11-06, not size-dependent)

| Tier | What's listed |
|---|---|
| Budget | Strips: [YEE 9-in-1, 50 strips, ₫82k](https://aquazonefish.vn/products/bo-test-kiem-tra-chat-luong-nuoc-be-ca-yee); [6-in-1, ₫195k*](https://thuysinhtim.vn/bo-test-chat-luong-nuoc-6-in-1). CO2 indicator: [₫60k](https://thuysinhtim.vn/bo-test-co2) to [₫150k](https://phuongnhiaquarium.vn/products/bo-test-co2) |
| Mid | Liquid: [Biozym 3-in-1, ₫245k](https://thuysinh4u.com/biozym-test-kit-3-in-1); [API pH, ₫170k*](https://shrimphome.vn/api-ph-test-kit); [Prodac pH, ₫160k*](https://shrimphome.vn/bo-prodac-ph-test-kit) |
| Premium | Single parameter: [Sera Fe, ₫350k](https://shrimphome.vn/sera-fe-test); [Salifert NO3, ₫400k](https://sohaaqua.com/san-pham/test-no3-salifert-bo-nong-no3-nitrate-salifert). pH and CO2 monitors: [Caper Plus Q1, ₫1.3M](https://sohaaqua.com/san-pham/may-do-ph-nhiet-do-online-caper-plus-q1) |

### Smart gear (prices read 2026-11-06, not size-dependent)

| Class | Price | Notes |
|---|---|---|
| Wi-Fi timer, one outlet | [₫125k](https://bucepviet.vn/o-cam-hen-gio-thong-minh-bat-tat-qua-wifi-hen-gio-wifi-thiet-bi-hen-gio-be-ca-ho-thuy-sinh); [₫140k](https://phuongnhiaquarium.vn/products/hen-gio-cho-ho-thuy); [₫150k, SA003](https://cuahangthuysinh.vn/san-pham/bo-hen-gio-qua-wifi-sa003/); [₫213k, Yijin P1B](https://aquazonefish.vn/products/o-cam-wifi-yijin-p1b); [₫235k, Điện Quang](https://thuysinhtim.vn/o-cam-hen-gio-wifi-apollo-dien-quang) | |
| Tuya strip | [₫250k, Delixi 3 outlets; ₫480k* 4; ₫650k* 6](https://bucepviet.vn/o-cam-wifi-tuya-5-o-cam-dieu-khien-tu-xa); [₫400–420k*, 4](https://thuysinh4u.com/o-cam-wifi-tuya); [₫435–450k, 4 outlets + 3 USB](https://thuysinhquoidecor.com/san-pham/o-dien-hen-gio-wifi-5-cong/) | Metered versions cost ₫20k more at Thủy Sinh 4U |
| Sensors | [Thermometer, ₫60k](https://cuahangthuysinh.vn/san-pham/nhiet-ke-dien-tu-up-aqua/) to [₫160k](https://aquazonefish.vn/products/nhiet-ke-dien-tu-voonline-vlt3-nhiet-ke-dien-tu-do-nhiet-do-be-ca); [pH pen, ₫120k](https://cuahangthuysinh.vn/san-pham/but-do-nong-do-ph-trong-nuoc/); [DS18B20, ₫35–75k](https://hshop.vn/search?q=ds18b20) | Thermometers and pens have no connection |
| Top-off | [Float valve, ₫78k*](https://aquazonefish.vn/products/chua-hinh-phao-cham-nuoc-tu-dong-bom-va-ngat-cho-ho-ca-creek-bsfh016) to [₫80k](https://cuahangthuysinh.vn/san-pham/phao-cham-nuoc-tu-dong-ho-ca/); [Kamoer ATO One 2 SE, ₫1.6M](https://sohaaqua.com/san-pham/bu-nuoc-tu-dong-kamoer-ato-one-2-se-moi-nhat) | |
| Feeder | [₫142k*](https://aquazonefish.vn/products/may-cho-ca-an-tu-dong-sunsun-chong-am-hen-gio-thong-minh-tien-loi-cho-ho-ca-thuy-sinh) to [₫180k, Sunsun AK-01S](https://cuahangthuysinh.vn/san-pham/may-cho-ca-an-tu-dong-sunsun-ak-01s/); [₫300k, Jebao AF-250](https://sohaaqua.com/san-pham/may-cho-ca-tu-dong-jebao-af-250-250ml); [₫1.155M, Jebao Auto6L](https://aquazonefish.vn/products/jebao-may-cho-ca-an-afd10-auto6l) | |
| Doser | [₫1.65M, Kamoer X1 Pro 2](https://sohaaqua.com/san-pham/bom-vi-luong-kamoer-x1-pro-2-wifi); [₫1.7M, Jebao MD-4.4](https://sohaaqua.com/san-pham/doser-jebao-md-4-4-wifi-mau-moi-bom-dinh-luong-tu-dong-cai-tien-chuan-hon); [₫2.34M*, Chihiros Dosing System](https://thuysinh4u.com/chihiros-dosing-system) | Soha Aqua also lists a Neptune Apex doser at [₫9M](https://sohaaqua.com/san-pham/bom-vi-luong-dos-neptune-system-apex-doser) |
| Hub | Section 3 | |

None of the five full catalogs I downloaded lists Sonoff, Inkbird, TP-Link Tapo or Seneye, so aquarium shops aren't where a reader finds those.

### A 60 cm tank, worked three ways (my arithmetic, from the tables above)

| Part | Budget, no CO2 | Mid, with CO2 | Premium, with CO2 and hub |
|---|---|---|---|
| Tank | ₫235k | ₫600k | ₫1.6M |
| Stand | Own furniture, ₫0 | ₫650k | ₫2.725M |
| Filter | ₫180k (hang-on) | ₫1.05M (XWA 600-5) | ₫4.39M (Fluval 207) |
| Heater | ₫70k | ₫220k | ₫1M |
| Light | ₫500k | ₫1.05M (A2) | ₫4.02M (WRGB II Pro) |
| Substrate | ₫300k | ₫480k | ₫1.1M |
| CO2 | ₫0 | ₫1.05M | ₫3.3M (aluminium, solenoid, diffuser) |
| Test kit | ₫82k | ₫245k | ₫245k |
| Smart gear | ₫0 | ₫435k (strip) | ₫450k (strip), ₫135k (ESP32), ₫75k (probe) |
| Hub | ₫0 | ₫0 | ₫3.618M (Pi 5, 4 GB, plus ₫360k power supply) |
| Total | About ₫1.4M | About ₫5.8M | About ₫23M |

No fish, plants or tools are included.

### Running costs: electricity tariffs

| Country | Tariff | Source |
|---|---|---|
| Vietnam, from 2026-11-01 | Before VAT, ₫/kWh: up to 100 kWh **1,901**; 101–200 **2,289**; 201–400 **2,894**; 401–700 **3,456**; 701 and up **3,844** | [EVN retail tariff, posted 2026-11-04](https://www.evn.com.vn/d/vi-VN/news/Gia-ban-le-dien-cho-cac-nhom-khach-hang-su-dung-dien-theo-Quyet-dinh-so-2892QD-BCT-ngay-31102026-cua-Bo-Cong-Thuong-60-3566-510170) (2026-11-06), [its table image](https://www.evn.com.vn/userfile/User/tcdl/images/2026/11/4-20261104123938226_Gia%20ban%20le%20dien%20sinh%20hoat_04112026.jpg) (2026-11-06). "Before tax" and the decision number from [EVN South](https://cskh.evnspc.vn/TraCuu/ThongTinGiaDien) (2026-11-06) |
| Indonesia, Oct to Dec 2026 | Rp/kWh, non-subsidised: R-1 900 VA-RTM **1,352.00**; R-1 1,300 VA and 2,200 VA **1,444.70**; R-2 3,500–5,500 VA and R-3 6,600 VA and up **1,699.53** | [PLN tariff adjustment, Jakarta, 22 Oct 2026](https://www.pln.co.id/webapi/media/file/webkorp/asset/TARIFF-ADJUSTMENT-Okt-Des-2026.pdf) (2026-11-06). Subsidised classes aren't in it: 13 of 37 classes adjust ([PLN](https://www.pln.co.id/pelanggan-id/tarif-tenaga-listrik-id/penyesuaian-tarif-id) (2026-11-06)). I read the PDF, but it answered 404 on a re-check the same day, so PLN's page is the steadier link |
| Thailand, from the September 2026 bill | Baht/unit. Type 1.1.1 (up to 150 units a month): 1–15 **2.3488**; 16–25 **2.9882**; 26–200 **3.0000**; 201–400 **4.1584**; 401 up **4.3583**. Type 1.1.2 (over 150): 1–200 **3.0000**; 201–400 **4.1584**; 401 up **4.3583**. Add Ft **0.1623** (Sep to Dec 2026), the service charge and VAT | [PEA notice, 11 Sep 2569](https://www.pea.co.th/news/corporate-news/2412) (2026-11-06); [Ft, PEA's copy of the ERC notice](https://www.pea.co.th/sites/default/files/ft/2026/Ft%20surcharge%20SEP-DEC%202026_Final.pdf) (2026-11-06). MEA's site rejected my requests. [Thairath](https://en.thairath.co.th/news/society/2953586) (2026-11-06) reports the same figures for MEA from the same ERC resolution |

I did not confirm Vietnam's current VAT rate, or PEA's and MEA's service charges. For a planner, the rate that counts is the household's top tier, since a tank adds to the top of the bill.

### Running costs: wattage (read 2026-11-06)

| Class | Watts | Source |
|---|---|---|
| Clip light | 2–18 W | [QL series, 2–8 W](https://aquazonefish.vn/products/ql-den-kep-mini-ql-012-8w-ql-q02-2w-ql-q04-4w); [JY S3 plus, 18 W](https://phuongnhiaquarium.vn/products/den-kep-jy-s3-plus-18w) |
| Bluetooth light, 30 to 120 cm | WRGB II: 33, 49, 67, 100, 130 W. WRGB II Pro: 37–138 W. Week: Z200 Pro 70 W, T90 Pro 90 W, A430 Pro 120 W | [WRGB II table](https://bucepviet.vn/den-chihiros-wrgb-2); [Pro](https://bucepviet.vn/den-chihiros-wrgb-2-pro-chip-led-sieu-sang-danh-mau-ca-dep-1); [Z200](https://cuahangthuysinh.vn/san-pham/den-week-aqua-z-series-tank-z200-pro-70w-app-control/), [T90](https://phuongnhiaquarium.vn/products/den-weekaqua-t90-pro), [A430](https://phuongnhiaquarium.vn/products/den-weekaqua-a430-pro) |
| Hang-on filter | 2.5–8 W | [XP-03, 2.5 W](https://phuongnhiaquarium.vn/products/loc-thac-xp-03); [YLT-300 5 W, YLT-500 7 W](https://aquazonefish.vn/products/yee-loc-ylt); [HBL-701, 8 W](https://cuahangthuysinh.vn/san-pham/loc-thac-sunsun-hbl-701-8w-600l-h/) |
| Canister filter | 8–22 W | [JY-T610 8 W to T650 18 W](https://phuongnhiaquarium.vn/products/loc-thung-jy-t620-10w); [Atman RF 14–22 W](https://aquazonefish.vn/products/may-loc-thung-atman-rf-501-701-1001-1301-the-he-moi-tiet-kiem-dien) |
| Air pump | 1.5–3.5 W | [W-601 to W-604](https://aquazonefish.vn/products/abc-sui-oxy-1-voi-w-601-2-voi-w602) |
| Heater | 25–1,000 W rated | Runs only below its set point, so its rating isn't what you pay for. I found no figure for how often it runs |
| Chiller | 150 W (AL SF102, 1/10 HP); others not read | [Soha Aqua](https://sohaaqua.com/san-pham/chiller-al-sf102-cho-be) |
| CO2 solenoid, smart strip | No wattage found in the shop pages I read | |
| Hub | 1.7 W idle, 3 W load (Green) | [HA Green](https://www.home-assistant.io/green/) |

### Running costs: what a tank's electricity comes to (my arithmetic)

Watts x hours a day x 30 ÷ 1,000 gives kWh a month, using the tariffs above, before VAT and service charges. The light runs 8 hours, everything else 24, and no heater, fan or chiller is included.

| Setup | kWh a month | Vietnam, 101–200 tier | Vietnam, 201–400 tier | Indonesia, 1,300 VA | Thailand, 3.00 + Ft |
|---|---|---|---|---|---|
| 30 cm: 13 W light, 5 W hang-on | 6.7 | ₫15k | ₫19k | Rp9,700 | ฿21 |
| 60 cm: 67 W WRGB II, 10 W canister | 23.3 | ₫53k | ₫67k | Rp33,600 | ฿74 |
| 120 cm: 130 W WRGB II, 18 W canister, 3 W air | 46.3 | ₫106k | ₫134k | Rp66,900 | ฿146 |
| Add a Home Assistant Green, idle | 1.2 | ₫2.8k | ₫3.5k | Rp1,800 | ฿3.9 |

### Running costs: CO2, fertilizer and food

- **CO2 refill.** A 3 L cylinder costs [₫80k](https://thuysinh4u.com/hop-co2-mt3-thuy-sinh) or [₫80k](https://khichuanvietnam.net.vn/nap-khi-binh-co2-thuy-sinh/) to [₫170k](https://napbinhchuachaygiare.com/tin-tuc-pccc/gia-bom-binh-khi-co2-ho-thuy-sinh-tai-tphcm.html) a refill, and smaller ones ₫60–100k. How long one lasts depends on the bubble rate. Shop pages in my search snippets said 3 to 5 months for 3 kg, which I did not confirm. That would be about ₫16–57k a month, my arithmetic.
- **Fertilizer.** All-in-one: [All in One Pro 230 ml, ₫100k](https://thuysinhquoidecor.com/san-pham/nuocphan-nuoc-tong-hop-all-in-one-pro-230ml/); [VBM Special, ₫250k](https://cuahangthuysinh.vn/san-pham/vbm-special-phan-nuoc-tong-hop-da-luong-vi-luong/). Seachem Flourish: [250 ml, ₫290k](https://phuongnhiaquarium.vn/products/seacheam-flourish-vi-luong), at [5 mL per 250 L once or twice a week](https://www.seachem.com/flourish.php). For a 60 L tank dosed twice a week that's about 10 mL a month, so about ₫12k a month, my arithmetic. Flourish is meant to be used with other nutrients, so a full routine costs more. Root tabs: [₫300k](https://phuongnhiaquarium.vn/products/phan-nhet-seachem-flourish-tabs). Shops list bottles, not monthly costs.
- **Food.** [Multi Color, ₫50–115k a pack](https://thuysinhtim.vn/thuc-an-ca-canh-multi-color); [Multi Color Bites 140 g, ₫120k](https://thuysinhquoidecor.com/san-pham/thuc-an-ca-canh-multi-color-bites140g/); [Tropical Pro Defence 100 g, ₫102k*](https://thuysinh4u.com/thuc-an-ca-tropical-pro-defence-size-s). No shop lists a monthly figure. A planner should ask how often the bottle or pack gets replaced, not invent a rate.

All links in this list read 2026-11-06.

---

## 6. Cloud-only options

The owner asked whether there's a cloud assistant, so no box at home. In short, there isn't one that does the whole job.

### Home Assistant Cloud (Nabu Casa)

- US$6.50 a month or US$65 a year, tax not included, after a 31-day free trial. The page offers prices in USD, CAD, EUR and GBP. [Nabu Casa pricing](https://www.nabucasa.com/pricing/) (2026-11-06)
- It adds remote access, links to Google Assistant and Alexa, and speech engines for Assist. "Home Assistant works fully without it", and "everything else continues to run locally on your own hardware". [HA Cloud](https://www.home-assistant.io/cloud/) (2026-11-06)
- So the box is still needed. The subscription reaches your box from outside. It doesn't run your rules for you.

Nabu Casa's support pages returned 403 to me, so I did not read their detail.

### The brands' own clouds, and voice assistants, with no hub

| | Tuya / Smart Life | eWeLink | Google Home | Alexa |
|---|---|---|---|---|
| When a rule starts | Weather (temperature, sunrise, sunset), location, schedule, device status ([Tuya manual](https://developer.tuya.com/en/docs/iot/user-manual-for-tuya-smart-v3177?id=K9obrofrfk4sk) (2026-11-06)) | Time, device status, sensor readings, with "all" or "any" logic ([eWeLink](https://ewelink.cc/how-to-create-more-advanced-scenes/) (2026-11-06), [TH16 example](https://ewelink.cc/level-up-your-home-automation-with-ewelink-scenes/) (2026-11-06)) | Time, sunset, device state, voice ([routines](https://support.google.com/googlehome/answer/7029585?hl=en) (2026-11-06), [starters](https://support.google.com/googlehome/answer/15684394?hl=en) (2026-11-06)) | An event you choose in the app; search snippet only ([Amazon](https://www.amazon.com/gp/help/customer/display.html?nodeId=G2PYLKJN3XVZ55EQ)) |
| Water temperature as a start | Yes, a device status from a Wi-Fi probe. It fires only when the value crosses the line, not while it stays above ([Tuya](https://support.tuya.com/en/help/_detail/K9hutgp5de4pk) (2026-11-06)) | Yes, with a TH probe. "TH16 cannot be added to Condition and Action at the same time" in an older post ([eWeLink](https://ewelink.cc/level-up-your-home-automation-with-ewelink-scenes/) (2026-11-06)) | Yes as a starter, if the sensor is linked and reports it. "Not all devices support all" ([Google](https://support.google.com/googlehome/answer/15684394?hl=en) (2026-11-06)) | Unconfirmed. An old developer forum post says only Echo sensors ([snippet](https://forums.developer.amazon.com/questions/226814/smart-home-skill-as-trigger-for-a-routine.html)) |
| Actions an aquarium uses | Switch outlets, run or enable other scenes ([Tuya manual](https://developer.tuya.com/en/docs/iot/user-manual-for-tuya-smart-v3177?id=K9obrofrfk4sk) (2026-11-06)) | Switch outlets, delay, run other scenes ([eWeLink](https://ewelink.cc/how-to-create-more-advanced-scenes/) (2026-11-06)) | Switch devices, notify ([Google](https://support.google.com/googlehome/answer/15684394?hl=en) (2026-11-06)) | Switch devices (snippet) |
| Reaches | That brand's devices | That brand's devices | Linked Wi-Fi brands, so it can mix Tuya and Sonoff plugs. SmartLife users can [authorize Google and Alexa](https://developer.tuya.com/en/docs/iot/terms?id=K914joq6tegj4) (2026-11-06) | Same idea |
| Can't reach | Chihiros and Week Aqua Bluetooth lights | Same | Same | Same |
| Internet down | Cloud timers fail, local timers still run. See below | Scenes: not stated. LAN control keeps the phone app working on compatible devices, but "does not make every eWeLink feature available offline" ([eWeLink](https://ewelink.cc/how-to-use-lan-control-in-ewelink-for-local-device-control/) (2026-11-06)) | "Can depend on working internet, Wi-Fi, and service availability" from Google and the device maker ([Google](https://support.google.com/googlehome/answer/16214649?hl=en) (2026-11-06)) | Unconfirmed |
| Available here | VN, ID, TH (shops sell these) | VN (Sonoff, earlier research) | App availability in VN unconfirmed. That help page's language list includes Indonesian and Thai, not Vietnamese ([Google](https://support.google.com/googlehome/answer/13323253?hl=en) (2026-11-06)) | Vietnam unconfirmed. Amazon's page on international Echo devices lists Indonesia and Thailand, English only ([snippet, page about 4.5 years old](https://www.amazon.com/gp/help/customer/display.html?nodeId=202207000)) |

"Can't reach" is my reading of the device lists: no Bluetooth light of these brands appears in them. Chihiros sells a Wi-Fi Hub that bridges its Bluetooth devices to its own cloud (earlier research). It works inside My Chihiros, and I found no public API for it. Tuya's own note on Bluetooth covers Tuya devices only: scenes reach Bluetooth Mesh devices or devices in range. [Tuya](https://support.tuya.com/en/help/_detail/K9hutgp5de4pk) (2026-11-06)

**What happens when the internet is down, Tuya.**

- Cloud timing: "if the device is offline, the timing execution will be unsuccessful". Local timing runs either way. [Tuya](https://support.tuya.com/en/help/_detail/K9d1qifd5qtcp) (2026-11-06) Tuya's OS docs agree that a local schedule "does not depend on a cloud connection". [TuyaOS](https://developer.tuya.com/en/docs/iot-device-dev/TuyaOS-iot_abi_device_local_timer?id=Kd5s8n8503nyh) (2026-11-06)
- A power failure during the timing period resets local timing. [Tuya](https://support.tuya.com/en/help/_detail/K9d1qifd5qtcp) (2026-11-06) Together that's a real risk: a power cut followed by no internet, and a timer-driven CO2 outlet is no longer on schedule.
- Which kind your strip uses isn't printed anywhere. Tuya says to ask. [Tuya](https://support.tuya.com/en/help/_detail/K9d1qifd5qtcp) (2026-11-06) A reader can test it: turn off the router for a few minutes across a timer's time and watch.
- Automations: I found no Tuya page that says they run with no internet. Its troubleshooting asks you to check the device was online. [Tuya](https://support.tuya.com/en/help/_detail/K9hutgp5de4pk) (2026-11-06) I'd plan on them not running. Gateways may run some locally, unconfirmed.

**What happens when the internet is down, eWeLink.** State-duration conditions are "currently not supported in local scenes", which shows that local scenes exist. [eWeLink](https://ewelink.cc/make-scenes-run-at-the-right-time-with-state-duration-conditions/) (2026-11-06) I couldn't read how they're defined: eWeLink's help centre answered with a Cloudflare challenge, so I left it. Its CUBE hub runs automations locally ([CUBE](https://cube.ewelink.cc/feature-exploration/automation-and-scene) (2026-11-06)), but it's a box at home, so that isn't a no-hub answer.

**A warning worth repeating to readers.** Google says automations "are for convenience only, not safety or security-critical use cases", and not to create automations "that could result in injury or harm if they fail to start or stop". [Google](https://support.google.com/googlehome/answer/16214649?hl=en) (2026-11-06) A CO2 outlet qualifies. eWeLink's terms also reserve the right to suspend services without notice. [eWeLink terms, 6.5](https://ewelink.cc/terms-of-service/) (2026-11-06)

**What cloud-only can do well.** Phone alerts when a Wi-Fi probe crosses a line, a Tuya strip whose timers run CO2 and lights, and a single rule mixing two brands through Google. That's enough for many tanks. What it can't do is anything with a Bluetooth light, keep history you can trust, or work reliably with the internet off.

### Developer terms for a service that runs automations for its users

This is the question behind AquaTome's parked server route ([smart-plugs.md](../smart-plugs.md)). I read the developer docs, not signed contracts, and this isn't legal advice.

**Tuya.**

- Tuya's pricing page says "The Trial Edition only applies to individual developers or works for debugging purposes. Commercial use is prohibited." This is the primary source the earlier research lacked. [Tuya pricing](https://developer.tuya.com/en/docs/iot/membership-service?id=K9m8k45jwvg9j) (2026-11-06)
- Trial limits, same page: about 26 thousand API calls and 68 thousand messages a month, 50 devices, 10 controllable devices, one data center. At the allowance "the service will be suspended until the allowance is refreshed next month". 26 thousand calls is about one every 100 seconds for a month, so a server polling a reader's devices would use it up quickly.
- Paid editions exist, Flagship and Corporate, with 75,000 and 200,000 devices. The page's worked example gives Flagship a US$1,500 monthly allowance. Its actual price is on a details page that showed me no text. [Tuya pricing](https://developer.tuya.com/en/docs/iot/membership-service?id=K9m8k45jwvg9j) (2026-11-06)
- A branded app of your own has a clear price: the App SDK's official edition is "provided for commercial use" at US$5,000 for the first year and US$2,000 a year after. The free development edition stops at 100 registered end users and 1 million cloud requests a month. [Tuya App SDK pricing](https://developer.tuya.com/en/docs/app-development/app-sdk-price?id=Kbu0tcr2cbx3o) (2026-11-06)
- Linking accounts: Tuya's OAuth flow has you "Enable Login Authorization for your OEM app", and users log in "with an account for an app with login authorization enabled". [Tuya OAuth](https://developer.tuya.com/en/docs/iot/authorization-code-page-usage?id=Kdkyz44dz6a7r) (2026-11-06) So it's built around your own branded app, not Smart Life. The Smart Life route Tuya describes is for third-party voice platforms such as Alexa and Google Home. [Tuya glossary](https://developer.tuya.com/en/docs/iot/terms?id=K914joq6tegj4) (2026-11-06) That matches why the route was parked. Home Assistant's QR code uses Tuya's [device-sharing SDK](https://github.com/tuya/tuya-device-sharing-sdk) (2026-11-06), which is the authorization AquaTome has already asked Tuya about.
- I could not read Tuya's full platform terms: [its agreement page](https://platform.tuya.com/legal-agreement) (2026-11-06) rendered nothing in my fetch.
- What's still open: can AquaTome run rules for readers using each reader's own trial project, the way the app calls Tuya today? The readers would be individual developers, but AquaTome running it as a service looks commercial to me. Ask Tuya before building that.

**eWeLink.**

- "Commercial use of the APIs requires a paid subscription", priced on request. Personal developers get OAuth login free, with one credential valid for a year, limited calls, no support and "no warranty for stability". [eWeLink pricing](https://coolkit-technologies.github.io/eWeLink-API/en/Pricing.md) (2026-11-06)
- Free APPID: 50,000 calls a month, per region, for all interfaces. Paid APPID: 6 million a year, with more on request. After review you may create one application. [eWeLink OAuth](https://coolkit-technologies.github.io/eWeLink-API/en/OAuth2.0.md) (2026-11-06) These pages' headers show last edits in December 2021, so check before relying on the numbers.
- Unlike Tuya, OAuth here works with ordinary eWeLink accounts, for any certified developer. [eWeLink OAuth](https://coolkit-technologies.github.io/eWeLink-API/en/OAuth2.0.md) (2026-11-06) So a server route is possible, but it's a paid one if AquaTome counts as commercial, and I think it does.
- The app's own terms are for "non-commercial purposes", and bar logging in through third-party software not authorized by eWeLink. [eWeLink terms, 2.2 and 4.1.5](https://ewelink.cc/terms-of-service/) (2026-11-06) That rules out holding a reader's eWeLink password on a server.

**For both.** A server that fires rules on a schedule takes on responsibility that the parked design avoided: it would switch CO2 and heaters with nobody watching. The rule in [smart-plugs.md](../smart-plugs.md), that a switch happens only on a reader's tap, was made for that reason. Writing the strip's own timers, already listed there under "Later", gets most of the value with none of the server, the quota or the terms problem.

---

## 7. What this means for AquaTome

**What AquaTome's own control already covers, with no hub.**

- Chihiros lights: schedule, levels and clock, from the site or app, and the schedule then runs on the light.
- Tuya plugs in the app, on the reader's own keys: outlets named by role, switched on a tap, and a warning when a strip's timer cuts the light's power and so resets its clock.
- That's a full answer for a reader with a Chihiros light and a Tuya strip. Tell them so, plainly, before mentioning hubs.

**A "smart tank" guide section could offer.**

1. "Do you need a hub?" as a short decision: one brand, no. Several brands or alerts, maybe. Show the price of each answer.
2. The cloud-only answer from section 6, for the reader who asks what the owner asked.
3. A device table, trimmed from section 2, with no integration names for beginners and the full version one tap away.
4. Recipes from section 4, each saying what it does with no hub first.
5. The tests a reader can run: router off across a timer's time, power off and on, then look at the light's clock.
6. Safety rules, sourced: base schedule on the device, Google's warning, a mechanical second stop on top-off.

**A whole-setup budget planner could offer.**

1. Inputs: tank size, tier, CO2 or not, smart or not, and country for the tariff.
2. Output: a parts list with price ranges from section 5, links through `/go/` where a shop has an affiliate deal, and a month's electricity.
3. Prices as data with a read date, refreshed by script. The shop feeds in section 5 are public and repeatable. Show the date beside the price and never one number without a range.
4. Tariffs as data per country, with the tier the household says it reaches. Vietnam's just changed, and PLN adjusts quarterly and Thailand's Ft every four months, so these need a date too.
5. Indonesian and Thai prices are the gap. I collected only Vietnamese shop prices.

**Worth checking with the owner.**

- Whether the planner may name shops' prices directly, or only ranges.
- Whether to ask Tuya the question in section 6 before designing anything that runs rules for readers.
- Whether to correct the earlier research doc's Jebao, Apex and Tuya-trial lines. I left that file alone.

---

## Appendix: what I couldn't read or confirm

Blocked or unreadable, skipped as the rules say:

- `help.ewelink.cc` answered with a Cloudflare challenge.
- `www.mea.or.th` rejected requests, so MEA's figures are from Thairath's report.
- `web.pln.co.id` and `www.erc.or.th` timed out. I used `www.pln.co.id` and PEA's copy of the Ft notice instead.
- `support.nabucasa.com` and `www.nabucasa.com/config` returned 403.
- `platform.tuya.com/legal-agreement` showed nothing readable.
- Seneye's old store page returned 404, so I have no Seneye price.
- Amazon's help pages didn't give readable text to my fetch. Alexa cells are from search snippets.

Not confirmed:

- Any Vietnamese seller of Home Assistant Green, or of Inkbird controllers.
- BLE 5 extended advertising being required for Chihiros on an ESP32 (one author).
- Whether Tuya and eWeLink cloud scenes run with no internet.
- Google Home's and Alexa's availability in Vietnam.
- VAT rates, and Thai service charges.
- Indonesian and Thai prices for equipment.
