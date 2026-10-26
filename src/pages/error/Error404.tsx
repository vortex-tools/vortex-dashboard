import { Link } from 'react-router';

/** Any path the dashboard doesn't know. */
const Error404 = () => (
  <div className="flex-center flex-column text-center py-9 px-3 min-vh-100">
    <p
      className="fw-bolder text-primary mb-2 lh-1"
      style={{ fontSize: 'clamp(4rem, 14vw, 8rem)', letterSpacing: '-0.04em' }}
    >
      404
    </p>
    <h2 className="mb-3">Nothing here</h2>
    <p className="text-body-tertiary mb-4" style={{ maxWidth: '28rem' }}>
      That page doesn&apos;t exist - the link may be old, or the address
      mistyped.
    </p>
    <Link to="/" className="btn btn-primary">
      Go to the dashboard
    </Link>
  </div>
);

export default Error404;
