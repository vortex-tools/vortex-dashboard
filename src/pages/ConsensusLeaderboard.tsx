import { parseConsensusView } from 'helpers/consensusBoards';
import OverallLeaderboard from 'pages/OverallLeaderboard';
import ParticipationLeaderboard from 'pages/ParticipationLeaderboard';
import ProducerLeaderboard from 'pages/ProducerLeaderboard';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext } from 'react';
import { useParams, useSearchParams } from 'react-router';

/**
 * /leaderboards/consensus[/epoch/:epoch][?view=]: one leaderboard, three
 * views of the epoch - Overall (default: voting and production rewards
 * together), Voting (participation) and Production (block producers).
 */
const ConsensusLeaderboard = () => {
  const { epoch: epochParam } = useParams();
  const [params] = useSearchParams();
  const view = parseConsensusView(params.get('view'));
  const currentEpoch =
    useContext(VortexDataContext)?.currentEpochState.epoch ?? null;
  const parsed = epochParam ? Number.parseInt(epochParam) : NaN;
  const epoch = Number.isNaN(parsed) ? currentEpoch : parsed;
  return view === 'voting' ? (
    <ParticipationLeaderboard />
  ) : view === 'production' ? (
    <ProducerLeaderboard />
  ) : (
    <OverallLeaderboard epoch={epoch} />
  );
};

export default ConsensusLeaderboard;
