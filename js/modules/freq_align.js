import { pick } from '../prng.js';
import { t } from '../i18n.js';

const FREQ_TOLERANCE = 0.06;
const AMP_TOLERANCE = 0.075;
const LOCK_DURATION = 0.3;
const WAVE_TYPES = ['sine', 'square', 'triangle', 'sawtooth'];

const WAVE_META = {
  sine: {
    label: 'SIN',
    path: 'M1 6 Q3.5 1 5.5 6 T10 6 T14.5 6 T19 6',
  },
  square: {
    label: 'SQR',
    path: 'M1 9 V2 H6 V10 H11 V2 H16 V10 H19',
  },
  triangle: {
    label: 'TRI',
    path: 'M1 6 L3.5 2 L8 10 L12.5 2 L17 10 L19 6',
  },
  sawtooth: {
    label: 'SAW',
    path: 'M1 10 L7 2 V10 L13 2 V10 L19 2',
  },
};

/** Evaluate normalized waveform (-1..1) for the given phase angle and wave shape. */
function evalWaveShape(theta, waveType) {
  switch (waveType) {
    case 'square':
      return Math.tanh(Math.sin(theta) * 7);
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(theta));
    case 'sawtooth':
      return 2 * (((theta / (Math.PI * 2)) % 1 + 1) % 1) - 1;
    case 'sine':
    default:
      return Math.sin(theta);
  }
}

