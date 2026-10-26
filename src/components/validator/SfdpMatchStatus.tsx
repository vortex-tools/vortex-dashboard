import { SfdpMatch, SfdpMatchKind } from 'helpers/sfdp';
import { formatLamports } from 'helpers/utils';
import { SfdpProgram } from 'providers/VortexDataProvider';

const META: Record<SfdpMatchKind, { label: string; className: string }> = {
  uncapped: { label: 'Uncapped', className: 'text-body-tertiary' },
  capped: { label: 'Capped', className: 'text-body-tertiary' },
  transition: { label: 'Transition', className: 'text-info' },
  withheld: { label: 'Withheld', className: 'text-warning' },
  pulled: { label: 'Pulled', className: 'text-danger' },
  ineligible: { label: 'Ineligible', className: 'text-body-tertiary' }
};

const MEANING: Record<SfdpMatchKind, string> = {
  uncapped:
    'Matched for its outside stake and below the cap: more outside stake earns more matching.',
  capped: 'At the program cap: more outside stake earns no more matching.',
  transition:
    "The bulk of the delegation was (re)created this epoch or last: the program's 1-2 epoch rebalance. Settles on its own.",
  withheld:
    'Clearly below the rule while eligible and settled: matching layer withheld (5-epoch skip rate more than 5 points above the cluster average), or a criterion the API cannot measure.',
  pulled:
    'No delegation while eligible on everything measurable: the residual is pulled too, so a criterion the API cannot measure is failing (vote credits ≥ 97% of cluster, Jito MEV commission ≤ 10%, ASN and ASN + city concentration, testnet performance, metrics, responsiveness).',
  ineligible:
    'Fails a program criterion (total stake ≤ 1M SOL, inflation commission ≤ 5%, version at the minimum): no delegation is due.'
};

export const sfdpMatchMeaning = (kind: SfdpMatchKind) => MEANING[kind];

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
  return (
    <span
      className={meta.className}
      title={`${MEANING[match.kind]}\n${sfdpMatchArithmetic(match, program)}`}
    >
      {meta.label}
      {match.kind === 'withheld' && (
        <span className="font-monospace"> −{compactSol(match.shortfall)}</span>
      )}
    </span>
  );
};

export default SfdpMatchStatus;
