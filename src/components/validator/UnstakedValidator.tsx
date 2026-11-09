import AddressLine from 'components/common/AddressLine';
import PageBreadcrumb from 'components/common/PageBreadcrumb';
import SectionCard from 'components/common/SectionCard';
import WarningBanner from 'components/common/WarningBanner';
import {
  ChangeBadge,
  changeValue,
  eventTime,
  voterLabel,
  whenText
} from 'components/changes/changes';
import useCluster from 'hooks/useCluster';
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
