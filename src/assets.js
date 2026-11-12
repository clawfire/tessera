/**
 * Tessera — image uploads from the editor
 *
 * Two modes, detected automatically:
 *  - local:  the dev server (npm run dev) answers /__tessera/ping → images are written to assets/uploads/
 *  - hosted: no server → images wait in IndexedDB until "Publish" commits them to your repo
 *
 * Images are resized and re-encoded (WebP, JPEG fallback) in the browser before anything is stored.
 */
window.Tessera = window.Tessera || {};
(function (T) {
  'use strict';
  const A = (T.assets = {});
  T.assetOverrides = T.assetOverrides || {}; // path → blob: URL, so pending images show before they exist on disk
  A.mode = 'hosted';

  /* ---------- tiny IndexedDB store for pending images ---------- */
  const DB = 'tessera', STORE = 'pending';
  const open = () =>
    new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  };
  A.pending = {
    put: (path, blob) => run('readwrite', (s) => s.put(blob, path)).catch(() => {}),
    clear: () => run('readwrite', (s) => s.clear()).catch(() => {}),
    async all() {
      try {
        const [keys, blobs] = await Promise.all([run('readonly', (s) => s.getAllKeys()), run('readonly', (s) => s.getAll())]);
        return keys.map((path, i) => ({ path, blob: blobs[i] }));
      } catch (e) {
        return [];
      }
    }
  };
  /** Pending images still referenced by the page. */
  A.pendingFor = async (data) => {
    const json = JSON.stringify(data);
    return (await A.pending.all()).filter((p) => json.includes(p.path));
  };
  A.restore = async () => {
    for (const { path, blob } of await A.pending.all()) T.assetOverrides[path] ||= URL.createObjectURL(blob);
  };

  /* ---------- mode detection ---------- */
  A.detect = async () => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 800);
      const r = await fetch('__tessera/ping', { signal: ctrl.signal, cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      A.mode = j?.tessera ? 'local' : 'hosted';
      A.localPage = j?.page || 'page.json';
    } catch (e) {
      A.mode = 'hosted';
    }
    return A.mode;
  };

  /* ---------- processing ---------- */
  const slug = (s) =>
    String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';

  async function shortHash(blob) {
    const buf = await blob.arrayBuffer();
    if (crypto?.subtle) {
      const d = new Uint8Array(await crypto.subtle.digest('SHA-1', buf));
      return [...d.slice(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    new Uint8Array(buf).forEach((b) => (h = ((h << 5) + h + b) | 0));
    return (h >>> 0).toString(16);
  }

  const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

  /** Resize to `max` px on the long side and re-encode. GIF/SVG are kept as-is. */
  A.compress = async (file, max = 2000) => {
    if (/^image\/(gif|svg\+xml)$/.test(file.type)) return file;
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const webp = await toBlob(canvas, 'image/webp', 0.82);
    if (webp?.type === 'image/webp') return webp;
    // browsers without WebP encoding: keep transparency for PNGs, JPEG otherwise
    return file.type === 'image/png' ? toBlob(canvas, 'image/png') : toBlob(canvas, 'image/jpeg', 0.85);
  };

  const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

  /** Process a File and store it. Resolves to its path (assets/uploads/…). */
  A.add = async (file, { max = 2000 } = {}) => {
    if (!/^image\//.test(file.type)) throw new Error(`${file.name}: not an image`);
    const blob = await A.compress(file, max);
    const path = `assets/uploads/${slug(file.name)}-${await shortHash(blob)}.${EXT[blob.type] || 'bin'}`;
    if (A.mode === 'local') {
      const r = await fetch('__tessera/upload?path=' + encodeURIComponent(path), { method: 'POST', body: blob });
      if (!r.ok) throw new Error('upload failed (' + r.status + ')');
    } else {
      await A.pending.put(path, blob);
    }
    T.assetOverrides[path] = URL.createObjectURL(blob);
    return { path, size: blob.size };
  };

  /** Local mode: write page.json to disk through the dev server. */
  A.saveLocal = async (data) => {
    const r = await fetch('__tessera/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data, null, 2) + '\n' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'save failed (' + r.status + ')');
    return j.path;
  };
})(window.Tessera);
