import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import TurnoutChart from 'components/governance/TurnoutChart';
import {
  CHOICE,
  PhaseBadge,
  VerdictBadge,
  VoteBar,
  VoteChoice,
  compactSol,
  epochSpan,
  pct,
  proposalName,
  proposalTag
} from 'components/governance/governance';
import useAdvanceTable from 'hooks/useAdvanceTable';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { GovernanceProposalDetail } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router';

type Vote = GovernanceProposalDetail['votes'][number];
type SplitRow = NonNullable<
  GovernanceProposalDetail['splits']
>['clients'][number];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;
const when = (unixS: number | null | undefined) =>
  unixS
    ? new Date(unixS * 1000).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '—';

const voteColumns: ColumnDef<Vote>[] = [
  {
    id: 'validator',
    header: 'Validator',
    accessorFn: v => `${v.name ?? ''} ${v.identity}`,
    cell: ({ row: { original: v } }) => (
      <Link to={`/validator/${v.identity}`}>{v.name ?? short(v.identity)}</Link>
    )
  },
  {
    id: 'vote',
    header: 'Vote',
    accessorFn: v => v.bp?.for ?? 0,
    cell: ({ row: { original: v } }) => <VoteChoice bp={v.bp} />
  },
  {
    id: 'stake',
    header: 'Stake',
    accessorFn: v => v.stake ?? 0,
    cell: ({ row: { original: v } }) => compactSol(v.stake),
    meta: {
      headerProps: { className: 'text-end' },
      cellProps: { className: 'text-end font-monospace' }
    }
  },
  {
    id: 'effective',
    header: 'After overrides',
    accessorFn: v => v.effective ?? v.stake ?? 0,
    cell: ({ row: { original: v } }) => compactSol(v.effective ?? v.stake),
    meta: {
      headerProps: {
        className: 'text-end',
        title:
          "The stake it voted with, once its stakers' own votes are taken out"
      },
      cellProps: { className: 'text-end font-monospace' }
    }
  },
  {
    id: 'votedAt',
    header: 'Voted',
    accessorFn: v => v.votedAt ?? 0,
    cell: ({ row: { original: v } }) => (
      <span className="text-body-tertiary text-nowrap">{when(v.votedAt)}</span>
    ),
    meta: {
      headerProps: { className: 'text-end' },
      cellProps: { className: 'text-end' }
    }
  }
];

/** A breakdown of the vote (by client, country or provider): each group's
 *  for / against / abstain, and its stake that didn't vote. */
const SplitCard = ({
  title,
  icon,
  rows
}: {
  title: string;
  icon: string;
  rows: SplitRow[];
}) => {
  const total = (r: SplitRow) =>
    (r.for ?? 0) + (r.against ?? 0) + (r.abstain ?? 0) + (r.notVoted ?? 0);
  const top = [...rows].sort((a, b) => total(b) - total(a)).slice(0, 8);
  return (
    <SectionCard title={title} icon={icon}>
      {top.length ? (
        <div className="d-flex flex-column gap-2">
          {top.map(r => (
            <div key={r.key}>
              <div className="d-flex justify-content-between fs-9 mb-1">
                <span className="text-truncate">{r.label ?? r.key}</span>
                <span className="text-body-tertiary font-monospace">
                  {compactSol(total(r))}
                </span>
              </div>
              <VoteBar values={r} notVoted={r.notVoted} height={6} />
            </div>
          ))}
        </div>
      ) : (
        <UntrackedState>No breakdown.</UntrackedState>
      )}
    </SectionCard>
  );
};

/**
 * One governance proposal: its result under its own rule, turnout over
 * time, every validator's vote, the largest stake that didn't vote,
 * stakers' overrides, and the vote by client, country and provider.
 */
