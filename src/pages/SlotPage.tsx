import FeatherIcon from 'feather-icons-react';
import Button from 'components/base/Button';
import DelayedSpinner from 'components/common/DelayedSpinner';
import PageBreadcrumb from 'components/common/PageBreadcrumb';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  ConsensusTable,
  FooterTable,
  OverviewTable
} from 'components/slot/SlotTables';
import SlotMissingVoters from 'components/slot/SlotMissingVoters';
import SlotStrip, { stripCaption, stripSlots } from 'components/slot/SlotStrip';
import {
  Unrewardable,
  finalizationPathOf,
  pct2
} from 'components/slot/SlotVotes';
import { fetchFooter, fetchSlots, settled } from 'helpers/slotContext';
import { producerRecordOf } from 'providers/vortex-schemas';
import useCluster from 'hooks/useCluster';
import {
  SlotFooter,
  SlotInfo,
  SlotPage as SlotPageData,
  VortexDataContext
} from 'providers/VortexDataProvider';
import {
  FormEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Col, Form, Row, Table } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

/**
 * One slot's whole story (/slot, plus /slots around it and the decoded
 * footer): a header with the outcome and the leader's track record, the
 * leader windows around it, the votes on it and how it was finalized, who
 * is missing from its certificates (by country / provider / client), what
 * its footer carried and the proof, and - mainnet - its fees. Tower slots
 * keep their vote-latency table.
 */
