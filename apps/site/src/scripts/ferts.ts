/**
 * Dry fertiliser salts for planted tanks: what each gram puts into the water. ppm = mg per litre = g × share × 1000 / L.
 * Shares are mass fractions from molar masses (KNO3 101.10, KH2PO4 136.09, K2SO4 174.26, MgSO4·7H2O 246.47,
 * CaSO4·2H2O 172.17); trace mixes and chelated iron as labelled.
 */
export type Ion = 'NO3' | 'N' | 'PO4' | 'P' | 'K' | 'Mg' | 'Ca' | 'SO4' | 'Fe' | 'Mn' | 'B'
export const SALTS = {
  kno3: { name: 'KNO3 (kali nitrat)', formula: 'KNO₃', gives: { NO3: 0.6133, N: 0.1385, K: 0.3867 } },
  kh2po4: { name: 'KH2PO4 (kali dihydro photphat)', formula: 'KH₂PO₄', gives: { PO4: 0.6979, P: 0.2276, K: 0.2873 } },
  k2so4: { name: 'K2SO4 (kali sunfat)', formula: 'K₂SO₄', gives: { K: 0.4487, SO4: 0.5513 } },
  mgso4: { name: 'MgSO4·7H2O (muối Epsom)', formula: 'MgSO₄·7H₂O', gives: { Mg: 0.0986, SO4: 0.3898 } },
  caso4: { name: 'CaSO4·2H2O (thạch cao)', formula: 'CaSO₄·2H₂O', gives: { Ca: 0.2328, SO4: 0.5579 } },
  csmb: { name: 'CSM+B (vi lượng, Plantex)', formula: 'CSM+B', gives: { Fe: 0.0653, Mn: 0.0187, B: 0.0118, Mg: 0.014 } },
  fedtpa: { name: 'Sắt DTPA 11%', formula: 'Fe-DTPA', gives: { Fe: 0.11 } },
  feedta: { name: 'Sắt EDTA 13%', formula: 'Fe-EDTA', gives: { Fe: 0.13 } },
} as const satisfies Record<string, { name: string; formula: string; gives: Partial<Record<Ion, number>> }>
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

/** Estimative Index (EI) weekly targets in ppm (Practical Fishkeeping), dosed in three parts, 50% water change once a week. */
export const EI_WEEK: Partial<Record<Ion, number>> = { NO3: 20, PO4: 3, K: 30, Mg: 10, Fe: 0.5 }
export const EI_DOSES = 3
/** The ion a salt is dosed for (its EI line). */
export const MAIN: Record<SaltId, Ion> = { kno3: 'NO3', kh2po4: 'PO4', k2so4: 'K', mgso4: 'Mg', caso4: 'Ca', csmb: 'Fe', fedtpa: 'Fe', feedta: 'Fe' }
