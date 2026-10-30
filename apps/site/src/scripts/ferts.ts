/**
 * Dry fertiliser salts for planted tanks: what each gram puts into the water. ppm = mg per litre = g × share × 1000 / L.
 * Shares are mass fractions from molar masses (KNO3 101.10, KH2PO4 136.09, K2SO4 174.26, MgSO4·7H2O 246.47,
 * CaSO4·2H2O 172.17); trace mixes and chelated iron as labelled.
 */
export type Ion = 'NO3' | 'N' | 'PO4' | 'P' | 'K' | 'Mg' | 'Ca' | 'SO4' | 'Fe' | 'Mn' | 'B'
export const SALTS = {
  kno3: { name: 'KNO3 (kali nitrat)', gives: { NO3: 0.6133, N: 0.1385, K: 0.3867 } },
  kh2po4: { name: 'KH2PO4 (kali dihydro photphat)', gives: { PO4: 0.6979, P: 0.2276, K: 0.2873 } },
  k2so4: { name: 'K2SO4 (kali sunfat)', gives: { K: 0.4487, SO4: 0.5513 } },
  mgso4: { name: 'MgSO4·7H2O (muối Epsom)', gives: { Mg: 0.0986, SO4: 0.3898 } },
  caso4: { name: 'CaSO4·2H2O (thạch cao)', gives: { Ca: 0.2328, SO4: 0.5579 } },
  csmb: { name: 'CSM+B (vi lượng, Plantex)', gives: { Fe: 0.0653, Mn: 0.0187, B: 0.0118, Mg: 0.014 } },
  fedtpa: { name: 'Sắt DTPA 11%', gives: { Fe: 0.11 } },
  feedta: { name: 'Sắt EDTA 13%', gives: { Fe: 0.13 } },
} as const satisfies Record<string, { name: string; gives: Partial<Record<Ion, number>> }>
export type SaltId = keyof typeof SALTS

/** One dose into the tank: `grams` of a salt, either straight in or as `doseMl` of a solution of `grams` in `solutionMl`. */
export function ppm(salt: SaltId, grams: number, tankLitres: number, solution?: { solutionMl: number; doseMl: number }): Partial<Record<Ion, number>> {
  const g = solution ? (grams * solution.doseMl) / solution.solutionMl : grams
  return Object.fromEntries(Object.entries(SALTS[salt].gives).map(([ion, share]) => [ion, (g * share * 1000) / tankLitres]))
}

/** Grams of a salt to raise `ion` by `target` ppm in `tankLitres`. */
export function gramsFor(salt: SaltId, ion: Ion, target: number, tankLitres: number): number | undefined {
  const share = (SALTS[salt].gives as Partial<Record<Ion, number>>)[ion]
  return share ? (target * tankLitres) / (share * 1000) : undefined
}

/** Estimative Index (EI): what each of three doses a week aims for, with a 50% water change once a week. */
export const EI_PER_DOSE: Partial<Record<Ion, [number, number]>> = { NO3: [5, 7.5], PO4: [1, 1.3], K: [3.3, 10], Fe: [0.1, 0.2], Mg: [1, 3] }
