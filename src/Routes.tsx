import { IS_STAGING, NETWORK_TAB } from 'helpers/apiEndpoint';
import { ComponentType, lazy } from 'react';
import RouteError from 'pages/error/RouteError';
import MainLayout from 'layouts/MainLayout';
import {
  Navigate,
  RouteObject,
  createBrowserRouter,
  useLocation,
  useParams,
  useSearchParams
} from 'react-router';
import Error404 from 'pages/error/Error404';
import App from 'App';
import TowerGate from 'components/common/TowerGate';
import Home from 'pages/Home';
import { reportNavigation } from 'components/layout/NavProgress';

// Every page but Home is its own chunk: Home is the usual landing and
// stays in the main bundle. They're all fetched in the background once the
// app is up (prefetchPages, from main.tsx), so moving between pages doesn't
// wait on a download - the page shows at once, in its own loading state.
// MainLayout's Suspense covers a page reached before its chunk is in.
type PageModule = { default: ComponentType };
const pageLoads: Array<() => Promise<PageModule>> = [];
/** React.lazy over a once-only load, which prefetchPages can start early. */
const page = (load: () => Promise<PageModule>) => {
  let started: Promise<PageModule> | null = null;
  const once = () => (started ??= load());
  pageLoads.push(once);
  return lazy(once);
};

/** Fetch every page's chunk, one at a time, in the browser's idle time. */
export const prefetchPages = () => {
  const idle = (f: () => void) =>
    'requestIdleCallback' in window
      ? window.requestIdleCallback(f, { timeout: 4000 })
      : setTimeout(f, 200);
  const next = (i: number) => {
    if (i >= pageLoads.length) return;
    idle(() => {
      pageLoads[i]()
        .catch(() => undefined)
        .finally(() => next(i + 1));
    });
  };
  next(0);
};
const ValidatorEarningsTab = page(() => import('pages/ValidatorEarningsTab'));
const ValidatorFees = page(() => import('pages/ValidatorFees'));
const ValidatorStaking = page(() => import('pages/ValidatorStaking'));
const VoteHistory = page(() => import('pages/VoteHistory'));
const ClusterVoteStats = page(() => import('pages/ClusterVoteStats'));
const IncomeLeaderboard = page(() => import('pages/IncomeLeaderboard'));
const CompareVoting = page(() => import('pages/CompareVoting'));
const VotingLeaderboard = page(() => import('pages/VotingLeaderboard'));
const ValidatorOverview = page(() => import('pages/ValidatorOverview'));
const VoteStats = page(() => import('pages/VoteStats'));
const Usage = page(() => import('pages/Usage'));
const ConsensusLeaderboard = page(() => import('pages/ConsensusLeaderboard'));
const LiveConsensus = page(() => import('pages/LiveConsensus'));
const ConsensusRecordRedirect = page(
  () => import('pages/ConsensusRecordRedirect')
);
const ValidatorDivergentVotes = page(
  () => import('pages/ValidatorDivergentVotes')
);
const ValidatorProducedBlocks = page(
  () => import('pages/ValidatorProducedBlocks')
);
const ValidatorNetwork = page(() => import('pages/ValidatorNetwork'));
const SlotPage = page(() => import('pages/SlotPage'));
const Validators = page(() => import('pages/Validators'));
const ClientVersions = page(() => import('pages/ClientVersions'));
const FeatureGatePage = page(() => import('pages/FeatureGatePage'));
const FeatureGates = page(() => import('pages/FeatureGates'));
const SimdPage = page(() => import('pages/SimdPage'));
const StakePool = page(() => import('pages/StakePool'));
const StakePools = page(() => import('pages/StakePools'));
const Activity = page(() => import('pages/Activity'));
const Simds = page(() => import('pages/Simds'));
const Governance = page(() => import('pages/Governance'));
const GovernanceProposal = page(() => import('pages/GovernanceProposal'));
const Decentralization = page(() => import('pages/Decentralization'));
// Staging only (not prefetched elsewhere): see the route below.
const BlockBuilders = IS_STAGING
  ? page(() => import('pages/BlockBuilders'))
  : () => null;

// Inlined at build time. Staging-only pages are absent from the production
// route table (and tree-shaken out of its bundle).

// Redirect helpers for backwards-compat with the pre-nav-refactor URLs.
// /leaderboards/producers[/epoch/:epoch] -> the consensus leaderboard's
// Producing view, same epoch.
// The Network tab, outside staging: the validator's page.
const RedirectNetwork = () => {
  const { address } = useParams();
  return <Navigate to={`/validator/${address ?? ''}`} replace />;
};

const RedirectAlpenglow = () => {
  const [params] = useSearchParams();
  const v = params.get('v');
  return (
    <Navigate to={v ? `/validator/${v}` : '/leaderboards/consensus'} replace />
  );
};

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
              // Block builders: staging only until the API's per-block
              // labels reach production.
              ...(IS_STAGING
                ? [
                    { path: '/block-builders', element: <BlockBuilders /> },
                    {
                      path: '/block-builders/epoch/:epoch',
                      element: <BlockBuilders />
                    }
                  ]
                : []),
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

              // Mainnet's TowerBFT -> Alpenglow migration is done: its pages go
              // to the live Alpenglow page, a share link to its validator (as
              // the Worker's 301s).
              { path: '/alpenglow', element: <RedirectAlpenglow /> },
              { path: '/alpenglow/*', element: <RedirectAlpenglow /> },

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
                },
                {
                  path: `/validator/:address/network${e}`,
                  // Staging only for now: elsewhere the validator's page.
                  element: NETWORK_TAB ? (
                    <ValidatorNetwork />
                  ) : (
                    <RedirectNetwork />
                  )
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
// The navigation bar's target, as soon as the router has it.
router.subscribe(state => reportNavigation(state.location.key));

export default routes;
