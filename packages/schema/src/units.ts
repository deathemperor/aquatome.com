const round1 = (n: number) => Math.round(n * 10) / 10
export const cToF = (c: number): number => round1(c * 9 / 5 + 32)
export const cmToIn = (cm: number): number => round1(cm / 2.54)
