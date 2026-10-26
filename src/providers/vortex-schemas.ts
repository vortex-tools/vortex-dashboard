import { z } from 'zod';

// All API responses pass through a Zod schema before we trust them.
// The domain types are inferred from these schemas so there's one source
// of truth for both shape + runtime validation.

// Validator display names. The API returns the placeholder 'N/A' for
// validators it no longer has a name for (e.g. retired ones on old epochs),
// and some records carry ''. Both normalize to null, so every display path's
// `name || truncateAddress(...)` / `name ?? address` fallback shows the
// address instead of a literal "N/A" or a blank.
const validatorNameSchema = z
  .string()
  .nullable()
  .transform(name =>
    name === null || name.trim() === '' || name.trim() === 'N/A' ? null : name
  );

const incomeDetailsSchema = z.object({
  baseFees: z.number(),
  priorityFees: z.number(),
  mevTips: z.number()
});
export type IncomeDetails = z.infer<typeof incomeDetailsSchema>;

// Block capture (vortex-data c331b78): per validator per epoch, the MEDIAN
// over its blocks of income / baseline, where baseline = the median income
// of OTHER leaders' blocks within +/-100 slots. 1.0 = earns like the blocks
// around it. null = not computed yet (render "-", not 0). Absent on APIs
// before it.
const captureFields = {
  captureTotal: z.number().nullable().optional().catch(null),
  captureFees: z.number().nullable().optional().catch(null),
  captureTips: z.number().nullable().optional().catch(null),
  captureBlocks: z.number().nullable().optional().catch(null),
  // Its skipped leader slots' baselines summed (lamports).
  missedToSkipsLamports: z.number().nullable().optional().catch(null),
  // Mean per confirmed block (the cluster row: the cluster mean).
  meanIncome: incomeDetailsSchema.nullable().optional().catch(null)
};

const epochIncomeSchema = z.object({
  epoch: z.number(),
  stake: z.number(),
  totalSlots: z.number(),
  confirmedSlots: z.number(),
  skippedSlots: z.number(),
  totalIncome: incomeDetailsSchema,
  medianIncome: incomeDetailsSchema,
  minIncome: incomeDetailsSchema,
  maxIncome: incomeDetailsSchema,
  ...captureFields
});
export type EpochIncome = z.infer<typeof epochIncomeSchema>;

export const epochIncomeListSchema = z.array(epochIncomeSchema);

export const epochVoteStatsItemSchema = z.object({
  epoch: z.number(),
  votedSlots: z.number(),
  earnedCredits: z.number(),
  totalLatency: z.number(),
  totalExcessLatency: z.number(),
  lastUploadedBucket: z.number(),
  ranking: z.number(),
  // Slot-status breakdown. Invariants:
  //   perfectSlots + okSlots + slowSlots == votedSlots
  //   votedSlots + skippedSlots == votable slots for this validator
  // Categories match the canonical SlotStatus enum (Perfect / Ok / Slow
  // / Skipped). For IDEAL_RECORD_KEY entries: perfectSlots == votedSlots
  // and the other three are 0.
  perfectSlots: z.number(),
  okSlots: z.number(),
  slowSlots: z.number(),
  skippedSlots: z.number()
});

export const epochVoteStatsListSchema = z.array(epochVoteStatsItemSchema);
export type EpochVoteStatsItem = z.infer<typeof epochVoteStatsItemSchema>;

export const epochVoteRecordResponseSchema = z.object({
  epoch: z.number(),
  votesBase64: z.string()
});

export const epochVotingLeaderboardRecordSchema = z.object({
  nodeAddress: z.string(),
  nodeName: validatorNameSchema,
  voteAddress: z.string(),
  /** Server-assigned 1-indexed rank within the epoch (IDEAL_RECORD_KEY is 0). */
  rank: z.number(),
  votedSlots: z.number(),
  earnedCredits: z.number(),
  totalLatency: z.number(),
  totalExcessLatency: z.number(),
  // Slot-status breakdown — see epochVoteStatsItemSchema for invariants.
  perfectSlots: z.number(),
  okSlots: z.number(),
  slowSlots: z.number(),
  skippedSlots: z.number(),
  // DB-IP's ASN-country-city key ("395201-DE-Frankfurt am Main"): a
  // provider's presence in a city, not a building. Optional: an API may
  // leave it out.
  datacenter: z.string().nullish().catch(null),
  // The API field is `provider` (hosting org); we expose it in the UI
  // as "Host" for clarity, but the schema/type tracks the wire name.
  //
  // Newly added field — use .nullish() (string | null | undefined)
  // rather than .nullable() so that older API deployments that haven't
  // started returning the key yet don't fail validation. Once the field
  // is guaranteed by the server, this can be tightened back to
  // .nullable().
  provider: z.string().nullish(),
  continent: z.string().nullable(),
  country: z.string().nullable(),
  // Validator client info from gossip; nullable since not every node
  // advertises it.
  softwareBase: z.string().nullable(),
  softwareFlavor: z.string().nullable(),
  softwareVersion: z.string().nullable()
});

export const epochVotingLeaderboardSchema = z.object({
  epoch: z.number(),
  records: z.array(epochVotingLeaderboardRecordSchema)
});

export type EpochVotingLeaderboardRecord = z.infer<
  typeof epochVotingLeaderboardRecordSchema
>;
export type EpochVotingLeaderboard = z.infer<
  typeof epochVotingLeaderboardSchema
>;

export const epochIncomeLeaderboardRecordSchema = z.object({
  nodeAddress: z.string(),
  nodeName: validatorNameSchema,
  totalIncome: incomeDetailsSchema,
  medianIncome: incomeDetailsSchema,
  minIncome: incomeDetailsSchema,
  maxIncome: incomeDetailsSchema,
  totalSlots: z.number(),
  confirmedSlots: z.number(),
  skippedSlots: z.number().catch(0),
  // Validator client info from gossip; nullable since not every node
  // advertises it.
  softwareBase: z.string().nullable(),
  softwareFlavor: z.string().nullable(),
  softwareVersion: z.string().nullable(),
  ...captureFields
});

export const epochIncomeLeaderboardSchema = z.object({
  epoch: z.number(),
  records: z.array(epochIncomeLeaderboardRecordSchema)
});

export type EpochIncomeLeaderboardRecord = z.infer<
  typeof epochIncomeLeaderboardRecordSchema
>;
export type EpochIncomeLeaderboard = z.infer<
  typeof epochIncomeLeaderboardSchema
>;

// ---- Validator operational status (/validators/status) -----------------
//
// One validator's live operational state plus a verdict per check. The
// endpoint is new, so every optional section is `.catch(null)`: if one
// sub-object changes shape, that section drops out instead of the whole
// response failing validation. Lamport amounts are u64 on the wire; stake
// can exceed 2^53, which only matters past the precision we display.

const versionRequirementSchema = z.object({
  epoch: z.number(),
  minVersion: z.string().nullable(),
  maxVersion: z.string().nullable(),
  inheritedFromPrevEpoch: z.boolean(),
  satisfied: z.boolean().nullable()
});

// The program's delegation to one validator (/validators/status
// sfdp.stake). Lamports. matching / expectedDelegation / shortfall come
// from the inferred matching rule (sfdpProgramSchema); null if unfitted.
const sfdpStakeSchema = z.object({
  effective: z.number(),
  activating: z.number(),
  deactivating: z.number(),
  shareOfValidatorStake: z.number().nullable(),
  shareOfProgram: z.number().nullable(),
  externalStake: z.number(),
  matching: z.number().nullable(),
  expectedDelegation: z.number().nullable(),
  shortfall: z.number().nullable(),
  // inTransition = the largest live SFDP account
  // activated this epoch or last (the program's 1-2 epoch rebalance);
  // shortfall is 0 then. criteria gate expectedDelegation (0 if !eligible).
  mainActivationEpoch: z.number().nullable().catch(null),
  inTransition: z.boolean().catch(false),
  criteria: z
    .object({
      approved: z.boolean(),
      stakeWithinLimit: z.boolean(),
      commissionWithinLimit: z.boolean().nullable(),
      versionMeetsMinimum: z.boolean().nullable(),
      eligible: z.boolean()
    })
    .nullable()
    .catch(null)
});

// SFDP matching rule, fitted server-side to the live population (the
// Foundation only publishes it in words):
//   delegation = min(cap, baseline + matchRate * externalStake)
// fitResidualP50 is the median distance (lamports) of fitted validators
// from that line - i.e. how well the inferred rule fits.
export const sfdpProgramSchema = z.object({
  baseline: z.number(),
  matchRate: z.number(),
  cap: z.number(),
  fitValidators: z.number(),
  fitResidualP50: z.number()
});

export type SfdpProgram = z.infer<typeof sfdpProgramSchema>;

const versionComplianceSchema = z.object({
  family: z.string(),
  runningVersion: z.string(),
  current: versionRequirementSchema.nullable(),
  upcoming: z.array(versionRequirementSchema),
  // First published epoch the running build fails; null promises nothing
  // about epochs not yet published.
  firstFailingEpoch: z.number().nullable()
});

const statusSoftwareSchema = z.object({
  clientId: z.string().nullable(),
  family: z.string().nullable(),
  flavor: z.string().nullable(),
  version: z.string().nullable(),
  featureSet: z.number().nullable(),
  shredVersion: z.number().nullable(),
  gossipIp: z.string().nullable()
});

// Unknown future statuses degrade to 'unknown' rather than failing the parse.
const checkStatusSchema = z
  .enum(['ok', 'warn', 'fail', 'unknown'])
  .catch('unknown');

