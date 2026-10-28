import FeatherIcon from 'feather-icons-react';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import Badge from 'components/base/Badge';
import SectionCard from 'components/common/SectionCard';
import { SlotInfo } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const WINDOW = 4;

const pct = (ppb: number | null | undefined) =>
  ppb == null ? '—' : `${(ppb / 1e7).toFixed(1)}%`;

const OUTCOME: Record<
  string,
  { bg: 'primary' | 'warning' | 'secondary'; label: string }
> = {
  block: { bg: 'primary', label: 'Block' },
  skipped: { bg: 'warning', label: 'Skipped' },
  noData: { bg: 'secondary', label: 'No data' }
};

/** By a live card's title while hovering holds playback. */
export const PausedBadge = () => (
  <span
    className="badge badge-soft badge-soft-primary ms-2"
    title="Playback is held while the pointer is over the leader sections; move away to resume"
  >
    <FeatherIcon icon="pause" size={10} className="me-1" />
    Paused
  </span>
);

/**
 * The leader window under the playhead: its leader in the title, then a
 * row per slot (outcome, notarize / skip stake in the reward
 * certificates, finalization) - the playing slot highlighted, slots not
 * yet played shown as pending. The window stays for four ticks, so it's
 * easier to follow than one slot flashing by. The transport controls are
 * the page's PlaybackBar.
 */
const SlotPlayer = ({
  held = false,
  slot,
  infoOf,
  nameOf
}: {
  /** Playback held while the pointer is over the leader sections. */
  held?: boolean;
  slot: number | null;
  infoOf: (slot: number) => SlotInfo | null | undefined;
  nameOf: (node: string | null | undefined) => string;
}) => {
  // Leader windows are 4-slot aligned (epochs start on a multiple of 4).
  const first = slot != null ? slot - (slot % WINDOW) : null;
  const slots =
    first != null
      ? Array.from({ length: WINDOW }, (_, i) => first + WINDOW - 1 - i)
      : []; // newest first
  const leader = slots.map(s => infoOf(s)?.leader).find(l => l != null) ?? null;

  return (
    <SectionCard
      title={
        leader ? (
          <>
            Current Leader ·{' '}
            <Link to={`/validator/${leader}`}>{nameOf(leader)}</Link>
          </>
        ) : (
          'Current Leader'
        )
      }
      icon="user"
      // A long leader name truncates; the link stays on the line.
      truncateTitle
      highlight={held}
      badge={held ? <PausedBadge /> : undefined}
      linkTo={leader ? recordPath(leader, null, 'blocks') : undefined}
      linkLabel="Production record"
    >
      <Table responsive size="sm" className="data-table fs-9 mb-0">
        <thead>
          <tr>
            <th style={{ width: '1.5rem' }} />
            <th>Slot</th>
            <th>Outcome</th>
            <th className="d-none d-md-table-cell" style={{ width: '35%' }}>
              Votes
            </th>
            <th className="text-end d-none d-sm-table-cell">Notarize</th>
            <th className="text-end d-none d-sm-table-cell">Skip</th>
            <th className="text-end">Finalized</th>
          </tr>
        </thead>
        <tbody>
          {slots.map(s => {
            const played = slot != null && s <= slot;
            const current = s === slot;
            const info = played ? infoOf(s) : undefined;
            const o = info?.outcome ? OUTCOME[info.outcome] : null;
            const v = info?.votes;
            const f = info?.finalization;
            return (
              <tr
                key={s}
                className={current ? 'table-active' : undefined}
                style={{ opacity: played ? 1 : 0.4 }}
              >
                <td className="text-primary">
                  {current && <FeatherIcon icon="play" size={10} />}
                </td>
                <td className="font-monospace">
                  <Link to={`/slot/${s}`}>{s.toLocaleString()}</Link>
                </td>
                <td>
                  {o ? (
                    <Badge variant="soft" bg={o.bg}>
                      {o.label}
                    </Badge>
                  ) : (
                    <span className="text-body-tertiary">…</span>
                  )}
                </td>
                <td className="align-middle d-none d-md-table-cell">
                  <div
                    className="d-flex rounded-1 overflow-hidden bg-body-secondary"
                    style={{ height: 8 }}
                    aria-hidden
                  >
                    {v?.notarStakePpb != null && (
                      <div
                        className="bg-primary"
                        style={{ width: `${v.notarStakePpb / 1e7}%` }}
                      />
                    )}
                    {v?.skipStakePpb != null && (
                      <div
                        className="bg-warning"
                        style={{ width: `${v.skipStakePpb / 1e7}%` }}
                      />
                    )}
                  </div>
                </td>
                <td className="text-end font-monospace d-none d-sm-table-cell">
                  {info ? (v ? pct(v.notarStakePpb) : '…') : '…'}
                </td>
                <td className="text-end font-monospace d-none d-sm-table-cell">
                  {info ? (v ? pct(v.skipStakePpb) : '…') : '…'}
                </td>
                <td
                  className="text-end font-monospace text-nowrap"
                  title={
                    f?.lagSlots != null
                      ? `${f.directPath ? `${f.directPath} path · ` : ''}lag ${f.lagSlots} ${f.lagSlots === 1 ? 'slot' : 'slots'}`
                      : undefined
                  }
                >
                  {f?.lagSlots != null
                    ? f.lagMs != null
                      ? `${f.lagMs.toLocaleString()} ms`
                      : `${f.lagSlots} ${f.lagSlots === 1 ? 'slot' : 'slots'}`
                    : info?.outcome === 'block'
                      ? '…'
                      : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </SectionCard>
  );
};

export default SlotPlayer;
