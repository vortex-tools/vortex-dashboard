import UntrackedState from 'components/common/UntrackedState';
import useCluster, { BLOCK_INCOME_UNTRACKED } from 'hooks/useCluster';
import EarningsChart, {
  EarningsChartMode
} from 'components/charts/e-charts/EarningsChart';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import {
  CURRENCIES,
  Currency,
  PricePoints,
  fetchSolPrices,
  formatAmount,
  priceAt
} from 'helpers/solPrice';
import useLiveRefresh from 'hooks/useLiveRefresh';
import {
  EARNINGS_EPOCHS,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Form, ToggleButton } from 'react-bootstrap';
import { EpochEarnings } from 'providers/VortexDataProvider';

// The current epoch's numbers move as it goes; the endpoint is cheap.
const REFRESH_MS = 5 * 60_000;

/**
 * Earnings card for the validator page, from /epochs/earnings: per-epoch
 * net or income by stream and voting costs, plus the average net.
 */
const ValidatorEarnings = ({ nodeAddress }: { nodeAddress: string }) => {
  const context = useContext(VortexDataContext);
  const slice = context?.epochEarningsState;
  const rows = slice?.data.get(nodeAddress);
  const fetchData = slice?.fetchData;
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const { blockIncomeTracked } = useCluster();
  const [mode, setMode] = useState<EarningsChartMode>('net');
  const [currency, setCurrency] = useState<Currency>('sol');
  const [prices, setPrices] = useState<{
    currency: Currency;
    points: PricePoints | null;
    error: boolean;
  }>({ currency: 'sol', points: null, error: false });

  // Fiat needs each epoch's time; APIs that predate startTime / endTime
  // can't place epochs, so the currency picker only shows when they can.
  const canConvert = !!rows?.some(r => r.endTime != null);

  useEffect(() => {
    if (currency === 'sol') return;
    let live = true;
    fetchSolPrices(currency).then(
      points => live && setPrices({ currency, points, error: false }),
      () => live && setPrices({ currency, points: null, error: true })
    );
    return () => {
      live = false;
    };
  }, [currency]);
  const points = prices.currency === currency ? prices.points : null;
  const priceError = prices.currency === currency && prices.error;

  // SOL -> the chosen unit, at the SOL price at the end of that row's
  // epoch (now, for the epoch in progress).
  const convert = useCallback(
    (r: EpochEarnings, sol: number | null) => {
      if (sol == null || currency === 'sol') return sol;
      if (!points) return null;
      const t = r.endTime ?? (r.epoch === currentEpoch ? null : undefined);
      if (t === undefined) return null;
      const price = priceAt(points, t);
      return price == null ? null : sol * price;
    },
    [currency, points, currentEpoch]
  );
  const format = useCallback(
    (v: number | null, compact?: boolean) => formatAmount(v, currency, compact),
    [currency]
  );

  useEffect(() => {
    if (blockIncomeTracked) fetchData?.(nodeAddress);
  }, [fetchData, nodeAddress, blockIncomeTracked]);
  const unavailable = !rows && !slice?.isLoading && !!slice?.error;
  useLiveRefresh(!unavailable, REFRESH_MS, () => {
    fetchData?.(nodeAddress, { force: true });
  });

  // Average net over the epochs that have one (the current epoch's rewards
  // are paid in the next epoch's first block, so it never does), each in
  // the chosen unit at its own price.
  const summary = useMemo(() => {
    const values = (rows ?? [])
      .filter(r => r.net != null)
      .map(r => convert(r, (r.net ?? 0) / 1e9))
      .filter((v): v is number => v != null);
    if (!values.length) return null;
    return {
      avg: values.reduce((a, v) => a + v, 0) / values.length,
      count: values.length
    };
  }, [rows, convert]);
  const fiat = currency !== 'sol';
  const loadingPrices = fiat && !points && !priceError;

  // Block income isn't tracked on testnet: earnings' block rewards (and
  // so its totals) would be empty, so say so instead of a blank chart.
  if (!blockIncomeTracked)
    return (
      <SectionCard title="Earnings" icon="dollar-sign">
        <UntrackedState>{BLOCK_INCOME_UNTRACKED}</UntrackedState>
      </SectionCard>
    );

  return (
    <SectionCard title="Earnings" icon="dollar-sign">
      {unavailable ? (
        <p className="text-body-tertiary fs-9 mb-0">
          Earnings aren't available right now.
        </p>
      ) : !rows ? (
        <DelayedSpinner loading label="Loading earnings…" />
      ) : rows.length === 0 ? (
        <p className="text-body-tertiary fs-9 mb-0">
          No earnings recorded for this validator in the last {EARNINGS_EPOCHS}{' '}
          epochs.
        </p>
      ) : (
        <>
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            {summary && (
              <p className="fs-9 mb-0">
                <span className="text-body-tertiary">Avg net </span>
                <span className="fw-semibold">
                  {formatAmount(summary.avg, currency)}
                </span>
                <span className="text-body-tertiary">
                  {' '}
                  per epoch · last {summary.count} epochs
                </span>
              </p>
            )}
            {canConvert && (
              <Form.Select
                size="sm"
                aria-label="Currency"
                value={currency}
                onChange={e => setCurrency(e.target.value as Currency)}
                className="w-auto ms-auto"
              >
                {CURRENCIES.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Form.Select>
            )}
            <ButtonGroup size="sm" className={canConvert ? '' : 'ms-auto'}>
              {(
                [
                  ['net', 'Net'],
                  ['breakdown', 'Breakdown']
                ] as Array<[EarningsChartMode, string]>
              ).map(([value, label]) => (
                <ToggleButton
                  key={value}
                  id={`earnings-mode-${value}`}
                  type="radio"
                  name="earnings-mode"
                  variant="soft-secondary"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                >
                  {label}
                </ToggleButton>
              ))}
            </ButtonGroup>
          </div>
          {priceError ? (
            <p className="text-body-tertiary fs-9 mb-0">
              Couldn't load SOL prices right now; switch back to SOL or try
              again later.
            </p>
          ) : loadingPrices ? (
            <DelayedSpinner loading label="Loading SOL prices…" />
          ) : (
            <EarningsChart
              rows={rows}
              currentEpoch={currentEpoch}
              mode={mode}
              convert={convert}
              format={format}
            />
          )}
          <p className="fs-10 text-body-tertiary mb-0 mt-2">
            On-chain flows only; vote fees are an upper bound.
            {fiat && (
              <>
                {' '}
                Each epoch at the SOL price on the day it ended (now, for the
                epoch in progress); prices by{' '}
                <a
                  href="https://www.coingecko.com/en/coins/solana"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CoinGecko
                </a>
                .
              </>
            )}
          </p>
        </>
      )}
    </SectionCard>
  );
};

export default ValidatorEarnings;
