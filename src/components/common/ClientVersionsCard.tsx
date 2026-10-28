import ReactEChartsCore from 'echarts-for-react/lib/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import { useAppContext } from 'providers/AppProvider';
import {
  VALIDATOR_STATUS_SUMMARY_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import useCluster from 'hooks/useCluster';
import useConsensus from 'hooks/useConsensus';
import { ClusterVersions, VersionsTimeline } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Col, Form, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer
]);

const EPOCHS = 10;
/** Epochs of hourly points (/cluster/versions/timeline). */
const TIMELINE_EPOCHS = 3;
/** Versions charted by name per client (the rest are grouped by side of
 *  the target). */
const NAMED = 6;
/** A version is named once it held this share of its client's stake. */
const NAMED_MIN = 0.02;
/** The default target: the newest release holding at least this share. */
const TARGET_MIN = 0.05;
const BEHIND_FIRST = 8;

/** Frankendancer reached end of life with Alpenglow; it's left out. */
const FAMILIES = [
  { key: 'agave', label: 'Agave' },
  { key: 'firedancer', label: 'Firedancer' }
] as const;

// At or above the target: greens, newest darkest. Below: amber to red,
// oldest reddest.
const AHEAD = ['#1a7f37', '#25b003', '#5cc93a', '#8fd877', '#b9e6a8'];
const BEHIND = ['#e5a00b', '#e5780b', '#d9542b', '#c0392b', '#962d22'];
const AHEAD_OTHER = '#cfeec4';
const BEHIND_OTHER = '#f3c9a6';

type Semver = [number, number, number, string | null];
const parse = (v: string): Semver | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v);
  return m ? [+m[1], +m[2], +m[3], m[4] ?? null] : null;
};
/** Version order: a pre-release (4.4.0-rc.0) comes before its release;
 *  an unparseable version first of all. */
const cmp = (a: string, b: string) => {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0) || a.localeCompare(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return +x[i]! - +y[i]!;
  if (x[3] === y[3]) return 0;
  if (x[3] == null) return 1;
  if (y[3] == null) return -1;
  return x[3].localeCompare(y[3], undefined, { numeric: true });
};
const isRelease = (v: string) => parse(v)?.[3] === null;

