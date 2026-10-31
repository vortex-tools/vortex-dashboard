/**
 * The dashboard's only server code:
 *
 *   - page tags, robots.txt, sitemaps and llms.txt for crawlers (./seo.ts);
 *   - shareable "Ready for Alpenglow" X cards (below).
 *
 * Static files (/assets/*, icons, the manifest) never reach this Worker
 * (wrangler.jsonc run_worker_first).
 *
 *   /share/alpenglow/<identity>           X card tags; people are sent on to
 *                                         /alpenglow/share?v=<identity>
 *   /share/alpenglow/<identity>/card.png  the card image (1200 x 630)
 *
 * Readiness comes from the API's /validators/status (one validator) and
 * the app's own client rules (src/helpers/alpenglowClient.ts).
 */
import { GoogleFont, ImageResponse, cache } from '@cf-wasm/og/workerd';
import {
  MAINNET_ACTIVATION_EPOCH,
  ReadinessStatus,
  cardVersion,
  readinessView
} from '../src/helpers/alpenglowClient';
import { metaFor, seo } from './seo';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  /** The API this deploy reads (vars per env in wrangler.jsonc). */
  API_BASE: string;
  /** The cluster it serves, for the card's footer. */
  CLUSTER: string;
  /** "production" | "staging" | "testnet": staging is kept out of search. */
  SITE?: string;
}

interface Status extends ReadinessStatus {
  voteAccount: string | null;
  epoch: number;
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** What the card says about one validator. */
const readiness = (s: Status) => readinessView(s);

const esc = (t: string) =>
  t.replace(
    /[&<>"']/g,
    c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  );

/** The validator's status, or null (unknown, or the API unreachable -
 *  the page then still renders, without a verdict). */
// Why the last status read failed (shown in the page as a comment).
let lastError = '';
const getStatus = async (env: Env, identity: string) => {
  try {
    const res = await fetch(
      `${env.API_BASE}/validators/status?identity=${identity}`,
      { headers: { accept: 'application/json' } }
    );
    if (!res.ok) {
      lastError = `API ${res.status} ${(await res.text()).slice(0, 200)}`;
      return null;
    }
    return (await res.json()) as Status;
  } catch (e) {
    lastError = `fetch ${String(e)}`;
    console.error('share: status fetch failed', lastError);
    return null;
  }
};

/**
 * The validator's logo (validator-info iconUrl) as a data URL, or null.
 * Logos live anywhere in any format: only PNG / JPEG / GIF (by their magic
 * bytes, not the often-wrong content type) under 1.5 MB that arrive within
 * 2.5 s are used - anything else renders the card without one.
 */
const fetchIcon = async (url: string | null | undefined) => {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      // A day for logos (and their 404s); a failing host isn't cached.
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { '200-299': 86400, '404': 86400, '500-599': 0 }
      }
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length || buf.length > 1_500_000) return null;
    const type =
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e
        ? 'image/png'
        : buf[0] === 0xff && buf[1] === 0xd8
          ? 'image/jpeg'
          : buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46
            ? 'image/gif'
            : null;
    if (!type) return null;
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000)
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
};

// Brand colors (the app's purple; green / amber for the verdict).
const C = {
  bg: '#140b26',
  panel: '#22133f',
  text: '#f4effc',
  muted: '#a897c9',
  purple: '#9a65ff',
  green: '#25b003',
  amber: '#e5a00b'
};

