import { lazy } from 'react';
import RouteError from 'pages/error/RouteError';
import MainLayout from 'layouts/MainLayout';
import {
  Navigate,
  RouteObject,
  createBrowserRouter,
  useLocation,
  useParams
} from 'react-router';
import Error404 from 'pages/error/Error404';
import App from 'App';
import TowerGate from 'components/common/TowerGate';
import Home from 'pages/Home';

// Every page but Home loads on first visit (its own chunk): Home is the
// usual landing and stays in the main bundle. MainLayout's Suspense
// shows while one loads.
const ValidatorEarningsTab = lazy(() => import('pages/ValidatorEarningsTab'));
const ValidatorFees = lazy(() => import('pages/ValidatorFees'));
const ValidatorStaking = lazy(() => import('pages/ValidatorStaking'));
const VoteHistory = lazy(() => import('pages/VoteHistory'));
const ClusterVoteStats = lazy(() => import('pages/ClusterVoteStats'));
const IncomeLeaderboard = lazy(() => import('pages/IncomeLeaderboard'));
const CompareVoting = lazy(() => import('pages/CompareVoting'));
const VotingLeaderboard = lazy(() => import('pages/VotingLeaderboard'));
const ValidatorOverview = lazy(() => import('pages/ValidatorOverview'));
const VoteStats = lazy(() => import('pages/VoteStats'));
const Usage = lazy(() => import('pages/Usage'));
const ConsensusLeaderboard = lazy(() => import('pages/ConsensusLeaderboard'));
const LiveConsensus = lazy(() => import('pages/LiveConsensus'));
const ConsensusRecordRedirect = lazy(
  () => import('pages/ConsensusRecordRedirect')
);
const ValidatorDivergentVotes = lazy(
  () => import('pages/ValidatorDivergentVotes')
);
const ValidatorProducedBlocks = lazy(
  () => import('pages/ValidatorProducedBlocks')
);
const SlotPage = lazy(() => import('pages/SlotPage'));
const Validators = lazy(() => import('pages/Validators'));
const ClientVersions = lazy(() => import('pages/ClientVersions'));
const FeatureGatePage = lazy(() => import('pages/FeatureGatePage'));
const FeatureGates = lazy(() => import('pages/FeatureGates'));
const SimdPage = lazy(() => import('pages/SimdPage'));
const StakePool = lazy(() => import('pages/StakePool'));
const StakePools = lazy(() => import('pages/StakePools'));
const Activity = lazy(() => import('pages/Activity'));
const Simds = lazy(() => import('pages/Simds'));
const Governance = lazy(() => import('pages/Governance'));
const GovernanceProposal = lazy(() => import('pages/GovernanceProposal'));
const Decentralization = lazy(() => import('pages/Decentralization'));

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
// The Fees tab's older URLs: /validator/:a/income (the page before the
// tabs) and /block-income (its name before Fees).
const ValidatorFeesRedirect = () => {
  const { address } = useParams();
  return <Navigate to={`/validator/${address}/fees`} replace />;
};
const RedirectOldIncome = () => {
  const { validatorAddress } = useParams();
  return <Navigate to={`/validator/${validatorAddress}/fees`} replace />;
};
const RedirectOldClusterVoteStatsEpoch = () => {
  const { epoch } = useParams();
  return <Navigate to={`/leaderboards/voting/epoch/${epoch}`} replace />;
};
// A renamed page: the same query string (its filters) at the new path.
const RedirectKeepSearch = ({ to }: { to: string }) => {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
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
                path: '/leaderboards/fees',
                element: <IncomeLeaderboard />
              },
              // Its names before Fees.
              {
                path: '/leaderboards/block-income',
                element: <Navigate to="/leaderboards/fees" replace />
              },
              {
                path: '/leaderboards/income',
                element: <Navigate to="/leaderboards/fees" replace />
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
              { path: '/client-versions', element: <ClientVersions /> },
              {
                path: '/cluster-health',
                element: <Navigate to="/client-versions" replace />
              },
              { path: '/features', element: <FeatureGates /> },
              { path: '/feature/:id', element: <FeatureGatePage /> },
              { path: '/simds', element: <Simds /> },
              { path: '/pools', element: <StakePools /> },
              { path: '/activity', element: <Activity /> },
              // Its first name: keeps the filters.
              {
                path: '/vote-account-changes',
                element: <RedirectKeepSearch to="/activity" />
              },
              { path: '/pool/:name', element: <StakePool /> },
              { path: '/simd/:simd', element: <SimdPage /> },
              { path: '/governance', element: <Governance /> },
              {
                path: '/governance/:address',
                element: <GovernanceProposal />
              },

              // Mainnet's TowerBFT -> Alpenglow migration: timing and readiness.
              // The migration is done (both clusters on Alpenglow).
              { path: '/alpenglow/*', element: <Navigate to="/" replace /> },

              // What the cluster is doing now (Alpenglow).
              { path: '/status', element: <LiveConsensus /> },
              { path: '/live', element: <Navigate to="/status" replace /> },

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
                path: '/validator/:address/fees',
                element: <ValidatorFees />
              },
              {
                path: '/validator/:address/block-income',
                element: <ValidatorFeesRedirect />
              },
              // The fees page's URL, before the tabs.
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
                element: <Navigate to="/leaderboards/fees" replace />
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
