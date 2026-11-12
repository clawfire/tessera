/**
 * Tessera — YouTube / YouTube Music playlist player
 *
 * The music widget shows our own playlist view (cover, title, tracks). The YouTube
 * player only loads on click, and we run the queue ourselves: when a track ends we
 * play the next one, and a track YouTube refuses (deleted, private, region-blocked)
 * is greyed out and skipped instead of freezing the widget on "Video unavailable".
 */
window.Tessera = window.Tessera || {};
(function (T) {
  'use strict';
  T.ytCache = T.ytCache || {}; // list id → playlist data (or null when it can't be fetched)

  let apiPromise = null;
  const loadApi = () =>
    (apiPromise ||= new Promise((resolve, reject) => {
      if (window.YT?.Player) return resolve(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
      const s = Object.assign(document.createElement('script'), { src: 'https://www.youtube.com/iframe_api', async: true });
      s.onerror = () => { apiPromise = null; reject(new Error('YouTube player unavailable')); };
      document.head.appendChild(s);
    }));

  const players = new Map(); // .ytpl element → { player, i, ready }

  T.unmountYouTube = () => {
    players.forEach((st) => { try { st.player?.destroy(); } catch (e) { /* gone */ } });
    players.clear();
  };

  /** Dev server: fetch track lists the build hasn't baked in yet (cached across repaints). */
  T.mountYouTube = () => {
    document.querySelectorAll('[data-ytpl]').forEach(async (el) => {
      const list = el.dataset.ytpl;
      if (el.querySelector('.ytpl-tracks') || list in T.ytCache) return;
      T.ytCache[list] = null; // one attempt per page load
      try {
        const r = await fetch('__tessera/youtube-playlist?list=' + encodeURIComponent(list), { cache: 'no-store' });
        if (!r.ok) return;
        const pl = await r.json();
        if (!pl.items?.length) return;
        T.ytCache[list] = pl;
        document.querySelectorAll(`[data-ytpl="${CSS.escape(list)}"]`).forEach((box) => {
          box.innerHTML = T.util.ytPlaylistHtml(pl, list, { square: !!box.dataset.square });
        });
      } catch (e) { /* static hosting: keep the plain YouTube embed */ }
    });
  };

  function highlight(box, i) {
    const rows = [...box.querySelectorAll('.ytpl-tracks li')];
    rows.forEach((r, k) => r.classList.toggle('on', k === i));
    const row = rows[i], list = box.querySelector('.ytpl-tracks');
    if (row && list) list.scrollTop = Math.max(0, row.offsetTop - list.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2);
  }

  async function play(box, i) {
    const rows = [...box.querySelectorAll('.ytpl-tracks li')];
    while (i < rows.length && rows[i].classList.contains('gone')) i++;
    if (i >= rows.length) return; // end of playlist
    const st = players.get(box) || { i, player: null, ready: false };
    players.set(box, st);
    st.i = i;
    box.classList.add('playing');
    highlight(box, i);
    let YT;
    try {
      YT = await loadApi();
    } catch (e) {
      return window.open(`https://music.youtube.com/watch?v=${rows[i].dataset.v}&list=${box.dataset.ytpl}`, '_blank', 'noopener');
    }
    const next = () => play(box, st.i + 1);
    if (!st.player) {
      const target = document.createElement('div');
      box.querySelector('.ytpl-player').replaceChildren(target);
      st.player = new YT.Player(target, {
        host: 'https://www.youtube-nocookie.com',
        width: '100%', height: '100%',
        videoId: rows[i].dataset.v,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: (e) => { st.ready = true; e.target.playVideo?.(); },
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) next(); },
          onError: () => { rows[st.i]?.classList.add('gone'); next(); } // 100/101/150: unavailable → skip
        }
      });
    } else if (st.ready) {
      st.player.loadVideoById(rows[i].dataset.v);
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ytplay]');
    if (!btn || document.body.classList.contains('editing')) return;
    e.preventDefault();
    const box = btn.closest('[data-ytpl]');
    play(box, btn.dataset.ytplay === 'all' ? 0 : +btn.dataset.ytplay);
  });
})(window.Tessera);
