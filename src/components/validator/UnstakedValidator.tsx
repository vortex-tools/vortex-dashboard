import AddressLine from 'components/common/AddressLine';
import PageBreadcrumb from 'components/common/PageBreadcrumb';
import SectionCard from 'components/common/SectionCard';
import WarningBanner from 'components/common/WarningBanner';
import {
  ChangeBadge,
  changeValue,
  eventTime,
  isBlsChange,
  voterLabel,
  whenText
} from 'components/changes/changes';
import FeatherIcon from 'components/base/FeatherIcon';
import useCluster from 'hooks/useCluster';
import { formatLamports } from 'helpers/utils';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ReactNode, useContext, useEffect } from 'react';
import { explorerAddress, explorerTx } from 'helpers/explorer';
import { ActivityEvent, VoteAccountChange } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const pct = (bps: unknown) =>
  typeof bps === 'number' ? `${(bps / 100).toLocaleString('en-US')}%` : null;
const str = (v: unknown) => (typeof v === 'string' ? v : null);

/** Its vote account as its changes leave it: the create event's values,
 *  then each later change of a key or commission. */
const stateOf = (events: VoteAccountChange[]) => {
  const s: Record<string, unknown> = {};
  const oldest = [...events].sort(
    (a, b) => (a.slot ?? a.epoch) - (b.slot ?? b.epoch)
  );
  for (const e of oldest) {
    if (e.kind === 'create' && e.newValue && typeof e.newValue === 'object')
      Object.assign(s, e.newValue);
    else if (e.newValue != null && e.kind !== 'withdraw')
      s[e.kind] = e.newValue;
  }
  return s;
};

/** One step: done (a check) or still to do (a number). */
const Step = ({
  n,
  done,
  title,
  children
}: {
  n: number;
  done?: boolean;
  title: string;
  children: ReactNode;
}) => (
  <li className="d-flex gap-2">
    <span
      className={`flex-shrink-0 d-inline-flex align-items-center justify-content-center rounded-circle fs-10 fw-bold ${
        done ? 'bg-success-subtle text-success' : 'bg-body-highlight'
      }`}
      style={{ width: 22, height: 22 }}
    >
      {done ? <FeatherIcon icon="check" size={12} /> : n}
    </span>
    <div>
      <div className="fw-semibold">
        {title}
        {done && <span className="text-success fw-normal ms-2">Done</span>}
      </div>
      <div className="text-body-secondary">{children}</div>
    </div>
  </li>
);

/** Code, inline. */
const Cmd = ({ children }: { children: string }) => (
  <code className="text-body-emphasis bg-body-highlight rounded px-1 text-break">
    {children}
  </code>
);

/**
 * A vote account with no stake (new, or its stake gone): the API's
 * validator status and directory hold staked validators only, so the
 * validator page has nothing else to show. Its keys and commissions as
 * its changes leave them, and the changes themselves.
 */
