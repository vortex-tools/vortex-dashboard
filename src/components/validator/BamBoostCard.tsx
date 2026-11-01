import Badge, { BadgeBg } from 'components/base/Badge';
import SectionCard from 'components/common/SectionCard';
import { jitoSol } from 'helpers/utils';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Table } from 'react-bootstrap';

/** A claim's state, as the API names it. */
const STATE: Record<string, [string, BadgeBg]> = {
  claimed: ['Claimed', 'success'],
  claimable: ['Claimable', 'warning'],
  expired: ['Expired', 'secondary']
};

/**
 * Jito's BAM Boost (JitoSOL Jito pays BAM validators per epoch by
 * effective stake, which the validator claims): what's claimable now and
 * until when, what it claimed or let expire, and each epoch's boost from
 * /validators/tips. Not per block, and not block income. Renders nothing
 * for a validator that never had any.
 */
const BamBoostCard = ({
  identity,
  voteKey
}: {
  identity: string;
  voteKey: string;
}) => {
  const context = useContext(VortexDataContext);
  const fetchStatus = context?.validatorStatusState.fetchData;
  const fetchTips = context?.validatorTipsState.fetchData;
  useEffect(() => {
    fetchStatus?.(identity);
  }, [identity, fetchStatus]);
  useEffect(() => {
    fetchTips?.(voteKey);
  }, [voteKey, fetchTips]);
  const boost = context?.validatorStatusState.data.get(identity)?.bamBoost;
  const tips = context?.validatorTipsState.data.get(voteKey);

  // Its BAM epochs with figures, newest first (the API's order).
  const epochs = (tips?.epochs ?? []).flatMap(e => {
    const p = e.paths.find(
      p => p.path === 'bamBoost' && p.basis === 'exact' && p.unit === 'jitoSol'
    );
    return p ? [{ epoch: e.epoch, amount: p.gross ?? 0, claim: p.claim }] : [];
  });
  if (!boost && !epochs.some(e => e.amount > 0)) return null;

  const totals: Array<[string, number, number | null, string]> = boost
    ? [
        [
          'Claimable now',
          boost.claimableAmount,
          boost.claimable.length,
          boost.nextClaimEndEpoch != null
            ? `the first until epoch ${boost.nextClaimEndEpoch.toLocaleString()}`
            : ''
        ],
        ['Claimed', boost.claimedAmount, boost.claimedEpochs, ''],
        ['Expired unclaimed', boost.expiredAmount, boost.expiredEpochs, '']
      ]
    : [];

  return (
    <SectionCard
      title="BAM Boost"
      icon="zap"
      info="JitoSOL that Jito pays validators running its BAM block engine, per epoch by effective stake. The validator claims it, until a deadline; unclaimed, it expires. Paid per epoch, not per block, so it isn't part of block income. An epoch is Jito's distribution epoch."
    >
      {totals.length > 0 && (
        <div className="d-flex flex-wrap column-gap-7 row-gap-3 mb-3">
          {totals.map(([label, amount, count, note]) => (
            <div key={label}>
              <div className="fs-10 text-uppercase text-body-tertiary">
                {label}
              </div>
              <div
                className={`font-monospace fw-semibold ${
                  label === 'Claimable now' && amount > 0
                    ? 'text-warning-emphasis'
                    : ''
                }`}
              >
                {jitoSol(amount)}
              </div>
              <div className="fs-10 text-body-tertiary">
                {count
                  ? `${count.toLocaleString()} epoch${count === 1 ? '' : 's'}`
                  : 'none'}
                {note && amount > 0 ? ` · ${note}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {epochs.length > 0 && (
        <Table size="sm" className="data-table compact-rows fs-9 mb-0">
          <thead>
            <tr>
              <th>Epoch</th>
              <th className="text-end">Boost</th>
              <th>Claim</th>
            </tr>
          </thead>
          <tbody>
            {epochs.map(e => {
              const [label, bg] = (e.claim && STATE[e.claim.state]) || [];
              return (
                <tr key={e.epoch}>
                  <td className="font-monospace">{e.epoch.toLocaleString()}</td>
                  <td className="text-end font-monospace">
                    {e.amount > 0 ? jitoSol(e.amount) : '—'}
                  </td>
                  <td className="text-nowrap">
                    {!e.claim ? (
                      <span
                        className="text-body-tertiary"
                        title="Not in Jito's distribution that epoch: under 50k SOL of stake, or not on BAM 3 epochs in a row"
                      >
                        Not eligible
                      </span>
                    ) : (
                      <>
                        <Badge bg={bg ?? 'secondary'}>
                          {label ?? e.claim.state}
                        </Badge>
                        {e.claim.state === 'claimable' &&
                          e.claim.claimEndEpoch != null && (
                            <span className="fs-10 text-body-tertiary ms-2">
                              until epoch{' '}
                              {e.claim.claimEndEpoch.toLocaleString()}
                            </span>
                          )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
};

export default BamBoostCard;
