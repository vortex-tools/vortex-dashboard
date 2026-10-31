import { VersionStanding } from 'helpers/versions';
import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import FeatherIcon from 'feather-icons-react';
import { CLIENT_VERDICT_TEXT, clientVerdict } from 'helpers/alpenglowMigration';
import { formatLamports, formatStakeShare, cityOfKey } from 'helpers/utils';
import {
  ValidatorStatusCheck,
  ValidatorStatusSummaryRow
} from 'providers/VortexDataProvider';
import { Link } from 'react-router';

/**
 * A summary row plus fields the summary doesn't carry, joined from the
 * current-epoch voting leaderboard so they read exactly as on the rankings:
 *   - softwareBase / softwareFlavor: the leaderboard's Base ("Agave") and
 *     Fork ("BAM", "Jito", ...); the summary has no fork at all.
 *   - datacenter: the leaderboard's ASN-country-city key (City column);
 *   - provider: Host is the leaderboard's short provider label
 *     ("Allnodes"), not the ASN organization ("Allnodes Inc").
 * null for validators absent from this epoch's leaderboard.
 */
export type ValidatorsTableRow = ValidatorStatusSummaryRow & {
  softwareBase: string | null;
  softwareFlavor: string | null;
  datacenter: string | null;
  provider: string | null;
};

const Dash = () => <span className="opacity-50">—</span>;

// The leaderboard's Base is the summary's client family, title-cased
// (agave -> Agave, frankendancer -> Frankendancer). Used as the fallback
// for validators absent from this epoch's leaderboard.
const familyToBase = (family: string | null | undefined) =>
  family ? family.charAt(0).toUpperCase() + family.slice(1) : undefined;

/** Muted unit suffix: both columns that use it are measured in epochs. */
const Epochs = () => <span className="text-body-tertiary"> ep</span>;

