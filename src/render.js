/**
 * Tessera — page rendering
 * T.pageHtml() is pure (also used by the Node build to prerender).
 * T.render() / T.tick() / T.bindGlobal() touch the DOM.
 */
window.Tessera = window.Tessera || {};
(function (T) {
  'use strict';
  const { esc, safeUrl, SIZES, md } = T.util;

  T.FONTS = {
    system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Quicksand", system-ui, sans-serif',
    serif: 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    inter: '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    dosis: '"Dosis Variable", Dosis, ui-rounded, system-ui, sans-serif'
  };
  /**
   * font     body font (key of T.FONTS)
   * display  font for captions, counters, badges (defaults to `font`)
   * dark     background of "inverted" cards (defaults to `text`)
   * fontCss  optional stylesheet with @font-face rules (relative path or https URL)
   */
  T.DEFAULT_THEME = { bg: '#F6EFE6', card: '#FFFFFF', text: '#2A211C', accent: '#D9822B', radius: 22, font: 'system', display: '', dark: '', fontCss: '' };

  /** WCAG contrast helpers: pick the most readable text colour for a background. */
  const lum = (hex) => {
    const m = String(hex).match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  T.readableOn = (bg, candidates) => {
    if (lum(bg) == null) return candidates[0];
    return candidates.filter((c) => lum(c) != null).sort((p, q) => contrast(bg, q) - contrast(bg, p))[0] || candidates[0];
  };

  /** Theme → inline CSS custom properties. */
  T.themeVars = (theme = {}) => {
    const t = Object.assign({}, T.DEFAULT_THEME, theme);
    const clean = (v) => String(v).replace(/[;{}<>]/g, '');
    return `--bg:${clean(t.bg)};--card:${clean(t.card)};--text:${clean(t.text)};--accent:${clean(t.accent)};--radius:${Math.max(0, Math.min(48, +t.radius || 0))}px;--font:${T.FONTS[t.font] || T.FONTS.system};--display:${T.FONTS[t.display] || T.FONTS[t.font] || T.FONTS.system};--dark:${clean(t.dark || t.text)};--on-dark:${clean(T.readableOn(t.dark || t.text, [t.bg, t.text, '#FFFFFF', '#000000']))};--on-accent:${clean(T.readableOn(t.accent, ['#FFFFFF', t.bg, t.text]))}`;
  };

  /** Load the theme's @font-face stylesheet once (the build may have inlined it already). */
  T.loadFonts = (theme = {}) => {
    const href = T.util.safeUrl(theme.fontCss);
    const cur = document.getElementById('tessera-fonts');
    if (cur && (cur.tagName === 'STYLE' || cur.getAttribute('href') === href)) return;
    if (!href) return void cur?.remove();
    const link = cur || Object.assign(document.createElement('link'), { id: 'tessera-fonts', rel: 'stylesheet' });
    link.href = href;
    if (!cur) document.head.appendChild(link);
  };

  function profileHtml(p = {}) {
    const initials = String(p.name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
    const avatar = p.avatar
      ? `<img class="avatar" src="${esc(safeUrl(p.avatar))}" alt="${esc(p.name)}">`
      : `<div class="avatar avatar-ph" aria-hidden="true">${esc(initials)}</div>`;
    return `<header class="profile">${avatar}
      <h1>${esc(p.name || 'Your name')}</h1>
      ${p.tagline ? `<p class="tagline">${esc(p.tagline)}</p>` : ''}
      ${p.location ? `<p class="location muted">📍 ${esc(p.location)}</p>` : ''}
      ${p.bio ? `<p class="bio">${md(p.bio)}</p>` : ''}
    </header>`;
  }

  function toolsHtml(w, size) {
    return `<div class="w-tools" aria-label="Widget tools">
      <button type="button" data-act="size" title="${esc(T.te('size'))}">${size === 'section' ? '▭' : size.replace('x', '×')}</button>
      <button type="button" data-act="edit" title="Edit">✎</button>
      <button type="button" data-act="dup" title="${esc(T.te('duplicate'))}">⧉</button>
      <button type="button" data-act="del" title="${esc(T.te('delete'))}">✕</button>
    </div>`;
  }

  function widgetHtml(w, opts) {
    const def = T.widgets[w.type];
    if (!def) {
      return opts.editing
        ? `<article class="w c2 r2" data-id="${esc(w.id)}" draggable="true"><div class="w-body ph"><span>❓</span><small>Unknown widget “${esc(w.type)}”</small></div>${toolsHtml(w, '2x1')}</article>`
        : '';
    }
    const size = def.sizes.includes(w.size) ? w.size : def.sizes[0];
    const [c, r] = SIZES[size];
    let body;
    try {
      body = def.render(w.props || {}, { size, c, r, id: w.id });
    } catch (e) {
      body = `<div class="w-body ph"><span>⚠︎</span><small>${esc(e.message)}</small></div>`;
    }
    const tone = w.tone || def.defaultTone || 'default';
    const cls = ['w', 'w-' + w.type, 'c' + c, 'r' + r, tone !== 'default' ? 'tone-' + tone : '', opts.selected === w.id ? 'selected' : '']
      .filter(Boolean)
      .join(' ');
    return `<article class="${cls}" data-id="${esc(w.id)}"${opts.editing ? ' draggable="true"' : ''}>${body}${opts.editing ? toolsHtml(w, size) : ''}</article>`;
  }

  /**
   * Split widgets into one grid per section, so `grid-auto-flow: dense`
   * fills holes inside a section but never pulls cards across a section title.
   */
  const groups = (widgets) =>
    widgets.reduce((acc, w) => {
      if (w.type === 'section' || !acc.length) acc.push([]);
      acc[acc.length - 1].push(w);
      return acc;
    }, []);

  /** Full page markup (inside #app). */
  T.pageHtml = (data, opts = {}) => {
    const s = data.settings || {};
    const footer = s.footer ?? 'Made with [Tessera](https://github.com/clawfire/tessera) — open source, self-hosted.';
    const fab = s.showEditButton && !opts.editing ? `<a class="fab-edit" href="#edit" title="Edit" aria-label="Edit page">✎</a>` : '';
    return `<main class="page" style="${T.themeVars(s.theme)}">
      ${profileHtml(s.profile)}
      <div class="grid-wrap" id="grid">${groups(data.widgets || []).map((g) => `<section class="grid">${g.map((w) => widgetHtml(w, opts)).join('')}</section>`).join('')}</div>
      ${footer ? `<footer class="foot muted">${md(footer)}</footer>` : ''}
    </main>${fab}`;
  };

  /** Render into #app and sync document-level bits (lang, title, background). */
  T.render = (data, opts = {}) => {
    const s = data.settings || {};
    T.pageLang = s.lang || 'en';
    document.documentElement.lang = T.pageLang;
    if (s.title) document.title = s.title;
    document.documentElement.setAttribute('style', T.themeVars(s.theme));
    T.loadFonts(s.theme);
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', Object.assign({}, T.DEFAULT_THEME, s.theme).bg);
    T.unmountMaps?.();
    document.getElementById('app').innerHTML = T.pageHtml(data, opts);
    T.mountMaps?.(data);
    T.tick();
  };

  /** Live bits: countdowns. */
  T.tick = () => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-countdown]').forEach((el) => {
      const unit = el.nextElementSibling;
      const t = new Date(el.dataset.countdown);
      if (isNaN(t)) return void (el.textContent = '—');
      const ms = t - Date.now();
      if (ms <= 0) {
        el.textContent = '🎉';
        unit.textContent = T.tp('done');
        return;
      }
      const d = Math.floor(ms / 864e5);
      if (d >= 1) {
        el.textContent = d;
        unit.textContent = T.tp(d > 1 ? 'days' : 'day');
      } else {
        const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
        el.textContent = `${h}h${String(m).padStart(2, '0')}`;
        unit.textContent = T.tp('left');
      }
    });
  };
  if (typeof setInterval === 'function') setInterval(() => T.tick(), 30000);

  /* ---------- .ics generation (client-side, no service) ---------- */
  const icsText = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const icsDate = (date, time) => date.replace(/-/g, '') + (time ? 'T' + time.replace(':', '') + '00' : '');
  T.ics = (w) => {
    const p = w.props;
    const allDay = !p.start;
    const start = icsDate(p.date, p.start);
    let end = p.end ? icsDate(p.date, p.end) : '';
    if (!end && !allDay) {
      const d = new Date(p.date + 'T' + p.start);
      d.setHours(d.getHours() + 2);
      const pad = (n) => String(n).padStart(2, '0');
      end = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tessera//EN', 'BEGIN:VEVENT',
      `UID:${w.id}@tessera`, `DTSTAMP:${stamp}`,
      allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
      end ? `DTEND:${end}` : '',
      `SUMMARY:${icsText(p.title)}`,
      `LOCATION:${icsText([p.venue, p.city].filter(Boolean).join(', '))}`,
      p.url ? `URL:${p.url}` : '',
      'END:VEVENT', 'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');
  };

  T.download = (name, text, type) => {
    const blob = new Blob([text], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 500);
  };

  /** Interactions that work for visitors too (no editor needed). */
  T.bindGlobal = () => {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ics]');
      if (!b || document.body.classList.contains('editing')) return;
      const w = (T.current.widgets || []).find((x) => x.id === b.dataset.ics);
      if (w) T.download((w.props.title || 'event').replace(/[^\w-]+/g, '-') + '.ics', T.ics(w), 'text/calendar');
    });
    document.addEventListener('submit', (e) => {
      const f = e.target;
      if (document.body.classList.contains('editing') || f.dataset.disabled) return e.preventDefault();
      if (!f.classList.contains('contact-form')) return;
      e.preventDefault();
      const subject = f.topic ? f.topic.value : document.title;
      location.href = `mailto:${f.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(f.message.value)}`;
    });
  };
})(window.Tessera);
