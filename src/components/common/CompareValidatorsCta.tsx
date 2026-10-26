import FeatherIcon from 'feather-icons-react';
import { Link } from 'react-router';

interface Props {
  /** Pre-fill Validator A on the compare page with this nodeAddress. */
  prefillNodeAddress?: string;
}

const CompareValidatorsCta = ({ prefillNodeAddress }: Props = {}) => (
  <Link
    to={
      prefillNodeAddress
        ? `/leaderboards/voting/compare?a=${prefillNodeAddress}`
        : '/leaderboards/voting/compare'
    }
    className="d-flex align-items-center bg-body-emphasis rounded border border-translucent p-3 text-decoration-none text-body h-100"
  >
    <FeatherIcon
      icon="git-pull-request"
      size={20}
      className="text-primary me-3 flex-shrink-0"
    />
    <div className="flex-grow-1 min-w-0">
      <p className="mb-0 fw-bolder">Compare Validators</p>
      <p className="text-body-tertiary fs-9 mb-0 mt-1">
        Side-by-side rankings, missed credits, and missed slots over recent
        epochs.
      </p>
    </div>
    <FeatherIcon
      icon="arrow-right"
      size={16}
      className="text-body-tertiary ms-2 flex-shrink-0"
    />
  </Link>
);

export default CompareValidatorsCta;
