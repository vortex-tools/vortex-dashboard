import { poolPath } from 'components/pools/pools';
import Button from 'components/base/Button';
import StakeChangesChart, {
  stakeSetMoved
} from 'components/charts/e-charts/StakeChangesChart';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { StakeChangeEpoch } from 'providers/vortex-schemas';
import { useContext, useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const FIRST_ROWS = 10;

const sol = (lamports: number) => lamports / 1e9;
const fmt = (lamports: number, digits = 0) =>
  `◎${sol(lamports).toLocaleString('en-US', { maximumFractionDigits: digits })}`;
const signed = (lamports: number) =>
  `${lamports > 0 ? '+' : lamports < 0 ? '−' : ''}${fmt(Math.abs(lamports))}`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** A staker as people know it: a pool by name ("Helius Staked SOL",
 *  its symbol after), linking its Stake Pools page, else its withdraw
 *  authority. */
export const StakerName = ({
  label,
  withdrawer
}: {
  label: { name: string; kind: string | null; fullName?: string | null } | null;
  withdrawer: string;
}) =>
  label ? (
    <>
      <Link to={poolPath(label.name)}>{label.fullName ?? label.name}</Link>
      {(label.fullName || label.kind === 'stake-pool') && (
        <span className="text-body-tertiary fs-10 ms-1">
          {label.fullName ? label.name : 'pool'}
        </span>
      )}
    </>
  ) : (
    <span className="font-monospace">{short(withdrawer)}</span>
  );

const KIND: Record<string, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'text-success' },
  increased: { label: 'Increased', cls: 'text-success' },
  decreased: { label: 'Decreased', cls: 'text-danger' },
  exited: { label: 'Exited', cls: 'text-danger' }
};

/** One epoch's largest staker changes, with where the stake came from
 *  or went. */
