import Pager from 'components/common/Pager';
import SectionCard from 'components/common/SectionCard';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import { formatLamports } from 'helpers/utils';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ProductionOmissions } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Table, ToggleButton } from 'react-bootstrap';
import { Link } from 'react-router';

const PAGE = 10;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const pct = (v: number) =>
  `${(Math.floor(v * 1000) / 10).toLocaleString('en-US', { minimumFractionDigits: 1 })}%`;

type Filter = 'all' | 'often' | 'never';
type Sort = 'leftOut' | 'rate' | 'stake';
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
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('leftOut');
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
    setFilter('all');
  }, [key]);
  const never = data?.thresholds?.blackholeShare ?? 0.9;
  const rows = useMemo(() => {
    const vs = (data?.voters ?? []).map(v => ({
      ...v,
      rate: v.slots ? v.leftOut / v.slots : 0
    }));
    return vs
      .filter(v =>
        filter === 'never'
          ? v.rate >= never
          : filter === 'often'
            ? v.rate >= OFTEN
            : true
      )
      .sort((a, b) =>
        sort === 'stake'
          ? b.stake - a.stake
          : sort === 'rate'
            ? b.rate - a.rate || b.leftOut - a.leftOut
            : b.leftOut - a.leftOut || b.stake - a.stake
      );
  }, [data, filter, sort, never]);
  if (!data) return null;
  const voters = data.voters;
  const neverN = voters.filter(
    v => v.slots && v.leftOut / v.slots >= never
  ).length;
  const oftenN = voters.filter(
    v => v.slots && v.leftOut / v.slots >= OFTEN
  ).length;
  const shown = rows.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const total = data.leftOutTotal ?? voters.reduce((a, v) => a + v.leftOut, 0);

  const sortHead = (s: Sort, label: string, title: string) => (
    <th
      className="text-end"
      role="button"
      title={`${title} - sort by it`}
      onClick={() => {
        setSort(s);
        setPage(0);
      }}
    >
      {label}
      {sort === s ? ' ▾' : ''}
    </th>
  );

  return (
    <div id="never-includes" style={{ scrollMarginTop: 80 }}>
      <SectionCard
        title="Producer Omissions"
        icon="slash"
        info={`Every voter its blocks' reward certificates left out at least once this epoch while the voter was online (offline runs aside): how many of its blocks left it out, of those it could have been in. At thin blocks: of those, the ones where its block left out ${((data.thresholds?.thinShare ?? 0.02) * 100).toFixed(0)}%+ of the stake besides this voter - its own lateness; the rest, this voter's votes alone not reaching it - the path between the two (peering, firewall, region). "Never": left out of ${(never * 100).toFixed(0)}%+ of them. Each voter's own view is its Voting tab.`}
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
                  <th>Voter</th>
                  {sortHead('stake', 'Stake', 'Its stake this epoch')}
                  {sortHead(
                    'leftOut',
                    'Left out',
                    'Its blocks that left the voter out, of those it could have been in (the voter online)'
                  )}
                  {sortHead(
                    'rate',
                    'Rate',
                    'The share of those blocks that left it out'
                  )}
                  <th
                    className="text-end d-none d-sm-table-cell"
                    title="Of those, at its thin blocks (it left out 2%+ of the stake besides this voter): its own lateness. The rest: this voter's votes alone not reaching it."
                  >
                    At thin blocks
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
                        title="Its Voting tab this epoch: its side of these misses"
                      >
                        {v.nodeName || short(v.nodeAddress ?? v.voteAddress)}
                      </Link>
                    </td>
                    <td className="text-end font-monospace">
                      {formatLamports(v.stake, 0)}
                    </td>
                    <td className="text-end font-monospace text-nowrap">
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
                    <td className="text-end font-monospace text-body-tertiary d-none d-sm-table-cell">
                      {v.thinLeftOut != null
                        ? v.thinLeftOut.toLocaleString()
                        : '—'}
                    </td>
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
