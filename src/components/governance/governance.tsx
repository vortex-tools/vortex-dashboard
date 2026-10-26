import Badge, { BadgeBg } from 'components/base/Badge';
import { GovernanceProposal } from 'providers/vortex-schemas';

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

/** "SGP-0003", from the proposal's index - unless the title already
 *  starts with it. */
export const proposalTag = (p: GovernanceProposal) => {
  if (p.index == null) return null;
  const tag = `SGP-${String(p.index).padStart(4, '0')}`;
  return p.title?.startsWith(tag) ? null : tag;
};

export const proposalName = (p: GovernanceProposal) =>
  p.title ?? `${p.address.slice(0, 6)}…${p.address.slice(-6)}`;

const PHASE: Record<string, { bg: BadgeBg; label: string }> = {
  support: { bg: 'info', label: 'Gathering support' },
  voting: { bg: 'primary', label: 'Voting' },
  finalized: { bg: 'secondary', label: 'Finalized' }
};
export const PhaseBadge = ({ phase }: { phase: string | null }) => {
  const p = (phase && PHASE[phase]) || {
    bg: 'secondary' as const,
    label: phase ?? '—'
  };
  return <Badge bg={p.bg}>{p.label}</Badge>;
};

const VERDICT: Record<string, { bg: BadgeBg; label: string }> = {
  accepted: { bg: 'success', label: 'Accepted' },
  rejected: { bg: 'danger', label: 'Rejected' },
  inconclusive: { bg: 'warning', label: 'Inconclusive' }
};
export const VerdictBadge = ({
  result
}: {
  result: string | null | undefined;
}) => {
  if (!result) return null;
  const v = VERDICT[result] ?? { bg: 'secondary' as const, label: result };
  return <Badge bg={v.bg}>{v.label}</Badge>;
};

// For / against / abstain colors, shared by bars and charts.
export const CHOICE = [
  { key: 'for', label: 'For', color: 'var(--vx-success)' },
  { key: 'against', label: 'Against', color: 'var(--vx-danger)' },
  { key: 'abstain', label: 'Abstain', color: 'var(--vx-quaternary-color)' }
] as const;
type Choice = (typeof CHOICE)[number]['key'];

/**
 * A for / against / abstain bar of the stake that voted (and, with
 * `notVoted`, the rest in a faint tail). Optional marks: the passing
 * threshold on the for share.
 */
export const VoteBar = ({
  values,
  notVoted = 0,
  threshold,
  height = 10
}: {
  values: Partial<Record<Choice, number | null>>;
  notVoted?: number | null;
  threshold?: number | null;
  height?: number;
}) => {
  const parts = CHOICE.map(c => ({ ...c, v: Math.max(0, values[c.key] ?? 0) }));
  const total = parts.reduce((a, p) => a + p.v, 0) + Math.max(0, notVoted ?? 0);
  if (!total) return <div className="text-body-quaternary fs-10">no votes</div>;
  return (
    <div
      className="position-relative d-flex rounded-1 overflow-hidden bg-body-highlight"
      style={{ height }}
      title={parts.map(p => `${p.label} ${pct(p.v / total)}`).join(' · ')}
    >
      {parts.map(p =>
        p.v ? (
          <div
            key={p.key}
            style={{ width: `${(p.v / total) * 100}%`, background: p.color }}
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
          title={`Threshold ${pct(threshold)}`}
        />
      )}
    </div>
  );
};

/** A validator's vote: one choice, or its split ("70% for · 30% against"). */
export const VoteChoice = ({
  bp
}: {
  bp: { for: number; against: number; abstain: number } | null;
}) => {
  if (!bp) return <span className="text-body-quaternary">—</span>;
  const parts = CHOICE.map(c => ({ ...c, v: bp[c.key] })).filter(p => p.v > 0);
  if (parts.length === 1)
    return (
      <span className="fw-semibold" style={{ color: parts[0].color }}>
        {parts[0].label}
      </span>
    );
  return (
    <span className="fs-10">
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && <span className="text-body-quaternary"> · </span>}
          <span style={{ color: p.color }}>
            {(p.v / 100).toFixed(0)}% {p.label.toLowerCase()}
          </span>
        </span>
      ))}
    </span>
  );
};

/** "Epochs 1021-1024". */
export const epochSpan = (p: GovernanceProposal) =>
  p.startEpoch != null && p.endEpoch != null
    ? `Epochs ${p.startEpoch.toLocaleString()}–${p.endEpoch.toLocaleString()}`
    : p.startEpoch != null
      ? `From epoch ${p.startEpoch.toLocaleString()}`
      : null;
