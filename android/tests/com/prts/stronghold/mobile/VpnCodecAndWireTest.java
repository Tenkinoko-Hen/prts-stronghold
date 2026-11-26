package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** 端到端校验 IPv4/TCP/UDP 报文编解码、卫戍二进制帧解码（300/302/303/311/313/367）及 v3.1 聚合状态（图标/4人漏兜/Boss MMO DPS）。 */
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

    private static byte[] buildMinimalSceneBody(int state, int round, int selfHp, String previewEnemy, int previewCnt, int previewRound, String escapedEnemy, int bossHp, int[] seatBossDmg) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(baos);
        // scene header: b B B q
        out.writeByte(0);
        out.writeByte(state);
        out.writeByte(round);
        out.writeLong(123456L);
        // runtime (4 seats if boss dmg supplied, else 2 seats)
        int seatCount = seatBossDmg != null ? seatBossDmg.length : 2;
        out.writeShort(seatCount);
        for (int s = 1; s <= seatCount; s++) {
            out.writeByte(s); // uid
            out.writeByte(0); out.writeByte(1); out.writeByte(0);
            out.writeShort(s == 1 ? selfHp : 24);
            out.writeByte(0); out.writeByte(0); out.writeByte(0); out.writeByte(0);
            out.writeInt(seatBossDmg != null ? seatBossDmg[s - 1] : 0);
        }
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
            out.writeShort(2); // 2 escaped enemies owned by seat 1
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
        // 4 players in roster
        String[] names = { "Doctor", "Amiya", "Kaltsit", "W" };
        out.writeShort(4);
        for (int s = 1; s <= 4; s++) {
            writeStr(out, "acc_" + s);
            out.writeByte(s); // uid
            out.writeShort(0); // squad slots
            writeStr(out, "");
            writeStr(out, names[s - 1]);
            for (int i = 0; i < 5; i++) writeStr(out, "");
            out.write(new byte[5]);
            writeStr(out, "");
            out.writeByte(0);
            writeStr(out, "");
            out.writeShort(0); // banned_units
        }
        // scene body + enemy_types
        out.write(buildMinimalSceneBody(state, round, 25, previewEnemy, previewCnt, previewRound, null, 0, null));
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

        // 2. CovenantDetector & Boss Portrait ID 映射检查
        check("乌萨斯".equals(CovenantDetector.matchToken("乌萨期")), "covenant fuzzy 乌萨斯");
        check(CovenantDetector.matchToken("谢拉古") == null, "reject ambiguous 谢拉古");
        check("灵巧".equals(CovenantDetector.matchToken("灵功")), "covenant near-two 灵巧");
        check("enemy_9013_acstmk".equals(EnemyPortraitAtlas.resolveBossEnemyId("boss_1")), "boss_1 portrait id");
        check("enemy_2124_dyjsfg".equals(EnemyPortraitAtlas.resolveBossEnemyId("boss_17")), "boss_17 portrait id");

        // 3. StrongholdWireDecoder + BattleCaptureState v3.1 端到端解码
        StrongholdEnemyCatalog.registerForTest("enemy_1006_shield_2", "重装防御组长");
        StrongholdEnemyCatalog.registerForTest("enemy_1005_yokai_2", "妖怪MKII");
        StrongholdEnemyCatalog.registerForTest("enemy_9013_acstmk", "蒸汽骑士");
        BattleCaptureState.resetMatch();
        StrongholdWireDecoder decoder = new StrongholdWireDecoder();

        byte[] f300 = buildFrame300(98765, new String[] { "ursusShip", "yanShip", "preciShip" }, 3, 4, "enemy_1006_shield_2", 3, 5);
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
        List<BattleCaptureState.EnemyCount> r5Spawns = BattleCaptureState.getSpawnList(5);
        check(r5Spawns.size() == 2 && "enemy_1005_yokai_2".equals(r5Spawns.get(0).enemyId) && r5Spawns.get(0).count == 4,
            "R5 spawn icons sorted by count");

        // R4 战斗漏怪（1P 漏 2，2P 帮兜 1，剩 1 逃跑）
        byte[] f302 = wrapFrame(302, buildMinimalSceneBody(5, 4, 21, null, 0, 0, "enemy_1006_shield_2", 0, null));
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_DOWN, f302, 0, f302.length)) {
            BattleCaptureState.accept(e);
        }
        ByteArrayOutputStream b311 = new ByteArrayOutputStream();
        DataOutputStream d311 = new DataOutputStream(b311);
        d311.writeByte(4); d311.writeByte(0);
        d311.writeShort(2); d311.writeInt(100); d311.writeInt(101);
        d311.writeShort(0);
        d311.writeShort(0); d311.writeShort(0);
        byte[] f311 = wrapFrame(311, b311.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_UP, f311, 0, f311.length)) {
            BattleCaptureState.accept(e);
        }

        ByteArrayOutputStream b313 = new ByteArrayOutputStream();
        DataOutputStream d313 = new DataOutputStream(b313);
        d313.writeByte(4); d313.writeByte(0);
        d313.writeShort(1); // 1 uncovered escaped owned by seat 1
        d313.writeByte(1); writeStr(d313, "enemy_1006_shield_2"); d313.writeInt(101); d313.writeByte(0); d313.writeByte(0);
        d313.writeShort(1); // 1 assist kill by seat 2 for seat 1
        d313.writeByte(2);
        d313.writeByte(1); writeStr(d313, "enemy_1006_shield_2"); d313.writeInt(100); d313.writeByte(0); d313.writeByte(0);
        d313.write(new byte[5]);
        byte[] f313 = wrapFrame(313, b313.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_UP, f313, 0, f313.length)) {
            BattleCaptureState.accept(e);
        }

        // 校验单回合 R4 漏兜快照（含 4 席位细项 + 敌怪 ID 图标）
        BattleCaptureState.LeakSnapshot r4Leak = BattleCaptureState.buildLeakSnapshot(4);
        check(r4Leak.round == 4 && r4Leak.totalLeaks == 2 && r4Leak.totalAssisted == 1 && r4Leak.totalEscaped == 1,
            "R4 leak totals exact");
        check(r4Leak.seats.size() == 4, "4 seats in leak snapshot");
        check("Doctor".equals(r4Leak.seats.get(0).name) && r4Leak.seats.get(0).isSelf && r4Leak.seats.get(0).leaked == 2
            && r4Leak.seats.get(0).covered == 1 && r4Leak.seats.get(0).escaped == 1, "1P leak/covered/escaped exact");
        check("Amiya".equals(r4Leak.seats.get(1).name) && r4Leak.seats.get(1).assisted == 1 && r4Leak.seats.get(1).leaked == 0,
            "2P assist kill exact");
        check(!r4Leak.enemies.isEmpty() && "enemy_1006_shield_2".equals(r4Leak.enemies.get(0).enemyId),
            "R4 leaked enemy ID preserved for icon");

        // R5 再发生 3P 漏 1 且被 1P 全兜，校验累计（round=0）与单回合（round=4 / round=5）隔离
        ByteArrayOutputStream b313r5 = new ByteArrayOutputStream();
        DataOutputStream d313r5 = new DataOutputStream(b313r5);
        d313r5.writeByte(5); d313r5.writeByte(0);
        d313r5.writeShort(0); // 0 escaped
        d313r5.writeShort(1); // 1 assist kill by seat 1 for seat 3
        d313r5.writeByte(1);
        d313r5.writeByte(3); writeStr(d313r5, "enemy_1005_yokai_2"); d313r5.writeInt(201); d313r5.writeByte(0); d313r5.writeByte(0);
        d313r5.write(new byte[5]);
        byte[] f313r5 = wrapFrame(313, b313r5.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_UP, f313r5, 0, f313r5.length)) {
            BattleCaptureState.accept(e);
        }
        BattleCaptureState.LeakSnapshot r5Leak = BattleCaptureState.buildLeakSnapshot(5);
        BattleCaptureState.LeakSnapshot cumLeak = BattleCaptureState.buildLeakSnapshot(0);
        check(r5Leak.totalLeaks == 1 && r5Leak.totalEscaped == 0 && r5Leak.seats.get(0).assisted == 1 && r5Leak.seats.get(2).covered == 1,
            "R5 single-round leak exact");
        check(cumLeak.totalLeaks == 3 && cumLeak.totalAssisted == 2 && cumLeak.totalEscaped == 1
            && cumLeak.seats.get(0).assisted == 1 && cumLeak.seats.get(1).assisted == 1,
            "cumulative leak snapshot aggregates R4+R5");

        // 4. R14 Boss 阶段 MMO 排行与 DPS 校验
        byte[] f302boss = wrapFrame(302, buildMinimalSceneBody(7, 14, 21, null, 0, 0, null, 180000, new int[] { 85000, 127000, 62000, 28000 }));
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_DOWN, f302boss, 0, f302boss.length)) {
            BattleCaptureState.accept(e);
        }
        BattleCaptureState.BossSnapshot bossSnap = BattleCaptureState.buildBossSnapshot();
        check("enemy_9013_acstmk".equals(bossSnap.bossEnemyId) && "蒸汽骑士".equals(bossSnap.bossName), "boss identity resolved");
        check(bossSnap.teamDamage == 302000 && bossSnap.teamDps > 0 && bossSnap.hpPct > 0 && bossSnap.hpPct < 100,
            "boss team dmg/dps/hpPct valid: dmg=" + bossSnap.teamDamage + " hpPct=" + bossSnap.hpPct);
        check(bossSnap.players.size() == 4 && bossSnap.players.get(0).seat == 2 && bossSnap.players.get(0).rank == 1
            && bossSnap.players.get(1).seat == 1 && bossSnap.players.get(1).isSelf && bossSnap.players.get(1).rank == 2
            && bossSnap.players.get(3).seat == 4 && bossSnap.players.get(3).rank == 4,
            "boss MMO ranking sorted #1->#4");
        double shareSum = 0;
        for (BattleCaptureState.BossPlayerRow row : bossSnap.players) shareSum += row.sharePct;
        check(Math.abs(shareSum - 100.0) < 0.2, "boss sharePct sums to 100%: " + shareSum);

        // 5. 校验 306/354 备战商店本数解析 -> SeatLeakRow.shopLevel & buildAllWaves()
        ByteArrayOutputStream b306 = new ByteArrayOutputStream();
        DataOutputStream d306 = new DataOutputStream(b306);
        d306.writeByte(2); // seat 2
        d306.writeShort(27); // hp 27
        d306.writeByte(4); // round 4
        d306.writeByte(4); // shop level 4本
        d306.write(new byte[6]); // remaining 6 bytes
        d306.writeShort(0); // goods
        d306.writeByte(1); // seq
        d306.writeShort(0); d306.writeShort(0); d306.writeShort(0); d306.writeShort(0); d306.writeShort(0); // pieces..bonds
        d306.writeShort(0); d306.writeByte(0); // sp_prepare + 1
        d306.writeShort(0); // enemies
        d306.writeShort(0); d306.writeByte(0); d306.writeShort(0); // after enemies
        d306.writeShort(0); // special_effects
        writeStr(d306, ""); // skill_id
        d306.write(new byte[13]);
        byte[] f306 = wrapFrame(306, b306.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_DOWN, f306, 0, f306.length)) {
            BattleCaptureState.accept(e);
        }
        BattleCaptureState.LeakSnapshot withTier = BattleCaptureState.buildLeakSnapshot(0);
        check(withTier.seats.get(1).shopLevel == 4, "seat 2 shopLevel decoded to 4本: " + withTier.seats.get(1).shopLevel);

        List<BattleCaptureState.RoundWave> allWaves = BattleCaptureState.buildAllWaves();
        check(allWaves.size() == 1 && allWaves.get(0).round == 5 && allWaves.get(0).enemies.size() == 2,
            "buildAllWaves returns sorted waves with icons");

        // 5b. 校验 4 人已激活盟约人数（含干员羁绊 + 转职装备）与未来两波怪潮预计（nextTwoWaves）
        StrongholdEnemyCatalog.registerCatalogForTest(101, "chess_char_3_01_a", "char_4047_pianst");
        StrongholdEnemyCatalog.registerCatalogForTest(102, "chess_char_5_01_a", "char_1035_wisdel");
        StrongholdEnemyCatalog.registerEquipBondForTest(310, "yanShip"); // 炎国短刀 +1 炎
        BattleCaptureState.resetMatch();

        // Frame 300 with seat 2 squad having 2 units with yanShip + preciShip
        ByteArrayOutputStream b300Bonds = new ByteArrayOutputStream();
        DataOutputStream d300Bonds = new DataOutputStream(b300Bonds);
        writeStr(d300Bonds, "mode_multi_hard");
        writeStr(d300Bonds, "stage_01");
        writeStr(d300Bonds, "boss_1");
        writeStr(d300Bonds, "");
        d300Bonds.writeInt(246810);
        d300Bonds.writeByte(1);
        d300Bonds.writeShort(0); // bans
        d300Bonds.writeShort(2); // 2 players
        for (int s = 1; s <= 2; s++) {
            writeStr(d300Bonds, "acc_" + s);
            d300Bonds.writeByte(s);
            if (s == 2) {
                d300Bonds.writeShort(2); // 2 squad slots
                writeStr(d300Bonds, "chess_char_3_01_a"); writeStr(d300Bonds, "char_4047_pianst");
                for (int k = 0; k < 4; k++) writeStr(d300Bonds, "");
                d300Bonds.write(new byte[3]);
                d300Bonds.writeShort(2); writeStr(d300Bonds, "yanShip"); writeStr(d300Bonds, "preciShip");
                d300Bonds.writeByte(0);
                writeStr(d300Bonds, "chess_char_5_01_a"); writeStr(d300Bonds, "char_1035_wisdel");
                for (int k = 0; k < 4; k++) writeStr(d300Bonds, "");
                d300Bonds.write(new byte[3]);
                d300Bonds.writeShort(1); writeStr(d300Bonds, "preciShip");
                d300Bonds.writeByte(0);
            } else {
                d300Bonds.writeShort(0);
            }
            writeStr(d300Bonds, "");
            writeStr(d300Bonds, "P" + s);
            for (int i = 0; i < 5; i++) writeStr(d300Bonds, "");
            d300Bonds.write(new byte[5]);
            writeStr(d300Bonds, "");
            d300Bonds.writeByte(0);
            writeStr(d300Bonds, "");
            d300Bonds.writeShort(0);
        }
        d300Bonds.write(buildMinimalSceneBody(3, 4, 25, "enemy_1006_shield_2", 3, 5, null, 0, null));
        d300Bonds.writeShort(0);
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_DOWN, wrapFrame(300, b300Bonds.toByteArray()), 0, wrapFrame(300, b300Bonds.toByteArray()).length)) {
            BattleCaptureState.accept(e);
        }
        // Frame 303 adds R5 + R6 + R7 waves -> nextTwoWaves should return [R5, R6]
        ByteArrayOutputStream b303Multi = new ByteArrayOutputStream();
        DataOutputStream d303Multi = new DataOutputStream(b303Multi);
        d303Multi.writeShort(3);
        d303Multi.writeByte(1); writeStr(d303Multi, "enemy_1006_shield_2"); d303Multi.writeByte(0); d303Multi.writeByte(3); d303Multi.writeByte(5);
        d303Multi.writeByte(1); writeStr(d303Multi, "enemy_1005_yokai_2"); d303Multi.writeByte(0); d303Multi.writeByte(4); d303Multi.writeByte(6);
        d303Multi.writeByte(1); writeStr(d303Multi, "enemy_1006_shield_2"); d303Multi.writeByte(0); d303Multi.writeByte(5); d303Multi.writeByte(7);
        byte[] f303Multi = wrapFrame(303, b303Multi.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_UP, f303Multi, 0, f303Multi.length)) {
            BattleCaptureState.accept(e);
        }
        List<BattleCaptureState.RoundWave> next2 = BattleCaptureState.buildNextTwoWaves();
        check(next2.size() == 2 && next2.get(0).round == 5 && next2.get(1).round == 6,
            "nextTwoWaves returns R5 and R6 when at R4");

        // Frame 306 for seat 2 with 2 deployed pieces (101, 102) + 1 yanShip equip (310) -> 炎2(active) & 精准2(active)
        ByteArrayOutputStream b306Bonds = new ByteArrayOutputStream();
        DataOutputStream d306Bonds = new DataOutputStream(b306Bonds);
        d306Bonds.writeByte(2); // seat 2
        d306Bonds.writeShort(28);
        d306Bonds.writeByte(4);
        d306Bonds.writeByte(4); // 4本
        d306Bonds.write(new byte[6]);
        d306Bonds.writeShort(0); // goods
        d306Bonds.writeByte(1); // seq
        d306Bonds.writeShort(2); // 2 pieces
        d306Bonds.writeInt(9001); d306Bonds.writeShort(0); d306Bonds.writeShort(101); d306Bonds.write(new byte[3]);
        d306Bonds.writeInt(9002); d306Bonds.writeShort(0); d306Bonds.writeShort(102); d306Bonds.write(new byte[3]);
        d306Bonds.writeShort(1); // 1 equip (310 -> yanShip)
        d306Bonds.writeInt(8001); d306Bonds.writeShort(310);
        d306Bonds.writeShort(0); // traps
        d306Bonds.writeShort(2); // 2 deployed positions
        d306Bonds.writeInt(9001); d306Bonds.write(new byte[6]);
        d306Bonds.writeInt(9002); d306Bonds.write(new byte[6]);
        d306Bonds.writeShort(0); // bonds
        d306Bonds.writeShort(0); d306Bonds.writeByte(0); // sp_prepare + 1
        d306Bonds.writeShort(0); // enemies
        d306Bonds.writeShort(0); d306Bonds.writeByte(0); d306Bonds.writeShort(0);
        d306Bonds.writeShort(0); // special_effects
        writeStr(d306Bonds, "");
        d306Bonds.write(new byte[13]);
        byte[] f306Bonds = wrapFrame(306, b306Bonds.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_DOWN, f306Bonds, 0, f306Bonds.length)) {
            BattleCaptureState.accept(e);
        }
        List<BattleCaptureState.BondStatus> seat2Bonds = BattleCaptureState.getSeatBonds(2);
        check(seat2Bonds.size() == 2, "seat 2 decoded 2 active covenants (炎2 + 精准2), got " + seat2Bonds.size());
        boolean foundYan2 = false, foundPreci2 = false;
        for (BattleCaptureState.BondStatus bs : seat2Bonds) {
            if ("炎".equals(bs.name) && bs.count == 2 && bs.active) foundYan2 = true;
            if ("精准".equals(bs.name) && bs.count == 2 && bs.active) foundPreci2 = true;
        }
        check(foundYan2 && foundPreci2, "seat 2 active covenants exact including transfer equip (+1 炎)");

        // Cross-seat squadBondsBySeat fallback: seat 3 has no seat-3 frame-300 squad, yet deployed 101+102 fall back to seat 1/other captured squad map
        ByteArrayOutputStream b306Seat3 = new ByteArrayOutputStream();
        DataOutputStream d306Seat3 = new DataOutputStream(b306Seat3);
        d306Seat3.writeByte(3); // seat 3
        d306Seat3.writeShort(30);
        d306Seat3.writeByte(4);
        d306Seat3.writeByte(4);
        d306Seat3.write(new byte[6]);
        d306Seat3.writeShort(0);
        d306Seat3.writeByte(2);
        d306Seat3.writeShort(2);
        d306Seat3.writeInt(9101); d306Seat3.writeShort(0); d306Seat3.writeShort(101); d306Seat3.write(new byte[3]);
        d306Seat3.writeInt(9102); d306Seat3.writeShort(0); d306Seat3.writeShort(102); d306Seat3.write(new byte[3]);
        d306Seat3.writeShort(0); // equips
        d306Seat3.writeShort(0); // traps
        d306Seat3.writeShort(2); // deployed positions
        d306Seat3.writeInt(9101); d306Seat3.write(new byte[6]);
        d306Seat3.writeInt(9102); d306Seat3.write(new byte[6]);
        d306Seat3.writeShort(0);
        d306Seat3.writeShort(0); d306Seat3.writeByte(0);
        d306Seat3.writeShort(0);
        d306Seat3.writeShort(0); d306Seat3.writeByte(0); d306Seat3.writeShort(0);
        d306Seat3.writeShort(0);
        writeStr(d306Seat3, "");
        d306Seat3.write(new byte[13]);
        byte[] f306Seat3 = wrapFrame(306, b306Seat3.toByteArray());
        for (StrongholdWireDecoder.Event e : decoder.feed(StrongholdWireDecoder.DIR_DOWN, f306Seat3, 0, f306Seat3.length)) {
            BattleCaptureState.accept(e);
        }
        List<BattleCaptureState.BondStatus> seat3Bonds = BattleCaptureState.getSeatBonds(3);
        boolean seat3Preci2 = false;
        for (BattleCaptureState.BondStatus bs : seat3Bonds) {
            if ("精准".equals(bs.name) && bs.count == 2 && bs.active) seat3Preci2 = true;
        }
        check(seat3Preci2, "seat 3 resolves active 精准2 via cross-seat squad fallback");

        // 6. 校验开局 300 帧即使场景截断也能抢救 banned_bonds（避免 1/3 确认信息界面丢 Ban）
        ByteArrayOutputStream b300Partial = new ByteArrayOutputStream();
        DataOutputStream d300Partial = new DataOutputStream(b300Partial);
        writeStr(d300Partial, "mode_multi_hard");
        writeStr(d300Partial, "stage_01");
        writeStr(d300Partial, "boss_1");
        writeStr(d300Partial, "");
        d300Partial.writeInt(777777);
        d300Partial.writeByte(1);
        d300Partial.writeShort(2);
        writeStr(d300Partial, "sargonShip");
        writeStr(d300Partial, "arcaneShip");
        d300Partial.writeShort(0); // 0 players
        d300Partial.write(new byte[] { 0, 1, 0, 0, 0 }); // truncated scene
        byte[] f300Partial = wrapFrame(300, b300Partial.toByteArray());
        StrongholdWireDecoder d2 = new StrongholdWireDecoder();
        List<StrongholdWireDecoder.Event> pEvs = d2.feed(StrongholdWireDecoder.DIR_DOWN, f300Partial, 0, f300Partial.length);
        check(pEvs.size() == 1 && pEvs.get(0).bannedBonds.size() == 2, "partial opening 300 rescues banned_bonds");

        // 7. 校验 EnemyPortraitAtlas boss_1..boss_17 映射与 _2 / _3 尾缀回退
        java.util.Map<String, Integer> atlasMap = new java.util.HashMap<>();
        atlasMap.put("enemy_9013_acstmk", 10);
        atlasMap.put("enemy_9013_acstmk_2", 11);
        atlasMap.put("enemy_2124_dyjsfg", 12);
        atlasMap.put("enemy_1006_shield", 20);
        atlasMap.put("enemy_1005_yokai", 30);
        atlasMap.put("enemy_1005_yokai_3", 32);
        check(Integer.valueOf(10).equals(EnemyPortraitAtlas.resolvePortraitIndex("boss_1", atlasMap)), "boss_1 maps to enemy_9013_acstmk");
        check(Integer.valueOf(11).equals(EnemyPortraitAtlas.resolvePortraitIndex("boss_8", atlasMap)), "boss_8 maps to enemy_9013_acstmk_2");
        check(Integer.valueOf(12).equals(EnemyPortraitAtlas.resolvePortraitIndex("boss_17", atlasMap)), "boss_17 maps to enemy_2124_dyjsfg");
        check(Integer.valueOf(20).equals(EnemyPortraitAtlas.resolvePortraitIndex("enemy_1006_shield_2", atlasMap)), "_2 suffix falls back to base id");
        check(Integer.valueOf(20).equals(EnemyPortraitAtlas.resolvePortraitIndex("enemy_1006_shield_3", atlasMap)), "_3 suffix falls back to base id");
        check(Integer.valueOf(32).equals(EnemyPortraitAtlas.resolvePortraitIndex("enemy_1005_yokai_3", atlasMap)), "exact _3 match wins over base fallback");
        check(EnemyPortraitAtlas.resolvePortraitIndex("boss_18", atlasMap) == null, "out-of-range boss_18 returns null");

        System.out.println("VpnCodecAndWire: " + checks + " checks passed");
    }
}
