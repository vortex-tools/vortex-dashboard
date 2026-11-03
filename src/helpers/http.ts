/**
 * GET a JSON endpoint with fetch: the query from `params` (null /
 * undefined left out, arrays joined with commas - the API's
 * serde_urlencoded doesn't read repeated keys), a timeout, and a non-2xx
 * answer thrown as an HttpError. It keeps the shape apiHealth reads
 * (isAxiosError, response.status) from when this was axios.
 */
export class HttpError extends Error {
  readonly isAxiosError = true;
  readonly response: { status: number; data: unknown };
  constructor(status: number, data: unknown) {
    super(`Request failed with status code ${status}`);
    this.name = 'HttpError';
    this.response = { status, data };
  }
}

export const getJson = async (
  url: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15_000
): Promise<unknown> => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params))
    if (v != null)
      u.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  // A network error (TypeError) or the timeout (TimeoutError) throws as
  // is: apiHealth reads both as unreachable.
  const res = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // not JSON
    }
    throw new HttpError(res.status, data);
  }
  return res.json();
};
