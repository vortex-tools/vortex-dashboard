/**
 * A block footer's userAgent, for people: "agave/4.4.0-beta.1 (src:…;
 * feat:…; client:JitoLabs)" -> "Agave 4.4.0-beta.1 · Jito". Some leaders
 * send none ("not reported"); one sends a changing binary value the API
 * serves as base64 ("obfuscated"); Mithril sends just "mithril".
 */
const CLIENTS: Record<string, string> = {
  JitoLabs: 'Jito',
  Agave: '',
  Firedancer: '',
  Frankendancer: '',
  AgaveBam: 'BAM',
  Bam: 'BAM',
  BAM: 'BAM',
  Harmonic: 'Harmonic',
  HarmonicAgave: 'Harmonic',
  Rakurai: 'Rakurai'
};

export type UserAgentKind = 'ok' | 'empty' | 'binary';

export const parseUserAgent = (
  ua: string | null | undefined,
  /** The API's own verdict (userAgentKind), when it sends one. */
  kind?: string | null
): { kind: UserAgentKind; label: string } => {
  const t = (ua ?? '').trim();
  if (kind === 'empty' || !t) return { kind: 'empty', label: 'not reported' };
  // The API calls anything that decodes as base64 binary - which a bare
  // client name like "mithril" does too. A short plain word is a name.
  if (kind === 'binary' && !/^[a-z][a-z0-9-]{1,15}$/.test(t))
    return { kind: 'binary', label: 'obfuscated' };
  // A bare client name (no version): "mithril" -> "Mithril".
  if (/^[a-z][a-z0-9-]{1,15}$/.test(t))
    return { kind: 'ok', label: t.charAt(0).toUpperCase() + t.slice(1) };
  const m = t.match(/^([A-Za-z][\w-]*)\/(\S+)(?:\s*\((.*)\))?$/);
  if (!m) {
    // No name/version shape: a base64-looking blob is the binary kind.
    return /^[A-Za-z0-9+/=]{24,}$/.test(t)
      ? { kind: 'binary', label: 'obfuscated' }
      : { kind: 'ok', label: t.slice(0, 40) };
  }
  const [, name, version, rest] = m;
  const client = rest?.match(/client:\s*([\w-]+)/)?.[1];
  const flavor = client ? (CLIENTS[client] ?? client) : '';
  const base = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    kind: 'ok',
    label: `${base} ${version}${flavor ? ` · ${flavor}` : ''}`
  };
};
