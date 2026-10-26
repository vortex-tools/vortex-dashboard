/**
 * localStorage, JSON-encoded, never throwing: a private window or blocked
 * storage reads as the fallback and drops writes.
 */
export const readStored = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

export const writeStored = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted; the in-memory value still applies.
  }
};
