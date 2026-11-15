/**
 * 16-bit Preview Enhancer & Containment Room Animator
 * Runs alongside untouched js/engine.js via DOM observers and window.__OVERRIDLE_DEBUG__.
 */

const W = 320;
const H = 88;
const FLOOR_Y = 74;

function renderPixelHeartSvg(filled) {
  const fill = filled ? '#ff2a55' : '#3a3d5c';
  const shade = filled ? '#b51237' : '#262840';
  const hi = filled ? '#ff9ebb' : '#565a82';
  return `<svg class="pixel-heart ${filled ? 'is-full' : 'is-empty'}" viewBox="0 0 11 10" width="22" height="20" aria-hidden="true">
    <path fill="#11101f" d="M2 0h2v1h1v1h1V1h1V0h2v1h1v1h1v3h-1v1H9v1H8v1H7v1H6v1H5V9H4V8H3V7H2V6H1V5H0V2h1V1h1V0z"/>
    <path fill="${fill}" d="M2 1h2v1h1v1h1V2h1V1h2v1h1v3H9v1H8v1H7v1H6v1H5V8H4V7H3V6H2V5H1V2h1V1z"/>
    <path fill="${shade}" d="M9 2h1v3H9v1H8v1H7v1H6v1H5V8h1V7h1V6h1V5h1V2z"/>
    <rect fill="${hi}" x="2" y="2" width="2" height="1"/>
    <rect fill="${hi}" x="2" y="3" width="1" height="1"/>
  </svg>`;
}

function enhanceLivesDisplay() {
  const el = document.getElementById('lives-display');
  if (!el) return;

  const apply = () => {
    if (el.querySelector('.pixel-heart')) return;
    const text = el.textContent || '';
    let count = (text.match(/❤️|❤/g) || []).length;
    if (text.trim() === '' && window.__OVERRIDLE_DEBUG__) {
      count = window.__OVERRIDLE_DEBUG__.lives;
    }
    const safe = Math.max(0, Math.min(3, count));
    let html = '';
    for (let i = 0; i < 3; i++) {
      html += renderPixelHeartSvg(i < safe);
    }
    el.innerHTML = html;
  };

  apply();
  const obs = new MutationObserver(apply);
  obs.observe(el, { childList: true, characterData: true, subtree: true });
}

function renderPixelLedSvg() {
  return `<svg class="pixel-led-arrow" viewBox="0 0 7 4" width="10" height="6" aria-hidden="true">
    <path fill="#0d0d1a" d="M0 0h7v1H6v1H5v1H4v1H3V3H2V2H1V1H0V0z"/>
    <path fill="#00f0ff" d="M1 0h5v1H5v1H4v1H3V2H2V1H1V0z"/>
  </svg><svg class="pixel-led" viewBox="0 0 11 11" width="16" height="16" aria-hidden="true">
    <path class="led-outline" fill="#0d0d1a" d="M3 0h5v1h2v2h1v5h-1v2H8v1H3v-1H1V8H0V3h1V1h2V0z"/>
    <path class="led-bezel" fill="#4d5380" d="M3 1h5v1h1v1h1v5H9v1H8v1H3V9H2V8H1V3h1V2h1V1z"/>
    <path class="led-body" fill="#2b2e47" d="M3 2h5v1h1v5H8v1H3V8H2V3h1V2z"/>
    <path class="led-shade" fill="#1d1f33" d="M8 3h1v5H8v1H3V8h4V7h1V3z"/>
    <rect class="led-hi" fill="#6e75ab" x="3" y="3" width="2" height="2"/>
  </svg>`;
}

function enhanceRoundIndicators() {
  const leds = document.querySelectorAll('#round-indicators .round-led');
  leds.forEach((led, idx) => {
    led.dataset.num = String(idx + 1);
    led.innerHTML = renderPixelLedSvg();
  });
}

function enhanceModuleMeta() {
  const el = document.getElementById('module-meta');
  if (!el) return;

  const clean = () => {
    const raw = (el.textContent || '').trim();
    const sep = raw.indexOf('•');
    if (sep !== -1) {
      const title = raw.slice(sep + 1).trim();
      if (title && el.textContent !== title) {
        el.textContent = title;
      }
    }
  };

  clean();
  const obs = new MutationObserver(clean);
  obs.observe(el, { childList: true, characterData: true, subtree: true });
}

