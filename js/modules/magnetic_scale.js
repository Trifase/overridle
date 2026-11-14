import { randInt, shuffle } from '../prng.js';

const WEIGHT_POOL = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12];

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const mode = randInt(rng, 0, 1); // 0 = carico (+2), 1 = scarico (-2)

  const weights = shuffle(rng, WEIGHT_POOL).slice(0, 5).sort((a, b) => a - b);
  const pairIndices = shuffle(rng, [0, 1, 2, 3, 4]).slice(0, 2);
  const delta = weights[pairIndices[0]] + weights[pairIndices[1]];

  const baseWeight =
    mode === 0 ? randInt(rng, 5, 14) : Math.max(randInt(rng, 18, 28), delta + 4);
  const targetWeight = mode === 0 ? baseWeight + delta : baseWeight - delta;

  const ruleText =
    mode === 0
      ? 'CARICO: TOCCA 2 PESI DA AGGIUNGERE PER PAREGGIARE IL TARGET'
      : 'SCARICO: TOCCA 2 PESI DA RIMUOVERE PER SCENDERE AL TARGET';

  const selected = new Set();
  let solved = false;
  let locked = false;
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
    .ovr-ms {
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
    .ovr-ms * {
      box-sizing: border-box;
    }
    .ovr-ms-rule {
      border: 1px solid rgba(0, 229, 255, 0.4);
      background: rgba(0, 229, 255, 0.06);
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-align: center;
      color: var(--crt-cyan, #00e5ff);
      line-height: 1.35;
    }
    .ovr-ms-readouts {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .ovr-ms-box {
      border: 1px solid rgba(0, 255, 102, 0.32);
      background: rgba(5, 10, 7, 0.92);
      border-radius: 4px;
      padding: 7px 6px;
      text-align: center;
    }
    .ovr-ms-box.is-target {
      border-color: var(--crt-amber, #ffb000);
    }
    .ovr-ms-box.is-delta {
      border-color: rgba(0, 229, 255, 0.45);
    }
    .ovr-ms-box.is-match {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.14);
    }
    .ovr-ms-box.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.2);
    }
    .ovr-ms-lbl {
      font-size: 9.5px;
      letter-spacing: 0.08em;
      opacity: 0.8;
      margin-bottom: 2px;
    }
    .ovr-ms-box.is-target .ovr-ms-lbl {
      color: var(--crt-amber, #ffb000);
    }
    .ovr-ms-val {
      font-size: 20px;
      font-weight: 800;
      line-height: 1.15;
    }
    .ovr-ms-box.is-target .ovr-ms-val {
      color: var(--crt-amber, #ffb000);
    }
    .ovr-ms-box.is-delta .ovr-ms-val {
      color: var(--crt-cyan, #00e5ff);
    }
    .ovr-ms-meter {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      border: 1px solid rgba(0, 255, 102, 0.26);
      border-radius: 4px;
      background: rgba(5, 10, 7, 0.85);
    }
    .ovr-ms-meter-track {
      position: relative;
      height: 14px;
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 3px;
      background: #040906;
      overflow: hidden;
    }
    .ovr-ms-meter-fill {
      height: 100%;
      background: rgba(0, 255, 102, 0.45);
      transition: width 140ms ease, background-color 140ms ease;
    }
    .ovr-ms-meter-fill.is-match {
      background: var(--crt-green, #00ff66);
    }
    .ovr-ms-meter-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--crt-amber, #ffb000);
      box-shadow: 0 0 6px rgba(255, 176, 0, 0.8);
    }
    .ovr-ms-rack {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
    }
    .ovr-ms-weight {
      appearance: none;
      touch-action: manipulation;
      min-height: 66px;
      padding: 8px 4px;
      border: 1px solid rgba(0, 255, 102, 0.42);
      border-radius: 4px;
      background: rgba(0, 255, 102, 0.06);
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
    .ovr-ms-weight:hover:not(:disabled) {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.14);
    }
    .ovr-ms-weight:active:not(:disabled) {
      transform: scale(0.96);
    }
    .ovr-ms-weight.is-selected {
      border-color: var(--crt-amber, #ffb000);
      background: rgba(255, 176, 0, 0.22);
      color: var(--crt-amber, #ffb000);
      box-shadow: 0 0 10px rgba(255, 176, 0, 0.28);
    }
    .ovr-ms-weight.is-win {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.24);
      color: var(--crt-green, #00ff66);
    }
    .ovr-ms-weight.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.25);
      color: #ff8585;
    }
    .ovr-ms-wval {
      font-size: 20px;
      font-weight: 800;
      line-height: 1;
    }
    .ovr-ms-wunit {
      font-size: 9.5px;
      font-weight: 700;
      opacity: 0.75;
    }
    .ovr-ms-status {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-align: center;
      min-height: 15px;
      color: rgba(0, 255, 102, 0.78);
    }
    .ovr-ms-status.is-ok {
      color: var(--crt-green, #00ff66);
    }
    .ovr-ms-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-ms';
  root.dataset.mode = String(mode);
  root.dataset.solution = `${pairIndices[0]},${pairIndices[1]}`;

  const ruleEl = document.createElement('div');
  ruleEl.className = 'ovr-ms-rule';
  ruleEl.textContent = ruleText;

  const readouts = document.createElement('div');
  readouts.className = 'ovr-ms-readouts';

  const currBox = document.createElement('div');
  currBox.className = 'ovr-ms-box';
  currBox.innerHTML = '<div class="ovr-ms-lbl">ATTUALE</div>';
  const currValEl = document.createElement('div');
  currValEl.className = 'ovr-ms-val';
  currBox.appendChild(currValEl);

  const deltaBox = document.createElement('div');
  deltaBox.className = 'ovr-ms-box is-delta';
  deltaBox.innerHTML = `<div class="ovr-ms-lbl">${mode === 0 ? 'AGGIUNTA' : 'RIMOZIONE'}</div>`;
  const deltaValEl = document.createElement('div');
  deltaValEl.className = 'ovr-ms-val';
  deltaBox.appendChild(deltaValEl);

  const targetBox = document.createElement('div');
  targetBox.className = 'ovr-ms-box is-target';
  targetBox.innerHTML = '<div class="ovr-ms-lbl">TARGET</div>';
  const targetValEl = document.createElement('div');
  targetValEl.className = 'ovr-ms-val';
  targetValEl.textContent = `${targetWeight} KG`;
  targetBox.appendChild(targetValEl);

  readouts.append(currBox, deltaBox, targetBox);

  const meter = document.createElement('div');
  meter.className = 'ovr-ms-meter';
  const track = document.createElement('div');
  track.className = 'ovr-ms-meter-track';
  const fill = document.createElement('div');
  fill.className = 'ovr-ms-meter-fill';
  const marker = document.createElement('div');
  marker.className = 'ovr-ms-meter-marker';
  const maxMeter = Math.max(baseWeight, targetWeight) + 4;
  marker.style.left = `${Math.min(97, Math.max(2, (targetWeight / maxMeter) * 100)).toFixed(1)}%`;
  track.append(fill, marker);
  meter.appendChild(track);

  const rack = document.createElement('div');
  rack.className = 'ovr-ms-rack';

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-ms-status';
  statusEl.textContent = 'SELEZIONA 2 PESI (0/2)';

  const updateView = () => {
    let selectedSum = 0;
    for (const idx of selected) selectedSum += weights[idx];
    const currentTotal = mode === 0 ? baseWeight + selectedSum : baseWeight - selectedSum;

    currValEl.textContent = `${currentTotal} KG`;
    deltaValEl.textContent =
      selectedSum === 0 ? '0 KG' : `${mode === 0 ? '+' : '-'}${selectedSum} KG`;

    const pct = Math.min(100, Math.max(0, (currentTotal / maxMeter) * 100));
    fill.style.width = `${pct.toFixed(1)}%`;
    fill.classList.toggle('is-match', currentTotal === targetWeight);
    currBox.classList.toggle('is-match', currentTotal === targetWeight);
    return currentTotal;
  };

  const weightBtns = weights.map((w, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ovr-ms-weight';
    btn.dataset.index = String(idx);
    btn.dataset.weight = String(w);
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `Peso ${w} chilogrammi`);

    const wVal = document.createElement('span');
    wVal.className = 'ovr-ms-wval';
    wVal.textContent = String(w);
    const wUnit = document.createElement('span');
    wUnit.className = 'ovr-ms-wunit';
    wUnit.textContent = 'KG';

    btn.append(wVal, wUnit);

    btn.addEventListener(
      'click',
      () => {
        if (solved || disposed || locked) return;
        if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;

        if (selected.has(idx)) {
          selected.delete(idx);
          btn.classList.remove('is-selected');
          btn.setAttribute('aria-pressed', 'false');
          updateView();
          statusEl.className = 'ovr-ms-status';
          statusEl.textContent = `SELEZIONA 2 PESI (${selected.size}/2)`;
          return;
        }

        selected.add(idx);
        btn.classList.add('is-selected');
        btn.setAttribute('aria-pressed', 'true');
        const currentTotal = updateView();

        if (selected.size < 2) {
          statusEl.className = 'ovr-ms-status';
          statusEl.textContent = 'SELEZIONA IL 2° PESO (1/2)';
          return;
        }

        if (currentTotal === targetWeight) {
          solved = true;
          weightBtns.forEach((b, bIdx) => {
            b.disabled = true;
            if (selected.has(bIdx)) {
              b.classList.remove('is-selected');
              b.classList.add('is-win');
            }
          });
          statusEl.className = 'ovr-ms-status is-ok';
          statusEl.textContent = `BILANCIAMENTO ESATTO (${targetWeight} KG)`;
          if (typeof onWin === 'function') onWin();
        } else {
          locked = true;
          currBox.classList.add('is-err');
          for (const sIdx of selected) {
            weightBtns[sIdx].classList.remove('is-selected');
            weightBtns[sIdx].classList.add('is-err');
          }
          statusEl.className = 'ovr-ms-status is-err';
          statusEl.textContent = `TOTALE ERRATO: ${currentTotal} != ${targetWeight} KG`;
          if (typeof onMistake === 'function') onMistake();
          scheduleTimer(() => {
            currBox.classList.remove('is-err');
            weightBtns.forEach((b) => {
              b.classList.remove('is-selected', 'is-err');
              b.setAttribute('aria-pressed', 'false');
            });
            selected.clear();
            locked = false;
            updateView();
            if (!solved) {
              statusEl.className = 'ovr-ms-status';
              statusEl.textContent = 'SELEZIONA 2 PESI (0/2)';
            }
          }, 340);
        }
      },
      { signal: ac.signal }
    );

    rack.appendChild(btn);
    return btn;
  });

  updateView();
  root.append(ruleEl, readouts, meter, rack, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
