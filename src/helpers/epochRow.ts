import { z } from 'zod';

const num = z.number().nullable().catch(null);

/** One epoch's figures, as /epoch and /epochs answer them (lamports,
 *  unix seconds; null where the API hasn't the figure). The epoch in
 *  progress is partial (complete false, endTime null). */
export const epochRowSchema = z.object({
  epoch: z.number(),
  complete: z.boolean().catch(false),
  consensus: z.string().nullable().catch(null),
  firstSlot: num,
  lastSlot: num,
  slots: num,
  startTime: num,
  endTime: num,
  processedSlots: num,
  blocks: num,
  skippedSlots: num,
  baseFees: num,
  priorityFees: num,
  mevTips: num,
  totalStake: num,
  stakedValidators: num,
  effectiveStake: num,
  activatingStake: num,
  deactivatingStake: num,
  stakerInflationRewards: num,
  // Commission validators took from the epoch's inflation rewards, and
  // the whole budget (reconciled epochs only).
  validatorInflationRewards: num.optional().catch(null),
  inflationBudget: num.optional().catch(null),
  stakerBlockRewards: num,
  joined: num,
  left: num,
  capitalization: num,
  inflationRate: num,
  // Halts: TowerBFT epochs' gaps of a minute or more without a block
  // (kind gap, with times), Alpenglow epochs' cluster restarts (kind
  // restart, at a hard-fork slot, without times: Alpenglow block times
  // are the producer's and run on through a restart). [] for none; null
  // (or absent) before the epoch is scanned.
  halts: z
    .array(
      z.object({
        kind: z.string().catch('gap'),
        restartSlot: num.optional().catch(null),
        lastBlockSlot: num,
        nextBlockSlot: num,
        startTime: num,
        endTime: num,
        durationSeconds: num,
        // The restart announcement whose slots fall in the gap.
        announcement: z
          .object({
            id: z.union([z.string(), z.number()]).nullable().catch(null),
            url: z.string().nullable().catch(null),
            postedAt: num
          })
          .nullable()
          .catch(null)
      })
    )
    .nullable()
    .optional()
    .catch(null)
});
export type EpochRow = z.infer<typeof epochRowSchema>;

export const epochsSchema = z.object({
  epochs: z.array(epochRowSchema).catch([]),
  nextBefore: num
});

/** Fees and tips a block's leader took in, when any part is known. */
export const blockIncome = (r: EpochRow) =>
  r.baseFees == null && r.priorityFees == null && r.mevTips == null
    ? null
    : (r.baseFees ?? 0) + (r.priorityFees ?? 0) + (r.mevTips ?? 0);

/** Skipped share of the slots that have an outcome. */
export const skipRate = (r: EpochRow) =>
  r.blocks == null || r.skippedSlots == null || r.blocks + r.skippedSlots === 0
    ? null
    : r.skippedSlots / (r.blocks + r.skippedSlots);
