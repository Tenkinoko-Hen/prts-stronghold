package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * 安卓端稳定性与容错混沌测试套件（Fuzzing + Stream Self-Healing + Extreme State Stress）：
 * 1. PacketCodec 2000 轮确定性随机变异与畸形包 Fuzzing（零异常、零越界）；
 * 2. StrongholdWireDecoder 乱序垃圾流、超大/负数帧长、>1MB 缓冲区溢出后的自动对齐自愈，以及全消息号截断容错；
 * 3. BattleCaptureState 越界席位/回合、负数血量/伤害、高频连续 15 局切换压测。
 */
public final class StabilityAndResilienceTest {
    private static int checks;

    private static void check(boolean ok, String msg) {
        checks++;
        if (!ok) throw new AssertionError(msg);
    }

    private static void writeStr(DataOutputStream out, String s) throws Exception {
        byte[] b = s.getBytes(StandardCharsets.UTF_8);
        out.writeShort(b.length);
        out.write(b);
    }

    private static byte[] wrapFrame(int msgId, byte[] body) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(baos);
        out.writeInt(body.length);
        out.writeInt(msgId);
        out.write(body);
        return baos.toByteArray();
    }

    private static byte[] buildValidFrame300(int seed, String[] bans, int round) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(baos);
        writeStr(out, "mode_multi_hard");
        writeStr(out, "stage_01");
        writeStr(out, "boss_1");
        writeStr(out, "");
        out.writeInt(seed);
        out.writeByte(1);
        out.writeShort(bans.length);
        for (String b : bans) writeStr(out, b);
        out.writeShort(4);
        for (int s = 1; s <= 4; s++) {
            writeStr(out, "acc_" + s);
            out.writeByte(s);
            out.writeShort(0);
            writeStr(out, "");
            writeStr(out, "P" + s);
            for (int i = 0; i < 5; i++) writeStr(out, "");
            out.write(new byte[5]);
            writeStr(out, "");
            out.writeByte(0);
            writeStr(out, "");
            out.writeShort(0);
        }
        // minimal scene
        out.writeByte(0);
        out.writeByte(3); // prep
        out.writeByte(round);
        out.writeLong(1000L + seed);
        out.writeShort(4);
        for (int s = 1; s <= 4; s++) {
            out.writeByte(s);
            out.writeByte(0); out.writeByte(1); out.writeByte(0);
            out.writeShort(25);
            out.writeByte(0); out.writeByte(0); out.writeByte(0); out.writeByte(0);
            out.writeInt(0);
        }
        // spawn_preview (1 enemy)
        out.writeShort(1);
        out.writeByte(1);
        writeStr(out, "enemy_1006_shield_2");
        out.writeByte(0);
        out.writeByte(3);
        out.writeByte(round + 1);
        for (int i = 0; i < 9; i++) out.writeShort(0);
        out.writeShort(0);
        return wrapFrame(300, baos.toByteArray());
    }

    private static void testPacketCodecFuzzing() {
        PacketCodec.ParsedPacket out = new PacketCodec.ParsedPacket();
        check(!PacketCodec.parse(null, 0, out), "null packet rejected");
        check(!PacketCodec.parse(new byte[0], 0, out), "empty packet rejected");
        check(!PacketCodec.parse(new byte[19], 19, out), "19-byte packet rejected");

        // IPv6 header (version = 6)
        byte[] ipv6 = new byte[48];
        ipv6[0] = 0x60;
        check(!PacketCodec.parse(ipv6, ipv6.length, out), "IPv6 packet cleanly ignored");

        // Invalid IHL (< 20 and > length)
        byte[] badIhl = new byte[40];
        badIhl[0] = 0x42; // IHL = 8
        check(!PacketCodec.parse(badIhl, badIhl.length, out), "IHL < 20 rejected");
        badIhl[0] = 0x4F; // IHL = 60 > 40
        check(!PacketCodec.parse(badIhl, badIhl.length, out), "IHL > length rejected");

        // Fragmented IPv4 packet
        int srcIp = 0x0A000001;
        int dstIp = 0x2F640102;
        byte[] fragTcp = PacketCodec.buildTcpPacket(srcIp, 12345, dstIp, 443, 1, 1, PacketCodec.TCP_ACK, 4096, new byte[] { 1, 2, 3 }, 0, 3);
        fragTcp[6] = 0x20; // More Fragments = 1
        check(!PacketCodec.parse(fragTcp, fragTcp.length, out), "fragmented IPv4 safely skipped");

        // 2,000 deterministic fuzz rounds (random packets + mutated valid TCP/UDP packets)
        Random rng = new Random(0x50525453L);
        int validParsed = 0;
        for (int i = 0; i < 2000; i++) {
            byte[] buf;
            int passLen;
            if (i % 3 == 0) {
                int len = rng.nextInt(180);
                buf = new byte[len];
                rng.nextBytes(buf);
                passLen = len > 0 ? rng.nextInt(len + 1) : 0;
            } else if (i % 3 == 1) {
                byte[] pl = new byte[rng.nextInt(64)];
                rng.nextBytes(pl);
                buf = PacketCodec.buildTcpPacket(srcIp, 1000 + (i & 0xFF), dstIp, 8443, i, i * 2, PacketCodec.TCP_ACK | PacketCodec.TCP_PSH, 8192, pl, 0, pl.length);
                // Mutate 1..3 bytes randomly
                for (int m = 0; m < 1 + (i % 3); m++) {
                    buf[rng.nextInt(buf.length)] ^= (byte) (1 + rng.nextInt(254));
                }
                passLen = rng.nextBoolean() ? buf.length : rng.nextInt(buf.length + 1);
            } else {
                byte[] pl = new byte[rng.nextInt(64)];
                rng.nextBytes(pl);
                buf = PacketCodec.buildUdpPacket(srcIp, 53, dstIp, 50000 + (i & 0xFF), pl, 0, pl.length);
                buf[rng.nextInt(buf.length)] ^= (byte) (1 + rng.nextInt(254));
                passLen = rng.nextBoolean() ? buf.length : rng.nextInt(buf.length + 1);
            }
            boolean ok = PacketCodec.parse(buf, passLen, out);
            if (ok) {
                validParsed++;
                check(out.payloadOffset >= 20 && out.payloadLength >= 0 && out.payloadOffset + out.payloadLength <= passLen,
                    "fuzz packet bounds invariant violated at iter " + i);
            }
        }
        check(validParsed > 100, "mutated fuzz corpus exercised valid parse branch: " + validParsed);
    }

    private static void testWireDecoderSelfHealingAndTruncatedFrames() throws Exception {
        StrongholdEnemyCatalog.registerForTest("enemy_1006_shield_2", "重装防御组长");
        StrongholdWireDecoder decoder = new StrongholdWireDecoder();
        Random rng = new Random(20261125L);

        // 1. Feed negative bodyLen, huge bodyLen (> MAX_BODY), and random garbage chunks
        ByteArrayOutputStream bad = new ByteArrayOutputStream();
        DataOutputStream badOut = new DataOutputStream(bad);
        badOut.writeInt(-42);
        badOut.writeInt(300);
        badOut.writeInt(999_999_999);
        badOut.writeInt(302);
        byte[] noise = new byte[4096];
        rng.nextBytes(noise);
        badOut.write(noise);
        byte[] badBytes = bad.toByteArray();
        decoder.feed(StrongholdWireDecoder.DIR_DOWN, badBytes, 0, badBytes.length);

        // 2. Trigger > 1MB MAX_BUFFER overflow with an incomplete header claiming valid MAX_BODY so buffer accumulates then resets cleanly
        byte[] chunk = new byte[65536];
        rng.nextBytes(chunk);
        for (int i = 0; i < 18; i++) {
            decoder.feed(StrongholdWireDecoder.DIR_DOWN, chunk, 0, chunk.length);
        }

        // 3. Immediately feed a clean Frame 300 in 7-byte tiny fragments -> must self-heal and decode!
        byte[] valid300 = buildValidFrame300(556677, new String[] { "yanShip", "sargonShip" }, 2);
        int recovered = 0;
        BattleCaptureState.resetMatch();
        for (int off = 0; off < valid300.length; ) {
            int step = Math.min(7, valid300.length - off);
            List<StrongholdWireDecoder.Event> evs = decoder.feed(StrongholdWireDecoder.DIR_DOWN, valid300, off, step);
            for (StrongholdWireDecoder.Event ev : evs) {
                BattleCaptureState.accept(ev);
                recovered++;
            }
            off += step;
        }
        check(recovered == 1, "decoder self-healed after >1MB overflow and decoded fragmented 300");
        check(BattleCaptureState.isBansConfirmed() && BattleCaptureState.getBannedCovenantsSnapshot().contains("炎"),
            "recovered Frame 300 synced banned covenants");

        // 4. Truncated / random-body fuzzing across EVERY known msgId (up & down) -> 0 uncaught exceptions
        int[] downIds = { 300, 302, 306, 310, 344, 348, 354, 366 };
        int[] upIds = { 303, 311, 313, 341, 367 };
        for (int id : downIds) {
            for (int len = 0; len <= 96; len += 5) {
                byte[] body = new byte[len];
                rng.nextBytes(body);
                byte[] frame = wrapFrame(id, body);
                StrongholdWireDecoder d = new StrongholdWireDecoder();
                d.feed(StrongholdWireDecoder.DIR_DOWN, frame, 0, frame.length);
            }
        }
        for (int id : upIds) {
            for (int len = 0; len <= 96; len += 5) {
                byte[] body = new byte[len];
                rng.nextBytes(body);
                byte[] frame = wrapFrame(id, body);
                StrongholdWireDecoder d = new StrongholdWireDecoder();
                d.feed(StrongholdWireDecoder.DIR_UP, frame, 0, frame.length);
            }
        }
        check(true, "all truncated/corrupted msgIds handled without throwing");
    }

    private static void testBattleCaptureStateExtremeValuesAndRollover() throws Exception {
        BattleCaptureState.resetMatch();

        // Construct an event with extreme out-of-range seats, negative HP/damage, duplicate help kills
        StrongholdWireDecoder.Event extreme = new StrongholdWireDecoder.Event("phase");
        extreme.messageId = 302;
        extreme.stageSeed = 111;
        extreme.selfUid = 99; // invalid seat -> fallback safely
        extreme.round = 99; // > 15
        extreme.phase = "boss";
        extreme.bossId = "boss_unknown_999";
        extreme.bossHp = -500;
        extreme.hpBySeat.put(-1, -20);
        extreme.hpBySeat.put(1, -5);
        extreme.hpBySeat.put(5, 999);
        extreme.shopLevelBySeat.put(0, 99);
        extreme.shopLevelBySeat.put(1, 6);
        extreme.shopLevelBySeat.put(2, -3);
        extreme.bossDamageBySeat.put(1, -100);
        extreme.bossDamageBySeat.put(2, 250000);
        extreme.bossDamageBySeat.put(9, 999999);
        extreme.hasEscapedSection = true;
        extreme.escapedEnemies.add(new StrongholdWireDecoder.EscapedEnemy(99, 1, false, "", false));
        extreme.escapedEnemies.add(new StrongholdWireDecoder.EscapedEnemy(1, 2, false, "enemy_1006_shield_2", false));
        extreme.helpKills.add(new StrongholdWireDecoder.HelpKill(2, false, 2, 1, "enemy_1006_shield_2"));
        extreme.helpKills.add(new StrongholdWireDecoder.HelpKill(2, false, 2, 1, "enemy_1006_shield_2")); // duplicate instance
        BattleCaptureState.accept(extreme);

        BattleCaptureState.TelemetrySnapshot snap = BattleCaptureState.buildTelemetrySnapshot();
        check(snap.cumulativeLeak.seats.size() == 4, "always 4 seats even with out-of-range seat inputs");
        check(snap.cumulativeLeak.seats.get(0).shopLevel == 6, "valid 6本 retained");
        check(snap.cumulativeLeak.seats.get(1).shopLevel == 0, "negative shopLevel ignored");
        check(snap.boss.players.size() == 4 && snap.boss.teamDamage == 250000, "negative & seat-9 boss damage ignored");
        check(snap.boss.hpPct == -1, "negative bossHp produces safe -1 hpPct");
        String json = BattleCaptureState.json();
        check(json != null && json.startsWith("{"), "json() never throws on extreme state");

        // Rapid 15-match rollover stress: verify no cross-match leak or ban bleed
        StrongholdWireDecoder decoder = new StrongholdWireDecoder();
        for (int match = 1; match <= 15; match++) {
            String ban = (match % 2 == 0) ? "ursusShip" : "yanShip";
            byte[] f300 = buildValidFrame300(10000 + match, new String[] { ban }, 1);
            for (StrongholdWireDecoder.Event ev : decoder.feed(StrongholdWireDecoder.DIR_DOWN, f300, 0, f300.length)) {
                BattleCaptureState.accept(ev);
            }
            List<String> bans = BattleCaptureState.getBannedCovenantsSnapshot();
            String expected = (match % 2 == 0) ? "乌萨斯" : "炎";
            check(bans.size() == 1 && expected.equals(bans.get(0)), "match " + match + " clean rollover bans: " + bans);
            check(BattleCaptureState.buildLeakSnapshot(0).totalLeaks == 0, "match " + match + " reset previous leaks");
        }
    }

    private static void testEventLogDeduplicationAndRingBound() throws Exception {
        StrongholdEnemyCatalog.registerForTest("enemy_1006_shield_2", "重装防御组长");
        BattleCaptureState.resetMatch();

        // 1. Live help_kill (367) + settle help_finish (313) for SAME instanceId -> MUST produce exactly 1 assist log!
        StrongholdWireDecoder.Event phaseR4 = new StrongholdWireDecoder.Event("phase");
        phaseR4.messageId = 300;
        phaseR4.stageSeed = 88801;
        phaseR4.round = 4;
        phaseR4.phase = "assist";
        phaseR4.players.put(1, "Doctor");
        phaseR4.players.put(2, "Amiya");
        BattleCaptureState.accept(phaseR4);

        StrongholdWireDecoder.Event liveKill = new StrongholdWireDecoder.Event("help_kill");
        liveKill.helpKills.add(new StrongholdWireDecoder.HelpKill(701, false, 2, 1, "enemy_1006_shield_2"));
        BattleCaptureState.accept(liveKill);

        StrongholdWireDecoder.Event settle = new StrongholdWireDecoder.Event("help_finish");
        settle.round = 4;
        settle.helpKills.add(new StrongholdWireDecoder.HelpKill(701, false, 2, 1, "enemy_1006_shield_2")); // duplicate of liveKill
        settle.escapedEnemies.add(new StrongholdWireDecoder.EscapedEnemy(1, 702, false, "enemy_1006_shield_2", false));
        BattleCaptureState.accept(settle);

        // Shop tier progression: 3本 repeated twice -> only 1 tier log, then 4本 -> 2nd tier log
        StrongholdWireDecoder.Event prep3a = new StrongholdWireDecoder.Event("preparation");
        prep3a.round = 4;
        prep3a.shopLevelBySeat.put(2, 3);
        BattleCaptureState.accept(prep3a);
        BattleCaptureState.accept(prep3a); // duplicate 3本
        StrongholdWireDecoder.Event prep4 = new StrongholdWireDecoder.Event("preparation");
        prep4.round = 5;
        prep4.shopLevelBySeat.put(2, 4);
        BattleCaptureState.accept(prep4);

        List<BattleCaptureState.EventLogEntry> logs = BattleCaptureState.getRecentLogs(50);
        int assistLogs = 0, escapeLogs = 0, tierLogs = 0;
        for (BattleCaptureState.EventLogEntry e : logs) {
            if ("assist".equals(e.kind)) assistLogs++;
            if ("escape".equals(e.kind)) escapeLogs++;
            if ("tier".equals(e.kind)) tierLogs++;
        }
        check(assistLogs == 1, "live 367 + settle 313 deduplicated to exactly 1 assist log, got " + assistLogs);
        check(escapeLogs == 1, "exactly 1 escape log recorded, got " + escapeLogs);
        check(tierLogs == 2, "shop tier 3->3->4 logged exactly 2 tier-up events, got " + tierLogs);

        // 2. Burst 320 unique assist kills -> bounded cleanly to <= 240 ring cap with strictly descending recent seq
        for (int i = 0; i < 320; i++) {
            StrongholdWireDecoder.Event burst = new StrongholdWireDecoder.Event("help_kill");
            burst.helpKills.add(new StrongholdWireDecoder.HelpKill(5000 + i, false, 2, 1, "enemy_1006_shield_2"));
            BattleCaptureState.accept(burst);
        }
        List<BattleCaptureState.EventLogEntry> capped = BattleCaptureState.getRecentLogs(400);
        check(capped.size() == 240, "ring buffer bounded at 240 entries, got " + capped.size());
        check(capped.get(0).seq > capped.get(capped.size() - 1).seq, "recent logs ordered newest-first");

        // 3. High-frequency Boss runtime flood: 1000 mixed identical + escalating runtime events in pure JVM
        BattleCaptureState.resetMatch();
        StrongholdWireDecoder.Event bossInit = new StrongholdWireDecoder.Event("phase");
        bossInit.messageId = 302;
        bossInit.stageSeed = 99901;
        bossInit.round = 14;
        bossInit.phase = "boss";
        bossInit.bossHp = 500000;
        BattleCaptureState.accept(bossInit);
        for (int i = 0; i < 1000; i++) {
            StrongholdWireDecoder.Event rt = new StrongholdWireDecoder.Event("runtime");
            int dmg = (i / 10) * 1500; // 10x identical packets per increment
            rt.bossDamageBySeat.put(1, dmg);
            rt.hpBySeat.put(1, 25);
            BattleCaptureState.accept(rt);
        }
        BattleCaptureState.BossSnapshot finalBoss = BattleCaptureState.buildBossSnapshot();
        check(finalBoss.teamDamage == 99 * 1500, "high-frequency runtime flood keeps exact final boss damage: " + finalBoss.teamDamage);
    }

    public static void main(String[] args) throws Exception {
        testPacketCodecFuzzing();
        testWireDecoderSelfHealingAndTruncatedFrames();
        testBattleCaptureStateExtremeValuesAndRollover();
        testEventLogDeduplicationAndRingBound();
        System.out.println("StabilityAndResilience: " + checks + " checks passed");
    }
}
