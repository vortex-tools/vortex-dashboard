import ClientVersionsCard from 'components/common/ClientVersionsCard';

/**
 * How the cluster is keeping up: for now, how far each client's validators
 * have upgraded (ClientVersionsCard).
 */
const ClusterHealth = () => (
  <div className="mb-9">
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col-auto">
        <h3>Cluster Health</h3>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          How the cluster is keeping up
        </p>
      </div>
    </div>
    <ClientVersionsCard />
  </div>
);

export default ClusterHealth;
