// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import enemyPortraitsJson from '../desktop/enemyPortraits.json';
import { MOBILE_SESSION_KEY } from './mobileSession';

// Register a minimal loader hook so .webp/.css/asset imports resolve cleanly in Node tsx tests.
const assetHook = `
const ASSET_EXTS = ['.css', '.webp', '.png', '.jpg', '.jpeg', '.svg', '.woff2'];
export async function load(url, context, nextLoad) {
  const cleanUrl = url.split('?')[0];
  if (cleanUrl.endsWith('.css')) {
    return { format: 'module', shortCircuit: true, source: 'export default {};' };
  }
  if (ASSET_EXTS.some(ext => cleanUrl.endsWith(ext))) {
    return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(cleanUrl) + ';' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript;base64,${Buffer.from(assetHook, 'utf8').toString('base64')}`, import.meta.url);

const {
  MobileEnemyIcon,
  clampBondCount,
  resolveEnemyPortraitIndex,
  resolveMobileLeakEnemies,
  visibleMobileBonds,
} = await import('./MobileCapturePanel');
const { default: TelemetryMobileApp } = await import('./TelemetryMobileApp');
const { default: MobileApp } = await import('./MobileApp');

function buildTestCaptureState() {
  return {
    running: true,
    status: 'running' as const,
    message: '已连接',
    packets: 120,
    messages: 42,
    matchSerial: 1,
    round: 8,
    phase: 'battle',
    selfSeat: 1,
    selfHp: 22,
    bossHp: 180000,
    bossTotalDamage: 520000,
    bansConfirmed: true,
    bannedCovenants: ['炎'],
    forecastRound: 9,
    forecastEnemies: [
      { id: 'enemy_1006_shield_2', name: '重装防御组长', count: 4 },
      { id: 'enemy_1010_demon_3', name: '恶魔精锐', count: 2 },
    ],
    forecastText: '重装防御组长×4',
    nextTwoWaves: [
      {
        round: 9,
        enemies: [
          { id: 'enemy_1006_shield_2', name: '重装防御组长', count: 4 },
          { id: 'enemy_1010_demon_3', name: '恶魔精锐', count: 2 },
        ],
      },
      {
        round: 14,
        enemies: [
          { id: 'boss_8', name: '蒸汽骑士·改', count: 1 },
        ],
      },
    ],
    allWaves: [
      { round: 8, enemies: [{ id: 'enemy_1008_ghost', name: '幽灵', count: 6 }] },
      {
        round: 9,
        enemies: [
          { id: 'enemy_1006_shield_2', name: '重装防御组长', count: 4 },
          { id: 'enemy_1010_demon_3', name: '恶魔精锐', count: 2 },
        ],
      },
      { round: 14, enemies: [{ id: 'boss_8', name: '蒸汽骑士·改', count: 1 }] },
    ],
    seats: [
      {
        seat: 1,
        name: '测试我方',
        isSelf: true,
        hp: 22,
        shopLevel: 5,
        leaked: 2,
        assisted: 3,
        covered: 1,
        escaped: 1,
        bonds: [
          { name: '奥术', count: 1500, threshold: 2, active: true },
          { name: '精准', count: 245, threshold: 2, active: true },
          { name: '乌萨斯', count: 100, threshold: 3, active: true },
          { name: '炎', count: 6, threshold: 2, active: true },
          { name: '迅捷', count: 4, threshold: 2, active: true },
          { name: '灵巧', count: 2, threshold: 2, active: true },
        ],
      },
      {
        seat: 2,
        name: '队友二',
        isSelf: false,
        hp: 18,
        shopLevel: 4,
        leaked: 0,
        assisted: 4,
        covered: 0,
        escaped: 0,
        bonds: [{ name: '维多利亚', count: 3, threshold: 3, active: true }],
      },
    ],
    rounds: [
      {
        round: 7,
        totalLeaks: 1,
        totalAssisted: 1,
        totalEscaped: 0,
        seats: [
          { seat: 1, leaked: 1, assisted: 0, covered: 1, escaped: 0 },
          { seat: 2, leaked: 0, assisted: 1, covered: 0, escaped: 0 },
        ],
        enemies: [{ id: 'enemy_1008_ghost_2', name: '幽灵组长', count: 1 }],
      },
      {
        round: 8,
        totalLeaks: 2,
        totalAssisted: 1,
        totalEscaped: 1,
        seats: [
          { seat: 1, leaked: 2, assisted: 0, covered: 1, escaped: 1 },
          { seat: 2, leaked: 0, assisted: 1, covered: 0, escaped: 0 },
        ],
        enemies: [
          { id: 'enemy_1006_shield_2', name: '重装防御组长', count: 2 },
          { id: 'enemy_1010_demon_3', name: '恶魔精锐', count: 1 },
        ],
      },
    ],
    boss: {
      enemyId: 'boss_8',
      name: '蒸汽骑士·改',
      hp: 180000,
      maxHp: 700000,
      hpPct: 26,
      teamDamage: 520000,
      teamDps: 13000,
      elapsedSec: 40,
      players: [
        { rank: 1, seat: 1, name: '测试我方', isSelf: true, damage: 320000, dps: 8000, sharePct: 61.5 },
        { rank: 2, seat: 2, name: '队友二', isSelf: false, damage: 200000, dps: 5000, sharePct: 38.5 },
      ],
    },
    leak: {
      round: 8,
      totalLeaks: 2,
      assistKills: 1,
      uncoveredLeaks: 1,
      cumLeaks: 3,
      cumAssisted: 2,
      cumEscaped: 1,
      summary: '总漏 2 · 兜 1 · 逃 1',
      enemies: [
        { id: 'enemy_1006_shield_2', name: '重装防御组长', count: 2 },
        { id: 'enemy_1010_demon_3', name: '恶魔精锐', count: 1 },
      ],
    },
    updatedAt: Date.now(),
  };
}