const SlotPage = () => {
  const context = useContext(VortexDataContext);
  const navigate = useNavigate();
  const { slot: slotParam } = useParams();
  const slot = Number(slotParam);
  const valid = Number.isInteger(slot) && slot >= 0;
  const { blockIncomeTracked } = useCluster();

  const slice = context?.slotPageState;
  const fetchSlot = slice?.fetchData;
  const loaded = valid ? slice?.data.get(slot) : undefined;
  useEffect(() => {
    if (valid) fetchSlot?.(slot);
  }, [valid, slot, fetchSlot]);
  const unavailable = !loaded && !slice?.isLoading && !!slice?.error;
  // Stepping to a slot that isn't loaded yet keeps the last one on screen
  // (dimmed) until it arrives, rather than blanking the page to a spinner.
  const lastPage = useRef<SlotPageData | undefined>(undefined);
  if (loaded) lastPage.current = loaded;
  const page = loaded ?? (valid && !unavailable ? lastPage.current : undefined);
  const stale = !!page && page.slot !== slot;

  // Cohort fields (country, provider, client) and names: the slot's epoch
  // participation board.
  const epoch = page?.epoch;
  const isAlpenglow = page?.consensus === 'alpenglow';
  const fetchBoard = context?.participationLeaderboardState.fetchData;
  useEffect(() => {
    if (isAlpenglow && epoch != null) fetchBoard?.(epoch);
  }, [isAlpenglow, epoch, fetchBoard]);
  const board =
    epoch != null
      ? context?.participationLeaderboardState.data.get(epoch)
      : undefined;
  const byVote = useMemo(
    () => new Map((board?.records ?? []).map(r => [r.voteAddress, r])),
    [board]
  );
  const byNode = useMemo(
    () => new Map((board?.records ?? []).map(r => [r.nodeAddress, r])),
    [board]
  );
  const totalStake = useMemo(
    () =>
      board?.records.length
        ? board.records.reduce((a, r) => a + r.stake, 0)
        : null,
    [board]
  );
  const dir = context?.validatorDirectoryState;
  const nameOf = (node: string | null, vote: string) =>
    byVote.get(vote)?.nodeName ??
    (node ? byNode.get(node)?.nodeName : null) ??
    (node ? dir?.byNodeAddress?.get(node)?.name : null) ??
    dir?.byVoteAddress?.get(vote)?.name ??
    short(node ?? vote);
  const nodeName = (node: string) => nameOf(node, node);

  // The leader windows around the slot, and slot - 8 (the votes its footer
  // carried), in one /slots call.
  // (From the slot's own page, never the one still shown while it loads.)
  const windowFirst =
    loaded?.leaderWindow?.firstSlot ??
    (loaded?.slotIndex != null
      ? slot - (loaded.slotIndex % 4)
      : slot - (slot % 4));
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(new Map());
  const [footer, setFooter] = useState<SlotFooter | null | undefined>();
  useEffect(() => {
    if (!isAlpenglow || !valid) return;
    let live = true;
    // Merged in, so the strip doesn't blank while a new slot's arrive.
    fetchSlots([...stripSlots(windowFirst), slot - 8]).then(
      m => live && setInfos(prev => new Map([...prev, ...m])),
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [isAlpenglow, valid, slot, windowFirst]);
  // Load the slot's neighbours - the rest of its leader window and the
  // slots either side - in the background, so stepping to them is
  // instant. Only settled ones: the page cache keeps what it gets.
  const neighbours = useMemo(
    () =>
      [
        ...new Set([
          slot - 1,
          slot + 1,
          ...[0, 1, 2, 3].map(i => windowFirst + i)
        ])
      ].filter(s => s !== slot && s >= 0),
    [slot, windowFirst]
  );
  useEffect(() => {
    if (!loaded || !fetchSlot) return;
    const todo = neighbours.filter(s => {
      const i = infos.get(s);
      return i != null && settled(i);
    });
    let live = true;
    (async () => {
      for (const s of todo) {
        if (!live) return;
        await fetchSlot(s);
      }
    })();
    return () => {
      live = false;
    };
  }, [loaded, fetchSlot, neighbours, infos]);

  const hasFooter = !!page?.alpenglow?.footer;
  useEffect(() => {
    setFooter(undefined);
    if (!hasFooter) return;
    let live = true;
    fetchFooter(slot).then(
      f => live && setFooter(f),
      () => live && setFooter(null)
    );
    return () => {
      live = false;
    };
  }, [hasFooter, slot]);

  // The leader record covers the slot's epoch: "this epoch" only when
  // that's the current one.
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const currentEpochSlot = epoch != null && epoch === currentEpoch;

  const [goto, setGoto] = useState('');
  const onGoto = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(goto.replace(/[,\s]/g, ''));
    if (Number.isInteger(n) && n >= 0) navigate(`/slot/${n}`);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const crumbs = [
    { label: 'Home', url: '/' },
    ...(epoch != null
      ? [
          {
            label: `Epoch ${epoch}`,
            url: isAlpenglow
              ? `/leaderboards/consensus/epoch/${epoch}`
              : `/leaderboards/voting/epoch/${epoch}`
          }
        ]
      : []),
    { label: `Slot ${valid ? slot.toLocaleString() : ''}`, active: true }
  ];

  const nav = (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <Button
        variant="soft-secondary"
        className="btn-sm"
        disabled={!valid || slot <= 0}
        onClick={() => navigate(`/slot/${slot - 1}`)}
        aria-label="Previous slot"
      >
        <FeatherIcon icon="chevron-left" size={14} />
        {valid && slot > 0 && (
          <span className="font-monospace ms-1">
            {String(slot - 1).slice(-3)}
          </span>
        )}
      </Button>
      <Button
        variant="soft-secondary"
        className="btn-sm"
        disabled={!valid}
        onClick={() => navigate(`/slot/${slot + 1}`)}
        aria-label="Next slot"
      >
        {valid && (
          <span className="font-monospace me-1">
            {String(slot + 1).slice(-3)}
          </span>
        )}
        <FeatherIcon icon="chevron-right" size={14} />
      </Button>
      <Form onSubmit={onGoto} className="d-flex">
        <Form.Control
          size="sm"
          inputMode="numeric"
          placeholder="Go to slot…"
          value={goto}
          onChange={e => setGoto(e.target.value)}
          aria-label="Go to slot"
          style={{ width: '9rem' }}
        />
      </Form>
    </div>
  );

  if (!valid || unavailable || !page)
    return (
      <div>
        <PageBreadcrumb items={crumbs} />
        <div className="mb-9">
          <Row className="page-header align-items-end justify-content-between g-3">
            <Col xs="auto">
              <h3>Slot {valid ? slot.toLocaleString() : '—'}</h3>
            </Col>
            <Col xs="auto">{nav}</Col>
          </Row>
          {!valid ? (
            <UntrackedState>That isn&apos;t a slot number.</UntrackedState>
          ) : unavailable ? (
            <UntrackedState>
              Slot data isn&apos;t available from this API (or for this slot)
              right now.
            </UntrackedState>
          ) : (
            <DelayedSpinner loading label="Loading slot…" />
          )}
        </div>
      </div>
    );

  // The leader's country · provider (its software is the footer's).
  const cohort = page?.leader ? byNode.get(page.leader) : undefined;
  const leaderCohortLine = cohort
    ? [cohort.country, cohort.provider].filter(Boolean).join(' · ') || null
    : null;
  // Its votes are paid by the block 8 slots later. No reward certificate
  // ever comes when that slot was skipped, or its block (ingested: its
  // footer is in) carried none - nobody's votes on this slot are rewarded
  // (not a miss for anyone).
  const payer = infos.get(slot + 8);
  const unrewardable: Unrewardable | null =
    page.alpenglow?.votes != null
      ? null
      : payer?.outcome === 'skipped'
        ? 'skipped'
        : payer?.outcome === 'block' && payer.footer != null
          ? 'noCerts'
          : null;
  // The votes this block carried, scored (/slot's carried; newer APIs).
  const hasCarried =
    page.alpenglow?.outcome === 'block' &&
    page.carried?.idealStakePpb != null &&
    page.carried.includedIdealStakePpb != null;

  return (
    <div>
      <PageBreadcrumb items={crumbs} />
      <div
        className="mb-9 d-flex flex-column gap-3"
        style={{
          opacity: stale ? 0.55 : 1,
          transition: stale ? 'opacity 150ms 150ms' : undefined
        }}
        aria-busy={stale}
      >
        <SlotHeader page={page} nav={nav} />
        <LeaderCallout page={page} past={!currentEpochSlot} />

        {page.note && <UntrackedState>{page.note}</UntrackedState>}

        {/* The key facts as tables - the block explorer's layout - then
            the detail cards. */}
        {/* Side by side on wide screens (a full-width table spreads its
            labels and values too far apart), stacked otherwise. */}
        <div
          className="d-grid gap-3"
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 28rem), 1fr))'
          }}
        >
          <OverviewTable
            page={page}
            footer={footer}
            infos={infos}
            nodeName={nodeName}
            leaderCohort={leaderCohortLine}
            income={blockIncomeTracked ? (page.income ?? null) : null}
          />
          {isAlpenglow && (
            <ConsensusTable
              page={page}
              rewardInfo={infos.get(slot - 8)}
              unrewardable={unrewardable}
            />
          )}
          {isAlpenglow && page.alpenglow?.outcome === 'block' && (
            <FooterTable page={page} />
          )}
          {isAlpenglow && (
            <SectionCard title="Around this slot" icon="grid">
              <SlotStrip
                slot={slot}
                windowFirst={windowFirst}
                infos={infos}
                nameOf={nodeName}
              />
              {stripCaption(slot, windowFirst, infos) && (
                <p className="fs-10 text-body-tertiary px-2 mt-1 mb-0">
                  {stripCaption(slot, windowFirst, infos)}
                </p>
              )}
            </SectionCard>
          )}
        </div>

        {!isAlpenglow && page.tower && <TowerVotes tower={page.tower} />}

        {/* Who the votes on this slot left out (judged by block + 8),
            then a block's own accountability: who it left out. */}
        {isAlpenglow && (
          <SlotMissingVoters
            which="votes"
            page={page}
            byVote={byVote}
            totalStake={totalStake}
            nameOf={nameOf}
          />
        )}
        {isAlpenglow && page.alpenglow?.outcome === 'block' && (
          <SlotMissingVoters
            which="carried"
            page={page}
            byVote={byVote}
            totalStake={totalStake}
            nameOf={nameOf}
          />
        )}
      </div>
    </div>
  );
};

