import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import DelayedSpinner from 'components/common/DelayedSpinner';
import { formatLamports } from 'helpers/utils';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { TipPath, ValidatorTips } from 'providers/vortex-schemas';
import { useContext, useEffect } from 'react';
import { Table } from 'react-bootstrap';

type Epoch = ValidatorTips['epochs'][number];

/** Why a path has no figures, in a line. */
const UNAVAILABLE: Record<string, string> = {
  rakuraiTips: "Rakurai's own tip program isn't ingested yet.",
  raikuTips: "Raiku's own tip program isn't ingested yet."
};

const sol = (lamports: number | null | undefined) =>
  lamports == null ? '—' : formatLamports(lamports, 4);
const bps = (b: number | null | undefined) =>
  b == null ? null : `${(b / 100).toLocaleString('en-US')}%`;

/**
 * A validator's tip income per epoch (/validators/tips): what the tips
 * in its blocks came to, and how they were split - the block builder's
 * fee, the tip program's fee, the validator's commission and its
 * stakers.
 * Paths the API can't measure are named under the table. BAM Boost is its
 * own card.
 */
const TipsCard = ({ voteKey }: { voteKey: string }) => {
  const context = useContext(VortexDataContext);
  const fetchTips = context?.validatorTipsState.fetchData;
  useEffect(() => {
    fetchTips?.(voteKey);
  }, [voteKey, fetchTips]);
  const data = context?.validatorTipsState.data.get(voteKey);

  const body = () => {
    if (!data)
      return context?.validatorTipsState.error ? (
        <UntrackedState>Tips aren&apos;t available right now.</UntrackedState>
      ) : (
        <div style={{ minHeight: 300 }}>
          <DelayedSpinner loading label="Loading tips…" />
        </div>
      );
    if (!data.epochs.length)
      return (
        <UntrackedState>No tips recorded in its recent epochs.</UntrackedState>
      );
    const jito = (e: Epoch): TipPath | undefined =>
      e.paths.find(p => p.path === 'jitoTips');
    // Paths with no figures, once each, with why.
    const missing = [
      ...new Set(
        data.epochs.flatMap(e =>
          e.paths.filter(p => p.basis !== 'exact').map(p => p.path)
        )
      )
    ].filter(p => UNAVAILABLE[p]);
    return (
      <>
        <Table responsive size="sm" className="data-table fs-9 mb-0">
          <thead className="text-nowrap">
            <tr>
              <th>Epoch</th>
              <th>Builder</th>
              <th
                className="text-end"
                title="Tips paid to tip accounts in its blocks"
              >
                Tips
              </th>
              <th className="text-end" title="The block builder's cut">
                Builder fee
              </th>
              <th
                className="text-end"
                title="The tip program's fee (Jito's tip router, for Jito tips)"
              >
                Tip program fee
              </th>
              <th
                className="text-end"
                title="The validator's commission on the tips"
              >
                Validator
              </th>
              <th className="text-end" title="Paid to its stake accounts">
                Stakers
              </th>
            </tr>
          </thead>
          <tbody>
            {data.epochs.map(e => {
              const j = jito(e);
              const t = e.total;
              return (
                <tr key={e.epoch}>
                  <td className="text-nowrap">
                    <span className="font-monospace">{e.epoch}</span>
                    {!e.complete && (
                      <span className="text-body-tertiary fs-10">
                        {' '}
                        (so far)
                      </span>
                    )}
                  </td>
                  <td className="text-nowrap">{e.builderName ?? '—'}</td>
                  <td className="text-end font-monospace">
                    {sol(t?.gross ?? j?.gross)}
                  </td>
                  <td className="text-end font-monospace text-body-tertiary">
                    {sol(t?.builderFee)}
                  </td>
                  <td className="text-end font-monospace text-body-tertiary">
                    {sol(t?.protocolFee)}
                  </td>
                  <td className="text-end font-monospace">
                    {sol(t?.validatorCut)}
                    {j?.commissionBps != null && (
                      <span className="text-body-tertiary fs-10">
                        {' '}
                        {bps(j.commissionBps)}
                      </span>
                    )}
                  </td>
                  <td className="text-end font-monospace">{sol(t?.stakers)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <div className="fs-10 text-body-tertiary mt-2">
          The split lands hours after an epoch ends (the tip program publishes
          it); an epoch in progress has its tips so far.
          {missing.map(p => (
            <div key={p}>{UNAVAILABLE[p]}</div>
          ))}
        </div>
      </>
    );
  };

  return (
    <SectionCard
      title="Tips"
      icon="gift"
      info="Tips paid to tip accounts in its blocks per epoch, and their split: the block builder's fee, the tip program's fee, the validator's commission (its rate beside it) and its stakers. The validator's figure is what it was paid: its commission on the tips after both fees."
    >
      {body()}
    </SectionCard>
  );
};

export default TipsCard;
