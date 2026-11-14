// ==UserScript==
// @name         Duolingo Path Viewer + Forecast
// @namespace    https://github.com/duolingo-path-viewer
// @version      2.2.0
// @description  Full path preview, forecast, planning, milestones, exports, streak analytics.
// @match        https://www.duolingo.com/*
// @match        https://*.duolingo.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    if (window.__duoPathViewerLoaded) return;
    window.__duoPathViewerLoaded = true;

    // ---------- Auth capture ----------
    const authCapture = { token: null };
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url && url.includes('duolingo.com')) {
                let auth = null;
                const h = init && init.headers;
                if (h) {
                    if (h instanceof Headers) auth = h.get('authorization');
                    else if (Array.isArray(h)) { const f = h.find(x => x[0] && x[0].toLowerCase() === 'authorization'); if (f) auth = f[1]; }
                    else auth = h.Authorization || h.authorization;
                }
                if (!auth && input instanceof Request) auth = input.headers.get('authorization');
                if (auth && !authCapture.token) authCapture.token = auth;
            }
        } catch (e) {}
        return origFetch.apply(this, arguments);
    };
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (name && name.toLowerCase() === 'authorization' && value && !authCapture.token) authCapture.token = value;
        return origSetHeader.apply(this, arguments);
    };

    // ---------- Constants ----------
    const COMPLETE_STATES = new Set(['legendary', 'passed', 'gold', 'complete', 'completed']);
    const DAY = 86400000;
    const AVG_XP_PER_SESSION = 15;
    const JUMP_TYPES = new Set(['skill', 'practice', 'story', 'duo_radio']);
    const THEME_KEY = 'duo-path-viewer-theme';
    const PLAN_KEY = 'duo-path-viewer-plan';
    const SNAPSHOT_KEY = 'duo-path-viewer-snapshot';
    const GOAL_KEY = 'duo-path-viewer-daily-goal';
    const TYPE_LABELS = { all: 'All types', skill: 'Skills', story: 'Stories', duo_radio: 'Radio', practice: 'Practice', unit_review: 'Unit reviews', chest: 'Chests' };
    const STATE_LABELS = { all: 'All states', incomplete: 'Incomplete', complete: 'Complete', locked: 'Locked', 'in-progress': 'In progress' };

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const roundRect = (ctx, x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    };
    const localDateStr = (d) => {
        d = d || new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const daysAgoLocal = (dateStr) => {
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        const [y, m, d] = dateStr.split('-').map(Number);
        const then = new Date(y, m-1, d, 12, 0, 0, 0);
        return Math.round((today - then) / DAY);
    };

    // ---------- Path helpers ----------
    const levelSessions = l => {
        const total = l.totalSessions || 0;
        const done = COMPLETE_STATES.has(l.state) ? total : (l.finishedSessions || 0);
        return { done, total };
    };
    const levelRemaining = l => { const r = levelSessions(l); return Math.max(0, r.total - r.done); };
    const unitSessions = u => (u.levels || []).reduce((a, l) => { const r = levelSessions(l); return { done: a.done + r.done, total: a.total + r.total }; }, { done: 0, total: 0 });
    const unitRemaining = u => (u.levels || []).reduce((a, l) => a + levelRemaining(l), 0);
    const sectionSessions = s => (s.units || []).reduce((a, u) => { const r = unitSessions(u); return { done: a.done + r.done, total: a.total + r.total }; }, { done: 0, total: 0 });
    const sectionRemaining = s => (s.units || []).reduce((a, u) => a + unitRemaining(u), 0);
    const totalSessions = secs => secs.reduce((a, s) => { const r = sectionSessions(s); return { done: a.done + r.done, total: a.total + r.total }; }, { done: 0, total: 0 });
    const isComplete = r => r.total > 0 && r.done >= r.total;
    const fmtDays = d => !isFinite(d) ? '∞' : d < 1 ? '<1 day' : `${Math.ceil(d)} days`;
    const forecastDate = d => {
        if (!isFinite(d)) return '—';
        return localDateStr(new Date(Date.now() + d * DAY));
    };

    const findNextNode = (sections) => {
        for (const sec of sections) for (const u of sec.units || []) {
            if (u.isUnlocked === false) continue;
            for (const l of u.levels || []) {
                if (COMPLETE_STATES.has(l.state)) continue;
                if (l.state === 'locked') continue;
                return { section: sec, unit: u, level: l };
            }
        }
        return null;
    };
    const findCurrentPosition = (sections) => {
        for (const sec of sections) for (const u of sec.units || []) {
            const rem = unitRemaining(u);
            if (rem > 0) return { section: sec, unit: u, remaining: rem };
        }
        return null;
    };

    // ---------- State decode ----------
    const decodeState = async () => {
        const raw = localStorage.getItem('duo.state');
        if (!raw) throw new Error('duo.state not found. Log in and reload.');
        let payload = JSON.parse(raw);
        if (typeof payload !== 'string') payload = payload && (payload.state || payload.data);
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

    const findPathSectioned = (state) => {
        const cc = state && state.state && state.state.user && state.state.user.currentCourse;
        if (cc && Array.isArray(cc.pathSectioned)) return cc.pathSectioned;
        const s = (obj, depth) => {
            if (!obj || typeof obj !== 'object' || depth > 20) return null;
            if (Array.isArray(obj.pathSectioned)) return obj.pathSectioned;
            for (const k of Object.keys(obj)) { const r = s(obj[k], depth + 1); if (r) return r; }
            return null;
        };
        return s(state, 0);
    };

    const decodeJwtPayload = (token) => {
        try {
            const jwt = String(token).replace(/^Bearer\s+/i, '');
            const parts = jwt.split('.');
            if (parts.length < 2) return null;
            let p = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (p.length % 4) p += '=';
            return JSON.parse(atob(p));
        } catch (e) { return null; }
    };
    const userIdFromJwt = (token) => {
        const p = decodeJwtPayload(token);
        if (!p) return null;
        for (const k of ['sub', 'user_id', 'userId', 'uid', 'id']) {
            const n = Number(p[k]);
            if (isFinite(n) && n > 0) return n;
        }
        return null;
    };
    const findUserId = (state, token) => {
        const num = v => { const x = Number(v); return isFinite(x) && x > 0 ? x : null; };
        const tries = [
            state?.state?.user?.id, state?.state?.user?.userId, state?.state?.user?.user_id, state?.state?.user?.uid,
            state?.state?.userId, state?.state?.user_id, state?.user?.id, state?.user?.userId, state?.userId,
        ];
        for (const v of tries) { const x = num(v); if (x) return x; }
        const seen = new Set();
        const searchKey = (obj, depth) => {
            if (!obj || typeof obj !== 'object' || depth > 14 || seen.has(obj)) return null;
            seen.add(obj);
            for (const k of Object.keys(obj)) if ((k === 'userId' || k === 'user_id' || k === 'uid') && num(obj[k])) return num(obj[k]);
            for (const k of Object.keys(obj)) { const r = searchKey(obj[k], depth + 1); if (r) return r; }
            return null;
        };
        const sk = searchKey(state, 0);
        if (sk) return sk;
        const seen2 = new Set();
        const searchUserObj = (obj, depth) => {
            if (!obj || typeof obj !== 'object' || depth > 14 || seen2.has(obj)) return null;
            seen2.add(obj);
            if (num(obj.id) && (typeof obj.username === 'string' || typeof obj.learningLanguage === 'string' || typeof obj.email === 'string')) return num(obj.id);
            for (const k of Object.keys(obj)) { const r = searchUserObj(obj[k], depth + 1); if (r) return r; }
            return null;
        };
        const su = searchUserObj(state, 0);
        if (su) return su;
        if (token) return userIdFromJwt(token);
        return null;
    };
    const getAuthToken = (state) => {
        if (authCapture.token) return authCapture.token;
        const u = (state && (state.user || (state.state && state.state.user))) || {};
        const t = u.jwt || u.accessToken || u.authToken;
        if (!t) return null;
        return String(t).startsWith('Bearer ') ? t : 'Bearer ' + t;
    };
    const getCourseName = (state) => {
        const cc = state?.state?.user?.currentCourse || state?.user?.currentCourse;
        if (!cc) return 'Duolingo';
        const title = cc.title || cc.learningLanguage || cc.courseId || cc.id;
        return title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Duolingo';
    };
    const extractAll = async () => {
        const state = await decodeState();
        const pathSectioned = findPathSectioned(state);
        if (!pathSectioned || pathSectioned.length === 0) throw new Error('pathSectioned not found.');
        const token = getAuthToken(state);
        const userId = findUserId(state, token);
        return { state, pathSectioned, userId, token, courseName: getCourseName(state) };
    };

    // ---------- Summaries ----------
    const toYmd = (d) => {
        if (d == null) return null;
        if (typeof d === 'string') {
            if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
            const n = Number(d);
            if (isFinite(n)) d = n;
            else { const t = Date.parse(d); return isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; }
        }
        if (typeof d === 'number' && isFinite(d)) {
            if (d > 1e12) return new Date(d).toISOString().slice(0, 10);
            if (d > 1e9) return new Date(d * 1000).toISOString().slice(0, 10);
            if (d >= 19000101 && d <= 21001231) {
                const s = String(d);
                return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
            }
        }
        return null;
    };
    const normaliseSummaries = (raw) => {
        if (!raw) return [];
        const arr = (Array.isArray(raw) && raw) || raw.summaries || raw.xpGains || (raw.user && (raw.user.xpGains || raw.user.summaries)) || [];
        if (!Array.isArray(arr)) return [];
        return arr.map(x => ({
            date: toYmd(x.date != null ? x.date : (x.day != null ? x.day : x.ymd)),
            xp: Number(x.gainedXp != null ? x.gainedXp : (x.xp != null ? x.xp : (x.totalXp != null ? x.totalXp : 0))) || 0,
            numSessions: x.numSessions == null ? null : Number(x.numSessions),
            totalSessionTime: Number(x.totalSessionTime) || 0,
            streakExtended: !!x.streakExtended,
            frozen: !!x.frozen,
            repaired: !!x.repaired,
            shielded: !!x.shielded
        })).filter(x => x.date);
    };
    const tryJson = async (url, token) => {
        const r = await fetch(url, { headers: { Authorization: token, Accept: 'application/json' }, credentials: 'include' });
        if (!r.ok) { const b = await r.text().catch(() => ''); throw Object.assign(new Error(`HTTP ${r.status}`), { body: b.slice(0, 200) }); }
        return r.json();
    };
    const fetchDailySummaries = async (userId, token, daysBack = 400) => {
        const endDate = localDateStr();
        const startDate = localDateStr(new Date(Date.now() - daysBack * DAY));
        const attempts = [
            { label: 'xp_summaries', url: `https://www.duolingo.com/2017-06-30/users/${userId}/xp_summaries?startDate=${startDate}&endDate=${endDate}` },
            { label: 'user.xpGains', url: `https://www.duolingo.com/2017-06-30/users/${userId}?fields=xpGains` },
            { label: 'users/xp_summaries', url: `https://www.duolingo.com/2017-06-30/users/${userId}/xp_summaries` }
        ];
        const errors = [];
        for (const a of attempts) {
            try {
                const raw = await tryJson(a.url, token);
                const list = normaliseSummaries(raw);
                if (list.length) return { list, endpoint: a.label, errors };
                errors.push(`${a.label}: empty`);
            } catch (e) { errors.push(`${a.label}: ${e.message}${e.body ? ' — ' + e.body : ''}`); }
        }
        throw new Error('All summary endpoints failed:\n' + errors.join('\n'));
    };

    // ---------- Pace & analytics ----------
    const sessionsOf = s => (s.numSessions != null && isFinite(s.numSessions)) ? s.numSessions : (s.xp ? s.xp / AVG_XP_PER_SESSION : 0);
    const computePace = (summaries, days) => {
        if (!summaries || !summaries.length) return { count: 0, days: 0, pace: 0, estimated: false };
        let relevant = summaries;
        if (days > 0) {
            const cutoff = Date.now() - days * DAY;
            relevant = summaries.filter(s => new Date(s.date + 'T00:00:00Z').getTime() >= cutoff);
        }
        if (!relevant.length) return { count: 0, days: 0, pace: 0, estimated: false };
        const total = relevant.reduce((a, s) => a + sessionsOf(s), 0);
        const dates = relevant.map(s => new Date(s.date + 'T00:00:00Z').getTime()).filter(isFinite);
        const span = dates.length > 1 ? Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / DAY) + 1) : 1;
        const est = relevant.some(s => s.numSessions == null);
        return { count: total, days: span, pace: total / span, estimated: est };
    };
    const computeTime = (summaries, days) => {
        let relevant = summaries;
        if (days > 0) {
            const cutoff = Date.now() - days * DAY;
            relevant = summaries.filter(s => new Date(s.date + 'T00:00:00Z').getTime() >= cutoff);
        }
        const sec = relevant.reduce((a, s) => a + (s.totalSessionTime || 0), 0);
        const sess = relevant.reduce((a, s) => a + sessionsOf(s), 0);
        return { avgSecPerSession: sess > 0 ? sec / sess : 0, totalSessions: sess, totalSeconds: sec };
    };
    const computeQuality = (summaries, days) => {
        const cutoff = Date.now() - days * DAY;
        return summaries
            .filter(s => new Date(s.date + 'T00:00:00Z').getTime() >= cutoff)
            .map(s => {
            const sess = sessionsOf(s);
            return { date: s.date, xpPerSession: sess > 0 ? s.xp / sess : 0, sessions: sess };
        })
            .sort((a, b) => a.date.localeCompare(b.date));
    };
    const computeDayOfWeek = (summaries) => {
        const totals = [0, 0, 0, 0, 0, 0, 0];
        const counts = [0, 0, 0, 0, 0, 0, 0];
        summaries.forEach(s => {
            const t = new Date(s.date + 'T00:00:00Z').getTime();
            if (!isFinite(t)) return;
            const dow = new Date(t).getUTCDay();
            totals[dow] += sessionsOf(s);
            counts[dow]++;
        });
        const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        return totals.map((total, i) => ({ day: labels[i], total, avg: counts[i] ? total / counts[i] : 0 }));
    };
    const computeComparison = (summaries, days) => {
        if (days <= 0) return null;
        const now = Date.now();
        const currCutoff = now - days * DAY;
        const prevCutoff = currCutoff - days * DAY;
        let curr = 0, prev = 0;
        summaries.forEach(s => {
            const t = new Date(s.date + 'T00:00:00Z').getTime();
            if (!isFinite(t)) return;
            if (t >= currCutoff) curr += sessionsOf(s);
            else if (t >= prevCutoff) prev += sessionsOf(s);
        });
        if (prev === 0) return null;
        const pct = ((curr - prev) / prev) * 100;
        return { currPace: curr / days, prevPace: prev / days, pct };
    };
    const computeStreak = (summaries) => {
        const byDate = new Map();
        summaries.forEach(s => byDate.set(s.date, s));
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        const isStreakDay = s => s && (s.streakExtended || s.frozen || s.repaired);

        let current = 0;
        const todaySummary = byDate.get(localDateStr(today));
        const startOffset = isStreakDay(todaySummary) ? 0 : 1;
        for (let i = startOffset; i < 2000; i++) {
            const dt = new Date(today);
            dt.setDate(dt.getDate() - i);
            const s = byDate.get(localDateStr(dt));
            if (isStreakDay(s)) current++;
            else break;
        }

        const sorted = [...summaries].sort((a,b) => a.date.localeCompare(b.date));
        let longest = 0, run = 0;
        for (const s of sorted) {
            if (isStreakDay(s)) { run++; if (run > longest) longest = run; }
            else run = 0;
        }

        const monthStart = localDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
        let freezesUsed = 0, repairedDays = 0;
        for (const s of summaries) {
            if (s.date >= monthStart) {
                if (s.frozen) freezesUsed++;
                if (s.repaired) repairedDays++;
            }
        }

        return { current, longest, freezesUsed, repairedDays };
    };
    const computeMilestones = (sections, currentIdx, pace) => {
        const out = [];
        let cum = 0;
        const seen = new Set();
        for (let i = currentIdx; i < sections.length; i++) {
            cum += sectionRemaining(sections[i]);
            const cefr = sections[i].cefr?.level || sections[i].cefrLevel || '—';
            const nextCefr = sections[i + 1]?.cefr?.level || sections[i + 1]?.cefrLevel;
            const isLast = i === sections.length - 1;
            if ((nextCefr && nextCefr !== cefr) || isLast) {
                if (!seen.has(cefr)) {
                    seen.add(cefr);
                    const d = pace > 0 ? cum / pace : Infinity;
                    out.push({ level: cefr, date: forecastDate(d), days: d });
                }
            }
        }
        return out;
    };
    const buildForecast = (sections, currentIdx, pace) => {
        const out = [];
        let cum = 0;
        for (let i = currentIdx; i < sections.length; i++) {
            cum += sectionRemaining(sections[i]);
            const d = pace > 0 ? cum / pace : Infinity;
            out.push({ section: sections[i], sectionRemaining: sectionRemaining(sections[i]), cumulativeRemaining: cum, days: d, date: forecastDate(d) });
        }
        return out;
    };

    // ---------- UI ----------
    const buildUI = () => {
        if (document.getElementById('duolingo-path-viewer-host')) return;
        const host = document.createElement('div');
        host.id = 'duolingo-path-viewer-host';
        (document.body || document.documentElement).appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });

        const savedTheme = localStorage.getItem(THEME_KEY);
        const initialTheme = savedTheme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

        shadow.innerHTML = `
    <style>
      :host { all: initial; display: block; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .dlv-btn { pointer-events: auto; position: fixed; right: 16px; bottom: 16px; padding: 10px 16px; background: #58cc02; color: #fff; border: none; border-radius: 8px; font: 600 14px system-ui; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
      .dlv-btn:hover { background: #4cae00; }
      .dlv-modal { pointer-events: auto; position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; }
      .dlv-modal.open { display: flex; align-items: center; justify-content: center; }
      .dlv-inner {
        --bg: #fff; --fg: #333; --muted: #888; --border: #e5e5e5;
        --card-bg: #fafafa; --header-bg: #fafafa; --tab-bg: #f5f5f5;
        --accent: #58cc02; --info-bg: #f0f7ff; --info-fg: #1cb0f6;
        --table-header: #f0f0f0; --table-alt: #fffbe6;
        --code-bg: #eef6f8; --code-fg: #066; --done-bg: #e6f7e6; --done-fg: #060;
        --btn-bg: #eee; --btn-fg: #333; --shadow: rgba(0,0,0,0.4);
        background: var(--bg); color: var(--fg);
        width: min(1100px, 94vw); height: 92vh; border-radius: 12px;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 10px 40px var(--shadow);
      }
      .dlv-inner.dark {
        --bg: #1a1a1a; --fg: #e0e0e0; --muted: #999; --border: #333;
        --card-bg: #252525; --header-bg: #222; --tab-bg: #1f1f1f;
        --accent: #58cc02; --info-bg: #1a2a3a; --info-fg: #6dbcf6;
        --table-header: #2a2a2a; --table-alt: #2a2515;
        --code-bg: #1a2a33; --code-fg: #6db; --done-bg: #1a3a1a; --done-fg: #6d6;
        --btn-bg: #333; --btn-fg: #e0e0e0; --shadow: rgba(0,0,0,0.8);
      }
      .dlv-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--header-bg); }
      .dlv-header h2 { margin: 0; font-size: 16px; color: var(--fg); white-space: nowrap; }
      .dlv-header button { padding: 7px 12px; border: none; border-radius: 6px; font: 600 13px system-ui; cursor: pointer; background: var(--btn-bg); color: var(--btn-fg); }
      .dlv-header .spacer { flex: 1; }
      .dlv-theme { background: var(--btn-bg); color: var(--btn-fg); font-size: 16px; padding: 6px 10px; }
      .dlv-download { background: #1cb0f6; color: #fff; }
      .dlv-download:hover { background: #1899d6; }
      .dlv-download:disabled { background: #666; cursor: not-allowed; }
      .dlv-close { background: #ff4b4b; color: #fff; }
      .dlv-close:hover { background: #e63939; }
      .dlv-tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--tab-bg); overflow-x: auto; }
      .dlv-tab { padding: 10px 18px; border: none; background: transparent; cursor: pointer; font: 600 14px system-ui; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap; }
      .dlv-tab.active { color: var(--accent); border-bottom-color: var(--accent); background: var(--bg); }
      .dlv-body { flex: 1; overflow: auto; padding: 16px 20px; font-size: 14px; line-height: 1.5; }
      .dlv-panel { display: none; }
      .dlv-panel.active { display: block; }
      .dlv-summary { padding: 10px 12px; background: var(--info-bg); color: var(--info-fg); border-radius: 6px; margin-bottom: 12px; font-weight: 600; }
      .dlv-summary .dlv-summary-top { display: flex; justify-content: space-between; align-items: baseline; }
      .dlv-bar { height: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; margin-top: 6px; }
      .dlv-inner.dark .dlv-bar { background: rgba(255,255,255,0.1); }
      .dlv-bar > div { height: 100%; background: var(--accent); transition: width 0.2s; }
      .unit-bar { display: inline-block; width: 60px; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; vertical-align: middle; margin-left: 8px; }
      .unit-bar > span { display: block; height: 100%; background: var(--accent); }
      .dlv-body details { margin-left: 1em; }
      .dlv-body summary { cursor: pointer; padding: 2px 0; }
      .dlv-body em { color: var(--muted); font-style: normal; }
      .dlv-body .lock { color: #c00; }
      .dlv-body .sess { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--code-fg); background: var(--code-bg); padding: 0 4px; border-radius: 3px; font-size: 12px; display: inline-block; margin-right: 4px; }
      .dlv-body summary.done > .sess { background: var(--done-bg); color: var(--done-fg); }
      .dlv-body details.unit-done > summary { color: var(--done-fg); }
      .dlv-body details.unit-done > summary > .sess { background: var(--done-bg); color: var(--done-fg); }
      .dlv-body details.next-unit > summary { background: var(--info-bg); }
      .dlv-body ul { margin: 4px 0; padding-left: 24px; }
      .dlv-body li.next { background: var(--info-bg); border-radius: 4px; padding: 2px 4px; }
      .dlv-body .jump { color: var(--info-fg); text-decoration: none; margin-left: 4px; opacity: 0.6; }
      .dlv-body .jump:hover { opacity: 1; }
      .dlv-body .badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 11px; font-weight: 600; background: var(--accent); color: #fff; margin-left: 6px; }
      .dlv-error { color: #c00; white-space: pre-wrap; padding: 8px 0; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
      .dlv-status { padding: 8px 0; color: var(--muted); }
      .visit-banner { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--info-bg); color: var(--info-fg); border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
      .visit-banner .vb-text { flex: 1; font-weight: 600; }
      .visit-banner .vb-close { background: none; border: none; color: inherit; font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1; }
      .fc-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 0 16px; }
      .fc-toolbar select, .fc-toolbar button { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); font-size: 13px; background: var(--btn-bg); color: var(--btn-fg); cursor: pointer; }
      .fc-card { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; background: var(--card-bg); }
      .fc-card h3 { margin: 0 0 8px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
      .fc-big { font-size: 20px; font-weight: 700; color: var(--accent); }
      .fc-meta { color: var(--muted); font-size: 13px; margin-top: 4px; }
      .fc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .fc-table th { text-align: left; padding: 8px; background: var(--table-header); color: var(--fg); font-weight: 600; border-bottom: 2px solid var(--border); }
      .fc-table td { padding: 8px; border-bottom: 1px solid var(--border); }
      .fc-table tr.curr { background: var(--table-alt); }
      .fc-table tr.curr td:first-child::before { content: "▶ "; color: #f0a500; }
      .fc-spark { display: flex; align-items: flex-end; gap: 2px; height: 100px; padding: 4px 0; }
      .fc-spark > div { flex: 1; background: var(--info-fg); border-radius: 2px 2px 0 0; min-height: 1px; }
      .fc-spark-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
      .fc-note { font-size: 11px; color: var(--muted); margin-top: 6px; }
      .fc-quality { width: 100%; height: 180px; display: block; }
      .fc-heatmap { width: 100%; display: block; margin-top: 4px; }
      .fc-heatmap rect { shape-rendering: crispEdges; }
      .fc-dow { display: flex; gap: 4px; height: 160px; padding: 4px 0; }
      .fc-dow .col { flex: 1; display: flex; flex-direction: column; height: 100%; }
      .fc-dow .bar-area { flex: 1; display: flex; align-items: flex-end; width: 100%; }
      .fc-dow .bar { width: 100%; background: var(--info-fg); border-radius: 2px 2px 0 0; min-height: 1px; }
      .fc-dow .lbl { font-size: 10px; color: var(--muted); text-align: center; margin-top: 4px; height: 12px; }
      .filters { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0 12px; }
      .filters input, .filters select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); font-size: 13px; background: var(--bg); color: var(--fg); }
      .filters input { flex: 1; min-width: 180px; }
      .filters button { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--btn-bg); color: var(--btn-fg); cursor: pointer; font-size: 12px; }
      .plan-wrap { display: flex; flex-direction: column; gap: 12px; }
      .plan-metrics { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
      .plan-metric { flex: 1; min-width: 110px; background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border); text-align: center; }
      .plan-metric .k { font-size: 11px; text-transform: uppercase; color: var(--muted); font-weight: 600; }
      .plan-metric .v { font-size: 20px; font-weight: 700; color: var(--accent); margin-top: 4px; }
      .plan-metric .v small { font-size: 11px; color: var(--muted); font-weight: 400; }
      .plan-goals { display: flex; gap: 12px; flex-wrap: wrap; }
      .goal-group { flex: 1; min-width: 200px; background: var(--card-bg); padding: 14px; border-radius: 8px; border: 1px solid var(--border); }
      .goal-group label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--fg); }
      .goal-group input[type=date] { width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); font-family: inherit; }
      .goal-group input[type=range] { width: 100%; margin: 8px 0; }
      .goal-meta { font-size: 12px; color: var(--muted); margin-top: 8px; }
      .goal-meta b { color: var(--fg); }
      .reset-avg { font-size: 11px; padding: 2px 8px; border: 1px solid var(--border); background: var(--btn-bg); color: var(--btn-fg); border-radius: 4px; cursor: pointer; margin-left: auto; font-weight: normal; }
      .plan-mode-toggle { display: flex; gap: 4px; margin-bottom: 0; }
      .plan-mode-toggle button { padding: 6px 14px; border: 1px solid var(--border); border-radius: 6px; background: var(--btn-bg); color: var(--btn-fg); cursor: pointer; font: 600 13px system-ui; }
      .plan-mode-toggle button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
      .goal-input { width: 55px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); font-size: 13px; font-family: inherit; text-align: center; }
      .goal-status { font-weight: 600; }
      .goal-status.done { color: var(--done-fg); }
      .goal-status.pending { color: var(--muted); }
      .export-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
      .export-card { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; background: var(--card-bg); display: flex; flex-direction: column; gap: 8px; }
      .export-card h3 { margin: 0; font-size: 14px; color: var(--fg); }
      .export-card p { margin: 0; font-size: 12px; color: var(--muted); flex: 1; }
      .export-card button { padding: 8px 14px; border: none; border-radius: 6px; font: 600 13px system-ui; cursor: pointer; background: var(--accent); color: #fff; }
      .export-card button:hover { filter: brightness(0.95); }
      .export-card button:disabled { background: #666; cursor: not-allowed; }
    </style>

    <button class="dlv-btn" title="Preview full course path &amp; forecast">📚 Duolingo Path</button>
    <div class="dlv-modal">
      <div class="dlv-inner ${initialTheme === 'dark' ? 'dark' : ''}">
        <div class="dlv-header">
          <h2 id="dlv-title">Duolingo Path</h2>
          <button class="dlv-theme" title="Toggle theme">${initialTheme === 'dark' ? '☀️' : '🌙'}</button>
          <div class="spacer"></div>
          <button class="dlv-refresh">Reload all</button>
          <button class="dlv-download" disabled>Download JSON</button>
          <button class="dlv-close">Close</button>
        </div>
        <div class="dlv-tabs">
          <button class="dlv-tab active" data-tab="path">Path</button>
          <button class="dlv-tab" data-tab="forecast">Forecast</button>
          <button class="dlv-tab" data-tab="plan">Plan</button>
          <button class="dlv-tab" data-tab="export">Export</button>
        </div>
        <div class="dlv-body">
          <div class="dlv-panel active" data-panel="path">
            <div class="visit-banner" style="display:none">
              <span class="vb-text"></span>
              <button class="vb-close" title="Dismiss">×</button>
            </div>
            <div class="filters">
              <input class="filter-text" type="search" placeholder="Search units, stories, skills…">
              <select class="filter-type">
                <option value="all">All types</option>
                <option value="skill">Skills</option>
                <option value="story">Stories</option>
                <option value="duo_radio">Radio</option>
                <option value="practice">Practice</option>
                <option value="unit_review">Unit reviews</option>
                <option value="chest">Chests</option>
              </select>
              <select class="filter-state">
                <option value="all">All states</option>
                <option value="incomplete">Incomplete</option>
                <option value="complete">Complete</option>
                <option value="locked">Locked</option>
                <option value="in-progress">In progress</option>
              </select>
              <button class="filter-clear">Clear</button>
              <button class="filter-expand">Expand all</button>
              <button class="filter-collapse">Collapse completed</button>
            </div>
            <div class="path-content"><div class="dlv-status">Click "Reload all" to load your path.</div></div>
          </div>
          <div class="dlv-panel" data-panel="forecast">
            <div class="fc-toolbar">
              <button class="dlv-load">Load activity history</button>
              <label>Pace window:
                <select class="fc-window">
                  <option value="7">Last 7 days</option>
                  <option value="14" selected>Last 14 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="0">All time</option>
                </select>
              </label>
              <span class="fc-pace-info"></span>
            </div>
            <div class="fc-content"><div class="dlv-status">Click "Load activity history" to compute a forecast.</div></div>
          </div>
          <div class="dlv-panel" data-panel="plan">
            <div class="fc-content-plan"><div class="dlv-status">Load activity history first (Forecast tab).</div></div>
          </div>
          <div class="dlv-panel" data-panel="export">
            <div class="export-grid">
              <div class="export-card">
                <h3>JSON</h3>
                <p>Raw path data — sections, units, levels, all metadata.</p>
                <button class="ex-json" disabled>Download JSON</button>
              </div>
              <div class="export-card">
                <h3>CSV</h3>
                <p>One row per level with CEFR &amp; section index — ready for analysis.</p>
                <button class="ex-csv" disabled>Download CSV</button>
              </div>
              <div class="export-card">
                <h3>Markdown</h3>
                <p>Nested checklist with YAML frontmatter — ideal for Obsidian / Notion.</p>
                <button class="ex-md" disabled>Download Markdown</button>
              </div>
              <div class="export-card">
                <h3>Printable study plan</h3>
                <p>Print-to-PDF checklist with per-unit projected finish dates.</p>
                <button class="ex-print" disabled>Open print view</button>
              </div>
              <div class="export-card">
                <h3>Progress snapshot</h3>
                <p>Shareable PNG with current position, sessions, streak, projected finish.</p>
                <button class="ex-png" disabled>Download PNG</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

        const inner = shadow.querySelector('.dlv-inner');
        const titleEl = shadow.querySelector('#dlv-title');
        const btn = shadow.querySelector('.dlv-btn');
        const modal = shadow.querySelector('.dlv-modal');
        const refreshBtn = shadow.querySelector('.dlv-refresh');
        const downloadBtn = shadow.querySelector('.dlv-download');
        const closeBtn = shadow.querySelector('.dlv-close');
        const themeBtn = shadow.querySelector('.dlv-theme');
        const pathContent = shadow.querySelector('.path-content');
        const filterText = shadow.querySelector('.filter-text');
        const filterType = shadow.querySelector('.filter-type');
        const filterState = shadow.querySelector('.filter-state');
        const filterClear = shadow.querySelector('.filter-clear');
        const filterExpand = shadow.querySelector('.filter-expand');
        const filterCollapse = shadow.querySelector('.filter-collapse');
        const visitBanner = shadow.querySelector('.visit-banner');
        const vbText = shadow.querySelector('.vb-text');
        const vbClose = shadow.querySelector('.vb-close');
        const loadBtn = shadow.querySelector('.dlv-load');
        const fcWindow = shadow.querySelector('.fc-window');
        const fcInfo = shadow.querySelector('.fc-pace-info');
        const fcContent = shadow.querySelector('.fc-content');
        const fcPlanContent = shadow.querySelector('.fc-content-plan');
        const exJson = shadow.querySelector('.ex-json');
        const exCsv = shadow.querySelector('.ex-csv');
        const exMd = shadow.querySelector('.ex-md');
        const exPrint = shadow.querySelector('.ex-print');
        const exPng = shadow.querySelector('.ex-png');

        let currentData = null;
        let currentState = null;
        let currentUserId = null;
        let currentToken = null;
        let currentCourseName = '';
        let summariesCache = null;
        let summariesFetchedAt = 0;
        let endpointUsed = null;
        let nextNode = null;
        let shouldScrollToNext = false;

        // Load plan state from localStorage
        const loadPlanState = () => {
            try {
                const s = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
                if (s) return s;
            } catch (e) {}
            return { avgMins: null, avgMinsIsCustom: false, dailyMins: 20, targetDate: '', goalMode: 'date' };
        };
        let planState = loadPlanState();
        const savePlanState = () => {
            try { localStorage.setItem(PLAN_KEY, JSON.stringify(planState)); } catch (e) {}
        };

        let dailyGoal = parseInt(localStorage.getItem(GOAL_KEY) || '5', 10) || 5;

        const loadSnapshot = () => {
            try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null'); } catch (e) { return null; }
        };
        const saveSnapshot = (snap) => {
            try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap)); } catch (e) {}
        };

        const matchStateFilter = (l, filter) => {
            if (filter === 'all') return true;
            if (filter === 'complete') return COMPLETE_STATES.has(l.state);
            if (filter === 'locked') return l.state === 'locked';
            if (filter === 'incomplete') return !COMPLETE_STATES.has(l.state);
            if (filter === 'in-progress') {
                if (COMPLETE_STATES.has(l.state)) return false;
                if (l.state === 'locked') return false;
                return (l.finishedSessions || 0) > 0;
            }
            return true;
        };

        const applyFilters = (sections) => {
            const txt = filterText.value.trim().toLowerCase();
            const type = filterType.value;
            const state = filterState.value;
            return sections.map(sec => {
                const units = (sec.units || []).map(u => {
                    const levels = (u.levels || []).filter(l => {
                        if (type !== 'all' && l.type !== type) return false;
                        if (!matchStateFilter(l, state)) return false;
                        if (txt) {
                            const fields = [
                                l.debugName, l.state, l.type,
                                l.pathLevelClientData?.teachingObjective,
                                l.pathLevelClientData?.duoRadioSummary?.name,
                                l.pathLevelClientData?.storyName
                            ];
                            if (!fields.some(f => f && String(f).toLowerCase().includes(txt))) return false;
                        }
                        return true;
                    });
                    return { ...u, levels };
                }).filter(u => u.levels.length > 0);
                return { ...sec, units };
            }).filter(sec => sec.units.length > 0);
        };

        const updateFilterCounts = () => {
            if (!currentData) return;
            const txt = filterText.value.trim().toLowerCase();
            const stateFilter = filterState.value;
            const typeFilter = filterType.value;
            const typeCounts = {}, stateCounts = {};

            currentData.forEach(sec => (sec.units || []).forEach(u => (u.levels || []).forEach(l => {
                if (txt) {
                    const fields = [l.debugName, l.state, l.type, l.pathLevelClientData?.teachingObjective, l.pathLevelClientData?.duoRadioSummary?.name, l.pathLevelClientData?.storyName];
                    if (!fields.some(f => f && String(f).toLowerCase().includes(txt))) return;
                }
                if (matchStateFilter(l, stateFilter)) {
                    typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
                    typeCounts.all = (typeCounts.all || 0) + 1;
                }
                if (typeFilter === 'all' || l.type === typeFilter) {
                    stateCounts.all = (stateCounts.all || 0) + 1;
                    if (COMPLETE_STATES.has(l.state)) stateCounts.complete = (stateCounts.complete || 0) + 1;
                    else stateCounts.incomplete = (stateCounts.incomplete || 0) + 1;
                    if (l.state === 'locked') stateCounts.locked = (stateCounts.locked || 0) + 1;
                    if (!COMPLETE_STATES.has(l.state) && l.state !== 'locked' && (l.finishedSessions || 0) > 0) {
                        stateCounts['in-progress'] = (stateCounts['in-progress'] || 0) + 1;
                    }
                }
            })));

            filterType.querySelectorAll('option').forEach(opt => {
                opt.textContent = `${TYPE_LABELS[opt.value]} (${typeCounts[opt.value] || 0})`;
            });
            filterState.querySelectorAll('option').forEach(opt => {
                opt.textContent = `${STATE_LABELS[opt.value]} (${stateCounts[opt.value] || 0})`;
            });
        };

        const renderPath = () => {
            if (!currentData) { pathContent.innerHTML = '<div class="dlv-status">Click "Reload all" to load your path.</div>'; return; }
            updateFilterCounts();
            const filtered = applyFilters(currentData);
            if (!filtered.length) { pathContent.innerHTML = '<div class="dlv-status">No levels match the current filters.</div>'; return; }
            const tot = totalSessions(filtered);
            const pct = tot.total > 0 ? (tot.done / tot.total * 100) : 0;
            const head = `<div class="dlv-summary">
              <div class="dlv-summary-top">
                <span>${tot.done}/${tot.total} sessions · ${filtered.length} sections</span>
                <span>${pct.toFixed(1)}%</span>
              </div>
              <div class="dlv-bar"><div style="width:${pct}%"></div></div>
            </div>`;
            const html = filtered.map(sec => {
                const ss = sectionSessions(sec);
                const hasNext = nextNode && sec.units.some(u => u.levels.includes(nextNode.level));
                return `<details open>
          <summary class="${isComplete(ss) ? 'done' : ''}"><b>Section ${esc(sec.index)}</b> <em>[${esc(sec.type)}] ${sec.completedUnits}/${sec.totalUnits} units</em> <span class="sess">${ss.done}/${ss.total}</span>${hasNext ? '<span class="badge">▶ start</span>' : ''}</summary>
          ${(sec.units || []).map(u => {
                  const us = unitSessions(u);
                  const uPct = us.total > 0 ? (us.done / us.total * 100) : 0;
                  const unitNext = nextNode && u.levels.includes(nextNode.level);
                  return `<details class="${isComplete(us) ? 'unit-done' : ''} ${unitNext ? 'next-unit' : ''}">
              <summary>Unit ${esc(u.unitNumber)} ${u.isUnlocked === false ? '<span class="lock">🔒</span>' : ''} — ${esc(u.teachingObjective || '')} <em>${esc(u.cefrLevel || '')}</em> <span class="sess">${us.done}/${us.total}</span><span class="unit-bar"><span style="width:${uPct}%"></span></span></summary>
              <ul>${(u.levels || []).map(l => {
                const c = l.pathLevelClientData || {};
                const label = c.teachingObjective || c.duoRadioSummary?.name || c.storyName || l.debugName;
                const r = levelSessions(l);
                const isNext = nextNode && l === nextNode.level;
                const canJump = JUMP_TYPES.has(l.type) && l.state !== 'locked' && l.id;
                const link = canJump ? ` <a class="jump" href="https://www.duolingo.com/lesson/${esc(l.id)}" target="_blank" rel="noopener" title="Open lesson">↗</a>` : '';
                return `<li class="${isNext ? 'next' : ''}"><span class="sess">${r.done}/${r.total}</span> <em>[${esc(l.type)}]</em> ${esc(label)} <em>(${esc(l.state)})</em>${isNext ? '<span class="badge">▶ next</span>' : ''}${link}</li>`;
            }).join('')}</ul>
            </details>`;
              }).join('')}
        </details>`;
          }).join('');
          pathContent.innerHTML = head + html;

          if (shouldScrollToNext) {
              shouldScrollToNext = false;
              const el = pathContent.querySelector('li.next');
              if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
          }
        };

        const loadPath = async () => {
            pathContent.innerHTML = '<div class="dlv-status">Decoding duo.state…</div>';
            downloadBtn.disabled = true;
            [exJson, exCsv, exMd, exPrint, exPng].forEach(b => b.disabled = true);
            try {
                const data = await extractAll();
                currentData = data.pathSectioned;
                currentState = data.state;
                currentUserId = data.userId;
                currentToken = data.token;
                currentCourseName = data.courseName;
                nextNode = findNextNode(currentData);
                window.__dlvPath = currentData;
                titleEl.textContent = `Duolingo Path · ${currentCourseName}`;

                // Snapshot comparison (since last visit)
                const prev = loadSnapshot();
                const totals = totalSessions(currentData);
                const curr = findCurrentPosition(currentData);
                const newSnap = {
                    ts: Date.now(),
                    course: currentCourseName,
                    done: totals.done,
                    total: totals.total,
                    secIdx: curr ? curr.section.index : -1,
                    unitNum: curr ? curr.unit.unitNumber : -1
                };

                if (!prev || prev.course !== currentCourseName) {
                    // First visit or course change - save silently
                    saveSnapshot(newSnap);
                    visitBanner.style.display = 'none';
                } else if (newSnap.done !== prev.done) {
                    // Progress since last save
                    const days = Math.max(0, Math.round((newSnap.ts - prev.ts) / DAY));
                    const delta = newSnap.done - prev.done;
                    if (delta > 0) {
                        vbText.textContent = `Since your last visit ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}: +${delta} sessions completed`;
                        visitBanner.style.display = 'flex';
                    } else {
                        visitBanner.style.display = 'none';
                    }
                    saveSnapshot(newSnap);
                } else {
                    visitBanner.style.display = 'none';
                }

                if (fcPlanContent.querySelector('.plan-wrap')) {
                    fcPlanContent.innerHTML = '<div class="dlv-status">Data reloaded. Open the Plan tab to refresh.</div>';
                }

                shouldScrollToNext = true;
                renderPath();
                downloadBtn.disabled = false;
                [exJson, exCsv, exMd, exPrint, exPng].forEach(b => b.disabled = false);
                if (summariesCache) { renderForecast(); renderPlan(); }
            } catch (e) {
                currentData = null;
                pathContent.innerHTML = `<div class="dlv-error">Error: ${esc(e.message)}</div>`;
            }
        };

        // ---------- Forecast rendering ----------
        const renderSparkline = (summaries, days) => {
            const now = Date.now();
            const buckets = new Array(days).fill(0);
            summaries.forEach(s => {
                const idx = daysAgoLocal(s.date);
                if (idx >= 0 && idx < days) buckets[days - 1 - idx] += sessionsOf(s);
            });
            const max = Math.max(1, ...buckets);
            const bars = buckets.map(n => `<div style="height:${(n / max) * 100}%" title="${n.toFixed(1)} sessions"></div>`).join('');
            const start = localDateStr(new Date(now - (days - 1) * DAY)).slice(5);
            const end = localDateStr().slice(5);
            return `<div class="fc-spark">${bars}</div><div class="fc-spark-labels"><span>${start}</span><span>today</span><span>${end}</span></div>`;
        };

        const renderQuality = (points) => {
            if (!points.length) return '<div class="dlv-status">No data</div>';
            const W = 600, H = 180;
            const max = Math.max(...points.map(p => p.xpPerSession), 1);
            const stepX = W / Math.max(1, points.length - 1);
            const path = points.map((p, i) => {
                const x = i * stepX;
                const y = H - 10 - (p.xpPerSession / max) * (H - 30);
                return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
            }).join(' ');
            let trend = '';
            if (points.length >= 4) {
                const n = Math.floor(points.length / 3);
                const first = points.slice(0, n).reduce((a, p) => a + p.xpPerSession, 0) / n;
                const last = points.slice(-n).reduce((a, p) => a + p.xpPerSession, 0) / n;
                const arrow = last > first * 1.1 ? '📈' : last < first * 0.9 ? '📉' : '➡️';
                trend = ` ${arrow} ${first.toFixed(0)} → ${last.toFixed(0)} XP/session`;
            }
            return `<svg class="fc-quality" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <text x="4" y="20" font-size="14" fill="var(--muted)">${max.toFixed(0)} XP/session</text>
        <path d="${path}" fill="none" stroke="#1cb0f6" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg><div class="fc-note">${trend}</div>`;
      };

        const renderDow = (buckets) => {
            const max = Math.max(1, ...buckets.map(b => b.avg));
            return `<div class="fc-dow">${buckets.map(b => `
        <div class="col" title="${b.day}: ${b.total.toFixed(0)} total sessions, avg ${b.avg.toFixed(1)}/day">
          <div class="bar-area">
            <div class="bar" style="height:${(b.avg / max) * 100}%"></div>
          </div>
          <div class="lbl">${b.day}</div>
        </div>`).join('')}</div>`;
          };

        const renderHeatmap = (summaries) => {
            const byDate = new Map();
            summaries.forEach(s => byDate.set(s.date, (byDate.get(s.date) || 0) + sessionsOf(s)));
            const maxVal = Math.max(1, ...byDate.values());

            const WEEKS = 53, CELL = 12, GAP = 2;
            const today = new Date();
            today.setHours(12, 0, 0, 0);
            const start = new Date(today);
            start.setDate(start.getDate() - (WEEKS - 1) * 7 - start.getDay());

            const W = WEEKS * (CELL + GAP);
            const H = 7 * (CELL + GAP);

            let rects = '';
            for (let w = 0; w < WEEKS; w++) {
                for (let d = 0; d < 7; d++) {
                    const dt = new Date(start);
                    dt.setDate(dt.getDate() + w * 7 + d);
                    if (dt > today) continue;
                    const key = localDateStr(dt);
                    const val = byDate.get(key) || 0;
                    if (val === 0) {
                        rects += `<rect x="${w*(CELL+GAP)}" y="${d*(CELL+GAP)}" width="${CELL}" height="${CELL}" rx="2" fill="var(--border)"><title>${key}: 0 sessions</title></rect>`;
                    } else {
                        const intensity = Math.max(0.2, Math.min(1, val / maxVal));
                        rects += `<rect x="${w*(CELL+GAP)}" y="${d*(CELL+GAP)}" width="${CELL}" height="${CELL}" rx="2" fill="var(--accent)" opacity="${intensity}"><title>${key}: ${val.toFixed(1)} sessions</title></rect>`;
                    }
                }
            }
            return `<svg class="fc-heatmap" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet">${rects}</svg>`;
        };

        const renderForecast = () => {
            if (!currentData) { fcContent.innerHTML = '<div class="dlv-error">Load the path first (Path tab → Reload all).</div>'; return; }
            if (!summariesCache) { fcContent.innerHTML = '<div class="dlv-status">Click "Load activity history" to fetch your activity.</div>'; fcInfo.textContent = ''; return; }
            const win = parseInt(fcWindow.value, 10);
            const pace = computePace(summariesCache, win);
            const time = computeTime(summariesCache, win);
            if (pace.pace === 0) {
                fcInfo.textContent = 'No activity found in this window — try a wider window.';
                fcContent.innerHTML = '<div class="dlv-status">No counted activity in the selected window.</div>';
                return;
            }
            fcInfo.textContent = `Pace: ${pace.count.toFixed(1)} sessions over ${pace.days} days = ${pace.pace.toFixed(2)}/day`;

            const current = findCurrentPosition(currentData);
            const currentIdx = current ? currentData.indexOf(current.section) : currentData.length;
            const remainingSessions = current ? totalSessions(currentData).total - totalSessions(currentData).done : 0;

            let html = '';

            // Today card
            const todayStr = localDateStr();
            const todayRec = summariesCache.find(s => s.date === todayStr);
            const todaySessions = todayRec ? sessionsOf(todayRec) : 0;
            const goalMet = todaySessions >= dailyGoal;
            html += `<div class="fc-card">
              <h3>Today</h3>
              <div class="fc-big">${todaySessions % 1 === 0 ? todaySessions : todaySessions.toFixed(1)} sessions</div>
              <div class="fc-meta" style="display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap">
                <span>Goal:</span>
                <input type="number" class="goal-input" min="1" max="50" value="${dailyGoal}">
                <span>sessions/day</span>
                <span class="goal-status ${goalMet ? 'done' : 'pending'}">${goalMet ? '✓ Goal reached!' : `${Math.max(0, dailyGoal - todaySessions).toFixed(0)} to go`}</span>
              </div>
            </div>`;

            // Streak & freezes
            const streak = computeStreak(summariesCache);
            html += `<div class="fc-card">
              <h3>Streak &amp; freezes</h3>
              <div class="plan-metrics">
                <div class="plan-metric"><div class="k">Current</div><div class="v">${streak.current}<small> days</small></div></div>
                <div class="plan-metric"><div class="k">Longest</div><div class="v">${streak.longest}<small> days</small></div></div>
                <div class="plan-metric"><div class="k">Freezes this month</div><div class="v">${streak.freezesUsed}</div></div>
                <div class="plan-metric"><div class="k">Repaired this month</div><div class="v">${streak.repairedDays}</div></div>
              </div>
            </div>`;

            // Recent activity (sparkline window matches pace window)
            const sparkDays = win > 0 ? win : 90;
            html += `<div class="fc-card"><h3>Recent activity (${sparkDays} days)</h3>${renderSparkline(summariesCache, sparkDays)}`;
            if (win > 0) {
                const cmp = computeComparison(summariesCache, win);
                if (cmp) {
                    const arrow = cmp.pct > 0 ? '↑' : cmp.pct < 0 ? '↓' : '→';
                    const word = Math.abs(cmp.pct) < 5 ? 'similar to' : `${arrow} ${Math.abs(cmp.pct).toFixed(0)}% vs`;
                    html += `<div class="fc-note">${word} previous ${win} days (${cmp.prevPace.toFixed(2)}/day → ${cmp.currPace.toFixed(2)}/day)</div>`;
                }
            }
            if (pace.estimated) html += `<div class="fc-note">⚠ Sessions estimated from XP where exact counts weren't available.</div>`;
            if (endpointUsed) html += `<div class="fc-note">Source: ${esc(endpointUsed)}</div>`;
            html += `</div>`;

            // Contribution heatmap
            html += `<div class="fc-card"><h3>Contribution heatmap (last 53 weeks)</h3>${renderHeatmap(summariesCache)}</div>`;

            // Time projections
            if (time.avgSecPerSession > 0 && remainingSessions > 0) {
                const totalSec = remainingSessions * time.avgSecPerSession;
                const hours = Math.floor(totalSec / 3600);
                const mins = Math.round((totalSec % 3600) / 60);
                html += `<div class="fc-card"><h3>Time to finish (remaining course)</h3><div class="fc-big">~${hours}h ${mins}m</div><div class="fc-meta">${remainingSessions} sessions × avg ${Math.round(time.avgSecPerSession / 60)} min/session</div></div>`;
            }

            if (!current) {
                html += `<div class="fc-card"><h3>Course complete 🎉</h3><div class="fc-big">You've finished everything!</div></div>`;
            } else {
                const unitDays = current.remaining / pace.pace;
                const unitSec = current.remaining * time.avgSecPerSession;
                html += `<div class="fc-card"><h3>Current unit</h3><div class="fc-big">${esc(current.unit.teachingObjective || 'Unit ' + current.unit.unitNumber)}</div><div class="fc-meta">${current.remaining} sessions · ~${Math.round(unitSec / 60)} min · ${fmtDays(unitDays)} · finish by <b>${forecastDate(unitDays)}</b></div></div>`;
                const secRem = sectionRemaining(current.section);
                const secDays = secRem / pace.pace;
                const secSec = secRem * time.avgSecPerSession;
                html += `<div class="fc-card"><h3>Current section</h3><div class="fc-big">Section ${esc(current.section.index)}</div><div class="fc-meta">${secRem} sessions · ~${Math.round(secSec / 60)} min · ${fmtDays(secDays)} · finish by <b>${forecastDate(secDays)}</b></div></div>`;
            }

            const quality = computeQuality(summariesCache, Math.max(win || 30, 30));
            if (quality.length > 1) {
                html += `<div class="fc-card"><h3>Session quality (XP per session)</h3>${renderQuality(quality)}</div>`;
            }
            const dow = computeDayOfWeek(summariesCache);
            if (dow.some(d => d.total > 0)) {
                html += `<div class="fc-card"><h3>Day-of-week pattern (avg sessions/day)</h3>${renderDow(dow)}</div>`;
            }

            if (current) {
                const rows = buildForecast(currentData, currentIdx, pace.pace);
                const total = rows.length ? rows[rows.length - 1] : null;
                if (total) {
                    html += `<div class="fc-card"><h3>Course completion</h3><div class="fc-big">${forecastDate(total.days)}</div><div class="fc-meta">${total.cumulativeRemaining} sessions · ${fmtDays(total.days)} at current pace</div></div>`;
                }
                html += `<div class="fc-card"><h3>Section-by-section forecast</h3><table class="fc-table"><thead><tr><th>Section</th><th>This section</th><th>Cumulative</th><th>Projected</th></tr></thead><tbody>`;
                rows.forEach((r, i) => {
                    html += `<tr class="${i === 0 ? 'curr' : ''}"><td><b>Section ${esc(r.section.index)}</b> <em>[${esc(r.section.type)}]</em></td><td>${r.sectionRemaining} sess</td><td>${r.cumulativeRemaining} sess</td><td><b>${r.date}</b> <em>(${fmtDays(r.days)})</em></td></tr>`;
                });
                html += '</tbody></table></div>';
            }
            fcContent.innerHTML = html;
        };

        // ---------- Plan tab ----------
        const renderGoals = () => {
            const goalsEl = fcPlanContent.querySelector('#planGoals');
            if (!goalsEl) return;
            if (planState.goalMode === 'date') {
                goalsEl.innerHTML = `
                  <div class="goal-group">
                    <label>Avg time per session: <b id="planAvgLabel"></b>
                      <button class="reset-avg" id="resetAvg" title="Reset to measured average">reset</button>
                    </label>
                    <input type="range" id="planAvgSlider" min="1" max="15" step="0.5" value="${planState.avgMins}">
                  </div>
                  <div class="goal-group">
                    <label>Target date</label>
                    <input type="date" id="planDate" value="${planState.targetDate}">
                    <div class="goal-meta" id="reqMeta"></div>
                  </div>`;
            } else {
                goalsEl.innerHTML = `
                  <div class="goal-group">
                    <label>Avg time per session: <b id="planAvgLabel"></b>
                      <button class="reset-avg" id="resetAvg" title="Reset to measured average">reset</button>
                    </label>
                    <input type="range" id="planAvgSlider" min="1" max="15" step="0.5" value="${planState.avgMins}">
                  </div>
                  <div class="goal-group">
                    <label>Daily study time: <b id="planDailyLabel"></b></label>
                    <input type="range" id="planDailySlider" min="5" max="180" step="5" value="${planState.dailyMins}">
                    <div class="goal-meta" id="projMeta"></div>
                  </div>`;
            }
            const avgSlider = goalsEl.querySelector('#planAvgSlider');
            if (avgSlider) avgSlider.addEventListener('input', (e) => {
                planState.avgMins = Number(e.target.value);
                planState.avgMinsIsCustom = true;
                savePlanState();
                updatePlanContent();
            });
            const resetBtn = goalsEl.querySelector('#resetAvg');
            if (resetBtn) resetBtn.addEventListener('click', () => {
                planState.avgMinsIsCustom = false;
                planState.avgMins = null;
                savePlanState();
                renderPlan();
            });
            const dateInput = goalsEl.querySelector('#planDate');
            if (dateInput) dateInput.addEventListener('change', (e) => {
                planState.targetDate = e.target.value;
                savePlanState();
                updatePlanContent();
            });
            const dailySlider = goalsEl.querySelector('#planDailySlider');
            if (dailySlider) dailySlider.addEventListener('input', (e) => {
                planState.dailyMins = Number(e.target.value);
                savePlanState();
                updatePlanContent();
            });
        };

        const computeProjDailyMins = (remaining) => {
            if (planState.goalMode === 'date' && planState.targetDate) {
                const targetTime = new Date(planState.targetDate + 'T23:59:59').getTime();
                const daysLeft = Math.max(1, (targetTime - Date.now()) / DAY);
                return (remaining * planState.avgMins) / daysLeft;
            }
            return planState.dailyMins;
        };

        const updatePlanContent = () => {
            if (!currentData || !summariesCache) return;
            const win = parseInt(fcWindow.value, 10);
            const pace = computePace(summariesCache, win);
            const timeData = computeTime(summariesCache, win);
            const totals = totalSessions(currentData);
            const remaining = totals.total - totals.done;
            const current = findCurrentPosition(currentData);
            const currentIdx = current ? currentData.indexOf(current.section) : 0;

            const metrics = fcPlanContent.querySelector('#planMetrics');
            if (metrics) {
                metrics.innerHTML = `
                  <div class="plan-metric"><div class="k">Sessions / day</div><div class="v">${pace.pace.toFixed(1)}</div></div>
                  <div class="plan-metric"><div class="k">Time / session</div><div class="v">${timeData.avgSecPerSession > 0 ? (timeData.avgSecPerSession/60).toFixed(1) : '—'}<small> min</small></div></div>
                  <div class="plan-metric"><div class="k">Est. daily</div><div class="v">${Math.round(pace.pace * (timeData.avgSecPerSession/60 || 0))}<small> min</small></div></div>`;
            }
            const metaEl = fcPlanContent.querySelector('#planTotalMeta');
            if (metaEl) metaEl.textContent = `${remaining} sessions remaining to finish the course.`;

            const avgLabel = fcPlanContent.querySelector('#planAvgLabel');
            if (avgLabel) avgLabel.textContent = planState.avgMins + ' min';
            const dailyLabel = fcPlanContent.querySelector('#planDailyLabel');
            if (dailyLabel) dailyLabel.textContent = planState.dailyMins + ' min';

            const projDailyMins = computeProjDailyMins(remaining);

            if (planState.goalMode === 'date') {
                const targetTime = planState.targetDate ? new Date(planState.targetDate + 'T23:59:59').getTime() : 0;
                const daysLeft = targetTime > 0 ? Math.max(1, (targetTime - Date.now()) / DAY) : Infinity;
                const reqSess = isFinite(daysLeft) ? remaining / daysLeft : 0;
                const reqMeta = fcPlanContent.querySelector('#reqMeta');
                if (reqMeta) {
                    if (!planState.targetDate) reqMeta.innerHTML = 'Pick a target date.';
                    else reqMeta.innerHTML = `Requires <b>${reqSess.toFixed(1)} sessions/day</b> (~${projDailyMins.toFixed(0)} min/day)`;
                }
            } else {
                const totalMins = remaining * planState.avgMins;
                const projDays = projDailyMins > 0 ? totalMins / projDailyMins : Infinity;
                const projMeta = fcPlanContent.querySelector('#projMeta');
                if (projMeta) projMeta.innerHTML = `Finishes in <b>${isFinite(projDays) ? Math.ceil(projDays) : '∞'} days</b> (${forecastDate(projDays)})`;
            }

            let cumMins = 0;
            let rowsHtml = '';
            const currSecIdx = current ? current.section.index : -1;
            currentData.forEach(sec => {
                const rem = sectionRemaining(sec);
                if (rem > 0) {
                    cumMins += rem * planState.avgMins;
                    const fDate = projDailyMins > 0 ? forecastDate(cumMins / projDailyMins) : '—';
                    const cls = sec.index === currSecIdx ? 'curr' : '';
                    rowsHtml += `<tr class="${cls}"><td><b>Section ${sec.index}</b></td><td>${rem}</td><td>${Math.round(rem * planState.avgMins)} min</td><td>${fDate}</td></tr>`;
                }
            });
            const tbody = fcPlanContent.querySelector('#planTableBody');
            if (tbody) tbody.innerHTML = rowsHtml;

            const milestones = computeMilestones(currentData, currentIdx, pace.pace);
            const mRows = milestones.map(m => `<tr><td><b>${esc(m.level)}</b></td><td>${m.date}</td><td><em>${fmtDays(m.days)}</em></td></tr>`).join('');
            const mBody = fcPlanContent.querySelector('#milestoneBody');
            if (mBody) mBody.innerHTML = mRows || '<tr><td colspan="3"><em>No milestones remaining</em></td></tr>';
        };

        const renderPlan = () => {
            if (!currentData) { fcPlanContent.innerHTML = '<div class="dlv-error">Load the path first.</div>'; return; }
            if (!summariesCache) { fcPlanContent.innerHTML = '<div class="dlv-status">Load activity history first (Forecast tab).</div>'; return; }

            const win = parseInt(fcWindow.value, 10);
            const timeData = computeTime(summariesCache, win);
            const measuredAvg = timeData.avgSecPerSession > 0
                ? Math.max(1, Math.min(15, Math.round((timeData.avgSecPerSession / 60) * 2) / 2))
                : 2;
            if (planState.avgMins === null) {
                planState.avgMins = measuredAvg;
                savePlanState();
            }
            if (!planState.targetDate) {
                const rem = totalSessions(currentData).total - totalSessions(currentData).done;
                const days = (rem * planState.avgMins) / planState.dailyMins;
                planState.targetDate = forecastDate(days);
                savePlanState();
            }

            if (!fcPlanContent.querySelector('.plan-wrap')) {
                fcPlanContent.innerHTML = `
                  <div class="plan-wrap">
                    <div class="fc-card">
                      <h3>Your current speed</h3>
                      <div class="plan-metrics" id="planMetrics"></div>
                      <div class="fc-meta" id="planTotalMeta"></div>
                    </div>
                    <div class="plan-mode-toggle">
                      <button data-mode="date" class="${planState.goalMode === 'date' ? 'active' : ''}">Target date</button>
                      <button data-mode="time" class="${planState.goalMode === 'time' ? 'active' : ''}">Daily time</button>
                    </div>
                    <div class="plan-goals" id="planGoals"></div>
                    <div class="fc-card">
                      <h3>CEFR milestones</h3>
                      <table class="fc-table">
                        <thead><tr><th>Level</th><th>Finishes on</th><th>From now</th></tr></thead>
                        <tbody id="milestoneBody"></tbody>
                      </table>
                    </div>
                    <div class="fc-card">
                      <h3>Section-by-section breakdown</h3>
                      <table class="fc-table">
                        <thead><tr><th>Section</th><th>Sessions left</th><th>Time left</th><th>Projected finish</th></tr></thead>
                        <tbody id="planTableBody"></tbody>
                      </table>
                    </div>
                  </div>`;

                fcPlanContent.querySelectorAll('.plan-mode-toggle button').forEach(b => {
                    b.addEventListener('click', () => {
                        planState.goalMode = b.dataset.mode;
                        savePlanState();
                        fcPlanContent.querySelectorAll('.plan-mode-toggle button').forEach(x => {
                            x.classList.toggle('active', x.dataset.mode === planState.goalMode);
                        });
                        renderGoals();
                        updatePlanContent();
                    });
                });
                renderGoals();
            }
            updatePlanContent();
        };

        // ---------- Export helpers ----------
        const getFilteredOrAll = () => currentData;

        const doJson = () => {
            const blob = new Blob([JSON.stringify({ pathSectioned: getFilteredOrAll() }, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `duolingo-path-${localDateStr()}.json`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };

        const doCsv = () => {
            const sections = getFilteredOrAll();
            const rows = [['Section', 'CEFR', 'Unit', 'Type', 'Label', 'State', 'Sessions Done', 'Sessions Total']];
            sections.forEach(sec => (sec.units || []).forEach(u => (u.levels || []).forEach(l => {
                const r = levelSessions(l);
                const c = l.pathLevelClientData || {};
                rows.push([
                    sec.index,
                    sec.cefr?.level || sec.cefrLevel || '',
                    u.unitNumber,
                    l.type,
                    c.teachingObjective || c.duoRadioSummary?.name || c.storyName || l.debugName || '',
                    l.state, r.done, r.total
                ]);
            })));
            const csv = rows.map(r => r.map(v => {
                const s = String(v);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `duolingo-path-${localDateStr()}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };

        const doMarkdown = () => {
            const sections = getFilteredOrAll();
            const totals = totalSessions(sections);
            const pct = totals.total > 0 ? Math.round(totals.done / totals.total * 100) : 0;
            let md = '---\n';
            md += `course: ${currentCourseName}\n`;
            md += `generated: ${localDateStr()}\n`;
            md += `total_sessions: ${totals.total}\n`;
            md += `completed_sessions: ${totals.done}\n`;
            md += `percent_complete: ${pct}\n`;
            md += '---\n\n';
            md += `# ${currentCourseName} — Study Plan\n\n`;
            sections.forEach(sec => {
                const ss = sectionSessions(sec);
                const cefr = sec.cefr?.level || sec.cefrLevel || '';
                md += `## Section ${sec.index}${cefr ? ` (${cefr})` : ''} [${sec.type}] — ${ss.done}/${ss.total} sessions\n\n`;
                (sec.units || []).forEach(u => {
                    const us = unitSessions(u);
                    md += `### Unit ${u.unitNumber} — ${u.teachingObjective || '(no title)'} (${us.done}/${us.total})\n\n`;
                    (u.levels || []).forEach(l => {
                        const r = levelSessions(l);
                        const check = COMPLETE_STATES.has(l.state) ? 'x' : ' ';
                        const c = l.pathLevelClientData || {};
                        const label = c.teachingObjective || c.duoRadioSummary?.name || c.storyName || l.debugName;
                        md += `- [${check}] [${l.type}] ${label} (${r.done}/${r.total})\n`;
                    });
                    md += '\n';
                });
            });
            const blob = new Blob([md], { type: 'text/markdown' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `duolingo-plan-${localDateStr()}.md`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };

        const doPrint = () => {
            const sections = getFilteredOrAll();
            const remaining = totalSessions(sections).total - totalSessions(sections).done;
            const projDailyMins = computeProjDailyMins(remaining);

            // Compute per-unit finish dates based on the plan's avgMins + projDailyMins
            let cumMins = 0;
            const html = sections.map(sec => {
                const ss = sectionSessions(sec);
                const cefr = sec.cefr?.level || sec.cefrLevel || '';
                return `<section>
                  <h2>Section ${sec.index}${cefr ? ` (${cefr})` : ''} <small>[${sec.type}] — ${ss.done}/${ss.total}</small></h2>
                  ${(sec.units || []).map(u => {
                      cumMins += unitRemaining(u) * planState.avgMins;
                      const finishDays = projDailyMins > 0 ? cumMins / projDailyMins : Infinity;
                      const finishStr = isFinite(finishDays) && unitRemaining(u) > 0 ? ` · est. ${forecastDate(finishDays)}` : '';
                      const us = unitSessions(u);
                      return `<div class="unit">
                          <h3>Unit ${u.unitNumber} — ${esc(u.teachingObjective || '')} <small>(${us.done}/${us.total}${finishStr})</small></h3>
                          <ul>${(u.levels || []).map(l => {
                              const r = levelSessions(l);
                              const c = l.pathLevelClientData || {};
                              const label = c.teachingObjective || c.duoRadioSummary?.name || c.storyName || l.debugName;
                              const done = COMPLETE_STATES.has(l.state) || r.done >= r.total;
                              return `<li><label><input type="checkbox" ${done ? 'checked' : ''} disabled> <span class="type">[${l.type}]</span> ${esc(label)} <span class="sess">${r.done}/${r.total}</span></label></li>`;
                          }).join('')}</ul>
                      </div>`;
                  }).join('')}
                </section>`;
            }).join('');
            const w = window.open('', '_blank');
            if (!w) return;
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(currentCourseName)} — Study Plan</title>
            <style>
              body { font-family: system-ui, sans-serif; max-width: 900px; margin: 20px auto; padding: 0 20px; color: #222; }
              h1 { font-size: 22px; margin: 0 0 6px; }
              h2 { font-size: 16px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #58cc02; }
              h3 { font-size: 14px; margin: 12px 0 4px; }
              small { color: #888; font-weight: normal; font-size: 12px; }
              ul { list-style: none; padding-left: 8px; margin: 4px 0; }
              li { padding: 2px 0; font-size: 13px; }
              label { cursor: default; display: flex; align-items: center; gap: 6px; }
              input[type=checkbox] { margin: 0; }
              .type { color: #666; font-size: 11px; }
              .sess { font-family: monospace; color: #066; font-size: 11px; margin-left: auto; }
              .meta { color: #888; font-size: 12px; margin-bottom: 16px; }
              @media print { h2 { page-break-after: avoid; } h3 { page-break-after: avoid; } section { page-break-inside: auto; } }
            </style>
            </head><body>
            <h1>${esc(currentCourseName)} — Study Plan</h1>
            <div class="meta">Generated ${localDateStr()} · Press Ctrl+P / Cmd+P to save as PDF</div>
            ${html}
            </body></html>`);
            w.document.close();
        };

        const doPng = () => {
            const totals = totalSessions(currentData);
            const current = findCurrentPosition(currentData);
            const percent = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
            const pace = summariesCache ? computePace(summariesCache, parseInt(fcWindow.value, 10)) : null;
            const remaining = totals.total - totals.done;
            const projDate = pace && pace.pace > 0 ? forecastDate(remaining / pace.pace) : '—';
            let streak = 0;
            if (summariesCache) {
                streak = computeStreak(summariesCache).current;
            }

            const isDark = inner.classList.contains('dark');
            const W = 800, H = 420;
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d');

            const grad = ctx.createLinearGradient(0, 0, W, H);
            grad.addColorStop(0, '#58cc02');
            grad.addColorStop(1, '#1cb0f6');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            ctx.fillStyle = isDark ? '#1a1a1a' : '#fff';
            roundRect(ctx, 30, 30, W - 60, H - 60, 20);
            ctx.fill();

            const fgColor = isDark ? '#e0e0e0' : '#333';
            const mutedColor = isDark ? '#999' : '#888';
            const lineColor = isDark ? '#333' : '#eee';

            ctx.fillStyle = fgColor;
            ctx.font = 'bold 22px system-ui, sans-serif';
            ctx.fillText(currentCourseName || 'Duolingo Progress', 60, 90);

            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(60, 110); ctx.lineTo(W - 60, 110); ctx.stroke();

            ctx.fillStyle = '#58cc02';
            ctx.font = 'bold 84px system-ui, sans-serif';
            ctx.fillText(`${percent}%`, 60, 230);
            ctx.fillStyle = mutedColor;
            ctx.font = '14px system-ui, sans-serif';
            ctx.fillText('of the course complete', 60, 255);

            ctx.fillStyle = fgColor;
            ctx.font = '16px system-ui, sans-serif';
            ctx.fillText(current ? `Section ${current.section.index} · ${current.unit.teachingObjective || 'Unit ' + current.unit.unitNumber}` : 'Course complete 🎉', 60, 300);

            const rx = W / 2 + 60;
            let ry = 170;
            const stats = [
                [`${totals.done} / ${totals.total}`, 'sessions completed'],
                [`${remaining}`, 'sessions remaining'],
                [`${streak}`, 'day streak'],
                [projDate, 'projected finish']
            ];
            stats.forEach(([val, label]) => {
                ctx.fillStyle = fgColor;
                ctx.font = 'bold 22px system-ui, sans-serif';
                ctx.fillText(val, rx, ry);
                ctx.fillStyle = mutedColor;
                ctx.font = '12px system-ui, sans-serif';
                ctx.fillText(label, rx, ry + 18);
                ry += 58;
            });

            ctx.fillStyle = isDark ? '#555' : '#ccc';
            ctx.font = '11px system-ui, sans-serif';
            ctx.fillText(`duolingo path viewer · ${localDateStr()}`, 60, H - 50);

            const a = document.createElement('a');
            a.href = c.toDataURL('image/png');
            a.download = `duolingo-progress-${localDateStr()}.png`;
            document.body.appendChild(a); a.click(); a.remove();
        };

        // ---------- Activity fetch ----------
        const fetchAndRender = async (force = false) => {
            if (!currentData) { fcContent.innerHTML = '<div class="dlv-error">Load the path first.</div>'; return; }
            if (!force && summariesCache && summariesFetchedAt && (Date.now() - summariesFetchedAt < 5 * 60 * 1000)) {
                renderForecast();
                renderPlan();
                return;
            }
            const token = currentToken || (currentState ? getAuthToken(currentState) : null);
            const userId = currentUserId || (currentState ? findUserId(currentState, token) : null);
            if (!token) { fcContent.innerHTML = '<div class="dlv-error">No auth token captured. Reload the Duolingo page, browse to /learn, then retry.</div>'; return; }
            if (!userId) { fcContent.innerHTML = '<div class="dlv-error">No userId found in state or JWT.</div>'; return; }
            loadBtn.disabled = true;
            fcContent.innerHTML = '<div class="dlv-status">Fetching daily activity…</div>';
            try {
                const res = await fetchDailySummaries(userId, token, 400);
                summariesCache = res.list;
                summariesFetchedAt = Date.now();
                endpointUsed = res.endpoint;
                renderForecast();
                renderPlan();
            } catch (e) {
                fcContent.innerHTML = `<div class="dlv-error">Failed to fetch activity:\n${esc(e.message)}</div>`;
            } finally {
                loadBtn.disabled = false;
            }
        };

        // ---------- Events ----------
        btn.addEventListener('click', () => { modal.classList.add('open'); if (!currentData) loadPath(); });
        closeBtn.addEventListener('click', () => modal.classList.remove('open'));
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

        refreshBtn.addEventListener('click', async () => {
            const hadActivity = !!summariesCache;
            await loadPath();
            if (hadActivity && currentData) await fetchAndRender(true);
        });

        downloadBtn.addEventListener('click', doJson);
        themeBtn.addEventListener('click', () => {
            const isDark = inner.classList.toggle('dark');
            themeBtn.textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
        });
        vbClose.addEventListener('click', () => { visitBanner.style.display = 'none'; });

        let filterTimer = null;
        const onFilter = () => { clearTimeout(filterTimer); filterTimer = setTimeout(renderPath, 120); };
        filterText.addEventListener('input', onFilter);
        filterType.addEventListener('change', renderPath);
        filterState.addEventListener('change', renderPath);
        filterClear.addEventListener('click', () => {
            filterText.value = ''; filterType.value = 'all'; filterState.value = 'all'; renderPath();
        });
        filterExpand.addEventListener('click', () => {
            pathContent.querySelectorAll('details').forEach(d => d.open = true);
        });
        filterCollapse.addEventListener('click', () => {
            pathContent.querySelectorAll('details.unit-done').forEach(d => d.open = false);
            pathContent.querySelectorAll('details.done').forEach(d => d.open = false);
        });

        loadBtn.addEventListener('click', () => fetchAndRender(false));
        fcWindow.addEventListener('change', () => {
            if (!planState.avgMinsIsCustom) {
                planState.avgMins = null;
                savePlanState();
            }
            if (summariesCache) { renderForecast(); renderPlan(); }
        });

        // Daily goal input delegation
        fcContent.addEventListener('input', (e) => {
            if (e.target.classList.contains('goal-input')) {
                const v = parseInt(e.target.value, 10);
                if (isFinite(v) && v >= 1 && v <= 50) {
                    dailyGoal = v;
                    localStorage.setItem(GOAL_KEY, String(dailyGoal));
                    const todayStr = localDateStr();
                    const todayRec = summariesCache ? summariesCache.find(s => s.date === todayStr) : null;
                    const todaySessions = todayRec ? sessionsOf(todayRec) : 0;
                    const status = fcContent.querySelector('.goal-status');
                    if (status) {
                        const met = todaySessions >= dailyGoal;
                        status.textContent = met ? '✓ Goal reached!' : `${Math.max(0, dailyGoal - todaySessions).toFixed(0)} to go`;
                        status.className = 'goal-status ' + (met ? 'done' : 'pending');
                    }
                }
            }
        });

        exJson.addEventListener('click', doJson);
        exCsv.addEventListener('click', doCsv);
        exMd.addEventListener('click', doMarkdown);
        exPrint.addEventListener('click', doPrint);
        exPng.addEventListener('click', doPng);

        shadow.querySelectorAll('.dlv-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const name = tab.getAttribute('data-tab');
                shadow.querySelectorAll('.dlv-tab').forEach(t => t.classList.toggle('active', t === tab));
                shadow.querySelectorAll('.dlv-panel').forEach(p => p.classList.toggle('active', p.getAttribute('data-panel') === name));
                if (name === 'plan' && summariesCache) renderPlan();
            });
        });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
    else buildUI();
})();
