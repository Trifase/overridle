/**
 * 16-bit Pixel-Art Containment Room Scene Renderer
 * Renders on a 160x52 internal pixel buffer upscaled cleanly with nearest-neighbor.
 */

const W = 160;
const H = 52;
const FLOOR_Y = 42;

const PAL = {
  bgTop: '#131129',
  bgWall: '#1d1b3a',
  wallRib: '#292752',
  wallTrim: '#3b386e',
  floor: '#252347',
  floorGrid: '#363366',
  floorHi: '#4a4782',
  hazardYellow: '#ffbe0b',
  hazardDark: '#19162e',
  metalDark: '#2f2d52',
  metalMid: '#4c4a7a',
  metalLight: '#7b79b0',
  metalHi: '#a9a7d9',
  laserRed: '#ff2a55',
  laserCore: '#ffd6e0',
  laserGlow: '#ff6b35',
  cyan: '#00e5ff',
  cyanDim: '#105c70',
  green: '#2ce8a2',
  greenDim: '#144d3b',
  red: '#ff3366',
  redDim: '#59162b',
  amber: '#ffbe0b',
  suit: '#ffbe0b',
  suitShade: '#d98a00',
  suitBlue: '#00b4d8',
  skin: '#ffcba4',
  hair: '#5c3317',
  boots: '#1d70b8',
  white: '#f4f6ff',
};

let canvas = null;
let ctx = null;
let stageEl = null;
let rafId = null;

const state = {
  mode: 'STANDBY', // 'STANDBY' | 'PLAYING' | 'WIN' | 'LOSE'
  paused: false,
  progress: 0, // 0..1 elapsed time ratio
  totalRounds: 5,
  currentRound: 0,
  roundResults: [], // array of 'won' | 'lost' | 'pending'
  hitTimer: 0,
  unlockTimer: 0,
  lastTs: 0,
  elapsedAnim: 0,
  runnerX: 68,
};

