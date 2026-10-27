import Badge from 'components/base/Badge';
import { Link } from 'react-router';
import {
  ClientVersionLists,
  SimdRollup,
  FeatureClusterState,
  FeatureGate,
  FeatureReadiness
} from 'providers/vortex-schemas';

/** The clusters a gate is tracked on, in display order. */
export const CLUSTERS = [
  { key: 'mainnet-beta', label: 'Mainnet' },
  { key: 'testnet', label: 'Testnet' },
  { key: 'devnet', label: 'Devnet' }
] as const;
export const clusterLabel = (key: string | null | undefined) =>
  CLUSTERS.find(c => c.key === key)?.label ?? key ?? '—';

/** A gate's name without its SIMD prefix ("SIMD-0512: SHA512 Syscall"
 *  -> "SHA512 Syscall"; "SIMD-0437-3: ..." too): the SIMD has its own
 *  column and link. */
export const gateName = (name: string) =>
  name.replace(/^SIMD-?\d+(-\d+)?\s*:\s*/i, '') || name;

/** The tracker's title, else agave's name, else the id. */
export const featureName = (f: Pick<FeatureGate, 'id' | 'name' | 'title'>) => {
  const n = f.title ?? f.name;
  return n ? gateName(n) : `${f.id.slice(0, 6)}…${f.id.slice(-6)}`;
};

export const simdLabel = (n: number) => `SIMD-${String(n).padStart(4, '0')}`;

/** SIMDs as links to their pages here. */
export const SimdLinks = ({ simds }: { simds: number[] }) =>
  simds.length ? (
    <span className="text-nowrap">
      {simds.map((n, i) => (
        <span key={n}>
          {i > 0 && ', '}
          <Link to={`/simd/${n}`}>{simdLabel(n)}</Link>
        </span>
      ))}
    </span>
  ) : (
    <span className="text-body-quaternary">—</span>
  );

/** A place in the tracker's queue: "Next in line", "2nd in line". */
export const inLine = (position: number) => {
  if (position <= 1) return 'Next in line';
  const tens = position % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[
          position % 10
        ] ?? 'th');
  return `${position}${suffix} in line`;
};

/** A gate's state on one cluster: active (from epoch N), queued (at the
 *  next epoch boundary), waiting at #k in the tracker's queue, or not
 *  scheduled. */
export const StatusChip = ({
  state
}: {
  state: FeatureClusterState | undefined;
}) => {
  if (!state) return <span className="text-body-quaternary">—</span>;
  if (state.status === 'active')
    return (
      <Badge
        bg="success"
        title={
          state.slot != null ? `Slot ${state.slot.toLocaleString()}` : undefined
        }
      >
        Active{state.epoch != null && ` · ${state.epoch.toLocaleString()}`}
      </Badge>
    );
  if (state.status === 'skipped')
    return (
      <Badge
        bg="secondary"
        className="text-nowrap"
        title="This cluster will not get the feature"
      >
        Won&apos;t activate
      </Badge>
    );
  if (state.status === 'queued')
    return (
      <Badge
        bg="primary"
        title="The feature account exists: it activates at the next epoch boundary"
      >
        Next epoch
      </Badge>
    );
  if (state.queuePosition != null)
    return (
      <Badge
        bg="info"
        title="Its place in the tracker's queue for this cluster"
      >
        {inLine(state.queuePosition)}
      </Badge>
    );
  return <Badge bg="secondary">Not scheduled</Badge>;
};

const CLIENT_LABEL: Record<string, string> = {
  agave: 'Agave',
  firedancer: 'Firedancer',
  frankendancer: 'Frankendancer',
  jito: 'Jito'
};
export const clientLabel = (c: string) => CLIENT_LABEL[c] ?? c;

// Min versions are shown for these clients only: Frankendancer is end of
// life, and Jito is held to Agave's.
const MIN_VERSION_CLIENTS: (keyof ClientVersionLists)[] = [
  'agave',
  'firedancer'
];

