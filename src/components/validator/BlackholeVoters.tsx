import SectionCard from 'components/common/SectionCard';
import Pager from 'components/common/Pager';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import { formatLamports } from 'helpers/utils';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;
const pct = (ppb: number) => `${((ppb / 1e9) * 100).toFixed(2)}%`;
const PAGE = 10;

/**
 * The producer side of blackhole pairs: voters its blocks' reward
 * certificates (almost) never include while their votes land elsewhere -
 * a broken path between the two (/epochs/production blackholeVoters).
 * Renders nothing on an API or epoch without the classification.
 */
const BlackholeVoters = ({
  voteKey,
  epoch
}: {
  voteKey: string;
  epoch: number;
}) => {
  const context = useContext(VortexDataContext);
  const fetchHistory = context?.productionHistoryState.fetchData;
  useEffect(() => {
    fetchHistory?.(voteKey);
  }, [voteKey, fetchHistory]);
  const item = context?.productionHistoryState.data
    .get(voteKey)
    ?.find(it => it.epoch === epoch);
  const voters = item?.blackholeVoters;
  // Largest stake first, a page at a time (a producer can leave out
  // dozens).
  const sorted = useMemo(
    () => [...(voters ?? [])].sort((a, b) => b.stake - a.stake),
    [voters]
  );
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [voteKey, epoch]);
  // Nothing to show when every voter reaches its blocks.
  if (!item || voters == null || !voters.length) return null;
  const pages = Math.ceil(sorted.length / PAGE);
  const shown = sorted.slice(page * PAGE, (page + 1) * PAGE);
  const share = item.blackholeShare ?? 0.9;
  const minSlots = item.blackholeMinSlots ?? 8;

  return (
    <div id="never-includes" style={{ scrollMarginTop: 80 }}>
      <SectionCard
        title="Voters It Never Includes"
        icon="slash"
        info={`Voters left out of ${(share * 100).toFixed(0)}%+ of its slots, over at least ${minSlots} of them; offline runs aside. They still count in every score.`}
      >
        <>
          <p className="fs-9 mb-2">
            <span className="text-danger fw-semibold">
              Its blocks leave out {voters.length.toLocaleString()}{' '}
              {voters.length === 1 ? 'voter' : 'voters'}
              {item.blackholeStakePpb != null &&
                ` (${pct(item.blackholeStakePpb)} of stake)`}
            </span>{' '}
            <span className="text-body-tertiary">
              whose votes land in other producers&apos; certificates: check the
              path between the two - peering, firewall, region.
            </span>
          </p>
          <Table responsive size="sm" className="data-table fs-9 mb-2">
            <thead>
              <tr>
                <th>Voter</th>
                <th className="text-end">Stake</th>
                <th
                  className="text-end"
                  title="Its leader slots (while the voter was up) whose certificates left the voter out / all of them"
                >
                  Left out
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(v => (
                <tr key={v.voteAddress}>
                  <td className="text-nowrap">
                    <Link
                      to={recordPath(
                        v.nodeAddress ?? v.voteAddress,
                        epoch,
                        'votes'
                      )}
                      title="Its divergent votes this epoch"
                    >
                      {v.nodeName || short(v.nodeAddress ?? v.voteAddress)}
                    </Link>
                  </td>
                  <td className="text-end font-monospace">
                    {formatLamports(v.stake, 0)}
                  </td>
                  <td className="text-end font-monospace text-nowrap">
                    {v.missedSlots.toLocaleString()}
                    <span className="text-body-tertiary">
                      {' '}
                      / {v.slots.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {pages > 1 && (
            <Pager
              page={page}
              pages={pages}
              total={sorted.length}
              pageSize={PAGE}
              shown={shown.length}
              onPrev={() => setPage(p => p - 1)}
              onNext={() => setPage(p => p + 1)}
              onPage={setPage}
            />
          )}
        </>
      </SectionCard>
    </div>
  );
};

export default BlackholeVoters;
