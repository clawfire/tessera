/**
 * Tessera — vector maps (MapLibre GL + OpenFreeMap)
 *
 * - MapLibre is self-hosted in assets/vendor/maplibre and only loaded when a page has a map.
 * - Tiles come from OpenFreeMap (free, no API key, self-hostable). Override everything with
 *   settings.map = { lib, css, tiles, glyphs, styles, attribution } in page.json.
 * - style "theme" is generated from the page colours: soft land, accent-tinted water,
 *   white roads, warm highways — an "Apple Maps"-ish look that follows your theme.
 */
window.Tessera = window.Tessera || {};
(function (T) {
  'use strict';

  const cfg = () =>
    Object.assign(
      {
        lib: 'assets/vendor/maplibre/maplibre-gl.js',
        css: 'assets/vendor/maplibre/maplibre-gl.css',
        tiles: 'https://tiles.openfreemap.org/planet',
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        styles: 'https://tiles.openfreemap.org/styles/',
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      },
      T.current?.settings?.map || {}
    );

  /* ---------- colour helpers ---------- */
  const rgb = (h) => {
    const m = String(h).match(/^#?([0-9a-f]{6})$/i);
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128];
  };
  /** Linear mix of two hex colours, t ∈ [0,1]. */
  const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  const isDark = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b < 110; };

  /** MapLibre style (OpenMapTiles schema) derived from a Tessera theme. */
  T.themeMapStyle = (theme = {}) => {
    const t = Object.assign({}, T.DEFAULT_THEME, theme);
    const c = cfg();
    const dark = isDark(t.bg);
    const green = dark ? '#2f6b4f' : '#a8d8a8';
    const land = dark ? mix(t.bg, t.card, 0.5) : mix(t.bg, '#ffffff', 0.35);
    // water follows the accent only when it's a cool colour (blue/teal/green); otherwise a Plans-like blue
    const [ar, ag, ab] = rgb(t.accent);
    const hue = ab > ar || ag > ar ? t.accent : '#4f9fdc';
    const water = dark ? mix(mix(t.bg, '#000000', 0.35), hue, 0.22) : mix(land, hue, 0.3);
    const park = mix(land, green, dark ? 0.45 : 0.5);
    const wood = mix(land, green, dark ? 0.55 : 0.62);
    const urban = mix(land, t.text, dark ? 0.04 : 0.03);
    const building = mix(land, t.text, dark ? 0.16 : 0.11);
    const road = dark ? mix(land, t.text, 0.2) : '#ffffff';
    const roadCase = mix(land, t.text, dark ? 0.08 : 0.16);
    const major = dark ? mix(land, t.text, 0.34) : '#fbe3a8';
    const majorCase = dark ? mix(land, t.text, 0.12) : '#e8c27a';
    const label = mix(t.text, land, 0.12);
    const labelSoft = mix(t.text, land, 0.42);
    const name = ['coalesce', ['get', 'name:latin'], ['get', 'name']];
    const width = (lo, hi) => ['interpolate', ['exponential', 1.6], ['zoom'], 6, lo, 18, hi];
    const cls = (...list) => ['in', ['get', 'class'], ['literal', list]];
    const src = { source: 'omt' };
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    const text = (font, size) => ({ 'text-field': name, 'text-font': [font], 'text-size': size });
    const halo = (color) => ({ 'text-color': color, 'text-halo-color': land, 'text-halo-width': 1.4, 'text-halo-blur': 0.5 });

    return {
      version: 8,
      glyphs: c.glyphs,
      sources: { omt: { type: 'vector', url: c.tiles, attribution: c.attribution } },
      layers: [
        { id: 'land', type: 'background', paint: { 'background-color': land } },
        { id: 'urban', type: 'fill', ...src, 'source-layer': 'landuse', filter: cls('residential', 'suburb', 'neighbourhood', 'commercial', 'retail'), paint: { 'fill-color': urban } },
        { id: 'wood', type: 'fill', ...src, 'source-layer': 'landcover', filter: cls('wood', 'forest'), paint: { 'fill-color': wood } },
        { id: 'grass', type: 'fill', ...src, 'source-layer': 'landcover', filter: cls('grass', 'meadow', 'scrub', 'farmland'), paint: { 'fill-color': park, 'fill-opacity': 0.55 } },
        { id: 'park', type: 'fill', ...src, 'source-layer': 'park', paint: { 'fill-color': park } },
        { id: 'water', type: 'fill', ...src, 'source-layer': 'water', paint: { 'fill-color': water } },
        { id: 'waterway', type: 'line', ...src, 'source-layer': 'waterway', layout: round, paint: { 'line-color': water, 'line-width': width(0.6, 8) } },
        { id: 'building', type: 'fill', ...src, 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1] } },
        { id: 'rail', type: 'line', ...src, 'source-layer': 'transportation', minzoom: 11, filter: cls('rail', 'transit'), paint: { 'line-color': roadCase, 'line-width': 1, 'line-dasharray': [3, 3] } },
        { id: 'road-case', type: 'line', ...src, 'source-layer': 'transportation', minzoom: 11, filter: cls('minor', 'service', 'tertiary', 'secondary'), layout: round, paint: { 'line-color': roadCase, 'line-width': width(0.8, 15) } },
        { id: 'road', type: 'line', ...src, 'source-layer': 'transportation', minzoom: 11, filter: cls('minor', 'service', 'tertiary', 'secondary'), layout: round, paint: { 'line-color': road, 'line-width': width(0.4, 12) } },
        { id: 'major-case', type: 'line', ...src, 'source-layer': 'transportation', filter: cls('primary', 'trunk', 'motorway'), layout: round, paint: { 'line-color': majorCase, 'line-width': width(1.2, 30) } },
        { id: 'major', type: 'line', ...src, 'source-layer': 'transportation', filter: cls('primary', 'trunk', 'motorway'), layout: round, paint: { 'line-color': major, 'line-width': width(0.7, 26) } },
        { id: 'border', type: 'line', ...src, 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2], paint: { 'line-color': labelSoft, 'line-width': 1.2, 'line-dasharray': [4, 3], 'line-opacity': 0.6 } },
        { id: 'water-name', type: 'symbol', ...src, 'source-layer': 'water_name', layout: text('Noto Sans Italic', 12), paint: { 'text-color': mix(water, t.text, 0.55), 'text-halo-color': water, 'text-halo-width': 1 } },
        { id: 'road-name', type: 'symbol', ...src, 'source-layer': 'transportation_name', minzoom: 14, layout: { ...text('Noto Sans Regular', 11), 'symbol-placement': 'line' }, paint: halo(labelSoft) },
        { id: 'place-minor', type: 'symbol', ...src, 'source-layer': 'place', filter: cls('village', 'suburb', 'neighbourhood', 'hamlet'), layout: text('Noto Sans Regular', 12), paint: halo(labelSoft) },
        { id: 'place-major', type: 'symbol', ...src, 'source-layer': 'place', filter: cls('city', 'town'), layout: { ...text('Noto Sans Bold', ['interpolate', ['linear'], ['zoom'], 6, 12, 14, 19]), 'text-letter-spacing': 0.02 }, paint: halo(label) }
      ]
    };
  };

  /* ---------- lifecycle ---------- */
  let libPromise = null;
  const live = [];

  function loadLib() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (libPromise) return libPromise;
    const c = cfg();
    libPromise = new Promise((resolve, reject) => {
      document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: c.css }));
      const s = Object.assign(document.createElement('script'), { src: c.lib, async: true });
      s.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error('maplibregl missing')));
      s.onerror = reject;
      document.head.appendChild(s);
    });
    libPromise.catch(() => (libPromise = null));
    return libPromise;
  }

  /** If MapLibre can't load (or WebGL is off), fall back to the classic OSM embed. */
  function fallback(el) {
    if (!el.isConnected || !el.dataset.fallback) return;
    const f = document.createElement('iframe');
    Object.assign(f, { src: el.dataset.fallback, title: 'Map', loading: 'lazy' });
    el.replaceWith(f);
  }

  T.unmountMaps = () => {
    while (live.length) {
      try { live.pop().remove(); } catch (e) { /* already gone */ }
    }
  };

  T.mountMaps = (data) => {
    const els = [...document.querySelectorAll('[data-map]')];
    if (!els.length) return;
    loadLib()
      .then((ml) => {
        const c = cfg();
        els.forEach((el) => {
          if (!el.isConnected) return;
          try {
            const o = JSON.parse(el.dataset.map);
            const style = o.style === 'theme' ? T.themeMapStyle(data.settings?.theme) : c.styles + encodeURIComponent(o.style);
            const map = new ml.Map({
              container: el, style, center: [o.lon, o.lat], zoom: o.zoom,
              interactive: false, attributionControl: { compact: true }, fadeDuration: 0
            });
            live.push(map);
            const pin = Object.assign(document.createElement('div'), { className: 'map-pin' });
            new ml.Marker({ element: pin }).setLngLat([o.lon, o.lat]).addTo(map);
            // static card: keep the attribution as a small (i) button
            map.once('load', () => el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
            map.on('error', (e) => console.warn('[tessera] map:', e?.error?.message || e));
          } catch (e) {
            console.warn('[tessera] map fallback:', e.message);
            fallback(el);
          }
        });
      })
      .catch(() => els.forEach(fallback));
  };
})(window.Tessera);
