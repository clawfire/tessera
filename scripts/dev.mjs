#!/usr/bin/env node
/**
 * Zero-dependency dev server.
 *   /            → src/index.html (loads ./page.json via fetch)
 *   /*.js|css    → src/
 *   /page.json   → ./page.json
 *   /assets/*    → ./assets/
 * Open http://localhost:5173/#edit to use the editor.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file;
  if (path === '/' || path === '/index.html') file = join(root, 'src', 'index.html');
  else if (path === '/page.json') file = join(root, process.env.TESSERA_PAGE || 'page.json');
  else if (path.startsWith('/assets/')) file = join(root, path);
  else file = join(root, 'src', path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Tessera dev → http://localhost:${port}   (editor: http://localhost:${port}/#edit)`));
