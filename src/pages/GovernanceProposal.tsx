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
  GovernanceProposalDetail,
  GovernanceTally
} from 'providers/vortex-schemas';
import FeatherIcon from 'feather-icons-react';
import { ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Col, Row, Table, ToggleButton } from 'react-bootstrap';
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
/** A validator in the snapshot epoch: its vote, or none. */
interface ValidatorRow {
  identity: string;
  voteAccount: string | null;
  name: string | null;
  // 'for' | 'against' | 'abstain' | 'split' | 'none'
  choice: string;
  basisPoints: GovernanceTally | null;
  stake: number | null;
  // Its stake its stakers moved to another choice (see overrideEffect).
  overridden: number;
  votedAt: number | null;
}
const FILTERS = [
  ['all', 'All'],
  ['for', 'For'],
  ['against', 'Against'],
  ['abstain', 'Abstain'],
  ['split', 'Split'],
  ['none', "Didn't vote"]
] as const;
type Filter = (typeof FILTERS)[number][0];

const rowColumns: ColumnDef<ValidatorRow>[] = [
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
    accessorFn: v => v.choice,
    cell: ({ row: { original: v } }) =>
      v.choice === 'none' ? (
        <span className="text-body-tertiary">Didn&apos;t vote</span>
      ) : (
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
    accessorFn: v => v.overridden,
    cell: ({ row: { original: v } }) =>
      v.overridden ? (
        compactSol(v.overridden)
      ) : (
        <span className="text-body-quaternary">—</span>
      ),
    meta: {
      headerProps: {
        className: 'text-end',
        title:
          "Its stake that its stakers voted differently from it - or, if it didn't vote, voted at all (see Staker Overrides)"
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

/** Stakers' choices with their stake: "For ◎644K · Against ◎12K"
 *  (under 1 SOL left out). */
const TallyChoices = ({ tally }: { tally: GovernanceTally | null }) => {
  const parts = CHOICE.filter(c => (tally?.[c.key] ?? 0) >= 1e9).sort(
    (a, b) => (tally?.[b.key] ?? 0) - (tally?.[a.key] ?? 0)
  );
  if (!parts.length) return <span className="text-body-quaternary">—</span>;
  return (
    <span className="fs-10">
      {parts.map((c, i) => (
        <span key={c.key}>
          {i > 0 && <span className="text-body-quaternary"> · </span>}
          <ChoiceTag choice={c.key}>{compactSol(tally?.[c.key])}</ChoiceTag>
        </span>
      ))}
    </span>
  );
};

type ValidatorOverrides =
  GovernanceProposalDetail['overridesByValidator'][number];
/**
 * What a validator's stakers' overrides changed: the stake that went to a
 * choice other than the validator's own (against its split, for a split
 * vote), by choice. Overrides re-voting the validator's choice change
 * nothing. When the validator didn't vote, all of it counts - that stake
 * would not have counted at all.
 */
const overrideEffect = (
  o: ValidatorOverrides,
  validatorBp: GovernanceTally | null | undefined
): GovernanceTally => {
  const t = o.tally ?? { for: 0, against: 0, abstain: 0 };
  if (!o.validatorVoted || !validatorBp) return t;
  const total = tallySum(t);
  const moved = (k: keyof GovernanceTally) =>
    Math.max(0, t[k] - (total * validatorBp[k]) / 10_000);
  return {
    for: moved('for'),
    against: moved('against'),
    abstain: moved('abstain')
  };
};

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
  const [allObv, setAllObv] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  // Each voter's split, and what its stakers' overrides changed.
  const bpByIdentity = useMemo(
    () => new Map((data?.votes ?? []).map(v => [v.identity, v.basisPoints])),
    [data]
  );
  const movedByIdentity = useMemo(
    () =>
      new Map(
        (data?.overridesByValidator ?? []).flatMap(o =>
          o.identity
            ? [
                [
                  o.identity,
                  tallySum(overrideEffect(o, bpByIdentity.get(o.identity)))
                ] as const
              ]
            : []
        )
      ),
    [data, bpByIdentity]
  );

  // Voters and non-voters in one list.
  const rows = useMemo<ValidatorRow[]>(
    () =>
      data
        ? [
            ...data.votes.map(v => ({
              identity: v.identity,
              voteAccount: v.voteAccount,
              name: v.name,
              choice: v.choice ?? 'none',
              basisPoints: v.basisPoints,
              stake: v.stake,
              overridden: movedByIdentity.get(v.identity) ?? 0,
              votedAt: v.votedAt
            })),
            ...data.nonVoters.map(v => ({
              identity: v.identity,
              voteAccount: v.voteAccount,
              name: v.name,
              choice: 'none',
              basisPoints: null,
              stake: v.stake,
              overridden: tallySum(v.overrides),
              votedAt: null
            }))
          ]
        : [],
    [data, movedByIdentity]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.choice] = (c[r.choice] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = useMemo(
    () => (filter === 'all' ? rows : rows.filter(r => r.choice === filter)),
    [rows, filter]
  );
  const table = useAdvanceTable({
    columns: rowColumns,
    data: shown,
    sortable: true,
    pagination: true,
    pageSize: 10,
    getRowId: v => v.identity,
    resetPageKey: `${address}:${filter}`,
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
  const obv = data.overridesByValidator;
  // Overrides by what they changed (see overrideEffect), largest first;
  // dust under 1 SOL left out.
  const effects = obv
    .map(o => {
      const moved = overrideEffect(
        o,
        o.identity ? bpByIdentity.get(o.identity) : null
      );
      return { o, moved, total: tallySum(moved) };
    })
    .filter(e => e.total >= 1e9)
    .sort((a, b) => b.total - a.total);
  const movedFromVoters = effects
    .filter(e => e.o.validatorVoted)
    .reduce((a, e) => a + e.total, 0);
  const movedFromNonVoters = effects
    .filter(e => !e.o.validatorVoted)
    .reduce((a, e) => a + e.total, 0);
  const reVoted = Math.max(
    0,
    obv.reduce((a, o) => a + tallySum(o.tally), 0) -
      movedFromVoters -
      movedFromNonVoters
  );

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
              sublabel={`${data.nonVoters.length.toLocaleString()} staked validators didn't`}
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Overridden"
              value={compactSol(movedFromVoters + movedFromNonVoters)}
              sublabel={`stakers' own votes that changed the tally · ${compactSol(reVoted)} more re-voted the same`}
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
          title="Validators"
          icon="users"
          info="Every validator staked in the snapshot epoch: its vote (or none), its stake then, and how much of it its stakers voted themselves."
        >
          <AdvanceTableProvider {...table}>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <SearchBox
                placeholder="Search validators"
                onChange={e =>
                  table.setGlobalFilter(e.target.value || undefined)
                }
              />
              <ButtonGroup size="sm">
                {FILTERS.filter(
                  ([k]) => k === 'all' || (counts[k] ?? 0) > 0
                ).map(([k, label]) => (
                  <ToggleButton
                    key={k}
                    id={`gov-filter-${k}`}
                    type="radio"
                    name="gov-filter"
                    variant="soft-secondary"
                    value={k}
                    checked={filter === k}
                    onChange={() => setFilter(k)}
                  >
                    {label}{' '}
                    <span className="text-body-tertiary fw-normal">
                      {(counts[k] ?? 0).toLocaleString()}
                    </span>
                  </ToggleButton>
                ))}
              </ButtonGroup>
            </div>
            <AdvanceTable
              tableProps={{ size: 'sm', className: 'data-table fs-9 mb-0' }}
            />
            <AdvanceTableFooter />
          </AdvanceTableProvider>
        </SectionCard>

        <SectionCard
          title="Staker Overrides"
          icon="corner-down-right"
          info="Stakers can vote their own stake instead of leaving it to their validator. Only overrides that changed something count here: stake changed to a different choice than the validator's, or voted where the validator didn't vote. Stake pools appear by name (svmgov lets a pool's manager vote its stake); everyone else by address."
        >
          {effects.length || data.largeOverrides.length ? (
            <>
              <p className="fs-9 mb-3">
                Overridden by stakers, counting only what changed:{' '}
                <span className="fw-semibold">
                  {compactSol(movedFromVoters)}
                </span>{' '}
                overridden to a different choice than their validator&apos;s,
                and{' '}
                <span className="fw-semibold">
                  {compactSol(movedFromNonVoters)}
                </span>{' '}
                counted for validators that didn&apos;t vote.{' '}
                <span className="text-body-tertiary">
                  Another {compactSol(reVoted)} re-voted their validator&apos;s
                  choice, which changes nothing, so it isn&apos;t counted here.
                </span>
              </p>
              <Row className="g-4">
                <Col xs={12} xl={7}>
                  <Table
                    size="sm"
                    className="data-table compact-rows fs-9 mb-0"
                  >
                    <thead>
                      <tr>
                        <th>Validator</th>
                        <th>Its vote</th>
                        <th>Overridden to</th>
                        <th className="text-end">Stakers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allObv ? effects : effects.slice(0, 10)).map(
                        ({ o, moved }) => (
                          <tr key={o.voteAccount ?? o.identity}>
                            <td>
                              <ValidatorLink
                                identity={o.identity}
                                name={o.name}
                              />
                            </td>
                            <td>
                              {o.validatorVoted ? (
                                <VoteChoice
                                  choice={o.validatorChoice}
                                  basisPoints={
                                    o.identity
                                      ? bpByIdentity.get(o.identity)
                                      : null
                                  }
                                />
                              ) : (
                                <span className="text-body-tertiary">
                                  Didn&apos;t vote
                                </span>
                              )}
                            </td>
                            <td>
                              <TallyChoices tally={moved} />
                            </td>
                            <td className="text-end font-monospace">
                              {o.stakers?.toLocaleString() ?? '—'}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </Table>
                  {effects.length > 10 && (
                    <button
                      type="button"
                      className="btn btn-link p-0 fs-10 mt-2"
                      onClick={() => setAllObv(a => !a)}
                    >
                      {allObv ? 'Show fewer' : `Show all ${effects.length}`}
                    </button>
                  )}
                </Col>
                <Col xs={12} xl={5}>
                  {data.largeOverrides.length > 0 && (
                    <Table
                      size="sm"
                      className="data-table compact-rows fs-9 mb-0"
                    >
                      <thead>
                        <tr>
                          <th title="Stakers voting 10,000 SOL or more of their own stake, with any choice - including their validators' own">
                            Largest stakers (any choice)
                          </th>
                          <th>Vote</th>
                          <th className="text-end">Validators</th>
                          <th className="text-end">Stake</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.largeOverrides.map(o => (
                          <tr key={o.delegator}>
                            <td>
                              {o.pool ? (
                                <span
                                  title={`${o.kind === 'stake-pool' ? 'Stake pool' : (o.kind ?? 'Pool')} manager ${o.delegator}${o.poolAccounts?.length ? ` · pool ${o.poolAccounts.join(', ')}` : ''}`}
                                >
                                  <span className="fw-semibold">{o.pool}</span>
                                  <span className="badge badge-soft badge-soft-info ms-2">
                                    pool
                                  </span>
                                </span>
                              ) : (
                                <span
                                  className="font-monospace"
                                  title={o.delegator}
                                >
                                  {short(o.delegator)}
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
                </Col>
              </Row>
            </>
          ) : (
            <UntrackedState>
              No staker override changed anything.
            </UntrackedState>
          )}
        </SectionCard>

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
