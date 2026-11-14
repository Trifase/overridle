import { randInt, shuffle } from '../prng.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const NUMBERS = ['1', '2', '3', '4', '5'];
const SYMBOLS = ['▲', '◆', '●', '★', '✚'];
const TERRAIN_DECOR = ['·', '·', '≈', '░', '▲', '+'];

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const mode = randInt(rng, 0, 2);

  let colLabels;
  let rowLabels;
  let ruleText;
  const separator = mode === 2 ? '-' : '';

  if (mode === 0) {
    colLabels = LETTERS.slice();
    rowLabels = NUMBERS.slice();
    ruleText = 'ASSI STANDARD: INCROCIA COLONNA (A–E) E RIGA (1–5)';
  } else if (mode === 1) {
    colLabels = shuffle(rng, LETTERS);
    rowLabels = shuffle(rng, NUMBERS);
    if (colLabels.join('') === 'ABCDE' && rowLabels.join('') === '12345') {
      colLabels.reverse();
    }
    ruleText = 'ASSI IN DISORDINE: CONTROLLA LE ETICHETTE SULLA CORNICE';
  } else {
    colLabels = shuffle(rng, SYMBOLS);
    rowLabels = NUMBERS.slice();
    ruleText = 'ASSI SIMBOLICI: INCROCIA SIMBOLO COLONNA E NUMERO RIGA';
  }

  const allCoords = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      allCoords.push({ r, c, label: `${colLabels[c]}${separator}${rowLabels[r]}` });
    }
  }
  const picked = shuffle(rng, allCoords).slice(0, 3);
  const targetMap = new Map(picked.map((t, idx) => [`${t.r},${t.c}`, idx]));

  let hits = 0;
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
    .ovr-tm {
      box-sizing: border-box;
      width: 100%;
      max-width: 348px;
      margin: 0 auto;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      color: var(--crt-green, #00ff66);
      user-select: none;
      -webkit-user-select: none;
    }
    .ovr-tm * {
      box-sizing: border-box;
    }
    .ovr-tm-rule {
      border: 1px solid rgba(0, 229, 255, 0.4);
      background: rgba(0, 229, 255, 0.06);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-align: center;
      color: var(--crt-cyan, #00e5ff);
      line-height: 1.3;
    }
    .ovr-tm-targets {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .ovr-tm-target {
      border: 1px solid rgba(255, 176, 0, 0.55);
      background: rgba(255, 176, 0, 0.08);
      border-radius: 4px;
      padding: 5px 6px;
      text-align: center;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--crt-amber, #ffb000);
      transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease;
    }
    .ovr-tm-target.is-done {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.2);
      color: var(--crt-green, #00ff66);
      text-decoration: line-through;
    }
    .ovr-tm-board {
      display: grid;
      grid-template-columns: 28px repeat(5, minmax(0, 1fr));
      gap: 4px;
      padding: 6px;
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 4px;
      background: rgba(5, 10, 7, 0.92);
    }
    .ovr-tm-axis {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 26px;
      font-size: 13px;
      font-weight: 800;
      color: var(--crt-cyan, #00e5ff);
      background: rgba(0, 229, 255, 0.07);
      border: 1px solid rgba(0, 229, 255, 0.2);
      border-radius: 3px;
    }
    .ovr-tm-corner {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: rgba(0, 255, 102, 0.5);
    }
    .ovr-tm-cell {
      appearance: none;
      touch-action: manipulation;
      min-height: 36px;
      padding: 0;
      border: 1px solid rgba(0, 255, 102, 0.28);
      border-radius: 3px;
      background: rgba(0, 255, 102, 0.04);
      color: rgba(0, 255, 102, 0.42);
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: border-color 90ms ease, background-color 90ms ease, color 90ms ease, transform 60ms ease;
    }
    .ovr-tm-cell:hover:not(:disabled) {
      border-color: rgba(0, 255, 102, 0.8);
      background: rgba(0, 255, 102, 0.14);
      color: var(--crt-green, #00ff66);
    }
    .ovr-tm-cell:active:not(:disabled) {
      transform: scale(0.95);
    }
    .ovr-tm-cell.is-hit {
      border-color: var(--crt-green, #00ff66);
      background: var(--crt-green, #00ff66);
      color: #050a07;
      font-size: 14px;
      font-weight: 900;
      cursor: default;
      box-shadow: 0 0 8px rgba(0, 255, 102, 0.45);
    }
    .ovr-tm-cell.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.28);
      color: #ff8080;
    }
    .ovr-tm-status {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-align: center;
      min-height: 15px;
      color: rgba(0, 255, 102, 0.78);
    }
    .ovr-tm-status.is-ok {
      color: var(--crt-green, #00ff66);
    }
    .ovr-tm-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-tm';
  root.dataset.mode = String(mode);

  const ruleEl = document.createElement('div');
  ruleEl.className = 'ovr-tm-rule';
  ruleEl.textContent = ruleText;

  const targetsRow = document.createElement('div');
  targetsRow.className = 'ovr-tm-targets';
  const targetEls = picked.map((t) => {
    const badge = document.createElement('div');
    badge.className = 'ovr-tm-target';
    badge.textContent = t.label;
    targetsRow.appendChild(badge);
    return badge;
  });

  const board = document.createElement('div');
  board.className = 'ovr-tm-board';

  const corner = document.createElement('div');
  corner.className = 'ovr-tm-corner';
  corner.textContent = '⊕';
  board.appendChild(corner);

  for (let c = 0; c < 5; c++) {
    const colHead = document.createElement('div');
    colHead.className = 'ovr-tm-axis';
    colHead.textContent = colLabels[c];
    board.appendChild(colHead);
  }

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-tm-status';
  statusEl.textContent = 'TOCCA I 3 SETTORI BERSAGLIO (0/3)';

  const cellButtons = [];

  for (let r = 0; r < 5; r++) {
    const rowHead = document.createElement('div');
    rowHead.className = 'ovr-tm-axis';
    rowHead.textContent = rowLabels[r];
    board.appendChild(rowHead);

    for (let c = 0; c < 5; c++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ovr-tm-cell';
      const terrain = TERRAIN_DECOR[randInt(rng, 0, TERRAIN_DECOR.length - 1)];
      const key = `${r},${c}`;
      const targetIdx = targetMap.has(key) ? targetMap.get(key) : -1;
      const coordLabel = `${colLabels[c]}${separator}${rowLabels[r]}`;
      btn.dataset.coord = coordLabel;
      btn.dataset.target = targetIdx >= 0 ? '1' : '0';
      btn.setAttribute('aria-label', `Settore ${coordLabel}`);
      btn.textContent = terrain;

      let cellHit = false;

      btn.addEventListener(
        'click',
        () => {
          if (solved || disposed || cellHit) return;
          if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;

          if (targetIdx >= 0) {
            cellHit = true;
            btn.classList.remove('is-err');
            btn.classList.add('is-hit');
            btn.textContent = '✓';
            btn.disabled = true;
            targetEls[targetIdx].classList.add('is-done');
            hits += 1;

            if (hits >= picked.length) {
              solved = true;
              cellButtons.forEach((b) => {
                b.disabled = true;
              });
              statusEl.className = 'ovr-tm-status is-ok';
              statusEl.textContent = 'SETTORI ACQUISITI (3/3)';
              if (typeof onWin === 'function') onWin();
            } else {
              statusEl.className = 'ovr-tm-status';
              statusEl.textContent = `SETTORE CONFERMATO (${hits}/3)`;
            }
          } else {
            btn.classList.remove('is-err');
            void btn.offsetWidth;
            btn.classList.add('is-err');
            statusEl.className = 'ovr-tm-status is-err';
            statusEl.textContent = `COORDINATA ERRATA: ${coordLabel}`;
            scheduleTimer(() => {
              btn.classList.remove('is-err');
            }, 340);
            if (typeof onMistake === 'function') onMistake();
          }
        },
        { signal: ac.signal }
      );

      cellButtons.push(btn);
      board.appendChild(btn);
    }
  }

  root.append(ruleEl, targetsRow, board, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
