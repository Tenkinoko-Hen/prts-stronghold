package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 手机免 Root 实时抓包对局聚合状态（v3.1）：
 * - 开局 300 帧自动同步 26 项 Ban 选、4 名玩家名与 Boss ID；
 * - 记录每回合下波出怪清单（保留 enemyId 供迷你条直接显示实机图标）；
 * - 按回合完整追踪 4 名玩家的漏怪、协防兜底、被兜与逃跑数量，同时支持「累计」与「单回合」视图；
 * - Boss 战实时追踪 4 名玩家的总伤害、DPS（/s）、占比（%）、排名（#1–#4）及 Boss 剩余血量百分比。
 */
final class BattleCaptureState {
    static final class EnemyCount {
        final String enemyId;
        final String name;
        final int count;
        EnemyCount(String enemyId, String name, int count) {
            this.enemyId = enemyId;
            this.name = name;
            this.count = count;
        }
    }

    static final class RoundWave {
        final int round;
        final List<EnemyCount> enemies;
        RoundWave(int round, List<EnemyCount> enemies) {
            this.round = round;
            this.enemies = enemies;
        }
    }

    static final class SeatLeakRow {
        final int seat;
        final String name;
        final boolean isSelf;
        final int hp;
        final int shopLevel; // 1..6, 0 if unknown
        final int leaked;    // 本人漏出总数
        final int assisted;  // 帮队友兜底击杀数
        final int covered;   // 本人漏怪中被队友兜住数
        final int escaped;   // 本人漏怪中最终未兜住逃跑数
        SeatLeakRow(int seat, String name, boolean isSelf, int hp, int shopLevel, int leaked, int assisted, int covered, int escaped) {
            this.seat = seat;
            this.name = name;
            this.isSelf = isSelf;
            this.hp = hp;
            this.shopLevel = shopLevel;
            this.leaked = leaked;
            this.assisted = assisted;
            this.covered = covered;
            this.escaped = escaped;
        }
    }

    static final class LeakSnapshot {
        final int round; // 0 = cumulative
        final int totalLeaks;
        final int totalAssisted;
        final int totalEscaped;
        final List<SeatLeakRow> seats;
        final List<EnemyCount> enemies;
        LeakSnapshot(int round, int totalLeaks, int totalAssisted, int totalEscaped, List<SeatLeakRow> seats, List<EnemyCount> enemies) {
            this.round = round;
            this.totalLeaks = totalLeaks;
            this.totalAssisted = totalAssisted;
            this.totalEscaped = totalEscaped;
            this.seats = seats;
            this.enemies = enemies;
        }
    }

    static final class BossPlayerRow {
        final int rank;
        final int seat;
        final String name;
        final boolean isSelf;
        final int damage;
        final int dps;
        final double sharePct;
        BossPlayerRow(int rank, int seat, String name, boolean isSelf, int damage, int dps, double sharePct) {
            this.rank = rank;
            this.seat = seat;
            this.name = name;
            this.isSelf = isSelf;
            this.damage = damage;
            this.dps = dps;
            this.sharePct = sharePct;
        }
    }

    static final class BossSnapshot {
        final String bossEnemyId;
        final String bossName;
        final int bossHp;
        final int bossMaxHp;
        final int hpPct;
        final int teamDamage;
        final int teamDps;
        final int elapsedSec;
        final List<BossPlayerRow> players;
        BossSnapshot(String bossEnemyId, String bossName, int bossHp, int bossMaxHp, int hpPct, int teamDamage, int teamDps, int elapsedSec, List<BossPlayerRow> players) {
            this.bossEnemyId = bossEnemyId;
            this.bossName = bossName;
            this.bossHp = bossHp;
            this.bossMaxHp = bossMaxHp;
            this.hpPct = hpPct;
            this.teamDamage = teamDamage;
            this.teamDps = teamDps;
            this.elapsedSec = elapsedSec;
            this.players = players;
        }
    }

    static final class EventLogEntry {
        final long seq;
        final long tsMs;
        final int round;
        final String kind; // match | assist | escape | leak | tier | boss
        final int actorSeat;
        final String actorName;
        final int targetSeat;
        final String targetName;
        final String enemyId;
        final String enemyName;
        final int count;
        final String detail;
        EventLogEntry(
            long seq, long tsMs, int round, String kind,
            int actorSeat, String actorName, int targetSeat, String targetName,
            String enemyId, String enemyName, int count, String detail
        ) {
            this.seq = seq;
            this.tsMs = tsMs;
            this.round = round;
            this.kind = kind;
            this.actorSeat = actorSeat;
            this.actorName = actorName;
            this.targetSeat = targetSeat;
            this.targetName = targetName;
            this.enemyId = enemyId;
            this.enemyName = enemyName;
            this.count = count;
            this.detail = detail;
        }
    }

