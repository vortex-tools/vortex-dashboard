import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import FeatherIcon from 'feather-icons-react';
import Button from 'components/base/Button';
import EmptyEpochState from 'components/common/EmptyEpochState';
import ValidatorSearch from 'components/common/ValidatorSearch';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import BucketSearch from 'components/common/BucketSearch';
import ChartSkeleton from 'components/common/ChartSkeleton';
import WarningBanner from 'components/common/WarningBanner';
import { hasMissingBlockData } from 'helpers/utils';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useEpochSelectOptions from 'hooks/useEpochSelectOptions';
import useRefreshOnce from 'hooks/useRefreshOnce';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { ButtonGroup, Col, Form, Row, ToggleButton } from 'react-bootstrap';
import {
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import EpochVoteRecordTable, {
  createEpochVoteRecordTableColumns,
  EpochVoteRecordTableSkeleton,
  TOTALS_ROW_ID
} from 'components/tables/EpochVoteRecordTable';
import EpochVotesChart, {
  EpochVotesChartMetric
} from 'components/charts/e-charts/EpochVotesChart';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router';
import EpochVoteBucketRecordTable, {
  createEpochVoteBucketRecordTableColumns,
  TOTALS_ROW_ID as BUCKET_TOTALS_ROW_ID,
  SlotFilter,
  buildBucketRows,
  buildInvestigateRows,
  buildInvestigateWithNeighborsRows,
  buildSkeletonRows,
  slotStatus
} from 'components/tables/EpochVoteBucketRecordTable';

function splitArrayIntoChunks<T>(array: T[], chunkSize: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }

  return result;
}

interface SelectedEpoch {
  current: boolean;
  epoch?: number;
}

