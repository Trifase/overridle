import { randInt, pick, shuffle } from '../prng.js';

const COLORS = [
  { name: 'ROSSO', hex: '#ff3b3b' },
  { name: 'BLU', hex: '#2997ff' },
  { name: 'GIALLO', hex: '#ffd426' },
  { name: 'VERDE', hex: '#00e676' },
  { name: 'BIANCO', hex: '#eef7f2' },
];

function pickDistinctInts(rng, count, min, max, predicate = () => true) {
  const pool = [];
  for (let n = min; n <= max; n++) {
    if (predicate(n)) pool.push(n);
  }
  return shuffle(rng, pool).slice(0, count);
}

function generatePuzzle(rng) {
  const count = randInt(rng, 4, 5);
  const family = randInt(rng, 0, 7);

  let wires = [];
  let ruleText = '';
  let verify = null;

  if (family === 0) {
    // 1 even, rest odd
    const targetIdx = randInt(rng, 0, count - 1);
    const evenVal = pick(rng, pickDistinctInts(rng, 1, 10, 98, (n) => n % 2 === 0));
    const oddVals = pickDistinctInts(rng, count - 1, 11, 99, (n) => n % 2 !== 0);
    let o = 0;
    for (let i = 0; i < count; i++) {
      wires.push({
        index: i,
        color: pick(rng, COLORS),
        value: i === targetIdx ? evenVal : oddVals[o++],
      });
    }
    ruleText = "Taglia l'unico cavo con valore PARI.";
    verify = (list) => {
      const matches = list.filter((w) => w.value % 2 === 0);
      return matches.length === 1 ? matches[0].index : -1;
    };
  } else if (family === 1) {
    // 1 odd, rest even
    const targetIdx = randInt(rng, 0, count - 1);
    const oddVal = pick(rng, pickDistinctInts(rng, 1, 11, 99, (n) => n % 2 !== 0));
    const evenVals = pickDistinctInts(rng, count - 1, 10, 98, (n) => n % 2 === 0);
    let e = 0;
    for (let i = 0; i < count; i++) {
      wires.push({
        index: i,
        color: pick(rng, COLORS),
        value: i === targetIdx ? oddVal : evenVals[e++],
      });
    }
    ruleText = "Taglia l'unico cavo con valore DISPARI.";
    verify = (list) => {
      const matches = list.filter((w) => w.value % 2 !== 0);
      return matches.length === 1 ? matches[0].index : -1;
    };
  } else if (family === 2) {
    // Strictly distinct max value
    const vals = pickDistinctInts(rng, count, 10, 99);
    for (let i = 0; i < count; i++) {
      wires.push({ index: i, color: pick(rng, COLORS), value: vals[i] });
    }
    ruleText = 'Taglia il cavo con il valore MASSIMO.';
    verify = (list) => {
      const maxVal = Math.max(...list.map((w) => w.value));
      const matches = list.filter((w) => w.value === maxVal);
      return matches.length === 1 ? matches[0].index : -1;
    };
  } else if (family === 3) {
    // Strictly distinct min value
    const vals = pickDistinctInts(rng, count, 10, 99);
    for (let i = 0; i < count; i++) {
      wires.push({ index: i, color: pick(rng, COLORS), value: vals[i] });
    }
    ruleText = 'Taglia il cavo con il valore MINIMO.';
    verify = (list) => {
      const minVal = Math.min(...list.map((w) => w.value));
      const matches = list.filter((w) => w.value === minVal);
      return matches.length === 1 ? matches[0].index : -1;
    };
  } else if (family === 4) {
    // At least 2 RED -> first RED; otherwise -> LAST wire
    const redColor = COLORS[0];
    const nonRedColors = COLORS.slice(1);
    const makeManyRed = rng() < 0.5;
    const redCount = makeManyRed ? randInt(rng, 2, Math.min(3, count)) : randInt(rng, 0, 1);
    const indices = shuffle(rng, Array.from({ length: count }, (_, i) => i));
    const redSet = new Set(indices.slice(0, redCount));
    const vals = pickDistinctInts(rng, count, 10, 99);

    for (let i = 0; i < count; i++) {
      wires.push({
        index: i,
        color: redSet.has(i) ? redColor : pick(rng, nonRedColors),
        value: vals[i],
      });
    }
    ruleText =
      "Taglia il PRIMO cavo ROSSO se ci sono almeno 2 cavi ROSSI; altrimenti taglia l'ULTIMO cavo.";
    verify = (list) => {
      const reds = list.filter((w) => w.color.name === 'ROSSO');
      return reds.length >= 2 ? reds[0].index : list.length - 1;
    };
  } else if (family === 5) {
    // At most 1 BLUE wire; if in even 1-based position (2° or 4°) cut it, else cut 1° wire
    const blueColor = COLORS[1];
    const nonBlueColors = COLORS.filter((c) => c.name !== 'BLU');
    const mode = randInt(rng, 0, 2); // 0: no blue, 1: blue at even pos, 2: blue at odd pos
    let blueIdx = -1;
    if (mode === 1) {
      const evenIndices = Array.from({ length: count }, (_, i) => i).filter(
        (i) => (i + 1) % 2 === 0
      );
      blueIdx = pick(rng, evenIndices);
    } else if (mode === 2) {
      const oddIndices = Array.from({ length: count }, (_, i) => i).filter(
        (i) => (i + 1) % 2 !== 0
      );
      blueIdx = pick(rng, oddIndices);
    }
    const vals = pickDistinctInts(rng, count, 10, 99);
    for (let i = 0; i < count; i++) {
      wires.push({
        index: i,
        color: i === blueIdx ? blueColor : pick(rng, nonBlueColors),
        value: vals[i],
      });
    }
    ruleText =
      "Se c'è un cavo BLU in posizione PARI (2° o 4°), taglialo; altrimenti taglia il PRIMO cavo.";
    verify = (list) => {
      const blues = list.filter((w) => w.color.name === 'BLU');
      if (blues.length > 1) return -1;
      if (blues.length === 1 && (blues[0].index + 1) % 2 === 0) {
        return blues[0].index;
      }
      return 0;
    };
  } else if (family === 6) {
    // Exactly 1 multiple of 5
    const targetIdx = randInt(rng, 0, count - 1);
    const mult5 = pick(rng, pickDistinctInts(rng, 1, 10, 95, (n) => n % 5 === 0));
    const nonMult5 = pickDistinctInts(rng, count - 1, 11, 99, (n) => n % 5 !== 0);
    let m = 0;
    for (let i = 0; i < count; i++) {
      wires.push({
        index: i,
        color: pick(rng, COLORS),
        value: i === targetIdx ? mult5 : nonMult5[m++],
      });
    }
    ruleText = "Taglia l'unico cavo il cui numero è multiplo di 5.";
    verify = (list) => {
      const matches = list.filter((w) => w.value % 5 === 0);
      return matches.length === 1 ? matches[0].index : -1;
    };
  } else {
    // Exactly 1 YELLOW wire, no value equals 50: if YELLOW > 50 cut YELLOW, else cut MIN
    const yellowColor = COLORS[2];
    const nonYellowColors = COLORS.filter((c) => c.name !== 'GIALLO');
    const yellowIdx = randInt(rng, 0, count - 1);
    const wantGt50 = rng() < 0.5;
    const yellowPool = pickDistinctInts(rng, 1, 11, 99, (n) =>
      wantGt50 ? n > 50 : n < 50
    );
    const yellowVal = yellowPool[0];
    const otherVals = pickDistinctInts(
      rng,
      count - 1,
      10,
      99,
      (n) => n !== 50 && n !== yellowVal
    );
    let o = 0;
    for (let i = 0; i < count; i++) {
      wires.push({
        index: i,
        color: i === yellowIdx ? yellowColor : pick(rng, nonYellowColors),
        value: i === yellowIdx ? yellowVal : otherVals[o++],
      });
    }
    ruleText =
      "Se l'unico cavo GIALLO ha valore maggiore di 50, taglialo; altrimenti taglia il cavo con il valore MINIMO.";
    verify = (list) => {
      const yellows = list.filter((w) => w.color.name === 'GIALLO');
      if (yellows.length !== 1 || yellows[0].value === 50) return -1;
      if (yellows[0].value > 50) return yellows[0].index;
      const minVal = Math.min(...list.map((w) => w.value));
      const mins = list.filter((w) => w.value === minVal);
      return mins.length === 1 ? mins[0].index : -1;
    };
  }

  const correctIndex = verify(wires);
  if (correctIndex < 0 || correctIndex >= wires.length) {
    throw new Error(`Invalid wires puzzle generated (correctIndex=${correctIndex})`);
  }

  return { wires, ruleText, correctIndex };
}

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const { wires, ruleText, correctIndex } = generatePuzzle(rng);

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
    .ovr-wires {
      box-sizing: border-box;
      width: 100%;
      max-width: 340px;
      margin: 0 auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      color: var(--crt-green, #00ff66);
      user-select: none;
      -webkit-user-select: none;
    }
    .ovr-wires * {
      box-sizing: border-box;
    }
    .ovr-wires-rule {
      background: rgba(0, 255, 102, 0.06);
      border: 1px solid var(--crt-amber, #ffb000);
      border-left: 4px solid var(--crt-amber, #ffb000);
      padding: 8px 10px;
      border-radius: 4px;
    }
    .ovr-wires-tag {
      font-size: 10px;
      letter-spacing: 0.12em;
      color: var(--crt-amber, #ffb000);
      margin-bottom: 4px;
      font-weight: 700;
    }
    .ovr-wires-rule-text {
      font-size: 12.5px;
      line-height: 1.32;
      color: #eef7f2;
      font-weight: 600;
    }
    .ovr-wires-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ovr-wire-btn {
      width: 100%;
      min-height: 46px;
      padding: 5px 10px;
      background: rgba(5, 10, 7, 0.92);
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      touch-action: manipulation;
      font-family: inherit;
      color: inherit;
      transition: transform 0.08s ease, border-color 0.12s ease, background 0.12s ease;
    }
    .ovr-wire-btn:active:not(:disabled) {
      transform: scale(0.985);
    }
    .ovr-wire-pos {
      flex: 0 0 26px;
      font-size: 12px;
      font-weight: 700;
      color: var(--crt-cyan, #00e5ff);
      text-align: left;
    }
    .ovr-wire-cable {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      position: relative;
      height: 22px;
    }
    .ovr-wire-pin {
      width: 6px;
      height: 16px;
      background: #4d5d53;
      border: 1px solid #8fa396;
      border-radius: 2px;
      flex: 0 0 6px;
    }
    .ovr-wire-span {
      flex: 1 1 0;
      height: 8px;
      background: var(--wire-color);
      box-shadow: 0 0 6px var(--wire-color);
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .ovr-wire-span-l {
      border-top: 2px solid rgba(255, 255, 255, 0.35);
      border-bottom: 2px solid rgba(0, 0, 0, 0.45);
    }
    .ovr-wire-span-r {
      border-top: 2px solid rgba(255, 255, 255, 0.35);
      border-bottom: 2px solid rgba(0, 0, 0, 0.45);
    }
    .ovr-wire-gap {
      width: 0;
      overflow: hidden;
      text-align: center;
      font-size: 13px;
      font-weight: 800;
      color: var(--crt-green, #00ff66);
      transition: width 0.12s ease;
    }
    .ovr-wire-btn.is-cut {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.12);
    }
    .ovr-wire-btn.is-cut .ovr-wire-span-l {
      transform: translateX(-3px) rotate(-5deg);
      opacity: 0.75;
    }
    .ovr-wire-btn.is-cut .ovr-wire-span-r {
      transform: translateX(3px) rotate(5deg);
      opacity: 0.75;
    }
    .ovr-wire-btn.is-cut .ovr-wire-gap {
      width: 22px;
    }
    .ovr-wire-btn.is-error {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.22);
      animation: ovr-wires-shake 0.32s ease;
    }
    .ovr-wire-label {
      flex: 0 0 auto;
      min-width: 108px;
      padding: 4px 7px;
      border-radius: 3px;
      border: 1px solid var(--wire-color);
      background: rgba(0, 0, 0, 0.65);
      color: var(--wire-color);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-align: right;
      white-space: nowrap;
    }
    .ovr-wires-status {
      font-size: 11px;
      min-height: 16px;
      letter-spacing: 0.06em;
      color: rgba(0, 255, 102, 0.75);
      text-align: center;
    }
    .ovr-wires-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
    .ovr-wires-status.is-ok {
      color: var(--crt-green, #00ff66);
      font-weight: 700;
    }
    @keyframes ovr-wires-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      50% { transform: translateX(5px); }
      75% { transform: translateX(-3px); }
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-wires';

  const ruleBox = document.createElement('div');
  ruleBox.className = 'ovr-wires-rule';
  ruleBox.innerHTML = `<div class="ovr-wires-tag">PROTOCOLLO TAGLIO // ${wires.length} CAVI</div>`;
  const ruleP = document.createElement('div');
  ruleP.className = 'ovr-wires-rule-text';
  ruleP.textContent = ruleText;
  ruleBox.appendChild(ruleP);

  const listEl = document.createElement('div');
  listEl.className = 'ovr-wires-list';

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-wires-status';
  statusEl.textContent = 'TOCCA IL CAVO CORRETTO PER RECIDERLO';

  const wireButtons = wires.map((w) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ovr-wire-btn';
    btn.style.setProperty('--wire-color', w.color.hex);
    btn.dataset.wireIndex = String(w.index);
    btn.dataset.correct = String(w.index === correctIndex);
    btn.setAttribute('aria-label', `Cavo ${w.index + 1} ${w.color.name} codice ${w.value}`);

    btn.innerHTML = `
      <span class="ovr-wire-pos">${w.index + 1}°</span>
      <span class="ovr-wire-cable" aria-hidden="true">
        <span class="ovr-wire-pin"></span>
        <span class="ovr-wire-span ovr-wire-span-l"></span>
        <span class="ovr-wire-gap">×</span>
        <span class="ovr-wire-span ovr-wire-span-r"></span>
        <span class="ovr-wire-pin"></span>
      </span>
      <span class="ovr-wire-label">[${w.color.name}] // ${w.value}</span>
    `;

    btn.addEventListener(
      'click',
      () => {
        if (solved || disposed) return;
        if (w.index === correctIndex) {
          solved = true;
          btn.classList.remove('is-error');
          btn.classList.add('is-cut');
          wireButtons.forEach((b) => {
            b.disabled = true;
          });
          statusEl.className = 'ovr-wires-status is-ok';
          statusEl.textContent = `CAVO ${w.index + 1}° [${w.color.name}] RECISO // OK`;
          if (typeof onWin === 'function') onWin();
        } else {
          btn.classList.remove('is-error');
          void btn.offsetWidth;
          btn.classList.add('is-error');
          statusEl.className = 'ovr-wires-status is-err';
          statusEl.textContent = `CAVO ERRATO [${w.color.name} // ${w.value}] — CORTOCIRCUITO!`;
          scheduleTimer(() => {
            btn.classList.remove('is-error');
          }, 380);
          if (typeof onMistake === 'function') onMistake();
        }
      },
      { signal: ac.signal }
    );

    listEl.appendChild(btn);
    return btn;
  });

  root.append(ruleBox, listEl, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
