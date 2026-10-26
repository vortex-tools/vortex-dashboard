/**
 * "Blackhole pairs": a voter whose votes almost never make it into one
 * producer's reward certificates while landing elsewhere - a broken path
 * between the two. They stay in every score; the dashboard just makes them
 * easy to see.
 */
export const NEVER_REACHES_RATE = 0.9;
export const NEVER_REACHES_MIN_SLOTS = 8;

/** Missed >= 90% of a producer's (>= 8) slots: its votes never reach it. */
export const neverReaches = (missed: number, slots: number) =>
  slots >= NEVER_REACHES_MIN_SLOTS && missed / slots >= NEVER_REACHES_RATE;

export const NeverReachesBadge = () => (
  <span
    className="badge badge-soft badge-soft-danger ms-2"
    title={`Its votes missed ${NEVER_REACHES_RATE * 100}%+ of this producer's slots (at least ${NEVER_REACHES_MIN_SLOTS}) while landing elsewhere: a broken path between the two`}
  >
    Never reaches
  </span>
);

/** One line above a per-producer misses table. */
export const UnreachableSummary = ({
  producers,
  missed
}: {
  producers: number;
  missed: number;
}) =>
  producers > 0 ? (
    <p className="fs-9 mb-2">
      <span className="text-danger fw-semibold">
        Its votes never reach {producers.toLocaleString()}{' '}
        {producers === 1 ? 'producer' : 'producers'}
      </span>{' '}
      <span className="text-body-tertiary">
        ({missed.toLocaleString()} missed slots with them): check the path
        between the two - peering, firewall, region.
      </span>
    </p>
  ) : null;
