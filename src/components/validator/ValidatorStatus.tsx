import Button from 'components/base/Button';
import { CLOCK_DETAIL, clockLine, clockVerdict } from 'helpers/producerClock';
import AddressLine from 'components/common/AddressLine';
import Badge, { BadgeBg } from 'components/base/Badge';
import StatCard from 'components/common/StatCard';
import FeatherIcon from 'feather-icons-react';
import {
  CLIENT_VERDICT_LABEL,
  CLIENT_VERDICT_TEXT,
  MAINNET_ACTIVATION_EPOCH,
  clientVerdict
} from 'helpers/alpenglowMigration';
import SfdpMatchStatus, {
  sfdpMatchMeaning
} from 'components/validator/SfdpMatchStatus';
import SectionCard from 'components/common/SectionCard';
import { isSfdpCheck, isSfdpState, sfdpMatch } from 'helpers/sfdp';
import { formatLamports } from 'helpers/utils';
import useCluster from 'hooks/useCluster';
import { poolPath } from 'components/pools/pools';
import { Link } from 'react-router';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { validatorTabPath } from 'components/validator/ValidatorPageHeader';
import {
  Fragment,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { Col, Row, Spinner } from 'react-bootstrap';
import {
  SfdpProgram,
  VALIDATOR_STATUS_SUMMARY_KEY,
  ValidatorStake,
  ValidatorStatus as ValidatorStatusData,
  ValidatorStatusCheck,
  VortexDataContext
} from 'providers/VortexDataProvider';

// Matches the endpoint's Cache-Control: max-age=30.
const REFRESH_MS = 30_000;
const STAKE_REFRESH_MS = 5 * 60_000;

const CHECK_LABELS: Record<string, string> = {
  gossip: 'Gossip',
  voting: 'Voting',
  sfdp_version_mainnet: 'Mainnet version',
  sfdp_version_testnet: 'Testnet version',
  identity_balance: 'Identity balance',
  vote_authority: 'Vote authority',
  vat: 'Admission ticket (VAT)',
  concentration: 'Concentration',
  block_revenue_collector: 'Block rewards collector'
};

/** Checks the dashboard no longer shows: identity balance covered vote
 *  fees (Alpenglow votes are free), and the VAT check was migration
 *  readiness (Alpenglow is live; the vote balance tile keeps the VAT
 *  runway). */
const RETIRED_CHECKS = new Set(['identity_balance', 'vat']);

const checkLabel = (id: string) =>
  CHECK_LABELS[id] ?? id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

// Failures first, then warnings, then unknowns. 'unknown' means an input
// was missing - not that the check passed - so it ranks above 'ok'.
const STATUS_META: Record<
  ValidatorStatusCheck['status'],
  { bg: BadgeBg; label: string; rank: number }
> = {
  fail: { bg: 'danger', label: 'Fail', rank: 0 },
  warn: { bg: 'warning', label: 'Warn', rank: 1 },
  unknown: { bg: 'secondary', label: 'Unknown', rank: 2 },
  ok: { bg: 'success', label: 'OK', rank: 3 }
};

const byRank = (a: ValidatorStatusCheck, b: ValidatorStatusCheck) =>
  STATUS_META[a.status].rank - STATUS_META[b.status].rank;

const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

const verdict = (checks: ValidatorStatusCheck[]) => {
  const n = (s: ValidatorStatusCheck['status']) =>
    checks.filter(c => c.status === s).length;
  if (n('fail'))
    return {
      bg: 'danger' as BadgeBg,
      text: plural(n('fail'), 'failing check')
    };
  if (n('warn'))
    return { bg: 'warning' as BadgeBg, text: plural(n('warn'), 'warning') };
  if (n('unknown'))
    return {
      bg: 'secondary' as BadgeBg,
      text: plural(n('unknown'), 'unknown check')
    };
  return { bg: 'success' as BadgeBg, text: 'All checks pass' };
};

const bpsToPct = (bps: number) =>
  `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

const hostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const familyToBase = (family: string | null | undefined) =>
  family ? family.charAt(0).toUpperCase() + family.slice(1) : null;

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-body-tertiary">{children}</span>
);

const sol2 = (lamports: number) =>
  `◎${(lamports / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * A few words on what's wrong, computed from the status numbers - the
 * API's summaries are full sentences. null = use the API's summary.
 */
const shortReason = (
  check: ValidatorStatusCheck,
  s: ValidatorStatusData
): string | null => {
  switch (check.id) {
    case 'vat': {
      const v = s.vat;
      if (!v) return null;
      const need =
        (s.cluster?.voteAccountRentExemptMinimum ?? 0) +
        v.vatLamportsPerEpoch -
        v.voteAccountLamports;
      const why = !v.blsPubkeySet
        ? 'no BLS key on the vote account'
        : need > 0
          ? `${sol2(need)} short of one ticket`
          : null;
      // The runtime's decision for next epoch leads (a fact, not the
      // balance-based prediction).
      if (v.admittedNextEpoch === false)
        return [`not admitted to epoch ${v.nextEpoch ?? 'next epoch'}`, why]
          .filter(Boolean)
          .join(' · ');
      return why;
    }
    case 'identity_balance': {
      const r = s.identityBalance?.epochsOfRunway;
      return r == null ? null : `${r.toFixed(1)} epochs of vote fees left`;
    }
    case 'voting':
      return s.stake.delinquent
        ? `delinquent, ${s.stake.slotsBehind.toLocaleString()} slots behind`
        : null;
    case 'gossip':
      return 'not in gossip';
    case 'concentration': {
      // SFDP limits: one ASN + city (its 'data center' grouping) <= 15%,
      // one ASN <= 25% of stake.
      const c = s.concentration;
      if (!c) return null;
      const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
      const over: string[] = [];
      if (c.asnStakeShare > 0.25)
        over.push(
          `${s.geo?.asnOrganization ?? `ASN ${c.asn}`} at ${pct(c.asnStakeShare)} of stake (limit 25%)`
        );
      if (c.dataCenterStakeShare > 0.15)
        over.push(
          `ASN + city at ${pct(c.dataCenterStakeShare)} (SFDP limit 15%)`
        );
      return over.length ? over.join(' · ') : null;
    }
    case 'vote_authority': {
      const vs = s.voteState;
      if (!vs) return null;
      if (vs.nodePubkey !== s.identity)
        return 'vote account points at another node';
      if (!vs.authorizedVoter) return 'no authorized voter';
      if (vs.authorizedVoter !== s.identity) return 'separate voter key';
      return vs.nextAuthorizedVoter !== s.identity
        ? 'voter key rotates next epoch'
        : null;
    }
    default:
      return null;
  }
};

/** Passing checks on one line (truncated; each summary on hover). */
const PassingLine = ({ checks }: { checks: ValidatorStatusCheck[] }) => {
  const passing = checks.filter(c => c.status === 'ok');
  if (!passing.length) return null;
  return (
    <p className="fs-9 mb-0 d-flex align-items-center gap-2 min-w-0">
      <FeatherIcon
        icon="check"
        size={14}
        className="text-success flex-shrink-0"
      />
      <span className="text-truncate">
        {passing.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 && <Muted> · </Muted>}
            <span title={c.summary}>{checkLabel(c.id)}</span>
          </Fragment>
        ))}
      </span>
    </p>
  );
};

