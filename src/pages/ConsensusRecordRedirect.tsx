import { recordPath } from 'components/validator/ConsensusRecordHeader';
import { Navigate, useLocation, useParams } from 'react-router';

/**
 * The consensus record's old URLs (/consensus[/epoch/N][/votes|/blocks])
 * open the validator page's Voting or Production tab: .../blocks and
 * #production links (the leaderboard's, old bookmarks) go to Production,
 * everything else to Voting.
 */
const ConsensusRecordRedirect = () => {
  const { address = '', epoch } = useParams();
  const { hash, pathname } = useLocation();
  const page =
    pathname.endsWith('/blocks') || hash === '#production' ? 'blocks' : 'votes';
  return (
    <Navigate
      to={recordPath(address, epoch != null ? Number(epoch) : null, page)}
      replace
    />
  );
};

export default ConsensusRecordRedirect;
