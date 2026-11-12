/**
 * Tessera — in-browser editor (open the page with #edit)
 *
 * No backend: the draft lives in localStorage. "Export" downloads page.json,
 * which you commit to your repo; CI rebuilds the static site.
 */
window.Tessera = window.Tessera || {};
(function (T) {
  'use strict';
  const { esc, uid } = T.util;
  // One draft per page URL, tied to the published page.json it started from:
  // a draft made on another page (or before page.json changed) is never restored.
  const KEY = 'tessera:draft:v2:' + location.pathname;
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const baseHash = () => hash(JSON.stringify(T.published));
  const te = (k) => T.te(k);
  const L = (s) => T.L(s);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const $ = (s, r = document) => r.querySelector(s);

  const store = {
    get() {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) || 'null');
        return s && s.base === baseHash() ? s.data : null;
      } catch (e) { return null; }
    },
    set(d) { try { localStorage.setItem(KEY, JSON.stringify({ base: baseHash(), data: d })); } catch (e) { /* private mode */ } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* noop */ } }
  };

  // A preset replaces the whole theme except the corner radius.
  const BASE = { font: 'system', display: '', dark: '', fontCss: '' };
  const PRESETS = [
    { name: 'Warm', ...BASE, bg: '#F6EFE6', card: '#FFFFFF', text: '#2A211C', accent: '#D9822B' },
    { name: 'Paper', ...BASE, bg: '#F4F4F0', card: '#FFFFFF', text: '#111111', accent: '#2F5BFF' },
    { name: 'Mint', ...BASE, bg: '#E8F3EE', card: '#FFFFFF', text: '#10302A', accent: '#1F9D6B' },
    { name: 'Night', ...BASE, bg: '#121212', card: '#1E1E1E', text: '#F2F2F2', accent: '#A3E635' },
    { name: 'Ember', ...BASE, bg: '#14110F', card: '#221C18', text: '#F5E9DA', accent: '#FF5A1F' },
    // Clawfire — Spring Wood / Almond / Tan / Mosque / Blue Whale / Midnight, Inter + Dosis (self-hosted)
    { name: 'Clawfire', bg: '#F8F5F1', card: '#FFFFFF', text: '#031734', accent: '#066464', dark: '#043649', font: 'inter', display: 'dosis', fontCss: 'assets/fonts/clawfire.css' },
    { name: 'Clawfire Night', bg: '#031734', card: '#043649', text: '#F8F5F1', accent: '#CDB37F', dark: '#066464', font: 'inter', display: 'dosis', fontCss: 'assets/fonts/clawfire.css' }
  ];

  const ed = (T.editor = {});
  let S = null; // editor state, null when not editing
  let ac = null; // AbortController for listeners
  let timer = null;

  /* ---------- lifecycle ---------- */
  ed.start = () => {
    if (S) return;
    const draft = store.get();
    S = { data: T.util.normalize(draft || clone(T.current || T.published)), selected: null, dragId: null, drop: null, undo: [] };
    ac = new AbortController();
    document.body.classList.add('editing');
    mountChrome();
    bind(ac.signal);
    paint();
    toast(draft ? te('draftRestored') : te('editHint'));
  };

  ed.stop = () => {
    if (!S) return;
    T.current = S.data; // keep showing the draft as a preview
    ac.abort();
    S = null;
    document.body.classList.remove('editing', 'panel-open');
    $('#tessera-chrome')?.remove();
    T.render(T.current);
  };

  const exit = () => {
    history.replaceState(null, '', location.pathname + location.search);
    ed.stop();
  };

  /* ---------- state helpers ---------- */
  const find = (id) => S.data.widgets.find((w) => w.id === id);
  const indexOf = (id) => S.data.widgets.findIndex((w) => w.id === id);

  function paint() {
    T.current = S.data;
    T.render(S.data, { editing: true, selected: S.selected });
  }
  /** Save the draft and repaint (debounced while typing). */
  function commit(debounced = false) {
    store.set(S.data);
    clearTimeout(timer);
    if (debounced) timer = setTimeout(paint, 220);
    else paint();
  }
  function snapshot() {
    S.undo.push(JSON.stringify(S.data));
    if (S.undo.length > 60) S.undo.shift();
  }
  function undo() {
    const prev = S.undo.pop();
    if (!prev) return;
    S.data = JSON.parse(prev);
    if (S.selected && !find(S.selected)) closePanel();
    commit();
    refreshPanel();
    toast(te('undone'));
  }

  /* ---------- chrome (toolbar, panel, modal) ---------- */
  function mountChrome() {
    const types = Object.values(T.widgets)
      .map((d) => `<button type="button" data-add="${d.type}"><span>${d.icon}</span>${esc(L(d.label))}</button>`)
      .join('');
    const el = document.createElement('div');
    el.id = 'tessera-chrome';
    el.innerHTML = `
      <div class="tb" role="toolbar" aria-label="Editor">
        <button type="button" data-tb="add" class="primary">＋ ${te('add')}</button>
        <button type="button" data-tb="settings">🎨 <span class="lbl">${te('settings')}</span></button>
        <span class="sep"></span>
        <button type="button" data-tb="export" title="${te('export')}">⬇ <span class="lbl">${te('export')}</span></button>
        <button type="button" data-tb="import" title="${te('import')}">⬆ <span class="lbl">${te('import')}</span></button>
        <button type="button" data-tb="reset" title="${te('reset')}">↺</button>
        <span class="sep"></span>
        <button type="button" data-tb="exit">✓ ${te('done')}</button>
        <input type="file" accept="application/json,.json" hidden id="tessera-file">
      </div>
      <aside class="panel" hidden aria-label="Inspector">
        <header><h2></h2><button type="button" data-tb="close" aria-label="Close">✕</button></header>
        <div class="panel-body"></div>
      </aside>
      <div class="modal" hidden>
        <div class="modal-card" role="dialog" aria-label="${te('addWidget')}">
          <header><h2>${te('addWidget')}</h2><button type="button" data-tb="close-modal" aria-label="Close">✕</button></header>
          <div class="types">${types}</div>
        </div>
      </div>
      <div class="toast" hidden role="status"></div>`;
    document.body.appendChild(el);
  }

  function toast(msg) {
    const t = $('#tessera-chrome .toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.hidden = true), 2600);
  }

  /* ---------- form fields ---------- */
  function field(f, val, scope) {
    const v = val ?? '';
    const k = `data-scope="${scope}" data-key="${esc(f.key)}"${f.bool ? ' data-bool="1"' : ''}`;
    let input;
    if (f.type === 'textarea') {
      input = `<textarea ${k} rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
    } else if (f.type === 'select') {
      input = `<select ${k}>${f.options
        .map(([ov, ol]) => `<option value="${esc(ov)}"${String(ov) === String(v) ? ' selected' : ''}>${esc(L(ol))}</option>`)
        .join('')}</select>`;
    } else if (f.type === 'color') {
      input = `<span class="color"><input type="color" ${k} value="${esc(/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000')}"><input type="text" ${k} value="${esc(v)}" spellcheck="false"></span>`;
    } else {
      const attrs = ['step', 'min', 'max'].filter((x) => f[x] != null).map((x) => `${x}="${f[x]}"`).join(' ');
      input = `<input type="${f.type || 'text'}" ${k} value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${attrs}>`;
    }
    return `<label class="fld"><span>${esc(L(f.label))}</span>${input}${f.help ? `<small>${esc(L(f.help))}</small>` : ''}</label>`;
  }

  function openPanel(id) {
    const w = find(id);
    if (!w) return;
    const def = T.widgets[w.type] || { label: w.type, icon: '❓', sizes: [w.size], fields: [] };
    const panel = $('#tessera-chrome .panel');
    panel.hidden = false;
    document.body.classList.add('panel-open');
    panel.dataset.mode = 'widget';
    $('h2', panel).textContent = `${def.icon} ${L(def.label)}`;
    const sizeName = (s) => (s === 'section' ? te('fullWidth') : s.replace('x', ' × '));
    const tones = ['default', 'accent', 'dark', 'ghost'];
    const tone = w.tone || def.defaultTone || 'default';
    $('.panel-body', panel).innerHTML = `
      <div class="row2">
        ${field({ key: 'size', label: te('size'), type: 'select', options: def.sizes.map((s) => [s, sizeName(s)]) }, w.size || def.sizes[0], 'w')}
        ${field({ key: 'tone', label: te('tone'), type: 'select', options: tones.map((t) => [t, te('tone_' + t)]) }, tone, 'w')}
      </div>
      ${def.fields.map((f) => field(f, w.props[f.key], 'p')).join('')}
      <div class="panel-actions">
        <button type="button" data-pact="up">↑ ${te('moveUp')}</button>
        <button type="button" data-pact="down">↓ ${te('moveDown')}</button>
        <button type="button" data-pact="dup">⧉ ${te('duplicate')}</button>
        <button type="button" data-pact="del" class="danger">✕ ${te('delete')}</button>
      </div>`;
  }

  function openSettings() {
    S.selected = null;
    paint();
    const s = S.data.settings;
    const panel = $('#tessera-chrome .panel');
    panel.hidden = false;
    document.body.classList.add('panel-open');
    panel.dataset.mode = 'settings';
    $('h2', panel).textContent = '🎨 ' + te('settings');
    const yesNo = [['true', te('yes')], ['false', te('no')]];
    $('.panel-body', panel).innerHTML = `
      <h3>${te('profile')}</h3>
      ${field({ key: 'avatar', label: 'Avatar (URL)', type: 'url' }, s.profile.avatar, 'pr')}
      ${field({ key: 'name', label: 'Name|Nom' }, s.profile.name, 'pr')}
      ${field({ key: 'tagline', label: 'Tagline|Accroche' }, s.profile.tagline, 'pr')}
      ${field({ key: 'location', label: 'Location|Localisation' }, s.profile.location, 'pr')}
      ${field({ key: 'bio', label: 'Bio', type: 'textarea', rows: 4 }, s.profile.bio, 'pr')}
      <h3>${te('theme')}</h3>
      <div class="presets">${PRESETS.map((p, i) => `<button type="button" data-preset="${i}" style="background:${p.bg};color:${p.text}"><i style="background:${p.accent}"></i>${p.name}</button>`).join('')}</div>
      <div class="row2">
        ${field({ key: 'bg', label: 'Background|Fond', type: 'color' }, s.theme.bg || T.DEFAULT_THEME.bg, 'th')}
        ${field({ key: 'card', label: 'Cards|Cartes', type: 'color' }, s.theme.card || T.DEFAULT_THEME.card, 'th')}
        ${field({ key: 'text', label: 'Text|Texte', type: 'color' }, s.theme.text || T.DEFAULT_THEME.text, 'th')}
        ${field({ key: 'accent', label: 'Accent', type: 'color' }, s.theme.accent || T.DEFAULT_THEME.accent, 'th')}
        ${field({ key: 'radius', label: 'Corner radius|Arrondi', type: 'number', min: 0, max: 48 }, s.theme.radius ?? T.DEFAULT_THEME.radius, 'th')}
        ${field({ key: 'font', label: 'Font|Police', type: 'select', options: Object.keys(T.FONTS).map((f) => [f, f]) }, s.theme.font || 'system', 'th')}
        ${field({ key: 'display', label: 'Caption font|Police des légendes', type: 'select', options: [['', '= Font|= Police'], ...Object.keys(T.FONTS).map((f) => [f, f])] }, s.theme.display || '', 'th')}
        ${field({ key: 'dark', label: 'Inverted cards|Cartes inversées', type: 'color' }, s.theme.dark || s.theme.text || T.DEFAULT_THEME.text, 'th')}
      </div>
      ${field({ key: 'fontCss', label: 'Font stylesheet (@font-face)|Feuille de polices (@font-face)', type: 'url', placeholder: 'assets/fonts/my-fonts.css', help: 'Self-hosted fonts: drop .woff2 + a CSS file in assets/fonts|Polices auto-hébergées : dépose les .woff2 + un CSS dans assets/fonts' }, s.theme.fontCss, 'th')}
      <h3>${te('page')}</h3>
      ${field({ key: 'title', label: 'Page title (SEO)|Titre de la page (SEO)' }, s.title, 's')}
      ${field({ key: 'description', label: 'Description (SEO)', type: 'textarea', rows: 2 }, s.description, 's')}
      <div class="row2">
        ${field({ key: 'lang', label: 'Language|Langue', type: 'select', options: [['en', 'English'], ['fr', 'Français']] }, s.lang || 'en', 's')}
        ${field({ key: 'showEditButton', label: 'Public edit button|Bouton d’édition public', type: 'select', options: yesNo, bool: true }, String(!!s.showEditButton), 's')}
      </div>
      ${field({ key: 'footer', label: 'Footer|Pied de page', type: 'textarea', rows: 2 }, s.footer, 's')}
      <h3>${te('publish')}</h3>
      <p class="hint">${esc(te('hint'))}</p>
      <div class="panel-actions">
        <button type="button" data-tb="export">⬇ ${te('export')} page.json</button>
        <button type="button" data-tb="copy">⧉ ${te('copy')}</button>
      </div>`;
  }

  function refreshPanel() {
    const panel = $('#tessera-chrome .panel');
    if (!panel || panel.hidden) return;
    if (panel.dataset.mode === 'settings') openSettings();
    else if (S.selected) openPanel(S.selected);
  }

  function closePanel() {
    const panel = $('#tessera-chrome .panel');
    if (panel) panel.hidden = true;
    document.body.classList.remove('panel-open');
    if (S.selected) {
      S.selected = null;
      paint();
    }
  }

  function select(id) {
    S.selected = id;
    paint();
    openPanel(id);
  }

  /* ---------- actions ---------- */
  function action(act, id) {
    const w = find(id);
    if (!w) return;
    const i = indexOf(id);
    const arr = S.data.widgets;
    const def = T.widgets[w.type];
    switch (act) {
      case 'edit':
        return select(id);
      case 'size': {
        if (!def) return;
        snapshot();
        const cur = Math.max(0, def.sizes.indexOf(w.size));
        w.size = def.sizes[(cur + 1) % def.sizes.length];
        commit();
        if (S.selected === id) openPanel(id);
        return;
      }
      case 'dup': {
        snapshot();
        const copy = Object.assign(clone(w), { id: uid() });
        arr.splice(i + 1, 0, copy);
        store.set(S.data);
        return select(copy.id);
      }
      case 'del':
        snapshot();
        arr.splice(i, 1);
        if (S.selected === id) closePanel();
        commit();
        return toast(te('deleted'));
      case 'up':
      case 'down': {
        const j = act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= arr.length) return;
        snapshot();
        [arr[i], arr[j]] = [arr[j], arr[i]];
        commit();
        $(`#app .w[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
    }
  }

  function addWidget(type) {
    const def = T.widgets[type];
    if (!def) return;
    snapshot();
    const w = { id: uid(), type, size: def.sizes[0], props: clone(def.defaults) };
    const at = S.selected ? indexOf(S.selected) + 1 : S.data.widgets.length;
    S.data.widgets.splice(at, 0, w);
    $('#tessera-chrome .modal').hidden = true;
    store.set(S.data);
    select(w.id);
    requestAnimationFrame(() => $(`#app .w[data-id="${w.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function moveTo(fromId, toId, before) {
    const arr = S.data.widgets;
    const [w] = arr.splice(indexOf(fromId), 1);
    let j = arr.findIndex((x) => x.id === toId);
    if (!before) j += 1;
    arr.splice(j, 0, w);
    commit();
  }

  function toolbar(name, btn) {
    switch (name) {
      case 'add':
        return ($('#tessera-chrome .modal').hidden = false);
      case 'close-modal':
        return ($('#tessera-chrome .modal').hidden = true);
      case 'settings':
        return openSettings();
      case 'close':
        return closePanel();
      case 'export':
        T.download('page.json', JSON.stringify(S.data, null, 2) + '\n', 'application/json');
        return toast(te('exported'));
      case 'copy':
        return navigator.clipboard?.writeText(JSON.stringify(S.data, null, 2)).then(() => toast(te('copied')), () => {});
      case 'import':
        return $('#tessera-file').click();
      case 'reset': {
        // two-step confirm, no blocking dialogs
        if (!btn.dataset.armed) {
          btn.dataset.armed = '1';
          btn.textContent = te('confirm');
          return setTimeout(() => { delete btn.dataset.armed; btn.textContent = '↺'; }, 3000);
        }
        snapshot();
        store.clear();
        S.data = T.util.normalize(clone(T.published));
        closePanel();
        paint();
        delete btn.dataset.armed;
        btn.textContent = '↺';
        return toast(te('resetDone'));
      }
      case 'exit':
        return exit();
    }
  }

  /* ---------- events ---------- */
  function onClick(e) {
    const t = e.target;
    const tb = t.closest('[data-tb]');
    if (tb) return toolbar(tb.dataset.tb, tb);
    const add = t.closest('[data-add]');
    if (add) return addWidget(add.dataset.add);
    const preset = t.closest('[data-preset]');
    if (preset) {
      snapshot();
      const { name, ...colors } = PRESETS[+preset.dataset.preset];
      Object.assign(S.data.settings.theme, colors);
      commit();
      return openSettings();
    }
    const pact = t.closest('[data-pact]');
    if (pact && S.selected) return action(pact.dataset.pact, S.selected);
    if (t.closest('#tessera-chrome .modal') && !t.closest('.modal-card')) return ($('#tessera-chrome .modal').hidden = true);

    if (!t.closest('#app')) return;
    e.preventDefault(); // no navigation while editing
    const w = t.closest('.w[data-id]');
    const act = t.closest('[data-act]');
    if (act && w) return action(act.dataset.act, w.dataset.id);
    if (w) return select(w.dataset.id);
    if (t.closest('.profile')) return openSettings();
  }

  function onInput(e) {
    const el = e.target;
    if (!el.dataset?.scope || !el.closest('#tessera-chrome')) return;
    const { scope, key } = el.dataset;
    let v = el.value;
    if (el.type === 'number') v = el.value === '' ? '' : Number(el.value);
    if (el.dataset.bool) v = v === 'true';
    const pair = el.closest('.color');
    if (pair) pair.querySelectorAll('input').forEach((i) => i !== el && /^#[0-9a-f]{6}$/i.test(v) && (i.value = v));

    const s = S.data.settings;
    let target;
    if (scope === 'w' || scope === 'p') {
      const w = find(S.selected);
      if (!w) return;
      target = scope === 'w' ? w : w.props;
    } else target = { s, pr: s.profile, th: s.theme }[scope];
    if (!target) return;
    if (scope === 'w') snapshot();
    target[key] = v;
    const typing = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['color', 'checkbox', 'radio'].includes(el.type));
    commit(typing);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.widgets)) throw new Error('no widgets');
      snapshot();
      S.data = T.util.normalize(data);
      closePanel();
      commit();
      toast(te('imported'));
    } catch (err) {
      toast(te('importError'));
    }
  }

  function clearMarks() {
    document.querySelectorAll('#app .drop-before, #app .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  }

  function bind(signal) {
    const on = (type, fn, target = document) => target.addEventListener(type, fn, { signal });
    on('click', onClick);
    on('input', onInput);
    on('change', (e) => e.target.id === 'tessera-file' && onFile(e));

    on('dragstart', (e) => {
      const w = e.target.closest?.('#app .w[data-id]');
      if (!w) return;
      S.dragId = w.dataset.id;
      w.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', S.dragId); } catch (_) { /* old Safari */ }
    });
    on('dragover', (e) => {
      if (!S.dragId) return;
      const w = e.target.closest?.('#app .w[data-id]');
      e.preventDefault();
      if (!w || w.dataset.id === S.dragId) return;
      const r = w.getBoundingClientRect();
      // diagonal split works for both wide and tall cards
      const before = (e.clientX - r.left) / r.width + (e.clientY - r.top) / r.height < 1;
      if (S.drop?.id === w.dataset.id && S.drop.before === before) return;
      clearMarks();
      w.classList.add(before ? 'drop-before' : 'drop-after');
      S.drop = { id: w.dataset.id, before };
    });
    on('drop', (e) => {
      if (!S.dragId) return;
      e.preventDefault();
      const { dragId, drop } = S;
      S.dragId = S.drop = null;
      clearMarks();
      if (drop && drop.id !== dragId) {
        snapshot();
        moveTo(dragId, drop.id, drop.before);
      } else paint();
    });
    on('dragend', () => {
      if (!S) return;
      S.dragId = S.drop = null;
      clearMarks();
      document.querySelectorAll('#app .dragging').forEach((n) => n.classList.remove('dragging'));
    });

    on('keydown', (e) => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if (e.key === 'Escape') {
        const m = $('#tessera-chrome .modal');
        if (!m.hidden) m.hidden = true;
        else closePanel();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !inField) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && S.selected && !inField) {
        e.preventDefault();
        action('del', S.selected);
      }
    });
  }
})(window.Tessera);