export const validatorStatusSchema = z.object({
  identity: z.string(),
  voteAccount: z.string(),
  epoch: z.number(),
  slot: z.number(),
  asOf: z.number(), // unix seconds of the snapshot
  info: z
    .object({
      name: z.string().nullable(),
      website: z.string().nullable(),
      details: z.string().nullable(),
      keybaseUsername: z.string().nullable(),
      iconUrl: z.string().nullable()
    })
    .nullable()
    .catch(null),
  dataCenterKey: z.string().nullable().catch(null),
  geo: z
    .object({
      asn: z.number().nullable(),
      asnOrganization: z.string().nullable(),
      countryCode: z.string().nullable(),
      // Present in practice, not yet in the published spec.
      country: z.string().nullish(),
      continent: z.string().nullish(),
      city: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable()
    })
    .nullable()
    .catch(null),
  // This validator's share of stake in its ASN, and in SFDP's ASN + city
  // grouping (dataCenter*: SFDP's own 15% rule - not a data center, DB-IP's
  // ASN-country-city isn't a building); null if not geolocated or on APIs
  // that predate it.
  concentration: z
    .object({
      dataCenterKey: z.string(),
      dataCenterStakeShare: z.number(),
      dataCenterValidators: z.number(),
      asn: z.number(),
      asnStakeShare: z.number(),
      asnValidators: z.number()
    })
    .nullable()
    .catch(null),
  software: statusSoftwareSchema.nullable().catch(null),
  stake: z.object({
    activatedStake: z.number(),
    epochVoteAccount: z.boolean(),
    delinquent: z.boolean(),
    lastVote: z.number(),
    rootSlot: z.number(),
    slotsBehind: z.number(),
    // Of cluster.totalActivatedStake; null on APIs that predate it.
    shareOfTotal: z.number().nullable().catch(null)
  }),
  identityBalance: z
    .object({
      lamports: z.number(),
      estimatedVoteFeesPerEpoch: z.number(),
      epochsOfRunway: z.number().nullable()
    })
    .nullable()
    .catch(null),
  voteState: z
    .object({
      lamports: z.number(),
      nodePubkey: z.string(),
      authorizedWithdrawer: z.string(),
      authorizedVoter: z.string().nullable(),
      nextAuthorizedVoter: z.string().nullable(),
      inflationRewardsCommissionBps: z.number(),
      blockRevenueCommissionBps: z.number(),
      blsPubkeySet: z.boolean(),
      // SIMD-0232 commission collectors (vote state V4): where inflation
      // commission (default: the vote account) and block-revenue
      // commission (default: the node identity) are paid. Optional until
      // the API serves them.
      inflationRewardsCollector: z.string().nullable().optional().catch(null),
      blockRevenueCollector: z.string().nullable().optional().catch(null),
      // Vote-state changes that are set but not in effect yet (requested
      // from vortex-data): per field, the value in effect for the current
      // epoch's payout, the new value, and the first epoch it applies to.
      // Under SIMD-0249 commission changes apply at least a full epoch
      // later (the runtime pays from an earlier epoch-stakes snapshot).
      // Only fields that differ are present: {} = nothing pending, null =
      // unknown (terms not stored yet), absent = API predates the field.
      pending: z
        .record(
          z.string(),
          z.object({
            effective: z.union([z.number(), z.string()]).nullable(),
            next: z.union([z.number(), z.string()]).nullable(),
            // null when next epoch's terms weren't captured (epoch + 1 or + 2)
            fromEpoch: z.number().nullable().catch(null),
            // Changed twice: `next` is locked in for epoch + 1, `later` was
            // set since and applies from epoch + 2.
            later: z
              .object({
                value: z.union([z.number(), z.string()]).nullable(),
                fromEpoch: z.number().nullable().catch(null)
              })
              .nullable()
              .optional()
              .catch(null)
          })
        )
        .nullable()
        .optional()
        .catch(null),
      lastVotedSlot: z.number().nullable(),
      rootSlot: z.number().nullable()
    })
    .nullable()
    .catch(null),
  // Validator Admission Ticket (SIMD-0357).
  vat: z
    .object({
      alpenglowActive: z.boolean(),
      voteAccountLamports: z.number(),
      minimumBalance: z.number(),
      vatLamportsPerEpoch: z.number(),
      blsPubkeySet: z.boolean(),
      epochsFunded: z.number(),
      // Balance-based prediction for the boundary after next.
      admitted: z.boolean(),
      failureReason: z.string().nullable(),
      // The runtime's actual admission decisions (next epoch's stake set is
      // already frozen); null = no admission rows yet.
      admittedThisEpoch: z.boolean().nullable().optional().catch(null),
      nextEpoch: z.number().nullable().optional().catch(null),
      admittedNextEpoch: z.boolean().nullable().optional().catch(null)
    })
    .nullable()
    .catch(null),
  sfdp: z
    .object({
      participant: z
        .object({
          mainnetIdentity: z.string(),
          testnetIdentity: z.string().nullable(),
          state: z.string(),
          onboardingEpoch: z.number().nullable()
        })
        .nullable()
        .catch(null),
      stake: sfdpStakeSchema.nullable().catch(null),
      // The inferred matching rule (same as the summary's sfdpProgram).
      program: sfdpProgramSchema.nullable().catch(null),
      mainnet: versionComplianceSchema.nullable().catch(null),
      testnet: z
        .object({
          identity: z.string(),
          epoch: z.number(),
          software: statusSoftwareSchema.nullable(),
          compliance: versionComplianceSchema.nullable()
        })
        .nullable()
        .catch(null)
    })
    .catch({
      participant: null,
      stake: null,
      program: null,
      mainnet: null,
      testnet: null
    }),
  cluster: z
    .object({
      alpenglowActive: z.boolean(),
      slotMs: z.number(),
      vatLamportsPerEpoch: z.number(),
      voteAccountRentExemptMinimum: z.number(),
      // Cluster-wide totals; null on APIs that predate them.
      totalActivatedStake: z.number().nullable().catch(null),
      sfdpTotalStake: z.number().nullable().catch(null)
    })
    .nullable()
    .catch(null),
  checks: z.array(
    z.object({ id: z.string(), status: checkStatusSchema, summary: z.string() })
  )
});

export type ValidatorStatus = z.infer<typeof validatorStatusSchema>;
export type ValidatorStatusCheck = ValidatorStatus['checks'][number];

// ---- All-validators status summary (/validators/status/summary) --------
//
// One row per staked vote account, built server-side from the same
// snapshots as /validators/status, so a verdict here always matches the
// validator's own status section. Checks carry status only (no summaries);
// sfdp_version_testnet is present only for SFDP participants with a testnet
// identity. Sorted by identity on the wire.
export const validatorStatusSummarySchema = z.object({
  epoch: z.number(),
  asOf: z.number(),
  sfdpTotalStake: z.number().nullable().catch(null),
  sfdpProgram: sfdpProgramSchema.nullable().catch(null),
  validators: z.array(
    z.object({
      identity: z.string(),
      voteAccount: z.string(),
      name: validatorNameSchema,
      activatedStake: z.number(),
      delinquent: z.boolean(),
      software: z
        .object({
          clientId: z.string().nullable(),
          family: z.string().nullable(),
          version: z.string().nullable()
        })
        .nullable()
        .catch(null),
      countryCode: z.string().nullable().catch(null),
      country: z.string().nullable().catch(null),
      continent: z.string().nullable().catch(null),
      sfdpState: z.string().nullable().catch(null),
      // SFDP stake (lamports). externalStake = activatedStake - sfdpStake (what's matched);
      // sfdpShortfall = how far the delegation sits below the rule.
      sfdpStake: z.number().nullable().catch(null),
      externalStake: z.number().nullable().catch(null),
      sfdpShortfall: z.number().nullable().catch(null),
      sfdpInTransition: z.boolean().nullable().catch(null),
      sfdpEligible: z.boolean().nullable().catch(null),
      // null when the identity balance is unknown OR votes are free (Alpenglow)
      epochsOfRunway: z.number().nullable().catch(null),
      // A commission increase is set but not in effect yet (null = unknown).
      pendingCommissionIncrease: z.boolean().nullable().optional().catch(null),
      // tickets the vote account funds beyond rent; null if not read
      vatEpochsFunded: z.number().nullable().catch(null),
      // Its leader slots this epoch so far (the production leaderboard's
      // numbers); null before its first; absent on older APIs.
      producing: z
        .object({ blocks: z.number(), skippedSlots: z.number() })
        .nullable()
        .optional()
        .catch(undefined),
      checks: z
        .array(z.object({ id: z.string(), status: checkStatusSchema }))
        .catch([])
    })
  )
});

export type ValidatorStatusSummary = z.infer<
  typeof validatorStatusSummarySchema
>;
export type ValidatorStatusSummaryRow =
  ValidatorStatusSummary['validators'][number];

// ---- Live stake (/validators/stake) ------------------------------------
//
// Read from the chain at request time, so it moves within the epoch.
// activating / deactivating are the lamports warming up / cooling down
// this epoch - i.e. the change in active stake going into the next one.
export const validatorStakeSchema = z.object({
  identity: z.string(),
  voteKey: z.string(),
  epoch: z.number(),
  activeStake: z.number(),
  activatingStake: z.number(),
  deactivatingStake: z.number()
});

export type ValidatorStake = z.infer<typeof validatorStakeSchema>;

// ---- Stake changes (/validators/stake-changes) ---------------------------
//
// One item per completed epoch (oldest first): effective stake before and
// after, reward compounding kept apart from real flows (inflow / outflow
// beyond rewards), by known pool (everyone else is "other"), the largest
// per-delegator (withdraw authority) changes with the validators the stake
// came from or went to, known pools' holdings, and whether the vote account
// stayed in / entered / left the stake set (an entry or exit shows every
// delegation as new / exited at once - not delegators moving). Stake
// delegated in E shows up in E + 1 (it counts when it starts earning).
const stakeLabelSchema = z
  .object({
    name: z.string(),
    kind: z.string().nullable().catch(null),
    // Sanctum's token name ("Helius Staked SOL"); null where it's the name.
    fullName: z.string().nullish().catch(null)
  })
  .nullable()
  .catch(null);
export const stakeChangeEpochSchema = z.object({
  epoch: z.number(),
  stakeBefore: z.number(),
  stakeAfter: z.number(),
  rewardGrowth: z.number().catch(0),
  inflow: z.number().catch(0),
  outflow: z.number().catch(0),
  net: z.number().catch(0),
  delegatorsBefore: z.number().nullable().catch(null),
  delegatorsAfter: z.number().nullable().catch(null),
  newDelegators: z.number().catch(0),
  exitedDelegators: z.number().catch(0),
  top5Share: z.number().nullable().catch(null),
  byLabel: z
    .array(
      z.object({
        label: z.string(),
        inflow: z.number().catch(0),
        outflow: z.number().catch(0)
      })
    )
    .catch([]),
  changes: z
    .array(
      z.object({
        withdrawer: z.string(),
        staker: z.string().nullable().catch(null),
        label: stakeLabelSchema,
        kind: z.string(),
        before: z.number().catch(0),
        after: z.number().catch(0),
        net: z.number(),
        counterparts: z
          .array(
            z.object({
              voteKey: z.string(),
              name: z.string().nullable().catch(null),
              net: z.number().catch(0)
            })
          )
          .catch([])
      })
    )
    .catch([]),
  moreChanges: z.number().catch(0),
  pools: z
    .array(
      z.object({
        label: z.string(),
        // The pool's name from Sanctum's LST list ("Helius Staked SOL"
        // for hSOL); requested of vortex-data, absent until served.
        fullName: z.string().nullish().catch(null),
        kind: z.string().nullable().catch(null),
        lamports: z.number(),
        share: z.number().nullable().catch(null)
      })
    )
    .catch([]),
  stakeSet: z.string().catch('stayed')
});
export const stakeChangesSchema = z.array(stakeChangeEpochSchema);
export type StakeChangeEpoch = z.infer<typeof stakeChangeEpochSchema>;

