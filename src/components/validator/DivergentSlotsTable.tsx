import Pager from 'components/common/Pager';
import ValidatorLink from 'components/common/ValidatorLink';
import UntrackedState from 'components/common/UntrackedState';
import { Divergence, OFFLINE_RUN_SLOTS } from 'helpers/participation';
import { HoverPath } from 'components/validator/PathPreview';
import { fetchSlots } from 'helpers/slotContext';
import { parseUserAgent } from 'helpers/userAgent';
import useValidatorGeo, { placeOf } from 'hooks/useValidatorGeo';
import { SlotInfo, VortexDataContext } from 'providers/VortexDataProvider';
import { ValidatorGeo } from 'providers/vortex-schemas';
import { ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const PAGE = 25;

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
      label: 'Skipped block',
      title:
        'Voted skip on a slot that made the chain: the block arrived too late or the validator saw another fork',
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
// A present certificate always has a signer, so a tiny share must not read
// as 0% (e.g. 0.067% from 2 signers): one decimal under 1%, '<0.1%' below.
const ppb = (v: number | null) => {
  if (v == null) return 'none';
  const p = v / 1e7;
  if (p >= 1) return `${Math.round(p)}%`;
  if (p >= 0.1) return `${p.toFixed(1)}%`;
  return '<0.1%';
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
    cls: 'text-body-secondary',
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
const DivergentSlotsTable = ({
  rows,
  leaderOf,
  selfNode,
  causeOf,
  onHover,
  geo: geoProp,
  geoAsOf = 'as of now'
}: {
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
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  // Notarized-skipped slots (it notarized a block the cluster skipped -
  // its vote still counts) aren't listed.
  const listed = useMemo(
    () => [...rows].reverse().filter(r => r.kind !== 'notarized-skipped'),
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
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = useMemo(
    () => filtered.slice(page * PAGE, (page + 1) * PAGE),
    [filtered, page]
  );

  // Per-slot facts (/slots) for the rows on screen: a few small ranges.
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(new Map());
  const [infoError, setInfoError] = useState(false);
  useEffect(() => {
    let live = true;
    // The rows' slots and their payers' (slot + 8): each block's own
    // footer says what software built it.
    fetchSlots(shown.flatMap(r => [r.slot, r.slot + 8])).then(
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
    ['late-skip', 'Skipped blocks', 'warning']
  ];

  // Where each producer was (the page's, else today's) and the software
  // its block reported.
  // Today's only when the page didn't pass the epoch's.
  const geoNow = useValidatorGeo(geoProp === undefined);
  const geo = geoProp !== undefined ? geoProp : geoNow;

  if (!listed.length)
    return (
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

  return (
    <>
      <ul className="nav nav-underline fs-9 mb-2 flex-nowrap overflow-auto">
        {tabs
          .filter(
            ([k]) => k === 'all' || k === filter || (counts.get(k) ?? 0) > 0
          )
          .map(([k, label, tone]) => (
            <li key={k} className="nav-item">
              <button
                type="button"
                className={`nav-link text-nowrap${filter === k ? ' active' : ''}`}
                onClick={() => {
                  setFilter(k);
                  setPage(0);
                }}
              >
                {label}
                <span className={`badge badge-soft badge-soft-${tone} ms-2`}>
                  {(k === 'all'
                    ? listed.length
                    : (counts.get(k) ?? 0)
                  ).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
      </ul>
      <Table responsive size="sm" className="data-table fs-9 mb-0">
        <thead>
          <tr>
            <th>Slot</th>
            <th className="d-none d-md-table-cell">Vote</th>
            {causeOf && (
              <th title="Why a missed vote was missed: offline, else a Poor reward block (slot + 8 - its leader's fault), else it didn't get in">
                Cause
              </th>
            )}
            <th
              className="text-end"
              title="Share of stake in this slot's notarize / skip reward certificates: the votes the slot + 8 leader had received, so not every vote cast. 'none' = no certificate of that kind. The rest of the stake isn't in either certificate (didn't vote, vote too late, voted for another block, or left out) - the footer can't tell which."
            >
              Notarize / skip
            </th>
            <th title="The slot's leader, whose block it voted on (it had to reach this validator and be replayed)">
              Block producer
            </th>
            <th title="The slot + 8 leader: its block (the reward block) rewards this slot's votes, so a missed vote is missing from its certificate">
              Reward leader
            </th>
            <th
              className="text-end d-none d-md-table-cell"
              title="How long until a finalization certificate covered the block (slots · ms); 'direct' when the block got its own certificate"
            >
              Finalized
            </th>
          </tr>
        </thead>
        <tbody onMouseLeave={() => onHover?.(null)}>
          {shown.map(({ slot, kind }) => {
            const k = KIND[kind];
            const leader = infos.get(slot)?.leader ?? leaderOf?.(slot) ?? null;
            const payer = leaderOf?.(slot + 8) ?? null;
            const info = infos.get(slot);
            const v = info?.votes;
            const fin = info?.finalization;
            return (
              <tr
                key={slot}
                onMouseEnter={() =>
                  onHover?.({
                    slot,
                    block: leader,
                    payer
                  })
                }
              >
                <td className="font-monospace">
                  {/* The slot's page: who its votes left out, this
                      validator marked. */}
                  <Link
                    to={`/slot/${slot}${selfNode ? `?voter=${selfNode}` : ''}`}
                  >
                    {slot.toLocaleString()}
                  </Link>
                </td>
                <td
                  className={`text-nowrap fw-semibold d-none d-md-table-cell ${k.cls}`}
                  title={k.title}
                >
                  {k.label}
                </td>
                {causeOf && (
                  <td className="text-nowrap">
                    {(() => {
                      const c = kind.startsWith('missed')
                        ? causeOf(slot)
                        : null;
                      return c ? (
                        <span
                          className={`badge badge-soft badge-soft-${CAUSE[c].tone}`}
                          title={CAUSE[c].title}
                        >
                          {CAUSE[c].label}
                        </span>
                      ) : kind === 'late-skip' ? (
                        <span
                          className="text-body-secondary"
                          title="It voted skip, but the cluster notarized the block: the block likely reached it too late. Its skip vote still counts."
                        >
                          Cluster notarized it
                        </span>
                      ) : (
                        <span className="text-body-tertiary">—</span>
                      );
                    })()}
                  </td>
                )}
                <td className="text-end font-monospace text-nowrap">
                  {info === undefined ? (
                    <span className="text-body-tertiary">
                      {infoError ? '—' : '…'}
                    </span>
                  ) : !v ? (
                    <span
                      className="text-body-tertiary"
                      title="The slot's votes aren't known yet (slot + 8 not ingested)"
                    >
                      —
                    </span>
                  ) : (
                    `${ppb(v.notarStakePpb)} / ${ppb(v.skipStakePpb)}`
                  )}
                </td>
                <td className="text-nowrap">
                  {/* The block producer (the slot's leader): its block had
                      to reach this voter, be replayed and voted on. */}
                  {leader ? (
                    <>
                      <ValidatorLink
                        address={leader}
                        className="d-inline-block text-truncate align-bottom"
                        style={{ maxWidth: 180 }}
                      >
                        {nameOf(leader)}
                      </ValidatorLink>
                      {kind === 'missed-skip' && (
                        <span
                          className="badge badge-soft badge-soft-secondary ms-2"
                          title="The chain skipped this slot"
                        >
                          slot skipped
                        </span>
                      )}
                      {leader === selfNode && (
                        <span className="text-body-tertiary"> (self)</span>
                      )}
                      {detail(
                        leader,
                        infos.get(slot)?.outcome === 'block'
                          ? (infos.get(slot)?.footer?.userAgent ?? null)
                          : undefined,
                        infos.get(slot)?.footer?.userAgentKind
                      )}
                    </>
                  ) : (
                    CHAIN[kind]
                  )}
                </td>
                <td className="text-nowrap">
                  {payer ? (
                    <>
                      <ValidatorLink
                        address={payer}
                        className={`d-inline-block text-truncate align-bottom${
                          kind.startsWith('missed') &&
                          causeOf?.(slot) === 'thin'
                            ? ' text-warning'
                            : ''
                        }`}
                        style={{ maxWidth: 180 }}
                      >
                        {nameOf(payer)}
                      </ValidatorLink>
                      {payer === selfNode && (
                        <span className="text-body-tertiary"> (self)</span>
                      )}
                      {detail(
                        payer,
                        infos.get(slot + 8)?.outcome === 'block'
                          ? (infos.get(slot + 8)?.footer?.userAgent ?? null)
                          : undefined,
                        infos.get(slot + 8)?.footer?.userAgentKind,
                        // Its block, where this vote should have been: the
                        // block page's left-out list, this voter marked.
                        <Link
                          to={`/slot/${slot + 8}${selfNode ? `?voter=${selfNode}&on=${slot}` : ''}`}
                          className="font-monospace"
                          title="The reward block: its unrewarded votes, this validator marked"
                        >
                          {(slot + 8).toLocaleString()}
                        </Link>
                      )}
                    </>
                  ) : (
                    <span className="text-body-tertiary">—</span>
                  )}
                </td>
                <td className="text-end font-monospace text-nowrap d-none d-md-table-cell">
                  {fin?.lagSlots != null ? (
                    <span
                      title={
                        fin.directPath
                          ? `own ${fin.directPath} certificate`
                          : undefined
                      }
                    >
                      {fin.lagSlots.toLocaleString()}{' '}
                      {fin.lagSlots === 1 ? 'slot' : 'slots'}
                      {/* ms comes from the two blocks' producer timestamps;
                          some producers stamp parent + 1 ns, so a slot or
                          more of lag can read as 0 ms - don't show that. */}
                      {fin.lagMs != null &&
                        !(fin.lagMs <= 0 && fin.lagSlots > 0) && (
                          <span className="text-body-tertiary">
                            {' '}
                            · {fin.lagMs.toLocaleString()} ms
                          </span>
                        )}
                    </span>
                  ) : kind === 'missed-skip' || kind === 'notarized-skipped' ? (
                    <span
                      className="text-body-tertiary"
                      title="The chain skipped the slot: there's no block to finalize"
                    >
                      skipped
                    </span>
                  ) : (
                    <span className="text-body-tertiary">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {pages > 1 && (
        <Pager
          page={page}
          pages={pages}
          total={filtered.length}
          pageSize={PAGE}
          shown={shown.length}
          onPrev={() => setPage(p => p - 1)}
          onNext={() => setPage(p => p + 1)}
          onPage={setPage}
        />
      )}
    </>
  );
};

export default DivergentSlotsTable;
