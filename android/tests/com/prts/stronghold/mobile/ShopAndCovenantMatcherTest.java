package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.util.Arrays;
import java.util.List;

public final class ShopAndCovenantMatcherTest {
    private static int checks;
    private static void check(boolean ok, String message) {
        checks++;
        if (!ok) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        // CovenantDetector.matchToken：精准 + 2字形近 + 3-4字单字容错
        check("乌萨斯".equals(CovenantDetector.matchToken("乌萨斯")), "exact match");
        check("乌萨斯".equals(CovenantDetector.matchToken("乌萨期")), "1-edit 3-char fuzzy");
        check("维多利亚".equals(CovenantDetector.matchToken("维多利业")), "1-edit 4-char fuzzy");
        check("谢拉格".equals(CovenantDetector.matchToken("谢拉各")), "1-edit 3-char fuzzy 2");
        check(CovenantDetector.matchToken("谢拉古") == null, "reject ambiguous equidistant token between 谢拉格 & 叙拉古");
        check("莱塔尼亚".equals(CovenantDetector.matchToken("莱塔尼业")), "1-edit 4-char 莱塔尼亚");
        check("灵巧".equals(CovenantDetector.matchToken("灵功")), "near-two 灵巧");
        check("炎".equals(CovenantDetector.matchToken("炎")), "exact 炎");
        check(CovenantDetector.matchToken("杂音文字") == null, "reject unrelated");

        // ShopDetector.matchOperators：精准优先 + 长名不吞短名 + 3-6字单字容错
        List<String> catalog = Arrays.asList("维什戴尔", "赤刃明霄陈", "陈", "铃兰", "玛恩纳", "阿米娅", "妮芙");
        List<String> exact = ShopDetector.matchOperators("3 维什戴尔\n4 玛恩纳\n2 妮芙\n赤刃明霄陈", catalog);
        check(exact.contains("维什戴尔") && exact.contains("玛恩纳") && exact.contains("妮芙") && exact.contains("赤刃明霄陈"), "exact multi match: " + exact);
        check(!exact.contains("陈"), "long name should not falsely trigger short substring 陈: " + exact);

        List<String> fuzzy = ShopDetector.matchOperators("维什带尔  玛恩那", catalog);
        check(fuzzy.contains("维什戴尔") && fuzzy.contains("玛恩纳"), "1-edit shop fuzzy match: " + fuzzy);

        // ShopScanState 生命周期与迷你条摘要
        ShopScanState.reset();
        String id = ShopScanState.begin(catalog, Arrays.asList("维什戴尔", "铃兰"));
        check(id != null && !id.isEmpty() && ShopScanState.matches(id), "begin returns matching id");
        ShopScanState.complete(Arrays.asList("维什戴尔", "妮芙"));
        check(ShopScanState.is("ready"), "complete sets ready");
        String strip = ShopScanState.summaryForStrip();
        check(strip.contains("维什戴尔"), "strip highlights target: " + strip);
        ShopScanState.complete(Arrays.asList("妮芙"));
        check(ShopScanState.summaryForStrip().contains("无目标核心"), "strip handles non-target");
        ShopScanState.fail("测试失败");
        check(ShopScanState.is("error"), "fail sets error");

        System.out.println("ShopAndCovenantMatcher: " + checks + " checks passed");
    }
}
