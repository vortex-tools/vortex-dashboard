import { cityOfKey } from 'helpers/utils';
import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import {
  EpochVotingLeaderboardRecord,
  IDEAL_RECORD_KEY
} from 'providers/VortexDataProvider';
import { Link } from 'react-router';

const truncateAddress = (addr: string) =>
  addr.length <= 20 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`;

// Sticky-column setup lives entirely in user.scss
// (.leaderboard-sticky-col + -rank/-validator/-last). The classes
// handle position/left/width/z-index/bg/right-divider, including a
// responsive narrow-viewport variant for the validator column that
// inline styles couldn't express.

// Helper to compute "subsequent ties" — validators that are the second or
// later record at a shared rank. Lifted out of the column factory so the
// caller can memoize it independently and the column array stays stable
// across data refreshes.
export const computeSubsequentTies = (
  records: EpochVotingLeaderboardRecord[]
): Set<string> => {
  const seen = new Set<number>();
  const subsequent = new Set<string>();
  for (const r of records) {
    if (r.rank === 0) continue;
    if (seen.has(r.rank)) {
      subsequent.add(r.voteAddress);
    } else {
      seen.add(r.rank);
    }
  }
  return subsequent;
};

export const createEpochVotingLeaderboardTableColumns = (
  idealRecord: EpochVotingLeaderboardRecord | undefined,
  epoch: number | undefined,
  subsequentTies: Set<string>
): ColumnDef<EpochVotingLeaderboardRecord>[] => {
  const validatorLink = (voteAddress: string) =>
    epoch !== undefined
      ? `/validator/${voteAddress}/votes/epoch/${epoch}`
      : `/validator/${voteAddress}/votes`;

  return [
    {
      accessorKey: 'rank',
      cell: ({ row }) => {
        const { rank, voteAddress } = row.original;
        if (voteAddress === IDEAL_RECORD_KEY) return '';
        const isSubsequentTie = subsequentTies.has(voteAddress);
        return (
          <span
            className={isSubsequentTie ? 'text-body-quaternary' : undefined}
          >
            {rank}
            {isSubsequentTie && (
              <span className="text-body-quaternary fs-10 ms-1 d-none d-md-inline">
                (tie)
              </span>
            )}
          </span>
        );
      },
      // On mobile the rank column shrinks to 2.75rem (see user.scss),
      // which is too narrow for "RANK" (data-table uppercases headers
      // and the 'k' was getting clipped). Use '#' below md and the full
      // label from md up.
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
      accessorKey: 'nodeName',
      header: 'Validator',
      cell: ({ row }) => {
        if (row.original.voteAddress === IDEAL_RECORD_KEY) {
          return <span className="fw-semibold">Ideal voter</span>;
        }
        // Fall back to a truncated node address when the validator
        // hasn't published a name, so the cell never renders empty.
        const display =
          row.original.nodeName || truncateAddress(row.original.nodeAddress);
        return (
          <Link to={validatorLink(row.original.voteAddress)}>{display}</Link>
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
      // Hidden but searchable: keeps full-text search working for
      // someone pasting in a node address.
      accessorKey: 'nodeAddress',
      header: 'Validator Address (hidden)',
      meta: {
        cellProps: { className: 'd-none' },
        headerProps: { className: 'd-none' }
      }
    },
    {
      id: 'voteAddressHidden',
      accessorFn: row => row.voteAddress, // Include vote address in search context
      header: 'Vote Address (hidden)',
      meta: {
        cellProps: { className: 'd-none' }, // Hide cell
        headerProps: { className: 'd-none' } // Hide header
      }
    },
    {
      // Sortable as a percentage so a validator with 99.81% beats one
      // with 99.74% even at different epoch lengths.
      id: 'perfectPct',
      accessorFn: row => {
        const total =
          row.perfectSlots + row.okSlots + row.slowSlots + row.skippedSlots;
        return total === 0 ? 0 : (row.perfectSlots / total) * 100;
      },
      header: 'Perfect',
      cell: ({ getValue, row }) => {
        const pct = getValue<number>();
        const r = row.original;
        const total = r.perfectSlots + r.okSlots + r.slowSlots + r.skippedSlots;
        if (total === 0) return <span className="opacity-50">—</span>;
        const display = `${pct.toFixed(2)}%`;
        if (r.perfectSlots === 0) {
          return <span className="opacity-50">{display}</span>;
        }
        return display;
      },
      // The metrics group is "opened" visually by the sticky-column
      // right border that travels with the Validator cell, so this
      // column doesn't need its own border-start divider.
      meta: {
        cellProps: { className: 'text-success fw-semibold' }
      }
    },
    {
      accessorKey: 'okSlots',
      header: () => (
        <>
          Ok <span className="fw-normal text-body-quaternary">(Δ=1)</span>
        </>
      ),
      cell: ({ getValue, row }) => {
        const v = getValue<number>();
        const isIdeal = row.original.voteAddress === IDEAL_RECORD_KEY;
        if (isIdeal) {
          return (
            <span className="text-nowrap">
              {v.toLocaleString()} <span className="text-body">votes</span>
            </span>
          );
        }
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-primary-emphasis fw-semibold' }
      }
    },
    {
      accessorKey: 'slowSlots',
      header: () => (
        <>
          Slow <span className="fw-normal text-body-quaternary">(Δ≥2)</span>
        </>
      ),
      cell: ({ getValue, row }) => {
        const v = getValue<number>();
        const isIdeal = row.original.voteAddress === IDEAL_RECORD_KEY;
        if (isIdeal) {
          return (
            <span className="text-nowrap">
              {v.toLocaleString()} <span className="text-body">votes</span>
            </span>
          );
        }
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-warning fw-semibold' }
      }
    },
    {
      accessorKey: 'skippedSlots',
      header: 'Skipped',
      cell: ({ getValue, row }) => {
        const v = getValue<number>();
        const isIdeal = row.original.voteAddress === IDEAL_RECORD_KEY;
        if (isIdeal) {
          return (
            <span className="text-nowrap">
              {v.toLocaleString()} <span className="text-body">votes</span>
            </span>
          );
        }
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-danger fw-semibold' }
      }
    },
    {
      id: 'deductions',
      accessorFn: row => {
        let idealCredits = idealRecord?.earnedCredits;
        if (idealCredits === undefined) {
          return 'NA';
        } else {
          return idealCredits - row.earnedCredits;
        }
      },
      header: 'Deductions',
      cell: ({ getValue, row }) => {
        const v = getValue<number | string>();
        const isIdeal = row.original.voteAddress === IDEAL_RECORD_KEY;
        if (typeof v !== 'number') return v;
        if (isIdeal) {
          return (
            <span className="text-nowrap">
              {v.toLocaleString()} <span className="text-primary">credits</span>
            </span>
          );
        }
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      accessorKey: 'totalExcessLatency',
      header: 'Lag',
      cell: ({ getValue, row }) => {
        const v = getValue<number>();
        const isIdeal = row.original.voteAddress === IDEAL_RECORD_KEY;
        if (isIdeal) {
          return (
            <span className="text-nowrap">
              {v.toLocaleString()} <span className="text-primary">slots</span>
            </span>
          );
        }
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      id: 'softwareBase',
      accessorFn: row => row.softwareBase || '—',
      header: 'Base',
      // border-start opens the "Software" group visually.
      meta: {
        cellProps: { className: 'text-body border-start' },
        headerProps: { className: 'border-start' }
      }
    },
    {
      id: 'softwareFlavor',
      accessorFn: row => row.softwareFlavor || '—',
      header: 'Fork',
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      id: 'softwareVersion',
      accessorFn: row => row.softwareVersion || '—',
      header: 'Version',
      cell: ({ getValue, row }) => {
        const v = getValue<string>();
        const isIdeal = row.original.voteAddress === IDEAL_RECORD_KEY;
        // Real validator versions look like "2.0.7" — monospace lines
        // them up. The ideal-voter row's "—" reads better in the
        // body font, so suppress monospace there.
        return isIdeal ? v : <span className="font-monospace">{v}</span>;
      },
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      id: 'continent',
      accessorFn: row => row.continent || '—',
      header: 'Region',
      // border-start opens the "Location" group visually.
      meta: {
        cellProps: { className: 'text-body border-start' },
        headerProps: { className: 'border-start' }
      }
    },
    {
      id: 'country',
      accessorFn: row => row.country || '—',
      header: 'Country',
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      // The provider's city (DB-IP's ASN-country-city key): with Host, a
      // provider's presence in a city, not a building.
      id: 'city',
      accessorFn: row => cityOfKey(row.datacenter) || '—',
      header: 'City',
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      // API field is `provider`; column id mirrors that, but the
      // visible header reads "Host" — see schema for rationale.
      id: 'provider',
      accessorFn: row => row.provider || '—',
      header: 'Host',
      meta: {
        cellProps: { className: 'text-body' }
      }
    }
  ];
};

const EpochVotingLeaderboardTable = () => {
  return (
    <div>
      <AdvanceTable
        tableProps={{
          className: 'data-table fs-9 table-striped table-with-padding'
        }}
      />
      <AdvanceTableFooter className="px-3 pb-3" />
    </div>
  );
};

export default EpochVotingLeaderboardTable;