// ---- Per-epoch earnings (/epochs/earnings) -----------------------------
//
// One validator's take of each revenue stream, what voting cost, and the
// net, per epoch (flows only, no balances). Oldest-first. Lamports.
// income.voteAccountReward is null for the current epoch (paid in the next
// epoch's first block) and for past epochs not backfilled yet; net is null
// then too. Under Alpenglow inflationCommission is null (the payout also
// holds the participation reward) and costs move from voteFees to vat.
export const epochEarningsSchema = z.object({
  epoch: z.number(),
  consensus: z.string().catch('tower'),
  blockRevenue: z.object({
    baseFees: z.number(),
    priorityFees: z.number(),
    mevTips: z.number()
  }),
  rates: z
    .object({
      inflationRewardsCommissionBps: z.number().nullable(),
      blockRevenueCommissionBps: z.number().nullable(),
      mevCommissionBps: z.number().nullable(),
      // "epoch" | "previousEpoch": the epoch's own Jito rate, or (not
      // published yet) the previous epoch's; "noTipAccount": no Jito tip
      // distribution account (plain Agave), so no MEV commission at all.
      mevCommissionBpsSource: z.string().nullable().optional().catch(null)
    })
    .nullable()
    .catch(null),
  income: z.object({
    voteAccountReward: z.number().nullable(),
    inflationCommission: z.number().nullable(),
    blockRevenueCommission: z.number().nullable(),
    mevCommission: z.number().nullable(),
    // Alpenglow: voteAccountReward's gross breakdown (before commission):
    // what its votes earned, and its producer bonus. Not part of net.
    votingReward: z.number().nullable().optional().catch(null),
    producerBonus: z.number().nullable().optional().catch(null),
    // SFDP's vote-cost reimbursement, to the identity, filed under the
    // epoch it covers (it lands ~a day after); in net. null: not an SFDP
    // participant that epoch; 0: participant, nothing recorded (see
    // sfdp.pending). voteCostReimbursement: its name in an earlier build.
    sfdpReimbursement: z.number().nullable().optional().catch(null),
    voteCostReimbursement: z.number().nullable().optional().catch(null),
    // The epoch's whole inflation reward for the vote account: its own
    // part (voteAccountReward) plus its delegators' payouts, exact (0%
    // commission too). Not in net. null where the delegator side isn't
    // reconciled; absent on older APIs.
    inflationRewardGross: z.number().nullable().optional().catch(null)
  }),
  // SFDP attribution: inferred (transfers name no epoch), where it landed,
  // and whether a participant's payment is still expected. null: not a
  // participant.
  sfdp: z
    .object({
      source: z.string().nullable().catch(null),
      landedSlot: z.number().nullable().catch(null),
      pending: z.boolean().catch(false)
    })
    .nullable()
    .optional()
    .catch(null),
  sharedWithStakers: z.number().nullable().catch(null),
  costs: z.object({
    voteFees: z.number(),
    // false = an upper bound (one vote tx per voted slot at the base fee)
    voteFeesExact: z.boolean(),
    vat: z.number(),
    // false = the slot-tier constant; the debit isn't recorded yet
    vatExact: z.boolean()
  }),
  net: z.number().nullable(),
  // Unix seconds: block times of the epoch's first / last confirmed block.
  // endTime is null while the epoch is in progress; both null on APIs
  // that predate them.
  startTime: z.number().nullable().catch(null),
  endTime: z.number().nullable().catch(null)
});
export const epochEarningsListSchema = z.array(epochEarningsSchema);
export type EpochEarnings = z.infer<typeof epochEarningsSchema>;

export const validatorSchema = z.object({
  nodeAddress: z.string(),
  voteAddress: z.string().nullable(),
  name: validatorNameSchema
});

export const validatorsResponseSchema = z.object({
  validators: z.array(validatorSchema)
});

export type Validator = z.infer<typeof validatorSchema>;

// Where the cluster is in the TowerBFT -> Alpenglow (SIMD-0326) transition.
// null while nothing is scheduled. Once "active", epochs >= cutoverEpoch
// are Alpenglow and the Tower vote products are historical.
export const alpenglowStatusSchema = z.object({
  phase: z.string(), // "scheduled" | "migrating" | "active"
  activationSlot: z.number().nullable().catch(null),
  genesisSlot: z.number().nullable().catch(null),
  cutoverEpoch: z.number().nullable().catch(null)
});
export type AlpenglowStatus = z.infer<typeof alpenglowStatusSchema>;

const ingestionSourceSchema = z.object({
  lastSlot: z.number(),
  lagSlots: z.number(),
  updatedAt: z.number().nullable().catch(null)
});

export const currentEpochResponseSchema = z.object({
  epoch: z.number(),
  // Which cluster the API instance serves; absent on older APIs (mainnet).
  cluster: z.string().nullable().optional().catch(null),
  alpenglow: alpenglowStatusSchema.nullable().optional().catch(null),
  // Data freshness (refreshed every 15 s server-side). blocks = the Tower
  // block-ingestor (fees, MEV, block times, Tower votes; can lag on
  // mainnet; null where it doesn't run, e.g. testnet). footers = the
  // Alpenglow ingestor (votes, finalization; null before it runs).
  ingestion: z
    .object({
      finalizedSlot: z.number(),
      blocks: ingestionSourceSchema.nullable().catch(null),
      footers: ingestionSourceSchema.nullable().catch(null),
      // Alpenglow epochs with any footer ingested, ascending (gaps from a
      // re-ingest are explicit). Absent on older APIs = unknown.
      footerEpochs: z.array(z.number()).nullable().optional().catch(null),
      checkedAt: z.number().nullable().catch(null)
    })
    .nullable()
    .optional()
    .catch(null),
  // Cluster totals for the current epoch so far (refreshed every 15 s
  // server-side): the block fields are null where no block ingestion runs
  // (testnet). Absent on older APIs.
  totals: z
    .object({
      epoch: z.number(),
      processedSlots: z.number().nullable().catch(null),
      blocksProduced: z.number().nullable().catch(null),
      skippedSlots: z.number().nullable().catch(null),
      blockRevenue: z
        .object({
          baseFees: z.number(),
          priorityFees: z.number(),
          mevTips: z.number()
        })
        .nullable()
        .catch(null),
      activeValidators: z.number().nullable().catch(null),
      stakedValidators: z.number().nullable().catch(null),
      readAt: z.number().nullable().catch(null)
    })
    .nullable()
    .optional()
    .catch(null),
  // Where the cluster is in the epoch, and when it should end (recent
  // observed slot time, not the nominal 400 ms). Absent on older APIs.
  progress: z
    .object({
      slotIndex: z.number(),
      slotsInEpoch: z.number(),
      absoluteSlot: z.number().nullable().catch(null),
      // Observed seconds per slot (recent performance samples).
      slotSeconds: z.number().nullable().optional().catch(null),
      estimatedEndTime: z.number().nullable().catch(null),
      // Unix seconds the server took this reading (refreshed every few s).
      readAt: z.number().nullable().optional().catch(null)
    })
    .nullable()
    .optional()
    .catch(null)
});
export type EpochTotals = NonNullable<
  z.infer<typeof currentEpochResponseSchema>['totals']
>;
export type EpochProgress = NonNullable<
  z.infer<typeof currentEpochResponseSchema>['progress']
>;
export type Ingestion = NonNullable<
  z.infer<typeof currentEpochResponseSchema>['ingestion']
>;

// ---- Alpenglow participation (/epochs/participation, .../leaderboard) --
//
// Per epoch, from the cutover on. Counts are over eligibleSlots (slots
// whose footer was read). CAUTION: skippedSlots = skip VOTES cast (a real
// vote, paid like notarize); "did not vote" is missedSlots. On the Tower
// endpoints skippedSlots meant "did not vote" - never reuse that mapping.
// skippedNotarizedSlots ("late skips"): skips on slots the cluster
// notarized anyway - the lag / free-rider signal.
// A validator's Alpenglow vote rewards for one epoch, in lamports (so far,
// for the epoch in progress). Per paid slot (its notarize OR skip in the
// slot's reward certificate) it earns perSlot = budget * stake /
// (slotsPerEpoch * totalStake); the producer that packed the certificate
// gets the same again (producer bonus). Gross, before commission. null:
// not admitted, nothing ingested, or the epoch's budget unknown.
export const voteRewardsSchema = z.object({
  perSlotLamports: z.number(),
  votingLamports: z.number(),
  // Lost to missed slots (in neither reward certificate): unpaid.
  missedLamports: z.number(),
  // Slots that paid nobody (no reward certificate): not its fault.
  unpayableLamports: z.number(),
  // null until the epoch is ingested with this accounting.
  producerBonusLamports: z.number().nullable().catch(null),
  totalLamports: z.number().nullable().catch(null),
  // Every slot of the epoch paid: the ceiling nobody reaches.
  maxVotingLamports: z.number(),
  // The vote account's epoch_credits gain, as a cross-check.
  onChainLamports: z.number().nullable().catch(null)
});
export type VoteRewards = z.infer<typeof voteRewardsSchema>;

// missedSlots split by cause (null until the epoch is classified), each
// slot one cause in this order: offline (in a run of >= 32 consecutive
// misses - spanning several producers' windows: not voting), thinBlock
// (the slot + 8 block left out >= 2% of the online stake besides this
// voter's own - the producer's fault), late (the rest: the vote reached
// the producer too late, or a short stall).
export const missCausesSchema = z.object({
  throughSlot: z.number().nullable().catch(null),
  offlineSlots: z.number(),
  thinBlockSlots: z.number(),
  lateSlots: z.number(),
  offlineLamports: z.number().nullable().catch(null),
  thinBlockLamports: z.number().nullable().catch(null),
  lateLamports: z.number().nullable().catch(null),
  // Blackhole pairs: producers whose certificates leave out >= 90% of this
  // voter's votes (over >= 8 of their slots, offline runs aside), and the
  // missed slots with them. null: not classified for it; absent on older
  // APIs.
  unreachableProducers: z.number().nullable().optional().catch(undefined),
  unreachableSlots: z.number().nullable().optional().catch(undefined),
  // The offline cutoff it was classified with.
  offlineCutoffSlots: z.number().nullable().optional().catch(undefined)
});
export type MissCauses = z.infer<typeof missCausesSchema>;

