import { IS_TESTNET_SITE } from 'helpers/apiEndpoint';

// The two public sites; switching keeps the page you're on.
const SITES = [
  { value: 'mainnet', label: 'Mainnet', origin: 'https://app.vx.tools' },
  { value: 'testnet', label: 'Testnet', origin: 'https://testnet.vx.tools' }
];

/**
 * Mainnet <-> testnet, on the production and testnet.vx.tools builds (the
 * staging build has the API selector instead). Goes to the other site on
 * the same path - a validator or slot that only exists on one cluster
 * gets that page's not-found state.
 */
const ClusterSwitch = () => {
  const current = IS_TESTNET_SITE ? 'testnet' : 'mainnet';
  return (
    <select
      aria-label="Cluster"
      title="Switch between the mainnet and testnet dashboards"
      value={current}
      onChange={e => {
        const site = SITES.find(s => s.value === e.target.value);
        if (site && site.value !== current)
          window.location.href =
            site.origin + window.location.pathname + window.location.search;
      }}
      className="topbar-pill topbar-select"
    >
      {SITES.map(s => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
};

export default ClusterSwitch;
