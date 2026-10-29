import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faRobot } from '@fortawesome/free-solid-svg-icons';
import useCluster from 'hooks/useCluster';
import { IS_STAGING } from 'helpers/apiEndpoint';
import useConsensus from 'hooks/useConsensus';
import { useMemo } from 'react';

/** A sidebar link: a Feather icon name, or a Font Awesome icon. */
export interface Route {
  name: string;
  icon?: string | IconDefinition;
  path: string;
  /** Sub-pages, listed under it (opened while one is current). */
  pages?: Route[];
  /** Whether the current location is this item (default: NavLink's path
   *  match) - for items that differ only by query, like ?view=. */
  isActive?: (loc: { pathname: string; search: string }) => boolean;
}

/** The consensus leaderboard's views, for the nav: active on the board's
 *  pages (any epoch) showing that view. */
const consensusView =
  (view: 'overall' | 'voting' | 'production') =>
  ({ pathname, search }: { pathname: string; search: string }) =>
    pathname.startsWith('/leaderboards/consensus') &&
    (new URLSearchParams(search).get('view') ?? 'overall').replace(
      'producing',
      'production'
    ) === view;

/** A titled group of sidebar links. */
export interface RouteItems {
  label: string;
  /** No group title (the first group). */
  labelDisabled?: boolean;
  pages: Route[];
}

// The cluster as a whole, in nav order (Status only once Alpenglow is on:
// it's the Alpenglow live view).
const clusterPages = (alpenglowActive: boolean): Route[] => [
  ...(alpenglowActive
    ? [{ name: 'Status', icon: 'radio', path: '/status' }]
    : []),
  // Client upgrade progress.
  { name: 'Versions', icon: 'activity', path: '/client-versions' },
  // Feature gates: what's active, what activates next.
  { name: 'Feature Gates', icon: 'toggle-right', path: '/features' },
  // SIMDs (/simds) is out of the nav for now: SIMD pages are reached
  // from Feature Gates.
  // Solana governance proposals (mainnet only).
  { name: 'Governance', icon: 'check-square', path: '/governance' },
  // Who stake pools and SFDP delegate to (mainnet only).
  { name: 'Stake Pools', icon: 'layers', path: '/pools' },
  // Key, commission and collector changes, withdrawals, failovers and
  // migrations, across validators. Staging only for now.
  ...(IS_STAGING
    ? [{ name: 'Activity', icon: 'activity', path: '/activity' }]
    : []),
  // How spread out the stake is (clients, providers, countries).
  { name: 'Decentralization', icon: 'globe', path: '/decentralization' }
];

const OVERVIEW: RouteItems = {
  label: 'overview',
  labelDisabled: true,
  pages: [
    { name: 'Home', icon: 'home', path: '/' },
    // All-validators status table.
    { name: 'Validators', icon: 'server', path: '/validators' }
  ]
};
const DEVELOPERS: RouteItems = {
  label: 'developers',
  pages: [{ name: 'Usage', icon: faRobot, path: '/usage' }]
};
const BLOCK_INCOME: Route = {
  name: 'Block Income',
  icon: 'dollar-sign',
  path: '/leaderboards/block-income'
};
const TOWER_VOTING: Route = {
  name: 'Voting',
  icon: 'bar-chart-2',
  path: '/leaderboards/voting'
};

/** The nav before Alpenglow: Tower voting and block income as the
 *  leaderboards. */
export const routes: RouteItems[] = [
  OVERVIEW,
  { label: 'cluster', pages: clusterPages(false) },
  { label: 'leaderboards', pages: [TOWER_VOTING, BLOCK_INCOME] },
  DEVELOPERS
];

/** The nav once Alpenglow is on: the consensus leaderboard's three views
 *  listed under Consensus (not a dropdown), block income in a section of
 *  its own for now, and Tower voting under Historical. */
const alpenglowRoutes: RouteItems[] = [
  OVERVIEW,
  { label: 'cluster', pages: clusterPages(true) },
  {
    label: 'consensus',
    pages: [
      {
        name: 'Overall',
        icon: 'award',
        path: '/leaderboards/consensus',
        isActive: consensusView('overall')
      },
      {
        name: 'Voting',
        icon: 'check-circle',
        path: '/leaderboards/consensus?view=voting',
        isActive: consensusView('voting')
      },
      {
        name: 'Production',
        icon: 'box',
        path: '/leaderboards/consensus?view=production',
        isActive: consensusView('production')
      }
    ]
  },
  { label: 'income', pages: [BLOCK_INCOME] },
  { label: 'historical', pages: [{ ...TOWER_VOTING, name: 'Voting (Tower)' }] },
  DEVELOPERS
];

/**
 * The nav, following the cluster's consensus (see useConsensus): `routes`
 * while Tower is current, `alpenglowRoutes` once Alpenglow is active.
 * Testnet (by the API's cluster) has no block income, no client-upgrade
 * data, governance or stake pools, and only Alpenglow worth showing:
 * those are left out of the nav (their pages still answer direct links).
 */
export const useNavRoutes = (): RouteItems[] => {
  const { alpenglowActive } = useConsensus();
  const { isTestnet } = useCluster();
  return useMemo(() => {
    const all = alpenglowActive ? alpenglowRoutes : routes;
    return !isTestnet
      ? all
      : all
          .filter(g => g.label !== 'historical')
          .map(g => ({
            ...g,
            pages: g.pages.filter(
              r =>
                r.path !== '/leaderboards/block-income' &&
                r.path !== '/client-versions' &&
                r.path !== '/governance' &&
                r.path !== '/pools' &&
                (!alpenglowActive || r.path !== '/leaderboards/voting')
            )
          }))
          .filter(g => g.pages.length > 0);
  }, [isTestnet, alpenglowActive]);
};
