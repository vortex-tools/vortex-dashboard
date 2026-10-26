import FeatherIcon from 'feather-icons-react';
import { formatDuration } from 'helpers/utils';
import useCluster from 'hooks/useCluster';
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
        <span className="fw-semibold">{name} has halted</span>: no new slots
        since slot{' '}
        <span className="font-monospace">{halt.slot.toLocaleString()}</span>,{' '}
        {formatDuration(Date.now() / 1000 - halt.since)} ago. What&apos;s shown
        is as of then; it picks up again when the cluster restarts.
      </span>
    </div>
  );
};

export default ClusterHaltBanner;
