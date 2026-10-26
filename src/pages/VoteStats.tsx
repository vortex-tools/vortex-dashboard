import ChartSkeleton from 'components/common/ChartSkeleton';
import CompareValidatorsCta from 'components/common/CompareValidatorsCta';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useRefreshOnce from 'hooks/useRefreshOnce';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { useContext, useEffect, useMemo } from 'react';
import { Col, Row } from 'react-bootstrap';
import {
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { useParams } from 'react-router';
import EpochVoteStatsTable, {
  createEpochVoteStatsTableColumns,
  EpochVoteStatsTableSkeleton
} from 'components/tables/EpochVoteStatsTable';
import VoteStatsRankingChart from 'components/charts/e-charts/VoteStatsRankingChart';

const VoteStats = () => {
  const { address } = useParams();
  const context = useContext(VortexDataContext);
  const voteAddress = address || `11111111111111111111111111111111`;
  const identity = useValidatorIdentity(address);

  useEffect(() => {
    if (!context) return;
    context.epochVoteStatsState.fetchData(IDEAL_RECORD_KEY);
    context.epochVoteStatsState.fetchData(voteAddress);
  }, [context, voteAddress]);

  const clusterData = context?.epochVoteStatsState.data.get(IDEAL_RECORD_KEY);
  const validatorData = context?.epochVoteStatsState.data.get(voteAddress);
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  // Vote-stats history always includes the current-epoch row, which mutates
  // server-side. Force-refresh once per (validator, epoch) page entry.
  useRefreshOnce(
    currentEpoch !== null ? `${voteAddress}:${currentEpoch}` : undefined,
    () => {
      if (!context) return;
      context.epochVoteStatsState.fetchData(IDEAL_RECORD_KEY, { force: true });
      context.epochVoteStatsState.fetchData(voteAddress, { force: true });
    }
  );

  const computedTableColumns = useMemo(() => {
    return createEpochVoteStatsTableColumns(
      voteAddress,
      clusterData ?? [],
      currentEpoch
    );
  }, [voteAddress, clusterData, currentEpoch]);

  const tableData = useMemo(() => {
    return validatorData ?? [];
  }, [validatorData]);

  const epochVoteStatsTable = useAdvanceTable({
    data: tableData,
    columns: computedTableColumns,
    pageSize: 25,
    pagination: true,
    sortable: true,
    selection: false,
    // Navigating to another validator keeps this page mounted, so key the
    // page index to the address.
    resetPageKey: voteAddress,
    initialState: {
      sorting: [{ desc: true, id: 'epoch' }]
    }
  });

  // Gate on BOTH validator and cluster data so the cluster-derived columns
  // (Missed Credits, Missed Slots, Avg credits) don't pop in after the
  // spinner disappears.
  const isLoadingValidator =
    validatorData === undefined || clusterData === undefined;

  if (!context) return <div>Loading...</div>;

  let { epochVoteStatsState } = context;

  if (epochVoteStatsState.error)
    return <div>Error: {epochVoteStatsState.error}</div>;

  const breadcrumbItems: Crumb[] = [
    { label: 'Home', url: '/' },
    { label: 'Voting', url: '/leaderboards/voting' },
    {
      label: identity?.displayName ?? 'Validator',
      url: address ? `/validator/${address}` : '#!'
    },
    { label: 'Votes', active: true }
  ];

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-9">
        <Row className="page-header justify-content-between align-items-center g-3">
          <Col xs="auto">
            <h3>Vote Credits Ranking</h3>
            <p className="text-body-tertiary lh-sm mb-0 mt-1">
              Cluster ranking for vote credits earned per epoch
            </p>
          </Col>
        </Row>

        <CompareValidatorsCta prefillNodeAddress={identity?.nodeAddress} />

        {isLoadingValidator ? (
          <ChartSkeleton height={316} />
        ) : (
          <VoteStatsRankingChart voteAddress={voteAddress} />
        )}

        <Row className="justify-content-between align-items-center my-4 g-3">
          <Col xs="auto">
            <h3>Epoch Vote Stats History</h3>
            <p className="text-body-tertiary lh-sm mb-0 mt-1">
              Vote stats for each epoch
            </p>
          </Col>
        </Row>

        <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1">
          {isLoadingValidator ? (
            <EpochVoteStatsTableSkeleton />
          ) : (
            <AdvanceTableProvider {...epochVoteStatsTable}>
              <EpochVoteStatsTable />
            </AdvanceTableProvider>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoteStats;
