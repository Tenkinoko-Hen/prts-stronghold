package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 文字定位后，判断其上方圆形盟约徽章；支持形近字容错与自适应圆心采样，不依赖游戏动态排列顺序。 */
final class CovenantDetector {
    static final String[] NAMES = {
        "炎", "萨尔贡", "阿戈尔", "叙拉古", "卡西米尔", "维多利亚", "谢拉格", "乌萨斯", "伊比利亚", "莱塔尼亚",
        "精准", "远见", "投资人", "突袭", "不屈", "调和", "协防干员", "独行", "绝技", "聚合", "奥术", "迅捷", "灵巧", "坚守", "助力", "奇迹"
    };

    static final Set<String> CORE_NAMES = Collections.unmodifiableSet(
        new LinkedHashSet<>(Arrays.asList(Arrays.copyOfRange(NAMES, 0, 10)))
    );

    static final Set<String> SUB_NAMES = Collections.unmodifiableSet(
        new LinkedHashSet<>(Arrays.asList(Arrays.copyOfRange(NAMES, 10, NAMES.length)))
    );

    private static final Map<String, String> NEAR_TWO = new HashMap<>();
    static {
        NEAR_TWO.put("精淮", "精准");
        NEAR_TWO.put("精难", "精准");
        NEAR_TWO.put("迅连", "迅捷");
        NEAR_TWO.put("迅漣", "迅捷");
        NEAR_TWO.put("迅建", "迅捷");
        NEAR_TWO.put("谌和", "调和");
        NEAR_TWO.put("周和", "调和");
        NEAR_TWO.put("聚台", "聚合");
        NEAR_TWO.put("独仃", "独行");
        NEAR_TWO.put("不居", "不屈");
        NEAR_TWO.put("助カ", "助力");
        NEAR_TWO.put("奥木", "奥术");
        NEAR_TWO.put("坚宁", "坚守");
        NEAR_TWO.put("灵污", "灵巧");
        NEAR_TWO.put("灵功", "灵巧");
        NEAR_TWO.put("远觅", "远见");
        NEAR_TWO.put("炎国", "炎");
    }

    /** 将 OCR 切出的短词容错映射到 26 项标准盟约名；不确定时返回 null。 */
    static String matchToken(String raw) {
        if (raw == null) return null;
        String token = raw.trim();
        if (token.isEmpty()) return null;
        for (String name : NAMES) {
            if (name.equals(token)) return name;
        }
        String mapped = NEAR_TWO.get(token);
        if (mapped != null) return mapped;
        int len = token.length();
        if (len < 3 || len > 4) return null;
        String best = null;
        int hits = 0;
        for (String target : NAMES) {
            if (target.length() != len) continue;
            int diff = 0;
            for (int i = 0; i < len; i++) {
                if (target.charAt(i) != token.charAt(i)) diff++;
            }
            if (diff == 1) {
                best = target;
                hits++;
            }
        }
        return hits == 1 ? best : null;
    }

    static final class SubLabelBox {
        final String name;
        final double cx;
        final double top;
        final double th;
        SubLabelBox(String name, double cx, double top, double th) {
            this.name = name;
            this.cx = cx;
            this.top = top;
            this.th = th;
        }
    }

