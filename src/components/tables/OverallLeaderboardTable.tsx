import { ColumnDef } from '@tanstack/react-table';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import RankCell from 'components/tables/RankCell';
import { productionBlockColumns } from 'components/tables/ProductionBlockColumns';
import {
  MIN_LEADER_SLOTS,
  OverallScore,
  formatShare
} from 'helpers/consensusBoards';
import { formatLamports, formatStakeShare } from 'helpers/utils';
import {
  ParticipationLeaderboardRecord,
  ProducerLeaderboardRecord
} from 'providers/VortexDataProvider';
import { ReactElement } from 'react';
import { Link } from 'react-router';

/** A participation record with its overall score and rank. */
export interface OverallRow {
  r: ParticipationLeaderboardRecord;
  score: OverallScore | null;
  /** Competition rank (0-based) by overall share; null: not ranked. */
  rank: number | null;
  /** Leader slots it could carry votes for, so far. */
  leaderSlots: number | null;
  /** All the leader slots the epoch's schedule gives it. */
  scheduledSlots: number | null;
  /** A later record (in the table's own order) sharing this rank. */
  tie: boolean;
  /** Its producer record, if it led any slots. */
  producer: ProducerLeaderboardRecord | undefined;
}

const Dash = () => <span className="opacity-50">—</span>;
const truncateAddress = (addr: string) =>
  addr.length <= 20 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`;
const pct = (v: number | null | undefined) =>
  v == null ? <Dash /> : formatShare(v);

// Whether a column's value means something for this row. Rewards combines
// both halves, so it needs MIN_LEADER_SLOTS leader slots (none or a few:
// the production half is missing or luck); Producing needs at least one.
const hasValue = (
  id: 'share' | 'votingShare' | 'producingShare',
  x: OverallRow
) =>
  x.r.admitted &&
  (id === 'share'
    ? (x.leaderSlots ?? 0) >= MIN_LEADER_SLOTS
    : id === 'producingShare'
      ? (x.leaderSlots ?? 0) > 0
      : true);

const shareColumn = (
  id: 'share' | 'votingShare' | 'producingShare',
  header: ReactElement,
  opts: { emphasis?: boolean; opensGroup?: boolean } = {}
): ColumnDef<OverallRow> => ({
  id,
  accessorFn: x => (hasValue(id, x) ? (x.score?.[id] ?? undefined) : undefined),
  sortUndefined: 'last',
  header: () => header,
  cell: ({ row }) =>
    hasValue(id, row.original) ? (
      pct(row.original.score?.[id])
    ) : (
      <span
        className="opacity-50"
        title={
          !row.original.r.admitted
            ? 'Not admitted this epoch'
            : !row.original.leaderSlots
              ? 'No leader slots this epoch'
              : 'No leader slots so far: not ranked'
        }
      >
        —
      </span>
    ),
  meta: {
    cellProps: {
      className: `text-end font-monospace text-nowrap ${opts.emphasis ? 'fw-semibold text-body-emphasis' : 'text-body'}${opts.opensGroup ? ' border-start' : ''}`
    },
    headerProps: {
      className: `text-end text-nowrap${opts.opensGroup ? ' border-start' : ''}`
    }
  }
});

/**
 * Overall consensus leaderboard columns (one epoch): rewards earned from
 * voting and production together, as a share of what the validator's
 * stake and leader slots could have earned, then each half.
 */
export const createOverallLeaderboardColumns = (
  epoch: number | null,
  totalStake: number | null
): ColumnDef<OverallRow>[] => [
  {
    id: 'rank',
    accessorFn: x => x.rank ?? undefined,
    sortUndefined: 'last',
    cell: ({ row }) => {
      const { r, rank, tie } = row.original;
      if (!r.admitted)
        return (
          <span
            className="text-body-quaternary"
            title="Not admitted this epoch"
          >
            N/A
          </span>
        );
      if (rank == null)
        return (
          <span
            className="text-body-quaternary"
            title="No leader slots so far (or not admitted): not ranked"
          >
            N/A
          </span>
        );
      return <RankCell rank={rank} tie={tie} />;
    },
    header: () => (
      <>
        <span className="d-md-none">#</span>
        <span className="d-none d-md-inline">Rank</span>
      </>
    ),
    meta: {
      cellProps: {
        className:
          'text-body leaderboard-sticky-col leaderboard-sticky-col-rank'
      },
      headerProps: {
        className: 'leaderboard-sticky-col leaderboard-sticky-col-rank'
      }
    }
  },
  {
    id: 'validator',
    accessorFn: x => x.r.nodeName ?? x.r.nodeAddress,
    header: 'Validator',
    cell: ({ row }) => {
      const { r } = row.original;
      const known = r.nodeAddress && r.nodeAddress !== 'N/A';
      return (
        <Link
          to={
            epoch != null
              ? recordPath(r.nodeAddress ?? r.voteAddress, epoch, 'votes')
              : `/validator/${known ? r.nodeAddress : r.voteAddress}`
          }
          title={r.admitted ? undefined : 'Not admitted this epoch'}
        >
          {r.nodeName || truncateAddress(known ? r.nodeAddress : r.voteAddress)}
        </Link>
      );
    },
    meta: {
      cellProps: {
        className:
          'text-body text-truncate leaderboard-sticky-col leaderboard-sticky-col-validator leaderboard-sticky-col-last'
      },
      headerProps: {
        className:
          'leaderboard-sticky-col leaderboard-sticky-col-validator leaderboard-sticky-col-last'
      }
    }
  },
  {
    // Hidden but searchable by address.
    id: 'addresses',
    accessorFn: x => `${x.r.nodeAddress} ${x.r.voteAddress}`,
    header: 'Addresses (hidden)',
    meta: {
      cellProps: { className: 'd-none' },
      headerProps: { className: 'd-none' }
    }
  },
  {
    id: 'stake',
    accessorFn: x => x.r.stake,
    header: 'Stake',
    cell: ({ row }) => (
      <span className="d-flex justify-content-between align-items-baseline gap-3">
        <span className="text-body-tertiary fs-10">
          {totalStake != null &&
            formatStakeShare(row.original.r.stake, totalStake)}
        </span>
        <span className="font-monospace">
          {formatLamports(row.original.r.stake, 0)}
        </span>
      </span>
    ),
    meta: {
      cellProps: { className: 'text-body text-end text-nowrap' },
      headerProps: { className: 'text-end' }
    }
  },
  shareColumn(
    'share',
    <span title="Rewards earned as a share of what this validator could have earned, leaving out what was outside its control: votes in slots with no reward certificate (another leader skipped the slot that carries them), offline voters no producer could include, and the last 0.1% of a block's votes (blocks carrying 99.9%+ of online stake count as full). Its own missed votes and skipped leader slots count. Comparable across stake sizes.">
      Reward Efficiency
    </span>,
    { emphasis: true, opensGroup: true }
  ),
  {
    id: 'voting',
    header: () => (
      <span title="Its votes: the share of what its stake could earn voting, and the votes it missed">
        Voting
      </span>
    ),
    meta: {
      headerProps: { className: 'text-center border-start border-translucent' }
    },
    columns: [
      shareColumn(
        'votingShare',
        <span title="Vote rewards earned / what its stake could earn in the slots so far - its votes landed (slots with no reward certificate don't count). The Voting view's Votes Landed.">
          Votes Landed
        </span>,
        { opensGroup: true }
      ),
      {
        id: 'missedVotes',
        accessorFn: x => (x.r.admitted ? x.r.missedSlots : undefined),
        sortUndefined: 'last',
        header: () => (
          <span title="Its votes in neither reward certificate (unpaid); slots with no reward certificate don't count">
            Missed votes
          </span>
        ),
        cell: ({ row }) => {
          const { r } = row.original;
          if (!r.admitted) return <Dash />;
          return (
            <span
              className={`font-monospace${r.missedSlots > 0 ? ' text-warning fw-semibold' : ''}`}
            >
              {r.missedSlots.toLocaleString()}
            </span>
          );
        },
        meta: {
          cellProps: { className: 'text-body text-end' },
          headerProps: { className: 'text-end text-nowrap' }
        }
      }
    ]
  },
  {
    id: 'production',
    header: () => (
      <span title="Its blocks: the Production score (blocks carrying 99.9%+ of online stake count as full), its leader slots, and its slots by how the block did: Perfect (99.9%+ of online stake), OK (98-99.9%), Poor (< 98%), Skipped">
        Production
      </span>
    ),
    meta: {
      headerProps: { className: 'text-center border-start border-translucent' }
    },
    columns: [
      shareColumn(
        'producingShare',
        <span title="Producer bonus / the most its leader slots could earn carrying every online voter's vote (skipped slots count 0, voters in a 32+ slot offline run left out, a block carrying 99.9%+ counts as full). The Production view's Inclusion.">
          Inclusion
        </span>,
        { opensGroup: true }
      ),
      {
        id: 'leaderSlots',
        accessorFn: x => x.leaderSlots ?? undefined,
        sortUndefined: 'last',
        header: () => (
          <span title="Leader slots played so far / all the epoch's schedule gives it">
            Leader slots
          </span>
        ),
        cell: ({ row }) => {
          const { leaderSlots, scheduledSlots } = row.original;
          if (leaderSlots == null && scheduledSlots == null) return <Dash />;
          return (
            <span className="font-monospace text-nowrap">
              {(leaderSlots ?? 0).toLocaleString()}
              {scheduledSlots != null && (
                <span className="text-body-tertiary">
                  {' '}
                  / {scheduledSlots.toLocaleString()}
                </span>
              )}
            </span>
          );
        },
        meta: {
          cellProps: { className: 'text-body text-end' },
          headerProps: { className: 'text-end text-nowrap' }
        }
      },
      ...productionBlockColumns<OverallRow>(x => x.producer)
    ]
  },
  {
    id: 'softwareBase',
    accessorFn: x => x.r.softwareBase || '—',
    header: 'Base',
    meta: {
      cellProps: { className: 'text-body text-nowrap border-start' },
      headerProps: { className: 'border-start' }
    }
  },
  {
    id: 'country',
    accessorFn: x => x.r.country || '—',
    header: 'Country',
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  }
];

const OverallLeaderboardTable = () => (
  <div>
    <AdvanceTable
      tableProps={{
        className: 'data-table fs-9 table-striped table-with-padding'
      }}
    />
    <AdvanceTableFooter />
  </div>
);

export default OverallLeaderboardTable;
