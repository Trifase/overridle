/**
 * 16-bit Preview Enhancer & Containment Room Animator
 * Runs alongside untouched js/engine.js via DOM observers and window.__OVERRIDLE_DEBUG__.
 */

const W = 320;
const H = 88;
const FLOOR_Y = 72;

// Color map for pixel-matrix runner sprite
const C = {
  '.': null,
  k: '#0d0e1a', // dark pixel outline
  h: '#6b3a1e', // hair
  H: '#96562e', // hair highlight
  s: '#ffcba4', // skin
  S: '#e09a6c', // skin shade
  e: '#161726', // eye / mouth
  y: '#ffd018', // suit yellow
  Y: '#d48806', // suit shade
  b: '#00b4d8', // suit cyan/blue trim
  B: '#0077b6', // boots / dark blue
  c: '#00f5d4', // cyan glow (wristpad)
  w: '#ffffff', // white flash
};

// 16-wide x 22-tall 16-bit sprites
const SPRITE_IDLE = [
  '.....kkkkkk.....',
  '....kHHHHhhk....',
  '....khhhhhhk....',
  '....ksssssske...',
  '....kssesssk....',
  '....kssSSssk....',
  '.....kkkkkk.....',
  '...kkyyyyyykk...',
  '..kyybbbbbyyyk..',
  '..kyybcccbbyyk..',
  '..kYYbbbbbbYYk..',
  '..kssyyyyyyssk..',
  '...kkBBBBBBkk...',
  '....kyyyyyyk....',
  '....kyykkYYk....',
  '....kbbkkbbk....',
  '....kyykkYYk....',
  '....kyykkYYk....',
  '....kBBkkBBk....',
  '...kBBBk.kBBBk..',
  '...kkkkk.kkkkk..',
  '................',
];

const SPRITE_RUN_1 = [
  '.....kkkkkk.....',
  '....kHHHHhhk....',
  '....khhhhhhk....',
  '....ksssssske...',
  '....kssesssk....',
  '....kssSSssk....',
  '.....kkkkkk.....',
  '...kkyyyyyykk...',
  '..kyybbbbbyyykk.',
  '.kyyybcccbyysssk',
  '.kssYbbbbbbYkkk.',
  '..kkkyyyyyykk...',
  '....kBBBBBBk....',
  '...kyyykkyyyk...',
  '..kyyyk..kyyyk..',
  '..kbbk....kbbk..',
  '.kyyk......kyyk.',
  '.kBBk......kBBk.',
  'kBBBk......kBBBk',
  'kkkkk......kkkkk',
  '................',
  '................',
];

const SPRITE_RUN_2 = [
  '................',
  '.....kkkkkk.....',
  '....kHHHHhhk....',
  '....khhhhhhk....',
  '....ksssssske...',
  '....kssesssk....',
  '....kssSSssk....',
  '.....kkkkkk.....',
  '...kkyyyyyykk...',
  '...kybbbbbyyk...',
  '...kybcccbYYk...',
  '...kYbbbbbsYk...',
  '....kBBBBBBk....',
  '....kyyyyyyk....',
  '....kyykkYYk....',
  '....kbbkkyyk....',
  '....kyyk.kBBk...',
  '....kBBk.kBBBk..',
  '...kBBBk.kkkkk..',
  '...kkkkk........',
  '................',
  '................',
];

const SPRITE_RUN_3 = [
  '.....kkkkkk.....',
  '....kHHHHhhk....',
  '....khhhhhhk....',
  '....ksssssske...',
  '....kssesssk....',
  '....kssSSssk....',
  '.....kkkkkk.....',
  '...kkyyyyyykk...',
  '..kyybbbbbyyk...',
  '.kssybcccbyyk...',
  '..kkybbbbbyyssk.',
  '....kyyyyyykkk..',
  '....kBBBBBBk....',
  '...kyyykkyyyk...',
  '..kBBkk..kyyyk..',
  '.kBBBk....kbbk..',
  '.kkkkk....kyyk..',
  '..........kBBk..',
  '.........kBBBk..',
  '.........kkkkk..',
  '................',
  '................',
];

