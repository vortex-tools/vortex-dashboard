import SectionCard from 'components/common/SectionCard';
import { ClusterHalt } from 'hooks/useIngestion';
import { Table } from 'react-bootstrap';

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

/**
 * While the cluster is halted: stake by the shred version its validators
 * advertise in gossip (from the API, every minute). A restart shows as
 * stake moving onto a new version; the cluster resumes once one version
 * holds the supermajority (80%) of all activated stake.
 */
const RestartCard = ({ halt }: { halt: ClusterHalt }) => {
  const r = halt.restart;
  if (!r) return null;
  const need = r.supermajority;
  const progress = restartProgress(r);
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
            {v.software.length > 0 && (
              <Table
                size="sm"
                className="data-table compact-rows fs-10 mt-2 mb-0"
              >
                <tbody>
                  {v.software.slice(0, 6).map(sw => (
                    <tr key={`${sw.client}-${sw.version}`}>
                      <td>{sw.client ?? 'Unknown client'}</td>
                      <td className="font-monospace">{sw.version ?? '—'}</td>
                      <td className="text-end text-body-tertiary">
                        {sw.validators.toLocaleString()}
                      </td>
                      <td className="text-end font-monospace">
                        {pct(sw.share)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        ))}
      </div>
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
