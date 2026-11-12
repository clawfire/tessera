/**
 * YouTube / YouTube Music playlists, resolved server-side (dev server + build).
 * Browsers can't read these feeds (no CORS), so the page gets the track list baked in.
 *
 *  - Default: the public RSS feed — no API key, up to ~15 tracks, unavailable videos are already left out.
 *  - Optional: set YT_API_KEY (YouTube Data API v3) for full playlists (up to 200 tracks).
 */
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const tag = (s, t) => { const m = String(s || '').match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1].trim()) : ''; };
const block = (s, t) => String(s || '').match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] || '';
const artist = (s) => String(s || '').replace(/ - Topic$/, '');

/** Playlist id from a YouTube / YouTube Music URL (not for watch URLs that point at one video). */
export const playlistId = (url) => {
  const u = String(url || '');
  if (!/(?:youtube\.com|youtu\.be)\//.test(u) || /[?&]v=/.test(u)) return null;
  return u.match(/[?&]list=([\w-]+)/)?.[1] || null;
};

export function parseFeed(xml, list) {
  const [head, ...entries] = String(xml).split('<entry>');
  const items = entries
    .map((e) => ({ v: tag(e, 'yt:videoId'), t: tag(e, 'title'), a: artist(tag(block(e, 'author'), 'name')) }))
    .filter((i) => /^[\w-]{11}$/.test(i.v));
  return { list, title: tag(head, 'title'), author: tag(block(head, 'author'), 'name'), items, source: 'rss' };
}

async function viaApi(list, key) {
  const api = 'https://www.googleapis.com/youtube/v3';
  const get = async (path) => {
    const r = await fetch(`${api}/${path}&key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`YouTube API ${r.status}`);
    return r.json();
  };
  const meta = (await get(`playlists?part=snippet&id=${encodeURIComponent(list)}`)).items?.[0]?.snippet || {};
  const items = [];
  let page = '';
  do {
    const j = await get(`playlistItems?part=snippet,status&maxResults=50&playlistId=${encodeURIComponent(list)}${page ? `&pageToken=${page}` : ''}`);
    for (const it of j.items || []) {
      const s = it.snippet || {};
      if (it.status?.privacyStatus === 'private' || /^(Deleted|Private) video$/.test(s.title)) continue;
      items.push({ v: s.resourceId?.videoId, t: s.title, a: artist(s.videoOwnerChannelTitle) });
    }
    page = j.nextPageToken;
  } while (page && items.length < 200);
  return { list, title: meta.title || '', author: meta.channelTitle || '', items, source: 'api' };
}

export async function fetchPlaylist(list, { apiKey = process.env.YT_API_KEY } = {}) {
  if (apiKey) return viaApi(list, apiKey);
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(list)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Tessera; +https://github.com/clawfire/tessera)' },
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error(`YouTube feed ${r.status}`);
  return parseFeed(await r.text(), list);
}