const SPRITE_WIN = [
  '.kk..........kk.',
  'kssk.kkkkkk.kssk',
  'kyykHHHHHHHHkyyk',
  '.kyykhhhhhhkyyk.',
  '.kyyksssssskyyk.',
  '..kykssessskyk..',
  '..kkkssSSsskkk..',
  '....kyyyyyyk....',
  '....kybbbbyk....',
  '....kybccbyk....',
  '....kYbbbbYk....',
  '....kBBBBBBk....',
  '....kyyyyyyk....',
  '....kyykkYYk....',
  '....kbbkkbbk....',
  '....kyykkYYk....',
  '....kBBkkBBk....',
  '...kBBBk.kBBBk..',
  '...kkkkk.kkkkk..',
  '................',
  '................',
  '................',
];

const SPRITE_LOSE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.........kkkkkk.',
  '..kkkkk.kHHHHhhk',
  '.kBBByykhhhhhhsk',
  'kBBByyybbbbssesk',
  '.kkkkyyyyyySSssk',
  '....kkkkkk.kkkk.',
  '................',
  '................',
  '................',
];

function drawSpriteMatrix(ctx, matrix, x, y, flashWhite = false) {
  const startX = Math.round(x - 8);
  const startY = Math.round(y - matrix.length);
  for (let row = 0; row < matrix.length; row++) {
    const line = matrix[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === '.') continue;
      ctx.fillStyle = flashWhite && ch !== 'k' ? '#ffffff' : C[ch] || '#ffffff';
      ctx.fillRect(startX + col, startY + row, 1, 1);
    }
  }
}

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

