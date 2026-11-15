import { randInt, shuffle } from '../prng.js';
import { t } from '../i18n.js';

const COLORS = [
  { id: 'red', en: 'RED', it: 'ROSSO', hex: '#ff3b3b' },
  { id: 'green', en: 'GREEN', it: 'VERDE', hex: '#00ff66' },
  { id: 'yellow', en: 'YELLOW', it: 'GIALLO', hex: '#ffcc00' },
  { id: 'cyan', en: 'CYAN', it: 'CIANO', hex: '#00e5ff' },
];

const TOTAL_STEPS = 3;

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const mode = randInt(rng, 0, 1); // 0 = parola scritta, 1 = colore visivo
  const buttonOrder = shuffle(rng, COLORS);

  const ruleText =
    mode === 0
      ? t(
          'RULE: PRESS THE BUTTON OF THE WRITTEN WORD',
          'REGOLA: PREMI IL PULSANTE DELLA PAROLA SCRITTA'
        )
      : t(
          'RULE: PRESS THE BUTTON OF THE INK COLOR',
          'REGOLA: PREMI IL PULSANTE DEL COLORE DELLE LETTERE'
        );

  let step = 0;
  let currentWordIdx = 0;
  let currentInkIdx = 1;
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

  const rollPrompt = () => {
    currentWordIdx = randInt(rng, 0, COLORS.length - 1);
    const otherIndices = [0, 1, 2, 3].filter((i) => i !== currentWordIdx);
    currentInkIdx = otherIndices[randInt(rng, 0, otherIndices.length - 1)];
  };

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-so {
      box-sizing: border-box;
      width: 100%;
      max-width: 348px;
      margin: 0 auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      color: var(--crt-green, #00ff66);
      user-select: none;
      -webkit-user-select: none;
    }
    .ovr-so * {
      box-sizing: border-box;
    }
    .ovr-so-rule {
      border: 1px solid rgba(0, 229, 255, 0.45);
      background: rgba(0, 229, 255, 0.08);
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-align: center;
      color: var(--crt-cyan, #00e5ff);
      line-height: 1.35;
    }
    .ovr-so-steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .ovr-so-step {
      padding: 5px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid rgba(0, 255, 102, 0.25);
      border-radius: 3px;
      background: rgba(5, 10, 7, 0.88);
      color: rgba(0, 255, 102, 0.45);
    }
    .ovr-so-step.is-active {
      border-color: var(--crt-cyan, #00e5ff);
      color: var(--crt-cyan, #00e5ff);
      background: rgba(0, 229, 255, 0.1);
    }
    .ovr-so-step.is-done {
      border-color: var(--crt-green, #00ff66);
      background: var(--crt-green, #00ff66);
      color: #050a07;
    }
    .ovr-so-display {
      border: 1px solid rgba(0, 255, 102, 0.38);
      background: #040906;
      border-radius: 4px;
      min-height: 82px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.85);
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .ovr-so-display.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.18);
    }
    .ovr-so-word {
      font-size: 36px;
      font-weight: 900;
      letter-spacing: 0.12em;
      line-height: 1;
      text-shadow: 0 0 14px currentColor;
    }
    .ovr-so-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .ovr-so-btn {
      appearance: none;
      touch-action: manipulation;
      min-height: 54px;
      padding: 8px 10px;
      border: 2px solid var(--so-color, #00ff66);
      border-radius: 4px;
      background: rgba(5, 10, 7, 0.94);
      color: var(--so-color, #00ff66);
      font-family: inherit;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.08em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: background-color 90ms ease, transform 60ms ease, box-shadow 90ms ease;
    }
    .ovr-so-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.15);
    }
    .ovr-so-btn:active:not(:disabled) {
      transform: scale(0.96);
    }
    .ovr-so-swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: var(--so-color, #00ff66);
      flex-shrink: 0;
    }
    .ovr-so-status {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-align: center;
      min-height: 15px;
      color: rgba(0, 255, 102, 0.78);
    }
    .ovr-so-status.is-ok {
      color: var(--crt-green, #00ff66);
    }
    .ovr-so-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-so';
  root.dataset.mode = String(mode);

  const ruleEl = document.createElement('div');
  ruleEl.className = 'ovr-so-rule';
  ruleEl.textContent = ruleText;

  const stepsRow = document.createElement('div');
  stepsRow.className = 'ovr-so-steps';
  const stepEls = [];
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const el = document.createElement('div');
    el.className = 'ovr-so-step';
    el.textContent = `STEP ${i + 1}/3`;
    stepsRow.appendChild(el);
    stepEls.push(el);
  }

  const displayEl = document.createElement('div');
  displayEl.className = 'ovr-so-display';
  const wordEl = document.createElement('div');
  wordEl.className = 'ovr-so-word';
  displayEl.appendChild(wordEl);

  const gridEl = document.createElement('div');
  gridEl.className = 'ovr-so-grid';

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-so-status';

  const renderStep = () => {
    rollPrompt();
    const expectedIdx = mode === 0 ? currentWordIdx : currentInkIdx;
    wordEl.textContent = t(COLORS[currentWordIdx].en, COLORS[currentWordIdx].it);
    wordEl.style.color = COLORS[currentInkIdx].hex;
    root.dataset.expectedId = COLORS[expectedIdx].id;

    for (let i = 0; i < TOTAL_STEPS; i++) {
      stepEls[i].classList.toggle('is-done', i < step);
      stepEls[i].classList.toggle('is-active', i === step);
    }
    statusEl.className = 'ovr-so-status';
    statusEl.textContent =
      mode === 0
        ? t('SELECT WRITTEN WORD', 'SELEZIONA IL NOME SCRITTO')
        : t('SELECT INK COLOR', 'SELEZIONA IL COLORE VISIVO');
  };

  const colorBtns = buttonOrder.map((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ovr-so-btn';
    btn.dataset.colorId = c.id;
    btn.style.setProperty('--so-color', c.hex);

    const swatch = document.createElement('span');
    swatch.className = 'ovr-so-swatch';
    const text = document.createElement('span');
    text.textContent = t(c.en, c.it);
    btn.append(swatch, text);

    btn.addEventListener(
      'click',
      () => {
        if (solved || disposed) return;
        if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;

        const expectedId = root.dataset.expectedId;
        if (c.id === expectedId) {
          step += 1;
          if (step >= TOTAL_STEPS) {
            solved = true;
            stepEls.forEach((el) => {
              el.classList.remove('is-active');
              el.classList.add('is-done');
            });
            colorBtns.forEach((b) => {
              b.disabled = true;
            });
            statusEl.className = 'ovr-so-status is-ok';
            statusEl.textContent = t('COLOR SEQUENCE CLEARED', 'SEQUENZA CROMATICA SUPERATA');
            if (typeof onWin === 'function') onWin();
          } else {
            renderStep();
          }
        } else {
          displayEl.classList.remove('is-err');
          void displayEl.offsetWidth;
          displayEl.classList.add('is-err');
          statusEl.className = 'ovr-so-status is-err';
          statusEl.textContent = t('WRONG ANSWER!', 'RISPOSTA ERRATA!');
          scheduleTimer(() => {
            displayEl.classList.remove('is-err');
          }, 300);
          if (typeof onMistake === 'function') onMistake();
          if (!disposed && !solved) {
            renderStep();
          }
        }
      },
      { signal: ac.signal }
    );

    gridEl.appendChild(btn);
    return btn;
  });

  renderStep();
  root.append(ruleEl, stepsRow, displayEl, gridEl, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
