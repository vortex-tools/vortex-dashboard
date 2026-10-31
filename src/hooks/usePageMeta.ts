import { IS_TESTNET_SITE } from 'helpers/apiEndpoint';
import { brand, factsNeeded, pageMeta, Site } from 'helpers/pageMeta';
import { useVortexData } from 'providers/VortexDataProvider';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

const SITE: Site = {
  CLUSTER: IS_TESTNET_SITE ? 'testnet' : 'mainnet',
  SITE: import.meta.env.VITE_DEPLOY_ENV || 'production'
};

const setMeta = (selector: string, attr: string, value: string) =>
  document.querySelector(selector)?.setAttribute(attr, value);

/**
 * Keeps the tab title, description and canonical URL in step with the page
 * as you navigate. The first page keeps the tags the Worker served
 * (worker/seo.ts: built the same way, with the API's facts the app doesn't
 * have here); every page after builds them from helpers/pageMeta.
 */
const usePageMeta = () => {
  const { pathname, search } = useLocation();
  const dir = useVortexData()?.validatorDirectoryState;
  const landing = useRef(pathname + search);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current && pathname + search === landing.current) return;
    moved.current = true;
    const need = factsNeeded(pathname);
    const v = need.validator
      ? dir?.byVoteAddress.get(need.validator) ||
        dir?.byNodeAddress.get(need.validator)
      : undefined;
    const verdict = pageMeta(SITE, pathname, search, {
      validator: v
        ? {
            identity: v.nodeAddress,
            voteAccount: v.voteAddress ?? null,
            info: { name: v.name ?? null },
            geo: null,
            software: null,
            stake: null
          }
        : null,
      // The app doesn't hold a pool's full name, a feature's or a SIMD's
      // title: their short labels.
      pool: null,
      feature: undefined,
      simd: undefined
    });
    if (verdict === 'pass') {
      document.title = import.meta.env.VITE_APP_TITLE;
      return;
    }
    if (verdict === 'missing') {
      document.title = `Page not found | ${brand(SITE)}`;
      return;
    }
    document.title = `${verdict.title} | ${brand(SITE)}`;
    setMeta('meta[name="description"]', 'content', verdict.description);
    setMeta(
      'link[rel="canonical"]',
      'href',
      `${window.location.origin}${verdict.canonical}`
    );
  }, [pathname, search, dir?.byVoteAddress, dir?.byNodeAddress]);
};

export default usePageMeta;