function enhanceRoundIndicators() {
  const leds = document.querySelectorAll('#round-indicators .round-led');
  leds.forEach((led, idx) => {
    led.dataset.num = String(idx + 1);
    led.textContent = '';
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

function initContainmentAnimator() {
  const stage = document.getElementById('containment-stage');
  const canvas = document.getElementById('containment-canvas');
  const practiceScreen = document.getElementById('screen-practice');
  const timerEl = document.getElementById('timer-display');
  if (!stage || !canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const bgImg = new Image();
  let bgReady = false;
  bgImg.onload = () => {
    bgReady = true;
  };
  bgImg.src = './assets/containment-room-bg.jpg';

  let animTime = 0;
  let lastTs = 0;
  let runnerX = 140;
  let maxTimerSeen = 36;
  let prevLives = 3;
  let prevRound = 0;
  let hitTimer = 0;
  let unlockTimer = 0;

  function drawVaultLocks(mode, roundResults, currentRound, t) {
    // Aligned to the chamfered vault door on the right of containment-room-bg.jpg
    // Door inner panels sit around x = 216..288, y = 26..68
    if (mode === 'WIN') {
      // Glowing open portal inside the vault frame
      const beam = Math.floor(t * 5) % 2 === 0 ? '#2ce8a2' : '#00e5ff';
      ctx.fillStyle = '#0c2b28';
      ctx.fillRect(222, 27, 58, 44);
      ctx.fillStyle = '#15544b';
      ctx.fillRect(228, 30, 46, 41);
      ctx.fillStyle = beam;
      ctx.fillRect(238, 33, 26, 38);
      ctx.fillStyle = '#d4fff5';
      ctx.fillRect(244, 36, 14, 35);
      return;
    }

    const count = Math.max(1, Math.min(5, roundResults.length || 5));
    const coords =
      count === 1
        ? [[251, 46]]
        : [
            [231, 35],
            [271, 35],
            [231, 56],
            [271, 56],
            [251, 46],
          ];

    for (let i = 0; i < count; i++) {
      const [lx, ly] = coords[i];
      const res = roundResults[i];
      let outer = '#3a1a2b';
      let core = '#ff2a55';
      let hi = '#ff9ebb';

      if (mode === 'STANDBY') {
        outer = '#10495e';
        core = '#00e5ff';
        hi = '#c7f9ff';
      } else if (res === 'won') {
        outer = '#0e4733';
        core = '#2ce8a2';
        hi = '#b8ffe4';
      } else if (res === 'lost') {
        outer = '#471021';
        core = '#ff2a55';
        hi = '#ff9ebb';
      } else if (mode === 'PLAYING' && i === currentRound) {
        const blink = Math.floor(t * 6) % 2 === 0;
        outer = '#382506';
        core = blink ? '#ffbe0b' : '#ff2a55';
        hi = '#fff3b0';
      }

      // 8x8 circular beveled lock jewel
      ctx.fillStyle = '#11101f';
      ctx.fillRect(lx - 4, ly - 4, 8, 8);
      ctx.fillStyle = '#5c6294';
      ctx.fillRect(lx - 3, ly - 3, 6, 6);
      ctx.fillStyle = outer;
      ctx.fillRect(lx - 2, ly - 2, 4, 4);
      ctx.fillStyle = core;
      ctx.fillRect(lx - 2, ly - 2, 4, 4);
      ctx.fillStyle = hi;
      ctx.fillRect(lx - 1, ly - 1, 2, 1);
    }
  }

  function drawLaserGate(x, mode, paused, t) {
    const bx = Math.round(x);
    const topY = 14;
    const botY = FLOOR_Y + 4;

    // 3D angled hazard frame matching mockup
    ctx.fillStyle = '#11101f';
    ctx.fillRect(bx - 4, topY, 9, botY - topY);
    ctx.fillStyle = '#6c73a8';
    ctx.fillRect(bx - 3, topY + 1, 7, botY - topY - 2);
    ctx.fillStyle = '#393d63';
    ctx.fillRect(bx - 1, topY + 2, 4, botY - topY - 4);

    // Yellow & black hazard stripes on vertical rail
    for (let y = topY + 3; y < botY - 4; y += 6) {
      ctx.fillStyle = '#141526';
      ctx.fillRect(bx - 2, y, 5, 3);
      ctx.fillStyle = '#ffbe0b';
      ctx.fillRect(bx - 2, y + 1, 5, 2);
    }

    const emitters = [25, 39, 53];
    if (mode === 'STANDBY' || mode === 'WIN') {
      for (const ey of emitters) {
        ctx.fillStyle = '#11101f';
        ctx.fillRect(bx + 4, ey - 1, 3, 3);
        ctx.fillStyle = '#145a73';
        ctx.fillRect(bx + 5, ey, 2, 1);
      }
      return;
    }

    const flicker = Math.floor(t * 16) % 2 === 0;
    const beamCol = paused ? '#00e5ff' : flicker ? '#ff2a55' : '#ff6b1a';
    const coreCol = paused ? '#ffffff' : '#fff3b0';

    // Floor reflection glow
    ctx.fillStyle = beamCol;
    ctx.fillRect(bx + 4, FLOOR_Y, 22, 2);

    for (let idx = 0; idx < emitters.length; idx++) {
      const ey = emitters[idx];
      const beamLen = 20 + ((Math.floor(t * 18) + idx * 5) % 9);

      // Glow aura
      ctx.fillStyle = beamCol;
      ctx.fillRect(bx + 4, ey - 2, 4, 5);
      ctx.fillRect(bx + 6, ey - 1, beamLen, 3);

      // Hot core
      ctx.fillStyle = coreCol;
      ctx.fillRect(bx + 5, ey - 1, 3, 3);
      ctx.fillRect(bx + 7, ey, Math.max(4, beamLen - 3), 1);

      // Tip sparks
      if (!paused && (Math.floor(t * 14) + idx) % 3 === 0) {
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(bx + 8 + beamLen, ey - 2, 1, 1);
        ctx.fillStyle = '#ffbe0b';
        ctx.fillRect(bx + 7 + beamLen, ey + 2, 1, 1);
      }
    }
  }

  function frame(now) {
    const dt = lastTs ? Math.min(0.05, (now - lastTs) / 1000) : 0.016;
    lastTs = now;

    // Hide during Practice selector so grid fits without scroll
    if (practiceScreen) {
      stage.hidden = !practiceScreen.hidden;
    }

    const dbg = window.__OVERRIDLE_DEBUG__;
    const mode = dbg ? dbg.getState() : 'STANDBY';
    const paused = dbg ? Boolean(dbg.isPaused) : false;
    const roundIdx = dbg ? dbg.roundIndex : 0;
    const lives = dbg ? dbg.lives : 3;
    const squares = dbg ? dbg.squares : [];
    const totalRounds = dbg && dbg.selectedModules.length ? dbg.selectedModules.length : 5;

    if (lives < prevLives && mode === 'PLAYING') {
      hitTimer = 0.4;
    }
    if (roundIdx > prevRound && mode === 'PLAYING') {
      unlockTimer = 0.5;
    }
    prevLives = lives;
    prevRound = roundIdx;

    if (!paused) animTime += dt;
    if (hitTimer > 0) hitTimer = Math.max(0, hitTimer - dt);
    if (unlockTimer > 0) unlockTimer = Math.max(0, unlockTimer - dt);

    // Estimate progress from timer readout
    const remSec = timerEl ? parseFloat(timerEl.textContent) || 0 : 36;
    if (mode === 'STANDBY') {
      maxTimerSeen = Math.max(30, remSec || 36);
    } else if (mode === 'PLAYING' && dbg) {
      const totalEst = dbg.elapsed + remSec;
      if (totalEst > 5) maxTimerSeen = totalEst;
    }
    let progress = 0;
    if (mode === 'PLAYING' && maxTimerSeen > 0) {
      progress = Math.max(0, Math.min(1, 1 - remSec / maxTimerSeen));
    } else if (mode === 'LOSE') {
      progress = 1;
    }

    const roundResults = [];
    for (let i = 0; i < totalRounds; i++) {
      if (squares[i] === '🟩') roundResults.push('won');
      else if (squares[i] === '🟥') roundResults.push('lost');
      else roundResults.push('pending');
    }

    // Render room backdrop
    ctx.clearRect(0, 0, W, H);
    if (bgReady) {
      const sy = Math.round(bgImg.naturalHeight * 0.14);
      const sh = Math.round(bgImg.naturalHeight * 0.78);
      ctx.drawImage(bgImg, 0, sy, bgImg.naturalWidth, sh, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#1b2038';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2d3252';
      ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    }

    drawVaultLocks(mode, roundResults, roundIdx, animTime);

    // Laser & runner coordinates
    let laserX = 22;
    if (mode === 'PLAYING') {
      laserX = 22 + progress * 136;
    } else if (mode === 'LOSE') {
      laserX = 160;
    }

    let targetRunnerX = 148;
    if (mode === 'STANDBY') {
      targetRunnerX = 142;
    } else if (mode === 'WIN') {
      targetRunnerX = 251;
    } else if (mode === 'LOSE') {
      targetRunnerX = 192;
    } else {
      const roundFrac = totalRounds > 0 ? roundIdx / totalRounds : 0;
      const baseX = 114 + roundFrac * 86;
      targetRunnerX = Math.max(laserX + 42, Math.min(204, baseX));
    }

    runnerX += (targetRunnerX - runnerX) * Math.min(1, dt * 8);

    drawLaserGate(laserX, mode, paused, animTime);

    // Choose sprite frame
    let sprite = SPRITE_IDLE;
    let yOffset = 0;
    if (mode === 'WIN') {
      sprite = SPRITE_WIN;
      yOffset = Math.floor(animTime * 6) % 2 === 0 ? -3 : 0;
    } else if (mode === 'LOSE') {
      sprite = SPRITE_LOSE;
    } else if (mode === 'PLAYING' && !paused) {
      const cycle = [SPRITE_RUN_1, SPRITE_RUN_2, SPRITE_RUN_3, SPRITE_RUN_2];
      sprite = cycle[Math.floor(animTime * 11) % 4];
    } else if (mode === 'STANDBY') {
      yOffset = Math.floor(animTime * 2) % 2 === 0 ? 0 : -1;
    }

    // Ground shadow
    ctx.fillStyle = 'rgba(10, 10, 22, 0.72)';
    ctx.fillRect(Math.round(runnerX - 7), FLOOR_Y + 1, 14, 2);

    const flashWhite = hitTimer > 0 && Math.floor(animTime * 20) % 2 === 0;
    drawSpriteMatrix(ctx, sprite, runnerX, FLOOR_Y + 2 + yOffset, flashWhite);

    if (unlockTimer > 0 && mode === 'PLAYING') {
      ctx.fillStyle = '#00f5d4';
      ctx.fillRect(Math.round(runnerX - 20), FLOOR_Y - 14, 9, 1);
      ctx.fillStyle = '#2ce8a2';
      ctx.fillRect(Math.round(runnerX - 24), FLOOR_Y - 8, 12, 1);
    }

    if (hitTimer > 0) {
      ctx.fillStyle = 'rgba(255, 42, 85, 0.25)';
      ctx.fillRect(0, 0, W, H);
    }

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