const pct = (share: number) =>
  share > 0 && share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`;

type Epoch = ClusterVersions['epochs'][number];

/** One client's stake by version (flavors merged) per epoch; null for an
 *  epoch with none of it recorded. */
const byVersion = (epochs: Epoch[], family: string) => {
  const per = epochs.map(e => {
    const m = new Map<string, { stake: number; validators: number }>();
    for (const v of e.versions) {
      if (v.family !== family || !v.version) continue;
      const cur = m.get(v.version) ?? { stake: 0, validators: 0 };
      cur.stake += v.stake;
      cur.validators += v.validators;
      m.set(v.version, cur);
    }
    const stake = [...m.values()].reduce((a, v) => a + v.stake, 0);
    return { m, stake, share: e.stake ? stake / e.stake : 0 };
  });
  return per.map(p => (p.stake ? p : null));
};

interface PanelProps {
  family: (typeof FAMILIES)[number];
  epochs: Epoch[];
  picked: number;
  onPick: (epoch: number) => void;
  /** Validators now running this client: identity, name, version, stake. */
  running: {
    identity: string;
    name: string | null;
    version: string;
    stake: number;
  }[];
  /** Hourly points over the last epochs, or null (not served yet). */
  timeline: VersionsTimeline['points'] | null;
}

const FamilyPanel = ({
  family,
  epochs,
  picked,
  onPick,
  running,
  timeline
}: PanelProps) => {
  const { getThemeColor } = useAppContext();
  const per = useMemo(() => byVersion(epochs, family.key), [epochs, family]);
  const latest = [...per].reverse().find(Boolean) ?? null;

  const releases = useMemo(() => {
    const all = new Set(per.flatMap(p => (p ? [...p.m.keys()] : [])));
    return [...all].filter(isRelease).sort((a, b) => cmp(b, a));
  }, [per]);
  const defaultTarget = useMemo(() => {
    if (!latest) return null;
    return (
      releases.find(
        v => (latest.m.get(v)?.stake ?? 0) / latest.stake >= TARGET_MIN
      ) ??
      releases[0] ??
      null
    );
  }, [latest, releases]);
  const [chosen, setChosen] = useState<string | null>(null);
  const target = chosen ?? defaultTarget;
  const [allBehind, setAllBehind] = useState(false);

  const chart = useMemo(() => {
    if (!target) return null;
    const peak = new Map<string, number>();
    for (const p of per)
      if (p)
        for (const [v, x] of p.m)
          peak.set(v, Math.max(peak.get(v) ?? 0, x.stake / p.stake));
    const named = [...peak.entries()]
      .filter(([, s]) => s >= NAMED_MIN)
      .sort((a, b) => b[1] - a[1])
      .slice(0, NAMED)
      .map(([v]) => v)
      .sort((a, b) => cmp(b, a));
    const ahead = named.filter(v => cmp(v, target) >= 0);
    const behind = named.filter(v => cmp(v, target) < 0);
    const share = (pick: (v: string) => boolean) =>
      per.map(p => {
        if (!p) return null;
        let s = 0;
        for (const [v, x] of p.m) if (pick(v)) s += x.stake;
        return s / p.stake;
      });
    // Stacked from the bottom: newest first, so the at-or-above-target
    // part fills up from 0 as the client upgrades.
    const series = [
      ...ahead.map((v, i) => ({
        name: v,
        color: AHEAD[Math.min(i, AHEAD.length - 1)],
        data: share(x => x === v)
      })),
      {
        name: `Other ≥ ${target}`,
        color: AHEAD_OTHER,
        data: share(x => cmp(x, target) >= 0 && !named.includes(x))
      },
      ...behind.map((v, i) => ({
        name: v,
        color: BEHIND[Math.min(i, BEHIND.length - 1)],
        data: share(x => x === v)
      })),
      {
        name: `Other < ${target}`,
        color: BEHIND_OTHER,
        data: share(x => cmp(x, target) < 0 && !named.includes(x))
      }
    ].filter(s => s.data.some(v => (v ?? 0) > 0));
    return { series, atOrAbove: share(x => cmp(x, target) >= 0) };
  }, [per, target]);

  // The at-or-above-target share of this client's stake, hourly.
  const hourly = useMemo(() => {
    if (!timeline?.length || !target) return null;
    const pts: [number, number][] = [];
    const starts: { t: number; epoch: number }[] = [];
    for (const p of timeline) {
      let all = 0;
      let ok = 0;
      for (const v of p.versions) {
        if (v.family !== family.key || !v.version) continue;
        all += v.stake;
        if (cmp(v.version, target) >= 0) ok += v.stake;
      }
      if (!all) continue;
      if (starts[starts.length - 1]?.epoch !== p.epoch)
        starts.push({ t: p.t * 1000, epoch: p.epoch });
      pts.push([p.t * 1000, ok / all]);
    }
    return pts.length > 1 ? { pts, starts } : null;
  }, [timeline, target, family]);

  if (!latest || !target || !chart) return null;
  const pickedIdx = Math.max(
    0,
    epochs.findIndex(e => e.epoch === picked)
  );
  const nowShare = chart.atOrAbove[pickedIdx];
  const prevShare = chart.atOrAbove
    .slice(0, pickedIdx)
    .reverse()
    .find(v => v != null);
  const pickedPer = per[pickedIdx];
  const upgradedValidators = pickedPer
    ? [...pickedPer.m.entries()]
        .filter(([v]) => cmp(v, target) >= 0)
        .reduce((a, [, x]) => a + x.validators, 0)
    : 0;
  const totalValidators = pickedPer
    ? [...pickedPer.m.values()].reduce((a, x) => a + x.validators, 0)
    : 0;
  const behind = running
    .filter(r => cmp(r.version, target) < 0)
    .sort((a, b) => b.stake - a.stake);
  const runningStake = running.reduce((a, r) => a + r.stake, 0);

  const option = {
    animation: false,
    grid: { left: 4, right: 8, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      valueFormatter: (v: number | null) =>
        v == null ? 'not recorded' : pct(v)
    },
    xAxis: {
      type: 'category',
      data: epochs.map(e => (e.inProgress ? `${e.epoch}*` : String(e.epoch))),
      axisTick: { show: false },
      axisLabel: { color: getThemeColor('tertiary-color'), fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      max: 1,
      interval: 0.25,
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => `${Math.round(v * 100)}%`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: chart.series.map(s => ({
      name: s.name,
      type: 'bar',
      stack: family.key,
      barMaxWidth: 32,
      color: s.color,
      data: s.data.map((v, i) => ({
        value: v,
        itemStyle: i === pickedIdx ? undefined : { opacity: 0.6 }
      }))
    }))
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
        <h6 className="mb-0">{family.label}</h6>
        <Form.Select
          size="sm"
          className="w-auto"
          aria-label={`${family.label} target version`}
          value={target}
          onChange={e => setChosen(e.target.value)}
        >
          {releases.map(v => (
            <option key={v} value={v}>
              ≥ {v}
            </option>
          ))}
        </Form.Select>
      </div>
      <p className="mb-2">
        {nowShare == null ? (
          <span className="fs-9 text-body-tertiary">
            Epoch {picked.toLocaleString()} isn&apos;t recorded for{' '}
            {family.label}.
          </span>
        ) : (
          <>
            <span className="fs-5 fw-bold">{pct(nowShare)}</span>
            <span className="fs-9 text-body-tertiary">
              {' '}
              of {family.label} stake on {target} or newer ·{' '}
              {upgradedValidators.toLocaleString()} of{' '}
              {totalValidators.toLocaleString()} validators
              {prevShare != null &&
                Math.abs(nowShare - prevShare) >= 0.001 &&
                ` · ${nowShare > prevShare ? '+' : '−'}${pct(Math.abs(nowShare - prevShare))} on the epoch before`}
            </span>
          </>
        )}
      </p>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        style={{ height: 200, width: '100%' }}
        onEvents={{
          click: (p: { dataIndex: number }) => {
            const e = epochs[p.dataIndex];
            if (e) onPick(e.epoch);
          }
        }}
      />
      <div className="d-flex flex-wrap gap-2 fs-10 text-body-secondary mt-1 mb-3">
        {chart.series.map(s => (
          <span key={s.name} className="text-nowrap">
            <span
              className="d-inline-block rounded-1 me-1 align-middle"
              style={{ width: 9, height: 9, background: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
      {hourly && (
        <>
          <h6 className="fs-10 text-uppercase text-body-tertiary mb-1">
            On {target} or newer, hourly
          </h6>
          <ReactEChartsCore
            echarts={echarts}
            notMerge
            style={{ height: 130, width: '100%' }}
            className="mb-3"
            option={{
              animation: false,
              grid: {
                left: 4,
                right: 8,
                top: 16,
                bottom: 4,
                containLabel: true
              },
              tooltip: {
                trigger: 'axis',
                backgroundColor: getThemeColor('body-highlight-bg'),
                borderColor: getThemeColor('border-color'),
                textStyle: { color: getThemeColor('body-color') },
                valueFormatter: (v: number) => pct(v)
              },
              xAxis: {
                type: 'time',
                axisLabel: {
                  color: getThemeColor('tertiary-color'),
                  fontSize: 10,
                  hideOverlap: true
                },
                splitLine: { show: false }
              },
              yAxis: {
                type: 'value',
                max: 1,
                // Zoomed to the range it moved in, so a late rollout's
                // last few percent still show.
                min: (v: { min: number }) =>
                  Math.max(0, Math.floor(v.min * 10) / 10 - 0.05),
                axisLabel: {
                  color: getThemeColor('tertiary-color'),
                  fontSize: 10,
                  formatter: (v: number) => `${Math.round(v * 100)}%`
                },
                splitLine: {
                  lineStyle: { color: getThemeColor('border-color') }
                }
              },
              series: [
                {
                  name: `≥ ${target}`,
                  type: 'line',
                  step: 'end',
                  symbol: 'none',
                  color: AHEAD[0],
                  areaStyle: { opacity: 0.15 },
                  data: hourly.pts,
                  markLine: {
                    silent: true,
                    symbol: 'none',
                    lineStyle: {
                      color: getThemeColor('tertiary-color'),
                      type: 'dashed',
                      width: 1
                    },
                    label: {
                      formatter: (p: { name?: string }) => p.name ?? '',
                      position: 'insideEndTop',
                      fontSize: 9,
                      color: getThemeColor('tertiary-color')
                    },
                    data: hourly.starts
                      .slice(1)
                      .map(st => ({ xAxis: st.t, name: String(st.epoch) }))
                  }
                }
              ]
            }}
          />
        </>
      )}
      <h6 className="fs-10 text-uppercase text-body-tertiary mb-2">
        Still before {target}
        {behind.length > 0 && runningStake > 0 && (
          <span className="text-body-quaternary">
            {' '}
            · {behind.length} validators,{' '}
            {pct(behind.reduce((a, r) => a + r.stake, 0) / runningStake)} of{' '}
            {family.label} stake now
          </span>
        )}
      </h6>
      {behind.length ? (
        <>
          <Table size="sm" className="data-table compact-rows fs-9 mb-0">
            <tbody>
              {(allBehind ? behind : behind.slice(0, BEHIND_FIRST)).map(r => (
                <tr key={r.identity}>
                  <td
                    className="text-nowrap text-truncate"
                    style={{ maxWidth: '14rem' }}
                  >
                    <Link to={`/validator/${r.identity}`}>
                      {r.name ??
                        `${r.identity.slice(0, 6)}…${r.identity.slice(-6)}`}
                    </Link>
                  </td>
                  <td className="font-monospace text-body-secondary">
                    {r.version}
                  </td>
                  <td className="text-end font-monospace">
                    {runningStake ? pct(r.stake / runningStake) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {behind.length > BEHIND_FIRST && (
            <button
              type="button"
              className="btn btn-link p-0 fs-10 mt-2"
              onClick={() => setAllBehind(a => !a)}
            >
              {allBehind ? 'Show fewer' : `Show all ${behind.length}`}
            </button>
          )}
        </>
      ) : running.length ? (
        <p className="fs-9 text-body-tertiary mb-0">
          Every {family.label} validator is on {target} or newer.
        </p>
      ) : (
        <UntrackedState>Loading validators…</UntrackedState>
      )}
    </div>
  );
};

/**
 * Client upgrade progress (/cluster/versions): for Agave and Firedancer
 * each, the share of that client's stake on each version per epoch -
 * flavors (Jito, BAM, Harmonic, ...) merged into the version they're
 * built on - against a target version, with who is still before it now
 * (from /validators/status/summary). Below, the picked epoch's upgrades
 * and downgrades by stake.
 */
const ClientVersionsCard = () => {
  const context = useContext(VortexDataContext);
  const fetchData = context?.clusterVersionsState.fetchData;
  const data = context?.clusterVersionsState.data.get(EPOCHS);
  const fetchSummary = context?.validatorStatusSummaryState.fetchData;
  const summary = context?.validatorStatusSummaryState.data.get(
    VALIDATOR_STATUS_SUMMARY_KEY
  );
  useEffect(() => {
    fetchData?.(EPOCHS);
    fetchSummary?.(VALIDATOR_STATUS_SUMMARY_KEY);
  }, [fetchData, fetchSummary]);
  const fetchTimeline = context?.versionsTimelineState.fetchData;
  const timeline =
    context?.versionsTimelineState.data.get(TIMELINE_EPOCHS)?.points ?? null;
  useEffect(() => {
    fetchTimeline?.(TIMELINE_EPOCHS);
  }, [fetchTimeline]);
  const { isTestnet } = useCluster();
  const { cutoverEpoch } = useConsensus();
  const [picked, setPicked] = useState<number | null>(null);

  const running = useMemo(() => {
    const out = new Map<string, PanelProps['running']>();
    for (const v of summary?.validators ?? []) {
      const f = v.software?.family;
      const version = v.software?.version;
      if (!f || !version || v.delinquent) continue;
      if (!out.has(f)) out.set(f, []);
      out.get(f)!.push({
        identity: v.identity,
        name: v.name,
        version,
        stake: v.activatedStake
      });
    }
    return out;
  }, [summary]);

  if (!data)
    return (
      <SectionCard title="Client Upgrades" icon="git-branch">
        <UntrackedState>
          {context?.clusterVersionsState.error
            ? "This cluster's API doesn't serve client versions yet."
            : 'Loading versions…'}
        </UntrackedState>
      </SectionCard>
    );
  const epochs = data.epochs;
  const epoch =
    epochs.find(e => e.epoch === picked) ?? epochs[epochs.length - 1];
  if (!epoch) return null;

  const changes = epoch.changes.filter(
    c => c.kind === 'upgrade' || c.kind === 'downgrade'
  );

  return (
    <SectionCard
      title="Client Upgrades"
      icon="git-branch"
      info="Each client's stake by version per epoch, against a target you can change (* = so far). Click an epoch for its upgrades."
    >
      <Row className="g-4">
        {FAMILIES.map(f => (
          <Col key={f.key} xs={12} lg={6}>
            <FamilyPanel
              family={f}
              epochs={epochs}
              picked={epoch.epoch}
              onPick={setPicked}
              running={running.get(f.key) ?? []}
              timeline={timeline}
            />
          </Col>
        ))}
      </Row>
      {!isTestnet &&
        cutoverEpoch != null &&
        epochs.some(e => e.epoch === cutoverEpoch - 1) && (
          <p className="fs-10 text-body-tertiary mt-3 mb-0">
            Epoch {(cutoverEpoch - 1).toLocaleString()}, the last before
            Alpenglow: Firedancer couldn&apos;t cross the cutover, so its
            validators ran Agave for that epoch and switched back after.
          </p>
        )}

      <h6 className="fs-10 text-uppercase text-body-tertiary mt-4 mb-2">
        Upgrades in epoch {epoch.epoch.toLocaleString()}
        {epoch.inProgress && ' (so far)'}
      </h6>
      {changes.length ? (
        <Table
          size="sm"
          responsive
          className="data-table compact-rows fs-9 mb-0"
        >
          <thead>
            <tr>
              <th>Validator</th>
              <th>Change</th>
              <th className="text-end">Stake</th>
              {epoch.inProgress && <th className="text-end">When</th>}
            </tr>
          </thead>
          <tbody>
            {changes.map(c => (
              <tr key={`${c.identity}-${c.kind}`}>
                <td className="text-nowrap">
                  <Link to={`/validator/${c.identity}`}>
                    {c.name ??
                      `${c.identity.slice(0, 6)}…${c.identity.slice(-6)}`}
                  </Link>
                </td>
                <td className="text-nowrap">
                  <span
                    className={`badge badge-soft me-2 badge-soft-${c.kind === 'upgrade' ? 'success' : 'warning'}`}
                  >
                    {c.kind}
                  </span>
                  <span className="font-monospace">
                    {c.from.version ?? '?'} → {c.to.version ?? '?'}
                  </span>
                </td>
                <td className="text-end font-monospace">
                  {epoch.stake ? pct(c.stake / epoch.stake) : '—'}
                </td>
                {epoch.inProgress && (
                  <td
                    className="text-end text-body-tertiary text-nowrap"
                    title={
                      c.observedAt
                        ? new Date(c.observedAt * 1000).toUTCString()
                        : undefined
                    }
                  >
                    {c.observedAt ? ago(c.observedAt) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="fs-9 text-body-tertiary mb-0">
          No upgrades or downgrades recorded in this epoch.
        </p>
      )}
    </SectionCard>
  );
};

const ago = (unixS: number) => {
  const s = Math.max(0, Date.now() / 1000 - unixS);
  return s < 3600
    ? `${Math.max(1, Math.round(s / 60))}min ago`
    : s < 86400
      ? `${Math.round(s / 3600)}h ago`
      : `${Math.round(s / 86400)}d ago`;
};

export default ClientVersionsCard;
