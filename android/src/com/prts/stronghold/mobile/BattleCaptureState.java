package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 手机免 Root 实时抓包对局聚合状态：
 * 汇总下回合出怪预告、本回合/最新回合己方漏怪与队友协防兜底数、自动同步 26 项盟约与当前回合，
 * 同时向 OverlayService 战术迷你条实时推送精炼摘要，向 WebView 暴露 JSON 状态。
 */
final class BattleCaptureState {
    private static volatile boolean running = false;
    private static String status = "idle"; // idle | permission | running | error
    private static String message = "未开启本机抓包（开启后可实时显示下回合出怪与漏怪兜底）";
    private static int packetCount = 0;
    private static int messageCount = 0;
    private static long lastUpdateAt = 0;
    private static int matchSerial = 0;

    private static int currentRound = 0;
    private static String phase = "idle";
    private static int selfSeat = 0;
    private static int selfHp = -1;
    private static int bossHp = -1;
    private static int bossTotalDamage = 0;
    private static int stageSeed = 0;

    private static final List<String> bannedCovenants = new ArrayList<>();
    private static boolean bansConfirmed = false;
    // round -> (enemyId -> count)
    private static final Map<Integer, LinkedHashMap<String, Integer>> spawnPlanByRound = new LinkedHashMap<>();

    // 漏怪 / 协防兜底统计（按回合）
    private static int leakRound = 0;
    private static int selfLeaks = -1;
    private static int totalLeaks = 0;
    private static int assistKills = 0;
    private static int uncoveredLeaks = -1;
    private static final LinkedHashMap<String, Integer> leakedEnemies = new LinkedHashMap<>();
    private static final Set<String> seenHelpKillKeys = new HashSet<>();

    private BattleCaptureState() {}

