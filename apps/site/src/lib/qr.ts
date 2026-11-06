import qrcode from 'qrcode-generator'

/**
 * A QR code as one SVG path, a row's runs of dark modules each one rectangle (a <rect> a module would be a thousand page
 * elements). `size`: modules a side, the quiet zone around them left to the page.
 */
export function qrPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  let d = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!qr.isDark(y, x)) continue
      const from = x
      while (x + 1 < size && qr.isDark(y, x + 1)) x++
      d += `M${from} ${y}h${x - from + 1}v1h-${x - from + 1}z`
    }
  }
  return { size, d }
}
