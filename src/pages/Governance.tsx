import Badge from 'components/base/Badge';
import DelayedSpinner from 'components/common/DelayedSpinner';
import UntrackedState from 'components/common/UntrackedState';
import {
  PhaseBadge,
  RULE,
  THRESHOLD,
  VerdictBadge,
  VoteBar,
  bySgpDesc,
  epochSpan,
  pct,
  proposalName,
  ruleShare,
  sgpTag
} from 'components/governance/governance';
import {
  GOVERNANCE_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

/**
 * Solana governance (the svmgov program, mainnet): every proposal, newest
 * first, with its phase, verdict, how the stake voted and turnout. Voting
 * itself happens elsewhere.
 */
const Governance = () => {
  const context = useContext(VortexDataContext);
  const slice = context?.governanceProposalsState;
  const fetchData = slice?.fetchData;
  const data = slice?.data.get(GOVERNANCE_KEY);
  useEffect(() => {
    fetchData?.(GOVERNANCE_KEY);
  }, [fetchData]);
  const proposals = [...(data?.proposals ?? [])].sort(bySgpDesc);

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col-auto">
          <h3>Governance</h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Solana governance proposals and how validators voted
          </p>
        </div>
      </div>

      {!data ? (
        slice?.error ? (
          <UntrackedState>
            Governance isn&apos;t available from this API (it is mainnet only).
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading proposals…" />
        )
      ) : !proposals.length ? (
        <UntrackedState>No proposals recorded yet.</UntrackedState>
      ) : (
        <Table
          responsive
          className="data-table fs-9 mx-n3 mb-0"
          style={{ width: 'calc(100% + 2rem)' }}
        >
          <thead>
            <tr>
              <th className="ps-3">Proposal</th>
              <th>Status</th>
              <th style={{ minWidth: '12rem' }}>For · Against · Abstain</th>
              <th
                className="text-end"
                title="For as a share of all votes (For + Against + Abstain): what the constitution rule judges"
              >
                For
              </th>
              <th className="text-end">Turnout</th>
              <th className="text-end">Validators voted</th>
              <th className="text-end pe-3">Epochs</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(p => (
              <tr key={p.address}>
                <td className="ps-3">
                  <Link to={`/governance/${p.address}`} className="fw-semibold">
                    {proposalName(p)}
                  </Link>
                  {sgpTag(p) && (
                    <div className="fs-10 text-body-tertiary font-monospace">
                      {sgpTag(p)}
                    </div>
                  )}
                </td>
                <td>
                  <div className="d-flex gap-1 flex-wrap">
                    <PhaseBadge phase={p.phase} />
                    <VerdictBadge verdict={p.verdict} projected={p.projected} />
                  </div>
                </td>
                <td className="align-middle">
                  {/* The mark is the pass line on the whole bar: what the
                      constitution's rule (all votes) is judged on. */}
                  <VoteBar
                    tally={p.tally}
                    threshold={p.rule === 'constitution' ? THRESHOLD : null}
                  />
                </td>
                <td
                  className="text-end font-monospace"
                  title={
                    p.rule
                      ? `Under the ${RULE[p.rule]?.label.toLowerCase() ?? p.rule} rule`
                      : undefined
                  }
                >
                  {pct(ruleShare(p))}
                </td>
                <td className="text-end font-monospace">{pct(p.turnout)}</td>
                <td className="text-end font-monospace">
                  {p.validatorVotes?.toLocaleString() ?? '—'}
                </td>
                <td className="text-end text-body-tertiary text-nowrap pe-3">
                  {epochSpan(p) ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="fs-10 text-body-tertiary mt-3 mb-0">
        Votes are weighted by each validator&apos;s stake in the snapshot epoch,
        after stakers&apos; own votes (overrides). The program records only the
        tallies; the verdict applies the proposal&apos;s rule - so far always
        the Solana Constitution&apos;s: For at least two thirds of all votes
        (For + Against + Abstain), with a third of the stake voting. For share
        is the share that rule counts; the bar is marked at two thirds.
      </p>
    </div>
  );
};

export default Governance;