const UnstakedValidator = ({
  voteKey,
  events
}: {
  voteKey: string;
  events: VoteAccountChange[];
}) => {
  const { isTestnet } = useCluster();
  const s = stateOf(events);
  const created = events.find(e => e.kind === 'create');
  const identity = str(s.identity);
  const bls = events.find(e => isBlsChange(e as ActivityEvent));
  // Today's admission ticket and the vote account's rent, from any staked
  // validator's status (the cluster's, the same for every validator).
  const context = useContext(VortexDataContext);
  const anyNode = context?.validatorDirectoryState.validators?.[0]?.nodeAddress;
  const fetchStatus = context?.validatorStatusState.fetchData;
  useEffect(() => {
    if (anyNode) fetchStatus?.(anyNode);
  }, [anyNode, fetchStatus]);
  const cluster = anyNode
    ? context?.validatorStatusState.data.get(anyNode)?.cluster
    : undefined;
  const ticket = cluster?.vatLamportsPerEpoch ?? null;
  const rent = cluster?.voteAccountRentExemptMinimum ?? null;
  const newest = [...events].sort(
    (a, b) => (b.slot ?? b.epoch) - (a.slot ?? a.epoch)
  );
  return (
    <div className="mb-9">
      <PageBreadcrumb
        items={[
          { label: 'Validators', url: '/validators' },
          { label: short(voteKey), active: true }
        ]}
      />
      <div className="page-header row g-3 align-items-start">
        <div className="col-auto">
          <h1 className="h3 d-flex align-items-center gap-2">
            {short(voteKey)}
            <span className="badge badge-soft badge-soft-secondary fs-10">
              Not staked
            </span>
          </h1>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">Vote account</p>
        </div>
      </div>
      <div className="d-flex flex-column gap-3">
        <WarningBanner icon="info">
          No active stake
          {created
            ? `: this vote account was created in epoch ${created.epoch}${
                eventTime(created as ActivityEvent) != null
                  ? ` (${whenText(eventTime(created as ActivityEvent))})`
                  : ''
              }`
            : ''}
          . Only staked validators vote, produce blocks and earn, so
          there&apos;s no voting, production or earnings record for it until
          stake is delegated to it and activates.
        </WarningBanner>

        <SectionCard title="Keys" icon="key">
          <AddressLine
            label="Vote account"
            value={voteKey}
            href={explorerAddress(voteKey, isTestnet)}
          />
          {identity && (
            <AddressLine
              label="Identity"
              value={identity}
              href={explorerAddress(identity, isTestnet)}
            />
          )}
          {str(s.voter) && <AddressLine label="Voter" value={str(s.voter)!} />}
          {str(s.withdrawer) && (
            <AddressLine label="Withdrawer" value={str(s.withdrawer)!} />
          )}
          <div className="d-flex flex-wrap column-gap-4 fs-9 mt-2">
            {pct(s.inflationCommissionBps ?? s.inflationCommission) && (
              <span>
                <span className="text-body-tertiary">
                  Inflation commission{' '}
                </span>
                {pct(s.inflationCommissionBps ?? s.inflationCommission)}
              </span>
            )}
            {pct(s.blockRevenueCommissionBps ?? s.blockRevenueCommission) && (
              <span>
                <span className="text-body-tertiary">
                  Block revenue commission{' '}
                </span>
                {pct(s.blockRevenueCommissionBps ?? s.blockRevenueCommission)}
              </span>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Next Steps"
          icon="list"
          info="What a vote account needs before it votes and earns here. Commands are the Solana CLI's; check your client's docs for its own."
        >
          <ol className="list-unstyled d-flex flex-column gap-3 fs-9 mb-0">
            <Step n={1} done={!!bls} title="Register a BLS key">
              Alpenglow votes with BLS signatures: the vote account needs a BLS
              public key, registered by its voter
              {bls ? ` (epoch ${bls.epoch})` : ''}.
            </Step>
            <Step n={2} title="Fund the vote account for its admission tickets">
              Each epoch&apos;s stake set admits only vote accounts holding rent
              {rent != null ? ` (${formatLamports(rent, 4)})` : ''} plus one
              epoch&apos;s admission ticket (VAT, SIMD-0357
              {ticket != null ? `: ${formatLamports(ticket, 2)} an epoch` : ''}
              ), and takes the ticket at the boundary. Keep a few epochs funded:{' '}
              <Cmd>{`solana transfer ${voteKey} <SOL>`}</Cmd> (see{' '}
              <a
                href={explorerAddress(voteKey, isTestnet)}
                target="_blank"
                rel="noreferrer"
              >
                its balance
              </a>
              ).
            </Step>
            <Step n={3} title="Get stake delegated to it">
              Your own:{' '}
              <Cmd>{`solana delegate-stake <stake account> ${voteKey}`}</Cmd>.
              Or apply to the{' '}
              <a
                href="https://solana.org/delegation-program"
                target="_blank"
                rel="noreferrer"
              >
                Solana Foundation Delegation Program
              </a>{' '}
              or meet a <Link to="/pools">stake pool</Link>&apos;s criteria.
              Stake activates at the next epoch boundary, and the vote account
              joins the stake set (votes, leader slots, rewards) at the boundary
              after, if it&apos;s admitted.
            </Step>
            <Step
              n={4}
              title="Run the validator on this identity and vote account"
            >
              Start your client with this identity keypair and vote account
              (Agave:{' '}
              <Cmd>
                --identity &lt;keypair&gt; --vote-account &lt;address&gt;
              </Cmd>
              ) and keep it in gossip: Vortex reads its version and location
              from there.
            </Step>
            <Step n={5} title="Publish its name">
              <Cmd>
                {
                  'solana validator-info publish "<name>" --website <url> --icon-url <url>'
                }
              </Cmd>
              , signed by the identity: Vortex and explorers show that name.
            </Step>
          </ol>
          <p className="fs-10 text-body-tertiary mt-3 mb-0">
            Once it&apos;s staked, this page becomes its full validator page:
            its Notices on the Overview say what still needs attention.
          </p>
        </SectionCard>

        <SectionCard
          title="Vote Account Changes"
          icon="activity"
          linkTo={`/activity?validator=${voteKey}`}
          linkLabel="Activity"
        >
          <Table responsive size="sm" className="data-table fs-9 mb-0">
            <thead>
              <tr className="text-nowrap">
                <th>When</th>
                <th>Change</th>
                <th>To</th>
                <th className="text-end">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {newest.map((e, i) => {
                const t = eventTime(e as ActivityEvent);
                return (
                  <tr key={`${e.signature ?? i}-${e.kind}`}>
                    <td className="text-nowrap">
                      <span title={t ? new Date(t * 1000).toUTCString() : ''}>
                        {whenText(t) ?? `Epoch ${e.epoch}`}
                      </span>
                      <span className="text-body-tertiary fs-10 ms-1">
                        epoch {e.epoch}
                      </span>
                    </td>
                    <td>
                      <ChangeBadge
                        kind={e.kind}
                        label={voterLabel(e as ActivityEvent)}
                      />
                    </td>
                    <td className="text-truncate" style={{ maxWidth: '24rem' }}>
                      {e.kind === 'create'
                        ? 'Created'
                        : changeValue(e as ActivityEvent, 'new', isTestnet)}
                    </td>
                    <td className="text-end">
                      {e.signature && (
                        <a
                          href={explorerTx(e.signature, isTestnet)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {short(e.signature)}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="fs-10 text-body-tertiary mt-2 mb-0">
            See also <Link to="/validators">every staked validator</Link>.
          </p>
        </SectionCard>
      </div>
    </div>
  );
};

export default UnstakedValidator;
