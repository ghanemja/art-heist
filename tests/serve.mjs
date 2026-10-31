// Tiny static file server for the test harness (no deps). Serves the repo root like Netlify:
// `node tests/serve.mjs [port]` — or import { serve } and call serve(port) → { url, close }.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.bin': 'application/octet-stream',
};

export function serve(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const s = await stat(file).catch(() => null);
      if (!s || !s.isFile()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await serve(Number(process.argv[2] ?? 8080));
  console.log(`serving ${ROOT} at ${url}`);
}