    static final class TelemetrySnapshot {
        final boolean vpnRunning;
        final int currentRound;
        final String phase;
        final int selfSeat;
        final int selfHp;
        final int banCount;
        final int forecastRound;
        final List<EnemyCount> forecastEnemies;
        final List<RoundWave> allWaves;
        final boolean activeRoundHasLeaks;
        final LeakSnapshot cumulativeLeak;
        final LeakSnapshot currentRoundLeak;
        final BossSnapshot boss;
        final List<EventLogEntry> recentLogs;
        TelemetrySnapshot(
            boolean vpnRunning, int currentRound, String phase, int selfSeat, int selfHp, int banCount,
            int forecastRound, List<EnemyCount> forecastEnemies, List<RoundWave> allWaves, boolean activeRoundHasLeaks,
            LeakSnapshot cumulativeLeak, LeakSnapshot currentRoundLeak, BossSnapshot boss,
            List<EventLogEntry> recentLogs
        ) {
            this.vpnRunning = vpnRunning;
            this.currentRound = currentRound;
            this.phase = phase;
            this.selfSeat = selfSeat;
            this.selfHp = selfHp;
            this.banCount = banCount;
            this.forecastRound = forecastRound;
            this.forecastEnemies = forecastEnemies;
            this.allWaves = allWaves;
            this.activeRoundHasLeaks = activeRoundHasLeaks;
            this.cumulativeLeak = cumulativeLeak;
            this.currentRoundLeak = currentRoundLeak;
            this.boss = boss;
            this.recentLogs = recentLogs != null ? recentLogs : Collections.<EventLogEntry>emptyList();
        }
    }

    private static final class RoundLeakRecord {
        final int[] leakedBySeat = new int[5];
        final int[] assistedBySeat = new int[5];
        final int[] coveredForSeat = new int[5];
        final int[] escapedBySeat = new int[5];
        boolean helpSettled = false;
        int selfLeaksRaw = -1;
        final LinkedHashMap<String, Integer> leakedEnemyIds = new LinkedHashMap<>();
        final Set<String> seenHelpKillKeys = new HashSet<>();
    }

    private static volatile boolean running = false;
    private static String status = "idle";
    private static String message = "未开启本机抓包（开启后可自动 Ban 选并实时显示出怪图标、4人漏兜与 Boss DPS）";
    private static int packetCount = 0;
    private static int messageCount = 0;
    private static long lastUpdateAt = 0;
    private static int matchSerial = 0;

    private static int currentRound = 0;
    private static String phase = "idle";
    private static int selfSeat = 0;
    private static int stageSeed = 0;
    private static String bossIdRaw = "";
    private static int bossHp = -1;
    private static int bossMaxHp = 0;
    private static long bossStartMs = 0;
    private static long bossLastMs = 0;

    private static final Map<Integer, String> playerNames = new HashMap<>();
    private static final Map<Integer, Integer> hpBySeat = new HashMap<>();
    private static final Map<Integer, Integer> shopLevelBySeat = new HashMap<>();
    private static final Map<Integer, Integer> bossDamageBySeat = new HashMap<>();
    private static final List<String> bannedCovenants = new ArrayList<>();
    private static boolean bansConfirmed = false;
    private static final int MAX_LOG_ENTRIES = 240;
    private static final Map<Integer, LinkedHashMap<String, Integer>> spawnPlanByRound = new LinkedHashMap<>();
    private static final Map<Integer, RoundLeakRecord> leaksByRound = new LinkedHashMap<>();
    private static final List<EventLogEntry> eventLogs = new ArrayList<>();
    private static final Set<String> seenEventLogKeys = new HashSet<>();
    private static long logSeq = 0;

    private BattleCaptureState() {}

    static synchronized boolean isRunning() { return running; }
    static synchronized boolean isBansConfirmed() { return bansConfirmed; }
    static synchronized int getCurrentRound() { return currentRound; }
    static synchronized long getLogSeq() { return logSeq; }
    static synchronized List<EventLogEntry> getRecentLogs(int limit) {
        int n = Math.min(Math.max(0, limit), eventLogs.size());
        if (n == 0) return Collections.emptyList();
        List<EventLogEntry> out = new ArrayList<>(n);
        for (int i = eventLogs.size() - 1; i >= eventLogs.size() - n; i--) {
            out.add(eventLogs.get(i));
        }
        return out;
    }

    private static void appendLog(
        String dedupKey, long tsMs, int round, String kind,
        int actorSeat, int targetSeat, String enemyId, int count, String detail
    ) {
        if (dedupKey != null && !dedupKey.isEmpty() && !seenEventLogKeys.add(dedupKey)) {
            return;
        }
        String aName = actorSeat >= 1 && actorSeat <= 4 ? seatLabel(actorSeat) : "";
        String tName = targetSeat >= 1 && targetSeat <= 4 ? seatLabel(targetSeat) : "";
        String eId = enemyId != null ? enemyId : "";
        String eName = !eId.isEmpty() ? StrongholdEnemyCatalog.enemyName(eId) : "";
        eventLogs.add(new EventLogEntry(
            ++logSeq, tsMs, Math.max(0, round), kind,
            actorSeat, aName, targetSeat, tName,
            eId, eName, Math.max(0, count), detail != null ? detail : ""
        ));
        if (eventLogs.size() > MAX_LOG_ENTRIES) {
            eventLogs.remove(0);
        }
    }
    static synchronized List<String> getBannedCovenantsSnapshot() {
        return Collections.unmodifiableList(new ArrayList<>(bannedCovenants));
    }

    static synchronized void setStatus(boolean active, String nextStatus, String detail) {
        running = active;
        status = nextStatus;
        message = detail != null ? detail : "";
        lastUpdateAt = System.currentTimeMillis();
        pushToOverlay();
    }

