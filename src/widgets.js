/**
 * Tessera — widget registry
 *
 * Each widget is a plain object:
 *   {
 *     type, label: 'English|Français', icon,
 *     sizes: ['2x1', ...]      // first one is the default
 *     defaults: { ...props },  // props of a freshly added widget
 *     fields: [{ key, label, type, help, placeholder, options }],  // editor form
 *     defaultTone?: 'ghost',
 *     render(props, ctx) -> HTML string  // must return a `.w-body` element
 *   }
 *
 * render() must be pure (no DOM access): it also runs in Node at build time
 * to prerender the page for SEO and no-JS visitors.
 */
window.Tessera = window.Tessera || {};
(function (T) {
  'use strict';

  /* ---------- utils ---------- */
  const U = (T.util = {});

  const esc = (U.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  /** Allow relative URLs, http(s), mailto, tel and data:image. Everything else (javascript:…) → ''. */
  const safeUrl = (U.safeUrl = (u) => {
    u = String(u ?? '').trim();
    if (!u) return '';
    const m = u.match(/^([a-z][\w+.-]*):/i);
    if (!m) return u;
    // blob: URLs are same-origin only (used to preview images that aren't published yet)
    return /^(https?|mailto|tel|blob)$/i.test(m[1]) || /^data:image\//i.test(u) ? u : '';
  });

  /** Markdown-lite: **bold**, *italic*, [link](url), line breaks. Escapes first. */
  U.md = (s) =>
    esc(s)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => {
        const h = safeUrl(href.replace(/&amp;/g, '&'));
        return h ? `<a href="${esc(h)}" target="_blank" rel="noopener">${txt}</a>` : txt;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\n/g, '<br>');

  /** Pending (not yet published) uploads are shown from memory. */
  U.asset = (u) => (T.assetOverrides && T.assetOverrides[u]) || u;
  const img = (u) => safeUrl(U.asset(u));

  /** "a | b | c" lines → [['a','b','c'], ...] */
  U.lines = (s) =>
    String(s || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split('|').map((x) => x.trim()));

  /** Size name → [columns, half-rows]. A 1x1 tile is 2 half-rows tall. */
  U.SIZES = { '1x1': [1, 2], '2x1': [2, 2], '1x2': [1, 4], '2x2': [2, 4], '4x1': [4, 2], '4x2': [4, 4], section: [4, 1] };

  U.uid = () => 'w' + Math.random().toString(36).slice(2, 9);

  /** Fill in missing ids / structure so older or hand-written page.json files still work. */
  U.normalize = (data) => {
    data.settings = data.settings || {};
    data.settings.profile = data.settings.profile || {};
    data.settings.theme = data.settings.theme || {};
    data.widgets = Array.isArray(data.widgets) ? data.widgets : [];
    const seen = new Set();
    data.widgets.forEach((w) => {
      if (!w.id || seen.has(w.id)) w.id = U.uid();
      seen.add(w.id);
      w.props = w.props || {};
    });
    return data;
  };

  // [domain, display name, brand color, glyph]
  const PLATFORMS = [
    ['instagram.com', 'Instagram', '#E1306C', 'IG'], ['github.com', 'GitHub', '#24292F', 'GH'],
    ['gitlab.com', 'GitLab', '#FC6D26', 'GL'], ['codeberg.org', 'Codeberg', '#2185D0', 'CB'],
    ['linkedin.com', 'LinkedIn', '#0A66C2', 'in'], ['music.youtube.com', 'YouTube Music', '#FF0000', '♫'], ['youtube.com', 'YouTube', '#FF0000', '▶'],
    ['youtu.be', 'YouTube', '#FF0000', '▶'], ['x.com', 'X', '#000000', 'X'], ['twitter.com', 'X', '#000000', 'X'],
    ['bsky.app', 'Bluesky', '#0085FF', '🦋'], ['threads.net', 'Threads', '#000000', '@'],
    ['tiktok.com', 'TikTok', '#111111', '♪'], ['twitch.tv', 'Twitch', '#9146FF', 'TV'],
    ['spotify.com', 'Spotify', '#1DB954', '♫'], ['discord.gg', 'Discord', '#5865F2', 'DC'],
    ['discord.com', 'Discord', '#5865F2', 'DC'], ['facebook.com', 'Facebook', '#1877F2', 'f'],
    ['behance.net', 'Behance', '#1769FF', 'Bē'], ['dribbble.com', 'Dribbble', '#EA4C89', '◉'],
    ['medium.com', 'Medium', '#000000', 'M'], ['substack.com', 'Substack', '#FF6719', 'S'],
    ['patreon.com', 'Patreon', '#FF424D', 'P'], ['ko-fi.com', 'Ko-fi', '#FF5E5B', '☕'],
    ['buymeacoffee.com', 'Buy Me a Coffee', '#FFDD00', '☕'], ['t.me', 'Telegram', '#26A5E4', '✈'],
    ['wa.me', 'WhatsApp', '#25D366', 'WA'], ['printables.com', 'Printables', '#FA6831', 'Pr'],
    ['makerworld.com', 'MakerWorld', '#00AE42', 'MW'], ['thingiverse.com', 'Thingiverse', '#248BFB', 'T'],
    ['vinted', 'Vinted', '#09B1BA', 'V'], ['pixelfed', 'Pixelfed', '#6366F1', 'PF'],
    ['mastodon', 'Mastodon', '#6364FF', 'M'], ['mstdn', 'Mastodon', '#6364FF', 'M'],
    ['peertube', 'PeerTube', '#F1680D', '▶'], ['soundcloud.com', 'SoundCloud', '#FF5500', '☁'], 
    ['bandcamp.com', 'Bandcamp', '#1DA0C3', 'bc'], ['letterboxd.com', 'Letterboxd', '#202830', '●●'],
    ['strava.com', 'Strava', '#FC4C02', 'S'], ['reddit.com', 'Reddit', '#FF4500', 'r/'],
    ['prusaprinters.org', 'Printables', '#FA6831', 'Pr'], ['chromewebstore.google.com', 'Chrome Web Store', '#1A73E8', '⬇'],
    ['chrome.google.com', 'Chrome Web Store', '#1A73E8', '⬇'], ['addons.mozilla.org', 'Firefox Add-ons', '#FF7139', '⬇'],
    ['amazon.', 'Amazon', '#FF9900', 'a'], ['ko-fi', 'Ko-fi', '#FF5E5B', '☕'], ['liberapay.com', 'Liberapay', '#F6C915', 'Lp']
  ];

  /** Guess the platform from a URL to pick a name, colour and glyph. */
  U.platform = (url) => {
    const u = String(url || '');
    if (/^mailto:/i.test(u)) return { name: 'Email', color: '#6B6B6B', glyph: '@' };
    if (/^tel:/i.test(u)) return { name: 'Phone', color: '#6B6B6B', glyph: '☏' };
    let host = '';
    try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { /* relative or invalid */ }
    const p = host && PLATFORMS.find(([d]) => host === d || host.endsWith('.' + d) || host.includes(d));
    return p
      ? { name: p[1], color: p[2], glyph: p[3] }
      : { name: host || 'Link', color: 'var(--accent)', glyph: (host[0] || '↗').toUpperCase() };
  };

  /** YouTube / Vimeo / PeerTube URL → privacy-friendly embed URL. */
  U.videoEmbed = (url) => {
    const u = String(url || '');
    let m;
    // playlists (youtube.com/playlist?list=…, or a watch URL that only carries a list)
    if (/(?:youtube\.com|youtu\.be)\//.test(u) && (m = u.match(/[?&]list=([\w-]+)/)) && !/[?&]v=/.test(u))
      return 'https://www.youtube-nocookie.com/embed/videoseries?list=' + m[1];
    if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)))
      return 'https://www.youtube-nocookie.com/embed/' + m[1];
    if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return 'https://player.vimeo.com/video/' + m[1] + '?dnt=1';
    if ((m = u.match(/^(https:\/\/[^/]+)\/(?:w|videos\/watch)\/([\w-]{8,})/))) return m[1] + '/videos/embed/' + m[2];
    return null;
  };

  /** Spotify / Apple Music / SoundCloud / Deezer / Bandcamp URL → embed URL. */
  U.musicEmbed = (url) => {
    const u = String(url || '');
    let m;
    // YouTube Music: playlists/albums (list=…) and single tracks (v=…) use the YouTube player
    if (/music\.youtube\.com\//.test(u)) {
      if ((m = u.match(/[?&]list=([\w-]+)/)) && !/[?&]v=/.test(u)) return 'https://www.youtube-nocookie.com/embed/videoseries?list=' + m[1];
      if ((m = u.match(/[?&]v=([\w-]{11})/))) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    }
    if ((m = u.match(/open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/)))
      return 'https://open.spotify.com/embed/' + m[1] + '/' + m[2];
    if (/^https:\/\/music\.apple\.com\//.test(u)) return u.replace('music.apple.com', 'embed.music.apple.com');
    if (/^https:\/\/(www\.)?soundcloud\.com\//.test(u))
      return 'https://w.soundcloud.com/player/?visual=true&url=' + encodeURIComponent(u);
    if ((m = u.match(/deezer\.com\/(?:\w{2}\/)?(track|album|playlist)\/(\d+)/)))
      return 'https://widget.deezer.com/widget/auto/' + m[1] + '/' + m[2];
    if (/bandcamp\.com\/EmbeddedPlayer\//.test(u)) return u;
    return null;
  };

  /** True for pictographic characters (emoji), which carry their own colours. */
  U.isEmoji = (s) => /\p{Extended_Pictographic}/u.test(String(s || ''));

  /** Playlist id from a YouTube / YouTube Music URL (null for single-video URLs). */
  U.ytList = (url) => {
    const u = String(url || '');
    if (!/(?:youtube\.com|youtu\.be)\//.test(u) || /[?&]v=/.test(u)) return null;
    return u.match(/[?&]list=([\w-]+)/)?.[1] || null;
  };

  /** Our own playlist view: cover + play button, title, scrollable track list. */
  U.ytPlaylistHtml = (pl, list, { square = false } = {}) => {
    const cover = pl.items[0] ? `https://i.ytimg.com/vi/${encodeURIComponent(pl.items[0].v)}/hqdefault.jpg` : '';
    // YouTube Music thumbnails hold a square album cover in the middle of a 4:3 frame: crop to it, blurred copy behind
    const art = !cover ? '' : square
      ? `<div class="ytpl-bg" style="background-image:url(${esc(cover)})"></div><div class="ytpl-art"><img src="${esc(cover)}" alt="" loading="lazy" onerror="this.closest('.ytpl-stage').classList.add('no-art')"></div>`
      : `<img class="ytpl-cover" src="${esc(cover)}" alt="" loading="lazy" onerror="this.remove()">`;
    const tracks = pl.items
      .map((it, i) => `<li data-v="${esc(it.v)}"><button type="button" data-ytplay="${i}"><span class="n"><i>${i + 1}</i></span><span class="tt"><span>${esc(it.t)}</span>${it.a ? `<small class="muted">${esc(it.a)}</small>` : ''}</span></button></li>`)
      .join('');
    return `<div class="ytpl-stage">${art}<div class="ytpl-player"></div>` +
      `<button type="button" class="ytpl-play" data-ytplay="all" aria-label="${esc(T.tp('play'))}">▶</button></div>` +
      `<div class="ytpl-side"><div class="ytpl-head"><strong>${esc(pl.title)}</strong>` +
      `<a class="muted" href="https://music.youtube.com/playlist?list=${encodeURIComponent(list)}" target="_blank" rel="noopener">${esc([pl.author, `${pl.items.length} ${T.tp('tracks')}`].filter(Boolean).join(' · '))} ↗</a></div>` +
      `<ol class="ytpl-tracks">${tracks}</ol></div>`;
  };

  /* ---------- render helpers ---------- */
  const a = (href, inner, cls = '') => {
    const h = safeUrl(href);
    return h
      ? `<a class="${cls}" href="${esc(h)}" target="_blank" rel="noopener me">${inner}</a>`
      : `<div class="${cls}">${inner}</div>`;
  };
  const ph = (icon, txt = '') => `<div class="w-body ph"><span>${icon}</span>${txt ? `<small class="muted">${esc(txt)}</small>` : ''}</div>`;
  const h3 = (t) => (t ? `<h3>${esc(t)}</h3>` : '');
  const iframe = (src, title, allow = '') =>
    `<div class="w-body embed"><iframe src="${esc(src)}" title="${esc(title || 'Embed')}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" ${allow ? `allow="${allow}"` : 'allowfullscreen'}></iframe></div>`;

  /* ---------- registry ---------- */
  const W = (T.widgets = {});
  const def = (type, d) => (W[type] = Object.assign({ type, sizes: ['1x1'], defaults: {}, fields: [] }, d));

  def('link', {
    label: 'Link|Lien', icon: '🔗', sizes: ['1x1', '2x1', '2x2', '4x1'],
    defaults: { url: 'https://', title: '', subtitle: '', icon: '', image: '' },
    fields: [
      { key: 'url', label: 'URL', type: 'url', help: 'Platform is detected automatically (Instagram, GitHub, Mastodon…)|La plateforme est détectée automatiquement (Instagram, GitHub, Mastodon…)' },
      { key: 'title', label: 'Title|Titre', placeholder: 'Auto' },
      { key: 'subtitle', label: 'Subtitle|Sous-titre', placeholder: '@handle · 12K' },
      { key: 'icon', label: 'Icon (emoji or short text)|Icône (emoji ou texte court)', placeholder: 'Auto' },
      { key: 'image', label: 'Preview image (tall sizes)|Image d’aperçu (grandes tailles)', type: 'url', image: true }
    ],
    render(p, ctx) {
      const pf = U.platform(p.url);
      const preview = p.image && ctx.r >= 4 ? `<img class="link-img" src="${esc(img(p.image))}" alt="" loading="lazy">` : '';
      return a(
        p.url,
        `<span class="badge${U.isEmoji(p.icon || pf.glyph) ? ' emoji' : ''}" style="--b:${esc(pf.color)}">${esc(p.icon || pf.glyph)}</span>` +
          `<span class="link-txt"><strong>${esc(p.title || pf.name)}</strong>${p.subtitle ? `<span class="muted">${esc(p.subtitle).replace(/(\S)@/g, '$1<wbr>@').replace(/(\S)\//g, '$1<wbr>/')}</span>` : ''}</span>` +
          preview + `<span class="arrow" aria-hidden="true">↗</span>`,
        'w-body link'
      );
    }
  });

  def('text', {
    label: 'Text|Texte', icon: '✍️', sizes: ['2x1', '1x1', '1x2', '2x2', '4x1'],
    defaults: { title: 'Hello', body: 'Write something **nice**.' },
    fields: [
      { key: 'title', label: 'Title|Titre' },
      { key: 'body', label: 'Text|Texte', type: 'textarea', rows: 6, help: '**bold**, *italic*, [link](https://…)|**gras**, *italique*, [lien](https://…)' }
    ],
    render: (p) => `<div class="w-body text">${h3(p.title)}<div class="prose">${U.md(p.body)}</div></div>`
  });

  def('image', {
    label: 'Image', icon: '🖼️', sizes: ['2x2', '1x1', '2x1', '1x2', '4x1', '4x2'],
    defaults: { src: '', alt: '', caption: '', url: '' },
    fields: [
      { key: 'src', label: 'Image', type: 'url', image: true, help: 'Drop a photo here or on the card, or paste a URL|Dépose une photo ici ou sur la carte, ou colle une URL' },
      { key: 'alt', label: 'Alt text|Texte alternatif' },
      { key: 'caption', label: 'Caption|Légende' },
      { key: 'url', label: 'Link (optional)|Lien (optionnel)', type: 'url' }
    ],
    render(p) {
      if (!p.src) return ph('🖼️');
      const inner = `<img src="${esc(img(p.src))}" alt="${esc(p.alt)}" loading="lazy">${p.caption ? `<span class="cap">${esc(p.caption)}</span>` : ''}`;
      return p.url ? a(p.url, inner, 'w-body media') : `<div class="w-body media">${inner}</div>`;
    }
  });

  def('gallery', {
    label: 'Gallery|Galerie', icon: '🎞️', sizes: ['2x2', '2x1', '4x2', '4x1', '1x2'],
    defaults: { items: '' },
    fields: [{ key: 'items', label: 'Images (one per line)|Images (une par ligne)', type: 'textarea', rows: 6, images: true, help: 'image-url | caption — or drop photos on the card||url-image | légende — ou dépose des photos sur la carte' }],
    render(p) {
      const items = U.lines(p.items);
      if (!items.length) return ph('🎞️');
      const slides = items
        .map(([src, cap], i) => `<figure><img src="${esc(img(src))}" alt="${esc(cap || '')}" loading="lazy">${cap ? `<figcaption class="cap">${esc(cap)}</figcaption>` : ''}<span class="count">${i + 1}/${items.length}</span></figure>`)
        .join('');
      return `<div class="w-body gallery"><div class="track" tabindex="0">${slides}</div></div>`;
    }
  });

  def('video', {
    label: 'Video|Vidéo', icon: '🎬', sizes: ['2x1', '2x2', '4x1', '4x2'],
    defaults: { url: '', title: '' },
    fields: [
      { key: 'url', label: 'URL', type: 'url', help: 'YouTube, Vimeo, PeerTube or a .mp4 file|YouTube, Vimeo, PeerTube ou un fichier .mp4' },
      { key: 'title', label: 'Title (accessibility)|Titre (accessibilité)' }
    ],
    render(p) {
      const e = U.videoEmbed(p.url);
      if (e) return iframe(e, p.title || 'Video', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
      const s = safeUrl(p.url);
      return s && s !== 'https://'
        ? `<div class="w-body media"><video src="${esc(s)}#t=0.001" controls playsinline preload="metadata"></video></div>`
        : ph('🎬');
    }
  });

  def('music', {
    label: 'Music|Musique', icon: '🎧', sizes: ['2x1', '2x2', '4x1', '1x2'],
    defaults: { url: '', title: '' },
    fields: [
      { key: 'url', label: 'URL', type: 'url', help: 'Spotify, Apple Music, YouTube Music, SoundCloud, Deezer, Bandcamp embed — or an .mp3|Spotify, Apple Music, YouTube Music, SoundCloud, Deezer, embed Bandcamp — ou un .mp3' },
      { key: 'title', label: 'Title|Titre' }
    ],
    render(p) {
      // YouTube / YouTube Music playlists: our own playlist view (track list baked in by the build or fetched by the dev server)
      const list = U.ytList(p.url);
      if (list) {
        const pl = p._playlist || T.ytCache?.[list];
        const fallback = `<iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}" title="${esc(p.title || 'Playlist')}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>`;
        const square = /music\.youtube\.com/.test(p.url);
        return `<div class="w-body ytpl" data-ytpl="${esc(list)}"${square ? ' data-square="1"' : ''}>${pl?.items?.length ? U.ytPlaylistHtml(pl, list, { square }) : fallback}</div>`;
      }
      const e = U.musicEmbed(p.url);
      if (e) return iframe(e, p.title || 'Music', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
      const s = safeUrl(p.url);
      return s && /\.(mp3|ogg|m4a|wav|flac|opus)(\?|$)/i.test(s)
        ? `<div class="w-body audio"><span class="badge" style="--b:var(--accent)">♫</span>${h3(p.title)}<audio src="${esc(s)}" controls preload="none"></audio></div>`
        : ph('🎧');
    }
  });

  def('map', {
    label: 'Map|Carte', icon: '🗺️', sizes: ['2x1', '1x1', '2x2', '4x1'],
    defaults: { label: 'Luxembourg', lat: 49.6116, lon: 6.1319, zoom: 12, style: 'theme' },
    fields: [
      { key: 'label', label: 'Label|Libellé' },
      {
        key: 'style', label: 'Map style|Style de carte', type: 'select',
        options: [
          ['theme', 'Page colours (Apple-like)|Couleurs de la page (façon Plans)'],
          ['liberty', 'OpenFreeMap Liberty'], ['positron', 'OpenFreeMap Positron'], ['bright', 'OpenFreeMap Bright'],
          ['osm', 'OpenStreetMap classic (iframe)|OpenStreetMap classique (iframe)']
        ]
      },
      { key: 'lat', label: 'Latitude', type: 'number', step: 'any' },
      { key: 'lon', label: 'Longitude', type: 'number', step: 'any' },
      { key: 'zoom', label: 'Zoom (2–18)', type: 'number', min: 2, max: 18 }
    ],
    render(p) {
      const lat = +p.lat || 0, lon = +p.lon || 0, z = Math.min(18, Math.max(2, +p.zoom || 12));
      const dx = 280 / 2 ** z, dy = dx * 0.6;
      const bbox = [lon - dx, lat - dy, lon + dx, lat + dy].map((n) => n.toFixed(5)).join(',');
      const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
      const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${z}/${lat}/${lon}`;
      const cap = p.label ? `<a class="cap" href="${esc(link)}" target="_blank" rel="noopener">📍 ${esc(p.label)}</a>` : '';
      const style = p.style || 'theme';
      if (style === 'osm') return `<div class="w-body map"><iframe src="${esc(src)}" title="${esc(p.label || 'Map')}" loading="lazy"></iframe>${cap}</div>`;
      // vector map, mounted client-side by maps.js (falls back to the iframe if MapLibre can't run)
      const opts = JSON.stringify({ lat, lon, zoom: z, style });
      return `<div class="w-body map"><div class="mapgl" role="img" aria-label="${esc(p.label || 'Map')}" data-map="${esc(opts)}" data-fallback="${esc(src)}"></div>${cap}</div>`;
    }
  });

  def('event', {
    label: 'Event|Événement', icon: '🎟️', sizes: ['2x1', '2x2', '1x1'],
    defaults: { title: 'Live show', date: '2026-12-12', start: '20:00', end: '23:00', venue: '', city: '', url: '' },
    fields: [
      { key: 'title', label: 'Title|Titre' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'start', label: 'Start|Début', type: 'time' },
      { key: 'end', label: 'End|Fin', type: 'time' },
      { key: 'venue', label: 'Venue|Lieu' },
      { key: 'city', label: 'City|Ville' },
      { key: 'url', label: 'Tickets URL|URL billetterie', type: 'url' }
    ],
    render(p, ctx) {
      const d = p.date ? new Date(p.date + 'T' + (p.start || '00:00')) : null;
      const ok = d && !isNaN(d);
      const loc = T.pageLang;
      const time = [p.start, p.end].filter(Boolean).join('–');
      const where = [p.venue, p.city].filter(Boolean).join(', ');
      return `<div class="w-body event">
        <div class="ev-date"><span class="ev-mon">${ok ? esc(d.toLocaleDateString(loc, { month: 'short' })) : ''}</span><span class="ev-day">${ok ? d.getDate() : '?'}</span></div>
        <div class="ev-info"><strong>${esc(p.title)}</strong><span class="muted">${ok ? esc(d.toLocaleDateString(loc, { weekday: 'long' })) : ''}${time ? ' · ' + esc(time) : ''}</span>${where ? `<span class="muted">📍 ${esc(where)}</span>` : ''}</div>
        <div class="ev-actions">${p.url ? a(p.url, esc(T.tp('tickets')), 'btn') : ''}${ok ? `<button class="btn ghost" type="button" data-ics="${esc(ctx.id)}">${esc(T.tp('addToCal'))}</button>` : ''}</div>
      </div>`;
    }
  });

  def('stat', {
    label: 'Stat|Chiffre clé', icon: '📈', sizes: ['1x1', '2x1'],
    defaults: { value: '42', label: 'things shipped', caption: '' },
    fields: [
      { key: 'value', label: 'Value|Valeur' },
      { key: 'label', label: 'Label|Libellé' },
      { key: 'caption', label: 'Caption|Note' }
    ],
    render: (p) => `<div class="w-body stat"><span class="stat-v">${esc(p.value)}</span><span class="stat-l">${esc(p.label)}</span>${p.caption ? `<small class="muted">${esc(p.caption)}</small>` : ''}</div>`
  });

  def('goals', {
    label: 'Goals|Objectifs', icon: '🎯', sizes: ['2x1', '2x2', '4x1', '1x2'],
    defaults: { title: 'Goals', items: 'First goal | 40\nSecond goal | 75' },
    fields: [
      { key: 'title', label: 'Title|Titre' },
      { key: 'items', label: 'Goals (one per line)|Objectifs (un par ligne)', type: 'textarea', rows: 5, help: 'Label | percent||Libellé | pourcentage' }
    ],
    render: (p) =>
      `<div class="w-body goals">${h3(p.title)}<ul>${U.lines(p.items)
        .map(([l, v]) => {
          const n = Math.max(0, Math.min(100, parseFloat(v) || 0));
          return `<li><div class="g-row"><span>${esc(l)}</span><span class="muted">${n}%</span></div><div class="bar"><i style="width:${n}%"></i></div></li>`;
        })
        .join('')}</ul></div>`
  });

  def('countdown', {
    label: 'Countdown|Compte à rebours', icon: '⏳', sizes: ['1x1', '2x1'],
    defaults: { label: 'Until launch', target: '2026-12-31', time: '' },
    fields: [
      { key: 'label', label: 'Label|Libellé' },
      { key: 'target', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time (optional)|Heure (optionnel)', type: 'time' }
    ],
    render(p) {
      const iso = esc((p.target || '') + 'T' + (p.time || '00:00'));
      return `<div class="w-body countdown"><span class="cd-v" data-countdown="${iso}">—</span><span class="cd-u muted"></span><span class="cd-l">${esc(p.label)}</span></div>`;
    }
  });

  def('list', {
    label: 'List / timeline|Liste / parcours', icon: '📋', sizes: ['2x2', '2x1', '1x2', '4x1', '4x2'],
    defaults: { title: 'Experience', items: 'Role | Company | 2024 —\nPrevious role | Other company | 2020 – 2024' },
    fields: [
      { key: 'title', label: 'Title|Titre' },
      { key: 'items', label: 'Items (one per line)|Éléments (un par ligne)', type: 'textarea', rows: 6, help: 'Title | subtitle | dates | url (all optional but the title)||Titre | sous-titre | dates | url (tout optionnel sauf le titre)' }
    ],
    render: (p) =>
      `<div class="w-body list">${h3(p.title)}<ul>${U.lines(p.items)
        .map(([t, s, d, u]) => `<li><div>${u ? a(u, `<strong>${esc(t)}</strong>`) : `<strong>${esc(t)}</strong>`}${s ? `<span class="muted">${esc(s)}</span>` : ''}</div>${d ? `<small class="muted">${esc(d)}</small>` : ''}</li>`)
        .join('')}</ul></div>`
  });

  def('newsletter', {
    label: 'Newsletter', icon: '💌', sizes: ['2x1', '2x2', '4x1'],
    defaults: { title: 'Newsletter', text: 'A monthly letter. No spam.', action: '', field: 'email', button: '' },
    fields: [
      { key: 'title', label: 'Title|Titre' },
      { key: 'text', label: 'Text|Texte', type: 'textarea', rows: 3 },
      { key: 'action', label: 'Form endpoint|URL du formulaire', type: 'url', help: 'POST target from Buttondown, Listmonk, Mailchimp, Brevo…|Cible POST de Buttondown, Listmonk, Mailchimp, Brevo…' },
      { key: 'field', label: 'Email field name|Nom du champ email', placeholder: 'email' },
      { key: 'button', label: 'Button label|Libellé du bouton' }
    ],
    render(p) {
      const act = safeUrl(p.action);
      return `<div class="w-body newsletter">${h3(p.title)}${p.text ? `<p class="muted">${U.md(p.text)}</p>` : ''}<form class="inline-form" ${act ? `action="${esc(act)}" method="post" target="_blank"` : 'data-disabled="1"'}><input type="email" name="${esc(p.field || 'email')}" required placeholder="${esc(T.tp('emailPh'))}" aria-label="Email"><button class="btn" type="submit">${esc(p.button || T.tp('subscribe'))}</button></form></div>`;
    }
  });

  def('contact', {
    label: 'Contact form|Formulaire de contact', icon: '✉️', sizes: ['2x2', '1x2'],
    defaults: { title: 'Get in touch', email: 'hello@example.com', topics: 'Project, Collab, Press, Just saying hi', note: '' },
    fields: [
      { key: 'title', label: 'Title|Titre' },
      { key: 'email', label: 'Your email|Ton email', type: 'email', help: 'Opens the visitor’s mail app (no server needed)|Ouvre l’app mail du visiteur (aucun serveur requis)' },
      { key: 'topics', label: 'Topics (comma-separated)|Sujets (séparés par des virgules)' },
      { key: 'note', label: 'Note' }
    ],
    render(p) {
      const topics = String(p.topics || '').split(',').map((s) => s.trim()).filter(Boolean);
      return `<div class="w-body contact">${h3(p.title)}<form class="contact-form" data-email="${esc(p.email)}">${
        topics.length ? `<select name="topic" aria-label="${esc(T.tp('topic'))}">${topics.map((t) => `<option>${esc(t)}</option>`).join('')}</select>` : ''
      }<textarea name="message" required placeholder="${esc(T.tp('messagePh'))}"></textarea><button class="btn" type="submit">${esc(T.tp('send'))}</button></form>${p.note ? `<small class="muted">${esc(p.note)}</small>` : ''}</div>`;
    }
  });

  def('embed', {
    label: 'Embed (iframe)|Intégration (iframe)', icon: '🧩', sizes: ['2x2', '2x1', '4x1', '4x2', '1x2'],
    defaults: { url: '', title: 'Embed' },
    fields: [
      { key: 'url', label: 'URL (https)', type: 'url', help: 'Cal.com, Calendly, Google Calendar, Framaforms, Figma…' },
      { key: 'title', label: 'Title (accessibility)|Titre (accessibilité)' }
    ],
    render: (p) => {
      const s = safeUrl(p.url);
      return /^https:\/\/.+/.test(s) ? iframe(s, p.title) : ph('🧩', 'https:// URL');
    }
  });

  def('section', {
    label: 'Section title|Titre de section', icon: '🔖', sizes: ['section'], defaultTone: 'ghost',
    defaults: { title: 'Section' },
    fields: [{ key: 'title', label: 'Title|Titre' }],
    render: (p) => `<div class="w-body section"><h2>${esc(p.title)}</h2></div>`
  });
})(window.Tessera);
