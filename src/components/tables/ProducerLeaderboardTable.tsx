import { ColumnDef } from '@tanstack/react-table';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import RankCell from 'components/tables/RankCell';
import { productionBlockColumns } from 'components/tables/ProductionBlockColumns';
import { formatShare, productionLossLine } from 'helpers/consensusBoards';
import { formatLamports, formatStakeShare } from 'helpers/utils';
import {
  IDEAL_RECORD_KEY,
  ProducerLeaderboardRecord
} from 'providers/VortexDataProvider';
import { ReactElement } from 'react';
import { Link } from 'react-router';

const Dash = () => <span className="opacity-50">—</span>;

const truncateAddress = (addr: string) =>
  `${addr.slice(0, 6)}…${addr.slice(-6)}`;

const isCluster = (r: ProducerLeaderboardRecord) =>
  r.nodeAddress === IDEAL_RECORD_KEY;

const pctOf = (v: number | null | undefined, digits = 2) =>
  v == null ? <Dash /> : `${(v * 100).toFixed(digits)}%`;

const num = (
  id: string,
  header: ReactElement | string,
  value: (r: ProducerLeaderboardRecord) => number | null,
  render: (v: number, r: ProducerLeaderboardRecord) => ReactElement | string,
  opts: { opensGroup?: boolean; emphasis?: boolean; tone?: string } = {}
): ColumnDef<ProducerLeaderboardRecord> => ({
  id,
  accessorFn: r => value(r) ?? undefined,
  sortUndefined: 'last',
  header: () => header,
  cell: ({ row }) => {
    const v = value(row.original);
    return v == null ? <Dash /> : render(v, row.original);
  },
  meta: {
    cellProps: {
      className: `text-end font-monospace text-nowrap ${opts.emphasis ? 'fw-semibold text-body-emphasis' : (opts.tone ?? 'text-body')}${opts.opensGroup ? ' border-start' : ''}`
    },
    headerProps: {
      className: `text-end text-nowrap${opts.opensGroup ? ' border-start' : ''}`
    }
  }
});

/**
 * Block-producer leaderboard columns (one Alpenglow epoch): how its leader
 * windows went, how much voting stake its blocks carried (vote inclusion),
 * its producer bonus, and how its blocks finalized. The cluster row is
 * pinned on top as the baseline.
 */
/** A producer's stake-normalized standing: its inclusion of the online
 *  stake (the bonus it earned / the most its leader slots could earn
 *  carrying every online voter) and rank. */
export interface ProducerScore {
  score: number | null;
  /** 0-based competition rank; null = not ranked (too few leader slots). */
  rank: number | null;
}

