/** A vector tile as GBIF writes one: one layer, "occurrence", each square a polygon feature with its `total` (a sint64). */
export function mvt(squares: { x: number; y: number; size: number; total: number }[]): Uint8Array<ArrayBuffer> {
  const varint = (n: number) => { const out: number[] = []; while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128) } out.push(n); return out }
  const field = (f: number, bytes: number[]) => [...varint(f * 8 + 2), ...varint(bytes.length), ...bytes]
  const zz = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n)
  const values = [...new Set(squares.map(s => s.total))]
  const layer = [
    ...field(1, [...new TextEncoder().encode('occurrence')]),
    ...squares.flatMap(s => {
      // MoveTo(1) the top left, LineTo(3) the other three corners, ClosePath.
      const geometry = [...varint(9), ...varint(zz(s.x)), ...varint(zz(s.y)), ...varint(26), ...varint(zz(s.size)), 0, 0, ...varint(zz(s.size)), ...varint(zz(-s.size)), 0, 15]
      return field(2, [...field(2, [0, values.indexOf(s.total)]), 24, 3, ...field(4, geometry)])
    }),
    ...field(3, [...new TextEncoder().encode('total')]),
    ...values.flatMap(v => field(4, [48, ...varint(zz(v))])),
    40, ...varint(4096),
  ]
  return new Uint8Array(field(3, layer))
}
