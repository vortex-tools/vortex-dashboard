import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import { clientLabel } from 'helpers/clients';
import { parseUserAgent } from 'helpers/userAgent';
import { ClusterHalt } from 'hooks/useIngestion';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const ppb = (v: number | null | undefined) =>
  v == null ? '—' : `${(v / 1e7).toFixed(1)}%`;
const LAST_SLOTS = 16;

/**
 * While halted: what the last 300 slots before the halt looked like
 * (/cluster/halt) - blocks, skips and finalization every 25 slots, the
 * final slots one by one (leader, its client, notarize stake), and who
 * was still voting at the end. Votes for the last few slots are often
 * missing: they'd have landed in blocks that never came.
 */
const HaltRunUpCard = ({
  halt,
  nameOf
}: {
  halt: ClusterHalt;
  nameOf: (node: string | null | undefined) => string;
}) => {
  const context = useContext(VortexDataContext);
  const fetchData = context?.clusterHaltState.fetchData;
  const data = context?.clusterHaltState.data.get(halt.slot);
  useEffect(() => {
    fetchData?.(halt.slot);
  }, [halt.slot, fetchData]);
  if (!data)
    return context?.clusterHaltState.error ? null : (
      <SectionCard title="Before the Halt" icon="activity">
        <UntrackedState>Loading the last slots…</UntrackedState>
      </SectionCard>
    );

  const last = data.slots.slice(-LAST_SLOTS).reverse();
  const fv = data.finalVoters;
  const window = data.endSlot - data.startSlot + 1;
  // The largest voting groups, then every group that didn't vote.
  const VOTED_ROWS = 10;
  const voters = fv
    ? [
        ...fv.voted.slice(0, VOTED_ROWS).map(g => ({ ...g, voted: true })),
        ...fv.missing.map(g => ({ ...g, voted: false }))
      ]
    : [];
  const moreVoted = fv ? Math.max(0, fv.voted.length - VOTED_ROWS) : 0;
  return (
    <>
      <SectionCard
        title="Before the Halt"
        icon="activity"
        info="The last slots before the chain stopped, from the block footers: every 25 slots, the blocks, skips, blocks finalized and the mean stake in each notarization."
      >
        <p className="fs-9 mb-3">
          Last block{' '}
          <Link to={`/slot/${data.lastBlockSlot}`} className="font-monospace">
            {data.lastBlockSlot?.toLocaleString() ?? '—'}
          </Link>
          , last finalized{' '}
          <span className="font-monospace">
            {data.lastFinalizedSlot?.toLocaleString() ?? '—'}
          </span>
          .{' '}
          <span className="text-body-tertiary">
            {data.blocks.toLocaleString()} blocks and{' '}
            {data.skipped.toLocaleString()} skipped in the {window} slots
            before.
          </span>
        </p>
        <Table
          size="sm"
          responsive
          className="data-table compact-rows fs-9 mb-0 text-nowrap"
        >
          <thead>
            <tr>
              <th>Every 25 slots, from</th>
              <th className="text-end">Blocks</th>
              <th className="text-end">Skipped</th>
              <th className="text-end">Finalized</th>
              <th className="text-end">Notarize stake</th>
            </tr>
          </thead>
          <tbody>
            {[...data.trend].reverse().map(t => (
              <tr key={t.firstSlot}>
                <td className="font-monospace">
                  {t.firstSlot.toLocaleString()}
                </td>
                <td className="text-end font-monospace">{t.blocks}</td>
                <td
                  className={`text-end font-monospace${t.skipped ? ' text-warning' : ''}`}
                >
                  {t.skipped}
                </td>
                <td className="text-end font-monospace">{t.finalized}</td>
                <td className="text-end font-monospace">
                  {ppb(t.meanNotarStakePpb)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard
        title="Last Slots"
        icon="list"
        info="The final slots before the halt, newest first: the leader, its client (from the block footer), the stake that notarized the block, and how many slots its finalization took. Votes for a slot arrive in slot + 8's block, so the last few slots before a halt often have none."
      >
        <Table
          size="sm"
          responsive
          className="data-table compact-rows fs-9 mb-0 text-nowrap"
        >
          <thead>
            <tr>
              <th>Slot</th>
              <th>Leader</th>
              <th>Client</th>
              <th className="text-end">Notarize</th>
              <th
                className="text-end"
                title="Slots from the block to its finalization"
              >
                Finalized
              </th>
            </tr>
          </thead>
          <tbody>
            {last.map(s => (
              <tr key={s.slot}>
                <td>
                  <Link to={`/slot/${s.slot}`} className="font-monospace">
                    {s.slot.toLocaleString()}
                  </Link>
                  {s.outcome && s.outcome !== 'block' && (
                    <span className="badge badge-soft badge-soft-warning ms-2">
                      {s.outcome}
                    </span>
                  )}
                </td>
                <td className="text-truncate" style={{ maxWidth: '14rem' }}>
                  {s.leader ? (
                    <Link to={`/validator/${s.leader}`}>
                      {nameOf(s.leader)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="text-body-secondary">
                  {s.userAgent ? parseUserAgent(s.userAgent).label : '—'}
                </td>
                <td className="text-end font-monospace">
                  {ppb(s.notarStakePpb)}
                </td>
                <td className="text-end font-monospace">
                  {s.finalizationLagSlots != null
                    ? `+${s.finalizationLagSlots}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {fv && (
        <SectionCard
          title="Voting at the End"
          icon="users"
          info="In the last block whose votes landed (its slot + 8 carried the reward certificates): the stake that voted, and the stake in neither certificate, by client and version. Clients and versions are what gossip reports now, not at the halt: a validator that has restarted on new software shows it."
        >
          <p className="fs-9 mb-3">
            Slot{' '}
            <Link to={`/slot/${fv.slot}`} className="font-monospace">
              {fv.slot.toLocaleString()}
            </Link>
            : <span className="fw-semibold">{ppb(fv.votedStakePpb)}</span> of
            stake voted, {ppb(fv.missingStakePpb)} missing.
          </p>
          <Table
            size="sm"
            responsive
            className="data-table compact-rows fs-9 mb-0 text-nowrap"
          >
            <thead>
              <tr>
                <th>Client</th>
                <th>Version</th>
                <th>Vote</th>
                <th className="text-end">Validators</th>
                <th className="text-end">Stake</th>
              </tr>
            </thead>
            <tbody>
              {voters.map(g => (
                <tr key={`${g.voted}-${g.client}-${g.version}`}>
                  <td>{g.client ? clientLabel(g.client) : 'Not in gossip'}</td>
                  <td className="font-monospace text-body-secondary">
                    {g.version ?? '—'}
                  </td>
                  <td>
                    <span
                      className={`badge badge-soft badge-soft-${g.voted ? 'success' : 'warning'}`}
                    >
                      {g.voted ? 'voted' : 'missing'}
                    </span>
                  </td>
                  <td className="text-end font-monospace">{g.validators}</td>
                  <td className="text-end font-monospace">{ppb(g.stakePpb)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {moreVoted > 0 && (
            <p className="fs-10 text-body-tertiary mt-2 mb-0">
              {moreVoted} smaller groups that voted aren&apos;t listed.
            </p>
          )}
        </SectionCard>
      )}
    </>
  );
};

export default HaltRunUpCard;
