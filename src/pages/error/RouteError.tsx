import FeatherIcon from 'feather-icons-react';
import { Link, useRouteError } from 'react-router';

/**
 * A page that threw while rendering: say so inside the layout (the
 * sidebar keeps working) instead of the router's bare developer screen.
 * The error goes to the console for anyone who wants it.
 */
const RouteError = () => {
  const error = useRouteError();
  console.error(error);
  return (
    <div className="d-flex flex-column align-items-start gap-3 bg-body-emphasis rounded border border-translucent p-4 my-4">
      <div className="d-flex align-items-center gap-2">
        <FeatherIcon icon="alert-triangle" size={18} className="text-warning" />
        <h5 className="mb-0">This page hit an error</h5>
      </div>
      <p className="fs-9 text-body-secondary mb-0">
        Something on it failed to render. Reloading usually fixes it; if it
        keeps happening, let us know which page.
      </p>
      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
        <Link to="/" className="btn btn-soft-secondary btn-sm">
          Home
        </Link>
      </div>
    </div>
  );
};

export default RouteError;
