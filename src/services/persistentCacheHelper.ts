/**
 * 💾 Persistenter Cache-Helper via localStorage.
 *
 * Notwendig, weil iOS PWAs den JavaScript-Prozess aggressiv beenden — selbst
 * zwischen Tab-Wechseln innerhalb derselben App-Session. Modul-Level RAM-Caches
 * sind in dem Moment weg, ohne localStorage-Backup gibt es nichts zu cachen.
 *
 * Diese Helper sind SSR-safe (prüfen auf typeof window) und schlucken alle
 * Storage-Fehler still — z.B. wenn der User Storage deaktiviert hat oder das
 * Quota voll ist. Bei Fehlern verhält sich die App wie ohne Cache.
 */

const CACHE_PREFIX = 'jassguru:cache:';

export function persistToStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota voll oder localStorage disabled — kein Fallback nötig.
  }
}

export function loadFromStorage<T = unknown>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function removeFromStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_PREFIX + key);
  } catch {}
}

/**
 * Entfernt alle Einträge mit unserem Prefix. Wird typischerweise nach Session-
 * Abschluss aufgerufen (volle Cache-Invalidierung).
 */
export function clearAllStorageCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => window.localStorage.removeItem(k));
  } catch {}
}
