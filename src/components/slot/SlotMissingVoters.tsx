import Button from 'components/base/Button';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  ParticipationLeaderboardRecord,
  SlotPage
} from 'providers/VortexDataProvider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Table } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router';
import { pct2 } from './SlotVotes';

const FIRST_ROWS = 8;
/** Below this (ppb), a share shows as 0.00%: not worth a line. */
const HALF_BP = 50_000;

type Missing = {
  voteAddress: string;
  nodeAddress: string | null;
  stake: number;
};

const clientOf = (rec: ParticipationLeaderboardRecord | undefined) =>
  rec
    ? [rec.softwareBase, rec.softwareVersion].filter(Boolean).join(' ') || null
    : null;

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Online voters left out of a slot's votes - the first rows, all on
 * request, or as a CSV. Offline voters aren't listed (no block could
 * include them). Two views of the same fact, eight slots apart:
 * - `votes`: the votes on this slot, judged by block slot + 8's
 *   certificates (every slot, skipped or not);
 * - `carried`: this block's own accountability - the votes on slot - 8,
 *   which it carries and pays.
 * ?voter=<node or vote address> highlights that voter's row in the list
 * for the votes on ?on=<slot> (default this slot): the Divergent Votes
 * Slot link lands on `votes`, its payer link on the block's `carried`.
 */
