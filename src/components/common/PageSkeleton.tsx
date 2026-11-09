import ChartSkeleton from 'components/common/ChartSkeleton';
import { Col, Row } from 'react-bootstrap';

const BAR = 'placeholder rounded bg-body-secondary';
// Uneven widths, fixed so they don't jitter on re-render.
const WIDTHS = [92, 78, 86, 70, 88, 74, 82, 66];
// A card's header (a SectionCard's) and padding: what's left is its body.
const CHROME = 72;
// Taller cards than this hold a screen's worth, no more.
const MAX = 1200;

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
  if (kind === 'cta')
    return (
      <div
        className="bg-body-emphasis rounded border border-translucent p-3 h-100 placeholder-glow d-flex flex-column justify-content-center gap-2"
        style={{ minHeight: h }}
        data-skeleton={kind}
      >
        <span className={BAR} style={{ width: '14rem', height: 20 }} />
        <span className={BAR} style={{ width: '24rem', maxWidth: '70%' }} />
      </div>
    );
  return (
    <div
      className="bg-body-emphasis rounded border border-translucent p-3 h-100 d-flex flex-column"
      style={{ minHeight: h }}
      data-skeleton={kind}
    >
      <div className="placeholder-glow mt-n1 mx-n3 px-3 pb-2 mb-3 border-bottom border-translucent">
        <h6 className="mb-0">
          <span className={`${BAR} col-3`} />
        </h6>
      </div>
      {kind === 'chart' ? (
        <ChartSkeleton height={body} />
      ) : kind === 'list' ? (
        // Label / value rows, ~29px apart.
        <LinesSkeleton rows={Math.max(1, Math.floor((body + 8) / 29))} />
      ) : kind === 'block' ? (
        // A map: one solid area.
        <div className="placeholder-glow flex-grow-1 d-flex">
          <span className={`${BAR} w-100`} style={{ minHeight: body }} />
        </div>
      ) : (
        // A data table: its header, then a row every ~29px.
        <TableSkeleton
          inCard
          rows={Math.max(1, Math.floor((body - 28) / 29))}
        />
      )}
    </div>
  );
};

/** A StatCard's stand-in: the same frame and type sizes, so it's as tall. */
const StatSkeleton = ({ sub = 1 }: { sub?: number }) => (
  <div
    className="stat-card rounded border border-translucent bg-body-emphasis px-3 py-2 h-100 placeholder-glow"
    data-skeleton="stat"
  >
    <p className="fs-10 mb-1 mt-0">
      <span className={`${BAR} col-6`} />
    </p>
    <p className="fs-7 fw-bolder mb-0">
      <span className={`${BAR} col-5`} />
    </p>
    {Array.from({ length: sub }, (_, i) => (
      <p key={i} className={`fs-10 mb-0${i ? '' : ' mt-1'}`}>
        <span className={`${BAR} col-${i ? 6 : 8}`} />
      </p>
    ))}
  </div>
);

/** A row of stat cards' stand-ins, laid out as a page's own stat row:
 *  half width on phones, equal shares from md up (as `<Col xs={6} md>`). */
export const StatsSkeleton = ({
  count,
  sub,
  className = 'g-3 mb-3'
}: {
  count: number;
  /** Sublabel lines per card. */
  sub?: number;
  className?: string;
}) => (
  <Row className={className}>
    {Array.from({ length: count }, (_, i) => (
      <Col key={i} xs={6} md>
        <StatSkeleton sub={sub} />
      </Col>
    ))}
  </Row>
);

// A full-bleed table's columns: [flex-grow, placeholder width %].
const TABLE_COLS: Array<[number, number]> = [
  [0.5, 60],
  [2.5, 70],
  [1, 80],
  [1, 70],
  [1, 75],
  [1, 65],
  [1, 70]
];

/** A full-bleed data table's stand-in (the leaderboards'): a header row,
 *  then `rows` rows at the data tables' row height. */