interface Tile {
  label: string;
  value: string;
  sublabel?: ReactNode;
  mono?: boolean;
  wrapSublabel?: boolean;
  /** The tile links here (e.g. Stake to the Staking tab). */
  linkTo?: string;
}

// Share of total stake: enough digits that small validators aren't 0.00%.
const formatShare = (share: number) => {
  const pct = share * 100;
  if (pct > 0 && pct < 0.001) return '<0.001%';
  return `${pct.toLocaleString('en-US', { maximumFractionDigits: pct >= 1 ? 2 : 3 })}%`;
};

// Whole SOL for real stake moves; cents for small ones, so they don't read
// ◎0 (and dust below a cent says so).
const formatStakeDelta = (lamports: number) => {
  if (lamports === 0) return '◎0';
  if (lamports < 10_000_000) return '<◎0.01';
  return formatLamports(lamports, lamports < 10_000_000_000 ? 2 : 0);
};

/** Net stake change into the next epoch (activating - deactivating). */
const StakeChange = ({ up, down }: { up: number; down: number }) => {
  const net = up - down;
  const detail = `+${formatStakeDelta(up)} activating, −${formatStakeDelta(down)} deactivating`;
  if (up === 0 && down === 0) return <>no change next epoch</>;
  const cls = net > 0 ? 'text-success' : net < 0 ? 'text-danger' : '';
  return (
    <span title={detail}>
      <span className={cls}>
        {net > 0 ? '+' : net < 0 ? '−' : '±'}
        {formatStakeDelta(Math.abs(net))}
      </span>{' '}
      next epoch
    </span>
  );
};

/** Node facts as small tiles; tiles whose data is missing are skipped. */
const nodeTiles = (
  s: ValidatorStatusData,
  stake: ValidatorStake | undefined,
  shareOfTotal: number | undefined,
  /** Its Jito MEV commission (bps), from the latest epoch's earnings;
   *  null when unknown (no tip distribution account, or not loaded). */
  mevCommissionBps: number | null = null,
  /** Not running Jito (no tip account): MEV shows as a dash. */
  noTipAccount = false
): Tile[] => {
  const tiles: Tile[] = [];
  const sw = s.software;
  // Base · Fork, then the version - as on the vote leaderboard.
  tiles.push(
    sw?.version
      ? {
          label: 'Client',
          value:
            [familyToBase(sw.family), sw.flavor].filter(Boolean).join(' · ') ||
            'Unknown',
          sublabel: sw.version,
          mono: false
        }
      : { label: 'Client', value: '—', sublabel: 'Not in gossip' }
  );
  if (s.geo) {
    // City as the value (it fits a phone's half-width tile), the country
    // with the network beneath.
    const country = s.geo.country ?? s.geo.countryCode;
    const place = s.geo.city ?? country;
    const below = [s.geo.city ? country : null, s.geo.asnOrganization]
      .filter(Boolean)
      .join(' · ');
    if (place || below)
      tiles.push({
        label: 'Location',
        value: place || '—',
        sublabel: below || undefined,
        mono: false
      });
  }
  const share =
    shareOfTotal != null ? `${formatShare(shareOfTotal)} of stake` : null;
  tiles.push({
    label: 'Stake',
    value: formatLamports(s.stake.activatedStake, 0),
    sublabel:
      share || stake ? (
        <>
          {share}
          {share && stake && ' · '}
          {stake && (
            <StakeChange
              up={stake.activatingStake}
              down={stake.deactivatingStake}
            />
          )}
        </>
      ) : undefined,
    // Share and next-epoch change don't fit one line on phones.
    wrapSublabel: true
  });
  // Inflation and MEV - the block-rewards rate isn't shown while block
  // reward sharing isn't enabled (it reads 100% for everyone).
  if (s.voteState)
    tiles.push(
      mevCommissionBps != null || noTipAccount
        ? {
            label: 'Commission',
            // Not running Jito: no MEV commission, a dash.
            value: `${bpsToPct(s.voteState.inflationRewardsCommissionBps)} / ${mevCommissionBps != null ? bpsToPct(mevCommissionBps) : '–'}`,
            sublabel: 'inflation / MEV'
          }
        : {
            label: 'Commission',
            value: bpsToPct(s.voteState.inflationRewardsCommissionBps),
            sublabel: 'inflation'
          }
    );
  const vatStatus = s.checks.find(c => c.id === 'vat')?.status;
  const vatClass =
    vatStatus === 'fail'
      ? 'text-danger'
      : vatStatus === 'warn'
        ? 'text-warning'
        : undefined;
  if (s.voteState)
    tiles.push({
      label: 'Vote Balance',
      value: formatLamports(s.voteState.lamports, 2),
      // Whole VAT tickets the vote account funds beyond rent, colored
      // like the VAT check when that isn't OK.
      sublabel:
        s.vat?.epochsFunded != null ? (
          <span
            className={vatClass}
            title={`Ticket: ${formatLamports(s.vat.vatLamportsPerEpoch, 2)} per epoch${s.cluster ? ` at ${s.cluster.slotMs} ms slots` : ''} (SIMD-0357; scales with slot time). Runway = whole tickets the balance funds beyond rent.`}
          >
            {/* Past 100 epochs the exact count says nothing. */}
            {s.vat.epochsFunded > 100
              ? '>100 epochs'
              : plural(s.vat.epochsFunded, 'epoch')}{' '}
            of VAT runway
          </span>
        ) : (
          'vote account'
        )
    });
  return tiles;
};

