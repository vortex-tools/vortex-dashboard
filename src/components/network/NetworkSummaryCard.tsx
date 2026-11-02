import SectionCard from 'components/common/SectionCard';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import HostChangesCard from 'components/validator/HostChangesCard';
import { delayTone, extraDelay, signedMs } from 'helpers/network';
import useConsensus from 'hooks/useConsensus';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Table } from 'react-bootstrap';

const pct = (x: number) =>
  `${(x * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

/**
 * The Overview's way into the Network tab: where it runs (place, provider,
 * its provider's and data center's share of stake), its leader handoffs'
 * extra delay against the cluster's (the latest finished epoch, from
 * /validators/pace), then its host history (the Infrastructure card's).
 */
const NetworkSummaryCard = ({
  address,
  identity,
  voteKey,
  currentEpoch
}: {
  /** The URL's address, for the tab link. */
  address: string;
  identity: string;
  voteKey: string | null;
  currentEpoch: number | null;
}) => {
  const context = useContext(VortexDataContext);
  const { alpenglowActive } = useConsensus();
  const status = context?.validatorStatusState.data.get(identity);
  const fetchPace = context?.validatorPaceState.fetchData;
  useEffect(() => {
    if (alpenglowActive && voteKey) fetchPace?.(voteKey);
  }, [alpenglowActive, voteKey, fetchPace]);
  const pace = voteKey ? context?.validatorPaceState.data.get(voteKey) : null;
  // The latest finished epoch with handoffs.
  const latest = pace?.epochs.find(e => e.complete && e.slotDuration?.handoff);
  const slotMs = latest?.cluster?.inWindow?.p50Ms;
  const mine = latest
    ? extraDelay(
        latest.slotDuration?.handoffExcessP50Ms,
        slotMs,
        latest.slotDuration?.handoffExtraP50Ms
      )
    : null;
  const theirs = latest
    ? extraDelay(
        latest.cluster?.handoffExcessP50Ms,
        slotMs,
        latest.cluster?.handoffExtraP50Ms
      )
    : null;
  const geo = status?.geo;
  const c = status?.concentration;
  const tone = delayTone(mine, theirs);

  return (
    <SectionCard
      title="Network"
      icon="globe"
      info="Where it runs and how its leader handoffs compare with the cluster's - extra delay: the median handoff less one slot and the network floor between the two leaders (about 0 is as fast as physics allows) - then its host history. The Network tab has the map, handoffs by region and its divergent votes."
      linkTo={
        alpenglowActive ? recordPath(address, null, 'network') : undefined
      }
      linkLabel="Network tab"
    >
      {(geo || mine != null) && (
        <Table size="sm" className="data-table compact-rows fs-9 mb-3">
          <tbody>
            {geo && (
              <tr>
                <td className="text-body-tertiary">Provider</td>
                <td>
                  {geo.asnOrganization ?? '—'}
                  {c && (
                    <span className="text-body-tertiary">
                      {' '}
                      · {pct(c.asnStakeShare)} of stake
                    </span>
                  )}
                </td>
              </tr>
            )}
            {c && (
              <tr>
                <td className="text-body-tertiary">Same data center</td>
                <td>
                  {pct(c.dataCenterStakeShare)} of stake
                  <span className="text-body-tertiary">
                    {' '}
                    · {c.dataCenterValidators.toLocaleString()} validator
                    {c.dataCenterValidators === 1 ? '' : 's'}
                  </span>
                </td>
              </tr>
            )}
            {mine != null && latest && (
              <tr>
                <td className="text-body-tertiary">Leader handoffs</td>
                <td>
                  <span
                    className={`font-monospace${tone === 'danger' ? ' text-danger' : tone === 'warning' ? ' text-warning-emphasis' : ''}`}
                  >
                    {signedMs(mine)}
                  </span>{' '}
                  extra
                  <span className="text-body-tertiary">
                    {' '}
                    · cluster {signedMs(theirs)} · epoch {latest.epoch}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      )}
      <HostChangesCard identity={identity} currentEpoch={currentEpoch} bare />
    </SectionCard>
  );
};

export default NetworkSummaryCard;
