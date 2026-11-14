import { pick, shuffle } from '../prng.js';

const GLYPHS = [
  { id: 'ALFA', glyph: 'α' },
  { id: 'BETA', glyph: 'β' },
  { id: 'GAMMA', glyph: 'γ' },
  { id: 'DELTA', glyph: 'Δ' },
  { id: 'THETA', glyph: 'Θ' },
  { id: 'LAMBDA', glyph: 'Λ' },
  { id: 'SIGMA', glyph: 'Σ' },
  { id: 'PSI', glyph: 'Ψ' },
  { id: 'OMEGA', glyph: 'Ω' },
];

const CONDITIONS = [
  {
    id: 'row0',
    phrase: 'è nella prima riga',
    test: (idx) => Math.floor(idx / 3) === 0,
  },
  {
    id: 'row1',
    phrase: 'è nella riga centrale',
    test: (idx) => Math.floor(idx / 3) === 1,
  },
  {
    id: 'row2',
    phrase: "è nell'ultima riga",
    test: (idx) => Math.floor(idx / 3) === 2,
  },
  {
    id: 'col0',
    phrase: 'è nella prima colonna',
    test: (idx) => idx % 3 === 0,
  },
  {
    id: 'col1',
    phrase: 'è nella colonna centrale',
    test: (idx) => idx % 3 === 1,
  },
  {
    id: 'col2',
    phrase: "è nell'ultima colonna",
    test: (idx) => idx % 3 === 2,
  },
  {
    id: 'center',
    phrase: 'è al centro',
    test: (idx) => idx === 4,
  },
  {
    id: 'corner',
    phrase: 'è in un angolo',
    test: (idx) => idx === 0 || idx === 2 || idx === 6 || idx === 8,
  },
];

const POSITIONAL_TARGETS = [
  { key: 'pos_tl', label: "l'angolo in alto a sinistra", resolve: () => 0 },
  { key: 'pos_tr', label: "l'angolo in alto a destra", resolve: () => 2 },
  { key: 'pos_center', label: 'il centro della griglia', resolve: () => 4 },
  { key: 'pos_bl', label: "l'angolo in basso a sinistra", resolve: () => 6 },
  { key: 'pos_br', label: "l'angolo in basso a destra", resolve: () => 8 },
];

function makeGlyphTargets() {
  return GLYPHS.map((g) => ({
    key: `glyph_${g.id}`,
    label: `${g.id} (${g.glyph})`,
    resolve: (grid) => grid.findIndex((cell) => cell.id === g.id),
  }));
}

function pickDistinctTargets(rng, grid) {
  const glyphTargets = makeGlyphTargets();
  const usedIndices = new Set();
  const chosen = [];

  for (let slot = 0; slot < 3; slot++) {
    let picked = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const pool = rng() < 0.35 ? POSITIONAL_TARGETS : glyphTargets;
      const candidate = pick(rng, pool);
      const idx = candidate.resolve(grid);
      if (idx >= 0 && idx < 9 && !usedIndices.has(idx)) {
        picked = { target: candidate, index: idx };
        break;
      }
    }
    if (!picked) {
      for (const candidate of glyphTargets) {
        const idx = candidate.resolve(grid);
        if (!usedIndices.has(idx)) {
          picked = { target: candidate, index: idx };
          break;
        }
      }
    }
    usedIndices.add(picked.index);
    chosen.push(picked);
  }

  return chosen;
}