    static synchronized void resetMatch() {
        currentRound = 0;
        phase = "idle";
        selfSeat = 0;
        stageSeed = 0;
        bossIdRaw = "";
        bossHp = -1;
        bossMaxHp = 0;
        bossStartMs = 0;
        bossLastMs = 0;
        playerNames.clear();
        hpBySeat.clear();
        shopLevelBySeat.clear();
        bossDamageBySeat.clear();
        bannedCovenants.clear();
        bansConfirmed = false;
        spawnPlanByRound.clear();
        leaksByRound.clear();
        eventLogs.clear();
        seenEventLogKeys.clear();
        lastUpdateAt = System.currentTimeMillis();
        pushToOverlay();
    }

    static synchronized void notePacket() { packetCount++; }

    private static RoundLeakRecord leakRecord(int round) {
        int r = Math.max(1, Math.min(15, round));
        RoundLeakRecord rec = leaksByRound.get(r);
        if (rec == null) {
            rec = new RoundLeakRecord();
            leaksByRound.put(r, rec);
        }
        return rec;
    }

    static synchronized void accept(StrongholdWireDecoder.Event ev) {
        if (ev == null) return;
        messageCount++;
        long now = System.currentTimeMillis();
        lastUpdateAt = now;

        if ("phase".equals(ev.kind)) {
            boolean newSeed = ev.messageId == 300 && ev.stageSeed != 0 && ev.stageSeed != stageSeed;
            boolean openingReset = ev.round == 1 && currentRound > 1 && ("prep".equals(ev.phase) || "special_prep".equals(ev.phase));
            if (newSeed || openingReset) {
                matchSerial++;
                currentRound = 0;
                phase = "loading";
                selfSeat = 0;
                bossIdRaw = "";
                bossHp = -1;
                bossMaxHp = 0;
                bossStartMs = 0;
                bossLastMs = 0;
                playerNames.clear();
                hpBySeat.clear();
                shopLevelBySeat.clear();
                bossDamageBySeat.clear();
                bannedCovenants.clear();
                bansConfirmed = false;
                spawnPlanByRound.clear();
                leaksByRound.clear();
                eventLogs.clear();
                seenEventLogKeys.clear();
                if (ev.stageSeed != 0) stageSeed = ev.stageSeed;
                appendLog("match:" + matchSerial, now, 1, "match", 0, 0, "", 0, "新对局开始 · 抓包同步已就绪");
            } else if (ev.stageSeed != 0 && stageSeed == 0) {
                stageSeed = ev.stageSeed;
                if (matchSerial == 0) matchSerial = 1;
                appendLog("match:" + matchSerial, now, Math.max(1, ev.round), "match", 0, 0, "", 0, "对局已连接 · 实时抓包同步中");
            }

            if (ev.selfUid >= 1 && ev.selfUid <= 4) selfSeat = ev.selfUid;
            if (ev.bossId != null && !ev.bossId.isEmpty()) bossIdRaw = ev.bossId;
            for (Map.Entry<Integer, String> p : ev.players.entrySet()) {
                if (p.getKey() >= 1 && p.getKey() <= 4 && p.getValue() != null && !p.getValue().trim().isEmpty()) {
                    playerNames.put(p.getKey(), p.getValue().trim());
                }
            }

            if (ev.messageId == 300 || !ev.bannedBonds.isEmpty() || !ev.bannedUnitBonds.isEmpty()) {
                List<String> srcBonds = !ev.bannedBonds.isEmpty() ? ev.bannedBonds : ev.bannedUnitBonds;
                bannedCovenants.clear();
                for (String bond : srcBonds) {
                    String cn = StrongholdEnemyCatalog.covenantName(bond);
                    if (cn != null && !bannedCovenants.contains(cn)) bannedCovenants.add(cn);
                }
                bansConfirmed = true;
                if (matchSerial == 0) matchSerial = 1;
            }

            if (ev.round >= 1 && ev.round <= 15) {
                if ("boss".equals(ev.phase) && ev.round != currentRound) {
                    bossStartMs = now;
                    bossLastMs = now;
                    bossMaxHp = 0;
                    bossDamageBySeat.clear();
                }
                currentRound = ev.round;
            }
            if (ev.phase != null && !ev.phase.isEmpty()) {
                if ("boss".equals(ev.phase) && bossStartMs == 0) {
                    bossStartMs = now;
                    bossLastMs = now;
                }
                phase = ev.phase;
            }

            updateRuntimeMaps(ev, now);
            mergeSpawns(ev.spawnPreviews);

            if (ev.hasEscapedSection) {
                int r = ev.round > 0 ? ev.round : Math.max(1, currentRound);
                RoundLeakRecord rec = leakRecord(r);
                // 按席位汇总本回合漏出数
                int[] counts = new int[5];
                rec.leakedEnemyIds.clear();
                for (StrongholdWireDecoder.EscapedEnemy ee : ev.escapedEnemies) {
                    if (ee.owner >= 1 && ee.owner <= 4) counts[ee.owner]++;
                    String eid = resolveEnemyId(ee.enemyId, ee.instanceId, ee.isToken);
                    if (!eid.isEmpty()) {
                        Integer prev = rec.leakedEnemyIds.get(eid);
                        rec.leakedEnemyIds.put(eid, prev == null ? 1 : prev + 1);
                    }
                    if (ee.owner >= 1 && ee.owner <= 4) {
                        appendLog(
                            "leak:" + r + ":" + ee.instanceId + ":" + ee.isToken,
                            now, r, "leak", ee.owner, 0, eid, 1, "本路漏出"
                        );
                    }
                }
                for (int s = 1; s <= 4; s++) {
                    if (counts[s] > rec.leakedBySeat[s]) rec.leakedBySeat[s] = counts[s];
                }
            }
            if (ev.bossHp >= 0) {
                bossHp = ev.bossHp;
                if (bossHp > bossMaxHp) bossMaxHp = bossHp;
                if (bossHp > 0 && bossStartMs == 0) bossStartMs = now;
                bossLastMs = now;
                int br = ev.round > 0 ? ev.round : Math.max(14, currentRound);
                String bEid = EnemyPortraitAtlas.resolveBossEnemyId(bossIdRaw);
                appendLog("boss:" + br, now, br, "boss", 0, 0, bEid, 1, "首领战开始");
            }
        } else if ("preparation".equals(ev.kind)) {
            if (ev.round >= 1 && ev.round <= 15 && ev.round >= currentRound) {
                currentRound = ev.round;
                if (!"boss".equals(phase)) phase = "prep";
            }
            if (ev.seat >= 1 && ev.seat <= 4) {
                if (selfSeat == 0) selfSeat = ev.seat;
                if (ev.hp >= 0) hpBySeat.put(ev.seat, ev.hp);
            }
            updateShopLevels(ev);
        } else if ("runtime".equals(ev.kind)) {
            updateRuntimeMaps(ev, now);
        } else if ("spawn_plan".equals(ev.kind)) {
            if (currentRound > 1) {
                boolean hasR1 = false;
                for (StrongholdWireDecoder.SpawnPreview sp : ev.spawnPreviews) {
                    if (sp.roundNumber == 1) { hasR1 = true; break; }
                }
                if (hasR1) {
                    spawnPlanByRound.clear();
                    leaksByRound.clear();
                }
            }
            mergeSpawns(ev.spawnPreviews);
        } else if ("self_finish".equals(ev.kind)) {
            if (ev.round >= 1 && ev.round <= 15 && !ev.fromRejoin) {
                if (ev.round > currentRound) currentRound = ev.round;
                RoundLeakRecord rec = leakRecord(ev.round);
                rec.selfLeaksRaw = Math.max(0, ev.selfEscapedCount);
                int seat = selfSeat >= 1 && selfSeat <= 4 ? selfSeat : 1;
                if (rec.selfLeaksRaw > rec.leakedBySeat[seat]) {
                    rec.leakedBySeat[seat] = rec.selfLeaksRaw;
                }
            }
        } else if ("help_kill".equals(ev.kind)) {
            int r = Math.max(1, currentRound);
            RoundLeakRecord rec = leakRecord(r);
            for (StrongholdWireDecoder.HelpKill hk : ev.helpKills) {
                String key = hk.instanceId + ":" + hk.isToken;
                if (rec.seenHelpKillKeys.add(key)) {
                    if (hk.killerUid >= 1 && hk.killerUid <= 4) rec.assistedBySeat[hk.killerUid]++;
                    if (hk.ownerUid >= 1 && hk.ownerUid <= 4) rec.coveredForSeat[hk.ownerUid]++;
                }
                if (hk.killerUid >= 1 && hk.killerUid <= 4) {
                    appendLog(
                        "assist:" + r + ":" + hk.instanceId + ":" + hk.isToken,
                        now, r, "assist", hk.killerUid, hk.ownerUid, hk.enemyId, 1, "协防兜底击杀"
                    );
                }
            }
        } else if ("help_finish".equals(ev.kind)) {
            if (ev.round >= 1 && ev.round <= 15) {
                if (ev.round > currentRound) currentRound = ev.round;
                RoundLeakRecord rec = leakRecord(ev.round);
                rec.helpSettled = true;
                int[] assistSeat = new int[5];
                int[] covSeat = new int[5];
                int[] escSeat = new int[5];
                for (StrongholdWireDecoder.HelpKill hk : ev.helpKills) {
                    rec.seenHelpKillKeys.add(hk.instanceId + ":" + hk.isToken);
                    if (hk.killerUid >= 1 && hk.killerUid <= 4) assistSeat[hk.killerUid]++;
                    if (hk.ownerUid >= 1 && hk.ownerUid <= 4) covSeat[hk.ownerUid]++;
                    if (hk.enemyId != null && !hk.enemyId.isEmpty() && rec.leakedEnemyIds.isEmpty()) {
                        Integer prev = rec.leakedEnemyIds.get(hk.enemyId);
                        rec.leakedEnemyIds.put(hk.enemyId, prev == null ? 1 : prev + 1);
                    }
                    if (hk.killerUid >= 1 && hk.killerUid <= 4) {
                        appendLog(
                            "assist:" + ev.round + ":" + hk.instanceId + ":" + hk.isToken,
                            now, ev.round, "assist", hk.killerUid, hk.ownerUid, hk.enemyId, 1, "协防兜底击杀"
                        );
                    }
                }
                for (StrongholdWireDecoder.EscapedEnemy ee : ev.escapedEnemies) {
                    if (ee.owner >= 1 && ee.owner <= 4) escSeat[ee.owner]++;
                    String eid = resolveEnemyId(ee.enemyId, ee.instanceId, ee.isToken);
                    if (!eid.isEmpty()) {
                        Integer prev = rec.leakedEnemyIds.get(eid);
                        if (prev == null) rec.leakedEnemyIds.put(eid, 1);
                    }
                    if (ee.owner >= 1 && ee.owner <= 4) {
                        appendLog(
                            "esc:" + ev.round + ":" + ee.instanceId + ":" + ee.isToken,
                            now, ev.round, "escape", ee.owner, 0, eid, 1, "未兜住逃逸"
                        );
                    }
                }
                for (int s = 1; s <= 4; s++) {
                    rec.assistedBySeat[s] = Math.max(rec.assistedBySeat[s], assistSeat[s]);
                    rec.coveredForSeat[s] = Math.max(rec.coveredForSeat[s], covSeat[s]);
                    rec.escapedBySeat[s] = escSeat[s];
                    int minLeaked = rec.coveredForSeat[s] + rec.escapedBySeat[s];
                    if (minLeaked > rec.leakedBySeat[s]) rec.leakedBySeat[s] = minLeaked;
                }
            }
        }

        if (currentRound > 0) {
            try { OverlayService.notifyObservedRound(currentRound); } catch (Throwable ignored) {}
        }
        pushToOverlay();
    }

