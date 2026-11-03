/**
 * Requests index.html started before the app loaded (vite.config's
 * earlyApi): each can be taken once, while fresh, as the Response
 * promise fetch gave. null when there's none (another API picked on
 * staging, a later read, an old one).
 */
type Early = { at: number } & Record<string, Promise<Response> | number>;

const FRESH_MS = 10_000;

export const takeEarly = (path: string): Promise<Response> | null => {
  const early = (window as unknown as { vxEarly?: Early }).vxEarly;
  const p = early?.[path];
  if (!early || !(p instanceof Promise)) return null;
  delete early[path];
  return Date.now() - early.at < FRESH_MS ? p : null;
};
