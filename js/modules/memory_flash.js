import { shuffle } from '../prng.js';

const FLASH_DURATION_MS = 1500;

/**
 * Keycard Flash (memory_flash)
 * Osserva le 4 celle illuminate per 1.5s, poi selezionale sulla griglia 3x3.
 */
export function mount(container, rng, { onWin, onMistake } = {}) {
  let destroyed = false;
  let solved = false;
  let phase = 'flash';
  let rafId = null;
  const timeouts = new Set();

  function trackTimeout(fn, ms) {
    const id = setTimeout(() => {
      timeouts.delete(id);
      if (destroyed || solved) return;
      fn();
    }, ms);
    timeouts.add(id);
    return id;
  }

  const targets = shuffle(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 4);
  const targetSet = new Set(targets);
  const foundSet = new Set();

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-mf, .ovr-mf * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .ovr-mf {
      width: 100%;
      max-width: 340px;
      margin: 0 auto;
      padding: 10px;
      background: #050a07;
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 6px;
      color: #00ff66;
      font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .ovr-mf-head {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ovr-mf-status {
      text-align: center;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #00e5ff;
      min-height: 18px;
    }
    .ovr-mf-status.is-input {
      color: #ffb000;
    }
    .ovr-mf-status.is-win {
      color: #00ff66;
    }
    .ovr-mf-bar-track {
      width: 100%;
      height: 8px;
      background: rgba(0, 255, 102, 0.1);
      border: 1px solid rgba(0, 229, 255, 0.35);
      border-radius: 4px;
      overflow: hidden;
    }
    .ovr-mf-bar-fill {
      height: 100%;
      width: 100%;
      background: #00e5ff;
      box-shadow: 0 0 8px rgba(0, 229, 255, 0.7);
      transform-origin: left center;
    }
    .ovr-mf-grid {
      display: grid;
      grid-template-columns: repeat(3, 84px);
      grid-template-rows: repeat(3, 84px);
      gap: 10px;
      justify-content: center;
    }
    .ovr-mf-grid.is-locked {
      pointer-events: none;
    }
    .ovr-mf-cell {
      width: 84px;
      height: 84px;
      margin: 0;
      padding: 0;
      opacity: 1;
      border-radius: 6px;
      border: 2px solid rgba(0, 255, 102, 0.28);
      background: rgba(0, 255, 102, 0.05);
      color: rgba(0, 255, 102, 0.55);
      font-family: inherit;
      font-size: 18px;
      font-weight: 700;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      cursor: default;
      touch-action: manipulation;
      transition: background 0.1s ease, border-color 0.1s ease, box-shadow 0.1s ease, transform 0.08s ease;
    }
    .ovr-mf-cell.is-clickable {
      cursor: pointer;
    }
    .ovr-mf-cell.is-clickable:active {
      transform: scale(0.95);
    }
    .ovr-mf-cell-idx {
      font-size: 10px;
      opacity: 0.6;
      letter-spacing: 0.08em;
    }
    .ovr-mf-cell-glyph {
      font-size: 22px;
      line-height: 1;
    }
    .ovr-mf-cell.is-flash {
      background: rgba(0, 229, 255, 0.28);
      border-color: #00e5ff;
      color: #00e5ff;
      box-shadow: 0 0 18px rgba(0, 229, 255, 0.65), inset 0 0 12px rgba(0, 229, 255, 0.35);
    }
    .ovr-mf-cell.is-correct {
      background: rgba(0, 255, 102, 0.25);
      border-color: #00ff66;
      color: #00ff66;
      box-shadow: 0 0 16px rgba(0, 255, 102, 0.55);
      cursor: default;
    }
    .ovr-mf-cell.is-wrong {
      background: rgba(255, 42, 42, 0.35);
      border-color: #ff2a2a;
      color: #ff2a2a;
      box-shadow: 0 0 16px rgba(255, 42, 42, 0.65);
    }
    .ovr-mf-foot {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: rgba(0, 255, 102, 0.8);
      padding-top: 2px;
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-mf';

  const head = document.createElement('div');
  head.className = 'ovr-mf-head';

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-mf-status';
  statusEl.textContent = 'MEMORIA ATTIVA — OSSERVA...';

  const barTrack = document.createElement('div');
  barTrack.className = 'ovr-mf-bar-track';
  const barFill = document.createElement('div');
  barFill.className = 'ovr-mf-bar-fill';
  barTrack.appendChild(barFill);

  head.append(statusEl, barTrack);

  const grid = document.createElement('div');
  grid.className = 'ovr-mf-grid is-locked';

  const cells = [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'ovr-mf-cell';
    cell.disabled = true;

    const idxLabel = document.createElement('span');
    idxLabel.className = 'ovr-mf-cell-idx';
    idxLabel.textContent = `0${i + 1}`;

    const glyph = document.createElement('span');
    glyph.className = 'ovr-mf-cell-glyph';

    if (targetSet.has(i)) {
      cell.classList.add('is-flash');
      glyph.textContent = '◈';
    } else {
      glyph.textContent = '·';
    }

    cell.append(idxLabel, glyph);

    cell.addEventListener('click', () => {
      if (destroyed || solved || phase !== 'input') return;
      if (targetSet.has(i)) {
        if (foundSet.has(i)) return;
        foundSet.add(i);
        cell.classList.add('is-correct');
        glyph.textContent = '✓';
        counterEl.textContent = `NODI: ${foundSet.size}/4`;
        if (foundSet.size >= 4) {
          solved = true;
          statusEl.className = 'ovr-mf-status is-win';
          statusEl.textContent = 'KEYCARD VERIFICATA';
          onWin?.();
        }
      } else {
        cell.classList.add('is-wrong');
        glyph.textContent = '✕';
        onMistake?.();
        if (!destroyed && !solved) {
          trackTimeout(() => {
            cell.classList.remove('is-wrong');
            glyph.textContent = '·';
          }, 350);
        }
      }
    });

    grid.appendChild(cell);
    cells.push({ cell, glyph });
  }

  const foot = document.createElement('div');
  foot.className = 'ovr-mf-foot';
  const modeLabel = document.createElement('span');
  modeLabel.textContent = 'KEYCARD 3×3';
  const counterEl = document.createElement('span');
  counterEl.textContent = 'NODI: 0/4';
  foot.append(modeLabel, counterEl);

  root.append(head, grid, foot);
  container.append(style, root);

  function enterInputPhase() {
    if (destroyed || solved || phase !== 'flash') return;
    phase = 'input';
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    barFill.style.width = '0%';
    barTrack.style.visibility = 'hidden';
    grid.classList.remove('is-locked');
    statusEl.className = 'ovr-mf-status is-input';
    statusEl.textContent = 'INSERISCI I 4 NODI';

    for (let i = 0; i < cells.length; i++) {
      const { cell, glyph } = cells[i];
      cell.classList.remove('is-flash');
      cell.classList.add('is-clickable');
      cell.disabled = false;
      glyph.textContent = '·';
    }
  }

  trackTimeout(enterInputPhase, FLASH_DURATION_MS);

  const flashStart = performance.now();
  function animateBar(now) {
    if (destroyed || solved || phase !== 'flash') return;
    const elapsed = now - flashStart;
    const rem = Math.max(0, 1 - elapsed / FLASH_DURATION_MS);
    barFill.style.width = `${(rem * 100).toFixed(1)}%`;
    if (elapsed < FLASH_DURATION_MS) {
      rafId = requestAnimationFrame(animateBar);
    } else {
      rafId = null;
    }
  }
  rafId = requestAnimationFrame(animateBar);

  return () => {
    destroyed = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    for (const id of timeouts) {
      clearTimeout(id);
    }
    timeouts.clear();
  };
}
