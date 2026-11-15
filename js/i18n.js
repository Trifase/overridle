const LANG_STORAGE_KEY = 'overridle_lang';
const SUPPORTED_LANGS = new Set(['en', 'it']);

let currentLang = 'en';

function readUrlLang() {
  if (typeof window === 'undefined' || !window.location) return null;
  const raw = new URLSearchParams(window.location.search).get('lang');
  if (!raw) return null;
  const norm = raw.trim().toLowerCase();
  return SUPPORTED_LANGS.has(norm) ? norm : null;
}

export function initLang() {
  const urlLang = readUrlLang();
  if (urlLang) {
    currentLang = urlLang;
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, urlLang);
    } catch {
      // Ignore storage restriction errors
    }
  } else if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && SUPPORTED_LANGS.has(saved)) {
        currentLang = saved;
      } else {
        currentLang = 'en';
      }
    } catch {
      currentLang = 'en';
    }
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = currentLang;
  }
  return currentLang;
}

export function getLang() {
  return currentLang;
}

export function isIt() {
  return currentLang === 'it';
}

export function setLang(lang, { persist = true } = {}) {
  const next = SUPPORTED_LANGS.has(lang) ? lang : 'en';
  currentLang = next;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = next;
  }
  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Ignore storage restriction errors
    }
  }
  return next;
}

/**
 * Return English or Italian string according to active language.
 * @param {string} en
 * @param {string} it
 * @returns {string}
 */
export function t(en, it) {
  return currentLang === 'it' ? it : en;
}

export const UI_STRINGS = {
  en: {
    aria_lives: 'Remaining lives',
    aria_rounds: '5-module status',
    aria_pause: 'Pause (P)',
    aria_standby: 'Start screen',
    aria_practice: 'Practice minigame selector',
    aria_practice_format: 'Single-module training format',
    aria_practice_grid: 'Minigame list',
    aria_playing: 'Active module',
    aria_end: 'Game result',
    pause_btn: '[⏸ PAUSE]',
    resume_btn_hud: '[▶ RESUME]',
    briefing_line1: 'CHAIN REACTION IN PROGRESS.',
    briefing_line2: '5 MODULES. DYNAMIC TIMER (30-45s). 3 LIVES.',
    briefing_sub: 'Complete every procedural sequence before terminal incineration.',
    start_btn: '[ START OVERRIDE ]',
    practice_btn: '[ PRACTICE MODE ]',
    daily_completed: 'DAILY COMPLETED',
    override_complete: 'OVERRIDE COMPLETE',
    incinerated: 'INCINERATED',
    copy_result: '[ COPY RESULT ]',
    copied_clipboard: 'COPIED TO CLIPBOARD!',
    autopause_full: 'AUTO-PAUSE BETWEEN MODULES (SHOW RULES)',
    autopause_short: 'AUTO-PAUSE BETWEEN MODULES',
    lang_label: 'LANGUAGE:',
    practice_title: 'PRACTICE MODE',
    single_format: 'SINGLE FORMAT:',
    round_1: '[ 1 ROUND ]',
    round_5: '[ 5 ROUNDS ]',
    practice_random: '[ 🎲 RANDOM MIX (5 MODULES) ]',
    back: '[ ← BACK ]',
    pause_title: 'SYSTEM PAUSED',
    pause_sub: 'TIMER & MODULE LOCKED — CHECK INSTRUCTIONS',
    pause_instr_label: 'MODULE INSTRUCTIONS',
    pause_rule_label: 'ACTIVE RULE',
    resume_override: '[ ▶ RESUME OVERRIDE ]',
    stat_time: 'TIME',
    stat_lives: 'LIVES',
    stat_seq: 'MODULE SEQUENCE',
    practice_select_btn: '[ SELECT MINIGAME / PRACTICE ]',
  },
  it: {
    aria_lives: 'Vite rimanenti',
    aria_rounds: 'Stato dei 5 moduli',
    aria_pause: 'Metti in pausa (P)',
    aria_standby: 'Schermata iniziale',
    aria_practice: 'Selezione minigioco pratica',
    aria_practice_format: 'Formato allenamento modulo singolo',
    aria_practice_grid: 'Elenco minigiochi',
    aria_playing: 'Modulo attivo',
    aria_end: 'Esito partita',
    pause_btn: '[⏸ PAUSA]',
    resume_btn_hud: '[▶ RIPRENDI]',
    briefing_line1: 'REAZIONE A CATENA IN CORSO.',
    briefing_line2: '5 MODULI. TIMER DINAMICO (30-45s). 3 VITE.',
    briefing_sub: "Completa ogni sequenza procedurale prima dell'incenerimento del terminale.",
    start_btn: '[ AVVIA OVERRIDE ]',
    practice_btn: '[ MODALITÀ PRATICA ]',
    daily_completed: 'DAILY COMPLETATO',
    override_complete: 'OVERRIDE COMPLETATO',
    incinerated: 'INCENERITO',
    copy_result: '[ COPIA RISULTATO ]',
    copied_clipboard: 'COPIATO NEGLI APPUNTI!',
    autopause_full: 'AUTO-PAUSA TRA I MODULI (MOSTRA REGOLE)',
    autopause_short: 'AUTO-PAUSA TRA I MODULI',
    lang_label: 'LINGUA:',
    practice_title: 'MODALITÀ PRATICA',
    single_format: 'FORMATO SINGOLO:',
    round_1: '[ 1 ROUND ]',
    round_5: '[ 5 ROUND ]',
    practice_random: '[ 🎲 MIX CASUALE (5 MODULI) ]',
    back: '[ ← INDIETRO ]',
    pause_title: 'SISTEMA IN PAUSA',
    pause_sub: 'TIMER E MODULO BLOCCATI — CONSULTA LE ISTRUZIONI',
    pause_instr_label: 'ISTRUZIONI MODULO',
    pause_rule_label: 'REGOLA ATTIVA',
    resume_override: '[ ▶ RIPRENDI OVERRIDE ]',
    stat_time: 'TEMPO',
    stat_lives: 'VITE',
    stat_seq: 'SEQUENZA MODULI',
    practice_select_btn: '[ SCEGLI MINIGIOCO / PRATICA ]',
  },
};

export function msg(key) {
  const table = UI_STRINGS[currentLang] || UI_STRINGS.en;
  return table[key] ?? UI_STRINGS.en[key] ?? key;
}

export function applyDomTranslations(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = msg(key);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', msg(key));
  });
}
