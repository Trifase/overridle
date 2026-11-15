/**
 * 16-bit Pixel-Art Containment Room Scene Renderer (240x96)
 * Matches the chunky metallic 16-bit arcade aesthetic.
 */

const W = 240;
const H = 96;
const FLOOR_Y = 74;

const PAL = {
  outline: '#0d0e1a',
  bgDeep: '#121326',
  wallDark: '#1c2038',
  wallMid: '#272c4a',
  wallLight: '#363d63',
  pipeDark: '#232742',
  pipeMid: '#434973',
  pipeHi: '#6b72a8',
  floorBase: '#2d3252',
  floorTile: '#3b4168',
  floorHi: '#5a6191',
  floorLine: '#191c30',
  hazardYel: '#ffbe0b',
  hazardOrg: '#e88d00',
  hazardBlk: '#151626',
  metalDark: '#2a2e4a',
  metalMid: '#4d537d',
  metalLight: '#7c84b8',
  metalHi: '#adb5e6',
  laserGlow: '#ff5e1a',
  laserRed: '#ff1f4b',
  laserCore: '#fff0b3',
  cyan: '#00e5ff',
  cyanDim: '#125a73',
  green: '#2ce8a2',
  greenHi: '#9effda',
  greenDim: '#124a38',
  red: '#ff2a55',
  redHi: '#ff859d',
  redDim: '#5c1428',
  amber: '#ffbe0b',
  suit: '#ffca18',
  suitShade: '#d48806',
  suitBlue: '#00b4d8',
  suitBlueDark: '#0077b6',
  skin: '#ffcba4',
  skinShade: '#e09f75',
  hair: '#5c3317',
  hairHi: '#854c27',
  boots: '#0096c7',
  white: '#f4f6ff',
};

let canvas = null;
let ctx = null;
let stageEl = null;
let rafId = null;

const state = {
  mode: 'STANDBY', // 'STANDBY' | 'PLAYING' | 'WIN' | 'LOSE'
  paused: false,
  progress: 0,
  totalRounds: 5,
  currentRound: 0,
  roundResults: [],
  hitTimer: 0,
  unlockTimer: 0,
  lastTs: 0,
  elapsedAnim: 0,
  runnerX: 108,
};