    static int classifyCircle(int[] pixels, int width, int height, double cx, double cy, double radius) {
        if (pixels == null || width <= 0 || height <= 0 || pixels.length < width * height) return 0;
        if (radius < 6 || cx - radius < 0 || cy - radius < 0 || cx + radius >= width || cy + radius >= height) return 0;
        int count = 0, green = 0, neutral = 0, bright = 0;
        int yStart = (int) (cy - radius), yEnd = (int) (cy + radius);
        int xStart = (int) (cx - radius), xEnd = (int) (cx + radius);
        double invR2 = 1.0 / (radius * radius);
        for (int y = yStart; y <= yEnd; y += 2) {
            double dy = y - cy;
            double dy2 = dy * dy;
            int rowOff = y * width;
            for (int x = xStart; x <= xEnd; x += 2) {
                double dx = x - cx;
                if ((dx * dx + dy2) * invR2 > 1.0) continue;
                int rgb = pixels[rowOff + x];
                int r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
                count++;
                if (g > 110 && g - r > 55 && b - r > 35) green++;
                if (g > 55 && Math.max(r, Math.max(g, b)) - Math.min(r, Math.min(g, b)) < 45) neutral++;
                if (r > 110 && g > 110 && b > 110) bright++;
            }
        }
        if (count == 0) return 0;
        if (green > count * .20) return 1;
        if (green < count * .015 && neutral > count * .30 && bright > count * .035) return -1;
        return 0;
    }

    // 1 = 发光可用；-1 = 灰暗受限；0 = 无法确定，不自动当作可用。
    static int classify(int[] pixels, int width, int height, int left, int top, int right, int bottom) {
        double textHeight = bottom - top;
        if (textHeight < 6 || textHeight > height * .085) return 0;
        double cx = (left + right) / 2.0;
        // 先用标准 16:9 几何位置，若未命中再做轻度偏移及宽屏/20:9（小米 14 等）高偏移采样
        int primary = classifyCircle(pixels, width, height, cx, top - textHeight * 2.8, textHeight * 1.65);
        if (primary != 0) return primary;
        int lower = classifyCircle(pixels, width, height, cx, top - textHeight * 2.25, textHeight * 1.45);
        if (lower != 0) return lower;
        int higher = classifyCircle(pixels, width, height, cx, top - textHeight * 3.15, textHeight * 1.55);
        if (higher != 0) return higher;
        int wide = classifyCircle(pixels, width, height, cx, top - textHeight * 3.85, textHeight * 1.95);
        if (wide != 0) return wide;
        return classifyCircle(pixels, width, height, cx, top - textHeight * 4.35, textHeight * 1.95);
    }