/**
 * The status tiles' data for one validator, read from the slices
 * ValidatorStatus fetches and refreshes (it must be mounted for them to
 * load): node facts (client, location, commission, vote balance) and its
 * stake. No fetching here, so a second reader (the keys box's facts)
 * doesn't double the polling.
 */
const useStatusTiles = (nodeAddress: string) => {
  const context = useContext(VortexDataContext);
  const slice = context?.validatorStatusState;
  const status = slice?.data.get(nodeAddress);
  const stake = context?.validatorStakeState.data.get(nodeAddress);
  // Share of stake and the SFDP rule come with the status on current APIs.
  // Older ones only have them in the (much larger) all-validators summary,
  // fetched only when the status lacks what the page shows.
  const needsSummary =
    !!status &&
    (status.stake.shareOfTotal == null ||
      (isSfdpState(status.sfdp.participant?.state) &&
        status.sfdp.program == null));
  const summary = context?.validatorStatusSummaryState.data.get(
    VALIDATOR_STATUS_SUMMARY_KEY
  );
  const summaryTotal = useMemo(
    () => summary?.validators.reduce((acc, r) => acc + r.activatedStake, 0),
    [summary]
  );
  const shareOfTotal =
    status?.stake.shareOfTotal ??
    (status && summaryTotal
      ? status.stake.activatedStake / summaryTotal
      : undefined);
  // No status and an error: the endpoint isn't available on this API, or
  // the validator isn't staked (404). The slice's error is slice-wide, but
  // this page only ever requests one identity.
  const unavailable = !status && !slice?.isLoading && !!slice?.error;
  // The latest epoch that says something about MEV: a rate, or that it
  // has no Jito tip account (plain Agave: no MEV commission at all).
  const earnings = context?.epochEarningsState.data.get(nodeAddress);
  const mevRates = [...(earnings ?? [])]
    .reverse()
    .find(
      r =>
        r.rates?.mevCommissionBps != null ||
        r.rates?.mevCommissionBpsSource === 'noTipAccount'
    )?.rates;
  const noTipAccount = mevRates?.mevCommissionBpsSource === 'noTipAccount';
  const mevBps = noTipAccount ? null : (mevRates?.mevCommissionBps ?? null);
  const { isTestnet } = useCluster();
  // Stake links to the Staking tab (not on testnet, which has none).
  const tiles = (
    status ? nodeTiles(status, stake, shareOfTotal, mevBps, noTipAccount) : []
  ).map(t =>
    t.label === 'Stake' && !isTestnet
      ? { ...t, linkTo: validatorTabPath(nodeAddress, 'staking') }
      : t
  );
  return { tiles, needsSummary, unavailable };
};

/** The node facts the keys box shows as lines, not tiles. */
export const FACT_TILES = ['Client', 'Location', 'Commission', 'Vote Balance'];

/**
 * Node facts (client, location, commission, vote balance) as lines in the
 * keys box, laid out like its Node / Vote lines: the value, then the
 * tile's sublabel in gray. Nothing until the status has loaded.
 */
export const ValidatorFacts = ({
  nodeAddress,
  labelWidth = '3rem'
}: Props & { labelWidth?: string }) => {
  const { tiles } = useStatusTiles(nodeAddress);
  const line = (label: string, value: ReactNode, sub?: ReactNode) => (
    <div key={label} className="d-flex align-items-baseline gap-2 min-w-0">
      <span
        className="text-body-tertiary fs-9 flex-shrink-0"
        style={{ minWidth: labelWidth }}
      >
        {label}
      </span>
      <span className="fs-9 text-truncate">
        <span className="fw-semibold">{value}</span>
        {sub && <span className="text-body-tertiary"> · {sub}</span>}
      </span>
    </div>
  );
  return (
    <>
      {tiles
        .filter(t => FACT_TILES.includes(t.label))
        .flatMap(t =>
          // The client tile's version (its sublabel) is a line of its own,
          // before it: Version, then Client ("Agave · BAM").
          t.label === 'Client'
            ? [
                ...(t.sublabel && t.value !== '—'
                  ? [line('Version', t.sublabel)]
                  : []),
                line('Client', t.value, t.value === '—' ? t.sublabel : null)
              ]
            : [
                line(
                  t.label === 'Vote Balance' ? 'Vote balance' : t.label,
                  t.value,
                  t.sublabel
                )
              ]
        )}
    </>
  );
};

const statusClass = (s: ValidatorStatusCheck['status'] | undefined) =>
  s === 'fail'
    ? 'text-danger'
    : s === 'warn'
      ? 'text-warning'
      : s === 'unknown'
        ? 'text-body-tertiary'
        : undefined;

interface Props {
  nodeAddress: string;
}

/**
 * Live operational status for one validator, from /validators/status.
 * Fetches and refreshes it; renders node facts as a strip of small tiles,
 * then an SFDP card only for validators in the program (SFDP version
 * checks live there, and are dropped for everyone else). The checks
 * themselves are in the header's Notices box.
 */