    private static void updateShopLevels(StrongholdWireDecoder.Event ev) {
        long now = System.currentTimeMillis();
        int r = ev.round > 0 ? ev.round : Math.max(1, currentRound);
        for (Map.Entry<Integer, Integer> e : ev.shopLevelBySeat.entrySet()) {
            int s = e.getKey();
            int lv = e.getValue() != null ? e.getValue() : 0;
            if (s >= 1 && s <= 4 && lv >= 1 && lv <= 6) {
                Integer prev = shopLevelBySeat.put(s, lv);
                if ((prev != null && lv > prev) || (prev == null && lv >= 2)) {
                    String fromTxt = prev != null ? (prev + "本 → " + lv + "本") : ("升至 " + lv + "本");
                    appendLog("tier:" + s + ":" + lv, now, r, "tier", s, 0, "", lv, fromTxt);
                }
            }
        }
    }

    private static void updateRuntimeMaps(StrongholdWireDecoder.Event ev, long now) {
        updateShopLevels(ev);
        for (Map.Entry<Integer, Integer> e : ev.hpBySeat.entrySet()) {
            if (e.getKey() >= 1 && e.getKey() <= 4 && e.getValue() != null) {
                hpBySeat.put(e.getKey(), e.getValue());
            }
        }
        boolean anyDmg = false;
        for (Map.Entry<Integer, Integer> e : ev.bossDamageBySeat.entrySet()) {
            int s = e.getKey();
            int dmg = e.getValue() != null ? e.getValue() : 0;
            if (s >= 1 && s <= 4 && dmg > 0) {
                Integer prev = bossDamageBySeat.get(s);
                if (prev == null || dmg >= prev) bossDamageBySeat.put(s, dmg);
                anyDmg = true;
            }
        }
        if (anyDmg) {
            if (bossStartMs == 0) bossStartMs = now;
            bossLastMs = now;
        }
    }

