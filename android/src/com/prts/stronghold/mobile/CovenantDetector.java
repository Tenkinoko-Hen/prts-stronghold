package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.util.HashMap;
import java.util.Map;

/** 文字定位后，判断其上方圆形盟约徽章；支持形近字容错与自适应圆心采样，不依赖游戏动态排列顺序。 */
final class CovenantDetector {
    static final String[] NAMES = {
        "炎", "萨尔贡", "阿戈尔", "叙拉古", "卡西米尔", "维多利亚", "谢拉格", "乌萨斯", "伊比利亚", "莱塔尼亚",
        "精准", "远见", "投资人", "突袭", "不屈", "调和", "协防干员", "独行", "绝技", "聚合", "奥术", "迅捷", "灵巧", "坚守", "助力", "奇迹"
    };

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

    private static int classifyAt(int[] pixels, int width, int height, double cx, double cy, double radius) {
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
        if (textHeight < 7 || textHeight > height * .085) return 0;
        double cx = (left + right) / 2.0;
        // 先用标准几何位置，若因 MLKit 行框留白偏高/偏低导致未命中，再做轻度自适应偏移补偿
        int primary = classifyAt(pixels, width, height, cx, top - textHeight * 2.8, textHeight * 1.65);
        if (primary != 0) return primary;
        int lower = classifyAt(pixels, width, height, cx, top - textHeight * 2.25, textHeight * 1.45);
        if (lower != 0) return lower;
        return classifyAt(pixels, width, height, cx, top - textHeight * 3.15, textHeight * 1.55);
    }
}
