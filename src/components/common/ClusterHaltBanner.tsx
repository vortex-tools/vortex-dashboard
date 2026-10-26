import FeatherIcon from 'feather-icons-react';
import { restartProgress } from 'components/live/RestartCard';
import { formatDuration } from 'helpers/utils';
import useCluster from 'hooks/useCluster';
import { Link } from 'react-router';
import { useClusterHalt } from 'hooks/useIngestion';

const CLUSTER_NAME: Record<string, string> = {
  'mainnet-beta': 'Mainnet',
  mainnet: 'Mainnet',
  testnet: 'Testnet',
  devnet: 'Devnet'
};

/**
 * Says so, above every page, when the cluster has halted (no new slots
 * while the API is answering - see useClusterHalt): since when, and at
 * which slot. Everything shown is as of then.
 */
const ClusterHaltBanner = () => {
  const halt = useClusterHalt();
  const { cluster } = useCluster();
  if (!halt) return null;
  const progress = halt.restart ? restartProgress(halt.restart) : null;
  const name = (cluster && CLUSTER_NAME[cluster]) ?? 'The cluster';
  return (
    <div
      role="status"
      aria-live="polite"
      className="api-status-bar cluster-halt-bar fs-9"
    >
      <FeatherIcon
        icon="alert-octagon"
        size={14}
        className="me-2 flex-shrink-0 text-danger"
      />
      <span>
        <span className="fw-semibold">
          {name} halted {formatDuration(Date.now() / 1000 - halt.since)} ago
        </span>{' '}
        at slot{' '}
        <Link to={`/slot/${halt.slot}`}>{halt.slot.toLocaleString()}</Link>
        {halt.finalizedSlot === halt.slot && ', the last finalized block'}. Data
        shown is from before the halt.
        {halt.restart &&
          (progress ? (
            <>
              {' '}
              Restart:{' '}
              <span className="fw-semibold">
                {(progress.share * 100).toFixed(1)}%
              </span>{' '}
              of stake on the new version
              {` (${(halt.restart.supermajority * 100).toFixed(0)}% needed).`}
            </>
          ) : (
            ' No restart visible yet (observer on the old version).'
          ))}
      </span>
    </div>
  );
};

export default ClusterHaltBanner;