    private static void mergeSpawns(List<StrongholdWireDecoder.SpawnPreview> previews) {
        if (previews == null || previews.isEmpty()) return;
        Map<Integer, Map<String, Integer>> batchByRound = new LinkedHashMap<>();
        for (StrongholdWireDecoder.SpawnPreview sp : previews) {
            if (sp.roundNumber < 1 || sp.roundNumber > 15 || sp.count <= 0) continue;
            Map<String, Integer> map = batchByRound.get(sp.roundNumber);
            if (map == null) {
                map = new LinkedHashMap<>();
                batchByRound.put(sp.roundNumber, map);
            }
            map.put(sp.actionIndex + "|" + sp.enemyId, sp.count);
        }
        for (Map.Entry<Integer, Map<String, Integer>> entry : batchByRound.entrySet()) {
            LinkedHashMap<String, Integer> agg = new LinkedHashMap<>();
            for (Map.Entry<String, Integer> item : entry.getValue().entrySet()) {
                int bar = item.getKey().indexOf('|');
                String eid = bar >= 0 ? item.getKey().substring(bar + 1) : item.getKey();
                Integer prev = agg.get(eid);
                agg.put(eid, (prev == null ? 0 : prev) + item.getValue());
            }
            spawnPlanByRound.put(entry.getKey(), agg);
        }
    }

    private static String resolveEnemyId(String explicitId, int instanceId, boolean isToken) {
        if (explicitId != null && !explicitId.isEmpty()) return explicitId;
        if (isToken) {
            String tok = StrongholdEnemyCatalog.resolveTokenEnemyId(instanceId);
            if (!tok.isEmpty()) return tok;
        }
        return "";
    }

    static synchronized int pickForecastRound() {
        int next = currentRound > 0 ? Math.min(15, currentRound + 1) : 1;
        if ("prep".equals(phase) || "special_prep".equals(phase)) {
            if (spawnPlanByRound.containsKey(currentRound)) return currentRound;
            if (spawnPlanByRound.containsKey(next)) return next;
        } else {
            if (spawnPlanByRound.containsKey(next)) return next;
            if (spawnPlanByRound.containsKey(currentRound)) return currentRound;
        }
        int best = 0;
        for (Integer r : spawnPlanByRound.keySet()) {
            if (r >= currentRound && (best == 0 || r < best)) best = r;
        }
        return best;
    }

