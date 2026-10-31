import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import DelayedSpinner from 'components/common/DelayedSpinner';
import { explorerAddress, explorerBlock, explorerTx } from 'helpers/explorer';
import { formatLamports } from 'helpers/utils';
import useCluster from 'hooks/useCluster';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { TipPath, ValidatorTips } from 'providers/vortex-schemas';
import { Fragment, useContext, useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';

type Epoch = ValidatorTips['epochs'][number];

/** Tip transactions linked per block (the rest counted). */
const TXS_SHOWN = 3;

/** Blocks listed when an epoch is opened, most tips first. */
const BLOCKS_FIRST = 20;

/** Why a path has no figures, in a line. */
const UNAVAILABLE: Record<string, string> = {
  harmonic:
    "Harmonic's tips are paid as priority fees: they're in the block's priority fees, not told apart.",
  paladinP3:
    "Paladin's tips are paid as priority fees: they're in the block's priority fees, not told apart.",
  rakuraiTips: "Rakurai's own tip program isn't ingested yet.",
  raikuTips: "Raiku's own tip program isn't ingested yet.",
  bamBoost: "Jito's BAM Boost (JitoSOL to BAM validators) isn't ingested yet."
};

const sol = (lamports: number | null | undefined) =>
  lamports == null ? '—' : formatLamports(lamports, 4);
const bps = (b: number | null | undefined) =>
  b == null ? null : `${(b / 100).toLocaleString('en-US')}%`;

/** The epoch's distribution on chain, as explorer links: its account,
 *  the merkle root's upload, the validator's commission claim, and how
 *  many claims were made. Each where the API has it. */
const OnChainLine = ({
  jito,
  isTestnet
}: {
  jito: TipPath;
  isTestnet: boolean;
}) => {
  const link = (href: string, label: string, title?: string) => (
    <a href={href} target="_blank" rel="noreferrer" title={title}>
      {label} ↗
    </a>
  );
  const parts = [
    jito.tipDistributionAccount &&
      link(
        explorerAddress(jito.tipDistributionAccount, isTestnet),
        'Distribution account',
        jito.tipDistributionAccount
      ),
    jito.merkleRootUploadTx &&
      link(
        explorerTx(jito.merkleRootUploadTx, isTestnet),
        'Merkle root upload'
      ),
    jito.claimTxs?.validator &&
      link(explorerTx(jito.claimTxs.validator, isTestnet), 'Commission claim'),
    jito.claimTxs?.count != null &&
      `${jito.claimTxs.count.toLocaleString()} claims${
        jito.claimTxs.total != null ? ` (${sol(jito.claimTxs.total)})` : ''
      }`
  ].filter(Boolean);
  return parts.length ? (
    <div className="d-flex flex-wrap column-gap-3 row-gap-1 fs-10 mb-2">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </div>
  ) : null;
};

/** An epoch's blocks with their tips: each links to it in the explorer. */
const TipBlocks = ({
  voteKey,
  epoch,
  jito
}: {
  voteKey: string;
  epoch: number;
  /** The epoch's jitoTips path: its accounts and transactions. */
  jito?: TipPath;
}) => {
  const context = useContext(VortexDataContext);
  const { isTestnet } = useCluster();
  const key = `${voteKey}:${epoch}`;
  const fetchBlocks = context?.validatorTipBlocksState.fetchData;
  useEffect(() => {
    fetchBlocks?.(key);
  }, [key, fetchBlocks]);
  const data = context?.validatorTipBlocksState.data.get(key);
  const [all, setAll] = useState(false);
  if (!data)
    return context?.validatorTipBlocksState.error ? (
      <p className="fs-9 text-body-tertiary mb-0">
        Its blocks couldn&apos;t be loaded just now.
      </p>
    ) : (
      <DelayedSpinner loading label="Loading its blocks…" />
    );
  const tipped = [...data.blocks]
    .filter(b => b.mevTips > 0)
    .sort((a, b) => b.mevTips - a.mevTips);
  const shown = all ? tipped : tipped.slice(0, BLOCKS_FIRST);
  const hasTxs = tipped.some(b => b.tipTxs?.length);
  const onChain = jito && <OnChainLine jito={jito} isTestnet={isTestnet} />;
  if (!tipped.length)
    return (
      <>
        {onChain}
        <p className="fs-9 text-body-tertiary mb-0">
          No Jito tips in its {data.blocks.length.toLocaleString()} blocks.
        </p>
      </>
    );
  return (
    <>
      {onChain}
      <Table size="sm" className="data-table compact-rows fs-9 mb-0">
        <thead>
          <tr>
            <th>Block</th>
            <th>When</th>
            <th className="text-end">Jito tips</th>
            {hasTxs && <th>Tip txs</th>}
            <th className="text-end">Priority fees</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(b => (
            <tr key={b.slot}>
              <td>
                <a
                  href={explorerBlock(b.slot, isTestnet)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-monospace"
                >
                  {b.slot.toLocaleString()} ↗
                </a>
              </td>
              <td className="text-body-tertiary text-nowrap">
                {b.time != null
                  ? new Date(b.time * 1000).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })
                  : '—'}
              </td>
              <td className="text-end font-monospace">{sol(b.mevTips)}</td>
              {hasTxs && (
                <td className="text-nowrap">
                  {(b.tipTxs ?? []).slice(0, TXS_SHOWN).map(t => (
                    <a
                      key={t.signature}
                      href={explorerTx(t.signature, isTestnet)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-monospace fs-10 me-2"
                      title={`${sol(t.lamports)} tip`}
                    >
                      {t.signature.slice(0, 6)}… ↗
                    </a>
                  ))}
                  {(b.tipTxCount ?? 0) >
                    Math.min(TXS_SHOWN, b.tipTxs?.length ?? 0) && (
                    <span className="text-body-tertiary fs-10">
                      +
                      {(
                        (b.tipTxCount ?? 0) -
                        Math.min(TXS_SHOWN, b.tipTxs?.length ?? 0)
                      ).toLocaleString()}
                    </span>
                  )}
                </td>
              )}
              <td className="text-end font-monospace text-body-tertiary">
                {sol(b.priorityFees)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="d-flex justify-content-between fs-10 text-body-tertiary mt-2">
        <span>
          {tipped.length.toLocaleString()} of{' '}
          {data.blocks.length.toLocaleString()} blocks had Jito tips; most
          first.
        </span>
        {tipped.length > BLOCKS_FIRST && (
          <button
            type="button"
            className="btn btn-link p-0 fs-10"
            onClick={() => setAll(a => !a)}
          >
            {all ? 'Show fewer' : `Show all ${tipped.length.toLocaleString()}`}
          </button>
        )}
      </div>
    </>
  );
};

/**
 * A validator's tip income per epoch (/validators/tips): what Jito's tips
 * in its blocks came to, and how they were split - the block builder's
 * fee, Jito's tip router, the validator's commission and its stakers. An
 * epoch opens to its tipped blocks, each linked to the explorer. Paths the
 * API can't measure are named under the table.
 */
const TipsCard = ({ voteKey }: { voteKey: string }) => {
  const context = useContext(VortexDataContext);
  const fetchTips = context?.validatorTipsState.fetchData;
  useEffect(() => {
    fetchTips?.(voteKey);
  }, [voteKey, fetchTips]);
  const data = context?.validatorTipsState.data.get(voteKey);
  const [open, setOpen] = useState<number | null>(null);

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
              <th className="text-end" title="Jito tips paid in its blocks">
                Tips
              </th>
              <th className="text-end" title="The block builder's cut">
                Builder fee
              </th>
              <th className="text-end" title="Jito's tip router">
                Jito fee
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
              const isOpen = open === e.epoch;
              return (
                <Fragment key={e.epoch}>
                  <tr
                    role="button"
                    onClick={() => setOpen(isOpen ? null : e.epoch)}
                    aria-expanded={isOpen}
                  >
                    <td className="text-nowrap">
                      <span className="text-body-tertiary me-1">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <span className="font-monospace">
                        {e.epoch.toLocaleString()}
                      </span>
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
                    <td className="text-end font-monospace">
                      {sol(t?.stakers)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="bg-body-highlight">
                        <TipBlocks voteKey={voteKey} epoch={e.epoch} jito={j} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
        <div className="fs-10 text-body-tertiary mt-2">
          The split lands hours after an epoch ends (Jito publishes it); an
          epoch in progress has its tips so far.
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
      info="Jito tips in its blocks per epoch, and their split: the block builder's fee, Jito's tip router, the validator's commission (its rate beside it) and its stakers. Click an epoch for its tipped blocks, each linked to the explorer."
    >
      {body()}
    </SectionCard>
  );
};

export default TipsCard;
