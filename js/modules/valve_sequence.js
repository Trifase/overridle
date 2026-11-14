import { shuffle } from '../prng.js';

const CRITICAL_THRESHOLD = 75;

/**
 * Bypass Valvole (valve_sequence)
 * Tocca le 3 valvole critiche (>= 75%) nell'ordine esatto in cui entrano in zona rossa.
 */
export function mount(container, rng, { onWin, onMistake } = {}) {
  let destroyed = false;
  let solved = false;
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

  const perm = shuffle(rng, [0, 1, 2, 3]);
  const criticalOrder = perm.slice(0, 3);
  const safeValveIdx = perm[3];

  const t1 = 0.42 + rng() * 0.12;
  const t2 = t1 + 0.68 + rng() * 0.14;
  const t3 = t2 + 0.68 + rng() * 0.14;
  const targetCrossTimes = [t1, t2, t3];

  const valves = [0, 1, 2, 3].map((idx) => ({
    idx,
    level: 10 + rng() * 14,
    maxLevel: 100,
    rate: 0,
    isCritical: false,
    bypassed: false
  }));

  for (let rank = 0; rank < 3; rank++) {
    const v = valves[criticalOrder[rank]];
    v.rate = (CRITICAL_THRESHOLD - v.level) / targetCrossTimes[rank];
    v.maxLevel = 100;
  }

  const safeValve = valves[safeValveIdx];
  safeValve.maxLevel = 46 + rng() * 14;
  safeValve.rate = (safeValve.maxLevel - safeValve.level) / 7.5;

  const enteredCriticalOrder = [];
  let bypassedCount = 0;
  let lastFrameTime = null;

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-vs, .ovr-vs * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .ovr-vs {
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
      gap: 8px;
    }
    .ovr-vs-head {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(0, 255, 102, 0.25);
    }
    .ovr-vs-head-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .ovr-vs-title {
      color: #00e5ff;
    }
    .ovr-vs-count {
      color: #ffb000;
    }
    .ovr-vs-sub {
      font-size: 10.5px;
      color: rgba(0, 255, 102, 0.72);
      letter-spacing: 0.04em;
    }
    .ovr-vs-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .ovr-vs-card {
      width: 100%;
      min-height: 70px;
      margin: 0;
      padding: 8px 10px;
      background: rgba(0, 255, 102, 0.05);
      border: 2px solid rgba(0, 255, 102, 0.32);
      border-radius: 6px;
      color: #00ff66;
      font-family: inherit;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
      touch-action: manipulation;
      text-align: left;
      transition: transform 0.06s ease, background 0.1s ease, border-color 0.1s ease;
    }
    .ovr-vs-card:active {
      transform: scale(0.985);
    }
    .ovr-vs-card.is-critical {
      border-color: #ff2a2a;
      background: rgba(255, 42, 42, 0.12);
      animation: ovr-vs-pulse 0.6s infinite alternate;
    }
    .ovr-vs-card.is-bypassed {
      border-color: #00ff66;
      background: rgba(0, 255, 102, 0.18);
      box-shadow: 0 0 10px rgba(0, 255, 102, 0.35);
      animation: none;
      cursor: default;
    }
    .ovr-vs-card.is-error {
      border-color: #ff2a2a !important;
      background: rgba(255, 42, 42, 0.36) !important;
      box-shadow: 0 0 14px rgba(255, 42, 42, 0.75) !important;
      animation: none;
    }
    @keyframes ovr-vs-pulse {
      from {
        box-shadow: 0 0 4px rgba(255, 42, 42, 0.35);
      }
      to {
        box-shadow: 0 0 14px rgba(255, 42, 42, 0.75);
      }
    }
    .ovr-vs-top {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .ovr-vs-name {
      color: #00e5ff;
    }
    .ovr-vs-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ovr-vs-status {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid rgba(0, 255, 102, 0.35);
      color: #00ff66;
    }
    .ovr-vs-card.is-critical .ovr-vs-status {
      border-color: #ff2a2a;
      background: rgba(255, 42, 42, 0.25);
      color: #ff2a2a;
    }
    .ovr-vs-card.is-bypassed .ovr-vs-status {
      border-color: #00ff66;
      background: rgba(0, 255, 102, 0.25);
      color: #00ff66;
    }
    .ovr-vs-pct {
      min-width: 38px;
      text-align: right;
      color: #ffb000;
    }
    .ovr-vs-card.is-critical .ovr-vs-pct {
      color: #ff2a2a;
    }
    .ovr-vs-card.is-bypassed .ovr-vs-pct {
      color: #00ff66;
    }
    .ovr-vs-track {
      position: relative;
      width: 100%;
      height: 16px;
      background: #030805;
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 4px;
      overflow: hidden;
    }
    .ovr-vs-danger-zone {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 75%;
      right: 0;
      background: rgba(255, 42, 42, 0.16);
      border-left: 2px solid #ff2a2a;
      pointer-events: none;
    }
    .ovr-vs-fill {
      position: relative;
      height: 100%;
      width: 0%;
      background: #00ff66;
      transition: background 0.1s ease;
    }
    .ovr-vs-fill.is-warn {
      background: #ffb000;
    }
    .ovr-vs-fill.is-crit {
      background: #ff2a2a;
      box-shadow: 0 0 10px rgba(255, 42, 42, 0.75);
    }
    .ovr-vs-fill.is-ok {
      background: #00ff66;
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-vs';

  const head = document.createElement('div');
  head.className = 'ovr-vs-head';
  const headTop = document.createElement('div');
  headTop.className = 'ovr-vs-head-top';
  const titleEl = document.createElement('span');
  titleEl.className = 'ovr-vs-title';
  titleEl.textContent = 'BYPASS VALVOLE';
  const countEl = document.createElement('span');
  countEl.className = 'ovr-vs-count';
  countEl.textContent = 'BYPASSATE: 0/3';
  headTop.append(titleEl, countEl);

  const subEl = document.createElement('div');
  subEl.className = 'ovr-vs-sub';
  subEl.textContent = 'TOCCA LE 3 CRITICHE (≥75%) IN ORDINE';
  head.append(headTop, subEl);

  const list = document.createElement('div');
  list.className = 'ovr-vs-list';

  const cardEls = valves.map((valve) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'ovr-vs-card';

    const top = document.createElement('div');
    top.className = 'ovr-vs-top';

    const name = document.createElement('span');
    name.className = 'ovr-vs-name';
    name.textContent = `VALVOLA ${valve.idx + 1}`;

    const meta = document.createElement('div');
    meta.className = 'ovr-vs-meta';
    const status = document.createElement('span');
    status.className = 'ovr-vs-status';
    status.textContent = 'NORMALE';
    const pct = document.createElement('span');
    pct.className = 'ovr-vs-pct';
    pct.textContent = `${Math.round(valve.level)}%`;
    meta.append(status, pct);

    top.append(name, meta);

    const track = document.createElement('div');
    track.className = 'ovr-vs-track';
    const danger = document.createElement('div');
    danger.className = 'ovr-vs-danger-zone';
    const fill = document.createElement('div');
    fill.className = 'ovr-vs-fill';
    fill.style.width = `${valve.level.toFixed(1)}%`;
    track.append(danger, fill);

    card.append(top, track);

    card.addEventListener('click', () => {
      if (destroyed || solved) return;
      if (valve.bypassed) return;

      const expectedIdx = enteredCriticalOrder[bypassedCount];
      if (valve.isCritical && expectedIdx === valve.idx) {
        valve.bypassed = true;
        bypassedCount += 1;
        card.classList.remove('is-critical', 'is-error');
        card.classList.add('is-bypassed');
        status.textContent = 'BYPASS OK ✓';
        fill.className = 'ovr-vs-fill is-ok';
        countEl.textContent = `BYPASSATE: ${bypassedCount}/3`;

        if (bypassedCount >= 3) {
          solved = true;
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          onWin?.();
        }
      } else {
        card.classList.add('is-error');
        onMistake?.();
        if (!destroyed && !solved) {
          trackTimeout(() => {
            card.classList.remove('is-error');
          }, 350);
        }
      }
    });

    list.appendChild(card);
    return { card, status, pct, fill };
  });

  root.append(head, list);
  container.append(style, root);

  function renderValve(valve, ui) {
    ui.pct.textContent = `${Math.round(valve.level)}%`;
    ui.fill.style.width = `${valve.level.toFixed(1)}%`;

    if (valve.bypassed) {
      ui.fill.className = 'ovr-vs-fill is-ok';
      return;
    }

    if (valve.isCritical) {
      ui.card.classList.add('is-critical');
      ui.status.textContent = 'CRITICA!';
      ui.fill.className = 'ovr-vs-fill is-crit';
    } else if (valve.level >= 55) {
      ui.fill.className = 'ovr-vs-fill is-warn';
    } else {
      ui.fill.className = 'ovr-vs-fill';
    }
  }

  function frame(now) {
    if (destroyed || solved) return;
    if (lastFrameTime === null) {
      lastFrameTime = now;
    }
    const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;

    for (let i = 0; i < valves.length; i++) {
      const valve = valves[i];
      if (!valve.bypassed && valve.level < valve.maxLevel) {
        valve.level = Math.min(valve.maxLevel, valve.level + valve.rate * dt);
        if (!valve.isCritical && valve.level >= CRITICAL_THRESHOLD) {
          valve.isCritical = true;
          enteredCriticalOrder.push(valve.idx);
        }
      }
      renderValve(valve, cardEls[i]);
    }

    rafId = requestAnimationFrame(frame);
  }

  for (let i = 0; i < valves.length; i++) {
    renderValve(valves[i], cardEls[i]);
  }
  rafId = requestAnimationFrame(frame);

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
