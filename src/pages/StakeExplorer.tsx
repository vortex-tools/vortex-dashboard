import FeatherIcon from 'components/base/FeatherIcon';
import SectionCard from 'components/common/SectionCard';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { BASE58 } from 'helpers/pageMeta';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { FormEvent, useContext, useMemo, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router';

/** What an address can be, and where each opens. */
type Kind = 'vote' | 'stake' | 'withdrawer' | 'staker' | 'custodian';
const KIND_LABEL: Record<Kind, string> = {
  vote: 'Validator',
  stake: 'Stake account',
  withdrawer: 'Withdrawer',
  staker: 'Staker',
  custodian: 'Custodian'
};

/**
 * The Stake explorer's front door (/stake, staging only): paste an
 * address and go to its page. The API's /stake/resolve says what it is
 * (a validator's vote account or identity, a stake account, a withdrawer
 * or staker); until it answers, a validator in the directory opens its
 * page and anything else is tried as a stake account.
 */
const StakeExplorer = () => {
  const navigate = useNavigate();
  const context = useContext(VortexDataContext);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [choices, setChoices] = useState<Array<{ kind: Kind; path: string }>>(
    []
  );

  const pathFor = (kind: Kind, address: string, voteKey?: string) =>
    kind === 'vote'
      ? `/validator/${voteKey ?? address}/staking`
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
  }) => navigate(`/validator/${v.voteAddress ?? v.nodeAddress}/staking`);

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
    // A validator the directory knows: its Staking tab.
    const dir = context?.validatorDirectoryState;
    const v =
      dir?.byVoteAddress.get(address) ?? dir?.byNodeAddress.get(address);
    if (v) {
      navigate(`/validator/${v.voteAddress ?? address}/staking`);
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
        };
        const options = (r.kinds ?? [])
          .map(kind => ({
            kind,
            path: pathFor(kind, address, r.vote?.voteKey)
          }))
          .filter((o): o is { kind: Kind; path: string } => !!o.path);
        if (options.length === 1) navigate(options[0].path);
        else if (options.length > 1) setChoices(options);
        else
          setNote(
            r.kinds?.length
              ? `It's a ${r.kinds.map(k => KIND_LABEL[k].toLowerCase()).join(' and ')} - its page is coming.`
              : 'Not seen in any recorded epoch as a validator or stake account.'
          );
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

  const what: Array<{ icon: string; title: string; text: string }> = [
    {
      icon: 'layers',
      title: 'Stake account',
      text: 'Every epoch it existed: the validator it was delegated to, its stake and rewards, when it moved, and who controls it.'
    },
    {
      icon: 'key',
      title: 'Staker or withdrawer',
      text: 'Every stake account it controls and where that stake sits, epoch by epoch. Coming next.'
    },
    {
      icon: 'server',
      title: 'Validator',
      text: 'By name, vote account or identity: its Staking tab - stake over time, who stakes with it, and what changed.'
    }
  ];

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start">
        <div className="col-auto">
          <h1 className="h3">Stake Explorer</h1>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Look up any validator, stake account, staker or withdrawer, with its
            history every epoch
          </p>
        </div>
      </div>
      <div className="d-flex flex-column gap-3">
        <SectionCard title="Look up an address" icon="search">
          <Form onSubmit={go} className="d-flex gap-2">
            <Form.Control
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="A validator's name, or a stake account, staker, withdrawer or vote account"
              aria-label="Address"
              className="font-monospace"
              autoFocus
              spellCheck={false}
            />
            <Button
              type="submit"
              className="text-nowrap"
              disabled={busy || !value.trim()}
            >
              {busy ? 'Looking…' : 'Look up'}
            </Button>
          </Form>
          {matches.length > 0 && (
            <div className="list-group mt-2 fs-9">
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
                  <span className="text-body-tertiary font-monospace fs-10 text-nowrap">
                    {(v.voteAddress ?? v.nodeAddress).slice(0, 4)}…
                    {(v.voteAddress ?? v.nodeAddress).slice(-4)} · Staking
                  </span>
                </button>
              ))}
            </div>
          )}
          {note && <p className="fs-9 text-body-tertiary mt-2 mb-0">{note}</p>}
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
        </SectionCard>

        <Row className="g-3">
          {what.map(w => (
            <Col key={w.title} xs={12} md={4}>
              <div className="h-100 rounded border border-translucent bg-body-emphasis p-3">
                <div className="d-flex align-items-center gap-2 fw-semibold mb-1">
                  <FeatherIcon
                    icon={w.icon}
                    size={16}
                    className="text-primary"
                  />
                  {w.title}
                </div>
                <p className="fs-9 text-body-secondary mb-0">{w.text}</p>
              </div>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};

export default StakeExplorer;
