import Badge from 'components/base/Badge';
import { clientBase, isKnownClient } from 'helpers/clients';
import { explorerAddress } from 'helpers/explorer';
import { formatLamports } from 'helpers/utils';
import { ActivityEvent, HostState } from 'providers/vortex-schemas';
import { ReactNode } from 'react';

/** Each kind of vote-account change: its label, and whether it touches
 *  what a leak would cost delegators (the withdrawer, withdrawals). */
export const CHANGE_KIND: Record<
  string,
  { label: string; bg: 'warning' | 'info' | 'secondary' | 'primary' }
> = {
  withdrawer: { label: 'Withdrawer', bg: 'warning' },
  withdraw: { label: 'Withdrawal', bg: 'warning' },
  voter: { label: 'Voter', bg: 'info' },
  identity: { label: 'Identity', bg: 'info' },
  inflationCommission: { label: 'Inflation commission', bg: 'primary' },
  blockRevenueCommission: { label: 'Block-reward commission', bg: 'primary' },
  inflationCollector: { label: 'Inflation collector', bg: 'secondary' },
  blockRevenueCollector: { label: 'Block-reward collector', bg: 'secondary' },
  create: { label: 'Created', bg: 'secondary' },
  // Host changes (where and what it runs).
  failover: { label: 'Failover', bg: 'info' },
  migration: { label: 'Migration', bg: 'primary' },
  software: { label: 'Software', bg: 'secondary' }
};

/** The host-change kinds (no transaction, no signer). */
export const HOST_KINDS = new Set(['failover', 'migration', 'software']);

/** Versions compared by their numbers, then a release (no suffix) above
 *  its pre-releases: 4.3.2 < 4.4.0-rc.0 < 4.4.0-rc.1 < 4.4.0. */
const compareVersions = (a: string, b: string) => {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map(Number), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre == null) return 1;
  if (y.pre == null) return -1;
  return x.pre.localeCompare(y.pre, undefined, { numeric: true });
};

/** A software change as what it was: a client switch (another base
 *  client), else an upgrade or downgrade of the version. */
export const softwareLabel = (e: ActivityEvent) => {
  const base = (id: string | null | undefined) =>
    id && isKnownClient(id) ? clientBase(id) : id;
  const from = e.before;
  const to = e.after;
  if (base(from?.clientId) !== base(to?.clientId)) return 'Client switch';
  if (from?.version && to?.version) {
    const c = compareVersions(to.version, from.version);
    if (c > 0) return 'Upgrade';
    if (c < 0) return 'Downgrade';
  }
  return null;
};

export const ChangeBadge = ({
  kind,
  label
}: {
  kind: string;
  /** In place of the kind's label (a software change's "Upgrade"). */
  label?: string | null;
}) => {
  const k = CHANGE_KIND[kind];
  return (
    <Badge bg={k?.bg ?? 'secondary'} className="text-nowrap">
      {label ?? k?.label ?? kind}
    </Badge>
  );
};

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** An address as a short monospace link to Explorer, its whole on hover. */
export const ShortAddress = ({
  address,
  isTestnet
}: {
  address: string;
  isTestnet: boolean;
}) => (
  <a
    href={explorerAddress(address, isTestnet)}
    target="_blank"
    rel="noreferrer"
    className="font-monospace"
    title={address}
  >
    {short(address)}
  </a>
);

const bpsPct = (v: unknown) =>
  typeof v === 'number' ? `${(v / 100).toLocaleString()}%` : null;

/** Where a host is ("Frankfurt, DE · OVH SAS") and, for a software
 *  change, what it runs ("Agave 4.3.2"). */
const placeOf = (h: HostState | null | undefined) =>
  [
    [h?.geo?.city, h?.geo?.countryCode].filter(Boolean).join(', '),
    h?.geo?.asnOrganization
  ]
    .filter(Boolean)
    .join(' · ');
const hostText = (
  h: HostState | null | undefined,
  other: HostState | null | undefined,
  software: boolean
) => {
  if (!h) return null;
  // The base client and its version ("Agave 4.3.2"): which fork it builds
  // blocks with (Jito, BAM, Harmonic) is left out.
  const client =
    h.clientId && isKnownClient(h.clientId)
      ? clientBase(h.clientId)
      : h.clientId;
  const run = [client, h.version].filter(Boolean).join(' ');
  if (software) return run || null;
  const place = placeOf(h);
  const host = h.host != null ? `host ${h.host}` : null;
  // Two hosts in the same place (a failover within a data center): which.
  if (place && host && place === placeOf(other)) return `${place} (${host})`;
  return place || host;
};

/** A change's value (new or old) as the UI shows it: an address linked,
 *  a commission as a percent, a withdrawal's amount and recipient, a
 *  creation's commissions, a host's place (or what it runs). null: nothing to show. */
export const changeValue = (
  e: ActivityEvent,
  which: 'new' | 'old',
  isTestnet: boolean
): ReactNode => {
  if (HOST_KINDS.has(e.kind))
    return hostText(
      which === 'new' ? e.after : e.before,
      which === 'new' ? e.before : e.after,
      e.kind === 'software'
    );
  const v = which === 'new' ? e.newValue : e.oldValue;
  if (e.kind === 'inflationCommission' || e.kind === 'blockRevenueCommission')
    return bpsPct(v);
  if (e.kind === 'create') {
    if (which === 'old' || !v || typeof v !== 'object') return null;
    const c = v as Record<string, unknown>;
    const parts = [
      bpsPct(c.inflationCommissionBps) &&
        `${bpsPct(c.inflationCommissionBps)} inflation`,
      bpsPct(c.blockRevenueCommissionBps) &&
        `${bpsPct(c.blockRevenueCommissionBps)} block rewards`
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'new vote account';
  }
  if (e.kind === 'withdraw') {
    if (which === 'old') return null;
    return (
      <>
        {e.lamports != null && (
          <span className="font-monospace">
            {formatLamports(e.lamports, 2)}
          </span>
        )}
        {typeof v === 'string' && (
          <>
            {' to '}
            <ShortAddress address={v} isTestnet={isTestnet} />
          </>
        )}
      </>
    );
  }
  if (typeof v !== 'string') return null;
  const bls = which === 'new' ? e.blsPubkey : e.oldBlsPubkey;
  return (
    <>
      <ShortAddress address={v} isTestnet={isTestnet} />
      {e.kind === 'voter' && bls && (
        <span className="text-body-tertiary" title={`BLS key ${bls}`}>
          {' '}
          + BLS key
        </span>
      )}
    </>
  );
};

/** When an event happened (unix s): its block's time, or when a host
 *  change was first seen. */
export const eventTime = (e: ActivityEvent) =>
  e.blockTime ?? e.observedAt ?? e.time ?? null;

/** "12 min ago" / "3 h ago" / "Oct 27": when a change landed. */
export const whenText = (unixS: number | null) => {
  if (unixS == null) return null;
  const secs = Date.now() / 1000 - unixS;
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min ago`;
  if (secs < 86_400) return `${Math.round(secs / 3600)} h ago`;
  return new Date(unixS * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
};
