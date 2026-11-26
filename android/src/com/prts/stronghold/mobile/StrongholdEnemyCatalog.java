package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 卫戍协议离线敌人词表与 26 项盟约 ID 映射（从打包的 assets/enemy_power.json 等加载）。 */
final class StrongholdEnemyCatalog {
    static final List<String> CORE_COVENANTS = Collections.unmodifiableList(Arrays.asList(
        "炎", "萨尔贡", "阿戈尔", "叙拉古", "卡西米尔",
        "维多利亚", "谢拉格", "乌萨斯", "伊比利亚", "莱塔尼亚"
    ));
    private static final Set<String> BENCH_ACTIVATABLE_COVENANTS = Collections.unmodifiableSet(
        new LinkedHashSet<>(Arrays.asList("远见", "奇迹", "投资人"))
    );

    private static final Map<String, String> ENEMY_NAMES = new HashMap<>();
    private static final Map<Integer, String> TOKEN_ENEMY_IDS = new HashMap<>();
    private static final Map<String, String> BOND_TO_COVENANT = new HashMap<>();
    private static final Map<String, Integer> COVENANT_THRESHOLDS = new HashMap<>();
    private static final Map<Integer, String> CHESS_IDENT_TO_CHESS_ID = new HashMap<>();
    private static final Map<Integer, String> CHESS_IDENT_TO_CHAR_ID = new HashMap<>();
    private static final Map<Integer, String> CHESS_IDENT_TO_NAME = new HashMap<>();
    private static final Map<String, List<String>> OPERATOR_NAME_TO_COVENANTS = new HashMap<>();
    private static final Map<Integer, String> TRAP_IDENT_TO_BOND = new HashMap<>();
    private static volatile boolean loaded = false;
    private static volatile boolean catalogLoaded = false;
    private static volatile boolean operatorRefLoaded = false;

    static {
        // 核心盟约（10）
        BOND_TO_COVENANT.put("yanShip", "炎");
        BOND_TO_COVENANT.put("sargonShip", "萨尔贡");
        BOND_TO_COVENANT.put("egirShip", "阿戈尔");
        BOND_TO_COVENANT.put("siracusaShip", "叙拉古");
        BOND_TO_COVENANT.put("kazimierzShip", "卡西米尔");
        BOND_TO_COVENANT.put("victoriaShip", "维多利亚");
        BOND_TO_COVENANT.put("kjeragShip", "谢拉格");
        BOND_TO_COVENANT.put("ursusShip", "乌萨斯");
        BOND_TO_COVENANT.put("iberiaShip", "伊比利亚");
        BOND_TO_COVENANT.put("lethaniaShip", "莱塔尼亚");
        // 附加盟约（16）
        BOND_TO_COVENANT.put("preciShip", "精准");
        BOND_TO_COVENANT.put("visiShip", "远见");
        BOND_TO_COVENANT.put("investShip", "投资人");
        BOND_TO_COVENANT.put("raidShip", "突袭");
        BOND_TO_COVENANT.put("indomShip", "不屈");
        BOND_TO_COVENANT.put("maniShip", "调和");
        BOND_TO_COVENANT.put("emptyShip", "协防干员");
        BOND_TO_COVENANT.put("soloShip", "独行");
        BOND_TO_COVENANT.put("suntShip", "绝技");
        BOND_TO_COVENANT.put("docShip", "聚合");
        BOND_TO_COVENANT.put("arcaneShip", "奥术");
        BOND_TO_COVENANT.put("swiftShip", "迅捷");
        BOND_TO_COVENANT.put("skillfulShip", "灵巧");
        BOND_TO_COVENANT.put("steadShip", "坚守");
        BOND_TO_COVENANT.put("deputShip", "助力");
        BOND_TO_COVENANT.put("miraShip", "奇迹");

        // 最低激活阈值（10 项核心盟约与投资人为 3，调和与独行为 1，其余附加盟约为 2）
        COVENANT_THRESHOLDS.put("独行", 1);
        COVENANT_THRESHOLDS.put("调和", 1);
        COVENANT_THRESHOLDS.put("投资人", 3);
        COVENANT_THRESHOLDS.put("炎", 3);
        COVENANT_THRESHOLDS.put("萨尔贡", 3);
        COVENANT_THRESHOLDS.put("阿戈尔", 3);
        COVENANT_THRESHOLDS.put("叙拉古", 3);
        COVENANT_THRESHOLDS.put("卡西米尔", 3);
        COVENANT_THRESHOLDS.put("维多利亚", 3);
        COVENANT_THRESHOLDS.put("谢拉格", 3);
        COVENANT_THRESHOLDS.put("乌萨斯", 3);
        COVENANT_THRESHOLDS.put("伊比利亚", 3);
        COVENANT_THRESHOLDS.put("莱塔尼亚", 3);
    }

