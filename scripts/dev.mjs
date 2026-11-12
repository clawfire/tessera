#!/usr/bin/env node
/**
 * Zero-dependency dev server — also the editor's local backend.
 *   /                  → src/index.html (loads ./page.json via fetch)
 *   /*.js|css          → src/
 *   /page.json         → ./page.json (or $TESSERA_PAGE)
 *   /assets/*          → ./assets/
 *   GET  /__tessera/ping          → lets the editor switch to "local" mode
 *   POST /__tessera/upload?path=  → writes an image under assets/uploads/
 *   POST /__tessera/save          → writes the page JSON to disk
 * Listens on 127.0.0.1 only. Open http://localhost:5173/#edit to use the editor.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, normalize, extname, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPlaylist } from './lib/youtube.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5173);
const pageFile = resolve(root, process.env.TESSERA_PAGE || 'page.json');
const uploads = join(root, 'assets', 'uploads');
const MAX_BODY = 20 * 1024 * 1024;
const ytCache = new Map();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };

const json = (res, code, obj) => res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(obj));
const body = (req) =>
  new Promise((ok, ko) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { ko(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', ko);
  });

async function api(req, res, url) {
  // only same-origin requests from the editor (blocks drive-by POSTs from other sites)
  const origin = req.headers.origin;
  if (req.method === 'POST' && origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'cross-origin' });

  if (url.pathname === '/__tessera/ping') return json(res, 200, { tessera: true, page: relative(root, pageFile) });

  if (url.pathname === '/__tessera/upload' && req.method === 'POST') {
    const rel = url.searchParams.get('path') || '';
    const file = resolve(root, rel);
    if (!/^assets\/uploads\/[a-z0-9-]+\.(webp|jpg|png|gif|svg)$/.test(rel) || !file.startsWith(uploads)) return json(res, 400, { error: 'bad path' });
    await mkdir(uploads, { recursive: true });
    await writeFile(file, await body(req));
    console.log('↑ ' + rel);
    return json(res, 200, { path: rel });
  }

  if (url.pathname === '/__tessera/save' && req.method === 'POST') {
    const text = (await body(req)).toString('utf8');
    const data = JSON.parse(text); // throws → 500 on invalid JSON
    if (!Array.isArray(data.widgets)) return json(res, 400, { error: 'not a Tessera page' });
    await writeFile(pageFile, text);
    console.log('✓ saved ' + relative(root, pageFile));
    return json(res, 200, { path: relative(root, pageFile) });
  }
  if (url.pathname === '/__tessera/youtube-playlist') {
    const list = url.searchParams.get('list') || '';
    if (!/^[\w-]{10,64}$/.test(list)) return json(res, 400, { error: 'bad list id' });
    const hit = ytCache.get(list);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return json(res, 200, hit.data);
    const data = await fetchPlaylist(list);
    ytCache.set(list, { at: Date.now(), data });
    console.log(`♫ ${data.title || list}: ${data.items.length} tracks`);
    return json(res, 200, data);
  }
  return json(res, 404, { error: 'unknown endpoint' });
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/__tessera/')) return await api(req, res, url);
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file;
  if (path === '/' || path === '/index.html') file = join(root, 'src', 'index.html');
  else if (path === '/page.json') file = pageFile;
  else if (path.startsWith('/assets/')) file = join(root, path);
  else file = join(root, 'src', path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(content);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Tessera dev → http://localhost:${port}   (editor: http://localhost:${port}/#edit)\n  page: ${relative(root, pageFile)}`)
);