function generatePuzzle(rng) {
  const grid = shuffle(rng, GLYPHS);
  const [g1, g2] = shuffle(rng, GLYPHS).slice(0, 2);
  const [pred1, pred2] = shuffle(rng, CONDITIONS).slice(0, 2);

  const cond1 = {
    glyph: g1,
    predicate: pred1,
    subjectLabel: `${g1.id} (${g1.glyph})`,
    evalGrid: (cells) => {
      const idx = cells.findIndex((c) => c.id === g1.id);
      return idx >= 0 && pred1.test(idx);
    },
  };

  const cond2 = {
    glyph: g2,
    predicate: pred2,
    subjectLabel: `${g2.id} (${g2.glyph})`,
    evalGrid: (cells) => {
      const idx = cells.findIndex((c) => c.id === g2.id);
      return idx >= 0 && pred2.test(idx);
    },
  };

  const [t1, t2, t3] = pickDistinctTargets(rng, grid);

  // Execute exact if / else if / else chain on the rendered grid
  let expectedIndex;
  if (cond1.evalGrid(grid)) {
    expectedIndex = t1.index;
  } else if (cond2.evalGrid(grid)) {
    expectedIndex = t2.index;
  } else {
    expectedIndex = t3.index;
  }

  const ruleText =
    `Se ${cond1.subjectLabel} ${cond1.predicate.phrase}, premi ${t1.target.label}; ` +
    `altrimenti se ${cond2.subjectLabel} ${cond2.predicate.phrase}, premi ${t2.target.label}; ` +
    `altrimenti premi ${t3.target.label}.`;

  return { grid, cond1, cond2, t1, t2, t3, ruleText, expectedIndex };
}

function appendSpan(parent, text, className = '') {
  const el = document.createElement('span');
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
}

