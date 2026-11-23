package com.prts.dossier.review;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** 只保留本次扫描的名称与状态，不保存屏幕图像。 */
final class CovenantScanState {
    private static String id = "", status = "idle", message = "打开本局盟约总览后开始识别";
    private static final Map<String, Integer> votes = new LinkedHashMap<>();
    private static final Map<String, Integer> confirmed = new LinkedHashMap<>();

    static synchronized boolean begin() {
        if ("permission".equals(status) || "scanning".equals(status)) return false;
        id = UUID.randomUUID().toString(); votes.clear(); confirmed.clear();
        set("permission", "请允许本次屏幕共享，并选择整个屏幕或游戏窗口");
        return true;
    }
    static synchronized void set(String next, String detail) { status = next; message = detail; }
    static synchronized boolean scanning() { return "scanning".equals(status); }
    static synchronized boolean permissionPending() { return "permission".equals(status); }
    static synchronized String currentId() { return id; }
    static synchronized boolean matches(String token) { return token != null && !token.isEmpty() && token.equals(id); }
    static synchronized boolean observe(Map<String,Integer> frame) {
        if (!scanning()) return false;
        for (Map.Entry<String,Integer> item : frame.entrySet()) {
            String name = item.getKey(); int state = item.getValue();
            if (state == 0) continue;
            int old = votes.containsKey(name) ? votes.get(name) : 0;
            int next = Integer.signum(old) == state ? old + state : state;
            votes.put(name, Math.max(-3,Math.min(3,next)));
            if (Math.abs(next) >= 2) confirmed.put(name,state);
            else confirmed.remove(name);
        }
        message = "已确认 " + confirmed.size() + "/26 个盟约，请停留总览并露出最下排";
        return confirmed.size() == CovenantDetector.NAMES.length;
    }
    static synchronized void finish(String detail) {
        set(confirmed.size() == 26 ? "ready" : "incomplete", detail);
    }
    static synchronized void reset() { id=""; votes.clear(); confirmed.clear(); set("idle","打开本局盟约总览后开始识别"); }
    static synchronized String json() {
        JSONObject result = new JSONObject(); JSONArray banned = new JSONArray(), seen = new JSONArray(), missing = new JSONArray();
        for (String name : CovenantDetector.NAMES) {
            if (confirmed.containsKey(name)) { seen.put(name); if (confirmed.get(name) < 0) banned.put(name); }
            else missing.put(name);
        }
        try { result.put("id",id).put("status",status).put("message",message).put("complete",confirmed.size()==26)
            .put("bannedCovenants",banned).put("seenCovenants",seen).put("missingCovenants",missing); }
        catch (org.json.JSONException ignored) { return "{}"; }
        return result.toString();
    }
}