    static synchronized List<EnemyCount> getSpawnList(int roundNo) {
        LinkedHashMap<String, Integer> map = spawnPlanByRound.get(roundNo);
        if (map == null || map.isEmpty()) return Collections.emptyList();
        List<EnemyCount> list = new ArrayList<>();
        for (Map.Entry<String, Integer> e : map.entrySet()) {
            list.add(new EnemyCount(e.getKey(), StrongholdEnemyCatalog.enemyName(e.getKey()), e.getValue()));
        }
        Collections.sort(list, (a, b) -> Integer.compare(b.count, a.count));
        return list;
    }

    static synchronized String formatSpawnSummary(int roundNo, int maxKinds) {
        List<EnemyCount> list = getSpawnList(roundNo);
        if (list.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(maxKinds, list.size()); i++) {
            if (i > 0) sb.append(" · ");
            sb.append(list.get(i).name).append("×").append(list.get(i).count);
        }
        if (list.size() > maxKinds) sb.append(" 等").append(list.size()).append("种");
        return sb.toString();
    }

    static synchronized List<RoundWave> buildAllWaves() {
        if (spawnPlanByRound.isEmpty()) return Collections.emptyList();
        List<Integer> rounds = new ArrayList<>(spawnPlanByRound.keySet());
        Collections.sort(rounds);
        List<RoundWave> waves = new ArrayList<>();
        for (Integer r : rounds) {
            List<EnemyCount> list = getSpawnList(r);
            if (!list.isEmpty()) waves.add(new RoundWave(r, list));
        }
        return waves;
    }

    private static String seatLabel(int seat) {
        String n = playerNames.get(seat);
        if (n != null && !n.isEmpty()) {
            return n.length() > 6 ? n.substring(0, 6) : n;
        }
        return seat + "P";
    }

    private static int seatHp(int seat) {
        Integer h = hpBySeat.get(seat);
        return h != null ? h : -1;
    }

    private static int seatShopLevel(int seat) {
        Integer lv = shopLevelBySeat.get(seat);
        return lv != null ? lv : 0;
    }

    /** 构造指定单回合（round > 0）或整局累计（round == 0）的 4 玩家漏/兜图表快照。 */
    static synchronized LeakSnapshot buildLeakSnapshot(int targetRound) {
        int[] leaked = new int[5];
        int[] assisted = new int[5];
        int[] covered = new int[5];
        int[] escaped = new int[5];
        LinkedHashMap<String, Integer> enemyCounts = new LinkedHashMap<>();

        if (targetRound > 0) {
            RoundLeakRecord rec = leaksByRound.get(targetRound);
            if (rec != null) {
                for (int s = 1; s <= 4; s++) {
                    leaked[s] = rec.leakedBySeat[s];
                    assisted[s] = rec.assistedBySeat[s];
                    covered[s] = rec.coveredForSeat[s];
                    escaped[s] = rec.helpSettled ? rec.escapedBySeat[s] : Math.max(0, rec.leakedBySeat[s] - rec.coveredForSeat[s]);
                }
                enemyCounts.putAll(rec.leakedEnemyIds);
            }
        } else {
            for (RoundLeakRecord rec : leaksByRound.values()) {
                for (int s = 1; s <= 4; s++) {
                    leaked[s] += rec.leakedBySeat[s];
                    assisted[s] += rec.assistedBySeat[s];
                    covered[s] += rec.coveredForSeat[s];
                    escaped[s] += rec.helpSettled ? rec.escapedBySeat[s] : Math.max(0, rec.leakedBySeat[s] - rec.coveredForSeat[s]);
                }
                for (Map.Entry<String, Integer> e : rec.leakedEnemyIds.entrySet()) {
                    Integer prev = enemyCounts.get(e.getKey());
                    enemyCounts.put(e.getKey(), (prev == null ? 0 : prev) + e.getValue());
                }
            }
        }

        int sumLeak = 0, sumAssist = 0, sumEsc = 0;
        List<SeatLeakRow> rows = new ArrayList<>();
        int effectiveSelf = selfSeat >= 1 && selfSeat <= 4 ? selfSeat : 1;
        for (int s = 1; s <= 4; s++) {
            sumLeak += leaked[s];
            sumAssist += assisted[s];
            sumEsc += escaped[s];
            rows.add(new SeatLeakRow(s, seatLabel(s), s == effectiveSelf, seatHp(s), seatShopLevel(s), leaked[s], assisted[s], covered[s], escaped[s]));
        }
        List<EnemyCount> enemies = new ArrayList<>();
        for (Map.Entry<String, Integer> e : enemyCounts.entrySet()) {
            enemies.add(new EnemyCount(e.getKey(), StrongholdEnemyCatalog.enemyName(e.getKey()), e.getValue()));
        }
        Collections.sort(enemies, (a, b) -> Integer.compare(b.count, a.count));
        return new LeakSnapshot(targetRound, sumLeak, sumAssist, sumEsc, rows, enemies);
    }

