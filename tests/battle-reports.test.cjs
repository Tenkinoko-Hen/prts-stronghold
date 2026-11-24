const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { diagnosticsDialogTitle, latestSelfFinish, parseUnknownDetails } = require('../electron/battle-reports.cjs');
const { pickLatestNpcapInstaller } = require('../electron/npcap-installer.cjs');

const loadProduct = (id) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'products', id, 'product.json'), 'utf8'));

test('diagnostic formats the latest local leak count as a number', () => {
  const finish = latestSelfFinish({
    5: { self_leaks: 2 },
    6: { self_leaks: 4, self_leak_enemies: [] },
  });

  assert.equal(finish.summary, 'R6 / 漏怪 4');
  assert.equal(finish.row.self_leaks, 4);
});

test('diagnostic leaves an unknown local settlement unclaimed', () => {
  assert.equal(latestSelfFinish({ 6: { self_leaks: null } }), undefined);
});

test('diagnostic parses message IDs and counts without packet contents', () => {
  assert.deepEqual(parseUnknownDetails('PRTS_REPORT_UNKNOWN 0 302 12 1 399 2'), [
    { direction: 'down', id: 302, count: 12 },
    { direction: 'up', id: 399, count: 2 },
  ]);
  assert.equal(parseUnknownDetails('PRTS_REPORT_UNKNOWN names are not diagnostic data'), undefined);
});

test('product manifests isolate stronghold and pure telemetry branding, IDs and workers', () => {
  const stronghold = loadProduct('stronghold');
  const telemetry = loadProduct('telemetry');

  assert.equal(stronghold.mode, 'full');
  assert.equal(telemetry.mode, 'telemetry');
  assert.notEqual(stronghold.desktop.appId, telemetry.desktop.appId);
  assert.notEqual(stronghold.android.package, telemetry.android.package);
  assert.equal(diagnosticsDialogTitle(stronghold), 'PRTS · 战报诊断');
  assert.equal(diagnosticsDialogTitle(telemetry), '卫戍战报仪 · 战报诊断');
  assert.equal(stronghold.reportBrand.exportPrefix, 'PRTS战报');
  assert.equal(telemetry.reportBrand.exportPrefix, '卫戍战报仪');
  assert.equal(stronghold.desktop.workerKind, 'report-only');
  assert.equal(stronghold.desktop.workerName, 'PRTS-Worker');
  assert.equal(telemetry.desktop.workerKind, 'report-only');
  assert.ok(!telemetry.publicAssetDirs.desktop.includes('community'));
  assert.ok(!telemetry.publicAssetDirs.android.includes('boss-routes'));
});

test('npcap installer picker selects highest numeric version from official directory HTML', () => {
  const html = `
    <a href="npcap-1.9.exe">npcap-1.9.exe</a>
    <a href="npcap-1.89.exe">npcap-1.89.exe</a>
    <a href="npcap-1.100.exe">npcap-1.100.exe</a>
    <a href="npcap-1.90.exe">npcap-1.90.exe</a>
  `;
  const latest = pickLatestNpcapInstaller(html);
  assert.deepEqual(latest, {
    version: '1.100',
    filename: 'npcap-1.100.exe',
    url: 'https://npcap.com/dist/npcap-1.100.exe',
  });
  assert.equal(pickLatestNpcapInstaller('no installers here'), null);
});
