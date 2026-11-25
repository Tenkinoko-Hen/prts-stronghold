package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** 卫戍协议离线敌人词表与 26 项盟约 ID 映射（从打包的 assets/enemy_power.json 加载）。 */
final class StrongholdEnemyCatalog {
    private static final Map<String, String> ENEMY_NAMES = new HashMap<>();
    private static final Map<Integer, String> TOKEN_ENEMY_IDS = new HashMap<>();
    private static final Map<String, String> BOND_TO_COVENANT = new HashMap<>();
    private static volatile boolean loaded = false;

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
    }

    private StrongholdEnemyCatalog() {}

    static synchronized void ensureLoaded(Context context) {
        if (loaded || context == null) return;
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
        return BOND_TO_COVENANT.get(bondId.trim());
    }
}
