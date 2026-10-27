import FeatherIcon from 'feather-icons-react';
import SectionCard from 'components/common/SectionCard';
import { featureName } from 'components/features/features';
import { proposalName } from 'components/governance/governance';
import { formatDuration } from 'helpers/utils';
import useCluster from 'hooks/useCluster';
import { useClusterHalt, useEpochLive } from 'hooks/useIngestion';
import {
  GOVERNANCE_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { ReactNode, useContext, useEffect } from 'react';
import { Link } from 'react-router';

const Item = ({ icon, children }: { icon: string; children: ReactNode }) => (
  <li className="d-flex gap-2 align-items-start">
    <FeatherIcon
      icon={icon}
      size={14}
      className="text-primary flex-shrink-0 mt-1"
    />
    <span>{children}</span>
  </li>
);

/**
 * What's coming on the cluster: the next epoch boundary, the next feature
 * gate to activate, and any governance vote open now (mainnet; shown only while one is).
 */
const WhatsNext = () => {
  const context = useContext(VortexDataContext);
  const live = useEpochLive();
  const halt = useClusterHalt();
  const { isTestnet } = useCluster();
  const fetchUpcoming = context?.featuresUpcomingState.fetchData;
  const fetchGov = context?.governanceProposalsState.fetchData;
  useEffect(() => {
    fetchUpcoming?.('');
    if (!isTestnet) fetchGov?.(GOVERNANCE_KEY);
  }, [fetchUpcoming, fetchGov, isTestnet]);
  const upcoming = context?.featuresUpcomingState.data.get('');
  const next = upcoming?.features[0];
  const served = upcoming?.cluster ?? 'mainnet-beta';
  const open = isTestnet
    ? []
    : (
        context?.governanceProposalsState.data.get(GOVERNANCE_KEY)?.proposals ??
        []
      ).filter(p => p.phase === 'voting' || p.phase === 'support');
  const end = live.progress?.estimatedEndTime;
  const epoch = live.epoch;
  return (
    <SectionCard title="What's Next" icon="calendar">
      <ul className="list-unstyled d-flex flex-column gap-3 fs-9 mb-0">
        {epoch != null && (
          <Item icon="clock">
            {halt ? (
              <>Epoch {(epoch + 1).toLocaleString()} waits on the restart.</>
            ) : end != null ? (
              <>
                Epoch{' '}
                <span className="fw-semibold">
                  {(epoch + 1).toLocaleString()}
                </span>{' '}
                starts in ~
                {formatDuration(Math.max(0, end - Date.now() / 1000))}
              </>
            ) : (
              <>Epoch {(epoch + 1).toLocaleString()} is next.</>
            )}
          </Item>
        )}
        <Item icon="toggle-right">
          {next ? (
            next.clusters[served]?.status === 'queued' ? (
              <>
                <span className="text-body-tertiary">Feature gate</span>{' '}
                <Link to={`/feature/${next.id}`} className="fw-semibold">
                  {featureName(next)}
                </Link>{' '}
                <span className="text-body-tertiary">
                  activates at the next epoch boundary
                </span>
              </>
            ) : (
              <>
                <span className="text-body-tertiary">
                  Next feature gate to activate:
                </span>{' '}
                <Link to={`/feature/${next.id}`} className="fw-semibold">
                  {featureName(next)}
                </Link>
              </>
            )
          ) : (
            <span className="text-body-tertiary">
              No feature gate scheduled.
            </span>
          )}
        </Item>
        {open.length > 0 && (
          <Item icon="check-square">
            {open.map((p, i) => (
              <span key={p.address}>
                {i > 0 && ', '}
                <Link to={`/governance/${p.address}`} className="fw-semibold">
                  {proposalName(p)}
                </Link>
              </span>
            ))}
            <span className="text-body-tertiary"> - voting now</span>
          </Item>
        )}
      </ul>
    </SectionCard>
  );
};

export default WhatsNext;
