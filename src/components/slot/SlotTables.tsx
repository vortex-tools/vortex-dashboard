import FeatherIcon from 'feather-icons-react';
import InfoTip from 'components/common/InfoTip';
import SectionCard from 'components/common/SectionCard';
import { footerUrl } from 'helpers/slotContext';
import { parseUserAgent } from 'helpers/userAgent';
import { formatDuration, formatLamports } from 'helpers/utils';
import { SlotFooter, SlotInfo, SlotPage } from 'providers/vortex-schemas';
import { Fragment, ReactNode } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';
import { Unrewardable, finalizationPathOf, pct2, plural } from './SlotVotes';

const EPOCH_SLOTS = 432_000;

const SlotLink = ({ slot }: { slot: number }) => (
  <Link to={`/slot/${slot}`} className="font-monospace">
    {slot.toLocaleString()}
  </Link>
);

/** A muted qualifier on the value's line: "· South Korea". */
/** Beyond this the producer's clock is off, not just propagation. */
const CLOCK_OFF_MS = 10_000;

/** "310 ms behind ours" / "3h 12min behind ours" / "40 ms ahead of ours". */
const driftText = (ms: number) => {
  const a = Math.abs(ms);
  const amount =
    a < 60_000 ? `${a.toLocaleString()} ms` : formatDuration(a / 1000);
  return `${amount} ${ms <= 0 ? 'behind' : 'ahead of'} ours`;
};

const Aside = ({ children }: { children: ReactNode }) => (
  <span className="text-body-tertiary fw-normal"> · {children}</span>
);

/** "2026-10-21 17:06:08.601 UTC" (ns). */
const utc = (ms: number) =>
  `${new Date(ms).toISOString().replace('T', ' ').replace('Z', '')} UTC`;

export type InfoRow =
  | InfoValueRow
  | {
      /** A small group heading across the table. */
      heading: string;
      /** Muted text after it on the same line. */
      aside?: ReactNode;
      title?: string;
    };

type InfoValueRow = {
  label: string;
  /** Feather icon in the row's bubble (in the theme's primary color). */
  icon: string;
  /** One line: the fact, then any short qualifier as an `Aside`. */
  value: ReactNode;
  /** Detail on hover. */
  title?: string;
};

/**
 * A card of label / value rows, in the theme's detail-table style (its
 * CRM deal details: `table-stats`, borderless, striped): an icon bubble
 * and a bold label, a colon, then a one-line value; detail on hover.
 * A `heading` row groups the rows under it. Stacks label over value on
 * phones.
 */
