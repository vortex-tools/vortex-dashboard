import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faRobot } from '@fortawesome/free-solid-svg-icons';
import { IS_STAGING } from 'helpers/apiEndpoint';
import useCluster from 'hooks/useCluster';
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

export const routes: RouteItems[] = [
  {
    label: 'overview',
    labelDisabled: true,
    pages: [
      {
        name: 'Home',
        icon: 'home',
        path: '/'
      },
      // All-validators status table.
      {
        name: 'Validators',
        icon: 'server',
        path: '/validators'
      }
    ]
  },
  // The cluster as a whole.
  {
    label: 'cluster',
    pages: [
      // How spread out the stake is (clients, providers, countries).
      {
        name: 'Decentralization',
        icon: 'globe',
        path: '/decentralization'
      },
      // Client upgrade progress.
      {
        name: 'Client Versions',
        icon: 'activity',
        path: '/client-versions'
      },
      // Feature gates: what's active, what activates next.
      {
        name: 'Feature Gates',
        icon: 'toggle-right',
        path: '/features'
      },
      // Governance proposals (staging only until the API serves them in
      // production).
      ...(IS_STAGING
        ? [{ name: 'Governance', icon: 'check-square', path: '/governance' }]
        : [])
    ]
  },
  {
    label: 'leaderboards',
    pages: [
      {
        name: 'Voting',
        icon: 'bar-chart-2',
        path: '/leaderboards/voting'
      },
      {
        name: 'Block Income',
        icon: 'dollar-sign',
        path: '/leaderboards/block-income'
      }
    ]
  },
  {
    label: 'developers',
    pages: [
      {
        name: 'Usage',
        icon: faRobot,
        path: '/usage'
      }
    ]
  }
];

/**
 * The nav, following the cluster's consensus (see useConsensus): while
 * Tower is current, `routes` as-is. Once Alpenglow is active, the
 * Consensus (participation) leaderboard leads the leaderboards and Tower
 * voting moves to a "historical" group. Testnet (by the API's cluster)
 * has no block income, no client-upgrade data and only Alpenglow worth
 * showing: Block Income, Client Versions and Tower voting are left out of
 * the nav (their pages still answer direct links).
 */
export const useNavRoutes = (): RouteItems[] => {
  const { alpenglowActive } = useConsensus();
  const { isTestnet } = useCluster();
  const all = useNavRoutesFor(alpenglowActive);
  return useMemo(
    () =>
      !isTestnet
        ? all
        : all
            .filter(g => g.label !== 'historical')
            .map(g => ({
              ...g,
              pages: g.pages.filter(
                r =>
                  r.path !== '/leaderboards/block-income' &&
                  r.path !== '/client-versions' &&
                  (!alpenglowActive || r.path !== '/leaderboards/voting')
              )
            }))
            .filter(g => g.pages.length > 0),
    [all, isTestnet, alpenglowActive]
  );
};

const useNavRoutesFor = (alpenglowActive: boolean): RouteItems[] =>
  useMemo(() => {
    if (!alpenglowActive) return routes;
    const voting = (r: Route) => r.path === '/leaderboards/voting';
    return routes.flatMap(group => {
      // The live view sits with the overview pages once Alpenglow is on.
      if (group.label === 'overview')
        return [
          {
            ...group,
            pages: [
              ...group.pages,
              {
                name: 'Live Consensus',
                icon: 'radio',
                path: '/live'
              }
            ]
          }
        ];
      if (group.label !== 'leaderboards') return [group];
      return [
        {
          ...group,
          pages: [
            {
              name: 'Consensus',
              icon: 'award',
              // Clicking the group itself goes to Overall.
              path: '/leaderboards/consensus',
              pages: [
                {
                  name: 'Overall',
                  path: '/leaderboards/consensus',
                  isActive: consensusView('overall')
                },
                {
                  name: 'Voting',
                  path: '/leaderboards/consensus?view=voting',
                  isActive: consensusView('voting')
                },
                {
                  name: 'Production',
                  path: '/leaderboards/consensus?view=production',
                  isActive: consensusView('production')
                }
              ]
            },
            ...group.pages.filter(r => !voting(r))
          ]
        },
        {
          label: 'historical',
          pages: group.pages
            .filter(voting)
            .map(r => ({ ...r, name: 'Voting (Tower)' }))
        }
      ];
    });
  }, [alpenglowActive]);
