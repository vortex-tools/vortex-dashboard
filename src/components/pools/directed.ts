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

/** Stake its holders chose here: from the sources where the API lists
 *  them, else its directedStake sum. */
export const holderDirected = (v: Directed) =>
  v.directedSources
    ? v.directedSources
        .filter(x => chooser(x) === 'holders')
        .reduce((a, x) => a + amountOf(x), 0)
    : (v.directedStake ?? 0);

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
