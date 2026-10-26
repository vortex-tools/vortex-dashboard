import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { HostChanges, HostState } from 'providers/vortex-schemas';
import { useContext, useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';

const FIRST_MIGRATIONS = 5;

const flag = (cc: string | null | undefined) =>
  cc && /^[A-Z]{2}$/.test(cc)
    ? String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '';

/** "TeraSwitch Networks Inc." -> "TeraSwitch". */
const shortOrg = (org: string) =>
  org
    .replace(/^UAB\s+/, '')
    .replace(
      /[,\s]+(Inc\.?|LLC|Ltd\.?|LTDA|SAS|SA|GmbH|B\.V\.|BV|Networks|Corporation|Corp\.?|Limited|Co\.?)\b\.?/gi,
      ''
    )
    .trim() || org;

/** "🇩🇪 Frankfurt am Main · TeraSwitch", or "unknown host". */
const place = (h: HostState) => {
  const g = h.geo;
  if (!g) return h.host != null ? 'an unplaced host' : 'no address';
  return [
    `${flag(g.countryCode)} ${g.city ?? g.country ?? ''}`.trim(),
    g.asnOrganization && shortOrg(g.asnOrganization)
  ]
    .filter(Boolean)
    .join(' · ');
};

const sameSite = (a: HostState, b: HostState) =>
  !!a.dataCenterKey && a.dataCenterKey === b.dataCenterKey;

const ago = (unixS: number) => {
  const s = Math.max(0, Date.now() / 1000 - unixS);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

type Event = HostChanges['events'][number];

/** "Failover", "Moved", "Upgraded 4.3.1 → 4.3.2", "Client swap". */
const eventWhat = (e: Event) => {
  if (e.kind === 'software') {
    if (e.versionChanged && e.before.version && e.after.version)
      return `Upgraded ${e.before.version} → ${e.after.version}`;
    if (e.clientChanged)
      return `Client ${e.before.clientId ?? '?'} → ${e.after.clientId ?? '?'}`;
    return 'Software changed';
  }
  return e.kind === 'failover' ? 'Failover' : 'Moved';
};

/**
 * Where a validator runs (/validators/host-changes): this epoch's
 * failovers, moves and software upgrades, minute by minute; and, before
 * that, only its migrations - moves to a new host (failovers between a
 * primary and its spare are left out of the history). Hosts are never
 * shown by address, only as provider + city.
 */
const HostChangesCard = ({
  identity,
  currentEpoch
}: {
  identity: string;
  currentEpoch: number | null;
}) => {
  const context = useContext(VortexDataContext);
  const fetchData = context?.hostChangesState.fetchData;
  const data = context?.hostChangesState.data.get(identity);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (identity) fetchData?.(identity);
  }, [identity, fetchData]);
  if (!data) return null;

  const now = data.events
    .filter(e => currentEpoch != null && e.epoch === currentEpoch)
    .reverse();
  const moves = data.migrations.filter(m => m.kind === 'migration').reverse();
  const latest = data.migrations[data.migrations.length - 1];
  const shownMoves = all ? moves : moves.slice(0, FIRST_MIGRATIONS);

  return (
    <SectionCard
      title="Infrastructure"
      icon="server"
      info="Where this validator runs, from its gossip address (shown as provider + city, never the address). This epoch: failovers, moves and software upgrades as they happen. Before that: its migrations - moves to a new host; failovers between a primary and its spare aren't listed. Whether a change was a failover or a move is judged with hindsight, so a recent one can be relabeled."
    >
      {latest && (
        <p className="fs-9 mb-3">
          <span className="text-body-tertiary">Now at </span>
          <span className="fw-semibold">{place(latest.after)}</span>
          <span className="text-body-tertiary">
            {' '}
            since epoch {latest.epoch.toLocaleString()}
          </span>
        </p>
      )}

      <h6 className="fs-10 text-uppercase text-body-tertiary mb-2">
        This epoch
      </h6>
      {now.length ? (
        <Table size="sm" className="data-table compact-rows fs-9 mb-3">
          <tbody>
            {now.map((e, i) => (
              <tr key={`${e.observedAt}-${i}`}>
                <td
                  className="text-nowrap text-body-tertiary"
                  title={
                    e.observedAt
                      ? new Date(e.observedAt * 1000).toUTCString()
                      : undefined
                  }
                  style={{ width: '6rem' }}
                >
                  {e.observedAt ? ago(e.observedAt) : '—'}
                </td>
                <td className="fw-semibold text-nowrap">{eventWhat(e)}</td>
                <td className="text-body-secondary">
                  {e.kind === 'software'
                    ? place(e.after)
                    : sameSite(e.before, e.after)
                      ? `another host at ${place(e.after)}`
                      : `${place(e.before)} → ${place(e.after)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="fs-9 text-body-tertiary mb-3">
          No failovers, moves or upgrades recorded this epoch.
        </p>
      )}

      <h6 className="fs-10 text-uppercase text-body-tertiary mb-2">
        Migrations
      </h6>
      {moves.length ? (
        <>
          <Table size="sm" className="data-table compact-rows fs-9 mb-0">
            <tbody>
              {shownMoves.map(m => (
                <tr key={m.epoch}>
                  <td
                    className="text-nowrap text-body-tertiary"
                    style={{ width: '6rem' }}
                  >
                    Epoch {m.epoch.toLocaleString()}
                  </td>
                  <td className="text-body-secondary">
                    {sameSite(m.before, m.after)
                      ? `a new host at ${place(m.after)}`
                      : `${place(m.before)} → ${place(m.after)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {moves.length > FIRST_MIGRATIONS && (
            <button
              type="button"
              className="btn btn-link p-0 fs-10 mt-2"
              onClick={() => setAll(a => !a)}
            >
              {all ? 'Show fewer' : `Show all ${moves.length}`}
            </button>
          )}
        </>
      ) : data.migrations.length ? (
        <p className="fs-9 text-body-tertiary mb-0">
          No migrations in the last 100 epochs (only failovers).
        </p>
      ) : (
        <UntrackedState>No host changes in the last 100 epochs.</UntrackedState>
      )}
    </SectionCard>
  );
};

export default HostChangesCard;