const ValidatorStatus = ({
  nodeAddress,
  extraTiles = [],
  wide = false,
  exclude = []
}: Props & {
  /** Tiles (by label) shown elsewhere, left out of the grid. */
  exclude?: string[];
  /** More tiles (the page's rank / block KPIs) appended to the grid. */
  extraTiles?: ReactNode[];
  /** The grid has the row to itself: from xl up, one row of up to six
   *  tiles, else rows of four (eight tiles: two rows). */
  wide?: boolean;
}) => {
  const context = useContext(VortexDataContext);
  const slice = context?.validatorStatusState;
  // Stable (useCallback) - unlike `slice`, which changes identity on every
  // load-state change - so the effect below runs once per validator.
  const fetchData = slice?.fetchData;

  useEffect(() => {
    fetchData?.(nodeAddress);
  }, [fetchData, nodeAddress]);

  // Live stake (activating / deactivating) is a chain read per request:
  // fetch on entry and refresh slowly (a failed read retries then too).
  const fetchStake = context?.validatorStakeState.fetchData;
  useEffect(() => {
    fetchStake?.(nodeAddress);
  }, [fetchStake, nodeAddress]);
  useLiveRefresh(true, STAKE_REFRESH_MS, () => {
    fetchStake?.(nodeAddress, { force: true });
  });

  const {
    tiles: allTiles,
    needsSummary,
    unavailable
  } = useStatusTiles(nodeAddress);
  const tiles = allTiles.filter(t => !exclude.includes(t.label));
  const fetchSummary = context?.validatorStatusSummaryState.fetchData;
  useEffect(() => {
    if (needsSummary) fetchSummary?.(VALIDATOR_STATUS_SUMMARY_KEY);
  }, [fetchSummary, needsSummary]);
  useLiveRefresh(!unavailable, REFRESH_MS, () => {
    fetchData?.(nodeAddress, { force: true });
  });
  // The MEV rate comes from its earnings (Jito's tip distribution setting).
  const fetchEarnings = context?.epochEarningsState.fetchData;
  useEffect(() => {
    fetchEarnings?.(nodeAddress);
  }, [fetchEarnings, nodeAddress]);

  // A grid of small tiles, 3 across from md up: beside Recent Voting (lg+)
  // nine tiles make three rows. 2 across on phones, where an odd last
  // tile takes the whole row rather than leaving a hole.
  const count = tiles.length + extraTiles.length;
  const xs = (i: number) => (count % 2 === 1 && i === count - 1 ? 12 : 6);
  // Three to a row from md up when they divide by three, else two (a
  // lone last tile spans the row).
  const md = (i: number) =>
    count % 3 === 0 ? 4 : count % 2 === 1 && i === count - 1 ? 12 : 6;
  // Wide: one row of up to six (2, 3 or 4 a row), else rows of four.
  const xl = wide
    ? count > 6
      ? 3
      : Math.max(2, Math.floor(12 / Math.max(count, 1)))
    : undefined;
  return (
    <Row className="g-3">
      {tiles.map((t, i) => (
        <Col key={t.label} xs={xs(i)} md={md(i)} xl={xl}>
          <StatCard
            label={t.label}
            value={t.value}
            sublabel={t.sublabel}
            mono={t.mono}
            wrapSublabel={t.wrapSublabel}
            linkTo={t.linkTo}
          />
        </Col>
      ))}
      {extraTiles.map((tile, i) => (
        <Col
          key={`extra-${i}`}
          xs={xs(tiles.length + i)}
          md={md(tiles.length + i)}
          xl={xl}
        >
          {tile}
        </Col>
      ))}
    </Row>
  );
};

const SFDP_STATE_LABELS: Record<string, string> = {
  TestnetOnboarded: 'Testnet onboarded'
};

/**
 * SFDP highlight for the page header, beside the Status box: program
 * state, delegated stake and the matching status (SFDP version issues are
 * notices),
 * with a link to the Foundation's own page for the detail. Only for
 * validators in the program.
 */
export const ValidatorSfdpBox = ({ nodeAddress }: Props) => {
  const context = useContext(VortexDataContext);
  // Its own fetch: on the Staking tab nothing else loads the status (the
  // slice skips a key it has).
  const fetchStatus = context?.validatorStatusState.fetchData;
  useEffect(() => {
    if (nodeAddress) fetchStatus?.(nodeAddress);
  }, [nodeAddress, fetchStatus]);
  const status = context?.validatorStatusState.data.get(nodeAddress);
  // From the status on current APIs; else the summary ValidatorStatus
  // fetched as a fallback.
  const program =
    status?.sfdp.program ??
    context?.validatorStatusSummaryState.data.get(VALIDATOR_STATUS_SUMMARY_KEY)
      ?.sfdpProgram;
  const participant = status?.sfdp.participant;
  if (!status || !isSfdpState(participant?.state)) return null;
  const stake = status.sfdp.stake;
  const match = stake
    ? sfdpMatch(
        participant?.state,
        {
          effective: stake.effective,
          externalStake: stake.externalStake,
          shortfall: stake.shortfall,
          inTransition: stake.inTransition,
          eligible: stake.criteria?.eligible
        },
        program
      )
    : null;
  // Pending / testnet-only participants get no mainnet delegation yet.
  const notYetApproved = participant?.state !== 'Approved';
  // Label / value rows, laid out like the Node / Vote keys box.
  const rows: Array<[string, ReactNode]> = [
    [
      'Status',
      <>
        <span className="fw-semibold">
          {SFDP_STATE_LABELS[participant?.state ?? ''] ?? participant?.state}
        </span>
        {notYetApproved && <Muted> · not yet approved for mainnet</Muted>}
      </>
    ]
  ];
  if (stake)
    rows.push([
      'Stake',
      <>
        {formatLamports(stake.effective, 0)}
        {match && (
          <>
            <Muted> · </Muted>
            <SfdpMatchStatus match={match} program={program} />
          </>
        )}
      </>
    ]);
  const url = `https://solana.org/sfdp-validators/${participant?.mainnetIdentity ?? status.identity}`;
  return (
    // Stacked over Notices beside the Details card: its own height.
    <div style={{ flex: '0 0 auto', minWidth: 0 }}>
      <SectionCard
        title={
          // Spelled out where the column is wide (phones' full width, xl+),
          // "SFDP" where it's narrow.
          <>
            <span className="d-none d-sm-inline d-lg-none d-xl-inline">
              Solana Foundation Delegation Program
            </span>
            <span className="d-sm-none d-lg-inline d-xl-none">SFDP</span>
          </>
        }
        icon="award"
        aside={
          <span className="d-flex align-items-center gap-2 fs-10">
            <Link
              to={poolPath('SFDP')}
              className="text-nowrap"
              title="Who SFDP delegates to"
            >
              Delegations
            </Link>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="d-inline-flex align-items-center gap-1"
            >
              solana.org
              <FeatherIcon icon="arrow-up-right" size={12} />
            </a>
          </span>
        }
      >
        <div className="detail-lines">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="d-flex align-items-baseline gap-2 min-w-0"
            >
              <span
                className="text-body-tertiary fs-9 flex-shrink-0"
                style={{ minWidth: '3.5rem' }}
              >
                {label}
              </span>
              <span className="fs-9 min-w-0">{value}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
};

const PENDING_LABELS: Record<string, string> = {
  inflationRewardsCommissionBps: 'Inflation commission',
  blockRevenueCommissionBps: 'Block-reward commission',
  inflationRewardsCollector: 'Inflation collector',
  blockRevenueCollector: 'Block-reward collector',
  authorizedVoter: 'Authorized voter',
  nodePubkey: 'Node identity'
};

const shortKey = (k: string) => `${k.slice(0, 6)}…${k.slice(-6)}`;

/** Base58 addresses in API prose, shortened for a one-line notice. */
const shortenKeys = (text: string) =>
  text.replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, shortKey);

