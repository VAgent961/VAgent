// Local preview of vagent.online: node scripts/www-preview.mjs [port]  ->  http://localhost:8788/
// Serves "/" from www/ (as the middleware does on the apex domain) and only the public files around it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain' };
export function serve(port = 8788) {
  const server = createServer(async (req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p === '/') p = '/www/index.html';
    if (!/^\/(www\/|assets\/|favicon|apple-touch-icon|icon-)/.test(p)) { res.writeHead(404); return res.end('Not found'); }
    try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body); }
    catch { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const port = Number(process.argv[2]) || 8788; await serve(port); console.log(`http://localhost:${port}/`); }
