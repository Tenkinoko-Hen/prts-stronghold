package com.prts.stronghold.mobile;

/** 文字定位后，仅判断其上方圆形盟约徽章；不依赖游戏动态排列顺序。 */
final class CovenantDetector {
    static final String[] NAMES = {"炎", "萨尔贡", "阿戈尔", "叙拉古", "卡西米尔", "维多利亚", "谢拉格", "乌萨斯", "伊比利亚", "莱塔尼亚",
        "精准", "远见", "投资人", "突袭", "不屈", "调和", "协防干员", "独行", "绝技", "聚合", "奥术", "迅捷", "灵巧", "坚守", "助力", "奇迹"};

    // 1 = 发光可用；-1 = 灰暗受限；0 = 无法确定，不自动当作可用。
    static int classify(int[] pixels, int width, int height, int left, int top, int right, int bottom) {
        double textHeight = bottom - top;
        if (textHeight < 8 || textHeight > height * .07) return 0;
        double cx = (left + right) / 2.0, cy = top - textHeight * 2.8, radius = textHeight * 1.65;
        if (cx - radius < 0 || cy - radius < 0 || cx + radius >= width || cy + radius >= height) return 0;
        int count = 0, green = 0, neutral = 0, bright = 0;
        for (int y = (int)(cy - radius); y <= cy + radius; y += 2) {
            for (int x = (int)(cx - radius); x <= cx + radius; x += 2) {
                double d = ((x-cx)*(x-cx) + (y-cy)*(y-cy)) / (radius*radius);
                if (d > 1) continue;
                int rgb = pixels[y * width + x], r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
                count++;
                if (g > 110 && g-r > 55 && b-r > 35) green++;
                if (g > 55 && Math.max(r, Math.max(g,b)) - Math.min(r,Math.min(g,b)) < 45) neutral++;
                if (r > 110 && g > 110 && b > 110) bright++;
            }
        }
        if (count == 0) return 0;
        if (green > count * .20) return 1;
        if (green < count * .015 && neutral > count * .30 && bright > count * .035) return -1;
        return 0;
    }
}
