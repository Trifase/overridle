import { randInt, shuffle } from '../prng.js';
import { t } from '../i18n.js';

const SYSTEM_DEF = [
  { en: 'SHIELDS', it: 'SCUDI' },
  { en: 'ENGINES', it: 'MOTORI' },
  { en: 'CRYO', it: 'CRIO' },
];
const MAX_LEVEL = 5;

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const SYSTEM_NAMES = SYSTEM_DEF.map((s) => t(s.en, s.it));
  const mode = randInt(rng, 0, 1); // 0 = Somma + Uguali, 1 = Somma + Doppio
  const perm = shuffle(rng, [0, 1, 2]);
  const [idxA, idxB, idxC] = perm;

  const target = [1, 1, 1];
  let total = 3;
  let ruleText = '';

  if (mode === 0) {
    const valEqual = randInt(rng, 1, 5);
    let valFixed = randInt(rng, 1, 5);
    if (valFixed === 1 && valEqual === 1) {
      valFixed = randInt(rng, 2, 5);
    }
    target[idxA] = valFixed;
    target[idxB] = valEqual;
    target[idxC] = valEqual;
    total = valFixed + valEqual * 2;
    ruleText = t(
      `TOTAL = ${total} MW • ${SYSTEM_NAMES[idxA]} = ${valFixed} MW • ${SYSTEM_NAMES[idxB]} = ${SYSTEM_NAMES[idxC]}`,
      `TOTALE = ${total} MW • ${SYSTEM_NAMES[idxA]} = ${valFixed} MW • ${SYSTEM_NAMES[idxB]} = ${SYSTEM_NAMES[idxC]}`
    );
  } else {
    const valBase = randInt(rng, 1, 2);
    const valDouble = valBase * 2;
    const valFixed = randInt(rng, 1, 5);
    target[idxA] = valDouble;
    target[idxB] = valBase;
    target[idxC] = valFixed;
    total = valDouble + valBase + valFixed;
    ruleText = t(
      `TOTAL = ${total} MW • ${SYSTEM_NAMES[idxC]} = ${valFixed} MW • ${SYSTEM_NAMES[idxA]} = 2× ${SYSTEM_NAMES[idxB]}`,
      `TOTALE = ${total} MW • ${SYSTEM_NAMES[idxC]} = ${valFixed} MW • ${SYSTEM_NAMES[idxA]} = 2× ${SYSTEM_NAMES[idxB]}`
    );
  }

  const levels = [1, 1, 1];
  let solved = false;
  let disposed = false;
  const timers = new Set();
  const ac = new AbortController();

  const scheduleTimer = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
  };

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-rb {
      box-sizing: border-box;
      width: 100%;
      max-width: 348px;
      margin: 0 auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 9px;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      color: var(--crt-green, #00ff66);
      user-select: none;
      -webkit-user-select: none;
    }
    .ovr-rb * {
      box-sizing: border-box;
    }
    .ovr-rb-rule {
      border: 1px solid rgba(0, 229, 255, 0.42);
      background: rgba(0, 229, 255, 0.07);
      border-radius: 4px;
      padding: 7px 9px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-align: center;
      color: var(--crt-cyan, #00e5ff);
      line-height: 1.38;
    }
    .ovr-rb-total {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      border: 1px solid rgba(0, 255, 102, 0.3);
      background: rgba(5, 10, 7, 0.9);
      border-radius: 4px;
      font-size: 12px;
      font-weight: 800;
    }
    .ovr-rb-total.is-match {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.12);
    }
    .ovr-rb-total.is-over {
      border-color: var(--crt-amber, #ffb000);
      color: var(--crt-amber, #ffb000);
    }
    .ovr-rb-cols {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .ovr-rb-col {
      border: 1px solid rgba(0, 255, 102, 0.3);
      background: rgba(5, 10, 7, 0.9);
      border-radius: 4px;
      padding: 7px 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    .ovr-rb-name {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--crt-cyan, #00e5ff);
    }
    .ovr-rb-bars {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ovr-rb-seg {
      appearance: none;
      touch-action: manipulation;
      width: 100%;
      height: 15px;
      border: 1px solid rgba(0, 255, 102, 0.25);
      border-radius: 2px;
      background: rgba(0, 255, 102, 0.06);
      cursor: pointer;
      padding: 0;
      transition: background-color 80ms ease, border-color 80ms ease;
    }
    .ovr-rb-seg.is-lit {
      border-color: var(--crt-green, #00ff66);
      background: var(--crt-green, #00ff66);
      box-shadow: 0 0 6px rgba(0, 255, 102, 0.38);
    }
    .ovr-rb-val {
      font-size: 13px;
      font-weight: 800;
      color: var(--crt-amber, #ffb000);
    }
    .ovr-rb-stepper {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
    .ovr-rb-step-btn {
      appearance: none;
      touch-action: manipulation;
      min-height: 36px;
      border: 1px solid rgba(0, 255, 102, 0.45);
      border-radius: 3px;
      background: rgba(0, 255, 102, 0.1);
      color: var(--crt-green, #00ff66);
      font-family: inherit;
      font-size: 18px;
      font-weight: 900;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background-color 80ms ease, border-color 80ms ease, transform 60ms ease;
    }
    .ovr-rb-step-btn:hover:not(:disabled) {
      background: rgba(0, 255, 102, 0.2);
      border-color: var(--crt-green, #00ff66);
    }
    .ovr-rb-step-btn:active:not(:disabled) {
      transform: scale(0.95);
    }
    .ovr-rb-step-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .ovr-rb-exec {
      appearance: none;
      touch-action: manipulation;
      width: 100%;
      min-height: 44px;
      border: 1px solid var(--crt-green, #00ff66);
      border-radius: 4px;
      background: rgba(0, 255, 102, 0.12);
      color: var(--crt-green, #00ff66);
      font-family: inherit;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.08em;
      cursor: pointer;
      transition: background-color 100ms ease, border-color 100ms ease, transform 60ms ease;
    }
    .ovr-rb-exec:hover:not(:disabled) {
      background: rgba(0, 255, 102, 0.22);
    }
    .ovr-rb-exec:active:not(:disabled) {
      transform: scale(0.98);
    }
    .ovr-rb-exec.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.22);
      color: var(--crt-red, #ff2a2a);
    }
    .ovr-rb-exec.is-win {
      border-color: var(--crt-green, #00ff66);
      background: var(--crt-green, #00ff66);
      color: #050a07;
    }
    .ovr-rb-status {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-align: center;
      min-height: 15px;
      color: rgba(0, 255, 102, 0.78);
    }
    .ovr-rb-status.is-ok {
      color: var(--crt-green, #00ff66);
    }
    .ovr-rb-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-rb';
  root.dataset.mode = String(mode);
  root.dataset.target = target.join(',');

  const ruleEl = document.createElement('div');
  ruleEl.className = 'ovr-rb-rule';
  ruleEl.textContent = ruleText;

  const totalBar = document.createElement('div');
  totalBar.className = 'ovr-rb-total';
  const totalLbl = document.createElement('span');
  totalLbl.textContent = t('REACTOR LOAD', 'CARICO REATTORE');
  const totalVal = document.createElement('span');
  totalBar.append(totalLbl, totalVal);

  const colsEl = document.createElement('div');
  colsEl.className = 'ovr-rb-cols';

  const colViews = [];

  const updateView = () => {
    const sum = levels[0] + levels[1] + levels[2];
    totalVal.textContent = `${sum} / ${total} MW`;
    totalBar.classList.toggle('is-match', sum === total);
    totalBar.classList.toggle('is-over', sum !== total && sum > total);

    colViews.forEach(({ segBtns, valEl, minusBtn, plusBtn }, sysIdx) => {
      const lv = levels[sysIdx];
      valEl.textContent = `${lv} MW`;
      segBtns.forEach((btn, segLevelIdx) => {
        const segLevel = MAX_LEVEL - segLevelIdx; // top is 5, bottom is 1
        btn.classList.toggle('is-lit', segLevel <= lv);
      });
      minusBtn.disabled = solved || lv <= 1;
      plusBtn.disabled = solved || lv >= MAX_LEVEL;
    });
  };

  for (let sysIdx = 0; sysIdx < 3; sysIdx++) {
    const col = document.createElement('div');
    col.className = 'ovr-rb-col';

    const nameEl = document.createElement('div');
    nameEl.className = 'ovr-rb-name';
    nameEl.textContent = SYSTEM_NAMES[sysIdx];

    const barsEl = document.createElement('div');
    barsEl.className = 'ovr-rb-bars';

    const segBtns = [];
    for (let lv = MAX_LEVEL; lv >= 1; lv--) {
      const segBtn = document.createElement('button');
      segBtn.type = 'button';
      segBtn.className = 'ovr-rb-seg';
      segBtn.dataset.system = String(sysIdx);
      segBtn.dataset.level = String(lv);
      segBtn.setAttribute('aria-label', `${SYSTEM_NAMES[sysIdx]} ${lv} megawatt`);

      segBtn.addEventListener(
        'click',
        () => {
          if (solved || disposed) return;
          if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;
          levels[sysIdx] = lv;
          updateView();
        },
        { signal: ac.signal }
      );

      segBtns.push(segBtn);
      barsEl.appendChild(segBtn);
    }

    const valEl = document.createElement('div');
    valEl.className = 'ovr-rb-val';

    const stepperEl = document.createElement('div');
    stepperEl.className = 'ovr-rb-stepper';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'ovr-rb-step-btn';
    minusBtn.dataset.system = String(sysIdx);
    minusBtn.dataset.dir = 'down';
    minusBtn.textContent = '−';
    minusBtn.setAttribute('aria-label', t(`${SYSTEM_NAMES[sysIdx]} decrease`, `${SYSTEM_NAMES[sysIdx]} diminuisci`));
    minusBtn.addEventListener(
      'click',
      () => {
        if (solved || disposed) return;
        if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;
        levels[sysIdx] = Math.max(1, levels[sysIdx] - 1);
        updateView();
      },
      { signal: ac.signal }
    );

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'ovr-rb-step-btn';
    plusBtn.dataset.system = String(sysIdx);
    plusBtn.dataset.dir = 'up';
    plusBtn.textContent = '+';
    plusBtn.setAttribute('aria-label', t(`${SYSTEM_NAMES[sysIdx]} increase`, `${SYSTEM_NAMES[sysIdx]} aumenta`));
    plusBtn.addEventListener(
      'click',
      () => {
        if (solved || disposed) return;
        if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;
        levels[sysIdx] = Math.min(MAX_LEVEL, levels[sysIdx] + 1);
        updateView();
      },
      { signal: ac.signal }
    );

    stepperEl.append(minusBtn, plusBtn);
    col.append(nameEl, barsEl, valEl, stepperEl);
    colsEl.appendChild(col);
    colViews.push({ segBtns, valEl, minusBtn, plusBtn });
  }

  const execBtn = document.createElement('button');
  execBtn.type = 'button';
  execBtn.className = 'ovr-rb-exec';
  execBtn.textContent = t('[ STABILIZE CORE ]', '[ STABILIZZA NOCCIOLO ]');

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-rb-status';
  statusEl.textContent = t(
    'SET LEVELS (1–5 MW) AND STABILIZE',
    'IMPOSTA I LIVELLI (1–5 MW) E STABILIZZA'
  );

  execBtn.addEventListener(
    'click',
    () => {
      if (solved || disposed) return;
      if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;

      const match = levels.every((v, idx) => v === target[idx]);
      if (match) {
        solved = true;
        execBtn.classList.add('is-win');
        execBtn.disabled = true;
        colViews.forEach(({ segBtns, minusBtn, plusBtn }) => {
          segBtns.forEach((b) => {
            b.disabled = true;
          });
          minusBtn.disabled = true;
          plusBtn.disabled = true;
        });
        statusEl.className = 'ovr-rb-status is-ok';
        statusEl.textContent = t('CORE BALANCED', 'NOCCIOLO BILANCIATO');
        if (typeof onWin === 'function') onWin();
      } else {
        execBtn.classList.remove('is-err');
        void execBtn.offsetWidth;
        execBtn.classList.add('is-err');
        statusEl.className = 'ovr-rb-status is-err';
        statusEl.textContent = t(
          'WRONG DISTRIBUTION — RECALIBRATE!',
          'DISTRIBUZIONE ERRATA — RICALIBRA!'
        );
        scheduleTimer(() => {
          execBtn.classList.remove('is-err');
        }, 340);
        if (typeof onMistake === 'function') onMistake();
      }
    },
    { signal: ac.signal }
  );

  updateView();
  root.append(ruleEl, totalBar, colsEl, execBtn, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
