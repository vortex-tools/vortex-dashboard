import LiveSlotStrip, { StripCell } from 'components/live/LiveSlotStrip';
import useValidatorLive from 'hooks/useValidatorLive';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ValidatorLiveSlot } from 'providers/vortex-schemas';
import { useCallback, useContext, useMemo } from 'react';

type Cell = StripCell;

// The record only (the slot + 8 footer): nothing provisional is drawn.
const FINAL: Record<string, Cell> = {
  notarize: { cls: 'bg-success', label: 'notarize vote landed' },
  // A skip vote on a skipped slot is as valid as a notarize: a green
  // ring around an empty (skipped) slot.
  skip: {
    cls: 'bg-body-emphasis border border-2 border-success',
    label: 'skip vote landed (slot skipped)'
  },
  skippedBlock: {
    cls: 'bg-warning',
    label: 'skipped block: voted skip on a notarized block (paid)'
  },
  missed: { cls: 'bg-danger', label: 'missed: in neither reward certificate' },
  // Nothing to land in (the slot + 8 block was skipped): not the
  // validator's miss, so a light gray-green, not gray or red.
  unpayable: {
    cls: 'bg-vote-unrewardable',
    label: 'unrewardable: no reward certificate (slot + 8 skipped)'
  },
  noData: { cls: 'bg-body-secondary opacity-50', label: 'no data' }
};
const NOT_ELIGIBLE: Cell = {
  cls: 'border border-translucent opacity-50',
  label: 'not eligible'
};

const recordOf = (s: ValidatorLiveSlot | undefined): Cell | null => {
  if (!s) return null;
  if (s.state === 'notEligible') return NOT_ELIGIBLE;
  if (s.state === 'final' && s.final && FINAL[s.final]) return FINAL[s.final];
  return null;
};

const LEGEND: Array<[string, string]> = [
  ['bg-success', 'notarize'],
  [FINAL.skip.cls, 'skip'],
  ['bg-warning', 'skipped block'],
  ['bg-danger', 'missed'],
  ['bg-vote-unrewardable', 'unrewardable']
];

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * One validator's votes, live, from the record only
 * (/consensus/validator/live's final rows - the slot + 8 footers), on the
 * shared live slot strip: a column per leader window, newest at the left,
 * revealed at block pace. Nothing in flight / provisional is drawn.
 * Current epoch only.
 */
const LiveVoteStrip = ({ voteKey }: { voteKey: string }) => {
  const context = useContext(VortexDataContext);
  const { slots, meta, status } = useValidatorLive(voteKey, true);
  const progress = context?.currentEpochState.progress;
  const slotMs = Math.round((progress?.slotSeconds ?? 0.4) * 1000);
  // Leader windows start every 4 slots from the epoch's first slot.
  const epochStart =
    progress?.absoluteSlot != null && progress.slotIndex != null
      ? progress.absoluteSlot - progress.slotIndex
      : 0;
  const bySlot = useMemo(() => new Map(slots.map(s => [s.slot, s])), [slots]);
  const cellOf = useCallback((s: number) => recordOf(bySlot.get(s)), [bySlot]);
  const leaderOf = useCallback(
    (s: number) => bySlot.get(s)?.leader ?? null,
    [bySlot]
  );
  const dir = context?.validatorDirectoryState.byNodeAddress;
  const nameOf = useCallback(
    (node: string | null) =>
      node ? (dir?.get(node)?.name ?? short(node)) : null,
    [dir]
  );

  if (status !== 'ok' && status !== 'loading') return null;
  return (
    <LiveSlotStrip
      recorded={meta?.finalThroughSlot ?? null}
      oldest={slots.length ? slots[0].slot : null}
      epochStart={epochStart}
      slotMs={slotMs}
      cellOf={cellOf}
      leaderOf={leaderOf}
      nameOf={nameOf}
      label="Live votes"
      legend={LEGEND}
      footnote="The record, replayed at block pace"
      footnoteTitle="Only what the chain recorded: each slot's votes from the reward certificates in the block 8 slots later, replayed one per slot-time a little behind the chain."
    />
  );
};

export default LiveVoteStrip;
