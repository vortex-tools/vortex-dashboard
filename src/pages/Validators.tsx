import { API_ENDPOINT } from 'helpers/apiEndpoint';
import useConsensus from 'hooks/useConsensus';
import DelayedSpinner from 'components/common/DelayedSpinner';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import SearchBox from 'components/common/SearchBox';
import StatCard from 'components/common/StatCard';
import ValidatorsStatusTable, {
  ValidatorsTableRow,
  createValidatorsStatusColumns
} from 'components/tables/ValidatorsStatusTable';
import { formatLamports } from 'helpers/utils';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useLiveRefresh from 'hooks/useLiveRefresh';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import {
  VALIDATOR_STATUS_SUMMARY_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { ChangeEvent, useContext, useEffect, useMemo, useState } from 'react';
import { Col, Form, Row } from 'react-bootstrap';

const breadcrumbItems: Crumb[] = [
  { label: 'Home', url: '/' },
  { label: 'Validators', active: true }
];

// Matches the endpoint's Cache-Control: max-age=30.
const REFRESH_MS = 30_000;
const PRODUCERS_REFRESH_MS = 60_000;
const PRODUCERS_WAIT_MS = 1_500;
const SUMMARY_PRODUCING_KEY = `vx-summary-producing:${API_ENDPOINT}`;

/**
 * Operational status of every staked validator - stake, client,
 * location, VAT runway and a verdict per check - from /validators/status/summary.
 * Deliberately not a ranking: it defaults to stake order and is for
 * spotting validators with problems. Each row links to the validator's
 * page, whose Status section has the detail behind every verdict.
 */
const Validators = () => {
  const context = useContext(VortexDataContext);
  const slice = context?.validatorStatusSummaryState;
  const summary = slice?.data.get(VALIDATOR_STATUS_SUMMARY_KEY);
  const fetchData = slice?.fetchData;

  useEffect(() => {
    fetchData?.(VALIDATOR_STATUS_SUMMARY_KEY);
  }, [fetchData]);

  // Base / Fork and Host come from the current epoch's
  // leaderboard, so they read exactly as on the rankings: the Tower voting
  // leaderboard while Tower is current, the Alpenglow participation
  // leaderboard once Alpenglow is active (the Tower one is empty then).
  // They change slowly; a single (cached) fetch is enough.
  const { alpenglowActive, known } = useConsensus();
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const fetchVoting = context?.epochVoteLeaderboardState.fetchData;
  const fetchParticipation = context?.participationLeaderboardState.fetchData;
  // The Producing column: the summary's own `producing`, else (an API
  // without it) this epoch's production board, 858 KB for two numbers.
  // An API found without it is remembered, so its next visit fetches the
  // board alongside the summary rather than after it.
  const summaryHasProducing = useMemo(() => {
    if (!summary) {
      try {
        // Every API has it now (d2f8146): assume so until a summary
        // without it says otherwise.
        return localStorage.getItem(SUMMARY_PRODUCING_KEY) !== '0';
      } catch {
        return true;
      }
    }
    return summary.validators.some(v => v.producing !== undefined);
  }, [summary]);
  useEffect(() => {
    if (!summary) return;
    try {
      localStorage.setItem(
        SUMMARY_PRODUCING_KEY,
        summaryHasProducing ? '1' : '0'
      );
    } catch {
      // storage blocked: the board is fetched alongside next time
    }
  }, [summary, summaryHasProducing]);
  const useBoard =
    alpenglowActive && currentEpoch !== null && !summaryHasProducing;
  const fetchProducers = context?.producerLeaderboardState.fetchData;
  useEffect(() => {
    if (useBoard) fetchProducers?.(currentEpoch!);
  }, [useBoard, currentEpoch, fetchProducers]);
  const producerRecords =
    alpenglowActive && currentEpoch !== null
      ? context?.producerLeaderboardState.data.get(currentEpoch)?.records
      : undefined;
  // Hold the table for the production board (so the Producing column
  // doesn't pop in a moment after the rest), but never more than
  // PRODUCERS_WAIT_MS: a slow board then fills in.
  const [producersWaited, setProducersWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setProducersWaited(true), PRODUCERS_WAIT_MS);
    return () => clearTimeout(t);
  }, []);
  const producersReady =
    !alpenglowActive ||
    (!!summary && summaryHasProducing) ||
    producerRecords !== undefined ||
    producersWaited;
  const producingByNode = useMemo(
    () =>
      producerRecords
        ? new Map(
            producerRecords.map(p => [
              p.nodeAddress,
              { blocks: p.blocks, skippedSlots: p.skippedSlots }
            ])
          )
        : null,
    [producerRecords]
  );
  useEffect(() => {
    if (!known) return;
    if (alpenglowActive) {
      if (currentEpoch !== null) fetchParticipation?.(currentEpoch);
    } else fetchVoting?.();
  }, [known, alpenglowActive, currentEpoch, fetchVoting, fetchParticipation]);
  const cohortRecords =
    currentEpoch === null
      ? undefined
      : alpenglowActive
        ? context?.participationLeaderboardState.data.get(currentEpoch)?.records
        : context?.epochVoteLeaderboardState.data.get(currentEpoch)?.records;
  // Keyed by node AND vote address (participation records can lack a node).
  const cohortByKey = useMemo(() => {
    const m = new Map<
      string,
      {
        softwareBase: string | null;
        softwareFlavor: string | null;
        datacenter: string | null;
        provider: string | null;
      }
    >();
    const capitalise = (f: string | null) =>
      f ? f.charAt(0).toUpperCase() + f.slice(1) : f;
    for (const r of cohortRecords ?? []) {
      const v = {
        softwareBase: r.softwareBase ?? null,
        softwareFlavor: capitalise(r.softwareFlavor ?? null),
        datacenter: r.datacenter ?? null,
        provider: r.provider ?? null
      };
      if (r.nodeAddress && r.nodeAddress !== 'N/A') m.set(r.nodeAddress, v);
      m.set(r.voteAddress, v);
    }
    return m;
  }, [cohortRecords]);

  // The slice error is slice-wide, but this page requests a single key.
  const unavailable = !summary && !slice?.isLoading && !!slice?.error;

  useLiveRefresh(!unavailable, REFRESH_MS, () => {
    fetchData?.(VALIDATOR_STATUS_SUMMARY_KEY, { force: true });
  });
  // The production board moves with each leader window; the leaderboards'
  // minute is plenty.
  useLiveRefresh(
    useBoard,
    PRODUCERS_REFRESH_MS,
    () =>
      currentEpoch !== null && fetchProducers?.(currentEpoch, { force: true })
  );

  const rows = useMemo<ValidatorsTableRow[]>(
    () =>
      (summary?.validators ?? []).map(r => {
        const c = cohortByKey.get(r.identity) ?? cohortByKey.get(r.voteAccount);
        return {
          ...r,
          softwareBase: c?.softwareBase ?? null,
          softwareFlavor: c?.softwareFlavor ?? null,
          datacenter: c?.datacenter ?? null,
          provider: c?.provider ?? null,
          // null = no leader slots yet; undefined = not known yet.
          producing: summaryHasProducing
            ? (r.producing ?? null)
            : producingByNode
              ? (producingByNode.get(r.identity) ?? null)
              : undefined
        };
      }),
    [summary, cohortByKey, producingByNode, summaryHasProducing]
  );
  // Share denominator: the whole list (every staked validator), not the
  // filtered view.
  const totalStake = useMemo(
    () =>
      rows.length ? rows.reduce((acc, r) => acc + r.activatedStake, 0) : null,
    [rows]
  );
  const showActiveFrom = rows.some(r => r.firstEpoch != null);
  const columns = useMemo(
    () =>
      createValidatorsStatusColumns({
        totalStake,
        showActiveFrom
      }),
    [totalStake, showActiveFrom]
  );

  const [delinquentOnly, setDelinquentOnly] = useState(false);
  const tableData = useMemo(
    () => rows.filter(r => !delinquentOnly || r.delinquent),
    [rows, delinquentOnly]
  );

  const table = useAdvanceTable({
    data: tableData,
    columns,
    pageSize: 50,
    pagination: true,
    sortable: true,
    selection: false,
    getRowId: row => row.identity,
    // Toggling the filter is a new row set; a 30 s refresh is not.
    resetPageKey: delinquentOnly ? 'd' : '',
    initialState: { sorting: [{ id: 'stake', desc: true }] }
  });

  const kpis = useMemo(() => {
    if (!summary) return undefined;
    const stake = rows.reduce((acc, r) => acc + r.activatedStake, 0);
    const delinquent = rows.filter(r => r.delinquent);
    const delinquentStake = delinquent.reduce(
      (acc, r) => acc + r.activatedStake,
      0
    );
    return {
      validators: rows.length,
      stake,
      delinquent: delinquent.length,
      delinquentStakePct: stake > 0 ? (delinquentStake / stake) * 100 : 0
    };
  }, [summary, rows]);

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    table.setGlobalFilter(e.target.value || undefined);
  };

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-9">
        <Row className="page-header align-items-start justify-content-between g-3">
          <Col xs="auto">
            <h3>Validators</h3>
            <p className="text-body-tertiary lh-sm mb-0 mt-1">
              Operational status of every staked validator
            </p>
          </Col>
        </Row>

        {kpis && (
          <Row className="g-3 mb-3">
            <Col xs={6} md={4}>
              <StatCard
                label="Validators"
                value={kpis.validators.toLocaleString()}
                sublabel={
                  summary
                    ? `epoch ${summary.epoch} · as of ${new Date(summary.asOf * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    : undefined
                }
              />
            </Col>
            <Col xs={6} md={4}>
              <StatCard
                label="Total Stake"
                // Millions, so it fits a half-width card on phones; the
                // exact figure beneath.
                value={`◎${(kpis.stake / 1e15).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`}
                sublabel={formatLamports(kpis.stake, 0)}
              />
            </Col>
            <Col xs={6} md={4}>
              <StatCard
                label="Delinquent Stake"
                value={`${kpis.delinquentStakePct.toFixed(2)}%`}
                sublabel={`${kpis.delinquent.toLocaleString()} validators`}
              />
            </Col>
          </Row>
        )}

        <Row className="align-items-center justify-content-between mb-3 g-3">
          <SearchBox placeholder="Search" onChange={handleSearch} />
          <Col xs="auto" className="d-flex flex-wrap gap-3">
            <Form.Check
              type="switch"
              id="validators-delinquent-only"
              label="Delinquent only"
              checked={delinquentOnly}
              onChange={e => setDelinquentOnly(e.target.checked)}
              className="mb-0"
            />
          </Col>
        </Row>

        <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1">
          {unavailable ? (
            <p className="text-body-tertiary fs-9 text-center py-6 px-4 mb-0">
              Validator status isn't available right now.
            </p>
          ) : !summary || !producersReady ? (
            <DelayedSpinner loading label="Loading validators…" />
          ) : (
            <AdvanceTableProvider {...table}>
              <ValidatorsStatusTable />
            </AdvanceTableProvider>
          )}
        </div>
      </div>
    </div>
  );
};

export default Validators;
