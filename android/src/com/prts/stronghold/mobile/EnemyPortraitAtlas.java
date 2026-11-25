package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 敌怪实机头像图集解码器：
 * 懒加载 APK 内置 assets/enemy_portraits.webp 与 assets/enemy_portraits.json（453 敌怪头像），
 * 按需裁剪单个头像并缓存，供顶部战术迷你条直接展示出怪预告、漏怪与 Boss 头像。
 */
final class EnemyPortraitAtlas {
    private static final String[] BOSS_IDS = {
        "enemy_9013_acstmk", "enemy_9017_achunt", "enemy_9021_acduml", "enemy_1521_dslily", "enemy_2016_csphtm",
        "enemy_9032_aclionk", "enemy_9033_acdeer", "enemy_9013_acstmk_2", "enemy_9017_achunt_2", "enemy_9021_acduml_2",
        "enemy_9029_acfnc", "enemy_9035_acspider", "enemy_9037_aceel", "enemy_9029_acfnc_2", "enemy_9035_acspider_2",
        "enemy_9037_aceel_2", "enemy_2124_dyjsfg"
    };

    private static final Map<String, Integer> INDEX_MAP = new HashMap<>();
    private static final Map<String, Bitmap> ICON_CACHE = new LinkedHashMap<String, Bitmap>(64, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Bitmap> eldest) {
            return size() > 64;
        }
    };

    private static Bitmap atlasBitmap;
    private static int columns = 16;
    private static int rows = 29;
    private static boolean initialized = false;

    private EnemyPortraitAtlas() {}

    static String resolveBossEnemyId(String rawBossId) {
        if (rawBossId == null || rawBossId.isEmpty()) return "";
        String trimmed = rawBossId.trim();
        if (trimmed.startsWith("boss_")) {
            try {
                int idx = Integer.parseInt(trimmed.substring(5)) - 1;
                if (idx >= 0 && idx < BOSS_IDS.length) return BOSS_IDS[idx];
            } catch (NumberFormatException ignored) {}
        }
        return trimmed;
    }

    static synchronized Bitmap getIcon(Context context, String rawEnemyId) {
        if (context == null || rawEnemyId == null || rawEnemyId.isEmpty()) return null;
        String enemyId = resolveBossEnemyId(rawEnemyId);
        Bitmap cached = ICON_CACHE.get(enemyId);
        if (cached != null && !cached.isRecycled()) return cached;

        ensureLoaded(context.getApplicationContext());
        if (atlasBitmap == null || atlasBitmap.isRecycled()) return null;

        Integer idx = INDEX_MAP.get(enemyId);
        if (idx == null && enemyId.endsWith("_2")) {
            idx = INDEX_MAP.get(enemyId.substring(0, enemyId.length() - 2));
        }
        if (idx == null || idx < 0 || columns <= 0 || rows <= 0) return null;

        int col = idx % columns;
        int row = idx / columns;
        int tileW = atlasBitmap.getWidth() / columns;
        int tileH = atlasBitmap.getHeight() / rows;
        int x = col * tileW;
        int y = row * tileH;
        if (tileW <= 0 || tileH <= 0 || x + tileW > atlasBitmap.getWidth() || y + tileH > atlasBitmap.getHeight()) {
            return null;
        }
        try {
            Bitmap tile = Bitmap.createBitmap(atlasBitmap, x, y, tileW, tileH);
            ICON_CACHE.put(enemyId, tile);
            return tile;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static void ensureLoaded(Context context) {
        if (initialized) return;
        initialized = true;
        try (InputStream in = context.getAssets().open("enemy_portraits.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            JSONObject root = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            columns = Math.max(1, root.optInt("columns", 16));
            JSONArray ids = root.optJSONArray("ids");
            if (ids != null) {
                INDEX_MAP.clear();
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.optString(i, "");
                    if (!id.isEmpty()) INDEX_MAP.put(id, i);
                }
                rows = Math.max(1, (ids.length() + columns - 1) / columns);
            }
        } catch (Exception ignored) {
            return;
        }
        try (InputStream in = context.getAssets().open("enemy_portraits.webp")) {
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.RGB_565;
            atlasBitmap = BitmapFactory.decodeStream(in, null, opts);
        } catch (Exception ignored) {
            atlasBitmap = null;
        }
    }
}
