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

export const TOTAL_TIME = 60.0;
export const MAX_LIVES = 3;
export const ROUNDS_COUNT = 5;

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
];

const MODULE_META = {
  wires: {
    id: 'wires',
    title: 'TAGLIA I CAVI',
    mod: wires,
    instructions:
      'Leggi la regola logica dei cavi (colori, quantità e posizioni) e recidi solo il cavo richiesto.',
    ruleSelector: '.ovr-wires-rule-text',
  },
  binary_switches: {
    id: 'binary_switches',
    title: 'SWITCH BINARI',
    mod: binary_switches,
    instructions:
      'Attiva gli switch binari per sommare esattamente il valore decimale target e premi EXEC.',
  },
  math_order: {
    id: 'math_order',
    title: 'ORDINE DI SCARICA',
    mod: math_order,
    instructions:
      'Calcola il valore di ciascun nodo matematico e toccali tutti nella sequenza indicata.',
    ruleSelector: '.ovr-math-dir',
  },
  fallout_hack: {
    id: 'fallout_hack',
    title: 'TERMINALE FALLOUT',
    mod: fallout_hack,
    instructions:
      'Individua la password corretta: LIKENESS indica quante lettere combaciano nella stessa posizione.',
  },
  memory_flash: {
    id: 'memory_flash',
    title: 'KEYCARD FLASH',
    mod: memory_flash,
    instructions:
      'Memorizza i 4 nodi illuminati durante il flash iniziale e toccali nello stesso identico ordine.',
  },
  glyph_rules: {
    id: 'glyph_rules',
    title: 'GRIGLIA GEROGLIFICI',
    mod: glyph_rules,
    instructions:
      'Verifica quali simboli compaiono nella griglia 3×3 rispetto alla regola attiva e premi il glifo corretto.',
    ruleSelector: '.ovr-glyph-text',
  },
  freq_align: {
    id: 'freq_align',
    title: 'ALLINEA FREQUENZA',
    mod: freq_align,
    instructions:
      'Regola lo slider della frequenza finché la tua onda si sovrappone al target e mantieni l’aggancio.',
  },
  pressure_purge: {
    id: 'pressure_purge',
    title: 'SPURGO PRESSIONE',
    mod: pressure_purge,
    instructions:
      'Tieni premuto PURGE per far salire la pressione e rilascia esattamente dentro la fascia verde mobile.',
  },
  rotor_lock: {
    id: 'rotor_lock',
    title: 'AGGANCIO ROTORE',
    mod: rotor_lock,
    instructions:
      'Premi LOCK due volte quando la lancetta rotante passa dentro la zona verde per agganciare entrambi i perni.',
  },
  valve_sequence: {
    id: 'valve_sequence',
    title: 'BYPASS VALVOLE',
    mod: valve_sequence,
    instructions:
      'Tocca le 3 valvole critiche nell’ordine esatto in cui superano la soglia della zona rossa (≥ 75%).',
  },
};

const STORAGE_PREFIX = 'override30_';
const SHARE_URL = 'https://overridle.trifase.online';
const COPY_DEFAULT_LABEL = '[ COPIA RISULTATO ]';
const COPY_SUCCESS_LABEL = 'COPIATO NEGLI APPUNTI!';

const testFlags = getTestModeFlags();
const isTestMode = testFlags.bypassStorage;

// Game state
let state = 'STANDBY'; // 'STANDBY' | 'PLAYING' | 'WIN' | 'LOSE'
let localTodaySeed = getLocalDateSeed();
let seed = getTodaySeed();
let isPractice = false;
let isPaused = false;
let pausedAt = null;
let selectedModules = shuffle(mulberry32(seed), MODULE_POOL).slice(0, ROUNDS_COUNT);
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
  dom.copyStandbyBtn = document.getElementById('copy-standby-btn');
  dom.practiceStandbyBtn = document.getElementById('practice-standby-btn');

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
  dom.practiceBtn = document.getElementById('practice-btn');
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
    if (parsed.timeLimit !== TOTAL_TIME) {
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
  const prefix = practice ? `OVERRIDLE [PRATICA] #${gameSeed}` : `OVERRIDLE #${gameSeed}`;
  return `${prefix} — ${outcomePart} | ${heartsStr}\n${roundSquares.join(' ')}\n${SHARE_URL}`;
}

