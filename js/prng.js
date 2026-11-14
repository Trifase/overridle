/**
 * Deterministic PRNG (Mulberry32) and daily seed helpers for OVERRIDLE.
 */

/**
 * Compute today's local calendar seed in YYYYMMDD integer format.
 * @param {Date} [date=new Date()]
 * @returns {number}
 */
export function getLocalDateSeed(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return year * 10000 + month * 100 + day;
}

/**
 * Parse an explicit `?seed=YYYYMMDD` query parameter if present and valid (> 0).
 * Returns null if absent or invalid.
 * @returns {number | null}
 */
export function getUrlSeed() {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('seed');
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Check URL query parameters for testing bypass flags
 * (`?test`, `?debug`, `?reset`, `?fresh`).
 * Present flags are enabled unless explicitly set to `'0'` or `'false'`.
 * @returns {{ bypassStorage: boolean, resetStorage: boolean }}
 */
export function getTestModeFlags() {
  if (typeof window === 'undefined' || !window.location) {
    return { bypassStorage: false, resetStorage: false };
  }
  const params = new URLSearchParams(window.location.search);
  const isTruthyFlag = (name) => {
    if (!params.has(name)) {
      return false;
    }
    const val = (params.get(name) || '').trim().toLowerCase();
    return val !== '0' && val !== 'false';
  };
  const resetStorage = isTruthyFlag('reset');
  const bypassStorage =
    resetStorage ||
    isTruthyFlag('test') ||
    isTruthyFlag('debug') ||
    isTruthyFlag('fresh');
  return { bypassStorage, resetStorage };
}

/**
 * Return the active seed: `?seed=YYYYMMDD` if valid (> 0), otherwise today's local YYYYMMDD.
 * @returns {number}
 */
export function getTodaySeed() {
  const urlSeed = getUrlSeed();
  if (urlSeed !== null) {
    return urlSeed;
  }
  return getLocalDateSeed();
}

/**
 * Derive a deterministic uint32 sub-seed for a given round index.
 * @param {number} baseSeed
 * @param {number} roundIndex
 * @returns {number}
 */
export function getSubSeed(baseSeed, roundIndex) {
  return (baseSeed + roundIndex * 9973) >>> 0;
}

/**
 * Return an inclusive random integer in [min, max] using rng.
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randInt(rng, min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.min(hi, Math.floor(rng() * (hi - lo + 1)) + lo);
}

/**
 * Pick one random element from a non-empty array using rng.
 * @template T
 * @param {() => number} rng
 * @param {readonly T[]} array
 * @returns {T | undefined}
 */
export function pick(rng, array) {
  if (!array || array.length === 0) {
    return undefined;
  }
  const idx = Math.min(array.length - 1, Math.floor(rng() * array.length));
  return array[idx];
}

/**
 * Return a new array shuffled with Fisher-Yates without mutating the input.
 * @template T
 * @param {() => number} rng
 * @param {readonly T[]} array
 * @returns {T[]}
 */
export function shuffle(rng, array) {
  const copy = Array.from(array);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Create a deterministic Mulberry32 PRNG returning floats in [0, 1),
 * with convenience methods attached directly to the returned function.
 * @param {number} seed
 */
export function mulberry32(seed) {
  let a = seed >>> 0;

  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  rng.next = rng;
  rng.randInt = (min, max) => randInt(rng, min, max);
  rng.pick = (arr) => pick(rng, arr);
  rng.shuffle = (arr) => shuffle(rng, arr);
  rng.float = (min, max) => min + rng() * (max - min);

  return rng;
}