const VoteHistory = () => {
  const navigate = useNavigate();
  const { address: voteAddress, epoch, bucket } = useParams();
  const context = useContext(VortexDataContext);
  const initialSelectedEpoch: SelectedEpoch =
    epoch !== undefined && !Number.isNaN(parseInt(epoch))
      ? { epoch: parseInt(epoch), current: false }
      : {
          current: true
        };
  const [selectedEpoch, setSelectedEpoch] =
    useState<SelectedEpoch>(initialSelectedEpoch);
  // Chart metric and slot filter are linkable via query params so the
  // selection persists across reloads / shared URLs.
  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_SLOT_FILTERS: readonly SlotFilter[] = [
    'all',
    'investigate',
    'investigate-neighbors',
    'lag-only',
    'deductions-only',
    'skipped-only'
  ] as const;
  const slotFilterParam = searchParams.get('filter');
  const slotFilter: SlotFilter =
    slotFilterParam &&
    (VALID_SLOT_FILTERS as readonly string[]).includes(slotFilterParam)
      ? (slotFilterParam as SlotFilter)
      : 'investigate';
  const setSlotFilter = (next: SlotFilter) => {
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev);
        if (next === 'investigate') {
          params.delete('filter');
        } else {
          params.set('filter', next);
        }
        return params;
      },
      { replace: true }
    );
  };
  const chartMetric: EpochVotesChartMetric =
    searchParams.get('chart') === 'lag' ? 'lag' : 'deductions';
  const setChartMetric = (next: EpochVotesChartMetric) => {
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev);
        if (next === 'deductions') {
          params.delete('chart');
        } else {
          params.set('chart', next);
        }
        return params;
      },
      { replace: true }
    );
  };
  const identity = useValidatorIdentity(voteAddress);

  // Comparison validator (B). Lives in ?b=<address>; resolved to a full
  // identity (node + vote + display name) so the chart and table can read
  // either address shape.
  const bAddressParam = searchParams.get('b') || undefined;
  const bIdentity = useValidatorIdentity(bAddressParam);
  const bVoteAddress = bIdentity?.voteAddress;
  const [showBSearch, setShowBSearch] = useState(false);

  const setBAddress = useCallback(
    (addr: string | undefined) => {
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev);
          if (addr) {
            params.set('b', addr);
          } else {
            params.delete('b');
          }
          return params;
        },
        { replace: true }
      );
      if (!addr) setShowBSearch(false);
    },
    [setSearchParams]
  );

  // Swapping the primary validator means navigating to a new URL path; we
  // keep the rest of the URL (epoch + query params) intact so the user
  // doesn't lose their chart tab or comparison validator on swap.
  const [showASearch, setShowASearch] = useState(false);
  const swapAAddress = useCallback(
    (newAddress: string) => {
      const epochSegment =
        selectedEpoch.epoch !== undefined
          ? `/epoch/${selectedEpoch.epoch}`
          : '';
      const search = searchParams.toString();
      const suffix = search ? `?${search}` : '';
      navigate(`/validator/${newAddress}/votes${epochSegment}${suffix}`);
      setShowASearch(false);
    },
    [navigate, searchParams, selectedEpoch]
  );

  useEffect(() => {
    if (!context?.epochVoteRecordState || context.epochVoteRecordState.error) {
      return;
    }
    const state = context.epochVoteRecordState;
    const currentEpoch = context.currentEpochState.epoch;

    if (selectedEpoch.current) {
      const clusterMap = state.data.get(IDEAL_RECORD_KEY);
      if (currentEpoch === null || !clusterMap?.has(currentEpoch)) {
        state.fetchData(IDEAL_RECORD_KEY);
      }
      const voterMap = voteAddress ? state.data.get(voteAddress) : undefined;
      if (
        voteAddress &&
        (currentEpoch === null || !voterMap?.has(currentEpoch))
      ) {
        state.fetchData(voteAddress);
      }
      const bMap = bVoteAddress ? state.data.get(bVoteAddress) : undefined;
      if (bVoteAddress && (currentEpoch === null || !bMap?.has(currentEpoch))) {
        state.fetchData(bVoteAddress);
      }
    } else if (selectedEpoch.epoch !== undefined) {
      const targetEpoch = selectedEpoch.epoch;
      if (!state.data.get(IDEAL_RECORD_KEY)?.has(targetEpoch)) {
        state.fetchData(IDEAL_RECORD_KEY, targetEpoch);
      }
      if (voteAddress && !state.data.get(voteAddress)?.has(targetEpoch)) {
        state.fetchData(voteAddress, targetEpoch);
      }
      if (bVoteAddress && !state.data.get(bVoteAddress)?.has(targetEpoch)) {
        state.fetchData(bVoteAddress, targetEpoch);
      }
    }
  }, [context, selectedEpoch, voteAddress, bVoteAddress]);

  // Force-refresh current-epoch data once per (validator, epoch) page entry.
  // Past-epoch records are immutable and stay cached forever via the effect
  // above; current-epoch records are still being written server-side, so any
  // cached array from earlier in the session is partial.
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const targetEpoch = selectedEpoch.current
    ? currentEpoch
    : (selectedEpoch.epoch ?? null);
  const viewingCurrent = currentEpoch !== null && targetEpoch === currentEpoch;
  useRefreshOnce(
    viewingCurrent && voteAddress
      ? `${voteAddress}:${bVoteAddress ?? ''}:${currentEpoch}`
      : undefined,
    () => {
      if (!context || currentEpoch === null || !voteAddress) return;
      const epochArg = selectedEpoch.current ? undefined : currentEpoch;
      context.epochVoteRecordState.fetchData(IDEAL_RECORD_KEY, epochArg, {
        force: true
      });
      context.epochVoteRecordState.fetchData(voteAddress, epochArg, {
        force: true
      });
      // Refresh the comparison validator on the same page entry too, so
      // its current-epoch array is fetched at the same server state as
      // the ideal + A records. Leaving B stale widened the length-skew
      // window that made the comparison metrics read negative.
      if (bVoteAddress) {
        context.epochVoteRecordState.fetchData(bVoteAddress, epochArg, {
          force: true
        });
      }
    }
  );

  const { resolvedEpoch, epochStartSlot, clusterData, voterData, bVoterData } =
    useMemo(() => {
      const state = context?.epochVoteRecordState;
      const targetEpoch =
        selectedEpoch.epoch !== undefined
          ? selectedEpoch.epoch
          : (context?.currentEpochState.epoch ?? undefined);

      if (!state || targetEpoch === undefined || !voteAddress) {
        return {
          resolvedEpoch: undefined,
          clusterData: undefined,
          voterData: undefined,
          bVoterData: undefined,
          epochStartSlot: undefined
        };
      }

      return {
        resolvedEpoch: targetEpoch,
        epochStartSlot: targetEpoch * 432_000,
        clusterData: state.data.get(IDEAL_RECORD_KEY)?.get(targetEpoch),
        voterData: state.data.get(voteAddress)?.get(targetEpoch),
        bVoterData: bVoteAddress
          ? state.data.get(bVoteAddress)?.get(targetEpoch)
          : undefined
      };
    }, [context, selectedEpoch, voteAddress, bVoteAddress]);

  // Navigate to a specific epoch (or "current" if undefined) while
  // preserving query params (chart metric, comparison validator, filter).
  const goToEpoch = (epoch: number | undefined) => {
    const search = searchParams.toString();
    const suffix = search ? `?${search}` : '';
    if (epoch === undefined) {
      navigate(`/validator/${voteAddress}/votes${suffix}`);
      setSelectedEpoch({ current: true, epoch: undefined });
      return;
    }
    navigate(`/validator/${voteAddress}/votes/epoch/${epoch}${suffix}`);
    setSelectedEpoch({ current: false, epoch });
  };

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value) {
      goToEpoch(undefined);
      return;
    }
    goToEpoch(Number.parseInt(value));
  };

  const slotFilterOptions: { label: string; value: SlotFilter }[] = useMemo(
    () => [
      { label: 'All slots', value: 'all' },
      { label: 'Investigate', value: 'investigate' },
      { label: 'Investigate w/ neighboring', value: 'investigate-neighbors' },
      { label: 'Latency only', value: 'lag-only' },
      { label: 'Credit deductions only', value: 'deductions-only' },
      { label: 'Skipped slots only', value: 'skipped-only' }
    ],
    []
  );

  const epochOptions = useEpochSelectOptions({
    currentEpoch,
    resolvedEpoch
  });

  const CHUNK_SIZE = 1000;
  const bucketedOptimalData = useMemo(() => {
    if (!clusterData) return [];
    return splitArrayIntoChunks(clusterData, CHUNK_SIZE);
  }, [clusterData]);
  const bucketedVoterData = useMemo(() => {
    if (!voterData) return [];
    return splitArrayIntoChunks(voterData, CHUNK_SIZE);
  }, [voterData]);
  const bucketedBVoterData = useMemo(() => {
    if (!bVoterData) return [];
    return splitArrayIntoChunks(bVoterData, CHUNK_SIZE);
  }, [bVoterData]);
  // Prepend a synthetic "totals" row (full epoch arrays) to drive a pinned
  // summary row in the per-epoch vote record table. Index 0 = totals,
  // indices 1..N = bucket 0..N-1.
  const epochTableData = useMemo(() => {
    if (!voterData) return [];
    return [voterData, ...bucketedVoterData];
  }, [voterData, bucketedVoterData]);
  const epochTableIdealData = useMemo(() => {
    if (!clusterData) return undefined;
    return [clusterData, ...bucketedOptimalData];
  }, [clusterData, bucketedOptimalData]);
  const epochTableBData = useMemo(() => {
    if (!bVoterData) return undefined;
    return [bVoterData, ...bucketedBVoterData];
  }, [bVoterData, bucketedBVoterData]);

  const computedTableColumns = useMemo(() => {
    return createEpochVoteRecordTableColumns(
      voteAddress ?? '',
      resolvedEpoch,
      epochStartSlot,
      CHUNK_SIZE,
      epochTableIdealData,
      epochTableBData
    );
  }, [
    epochTableIdealData,
    epochTableBData,
    voteAddress,
    resolvedEpoch,
    epochStartSlot
  ]);

  const bucketIndex = useMemo(() => {
    if (bucket === undefined) return 0;
    let parsedBucket = Number.parseInt(bucket);
    if (Number.isNaN(parsedBucket)) return 0;
    return parsedBucket - 1;
  }, [bucket]);

  const isInvestigateMode =
    slotFilter === 'investigate' || slotFilter === 'investigate-neighbors';

  // Set of bucket indices that contain at least one Ok / Slow / Skipped
  // slot. Drives the fast-back / fast-forward chevrons in BucketSearch
  // while in Investigate modes.
  const interestingBuckets = useMemo(() => {
    if (!voterData || !clusterData) return undefined;
    const set = new Set<number>();
    const len = Math.min(voterData.length, clusterData.length);
    for (let i = 0; i < len; i++) {
      const status = slotStatus(voterData[i], clusterData[i]);
      if (status === 'Ok' || status === 'Slow' || status === 'Skipped') {
        set.add(Math.floor(i / CHUNK_SIZE));
      }
    }
    return set;
  }, [voterData, clusterData]);
  // Insight data + validator directory are passed into the column
  // factory in Investigate modes so the cluster-best / Distribution /
  // Leader columns can render data-ready cells.
  const blockInsightsByslot = context?.blockInsightsState.data;
  const insightsLoading = context?.blockInsightsState.isLoading ?? false;
  const validatorsByNodeAddress =
    context?.validatorDirectoryState.byNodeAddress;
  // Leader-region source: the epoch's voting leaderboard is the only
  // place per-validator geo (continent) lives, so build a
  // nodeAddress -> continent map from its records to feed the "Leader
  // Region" column. Undefined until the leaderboard for this epoch loads.
  const leaderRegionByNodeAddress = useMemo(() => {
    const records =
      resolvedEpoch !== undefined
        ? context?.epochVoteLeaderboardState.data.get(resolvedEpoch)?.records
        : undefined;
    if (!records) return undefined;
    const map = new Map<string, string | null>();
    for (const r of records) map.set(r.nodeAddress, r.continent);
    return map;
  }, [context, resolvedEpoch]);
  const computedBucketTableColumns = useMemo(() => {
    return createEpochVoteBucketRecordTableColumns(
      bucketIndex,
      epochStartSlot,
      bucketedVoterData[bucketIndex],
      bucketedOptimalData[bucketIndex],
      isInvestigateMode
        ? {
            isInvestigate: true,
            blockInsights: blockInsightsByslot,
            validatorsByNodeAddress,
            leaderRegionByNodeAddress,
            insightsLoading
          }
        : undefined
    );
  }, [
    bucketedOptimalData,
    bucketedVoterData,
    bucketIndex,
    epochStartSlot,
    isInvestigateMode,
    blockInsightsByslot,
    validatorsByNodeAddress,
    leaderRegionByNodeAddress,
    insightsLoading
  ]);

  // Ensure the epoch's voting leaderboard is loaded when Investigate mode
  // is active — it backs the leader-region join above. The slice
  // self-guards against duplicate/in-flight fetches, so a plain effect is
  // enough; `fetchData(undefined)` targets the current epoch.
  useEffect(() => {
    if (!isInvestigateMode || resolvedEpoch === undefined) return;
    const epochArg = selectedEpoch.current ? undefined : resolvedEpoch;
    context?.epochVoteLeaderboardState.fetchData(epochArg);
  }, [context, isInvestigateMode, resolvedEpoch, selectedEpoch.current]);

  // Batch-fetch insights for every notable slot in the current bucket on
  // entry to either Investigate mode. Re-keyed by `(filter, bucket)` via
  // a ref so unrelated context updates don't refire the network.
  const insightInitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${slotFilter}:${bucketIndex}`;
    if (insightInitKeyRef.current === key) return;
    if (epochStartSlot === undefined) return;
    const ideal = bucketedOptimalData[bucketIndex];
    const voter = bucketedVoterData[bucketIndex];
    const insightsState = context?.blockInsightsState;
    if (!ideal || !voter || !insightsState) return;
    if (
      slotFilter !== 'investigate' &&
      slotFilter !== 'investigate-neighbors'
    ) {
      insightInitKeyRef.current = key;
      return;
    }
    insightInitKeyRef.current = key;
    // Match each Investigate-mode builder's visible-row set so all rows
    // that will render get their insights fetched in one batch:
    //   - plain Investigate: only Ok / Slow / Skipped slots
    //   - Investigate w/ neighbors: same trigger plus the ±2-slot buffer
    //     of (Perfect / None) context rows around each
    const visible = new Set<number>();
    const len = Math.min(voter.length, ideal.length);
    if (slotFilter === 'investigate-neighbors') {
      for (let i = 0; i < len; i++) {
        if (slotStatus(voter[i], ideal[i]) === 'Perfect') continue;
        const lo = Math.max(0, i - 2);
        const hi = Math.min(len - 1, i + 2);
        for (let j = lo; j <= hi; j++) visible.add(j);
      }
    } else {
      for (let i = 0; i < len; i++) {
        const status = slotStatus(voter[i], ideal[i]);
        if (status === 'Ok' || status === 'Slow' || status === 'Skipped') {
          visible.add(i);
        }
      }
    }
    if (visible.size > 0) {
      const slotsToFetch = Array.from(visible).map(
        i => epochStartSlot + bucketIndex * CHUNK_SIZE + i
      );
      insightsState.fetchBatch(slotsToFetch);
    }
  }, [
    slotFilter,
    bucketIndex,
    bucketedOptimalData,
    bucketedVoterData,
    epochStartSlot,
    context
  ]);

  // Keep the standard and investigate row arrays each in their own memo so
  // that switching between the non-investigate filter modes (which all use
  // the same data shape) doesn't churn the table reference. TanStack
  // re-derives the entire core row model whenever `data` changes identity,
  // even if the contents are equivalent — this avoids that.
  const standardBucketRows = useMemo(
    () => buildBucketRows(bucketedVoterData[bucketIndex]),
    [bucketedVoterData, bucketIndex]
  );
  const investigateBucketRows = useMemo(
    () =>
      buildInvestigateRows(
        bucketedVoterData[bucketIndex],
        bucketedOptimalData[bucketIndex]
      ),
    [bucketedOptimalData, bucketedVoterData, bucketIndex]
  );
  const investigateNeighborsBucketRows = useMemo(
    () =>
      buildInvestigateWithNeighborsRows(
        bucketedVoterData[bucketIndex],
        bucketedOptimalData[bucketIndex]
      ),
    [bucketedOptimalData, bucketedVoterData, bucketIndex]
  );
  // Built once; reused while voter / ideal data is in flight so the
  // table renders its chrome with pulsing skeleton rows in place of
  // real data instead of a centered spinner.
  const skeletonBucketRows = useMemo(() => buildSkeletonRows(2), []);
  const bucketDataReady = !!voterData && !!clusterData;
  const bucketTableData = !bucketDataReady
    ? skeletonBucketRows
    : slotFilter === 'investigate'
      ? investigateBucketRows
      : slotFilter === 'investigate-neighbors'
        ? investigateNeighborsBucketRows
        : standardBucketRows;

  const bucketTable = useAdvanceTable({
    data: bucketTableData,
    columns: computedBucketTableColumns,
    pageSize: 1000,
    pagination: true,
    sortable: true,
    selection: false,
    getRowId: (_row, index) =>
      index === 0 ? BUCKET_TOTALS_ROW_ID : String(index),
    initialState: { rowPinning: { top: [BUCKET_TOTALS_ROW_ID] } }
  });

  useEffect(() => {
    if (!resolvedEpoch || currentEpoch === null) return;
    bucketTable.setSorting([
      {
        id: 'slot',
        desc: resolvedEpoch === currentEpoch
      }
    ]);
    // slotFilter is in deps so switching INTO investigate mode (which only
    // makes sense in slot order) snaps the sort back to the slot column.
  }, [bucketTable, resolvedEpoch, currentEpoch, slotFilter]);

  const handleSlotFilterChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setSlotFilter(event.target.value as SlotFilter);
  };

  // Force-refresh the vote record for the currently-viewed epoch (cluster
  // baseline + A + optional B). Used by the manual refresh button on the
  // bucket page so the user can pull fresh data without reloading.
  const refreshBucketData = () => {
    if (!context || resolvedEpoch === undefined || !voteAddress) return;
    const state = context.epochVoteRecordState;
    state.fetchData(IDEAL_RECORD_KEY, resolvedEpoch, { force: true });
    state.fetchData(voteAddress, resolvedEpoch, { force: true });
    if (bVoteAddress) {
      state.fetchData(bVoteAddress, resolvedEpoch, { force: true });
    }
  };

  // Sync the status filter state to the bucket table. Investigate mode
  // pre-filters via the data shape, so it doesn't need a column filter on
  // top.
  useEffect(() => {
    const filters: { id: string; value: unknown }[] = [];
    if (
      slotFilter === 'lag-only' ||
      slotFilter === 'deductions-only' ||
      slotFilter === 'skipped-only'
    ) {
      filters.push({ id: 'status', value: slotFilter });
    }
    bucketTable.setColumnFilters(filters);
  }, [bucketTable, slotFilter]);

  const epochTable = useAdvanceTable({
    data: epochTableData,
    columns: computedTableColumns,
    pageSize: 500,
    pagination: true,
    sortable: true,
    selection: false,
    getRowId: (_row, index) => (index === 0 ? TOTALS_ROW_ID : String(index)),
    initialState: { rowPinning: { top: [TOTALS_ROW_ID] } }
  });

  useEffect(() => {
    if (!resolvedEpoch || currentEpoch === null) return;
    epochTable.setSorting([
      {
        id: 'bucket',
        desc: resolvedEpoch === currentEpoch
      }
    ]);
  }, [epochTable, resolvedEpoch, currentEpoch]);

  // Call hooks above early returns so the hook count stays stable.
  const isLoadingEpoch = clusterData === undefined || voterData === undefined;

  if (!context) return <div>Loading...</div>;

  let { epochVoteRecordState } = context;

  if (epochVoteRecordState.error)
    return <div>Error: {epochVoteRecordState.error}</div>;

  const isEmptyEpoch =
    clusterData !== undefined &&
    voterData !== undefined &&
    (clusterData.length === 0 || voterData.length === 0);
  const hasMissingData = hasMissingBlockData(resolvedEpoch);

  // Leaderboard-style path with the validator linking to its overview:
  //   Home > Vote Leaderboard > Epoch N > <name> > Vote Record [ > Bucket M ]
  // The name used to be the active, unlinked crumb on the epoch view, which
  // left no way from this page to the validator's own page. "Vote Record"
  // now marks the current page, and on the bucket view links back to the
  // epoch record (the job the name crumb did before).
  const epochForBreadcrumb = resolvedEpoch ?? selectedEpoch.epoch;
  const validatorName = identity?.displayName ?? 'Validator';
  const overviewUrl = identity
    ? `/validator/${identity.nodeAddress}`
    : voteAddress
      ? `/validator/${voteAddress}`
      : '#!';
  const breadcrumbItems: Crumb[] = [
    { label: 'Home', url: '/' },
    { label: 'Vote Leaderboard', url: '/leaderboards/voting' }
  ];
  if (epochForBreadcrumb !== undefined) {
    const epochRecordUrl = voteAddress
      ? `/validator/${voteAddress}/votes/epoch/${epochForBreadcrumb}`
      : '#!';
    breadcrumbItems.push(
      {
        label: `Epoch ${epochForBreadcrumb}`,
        url: `/leaderboards/voting/epoch/${epochForBreadcrumb}`
      },
      { label: validatorName, url: overviewUrl },
      bucket === undefined
        ? { label: 'Vote Record', active: true }
        : { label: 'Vote Record', url: epochRecordUrl }
    );
    if (bucket !== undefined) {
      breadcrumbItems.push({
        label: `Bucket ${bucketIndex + 1}`,
        active: true
      });
    }
  }

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <Row className="page-header align-items-start justify-content-between g-3">
        <Col xs="auto">
          <h1 className="h3">
            {bucket === undefined ? 'Vote Record' : 'Detailed Vote Record'}
          </h1>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            {bucket === undefined
              ? 'Vote performance relative to optimal inclusion'
              : 'Vote latency and credit deductions for each slot'}
          </p>
        </Col>
      </Row>
      {voteAddress && (
        <div className="d-flex align-items-center justify-content-between gap-3 mb-3 flex-wrap">
          <div className="d-flex align-items-center gap-2 flex-wrap min-w-0">
            {/* Validator A pill: the name links to the validator's overview;
                the chevron opens the search to swap which validator's vote
                record we're viewing. (Clicking the name used to swap, which
                left no obvious way to reach the validator's own page.) */}
            {showASearch ? (
              <div style={{ width: '100%', maxWidth: '20rem' }}>
                <ValidatorSearch
                  onSelect={v => swapAAddress(v.voteAddress ?? v.nodeAddress)}
                  placeholder="Search validator…"
                  autoFocus
                />
              </div>
            ) : (
              // Split button: the two segments share a border, which is
              // the divider, and each has its own hover state.
              <div
                className="btn-group btn-group-sm hover-underline-links"
                role="group"
                aria-label="Validator"
              >
                <Link
                  to={overviewUrl}
                  className="btn btn-sm validator-pill-segment fw-semibold text-body text-truncate"
                  style={{ maxWidth: '14rem' }}
                  title="Open validator overview"
                >
                  {identity?.displayName ?? 'Validator'}
                </Link>
                <button
                  type="button"
                  onClick={() => setShowASearch(true)}
                  className="btn btn-sm validator-pill-segment text-body-tertiary px-2"
                  aria-label="Change validator"
                  title="Change validator"
                >
                  <FeatherIcon icon="chevron-down" size={14} />
                </button>
              </div>
            )}
            {/* Validator comparison (the "vs" label + B selector) is only
                supported on the epoch view: the per-bucket Detailed Vote
                Record table (EpochVoteBucketRecordTable) has no B column,
                so hide the compare controls when a bucket is selected. */}
            {bucket === undefined && (
              <>
                {/* "vs" label between the two validator selectors. */}
                {(bIdentity || showBSearch || !showASearch) && (
                  <span className="text-body-tertiary fs-10 text-uppercase fw-semibold">
                    vs
                  </span>
                )}
                {/* Validator B selector. */}
                {bIdentity ? (
                  <div
                    className="btn-group btn-group-sm hover-underline-links"
                    role="group"
                    aria-label="Comparison validator"
                  >
                    <Link
                      to={`/validator/${bIdentity.nodeAddress}`}
                      className="btn btn-sm validator-pill-segment fw-semibold text-body text-truncate"
                      style={{ maxWidth: '14rem' }}
                      title="Open validator overview"
                    >
                      {bIdentity.displayName}
                    </Link>
                    <button
                      type="button"
                      onClick={() => setBAddress(undefined)}
                      className="btn btn-sm validator-pill-segment text-body-tertiary px-2"
                      aria-label="Remove comparison validator"
                      title="Remove comparison"
                    >
                      <FeatherIcon icon="x" size={14} />
                    </button>
                  </div>
                ) : showBSearch ? (
                  <div style={{ width: '100%', maxWidth: '20rem' }}>
                    <ValidatorSearch
                      onSelect={v => {
                        setBAddress(v.voteAddress ?? v.nodeAddress);
                      }}
                      placeholder="Search validator to compare…"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowBSearch(true)}
                    className="btn btn-sm btn-soft-secondary"
                  >
                    + Compare to another validator
                  </button>
                )}
              </>
            )}
          </div>
          <div className="d-flex align-items-center gap-1">
            <Button
              variant="soft-secondary"
              className="btn-sm d-inline-flex align-items-center"
              disabled={resolvedEpoch === undefined || resolvedEpoch <= 0}
              onClick={() =>
                resolvedEpoch !== undefined && goToEpoch(resolvedEpoch - 1)
              }
              aria-label="Previous epoch"
              title="Previous epoch"
            >
              <FeatherIcon icon="chevron-left" size={14} />
            </Button>
            <Form.Select
              size="sm"
              style={{ width: 'auto' }}
              onChange={handleSelectChange}
              value={resolvedEpoch ?? ''}
            >
              {epochOptions.map((option, index) => (
                <option
                  key={index}
                  value={option.value ?? ''}
                  disabled={option.disabled}
                >
                  {option.label}
                </option>
              ))}
            </Form.Select>
            <Button
              variant="soft-secondary"
              className="btn-sm d-inline-flex align-items-center"
              disabled={
                resolvedEpoch === undefined ||
                currentEpoch === null ||
                resolvedEpoch >= currentEpoch
              }
              onClick={() =>
                resolvedEpoch !== undefined && goToEpoch(resolvedEpoch + 1)
              }
              aria-label="Next epoch"
              title="Next epoch"
            >
              <FeatherIcon icon="chevron-right" size={14} />
            </Button>
          </div>
        </div>
      )}
      <div className="mb-9">
        {!isLoadingEpoch && !isEmptyEpoch && hasMissingData && (
          <WarningBanner>
            Some block data for this epoch is missing. A fix is in progress.
          </WarningBanner>
        )}

        {bucket !== undefined ? (
          <>
            <Row className="align-items-stretch justify-content-between mb-3 g-3">
              <Col xs={12} sm={7} md={5}>
                {voteAddress && resolvedEpoch !== undefined && (
                  <BucketSearch
                    voteAddress={voteAddress}
                    epoch={resolvedEpoch}
                    epochStartSlot={epochStartSlot ?? 0}
                    bucketIndex={bucketIndex}
                    voterLatencies={voterData}
                    idealLatencies={clusterData}
                    interestingBuckets={
                      isInvestigateMode ? interestingBuckets : undefined
                    }
                  />
                )}
              </Col>
              <Col xs={12} sm={4}>
                <div className="d-flex align-items-center gap-2">
                  <Button
                    variant="soft-secondary"
                    className="btn-sm d-inline-flex align-items-center flex-shrink-0"
                    onClick={refreshBucketData}
                    disabled={context?.epochVoteRecordState.isLoading ?? false}
                    title="Refresh vote record"
                    aria-label="Refresh vote record"
                  >
                    <FeatherIcon icon="refresh-cw" size={14} />
                  </Button>
                  <Form.Select
                    size="sm"
                    onChange={handleSlotFilterChange}
                    value={slotFilter}
                  >
                    {slotFilterOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Form.Select>
                </div>
              </Col>
            </Row>

            <AdvanceTableProvider {...bucketTable}>
              <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1">
                {isEmptyEpoch ? (
                  <EmptyEpochState
                    epoch={resolvedEpoch}
                    subject="vote records"
                  />
                ) : bucketDataReady &&
                  slotFilter !== 'all' &&
                  (bucketedVoterData[bucketIndex]?.length ?? 0) > 0 &&
                  bucketTable.getCenterRows().length === 0 ? (
                  (() => {
                    const slotStart =
                      (epochStartSlot ?? 0) + bucketIndex * CHUNK_SIZE;
                    const slotEnd = slotStart + CHUNK_SIZE - 1;
                    const slotRange = `${slotStart.toLocaleString()}–${slotEnd.toLocaleString()}`;
                    return (
                      <div className="d-flex flex-column align-items-center text-center py-6 px-4">
                        <FeatherIcon
                          icon="check-circle"
                          size={32}
                          className="text-success mb-3"
                        />
                        <h5 className="text-body-emphasis mb-2">
                          {slotFilter === 'skipped-only'
                            ? 'No skipped slots'
                            : slotFilter === 'lag-only'
                              ? 'Every vote at optimal latency'
                              : 'Full credits on every slot'}
                        </h5>
                        <p className="text-body-tertiary mb-0 fs-9">
                          {slotFilter === 'skipped-only'
                            ? `Every votable slot in this bucket (slots ${slotRange}) landed a vote.`
                            : slotFilter === 'lag-only'
                              ? `No slots in this bucket (slots ${slotRange}) exceeded the ideal voter latency.`
                              : `No credit deductions in this bucket (slots ${slotRange}).`}
                        </p>
                      </div>
                    );
                  })()
                ) : (
                  <EpochVoteBucketRecordTable />
                )}
              </div>
            </AdvanceTableProvider>
          </>
        ) : (
          <>
            {/* Chart card — metric toggle + chart in a single bordered panel. */}
            <div className="bg-body-emphasis rounded border border-translucent p-3 mt-1 mb-4">
              <ButtonGroup size="sm" className="mb-3" aria-label="Chart metric">
                {(
                  [
                    { value: 'deductions', label: 'Vote credit deductions' },
                    { value: 'lag', label: 'Vote lag slots' }
                  ] as { value: EpochVotesChartMetric; label: string }[]
                ).map(opt => {
                  const active = chartMetric === opt.value;
                  return (
                    <ToggleButton
                      key={opt.value}
                      id={`chart-metric-${opt.value}`}
                      type="radio"
                      name="chart-metric"
                      value={opt.value}
                      checked={active}
                      onChange={() => setChartMetric(opt.value)}
                      variant=""
                      className={
                        active
                          ? 'btn fw-semibold border border-translucent'
                          : 'btn bg-transparent text-body-tertiary border border-translucent'
                      }
                      style={
                        active
                          ? {
                              backgroundColor:
                                'var(--vx-primary-text-emphasis)',
                              color: 'var(--vx-primary-bg-subtle)'
                            }
                          : undefined
                      }
                    >
                      {opt.label}
                    </ToggleButton>
                  );
                })}
              </ButtonGroup>
              {isLoadingEpoch ? (
                <ChartSkeleton />
              ) : isEmptyEpoch ? null : resolvedEpoch !== undefined &&
                voteAddress ? (
                <EpochVotesChart
                  epoch={resolvedEpoch}
                  voteAddress={voteAddress}
                  bVoteAddress={bVoteAddress}
                  aLabel={identity?.displayName}
                  bLabel={bIdentity?.displayName}
                  metric={chartMetric}
                  style={{ height: 270, width: '100%' }}
                />
              ) : null}
            </div>

            {isEmptyEpoch ? (
              <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1">
                <EmptyEpochState epoch={resolvedEpoch} subject="vote records" />
              </div>
            ) : (
              <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1">
                {isLoadingEpoch ? (
                  <EpochVoteRecordTableSkeleton />
                ) : (
                  <AdvanceTableProvider {...epochTable}>
                    <EpochVoteRecordTable />
                  </AdvanceTableProvider>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VoteHistory;
