import React, { useContext, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { useAppContext } from 'providers/AppProvider';
import {
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { ThemeVariant } from 'config';
import { namedTooltipList } from 'helpers/echart-utils';
import { ButtonGroup, ToggleButton } from 'react-bootstrap';

echarts.use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LineChart,
  CanvasRenderer,
  LegendComponent
]);

type YAxisData = {
  name: string;
  data: (number | null)[];
};

type Mode = 'capture' | 'total' | 'fees' | 'tips';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'capture', label: 'Capture' },
  { value: 'total', label: 'Fees + Tips' },
  { value: 'fees', label: 'Fees' },
  { value: 'tips', label: 'Tips' }
];

const getDefaultOptions = (
  theme: ThemeVariant,
  xAxisData: number[],
  yAxisDataList: YAxisData[],
  getThemeColor: (name: string) => string,
  /** Values are capture ratios ("1.08×"), not SOL. */
  ratio = false
) => ({
  // The validator in the palette color, the cluster a muted dashed line.
  color: [getThemeColor('primary'), getThemeColor('quaternary-color')],
  tooltip: {
    trigger: 'axis',
    padding: 10,
    backgroundColor: getThemeColor('body-highlight-bg'),
    borderColor: getThemeColor('border-color'),
    textStyle: { color: getThemeColor('light-text-emphasis') },
    borderWidth: 1,
    transitionDuration: 0,
    axisPointer: {
      type: 'none'
    },
    formatter: (params: any) =>
      namedTooltipList(params, (value: any) =>
        value == null
          ? '—'
          : ratio
            ? `${value.toFixed(2)}×`
            : `◎${value.toFixed(4)}`
      )
  },
  xAxis: [
    {
      type: 'category',
      data: xAxisData,
      axisLabel: {
        show: false,
        color: getThemeColor('secondary-color'),
        align: 'left',
        fontFamily: 'Nunito Sans',
        fontWeight: 600,
        fontSize: 12.8
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: getThemeColor('secondary-bg')
        }
      },
      axisTick: {
        show: false
      },
      splitLine: { show: false },
      boundaryGap: false
    },
    {
      type: 'category',
      position: 'bottom',
      data: xAxisData,
      axisLabel: {
        showMaxLabel: true,
        showMinLabel: false,
        color: getThemeColor('secondary-color'),
        fontFamily: 'Nunito Sans',
        fontWeight: 600,
        fontSize: 12.8
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: false
      },
      boundaryGap: false
    }
  ],
  yAxis: {
    // Ratios sit near 1.0x: zoom to them.
    scale: ratio,
    position: 'right',
    axisPointer: { type: 'none' },
    axisTick: 'none',
    axisLine: { show: false },
    axisLabel: {
      color: getThemeColor('tertiary-color'),
      formatter: (v: number) => (ratio ? `${v}×` : `◎${v}`)
    },
    splitLine: {
      lineStyle: {
        color:
          theme === 'dark'
            ? getThemeColor('body-highlight-bg')
            : getThemeColor('secondary-bg')
      }
    }
  },
  series: yAxisDataList.map(({ name, data }, i) => ({
    name,
    type: 'line',
    data,
    lineStyle: i === 1 ? { type: 'dashed', width: 1.5 } : { width: 2 },
    showSymbol: false,
    symbol: 'circle'
  })),
  grid: {
    right: 2,
    left: 5,
    bottom: 4,
    top: 8,
    containLabel: true
  },
  animation: false
});

const BlockIncomeChart = ({ nodeAddress }: { nodeAddress: string }) => {
  const {
    config: { theme },
    getThemeColor
  } = useAppContext();
  const context = useContext(VortexDataContext);
  // Capture leads once the API serves it (vortex-data c331b78).
  const [picked, setMode] = useState<Mode | null>(null);

  if (!context) return <div>Loading...</div>;

  const { epochIncomeState } = context;

  if (epochIncomeState.isLoading) return <div>Loading...</div>;
  if (epochIncomeState.error) return <div>Error: {epochIncomeState.error}</div>;

  const epochIncomeData = epochIncomeState.data.get(nodeAddress) || [];
  let clusterEpochIncomeData =
    epochIncomeState.data.get(IDEAL_RECORD_KEY) || [];
  let xAxisData = epochIncomeData.map(epochIncome => {
    return epochIncome.epoch;
  });

  const hasCapture = epochIncomeData.some(r => r.captureTotal != null);
  const mode: Mode =
    picked && (picked !== 'capture' || hasCapture)
      ? picked
      : hasCapture
        ? 'capture'
        : 'total';
  const ratio = mode === 'capture';
  const modes = MODE_OPTIONS.filter(o => hasCapture || o.value !== 'capture');

  // The cluster's row for each of the validator's epochs (by epoch).
  const clusterByEpoch = new Map(clusterEpochIncomeData.map(r => [r.epoch, r]));
  const pickValue = (row: (typeof epochIncomeData)[number] | undefined) => {
    if (!row) return null;
    if (mode === 'capture') return row.captureTotal ?? null;
    const { baseFees, priorityFees, mevTips } = row.medianIncome;
    if (mode === 'fees') return (baseFees + priorityFees) / 1_000_000_000;
    if (mode === 'tips') return mevTips / 1_000_000_000;
    return (baseFees + priorityFees + mevTips) / 1_000_000_000;
  };

  const validatorLabel =
    mode === 'capture'
      ? 'Capture'
      : mode === 'fees'
        ? 'Median fees / block'
        : mode === 'tips'
          ? 'Median tips / block'
          : 'Median fees + tips / block';

  let yAxisData: YAxisData[] = [
    {
      name: validatorLabel,
      data: epochIncomeData.map(pickValue)
    },
    {
      // Capture: the blocks around its own earn 1.00x by definition.
      name: ratio ? 'Blocks around its own' : `Cluster ${validatorLabel}`,
      data: ratio
        ? epochIncomeData.map(() => 1)
        : epochIncomeData.map(r => pickValue(clusterByEpoch.get(r.epoch)))
    }
  ];

  const LegendDot = ({ color }: { color: string }) => (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: color
      }}
    />
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <div className="d-flex align-items-center gap-3 fs-9 text-body-tertiary">
          <span className="d-inline-flex align-items-center gap-2">
            <LegendDot color={getThemeColor('primary')} />
            Validator
          </span>
          <span className="d-inline-flex align-items-center gap-2">
            <span
              style={{
                display: 'inline-block',
                width: 14,
                borderTop: `2px dashed ${getThemeColor('quaternary-color')}`
              }}
            />
            {ratio ? 'Blocks around its own (1.00×)' : 'Cluster median'}
          </span>
        </div>
        <ButtonGroup size="sm">
          {modes.map(opt => (
            <ToggleButton
              key={opt.value}
              id={`block-income-mode-${opt.value}`}
              type="radio"
              name="block-income-mode"
              variant="soft-secondary"
              value={opt.value}
              checked={mode === opt.value}
              onChange={e => setMode(e.currentTarget.value as Mode)}
            >
              {opt.label}
            </ToggleButton>
          ))}
        </ButtonGroup>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={getDefaultOptions(
          theme,
          xAxisData,
          yAxisData,
          getThemeColor,
          ratio
        )}
        style={{ height: '316px', width: '100%' }}
        notMerge
      />
    </div>
  );
};

export default BlockIncomeChart;
