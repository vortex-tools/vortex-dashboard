import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import {
  CHANGE_KIND,
  ChangeBadge,
  ShortAddress,
  changeValue,
  whenText
} from 'components/changes/changes';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import FeatherIcon from 'feather-icons-react';
import { explorerTx } from 'helpers/explorer';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useCluster from 'hooks/useCluster';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { VoteAccountChange } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo } from 'react';
import { Form } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router';

/** Epoch ranges offered (the API reads at most 10). */
const RANGES = [1, 3, 10];
const DEFAULT_RANGE = 3;

const NOWRAP = {
  headerProps: { className: 'text-nowrap' },
  cellProps: { className: 'text-nowrap' }
};

const columns = (isTestnet: boolean): ColumnDef<VoteAccountChange>[] => [
  {
    id: 'when',
    header: 'When',
    accessorFn: e => e.slot,
    cell: ({ row: { original: e } }) => (
      <span
        title={
          e.blockTime != null
            ? new Date(e.blockTime * 1000).toLocaleString()
            : undefined
        }
      >
        <span className="font-monospace">{e.epoch.toLocaleString()}</span>
        {e.blockTime != null && (
          <span className="text-body-tertiary fs-10 ms-2">
            {whenText(e.blockTime)}
          </span>
        )}
      </span>
    ),
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
    cell: ({ row: { original: e } }) => <ChangeBadge kind={e.kind} />,
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
            e.kind === 'withdraw' || e.kind === 'create'
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
    cell: ({ row: { original: e } }) => (
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
    ),
    meta: {
      headerProps: { className: 'text-end' },
      cellProps: { className: 'text-end text-nowrap' }
    }
  }
];

/**
 * Every vote account's administrative changes, newest first: withdrawer,
 * voter (and BLS key), identity, commissions, collectors, withdrawals and
 * new vote accounts, since Alpenglow (epoch 1064). Filtered by kind of
 * change, by validator (name or either key) and by how many epochs back,
 * all in the URL (?kind=&validator=&epochs=) so a view can be shared.
 */
const VoteAccountChanges = () => {
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

  const slice = context?.clusterVoteAccountChangesState;
  const fetchData = slice?.fetchData;
  useEffect(() => {
    fetchData?.(epochs);
  }, [fetchData, epochs]);
  const data = slice?.data.get(epochs);

  const events = useMemo(
    () => (data?.events ?? []).filter(e => !kind || e.kind === kind),
    [data, kind]
  );
  // Kinds present in the range, for the filter (in the order defined).
  const kinds = useMemo(() => {
    const seen = new Set((data?.events ?? []).map(e => e.kind));
    return Object.keys(CHANGE_KIND).filter(k => seen.has(k));
  }, [data]);

  const table = useAdvanceTable({
    columns: useMemo(() => columns(isTestnet), [isTestnet]),
    data: events,
    sortable: true,
    pagination: true,
    pageSize: 50,
    getRowId: e => `${e.signature}-${e.kind}-${e.voteKey ?? ''}`,
    resetPageKey: `${epochs}${kind}`,
    initialState: { sorting: [{ id: 'when', desc: true }] }
  });
  // The validator filter is the table's global search.
  const setGlobalFilter = table.setGlobalFilter;
  useEffect(() => {
    setGlobalFilter(validator || undefined);
  }, [setGlobalFilter, validator]);

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col-auto">
          <h3>Vote Account Changes</h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Who changed a vote account&apos;s keys, commission or collectors, or
            withdrew from it
          </p>
        </div>
      </div>

      <SectionCard
        title="Changes"
        icon="key"
        info="From the vote program's instructions in successful transactions (a multisig's included), since Alpenglow (epoch 1064). A withdrawer or a withdrawal is what matters most to delegators: a leaked withdrawer can take the vote account. Voter and identity changes can be rotated in place. From is the previous change on record."
      >
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <SearchBox
            placeholder="Validator name or key"
            defaultValue={validator}
            onChange={e => set('validator', e.target.value)}
          />
          <Form.Select
            size="sm"
            className="w-auto"
            aria-label="Kind of change"
            value={kind}
            onChange={e => set('kind', e.target.value)}
          >
            <option value="">All changes</option>
            {(kinds.includes(kind) || !kind ? kinds : [...kinds, kind]).map(
              k => (
                <option key={k} value={k}>
                  {CHANGE_KIND[k]?.label ?? k}
                </option>
              )
            )}
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
              Vote account changes aren&apos;t available from this API yet.
            </UntrackedState>
          ) : (
            <DelayedSpinner loading label="Loading changes…" />
          )
        ) : events.length ? (
          <AdvanceTableProvider {...table}>
            <AdvanceTable
              tableProps={{ size: 'sm', className: 'data-table fs-9 mb-0' }}
            />
            <AdvanceTableFooter viewAll={false} />
          </AdvanceTableProvider>
        ) : (
          <UntrackedState>
            No {kind ? (CHANGE_KIND[kind]?.label ?? kind).toLowerCase() : ''}{' '}
            changes in this range.
          </UntrackedState>
        )}
      </SectionCard>
    </div>
  );
};

export default VoteAccountChanges;
