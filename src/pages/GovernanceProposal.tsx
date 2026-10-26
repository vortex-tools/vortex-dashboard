import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import DelayedSpinner from 'components/common/DelayedSpinner';
import Pager from 'components/common/Pager';
import { clientBase, clientFork, isKnownClient } from 'helpers/clients';
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
import {
  Fragment,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { ButtonGroup, Col, Row, Table, ToggleButton } from 'react-bootstrap';
import { Link, useParams } from 'react-router';

/** "◎142,844,092". */
const fullSol = (lamports: number) =>
  `◎${Math.round(lamports / 1e9).toLocaleString()}`;
/** Rows a page in the largest-stakers table. */
const OV_PAGE = 10;
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

const sumRows = (
  key: string,
  rows: GovernanceBreakdownRow[]
): GovernanceBreakdownRow => ({
  key,
  name: key,
  validators: rows.reduce((a, r) => a + (r.validators ?? 0), 0),
  voted: rows.reduce((a, r) => a + (r.voted ?? 0), 0),
  stake: rows.reduce((a, r) => a + (r.stake ?? 0), 0),
  notVoting: rows.reduce((a, r) => a + (r.notVoting ?? 0), 0),
  tally: {
    for: rows.reduce((a, r) => a + (r.tally?.for ?? 0), 0),
    against: rows.reduce((a, r) => a + (r.tally?.against ?? 0), 0),
    abstain: rows.reduce((a, r) => a + (r.tally?.abstain ?? 0), 0)
  }
});

const BreakdownLine = ({
  row,
  label,
  sub = false
}: {
  row: GovernanceBreakdownRow;
  label: ReactNode;
  sub?: boolean;
}) => (
  <div className={sub ? 'ps-3' : undefined}>
    <div
      className={`d-flex justify-content-between gap-2 mb-1 ${sub ? 'fs-10 text-body-secondary' : 'fs-9 fw-semibold'}`}
    >
      <span className="text-truncate">{label}</span>
      <span className="text-body-tertiary text-nowrap fw-normal">
        {row.voted ?? 0}/{row.validators ?? 0} voted ·{' '}
        <span className="font-monospace">{compactSol(row.stake)}</span>
      </span>
    </div>
    <VoteBar tally={row.tally} notVoted={row.notVoting} height={sub ? 4 : 6} />
  </div>
);

/** The outcome by client: each base client (Agave, Firedancer, ...) with
 *  its forks (Jito, BAM, Harmonic, ...; the plain client as "plain") under
 *  it. Ids we can't place go under Other. */
const ClientBreakdownCard = ({ rows }: { rows: GovernanceBreakdownRow[] }) => {
  const groups = new Map<string, GovernanceBreakdownRow[]>();
  for (const r of rows) {
    const base = clientBase(r.key);
    groups.set(base, [...(groups.get(base) ?? []), r]);
  }
  const sorted = [...groups.entries()]
    .map(([base, members]) => ({
      base,
      total: sumRows(base, members),
      members
    }))
    .sort((a, b) => (b.total.stake ?? 0) - (a.total.stake ?? 0));
  return (
    <SectionCard
      title="By Client"
      icon="cpu"
      info="Each base client with its block-building forks beneath (the plain client as 'plain'), from the snapshot epoch's recorded client. Bars: For / Against / Abstain, then the stake that didn't vote."
    >
      {sorted.length ? (
        <div className="d-flex flex-column gap-3">
          {sorted.map(g => (
            <div key={g.base} className="d-flex flex-column gap-2">
              <BreakdownLine row={g.total} label={g.base} />
              {g.members.length > 1 &&
                [...g.members]
                  .sort((a, b) => (b.stake ?? 0) - (a.stake ?? 0))
                  .map(m => (
                    <BreakdownLine
                      key={m.key}
                      row={m}
                      sub
                      label={
                        isKnownClient(m.key)
                          ? (clientFork(m.key) ?? 'plain')
                          : (m.name ?? m.key)
                      }
                    />
                  ))}
            </div>
          ))}
        </div>
      ) : (
        <UntrackedState>No breakdown.</UntrackedState>
      )}
    </SectionCard>
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
  const [filter, setFilter] = useState<Filter>('all');
  const [ovPage, setOvPage] = useState(0);
  useEffect(() => setOvPage(0), [address]);

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
  const voted = tallySum(p.tally);
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
        </div>
        <div className="col-auto d-flex flex-wrap align-items-center gap-2">
          <PhaseBadge phase={p.phase} />
        </div>
      </div>

      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} md={4} xl={2}>
            <StatCard
              label="Verdict"
              wrapSublabel
              mono={false}
              value={p.verdict ?? (p.projected ? `${p.projected} so far` : '—')}
              check={
                p.verdict === 'Accepted'
                  ? true
                  : p.verdict === 'Rejected'
                    ? false
                    : null
              }
              tone={p.verdict === 'Inconclusive' ? 'warning' : undefined}
              sublabel={
                p.official ? (
                  p.official.matches === false ? (
                    // Only a disagreement is worth spelling out.
                    <>
                      official: {p.official.status ?? '—'}
                      {p.official.source && (
                        <>
                          {' · '}
                          <a
                            href={p.official.source}
                            target="_blank"
                            rel="noreferrer"
                          >
                            source
                          </a>
                        </>
                      )}
                    </>
                  ) : p.official.source ? (
                    <a
                      href={p.official.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      official record
                    </a>
                  ) : (
                    'as officially recorded'
                  )
                ) : p.verdict ? (
                  'under the rule'
                ) : (
                  'not final yet'
                )
              }
            />
          </Col>
          <Col xs={6} md={4} xl={2}>
            <StatCard
              label="For"
              wrapSublabel
              value={
                <>
                  {pct(ruleShare(p))}
                  <span className="fs-9 fw-semibold text-body-tertiary">
                    {' '}
                    / {pct(THRESHOLD)}
                  </span>
                </>
              }
              sublabel={`of the ${p.rule === 'decisive' ? 'stake voting For or Against' : 'stake that voted'} · ${pct(THRESHOLD)} to pass`}
              check={ruleShare(p) != null ? ruleShare(p)! >= THRESHOLD : null}
            />
          </Col>
          <Col xs={6} md={4} xl={2}>
            <StatCard
              label="Turnout"
              wrapSublabel
              value={
                <>
                  {pct(p.turnout)}
                  {quorumShare != null && (
                    <span className="fs-9 fw-semibold text-body-tertiary">
                      {' '}
                      / {pct(quorumShare)}
                    </span>
                  )}
                </>
              }
              sublabel={
                quorumShare != null
                  ? `of the snapshot stake voted · ${pct(quorumShare)} quorum`
                  : 'of the snapshot stake voted'
              }
              check={quorumShare != null ? !!p.quorumMet : null}
            />
          </Col>
          <Col xs={6} md={4} xl={2}>
            <StatCard
              label="Validators Voted"
              wrapSublabel
              value={p.validatorVotes?.toLocaleString() ?? '—'}
              sublabel={`${data.nonVoters.length.toLocaleString()} staked validators didn't`}
            />
          </Col>
          <Col xs={6} md={4} xl={2}>
            <StatCard
              label="Overridden"
              wrapSublabel
              value={compactSol(movedFromVoters + movedFromNonVoters)}
              sublabel="stake whose vote its stakers changed"
            />
          </Col>
          <Col xs={6} md={4} xl={2}>
            <StatCard
              label="Proposal"
              mono={false}
              value={p.sgp ?? 'Text'}
              href={p.description ?? undefined}
              sublabel={p.description ? 'read the proposal' : 'no text linked'}
            />
          </Col>
        </Row>

        <Row className="g-3">
          <Col xs={12} lg={8}>
            <SectionCard
              title="Result"
              icon="check-square"
              info="Stake-weighted: each validator votes its stake in the snapshot epoch, less what its stakers voted themselves (their own choice). The program records only these tallies; the verdict applies the proposal's rule."
            >
              <Table size="sm" className="data-table fs-9 mb-0">
                <thead>
                  <tr>
                    <th>Vote</th>
                    <th className="text-end">Stake</th>
                    <th className="text-end">Of the stake that voted</th>
                    <th className="text-end">Of the snapshot stake</th>
                  </tr>
                </thead>
                <tbody>
                  {CHOICE.map(c => {
                    const v = p.tally?.[c.key] ?? 0;
                    return (
                      <tr key={c.key}>
                        <td>
                          <ChoiceTag choice={c.key} />
                        </td>
                        <td className="text-end font-monospace">
                          {fullSol(v)}
                        </td>
                        <td className="text-end font-monospace">
                          {pct(voted ? v / voted : null)}
                        </td>
                        <td className="text-end font-monospace">
                          {pct(p.snapshotStake ? v / p.snapshotStake : null)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="fw-semibold">
                    <td>Voted</td>
                    <td className="text-end font-monospace">
                      {fullSol(voted)}
                    </td>
                    <td className="text-end font-monospace">100%</td>
                    <td className="text-end font-monospace">
                      {pct(p.turnout)}
                    </td>
                  </tr>
                  <tr className="text-body-tertiary">
                    <td>Didn&apos;t vote</td>
                    <td className="text-end font-monospace">
                      {p.snapshotStake != null
                        ? fullSol(p.snapshotStake - voted)
                        : '—'}
                    </td>
                    <td />
                    <td className="text-end font-monospace">
                      {pct(
                        p.snapshotStake ? 1 - voted / p.snapshotStake : null
                      )}
                    </td>
                  </tr>
                </tbody>
              </Table>
              {p.contested && (
                <div className="bg-warning-subtle border border-warning-subtle rounded p-2 fs-9 mt-3">
                  <span className="fw-semibold">Contested.</span>{' '}
                  {p.contested.rule === 'decisive' && (
                    <>
                      Under the rule the proposal&apos;s own text used - two
                      thirds of For + Against, Abstain not counted - For is{' '}
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
                      <a
                        href={p.contested.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        The dispute
                      </a>
                    </>
                  )}
                </div>
              )}
            </SectionCard>
          </Col>
          <Col xs={12} lg={4}>
            <SectionCard title="Details" icon="file-text">
              <dl className="row fs-9 mb-0 gy-2">
                {(
                  [
                    ['Proposal', p.sgp ?? '—'],
                    ['Voting', epochSpan(p) ? `epochs ${epochSpan(p)}` : '—'],
                    [
                      'Stake snapshot',
                      p.snapshotEpoch != null
                        ? `epoch ${p.snapshotEpoch.toLocaleString()}${p.snapshotSlot != null ? ` · slot ${p.snapshotSlot.toLocaleString()}` : ''}`
                        : '—'
                    ],
                    [
                      'Created',
                      [
                        p.creationEpoch != null &&
                          `epoch ${p.creationEpoch.toLocaleString()}`,
                        p.creationTimestamp &&
                          new Date(
                            p.creationTimestamp * 1000
                          ).toLocaleDateString()
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'
                    ],
                    [
                      'Support',
                      p.supporters != null
                        ? `${p.supporters.toLocaleString()} validators · ${compactSol(p.clusterSupportLamports)}`
                        : '—'
                    ],
                    [
                      'Author',
                      p.author ? (
                        <span className="font-monospace" title={p.author}>
                          {short(p.author)}
                        </span>
                      ) : (
                        '—'
                      )
                    ]
                  ] as [string, ReactNode][]
                ).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="col-5 fw-normal text-body-tertiary">{k}</dt>
                    <dd className="col-7 mb-0">{v}</dd>
                  </Fragment>
                ))}
              </dl>
              {(p.simds.length > 0 || p.featureGates.length > 0) && (
                <p className="fs-9 mt-3 mb-0 pt-3 border-top border-translucent">
                  <span className="text-body-tertiary">
                    A For vote endorses{' '}
                  </span>
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
          </Col>
        </Row>

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
            <AdvanceTableFooter viewAll={false} />
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
              {data.largeOverrides.length > 0 && (
                <Table size="sm" className="data-table compact-rows fs-9 mb-0">
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
                    {data.largeOverrides
                      .slice(ovPage * OV_PAGE, (ovPage + 1) * OV_PAGE)
                      .map(o => (
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
              {data.largeOverrides.length > OV_PAGE && (
                <Pager
                  page={ovPage}
                  pages={Math.ceil(data.largeOverrides.length / OV_PAGE)}
                  onPrev={() => setOvPage(x => Math.max(0, x - 1))}
                  onNext={() =>
                    setOvPage(x =>
                      Math.min(
                        Math.ceil(data.largeOverrides.length / OV_PAGE) - 1,
                        x + 1
                      )
                    )
                  }
                  onPage={setOvPage}
                  total={data.largeOverrides.length}
                  pageSize={OV_PAGE}
                  shown={
                    data.largeOverrides.slice(
                      ovPage * OV_PAGE,
                      (ovPage + 1) * OV_PAGE
                    ).length
                  }
                />
              )}
              {data.otherStakers ? (
                <p className="fs-10 text-body-tertiary mt-2 mb-0">
                  {data.otherStakers.toLocaleString()} other stakers:{' '}
                  {compactSol(tallySum(data.otherOverrides))} together.
                </p>
              ) : null}
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
              <ClientBreakdownCard rows={data.breakdown.byClient} />
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
