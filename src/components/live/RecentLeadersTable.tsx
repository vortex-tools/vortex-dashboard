import { placeOf } from 'hooks/useValidatorGeo';
import { SlotInfo, ValidatorGeo } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';
import { SLOT_KIND, WINDOW, slotKind } from './slotDots';

const mean = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

/**
 * The latest leader windows up to the playhead, newest first: the
 * leader, where it is, and its four slots as dots colored like the
 * legend (each links to its slot) - with the window's mean
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
    <Table responsive size="sm" className="data-table fs-9 mb-0">
      <thead>
        <tr>
          <th>First slot</th>
          <th>Leader</th>
          <th className="d-none d-md-table-cell">Location</th>
          <th className="text-center" colSpan={WINDOW}>
            Slots
          </th>
          <th
            className="text-end d-none d-sm-table-cell"
            title="Mean notarize stake over the leader's 4 slots played so far"
          >
            Avg Notarize
          </th>
          <th
            className="text-end d-none d-sm-table-cell"
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
          const lagMs = mean(
            played
              .map(i => i.finalization?.lagMs)
              .filter((v): v is number => v != null)
          );
          return (
            <tr key={first} className="vx-row-in">
              <td className="font-monospace">
                <Link to={`/slot/${first}`}>{first.toLocaleString()}</Link>
              </td>
              <td className="text-nowrap">
                {leader ? (
                  <Link to={`/validator/${leader}`}>{nameOf(leader)}</Link>
                ) : (
                  '—'
                )}
              </td>
              <td className="text-nowrap text-body-tertiary d-none d-md-table-cell">
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
                      title={`Slot ${s.toLocaleString()}: ${SLOT_KIND[kind].label}`}
                      aria-label={`Slot ${s}`}
                    />
                  </td>
                );
              })}
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