function setActiveScreen(screenName) {
  const mapping = {
    STANDBY: dom.screenStandby,
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
    dom.seedBadge.textContent = isTestMode ? 'TEST // PRATICA' : 'PRATICA';
    dom.seedBadge.title = `Seed Pratica #${seed}`;
    dom.seedBadge.classList.add('is-practice');
  } else {
    dom.seedBadge.textContent = isTestMode ? `TEST #${seed}` : `#${seed}`;
    dom.seedBadge.title = isTestMode ? `Modalità Test — Seed #${seed}` : `Seed #${seed}`;
    dom.seedBadge.classList.toggle('is-practice', isTestMode);
  }
}

function updateLivesDisplay() {
  if (!dom.livesDisplay) return;
  dom.livesDisplay.textContent = formatHearts(lives);
}

function updateRoundIndicators() {
  for (let i = 0; i < dom.roundLeds.length; i++) {
    const led = dom.roundLeds[i];
    led.classList.remove('is-active', 'is-won', 'is-lost');
    if (squares[i] === '🟩') {
      led.classList.add('is-won');
    } else if (squares[i] === '🟥') {
      led.classList.add('is-lost');
    } else if (state === 'PLAYING' && i === roundIndex) {
      led.classList.add('is-active');
    }
  }
}

function updateTimerDisplay(remaining) {
  if (!dom.timerDisplay) return;
  const clamped = Math.max(0, remaining);
  dom.timerDisplay.textContent = `${clamped.toFixed(1)}s`;
  dom.timerDisplay.classList.toggle('is-amber', clamped < 10 && clamped > 5);
  dom.timerDisplay.classList.toggle('is-critical', clamped <= 5);
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
      <span class="stat-label">TEMPO</span>
      <span class="stat-value ${timeClass}">${timeLabel}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">VITE</span>
      <span class="stat-value">${formatHearts(remainingLives)}</span>
    </div>
    <div class="stat-box stat-box--full">
      <span class="stat-label">SEQUENZA MODULI</span>
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
  if (dom.pauseBtn) {
    dom.pauseBtn.classList.toggle('is-paused', activePaused);
    dom.pauseBtn.setAttribute('aria-pressed', activePaused ? 'true' : 'false');
    dom.pauseBtn.textContent = activePaused ? '[▶ RIPRENDI]' : '[⏸ PAUSA]';
  }
}

