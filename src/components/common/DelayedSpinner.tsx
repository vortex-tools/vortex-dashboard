import useDelayedLoading from 'hooks/useDelayedLoading';
import { Spinner } from 'react-bootstrap';

interface Props {
  /** Whether the underlying data is loading. Controls both spinner visibility
   *  and the delayed/min-duration behavior from useDelayedLoading. */
  loading: boolean;
  /** Screen-reader label announced while loading. */
  label?: string;
  /** py-* utility (default `py-6`). */
  padding?: string;
}

/**
 * Spinner with a fade-in delay + a minimum on-screen duration to avoid
 * flashing for fast requests. When `loading` becomes false we keep the
 * container mounted but invisible for layout stability so `useDelayedLoading`
 * can finish its fade-out grace period.
 */
const DelayedSpinner = ({
  loading,
  label = 'Loading…',
  padding = 'py-6'
}: Props) => {
  const visible = useDelayedLoading(loading);
  return (
    <div
      className={`d-flex justify-content-center align-items-center ${padding}${
        visible ? '' : ' invisible'
      }`}
      role="status"
      aria-live="polite"
    >
      <Spinner animation="border" variant="primary" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
};

export default DelayedSpinner;
