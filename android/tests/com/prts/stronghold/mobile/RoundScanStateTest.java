package com.prts.dossier.review;

public final class RoundScanStateTest {
    private static int checks;
    private static void check(boolean value) { checks++; if (!value) throw new AssertionError("check " + checks); }
    public static void main(String[] args) {
        RoundScanState.reset(); String first = RoundScanState.begin();
        check(RoundScanState.matches(first)); check(RoundScanState.is("permission"));
        RoundScanState.calibrate("memory-only"); check(RoundScanState.is("calibrating"));
        check(!RoundScanState.select(-1, 0, .2, .2)); check(!RoundScanState.select(0, 0, Double.NaN, .2));
        check(!RoundScanState.select(0, 0, 0, .2)); check(RoundScanState.select(.1, .1, .2, .2));
        check(RoundScanState.preview().isEmpty()); check(RoundScanState.is("scanning"));
        long before = RoundScanState.generation(); RoundScanState.pause();
        check(RoundScanState.is("paused")); check(RoundScanState.generation() != before);
        RoundScanState.resume(); check(RoundScanState.is("scanning")); check(RoundScanState.region() != null);
        RoundScanState.stop("stop"); check(RoundScanState.region() == null); check(RoundScanState.preview().isEmpty());
        RoundScanState.reset(); check(!RoundScanState.matches(first));
        check(!RoundScanState.begin().equals(first));
        System.out.println("RoundScanState: " + checks + " checks passed");
    }
}
