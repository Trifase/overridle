import {
  mulberry32,
  getTodaySeed,
  getLocalDateSeed,
  getUrlSeed,
  getTestModeFlags,
  getSubSeed,
  shuffle,
} from './prng.js';
import {
  initAudio,
  isMuted,
  toggleMute,
  playSuccess,
  playError,
  playTick,
  playWin,
  playExplode,
} from './audio.js';
import {
  initLang,
  getLang,
  setLang,
  t,
  msg,
  applyDomTranslations,
} from './i18n.js';
import {
  initContainmentScene,
  setContainmentVisibility,
  updateContainmentState,
  triggerContainmentHit,
  triggerContainmentUnlock,
} from './containment.js';

import * as wires from './modules/wires.js';
import * as binary_switches from './modules/binary_switches.js';
import * as math_order from './modules/math_order.js';
import * as fallout_hack from './modules/fallout_hack.js';
import * as memory_flash from './modules/memory_flash.js';
import * as glyph_rules from './modules/glyph_rules.js';
import * as freq_align from './modules/freq_align.js';
import * as pressure_purge from './modules/pressure_purge.js';
import * as rotor_lock from './modules/rotor_lock.js';
import * as valve_sequence from './modules/valve_sequence.js';
import * as tactical_map from './modules/tactical_map.js';
import * as magnetic_scale from './modules/magnetic_scale.js';
import * as stroop_override from './modules/stroop_override.js';
import * as signal_tuner from './modules/signal_tuner.js';
import * as reactor_balance from './modules/reactor_balance.js';

export const TOTAL_TIME = 36.0;
export const MAX_LIVES = 3;
export const ROUNDS_COUNT = 5;

const MODULE_TIME_BUDGET = {
  wires: { base: 5.5, variant: 0, variantChoices: 0 },
  rotor_lock: { base: 5.5, variant: 1.5, variantChoices: 3 },
  stroop_override: { base: 6.0, variant: 0, variantChoices: 0 },
  signal_tuner: { base: 6.0, variant: 1.0, variantChoices: 2 },
  glyph_rules: { base: 6.5, variant: 0, variantChoices: 0 },
  tactical_map: { base: 6.5, variant: 1.5, variantChoices: 3 },
  binary_switches: { base: 7.0, variant: 1.5, variantChoices: 3 },
  magnetic_scale: { base: 7.0, variant: 0.5, variantChoices: 2 },
  freq_align: { base: 7.0, variant: 1.5, variantChoices: 3 },
  math_order: { base: 7.5, variant: 0, variantChoices: 0 },
  fallout_hack: { base: 8.0, variant: 1.5, variantChoices: 3 },
  reactor_balance: { base: 8.0, variant: 1.0, variantChoices: 2 },
  pressure_purge: { base: 8.0, variant: 1.5, variantChoices: 3 },
  memory_flash: { base: 8.5, variant: 1.5, variantChoices: 4 },
  valve_sequence: { base: 9.0, variant: 1.5, variantChoices: 3 },
};

export function computeRunTimeLimit(runSeed, modules) {
  if (!Array.isArray(modules) || modules.length === 0) return TOTAL_TIME;
  let total = 0;
  for (let i = 0; i < modules.length; i += 1) {
    const cfg = MODULE_TIME_BUDGET[modules[i]] || { base: 7.0, variant: 0, variantChoices: 0 };
    total += cfg.base;
    if (cfg.variantChoices > 1 && cfg.variant > 0) {
      const peekRng = mulberry32(getSubSeed(runSeed, i));
      const variantIdx = Math.floor(peekRng() * cfg.variantChoices);
      if (variantIdx > 0) {
        total += cfg.variant;
      }
    }
  }
  return Math.round(total);
}

export const MODULE_POOL = [
  'wires',
  'binary_switches',
  'math_order',
  'fallout_hack',
  'memory_flash',
  'glyph_rules',
  'freq_align',
  'pressure_purge',
  'rotor_lock',
  'valve_sequence',
  'tactical_map',
  'magnetic_scale',
  'stroop_override',
  'signal_tuner',
  'reactor_balance',
];

