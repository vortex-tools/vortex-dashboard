/**
 * Client version order and the Versions page's colors, shared with the
 * Validators table so a version reads the same everywhere.
 */

/** The default target: the newest version (a release, or a candidate
 *  being rolled out) holding at least this share of its client's stake. */
export const TARGET_MIN = 0.05;

// At or above the target: greens, newest darkest. Below: amber to red,
// oldest reddest.
export const AHEAD = ['#1a7f37', '#25b003', '#5cc93a', '#8fd877', '#b9e6a8'];
export const BEHIND = ['#e5a00b', '#e5780b', '#d9542b', '#c0392b', '#962d22'];
export const AHEAD_OTHER = '#cfeec4';
// A pre-release of the target's own version: light greens, between the
// target's and the behind side's.
export const CANDIDATE = ['#9fd88a', '#bde4ae'];
export const BEHIND_OTHER = '#f3c9a6';

type Semver = [number, number, number, string | null];
export const parse = (v: string): Semver | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v);
  return m ? [+m[1], +m[2], +m[3], m[4] ?? null] : null;
};
/** Version order: a pre-release (4.4.0-rc.0) comes before its release;
 *  an unparseable version first of all. */
export const cmp = (a: string, b: string) => {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0) || a.localeCompare(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return +x[i]! - +y[i]!;
  if (x[3] === y[3]) return 0;
  if (x[3] == null) return 1;
  if (y[3] == null) return -1;
  return x[3].localeCompare(y[3], undefined, { numeric: true });
};
export const isRelease = (v: string) => parse(v)?.[3] === null;

/** The Versions page's default target from a client's stake by version:
 *  the newest version with TARGET_MIN of it, else the newest release. */
export const defaultTarget = (stakeByVersion: Map<string, number>) => {
  const total = [...stakeByVersion.values()].reduce((a, x) => a + x, 0);
  const versions = [...stakeByVersion.keys()]
    .filter(v => parse(v))
    .sort((a, b) => cmp(b, a));
  return (
    versions.find(
      v => total > 0 && (stakeByVersion.get(v) ?? 0) / total >= TARGET_MIN
    ) ??
    versions.find(isRelease) ??
    versions[0] ??
    null
  );
};

/** How far a version is from its client's target: at or above it
 *  (green); a pre-release of the target's own version, e.g. 4.4.0-rc.1
 *  under 4.4.0 (light green: the candidate it was asked to run); the
 *  newest version below that (amber); or older still (red). */
export type VersionStanding = 'current' | 'candidate' | 'behind' | 'old';
/** Same version numbers (4.4.0-rc.1 and 4.4.0). */
export const sameRelease = (a: string, b: string) => {
  const x = parse(a);
  const y = parse(b);
  return !!x && !!y && x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
};
export const versionStandings = (versions: string[], target: string) => {
  const behind = [...new Set(versions)]
    .filter(v => parse(v) && cmp(v, target) < 0 && !sameRelease(v, target))
    .sort((a, b) => cmp(b, a));
  const out = new Map<string, VersionStanding>();
  for (const v of versions)
    if (parse(v))
      out.set(
        v,
        cmp(v, target) >= 0
          ? 'current'
          : sameRelease(v, target)
            ? 'candidate'
            : v === behind[0]
              ? 'behind'
              : 'old'
      );
  return out;
};
