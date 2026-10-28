import FeatherIcon from 'feather-icons-react';
import AddressLine from 'components/common/AddressLine';
import SectionCard from 'components/common/SectionCard';
import useCluster from 'hooks/useCluster';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ReactNode, useContext, useEffect } from 'react';
import { Col } from 'react-bootstrap';

/** An account on Solana Explorer, on the served cluster. */
const explorerAddress = (address: string, isTestnet: boolean) =>
  `https://explorer.solana.com/address/${address}${isTestnet ? '?cluster=testnet' : ''}`;

const Row2 = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="col-5 col-sm-4 fw-normal text-body-tertiary">{label}</dt>
    <dd className="col-7 col-sm-8 mb-0">{children}</dd>
  </>
);

type Fact = { tone: 'warning' | 'info' | 'success'; text: string };
const FACT_ICON = {
  warning: 'alert-triangle',
  info: 'info',
  success: 'check-circle'
} as const;

/**
 * The vote account's authorities, withdrawer first: who can withdraw it,
 * vote for it (and who will from a pending change's epoch), where its
 * commission goes, and whether its BLS key is set - each linking its
 * account on Solana Explorer. Below, what its key setup means if a key
 * leaks, as facts: a leaked withdrawer loses the vote account (every
 * delegator has to redelegate), a leaked identity or voter can be rotated
 * in place. From /validators/status's voteState.
 */
const AuthoritiesCard = ({
  nodeAddress,
  voteAddress
}: {
  nodeAddress: string;
  voteAddress: string;
}) => {
  const context = useContext(VortexDataContext);
  const { isTestnet } = useCluster();
  const fetchStatus = context?.validatorStatusState.fetchData;
  useEffect(() => {
    if (nodeAddress) fetchStatus?.(nodeAddress);
  }, [nodeAddress, fetchStatus]);
  const vs = context?.validatorStatusState.data.get(nodeAddress)?.voteState;
  if (!vs) return null;

  // A key's relation to the others, after its address.
  const sameAs = (key: string) =>
    key === nodeAddress
      ? 'identity'
      : key === voteAddress
        ? 'vote account'
        : key === vs.authorizedWithdrawer
          ? 'withdrawer'
          : null;
  const Key = ({ value, self }: { value: string; self?: string }) => {
    const same = sameAs(value);
    return (
      <span className="d-flex align-items-center gap-2 flex-wrap">
        <AddressLine
          label="Address"
          value={value}
          bare
          href={explorerAddress(value, isTestnet)}
        />
        {same && same !== self && (
          <span className="text-body-tertiary fs-10">same as {same}</span>
        )}
      </span>
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

  const facts: Fact[] = [];
  if (vs.authorizedWithdrawer === nodeAddress)
    facts.push({
      tone: 'warning',
      text: 'The withdrawer is the node identity, a key kept on the server: if it leaks, the vote account can be taken, and its delegators would have to redelegate.'
    });
  else if (vs.authorizedWithdrawer === vs.authorizedVoter)
    facts.push({
      tone: 'warning',
      text: 'The withdrawer is also the authorized voter: if the voter key leaks, the vote account can be taken.'
    });
  else
    facts.push({
      tone: 'success',
      text: 'The withdrawer is a key of its own, not the identity or the voter.'
    });
  if (vs.authorizedVoter && vs.authorizedVoter === nodeAddress)
    facts.push({
      tone: 'info',
      text: 'The authorized voter is the node identity (common): a leaked identity also leaks the voter. Both can be rotated in place.'
    });
  if (vs.blockRevenueCollector && vs.blockRevenueCollector === nodeAddress)
    facts.push({
      tone: 'info',
      text: "Block-reward commission is paid to the node identity's account (the default since vote state V4)."
    });

  return (
    <Col xs={12} lg={6}>
      <SectionCard
        title="Authorities"
        icon="key"
        info="The vote account's keys, from its on-chain vote state. A leaked withdrawer loses the vote account (every delegator has to redelegate); a leaked identity or voter can be rotated in place. Each links its account on Solana Explorer."
      >
        <dl className="row fs-9 mb-0 gy-2">
          <Row2 label="Withdrawer">
            <Key value={vs.authorizedWithdrawer} self="withdrawer" />
          </Row2>
          <Row2 label="Authorized voter">
            {vs.authorizedVoter ? (
              <Key value={vs.authorizedVoter} />
            ) : (
              <span className="text-body-tertiary">none</span>
            )}
            {nextVoter && (
              <span className="d-block fs-10 text-warning-emphasis mt-1">
                Changes to <Key value={nextVoter.key} />
                {nextVoter.from != null
                  ? ` from epoch ${nextVoter.from.toLocaleString()}`
                  : ' next epoch'}
              </span>
            )}
          </Row2>
          <Row2 label="Identity">
            <Key value={vs.nodePubkey} self="identity" />
          </Row2>
          {vs.inflationRewardsCollector && (
            <Row2 label="Inflation collector">
              <Key value={vs.inflationRewardsCollector} />
            </Row2>
          )}
          {vs.blockRevenueCollector && (
            <Row2 label="Block-reward collector">
              <Key value={vs.blockRevenueCollector} />
            </Row2>
          )}
          <Row2 label="BLS key">{vs.blsPubkeySet ? 'Set' : 'Not set'}</Row2>
        </dl>
        <ul className="list-unstyled fs-10 mt-3 mb-0 pt-3 border-top border-translucent d-flex flex-column gap-1">
          {facts.map(f => (
            <li key={f.text} className="d-flex gap-2">
              <FeatherIcon
                icon={FACT_ICON[f.tone]}
                size={13}
                className={`flex-shrink-0 mt-1 text-${f.tone}`}
              />
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </Col>
  );
};

export default AuthoritiesCard;
