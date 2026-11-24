package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import org.json.JSONObject;
import java.util.UUID;

final class RoundScanState {
    private static String id = "", status = "idle", message = "尚未开启回合自动同步", preview = "";
    private static double[] region;
    private static int round, sequence;
    private static long generation;
    private RoundScanState() {}

    static synchronized String begin() {
        id = UUID.randomUUID().toString(); region = null; preview = ""; round = 0; sequence = 0; generation++;
        set("permission", "请允许本次屏幕共享，然后框选游戏回合数字"); return id;
    }
    static synchronized boolean matches(String token) { return !id.isEmpty() && id.equals(token); }
    static synchronized boolean is(String value) { return status.equals(value); }
    static synchronized void set(String value, String detail) { status = value; message = detail; }
    static synchronized String preview() { return preview; }
    static synchronized void calibrate(String image) { preview = image; region = null; generation++; set("calibrating", "拖动框选只含回合数字的小区域"); }
    static synchronized boolean select(double left, double top, double right, double bottom) {
        if (!is("calibrating") || !Double.isFinite(left + top + right + bottom) || left < 0 || top < 0 || right > 1 || bottom > 1 || right - left < .008 || bottom - top < .008) return false;
        region = new double[]{ left, top, right, bottom }; preview = ""; round = 0; generation++;
        set("scanning", "收起助手后自动跟进回合；连续三次一致才更新"); return true;
    }
    static synchronized double[] region() { return region == null ? null : region.clone(); }
    static synchronized long generation() { return generation; }
    static synchronized boolean observe(int value, long expectedGeneration) {
        if (!is("scanning") || generation != expectedGeneration || value < 1 || value > 15 || round == value) return false;
        round = value; sequence++; message = "已确认游戏 R" + value + "；展开攻略查看";
        return true;
    }
    static synchronized void pause() { if (is("scanning")) { generation++; set("paused", "手动切换已暂停同步，可继续自动跟进"); } }
    static synchronized void resume() { if (is("paused") && region != null) { generation++; round = 0; set("scanning", "收起助手后重新确认当前回合"); } }
    static synchronized void stop(String detail) { generation++; preview = ""; region = null; set("stopped", detail); }
    static synchronized void reset() { stop("尚未开启回合自动同步"); id = ""; round = 0; sequence = 0; status = "idle"; }
    static synchronized String json() {
        try { return new JSONObject().put("id", id).put("status", status).put("message", message).put("round", round).put("sequence", sequence).toString(); }
        catch (org.json.JSONException error) { return "{}"; }
    }
}