const Card = ({
  r,
  cluster,
  icon
}: {
  r: ReturnType<typeof readiness>;
  cluster: string;
  /** The validator's logo as a data URL, or null (none, or unusable). */
  icon: string | null;
}) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: `linear-gradient(135deg, ${C.bg} 0%, #2a1452 100%)`,
      color: C.text,
      padding: '56px 64px',
      fontFamily: 'Nunito Sans'
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 800 }}>
        <span style={{ color: C.purple }}>vortex</span>
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: C.muted }}>
        vx.tools
      </div>
    </div>
    <div
      style={{
        display: 'flex',
        marginTop: 40,
        fontSize: 30,
        fontWeight: 800,
        letterSpacing: 4,
        color: r.ready ? C.green : C.amber
      }}
    >
      {r.ready
        ? r.migrated
          ? 'RUNNING ALPENGLOW'
          : 'READY FOR ALPENGLOW'
        : 'GETTING READY FOR ALPENGLOW'}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
      {icon && (
        <img
          src={icon}
          width={120}
          height={120}
          style={{
            width: 120,
            height: 120,
            borderRadius: 24,
            marginRight: 28,
            objectFit: 'cover',
            background: C.panel
          }}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: r.name.length > 28 ? 52 : r.name.length > 18 ? 62 : 72,
            fontWeight: 900,
            lineHeight: 1.1
          }}
        >
          {r.name}
        </div>
        {r.stake && (
          <div
            style={{
              display: 'flex',
              marginTop: 6,
              fontSize: 30,
              color: C.muted
            }}
          >
            {r.stake}
          </div>
        )}
      </div>
    </div>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: 36,
        gap: 14
      }}
    >
      {r.rows.map(row => (
        <div
          key={row.text}
          style={{ display: 'flex', alignItems: 'center', fontSize: 32 }}
        >
          <div
            style={{
              display: 'flex',
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 20,
              fontSize: 28,
              fontWeight: 900,
              background: row.ok ? C.green : C.amber,
              color: C.bg
            }}
          >
            {/* Drawn, not a glyph: the font has no check mark. */}
            <svg width="26" height="26" viewBox="0 0 24 24">
              {row.ok ? (
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  fill="none"
                  stroke={C.bg}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M12 5v9M12 19v.5"
                  fill="none"
                  stroke={C.bg}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </div>
          <div style={{ display: 'flex', fontWeight: 700 }}>{row.text}</div>
          <div style={{ display: 'flex', marginLeft: 16, color: C.muted }}>
            {row.hint}
          </div>
        </div>
      ))}
    </div>
    <div
      style={{
        display: 'flex',
        marginTop: 'auto',
        fontSize: 24,
        color: C.muted
      }}
    >
      {r.migrated
        ? `Alpenglow is live on Solana ${cluster}`
        : `Solana ${cluster} migrates to Alpenglow at epoch ${MAINNET_ACTIVATION_EPOCH}`}
    </div>
  </div>
);

/** A page's card (/og/<page path>.png): its title and description, from
 *  the same tags the page serves (worker/seo.ts). */
const PageCard = ({
  title,
  subtitle,
  site
}: {
  title: string;
  subtitle: string;
  site: string;
}) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: `linear-gradient(135deg, ${C.bg} 0%, #2a1452 100%)`,
      color: C.text,
      padding: '56px 64px',
      fontFamily: 'Nunito Sans'
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 800 }}>
        <span style={{ color: C.purple }}>vortex</span>
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: C.muted }}>
        {site}
      </div>
    </div>
    <div
      style={{
        display: 'flex',
        marginTop: 'auto',
        fontSize: title.length > 60 ? 54 : title.length > 32 ? 64 : 76,
        fontWeight: 900,
        lineHeight: 1.1
      }}
    >
      {title}
    </div>
    <div
      style={{
        display: 'flex',
        marginTop: 24,
        marginBottom: 'auto',
        fontSize: 30,
        lineHeight: 1.35,
        color: C.muted
      }}
    >
      {subtitle.length > 190
        ? `${subtitle.slice(0, 190).replace(/[\s,.:;]+\S*$/, '')}…`
        : subtitle}
    </div>
  </div>
);

const NUNITO = () => [
  new GoogleFont('Nunito Sans', { weight: 400 }),
  new GoogleFont('Nunito Sans', { weight: 700 }),
  new GoogleFont('Nunito Sans', { weight: 800 }),
  new GoogleFont('Nunito Sans', { weight: 900 })
];

/** /og/<page path>.png: the card of a page that has tags (404 otherwise).
 *  Cached per URL for a day. */
