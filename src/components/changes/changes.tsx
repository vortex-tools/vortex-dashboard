import Badge from 'components/base/Badge';
import { explorerAddress } from 'helpers/explorer';
import { formatLamports } from 'helpers/utils';
import { VoteAccountChange } from 'providers/vortex-schemas';
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
  create: { label: 'Created', bg: 'secondary' }
};

export const ChangeBadge = ({ kind }: { kind: string }) => {
  const k = CHANGE_KIND[kind];
  return (
    <Badge bg={k?.bg ?? 'secondary'} className="text-nowrap">
      {k?.label ?? kind}
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

/** A change's value (new or old) as the UI shows it: an address linked,
 *  a commission as a percent, a withdrawal's amount and recipient, a
 *  creation's commissions. null: nothing to show. */
export const changeValue = (
  e: VoteAccountChange,
  which: 'new' | 'old',
  isTestnet: boolean
): ReactNode => {
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
