import SectionCard from 'components/common/SectionCard';
import { clientLabel } from 'helpers/clients';
import { ClusterHalt } from 'hooks/useIngestion';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const pct = (share: number) =>
  share > 0 && share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`;

/**
 * The restart's progress, when it can be seen: the share of stake on the
 * new shred version (the API's, else the largest version other than the
 * one the cluster halted on). null while our observer can't see restarted
 * nodes - it still runs the halted version - so nothing is claimed.
 */
export const restartProgress = (
  restart: NonNullable<ClusterHalt['restart']>
) => {
  if (restart.canSeeRestart !== true) return null;
  if (restart.newVersionStakePercent != null)
    return { share: restart.newVersionStakePercent / 100, version: null };
  const v = restart.shredVersions.find(
    x => x.shredVersion != null && x.shredVersion !== restart.haltedShredVersion
  );
  return v ? { share: v.share, version: v.shredVersion } : null;
};

/** "waitingForSupermajority" -> "waiting for supermajority". */
const startStage = (p: string) =>
  p.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/**
 * While the cluster is halted: stake by the shred version its validators
 * advertise in gossip (from the API, every minute). A restart shows as
 * stake moving onto a new version; the cluster resumes once one version
 * holds the supermajority (80%) of all activated stake.
 */
const RestartCard = ({
  halt,
  announcedShredVersion = null
}: {
  halt: ClusterHalt;
  /** The new shred version the restart announcement names, if any. */
  announcedShredVersion?: number | null;
}) => {
  const r = halt.restart;
  if (!r) return null;
  const need = r.supermajority;
  const progress = restartProgress(r);
  const o = r.observer;
  // The node-sourced view names versions, not clients.
  const hasClients = r.shredVersions.some(v =>
    v.software.some(sw => sw.client)
  );
  return (
    <SectionCard
      title="Cluster Restart"
      icon="refresh-cw"
      info="Validators restart a halted cluster on a new shred version, at an agreed slot. This is all activated stake by the shred version its node advertises in gossip, refreshed every minute; one version needs the supermajority of stake for the cluster to resume. Not in gossip: the node isn't advertising at all (down, or restarting)."
    >
      <p className="fs-9 mb-3">
        {progress ? (
          <>
            New version:{' '}
            <span className="fw-semibold">{pct(progress.share)}</span> of stake,{' '}
            {pct(need)} needed to resume.
          </>
        ) : (
          <span className="text-body-tertiary">
            No restart visible yet: our observer still runs the version the
            cluster halted on, so it can&apos;t see restarted nodes.
          </span>
        )}
      </p>
      {o?.waitForSupermajoritySlot != null && (
        <dl className="row fs-9 gy-1 mb-3">
          <dt className="col-sm-3 fw-normal text-body-tertiary">
            Restart slot
          </dt>
          <dd className="col-sm-9 mb-0">
            <Link
              to={`/slot/${o.waitForSupermajoritySlot}`}
              className="font-monospace"
            >
              {o.waitForSupermajoritySlot.toLocaleString()}
            </Link>
          </dd>
          {o.expectedShredVersion != null && (
            <>
              <dt className="col-sm-3 fw-normal text-body-tertiary">
                New shred version
              </dt>
              <dd className="col-sm-9 mb-0 font-monospace">
                {o.expectedShredVersion}
              </dd>
            </>
          )}
          {o.expectedBankHash && (
            <>
              <dt className="col-sm-3 fw-normal text-body-tertiary">
                Expected bank hash
              </dt>
              <dd className="col-sm-9 mb-0 font-monospace text-break">
                {o.expectedBankHash}
              </dd>
            </>
          )}
          {o.startProgress && (
            <>
              <dt className="col-sm-3 fw-normal text-body-tertiary">
                Our node
              </dt>
              <dd className="col-sm-9 mb-0">{startStage(o.startProgress)}</dd>
            </>
          )}
        </dl>
      )}
      <div className="d-flex flex-column gap-3">
        {r.shredVersions.map(v => (
          <div key={v.shredVersion ?? 'none'}>
            <div className="d-flex justify-content-between gap-2 fs-9 mb-1">
              <span className="fw-semibold">
                {v.shredVersion != null ? (
                  <>
                    Shred version{' '}
                    <span className="font-monospace">{v.shredVersion}</span>
                    {v.shredVersion === r.haltedShredVersion && (
                      <span className="text-body-tertiary fw-normal">
                        {' '}
                        · the halted version
                      </span>
                    )}
                    {v.shredVersion === announcedShredVersion &&
                      v.shredVersion !== r.haltedShredVersion && (
                        <span className="text-body-tertiary fw-normal">
                          {' '}
                          · the announced version
                        </span>
                      )}
                  </>
                ) : (
                  'Not in gossip'
                )}
              </span>
              <span className="text-body-tertiary text-nowrap">
                {v.validators.toLocaleString()} validators ·{' '}
                <span className="font-monospace fw-semibold text-body">
                  {pct(v.share)}
                </span>{' '}
                of stake
              </span>
            </div>
            <div
              className="position-relative rounded-1 overflow-hidden bg-body-highlight"
              style={{ height: 8 }}
            >
              <div
                className="h-100"
                style={{
                  width: `${Math.min(100, v.share * 100)}%`,
                  background:
                    v.shredVersion == null ||
                    v.shredVersion === r.haltedShredVersion
                      ? 'var(--vx-quaternary-color)'
                      : v.share >= need
                        ? 'var(--vx-success)'
                        : 'var(--vx-primary)'
                }}
              />
              <div
                className="position-absolute top-0 bottom-0"
                style={{
                  left: `${need * 100}%`,
                  width: 2,
                  background: 'var(--vx-emphasis-color)'
                }}
                title={`${pct(need)} needed to resume`}
              />
            </div>
          </div>
        ))}
      </div>
      {r.shredVersions.some(v => v.software.length) && (
        <Table
          size="sm"
          responsive
          className="data-table compact-rows fs-9 mt-4 mb-0 text-nowrap"
        >
          <thead>
            <tr>
              <th>Shred version</th>
              {hasClients && <th>Client</th>}
              <th>Version</th>
              <th className="text-end">Validators</th>
              <th className="text-end">Stake</th>
            </tr>
          </thead>
          <tbody>
            {r.shredVersions.flatMap(v =>
              v.software.slice(0, 6).map(sw => (
                <tr key={`${v.shredVersion}-${sw.client}-${sw.version}`}>
                  <td className="font-monospace">
                    {v.shredVersion ?? 'not in gossip'}
                  </td>
                  {hasClients && (
                    <td>{sw.client ? clientLabel(sw.client) : '—'}</td>
                  )}
                  <td className="font-monospace">{sw.version ?? '—'}</td>
                  <td className="text-end font-monospace">
                    {sw.validators.toLocaleString()}
                  </td>
                  <td className="text-end font-monospace">{pct(sw.share)}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <p className="fs-10 text-body-tertiary mt-3 mb-0">
        The cluster resumes once one shred version holds {pct(need)} of all
        activated stake. Last slot {halt.slot.toLocaleString()}
        {halt.finalizedSlot != null &&
          `, last finalized ${halt.finalizedSlot.toLocaleString()}`}
        .
      </p>
    </SectionCard>
  );
};

export default RestartCard;
