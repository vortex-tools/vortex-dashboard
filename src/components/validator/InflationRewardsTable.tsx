import Pager from 'components/common/Pager';
import UntrackedState from 'components/common/UntrackedState';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import { formatLamports } from 'helpers/utils';
import { EpochEarnings, EpochParticipation } from 'providers/vortex-schemas';
import { useEffect, useMemo, useState } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const PAGE = 10;

const Dash = () => <span className="text-body-quaternary">—</span>;
const sol = (l: number | null | undefined) =>
  l == null ? <Dash /> : formatLamports(l, 2);

type Row = {
  epoch: number;
  alpenglow: boolean;
  voting: number | null;
  production: number | null;
  /** Gross, before commission. */
  total: number | null;
  /** Tower: worked out from the commission and its rate. */
  totalDerived: boolean;
  commission: number | null;
  /** Not paid yet (the epoch in progress): total x its commission rate. */
  commissionDerived: boolean;
  missed: number | null;
};

/**
 * A validator's inflation rewards per epoch, newest first (the current
 * epoch so far), across both eras. Alpenglow epochs (/epochs/participation)
 * split the gross reward into voting and the production bonus, with what
 * missed votes didn't earn. Tower epochs
 * (/epochs/earnings) carry the exact gross (inflationRewardGross) where the
 * API has reconciled it; elsewhere it's worked out from the commission the
 * vote account was paid and its rate (≈).
 * Commission (the validator's cut) for both. Alpenglow epochs link to
 * their Voting tab.
 */