const EpochChanges = ({
  it,
  onClose
}: {
  it: StakeChangeEpoch;
  onClose: () => void;
}) => {
  const [all, setAll] = useState(false);
  const rows = all ? it.changes : it.changes.slice(0, FIRST_ROWS);
  return (
    <div className="mt-3">
      <div className="d-flex flex-wrap align-items-baseline gap-2 fs-9 mb-2">
        <span className="fw-bold">Epoch {it.epoch}</span>
        <span className="font-monospace" title="Stake at the epoch's end">
          {fmt(it.stakeAfter)}
        </span>
        {stakeSetMoved(it) ? (
          <span className="text-warning">
            The vote account {it.stakeSet} the stake set: every delegation shows
            as {it.stakeSet === 'entered' ? 'new' : 'exited'}, which isn&apos;t
            stakers moving.
          </span>
        ) : (
          <span className="text-body-tertiary">
            net{' '}
            <span
              className={`font-monospace ${it.net >= 0 ? 'text-success' : 'text-danger'}`}
            >
              {signed(it.net)}
            </span>{' '}
            beyond rewards (+{fmt(it.rewardGrowth)} compounded) ·{' '}
            {it.newDelegators} new · {it.exitedDelegators} exited
          </span>
        )}
        <button
          type="button"
          className="btn btn-link p-0 fs-10 ms-auto"
          onClick={onClose}
        >
          Hide
        </button>
      </div>
      {!it.changes.length ? (
        <p className="fs-9 text-body-tertiary mb-0">
          No staker changed by 1 SOL or more this epoch.
        </p>
      ) : (
        <>
          <Table responsive size="sm" className="data-table fs-9 mb-2">
            <thead>
              <tr>
                <th>Staker</th>
                <th>Change</th>
                <th className="text-end">Net</th>
                <th className="text-end">Now</th>
                <th>From / to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => {
                const k = KIND[c.kind] ?? { label: c.kind, cls: '' };
                return (
                  <tr key={c.withdrawer}>
                    <td className="text-nowrap" title={c.withdrawer}>
                      <StakerName label={c.label} withdrawer={c.withdrawer} />
                    </td>
                    <td className={`text-nowrap ${k.cls}`}>{k.label}</td>
                    <td
                      className={`text-end font-monospace text-nowrap ${c.net >= 0 ? 'text-success' : 'text-danger'}`}
                    >
                      {signed(c.net)}
                    </td>
                    <td className="text-end font-monospace text-nowrap">
                      {fmt(c.after)}
                    </td>
                    <td className="fs-10">
                      {c.counterparts.length ? (
                        c.counterparts.map((cp, i) => (
                          <span key={cp.voteKey} className="text-nowrap">
                            {i > 0 && ', '}
                            <Link to={`/validator/${cp.voteKey}`}>
                              {cp.name ?? short(cp.voteKey)}
                            </Link>{' '}
                            <span className="text-body-tertiary font-monospace">
                              {signed(cp.net)}
                            </span>
                          </span>
                        ))
                      ) : (
                        <span className="text-body-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {(it.changes.length > FIRST_ROWS || it.moreChanges > 0) && (
            <div className="d-flex align-items-center gap-3 fs-9">
              {it.changes.length > FIRST_ROWS && (
                <Button
                  variant="link"
                  className="p-0 fs-9"
                  onClick={() => setAll(a => !a)}
                >
                  {all
                    ? 'Show fewer'
                    : `Show all ${it.changes.length.toLocaleString()}`}
                </Button>
              )}
              {it.moreChanges > 0 && (
                <span className="text-body-tertiary">
                  + {it.moreChanges.toLocaleString()} smaller changes
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/**
 * A validator's stake over completed epochs (/validators/stake-changes,
 * last 50), as two charts: Stake Changes - inflow and outflow beyond
 * reward compounding, by source pool, with stake at epoch end - and Pool
 * Holdings - each known pool's stake on it. Picking an epoch in either
 * shows its largest staker changes, with where the stake came from or
 * went, under Stake Changes.
 */
const StakeChangesCards = ({ identity }: { identity: string }) => {
  const context = useContext(VortexDataContext);
  const slice = context?.stakeChangesState;
  const items = slice?.data.get(identity);
  const fetchData = slice?.fetchData;
  const unavailable = !items && !slice?.isLoading && !!slice?.error;
  useEffect(() => {
    if (identity) fetchData?.(identity);
  }, [identity, fetchData]);

  const [selected, setSelected] = useState<number | null>(null);
  // Its staker changes show for a clicked epoch only (the card is busy
  // enough without them).
  const it =
    selected != null ? items?.find(x => x.epoch === selected) : undefined;
  const status = unavailable ? (
    <p className="text-body-tertiary fs-9 mb-0">
      Stake changes aren&apos;t available for this validator right now.
    </p>
  ) : !items ? (
    <DelayedSpinner loading label="Loading stake changes…" />
  ) : !items.length ? (
    <p className="text-body-tertiary fs-9 mb-0">
      No completed epochs with stake yet.
    </p>
  ) : null;
  const hasPools = !!items?.some(x => x.pools.some(p => p.lamports >= 1e9));

  return (
    <div className="d-flex flex-column gap-3">
      <SectionCard
        title="Stake Changes"
        icon="trending-up"
        info="Stake moves when it starts or stops earning (a delegation in epoch E shows in E + 1), without reward compounding."
      >
        {status ?? (
          <>
            <p className="fs-10 text-body-tertiary mb-3">
              Last {items!.length} completed epochs · click an epoch for who
              moved
            </p>
            {/* Stake above, flows below - two panels, one y-axis each,
                sharing hover, an edge-to-edge rule between them. */}
            <StakeChangesChart
              items={items!}
              view="stake"
              group={`stake-changes:${identity}`}
              height={150}
              selected={selected}
              onSelect={setSelected}
            />
            <hr className="mx-n3 my-3 border-translucent opacity-100" />
            <StakeChangesChart
              items={items!}
              view="flows"
              group={`stake-changes:${identity}`}
              height={210}
              // Dim the other epochs only once one is picked.
              selected={selected}
              onSelect={setSelected}
            />
            {it && (
              <EpochChanges
                key={it.epoch}
                it={it}
                onClose={() => setSelected(null)}
              />
            )}
          </>
        )}
      </SectionCard>
      <SectionCard
        title="Pool Holdings"
        icon="layers"
        info="Each known pool's stake on this validator at epoch end. Named pools cover a minority of stake."
      >
        {status ??
          (hasPools ? (
            <StakeChangesChart
              items={items!}
              view="holdings"
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <p className="fs-9 text-body-tertiary py-5 text-center mb-0">
              No known pool held stake on this validator in these epochs.
            </p>
          ))}
      </SectionCard>
    </div>
  );
};

export default StakeChangesCards;
