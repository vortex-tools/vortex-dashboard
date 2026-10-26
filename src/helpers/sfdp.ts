import type { SfdpProgram } from 'providers/vortex-schemas';

/**
 * Solana Foundation Delegation Program helpers, shared by the validators
 * table and the validator page so both agree on who counts as "in SFDP".
 */

// States that mean "in the program". Rejected / Retired / no record are not
// SFDP validators: their SFDP version verdicts don't apply and aren't shown.
const SFDP_ACTIVE_STATES = new Set(['Approved', 'Pending', 'TestnetOnboarded']);

export const isSfdpState = (state: string | null | undefined): boolean =>
  !!state && SFDP_ACTIVE_STATES.has(state);

/** True for the SFDP version check ids (sfdp_version_mainnet / _testnet). */
export const isSfdpCheck = (id: string): boolean => id.startsWith('sfdp_');

/**
 * Where an SFDP validator's delegation stands against the program's rule.
 *
 * The program delegates in two layers: a flat residual to every validator
 * meeting the baseline criteria, plus a matching layer (for a 5-epoch skip
 * rate within 5 points of the cluster average) proportional to stake from
 * outside the program, capped. The Foundation publishes it in words only;
 * the api-server fits it to the live delegations (SfdpProgram):
 *   expected = min(cap, baseline + matchRate * externalStake)
 * and serves the shortfall below it - 0 while the delegation is in its
 * rebalance transition, and 0 (expected 0) when a criterion it can measure
 * fails (stake limit, commission, version).
 *
 *   uncapped   - at the rule (within the fit's noise), below the cap: more
 *                outside stake earns more matching
 *   capped     - at the rule, and the rule is at its cap
 *   transition - the bulk of the delegation was (re)created this epoch or
 *                last: the program's stated 1-2 epoch rebalance
 *   withheld   - clearly below the rule, settled and eligible: matching
 *                layer withheld (skip rate) - or a criterion the API can't
 *                measure (vote credits, MEV commission, concentration...)
 *   pulled     - eligible but no delegation: the residual is gone too, so
 *                an unmeasured baseline criterion is failing
 *   ineligible - fails a measurable criterion; no delegation is due
 * Only Approved validators get a delegation, so only they get a status.
 */
export type SfdpMatchKind =
  | 'uncapped'
  | 'capped'
  | 'transition'
  | 'withheld'
  | 'pulled'
  | 'ineligible';

export interface SfdpMatch {
  kind: SfdpMatchKind;
  effective: number;
  externalStake: number;
  /** min(cap, baseline + matchRate * externalStake); 0 if ineligible;
   *  null without a rule. */
  expected: number | null;
  /** expected - effective, >= 0 (as served). */
  shortfall: number;
}

/**
 * A shortfall worth flagging: clearly outside the fit's own noise (10x its
 * median residual), and at least 1,000 SOL.
 */
const isClearShortfall = (
  shortfall: number,
  program: SfdpProgram | null | undefined
) =>
  shortfall >= Math.max(10 * (program?.fitResidualP50 ?? 0), 1_000_000_000_000);

export const sfdpMatch = (
  state: string | null | undefined,
  stake: {
    effective: number | null | undefined;
    externalStake: number | null | undefined;
    shortfall: number | null | undefined;
    inTransition?: boolean | null;
    eligible?: boolean | null;
  },
  program: SfdpProgram | null | undefined
): SfdpMatch | null => {
  const { effective, externalStake } = stake;
  if (state !== 'Approved' || effective == null || externalStake == null)
    return null;
  const expected = program
    ? Math.min(
        program.cap,
        program.baseline + program.matchRate * externalStake
      )
    : null;
  const shortfall = stake.shortfall ?? 0;
  const base = { effective, externalStake, expected, shortfall };
  if (stake.eligible === false)
    return { ...base, kind: 'ineligible', expected: 0, shortfall: 0 };
  if (stake.inTransition) return { ...base, kind: 'transition' };
  // Below a hundredth of the residual = nothing delegated.
  if (program && effective < program.baseline / 100)
    return { ...base, kind: 'pulled' };
  if (isClearShortfall(shortfall, program))
    return { ...base, kind: 'withheld' };
  return {
    ...base,
    kind: program && expected === program.cap ? 'capped' : 'uncapped'
  };
};
