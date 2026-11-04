import Pager from 'components/common/Pager';
import ValidatorLink from 'components/common/ValidatorLink';
import UntrackedState from 'components/common/UntrackedState';
import { Divergence, OFFLINE_RUN_SLOTS, OUTCOME } from 'helpers/participation';
import { HoverPath } from 'components/validator/PathPreview';
import { fetchSlots } from 'helpers/slotContext';
import { parseUserAgent } from 'helpers/userAgent';
import useValidatorGeo, { placeOf } from 'hooks/useValidatorGeo';
import { SlotInfo, VortexDataContext } from 'providers/VortexDataProvider';
import { ValidatorGeo } from 'providers/vortex-schemas';
import { ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Table, ToggleButton } from 'react-bootstrap';
import SectionCard from 'components/common/SectionCard';
import { Link } from 'react-router';

/** Leader windows a page. */
const PAGE = 20;
/** Slots in a leader window. */
const WINDOW = 4;

const KIND: Record<Divergence, { label: string; title: string; cls: string }> =
  {
    'missed-block': {
      label: 'Missed',
      title:
        "Its vote isn't in the slot's reward certificates (not cast, or too late to be counted); the slot's block made the chain",
      cls: 'text-danger'
    },
    'missed-skip': {
      label: 'Missed',
      title:
        "Its vote isn't in the slot's reward certificates (not cast, or too late to be counted); the chain skipped the slot, so the agreeing vote was skip",
      cls: 'text-danger'
    },
    missed: {
      label: 'Missed',
      title:
        "Its vote isn't in the slot's reward certificates (not cast, or too late to be counted); the chain's outcome isn't known yet",
      cls: 'text-danger'
    },
    'late-skip': {
      label: 'Voted skip',
      title:
        'Voted skip on a block the cluster notarized: the block arrived too late or the validator saw another fork',
      cls: 'text-warning'
    },
    'notarized-skipped': {
      label: 'Notarized',
      title:
        "Voted notarize on a block that didn't make the chain (rare: reward certificates aggregate the votes the next leaders saw)",
      cls: 'text-warning'
    }
  };

// What happened to the slot (the cluster timeline).
const CHAIN: Record<Divergence, string> = {
  'missed-block': 'Block produced',
  'missed-skip': 'Skipped',
  missed: 'Unknown',
  'late-skip': 'Block produced',
  'notarized-skipped': 'Skipped'
};

// Share of stake IN the slot's reward certificate of that kind - the votes
// the slot + 8 leader saw in time, not every vote cast. null = the footer
// carried no certificate of that kind ('none': no such vote reached that
// leader), not 0% of stake voting that way (per agave's reward-cert
// builder).
// Two decimals, truncated - never rounded up: 99.997% reads 99.99%, so a
// missed vote never sits beside "100%". A present certificate always has a
// signer, so a tiny share must not read as 0%: '<0.01%' below that.
const ppb = (v: number | null) => {
  if (v == null) return 'none';
  const p = v / 1e7;
  if (p > 0 && p < 0.01) return '<0.01%';
  return `${(Math.floor(p * 100) / 100).toFixed(2)}%`;
};

// Tabs: every divergent vote, misses by cause (or all misses before the
// epoch is classified), skipped blocks.
type Filter = 'all' | 'missed' | MissCause | 'late-skip';

/** Why a vote was missed (the API's classification, per slot). */
export type MissCause = 'offline' | 'thin' | 'late';
const CAUSE: Record<
  MissCause,
  { label: string; cls: string; tone: string; title: string }
> = {
  offline: {
    label: 'Offline',
    cls: 'vx-text-offline',
    tone: 'secondary',
    title: `Part of a run of ${OFFLINE_RUN_SLOTS}+ consecutive misses (spanning several producers' windows): not voting`
  },
  thin: {
    label: 'Poor reward block',
    cls: 'text-warning',
    tone: 'warning',
    title:
      "The reward block (slot + 8, see Reward leader) left out 2%+ of the online stake besides this voter: its leader's fault, not the slot leader's"
  },
  late: {
    label: "Didn't get in",
    cls: 'text-danger',
    tone: 'danger',
    title:
      "The reward block (slot + 8, see Reward leader) included other voters but not this one: its vote arrived late or didn't arrive"
  }
};

