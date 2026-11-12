#!/usr/bin/env node
/**
 * Tessera build: src/ + page.json → dist/index.html
 *  - one self-contained HTML file (CSS, JS and page data inlined)
 *  - prerendered markup (same render code as the browser) for SEO / no-JS
 *  - SEO + Open Graph meta from page.json settings
 *
 * Usage:
 *   node scripts/build.mjs                  # dist/index.html + dist/assets/
 *   node scripts/build.mjs --inline-assets  # also inline local assets/* as data URIs (truly one file)
 *   TESSERA_PAGE=other.json node scripts/build.mjs
 *   TESSERA_URL=https://me.example.com node scripts/build.mjs   # absolute og:url / og:image
 */
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const INLINE_ASSETS = args.has('--inline-assets');
const pagePath = resolve(process.env.TESSERA_PAGE || join(root, 'page.json'));
const siteUrl = (process.env.TESSERA_URL || '').replace(/\/$/, '');
const out = join(root, 'dist');
const SCRIPTS = ['i18n.js', 'widgets.js', 'render.js', 'editor.js', 'app.js'];
const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const src = (f) => readFile(join(root, 'src', f), 'utf8');
/** String.replace without `$&` surprises. */
const put = (html, needle, value) => {
  if (!html.includes(needle)) throw new Error(`template marker not found: ${needle}`);
  return html.split(needle).join(value);
};

/** Replace "assets/…" strings with data URIs (for single-file builds). */
async function inlineAssets(node) {
  if (typeof node === 'string') {
    const mime = MIME[extname(node).toLowerCase()];
    const file = join(root, node.replace(/^\.\//, ''));
    if (/^(\.\/)?assets\//.test(node) && mime && existsSync(file))
      return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
    return node;
  }
  if (Array.isArray(node)) return Promise.all(node.map(inlineAssets));
  if (node && typeof node === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(node)) o[k] = await inlineAssets(v);
    return o;
  }
  return node;
}
/** Gallery items are "url | caption" lines; inline those too. */
async function inlineGallery(data) {
  for (const w of data.widgets || []) {
    if (w.type !== 'gallery' || !w.props?.items) continue;
    const lines = await Promise.all(
      w.props.items.split('\n').map(async (line) => {
        const [u, ...rest] = line.split('|');
        return [await inlineAssets(u.trim()), ...rest].join(' |');
      })
    );
    w.props.items = lines.join('\n');
  }
  return data;
}

const raw = JSON.parse(await readFile(pagePath, 'utf8'));
let data = INLINE_ASSETS ? await inlineGallery(await inlineAssets(raw)) : raw;

/* ---- prerender with the exact browser code, in a sandbox ---- */
const code = Object.fromEntries(await Promise.all(SCRIPTS.map(async (s) => [s, await src(s)])));
const ctx = vm.createContext({ console, URL });
ctx.window = ctx;
for (const s of ['i18n.js', 'widgets.js', 'render.js']) vm.runInContext(code[s], ctx, { filename: s });
const T = ctx.Tessera;
T.util.normalize(data);
T.pageLang = data.settings.lang || 'en';
const prerendered = T.pageHtml(data, {});

/* ---- meta ---- */
const s = data.settings;
const title = s.title || s.profile.name || 'Tessera';
const description = s.description || s.profile.tagline || '';
const abs = (u) => (!u || /^(https?:|data:)/.test(u) ? u : siteUrl ? `${siteUrl}/${u.replace(/^\.?\//, '')}` : u);
const ogImage = raw.settings?.profile?.avatar ? abs(raw.settings.profile.avatar) : '';
const meta = [
  `<meta property="og:type" content="profile">`,
  `<meta property="og:title" content="${esc(title)}">`,
  description && `<meta property="og:description" content="${esc(description)}">`,
  siteUrl && `<meta property="og:url" content="${esc(siteUrl)}/">`,
  siteUrl && `<link rel="canonical" href="${esc(siteUrl)}/">`,
  ogImage && !ogImage.startsWith('data:') && `<meta property="og:image" content="${esc(ogImage)}">`,
  `<meta name="twitter:card" content="summary">`,
  s.profile.avatar && `<link rel="icon" href="${esc(s.profile.avatar)}">`
].filter(Boolean).join('\n  ');

/* ---- assemble ---- */
const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');
let html = await src('index.html');
html = put(html, '<html lang="en">', `<html lang="${esc(T.pageLang)}" style="${esc(T.themeVars(s.theme))}">`);
html = put(html, '<title>Tessera</title>', `<title>${esc(title)}</title>`);
html = put(html, '<meta name="description" content="">', `<meta name="description" content="${esc(description)}">`);
html = put(html, '<meta name="theme-color" content="#F6EFE6">', `<meta name="theme-color" content="${esc(Object.assign({}, T.DEFAULT_THEME, s.theme).bg)}">`);
html = put(html, '<!--tessera:meta-->', meta);
html = put(html, '<link rel="stylesheet" href="styles.css">', `<style>\n${await src('styles.css')}</style>`);
html = put(html, '<div id="app"></div>', `<div id="app">${prerendered}</div>`);
html = put(html, '<script type="application/json" id="page-data"></script>',
  `<script type="application/json" id="page-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
for (const f of SCRIPTS) html = put(html, `<script src="${f}"></script>`, `<script>\n${safeScript(code[f])}</script>`);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(join(out, 'index.html'), html);
await writeFile(join(out, 'page.json'), JSON.stringify(raw, null, 2) + '\n');
if (!INLINE_ASSETS && existsSync(join(root, 'assets'))) await cp(join(root, 'assets'), join(out, 'assets'), { recursive: true });
for (const f of ['CNAME', '_headers', '_redirects', 'robots.txt']) if (existsSync(join(root, f))) await cp(join(root, f), join(out, f));

console.log(`✓ dist/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB  ·  ${data.widgets.length} widgets${INLINE_ASSETS ? '  ·  assets inlined' : ''}`);
