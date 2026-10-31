/**
 * What search engines and AI crawlers get: the app is a client-rendered SPA,
 * so without this every URL serves the same shell (one title, an empty
 * #root). For page routes the Worker serves the same index.html with:
 *
 *   - this page's <title>, description, canonical, Open Graph / Twitter
 *     tags and JSON-LD (BreadcrumbList; Organization + WebSite on /);
 *   - a short summary inside #root (heading, the facts the description
 *     states, links to the page's tabs and the main sections), the same
 *     content the app shows. React's createRoot replaces it on mount;
 *   - a real 404 for paths no route serves, and 301s for renamed pages.
 *
 * Also /robots.txt, /sitemap.xml (+ its parts) and /llms.txt.
 *
 * Anything that fails here falls back to the plain asset response: SEO
 * must never take a page down.
 */

import {
  ARCHIVE,
  BASE58,
  Crumb,
  FeatureFacts,
  MAINNET_ONLY,
  MISSING,
  MOVED,
  Meta,
  PASS,
  PoolFacts,
  STATIC,
  SimdFacts,
  Site,
  ValidatorStatus,
  brand,
  factsNeeded,
  indexable,
  isTestnet,
  pageMeta,
  sections,
  solana
} from '../src/helpers/pageMeta';

export interface SeoEnv extends Site {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  API_BASE: string;
}

const esc = (t: string) =>
  t.replace(
    /[&<>"']/g,
    c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  );

/** API JSON, cached at the edge so crawls don't fan out to the API:
 *  null when the API says the key can't exist (404 unknown, 400 doesn't
 *  parse), undefined when it can't be read (5xx, timeout). */
const api = async <T>(
  env: SeoEnv,
  path: string,
  ttl = 300
): Promise<T | null | undefined> => {
  try {
    const res = await fetch(`${env.API_BASE}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
      // Answers (and 404s: a key the API doesn't know) for `ttl`; failures
      // not at all, so a brief API outage doesn't outlive itself.
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { '200-299': ttl, '400-404': ttl, '500-599': 0 }
      }
    });
    if (res.status === 404 || res.status === 400) return null;
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
};

// -------------------------------------------------------------- render

const jsonLd = (o: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

const head = (env: SeoEnv, origin: string, meta: Meta, fullTitle: string) => {
  // A 404 claims no URL and no card: just keep it out of the index.
  if (meta.status === 404) return `<meta name="robots" content="noindex" />`;
  const url = `${origin}${meta.canonical}`;
  const tags = [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(brand(env))}" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta name="twitter:card" content="${meta.noindex ? 'summary' : 'summary_large_image'}" />`,
    `<meta name="twitter:site" content="@vxtools" />`,
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`
  ];
  if (!meta.noindex) {
    const image = `${origin}${ogImagePath(meta.canonical)}`;
    tags.push(
      `<meta property="og:image" content="${esc(image)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:image" content="${esc(image)}" />`
    );
  }
  if (meta.noindex || !indexable(env))
    tags.push(`<meta name="robots" content="noindex" />`);
  else if (meta.archive)
    tags.push(`<meta name="robots" content="noindex, follow" />`);
  if (meta.crumbs)
    tags.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: meta.crumbs.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          item: `${origin}${c.path}`
        }))
      })
    );
  if (meta.canonical === '/')
    tags.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': 'https://vx.tools/#org',
            name: 'Vortex',
            url: 'https://vx.tools/',
            logo: 'https://vx.tools/vortex-logo.png',
            sameAs: ['https://x.com/vxtools', 'https://github.com/vortex-tools']
          },
          {
            '@type': 'WebSite',
            '@id': `${origin}/#website`,
            name: brand(env),
            url: `${origin}/`,
            description: meta.description,
            publisher: { '@id': 'https://vx.tools/#org' }
          }
        ]
      })
    );
  return tags.join('\n    ');
};

