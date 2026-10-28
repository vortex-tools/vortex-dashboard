import {
  API_ENDPOINT,
  API_OPTIONS,
  IS_MOCK_API,
  MOCK_API,
  setApiEndpoint
} from 'helpers/apiEndpoint';

/** Staging only: which API the dashboard talks to (reloads on change). */
const ApiSelector = () => {
  // A build pointed at an endpoint outside the list still shows it.
  const current = IS_MOCK_API ? MOCK_API : API_ENDPOINT;
  const options = API_OPTIONS.some(o => o.url === current)
    ? API_OPTIONS
    : [...API_OPTIONS, { label: API_ENDPOINT, url: API_ENDPOINT }];
  return (
    <select
      aria-label="API endpoint"
      title={
        IS_MOCK_API
          ? `API: ${API_ENDPOINT}, with mocked routes (src/mock)`
          : `API: ${API_ENDPOINT}`
      }
      value={current}
      onChange={e => setApiEndpoint(e.target.value)}
      className="topbar-pill topbar-select"
    >
      {options.map(o => (
        <option key={o.url} value={o.url}>
          {o.label}
        </option>
      ))}
    </select>
  );
};

export default ApiSelector;