export const InfoTable = ({
  title,
  icon,
  rows,
  footer
}: {
  title: string;
  icon: string;
  rows: Array<InfoRow | null | false | undefined>;
  footer?: ReactNode;
}) => (
  <SectionCard title={title} icon={icon}>
    <Table
      borderless
      striped
      className="info-table w-100 table-stats fs-9 mb-0"
    >
      <thead>
        <tr>
          <th className="p-0" style={{ width: '36%' }} />
          <th className="p-0" style={{ width: '1%' }} />
          <th className="p-0" />
        </tr>
      </thead>
      <tbody>
        {rows.filter(Boolean).map(r => {
          if ('heading' in (r as InfoRow)) {
            const h = r as Extract<InfoRow, { heading: string }>;
            return (
              <tr key={h.heading}>
                <td
                  colSpan={3}
                  className="pt-3 pb-1 ps-2 fs-10 fw-bold text-uppercase text-body-tertiary"
                >
                  {h.heading}
                  {h.title && <InfoTip size={11}>{h.title}</InfoTip>}
                  {h.aside}
                </td>
              </tr>
            );
          }
          const row = r as InfoValueRow;
          return (
            <tr key={row.label}>
              <td className="pt-2 pb-1 py-sm-2 ps-2 align-middle">
                <div className="d-inline-flex align-items-center">
                  <div
                    className="d-flex flex-center flex-shrink-0 rounded-circle bg-primary-subtle me-2"
                    style={{ width: 24, height: 24 }}
                  >
                    <FeatherIcon
                      icon={row.icon}
                      size={13}
                      className="text-primary"
                    />
                  </div>
                  <span className="fw-bold text-body-highlight text-nowrap">
                    {row.label}
                  </span>
                  {row.title && <InfoTip size={12}>{row.title}</InfoTip>}
                </div>
              </td>
              <td className="py-2 pe-2 align-middle d-none d-sm-table-cell text-body-tertiary">
                :
              </td>
              <td className="pe-2 align-middle pt-0 pb-2 py-sm-2 ps-6 ps-sm-0 fw-semibold text-body-emphasis text-wrap">
                {row.value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
    {footer}
  </SectionCard>
);

/** The slot itself: outcome, time, epoch, leader, window, neighbours,
 *  and (where tracked) the block's fees and tips. */
export const OverviewTable = ({
  page,
  footer,
  infos,
  nodeName,
  leaderCohort,
  income
}: {
  page: SlotPage;
  footer: SlotFooter | null | undefined;
  infos: Map<number, SlotInfo | null>;
  nodeName: (node: string) => string;
  leaderCohort: string | null;
  income: { baseFees: number; priorityFees: number; mevTips: number } | null;
}) => {
  const ag = page.alpenglow;
  const isAlpenglow = page.consensus === 'alpenglow';
  const outcome = isAlpenglow
    ? ag?.outcome
    : page.tower?.isSkipped == null
      ? null
      : page.tower.isSkipped
        ? 'skipped'
        : 'block';
  const known = [...infos.entries()]
    .filter(([, i]) => i?.outcome === 'block')
    .map(([s]) => s)
    .sort((a, b) => a - b);
  const prevBlock = [...known].reverse().find(s => s < page.slot);
  const nextBlock = known.find(s => s > page.slot);
  const ms = ag?.footer?.producerTimeNanos
    ? ag.footer.producerTimeNanos / 1e6
    : page.blockTime != null
      ? page.blockTime * 1000
      : null;
  const clamp = ag?.footer?.clockClamp;
  const lw = page.leaderWindow;
  const parent = footer?.parentSlot ?? null;
  return (
    <InfoTable
      title="Overview"
      icon="info"
      rows={[
        {
          label: 'Outcome',
          icon: 'check-circle',
          value:
            outcome === 'block'
              ? 'Block produced'
              : outcome === 'skipped'
                ? 'Skipped'
                : outcome === 'noData'
                  ? 'No data'
                  : 'Not ingested yet'
        },
        ms != null && {
          label: ag?.footer?.producerTimeNanos ? 'Produced' : 'Block time',
          icon: 'clock',
          title: `${new Date(ms).toLocaleString('en-US')} local${clamp ? `. SIMD-0363 clamped this block's time to ${clamp === 'floor' ? "parent + 1 ns: its producer's clock is behind" : "the ceiling: its producer's clock is ahead"}.` : ''}`,
          value: (
            <>
              <span className="font-monospace">{utc(ms)}</span>
              {clamp && (
                <span className="badge badge-soft badge-soft-warning ms-2">
                  {clamp === 'floor' ? 'Clock behind' : 'Clock ahead'}
                </span>
              )}
            </>
          )
        },
        {
          label: 'Epoch',
          icon: 'calendar',
          value: (
            <>
              <Link to={`/leaderboards/consensus/epoch/${page.epoch}`}>
                {page.epoch}
              </Link>
              {page.slotIndex != null && (
                <Aside>
                  slot {page.slotIndex.toLocaleString()} of{' '}
                  {EPOCH_SLOTS.toLocaleString()}
                </Aside>
              )}
            </>
          )
        },
        {
          label: 'Leader',
          icon: 'user',
          value: page.leader ? (
            <>
              <Link to={`/validator/${page.leader}`} title={page.leader}>
                {nodeName(page.leader)}
              </Link>
              {leaderCohort && <Aside>{leaderCohort}</Aside>}
            </>
          ) : (
            '—'
          )
        },
        lw && {
          label: 'Leader window',
          icon: 'layers',
          value: (
            <>
              {['1st', '2nd', '3rd', '4th'][lw.position - 1] ?? lw.position} of{' '}
              {lw.slots}
              <Aside>
                <SlotLink slot={lw.firstSlot} />–
                <span className="font-monospace">
                  {String(lw.firstSlot + lw.slots - 1).slice(-3)}
                </span>
              </Aside>
            </>
          )
        },
        (parent != null || prevBlock != null) && {
          label: parent != null ? 'Parent slot' : 'Previous block',
          icon: 'corner-left-up',
          value: (
            <>
              <SlotLink slot={(parent ?? prevBlock)!} />
              {ag?.footer?.updateParent && <Aside>fast handover</Aside>}
            </>
          )
        },
        nextBlock != null && {
          label: 'Next block',
          icon: 'corner-right-down',
          value: <SlotLink slot={nextBlock} />
        },
        income && {
          label: 'Fees & tips',
          icon: 'dollar-sign',
          title: `Base fees ${formatLamports(income.baseFees, 4)} · priority fees ${formatLamports(income.priorityFees, 4)} · MEV tips ${formatLamports(income.mevTips, 4)}`,
          value: (
            <span className="font-monospace">
              {formatLamports(
                income.baseFees + income.priorityFees + income.mevTips,
                4
              )}
            </span>
          )
        }
      ]}
    />
  );
};

/** How the cluster decided the slot: finalization, the votes on it and
 *  the votes its block carried, and (from our nodes' pools) how the votes
 *  and certificates formed. */
export const ConsensusTable = ({
  page,
  rewardInfo,
  unrewardable
}: {
  page: SlotPage;
  /** /slots item for slot - 8 (the votes this block carried). */
  rewardInfo: SlotInfo | null | undefined;
  unrewardable: Unrewardable | null;
}) => {
  const ag = page.alpenglow;
  const fin = ag?.finalization;
  const observed = finalizationPathOf(page);
  const v = ag?.votes;
  const c = page.carried;
  const pool = page.pool;
  // The producer's clock far off ours (block time catching up after a
  // restart): timings from the block are off by as much.
  const clockOff =
    page.clockDriftMs != null && Math.abs(page.clockDriftMs) > CLOCK_OFF_MS;
  const carriedOk =
    ag?.outcome === 'block' &&
    c?.idealStakePpb != null &&
    c.includedIdealStakePpb != null;
  const ofOnline =
    carriedOk && c!.idealStakePpb! > 0
      ? c!.includedIdealStakePpb! / c!.idealStakePpb!
      : null;
  const grade = c?.perfect ? 'Perfect' : c?.thin ? 'Poor' : c ? 'OK' : null;
  const signers = rewardInfo?.votes?.signers;
  // Our nodes' pools, one row per vote kind: the stake seen and when its
  // certificate formed (fast finalize is a certificate only).
  const certMs = (kind: string) =>
    pool?.certificates.find(x => x.kind === kind)?.formedMs;
  const hasCert = (kind: string) =>
    !!pool?.certificates.some(x => x.kind === kind);
  const poolRows: Array<{
    kind: string;
    label: string;
    icon: string;
    stakePpb?: number;
  }> = pool
    ? [
        ...pool.notarize.map((x, i) => ({
          kind: 'notarize',
          label: pool.notarize.length > 1 ? `Notarize v${i + 1}` : 'Notarize',
          icon: 'check-square',
          stakePpb: x.stakePpb
        })),
        ...pool.notarizeFallback.map(x => ({
          kind: 'notarizeFallback',
          label: 'Notarize fallback',
          icon: 'rotate-ccw',
          stakePpb: x.stakePpb
        })),
        pool.skip && {
          kind: 'skip',
          label: 'Skip',
          icon: 'skip-forward',
          stakePpb: pool.skip.stakePpb
        },
        pool.skipFallback && {
          kind: 'skipFallback',
          label: 'Skip fallback',
          icon: 'rotate-cw',
          stakePpb: pool.skipFallback.stakePpb
        },
        pool.finalize && {
          kind: 'finalize',
          label: 'Finalize',
          icon: 'lock',
          stakePpb: pool.finalize.stakePpb
        },
        hasCert('fastFinalize') && {
          kind: 'fastFinalize',
          label: 'Fast finalize',
          icon: 'zap'
        }
      ].filter(
        (
          x
        ): x is {
          kind: string;
          label: string;
          icon: string;
          stakePpb: number;
        } => !!x
      )
    : [];
  const certText = (kind: string) => {
    const ms = certMs(kind);
    return ms != null ? `certificate +${ms} ms` : 'certificate';
  };
  return (
    <InfoTable
      title="Consensus"
      icon="git-merge"
      footer={
        poolRows.length > 0 && (
          <p className="fs-10 text-body-tertiary px-2 mt-2 mb-0">
            Consensus Insights come from Vortex nodes&apos; consensus detection.
          </p>
        )
      }
      rows={[
        {
          label: 'Finalized',
          icon: 'lock',
          title:
            fin?.byFooterSlot != null
              ? [
                  fin.directStakePpb != null &&
                    `${pct2(fin.directStakePpb)} of stake in its certificate`,
                  `carried by block ${fin.byFooterSlot.toLocaleString()}`
                ]
                  .filter(Boolean)
                  .join(', ')
              : undefined,
          value:
            ag?.outcome === 'skipped' ? (
              'No block to finalize'
            ) : ag?.outcome !== 'block' ? (
              '—'
            ) : !fin || fin.byFooterSlot == null ? (
              'Not finalized yet'
            ) : (
              <>
                {observed.path === 'fast'
                  ? 'Fast (80%)'
                  : observed.path === 'slow'
                    ? 'Slow (60%)'
                    : 'Via a later block'}
                {(fin.lagSlots != null || fin.lagMs != null) && (
                  <Aside>
                    {[
                      fin.lagSlots != null &&
                        `in ${plural(fin.lagSlots, 'slot')}`,
                      fin.lagMs != null && `${fin.lagMs.toLocaleString()} ms`
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Aside>
                )}
              </>
            )
        },
        {
          label: 'Votes on this slot',
          icon: 'check-square',
          title: v
            ? `Rewarded by block ${(page.slot + 8).toLocaleString()} (the reward block), whose reward certificates carry them`
            : undefined,
          value: v ? (
            <>
              {pct2(v.notarStakePpb)} notarize
              {v.skipStakePpb != null && (
                <Aside>{pct2(v.skipStakePpb)} skip</Aside>
              )}
            </>
          ) : unrewardable ? (
            <>
              Unrewardable
              <Aside>
                <SlotLink slot={page.slot + 8} />{' '}
                {unrewardable === 'skipped' ? 'was skipped' : 'carried none'}
              </Aside>
            </>
          ) : (
            'Not known yet'
          )
        },
        carriedOk && {
          label: 'Votes it carried',
          icon: 'package',
          title: `The votes on slot ${c!.rewardSlot.toLocaleString()}: ${pct2(c!.includedIdealStakePpb)} of stake included, ${pct2(c!.leftOutStakePpb)} left out, ${pct2(c!.offlineStakePpb)} offline`,
          value: (
            <>
              <span className="font-monospace">
                {ofOnline != null ? `${(ofOnline * 100).toFixed(2)}%` : '—'}
              </span>{' '}
              of online stake
              {grade && (
                <span
                  className={`badge badge-soft ms-2 badge-soft-${grade === 'Perfect' ? 'success' : grade === 'Poor' ? 'warning' : 'info'}`}
                >
                  {grade}
                </span>
              )}
              {signers != null && <Aside>{plural(signers, 'validator')}</Aside>}
              <Aside>
                on <SlotLink slot={c!.rewardSlot} />
              </Aside>
            </>
          )
        },
        poolRows.length > 0 && {
          heading: 'Consensus Insights',
          title:
            "What had arrived at Vortex's nodes by the time the slot was final - quorum, not turnout (who voted is the footer's record). Certificate times are ms after the slot's first vote.",
          aside: (
            <>
              {pool!.notarize.length > 1 && (
                <span className="badge badge-soft badge-soft-danger ms-2">
                  {pool!.notarize.length} block versions
                </span>
              )}
              {pool!.partial && (
                <span className="text-body-quaternary text-none ms-2">
                  partly recorded
                </span>
              )}
            </>
          )
        },
        // The producer's clock against ours: the footer's timestamp minus
        // when our node saw the slot.
        page.clockDriftMs != null && {
          label: 'Producer clock',
          icon: 'watch',
          title:
            "The block footer's producer timestamp minus when our node first saw the slot. A few hundred ms behind is normal (propagation). Far behind - after a cluster restart, while block time catches up - makes timings measured from the block (Since the block) read large by the same amount.",
          value: (
            <span className={clockOff ? 'text-warning' : undefined}>
              {driftText(page.clockDriftMs)}
              {clockOff && (
                <Aside>
                  block time is still catching up (after a restart?)
                </Aside>
              )}
            </span>
          )
        },
        // Since the block: when our node had it notarized and final.
        pool?.afterBlock?.finalizedMs != null && {
          label: 'Since the block',
          icon: 'clock',
          title:
            "As our voting node saw it: ms from the block's producer timestamp to when the node formed each certificate. It depends on where the block was made relative to our node.",
          value: (
            <>
              Finalized{' '}
              <span className="font-monospace">
                {pool.afterBlock.finalizedMs.toLocaleString()} ms
              </span>{' '}
              after it
              {pool.afterBlock.notarizedMs != null && (
                <Aside>
                  notarized {pool.afterBlock.notarizedMs.toLocaleString()} ms
                </Aside>
              )}
              {pool.afterBlock.finalizedBy === 'fastFinalize' && (
                <Aside>fast</Aside>
              )}
              {clockOff && <Aside>off by the producer&apos;s clock gap</Aside>}
            </>
          )
        },
        ...poolRows.map(r => ({
          label: r.label,
          icon: r.icon,
          value:
            r.stakePpb != null ? (
              <>
                {pct2(r.stakePpb)} of stake
                {hasCert(r.kind) &&
                  !(r.kind === 'notarize' && pool!.notarize.length > 1) && (
                    <Aside>{certText(r.kind)}</Aside>
                  )}
              </>
            ) : (
              <span className="fw-normal">{certText(r.kind)}</span>
            )
        }))
      ]}
    />
  );
};

/** What this block's footer carried and said about its producer, and
 *  the proof. */
export const FooterTable = ({ page }: { page: SlotPage }) => {
  const f = page.alpenglow?.footer;
  if (!f) return null;
  const sw = parseUserAgent(f.userAgent, f.userAgentKind);
  const verdict = page.alpenglow?.votes?.verification ?? f.verification ?? null;
  return (
    <InfoTable
      title="Block Footer"
      icon="package"
      rows={[
        {
          label: 'Finalizes',
          icon: 'lock',
          title:
            f.carriedFinalizedSlot != null
              ? `The ${f.carriedFinalizationPath ?? 'finalization'} certificate this footer carried, with ${pct2(f.carriedFinalizationStakePpb)} of stake`
              : undefined,
          value:
            f.carriedFinalizedSlot != null ? (
              <>
                <SlotLink slot={f.carriedFinalizedSlot} />
                <Aside>
                  {f.carriedFinalizationPath ?? 'certificate'},{' '}
                  {pct2(f.carriedFinalizationStakePpb)}
                </Aside>
              </>
            ) : (
              'none'
            )
        },
        {
          label: 'Client',
          icon: 'cpu',
          title: f.userAgent ?? undefined,
          value: sw.label
        },
        {
          label: 'Verification',
          icon: 'shield',
          title: `Every aggregate signature checks out against epoch ${page.epoch}'s validator ranking; the raw footer bytes, signatures and signer bitmaps are public.`,
          value: (
            <>
              {verdict === 'verified' ? (
                <span className="text-success">
                  <FeatherIcon icon="check" size={14} className="me-1" />
                  Verified
                </span>
              ) : (
                (verdict ?? 'Not verified yet')
              )}
              <Aside>
                <a
                  href={footerUrl(page.slot)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  raw footer
                </a>
                {', '}
                <a
                  href={footerUrl(page.slot + 8)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  certificates
                </a>
              </Aside>
            </>
          )
        }
      ]}
    />
  );
};
