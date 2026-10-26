import BucketOutcomeChart from 'components/charts/e-charts/BucketOutcomeChart';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import ConsensusRecordHeader from 'components/validator/ConsensusRecordHeader';
import LiveVoteStrip from 'components/validator/LiveVoteStrip';
import VotingStatCards from 'components/validator/VotingStatCards';
import DivergentSlotsTable, {
  MissCause
} from 'components/validator/DivergentSlotsTable';
import { OFFLINE_RUN_SLOTS, OUTCOME } from 'helpers/participation';
import useRecordBoards from 'hooks/useRecordBoards';
import RecordSummary from 'components/validator/RecordSummary';
import MissedByProducer from 'components/validator/MissedByProducer';
import ProducerMissesTable from 'components/validator/ProducerMissesTable';
import PageSection from 'components/common/PageSection';
import { HoverPath, PathPreview } from 'components/validator/PathPreview';
import { geoAsOf, useValidatorGeoAt } from 'hooks/useValidatorGeo';
import useConsensusRecord from 'hooks/useConsensusRecord';
import {
  VortexDataContext,
  participationHistoryKey
} from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo, useState } from 'react';

/** One share of the eligible slots, for the vote-split bar. */
const share = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);

/**
 * A validator's voting record for one epoch, focused on where it
 * diverged: the voting cards (rank, Votes Landed, Fast Votes, misses,
 * notarize / skip counts) and the split of its eligible slots, the live
 * strip on the current epoch, then the slot timeline (skipped blocks and
 * misses per 1,000 slots), why slots were missed (by the slot + 8
 * producer that would have paid them), and every slot where its vote
 * differs from what the chain did or is missing from the certificates.
 */
