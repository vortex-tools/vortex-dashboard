import ProducerWindowsTable from 'components/validator/ProducerWindowsTable';
import SlotNumber from 'components/common/SlotNumber';

import StatCard from 'components/common/StatCard';
import { IS_STAGING } from 'helpers/apiEndpoint';
import PageSkeleton, {
  SKELETON,
  TableSkeleton
} from 'components/common/PageSkeleton';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import HandoffCard, { HANDOFF_INFO } from 'components/network/HandoffCard';
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
  TURBINE_FANOUT,
  turbineEstimate,
  divergenceByLeader,
  clusterExtra,
  delayTone,
  entryOverhead,
  handoffExtra,
  signedMs,
  hasNotarization,
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
import {
  ButtonGroup,
  Col,
  Form,
  Row,
  Table,
  ToggleButton
} from 'react-bootstrap';
import { Link } from 'react-router';

/** The Hosts map's window: moves in its last this-many epochs (the
 *  current one in); the Infrastructure card below has them all. */
const HOST_EPOCHS = 10;

/** The map's views: handoffs, its divergent votes in two kinds, hosts. */
type PageView = 'handoffs' | 'divergent' | 'hosts';
/** What the votes table sorts by. */
type VoteSort = 'slot' | 'producer' | 'reward' | 'vote';

/** Where the map's last-picked view is kept (this browser). */
const MAP_VIEW_KEY = 'vx-network-map-view';
/** The card beside the map, per view. */
const SIDE: Record<
  'handoffs' | 'divergent' | 'hosts',
  { title: string; icon: string; info: string }
> = {
  handoffs: { title: 'Leader Handoffs', icon: 'shuffle', info: HANDOFF_INFO },
  divergent: {
    title: 'Divergent Votes',
    icon: 'git-branch',
    info: "Its skip votes on notarized blocks and its votes never counted, newest first, ten at a time (the map shows the page): each slot's block producer and reward leader (slot + 8) with their place and network floor. Hover or click a row for its route on the map. Offline runs are left out."
  },
  hosts: {
    title: 'Host Moves',
    icon: 'server',
    info: `Its failovers (to a spare running the same identity, and back) and moves to a new host in its last ${HOST_EPOCHS} epochs, newest first, as on the map; moves within a place are listed only. Its whole host history is in Infrastructure below.`
  }
};