/**
 * Vote-state changes that are set but not in effect yet: commission rates
 * (SIMD-0249 delays them at least a full epoch), commission collectors,
 * and the authorized voter. From voteState.pending (vortex-data), plus the
 * next-epoch authorized voter the API already reports. A commission
 * increase - what stakers most need to see coming - is highlighted.
 * Nothing when nothing is pending.
 */
export interface PendingItem {
  key: string;
  label: string;
  from: string;
  to: string;
  when: string;
  later?: string;
  /** The (last) new value applies from epoch + 2: it's what the account
   *  says now, and the runtime only locks it in when this epoch ends, so
   *  it can still change (or vanish) before then. */
  tentative: boolean;
  /** A commission increase (what stakers most need to see coming). */
  increase: boolean;
  decrease: boolean;
}

/**
 * Vote-state changes that are set but not in effect yet, from
 * voteState.pending (plus the next-epoch authorized voter on APIs without
 * it). Shown as notices.
 */
export const pendingChangeItems = (
  vs: ValidatorStatusData['voteState'],
  nodeAddress: string,
  voteAddress: string,
  currentEpoch: number | null
): PendingItem[] => {
  if (!vs) return [];
  const fmt = (key: string, v: number | string | null) => {
    if (v == null) return '—';
    if (key.endsWith('Bps')) return `${Number(v) / 100}%`;
    const str = String(v);
    if (key === 'inflationRewardsCollector' && str === voteAddress)
      return `${shortKey(str)} (vote account)`;
    if (key === 'blockRevenueCollector' && str === nodeAddress)
      return `${shortKey(str)} (identity)`;
    return str === nodeAddress ? `${shortKey(str)} (identity)` : shortKey(str);
  };

  const items: PendingItem[] = [];
  const isUp = (a: number | string | null, b: number | string | null) =>
    a != null && b != null && Number(b) > Number(a);
  const isDown = (a: number | string | null, b: number | string | null) =>
    a != null && b != null && Number(b) < Number(a);
  for (const [key, p] of Object.entries(vs.pending ?? {})) {
    const bps = key.endsWith('Bps');
    const final = p.later?.value ?? p.next;
    const lastFrom = p.later ? p.later.fromEpoch : p.fromEpoch;
    items.push({
      key,
      label: PENDING_LABELS[key] ?? key,
      from: fmt(key, p.effective),
      to: fmt(key, p.next),
      when:
        p.fromEpoch != null
          ? `from epoch ${p.fromEpoch}`
          : 'from next epoch or the one after',
      later: p.later
        ? `then ${fmt(key, p.later.value)}${p.later.fromEpoch != null ? ` from epoch ${p.later.fromEpoch}` : ''}`
        : undefined,
      tentative:
        !!p.later ||
        (lastFrom != null &&
          currentEpoch != null &&
          lastFrom > currentEpoch + 1),
      increase: bps && isUp(p.effective, final),
      decrease: bps && isDown(p.effective, final)
    });
  }
  // APIs without voteState.pending: the next-epoch authorized voter they
  // already report. (With pending, the API folds the voter in itself.)
  if (
    vs.pending === undefined &&
    vs.nextAuthorizedVoter &&
    vs.authorizedVoter &&
    vs.nextAuthorizedVoter !== vs.authorizedVoter
  )
    items.push({
      key: 'authorizedVoter',
      label: PENDING_LABELS.authorizedVoter,
      from: fmt('authorizedVoter', vs.authorizedVoter),
      to: fmt('authorizedVoter', vs.nextAuthorizedVoter),
      when:
        currentEpoch != null ? `from epoch ${currentEpoch + 1}` : 'next epoch',
      tentative: false,
      increase: false,
      decrease: false
    });
  return items;
};

/**
 * Custom commission collectors (SIMD-0232) as lines in the keys box -
 * only when a validator has redirected commission away from the default
 * (inflation commission: the vote account; block rewards: the node
 * identity). Defaults say nothing, so they aren't shown.
 */
