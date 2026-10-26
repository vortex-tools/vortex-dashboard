import FeatherIcon from 'feather-icons-react';
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { latencyToCredits } from 'helpers/utils';

const BUCKETS_PER_EPOCH = 432;
const SLOTS_PER_BUCKET = 1000;
const MAX_SUGGESTIONS = 5;

type Suggestion = {
  bucket: number;
  // Specific slot inside the bucket that matched the query (omitted for the
  // default-deductions view). Highlighted in the dropdown for slot searches.
  matchedSlot?: number;
  deductions: number;
};

interface BucketSearchProps {
  voteAddress: string;
  epoch: number;
  epochStartSlot: number;
  /** Zero-indexed bucket the user is currently viewing. */
  bucketIndex: number;
  voterLatencies: number[] | undefined;
  idealLatencies: number[] | undefined;
  // When provided (Investigate modes), fast-back / fast-forward buttons
  // appear on the outside of the chevrons and jump to the
  // previous / next bucket in this set.
  interestingBuckets?: Set<number>;
}

const BucketSearch = ({
  voteAddress,
  epoch,
  epochStartSlot,
  bucketIndex,
  voterLatencies,
  idealLatencies,
  interestingBuckets
}: BucketSearchProps) => {
  const navigate = useNavigate();
  // Preserve query params (e.g. ?filter=, ?chart=, ?b=) when navigating
  // between buckets so the user's view settings survive.
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // When the bucket pill is clicked, the search input mounts and we forward
  // focus to it on the same render commit.
  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused]);

  // Buckets beyond what's been fetched (in-progress epochs) shouldn't be
  // navigable. `maxBucket` is the highest bucket index we have ANY data
  // for — using Math.ceil so the still-in-progress bucket (partial data)
  // is reachable, not just the last fully-fetched one.
  const fetchedSlots = Math.min(
    voterLatencies?.length ?? 0,
    idealLatencies?.length ?? 0
  );
  const maxBucket =
    fetchedSlots > 0
      ? Math.min(
          BUCKETS_PER_EPOCH,
          Math.ceil(fetchedSlots / SLOTS_PER_BUCKET)
        ) - 1
      : -1;

  // Per-bucket deduction totals (sum of optimalCredits - earnedCredits over
  // each bucket's 1000 slots). Used both to power the default top-5 list and
  // to rank slot-search results.
  const deductionsByBucket = useMemo(() => {
    const result = new Array<number>(BUCKETS_PER_EPOCH).fill(0);
    if (!voterLatencies || !idealLatencies) return result;
    const len = Math.min(voterLatencies.length, idealLatencies.length);
    for (let i = 0; i < len; i++) {
      const earned = latencyToCredits(voterLatencies[i]);
      const optimal = latencyToCredits(idealLatencies[i]);
      const b = Math.floor(i / SLOTS_PER_BUCKET);
      if (b < BUCKETS_PER_EPOCH) result[b] += optimal - earned;
    }
    return result;
  }, [voterLatencies, idealLatencies]);

  // Top buckets by deductions, used as the default-focus suggestion list.
  const topByDeductions = useMemo<Suggestion[]>(() => {
    return deductionsByBucket
      .map((deductions, bucket) => ({ bucket, deductions }))
      .filter(s => s.deductions > 0)
      .sort((a, b) => b.deductions - a.deductions)
      .slice(0, MAX_SUGGESTIONS);
  }, [deductionsByBucket]);

  const trimmed = query.trim();

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trimmed) return topByDeductions;
    if (!/^\d+$/.test(trimmed)) return [];

    const asNumber = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(asNumber)) return [];

    // Bucket number: 1..maxBucket+1 maps directly to a single suggestion.
    // Cap at maxBucket so we never suggest a bucket the API hasn't uploaded.
    if (asNumber >= 1 && asNumber <= maxBucket + 1) {
      const bucket = asNumber - 1;
      return [
        {
          bucket,
          deductions: deductionsByBucket[bucket] ?? 0
        }
      ];
    }

    // Slot search: match the query against slot numbers in the current
    // epoch, preferring slots whose decimal representation ENDS with the
    // query (LSD-first fuzzy match), falling back to substring matches.
    // Restricted to fetched buckets only.
    const epochEndSlot = epochStartSlot + (maxBucket + 1) * SLOTS_PER_BUCKET;
    const exact: Suggestion[] = [];
    const partial: Suggestion[] = [];
    for (let b = 0; b <= maxBucket; b++) {
      const bucketStart = epochStartSlot + b * SLOTS_PER_BUCKET;
      let suffixSlot = -1;
      let containsSlot = -1;
      for (let i = 0; i < SLOTS_PER_BUCKET; i++) {
        const slot = bucketStart + i;
        if (slot >= epochEndSlot) break;
        const s = String(slot);
        if (suffixSlot === -1 && s.endsWith(trimmed)) suffixSlot = slot;
        if (containsSlot === -1 && s.includes(trimmed)) containsSlot = slot;
        if (suffixSlot !== -1) break;
      }
      if (suffixSlot !== -1) {
        exact.push({
          bucket: b,
          matchedSlot: suffixSlot,
          deductions: deductionsByBucket[b] ?? 0
        });
      } else if (containsSlot !== -1) {
        partial.push({
          bucket: b,
          matchedSlot: containsSlot,
          deductions: deductionsByBucket[b] ?? 0
        });
      }
    }
    const sortByDeductions = (a: Suggestion, b: Suggestion) =>
      b.deductions - a.deductions;
    exact.sort(sortByDeductions);
    partial.sort(sortByDeductions);
    return [...exact, ...partial].slice(0, MAX_SUGGESTIONS);
  }, [trimmed, topByDeductions, deductionsByBucket, epochStartSlot, maxBucket]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [trimmed]);

  const showDropdown = focused && suggestions.length > 0;

  const goToBucket = (bucket: number) => {
    const search = searchParams.toString();
    const suffix = search ? `?${search}` : '';
    navigate(
      `/validator/${voteAddress}/votes/epoch/${epoch}/bucket/${bucket + 1}${suffix}`
    );
    setQuery('');
    setFocused(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = suggestions[highlightedIndex] ?? suggestions[0];
      if (target) goToBucket(target.bucket);
    } else if (e.key === 'Escape') {
      setFocused(false);
    }
  };

  const placeholder = 'Search bucket # or slot';

  const prevDisabled = bucketIndex <= 0;
  const nextDisabled = bucketIndex >= maxBucket;

  // Fast-back / fast-forward target the previous / next "interesting"
  // bucket (one that has Ok / Slow / Skipped slots). Only rendered when
  // the parent supplies an interesting-bucket set (Investigate modes).
  let prevInteresting: number | undefined;
  let nextInteresting: number | undefined;
  if (interestingBuckets) {
    for (const b of interestingBuckets) {
      if (
        b < bucketIndex &&
        (prevInteresting === undefined || b > prevInteresting)
      )
        prevInteresting = b;
      if (
        b > bucketIndex &&
        (nextInteresting === undefined || b < nextInteresting)
      )
        nextInteresting = b;
    }
  }

  return (
    <div className="d-flex align-items-stretch gap-2">
      {interestingBuckets && (
        <button
          type="button"
          className="btn btn-soft-secondary d-flex align-items-center justify-content-center px-2 py-2"
          onClick={() =>
            prevInteresting !== undefined && goToBucket(prevInteresting)
          }
          disabled={prevInteresting === undefined}
          aria-label="Previous bucket with notable slots"
          title="Previous bucket with notable slots"
        >
          <FeatherIcon icon="chevrons-left" size={18} />
        </button>
      )}
      <button
        type="button"
        className="btn btn-soft-secondary d-flex align-items-center justify-content-center px-2 py-2"
        onClick={() => goToBucket(bucketIndex - 1)}
        disabled={prevDisabled}
        aria-label="Previous bucket"
      >
        <FeatherIcon icon="chevron-left" size={18} />
      </button>
      <div className={`position-relative${focused ? ' flex-grow-1' : ''}`}>
        <div
          // min-height pins both states to the same height so the chevron
          // buttons (which sit at natural height via align-items-center on
          // the root) don't appear to shift when the wrapper expands. The
          // div itself owns the click + keyboard handlers when collapsed,
          // making the whole pill area the click target instead of just
          // the pill itself.
          className={`d-flex align-items-center bg-body-emphasis rounded border border-translucent ${
            focused ? 'w-100 ps-3 pe-3' : 'px-2'
          }`}
          style={{
            minHeight: '38px',
            ...(focused ? {} : { cursor: 'pointer' })
          }}
          onClick={
            focused
              ? undefined
              : () => {
                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                  setFocused(true);
                }
          }
          onKeyDown={
            focused
              ? undefined
              : e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (blurTimerRef.current)
                      clearTimeout(blurTimerRef.current);
                    setFocused(true);
                  }
                }
          }
          role={focused ? undefined : 'button'}
          tabIndex={focused ? undefined : 0}
          aria-label={
            focused ? undefined : `Bucket ${bucketIndex + 1}, click to search`
          }
        >
          {!focused ? (
            <>
              <FeatherIcon
                icon="search"
                size={14}
                className="text-body-tertiary me-2 flex-shrink-0"
              />
              <span className="badge bg-primary text-white">
                Bucket {bucketIndex + 1}
              </span>
            </>
          ) : (
            <>
              <FeatherIcon
                icon="search"
                size={16}
                className="text-body-tertiary me-2 flex-shrink-0"
              />
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                className="form-control border-0 bg-transparent p-0"
                // form-control sets `height: calc(1.5em + 0.75rem + 2px)`,
                // which makes the expanded wrapper taller than the collapsed
                // pill-only one and propagates to the chevron buttons via
                // align-items-stretch. Forcing height:auto keeps the row
                // height consistent across states.
                style={{ boxShadow: 'none', height: 'auto' }}
                placeholder={placeholder}
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  // Escape can leave the DOM input focused while we've
                  // cleared our React `focused` flag — typing after that
                  // should re-open the suggestions.
                  setFocused(true);
                }}
                onFocus={() => {
                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                  setFocused(true);
                }}
                onBlur={() => {
                  blurTimerRef.current = setTimeout(
                    () => setFocused(false),
                    150
                  );
                }}
                onKeyDown={onKeyDown}
                aria-label="Search buckets"
              />
            </>
          )}
        </div>

        {showDropdown && (
          <div
            className="position-absolute w-100 mt-1 bg-body-emphasis rounded border border-translucent shadow"
            style={{ zIndex: 10, maxHeight: '24rem', overflowY: 'auto' }}
          >
            {!trimmed && (
              <div className="text-body-tertiary fs-10 px-3 pt-2">
                Top buckets by deductions
              </div>
            )}
            <ul className="list-unstyled mb-0">
              {suggestions.map((s, i) => (
                <li key={`${s.bucket}-${s.matchedSlot ?? 'top'}`}>
                  <button
                    type="button"
                    className={`btn btn-link w-100 text-start text-decoration-none px-3 py-2 rounded-0${
                      i === highlightedIndex ? ' bg-body-highlight' : ''
                    }`}
                    onMouseDown={e => {
                      e.preventDefault();
                      goToBucket(s.bucket);
                    }}
                    onMouseEnter={() => setHighlightedIndex(i)}
                  >
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="d-flex flex-column">
                        <span className="text-body fw-semibold">
                          Bucket {s.bucket + 1}
                        </span>
                        {s.matchedSlot !== undefined && (
                          <span className="text-body-tertiary font-monospace fs-10">
                            slot {s.matchedSlot.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <span className="text-body-tertiary fs-10">
                        {s.deductions.toLocaleString()} credits
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-soft-secondary d-flex align-items-center justify-content-center px-2 py-2"
        onClick={() => goToBucket(bucketIndex + 1)}
        disabled={nextDisabled}
        aria-label="Next bucket"
      >
        <FeatherIcon icon="chevron-right" size={18} />
      </button>
      {interestingBuckets && (
        <button
          type="button"
          className="btn btn-soft-secondary d-flex align-items-center justify-content-center px-2 py-2"
          onClick={() =>
            nextInteresting !== undefined && goToBucket(nextInteresting)
          }
          disabled={nextInteresting === undefined}
          aria-label="Next bucket with notable slots"
          title="Next bucket with notable slots"
        >
          <FeatherIcon icon="chevrons-right" size={18} />
        </button>
      )}
    </div>
  );
};

export default BucketSearch;
