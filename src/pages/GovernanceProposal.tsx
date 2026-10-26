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
  ChoiceTag,
  PhaseBadge,
  RULE,
  THRESHOLD,
  VerdictBadge,
  VoteBar,
  VoteChoice,
  compactSol,
  epochSpan,
  pct,
  proposalName,
  ruleShare,
  sgpTag,
  tallySum
} from 'components/governance/governance';
import useAdvanceTable from 'hooks/useAdvanceTable';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import {
  GovernanceBreakdownRow,
  GovernanceProposal as Proposal,
  GovernanceVote
} from 'providers/vortex-schemas';
import FeatherIcon from 'feather-icons-react';
import { ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router';

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const when = (unixS: number | null | undefined) =>
  unixS
    ? new Date(unixS * 1000).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '—';
const ValidatorLink = ({
  identity,
  name
}: {
  identity: string | null;
  name: string | null;
}) =>
  identity ? (
    <Link to={`/validator/${identity}`}>{name ?? short(identity)}</Link>
  ) : (
    <span>{name ?? '—'}</span>
  );

const end = {
  headerProps: { className: 'text-end' },
  cellProps: { className: 'text-end font-monospace' }
};
const voteColumns: ColumnDef<GovernanceVote>[] = [
  {
    id: 'validator',
    header: 'Validator',
    accessorFn: v => `${v.name ?? ''} ${v.identity} ${v.voteAccount ?? ''}`,
    cell: ({ row: { original: v } }) => (
      <ValidatorLink identity={v.identity} name={v.name} />
    )
  },
  {
    id: 'vote',
    header: 'Vote',
    accessorFn: v => v.choice ?? '',
    cell: ({ row: { original: v } }) => (
      <VoteChoice choice={v.choice} basisPoints={v.basisPoints} />
    )
  },
  {
    id: 'stake',
    header: 'Stake',
    accessorFn: v => v.stake ?? 0,
    cell: ({ row: { original: v } }) => compactSol(v.stake),
    meta: end
  },
  {
    id: 'overridden',
    header: 'Overridden',
    accessorFn: v => v.overridden ?? 0,
    cell: ({ row: { original: v } }) =>
      v.overridden ? (
        compactSol(v.overridden)
      ) : (
        <span className="text-body-quaternary">—</span>
      ),
    meta: {
      headerProps: {
        className: 'text-end',
        title: 'Its stake whose stakers voted it themselves'
      },
      cellProps: end.cellProps
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

/** One condition of the rule, met or not. */
const Check = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <li className="d-flex align-items-center gap-2">
    <FeatherIcon
      icon={ok ? 'check-circle' : 'x-circle'}
      size={14}
      className={ok ? 'text-success' : 'text-danger'}
    />
    <span>{children}</span>
  </li>
);

/** What the verdict was decided on: the rule's conditions, each met or
 *  not, with the numbers. */
const RuleChecks = ({
  proposal: p,
  quorumShare
}: {
  proposal: Proposal;
  quorumShare: number | null;
}) => {
  const share = ruleShare(p);
  const decisive = p.rule === 'decisive';
  return (
    <div className="fs-9 mt-3">
      <p className="mb-2 text-body-tertiary">
        Decided by{' '}
        {decisive
          ? 'the decisive rule (Abstain not counted, no quorum)'
          : "the Solana Constitution's rule (Abstain counts as a vote that isn't For)"}
        :
      </p>
      <ul className="list-unstyled d-flex flex-column gap-1 mb-0">
        {!decisive && quorumShare != null && (
          <Check ok={!!p.quorumMet}>
            Turnout <span className="fw-bold">{pct(p.turnout)}</span> of the
            stake - needs at least {pct(quorumShare)}
          </Check>
        )}
        <Check ok={share != null && share >= THRESHOLD}>
          For <span className="fw-bold">{pct(share)}</span> of{' '}
          {decisive ? 'For + Against' : 'all votes'} - needs at least{' '}
          {pct(THRESHOLD)}
        </Check>
      </ul>
    </div>
  );
};

/** The outcome by client, country or provider: each group's vote and its
 *  stake that didn't vote. */
const BreakdownCard = ({
  title,
  icon,
  rows
}: {
  title: string;
  icon: string;
  rows: GovernanceBreakdownRow[];
}) => {
  const [all, setAll] = useState(false);
  const sorted = [...rows].sort((a, b) => (b.stake ?? 0) - (a.stake ?? 0));
  return (
    <SectionCard title={title} icon={icon}>
      {sorted.length ? (
        <>
          <div className="d-flex flex-column gap-2">
            {(all ? sorted : sorted.slice(0, 8)).map(r => (
              <div key={r.key}>
                <div className="d-flex justify-content-between gap-2 fs-9 mb-1">
                  <span className="text-truncate" title={r.key}>
                    {r.name ?? r.key}
                  </span>
                  <span className="text-body-tertiary text-nowrap">
                    {r.voted ?? 0}/{r.validators ?? 0} voted ·{' '}
                    <span className="font-monospace">
                      {compactSol(r.stake)}
                    </span>
                  </span>
                </div>
                <VoteBar tally={r.tally} notVoted={r.notVoting} height={6} />
              </div>
            ))}
          </div>
          {sorted.length > 8 && (
            <button
              type="button"
              className="btn btn-link p-0 fs-10 mt-2"
              onClick={() => setAll(a => !a)}
            >
              {all ? 'Show fewer' : `Show all ${sorted.length}`}
            </button>
          )}
        </>
      ) : (
        <UntrackedState>No breakdown.</UntrackedState>
      )}
    </SectionCard>
  );
};

/**
 * One governance proposal: the verdict under its rule (and any dispute
 * about it), the vote as it came in, every validator's vote, who didn't
 * vote, stakers' overrides, and the outcome by client, country and
 * provider.
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
  const [allObv, setAllObv] = useState(false);

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
  const quorumShare =
    p.quorum != null && p.snapshotStake ? p.quorum / p.snapshotStake : null;
  const nonVoters = data.nonVoters;
  const obv = data.overridesByValidator;
  const overridden =
    obv.reduce((a, o) => a + tallySum(o.tally), 0) +
    tallySum(data.breakdown?.unattributed);

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col">
          <h3>{proposalName(p)}</h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            {[
              sgpTag(p),
              epochSpan(p) && `voted in epochs ${epochSpan(p)}`,
              p.snapshotEpoch != null &&
                `stake from epoch ${p.snapshotEpoch.toLocaleString()}`
            ]
              .filter(Boolean)
              .join(' · ')}
            {p.author && (
              <>
                {' · by '}
                <span className="font-monospace" title={p.author}>
                  {short(p.author)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="col-auto d-flex flex-wrap align-items-center gap-2">
          <PhaseBadge phase={p.phase} />
          <VerdictBadge verdict={p.verdict} projected={p.projected} />
          {p.description && (
            <a
              href={p.description}
              target="_blank"
              rel="noreferrer"
              className="btn btn-soft-secondary btn-sm"
            >
              Proposal text
            </a>
          )}
        </div>
      </div>

      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} lg={3}>
            <StatCard
              label="For"
              value={pct(ruleShare(p))}
              sublabel={`of ${p.rule === 'decisive' ? 'For + Against' : 'all votes'} · needs ${pct(THRESHOLD)}`}
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Turnout"
              value={pct(p.turnout)}
              sublabel={
                quorumShare != null
                  ? `quorum ${pct(quorumShare)}: ${p.quorumMet ? 'met' : 'not met'}`
                  : 'of the snapshot stake'
              }
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Validators Voted"
              value={p.validatorVotes?.toLocaleString() ?? '—'}
              sublabel={`${nonVoters.length.toLocaleString()} staked validators didn't`}
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Staker Overrides"
              value={p.stakerOverrides?.toLocaleString() ?? '—'}
              sublabel={`${compactSol(overridden)} voted by stakers themselves`}
            />
          </Col>
        </Row>

        <SectionCard
          title="Result"
          icon="check-square"
          info="Weighted by each validator's stake in the snapshot epoch; a staker's override moves its stake to the staker's own choice. The program records only the tallies: the verdict applies the proposal's rule."
        >
          <VoteBar
            tally={p.tally}
            threshold={p.rule === 'constitution' ? THRESHOLD : null}
            height={14}
          />
          <div className="d-flex flex-wrap gap-3 fs-9 mt-2">
            {CHOICE.map(c => (
              <ChoiceTag key={c.key} choice={c.key}>
                {compactSol(p.tally?.[c.key])}
              </ChoiceTag>
            ))}
          </div>
          <RuleChecks proposal={p} quorumShare={quorumShare} />
          {p.official && (
            <p className="fs-9 text-body-tertiary mt-2 mb-0">
              Official status: {p.official.status ?? '—'}
              {p.official.matches === false &&
                ' (differs from the computed verdict)'}
              {p.official.source && (
                <>
                  {' · '}
                  <a href={p.official.source} target="_blank" rel="noreferrer">
                    source
                  </a>
                </>
              )}
            </p>
          )}
          {p.contested && (
            <div className="bg-warning-subtle border border-warning-subtle rounded p-2 fs-9 mt-3">
              <span className="fw-semibold">Contested.</span>{' '}
              {p.contested.rule === 'decisive' && (
                <>
                  Under the rule the proposal&apos;s own text used - two thirds
                  of For + Against, Abstain not counted - For is{' '}
                  <span className="fw-bold">
                    {pct(ruleShare(p, 'decisive'))}
                  </span>{' '}
                  and it would be {p.contested.verdict ?? '—'}.{' '}
                </>
              )}
              {p.contested.summary}
              {p.contested.url && (
                <>
                  {' '}
                  <a href={p.contested.url} target="_blank" rel="noreferrer">
                    The dispute
                  </a>
                </>
              )}
            </div>
          )}
          {(p.simds.length > 0 || p.featureGates.length > 0) && (
            <p className="fs-9 mt-3 mb-0">
              <span className="text-body-tertiary">A For vote endorses </span>
              {p.simds.map((s, i) => (
                <span key={s.simd}>
                  {i > 0 && ', '}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.simd}
                    </a>
                  ) : (
                    s.simd
                  )}
                  {s.title && ` (${s.title})`}
                </span>
              ))}
              {p.featureGates.map(g => (
                <span
                  key={g.id}
                  className="font-monospace ms-2"
                  title={g.description ?? undefined}
                >
                  {g.id.slice(0, 8)}…
                </span>
              ))}
              <span className="text-body-tertiary">
                ; the vote activates nothing by itself.
              </span>
            </p>
          )}
        </SectionCard>

        {data.timeline.length > 1 && p.snapshotStake ? (
          <SectionCard
            title="As the Votes Came In"
            icon="trending-up"
            info="Hourly: For, Against and Abstain stacked as shares of the snapshot stake (their top is the turnout), replaying votes and overrides by their timestamps."
          >
            <TurnoutChart
              timeline={data.timeline}
              snapshotStake={p.snapshotStake}
              quorumShare={quorumShare}
            />
          </SectionCard>
        ) : null}

        <SectionCard
          title="Votes"
          icon="users"
          info="Every validator that voted, with its stake in the snapshot epoch and how much of it its stakers voted themselves."
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
              info="Validators staked in the snapshot epoch with no vote, largest first; their stakers could still vote their own stake."
            >
              {nonVoters.length ? (
                <>
                  <Table
                    size="sm"
                    className="data-table compact-rows fs-9 mb-0"
                  >
                    <thead>
                      <tr>
                        <th>Validator</th>
                        <th className="text-end">Stake</th>
                        <th className="text-end">Stakers voted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allNon ? nonVoters : nonVoters.slice(0, 10)).map(v => (
                        <tr key={v.identity}>
                          <td>
                            <ValidatorLink
                              identity={v.identity}
                              name={v.name}
                            />
                          </td>
                          <td className="text-end font-monospace">
                            {compactSol(v.stake)}
                          </td>
                          <td className="text-end font-monospace">
                            {tallySum(v.overrides) ? (
                              compactSol(tallySum(v.overrides))
                            ) : (
                              <span className="text-body-quaternary">—</span>
                            )}
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
                <UntrackedState>Every staked validator voted.</UntrackedState>
              )}
            </SectionCard>
          </Col>
          <Col xs={12} lg={6}>
            <SectionCard
              title="Staker Overrides"
              icon="corner-down-right"
              info="Stake whose stakers voted it themselves, taken out of their validator's vote. By validator, then the stakers overriding 10,000 SOL or more and known pools, by address."
            >
              {obv.length ? (
                <>
                  <Table
                    size="sm"
                    className="data-table compact-rows fs-9 mb-0"
                  >
                    <thead>
                      <tr>
                        <th>Validator</th>
                        <th>Its vote</th>
                        <th className="text-end">Stakers</th>
                        <th className="text-end">Overridden</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allObv ? obv : obv.slice(0, 8)).map(o => (
                        <tr key={o.voteAccount ?? o.identity}>
                          <td>
                            <ValidatorLink
                              identity={o.identity}
                              name={o.name}
                            />
                          </td>
                          <td>
                            {o.validatorVoted ? (
                              <VoteChoice choice={o.validatorChoice} />
                            ) : (
                              <span className="text-body-tertiary">
                                didn&apos;t vote
                              </span>
                            )}
                          </td>
                          <td className="text-end font-monospace">
                            {o.stakers?.toLocaleString() ?? '—'}
                          </td>
                          <td className="text-end">
                            <div className="d-flex align-items-center justify-content-end gap-2">
                              <div style={{ width: 48 }}>
                                <VoteBar tally={o.tally} height={6} />
                              </div>
                              <span className="font-monospace">
                                {compactSol(tallySum(o.tally))}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {obv.length > 8 && (
                    <button
                      type="button"
                      className="btn btn-link p-0 fs-10 mt-2"
                      onClick={() => setAllObv(a => !a)}
                    >
                      {allObv ? 'Show fewer' : `Show all ${obv.length}`}
                    </button>
                  )}
                  {data.largeOverrides.length > 0 && (
                    <Table
                      size="sm"
                      className="data-table compact-rows fs-9 mt-3 mb-0"
                    >
                      <thead>
                        <tr>
                          <th>Largest stakers</th>
                          <th>Vote</th>
                          <th className="text-end">Validators</th>
                          <th className="text-end">Stake</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.largeOverrides.map(o => (
                          <tr key={o.delegator}>
                            <td>
                              <span
                                className="font-monospace"
                                title={o.delegator}
                              >
                                {short(o.delegator)}
                              </span>
                              {o.pool && (
                                <span className="badge badge-soft badge-soft-info ms-2">
                                  {o.pool}
                                </span>
                              )}
                            </td>
                            <td>
                              <VoteChoice choice={o.choice} />
                            </td>
                            <td className="text-end font-monospace">
                              {o.validators?.toLocaleString() ?? '—'}
                            </td>
                            <td className="text-end font-monospace">
                              {compactSol(tallySum(o.tally))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                  {data.otherStakers ? (
                    <p className="fs-10 text-body-tertiary mt-2 mb-0">
                      {data.otherStakers.toLocaleString()} other stakers:{' '}
                      {compactSol(tallySum(data.otherOverrides))} together.
                    </p>
                  ) : null}
                </>
              ) : (
                <UntrackedState>No staker overrides.</UntrackedState>
              )}
            </SectionCard>
          </Col>
        </Row>

        {data.breakdown && (
          <Row className="g-3">
            <Col xs={12} lg={4}>
              <BreakdownCard
                title="By Client"
                icon="cpu"
                rows={data.breakdown.byClient}
              />
            </Col>
            <Col xs={12} lg={4}>
              <BreakdownCard
                title="By Country"
                icon="globe"
                rows={data.breakdown.byCountry}
              />
            </Col>
            <Col xs={12} lg={4}>
              <BreakdownCard
                title="By Provider"
                icon="server"
                rows={data.breakdown.byAsn}
              />
            </Col>
          </Row>
        )}
      </div>
    </div>
  );
};

export default GovernanceProposal;
