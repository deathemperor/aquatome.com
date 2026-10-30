/** Marks a UI string a browser script shows through ct(variable), so scripts/i18n-client.mjs collects it. */
export const msg = <S extends string>(s: S): S => s
