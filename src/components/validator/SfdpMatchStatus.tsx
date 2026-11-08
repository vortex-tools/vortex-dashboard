import { SfdpMatch, SfdpMatchKind } from 'helpers/sfdp';
import { formatLamports } from 'helpers/utils';
import { SfdpProgram } from 'providers/VortexDataProvider';

const META: Record<SfdpMatchKind, { label: string; className: string }> = {
  uncapped: { label: 'Uncapped', className: 'text-body-tertiary' },
  capped: { label: 'Capped', className: 'text-body-tertiary' },
  transition: { label: 'Rebalancing', className: 'text-info' },
  withheld: { label: 'Withheld', className: 'text-warning' },
  pulled: { label: 'Pulled', className: 'text-danger' },
  retiring: { label: 'Retiring', className: 'text-body-tertiary' },
  ineligible: { label: 'Ineligible', className: 'text-body-tertiary' }
};

const MEANING: Record<SfdpMatchKind, string> = {
  uncapped:
    'Matched for its outside stake and below the cap: more outside stake earns more matching.',
  capped: 'At the program cap: more outside stake earns no more matching.',
  transition:
    "SFDP is changing its delegation this epoch: its activating plus deactivating stake here is over 5% of SFDP's active stake on it. Added stake becomes active next epoch; removed stake stops at the end of this one.",
  withheld:
    'Clearly below the rule while eligible and settled: matching layer withheld (5-epoch skip rate more than 5 points above the cluster average), or a criterion the API cannot measure.',
  pulled:
    'No delegation while eligible on everything measurable: the residual is pulled too, so a criterion the API cannot measure is failing (vote credits ≥ 97% of cluster, Jito MEV commission ≤ 10%, testnet performance, metrics, responsiveness, operating its own validator).',
  ineligible:
    'Fails a program criterion (outside stake ≤ 300k SOL, inflation commission ≤ 5%, version at the minimum, data center ≤ 15% and ASN ≤ 25% of stake): no delegation is due.',
  retiring:
    "Leaving the program: SFDP's delegation is going (graduated, or retired under its 2026 rules). Retired validators can apply for renewal."
};

/** A transition worded by its direction, as its label is. */
/** Why it's retiring, as the API infers it. */
const RETIRING_MEANING: Record<string, string> = {
  graduated:
    "Graduating: its outside stake is over the program's 300k SOL line, so SFDP's delegation leaves (2026 rules).",
  newRules:
    "Retiring under SFDP's 2026 rules: SFDP's whole delegation here is leaving. The program now delegates to at most 100 validators at a time, so members beyond that retire in weekly tranches. It can apply for renewal."
};

const CHANGE_MEANING: Record<NonNullable<SfdpMatch['change']>, string> = {
  adding:
    "SFDP is delegating more stake to it: activating stake over 5% of SFDP's active stake on it. It becomes active next epoch.",
  removing:
    "SFDP is taking stake away: deactivating stake over 5% of SFDP's active stake on it. It stops earning at the end of this epoch.",
  rebalancing:
    "SFDP is both adding and removing stake here: together over 5% of SFDP's active stake on it. Added stake becomes active next epoch; removed stake stops at the end of this one."
};

export const sfdpMatchMeaning = (
  kind: SfdpMatchKind,
  change?: SfdpMatch['change'],
  retiring?: string
) =>
  kind === 'transition' && change
    ? CHANGE_MEANING[change]
    : kind === 'retiring' && retiring && RETIRING_MEANING[retiring]
      ? RETIRING_MEANING[retiring]
      : MEANING[kind];

/** ◎57.5k - compact SOL for the table cell. */
const compactSol = (lamports: number) => {
  const sol = lamports / 1e9;
  return sol >= 1000
    ? `◎${(sol / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`
    : `◎${Math.round(sol).toLocaleString()}`;
};

/** The rule's arithmetic for this validator, for hovers and the card. */
const sfdpMatchArithmetic = (
  m: SfdpMatch,
  program: SfdpProgram | null | undefined
) => {
  const parts = [
    `Delegated ${formatLamports(m.effective, 0)}`,
    `external ${formatLamports(m.externalStake, 0)}`
  ];
  if (program && m.expected != null && m.kind !== 'ineligible')
    parts.push(
      `inferred rule min(${formatLamports(program.cap, 0)}, ${formatLamports(program.baseline, 0)} + ${Math.round(program.matchRate * 100)}% × external) = ${formatLamports(m.expected, 0)}`
    );
  if (m.kind === 'uncapped' && program && m.expected != null) {
    // Headroom: matching still available, and the outside stake it takes.
    const room = program.cap - m.expected;
    parts.push(
      `${formatLamports(room, 0)} below the cap (another ${formatLamports(room / program.matchRate, 0)} outside stake)`
    );
  }
  if (m.shortfall > 0)
    parts.push(`shortfall ${formatLamports(m.shortfall, 0)}`);
  return parts.join(' · ');
};

/** "Full" / "Capped" / "Withheld −◎57.5k" / "Pulled" / "Over 1M". */
const SfdpMatchStatus = ({
  match,
  program
}: {
  match: SfdpMatch;
  program: SfdpProgram | null | undefined;
}) => {
  const meta = META[match.kind];
  // A transition says which way, as its notice does.
  const label =
    match.kind === 'retiring'
      ? match.retiring === 'graduated'
        ? 'Graduating'
        : 'Retiring'
      : match.change === 'adding'
        ? 'Adding stake'
        : match.change === 'removing'
          ? 'Removing stake'
          : meta.label;
  return (
    <span
      className={meta.className}
      title={`${sfdpMatchMeaning(match.kind, match.change, match.retiring)}\n${sfdpMatchArithmetic(match, program)}`}
    >
      {label}
      {match.kind === 'withheld' && (
        <span className="font-monospace"> −{compactSol(match.shortfall)}</span>
      )}
    </span>
  );
};

export default SfdpMatchStatus;