const participationCountsShape = {
  admitted: z.boolean(),
  stakeRank: z.number().nullable(),
  stake: z.number(),
  eligibleSlots: z.number(),
  notarizedSlots: z.number(),
  skippedSlots: z.number(),
  skippedNotarizedSlots: z.number(),
  missedSlots: z.number(),
  finalizedCerts: z.number(),
  finalizedSlots: z.number(),
  fastFinalizedSlots: z.number(),
  // Ingest progress. Per-slot streaming API: lastIngestedSlot (last
  // reward slot folded; null before the first write). Older bucketed API:
  // lastBucket / totalBuckets. Either may be absent - use the
  // helpers/participation ingest helpers, never these directly.
  lastIngestedSlot: z.number().nullable().optional().catch(null),
  lastBucket: z.number().nullable().optional().catch(null),
  totalBuckets: z.number().optional().catch(undefined),
  complete: z.boolean(),
  missingFooters: z.number(),
  missCauses: missCausesSchema.nullable().optional().catch(null)
};

export const epochParticipationSchema = z.object({
  epoch: z.number(),
  ...participationCountsShape,
  // Competition rank by participation (0-based), as on the leaderboard;
  // optional until the API serves it.
  rank: z.number().nullable().optional().catch(null),
  rewards: voteRewardsSchema.nullable().optional().catch(null)
});
export const epochParticipationListSchema = z.array(epochParticipationSchema);
export type EpochParticipation = z.infer<typeof epochParticipationSchema>;

// One vote account's outcome on every reward slot of an epoch
// (/epochs/participation/history). outcomesBase64 packs 2 bits per slot,
// little-endian within each byte: 0 ineligible / not ingested yet,
// 1 notarized, 2 skipped (a real vote), 3 missed. Slot i is firstSlot + i.
export const participationHistorySchema = z.object({
  epoch: z.number(),
  consensus: z.string().catch('alpenglow'),
  voteKey: z.string(),
  firstSlot: z.number(),
  slots: z.number(),
  outcomesBase64: z.string().nullable(),
  notarized: z.number(),
  skipped: z.number(),
  missed: z.number(),
  ineligible: z.number()
});
export type ParticipationHistory = z.infer<typeof participationHistorySchema>;

// What the chain did on every slot of an Alpenglow epoch
// (/epochs/cluster/history), aligned slot for slot with the validator
// timeline (same firstSlot, same packing). Codes: 0 unknown / not ingested,
// 1 block (in the chain), 2 skipped (no block), 3 no data (missing from the
// warehouse; not a cluster outcome).
export const clusterHistorySchema = z.object({
  epoch: z.number(),
  firstSlot: z.number(),
  slots: z.number(),
  lastIngestedSlot: z.number().nullable().optional().catch(null),
  outcomesBase64: z.string().nullable(),
  // 1 byte per slot, same indexing: slots from the block to the first
  // finalization certificate covering it (0 = not a block / unknown,
  // 255 = >= 255). Streaming API only.
  finalizationLagBase64: z.string().nullable().optional().catch(null),
  blocks: z.number(),
  skipped: z.number(),
  noData: z.number(),
  unknown: z.number()
});
export type ClusterHistory = z.infer<typeof clusterHistorySchema>;

// The epoch's leader per slot (/epochs/leader-schedule): one u16 (LE) index
// into `leaders` per `slotsPerEntry`-slot window.
export const leaderScheduleSchema = z.object({
  epoch: z.number(),
  firstSlot: z.number(),
  slots: z.number(),
  slotsPerEntry: z.number(),
  leaders: z.array(z.string()),
  leaderIndexesBase64: z.string()
});
export type LeaderSchedule = z.infer<typeof leaderScheduleSchema>;

// What happened on each slot of a range (/slots, <= 1,000 slots), one item
// per slot keyed by the slot it describes (votes come from footer slot + 8
// server-side). Fields fill in over a few seconds after the slot.
export const slotInfoSchema = z.object({
  slot: z.number(),
  outcome: z.enum(['block', 'skipped', 'noData']).nullable().catch(null),
  leader: z.string().nullable().catch(null),
  // A lower bound: what the slot + 8 leader had received. null stake = no
  // aggregate of that kind.
  votes: z
    .object({
      notarStakePpb: z.number().nullable().catch(null),
      skipStakePpb: z.number().nullable().catch(null),
      signers: z.number().nullable().catch(null),
      verification: z.string().nullable().optional().catch(null)
    })
    .nullable()
    .catch(null),
  // The slot's own block footer (what its leader carried); null when no
  // block / not ingested.
  footer: z
    .object({
      producerTimeNanos: z.number().nullable().catch(null),
      userAgent: z.string().nullable().catch(null),
      // "ok" | "empty" | "binary" (a base64 blob that isn't text).
      userAgentKind: z.string().nullable().optional().catch(null),
      // Its producer time was clamped (SIMD-0363) to parent + 1 ns
      // ("floor": the producer's clock is behind) or to the ceiling
      // ("ceiling": ahead, or catching up after a floor); null otherwise.
      clockClamp: z.string().nullable().optional().catch(null),
      updateParent: z.boolean().nullable().catch(null),
      carriedFinalizationPath: z.string().nullable().catch(null),
      carriedFinalizedSlot: z.number().nullable().catch(null),
      carriedFinalizationStakePpb: z.number().nullable().catch(null),
      verification: z.string().nullable().catch(null)
    })
    .nullable()
    .optional()
    .catch(null),
  finalization: z
    .object({
      byFooterSlot: z.number().nullable().catch(null),
      lagSlots: z.number().nullable().catch(null),
      lagMs: z.number().nullable().catch(null),
      directPath: z.string().nullable().catch(null),
      // Stake in the block's own finalization certificate (directPath).
      directStakePpb: z.number().nullable().optional().catch(null),
      // Where directPath came from: a footer that carried the block's own
      // certificate, or live consensus when no footer did (no stake then).
      directSource: z.string().nullable().optional().catch(null)
    })
    .nullable()
    .catch(null)
});
export const slotRangeSchema = z.object({ slots: z.array(slotInfoSchema) });
export type SlotInfo = z.infer<typeof slotInfoSchema>;

// A block producer's record in an Alpenglow epoch so far (/epochs/producers,
// and /slot's producerRecord - "producer" for block-production performance,
// "leader" only for the protocol schedule). Windows are 4-slot leader
// windows wholly ingested so far.
export const producerRecordSchema = z.object({
  nodeAddress: z.string(),
  windows: z.number(),
  producedWindows: z.number(),
  partialWindows: z.number(),
  skippedWindows: z.number(),
  blocks: z.number(),
  skippedSlots: z.number(),
  meanFinalizationLagSlots: z.number().nullable().catch(null),
  remainingWindows: z.number().nullable().catch(null),
  nextWindowSlot: z.number().nullable().catch(null)
});
export type ProducerRecord = z.infer<typeof producerRecordSchema>;

// Our nodes' vote pools for a settled slot (/slot `pool`, recorded by the
// consensus observer). A pool keeps only votes that arrive before the node
// roots the slot (agave drops later ones), so with fast finality it holds
// ~the votes that made the slot final, not every vote cast (finalize votes
// mostly absent); complete during stalls / contested slots. Shows every
// block version voted for, and two comparisons with the slot + 8 footer.
// null = not recorded.
const poolVoteSetSchema = z.object({
  blockId: z.string().nullable().catch(null),
  voters: z.number(),
  stakePpb: z.number(),
  firstMs: z.number().nullable().catch(null),
  lastMs: z.number().nullable().catch(null)
});
const poolGroupSchema = z.object({
  voters: z.number(),
  stakePpb: z.number(),
  validators: z
    .array(
      z.object({
        voteAddress: z.string(),
        nodeAddress: z.string().nullable().catch(null),
        stake: z.number()
      })
    )
    .catch([])
});
export const slotPoolSchema = z.object({
  nodes: z.number().catch(1),
  // Some votes may be missing (a node restarted mid-slot): absence is
  // unknown.
  partial: z.boolean().catch(false),
  notarize: z.array(poolVoteSetSchema).catch([]),
  notarizeFallback: z.array(poolVoteSetSchema).catch([]),
  skip: poolVoteSetSchema.nullable().catch(null),
  skipFallback: poolVoteSetSchema.nullable().catch(null),
  finalize: poolVoteSetSchema.nullable().catch(null),
  // Voted (we have it) but the slot + 8 leader didn't include it: unpaid.
  receivedNotIncluded: poolGroupSchema.nullable().catch(null),
  // Included by the leader but not in our pool: it reached our node after
  // the slot was rooted there (after finality), or never.
  afterOurRoot: poolGroupSchema.nullable().catch(null),
  certificates: z
    .array(
      z.object({
        kind: z.string(),
        blockId: z.string().nullable().catch(null),
        formedMs: z.number().nullable().catch(null)
      })
    )
    .catch([]),
  // Finality as our voting node saw it: ms from the block's producer
  // timestamp to when the node formed each certificate. Depends on where
  // the block was made relative to the node. null when the producer's
  // clock was clamped, or before the node reports it.
  afterBlock: z
    .object({
      notarizedMs: z.number().nullable().catch(null),
      finalizedMs: z.number().nullable().catch(null),
      finalizedBy: z.string().nullable().catch(null)
    })
    .nullable()
    .optional()
    .catch(null),
  // Wall clock (ms) the certificates' formedMs count from.
  originAtMs: z.number().nullable().optional().catch(null)
});
export type SlotPool = z.infer<typeof slotPoolSchema>;

