import Pager from 'components/common/Pager';
import ValidatorLink from 'components/common/ValidatorLink';
import { MissCauses, ParticipationMisses } from 'providers/vortex-schemas';
import { useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { neverReaches } from './Unreachable';

type Producer = ParticipationMisses['producers'][number];

const PAGE = 12;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

/** "offline 0 · producer's fault 45 · didn't get in 9" - a missCauses
 *  split, in words. */
export const missCausesLine = (mc: MissCauses | null | undefined) =>
  mc
    ? `offline ${mc.offlineSlots.toLocaleString()} · poor reward block ${mc.thinBlockSlots.toLocaleString()} · didn't get in ${mc.lateSlots.toLocaleString()}`
    : null;

const missedWith = (p: Producer) => p.thinBlockSlots + p.lateSlots;
/** Its votes this producer's reward certificates did carry: the
 *  producer's slots while it was online, less its misses there. */
const landedWith = (p: Producer) =>
  p.slots != null ? Math.max(0, p.slots - missedWith(p)) : null;

/** Pairs it misses (nearly) every block of: the API's verdict, else
 *  missed >= 90% of their slots (offline runs are already excluded). */
const flagged = (p: Producer) =>
  p.unreachable ?? (p.slots != null && neverReaches(missedWith(p), p.slots));

const thinShareText = (misses: ParticipationMisses) =>
  misses.thresholds?.thinShare != null
    ? `${(misses.thresholds.thinShare * 100).toFixed(0)}%+`
    : 'many';

/** A flagged pair (missed 90%+ of a producer's blocks), by which side
 *  it points at: mostly "didn't get in" -> the path between the two; mostly
 *  the producer's Poor blocks -> the producer, which leaves many out. */
const pairKind = (p: Producer) =>
  p.lateSlots >= p.thinBlockSlots ? 'cantReach' : 'poorProducer';

const PairBadge = ({ kind }: { kind: 'cantReach' | 'poorProducer' }) =>
  kind === 'cantReach' ? (
    <span
      className="badge badge-soft badge-soft-danger ms-2"
      title="Its votes missed 90%+ of this reward leader's blocks while other voters got in: a broken path between the two - peering, firewall, region"
    >
      Can&apos;t reach
    </span>
  ) : (
    <span
      className="badge badge-soft badge-soft-warning ms-2"
      title="Its votes missed 90%+ of this reward leader's blocks, mostly Poor blocks that left many voters out: the leader's doing"
    >
      Poor reward leader
    </span>
  );

/**
 * Why a voter's slots were missed, from the API's classification. The
 * votes on slot S are carried (and paid) by the block at S + 8, so each
 * miss belongs to that block's producer and has one cause: offline (a run
 * of 32+ misses), the producer's fault (a Poor block, leaving 2%+ of the
 * online stake out besides this voter), else its vote didn't get in where
 * others' did. A plain-words line, the split, then by producer - flagging
 * pairs where it misses (nearly) every block: "Can't reach" (path) vs
 * "Poor producer" (the producer's doing).
 */
const ProducerMissesTable = ({
  misses,
  causes,
  selfNode
}: {
  misses: ParticipationMisses;
  /** The epoch's missCauses (lamports), when the summary carries them. */
  causes: MissCauses | null | undefined;
  selfNode: string | null;
}) => {
  const thinPct = thinShareText(misses);
  // Every payer it missed with (most misses first), a page at a time.
  const all = misses.producers;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [misses]);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const top = all.slice(page * PAGE, (page + 1) * PAGE);
  return (
    <>
      {!top.length ? (
        <p className="fs-9 text-body-tertiary mb-0">
          No missed votes outside offline runs.
        </p>
      ) : (
        <Table responsive size="sm" className="data-table fs-9 mb-2">
          <thead>
            <tr>
              <th title="The leader of slot + 8, whose block (the reward block) carries and rewards the votes">
                Reward leader
              </th>
              <th
                className="text-end"
                title="Its votes this leader's reward blocks carried (of its slots while it was online)"
              >
                Landed
              </th>
              <th
                className="text-end"
                title="Its missed votes in this leader's reward blocks"
              >
                Missed
              </th>
              <th
                className="text-end"
                title={`In this leader's Poor reward blocks - blocks that left ${thinPct} of the online stake out besides this voter`}
              >
                Poor reward block
              </th>
              <th
                className="text-end"
                title="In this leader's other reward blocks: other voters got in, this one didn't"
              >
                Didn&apos;t get in
              </th>
              <th
                className="text-end"
                title="How many of the leader's blocks were Poor (under 98% of the online stake) / its blocks this epoch"
              >
                Leader&apos;s Poor blocks
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map(p => (
              <tr key={p.nodeAddress}>
                <td className="text-nowrap">
                  <ValidatorLink address={p.nodeAddress}>
                    {p.nodeName ?? short(p.nodeAddress)}
                  </ValidatorLink>
                  {p.nodeAddress === selfNode && (
                    <span className="text-body-tertiary"> (self)</span>
                  )}
                  {flagged(p) && <PairBadge kind={pairKind(p)} />}
                </td>
                <td className="text-end font-monospace text-nowrap">
                  {landedWith(p) != null ? (
                    <>
                      {landedWith(p)!.toLocaleString()}
                      {/* Its own right-aligned slot, so the counts and the
                          shares each line up down the column. */}
                      <span
                        className="d-inline-block text-end text-body-tertiary ms-3"
                        style={{ minWidth: '4ch' }}
                      >
                        {p.slots
                          ? `${Math.floor((landedWith(p)! / p.slots) * 100)}%`
                          : ''}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="text-end font-monospace">
                  {missedWith(p).toLocaleString()}
                </td>
                <td
                  className={`text-end font-monospace${p.thinBlockSlots > 0 ? ' text-warning' : ' text-body-quaternary'}`}
                >
                  {p.thinBlockSlots.toLocaleString()}
                </td>
                <td
                  className={`text-end font-monospace${p.lateSlots > 0 ? ' text-danger' : ' text-body-quaternary'}`}
                >
                  {p.lateSlots.toLocaleString()}
                </td>
                <td className="text-end font-monospace text-nowrap">
                  {p.thinSlots != null ? (
                    <>
                      {p.thinSlots.length.toLocaleString()}
                      {p.classifiedSlots != null && (
                        <span className="text-body-tertiary">
                          {' '}
                          / {p.classifiedSlots.toLocaleString()}
                        </span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {pages > 1 && (
        <Pager
          page={page}
          pages={pages}
          total={all.length}
          pageSize={PAGE}
          shown={top.length}
          onPrev={() => setPage(p => p - 1)}
          onNext={() => setPage(p => p + 1)}
          onPage={setPage}
        />
      )}
    </>
  );
};

export default ProducerMissesTable;
