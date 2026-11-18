package com.prts.stronghold.mobile;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 只解析用户框选的回合区域；计时、金币及多个数字一律拒绝。 */
final class RoundDetector {
    private static final Pattern ROUND = Pattern.compile("^(?:(?:第|R|ROUND)?(\\d{1,2})(?:回合|轮)?|(?:回合|轮次)(\\d{1,2})|(\\d{1,2})[/／]15)$");
    private int candidate, votes;
    private long since;

    static int parse(String text) {
        if (text == null) return 0;
        if (Pattern.compile("[0-9０-９]\\s+[0-9０-９]").matcher(text).find()) return 0;
        StringBuilder normalized = new StringBuilder();
        for (char c : text.toUpperCase(Locale.ROOT).toCharArray()) {
            if (Character.isWhitespace(c)) continue;
            normalized.append(c >= '０' && c <= '９' ? (char)('0' + c - '０') : c);
        }
        Matcher match = ROUND.matcher(normalized);
        if (!match.matches()) return 0;
        for (int i = 1; i <= 3; i++) if (match.group(i) != null) {
            int value = Integer.parseInt(match.group(i));
            return value >= 1 && value <= 15 ? value : 0;
        }
        return 0;
    }

    int observe(String text, long now) {
        int value = parse(text);
        if (value == 0) { reset(); return 0; }
        if (candidate != value) { candidate = value; votes = 1; since = now; return 0; }
        votes++;
        return votes >= 3 && now - since >= 3500 ? value : 0;
    }

    void reset() { candidate = 0; votes = 0; since = 0; }
}
