import ChartSkeleton from 'components/common/ChartSkeleton';
import { Col, Row } from 'react-bootstrap';

/** A table's rows' stand-in, for inside a card that's already there. */
export const LinesSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="placeholder-glow d-flex flex-column gap-2" aria-busy="true">
    {Array.from({ length: rows }, (_, i) => (
      <span
        key={i}
        className="placeholder rounded bg-body-secondary"
        // Uneven widths, fixed so they don't jitter on re-render.
        style={{ width: `${[92, 78, 86, 70, 88, 74, 82, 66][i % 8]}%` }}
      />
    ))}
  </div>
);

/** A card's stand-in while its data loads, as the home page's: the
 *  outline, a title bar, and a chart's silhouette or a table's rows. */
export const CardSkeleton = ({
  kind = 'chart',
  height = 150,
  rows = 6
}: {
  kind?: 'chart' | 'table';
  height?: number;
  rows?: number;
}) => (
  <div className="bg-body-emphasis rounded border border-translucent p-3 h-100">
    <div className="placeholder-glow mb-3">
      <span className="placeholder col-4 rounded bg-body-secondary" />
    </div>
    {kind === 'chart' ? (
      <ChartSkeleton height={height} />
    ) : (
      <LinesSkeleton rows={rows} />
    )}
  </div>
);

/** A stat card's stand-in: a label, a figure and a sublabel line. */
const StatSkeleton = () => (
  <div className="bg-body-emphasis rounded border border-translucent p-3 h-100 placeholder-glow">
    <div className="mb-2">
      <span className="placeholder col-5 rounded bg-body-secondary" />
    </div>
    <div className="mb-2">
      <span
        className="placeholder col-4 rounded bg-body-secondary"
        style={{ height: '1.6rem' }}
      />
    </div>
    <span className="placeholder col-7 rounded bg-body-secondary" />
  </div>
);

/** A live slot strip's stand-in: its label, the grid of slots and the
 *  legend line, at the strip's height. */
export const LiveStripSkeleton = () => (
  <div className="bg-body-emphasis rounded border border-translucent p-3 placeholder-glow">
    <div className="mb-2">
      <span className="placeholder col-2 rounded bg-body-secondary" />
    </div>
    <span
      className="placeholder w-100 rounded bg-body-secondary mb-2"
      style={{ height: 46 }}
    />
    <span className="placeholder col-5 rounded bg-body-secondary" />
  </div>
);

/**
 * A page's stand-in while it loads, in its own shape: a row of stat cards,
 * then its cards - half width side by side, or full - pulsing, as the home
 * page does, so the layout is there before the data.
 */
const PageSkeleton = ({
  live = false,
  stats = 4,
  cards = ['half', 'half', 'full']
}: {
  /** A live slot strip first (the Voting tab's current epoch). */
  live?: boolean;
  stats?: number;
  cards?: Array<'half' | 'full' | 'table'>;
}) => (
  <div className="d-flex flex-column gap-3" aria-busy="true">
    {live && <LiveStripSkeleton />}
    {stats > 0 && (
      <Row className="g-3">
        {Array.from({ length: stats }, (_, i) => (
          <Col
            key={i}
            xs={6}
            md={stats > 4 ? 4 : 3}
            xl={stats > 4 ? 12 / Math.min(stats, 6) : 3}
          >
            <StatSkeleton />
          </Col>
        ))}
      </Row>
    )}
    <Row className="g-3">
      {cards.map((c, i) => (
        <Col key={i} xs={12} lg={c === 'half' ? 6 : 12}>
          <CardSkeleton kind={c === 'table' ? 'table' : 'chart'} />
        </Col>
      ))}
    </Row>
  </div>
);

export default PageSkeleton;