const ValidatorDivergentVotes = () => {
  const {
    alpenglowActive,
    cutoverEpoch,
    known,
    unavailable,
    address,
    identity,
    voteAddress,
    recordKey,
    epoch,
    currentEpoch,
    row,
    history,
    historyUnavailable,
    timeline,
    leaderOf
  } = useConsensusRecord();
  // The epoch's boards: rank, cluster medians, each producer's inclusion
  // and names (for missed-by-producer).
  const context = useContext(VortexDataContext);
  const { board, producerBoard } = useRecordBoards(
    alpenglowActive,
    epoch,
    voteAddress
  );
  const producersByNode = useMemo(
    () => new Map((producerBoard?.records ?? []).map(p => [p.nodeAddress, p])),
    [producerBoard]
  );
  const nameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of producerBoard?.records ?? [])
      if (p.nodeName) names.set(p.nodeAddress, p.nodeName);
    for (const r of board?.records ?? [])
      if (r.nodeName) names.set(r.nodeAddress, r.nodeName);
    const dir = context?.validatorDirectoryState.byNodeAddress;
    return (node: string) =>
      names.get(node) ??
      dir?.get(node)?.name ??
      `${node.slice(0, 6)}…${node.slice(-6)}`;
  }, [producerBoard, board, context?.validatorDirectoryState.byNodeAddress]);

  // The API's classification of its misses (404 until the epoch is
  // classified); until then the client-side grouping below.
  const missesSlice = context?.participationMissesState;
  const fetchMisses = missesSlice?.fetchData;
  const mKey =
    epoch != null && recordKey
      ? participationHistoryKey(recordKey, epoch)
      : null;
  const misses = mKey ? missesSlice?.data.get(mKey) : undefined;
  useEffect(() => {
    if (alpenglowActive && mKey) fetchMisses?.(mKey);
  }, [alpenglowActive, mKey, fetchMisses]);

  // Per-slot cause of each miss, from the classification (vortex-data's
  // recipe): offline if in a run of >= the threshold consecutive misses
  // (ineligible slots don't break a run); else 'thin' if the API listed
  // the miss in thinMissSlots (exactly the misses its counts call the
  // payer's fault - a block thin only by this voter's own stake is late);
  // without that field (older epochs), if the slot + 8 block is one of
  // that leader's thin blocks; else late.
  const causeOf = useMemo(() => {
    if (!misses || !timeline || !leaderOf) return null;
    const listed = misses.producers.some(p => p.thinMissSlots != null);
    if (!listed && !misses.producers.some(p => p.thinSlots != null))
      return null;
    const thin = new Map(
      misses.producers.map(p => [p.nodeAddress, new Set(p.thinSlots ?? [])])
    );
    const runMin = misses.thresholds?.offlineSlots ?? OFFLINE_RUN_SLOTS;
    const offline = new Set<number>();
    const { codes, firstSlot } = timeline;
    let run: number[] = [];
    const flush = () => {
      if (run.length >= runMin) run.forEach(s => offline.add(s));
      run = [];
    };
    for (let i = 0; i < codes.length; i++) {
      if (codes[i] === OUTCOME.missed) run.push(firstSlot + i);
      else if (codes[i] !== OUTCOME.ineligible) flush();
    }
    flush();
    // The API's own list, keyed by the missed slot. (Read as payer slots
    // if that's what it holds: those are the misses' slot + 8.)
    let thinMiss: Set<number> | null = null;
    if (listed) {
      const all = misses.producers.flatMap(p => p.thinMissSlots ?? []);
      const isMiss = (s: number) =>
        s >= firstSlot &&
        s - firstSlot < codes.length &&
        codes[s - firstSlot] === OUTCOME.missed;
      const byPayer =
        all.filter(s => isMiss(s - 8)).length > all.filter(isMiss).length;
      thinMiss = new Set(byPayer ? all.map(s => s - 8) : all);
    }
    return (slot: number): MissCause | null => {
      if (offline.has(slot)) return 'offline';
      if (thinMiss) return thinMiss.has(slot) ? 'thin' : 'late';
      const s8 = slot + 8;
      const payer = leaderOf(s8);
      return payer && thin.get(payer)?.has(s8) ? 'thin' : 'late';
    };
  }, [misses, timeline, leaderOf]);

  // The slot a divergent-vote row hovered is about (the path preview).
  // Where each producer was that epoch (today's if the API has none).
  // The epoch's, once known (an unknown epoch would load today's first).
  const geoSet = useValidatorGeoAt(epoch, epoch != null);
  const geo = geoSet?.byNode ?? null;
  const asOf = geoAsOf(geoSet, epoch);
  const [hoverPath, setHoverPath] = useState<HoverPath | null>(null);

  const name = identity?.displayName ?? 'Validator';

  return (
    <div>
      <ConsensusRecordHeader
        address={address}
        name={name}
        nodeAddress={identity?.nodeAddress}
        epoch={epoch}
        currentEpoch={currentEpoch}
        cutoverEpoch={cutoverEpoch}
        page="votes"
      />
      <div className="mb-9">
        {unavailable ? (
          <UntrackedState>The API is unavailable right now.</UntrackedState>
        ) : known && !alpenglowActive ? (
          <UntrackedState>
            Alpenglow isn&apos;t active on this cluster yet.
          </UntrackedState>
        ) : row && !row.admitted && epoch != null ? (
          <RecordSummary row={row} epoch={epoch} voteAddress={voteAddress} />
        ) : (
          <>
            {row && (
              <PageSection>
                <div className="d-flex flex-column gap-3">
                  {epoch != null && epoch === currentEpoch && voteAddress && (
                    <LiveVoteStrip voteKey={recordKey} />
                  )}
                  <VotingStatCards
                    row={row}
                    board={board}
                    voteAddress={voteAddress}
                    epoch={epoch}
                    currentEpoch={currentEpoch}
                  />
                  <VoteSplit row={row} />
                  {timeline && (
                    <SectionCard
                      title="Slot Timeline"
                      icon="bar-chart-2"
                      info={`Skipped blocks and missed slots per 1,000-slot bucket · ${timeline.slots.toLocaleString()} slots ingested`}
                    >
                      <BucketOutcomeChart buckets={timeline.buckets} />
                    </SectionCard>
                  )}
                </div>
              </PageSection>
            )}
            {historyUnavailable ? (
              <UntrackedState>
                The slot timeline isn&apos;t available from this API yet.
              </UntrackedState>
            ) : !history || !timeline ? (
              <DelayedSpinner loading label="Loading votes…" />
            ) : (
              (() => {
                // Divergent Votes, then the misses by payer below it.
                const divergentCard = (
                  <SectionCard
                    title="Divergent Votes"
                    icon="git-branch"
                    info="Every slot where its vote differs from what the chain did, or is missing from the reward certificates (of its reward block, slot + 8)."
                  >
                    {!timeline.clusterKnown && (
                      <UntrackedState className="mb-2">
                        The chain&apos;s per-slot outcome isn&apos;t available
                        from this API yet, so only missed votes are listed
                        (skipped blocks need it).
                      </UntrackedState>
                    )}
                    <DivergentSlotsTable
                      rows={timeline.divergent}
                      leaderOf={leaderOf}
                      selfNode={identity?.nodeAddress ?? null}
                      causeOf={causeOf}
                      onHover={setHoverPath}
                      geo={geo}
                      geoAsOf={asOf}
                    />
                  </SectionCard>
                );
                return misses ? (
                  <div className="d-flex flex-column gap-3">
                    {divergentCard}
                    <SectionCard
                      title="Missed Votes by Reward Leader"
                      icon="users"
                      info="The votes on a slot are rewarded by the block 8 slots later - its reward block - so each miss belongs to that block's leader. One cause per miss: offline, else a Poor reward block, else it didn't get in."
                    >
                      <ProducerMissesTable
                        misses={misses}
                        causes={row?.missCauses}
                        selfNode={identity?.nodeAddress ?? null}
                      />
                    </SectionCard>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {divergentCard}
                    {leaderOf && (
                      <SectionCard
                        title="Missed Slots by Reward Leader"
                        icon="users"
                      >
                        <MissedByProducer
                          codes={timeline.codes}
                          firstSlot={timeline.firstSlot}
                          leaderOf={leaderOf}
                          producers={producersByNode}
                          clusterInclusion={
                            producerBoard?.cluster?.meanIncludedStakePpb != null
                              ? producerBoard.cluster.meanIncludedStakePpb / 1e9
                              : null
                          }
                          selfNode={identity?.nodeAddress ?? null}
                          nameOf={nameOf}
                        />
                      </SectionCard>
                    )}
                  </div>
                );
              })()
            )}
          </>
        )}
      </div>
      <PathPreview
        hover={hoverPath}
        geo={geo}
        voterNode={identity?.nodeAddress ?? null}
        nameOf={nameOf}
      />
    </div>
  );
};