const body = (env: SeoEnv, meta: Meta, h1: string) => {
  const a = (c: Crumb) => `<a href="${esc(c.path)}">${esc(c.name)}</a>`;
  const crumbs = meta.crumbs
    ? `<nav aria-label="breadcrumb"><ol class="breadcrumb">${meta.crumbs
        .map(c => `<li class="breadcrumb-item">${a(c)}</li>`)
        .join('')}</ol></nav>`
    : '';
  const facts = (meta.facts ?? [meta.description])
    .map(f => `<p>${esc(f)}</p>`)
    .join('');
  const list = (title: string, items: Crumb[]) =>
    items.length
      ? `<h2 class="fs-8">${esc(title)}</h2><ul>${items.map(c => `<li>${a(c)}</li>`).join('')}</ul>`
      : '';
  return `<main class="container py-5" data-seo-summary>${crumbs}<h1>${esc(h1)}</h1>${facts}${list(
    meta.linksTitle ?? 'On this validator',
    meta.links ?? []
  )}${list(brand(env), sections(env))}</main>`;
};

/** A page's tags, with the facts it needs read from the API. */
export const metaFor = async (
  env: SeoEnv,
  pathname: string,
  search: string
) => {
  const need = factsNeeded(pathname);
  return pageMeta(env, pathname, search, {
    validator: need.validator
      ? await api<ValidatorStatus>(
          env,
          `/validators/status?voteKey=${encodeURIComponent(need.validator)}`,
          120
        )
      : undefined,
    pool: need.pool
      ? await api<PoolFacts>(
          env,
          `/pool?name=${encodeURIComponent(need.pool)}&limit=1`,
          600
        )
      : undefined,
    feature: need.feature
      ? await api<{ feature: FeatureFacts }>(
          env,
          `/feature?id=${need.feature}`,
          600
        ).then(d => (d ? d.feature : d))
      : undefined,
    simd: need.simd
      ? await api<SimdFacts>(env, `/simd?simd=${need.simd}`, 600)
      : undefined
  });
};

/** The page's card image (worker/index.tsx renders /og/<path>.png). */
export const ogImagePath = (canonical: string) =>
  `/og${canonical === '/' ? '/index' : canonical.split('?')[0]}.png`;

/** index.html for this request, with the page's tags and summary. */
const renderPage = async (
  req: Request,
  env: SeoEnv,
  url: URL
): Promise<Response> => {
  const asset = await env.ASSETS.fetch(req);
  if (!(asset.headers.get('content-type') ?? '').includes('text/html'))
    return asset;
  const verdict = await metaFor(env, url.pathname, url.search);
  const headers = new Headers(asset.headers);
  if (!indexable(env)) headers.set('x-robots-tag', 'noindex');
  if (verdict === PASS)
    return new Response(asset.body, { status: asset.status, headers });
  const meta: Meta =
    verdict === MISSING
      ? {
          title: 'Page not found',
          description: `This page does not exist on ${brand(env)}.`,
          canonical: url.pathname,
          noindex: true,
          status: 404
        }
      : verdict;

  const fullTitle = `${meta.title} | ${brand(env)}`;
  const h1 = meta.h1 ?? meta.title;
  const rewritten = new HTMLRewriter()
    .on('title', {
      element: el => {
        el.setInnerContent(fullTitle);
      }
    })
    .on('meta[name="description"]', {
      element: el => {
        el.setAttribute('content', meta.description);
      }
    })
    .on('head', {
      element: el => {
        el.append(head(env, url.origin, meta, fullTitle), { html: true });
      }
    })
    .on('div#root', {
      element: el => {
        el.setInnerContent(body(env, meta, h1), { html: true });
      }
    })
    .transform(asset);
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(rewritten.body, {
    status: meta.status ?? asset.status,
    headers
  });
};

// -------------------------------------------------- robots, sitemap, llms

const text = (body: string, type: string, maxAge: number) =>
  new Response(body, {
    headers: {
      'content-type': `${type}; charset=utf-8`,
      'cache-control': `public, max-age=${maxAge}`
    }
  });

const robots = (env: SeoEnv, origin: string) =>
  indexable(env)
    ? `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
    : `# Staging: not for search engines.\nUser-agent: *\nDisallow: /\n`;

