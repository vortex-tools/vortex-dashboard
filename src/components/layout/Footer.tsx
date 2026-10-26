import { faRobot } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { API_ENDPOINT } from 'helpers/apiEndpoint';

// The API host this build talks to (or the staging picker's).
const apiHost = (() => {
  try {
    return new URL(API_ENDPOINT).host;
  } catch {
    return API_ENDPOINT;
  }
})();

/** Under every page: copyright, the API (its llms.txt) and the
 *  geolocation credit, the version. */
const Footer = () => (
  <footer className="vx-footer text-body-tertiary">
    <span className="text-body">{new Date().getFullYear()} &copy; Vortex</span>
    <span>
      Powered by{' '}
      <a
        href={`${API_ENDPOINT}/llms.txt`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-body-tertiary"
      >
        {apiHost}
        <FontAwesomeIcon icon={faRobot} className="ms-1" />
      </a>
      {/* DB-IP Lite's CC BY 4.0 license asks for this credit wherever
          its geolocation (country, continent, city) is shown. */}
      {' · '}
      <a
        href="https://db-ip.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-body-tertiary"
      >
        IP Geolocation by DB-IP
      </a>
    </span>
    <span>v{import.meta.env.VITE_VERSION}</span>
  </footer>
);

export default Footer;