/**
 * Its eligible slots, split: notarize votes landed, skip votes landed
 * (and of those, skipped blocks - a skip on a block the cluster
 * notarized), missed. The ratio at a glance, under the cards.
 */
const VoteSplit = ({
  row
}: {
  row: NonNullable<ReturnType<typeof useConsensusRecord>['row']>;
}) => {
  const of = row.eligibleSlots ?? 0;
  if (of <= 0) return null;
  const parts = [
    {
      label: 'Notarize',
      n: row.notarizedSlots,
      cls: 'bg-success',
      text: 'text-success'
    },
    {
      label: 'Skip',
      n: row.skippedSlots - row.skippedNotarizedSlots,
      cls: 'bg-success-subtle',
      text: 'text-body-secondary'
    },
    {
      label: 'Skipped blocks',
      n: row.skippedNotarizedSlots,
      cls: 'bg-warning',
      text: 'text-warning'
    },
    {
      label: 'Missed',
      n: row.missedSlots,
      cls: 'bg-danger',
      text: 'text-danger'
    }
  ];
  return (
    <div className="bg-body-emphasis rounded border border-translucent p-3">
      <div
        className="d-flex rounded-1 overflow-hidden bg-body-secondary mb-2"
        style={{ height: 12 }}
        aria-hidden
      >
        {parts.map(p => (
          <div
            key={p.label}
            className={p.cls}
            style={{ width: `${share(p.n, of)}%` }}
          />
        ))}
      </div>
      <div className="d-flex flex-wrap column-gap-4 row-gap-1 fs-9">
        {parts.map(p => (
          <span
            key={p.label}
            className="d-inline-flex align-items-center gap-1"
          >
            <span
              className={`d-inline-block rounded-1 ${p.cls}`}
              style={{ width: 10, height: 10 }}
            />
            <span className="text-body-tertiary">{p.label}</span>
            <span className={`font-monospace fw-semibold ${p.text}`}>
              {p.n.toLocaleString()}
            </span>
            <span className="text-body-tertiary font-monospace fs-10">
              {share(p.n, of).toFixed(2)}%
            </span>
          </span>
        ))}
        <span className="text-body-tertiary ms-auto">
          of {of.toLocaleString()} eligible slots
        </span>
      </div>
    </div>
  );
};

export default ValidatorDivergentVotes;
