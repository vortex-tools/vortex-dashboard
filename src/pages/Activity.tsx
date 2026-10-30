import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import {
  CHANGE_KIND,
  ChangeBadge,
  BLS_FILTER,
  HOST_KINDS,
  ShortAddress,
  changeValue,
  eventTime,
  isBlsChange,
  isNoopChange,
  softwareLabel,
  voterLabel,
  whenText
} from 'components/changes/changes';
import DelayedSpinner from 'components/common/DelayedSpinner';
import ValidatorSearch from 'components/common/ValidatorSearch';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import FeatherIcon from 'feather-icons-react';
import { explorerTx } from 'helpers/explorer';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useCluster from 'hooks/useCluster';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ActivityEvent } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Form } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router';

/** Epoch ranges offered (the API reads at most 10). */
const RANGES = [1, 3, 10];
const DEFAULT_RANGE = 3;

const NOWRAP = {
  headerProps: { className: 'text-nowrap' },
  cellProps: { className: 'text-nowrap' }
};

/** A failover and its failback (the move back), matched per validator -
 *  host A to B, then B to A - under one pair id. */
type Pair = { id: number; role: 'out' | 'back'; gapSecs: number | null };

/** "46 min", "3 h 5 min", "2 d 4 h". */
const duration = (secs: number) => {
  const m = Math.round(secs / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.floor(h / 24);
  return `${d} d${h % 24 ? ` ${h % 24} h` : ''}`;
};

/** Each validator's failovers in time order, paired out and back. A move
 *  with no return in range is an "out" with no gap (still away). */
const pairFailovers = (events: ActivityEvent[]) => {
  const pairs = new Map<ActivityEvent, Pair>();
  const byValidator = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    if (e.kind !== 'failover') continue;
    const k = e.voteKey ?? e.identity ?? '';
    byValidator.set(k, [...(byValidator.get(k) ?? []), e]);
  }
  let n = 0;
  for (const list of byValidator.values()) {
    list.sort((a, b) => (eventTime(a) ?? 0) - (eventTime(b) ?? 0));
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const b = list[i + 1];
      const id = n++;
      const back =
        b &&
        a.before?.host != null &&
        a.after?.host != null &&
        b.before?.host === a.after.host &&
        b.after?.host === a.before.host;
      if (!back) {
        pairs.set(a, { id, role: 'out', gapSecs: null });
        continue;
      }
      const ta = eventTime(a);
      const tb = eventTime(b);
      const gap = ta != null && tb != null ? tb - ta : null;
      pairs.set(a, { id, role: 'out', gapSecs: gap });
      pairs.set(b, { id, role: 'back', gapSecs: gap });
      i++;
    }
  }
  return pairs;
};

/** How long until the failback (on a failover), or since the failover
 *  (on its failback). */
const PairMark = ({ p }: { p: Pair }) => (
  <span className="fs-10 text-body-tertiary ms-2">
    {p.role === 'back'
      ? `after ${p.gapSecs != null ? duration(p.gapSecs) : '?'}`
      : p.gapSecs != null
        ? `back ${duration(p.gapSecs)} later`
        : 'not back yet'}
  </span>
);

