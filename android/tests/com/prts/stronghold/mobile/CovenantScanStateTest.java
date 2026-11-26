package com.prts.stronghold.mobile;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public final class CovenantScanStateTest {
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) {
        CovenantScanState.reset();
        check(CovenantScanState.begin(), "首轮可启动");
        String old = CovenantScanState.currentId();
        check(!CovenantScanState.begin(), "重复点击不能创建第二个授权请求");
        CovenantScanState.set("cancelled", "退出");
        check(!CovenantScanState.permissionPending(), "关闭助手后授权失效");
        CovenantScanState.reset();
        check(!CovenantScanState.matches(old), "新局不能接受旧授权或回调");
        check(CovenantScanState.begin(), "新局可重新扫描");
        check(!old.equals(CovenantScanState.currentId()), "每次扫描使用独立标识");
        CovenantScanState.set("scanning", "测试");
        Map<String, Integer> frame = new HashMap<>();
        for (String name : CovenantDetector.NAMES) frame.put(name, 1);
        check(!CovenantScanState.observe(frame), "单帧不能确认全部");
        check(CovenantScanState.observe(frame), "同状态至少两帧后完成");
        frame.put("精准", -1);
        check(!CovenantScanState.observe(frame), "冲突帧使对应项回到待确认");
        check(CovenantScanState.observe(frame), "第二帧确认新状态");
        CovenantScanState.reset();
        check(!CovenantScanState.observe(frame), "重置后不接收旧帧");

        // 极速模拟（带 quick hint）：8 核心 + 10 附加 = 18 项，2 帧后自动将剩余 8 项标记受限并完成
        CovenantScanState.reset();
        check(CovenantScanState.begin(), "极速模拟可启动");
        CovenantScanState.set("scanning", "测试极速模拟");
        Map<String, Integer> quickFrame = new HashMap<>();
        String[] quickCore = { "炎", "萨尔贡", "阿戈尔", "叙拉古", "卡西米尔", "维多利亚", "谢拉格", "乌萨斯" };
        String[] quickSub = { "精准", "远见", "投资人", "突袭", "不屈", "调和", "协防干员", "独行", "绝技", "聚合" };
        for (String c : quickCore) quickFrame.put(c, 1);
        for (String s : quickSub) quickFrame.put(s, 1);
        quickFrame.put("乌萨斯", -1);
        check(!CovenantScanState.observe(quickFrame, "quick"), "极速模拟单帧未确认");
        check("极速模拟".equals(CovenantScanState.currentModeLabel()) && CovenantScanState.currentTargetCount() == 18, "极速模拟模式标签与目标数 18");
        check(CovenantScanState.observe(quickFrame, "quick"), "极速模拟 18/18 第二帧立即完成并补齐剩余 8 项受限");
        CovenantScanState.finish("极速模拟完成");
        String quickJson = CovenantScanState.json();
        check(quickJson.contains("\"targetCount\":18") && quickJson.contains("\"modeLabel\":\"极速模拟\"") && quickJson.contains("\"complete\":true")
            && quickJson.contains("\"status\":\"ready\""), "极速模拟 JSON 输出完整且 ready: " + quickJson);
        Set<String> quickPool = new HashSet<>(Arrays.asList(quickCore));
        quickPool.addAll(Arrays.asList(quickSub));
        for (String name : CovenantDetector.NAMES) {
            if (!quickPool.contains(name)) {
                check(quickJson.contains("\"" + name + "\""), "极速模拟补齐未出现项 " + name);
            }
        }
        // 验证未出现在池中的项（如 奇迹、伊比利亚）确在 bannedCovenants 中
        int bannedIdx = quickJson.indexOf("\"bannedCovenants\"");
        int seenIdx = quickJson.indexOf("\"seenCovenants\"");
        String bannedSlice = quickJson.substring(bannedIdx, seenIdx);
        check(bannedSlice.contains("乌萨斯") && bannedSlice.contains("伊比利亚") && bannedSlice.contains("奇迹") && !bannedSlice.contains("炎"),
            "极速模拟 bannedCovenants 精确包含乌萨斯与其余8项: " + bannedSlice);

        // 极速模拟（无 hint）：恰好 8 核心 + 10 附加且连续 3 帧无新增后自动判定完成
        CovenantScanState.reset();
        CovenantScanState.begin();
        CovenantScanState.set("scanning", "测试无hint极速模拟");
        check(!CovenantScanState.observe(quickFrame), "无hint第1帧");
        check(!CovenantScanState.observe(quickFrame), "无hint第2帧确认18项");
        check(!CovenantScanState.observe(quickFrame), "无hint第3帧稳定1");
        check(!CovenantScanState.observe(quickFrame), "无hint第4帧稳定2");
        check(CovenantScanState.observe(quickFrame), "无hint第5帧连续3帧无新增触发极速模拟完成");
        check("极速模拟".equals(CovenantScanState.currentModeLabel()) && CovenantScanState.currentTargetCount() == 18, "无hint自动切极速模拟");

        // 单人模拟（solo hint）：10 核心 + 10 附加（20/26）提示上滑，补齐底排 6 项后完成
        CovenantScanState.reset();
        CovenantScanState.begin();
        CovenantScanState.set("scanning", "测试单人模拟");
        Map<String, Integer> soloPart = new HashMap<>();
        for (String c : CovenantDetector.CORE_NAMES) soloPart.put(c, 1);
        for (String s : quickSub) soloPart.put(s, -1);
        check(!CovenantScanState.observe(soloPart, "solo"), "单人第1帧");
        check(!CovenantScanState.observe(soloPart, "solo"), "单人第2帧20/26仍等待底排");
        String soloMidJson = CovenantScanState.json();
        check(soloMidJson.contains("单人模拟：已确认 20/26（核心已齐），请向上轻滑露出底排附加盟约")
            && soloMidJson.contains("\"targetCount\":26") && soloMidJson.contains("\"modeLabel\":\"单人模拟\""),
            "单人模拟 20/26 提示文案与 JSON 字段准确: " + soloMidJson);
        for (String s : CovenantDetector.SUB_NAMES) soloPart.put(s, -1);
        check(!CovenantScanState.observe(soloPart, "solo"), "底排6项第1帧");
        check(CovenantScanState.observe(soloPart, "solo"), "底排6项第2帧完成26/26");
        CovenantScanState.finish("单人模拟完成");
        check(CovenantScanState.json().contains("\"status\":\"ready\"") && CovenantScanState.json().contains("\"complete\":true"),
            "单人模拟 26/26 状态为 ready");

        System.out.println("PASS 23 scan-state lifecycle & quick/solo mode checks.");
    }
}