/** The page header: "Slot N", what happened (outcome · consensus ·
 *  epoch), and prev / next / go to. The details are the Overview table's. */
const SlotHeader = ({
  page,
  nav
}: {
  page: SlotPageData;
  nav: React.ReactNode;
}) => {
  const isAlpenglow = page.consensus === 'alpenglow';
  const ag = page.alpenglow;
  const outcome = isAlpenglow
    ? ag?.outcome
    : page.tower?.isSkipped == null
      ? null
      : page.tower.isSkipped
        ? 'skipped'
        : 'block';
  const finalized = !!ag?.finalization?.byFooterSlot;
  const badge =
    outcome === 'block'
      ? {
          bg: !finalized
            ? 'primary'
            : finalizationPathOf(page).path === 'fast'
              ? 'primary'
              : finalizationPathOf(page).path === 'slow'
                ? 'warning'
                : 'secondary',
          label: !finalized
            ? 'Block'
            : finalizationPathOf(page).path === 'fast'
              ? 'Fast-finalized block'
              : finalizationPathOf(page).path === 'slow'
                ? 'Slow-finalized block'
                : 'Block, finalized via a later block'
        }
      : outcome === 'skipped'
        ? { bg: 'warning', label: 'Skipped' }
        : outcome === 'noData'
          ? { bg: 'secondary', label: 'No data' }
          : { bg: 'secondary', label: 'Pending' };

  const subtitle = [
    badge.label === 'Pending' ? 'Not ingested yet' : badge.label,
    isAlpenglow ? 'Alpenglow' : 'TowerBFT',
    `epoch ${page.epoch}`
  ].join(' · ');
  // As the leaderboards' header: the title, one subtitle line, the
  // controls at the right.
  return (
    <Row className="page-header align-items-end justify-content-between g-3">
      <Col xs="auto">
        {/* A slot that produced a block is that block's page. */}
        <h3>
          {page.alpenglow?.outcome === 'block' ||
          (!page.alpenglow && page.tower?.isSkipped === false)
            ? 'Block'
            : 'Slot'}{' '}
          {page.slot.toLocaleString()}
        </h3>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">{subtitle}</p>
      </Col>
      <Col xs="auto">{nav}</Col>
    </Row>
  );
};