/** Build an inline SVG icon representing a waveform shape. */
function createWaveSvg(waveType) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 12');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '10');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ovr-fa-wave-svg');

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', WAVE_META[waveType].path);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/**
 * Allinea Frequenza (freq_align)
 * Regola frequenza orizzontale, ampiezza verticale (e forma d'onda nella variante)
 * finche' l'onda utente (verde) coincide con l'onda target tratteggiata (ambra).
 */
export function mount(container, rng, { onWin, onMistake: _onMistake } = {}) {
  let destroyed = false;
  let solved = false;
  let rafId = null;

  const variantIdx = Math.floor(rng() * 2); // 0 = classic (2 sliders), 1 = waveform (2 sliders + wave buttons)
  const variant = variantIdx === 1 ? 'waveform' : 'classic';

  function pickFarNorm(fromNorm, minBound = 0.1, maxBound = 0.9, gap = 0.24) {
    const intervals = [];
    if (fromNorm - gap >= minBound) intervals.push([minBound, fromNorm - gap]);
    if (fromNorm + gap <= maxBound) intervals.push([fromNorm + gap, maxBound]);
    const chosen = pick(rng, intervals) || [minBound, minBound + 0.12];
    return chosen[0] + rng() * (chosen[1] - chosen[0]);
  }

  const targetFreqNorm = 0.14 + rng() * 0.72;
  const initFreqNorm = pickFarNorm(targetFreqNorm, 0.08, 0.92, 0.24);
  const targetAmpNorm = 0.18 + rng() * 0.72;
  const initAmpNorm = pickFarNorm(targetAmpNorm, 0.1, 0.9, 0.26);
  const phase0 = rng() * Math.PI * 2;

  const targetWave = variant === 'waveform' ? pick(rng, WAVE_TYPES) : 'sine';
  let currentWave =
    variant === 'waveform'
      ? pick(
          rng,
          WAVE_TYPES.filter((w) => w !== targetWave)
        )
      : 'sine';

  let currentFreqNorm = initFreqNorm;
  let currentAmpNorm = initAmpNorm;
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
      padding: 8px;
      background: #050a07;
      border: 1px solid rgba(0, 255, 102, 0.35);
      border-radius: 6px;
      color: #00ff66;
      font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .ovr-fa-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .ovr-fa-title {
      color: #00e5ff;
    }
    .ovr-fa-freq {
      color: #00ff66;
    }
    .ovr-fa-scope-wrap {
      width: 100%;
      height: 132px;
      border: 1px solid rgba(0, 255, 102, 0.4);
      border-radius: 4px;
      background: #030805;
      overflow: hidden;
      position: relative;
    }
    .ovr-fa[data-variant="waveform"] .ovr-fa-scope-wrap {
      height: 114px;
    }
    .ovr-fa-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .ovr-fa-lock-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ovr-fa-lock-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
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
      height: 9px;
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
    .ovr-fa-wave-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .ovr-fa-wave-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 32px;
      padding: 0 3px;
      background: rgba(0, 255, 102, 0.08);
      border: 1px solid rgba(0, 255, 102, 0.4);
      border-radius: 4px;
      color: #9ff7bf;
      font-family: inherit;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
    }
    .ovr-fa-wave-btn.is-active {
      background: rgba(0, 229, 255, 0.22);
      border-color: #00e5ff;
      color: #00e5ff;
      box-shadow: 0 0 8px rgba(0, 229, 255, 0.45);
    }
    .ovr-fa-wave-svg {
      flex-shrink: 0;
      display: block;
    }
    .ovr-fa-ctrl {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 5px 6px;
      border-radius: 4px;
    }
    .ovr-fa-slider-row {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) 54px;
      align-items: center;
      gap: 6px;
    }
    .ovr-fa-slider-lbl {
      font-size: 10.5px;
      font-weight: 700;
      color: #ffb000;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .ovr-fa-slider-val {
      font-size: 10.5px;
      font-weight: 700;
      color: #00ff66;
      text-align: right;
      white-space: nowrap;
    }
    .ovr-fa-slider-row.is-match .ovr-fa-slider-lbl,
    .ovr-fa-slider-row.is-match .ovr-fa-slider-val {
      color: #00e5ff;
    }
    .ovr-fa-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 32px;
      background: transparent;
      margin: 0;
      cursor: pointer;
      touch-action: none;
    }
    .ovr-fa-slider:focus {
      outline: none;
    }
    .ovr-fa-slider::-webkit-slider-runnable-track {
      height: 10px;
      background: rgba(0, 255, 102, 0.14);
      border: 1px solid rgba(0, 255, 102, 0.5);
      border-radius: 5px;
    }
    .ovr-fa-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 26px;
      height: 28px;
      margin-top: -10px;
      border-radius: 4px;
      background: #00ff66;
      border: 2px solid #050a07;
      box-shadow: 0 0 10px rgba(0, 255, 102, 0.75);
    }
    .ovr-fa-slider::-moz-range-track {
      height: 10px;
      background: rgba(0, 255, 102, 0.14);
      border: 1px solid rgba(0, 255, 102, 0.5);
      border-radius: 5px;
    }
    .ovr-fa-slider::-moz-range-thumb {
      width: 26px;
      height: 28px;
      border-radius: 4px;
      background: #00ff66;
      border: 2px solid #050a07;
      box-shadow: 0 0 10px rgba(0, 255, 102, 0.75);
    }
  `;

  const root = document.createElement('div');
  root.className = variant === 'classic' ? 'ovr-fa' : 'ovr-fa ovr-variant-mode';
  root.dataset.variant = variant;

  if (variant === 'waveform') {
    const vBanner = document.createElement('div');
    vBanner.className = 'ovr-variant-banner';
    vBanner.textContent = t(
      '⚡ VARIANT: WAVEFORM + DUAL SLIDER — Match shape, freq & amp!',
      "⚡ VARIANTE: FORMA D'ONDA — Scegli la forma e regola frequenza e ampiezza!"
    );
    root.appendChild(vBanner);
  }

  const head = document.createElement('div');
  head.className = 'ovr-fa-head';
  const titleEl = document.createElement('span');
  titleEl.className = 'ovr-fa-title';
  titleEl.textContent = t('OSCILLOSCOPE', 'OSCILLOSCOPIO');
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
  stateEl.textContent = t('ALIGN TO TARGET', 'ALLINEA AL TARGET');
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

  const waveButtons = [];
  let waveRow = null;
  if (variant === 'waveform') {
    waveRow = document.createElement('div');
    waveRow.className = 'ovr-fa-wave-row';
    for (const type of WAVE_TYPES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ovr-fa-wave-btn' + (type === currentWave ? ' is-active' : '');
      btn.dataset.wave = type;
      btn.setAttribute('aria-pressed', type === currentWave ? 'true' : 'false');

      const txt = document.createElement('span');
      txt.textContent = WAVE_META[type].label;
      btn.append(createWaveSvg(type), txt);

      const onWaveClick = () => {
        if (destroyed || solved) return;
        currentWave = type;
        for (const item of waveButtons) {
          const active = item.type === currentWave;
          item.btn.classList.toggle('is-active', active);
          item.btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
      };
      btn.addEventListener('click', onWaveClick);
      waveButtons.push({ type, btn, onWaveClick });
      waveRow.appendChild(btn);
    }
  }

  function makeSliderRow(labelText, initNorm, ariaLabel) {
    const row = document.createElement('div');
    row.className = 'ovr-fa-slider-row';

    const lbl = document.createElement('span');
    lbl.className = 'ovr-fa-slider-lbl';
    lbl.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'ovr-fa-slider';
    input.min = '0';
    input.max = '1000';
    input.step = '1';
    input.value = String(Math.round(initNorm * 1000));
    input.setAttribute('aria-label', ariaLabel);

    const val = document.createElement('span');
    val.className = 'ovr-fa-slider-val';

    row.append(lbl, input, val);
    return { row, input, val };
  }

  const ctrl = document.createElement('div');
  ctrl.className = 'ovr-fa-ctrl';
  const freqCtrl = makeSliderRow(
    'FREQ ↔',
    initFreqNorm,
    t('Wave frequency', 'Frequenza onda')
  );
  const ampCtrl = makeSliderRow(
    'AMP ↕',
    initAmpNorm,
    t('Wave amplitude', 'Ampiezza onda')
  );
  ctrl.append(freqCtrl.row, ampCtrl.row);

  if (waveRow) {
    root.append(head, scopeWrap, lockRow, waveRow, ctrl);
  } else {
    root.append(head, scopeWrap, lockRow, ctrl);
  }
  container.append(style, root);

  const ctx = canvas.getContext('2d');
  let logicalW = 316;
  let logicalH = variant === 'waveform' ? 114 : 132;
  let appliedDpr = 0;

  function syncCanvasSize() {
    const w = scopeWrap.clientWidth || 316;
    const h = scopeWrap.clientHeight || (variant === 'waveform' ? 114 : 132);
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

  function updateReadout(freqOk = false, ampOk = false) {
    const hz = Math.round(20 + currentFreqNorm * 80);
    const ampPct = Math.round(20 + currentAmpNorm * 80);
    freqCtrl.val.textContent = `${hz} Hz`;
    ampCtrl.val.textContent = `${ampPct}%`;
    freqCtrl.row.classList.toggle('is-match', freqOk);
    ampCtrl.row.classList.toggle('is-match', ampOk);
    freqEl.textContent = `F:${hz}Hz · A:${ampPct}%`;
  }
  updateReadout();

  function readNorm(input) {
    return Math.max(0, Math.min(1, Number(input.value) / 1000));
  }

  function onSliderChange() {
    if (destroyed || solved) return;
    currentFreqNorm = readNorm(freqCtrl.input);
    currentAmpNorm = readNorm(ampCtrl.input);
    updateReadout(
      Math.abs(currentFreqNorm - targetFreqNorm) <= FREQ_TOLERANCE,
      Math.abs(currentAmpNorm - targetAmpNorm) <= AMP_TOLERANCE
    );
  }

  freqCtrl.input.addEventListener('input', onSliderChange);
  freqCtrl.input.addEventListener('change', onSliderChange);
  ampCtrl.input.addEventListener('input', onSliderChange);
  ampCtrl.input.addEventListener('change', onSliderChange);

  function sampleWave(xNorm, freqNorm, ampNorm, waveType, tSec, midY, maxAmp) {
    const cycles = 1.5 + freqNorm * 3.8;
    const theta = (xNorm - 0.5) * cycles * Math.PI * 2 + phase0 - tSec * 2.4;
    const amp = maxAmp * (0.24 + ampNorm * 0.76);
    return midY - amp * evalWaveShape(theta, waveType);
  }

  function drawScope(tSec, inTol) {
    if (!ctx) return;
    syncCanvasSize();
    const w = logicalW;
    const h = logicalH;
    const midY = h / 2;
    const maxAmp = h * 0.4;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#030805';
    ctx.fillRect(0, 0, w, h);

    // Oscilloscope grid
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

    // Center axis
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    const samples = Math.max(140, Math.floor(w));

    // Target trace (amber dashed)
    ctx.save();
    ctx.strokeStyle = '#ffb000';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const xNorm = i / samples;
      const x = xNorm * w;
      const y = sampleWave(xNorm, targetFreqNorm, targetAmpNorm, targetWave, tSec, midY, maxAmp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // User wave (green, or glowing cyan when locked in tolerance)
    ctx.save();
    ctx.strokeStyle = inTol ? '#00e5ff' : '#00ff66';
    ctx.lineWidth = inTol ? 3 : 2.5;
    ctx.shadowColor = inTol ? 'rgba(0, 229, 255, 0.8)' : 'rgba(0, 255, 102, 0.55)';
    ctx.shadowBlur = inTol ? 10 : 6;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const xNorm = i / samples;
      const x = xNorm * w;
      const y = sampleWave(xNorm, currentFreqNorm, currentAmpNorm, currentWave, tSec, midY, maxAmp);
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

    currentFreqNorm = readNorm(freqCtrl.input);
    currentAmpNorm = readNorm(ampCtrl.input);

    const freqOk = Math.abs(currentFreqNorm - targetFreqNorm) <= FREQ_TOLERANCE;
    const ampOk = Math.abs(currentAmpNorm - targetAmpNorm) <= AMP_TOLERANCE;
    const waveOk = currentWave === targetWave;
    const inTol = freqOk && ampOk && waveOk;

    updateReadout(freqOk, ampOk);

    if (inTol) {
      lockSeconds += dt;
      stateEl.className = 'ovr-fa-state is-locking';
      stateEl.textContent = t('IN PHASE — HOLD!', 'IN FASE — MANTIENI!');
    } else {
      lockSeconds = 0;
      stateEl.className = 'ovr-fa-state';
      stateEl.textContent =
        variant === 'waveform' && !waveOk
          ? t('MATCH SHAPE, FREQ & AMP', 'ABBINA FORMA, FREQ & AMP')
          : t('ALIGN FREQ & AMP', 'ALLINEA FREQ & AMP');
    }

    const pct = Math.min(100, Math.round((lockSeconds / LOCK_DURATION) * 100));
    barFill.style.width = `${pct}%`;
    lockPctEl.textContent = `LOCK: ${pct}%`;

    drawScope(activeTimeSec, inTol);

    if (lockSeconds >= LOCK_DURATION) {
      solved = true;
      barFill.style.width = '100%';
      lockPctEl.textContent = 'LOCK: 100%';
      stateEl.className = 'ovr-fa-state is-win';
      stateEl.textContent = t('FREQUENCY LOCKED', 'FREQUENZA AGGANCIATA');
      rafId = null;
      onWin?.();
      return;
    }

    rafId = requestAnimationFrame(frame);
  }

  drawScope(0, false);
  rafId = requestAnimationFrame(frame);

  return () => {
    destroyed = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    freqCtrl.input.removeEventListener('input', onSliderChange);
    freqCtrl.input.removeEventListener('change', onSliderChange);
    ampCtrl.input.removeEventListener('input', onSliderChange);
    ampCtrl.input.removeEventListener('change', onSliderChange);
    for (const item of waveButtons) {
      item.btn.removeEventListener('click', item.onWaveClick);
    }
  };
}
