import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import HandoffCard from 'components/network/HandoffCard';
import HandoffTrend from 'components/network/HandoffTrend';
import NetworkMap, {
  MapMode,
  RegionHandoff
} from 'components/network/NetworkMap';
import ConsensusRecordHeader, {
  recordPath
} from 'components/validator/ConsensusRecordHeader';
import HostChangesCard from 'components/validator/HostChangesCard';
import {
  REGIONS,
  REGION_NAME,
  divergenceByLeader,
  divergenceByRegion,
  networkShares,
  regionOf
} from 'helpers/network';
import useConsensusRecord from 'hooks/useConsensusRecord';
import useRecordBoards from 'hooks/useRecordBoards';
import { geoAsOf, placeOf, useValidatorGeoAt } from 'hooks/useValidatorGeo';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Col, Row, Table, ToggleButton } from 'react-bootstrap';
import { useNavigate } from 'react-router';

const pct = (x: number | null | undefined, digits = 1) =>
  x == null
    ? '—'
    : `${(x * 100).toLocaleString('en-US', { maximumFractionDigits: digits })}%`;

/**
 * A validator's Network tab, per epoch: where it runs (place, provider,
 * its share of stake on that network and in that data center), a map of
 * its handoffs (by the previous leader's region, against the network
 * floor) or of its divergent votes (by leader), its handoff figures, its
 * divergent votes by the leaders' region, and its host history. From
 * block times, the leader schedule, its vote timeline and locations: no
 * vote timing.
 */