const ogCard = async (req: Request, env: Env, ctx: ExecutionContext) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/og(\/.*)\.png$/);
  if (!m) return null;
  const edge = caches.default;
  const hit = await edge.match(req);
  if (hit) return hit;
  const path = m[1] === '/index' ? '/' : m[1];
  const meta = await metaFor(env, path, url.search);
  if (typeof meta === 'string' || meta.noindex)
    return new Response('no card', { status: 404 });
  cache.setExecutionContext(ctx);
  const img = await ImageResponse.async(
    <PageCard
      title={meta.h1 ?? meta.title}
      // A validator / pool: its facts (stake, client, location) under its
      // name; other pages: the description under the title.
      subtitle={(meta.h1 && meta.facts?.[0]) || meta.description}
      site={url.host}
    />,
    { width: 1200, height: 630, fonts: NUNITO() }
  );
  const headers = new Headers(img.headers);
  headers.set('cache-control', 'public, max-age=86400');
  const res = new Response(img.body, { status: 200, headers });
  ctx.waitUntil(edge.put(req, res.clone()));
  return res;
};

const page = (origin: string, identity: string, s: Status | null) => {
  const r = s ? readiness(s) : null;
  const title = r
    ? r.ready
      ? `${r.name} is ${r.migrated ? 'running' : 'ready for'} Alpenglow`
      : `${r.name} is getting ready for Alpenglow`
    : 'Ready for Alpenglow?';
  const description = r
    ? r.rows.map(x => `${x.ok ? '✓' : '✗'} ${x.text}: ${x.hint}`).join(' · ')
    : 'Check any Solana validator’s Alpenglow readiness on Vortex.';
  // The card URL changes with the verdict and epoch, so a re-share after a
  // fix gets a fresh image past X's cache.
  const v = r ? cardVersion(r, s!.epoch) : '0';
  const image = `${origin}/share/alpenglow/${identity}/card.png?v=${v}`;
  // Visitors land on the share page with this validator picked (see its
  // readiness, then look up their own) - or, where Alpenglow already runs
  // (nothing to share), on the validator's page.
  const target = r?.migrated
    ? `${origin}/validator/${identity}`
    : `${origin}/alpenglow/share?v=${identity}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(title)} | Vortex</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Vortex" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${esc(`${origin}/share/alpenglow/${identity}`)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
<meta http-equiv="refresh" content="0; url=${esc(target)}" />
</head><body><a href="${esc(target)}">${esc(title)}</a>${
    s ? '' : `<!-- status unavailable: ${esc(lastError)} -->`
  }</body></html>`;
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    if (!new URL(req.url).pathname.startsWith('/share/')) {
      try {
        return (
          (await ogCard(req, env, ctx)) ??
          (await seo(req, env)) ??
          (await env.ASSETS.fetch(req))
        );
      } catch (e) {
        // Tags are a bonus: on any failure serve the page as it is.
        console.error('seo: failed', String(e), (e as Error)?.stack);
        return env.ASSETS.fetch(req);
      }
    }
    try {
      return await handle(req, env, ctx);
    } catch (e) {
      // A broken card must not take the share link down with it.
      console.error('share: failed', String(e), (e as Error)?.stack);
      return new Response(`share card error: ${String(e)}`, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }
  }
};

const handle = async (req: Request, env: Env, ctx: ExecutionContext) => {
  const url = new URL(req.url);
  const m = url.pathname.match(
    /^\/share\/alpenglow\/([^/]+)(\/card\.png)?\/?$/
  );
  if (!m || !BASE58.test(m[1])) return env.ASSETS.fetch(req);
  const identity = m[1];
  // Rendered cards are cached per URL (the URL carries the verdict and
  // epoch): the share page's preview warms it for X's crawler.
  const edge = caches.default;
  if (m[2]) {
    const hit = await edge.match(req);
    if (hit) return hit;
  }
  const status = await getStatus(env, identity);

  if (!m[2])
    return new Response(page(url.origin, identity, status), {
      status: status ? 200 : 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300'
      }
    });

  if (!status) return new Response('unknown validator', { status: 404 });
  cache.setExecutionContext(ctx);
  const img = await ImageResponse.async(
    <Card
      r={readiness(status)}
      cluster={env.CLUSTER}
      icon={await fetchIcon(status.info?.iconUrl)}
    />,
    {
      width: 1200,
      height: 630,
      fonts: NUNITO()
    }
  );
  const headers = new Headers(img.headers);
  headers.set('cache-control', 'public, max-age=3600');
  const res = new Response(img.body, { status: 200, headers });
  ctx.waitUntil(edge.put(req, res.clone()));
  return res;
};
