// ==UserScript==
// @name         Page Snapshot with Linked Pages
// @namespace    snapshot.tool
// @version      1.1
// @description  Self-contained HTML snapshot of the current page + selected linked pages, works offline
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__snapToolLoaded) return;
  window.__snapToolLoaded = true;

  const selectedLinks = new Map();
  let linkCounter = 0;
  let selectionMode = false;
  let processing = false;
  const urlCache = new Map();
  const dataUrlCache = new Map(); // url -> Promise<dataUrl|original>

  const UI = 'snaptool-';

  // ---------- Toolbar UI ----------
  const styleEl = document.createElement('style');
  styleEl.id = UI + 'style';
  styleEl.textContent = `
    a[${UI}selected] {
      outline: 3px solid #ff6b6b !important;
      outline-offset: 1px !important;
      background-color: rgba(255,107,107,.15) !important;
    }
    #${UI}toolbar {
      position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
      background: #1e1e2e; color: #eee; padding: 10px 12px;
      border-radius: 10px; font-family: system-ui, sans-serif; font-size: 13px;
      box-shadow: 0 4px 20px rgba(0,0,0,.4);
      display: flex; flex-direction: column; gap: 8px; min-width: 250px;
    }
    #${UI}toolbar .row { display: flex; gap: 6px; flex-wrap: wrap; }
    #${UI}toolbar button {
      background: #3b3b55; color: #eee; border: 1px solid #555;
      padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
    }
    #${UI}toolbar button:hover:not(:disabled) { background: #4a4a6a; }
    #${UI}toolbar button:disabled { opacity: .5; cursor: default; }
    #${UI}toolbar button.primary { background: #4a7dff; border-color: #4a7dff; }
    #${UI}toolbar button.primary:hover:not(:disabled) { background: #5a8dff; }
    #${UI}toolbar button.active { background: #ff6b6b; border-color: #ff6b6b; }
    #${UI}toolbar .status { font-size: 11px; color: #aaa; word-break: break-all; }
    #${UI}toolbar .count { font-weight: bold; color: #4a7dff; }
  `;
  document.head.appendChild(styleEl);

  const toolbar = document.createElement('div');
  toolbar.id = UI + 'toolbar';
  toolbar.innerHTML = `
    <div><strong>📸 Page Snapshot</strong></div>
    <div class="row">
      <button id="${UI}select">Select Links</button>
      <button id="${UI}confirm" class="primary">Save Snapshot</button>
    </div>
    <div class="row">
      <button id="${UI}clear">Clear</button>
      <button id="${UI}cancel">Cancel</button>
    </div>
    <div class="status">Selected: <span class="count" id="${UI}count">0</span></div>
    <div class="status" id="${UI}status"></div>
  `;
  document.body.appendChild(toolbar);

  const $ = (id) => toolbar.querySelector('#' + UI + id);
  const selectBtn = $('select'), confirmBtn = $('confirm');
  const clearBtn = $('clear'), cancelBtn = $('cancel');
  const countEl = $('count'), statusEl = $('status');
  const setStatus = (s) => (statusEl.textContent = s || '');
  const updateCount = () => (countEl.textContent = String(selectedLinks.size));

  // ---------- Link selection ----------
  function onLinkClickCapture(e) {
    if (!selectionMode || processing) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (selectedLinks.has(a)) {
      a.removeAttribute(UI + 'selected');
      selectedLinks.delete(a);
    } else {
      const id = 'link-' + (++linkCounter);
      a.setAttribute(UI + 'selected', id);
      selectedLinks.set(a, { id, href: a.href });
    }
    updateCount();
  }

  function toggleSelectionMode() {
    if (processing) return;
    selectionMode = !selectionMode;
    if (selectionMode) {
      document.addEventListener('click', onLinkClickCapture, true);
      selectBtn.classList.add('active');
      selectBtn.textContent = 'Selecting…';
      setStatus('Click links to toggle selection');
    } else {
      document.removeEventListener('click', onLinkClickCapture, true);
      selectBtn.classList.remove('active');
      selectBtn.textContent = 'Select Links';
      setStatus('');
    }
  }
  selectBtn.addEventListener('click', toggleSelectionMode);

  clearBtn.addEventListener('click', () => {
    if (processing) return;
    for (const a of selectedLinks.keys()) a.removeAttribute(UI + 'selected');
    selectedLinks.clear();
    updateCount();
  });

  cancelBtn.addEventListener('click', () => {
    if (processing) return;
    if (selectionMode) toggleSelectionMode();
    for (const a of selectedLinks.keys()) a.removeAttribute(UI + 'selected');
    selectedLinks.clear();
    toolbar.remove();
    styleEl.remove();
  });

  confirmBtn.addEventListener('click', doSnapshot);

  // ---------- Fetch helpers ----------
  function gmFetch(url, type) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: type || 'blob',
        timeout: 45000,
        onload: (res) => {
          if ((res.status >= 200 && res.status < 300) || res.status === 0) resolve(res.response);
          else reject(new Error('HTTP ' + res.status));
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Timeout')),
      });
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function textToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  // Cached so we don't refetch the same URL twice (e.g. img + <source> sharing a URL)
  async function fetchAsDataUrl(url) {
    if (!url) return url;
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    if (dataUrlCache.has(url)) return dataUrlCache.get(url);
    const p = (async () => {
      try {
        return await blobToDataUrl(await gmFetch(url, 'blob'));
      } catch (e) {
        console.warn('[snapshot] fetch failed:', url, e);
        return url;
      }
    })();
    dataUrlCache.set(url, p);
    return p;
  }

  // ---------- CSS URL inlining ----------
  async function inlineCssUrls(cssText, baseUrl) {
    if (!cssText || !cssText.includes('url(')) return cssText;
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    const matches = [...cssText.matchAll(re)];
    const cache = new Map();
    for (const m of matches) {
      const u = m[2].trim();
      if (!u || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('#')) continue;
      if (cache.has(u)) continue;
      try {
        cache.set(u, await fetchAsDataUrl(new URL(u, baseUrl).href));
      } catch {
        cache.set(u, null);
      }
    }
    return cssText.replace(re, (full, _q, u) => {
      const t = u.trim();
      if (!t || t.startsWith('data:') || t.startsWith('blob:') || t.startsWith('#')) return full;
      const rep = cache.get(t);
      return rep ? `url("${rep}")` : full;
    });
  }

  // ---------- srcset inlining (shared by <img> and <source>) ----------
  async function inlineSrcset(srcsetStr, baseUrl) {
    if (!srcsetStr) return srcsetStr;
    const parts = srcsetStr.split(',').map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const part of parts) {
      const pieces = part.split(/\s+/);
      const u = pieces[0];
      const rest = pieces.slice(1).join(' ');
      if (!u || u.startsWith('data:') || u.startsWith('blob:')) {
        out.push(part);
        continue;
      }
      try {
        const d = await fetchAsDataUrl(new URL(u, baseUrl).href);
        out.push(d + (rest ? ' ' + rest : ''));
      } catch {
        out.push(part);
      }
    }
    return out.join(', ');
  }

  // ---------- Inline everything inside a root node ----------
  async function inlineResources(root, baseUrl, targetDoc) {
    const q = (sel) => Array.from(root.querySelectorAll(sel));

    // Strip CSP & refresh meta so our inline loader can run in the saved file
    for (const m of q('meta[http-equiv]')) {
      const v = (m.getAttribute('http-equiv') || '').toLowerCase();
      if (v === 'content-security-policy' || v === 'refresh') m.remove();
    }

    // Images
    for (const img of q('img[src]')) {
      const s = img.getAttribute('src');
      if (s && !s.startsWith('data:') && !s.startsWith('blob:')) {
        try { img.setAttribute('src', await fetchAsDataUrl(new URL(s, baseUrl).href)); } catch {}
      }
    }
    // <img srcset>
    for (const img of q('img[srcset]')) {
      const inlined = await inlineSrcset(img.getAttribute('srcset'), baseUrl);
      img.setAttribute('srcset', inlined);
    }
    // <source srcset> inside <picture> — MUST inline or the browser prefers these over <img>
    for (const src of q('picture > source[srcset]')) {
      const inlined = await inlineSrcset(src.getAttribute('srcset'), baseUrl);
      src.setAttribute('srcset', inlined);
    }

    // Favicons / touch icons
    for (const link of q(
      'link[rel~="icon"], link[rel="apple-touch-icon"], ' +
      'link[rel="apple-touch-icon-precomposed"], link[rel="mask-icon"]'
    )) {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('data:')) continue;
      try {
        link.setAttribute('href', await fetchAsDataUrl(new URL(href, baseUrl).href));
      } catch {}
    }

    // Stylesheets → inline <style>
    for (const link of q('link[rel~="stylesheet"][href]')) {
      const href = link.getAttribute('href');
      try {
        const abs = new URL(href, baseUrl).href;
        const blob = await gmFetch(abs, 'blob');
        let css = await blob.text();
        css = await inlineCssUrls(css, abs);
        const st = targetDoc.createElement('style');
        const media = link.getAttribute('media');
        if (media) st.setAttribute('media', media);
        st.textContent = css;
        link.replaceWith(st);
      } catch (e) {
        console.warn('[snapshot] stylesheet failed:', href, e);
      }
    }

    // Inline <style> and style="…" attributes
    for (const st of q('style')) {
      const t = st.textContent;
      if (t && t.includes('url(')) st.textContent = await inlineCssUrls(t, baseUrl);
    }
    for (const el of q('[style*="url("]')) {
      el.setAttribute('style', await inlineCssUrls(el.getAttribute('style'), baseUrl));
    }

    // Scripts → inline
    for (const script of q('script[src]')) {
      const src = script.getAttribute('src');
      if (!src) continue;
      try {
        const abs = new URL(src, baseUrl).href;
        const blob = await gmFetch(abs, 'blob');
        const js = await blob.text();
        const ns = targetDoc.createElement('script');
        for (const at of script.attributes) {
          if (at.name !== 'src' && at.name !== 'integrity' && at.name !== 'crossorigin')
            ns.setAttribute(at.name, at.value);
        }
        ns.textContent = js;
        script.replaceWith(ns);
      } catch (e) {
        console.warn('[snapshot] script failed:', src, e);
      }
    }

    // Media
    for (const el of q('video[src], audio[src], source[src]')) {
      const s = el.getAttribute('src');
      if (s && !s.startsWith('data:')) {
        try { el.setAttribute('src', await fetchAsDataUrl(new URL(s, baseUrl).href)); } catch {}
      }
    }
    for (const v of q('video[poster]')) {
      const p = v.getAttribute('poster');
      if (p && !p.startsWith('data:')) {
        try { v.setAttribute('poster', await fetchAsDataUrl(new URL(p, baseUrl).href)); } catch {}
      }
    }

    // Remove SRI / CORS attributes (no longer valid after inlining)
    for (const el of q('[integrity]')) el.removeAttribute('integrity');
    for (const el of q('[crossorigin]')) el.removeAttribute('crossorigin');
  }

  // ---------- Snapshot a subpage → base64 HTML (deduped per URL) ----------
  function snapshotSubpageHtml(url) {
    if (urlCache.has(url)) return urlCache.get(url);
    const p = (async () => {
      try {
        const blob = await gmFetch(url, 'blob');
        const text = await blob.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');

        let baseUrl = url;
        const baseTag = doc.querySelector('base[href]');
        if (baseTag) {
          try { baseUrl = new URL(baseTag.getAttribute('href'), url).href; } catch {}
          baseTag.remove();
        }

        await inlineResources(doc.documentElement, baseUrl, doc);

        const nb = doc.createElement('base');
        nb.setAttribute('href', url);
        const head = doc.head || doc.documentElement;
        head.insertBefore(nb, head.firstChild);

        const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        return textToBase64(html);
      } catch (e) {
        console.warn('[snapshot] subpage failed:', url, e);
        return null;
      }
    })();
    urlCache.set(url, p);
    return p;
  }

  // ---------- Loader script written into the saved file ----------
  function buildLoaderScript() {
    return `
(function(){
  try {
    var holder = document.getElementById('${UI}data');
    if (!holder) return;
    var data = JSON.parse(holder.textContent || '{}');
    var urls = {};
    for (var id in data) {
      if (!Object.prototype.hasOwnProperty.call(data, id)) continue;
      var b64 = data[id];
      if (!b64) continue;
      try {
        var bin = atob(b64);
        var len = bin.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        var blob = new Blob([bytes], { type: 'text/html;charset=utf-8' });
        urls[id] = URL.createObjectURL(blob);
      } catch (e) { console.warn('Snapshot decode failed', id, e); }
    }
    var anchors = document.querySelectorAll('a[data-${UI}target]');
    for (var j = 0; j < anchors.length; j++) {
      var a = anchors[j];
      var tid = a.getAttribute('data-${UI}target');
      if (urls[tid]) {
        a.setAttribute('href', urls[tid]);
        a.removeAttribute('data-${UI}target');
      }
    }
  } catch (e) { console.error('Snapshot loader failed', e); }
})();
`;
  }

  // ---------- Main ----------
  async function doSnapshot() {
    if (processing) return;
    processing = true;
    if (selectionMode) toggleSelectionMode();

    selectBtn.disabled = confirmBtn.disabled = clearBtn.disabled = cancelBtn.disabled = true;

    try {
      // 1. Fetch selected subpages (deduped by URL)
      const urlToBlobId = new Map();
      const blobData = {};
      let blobCounter = 0, idx = 0;
      const total = selectedLinks.size;

      for (const info of selectedLinks.values()) {
        idx++;
        if (!urlToBlobId.has(info.href)) {
          setStatus(`Fetching linked page ${idx}/${total}…`);
          const b64 = await snapshotSubpageHtml(info.href);
          if (b64) {
            const id = 'sub-' + (++blobCounter);
            urlToBlobId.set(info.href, id);
            blobData[id] = b64;
          }
        }
      }

      // 2. Clone main page
      setStatus('Preparing main page…');
      const clone = document.documentElement.cloneNode(true);

      // 3. Rewrite selected anchors inside the clone
      for (const info of selectedLinks.values()) {
        const blobId = urlToBlobId.get(info.href);
        const anchor = clone.querySelector(`a[${UI}selected="${info.id}"]`);
        if (!anchor) continue;
        if (blobId) {
          anchor.setAttribute(`data-${UI}target`, blobId);
          anchor.setAttribute('href', info.href);
          anchor.removeAttribute('onclick');
        }
        anchor.removeAttribute(UI + 'selected');
      }

      // 4. Remove our UI from the clone
      const tb = clone.querySelector('#' + UI + 'toolbar');
      if (tb) tb.remove();
      const st = clone.querySelector('#' + UI + 'style');
      if (st) st.remove();

      // 5. Determine effective base URL (respect <base href> if present)
      let mainBase = location.href;
      const mainBaseTag = clone.querySelector('base[href]');
      if (mainBaseTag) {
        try { mainBase = new URL(mainBaseTag.getAttribute('href'), location.href).href; } catch {}
      }

      // 6. Inline resources on the main page
      setStatus('Inlining main page resources…');
      await inlineResources(clone, mainBase, document);

      // 7. Append data + loader into clone
      const bodyEl = clone.querySelector('body') || clone;
      if (Object.keys(blobData).length) {
        const dataScript = document.createElement('script');
        dataScript.type = 'application/json';
        dataScript.id = UI + 'data';
        dataScript.textContent = JSON.stringify(blobData);
        bodyEl.appendChild(dataScript);

        const loader = document.createElement('script');
        loader.textContent = buildLoaderScript();
        bodyEl.appendChild(loader);
      }

      // 8. Download
      setStatus('Building file…');
      const html = '<!DOCTYPE html>\n' + clone.outerHTML;
      const outBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const dlUrl = URL.createObjectURL(outBlob);

      const safeTitle = (document.title || 'snapshot').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${safeTitle}-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 30000);

      setStatus('Snapshot saved!');
      processing = false;

      setTimeout(() => {
        for (const el of selectedLinks.keys()) el.removeAttribute(UI + 'selected');
        selectedLinks.clear();
        toolbar.remove();
        styleEl.remove();
      }, 1500);
    } catch (e) {
      console.error('[snapshot] error:', e);
      setStatus('Error: ' + ((e && e.message) || e));
      processing = false;
      selectBtn.disabled = confirmBtn.disabled = clearBtn.disabled = cancelBtn.disabled = false;
    }
  }
})();
