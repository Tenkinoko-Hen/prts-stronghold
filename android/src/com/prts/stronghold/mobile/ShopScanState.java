package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/** 本机商店刷牌 OCR 状态管理；截图只在内存中处理，不保存不上传。 */
final class ShopScanState {
    private static String id = "";
    private static String status = "idle";
    private static String message = "打开游戏商店界面后点「扫商店」";
    private static long scannedAt = 0;
    private static final List<String> catalog = new ArrayList<>();
    private static final List<String> targets = new ArrayList<>();
    private static final List<String> detected = new ArrayList<>();
    private static final List<String> matchedTargets = new ArrayList<>();

    private ShopScanState() {}

    static synchronized String begin(List<String> allOperators, List<String> wantedTargets) {
        id = UUID.randomUUID().toString();
        status = "permission";
        message = "正在准备商店识别…";
        scannedAt = 0;
        catalog.clear();
        if (allOperators != null) catalog.addAll(allOperators);
        targets.clear();
        if (wantedTargets != null) targets.addAll(wantedTargets);
        detected.clear();
        matchedTargets.clear();
        return id;
    }

    static synchronized boolean matches(String token) { return !id.isEmpty() && id.equals(token); }
    static synchronized boolean is(String value) { return status.equals(value); }
    static synchronized String currentId() { return id; }
    static synchronized void set(String next, String detail) { status = next; message = detail; }
    static synchronized List<String> catalog() { return Collections.unmodifiableList(new ArrayList<>(catalog)); }
    static synchronized List<String> targets() { return Collections.unmodifiableList(new ArrayList<>(targets)); }

    static synchronized void complete(List<String> foundOperators) {
        detected.clear();
        matchedTargets.clear();
        if (foundOperators != null) {
            detected.addAll(foundOperators);
            for (String op : foundOperators) {
                if (targets.contains(op)) matchedTargets.add(op);
            }
        }
        scannedAt = System.currentTimeMillis();
        status = "ready";
        if (matchedTargets.isEmpty()) {
            message = detected.isEmpty()
                ? "未在底部商店区识别到干员名，请确保处于商店页面"
                : "识别到 " + detected.size() + " 张商店卡，暂无当前阵容急需核心";
        } else {
            StringBuilder sb = new StringBuilder("建议抓取：");
            for (int i = 0; i < matchedTargets.size(); i++) {
                if (i > 0) sb.append("、");
                sb.append(matchedTargets.get(i));
            }
            message = sb.toString();
        }
    }

    static synchronized void fail(String detail) {
        status = "error";
        message = detail;
    }

    static synchronized void reset() {
        id = "";
        status = "idle";
        message = "打开游戏商店界面后点「扫商店」";
        scannedAt = 0;
        detected.clear();
        matchedTargets.clear();
    }

    static synchronized String summaryForStrip() {
        if (!"ready".equals(status)) return "";
        if (!matchedTargets.isEmpty()) {
            StringBuilder sb = new StringBuilder("商店可抓：");
            for (int i = 0; i < Math.min(3, matchedTargets.size()); i++) {
                if (i > 0) sb.append(" · ");
                sb.append(matchedTargets.get(i));
            }
            return sb.toString();
        }
        return detected.isEmpty() ? "未扫到商店干员" : "本页无目标核心（可刷）";
    }

    static synchronized String json() {
        JSONObject obj = new JSONObject();
        try {
            obj.put("id", id)
                .put("status", status)
                .put("message", message)
                .put("scannedAt", scannedAt)
                .put("detected", new JSONArray(detected))
                .put("matchedTargets", new JSONArray(matchedTargets));
            return obj.toString();
        } catch (org.json.JSONException ignored) {
            return "{}";
        }
    }
}
