// The built site as files (no Worker): /x/ → x/index.html, else the file, else 404.html with status 404.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'

const [dir = 'dist', port = '4419'] = process.argv.slice(2)
const root = resolve(dir)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' }
createServer((req, res) => {
  let f = join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname))
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html')
  const found = f.startsWith(root) && existsSync(f)
  const file = found ? f : join(root, '404.html')
  res.writeHead(found ? 200 : 404, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(Number(port), '127.0.0.1')
