import { recordPath } from 'components/validator/ConsensusRecordHeader';
import {
  NOT_ADMITTED_REASONS,
  epochParticipationRate,
  isIngested
} from 'helpers/participation';
import { Table } from 'react-bootstrap';
import { formatLamports } from 'helpers/utils';
import { Link } from 'react-router';
import DelayedSpinner from 'components/common/DelayedSpinner';
import { missCausesLine } from 'components/validator/ProducerMissesTable';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import useLiveRefresh from 'hooks/useLiveRefresh';
import {
  EpochParticipation,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';

/** Epochs listed on the Overview. */
const ROWS = 10;

const REFRESH_MS = 60_000;

const pct = (v: number | null) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;

const Dash = () => <span className="text-body-tertiary">—</span>;

/**
 * Per-epoch participation, newest first - the Alpenglow counterpart of
 * the Tower Recent Voting table. Each epoch links to its consensus record.
 */
const ParticipationTable = ({
  rows,
  currentEpoch,
  voteAddress,
  linkAddress
}: {
  rows: EpochParticipation[];
  currentEpoch: number | null;
  voteAddress: string;
  linkAddress?: string;
}) => {
  const newest = [...rows].reverse();
  const hasRank = rows.some(r => r.rank != null);
  const hasRewards = rows.some(r => r.rewards);
  const cols = hasRewards ? 5 : 4;
  if (!newest.length)
    return (
      <p className="text-body-tertiary fs-9 mb-0">No consensus epochs yet.</p>
    );
  return (
    <Table responsive size="sm" className="data-table fs-9 mb-0">
      <thead className="text-nowrap">
        <tr>
          <th>Epoch</th>
          {hasRank && <th className="text-end">Rank</th>}
          <th
            className="text-end"
            title="(notarize + skip votes) / eligible slots"
          >
            Participation
          </th>
          <th
            className="text-end"
            title="Blocks it voted skip on that the cluster notarized: the block reached it late, or it was slow. Still paid."
          >
            Skipped blocks
          </th>
          <th
            className="text-end"
            title="Eligible slots where its vote isn't in the reward certificates"
          >
            Missed
          </th>
          <th
            className="text-end"
            title="How often its notarize vote was among the first 80% of stake to reach the next leader (in the fast-finality certificate). Partly where it sits relative to the leaders; not rewarded."
          >
            Fast Votes
          </th>
          {hasRewards && (
            <th
              className="text-end"
              title="Earned by its votes (gross, before commission); missed (unpaid) on hover"
            >
              Rewards
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {newest.map(r => {
          const counted = r.admitted && isIngested(r);
          const fin =
            r.finalizedCerts > 0 ? r.finalizedSlots / r.finalizedCerts : null;
          return (
            <tr key={r.epoch}>
              <td className="text-nowrap">
                <Link
                  to={recordPath(linkAddress ?? voteAddress, r.epoch, 'votes')}
                >
                  {r.epoch}
                </Link>
                {r.epoch === currentEpoch && (
                  <span className="text-body-tertiary fs-10 ms-1">
                    (current)
                  </span>
                )}
                {currentEpoch != null && r.epoch > currentEpoch && (
                  <span className="text-body-tertiary fs-10 ms-1">(next)</span>
                )}
              </td>
              {hasRank && (
                <td className="text-end font-monospace">
                  {r.rank != null ? r.rank + 1 : <Dash />}
                </td>
              )}
              {!r.admitted ? (
                <td colSpan={cols} className="text-end text-danger">
                  Not admitted
                  {currentEpoch != null && r.epoch > currentEpoch
                    ? ' next epoch'
                    : ''}
                  <NotAdmittedReason
                    epoch={r.epoch}
                    voteAddress={voteAddress}
                  />
                </td>
              ) : !counted ? (
                <td colSpan={cols} className="text-end text-body-tertiary">
                  Not ingested
                </td>
              ) : (
                <>
                  <td className="text-end font-monospace text-success fw-semibold">
                    {pct(epochParticipationRate(r))}
                  </td>
                  <td className="text-end font-monospace text-warning fw-semibold">
                    {r.skippedNotarizedSlots.toLocaleString()}
                  </td>
                  <td
                    className="text-end font-monospace text-danger fw-semibold"
                    title={missCausesLine(r.missCauses) ?? undefined}
                  >
                    {r.missedSlots.toLocaleString()}
                  </td>
                  <td className="text-end font-monospace">{pct(fin)}</td>
                  {hasRewards && (
                    <td
                      className="text-end font-monospace text-nowrap"
                      title={
                        r.rewards
                          ? `missed ${formatLamports(r.rewards.missedLamports, 4)} (unpaid)`
                          : undefined
                      }
                    >
                      {r.rewards ? (
                        formatLamports(r.rewards.votingLamports, 2)
                      ) : (
                        <Dash />
                      )}
                    </td>
                  )}
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

/**
 * Why a validator isn't admitted for an epoch, from that epoch's rank map
 * (/alpenglow/rank-map, ~64 KB gzipped). Fetched lazily - only once a
 * not-admitted line is shown - and through the provider's per-epoch cache,
 * so a map the consensus record page already loaded is reused.
 */
const NotAdmittedReason = ({
  epoch,
  voteAddress
}: {
  epoch: number;
  voteAddress: string;
}) => {
  const context = useContext(VortexDataContext);
  const fetchRankMap = context?.rankMapState.fetchData;
  useEffect(() => {
    fetchRankMap?.(epoch);
  }, [fetchRankMap, epoch]);
  const reason = context?.rankMapState.data
    .get(epoch)
    ?.notAdmitted.find(n => n.voteAddress === voteAddress)?.reason;
  if (!reason) return null;
  return (
    <span className="text-body-tertiary fw-normal">
      {' '}
      ({NOT_ADMITTED_REASONS[reason] ?? reason.replace(/_/g, ' ')})
    </span>
  );
};

/**
 * Consensus card for the validator page (Alpenglow clusters), from
 * /epochs/participation: a per-epoch participation table like the Tower
 * Recent Voting card. Admission only shows when it's a problem: a
 * not-admitted epoch says so with the reason, and next epoch (rows exist an
 * epoch ahead) is listed only if it won't be admitted.
 */
const ValidatorConsensus = ({
  voteAddress,
  linkAddress
}: {
  voteAddress: string;
  /** The address its links use (the node identity, when known). */
  linkAddress?: string;
}) => {
  const context = useContext(VortexDataContext);
  const slice = context?.epochParticipationState;
  const rows = slice?.data.get(voteAddress);
  const fetchData = slice?.fetchData;
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  useEffect(() => {
    if (voteAddress) fetchData?.(voteAddress);
  }, [fetchData, voteAddress]);
  const unavailable = !rows && !slice?.isLoading && !!slice?.error;
  useLiveRefresh(!unavailable && !!voteAddress, REFRESH_MS, () => {
    fetchData?.(voteAddress, { force: true });
  });

  // Next epoch's row is admission only: listed only when it's a problem.
  const next = rows?.find(
    r => currentEpoch != null && r.epoch === currentEpoch + 1
  );
  // Chart: epochs up to the current one (the next epoch is admission only).
  const history = (rows ?? []).filter(
    r => currentEpoch == null || r.epoch <= currentEpoch
  );

  return (
    <SectionCard
      title="Voting"
      icon="activity"
      linkTo={recordPath(linkAddress ?? voteAddress, null, 'votes')}
      linkLabel="Voting record"
    >
      {unavailable ? (
        <p className="text-body-tertiary fs-9 mb-0">
          Participation isn't available for this validator right now.
        </p>
      ) : !rows ? (
        <DelayedSpinner loading label="Loading participation…" />
      ) : (
        <>
          {/* The newest ROWS epochs; the Voting record has every one. */}
          <ParticipationTable
            rows={(next && !next.admitted ? [...history, next] : history).slice(
              -ROWS
            )}
            currentEpoch={currentEpoch}
            voteAddress={voteAddress}
            linkAddress={linkAddress}
          />
        </>
      )}
    </SectionCard>
  );
};

export default ValidatorConsensus;

/**
 * Tile for the validator page's grid on Alpenglow clusters (in place of
 * the Tower voting rank): this epoch's participation so far. Reads the
 * slice ValidatorConsensus fetches.
 */
export const ParticipationTile = ({
  voteAddress,
  linkAddress
}: {
  voteAddress: string;
  linkAddress?: string;
}) => {
  const context = useContext(VortexDataContext);
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const row = context?.epochParticipationState.data
    .get(voteAddress)
    ?.find(r => r.epoch === currentEpoch);
  const value =
    row && !row.admitted
      ? 'Not admitted'
      : row && isIngested(row)
        ? pct(epochParticipationRate(row))
        : '—';
  return (
    <StatCard
      label="Votes Landed"
      value={value}
      sublabel="Current epoch"
      linkTo={recordPath(linkAddress ?? voteAddress, null, 'votes')}
    />
  );
};
