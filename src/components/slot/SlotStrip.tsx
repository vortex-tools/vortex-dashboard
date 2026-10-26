import { SlotInfo } from 'providers/VortexDataProvider';
import { ReactNode } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

export const STRIP_WINDOWS_BEFORE = 2;
export const STRIP_WINDOWS = 5;
export const WINDOW_SLOTS = 4;

/** The strip's slots: two leader windows either side of the slot's own. */
export const stripSlots = (windowFirst: number) =>
  Array.from(
    { length: STRIP_WINDOWS * WINDOW_SLOTS },
    (_, i) => windowFirst - STRIP_WINDOWS_BEFORE * WINDOW_SLOTS + i
  );

const CELL: Record<string, { cls: string; label: string }> = {
  fast: { cls: 'bg-primary', label: 'fast-finalized' },
  block: { cls: 'bg-primary opacity-50', label: 'other finalization' },
  skipped: { cls: 'bg-warning', label: 'skipped' },
  noData: { cls: 'bg-body-secondary', label: 'no data' }
};
const PENDING = {
  cls: 'bg-body-highlight border border-translucent',
  label: 'not yet'
};

/** Reward links: block S + 8 rewards the votes on S. */
const REWARD_OFFSET = 8;
const DASHED = '2px dashed var(--vx-emphasis-color)';

const Legend = ({ cls, label }: { cls: string; label: string }) => (
  <span className="d-inline-flex align-items-center gap-1">
    <span
      className={`d-inline-block rounded-1 ${cls}`}
      style={{ width: 10, height: 10 }}
    />
    {label}
  </span>
);

const RewardLegend = ({ children }: { children: ReactNode }) => (
  <span className="d-inline-flex align-items-center gap-1">
    <span
      className="d-inline-block rounded-1"
      style={{ width: 10, height: 10, border: DASHED }}
    />
    <span>{children}</span>
  </span>
);

/**
 * "Around this slot": five 4-slot leader windows as striped rows, newest
 * first, each with its offset in slots from the slot's own window (in the
 * middle, the active row) - each its leader,
 * slot range and one cell per slot colored by what the chain did, the
 * slot itself ringed. Dashed: the block that rewards the votes on this
 * slot (+8) and, for a block, the slot whose votes it rewards (-8).
 * Every cell links to its slot.
 */
