import { compactSol } from 'components/pools/pools';
import { DirectedSource } from 'providers/vortex-schemas';

/** A pool's stake on one validator and the facts behind it (a /pool
 *  validator row, or a pool row of /validators/delegators). */
interface Directed {
  directedSources?: DirectedSource[] | null;
  directedStake?: number | null;
  directedBreakdown?: {
    user?: number | null;
    gauge?: number | null;
    protocol?: number | null;
    protocolTicket?: number | null;
    matching?: number | null;
  } | null;
  stewardSelected?: number | null;
}

/** Who chose a source's stake: the pool's holders (a holder's ticket,
 *  their own pick, a gauge vote), a protocol (its ticket), the pool itself
 *  (an admin-set target, its own validator), or matching. */
const chooser = (x: DirectedSource) =>
  x.kind === 'user' ||
  x.kind === 'gauge' ||
  (x.kind === 'ticket' && !x.ticket?.protocol)
    ? 'holders'
    : x.kind === 'ticket'
      ? 'protocol'
      : x.kind === 'adminTarget' || x.kind === 'poolOwn'
        ? 'pool'
        : x.kind === 'matching'
          ? 'matching'
          : 'other';
const amountOf = (x: DirectedSource) => x.lamports ?? x.target ?? 0;

/** Who can choose a pool's stake beyond its own selection, in the order
 *  shown. */
export const CHOOSERS = ['holders', 'protocol', 'pool', 'matching'] as const;
export type Chooser = (typeof CHOOSERS)[number];
const CHOOSER_LABEL: Record<Chooser, string> = {
  holders: 'holders',
  protocol: 'protocols',
  pool: 'the pool',
  matching: 'matching'
};
export type ByChooser = Record<Chooser, number>;
const none = (): ByChooser => ({
  holders: 0,
  protocol: 0,
  pool: 0,
  matching: 0
});

/** Its directed stake by who chose it: from the sources where the API
 *  lists them, else its breakdown sums, else its directedStake (holders). */
export const directedBy = (v: Directed): ByChooser => {
  const out = none();
  if (v.directedSources) {
    for (const x of v.directedSources) {
      const c = chooser(x);
      if (c !== 'other') out[c] += amountOf(x);
    }
    return out;
  }
  const b = v.directedBreakdown;
  if (b) {
    out.holders = (b.user ?? 0) + (b.gauge ?? 0);
    out.protocol = b.protocolTicket ?? 0;
    out.pool = b.protocol ?? 0;
    out.matching = b.matching ?? 0;
    return out;
  }
  out.holders = v.directedStake ?? 0;
  return out;
};

export const sumBy = (b: ByChooser) => CHOOSERS.reduce((a, c) => a + b[c], 0);

/** Stake directed here, by anyone. */
export const directedTotal = (v: Directed) => sumBy(directedBy(v));

/** A pool's directed stake by who chose it, from its own sums
 *  (/pools, /pool directed): holders, a protocol's ticket, the pool's own
 *  choices (protocol = adminTarget + poolOwn), matching. */
export const poolDirectedBy = (p: {
  directed?: {
    stake: number;
    protocolTicket?: number | null;
    protocol?: number | null;
    matching?: number | null;
  } | null;
}): ByChooser => ({
  holders: p.directed?.stake ?? 0,
  protocol: p.directed?.protocolTicket ?? 0,
  pool: p.directed?.protocol ?? 0,
  matching: p.directed?.matching ?? 0
});

/** Several validators' (or a pool's) parts added up. */
export const addBy = (all: ByChooser[]) => {
  const out = none();
  for (const b of all) for (const c of CHOOSERS) out[c] += b[c];
  return out;
};

/** "by holders" / "the pool 91% · protocols 9%": who chose it. */
export const choosersLine = (b: ByChooser) => {
  const total = sumBy(b);
  const parts = CHOOSERS.filter(c => b[c] > 0).sort((x, y) => b[y] - b[x]);
  if (!total || !parts.length) return '';
  if (parts.length === 1) return `by ${CHOOSER_LABEL[parts[0]]}`;
  return parts
    .map(c => `${CHOOSER_LABEL[c]} ${Math.round((b[c] / total) * 100)}%`)
    .join(' · ');
};

/** Only its holders chose it (a delta against directedStakePrev, which
 *  counts holders only, compares like with like). */
export const onlyHolders = (v: Directed) => {
  const b = directedBy(v);
  return b.holders > 0 && b.holders === sumBy(b);
};

const KIND_LABEL: Record<string, string> = {
  ticket: 'Ticket',
  adminTarget: 'Set by the pool',
  poolOwn: "The pool's own validator",
  user: 'Holders',
  gauge: 'Gauge vote',
  matching: 'Matching'
};
const ATTRIBUTION: Record<string, string> = {
  onchain: 'on-chain',
  poolData: 'per the pool',
  inferred: 'inferred'
};

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** A validator's pool stake by who chose it, one line per source (with
 *  its label and where the fact comes from); an admin allocation nobody
 *  has attributed is called out. Else the API's sums. */
export const directedDetail = (v: Directed) => {
  if (v.directedSources?.length)
    return [
      ...v.directedSources.map(x => {
        const what =
          x.kind === 'ticket' && x.ticket?.protocol
            ? 'Protocol ticket'
            : (KIND_LABEL[x.kind] ?? x.kind);
        const who =
          x.label ??
          (x.kind === 'ticket' && x.ticket?.authority
            ? short(x.ticket.authority)
            : null) ??
          (x.kind === 'adminTarget' ? 'unattributed admin allocation' : null);
        return `${what}${who ? ` (${who})` : ''}: ${compactSol(amountOf(x))}${
          x.basis === 'target' ? ' target' : ''
        }${x.attribution ? ` · ${ATTRIBUTION[x.attribution] ?? x.attribution}` : ''}${
          x.note ? `\n  ${x.note}` : ''
        }`;
      }),
      v.stewardSelected != null
        ? `Steward-selected: ${compactSol(v.stewardSelected)}`
        : null
    ]
      .filter(Boolean)
      .join('\n');
  const b = v.directedBreakdown;
  const part = (label: string, x: number | null | undefined) =>
    x != null ? `${label} ${compactSol(x)}` : null;
  return [
    part('Holders (user)', b?.user),
    part('Holders (gauge)', b?.gauge),
    part('Protocol ticket', b?.protocolTicket),
    part('Set by the pool', b?.protocol),
    part('Matching', b?.matching),
    part('Steward-selected', v.stewardSelected)
  ]
    .filter(Boolean)
    .join('\n');
};
