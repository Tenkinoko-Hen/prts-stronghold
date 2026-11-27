const PRODUCTS = new Set(['stronghold', 'telemetry']);
const PLATFORMS = new Set(['win', 'android']);
const CHANNELS = new Set(['stable', 'beta']);
const GITHUB_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const DOWNLOAD_HOSTS = new Set(['cdn.arknightsprts.ggff.net', 'api.arknightsprts.ggff.net', ...GITHUB_HOSTS]);
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-p(?:0|[1-9]\d*))?$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const CORS = { 'Access-Control-Allow-Origin': '*' };

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...CORS, ...headers } });
}

function validTarget({ product, platform, channel }) {
  return PRODUCTS.has(product) && PLATFORMS.has(platform) && CHANNELS.has(channel);
}

function validUrl(value, hosts = DOWNLOAD_HOSTS) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hosts.has(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function matches(value, pattern) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

function validPatch(entry, kind, product) {
  return entry == null || (entry.product === product && (entry.kind === undefined || entry.kind === kind)
    && matches(entry.version, VERSION) && matches(entry.minNativeVersion, VERSION)
    && (entry.maxNativeVersion == null || matches(entry.maxNativeVersion, VERSION))
    && Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= 30 * 1024 * 1024
    && matches(entry.sha256, /^[a-f0-9]{64}$/i) && matches(entry.signature, /^[A-Za-z0-9+/]{86}==$/)
    && validUrl(entry.url));
}

async function authorized(header, token) {
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([header || '', `Bearer ${token}`]
    .map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(actual, expected);
  const left = new Uint8Array(actual);
  const right = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function getManifest(url, env) {
  const product = url.searchParams.get('product');
  const platform = url.searchParams.get('platform') ?? 'win';
  const channel = url.searchParams.get('channel') ?? 'stable';
  if (!validTarget({ product, platform, channel })) return json({ error: 'invalid_manifest_target' }, 400);
  const row = await env.DB.prepare('SELECT manifest_json FROM releases WHERE product = ? AND platform = ? AND channel = ?')
    .bind(product, platform, channel).first();
  const manifest = row ? JSON.parse(row.manifest_json) : {
    schemaVersion: 1, product, platform, channel, updatedAt: null, native: null, ui: null, data: null,
  };
  return json(manifest, 200, { 'Cache-Control': 'public, max-age=60' });
}

async function putManifest(request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: 'admin_unavailable' }, 503);
  if (!await authorized(request.headers.get('Authorization'), env.ADMIN_TOKEN)) return json({ error: 'unauthorized' }, 401);
  let manifest;
  try {
    manifest = await request.json();
  } catch {
    return json({ error: 'invalid_manifest' }, 400);
  }
  if (!manifest || manifest.schemaVersion !== 1 || !validTarget(manifest)) return json({ error: 'invalid_manifest' }, 400);
  const { product, platform, channel, native = null, ui = null, data = null } = manifest;
  if ((native !== null && (!matches(native.version, VERSION) || !validUrl(native.downloadUrl)
    || (native.product !== undefined && native.product !== product)))
    || !validPatch(ui, 'ui', product) || !validPatch(data, 'data', product)) {
    return json({ error: 'invalid_manifest' }, 400);
  }
  const updatedAt = new Date().toISOString();
  const release = { schemaVersion: 1, product, platform, channel, updatedAt, native, ui, data };
  await env.DB.prepare(`INSERT INTO releases (product, platform, channel, manifest_json, updated_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(product, platform, channel) DO UPDATE SET
    manifest_json = excluded.manifest_json, updated_at = excluded.updated_at`)
    .bind(product, platform, channel, JSON.stringify(release), updatedAt).run();
  return json({ ok: true, updatedAt });
}

async function getRelease(url, env, ctx) {
  const [, tag, filename] = /^\/releases\/([^/]+)\/([^/]+)$/.exec(url.pathname) || [];
  if (!matches(tag, /^[A-Za-z0-9._-]{1,64}$/) || !matches(filename, /^[A-Za-z0-9._-]{1,128}$/)
    || tag.includes('..') || filename.includes('..')) return json({ error: 'invalid_release_path' }, 400);
  if (!matches(env.GITHUB_REPO, /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/) || env.GITHUB_REPO.includes('..')) {
    return json({ error: 'release_proxy_unavailable' }, 503);
  }

  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`${url.origin}${url.pathname}`);
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  let upstreamUrl = `https://github.com/${env.GITHUB_REPO}/releases/download/${tag}/${filename}`;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!validUrl(upstreamUrl, GITHUB_HOSTS)) break;
      const upstream = await fetch(upstreamUrl, { redirect: 'manual' });
      const location = upstream.headers.get('Location');
      if ([301, 302, 303, 307, 308].includes(upstream.status) && location) {
        await upstream.body?.cancel();
        const next = new URL(location, upstreamUrl).href;
        if (redirects < 5 && validUrl(next, GITHUB_HOSTS)) {
          upstreamUrl = next;
          continue;
        }
        return json({ error: 'invalid_upstream_redirect' }, 502, { 'Cache-Control': 'no-store' });
      }
      const headers = new Headers(upstream.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', upstream.status === 200 ? IMMUTABLE : 'no-store');
      headers.delete('Set-Cookie');
      const response = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
      if (upstream.status === 200 && cache) {
        const write = cache.put(cacheKey, response.clone()).catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(write);
        else await write;
      }
      return response;
    }
  } catch {}
  return json({ error: 'release_upstream_failed' }, 502, { 'Cache-Control': 'no-store' });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;
    if (method === 'GET' && pathname === '/health') return json({ ok: true, service: 'prts-stronghold-api', version: '1.0.0' });
    if (method === 'GET' && pathname === '/v1/manifest.json') return getManifest(url, env);
    if (method === 'PUT' && pathname === '/v1/admin/manifest') return putManifest(request, env);
    if (method === 'GET' && pathname.startsWith('/releases/')) return getRelease(url, env, ctx);
    if (pathname === '/v1/comps' || pathname.startsWith('/v1/comps/')) {
      return json({ error: 'community_comps_not_enabled', message: '社区阵容库将在后续阶段开放' }, 501);
    }
    return json({ error: 'not_found' }, 404);
  },
};
