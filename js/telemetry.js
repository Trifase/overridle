const COLLECTOR_URL = 'https://overridle.trifase.online/api/event';
const VID_STORAGE_KEY = 'overridle_vid';
const SID_STORAGE_KEY = 'overridle_sid';

function makeId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getVisitorInfo() {
  let vid = '';
  let returning = false;
  try {
    const existing = window.localStorage.getItem(VID_STORAGE_KEY);
    if (existing) {
      vid = existing;
      returning = true;
    } else {
      vid = makeId('v');
      window.localStorage.setItem(VID_STORAGE_KEY, vid);
    }
  } catch {
    vid = makeId('v');
  }

  let sid = '';
  try {
    const existingSid = window.sessionStorage.getItem(SID_STORAGE_KEY);
    if (existingSid) {
      sid = existingSid;
    } else {
      sid = makeId('s');
      window.sessionStorage.setItem(SID_STORAGE_KEY, sid);
    }
  } catch {
    sid = makeId('s');
  }

  return { vid, sid, returning };
}

function isLocalHost() {
  if (typeof window === 'undefined' || !window.location) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '';
}

function sendPayload(payload, { preferBeacon = false, enabled = true } = {}) {
  if (!enabled || isLocalHost()) return;
  try {
    const body = JSON.stringify(payload);
    if (preferBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(COLLECTOR_URL, blob)) return;
    }
    if (typeof fetch === 'function') {
      fetch(COLLECTOR_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Telemetry must never break gameplay
  }
}

const visitor = typeof window !== 'undefined' ? getVisitorInfo() : { vid: '', sid: '', returning: false };

export function trackSessionStart({ seed, lang, enabled = true } = {}) {
  if (typeof window === 'undefined') return;
  let utmSource = '';
  let utmMedium = '';
  try {
    const params = new URLSearchParams(window.location.search);
    utmSource = (params.get('utm_source') || params.get('ref') || '').trim().slice(0, 64);
    utmMedium = (params.get('utm_medium') || '').trim().slice(0, 64);
  } catch {
    // ignore URL errors
  }

  const isMobile =
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
    window.innerWidth <= 768;

  sendPayload(
    {
      type: 'session_start',
      vid: visitor.vid,
      sid: visitor.sid,
      returning: visitor.returning,
      seed,
      lang: lang || 'en',
      referrer: (document.referrer || '').slice(0, 512),
      utm_source: utmSource,
      utm_medium: utmMedium,
      host: window.location.hostname || '',
      mobile: isMobile,
      vw: window.innerWidth || 0,
      vh: window.innerHeight || 0,
    },
    { enabled }
  );
}

export function trackRunStart({ mode, seed, timeLimit, autoPause, modules, enabled = true } = {}) {
  const runId = makeId('r');
  sendPayload(
    {
      type: 'run_start',
      vid: visitor.vid,
      sid: visitor.sid,
      run_id: runId,
      mode,
      seed,
      time_limit_ms: Math.round((Number(timeLimit) || 0) * 1000),
      autopause: Boolean(autoPause),
      modules: Array.isArray(modules) ? modules : [],
    },
    { enabled }
  );
  return runId;
}

export function trackRoundEnd({
  runId,
  mode,
  roundIndex,
  moduleId,
  variant = 'classic',
  outcome,
  durationMs = 0,
  budgetMs = 0,
  mistakes = 0,
  enabled = true,
} = {}) {
  if (!runId || !moduleId) return;
  sendPayload(
    {
      type: 'round_end',
      vid: visitor.vid,
      sid: visitor.sid,
      run_id: runId,
      mode,
      round_index: roundIndex,
      module_id: moduleId,
      variant: variant || 'classic',
      outcome,
      duration_ms: Math.max(0, Math.round(durationMs)),
      budget_ms: Math.max(0, Math.round(budgetMs)),
      mistakes: Math.max(0, Math.round(mistakes)),
    },
    { enabled, preferBeacon: outcome === 'abandoned' }
  );
}

export function trackRunEnd({
  runId,
  mode,
  seed,
  outcome,
  elapsedMs = 0,
  timeLimitMs = 0,
  livesLeft = 0,
  failedModuleId = null,
  failedVariant = null,
  enabled = true,
} = {}) {
  if (!runId) return;
  sendPayload(
    {
      type: 'run_end',
      vid: visitor.vid,
      sid: visitor.sid,
      run_id: runId,
      mode,
      seed,
      outcome,
      elapsed_ms: Math.max(0, Math.round(elapsedMs)),
      time_limit_ms: Math.max(0, Math.round(timeLimitMs)),
      lives_left: Math.max(0, Math.round(livesLeft)),
      failed_module_id: failedModuleId || null,
      failed_variant: failedVariant || null,
    },
    { enabled, preferBeacon: outcome === 'abandoned' }
  );
}

export function trackShareClick({ runId = null, mode = 'daily', screen = 'end', enabled = true } = {}) {
  sendPayload(
    {
      type: 'share_click',
      vid: visitor.vid,
      sid: visitor.sid,
      run_id: runId,
      mode,
      screen,
    },
    { enabled }
  );
}
