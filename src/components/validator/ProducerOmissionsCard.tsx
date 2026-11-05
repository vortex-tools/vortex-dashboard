import Pager from 'components/common/Pager';
import SectionCard from 'components/common/SectionCard';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import { formatLamports, formatStakeShare } from 'helpers/utils';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ProductionOmissions } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Table, ToggleButton } from 'react-bootstrap';
import { Link } from 'react-router';

const PAGE = 10;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const pct = (v: number) =>
  v > 0 && v < 0.001
    ? '<0.1%'
    : `${(Math.floor(v * 1000) / 10).toLocaleString('en-US', { minimumFractionDigits: 1 })}%`;

type Filter = 'all' | 'often' | 'never';
type Sort = 'leftOut' | 'rate' | 'stake' | 'voter' | 'excess';
/** Left out of this share of its blocks or more: "often". */
const OFTEN = 0.1;

/**
 * The producer side of missed votes (/epochs/production/omissions): every
 * voter its blocks' reward certificates left out at least once this epoch
 * while the voter was online, how often of the blocks it could have been
 * in, and how many of those at its thin blocks (where it left out 2%+ of
 * the stake besides the voter - its own lateness) against the rest (that
 * voter's votes alone not reaching it - the path between the two). The
 * voter side is each voter's Voting tab. null until the API has it, so the
 * page keeps its Voters It Never Includes card meanwhile.
 */
