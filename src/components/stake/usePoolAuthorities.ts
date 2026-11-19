import { FEATURES_KEY, VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo } from 'react';

export interface PoolRef {
  /** Its page's name (/pool/:name). */
  name: string;
  fullName: string | null;
}

/** Stake pools by their authorities' addresses (withdraw and staker
 *  authorities, from the cached /pools listing), so an address can be
 *  named as the pool it belongs to. */
const usePoolAuthorities = (): Map<string, PoolRef> => {
  const context = useContext(VortexDataContext);
  const fetchPools = context?.poolsState.fetchData;
  const list = context?.poolsState.data.get(FEATURES_KEY);
  useEffect(() => {
    fetchPools?.(FEATURES_KEY);
  }, [fetchPools]);
  return useMemo(() => {
    const m = new Map<string, PoolRef>();
    for (const p of list?.pools ?? [])
      for (const a of p.authorities)
        m.set(a, { name: p.name, fullName: p.fullName });
    return m;
  }, [list]);
};

export default usePoolAuthorities;