function populatePauseInstructions() {
  const modId = selectedModules[roundIndex];
  const entry = MODULE_META[modId];
  if (dom.pauseModDesc) {
    dom.pauseModDesc.textContent = entry ? entry.instructions : '';
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

function pauseGame() {
  if (state !== 'PLAYING' || isPaused) return;
  pausedAt = performance.now();
  stopTimerLoop();
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
    throw new Error(`Modulo non valido: ${modId}`);
  }

  dom.moduleMeta.textContent = `MODULO ${roundIndex + 1}/${ROUNDS_COUNT} • ${entry.title}`;
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
  playError();

  if (lives <= 0) {
    endGame(false);
  }
}

function handleRoundWin() {
  squares[roundIndex] = '🟩';

  if (roundIndex < ROUNDS_COUNT - 1) {
    playSuccess();
    runCleanup();
    roundIndex += 1;
    mountCurrentRound();
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
  elapsed = Math.max(0, Math.min(TOTAL_TIME, rawElapsed));
  state = won ? 'WIN' : 'LOSE';

  if (won) {
    squares = Array(ROUNDS_COUNT).fill('🟩');
    playWin();
  } else {
    squares[roundIndex] = '🟥';
    for (let i = roundIndex + 1; i < ROUNDS_COUNT; i++) {
      squares[i] = '⬛';
    }
    updateTimerDisplay(Math.max(0, TOTAL_TIME - elapsed));
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
      timeLimit: TOTAL_TIME,
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
    if (isPractice) {
      dom.endModeBadge.textContent = `MODALITÀ PRATICA // #${seed}`;
    } else if (isTestMode) {
      dom.endModeBadge.textContent = `MODALITÀ TEST // #${seed}`;
    } else {
      dom.endModeBadge.textContent = `PROTOCOLLO DAILY // #${seed}`;
    }
  }

  dom.endTitle.textContent = won ? 'OVERRIDE COMPLETATO' : 'INCENERITO';
  dom.endTitle.classList.toggle('is-win', won);
  dom.endTitle.classList.toggle('is-lose', !won);

  dom.endStats.innerHTML = renderStatsMarkup(won, elapsed, lives, squares);
  dom.sharePreview.textContent = currentShareText;
  dom.copyShareBtn.textContent = COPY_DEFAULT_LABEL;

  const practiceUnlocked =
    isPractice || isTestMode || loadDailyRecord(localTodaySeed) !== null;
  dom.practiceBtn.disabled = !practiceUnlocked;
  dom.practiceBtn.hidden = !practiceUnlocked;
}

function tickLoop(now) {
  if (state !== 'PLAYING' || isPaused) {
    return;
  }

  const currentElapsed = (now - startTime) / 1000;
  const remaining = Math.max(0, TOTAL_TIME - currentElapsed);
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

function startGame({ practice = false } = {}) {
  initAudio();
  stopTimerLoop();
  setPausedState(false);
  pausedAt = null;
  roundActive = false;
  runCleanup();

  isPractice = practice;
  seed = practice ? generatePracticeSeed() : getTodaySeed();
  selectedModules = shuffle(mulberry32(seed), MODULE_POOL).slice(0, ROUNDS_COUNT);
  roundIndex = 0;
  lives = MAX_LIVES;
  squares = Array(ROUNDS_COUNT).fill('⬛');
  elapsed = 0;
  lastTickAt = null;
  state = 'PLAYING';
  startTime = performance.now();

  updateSeedBadge();
  updateLivesDisplay();
  updateTimerDisplay(TOTAL_TIME);
  updateRoundIndicators();
  setActiveScreen('PLAYING');
  setPausedState(false);

  mountCurrentRound();
  rafId = requestAnimationFrame(tickLoop);
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
    buttonEl.textContent = COPY_SUCCESS_LABEL;
    const timer = setTimeout(() => {
      buttonEl.textContent = COPY_DEFAULT_LABEL;
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
  seed = urlSeed !== null ? urlSeed : localTodaySeed;
  selectedModules =
    savedDaily && Array.isArray(savedDaily.selectedModuleIds) && savedDaily.selectedModuleIds.length === ROUNDS_COUNT
      ? savedDaily.selectedModuleIds.slice()
      : shuffle(mulberry32(seed), MODULE_POOL).slice(0, ROUNDS_COUNT);

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
    updateTimerDisplay(savedDaily.won ? Math.max(0, TOTAL_TIME - Number(savedDaily.elapsed || 0)) : 0);

    dom.standbyFresh.hidden = true;
    dom.standbyCompleted.hidden = false;

    const won = Boolean(savedDaily.won);
    dom.standbyResultTitle.textContent = won ? 'OVERRIDE COMPLETATO' : 'INCENERITO';
    dom.standbyResultTitle.classList.toggle('is-win', won);
    dom.standbyResultTitle.classList.toggle('is-lose', !won);
    dom.standbyResultStats.innerHTML = renderStatsMarkup(won, savedDaily.elapsed || 0, lives, squares);
    dom.standbySharePreview.textContent = standbyShareText;
  } else {
    lives = MAX_LIVES;
    squares = Array(ROUNDS_COUNT).fill('⬛');
    updateLivesDisplay();
    updateRoundIndicators();
    updateTimerDisplay(TOTAL_TIME);

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

  dom.copyStandbyBtn.addEventListener('click', () => {
    copyToClipboard(standbyShareText, dom.copyStandbyBtn);
  });

  dom.practiceStandbyBtn.addEventListener('click', () => {
    startGame({ practice: true });
  });

  dom.copyShareBtn.addEventListener('click', () => {
    copyToClipboard(currentShareText, dom.copyShareBtn);
  });

  dom.practiceBtn.addEventListener('click', () => {
    startGame({ practice: true });
  });

  if (dom.pauseBtn) {
    dom.pauseBtn.addEventListener('click', togglePause);
  }

  if (dom.resumeBtn) {
    dom.resumeBtn.addEventListener('click', resumeGame);
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
    get isTestMode() {
      return isTestMode;
    },
    get isPaused() {
      return isPaused;
    },
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
        return Number(Math.min(TOTAL_TIME, (now - startTime) / 1000).toFixed(1));
      }
      return Number(elapsed.toFixed(1));
    },
  };

  Object.freeze(debugApi);
  window.__OVERRIDLE_DEBUG__ = debugApi;
}

function init() {
  queryDom();
  bindEvents();
  renderInitialStandby();
  exposeReadOnlyDebug();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