    private StrongholdEnemyCatalog() {}

    static synchronized void ensureLoaded(Context context) {
        if (context == null) return;
        if (!loaded) {
            try (InputStream in = context.getAssets().open("enemy_power.json")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                loadFromJson(new String(out.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception ignored) {
                // 无资产时安全降级为原始 enemyId
            }
        }
        if (!catalogLoaded) {
            try (InputStream in = context.getAssets().open("stronghold_catalog.json")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                loadStrongholdCatalogJson(new String(out.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception ignored) {
                // 无资产时安全降级
            }
        }
        if (!operatorRefLoaded) {
            try (InputStream in = context.getAssets().open("operator_reference.json")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                loadOperatorReferenceJson(new String(out.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception ignored) {
                // 无资产时安全降级
            }
        }
    }

    static String normalizeOperatorName(String name) {
        if (name == null) return "";
        StringBuilder sb = new StringBuilder(name.length());
        boolean prevSpace = true;
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c == '"' || c == '\'' || c == '“' || c == '”' || c == '‘' || c == '’') {
                continue;
            }
            if (Character.isWhitespace(c)) {
                if (!prevSpace) {
                    sb.append(' ');
                    prevSpace = true;
                }
                continue;
            }
            sb.append(c);
            prevSpace = false;
        }
        int len = sb.length();
        if (len > 0 && sb.charAt(len - 1) == ' ') {
            sb.setLength(len - 1);
        }
        return sb.toString();
    }

    static synchronized void loadStrongholdCatalogJson(String rawJson) {
        if (rawJson == null || rawJson.isEmpty()) return;
        try {
            JSONObject root = new JSONObject(rawJson);
            JSONObject chessMap = root.optJSONObject("chess_by_id");
            if (chessMap != null) {
                Iterator<String> keys = chessMap.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    try {
                        int ident = Integer.parseInt(k);
                        JSONObject item = chessMap.optJSONObject(k);
                        if (item != null) {
                            String chessId = item.optString("chess_id", "").trim();
                            String charId = item.optString("char_id", "").trim();
                            String opName = item.optString("name", "").trim();
                            if (!chessId.isEmpty()) CHESS_IDENT_TO_CHESS_ID.put(ident, chessId);
                            if (!charId.isEmpty()) CHESS_IDENT_TO_CHAR_ID.put(ident, charId);
                            if (!opName.isEmpty()) CHESS_IDENT_TO_NAME.put(ident, opName);
                        }
                    } catch (NumberFormatException ignored) {}
                }
            }
            JSONObject trapMap = root.optJSONObject("trap_by_id");
            if (trapMap != null) {
                Iterator<String> keys = trapMap.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    try {
                        int ident = Integer.parseInt(k);
                        JSONObject item = trapMap.optJSONObject(k);
                        if (item != null) {
                            String bondId = item.optString("give_bond_id", "").trim();
                            if (!bondId.isEmpty()) TRAP_IDENT_TO_BOND.put(ident, bondId);
                        }
                    } catch (NumberFormatException ignored) {}
                }
            }
            catalogLoaded = true;
        } catch (Exception ignored) {}
    }

    static synchronized void loadOperatorReferenceJson(String rawJson) {
        if (rawJson == null || rawJson.isEmpty()) return;
        try {
            JSONObject root = new JSONObject(rawJson);
            JSONObject mode = root.optJSONObject("mode");
            if (mode != null) {
                Iterator<String> keys = mode.keys();
                while (keys.hasNext()) {
                    String rawName = keys.next();
                    String norm = normalizeOperatorName(rawName);
                    if (norm.isEmpty()) continue;
                    JSONObject entry = mode.optJSONObject(rawName);
                    if (entry == null) continue;
                    JSONArray covArr = entry.optJSONArray("covenants");
                    if (covArr == null || covArr.length() == 0) continue;
                    List<String> covs = new ArrayList<>(covArr.length());
                    for (int i = 0; i < covArr.length(); i++) {
                        String c = covArr.optString(i, "").trim();
                        if (!c.isEmpty() && !covs.contains(c)) {
                            covs.add(c);
                        }
                    }
                    if (!covs.isEmpty()) {
                        OPERATOR_NAME_TO_COVENANTS.put(norm, Collections.unmodifiableList(covs));
                    }
                }
            }
            operatorRefLoaded = true;
        } catch (Exception ignored) {}
    }

    static synchronized void registerCatalogForTest(int chessIdent, String chessId, String charId) {
        if (chessId != null && !chessId.isEmpty()) CHESS_IDENT_TO_CHESS_ID.put(chessIdent, chessId);
        if (charId != null && !charId.isEmpty()) CHESS_IDENT_TO_CHAR_ID.put(chessIdent, charId);
    }

    static synchronized void registerOperatorCovenantsForTest(int chessIdent, String opName, List<String> covenants) {
        String trimmed = opName != null ? opName.trim() : "";
        String norm = normalizeOperatorName(trimmed);
        if (chessIdent >= 0 && !trimmed.isEmpty()) {
            CHESS_IDENT_TO_NAME.put(chessIdent, trimmed);
        }
        if (!norm.isEmpty() && covenants != null && !covenants.isEmpty()) {
            List<String> clean = new ArrayList<>(covenants.size());
            for (String cov : covenants) {
                if (cov != null) {
                    String c = cov.trim();
                    if (!c.isEmpty() && !clean.contains(c)) clean.add(c);
                }
            }
            if (!clean.isEmpty()) {
                OPERATOR_NAME_TO_COVENANTS.put(norm, Collections.unmodifiableList(clean));
            }
        }
    }

    static synchronized void registerEquipBondForTest(int trapIdent, String giveBondId) {
        if (giveBondId != null && !giveBondId.isEmpty()) TRAP_IDENT_TO_BOND.put(trapIdent, giveBondId);
    }

    static synchronized String chessIdForIdent(int chessIdent) {
        String s = CHESS_IDENT_TO_CHESS_ID.get(chessIdent);
        return s != null ? s : "";
    }

    static synchronized String charIdForIdent(int chessIdent) {
        String s = CHESS_IDENT_TO_CHAR_ID.get(chessIdent);
        return s != null ? s : "";
    }

    static synchronized String nameForIdent(int chessIdent) {
        String s = CHESS_IDENT_TO_NAME.get(chessIdent);
        return s != null ? s : "";
    }

    static synchronized List<String> covenantsForIdent(int chessIdent) {
        String rawName = CHESS_IDENT_TO_NAME.get(chessIdent);
        if (rawName == null || rawName.isEmpty()) return Collections.emptyList();
        String norm = normalizeOperatorName(rawName);
        if (norm.isEmpty()) return Collections.emptyList();
        List<String> covs = OPERATOR_NAME_TO_COVENANTS.get(norm);
        return covs != null ? covs : Collections.<String>emptyList();
    }

    static synchronized String equipGiveBond(int trapIdent) {
        String s = TRAP_IDENT_TO_BOND.get(trapIdent);
        return s != null ? s : "";
    }

    static int covenantThreshold(String covenantName) {
        if (covenantName == null) return 2;
        Integer t = COVENANT_THRESHOLDS.get(covenantName);
        return t != null ? t : 2;
    }

    static boolean isBenchActivatableCovenant(String covenantName) {
        return covenantName != null && BENCH_ACTIVATABLE_COVENANTS.contains(covenantName);
    }

    static synchronized void loadFromJson(String rawJson) {
        if (rawJson == null || rawJson.isEmpty()) return;
        try {
            JSONObject root = new JSONObject(rawJson);
            JSONObject enemies = root.optJSONObject("enemies");
            if (enemies != null) {
                Iterator<String> keys = enemies.keys();
                while (keys.hasNext()) {
                    String id = keys.next();
                    JSONArray arr = enemies.optJSONArray(id);
                    if (arr != null && arr.length() > 0) {
                        String name = arr.optString(0, "").trim();
                        if (!name.isEmpty()) ENEMY_NAMES.put(id, name);
                    }
                }
            }
            JSONObject tokens = root.optJSONObject("tokens");
            if (tokens != null) {
                Iterator<String> keys = tokens.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    try {
                        int idx = Integer.parseInt(key);
                        String id = tokens.optString(key, "").trim();
                        if (!id.isEmpty()) TOKEN_ENEMY_IDS.put(idx, id);
                    } catch (NumberFormatException ignored) {}
                }
            }
            loaded = true;
        } catch (Exception ignored) {}
    }

    static synchronized void registerForTest(String enemyId, String displayName) {
        if (enemyId != null && displayName != null) {
            ENEMY_NAMES.put(enemyId, displayName);
        }
    }

    static String enemyName(String enemyId) {
        if (enemyId == null || enemyId.isEmpty()) return "未知敌怪";
        String found = ENEMY_NAMES.get(enemyId);
        return (found != null && !found.isEmpty()) ? found : enemyId;
    }

    static String resolveTokenEnemyId(int instanceId) {
        String id = TOKEN_ENEMY_IDS.get(instanceId >>> 16);
        return id != null ? id : "";
    }

    static String covenantName(String bondId) {
        if (bondId == null) return null;
        String clean = bondId.trim();
        String direct = BOND_TO_COVENANT.get(clean);
        if (direct != null) return direct;
        if ("aegirShip".equals(clean)) return "阿戈尔";
        if ("leithanienShip".equals(clean)) return "莱塔尼亚";
        return null;
    }
}