// One slot's whole story (/slot?slot=N), Tower or Alpenglow.
export const slotPageSchema = z.object({
  slot: z.number(),
  epoch: z.number(),
  slotIndex: z.number().nullable().catch(null),
  consensus: z.string().catch('tower'), // per slot: tower through G
  leader: z.string().nullable().catch(null),
  leaderWindow: z
    .object({
      firstSlot: z.number(),
      position: z.number(),
      slots: z.number()
    })
    .nullable()
    .catch(null),
  blockTime: z.number().nullable().catch(null),
  income: z
    .object({
      baseFees: z.number(),
      priorityFees: z.number(),
      mevTips: z.number()
    })
    .nullable()
    .catch(null),
  tower: z
    .object({
      isSkipped: z.boolean().nullable().catch(null),
      noVotes: z.boolean().nullable().catch(null),
      latencyDistribution: z
        .array(
          z.object({ latency: z.number(), stakePct: z.number() }).passthrough()
        )
        .nullable()
        .catch(null)
    })
    .nullable()
    .catch(null),
  alpenglow: slotInfoSchema.nullable().catch(null),
  // Admitted validators in neither reward bitmap of footer slot + 8: not
  // in the certificates that leader included (didn't vote, late, or the
  // vote didn't reach it). null until slot + 8 is ingested / not eligible.
  missingVoters: z
    .array(
      z.object({
        voteAddress: z.string(),
        nodeAddress: z.string().nullable().catch(null),
        stake: z.number(),
        // Offline (the board's rule: a run of >= 32 consecutive missed
        // payable slots). Absent until the epoch is classified.
        offline: z.boolean().optional().catch(undefined)
      })
    )
    .nullable()
    .catch(null),
  missingStakePpb: z.number().nullable().catch(null),
  // The offline part of missingStakePpb (absent on older APIs).
  missingOfflineStakePpb: z.number().nullable().optional().catch(undefined),
  // What THIS block carried (the votes on slot - 8), against the stake
  // online for it: offline = 1e9 - ideal, leftOut = ideal - includedIdeal
  // (online voters this leader didn't include). null for skipped slots,
  // the first 8 Alpenglow slots, and until classified.
  carried: z
    .object({
      rewardSlot: z.number(),
      includedStakePpb: z.number().nullable().catch(null),
      notarStakePpb: z.number().nullable().catch(null),
      skipStakePpb: z.number().nullable().catch(null),
      idealStakePpb: z.number().nullable().catch(null),
      includedIdealStakePpb: z.number().nullable().catch(null),
      offlineStakePpb: z.number().nullable().catch(null),
      leftOutStakePpb: z.number().nullable().catch(null),
      thin: z.boolean().nullable().catch(null),
      perfect: z.boolean().nullable().catch(null),
      leftOut: z
        .array(
          z.object({
            voteAddress: z.string(),
            nodeAddress: z.string().nullable().catch(null),
            stake: z.number()
          })
        )
        .nullable()
        .catch(null)
    })
    .nullable()
    .optional()
    .catch(null),
  pool: slotPoolSchema.nullable().optional().catch(null),
  // The slot leader's /epochs/leaders record (Alpenglow epochs).
  producerRecord: producerRecordSchema.nullable().optional().catch(null),
  // Transitional: the field's name before the producer rename (staging
  // APIs not yet redeployed). Read via producerRecordOf().
  leaderRecord: producerRecordSchema.nullable().optional().catch(null),
  note: z.string().nullable().catch(null)
});
export type SlotPage = z.infer<typeof slotPageSchema>;
/** The slot leader's producer record, under either field name. */
export const producerRecordOf = (p: SlotPage) =>
  p.producerRecord ?? p.leaderRecord ?? null;

// One block's footer, decoded, with the proof (/slots/footer?slot=S). The
// footer in block S carries the reward certificates for S - 8 and the
// highest finalization certificate its leader knew. Immutable.
export const slotFooterSchema = z.object({
  slot: z.number(),
  parentSlot: z.number().nullable().catch(null),
  updateParent: z.boolean().nullable().catch(null),
  rewardSlot: z.number().nullable().catch(null),
  verification: z.string().nullable().catch(null),
  certificates: z
    .array(
      z.object({
        kind: z.string(),
        slot: z.number(),
        stakePpb: z.number().nullable().catch(null),
        signers: z.array(z.number()).nullable().catch(null)
      })
    )
    .catch([])
});
export type SlotFooter = z.infer<typeof slotFooterSchema>;

// Stored footer facts for a slot range (/slots/footers), ~300 B per slot.
// The footer of slot S pays for rewardSlot = S - 8; stake shares in ppb.
export const footerFactsSchema = z.object({
  slot: z.number(),
  leader: z.string().nullable().catch(null),
  rewardSlot: z.number(),
  notarStakePpb: z.number().nullable().catch(null),
  skipStakePpb: z.number().nullable().catch(null),
  signers: z.number().nullable().catch(null),
  finalizationPath: z.string().nullable().catch(null)
});
export const footerRangeSchema = z.object({
  footers: z.array(footerFactsSchema)
});
export type FooterFacts = z.infer<typeof footerFactsSchema>;

// The epoch's rank map (/alpenglow/rank-map): who is admitted, and why the
// others aren't. Only the not-admitted list is used here.
export const rankMapSchema = z.object({
  epoch: z.number(),
  notAdmitted: z
    .array(
      z.object({
        voteAddress: z.string(),
        nodeAddress: z.string().nullable().catch(null),
        reason: z.string()
      })
    )
    .catch([])
});
export type RankMap = z.infer<typeof rankMapSchema>;

export const participationLeaderboardRecordSchema = z.object({
  ...participationCountsShape,
  nodeName: validatorNameSchema,
  nodeAddress: z.string(),
  voteAddress: z.string(),
  // Competition rank by participation (0-based, ties shared); null when
  // not admitted. Authoritative - don't re-derive from position.
  rank: z.number().nullable(),
  datacenter: z.string().nullish().catch(null),
  continent: z.string().nullable().catch(null),
  country: z.string().nullable().catch(null),
  provider: z.string().nullable().catch(null),
  softwareBase: z.string().nullable().catch(null),
  softwareFlavor: z.string().nullable().catch(null),
  softwareVersion: z.string().nullable().catch(null),
  rewards: voteRewardsSchema.nullable().optional().catch(null)
});
export type ParticipationLeaderboardRecord = z.infer<
  typeof participationLeaderboardRecordSchema
>;

export const participationLeaderboardSchema = z.object({
  epoch: z.number(),
  consensus: z.string().catch('alpenglow'),
  eligibleSlots: z.number(),
  finalizedCerts: z.number(),
  // Ingest progress. Per-slot streaming API: lastIngestedSlot (last
  // reward slot folded; null before the first write). Older bucketed API:
  // lastBucket / totalBuckets. Either may be absent - use the
  // helpers/participation ingest helpers, never these directly.
  lastIngestedSlot: z.number().nullable().optional().catch(null),
  lastBucket: z.number().nullable().optional().catch(null),
  totalBuckets: z.number().optional().catch(undefined),
  complete: z.boolean(),
  missingFooters: z.number(),
  admitted: z.number(),
  // Sums over admitted records' rewards; null: budget unknown / nothing
  // ingested.
  rewardTotals: z
    .object({
      budgetLamports: z.number(),
      votingLamports: z.number(),
      missedLamports: z.number(),
      unpayableLamports: z.number(),
      producerBonusLamports: z.number().nullable().catch(null),
      maxVotingLamports: z.number()
    })
    .nullable()
    .optional()
    .catch(null),
  records: z.array(participationLeaderboardRecordSchema)
});
export type ParticipationLeaderboard = z.infer<
  typeof participationLeaderboardSchema
>;

// ---- Per-slot insights (vote latency distribution + leader info) ----

export const blockInsightLatencyEntrySchema = z.object({
  // 0..=31; 0 = validator never voted on this slot, 31 = saturation bucket
  // (raw latency >= 31). See API spec for the full bucket meaning.
  latency: z.number(),
  // 0..100 with up to ~7 decimals of precision. Sum across distribution[]
  // is 100 within float tolerance for non-skipped slots.
  stakePct: z.number(),
  validatorCount: z.number()
});
export type BlockInsightLatencyEntry = z.infer<
  typeof blockInsightLatencyEntrySchema
>;

// State encoding via nullable fields:
//   isSkipped=false, noVotes=false, distribution!=null → "ready"
//   isSkipped=false, noVotes=true,  distribution!=null → "vote-excluded"
//   isSkipped=false, distribution===null               → "pending"
//   isSkipped=true                                     → "skipped"
//   isSkipped===null                                   → "unknown"
//
// `noVotes` is true when the leader produced a confirmed block but the
// block excluded every vote transaction (a "vote-exclusive" block).
// Validators still voted on this slot — their votes just landed in a
// later vote-inclusive slot — so the distribution is meaningful but
// median latency tends to look higher than neighbours. `skipped` and
// `noVotes` are mutually exclusive.
export const blockInsightSchema = z.object({
  slot: z.number(),
  isSkipped: z.boolean().nullable(),
  noVotes: z.boolean().nullable(),
  leaderNodeAddress: z.string().nullable(),
  distribution: z.array(blockInsightLatencyEntrySchema).nullable()
});
export type BlockInsight = z.infer<typeof blockInsightSchema>;

export const blocksInsightsResponseSchema = z.object({
  results: z.array(blockInsightSchema)
});

export type BlockInsightStatus =
  | 'unknown'
  | 'skipped'
  | 'pending'
  | 'ready'
  | 'vote-excluded';

export const classifyBlockInsight = (
  insight: BlockInsight
): BlockInsightStatus => {
  if (insight.isSkipped === null) return 'unknown';
  if (insight.isSkipped === true) return 'skipped';
  if (insight.distribution === null) return 'pending';
  if (insight.noVotes === true) return 'vote-excluded';
  return 'ready';
};

