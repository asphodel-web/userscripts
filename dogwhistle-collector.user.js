// ==UserScript==
// @name         Dogwhistle Highlighter: Collector
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Collect dogwhistle terms from pages, edit contexts, export as JSON
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'dh-collector-data';
    const UI_ATTR = 'data-dhc-ui';
    const LOG = '[DHC]';

    // ============================================================
    // Storage
    // ============================================================
    function uid(prefix) {
        return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
    }

    function loadData() {
        try {
            let raw = (typeof GM_getValue === 'function')
                ? GM_getValue(STORAGE_KEY, null)
                : localStorage.getItem(STORAGE_KEY);
            if (!raw) return { groups: [] };
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!parsed || !Array.isArray(parsed.groups)) return { groups: [] };
            parsed.groups = parsed.groups
                .filter(g => g && Array.isArray(g.terms))
                .map(g => ({
                    id: g.id || uid('g'),
                    context: typeof g.context === 'string' ? g.context : '',
                    terms: g.terms
                        .filter(t => t && typeof t.term === 'string' && t.term.length > 0)
                        .map(t => ({
                            id: t.id || uid('t'),
                            term: t.term,
                            source: t.source || '',
                            added: t.added || Date.now(),
                        }))
                }))
                .filter(g => g.terms.length > 0);
            return parsed;
        } catch (e) {
            console.error(LOG, 'load failed', e);
            return { groups: [] };
        }
    }

    function saveData() {
        try {
            const serialized = JSON.stringify(data);
            if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, serialized);
            else localStorage.setItem(STORAGE_KEY, serialized);
        } catch (e) {
            console.error(LOG, 'save failed', e);
        }
    }

    let data = loadData();

    // ============================================================
    // Style (all inside shadow root — never touches page CSS)
    // ============================================================
    const STYLE = `
        :host { all: initial; }
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

        .fab {
            position: fixed; left: 20px; bottom: 20px; z-index: 2147483646;
            width: 48px; height: 48px; border-radius: 50%;
            background: #1976d2; color: #fff; border: none; cursor: pointer;
            font-size: 20px; box-shadow: 0 4px 12px rgba(0,0,0,.25);
            display: flex; align-items: center; justify-content: center;
            transition: transform .15s;
        }
        .fab:hover { transform: scale(1.08); }

        .toolbar {
            position: fixed; z-index: 2147483647;
            display: flex; gap: 4px;
            background: #222; border-radius: 6px; padding: 4px;
            box-shadow: 0 4px 16px rgba(0,0,0,.4);
        }
        .toolbar[hidden] { display: none; }
        .toolbar button {
            background: none; border: none; color: #fff;
            padding: 6px 12px; border-radius: 4px; cursor: pointer;
            font-size: 12px; font-weight: 600;
        }
        .toolbar button:hover { background: #444; }

        .panel {
            position: fixed; top: 20px; left: 20px; z-index: 2147483647;
            width: 420px; max-width: calc(100vw - 40px);
            max-height: calc(100vh - 100px);
            background: #fff; color: #222; border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0,0,0,.3);
            display: flex; flex-direction: column; overflow: hidden;
        }
        .panel[hidden] { display: none; }
        .panel-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; background: #1976d2; color: #fff;
        }
        .panel-title { font-weight: 600; font-size: 14px; }
        .panel-header button {
            background: none; border: none; cursor: pointer;
            color: #fff; font-size: 20px; padding: 0 4px; line-height: 1;
        }
        .panel-body { padding: 12px 16px; overflow-y: auto; flex: 1; }

        .hint {
            font-size: 11px; color: #666; padding: 8px 12px;
            background: #f5f5f5; border-radius: 6px; margin-bottom: 12px;
            line-height: 1.4;
        }

        .add-form {
            background: #e3f2fd; border-radius: 8px;
            padding: 12px; margin-bottom: 12px;
            border: 1px solid #90caf9;
        }
        .add-form[hidden] { display: none; }
        .add-form-title { font-size: 13px; margin-bottom: 8px; color: #222; }
        .add-form-title strong {
            background: #fff; padding: 2px 6px; border-radius: 4px;
            font-family: ui-monospace, SFMono-Regular, monospace;
            word-break: break-all;
        }
        .add-form select, .add-form textarea {
            width: 100%; padding: 8px; border: 1px solid #ccc;
            border-radius: 6px; font-size: 13px; margin-bottom: 8px;
            background: #fff; font-family: inherit;
        }
        .add-form textarea { min-height: 60px; resize: vertical; }
        .add-actions { display: flex; gap: 8px; }

        .btn {
            padding: 6px 12px; border-radius: 6px; cursor: pointer;
            font-size: 13px; border: none; font-weight: 500;
        }
        .btn-primary { background: #1976d2; color: #fff; }
        .btn-primary:hover { background: #1565c0; }
        .btn-secondary { background: #e0e0e0; color: #222; }
        .btn-secondary:hover { background: #d5d5d5; }
        .btn-danger { background: #c62828; color: #fff; }
        .btn-danger:hover { background: #b71c1c; }
        .btn-link {
            background: none; border: none; color: #1976d2;
            cursor: pointer; text-decoration: underline;
            font-size: 12px; padding: 0;
        }
        .btn-link.danger { color: #c62828; }

        .manual-add { display: flex; gap: 6px; margin-bottom: 12px; }
        .manual-add input {
            flex: 1; padding: 8px; border: 1px solid #ccc;
            border-radius: 6px; font-size: 13px;
        }

        .groups-count {
            font-size: 11px; color: #888; margin-bottom: 8px;
            text-transform: uppercase; letter-spacing: .5px;
        }

        .group {
            border: 1px solid #e0e0e0; border-radius: 8px;
            padding: 12px; margin-bottom: 10px; background: #fafafa;
        }
        .group-context {
            font-size: 12px; color: #333; margin-bottom: 8px;
            cursor: text; line-height: 1.4; white-space: pre-wrap;
            padding: 4px; margin-left: -4px; border-radius: 4px;
        }
        .group-context:hover { background: #e8f4fc; }
        .group-context.empty { color: #999; font-style: italic; }
        .group-context-edit {
            width: 100%; min-height: 60px; padding: 6px;
            border: 1px solid #1976d2; border-radius: 4px;
            font-size: 12px; font-family: inherit; resize: vertical;
            margin-bottom: 8px;
        }

        .terms-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
        .term-chip {
            display: inline-flex; align-items: center; gap: 2px;
            background: #fff; border: 1px solid #ddd;
            padding: 3px 4px 3px 8px; border-radius: 999px;
            font-size: 12px;
        }
        .term-chip .term-text {
            cursor: pointer; user-select: all;
            padding: 0 2px;
        }
        .term-chip .term-text:hover { color: #1976d2; }
        .term-chip .term-del {
            background: none; border: none; cursor: pointer;
            color: #999; padding: 0 4px; font-size: 14px; line-height: 1;
        }
        .term-chip .term-del:hover { color: #c62828; }

        .group-actions { margin-top: 4px; }

        .io-section {
            margin-top: 16px; padding-top: 12px;
            border-top: 1px solid #eee;
        }
        .io-section h3 {
            font-size: 11px; text-transform: uppercase; letter-spacing: .5px;
            color: #666; margin: 0 0 8px 0;
        }
        .io-section textarea {
            width: 100%; padding: 8px; border: 1px solid #ccc;
            border-radius: 6px; font-size: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            min-height: 100px; resize: vertical; margin-bottom: 8px;
            background: #fafafa;
        }
        .io-actions { display: flex; gap: 8px; flex-wrap: wrap; }

        .toast {
            position: fixed; top: 20px; right: 20px; z-index: 2147483647;
            padding: 10px 16px; border-radius: 6px;
            background: #222; color: #fff; font-size: 13px;
            box-shadow: 0 4px 16px rgba(0,0,0,.4);
            opacity: 0; transform: translateY(-10px);
            transition: opacity .2s, transform .2s;
            pointer-events: none; max-width: 400px;
        }
        .toast.show { opacity: 1; transform: translateY(0); }
        .toast.error { background: #c62828; }
        .toast.success { background: #2e7d32; }
    `;

    // ============================================================
    // UI construction
    // ============================================================
    const host = document.createElement('div');
    host.setAttribute(UI_ATTR, '');
    host.style.cssText = 'all: initial;';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);

    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.setAttribute('aria-label', 'Open Dogwhistle Collector');
    fab.title = 'Dogwhistle Collector (Alt+Shift+D)';
    fab.textContent = '📌';
    shadow.appendChild(fab);

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.hidden = true;
    toolbar.innerHTML = `<button class="tb-add">+ Add term</button>`;
    shadow.appendChild(toolbar);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.hidden = true;
    panel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title">Dogwhistle Collector</span>
            <button class="panel-close" aria-label="Close">×</button>
        </div>
        <div class="panel-body">
            <div class="hint">
                Select text on the page and click "+ Add term" to collect it.
                Click a context to edit it. Click a term chip to copy it.
            </div>
            <div class="add-form" hidden>
                <div class="add-form-title">Adding: <strong class="pending-term"></strong></div>
                <select class="context-select">
                    <option value="">— new context —</option>
                </select>
                <textarea class="context-new" placeholder="Describe what this term means and how it's used..."></textarea>
                <div class="add-actions">
                    <button class="btn btn-primary btn-add-confirm">Add</button>
                    <button class="btn btn-secondary btn-add-cancel">Cancel</button>
                </div>
            </div>
            <div class="manual-add">
                <input type="text" class="manual-term" placeholder="Or type a term manually...">
                <button class="btn btn-primary btn-manual-add">Add</button>
            </div>
            <div class="groups-count"></div>
            <div class="groups-list"></div>
            <div class="io-section">
                <h3>Export</h3>
                <textarea class="export-out" readonly placeholder="(no groups yet)"></textarea>
                <div class="io-actions">
                    <button class="btn btn-secondary btn-export-copy">Copy JSON</button>
                </div>
            </div>
            <div class="io-section">
                <h3>Import</h3>
                <textarea class="import-in" placeholder='Paste JSON here — e.g. [{ "match": ["😭💢"], "context": "..." }]'></textarea>
                <div class="io-actions">
                    <button class="btn btn-primary btn-import-merge">Merge into collection</button>
                    <button class="btn btn-danger btn-import-replace">Replace all</button>
                </div>
            </div>
        </div>
    `;
    shadow.appendChild(panel);

    const toast = document.createElement('div');
    toast.className = 'toast';
    shadow.appendChild(toast);

    document.body.appendChild(host);

    // ============================================================
    // Small helpers
    // ============================================================
    let pendingTerm = null;
    let pendingSource = '';

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function findGroupByContext(context) {
        return data.groups.find(g => g.context === context);
    }

    function findTerm(term) {
        for (const g of data.groups) {
            const t = g.terms.find(x => x.term === term);
            if (t) return { group: g, term: t };
        }
        return null;
    }

    function showToast(msg, kind) {
        toast.textContent = msg;
        toast.className = 'toast show' + (kind ? ' ' + kind : '');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.className = 'toast'; }, 2200);
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                () => showToast(`Copied: ${text.length > 40 ? text.slice(0, 40) + '…' : text}`, 'success'),
                () => showToast('Copy failed', 'error')
            );
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); showToast('Copied', 'success'); }
            catch (_) { showToast('Copy failed', 'error'); }
            document.body.removeChild(ta);
        }
    }

    // ============================================================
    // Render
    // ============================================================
    function renderGroups() {
        const list = panel.querySelector('.groups-list');
        const countEl = panel.querySelector('.groups-count');
        const exportOut = panel.querySelector('.export-out');

        list.innerHTML = '';

        const nonEmpty = data.groups.filter(g => g.terms.length > 0);
        const totalTerms = nonEmpty.reduce((n, g) => n + g.terms.length, 0);
        countEl.textContent = nonEmpty.length === 0
            ? 'No terms yet — select text on the page to start.'
            : `${nonEmpty.length} group${nonEmpty.length === 1 ? '' : 's'} · ${totalTerms} term${totalTerms === 1 ? '' : 's'}`;

        for (const group of nonEmpty) {
            const el = document.createElement('div');
            el.className = 'group';
            el.dataset.groupId = group.id;

            const ctxEl = document.createElement('div');
            ctxEl.className = 'group-context' + (group.context ? '' : ' empty');
            ctxEl.textContent = group.context || '(click to add context)';
            ctxEl.title = 'Click to edit context';
            ctxEl.addEventListener('click', () => editContext(group, ctxEl), { once: true });
            el.appendChild(ctxEl);

            const termsList = document.createElement('div');
            termsList.className = 'terms-list';
            for (const t of group.terms) {
                const chip = document.createElement('div');
                chip.className = 'term-chip';
                chip.innerHTML = `
                    <span class="term-text" title="Click to copy"></span>
                    <button class="term-del" aria-label="Remove term">×</button>
                `;
                chip.querySelector('.term-text').textContent = t.term;
                chip.querySelector('.term-text').addEventListener('click', () => copyToClipboard(t.term));
                chip.querySelector('.term-del').addEventListener('click', () => {
                    group.terms = group.terms.filter(x => x.id !== t.id);
                    if (group.terms.length === 0) {
                        data.groups = data.groups.filter(g => g.id !== group.id);
                    }
                    saveData();
                    renderGroups();
                });
                termsList.appendChild(chip);
            }
            el.appendChild(termsList);

            const actions = document.createElement('div');
            actions.className = 'group-actions';
            const delGroupBtn = document.createElement('button');
            delGroupBtn.className = 'btn-link danger';
            delGroupBtn.textContent = `Delete group (${group.terms.length} term${group.terms.length === 1 ? '' : 's'})`;
            delGroupBtn.addEventListener('click', () => {
                if (!confirm('Delete this entire group and its terms?')) return;
                data.groups = data.groups.filter(g => g.id !== group.id);
                saveData();
                renderGroups();
            });
            actions.appendChild(delGroupBtn);
            el.appendChild(actions);

            list.appendChild(el);
        }

        exportOut.value = JSON.stringify(buildExport(), null, 2);
    }

    function editContext(group, ctxEl) {
        const editor = document.createElement('textarea');
        editor.className = 'group-context-edit';
        editor.value = group.context;
        ctxEl.replaceWith(editor);
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);

        let done = false;
        const finish = (save) => {
            if (done) return;
            done = true;
            if (save) {
                const newContext = editor.value.trim();
                // If another group already has this context, merge into it.
                const duplicate = newContext && data.groups.find(
                    g => g.id !== group.id && g.context === newContext
                );
                if (duplicate) {
                    for (const t of group.terms) {
                        if (!duplicate.terms.find(x => x.term === t.term)) {
                            duplicate.terms.push(t);
                        }
                    }
                    data.groups = data.groups.filter(g => g.id !== group.id);
                } else {
                    group.context = newContext;
                }
                saveData();
            }
            renderGroups();
        };

        editor.addEventListener('blur', () => finish(true));
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); finish(false); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
        });
    }

    // ============================================================
    // Add term flow
    // ============================================================
    function showAddForm(term, source) {
        pendingTerm = term;
        pendingSource = source || location.href;

        const form = panel.querySelector('.add-form');
        const select = panel.querySelector('.context-select');
        const textarea = panel.querySelector('.context-new');

        form.querySelector('.pending-term').textContent = term;

        select.innerHTML = '<option value="">— new context —</option>';
        const contexts = [...new Set(data.groups.map(g => g.context).filter(Boolean))];
        for (const c of contexts) {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c.length > 60 ? c.slice(0, 60) + '…' : c;
            opt.title = c;
            select.appendChild(opt);
        }
        select.value = '';
        textarea.value = '';
        textarea.hidden = false;

        form.hidden = false;
        textarea.focus();
    }

    function hideAddForm() {
        panel.querySelector('.add-form').hidden = true;
        pendingTerm = null;
        pendingSource = '';
    }

    function confirmAdd() {
        if (!pendingTerm) return;
        const select = panel.querySelector('.context-select');
        const textarea = panel.querySelector('.context-new');
        const context = (select.value || textarea.value).trim();

        if (!context) {
            showToast('Please pick or enter a context', 'error');
            textarea.focus();
            return;
        }

        const existing = findTerm(pendingTerm);
        if (existing) {
            showToast(`Term already exists in "${existing.group.context.slice(0, 40)}…"`, 'error');
            return;
        }

        let group = findGroupByContext(context);
        if (!group) {
            group = { id: uid('g'), context, terms: [] };
            data.groups.push(group);
        }
        group.terms.push({
            id: uid('t'),
            term: pendingTerm,
            source: pendingSource,
            added: Date.now(),
        });

        saveData();
        renderGroups();
        hideAddForm();
        showToast(`Added "${pendingTerm}"`, 'success');
        window.getSelection()?.removeAllRanges();
        hideToolbar();
    }

    // ============================================================
    // Selection detection
    // ============================================================
    let selectionTimer = null;

    function checkSelection() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideToolbar(); return; }

        const range = sel.getRangeAt(0);
        const text = range.toString().trim();
        if (!text) { hideToolbar(); return; }
        if (text.length > 200) { hideToolbar(); return; }

        // Ignore selections inside our own UI (light DOM or shadow content)
        const anc = range.commonAncestorContainer;
        if (host.contains(anc)) { hideToolbar(); return; }
        try { if (anc.getRootNode() === shadow) { hideToolbar(); return; } } catch (_) {}

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) { hideToolbar(); return; }

        showToolbar(text, rect);
    }

    function showToolbar(text, rect) {
        toolbar.hidden = false;
        // getBoundingClientRect after un-hiding to know our width
        const tbRect = toolbar.getBoundingClientRect();
        let top = rect.top - tbRect.height - 8;
        if (top < 8) top = rect.bottom + 8;
        let left = rect.left + rect.width / 2 - tbRect.width / 2;
        if (left < 8) left = 8;
        if (left + tbRect.width > window.innerWidth - 8) {
            left = window.innerWidth - tbRect.width - 8;
        }
        toolbar.style.top = top + 'px';
        toolbar.style.left = left + 'px';
        toolbar.dataset.selectionText = text;
    }

    function hideToolbar() {
        toolbar.hidden = true;
        delete toolbar.dataset.selectionText;
    }

    document.addEventListener('selectionchange', () => {
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(checkSelection, 150);
    }, true);

    window.addEventListener('scroll', hideToolbar, { passive: true, capture: true });

    // ============================================================
    // Toolbar + manual-add actions
    // ============================================================
    toolbar.querySelector('.tb-add').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = toolbar.dataset.selectionText;
        if (!text) return;
        const existing = findTerm(text);
        if (existing) {
            showToast(`Already collected in "${existing.group.context.slice(0, 40)}…"`, 'error');
            hideToolbar();
            return;
        }
        openPanel();
        showAddForm(text, location.href);
        hideToolbar();
    });

    panel.querySelector('.btn-manual-add').addEventListener('click', () => {
        const input = panel.querySelector('.manual-term');
        const term = input.value.trim();
        if (!term) { showToast('Enter a term first', 'error'); input.focus(); return; }
        const existing = findTerm(term);
        if (existing) {
            showToast(`Already collected in "${existing.group.context.slice(0, 40)}…"`, 'error');
            return;
        }
        input.value = '';
        showAddForm(term, location.href);
    });

    panel.querySelector('.manual-term').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            panel.querySelector('.btn-manual-add').click();
        }
    });

    panel.querySelector('.context-select').addEventListener('change', (e) => {
        const textarea = panel.querySelector('.context-new');
        if (e.target.value) {
            textarea.value = '';
            textarea.hidden = true;
        } else {
            textarea.hidden = false;
            textarea.focus();
        }
    });

    panel.querySelector('.btn-add-confirm').addEventListener('click', confirmAdd);
    panel.querySelector('.btn-add-cancel').addEventListener('click', hideAddForm);

    // ============================================================
    // Panel open/close
    // ============================================================
    function openPanel() { panel.hidden = false; renderGroups(); }
    function closePanel() { panel.hidden = true; hideAddForm(); }

    fab.addEventListener('click', () => panel.hidden ? openPanel() : closePanel());
    panel.querySelector('.panel-close').addEventListener('click', closePanel);

    // ============================================================
    // Import / Export
    // ============================================================
    function buildExport() {
        return data.groups
            .filter(g => g.terms.length > 0 && g.context)
            .map(g => ({
                match: g.terms.map(t => t.term),
                context: g.context,
            }));
    }

    panel.querySelector('.btn-export-copy').addEventListener('click', () => {
        const out = panel.querySelector('.export-out').value;
        if (!out || out === '[]') { showToast('Nothing to copy', 'error'); return; }
        copyToClipboard(out);
    });

    function importData(jsonStr, replace) {
        const parsed = JSON.parse(jsonStr);
        const entries = Array.isArray(parsed) ? parsed : [parsed];

        const newGroups = [];
        let addedTerms = 0;
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;
            const termsRaw = Array.isArray(entry.match) ? entry.match : [entry.match];
            const context = typeof entry.context === 'string' ? entry.context : '';
            const terms = termsRaw.filter(t => typeof t === 'string' && t.length > 0);
            if (terms.length === 0) continue;
            newGroups.push({
                id: uid('g'),
                context,
                terms: terms.map(t => ({
                    id: uid('t'),
                    term: t,
                    source: '',
                    added: Date.now(),
                })),
            });
            addedTerms += terms.length;
        }

        if (replace) {
            data.groups = newGroups;
        } else {
            for (const ng of newGroups) {
                const existing = findGroupByContext(ng.context);
                if (existing) {
                    for (const t of ng.terms) {
                        if (!existing.terms.find(x => x.term === t.term)) {
                            existing.terms.push(t);
                        }
                    }
                } else {
                    data.groups.push(ng);
                }
            }
        }

        saveData();
        renderGroups();
        showToast(
            `${replace ? 'Replaced with' : 'Merged'} ${newGroups.length} group(s), ${addedTerms} term(s)`,
            'success'
        );
    }

    panel.querySelector('.btn-import-merge').addEventListener('click', () => {
        const json = panel.querySelector('.import-in').value.trim();
        if (!json) { showToast('Paste JSON first', 'error'); return; }
        try { importData(json, false); panel.querySelector('.import-in').value = ''; }
        catch (e) { showToast('Import failed: ' + e.message, 'error'); }
    });

    panel.querySelector('.btn-import-replace').addEventListener('click', () => {
        const json = panel.querySelector('.import-in').value.trim();
        if (!json) { showToast('Paste JSON first', 'error'); return; }
        if (!confirm('Replace ALL existing groups and terms with the imported data?')) return;
        try { importData(json, true); panel.querySelector('.import-in').value = ''; }
        catch (e) { showToast('Import failed: ' + e.message, 'error'); }
    });

    // ============================================================
    // Keyboard shortcut
    // ============================================================
    document.addEventListener('keydown', (e) => {
        if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
        if (e.code !== 'KeyD' && e.key !== 'D' && e.key !== 'd') return;
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
        e.preventDefault();
        panel.hidden ? openPanel() : closePanel();
    }, true);

    // ============================================================
    // Menu commands
    // ============================================================
    try {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Open Dogwhistle Collector', openPanel);
            GM_registerMenuCommand('Log JSON export to console', () => {
                console.log('[DHC] Export:', JSON.stringify(buildExport(), null, 2));
            });
            GM_registerMenuCommand('Clear all collector data', () => {
                if (!confirm('Delete all collected groups and terms? This cannot be undone.')) return;
                data.groups = [];
                saveData();
                renderGroups();
                showToast('All data cleared', 'success');
            });
        }
    } catch (_) {}

    // ============================================================
    // Init
    // ============================================================
    console.log(LOG, 'Collector ready. Click 📌 (bottom-left) or press Alt+Shift+D.');
    renderGroups();
})();
