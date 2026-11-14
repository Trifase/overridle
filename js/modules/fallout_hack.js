import { randInt, pick, shuffle } from '../prng.js';

const WORD_POOL = [
  'CORE', 'FLUX', 'NODE', 'SYNC', 'BIOS', 'LOCK',
  'VOID', 'GATE', 'HEX7', 'KRNL', 'BOOT', 'CHIP',
  'WIRE', 'GRID', 'VOLT', 'SCAN', 'PING', 'ECHO',
  'MASK', 'DATA', 'CODE', 'PORT', 'ROOT', 'FIRE'
];

const NOISE_CHARS = '@#$%&*[]{}<>/?!+=~^:;';

function makeNoise(rng, len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += NOISE_CHARS[randInt(rng, 0, NOISE_CHARS.length - 1)];
  }
  return out;
}

/**
 * Terminale Fallout (fallout_hack)
 * Trova e tocca i 5 codici target nel dump esadecimale evitando le esche.
 */
export function mount(container, rng, { onWin, onMistake } = {}) {
  let destroyed = false;
  let solved = false;
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

  const poolShuffled = shuffle(rng, WORD_POOL);
  const targets = poolShuffled.slice(0, 5);
  const decoys = poolShuffled.slice(5, 14);
  const targetSet = new Set(targets);
  const foundSet = new Set();

  const allTokens = shuffle(
    rng,
    targets.concat(decoys).map((word) => ({
      word,
      isTarget: targetSet.has(word)
    }))
  );

  const rowCounts = shuffle(rng, [1, 2, 2, 2, 2, 2, 3]);
  const baseAddr = randInt(rng, 0x100, 0xf80) * 16;

  const rows = [];
  let cursor = 0;
  for (let r = 0; r < rowCounts.length; r++) {
    const count = rowCounts[r];
    const rowTokens = allTokens.slice(cursor, cursor + count);
    cursor += count;
    const addr = '0x' + (baseAddr + r * 16).toString(16).toUpperCase().padStart(4, '0');
    rows.push({ addr, tokens: rowTokens });
  }

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-fh, .ovr-fh * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .ovr-fh {
      width: 100%;
      max-width: 340px;
      margin: 0 auto;
      padding: 8px;
      background: #050a07;
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 6px;
      color: #00ff66;
      font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      display: flex;
      flex-direction: column;
      gap: 7px;
      overflow: hidden;
    }
    .ovr-fh-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(0, 255, 102, 0.25);
    }
    .ovr-fh-title {
      color: #00e5ff;
    }
    .ovr-fh-count {
      color: #ffb000;
    }
    .ovr-fh-targets {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 4px;
    }
    .ovr-fh-chip {
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #ffb000;
      background: rgba(255, 176, 0, 0.08);
      border: 1px solid rgba(255, 176, 0, 0.45);
      border-radius: 4px;
      transition: all 0.12s ease;
    }
    .ovr-fh-chip.is-found {
      color: #050a07;
      background: #00ff66;
      border-color: #00ff66;
      text-decoration: line-through;
      box-shadow: 0 0 8px rgba(0, 255, 102, 0.45);
    }
    .ovr-fh-dump {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px;
      background: rgba(0, 20, 10, 0.65);
      border: 1px solid rgba(0, 255, 102, 0.22);
      border-radius: 4px;
    }
    .ovr-fh-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      min-height: 36px;
      overflow: hidden;
    }
    .ovr-fh-addr {
      flex: 0 0 auto;
      font-size: 10.5px;
      color: rgba(0, 255, 102, 0.5);
      letter-spacing: 0.02em;
      margin-right: 2px;
    }
    .ovr-fh-stream {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2px;
      overflow: hidden;
    }
    .ovr-fh-noise {
      font-size: 11px;
      color: rgba(0, 255, 102, 0.36);
      letter-spacing: 0.04em;
      white-space: nowrap;
      overflow: hidden;
      flex: 1 1 0;
      text-align: center;
      pointer-events: none;
    }
    .ovr-fh-tok {
      flex: 0 0 auto;
      min-width: 50px;
      min-height: 35px;
      padding: 0 8px;
      margin: 0;
      border: 1px solid rgba(0, 255, 102, 0.28);
      border-radius: 4px;
      background: rgba(0, 255, 102, 0.07);
      color: #00ff66;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      touch-action: manipulation;
      transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease;
    }
    .ovr-fh-tok:active {
      transform: scale(0.96);
    }
    .ovr-fh-tok.is-found {
      background: rgba(0, 229, 255, 0.22);
      border-color: #00e5ff;
      color: #00e5ff;
      box-shadow: 0 0 10px rgba(0, 229, 255, 0.45);
      cursor: default;
    }
    .ovr-fh-tok.is-error {
      background: rgba(255, 42, 42, 0.35);
      border-color: #ff2a2a;
      color: #ff2a2a;
      box-shadow: 0 0 10px rgba(255, 42, 42, 0.55);
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-fh';

  const head = document.createElement('div');
  head.className = 'ovr-fh-head';
  const titleEl = document.createElement('span');
  titleEl.className = 'ovr-fh-title';
  titleEl.textContent = 'TERMINALE // TARGET';
  const countEl = document.createElement('span');
  countEl.className = 'ovr-fh-count';
  countEl.textContent = 'TROVATI: 0/5';
  head.append(titleEl, countEl);

  const targetsBar = document.createElement('div');
  targetsBar.className = 'ovr-fh-targets';
  const chipMap = new Map();
  for (const word of targets) {
    const chip = document.createElement('div');
    chip.className = 'ovr-fh-chip';
    chip.textContent = word;
    targetsBar.appendChild(chip);
    chipMap.set(word, chip);
  }

  const dump = document.createElement('div');
  dump.className = 'ovr-fh-dump';

  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'ovr-fh-row';

    const addrEl = document.createElement('span');
    addrEl.className = 'ovr-fh-addr';
    addrEl.textContent = row.addr;

    const streamEl = document.createElement('div');
    streamEl.className = 'ovr-fh-stream';

    const totalNoiseBudget = row.tokens.length === 1 ? 20 : row.tokens.length === 2 ? 12 : 6;
    const segments = row.tokens.length + 1;
    const perNoise = Math.max(1, Math.floor(totalNoiseBudget / segments));

    for (let i = 0; i < row.tokens.length; i++) {
      const lead = document.createElement('span');
      lead.className = 'ovr-fh-noise';
      lead.textContent = makeNoise(rng, Math.max(1, perNoise + randInt(rng, 0, 2)));
      streamEl.appendChild(lead);

      const tokObj = row.tokens[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ovr-fh-tok';
      btn.textContent = tokObj.word;

      btn.addEventListener('click', () => {
        if (destroyed || solved) return;
        if (tokObj.isTarget) {
          if (foundSet.has(tokObj.word)) {
            return;
          }
          foundSet.add(tokObj.word);
          btn.classList.add('is-found');
          const chip = chipMap.get(tokObj.word);
          if (chip) chip.classList.add('is-found');
          countEl.textContent = `TROVATI: ${foundSet.size}/5`;
          if (foundSet.size >= 5) {
            solved = true;
            onWin?.();
          }
        } else {
          btn.classList.add('is-error');
          onMistake?.();
          if (!destroyed && !solved) {
            trackTimeout(() => {
              btn.classList.remove('is-error');
            }, 350);
          }
        }
      });

      streamEl.appendChild(btn);
    }

    const tail = document.createElement('span');
    tail.className = 'ovr-fh-noise';
    tail.textContent = makeNoise(rng, Math.max(1, perNoise + randInt(rng, 0, 2)));
    streamEl.appendChild(tail);

    rowEl.append(addrEl, streamEl);
    dump.appendChild(rowEl);
  }

  root.append(head, targetsBar, dump);
  container.append(style, root);

  return () => {
    destroyed = true;
    for (const id of timeouts) {
      clearTimeout(id);
    }
    timeouts.clear();
  };
}