    static synchronized BossSnapshot buildBossSnapshot() {
        String resolvedId = EnemyPortraitAtlas.resolveBossEnemyId(bossIdRaw);
        String bName = !resolvedId.isEmpty() ? StrongholdEnemyCatalog.enemyName(resolvedId) : "终局首领";
        int teamDmg = 0;
        for (int s = 1; s <= 4; s++) {
            Integer d = bossDamageBySeat.get(s);
            if (d != null && d > 0) teamDmg += d;
        }
        long elapsedMs = (bossStartMs > 0 && bossLastMs >= bossStartMs) ? (bossLastMs - bossStartMs) : 0;
        int elapsedSec = Math.max(1, (int) Math.round(elapsedMs / 1000.0));
        int teamDps = teamDmg > 0 ? Math.round((float) teamDmg / elapsedSec) : 0;

        int effMaxHp = Math.max(bossMaxHp, (bossHp > 0 ? bossHp : 0) + teamDmg);
        int hpPct = (effMaxHp > 0 && bossHp >= 0) ? Math.max(0, Math.min(100, Math.round(bossHp * 100f / effMaxHp))) : -1;

        int effectiveSelf = selfSeat >= 1 && selfSeat <= 4 ? selfSeat : 1;
        List<int[]> rawSeats = new ArrayList<>();
        for (int s = 1; s <= 4; s++) {
            int d = bossDamageBySeat.containsKey(s) ? bossDamageBySeat.get(s) : 0;
            rawSeats.add(new int[] { s, d });
        }
        Collections.sort(rawSeats, (a, b) -> {
            int c = Integer.compare(b[1], a[1]);
            return c != 0 ? c : Integer.compare(a[0], b[0]);
        });
        List<BossPlayerRow> players = new ArrayList<>();
        for (int i = 0; i < rawSeats.size(); i++) {
            int s = rawSeats.get(i)[0];
            int d = rawSeats.get(i)[1];
            int dps = d > 0 ? Math.round((float) d / elapsedSec) : 0;
            double share = teamDmg > 0 ? (d * 100.0 / teamDmg) : 0.0;
            players.add(new BossPlayerRow(i + 1, s, seatLabel(s), s == effectiveSelf, d, dps, share));
        }
        return new BossSnapshot(resolvedId, bName, bossHp, effMaxHp, hpPct, teamDmg, teamDps, elapsedSec, players);
    }

    static synchronized String formatLeakSummary() {
        int r = currentRound > 0 ? currentRound : 1;
        LeakSnapshot snap = buildLeakSnapshot(r);
        if (snap.totalLeaks == 0 && snap.totalAssisted == 0 && snap.totalEscaped == 0) return "";
        StringBuilder sb = new StringBuilder();
        sb.append("总漏 ").append(snap.totalLeaks).append(" · 兜 ").append(snap.totalAssisted);
        if (snap.totalEscaped > 0) sb.append(" · 逃 ").append(snap.totalEscaped);
        return sb.toString();
    }

    static synchronized TelemetrySnapshot buildTelemetrySnapshot() {
        int fcRound = pickForecastRound();
        List<EnemyCount> fcList = fcRound > 0 ? getSpawnList(fcRound) : Collections.<EnemyCount>emptyList();
        List<RoundWave> allWaves = buildAllWaves();
        int curR = currentRound > 0 ? currentRound : 1;
        LeakSnapshot curLeak = buildLeakSnapshot(curR);
        LeakSnapshot cumLeak = buildLeakSnapshot(0);
        boolean activeHasLeaks = curLeak.totalLeaks > 0 || curLeak.totalEscaped > 0 || "assist".equals(phase);
        int myHp = selfSeat >= 1 && selfSeat <= 4 ? seatHp(selfSeat) : seatHp(1);
        return new TelemetrySnapshot(
            running, currentRound, phase, selfSeat, myHp, bansConfirmed ? bannedCovenants.size() : -1,
            fcRound, fcList, allWaves, activeHasLeaks, cumLeak, curLeak, buildBossSnapshot(),
            getRecentLogs(12)
        );
    }

    private static void pushToOverlay() {
        TelemetrySnapshot snap = buildTelemetrySnapshot();
        try {
            OverlayService.updateTelemetrySnapshot(snap);
        } catch (Throwable ignored) {}
    }

