import {
  CONSENSUS_VIEWS,
  CONSENSUS_VIEW_LABEL,
  ConsensusView,
  consensusPath
} from 'helpers/consensusBoards';
import { Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';

const SUBTITLE: Record<ConsensusView, string> = {
  overall: 'Alpenglow rewards earned from voting and block production',
  voting: 'How each validator’s votes made it into reward certificates',
  production:
    'How each leader’s blocks went: skips, vote inclusion, finalization'
};

/** Title and the Overall / Voting / Production switch (keeps the epoch). */
const ConsensusHeader = ({
  view,
  epoch,
  currentEpoch
}: {
  view: ConsensusView;
  epoch: number | null;
  currentEpoch: number | null;
}) => (
  <Row className="page-header align-items-end justify-content-between g-3">
    <Col xs="auto">
      <h3>Consensus Leaderboard</h3>
      <p className="text-body-tertiary lh-sm mb-0 mt-1">{SUBTITLE[view]}</p>
    </Col>
    <Col xs="auto">
      <div className="btn-group btn-group-sm" role="group" aria-label="View">
        {CONSENSUS_VIEWS.map(v => (
          <Link
            key={v}
            to={consensusPath(v, epoch, currentEpoch)}
            className={`btn ${v === view ? 'btn-primary' : 'btn-soft-secondary'}`}
            aria-current={v === view ? 'page' : undefined}
          >
            {CONSENSUS_VIEW_LABEL[v]}
          </Link>
        ))}
      </div>
    </Col>
  </Row>
);

export const consensusBreadcrumbs = [
  { label: 'Home', url: '/' },
  { label: 'Consensus Leaderboard', active: true }
];

export default ConsensusHeader;
