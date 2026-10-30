import {
  faRobot,
  faBookOpen,
  faCommentDots,
  faTerminal
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { Col, Row } from 'react-bootstrap';

// The API this build (or, on staging, the selected API) talks to: testnet
// and staging each serve their own llms.txt.
const LLMS_URL = `${API_ENDPOINT}/llms.txt`;

const breadcrumbItems: Crumb[] = [
  { label: 'Home', url: '/' },
  { label: 'Usage', active: true }
];

const EXAMPLE_PROMPTS = [
  'Which validators had the highest vote accuracy in the most recent epoch?',
  'Compare the fees of two validators over the last 10 epochs.',
  'Show me the worst-performing validators by missed credits this epoch.'
];

const Usage = () => {
  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />

      {/* Hero */}
      <div className="text-center py-5 mb-4">
        <div
          className="d-inline-flex align-items-center justify-content-center bg-primary-subtle text-primary rounded-circle mb-3"
          style={{ width: '4rem', height: '4rem' }}
        >
          <FontAwesomeIcon icon={faRobot} size="2x" />
        </div>
        <h2 className="mb-2">Use Vortex with AI</h2>
        <p
          className="text-body-tertiary mb-0 mx-auto"
          style={{ maxWidth: '36rem' }}
        >
          Vortex publishes an{' '}
          <a
            href="https://llmstxt.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            llms.txt
          </a>{' '}
          index so AI assistants and agents can discover and query our Solana
          validator data directly.
        </p>
      </div>

      {/* URL callout */}
      <div className="bg-body-emphasis rounded border border-translucent p-4 mb-4 text-center">
        <p className="text-body-tertiary fs-9 mb-2 text-uppercase">
          Point your assistant at
        </p>
        <a
          href={LLMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fs-6 fw-semibold text-decoration-none font-monospace"
        >
          {LLMS_URL}
        </a>
      </div>

      {/* How-to cards */}
      <Row className="g-3 mb-3">
        <Col xs={12} md={4}>
          <div className="bg-body-emphasis rounded border border-translucent p-3 h-100">
            <div className="d-flex align-items-center mb-2">
              <FontAwesomeIcon
                icon={faCommentDots}
                className="text-primary me-2"
              />
              <h6 className="mb-0">In a chat</h6>
            </div>
            <p className="text-body-tertiary fs-9 mb-0">
              Paste the URL into Claude or ChatGPT and ask about validator vote
              quality, fees, or rankings.
            </p>
          </div>
        </Col>
        <Col xs={12} md={4}>
          <div className="bg-body-emphasis rounded border border-translucent p-3 h-100">
            <div className="d-flex align-items-center mb-2">
              <FontAwesomeIcon
                icon={faTerminal}
                className="text-primary me-2"
              />
              <h6 className="mb-0">In an agent</h6>
            </div>
            <p className="text-body-tertiary fs-9 mb-0">
              Wire the URL into Claude Code, Cursor, or any agent framework so
              it can fetch endpoints listed in the index.
            </p>
          </div>
        </Col>
        <Col xs={12} md={4}>
          <div className="bg-body-emphasis rounded border border-translucent p-3 h-100">
            <div className="d-flex align-items-center mb-2">
              <FontAwesomeIcon
                icon={faBookOpen}
                className="text-primary me-2"
              />
              <h6 className="mb-0">Browse the schema</h6>
            </div>
            <p className="text-body-tertiary fs-9 mb-0">
              The index links the endpoint reference and example payloads — open
              it directly to read along.
            </p>
          </div>
        </Col>
      </Row>

      {/* Example prompts */}
      <div className="bg-body-emphasis rounded border border-translucent p-4">
        <h6 className="mb-3">Try asking</h6>
        <ul className="list-unstyled mb-0">
          {EXAMPLE_PROMPTS.map(prompt => (
            <li
              key={prompt}
              className="py-2 border-bottom border-translucent text-body fs-9 fst-italic"
            >
              “{prompt}”
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Usage;