function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function px(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function drawLine(x1, y1, x2, y2, color) {
  ctx.fillStyle = color;
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + ((x2 - x1) * i) / steps);
    const y = Math.round(y1 + ((y2 - y1) * i) / steps);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawBackground(t) {
  // Wall gradient bands
  rect(0, 0, W, 14, PAL.bgDeep);
  rect(0, 14, W, 24, PAL.wallDark);
  rect(0, 38, W, FLOOR_Y - 38, PAL.wallMid);

  // Vertical metallic wall ribs
  for (let x = 18; x < W; x += 44) {
    rect(x, 12, 8, FLOOR_Y - 12, PAL.wallDark);
    rect(x + 1, 12, 5, FLOOR_Y - 12, PAL.wallLight);
    rect(x + 2, 12, 2, FLOOR_Y - 12, PAL.wallMid);
  }

  // Ceiling pipes & hanging cables
  rect(0, 6, W, 4, PAL.pipeDark);
  rect(0, 7, W, 2, PAL.pipeMid);
  rect(0, 7, W, 1, PAL.pipeHi);

  // Small cable loops on ceiling
  drawLine(45, 10, 56, 16, PAL.outline);
  drawLine(56, 16, 68, 10, PAL.outline);
  drawLine(45, 9, 56, 15, PAL.pipeMid);
  drawLine(56, 15, 68, 9, PAL.pipeMid);

  drawLine(140, 10, 152, 15, PAL.outline);
  drawLine(152, 15, 165, 10, PAL.outline);

  // Back wall keypad box
  rect(134, 32, 9, 13, PAL.outline);
  rect(135, 33, 7, 11, PAL.metalMid);
  rect(137, 35, 3, 2, PAL.green);
  rect(137, 39, 3, 3, state.mode === 'PLAYING' && Math.floor(t * 4) % 2 === 0 ? PAL.amber : PAL.red);

  // Hazard stripe band across back wall
  const sy = 48;
  rect(0, sy - 1, W, 7, PAL.outline);
  rect(0, sy, W, 5, PAL.hazardBlk);
  for (let x = -6; x < W + 6; x += 10) {
    for (let dy = 0; dy < 5; dy++) {
      rect(x + dy, sy + dy, 4, 1, PAL.hazardYel);
    }
  }

  // Metallic tiled floor
  rect(0, FLOOR_Y, W, 1, PAL.outline);
  rect(0, FLOOR_Y + 1, W, H - FLOOR_Y - 1, PAL.floorBase);
  rect(0, FLOOR_Y + 1, W, 2, PAL.floorHi);

  // Floor perspective lines
  for (let x = 0; x < W + 24; x += 26) {
    drawLine(x, FLOOR_Y + 1, x - 14, H, PAL.floorLine);
  }
  rect(0, FLOOR_Y + 9, W, 1, PAL.floorLine);
  rect(0, FLOOR_Y + 17, W, 1, PAL.floorLine);

  // Floor cables in foreground
  drawLine(0, H - 5, 58, H - 2, PAL.outline);
  drawLine(0, H - 4, 58, H - 1, PAL.red);
  drawLine(148, H - 2, W, H - 6, PAL.outline);
  drawLine(148, H - 1, W, H - 5, PAL.cyanDim);
}

function drawVaultDoor(t) {
  const dx = 172;
  const dy = 14;
  const dw = 56;
  const dh = FLOOR_Y - dy;

  // Overhead cyan/green/red light bar
  const doorOpen = state.mode === 'WIN';
  const topLight = doorOpen ? PAL.green : state.mode === 'LOSE' ? PAL.red : PAL.cyan;
  rect(dx + 14, dy - 4, 28, 4, PAL.outline);
  rect(dx + 15, dy - 3, 26, 2, topLight);

  // Outer beveled metallic frame
  rect(dx, dy, dw, dh, PAL.outline);
  rect(dx + 1, dy + 1, dw - 2, dh - 1, PAL.metalHi);
  rect(dx + 2, dy + 2, dw - 4, dh - 2, PAL.metalLight);
  rect(dx + 4, dy + 4, dw - 8, dh - 4, PAL.metalMid);
  rect(dx + 6, dy + 6, dw - 12, dh - 6, PAL.metalDark);

  // Corner chamfers
  rect(dx, dy, 4, 4, PAL.wallDark);
  rect(dx + dw - 4, dy, 4, 4, PAL.wallDark);
  rect(dx + 2, dy + 2, 3, 3, PAL.metalLight);
  rect(dx + dw - 5, dy + 2, 3, 3, PAL.metalLight);

  if (doorOpen) {
    // Wide open glowing exit!
    rect(dx + 8, dy + 8, dw - 16, dh - 8, '#0b2b29');
    rect(dx + 12, dy + 10, dw - 24, dh - 10, '#124d45');
    const beam = Math.floor(t * 4) % 2 === 0 ? PAL.green : PAL.cyan;
    rect(dx + 18, dy + 12, dw - 36, dh - 12, beam);
    rect(dx + 22, dy + 14, dw - 44, dh - 14, PAL.greenHi);
    return;
  }

  // Left and right door panels
  const innerX = dx + 8;
  const innerY = dy + 8;
  const innerW = dw - 16;
  const innerH = dh - 8;
  rect(innerX, innerY, innerW, innerH, PAL.metalMid);
  rect(innerX + 1, innerY + 1, innerW - 2, 1, PAL.metalHi);

  // Center interlocking seam
  const midX = dx + Math.floor(dw / 2);
  rect(midX - 1, innerY, 2, innerH, PAL.outline);
  for (let y = innerY + 6; y < innerY + innerH - 6; y += 12) {
    rect(midX - 3, y, 6, 4, PAL.metalLight);
    rect(midX - 2, y + 1, 4, 2, PAL.outline);
  }

  // Up to 5 chunky circular security locks
  const count = Math.max(1, Math.min(5, state.totalRounds));
  const lockPos = [
    [dx + 15, dy + 19],
    [dx + 37, dy + 19],
    [dx + 15, dy + 35],
    [dx + 37, dy + 35],
    [dx + 26, dy + 50],
  ];

  for (let i = 0; i < count; i++) {
    const [lx, ly] = lockPos[i];
    const res = state.roundResults[i];
    let rim = PAL.redDim;
    let core = PAL.red;
    let hi = PAL.redHi;

    if (state.mode === 'STANDBY') {
      rim = PAL.cyanDim;
      core = PAL.cyan;
      hi = PAL.white;
    } else if (res === 'won') {
      rim = PAL.greenDim;
      core = PAL.green;
      hi = PAL.greenHi;
    } else if (res === 'lost') {
      rim = PAL.redDim;
      core = PAL.red;
      hi = PAL.redHi;
    } else if (state.mode === 'PLAYING' && i === state.currentRound) {
      const blink = Math.floor(t * 5) % 2 === 0;
      rim = PAL.hazardBlk;
      core = blink ? PAL.amber : PAL.red;
      hi = PAL.white;
    }

    // 7x7 circular beveled lock housing
    rect(lx - 1, ly - 1, 8, 8, PAL.outline);
    rect(lx, ly, 6, 6, PAL.metalDark);
    rect(lx + 1, ly + 1, 4, 4, rim);
    rect(lx + 1, ly + 1, 4, 4, core);
    px(lx + 2, ly + 2, hi);
  }
}

function drawLaserBarrier(x, t) {
  const bx = Math.round(x);
  const topY = 12;
  const botY = FLOOR_Y + 3;
  const barW = 7;

  // Back post shadow / frame (angled 3D look)
  rect(bx - 1, topY, barW, botY - topY, PAL.outline);
  rect(bx, topY + 1, barW - 2, botY - topY - 2, PAL.metalLight);
  rect(bx + 1, topY + 2, barW - 4, botY - topY - 4, PAL.metalMid);

  // Hazard stripes along vertical post
  for (let y = topY + 4; y < botY - 5; y += 6) {
    rect(bx + 1, y, 3, 3, PAL.hazardBlk);
    rect(bx + 1, y + 1, 3, 2, PAL.hazardYel);
  }

  // Top & bottom heavy caps
  rect(bx - 2, topY - 1, barW + 3, 5, PAL.outline);
  rect(bx - 1, topY, barW + 1, 3, PAL.metalHi);
  rect(bx - 2, botY - 3, barW + 4, 5, PAL.outline);
  rect(bx - 1, botY - 2, barW + 2, 3, PAL.metalLight);

  const emitterYs = [22, 34, 46, 58];

  if (state.mode === 'STANDBY' || state.mode === 'WIN') {
    // Calm powered-down emitters
    for (const ey of emitterYs) {
      rect(bx + barW - 1, ey - 1, 3, 3, PAL.outline);
      px(bx + barW, ey, PAL.cyanDim);
    }
    return;
  }

  // Active crackling laser beams!
  const flicker = Math.floor(t * 14) % 2 === 0;
  const beamCol = state.paused ? PAL.cyan : flicker ? PAL.laserRed : PAL.laserGlow;
  const coreCol = state.paused ? PAL.white : PAL.laserCore;

  // Red/orange floor glow
  rect(bx + barW, FLOOR_Y, 14, 2, beamCol);

  for (let idx = 0; idx < emitterYs.length; idx++) {
    const ey = emitterYs[idx];
    const len = 10 + ((Math.floor(t * 16) + idx * 3) % 7);
    // Emitter node
    rect(bx + barW - 1, ey - 2, 4, 5, PAL.outline);
    rect(bx + barW, ey - 1, 3, 3, beamCol);
    // Horizontal laser beam
    rect(bx + barW + 2, ey - 1, len, 3, beamCol);
    rect(bx + barW + 2, ey, len - 2, 1, coreCol);
    // Tip spark
    if (!state.paused && (Math.floor(t * 12) + idx) % 3 === 0) {
      px(bx + barW + 3 + len, ey - 1, PAL.laserCore);
      px(bx + barW + 2 + len, ey + 1, PAL.amber);
    }
  }
}

function drawRunner(x, y, t) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const isHit = state.hitTimer > 0;
  const isUnlocking = state.unlockTimer > 0;

  let pose = 'idle';
  if (state.mode === 'PLAYING' && !state.paused) pose = 'run';
  else if (state.mode === 'WIN') pose = 'win';
  else if (state.mode === 'LOSE') pose = 'lose';

  const frame = Math.floor(t * 10);
  const bob =
    pose === 'run'
      ? frame % 2 === 0
        ? 0
        : -1
      : pose === 'idle'
        ? Math.floor(t * 2) % 2 === 0
          ? 0
          : -1
        : 0;

  // Ground shadow
  rect(rx - 5, ry, 13, 2, PAL.outline);

  if (pose === 'lose') {
    // Knocked down
    rect(rx - 8, ry - 7, 16, 7, PAL.outline);
    rect(rx - 7, ry - 6, 9, 5, PAL.suit);
    rect(rx + 2, ry - 6, 5, 5, PAL.skin);
    rect(rx + 3, ry - 6, 4, 2, PAL.hair);
    rect(rx - 10, ry - 5, 3, 4, PAL.boots);
    return;
  }

  const top = ry - 24 + bob;
  const suitC = isHit && frame % 2 === 0 ? PAL.white : PAL.suit;
  const suitS = isHit && frame % 2 === 0 ? PAL.red : PAL.suitShade;
  const blueC = isHit && frame % 2 === 0 ? PAL.red : PAL.suitBlue;

  // --- Head (with black pixel outline) ---
  rect(rx - 1, top - 1, 9, 9, PAL.outline);
  rect(rx, top, 7, 2, PAL.hair);
  rect(rx + 1, top, 4, 1, PAL.hairHi);
  rect(rx, top + 2, 7, 5, PAL.skin);
  rect(rx, top + 6, 7, 1, PAL.skinShade);
  // Eyes & mouth
  px(rx + 4, top + 3, PAL.outline);
  px(rx + 6, top + 3, PAL.outline);
  if (pose === 'run') {
    rect(rx + 4, top + 5, 2, 1, PAL.outline); // worried mouth
  } else {
    px(rx + 5, top + 5, PAL.outline);
  }

  // --- Torso ---
  rect(rx - 2, top + 7, 10, 9, PAL.outline);
  rect(rx - 1, top + 8, 8, 7, suitC);
  rect(rx - 1, top + 8, 2, 7, suitS);
  rect(rx + 2, top + 9, 3, 4, blueC); // chest panel
  rect(rx - 1, top + 14, 8, 1, PAL.suitBlueDark); // belt

  if (pose === 'idle') {
    // Calm standing + glancing at glowing cyan wristpad
    rect(rx - 2, top + 15, 4, 9 - bob, PAL.outline);
    rect(rx - 1, top + 15, 2, 6 - bob, suitS);
    rect(rx - 1, ry - 3, 3, 3, PAL.boots);

    rect(rx + 3, top + 15, 4, 9 - bob, PAL.outline);
    rect(rx + 4, top + 15, 2, 6 - bob, suitC);
    rect(rx + 4, ry - 3, 3, 3, PAL.boots);

    // Raised forearm with cyan wristpad
    rect(rx + 6, top + 9, 5, 4, PAL.outline);
    rect(rx + 7, top + 10, 3, 2, PAL.skin);
    rect(rx + 8, top + 8, 3, 2, PAL.cyan);
  } else if (pose === 'win') {
    // Arms raised in victory!
    rect(rx - 4, top + 2, 3, 7, PAL.outline);
    rect(rx - 3, top + 3, 2, 5, suitC);
    px(rx - 3, top + 2, PAL.skin);

    rect(rx + 7, top + 2, 3, 7, PAL.outline);
    rect(rx + 7, top + 3, 2, 5, suitC);
    px(rx + 7, top + 2, PAL.skin);

    rect(rx - 1, top + 15, 4, 9, PAL.outline);
    rect(rx, top + 15, 2, 6, suitC);
    rect(rx, ry - 3, 3, 3, PAL.boots);

    rect(rx + 3, top + 15, 4, 9, PAL.outline);
    rect(rx + 4, top + 15, 2, 6, suitC);
    rect(rx + 4, ry - 3, 3, 3, PAL.boots);
  } else {
    // Energetic 4-frame sprint cycle!
    const phase = frame % 4;
    if (phase === 0) {
      // Wide stride
      rect(rx - 5, top + 15, 5, 8, PAL.outline);
      rect(rx - 4, top + 16, 3, 4, suitS);
      rect(rx - 5, ry - 3, 4, 3, PAL.boots);

      rect(rx + 4, top + 15, 5, 8, PAL.outline);
      rect(rx + 5, top + 16, 3, 4, suitC);
      rect(rx + 6, ry - 3, 4, 3, PAL.boots);

      // Pumping arms
      rect(rx + 6, top + 9, 4, 4, PAL.outline);
      rect(rx + 7, top + 10, 2, 2, PAL.skin);
    } else if (phase === 1 || phase === 3) {
      // Passing stride
      rect(rx, top + 15, 4, 9 - bob, PAL.outline);
      rect(rx + 1, top + 15, 2, 6 - bob, suitC);
      rect(rx + 1, ry - 3, 3, 3, PAL.boots);

      rect(rx + 3, top + 15, 4, 7 - bob, PAL.outline);
      rect(rx + 4, top + 15, 2, 4 - bob, suitS);
      rect(rx + 4, ry - 5, 3, 3, PAL.boots);

      rect(rx + 5, top + 10, 4, 3, PAL.outline);
      rect(rx + 6, top + 11, 2, 1, PAL.skin);
    } else {
      // Opposite stride
      rect(rx + 3, top + 15, 5, 8, PAL.outline);
      rect(rx + 4, top + 16, 3, 4, suitC);
      rect(rx + 5, ry - 3, 4, 3, PAL.boots);

      rect(rx - 4, top + 15, 5, 8, PAL.outline);
      rect(rx - 3, top + 16, 3, 4, suitS);
      rect(rx - 4, ry - 3, 4, 3, PAL.boots);

      rect(rx - 4, top + 9, 4, 4, PAL.outline);
      rect(rx - 3, top + 10, 2, 2, PAL.skin);
    }

    if (isUnlocking) {
      rect(rx - 12, top + 5, 7, 1, PAL.cyan);
      rect(rx - 15, top + 11, 9, 1, PAL.green);
    }
  }
}

