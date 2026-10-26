import SectionCard from 'components/common/SectionCard';
import {
  VerdictBadge,
  VoteChoice,
  compactSol,
  proposalName,
  proposalTag
} from 'components/governance/governance';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Col, Table } from 'react-bootstrap';
import { Link } from 'react-router';

/** A validator's governance record, in its own grid column: its vote on
 *  each proposal (or that it didn't vote). Nothing until the API serves
 *  it. */
const GovernanceCard = ({ identity }: { identity: string }) => {
  const context = useContext(VortexDataContext);
  const fetchData = context?.validatorGovernanceState.fetchData;
  const data = context?.validatorGovernanceState.data.get(identity);
  useEffect(() => {
    if (identity) fetchData?.(identity);
  }, [identity, fetchData]);
  if (!data?.records.length) return null;
  const records = [...data.records].sort(
    (a, b) => (b.proposal.index ?? 0) - (a.proposal.index ?? 0)
  );
  return (
    <Col xs={12} lg={6}>
      <SectionCard
        title="Governance"
        icon="check-square"
        linkTo="/governance"
        linkLabel="All proposals"
      >
        <Table size="sm" className="data-table compact-rows fs-9 mb-0">
          <thead>
            <tr>
              <th>Proposal</th>
              <th>Its vote</th>
              <th className="text-end">Stake</th>
              <th className="text-end">Result</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.proposal.address}>
                <td>
                  <Link to={`/governance/${r.proposal.address}`}>
                    {proposalName(r.proposal)}
                  </Link>
                  {proposalTag(r.proposal) && (
                    <span className="text-body-tertiary font-monospace fs-10 ms-2">
                      {proposalTag(r.proposal)}
                    </span>
                  )}
                </td>
                <td>
                  {r.bp ? (
                    <VoteChoice bp={r.bp} />
                  ) : (
                    <span className="text-body-tertiary">Didn&apos;t vote</span>
                  )}
                </td>
                <td className="text-end font-monospace">
                  {compactSol(r.effective ?? r.stake)}
                </td>
                <td className="text-end">
                  <VerdictBadge result={r.proposal.verdict?.result} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>
    </Col>
  );
};

export default GovernanceCard;
