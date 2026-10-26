import RouteError from 'pages/error/RouteError';
import MainLayout from 'layouts/MainLayout';
import {
  Navigate,
  RouteObject,
  createBrowserRouter,
  useParams
} from 'react-router';
import Error404 from 'pages/error/Error404';
import ValidatorEarningsTab from 'pages/ValidatorEarningsTab';
import ValidatorFees from 'pages/ValidatorFees';
import ValidatorStaking from 'pages/ValidatorStaking';
import App from 'App';
import VoteHistory from 'pages/VoteHistory';
import ClusterVoteStats from 'pages/ClusterVoteStats';
import TowerGate from 'components/common/TowerGate';
import IncomeLeaderboard from 'pages/IncomeLeaderboard';
import Home from 'pages/Home';
import CompareVoting from 'pages/CompareVoting';
import VotingLeaderboard from 'pages/VotingLeaderboard';
import ValidatorOverview from 'pages/ValidatorOverview';
import VoteStats from 'pages/VoteStats';
import Usage from 'pages/Usage';
import ConsensusLeaderboard from 'pages/ConsensusLeaderboard';
import LiveConsensus from 'pages/LiveConsensus';
import ConsensusRecordRedirect from 'pages/ConsensusRecordRedirect';
import ValidatorDivergentVotes from 'pages/ValidatorDivergentVotes';
import ValidatorProducedBlocks from 'pages/ValidatorProducedBlocks';
import SlotPage from 'pages/SlotPage';
import Validators from 'pages/Validators';
import ClusterHealth from 'pages/ClusterHealth';
import FeatureGatePage from 'pages/FeatureGatePage';
import FeatureGates from 'pages/FeatureGates';
import Governance from 'pages/Governance';
import GovernanceProposal from 'pages/GovernanceProposal';
import Decentralization from 'pages/Decentralization';

// Inlined at build time. Staging-only pages are absent from the production
// route table (and tree-shaken out of its bundle).

// Redirect helpers for backwards-compat with the pre-nav-refactor URLs.
// /leaderboards/producers[/epoch/:epoch] -> the consensus leaderboard's
// Producing view, same epoch.
const RedirectProducers = () => {
  const { epoch } = useParams();
  return (
    <Navigate
      to={`/leaderboards/consensus${epoch ? `/epoch/${epoch}` : ''}?view=production`}
      replace
    />
  );
};

const RedirectOldVoteStats = () => {
  const { voteAddress } = useParams();
  return <Navigate to={`/validator/${voteAddress}/votes`} replace />;
};
const RedirectOldVoteHistory = () => {
  const { voteAddress, epoch } = useParams();
  return (
    <Navigate to={`/validator/${voteAddress}/votes/epoch/${epoch}`} replace />
  );
};
const RedirectOldVoteHistoryBucket = () => {
  const { voteAddress, epoch, bucket } = useParams();
  return (
    <Navigate
      to={`/validator/${voteAddress}/votes/epoch/${epoch}/bucket/${bucket}`}
      replace
    />
  );
};
// The Block Income tab's older URLs: /validator/:a/income (the page
// before the tabs) and /fees (the tab's first name).
const ValidatorFeesRedirect = () => {
  const { address } = useParams();
  return <Navigate to={`/validator/${address}/block-income`} replace />;
};
const RedirectOldIncome = () => {
  const { validatorAddress } = useParams();
  return (
    <Navigate to={`/validator/${validatorAddress}/block-income`} replace />
  );
};
const RedirectOldClusterVoteStatsEpoch = () => {
  const { epoch } = useParams();
  return <Navigate to={`/leaderboards/voting/epoch/${epoch}`} replace />;
};

