import { pick } from '../prng.js';

const TOLERANCE = 0.04;
const LOCK_DURATION_SEC = 0.35;

/**
 * Allinea Frequenza (freq_align)
 * Allinea l'onda utente (verde) all'onda target tratteggiata (ambra)
 * e mantieni la tolleranza per 0.35s continui.
 */
export function mount(container, rng, { onWin, onMistake: _onMistake } = {}) {
  let destroyed = false;
  let solved = false;
  let rafId = null;

  const targetNorm = 0.12 + rng() * 0.76;
  const intervals = [];
  if (targetNorm - 0.24 >= 0.08) {
    intervals.push([0.08, targetNorm - 0.24]);
  }
  if (targetNorm + 0.24 <= 0.92) {
    intervals.push([targetNorm + 0.24, 0.92]);
  }
  const chosenInterval = pick(rng, intervals) || [0.08, 0.2];
  const initNorm = chosenInterval[0] + rng() * (chosenInterval[1] - chosenInterval[0]);
  const phase0 = rng() * Math.PI * 2;
  const harmonicWeight = 0.14 + rng() * 0.12;

  let currentNorm = initNorm;
  let lockSeconds = 0;
  let lastFrameTime = null;
  let startTime = null;

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-fa, .ovr-fa * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .ovr-fa {
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
      gap: 9px;
    }
    .ovr-fa-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .ovr-fa-title {
      color: #00e5ff;
    }
    .ovr-fa-freq {
      color: #00ff66;
    }
    .ovr-fa-scope-wrap {
      width: 100%;
      height: 190px;
      border: 1px solid rgba(0, 255, 102, 0.4);
      border-radius: 4px;
      background: #030805;
      overflow: hidden;
      position: relative;
    }
    .ovr-fa-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .ovr-fa-lock-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ovr-fa-lock-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .ovr-fa-state {
      color: #ffb000;
    }
    .ovr-fa-state.is-locking {
      color: #00e5ff;
    }
    .ovr-fa-state.is-win {
      color: #00ff66;
    }
    .ovr-fa-lock-pct {
      color: #00e5ff;
    }
    .ovr-fa-bar {
      width: 100%;
      height: 10px;
      background: rgba(0, 255, 102, 0.09);
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 4px;
      overflow: hidden;
    }
    .ovr-fa-bar-fill {
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #00e5ff, #00ff66);
      box-shadow: 0 0 10px rgba(0, 229, 255, 0.65);
    }
    .ovr-fa-ctrl {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 4px 2px 2px;
    }
    .ovr-fa-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 48px;
      background: transparent;
      margin: 0;
      cursor: pointer;
      touch-action: none;
    }
    .ovr-fa-slider:focus {
      outline: none;
    }
    .ovr-fa-slider::-webkit-slider-runnable-track {
      height: 12px;
      background: rgba(0, 255, 102, 0.14);
      border: 1px solid rgba(0, 255, 102, 0.5);
      border-radius: 6px;
    }
    .ovr-fa-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 34px;
      height: 40px;
      margin-top: -15px;
      border-radius: 5px;
      background: #00ff66;
      border: 2px solid #050a07;
      box-shadow: 0 0 12px rgba(0, 255, 102, 0.75);
    }
    .ovr-fa-slider::-moz-range-track {
      height: 12px;
      background: rgba(0, 255, 102, 0.14);
      border: 1px solid rgba(0, 255, 102, 0.5);
      border-radius: 6px;
    }
    .ovr-fa-slider::-moz-range-thumb {
      width: 34px;
      height: 40px;
      border-radius: 5px;
      background: #00ff66;
      border: 2px solid #050a07;
      box-shadow: 0 0 12px rgba(0, 255, 102, 0.75);
    }
    .ovr-fa-scale {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      color: rgba(0, 255, 102, 0.6);
      letter-spacing: 0.04em;
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-fa';

  const head = document.createElement('div');
  head.className = 'ovr-fa-head';
  const titleEl = document.createElement('span');
  titleEl.className = 'ovr-fa-title';
  titleEl.textContent = 'OSCILLOSCOPIO';
  const freqEl = document.createElement('span');
  freqEl.className = 'ovr-fa-freq';
  head.append(titleEl, freqEl);

  const scopeWrap = document.createElement('div');
  scopeWrap.className = 'ovr-fa-scope-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'ovr-fa-canvas';
  scopeWrap.appendChild(canvas);

  const lockRow = document.createElement('div');
  lockRow.className = 'ovr-fa-lock-row';
  const lockHead = document.createElement('div');
  lockHead.className = 'ovr-fa-lock-head';
  const stateEl = document.createElement('span');
  stateEl.className = 'ovr-fa-state';
  stateEl.textContent = 'ALLINEA AL TARGET';
  const lockPctEl = document.createElement('span');
  lockPctEl.className = 'ovr-fa-lock-pct';
  lockPctEl.textContent = 'LOCK: 0%';
  lockHead.append(stateEl, lockPctEl);

  const bar = document.createElement('div');
  bar.className = 'ovr-fa-bar';
  const barFill = document.createElement('div');
  barFill.className = 'ovr-fa-bar-fill';
  bar.appendChild(barFill);
  lockRow.append(lockHead, bar);

  const ctrl = document.createElement('div');
  ctrl.className = 'ovr-fa-ctrl';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'ovr-fa-slider';
  slider.min = '0';
  slider.max = '1000';
  slider.step = '1';
  slider.value = String(Math.round(initNorm * 1000));
  slider.setAttribute('aria-label', 'Frequenza onda');

  const scale = document.createElement('div');
  scale.className = 'ovr-fa-scale';
  const minLbl = document.createElement('span');
  minLbl.textContent = '20.0 Hz';
  const midLbl = document.createElement('span');
  midLbl.textContent = 'TARGET: AMBRA';
  const maxLbl = document.createElement('span');
  maxLbl.textContent = '100.0 Hz';
  scale.append(minLbl, midLbl, maxLbl);

  ctrl.append(slider, scale);
  root.append(head, scopeWrap, lockRow, ctrl);
  container.append(style, root);

  const ctx = canvas.getContext('2d');
  let logicalW = 316;
  let logicalH = 190;
  let appliedDpr = 0;

  function syncCanvasSize() {
    const w = scopeWrap.clientWidth || 316;
    const h = scopeWrap.clientHeight || 190;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== logicalW || h !== logicalH || dpr !== appliedDpr || canvas.width !== Math.round(w * dpr)) {
      logicalW = w;
      logicalH = h;
      appliedDpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
  }

  function updateReadout() {
    const hz = 20 + currentNorm * 80;
    freqEl.textContent = `FREQ: ${hz.toFixed(1)} Hz`;
  }
  updateReadout();

  function onSliderChange() {
    if (destroyed || solved) return;
    currentNorm = Math.max(0, Math.min(1, Number(slider.value) / 1000));
    updateReadout();
  }

  slider.addEventListener('input', onSliderChange);
  slider.addEventListener('change', onSliderChange);

  function sampleWave(xNorm, normVal, tSec, midY, amp) {
    const cycles = 1.6 + normVal * 4.4;
    const theta = (xNorm - 0.5) * cycles * Math.PI * 2 + phase0 - tSec * 2.8;
    const signal = (1 - harmonicWeight) * Math.sin(theta) + harmonicWeight * Math.sin(2 * theta);
    return midY - amp * signal;
  }

  function drawScope(tSec, inTol) {
    if (!ctx) return;
    syncCanvasSize();
    const w = logicalW;
    const h = logicalH;
    const midY = h / 2;
    const amp = h * 0.34;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#030805';
    ctx.fillRect(0, 0, w, h);

    // Griglia oscilloscopio
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const cols = 8;
    const rows = 4;
    for (let c = 1; c < cols; c++) {
      const gx = (w / cols) * c;
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
    }
    for (let r = 1; r < rows; r++) {
      const gy = (h / rows) * r;
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
    }
    ctx.stroke();

    // Asse centrale
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    const samples = Math.max(80, Math.floor(w / 2));

    // Onda target tratteggiata (ambra)
    ctx.save();
    ctx.strokeStyle = '#ffb000';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const xNorm = i / samples;
      const x = xNorm * w;
      const y = sampleWave(xNorm, targetNorm, tSec, midY, amp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Onda utente continua (verde / ciano in tolleranza)
    ctx.save();
    ctx.strokeStyle = inTol ? '#00e5ff' : '#00ff66';
    ctx.lineWidth = inTol ? 3 : 2.5;
    ctx.shadowColor = inTol ? 'rgba(0, 229, 255, 0.8)' : 'rgba(0, 255, 102, 0.55)';
    ctx.shadowBlur = inTol ? 10 : 6;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const xNorm = i / samples;
      const x = xNorm * w;
      const y = sampleWave(xNorm, currentNorm, tSec, midY, amp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  let activeTimeSec = 0;

  function frame(now) {
    if (destroyed || solved) return;
    if (startTime === null) {
      startTime = now;
      lastFrameTime = now;
    }
    const paused = typeof window !== 'undefined' && Boolean(window.__OVERRIDLE_PAUSED__);
    const dt = paused ? 0 : Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    activeTimeSec += dt;

    if (paused) {
      rafId = requestAnimationFrame(frame);
      return;
    }

    currentNorm = Math.max(0, Math.min(1, Number(slider.value) / 1000));
    updateReadout();

    const inTol = Math.abs(currentNorm - targetNorm) <= TOLERANCE;
    if (inTol) {
      lockSeconds += dt;
      stateEl.className = 'ovr-fa-state is-locking';
      stateEl.textContent = 'IN FASE — MANTIENI!';
    } else {
      lockSeconds = 0;
      stateEl.className = 'ovr-fa-state';
      stateEl.textContent = 'ALLINEA AL TARGET';
    }

    const pct = Math.min(100, Math.round((lockSeconds / LOCK_DURATION_SEC) * 100));
    barFill.style.width = `${pct}%`;
    lockPctEl.textContent = `LOCK: ${pct}%`;

    drawScope(activeTimeSec, inTol);

    if (lockSeconds >= LOCK_DURATION_SEC) {
      solved = true;
      barFill.style.width = '100%';
      lockPctEl.textContent = 'LOCK: 100%';
      stateEl.className = 'ovr-fa-state is-win';
      stateEl.textContent = 'FREQUENZA AGGANCIATA';
      rafId = null;
      onWin?.();
      return;
    }

    rafId = requestAnimationFrame(frame);
  }

  drawScope(0, Math.abs(currentNorm - targetNorm) <= TOLERANCE);
  rafId = requestAnimationFrame(frame);

  return () => {
    destroyed = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    slider.removeEventListener('input', onSliderChange);
    slider.removeEventListener('change', onSliderChange);
  };
}