export const customCollectors = (
  vs:
    | {
        inflationRewardsCollector?: string | null;
        blockRevenueCollector?: string | null;
        pending?: Record<string, { effective: number | string | null }> | null;
      }
    | null
    | undefined,
  nodeAddress: string,
  voteAddress: string
) => {
  // Where commission goes NOW: a changed collector only takes over once
  // the runtime's snapshot has it, so a pending change's `effective` wins
  // over the account's current setting (the change itself is a notice).
  const now = (key: 'inflationRewardsCollector' | 'blockRevenueCollector') => {
    const e = vs?.pending?.[key]?.effective;
    return typeof e === 'string' ? e : (vs?.[key] ?? null);
  };
  const inflation = now('inflationRewardsCollector');
  const blocks = now('blockRevenueCollector');
  return {
    inflation: inflation && inflation !== voteAddress ? inflation : null,
    blocks: blocks && blocks !== nodeAddress ? blocks : null
  };
};

/**
 * The validator's self-published website (from /validators/status), as a
 * line in the header's Node / Vote keys box. Reads the slice ValidatorStatus fetches; renders
 * nothing until it has loaded or when there's no website.
 */
/** How long the validator has run: "since epoch 632 · 438 epochs" (since
 *  at least, when that's only where records begin). The keys box's line
 *  after Site; nothing until the API says. */
export const ValidatorAge = ({
  nodeAddress,
  labelWidth = '3rem'
}: Props & { labelWidth?: string }) => {
  const context = useContext(VortexDataContext);
  const s = context?.validatorStatusState.data.get(nodeAddress);
  if (s?.firstEpoch == null) return null;
  const atLeast = !!s.firstEpochIsRecordStart;
  return (
    <div className="d-flex align-items-center gap-2 min-w-0">
      <span
        className="text-body-tertiary fs-9 flex-shrink-0"
        style={{ minWidth: labelWidth }}
      >
        Running
      </span>
      <span
        className="fs-9 text-truncate"
        title={
          atLeast
            ? 'Our records start at that epoch: it has run at least this long.'
            : 'Since its vote account first had activated stake.'
        }
      >
        {s.epochsActive != null && (
          <span className="fw-semibold">
            {atLeast && '≥ '}
            {s.epochsActive.toLocaleString()} epochs
          </span>
        )}
        <span className="text-body-tertiary">
          {s.epochsActive != null && ' · '}since epoch {atLeast && 'at least '}
          {s.firstEpoch.toLocaleString()}
        </span>
      </span>
    </div>
  );
};

/** The vote account's withdraw authority, as a keys-box line (who can
 *  take the vote account: the key that matters most if it leaks). */
export const ValidatorWithdrawer = ({
  nodeAddress,
  labelWidth = '3rem'
}: Props & { labelWidth?: string }) => {
  const withdrawer =
    useContext(VortexDataContext)?.validatorStatusState.data.get(nodeAddress)
      ?.voteState?.authorizedWithdrawer;
  if (!withdrawer) return null;
  return (
    <AddressLine
      label="Withdrawer"
      value={withdrawer}
      labelWidth={labelWidth}
      note={withdrawer === nodeAddress ? '(the identity)' : undefined}
    />
  );
};

export const ValidatorWebsite = ({
  nodeAddress,
  labelWidth = '3rem'
}: Props & { labelWidth?: string }) => {
  const context = useContext(VortexDataContext);
  const website =
    context?.validatorStatusState.data.get(nodeAddress)?.info?.website;
  if (!website) return null;
  // Laid out like AddressLine, as the keys box's third line.
  return (
    <div className="d-flex align-items-center gap-2 min-w-0">
      <span
        className="text-body-tertiary fs-9 flex-shrink-0"
        style={{ minWidth: labelWidth }}
      >
        Site
      </span>
      <a
        href={website}
        target="_blank"
        rel="noopener noreferrer"
        className="fs-9 text-truncate d-inline-flex align-items-center gap-1"
        title={website}
      >
        {hostname(website)}
        <FeatherIcon
          icon="arrow-up-right"
          size={12}
          className="flex-shrink-0"
        />
      </a>
    </div>
  );
};

export default ValidatorStatus;

type Severity = 'fail' | 'warn' | 'info';

// Short notice copy per SFDP matching status (full meaning on expand).
const MATCH_NOTICE: Record<string, { title: string; message: string }> = {
  pulled: {
    title: 'Delegation pulled',
    message: 'no SFDP stake although eligible on everything measurable'
  },
  withheld: {
    title: 'Matching withheld',
    message: 'SFDP stake clearly below the matching rule'
  },
  transition: {
    title: 'Delegation in transition',
    message: 'recreated recently; settles within 1-2 epochs'
  },
  ineligible: {
    title: 'Not eligible',
    message: 'fails a program criterion (stake, commission or version)'
  }
};
export interface Notice {
  id: string;
  severity: Severity;
  source: string;
  title: string;
  message: ReactNode;
  /** Longer explanation, shown when the row is expanded. */
  detail?: string;
}

const SEVERITY: Record<Severity, { bg: BadgeBg; label: string; rank: number }> =
  {
    fail: { bg: 'danger', label: 'Fail', rank: 0 },
    warn: { bg: 'warning', label: 'Warn', rank: 1 },
    info: { bg: 'info', label: 'Info', rank: 2 }
  };

/** One notice: badge, source, title and message; click to expand. */
const NoticeRow = ({ n }: { n: Notice }) => {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY[n.severity];
  const expandable = !!n.detail;
  return (
    <li className="d-flex align-items-start gap-2 py-1">
      <Badge
        variant="soft"
        bg={meta.bg}
        className="flex-shrink-0 text-center"
        style={{ minWidth: '4.25rem' }}
      >
        {meta.label}
      </Badge>
      <div
        // Wrapped, not truncated: the reason is often at the end ("...
        // but epoch 1073 requires 4.4.0-rc.1").
        className="min-w-0 fs-9 flex-grow-1"
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        onClick={expandable ? () => setOpen(o => !o) : undefined}
        onKeyDown={
          expandable
            ? e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(o => !o);
                }
              }
            : undefined
        }
      >
        <span className="text-body-tertiary">{n.source} · </span>
        <span className="fw-semibold text-body-emphasis">{n.title}</span>{' '}
        <span className="text-body-secondary">{n.message}</span>
        {expandable && (
          <FeatherIcon
            icon={open ? 'chevron-up' : 'chevron-down'}
            size={12}
            className="ms-1 text-body-tertiary"
          />
        )}
        {open && n.detail && (
          <div className="text-body-tertiary mt-1 text-break">{n.detail}</div>
        )}
      </div>
    </li>
  );
};