const routes: RouteObject[] = [
  {
    element: <App />,
    children: [
      {
        path: '/',
        element: <MainLayout />,
        children: [
          // A page that throws shows RouteError inside the layout.
          {
            errorElement: <RouteError />,
            children: [
              // Landing: home page with search, cluster KPIs, and
              // leaderboard quick-launch.
              {
                index: true,
                element: <Home />
              },

              // Leaderboards (canonical).
              { path: '/leaderboards/voting', element: <VotingLeaderboard /> },
              {
                path: '/leaderboards/voting/compare',
                element: <CompareVoting />
              },
              {
                path: '/leaderboards/voting/epoch/:epoch',
                element: (
                  <TowerGate>
                    <ClusterVoteStats />
                  </TowerGate>
                )
              },
              {
                path: '/leaderboards/block-income',
                element: <IncomeLeaderboard />
              },
              {
                path: '/leaderboards/income',
                element: <Navigate to="/leaderboards/block-income" replace />
              },
              // The Tower production leaderboard is gone (block production is
              // the Alpenglow producers board). Redirect old links.
              {
                path: '/leaderboards/production',
                element: <Navigate to="/leaderboards/consensus" replace />
              },

              // The Alpenglow consensus leaderboard: Overall (default),
              // Voting and Producing views (?view=); says so on a Tower cluster.
              {
                path: '/leaderboards/consensus',
                element: <ConsensusLeaderboard />
              },
              {
                path: '/leaderboards/consensus/epoch/:epoch',
                element: <ConsensusLeaderboard />
              },

              // The block producers board is the leaderboard's Producing view.
              {
                path: '/leaderboards/producers',
                element: <RedirectProducers />
              },
              {
                path: '/leaderboards/producers/epoch/:epoch',
                element: <RedirectProducers />
              },

              // All-validators operational status.
              { path: '/validators', element: <Validators /> },
              { path: '/decentralization', element: <Decentralization /> },
              { path: '/cluster-health', element: <ClusterHealth /> },
              { path: '/features', element: <FeatureGates /> },
              { path: '/feature/:id', element: <FeatureGatePage /> },
              { path: '/governance', element: <Governance /> },
              {
                path: '/governance/:address',
                element: <GovernanceProposal />
              },

              // Mainnet's TowerBFT -> Alpenglow migration: timing and readiness.
              // The migration is done (both clusters on Alpenglow).
              { path: '/alpenglow/*', element: <Navigate to="/" replace /> },

              // What the cluster is doing now (Alpenglow).
              { path: '/live', element: <LiveConsensus /> },

              // One slot's whole story (Tower or Alpenglow).
              { path: '/slot/:slot', element: <SlotPage /> },

              // AI / agent usage splash.
              { path: '/usage', element: <Usage /> },

              // Validator pages (canonical). `:address` is currently passed
              // through to the underlying sub-page; the page component treats it
              // as whichever address (vote or node) its API expects. Phase 3 will
              // unify on nodeAddress via the /validators directory dump.
              { path: '/validator/:address', element: <ValidatorOverview /> },
              {
                path: '/validator/:address/earnings',
                element: <ValidatorEarningsTab />
              },
              {
                path: '/validator/:address/block-income',
                element: <ValidatorFees />
              },
              {
                path: '/validator/:address/fees',
                element: <ValidatorFeesRedirect />
              },
              // The block-income page's URL, before the tabs.
              {
                path: '/validator/:address/income',
                element: <ValidatorFeesRedirect />
              },
              {
                path: '/validator/:address/staking',
                element: <ValidatorStaking />
              },
              // The Voting and Production tabs (the consensus record).
              ...['', '/epoch/:epoch'].flatMap(e => [
                {
                  path: `/validator/:address/voting${e}`,
                  element: <ValidatorDivergentVotes />
                },
                {
                  path: `/validator/:address/production${e}`,
                  element: <ValidatorProducedBlocks />
                }
              ]),
              // The record's old URLs open those tabs.
              ...['', '/epoch/:epoch'].flatMap(e =>
                ['', '/votes', '/blocks'].map(p => ({
                  path: `/validator/:address/consensus${e}${p}`,
                  element: <ConsensusRecordRedirect />
                }))
              ),
              { path: '/validator/:address/votes', element: <VoteStats /> },
              {
                path: '/validator/:address/votes/epoch/:epoch',
                element: (
                  <TowerGate>
                    <VoteHistory />
                  </TowerGate>
                )
              },
              {
                path: '/validator/:address/votes/epoch/:epoch/bucket/:bucket',
                element: (
                  <TowerGate>
                    <VoteHistory />
                  </TowerGate>
                )
              },

              // Legacy URL redirects (replace old bookmarks; can be deleted after
              // the old URLs are fully deprecated).
              {
                path: '/cluster/vote-stats',
                element: <Navigate to="/leaderboards/voting" replace />
              },
              {
                path: '/cluster/vote-stats/epoch/:epoch',
                element: <RedirectOldClusterVoteStatsEpoch />
              },
              {
                path: '/cluster/income',
                element: <Navigate to="/leaderboards/block-income" replace />
              },
              {
                path: '/vote-stats/:voteAddress',
                element: <RedirectOldVoteStats />
              },
              {
                path: '/vote-history/:voteAddress/epoch/:epoch',
                element: <RedirectOldVoteHistory />
              },
              {
                path: '/vote-history/:voteAddress/epoch/:epoch/bucket/:bucket',
                element: <RedirectOldVoteHistoryBucket />
              },
              {
                path: '/income/:validatorAddress',
                element: <RedirectOldIncome />
              }
            ]
          }
        ]
      },
      {
        path: '*',
        element: <Error404 />
      }
    ]
  }
];

export const router = createBrowserRouter(routes);

export default routes;
