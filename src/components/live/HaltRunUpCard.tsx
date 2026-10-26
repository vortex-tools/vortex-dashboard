import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import { clientBase, clientFork } from 'helpers/clients';
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
 * While halted (/cluster/halt): Before the Halt - the last finalized
 * block and the final slots one by one (leader, its client, notarize
 * stake, finalization lag) - and Voting at the End, who was still voting
 * in the last block whose votes landed. Votes for the last few slots are
 * often missing: they'd have landed in blocks that never came.
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
  // Who voted (and didn't) by base client, flavor, then version; groups
  // under 1% of stake left out.
  const MIN_PPB = 1e7;
  const voters = (() => {
    if (!fv) return [];
    const rows = [
      ...fv.voted.map(g => ({ ...g, voted: true })),
      ...fv.missing.map(g => ({ ...g, voted: false }))
    ].map(g => ({
      ...g,
      base: g.client ? clientBase(g.client) : 'Not in gossip',
      flavor: g.client ? (clientFork(g.client) ?? 'plain') : ''
    }));
    const baseStake = new Map<string, number>();
    const flavorStake = new Map<string, number>();
    for (const g of rows) {
      baseStake.set(g.base, (baseStake.get(g.base) ?? 0) + g.stakePpb);
      const k = `${g.base}/${g.flavor}`;
      flavorStake.set(k, (flavorStake.get(k) ?? 0) + g.stakePpb);
    }
    return rows
      .filter(g => g.stakePpb >= MIN_PPB)
      .sort(
        (a, b) =>
          (baseStake.get(b.base) ?? 0) - (baseStake.get(a.base) ?? 0) ||
          (flavorStake.get(`${b.base}/${b.flavor}`) ?? 0) -
            (flavorStake.get(`${a.base}/${a.flavor}`) ?? 0) ||
          (b.version ?? '').localeCompare(a.version ?? '', undefined, {
            numeric: true
          }) ||
          Number(b.voted) - Number(a.voted)
      );
  })();
  const hidden = fv ? fv.voted.length + fv.missing.length - voters.length : 0;
  return (
    <>
      <SectionCard
        title="Last Slots"
        icon="list"
        info="The last finalized block, then the final slots before the halt, newest first: the leader, its client (from the block footer), the stake that notarized the block, and how many slots its finalization took. Votes for a slot arrive in slot + 8's block, so the last few slots before a halt often have none."
      >
        <p className="fs-9 mb-3">
          {halt.finalizedSlot != null ? (
            <>
              Last finalized block{' '}
              <Link
                to={`/slot/${halt.finalizedSlot}`}
                className="font-monospace"
              >
                {halt.finalizedSlot.toLocaleString()}
              </Link>
              .{' '}
            </>
          ) : null}
          <span className="text-body-tertiary">
            {data.blocks.toLocaleString()} blocks and{' '}
            {data.skipped.toLocaleString()} skipped in the {window} slots before
            {data.lastBlockSlot != null &&
              (halt.finalizedSlot == null ||
                data.lastBlockSlot < halt.finalizedSlot) && (
                <>
                  {' '}
                  {` - our block data ends at ${data.lastBlockSlot.toLocaleString()}: block ${halt.finalizedSlot?.toLocaleString()} is finalized but not yet in our block data`}
                </>
              )}
            .
          </span>
        </p>
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
          title="Before the Halt"
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
                <th>Base</th>
                <th>Flavor</th>
                <th>Version</th>
                <th>Vote</th>
                <th className="text-end">Validators</th>
                <th className="text-end">Stake</th>
              </tr>
            </thead>
            <tbody>
              {voters.map((g, i) => {
                const prev = voters[i - 1];
                const newBase = !prev || prev.base !== g.base;
                const newFlavor = newBase || prev.flavor !== g.flavor;
                return (
                  <tr key={`${g.voted}-${g.client}-${g.version}`}>
                    <td className="fw-semibold">{newBase ? g.base : ''}</td>
                    <td className="text-body-secondary">
                      {newFlavor ? g.flavor : ''}
                    </td>
                    <td className="font-monospace">{g.version ?? '—'}</td>
                    <td>
                      <span
                        className={`badge badge-soft badge-soft-${g.voted ? 'success' : 'warning'}`}
                      >
                        {g.voted ? 'voted' : 'missing'}
                      </span>
                    </td>
                    <td className="text-end font-monospace">{g.validators}</td>
                    <td className="text-end font-monospace">
                      {ppb(g.stakePpb)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {hidden > 0 && (
            <p className="fs-10 text-body-tertiary mt-2 mb-0">
              {hidden} groups under 1% of stake aren&apos;t listed.
            </p>
          )}
        </SectionCard>
      )}
    </>
  );
};

export default HaltRunUpCard;
