import { shuffle } from '../prng.js';

const RESET_WINDOW_SEC = 2.0;

/**
 * Reset Valvole (valve_sequence)
 * Le valvole salgono al 100%: clicca per resettarle entro 2 secondi.
 * Cliccare prima del 100% o superare i 2 secondi provoca un errore.
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

  const variantIdx = Math.floor(rng() * 3); // 0 = classic, 1 = jump, 2 = cycle
  const variant = variantIdx === 1 ? 'jump' : variantIdx === 2 ? 'cycle' : 'classic';
  const targetResets = variant === 'cycle' ? 4 : 3;

  const perm = shuffle(rng, [0, 1, 2, 3]);
  const triggerDelays = [
    0.7 + rng() * 0.45,
    1.7 + rng() * 0.55,
    2.8 + rng() * 0.65,
    3.9 + rng() * 0.75,
  ];

  const valves = [0, 1, 2, 3].map((idx) => {
    const rank = perm.indexOf(idx);
    const delay = triggerDelays[rank];
    const startLevel = variant === 'jump' ? 0 : 8 + rng() * 14;
    const rate = variant === 'jump' ? 0 : (100 - startLevel) / delay;
    return {
      idx,
      level: startLevel,
      rate,
      jumpAt: variant === 'jump' ? delay : Infinity,
      elapsed: 0,
      phase: variant === 'jump' ? 'waiting' : 'rising', // waiting | rising | at100 | draining | done
      at100Timer: 0,
      resetsCount: 0,
    };
  });

  let resetsDone = 0;
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
      color: rgba(0, 255, 102, 0.78);
      letter-spacing: 0.03em;
    }
    .ovr-vs-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ovr-vs-card {
      width: 100%;
      min-height: 62px;
      margin: 0;
      padding: 8px 10px;
      border: 1px solid rgba(0, 255, 102, 0.32);
      border-radius: 5px;
      background: #07120c;
      color: #00ff66;
      font-family: inherit;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      touch-action: manipulation;
      text-align: left;
      transition: border-color 0.08s ease, background 0.08s ease, transform 0.06s ease;
    }
    .ovr-vs-card:active {
      transform: scale(0.985);
    }
    .ovr-vs-card.is-at100 {
      border-color: #ff2a2a;
      background: rgba(255, 42, 42, 0.16);
      box-shadow: 0 0 14px rgba(255, 42, 42, 0.38);
    }
    .ovr-vs-card.is-done {
      border-color: rgba(0, 255, 102, 0.65);
      background: rgba(0, 255, 102, 0.1);
      cursor: default;
      opacity: 0.72;
    }
    .ovr-vs-card.is-error {
      border-color: #ff2a2a;
      background: rgba(255, 42, 42, 0.34);
      box-shadow: 0 0 16px rgba(255, 42, 42, 0.6);
    }
    .ovr-vs-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
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
      font-size: 10.5px;
      color: rgba(0, 255, 102, 0.75);
    }
    .ovr-vs-card.is-at100 .ovr-vs-status {
      color: #ff2a2a;
      font-weight: 700;
    }
    .ovr-vs-card.is-done .ovr-vs-status {
      color: #00ff66;
    }
    .ovr-vs-pct {
      color: #ffb000;
      min-width: 38px;
      text-align: right;
    }
    .ovr-vs-card.is-at100 .ovr-vs-pct {
      color: #ff2a2a;
    }
    .ovr-vs-track {
      position: relative;
      width: 100%;
      height: 16px;
      background: #020503;
      border: 1px solid rgba(0, 255, 102, 0.3);
      border-radius: 3px;
      overflow: hidden;
    }
    .ovr-vs-fill {
      position: relative;
      height: 100%;
      width: 0%;
      background: #00ff66;
      box-shadow: 0 0 8px rgba(0, 255, 102, 0.5);
    }
    .ovr-vs-fill.is-warn {
      background: #ffb000;
      box-shadow: 0 0 8px rgba(255, 176, 0, 0.55);
    }
    .ovr-vs-fill.is-crit {
      background: #ff2a2a;
      box-shadow: 0 0 10px rgba(255, 42, 42, 0.75);
    }
    .ovr-vs-fill.is-ok {
      background: #00e5ff;
      box-shadow: 0 0 8px rgba(0, 229, 255, 0.65);
    }
  `;

  const root = document.createElement('div');
  root.className = variant === 'classic' ? 'ovr-vs' : 'ovr-vs ovr-variant-mode';
  root.dataset.variant = variant;

  if (variant !== 'classic') {
    const vBanner = document.createElement('div');
    vBanner.className = 'ovr-variant-banner';
    vBanner.textContent =
      variant === 'jump'
        ? '⚡ VARIANTE: SCATTO RANDOM — Saltano da 0% a 100%!'
        : '⚡ VARIANTE: DOPPIA ONDA — Scendono e risalgono ancora!';
    root.appendChild(vBanner);
  }

  const head = document.createElement('div');
  head.className = 'ovr-vs-head';
  const headTop = document.createElement('div');
  headTop.className = 'ovr-vs-head-top';
  const titleEl = document.createElement('span');
  titleEl.className = 'ovr-vs-title';
  titleEl.textContent = 'RESET VALVOLE';
  const countEl = document.createElement('span');
  countEl.className = 'ovr-vs-count';
  countEl.textContent = `RESET: 0/${targetResets}`;
  headTop.append(titleEl, countEl);

  const subEl = document.createElement('div');
  subEl.className = 'ovr-vs-sub';
  subEl.textContent = 'CLICCA SOLO AL 100% ENTRO 2.0s';
  head.append(headTop, subEl);

  const list = document.createElement('div');
  list.className = 'ovr-vs-list';

  function flashError(card) {
    card.classList.add('is-error');
    onMistake?.();
    if (!destroyed && !solved) {
      trackTimeout(() => {
        card.classList.remove('is-error');
      }, 350);
    }
  }

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
    status.textContent = 'IN CARICO';
    const pct = document.createElement('span');
    pct.className = 'ovr-vs-pct';
    pct.textContent = `${Math.round(valve.level)}%`;
    meta.append(status, pct);

    top.append(name, meta);

    const track = document.createElement('div');
    track.className = 'ovr-vs-track';
    const fill = document.createElement('div');
    fill.className = 'ovr-vs-fill';
    fill.style.width = `${valve.level.toFixed(1)}%`;
    track.appendChild(fill);

    card.append(top, track);

    card.addEventListener('click', () => {
      if (destroyed || solved) return;
      if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) return;
      if (valve.phase === 'done') return;

      if (valve.phase === 'at100') {
        resetsDone += 1;
        valve.resetsCount += 1;
        valve.at100Timer = 0;
        card.classList.remove('is-at100', 'is-error');
        countEl.textContent = `RESET: ${resetsDone}/${targetResets}`;

        if (resetsDone >= targetResets) {
          valve.phase = 'done';
          valve.level = 0;
          solved = true;
          card.classList.add('is-done');
          status.textContent = 'RESET OK ✓';
          pct.textContent = '0%';
          fill.style.width = '0%';
          fill.className = 'ovr-vs-fill is-ok';
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          onWin?.();
          return;
        }

        if (variant === 'cycle') {
          valve.phase = 'draining';
          valve.rate = 38 + rng() * 18;
        } else {
          valve.phase = 'done';
          valve.level = 0;
          card.classList.add('is-done');
        }
        renderValve(valve, cardEls[valve.idx]);
      } else {
        flashError(card);
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

    if (valve.phase === 'done') {
      ui.card.classList.remove('is-at100');
      ui.card.classList.add('is-done');
      ui.status.textContent = 'RESET OK ✓';
      ui.fill.className = 'ovr-vs-fill is-ok';
      return;
    }

    if (valve.phase === 'at100') {
      const rem = Math.max(0, RESET_WINDOW_SEC - valve.at100Timer);
      ui.card.classList.add('is-at100');
      ui.status.textContent = `RESET! ${rem.toFixed(1)}s`;
      ui.fill.className = 'ovr-vs-fill is-crit';
    } else if (valve.phase === 'draining') {
      ui.card.classList.remove('is-at100');
      ui.status.textContent = 'SCARICO...';
      ui.fill.className = 'ovr-vs-fill is-ok';
    } else if (valve.level >= 70) {
      ui.card.classList.remove('is-at100');
      ui.status.textContent = 'QUASI AL 100%';
      ui.fill.className = 'ovr-vs-fill is-warn';
    } else {
      ui.card.classList.remove('is-at100');
      ui.status.textContent = variant === 'jump' ? 'IN ATTESA' : 'IN SALITA';
      ui.fill.className = 'ovr-vs-fill';
    }
  }

  function frame(now) {
    if (destroyed || solved) return;
    if (lastFrameTime === null) {
      lastFrameTime = now;
    }
    if (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__) {
      lastFrameTime = now;
      rafId = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;

    for (let i = 0; i < valves.length; i++) {
      const valve = valves[i];
      if (valve.phase === 'waiting') {
        valve.elapsed += dt;
        if (valve.elapsed >= valve.jumpAt) {
          valve.level = 100;
          valve.phase = 'at100';
          valve.at100Timer = 0;
        }
      } else if (valve.phase === 'rising') {
        valve.level = Math.min(100, valve.level + valve.rate * dt);
        if (valve.level >= 100) {
          valve.phase = 'at100';
          valve.at100Timer = 0;
        }
      } else if (valve.phase === 'draining') {
        valve.level = Math.max(0, valve.level - 180 * dt);
        if (valve.level <= 0) {
          valve.phase = 'rising';
        }
      } else if (valve.phase === 'at100') {
        valve.at100Timer += dt;
        if (valve.at100Timer >= RESET_WINDOW_SEC) {
          valve.at100Timer = 0;
          if (variant === 'cycle') {
            valve.phase = 'draining';
          } else if (variant === 'jump') {
            valve.level = 0;
            valve.phase = 'waiting';
            valve.elapsed = 0;
            valve.jumpAt = 0.8 + rng() * 1.4;
          } else {
            valve.level = 0;
            valve.phase = 'rising';
          }
          flashError(cardEls[i].card);
          if (destroyed || solved) return;
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
