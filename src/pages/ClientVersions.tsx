import ClientVersionsCard from 'components/common/ClientVersionsCard';

/**
 * How far each client's validators have upgraded (ClientVersionsCard).
 */
const ClientVersions = () => (
  <div className="mb-9">
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col-auto">
        <h1 className="h3">Client Versions</h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          How far each client's validators have upgraded
        </p>
      </div>
    </div>
    <ClientVersionsCard />
  </div>
);

export default ClientVersions;
