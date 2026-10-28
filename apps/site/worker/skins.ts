export const SKINS = ['mix', 'a', 'b', 'c'] as const
export type Skin = (typeof SKINS)[number]
export type Weights = Record<Skin, number>
export const EQUAL: Weights = { mix: 0.25, a: 0.25, b: 0.25, c: 0.25 }
export const isSkin = (s: unknown): s is Skin => typeof s === 'string' && (SKINS as readonly string[]).includes(s)