function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function px(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function drawRoomBackground(t) {
  // Upper ceiling & dark wall
  rect(0, 0, W, FLOOR_Y, PAL.bgWall);
  rect(0, 0, W, 6, PAL.bgTop);

  // Ceiling pipes & ribs
  rect(0, 6, W, 2, PAL.metalDark);
  rect(0, 6, W, 1, PAL.metalMid);
  for (let x = 10; x < W; x += 28) {
    rect(x, 8, 4, FLOOR_Y - 8, PAL.wallRib);
    rect(x + 1, 8, 1, FLOOR_Y - 8, PAL.wallTrim);
  }

  // Hazard stripe along back wall
  const stripeY = 25;
  rect(0, stripeY, W, 3, PAL.hazardDark);
  for (let x = 0; x < W; x += 6) {
    rect(x, stripeY + 1, 3, 1, PAL.hazardYellow);
  }

  // Floor with perspective grid
  rect(0, FLOOR_Y, W, H - FLOOR_Y, PAL.floor);
  rect(0, FLOOR_Y, W, 1, PAL.floorHi);
  for (let x = 4; x < W; x += 16) {
    ctx.fillStyle = PAL.floorGrid;
    for (let dy = 1; dy < H - FLOOR_Y; dy++) {
      ctx.fillRect(x - Math.floor(dy * 0.6), FLOOR_Y + dy, 1, 1);
    }
  }

  // Subtle ambient ceiling light
  const pulse = Math.floor(t * 2) % 2 === 0;
  rect(74, 2, 12, 2, state.mode === 'LOSE' && pulse ? PAL.laserRed : PAL.cyanDim);
}

function drawVaultDoor(t) {
  const dx = 122;
  const dy = 10;
  const dw = 32;
  const dh = FLOOR_Y - dy;

  // Overhead status strip
  const doorOpen = state.mode === 'WIN';
  rect(dx + 6, dy - 3, 20, 2, doorOpen ? PAL.green : state.mode === 'LOSE' ? PAL.red : PAL.cyan);

  // Outer beveled frame
  rect(dx, dy, dw, dh, PAL.metalDark);
  rect(dx + 1, dy + 1, dw - 2, dh - 1, PAL.metalLight);
  rect(dx + 2, dy + 2, dw - 4, dh - 2, PAL.metalMid);

  if (doorOpen) {
    // Open glowing exit!
    rect(dx + 4, dy + 4, dw - 8, dh - 4, '#0c2e2b');
    rect(dx + 6, dy + 5, dw - 12, dh - 5, '#134e44');
    // Light rays
    const rayColor = Math.floor(t * 4) % 2 === 0 ? PAL.green : PAL.cyan;
    rect(dx + 10, dy + 6, 12, dh - 6, rayColor);
    rect(dx + 12, dy + 8, 8, dh - 8, PAL.white);
    return;
  }

  // Closed vault leaves
  const midX = dx + dw / 2;
  rect(dx + 4, dy + 4, dw - 8, dh - 4, PAL.metalDark);
  rect(dx + 5, dy + 5, 10, dh - 6, PAL.metalMid);
  rect(midX + 1, dy + 5, 10, dh - 6, PAL.metalMid);
  // Center seam
  rect(midX - 1, dy + 4, 2, dh - 4, PAL.hazardDark);

  // Security locks (up to 5)
  const count = Math.max(1, Math.min(5, state.totalRounds));
  const lockPositions = [
    [dx + 8, dy + 9],
    [dx + 20, dy + 9],
    [dx + 8, dy + 17],
    [dx + 20, dy + 17],
    [dx + 14, dy + 25],
  ];

  for (let i = 0; i < count; i++) {
    const [lx, ly] = lockPositions[i];
    const res = state.roundResults[i];
    let col = PAL.redDim;
    let core = PAL.red;

    if (state.mode === 'STANDBY') {
      col = PAL.cyanDim;
      core = PAL.cyan;
    } else if (res === 'won') {
      col = PAL.greenDim;
      core = PAL.green;
    } else if (res === 'lost') {
      col = PAL.redDim;
      core = PAL.red;
    } else if (state.mode === 'PLAYING' && i === state.currentRound) {
      const blink = Math.floor(t * 4) % 2 === 0;
      col = PAL.hazardDark;
      core = blink ? PAL.amber : PAL.red;
    }

    rect(lx, ly, 4, 4, PAL.hazardDark);
    rect(lx + 1, ly + 1, 2, 2, core);
    px(lx, ly, col);
  }
}

function drawLaserBarrier(x, t) {
  const bx = Math.round(x);
  const topY = 8;
  const botY = FLOOR_Y;

  // Base emitter & top rail
  rect(bx - 3, topY, 6, 3, PAL.metalLight);
  rect(bx - 4, botY - 2, 8, 3, PAL.metalLight);
  rect(bx - 2, topY + 3, 4, botY - topY - 5, PAL.metalDark);

  // Hazard stripes on post
  for (let y = topY + 4; y < botY - 3; y += 4) {
    rect(bx - 1, y, 2, 2, PAL.hazardYellow);
  }

  if (state.mode === 'STANDBY' || state.mode === 'WIN') {
    // Powered down emitters
    for (let y = topY + 7; y < botY - 5; y += 7) {
      px(bx + 2, y, PAL.cyanDim);
    }
    return;
  }

  // Active laser beams extending slightly behind/around post
  const beamColor = state.paused ? PAL.cyan : Math.floor(t * 10) % 2 === 0 ? PAL.laserRed : PAL.laserGlow;
  const coreColor = state.paused ? PAL.white : PAL.laserCore;

  // Glow aura on floor
  rect(bx + 2, botY, 6, 1, beamColor);

  for (let y = topY + 7; y < botY - 5; y += 7) {
    // Emitter node
    rect(bx + 1, y - 1, 3, 3, beamColor);
    px(bx + 2, y, coreColor);
    // Horizontal crackling laser prongs
    const len = 5 + ((Math.floor(t * 12) + y) % 4);
    rect(bx + 4, y, len, 1, beamColor);
    rect(bx + 4, y, Math.max(2, len - 3), 1, coreColor);
  }
}

function drawRunner(x, y, t) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const isHit = state.hitTimer > 0;
  const isUnlocking = state.unlockTimer > 0;

  let pose = 'idle';
  if (state.mode === 'PLAYING' && !state.paused) {
    pose = 'run';
  } else if (state.mode === 'WIN') {
    pose = 'win';
  } else if (state.mode === 'LOSE') {
    pose = 'lose';
  }

  const frame = Math.floor(t * 8);
  const bob = pose === 'run' ? (frame % 2 === 0 ? 0 : -1) : pose === 'idle' ? (Math.floor(t * 2) % 2 === 0 ? 0 : -1) : 0;

  if (pose === 'lose') {
    // Fallen / knocked down
    rect(rx - 4, ry - 4, 9, 3, PAL.suit);
    rect(rx + 4, ry - 5, 4, 4, PAL.skin);
    rect(rx + 5, ry - 5, 3, 1, PAL.hair);
    rect(rx - 6, ry - 3, 3, 2, PAL.boots);
    return;
  }

  const top = ry - 14 + bob;
  const suitMain = isHit && frame % 2 === 0 ? PAL.white : PAL.suit;
  const suitAccent = isHit && frame % 2 === 0 ? PAL.red : PAL.suitBlue;

  // Head
  rect(rx + 1, top, 5, 4, PAL.skin);
  rect(rx + 1, top - 1, 5, 2, PAL.hair);
  px(rx + 5, top + 1, PAL.hazardDark); // eye

  // Torso (yellow/blue jumpsuit)
  rect(rx + 1, top + 4, 5, 5, suitMain);
  rect(rx + 2, top + 5, 2, 3, suitAccent);

  if (pose === 'idle') {
    // Calm standing, slight head/arm idle
    rect(rx + 1, top + 9, 2, 4 - bob, PAL.suitShade);
    rect(rx + 4, top + 9, 2, 4 - bob, PAL.boots);
    rect(rx + 6, top + 5, 2, 2, PAL.skin);
    px(rx + 7, top + 4, PAL.cyan); // wrist pad glow
  } else if (pose === 'win') {
    // Arms raised celebrating!
    rect(rx - 1, top + 1, 2, 3, suitMain);
    px(rx - 1, top, PAL.skin);
    rect(rx + 6, top + 1, 2, 3, suitMain);
    px(rx + 7, top, PAL.skin);
    rect(rx + 1, top + 9, 2, 5, PAL.boots);
    rect(rx + 4, top + 9, 2, 5, PAL.boots);
  } else {
    // Running sprint toward vault door!
    const phase = frame % 4;
    if (phase === 0) {
      rect(rx - 1, top + 9, 3, 3, PAL.suitShade);
      rect(rx - 2, ry - 2, 2, 2, PAL.boots);
      rect(rx + 5, top + 9, 2, 3, suitMain);
      rect(rx + 6, ry - 2, 2, 2, PAL.boots);
      rect(rx + 6, top + 5, 2, 2, PAL.skin);
    } else if (phase === 1 || phase === 3) {
      rect(rx + 2, top + 9, 2, 4 - bob, PAL.boots);
      rect(rx + 4, top + 9, 2, 3 - bob, PAL.suitShade);
      rect(rx + 5, top + 6, 2, 2, PAL.skin);
    } else {
      rect(rx + 4, top + 9, 3, 3, PAL.suitShade);
      rect(rx + 6, ry - 2, 2, 2, PAL.boots);
      rect(rx, top + 9, 2, 3, suitMain);
      rect(rx - 1, ry - 2, 2, 2, PAL.boots);
      rect(rx - 1, top + 5, 2, 2, PAL.skin);
    }

    if (isUnlocking) {
      // Speed lines behind runner
      rect(rx - 6, top + 3, 4, 1, PAL.cyan);
      rect(rx - 8, top + 7, 5, 1, PAL.green);
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
  if (state.hitTimer > 0) {
    state.hitTimer = Math.max(0, state.hitTimer - dt);
  }
  if (state.unlockTimer > 0) {
    state.unlockTimer = Math.max(0, state.unlockTimer - dt);
  }

  const t = state.elapsedAnim;

  ctx.clearRect(0, 0, W, H);
  drawRoomBackground(t);
  drawVaultDoor(t);

  // Laser position
  let laserX = 14;
  if (state.mode === 'PLAYING') {
    laserX = 14 + Math.max(0, Math.min(1, state.progress)) * 84;
  } else if (state.mode === 'LOSE') {
    laserX = 100;
  }

  // Target runner position
  let targetRunnerX = 68;
  if (state.mode === 'STANDBY') {
    targetRunnerX = 68;
  } else if (state.mode === 'WIN') {
    targetRunnerX = 132;
  } else if (state.mode === 'LOSE') {
    targetRunnerX = 104;
  } else {
    const roundFrac = state.totalRounds > 0 ? state.currentRound / state.totalRounds : 0;
    const baseProgressX = 48 + roundFrac * 56;
    targetRunnerX = Math.max(laserX + 16, Math.min(110, baseProgressX));
  }

  // Smoothly interpolate runnerX
  state.runnerX += (targetRunnerX - state.runnerX) * Math.min(1, dt * 8);

  drawLaserBarrier(laserX, t);
  drawRunner(state.runnerX, FLOOR_Y, t);

  // Hit flash overlay inside scene
  if (state.hitTimer > 0) {
    ctx.fillStyle = 'rgba(255, 51, 102, 0.28)';
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