const MODULE_META = {
  wires: {
    id: 'wires',
    title: { en: 'CUT THE WIRES', it: 'TAGLIA I CAVI' },
    mod: wires,
    instructions: {
      en: 'Read the wire logic rule (colors, counts, and positions) and cut only the required wire.',
      it: 'Leggi la regola logica dei cavi (colori, quantità e posizioni) e recidi solo il cavo richiesto.',
    },
    ruleSelector: '.ovr-wires-rule-text',
  },
  binary_switches: {
    id: 'binary_switches',
    title: { en: 'BINARY SWITCHES', it: 'SWITCH BINARI' },
    mod: binary_switches,
    instructions: {
      en: 'Toggle the binary switches to sum to the exact decimal target and press EXEC.',
      it: 'Attiva gli switch binari per sommare esattamente il valore decimale target e premi EXEC.',
    },
    ruleSelector: '.ovr-variant-banner',
  },
  math_order: {
    id: 'math_order',
    title: { en: 'DISCHARGE ORDER', it: 'ORDINE DI SCARICA' },
    mod: math_order,
    instructions: {
      en: "Calculate each math node's value and tap them all in the indicated sequence.",
      it: 'Calcola il valore di ciascun nodo matematico e toccali tutti nella sequenza indicata.',
    },
    ruleSelector: '.ovr-math-dir',
  },
  fallout_hack: {
    id: 'fallout_hack',
    title: { en: 'FALLOUT TERMINAL', it: 'TERMINALE FALLOUT' },
    mod: fallout_hack,
    instructions: {
      en: 'Find and tap the 5 target codes in the hex dump while avoiding decoys.',
      it: 'Trova e tocca i 5 codici target nel dump esadecimale evitando le esche.',
    },
    ruleSelector: '.ovr-variant-banner',
  },
  memory_flash: {
    id: 'memory_flash',
    title: { en: 'KEYCARD FLASH', it: 'KEYCARD FLASH' },
    mod: memory_flash,
    instructions: {
      en: 'Memorize the illuminated nodes during the initial flash and select the required ones.',
      it: 'Memorizza i nodi illuminati durante il flash iniziale e seleziona quelli richiesti.',
    },
    ruleSelector: '.ovr-variant-banner',
  },
  glyph_rules: {
    id: 'glyph_rules',
    title: { en: 'GLYPH GRID', it: 'GRIGLIA GEROGLIFICI' },
    mod: glyph_rules,
    instructions: {
      en: 'Check where symbols appear on the 3×3 grid against the active rule and press the matching glyph.',
      it: 'Verifica quali simboli compaiono nella griglia 3×3 rispetto alla regola attiva e premi il glifo corretto.',
    },
    ruleSelector: '.ovr-glyph-text',
  },
  freq_align: {
    id: 'freq_align',
    title: { en: 'FREQUENCY ALIGN', it: 'ALLINEA FREQUENZA' },
    mod: freq_align,
    instructions: {
      en: 'Adjust the frequency slider until your wave overlaps the target and hold the lock.',
      it: 'Regola lo slider della frequenza finché la tua onda si sovrappone al target e mantieni l’aggancio.',
    },
    ruleSelector: '.ovr-variant-banner',
  },
  pressure_purge: {
    id: 'pressure_purge',
    title: { en: 'PRESSURE PURGE', it: 'SPURGO PRESSIONE' },
    mod: pressure_purge,
    instructions: {
      en: 'Hold PURGE to raise pressure and release exactly inside the green zone.',
      it: 'Tieni premuto PURGE per far salire la pressione e rilascia esattamente dentro la fascia verde.',
    },
    ruleSelector: '.ovr-variant-banner',
  },
  rotor_lock: {
    id: 'rotor_lock',
    title: { en: 'ROTOR LOCK', it: 'AGGANCIO ROTORE' },
    mod: rotor_lock,
    instructions: {
      en: 'Press LOCK twice when the rotating needle passes inside the green zone to lock both pins.',
      it: 'Premi LOCK due volte quando la lancetta rotante passa dentro la zona verde per agganciare entrambi i perni.',
    },
    ruleSelector: '.ovr-variant-banner',
  },
  valve_sequence: {
    id: 'valve_sequence',
    title: { en: 'VALVE RESET', it: 'RESET VALVOLE' },
    mod: valve_sequence,
    instructions: {
      en: 'When a valve reaches 100%, tap it to reset within 2 seconds. Tapping early or exceeding 2s is a mistake.',
      it: 'Quando una valvola arriva al 100%, toccala per resettarla entro 2 secondi. Toccare prima del 100% o superare i 2s è errore.',
    },
    ruleSelector: '.ovr-variant-banner',
  },
  tactical_map: {
    id: 'tactical_map',
    title: { en: 'TACTICAL MAP', it: 'MAPPA TATTICA' },
    mod: tactical_map,
    instructions: {
      en: 'Locate the 3 listed coordinates on the 5×5 grid by crossing column and row labels on the map axes.',
      it: 'Individua sulla griglia 5×5 le 3 coordinate indicate incrociando colonna e riga sugli assi della mappa.',
    },
    ruleSelector: '.ovr-tm-rule',
  },
  magnetic_scale: {
    id: 'magnetic_scale',
    title: { en: 'MAGNETIC SCALE', it: 'BILANCIA MAGNETICA' },
    mod: magnetic_scale,
    instructions: {
      en: 'Tap exactly 2 of the 5 available weights to add or remove the load needed to hit the target.',
      it: 'Tocca esattamente 2 pesi tra i 5 disponibili per aggiungere o rimuovere il carico necessario al target.',
    },
    ruleSelector: '.ovr-ms-rule',
  },
  stroop_override: {
    id: 'stroop_override',
    title: { en: 'COLOR PARADOX', it: 'PARADOSSO CROMATICO' },
    mod: stroop_override,
    instructions: {
      en: 'Complete 3 steps following the active rule: pick the button matching the written word or the ink color.',
      it: 'Completa 3 step seguendo la regola attiva: scegli il pulsante della parola scritta oppure del colore visivo.',
    },
    ruleSelector: '.ovr-so-rule',
  },
  signal_tuner: {
    id: 'signal_tuner',
    title: { en: 'PULSE DECODER', it: 'DECODIFICA IMPULSI' },
    mod: signal_tuner,
    instructions: {
      en: 'Match the signal (● and ▲) to the channel table; if inverted, swap circles and triangles.',
      it: 'Confronta il segnale (● e ▲) con la tabella canali; se invertito, scambia ogni cerchio con un triangolo.',
    },
    ruleSelector: '.ovr-st-rule',
  },
  reactor_balance: {
    id: 'reactor_balance',
    title: { en: 'CORE BALANCE', it: 'BILANC. NOCCIOLO' },
    mod: reactor_balance,
    instructions: {
      en: 'Set megawatts (1–5) for SHIELDS, ENGINES, and CRYO matching the total and relations, then press STABILIZE.',
      it: 'Imposta i megawatt (1–5) di SCUDI, MOTORI e CRIO rispettando il totale e le relazioni date, poi premi STABILIZZA.',
    },
  },
};

function getModuleTitle(entry) {
  if (!entry) return '';
  return typeof entry.title === 'object' ? t(entry.title.en, entry.title.it) : entry.title;
}

function getModuleInstructions(entry) {
  if (!entry) return '';
  return typeof entry.instructions === 'object'
    ? t(entry.instructions.en, entry.instructions.it)
    : entry.instructions;
}

