import FeatherIcon from 'feather-icons-react';

interface EmptyEpochStateProps {
  epoch?: number;
  subject?: string;
}

const EmptyEpochState = ({
  epoch,
  subject = 'records'
}: EmptyEpochStateProps) => {
  const epochLabel =
    epoch !== undefined ? `epoch ${epoch}` : 'the selected epoch';
  return (
    <div className="d-flex flex-column align-items-center text-center py-6 px-4">
      <FeatherIcon icon="inbox" size={32} className="text-body-tertiary mb-3" />
      <h5 className="text-body-emphasis mb-2">
        No {subject} available for {epochLabel}
      </h5>
      <p className="text-body-tertiary mb-0 fs-9">
        The maintainer has been notified of the issue.
      </p>
    </div>
  );
};

export default EmptyEpochState;
