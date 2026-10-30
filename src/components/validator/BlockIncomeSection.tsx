import UntrackedState from 'components/common/UntrackedState';
import useCluster, { BLOCK_INCOME_UNTRACKED } from 'hooks/useCluster';
import DelayedSpinner from 'components/common/DelayedSpinner';
import PageSection from 'components/common/PageSection';
import SectionCard from 'components/common/SectionCard';
import TopBlocksCard from 'components/validator/TopBlocksCard';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useRefreshOnce from 'hooks/useRefreshOnce';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { useContext, useEffect, useMemo } from 'react';
import {
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import EpochIncomeTable, {
  createEpochIncomeTableColumns
} from 'components/tables/EpochIncomeTable';
import BlockIncomeChart from 'components/charts/e-charts/BlockIncomeChart';

/**
 * A validator's block income (fees and tips per block, from the Tower
 * block-ingestor) for the Income tab: totals over the loaded epochs, the
 * per-epoch chart, then the epoch table.
 */
const BlockIncomeSection = ({ nodeAddress }: { nodeAddress: string }) => {
  const context = useContext(VortexDataContext);
  const { blockIncomeTracked } = useCluster();

  useEffect(() => {
    if (!context) return;
    context.epochIncomeState.fetchData(IDEAL_RECORD_KEY);
    context.epochIncomeState.fetchData(nodeAddress);
  }, [context, nodeAddress]);

  const clusterData = context?.epochIncomeState.data.get(IDEAL_RECORD_KEY);
  const validatorEpochIncome = context?.epochIncomeState.data.get(nodeAddress);
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  // Income history always includes the current-epoch row, which mutates
  // server-side. Force-refresh once per (validator, epoch) page entry.
  useRefreshOnce(
    currentEpoch !== null ? `${nodeAddress}:${currentEpoch}` : undefined,
    () => {
      if (!context) return;
      context.epochIncomeState.fetchData(IDEAL_RECORD_KEY, { force: true });
      context.epochIncomeState.fetchData(nodeAddress, { force: true });
    }
  );

  // Capture (vortex-data c331b78), once served.
  const hasCapture = !!validatorEpochIncome?.some(r => r.captureTotal != null);
  const computedTableColumns = useMemo(() => {
    return createEpochIncomeTableColumns(clusterData ?? [], hasCapture);
  }, [clusterData, hasCapture]);

  const tableData = useMemo(() => {
    return validatorEpochIncome ?? [];
  }, [validatorEpochIncome]);

  // Its latest epoch (Biggest Blocks reads that one).
  const latest = useMemo(
    () =>
      validatorEpochIncome?.length
        ? [...validatorEpochIncome].sort((a, b) => b.epoch - a.epoch)[0]
        : null,
    [validatorEpochIncome]
  );

  const epochTable = useAdvanceTable({
    data: tableData,
    columns: computedTableColumns,
    pageSize: 10,
    pagination: true,
    sortable: true,
    selection: false,
    // Navigating to another validator keeps this page mounted, so key the
    // page index to the address.
    resetPageKey: nodeAddress,
    initialState: {
      sorting: [{ desc: true, id: 'epoch' }]
    }
  });

  // Gate on both validator and cluster data so cluster-derived columns don't
  // pop in after the spinner disappears.
  const isLoadingValidator =
    validatorEpochIncome === undefined || clusterData === undefined;

  if (!context) return <div>Loading...</div>;

  let { epochIncomeState } = context;

  // Not the raw error (a passing network failure reads "Failed to
  // fetch"); the API banner covers outages and the read retries.
  if (epochIncomeState.error)
    return (
      <p className="fs-9 text-body-tertiary mb-0">
        Fees couldn&apos;t be loaded just now.
      </p>
    );

  if (!blockIncomeTracked)
    return (
      <PageSection>
        <UntrackedState>{BLOCK_INCOME_UNTRACKED}</UntrackedState>
      </PageSection>
    );

  return (
    <PageSection>
      {isLoadingValidator ? (
        <DelayedSpinner loading={isLoadingValidator} label="Loading fees…" />
      ) : (
        <div className="d-flex flex-column gap-3">
          <SectionCard
            title="Fees History"
            icon="list"
            info="Its fees (and tips) per epoch, newest first. Capture: its typical block against the blocks other leaders made around it (1.00× earns like them). Missed: what its skipped slots would have earned."
          >
            <AdvanceTableProvider {...epochTable}>
              <div className="mx-n3 mb-n3">
                <EpochIncomeTable />
              </div>
            </AdvanceTableProvider>
          </SectionCard>
          {hasCapture && latest && (
            <TopBlocksCard
              nodeAddress={nodeAddress}
              epoch={latest.epoch}
              current={latest.epoch === currentEpoch}
            />
          )}
          <SectionCard
            title="Over Time"
            icon="trending-up"
            info="Per epoch: its capture against the blocks around its own (1.00×), or its median fees / tips per block against the cluster's."
          >
            <BlockIncomeChart nodeAddress={nodeAddress} />
          </SectionCard>
        </div>
      )}
    </PageSection>
  );
};

export default BlockIncomeSection;
