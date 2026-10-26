import PageBreadcrumb from 'components/common/PageBreadcrumb';
import useConsensus from 'hooks/useConsensus';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ReactNode, useContext } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import UntrackedState from './UntrackedState';

/**
 * Route gate for the Tower vote views on an Alpenglow cluster (see
 * useConsensus): an epoch at or after the cutover has no Tower vote stats
 * by design, so say so; with no epoch in the URL and `latestPath` given,
 * go to the last Tower epoch instead of the (Alpenglow) current one. On a
 * Tower cluster it renders its children untouched.
 */
const TowerGate = ({
  children,
  latestPath
}: {
  children: ReactNode;
  /** Builds the URL for an epoch, for the no-epoch redirect. */
  latestPath?: (epoch: number) => string;
}) => {
  const { alpenglowActive, cutoverEpoch, lastTowerEpoch } = useConsensus();
  const genesisSlot =
    useContext(VortexDataContext)?.currentEpochState.alpenglow?.genesisSlot;
  const { epoch } = useParams();
  if (!alpenglowActive || cutoverEpoch == null || lastTowerEpoch == null)
    return <>{children}</>;
  if (epoch === undefined)
    return latestPath ? (
      <Navigate replace to={latestPath(lastTowerEpoch)} />
    ) : (
      <>{children}</>
    );
  const e = Number.parseInt(epoch);
  if (Number.isNaN(e) || e < cutoverEpoch) return <>{children}</>;
  return (
    <div>
      <PageBreadcrumb
        items={[
          { label: 'Home', url: '/' },
          { label: `Epoch ${e}`, active: true }
        ]}
      />
      <div className="mb-9">
        <h3 className="mb-3">Tower voting · epoch {e}</h3>
        <UntrackedState>
          {e === cutoverEpoch ? (
            <>
              Epoch {e} switched to Alpenglow
              {genesisSlot != null &&
                ` at slot ${genesisSlot.toLocaleString()}`}
              . Its Tower part (the first few thousand slots) is too short to
              rank, so the epoch is shown as Alpenglow: see the{' '}
            </>
          ) : (
            <>
              Epoch {e} is an Alpenglow epoch: this cluster has run Alpenglow
              since epoch {cutoverEpoch}, so there are no Tower vote stats for
              it. See the{' '}
            </>
          )}
          <Link to={`/leaderboards/consensus/epoch/${e}`}>
            consensus leaderboard for epoch {e}
          </Link>{' '}
          or the{' '}
          <Link to={`/leaderboards/voting/epoch/${lastTowerEpoch}`}>
            last Tower epoch ({lastTowerEpoch})
          </Link>
          .
        </UntrackedState>
      </div>
    </div>
  );
};

export default TowerGate;