const SlotMissingVoters = ({
  which,
  page,
  byVote,
  totalStake,
  nameOf
}: {
  which: 'votes' | 'carried';
  page: SlotPage;
  byVote: Map<string, ParticipationLeaderboardRecord>;
  /** The epoch's total stake (share column denominator). */
  totalStake: number | null;
  nameOf: (node: string | null, vote: string) => string;
}) => {
  const carried = page.alpenglow?.outcome === 'block' ? page.carried : null;
  const votedSlot =
    which === 'votes' ? page.slot : (carried?.rewardSlot ?? page.slot - 8);
  const judge = which === 'votes' ? page.slot + 8 : page.slot;
  // null: not known yet (slot + 8 not in, or not classified).
  const list: Missing[] | null =
    which === 'votes'
      ? (page.missingVoters?.filter(m => !m.offline) ?? null)
      : (carried?.leftOut ?? null);
  const leftOutPpb =
    which === 'votes'
      ? page.missingStakePpb != null
        ? page.missingStakePpb - (page.missingOfflineStakePpb ?? 0)
        : null
      : carried?.leftOutStakePpb;
  const offlinePpb =
    which === 'votes' ? page.missingOfflineStakePpb : carried?.offlineStakePpb;
  const [params] = useSearchParams();
  const on = Number(params.get('on') ?? page.slot);
  const voter = on === votedSlot ? params.get('voter') : null;
  const isVoter = (r: Missing) =>
    !!voter && (r.voteAddress === voter || r.nodeAddress === voter);
  const missing = useMemo(
    () => [...(list ?? [])].sort((a, b) => b.stake - a.stake),
    [list]
  );
  const [all, setAll] = useState(false);
  // A linked voter past the first rows: open the list so it shows (once
  // the list has loaded).
  const voterIndex = voter
    ? missing.findIndex(r => r.voteAddress === voter || r.nodeAddress === voter)
    : -1;
  useEffect(() => {
    if (voterIndex >= FIRST_ROWS) setAll(true);
  }, [voterIndex]);
  // And bring it into view, once.
  const voterRow = useRef<HTMLTableRowElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !voterRow.current) return;
    scrolled.current = true;
    voterRow.current.scrollIntoView({ block: 'center' });
  });

  const share = (stake: number) =>
    totalStake ? `${((stake / totalStake) * 100).toFixed(2)}%` : '—';

  const download = (rows: Missing[]) => {
    const lines = [
      [
        'name',
        'voteAddress',
        'nodeAddress',
        'country',
        'provider',
        'client',
        'stakeSol'
      ].join(','),
      ...rows.map(r => {
        const rec = byVote.get(r.voteAddress);
        return [
          nameOf(r.nodeAddress, r.voteAddress),
          r.voteAddress,
          r.nodeAddress,
          rec?.country,
          rec?.provider,
          clientOf(rec),
          (r.stake / 1e9).toFixed(0)
        ]
          .map(csvCell)
          .join(',');
      })
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join('\n')], { type: 'text/csv' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `slot-${votedSlot}-left-out-voters.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const slotLink = (n: number) => (
    <Link to={`/slot/${n}`} className="font-monospace">
      {n.toLocaleString()}
    </Link>
  );
  const title = (
    <>
      {which === 'votes' ? (
        <>Unrewarded votes on this slot · reward block {slotLink(judge)}</>
      ) : (
        <>Votes this block didn&apos;t reward · on slot {slotLink(votedSlot)}</>
      )}
      {list &&
        missing.length > 0 &&
        `: ${missing.length.toLocaleString()} ${missing.length === 1 ? 'validator' : 'validators'}, ${pct2(leftOutPpb)} of stake`}
    </>
  );

  return (
    <SectionCard title={title} icon="user-x">
      {!list ? (
        <UntrackedState>
          {which === 'votes'
            ? `Not known until block ${judge.toLocaleString()} is in, or it was skipped.`
            : 'Not known yet, or this block carried no reward certificates.'}
        </UntrackedState>
      ) : !missing.length ? (
        <UntrackedState>
          Every online voter&apos;s vote is in block {judge.toLocaleString()}
          &apos;s certificates
          {(offlinePpb ?? 0) >= HALF_BP
            ? ` (${pct2(offlinePpb)} of stake was offline)`
            : ''}
          .
        </UntrackedState>
      ) : (
        <>
          <Table responsive size="sm" className="data-table fs-9 mb-2">
            <thead>
              <tr>
                <th>Validator</th>
                <th>Country</th>
                <th>Provider</th>
                <th>Client</th>
                <th className="text-end">Stake</th>
              </tr>
            </thead>
            <tbody>
              {(all ? missing : missing.slice(0, FIRST_ROWS)).map(r => {
                const rec = byVote.get(r.voteAddress);
                return (
                  <tr
                    key={r.voteAddress}
                    ref={isVoter(r) ? voterRow : undefined}
                    className={
                      isVoter(r) ? 'table-active fw-semibold' : undefined
                    }
                  >
                    <td className="text-nowrap">
                      <Link
                        to={recordPath(
                          r.nodeAddress ?? r.voteAddress,
                          page.epoch,
                          'votes'
                        )}
                      >
                        {nameOf(r.nodeAddress, r.voteAddress)}
                      </Link>
                    </td>
                    <td className="text-nowrap">{rec?.country ?? '—'}</td>
                    <td className="text-nowrap">{rec?.provider ?? '—'}</td>
                    <td className="text-nowrap font-monospace">
                      {clientOf(rec) ?? '—'}
                    </td>
                    <td className="text-end font-monospace">
                      {share(r.stake)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="d-flex flex-wrap align-items-center gap-3 fs-9">
            {(offlinePpb ?? 0) >= HALF_BP && (
              <span className="text-body-tertiary">
                Not listed: {pct2(offlinePpb)} of stake offline
              </span>
            )}
            {missing.length > FIRST_ROWS && (
              <span className="text-body-tertiary">
                Showing {all ? missing.length : FIRST_ROWS} of{' '}
                {missing.length.toLocaleString()}
              </span>
            )}
            {missing.length > FIRST_ROWS && (
              <Button
                variant="link"
                className="p-0 fs-9"
                onClick={() => setAll(a => !a)}
              >
                {all ? 'Show fewer' : 'Show all'}
              </Button>
            )}
            <Button
              variant="link"
              className="p-0 fs-9 ms-auto"
              onClick={() => download(missing)}
            >
              Download list (CSV)
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
};

export default SlotMissingVoters;