function withMockBrowser<T>(capture: unknown, sessionJson: string | null, fn: () => T): T {
  const prevWindow = (globalThis as Record<string, unknown>).window;
  const prevStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).window = {
    location: { search: '' },
    PRTSCapture: capture
      ? {
          getState: () => JSON.stringify(capture),
          isRunning: () => true,
          start: () => {},
          stop: () => {},
          reset: () => {},
        }
      : undefined,
  };
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => (key === MOBILE_SESSION_KEY ? sessionJson : null),
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    return fn();
  } finally {
    if (prevWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = prevWindow;
    if (prevStorage === undefined) delete (globalThis as Record<string, unknown>).localStorage;
    else (globalThis as Record<string, unknown>).localStorage = prevStorage;
  }
}

test('resolveEnemyPortraitIndex supports exact hits, boss_1..17 mapping, and _2/_3 suffix fallback', () => {
  const indexOf = (id: string) => enemyPortraitsJson.ids.indexOf(id);

  // Exact match (including native _2 / _3 entries in atlas)
  assert.equal(resolveEnemyPortraitIndex('enemy_1006_shield'), indexOf('enemy_1006_shield'));
  assert.equal(resolveEnemyPortraitIndex('enemy_1006_shield_2'), indexOf('enemy_1006_shield_2'));
  assert.equal(resolveEnemyPortraitIndex('enemy_1005_yokai_3'), indexOf('enemy_1005_yokai_3'));

  // boss_1 .. boss_17 mapping
  assert.equal(resolveEnemyPortraitIndex('boss_1'), indexOf('enemy_9013_acstmk'));
  assert.equal(resolveEnemyPortraitIndex('boss_8'), indexOf('enemy_9013_acstmk_2'));
  assert.equal(resolveEnemyPortraitIndex('boss_17'), indexOf('enemy_2124_dyjsfg'));
  assert.equal(resolveEnemyPortraitIndex(' boss_4 '), indexOf('enemy_1521_dslily'));

  // _2 and _3 suffix fallback when variant is absent from enemyPortraits.json
  assert.equal(resolveEnemyPortraitIndex('enemy_1008_ghost_2'), indexOf('enemy_1008_ghost'));
  assert.equal(resolveEnemyPortraitIndex('enemy_1008_ghost_3'), indexOf('enemy_1008_ghost'));
  assert.equal(resolveEnemyPortraitIndex('enemy_1010_demon_3'), indexOf('enemy_1010_demon'));

  // Invalid / unknown IDs safely resolve to undefined
  assert.equal(resolveEnemyPortraitIndex(undefined), undefined);
  assert.equal(resolveEnemyPortraitIndex(''), undefined);
  assert.equal(resolveEnemyPortraitIndex('boss_0'), undefined);
  assert.equal(resolveEnemyPortraitIndex('boss_18'), undefined);
  assert.equal(resolveEnemyPortraitIndex('boss_1abc'), undefined);
  assert.equal(resolveEnemyPortraitIndex('enemy_unknown_999'), undefined);

  // MobileEnemyIcon renders span for boss_8 and _3 fallback, and omits unknown IDs
  const iconHtml = renderToStaticMarkup(createElement(MobileEnemyIcon, { id: 'boss_8', size: 15, className: 'mlite-enemy-icon' }));
  assert.match(iconHtml, /class="mlite-enemy-icon"/);
  assert.match(iconHtml, /width:15px/);
  assert.match(iconHtml, /background-position:/);
  assert.equal(renderToStaticMarkup(createElement(MobileEnemyIcon, { id: 'enemy_unknown_999' })), '');
});

