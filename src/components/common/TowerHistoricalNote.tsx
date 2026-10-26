import useConsensus from 'hooks/useConsensus';
import { Link } from 'react-router';
import UntrackedState from './UntrackedState';

/**
 * On an Alpenglow cluster, says the Tower vote views are historical and
 * where they end; nothing on a Tower cluster.
 */
const TowerHistoricalNote = ({
  className = 'mb-4'
}: {
  className?: string;
}) => {
  const { alpenglowActive, cutoverEpoch, lastTowerEpoch } = useConsensus();
  if (!alpenglowActive) return null;
  return (
    <UntrackedState className={className}>
      Tower voting is historical here: this cluster has run Alpenglow since
      epoch {cutoverEpoch}, so Tower vote stats end at epoch {lastTowerEpoch}.
      Current participation is on the{' '}
      <Link to="/leaderboards/consensus">Consensus leaderboard</Link>.
    </UntrackedState>
  );
};

export default TowerHistoricalNote;