export const createProducerLeaderboardColumns = (
  epoch: number | null,
  totalStake: number | null,
  /** Records whose rank repeats the one above (shared, competition-style):
   *  shown faded, as on the consensus leaderboard. */
  subsequentTies: Set<string> = new Set(),
  scores: Map<string, ProducerScore> = new Map(),
  minSlots = 20
): ColumnDef<ProducerLeaderboardRecord>[] => [
  {
    id: 'rank',
    accessorFn: r =>
      isCluster(r) ? -1 : (scores.get(r.nodeAddress)?.rank ?? undefined),
    sortUndefined: 'last',
    header: () => (
      <span title="Rank by the Production score among the producers shown (Hide low stake re-ranks)">
        Rank
      </span>
    ),
    cell: ({ row }) => {
      if (isCluster(row.original)) return '';
      const rank = scores.get(row.original.nodeAddress)?.rank;
      return rank != null ? (
        <RankCell
          rank={rank}
          tie={subsequentTies.has(row.original.nodeAddress)}
        />
      ) : (
        <span
          className="text-body-quaternary"
          title={`Fewer than ${minSlots} leader slots so far`}
        >
          N/A
        </span>
      );
    },
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
    header: 'Producer',
    cell: ({ row }) => {
      const r = row.original;
      if (isCluster(r)) return <span className="fw-semibold">Cluster</span>;
      return (
        <Link
          to={
            epoch != null && r.voteAddress
              ? recordPath(r.voteAddress || r.nodeAddress, epoch, 'blocks')
              : `/validator/${r.voteAddress || r.nodeAddress}`
          }
        >
          {r.nodeName || truncateAddress(r.nodeAddress)}
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
    id: 'addresses',
    accessorFn: r => `${r.nodeAddress} ${r.voteAddress ?? ''}`,
    header: 'Addresses (hidden)',
    meta: {
      cellProps: { className: 'd-none' },
      headerProps: { className: 'd-none' }
    }
  },
  {
    id: 'stake',
    accessorFn: r => (isCluster(r) ? undefined : r.stake),
    sortUndefined: 'last',
    header: 'Stake',
    cell: ({ row }) =>
      isCluster(row.original) ? (
        ''
      ) : (
        <span className="d-flex justify-content-between align-items-baseline gap-3">
          <span className="text-body-tertiary fs-10">
            {totalStake != null &&
              formatStakeShare(row.original.stake, totalStake)}
          </span>
          <span className="font-monospace">
            {formatLamports(row.original.stake, 0)}
          </span>
        </span>
      ),
    meta: {
      cellProps: { className: 'text-body text-end text-nowrap' },
      headerProps: { className: 'text-end' }
    }
  },
  num(
    'production',
    <span title="Share of the online stake's votes this producer carried on chain per leader slot (skipped slots count as 0; voters in a 32+ slot offline run left out, as no producer could carry them; a block that carried 99.9%+ of it counts as full) - the producer bonus it earned out of the most it could. Leader slots follow stake, so it compares producers of any size. Hover a value for the bonus and the inclusion of all stake.">
      Inclusion
    </span>,
    r => scores.get(r.nodeAddress)?.score ?? null,
    (v, r) => (
      <span
        title={[
          productionLossLine(r),
          r.producerBonusLamports != null
            ? `producer bonus ${formatLamports(r.producerBonusLamports, 4)} (gross)`
            : null,
          r.effectiveInclusion != null && r.availableInclusion != null
            ? `${pctOf(r.effectiveInclusion) as string} of all admitted stake (offline voters counted)`
            : null
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        {formatShare(v)}
      </span>
    ),
    { opensGroup: true, emphasis: true }
  ),
  num(
    'skipRate',
    <span title="Skipped slots / its slots so far (blocks + skipped)">
      Skip Rate
    </span>,
    r => r.skipRate,
    v => pctOf(v) as string,
    { opensGroup: true }
  ),
  num(
    'leaderSlots',
    <span title="Blocks produced / its leader slots so far">Leader Slots</span>,
    r => r.blocks + r.skippedSlots,
    (v, r) =>
      // The cluster's total isn't a producer's slots: left blank.
      isCluster(r) ? (
        ''
      ) : (
        <span>
          {r.blocks.toLocaleString()}
          <span className="text-body-tertiary"> / {v.toLocaleString()}</span>
        </span>
      )
  ),
  ...productionBlockColumns<ProducerLeaderboardRecord>(r =>
    isCluster(r) ? null : r
  ),
  // Software / location
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
    id: 'softwareFlavor',
    accessorFn: r => r.softwareFlavor || '—',
    header: 'Fork',
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  },
  {
    id: 'softwareVersion',
    accessorFn: r => r.softwareVersion || '—',
    header: 'Version',
    meta: { cellProps: { className: 'text-body text-nowrap font-monospace' } }
  },
  {
    id: 'country',
    accessorFn: r => r.country || '—',
    header: 'Country',
    meta: {
      cellProps: { className: 'text-body text-nowrap border-start' },
      headerProps: { className: 'border-start' }
    }
  },
  {
    id: 'provider',
    accessorFn: r => r.provider || '—',
    header: 'Provider',
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  }
];

const ProducerLeaderboardTable = () => (
  <div>
    <AdvanceTable
      tableProps={{
        className: 'data-table fs-9 table-striped table-with-padding'
      }}
    />
    <AdvanceTableFooter className="px-3 pb-3" />
  </div>
);

export default ProducerLeaderboardTable;