const ProducerOmissionsCard = ({
  voteKey,
  epoch
}: {
  voteKey: string;
  epoch: number;
}) => {
  const context = useContext(VortexDataContext);
  const slice = context?.productionOmissionsState;
  const fetchData = slice?.fetchData;
  const key = `${voteKey}:${epoch}`;
  useEffect(() => {
    fetchData?.(key);
  }, [key, fetchData]);
  const data: ProductionOmissions | undefined = slice?.data.get(key);
  // The epoch's stake, for each voter's share (the producer board's sum).
  const totalStake =
    context?.producerLeaderboardState.data.get(epoch)?.cluster?.stake ?? null;
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('leftOut');
  // Most first; a second click on the same header flips it.
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
    setFilter('all');
  }, [key]);
  const never = data?.thresholds?.blackholeShare ?? 0.9;
  const rows = useMemo(() => {
    const vs = (data?.voters ?? []).map(v => {
      const rate = v.slots ? v.leftOut / v.slots : 0;
      return {
        ...v,
        rate,
        // How much more often this producer leaves it out than producers
        // do in general: the producer-specific part.
        excess: v.baselineShare != null ? rate - v.baselineShare : null
      };
    });
    return vs
      .filter(v =>
        filter === 'never'
          ? v.rate >= never
          : filter === 'often'
            ? v.rate >= OFTEN
            : true
      )
      .sort((a, b) => {
        const d =
          sort === 'voter'
            ? (b.nodeName ?? b.voteAddress).localeCompare(
                a.nodeName ?? a.voteAddress
              )
            : sort === 'stake'
              ? b.stake - a.stake
              : sort === 'rate'
                ? b.rate - a.rate || b.leftOut - a.leftOut
                : sort === 'excess'
                  ? (b.excess ?? -1) - (a.excess ?? -1)
                  : b.leftOut - a.leftOut || b.stake - a.stake;
        return asc ? -d : d;
      });
  }, [data, filter, sort, asc, never]);
  if (!data) return null;
  const voters = data.voters;
  // Each voter's usual rate, once the API serves it.
  const baseline = voters.some(v => v.baselineShare != null);
  const neverN = voters.filter(
    v => v.slots && v.leftOut / v.slots >= never
  ).length;
  const oftenN = voters.filter(
    v => v.slots && v.leftOut / v.slots >= OFTEN
  ).length;
  const shown = rows.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const total = data.leftOutTotal ?? voters.reduce((a, v) => a + v.leftOut, 0);
  // How much of it was at its own thin blocks (its lateness).
  const thinTotal = voters.some(v => v.thinLeftOut != null)
    ? voters.reduce((a, v) => a + (v.thinLeftOut ?? 0), 0)
    : null;
  const thinShare = thinTotal != null && total ? thinTotal / total : 0;

  const sortHead = (
    s: Sort,
    label: string,
    title: string,
    className = 'text-end'
  ) => (
    <th
      className={className}
      role="button"
      title={`${title} - sort by it (again to flip)`}
      onClick={() => {
        // Names A-Z first; figures most first.
        setAsc(sort === s ? !asc : s === 'voter');
        setSort(s);
        setPage(0);
      }}
    >
      {label}
      {sort === s ? (asc ? ' ▴' : ' ▾') : ''}
    </th>
  );

  return (
    <div id="never-includes" style={{ scrollMarginTop: 80 }}>
      <SectionCard
        title="Producer Omissions"
        icon="slash"
        info={`Every voter its blocks' reward certificates left out at least once this epoch while the voter was online (offline runs aside): how many of its blocks left it out, of those it could have been in. Hover a voter's figure for how many were at its thin blocks - where its block left out ${((data.thresholds?.thinShare ?? 0.02) * 100).toFixed(0)}%+ of the stake besides this voter - its own lateness; the rest, this voter's votes alone not reaching it - the path between the two (peering, firewall, region). "Never": left out of ${(never * 100).toFixed(0)}%+ of them. Missed in others': how often every other producer misses the voter this epoch (offline aside) - its typical rate, not the cluster's; a voter rarely missed elsewhere but often missed here is this producer failing it. Each voter's own view is its Voting tab.`}
        aside={
          voters.length > 0 ? (
            <ButtonGroup size="sm" className="vx-header-control">
              {(
                [
                  ['all', `All ${voters.length.toLocaleString()}`],
                  ['often', `${(OFTEN * 100).toFixed(0)}%+ ${oftenN}`],
                  ['never', `Never ${neverN}`]
                ] as Array<[Filter, string]>
              ).map(([f, label]) => (
                <ToggleButton
                  key={f}
                  id={`omissions-${f}`}
                  type="radio"
                  name="omissions"
                  variant="soft-secondary"
                  value={f}
                  checked={filter === f}
                  disabled={
                    (f === 'never' && !neverN) || (f === 'often' && !oftenN)
                  }
                  onChange={() => {
                    setFilter(f);
                    setPage(0);
                  }}
                >
                  {label}
                </ToggleButton>
              ))}
            </ButtonGroup>
          ) : undefined
        }
      >
        {voters.length === 0 ? (
          <p className="fs-9 text-body-tertiary mb-0">
            Its blocks included every online voter this epoch.
          </p>
        ) : (
          <>
            <p className="fs-9 mb-2">
              Its blocks left out{' '}
              <span className="fw-semibold">
                {voters.length.toLocaleString()}{' '}
                {voters.length === 1 ? 'voter' : 'voters'}
              </span>{' '}
              at least once ({total.toLocaleString()} votes
              {data.blocks != null &&
                ` over ${data.blocks.toLocaleString()} blocks`}
              )
              {thinTotal != null && (
                <span
                  className={
                    thinShare >= 0.25
                      ? 'text-warning-emphasis'
                      : 'text-body-tertiary'
                  }
                  title="Left out at its thin blocks - where it left out 2%+ of the stake besides the voter: its own lateness, not the voter's path to it"
                >
                  {' · '}
                  {thinTotal === 0
                    ? 'none at its thin blocks'
                    : `${pct(thinShare)} at its thin blocks${thinShare >= 0.25 ? ': its own lateness' : ''}`}
                </span>
              )}
              {neverN > 0 && (
                <>
                  {' '}
                  ·{' '}
                  <span className="text-danger fw-semibold">
                    {neverN} never included
                  </span>
                </>
              )}
              {!data.complete && (
                <span className="text-body-tertiary"> · so far</span>
              )}
            </p>
            <Table responsive size="sm" className="data-table fs-9 mb-2">
              <thead>
                <tr>
                  {sortHead('voter', 'Voter', 'Its name', '')}
                  {sortHead('stake', 'Stake', "Its share of the epoch's stake")}
                  {sortHead(
                    'leftOut',
                    'Left out',
                    'Its blocks that left the voter out, of those it could have been in (the voter online)'
                  )}
                  {sortHead(
                    'rate',
                    'Missed in our blocks',
                    "The share of this producer's blocks that left it out"
                  )}
                  {baseline &&
                    sortHead(
                      'excess',
                      "Missed in others'",
                      "How often this voter is missed by every OTHER producer this epoch (offline aside) - what's typical for it, not the cluster's. Low here beside a high Missed in our blocks: this producer is failing it. Sorts by how much worse this producer is than that"
                    )}
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
                        title="Its Voting tab this epoch: its side of these misses"
                      >
                        {v.nodeName || short(v.nodeAddress ?? v.voteAddress)}
                      </Link>
                    </td>
                    <td
                      className="text-end font-monospace"
                      title={formatLamports(v.stake, 0)}
                    >
                      {(totalStake && formatStakeShare(v.stake, totalStake)) ||
                        formatLamports(v.stake, 0)}
                    </td>
                    <td
                      className="text-end font-monospace text-nowrap"
                      title={
                        v.thinLeftOut != null
                          ? `${v.leftOut.toLocaleString()} left out: ${v.thinLeftOut.toLocaleString()} at its thin blocks (its own lateness), ${(v.leftOut - v.thinLeftOut).toLocaleString()} otherwise (this voter's path to it)`
                          : undefined
                      }
                    >
                      {v.leftOut.toLocaleString()}
                      <span className="text-body-tertiary">
                        {' '}
                        / {v.slots.toLocaleString()}
                      </span>
                    </td>
                    <td className="text-end text-nowrap">
                      <span
                        className={`d-inline-block rounded-1 px-2 font-monospace fs-10 ${
                          v.rate >= never
                            ? 'bg-danger-subtle text-danger'
                            : v.rate >= OFTEN
                              ? 'vx-chip-orange'
                              : 'text-body-tertiary'
                        }`}
                      >
                        {v.rate >= never ? 'never · ' : ''}
                        {pct(v.rate)}
                      </span>
                    </td>
                    {baseline && (
                      <td
                        className="text-end font-monospace text-nowrap fs-10 text-body-tertiary"
                        title={
                          v.baselineShare != null
                            ? `Missed by other producers' blocks ${pct(v.baselineShare)} of the time; by this producer's ${pct(v.rate)}`
                            : undefined
                        }
                      >
                        {v.baselineShare != null ? pct(v.baselineShare) : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            {pages > 1 && (
              <Pager
                page={page}
                pages={pages}
                total={rows.length}
                pageSize={PAGE}
                shown={shown.length}
                onPrev={() => setPage(p => p - 1)}
                onNext={() => setPage(p => p + 1)}
                onPage={setPage}
              />
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
};

export default ProducerOmissionsCard;