const urlset = (origin: string, paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map(p => `<url><loc>${esc(origin + p)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;

const SITEMAPS = ['pages', 'validators', 'pools', 'features', 'simds'] as const;

const sitemap = async (env: SeoEnv, origin: string, part: string) => {
  // Testnet has no stake pool pages.
  const parts = SITEMAPS.filter(p => !(isTestnet(env) && p === 'pools'));
  if (!(parts as string[]).includes(part) && part !== 'index') return null;
  if (part === 'index')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts
      .map(s => `<sitemap><loc>${origin}/sitemap-${s}.xml</loc></sitemap>`)
      .join('\n')}\n</sitemapindex>\n`;
  if (part === 'pages')
    return urlset(
      origin,
      Object.keys(STATIC).filter(
        p => !ARCHIVE.has(p) && !(isTestnet(env) && MAINNET_ONLY.has(p))
      )
    );
  if (part === 'validators') {
    const d = await api<{ validators: Array<{ voteAddress: string | null }> }>(
      env,
      '/validators',
      3600
    );
    if (!d) return null;
    const votes = [
      ...new Set(
        d.validators
          .map(v => v.voteAddress)
          .filter((v): v is string => !!v && BASE58.test(v))
      )
    ];
    return urlset(
      origin,
      votes.map(v => `/validator/${v}`)
    );
  }
  if (part === 'features') {
    const d = await api<{ features: Array<{ id: string }> }>(
      env,
      '/features',
      3600
    );
    if (!d) return null;
    return urlset(
      origin,
      d.features.filter(f => BASE58.test(f.id)).map(f => `/feature/${f.id}`)
    );
  }
  if (part === 'simds') {
    const d = await api<{ simds: Array<{ simd: number }> }>(
      env,
      '/simds',
      3600
    );
    if (!d) return null;
    return urlset(
      origin,
      d.simds.map(x => `/simd/${x.simd}`)
    );
  }
  if (part === 'pools') {
    const d = await api<{ pools: Array<{ name: string }> }>(
      env,
      '/pools',
      3600
    );
    if (!d) return null;
    return urlset(
      origin,
      d.pools.map(p => `/pool/${encodeURIComponent(p.name)}`)
    );
  }
  return null;
};

const llms = (env: SeoEnv, origin: string) => {
  const s = solana(env);
  const api = env.API_BASE;
  return `# ${brand(env)}

> ${brand(env)} (${origin}) shows how ${s} validators perform under Alpenglow consensus: vote participation, block production, fees, earnings, stake, decentralization and governance, per validator and per epoch. All of it comes from a free, read-only JSON API at ${api} (no key); its full reference is ${api}/llms.txt.

## API

- [API reference (llms.txt)](${api}/llms.txt): every endpoint, its parameters and response fields, with curl examples
- [Using Vortex with AI](${origin}/usage): how to point an assistant or agent at the API

## Pages

${sections(env)
  .map(c => `- [${c.name}](${origin}${c.path})`)
  .join('\n')}
- Validator pages: ${origin}/validator/<vote account or identity>, with tabs /voting, /production, /earnings${isTestnet(env) ? '' : ', /fees, /staking'}
- Slot pages: ${origin}/slot/<slot>

## Optional

- [Sitemap](${origin}/sitemap.xml)
- [Vortex blog](https://blog.vx.tools/): long-form ${s} validator data posts
- [Vortex](https://vx.tools/)
`;
};

// ---------------------------------------------------------------- entry

/** The SEO response for this request, or null to let the caller go on. */
export const seo = async (
  req: Request,
  env: SeoEnv
): Promise<Response | null> => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const url = new URL(req.url);
  const path = url.pathname;
  // Behind Cloudflare every public URL is https; local dev keeps its own.
  if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) url.protocol = 'https:';
  const origin = url.origin;

  if (path === '/robots.txt')
    return text(robots(env, origin), 'text/plain', 3600);
  if (path === '/llms.txt') return text(llms(env, origin), 'text/plain', 3600);
  const sm = path.match(/^\/sitemap(?:-([a-z]+))?\.xml$/);
  if (sm) {
    const xml = await sitemap(env, origin, sm[1] ?? 'index');
    return xml
      ? text(xml, 'application/xml', 3600)
      : new Response('not found', { status: 404 });
  }

  for (const [re, to] of MOVED) {
    const m = path.match(re);
    if (m) return Response.redirect(`${origin}${to(m)}${url.search}`, 301);
  }

  // A file that doesn't exist: the SPA fallback would answer 200 with the
  // app shell (a soft 404).
  if (/^\/[^/]+\.[a-z0-9]+$/i.test(path) && path !== '/index.html') {
    const asset = await env.ASSETS.fetch(req);
    return (asset.headers.get('content-type') ?? '').includes('text/html')
      ? new Response('not found', { status: 404 })
      : asset;
  }
  return renderPage(req, env, url);
};