function loadPixelAsset(src, onLoad) {
  const asset = { img: new Image(), ready: false };
  asset.img.onload = () => {
    asset.ready = true;
    if (onLoad) onLoad(asset.img);
  };
  asset.img.src = src;
  return asset;
}

function initContainmentAnimator() {
  const stage = document.getElementById('containment-stage');
  const canvas = document.getElementById('containment-canvas');
  const practiceScreen = document.getElementById('screen-practice');
  if (!stage || !canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let podFlashCanvas = null;
  const assets = {
    tunnel: loadPixelAsset('./assets/tunnel-loop-bg.jpg'),
    trivmount: loadPixelAsset('./assets/trivmount-bunker-bg.jpg'),
    pod: loadPixelAsset('./assets/hover-pod.png', (img) => {
      const off = document.createElement('canvas');
      off.width = img.naturalWidth || 58;
      off.height = img.naturalHeight || 27;
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.drawImage(img, 0, 0);
      octx.globalCompositeOperation = 'source-atop';
      octx.fillStyle = 'rgba(255, 68, 96, 0.72)';
      octx.fillRect(0, 0, off.width, off.height);
      podFlashCanvas = off;
    }),
    wreck: loadPixelAsset('./assets/hover-pod-wreck.png'),
    door: loadPixelAsset('./assets/blast-door.png'),
  };

  let animTime = 0;
  let lastTs = 0;
  let scrollX = 0;
  let scrollSpeed = 30;
  let podX = 76;
  let podY = 37;

  let prevMode = 'STANDBY';
  let prevLives = 3;
  let prevRound = 0;

  let hitTimer = 0;
  let smokeSpawnAccum = 0;
  let stateTimer = 0;

  // Passing unlocked blast door & upcoming locked blast door
  let doorX = 360;
  let passingDoor = null; // { x, openFrac, slideSpeed }
  let shakeTimer = 0;

  const particles = [];

  function spawnSpark(x, y, vx, vy, color, life = 0.45, size = 1) {
    if (particles.length >= 64) particles.shift();
    particles.push({ kind: 'spark', x, y, vx, vy, life, maxLife: life, color, size, gravity: 95 });
  }

  function spawnSmoke(x, y, vx, vy, size = 3, life = 0.9, ember = false) {
    if (particles.length >= 64) particles.shift();
    particles.push({ kind: 'smoke', x, y, vx, vy, life, maxLife: life, size, ember, gravity: -8 });
  }

  function spawnExplosion(cx, cy) {
    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.3;
      const spd = 28 + Math.random() * 68;
      const col = i % 3 === 0 ? '#fff7b2' : i % 3 === 1 ? '#ff8c1a' : '#7b87a8';
      spawnSpark(cx, cy, Math.cos(ang) * spd, Math.sin(ang) * spd - 22, col, 0.55 + Math.random() * 0.4, i % 4 === 0 ? 2 : 1);
    }
    for (let i = 0; i < 8; i++) {
      spawnSmoke(cx + (Math.random() - 0.5) * 18, cy + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 18, -14 - Math.random() * 14, 4 + Math.floor(Math.random() * 3), 1.0);
    }
  }

  function drawBlastDoor(dx, openFrac, status, t) {
    const x = Math.round(dx);
    if (!assets.door.ready) {
      const h = Math.max(0, 72 - Math.round(openFrac * 58));
      if (h > 4) {
        ctx.fillStyle = '#38465e';
        ctx.fillRect(x, 4, 24, h);
        ctx.fillStyle = status === 'open' ? '#2ce8a2' : '#ff2a55';
        ctx.fillRect(x + 11, Math.min(40, h - 4), 2, 6);
      }
      return;
    }

    const img = assets.door.img;
    const dw = img.naturalWidth || 26;
    const dh = img.naturalHeight || 72;
    const slideY = Math.round(openFrac * 58);
    const ceilingY = 4;
    const dstY = 77 - dh - slideY;
    const clipTop = Math.max(0, ceilingY - dstY);
    const drawY = Math.max(ceilingY, dstY);
    const visH = Math.min(dh - clipTop, 78 - drawY);

    if (visH > 0) {
      ctx.drawImage(img, 0, clipTop, dw, visH, x, drawY, dw, visH);

      // Dynamic lock core beacon overlay on central spine
      const ledY = dstY + Math.round(dh * 0.44);
      if (ledY >= ceilingY + 3 && ledY <= 68) {
        let col = '#ff2a55';
        let core = '#ff9ebb';
        if (status === 'open') {
          col = '#2ce8a2';
          core = '#d8fff0';
        } else if (status === 'active') {
          const blink = Math.floor(t * 6) % 2 === 0;
          col = blink ? '#ffbe0b' : '#ff2a55';
          core = '#fff5b8';
        } else if (status === 'standby') {
          col = '#00e5ff';
          core = '#d8ffff';
        }
        const lx = x + Math.floor(dw / 2);
        ctx.fillStyle = col;
        ctx.fillRect(lx - 1, ledY - 3, 2, 7);
        ctx.fillStyle = core;
        ctx.fillRect(lx, ledY - 1, 1, 2);
      }
    }

    // Ceiling bulkhead slot cap where door retracts
    ctx.fillStyle = '#141926';
    ctx.fillRect(x - 1, 1, dw + 2, 4);
    ctx.fillStyle = '#3b4863';
    ctx.fillRect(x, 2, dw, 2);
  }

  function drawThruster(px, py, turbo, speed, t) {
    const jitter = Math.floor(t * 28) % 3;
    const baseLen = turbo ? 18 : speed > 60 ? 11 : 7;
    const len = baseLen + jitter * (turbo ? 3 : 2);
    const tx = Math.round(px) + 1;
    const ty = Math.round(py) + 13;

    const outer = turbo ? '#00e5ff' : '#ff5e1a';
    const mid = turbo ? '#88fff3' : '#ffbe0b';

    // Stepped 16-bit pixel flame cone
    ctx.fillStyle = outer;
    ctx.fillRect(tx - Math.floor(len * 0.45), ty - 3, Math.floor(len * 0.45), 7);
    ctx.fillRect(tx - Math.floor(len * 0.8), ty - 2, Math.floor(len * 0.8), 5);
    ctx.fillRect(tx - len, ty - 1, len, 3);

    ctx.fillStyle = mid;
    ctx.fillRect(tx - Math.floor(len * 0.55), ty - 1, Math.floor(len * 0.55), 3);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tx - 4, ty - 1, 4, 2);
  }

  function drawPixelExplosionBurst(cx, cy, p) {
    if (p < 0 || p > 1) return;
    if (p < 0.72) {
      const prog = p / 0.72;
      const spread = 3 + prog * 17;
      const puffs = [
        [0, 0, 1.0, 0],
        [-0.65, -0.35, 0.75, 0.05],
        [0.62, -0.4, 0.72, 0.08],
        [-0.45, 0.38, 0.68, 0.12],
        [0.58, 0.35, 0.7, 0.1],
        [0.08, -0.68, 0.62, 0.14],
      ];
      for (const [ox, oy, sc, lag] of puffs) {
        const lp = Math.max(0, Math.min(1, (prog - lag) / Math.max(0.15, 1 - lag)));
        const sz = Math.round(Math.sin(lp * Math.PI) * 11 * sc);
        if (sz <= 1) continue;
        const px = Math.round(cx + ox * spread);
        const py = Math.round(cy + oy * spread * 0.75);

        ctx.fillStyle = '#261926';
        ctx.fillRect(px - sz, py - sz + 1, sz * 2, sz * 2 - 2);
        ctx.fillRect(px - sz + 1, py - sz, sz * 2 - 2, sz * 2);

        if (lp < 0.86 && sz >= 2) {
          const s1 = sz - 1;
          ctx.fillStyle = '#ff3b1f';
          ctx.fillRect(px - s1, py - s1 + 1, s1 * 2, s1 * 2 - 2);
          ctx.fillRect(px - s1 + 1, py - s1, s1 * 2 - 2, s1 * 2);
        }
        if (lp < 0.68 && sz >= 3) {
          const s2 = Math.max(1, Math.floor(sz * 0.6));
          ctx.fillStyle = '#ff981a';
          ctx.fillRect(px - s2, py - s2, s2 * 2, s2 * 2);
        }
        if (lp < 0.42 && sz >= 5) {
          const s3 = Math.max(1, Math.floor(sz * 0.32));
          ctx.fillStyle = '#fff7b2';
          ctx.fillRect(px - s3, py - s3, s3 * 2, s3 * 2);
        }
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      pt.vy += pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind === 'spark' && pt.y >= FLOOR_Y + 2) {
        pt.y = FLOOR_Y + 2;
        pt.vy = -Math.abs(pt.vy) * 0.45;
        pt.vx *= 0.72;
      }
    }
  }

  function renderParticles() {
    for (const pt of particles) {
      const alpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
      if (pt.kind === 'smoke') {
        const s = Math.max(1, Math.round(pt.size * (0.7 + (1 - alpha) * 0.7)));
        ctx.fillStyle = pt.ember && alpha > 0.7 ? '#ff6b1a' : alpha > 0.45 ? '#524d64' : '#302c3d';
        ctx.fillRect(Math.round(pt.x - s / 2), Math.round(pt.y - s / 2), s, s);
      } else {
        ctx.fillStyle = pt.color;
        ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
      }
    }
  }

  function frame(now) {
    const dt = lastTs ? Math.min(0.05, (now - lastTs) / 1000) : 0.016;
    lastTs = now;

    if (practiceScreen) {
      stage.hidden = !practiceScreen.hidden;
    }

    const dbg = window.__OVERRIDLE_DEBUG__;
    const mode = dbg ? dbg.getState() : 'STANDBY';
    const paused = dbg ? Boolean(dbg.isPaused) : false;
    const roundIdx = dbg ? dbg.roundIndex : 0;
    const lives = dbg ? dbg.lives : 3;

    // Detect state transitions cleanly
    if (mode !== prevMode) {
      stateTimer = 0;
      if (mode === 'STANDBY') {
        doorX = 360;
        passingDoor = null;
        hitTimer = 0;
        shakeTimer = 0;
        particles.length = 0;
      } else if (mode === 'PLAYING' && prevMode === 'STANDBY') {
        doorX = 278;
        passingDoor = null;
      } else if (mode === 'LOSE') {
        doorX = Math.max(198, Math.min(238, doorX));
        passingDoor = null;
        shakeTimer = 0.45;
      } else if (mode === 'WIN') {
        passingDoor = { x: Math.min(220, Math.max(176, doorX)), openFrac: 0.05, isExit: true };
        doorX = 400;
      }
      prevMode = mode;
    }

    // Round unlocked: launch current blast door opening & turbo surge!
    if (mode === 'PLAYING' && roundIdx > prevRound) {
      passingDoor = { x: Math.max(145, Math.min(250, doorX)), openFrac: 0.05, isExit: false };
      doorX = 355;
      hitTimer = 0;
    }

    // Mistake hurt feedback: sparks, smoke & shake
    if (mode === 'PLAYING' && lives < prevLives) {
      hitTimer = 0.55;
      shakeTimer = 0.22;
      for (let i = 0; i < 10; i++) {
        spawnSpark(
          podX + 38,
          podY + 12,
          -35 - Math.random() * 55,
          (Math.random() - 0.65) * 70,
          i % 2 === 0 ? '#fff5b8' : '#ff2a55',
          0.42
        );
      }
      for (let i = 0; i < 4; i++) {
        spawnSmoke(podX + 20, podY + 8, -22 - Math.random() * 20, -10 - Math.random() * 14, 3, 0.75, true);
      }
    }

    prevLives = lives;
    prevRound = roundIdx;

    if (!paused) {
      animTime += dt;
      stateTimer += dt;
    }
    if (hitTimer > 0) hitTimer = Math.max(0, hitTimer - dt);
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);

    // Update target kinematics per mode
    let targetSpeed = 30;
    let targetPodX = 76;
    let targetPodY = 37 + Math.sin(animTime * 3.0) * 2.2;
    let turbo = false;
    let exitSplitX = W + 20;

    if (mode === 'STANDBY') {
      targetSpeed = 30;
      targetPodX = 76;
    } else if (mode === 'PLAYING') {
      if (paused) {
        targetSpeed = 0;
        targetPodY = 37;
      } else {
        turbo = Boolean(passingDoor && passingDoor.x > -10);
        targetSpeed = turbo ? 195 : 88;
        targetPodY = 36 + Math.sin(animTime * 6.5) * 1.8;

        if (passingDoor) {
          passingDoor.openFrac = Math.min(1, passingDoor.openFrac + dt * 4.4);
          passingDoor.x -= (turbo ? 195 : 110) * dt;
          if (passingDoor.x < -36) passingDoor = null;
        }

        // Bring upcoming round door smoothly into view ahead of pod
        const restDoorX = 244;
        if (doorX > restDoorX) {
          doorX = Math.max(restDoorX, doorX - 105 * dt);
        } else {
          doorX = Math.max(204, doorX - dt * 2.2);
        }

        if (hitTimer > 0) {
          targetPodX = 76 - Math.sin((hitTimer / 0.55) * Math.PI) * 9;
          targetPodY += Math.sin(animTime * 48) * 1.6;
        } else if (turbo) {
          targetPodX = 94;
        }

        // Light engine damage smoke trail when injured
        if (lives < 3) {
          smokeSpawnAccum += dt * (lives === 1 ? 7 : 3);
          while (smokeSpawnAccum >= 1) {
            smokeSpawnAccum -= 1;
            spawnSmoke(podX + 14, podY + 8, -32, -8 - Math.random() * 10, lives === 1 ? 3 : 2, 0.7);
          }
        }
      }
    } else if (mode === 'LOSE') {
      if (stateTimer < 0.16) {
        const p = stateTimer / 0.16;
        targetSpeed = 95 * (1 - p);
        targetPodX = 76 + p * (doorX - 122);
        podX = targetPodX;
        podY = 37;
      } else {
        if (stateTimer - dt < 0.16) {
          spawnExplosion(doorX - 10, 50);
        }
        const crashAge = stateTimer - 0.16;
        targetSpeed = Math.max(0, 32 * (1 - Math.min(1, crashAge * 2.4)));
        // Bounce onto floor track and settle nose-down against door
        const settleX = Math.max(120, doorX - 54);
        targetPodX = settleX;
        const bounce = Math.abs(Math.sin(Math.min(1, crashAge * 1.8) * Math.PI * 2)) * Math.max(0, 1 - crashAge * 1.5) * 6;
        targetPodY = 46 - bounce;

        // Continuous smoldering wreck smoke & sparks
        smokeSpawnAccum += dt * 6.5;
        while (smokeSpawnAccum >= 1) {
          smokeSpawnAccum -= 1;
          spawnSmoke(podX + 26, podY + 8, -5 - Math.random() * 10, -14 - Math.random() * 10, 3, 1.15, Math.random() < 0.35);
          if (crashAge < 0.8 && Math.random() < 0.5) {
            spawnSpark(podX + 34, podY + 24, -18 - Math.random() * 20, -12 - Math.random() * 16, '#ffbe0b', 0.35);
          }
        }
      }
    } else if (mode === 'WIN') {
      turbo = true;
      targetSpeed = 120;
      if (passingDoor) {
        passingDoor.openFrac = Math.min(1, passingDoor.openFrac + dt * 4.5);
        if (passingDoor.x > 64) {
          passingDoor.x = Math.max(64, passingDoor.x - 135 * dt);
        }
        exitSplitX = Math.round(passingDoor.x + 15);
      } else {
        exitSplitX = 79;
      }
      targetPodX = stateTimer < 0.5 ? 76 + (stateTimer / 0.5) * 112 : 188 + Math.sin(animTime * 2.4) * 8;
      targetPodY = 34 + Math.sin(animTime * 4.2) * 2.4;
    }

    scrollSpeed += (targetSpeed - scrollSpeed) * Math.min(1, dt * 10);
    podX += (targetPodX - podX) * Math.min(1, dt * (mode === 'LOSE' ? 14 : 9));
    podY += (targetPodY - podY) * Math.min(1, dt * 12);

    const tileW = assets.tunnel.ready ? assets.tunnel.img.naturalWidth || 112 : 112;
    if (!paused) {
      scrollX = (scrollX + scrollSpeed * dt) % tileW;
    }
    updateParticles(dt);

    // Clear & apply brief camera shake during crash/mistakes
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeTimer > 0 && !paused) {
      const mag = shakeTimer > 0.25 ? 2 : 1;
      ctx.translate(Math.round((Math.random() - 0.5) * mag * 2), Math.round((Math.random() - 0.5) * mag * 2));
    }

    // 1. Seamless scrolling tunnel backdrop
    if (assets.tunnel.ready) {
      const off = Math.round(scrollX);
      for (let x = -off; x < W; x += tileW) {
        ctx.drawImage(assets.tunnel.img, x, 0);
      }
    } else {
      ctx.fillStyle = '#182430';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffbe0b';
      for (let x = 0; x < W; x += 12) ctx.fillRect(x, 69, 6, 4);
    }

    // 2. WIN exterior Trivmount twilight portal on right of exit gate
    if (mode === 'WIN' && exitSplitX < W) {
      if (assets.trivmount.ready) {
        const ti = assets.trivmount.img;
        const sx = 0;
        const sw = Math.round(ti.naturalWidth * 0.72);
        const sy = Math.round(ti.naturalHeight * 0.08);
        const sh = Math.round(ti.naturalHeight * 0.76);
        const destW = W - exitSplitX;
        const srcSubX = Math.max(0, sx + Math.round((exitSplitX / W) * sw));
        const srcSubW = Math.max(1, Math.min(ti.naturalWidth - srcSubX, Math.round((destW / W) * sw)));
        ctx.drawImage(ti, srcSubX, sy, srcSubW, sh, exitSplitX, 0, destW, H);
      } else {
        ctx.fillStyle = '#251a40';
        ctx.fillRect(exitSplitX, 0, W - exitSplitX, H);
      }
      // Heavy exit portal pillar & emerald guide strip
      ctx.fillStyle = '#161c2b';
      ctx.fillRect(exitSplitX - 3, 0, 6, H);
      ctx.fillStyle = '#4a5875';
      ctx.fillRect(exitSplitX - 1, 0, 3, H);
      ctx.fillStyle = '#2ce8a2';
      ctx.fillRect(exitSplitX + 2, 4, 1, 72);
      ctx.fillStyle = '#101522';
      ctx.fillRect(exitSplitX, 0, W - exitSplitX, 3);
    }

    // 3. Speed motion streaks when boosting
    if (scrollSpeed > 75 && !paused && mode !== 'LOSE') {
      ctx.fillStyle = turbo ? '#33d6ff' : '#3a556a';
      const count = turbo ? 6 : 3;
      for (let i = 0; i < count; i++) {
        const sx = Math.round(W - ((animTime * scrollSpeed * 1.65 + i * 67) % (W + 24)));
        const sy = 16 + ((i * 19) % 48);
        ctx.fillRect(sx, sy, turbo ? 14 : 7, 1);
      }
    }

    // 4. Upcoming / passing Blast Doors
    if (passingDoor && passingDoor.x > -34 && passingDoor.x < W + 10) {
      drawBlastDoor(passingDoor.x, passingDoor.openFrac, 'open', animTime);
    }
    if ((mode === 'PLAYING' || mode === 'LOSE') && doorX < W + 6 && doorX > -34) {
      drawBlastDoor(doorX, 0, mode === 'LOSE' ? 'locked' : paused ? 'standby' : 'active', animTime);
    }

    // 5. Track shadow ONLY when inside tunnel floor (not outside in Trivmount sky!)
    const overTunnelFloor = mode !== 'WIN' || podX + 12 < exitSplitX;
    if (overTunnelFloor) {
      ctx.fillStyle = 'rgba(8, 10, 18, 0.72)';
      ctx.fillRect(Math.round(podX + 10), FLOOR_Y, mode === 'LOSE' ? 30 : 34, 2);
    }

    // 6. Thruster & Pod / Wreck sprite
    const crashed = mode === 'LOSE' && stateTimer >= 0.16;
    if (!crashed) {
      drawThruster(podX, podY, turbo, scrollSpeed, animTime);
    }

    const rx = Math.round(podX);
    const ry = Math.round(podY);
    if (crashed && assets.wreck.ready) {
      ctx.drawImage(assets.wreck.img, rx, ry);
    } else if (hitTimer > 0 && Math.floor(animTime * 20) % 2 === 0 && podFlashCanvas) {
      ctx.drawImage(podFlashCanvas, rx, ry);
    } else if (assets.pod.ready) {
      ctx.drawImage(assets.pod.img, rx, ry);
    } else {
      ctx.fillStyle = crashed ? '#3b3745' : '#5c7ea8';
      ctx.fillRect(rx, ry, 50, 22);
    }

    // 7. Particles & Crash explosion overlay
    renderParticles();
    if (crashed && stateTimer < 0.75) {
      drawPixelExplosionBurst(Math.round(podX + 34), Math.round(podY + 12), (stateTimer - 0.16) / 0.59);
    }

    if (hitTimer > 0) {
      ctx.fillStyle = 'rgba(255, 42, 85, 0.22)';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function initPreviewFx() {
  enhanceLivesDisplay();
  enhanceRoundIndicators();
  enhanceModuleMeta();
  initContainmentAnimator();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPreviewFx, { once: true });
} else {
  initPreviewFx();
}
