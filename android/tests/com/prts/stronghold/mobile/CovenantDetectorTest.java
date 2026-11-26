package com.prts.stronghold.mobile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.*;

/** 对真实截图或合成 20:9/16:9 画面做徽章判色回归；文字框 OCR 需真机 ML Kit 验证。 */
public final class CovenantDetectorTest {
    private static void fillCircle(int[] pixels, int width, int height, double cx, double cy, double radius, int rgb) {
        int x0 = Math.max(0, (int) Math.floor(cx - radius));
        int x1 = Math.min(width - 1, (int) Math.ceil(cx + radius));
        int y0 = Math.max(0, (int) Math.floor(cy - radius));
        int y1 = Math.min(height - 1, (int) Math.ceil(cy + radius));
        double r2 = radius * radius;
        for (int y = y0; y <= y1; y++) {
            double dy = y - cy;
            for (int x = x0; x <= x1; x++) {
                double dx = x - cx;
                if (dx * dx + dy * dy <= r2) {
                    pixels[y * width + x] = rgb;
                }
            }
        }
    }

    private static void runSynthetic20x9AndBottomProbeTests() {
        if (CovenantDetector.CORE_NAMES.size() != 10 || CovenantDetector.SUB_NAMES.size() != 16) {
            throw new AssertionError("CORE_NAMES/SUB_NAMES size mismatch");
        }
        final int w = 2000, h = 899;
        final int greenRgb = (42 << 16) | (215 << 8) | 145;
        final int greyRgb = (155 << 16) | (155 << 8) | 155;

        // 1. 验证 20:9 小米 14 几何条件：(top - cy) / th = 3.85..4.25，radius = 2.45 * th
        for (double ratio : new double[] { 3.85, 4.05, 4.25 }) {
            for (int th : new int[] { 22, 6 }) {
                int[] pixels = new int[w * h];
                int top = 460;
                double radius = th * 2.45;
                double cy = top - th * ratio;
                fillCircle(pixels, w, h, 360.0, cy, radius, greenRgb);
                fillCircle(pixels, w, h, 620.0, cy, radius, greyRgb);
                int gState = CovenantDetector.classify(pixels, w, h, 340, top, 380, top + th);
                int bState = CovenantDetector.classify(pixels, w, h, 600, top, 640, top + th);
                int emptyState = CovenantDetector.classify(pixels, w, h, 900, top, 940, top + th);
                if (gState != 1) throw new AssertionError("20:9 green expected +1 ratio=" + ratio + " th=" + th + " got=" + gState);
                if (bState != -1) throw new AssertionError("20:9 grey expected -1 ratio=" + ratio + " th=" + th + " got=" + bState);
                if (emptyState != 0) throw new AssertionError("20:9 blank expected 0 got=" + emptyState);
            }
        }

        // 2. 验证单人模拟底排 6 枚无字徽章智能补判（全灰 / 全绿 / 混合态不盲猜）
        List<CovenantDetector.SubLabelBox> row1 = new ArrayList<>();
        double x0 = 280.0, dx = 120.0, top1 = 560.0, th = 22.0;
        for (int i = 0; i < 10; i++) {
            row1.add(new CovenantDetector.SubLabelBox("sub" + i, x0 + i * dx, top1, th));
        }
        List<String> missing6 = Arrays.asList("绝技", "精准", "迅捷", "助力", "聚合", "奥术");
        double cy2 = top1 + th * 6.8;
        double r2 = th * 2.45;

        int[] allGreyPixels = new int[w * h];
        for (int k = 0; k < 6; k++) fillCircle(allGreyPixels, w, h, x0 + k * dx, cy2, r2, greyRgb);
        Map<String, Integer> greyRes = CovenantDetector.probeBottomSixSubBadges(allGreyPixels, w, h, row1, missing6, x0);
        if (greyRes.size() != 6 || !Integer.valueOf(-1).equals(greyRes.get("奥术"))) {
            throw new AssertionError("bottom-6 all grey should infer 6x(-1), got " + greyRes);
        }

        int[] allGreenPixels = new int[w * h];
        for (int k = 0; k < 6; k++) fillCircle(allGreenPixels, w, h, x0 + k * dx, cy2, r2, greenRgb);
        Map<String, Integer> greenRes = CovenantDetector.probeBottomSixSubBadges(allGreenPixels, w, h, row1, missing6, x0);
        if (greenRes.size() != 6 || !Integer.valueOf(1).equals(greenRes.get("绝技"))) {
            throw new AssertionError("bottom-6 all green should infer 6x(+1), got " + greenRes);
        }

        int[] mixedPixels = Arrays.copyOf(allGreyPixels, allGreyPixels.length);
        fillCircle(mixedPixels, w, h, x0 + 2 * dx, cy2, r2, greenRgb);
        Map<String, Integer> mixedRes = CovenantDetector.probeBottomSixSubBadges(mixedPixels, w, h, row1, missing6, x0);
        if (!mixedRes.isEmpty()) {
            throw new AssertionError("bottom-6 mixed state must NOT guess, got " + mixedRes);
        }

        Map<String, Integer> blankRes = CovenantDetector.probeBottomSixSubBadges(new int[w * h], w, h, row1, missing6, x0);
        if (!blankRes.isEmpty()) {
            throw new AssertionError("bottom-6 blank must return empty");
        }

        // 3. 验证 shouldRunLeftStripRescue 精确触发边界（消除标准满屏 / 单人第 1 屏 / 极速模式多余补扫）
        if (CovenantDetector.shouldRunLeftStripRescue(null, "") || CovenantDetector.shouldRunLeftStripRescue(Collections.emptyMap(), "")) {
            throw new AssertionError("null/empty found must NOT trigger left rescue");
        }
        Map<String, Integer> full26 = new HashMap<>();
        for (String n : CovenantDetector.NAMES) full26.put(n, 1);
        if (CovenantDetector.shouldRunLeftStripRescue(full26, "")) {
            throw new AssertionError("complete 26 covenants must NOT trigger left rescue");
        }

        // 极速模式 18/18（8 核心 + 10 附加）不补扫；若 < 18 且缺左列「炎」则补扫
        Map<String, Integer> quick18 = new HashMap<>();
        String[] quickCore8 = { "炎", "萨尔贡", "阿戈尔", "叙拉古", "卡西米尔", "维多利亚", "谢拉格", "乌萨斯" };
        String[] quickSub10 = { "精准", "远见", "投资人", "突袭", "不屈", "调和", "协防干员", "独行", "绝技", "聚合" };
        for (String c : quickCore8) quick18.put(c, 1);
        for (String s : quickSub10) quick18.put(s, 1);
        if (CovenantDetector.shouldRunLeftStripRescue(quick18, "quick")) {
            throw new AssertionError("quick mode 18/18 must NOT trigger left rescue");
        }
        Map<String, Integer> quickMissingYan = new HashMap<>(quick18);
        quickMissingYan.remove("炎");
        if (!CovenantDetector.shouldRunLeftStripRescue(quickMissingYan, "quick")) {
            throw new AssertionError("quick mode missing left '炎' (<18) should trigger left rescue");
        }

        // 单人模拟第 1 屏恰好 core=10(含炎) + sub=10(灵巧..独行，缺底排绝技/精准/聚合) -> 不补扫！
        Map<String, Integer> soloScreen1 = new HashMap<>();
        for (String c : CovenantDetector.CORE_NAMES) soloScreen1.put(c, 1);
        for (String s : Arrays.asList("灵巧", "坚守", "远见", "奇迹", "投资人", "突袭", "不屈", "调和", "协防干员", "独行")) {
            soloScreen1.put(s, 1);
        }
        if (CovenantDetector.shouldRunLeftStripRescue(soloScreen1, "solo")) {
            throw new AssertionError("solo screen 1 (10 core + 10 row-1 sub) must NOT trigger left rescue");
        }
        Map<String, Integer> soloMissingYan = new HashMap<>(soloScreen1);
        soloMissingYan.remove("炎");
        if (!CovenantDetector.shouldRunLeftStripRescue(soloMissingYan, "solo")) {
            throw new AssertionError("solo screen 1 missing '炎' (core=9) should trigger left rescue");
        }

        // 非极速模式仅缺右列非左边缘项（如奥术）不补扫；缺左边缘（精准/聚合/灵巧/绝技）才补扫
        Map<String, Integer> missingRightOnly = new HashMap<>(full26);
        missingRightOnly.remove("奥术");
        if (CovenantDetector.shouldRunLeftStripRescue(missingRightOnly, "")) {
            throw new AssertionError("missing non-left sub item '奥术' should NOT trigger left rescue");
        }
        Map<String, Integer> missingLeftPreci = new HashMap<>(full26);
        missingLeftPreci.remove("精准");
        if (!CovenantDetector.shouldRunLeftStripRescue(missingLeftPreci, "")) {
            throw new AssertionError("missing left-edge sub item '精准' should trigger left rescue");
        }
        Map<String, Integer> noisyTiny = new HashMap<>();
        noisyTiny.put("萨尔贡", 1);
        noisyTiny.put("阿戈尔", 1);
        noisyTiny.put("远见", 1);
        if (CovenantDetector.shouldRunLeftStripRescue(noisyTiny, "")) {
            throw new AssertionError("tiny noisy frame (<7 core/sub) must NOT trigger left rescue");
        }
    }

