import FeatherIcon from 'feather-icons-react';
import AddressLine from 'components/common/AddressLine';
import { ChangeBadge, changeValue, whenText } from 'components/changes/changes';
import { explorerTx } from 'helpers/explorer';
import { IS_STAGING } from 'helpers/apiEndpoint';
import useCluster from 'hooks/useCluster';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ReactNode, useContext, useEffect } from 'react';
import { Link } from 'react-router';

/** Recent changes listed; the rest on the Activity page. */
const RECENT_CHANGES = 5;

/** A Details line: its label in the box's label column, then the value. */
const Line = ({
  label,
  labelWidth,
  children
}: {
  label: string;
  labelWidth: string;
  children: ReactNode;
}) => (
  <div className="d-flex align-items-baseline gap-2 min-w-0">
    <span
      className="text-body-tertiary fs-9 flex-shrink-0"
      style={{ minWidth: labelWidth }}
    >
      {label}
    </span>
    <span className="fs-9 min-w-0">{children}</span>
  </div>
);

/**
 * The vote account's other keys, as lines in the Details box after its
 * Identity / Vote / Withdrawer: the authorized voter (and who takes over
 * from a pending change's epoch), the two commission collectors, and a
 * missing BLS key. A key that is one already listed says which
 * ("Identity", an arrow up to it after), its address on hover; else the
 * address, with a copy button. From /validators/status's voteState.
 */
export const ValidatorKeyLines = ({
  nodeAddress,
  voteAddress,
  labelWidth
}: {
  nodeAddress: string;
  voteAddress: string;
  labelWidth: string;
}) => {
  const context = useContext(VortexDataContext);
  const vs = context?.validatorStatusState.data.get(nodeAddress)?.voteState;
  if (!vs) return null;

  const sameAs = (key: string) =>
    key === nodeAddress
      ? 'Identity'
      : key === voteAddress
        ? 'Vote account'
        : key === vs.authorizedWithdrawer
          ? 'Withdrawer'
          : null;
  // A key that is one listed above says which, with an arrow up to it
  // (its address on hover); else the address with a copy button.
  const Key = ({ value }: { value: string }) => {
    const same = sameAs(value);
    return same ? (
      <span
        className="d-inline-flex align-items-center gap-1 text-body-secondary"
        title={value}
      >
        {same}
        <FeatherIcon icon="corner-right-up" size={12} />
      </span>
    ) : (
      <AddressLine label="Address" value={value} bare />
    );
  };

  // A voter change set but not in effect yet: the new key and its epoch.
  const pendingVoter = vs.pending?.authorizedVoter;
  const nextVoter =
    typeof pendingVoter?.next === 'string'
      ? {
          key: pendingVoter.later?.value
            ? String(pendingVoter.later.value)
            : pendingVoter.next,
          from: pendingVoter.later?.fromEpoch ?? pendingVoter.fromEpoch
        }
      : vs.pending === undefined &&
          vs.nextAuthorizedVoter &&
          vs.nextAuthorizedVoter !== vs.authorizedVoter
        ? { key: vs.nextAuthorizedVoter, from: null }
        : null;

  return (
    <>
      <Line label="Voter" labelWidth={labelWidth}>
        {vs.authorizedVoter ? (
          <Key value={vs.authorizedVoter} />
        ) : (
          <span className="text-body-tertiary">none</span>
        )}
        {nextVoter && (
          <span className="d-block fs-10 text-warning-emphasis">
            changes to <Key value={nextVoter.key} />
            {nextVoter.from != null
              ? ` from epoch ${nextVoter.from.toLocaleString()}`
              : ' next epoch'}
          </span>
        )}
      </Line>
      {vs.inflationRewardsCollector && (
        <Line label="Inflation collector" labelWidth={labelWidth}>
          <Key value={vs.inflationRewardsCollector} />
        </Line>
      )}
      {vs.blockRevenueCollector && (
        <Line label="Block collector" labelWidth={labelWidth}>
          <Key value={vs.blockRevenueCollector} />
        </Line>
      )}
      {/* Only when missing: a set key is the norm and says nothing. */}
      {!vs.blsPubkeySet && (
        <Line label="BLS key" labelWidth={labelWidth}>
          <span
            className="text-warning-emphasis"
            title="A vote account without a BLS key can't vote under Alpenglow"
          >
            Not set
          </span>
        </Line>
      )}
    </>
  );
};

/**
 * Its vote account's latest changes (withdrawer, voter, identity,
 * commission, collectors, withdrawals), newest first, under the Details
 * lines; the Activity page (staging) for the rest. Nothing until the API
 * has the history.
 */
export const RecentVoteAccountChanges = ({
  nodeAddress,
  voteAddress
}: {
  nodeAddress: string;
  voteAddress: string;
}) => {
  const context = useContext(VortexDataContext);
  const { isTestnet } = useCluster();
  const fetchChanges = context?.validatorVoteAccountChangesState.fetchData;
  useEffect(() => {
    if (nodeAddress) fetchChanges?.(nodeAddress);
  }, [nodeAddress, fetchChanges]);
  const changes =
    context?.validatorVoteAccountChangesState.data.get(nodeAddress)?.events;
  if (!changes) return null;
  const recent = [...changes].reverse().slice(0, RECENT_CHANGES);
  return (
    <div className="mt-3 pt-3 border-top border-translucent">
      <div className="d-flex align-items-center mb-2">
        <span className="fs-10 fw-bold text-uppercase text-body-tertiary">
          Recent key changes
        </span>
        {/* The Activity page is staging only for now. */}
        {IS_STAGING && (
          <Link
            to={`/activity?validator=${voteAddress}&epochs=10`}
            className="fs-10 ms-auto"
          >
            All activity →
          </Link>
        )}
      </div>
      {recent.length ? (
        <ul className="list-unstyled fs-9 mb-0 detail-lines">
          {recent.map(e => (
            <li
              key={`${e.signature}-${e.kind}`}
              className="d-flex flex-wrap align-items-center column-gap-2"
            >
              <ChangeBadge kind={e.kind} />
              <span className="min-w-0">
                {changeValue(e, 'new', isTestnet)}
              </span>
              <span className="ms-auto text-body-tertiary fs-10 text-nowrap">
                epoch {e.epoch.toLocaleString()}
                {e.blockTime != null && ` · ${whenText(e.blockTime)}`}
                {e.signature && (
                  <>
                    {' · '}
                    <a
                      href={explorerTx(e.signature, isTestnet)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tx
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fs-9 text-body-tertiary mb-0">
          No changes since epoch 1064 (Alpenglow), where the record starts.
        </p>
      )}
    </div>
  );
};