    /**
     * 单人模拟底排无字徽章智能补判：
     * 根据第 1 行已命中附加盟约的 (cx, top, th) 计算水平列距 dx 与行距（向下 ~6.8 * th），
     * 探测底部第 2 行 6 个圆形徽章；仅当全部 6 个位置均有效分类且全灰(-1)或全绿(+1)时才返回补判结果。
     */
    static Map<String, Integer> probeBottomSixSubBadges(
        int[] pixels, int width, int height,
        List<SubLabelBox> subHits, Collection<String> missingSub, double coreLeftCx
    ) {
        if (pixels == null || subHits == null || missingSub == null || missingSub.size() != 6 || subHits.size() < 6) {
            return Collections.emptyMap();
        }
        double minTop = Double.MAX_VALUE;
        for (SubLabelBox b : subHits) {
            if (b.top < minTop) minTop = b.top;
        }
        List<SubLabelBox> row1 = new ArrayList<>();
        for (SubLabelBox b : subHits) {
            if (Math.abs(b.top - minTop) <= Math.max(12.0, b.th * 1.4)) {
                row1.add(b);
            }
        }
        if (row1.size() < 6) return Collections.emptyMap();
        Collections.sort(row1, Comparator.comparingDouble(a -> a.cx));

        double sumTh = 0, sumTop = 0;
        for (SubLabelBox b : row1) {
            sumTh += b.th;
            sumTop += b.top;
        }
        double avgTh = sumTh / row1.size();
        double row1Top = sumTop / row1.size();
        if (avgTh < 6) return Collections.emptyMap();

        List<Double> gaps = new ArrayList<>();
        double minGap = Double.MAX_VALUE;
        for (int i = 0; i + 1 < row1.size(); i++) {
            double g = row1.get(i + 1).cx - row1.get(i).cx;
            if (g >= avgTh * 3.0 && g <= avgTh * 10.5) {
                gaps.add(g);
                if (g < minGap) minGap = g;
            }
        }
        if (gaps.isEmpty()) return Collections.emptyMap();

        double gapSum = 0;
        int gapCnt = 0;
        for (double g : gaps) {
            if (g <= minGap * 1.45) {
                gapSum += g;
                gapCnt++;
            }
        }
        if (gapCnt == 0) return Collections.emptyMap();
        double dx = gapSum / gapCnt;
        if (dx < avgTh * 3.0 || dx > width * 0.25) return Collections.emptyMap();

        double firstCx = row1.get(0).cx;
        double lastCx = row1.get(row1.size() - 1).cx;
        int spanCols = (int) Math.round((lastCx - firstCx) / dx);
        double baseX0 = firstCx;
        if (row1.size() < 10 && spanCols < 9 && !Double.isNaN(coreLeftCx)) {
            int shiftCols = (int) Math.round((firstCx - coreLeftCx) / dx);
            if (shiftCols >= 0 && shiftCols <= 4) {
                baseX0 = firstCx - shiftCols * dx;
            }
        }
        double x0Sum = 0;
        int x0Cnt = 0;
        for (SubLabelBox b : row1) {
            int col = (int) Math.round((b.cx - baseX0) / dx);
            if (col >= 0 && col <= 9) {
                x0Sum += (b.cx - col * dx);
                x0Cnt++;
            }
        }
        double x0 = x0Cnt > 0 ? (x0Sum / x0Cnt) : baseX0;

        double py1 = row1Top + avgTh * 6.8;
        double py2 = row1Top + avgTh * 6.1;
        double r1 = avgTh * 1.95;
        double r2 = avgTh * 1.65;
        int unified = 0;
        for (int k = 0; k < 6; k++) {
            double px = x0 + dx * k;
            int s = classifyCircle(pixels, width, height, px, py1, r1);
            if (s == 0) s = classifyCircle(pixels, width, height, px, py2, r2);
            if (s == 0) return Collections.emptyMap();
            if (unified == 0) unified = s;
            else if (s != unified) return Collections.emptyMap();
        }
        Map<String, Integer> out = new HashMap<>();
        for (String name : missingSub) {
            out.put(name, unified);
        }
        return out;
    }

    /**
     * 判断初轮全屏 OCR 后是否需要对最左列窄条执行 2x 放大补扫：
     * - 已收齐 26 项或极速模式已收齐 18 项（>=8 核心 + >=10 附加）时不触发；
     * - 非极速模式仅当核心已识别 7..9 项且缺少「炎」，或附加已识别 7..15 项且缺左列边缘项
     *   （排除单人第 1 屏恰好 core >= 9 && sub == 10，底排 6 项未滚出的情况）时才触发补扫。
     */
    static boolean shouldRunLeftStripRescue(Map<String, Integer> found, String modeHint) {
        if (found == null || found.isEmpty() || found.size() >= NAMES.length) return false;
        int core = 0;
        int sub = 0;
        for (String name : found.keySet()) {
            if (CORE_NAMES.contains(name)) core++;
            else if (SUB_NAMES.contains(name)) sub++;
        }
        if ("quick".equals(modeHint)) {
            if (found.size() >= 18 || (core >= 8 && sub >= 10)) return false;
            return (core >= 6 && core < 8 && !found.containsKey("炎"))
                || (sub >= 7 && sub < 10 && (!found.containsKey("精准") || !found.containsKey("聚合")));
        }
        if (core >= 7 && core < 10 && !found.containsKey("炎")) {
            return true;
        }
        if (core >= 9 && sub == 10) {
            return false;
        }
        boolean missingLeftSub = !found.containsKey("灵巧")
            || !found.containsKey("绝技")
            || !found.containsKey("精准")
            || !found.containsKey("聚合");
        return sub >= 7 && sub < 16 && missingLeftSub;
    }
}