test('clampBondCount, visibleMobileBonds and resolveMobileLeakEnemies handle 999 stacks, +N overflow and round fallback', () => {
  assert.equal(clampBondCount(1500), 999);
  assert.equal(clampBondCount(-5), 0);
  assert.equal(clampBondCount(Number.NaN), 0);

  const bonds = visibleMobileBonds([
    { name: '奥术', count: 1500, threshold: 2, active: true },
    { name: '精准', count: 245, threshold: 2, active: true },
    { name: '乌萨斯', count: 100, threshold: 3, active: true },
    { name: '炎', count: 6, threshold: 2, active: true },
    { name: '迅捷', count: 4, threshold: 2, active: true },
    { name: '灵巧', count: 2, threshold: 2, active: true },
    { name: '不屈', count: -1, threshold: 2, active: false },
  ], 4);
  assert.equal(bonds.shown.length, 4);
  assert.equal(bonds.shown[0].count, 999);
  assert.equal(bonds.hiddenCount, 2);
  assert.match(bonds.title, /奥术 999.*迅捷 4.*灵巧 2/);

  const cap = buildTestCaptureState();
  assert.equal(resolveMobileLeakEnemies(cap, true, 0, 8).length, 2);
  assert.equal(resolveMobileLeakEnemies(cap, false, 7, 8)[0].id, 'enemy_1008_ghost_2');

  // Single-round fallback to capture.leak.enemies when rounds[curRound].enemies is empty
  const fallbackCap = {
    ...cap,
    rounds: [{ ...cap.rounds[1], enemies: [] }],
  };
  assert.equal(resolveMobileLeakEnemies(fallbackCap, false, 8, 8).length, 2);
  assert.equal(resolveMobileLeakEnemies(fallbackCap, false, 6, 8).length, 0);
});

test('TelemetryMobileApp renders leak monster icons, wave icons, boss icon and 999-stack +N covenants', () => {
  const cap = buildTestCaptureState();
  const html = withMockBrowser(cap, null, () => renderToStaticMarkup(createElement(TelemetryMobileApp)));

  assert.match(html, /mlite-leak-panel/);
  assert.match(html, /累计高漏怪种（共 3 只）/);
  assert.match(html, /mlite-enemy-chip is-leak/);
  assert.match(html, /class="mlite-enemy-icon"[^>]*style="width:15px;height:15px/);
  assert.match(html, /重装防御组长.*×2/);
  assert.match(html, /恶魔精锐.*×1/);
  assert.match(html, /未来两波怪潮预计/);
  assert.match(html, /蒸汽骑士·改/);

  // 999-stack covenant clamp & tier classes + overflow +N with full title
  assert.match(html, /class="mlite-bond-chip is-active is-max"[^>]*>奥术999/);
  assert.match(html, /class="mlite-bond-chip is-active is-high"[^>]*>精准245/);
  assert.match(html, /class="mlite-bond-chip is-active is-high"[^>]*>乌萨斯100/);
  assert.match(html, /class="mlite-bond-more"[^>]*title="[^"]*迅捷 4[^"]*灵巧 2"[^>]*>\+2/);
});

test('MobileApp report tab renders Full-brand leak icons, nextTwoWaves icons, Boss icon and 999-stack +N covenants', () => {
  const cap = buildTestCaptureState();
  const reportSession = JSON.stringify({
    step: 'report',
    compId: null,
    bans: { bannedCovenants: [], bannedOperators: [] },
    rounds: {},
  });
  const html = withMockBrowser(cap, reportSession, () => renderToStaticMarkup(createElement(MobileApp)));

  assert.match(html, /class="mlite-full-brand"/);
  assert.match(html, /mlite-leak-panel/);
  assert.match(html, /累计高漏怪种（共 3 只）/);
  assert.match(html, /class="m-enemy-icon"[^>]*style="width:15px;height:15px/);
  assert.match(html, /未来两波怪潮预计/);
  assert.match(html, /下波 R09/);
  assert.match(html, /预 R14/);
  assert.match(html, /蒸汽骑士·改 · HP 26%/);
  assert.match(html, /class="m-enemy-icon"[^>]*style="width:16px;height:16px/);
  assert.match(html, /class="mlite-bond-chip is-active is-max"[^>]*>奥术999/);
  assert.match(html, /class="mlite-bond-chip is-active is-high"[^>]*>精准245/);
  assert.match(html, /class="mlite-bond-more"[^>]*title="[^"]*迅捷 4[^"]*灵巧 2"[^>]*>\+2/);
});
