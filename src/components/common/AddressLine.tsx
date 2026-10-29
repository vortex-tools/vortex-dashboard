import FeatherIcon from 'feather-icons-react';
import { useEffect, useRef, useState } from 'react';

// Fallback for non-secure contexts where navigator.clipboard is undefined.
const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};

interface AddressLineProps {
  label: string;
  value: string;
  /** Label column width (default 3rem); widen it for every line of a box
   *  at once so the values stay aligned. */
  labelWidth?: string;
  /** Muted note after the address, e.g. '(vote account)'. */
  note?: string;
  /** Hover text for the label. */
  labelTitle?: string;
  /** Just the address and its copy button: the label is shown elsewhere
   *  (a details list's term column). */
  bare?: boolean;
  /** Links the address (e.g. to an explorer; opens in a new tab). */
  href?: string;
  /** Always the middle-truncated form (a narrow column), never the
   *  whole address. */
  compact?: boolean;
}

const AddressLine = ({
  label,
  value,
  labelWidth = '3rem',
  note,
  labelTitle,
  bare = false,
  href,
  compact = false
}: AddressLineProps) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };
  // A 44-char base58 address is wide: on a phone it wrapped (three rows for
  // one address), and at desktop widths it stretched the keys box so the
  // header boxes beside it wrapped. Show it in full only on really wide
  // screens (xxl, >= 1400px) and middle-truncate below that; copy still puts
  // the whole address on the clipboard, and the title carries it for hover /
  // assistive tech.
  const short =
    value.length <= 20 ? value : `${value.slice(0, 8)}…${value.slice(-8)}`;
  return (
    <div className="d-flex align-items-center gap-2 min-w-0">
      {!bare && (
        <span
          className="text-body-tertiary fs-9 flex-shrink-0"
          style={{ minWidth: labelWidth }}
          title={labelTitle}
        >
          {label}
        </span>
      )}
      {(compact
        ? [{ text: short, cls: '' }]
        : [
            { text: value, cls: 'd-none d-xxl-inline' },
            { text: short, cls: 'd-xxl-none' }
          ]
      ).map(({ text, cls }) =>
        href ? (
          <a
            key={cls}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={`font-monospace fs-9 ${cls}`}
            title={value}
          >
            {text}
          </a>
        ) : (
          <span
            key={cls}
            className={`font-monospace fs-9 ${cls}`}
            title={value}
          >
            {text}
          </span>
        )
      )}
      {note && (
        <span className="text-body-tertiary fs-10 flex-shrink-0">{note}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className={`btn btn-link p-0 border-0 flex-shrink-0 ${copied ? 'text-success' : 'text-body-tertiary'}`}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
        aria-label={`Copy ${label} ${value}`}
      >
        <FeatherIcon icon={copied ? 'check' : 'copy'} size={14} />
      </button>
    </div>
  );
};

export default AddressLine;
