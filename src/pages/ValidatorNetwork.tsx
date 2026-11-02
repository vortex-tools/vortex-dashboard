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
  DivergentVote,
  isSkipped,
  TURBINE_FANOUT,
  turbineEstimate,
  divergenceByLeader,
  clusterExtra,
  extraDelay,
  hostMoves,
  routeKey,
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

/** The map's views: handoffs, its divergent votes in two kinds, hosts. */
type PageView = 'handoffs' | 'divergent' | 'hosts';
/** What the votes table sorts by. */
type VoteSort = 'slot' | 'producer' | 'reward' | 'vote';

/** Where the map's last-picked view is kept (this browser). */
const MAP_VIEW_KEY = 'vx-network-map-view';

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
  // The votes table's order (slot newest first by default).
  const [voteSort, setVoteSort] = useState<{ key: VoteSort; desc: boolean }>({
    key: 'slot',
    desc: true
  });
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
      // The cluster on the same route (r to its region) where the API
      // has routes.
      clusterExcessP50Ms: clusterExtra(
        producerBoard?.cluster?.slotDuration,
        r,
        producer?.slotDuration?.region,
        slotMs
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

  // The map view last picked, kept across validators and visits.
  const [mode, setModeState] = useState<PageView>(() => {
    try {
      const v = localStorage.getItem(MAP_VIEW_KEY);
      return v === 'hosts'
        ? 'hosts'
        : v === 'divergent' || v === 'skipped' || v === 'missed'
          ? 'divergent'
          : 'handoffs';
    } catch {
      return 'handoffs';
    }
  });
  const setMode = (m: PageView) => {
    setModeState(m);
    try {
      localStorage.setItem(MAP_VIEW_KEY, m);
    } catch {
      // storage blocked: this page keeps it
    }
  };
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
  // The move hovered: a row (it and its arrow), or an arrow (it and every
  // row going that way).
  const [hoverMove, setHoverMove] = useState<{
    row?: number;
    route: string;
  } | null>(null);
  // The views it has data for.
  const views = (
    [
      ['handoffs', 'Leader handoffs', handoffs.length > 0],
      ['divergent', 'Divergent votes', true],
      ['hosts', 'Hosts', moves.length > 0]
    ] as Array<[PageView, string, boolean]>
  ).filter(([, , has]) => has);
  const view: PageView = views.some(([k]) => k === mode) ? mode : views[0][0];
  const mapMode: MapMode = view;
  const isVotes = mapMode === 'divergent';
  // The tab's votes (skipped blocks or missed votes), in the table's
  // order, a page at a time on the map. A leader's floor (to this
  // validator) sorts its column.
  const me0 = node ? coord(geo?.get(node)) : null;
  const floorTo = useCallback(
    (n: string | null) => {
      const c = n ? coord(geo?.get(n)) : null;
      return c && me0 ? fibreMs(distanceKm(c, me0)) : null;
    },
    [geo, me0]
  );
  // A rough Turbine path into it (its layer by stake rank), for the
  // block legs.
  const turbine = useMemo(
    () => (node && geo ? turbineEstimate(node, geo) : null),
    [node, geo]
  );
  const tabVotes = useMemo(() => {
    const list = votes;
    const key = (v: DivergentVote): number | string =>
      voteSort.key === 'slot'
        ? v.slot
        : voteSort.key === 'producer'
          ? (floorTo(v.leader) ?? -1)
          : voteSort.key === 'reward'
            ? (floorTo(v.payer) ?? -1)
            : DIVERGENCE[v.kind].label;
    return [...list].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const c = x < y ? -1 : x > y ? 1 : b.slot - a.slot;
      return voteSort.desc ? -c : c;
    });
  }, [votes, view, voteSort, floorTo]);
  useEffect(() => setVotePage(0), [epoch, address, view, voteSort]);
  const votePages = Math.max(1, Math.ceil(tabVotes.length / VOTES_PAGE));
  const pageVotes = tabVotes.slice(
    votePage * VOTES_PAGE,
    (votePage + 1) * VOTES_PAGE
  );
  const sortBy = (key: VoteSort) =>
    setVoteSort(s =>
      s.key === key ? { key, desc: !s.desc } : { key, desc: key === 'slot' }
    );
  const sortMark = (key: VoteSort) =>
    voteSort.key === key ? (voteSort.desc ? ' ↓' : ' ↑') : '';

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
              info="Drag to pan; Ctrl (⌘) + scroll, a pinch or the buttons zoom. Handoffs: each region its previous leaders were in, with a line to it - hover one for its figures (its handoff count among them), colored by its extra delay - the median handoff less one slot (~200 ms: the next leader building its block) and the network floor (the fibre-speed distance) - against the cluster's from that region: green within 10 ms, amber up to 40 ms more, red beyond. Divergent votes: its votes that disagreed with the chain - a skip on a block that made it (or notarize on one that didn't), or no vote counted - ten at a time in the table's order - every block producer (blue) and reward leader (amber: slot + 8's leader, whose block carries the reward certificate) as a dot; hover a row for its route - a dotted arrow from the producer to it (the block's trip, through Turbine: relayed, so the floor is a minimum) and from it to the reward leader (its vote's trip). The table gives each one's place and network floor (red: too late for a block that made the chain; amber: another miss; blue: notarized a skipped block). Offline runs are left out. Hosts: every place it ran from, an arrow per failover (amber) or move (accent colour) between them; moves within a place are listed only."
              aside={
                views.length > 1 ? (
                  <ButtonGroup
                    size="sm"
                    // Full-size buttons, set into the header's padding
                    // (12 px above the ~16 px title row, 8 below): centered,
                    // and the header no taller than Where It Runs'.
                    style={{ margin: '-8.5px 0 -4.5px' }}
                  >
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
                mode={mapMode}
                handoffs={handoffs}
                votes={pageVotes}
                highlight={highlight}
                onHighlight={setHighlight}
                moves={shownMoves}
                turbine={turbine}
                highlightMove={hoverMove?.route ?? null}
                onHighlightMove={route =>
                  setHoverMove(route ? { route } : null)
                }
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
                        onMouseEnter={() =>
                          setHoverMove({ row: i, route: routeKey(m) })
                        }
                        onMouseLeave={() => setHoverMove(null)}
                        className={m.epoch === epoch ? 'fw-semibold' : ''}
                        style={
                          // A row hovered: the others fade; an arrow: every
                          // row of other directions does.
                          hoverMove &&
                          !(hoverMove.row != null
                            ? hoverMove.row === i
                            : hoverMove.route === routeKey(m))
                            ? { opacity: 0.35 }
                            : undefined
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
              {isVotes &&
                (tabVotes.length === 0 ? (
                  <p className="fs-9 text-body-tertiary mt-2 mb-0">
                    {!timeline
                      ? 'Loading its votes…'
                      : 'No divergent votes this epoch: every vote agreed with the chain (offline runs aside).'}
                  </p>
                ) : (
                  <>
                    <Table
                      size="sm"
                      className="data-table compact-rows fs-9 mt-2 mb-0"
                    >
                      <thead>
                        <tr>
                          {(
                            [
                              [
                                'slot',
                                voteSort.key !== 'slot'
                                  ? 'Slot'
                                  : voteSort.desc
                                    ? 'Slot (newest)'
                                    : 'Slot (oldest)',
                                undefined,
                                ''
                              ],
                              [
                                'producer',
                                'Block producer',
                                "The slot's leader, whose block it voted on. Its block reaches this validator through Turbine (shreds relayed on the way), so the floor is a minimum. Sorts by it",
                                ''
                              ],
                              [
                                'reward',
                                'Reward leader',
                                "Slot + 8's leader, whose block carries the slot's reward certificate - where its vote had to arrive; sorts by its network floor",
                                ''
                              ],
                              [
                                'vote',
                                'Its vote',
                                undefined,
                                'd-none d-sm-table-cell'
                              ]
                            ] as Array<
                              [VoteSort, string, string | undefined, string]
                            >
                          ).map(([key, label, title, cls]) => (
                            <th
                              key={key}
                              role="button"
                              className={`text-nowrap ${cls}`}
                              title={title}
                              onClick={() => sortBy(key)}
                            >
                              {label}
                              {key === 'slot' ? '' : sortMark(key)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageVotes.map(v => {
                          const to = coord(me);
                          const k = DIVERGENCE[v.kind];
                          // A leader's name, then where it was and the
                          // network floor between it and this validator.
                          const who = (
                            n: string | null,
                            role: 'info' | 'warning'
                          ) => {
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
                                  {/* Its color on the map. */}
                                  <span
                                    className={`d-inline-block rounded-circle align-middle me-1 bg-${role}`}
                                    style={{ width: 7, height: 7 }}
                                  />
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
                              style={
                                highlight != null && highlight !== v.slot
                                  ? { opacity: 0.35 }
                                  : undefined
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
                              <td>{who(v.leader, 'info')}</td>
                              <td>{who(v.payer, 'warning')}</td>
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
                    <div className="d-flex flex-wrap gap-3 fs-10 text-body-tertiary mt-2">
                      <span>
                        <span
                          className="d-inline-block rounded-circle align-middle me-1 bg-info"
                          style={{ width: 8, height: 8 }}
                        />
                        Block producer: whose block it voted on - dotted, its
                        block reaches it through Turbine (relayed shreds), so
                        the floor shown is a minimum
                      </span>
                      <span>
                        <span
                          className="d-inline-block rounded-circle align-middle me-1 bg-warning"
                          style={{ width: 8, height: 8 }}
                        />
                        Reward leader: slot + 8, where its vote had to arrive -
                        solid, a vote is sent straight to it
                      </span>
                      <span>Hover a row for its route.</span>
                      {turbine && (
                        <span className="w-100">
                          Estimated Turbine path: the leader sends each shred to
                          one root, drawn by stake, so it changes shred to shred
                          (the three heaviest data centers are drawn). This
                          validator is #{turbine.rank.toLocaleString()} by
                          stake, so{' '}
                          {turbine.layer === 1
                            ? `in layer 1 (the top ${TURBINE_FANOUT}): a shred reaches it from the root, 2 hops from the leader.`
                            : `in layer 2 (below the top ${TURBINE_FANOUT}): a shred reaches it through a layer-1 node, 3 hops from the leader.`}{' '}
                          Not stake-weighted beyond that; hop counts ignore
                          geography and latency.
                        </span>
                      )}
                    </div>
                    {votePages > 1 && (
                      <Pager
                        page={votePage}
                        pages={votePages}
                        total={tabVotes.length}
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
              <SectionCard title="Leader Handoffs" icon="shuffle">
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
              info="Its votes that disagreed with the chain, by where that slot's leader was, of the slots it voted on (runs of 32+ consecutive misses, when it wasn't voting at all, left out). Skipped blocks: it voted skip on a block that made the chain (or notarized one that didn't) - most often a block that reached it late. Missed votes: no vote of its was counted - not cast, or too late for the reward certificate."
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
                        <th
                          className="text-end"
                          title="It voted skip on a block that made the chain (or notarize on one that didn't)"
                        >
                          Skipped blocks
                        </th>
                        <th
                          className="text-end"
                          title="No vote of its was counted (offline runs left out)"
                        >
                          Missed votes
                        </th>
                        <th
                          className="text-end"
                          title="Both, of the slots it voted on"
                        >
                          Rate
                        </th>
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
                              {d.skipped.toLocaleString()}
                            </td>
                            <td className="text-end font-monospace">
                              {d.missed.toLocaleString()}
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
              title="Leader Handoffs Over Time"
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
