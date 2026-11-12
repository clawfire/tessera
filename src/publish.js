/**
 * Tessera — publish from the editor: one commit with page.json + pending images.
 *
 * Providers:
 *  - github: GitHub REST API (git data API → single atomic commit)
 *  - gitea:  Gitea / Forgejo / Codeberg (POST /repos/{owner}/{repo}/contents, multi-file commit)
 *
 * Non-secret settings live in page.json (settings.publish). The token never does:
 * it stays in this browser (sessionStorage by default, localStorage if "remember").
 * Use a fine-grained token limited to one repository with "Contents: read & write".
 */
window.Tessera = window.Tessera || {};
(function (T) {
  'use strict';
  const P = (T.publish = {});
  const TOKEN_KEY = 'tessera:token';

  P.getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  P.remembered = () => { try { return !!localStorage.getItem(TOKEN_KEY); } catch (e) { return false; } };
  P.setToken = (token, remember) => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch (e) { /* storage disabled */ }
  };

  const b64text = (s) => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64blob = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  async function call(method, url, headers, body) {
    const r = await fetch(url, {
      method,
      headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${j.message || r.statusText} — ${method} ${url.replace(/^https?:\/\/[^/]+/, '')}`);
    return j;
  }
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

  const providers = {
    async github(cfg, token, files, message) {
      const api = (cfg.api || 'https://api.github.com').replace(/\/$/, '') + '/repos/' + cfg.repo;
      const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
      const ref = await call('GET', `${api}/git/ref/heads/${cfg.branch}`, H);
      const parent = await call('GET', `${api}/git/commits/${ref.object.sha}`, H);
      const tree = [];
      for (const f of files) {
        const blob = await call('POST', `${api}/git/blobs`, H, { content: f.base64, encoding: 'base64' });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const newTree = await call('POST', `${api}/git/trees`, H, { base_tree: parent.tree.sha, tree });
      const commit = await call('POST', `${api}/git/commits`, H, { message, tree: newTree.sha, parents: [ref.object.sha] });
      await call('PATCH', `${api}/git/refs/heads/${cfg.branch}`, H, { sha: commit.sha });
      return commit.html_url || `https://github.com/${cfg.repo}/commit/${commit.sha}`;
    },

    async gitea(cfg, token, files, message) {
      if (!cfg.api) throw new Error('API URL required, e.g. https://codeberg.org/api/v1');
      const api = cfg.api.replace(/\/$/, '') + '/repos/' + cfg.repo;
      const H = { Authorization: `token ${token}`, Accept: 'application/json' };
      const ops = [];
      for (const f of files) {
        // existing files need their sha to be updated
        const r = await fetch(`${api}/contents/${encPath(f.path)}?ref=${encodeURIComponent(cfg.branch)}`, { headers: H });
        const existing = r.ok ? await r.json() : null;
        ops.push({ operation: existing ? 'update' : 'create', path: f.path, content: f.base64, ...(existing ? { sha: existing.sha } : {}) });
      }
      const res = await call('POST', `${api}/contents`, H, { branch: cfg.branch, message, files: ops });
      return res.commit?.html_url || '';
    }
  };

  P.ready = (cfg) => !!(cfg && /^[^/\s]+\/[^/\s]+$/.test(cfg.repo || '') && P.getToken() && (cfg.provider !== 'gitea' || cfg.api));

  /** Commit page.json (+ pending images still referenced by it). Resolves to the commit URL. */
  P.run = async (data) => {
    const cfg = Object.assign({ provider: 'github', branch: 'main', path: 'page.json' }, data.settings?.publish);
    const token = P.getToken();
    if (!/^[^/\s]+\/[^/\s]+$/.test(cfg.repo || '')) throw new Error('Repository must look like owner/name');
    if (!token) throw new Error('Token missing');
    const provider = providers[cfg.provider];
    if (!provider) throw new Error('Unknown provider ' + cfg.provider);
    const pending = await T.assets.pendingFor(data);
    const files = [{ path: cfg.path, base64: b64text(JSON.stringify(data, null, 2) + '\n') }];
    for (const p of pending) files.push({ path: p.path, base64: await b64blob(p.blob) });
    const n = pending.length;
    const url = await provider(cfg, token, files, `Update page${n ? ` (+${n} image${n > 1 ? 's' : ''})` : ''} via Tessera editor`);
    await T.assets.pending.clear();
    return { url, images: n };
  };
})(window.Tessera);
