/**
 * Pure Web Audio API synthesizer for OVERRIDE-30.
 * Zero external audio assets; mute preference persisted under 'override30_mute'.
 */

const MUTE_STORAGE_KEY = 'override30_mute';

let audioCtx = null;
let distortionCurve = null;
let mutedState = loadMuteState();

function loadMuteState() {
  try {
    const raw = window.localStorage.getItem(MUTE_STORAGE_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

function saveMuteState(muted) {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function getDistortionCurve(amount = 45) {
  if (distortionCurve) {
    return distortionCurve;
  }
  const samples = 1024;
  const curve = new Float32Array(samples);
  const k = amount;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  distortionCurve = curve;
  return curve;
}

function getAudioContextClass() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.AudioContext || window.webkitAudioContext || null;
}

/**
 * Lazy-initialize and resume the Web Audio API context on user gesture.
 * @returns {AudioContext | null}
 */
export function initAudio() {
  const AudioCtx = getAudioContextClass();
  if (!AudioCtx) {
    return null;
  }
  if (!audioCtx) {
    try {
      audioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getActiveContext() {
  if (mutedState) {
    return null;
  }
  const ctx = initAudio();
  if (!ctx) {
    return null;
  }
  return ctx;
}

/**
 * Return current mute state.
 * @returns {boolean}
 */
export function isMuted() {
  return mutedState;
}

/**
 * Set and persist mute state.
 * @param {boolean} muted
 * @returns {boolean}
 */
export function setMuted(muted) {
  mutedState = Boolean(muted);
  saveMuteState(mutedState);
  if (!mutedState) {
    initAudio();
  }
  return mutedState;
}

/**
 * Toggle mute state and persist it.
 * @returns {boolean}
 */
export function toggleMute() {
  return setMuted(!mutedState);
}

/**
 * Clean dual technological confirmation beep (880Hz -> 1320Hz).
 */
export function playSuccess() {
  const ctx = getActiveContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const tones = [
    { freq: 880, start: 0, dur: 0.085, gain: 0.16 },
    { freq: 1320, start: 0.08, dur: 0.14, gain: 0.18 },
  ];

  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(tone.freq, now + tone.start);

    gain.gain.setValueAtTime(0.0001, now + tone.start);
    gain.gain.linearRampToValueAtTime(tone.gain, now + tone.start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + tone.start);
    osc.stop(now + tone.start + tone.dur + 0.01);
  }
}

/**
 * Harsh low distorted buzzer (~220ms) via sawtooth/square waves + WaveShaperNode.
 */
export function playError() {
  const ctx = getActiveContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 0.22;

  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistortionCurve(55);
  shaper.oversample = '2x';

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, now);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.linearRampToValueAtTime(0.24, now + 0.01);
  masterGain.gain.setValueAtTime(0.22, now + duration - 0.05);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  shaper.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(145, now);
  osc1.frequency.linearRampToValueAtTime(105, now + duration);

  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(112, now);
  osc2.frequency.linearRampToValueAtTime(84, now + duration);

  osc1.connect(shaper);
  osc2.connect(shaper);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + duration + 0.01);
  osc2.stop(now + duration + 0.01);
}

/**
 * Crisp countdown tick in the final 5 seconds (1000Hz normal, 1400Hz urgent).
 * @param {boolean} [urgent=false]
 */
export function playTick(urgent = false) {
  const ctx = getActiveContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 0.045;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = urgent ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(urgent ? 1400 : 1000, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(urgent ? 0.14 : 0.09, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.01);
}

/**
 * 4-note ascending terminal unlock fanfare on victory.
 */
export function playWin() {
  const ctx = getActiveContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [
    { freq: 523.25, start: 0.0, dur: 0.11, gain: 0.16 },
    { freq: 659.25, start: 0.095, dur: 0.11, gain: 0.17 },
    { freq: 783.99, start: 0.19, dur: 0.12, gain: 0.18 },
    { freq: 1046.5, start: 0.285, dur: 0.34, gain: 0.22 },
  ];

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.freq, now + note.start);

    gain.gain.setValueAtTime(0.0001, now + note.start);
    gain.gain.linearRampToValueAtTime(note.gain, now + note.start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + note.start);
    osc.stop(now + note.start + note.dur + 0.015);
  }
}

/**
 * Falling lowpass-filtered white noise + sub-bass drop (~700ms) on incineration.
 */
export function playExplode() {
  const ctx = getActiveContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 0.7;

  // White noise buffer
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    channel[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.setValueAtTime(1.6, now);
  filter.frequency.setValueAtTime(3200, now);
  filter.frequency.exponentialRampToValueAtTime(85, now + duration);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.linearRampToValueAtTime(0.36, now + 0.015);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + duration + 0.02);

  // Sub-bass drop
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();

  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(120, now);
  subOsc.frequency.exponentialRampToValueAtTime(26, now + duration);

  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.linearRampToValueAtTime(0.4, now + 0.012);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  subOsc.connect(subGain);
  subGain.connect(ctx.destination);

  subOsc.start(now);
  subOsc.stop(now + duration + 0.02);
}
