const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  createReportStore,
  filenameFromStorageId,
  storageIdFromRecord,
} = require('../electron/report-store.cjs');

function makeTempEnv(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-report-store-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const userDataDir = path.join(root, 'userData');
  const defaultDir = path.join(root, 'Documents', 'PRTS Stronghold', 'BattleReports');
  const customDir = path.join(root, 'D-Drive', 'MyReports');
  return { root, userDataDir, defaultDir, customDir };
}

function sampleRecord(match, seenAt, roundsCount = 4) {
  return {
    key: `1:${match}`,
    label: `本地对局 ${match}`,
    seenAt,
    manualNames: { 2: '二号队友' },
    report: {
      match,
      current: roundsCount,
      self: 1,
      names: { 1: '我方', 2: '', 3: '三号', 4: '四号' },
      hp: { 1: 24, 2: 20, 3: 18, 4: 15 },
      eliminated: {},
      rounds: Array.from({ length: roundsCount }, (_, idx) => ({ number: idx + 1, phase: 'settle' })),
    },
  };
}

test('storageIdFromRecord and filenameFromStorageId sanitize IDs and reject path traversal', () => {
  const id = storageIdFromRecord(sampleRecord(7, 1732780000123));
  assert.equal(id, 'report-1732780000123-7');
  assert.equal(filenameFromStorageId(id), 'report-1732780000123-7.json');
  assert.equal(filenameFromStorageId(`saved:${id}`), 'report-1732780000123-7.json');
  assert.equal(filenameFromStorageId('../escape'), null);
  assert.equal(filenameFromStorageId('report-a/b'), null);
});

test('report-store persists matches atomically across restarts, skips corrupt/demo files, and trims oldest', (t) => {
  const { userDataDir, defaultDir } = makeTempEnv(t);
  const store = createReportStore({ userDataDir, defaultDir, maxReports: 3 });

  // Demo and empty records are skipped cleanly
  assert.equal(store.saveRecord({ ...sampleRecord(1, 1000), key: 'demo:mumu' }).ok, false);
  assert.equal(store.saveRecord(sampleRecord(1, 1000, 0)).ok, false);

  // Save 4 matches -> oldest trimmed down to maxReports=3
  for (let i = 1; i <= 4; i++) {
    const res = store.saveRecord(sampleRecord(i, 1732780000000 + i * 10000, i + 2));
    assert.equal(res.ok, true);
  }
  // Drop a corrupt JSON file into the directory and verify loadRecords ignores it
  fs.writeFileSync(path.join(defaultDir, 'report-9999999999999-bad.json'), '{broken json', 'utf8');

  // Re-instantiate store (simulating fresh app launch / reinstall pointing at Documents)
  const freshStore = createReportStore({ userDataDir, defaultDir, maxReports: 3 });
  const loaded = freshStore.loadRecords();
  assert.equal(loaded.config.isCustom, false);
  assert.equal(loaded.records.length, 3);
  assert.deepEqual(loaded.records.map(r => r.report.match), [4, 3, 2]);
  assert.ok(loaded.records[0].key.startsWith('saved:report-'));
  assert.deepEqual(loaded.records[0].manualNames, { 2: '二号队友' });

  // Delete one saved match
  const delRes = freshStore.deleteRecord(loaded.records[0].key);
  assert.equal(delRes.ok, true);
  assert.equal(freshStore.loadRecords().records.length, 2);
});

test('report-store switches to custom directory with automatic migration and resets cleanly', (t) => {
  const { userDataDir, defaultDir, customDir } = makeTempEnv(t);
  const store = createReportStore({ userDataDir, defaultDir });

  assert.equal(store.saveRecord(sampleRecord(1, 1732780100000)).ok, true);
  assert.equal(store.saveRecord(sampleRecord(2, 1732780200000)).ok, true);

  const switched = store.setCustomDirectory(customDir, { migrate: true });
  assert.equal(switched.migratedCount, 2);
  assert.equal(switched.config.isCustom, true);
  assert.equal(switched.config.dir, path.resolve(customDir));
  assert.equal(switched.records.length, 2);

  // Simulate app restart -> customDir persists via report-storage.json
  const restarted = createReportStore({ userDataDir, defaultDir });
  assert.equal(restarted.getConfig().dir, path.resolve(customDir));
  assert.equal(restarted.getConfig().isCustom, true);
  assert.equal(restarted.loadRecords().records.length, 2);

  // Save a 3rd match exclusively in customDir
  assert.equal(restarted.saveRecord(sampleRecord(3, 1732780300000)).ok, true);
  assert.equal(restarted.loadRecords().records.length, 3);

  // Reset back to defaultDir
  const reset = restarted.resetDirectory();
  assert.equal(reset.config.isCustom, false);
  assert.equal(reset.config.dir, path.resolve(defaultDir));
  assert.equal(reset.records.length, 2);
});
