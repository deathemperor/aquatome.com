/**
 * What AquaTome itself controls, from the code that controls it: the light tool's model table and the plug makers the app
 * has a `PlugSource` for. A product page's "control it with AquaTome" block and the engine's candidate list read this, so
 * a page stays true when support changes. A maker's light in progress in the app (Week Aqua) isn't here until it ships.
 */
export type Channel = 'white' | 'red' | 'green' | 'blue'
/** A light model: its channels in channel-id order (red 0, green 1, blue 2, white 3; a white-only light uses 0). */
export type LightModel = { name: string; channels: Channel[] }
const WHITE: Channel[] = ['white']
const RGB: Channel[] = ['red', 'green', 'blue']
const WRGB: Channel[] = ['red', 'green', 'blue', 'white']
// Name prefix → model (registry.py). Lights with other channel layouts (X300, Z Light Tiny, Egg, Commander 1) are left out.
export const CHIHIROS_MODELS: [string[], LightModel][] = [
  [['DYNA2', 'DYNA2N'], { name: 'A II', channels: WHITE }],
  [['DYA'], { name: 'A Series', channels: WHITE }],
  [['DYC', 'DYNC2'], { name: 'C', channels: WHITE }],
  [['DYNC2N'], { name: 'C II', channels: WHITE }],
  [['DYONE'], { name: 'Commander X', channels: WHITE }],
  [['DYARGB', 'DYRGBA+', 'DYRGBA', 'DYNARGB'], { name: 'RGB A Plus', channels: RGB }],
  [['DYREE', 'DYNVVD', 'DYNV'], { name: 'RGB VIVID', channels: RGB }],
  [['DYWRGB', 'DYNT90', 'DYNW30', 'DYNW45', 'DYNW60', 'DYNW90', 'DYNW12P', 'DYNWRGB'], { name: 'WRGB II', channels: RGB }],
  [['DYSILN', 'DYSL30', 'DYSL45', 'DYSL60', 'DYSL90', 'DYSL120', 'DYSL12'], { name: 'WRGB II Slim', channels: RGB }],
  [['DYNCRGP', 'DYNCRGB'], { name: 'C II RGB', channels: RGB }],
  [['DYWPRO30', 'DYWPRO45', 'DYWPRO60', 'DYWPRO80', 'DYWPRO90', 'DYWPR120'], { name: 'WRGB II Pro', channels: WRGB }],
  [['DYVVD3'], { name: 'WRGB VIVID III', channels: WRGB }],
  [['DYU550', 'DYU600', 'DYU700', 'DYU800', 'DYU920', 'DYU1000', 'DYU1200', 'DYU1500'], { name: 'Universal WRGB', channels: WRGB }],
  [['DYSEA'], { name: 'SEA', channels: WRGB }],
  [['DYLED', 'DYNLED'], { name: 'Commander 4', channels: WRGB }],
]
/** The light lines the light tool and the app drive. */
export const CHIHIROS_LINES = CHIHIROS_MODELS.map(([, m]) => m.name)

/**
 * Plug makers the app switches: one per `PlugSource` in apps/ios/AquaTomeKit/Sources/Plugs (a test holds the two together).
 * Only the app does; the site's "Bể của tôi" doesn't show plugs yet (docs/smart-plugs.md). eWeLink (Sonoff) joins when it
 * has a `PlugSource`.
 */
export const PLUG_FAMILIES = [{ id: 'tuya', name: 'Smart Life (Tuya)', brands: ['Tuya', 'Smart Life'] }] as const

/** A model's name as words: lower case, "II" and "2" alike, "WRGB2 90" as "wrgb 2 90", "60cm" as "60". */
export function modelWords(s: string): string[] {
  const ROMAN: Record<string, string> = { ii: '2', iii: '3', iv: '4' }
  return s.toLowerCase().replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)\s*cm\b/g, '$1').split(/[^a-z0-9]+/).filter(Boolean).map(w => ROMAN[w] ?? w)
}
const same = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i])
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The supported line a model belongs to: its words, or its words and a size ("WRGB II 60" is WRGB II; "WRGB II Slim" is
 * not, and "C II" is never "C" in size 2: a size has two digits or more). The longest line first.
 */
export function chihirosLine(model: string): string | undefined {
  const words = modelWords(model)
  const size = words.at(-1) && /^\d{2,4}$/.test(words.at(-1)!) ? words.slice(0, -1) : words
  return [...CHIHIROS_LINES].sort((a, b) => modelWords(b).length - modelWords(a).length).find(l => same(modelWords(l), words) || same(modelWords(l), size))
}

export type Control =
  | { kind: 'light'; line: string; channels: Channel[]; tool: string }
  | { kind: 'plug'; family: string; name: string }
/** What AquaTome can do with a product, if anything. */
export function controlOf(brand: string, model: string): Control | undefined {
  if (norm(brand) === 'chihiros') {
    const line = chihirosLine(model)
    const m = line && CHIHIROS_MODELS.find(([, x]) => x.name === line)?.[1]
    return m ? { kind: 'light', line: m.name, channels: m.channels, tool: '/vi/cong-cu/den-chihiros/' } : undefined
  }
  const plug = PLUG_FAMILIES.find(f => f.brands.some(b => norm(b) === norm(brand)))
  return plug ? { kind: 'plug', family: plug.id, name: plug.name } : undefined
}
