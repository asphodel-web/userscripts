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
    "context": "Dog whistle used by 'shotacons' — people who express sexual attraction to minors with a masculine presentation. Typically appears in user bios, display names, and hashtags. On its own each emoji pair is innocuous, so treat it as a signal only in those self-identification contexts, not in ordinary posts."
  },
  {
    "match": [
      "🌈🍓",
      "🍓🌈"
    ],
    "context": "Dog whistle for 'radqueer' identity — an umbrella term for users who normalize paraphilic and 'transidentity' labels, often including attraction to minors. Mostly seen in bios, display names, and hashtags. The rainbow alone is a common LGBTQ+ symbol, so require additional context before acting."
  },
  {
    "match": [
      "πφ"
    ],
    "context": "Abbreviation of 'paraphile' using Greek letters. Used as a discreet self-identification in bios and usernames. Note that π and φ are ordinary Greek letters, so the sequence only matters as a deliberate identity marker."
  },
  {
    "match": [
      "ζ",
      "𐤀",
      "◤✦◢",
      "💕🕊️"
    ],
    "context": "The zeta symbol is the main self-identification marker for zoophiles (sexual attraction to animals). High false-positive risk: zeta is a standard Greek letter used in maths, science, and Greek text. Flag only when it appears as a standalone identity claim (e.g. alone in a bio, or paired with pro-zoophile slogans)."
  },
  {
    "match": [
      "🌈🍖",
      "🍖🌈"
    ],
    "context": "Emoji combination used as a 'pro-ship' dog whistle — the pro-shipping community argues that any fictional content, including sexualized depictions of minors, is acceptable. Found in bios, display names, and hashtags."
  },
  {
    "match": [
      "🍋🌈",
      "🌈🍋"
    ],
    "context": "Emoji combination used as a 'pro-fic' dog whistle — a rebranding of the pro-ship stance focused on defending explicit fiction, including content involving minors. Found in bios, display names, and hashtags."
  },
  {
    "match": [
      "🦥🌈"
    ],
    "context": "'Slothqueer' — a radqueer-adjacent identity label. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🚫🥤"
    ],
    "context": "'Nemaguaqueer' — a radqueer-adjacent identity label. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "⭕️🌈"
    ],
    "context": "'Radjectum' — a radqueer-adjacent identity label. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🤍🗝️"
    ],
    "context": "'Pro-consent' marker used within radqueer circles. The intended meaning is broader than everyday consent advocacy — it is typically used to argue that taboo or harmful relationships are acceptable if 'consented to', which can include situations where valid consent is impossible. Treat as a community-membership signal rather than an innocent statement about consent."
  },
  {
    "match": [
      "😵🩶"
    ],
    "context": "'Necrosensual consent' — a radqueer-adjacent label describing claimed consent in the context of necrophilia. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🔄🩹"
    ],
    "context": "'Transharmed' — a radqueer-adjacent identity label in which a person claims to 'identify as' being harmed, injured, or disabled, often romanticizing self-harm. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🪼☁️",
      "⋈",
      "|⋈|",
      ">⋈⧖<"
    ],
    "context": "'Transage' — a radqueer-adjacent identity label in which a person claims to be a different age than their biological age, including identifying as a minor. Used as a self-identification marker in bios and display names; can be used to blur accountability in age-inappropriate interactions."
  },
  {
    "match": [
      "🩸📍",
      "🌡️🩸",
      "📍🥊",
      "🎭📌"
    ],
    "context": "'Permapain' — a radqueer-adjacent identity label in which a person claims to 'identify as' permanently injured or in chronic pain, often alongside self-harm content. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🎶💙"
    ],
    "context": "'Miku fickin' — identifies as a fictional-kin of Hatsune Miku. Generally a harmless fictionkin label on its own; relevant mainly as an indicator of adjacent community spaces."
  },
  {
    "match": [
      "🍋💦"
    ],
    "context": "Marker for a urine kink ('piss kink'). Between consenting adults this is not itself a policy violation, but the emoji set is used here because it frequently co-occurs with the other radqueer markers in this dataset."
  },
  {
    "match": [
      "💧☂️",
      "⛲🌞",
      "🌊✨"
    ],
    "context": "Marker for dacryphilia — sexual arousal from tears or crying. Between consenting adults this is not itself a policy violation, but it frequently co-occurs with the other radqueer markers in this dataset."
  },
  {
    "match": [
      "🍮🍓"
    ],
    "context": "'Subliminal user' — signals that the user consumes or creates 'subliminal' audio/video content claimed to change identity traits. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🎶🌙"
    ],
    "context": "'UG sub user' — user of 'underground subliminal' content, an unmoderated subliminal community frequently associated with pro-ana and other harmful content. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🦴🌷"
    ],
    "context": "'Maishe' — a radqueer-adjacent identity label. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "Ⰱ"
    ],
    "context": "Glagolitic letter used as a marker for an 'unhealthy paraphilia' — a paraphilic attraction the user themselves labels harmful or disordered. Discreet self-identification symbol; the character has legitimate uses in historical and linguistic contexts, so flag only when used as a bio marker."
  },
  {
    "match": [
      "⎇"
    ],
    "context": "The 'alt key' symbol, used as the marker for the 'alterhuman' community — people who identify as non-human or other-than-human. Broad and mostly benign on its own; relevant as an indicator of adjacent identity communities where the more serious markers in this dataset circulate."
  },
  {
    "match": [
      "≗"
    ],
    "context": "Used to mark an 'egosyntonic paraphilia' — a paraphilic attraction the user considers acceptable and in line with their self-image, i.e. one they embrace rather than wish to change. Discreet self-identification symbol in bios and display names."
  },
  {
    "match": [
      "θη"
    ],
    "context": "Greek-letter abbreviation marking a 'traumagenic paraphile' — someone whose paraphilic attraction is, by their own account, the result of trauma. Used as a self-identification marker in bios and usernames; the sequence is otherwise uncommon."
  },
  {
    "match": [
      "💭🧿"
    ],
    "context": "'Fantapara' — a paraphilic attraction experienced only toward imagined scenarios or fictional characters, as opposed to real people. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🥄⚙️",
      "⚙️💕"
    ],
    "context": "'Auto-paraphilia' — arousal from imagining oneself in a paraphilic scenario. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🍳⚙️"
    ],
    "context": "'Pan auto-paraphilia' — arousal from imagining oneself in paraphilic scenarios of all kinds. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "☀️🧸",
      "🧸🧶",
      "🌸✨",
      "🌟⏲️",
      "🎀🍦"
    ],
    "context": "Markers for a 'Minor Attracted Minor' (also 'Minor MAP') — a self-identified minor who reports sexual attraction to other minors. Note the emojis themselves are common cutesy decorations, so they should only be treated as dog whistles when used as deliberate bio/name markers alongside other MAP vocabulary."
  },
  {
    "match": [
      "🧃🍸",
      "🧸🍸",
      "🍧🍸"
    ],
    "context": "Variant 1 of the 'Minor MAP' marker set — a self-identified minor who identifies as a Minor Attracted Person (MAP, i.e. someone attracted to minors). Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🧃☀️",
      "🧸☀️",
      "🍧☀️"
    ],
    "context": "Variant 2 of the 'Minor MAP' marker set — a self-identified minor who identifies as a Minor Attracted Person (MAP). Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🧃🗺️",
      "🧸🗺️",
      "🍧🗺️"
    ],
    "context": "Variant 3 of the 'Minor MAP' marker set — a self-identified minor who identifies as a Minor Attracted Person (MAP). Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🗺️💝"
    ],
    "context": "'MAPophilia' — attraction directed at people who identify as MAPs. Used as a self-identification marker in bios and display names; signals proximity to MAP communities even though the attraction is nominally toward adults."
  },
  {
    "match": [
      "🍇🍸"
    ],
    "context": "Marker for infantophilia — sexual attraction to infants (roughly 0–2 years old). Self-identification marker used in MAP community spaces, bios, and display names. High-severity signal."
  },
  {
    "match": [
      "🍓🍸"
    ],
    "context": "Marker for nepiophilia — sexual attraction to infants and toddlers. Self-identification marker used in MAP community spaces, bios, and display names. High-severity signal."
  },
  {
    "match": [
      "🍍🍸"
    ],
    "context": "Marker for pedophilia — sexual attraction to prepubescent children. Self-identification marker used in MAP community spaces, bios, and display names. High-severity signal."
  },
  {
    "match": [
      "🍒🍸"
    ],
    "context": "Marker for hebephilia — sexual attraction to children in early puberty (roughly 11–14). Self-identification marker used in MAP community spaces, bios, and display names. High-severity signal."
  },
  {
    "match": [
      "🫒🍸"
    ],
    "context": "Marker for ephebephilia — sexual attraction to post-pubescent adolescents (roughly 15–19). Self-identification marker used in MAP community spaces, bios, and display names; note the target group overlaps with legal adult attraction in some jurisdictions, but the marker signals MAP-community membership."
  },
  {
    "match": [
      "🐰🎀",
      "🍭💥",
      "🎀🍭",
      "🛼🫧",
      "🌸🍭",
      "🐁🪷",
      "🍪🎁",
      "🩰🍓",
      "🎀🐰"
    ],
    "context": "Dog whistle used by 'lolicons' — people who express sexual attraction to minors with a feminine presentation. Typically appears in bios, display names, and hashtags. The bunny/ribbon pair is also common in innocent aesthetic contexts, so treat it as a signal only in self-identification contexts."
  },
  {
    "match": [
      "1488"
    ],
    "context": "Neo-Nazi white supremacist dog whistle. The '14' stands for the 14-word slogan coined by American neo-Nazi David Lane: 'We must secure the existence of our people and a future for white children.' The '88' encodes 'HH' (H is the 8th letter of the alphabet) for 'Heil Hitler.' Note: check context — the same digits can appear in prices, dates, or usernames innocently; the dog whistle reading applies when used as an identity or affiliation signal."
  },
  {
    "match": [
      "1312"
    ],
    "context": "Numeric encoding of ACAB ('All Cops Are Bastards' — 1/3/1/2 = A/C/A/B). Associated with anti-fascist, anarchist, and police-abolitionist movements. Widely used as an ordinary political slogan; not inherently harmful, but included because it helps moderators understand a user's ideological alignment."
  },
  {
    "match": [
      "💀🍭"
    ],
    "context": "Dog whistle used by 'cronacons' — people who express sexual attraction to non-binary minors. Typically appears in bios, display names, and hashtags."
  },
  {
    "match": [
      "🎒🍭",
      "🌹🍭",
      "🍭🎒"
    ],
    "context": "Dog whistle used by 'kodocons' — people who express sexual attraction to minors (generic). The backpack emoji emphasizes the school-age association. Typically appears in bios, display names, and hashtags."
  },
  {
    "match": [
      "🔖🍸",
      "🔖☀️",
      "🔖🗺️"
    ],
    "context": "'Fictional MAP' — a Minor Attracted Person who claims their attraction applies only to fictional minors (e.g. drawn or written characters). Used as a self-identification marker in bios and display names; signals MAP-community membership."
  },
  {
    "match": [
      "💭🗺️",
      "💭🍸",
      "💭☀️"
    ],
    "context": "'FantaMAP' — a Minor Attracted Person who claims their attraction to minors exists only in their imagination and never toward real children. Used as a self-identification marker in bios and display names; signals MAP-community membership."
  },
  {
    "match": [
      "🗺️💤"
    ],
    "context": "'SomnoMAP' — a Minor Attracted Person who is also a somnophile (aroused by unconscious or sleeping people). Used as a self-identification marker in bios and display names. High-severity signal due to the combination with minor attraction."
  },
  {
    "match": [
      "🍼🥄",
      "✨🧸",
      "🍎🍑",
      "💞🐾",
      "✨🥄",
      "🧸🍎"
    ],
    "context": "'AutoMAP' — used by minors who identify as Minor Attracted Persons and report attraction to themselves, or by people aroused by the idea of being a minor. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🧸🍓"
    ],
    "context": "'Autonepiophilia' — arousal from imagining oneself as an infant or toddler. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🧸🍍"
    ],
    "context": "'Autopedophilia' — arousal from imagining oneself as a prepubescent child. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🧸🍒"
    ],
    "context": "'Autohebephilia' — arousal from imagining oneself as a pubescent child. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🧸🫒"
    ],
    "context": "'Autoephebephilia' — arousal from imagining oneself as an adolescent. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🧃💤"
    ],
    "context": "'SomnoAAM' — an Adult Attracted Minor who is also a somnophile (aroused by sleeping/unconscious people). Used as a self-identification marker in bios and display names; self-harm and grooming risk indicators both apply."
  },
  {
    "match": [
      "🌸🥤"
    ],
    "context": "'AAM Loli' — a self-identified minor who reports attraction to adults and presents femininely. Used as a self-identification marker in bios and display names. Treat as a potential victimization/grooming risk signal rather than a simple violation."
  },
  {
    "match": [
      "🫐🥤"
    ],
    "context": "'AAM Shota' — a self-identified minor who reports attraction to adults and presents masculinely. Used as a self-identification marker in bios and display names. Treat as a potential victimization/grooming risk signal rather than a simple violation."
  },
  {
    "match": [
      "🍀🥤"
    ],
    "context": "'AAM Kodo' — a self-identified minor who reports attraction to adults and identifies as non-binary. Used as a self-identification marker in bios and display names. Treat as a potential victimization/grooming risk signal rather than a simple violation."
  },
  {
    "match": [
      "🌻🥤"
    ],
    "context": "'AAM Nana/Crona' — a self-identified minor who reports attraction to adults and identifies as androgynous. Used as a self-identification marker in bios and display names. Treat as a potential victimization/grooming risk signal rather than a simple violation."
  },
  {
    "match": [
      "🧃🥤"
    ],
    "context": "'AAM Xip' — a self-identified minor who reports attraction to adults and identifies as 'xeno-aligned'. Used as a self-identification marker in bios and display names. Treat as a potential victimization/grooming risk signal rather than a simple violation."
  },
  {
    "match": [
      "⚠️💫"
    ],
    "context": "Marker for 'Adumi' (ADUlt + MInor), a euphemism coined to rebrand adult–minor attraction, i.e. an alternative word for pedophilia designed to evade keyword filters. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🌙 🍺"
    ],
    "context": "Marker for teleiophilia — attraction to adults. On its own this is the default for most adults and not harmful; it is included because, combined with the minor-coded emoji system in this dataset, it can signal a user mapping out the attraction taxonomy used by MAP and radqueer communities."
  },
  {
    "match": [
      "👥🌼"
    ],
    "context": "Marker for 'autoincestphilia' — paraphilic arousal from the fantasy of a relative being attracted to oneself. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🔖🌹",
      "🔖🥀"
    ],
    "context": "Marker for 'ficto-biastophilia' — attraction to fictional depictions of rape. Used as a self-identification marker in bios and display names; the 'ficto-' qualifier signals it is framed as fantasy-only, but it still indicates comfort with sexual-violence content."
  },
  {
    "match": [
      "🍸🌹"
    ],
    "context": "Marker for 'dopephilia' — attraction to sexually assaulting a child. Used as a self-identification marker in bios and display names. Highest-severity signal in this dataset; any use warrants immediate review."
  },
  {
    "match": [
      "💊🌹"
    ],
    "context": "Marker for 'narkobiastophilia' — attraction to drugging and raping people. Used as a self-identification marker in bios and display names. High-severity signal indicating comfort with real-world sexual violence."
  },
  {
    "match": [
      "🌹🥩"
    ],
    "context": "Marker for 'anthropophagolagnia' — attraction to raping and cannibalizing people. Used as a self-identification marker in bios and display names. High-severity signal."
  },
  {
    "match": [
      "❣️🧷"
    ],
    "context": "Marker for masochism — arousal from being hurt. Common among consenting adults and not itself a policy violation; included because it co-occurs with the other markers in this dataset's community."
  },
  {
    "match": [
      "❣️👁️",
      "𐤑"
    ],
    "context": "Marker for sadism — arousal from hurting others or from others being in pain. Common among consenting adults and not itself a policy violation; escalate only when paired with non-consensual or minor-related markers in this dataset."
  },
  {
    "match": [
      "🤕❌"
    ],
    "context": "Marker for 'antisadism' — expressed desire for 'antis' (people who oppose radqueers, often harassment targets) to be in pain or harmed. Used as a self-identification marker; notable as a signal of hostility and potential targeting behavior toward critics."
  },
  {
    "match": [
      "🤕🍸",
      "🗺️🧸❣️",
      "🗺️🧸🩸"
    ],
    "context": "Marker for 'pedosadism' — arousal from underage people being in pain. Used as a self-identification marker in bios and display names. High-severity signal."
  },
  {
    "match": [
      "🪦🗺️",
      "μ†"
    ],
    "context": "Marker for 'NecroMAP' — a Minor Attracted Person who is also a necrophile (attraction to corpses). Used as a self-identification marker in bios and display names. High-severity signal."
  },
  {
    "match": [
      "🥩♀️",
      "🥩👧"
    ],
    "context": "Marker for 'gynophagia' — arousal from cooking and/or eating human females. Used as a self-identification marker in bios and display names. High-severity signal indicating fantasy content about real-world violence."
  },
  {
    "match": [
      "🌄🫶",
      "🌱☂️",
      "🪴🌹"
    ],
    "context": "Marker for 'botanophilia' — attraction to plants. Not itself a policy concern; included mainly as a community indicator and to prevent moderators from misreading it as a more serious marker."
  },
  {
    "match": [
      "⚙️🐾",
      "🌺🐇"
    ],
    "context": "Marker for 'autozoophilia' — arousal from imagining oneself as an animal. Used as a self-identification marker in bios and display names; adjacent to zoophile community spaces."
  },
  {
    "match": [
      "🦠🐱💜"
    ],
    "context": "Marker for 'FIVphilia' — attraction to the feline immunodeficiency virus, framed within zoophile-adjacent identity labeling. Used as a self-identification marker in bios and display names."
  },
  {
    "match": [
      "🍼🐾"
    ],
    "context": "Marker for 'zoopedophilia' — sexual attraction to young animals. Used as a self-identification marker in bios and display names. High-severity signal (animal abuse)."
  },
  {
    "match": [
      "😽🍭"
    ],
    "context": "Marker for 'kittoamory' — attraction to kittens, framed as a form of zoophilia. Used as a self-identification marker in bios and display names. High-severity signal (animal abuse)."
  },
  {
    "match": [
      "𓃊"
    ],
    "context": "'Duoparaphilia' — a paraphilic umbrella marker. Discreet self-identification symbol used in bios and display names; the hieroglyph is rare enough that it has essentially no innocent use."
  },
  {
    "match": [
      "⚥"
    ],
    "context": "'Autoandrogynephilia' — arousal from imagining oneself as androgynous. Self-identification marker used in bios and display names. Note: ⚥ is the male-and-female-sign ligature and appears in legitimate gender/sex contexts; flag only when used as a bio marker."
  },
  {
    "match": [
      "⚲"
    ],
    "context": "'Autoneuterphilia' — arousal from imagining oneself as sexless/neutered. Self-identification marker used in bios and display names; ⚲ is a rare symbol with few innocent uses."
  },
  {
    "match": [
      "χφ"
    ],
    "context": "'Chromatophilia' — in radqueer usage, attraction to colors. Greek-letter pair used as a discreet self-identification marker; the sequence is uncommon in ordinary Greek text but verify context before acting."
  },
  {
    "match": [
      "𐦴"
    ],
    "context": "'Teratophilia' — attraction to monsters, deformity, or the monstrous. Rare Unicode character used as a discreet self-identification marker; essentially no innocent use."
  },
  {
    "match": [
      "ζ†"
    ],
    "context": "'Necrozoo' — combines the zoophile symbol ζ with a dagger, marking someone who is both zoophile and necrophile. High-severity signal (animal abuse)."
  },
  {
    "match": [
      "ꙮ"
    ],
    "context": "'Gross paraphilia' umbrella marker — self-identified attraction to decay, rot, filth, or scat. Rare Cyrillic multi-ocular O used as a discreet bio marker; essentially no innocent use."
  },
  {
    "match": [
      "ᛈ"
    ],
    "context": "'Pokephilia' — sexual attraction to Pokémon. Runes occasionally appear in neo-Pagan, historic, or aesthetic contexts, so verify the account's other markers before acting."
  },
  {
    "match": [
      "҂"
    ],
    "context": "'Egodystonic paraphiliac' — someone whose paraphilic attraction distresses them or clashes with their self-image. Cyrillic thousands-sign marker; no common innocent use."
  },
  {
    "match": [
      "Ѧ"
    ],
    "context": "Anti-contact stance specifically regarding adult–minor ('Adumi') relationships — the user identifies as a paraphile but claims opposition to acting on minor attraction. Old Cyrillic letter; rare outside these communities. Useful as a confirmation signal that an account self-identifies within MAP spaces."
  },
  {
    "match": [
      "πΦχ"
    ],
    "context": "'Black paraphiliac' — a paraphile community identity label. Mixed-case Greek sequence used as a discreet bio marker; uncommon in ordinary text."
  },
  {
    "match": [
      "ϴ⨺",
      "⛤⁷"
    ],
    "context": "'Otherkin' — people who identify as non-human. Mostly a benign identity community on its own; included because it co-occurs with the more serious markers in this dataset. The symbols are rare enough to be reliable bio markers."
  },
  {
    "match": [
      "θΔ"
    ],
    "context": "'Therian' — someone who identifies as a non-human animal. Mostly benign on its own, but frequently co-occurs with zoophile-adjacent markers; check the account's other markers before acting."
  },
  {
    "match": [
      "👁️🗨️"
    ],
    "context": "'PARIN' (Paraphilic In Nature) — marker for identities the user defines as paraphilic. Used as a bio/name marker."
  },
  {
    "match": [
      "🧬☄️",
      "🧬🌠"
    ],
    "context": "'Ecto-Consang' — claims of a past-life or 'ectopic' family relationship used to reframe incest as non-biological. Used as a bio/name marker in consang (incest-community) spaces."
  },
  {
    "match": [
      "🍐📂"
    ],
    "context": "'Paraphile' umbrella marker (folder emoji variant). Used as a discreet self-identification marker in bios and display names."
  },
  {
    "match": [
      "🌏📄"
    ],
    "context": "'MAP' (Minor Attracted Person) umbrella marker — someone self-identifying as attracted to minors. High-severity signal. The many single-emoji MAP codes (🍸, ☀️, 🗺️, 🍃) are too false-positive-prone to include; only this distinctive pair is safe to match."
  },
  {
    "match": [
      "🤕🐾",
      "🐕🦺"
    ],
    "context": "'Zoosadist' — sexual arousal from animals suffering. High-severity signal (animal abuse); typically used by accounts already flagged by zoophile markers."
  },
  {
    "match": [
      "🧸🐾",
      "🐻🐾",
      "🤎🐾"
    ],
    "context": "'Plushozoophilia' — sexual attraction to animal plush toys. Self-identification marker in zoophile-adjacent spaces."
  },
  {
    "match": [
      "🔖🐾",
      "🔖🪶"
    ],
    "context": "'Fictozoophile' — claims of zoophilic attraction limited to fictional animals. Self-identification marker; still signals zoophile-community membership."
  },
  {
    "match": [
      "💭🐾",
      "💭🪶"
    ],
    "context": "'FantaZoo' — claims of zoophilic attraction existing only in the imagination. Self-identification marker; still signals zoophile-community membership."
  },
  {
    "match": [
      "🪳🐾",
      "🦗🐾",
      "🐛🐾",
      "𓆣 ζ",
      "ζ 𓆣"
    ],
    "context": "'Insect zoophilia' — sexual attraction to insects. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🐕🐾",
      "🐶🐾"
    ],
    "context": "'Canine zoophilia' — sexual attraction to dogs. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🐺🐾"
    ],
    "context": "'Lupiophilia' — sexual attraction to wolves. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🦝🐾"
    ],
    "context": "'Lotorophilia' — sexual attraction to raccoons. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🐈🐾",
      "🐱🐾"
    ],
    "context": "'Feline zoophilia' — sexual attraction to cats. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🕊️🐾"
    ],
    "context": "'Bird zoophilia' — sexual attraction to birds. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🐍🐾",
      "🐊🐾",
      "🦎🐾"
    ],
    "context": "'Reptile zoophilia' — sexual attraction to reptiles. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🌈🐾"
    ],
    "context": "'Multispecies zoophilia' — sexual attraction to multiple non-human species. Self-identification marker used in zoophile community spaces. Caution: rainbow+paw combos also occur in innocent LGBTQ+ pet contexts; check surrounding markers before acting."
  },
  {
    "match": [
      "🦁🐾",
      "🐾🦁"
    ],
    "context": "'Leophilia' — sexual attraction to lions. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🐀🐾",
      "🐾🐀"
    ],
    "context": "'Rattusphilia' — sexual attraction to rats. Self-identification marker used in zoophile community spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "🐾👁️"
    ],
    "context": "'Faunaphilia' — general sexual attraction to animals (zoophile umbrella marker). Self-identification marker; check for other zoophile markers before acting since paw emojis are common innocently."
  },
  {
    "match": [
      "🗺️❣️",
      "🗺️🩸"
    ],
    "context": "'MAPsadist' — a Minor Attracted Person who is also a sadist (arousal from others being in pain). High-severity signal."
  },
  {
    "match": [
      "🗺️🍼❣️",
      "🗺️🍼🩸"
    ],
    "context": "'Nepiosadism' — arousal from infants/toddlers being in pain. Highest-severity signal in this dataset; any use warrants immediate review."
  },
  {
    "match": [
      "🗺️🎒❣️",
      "🗺️🎒🩸"
    ],
    "context": "'Hebesadism' — arousal from pubescent children being in pain. High-severity signal."
  },
  {
    "match": [
      "🗺️🎓❣️",
      "🗺️🎓🩸"
    ],
    "context": "'Ephebosadism' — arousal from post-pubescent adolescents being in pain. High-severity signal."
  },
  {
    "match": [
      "🌹🌟"
    ],
    "context": "'Autodopephilia' — arousal from imagining oneself being raped as a child. High-severity signal; any use warrants immediate review."
  },
  {
    "match": [
      "🐭🍰"
    ],
    "context": "'Lolishonacon' — attraction to both feminine and masculine minors. High-severity signal; the candy/backpack variants of this marker overlap with the kodocon marker, so matches may indicate either."
  },
  {
    "match": [
      "☠️💚",
      "🪦🪱"
    ],
    "context": "'Necrophilia' — sexual attraction to corpses. Self-identification marker; high-severity signal. The single-emoji necro codes (🧟, ⌛, ⚰️, 🪦) are too false-positive-prone to include."
  },
  {
    "match": [
      "⚰️💌"
    ],
    "context": "'Corpsecon' — identity marker combining necrophilia with a romantic/relationship framing toward the dead. High-severity signal."
  },
  {
    "match": [
      "🤎🥀"
    ],
    "context": "'Autonecrophilia' — arousal from imagining oneself dead. Self-identification marker used in necro-adjacent spaces; overlaps with self-harm risk indicators."
  },
  {
    "match": [
      "💫⚰️",
      "💫🧟",
      "💫⏳",
      "💭⚰️",
      "💭🧟",
      "💭⏳"
    ],
    "context": "'Fantanecro' — claims of necrophilic attraction limited to fantasy or imagination. Self-identification marker; still signals necro-community membership."
  },
  {
    "match": [
      "🫁⚰️",
      "🫁🪦",
      "💨⚰️",
      "💨🪦",
      "🫁⌛",
      "🫁🧟",
      "💨⌛",
      "💨🧟"
    ],
    "context": "'Necrobiophilia' — attraction spanning both the living and the dead. Self-identification marker; high-severity signal."
  },
  {
    "match": [
      "🧟‍♂️🖤",
      "🧟‍♀️🖤",
      "🧟🖤",
      "🧠☂️"
    ],
    "context": "'Kinemortophilia' — sexual attraction to zombies/the living dead. Fiction-adjacent but used as a self-identification marker in necro-adjacent spaces; 🧠☂️ also serves as a general radqueer suffix marker."
  },
  {
    "match": [
      "🌺💀",
      "🫘☠️"
    ],
    "context": "'Daturanecrophilia' — necrophilia-adjacent marker referencing datura (toxic plant). Self-identification marker in necro-adjacent spaces; high-severity signal."
  },
  {
    "match": [
      "🩸🦵",
      "🧑🦽🌹",
      "🔪🫀"
    ],
    "context": "'Acromotophilia' — sexual attraction to amputations/amputees. Self-identification marker; treat with care since disability-adjacent fetishization is the core issue rather than immediate physical danger."
  },
  {
    "match": [
      "🔪🩸"
    ],
    "context": "'Erotophonophilia' — attraction to murder/killing. High-severity signal indicating comfort with real-world violence."
  },
  {
    "match": [
      "🗡️🩸"
    ],
    "context": "'Piquerism' — arousal from piercing or pricking others with sharp objects. High-severity signal indicating comfort with real-world violence."
  },
  {
    "match": [
      "😘🔪",
      "✨🪓"
    ],
    "context": "'Autoassasinphilia' — arousal from imagining oneself being murdered. Self-identification marker; treat as a self-harm risk indicator as well."
  },
  {
    "match": [
      "💢🔪"
    ],
    "context": "'Misophilia' — attraction to perceived threat groups. Self-identification marker; monitor for targeting or violent rhetoric."
  },
  {
    "match": [
      "🩸🥩",
      "🥩☂️",
      "🥩🖤"
    ],
    "context": "'Carnophilia' — attraction to raw meat/flesh, frequently overlapping with cannibalism fantasy content. Self-identification marker in gore-adjacent spaces."
  },
  {
    "match": [
      "🩻☂️",
      "🦴🌧️",
      "💀🖤"
    ],
    "context": "'Cartilogenophilia' — attraction to bones and skeletal structures, frequently overlapping with gore content. Self-identification marker in gore-adjacent spaces."
  },
  {
    "match": [
      "🩸☂️",
      "💉☂️",
      "🆎☂️"
    ],
    "context": "'Hematophilia' — sexual attraction to blood. Self-identification marker; note that blood emojis are extremely common in innocent contexts, so only the paired-umbrella forms are safe to match and even then require surrounding context."
  },
  {
    "match": [
      "🩸👃"
    ],
    "context": "'Epistaxiophilia' — arousal from nosebleeds. Self-identification marker in blood-adjacent spaces; low standalone severity but a useful community indicator."
  },
  {
    "match": [
      "🩸🩲"
    ],
    "context": "'Menophilia' — sexual attraction to menstruation. Self-identification marker; note 🩸🩲 could occur in ordinary health discussion, so verify bio context first."
  },
  {
    "match": [
      "🐈🩸",
      "🦷🩸"
    ],
    "context": "'Huntophilia' — arousal from hunting predator/prey dynamics. Self-identification marker in violence-adjacent spaces."
  },
  {
    "match": [
      "🐭🩸",
      "🪤🩸"
    ],
    "context": "'Autohuntophilia' — arousal from imagining oneself as prey in a hunt. Self-identification marker; overlaps with self-harm risk indicators."
  },
  {
    "match": [
      "🩸🦝",
      "🦷☂️",
      "🦠🐾"
    ],
    "context": "'Lyssophilia' — attraction to rabies/rabid animals. Self-identification marker in zoosadist-adjacent spaces; high-severity signal (animal abuse)."
  },
  {
    "match": [
      "❤️🩷🩶🤍🖤"
    ],
    "context": "'Violentsexual' — self-identification with attraction to violence. High-severity signal; the five-heart sequence is distinctive enough to be a reliable marker."
  },
  {
    "match": [
      "💥🩹"
    ],
    "context": "'Molopaphilia' — attraction to battles/fighting. Self-identification marker; low standalone severity but a community indicator."
  },
  {
    "match": [
      "🩹☂️",
      "🫠❤️",
      "❤️‍🩹🥀"
    ],
    "context": "'Unaisiphilia' — attraction to discomfort or being uncomfortable. Self-identification marker; overlaps with self-harm risk indicators."
  },
  {
    "match": [
      "💢📸"
    ],
    "context": "'Pornophilicdephilia' — attraction to degrading pornographic content. Self-identification marker in degradation-adjacent spaces."
  },
  {
    "match": [
      "🗣️💬💔"
    ],
    "context": "'Prosvolíphilia' — arousal from insulting or being insulted. Self-identification marker; low standalone severity but a community indicator."
  },
  {
    "match": [
      "🎭🔪",
      "🚣☠️"
    ],
    "context": "'Paraskavedekatriaphilia' — attraction themed around Friday the 13th / superstition horror. Self-identification marker in horror-adjacent spaces; low standalone severity."
  },
  {
    "match": [
      "💭🔪",
      "💭🖤"
    ],
    "context": "'Pecattiphilia' — attraction to imagined 'sin' or transgression. Self-identification marker; moderate severity given the violence-adjacent imagery."
  },
  {
    "match": [
      "🍂🥀"
    ],
    "context": "'Raptophilia' — attraction to decay/ruin aesthetics, often overlapping with thanatophilia (attraction to death). Self-identification marker in necro-adjacent spaces."
  },
  {
    "match": [
      "ͱ",
      "𝜢"
    ],
    "context": "'Hybristophilia' — attraction to criminals and violent offenders. Self-identification marker; moderate-to-high severity as it signals comfort with real-world violence. These letter variants are rare enough to be reliable bio markers."
  },
  {
    "match": [
      "🌹🔫",
      "🌹🔪",
      "🐾💫"
    ],
    "context": "'Hybristophilia' — attraction to criminals and violent offenders (emoji variants). Moderate-to-high severity; the rose/weapon pairs are distinctive markers."
  },
  {
    "match": [
      "🗝️⛓️",
      "🪞🔗"
    ],
    "context": "'Hybristospectrophilia' — attraction to fictional ghosts/undead who are criminals. Self-identification marker in hybristo-adjacent spaces; moderate severity."
  },
  {
    "match": [
      "🕸🖤",
      "🧛🕸"
    ],
    "context": "'Scelerophilia' — attraction to villains and unsavory characters. Self-identification marker; low standalone severity given the fictional framing, but a community indicator."
  },
  {
    "match": [
      "🌼☂️",
      "🌼🖤",
      "🌼🩱"
    ],
    "context": "'Autobiastophilia' — arousal from imagining oneself being raped. Self-identification marker; treat as a self-harm and risk indicator, and note the daisy emojis are common innocently — the paired forms still require surrounding context."
  },
  {
    "match": [
      "🌹🩸"
    ],
    "context": "'Autohybristophilia' — arousal from imagining oneself in a criminal/violent scenario. Self-identification marker; overlaps with self-harm risk indicators."
  },
  {
    "match": [
      "😮💨"
    ],
    "context": "'Asphyxiophilia' — arousal from suffocation/choking. Self-identification marker; treat as a self-harm risk indicator (erotic asphyxiation is physically dangerous) — this emoji sequence also commonly means a sigh, so bio context is required."
  },
  {
    "match": [
      "📦☂️"
    ],
    "context": "'Claustrophilia' — arousal from confined spaces. Self-identification marker; low standalone severity."
  },
  {
    "match": [
      "🩵🌻"
    ],
    "context": "'Dynamophilia' — attraction to dynamite/explosives. Self-identification marker; monitor for violent rhetoric."
  },
  {
    "match": [
      "🌘🪐",
      "☀️🛰️",
      "🔭✨",
      "🪐☂️"
    ],
    "context": "'Astrophilia' — attraction themed around outer space. Low severity on its own; included as a community indicator since the umbrella-suffix ☂️ marks it as part of the radqueer emoji system rather than innocent space enthusiasm."
  },
  {
    "match": [
      "🌃🪩",
      "🌆✨",
      "🌌☂️"
    ],
    "context": "'Auroraphilia' — attraction themed around night skies/auroras. Low severity; the ☂️ suffix marks radqueer system membership rather than innocent aesthetic use."
  },
  {
    "match": [
      "🪽☂️",
      "🌬️🪶",
      "✈️🩶",
      "🌫️🐦⬛"
    ],
    "context": "'Aviatophilia' — attraction to planes/flying. Low standalone severity; included as a community indicator."
  },
  {
    "match": [
      "🦠☂️",
      "🧫🫶",
      "🔬🩶"
    ],
    "context": "'Bacteriophilia' — attraction to bacteria/germs. Low severity but frequently co-occurs with illness-fetish content; a useful community indicator via the radqueer suffix marks (☂️, 🫶, 🩶)."
  },
  {
    "match": [
      "📘❤️",
      "📚☂️",
      "📕🪙"
    ],
    "context": "'Bibliophilia' — in radqueer usage, a paraphilic rather than literary attraction to books. The single-emoji codes (📚, 📖) are far too innocent to match; only these paired forms are safe, and even then require bio context."
  },
  {
    "match": [
      "❤️🩹➕"
    ],
    "context": "'Boethophilia' — attraction to healing/being healed. Low severity; useful as a community indicator."
  },
  {
    "match": [
      "🙋♂️❤️💁"
    ],
    "context": "'Autoadonic' — arousal from imagining oneself with attraction to non-binary people. Self-identification marker in the auto-erotic paraphilia taxonomy."
  },
  {
    "match": [
      "🙋♀️❤️💁"
    ],
    "context": "'Automaedic' — arousal from imagining oneself with attraction to non-binary people (feminine framing). Self-identification marker in the auto-erotic paraphilia taxonomy."
  },
  {
    "match": [
      "💑",
      "🧑🤝🧑"
    ],
    "context": "'Autoenbian' — arousal from imagining oneself in an enby-with-enby relationship. The couple emojis are extremely common innocently, so require bio/self-identification context before acting."
  },
  {
    "match": [
      "👩❤️👨",
      "👫"
    ],
    "context": "'Autojulietian' — arousal from imagining oneself as a woman attracted to men. Common innocent emoji pairs; flag only as deliberate bio markers."
  },
  {
    "match": [
      "👨❤️👨",
      "👬"
    ],
    "context": "'Autovincian' — arousal from imagining oneself as a man attracted to men. Common innocent emoji pairs; flag only as deliberate bio markers."
  },
  {
    "match": [
      "👩❤️👩",
      "👭"
    ],
    "context": "'Autosophic/Autosapphic' — arousal from imagining oneself as a woman attracted to women. Common innocent emoji pairs; flag only as deliberate bio markers."
  },
  {
    "match": [
      "🙋♂️❤️🙋♀️"
    ],
    "context": "'Autoromeroeroticism' — arousal from imagining oneself as a man attracted to women within the auto-erotic paraphilia taxonomy. Self-identification marker."
  },
  {
    "match": [
      "💁❤️🙋♂️"
    ],
    "context": "'Autotoric' — arousal from imagining oneself (as non-binary) attracted to men. Self-identification marker."
  },
  {
    "match": [
      "💁❤️🙋♀️"
    ],
    "context": "'Autotrixic' — arousal from imagining oneself (as non-binary) attracted to women. Self-identification marker."
  },
  {
    "match": [
      "🌈🤍"
    ],
    "context": "'Autoheteroeroticism' — arousal from imagining oneself being straight. Self-identification marker; the pair is also a common aesthetic, so require bio context."
  },
  {
    "match": [
      "🌈💖"
    ],
    "context": "'Autohomoeroticism' — arousal from imagining oneself being gay. Self-identification marker; the pair is also a common aesthetic, so require bio context."
  },
  {
    "match": [
      "🌈💜"
    ],
    "context": "'Autolesbioeroticism' — arousal from imagining oneself being lesbian. Self-identification marker; the pair is also a common aesthetic, so require bio context."
  },
  {
    "match": [
      "🏳️⚧️♂️🌼"
    ],
    "context": "'Andromimetophilia' — attraction to transgender men. Self-identification marker; low severity on its own but part of the same taxonomy."
  },
  {
    "match": [
      "🏳️⚧️♀️🌼"
    ],
    "context": "'Gynemimetophilia' — attraction to transgender women. Self-identification marker; low severity on its own but part of the same taxonomy."
  },
  {
    "match": [
      "♂️🔄💙"
    ],
    "context": "'Autoandromimetophilia' — arousal from imagining oneself as a transgender man. Self-identification marker."
  },
  {
    "match": [
      "♀️🔄💖"
    ],
    "context": "'Autogynemimetophilia' — arousal from imagining oneself as a transgender woman. Self-identification marker."
  },
  {
    "match": [
      "🏳️🌈🤝"
    ],
    "context": "'Fujiphilia' — identity framing of attraction to gay men/gay relationships (from 'fujoshi'). Self-identification marker; low-to-moderate severity given the fetishization concern."
  },
  {
    "match": [
      "👨💌"
    ],
    "context": "'Alloandrophilia' — attraction to men. Self-identification marker; very low standalone severity, included for taxonomy completeness."
  },
  {
    "match": [
      "👩💌"
    ],
    "context": "'Allogynephilia' — attraction to women. Self-identification marker; very low standalone severity, included for taxonomy completeness."
  },
  {
    "match": [
      "🫶🌹",
      "🪺💌",
      "🫀☂️"
    ],
    "context": "'Autophilia' — attraction to oneself. Self-identification marker; low standalone severity."
  },
  {
    "match": [
      "👏🪄"
    ],
    "context": "'Autogratiophilia' — arousal from being praised. Self-identification marker; low standalone severity."
  },
  {
    "match": [
      "🙌✨"
    ],
    "context": "'Gratiophilia' — attraction to praising others. Self-identification marker; low standalone severity; the pair is common innocently, so require bio context."
  },
  {
    "match": [
      "👑🙇",
      "👑☀️"
    ],
    "context": "'Autohybriphilia' — arousal from imagining oneself being worshipped. Self-identification marker; low standalone severity."
  },
  {
    "match": [
      "🪽😇"
    ],
    "context": "'Autotheophilia' — arousal from imagining oneself as a god. Self-identification marker; low standalone severity."
  },
  {
    "match": [
      "🫂🌠🤍"
    ],
    "context": "'Agender parental love attraction' — attraction to agender people who provide parental love. Low standalone severity; included for taxonomy completeness."
  },
  {
    "match": [
      "🎻🎶⏳"
    ],
    "context": "'Seiráphilia' — attraction to stringed instruments. Low standalone severity; the three-emoji sequence is distinctive enough to be a reliable marker."
  },
  {
    "match": [
      "🗣️💕💬"
    ],
    "context": "'Name attraction' — attraction to people with certain names. Low standalone severity; included for taxonomy completeness."
  },
  {
    "match": [
      "🌈🍬💞"
    ],
    "context": "'Silly attraction' — attraction to perceived silliness. Low standalone severity; included for taxonomy completeness."
  },
  {
    "match": [
      "🌈🥄",
      "🌈🧿",
      "🍳🥄"
    ],
    "context": "'Panphilia/Omniphilia' — attraction to everything. Self-identification marker; low standalone severity but a strong radqueer-community indicator given the paraphile base symbols (🥄, 🧿)."
  },
  {
    "match": [
      "🥄4️🥄",
      "🧿4️🧿"
    ],
    "context": "'Paraphile 4 paraphile' — a paraphile seeking a paraphile partner. Self-identification marker; useful as a community-membership signal."
  },
  {
    "match": [
      "🤝🥄",
      "🥄🤝",
      "🤝🧿",
      "🧿🤝"
    ],
    "context": "'Paraphilia hoarder' — someone collecting many paraphilic identity labels. Self-identification marker; a strong indicator that the account's other markers are identity claims, not accidental emoji use."
  },
  {
    "match": [
      "🥄❔",
      "❔🥄",
      "🥄❓",
      "❓🥄",
      "🧿❔",
      "❔🧿",
      "🧿❓",
      "❓🧿"
    ],
    "context": "'Questioning paraphilia' — the account is exploring paraphilic identity labels. Moderate-value signal: confirms the account is engaging with the paraphile emoji system even if no specific label is claimed."
  },
  {
    "match": [
      "⛅💔",
      "⛅🍐"
    ],
    "context": "'Daybreak paraphile' — a paraphile identity variant themed around morning. Low standalone severity; useful mainly as a community-membership signal."
  },
  {
    "match": [
      "🌃🪱",
      "🌃🌈",
      "🌃🍐"
    ],
    "context": "'Midnight paraphile' — a paraphile identity variant themed around night. Low standalone severity; useful mainly as a community-membership signal."
  },
  {
    "match": [
      "🌉🍐"
    ],
    "context": "'Dusk paraphile' — a paraphile identity variant. Low standalone severity; useful mainly as a community-membership signal."
  },
  {
    "match": [
      "🌌🍐"
    ],
    "context": "'Twilight paraphile' — a paraphile identity variant. Low standalone severity; useful mainly as a community-membership signal."
  },
  {
    "match": [
      "🌑🍐"
    ],
    "context": "'Eclipse paraphilia' — a paraphile identity variant. Low standalone severity; useful mainly as a community-membership signal."
  },
  {
    "match": [
      "🧸🖐️"
    ],
    "context": "'Malloplushophilia' — attraction to plush toys of a specific material. Self-identification marker in plushophile-adjacent spaces."
  },
  {
    "match": [
      "🪽🤍",
      "🪶🖤",
      "🪁🐦⬛"
    ],
    "context": "'Plumaphilia' — attraction to wings/feathers. Self-identification marker in avian-adjacent spaces; low standalone severity."
  },
  {
    "match": [
      "👁️☂️",
      "👁️🌧️",
      "👁️👁️"
    ],
    "context": "'Multiommetaphilia' — attraction to multiple eyes/being watched. Self-identification marker; low standalone severity but a distinctive community indicator."
  },
  {
    "match": [
      "😵💫"
    ],
    "context": "'Maniaphilia' — attraction to 'the insane'/madness. Self-identification marker; the pair is also a common dizzy expression, so require bio context."
  },
  {
    "match": [
      "🔥❤️",
      "❤️‍🔥☂️"
    ],
    "context": "'Pyrophilia' — attraction to fire. Self-identification marker; monitor for arson-adjacent rhetoric."
  },
  {
    "match": [
      "💙💛💜🤍🖤",
      "🌤🧦"
    ],
    "context": "'Tenophilia' — attraction to thinness/thin people. Self-identification marker; overlaps with eating-disorder communities — treat as a self-harm risk indicator."
  },
  {
    "match": [
      "🍥🍊"
    ],
    "context": "'Tenocon' — attraction to 'teno' (thin-coded) fictional minor characters. High-severity signal due to the minor-attraction component."
  },
  {
    "match": [
      "🧠🌱"
    ],
    "context": "'Vulnerablephile' — attraction to perceived vulnerability. Self-identification marker; moderate-to-high severity as it signals predatory framing. Also used in the same community for the 'Critexclus' stance, so check for other markers."
  },
  {
    "match": [
      "👩👧",
      "👩🍼"
    ],
    "context": "'Matrolagnia' — attraction to one's own mother. Self-identification marker; the pairs are common in innocent family posts, so require bio/self-identification context before acting."
  },
  {
    "match": [
      "👨👧",
      "👨🍼"
    ],
    "context": "'Patrolagnia' — attraction to one's own father. Self-identification marker; the pairs are common in innocent family posts, so require bio/self-identification context before acting."
  },
  {
    "match": [
      "🍂👧",
      "🍂👩"
    ],
    "context": "'Sororilagnia' — attraction to one's own sister. Self-identification marker."
  },
  {
    "match": [
      "🍂👦",
      "🍂👨"
    ],
    "context": "'Fratrilagnia' — attraction to one's own brother. Self-identification marker."
  },
  {
    "match": [
      "🪜👩👧",
      "🪜👩",
      "🪜👩🍼"
    ],
    "context": "'Novercamania' — attraction to one's stepmother. Self-identification marker."
  },
  {
    "match": [
      "🪜👨👧",
      "🪜👨",
      "🪜👨🍼"
    ],
    "context": "'Vintricophilia' — attraction to one's stepfather. Self-identification marker."
  },
  {
    "match": [
      "🍓🌙",
      "🩰💌"
    ],
    "context": "'Siscon' — attraction to one's sister (from 'sister complex'). Self-identification marker in incest-adjacent spaces."
  },
  {
    "match": [
      "🫐🌙",
      "🧢💙"
    ],
    "context": "'Brocon' — attraction to one's brother (from 'brother complex'). Self-identification marker in incest-adjacent spaces."
  },
  {
    "match": [
      "🍇🌙",
      "🌼💛",
      "🧺🧃",
      "💏👥"
    ],
    "context": "'Sibcon' — attraction to one's sibling (from 'sibling complex'). Self-identification marker in incest-adjacent spaces."
  },
  {
    "match": [
      "💌🧑‍🧑‍🧒",
      "🧑‍🧑‍🧒🌳"
    ],
    "context": "'Patruelisphilia' — attraction to one's cousin. Self-identification marker; the family emojis are common innocently, so require bio context."
  },
  {
    "match": [
      "🥄🌈"
    ],
    "context": "'Proship paraphile' — a paraphile who also identifies with the pro-ship stance (defending explicit fiction, including content involving minors). Community-membership signal."
  },
  {
    "match": [
      "🥄🌙"
    ],
    "context": "'Comship paraphile' — a paraphile who identifies with the 'comship' (complex shipping) stance, a rebranding of pro-ship. Community-membership signal."
  },
  {
    "match": [
      "🥄🐶"
    ],
    "context": "'Neutralship paraphile' — a paraphile with a neutral stance on shipping discourse. Community-membership signal."
  },
  {
    "match": [
      "🥄🐜"
    ],
    "context": "'Antiship paraphile' — a paraphile who identifies with the anti-ship stance. Community-membership signal; note that antis are frequent harassment targets in these spaces, so this can mark a user in conflict with the rest of the community."
  },
  {
    "match": [
      "🌱🥄",
      "💘🗣"
    ],
    "context": "'Paraphilia supporter' — a non-paraphile (or unspecified) account expressing support for paraphilic identities, including in many cases attraction to minors or animals. Community-membership signal."
  },
  {
    "match": [
      "🌊🔱"
    ],
    "context": "'Critharmed' — claims to be 'harmed' by critical discussion of radqueer identities. Part of the 'criticalpunk' identity family used to deflect criticism."
  },
  {
    "match": [
      "🔥🔱"
    ],
    "context": "'Critharmful' — claims that criticism is itself harmful, again framing pushback as aggression. Part of the criticalpunk family."
  },
  {
    "match": [
      "🚩🔱"
    ],
    "context": "'Crithateful' — claims that criticism constitutes hatred. Part of the criticalpunk family; useful to recognize because accounts using it often portray moderation action as persecution."
  },
  {
    "match": [
      "🗡️🔷"
    ],
    "context": "'Pseudoharmed' — claims of pseudo-harm within the radqueer harm-claiming taxonomy. Community-membership signal."
  },
  {
    "match": [
      "🗡️🎃"
    ],
    "context": "'Pseudoharmful' — claims of pseudo-harm (variant). Community-membership signal."
  },
  {
    "match": [
      "🗡️🍷"
    ],
    "context": "'Pseudohateful' — claims of pseudo-hate. Community-membership signal."
  },
  {
    "match": [
      "💣💦",
      "⚔️💦"
    ],
    "context": "'Hypoharmed' — downplayed harm-claiming identity within the radqueer taxonomy. Community-membership signal."
  },
  {
    "match": [
      "🪽⚔️",
      "💣🍁",
      "⚔️🍁"
    ],
    "context": "'Hypoharmful' — downplayed harm-claiming identity (variant). Community-membership signal."
  },
  {
    "match": [
      "💣💉",
      "⚔️💉"
    ],
    "context": "'Hypohateful' — downplayed hate-claiming identity. Community-membership signal."
  },
  {
    "match": [
      "🌈🌅"
    ],
    "context": "'Radeviant' — a radqueer identity label signaling self-identified 'deviance'. Community-membership signal."
  },
  {
    "match": [
      "💟🤝",
      "🌟🤗"
    ],
    "context": "'Extreme inclusionist' — an identity stance claiming no identity or attraction should ever be excluded or judged, used within these communities to legitimize the more severe markers in this dataset."
  },
  {
    "match": [
      "🩹⚡",
      "⚕🧷"
    ],
    "context": "'Illpunk / 111punk' — an identity aesthetic built around illness, self-diagnosis, and anti-recovery framing. Overlaps with self-harm risk indicators."
  },
  {
    "match": [
      "ξ√",
      "ξ⎷"
    ],
    "context": "'Xenoradicalism / Xenoradism' — an extreme radqueer stance. Community-membership signal; the letter-combo forms are distinctive enough to be reliable bio markers."
  },
  {
    "match": [
      "🤡‼️",
      "🤡💥",
      "🌼💀🌺"
    ],
    "context": "'Trollpunk' — an identity aesthetic signaling intentional shock/offense posting. Community-membership signal; accounts using it frequently deploy the serious markers in this dataset 'ironically', which still merits review."
  },
  {
    "match": [
      "💎🌀",
      "🧩🌟"
    ],
    "context": "'Intiripunk' — a radqueer subculture identity marker. Community-membership signal."
  },
  {
    "match": [
      "🧷🗯️"
    ],
    "context": "'Inclupunk' — a radqueer 'inclusionist punk' identity marker. Community-membership signal."
  },
  {
    "match": [
      "🎉🖕",
      "🥳🔪"
    ],
    "context": "'Birthpunk / Birthfuck' — a radqueer subculture marker built around shock aesthetics. Community-membership signal; the 🥳🔪 pair warrants review given the violent imagery."
  },
  {
    "match": [
      "🌟💭"
    ],
    "context": "'Critexclus' — an identity stance about who is 'excluded' by critical discourse. Low standalone severity; community-membership signal."
  },
  {
    "match": [
      "🌻🧡",
      "🌊🌿"
    ],
    "context": "'Redemptionpunk' — a radqueer subculture identity marker framed around 'redemption'. Community-membership signal."
  },
  {
    "match": [
      "🏥♿",
      "💉🧠"
    ],
    "context": "'Medpunk' — an identity aesthetic built around medical themes. Overlaps with transabled/illness-fetish markers; moderate severity given romanticization of disability and medical harm."
  },
  {
    "match": [
      "🥄🪦",
      "🪦🥄"
    ],
    "context": "'Parapunk V1' — a subculture identity pairing the paraphile marker (🥄) with death imagery (🪦). Community-membership signal."
  },
  {
    "match": [
      "🧿🪦",
      "🪦🧿"
    ],
    "context": "'Parapunk V2' — variant of the Parapunk paraphile-community subculture marker. Community-membership signal."
  },
  {
    "match": [
      "🐦⬛💢"
    ],
    "context": "'Oppressionpunk' — an identity claiming oppression status within the radqueer taxonomy. Community-membership signal."
  },
  {
    "match": [
      "📣❤️"
    ],
    "context": "'Amoropunk' — a radqueer subculture identity marker. Community-membership signal."
  },
  {
    "match": [
      "🌟🚀",
      "🌈⚙️"
    ],
    "context": "'Transpunk' — a radqueer subculture identity marker tied to transidentity (not transgender) communities. Community-membership signal."
  },
  {
    "match": [
      "➕💣🪦"
    ],
    "context": "'TransGenic-Punk' — a radqueer subculture marker combining transidentity (➕), violent (💣), and death (🪦) imagery. Community-membership signal; review given the violent imagery."
  },
  {
    "match": [
      "💻❌💙"
    ],
    "context": "'Glitchtransboy' — a transidentity label claiming to be a boy through a 'glitch' framing. Low standalone severity; community-membership signal."
  },
  {
    "match": [
      "💻❌💗"
    ],
    "context": "'Glitchtransgirl' — a transidentity label claiming to be a girl through a 'glitch' framing. Low standalone severity; community-membership signal."
  },
  {
    "match": [
      "💻❌💜"
    ],
    "context": "'Glitchtransgender' — a transidentity label using 'glitch' framing. Low standalone severity; community-membership signal."
  },
  {
    "match": [
      "🕰️⏰",
      "🥣⏰"
    ],
    "context": "'Transian' — a transage-adjacent label combining identity markers with the age/time symbol ⏰. Moderate severity: transage claims are used to blur accountability in age-inappropriate interactions."
  },
  {
    "match": [
      "⏰️3️⃣"
    ],
    "context": "'Triage' — a transage variant claiming an age of three. Moderate-to-high severity: an adult claiming to be a toddler is a significant risk signal."
  },
  {
    "match": [
      "🦠⏪⌛"
    ],
    "context": "'Pandemage' — a transidentity marker combining disease and regression/time imagery. Overlaps with illness-fetish markers; moderate severity."
  },
  {
    "match": [
      "🇲🇽💯➕"
    ],
    "context": "'Hypermexican' — a 'transnationality/xenoracial' identity claim. Low standalone severity; included for completeness of the transID marker system."
  },
  {
    "match": [
      "☄️🌐",
      "☄️☁️"
    ],
    "context": "'Xenoracial' — claims of identifying as another race. Moderate severity: these claims are typically considered racist trolling or a cover for race-fetish content."
  },
  {
    "match": [
      "🖌️🧳",
      "🖌️💱"
    ],
    "context": "'Xenonationality' — claims of identifying as another nationality. Low-to-moderate severity; community-membership signal."
  },
  {
    "match": [
      "☄️🥂",
      "🖌️🏮"
    ],
    "context": "'Xenoculture' — claims of identifying as another culture. Low-to-moderate severity; community-membership signal."
  },
  {
    "match": [
      "🔰🌼",
      "♿️💝",
      "🌸💕"
    ],
    "context": "'Transneuaju' — a transidentity label. Low standalone severity; community-membership signal."
  },
  {
    "match": [
      "📼🦋"
    ],
    "context": "'TranssymptADHD' — claims of identifying as having ADHD symptoms. Low standalone severity on its own; part of the 'transabled' family that romanticizes disability."
  },
  {
    "match": [
      "⚡️🦋",
      "⚡️📼"
    ],
    "context": "'Transhyperfixation' — claims of identifying as having hyperfixation. Low standalone severity; part of the transabled family."
  },
  {
    "match": [
      "💺🎈"
    ],
    "context": "'Transquadri(plegic)' — claims of identifying as quadriplegic. Moderate severity: romanticizes significant disability; part of the transabled family."
  },
  {
    "match": [
      "🎀💎🧬"
    ],
    "context": "'Transtritanopia' — claims of identifying as having tritanopia (color blindness). Low severity; part of the transabled family."
  },
  {
    "match": [
      "💤⭐️"
    ],
    "context": "'Transnarcolepsy' — claims of identifying as having narcolepsy. Low severity; part of the transabled family."
  },
  {
    "match": [
      "🔁🕖"
    ],
    "context": "'Transyear' — claims of identifying as being from another year. Low standalone severity; community-membership signal."
  },
  {
    "match": [
      "🗣️💬📊",
      "🗣️💬💙",
      "🗣️💬🖤",
      "🗣️💬💛",
      "🗣️💬🤍",
      "🗣️💬🧡"
    ],
    "context": "'Transtone' variants — claims of identifying as speaking in a specific emotional 'tone'. Low standalone severity; included as transID-system markers. The 🗣️💬 prefix family is distinctive enough to be reliable."
  },
  {
    "match": [
      "🔁🔊",
      "🔁💬",
      "🔁📱🔊"
    ],
    "context": "'Transvoice / Altvoice / TransAAC' — claims of identifying as having a different voice, or as an AAC (speech device) user. Low-to-moderate severity: the AAC claim in particular romanticizes disability."
  },
  {
    "match": [
      "🔁🏳🔊",
      "🏳💬",
      "🔁🇷🇺🔊",
      "🇷🇺💬",
      "🔁🇬🇧🔊",
      "🇬🇧💬",
      "🔁☎️🔊",
      "☎️💬",
      "🔁📻🔊",
      "📻💬",
      "🔁📼🔊",
      "📼💬",
      "🔁🐶🔊",
      "🐶💬",
      "🔁❤️🔥🔊",
      "❤️🔥💬",
      "🔁🪽🔊",
      "🪽💬",
      "🔁♾️🔊",
      "♾️💬",
      "🔢🏳〰️🔊",
      "🔢〰️💬"
    ],
    "context": "'Transaccent / Polyaccent' family — claims of identifying as speaking with a different accent, including racial/national accents (Russian, British), animal 'barks', or object 'voices'. Moderate severity: the accent claims overlap with racist caricature, and the family as a whole is a reliable transID-system indicator."
  },
  {
    "match": [
      "📝🌀",
      "💬📝➕"
    ],
    "context": "'Translingual' — claims of identifying as speaking another language. Low-to-moderate severity; community-membership signal."
  },
  {
    "match": [
      "🦇👤",
      "🦷🦇",
      "🌱👤",
      "🦎👤",
      "🐊🦕",
      "🌵👤",
      "🖐️👤",
      "🐾🐓",
      "🍂👤",
      "😈👤",
      "🦄🦏",
      "🍁👤",
      "🕊️👤",
      "🐦🦇",
      "🍃👤",
      "🐾👤",
      "🐶🐱",
      "🌳👤",
      "🍚🥡"
    ],
    "context": "'Bodic' family — transspecies claims about one's body being animal- or object-based (bat teeth, lizard skin, paws, wings, fried-rice body, etc.). Low standalone severity on its own; the 👤-suffixed forms are reliable transspecies markers, and the family co-occurs with the zoophile markers in this dataset, so check other markers before acting."
  },
  {
    "match": [
      "🔁💗👁️"
    ],
    "context": "'Transloverpupils' — claims of identifying as having 'lover-shaped' pupils. Low severity; a distinctive transID-system marker."
  },
  {
    "match": [
      "👁️🌈🧩",
      "👁️❤️🧩",
      "👁️🧡🧩",
      "👁️💛🧩",
      "👁️💚🧩",
      "👁️💙🧩",
      "👁️💜🧩",
      "👁️🤍🧩",
      "👁️🖤🧩",
      "👁️🤎🧩"
    ],
    "context": "'Transcoloreyes' — claims of identifying as having differently-colored eyes. Low severity on its own; the 🧩 (puzzle-piece) suffix marks it as a transID marker rather than ordinary eye-color discussion."
  },
  {
    "match": [
      "💛💜🤍"
    ],
    "context": "'Transintersex' — claims of identifying as intersex. Moderate severity: romanticizes a congenital condition. Caution: 💛💜🤍 is also the intersex pride flag order-adjacent and appears innocently in intersex advocacy, so require other transID markers before acting."
  },
  {
    "match": [
      "🔁🦎👅",
      "🔁🐶👅",
      "🔁🐱👅",
      "🔁🐦👅"
    ],
    "context": "'Transtongue' family — claims of identifying as having an animal tongue (lizard, dog, cat, bird). Low severity alone; the 🔁 prefix marks the transID system."
  },
  {
    "match": [
      "🕯️🍃",
      "🕯️🌊",
      "🕯️🍦🥧",
      "🥧🍦🍃",
      "🕯️💐",
      "💐🍃",
      "🕯️💩",
      "💩🍃",
      "🕯️🍭☁️",
      "🍭☁️🍃",
      "🕯️🧁",
      "🧁🍃",
      "🕯️🍬",
      "🍬🍃",
      "🕯️🍮",
      "🍮🍃",
      "🕯️🍁",
      "🍁🍃",
      "🕯️🍯",
      "🍯🍃",
      "🕯️🍋🍯",
      "🍯🍋🍃",
      "🕯️🥞",
      "🥞🍃",
      "🕯️🎂",
      "🎂🍃",
      "🕯️🎤",
      "🎤🍃"
    ],
    "context": "'Transscent / Scentian' family — claims of identifying as having a different scent, with the paired 🍃 forms marking 'identity' variants (cotton candy, vanilla, honey, cake, etc.). Low severity on its own; note these use very common food emojis, so treat as markers only in bio/name contexts alongside other transID markers."
  },
  {
    "match": [
      "♟️🔄"
    ],
    "context": "'Transclub' — a transidentity marker. Low severity; community-membership signal."
  },
  {
    "match": [
      "💚🩷⚰️🌎"
    ],
    "context": "'TCOAALixure' — an identity marker referencing The Coffin of Andy and Leyley, a game popular in these communities for its incest/cannibalism themes. Moderate severity: signals comfort with incest and cannibalism content; the four-emoji sequence is distinctive."
  },
  {
    "match": [
      "🔄✨"
    ],
    "context": "'Transcure' — a transidentity marker. Low severity; community-membership signal."
  },
  {
    "match": [
      "🥇⭐️",
      "🥈⭐️",
      "🥉⭐️",
      "🟩⭐️"
    ],
    "context": "'(Trans)Permaplace' family — claims of permanently identifying as first/second/third place or 'participation'. Absurdist transID markers; low severity, useful only as confirmation of transID-system engagement."
  },
  {
    "match": [
      "💤🛏🌙",
      "💤🛏☀️"
    ],
    "context": "'Transdiurnal / Transnocturnal' — claims of identifying as day-active or night-active. Low severity; community-membership signal."
  },
  {
    "match": [
      "⬆️⚧️",
      "⬇️⚧️",
      "🔆✖️",
      "🪻✖️",
      "💛✖️",
      "💜✖️",
      "🩵➕",
      "🫐➕",
      "🩷➖",
      "🍬➖"
    ],
    "context": "Transdysphoria / Sevigenderdysphoria family — markers claiming different amounts of gender dysphoria, including claims of dysphoria about being transgender. Low severity on its own; transID-system markers."
  },
  {
    "match": [
      "🦇🪦",
      "💕💐💫",
      "🌀💐💫",
      "🩸💐💫"
    ],
    "context": "'Transvampire' family — claims of identifying as a vampire, with eros/psi/sanguine variants. Low severity; fiction-adjacent transID markers."
  },
  {
    "match": [
      "∅🦇",
      "🅾️➕🦇",
      "🅾️➕",
      "🅾️➖🦇",
      "🅾️➖",
      "🅰️➕🦇",
      "🅰️➕",
      "🅰️➖🦇",
      "🅰️➖",
      "🅱️➕🦇",
      "🅱️➕",
      "🅱️➖🦇",
      "🅱️➖",
      "🆎➕🦇",
      "🆎➕",
      "🆎➖🦇",
      "🆎➖"
    ],
    "context": "'Transblood-type' family — claims of identifying as having a different blood type, with 🦇 distinguishing the transID marker from ordinary blood-type discussion. Low severity; the plain 🅾️➕-style forms are extremely common in innocent contexts and should only be flagged alongside other transID markers."
  },
  {
    "match": [
      "🖤⚰️",
      "💕⚰️",
      "🔢⚰️",
      "☢️⚰️",
      "🌊⚰️",
      "☣️⚰️",
      "✝️⚰️",
      "🪱⚰️",
      "💦⚰️",
      "💉⚰️",
      "🪢⚰️",
      "🦇⚰️",
      "🪨⚰️",
      "🔪⚰️",
      "💙⚰️",
      "☄️⚰️"
    ],
    "context": "'Transdeath' family — claims of identifying as dead/dying, with the prefix emoji naming the claimed death method (hanging, drowning, injection, rabies, stoning, etc.). Moderate-to-high severity: overlaps with self-harm risk indicators and, in some variants, with violent fantasy content. The ⚰️ suffix family is distinctive enough to be reliable bio markers."
  },
  {
    "match": [
      "🧪🕒"
    ],
    "context": "'Transradiumpoisoning' — claims of identifying as having radiation poisoning. Low severity; part of the transabled family."
  },
  {
    "match": [
      "🦠☢️"
    ],
    "context": "'Transexperiment' — claims of identifying as having been experimented on. Low severity; part of the transabled family, though the imagery warrants a check for violent content."
  },
  {
    "match": [
      "🦾🌈"
    ],
    "context": "'Transprosthetic' — claims of identifying as having/being a prosthetic. Low severity; part of the transabled family."
  },
  {
    "match": [
      "♾️💢"
    ],
    "context": "'Permabruise' — claims of permanently identifying as bruised. Overlaps with self-harm risk indicators; moderate severity."
  },
  {
    "match": [
      "🌑🛏",
      "🌑❤️",
      "🌑🍷",
      "🌑🎰",
      "🌑💻",
      "🌑🎮",
      "🌑☕️",
      "🌑🚬",
      "🌑🌬",
      "🌑💊",
      "🌑🍃",
      "🌑😮💨",
      "🌑❄️",
      "🌑🍬",
      "🌑🍫",
      "🌑🕳️",
      "🌑🐉",
      "🌑🔮",
      "🌑🍞",
      "🌑🍭",
      "🌑🌭",
      "🌑🧂",
      "🌑🍄",
      "🌑💫"
    ],
    "context": "'Trans-/Di-addiction' family — claims of identifying as having an addiction (alcohol, gambling, nicotine, cocaine, heroin, meth, food, etc.) via the 🌑 prefix. Low-to-moderate severity on its own; the drug-specific variants romanticize substance abuse and overlap with pro-drug communities. The 🌑 prefix family is distinctive enough to be reliable markers."
  },
  {
    "match": [
      "💥👻"
    ],
    "context": "'Ghostpower' — a transidentity 'power' claim. Low severity; community-membership signal."
  },
  {
    "match": [
      "💥🧿",
      "💥🐈⬛"
    ],
    "context": "'Transbadluckpower' — a transidentity 'power' claim about bad luck. Low severity; community-membership signal."
  },
  {
    "match": [
      "🌑🕯️🪽"
    ],
    "context": "'(Trans)Soulscovern' — a transidentity marker combining moon, candle, and wing imagery. Low severity; community-membership signal."
  },
  {
    "match": [
      "⚡♈",
      "⚡♉",
      "⚡♊",
      "⚡♋",
      "⚡♌",
      "⚡♍",
      "⚡♎",
      "⚡♏",
      "⚡♐",
      "⚡♑",
      "⚡♒",
      "⚡♓",
      "⚡⛎"
    ],
    "context": "'Transzodiac / Diazodia' family — claims of identifying as a different zodiac sign, one per sign (including Ophiuchus). Very low severity on its own; included as a reliable transID-system indicator since the ⚡+zodiac pairs have no ordinary use."
  },
  {
    "match": [
      "🪻🌎",
      "🪷🌎",
      "🌱🪷🌎"
    ],
    "context": "'Transpeaceful / Transharmless / Transgreenthumb' — transidentity claims framed as being peaceful or harmless. Low severity; community-membership signal, useful as a mitigating context cue."
  },
  {
    "match": [
      "💉💢"
    ],
    "context": "'TransAntiVax' — claims of identifying as anti-vaccination. Low severity on its own; community-membership signal with medical-misinformation adjacency."
  },
  {
    "match": [
      "🔃🔗"
    ],
    "context": "'Transcriminal' — claims of identifying as a criminal. Moderate severity; monitor for threats or glorification of offenses."
  },
  {
    "match": [
      "🔃🔪",
      "🔃🗡",
      "🔃🔫"
    ],
    "context": "'Transkiller / Transmurderer' — claims of identifying as a murderer. High-severity signal: even framed as 'identity', review for threats and violent ideation."
  },
  {
    "match": [
      "💜ϟϟ",
      "💜🍞",
      "🚩⛸"
    ],
    "context": "'Transnazi' — claims of identifying as a Nazi (bread references 'brown', from Nazi uniform color; ϟϟ mirrors SS runes). High-severity signal combining transID framing with Nazi self-identification; review immediately."
  },
  {
    "match": [
      "💙ϟϟ",
      "💙🍞",
      "🚩🌫"
    ],
    "context": "'Transneonazi' — claims of identifying as a neo-Nazi. High-severity signal; review immediately."
  },
  {
    "match": [
      "🌈☂️",
      "🌈🍥",
      "🌈🔁"
    ],
    "context": "'Transeverything / TranspanID' — claims of identifying as every transidentity at once. Low-to-moderate severity; a strong indicator of deep engagement with the transID system, so treat the account's other markers seriously."
  },
  {
    "match": [
      "🛡️🖇️"
    ],
    "context": "'TransDIDOSDD' — claims of identifying as having dissociative identity disorder/OSDD. Moderate severity: romanticizes a trauma disorder; overlaps with syscourse and faker communities."
  },
  {
    "match": [
      "☂️❔",
      "🍥❔",
      "🔁❔",
      "☂️❓",
      "🍥❓",
      "🔁❓"
    ],
    "context": "'Questioning TransID' — the account is exploring transidentity labels. Low standalone severity; confirms engagement with the transID marker system (the ☂️/🍥/🔁 prefixes are the transID umbrella symbols)."
  },
  {
    "match": [
      "☂️🤝",
      "🍥🤝",
      "🔁🤝"
    ],
    "context": "'TransID hoarder' — an account collecting many transidentity labels. Low-to-moderate severity; useful as a weighting signal that the account's other markers are deliberate identity claims."
  },
  {
    "match": [
      "🦠5️⃣🐱"
    ],
    "context": "'TransFIV' — claims of identifying as having feline immunodeficiency virus. Moderate severity: overlaps with the zoophile-adjacent FIVphilia marker in this dataset; check the account for other zoophile markers."
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
