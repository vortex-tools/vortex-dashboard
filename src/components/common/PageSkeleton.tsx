import ChartSkeleton from 'components/common/ChartSkeleton';
import { Col, Row } from 'react-bootstrap';

const BAR = 'placeholder rounded bg-body-secondary';
// Uneven widths, fixed so they don't jitter on re-render.
const WIDTHS = [92, 78, 86, 70, 88, 74, 82, 66];
// A card's header (a SectionCard's) and padding: what's left is its body.
const CHROME = 72;
// Taller cards than this hold a screen's worth, no more.
const MAX = 640;

/** A table's rows' stand-in, for inside a card that's already there. */
export const LinesSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="placeholder-glow d-flex flex-column gap-2" aria-busy="true">
    {Array.from({ length: rows }, (_, i) => (
      <span
        key={i}
        className={BAR}
        style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }}
      />
    ))}
  </div>
);

/** A SectionCard's stand-in at its loaded height: its header (a title
 *  bar over the rule), then a chart's bars or a table's rows. */
export const CardSkeleton = ({
  kind = 'chart',
  height = 300
}: {
  kind?: SkeletonCard['kind'];
  height?: number;
}) => {
  const h = Math.min(height, MAX);
  const body = Math.max(h - CHROME, 40);
  return (
    <div
      className="bg-body-emphasis rounded border border-translucent p-3 h-100 d-flex flex-column"
      style={{ minHeight: h }}
    >
      <div className="placeholder-glow mt-n1 mx-n3 px-3 pb-2 mb-3 border-bottom border-translucent">
        <h6 className="mb-0">
          <span className={`${BAR} col-3`} />
        </h6>
      </div>
      {kind === 'chart' ? (
        <ChartSkeleton height={body} />
      ) : kind === 'block' ? (
        // A map: one solid area.
        <div className="placeholder-glow flex-grow-1 d-flex">
          <span className={`${BAR} w-100`} style={{ minHeight: body }} />
        </div>
      ) : (
        // A row every ~28px, as the data tables' compact rows.
        <LinesSkeleton rows={Math.max(2, Math.floor(body / 28))} />
      )}
    </div>
  );
};

/** A StatCard's stand-in: the same frame and type sizes, so it's as tall. */
const StatSkeleton = () => (
  <div className="stat-card rounded border border-translucent bg-body-emphasis px-3 py-2 h-100 placeholder-glow">
    <p className="fs-10 mb-1 mt-0">
      <span className={`${BAR} col-6`} />
    </p>
    <p className="fs-7 fw-bolder mb-0">
      <span className={`${BAR} col-5`} />
    </p>
    <p className="fs-10 mb-0 mt-1">
      <span className={`${BAR} col-8`} />
    </p>
  </div>
);

/** A live slot strip's stand-in: its label, the grid of slots and the
 *  legend line, at the strip's height. */
export const LiveStripSkeleton = () => (
  <div
    className="bg-body-emphasis rounded border border-translucent p-3 placeholder-glow d-flex flex-column"
    style={{ height: 143 }}
  >
    <div className="mb-2">
      <span className={`${BAR} col-2`} />
    </div>
    <span className={`${BAR} w-100 mb-2 flex-grow-1`} />
    <span className={`${BAR} col-5`} />
  </div>
);

export type SkeletonCard = {
  /** lg columns: half or full width (always full on phones). */
  w?: 6 | 12;
  /** The loaded card's height, px (capped at a screen's worth). */
  h: number;
  kind?: 'chart' | 'table' | 'block';
};
export type SkeletonRow =
  /** A row of n stat cards, laid out as the tab's own. */
  { stats: 4 | 6 } | { live: true } | SkeletonCard[];

/**
 * A page's stand-in while it loads, in its own shape: its rows of stat
 * cards and cards at their loaded widths and heights, pulsing, as the home
 * page does, so the layout is there before the data. The tabs' layouts are
 * in SKELETON below.
 */
const PageSkeleton = ({ rows }: { rows: SkeletonRow[] }) => (
  <div className="d-flex flex-column gap-3" aria-busy="true">
    {rows.map((r, i) =>
      'live' in r ? (
        <LiveStripSkeleton key={i} />
      ) : 'stats' in r ? (
        <Row key={i} className="g-3">
          {Array.from({ length: r.stats }, (_, j) => (
            <Col
              key={j}
              xs={6}
              md={r.stats === 6 ? 4 : undefined}
              xl={r.stats === 6 ? 2 : 3}
            >
              <StatSkeleton />
            </Col>
          ))}
        </Row>
      ) : (
        <Row key={i} className="g-3">
          {r.map((c, j) => (
            <Col key={j} xs={12} lg={c.w ?? 12}>
              <CardSkeleton kind={c.kind} height={c.h} />
            </Col>
          ))}
        </Row>
      )
    )}
  </div>
);

const half = (h: number, kind: SkeletonCard['kind'] = 'table') =>
  ({ w: 6, h, kind }) as const;
const full = (h: number, kind: SkeletonCard['kind'] = 'table') =>
  ({ w: 12, h, kind }) as const;

/** Each validator tab's layout, from its loaded cards (desktop). */
export const SKELETON = {
  overview: [
    [half(301), half(301)],
    { stats: 4 },
    [half(388), half(388)],
    [half(303), half(303)]
  ],
  /** Below the live strip and stat cards (shown once its row is in). */
  votingCards: [[full(191, 'chart')], [full(1088)], [full(449)]],
  production: [{ stats: 6 }, [full(467)], [full(939)]],
  productionCards: [[full(467)], [full(939)]],
  network: [
    { stats: 4 },
    [half(330, 'block'), half(330)],
    [half(265), half(265)],
    [full(939)],
    [full(194)]
  ],
  fees: [[full(457, 'chart')], [full(242)], [full(424, 'chart')]],
  staking: [
    [full(488)],
    [full(495, 'chart')],
    [full(351)],
    [full(364, 'chart')]
  ]
} satisfies Record<string, SkeletonRow[]>;

export default PageSkeleton;