const columns = (
  isTestnet: boolean,
  pairs: Map<ActivityEvent, Pair>,
  /** The pair a hovered row belongs to: its two rows keep their badges,
   *  the other failovers' turn gray. */
  hovered: number | null
): ColumnDef<ActivityEvent>[] => [
  {
    id: 'epoch',
    header: 'Epoch',
    accessorFn: e => e.epoch,
    cell: ({ row: { original: e } }) => (
      <span className="font-monospace">{e.epoch.toLocaleString()}</span>
    ),
    meta: NOWRAP
  },
  {
    id: 'when',
    header: 'When',
    // By time (host changes have no slot), then slot.
    accessorFn: e => eventTime(e) ?? e.slot ?? e.epoch,
    cell: ({ row: { original: e } }) => {
      const t = eventTime(e);
      return t != null ? (
        <span
          className="text-body-tertiary"
          title={new Date(t * 1000).toLocaleString()}
        >
          {whenText(t)}
        </span>
      ) : (
        <span className="text-body-quaternary">—</span>
      );
    },
    meta: NOWRAP
  },
  {
    id: 'validator',
    header: 'Validator',
    // Searched by name and both keys.
    accessorFn: e => `${e.name ?? ''} ${e.voteKey ?? ''} ${e.identity ?? ''}`,
    cell: ({ row: { original: e } }) =>
      e.voteKey ? (
        <Link
          to={`/validator/${e.identity ?? e.voteKey}`}
          title={e.voteKey}
          className="d-inline-block text-truncate align-bottom"
          style={{ maxWidth: '14rem' }}
        >
          {e.name ?? `${e.voteKey.slice(0, 4)}…${e.voteKey.slice(-4)}`}
        </Link>
      ) : (
        '—'
      ),
    meta: NOWRAP
  },
  {
    id: 'kind',
    header: 'Change',
    accessorFn: e => CHANGE_KIND[e.kind]?.label ?? e.kind,
    cell: ({ row: { original: e } }) => (
      <>
        {(() => {
          const p = pairs.get(e);
          // A failover's move back is a failback.
          const label =
            e.kind === 'software'
              ? softwareLabel(e)
              : e.kind === 'voter'
                ? voterLabel(e)
                : p?.role === 'back'
                  ? 'Failback'
                  : null;
          const dimmed = hovered != null && p?.id !== hovered;
          return (
            <>
              <span
                style={{
                  filter: dimmed ? 'grayscale(1)' : undefined,
                  opacity: dimmed ? 0.5 : undefined,
                  transition: 'filter 120ms, opacity 120ms'
                }}
              >
                <ChangeBadge
                  kind={e.kind}
                  label={label}
                  shade={p?.role === 'back'}
                />
              </span>
              {p && <PairMark p={p} />}
            </>
          );
        })()}
      </>
    ),
    meta: NOWRAP
  },
  {
    id: 'new',
    header: 'To',
    enableSorting: false,
    cell: ({ row: { original: e } }) =>
      changeValue(e, 'new', isTestnet) ?? (
        <span className="text-body-quaternary">—</span>
      ),
    meta: NOWRAP
  },
  {
    id: 'old',
    header: 'From',
    enableSorting: false,
    cell: ({ row: { original: e } }) =>
      changeValue(e, 'old', isTestnet) ?? (
        <span
          className="text-body-quaternary"
          title={
            e.kind === 'withdraw' ||
            e.kind === 'create' ||
            HOST_KINDS.has(e.kind)
              ? undefined
              : 'No earlier change on record'
          }
        >
          —
        </span>
      ),
    meta: NOWRAP
  },
  {
    id: 'effective',
    header: 'Takes effect',
    accessorFn: e => e.effectiveEpoch ?? e.epoch,
    cell: ({ row: { original: e } }) =>
      e.effectiveEpoch == null || e.effectiveEpoch === e.epoch ? (
        <span className="text-body-tertiary">at once</span>
      ) : (
        <span className="font-monospace">
          epoch {e.effectiveEpoch.toLocaleString()}
        </span>
      ),
    meta: NOWRAP
  },
  {
    id: 'signer',
    header: 'Signed by',
    enableSorting: false,
    cell: ({ row: { original: e } }) =>
      e.signers[0] ? (
        <span
          title={
            e.feePayer && e.feePayer !== e.signers[0]
              ? `Fee paid by ${e.feePayer}`
              : undefined
          }
        >
          <ShortAddress address={e.signers[0]} isTestnet={isTestnet} />
          {e.signers.length > 1 && (
            <span className="text-body-tertiary fs-10">
              {' '}
              +{e.signers.length - 1}
            </span>
          )}
        </span>
      ) : (
        '—'
      ),
    meta: NOWRAP
  },
  {
    id: 'tx',
    header: '',
    enableSorting: false,
    cell: ({ row: { original: e } }) =>
      e.signature ? (
        <a
          href={explorerTx(e.signature, isTestnet)}
          target="_blank"
          rel="noreferrer"
          className="fs-10"
          title={
            e.instruction ? `${e.instruction} · ${e.signature}` : e.signature
          }
        >
          Tx <FeatherIcon icon="arrow-up-right" size={11} />
        </a>
      ) : null,
    meta: {
      headerProps: { className: 'text-end' },
      cellProps: { className: 'text-end text-nowrap' }
    }
  }
];

