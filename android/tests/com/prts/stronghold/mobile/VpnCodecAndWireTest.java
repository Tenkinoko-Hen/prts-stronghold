package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** 端到端校验 IPv4/TCP/UDP 报文编解码、卫戍二进制帧解码（300/302/303/311/313/367）及聚合状态。 */
public final class VpnCodecAndWireTest {
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

    private static byte[] buildMinimalSceneBody(int state, int round, int selfHp, String previewEnemy, int previewCnt, int previewRound, String escapedEnemy, int bossHp) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(baos);
        // scene header: b B B q
        out.writeByte(0);
        out.writeByte(state);
        out.writeByte(round);
        out.writeLong(123456L);
        // runtime (1 seat)
        out.writeShort(1);
        out.writeByte(1); // uid
        out.writeByte(0); out.writeByte(1); out.writeByte(0);
        out.writeShort(selfHp);
        out.writeByte(0); out.writeByte(0); out.writeByte(0); out.writeByte(0);
        out.writeInt(bossHp > 0 ? 42000 : 0);
        // spawn_preview
        if (previewEnemy != null) {
            out.writeShort(1);
            out.writeByte(1);
            writeStr(out, previewEnemy);
            out.writeByte(0);
            out.writeByte(previewCnt);
            out.writeByte(previewRound);
        } else {
            out.writeShort(0);
        }
        // sp_preparations, preparations, boss_rounds, spawn_groups
        out.writeShort(0);
        out.writeShort(0);
        out.writeShort(0);
        out.writeShort(0);
        // escaped_enemies
        if (escapedEnemy != null) {
            out.writeShort(1); // 1 block
            out.writeShort(2); // 2 escaped enemies
            for (int i = 0; i < 2; i++) {
                out.writeByte(1);
                writeStr(out, escapedEnemy);
                out.writeInt(100 + i);
                out.writeByte(0);
                out.writeByte(0);
            }
            out.writeShort(0); // deployment list
        } else {
            out.writeShort(0);
        }
        // boss_hp block
        if (bossHp > 0) {
            out.writeShort(1);
            out.writeByte(0);
            out.writeInt(bossHp);
            out.writeShort(0);
            out.writeShort(0); // boss_spawns
            out.writeShort(0); // deployments
        } else {
            out.writeShort(0);
        }
        // last_hp_cost, boss_records, global_effects
        out.writeShort(0);
        out.writeShort(0);
        out.writeShort(0);
        return baos.toByteArray();
    }

    private static byte[] buildFrame300(int seed, String[] bannedBonds, int state, int round, String previewEnemy, int previewCnt, int previewRound) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(baos);
        writeStr(out, "mode_multi_hard");
        writeStr(out, "stage_01");
        writeStr(out, "boss_1");
        writeStr(out, "boss_2");
        out.writeInt(seed);
        out.writeByte(1); // self_uid
        out.writeShort(bannedBonds.length);
        for (String b : bannedBonds) writeStr(out, b);
        // 1 player in roster
        out.writeShort(1);
        writeStr(out, "acc_1");
        out.writeByte(1); // uid
        out.writeShort(0); // squad slots
        writeStr(out, "");
        writeStr(out, "Doctor");
        for (int i = 0; i < 5; i++) writeStr(out, "");
        out.write(new byte[5]);
        writeStr(out, "");
        out.writeByte(0);
        writeStr(out, "");
        out.writeShort(0); // banned_units
        // scene body + enemy_types
        out.write(buildMinimalSceneBody(state, round, 25, previewEnemy, previewCnt, previewRound, null, 0));
        out.writeShort(0);
        return wrapFrame(300, baos.toByteArray());
    }

    public static void main(String[] args) throws Exception {
        // 1. PacketCodec IPv4 + TCP (含 MSS 选项) 与 UDP 往返校验
        int clientIp = (10 << 24) | (215 << 16) | (173 << 8) | 1;
        int serverIp = (47 << 24) | (100 << 16) | (1 << 8) | 2;
        byte[] synAck = PacketCodec.buildTcpPacket(serverIp, 8443, clientIp, 51234, 1000, 2001,
            PacketCodec.TCP_SYN | PacketCodec.TCP_ACK, 65535, null, 0, 0);
        PacketCodec.ParsedPacket parsed = new PacketCodec.ParsedPacket();
        check(PacketCodec.parse(synAck, synAck.length, parsed), "parse TCP SYN+ACK");
        check(parsed.protocol == PacketCodec.PROTO_TCP && parsed.srcPort == 8443 && parsed.dstPort == 51234, "TCP ports match");
        check(parsed.tcpSeq == 1000 && parsed.tcpAck == 2001 && (parsed.tcpFlags & PacketCodec.TCP_SYN) != 0, "TCP seq/ack/flags");
        check(PacketCodec.checksum(synAck, 0, 20) == 0, "IPv4 header checksum verifies to 0");
        check(PacketCodec.transportChecksum(serverIp, clientIp, PacketCodec.PROTO_TCP, synAck, 20, synAck.length - 20) == 0, "TCP checksum verifies to 0");

        byte[] payload = "hello-stronghold".getBytes(StandardCharsets.UTF_8);
        byte[] udp = PacketCodec.buildUdpPacket(serverIp, 53, clientIp, 54321, payload, 0, payload.length);
        check(PacketCodec.parse(udp, udp.length, parsed), "parse UDP");
        check(parsed.protocol == PacketCodec.PROTO_UDP && parsed.payloadLength == payload.length, "UDP payload len");
        check(PacketCodec.transportChecksum(serverIp, clientIp, PacketCodec.PROTO_UDP, udp, 20, udp.length - 20) == 0, "UDP checksum verifies to 0");

        // 2. CovenantDetector 容错检查
        check("乌萨斯".equals(CovenantDetector.matchToken("乌萨期")), "covenant fuzzy 乌萨斯");
        check(CovenantDetector.matchToken("谢拉古") == null, "reject ambiguous 谢拉古");
        check("灵巧".equals(CovenantDetector.matchToken("灵功")), "covenant near-two 灵巧");

        // 3. StrongholdWireDecoder + BattleCaptureState 端到端解码（自动 Ban + 出怪预告 + 漏怪/协防兜底）
        StrongholdEnemyCatalog.registerForTest("enemy_1006_shield_2", "重装防御组长");
        StrongholdEnemyCatalog.registerForTest("enemy_1005_yokai_2", "妖怪MKII");
        BattleCaptureState.resetMatch();
        StrongholdWireDecoder decoder = new StrongholdWireDecoder();

        byte[] f300 = buildFrame300(98765, new String[] { "ursusShip", "yanShip", "preciShip" }, 3, 4, "enemy_1006_shield_2", 3, 5);
        // 拆成两片模拟 TCP 粘包/半包分片
        int split = f300.length / 2;
        List<StrongholdWireDecoder.Event> ev1 = decoder.feed(StrongholdWireDecoder.DIR_DOWN, f300, 0, split);
        check(ev1.isEmpty(), "half frame waits cleanly");
        List<StrongholdWireDecoder.Event> ev2 = decoder.feed(StrongholdWireDecoder.DIR_DOWN, f300, split, f300.length - split);
        check(ev2.size() == 1 && "phase".equals(ev2.get(0).kind), "full 300 decoded across chunks");
        BattleCaptureState.accept(ev2.get(0));
        check(BattleCaptureState.isBansConfirmed(), "bansConfirmed true after frame 300");
        check(BattleCaptureState.getBannedCovenantsSnapshot().size() == 3
            && BattleCaptureState.getBannedCovenantsSnapshot().contains("乌萨斯")
            && BattleCaptureState.getBannedCovenantsSnapshot().contains("炎")
            && BattleCaptureState.getBannedCovenantsSnapshot().contains("精准"), "auto-mapped 3 banned covenants");
        check(BattleCaptureState.getCurrentRound() == 4, "round synced to R4");
        check(BattleCaptureState.pickForecastRound() == 5, "picks R5 forecast");
        check(BattleCaptureState.formatSpawnSummary(5, 4).contains("重装防御组长×3"), "enemy name resolved: " + BattleCaptureState.formatSpawnSummary(5, 4));

        // 上行 303 出怪预告（R5 追加 妖怪MKII×4）
        ByteArrayOutputStream b303 = new ByteArrayOutputStream();
        DataOutputStream d303 = new DataOutputStream(b303);
        d303.writeShort(2);
        d303.writeByte(1); writeStr(d303, "enemy_1006_shield_2"); d303.writeByte(0); d303.writeByte(3); d303.writeByte(5);
        d303.writeByte(1); writeStr(d303, "enemy_1005_yokai_2"); d303.writeByte(1); d303.writeByte(4); d303.writeByte(5);
        byte[] f303 = wrapFrame(303, b303.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_UP, f303, 0, f303.length)) {
            BattleCaptureState.accept(e);
        }
        String r5Summary = BattleCaptureState.formatSpawnSummary(5, 4);
        check(r5Summary.contains("重装防御组长×3") && r5Summary.contains("妖怪MKII×4"), "combined R5 forecast: " + r5Summary);

        // 下行 302 进入战斗漏怪 + 上行 311 己方结算漏 1 + 上行 313 协防兜底救 1 剩 1 未兜
        byte[] f302 = wrapFrame(302, buildMinimalSceneBody(5, 4, 21, null, 0, 0, "enemy_1006_shield_2", 0));
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_DOWN, f302, 0, f302.length)) {
            BattleCaptureState.accept(e);
        }
        ByteArrayOutputStream b311 = new ByteArrayOutputStream();
        DataOutputStream d311 = new DataOutputStream(b311);
        d311.writeByte(4); d311.writeByte(0);
        d311.writeShort(1); d311.writeInt(100); // 1 escaped
        d311.writeShort(0); // 0 tokens
        d311.writeShort(0); d311.writeShort(0);
        byte[] f311 = wrapFrame(311, b311.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_UP, f311, 0, f311.length)) {
            BattleCaptureState.accept(e);
        }

        ByteArrayOutputStream b313 = new ByteArrayOutputStream();
        DataOutputStream d313 = new DataOutputStream(b313);
        d313.writeByte(4); d313.writeByte(0);
        d313.writeShort(1); // 1 uncovered escaped
        d313.writeByte(1); writeStr(d313, "enemy_1006_shield_2"); d313.writeInt(101); d313.writeByte(0); d313.writeByte(0);
        d313.writeShort(1); // 1 assist kill
        d313.writeByte(2); // killer seat 2
        d313.writeByte(1); writeStr(d313, "enemy_1006_shield_2"); d313.writeInt(100); d313.writeByte(0); d313.writeByte(0);
        d313.write(new byte[5]);
        byte[] f313 = wrapFrame(313, b313.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_UP, f313, 0, f313.length)) {
            BattleCaptureState.accept(e);
        }
        String leakText = BattleCaptureState.formatLeakSummary();
        check(leakText.contains("己漏 1") && leakText.contains("兜底 1/2") && leakText.contains("未兜 1") && leakText.contains("重装防御组长×1"),
            "leak & assist summary exact: " + leakText);

        System.out.println("VpnCodecAndWire: " + checks + " checks passed");
    }
}
