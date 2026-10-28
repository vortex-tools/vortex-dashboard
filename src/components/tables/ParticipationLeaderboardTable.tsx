import { ColumnDef } from '@tanstack/react-table';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import RankCell from 'components/tables/RankCell';
import { formatShare } from 'helpers/consensusBoards';
import { formatLamports, formatStakeShare } from 'helpers/utils';
import { ParticipationLeaderboardRecord } from 'providers/VortexDataProvider';
import { ReactElement } from 'react';
import { Link } from 'react-router';

const truncateAddress = (addr: string) =>
  addr.length <= 20 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`;

const Dash = () => <span className="opacity-50">—</span>;

// Rates, per /llms.txt: participation = (notarized + skipped) / eligible
// (a skip is a real vote, paid like notarize); finalized = finalizedSlots
// / finalizedCerts (epoch-wide denominator). null when there's nothing to
// divide by (not admitted, or no bucket ingested yet).
/** Of the cluster's blocks it voted on (notarize, or skip on a block that
 *  was notarized), the share it voted skip on. null: no such votes. */
export const skippedBlockRate = (r: ParticipationLeaderboardRecord) => {
  const blocks = r.notarizedSlots + r.skippedNotarizedSlots;
  return blocks > 0 ? r.skippedNotarizedSlots / blocks : null;
};

/** Agreement with the cluster's outcome, the rank: its votes that match
 *  what the cluster decided / eligible slots. A skip on a slot the cluster
 *  notarized (block not replayed in time) is paid, but disagrees. */
export const agreementRate = (r: ParticipationLeaderboardRecord) =>
  r.eligibleSlots > 0
    ? (r.notarizedSlots + r.skippedSlots - r.skippedNotarizedSlots) /
      r.eligibleSlots
    : null;

export const participationRate = (r: ParticipationLeaderboardRecord) =>
  r.eligibleSlots > 0
    ? (r.notarizedSlots + r.skippedSlots) / r.eligibleSlots
    : null;
const finalizedRate = (r: ParticipationLeaderboardRecord) =>
  r.finalizedCerts > 0 ? r.finalizedSlots / r.finalizedCerts : null;

const pct = (v: number | null, digits = 2) =>
  v == null ? <Dash /> : `${(v * 100).toFixed(digits)}%`;

const rate = (
  id: string,
  header: ReactElement,
  fn: (r: ParticipationLeaderboardRecord) => number | null,
  opts: { opensGroup?: boolean; emphasis?: boolean } = {}
): ColumnDef<ParticipationLeaderboardRecord> => ({
  id,
  // Not admitted: it couldn't vote, so a rate (0.00%) would mislead - gray
  // dash, sorted last.
  accessorFn: r => (r.admitted ? (fn(r) ?? undefined) : undefined),
  sortUndefined: 'last',
  header: () => header,
  cell: ({ row }) => (row.original.admitted ? pct(fn(row.original)) : <Dash />),
  meta: {
    cellProps: {
      className: `text-end font-monospace ${opts.emphasis ? 'fw-semibold text-body-emphasis' : 'text-body'}${opts.opensGroup ? ' border-start' : ''}`
    },
    headerProps: {
      className: `text-end text-nowrap${opts.opensGroup ? ' border-start' : ''}`
    }
  }
});

/**
 * Alpenglow participation leaderboard columns (one epoch). Rank is the
 * API's competition rank (0-based, shown 1-based); not-admitted
 * validators follow, ordered by stake, with N/A and gray dashes where
 * they have nothing to show.
 */
export const createParticipationLeaderboardColumns = (
  subsequentTies: Set<string>,
  epoch: number | null,
  /** Stake column's share denominator: the epoch's total stake. */
  totalStake: number | null = null
): ColumnDef<ParticipationLeaderboardRecord>[] => [
  {
    id: 'rank',
    accessorFn: r => r.rank ?? undefined,
    sortUndefined: 'last',
    cell: ({ row }) => {
      const { rank, voteAddress } = row.original;
      if (!row.original.admitted)
        return (
          <span
            className="text-body-quaternary"
            title="Not admitted this epoch"
          >
            N/A
          </span>
        );
      if (rank == null) return <Dash />;
      return <RankCell rank={rank} tie={subsequentTies.has(voteAddress)} />;
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
    accessorFn: r => r.nodeName ?? r.nodeAddress,
    header: 'Validator',
    cell: ({ row }) => {
      const r = row.original;
      const known = r.nodeAddress && r.nodeAddress !== 'N/A';
      const display =
        r.nodeName || truncateAddress(known ? r.nodeAddress : r.voteAddress);
      return (
        <Link
          // The validator's consensus record for this epoch (by vote
          // address: the participation endpoints are keyed by it).
          to={
            epoch != null
              ? recordPath(r.nodeAddress ?? r.voteAddress, epoch, 'votes')
              : `/validator/${known ? r.nodeAddress : r.voteAddress}`
          }
          title={r.admitted ? undefined : 'Not admitted this epoch'}
        >
          {display}
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
    accessorFn: r => `${r.nodeAddress} ${r.voteAddress}`,
    header: 'Addresses (hidden)',
    meta: {
      cellProps: { className: 'd-none' },
      headerProps: { className: 'd-none' }
    }
  },
  {
    id: 'stake',
    accessorFn: r => r.stake,
    header: 'Stake',
    cell: ({ row }) => (
      <>
        {/* Share hugs the column's left edge, the amount its right (under
            the right-aligned header). */}
        <span className="d-flex justify-content-between align-items-baseline gap-3">
          <span className="text-body-tertiary fs-10">
            {totalStake != null &&
              formatStakeShare(row.original.stake, totalStake)}
          </span>
          <span className="font-monospace">
            {formatLamports(row.original.stake, 0)}
          </span>
        </span>
      </>
    ),
    meta: {
      cellProps: { className: 'text-body text-end text-nowrap' },
      headerProps: { className: 'text-end' }
    }
  },
  {
    id: 'participationGroup',
    header: () => (
      <span title="Whether its votes matched the cluster's outcome (the rank), landed in the slots' reward certificates (paid), or missed">
        Participation
      </span>
    ),
    meta: {
      headerProps: { className: 'text-center border-start border-translucent' }
    },
    columns: [
      {
        // The rank's measure (API rank since 003291b): votes landed, less
        // skips on slots the cluster notarized. Votes Landed orders a rank.
        id: 'agreement',
        accessorFn: r =>
          r.admitted ? (agreementRate(r) ?? undefined) : undefined,
        sortUndefined: 'last',
        header: () => (
          <span title="Its votes that match the cluster's outcome / the slots it could vote on: notarize or skip votes landed, less skips on slots the cluster notarized (paid, but a block it didn't replay in time). The rank; Votes Landed breaks ties.">
            Agreement
          </span>
        ),
        cell: ({ row }) => {
          const v = agreementRate(row.original);
          return !row.original.admitted || v == null ? (
            <Dash />
          ) : (
            formatShare(v)
          );
        },
        meta: {
          cellProps: {
            className:
              'text-end font-monospace text-success fw-semibold border-start'
          },
          headerProps: { className: 'text-end text-nowrap border-start' }
        }
      },
      {
        // The API's participation = (notarize + skip votes) / eligible slots:
        // identical to the votes paid / payable (Overall's Voting score) - a
        // skip is a real vote, slots with no reward certificate aren't
        // eligible. It orders validators within a rank.
        id: 'participation',
        accessorFn: r =>
          r.admitted ? (participationRate(r) ?? undefined) : undefined,
        sortUndefined: 'last',
        header: () => (
          <span title="Its votes in the slots' reward certificates (notarize or skip, paid alike) / the slots it could vote on (slots with no reward certificate don't count). What it's paid on.">
            Votes Landed
          </span>
        ),
        cell: ({ row }) => {
          const v = participationRate(row.original);
          return !row.original.admitted || v == null ? (
            <Dash />
          ) : (
            formatShare(v)
          );
        },
        meta: {
          cellProps: { className: 'text-end font-monospace text-body' },
          headerProps: { className: 'text-end text-nowrap' }
        }
      },
      {
        id: 'missedSlots',
        accessorFn: r => (r.admitted ? r.missedSlots : undefined),
        sortUndefined: 'last',
        header: () => (
          <span title="Slots where its vote is in neither reward certificate: not cast, or too late to count. Unpaid. Hover a value for offline / other.">
            Missed Votes
          </span>
        ),
        cell: ({ row }) => {
          const r = row.original;
          if (!r.admitted) return <Dash />;
          const mc = r.missCauses;
          return (
            <span
              className={`font-monospace${r.missedSlots === 0 ? ' opacity-50' : ''}`}
              title={
                mc
                  ? `offline ${mc.offlineSlots.toLocaleString()} (32+ in a row: not voting) · other ${(r.missedSlots - mc.offlineSlots).toLocaleString()}`
                  : undefined
              }
            >
              {r.missedSlots.toLocaleString()}
            </span>
          );
        },
        meta: {
          cellProps: { className: 'text-end text-danger fw-semibold' },
          headerProps: { className: 'text-end text-nowrap' }
        }
      }
    ]
  },
  {
    id: 'speedGroup',
    header: () => (
      <span title="How early its votes arrive: neither costs rewards">
        Speed
      </span>
    ),
    meta: {
      headerProps: { className: 'text-center border-start border-translucent' }
    },
    columns: [
      rate(
        'finalized',
        <span title="Share of the finalization certificates (of those decoded) its vote is in. Nearly every certificate is the one-round fast kind: the first 80% of stake whose notarize votes reached the next leader before it built its block. So this is how early its votes arrive, as the next leaders see it - it depends on where it sits relative to them. Not rewarded.">
          Fast Votes
        </span>,
        finalizedRate,
        { opensGroup: true }
      ),
      {
        // Skip votes on slots the cluster notarized: the block reached it
        // too late (or its node was slow). Paid like any vote - a lag signal.
        id: 'skippedNotarizedSlots',
        accessorFn: r => (r.admitted ? r.skippedNotarizedSlots : undefined),
        sortUndefined: 'last',
        header: () => (
          <span title="Blocks the cluster notarized that it voted skip on: its timer ran out before it saw the block (the block reached it late, or its node was slow). Still paid - like Fast Votes, a timing signal, not a loss. Hover a value for its share of the blocks it voted on.">
            Skipped Blocks
          </span>
        ),
        cell: ({ row }) => {
          const r = row.original;
          const v = skippedBlockRate(r);
          return !r.admitted || v == null ? (
            <Dash />
          ) : (
            <span
              className={`font-monospace${v === 0 ? ' opacity-50' : ''}`}
              title={`${(v * 100).toFixed(3)}% of the ${(r.notarizedSlots + r.skippedNotarizedSlots).toLocaleString()} blocks it voted on`}
            >
              {r.skippedNotarizedSlots.toLocaleString()}
            </span>
          );
        },
        meta: {
          cellProps: { className: 'text-end text-warning fw-semibold' },
          headerProps: { className: 'text-end text-nowrap' }
        }
      }
    ]
  },
  {
    id: 'softwareBase',
    accessorFn: r => r.softwareBase || '—',
    header: 'Base',
    meta: {
      cellProps: { className: 'text-body text-nowrap border-start' },
      headerProps: { className: 'border-start' }
    }
  },
  {
    id: 'country',
    accessorFn: r => r.country || '—',
    header: 'Country',
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  }
];

/** Second and later records at a shared rank (shown muted). */
export const participationTies = (
  records: ParticipationLeaderboardRecord[]
): Set<string> => {
  const seen = new Set<number>();
  const ties = new Set<string>();
  for (const r of records) {
    if (r.rank == null) continue;
    if (seen.has(r.rank)) ties.add(r.voteAddress);
    else seen.add(r.rank);
  }
  return ties;
};

const ParticipationLeaderboardTable = () => (
  <div>
    <AdvanceTable
      tableProps={{
        className: 'data-table fs-9 table-striped table-with-padding'
      }}
    />
    <AdvanceTableFooter className="px-3 pb-3" />
  </div>
);

export default ParticipationLeaderboardTable;