/**
 * Every slot where the validator's vote disagreed with what the chain did
 * - missed votes, skipped blocks (skip votes on notarized blocks), notarize votes on skipped slots - newest
 * first, with the chain's outcome, how much stake notarized / skipped the
 * slot, how fast the block was finalized, and the slot's leader (/slots). Agreeing votes
 * (including skips on skipped slots) are correct and not listed.
 */
/** A window's slot whose vote agreed with the chain, in green: its
 *  notarize vote landed, or it voted skip on a slot the chain skipped. */
const AgreedVote = ({
  code,
  info
}: {
  code: number | null;
  info: SlotInfo | null | undefined;
}) => {
  if (code !== OUTCOME.notarized && code !== OUTCOME.skipped) return null;
  const v = info?.votes;
  // One line, as a divergent slot's cell: the label, then the shares.
  // Pale: everything is fine here, so it recedes and the misses stand out.
  return (
    <div className="d-flex align-items-baseline justify-content-center gap-2 text-nowrap">
      <span
        className="text-success"
        style={{ opacity: 0.55 }}
        title={
          code === OUTCOME.notarized
            ? 'Its notarize vote landed: agreed with the chain'
            : 'It voted skip, and the chain skipped the slot: agreed'
        }
      >
        {code === OUTCOME.notarized ? 'Notarized' : 'Skip'}
      </span>
      <span
        className="fs-10 font-monospace text-body-tertiary"
        style={{ opacity: 0.7 }}
        title={
          v
            ? `Stake in its notarize / skip reward certificates: ${ppb(v.notarStakePpb)} / ${ppb(v.skipStakePpb)}`
            : undefined
        }
      >
        {v
          ? ppb(code === OUTCOME.notarized ? v.notarStakePpb : v.skipStakePpb)
          : '—'}
      </span>
    </div>
  );
};

/** One slot of a window whose vote went wrong: what (linked to the slot's
 *  page), why, and the stake in its notarize / skip reward certificates
 *  (linked to the reward block); how it finalized on hover. */
const SlotCell = ({
  slot,
  kind,
  info,
  infoError,
  cause,
  selfNode
}: {
  slot: number;
  kind: Divergence;
  info: SlotInfo | null | undefined;
  infoError: boolean;
  cause: MissCause | null;
  selfNode: string | null;
}) => {
  const k = KIND[kind];
  const v = info?.votes;
  const fin = info?.finalization;
  const finText =
    fin?.lagSlots != null
      ? `Finalized after ${fin.lagSlots.toLocaleString()} ${fin.lagSlots === 1 ? 'slot' : 'slots'}${
          fin.lagMs != null && !(fin.lagMs <= 0 && fin.lagSlots > 0)
            ? ` (${fin.lagMs.toLocaleString()} ms)`
            : ''
        }`
      : kind === 'missed-skip'
        ? 'The chain skipped the slot'
        : null;
  // The cause colors the label (no badge of its own) and joins its
  // hover: red - its vote didn't get in; orange - a poor reward block (the
  // reward leader's fault) or a skip vote on a notarized block; purple -
  // offline.
  const cls = cause ? CAUSE[cause].cls : k.cls;
  // The one share shown: the stake that voted the way the chain went.
  const chainSkipped = kind === 'missed-skip' || kind === 'notarized-skipped';
  const why =
    cause != null
      ? `${CAUSE[cause].label}: ${CAUSE[cause].title}`
      : kind === 'late-skip'
        ? 'It voted skip, but the cluster notarized the block: the block likely reached it too late. Its skip vote still counts.'
        : null;
  return (
    <div className="d-flex align-items-baseline justify-content-center gap-2 text-nowrap">
      <Link
        to={`/slot/${slot}${selfNode ? `?voter=${selfNode}` : ''}`}
        className={`fw-semibold ${cls}`}
        title={[`Slot ${slot.toLocaleString()}`, k.title, why, finText]
          .filter(Boolean)
          .join('. ')}
      >
        {k.label}
      </Link>
      <Link
        to={`/slot/${slot + 8}${selfNode ? `?voter=${selfNode}&on=${slot}` : ''}`}
        className="fs-10 font-monospace text-body-tertiary"
        title={`Stake that voted the way the chain went (${chainSkipped ? 'skip' : 'notarize'})${v ? ` - notarize / skip reward certificates: ${ppb(v.notarStakePpb)} / ${ppb(v.skipStakePpb)}` : ''}. Opens the reward block's unrewarded votes, this validator marked.`}
      >
        {info === undefined
          ? infoError
            ? '—'
            : '…'
          : !v
            ? '—'
            : ppb(chainSkipped ? v.skipStakePpb : v.notarStakePpb)}
      </Link>
    </div>
  );
};