export const TableSkeleton = ({
  rows = 16,
  inCard = false
}: {
  rows?: number;
  /** Inside a card: its padding, and the compact rows of a card's
   *  data table (a short header, ~29px rows). */
  inCard?: boolean;
}) => {
  const row = (header: boolean, i: number) => (
    <div
      key={i}
      className={`d-flex align-items-center gap-3 border-bottom border-translucent${inCard ? '' : ' px-3'}${header ? ' fs-10' : ''}`}
      style={{ height: header ? (inCard ? 28 : 64) : inCard ? 29 : 36 }}
    >
      {TABLE_COLS.map(([grow, w], j) => (
        <div key={j} style={{ flex: `${grow} 1 0` }}>
          <span
            className={BAR}
            style={{
              width: `${header ? 50 : w - ((i * 7 + j * 13) % 25)}%`
            }}
          />
        </div>
      ))}
    </div>
  );
  return (
    <div className="placeholder-glow" aria-busy="true" data-skeleton-table>
      {row(true, 0)}
      {Array.from({ length: rows }, (_, i) => row(false, i + 1))}
    </div>
  );
};

/** The validator pages' tabs, as ValidatorPageHeader draws them (the
 *  labels' rough widths, px). */
const TAB_WIDTHS = [62, 46, 70, 62, 58, 36, 54];

/**
 * A validator page's header while its chunk loads: the title, the search
 * row's place and the tab bar (as ValidatorPageHeader lays them out), then
 * the epoch picker on the consensus tabs - so the tab bar is there from
 * the first frame.
 */
