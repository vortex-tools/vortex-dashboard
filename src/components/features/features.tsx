import Badge from 'components/base/Badge';
import {
  ClientVersionLists,
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

/** The tracker's title, else agave's name, else the id. */
export const featureName = (f: Pick<FeatureGate, 'id' | 'name' | 'title'>) =>
  f.title ?? f.name ?? `${f.id.slice(0, 6)}…${f.id.slice(-6)}`;

/** A SIMD's number is its pull request in the SIMD repository. */
export const simdUrl = (n: number) =>
  `https://github.com/solana-foundation/solana-improvement-documents/pull/${n}`;
export const simdLabel = (n: number) => `SIMD-${String(n).padStart(4, '0')}`;

export const SimdLinks = ({ simds }: { simds: number[] }) =>
  simds.length ? (
    <span className="text-nowrap">
      {simds.map((n, i) => (
        <span key={n}>
          {i > 0 && ', '}
          <a href={simdUrl(n)} target="_blank" rel="noreferrer">
            {simdLabel(n)}
          </a>
        </span>
      ))}
    </span>
  ) : (
    <span className="text-body-quaternary">—</span>
  );

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
        Queue #{state.queuePosition}
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

/** "Agave 4.1.0-beta.0 · Firedancer 1.0", the clients with a listed min. */
export const MinVersions = ({
  versions,
  className
}: {
  versions: ClientVersionLists;
  className?: string;
}) => {
  const parts = (Object.keys(CLIENT_LABEL) as (keyof ClientVersionLists)[])
    .filter(c => versions[c].length)
    .map(
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