    public static void main(String[] args) throws Exception {
        runSynthetic20x9AndBottomProbeTests();
        int assertions = 22;
        if (args.length > 0 && new File(args[0]).isFile()) {
            BufferedImage image = ImageIO.read(new File(args[0]));
            String[][] rows = {{"炎","谢拉格","阿戈尔","伊比利亚","莱塔尼亚","萨尔贡","维多利亚","叙拉古","卡西米尔","乌萨斯"},
                {"灵巧","坚守","远见","奇迹","投资人","突袭","不屈","调和","协防干员","独行"},
                {"绝技","精准","迅捷","助力","聚合","奥术"}};
            Set<String> bans = new HashSet<>(Arrays.asList("萨尔贡","维多利亚","叙拉古","卡西米尔","乌萨斯","精准","迅捷","助力","聚合","奥术"));
            for (int width : new int[]{2670, 1920, 1600}) {
                double scale = width / 2670.0; int height = (int) Math.round(image.getHeight() * scale);
                BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
                java.awt.Graphics2D graphics = resized.createGraphics(); graphics.drawImage(image, 0, 0, width, height, null); graphics.dispose();
                int[] pixels = resized.getRGB(0, 0, width, height, null, 0, width);
                for (int row = 0; row < 3; row++) for (int col = 0; col < rows[row].length; col++) {
                    String name = rows[row][col];
                    for (int textHeight : new int[]{25, 28, 30}) {
                        int cx = (int) Math.round((364 + 143.5 * col) * scale), top = (int) Math.round(new int[]{479, 828, 1070}[row] * scale);
                        int half = (int) Math.round(name.length() * 14 * scale), h = (int) Math.round(textHeight * scale);
                        int state = CovenantDetector.classify(pixels, width, height, cx - half, top, cx + half, top + h);
                        int expected = bans.contains(name) ? -1 : 1;
                        if (state != expected) throw new AssertionError(name + " width=" + width + " height=" + textHeight + " expected=" + expected + " actual=" + state);
                        assertions++;
                    }
                }
                if (CovenantDetector.classify(new int[width * height], width, height, 200, 200, 240, 225) != 0) throw new AssertionError("空白图不能当作可用或受限");
                assertions++;
            }
        }
        System.out.println("PASS " + assertions + " detector checks (20:9 wide, bottom-6 probe & regression).");
    }
}
