#!/usr/bin/env node
/**
 * Zero-dependency smoke tests: `npm test`
 *  1. every widget renders at every allowed size (with and without media) without throwing
 *  2. rendered HTML never contains unescaped user input
 *  3. the YouTube feed parser handles entities and "- Topic" artists
 *  4. the build produces a single-file page with the data inlined
 */
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parseFeed, playlistId } from './lib/youtube.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('✓ ' + name); }
  catch (e) { console.error('✗ ' + name + '\n  ' + e.message); process.exitCode = 1; }
};

const ctx = vm.createContext({ console, URL });
ctx.window = ctx;
for (const f of ['i18n.js', 'widgets.js', 'render.js']) vm.runInContext(await readFile(join(root, 'src', f), 'utf8'), ctx, { filename: f });
const T = ctx.Tessera;

await test('every widget renders at every size', () => {
  let n = 0;
  for (const [type, def] of Object.entries(T.widgets)) {
    for (const size of def.sizes) {
      const [c, r] = T.util.SIZES[size];
      for (const extra of [{}, { image: 'assets/x.webp', src: 'assets/x.webp', items: 'assets/x.webp | cap', url: 'https://example.com' }]) {
        const html = def.render({ ...def.defaults, ...extra }, { size, c, r, id: 't' });
        assert.ok(typeof html === 'string' && html.includes('w-body'), `${type} ${size} has no .w-body`);
        n++;
      }
    }
  }
  assert.ok(n > 50, 'expected more renders');
});

await test('user input is escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  for (const [type, def] of Object.entries(T.widgets)) {
    const props = Object.fromEntries(def.fields.filter((f) => f.type !== 'select' && f.key !== 'code').map((f) => [f.key, evil]));
    const html = def.render({ ...def.defaults, ...props }, { size: def.sizes[0], c: 2, r: 2, id: 't' });
    assert.ok(!html.includes('<img src=x'), `${type} leaks raw HTML`);
  }
  assert.equal(T.util.safeUrl('javascript:alert(1)'), '');
});

await test('page renders with one grid per section', () => {
  const html = T.pageHtml({ settings: {}, widgets: [
    { id: 'a', type: 'text', size: '2x1', props: {} },
    { id: 's', type: 'section', size: 'section', props: { title: 'S' } },
    { id: 'b', type: 'text', size: '2x1', props: {} }
  ] });
  assert.equal((html.match(/class="grid"/g) || []).length, 2);
});

await test('YouTube feed parser', () => {
  const xml = `<feed><title>My list</title><author><name>Me</name></author>
    <entry><yt:videoId>GR2V7i-zCRE</yt:videoId><title>Lose &amp; Find</title><author><name>Tiësto - Topic</name></author></entry>
    <entry><yt:videoId>bad</yt:videoId><title>x</title></entry></feed>`;
  const pl = parseFeed(xml, 'PLx');
  assert.equal(pl.title, 'My list');
  assert.equal(pl.items.length, 1);
  assert.deepEqual({ ...pl.items[0] }, { v: 'GR2V7i-zCRE', t: 'Lose & Find', a: 'Tiësto' });
  assert.equal(playlistId('https://music.youtube.com/playlist?list=PL-abc_123&si=x'), 'PL-abc_123');
  assert.equal(playlistId('https://music.youtube.com/watch?v=abcdefghijk&list=PLx'), null);
});

await test('build produces a single prerendered file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tessera-'));
  const page = join(dir, 'page.json');
  await writeFile(page, JSON.stringify({ settings: { title: 'Test <page>', profile: { name: 'Ada' } }, widgets: [{ id: 'x', type: 'text', props: { title: 'Hello' } }] }));
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs'), '--inline-assets'], { env: { ...process.env, TESSERA_PAGE: page }, stdio: 'pipe' });
  const html = await readFile(join(root, 'dist/index.html'), 'utf8');
  assert.ok(html.includes('<title>Test &lt;page&gt;</title>'), 'title escaped');
  assert.ok(html.includes('id="page-data"') && html.includes('Hello'), 'data inlined + prerendered');
  assert.ok(!/<script src="\w+\.js"><\/script>/.test(html), 'scripts inlined');
});

console.log(`\n${passed} passed${process.exitCode ? ', some failed' : ''}`);
process.exit(process.exitCode || 0); // render.js keeps a countdown interval alive
