import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import SectionCard from 'components/common/SectionCard';
import { MAINNET_ACTIVATION_EPOCH } from 'helpers/alpenglowClient';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext } from 'react';
import { Table } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router';

/** Epochs per page. */
const PAGE = 50;

/**
 * Every epoch (/epoch), newest first, each linking to its page
 * (/epoch/:epoch). Paged in the URL (?before=) so every page of the index
 * is a plain link too. Each row gains its figures (stake, validators,
 * blocks, fees) once the API serves /epochs. Staging only for now.
 */
const Epochs = () => {
  const context = useContext(VortexDataContext);
  const current = context?.currentEpochState.epoch ?? null;
  const [params] = useSearchParams();
  const asked = params.get('before');
  const before =
    current == null
      ? null
      : asked && /^\d+$/.test(asked)
        ? Math.min(Number(asked), current + 1)
        : current + 1;

  const header = (
    <div className="page-header row g-3 align-items-start">
      <div className="col-auto">
        <h1 className="h3">Epochs</h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          Every Solana mainnet epoch, each with its own page
        </p>
      </div>
    </div>
  );
  if (current == null || before == null)
    return (
      <div className="mb-9">
        {header}
        <PageSkeleton rows={SKELETON.epochs} />
      </div>
    );

  const epochs = Array.from(
    { length: Math.min(PAGE, before) },
    (_, i) => before - 1 - i
  );
  const page = Math.floor((current + 1 - before) / PAGE);
  const pages = Math.ceil((current + 1) / PAGE);
  const href = (p: number) =>
    p <= 0 ? '/epoch' : `/epoch?before=${current + 1 - p * PAGE}`;

  return (
    <div className="mb-9">
      {header}
      <SectionCard title="All Epochs" icon="calendar">
        <Table responsive size="sm" className="data-table fs-9 mb-0">
          <thead>
            <tr className="text-nowrap">
              <th>Epoch</th>
              <th>Consensus</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {epochs.map(e => (
              <tr key={e}>
                <td className="fw-semibold">
                  <Link to={`/epoch/${e}`}>Epoch {e}</Link>
                </td>
                <td className="text-body-secondary">
                  {e >= MAINNET_ACTIVATION_EPOCH ? 'Alpenglow' : 'TowerBFT'}
                </td>
                <td className="text-end">
                  {e === current && (
                    <span className="badge badge-soft badge-soft-warning">
                      In progress
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {/* Plain links (not buttons) so every index page can be followed. */}
        <nav
          aria-label="Epoch pages"
          className="d-flex justify-content-between mt-2 fs-9"
        >
          {page > 0 ? <Link to={href(page - 1)}>← Newer</Link> : <span />}
          <span className="text-body-tertiary">
            Page {page + 1} of {pages}
          </span>
          {page < pages - 1 ? (
            <Link to={href(page + 1)}>Older →</Link>
          ) : (
            <span />
          )}
        </nav>
      </SectionCard>
    </div>
  );
};

export default Epochs;
