package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** 只保留本次扫描的名称与状态，不保存屏幕图像。 */
final class CovenantScanState {
    private static String id = "", status = "idle", message = "打开本局盟约总览后开始识别";
    private static int targetCount = CovenantDetector.NAMES.length;
    private static String modeLabel = "";
    private static int stableFrames = 0;
    private static final Map<String, Integer> votes = new LinkedHashMap<>();
    private static final Map<String, Integer> confirmed = new LinkedHashMap<>();

    static synchronized boolean begin() {
        if ("permission".equals(status) || "scanning".equals(status)) return false;
        id = UUID.randomUUID().toString(); votes.clear(); confirmed.clear();
        targetCount = CovenantDetector.NAMES.length; modeLabel = ""; stableFrames = 0;
        set("permission", "请允许本次屏幕共享，并选择整个屏幕或游戏窗口");
        return true;
    }
    static synchronized void set(String next, String detail) { status = next; message = detail; }
    static synchronized boolean scanning() { return "scanning".equals(status); }
    static synchronized boolean permissionPending() { return "permission".equals(status); }
    static synchronized String currentId() { return id; }
    static synchronized int currentTargetCount() { return targetCount; }
    static synchronized String currentModeLabel() { return modeLabel; }
    static synchronized int currentStableFrames() { return stableFrames; }
    static synchronized boolean matches(String token) { return token != null && !token.isEmpty() && token.equals(id); }

    static synchronized boolean observe(Map<String, Integer> frame) {
        return observe(frame, "");
    }

    static synchronized boolean observe(Map<String, Integer> frame, String modeHint) {
        if (!scanning() || frame == null) return false;
        if ("quick".equals(modeHint)) {
            modeLabel = "极速模拟";
            targetCount = 18;
        } else if ("solo".equals(modeHint)) {
            if (!"极速模拟".equals(modeLabel)) {
                modeLabel = "单人模拟";
                targetCount = CovenantDetector.NAMES.length;
            }
        } else if ("standard".equals(modeHint)) {
            if (modeLabel.isEmpty()) {
                modeLabel = "标准模式";
                targetCount = CovenantDetector.NAMES.length;
            }
        }

        int prevConfirmed = confirmed.size();
        for (Map.Entry<String, Integer> item : frame.entrySet()) {
            String name = item.getKey();
            Integer rawState = item.getValue();
            if (name == null || rawState == null) continue;
            int state = rawState;
            if (state == 0) continue;
            int old = votes.containsKey(name) ? votes.get(name) : 0;
            int next = Integer.signum(old) == state ? old + state : state;
            votes.put(name, Math.max(-3, Math.min(3, next)));
            if (Math.abs(next) >= 2) confirmed.put(name, state);
            else confirmed.remove(name);
        }

        int curConfirmed = confirmed.size();
        if (curConfirmed > prevConfirmed) {
            stableFrames = 0;
        } else if (curConfirmed > 0 && curConfirmed == prevConfirmed) {
            stableFrames++;
        } else {
            stableFrames = 0;
        }

        int coreConfirmed = 0;
        int subConfirmed = 0;
        for (String name : confirmed.keySet()) {
            if (CovenantDetector.CORE_NAMES.contains(name)) coreConfirmed++;
            else if (CovenantDetector.SUB_NAMES.contains(name)) subConfirmed++;
        }

        // 未带 hint 时若已确认恰好 8 核心 + 10 附加共 18 项且连续 3 帧无新增，自动识别为极速模拟
        if (!"极速模拟".equals(modeLabel) && !"单人模拟".equals(modeLabel)
            && coreConfirmed == 8 && subConfirmed == 10 && curConfirmed == 18 && stableFrames >= 3) {
            modeLabel = "极速模拟";
            targetCount = 18;
        }

        if ("极速模拟".equals(modeLabel) && coreConfirmed >= 8 && subConfirmed >= 10 && curConfirmed >= 18) {
            for (String name : CovenantDetector.NAMES) {
                if (!confirmed.containsKey(name)) {
                    confirmed.put(name, -1);
                }
            }
            message = "极速模拟 18/18 项已确认（其余 8 项自动标记受限）";
            return true;
        }

        if ("极速模拟".equals(modeLabel)) {
            message = "极速模拟：已确认 " + curConfirmed + "/18 个盟约，请保持画面";
        } else if ("单人模拟".equals(modeLabel)) {
            if (coreConfirmed >= 10 && curConfirmed >= 18 && curConfirmed < CovenantDetector.NAMES.length) {
                message = "单人模拟：已确认 " + curConfirmed + "/26（核心已齐），请向上轻滑露出底排附加盟约，或点「停止」直接按已识别选阵";
            } else {
                message = "单人模拟：已确认 " + curConfirmed + "/26 个盟约，请停留总览或向上轻滑露出底排";
            }
        } else {
            message = "已确认 " + curConfirmed + "/" + targetCount + " 个盟约，请停留总览并露出最下排";
        }
        return confirmed.size() == CovenantDetector.NAMES.length;
    }

    static synchronized void finish(String detail) {
        set(confirmed.size() == CovenantDetector.NAMES.length ? "ready" : "incomplete", detail);
    }
    static synchronized void reset() {
        id = ""; votes.clear(); confirmed.clear();
        targetCount = CovenantDetector.NAMES.length; modeLabel = ""; stableFrames = 0;
        set("idle", "打开本局盟约总览后开始识别");
    }
    static synchronized String json() {
        JSONObject result = new JSONObject(); JSONArray banned = new JSONArray(), seen = new JSONArray(), missing = new JSONArray();
        for (String name : CovenantDetector.NAMES) {
            if (confirmed.containsKey(name)) { seen.put(name); if (confirmed.get(name) < 0) banned.put(name); }
            else missing.put(name);
        }
        try {
            result.put("id", id).put("status", status).put("message", message)
                .put("complete", confirmed.size() == CovenantDetector.NAMES.length)
                .put("targetCount", targetCount)
                .put("modeLabel", modeLabel)
                .put("bannedCovenants", banned).put("seenCovenants", seen).put("missingCovenants", missing);
        } catch (org.json.JSONException ignored) { return "{}"; }
        return result.toString();
    }
}