const DivergentSlotsTable = ({
  rows,
  leaderOf,
  selfNode,
  causeOf,
  onHover,
  geo: geoProp,
  geoAsOf = 'as of now',
  card,
  voteOf
}: {
  /** Any slot's vote outcome (OUTCOME codes), to show the agreeing ones
   *  in gray. */
  voteOf?: (slot: number) => number | null;
  /** Draw the card around it, the filters in its header (else the
   *  filters above the table). */
  card?: {
    title: string;
    icon: string;
    info?: string;
    before?: ReactNode;
    /** A link in the header, after the filters (e.g. to the map). */
    link?: { to: string; label: string };
  };
  /** Producer locations (the epoch's, from the page), and when from. */
  geo?: Map<string, ValidatorGeo> | null;
  geoAsOf?: string;
  /** A row hovered (its block producer and payer), or null on leave. */
  onHover?: (path: HoverPath | null) => void;
  rows: Array<{ slot: number; kind: Divergence }>;
  /** A missed slot's cause, once the API has classified the epoch. */
  causeOf?: ((slot: number) => MissCause | null) | null;
  /** Slot -> leader node identity, from the epoch's leader schedule. */
  leaderOf: ((slot: number) => string | null) | null;
  selfNode: string | null;
}) => {
  const context = useContext(VortexDataContext);
  // In its card (filters in the header), or bare (filters above).
  const wrap = (body: ReactNode, filters?: ReactNode) =>
    card ? (
      <SectionCard
        title={card.title}
        icon={card.icon}
        info={card.info}
        aside={
          card.link ? (
            <div className="d-flex align-items-center gap-3">
              {filters}
              <Link to={card.link.to} className="fs-9 text-nowrap">
                {card.link.label} →
              </Link>
            </div>
          ) : (
            filters
          )
        }
      >
        {card.before}
        {body}
      </SectionCard>
    ) : (
      <>
        {filters && <div className="mb-2">{filters}</div>}
        {body}
      </>
    );
  const [filter, setFilter] = useState<Filter>('all');
  // The slot cell under the pointer (highlighted, its path previewed).
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  // Notarized-skipped slots (it notarized a block the cluster skipped -
  // its vote still counts) aren't listed.
  const listed = useMemo(
    () => [...rows].reverse().filter(r => r.kind !== 'notarized-skipped'),
    [rows]
  );
  // Every divergent slot, whatever the tab: an agreeing vote is shown in
  // gray only where the slot isn't one.
  const divergentSlots = useMemo(
    () => new Map(rows.map(r => [r.slot, r.kind] as const)),
    [rows]
  );
  const tabOf = (r: { slot: number; kind: Divergence }): Filter =>
    r.kind === 'late-skip' ? 'late-skip' : (causeOf?.(r.slot) ?? 'missed');
  const filtered = useMemo(
    () =>
      filter === 'all'
        ? listed
        : filter === 'missed'
          ? listed.filter(r => r.kind.startsWith('missed'))
          : listed.filter(r => tabOf(r) === filter),
    // tabOf reads causeOf.
    [listed, filter, causeOf]
  );
  // One row per leader window (its four slots share a block producer and,
  // at slot + 8, a reward leader), newest first; a slot whose vote agreed
  // stays empty.
  const windows = useMemo(() => {
    const m = new Map<number, Map<number, Divergence>>();
    for (const r of filtered) {
      const start = r.slot - (r.slot % WINDOW);
      if (!m.has(start)) m.set(start, new Map());
      m.get(start)!.set(r.slot, r.kind);
    }
    return [...m].map(([start, slots]) => ({ start, slots }));
  }, [filtered]);
  const pages = Math.max(1, Math.ceil(windows.length / PAGE));
  const shown = useMemo(
    () => windows.slice(page * PAGE, (page + 1) * PAGE),
    [windows, page]
  );

  // Per-slot facts (/slots) for the rows on screen: a few small ranges.
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(new Map());
  const [infoError, setInfoError] = useState(false);
  useEffect(() => {
    let live = true;
    // The rows' slots and their payers' (slot + 8): each block's own
    // footer says what software built it.
    // Every slot of each window on screen (the agreeing ones show their
    // shares too), and the divergent ones' reward blocks (slot + 8).
    fetchSlots(
      shown.flatMap(w =>
        [0, 1, 2, 3]
          .map(n => w.start + n)
          .concat([...w.slots.keys()].map(slot => slot + 8))
      )
    ).then(
      f => live && setInfos(m => new Map([...m, ...f])),
      () => live && setInfoError(true)
    );
    return () => {
      live = false;
    };
  }, [shown]);

  const counts = useMemo(() => {
    const c = new Map<Filter, number>();
    for (const r of listed) {
      const t = tabOf(r);
      c.set(t, (c.get(t) ?? 0) + 1);
      if (r.kind.startsWith('missed'))
        c.set('missed', (c.get('missed') ?? 0) + 1);
    }
    return c;
    // tabOf reads causeOf.
  }, [listed, causeOf]);
  const tabs: Array<[Filter, string, string]> = [
    ['all', 'All', 'secondary'],
    ...(causeOf
      ? ([
          ['late', "Didn't get in", 'danger'],
          ['thin', 'Poor reward block', 'warning'],
          ['offline', 'Offline', 'secondary']
        ] as Array<[Filter, string, string]>)
      : ([['missed', 'Missed', 'danger']] as Array<[Filter, string, string]>)),
    ['late-skip', 'Voted skip', 'warning']
  ];

  // Where each producer was (the page's, else today's) and the software
  // its block reported.
  // Today's only when the page didn't pass the epoch's.
  const geoNow = useValidatorGeo(geoProp === undefined);
  const geo = geoProp !== undefined ? geoProp : geoNow;

  if (!listed.length)
    return wrap(
      <UntrackedState>
        No divergent slots this epoch so far: every vote agreed with the chain.
      </UntrackedState>
    );

  const detail = (
    node: string,
    ua: string | null | undefined,
    uaKind?: string | null,
    /** Leads the line (the payer's block link). */
    lead?: ReactNode
  ) => {
    const g = geo?.get(node);
    const sw = parseUserAgent(ua, uaKind);
    const parts = [
      g?.geo?.continent ?? null,
      placeOf(g),
      g?.geo?.asnOrganization ?? null,
      ua !== undefined ? sw.label : null
    ].filter(Boolean);
    return parts.length || lead ? (
      <div
        className="fs-10 text-body-tertiary text-truncate"
        style={{ maxWidth: 180 }}
        title={`${parts.join(' · ')}${g ? ` (location ${geoAsOf})` : ''}`}
      >
        {lead}
        {lead && parts.length > 0 && ' · '}
        {parts.join(' · ')}
      </div>
    ) : null;
  };

  const nameOf = (node: string) =>
    context?.validatorDirectoryState.byNodeAddress?.get(node)?.name ??
    `${node.slice(0, 6)}…${node.slice(-6)}`;

  // The filters: every divergent vote, misses by cause, skipped blocks -
  // as the card header's toggle (with each one's count).
  const filters = (
    <ButtonGroup size="sm" className="flex-wrap">
      {tabs
        .filter(
          ([k]) => k === 'all' || k === filter || (counts.get(k) ?? 0) > 0
        )
        .map(([k, label]) => (
          <ToggleButton
            key={k}
            id={`divergent-${k}`}
            type="radio"
            name="divergent-filter"
            variant="soft-secondary"
            value={k}
            checked={filter === k}
            onChange={() => {
              setFilter(k);
              setPage(0);
            }}
          >
            {label}
            <span className="ms-1 text-body-tertiary">
              {(k === 'all'
                ? listed.length
                : (counts.get(k) ?? 0)
              ).toLocaleString()}
            </span>
          </ToggleButton>
        ))}
    </ButtonGroup>
  );

  return wrap(
    <>
      {/* Fixed widths, so the columns stay put whatever the tab shows. */}
      <Table
        responsive
        size="sm"
        className="data-table fs-9 mb-0"
        style={{ tableLayout: 'fixed', minWidth: 940 }}
      >
        <colgroup>
          <col style={{ width: '7.5rem' }} />
          <col style={{ width: '10.5rem' }} />
          <col style={{ width: '10.5rem' }} />
          {[0, 1, 2, 3].map(n => (
            <col key={n} style={{ width: '8rem' }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>Window</th>
            <th title="The window's leader, whose blocks it voted on (they had to reach this validator and be replayed)">
              Block producer
            </th>
            <th title="The slot + 8 leader: its blocks (the reward blocks) reward these slots' votes, so a missed vote is missing from its certificates">
              Reward leader
            </th>
            {[1, 2, 3, 4].map(n => (
              <th
                key={n}
                className="text-center"
                title="The window's slot: empty when its vote agreed with the chain; else what went wrong, why, and the share of stake in its notarize / skip reward certificates"
              >
                Slot {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          onMouseLeave={() => {
            setHoverSlot(null);
            onHover?.(null);
          }}
        >
          {shown.map(({ start, slots }) => {
            const first = [...slots.keys()][0];
            const leader =
              infos.get(first)?.leader ?? leaderOf?.(first) ?? null;
            const payer = leaderOf?.(first + 8) ?? null;
            const blockInfo = [...slots.keys()]
              .map(sl => infos.get(sl))
              .find(i => i?.outcome === 'block');
            return (
              <tr key={start}>
                <td className="font-monospace text-nowrap">
                  <Link to={`/slot/${start}`}>{start.toLocaleString()}</Link>
                </td>
                <td className="text-nowrap">
                  {leader ? (
                    <>
                      <ValidatorLink
                        address={leader}
                        className="d-inline-block text-truncate align-bottom"
                        style={{ maxWidth: 170 }}
                      >
                        {nameOf(leader)}
                      </ValidatorLink>
                      {leader === selfNode && (
                        <span className="text-body-tertiary"> (self)</span>
                      )}
                      {detail(
                        leader,
                        blockInfo
                          ? (blockInfo.footer?.userAgent ?? null)
                          : undefined,
                        blockInfo?.footer?.userAgentKind
                      )}
                    </>
                  ) : (
                    <span className="text-body-tertiary">—</span>
                  )}
                </td>
                <td className="text-nowrap">
                  {payer ? (
                    <>
                      <ValidatorLink
                        address={payer}
                        className="d-inline-block text-truncate align-bottom"
                        style={{ maxWidth: 170 }}
                      >
                        {nameOf(payer)}
                      </ValidatorLink>
                      {payer === selfNode && (
                        <span className="text-body-tertiary"> (self)</span>
                      )}
                      {detail(
                        payer,
                        infos.get(first + 8)?.outcome === 'block'
                          ? (infos.get(first + 8)?.footer?.userAgent ?? null)
                          : undefined,
                        infos.get(first + 8)?.footer?.userAgentKind
                      )}
                    </>
                  ) : (
                    <span className="text-body-tertiary">—</span>
                  )}
                </td>
                {[0, 1, 2, 3].map(n => {
                  const slot = start + n;
                  const kind = slots.get(slot);
                  return (
                    <td
                      key={n}
                      className={`text-center border-start${hoverSlot === slot ? ' bg-body-highlight' : ''}`}
                      // The hover is the cell's: its slot's path (its
                      // producer, this voter, its reward leader).
                      onMouseEnter={() => {
                        setHoverSlot(slot);
                        onHover?.({
                          slot,
                          block: infos.get(slot)?.leader ?? leader,
                          payer: leaderOf?.(slot + 8) ?? payer
                        });
                      }}
                    >
                      {kind ? (
                        <SlotCell
                          slot={slot}
                          kind={kind}
                          info={infos.get(slot)}
                          infoError={infoError}
                          cause={
                            kind.startsWith('missed')
                              ? (causeOf?.(slot) ?? null)
                              : null
                          }
                          selfNode={selfNode}
                        />
                      ) : divergentSlots.has(slot) ? (
                        // Divergent, but the tab leaves it out: shown
                        // faded, so the cell doesn't look empty.
                        <div
                          className="opacity-50"
                          title="Not in this tab's filter: see All"
                        >
                          <SlotCell
                            slot={slot}
                            kind={divergentSlots.get(slot)!}
                            info={infos.get(slot)}
                            infoError={infoError}
                            cause={
                              divergentSlots.get(slot)!.startsWith('missed')
                                ? (causeOf?.(slot) ?? null)
                                : null
                            }
                            selfNode={selfNode}
                          />
                        </div>
                      ) : voteOf ? (
                        <AgreedVote
                          code={voteOf(slot)}
                          info={infos.get(slot)}
                        />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </Table>
      {pages > 1 && (
        <Pager
          page={page}
          pages={pages}
          total={windows.length}
          pageSize={PAGE}
          shown={shown.length}
          onPrev={() => setPage(p => p - 1)}
          onNext={() => setPage(p => p + 1)}
          onPage={setPage}
        />
      )}
    </>,
    filters
  );
};

export default DivergentSlotsTable;