function render(now) {
  if (!ctx) return;

  const dt = state.lastTs ? Math.min(0.05, (now - state.lastTs) / 1000) : 0.016;
  state.lastTs = now;

  if (!state.paused) {
    state.elapsedAnim += dt;
  }
  if (state.hitTimer > 0) state.hitTimer = Math.max(0, state.hitTimer - dt);
  if (state.unlockTimer > 0) state.unlockTimer = Math.max(0, state.unlockTimer - dt);

  const t = state.elapsedAnim;

  ctx.clearRect(0, 0, W, H);
  drawBackground(t);
  drawVaultDoor(t);

  let laserX = 20;
  if (state.mode === 'PLAYING') {
    laserX = 20 + Math.max(0, Math.min(1, state.progress)) * 114;
  } else if (state.mode === 'LOSE') {
    laserX = 136;
  }

  let targetRunnerX = 108;
  if (state.mode === 'STANDBY') {
    targetRunnerX = 108;
  } else if (state.mode === 'WIN') {
    targetRunnerX = 196;
  } else if (state.mode === 'LOSE') {
    targetRunnerX = 148;
  } else {
    const roundFrac = state.totalRounds > 0 ? state.currentRound / state.totalRounds : 0;
    const baseX = 82 + roundFrac * 74;
    targetRunnerX = Math.max(laserX + 26, Math.min(156, baseX));
  }

  state.runnerX += (targetRunnerX - state.runnerX) * Math.min(1, dt * 8);

  drawLaserBarrier(laserX, t);
  drawRunner(state.runnerX, FLOOR_Y, t);

  if (state.hitTimer > 0) {
    ctx.fillStyle = 'rgba(255, 42, 85, 0.25)';
    ctx.fillRect(0, 0, W, H);
  }

  rafId = requestAnimationFrame(render);
}

export function initContainmentScene() {
  canvas = document.getElementById('containment-canvas');
  stageEl = document.getElementById('containment-stage');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (rafId === null) {
    rafId = requestAnimationFrame(render);
  }
}

export function setContainmentVisibility(visible) {
  if (stageEl) {
    stageEl.hidden = !visible;
  }
}

export function updateContainmentState({
  mode,
  paused,
  progress,
  totalRounds,
  currentRound,
  roundResults,
} = {}) {
  if (mode !== undefined) state.mode = mode;
  if (paused !== undefined) state.paused = paused;
  if (progress !== undefined) state.progress = progress;
  if (totalRounds !== undefined) state.totalRounds = totalRounds;
  if (currentRound !== undefined) state.currentRound = currentRound;
  if (roundResults !== undefined) state.roundResults = roundResults;
}

export function triggerContainmentHit() {
  state.hitTimer = 0.35;
}

export function triggerContainmentUnlock() {
  state.unlockTimer = 0.45;
}
