import { ColumnDef } from '@tanstack/react-table';
import { productionLoss, pts } from 'helpers/consensusBoards';
import { ProducerLeaderboardRecord } from 'providers/vortex-schemas';
import { ReactElement } from 'react';

/**
 * A producer's leader slots by how its block did, as the Tower voting
 * leaderboard splits votes (Perfect % / Ok / Slow / Skipped): Perfect %
 * (block carried >= 99.9% of the online stake; green), then counts of OK
 * (98-99.9%; purple), Poor (< 98%; yellow) and Skipped (red) slots.
 * Hover a count for what it cost the Production score.
 */
type Kind = 'perfect' | 'ok' | 'poor' | 'skipped';

const SPEC: Record<
  Kind,
  {
    header: string;
    title: string;
    cls: string;
    count: (p: ProducerLeaderboardRecord) => number | null | undefined;
  }
> = {
  perfect: {
    header: 'Perfect',
    title:
      'Share of its classified leader slots whose block carried 99.9% or more of the online stake (voters in a 32+ slot offline run left out): counted as full',
    cls: 'text-success fw-semibold',
    count: p => p.perfectSlots
  },
  ok: {
    header: 'OK',
    title:
      'Blocks that carried 98% to 99.9% of the online stake - usually a late voter or two. Hover for what they cost.',
    cls: 'text-primary-emphasis fw-semibold',
    count: p => p.okSlots
  },
  poor: {
    header: 'Poor',
    title:
      'Blocks that carried less than 98% of the online stake - its own blocks left votes out. Hover for what they cost.',
    cls: 'text-warning fw-semibold',
    count: p => p.thinSlots
  },
  skipped: {
    header: 'Skipped',
    title: 'Its leader slots with no block. Hover for what they cost.',
    cls: 'text-danger fw-semibold',
    // The classified scope, so the four add up to classifiedSlots.
    count: p => p.skippedClassifiedSlots ?? p.skippedSlots
  }
};

const Dash = () => <span className="opacity-50">—</span>;

const value = (kind: Kind, p: ProducerLeaderboardRecord | null | undefined) => {
  if (!p) return null;
  const c = SPEC[kind].count(p);
  if (c == null) return null;
  if (kind !== 'perfect') return c;
  return p.classifiedSlots ? c / p.classifiedSlots : null;
};

const costTitle = (kind: Kind, p: ProducerLeaderboardRecord) => {
  const l = productionLoss(p);
  if (!l) return undefined;
  const lost = kind === 'ok' ? l.minor : kind === 'poor' ? l.thin : l.skipped;
  return `cost ${pts(lost)} of Production`;
};

export const productionBlockColumns = <T,>(
  producerOf: (row: T) => ProducerLeaderboardRecord | null | undefined,
  opts: { opensGroup?: boolean } = {}
): ColumnDef<T>[] =>
  (['perfect', 'ok', 'poor', 'skipped'] as const).map((kind, i) => {
    const border = opts.opensGroup && i === 0 ? ' border-start' : '';
    return {
      id: `${kind}Blocks`,
      accessorFn: row => value(kind, producerOf(row)) ?? undefined,
      sortUndefined: 'last' as const,
      header: (): ReactElement => (
        <span title={SPEC[kind].title}>{SPEC[kind].header}</span>
      ),
      cell: ({ row }) => {
        const p = producerOf(row.original);
        const v = value(kind, p);
        if (p == null || v == null) return <Dash />;
        const text =
          kind === 'perfect'
            ? `${(Math.floor(v * 1e4) / 100).toFixed(2)}%`
            : v.toLocaleString();
        return (
          <span
            className={`font-monospace${v === 0 ? ' opacity-50' : ''}`}
            title={
              kind === 'perfect'
                ? `${(p.perfectSlots ?? 0).toLocaleString()} of ${(p.classifiedSlots ?? 0).toLocaleString()} classified slots`
                : costTitle(kind, p)
            }
          >
            {text}
          </span>
        );
      },
      meta: {
        cellProps: { className: `text-end ${SPEC[kind].cls}${border}` },
        headerProps: { className: `text-end text-nowrap${border}` }
      }
    };
  });
