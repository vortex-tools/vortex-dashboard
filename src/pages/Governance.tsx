import DelayedSpinner from 'components/common/DelayedSpinner';
import UntrackedState from 'components/common/UntrackedState';
import {
  PhaseBadge,
  VerdictBadge,
  VoteBar,
  epochSpan,
  pct,
  proposalName,
  proposalTag
} from 'components/governance/governance';
import {
  GOVERNANCE_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

/**
 * Solana governance (the svmgov program): every proposal, newest first,
 * with its phase, how the stake voted, turnout and the verdict under the
 * proposal's own rule. Voting happens on the Foundation's site.
 */
const Governance = () => {
  const context = useContext(VortexDataContext);
  const slice = context?.governanceProposalsState;
  const fetchData = slice?.fetchData;
  const data = slice?.data.get(GOVERNANCE_KEY);
  useEffect(() => {
    fetchData?.(GOVERNANCE_KEY);
  }, [fetchData]);
  const proposals = [...(data?.proposals ?? [])].sort(
    (a, b) => (b.index ?? 0) - (a.index ?? 0)
  );

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
            Governance isn&apos;t available from this API yet.
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
              <th style={{ minWidth: '12rem' }}>
                Vote (for · against · abstain)
              </th>
              <th className="text-end">For</th>
              <th className="text-end">Turnout</th>
              <th className="text-end">Voters</th>
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
                  {proposalTag(p) && (
                    <div className="fs-10 text-body-tertiary font-monospace">
                      {proposalTag(p)}
                    </div>
                  )}
                </td>
                <td className="text-nowrap">
                  <div className="d-flex gap-1 flex-wrap">
                    <PhaseBadge phase={p.phase} />
                    <VerdictBadge result={p.verdict?.result} />
                  </div>
                </td>
                <td className="align-middle">
                  <VoteBar
                    values={p.tallies ?? {}}
                    threshold={p.verdict?.rule?.threshold}
                  />
                </td>
                <td className="text-end font-monospace">
                  {pct(
                    p.verdict?.rule?.abstainCounted === false
                      ? p.forShareExAbstain
                      : p.forShare
                  )}
                </td>
                <td className="text-end font-monospace">{pct(p.turnout)}</td>
                <td className="text-end font-monospace">
                  {p.voters?.toLocaleString() ?? '—'}
                </td>
                <td className="text-end text-body-tertiary text-nowrap pe-3">
                  {epochSpan(p)?.replace(/^Epochs? /, '') ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="fs-10 text-body-tertiary mt-3 mb-0">
        Tallies are stake-weighted, after stakers&apos; overrides. The program
        records only the tallies; whether a proposal passed follows the rule in
        its own text (quorum, threshold, whether abstain counts), shown on each
        proposal.
      </p>
    </div>
  );
};

export default Governance;
