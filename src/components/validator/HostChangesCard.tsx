import SectionCard from 'components/common/SectionCard';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { HostChanges, HostState } from 'providers/vortex-schemas';
import { clientBase, isKnownClient } from 'helpers/clients';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { useContext, useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';

const FIRST_MIGRATIONS = 10;

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

/** Where a host is, for comparing a gossip reading with an event. */
const placeKey = (h: Pick<HostState, 'geo'> | null | undefined) =>
  h?.geo ? `${h.geo.city ?? ''}|${h.geo.asnOrganization ?? ''}` : null;

/** "Agave 4.3.2": what a host ran (its base client and version). */
const runs = (h: HostState) => {
  const client = h.clientId
    ? isKnownClient(h.clientId)
      ? clientBase(h.clientId)
      : h.clientId
    : null;
  return [client, h.version].filter(Boolean).join(' ') || null;
};

/** "46 min", "3 h 5 min". */
const lasted = (secs: number) => {
  const m = Math.max(1, Math.round(secs / 60));
  return m < 60
    ? `${m} min`
    : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

/** This epoch's events, newest first: a failover and its return to the
 *  same host as one stay, the rest as they came. */
type Line =
  | { kind: 'event'; e: Event }
  | { kind: 'stay'; out: Event; back: Event };
const linesOf = (events: Event[]): Line[] => {
  const out: Line[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const f = events[i + 1];
    if (
      f &&
      e.kind !== 'software' &&
      f.kind !== 'software' &&
      e.before.host != null &&
      f.after.host === e.before.host &&
      f.before.host === e.after.host
    ) {
      out.push({ kind: 'stay', out: e, back: f });
      i++;
    } else out.push({ kind: 'event', e });
  }
  return out.reverse();
};

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
  // Where gossip has it now (the Details card's location), and whether the
  // newest event agrees: an event needs two reads a minute apart (~2 min),
  // so a fresh failover shows in gossip first. Until they agree: re-read
  // every 2 minutes.
  const live = context?.validatorStatusState.data.get(identity)?.geo ?? null;
  const newest = data?.events[data.events.length - 1] ?? null;
  const switching =
    !!live &&
    !!newest &&
    placeKey({ geo: live }) != null &&
    placeKey({ geo: live }) !== placeKey(newest.after);
  useLiveRefresh(switching, 120_000, () =>
    fetchData?.(identity, { force: true })
  );
  if (!data) return null;

  const now = linesOf(
    data.events.filter(e => currentEpoch != null && e.epoch === currentEpoch)
  );
  const moves = data.migrations.filter(m => m.kind === 'migration').reverse();
  const latest = data.migrations[data.migrations.length - 1];
  const shownMoves = all ? moves : moves.slice(0, FIRST_MIGRATIONS);
  // Its backup: a site the epoch-level failovers took it to other than
  // the one it runs at now - the most used, and since when.
  const backups = new Map<string, { label: string; epochs: Set<number> }>();
  for (const m of data.migrations) {
    // Another machine at the same site (city and network) is its primary
    // rotating, not a backup.
    if (
      m.kind !== 'failover' ||
      placeKey(m.after) === placeKey(live ? { geo: live } : latest?.after)
    )
      continue;
    const k = placeKey(m.after) ?? String(m.after.host);
    const b = backups.get(k) ?? { label: place(m.after), epochs: new Set() };
    b.epochs.add(m.epoch);
    backups.set(k, b);
  }
  const backup = [...backups.values()].sort(
    (a, b) => b.epochs.size - a.epochs.size
  )[0];

  return (
    <SectionCard
      title="Infrastructure"
      icon="server"
      info="Where this validator runs (provider and city, from gossip): this epoch's failovers, moves and upgrades, and its past moves to new hosts."
    >
      {/* Where gossip has it now (else the latest epoch's record); while a
          fresh failover is still being confirmed, says so. */}
      {(live || latest) && (
        <p className="fs-9 mb-1">
          <span className="text-body-tertiary">Now at </span>
          <span className="fw-semibold">
            {live
              ? place({ host: null, geo: live } as HostState)
              : place(latest!.after)}
          </span>
          <span className="text-body-tertiary">
            {switching
              ? ' · switching hosts…'
              : latest &&
                  placeKey(latest.after) ===
                    placeKey(live ? { geo: live } : latest.after)
                ? ` since epoch ${latest.epoch.toLocaleString()}`
                : ''}
          </span>
        </p>
      )}
      {backup && (
        <p className="fs-9 mb-3 text-body-tertiary">
          Backup: <span className="text-body-secondary">{backup.label}</span>,
          used in {backup.epochs.size.toLocaleString()}{' '}
          {backup.epochs.size === 1 ? 'epoch' : 'epochs'} since{' '}
          {Math.min(...backup.epochs).toLocaleString()}
        </p>
      )}
      {!backup && (live || latest) && <div className="mb-3" />}

      {/* Each section only when it has something; neither: one line. */}
      {!now.length && !moves.length && (
        <p className="fs-9 text-body-tertiary mb-0">
          No host changes recorded.
        </p>
      )}
      {now.length > 0 && (
        <>
          <h6 className="fs-10 text-uppercase text-body-tertiary mb-2">
            This epoch
          </h6>
          <Table size="sm" className="data-table compact-rows fs-9 mb-3">
            <tbody>
              {now.map((l, i) => {
                const at = l.kind === 'stay' ? l.out : l.e;
                return (
                  <tr key={`${at.observedAt}-${i}`}>
                    <td
                      className="text-nowrap text-body-tertiary"
                      title={
                        at.observedAt
                          ? new Date(at.observedAt * 1000).toUTCString()
                          : undefined
                      }
                      style={{ width: '6rem' }}
                    >
                      {at.observedAt ? ago(at.observedAt) : '—'}
                    </td>
                    {l.kind === 'stay' ? (
                      <>
                        <td className="fw-semibold text-nowrap">
                          {l.out.kind === 'failover' ? 'Failover' : 'Moved'}
                        </td>
                        <td className="text-body-secondary">
                          {/* To the backup and back: what it ran there, for
                              how long, and the upgrade it covered. */}
                          {(() => {
                            const away = l.out.after;
                            const ranThere =
                              (l.out.versionChanged || l.out.clientChanged) &&
                              runs(away);
                            const before = runs(l.out.before);
                            const after = runs(l.back.after);
                            const upgrade =
                              before && after && before !== after
                                ? ` during the ${before} → ${l.back.after.version ?? '?'} upgrade`
                                : '';
                            const gap =
                              l.out.observedAt && l.back.observedAt
                                ? `, back after ${lasted(l.back.observedAt - l.out.observedAt)}`
                                : ', back';
                            return `to ${ranThere ? `the ${ranThere} backup (${place(away)})` : place(away)}${upgrade}${gap}`;
                          })()}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="fw-semibold text-nowrap">
                          {eventWhat(l.e)}
                        </td>
                        <td className="text-body-secondary">
                          {l.e.kind === 'software'
                            ? place(l.e.after)
                            : sameSite(l.e.before, l.e.after)
                              ? `another host at ${place(l.e.after)}`
                              : `${place(l.e.before)} → ${place(l.e.after)}`}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}

      {moves.length > 0 && (
        <>
          <h6 className="fs-10 text-uppercase text-body-tertiary mb-2">
            Migrations
          </h6>
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
      )}
    </SectionCard>
  );
};

export default HostChangesCard;
