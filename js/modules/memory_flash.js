import { shuffle } from '../prng.js';

const FLASH_DURATION_MS = 1500;
const SIMON_STEP_MS = 450;

/**
 * Keycard Flash (memory_flash)
 * Osserva i nodi illuminati e seleziona quelli richiesti dalla modalità attiva.
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

  const variantIdx = Math.floor(rng() * 4); // 0 = classic, 1 = simon, 2 = negative, 3 = priority
  const variant =
    variantIdx === 1
      ? 'simon'
      : variantIdx === 2
        ? 'negative'
        : variantIdx === 3
          ? 'priority'
          : 'classic';

  const perm = shuffle(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const flashOrder = variant === 'negative' ? perm.slice(0, 5) : perm.slice(0, 4);
  const flashSet = new Set(flashOrder);
  const targetOrder = variant === 'negative' ? perm.slice(5) : flashOrder;
  const targetSet = new Set(targetOrder);
  const amberSet = variant === 'priority' ? new Set(flashOrder.slice(0, 2)) : new Set();
  const greenSet = variant === 'priority' ? new Set(flashOrder.slice(2, 4)) : new Set();
  const foundSet = new Set();
  const totalFlashMs = variant === 'simon' ? SIMON_STEP_MS * 4 : FLASH_DURATION_MS;

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
    .ovr-mf-cell.is-flash-amber {
      background: rgba(255, 176, 0, 0.28);
      border-color: #ffb000;
      color: #ffb000;
      box-shadow: 0 0 18px rgba(255, 176, 0, 0.65), inset 0 0 12px rgba(255, 176, 0, 0.35);
    }
    .ovr-mf-cell.is-flash-green {
      background: rgba(0, 255, 102, 0.28);
      border-color: #00ff66;
      color: #00ff66;
      box-shadow: 0 0 18px rgba(0, 255, 102, 0.65), inset 0 0 12px rgba(0, 255, 102, 0.35);
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
  root.className = variant === 'classic' ? 'ovr-mf' : 'ovr-mf ovr-variant-mode';
  root.dataset.variant = variant;

  if (variant !== 'classic') {
    const vBanner = document.createElement('div');
    vBanner.className = 'ovr-variant-banner';
    vBanner.textContent =
      variant === 'simon'
        ? '⚡ VARIANTE: SEQUENZA SIMON — Ripeti nello stesso ordine!'
        : variant === 'negative'
          ? '⚡ VARIANTE: NEGATIVO — Seleziona i 4 nodi SPENTI!'
          : '⚡ VARIANTE: PRIORITÀ — Prima i 2 AMBRA, poi i 2 VERDI!';
    root.appendChild(vBanner);
  }

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

    if (variant === 'simon') {
      if (i === flashOrder[0]) {
        cell.classList.add('is-flash');
        glyph.textContent = '1';
      } else {
        glyph.textContent = '·';
      }
    } else if (variant === 'priority') {
      if (amberSet.has(i)) {
        cell.classList.add('is-flash-amber');
        glyph.textContent = '▲';
      } else if (greenSet.has(i)) {
        cell.classList.add('is-flash-green');
        glyph.textContent = '◈';
      } else {
        glyph.textContent = '·';
      }
    } else if (flashSet.has(i)) {
      cell.classList.add('is-flash');
      glyph.textContent = '◈';
    } else {
      glyph.textContent = '·';
    }

    cell.append(idxLabel, glyph);

    cell.addEventListener('click', () => {
      if (destroyed || solved || phase !== 'input') return;
      if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;
      if (foundSet.has(i)) return;

      let validTap = targetSet.has(i);
      if (validTap && variant === 'simon') {
        validTap = i === targetOrder[foundSet.size];
      } else if (validTap && variant === 'priority') {
        const ambersDone = [...amberSet].every((id) => foundSet.has(id));
        if (!ambersDone && greenSet.has(i)) {
          validTap = false;
        }
      }

      if (validTap) {
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
    statusEl.textContent =
      variant === 'simon'
        ? 'RIPETI LA SEQUENZA (1→4)'
        : variant === 'negative'
          ? 'TOCCA I 4 NODI SPENTI'
          : variant === 'priority'
            ? 'PRIMA I 2 AMBRA, POI I 2 VERDI'
            : 'INSERISCI I 4 NODI';

    for (let i = 0; i < cells.length; i++) {
      const { cell, glyph } = cells[i];
      cell.classList.remove('is-flash', 'is-flash-amber', 'is-flash-green');
      cell.classList.add('is-clickable');
      cell.disabled = false;
      glyph.textContent = '·';
    }
  }

  let flashElapsedMs = 0;
  let lastFlashFrame = performance.now();
  let lastSimonStep = 0;
  function animateBar(now) {
    if (destroyed || solved || phase !== 'flash') return;
    const paused = typeof window !== 'undefined' && Boolean(window.__OVERRIDLE_PAUSED__);
    const dtMs = paused ? 0 : Math.min(50, Math.max(0, now - lastFlashFrame));
    lastFlashFrame = now;
    flashElapsedMs += dtMs;

    if (variant === 'simon') {
      const step = Math.min(3, Math.floor(flashElapsedMs / SIMON_STEP_MS));
      if (step !== lastSimonStep) {
        const prevIdx = flashOrder[lastSimonStep];
        cells[prevIdx].cell.classList.remove('is-flash');
        cells[prevIdx].glyph.textContent = '·';
        const nextIdx = flashOrder[step];
        cells[nextIdx].cell.classList.add('is-flash');
        cells[nextIdx].glyph.textContent = String(step + 1);
        lastSimonStep = step;
      }
    }

    const rem = Math.max(0, 1 - flashElapsedMs / totalFlashMs);
    barFill.style.width = `${(rem * 100).toFixed(1)}%`;
    if (flashElapsedMs < totalFlashMs) {
      rafId = requestAnimationFrame(animateBar);
    } else {
      rafId = null;
      enterInputPhase();
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
