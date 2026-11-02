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
import Pager from 'components/common/Pager';
import {
  DIVERGENCE,
  REGIONS,
  REGION_NAME,
  divergentVotes,
  divergenceByLeader,
  extraDelay,
  hostMoves,
  divergenceByRegion,
  networkShares,
  regionOf
} from 'helpers/network';
import { coord, distanceKm, fibreMs } from 'helpers/worldMap';
import useConsensusRecord from 'hooks/useConsensusRecord';
import useRecordBoards from 'hooks/useRecordBoards';
import { geoAsOf, placeOf, useValidatorGeoAt } from 'hooks/useValidatorGeo';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Col, Row, Table, ToggleButton } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router';

/** Divergent votes on the map at a time. */
const VOTES_PAGE = 10;
/** Host moves listed under the Hosts map. */
const HOST_MOVES_SHOWN = 10;

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
  // Its divergent votes, newest first, a page at a time on the map.
  const votes = useMemo(
    () =>
      timeline && leaderOf
        ? divergentVotes(
            timeline.codes,
            timeline.firstSlot,
            timeline.divergent,
            leaderOf
          )
        : [],
    [timeline, leaderOf]
  );
  const [votePage, setVotePage] = useState(0);
  useEffect(() => setVotePage(0), [epoch, address]);
  const votePages = Math.max(1, Math.ceil(votes.length / VOTES_PAGE));
  const pageVotes = votes.slice(
    votePage * VOTES_PAGE,
    (votePage + 1) * VOTES_PAGE
  );
  const [highlight, setHighlight] = useState<number | null>(null);
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
    // A slot, that epoch: the cluster's pace within leader windows.
    const slotMs =
      producerBoard?.cluster?.slotDuration?.inWindow?.p50Ms ?? null;
    if (!mine) return [];
    return REGIONS.filter(r => (mine[r]?.count ?? 0) > 0).map(r => ({
      region: r,
      count: mine[r]!.count,
      p50Ms: mine[r]!.p50Ms,
      expectedP50Ms: mine[r]!.expectedP50Ms,
      // Extra delays: over the floor, less one slot.
      excessP50Ms: extraDelay(
        mine[r]!.excessP50Ms,
        slotMs,
        mine[r]!.extraP50Ms
      ),
      clusterExcessP50Ms: extraDelay(
        cluster?.[r]?.excessP50Ms,
        slotMs,
        cluster?.[r]?.extraP50Ms
      ),
      slotMs
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
  // Its host moves (failovers, migrations), for the Hosts view.
  const fetchHosts = context?.hostChangesState.fetchData;
  useEffect(() => {
    if (node) fetchHosts?.(node);
  }, [node, fetchHosts]);
  const hostData = node ? context?.hostChangesState.data.get(node) : undefined;
  const moves = useMemo(
    () => (hostData ? hostMoves(hostData) : []),
    [hostData]
  );
  // The map and the list show the same moves: the latest few, or all.
  const [allMoves, setAllMoves] = useState(false);
  const shownMoves = allMoves ? moves : moves.slice(0, HOST_MOVES_SHOWN);
  // The move hovered (a row or its arrow), highlighted on both.
  const [hoverMove, setHoverMove] = useState<number | null>(null);
  // The views it has data for.
  const views = (
    [
      ['handoffs', 'Handoffs', handoffs.length > 0],
      ['divergent', 'Divergent votes', true],
      ['hosts', 'Hosts', moves.length > 0]
    ] as Array<[MapMode, string, boolean]>
  ).filter(([, , has]) => has);
  const view: MapMode = views.some(([k]) => k === mode) ? mode : views[0][0];

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
              info={`Its location and network provider (ASN) ${geoAsOf(geoSet, epoch)}, from IP geolocation (DB-IP), and how much of the stake with a known location runs on the same provider (ASN), and in the same data center (that provider in its city).`}
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
                        <td className="text-body-tertiary">
                          Same provider (ASN)
                        </td>
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
                        <td className="text-body-tertiary">Same data center</td>
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
              info="Drag to pan; Ctrl (⌘) + scroll, a pinch or the buttons zoom. Handoffs: each region its previous leaders were in, with a line to it - hover one for its figures (its handoff count among them), colored by its extra delay - the median handoff less one slot (~200 ms: the next leader building its block) and the network floor (the fibre-speed distance) - against the cluster's from that region: green within 10 ms, amber up to 40 ms more, red beyond. Divergent votes: its votes that disagreed with the chain, newest first, ten at a time - for each, a solid line from the slot's block producer to it (the block's trip) and a dashed one from it to the reward leader, slot + 8's leader, whose block carries the reward certificate (its vote's trip); the table gives each one's place and network floor (red: too late for a block that made the chain; amber: another miss; blue: notarized a skipped block). Offline runs are left out. Hosts: every place it ran from, an arrow per failover (amber) or move (accent colour) between them; moves within a place are listed only."
              aside={
                views.length > 1 ? (
                  <ButtonGroup size="sm">
                    {views.map(([k, label]) => (
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
                votes={pageVotes}
                highlight={highlight}
                onHighlight={setHighlight}
                moves={shownMoves}
                highlightMove={hoverMove}
                onHighlightMove={setHoverMove}
                nameOf={nameOf}
              />
              {view === 'hosts' && (
                <Table
                  size="sm"
                  className="data-table compact-rows fs-9 mt-2 mb-0"
                >
                  <thead>
                    <tr>
                      <th>Epoch</th>
                      <th>Change</th>
                      <th>From → to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownMoves.map((m, i) => (
                      <tr
                        key={i}
                        onMouseEnter={() => setHoverMove(i)}
                        onMouseLeave={() => setHoverMove(null)}
                        className={
                          hoverMove === i
                            ? 'bg-body-highlight'
                            : m.epoch === epoch
                              ? 'fw-semibold'
                              : ''
                        }
                      >
                        <td className="text-nowrap">
                          <Link to={recordPath(address, m.epoch, 'network')}>
                            {m.epoch}
                          </Link>
                        </td>
                        <td
                          className={`text-nowrap ${m.kind === 'failover' ? 'text-warning-emphasis' : ''}`}
                        >
                          {m.kind === 'failover' ? 'Failover' : 'Moved'}
                        </td>
                        <td>
                          {m.fromLabel}{' '}
                          <span className="text-body-tertiary">→</span>{' '}
                          {m.toLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {view === 'hosts' && (
                <div className="d-flex flex-wrap gap-3 fs-10 text-body-tertiary mt-2">
                  <span>
                    <span
                      className="d-inline-block align-middle me-1 bg-warning"
                      style={{ width: 14, height: 3 }}
                    />
                    Failover: to a spare running the same identity (and back)
                  </span>
                  <span>
                    <span
                      className="d-inline-block align-middle me-1 bg-primary"
                      style={{ width: 14, height: 3 }}
                    />
                    Moved: to a new host for good
                  </span>
                </div>
              )}
              {view === 'hosts' && moves.length > HOST_MOVES_SHOWN && (
                <div className="d-flex justify-content-between fs-10 text-body-tertiary mt-2">
                  <span>
                    {allMoves
                      ? `All ${moves.length.toLocaleString()} moves`
                      : `The latest ${HOST_MOVES_SHOWN} of ${moves.length.toLocaleString()} moves`}
                    , on the map and here
                  </span>
                  <button
                    type="button"
                    className="btn btn-link p-0 fs-10"
                    onClick={() => setAllMoves(a => !a)}
                  >
                    {allMoves ? 'Show fewer' : 'Show all'}
                  </button>
                </div>
              )}
              {view === 'divergent' &&
                (votes.length === 0 ? (
                  <p className="fs-9 text-body-tertiary mt-2 mb-0">
                    {timeline
                      ? 'No divergent votes this epoch: every vote agreed with the chain.'
                      : 'Loading its votes…'}
                  </p>
                ) : (
                  <>
                    <Table
                      size="sm"
                      className="data-table compact-rows fs-9 mt-2 mb-0"
                    >
                      <thead>
                        <tr>
                          <th>Slot</th>
                          <th title="The slot's leader, whose block it voted on (solid line)">
                            Block producer
                          </th>
                          <th title="Slot + 8's leader, whose block carries the slot's reward certificate - where its vote had to arrive (dashed line)">
                            Reward leader
                          </th>
                          <th className="d-none d-sm-table-cell">Its vote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageVotes.map(v => {
                          const to = coord(me);
                          const k = DIVERGENCE[v.kind];
                          // A leader's name, then where it was and the
                          // network floor between it and this validator.
                          const who = (n: string | null) => {
                            if (!n)
                              return (
                                <span className="text-body-tertiary">—</span>
                              );
                            const g = geo.get(n);
                            const c = coord(g);
                            const floor =
                              c && to ? fibreMs(distanceKm(c, to)) : null;
                            return (
                              <>
                                <div
                                  className="text-truncate"
                                  style={{ maxWidth: 'min(170px, 26vw)' }}
                                >
                                  {nameOf(n)}
                                </div>
                                <div
                                  className="fs-10 text-body-tertiary text-truncate"
                                  style={{ maxWidth: 'min(170px, 26vw)' }}
                                >
                                  {floor != null &&
                                    `${Math.round(floor)} ms · `}
                                  {placeOf(g) ?? 'unknown place'}
                                </div>
                              </>
                            );
                          };
                          return (
                            <tr
                              key={v.slot}
                              onMouseEnter={() => setHighlight(v.slot)}
                              onMouseLeave={() => setHighlight(null)}
                              className={
                                highlight === v.slot ? 'bg-body-highlight' : ''
                              }
                            >
                              <td>
                                <Link
                                  to={`/slot/${v.slot}`}
                                  className="font-monospace"
                                >
                                  {v.slot.toLocaleString()}
                                </Link>
                                <div
                                  className={`d-sm-none fs-10 text-nowrap text-${k.tone}`}
                                >
                                  {k.label}
                                </div>
                              </td>
                              <td>{who(v.leader)}</td>
                              <td>{who(v.payer)}</td>
                              <td
                                className={`d-none d-sm-table-cell text-${k.tone}`}
                              >
                                {k.label}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                    {votePages > 1 && (
                      <Pager
                        page={votePage}
                        pages={votePages}
                        total={votes.length}
                        pageSize={VOTES_PAGE}
                        shown={pageVotes.length}
                        onPrev={() => setVotePage(p => p - 1)}
                        onNext={() => setVotePage(p => p + 1)}
                        onPage={setVotePage}
                      />
                    )}
                  </>
                ))}
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
              info="Its handoffs' extra delay per epoch - the median less one slot and the network floor; about 0 is as fast as physics allows - from the previous leader, and to the next leader where recorded, against the cluster's: a move or a provider change shows as a step. Click an epoch to open it."
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