const STORAGE_PREFIX = 'override30_';
const AUTOPAUSE_STORAGE_KEY = 'overridle_autopause';
const SHARE_URL = 'https://overridle.trifase.online';

const testFlags = getTestModeFlags();
const isTestMode = testFlags.bypassStorage;

function loadAutoPausePref() {
  try {
    const raw = window.localStorage.getItem(AUTOPAUSE_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return true;
  } catch {
    return true;
  }
}

// Game state
let state = 'STANDBY'; // 'STANDBY' | 'PRACTICE_SELECT' | 'PLAYING' | 'WIN' | 'LOSE'
let localTodaySeed = getLocalDateSeed();
let seed = getTodaySeed();
let isPractice = false;
let autoPause = typeof window !== 'undefined' ? loadAutoPausePref() : true;
let practiceModuleId = null;
let practiceRepeatCount = 1;
let practiceReturnScreen = 'STANDBY';
let practiceReturnState = 'STANDBY';
let isPaused = false;
let pausedAt = null;
let selectedModules = shuffle(mulberry32(seed), MODULE_POOL).slice(0, ROUNDS_COUNT);
let currentTimeLimit = computeRunTimeLimit(seed, selectedModules);
let roundIndex = 0;
let lives = MAX_LIVES;
let squares = Array(ROUNDS_COUNT).fill('⬛');
let startTime = 0;
let elapsed = 0;
let rafId = null;
let lastTickAt = null;
let currentCleanup = null;
let roundActive = false;
let currentShareText = '';
let standbyShareText = '';

if (typeof window !== 'undefined') {
  window.__OVERRIDLE_PAUSED__ = false;
}

const copyResetTimers = new WeakMap();

// DOM references (populated on init)
const dom = {};

function queryDom() {
  dom.flashOverlay = document.getElementById('flash-overlay');
  dom.seedBadge = document.getElementById('seed-badge');
  dom.livesDisplay = document.getElementById('lives-display');
  dom.muteBtn = document.getElementById('mute-btn');
  dom.roundLeds = Array.from(document.querySelectorAll('#round-indicators .round-led'));
  dom.pauseBtn = document.getElementById('pause-btn');
  dom.timerDisplay = document.getElementById('timer-display');

  dom.screenStandby = document.getElementById('screen-standby');
  dom.standbyFresh = document.getElementById('standby-fresh');
  dom.standbyCompleted = document.getElementById('standby-completed');
  dom.standbyResultTitle = document.getElementById('standby-result-title');
  dom.standbyResultStats = document.getElementById('standby-result-stats');
  dom.standbySharePreview = document.getElementById('standby-share-preview');
  dom.startBtn = document.getElementById('start-btn');
  dom.practiceFreshBtn = document.getElementById('practice-fresh-btn');
  dom.copyStandbyBtn = document.getElementById('copy-standby-btn');
  dom.practiceStandbyBtn = document.getElementById('practice-standby-btn');

  dom.screenPractice = document.getElementById('screen-practice');
  dom.practiceMode1Btn = document.getElementById('practice-mode-1');
  dom.practiceMode5Btn = document.getElementById('practice-mode-5');
  dom.practiceRandomBtn = document.getElementById('practice-random-btn');
  dom.practiceModuleGrid = document.getElementById('practice-module-grid');
  dom.practiceBackBtn = document.getElementById('practice-back-btn');

  dom.screenPlaying = document.getElementById('screen-playing');
  dom.moduleMeta = document.getElementById('module-meta');
  dom.moduleContainer = document.getElementById('module-container');
  dom.pauseOverlay = document.getElementById('pause-overlay');
  dom.pauseModDesc = document.getElementById('pause-mod-desc');
  dom.pauseModRuleWrap = document.getElementById('pause-mod-rule-wrap');
  dom.pauseModRule = document.getElementById('pause-mod-rule');
  dom.resumeBtn = document.getElementById('resume-btn');

  dom.screenEnd = document.getElementById('screen-end');
  dom.endModeBadge = document.getElementById('end-mode-badge');
  dom.endTitle = document.getElementById('end-title');
  dom.endStats = document.getElementById('end-stats');
  dom.sharePreview = document.getElementById('share-preview');
  dom.copyShareBtn = document.getElementById('copy-share-btn');
  dom.retryPracticeBtn = document.getElementById('retry-practice-btn');
  dom.practiceBtn = document.getElementById('practice-btn');

  const queriedChecks = Array.from(document.querySelectorAll('.js-autopause-check'));
  if (queriedChecks.length > 0) {
    dom.autoPauseChecks = queriedChecks;
  } else {
    dom.autoPauseChecks = [
      document.getElementById('autopause-check'),
      document.getElementById('autopause-practice-check'),
      document.getElementById('autopause-overlay-check'),
    ].filter(Boolean);
  }
  dom.langEnBtn = document.getElementById('lang-en-btn');
  dom.langItBtn = document.getElementById('lang-it-btn');
}

function getDailyStorageKey(targetSeed) {
  return `${STORAGE_PREFIX}${targetSeed}`;
}

function loadDailyRecord(targetSeed) {
  try {
    const raw = window.localStorage.getItem(getDailyStorageKey(targetSeed));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.squares)) {
      return null;
    }
    const dailyModules = shuffle(mulberry32(targetSeed), MODULE_POOL).slice(0, ROUNDS_COUNT);
    const expectedTimeLimit = computeRunTimeLimit(targetSeed, dailyModules);
    if (parsed.timeLimit !== expectedTimeLimit) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveDailyRecord(targetSeed, record) {
  try {
    window.localStorage.setItem(getDailyStorageKey(targetSeed), JSON.stringify(record));
  } catch {
    // Ignore storage quota / restriction errors
  }
}

function clearDailyRecord(targetSeed) {
  try {
    window.localStorage.removeItem(getDailyStorageKey(targetSeed));
  } catch {
    // Ignore storage restriction errors
  }
}

function formatHearts(remainingLives) {
  const safeLives = Math.max(0, Math.min(MAX_LIVES, remainingLives));
  return '❤️'.repeat(safeLives) + '🖤'.repeat(MAX_LIVES - safeLives);
}

export function buildShareText({
  seed: gameSeed,
  won,
  elapsed: timeSec,
  lives: remainingLives,
  squares: roundSquares,
  practice = false,
}) {
  const heartsStr = formatHearts(remainingLives);
  const outcomePart = won ? `${timeSec.toFixed(1)}s` : '💥';
  const prefix = practice
    ? t(`OVERRIDLE [PRACTICE] #${gameSeed}`, `OVERRIDLE [PRATICA] #${gameSeed}`)
    : `OVERRIDLE #${gameSeed}`;
  return `${prefix} — ${outcomePart} | ${heartsStr}\n${roundSquares.join(' ')}\n${SHARE_URL}`;
}

function setActiveScreen(screenName) {
  const mapping = {
    STANDBY: dom.screenStandby,
    PRACTICE: dom.screenPractice,
    PLAYING: dom.screenPlaying,
    END: dom.screenEnd,
  };
  for (const [key, el] of Object.entries(mapping)) {
    if (!el) continue;
    const active = key === screenName;
    el.classList.toggle('is-active', active);
    el.hidden = !active;
  }
  if (dom.pauseBtn) {
    dom.pauseBtn.hidden = screenName !== 'PLAYING';
  }
  setContainmentVisibility(screenName !== 'PRACTICE');
  syncContainmentScene();
}

function updateMuteButton() {
  if (!dom.muteBtn) return;
  const muted = isMuted();
  dom.muteBtn.textContent = muted ? '[MUTE]' : '[AUDIO ON]';
  dom.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  dom.muteBtn.classList.toggle('is-muted', muted);
}

function updateSeedBadge() {
  if (!dom.seedBadge) return;
  if (isPractice) {
    dom.seedBadge.textContent = isTestMode
      ? t('TEST // PRACTICE', 'TEST // PRATICA')
      : t('PRACTICE', 'PRATICA');
    dom.seedBadge.title = t(`Practice Seed #${seed}`, `Seed Pratica #${seed}`);
    dom.seedBadge.classList.add('is-practice');
  } else {
    dom.seedBadge.textContent = isTestMode ? `TEST #${seed}` : `#${seed}`;
    dom.seedBadge.title = isTestMode
      ? t(`Test Mode — Seed #${seed}`, `Modalità Test — Seed #${seed}`)
      : `Seed #${seed}`;
    dom.seedBadge.classList.toggle('is-practice', isTestMode);
  }
}

function renderPixelHeartSvg(filled) {
  const fill = filled ? '#ff3366' : '#2d2952';
  const hi = filled ? '#ff85a3' : '#3d386b';
  const border = '#0b0917';
  return `<svg class="pixel-heart ${filled ? 'is-full' : 'is-empty'}" viewBox="0 0 9 8" width="18" height="16" aria-hidden="true">
    <path fill="${border}" d="M1 0h2v1h1v1h1V1h1V0h2v1h1v3H8v1H7v1H6v1H5v1H4V7H3V6H2V5H1V4H0V1h1V0z"/>
    <path fill="${fill}" d="M1 1h2v1h1v1h1V2h1V1h2v3H7v1H6v1H5v1H4V6H3V5H2V4H1V1z"/>
    <rect fill="${hi}" x="2" y="2" width="1" height="1"/>
  </svg>`;
}

function syncContainmentScene(remainingOverride = null) {
  const totalRounds = selectedModules.length || ROUNDS_COUNT;
  const roundResults = [];
  for (let i = 0; i < totalRounds; i++) {
    if (squares[i] === '🟩') roundResults.push('won');
    else if (squares[i] === '🟥') roundResults.push('lost');
    else roundResults.push('pending');
  }
  let progress = 0;
  if (state === 'PLAYING' && currentTimeLimit > 0) {
    const rem = remainingOverride !== null ? remainingOverride : Math.max(0, currentTimeLimit - elapsed);
    progress = Math.max(0, Math.min(1, 1 - rem / currentTimeLimit));
  } else if (state === 'LOSE') {
    progress = 1;
  }
  updateContainmentState({
    mode: state,
    paused: isPaused,
    progress,
    totalRounds,
    currentRound: roundIndex,
    roundResults,
  });
}

function updateLivesDisplay() {
  if (!dom.livesDisplay) return;
  const safeLives = Math.max(0, Math.min(MAX_LIVES, lives));
  let html = '';
  for (let i = 0; i < MAX_LIVES; i++) {
    html += renderPixelHeartSvg(i < safeLives);
  }
  dom.livesDisplay.innerHTML = html;
}

function updateRoundIndicators() {
  const totalRounds = selectedModules.length || ROUNDS_COUNT;
  for (let i = 0; i < dom.roundLeds.length; i++) {
    const led = dom.roundLeds[i];
    const activeSlot = i < totalRounds;
    led.hidden = !activeSlot;
    led.classList.remove('is-active', 'is-won', 'is-lost');
    if (!activeSlot) continue;
    if (squares[i] === '🟩') {
      led.classList.add('is-won');
    } else if (squares[i] === '🟥') {
      led.classList.add('is-lost');
    } else if (state === 'PLAYING' && i === roundIndex) {
      led.classList.add('is-active');
    }
  }
  syncContainmentScene();
}

function updateTimerDisplay(remaining) {
  if (!dom.timerDisplay) return;
  const clamped = Math.max(0, remaining);
  dom.timerDisplay.textContent = `${clamped.toFixed(1)}s`;
  dom.timerDisplay.classList.toggle('is-amber', clamped < 10 && clamped > 5);
  dom.timerDisplay.classList.toggle('is-critical', clamped <= 5);
  syncContainmentScene(clamped);
}

function triggerErrorFlash() {
  if (!dom.flashOverlay) return;
  dom.flashOverlay.classList.remove('active');
  void dom.flashOverlay.offsetWidth;
  dom.flashOverlay.classList.add('active');
}

function renderStatsMarkup(won, timeSec, remainingLives, roundSquares) {
  const timeLabel = won ? `${Number(timeSec).toFixed(1)}s` : '💥 0.0s';
  const timeClass = won ? 'text-green' : 'text-red';
  return `
    <div class="stat-box">
      <span class="stat-label">${msg('stat_time')}</span>
      <span class="stat-value ${timeClass}">${timeLabel}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">${msg('stat_lives')}</span>
      <span class="stat-value">${formatHearts(remainingLives)}</span>
    </div>
    <div class="stat-box stat-box--full">
      <span class="stat-label">${msg('stat_seq')}</span>
      <span class="stat-value">${roundSquares.join(' ')}</span>
    </div>
  `;
}

function runCleanup() {
  if (currentCleanup) {
    try {
      currentCleanup();
    } catch (err) {
      console.error('Module cleanup error:', err);
    }
    currentCleanup = null;
  }
}

function stopTimerLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function setPausedState(activePaused) {
  isPaused = activePaused;
  if (typeof window !== 'undefined') {
    window.__OVERRIDLE_PAUSED__ = activePaused;
  }
  if (dom.moduleContainer) {
    dom.moduleContainer.classList.toggle('is-paused', activePaused);
  }
  if (dom.pauseOverlay) {
    dom.pauseOverlay.hidden = !activePaused;
  }
  syncContainmentScene();
  if (dom.pauseBtn) {
    dom.pauseBtn.classList.toggle('is-paused', activePaused);
    dom.pauseBtn.setAttribute('aria-pressed', activePaused ? 'true' : 'false');
    dom.pauseBtn.textContent = activePaused ? msg('resume_btn_hud') : msg('pause_btn');
  }
}

function populatePauseInstructions() {
  const modId = selectedModules[roundIndex];
  const entry = MODULE_META[modId];
  if (dom.pauseModDesc) {
    dom.pauseModDesc.textContent = getModuleInstructions(entry);
  }

  let ruleText = '';
  if (entry && entry.ruleSelector && dom.moduleContainer) {
    const ruleEl = dom.moduleContainer.querySelector(entry.ruleSelector);
    if (ruleEl) {
      ruleText = (ruleEl.dataset.ruleText || ruleEl.textContent || '').trim();
    }
  }

  if (dom.pauseModRuleWrap && dom.pauseModRule) {
    if (ruleText) {
      dom.pauseModRule.textContent = ruleText;
      dom.pauseModRuleWrap.hidden = false;
    } else {
      dom.pauseModRule.textContent = '';
      dom.pauseModRuleWrap.hidden = true;
    }
  }
}

function setAutoPause(enabled, { persist = true } = {}) {
  autoPause = Boolean(enabled);
  if (Array.isArray(dom.autoPauseChecks)) {
    dom.autoPauseChecks.forEach((chk) => {
      chk.checked = autoPause;
    });
  }
  if (persist) {
    try {
      window.localStorage.setItem(AUTOPAUSE_STORAGE_KEY, autoPause ? '1' : '0');
    } catch {
      // Ignore storage restriction errors
    }
  }
}

function pauseGame() {
  if (state !== 'PLAYING' || isPaused) return;
  pausedAt = performance.now();
  stopTimerLoop();
  const remaining = Math.max(0, currentTimeLimit - (pausedAt - startTime) / 1000);
  updateTimerDisplay(remaining);
  populatePauseInstructions();
  setPausedState(true);
}

function resumeGame() {
  if (state !== 'PLAYING' || !isPaused) return;
  const pauseDuration = pausedAt !== null ? Math.max(0, performance.now() - pausedAt) : 0;
  startTime += pauseDuration;
  if (lastTickAt !== null) {
    lastTickAt += pauseDuration;
  }
  pausedAt = null;
  setPausedState(false);
  rafId = requestAnimationFrame(tickLoop);
}

function togglePause() {
  if (state !== 'PLAYING') return;
  if (isPaused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function mountCurrentRound() {
  runCleanup();
  dom.moduleContainer.innerHTML = '';

  const modId = selectedModules[roundIndex];
  const entry = MODULE_META[modId];
  if (!entry || !entry.mod || typeof entry.mod.mount !== 'function') {
    throw new Error(t(`Invalid module: ${modId}`, `Modulo non valido: ${modId}`));
  }

  dom.moduleMeta.textContent = t(
    `MODULE ${roundIndex + 1}/${selectedModules.length} • ${getModuleTitle(entry)}`,
    `MODULO ${roundIndex + 1}/${selectedModules.length} • ${getModuleTitle(entry)}`
  );
  updateRoundIndicators();

  const roundRng = mulberry32(getSubSeed(seed, roundIndex));
  roundActive = true;

  const cleanupFn = entry.mod.mount(dom.moduleContainer, roundRng, {
    onWin: () => {
      if (!roundActive || state !== 'PLAYING' || isPaused) return;
      roundActive = false;
      handleRoundWin();
    },
    onMistake: () => {
      if (!roundActive || state !== 'PLAYING' || isPaused) return;
      handleMistake();
    },
  });

  if (typeof cleanupFn === 'function') {
    if (!roundActive || state !== 'PLAYING') {
      try {
        cleanupFn();
      } catch (err) {
        console.error('Module cleanup error:', err);
      }
    } else {
      currentCleanup = cleanupFn;
    }
  }
}

function handleMistake() {
  lives = Math.max(0, lives - 1);
  updateLivesDisplay();
  triggerErrorFlash();
  triggerContainmentHit();
  playError();

  if (lives <= 0) {
    endGame(false);
  }
}

function handleRoundWin() {
  squares[roundIndex] = '🟩';

  if (roundIndex < selectedModules.length - 1) {
    playSuccess();
    triggerContainmentUnlock();
    runCleanup();
    roundIndex += 1;
    mountCurrentRound();
    if (autoPause) {
      pauseGame();
    }
  } else {
    endGame(true);
  }
}

function endGame(won) {
  stopTimerLoop();
  const effectiveNow = isPaused && pausedAt !== null ? pausedAt : performance.now();
  setPausedState(false);
  pausedAt = null;
  roundActive = false;
  runCleanup();
  dom.moduleContainer.innerHTML = '';

  const rawElapsed = (effectiveNow - startTime) / 1000;
  elapsed = Math.max(0, Math.min(currentTimeLimit, rawElapsed));
  state = won ? 'WIN' : 'LOSE';

  if (won) {
    squares = Array(selectedModules.length).fill('🟩');
    playWin();
  } else {
    squares[roundIndex] = '🟥';
    for (let i = roundIndex + 1; i < selectedModules.length; i++) {
      squares[i] = '⬛';
    }
    updateTimerDisplay(Math.max(0, currentTimeLimit - elapsed));
    playExplode();
  }

  updateRoundIndicators();
  updateLivesDisplay();

  currentShareText = buildShareText({
    seed,
    won,
    elapsed,
    lives,
    squares,
    practice: isPractice,
  });

  // Persist daily result only on today's official daily run (bypass in test mode)
  if (!isPractice && !isTestMode && seed === localTodaySeed) {
    saveDailyRecord(localTodaySeed, {
      seed,
      timeLimit: currentTimeLimit,
      won,
      elapsed: Number(elapsed.toFixed(1)),
      lives,
      squares: squares.slice(),
      shareText: currentShareText,
      selectedModuleIds: selectedModules.slice(),
    });
  }

  renderEndScreen(won);
  setActiveScreen('END');
}

function renderEndScreen(won) {
  if (dom.endModeBadge) {
    if (isPractice && practiceModuleId && MODULE_META[practiceModuleId]) {
      const mTitle = getModuleTitle(MODULE_META[practiceModuleId]);
      dom.endModeBadge.textContent = t(
        `PRACTICE • ${mTitle} // #${seed}`,
        `PRATICA • ${mTitle} // #${seed}`
      );
    } else if (isPractice) {
      dom.endModeBadge.textContent = t(`PRACTICE MODE // #${seed}`, `MODALITÀ PRATICA // #${seed}`);
    } else if (isTestMode) {
      dom.endModeBadge.textContent = t(`TEST MODE // #${seed}`, `MODALITÀ TEST // #${seed}`);
    } else {
      dom.endModeBadge.textContent = t(`DAILY PROTOCOL // #${seed}`, `PROTOCOLLO DAILY // #${seed}`);
    }
  }

  dom.endTitle.textContent = won ? msg('override_complete') : msg('incinerated');
  dom.endTitle.classList.toggle('is-win', won);
  dom.endTitle.classList.toggle('is-lose', !won);

  dom.endStats.innerHTML = renderStatsMarkup(won, elapsed, lives, squares);
  dom.sharePreview.textContent = currentShareText;
  dom.copyShareBtn.textContent = msg('copy_result');

  if (dom.retryPracticeBtn) {
    const canRetrySingle = isPractice && Boolean(practiceModuleId && MODULE_META[practiceModuleId]);
    dom.retryPracticeBtn.hidden = !canRetrySingle;
    dom.retryPracticeBtn.disabled = !canRetrySingle;
    if (canRetrySingle) {
      const mTitle = getModuleTitle(MODULE_META[practiceModuleId]);
      const roundLabel =
        practiceRepeatCount === 1
          ? '1 ROUND'
          : t(`${practiceRepeatCount} ROUNDS`, `${practiceRepeatCount} ROUND`);
      dom.retryPracticeBtn.textContent = t(
        `[ ↻ RETRY: ${mTitle} (${roundLabel}) ]`,
        `[ ↻ RIPROVA: ${mTitle} (${roundLabel}) ]`
      );
    }
  }

  dom.practiceBtn.disabled = false;
  dom.practiceBtn.hidden = false;
  dom.practiceBtn.textContent = msg('practice_select_btn');
}

function tickLoop(now) {
  if (state !== 'PLAYING' || isPaused) {
    return;
  }

  const currentElapsed = (now - startTime) / 1000;
  const remaining = Math.max(0, currentTimeLimit - currentElapsed);
  updateTimerDisplay(remaining);

  if (remaining <= 0) {
    endGame(false);
    return;
  }

  if (remaining <= 5.0 && remaining > 0) {
    const urgent = remaining <= 2.0;
    const intervalMs = urgent ? 250 : 500;
    if (lastTickAt === null || now - lastTickAt >= intervalMs) {
      lastTickAt = now;
      playTick(urgent);
    }
  }

  rafId = requestAnimationFrame(tickLoop);
}

function generatePracticeSeed() {
  return Math.floor(100000 + Math.random() * 900000);
}

function setPracticeRepeatCount(count) {
  practiceRepeatCount = count === 5 ? 5 : 1;
  if (dom.practiceMode1Btn) {
    const isOne = practiceRepeatCount === 1;
    dom.practiceMode1Btn.classList.toggle('is-active', isOne);
    dom.practiceMode1Btn.setAttribute('aria-pressed', isOne ? 'true' : 'false');
  }
  if (dom.practiceMode5Btn) {
    const isFive = practiceRepeatCount === 5;
    dom.practiceMode5Btn.classList.toggle('is-active', isFive);
    dom.practiceMode5Btn.setAttribute('aria-pressed', isFive ? 'true' : 'false');
  }
}

function renderPracticeModuleGrid() {
  if (!dom.practiceModuleGrid) return;
  dom.practiceModuleGrid.innerHTML = '';
  MODULE_POOL.forEach((modId, index) => {
    const entry = MODULE_META[modId];
    if (!entry) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'crt-btn practice-mod-btn';
    btn.dataset.moduleId = modId;

    const numSpan = document.createElement('span');
    numSpan.className = 'practice-mod-num';
    numSpan.textContent = String(index + 1).padStart(2, '0');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'practice-mod-name';
    nameSpan.textContent = getModuleTitle(entry);

    btn.append(numSpan, nameSpan);
    btn.addEventListener('click', () => {
      startGame({
        practice: true,
        moduleId: modId,
        roundsCount: practiceRepeatCount,
      });
    });

    dom.practiceModuleGrid.appendChild(btn);
  });
}

function openPracticeSelector(fromScreen = 'STANDBY') {
  practiceReturnScreen = fromScreen === 'END' ? 'END' : 'STANDBY';
  if (state !== 'PRACTICE_SELECT') {
    practiceReturnState = state;
  }
  state = 'PRACTICE_SELECT';
  setPausedState(false);
  pausedAt = null;
  setActiveScreen('PRACTICE');
}

function startGame({ practice = false, moduleId = null, roundsCount = ROUNDS_COUNT } = {}) {
  initAudio();
  stopTimerLoop();
  setPausedState(false);
  pausedAt = null;
  roundActive = false;
  runCleanup();

  isPractice = Boolean(practice);
  const hasSpecificModule =
    isPractice && typeof moduleId === 'string' && Boolean(MODULE_META[moduleId]);
  practiceModuleId = hasSpecificModule ? moduleId : null;
  const totalRounds = hasSpecificModule
    ? Math.max(1, Math.min(ROUNDS_COUNT, Number(roundsCount) || 1))
    : ROUNDS_COUNT;

  seed = isPractice ? generatePracticeSeed() : getTodaySeed();
  selectedModules = hasSpecificModule
    ? Array(totalRounds).fill(practiceModuleId)
    : shuffle(mulberry32(seed), MODULE_POOL).slice(0, ROUNDS_COUNT);
  currentTimeLimit = computeRunTimeLimit(seed, selectedModules);
  roundIndex = 0;
  lives = MAX_LIVES;
  squares = Array(totalRounds).fill('⬛');
  elapsed = 0;
  lastTickAt = null;
  state = 'PLAYING';
  startTime = performance.now();

  updateSeedBadge();
  updateLivesDisplay();
  updateTimerDisplay(currentTimeLimit);
  updateRoundIndicators();
  setActiveScreen('PLAYING');
  setPausedState(false);

  mountCurrentRound();
  if (autoPause) {
    pauseGame();
  } else {
    rafId = requestAnimationFrame(tickLoop);
  }
}

async function copyToClipboard(text, buttonEl) {
  if (!text) return;
  let copied = false;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (!copied) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
  }

  if (buttonEl && copied) {
    const prevTimer = copyResetTimers.get(buttonEl);
    if (prevTimer) {
      clearTimeout(prevTimer);
    }
    buttonEl.textContent = msg('copied_clipboard');
    const timer = setTimeout(() => {
      buttonEl.textContent = msg('copy_result');
      copyResetTimers.delete(buttonEl);
    }, 1800);
    copyResetTimers.set(buttonEl, timer);
  }
}

function renderInitialStandby() {
  localTodaySeed = getLocalDateSeed();
  if (testFlags.resetStorage) {
    clearDailyRecord(localTodaySeed);
  }
  const urlSeed = getUrlSeed();
  const hasForeignSeed = urlSeed !== null && urlSeed !== localTodaySeed;
  const savedDaily = !hasForeignSeed && !isTestMode ? loadDailyRecord(localTodaySeed) : null;

  setPausedState(false);
  pausedAt = null;

  isPractice = false;
  practiceModuleId = null;
  seed = urlSeed !== null ? urlSeed : localTodaySeed;
  selectedModules =
    savedDaily && Array.isArray(savedDaily.selectedModuleIds) && savedDaily.selectedModuleIds.length === ROUNDS_COUNT
      ? savedDaily.selectedModuleIds.slice()
      : shuffle(mulberry32(seed), MODULE_POOL).slice(0, ROUNDS_COUNT);
  currentTimeLimit = computeRunTimeLimit(seed, selectedModules);

  updateSeedBadge();
  updateMuteButton();

  if (savedDaily) {
    lives = typeof savedDaily.lives === 'number' ? savedDaily.lives : MAX_LIVES;
    squares = savedDaily.squares.slice(0, ROUNDS_COUNT);
    standbyShareText = buildShareText({
      seed: savedDaily.seed || localTodaySeed,
      won: Boolean(savedDaily.won),
      elapsed: Number(savedDaily.elapsed || 0),
      lives,
      squares,
      practice: false,
    });

    updateLivesDisplay();
    updateRoundIndicators();
    updateTimerDisplay(savedDaily.won ? Math.max(0, currentTimeLimit - Number(savedDaily.elapsed || 0)) : 0);

    dom.standbyFresh.hidden = true;
    dom.standbyCompleted.hidden = false;

    const won = Boolean(savedDaily.won);
    dom.standbyResultTitle.textContent = won ? msg('override_complete') : msg('incinerated');
    dom.standbyResultTitle.classList.toggle('is-win', won);
    dom.standbyResultTitle.classList.toggle('is-lose', !won);
    dom.standbyResultStats.innerHTML = renderStatsMarkup(won, savedDaily.elapsed || 0, lives, squares);
    dom.standbySharePreview.textContent = standbyShareText;
  } else {
    lives = MAX_LIVES;
    squares = Array(ROUNDS_COUNT).fill('⬛');
    updateLivesDisplay();
    updateRoundIndicators();
    updateTimerDisplay(currentTimeLimit);

    dom.standbyFresh.hidden = false;
    dom.standbyCompleted.hidden = true;
  }

  setActiveScreen('STANDBY');
}

function bindEvents() {
  dom.muteBtn.addEventListener('click', () => {
    toggleMute();
    updateMuteButton();
  });

  dom.startBtn.addEventListener('click', () => {
    startGame({ practice: false });
  });

  if (dom.practiceFreshBtn) {
    dom.practiceFreshBtn.addEventListener('click', () => {
      openPracticeSelector('STANDBY');
    });
  }

  dom.copyStandbyBtn.addEventListener('click', () => {
    copyToClipboard(standbyShareText, dom.copyStandbyBtn);
  });

  dom.practiceStandbyBtn.addEventListener('click', () => {
    openPracticeSelector('STANDBY');
  });

  if (dom.practiceMode1Btn) {
    dom.practiceMode1Btn.addEventListener('click', () => {
      setPracticeRepeatCount(1);
    });
  }

  if (dom.practiceMode5Btn) {
    dom.practiceMode5Btn.addEventListener('click', () => {
      setPracticeRepeatCount(5);
    });
  }

  if (dom.practiceRandomBtn) {
    dom.practiceRandomBtn.addEventListener('click', () => {
      startGame({ practice: true, moduleId: null, roundsCount: ROUNDS_COUNT });
    });
  }

  if (dom.practiceBackBtn) {
    dom.practiceBackBtn.addEventListener('click', () => {
      state = practiceReturnState;
      setActiveScreen(practiceReturnScreen);
    });
  }

  dom.copyShareBtn.addEventListener('click', () => {
    copyToClipboard(currentShareText, dom.copyShareBtn);
  });

  if (dom.retryPracticeBtn) {
    dom.retryPracticeBtn.addEventListener('click', () => {
      startGame({
        practice: true,
        moduleId: practiceModuleId,
        roundsCount: practiceRepeatCount,
      });
    });
  }

  dom.practiceBtn.addEventListener('click', () => {
    openPracticeSelector('END');
  });

  if (dom.pauseBtn) {
    dom.pauseBtn.addEventListener('click', togglePause);
  }

  if (dom.resumeBtn) {
    dom.resumeBtn.addEventListener('click', resumeGame);
  }

  if (Array.isArray(dom.autoPauseChecks)) {
    dom.autoPauseChecks.forEach((chk) => {
      chk.addEventListener('change', () => {
        setAutoPause(chk.checked);
      });
    });
  }

  if (dom.langEnBtn) {
    dom.langEnBtn.addEventListener('click', () => {
      applyLanguage('en');
    });
  }
  if (dom.langItBtn) {
    dom.langItBtn.addEventListener('click', () => {
      applyLanguage('it');
    });
  }

  document.addEventListener('keydown', (event) => {
    if (state !== 'PLAYING' || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
      event.preventDefault();
      togglePause();
    }
  });

  dom.flashOverlay.addEventListener('animationend', () => {
    dom.flashOverlay.classList.remove('active');
  });
}

function exposeReadOnlyDebug() {
  const debugApi = {
    getState: () => state,
    get seed() {
      return seed;
    },
    get todaySeed() {
      return localTodaySeed;
    },
    get isPractice() {
      return isPractice;
    },
    get practiceModuleId() {
      return practiceModuleId;
    },
    get practiceRepeatCount() {
      return practiceRepeatCount;
    },
    get isTestMode() {
      return isTestMode;
    },
    get isPaused() {
      return isPaused;
    },
    get autoPause() {
      return autoPause;
    },
    setAutoPause: (val) => setAutoPause(val),
    get selectedModules() {
      return selectedModules.slice();
    },
    get roundIndex() {
      return roundIndex;
    },
    get lives() {
      return lives;
    },
    get squares() {
      return squares.slice();
    },
    get elapsed() {
      if (state === 'PLAYING') {
        const now = isPaused && pausedAt !== null ? pausedAt : performance.now();
        return Number(Math.min(currentTimeLimit, (now - startTime) / 1000).toFixed(1));
      }
      return Number(elapsed.toFixed(1));
    },
  };

  Object.freeze(debugApi);
  window.__OVERRIDLE_DEBUG__ = debugApi;
}

function updateLangButtons() {
  const active = getLang();
  if (dom.langEnBtn) {
    const isEn = active === 'en';
    dom.langEnBtn.classList.toggle('is-active', isEn);
    dom.langEnBtn.setAttribute('aria-pressed', isEn ? 'true' : 'false');
  }
  if (dom.langItBtn) {
    const isItalian = active === 'it';
    dom.langItBtn.classList.toggle('is-active', isItalian);
    dom.langItBtn.setAttribute('aria-pressed', isItalian ? 'true' : 'false');
  }
}

function applyLanguage(lang, { persist = true } = {}) {
  setLang(lang, { persist });
  updateLangButtons();
  applyDomTranslations(document);
  renderPracticeModuleGrid();
  updateSeedBadge();
  if (state === 'STANDBY') {
    renderInitialStandby();
  }
}

function init() {
  initLang();
  queryDom();
  initContainmentScene();
  setAutoPause(autoPause, { persist: false });
  updateLangButtons();
  applyDomTranslations(document);
  renderPracticeModuleGrid();
  setPracticeRepeatCount(1);
  bindEvents();
  renderInitialStandby();
  syncContainmentScene();
  exposeReadOnlyDebug();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