/**
 * Everything on this validator that needs attention (the Notices card can
 * grow (the header boxes stay a fixed size): failing / warning operational
 * checks, SFDP version problems and matching status, pending vote-account
 * changes (a commission increase is a warning) and, on Alpenglow
 * clusters, not being admitted to vote. Failures first. Nothing at all
 * when there's nothing to say.
 */
export const useValidatorNotices = (
  nodeAddress: string,
  voteAddress: string
): Notice[] => {
  const context = useContext(VortexDataContext);
  const status = context?.validatorStatusState.data.get(nodeAddress);
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const ag = context?.currentEpochState.alpenglow;
  const alpenglowActive = ag?.phase === 'active';
  const participation =
    context?.epochParticipationState.data.get(voteAddress) ?? null;
  const program =
    status?.sfdp.program ??
    context?.validatorStatusSummaryState.data.get(VALIDATOR_STATUS_SUMMARY_KEY)
      ?.sfdpProgram;
  if (!status) return [];

  const notices: Notice[] = [];
  const sev = (s: ValidatorStatusCheck['status']): Severity =>
    s === 'fail' ? 'fail' : s === 'warn' ? 'warn' : 'info';

  // Operational checks.
  for (const c of status.checks)
    if (!isSfdpCheck(c.id) && !RETIRED_CHECKS.has(c.id) && c.status !== 'ok')
      notices.push({
        id: `check-${c.id}`,
        severity: sev(c.status),
        source: 'Operational',
        title: checkLabel(c.id),
        message: shortReason(c, status) ?? shortenKeys(c.summary),
        detail: c.summary
      });

  // SFDP (program participants only).
  const participant = status.sfdp.participant;
  if (isSfdpState(participant?.state)) {
    for (const c of status.checks)
      if (isSfdpCheck(c.id) && c.status !== 'ok')
        notices.push({
          id: `check-${c.id}`,
          severity: sev(c.status),
          source: 'SFDP',
          title: checkLabel(c.id),
          message: c.summary
        });
    const stake = status.sfdp.stake;
    const match = stake
      ? sfdpMatch(
          participant?.state,
          {
            effective: stake.effective,
            externalStake: stake.externalStake,
            shortfall: stake.shortfall,
            inTransition: stake.inTransition,
            eligible: stake.criteria?.eligible
          },
          program
        )
      : null;
    if (match && match.kind !== 'uncapped' && match.kind !== 'capped')
      notices.push({
        id: 'sfdp-matching',
        severity:
          match.kind === 'pulled'
            ? 'fail'
            : match.kind === 'withheld'
              ? 'warn'
              : 'info',
        source: 'SFDP',
        title: MATCH_NOTICE[match.kind].title,
        message: MATCH_NOTICE[match.kind].message,
        detail: sfdpMatchMeaning(match.kind)
      });
  }

  // Its block producer clock (Alpenglow): this epoch's record, else the
  // last epoch's.
  if (alpenglowActive && currentEpoch != null) {
    // Its /epochs/production history (what the page's Production card
    // loads), else the epoch's producer board.
    const history = context?.productionHistoryState.data.get(voteAddress);
    const recOf = (e: number) =>
      history?.find(r => r.epoch === e) ??
      context?.producerLeaderboardState.data
        .get(e)
        ?.records.find(r => r.nodeAddress === nodeAddress);
    const v =
      clockVerdict(recOf(currentEpoch)) ??
      clockVerdict(recOf(currentEpoch - 1));
    if (v)
      notices.push({
        id: 'producer-clock',
        severity: 'warn',
        source: 'Production',
        title: v.kind === 'behind' ? 'Clock behind' : 'Clock ahead',
        message: clockLine(v),
        detail: CLOCK_DETAIL
      });
  }

  // Pending vote-account changes.
  for (const it of pendingChangeItems(
    status.voteState,
    nodeAddress,
    voteAddress,
    currentEpoch
  ))
    // A failing block_revenue_collector check already says where fees go
    // and when the new collector takes over.
    if (
      !(
        it.key === 'blockRevenueCollector' &&
        status.checks.some(
          c => c.id === 'block_revenue_collector' && c.status !== 'ok'
        )
      )
    )
      notices.push({
        id: `pending-${it.key}`,
        severity: it.increase ? 'warn' : 'info',
        source: 'Vote account',
        title: `${it.label} changing`,
        message: (
          <>
            <span className="font-monospace">{it.from}</span> →{' '}
            <span className="font-monospace fw-semibold">{it.to}</span>
            {`, ${it.when}${it.later ? `, ${it.later}` : ''}`}
            {it.tentative && ' (not locked in yet)'}
          </>
        ),
        detail: it.tentative
          ? `This is the vote account's setting right now. The runtime locks it in when epoch ${currentEpoch ?? 'this epoch'} ends, so it can still change or be reverted before then.`
          : undefined
      });

  // SIMD-0232: changing the identity doesn't move the block-revenue
  // collector, so after an identity change block fees keep going to the old
  // one until the vote account is updated. Often unintended; say so.
  const blocksTo = customCollectors(
    status.voteState,
    nodeAddress,
    voteAddress
  ).blocks;
  // A pending change of the collector is its own notice above; APIs with
  // the block_revenue_collector check report this as a check instead.
  if (
    blocksTo &&
    !status.voteState?.pending?.blockRevenueCollector &&
    !status.checks.some(c => c.id === 'block_revenue_collector')
  )
    notices.push({
      id: 'block-collector',
      severity: 'info',
      source: 'Vote account',
      title: 'Block rewards collector',
      message: (
        <>
          block fees go to{' '}
          <span className="font-monospace">{shortKey(blocksTo)}</span>, not the
          identity
        </>
      ),
      detail:
        "Since SIMD-0232 an identity change doesn't move the block-revenue collector, so it can still point at a former identity. If that isn't intended, update the vote account's block revenue collector."
    });

  // Software that can't go through the Alpenglow migration (mainnet,
  // until it migrates: Firedancer / Frankendancer (Anza), Agave < 4.3 by
  // its feature id) or can't run Alpenglow (Frankendancer, after).
  const verdict = status.software
    ? clientVerdict(
        status.software.family,
        alpenglowActive,
        status.software.version
      )
    : 'ok';
  if (verdict !== 'ok')
    notices.push({
      id: 'alpenglow-client',
      severity: 'fail',
      source: 'Alpenglow',
      title: CLIENT_VERDICT_LABEL[verdict],
      message:
        verdict === 'switch'
          ? `${familyToBase(status.software?.family)} won't follow the migration (epoch ${MAINNET_ACTIVATION_EPOCH})`
          : verdict === 'upgrade'
            ? `Agave ${status.software?.version} won't follow mainnet's Alpenglow activation`
            : "Frankendancer can't run Alpenglow: switch to Agave or Firedancer",
      detail: CLIENT_VERDICT_TEXT[verdict]
    });

  // Alpenglow admission.
  if (alpenglowActive && currentEpoch != null && participation) {
    const cur = participation.find(r => r.epoch === currentEpoch);
    const next = participation.find(r => r.epoch === currentEpoch + 1);
    if (cur && !cur.admitted)
      notices.push({
        id: 'not-admitted',
        severity: 'fail',
        source: 'Consensus',
        title: 'Not admitted',
        message: `can't vote in epoch ${currentEpoch}`
      });
    // The vat check already says so when the runtime hasn't admitted it.
    if (next && !next.admitted && status.vat?.admittedNextEpoch !== false)
      notices.push({
        id: 'not-admitted-next',
        severity: 'warn',
        source: 'Consensus',
        title: 'Not admitted next epoch',
        message: `won't be able to vote in epoch ${currentEpoch + 1}`
      });
  }

  notices.sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);
  return notices;
};

