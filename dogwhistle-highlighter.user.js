// ==UserScript==
// @name         Dogwhistle Highlighter
// @namespace    http://tampermonkey.net/
// @version      2.1
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
     * Two config sources, resolved once at startup:
     *
     *   A) JSON_CONFIG — a JSON string (usually a template literal),
     *      typically pasted from the Collector script's export.
     *      If non-empty and valid, it fully overrides configFragments.
     *      Format: [ { "match": string | string[], "context": string }, ... ]
     *
     *   B) configFragments — the JS-literal default config.
     *      Used when JSON_CONFIG is empty, or as a fallback when
     *      JSON_CONFIG fails to parse.
     * ============================================================ */
    const JSON_CONFIG = `
    [
  {
    "match": [
      "😭💢",
      "💢😭",
      "🍯🐻",
      "🐻🍯",
      "🧸🍯",
      "🍯🧸",
      "🍭🧸",
      "🧸🍭",
      "🧼🧸",
      "🧸🧼",
      "🪀🧃",
      "🧃🪀",
      "🍟🐣",
      "🐣🍟",
      "🕊️🍭",
      "🍭🕊️",
      "🕊️🌈",
      "🌈🕊️",
      "🕊️⚔️",
      "⚔️🕊️"
    ],
    "context": "It is often used as a dog whistle for shotacons (attracted to a masculine minor). Used in bios (biographies), hashtags and display names."
  },
  {
    "match": [
      "🌈🍓",
      "🍓🌈"
    ],
    "context": "It is often used as a dog whistle for radqueers generally. Used in bios (biographies), hashtags and display names."
  },
  {
    "match": [
      "πφ"
    ],
    "context": "This combination of letters is a dogwhistle which means 'paraphile'."
  },
  {
    "match": [
      "ζ"
    ],
    "context": "This is the main symbol used by zoophiles, it is also a regular letter of the greek alphabet (zeta)."
  },
  {
    "match": [
      "🌈🍖",
      "🍖🌈"
    ],
    "context": "Pro-ship emoji combination dogwhistle."
  },
  {
    "match": [
      "🍋🌈",
      "🌈🍋"
    ],
    "context": "Pro-fic emoji combination dogwhistle."
  },
  {
    "match": [
      "🦥🌈"
    ],
    "context": "Slothqueer"
  },
  {
    "match": [
      "🚫🥤"
    ],
    "context": "Nemaguaqueer"
  },
  {
    "match": [
      "⭕️🌈"
    ],
    "context": "Radjectum"
  },
  {
    "match": [
      "🤍🗝️"
    ],
    "context": "Pro-consent, note that this is an emoji dog whistle, so the context in which consent is supported is probably irregular."
  },
  {
    "match": [
      "😵🩶"
    ],
    "context": "Necrsensual consent"
  },
  {
    "match": [
      "🔄🩹"
    ],
    "context": "transharmed"
  },
  {
    "match": [
      "🪼☁️"
    ],
    "context": "transage"
  },
  {
    "match": [
      "🩸📍"
    ],
    "context": "permapain"
  },
  {
    "match": [
      "🎶💙"
    ],
    "context": "miku fickin"
  },
  {
    "match": [
      "🍋💦"
    ],
    "context": "piss kink"
  },
  {
    "match": [
      "💧☂️"
    ],
    "context": "dacryphilia"
  },
  {
    "match": [
      "🍮🍓"
    ],
    "context": "subliminal user"
  },
  {
    "match": [
      "🎶🌙"
    ],
    "context": "ug sub user"
  },
  {
    "match": [
      "🦴🌷"
    ],
    "context": "maishe"
  },
  {
    "match": [
      "Ⰱ"
    ],
    "context": "unhealthy para"
  },
  {
    "match": [
      "⎇"
    ],
    "context": "Alterhuman"
  },
  {
    "match": [
      "≗"
    ],
    "context": "egosyntonic para"
  },
  {
    "match": [
      "θη"
    ],
    "context": "Trauma(tized) paraphile, the paraphilia is trauma induced."
  },
  {
    "match": [
      "💭🧿"
    ],
    "context": "Fantapara, paraphilic attraction to the imagined."
  },
  {
    "match": [
      "🥄⚙️"
    ],
    "context": "Auto-paraphilia, attraction to oneself in a paraphilic scenario."
  },
  {
    "match": [
      "🍳⚙️"
    ],
    "context": "Pan Auto-Paraphilia, attraction to oneself in all scenarios."
  },
  {
    "match": [
      "☀️🧸",
      "🧸🧶",
      "🌸✨",
      "🌟⏲️",
      "🎀🍦"
    ],
    "context": "Minor Attracted Minor/Minor MAP, a minor that is attracted to other minors."
  },
  {
    "match": [
      "🧃🍸",
      "🧸🍸",
      "🍧🍸"
    ],
    "context": "Minor MAP V1 - that is, a Minor Attracted Person who is a minor."
  },
  {
    "match": [
      "🧃☀️",
      "🧸☀️",
      "🍧☀️"
    ],
    "context": "Minor MAP V2 - that is, a Minor Attracted Person who is a minor."
  },
  {
    "match": [
      "🧃🗺️",
      "🧸🗺️",
      "🍧🗺️"
    ],
    "context": "Minor MAP V3 - that is, a Minor Attracted Person who is a minor."
  },
  {
    "match": [
      "🗺️💝"
    ],
    "context": "MAPophilia, people who are attracted to MAPs."
  },
  {
    "match": [
      "🍇🍸"
    ],
    "context": "Infantophilia, attraction to infants."
  },
  {
    "match": [
      "🍓🍸"
    ],
    "context": "Nepiophilia, attraction to toddlers and infants."
  },
  {
    "match": [
      "🍍🍸"
    ],
    "context": "Pedophilia, attraction to the prepubescent."
  },
  {
    "match": [
      "🍒🍸"
    ],
    "context": "Hebephilia, attraction to the pubescent."
  },
  {
    "match": [
      "🫒🍸"
    ],
    "context": "Ephebephilia, attraction to the post-prepubescent."
  },
  {
    "match": [
      "🐰🎀"
    ],
    "context": "It is often used as a dog whistle for lolicons (attracted to a feminine minor). Used in bios (biographies), hashtags and display names."
  },
  {
    "match": [
      "1488"
    ],
    "context": "Nazi white supremacist dogwhistle. The 14 is the white supremacist part and corresponds to the fourteen word slogan \"We must secure the existence of our people and a future for white children,\" spoken by American neo-Nazi David Eden Lane. The rest of the slogan reads: \"because the beauty of the White Aryan woman must not perish from the earth.\"\n\nThe 88 is the Nazi part, it refers to the 8th letter of the alphabet, H. So 88 is HH, which means \"Heil Hitler\"."
  },
  {
    "match": [
      "1312"
    ],
    "context": "All Cops Are Bastards, from the acronym ACAB, with the numbers each corresponding to a letter in the alphabet. This is a dogwhistle associated with anti-fascists and anarchists, as well as general police abolitionists."
  },
  {
    "match": [
      "💀🍭"
    ],
    "context": "It is often used as a dog whistle for cronacons (attracted to a non-binary minor). Used in bios (biographies), hashtags and display names."
  },
  {
    "match": [
      "🎒🍭"
    ],
    "context": "It is often used as a dog whistle for kodocons (attracted to a minor). Used in bios (biographies), hashtags and display names."
  },
  {
    "match": [
      "🔖🍸",
      "🔖☀️",
      "🔖🗺️"
    ],
    "context": "Fictional MAP, Minor Attracted People who are attracted only to fictional minors."
  },
  {
    "match": [
      "💭🗺️",
      "💭🍸",
      "💭☀️"
    ],
    "context": "FantaMAP, Minor Attracted People who are only attracted to minors in their imagination."
  },
  {
    "match": [
      "🗺️💤"
    ],
    "context": "SomnoMAP, Minor Attracted People who are also somnophiles (sexually aroused by someone being asleep)."
  },
  {
    "match": [
      "🍼🥄",
      "✨🧸",
      "🍎🍑"
    ],
    "context": "AutoMAP, minors who are Minor Attracted Persons and attracted to themselves or people who are aroused by the thought of being a minor."
  },
  {
    "match": [
      "🧸🍓"
    ],
    "context": "Autonepiophilia, Oneself Being a Toddler/Infant Attracted"
  },
  {
    "match": [
      "🧸🍍"
    ],
    "context": "Autopedophilia, Oneself Being Prepubescent Attracted"
  },
  {
    "match": [
      "🧸🍒"
    ],
    "context": "Autohebephilia, Oneself Being Pubescent Attracted"
  },
  {
    "match": [
      "🧸🫒"
    ],
    "context": "Autoephebephilia, Oneself Being Post-Prepubescent Attracted"
  },
  {
    "match": [
      "🧃💤"
    ],
    "context": "SomnoAAM, an Adult Attracted Minors who are also a somnophiles (sexually aroused by someone being asleep)."
  },
  {
    "match": [
      "🌸🥤"
    ],
    "context": "\"AAM Loli\", an Adult Attracted Minor who is feminine."
  },
  {
    "match": [
      "🫐🥤"
    ],
    "context": "\"AAM Shota\", an Adult Attracted Minor who is masculine."
  },
  {
    "match": [
      "🍀🥤"
    ],
    "context": "\"AAM Kodo\", an Adult Attracted Minor who is non-binary."
  },
  {
    "match": [
      "🌻🥤"
    ],
    "context": "\"AAM Nana/Crona\", an Adult Attracted Minor who is androgynous."
  },
  {
    "match": [
      "🧃🥤"
    ],
    "context": "\"AAM Xip\", an \"Adult Attracted Xeno-Aligned Minor\"."
  },
  {
    "match": [
      "⚠️💫"
    ],
    "context": "This can stand for Adumi (ADUlt + MInor) which is an alternative word for pedophilia."
  },
  {
    "match": [
      "🌙 🍺"
    ],
    "context": "Teleiophilia, attraction to adults."
  },
  {
    "match": [
      "👥🌼"
    ],
    "context": "Autoincestphilia, paraphilic attraction to people related to you being attracted to you."
  },
  {
    "match": [
      "🔖🌹",
      "🔖🥀"
    ],
    "context": "Ficto-Biastophilia, someone who is attracted to fictional rape."
  },
  {
    "match": [
      "🍸🌹"
    ],
    "context": "Dopephilia, attraction to sexually assaulting a child."
  },
  {
    "match": [
      "💊🌹"
    ],
    "context": "Narkobiastophilia, attraction to drugging and raping."
  },
  {
    "match": [
      "🌹🥩"
    ],
    "context": "Anthropophagolagnia, attraction to raping and cannibalizing."
  },
  {
    "match": [
      "❣️🧷"
    ],
    "context": "Masochism, attraction to being hurt."
  },
  {
    "match": [
      "❣️👁️"
    ],
    "context": "Sadism, attraction to hurting others or others being in pain."
  },
  {
    "match": [
      "🤕❌"
    ],
    "context": "Antisadism, attraction to 'antis' being in pain. An anti is someone who in some way opposes radqueers."
  },
  {
    "match": [
      "🤕🍸"
    ],
    "context": "Pedosadism, attraction to underage people being in pain."
  },
  {
    "match": [
      "🪦🗺️"
    ],
    "context": "NecroMAP, a Minor Attracted Person who is a necrophile (sexual attraction or acts involving corpses)."
  },
  {
    "match": [
      "🥩♀️",
      "🥩👧"
    ],
    "context": "Gynophagia, attraction to cooking and or eating human females."
  },
  {
    "match": [
      "🌄🫶",
      "🌱☂️",
      "🪴🌹"
    ],
    "context": "Botanophilia, attraction to plants."
  },
  {
    "match": [
      "⚙️🐾"
    ],
    "context": "Autozoophilia, attraction to oneself as an animal."
  },
  {
    "match": [
      "🦠🐱💜"
    ],
    "context": "FIVphilia, attraction to feline Immunodeficiency virus."
  },
  {
    "match": [
      "🍼🐾"
    ],
    "context": "Zoopedophilia, attraction to young animals."
  },
  {
    "match": [
      "😽🍭"
    ],
    "context": "Kittoamory, attraction to kittens as a type of zoophilia."
  }
]
`;

    const configFragments = [
        {
            match: ["😭💢", "💢😭", "🍯🐻", "🐻🍯", "🧸🍯", "🍯🧸", "🍭🧸", "🧸🍭", "🧼🧸", "🧸🧼", "🪀🧃", "🧃🪀", "🍟🐣", "🐣🍟", "🕊️🍭", "🍭🕊️", "🕊️🌈", "🌈🕊️", "🕊️⚔️", "⚔️🕊️", "🧸☀️", "☀️🧸"],
            context: "It is often used as a dog whistle for shotacons. Used in bios (biographies), hashtags and display names."
        },
        {
            match: ["🌈🍓", "🍓🌈"],
            context: "It is often used as a dog whistle for radqueers generally. Used in bios (biographies), hashtags and display names."
        },
        // ...rest of your default config...
    ];

    function resolveConfig() {
        const raw = (typeof JSON_CONFIG === 'string') ? JSON_CONFIG.trim() : '';
        if (!raw) {
            return { source: 'js', config: configFragments };
        }

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            console.error('[DH] JSON_CONFIG is not valid JSON:', e.message);
            if (/Unexpected token|Unexpected string|Unexpected end/i.test(e.message)) {
                console.error('[DH] Tip: strict JSON does not allow trailing commas or // comments.');
                console.error('[DH] If you pasted from configFragments, remove the trailing commas.');
            }
            console.warn('[DH] Falling back to configFragments.');
            return { source: 'js', config: configFragments, error: e.message };
        }

        const entries = Array.isArray(parsed) ? parsed : [parsed];
        const valid = entries.filter(e =>
                                     e && typeof e === 'object' &&
                                     (typeof e.match === 'string' || Array.isArray(e.match)) &&
                                     typeof e.context === 'string'
                                    );

        // All entries present but none valid → likely a structural mistake.
        // Fall back rather than silently disabling the whole script.
        if (entries.length > 0 && valid.length === 0) {
            console.error('[DH] JSON_CONFIG parsed, but no entry has the shape { match: string|string[], context: string }.');
            console.warn('[DH] Falling back to configFragments.');
            return { source: 'js', config: configFragments, error: 'all entries malformed' };
        }

        if (valid.length !== entries.length) {
            console.warn(`[DH] JSON_CONFIG: dropped ${entries.length - valid.length} malformed entries.`);
        }
        if (valid.length === 0) {
            console.warn('[DH] JSON_CONFIG is an empty array — no terms will be highlighted.');
        }

        return { source: 'json', config: valid };
    }

    const resolved = resolveConfig();
    const activeConfig = resolved.config;
    const configSource = resolved.source;

    if (configSource === 'json') {
        console.log(`[DH] Using JSON_CONFIG (${activeConfig.length} entr${activeConfig.length === 1 ? 'y' : 'ies'}).`);
    } else {
        console.log(`[DH] Using configFragments (${activeConfig.length} entr${activeConfig.length === 1 ? 'y' : 'ies'}).`);
        if (resolved.error) console.warn('[DH] (fell back from JSON_CONFIG due to the error above)');
    }

    /* ---------- Expand arrays → flat list of {match, context} ---------- */
    const fragments = [];
    const fragmentByMatch = new Map();
    for (const entry of activeConfig) {
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
        .config-badge {
            font-size: 9px; font-weight: 700; letter-spacing: .5px;
            background: rgba(255,255,255,.25); color: #fff;
            padding: 2px 5px; border-radius: 3px;
            margin-left: 6px; vertical-align: middle;
            text-transform: uppercase;
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
            <span>Dogwhistle terms <span class="config-badge" hidden>JSON</span></span>
            <button class="close" aria-label="Close">✕</button>
        </div>
        <ul class="panel-list"></ul>
        <div class="panel-footer">
            <button class="dismiss">Hide for this page</button>
        </div>
    `;
    shadow.appendChild(panel);
    if (configSource === 'json') {
        panel.querySelector('.config-badge').hidden = false;
    }

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
        console.log('config source:', configSource === 'json' ? 'JSON_CONFIG' : 'configFragments');
        console.log('config entries:', activeConfig.length);
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
