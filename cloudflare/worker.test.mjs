import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './src/worker.mjs';

const origin = 'https://api.arknightsprts.ggff.net';
const token = 'unit-test-token';
const repo = 'Tenkinoko-Hen/prts-stronghold';

function fixture() {
  const rows = new Map();
  const DB = {
    prepare(sql) {
      return {
        bind(product, platform, channel, manifestJson) {
          const key = `${product}/${platform}/${channel}`;
          return {
            async first() {
              assert.match(sql, /^SELECT manifest_json FROM releases /);
              return rows.get(key) ?? null;
            },
            async run() {
              assert.match(sql, /^INSERT INTO releases /);
              assert.match(sql, /ON CONFLICT\(product, platform, channel\) DO UPDATE/);
              rows.set(key, { manifest_json: manifestJson });
            },
          };
        },
      };
    },
  };
  const env = { DB, ADMIN_TOKEN: token, GITHUB_REPO: repo };
  const pending = [];
  const send = (url, options) => worker.fetch(new Request(new URL(url, origin), options), env, {
    waitUntil(promise) { pending.push(promise); },
  });
  return { env, send, rows, pending };
}

const empty = {
  schemaVersion: 1, product: 'stronghold', platform: 'win', channel: 'stable',
  updatedAt: null, native: null, ui: null, data: null,
};
const ui = {
  kind: 'ui', product: 'stronghold', version: '2.1.0-p1', minNativeVersion: '2.1.0',
  url: `https://cdn.arknightsprts.ggff.net/releases/v2.1.0-p1/app.zip`,
  size: 10, sha256: '0'.repeat(64), signature: Buffer.alloc(64).toString('base64'),
};

function put(manifest, bearer = token) {
  return { method: 'PUT', headers: { Authorization: `Bearer ${bearer}` }, body: JSON.stringify(manifest) };
}

test('GET /health reports the service status', async () => {
  const response = await fixture().send('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'prts-stronghold-api', version: '1.0.0' });
});

test('manifest returns an empty typed target and rejects invalid selectors', async () => {
  const { send } = fixture();
  const response = await send('/v1/manifest.json?product=stronghold');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), empty);
  const other = await send('/v1/manifest.json?product=telemetry&platform=android&channel=beta');
  assert.deepEqual(await other.json(), { ...empty, product: 'telemetry', platform: 'android', channel: 'beta' });
  for (const query of ['', '?product=unknown', '?product=stronghold&platform=linux', '?product=stronghold&channel=other']) {
    assert.equal((await send(`/v1/manifest.json${query}`)).status, 400);
  }
});

test('admin rejects missing token, incorrect credentials and malformed manifests', async () => {
  const { env, send, rows } = fixture();
  const endpoint = '/v1/admin/manifest';
  assert.equal((await send(endpoint, { method: 'PUT' })).status, 401);
  assert.equal((await send(endpoint, put(empty, 'wrong'))).status, 401);
  assert.equal((await send(endpoint, put({ ...empty, schemaVersion: 2 }))).status, 400);
  assert.equal((await send(endpoint, put({ ...empty, ui: { ...ui, product: 'telemetry' } }))).status, 400);
  assert.equal((await send(endpoint, put({ ...empty, ui: { ...ui, url: 'https://example.com/app.zip' } }))).status, 400);
  assert.equal((await send(endpoint, { ...put(empty), body: 'not JSON' })).status, 400);
  delete env.ADMIN_TOKEN;
  assert.equal((await send(endpoint, put(empty))).status, 503);
  assert.equal(rows.size, 0);
});

test('authenticated publish upserts and returns a manifest scoped to product, platform and channel', async () => {
  const { send, rows } = fixture();
  const native = { version: '2.1.1', downloadUrl: `https://github.com/${repo}/releases/download/v2.1.1/app.exe` };
  const manifest = { ...empty, ui, native };
  const endpoint = '/v1/admin/manifest';
  const published = await send(endpoint, put(manifest));
  assert.equal(published.status, 200);
  const first = await published.json();
  assert.equal(first.ok, true);
  assert.ok(Number.isFinite(Date.parse(first.updatedAt)));
  const read = async (query) => (await send(`/v1/manifest.json?${query}`)).json();
  assert.deepEqual(await read('product=stronghold'), { ...manifest, updatedAt: first.updatedAt });
  assert.deepEqual(await read('product=telemetry'), { ...empty, product: 'telemetry' });
  assert.deepEqual(await read('product=stronghold&channel=beta'), { ...empty, channel: 'beta' });
  const next = { ...manifest, ui: { ...ui, version: '2.1.0-p2' } };
  assert.equal((await send(endpoint, put(next))).status, 200);
  assert.equal((await read('product=stronghold')).ui.version, '2.1.0-p2');
  assert.equal(rows.size, 1);
});

test('release proxy follows a GitHub asset redirect and caches only successful files', async (t) => {
  const { send, pending } = fixture();
  const requests = [];
  const store = new Map();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    match: async (request) => store.get(request.url)?.clone(),
    async put(request, response) { store.set(request.url, response); },
  } } });
  t.after(() => { delete globalThis.caches; });
  const release = '/releases/v2.1.0-p1/PRTS-HotUI-stronghold-2.1.0-p1.zip';
  const asset = 'https://release-assets.githubusercontent.com/asset?sig=test';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url);
    assert.deepEqual(options, { redirect: 'manual' });
    if (url.endsWith('/missing.zip')) return new Response('missing', { status: 404 });
    if (url === asset) return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/zip' } });
    assert.equal(url, `https://github.com/${repo}/releases/download/${release.slice('/releases/'.length)}`);
    return Response.redirect(asset, 302);
  });
  const first = await send(release);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('Content-Type'), 'application/zip');
  assert.equal(first.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), new Uint8Array([80, 75, 3, 4]));
  await Promise.all(pending);
  assert.equal(store.size, 1);
  assert.equal((await send(`${release}?ignored=1`)).status, 200);
  assert.equal(requests.length, 2);
  for (let attempt = 0; attempt < 2; attempt++) {
    const missing = await send('/releases/v2.1.0-p1/missing.zip');
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(requests.length, 4);
  assert.equal(store.size, 1);
});

test('release proxy rejects traversal, encoded separators, illegal names and off-host redirects', async (t) => {
  const { send } = fixture();
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.redirect('https://example.com/file', 302));
  for (const path of [
    '/releases/v1/app..zip', '/releases/v..1/app.zip', '/releases/%2e%2e/app.zip',
    '/releases/v1/sub%2Ffile.zip', '/releases/v1/app%20copy.zip', '/releases/v1/app$.zip',
    '/releases/v1/app.zip/extra', `/releases/${'x'.repeat(65)}/app.zip`,
  ]) {
    assert.ok([400, 404].includes((await send(path)).status), path);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal((await send('/releases/v1/app.zip')).status, 502);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('community comps and subpaths are disabled', async () => {
  const { send } = fixture();
  for (const pathname of ['/v1/comps', '/v1/comps/example/report']) {
    const response = await send(pathname);
    assert.equal(response.status, 501);
    assert.deepEqual(await response.json(), {
      error: 'community_comps_not_enabled', message: '社区阵容库将在后续阶段开放',
    });
  }
});