// ---- Block producers (/epochs/leaderboard/producers, Alpenglow) ----------
//
// Every node the leader schedule names, with its window record, what its
// blocks did for consensus (vote inclusion, finalization) and rewards
// (producer bonus), and cohort fields. `cluster` is a record-shaped sum.
// 404 for Tower epochs (no stored leader schedule).
export const producerLeaderboardRecordSchema = z.object({
  nodeName: validatorNameSchema,
  nodeAddress: z.string(),
  voteAddress: z.string().nullable().catch(null),
  stake: z.number().catch(0),
  rank: z.number().nullable().catch(null),
  windows: z.number(),
  producedWindows: z.number(),
  partialWindows: z.number(),
  skippedWindows: z.number(),
  blocks: z.number(),
  skippedSlots: z.number(),
  meanFinalizationLagSlots: z.number().nullable().catch(null),
  remainingWindows: z.number().nullable().catch(null),
  // The windows the epoch's leader schedule assigns it (decided or not),
  // and the stake-weighted expectation at its stake share. Absent on
  // older APIs.
  // Its thin blocks - each carried < 98% (1 - thinShare) of the online
  // stake for slot - 8 - of its slots classified so far, and the online
  // stake its slots lost (ppb sums), by cause; the three add up exactly to
  // availableStakePpbSum - includedAvailableStakePpbSum. null until the
  // epoch is classified.
  thinSlots: z.number().nullable().optional().catch(undefined),
  // Its Perfect (>= 99.9% carried) and OK (98-99.9%) blocks; with
  // thinSlots (Poor) and its skipped slots they make up classifiedSlots.
  perfectSlots: z.number().nullable().optional().catch(undefined),
  okSlots: z.number().nullable().optional().catch(undefined),
  // Skipped slots among the classified: perfect + ok + thin + this =
  // classifiedSlots exactly (skippedSlots is a slightly different scope).
  skippedClassifiedSlots: z.number().nullable().optional().catch(undefined),
  classifiedSlots: z.number().nullable().optional().catch(undefined),
  skippedLostPpbSum: z.number().nullable().optional().catch(undefined),
  thinLostPpbSum: z.number().nullable().optional().catch(undefined),
  minorLostPpbSum: z.number().nullable().optional().catch(undefined),
  // Lost in blocks that carried >= 99.9%: forgiven by the score (skipped +
  // thin + minor = available x (1 - scoredInclusion); all four = available
  // - included).
  perfectLostPpbSum: z.number().nullable().optional().catch(undefined),
  scheduledWindows: z.number().nullable().optional().catch(undefined),
  expectedWindows: z.number().nullable().optional().catch(undefined),
  // Blackhole pairs: voters its certificates leave out of >= 90% of its
  // slots (>= 8 of them, offline runs aside), and their summed stake (ppb).
  // null: not classified; absent on older APIs.
  blackholeVoterCount: z.number().nullable().optional().catch(undefined),
  blackholeStakePpb: z.number().nullable().optional().catch(undefined),
  nextWindowSlot: z.number().nullable().catch(null),
  skipRate: z.number().nullable().catch(null),
  rewardCerts: z.number().catch(0),
  // Mean stake its reward certificates included (ppb): vote collection.
  meanIncludedStakePpb: z.number().nullable().catch(null),
  // Its half of every vote it packed; pre-commission. null: not tracked.
  producerBonusLamports: z.number().nullable().catch(null),
  // Its blocks' producer times: how many were clamped to parent + 1 ns
  // (clock behind) or to the ceiling independently (clock ahead), of the
  // blocks counted. Absent on older APIs; 0 before they were counted.
  clockBlocks: z.number().nullable().optional().catch(undefined),
  clockFloorBlocks: z.number().nullable().optional().catch(undefined),
  clockCeilingBlocks: z.number().nullable().optional().catch(undefined),
  userAgentKind: z.string().nullable().optional().catch(undefined),
  // Its leader slots whose votes could be carried (block or skipped).
  payableSlots: z.number().optional().catch(undefined),
  // Included stake share summed over those slots / payableSlots - its
  // skipped slots count 0. null: no payable slots (or an epoch ingested
  // before it was counted); absent on older APIs.
  effectiveInclusion: z.number().nullable().optional().catch(undefined),
  // The same with offline voters (in a >= 32-slot run of misses) left out
  // of what each slot could carry: included stake / available stake,
  // summed over its payable slots (ppb sums; skipped slots carry 0). The
  // dashboard's production metric. Absent on older APIs.
  availableInclusion: z.number().nullable().optional().catch(undefined),
  // The Production score: availableInclusion with every block that carried
  // >= 99.9% (1 - perfectShare) of the online stake counted as full.
  scoredInclusion: z.number().nullable().optional().catch(undefined),
  availableStakePpbSum: z.number().nullable().optional().catch(undefined),
  includedAvailableStakePpbSum: z
    .number()
    .nullable()
    .optional()
    .catch(undefined),
  datacenter: z.string().nullish().catch(null),
  continent: z.string().nullable().catch(null),
  country: z.string().nullable().catch(null),
  provider: z.string().nullable().catch(null),
  softwareBase: z.string().nullable().catch(null),
  softwareFlavor: z.string().nullable().catch(null),
  softwareVersion: z.string().nullable().catch(null)
});
export type ProducerLeaderboardRecord = z.infer<
  typeof producerLeaderboardRecordSchema
>;
// The thresholds an epoch was classified with (version, offline cutoff,
// thin share, blackhole rule); null until classified.
const classificationSchema = z
  .object({
    version: z.number().nullable().catch(null),
    throughSlot: z.number().nullable().catch(null),
    offlineSlots: z.number().nullable().catch(null),
    thinShare: z.number().nullable().catch(null),
    perfectShare: z.number().nullable().optional().catch(undefined),
    blackholeShare: z.number().nullable().catch(null),
    blackholeMinSlots: z.number().nullable().catch(null)
  })
  .nullable()
  .optional()
  .catch(undefined);
export type Classification = z.infer<typeof classificationSchema>;

export const producerLeaderboardSchema = z.object({
  epoch: z.number(),
  lastIngestedSlot: z.number().nullable().catch(null),
  sortBy: z.string().catch('skipRate'),
  order: z.string().catch('asc'),
  // The floor the API ranked with (minLeaderSlots request param) and how
  // many producers it ranked; absent on APIs without the param.
  minLeaderSlots: z.number().nullable().optional().catch(undefined),
  rankedOf: z.number().nullable().optional().catch(undefined),
  classification: classificationSchema,
  // The blackhole-pair rule's thresholds (share left out, min slots).
  blackholeShare: z.number().nullable().optional().catch(undefined),
  blackholeMinSlots: z.number().nullable().optional().catch(undefined),
  cluster: producerLeaderboardRecordSchema.nullable().catch(null),
  records: z.array(producerLeaderboardRecordSchema)
});
export type ProducerLeaderboard = z.infer<typeof producerLeaderboardSchema>;

// One validator's producer record per Alpenglow epoch (/epochs/production,
// newest first): its row of the producer board (rank = the board's rank by
// effective inclusion, 0-based, every producer ranked), epochs it led
// nothing omitted.
export const productionEpochSchema = producerLeaderboardRecordSchema.extend({
  epoch: z.number(),
  lastIngestedSlot: z.number().nullable().catch(null),
  complete: z.boolean().catch(false),
  rankedOf: z.number().nullable().catch(null),
  classification: classificationSchema,
  // The voters its certificates (almost) never include, most stake first.
  blackholeVoters: z
    .array(
      z.object({
        voteAddress: z.string(),
        nodeAddress: z.string().nullable().catch(null),
        nodeName: z.string().nullable().catch(null),
        stake: z.number().catch(0),
        missedSlots: z.number(),
        slots: z.number()
      })
    )
    .nullable()
    .optional()
    .catch(undefined),
  blackholeShare: z.number().nullable().optional().catch(undefined),
  blackholeMinSlots: z.number().nullable().optional().catch(undefined)
});
export type BlackholeVoter = NonNullable<
  z.infer<typeof productionEpochSchema>['blackholeVoters']
>[number];
export const productionHistorySchema = z.array(productionEpochSchema);

// One voter's missed slots in an epoch by the producer whose window they
// fell in (/epochs/participation/misses; offline runs excluded, most misses
// first). 404 until the epoch is classified.
export const participationMissesSchema = z.object({
  epoch: z.number(),
  voteAddress: z.string().nullable().catch(null),
  throughSlot: z.number().nullable().catch(null),
  offlineSlots: z.number(),
  thinBlockSlots: z.number(),
  lateSlots: z.number(),
  thresholds: z
    .object({
      offlineSlots: z.number().nullable().catch(null),
      thinShare: z.number().nullable().catch(null),
      admittedVoters: z.number().nullable().catch(null),
      blackholeShare: z.number().nullable().optional().catch(undefined),
      blackholeMinSlots: z.number().nullable().optional().catch(undefined)
    })
    .nullable()
    .catch(null),
  producers: z.array(
    z.object({
      nodeAddress: z.string(),
      nodeName: z.string().nullable().catch(null),
      // This voter's misses in its thin blocks (the producer's fault) and
      // the rest (late).
      thinBlockSlots: z.number().catch(0),
      lateSlots: z.number().catch(0),
      // Its certificate slots while this voter was up; whether the pair is
      // a blackhole (the API's rule).
      slots: z.number().nullable().optional().catch(undefined),
      unreachable: z.boolean().nullable().optional().catch(undefined),
      // Its slots classified so far, and its thin blocks' slots
      // (ascending).
      classifiedSlots: z.number().nullable().optional().catch(undefined),
      thinSlots: z.array(z.number()).optional().catch(undefined),
      // This voter's missed slots the API counted as this producer's
      // fault (exactly thinBlockSlots of them, ascending); absent on
      // epochs classified before the field existed.
      thinMissSlots: z.array(z.number()).optional().catch(undefined)
    })
  )
});

export type ParticipationMisses = z.infer<typeof participationMissesSchema>;
export type ProductionEpoch = z.infer<typeof productionEpochSchema>;

// One validator's leader windows in an epoch, slot by slot
// (/epochs/production/windows). includedStakePpb: the votes on slot - 8
// its block's reward certificates carried (0: none; null: no block, or the
// cutover's first 8 slots).
export const productionWindowsSchema = z.object({
  epoch: z.number(),
  nodeAddress: z.string().nullable().catch(null),
  voteAddress: z.string().nullable().catch(null),
  lastIngestedSlot: z.number().nullable().catch(null),
  // Paging (limit / beforeSlot / issues): the epoch's counts on every
  // response; nextBeforeSlot is the next page's beforeSlot (null at the
  // end). All absent on APIs without paging (the whole epoch, ascending).
  playedWindows: z.number().nullable().optional().catch(undefined),
  issueWindows: z.number().nullable().optional().catch(undefined),
  // Per kind (issues=skipped / issues=poor); absent until the API filters
  // by kind.
  skippedWindows: z.number().nullable().optional().catch(undefined),
  poorWindows: z.number().nullable().optional().catch(undefined),
  upcomingWindows: z.number().nullable().optional().catch(undefined),
  nextWindowSlot: z.number().nullable().optional().catch(undefined),
  nextBeforeSlot: z.number().nullable().optional().catch(undefined),
  windows: z.array(
    z.object({
      firstSlot: z.number(),
      slots: z.array(
        z.object({
          slot: z.number(),
          outcome: z.string(),
          includedStakePpb: z.number().nullable().catch(null),
          notarStakePpb: z.number().nullable().catch(null),
          skipStakePpb: z.number().nullable().catch(null),
          // Stake online for slot - 8 (offline voters left out) and the
          // part of it this block carried; absent on older APIs.
          idealStakePpb: z.number().nullable().optional().catch(undefined),
          // Carried < 98% (1 - thinShare) of it; null for a skipped slot
          // or before classification.
          thin: z.boolean().nullable().optional().catch(undefined),
          // Carried >= 99.9% (1 - perfectShare): counts as full.
          perfect: z.boolean().nullable().optional().catch(undefined),
          includedIdealStakePpb: z
            .number()
            .nullable()
            .optional()
            .catch(undefined)
        })
      )
    })
  )
});
export type ProductionWindows = z.infer<typeof productionWindowsSchema>;