/**
 * Validator activity, newest first: vote-account changes (withdrawer,
 * voter and BLS key, identity, commissions, collectors, withdrawals, new
 * vote accounts; since Alpenglow, epoch 1064) and host changes
 * (failovers, migrations, software), from /cluster/activity. Filtered by kind, by validator (name or either key) and by how
 * many epochs back, all in the URL (?kind=&validator=&epochs=).
 */
/** The change filter's group options: every on-chain or every host
 *  change. */
const ONCHAIN = 'onchain';
const INFRA = 'infra';
const matchesKind = (e: ActivityEvent, kind: string) =>
  !kind ||
  (kind === ONCHAIN
    ? !HOST_KINDS.has(e.kind)
    : kind === INFRA
      ? HOST_KINDS.has(e.kind)
      : kind === BLS_FILTER
        ? isBlsChange(e)
        : e.kind === kind);

/** A kind's name in the change filter. */
const kindLabel = (k: string) =>
  k === BLS_FILTER ? 'BLS key' : (CHANGE_KIND[k]?.label ?? k);

const Activity = () => {
  const context = useContext(VortexDataContext);
  const { isTestnet } = useCluster();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? '';
  const validator = params.get('validator') ?? '';
  const epochs = RANGES.includes(Number(params.get('epochs')))
    ? Number(params.get('epochs'))
    : DEFAULT_RANGE;
  const set = (key: string, value: string) =>
    setParams(
      p => {
        const n = new URLSearchParams(p);
        if (value) n.set(key, value);
        else n.delete(key);
        return n;
      },
      { replace: true }
    );

  const slice = context?.clusterActivityState;
  const fetchActivity = slice?.fetchData;
  useEffect(() => {
    fetchActivity?.(epochs);
  }, [fetchActivity, epochs]);
  const data = slice?.data.get(epochs);

  // The picked validator (vote or identity key in the URL), as the
  // directory knows it.
  const dir = context?.validatorDirectoryState;
  const picked = validator
    ? (dir?.byVoteAddress.get(validator) ??
      dir?.byNodeAddress.get(validator) ?? {
        name: null,
        voteAddress: validator,
        nodeAddress: validator
      })
    : null;
  // Its keys, joined (a stable memo dependency).
  const keyList = picked
    ? [validator, picked.voteAddress, picked.nodeAddress].join(' ')
    : '';
  const events = useMemo(() => {
    const keys = keyList ? new Set(keyList.split(' ')) : null;
    return (data?.events ?? []).filter(
      e =>
        !isNoopChange(e) &&
        matchesKind(e, kind) &&
        (!keys || keys.has(e.voteKey ?? '') || keys.has(e.identity ?? ''))
    );
  }, [data, kind, keyList]);
  // Kinds present in the range, for the filter (in the order defined).
  const kinds = useMemo(() => {
    const seen = new Set((data?.events ?? []).map(e => e.kind));
    const out = Object.keys(CHANGE_KIND).filter(k => seen.has(k));
    // BLS key changes (voter events) as an option of their own.
    if ((data?.events ?? []).some(isBlsChange)) out.push(BLS_FILTER);
    return out;
  }, [data]);

  // Failovers paired with their failbacks; hovering one marks its pair.
  const pairs = useMemo(() => pairFailovers(data?.events ?? []), [data]);
  const [hovered, setHovered] = useState<number | null>(null);
  const table = useAdvanceTable({
    columns: useMemo(
      () => columns(isTestnet, pairs, hovered),
      [isTestnet, pairs, hovered]
    ),
    data: events,
    sortable: true,
    pagination: true,
    pageSize: 50,
    getRowId: (e, i) =>
      `${e.signature ?? eventTime(e) ?? i}-${e.kind}-${e.voteKey ?? e.identity ?? ''}`,
    resetPageKey: `${epochs}${kind}`,
    initialState: { sorting: [{ id: 'when', desc: true }] }
  });

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col-auto">
          <h3>Validator Activity</h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Key, commission and collector changes, withdrawals, failovers and
            migrations
          </p>
        </div>
      </div>

      <SectionCard
        title="Activity"
        icon="activity"
        info="Vote-account changes come from the vote program's instructions in successful transactions (a multisig's included), since Alpenglow (epoch 1064): a withdrawer change or a withdrawal is what matters most to delegators. Failovers, migrations and software changes come from each validator's gossip address and version, as our chain-state writer sees them. From is the previous value on record."
      >
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          {/* Pick a validator (suggestions as you type); it shows as a
              chip, x to clear. */}
          {picked ? (
            <span
              className="badge badge-soft badge-soft-primary fs-9 d-inline-flex align-items-center gap-2 py-2"
              style={{ textTransform: 'none' }}
            >
              {picked.name ?? `${validator.slice(0, 4)}…${validator.slice(-4)}`}
              <button
                type="button"
                className="btn btn-link p-0 lh-1 text-reset"
                aria-label="Show every validator"
                onClick={() => set('validator', '')}
              >
                ×
              </button>
            </span>
          ) : (
            <ValidatorSearch
              compact
              placeholder="Filter by validator…"
              onSelect={v => set('validator', v.voteAddress ?? v.nodeAddress)}
            />
          )}
          <Form.Select
            size="sm"
            className="w-auto"
            aria-label="Kind of change"
            value={kind}
            onChange={e => set('kind', e.target.value)}
          >
            <option value="">All changes</option>
            {/* On-chain (vote-account transactions) and infrastructure
                (gossip: hosts and software), each alphabetical. */}
            {[
              ['On-chain', false],
              ['Infrastructure', true]
            ].map(([group, host]) => {
              const shown = (
                kinds.includes(kind) ||
                !kind ||
                kind === ONCHAIN ||
                kind === INFRA
                  ? kinds
                  : [...kinds, kind]
              )
                .filter(k => HOST_KINDS.has(k) === host)
                .sort((x, y) => kindLabel(x).localeCompare(kindLabel(y)));
              return shown.length ? (
                <optgroup key={String(group)} label={String(group)}>
                  <option value={host ? INFRA : ONCHAIN}>
                    All {host ? 'infrastructure' : 'on-chain'}
                  </option>
                  {shown.map(k => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </Form.Select>
          <Form.Select
            size="sm"
            className="w-auto"
            aria-label="Epochs"
            value={epochs}
            onChange={e =>
              set(
                'epochs',
                Number(e.target.value) === DEFAULT_RANGE ? '' : e.target.value
              )
            }
          >
            {RANGES.map(n => (
              <option key={n} value={n}>
                {n === 1 ? 'This epoch' : `Last ${n} epochs`}
              </option>
            ))}
          </Form.Select>
          {data?.startEpoch != null && data.endEpoch != null && (
            <span className="fs-10 text-body-tertiary ms-auto">
              Epochs {data.startEpoch.toLocaleString()}–
              {data.endEpoch.toLocaleString()}
            </span>
          )}
        </div>
        {!data ? (
          slice?.error ? (
            <UntrackedState>
              Validator activity isn&apos;t available right now.
            </UntrackedState>
          ) : (
            <DelayedSpinner loading label="Loading changes…" />
          )
        ) : events.length ? (
          <AdvanceTableProvider {...table}>
            <AdvanceTable<ActivityEvent>
              tableProps={{ size: 'sm', className: 'data-table fs-9 mb-0' }}
              rowProps={e => ({
                onMouseEnter: () => setHovered(pairs.get(e)?.id ?? null),
                onMouseLeave: () => setHovered(null)
              })}
            />
            <AdvanceTableFooter viewAll={false} />
          </AdvanceTableProvider>
        ) : (
          <UntrackedState>
            No{' '}
            {kind ? `${(CHANGE_KIND[kind]?.label ?? kind).toLowerCase()} ` : ''}
            activity
            {picked
              ? ` for ${picked.name ?? `${validator.slice(0, 4)}…${validator.slice(-4)}`}`
              : ''}{' '}
            in the selected range.
          </UntrackedState>
        )}
      </SectionCard>
    </div>
  );
};

export default Activity;