const GovernanceProposal = () => {
  const { address = '' } = useParams();
  const context = useContext(VortexDataContext);
  const slice = context?.governanceProposalState;
  const fetchData = slice?.fetchData;
  const data = slice?.data.get(address);
  useEffect(() => {
    if (address) fetchData?.(address);
  }, [address, fetchData]);
  const [allNon, setAllNon] = useState(false);

  const votes = useMemo(() => data?.votes ?? [], [data]);
  const table = useAdvanceTable({
    columns: voteColumns,
    data: votes,
    sortable: true,
    pagination: true,
    pageSize: 25,
    getRowId: v => v.identity,
    resetPageKey: address,
    initialState: { sorting: [{ id: 'stake', desc: true }] }
  });

  if (!data)
    return (
      <div className="mb-9 pt-4">
        {slice?.error ? (
          <UntrackedState>
            This proposal isn&apos;t available from the API.{' '}
            <Link to="/governance">All proposals</Link>
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading the proposal…" />
        )}
      </div>
    );

  const p = data.proposal;
  const rule = p.verdict?.rule;
  const forShare =
    rule?.abstainCounted === false ? p.forShareExAbstain : p.forShare;
  const nonVoters = [...data.nonVoters].sort(
    (a, b) => (b.stake ?? 0) - (a.stake ?? 0)
  );
  const byValidator = [...(data.overrides?.byValidator ?? [])].sort(
    (a, b) => (b.lamports ?? 0) - (a.lamports ?? 0)
  );
  const entries = [...(data.overrides?.entries ?? [])].sort(
    (a, b) => (b.lamports ?? 0) - (a.lamports ?? 0)
  );

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col">
          <h3>{proposalName(p)}</h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            {[proposalTag(p), epochSpan(p)].filter(Boolean).join(' · ')}
            {p.author && (
              <>
                {' · by '}
                {p.author.identity ? (
                  <Link to={`/validator/${p.author.identity}`}>
                    {p.author.name ?? short(p.author.identity)}
                  </Link>
                ) : (
                  p.author.name
                )}
              </>
            )}
          </p>
        </div>
        <div className="col-auto d-flex align-items-center gap-2">
          <PhaseBadge phase={p.phase} />
          <VerdictBadge result={p.verdict?.result} />
          {p.docUrl && (
            <a
              href={p.docUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-soft-secondary btn-sm"
            >
              Proposal text
            </a>
          )}
          {p.voteUrl && p.phase !== 'finalized' && (
            <a
              href={p.voteUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm"
            >
              Vote
            </a>
          )}
        </div>
      </div>

      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} lg={3}>
            <StatCard
              label="For"
              value={pct(forShare)}
              sublabel={
                rule?.threshold != null
                  ? `needs ${pct(rule.threshold, 0)}${rule.abstainCounted === false ? ', abstain not counted' : ''}`
                  : 'of the stake that voted'
              }
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Turnout"
              value={pct(p.turnout)}
              sublabel={
                rule?.quorum != null
                  ? `quorum ${pct(rule.quorum, 0)} of epoch ${p.snapshotEpoch?.toLocaleString() ?? '—'} stake`
                  : `of epoch ${p.snapshotEpoch?.toLocaleString() ?? '—'} stake`
              }
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Validators voted"
              value={p.voters?.toLocaleString() ?? '—'}
              sublabel={`${nonVoters.length.toLocaleString()} didn't`}
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Staker overrides"
              value={p.overrides?.toLocaleString() ?? '—'}
              sublabel="stakers who voted their own stake"
            />
          </Col>
        </Row>

        <SectionCard
          title="Result"
          icon="check-square"
          info="Stake-weighted, after stakers' overrides. The program records only tallies; the verdict follows the rule in the proposal's own text."
        >
          <VoteBar
            values={p.tallies ?? {}}
            threshold={rule?.threshold}
            height={14}
          />
          <div className="d-flex flex-wrap gap-3 fs-9 mt-2">
            {CHOICE.map(c => (
              <span key={c.key}>
                <span
                  className="d-inline-block rounded-1 me-1 align-middle"
                  style={{ width: 9, height: 9, background: c.color }}
                />
                {c.label}{' '}
                <span className="font-monospace">
                  {compactSol(p.tallies?.[c.key])}
                </span>
              </span>
            ))}
          </div>
          {(rule?.text || rule?.source) && (
            <p className="fs-9 text-body-tertiary mt-3 mb-0">
              {rule.text ?? 'The rule this verdict follows'}
              {rule.source && (
                <>
                  {' '}
                  <a href={rule.source} target="_blank" rel="noreferrer">
                    Source
                  </a>
                </>
              )}
            </p>
          )}
        </SectionCard>

        {!!data.turnoutOverTime?.length && (
          <SectionCard title="Turnout Over Time" icon="trending-up">
            <TurnoutChart points={data.turnoutOverTime} quorum={rule?.quorum} />
          </SectionCard>
        )}

        <SectionCard
          title="Votes"
          icon="users"
          info="Every validator that voted, by stake."
        >
          <AdvanceTableProvider {...table}>
            <SearchBox
              className="mb-3"
              placeholder="Search validators"
              onChange={e => table.setGlobalFilter(e.target.value || undefined)}
            />
            <AdvanceTable
              tableProps={{ size: 'sm', className: 'data-table fs-9 mb-0' }}
            />
            <AdvanceTableFooter />
          </AdvanceTableProvider>
        </SectionCard>

        <Row className="g-3">
          <Col xs={12} lg={6}>
            <SectionCard
              title="Didn't Vote"
              icon="user-x"
              info="The largest validators by stake with no vote on this proposal."
            >
              {nonVoters.length ? (
                <>
                  <Table
                    size="sm"
                    className="data-table compact-rows fs-9 mb-0"
                  >
                    <tbody>
                      {(allNon ? nonVoters : nonVoters.slice(0, 10)).map(v => (
                        <tr key={v.identity}>
                          <td>
                            <Link to={`/validator/${v.identity}`}>
                              {v.name ?? short(v.identity)}
                            </Link>
                          </td>
                          <td className="text-end font-monospace">
                            {compactSol(v.stake)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {nonVoters.length > 10 && (
                    <button
                      type="button"
                      className="btn btn-link p-0 fs-10 mt-2"
                      onClick={() => setAllNon(a => !a)}
                    >
                      {allNon ? 'Show fewer' : `Show all ${nonVoters.length}`}
                    </button>
                  )}
                </>
              ) : (
                <UntrackedState>Every validator voted.</UntrackedState>
              )}
            </SectionCard>
          </Col>
          <Col xs={12} lg={6}>
            <SectionCard
              title="Staker Overrides"
              icon="corner-down-right"
              info="Stake whose stakers voted it themselves, taken out of their validator's vote: totals per validator, and stakers of 10,000 SOL or more and known stake pools (by address)."
            >
              {byValidator.length || entries.length ? (
                <>
                  {byValidator.length > 0 && (
                    <Table
                      size="sm"
                      className="data-table compact-rows fs-9 mb-3"
                    >
                      <thead>
                        <tr>
                          <th>Validator</th>
                          <th className="text-end">Overrides</th>
                          <th className="text-end">Stake</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byValidator.slice(0, 8).map(o => (
                          <tr key={o.identity}>
                            <td>
                              <Link to={`/validator/${o.identity}`}>
                                {o.name ?? short(o.identity)}
                              </Link>
                            </td>
                            <td className="text-end font-monospace">
                              {o.count?.toLocaleString() ?? '—'}
                            </td>
                            <td className="text-end font-monospace">
                              {compactSol(o.lamports)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                  {entries.length > 0 && (
                    <Table
                      size="sm"
                      className="data-table compact-rows fs-9 mb-0"
                    >
                      <thead>
                        <tr>
                          <th>Staker</th>
                          <th>Vote</th>
                          <th className="text-end">Stake</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.slice(0, 10).map(e => (
                          <tr key={`${e.staker}-${e.validator ?? ''}`}>
                            <td className="font-monospace">
                              {short(e.staker)}
                              {e.pool && (
                                <span className="badge badge-soft badge-soft-info ms-2">
                                  pool
                                </span>
                              )}
                            </td>
                            <td>
                              <VoteChoice bp={e.bp} />
                            </td>
                            <td className="text-end font-monospace">
                              {compactSol(e.lamports)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </>
              ) : (
                <UntrackedState>No staker overrides.</UntrackedState>
              )}
            </SectionCard>
          </Col>
        </Row>

        {data.splits && (
          <Row className="g-3">
            <Col xs={12} lg={4}>
              <SplitCard
                title="By Client"
                icon="cpu"
                rows={data.splits.clients}
              />
            </Col>
            <Col xs={12} lg={4}>
              <SplitCard
                title="By Country"
                icon="globe"
                rows={data.splits.countries}
              />
            </Col>
            <Col xs={12} lg={4}>
              <SplitCard
                title="By Provider"
                icon="server"
                rows={data.splits.asns}
              />
            </Col>
          </Row>
        )}
      </div>
    </div>
  );
};

export default GovernanceProposal;
