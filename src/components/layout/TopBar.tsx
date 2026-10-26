import ApiSelector from 'components/layout/ApiSelector';
import ClusterSwitch from 'components/layout/ClusterSwitch';
import ThemeToggle from 'components/layout/ThemeToggle';
import { IS_STAGING } from 'helpers/apiEndpoint';
import useCluster from 'hooks/useCluster';
import { useAppContext } from 'providers/AppProvider';
import { Link } from 'react-router';

const IS_TESTNET_SITE = import.meta.env.VITE_DEPLOY_ENV === 'testnet';

const isMainnet = (cluster: string | null) =>
  !cluster || cluster === 'mainnet-beta' || cluster === 'mainnet';

/**
 * "vortex explorer", with the cluster named when it isn't mainnet (from
 * /epochs/current; testnet.vx.tools says so before that answers) so its
 * data is never taken for mainnet's - else "staging" on the staging build.
 */
const Brand = () => {
  const { cluster } = useCluster();
  const qualifier = IS_TESTNET_SITE
    ? 'testnet'
    : !isMainnet(cluster)
      ? cluster
      : IS_STAGING
        ? 'staging'
        : null;
  return (
    <Link
      to="/"
      className="vx-brand"
      title={
        isMainnet(cluster) ? undefined : `This data is from Solana ${cluster}`
      }
    >
      <span className="vx-brand-name">vortex </span>
      {qualifier && `${qualifier} `}
      {/* Phones: a qualified brand drops "explorer" so the pills fit. */}
      <span className={qualifier ? 'd-none d-sm-inline' : undefined}>
        explorer
      </span>
    </Link>
  );
};

/**
 * The fixed bar across the top: the menu button (below lg), the brand,
 * and on the right the build stamp (staging), the API picker (staging) or
 * mainnet / testnet switch, and the theme toggle.
 */
const TopBar = () => {
  const { config, setSidebarOpen } = useAppContext();
  return (
    <header className="vx-topbar">
      <button
        type="button"
        className="vx-menu-button"
        aria-label="Menu"
        aria-expanded={config.sidebarOpen}
        onClick={() => setSidebarOpen(!config.sidebarOpen)}
      >
        <span />
        <span />
        <span />
      </button>
      <Brand />
      <div className="vx-topbar-end">
        {IS_STAGING && import.meta.env.VITE_SOURCE_URL && (
          <a
            href={`${import.meta.env.VITE_SOURCE_URL}/commit/${__VX_BUILD__}`}
            target="_blank"
            rel="noreferrer"
            className="d-none d-sm-inline font-monospace fs-10 text-body-tertiary"
            title={`Build ${__VX_BUILD__}`}
          >
            {__VX_BUILD__.slice(0, 7)}
          </a>
        )}
        {IS_STAGING ? <ApiSelector /> : <ClusterSwitch />}
        <ThemeToggle />
      </div>
    </header>
  );
};

export default TopBar;