/** "Agave 4.1.0-beta.0 · Firedancer 1.0", the clients with a listed min. */
export const MinVersions = ({
  versions,
  className
}: {
  versions: ClientVersionLists;
  className?: string;
}) => {
  const parts = MIN_VERSION_CLIENTS.filter(c => versions[c].length).map(
    c =>
      `${CLIENT_LABEL[c]} ${versions[c].map(v => v.replace(/^v/, '')).join(' / ')}`
  );
  return parts.length ? (
    <span className={className}>{parts.join(' · ')}</span>
  ) : (
    <span className="text-body-quaternary">—</span>
  );
};

/** Activated stake whose node runs at least the gate's min version for
 *  its client: ready (green), not ready (red), unknown (gray). */
export const ReadinessBar = ({
  readiness,
  height = 8
}: {
  readiness: FeatureReadiness | null | undefined;
  height?: number;
}) => {
  if (!readiness?.totalStake)
    return <span className="text-body-quaternary">—</span>;
  const t = readiness.totalStake;
  const parts = [
    { v: readiness.readyStake, color: 'var(--vx-success)', label: 'ready' },
    {
      v: readiness.notReadyStake,
      color: 'var(--vx-danger)',
      label: 'not ready'
    },
    {
      v: readiness.unknownStake,
      color: 'var(--vx-quaternary-color)',
      label: 'unknown'
    }
  ];
  return (
    <div className="d-flex align-items-center gap-2">
      <div
        className="d-flex flex-grow-1 rounded-1 overflow-hidden bg-body-highlight"
        style={{ height, minWidth: 60 }}
        title={parts.map(p => `${p.label} ${pctOf(p.v, t)}`).join(' · ')}
      >
        {parts.map(p =>
          p.v ? (
            <div
              key={p.label}
              style={{ width: `${(p.v / t) * 100}%`, background: p.color }}
            />
          ) : null
        )}
      </div>
      <span className="font-monospace fs-10 text-nowrap">
        {pctOf(readiness.readyStake, t)}
      </span>
    </div>
  );
};

export const pctOf = (v: number, total: number) => {
  if (!total) return '—';
  const p = (v / total) * 100;
  return p > 0 && p < 0.1
    ? '<0.1%'
    : p > 99.9 && p < 100
      ? '>99.9%'
      : `${p.toFixed(1)}%`;
};

/** How far a SIMD's own gates have activated on one cluster. */
export const StageChip = ({ rollup }: { rollup: SimdRollup | undefined }) => {
  if (!rollup || rollup.stage === 'noGate' || !rollup.gates)
    return <span className="text-body-quaternary">No gate</span>;
  const of = rollup.gates > 1 ? ` · ${rollup.active} of ${rollup.gates}` : '';
  if (rollup.stage === 'active')
    return (
      <Badge bg="success" className="text-nowrap">
        Active
        {rollup.lastActivationEpoch != null &&
          ` · ${rollup.lastActivationEpoch.toLocaleString()}`}
      </Badge>
    );
  if (rollup.stage === 'partial')
    return (
      <Badge
        bg="info"
        className="text-nowrap"
        title={`${rollup.active} of its ${rollup.gates} gates active`}
      >
        Partly active{of}
      </Badge>
    );
  if (rollup.queued)
    return (
      <Badge bg="primary" className="text-nowrap">
        Next epoch
      </Badge>
    );
  if (rollup.nextQueuePosition != null)
    return (
      <Badge bg="info" className="text-nowrap">
        {inLine(rollup.nextQueuePosition)}
      </Badge>
    );
  return (
    <Badge bg="secondary" className="text-nowrap">
      Not scheduled
    </Badge>
  );
};

/** Where a SIMD-to-feature claim comes from. */
export const SIMD_SOURCE: Record<string, string> = {
  wiki: 'Feature Gate Tracker',
  agaveName: "agave's feature name",
  simdFrontMatter: "the SIMD's feature line",
  trackingIssue: 'the tracking issue',
  simdText: "the SIMD's text",
  curated: 'Vortex review'
};

/** Why a feature needs no SIMD. */
export const SIMD_EXEMPT_REASON: Record<string, string> = {
  'pre-simd': 'predates the SIMD process',
  implementation:
    'changes how agave does something, not what programs or validators see',
  rollout: 'only coordinates a rollout',
  'security-toggle': "switches a SIMD's program off or back on around a fix"
};
