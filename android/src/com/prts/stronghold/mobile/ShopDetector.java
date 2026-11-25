package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** 从商店区 OCR 文本中匹配干员名（支持精确匹配与 3+ 字名 1 字形近容错）。 */
final class ShopDetector {
    private ShopDetector() {}

    static List<String> matchOperators(String ocrText, List<String> catalog) {
        List<String> matched = new ArrayList<>();
        if (ocrText == null || ocrText.isEmpty() || catalog == null || catalog.isEmpty()) return matched;
        String compact = ocrText.replaceAll("[\\s·•・\\-—_\"'“”‘’「」『』()（）【】]+", "");
        if (compact.isEmpty()) return matched;

        // 按名字长度降序，优先匹配长名（例如「纯烬艾雅法拉」先于「艾雅法拉」、「归溟幽灵鲨」先于「幽灵鲨」）
        List<String> sorted = new ArrayList<>(catalog);
        sorted.sort((a, b) -> Integer.compare(b.length(), a.length()));

        Set<String> found = new LinkedHashSet<>();
        StringBuilder remaining = new StringBuilder(compact);

        // 1. 精确子串匹配
        for (String name : sorted) {
            if (name == null || name.isEmpty()) continue;
            String key = name.replaceAll("[\\s·•・\\-]+", "");
            if (key.isEmpty()) continue;
            int idx = remaining.indexOf(key);
            if (idx >= 0) {
                found.add(name);
                for (int i = idx; i < idx + key.length(); i++) remaining.setCharAt(i, ' ');
            }
        }

        // 2. 对 3~6 字的干员名做 1 字滑窗形近容错，避免商店小字漏检
        String leftText = remaining.toString();
        String[] chunks = leftText.split("\\s+");
        for (String chunk : chunks) {
            if (chunk.length() < 3) continue;
            for (String name : sorted) {
                if (found.contains(name)) continue;
                String key = name.replaceAll("[\\s·•・\\-]+", "");
                int len = key.length();
                if (len < 3 || len > 6 || chunk.length() < len) continue;
                for (int start = 0; start <= chunk.length() - len; start++) {
                    int diff = 0;
                    for (int k = 0; k < len; k++) {
                        if (chunk.charAt(start + k) != key.charAt(k)) {
                            diff++;
                            if (diff > 1) break;
                        }
                    }
                    if (diff == 1) {
                        found.add(name);
                        break;
                    }
                }
            }
        }
        matched.addAll(found);
        return matched;
    }
}