export const ValidatorHeaderSkeleton = ({
  picker = false
}: {
  /** The consensus tabs' epoch picker under the bar. */
  picker?: boolean;
}) => (
  <div className="placeholder-glow" aria-busy="true">
    <div className="validator-title d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
      <h1 className="h3 mb-0">
        <span className={BAR} style={{ width: '12rem', maxWidth: '50vw' }} />
      </h1>
      <div
        className="d-flex align-items-stretch gap-2"
        style={{ width: '30rem', maxWidth: '100%' }}
      >
        <span className={`${BAR} rounded`} style={{ width: 130, height: 38 }} />
        <span className={`${BAR} rounded flex-grow-1`} style={{ height: 38 }} />
      </div>
    </div>
    <div
      className={`mx-n3 px-3 pt-1 border-top border-bottom border-translucent ${picker ? 'mb-0' : 'mb-3'}`}
    >
      <ul className="nav nav-underline fs-9 flex-nowrap overflow-hidden column-gap-2 column-gap-sm-3">
        {TAB_WIDTHS.map((w, i) => (
          <li key={i} className="nav-item">
            <span className="nav-link">
              <span className={BAR} style={{ width: w }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
    {picker && (
      <div className="d-flex justify-content-center gap-2 my-3">
        <span className={BAR} style={{ width: 32, height: 30 }} />
        <span className={BAR} style={{ width: 170, height: 30 }} />
        <span className={BAR} style={{ width: 32, height: 30 }} />
      </div>
    )}
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
  /** lg columns (always full on phones). */
  w?: number;
  /** The loaded card's height, px (capped at a screen's worth). */
  h: number;
  /** chart: bars; table: a data table; list: label / value rows (a
   *  Details card); block: one solid area (a map); cta: a link card (a
   *  title and a line, no header). */
  kind?: 'chart' | 'table' | 'list' | 'block' | 'cta';
};
export type SkeletonRow =
  /** A row of n stat cards, laid out as the page's own (4 and 6 as the
   *  validator tabs', others in equal shares, as `<Col xs={6} md>`). */
  /** sub: the stat cards' sublabel lines (2 where they wrap). */
  | { stats: number; sub?: number }
  | { live: true }
  /** A leaderboard's search / filter / epoch row. */
  | { toolbar: true }
  /** A one-line note above the cards (an info line). */
  | { note: true }
  /** The Status page's live bar (slot, pace, progress). */
  | { liveBar: true }
  /** A full-bleed data table (a leaderboard's), n rows. */
  | { table: number }
  | SkeletonCard[];

/**
 * A page's stand-in while it loads, in its own shape: its rows of stat
 * cards and cards at their loaded widths and heights, pulsing, as the home
 * page does, so the layout is there before the data. The tabs' layouts are
 * in SKELETON below.
 */
const PageSkeleton = ({
  rows,
  header = false,
  headerLines = 0
}: {
  rows: SkeletonRow[];
  /** The page's title too (a page that renders none while it loads). */
  header?: boolean;
  /** Lines of description under the title (a stake pool's). */
  headerLines?: number;
}) => (
  <div aria-busy="true">
    {header && (
      <div className="page-header row g-3">
        <div className="col placeholder-glow">
          <h1 className="h3">
            <span
              className={BAR}
              style={{ width: '18rem', maxWidth: '70vw' }}
            />
          </h1>
          {Array.from({ length: headerLines }, (_, i) => (
            // Its own line under the title (the title block is a flex row).
            <p
              key={i}
              // A third line is a smaller note (a pool's gating line).
              className={`${i < 2 ? 'fs-9' : 'fs-10'} mb-0`}
              style={{ flexBasis: '100%', lineHeight: i < 2 ? undefined : 1.3 }}
            >
              <span
                className={BAR}
                style={{ width: i ? '24rem' : '38rem', maxWidth: '80vw' }}
              />
            </p>
          ))}
        </div>
      </div>
    )}
    <div className="d-flex flex-column gap-3">
      {rows.map((r, i) =>
        'live' in r ? (
          <LiveStripSkeleton key={i} />
        ) : 'note' in r ? (
          <div
            key={i}
            style={{ height: 27 }}
            className="d-flex align-items-center"
          >
            <span className={BAR} style={{ width: '60%' }} />
          </div>
        ) : 'liveBar' in r ? (
          <div
            key={i}
            style={{ height: 44 }}
            className="d-flex flex-column justify-content-between"
          >
            <div className="d-flex justify-content-between">
              <span className={BAR} style={{ width: 160, height: 20 }} />
              <span className={BAR} style={{ width: 120, height: 20 }} />
            </div>
            <span className={`${BAR} w-100`} style={{ height: 6 }} />
          </div>
        ) : 'toolbar' in r ? (
          <div key={i} className="d-flex flex-wrap gap-3 align-items-center">
            <span className={BAR} style={{ width: 300, height: 30 }} />
            <span
              className={`${BAR} ms-auto`}
              style={{ width: 340, height: 30 }}
            />
          </div>
        ) : 'table' in r ? (
          <div
            key={i}
            className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent"
          >
            <TableSkeleton rows={r.table} />
          </div>
        ) : 'stats' in r && r.stats !== 4 && r.stats !== 6 ? (
          <StatsSkeleton key={i} count={r.stats} sub={r.sub} className="g-3" />
        ) : 'stats' in r ? (
          <Row key={i} className="g-3">
            {Array.from({ length: r.stats }, (_, j) => (
              <Col
                key={j}
                xs={6}
                md={r.stats === 6 ? 4 : undefined}
                xl={r.stats === 6 ? 2 : 3}
              >
                <StatSkeleton sub={r.sub} />
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
  </div>
);

const half = (h: number, kind: SkeletonCard['kind'] = 'table') =>
  ({ w: 6, h, kind }) as const;
const full = (h: number, kind: SkeletonCard['kind'] = 'table') =>
  ({ w: 12, h, kind }) as const;

/** Each validator tab's layout, from its loaded cards (desktop). */
export const SKELETON = {
  overview: [
    [half(301, 'list'), half(301, 'list')],
    // Notices (most validators have one).
    [full(98, 'list')],
    { stats: 4 },
    // Voting / Production (the current epoch's row has its upcoming slots).
    [half(403), half(403)],
    [half(303), half(303)]
  ],
  /** Below the live strip and stat cards (shown once its row is in). */
  votingCards: [[full(191, 'chart')], [full(1088)], [full(449)]],
  production: [{ stats: 6 }, [full(621)], [full(939)]],
  network: [
    { stats: 4 },
    [half(330, 'block'), half(330)],
    [half(265), half(265)],
    [full(939)],
    [full(194)]
  ],
  fees: [[full(457)], [full(242)], [full(424, 'chart')]],
  earnings: [{ stats: 4 }, [half(432, 'chart'), half(432)], [half(423)]],
  staking: [
    { stats: 4 },
    // SFDP's card (most staked validators are in it), with its Term row.
    [full(157, 'list')],
    [full(488)],
    [full(495, 'chart')],
    [full(351)],
    [full(364, 'chart')]
  ],
  featureGate: [
    { stats: 3 },
    [half(244, 'list'), half(244)],
    [full(123)],
    [full(182)]
  ],
  featureGates: [{ stats: 4 }, [full(235)], [full(782)]],
  simd: [
    { stats: 3 },
    [
      { w: 5, h: 159, kind: 'list' },
      { w: 7, h: 159, kind: 'table' }
    ],
    [full(182)]
  ],
  simds: [{ stats: 4 }, [full(923)]],
  // A stake pool's: five stat cards, its Fees, the two charts, Epoch
  // Changes (the latest 10), then its Validators.
  pool: [
    { stats: 5, sub: 2 },
    [full(137, 'list')],
    [half(304, 'chart'), half(304, 'chart')],
    [full(525)],
    [full(593)]
  ],
  // Marinade's (mSOL, Native): its stake auction's card above Fees.
  poolMarinade: [
    { stats: 5, sub: 2 },
    [full(90, 'list')],
    [full(160, 'list')],
    [half(304, 'chart'), half(304, 'chart')],
    [full(525)],
    [full(593)]
  ],
  // Marinade Native's: four stat cards and the auction, no Fees.
  poolMarinadeNative: [
    { stats: 4, sub: 2 },
    [full(90, 'list')],
    [half(304, 'chart'), half(304, 'chart')],
    [full(525)],
    [full(593)]
  ],
  // SFDP's: four stat cards (its Validators card has the 100 limit's
  // line), no Fees.
  poolSfdp: [
    { stats: 4, sub: 2 },
    [half(291, 'chart'), half(291, 'chart')],
    [full(525)],
    [full(593)]
  ],
  pools: [{ stats: 3 }, [full(733)]],
  providers: [{ stats: 4 }, [full(451, 'chart')], [full(1283)]],
  // A provider's Locations table follows its places: a typical one's.
  provider: [{ stats: 4 }, [full(451, 'chart')], [full(384)], [full(900)]],
  proposal: [
    { stats: 6, sub: 2 },
    [
      { w: 8, h: 317, kind: 'table' },
      { w: 4, h: 317, kind: 'list' }
    ],
    [full(291, 'chart')],
    [full(480)],
    [full(516)]
  ],
  // Ranked lists with share bars.
  decentralization: [
    [half(359, 'list'), half(359, 'list')],
    [half(359, 'list'), half(359, 'list')],
    [half(217, 'list'), half(217, 'list')],
    [half(342, 'list')]
  ],
  slot: [[half(470), half(470)], [half(314), half(314)], [full(160)]],
  clientVersions: [[half(843), half(843)], [full(569)]],
  blockBuilders: [
    { stats: 4 },
    [full(290, 'chart')],
    [
      { w: 7, h: 339, kind: 'chart' },
      { w: 5, h: 339, kind: 'chart' }
    ],
    [full(350, 'chart')],
    [full(525)],
    [full(364)],
    [full(268, 'list')]
  ],
  status: [
    [full(152)],
    { stats: 4 },
    [
      { w: 7, h: 224, kind: 'table' },
      { w: 5, h: 224, kind: 'block' }
    ],
    [full(408)]
  ],
  leaderboard: [{ stats: 4 }, { toolbar: true }, { table: 16 }],
  producers: [{ stats: 3 }, { toolbar: true }, { table: 16 }],
  validators: [{ stats: 3 }, { toolbar: true }, { table: 24 }],
  // Its Tower note, the Compare card, the past epochs.
  votingLeaderboard: [{ note: true }, [full(85, 'cta')], [full(401)]],
  governance: [{ table: 3 }],
  activity: [[full(1200)]],
  /** A page's chunk still loading: a generic page. */
  page: [{ stats: 4 }, [half(300), half(300)], [full(400)]]
} satisfies Record<string, SkeletonRow[]>;

/** A stake pool page's layout, by its name: SFDP's, Marinade's (with its
 *  auction) or a stake pool's. */
export const poolSkeletonFor = (name: string): SkeletonRow[] =>
  name.toUpperCase() === 'SFDP'
    ? SKELETON.poolSfdp
    : name.toLowerCase() === 'msol'
      ? SKELETON.poolMarinade
      : name.toLowerCase() === 'marinade native'
        ? SKELETON.poolMarinadeNative
        : SKELETON.pool;

export default PageSkeleton;
