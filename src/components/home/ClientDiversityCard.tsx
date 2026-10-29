import ReactEChartsCore from 'echarts-for-react/lib/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import SectionCard from 'components/common/SectionCard';
import { useAppContext } from 'providers/AppProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo } from 'react';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/** Epochs charted: the Versions page's default, so the two share a fetch. */
const EPOCHS = 10;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * Client diversity over the last epochs: Agave vs Firedancer as shares of
 * stake, stacked to 100% (the rest - other clients, not in gossip - on
 * top in gray), from /cluster/versions. The epoch in progress is "so far".
 * Nothing until the API has versions (testnet doesn't yet).
 */
const ClientDiversityCard = ({ compact = false }: { compact?: boolean }) => {
  const context = useContext(VortexDataContext);
  const { getThemeColor } = useAppContext();
  const fetchData = context?.clusterVersionsState.fetchData;
  useEffect(() => {
    fetchData?.(EPOCHS);
  }, [fetchData]);
  const data = context?.clusterVersionsState.data.get(EPOCHS);

  const points = useMemo(
    () =>
      (data?.epochs ?? [])
        .filter(e => e.stake > 0)
        .map(e => {
          const of = (family: string) =>
            e.versions
              .filter(v => v.family === family)
              .reduce((a, v) => a + v.stake, 0) / e.stake;
          const agave = of('agave');
          const firedancer = of('firedancer');
          return {
            epoch: e.epoch,
            inProgress: e.inProgress,
            agave,
            firedancer,
            other: Math.max(0, 1 - agave - firedancer)
          };
        }),
    [data]
  );
  if (points.length < 2) return null;

  const primary = getThemeColor('primary');
  const firedancer = 'rgb(26, 153, 131)';
  const area = (
    name: string,
    color: string,
    key: keyof (typeof points)[0]
  ) => ({
    name,
    type: 'line',
    stack: 'clients',
    symbol: 'none',
    smooth: 0.2,
    color,
    lineStyle: { width: 1 },
    areaStyle: { opacity: 0.55 },
    data: points.map(p => p[key] as number)
  });
  const latest = points[points.length - 1];
  const option = {
    animation: false,
    grid: { left: 4, right: 8, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color'), fontSize: 12 },
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const p = points[ps[0]?.dataIndex ?? 0];
        if (!p) return '';
        return (
          `<div class="fw-bold mb-1">Epoch ${p.epoch}${p.inProgress ? ' (so far)' : ''}</div>` +
          `Agave <b>${pct(p.agave)}</b> · Firedancer <b>${pct(p.firedancer)}</b>` +
          (p.other > 0.0005 ? ` · other ${pct(p.other)}` : '')
        );
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map(p => `${p.epoch}${p.inProgress ? '*' : ''}`),
      axisLabel: { color: getThemeColor('tertiary-color'), fontSize: 10 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1,
      interval: 0.25,
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => `${Math.round(v * 100)}%`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: [
      area('Agave', primary, 'agave'),
      area('Firedancer', firedancer, 'firedancer'),
      area('Other', getThemeColor('quaternary-color'), 'other')
    ]
  };
  return (
    <SectionCard
      title="Client Diversity"
      icon="pie-chart"
      linkTo="/client-versions"
      linkLabel="Versions"
      info="Agave and Firedancer as shares of stake, epoch by epoch (* = so far). Agave includes its block-building forks (Jito, BAM, Harmonic, ...), Firedancer its own."
    >
      <div className="d-flex gap-3 fs-10 text-body-tertiary mb-1">
        <span className="d-inline-flex align-items-center gap-1">
          <span
            className="d-inline-block rounded-1"
            style={{ width: 10, height: 10, background: primary }}
          />
          Agave {pct(latest.agave)}
        </span>
        <span className="d-inline-flex align-items-center gap-1">
          <span
            className="d-inline-block rounded-1"
            style={{ width: 10, height: 10, background: firedancer }}
          />
          Firedancer {pct(latest.firedancer)}
        </span>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        style={{ height: compact ? 125 : 160, width: '100%' }}
      />
    </SectionCard>
  );
};

export default ClientDiversityCard;