const NOTICES_PER_PAGE = 2;

/**
 * The Notices box for the list from useValidatorNotices, in the header row
 * beside the keys / Operational Status / SFDP boxes: fixed height (two
 * notices at a time) with page arrows, so the layout never shifts however
 * many there are. Most severe first,
 * so page 1 is what matters most. Nothing when the list is empty.
 */
export const ValidatorNotices = ({
  notices,
  nodeAddress
}: {
  notices: Notice[];
  nodeAddress: string;
}) => {
  const [page, setPage] = useState(0);
  const slice = useContext(VortexDataContext)?.validatorStatusState;
  const status = slice?.data.get(nodeAddress);
  const unavailable = !status && !slice?.isLoading && !!slice?.error;
  const pages = Math.ceil(notices.length / NOTICES_PER_PAGE);
  // The list changes with refreshes; stay on a page that exists.
  const current = Math.min(page, Math.max(0, pages - 1));
  // Under the SFDP card beside Details: fills the rest of the column.
  const boxStyle = { flex: '1 1 auto', minWidth: 0 };
  const asOf = status && (
    <span className="text-body-tertiary fs-10 ms-auto">
      as of {new Date(status.asOf * 1000).toLocaleTimeString()}
    </span>
  );
  // Nothing to say (all checks pass) or still loading: no card. Without a
  // status at all, the card says why.
  if (!notices.length && !unavailable) return null;
  // No notices and no status: why.
  if (!notices.length)
    return (
      <div style={boxStyle}>
        <SectionCard title="Notices" icon="bell" aside={asOf}>
          {status ? (
            <>
              <p className="fs-9 fw-semibold mb-1 text-success">
                All checks pass
              </p>
              <PassingLine
                checks={status.checks.filter(
                  c => !isSfdpCheck(c.id) && !RETIRED_CHECKS.has(c.id)
                )}
              />
            </>
          ) : unavailable ? (
            <p className="text-body-tertiary fs-9 mb-0">
              Operational status isn't available for this validator right now.
            </p>
          ) : (
            <div role="status" aria-live="polite" className="py-1">
              <Spinner animation="border" variant="primary" size="sm" />
            </div>
          )}
        </SectionCard>
      </div>
    );
  const counts = { fail: 0, warn: 0, info: 0 };
  for (const n of notices) counts[n.severity]++;
  const shown = notices.slice(
    current * NOTICES_PER_PAGE,
    (current + 1) * NOTICES_PER_PAGE
  );
  return (
    <div style={boxStyle}>
      <SectionCard
        title="Notices"
        icon="bell"
        badge={
          <span className="fs-10 text-body-tertiary ms-2">
            {[
              counts.fail && `${counts.fail} fail`,
              counts.warn && `${counts.warn} warn`,
              counts.info && `${counts.info} info`
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        }
        aside={
          pages > 1 ? (
            <div className="d-flex align-items-center gap-1 fs-10">
              <Button
                variant="soft-secondary"
                className="btn-sm px-2 py-0"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label="Previous notices"
              >
                <FeatherIcon icon="chevron-left" size={12} />
              </Button>
              <span className="text-body-tertiary">
                {current + 1} / {pages}
              </span>
              <Button
                variant="soft-secondary"
                className="btn-sm px-2 py-0"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                aria-label="Next notices"
              >
                <FeatherIcon icon="chevron-right" size={12} />
              </Button>
            </div>
          ) : undefined
        }
      >
        {/* While paging, always room for two rows (27px each) so the box
          doesn't jump on a last page of one; otherwise just the rows. */}
        <ul
          className="list-unstyled mb-0"
          style={{ minHeight: pages > 1 ? '3.4rem' : undefined }}
        >
          {shown.map(n => (
            <NoticeRow key={n.id} n={n} />
          ))}
        </ul>
      </SectionCard>
    </div>
  );
};
