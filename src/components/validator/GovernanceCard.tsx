import SectionCard from 'components/common/SectionCard';
import {
  VerdictBadge,
  VoteChoice,
  bySgpDesc,
  compactSol,
  proposalName,
  sgpTag,
  tallySum
} from 'components/governance/governance';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Col, Table } from 'react-bootstrap';
import { Link } from 'react-router';

/** A validator's governance record, in its own grid column: its vote on
 *  each proposal (or that it didn't vote), and what its stakers overrode.
 *  Nothing off mainnet. */
const GovernanceCard = ({ identity }: { identity: string }) => {
  const context = useContext(VortexDataContext);
  const fetchData = context?.validatorGovernanceState.fetchData;
  const data = context?.validatorGovernanceState.data.get(identity);
  useEffect(() => {
    if (identity) fetchData?.(identity);
  }, [identity, fetchData]);
  if (!data?.proposals.length) return null;
  const rows = [...data.proposals].sort(bySgpDesc);
  return (
    <Col xs={12} lg={6}>
      <SectionCard
        title="Governance"
        icon="check-square"
        linkTo="/governance"
        linkLabel="All proposals"
        info="Its vote on each Solana governance proposal, weighted by its stake in the proposal's snapshot epoch, and how much of that stake its stakers voted themselves."
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
            {rows.map(r => (
              <tr key={r.address}>
                <td>
                  <Link to={`/governance/${r.address}`}>{proposalName(r)}</Link>
                  {sgpTag(r) && (
                    <span className="text-body-tertiary font-monospace fs-10 ms-2">
                      {sgpTag(r)}
                    </span>
                  )}
                  {r.overrides && tallySum(r.overrides.tally) > 0 && (
                    <div className="fs-10 text-body-tertiary">
                      {r.overrides.stakers?.toLocaleString()} stakers voted{' '}
                      {compactSol(tallySum(r.overrides.tally))} themselves
                    </div>
                  )}
                </td>
                <td>
                  {r.vote ? (
                    <VoteChoice
                      choice={r.vote.choice}
                      basisPoints={r.vote.basisPoints}
                    />
                  ) : (
                    <span className="text-body-tertiary">
                      {r.stake ? "Didn't vote" : 'Not staked'}
                    </span>
                  )}
                </td>
                <td className="text-end font-monospace">
                  {compactSol(r.stake)}
                </td>
                <td className="text-end">
                  <VerdictBadge verdict={r.verdict} />
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