    static synchronized boolean isRunning() { return running; }

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
        selfHp = -1;
        bossHp = -1;
        bossTotalDamage = 0;
        stageSeed = 0;
        bannedCovenants.clear();
        bansConfirmed = false;
        spawnPlanByRound.clear();
        clearLeakStats(0);
        lastUpdateAt = System.currentTimeMillis();
        pushToOverlay();
    }

    private static void clearLeakStats(int round) {
        leakRound = round;
        selfLeaks = -1;
        totalLeaks = 0;
        assistKills = 0;
        uncoveredLeaks = -1;
        leakedEnemies.clear();
        seenHelpKillKeys.clear();
    }

    static synchronized void notePacket() {
        packetCount++;
    }

    static synchronized void accept(StrongholdWireDecoder.Event ev) {
        if (ev == null) return;
        messageCount++;
        lastUpdateAt = System.currentTimeMillis();

        if ("phase".equals(ev.kind)) {
            boolean newSeed = ev.messageId == 300 && ev.stageSeed != 0 && ev.stageSeed != stageSeed;
            boolean openingReset = ev.round == 1 && currentRound > 1 && ("prep".equals(ev.phase) || "special_prep".equals(ev.phase));
            if (newSeed || openingReset) {
                matchSerial++;
                currentRound = 0;
                phase = "loading";
                selfSeat = 0;
                selfHp = -1;
                bossHp = -1;
                bossTotalDamage = 0;
                bannedCovenants.clear();
                bansConfirmed = false;
                spawnPlanByRound.clear();
                clearLeakStats(0);
                if (ev.stageSeed != 0) stageSeed = ev.stageSeed;
            } else if (ev.stageSeed != 0 && stageSeed == 0) {
                stageSeed = ev.stageSeed;
                if (matchSerial == 0) matchSerial = 1;
            }

            if (ev.selfUid >= 1 && ev.selfUid <= 4) selfSeat = ev.selfUid;

            if (ev.messageId == 300 || !ev.bannedBonds.isEmpty()) {
                bannedCovenants.clear();
                for (String bond : ev.bannedBonds) {
                    String cn = StrongholdEnemyCatalog.covenantName(bond);
                    if (cn != null && !bannedCovenants.contains(cn)) bannedCovenants.add(cn);
                }
                bansConfirmed = true;
                if (matchSerial == 0) matchSerial = 1;
            }

            if (ev.round >= 1 && ev.round <= 15) {
                if (ev.round != currentRound && ev.round > currentRound) {
                    // 新回合开始：清空旧回合漏怪计数以便记录新回合（若尚未结算则保留到新回合战斗开始）
                    if ("self".equals(ev.phase) || "boss".equals(ev.phase)) {
                        clearLeakStats(ev.round);
                    }
                }
                currentRound = ev.round;
            }
            if (ev.phase != null && !ev.phase.isEmpty()) phase = ev.phase;

            updateHpAndBoss(ev);
            mergeSpawns(ev.spawnPreviews);

            if (ev.hasEscapedSection) {
                int r = ev.round > 0 ? ev.round : currentRound;
                if (r > 0 && r != leakRound) clearLeakStats(r);
                totalLeaks = ev.escapedEnemies.size();
                leakedEnemies.clear();
                for (StrongholdWireDecoder.EscapedEnemy ee : ev.escapedEnemies) {
                    String eid = resolveEnemyId(ee.enemyId, ee.instanceId, ee.isToken);
                    String name = StrongholdEnemyCatalog.enemyName(eid);
                    Integer prev = leakedEnemies.get(name);
                    leakedEnemies.put(name, prev == null ? 1 : prev + 1);
                }
                if (uncoveredLeaks < 0 && totalLeaks > 0) {
                    uncoveredLeaks = Math.max(0, totalLeaks - assistKills);
                }
            }
            if (ev.bossHp >= 0) bossHp = ev.bossHp;
        } else if ("preparation".equals(ev.kind)) {
            if (ev.round >= 1 && ev.round <= 15 && ev.round >= currentRound) {
                currentRound = ev.round;
                if (!"boss".equals(phase)) phase = "prep";
            }
            if (ev.seat >= 1 && ev.seat <= 4 && (selfSeat == 0 || selfSeat == ev.seat)) {
                if (selfSeat == 0) selfSeat = ev.seat;
                if (ev.hp >= 0) selfHp = ev.hp;
            }
        } else if ("runtime".equals(ev.kind)) {
            updateHpAndBoss(ev);
        } else if ("spawn_plan".equals(ev.kind)) {
            // 新局首轮预告触发自动清理旧局预告
            boolean rollover = currentRound > 1;
            if (rollover) {
                boolean hasR1 = false;
                for (StrongholdWireDecoder.SpawnPreview sp : ev.spawnPreviews) {
                    if (sp.roundNumber == 1) { hasR1 = true; break; }
                }
                if (hasR1) {
                    spawnPlanByRound.clear();
                    clearLeakStats(1);
                }
            }
            mergeSpawns(ev.spawnPreviews);
        } else if ("self_finish".equals(ev.kind)) {
            if (ev.round >= 1 && ev.round <= 15 && !ev.fromRejoin) {
                if (ev.round != leakRound) clearLeakStats(ev.round);
                if (ev.round > currentRound) currentRound = ev.round;
                selfLeaks = Math.max(0, ev.selfEscapedCount);
                if (totalLeaks < selfLeaks) totalLeaks = selfLeaks;
            }
        } else if ("help_kill".equals(ev.kind)) {
            if (leakRound == 0 && currentRound > 0) leakRound = currentRound;
            for (StrongholdWireDecoder.HelpKill hk : ev.helpKills) {
                String key = hk.instanceId + ":" + hk.isToken;
                if (seenHelpKillKeys.add(key)) {
                    assistKills = seenHelpKillKeys.size();
                    if (totalLeaks > 0) {
                        uncoveredLeaks = Math.max(0, totalLeaks - assistKills);
                    }
                }
            }
        } else if ("help_finish".equals(ev.kind)) {
            if (ev.round >= 1 && ev.round <= 15) {
                if (ev.round != leakRound) clearLeakStats(ev.round);
                if (ev.round > currentRound) currentRound = ev.round;
                for (StrongholdWireDecoder.HelpKill hk : ev.helpKills) {
                    seenHelpKillKeys.add(hk.instanceId + ":" + hk.isToken);
                }
                assistKills = Math.max(assistKills, ev.helpKills.size());
                uncoveredLeaks = ev.escapedEnemies.size();
                totalLeaks = Math.max(totalLeaks, assistKills + uncoveredLeaks);
                if (!ev.escapedEnemies.isEmpty()) {
                    leakedEnemies.clear();
                    for (StrongholdWireDecoder.EscapedEnemy ee : ev.escapedEnemies) {
                        String eid = resolveEnemyId(ee.enemyId, ee.instanceId, ee.isToken);
                        String name = StrongholdEnemyCatalog.enemyName(eid);
                        Integer prev = leakedEnemies.get(name);
                        leakedEnemies.put(name, prev == null ? 1 : prev + 1);
                    }
                }
            }
        }

        if (currentRound > 0) {
            try { OverlayService.notifyObservedRound(currentRound); } catch (Throwable ignored) {}
        }
        pushToOverlay();
    }

    private static void updateHpAndBoss(StrongholdWireDecoder.Event ev) {
        if (selfSeat >= 1 && ev.hpBySeat.containsKey(selfSeat)) {
            selfHp = ev.hpBySeat.get(selfSeat);
        } else if (selfSeat == 0 && ev.hpBySeat.size() == 1) {
            selfHp = ev.hpBySeat.values().iterator().next();
        }
        int sumDmg = 0;
        for (Integer d : ev.bossDamageBySeat.values()) {
            if (d != null && d > 0) sumDmg += d;
        }
        if (sumDmg > bossTotalDamage) bossTotalDamage = sumDmg;
    }

    private static void mergeSpawns(List<StrongholdWireDecoder.SpawnPreview> previews) {
        if (previews == null || previews.isEmpty()) return;
        // 按 (round, actionIndex, enemyId) 归并防同一预告帧重复累加
        Map<Integer, Map<String, Integer>> batchByRound = new LinkedHashMap<>();
        for (StrongholdWireDecoder.SpawnPreview sp : previews) {
            if (sp.roundNumber < 1 || sp.roundNumber > 15 || sp.count <= 0) continue;
            Map<String, Integer> map = batchByRound.get(sp.roundNumber);
            if (map == null) {
                map = new LinkedHashMap<>();
                batchByRound.put(sp.roundNumber, map);
            }
            String key = sp.actionIndex + "|" + sp.enemyId;
            map.put(key, sp.count);
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

    /** 选取当前最有参考价值的预告回合：战斗/结算后看下一回合，备战期优先看本回合或下一回合。 */
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

    static synchronized String formatSpawnSummary(int roundNo, int maxKinds) {
        LinkedHashMap<String, Integer> map = spawnPlanByRound.get(roundNo);
        if (map == null || map.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        int shown = 0;
        for (Map.Entry<String, Integer> e : map.entrySet()) {
            if (shown >= maxKinds) {
                sb.append(" 等").append(map.size()).append("种");
                break;
            }
            if (shown > 0) sb.append(" · ");
            sb.append(StrongholdEnemyCatalog.enemyName(e.getKey())).append("×").append(e.getValue());
            shown++;
        }
        return sb.toString();
    }

    static synchronized String formatLeakSummary() {
        if (leakRound <= 0) return "";
        boolean hasAny = (selfLeaks >= 0) || totalLeaks > 0 || assistKills > 0 || uncoveredLeaks > 0;
        if (!hasAny) return "";
        StringBuilder sb = new StringBuilder();
        if (selfLeaks >= 0) {
            sb.append("己漏 ").append(selfLeaks);
        }
        if (totalLeaks > 0 || assistKills > 0 || uncoveredLeaks >= 0) {
            if (sb.length() > 0) sb.append(" · ");
            if (uncoveredLeaks >= 0) {
                sb.append("兜底 ").append(assistKills).append("/").append(Math.max(totalLeaks, assistKills + uncoveredLeaks));
                if (uncoveredLeaks > 0) sb.append("（未兜 ").append(uncoveredLeaks).append("）");
                else if (assistKills > 0) sb.append("（全兜住）");
            } else {
                sb.append("需兜底 ").append(totalLeaks);
                if (assistKills > 0) sb.append("（已救 ").append(assistKills).append("）");
            }
        }
        if (!leakedEnemies.isEmpty()) {
            sb.append("｜");
            int i = 0;
            for (Map.Entry<String, Integer> e : leakedEnemies.entrySet()) {
                if (i >= 2) break;
                if (i > 0) sb.append("·");
                sb.append(e.getKey()).append("×").append(e.getValue());
                i++;
            }
        }
        return sb.toString();
    }

    private static void pushToOverlay() {
        int fcRound = pickForecastRound();
        String spawnText = fcRound > 0 ? formatSpawnSummary(fcRound, 4) : "";
        String leakText = formatLeakSummary();
        boolean leakAlert = (leakRound > 0 && leakRound >= Math.max(1, currentRound - 1))
            && ((selfLeaks > 0) || (totalLeaks > 0) || (uncoveredLeaks > 0) || "assist".equals(phase));
        try {
            OverlayService.updateLiveTelemetry(
                running,
                currentRound,
                phase,
                selfHp,
                fcRound,
                spawnText,
                leakAlert,
                leakText,
                bossHp,
                bossTotalDamage,
                bansConfirmed ? bannedCovenants.size() : -1
            );
        } catch (Throwable ignored) {}
    }

    static synchronized boolean isBansConfirmed() { return bansConfirmed; }

    static synchronized List<String> getBannedCovenantsSnapshot() {
        return Collections.unmodifiableList(new ArrayList<>(bannedCovenants));
    }

    static synchronized int getCurrentRound() { return currentRound; }

    static synchronized String json() {
        try {
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
            obj.put("selfHp", selfHp);
            obj.put("bossHp", bossHp);
            obj.put("bossTotalDamage", bossTotalDamage);
            obj.put("bansConfirmed", bansConfirmed);
            obj.put("bannedCovenants", new JSONArray(bannedCovenants));

            int fcRound = pickForecastRound();
            obj.put("forecastRound", fcRound);
            JSONArray fcArr = new JSONArray();
            if (fcRound > 0) {
                LinkedHashMap<String, Integer> map = spawnPlanByRound.get(fcRound);
                if (map != null) {
                    for (Map.Entry<String, Integer> e : map.entrySet()) {
                        fcArr.put(new JSONObject()
                            .put("id", e.getKey())
                            .put("name", StrongholdEnemyCatalog.enemyName(e.getKey()))
                            .put("count", e.getValue()));
                    }
                }
            }
            obj.put("forecastEnemies", fcArr);
            obj.put("forecastText", fcRound > 0 ? formatSpawnSummary(fcRound, 5) : "");

            JSONObject leak = new JSONObject();
            leak.put("round", leakRound);
            leak.put("selfLeaks", selfLeaks);
            leak.put("totalLeaks", totalLeaks);
            leak.put("assistKills", assistKills);
            leak.put("uncoveredLeaks", uncoveredLeaks);
            leak.put("summary", formatLeakSummary());
            JSONArray leakList = new JSONArray();
            for (Map.Entry<String, Integer> e : leakedEnemies.entrySet()) {
                leakList.put(new JSONObject().put("name", e.getKey()).put("count", e.getValue()));
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
