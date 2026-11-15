/**
 * Spurgo Pressione (pressure_purge)
 * Tieni premuto PURGE per far salire la pressione e rilascia dentro la fascia verde mobile.
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

  const variantIdx = Math.floor(rng() * 3); // 0 = classic, 1 = two_stage, 2 = precision
  const variant = variantIdx === 1 ? 'two_stage' : variantIdx === 2 ? 'precision' : 'classic';
  const totalStages = variant === 'two_stage' ? 2 : 1;
  let stage = 1;

  const zoneWidth = variant === 'precision' ? 13 + rng() * 2 : 22 + rng() * 4;
  const fixedCenter = 45 + rng() * 30;
  const period = 2.2 + rng() * 0.6;
  let phase0 = rng() * Math.PI * 2;
  const fillRate = 58 + rng() * 6;

  let pressure = 0;
  let holding = false;
  let activePointerId = null;
  let errorFlashUntil = 0;
  let startTime = null;
  let lastFrameTime = null;

  function getZoneBounds(elapsedSec) {
    const center =
      variant === 'precision'
        ? fixedCenter
        : 50 + 22 * Math.sin((2 * Math.PI * elapsedSec) / period + phase0);
    return {
      min: center - zoneWidth / 2,
      max: center + zoneWidth / 2
    };
  }

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-pp, .ovr-pp * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
    }
    .ovr-pp {
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
      gap: 10px;
    }
    .ovr-pp.is-error {
      border-color: #ff2a2a;
      box-shadow: inset 0 0 20px rgba(255, 42, 42, 0.28);
    }
    .ovr-pp-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(0, 255, 102, 0.25);
    }
    .ovr-pp-title {
      color: #00e5ff;
    }
    .ovr-pp-badge {
      color: #ffb000;
    }
    .ovr-pp-badge.is-zone {
      color: #00ff66;
    }
    .ovr-pp-badge.is-err {
      color: #ff2a2a;
    }
    .ovr-pp-body {
      display: flex;
      align-items: stretch;
      justify-content: center;
      gap: 14px;
      height: 214px;
    }
    .ovr-pp-scale {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 10px;
      color: rgba(0, 255, 102, 0.55);
      text-align: right;
      padding: 2px 0;
      width: 30px;
      flex: 0 0 auto;
    }
    .ovr-pp-tube {
      position: relative;
      width: 90px;
      height: 100%;
      background: #030805;
      border: 2px solid rgba(0, 255, 102, 0.45);
      border-radius: 6px;
      overflow: hidden;
      flex: 0 0 auto;
    }
    .ovr-pp-zone {
      position: absolute;
      left: 0;
      right: 0;
      background: rgba(0, 255, 102, 0.2);
      border-top: 2px dashed #00ff66;
      border-bottom: 2px dashed #00ff66;
      box-shadow: inset 0 0 12px rgba(0, 255, 102, 0.25);
      pointer-events: none;
    }
    .ovr-pp-fill {
      position: absolute;
      left: 6px;
      right: 6px;
      bottom: 0;
      height: 0%;
      background: rgba(255, 176, 0, 0.55);
      border-top: 3px solid #ffb000;
      box-shadow: 0 0 10px rgba(255, 176, 0, 0.5);
      pointer-events: none;
    }
    .ovr-pp-fill.is-zone {
      background: rgba(0, 229, 255, 0.55);
      border-top-color: #00e5ff;
      box-shadow: 0 0 14px rgba(0, 229, 255, 0.75);
    }
    .ovr-pp-fill.is-max {
      background: rgba(255, 42, 42, 0.6);
      border-top-color: #ff2a2a;
      box-shadow: 0 0 14px rgba(255, 42, 42, 0.8);
    }
    .ovr-pp-needle {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0%;
      height: 3px;
      transform: translateY(1.5px);
      background: #ffb000;
      box-shadow: 0 0 8px #ffb000;
      pointer-events: none;
    }
    .ovr-pp-needle.is-zone {
      background: #00ff66;
      box-shadow: 0 0 10px #00ff66;
    }
    .ovr-pp-needle.is-max {
      background: #ff2a2a;
      box-shadow: 0 0 10px #ff2a2a;
    }
    .ovr-pp-info {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 0;
    }
    .ovr-pp-card {
      padding: 8px 10px;
      background: rgba(0, 255, 102, 0.05);
      border: 1px solid rgba(0, 255, 102, 0.25);
      border-radius: 5px;
    }
    .ovr-pp-lbl {
      font-size: 10px;
      color: rgba(0, 255, 102, 0.65);
      letter-spacing: 0.08em;
      margin-bottom: 3px;
    }
    .ovr-pp-val {
      font-size: 24px;
      font-weight: 700;
      color: #ffb000;
      line-height: 1.1;
    }
    .ovr-pp-val.is-zone {
      color: #00ff66;
    }
    .ovr-pp-val.is-max {
      color: #ff2a2a;
    }
    .ovr-pp-range {
      font-size: 15px;
      font-weight: 700;
      color: #00ff66;
    }
    .ovr-pp-led {
      padding: 8px;
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      border-radius: 4px;
      border: 1px solid rgba(255, 176, 0, 0.4);
      background: rgba(255, 176, 0, 0.08);
      color: #ffb000;
    }
    .ovr-pp-led.is-zone {
      border-color: #00ff66;
      background: rgba(0, 255, 102, 0.22);
      color: #00ff66;
      box-shadow: 0 0 12px rgba(0, 255, 102, 0.45);
    }
    .ovr-pp-led.is-err {
      border-color: #ff2a2a;
      background: rgba(255, 42, 42, 0.25);
      color: #ff2a2a;
    }
    .ovr-pp-btn {
      width: 100%;
      min-height: 62px;
      padding: 10px 12px;
      margin: 0;
      border: 2px solid #00ff66;
      border-radius: 6px;
      background: rgba(0, 255, 102, 0.12);
      color: #00ff66;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      touch-action: none;
      transition: background 0.08s ease, border-color 0.08s ease, transform 0.06s ease;
    }
    .ovr-pp-btn.is-holding {
      background: rgba(0, 229, 255, 0.24);
      border-color: #00e5ff;
      color: #00e5ff;
      box-shadow: 0 0 16px rgba(0, 229, 255, 0.45);
      transform: scale(0.98);
    }
    .ovr-pp-btn.is-zone {
      background: rgba(0, 255, 102, 0.3);
      border-color: #00ff66;
      color: #00ff66;
      box-shadow: 0 0 18px rgba(0, 255, 102, 0.65);
    }
  `;

  const root = document.createElement('div');
  root.className = variant === 'classic' ? 'ovr-pp' : 'ovr-pp ovr-variant-mode';
  root.dataset.variant = variant;

  if (variant !== 'classic') {
    const vBanner = document.createElement('div');
    vBanner.className = 'ovr-variant-banner';
    vBanner.textContent =
      variant === 'two_stage'
        ? '⚡ VARIANTE: 2 STADI — Completa 2 spurghi di fila!'
        : '⚡ VARIANTE: PRECISIONE — Fascia verde fissa e stretta!';
    root.appendChild(vBanner);
  }

  const head = document.createElement('div');
  head.className = 'ovr-pp-head';
  const titleEl = document.createElement('span');
  titleEl.className = 'ovr-pp-title';
  titleEl.textContent = variant === 'two_stage' ? 'SPURGO (1/2)' : 'SPURGO PRESSIONE';
  const badgeEl = document.createElement('span');
  badgeEl.className = 'ovr-pp-badge';
  badgeEl.textContent = 'PRONTO';
  head.append(titleEl, badgeEl);

  const body = document.createElement('div');
  body.className = 'ovr-pp-body';

  const scale = document.createElement('div');
  scale.className = 'ovr-pp-scale';
  for (const label of ['100', '75', '50', '25', '0']) {
    const s = document.createElement('span');
    s.textContent = label;
    scale.appendChild(s);
  }

  const tube = document.createElement('div');
  tube.className = 'ovr-pp-tube';
  const zoneEl = document.createElement('div');
  zoneEl.className = 'ovr-pp-zone';
  const fillEl = document.createElement('div');
  fillEl.className = 'ovr-pp-fill';
  const needleEl = document.createElement('div');
  needleEl.className = 'ovr-pp-needle';
  tube.append(zoneEl, fillEl, needleEl);

  const info = document.createElement('div');
  info.className = 'ovr-pp-info';

  const pCard = document.createElement('div');
  pCard.className = 'ovr-pp-card';
  const pLbl = document.createElement('div');
  pLbl.className = 'ovr-pp-lbl';
  pLbl.textContent = 'PRESSIONE';
  const pVal = document.createElement('div');
  pVal.className = 'ovr-pp-val';
  pVal.textContent = '0%';
  pCard.append(pLbl, pVal);

  const zCard = document.createElement('div');
  zCard.className = 'ovr-pp-card';
  const zLbl = document.createElement('div');
  zLbl.className = 'ovr-pp-lbl';
  zLbl.textContent = 'FASCIA VERDE';
  const zRange = document.createElement('div');
  zRange.className = 'ovr-pp-range';
  zCard.append(zLbl, zRange);

  const ledEl = document.createElement('div');
  ledEl.className = 'ovr-pp-led';
  ledEl.textContent = 'TIENI PREMUTO';

  info.append(pCard, zCard, ledEl);
  body.append(scale, tube, info);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ovr-pp-btn';
  btn.textContent = '[ TIENI PREMUTO: PURGE ]';

  root.append(head, body, btn);
  container.append(style, root);

  let activeElapsedSec = 0;

  function getElapsedSec() {
    return activeElapsedSec;
  }

  function render(now) {
    const elapsedSec = getElapsedSec(now);
    const zone = getZoneBounds(elapsedSec);
    const inZone = pressure >= zone.min && pressure <= zone.max;
    const atMax = pressure >= 100;
    const isErr = now < errorFlashUntil;

    zoneEl.style.bottom = `${zone.min.toFixed(2)}%`;
    zoneEl.style.height = `${zoneWidth.toFixed(2)}%`;

    fillEl.style.height = `${pressure.toFixed(2)}%`;
    needleEl.style.bottom = `${pressure.toFixed(2)}%`;

    pVal.textContent = `${Math.round(pressure)}%`;
    zRange.textContent = `${Math.round(zone.min)}% - ${Math.round(zone.max)}%`;

    fillEl.classList.toggle('is-zone', inZone && !atMax);
    fillEl.classList.toggle('is-max', atMax);
    needleEl.classList.toggle('is-zone', inZone && !atMax);
    needleEl.classList.toggle('is-max', atMax);

    pVal.classList.toggle('is-zone', inZone && !atMax);
    pVal.classList.toggle('is-max', atMax);

    btn.classList.toggle('is-holding', holding);
    btn.classList.toggle('is-zone', holding && inZone);

    if (isErr) {
      badgeEl.className = 'ovr-pp-badge is-err';
      badgeEl.textContent = 'FUORI ZONA!';
      ledEl.className = 'ovr-pp-led is-err';
      ledEl.textContent = 'ERRORE — RIPROVA';
    } else if (atMax && holding) {
      badgeEl.className = 'ovr-pp-badge is-err';
      badgeEl.textContent = 'SOVRAPRESSIONE!';
      ledEl.className = 'ovr-pp-led is-err';
      ledEl.textContent = 'MAX 100% — RILASCIA';
    } else if (holding && inZone) {
      badgeEl.className = 'ovr-pp-badge is-zone';
      badgeEl.textContent = 'IN FASCIA!';
      ledEl.className = 'ovr-pp-led is-zone';
      ledEl.textContent = 'RILASCIA ORA!';
    } else if (holding) {
      badgeEl.className = 'ovr-pp-badge';
      badgeEl.textContent = 'CARICA...';
      ledEl.className = 'ovr-pp-led';
      ledEl.textContent = 'ATTENDI ZONA VERDE';
    } else {
      badgeEl.className = 'ovr-pp-badge';
      badgeEl.textContent = 'PRONTO';
      ledEl.className = 'ovr-pp-led';
      ledEl.textContent = 'TIENI PREMUTO PURGE';
    }
  }

  function frame(now) {
    if (destroyed || solved) return;
    if (startTime === null) {
      startTime = now;
      lastFrameTime = now;
    }
    const paused = typeof window !== 'undefined' && Boolean(window.__OVERRIDLE_PAUSED__);
    const dt = paused ? 0 : Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    activeElapsedSec += dt;

    if (paused) {
      if (holding) {
        holding = false;
        activePointerId = null;
        pressure = 0;
        btn.textContent = '[ TIENI PREMUTO: PURGE ]';
        render(now);
      }
      rafId = requestAnimationFrame(frame);
      return;
    }

    if (holding) {
      pressure = Math.min(100, pressure + fillRate * dt);
    }

    render(now);
    rafId = requestAnimationFrame(frame);
  }

  function handlePointerDown(e) {
    if (destroyed || solved || (typeof window !== 'undefined' && window.__OVERRIDLE_PAUSED__)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (holding) return;
    holding = true;
    activePointerId = e.pointerId ?? null;
    try {
      if (e.pointerId !== undefined && btn.setPointerCapture) {
        btn.setPointerCapture(e.pointerId);
      }
    } catch {
      // Ignora se pointer capture non disponibile
    }
    btn.textContent = '[ RILASCIA NELLA FASCIA VERDE ]';
    render(performance.now());
  }

  function releasePurge(e) {
    if (destroyed || solved || !holding) return;
    if (activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) {
      return;
    }
    const now = performance.now();
    if (lastFrameTime !== null && now > lastFrameTime) {
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      pressure = Math.min(100, pressure + fillRate * dt);
      lastFrameTime = now;
    }
    holding = false;
    activePointerId = null;
    btn.textContent = '[ TIENI PREMUTO: PURGE ]';

    const zone = getZoneBounds(getElapsedSec(now));
    if (pressure >= zone.min && pressure <= zone.max) {
      if (stage < totalStages) {
        stage += 1;
        pressure = 0;
        phase0 = (phase0 + Math.PI * 0.85) % (Math.PI * 2);
        titleEl.textContent = `SPURGO (${stage}/${totalStages})`;
        badgeEl.className = 'ovr-pp-badge is-zone';
        badgeEl.textContent = 'STADIO 1 OK';
        ledEl.className = 'ovr-pp-led is-zone';
        ledEl.textContent = 'RIPETI PER STADIO 2!';
        render(now);
        return;
      }
      solved = true;
      badgeEl.className = 'ovr-pp-badge is-zone';
      badgeEl.textContent = 'SPURGO OK';
      ledEl.className = 'ovr-pp-led is-zone';
      ledEl.textContent = 'PRESSIONE SCARICATA';
      btn.classList.remove('is-holding');
      btn.classList.add('is-zone');
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      onWin?.();
      return;
    }

    errorFlashUntil = now + 400;
    root.classList.add('is-error');
    pressure = 0;
    render(now);
    onMistake?.();
    if (!destroyed && !solved) {
      trackTimeout(() => {
        root.classList.remove('is-error');
      }, 400);
    }
  }

  function cancelHold(e) {
    if (!holding) return;
    if (activePointerId !== null && e && e.pointerId !== undefined && e.pointerId !== activePointerId) {
      return;
    }
    holding = false;
    activePointerId = null;
    pressure = 0;
    btn.textContent = '[ TIENI PREMUTO: PURGE ]';
    render(performance.now());
  }

  function preventContextMenu(e) {
    e.preventDefault();
  }

  btn.addEventListener('pointerdown', handlePointerDown);
  btn.addEventListener('pointerup', releasePurge);
  btn.addEventListener('pointercancel', cancelHold);
  btn.addEventListener('contextmenu', preventContextMenu);
  window.addEventListener('pointerup', releasePurge);
  window.addEventListener('pointercancel', cancelHold);
  window.addEventListener('blur', cancelHold);

  render(performance.now());
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
    btn.removeEventListener('pointerdown', handlePointerDown);
    btn.removeEventListener('pointerup', releasePurge);
    btn.removeEventListener('pointercancel', cancelHold);
    btn.removeEventListener('contextmenu', preventContextMenu);
    window.removeEventListener('pointerup', releasePurge);
    window.removeEventListener('pointercancel', cancelHold);
    window.removeEventListener('blur', cancelHold);
  };
}
