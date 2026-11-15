import { randInt } from '../prng.js';
import { t } from '../i18n.js';

const WEIGHTS = [32, 16, 8, 4, 2, 1];

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const variantIdx = randInt(rng, 0, 2); // 0 = classic, 1 = inverted, 2 = blind
  const variant = variantIdx === 1 ? 'inverted' : variantIdx === 2 ? 'blind' : 'classic';
  const target = variant === 'inverted' ? randInt(rng, 10, 53) : randInt(rng, 10, 63);
  const bits = variant === 'inverted' ? [1, 1, 1, 1, 1, 1] : [0, 0, 0, 0, 0, 0];

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

  const getSum = () => WEIGHTS.reduce((acc, w, idx) => acc + (bits[idx] ? w : 0), 0);

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-bin {
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
    .ovr-bin * {
      box-sizing: border-box;
    }
    .ovr-bin-header {
      border: 1px solid rgba(0, 255, 102, 0.4);
      background: rgba(0, 255, 102, 0.05);
      border-radius: 4px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ovr-bin-sub {
      font-size: 10px;
      letter-spacing: 0.12em;
      color: var(--crt-cyan, #00e5ff);
      font-weight: 700;
    }
    .ovr-bin-readouts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .ovr-bin-box {
      border: 1px solid rgba(0, 255, 102, 0.3);
      background: rgba(5, 10, 7, 0.9);
      border-radius: 4px;
      padding: 6px 8px;
      text-align: center;
    }
    .ovr-bin-box.is-target {
      border-color: var(--crt-amber, #ffb000);
    }
    .ovr-bin-box-lbl {
      font-size: 10px;
      letter-spacing: 0.1em;
      opacity: 0.85;
    }
    .ovr-bin-box.is-target .ovr-bin-box-lbl {
      color: var(--crt-amber, #ffb000);
    }
    .ovr-bin-box-val {
      font-size: 26px;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: 0.05em;
    }
    .ovr-bin-box.is-target .ovr-bin-box-val {
      color: var(--crt-amber, #ffb000);
      text-shadow: 0 0 8px rgba(255, 176, 0, 0.35);
    }
    .ovr-bin-box.is-match {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.12);
    }
    .ovr-bin-box.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.18);
      animation: ovr-bin-shake 0.32s ease;
    }
    .ovr-bin-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 6px;
    }
    .ovr-bin-sw {
      min-height: 132px;
      padding: 8px 2px;
      border-radius: 4px;
      border: 1px solid rgba(0, 255, 102, 0.32);
      background: rgba(5, 10, 7, 0.95);
      color: var(--crt-green, #00ff66);
      font-family: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      touch-action: manipulation;
      transition: border-color 0.12s ease, background 0.12s ease, transform 0.08s ease;
    }
    .ovr-bin-sw:active:not(:disabled) {
      transform: scale(0.97);
    }
    .ovr-bin-weight {
      font-size: 13px;
      font-weight: 800;
      color: #eef7f2;
    }
    .ovr-bin-led {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid rgba(0, 255, 102, 0.45);
      background: #0d1d14;
      transition: background 0.12s ease, box-shadow 0.12s ease;
    }
    .ovr-bin-track {
      width: 24px;
      height: 44px;
      border: 1px solid rgba(0, 255, 102, 0.4);
      background: #030705;
      border-radius: 3px;
      padding: 2px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .ovr-bin-thumb {
      width: 100%;
      height: 18px;
      border-radius: 2px;
      background: #355442;
      transition: background 0.12s ease;
    }
    .ovr-bin-state {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      opacity: 0.65;
    }
    .ovr-bin-sw.is-on {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.12);
    }
    .ovr-bin-sw.is-on .ovr-bin-led {
      background: var(--crt-green, #00ff66);
      box-shadow: 0 0 10px var(--crt-green, #00ff66);
    }
    .ovr-bin-sw.is-on .ovr-bin-track {
      justify-content: flex-start;
      border-color: var(--crt-green, #00ff66);
    }
    .ovr-bin-sw.is-on .ovr-bin-thumb {
      background: var(--crt-green, #00ff66);
    }
    .ovr-bin-sw.is-on .ovr-bin-state {
      opacity: 1;
      color: var(--crt-green, #00ff66);
    }
    .ovr-bin-exec {
      width: 100%;
      min-height: 52px;
      border-radius: 4px;
      border: 2px solid var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.12);
      color: var(--crt-green, #00ff66);
      font-family: inherit;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.14em;
      cursor: pointer;
      touch-action: manipulation;
      transition: background 0.12s ease, transform 0.08s ease;
    }
    .ovr-bin-exec:active:not(:disabled) {
      transform: scale(0.985);
    }
    .ovr-bin-exec.is-win {
      background: var(--crt-green, #00ff66);
      color: var(--crt-bg, #050a07);
    }
    .ovr-bin-exec.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.22);
      color: var(--crt-red, #ff2a2a);
      animation: ovr-bin-shake 0.32s ease;
    }
    .ovr-bin-status {
      font-size: 11px;
      min-height: 16px;
      text-align: center;
      letter-spacing: 0.05em;
      color: rgba(0, 255, 102, 0.78);
    }
    .ovr-bin-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
    .ovr-bin-status.is-ok {
      color: var(--crt-green, #00ff66);
      font-weight: 700;
    }
    @keyframes ovr-bin-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      50% { transform: translateX(5px); }
      75% { transform: translateX(-3px); }
    }
  `;

  const root = document.createElement('div');
  root.className = variant === 'classic' ? 'ovr-bin' : 'ovr-bin ovr-variant-mode';
  root.dataset.target = String(target);
  root.dataset.variant = variant;

  if (variant !== 'classic') {
    const vBanner = document.createElement('div');
    vBanner.className = 'ovr-variant-banner';
    vBanner.textContent =
      variant === 'inverted'
        ? t(
            '⚡ VARIANT: INVERTED BITS — Start ON, toggle off to match target!',
            '⚡ VARIANTE: BIT INVERTITI — Partono ON, spegni fino al target!'
          )
        : t(
            '⚡ VARIANT: BLIND SUM — Add mentally and press EXEC!',
            '⚡ VARIANTE: SOMMA MASCHERATA — Somma a mente e premi EXEC!'
          );
    root.appendChild(vBanner);
  }

  const header = document.createElement('div');
  header.className = 'ovr-bin-header';
  header.innerHTML = `<div class="ovr-bin-sub">${t('BINARY SWITCHES // MATCH EXACT SUM', 'SWITCH BINARI // COMPONI SOMMA ESATTA')}</div>`;

  const readouts = document.createElement('div');
  readouts.className = 'ovr-bin-readouts';

  const targetBox = document.createElement('div');
  targetBox.className = 'ovr-bin-box is-target';
  targetBox.innerHTML = `
    <div class="ovr-bin-box-lbl">TARGET</div>
    <div class="ovr-bin-box-val">${String(target).padStart(2, '0')}</div>
  `;

  const initialSum = getSum();
  const currentBox = document.createElement('div');
  currentBox.className = 'ovr-bin-box';
  const currentValEl = document.createElement('div');
  currentValEl.className = 'ovr-bin-box-val';
  currentValEl.textContent = variant === 'blind' ? '??' : String(initialSum).padStart(2, '0');
  currentBox.innerHTML = `<div class="ovr-bin-box-lbl">${t('CURRENT', 'ATTUALE')}</div>`;
  currentBox.appendChild(currentValEl);

  readouts.append(targetBox, currentBox);
  header.appendChild(readouts);

  const grid = document.createElement('div');
  grid.className = 'ovr-bin-grid';

  const switchButtons = WEIGHTS.map((weight, i) => {
    const startOn = bits[i] === 1;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = startOn ? 'ovr-bin-sw is-on' : 'ovr-bin-sw';
    btn.dataset.bitIndex = String(i);
    btn.dataset.weight = String(weight);
    btn.dataset.state = startOn ? '1' : '0';
    btn.setAttribute('aria-pressed', String(startOn));
    btn.setAttribute(
      'aria-label',
      t(`Switch weight ${weight}, state ${startOn ? 'ON' : 'OFF'}`, `Switch peso ${weight}, stato ${startOn ? 'ON' : 'OFF'}`)
    );

    const weightEl = document.createElement('span');
    weightEl.className = 'ovr-bin-weight';
    weightEl.textContent = String(weight);

    const ledEl = document.createElement('span');
    ledEl.className = 'ovr-bin-led';
    ledEl.setAttribute('aria-hidden', 'true');

    const trackEl = document.createElement('span');
    trackEl.className = 'ovr-bin-track';
    trackEl.setAttribute('aria-hidden', 'true');
    const thumbEl = document.createElement('span');
    thumbEl.className = 'ovr-bin-thumb';
    trackEl.appendChild(thumbEl);

    const stateEl = document.createElement('span');
    stateEl.className = 'ovr-bin-state';
    stateEl.textContent = startOn ? 'ON' : 'OFF';

    btn.append(weightEl, ledEl, trackEl, stateEl);

    btn.addEventListener(
      'click',
      () => {
        if (solved || disposed) return;
        if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;
        bits[i] = bits[i] ? 0 : 1;
        const isOn = bits[i] === 1;
        btn.classList.toggle('is-on', isOn);
        btn.dataset.state = isOn ? '1' : '0';
        btn.setAttribute('aria-pressed', String(isOn));
        btn.setAttribute(
          'aria-label',
          t(`Switch weight ${weight}, state ${isOn ? 'ON' : 'OFF'}`, `Switch peso ${weight}, stato ${isOn ? 'ON' : 'OFF'}`)
        );
        stateEl.textContent = isOn ? 'ON' : 'OFF';

        const sum = getSum();
        root.dataset.current = String(sum);
        if (variant === 'blind') {
          currentValEl.textContent = '??';
          currentBox.classList.remove('is-match');
        } else {
          currentValEl.textContent = String(sum).padStart(2, '0');
          currentBox.classList.toggle('is-match', sum === target);
        }
      },
      { signal: ac.signal }
    );

    grid.appendChild(btn);
    return btn;
  });

  const execBtn = document.createElement('button');
  execBtn.type = 'button';
  execBtn.className = 'ovr-bin-exec';
  execBtn.textContent = '[ EXEC ]';

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-bin-status';
  statusEl.textContent = t('TOGGLE SWITCHES AND PRESS EXEC', 'ATTIVA LE LEVE E PREMI EXEC');

  execBtn.addEventListener(
    'click',
    () => {
      if (solved || disposed) return;
      const sum = getSum();
      if (sum === target) {
        solved = true;
        execBtn.classList.remove('is-err');
        execBtn.classList.add('is-win');
        execBtn.textContent = '[ EXEC // OK ]';
        execBtn.disabled = true;
        switchButtons.forEach((b) => {
          b.disabled = true;
        });
        statusEl.className = 'ovr-bin-status is-ok';
        statusEl.textContent = t(
          `SUM ${sum} CONFIRMED // MODULE UNLOCKED`,
          `SOMMA ${sum} CONFERMATA // MODULO SBLOCCATO`
        );
        if (typeof onWin === 'function') onWin();
      } else {
        execBtn.classList.remove('is-err');
        currentBox.classList.remove('is-err');
        void execBtn.offsetWidth;
        execBtn.classList.add('is-err');
        currentBox.classList.add('is-err');
        statusEl.className = 'ovr-bin-status is-err';
        statusEl.textContent = t(`WRONG SUM: ${sum} != ${target}`, `SOMMA ERRATA: ${sum} != ${target}`);
        scheduleTimer(() => {
          execBtn.classList.remove('is-err');
          currentBox.classList.remove('is-err');
        }, 380);
        if (typeof onMistake === 'function') onMistake();
      }
    },
    { signal: ac.signal }
  );

  root.dataset.current = String(initialSum);
  root.append(header, grid, execBtn, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
