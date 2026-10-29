import FeatherIcon from 'feather-icons-react';
import {
  KeyboardEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useNavigate } from 'react-router';
import { Validator, VortexDataContext } from 'providers/VortexDataProvider';

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
}

const ValidatorSearch = ({
  onSelect,
  placeholder,
  clearOnSelect = true,
  autoFocus,
  compact = false
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

  const go = (validator: Validator) => {
    if (onSelect) {
      onSelect(validator);
    } else {
      navigate(`/validator/${validator.nodeAddress}`);
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
        className={`d-flex align-items-center bg-body-emphasis rounded border border-translucent ${compact ? 'px-2 py-1 fs-9' : 'px-3 py-2'}`}
      >
        <FeatherIcon
          icon="search"
          size={compact ? 14 : 18}
          className="text-body-tertiary me-2 flex-shrink-0"
        />
        <input
          type="text"
          className={`form-control border-0 bg-transparent p-0${compact ? ' fs-9' : ''}`}
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
                      <span className="text-body-tertiary font-monospace fs-10">
                        {truncateAddress(v.nodeAddress)}
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
