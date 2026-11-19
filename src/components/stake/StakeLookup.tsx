import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { BASE58 } from 'helpers/pageMeta';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { FormEvent, useContext, useMemo, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router';

/** What an address can be, and where each opens. */
type Kind =
  | 'vote'
  | 'identity'
  | 'stake'
  | 'withdrawer'
  | 'staker'
  | 'custodian';
const KIND_LABEL: Record<Kind, string> = {
  vote: 'Validator',
  identity: 'Validator',
  stake: 'Stake account',
  withdrawer: 'Withdrawer',
  staker: 'Staker',
  custodian: 'Custodian'
};

/**
 * The Stake explorer's lookup: a validator's name, or an address, opens
 * its page. The API's /stake/resolve says what an address is (a
 * validator's vote account or identity, a stake account, a withdrawer or
 * staker); until it answers, a validator in the directory opens its page
 * and anything else is tried as a stake account. Full on the explorer's
 * landing page; `compact` in the header of its other pages.
 */
const StakeLookup = ({ compact = false }: { compact?: boolean }) => {
  const navigate = useNavigate();
  const context = useContext(VortexDataContext);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [choices, setChoices] = useState<Array<{ kind: Kind; path: string }>>(
    []
  );

  const pathFor = (kind: Kind, address: string, voteKey?: string) =>
    kind === 'vote' || kind === 'identity'
      ? voteKey || kind === 'vote'
        ? `/stake/vote/${voteKey ?? address}`
        : null
      : kind === 'stake'
        ? `/stake/account/${address}`
        : null;

  // Validators by name (or a piece of an address), as the site search
  // matches them: shown as you type anything that isn't a whole address.
  const query = value.trim();
  const matches = useMemo(
    () =>
      query && !BASE58.test(query)
        ? (context?.validatorDirectoryState.search(query, 8) ?? [])
        : [],
    [context, query]
  );
  const openValidator = (v: {
    voteAddress: string | null;
    nodeAddress: string;
  }) => navigate(`/stake/vote/${v.voteAddress ?? v.nodeAddress}`);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    const address = value.trim();
    setNote(null);
    setChoices([]);
    if (!BASE58.test(address)) {
      // A name: its best match.
      if (matches.length) openValidator(matches[0]);
      else
        setNote(
          'No validator by that name, and it isn’t a Solana address (base58, 32–44 characters).'
        );
      return;
    }
    // A validator the directory knows: its vote account's page.
    const dir = context?.validatorDirectoryState;
    const v =
      dir?.byVoteAddress.get(address) ?? dir?.byNodeAddress.get(address);
    if (v) {
      navigate(`/stake/vote/${v.voteAddress ?? address}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `${API_ENDPOINT}/stake/resolve?address=${encodeURIComponent(address)}`
      );
      if (res.ok) {
        const r = (await res.json()) as {
          kinds?: Kind[];
          vote?: { voteKey?: string } | null;
          indexes?: { stakeAccounts?: string; authorities?: string };
        };
        // One choice per page (a vote account and its identity are one).
        const options = (r.kinds ?? [])
          .map(kind => ({
            kind,
            path: pathFor(kind, address, r.vote?.voteKey)
          }))
          .filter((o): o is { kind: Kind; path: string } => !!o.path)
          .filter((o, i, all) => all.findIndex(x => x.path === o.path) === i);
        if (options.length === 1) navigate(options[0].path);
        else if (options.length > 1) setChoices(options);
        else if (r.kinds?.length)
          setNote(
            `It's a ${[...new Set(r.kinds.map(k => KIND_LABEL[k].toLowerCase()))].join(' and ')} - its page is coming.`
          );
        else {
          // Nothing found: say which lookups aren't there yet.
          const stakes = r.indexes?.stakeAccounts !== 'notLoaded';
          const auths = r.indexes?.authorities !== 'notLoaded';
          setNote(
            stakes && auths
              ? 'Not seen in any recorded epoch as a validator, stake account, staker or withdrawer.'
              : stakes
                ? 'Not a validator or a stake account. Looking up stakers and withdrawers comes once their data is loaded.'
                : 'Not a validator. Looking up stake accounts, stakers and withdrawers comes once their data is loaded.'
          );
        }
        return;
      }
      // No resolve on this API yet: try it as a stake account.
      navigate(`/stake/account/${address}`);
    } catch {
      navigate(`/stake/account/${address}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? 'position-relative' : undefined}>
      <Form onSubmit={go} className="d-flex gap-2">
        <Form.Control
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={
            compact
              ? 'Name or address'
              : "A validator's name, or a stake account, staker, withdrawer or vote account"
          }
          aria-label="Address"
          size={compact ? 'sm' : undefined}
          autoFocus={!compact}
          spellCheck={false}
        />
        <Button
          type="submit"
          size={compact ? 'sm' : undefined}
          className="text-nowrap"
          disabled={busy || !value.trim()}
        >
          {busy ? 'Looking…' : 'Look up'}
        </Button>
      </Form>
      {matches.length > 0 && (
        <div
          className={`list-group mt-2 fs-9${compact ? ' position-absolute start-0 end-0 shadow z-3' : ''}`}
        >
          {matches.map(v => (
            <button
              key={v.nodeAddress}
              type="button"
              className="list-group-item list-group-item-action d-flex justify-content-between gap-3"
              onClick={() => openValidator(v)}
            >
              <span className="fw-semibold text-truncate">
                {v.name ?? v.nodeAddress}
              </span>
              <span className="text-body-tertiary fs-10 text-nowrap">
                {(v.voteAddress ?? v.nodeAddress).slice(0, 4)}…
                {(v.voteAddress ?? v.nodeAddress).slice(-4)}
              </span>
            </button>
          ))}
        </div>
      )}
      {note && (
        <p
          className="fs-9 text-body-tertiary mt-2 mb-0"
          style={compact ? { maxWidth: '22rem' } : undefined}
        >
          {note}
        </p>
      )}
      {choices.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mt-2 fs-9">
          <span className="text-body-tertiary">It's more than one:</span>
          {choices.map(c => (
            <Button
              key={c.kind}
              size="sm"
              variant="soft-primary"
              onClick={() => navigate(c.path)}
            >
              {KIND_LABEL[c.kind]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StakeLookup;
