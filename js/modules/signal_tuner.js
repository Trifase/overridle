import { randInt, shuffle } from '../prng.js';

const CODE_PATTERNS = [
  '• • ━━',
  '• ━━ •',
  '━━ • •',
  '• ━━ ━━',
  '━━ • ━━',
  '━━ ━━ •',
];

function invertPattern(pattern) {
  return pattern
    .split(' ')
    .map((tok) => (tok === '•' ? '━━' : '•'))
    .join(' ');
}

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const mode = randInt(rng, 0, 1); // 0 = diretto, 1 = invertito
  const channelPatterns = shuffle(rng, CODE_PATTERNS);
  const targetIdx = randInt(rng, 0, channelPatterns.length - 1);
  const targetPattern = channelPatterns[targetIdx];
  const transmittedPattern = mode === 0 ? targetPattern : invertPattern(targetPattern);

  const ruleText =
    mode === 0
      ? 'SEGNALE DIRETTO: PREMI IL CANALE CHE CORRISPONDE AL PATTERN TRASMESSO'
      : 'SEGNALE INVERTITO (• ↔ ━━): SCAMBIA PUNTI E LINEE E PREMI IL CANALE';

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
    .ovr-st {
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
    .ovr-st * {
      box-sizing: border-box;
    }
    .ovr-st-rule {
      border: 1px solid rgba(0, 229, 255, 0.42);
      background: rgba(0, 229, 255, 0.07);
      border-radius: 4px;
      padding: 7px 9px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-align: center;
      color: var(--crt-cyan, #00e5ff);
      line-height: 1.35;
    }
    .ovr-st-rule.is-inv {
      border-color: rgba(255, 176, 0, 0.55);
      background: rgba(255, 176, 0, 0.09);
      color: var(--crt-amber, #ffb000);
    }
    .ovr-st-transmitter {
      border: 1px solid rgba(0, 255, 102, 0.38);
      background: #040906;
      border-radius: 4px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .ovr-st-tx-lbl {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: rgba(0, 255, 102, 0.72);
    }
    .ovr-st-pulses {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      min-height: 28px;
    }
    .ovr-st-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--crt-green, #00ff66);
      box-shadow: 0 0 10px rgba(0, 255, 102, 0.7);
    }
    .ovr-st-dash {
      width: 44px;
      height: 14px;
      border-radius: 3px;
      background: var(--crt-green, #00ff66);
      box-shadow: 0 0 10px rgba(0, 255, 102, 0.7);
    }
    .ovr-st-transmitter.is-inv .ovr-st-dot,
    .ovr-st-transmitter.is-inv .ovr-st-dash {
      background: var(--crt-amber, #ffb000);
      box-shadow: 0 0 10px rgba(255, 176, 0, 0.7);
    }
    .ovr-st-tx-text {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.14em;
      color: var(--crt-text, #d7ffe6);
    }
    .ovr-st-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 7px;
    }
    .ovr-st-ch {
      appearance: none;
      touch-action: manipulation;
      min-height: 54px;
      padding: 7px 8px;
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 4px;
      background: rgba(0, 255, 102, 0.05);
      color: var(--crt-text, #d7ffe6);
      font-family: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      cursor: pointer;
      transition: border-color 100ms ease, background-color 100ms ease, transform 60ms ease;
    }
    .ovr-st-ch:hover:not(:disabled) {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.14);
    }
    .ovr-st-ch:active:not(:disabled) {
      transform: scale(0.96);
    }
    .ovr-st-ch.is-win {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.24);
      color: var(--crt-green, #00ff66);
    }
    .ovr-st-ch.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.24);
      color: #ff8585;
    }
    .ovr-st-ch-id {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: var(--crt-cyan, #00e5ff);
    }
    .ovr-st-ch-pat {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .ovr-st-status {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-align: center;
      min-height: 15px;
      color: rgba(0, 255, 102, 0.78);
    }
    .ovr-st-status.is-ok {
      color: var(--crt-green, #00ff66);
    }
    .ovr-st-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-st';
  root.dataset.mode = String(mode);
  root.dataset.targetChannel = String(targetIdx + 1);

  const ruleEl = document.createElement('div');
  ruleEl.className = `ovr-st-rule${mode === 1 ? ' is-inv' : ''}`;
  ruleEl.textContent = ruleText;

  const txEl = document.createElement('div');
  txEl.className = `ovr-st-transmitter${mode === 1 ? ' is-inv' : ''}`;

  const txLbl = document.createElement('div');
  txLbl.className = 'ovr-st-tx-lbl';
  txLbl.textContent = mode === 0 ? 'IMPULSO RICEVUTO [DIRETTO]' : 'IMPULSO RICEVUTO [INVERTITO]';

  const pulsesEl = document.createElement('div');
  pulsesEl.className = 'ovr-st-pulses';
  for (const tok of transmittedPattern.split(' ')) {
    const seg = document.createElement('span');
    seg.className = tok === '•' ? 'ovr-st-dot' : 'ovr-st-dash';
    pulsesEl.appendChild(seg);
  }

  const txText = document.createElement('div');
  txText.className = 'ovr-st-tx-text';
  txText.textContent = transmittedPattern;

  txEl.append(txLbl, pulsesEl, txText);

  const grid = document.createElement('div');
  grid.className = 'ovr-st-grid';

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-st-status';
  statusEl.textContent = 'SELEZIONA IL CANALE CORRISPONDENTE';

  const chBtns = channelPatterns.map((pat, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ovr-st-ch';
    btn.dataset.channel = String(i + 1);
    btn.dataset.isTarget = i === targetIdx ? '1' : '0';

    const idSpan = document.createElement('span');
    idSpan.className = 'ovr-st-ch-id';
    idSpan.textContent = `CH-${i + 1}`;
    const patSpan = document.createElement('span');
    patSpan.className = 'ovr-st-ch-pat';
    patSpan.textContent = pat;

    btn.append(idSpan, patSpan);

    btn.addEventListener(
      'click',
      () => {
        if (solved || disposed) return;
        if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;

        if (i === targetIdx) {
          solved = true;
          btn.classList.add('is-win');
          chBtns.forEach((b) => {
            b.disabled = true;
          });
          statusEl.className = 'ovr-st-status is-ok';
          statusEl.textContent = `CANALE CH-${i + 1} AGGANCIATO`;
          if (typeof onWin === 'function') onWin();
        } else {
          btn.classList.remove('is-err');
          void btn.offsetWidth;
          btn.classList.add('is-err');
          statusEl.className = 'ovr-st-status is-err';
          statusEl.textContent = `CH-${i + 1} NON VALIDO — INTERFERENZA!`;
          scheduleTimer(() => {
            btn.classList.remove('is-err');
          }, 340);
          if (typeof onMistake === 'function') onMistake();
        }
      },
      { signal: ac.signal }
    );

    grid.appendChild(btn);
    return btn;
  });

  root.append(ruleEl, txEl, grid, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
