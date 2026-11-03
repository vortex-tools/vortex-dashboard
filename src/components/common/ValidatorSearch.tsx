import FeatherIcon from 'components/base/FeatherIcon';
import {
  KeyboardEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useNavigate } from 'react-router';
import {
  VALIDATOR_STATUS_SUMMARY_KEY,
  Validator,
  VortexDataContext
} from 'providers/VortexDataProvider';

const truncateAddress = (addr: string) =>
  addr.length <= 20 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`;

interface ValidatorSearchProps {
  /**
   * Fires when the user picks a validator. When omitted, the component
   * navigates to `/validator/:nodeAddress` by default.
   */
  onSelect?: (validator: Validator) => void;
  placeholder?: string;
  /** Clears the input after a successful pick. Defaults to true. */
  clearOnSelect?: boolean;
  autoFocus?: boolean;
  /** A filter's size (a form-control-sm row) rather than the hero's. */
  compact?: boolean;
  /** In the top bar: shorter, and tinted like the bar until focused. */
  inBar?: boolean;
}

const ValidatorSearch = ({
  onSelect,
  placeholder,
  clearOnSelect = true,
  autoFocus,
  compact = false,
  inBar = false
}: ValidatorSearchProps) => {
  const context = useContext(VortexDataContext);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const directoryLoaded =
    context?.validatorDirectoryState.validators !== null &&
    context?.validatorDirectoryState.validators !== undefined;

  const results = useMemo((): Validator[] => {
    if (!context || !query.trim()) return [];
    return context.validatorDirectoryState.search(query, 10);
  }, [context, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  const showDropdown = focused && query.trim().length > 0;

  // Each one's share of stake: from the directory where it has stake
  // (vortex-data 85811ce); else the status summary, fetched the first time
  // the search is used (once a session, shared with the Validators page).
  const directory = context?.validatorDirectoryState.validators;
  const directoryTotal = useMemo(
    () =>
      directory?.some(v => v.activatedStake != null)
        ? directory.reduce((a, v) => a + (v.activatedStake ?? 0), 0)
        : null,
    [directory]
  );
  const fetchSummary = context?.validatorStatusSummaryState.fetchData;
  useEffect(() => {
    if (focused && !directoryTotal)
      fetchSummary?.(VALIDATOR_STATUS_SUMMARY_KEY);
  }, [focused, directoryTotal, fetchSummary]);
  const summary = context?.validatorStatusSummaryState.data.get(
    VALIDATOR_STATUS_SUMMARY_KEY
  );
  const shareOf = useMemo(() => {
    if (directoryTotal)
      return (v: Validator) =>
        v.activatedStake != null ? v.activatedStake / directoryTotal : null;
    if (!summary) return null;
    const total = summary.validators.reduce((a, v) => a + v.activatedStake, 0);
    const by = new Map<string, number>();
    for (const v of summary.validators)
      if (total) {
        by.set(v.voteAccount, v.activatedStake / total);
        by.set(v.identity, v.activatedStake / total);
      }
    return (v: Validator) =>
      by.get(v.voteAddress ?? '') ?? by.get(v.nodeAddress) ?? null;
  }, [summary, directoryTotal]);

  const go = (validator: Validator) => {
    if (onSelect) {
      onSelect(validator);
    } else {
      navigate(`/validator/${validator.voteAddress ?? validator.nodeAddress}`);
    }
    if (clearOnSelect) setQuery('');
    setFocused(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[highlightedIndex] ?? results[0];
      if (target) go(target);
    } else if (e.key === 'Escape') {
      setFocused(false);
    }
  };

  const resolvedPlaceholder =
    placeholder ??
    (directoryLoaded
      ? 'Search validators by name or address…'
      : 'Validator directory loading…');

  return (
    <div
      className="position-relative"
      style={compact ? { width: '20rem', maxWidth: '100%' } : undefined}
    >
      <div
        className={
          inBar
            ? 'vx-search-bar d-flex align-items-center rounded px-2 fs-10'
            : `d-flex align-items-center bg-body-emphasis rounded border border-translucent ${compact ? 'px-2 py-1 fs-9' : 'px-3 py-2'}`
        }
      >
        <FeatherIcon
          icon="search"
          size={inBar ? 12 : compact ? 14 : 18}
          className="text-body-tertiary me-2 flex-shrink-0"
        />
        <input
          type="text"
          className={`form-control border-0 bg-transparent p-0${inBar ? ' fs-10' : compact ? ' fs-9' : ''}`}
          style={{ boxShadow: 'none' }}
          placeholder={resolvedPlaceholder}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            // Escape can leave the DOM input focused while we've cleared
            // our React `focused` flag — typing after that should re-open
            // the suggestions.
            setFocused(true);
          }}
          onFocus={() => {
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
            setFocused(true);
          }}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setFocused(false), 150);
          }}
          onKeyDown={onKeyDown}
          disabled={!directoryLoaded}
          autoFocus={autoFocus}
          aria-label="Search validators"
        />
      </div>

      {showDropdown && (
        <div
          className="position-absolute w-100 mt-1 bg-body-emphasis rounded border border-translucent shadow"
          style={{ zIndex: 10, maxHeight: '24rem', overflowY: 'auto' }}
        >
          {results.length === 0 ? (
            <p className="text-body-tertiary fs-9 p-3 mb-0">No matches.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {results.map((v, i) => (
                <li key={v.nodeAddress}>
                  <button
                    type="button"
                    className={`btn btn-link w-100 text-start text-decoration-none px-3 py-2 rounded-0${
                      i === highlightedIndex ? ' bg-body-highlight' : ''
                    }`}
                    onMouseDown={e => {
                      e.preventDefault();
                      go(v);
                    }}
                    onMouseEnter={() => setHighlightedIndex(i)}
                  >
                    <div className="d-flex flex-column">
                      <span className="text-body fw-semibold">
                        {v.name || truncateAddress(v.nodeAddress)}
                      </span>
                      <span className="text-body-tertiary fs-10">
                        <span className="font-monospace">
                          {truncateAddress(v.nodeAddress)}
                        </span>
                        {/* Two validators can share a name: how long each
                            has run tells them apart. */}
                        {/* Records start at 369: there it means "or earlier". */}
                        {v.firstEpoch != null &&
                          ` · since epoch ${v.firstEpoch <= 369 ? '≤ ' : ''}${v.firstEpoch.toLocaleString()}`}
                        {(() => {
                          const share = shareOf?.(v);
                          return share != null
                            ? ` · ${share > 0 && share < 0.0001 ? '<0.01' : (share * 100).toFixed(2)}% of stake`
                            : '';
                        })()}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default ValidatorSearch;
