// Shared persistence helper with remote-first, local fallback
// Configure a backend by setting VITE_API_BASE to a server that exposes:
//   GET  /state -> returns { meals, weeks, cooks, startDate, repeatCap, threshold, mode, seed }
//   PUT  /state -> accepts the same JSON body and persists it

const KEY = "familyMealPlannerAutosave";
let base = '';
try {
  base = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) || '';
} catch (_) {
  base = '';
}

async function fetchJson(url, options) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export async function loadPersisted() {
  // Try remote first if configured
  if (base) {
    try {
      const data = await fetchJson(`${base.replace(/\/$/, '')}/state`, { method: 'GET' });
      if (data && typeof data === 'object') return data;
    } catch (_) {}
  }
  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function savePersisted(state) {
  // Try remote first if configured
  if (base) {
    try {
      await fetchJson(`${base.replace(/\/$/, '')}/state`, { method: 'PUT', body: JSON.stringify(state || {}) });
      return true;
    } catch (_) {}
  }
  // Fallback to localStorage
  try {
    localStorage.setItem(KEY, JSON.stringify(state || {}));
    return true;
  } catch {
    return false;
  }
}

export function hasRemote() {
  return !!base;
}
