/**
 * Aggancio Rotore (rotor_lock)
 * Premi LOCK due volte quando la lancetta passa nella zona verde per agganciare entrambi i perni.
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

  const zoneWidth = 54 + rng() * 8;
  let zoneCenter = rng() * 360;
  let dir = rng() < 0.5 ? 1 : -1;
  let speed = 150 + rng() * 30;
  let needleAngle = (zoneCenter + dir * (130 + rng() * 100) + 360) % 360;

  let pinsLocked = 0;
  let lastFrameTime = null;
  let lastPointerDown = -Infinity;
  let errorFlashUntil = 0;
  let successFlashUntil = 0;

  function normAngle(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function isNeedleInZone() {
    const diff = ((needleAngle - zoneCenter + 540) % 360) - 180;
    return Math.abs(diff) <= zoneWidth / 2;
  }

  container.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    .ovr-rl, .ovr-rl * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .ovr-rl {
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
      align-items: center;
      gap: 8px;
    }
    .ovr-rl-head {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .ovr-rl-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #00e5ff;
    }
    .ovr-rl-leds {
      display: flex;
      gap: 6px;
    }
    .ovr-rl-led {
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      border-radius: 4px;
      border: 1px solid rgba(255, 176, 0, 0.45);
      background: rgba(255, 176, 0, 0.08);
      color: #ffb000;
    }
    .ovr-rl-led.is-locked {
      border-color: #00ff66;
      background: rgba(0, 255, 102, 0.25);
      color: #00ff66;
      box-shadow: 0 0 10px rgba(0, 255, 102, 0.5);
    }
    .ovr-rl-dial-wrap {
      width: 206px;
      height: 206px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .ovr-rl-canvas {
      display: block;
      width: 206px;
      height: 206px;
    }
    .ovr-rl-status {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #ffb000;
      min-height: 18px;
      text-align: center;
    }
    .ovr-rl-status.is-ok {
      color: #00ff66;
    }
    .ovr-rl-status.is-err {
      color: #ff2a2a;
    }
    .ovr-rl-btn {
      width: 100%;
      min-height: 56px;
      margin: 0;
      padding: 10px;
      border-radius: 6px;
      border: 2px solid #00ff66;
      background: rgba(0, 255, 102, 0.14);
      color: #00ff66;
      font-family: inherit;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.14em;
      cursor: pointer;
      touch-action: none;
      transition: background 0.08s ease, border-color 0.08s ease, transform 0.06s ease;
    }
    .ovr-rl-btn:active {
      transform: scale(0.97);
    }
    .ovr-rl-btn.is-err {
      border-color: #ff2a2a;
      background: rgba(255, 42, 42, 0.28);
      color: #ff2a2a;
      box-shadow: 0 0 14px rgba(255, 42, 42, 0.55);
    }
    .ovr-rl-btn.is-ok {
      border-color: #00e5ff;
      background: rgba(0, 229, 255, 0.24);
      color: #00e5ff;
      box-shadow: 0 0 14px rgba(0, 229, 255, 0.55);
    }
  `;

  const root = document.createElement('div');
  root.className = 'ovr-rl';

  const head = document.createElement('div');
  head.className = 'ovr-rl-head';
  const titleEl = document.createElement('span');
  titleEl.className = 'ovr-rl-title';
  titleEl.textContent = 'ROTORE';

  const leds = document.createElement('div');
  leds.className = 'ovr-rl-leds';
  const led1 = document.createElement('span');
  led1.className = 'ovr-rl-led';
  led1.textContent = 'PERNO 1';
  const led2 = document.createElement('span');
  led2.className = 'ovr-rl-led';
  led2.textContent = 'PERNO 2';
  leds.append(led1, led2);
  head.append(titleEl, leds);

  const dialWrap = document.createElement('div');
  dialWrap.className = 'ovr-rl-dial-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'ovr-rl-canvas';
  dialWrap.appendChild(canvas);

  const statusEl = document.createElement('div');
  statusEl.className = 'ovr-rl-status';
  statusEl.textContent = 'PREMI LOCK NELLA ZONA VERDE';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ovr-rl-btn';
  btn.textContent = '[ LOCK ]';

  root.append(head, dialWrap, statusEl, btn);
  container.append(style, root);

  const ctx = canvas.getContext('2d');
  let dialSize = dialWrap.clientWidth || 206;
  let appliedDpr = 0;

  function syncCanvasSize() {
    const nextSize = dialWrap.clientWidth || 206;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (
      nextSize !== dialSize ||
      dpr !== appliedDpr ||
      canvas.width !== Math.round(nextSize * dpr)
    ) {
      dialSize = nextSize;
      appliedDpr = dpr;
      canvas.width = Math.round(dialSize * dpr);
      canvas.height = Math.round(dialSize * dpr);
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
  }
  syncCanvasSize();

  function degToRad(deg) {
    return ((deg - 90) * Math.PI) / 180;
  }

  function drawDial(now) {
    if (!ctx) return;
    syncCanvasSize();
    const SIZE = dialSize;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const radius = Math.round(SIZE * 0.4);
    const isErr = now < errorFlashUntil;
    const isOk = now < successFlashUntil;
    const inZone = isNeedleInZone();

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Sfondo quadrante
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 12, 0, Math.PI * 2);
    ctx.fillStyle = '#030805';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isErr ? 'rgba(255, 42, 42, 0.7)' : 'rgba(0, 255, 102, 0.28)';
    ctx.stroke();

    // Tacche radiali
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)';
    ctx.lineWidth = 1.5;
    for (let deg = 0; deg < 360; deg += 30) {
      const a = degToRad(deg);
      const r1 = radius - 12;
      const r2 = radius - 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }

    // Traccia circolare base
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.14)';
    ctx.stroke();

    // Zona verde
    const startRad = degToRad(zoneCenter - zoneWidth / 2);
    const endRad = degToRad(zoneCenter + zoneWidth / 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startRad, endRad);
    ctx.lineWidth = 16;
    ctx.strokeStyle = inZone ? '#00ff66' : 'rgba(0, 255, 102, 0.72)';
    ctx.shadowColor = 'rgba(0, 255, 102, 0.8)';
    ctx.shadowBlur = inZone ? 16 : 8;
    ctx.stroke();
    ctx.restore();

    // Lancetta rotante + scia
    const trailArc = 24;
    const nRad = degToRad(needleAngle);
    const trailStart = degToRad(needleAngle - dir * trailArc);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, dir > 0 ? trailStart : nRad, dir > 0 ? nRad : trailStart);
    ctx.lineWidth = 6;
    ctx.strokeStyle = isErr ? 'rgba(255, 42, 42, 0.55)' : 'rgba(0, 229, 255, 0.4)';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const nx = cx + Math.cos(nRad) * (radius + 6);
    const ny = cy + Math.sin(nRad) * (radius + 6);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = isErr ? '#ff2a2a' : inZone || isOk ? '#00ff66' : '#00e5ff';
    ctx.shadowColor = isErr ? '#ff2a2a' : '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // Mozzo centrale
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#050a07';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isErr ? '#ff2a2a' : '#00ff66';
    ctx.stroke();

    ctx.fillStyle = isErr ? '#ff2a2a' : '#00ff66';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pinsLocked}/2`, cx, cy + 1);
  }

  function advanceAngle(now) {
    if (lastFrameTime === null) {
      lastFrameTime = now;
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    needleAngle = normAngle(needleAngle + dir * speed * dt);
  }

  function handleLock() {
    if (destroyed || solved) return;
    const now = performance.now();
    advanceAngle(now);

    if (isNeedleInZone()) {
      pinsLocked += 1;
      successFlashUntil = now + 260;

      if (pinsLocked === 1) {
        led1.classList.add('is-locked');
        btn.classList.add('is-ok');
        statusEl.className = 'ovr-rl-status is-ok';
        statusEl.textContent = 'PERNO 1 AGGANCIATO — ANCORA 1!';

        dir *= -1;
        speed *= 1.08;
        zoneCenter = normAngle(needleAngle + dir * (135 + rng() * 85));

        trackTimeout(() => {
          btn.classList.remove('is-ok');
        }, 220);
      } else if (pinsLocked >= 2) {
        led2.classList.add('is-locked');
        solved = true;
        statusEl.className = 'ovr-rl-status is-ok';
        statusEl.textContent = 'ROTORE BLOCCATO!';
        drawDial(now);
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        onWin?.();
      }
    } else {
      errorFlashUntil = now + 350;
      btn.classList.add('is-err');
      statusEl.className = 'ovr-rl-status is-err';
      statusEl.textContent = 'FUORI ZONA — ERRORE!';
      drawDial(now);
      onMistake?.();
      if (!destroyed && !solved) {
        trackTimeout(() => {
          btn.classList.remove('is-err');
          statusEl.className = 'ovr-rl-status';
          statusEl.textContent = 'PREMI LOCK NELLA ZONA VERDE';
        }, 350);
      }
    }
  }

  function onPointerDown(e) {
    if (destroyed || solved) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    lastPointerDown = performance.now();
    handleLock();
  }

  function onClick() {
    if (destroyed || solved) return;
    if (performance.now() - lastPointerDown < 450) {
      return;
    }
    handleLock();
  }

  btn.addEventListener('pointerdown', onPointerDown);
  btn.addEventListener('click', onClick);

  function frame(now) {
    if (destroyed || solved) return;
    advanceAngle(now);
    drawDial(now);
    rafId = requestAnimationFrame(frame);
  }

  drawDial(performance.now());
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
    btn.removeEventListener('pointerdown', onPointerDown);
    btn.removeEventListener('click', onClick);
  };
}