const SlotStrip = ({
  slot,
  windowFirst,
  infos,
  nameOf
}: {
  slot: number;
  windowFirst: number;
  infos: Map<number, SlotInfo | null>;
  nameOf: (node: string) => string;
}) => {
  const slots = stripSlots(windowFirst);
  const rewardedIn = slot + REWARD_OFFSET;
  const rewards =
    infos.get(slot)?.outcome === 'block' ? slot - REWARD_OFFSET : null;
  // Newest first (as the live page's Recent Leaders), each row's offset
  // from the slot's own window making the order plain.
  const windows = Array.from({ length: STRIP_WINDOWS }, (_, w) =>
    slots.slice(w * WINDOW_SLOTS, (w + 1) * WINDOW_SLOTS)
  ).reverse();
  return (
    <>
      <Table borderless striped className="fs-9 mb-0">
        <tbody>
          {windows.map(w => {
            const leader = infos.get(w[0])?.leader;
            const own = w[0] === windowFirst;
            return (
              <tr key={w[0]} className={own ? 'table-active' : undefined}>
                <td
                  className={`py-2 ps-2 pe-0 align-middle font-monospace fs-10 text-nowrap ${own ? 'fw-bold text-body-emphasis' : 'text-body-tertiary'}`}
                  style={{ width: '3.25rem' }}
                  title={
                    own
                      ? "This slot's leader window"
                      : `${Math.abs(w[0] - windowFirst)} slots ${w[0] > windowFirst ? 'later' : 'earlier'}`
                  }
                >
                  {own
                    ? ''
                    : `${w[0] > windowFirst ? '+' : '−'}${Math.abs(w[0] - windowFirst)}`}
                </td>
                <td
                  className="py-2 ps-2 align-middle text-truncate"
                  style={{ maxWidth: 0, width: '38%' }}
                >
                  {leader ? (
                    <Link
                      to={`/validator/${leader}`}
                      className={own ? 'fw-bold' : undefined}
                      title={`Leader: ${nameOf(leader)}`}
                    >
                      {nameOf(leader)}
                    </Link>
                  ) : (
                    <span className="text-body-tertiary">—</span>
                  )}
                </td>
                <td
                  className="py-2 align-middle font-monospace fs-10 text-body-tertiary text-nowrap"
                  title={`Slots ${w[0].toLocaleString()}–${w[w.length - 1].toLocaleString()}`}
                >
                  {w[0].toLocaleString()}–{String(w[w.length - 1]).slice(-3)}
                </td>
                <td className="py-2 pe-2 align-middle" style={{ width: '40%' }}>
                  {/* Padding so the slot's ring isn't clipped. */}
                  <div className="d-flex gap-1 p-1">
                    {w.map(s => {
                      const info = infos.get(s);
                      const mark =
                        s === rewardedIn
                          ? `reward block for ${slot.toLocaleString()}`
                          : s === rewards
                            ? `its votes are rewarded in ${slot.toLocaleString()}`
                            : null;
                      // Fast-finalized blocks solid; other finalization
                      // (slow path / via a later block) faded.
                      const c =
                        (info?.outcome === 'block' &&
                        info.finalization?.directPath === 'fast'
                          ? CELL.fast
                          : info?.outcome && CELL[info.outcome]) || PENDING;
                      return (
                        <Link
                          key={s}
                          to={`/slot/${s}`}
                          className={`d-block flex-grow-1 rounded-1 ${c.cls}`}
                          style={{
                            flexBasis: 0,
                            height: 16,
                            outline:
                              s === slot
                                ? '2px solid var(--vx-emphasis-color)'
                                : mark
                                  ? DASHED
                                  : undefined,
                            outlineOffset: 2
                          }}
                          title={`Slot ${s.toLocaleString()}: ${c.label}${mark ? ` · ${mark}` : ''}`}
                          aria-label={`Slot ${s}: ${c.label}`}
                        />
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <div className="d-flex flex-wrap column-gap-3 row-gap-1 fs-10 text-body-tertiary mt-2 px-2">
        <Legend {...CELL.fast} />
        <Legend {...CELL.block} />
        <Legend {...CELL.skipped} />
        <Legend {...CELL.noData} />
      </div>
      <div className="d-flex flex-wrap column-gap-3 row-gap-1 fs-10 text-body-tertiary mt-1 px-2">
        <RewardLegend>
          <Link to={`/slot/${rewardedIn}`} className="font-monospace">
            {rewardedIn.toLocaleString()}
          </Link>{' '}
          reward block for this slot
        </RewardLegend>
        {rewards != null && (
          <RewardLegend>
            this block rewards{' '}
            <Link to={`/slot/${rewards}`} className="font-monospace">
              {rewards.toLocaleString()}
            </Link>
          </RewardLegend>
        )}
      </div>
    </>
  );
};

/** For a skipped slot, one line on where the chain went around it. */
export const stripCaption = (
  slot: number,
  windowFirst: number,
  infos: Map<number, SlotInfo | null>
) => {
  const slots = stripSlots(windowFirst);
  if (infos.get(slot)?.outcome === 'skipped') {
    const before = [...slots]
      .reverse()
      .find(s => s < slot && infos.get(s)?.outcome === 'block');
    const after = slots.find(
      s => s > slot && infos.get(s)?.outcome === 'block'
    );
    const win = slots.filter(
      s => s >= windowFirst && s < windowFirst + WINDOW_SLOTS
    );
    const wholeWindow = win.every(s => infos.get(s)?.outcome === 'skipped');
    return `${
      wholeWindow
        ? `None of the leader's ${win.length} slots ${win[0].toLocaleString()}–${win[win.length - 1].toLocaleString()} has a block`
        : 'No block for this slot'
    }${
      before != null && after != null
        ? `: the chain went from ${before.toLocaleString()} to ${after.toLocaleString()}`
        : ''
    }.`;
  }
  return null;
};

export default SlotStrip;