const InflationRewardsTable = ({
  rows,
  earnings,
  cutoverEpoch,
  address,
  currentEpoch
}: {
  /** /epochs/participation for the validator (Alpenglow epochs). */
  rows: EpochParticipation[];
  /** /epochs/earnings for the validator (commission, Tower epochs). */
  earnings: EpochEarnings[] | undefined;
  /** First Alpenglow epoch; earlier earnings rows are Tower. */
  cutoverEpoch: number | null;
  /** The URL's address, for the epoch links. */
  address: string;
  currentEpoch: number | null;
}) => {
  const all = useMemo(() => {
    const byEpoch = new Map<number, Row>();
    const commissionOf = new Map(
      (earnings ?? []).map(e => [e.epoch, e.income.voteAccountReward])
    );
    // Its inflation commission rate per epoch, else the latest known.
    const rateOf = new Map(
      (earnings ?? []).map(e => [
        e.epoch,
        e.rates?.inflationRewardsCommissionBps ?? null
      ])
    );
    const latestRate =
      [...(earnings ?? [])]
        .sort((a, b) => b.epoch - a.epoch)
        .find(e => e.rates?.inflationRewardsCommissionBps != null)?.rates
        ?.inflationRewardsCommissionBps ?? null;
    for (const r of rows) {
      const w = r.rewards;
      // No rewards recorded (not voting, not admitted): still its row, so
      // an idle stretch shows rather than vanishes.
      if (!w) {
        byEpoch.set(r.epoch, {
          epoch: r.epoch,
          alpenglow: true,
          voting: null,
          production: null,
          total: null,
          totalDerived: false,
          commission: commissionOf.get(r.epoch) ?? null,
          commissionDerived: false,
          missed: null
        });
        continue;
      }
      byEpoch.set(r.epoch, {
        epoch: r.epoch,
        alpenglow: true,
        voting: w.votingLamports,
        production: w.producerBonusLamports,
        total:
          w.totalLamports ??
          (w.producerBonusLamports != null
            ? w.votingLamports + w.producerBonusLamports
            : null),
        totalDerived: false,
        commission: null,
        commissionDerived: false,
        missed: w.missedLamports
      });
      // Paid at the epoch's end: until then, the total so far x its rate.
      const row = byEpoch.get(r.epoch)!;
      const paid = commissionOf.get(r.epoch) ?? null;
      const bps = rateOf.get(r.epoch) ?? latestRate;
      if (paid != null) row.commission = paid;
      else if (row.total != null && bps != null) {
        row.commission = (row.total * bps) / 10_000;
        row.commissionDerived = true;
      }
    }
    for (const e of earnings ?? []) {
      if (byEpoch.has(e.epoch)) continue;
      if (cutoverEpoch != null && e.epoch >= cutoverEpoch) continue;
      const commission = e.income.voteAccountReward;
      const bps = e.rates?.inflationRewardsCommissionBps;
      // The API's exact gross where it has it; else worked out from the
      // commission and its rate (≈).
      const exact = e.income.inflationRewardGross ?? null;
      byEpoch.set(e.epoch, {
        epoch: e.epoch,
        alpenglow: false,
        voting: null,
        production: null,
        total:
          exact ??
          (commission != null && bps ? (commission * 10_000) / bps : null),
        totalDerived: exact == null,
        commission,
        commissionDerived: false,
        missed: null
      });
    }
    return [...byEpoch.values()].sort((a, b) => b.epoch - a.epoch);
  }, [rows, earnings, cutoverEpoch]);

  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [address]);
  if (!all.length)
    return (
      <UntrackedState>
        No inflation rewards for this validator yet.
      </UntrackedState>
    );
  const pages = Math.ceil(all.length / PAGE);
  const shown = all.slice(page * PAGE, (page + 1) * PAGE);
  return (
    <>
      <Table responsive size="sm" className="data-table fs-9 mb-0">
        <thead className="text-nowrap">
          <tr>
            <th>Epoch</th>
            <th
              className="text-end d-none d-sm-table-cell"
              title="Alpenglow: its notarize and skip votes in the slots' reward certificates (paid by the slot + 8 leader's block)"
            >
              Voting
            </th>
            <th
              className="text-end d-none d-sm-table-cell"
              title="Alpenglow: the producer bonus, half of every vote its own blocks carried"
            >
              Production
            </th>
            <th
              className="text-end"
              title="Gross, before commission. Tower epochs (≈): worked out from the commission and its rate"
            >
              Total
            </th>
            <th
              className="text-end"
              title="The validator's cut: what the epoch-boundary payout gave the vote account"
            >
              Commission
            </th>
            <th
              className="text-end d-none d-xxl-table-cell"
              title="Alpenglow: its votes not in the reward certificates, unpaid"
            >
              Missed
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map(r => (
            <tr key={r.epoch}>
              <td className="text-nowrap">
                {r.alpenglow ? (
                  <Link to={recordPath(address, r.epoch, 'votes')}>
                    {r.epoch}
                  </Link>
                ) : (
                  r.epoch
                )}
                {r.epoch === currentEpoch && (
                  <span className="text-body-tertiary fs-10 ms-1">
                    (so far)
                  </span>
                )}
                {!r.alpenglow && (
                  <span className="text-body-quaternary fs-10 ms-1">Tower</span>
                )}
              </td>
              <td className="text-end font-monospace d-none d-sm-table-cell">
                {sol(r.voting)}
              </td>
              <td className="text-end font-monospace d-none d-sm-table-cell">
                {sol(r.production)}
              </td>
              <td
                className="text-end font-monospace fw-semibold"
                title={
                  r.totalDerived && r.total != null
                    ? 'Worked out from the commission and its rate'
                    : undefined
                }
              >
                {r.total != null && r.totalDerived && (
                  <span className="text-body-tertiary fw-normal">≈</span>
                )}
                {sol(r.total)}
              </td>
              <td
                className="text-end font-monospace"
                title={
                  r.commissionDerived
                    ? 'Not paid until the epoch ends: the total so far x its commission rate'
                    : undefined
                }
              >
                {r.commission != null && r.commissionDerived && (
                  <span className="text-body-tertiary">≈</span>
                )}
                {sol(r.commission)}
              </td>
              <td
                className={`text-end font-monospace d-none d-xxl-table-cell${r.missed ? ' text-danger' : ''}`}
              >
                {sol(r.missed)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {pages > 1 && (
        <Pager
          page={page}
          pages={pages}
          total={all.length}
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

export default InflationRewardsTable;
