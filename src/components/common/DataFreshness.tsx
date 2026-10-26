import useIngestion from 'hooks/useIngestion';
import { Ingestion } from 'providers/vortex-schemas';

/** The laggiest source's lag, and a per-source line for each, for hovers. */
export const freshness = (
  ingestion: Ingestion | null | undefined,
  sources: Array<'blocks' | 'footers'>
) => {
  const reported = sources.flatMap(src => {
    const s = ingestion?.[src];
    return s ? [{ src, ...s }] : [];
  });
  if (!reported.length) return null;
  return {
    lag: Math.max(...reported.map(s => s.lagSlots)),
    title: reported
      .map(
        s =>
          `${s.src === 'blocks' ? 'Block data' : 'Votes'} up to slot ${s.lastSlot.toLocaleString()} (${s.lagSlots === 0 ? 'current' : `${s.lagSlots.toLocaleString()} slots behind`})`
      )
      .join('\n')
  };
};

/**
 * Data freshness from /epochs/current's ingestion status, as one short
 * card subtitle: "data 91 slots behind" (the laggiest source) / "data
 * current", "Votes up to slot Y (…)" per source on hover - so recent data
 * reads as "not there yet" rather than missing. null until the API reports
 * it, or for a source it doesn't (e.g. block data on testnet).
 */
export const DataFreshnessSublabel = ({
  sources,
  ingestion: given
}: {
  sources: Array<'blocks' | 'footers'>;
  /** Already-polled ingestion (skips this component's own poll). */
  ingestion?: Ingestion | null;
}) => {
  const polled = useIngestion(given === undefined);
  const f = freshness(given === undefined ? polled : given, sources);
  if (!f) return null;
  const { lag, title } = f;
  return (
    <span title={title}>
      {lag === 0 ? 'data current' : `data ${lag.toLocaleString()} slots behind`}
    </span>
  );
};