// ---- Live consensus (/consensus/live) -----------------------------------
//
// One staked node's vote pool, polled every ~1.5 s server-side: the slots
// still in flight (not yet rooted - normally 3-8, a slot leaves ~1 s after
// finalizing; up to 128 during a slowdown), newest first. available:false
// until the API's node runs the vote-pool RPC. *Ms are offsets from the
// first vote / certificate the node saw for the slot. Never cache.
const liveVoteSetSchema = z.object({
  blockId: z.string().nullable().catch(null),
  stakePpb: z.number(),
  voters: z.number(),
  firstMs: z.number().nullable().catch(null),
  lastMs: z.number().nullable().catch(null)
});
export const liveSlotSchema = z.object({
  slot: z.number(),
  epoch: z.number().nullable().catch(null),
  leader: z.string().nullable().catch(null),
  status: z.string(), // voting | notarized | finalized | skipped
  split: z.boolean().catch(false),
  notarize: z.array(liveVoteSetSchema).catch([]),
  notarizeFallback: z.array(liveVoteSetSchema).catch([]),
  skip: liveVoteSetSchema.nullable().catch(null),
  skipFallback: liveVoteSetSchema.nullable().catch(null),
  finalize: liveVoteSetSchema.nullable().catch(null),
  certificates: z
    .array(
      z.object({
        kind: z.string(),
        blockId: z.string().nullable().catch(null),
        stakePpb: z.number().nullable().catch(null),
        formedMs: z.number().nullable().catch(null),
        source: z.string().nullable().catch(null)
      })
    )
    .catch([]),
  notVoted: z
    .object({
      voters: z.number(),
      stakePpb: z.number(),
      validators: z
        .array(
          z.object({
            voteAddress: z.string(),
            nodeAddress: z.string().nullable().catch(null),
            stake: z.number()
          })
        )
        .catch([])
    })
    .nullable()
    .catch(null)
});
export type LiveSlot = z.infer<typeof liveSlotSchema>;
export const liveConsensusSchema = z.object({
  available: z.boolean(),
  stale: z.boolean().catch(false),
  // None of our nodes answers: no slots; finality from the public RPC.
  blind: z.boolean().catch(false),
  nodes: z
    .array(
      z.object({
        label: z.string(),
        ok: z.boolean(),
        identity: z.string().nullable().catch(null),
        // null until the node runs the v2 pool RPC
        voting: z.boolean().nullable().catch(null)
      })
    )
    .catch([]),
  publicFinality: z
    .object({
      finalizedSlot: z.number().nullable().catch(null),
      processedSlot: z.number().nullable().catch(null),
      finalizedStillSecs: z.number().nullable().catch(null)
    })
    .nullable()
    .catch(null),
  snapshotAgeMs: z.number().nullable().catch(null),
  rootSlot: z.number().nullable().catch(null),
  highestFinalizedSlot: z.number().nullable().catch(null),
  highestNotarizedSlot: z.number().nullable().catch(null),
  highestSkipCertifiedSlot: z.number().nullable().catch(null),
  standstill: z.boolean().catch(false),
  finalityGapSlots: z.number().nullable().catch(null),
  slots: z.array(liveSlotSchema).catch([])
});
export type LiveConsensus = z.infer<typeof liveConsensusSchema>;

// ---- Validator locations (/validators/geo) ------------------------------
//
// Every staked validator with its geolocation (gossip address via DB-IP
// lite), in one call; geo / coordinates null when unresolved.
export const validatorGeoSchema = z.object({
  epoch: z.number().nullable().catch(null),
  // Which geography this is: the epoch's (recorded addresses, resolved
  // with that month's DB-IP edition) or today's. Absent on older APIs
  // (= current).
  geography: z
    .object({
      source: z.string().nullable().catch(null),
      edition: z.string().nullable().optional().catch(null)
    })
    .nullable()
    .optional()
    .catch(null),
  validators: z.array(
    z.object({
      nodeAddress: z.string(),
      voteAddress: z.string().nullable().catch(null),
      name: z.string().nullable().catch(null),
      activatedStake: z.number().catch(0),
      geo: z
        .object({
          asn: z.number().nullable().optional().catch(null),
          asnOrganization: z.string().nullable().optional().catch(null),
          countryCode: z.string().nullable().catch(null),
          country: z.string().nullable().optional().catch(null),
          continent: z.string().nullable().optional().catch(null),
          city: z.string().nullable().catch(null),
          latitude: z.number().nullable().catch(null),
          longitude: z.number().nullable().catch(null)
        })
        .nullable()
        .catch(null)
    })
  )
});
export type ValidatorGeo = z.infer<
  typeof validatorGeoSchema
>['validators'][number];

// One validator's last slots, live (/consensus/validator/live): in-flight
// state from Vortex's nodes' vote pools (provisional - our nodes' view),
// then the record from the slot + 8 footer. States only, never timing;
// never rank from `vote`. 404 when not in the epoch's rank map.
export const validatorLiveSchema = z.object({
  available: z.boolean().catch(true),
  stale: z.boolean().catch(false),
  blind: z.boolean().catch(false),
  epoch: z.number().nullable().catch(null),
  voteAddress: z.string().nullable().catch(null),
  nodeAddress: z.string().nullable().catch(null),
  throughSlot: z.number().nullable().catch(null),
  // Rows up to here are the record; later ones can still change.
  finalThroughSlot: z.number().nullable().catch(null),
  slots: z
    .array(
      z.object({
        slot: z.number(),
        leader: z.string().nullable().catch(null),
        outcome: z.string().nullable().catch(null),
        state: z.string().catch('pending'),
        vote: z.string().nullable().catch(null),
        fallback: z.string().nullable().catch(null),
        final: z.string().nullable().catch(null)
      })
    )
    .catch([])
});
export type ValidatorLive = z.infer<typeof validatorLiveSchema>;
export type ValidatorLiveSlot = ValidatorLive['slots'][number];

// ---- Cluster decentralization (/cluster/distribution, /cluster/geo-history)
//
// distribution: the current activated stake by client and location (60 s
// snapshot). geo-history: per epoch, by country / continent / provider
// (ASN) / provider + city, with concentration measures. Shares are 0..1.
// Provider + city (the API's dataCenters, DB-IP's ASN-country-city) is a
// provider's presence in a city, not a building: one building can hold
// several providers, one provider several buildings. Optional.

const stakeGroupSchema = z.object({
  validators: z.number(),
  stake: z.number(),
  stakeShare: z.number()
});
export const clusterDistributionSchema = z.object({
  epoch: z.number(),
  asOf: z.number().nullable().catch(null),
  totalActivatedStake: z.number(),
  clients: z.array(
    stakeGroupSchema.extend({ family: z.string().nullable().catch(null) })
  ),
  clientIds: z.array(
    stakeGroupSchema.extend({
      clientId: z.string().nullable().catch(null),
      family: z.string().nullable().catch(null)
    })
  ),
  dataCenters: z
    .array(stakeGroupSchema.extend({ dataCenterKey: z.string() }))
    .optional()
    .catch(undefined),
  asns: z.array(
    stakeGroupSchema.extend({
      asn: z.number(),
      organization: z.string().nullable().catch(null)
    })
  ),
  unlocated: stakeGroupSchema.nullable().catch(null)
});
export type ClusterDistribution = z.infer<typeof clusterDistributionSchema>;

const shareGroupSchema = z.object({
  validators: z.number(),
  stake: z.number(),
  share: z.number()
});
const geoBreakdownSchema = z.object({
  // Distinct groups holding stake.
  entities: z.number(),
  // Over the resolved stake: the largest group's share, the fewest groups
  // together over 1/3 (could halt consensus), Herfindahl-Hirschman 0..1.
  top1Share: z.number().nullable().catch(null),
  superminority: z.number().nullable().catch(null),
  hhi: z.number().nullable().catch(null),
  // Shares of the epoch's whole stake.
  top: z.array(
    shareGroupSchema.extend({
      key: z.string(),
      name: z.string().nullable().catch(null)
    })
  ),
  other: shareGroupSchema.nullable().catch(null),
  unresolved: shareGroupSchema.nullable().catch(null)
});
export type GeoBreakdown = z.infer<typeof geoBreakdownSchema>;
export const clusterGeoHistorySchema = z.object({
  // Oldest first.
  epochs: z.array(
    z.object({
      epoch: z.number(),
      edition: z.string().nullable().catch(null),
      // Resolved with a DB-IP edition other than the epoch's own month's.
      approximate: z.boolean().optional().catch(undefined),
      stake: z.number(),
      validators: z.number(),
      // No address recorded (ValidatorHistory missed it): ~40% of the
      // stake at 554, 0 from ~1050. The location breakdowns' top1Share /
      // superminority / hhi are over located stake only; identities uses
      // all of it.
      unlocated: shareGroupSchema.nullable().catch(null),
      countries: geoBreakdownSchema.nullable().catch(null),
      continents: geoBreakdownSchema.nullable().catch(null),
      dataCenters: geoBreakdownSchema.nullable().optional().catch(null),
      // By client family (Agave's flavors as agave) over all the stake;
      // unresolved = no client recorded (most of it in old epochs).
      clients: geoBreakdownSchema.nullable().optional().catch(null),
      // By client id (JitoLabs, AgaveBam, ...; name = its family) over all
      // the stake.
      clientIds: geoBreakdownSchema.nullable().optional().catch(null),
      // By block-building flavor (bam, harmonic, jito, rakurai, raiku,
      // paladin, plain, Unknown(n)) over all the stake.
      flavors: geoBreakdownSchema.nullable().optional().catch(null),
      asns: geoBreakdownSchema.nullable().catch(null),
      // Keyed by node identity over every staked validator:
      // superminority = the Nakamoto coefficient. Names are null.
      identities: geoBreakdownSchema.nullable().optional().catch(null)
    })
  )
});
export type ClusterGeoHistory = z.infer<typeof clusterGeoHistorySchema>;

// One validator's biggest blocks in an epoch (/blocks/income?sort=income),
// each against its baseline (the median of other leaders' blocks within
// +/-100 slots).
export const blockIncomeRowsSchema = z.array(
  z.object({
    slot: z.number(),
    income: incomeDetailsSchema.nullable().catch(null),
    baselineIncome: z
      .object({ total: z.number(), fees: z.number(), tips: z.number() })
      .nullable()
      .optional()
      .catch(null)
  })
);
export type BlockIncomeRows = z.infer<typeof blockIncomeRowsSchema>;

// One validator's delegators at an epoch's end (/validators/delegators,
// requested of vortex-data): by withdraw authority, as in stake-changes.
const delegatorLabelSchema = z
  .object({
    name: z.string(),
    kind: z.string().nullable().catch(null),
    // Sanctum's token name ("Helius Staked SOL"); null where it's the name.
    fullName: z.string().nullish().catch(null)
  })
  .nullable()
  .catch(null);