const ValidatorNetwork = () => {
  const {
    alpenglowActive,
    cutoverEpoch,
    known,
    unavailable,
    address,
    identity,
    voteAddress,
    epoch,
    currentEpoch,
    timeline,
    leaderOf
  } = useConsensusRecord();
  const { producerBoard, ranked } = useRecordBoards(
    alpenglowActive,
    epoch,
    voteAddress
  );
  const name = identity?.displayName ?? 'Validator';
  const node = identity?.nodeAddress ?? null;
  const producer =
    ranked?.producer ??
    producerBoard?.records.find(p => p.nodeAddress === node);
  // Where everyone was that epoch.
  const geoSet = useValidatorGeoAt(epoch);
  const geo = geoSet?.byNode ?? null;
  const me = node ? geo?.get(node) : undefined;
  const shares = useMemo(
    () => (node && geo ? networkShares(node, geo) : null),
    [node, geo]
  );

  // Its divergent votes, by leader and by the leaders' region.
  const byLeader = useMemo(
    () =>
      timeline && leaderOf
        ? divergenceByLeader(
            timeline.codes,
            timeline.firstSlot,
            timeline.divergent,
            leaderOf
          )
        : null,
    [timeline, leaderOf]
  );
  const byRegion = useMemo(
    () => (byLeader && geo ? divergenceByRegion(byLeader, geo) : null),
    [byLeader, geo]
  );
  const nameOf = useCallback(
    (n: string) => geo?.get(n)?.name ?? `${n.slice(0, 4)}…${n.slice(-4)}`,
    [geo]
  );

  // Its handoffs by region, with the cluster's from the same region.
  const handoffs: RegionHandoff[] = useMemo(() => {
    const mine = producer?.slotDuration?.handoffByRegion;
    const cluster = producerBoard?.cluster?.slotDuration?.handoffByRegion;
    if (!mine) return [];
    return REGIONS.filter(r => (mine[r]?.count ?? 0) > 0).map(r => ({
      region: r,
      count: mine[r]!.count,
      p50Ms: mine[r]!.p50Ms,
      expectedP50Ms: mine[r]!.expectedP50Ms,
      excessP50Ms: mine[r]!.excessP50Ms,
      clusterExcessP50Ms: cluster?.[r]?.excessP50Ms ?? null
    }));
  }, [producer, producerBoard]);

  // Its handoffs over the floor per epoch (one request, ~30 epochs).
  const context = useContext(VortexDataContext);
  const fetchPace = context?.validatorPaceState.fetchData;
  const paceKey = alpenglowActive ? voteAddress : '';
  useEffect(() => {
    if (paceKey) fetchPace?.(paceKey);
  }, [paceKey, fetchPace]);
  const paceHistory = paceKey
    ? context?.validatorPaceState.data.get(paceKey)
    : undefined;
  const navigate = useNavigate();

  const [mode, setMode] = useState<MapMode>('handoffs');
  const view: MapMode = handoffs.length ? mode : 'divergent';

  const body = () => {
    if (unavailable)
      return <UntrackedState>The API is unavailable right now.</UntrackedState>;
    if (known && !alpenglowActive)
      return (
        <UntrackedState>
          Alpenglow isn&apos;t active on this cluster yet.
        </UntrackedState>
      );
    if (epoch == null || !node || !geo)
      return <DelayedSpinner loading label="Loading the network…" />;
    const divergentTotal = byRegion
      ? [...byRegion.values()].reduce((a, r) => a + r.divergent, 0)
      : 0;
    const votedTotal = byRegion
      ? [...byRegion.values()].reduce((a, r) => a + r.slots, 0)
      : 0;
    return (
      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={12} lg={4}>
            <SectionCard
              title="Where It Runs"
              icon="map-pin"
              info={`Its location and network provider (ASN) ${geoAsOf(geoSet, epoch)}, from IP geolocation (DB-IP), and how much of the stake with a known location runs on the same network, and in the same data center (that network in its city).`}
            >
              {me?.geo ? (
                <Table size="sm" className="data-table compact-rows fs-9 mb-0">
                  <tbody>
                    <tr>
                      <td className="text-body-tertiary">Location</td>
                      <td>
                        {placeOf(me) ?? '—'}
                        {me.geo.country && me.geo.city && (
                          <span className="text-body-tertiary">
                            {' '}
                            · {me.geo.country}
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="text-body-tertiary">Region</td>
                      <td>{REGION_NAME[regionOf(me)]}</td>
                    </tr>
                    <tr>
                      <td className="text-body-tertiary">Provider</td>
                      <td>
                        {me.geo.asnOrganization ?? '—'}
                        {me.geo.asn != null && (
                          <span className="text-body-tertiary">
                            {' '}
                            · AS{me.geo.asn}
                          </span>
                        )}
                      </td>
                    </tr>
                    {shares && (
                      <tr>
                        <td className="text-body-tertiary">On its network</td>
                        <td>
                          {pct(shares.asnShare)} of stake
                          <span className="text-body-tertiary">
                            {' '}
                            · {shares.asnCount.toLocaleString()} validator
                            {shares.asnCount === 1 ? '' : 's'}
                          </span>
                        </td>
                      </tr>
                    )}
                    {shares?.dcShare != null && (
                      <tr>
                        <td className="text-body-tertiary">
                          In its data center
                        </td>
                        <td>
                          {pct(shares.dcShare)} of stake
                          <span className="text-body-tertiary">
                            {' '}
                            · {shares.dcCount.toLocaleString()} validator
                            {shares.dcCount === 1 ? '' : 's'}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              ) : (
                <UntrackedState>No location on record.</UntrackedState>
              )}
            </SectionCard>
          </Col>
          <Col xs={12} lg={8}>
            <SectionCard
              title="Map"
              icon="globe"
              info="Handoffs: a line from each region its previous leaders were in, as thick as how many handoffs, green when its time over the network floor is about the cluster's from the same region (within 5%), amber and red when slower. Divergent votes: the leaders whose slots it voted against the chain on, sized by how many, red where it's 5% or more of their slots."
              aside={
                handoffs.length ? (
                  <ButtonGroup size="sm">
                    {(
                      [
                        ['handoffs', 'Handoffs'],
                        ['divergent', 'Divergent votes']
                      ] as Array<[MapMode, string]>
                    ).map(([k, label]) => (
                      <ToggleButton
                        key={k}
                        id={`network-map-${k}`}
                        type="radio"
                        name="network-map"
                        variant="soft-secondary"
                        value={k}
                        checked={view === k}
                        onChange={() => setMode(k)}
                      >
                        {label}
                      </ToggleButton>
                    ))}
                  </ButtonGroup>
                ) : undefined
              }
            >
              <NetworkMap
                geo={geo}
                self={node}
                mode={view}
                handoffs={handoffs}
                leaders={byLeader}
                nameOf={nameOf}
              />
            </SectionCard>
          </Col>
        </Row>
        <Row className="g-3">
          <Col xs={12} lg={6}>
            {producer?.slotDuration?.handoff ? (
              <HandoffCard record={producer} board={producerBoard} />
            ) : (
              <SectionCard title="Handoffs" icon="shuffle">
                {producerBoard ? (
                  <UntrackedState>
                    No handoffs into its leader windows this epoch.
                  </UntrackedState>
                ) : (
                  <DelayedSpinner loading label="Loading handoffs…" />
                )}
              </SectionCard>
            )}
          </Col>
          <Col xs={12} lg={6}>
            <SectionCard
              title="Divergent Votes by Region"
              icon="git-branch"
              info="Its votes that disagreed with the chain, by where that slot's leader was: of the slots it voted on (runs of 32+ consecutive misses, when it wasn't voting at all, left out). Too late: a block that made the chain, which it voted skip on or never voted on - most often a block that reached it late."
            >
              {!byRegion ? (
                <DelayedSpinner loading label="Loading its votes…" />
              ) : (
                <>
                  <Table
                    responsive
                    size="sm"
                    className="data-table compact-rows fs-9 mb-0"
                  >
                    <thead>
                      <tr>
                        <th>Leader in</th>
                        <th className="text-end">Slots</th>
                        <th className="text-end">Divergent</th>
                        <th
                          className="text-end"
                          title="A block that made the chain, which it voted skip on or never voted on"
                        >
                          Too late
                        </th>
                        <th className="text-end">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {REGIONS.filter(r => byRegion.get(r)?.slots).map(r => {
                        const d = byRegion.get(r)!;
                        return (
                          <tr key={r}>
                            <td className="text-nowrap">
                              {REGION_NAME[r]}
                              <span className="text-body-tertiary fs-10">
                                {' '}
                                · {d.leaders.toLocaleString()} leaders
                              </span>
                            </td>
                            <td className="text-end font-monospace text-body-tertiary">
                              {d.slots.toLocaleString()}
                            </td>
                            <td className="text-end font-monospace">
                              {d.divergent.toLocaleString()}
                            </td>
                            <td className="text-end font-monospace">
                              {d.late.toLocaleString()}
                            </td>
                            <td
                              className={`text-end font-monospace${d.divergent / d.slots >= 0.05 ? ' text-danger' : ''}`}
                            >
                              {pct(d.divergent / d.slots, 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                  <p className="fs-10 text-body-tertiary mt-2 mb-0">
                    {divergentTotal.toLocaleString()} divergent of{' '}
                    {votedTotal.toLocaleString()} slots voted on (
                    {pct(votedTotal ? divergentTotal / votedTotal : 0, 2)}).
                    Leaders by where they were {geoAsOf(geoSet, epoch)}.
                  </p>
                </>
              )}
            </SectionCard>
          </Col>
        </Row>
        {paceHistory &&
          paceHistory.epochs.filter(
            e => e.slotDuration?.handoffExcessP50Ms != null
          ).length >= 2 && (
            <SectionCard
              title="Handoffs Over Time"
              icon="trending-up"
              info="Its median handoff over the network floor per epoch - in (from the previous leader), out (to the next leader, where recorded) - against the cluster's: a move or a provider change shows as a step. Click an epoch to open it."
            >
              <HandoffTrend
                pace={paceHistory}
                epoch={epoch}
                onPick={e => navigate(recordPath(address, e, 'network'))}
              />
            </SectionCard>
          )}
        <HostChangesCard identity={node} currentEpoch={currentEpoch} />
      </div>
    );
  };

  return (
    <div>
      <ConsensusRecordHeader
        address={address}
        name={name}
        nodeAddress={node}
        epoch={epoch}
        currentEpoch={currentEpoch}
        cutoverEpoch={cutoverEpoch}
        page="network"
      />
      <div className="mb-9">{body()}</div>
    </div>
  );
};

export default ValidatorNetwork;
