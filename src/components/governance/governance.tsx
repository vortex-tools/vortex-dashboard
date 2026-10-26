import Badge, { BadgeBg } from 'components/base/Badge';
import { GovernanceProposal, GovernanceTally } from 'providers/vortex-schemas';
import { ReactNode } from 'react';

/** "◎12.3M" / "◎450K" / "◎812". */
export const compactSol = (lamports: number | null | undefined) => {
  if (lamports == null) return '—';
  const sol = lamports / 1e9;
  const abs = Math.abs(sol);
  if (abs >= 1e6) return `◎${(sol / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `◎${(sol / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return `◎${sol.toFixed(0)}`;
};

export const pct = (share: number | null | undefined, digits = 1) =>
  share == null ? '—' : `${(share * 100).toFixed(digits)}%`;

export const tallySum = (t: GovernanceTally | null | undefined) =>
  t ? t.for + t.against + t.abstain : 0;

/** "SGP-0002: Double Disinflation": the title, led by its SGP number
 *  when the title doesn't already start with it. */
export const proposalName = (p: {
  sgp?: string | null;
  title: string | null;
  address: string;
}) => {
  const title = p.title ?? `${p.address.slice(0, 6)}…${p.address.slice(-6)}`;
  return p.sgp && !title.startsWith(p.sgp) ? `${p.sgp}: ${title}` : title;
};

/** A separate SGP tag: only when the name can't carry it (no title). */
export const sgpTag = (p: { sgp: string | null; title: string | null }) =>
  p.sgp && !p.title ? p.sgp : null;

/** Newest proposal first: by SGP number (creation order differs - SGP-0003
 *  was created first), unnumbered ones last. */
export const bySgpDesc = (
  a: { sgp: string | null },
  b: { sgp: string | null }
) => {
  const n = (s: string | null) => (s ? Number(s.replace(/\D/g, '')) : -1);
  return n(b.sgp) - n(a.sgp);
};

/** Both rules pass at two thirds; the constitution also needs a third of
 *  the snapshot stake to vote. */
export const THRESHOLD = 2 / 3;
export const RULE: Record<string, { label: string; text: string }> = {
  constitution: {
    label: 'Constitution',
    text: 'For must be at least two thirds of all votes (For + Against + Abstain), with at least a third of the snapshot stake voting; below that quorum the result is Inconclusive.'
  },
  decisive: {
    label: 'Decisive',
    text: 'For must be at least two thirds of For + Against; Abstain is not counted and there is no quorum.'
  }
};
/** The for share the proposal's rule judges by. */
export const ruleShare = (p: GovernanceProposal, rule = p.rule) =>
  rule === 'decisive' ? p.shares?.ofDecisive : p.shares?.ofParticipating;

const PHASE: Record<string, { bg: BadgeBg; label: string }> = {
  support: { bg: 'info', label: 'Gathering support' },
  voting: { bg: 'primary', label: 'Voting' },
  closed: { bg: 'secondary', label: 'Closed' },
  finalized: { bg: 'secondary', label: 'Finalized' }
};
export const PhaseBadge = ({ phase }: { phase: string | null }) => {
  const p = (phase && PHASE[phase]) || {
    bg: 'secondary' as const,
    label: phase ?? '—'
  };
  return <Badge bg={p.bg}>{p.label}</Badge>;
};

const VERDICT: Record<string, BadgeBg> = {
  accepted: 'success',
  rejected: 'danger',
  inconclusive: 'warning'
};
/** The verdict, or the projected one while voting ("so far"). */
export const VerdictBadge = ({
  verdict,
  projected
}: {
  verdict: string | null;
  projected?: string | null;
}) => {
  const v = verdict ?? projected;
  if (!v) return null;
  return (
    <Badge
      bg={VERDICT[v.toLowerCase()] ?? 'secondary'}
      title={verdict ? undefined : 'The result if voting ended now'}
    >
      {v}
      {!verdict && ' so far'}
    </Badge>
  );
};

// The three choices - always "For", "Against", "Abstain" - and their
// colors (theme tokens: CSS var for the page, the name for charts).
export const CHOICE = [
  { key: 'for', label: 'For', token: 'success' },
  { key: 'against', label: 'Against', token: 'danger' },
  { key: 'abstain', label: 'Abstain', token: 'quaternary-color' }
] as const;
export type ChoiceKey = (typeof CHOICE)[number]['key'];
const cssColor = (token: string) => `var(--vx-${token})`;
const choiceOf = (key: string | null | undefined) =>
  CHOICE.find(c => c.key === key);

/** A choice as the UI shows it everywhere: its color dot and label, with
 *  an optional amount after ("For ◎142.8M", "Abstain 99.5%"). */
export const ChoiceTag = ({
  choice,
  children
}: {
  choice: ChoiceKey;
  children?: ReactNode;
}) => {
  const c = choiceOf(choice)!;
  return (
    <span className="text-nowrap">
      <span
        className="d-inline-block rounded-circle me-1 align-middle"
        style={{ width: 8, height: 8, background: cssColor(c.token) }}
      />
      <span className="fw-semibold">{c.label}</span>
      {children != null && (
        <span className="font-monospace ms-1">{children}</span>
      )}
    </span>
  );
};

/**
 * A For / Against / Abstain bar (with `notVoted`, the stake that didn't
 * vote as an empty tail). `threshold`: a mark at that share of the bar.
 */
export const VoteBar = ({
  tally,
  notVoted = 0,
  threshold,
  height = 10
}: {
  tally: GovernanceTally | null | undefined;
  notVoted?: number | null;
  threshold?: number | null;
  height?: number;
}) => {
  const parts = CHOICE.map(c => ({
    ...c,
    v: Math.max(0, tally?.[c.key] ?? 0)
  }));
  const total = parts.reduce((a, p) => a + p.v, 0) + Math.max(0, notVoted ?? 0);
  if (!total) return <div className="text-body-quaternary fs-10">No votes</div>;
  return (
    <div
      className="position-relative d-flex rounded-1 overflow-hidden bg-body-highlight"
      style={{ height }}
      title={[
        ...parts.map(p => `${p.label} ${pct(p.v / total)}`),
        ...(notVoted ? [`Didn't vote ${pct(notVoted / total)}`] : [])
      ].join(' · ')}
    >
      {parts.map(p =>
        p.v ? (
          <div
            key={p.key}
            style={{
              width: `${(p.v / total) * 100}%`,
              background: cssColor(p.token)
            }}
          />
        ) : null
      )}
      {threshold != null && (
        <div
          className="position-absolute top-0 bottom-0"
          style={{
            left: `${threshold * 100}%`,
            width: 2,
            background: 'var(--vx-emphasis-color)'
          }}
          title={`Passes at ${pct(threshold)}`}
        />
      )}
    </div>
  );
};

/** A vote: its choice, or a split's parts, largest first ("Abstain 99.5% ·
 *  Against 0.5%"). */
export const VoteChoice = ({
  choice,
  basisPoints
}: {
  choice: string | null;
  basisPoints?: GovernanceTally | null;
}) => {
  if (!choice) return <span className="text-body-quaternary">—</span>;
  if (choice !== 'split' || !basisPoints) {
    const c = choiceOf(choice);
    return c ? <ChoiceTag choice={c.key} /> : <span>{choice}</span>;
  }
  const parts = CHOICE.map(c => ({ key: c.key, v: basisPoints[c.key] }))
    .filter(p => p.v > 0)
    .sort((a, b) => b.v - a.v);
  return (
    <span className="fs-10" title="A split vote">
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && <span className="text-body-quaternary"> · </span>}
          <ChoiceTag choice={p.key}>
            {(p.v / 100).toFixed(p.v % 100 ? 1 : 0)}%
          </ChoiceTag>
        </span>
      ))}
    </span>
  );
};

/** "1,021–1,024". */
export const epochSpan = (p: GovernanceProposal) =>
  p.startEpoch != null && p.endEpoch != null
    ? `${p.startEpoch.toLocaleString()}–${p.endEpoch.toLocaleString()}`
    : (p.startEpoch?.toLocaleString() ?? null);
