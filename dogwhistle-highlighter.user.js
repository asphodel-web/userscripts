// ==UserScript==
// @name         Dogwhistle Highlighter
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Flags specific text fragments and provides context
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

    // ---------- Data ----------
    const fragments = [
        { match: "😭💢", context: "While this is an innocent emoji combination at first glance, it's often used as a dog whistle symbol for lolicons. It is often used in bios (biographies) and display names." },
        // ...
    ];
    const fragmentByMatch = new Map(fragments.map(f => [f.match, f]));
    const bloomFilter = { mightContain: () => true }; // plug in real filter here

    // ---------- Highlight state ----------
    const HIGHLIGHT_NAME = "flagged-fragment";
    const highlight = new Highlight();          // single, mutable
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);

    const matchedRanges = new Map();             // Range -> fragment
    const firstRangeByTerm = new Map();          // term -> Range
    const scannedTextNodes = new WeakSet();

    // ---------- UI (shadow DOM, isolated from page) ----------
    const host = document.createElement('div');
    host.id = 'tff-ui-host';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
        :host { all: initial; }
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .fab {
            position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
            display: flex; align-items: center; gap: 6px;
            padding: 10px 14px; border-radius: 999px;
            background: #c62828; color: white; border: none; cursor: pointer;
            font-size: 14px; font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,.25);
            transition: transform .15s;
        }
        .fab:hover { transform: scale(1.05); }
        .fab[hidden] { display: none; }
        .panel {
            position: fixed; bottom: 80px; right: 20px; z-index: 2147483647;
            width: 360px; max-width: calc(100vw - 40px);
            max-height: 60vh; display: flex; flex-direction: column;
            background: #fff; color: #222; border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0,0,0,.3); overflow: hidden;
        }
        .panel[hidden] { display: none; }
        .panel-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; border-bottom: 1px solid #eee;
            font-weight: 600; font-size: 14px;
        }
        .panel-header button {
            background: none; border: none; cursor: pointer;
            font-size: 16px; padding: 4px 8px; border-radius: 4px; color: #666;
        }
        .panel-header button:hover { background: #f0f0f0; }
        .panel-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
        .panel-item { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
        .panel-item:hover { background: #fafafa; }
        .panel-item:last-child { border-bottom: none; }
        .term {
            font-weight: 600; font-size: 14px;
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .count { font-size: 11px; color: #888; background: #f0f0f0; padding: 2px 6px; border-radius: 999px; }
        .context { font-size: 12px; color: #555; margin-top: 6px; line-height: 1.4; }
        .panel-footer { padding: 10px 16px; border-top: 1px solid #eee; text-align: center; }
        .panel-footer button {
            background: none; border: none; color: #c62828;
            cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0;
        }
        .tooltip {
            position: fixed; z-index: 2147483647;
            max-width: 320px; background: #222; color: white;
            padding: 10px 14px; border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,.4);
            font-size: 12px; line-height: 1.4;
        }
        .tooltip[hidden] { display: none; }
        .tooltip .term { color: #ffcdd2; margin-bottom: 6px; }
    `;
    shadow.appendChild(style);

    const fab = document.createElement('button');
    fab.className = 'fab'; fab.hidden = true;
    fab.setAttribute('aria-label', 'Show flagged content');
    shadow.appendChild(fab);

    const panel = document.createElement('div');
    panel.className = 'panel'; panel.hidden = true;
    panel.innerHTML = `
        <div class="panel-header">
            <span>Flagged content</span>
            <button class="close" aria-label="Close">✕</button>
        </div>
        <ul class="panel-list"></ul>
        <div class="panel-footer">
            <button class="dismiss">Hide for this page</button>
        </div>
    `;
    shadow.appendChild(panel);

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip'; tooltip.hidden = true;
    shadow.appendChild(tooltip);

    document.body.appendChild(host);

    // ---------- Dismissal (persists per tab via sessionStorage) ----------
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('tff-dismissed') === location.href; } catch {}

    function setDismissed(v) {
        dismissed = v;
        try {
            v ? sessionStorage.setItem('tff-dismissed', location.href)
              : sessionStorage.removeItem('tff-dismissed');
        } catch {}
        updateUI();
    }

    // ---------- Wiring ----------
    fab.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        tooltip.hidden = true;
    });
    panel.querySelector('.close').addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('.dismiss').addEventListener('click', () => setDismissed(true));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { panel.hidden = true; tooltip.hidden = true; }
    });

    // ---------- UI refresh ----------
    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function updateUI() {
        if (dismissed) { fab.hidden = panel.hidden = tooltip.hidden = true; return; }

        // Prune ranges whose nodes left the DOM (prevents memory growth on SPAs)
        for (const [range, frag] of matchedRanges) {
            if (range.startContainer.isConnected) continue;
            matchedRanges.delete(range);
            highlight.delete(range);
            if (firstRangeByTerm.get(frag.match) === range) {
                let next = null;
                for (const [r, f] of matchedRanges) if (f.match === frag.match) { next = r; break; }
                next ? firstRangeByTerm.set(frag.match, next) : firstRangeByTerm.delete(frag.match);
            }
        }

        // Distinct-term counts
        const counts = new Map();
        for (const frag of matchedRanges.values()) counts.set(frag.match, (counts.get(frag.match) || 0) + 1);

        if (counts.size === 0) { fab.hidden = true; panel.hidden = true; return; }

        fab.hidden = false;
        fab.textContent = `⚠️ ${counts.size} flagged`;

        const list = panel.querySelector('.panel-list');
        list.innerHTML = '';
        for (const [term, count] of counts) {
            const frag = fragmentByMatch.get(term);
            const li = document.createElement('li');
            li.className = 'panel-item';
            li.innerHTML = `
                <div class="term"><span>${escapeHtml(term)}</span><span class="count">${count}</span></div>
                <div class="context">${escapeHtml(frag.context)}</div>`;
            li.addEventListener('click', () => {
                const r = firstRangeByTerm.get(term);
                r?.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            list.appendChild(li);
        }
    }

    // ---------- Tooltip ----------
    function showTooltip(frag, x, y) {
        tooltip.innerHTML = `<div class="term">${escapeHtml(frag.match)}</div><div>${escapeHtml(frag.context)}</div>`;
        tooltip.hidden = false;
        const rect = tooltip.getBoundingClientRect();
        let left = Math.min(x + 12, window.innerWidth - rect.width - 8);
        let top  = y + 12;
        if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 12;
        tooltip.style.left = Math.max(8, left) + 'px';
        tooltip.style.top  = Math.max(8, top)  + 'px';
    }
    const hideTooltip = () => { tooltip.hidden = true; };
    window.addEventListener('scroll', hideTooltip, { passive: true, capture: true });

    // ---------- Click on highlights ----------
    function getCaretAt(x, y) {
        if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
        if (document.caretPositionFromPoint) {
            const p = document.caretPositionFromPoint(x, y);
            if (!p) return null;
            const r = document.createRange();
            r.setStart(p.offsetNode, p.offset); r.collapse(true);
            return r;
        }
        return null;
    }

    document.addEventListener('click', (e) => {
        if (e.composedPath().includes(host)) return;   // click inside our UI
        const caret = getCaretAt(e.clientX, e.clientY);
        if (!caret) { hideTooltip(); return; }
        const { startContainer: node, startOffset: offset } = caret;
        for (const [range, frag] of matchedRanges) {
            if (range.comparePoint(node, offset) === 0) { showTooltip(frag, e.clientX, e.clientY); return; }
        }
        hideTooltip();
    }, true);

    // ---------- Scanning (same as before, but only adds) ----------
    function processTextNode(node) {
        if (scannedTextNodes.has(node)) return false;
        const p = node.parentElement;
        if (!p || p.closest("script, style, noscript, textarea, [contenteditable]")) return false;
        if (host.contains(p)) return false;
        scannedTextNodes.add(node);

        const text = node.data;
        if (!bloomFilter.mightContain(text)) return false;

        let added = false;
        for (const item of fragments) {
            let idx = text.indexOf(item.match);
            while (idx !== -1) {
                const range = new Range();
                range.setStart(node, idx);
                range.setEnd(node, idx + item.match.length);
                matchedRanges.set(range, item);
                highlight.add(range);                    // incremental — O(1)
                if (!firstRangeByTerm.has(item.match)) firstRangeByTerm.set(item.match, range);
                added = true;
                idx = text.indexOf(item.match, idx + item.match.length);
            }
        }
        return added;
    }

    function scan(root) {
        if (!root) return;
        let added = false;
        if (root.nodeType === Node.TEXT_NODE) {
            added = processTextNode(root);
        } else if (root.nodeType === Node.ELEMENT_NODE && !host.contains(root)) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: (n) => scannedTextNodes.has(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
            });
            let n;
            while ((n = walker.nextNode())) if (processTextNode(n)) added = true;
        }
        if (added) updateUI();
    }

    // ---------- Mutation observer ----------
    const observer = new MutationObserver((mutations) => {
        ric(() => {
            for (const m of mutations) {
                for (const n of m.addedNodes) {
                    if (n === host) continue;
                    if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) scan(n);
                }
            }
            updateUI();   // prunes dead ranges + refreshes panel counts
        });
    });

    // ---------- Kick off ----------
    ric(() => {
        scan(document.body);
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