const truncateAddress = (addr: string) =>
  addr.length <= 20 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`;

// The operational checks /validators/status/summary reports, in display
// order, with compact headers. (SFDP version checks are left to the
// validator page.)
type CheckDef = { id: string; header: string; label: string };

// Operational-health checks, shown as one column group.
const HEALTH_CHECKS: CheckDef[] = [
  { id: 'gossip', header: 'Gossip', label: 'Gossip' },
  { id: 'voting', header: 'Voting', label: 'Voting' }
];

type Status = ValidatorStatusCheck['status'];

// Sorting ascending by a check column surfaces failures first.
const STATUS_RANK: Record<Status, number> = {
  fail: 0,
  warn: 1,
  unknown: 2,
  ok: 3
};

const STATUS_ICON: Record<Status, { icon: string; className: string }> = {
  fail: { icon: 'x-circle', className: 'text-danger' },
  warn: { icon: 'alert-triangle', className: 'text-warning' },
  unknown: { icon: 'help-circle', className: 'text-body-quaternary' },
  ok: { icon: 'check', className: 'text-success' }
};

const checkStatus = (row: ValidatorStatusSummaryRow, id: string) =>
  row.checks.find(c => c.id === id)?.status;

// One status-icon column per check. `opensGroup` draws the group divider.
const checkColumn = (
  check: CheckDef,
  opensGroup: boolean
): ColumnDef<ValidatorsTableRow> => ({
  id: `check_${check.id}`,
  accessorFn: row => {
    const s = checkStatus(row, check.id);
    return s === undefined ? undefined : STATUS_RANK[s];
  },
  sortUndefined: 'last',
  header: check.header,
  cell: ({ row }) => {
    const s = checkStatus(row.original, check.id);
    if (s === undefined) return <span className="opacity-50">—</span>;
    const { icon, className } = STATUS_ICON[s];
    return (
      <span title={`${check.label}: ${s}`} className={className}>
        <FeatherIcon icon={icon} size={14} />
      </span>
    );
  },
  meta: {
    cellProps: {
      className: `text-center${opensGroup ? ' border-start' : ''}`
    },
    headerProps: {
      className: `text-center text-nowrap${opensGroup ? ' border-start' : ''}`
    }
  }
});

/** Producing column thresholds. A skip rate needs evidence: flag only
 *  from PRODUCING_MIN_SKIPPED skipped slots (two leader windows) - in
 *  epoch 1065, 328 validators had exactly 3 skipped, cluster-wide noise,
 *  not theirs. */
const PRODUCING_MIN_SKIPPED = 8;
const PRODUCING_WARN = 0.05;
const PRODUCING_FAIL = 0.25;

/** Its block production this epoch: warn from 8+ skipped slots and 5%+
 *  of its leader slots, fail from 8+ and 25%+ (or none produced); else
 *  ok; no leader slots yet = dash. */
export const producingStatus = (
  p: ValidatorsTableRow['producing']
): Status | undefined => {
  if (!p) return undefined;
  const slots = p.blocks + p.skippedSlots;
  if (!slots) return undefined;
  if (p.skippedSlots < PRODUCING_MIN_SKIPPED) return 'ok';
  const rate = p.skippedSlots / slots;
  if (p.blocks === 0 || rate >= PRODUCING_FAIL) return 'fail';
  return rate >= PRODUCING_WARN ? 'warn' : 'ok';
};

const producingColumn: ColumnDef<ValidatorsTableRow> = {
  id: 'check_producing',
  accessorFn: row => {
    const s = producingStatus(row.producing);
    return s === undefined ? undefined : STATUS_RANK[s];
  },
  sortUndefined: 'last',
  header: () => (
    <span title="Its leader slots this epoch. Flagged only from 8 skipped slots (two leader windows): warn at 5%+ skipped, fail at 25%+ (or none produced)">
      Producing
    </span>
  ),
  cell: ({ row }) => {
    const p = row.original.producing;
    const s = producingStatus(p);
    if (s === undefined || !p)
      return (
        <span
          className="opacity-50"
          title={p === undefined ? undefined : 'No leader slots this epoch yet'}
        >
          —
        </span>
      );
    const slots = p.blocks + p.skippedSlots;
    const { icon, className } = STATUS_ICON[s];
    return (
      <span
        title={`${p.blocks.toLocaleString()} of ${slots.toLocaleString()} leader slots produced this epoch, ${((p.skippedSlots / slots) * 100).toFixed(2)}% skipped`}
        className={className}
      >
        <FeatherIcon icon={icon} size={14} />
      </span>
    );
  },
  meta: {
    cellProps: { className: 'text-center' },
    headerProps: { className: 'text-center text-nowrap' }
  }
};

/** The first epoch it voted or had stake (oldest first sorts by tenure). */
const activeFromColumn: ColumnDef<ValidatorsTableRow> = {
  id: 'firstEpoch',
  accessorFn: row => row.firstEpoch ?? undefined,
  sortUndefined: 'last',
  sortDescFirst: false,
  header: () => (
    <span title="The first epoch it voted or had stake">Active from</span>
  ),
  cell: ({ row }) => {
    const { firstEpoch, epochsActive } = row.original;
    return firstEpoch == null ? (
      <span className="opacity-50">—</span>
    ) : (
      <span
        title={
          epochsActive != null
            ? `Active (voted or staked) in ${epochsActive.toLocaleString()} epochs since`
            : undefined
        }
      >
        <span className="text-body-tertiary">epoch</span>{' '}
        <span className="font-monospace">{firstEpoch}</span>
      </span>
    );
  },
  meta: {
    cellProps: { className: 'text-body text-nowrap' },
    headerProps: { className: 'text-nowrap' }
  }
};

/** A row's version against its client's target (see helpers/versions). */
export type VersionOf = (row: ValidatorsTableRow) => {
  standing: VersionStanding;
  target: string;
  client: string;
  /** A client no longer supported (red, whatever the version). */
  unsupported?: boolean;
} | null;

const allColumns = (
  totalStake: number | null,
  showActiveFrom: boolean,
  versionOf: VersionOf | undefined
): ColumnDef<ValidatorsTableRow>[] => [
  {
    id: 'validator',
    accessorFn: row => row.name ?? row.identity,
    header: 'Validator',
    cell: ({ row }) => (
      <Link
        to={`/validator/${row.original.identity}`}
        title={row.original.identity}
      >
        {row.original.name || truncateAddress(row.original.identity)}
      </Link>
    ),
    meta: {
      cellProps: {
        className:
          'text-body text-truncate leaderboard-sticky-col leaderboard-sticky-col-validator leaderboard-sticky-col-start leaderboard-sticky-col-last'
      },
      headerProps: {
        className:
          'leaderboard-sticky-col leaderboard-sticky-col-validator leaderboard-sticky-col-start leaderboard-sticky-col-last'
      }
    }
  },
  {
    // Hidden but searchable: lets someone paste an identity or vote key.
    id: 'identity',
    accessorFn: row => `${row.identity} ${row.voteAccount}`,
    header: 'Identity (hidden)',
    meta: {
      cellProps: { className: 'd-none' },
      headerProps: { className: 'd-none' }
    }
  },
  {
    id: 'stake',
    accessorFn: row => row.activatedStake,
    header: 'Stake',
    cell: ({ row }) => (
      <>
        {/* Share hugs the column's left edge, the amount its right (under
            the right-aligned header). */}
        <span className="d-flex justify-content-between align-items-baseline gap-3">
          <span className="text-body-tertiary fs-10">
            {totalStake != null &&
              formatStakeShare(row.original.activatedStake, totalStake)}
          </span>
          <span className="font-monospace">
            {formatLamports(row.original.activatedStake, 0)}
          </span>
        </span>
      </>
    ),
    meta: {
      cellProps: { className: 'text-body text-end text-nowrap' },
      headerProps: { className: 'text-end' }
    }
  },
  ...(showActiveFrom ? [activeFromColumn] : []),
  // Software group - Base / Fork / Version, as on the vote leaderboard.
  {
    id: 'softwareBase',
    accessorFn: row =>
      row.softwareBase ?? familyToBase(row.software?.family) ?? undefined,
    sortUndefined: 'last',
    header: 'Base',
    cell: ({ row, getValue }) =>
      row.original.software ? (
        <>
          {getValue<string | undefined>() ?? (
            <span className="opacity-50">—</span>
          )}
          {/* A client that can't run Alpenglow (both clusters run it). */}
          {(() => {
            const v = clientVerdict(
              row.original.software?.family,
              true,
              row.original.software?.version
            );
            return v === 'ok' ? null : (
              <span title={CLIENT_VERDICT_TEXT[v]}>
                <FeatherIcon
                  icon="alert-triangle"
                  size={12}
                  className="text-danger ms-1"
                  style={{ verticalAlign: '-1px' }}
                />
              </span>
            );
          })()}
        </>
      ) : (
        <span className="text-body-tertiary">Not in gossip</span>
      ),
    // border-start opens the "Software" group visually.
    meta: {
      cellProps: { className: 'text-body text-nowrap border-start' },
      headerProps: { className: 'border-start' }
    }
  },
  {
    id: 'softwareFlavor',
    accessorFn: row => row.softwareFlavor ?? undefined,
    sortUndefined: 'last',
    header: 'Fork',
    cell: ({ getValue }) =>
      getValue<string | undefined>() ?? <span className="opacity-50">—</span>,
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  },
  {
    id: 'version',
    accessorFn: row => row.software?.version ?? undefined,
    sortUndefined: 'last',
    // Dotted versions sort numerically segment by segment (4.10 > 4.9).
    sortingFn: 'alphanumeric',
    header: 'Version',
    cell: ({ row, getValue }) => {
      const v = getValue<string | undefined>();
      if (!v) return <span className="opacity-50">—</span>;
      // Colored as the Versions page draws it against its client's target.
      const c = versionOf?.(row.original);
      return c ? (
        <span
          className={`badge badge-soft font-monospace fs-10 badge-soft-${
            c.standing === 'current' || c.standing === 'candidate'
              ? 'success'
              : c.standing === 'behind'
                ? 'warning'
                : 'danger'
          }${c.standing === 'candidate' ? ' badge-soft-faint' : ''}`}
          style={{ textTransform: 'none' }}
          title={
            c.unsupported
              ? `${c.client} is no longer supported`
              : c.standing === 'current'
                ? `On ${c.target} or newer (the newest ${c.client} version on 5%+ of its stake)`
                : c.standing === 'candidate'
                  ? `A release candidate of ${c.target}, the newest ${c.client} version on 5%+ of its stake`
                  : `Behind ${c.target}, the newest ${c.client} version on 5%+ of its stake${c.standing === 'old' ? ' (and older than the version before it)' : ''}`
          }
        >
          {v}
        </span>
      ) : (
        <span className="font-monospace">{v}</span>
      );
    },
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  },
  ...HEALTH_CHECKS.map((check, i) => checkColumn(check, i === 0)),
  producingColumn,
  {
    id: 'vat',
    accessorFn: row => row.vatEpochsFunded ?? undefined,
    sortUndefined: 'last',
    header: () => (
      <span title="Epochs of Alpenglow admission tickets (VAT, SIMD-0357) the vote account can already pay: (balance - rent) / ticket price.">
        VAT runway
      </span>
    ),
    cell: ({ getValue }) => {
      const v = getValue<number | undefined>();
      return v === undefined ? (
        <span className="opacity-50">—</span>
      ) : (
        <span
          className="font-monospace"
          title="Epochs (ep) of admission tickets the vote account funds beyond rent"
        >
          {/* Past 100 epochs the exact count says nothing (it still
              sorts by it). */}
          {v > 100 ? '>100' : v.toLocaleString()}
          <Epochs />
        </span>
      );
    },
    meta: {
      cellProps: { className: 'text-body text-end border-start' },
      headerProps: { className: 'text-end text-nowrap border-start' }
    }
  },
  // Location group - same columns, headers and rendering as the voting
  // (rankings) leaderboard. Region / Country come from the summary; Host
  // from the leaderboard join (see ValidatorsTableRow).
  {
    id: 'continent',
    accessorFn: row => row.continent || '—',
    header: 'Region',
    // border-start opens the "Location" group visually.
    meta: {
      cellProps: { className: 'text-body text-nowrap border-start' },
      headerProps: { className: 'border-start' }
    }
  },
  {
    id: 'country',
    accessorFn: row => row.country || row.countryCode || '—',
    header: 'Country',
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  },
  {
    // With Host: a provider's presence in a city, not a building.
    id: 'city',
    accessorFn: row => cityOfKey(row.datacenter) || '—',
    header: 'City',
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  },
  {
    id: 'provider',
    accessorFn: row => row.provider || '—',
    header: 'Host',
    meta: { cellProps: { className: 'text-body text-nowrap' } }
  }
];

/**
 * Columns for the Validators table. (No identity-balance check or runway:
 * Alpenglow votes are free; the vote account's tickets are the VAT
 * columns.)
 */
export const createValidatorsStatusColumns = ({
  totalStake = null,
  showActiveFrom = false,
  versionOf
}: {
  /** Stake column's share denominator: every staked validator's stake. */
  totalStake?: number | null;
  /** Once the API serves firstEpoch. */
  showActiveFrom?: boolean;
  versionOf?: VersionOf;
} = {}): ColumnDef<ValidatorsTableRow>[] =>
  allColumns(totalStake, showActiveFrom, versionOf);

const ValidatorsStatusTable = () => (
  <div>
    <AdvanceTable
      tableProps={{
        className: 'data-table fs-9 table-striped table-with-padding'
      }}
    />
    <AdvanceTableFooter className="px-3 pb-3" />
  </div>
);

export default ValidatorsStatusTable;
