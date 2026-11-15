import { randInt, pick, shuffle } from '../prng.js';
import { t } from '../i18n.js';

function makeExpression(rng, op) {
  if (op === '+') {
    const a = randInt(rng, 2, 18);
    const b = randInt(rng, 2, Math.min(18, 36 - a));
    return { label: `${a} + ${b}`, result: a + b };
  }
  if (op === '-') {
    const result = randInt(rng, 1, 24);
    const b = randInt(rng, 2, Math.min(15, 36 - result));
    const a = result + b;
    return { label: `${a} - ${b}`, result };
  }
  if (op === '×') {
    const a = randInt(rng, 2, 9);
    const maxB = Math.min(9, Math.floor(36 / a));
    const b = randInt(rng, 2, maxB);
    return { label: `${a} × ${b}`, result: a * b };
  }
  // '÷' exact integer division
  const b = randInt(rng, 2, 9);
  const maxQ = Math.min(12, Math.floor(36 / b));
  const result = randInt(rng, 2, maxQ);
  const a = b * result;
  return { label: `${a} ÷ ${b}`, result };
}

function generateOperations(rng) {
  const ops = shuffle(rng, ['+', '-', '×', '÷', pick(rng, ['+', '-', '×', '÷'])]);
  const usedResults = new Set();
  const items = [];

  for (const preferredOp of ops) {
    let chosen = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = makeExpression(rng, preferredOp);
      if (candidate.result >= 1 && candidate.result <= 36 && !usedResults.has(candidate.result)) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = makeExpression(rng, pick(rng, ['+', '-', '×', '÷']));
        if (candidate.result >= 1 && candidate.result <= 36 && !usedResults.has(candidate.result)) {
          chosen = candidate;
          break;
        }
      }
    }
    if (!chosen) {
      for (let val = 2; val <= 36; val++) {
        if (!usedResults.has(val)) {
          const a = Math.floor(val / 2);
          const b = val - a;
          chosen = { label: `${a} + ${b}`, result: val };
          break;
        }
      }
    }
    usedResults.add(chosen.result);
    items.push({
      id: items.length,
      label: chosen.label,
      result: chosen.result,
      locked: false,
    });
  }

  return shuffle(rng, items);
}

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const ascending = rng() < 0.5;
  const items = generateOperations(rng);
  const ordered = [...items].sort((a, b) =>
    ascending ? a.result - b.result : b.result - a.result
  );

  // Assign expected step (0..4) to each item for inspection/testing
  const stepById = new Map();
  ordered.forEach((item, stepIdx) => stepById.set(item.id, stepIdx));

  let nextStep = 0;
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
    .ovr-math {
      box-sizing: border-box;
      width: 100%;
      max-width: 340px;
      margin: 0 auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      color: var(--crt-green, #00ff66);
      user-select: none;
      -webkit-user-select: none;
    }
    .ovr-math * {
      box-sizing: border-box;
    }
    .ovr-math-header {
      border: 1px solid var(--crt-cyan, #00e5ff);
      border-left: 4px solid var(--crt-cyan, #00e5ff);
      background: rgba(0, 229, 255, 0.06);
      border-radius: 4px;
      padding: 9px 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .ovr-math-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      letter-spacing: 0.1em;
      color: var(--crt-cyan, #00e5ff);
      font-weight: 700;
    }
    .ovr-math-dir {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: var(--crt-amber, #ffb000);
    }
    .ovr-math-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .ovr-math-btn {
      min-height: 64px;
      padding: 8px 10px;
      border-radius: 4px;
      border: 1px solid rgba(0, 255, 102, 0.42);
      background: rgba(5, 10, 7, 0.94);
      color: #eef7f2;
      font-family: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      cursor: pointer;
      touch-action: manipulation;
      transition: transform 0.08s ease, border-color 0.12s ease, background 0.12s ease;
    }
    .ovr-math-btn.is-wide {
      grid-column: 1 / -1;
    }
    .ovr-math-btn:active:not(:disabled) {
      transform: scale(0.98);
    }
    .ovr-math-expr {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .ovr-math-badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--crt-green, #00ff66);
      min-height: 14px;
    }
    .ovr-math-btn.is-locked {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.14);
      color: var(--crt-green, #00ff66);
      cursor: default;
    }
    .ovr-math-btn.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.22);
      color: var(--crt-red, #ff2a2a);
      animation: ovr-math-shake 0.32s ease;
    }
    .ovr-math-status {
      font-size: 11px;
      min-height: 16px;
      text-align: center;
      letter-spacing: 0.05em;
      color: rgba(0, 255, 102, 0.78);
    }
    .ovr-math-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
    .ovr-math-status.is-ok {
      color: var(--crt-green, #00ff66);
      font-weight: 700;
    }
    @keyframes ovr-math-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      50% { transform: translateX(5px); }
      75% { transform: translateX(-3px); }
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-math';
  root.dataset.order = ascending ? 'asc' : 'desc';

  const header = document.createElement('div');
  header.className = 'ovr-math-header';

  const topRow = document.createElement('div');
  topRow.className = 'ovr-math-top';
  const progEl = document.createElement('span');
  progEl.textContent = 'STEP: 0 / 5';
  topRow.innerHTML = `<span>${t('DISCHARGE ORDER', 'ORDINE DI SCARICA')}</span>`;
  topRow.appendChild(progEl);

  const dirEl = document.createElement('div');
  dirEl.className = 'ovr-math-dir';
  dirEl.textContent = ascending
    ? t('TAP IN ASCENDING ORDER (MIN → MAX)', 'TOCCA IN ORDINE CRESCENTE (MIN → MAX)')
    : t('TAP IN DESCENDING ORDER (MAX → MIN)', 'TOCCA IN ORDINE DECRESCENTE (MAX → MIN)');

  header.append(topRow, dirEl);

  const grid = document.createElement('div');
  grid.className = 'ovr-math-grid';

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-math-status';
  statusEl.textContent = ascending
    ? t('START FROM THE LOWEST RESULT', 'PARTI DAL RISULTATO PIÙ BASSO')
    : t('START FROM THE HIGHEST RESULT', 'PARTI DAL RISULTATO PIÙ ALTO');

  const btnRefs = [];

  items.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = idx === 4 ? 'ovr-math-btn is-wide' : 'ovr-math-btn';
    btn.dataset.stepIndex = String(stepById.get(item.id));
    btn.dataset.result = String(item.result);
    btn.setAttribute('aria-label', t(`Operation ${item.label}`, `Operazione ${item.label}`));

    const exprSpan = document.createElement('span');
    exprSpan.className = 'ovr-math-expr';
    exprSpan.textContent = item.label;

    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'ovr-math-badge';
    badgeSpan.textContent = '';

    btn.append(exprSpan, badgeSpan);
    btnRefs.push({ btn, item, badgeSpan });

    btn.addEventListener(
      'click',
      () => {
        if (solved || disposed || item.locked) return;
        const expected = ordered[nextStep];
        if (item.id === expected.id) {
          item.locked = true;
          nextStep += 1;
          btn.classList.remove('is-err');
          btn.classList.add('is-locked');
          btn.disabled = true;
          badgeSpan.textContent = `✓ #${nextStep}`;
          progEl.textContent = `STEP: ${nextStep} / 5`;

          if (nextStep === ordered.length) {
            solved = true;
            btnRefs.forEach((ref) => {
              const stepNum = stepById.get(ref.item.id) + 1;
              ref.badgeSpan.textContent = `✓ #${stepNum} (= ${ref.item.result})`;
            });
            statusEl.className = 'ovr-math-status is-ok';
            statusEl.textContent = t(
              'SEQUENCE COMPLETE // DISCHARGE AUTHORIZED',
              'SEQUENZA COMPLETA // SCARICA AUTORIZZATA'
            );
            if (typeof onWin === 'function') onWin();
          } else {
            statusEl.className = 'ovr-math-status';
            statusEl.textContent = t(
              `OK (${nextStep}/5) — CONTINUE SEQUENCE`,
              `OK (${nextStep}/5) — CONTINUA LA SEQUENZA`
            );
          }
        } else {
          btn.classList.remove('is-err');
          void btn.offsetWidth;
          btn.classList.add('is-err');
          statusEl.className = 'ovr-math-status is-err';
          statusEl.textContent = t(
            `WRONG ORDER ON "${item.label}"!`,
            `ORDINE ERRATO SU "${item.label}"!`
          );
          scheduleTimer(() => {
            btn.classList.remove('is-err');
          }, 380);
          if (typeof onMistake === 'function') onMistake();
        }
      },
      { signal: ac.signal }
    );

    grid.appendChild(btn);
  });

  root.append(header, grid, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
