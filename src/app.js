/**
 * Tessera — boot
 * Data comes from the inlined <script id="page-data"> (production build)
 * or from ./page.json (dev server).
 */
(async function (T) {
  'use strict';
  const app = document.getElementById('app');
  let data;
  try {
    const inline = document.getElementById('page-data');
    data = inline && inline.textContent.trim()
      ? JSON.parse(inline.textContent)
      : await (await fetch('page.json', { cache: 'no-store' })).json();
  } catch (e) {
    console.error('[tessera] could not load page data', e);
    app.innerHTML = '<p style="padding:2rem;font-family:system-ui">Could not load <code>page.json</code>.</p>';
    return;
  }

  T.util.normalize(data);
  T.published = JSON.parse(JSON.stringify(data));
  T.current = data;
  T.uiLang = (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  T.bindGlobal();

  const route = () => (location.hash === '#edit' ? T.editor.start() : T.editor.stop());
  window.addEventListener('hashchange', route);

  T.render(T.current); // hydrate (replaces the prerendered markup with identical output)
  route();
})(window.Tessera);
