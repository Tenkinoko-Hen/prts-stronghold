package com.prts.dossier.review;

import java.util.HashMap;
import java.util.Map;

public final class CovenantScanStateTest {
    private static void check(boolean condition,String message) { if(!condition) throw new AssertionError(message); }
    public static void main(String[] args) {
        CovenantScanState.reset();
        check(CovenantScanState.begin(),"首轮可启动");
        String old=CovenantScanState.currentId();
        check(!CovenantScanState.begin(),"重复点击不能创建第二个授权请求");
        CovenantScanState.set("cancelled","退出");
        check(!CovenantScanState.permissionPending(),"关闭助手后授权失效");
        CovenantScanState.reset();
        check(!CovenantScanState.matches(old),"新局不能接受旧授权或回调");
        check(CovenantScanState.begin(),"新局可重新扫描");
        check(!old.equals(CovenantScanState.currentId()),"每次扫描使用独立标识");
        CovenantScanState.set("scanning","测试");
        Map<String,Integer> frame=new HashMap<>();
        for(String name:CovenantDetector.NAMES) frame.put(name,1);
        check(!CovenantScanState.observe(frame),"单帧不能确认全部");
        check(CovenantScanState.observe(frame),"同状态至少两帧后完成");
        frame.put("精准",-1);
        check(!CovenantScanState.observe(frame),"冲突帧使对应项回到待确认");
        check(CovenantScanState.observe(frame),"第二帧确认新状态");
        CovenantScanState.reset();
        check(!CovenantScanState.observe(frame),"重置后不接收旧帧");
        System.out.println("PASS 11 scan-state lifecycle checks.");
    }
}
