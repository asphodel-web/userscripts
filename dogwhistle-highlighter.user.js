// ==UserScript==
// @name         Dogwhistle Highlighter
// @namespace    https://github.com/asphodel-web/userscripts
// @version      2.0
// @description  Flags suspected dogwhistle terms and emoji in page text, with per-term context
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (!('highlights' in CSS) || typeof Highlight === 'undefined') {
        console.warn('[DH] CSS Custom Highlight API not supported — aborting.');
        return;
    }

    /* ============================================================
     * 1. Fragment config
     *
     * `match` may be a string OR an array of strings. All terms in
     * an array share the same `context` and are shown together in
     * the panel. Duplicate terms across entries are ignored (first
     * occurrence wins) and a warning is logged.
     * ============================================================ */
    const configFragments = [
        {
            match: ["😭💢", "💢😭", "🍯🐻", "🐻🍯", "🧸🍯", "🍯🧸", "🍭🧸", "🧸🍭", "🧼🧸", "🧸🧼", "🪀🧃", "🧃🪀", "🍟🐣", "🐣🍟", "🕊️🍭", "🍭🕊️", "🕊️🌈", "🌈🕊️", "🕊️⚔️", "⚔️🕊️", "🧸☀️", "☀️🧸"],
            context: "It is often used as a dog whistle for shotacons. Used in bios (biographies), hashtags and display names."
        },
        {
            match: ["🌈🍓", "🍓🌈"],
            context: "It is often used as a dog whistle for radqueers generally. Used in bios (biographies), hashtags and display names."
        },
        {
            match: ["πφ"],
            context: "This combination of letters means 'paraphile'."
        },
        {
            match: ["ζ"],
            context: "This is the main symbol used by zoophiles, it is also a regular letter of the greek alphabet."
        },
        {
            match: ["🌈🍖", "🍖🌈"],
            context: "Pro-ship emoji combination."
        },
        {
            match: ["🍋🌈", "🌈🍋"],
            context: "Pro-fic emoji combination."
        },
        {
            match: ["🦥🌈"],
            context: "Slothqueer"
        },
        {
            match: ["🚫🥤"],
            context: "Nemaguaqueer"
        },
        {
            match: ["⭕️🌈"],
            context: "Radjectum"
        },
        {
            match: ["🤍🗝️"],
            context: "Pro-consent, note that this is an emoji dog whistle, so the context in which consent is supported is probably irregular."
        },
        {
            match: ["😵🩶"],
            context: "Necrsensual consent"
        },
        {
            match: ["🔄🩹"],
            context: "transharmed"
        },
        {
            match: ["🪼☁️"],
            context: "transage"
        },
        {
            match: ["🩸📍"],
            context: "permapain"
        },
        {
            match: ["🎶💙"],
            context: "miku fickin"
        },
        {
            match: ["🍋💦"],
            context: "piss kink"
        },
        {
            match: ["💧☂️"],
            context: "dacryphilia"
        },
        {
            match: ["🍮🍓"],
            context: "subliminal user"
        },
        {
            match: ["🎶🌙"],
            context: "ug sub user"
        },
        {
            match: ["🦴🌷"],
            context: "maishe"
        },
        {
            match: ["Ⰱ"],
            context: "unhealthy para"
        },
        {
            match: ["⎇"],
            context: "alterhuman"
        },
        {
            match: ["≗"],
            context: "egosyntonic para"
        },

        // String form works too:
        // { match: "🧸🔪", context: "..." },
    ];

    /* ---------- Expand arrays → flat list of {match, context} ---------- */
    const fragments = [];
    const fragmentByMatch = new Map();
    for (const entry of configFragments) {
        const terms = Array.isArray(entry.match) ? entry.match : [entry.match];
        for (const term of terms) {
            if (typeof term !== 'string' || term.length === 0) {
                console.warn('[DH] Skipping invalid term in config entry:', entry);
                continue;
            }
            if (fragmentByMatch.has(term)) {
                console.warn('[DH] Duplicate term ignored (first context wins):', JSON.stringify(term));
                continue;
            }
            const normalized = { match: term, context: entry.context };
            fragments.push(normalized);
            fragmentByMatch.set(term, normalized);
        }
    }
    if (fragments.length === 0) {
        console.warn('[DH] No usable fragments after expansion — aborting.');
        return;
    }

    /* ============================================================
     * 1b. First-codepoint index
     * ============================================================ */
    const fragmentsByFirstCodepoint = new Map();
    for (let i = 0; i < fragments.length; i++) {
        const cp = fragments[i].match.codePointAt(0);
        let bucket = fragmentsByFirstCodepoint.get(cp);
        if (!bucket) { bucket = []; fragmentsByFirstCodepoint.set(cp, bucket); }
        bucket.push({ index: i, pattern: fragments[i].match });
    }

    /* ============================================================
     * 2. Scheduling helpers
     * ============================================================ */
    function scheduleWork(fn) {
        if (window.scheduler && typeof window.scheduler.postTask === 'function') {
            try {
                window.scheduler.postTask(fn, { priority: 'background' }).catch(() => {});
                return;
            } catch (_) { /* fall through */ }
        }
        if (typeof MessageChannel !== 'undefined') {
            queueMessage(fn);
            return;
        }
        setTimeout(fn, 0);
    }

    let messageChannel;
    const messageQueue = [];
    if (typeof MessageChannel !== 'undefined') {
        messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = () => {
            const fn = messageQueue.shift();
            if (fn) fn();
        };
    }
    function queueMessage(fn) {
        messageQueue.push(fn);
        messageChannel.port2.postMessage(null);
    }

    function shouldYield() {
        return !!(navigator.scheduling &&
                  typeof navigator.scheduling.isInputPending === 'function' &&
                  navigator.scheduling.isInputPending({ includeContinuous: true }));
    }

    /* ============================================================
     * 3. Highlight state
     * ============================================================ */
    const HIGHLIGHT_NAME = 'dogwhistle-flag';
    let highlight = new Highlight();
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);

    const matchedRanges = new Map();
    let scannedTextNodes = new WeakSet();

    const docStyle = document.createElement('style');
    docStyle.textContent = `
        ::highlight(${HIGHLIGHT_NAME}) {
            background-color: #ffeb3b;
            color: #000;
            text-decoration: underline wavy #c62828;
            text-decoration-skip-ink: none;
        }
    `;
    (document.head || document.documentElement).appendChild(docStyle);

    /* ============================================================
     * 4. Shadow-DOM UI
     * ============================================================ */
    const host = document.createElement('div');
    host.setAttribute('data-dh-ui', '');
    host.style.cssText = 'all: initial;';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
        :host { all: initial; }
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

        .fab {
            position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
            display: flex; align-items: center; gap: 6px;
            padding: 10px 14px; border-radius: 999px; border: none; cursor: pointer;
            background: #c62828; color: #fff; font-size: 14px; font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,.25); transition: transform .15s;
        }
        .fab:hover { transform: scale(1.05); }
        .fab[hidden] { display: none; }

        .panel {
            position: fixed; bottom: 80px; right: 20px; z-index: 2147483647;
            width: 380px; max-width: calc(100vw - 40px); max-height: 60vh;
            display: flex; flex-direction: column;
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
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 8px; font-weight: 600; font-size: 14px;
        }
        .terms { display: flex; flex-wrap: wrap; gap: 4px 8px; }
        .term-pill { white-space: nowrap; }
        .count {
            flex-shrink: 0;
            font-size: 11px; color: #666; background: #f0f0f0;
            padding: 2px 6px; border-radius: 999px;
        }
        .context { font-size: 12px; color: #555; margin-top: 6px; line-height: 1.4; white-space: pre-wrap; }
        .panel-footer { padding: 10px 16px; border-top: 1px solid #eee; text-align: center; }
        .panel-footer button {
            background: none; border: none; color: #c62828;
            cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0;
        }

        .tooltip {
            position: fixed; z-index: 2147483647; max-width: 320px;
            background: #222; color: #fff; padding: 10px 14px; border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,.4); font-size: 12px; line-height: 1.4;
        }
        .tooltip[hidden] { display: none; }
        .tooltip .term { color: #ffcdd2; margin-bottom: 6px; display: block; }
        .tooltip .context { color: #fff; }
        .tooltip .link-action {
            display: inline-block; margin-top: 8px;
            color: #90caf9; text-decoration: underline; cursor: pointer; font-size: 12px;
        }
        .tooltip .link-action:hover { color: #bbdefb; }
    `;
    shadow.appendChild(style);

    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.hidden = true;
    fab.setAttribute('aria-label', 'Show flagged dogwhistle terms');
    shadow.appendChild(fab);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.hidden = true;
    panel.innerHTML = `
        <div class="panel-header">
            <span>Dogwhistle terms</span>
            <button class="close" aria-label="Close">✕</button>
        </div>
        <ul class="panel-list"></ul>
        <div class="panel-footer">
            <button class="dismiss">Hide for this page</button>
        </div>
    `;
    shadow.appendChild(panel);

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.hidden = true;
    shadow.appendChild(tooltip);

    document.body.appendChild(host);

    /* ============================================================
     * 5. Dismissal
     * ============================================================ */
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('dh-dismissed') === location.href; } catch (_) {}

    function setDismissed(v) {
        dismissed = v;
        try {
            if (v) sessionStorage.setItem('dh-dismissed', location.href);
            else sessionStorage.removeItem('dh-dismissed');
        } catch (_) {}
        updateUI();
    }

    /* ============================================================
     * 6. UI wiring
     * ============================================================ */
    fab.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        tooltip.hidden = true;
    });
    panel.querySelector('.close').addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('.dismiss').addEventListener('click', () => setDismissed(true));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { panel.hidden = true; tooltip.hidden = true; }
    });

    /* ============================================================
     * 7. UI refresh — grouped by context
     * ============================================================ */
    const escapeHtml = (s) => s.replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function isVisible(node) {
        if (!node.isConnected) return false;
        const el = node.parentElement;
        if (!el) return false;
        if (typeof el.checkVisibility === 'function') {
            try { if (!el.checkVisibility()) return false; }
            catch (_) { /* ignore */ }
        }
        return true;
    }

    function updateUI() {
        if (dismissed) { fab.hidden = panel.hidden = tooltip.hidden = true; return; }

        // Hard-prune detached nodes.
        for (const [range] of matchedRanges) {
            if (range.startContainer.isConnected) continue;
            matchedRanges.delete(range);
            highlight.delete(range);
        }

        // Count visible matches, keyed by term, and remember a first
        // visible range for each term so click-to-scroll works.
        const termCounts = new Map();
        const termFirstRange = new Map();
        for (const [range, frag] of matchedRanges) {
            if (!isVisible(range.startContainer)) continue;
            termCounts.set(frag.match, (termCounts.get(frag.match) || 0) + 1);
            if (!termFirstRange.has(frag.match)) termFirstRange.set(frag.match, range);
        }

        // Group terms by context string.
        const groups = new Map();   // context -> { context, terms: [{term, count}], total, firstRange }
        for (const [term, count] of termCounts) {
            const frag = fragmentByMatch.get(term);
            let group = groups.get(frag.context);
            if (!group) {
                group = { context: frag.context, terms: [], total: 0, firstRange: null };
                groups.set(frag.context, group);
            }
            group.terms.push({ term, count });
            group.total += count;
            if (!group.firstRange) group.firstRange = termFirstRange.get(term);
        }

        if (termCounts.size === 0) { fab.hidden = true; panel.hidden = true; return; }
        fab.hidden = false;
        fab.textContent = `⚠️ ${termCounts.size} term${termCounts.size === 1 ? '' : 's'}`;

        const list = panel.querySelector('.panel-list');
        list.innerHTML = '';
        for (const group of groups.values()) {
            const li = document.createElement('li');
            li.className = 'panel-item';

            const termsHtml = group.terms
                .map(({ term }) => `<span class="term-pill">${escapeHtml(term)}</span>`)
                .join('');

            li.innerHTML = `
                <div class="term">
                    <span class="terms">${termsHtml}</span>
                    <span class="count">${group.total}</span>
                </div>
                <div class="context">${escapeHtml(group.context)}</div>`;

            li.addEventListener('click', () => {
                const r = group.firstRange;
                if (!r || !r.startContainer.isConnected) return;
                r.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            list.appendChild(li);
        }
    }

    /* ============================================================
     * 8. Tooltip
     * ============================================================ */
    function showTooltip(frag, x, y, anchor) {
        const linkHtml = anchor
            ? `<a class="link-action" href="${escapeHtml(anchor.href)}" target="${escapeHtml(anchor.target || '_self')}" rel="noopener noreferrer">Open link →</a>`
            : '';
        tooltip.innerHTML = `
            <div class="term">${escapeHtml(frag.match)}</div>
            <div class="context">${escapeHtml(frag.context)}</div>
            ${linkHtml}`;
        tooltip.hidden = false;
        const rect = tooltip.getBoundingClientRect();
        let left = Math.min(x + 12, window.innerWidth - rect.width - 8);
        let top  = y + 12;
        if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 12;
        tooltip.style.left = Math.max(8, left) + 'px';
        tooltip.style.top  = Math.max(8, top)  + 'px';
        tooltip.querySelectorAll('a.link-action').forEach(a => {
            a.addEventListener('click', (ev) => ev.stopPropagation());
        });
    }
    const hideTooltip = () => { tooltip.hidden = true; };
    window.addEventListener('scroll', hideTooltip, { passive: true, capture: true });

    /* ============================================================
     * 9. Click detection
     * ============================================================ */
    function getCaretAt(x, y) {
        if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
        if (document.caretPositionFromPoint) {
            const p = document.caretPositionFromPoint(x, y);
            if (!p) return null;
            const r = document.createRange();
            r.setStart(p.offsetNode, p.offset);
            r.collapse(true);
            return r;
        }
        return null;
    }

    document.addEventListener('click', (e) => {
        if (e.composedPath().includes(host)) return;
        const caret = getCaretAt(e.clientX, e.clientY);
        if (!caret) { hideTooltip(); return; }
        const { startContainer: node, startOffset: offset } = caret;
        for (const [range, frag] of matchedRanges) {
            if (range.comparePoint(node, offset) !== 0) continue;
            const anchor = node.parentElement?.closest('a[href]') || null;
            if (anchor) e.preventDefault();
            showTooltip(frag, e.clientX, e.clientY, anchor);
            return;
        }
        hideTooltip();
    }, true);

    /* ============================================================
     * 10. Scan primitives
     * ============================================================ */
    const SKIP_CLOSEST = 'script, style, noscript, textarea, [contenteditable=""], [contenteditable="true"]';

    function processTextNode(node) {
        if (scannedTextNodes.has(node)) return false;
        const parent = node.parentElement;
        if (!parent) return false;
        if (parent.closest(SKIP_CLOSEST)) return false;
        scannedTextNodes.add(node);

        const text = node.data;
        if (!text) return false;

        let added = false;
        let i = 0;
        while (i < text.length) {
            const cp = text.codePointAt(i);
            const candidates = fragmentsByFirstCodepoint.get(cp);
            if (candidates) {
                for (const { index, pattern } of candidates) {
                    if (text.startsWith(pattern, i)) {
                        const range = new Range();
                        range.setStart(node, i);
                        range.setEnd(node, i + pattern.length);
                        matchedRanges.set(range, fragments[index]);
                        highlight.add(range);
                        added = true;
                    }
                }
            }
            i += cp > 0xFFFF ? 2 : 1;
        }
        return added;
    }

    function removeRangesFor(textNode) {
        for (const [range] of matchedRanges) {
            if (range.startContainer !== textNode) continue;
            matchedRanges.delete(range);
            highlight.delete(range);
        }
    }

    function unmarkSubtree(root) {
        if (!root) return false;
        if (root.nodeType === Node.TEXT_NODE) {
            if (!scannedTextNodes.has(root)) return false;
            removeRangesFor(root);
            scannedTextNodes.delete(root);
            return true;
        }
        if (root.nodeType !== Node.ELEMENT_NODE) return false;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n, any = false;
        while ((n = walker.nextNode())) {
            if (!scannedTextNodes.has(n)) continue;
            removeRangesFor(n);
            scannedTextNodes.delete(n);
            any = true;
        }
        return any;
    }

    function handleCharacterData(textNode) {
        if (!textNode.isConnected) return false;
        if (scannedTextNodes.has(textNode)) {
            removeRangesFor(textNode);
            scannedTextNodes.delete(textNode);
        }
        return processTextNode(textNode);
    }

    function scan(root) {
        if (!root || host.contains(root)) return;
        if (root.nodeType === Node.TEXT_NODE) {
            if (processTextNode(root)) updateUI();
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => scannedTextNodes.has(n)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT
        });

        let added = false;
        const step = () => {
            let node, n = 0;
            while ((node = walker.nextNode())) {
                if (processTextNode(node)) added = true;
                n++;
                if (n >= 200 || (n % 20 === 0 && shouldYield())) {
                    scheduleWork(step);
                    return;
                }
            }
            if (added) updateUI();
        };
        step();
    }

    /* ============================================================
     * 11. SPA navigation detection
     * ============================================================ */
    function urlKey(url) {
        try {
            const u = new URL(url, location.href);
            return u.origin + u.pathname + u.search;
        } catch (_) {
            return url;
        }
    }
    let lastUrlKey = urlKey(location.href);

    function resetForNavigation(reason) {
        console.log('[DH] SPA navigation reset:', reason, '→', location.href);
        matchedRanges.clear();
        highlight = new Highlight();
        CSS.highlights.set(HIGHLIGHT_NAME, highlight);
        scannedTextNodes = new WeakSet();
        fab.hidden = true;
        panel.hidden = true;
        tooltip.hidden = true;
        scheduleWork(() => { scan(document.body); updateUI(); });
        setTimeout(() => { scan(document.body); updateUI(); }, 800);
    }

    function checkNav() {
        const key = urlKey(location.href);
        if (key === lastUrlKey) return;
        lastUrlKey = key;
        resetForNavigation('url change');
    }

    try {
        const origPush = history.pushState;
        history.pushState = function (...args) {
            const r = origPush.apply(this, args);
            queueMicrotask(checkNav);
            return r;
        };
        const origReplace = history.replaceState;
        history.replaceState = function (...args) {
            const r = origReplace.apply(this, args);
            queueMicrotask(checkNav);
            return r;
        };
    } catch (_) {}

    window.addEventListener('popstate', checkNav);
    window.addEventListener('hashchange', checkNav);
    document.addEventListener('click', () => queueMicrotask(checkNav), { passive: true, capture: true });
    document.addEventListener('keyup', () => queueMicrotask(checkNav), { passive: true, capture: true });

    /* ============================================================
     * 12. Mutation observer
     * ============================================================ */
    const observer = new MutationObserver((mutations) => {
        scheduleWork(() => {
            let changed = false;
            for (const m of mutations) {
                if (m.type === 'characterData') {
                    if (handleCharacterData(m.target)) changed = true;
                    continue;
                }
                for (const n of m.removedNodes) {
                    if (n === host) continue;
                    if (unmarkSubtree(n)) changed = true;
                }
                for (const n of m.addedNodes) {
                    if (n === host) continue;
                    if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) {
                        scan(n);
                        changed = true;
                    }
                }
            }
            if (changed) updateUI();
        });
    });

    /* ============================================================
     * 13. Boot
     * ============================================================ */
    scheduleWork(() => {
        scan(document.body);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    });

    /* ============================================================
     * 14. Diagnostics
     * ============================================================ */
    window.__dhDebug = () => {
        console.group('[DH] Dogwhistle Highlighter diagnostics');
        console.log('config entries:', configFragments.length);
        console.log('expanded terms:', fragments.length);
        console.log('first-codepoint buckets:', fragmentsByFirstCodepoint.size);
        console.log('matchedRanges (total):', matchedRanges.size);
        console.log('last URL key:', lastUrlKey);
        console.log('current URL key:', urlKey(location.href));

        let visible = 0, hidden = 0, detached = 0;
        const visibleTerms = new Set();
        const visibleContexts = new Set();
        for (const [range, frag] of matchedRanges) {
            if (!range.startContainer.isConnected) { detached++; continue; }
            if (isVisible(range.startContainer)) {
                visible++;
                visibleTerms.add(frag.match);
                visibleContexts.add(frag.context);
            } else hidden++;
        }
        console.log(`ranges: visible=${visible} hidden=${hidden} detached=${detached}`);
        console.log(`distinct terms (visible): ${visibleTerms.size}`);
        console.log(`distinct contexts (visible): ${visibleContexts.size}`);

        const tagAnchors = document.querySelectorAll(
            'a.tag, .post_tags a, .post-footer a, [class*="tag"] a, footer a'
        );
        console.log('tag-like anchors found:', tagAnchors.length);
        tagAnchors.forEach((a, i) => {
            const text = a.textContent || '';
            const hits = fragments.filter(f => text.includes(f.match));
            const isScanned = [...a.childNodes]
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .every(n => scannedTextNodes.has(n));
            console.log(
                `[${i}] text=${JSON.stringify(text)}`,
                `hits=${hits.length}`,
                `text-node-scanned=${isScanned}`,
                `visible=${isVisible(a)}`
            );
        });
        console.groupEnd();
    };
})();
