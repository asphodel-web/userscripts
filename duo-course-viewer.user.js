// ==UserScript==
// @name         Duolingo Path Viewer
// @namespace    https://github.com/duolingo-path-viewer
// @version      1.0.0
// @description  Preview the full Duolingo course path including locked sections, with session progress, and download the JSON.
// @match        https://www.duolingo.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (document.getElementById('duolingo-path-viewer-host')) return;

  const COMPLETE_STATES = new Set(['legendary', 'passed', 'gold', 'complete', 'completed']);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const levelSessions = l => {
    const total = l.totalSessions || 0;
    const done = COMPLETE_STATES.has(l.state) ? total : (l.finishedSessions || 0);
    return { done, total };
  };

  const unitSessions = u => (u.levels || []).reduce(
    (a, l) => { const r = levelSessions(l); return { done: a.done + r.done, total: a.total + r.total }; },
    { done: 0, total: 0 }
  );

  const sectionSessions = s => (s.units || []).reduce(
    (a, u) => { const r = unitSessions(u); return { done: a.done + r.done, total: a.total + r.total }; },
    { done: 0, total: 0 }
  );

  const isComplete = r => r.total > 0 && r.done >= r.total;

  const findPathSectioned = (state) => {
    const cc = state?.state?.user?.currentCourse || state?.user?.currentCourse;
    if (Array.isArray(cc?.pathSectioned)) return cc.pathSectioned;
    const search = (obj, depth) => {
      if (!obj || typeof obj !== 'object' || depth > 20) return null;
      if (Array.isArray(obj.pathSectioned)) return obj.pathSectioned;
      for (const k of Object.keys(obj)) {
        const r = search(obj[k], depth + 1);
        if (r) return r;
      }
      return null;
    };
    return search(state, 0);
  };

  const decodeState = async () => {
    const raw = localStorage.getItem('duo.state');
    if (!raw) throw new Error('duo.state not found in localStorage. Are you logged in?');
    let payload = JSON.parse(raw);
    if (typeof payload !== 'string') payload = payload?.state ?? payload?.data;
    if (typeof payload !== 'string') throw new Error('Unexpected duo.state format.');
    let b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
    return JSON.parse(text);
  };

  const extractPath = async () => {
    const state = await decodeState();
    const pathSectioned = findPathSectioned(state);
    if (!pathSectioned || pathSectioned.length === 0) throw new Error('pathSectioned not found or empty in decoded state.');
    return pathSectioned;
  };

  const downloadJson = (pathSectioned) => {
    const data = JSON.stringify({ pathSectioned }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `duolingo-path-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderViewer = (pathSectioned) => {
    const total = pathSectioned.reduce(
      (a, s) => { const r = sectionSessions(s); return { done: a.done + r.done, total: a.total + r.total }; },
      { done: 0, total: 0 }
    );
    const summary = `<div class="dlv-summary">Total: ${total.done}/${total.total} sessions across ${pathSectioned.length} sections</div>`;
    const tree = pathSectioned.map(sec => {
      const ss = sectionSessions(sec);
      return `
      <details open>
        <summary class="${isComplete(ss) ? 'done' : ''}">
          <b>Section ${esc(sec.index)}</b>
          <em>[${esc(sec.type)}] ${sec.completedUnits}/${sec.totalUnits} units ${esc(sec.status || '')}</em>
          <span class="sess">${ss.done}/${ss.total}</span>
        </summary>
        ${(sec.units || []).map(u => {
          const us = unitSessions(u);
          return `
          <details class="${isComplete(us) ? 'unit-done' : ''}">
            <summary>
              Unit ${esc(u.unitNumber)} ${u.isUnlocked === false ? '<span class="lock">🔒</span>' : ''}
              — ${esc(u.teachingObjective || '')}
              <em>${esc(u.cefrLevel || '')}</em>
              <span class="sess">${us.done}/${us.total}</span>
            </summary>
            <ul>${(u.levels || []).map(l => {
              const c = l.pathLevelClientData || {};
              const label = c.teachingObjective || c.duoRadioSummary?.name || c.storyName || l.debugName;
              const r = levelSessions(l);
              return `<li><span class="sess">${r.done}/${r.total}</span> <em>[${esc(l.type)}]</em> ${esc(label)} <em>(${esc(l.state)})</em></li>`;
            }).join('')}</ul>
          </details>`;
        }).join('')}
      </details>`;
    }).join('');
    return summary + tree;
  };

  // ---- UI ----
  const host = document.createElement('div');
  host.id = 'duolingo-path-viewer-host';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        display: block;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .dlv-btn {
        pointer-events: auto;
        position: fixed;
        right: 16px;
        bottom: 16px;
        padding: 10px 16px;
        background: #58cc02;
        color: #fff;
        border: none;
        border-radius: 8px;
        font: 600 14px system-ui;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }
      .dlv-btn:hover { background: #4cae00; }
      .dlv-modal {
        pointer-events: auto;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: none;
      }
      .dlv-modal.open { display: flex; align-items: center; justify-content: center; }
      .dlv-modal-inner {
        background: #fff;
        color: #333;
        width: min(1000px, 92vw);
        height: 88vh;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      }
      .dlv-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid #e5e5e5;
        background: #fafafa;
      }
      .dlv-header h2 { margin: 0; font-size: 16px; flex: 1; color: #333; }
      .dlv-header button {
        padding: 8px 14px;
        border: none;
        border-radius: 6px;
        font: 600 13px system-ui;
        cursor: pointer;
      }
      .dlv-download { background: #1cb0f6; color: #fff; }
      .dlv-download:hover { background: #1899d6; }
      .dlv-download:disabled { background: #ccc; cursor: not-allowed; }
      .dlv-refresh { background: #eee; color: #333; }
      .dlv-refresh:hover { background: #ddd; }
      .dlv-close { background: #ff4b4b; color: #fff; }
      .dlv-close:hover { background: #e63939; }
      .dlv-body {
        flex: 1;
        overflow: auto;
        padding: 16px 20px;
        font-size: 14px;
        line-height: 1.5;
        color: #333;
      }
      .dlv-summary {
        padding: 8px 12px;
        background: #f0f7ff;
        border-radius: 6px;
        margin-bottom: 12px;
        font-weight: 600;
        color: #1cb0f6;
      }
      .dlv-body details { margin-left: 1em; }
      .dlv-body summary { cursor: pointer; padding: 2px 0; }
      .dlv-body em { color: #888; font-style: normal; }
      .dlv-body .lock { color: #c00; }
      .dlv-body .sess {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #066;
        background: #eef6f8;
        padding: 0 4px;
        border-radius: 3px;
        font-size: 12px;
        display: inline-block;
        margin-right: 4px;
      }
      .dlv-body summary.done > .sess { background: #e6f7e6; color: #060; }
      .dlv-body details.unit-done > summary { color: #060; }
      .dlv-body details.unit-done > summary > .sess { background: #e6f7e6; color: #060; }
      .dlv-body ul { margin: 4px 0; padding-left: 24px; }
      .dlv-status { padding: 8px 0; color: #888; }
      .dlv-error { color: #c00; padding: 8px 0; white-space: pre-wrap; }
    </style>
    <button class="dlv-btn" title="Preview the full course path">📚 Duolingo Path</button>
    <div class="dlv-modal">
      <div class="dlv-modal-inner">
        <div class="dlv-header">
          <h2>Duolingo Course Path</h2>
          <button class="dlv-refresh">Refresh</button>
          <button class="dlv-download" disabled>Download JSON</button>
          <button class="dlv-close">Close</button>
        </div>
        <div class="dlv-body"><div class="dlv-status">Click "Refresh" to load.</div></div>
      </div>
    </div>
  `;

  const btn = shadow.querySelector('.dlv-btn');
  const modal = shadow.querySelector('.dlv-modal');
  const body = shadow.querySelector('.dlv-body');
  const refreshBtn = shadow.querySelector('.dlv-refresh');
  const downloadBtn = shadow.querySelector('.dlv-download');
  const closeBtn = shadow.querySelector('.dlv-close');

  let currentData = null;

  const load = async () => {
    body.innerHTML = '<div class="dlv-status">Decoding duo.state…</div>';
    downloadBtn.disabled = true;
    try {
      currentData = await extractPath();
      window.__dlvPath = currentData;
      body.innerHTML = renderViewer(currentData);
      downloadBtn.disabled = false;
    } catch (e) {
      currentData = null;
      body.innerHTML = `<div class="dlv-error">Error: ${esc(e.message)}\n\nIf the page just loaded, wait a moment and click "Refresh".</div>`;
    }
  };

  btn.addEventListener('click', () => {
    modal.classList.add('open');
    load();
  });
  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });
  refreshBtn.addEventListener('click', load);
  downloadBtn.addEventListener('click', () => {
    if (currentData) downloadJson(currentData);
  });
})();