/** Whether the divergent votes map draws Turbine's waypoints. */
const WAYPOINTS_KEY = 'vx-network-turbine-waypoints';

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
  const [hoverSlot, setHighlight] = useState<number | null>(null);
  // A vote clicked (on the map or its row) stays shown until another
  // click; a hover shows its own meanwhile.
  const [pinned, setPinned] = useState<number | null>(null);
  // Turbine's waypoints on the block's route, or one bundled arrow;
  // remembered per browser.
  const [waypoints, setWaypointsState] = useState(() => {
    try {
      return localStorage.getItem(WAYPOINTS_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const setWaypoints = (on: boolean) => {
    setWaypointsState(on);
    try {
      localStorage.setItem(WAYPOINTS_KEY, on ? 'on' : 'off');
    } catch {
      // storage blocked: this page keeps it
    }
  };
  const highlight = hoverSlot ?? pinned;
  const pick = (slot: number | null) =>
    setPinned(p => (slot == null || p === slot ? null : slot));
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
    // A slot, that epoch: the cluster's pace within leader windows.
    const slotMs =
      producerBoard?.cluster?.slotDuration?.inWindow?.p50Ms ?? null;
    if (!mine) return [];
    return REGIONS.filter(r => (mine[r]?.count ?? 0) > 0).map(r => {
      // Against the notarization floor where its region figures have it,
      // else the direct one - the cluster's on the same basis.
      const notarized = hasNotarization(mine[r]);
      const e = entryOverhead(mine[r], slotMs, notarized);
      return {
        region: r,
        count: mine[r]!.count,
        p50Ms: mine[r]!.p50Ms,
        expectedP50Ms: e.floorMs,
        notarized,
        excessP50Ms: e.extra,
        // The cluster on the same route (r to its region) where the API
        // has routes.
        clusterExcessP50Ms: clusterExtra(
          producerBoard?.cluster?.slotDuration,
          r,
          producer?.slotDuration?.region,
          slotMs,
          notarized
        ),
        slotMs
      };
    });
  }, [producer, producerBoard]);

  const context = useContext(VortexDataContext);

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
    () =>
      hostData
        ? hostMoves(hostData).filter(
            m => currentEpoch == null || m.epoch > currentEpoch - HOST_EPOCHS
          )
        : [],
    [hostData, currentEpoch]
  );
  // The map and the list show the same moves: the latest few, or all.
  const [allMoves, setAllMoves] = useState(false);
  const shownMoves = allMoves ? moves : moves.slice(0, HOST_MOVES_SHOWN);
  // The move hovered: a row (it and its arrow), or an arrow (it and every
  // row going that way).
  const [hoverMoveState, setHoverMove] = useState<{
    row?: number;
    route: string;
  } | null>(null);
  // A move clicked (a row or an arrow) stays shown, as a vote does.
  const [pinnedMove, setPinnedMove] = useState<{
    row?: number;
    route: string;
  } | null>(null);
  const hoverMove = hoverMoveState ?? pinnedMove;
  const sameMove = (
    a: { row?: number; route: string } | null,
    b: { row?: number; route: string }
  ) => !!a && a.route === b.route && a.row === b.row;
  const pickMove = (m: { row?: number; route: string } | null) =>
    setPinnedMove(p => (m == null || sameMove(p, m) ? null : m));
  // Another validator, epoch or view: nothing kept.
  useEffect(() => {
    setPinned(null);
    setPinnedMove(null);
  }, [node, epoch, mode, votePage]);
  // Every view, disabled when it has no data. A view counts until its
  // data says otherwise: while it loads, the picked view stays (dropping
  // to another and coming back looked like a snap back to Leader
  // handoffs).
  const views = [
    ['handoffs', 'Leader handoffs', !producerBoard || handoffs.length > 0],
    ['divergent', 'Divergent votes', !timeline || votes.length > 0],
    ['hosts', 'Hosts', !hostData || moves.length > 0]
  ] as Array<[PageView, string, boolean]>;
  const view: PageView = views.some(([k, , has]) => k === mode && has)
    ? mode
    : (views.find(([, , has]) => has)?.[0] ?? 'handoffs');
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
  // Staging only for now: production draws a block's trip straight.
  const turbine = useMemo(
    () => (IS_STAGING && node && geo ? turbineEstimate(node, geo) : null),
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
      return <PageSkeleton rows={SKELETON.network} />;
    const divergentTotal = byRegion
      ? [...byRegion.values()].reduce((a, r) => a + r.divergent, 0)
      : 0;
    const votedTotal = byRegion
      ? [...byRegion.values()].reduce((a, r) => a + r.slots, 0)
      : 0;
    // The headline figures: its own pace, its handoffs either way and its
    // divergent votes, each against the cluster's.
    const cl = producerBoard?.cluster?.slotDuration;
    const slotMs = cl?.inWindow?.p50Ms ?? null;
    const inO = handoffExtra(producer?.slotDuration, slotMs).extra;
    const outO = handoffExtra(producer?.slotDuration, slotMs, 'out').extra;
    const clO = handoffExtra(cl, slotMs).extra;
    const toneOf = (t: ReturnType<typeof delayTone>) =>
      t === 'danger' ? 'danger' : t === 'warning' ? 'warning' : undefined;
    const pace = producer?.slotDuration?.inWindow;
    // The cards' figures with the unit tight: "200ms", "+32ms".
    const tight = (v: string) => v.replace(/ ms$/, 'ms');
    return (
      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} lg={3}>
            <StatCard
              label="Slot Pace"
              value={pace?.p50Ms != null ? `${Math.round(pace.p50Ms)}ms` : '—'}
              tone={producer?.lagging ? 'warning' : undefined}
              sublabel={
                <span
                  title={`Its median time per slot within its leader windows (slots 2-4, each from its own previous block)${pace?.p90Ms != null ? `; 90th percentile ${Math.round(pace.p90Ms)} ms` : ''}. Lagging: 1.25x the cluster's or more.`}
                >
                  {producer?.lagging ? 'Lagging · ' : ''}
                  {slotMs != null ? `cluster ${Math.round(slotMs)}ms` : '—'}
                </span>
              }
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Handoff To Us"
              value={tight(signedMs(inO))}
              tone={toneOf(delayTone(inO, clO))}
              sublabel={
                <span title="Its median handoff from the previous leader, less its own first block and the notarization floor: the overhead beyond the wait for the previous block to be notarized. Against the cluster's median.">
                  overhead · cluster {tight(signedMs(clO))}
                </span>
              }
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Handoff From Us"
              value={tight(signedMs(outO))}
              tone={toneOf(delayTone(outO, clO))}
              sublabel={
                <span title="The next leaders' median handoff from it, the same way: how fast its blocks reach them and get notarized. Against the cluster's median.">
                  overhead · cluster {tight(signedMs(clO))}
                </span>
              }
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Divergent Votes"
              value={divergentTotal.toLocaleString()}
              sublabel={
                <span title="Slots where it voted skip on a block the cluster notarized, or its vote wasn't counted (offline runs aside), of the slots it voted on">
                  {pct(votedTotal ? divergentTotal / votedTotal : 0, 2)} of
                  slots voted on
                </span>
              }
            />
          </Col>
        </Row>
        <Row className="g-3">
          {/* Desktop: the map (its own card, staying in view) on one
              half, what it shows in a card on the other. */}
          <Col xs={12} lg={6}>
            <div className="vx-sticky-map">
              <SectionCard
                title="Map"
                icon="globe"
                info="Drag to pan; Ctrl (⌘) + scroll, a pinch or the buttons zoom. Handoffs: each region its previous leaders were in, with a line to it - hover one for its figures (its handoff count among them), colored by its overhead - the median handoff less its first block (~144 ms: Agave ends it 56 ms before its slot is up) and the direct network floor (the fibre-speed distance straight between them) - against the cluster's on the same route. Where its region figures have the notarization floor (the round the next leader waits for) they're against it, else the direct floor - then they run higher than the overall Overhead: green within 10 ms, amber up to 40 ms more, red beyond. Divergent votes: its skip votes on notarized blocks and its votes never counted - ten at a time in the table's order - every block producer (blue) and reward leader (amber: slot + 8's leader, whose block carries the reward certificate) as a dot; hover a row for its route - a dotted arrow from the producer to it (the block's trip, through Turbine: relayed, so the floor is a minimum) and from it to the reward leader (its vote's trip), each labeled with its floor (a block's also along its estimated Turbine path). The table gives each one's place and network floor (red: too late for a block that made the chain; amber: another miss). Offline runs are left out. Hosts: every place it ran from, an arrow per failover (amber) or move (accent colour) between them; moves within a place are listed only."
                aside={
                  <ButtonGroup
                    size="sm"
                    // Full-size buttons, set into the header's padding
                    // (12 px above the ~16 px title row, 8 below): centered,
                    // and the header no taller than Where It Runs'.
                    className="vx-header-control"
                  >
                    {views.map(([k, label, has]) => (
                      <ToggleButton
                        key={k}
                        id={`network-map-${k}`}
                        type="radio"
                        name="network-map"
                        variant="soft-secondary"
                        value={k}
                        checked={view === k}
                        disabled={!has}
                        onChange={() => setMode(k)}
                      >
                        {label}
                      </ToggleButton>
                    ))}
                  </ButtonGroup>
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
                  onPick={pick}
                  waypoints={waypoints}
                  onPickMove={route => pickMove(route ? { route } : null)}
                  nameOf={nameOf}
                />
              </SectionCard>
            </div>
          </Col>
          <Col xs={12} lg={6}>
            <SectionCard
              title={SIDE[view].title}
              icon={SIDE[view].icon}
              info={SIDE[view].info}
            >
              {view === 'handoffs' &&
                (producer?.slotDuration?.handoff ? (
                  <HandoffCard record={producer} board={producerBoard} bare />
                ) : producerBoard ? (
                  <UntrackedState>
                    No handoffs into its leader windows this epoch.
                  </UntrackedState>
                ) : (
                  <TableSkeleton inCard rows={7} />
                ))}
              {view === 'hosts' && (
                <Table
                  responsive
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
                        onClick={() => pickMove({ row: i, route: routeKey(m) })}
                        className={m.epoch === epoch ? 'fw-semibold' : ''}
                        style={{
                          cursor: 'pointer',
                          // A row hovered: the others fade; an arrow: every
                          // row of other directions does.
                          ...(hoverMove &&
                          !(hoverMove.row != null
                            ? hoverMove.row === i
                            : hoverMove.route === routeKey(m))
                            ? { opacity: 0.35 }
                            : {})
                        }}
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
                (!timeline ? (
                  <TableSkeleton inCard rows={7} />
                ) : tabVotes.length === 0 ? (
                  <p className="fs-9 text-body-tertiary mt-2 mb-0">
                    No divergent votes.
                  </p>
                ) : (
                  <>
                    <Table
                      responsive
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
                              onClick={() => pick(v.slot)}
                              style={{
                                cursor: 'pointer',
                                ...(highlight != null && highlight !== v.slot
                                  ? { opacity: 0.35 }
                                  : {})
                              }}
                            >
                              <td>
                                <Link
                                  to={`/slot/${v.slot}`}
                                  className="font-monospace"
                                >
                                  <SlotNumber slot={v.slot} />
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
                        Block producer (dotted: its block&apos;s trip)
                      </span>
                      <span>
                        <span
                          className="d-inline-block rounded-circle align-middle me-1 bg-warning"
                          style={{ width: 8, height: 8 }}
                        />
                        Reward leader, slot + 8 (solid: its vote&apos;s trip)
                      </span>
                      {turbine && waypoints && (
                        <span>
                          <span
                            className="d-inline-block rounded-circle align-middle me-1 border border-info"
                            style={{
                              width: 8,
                              height: 8,
                              borderWidth: 1.5
                            }}
                          />
                          Turbine hop: a root relaying the block&apos;s shreds,
                          one per continent - its + ms is what that path adds
                          over the straight line. Any half of a block&apos;s
                          shreds rebuilds it, so it&apos;s in once the fastest
                          paths carrying half the stake have delivered; paths
                          slower than that are faint (a rough estimate)
                        </span>
                      )}
                      <span>Hover or click a row, dot or route.</span>
                      {turbine && (
                        <Form.Check
                          type="switch"
                          id="network-turbine-waypoints"
                          className="mb-0 fs-10"
                          checked={waypoints}
                          onChange={e => setWaypoints(e.target.checked)}
                          label="Turbine hops"
                          title="Off: the block's paths as one arrow, labeled with the slowest path's floor"
                        />
                      )}
                      {turbine && (
                        <span className="w-100">
                          Estimated Turbine paths: the leader sends each shred
                          to one root, drawn by stake, so it changes shred to
                          shred - a path through each continent&apos;s heaviest
                          data center is drawn, heavier the more of the stake is
                          there. This validator is #
                          {turbine.rank.toLocaleString()} by stake, so{' '}
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
          <Col xs={12} lg={6}>
            <SectionCard
              title="Divergent Votes by Region"
              icon="git-branch"
              info="Its votes that disagreed with the chain, by where that slot's leader was, of the slots it voted on (runs of 32+ consecutive misses, when it wasn't voting at all, left out). Skipped blocks: it voted skip on a block the cluster notarized - most often a block that reached it late. (Notarizing a block the chain skipped did no harm, and isn't counted.) Missed votes: no vote of its was counted - not cast, or too late for the reward certificate."
            >
              {!byRegion ? (
                <TableSkeleton inCard rows={5} />
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
                          title="It voted skip on a block the cluster notarized"
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
        {/* Its pace: how fast it builds its own blocks, and window by
            window each slot's time and the handoffs either side. */}
        <Row className="g-3">
          <Col xs={12}>
            {voteAddress && (producer || !producerBoard) && (
              <ProducerWindowsTable
                voteKey={voteAddress}
                epoch={epoch}
                nodeAddress={node}
                current={epoch === currentEpoch}
                mode="timing"
                pace={{
                  slotMs:
                    producerBoard?.cluster?.slotDuration?.inWindow?.p50Ms ??
                    null,
                  handoffMs:
                    producerBoard?.cluster?.slotDuration?.handoff?.p50Ms ?? null
                }}
                card={{
                  title: 'Leader Slots',
                  icon: 'clock',
                  info: "Its leader windows (4 slots each), newest first: each slot's time from the block before it, by the producers' block times - the first slot's is the handoff from the previous leader - then the handoff to the next leader. Colored against the cluster's medians: green within 10%, amber to 25%, red beyond."
                }}
              />
            )}
          </Col>
        </Row>
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