    static synchronized String json() {
        try {
            TelemetrySnapshot snap = buildTelemetrySnapshot();
            JSONObject obj = new JSONObject();
            obj.put("running", running);
            obj.put("status", status);
            obj.put("message", message);
            obj.put("packets", packetCount);
            obj.put("messages", messageCount);
            obj.put("matchSerial", matchSerial);
            obj.put("round", currentRound);
            obj.put("phase", phase);
            obj.put("selfSeat", selfSeat);
            obj.put("selfHp", snap.selfHp);
            obj.put("bossHp", snap.boss.bossHp);
            obj.put("bossTotalDamage", snap.boss.teamDamage);
            obj.put("bansConfirmed", bansConfirmed);
            obj.put("bannedCovenants", new JSONArray(bannedCovenants));
            obj.put("forecastRound", snap.forecastRound);
            JSONArray fcArr = new JSONArray();
            for (EnemyCount ec : snap.forecastEnemies) {
                fcArr.put(new JSONObject().put("id", ec.enemyId).put("name", ec.name).put("count", ec.count));
            }
            obj.put("forecastEnemies", fcArr);
            obj.put("forecastText", snap.forecastRound > 0 ? formatSpawnSummary(snap.forecastRound, 5) : "");
            JSONArray wavesArr = new JSONArray();
            for (RoundWave w : snap.allWaves) {
                JSONArray we = new JSONArray();
                for (EnemyCount ec : w.enemies) {
                    we.put(new JSONObject().put("id", ec.enemyId).put("name", ec.name).put("count", ec.count));
                }
                wavesArr.put(new JSONObject().put("round", w.round).put("enemies", we));
            }
            obj.put("allWaves", wavesArr);
            JSONObject tiers = new JSONObject();
            for (Map.Entry<Integer, Integer> e : shopLevelBySeat.entrySet()) {
                tiers.put(String.valueOf(e.getKey()), e.getValue());
            }
            obj.put("shopLevels", tiers);

            // 4 席累计双轨态势（供安卓 Lite 战报仪实时双栏界面直读）
            JSONArray seatsArr = new JSONArray();
            for (SeatLeakRow sr : snap.cumulativeLeak.seats) {
                seatsArr.put(new JSONObject()
                    .put("seat", sr.seat)
                    .put("name", sr.name)
                    .put("isSelf", sr.isSelf)
                    .put("hp", sr.hp)
                    .put("shopLevel", sr.shopLevel)
                    .put("leaked", sr.leaked)
                    .put("assisted", sr.assisted)
                    .put("covered", sr.covered)
                    .put("escaped", sr.escaped));
            }
            obj.put("seats", seatsArr);

            // 按回合 4 人漏兜矩阵（供 Lite 回合矩阵页直读）
            JSONArray roundsArr = new JSONArray();
            List<Integer> roundKeys = new ArrayList<>(leaksByRound.keySet());
            Collections.sort(roundKeys);
            for (int r : roundKeys) {
                LeakSnapshot rs = buildLeakSnapshot(r);
                JSONArray rSeats = new JSONArray();
                for (SeatLeakRow sr : rs.seats) {
                    rSeats.put(new JSONObject()
                        .put("seat", sr.seat)
                        .put("leaked", sr.leaked)
                        .put("assisted", sr.assisted)
                        .put("covered", sr.covered)
                        .put("escaped", sr.escaped));
                }
                JSONArray rEnemies = new JSONArray();
                for (EnemyCount ec : rs.enemies) {
                    rEnemies.put(new JSONObject().put("id", ec.enemyId).put("name", ec.name).put("count", ec.count));
                }
                roundsArr.put(new JSONObject()
                    .put("round", r)
                    .put("totalLeaks", rs.totalLeaks)
                    .put("totalAssisted", rs.totalAssisted)
                    .put("totalEscaped", rs.totalEscaped)
                    .put("seats", rSeats)
                    .put("enemies", rEnemies));
            }
            obj.put("rounds", roundsArr);

            // Boss MMO 排行榜快照
            JSONObject bossObj = new JSONObject();
            bossObj.put("enemyId", snap.boss.bossEnemyId);
            bossObj.put("name", snap.boss.bossName);
            bossObj.put("hp", snap.boss.bossHp);
            bossObj.put("maxHp", snap.boss.bossMaxHp);
            bossObj.put("hpPct", snap.boss.hpPct);
            bossObj.put("teamDamage", snap.boss.teamDamage);
            bossObj.put("teamDps", snap.boss.teamDps);
            bossObj.put("elapsedSec", snap.boss.elapsedSec);
            JSONArray bpArr = new JSONArray();
            for (BossPlayerRow bp : snap.boss.players) {
                bpArr.put(new JSONObject()
                    .put("rank", bp.rank)
                    .put("seat", bp.seat)
                    .put("name", bp.name)
                    .put("isSelf", bp.isSelf)
                    .put("damage", bp.damage)
                    .put("dps", bp.dps)
                    .put("sharePct", bp.sharePct));
            }
            bossObj.put("players", bpArr);
            obj.put("boss", bossObj);

            // 去重实时事件流水 Logs（最新 80 条，倒序）
            obj.put("logSeq", logSeq);
            JSONArray logsArr = new JSONArray();
            for (EventLogEntry le : getRecentLogs(80)) {
                logsArr.put(new JSONObject()
                    .put("seq", le.seq)
                    .put("ts", le.tsMs)
                    .put("round", le.round)
                    .put("kind", le.kind)
                    .put("actorSeat", le.actorSeat)
                    .put("actorName", le.actorName)
                    .put("targetSeat", le.targetSeat)
                    .put("targetName", le.targetName)
                    .put("enemyId", le.enemyId)
                    .put("enemyName", le.enemyName)
                    .put("count", le.count)
                    .put("detail", le.detail));
            }
            obj.put("logs", logsArr);

            JSONObject leak = new JSONObject();
            leak.put("round", snap.currentRoundLeak.round);
            leak.put("totalLeaks", snap.currentRoundLeak.totalLeaks);
            leak.put("assistKills", snap.currentRoundLeak.totalAssisted);
            leak.put("uncoveredLeaks", snap.currentRoundLeak.totalEscaped);
            leak.put("cumLeaks", snap.cumulativeLeak.totalLeaks);
            leak.put("cumAssisted", snap.cumulativeLeak.totalAssisted);
            leak.put("cumEscaped", snap.cumulativeLeak.totalEscaped);
            leak.put("summary", formatLeakSummary());
            JSONArray leakList = new JSONArray();
            for (EnemyCount ec : snap.currentRoundLeak.enemies) {
                leakList.put(new JSONObject().put("id", ec.enemyId).put("name", ec.name).put("count", ec.count));
            }
            leak.put("enemies", leakList);
            obj.put("leak", leak);
            obj.put("updatedAt", lastUpdateAt);
            return obj.toString();
        } catch (Exception ignored) {
            return "{\"running\":false,\"status\":\"error\"}";
        }
    }
}