export const validatorDelegatorsSchema = z.object({
  epoch: z.number(),
  voteKey: z.string().nullable().catch(null),
  stake: z.number(),
  delegators: z.number(),
  stakeAccounts: z.number().nullable().catch(null),
  // Largest first.
  top: z.array(
    z.object({
      withdrawer: z.string(),
      staker: z.string().nullable().catch(null),
      label: delegatorLabelSchema,
      stake: z.number(),
      share: z.number().nullable().catch(null),
      stakeAccounts: z.number().nullable().catch(null)
    })
  ),
  moreDelegators: z.number().nullable().catch(null),
  // By delegator stake, smallest bucket first (maxSol null: open-ended).
  sizes: z
    .array(
      z.object({
        minSol: z.number(),
        maxSol: z.number().nullable(),
        delegators: z.number(),
        stake: z.number()
      })
    )
    .catch([]),
  byKind: z
    .array(
      z.object({ kind: z.string(), delegators: z.number(), stake: z.number() })
    )
    .catch([])
});
export type ValidatorDelegators = z.infer<typeof validatorDelegatorsSchema>;

// Every named node identity, validating today or not (/validators/names):
// for naming past epochs' validators. Curated names win.
export const validatorNamesSchema = z.object({
  asOf: z.number().nullable().catch(null),
  names: z.record(z.string(), z.string())
});
export type ValidatorNames = z.infer<typeof validatorNamesSchema>;

// Where one validator ran (/validators/host-changes): epoch-level moves
// (one address per epoch) and minute-level events. Hosts are numbered,
// never addresses. kind is judged with hindsight, so it can change.
const hostStateSchema = z.object({
  host: z.number().nullable().catch(null),
  dataCenterKey: z.string().nullable().optional().catch(null),
  geo: z
    .object({
      asnOrganization: z.string().nullable().catch(null),
      countryCode: z.string().nullable().catch(null),
      country: z.string().nullable().optional().catch(null),
      city: z.string().nullable().catch(null)
    })
    .nullable()
    .catch(null),
  version: z.string().nullable().optional().catch(null),
  clientId: z.string().nullable().optional().catch(null)
});
export type HostState = z.infer<typeof hostStateSchema>;
export const hostChangesSchema = z.object({
  // Oldest first.
  migrations: z
    .array(
      z.object({
        epoch: z.number(),
        previousEpoch: z.number().nullable().catch(null),
        kind: z.string(),
        before: hostStateSchema,
        after: hostStateSchema
      })
    )
    .catch([]),
  events: z
    .array(
      z.object({
        epoch: z.number(),
        slot: z.number().nullable().catch(null),
        observedAt: z.number().nullable().catch(null),
        lastSeenAt: z.number().nullable().catch(null),
        kind: z.string(),
        ipChanged: z.boolean().nullable().catch(null),
        versionChanged: z.boolean().nullable().catch(null),
        clientChanged: z.boolean().nullable().catch(null),
        before: hostStateSchema,
        after: hostStateSchema
      })
    )
    .catch([])
});
export type HostChanges = z.infer<typeof hostChangesSchema>;

// Client versions per epoch, and who changed (/cluster/versions). Past
// epochs from ValidatorHistory; the epoch in progress from gossip plus
// software events (observedAt set). Shares are of the epoch's stake.
const clientVersionSchema = z.object({
  client: z.string().nullable().catch(null),
  version: z.string().nullable().catch(null)
});
export const clusterVersionsSchema = z.object({
  // Oldest first.
  epochs: z.array(
    z.object({
      epoch: z.number(),
      inProgress: z.boolean().catch(false),
      source: z.string().nullable().catch(null),
      stake: z.number(),
      validators: z.number(),
      versions: z
        .array(
          z.object({
            family: z.string().nullable().catch(null),
            client: z.string().nullable().catch(null),
            version: z.string().nullable().catch(null),
            validators: z.number(),
            stake: z.number(),
            share: z.number()
          })
        )
        .catch([]),
      unresolved: z
        .object({
          validators: z.number(),
          stake: z.number(),
          share: z.number()
        })
        .nullable()
        .catch(null),
      // 'upgrade' | 'downgrade' | 'switch' (client change), grouped.
      transitions: z
        .array(
          z.object({
            kind: z.string(),
            from: clientVersionSchema,
            to: clientVersionSchema,
            validators: z.number(),
            stake: z.number(),
            share: z.number()
          })
        )
        .catch([]),
      // The largest changes by stake.
      changes: z
        .array(
          z.object({
            identity: z.string(),
            name: z.string().nullable().catch(null),
            kind: z.string(),
            from: clientVersionSchema,
            to: clientVersionSchema,
            stake: z.number(),
            observedAt: z.number().nullable().catch(null)
          })
        )
        .catch([]),
      changesTotal: z.number().nullable().catch(null)
    })
  )
});
export type ClusterVersions = z.infer<typeof clusterVersionsSchema>;

// ---- Versions over time (/cluster/versions/timeline) --------------------
// Stake by (client family, version) every bucketMins over the last epochs,
// flavors merged, oldest first, plus a last point at now. Rebuilt from
// gossip and the recorded software changes (from epoch 1066).
export const versionsTimelineSchema = z.object({
  points: z.array(
    z.object({
      t: z.number(),
      epoch: z.number(),
      stake: z.number(),
      validators: z.number(),
      versions: z
        .array(
          z.object({
            family: z.string().nullable().catch(null),
            version: z.string().nullable().catch(null),
            validators: z.number(),
            stake: z.number(),
            share: z.number()
          })
        )
        .catch([])
    })
  )
});
export type VersionsTimeline = z.infer<typeof versionsTimelineSchema>;

// ---- Governance (svmgov proposals) ---------------------------------------
// /governance/proposals, /governance/proposal, /validators/governance.
// Shapes follow the API's plan (2026-10-26) before it shipped; everything
// is lenient so a renamed or missing field degrades to "—", not an error.
const lamports = z.number().nullable().catch(null);
const share = z.number().nullable().catch(null);

export const governanceProposalSchema = z.object({
  address: z.string(),
  index: z.number().nullable().catch(null),
  title: z.string().nullable().catch(null),
  docUrl: z.string().nullable().optional().catch(null),
  voteUrl: z.string().nullable().optional().catch(null),
  author: z
    .object({
      identity: z.string().nullable().catch(null),
      name: validatorNameSchema.catch(null)
    })
    .nullable()
    .optional()
    .catch(null),
  // 'support' | 'voting' | 'finalized'
  phase: z.string().nullable().catch(null),
  creationEpoch: z.number().nullable().optional().catch(null),
  startEpoch: z.number().nullable().optional().catch(null),
  endEpoch: z.number().nullable().optional().catch(null),
  snapshotSlot: z.number().nullable().optional().catch(null),
  snapshotEpoch: z.number().nullable().optional().catch(null),
  support: z
    .object({ lamports, share, needed: share })
    .nullable()
    .optional()
    .catch(null),
  tallies: z
    .object({ for: lamports, against: lamports, abstain: lamports })
    .nullable()
    .optional()
    .catch(null),
  voters: z.number().nullable().optional().catch(null),
  overrides: z.number().nullable().optional().catch(null),
  // Votes cast / the snapshot epoch's total stake.
  turnout: share.optional(),
  // For / (for + against + abstain), and for / (for + against).
  forShare: share.optional(),
  forShareExAbstain: share.optional(),
  verdict: z
    .object({
      // 'accepted' | 'rejected' | 'inconclusive'
      result: z.string().nullable().catch(null),
      rule: z
        .object({
          quorum: share.optional(),
          threshold: share.optional(),
          abstainCounted: z.boolean().nullable().optional().catch(null),
          source: z.string().nullable().optional().catch(null),
          text: z.string().nullable().optional().catch(null)
        })
        .nullable()
        .optional()
        .catch(null)
    })
    .nullable()
    .optional()
    .catch(null)
});
export type GovernanceProposal = z.infer<typeof governanceProposalSchema>;

export const governanceProposalsSchema = z.object({
  proposals: z.array(governanceProposalSchema).catch([])
});
export type GovernanceProposals = z.infer<typeof governanceProposalsSchema>;

/** A vote's split in basis points (a validator can split its stake). */
const bpSplitSchema = z
  .object({
    for: z.number().catch(0),
    against: z.number().catch(0),
    abstain: z.number().catch(0)
  })
  .nullable()
  .catch(null);

const splitRowSchema = z.object({
  key: z.string(),
  label: z.string().nullable().optional().catch(null),
  for: lamports,
  against: lamports,
  abstain: lamports,
  notVoted: lamports.optional()
});

export const governanceProposalDetailSchema = z.object({
  proposal: governanceProposalSchema,
  votes: z
    .array(
      z.object({
        identity: z.string(),
        voteAccount: z.string().nullable().optional().catch(null),
        name: validatorNameSchema.catch(null),
        stake: lamports,
        bp: bpSplitSchema,
        // The stake it votes with once its stakers' overrides are taken out.
        effective: lamports.optional(),
        votedAt: z.number().nullable().optional().catch(null)
      })
    )
    .catch([]),
  nonVoters: z
    .array(
      z.object({
        identity: z.string(),
        name: validatorNameSchema.catch(null),
        stake: lamports
      })
    )
    .catch([]),
  overrides: z
    .object({
      byValidator: z
        .array(
          z.object({
            identity: z.string(),
            name: validatorNameSchema.catch(null),
            lamports,
            count: z.number().nullable().catch(null)
          })
        )
        .catch([]),
      entries: z
        .array(
          z.object({
            staker: z.string(),
            // A known stake pool's address (no names).
            pool: z.boolean().nullable().optional().catch(null),
            validator: z.string().nullable().optional().catch(null),
            lamports,
            bp: bpSplitSchema
          })
        )
        .catch([])
    })
    .nullable()
    .optional()
    .catch(null),
  splits: z
    .object({
      clients: z.array(splitRowSchema).catch([]),
      countries: z.array(splitRowSchema).catch([]),
      asns: z.array(splitRowSchema).catch([])
    })
    .nullable()
    .optional()
    .catch(null),
  turnoutOverTime: z
    .array(z.object({ t: z.number(), share: z.number() }))
    .optional()
    .catch([])
});
export type GovernanceProposalDetail = z.infer<
  typeof governanceProposalDetailSchema
>;

export const validatorGovernanceSchema = z.object({
  identity: z.string().nullable().optional().catch(null),
  records: z
    .array(
      z.object({
        proposal: governanceProposalSchema,
        bp: bpSplitSchema,
        stake: lamports.optional(),
        effective: lamports.optional(),
        votedAt: z.number().nullable().optional().catch(null)
      })
    )
    .catch([])
});
export type ValidatorGovernance = z.infer<typeof validatorGovernanceSchema>;
