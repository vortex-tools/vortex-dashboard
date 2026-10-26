import PageBreadcrumb from 'components/common/PageBreadcrumb';
import ValidatorSearch from 'components/common/ValidatorSearch';
import useCluster from 'hooks/useCluster';
import useConsensus from 'hooks/useConsensus';
import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

export type ValidatorTab =
  | 'overview'
  | 'voting'
  | 'production'
  | 'earnings'
  | 'block-income'
  | 'staking';

const TABS: Array<{ key: ValidatorTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'voting', label: 'Voting' },
  { key: 'production', label: 'Production' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'block-income', label: 'Block Income' },
  { key: 'staking', label: 'Staking' }
];

/** A validator page's URL: the Overview, or a tab (Voting and Production
 *  optionally at an epoch). */
export const validatorTabPath = (
  address: string,
  tab: ValidatorTab = 'overview',
  epoch: number | null = null
) =>
  tab === 'overview'
    ? `/validator/${address}`
    : `/validator/${address}/${tab}${
        epoch != null && (tab === 'voting' || tab === 'production')
          ? `/epoch/${epoch}`
          : ''
      }`;

/**
 * The header every validator tab shares: breadcrumb, the name (with the
 * share button), a jump-to-validator search that keeps the tab (and
 * epoch), and the tab bar. `toolbar` goes on its own line under the tab
 * bar, centered (the Voting / Production epoch picker).
 */
const ValidatorPageHeader = ({
  address,
  name,
  nodeAddress,
  tab,
  epoch = null,
  toolbar
}: {
  /** The URL's address (node or vote); tabs and search keep it. */
  address: string;
  name: string;
  nodeAddress?: string | null;
  tab: ValidatorTab;
  /** Voting / Production: the epoch shown, kept when jumping. */
  epoch?: number | null;
  toolbar?: ReactNode;
}) => {
  const navigate = useNavigate();
  const { alpenglowActive } = useConsensus();
  const { isTestnet, blockIncomeTracked } = useCluster();
  // Before Alpenglow, voting is the Tower record and there's no
  // production record; testnet stake isn't moved by stakers, and its
  // block income isn't tracked.
  const tabs = TABS.filter(
    t =>
      (alpenglowActive || t.key !== 'production') &&
      (!isTestnet || t.key !== 'staking') &&
      (blockIncomeTracked || t.key !== 'block-income')
  );
  const to = (t: ValidatorTab) =>
    !alpenglowActive && t === 'voting'
      ? `/validator/${address}/votes`
      : validatorTabPath(address, t);
  const crumbs = [
    { label: 'Home', url: '/' },
    tab === 'overview'
      ? { label: name, active: true }
      : { label: name, url: validatorTabPath(address) },
    ...(tab === 'overview'
      ? []
      : [{ label: TABS.find(t => t.key === tab)!.label, active: true }])
  ];
  return (
    <>
      <PageBreadcrumb items={crumbs} />
      <div className="validator-title d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
        <div className="d-flex flex-wrap align-items-center gap-3 min-w-0">
          <h3 className="mb-0 text-truncate">{name}</h3>
        </div>
        <div style={{ width: '22rem', maxWidth: '100%' }}>
          <ValidatorSearch
            placeholder="Jump to a validator…"
            onSelect={v =>
              navigate(
                tab === 'overview'
                  ? validatorTabPath(v.nodeAddress)
                  : !alpenglowActive && tab === 'voting'
                    ? `/validator/${v.nodeAddress}/votes`
                    : validatorTabPath(v.nodeAddress, tab, epoch)
              )
            }
          />
        </div>
      </div>
      <div
        className={`mx-n3 px-3 pt-1 border-top border-bottom border-translucent ${toolbar ? 'mb-0' : 'mb-3'}`}
      >
        {/* -1px: the active tab's underline covers the bar's border line
            (no gap between them). */}
        <ul
          className="nav nav-underline fs-9 flex-nowrap overflow-auto column-gap-2 column-gap-sm-3"
          style={{ marginBottom: -1 }}
        >
          {tabs.map(t => (
            <li key={t.key} className="nav-item">
              <Link
                to={to(t.key)}
                className={`nav-link text-nowrap${t.key === tab ? ' active' : ''}`}
                aria-current={t.key === tab ? 'page' : undefined}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {toolbar && (
        <div className="d-flex justify-content-center my-3">{toolbar}</div>
      )}
    </>
  );
};

export default ValidatorPageHeader;
