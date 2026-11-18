package com.prts.stronghold.mobile;

public final class RoundDetectorTest {
    private static int checks;
    private static void eq(int expected, int actual) { checks++; if (expected != actual) throw new AssertionError("expected=" + expected + " actual=" + actual); }
    public static void main(String[] args) {
        eq(7, RoundDetector.parse("7")); eq(7, RoundDetector.parse("第７回合"));
        eq(15, RoundDetector.parse("R15")); eq(4, RoundDetector.parse("4/15"));
        eq(6, RoundDetector.parse("回合 6"));
        for (String invalid : new String[]{"0", "16", "44", "01:15", "3/8", "7 8", "1 2", "1\n5", "R1 R2", "金币12", "1/15 50", "R7/15x", ""}) eq(0, RoundDetector.parse(invalid));
        RoundDetector detector = new RoundDetector();
        eq(0, detector.observe("7", 0)); eq(0, detector.observe("7", 2000)); eq(7, detector.observe("7", 4000));
        eq(0, detector.observe("8", 6000)); eq(0, detector.observe("7", 8000)); eq(0, detector.observe("7", 10000)); eq(7, detector.observe("7", 12000));
        detector.reset(); eq(0, detector.observe("8", 15000)); eq(0, detector.observe("8", 17000)); eq(8, detector.observe("8", 19000));
        eq(0, detector.observe("计时 30", 21000)); eq(0, detector.observe("8", 23000));
        System.out.println("RoundDetector: " + checks + " checks passed");
    }
}