export function mount(container, rng, callbacks = {}) {
  const { onWin, onMistake } = callbacks;
  const { grid, cond1, cond2, t1, t2, t3, ruleText, expectedIndex } = generatePuzzle(rng);

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
    .ovr-glyph {
      box-sizing: border-box;
      width: 100%;
      max-width: 340px;
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
    .ovr-glyph * {
      box-sizing: border-box;
    }
    .ovr-glyph-rule {
      border: 1px solid var(--crt-amber, #ffb000);
      border-left: 4px solid var(--crt-amber, #ffb000);
      background: rgba(255, 176, 0, 0.06);
      border-radius: 4px;
      padding: 8px 10px;
    }
    .ovr-glyph-tag {
      font-size: 10px;
      letter-spacing: 0.11em;
      color: var(--crt-amber, #ffb000);
      font-weight: 700;
      margin-bottom: 4px;
    }
    .ovr-glyph-text {
      font-size: 12.5px;
      line-height: 1.38;
      color: #eef7f2;
    }
    .ovr-glyph-cond {
      color: var(--crt-cyan, #00e5ff);
      font-weight: 700;
    }
    .ovr-glyph-tgt {
      color: var(--crt-amber, #ffb000);
      font-weight: 700;
    }
    .ovr-glyph-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .ovr-glyph-cell {
      min-height: 70px;
      padding: 6px 4px;
      border-radius: 4px;
      border: 1px solid rgba(0, 255, 102, 0.4);
      background: rgba(5, 10, 7, 0.94);
      color: var(--crt-green, #00ff66);
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
    .ovr-glyph-cell:active:not(:disabled) {
      transform: scale(0.97);
    }
    .ovr-glyph-sym {
      font-size: 26px;
      line-height: 1;
      font-weight: 700;
      color: #eef7f2;
      text-shadow: 0 0 6px rgba(0, 255, 102, 0.35);
    }
    .ovr-glyph-id {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--crt-green, #00ff66);
      opacity: 0.9;
    }
    .ovr-glyph-cell.is-win {
      border-color: var(--crt-green, #00ff66);
      background: rgba(0, 255, 102, 0.18);
    }
    .ovr-glyph-cell.is-win .ovr-glyph-sym {
      color: var(--crt-green, #00ff66);
    }
    .ovr-glyph-cell.is-err {
      border-color: var(--crt-red, #ff2a2a);
      background: rgba(255, 42, 42, 0.22);
      animation: ovr-glyph-shake 0.32s ease;
    }
    .ovr-glyph-cell.is-err .ovr-glyph-sym,
    .ovr-glyph-cell.is-err .ovr-glyph-id {
      color: var(--crt-red, #ff2a2a);
    }
    .ovr-glyph-status {
      font-size: 11px;
      min-height: 16px;
      text-align: center;
      letter-spacing: 0.05em;
      color: rgba(0, 255, 102, 0.78);
    }
    .ovr-glyph-status.is-err {
      color: var(--crt-red, #ff2a2a);
    }
    .ovr-glyph-status.is-ok {
      color: var(--crt-green, #00ff66);
      font-weight: 700;
    }
    @keyframes ovr-glyph-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      50% { transform: translateX(5px); }
      75% { transform: translateX(-3px); }
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-glyph';
  root.dataset.expectedIndex = String(expectedIndex);

  const ruleBox = document.createElement('div');
  ruleBox.className = 'ovr-glyph-rule';
  ruleBox.innerHTML = `<div class="ovr-glyph-tag">PROTOCOLLO GEROGLIFICI</div>`;

  const ruleP = document.createElement('div');
  ruleP.className = 'ovr-glyph-text';
  ruleP.dataset.ruleText = ruleText;

  appendSpan(ruleP, 'Se ');
  appendSpan(ruleP, cond1.subjectLabel, 'ovr-glyph-cond');
  appendSpan(ruleP, ` ${cond1.predicate.phrase}, premi `);
  appendSpan(ruleP, t1.target.label, 'ovr-glyph-tgt');
  appendSpan(ruleP, '; altrimenti se ');
  appendSpan(ruleP, cond2.subjectLabel, 'ovr-glyph-cond');
  appendSpan(ruleP, ` ${cond2.predicate.phrase}, premi `);
  appendSpan(ruleP, t2.target.label, 'ovr-glyph-tgt');
  appendSpan(ruleP, '; altrimenti premi ');
  appendSpan(ruleP, t3.target.label, 'ovr-glyph-tgt');
  appendSpan(ruleP, '.');

  ruleBox.appendChild(ruleP);

  const gridEl = document.createElement('div');
  gridEl.className = 'ovr-glyph-grid';

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-glyph-status';
  statusEl.textContent = 'VALUTA LA REGOLA E TOCCA IL SIMBOLO';

  const cellButtons = grid.map((cell, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ovr-glyph-cell';
    btn.dataset.cellIndex = String(index);
    btn.dataset.glyph = cell.id;
    btn.dataset.correct = String(index === expectedIndex);
    btn.setAttribute('aria-label', `${cell.id} (${cell.glyph}), riga ${Math.floor(index / 3) + 1}, colonna ${(index % 3) + 1}`);

    const symSpan = document.createElement('span');
    symSpan.className = 'ovr-glyph-sym';
    symSpan.textContent = cell.glyph;

    const idSpan = document.createElement('span');
    idSpan.className = 'ovr-glyph-id';
    idSpan.textContent = cell.id;

    btn.append(symSpan, idSpan);

    btn.addEventListener(
      'click',
      () => {
        if (solved || disposed) return;
        if (index === expectedIndex) {
          solved = true;
          btn.classList.remove('is-err');
          btn.classList.add('is-win');
          cellButtons.forEach((b) => {
            b.disabled = true;
          });
          statusEl.className = 'ovr-glyph-status is-ok';
          statusEl.textContent = `GLIFO ${cell.id} (${cell.glyph}) CONFERMATO // OK`;
          if (typeof onWin === 'function') onWin();
        } else {
          btn.classList.remove('is-err');
          void btn.offsetWidth;
          btn.classList.add('is-err');
          statusEl.className = 'ovr-glyph-status is-err';
          statusEl.textContent = `GLIFO ERRATO: ${cell.id} (${cell.glyph})!`;
          scheduleTimer(() => {
            btn.classList.remove('is-err');
          }, 380);
          if (typeof onMistake === 'function') onMistake();
        }
      },
      { signal: ac.signal }
    );

    gridEl.appendChild(btn);
    return btn;
  });

  root.append(ruleBox, gridEl, statusEl);
  container.append(style, root);

  return () => {
    disposed = true;
    ac.abort();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
