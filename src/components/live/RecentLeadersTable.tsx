import { NETWORK_TAB } from 'helpers/apiEndpoint';
import { slotText } from 'helpers/slot';
import SlotNumber from 'components/common/SlotNumber';
import { placeOf } from 'hooks/useValidatorGeo';
import ValidatorLink from 'components/common/ValidatorLink';
import { SlotInfo, ValidatorGeo } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';
import {
  SLOT_KIND,
  WINDOW,
  handoffClamped,
  slotKind,
  windowHandoff
} from './slotDots';

/** A handoff slower than this (ms) is tinted: a slot plus ~100 ms. */
const SLOW_HANDOFF_MS = 300;

const mean = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

/**
 * The latest leader windows up to the playhead, newest first: the
 * leader, where it is, and its four slots as dots colored like the
 * legend (each links to its slot) - with its handoff to the next leader
 * (by block times; links to its Network tab), the window's mean
 * notarize stake and finalization. A window's row appears when the
 * playhead enters it and its dots fill as each slot plays.
 */
const RecentLeadersTable = ({
  infos,
  playhead,
  windows,
  geo,
  nameOf
}: {
  infos: Map<number, SlotInfo | null>;
  playhead: number | null;
  /** How many windows to list. */
  windows: number;
  geo: Map<string, ValidatorGeo> | null;
  nameOf: (node: string | null | undefined) => string;
}) => {
  if (playhead == null) return null;
  const head = playhead - (playhead % WINDOW);
  const rows = Array.from({ length: windows }, (_, i) => head - i * WINDOW);
  return (
    // Fixed column widths: a new leader's name doesn't reflow the table
    // each window (names and places are cut short, in full on hover).
    <Table
      responsive
      size="sm"
      className="data-table fs-9 mb-0"
      style={{ tableLayout: 'fixed', minWidth: 580 }}
    >
      <thead>
        <tr>
          <th style={{ width: '7.5rem' }}>First slot</th>
          <th>Leader</th>
          <th className="d-none d-md-table-cell" style={{ width: '24%' }}>
            Location
          </th>
          <th
            className="text-center"
            colSpan={WINDOW}
            style={{ width: WINDOW * 24 }}
          >
            Slots
          </th>
          <th
            className="text-end"
            style={{ width: '6rem' }}
            title={`From this leader's last block to the next leader's first, by the two producers' block times: a slot (~200 ms) plus the network between them. * when a slot either side was skipped (the gap includes it).${NETWORK_TAB ? " Each links to the leader's Network tab." : ''}`}
          >
            Handoff
          </th>
          <th
            className="text-end d-none d-sm-table-cell"
            style={{ width: '7.5rem' }}
            title="Mean notarize stake over the leader's 4 slots played so far"
          >
            Avg Notarize
          </th>
          <th
            className="text-end d-none d-sm-table-cell"
            style={{ width: '7.5rem' }}
            title="Mean time to finalization over the leader's 4 slots' blocks played so far"
          >
            Avg Finalized
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(first => {
          const slots = Array.from({ length: WINDOW }, (_, k) => first + k);
          const leader = slots
            .map(s => infos.get(s)?.leader)
            .find(l => l != null);
          const played = slots
            .filter(s => s <= playhead)
            .map(s => infos.get(s))
            .filter((i): i is SlotInfo => !!i?.outcome);
          const notar = mean(
            played
              .map(i => i.votes?.notarStakePpb)
              .filter((v): v is number => v != null)
          );
          // Its handoff to the next leader, once the next window has
          // played into its first block; none when it leads that too.
          const nextFirst = first + WINDOW;
          const nextLeader = Array.from(
            { length: WINDOW },
            (_, k) => infos.get(nextFirst + k)?.leader
          ).find(l => l != null);
          const sameLeader = !!leader && nextLeader === leader;
          const handoff =
            !sameLeader && playhead >= nextFirst
              ? windowHandoff(nextFirst, infos)
              : null;
          const skipped =
            !!handoff && (handoff.afterSkip || handoff.beforeSkip);
          const handoffTitle = handoff
            ? `${Math.round(handoff.ms)} ms to the next leader${nextLeader ? `, ${nameOf(nextLeader)}` : ''}${skipped ? ' (a skipped slot in between)' : ''}`
            : '';
          const lagMs = mean(
            played
              .map(i => i.finalization?.lagMs)
              .filter((v): v is number => v != null)
          );
          return (
            <tr key={first} className="vx-row-in">
              <td className="font-monospace">
                <Link to={`/slot/${first}`}>
                  <SlotNumber slot={first} />
                </Link>
              </td>
              <td className="text-truncate">
                {leader ? (
                  <ValidatorLink address={leader} title={nameOf(leader)}>
                    {nameOf(leader)}
                  </ValidatorLink>
                ) : (
                  '—'
                )}
              </td>
              <td
                className="text-truncate text-body-tertiary d-none d-md-table-cell"
                title={(leader && placeOf(geo?.get(leader))) || undefined}
              >
                {(leader && placeOf(geo?.get(leader))) ?? '—'}
              </td>
              {slots.map(s => {
                const kind = slotKind(s, infos.get(s), playhead);
                return (
                  <td
                    key={s}
                    className="text-center px-1"
                    style={{ width: 24 }}
                  >
                    <Link
                      to={`/slot/${s}`}
                      className={`d-inline-block rounded-circle ${SLOT_KIND[kind].cls}`}
                      style={{ width: 10, height: 10 }}
                      title={`Slot ${slotText(s)}: ${SLOT_KIND[kind].label}`}
                      aria-label={`Slot ${s}`}
                    />
                  </td>
                );
              })}
              <td className="text-end font-monospace text-nowrap">
                {handoff && leader && !NETWORK_TAB ? (
                  <span
                    className={
                      handoff.ms > SLOW_HANDOFF_MS
                        ? 'text-warning-emphasis'
                        : undefined
                    }
                    title={handoffTitle}
                  >
                    {Math.round(handoff.ms)} ms{skipped ? '*' : ''}
                  </span>
                ) : handoff && leader ? (
                  <Link
                    to={`/validator/${leader}/network`}
                    className={
                      handoff.ms > SLOW_HANDOFF_MS
                        ? 'text-warning-emphasis'
                        : 'text-reset'
                    }
                    title={`${handoffTitle} - its Network tab`}
                  >
                    {Math.round(handoff.ms)} ms{skipped ? '*' : ''}
                  </Link>
                ) : sameLeader ? (
                  <span
                    className="text-body-tertiary"
                    title="It leads the next window too: no handoff"
                  >
                    —
                  </span>
                ) : playhead >= nextFirst &&
                  handoffClamped(nextFirst, infos) ? (
                  <span
                    className="text-body-tertiary"
                    title="A block time either side is clamped (its producer's clock is off): no handoff to time"
                  >
                    ??ms
                  </span>
                ) : (
                  '…'
                )}
              </td>
              <td className="text-end font-monospace d-none d-sm-table-cell">
                {notar != null ? `${(notar / 1e7).toFixed(1)}%` : '…'}
              </td>
              <td className="text-end font-monospace text-nowrap d-none d-sm-table-cell">
                {lagMs != null ? `${Math.round(lagMs)} ms` : '…'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

export default RecentLeadersTable;