/**
 * A leader that has skipped every window so far (or most): worth saying
 * loudly - and whether it's voting, which tells offline from a broken
 * block producer.
 */
const LeaderCallout = ({
  page,
  past
}: {
  page: SlotPageData;
  /** The slot's epoch is over: the record is final. */
  past: boolean;
}) => {
  const rec = producerRecordOf(page);
  const slots = rec ? rec.blocks + rec.skippedSlots : 0;
  if (!rec || slots < 16) return null;
  const all = rec.skippedSlots === slots;
  const most = rec.skippedSlots * 2 >= slots;
  if (!all && !most) return null;
  const voteMiss = page.missingVoters?.find(m => m.nodeAddress === page.leader);
  const missShare =
    voteMiss && page.missingVoters && page.missingStakePpb
      ? (voteMiss.stake / page.missingVoters.reduce((a, m) => a + m.stake, 0)) *
        page.missingStakePpb
      : null;
  return (
    <div className="bg-warning-subtle border border-warning-subtle rounded p-3 d-flex gap-3">
      <FeatherIcon
        icon="alert-triangle"
        size={18}
        className="text-warning flex-shrink-0 mt-1"
      />
      <div className="d-flex flex-column gap-1 fs-9">
        <span className="fw-bold fs-8">
          {past
            ? all
              ? `This leader skipped all ${slots.toLocaleString()} of its leader slots in epoch ${page.epoch}`
              : `This leader skipped ${rec.skippedSlots.toLocaleString()} of its ${slots.toLocaleString()} leader slots in epoch ${page.epoch}`
            : all
              ? `This leader has skipped all ${slots.toLocaleString()} of its leader slots this epoch`
              : `This leader has skipped ${rec.skippedSlots.toLocaleString()} of its ${slots.toLocaleString()} leader slots this epoch`}
        </span>
        <span>
          {voteMiss
            ? `It's also missing from this slot's vote certificates${missShare != null ? ` (${pct2(missShare)} of stake)` : ''}, so it ${past ? 'was' : 'is'} neither producing nor voting: most likely offline.`
            : past
              ? "It was voting, though: the node was up but its blocks weren't making it."
              : "It is voting, though: the node is up but its blocks aren't making it."}
          {rec.nextWindowSlot != null && (
            <>
              {' '}
              Its next leader slot is{' '}
              <Link
                to={`/slot/${rec.nextWindowSlot}`}
                className="font-monospace"
              >
                {rec.nextWindowSlot.toLocaleString()}
              </Link>
              .
            </>
          )}
        </span>
        {page.leader && (
          <Link to={`/validator/${page.leader}`}>Validator page →</Link>
        )}
      </div>
    </div>
  );
};

/** Tower slots: how fast the cluster voted on it, by stake. */
const TowerVotes = ({
  tower
}: {
  tower: NonNullable<SlotPageData['tower']>;
}) => (
  <SectionCard title="Votes" icon="check-square">
    {tower.noVotes ? (
      <UntrackedState>No votes landed for this slot.</UntrackedState>
    ) : !tower.latencyDistribution?.length ? (
      <UntrackedState>No vote latency data for this slot.</UntrackedState>
    ) : (
      <Table size="sm" className="data-table fs-9 mb-0">
        <thead>
          <tr>
            <th>Vote latency</th>
            <th className="text-end">Stake</th>
          </tr>
        </thead>
        <tbody>
          {tower.latencyDistribution.map(d => (
            <tr key={d.latency}>
              <td>
                {d.latency === 0
                  ? 'Never voted'
                  : `${d.latency} slot${d.latency === 1 ? '' : 's'}`}
              </td>
              <td className="text-end font-monospace">
                {d.stakePct.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    )}
  </SectionCard>
);

export default SlotPage;
