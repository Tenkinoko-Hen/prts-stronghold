package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 卫戍协议 V3_1 明文二进制 TCP 帧解码器（忠实移植自 electron/prts_battle_core/wire.py）。
 * 负责帧对齐、大端字段读取，提取：
 * - 开局 300 帧：26 项受限盟约、玩家席位、模式/Boss、首轮预告
 * - 场景 300/302 帧：回合、阶段、血量、下回合/本回合出怪预告、漏怪清单、Boss 血量与伤害
 * - 备战 306 / 运行态 310 帧：回合、血量、Boss 实时伤害
 * - 上行 303（出怪预告）、311（己方漏怪数）、313（协防兜底击杀与未兜住漏怪）、367（实时协防击杀）
 */
final class StrongholdWireDecoder {
    static final int DIR_UP = 0;
    static final int DIR_DOWN = 1;

    private static final int HEADER_SIZE = 8;
    private static final int MAX_BODY = 262144;
    private static final int MAX_BUFFER = 1048576;

    private static final Map<Integer, Integer> DOWN_MIN = new HashMap<>();
    private static final Map<Integer, Integer> UP_MIN = new HashMap<>();
    private static final Map<Integer, String> PHASES = new HashMap<>();

    static {
        DOWN_MIN.put(300, 52);
        DOWN_MIN.put(302, 33);
        DOWN_MIN.put(306, 4);
        DOWN_MIN.put(310, 2);
        DOWN_MIN.put(344, 2);
        DOWN_MIN.put(348, 10);
        DOWN_MIN.put(354, 11);
        DOWN_MIN.put(366, 7);

        UP_MIN.put(303, 2);
        UP_MIN.put(311, 10);
        UP_MIN.put(313, 6);
        UP_MIN.put(341, 7);
        UP_MIN.put(367, 11);

        PHASES.put(1, "loading");
        PHASES.put(2, "special_prep");
        PHASES.put(3, "prep");
        PHASES.put(4, "self");
        PHASES.put(5, "assist");
        PHASES.put(6, "boss");
        PHASES.put(7, "settle");
        PHASES.put(8, "end");
        PHASES.put(9, "pause");
        PHASES.put(100, "battle_wait");
        PHASES.put(101, "boss_wait");
        PHASES.put(102, "prep");
        PHASES.put(103, "special_prep");
        PHASES.put(104, "boss");
    }

    static final class SpawnPreview {
        final int enemyType;
        final String enemyId;
        final int actionIndex;
        final int count;
        final int roundNumber;
        SpawnPreview(int enemyType, String enemyId, int actionIndex, int count, int roundNumber) {
            this.enemyType = enemyType;
            this.enemyId = enemyId;
            this.actionIndex = actionIndex;
            this.count = count;
            this.roundNumber = roundNumber;
        }
    }

    static final class EscapedEnemy {
        final int owner;
        final int instanceId;
        final boolean isToken;
        final String enemyId;
        final boolean isSpecial;
        EscapedEnemy(int owner, int instanceId, boolean isToken, String enemyId, boolean isSpecial) {
            this.owner = owner;
            this.instanceId = instanceId;
            this.isToken = isToken;
            this.enemyId = enemyId;
            this.isSpecial = isSpecial;
        }
    }

    static final class HelpKill {
        final int instanceId;
        final boolean isToken;
        final int killerUid;
        final int ownerUid;
        final String enemyId;
        HelpKill(int instanceId, boolean isToken, int killerUid, int ownerUid, String enemyId) {
            this.instanceId = instanceId;
            this.isToken = isToken;
            this.killerUid = killerUid;
            this.ownerUid = ownerUid;
            this.enemyId = enemyId;
        }
    }

    private static final String[] BOND_IDENT_TO_ID = {
        "",
        "yanShip", "sargonShip", "victoriaShip", "kjeragShip", "egirShip",
        "siracusaShip", "kazimierzShip", "ursusShip", "iberiaShip", "lethaniaShip",
        "preciShip", "swiftShip", "skillfulShip", "steadShip", "deputShip",
        "visiShip", "miraShip", "investShip", "raidShip", "indomShip",
        "maniShip", "emptyShip", "soloShip", "suntShip", "docShip", "arcaneShip"
    };

    static final class WireBond {
        final String bondId;
        final int stacks;
        final int opCount;
        final boolean active;
        WireBond(String bondId, int stacks, int opCount, boolean active) {
            this.bondId = bondId;
            this.stacks = stacks;
            this.opCount = opCount;
            this.active = active;
        }
    }

    static final class SeatPiece {
        final int chessIdent;
        final List<Integer> attachedEquipIdents;
        SeatPiece(int chessIdent, List<Integer> attachedEquipIdents) {
            this.chessIdent = chessIdent;
            this.attachedEquipIdents = attachedEquipIdents != null && !attachedEquipIdents.isEmpty()
                ? Collections.unmodifiableList(new ArrayList<>(attachedEquipIdents))
                : Collections.<Integer>emptyList();
        }
    }

    static final class Event {
        final String kind; // phase | preparation | runtime | spawn_plan | self_finish | help_finish | help_kill
        int messageId;
        int round;
        String phase = "other";
        int selfUid;
        int seat;
        int hp;
        int bossHp = -1;
        String modeId = "";
        String bossId = "";
        int stageSeed;
        final List<String> bannedBonds = new ArrayList<>();
        final List<String> bannedUnitBonds = new ArrayList<>();
        final Map<Integer, String> players = new HashMap<>();
        final Map<Integer, Integer> hpBySeat = new HashMap<>();
        final Map<Integer, Integer> shopLevelBySeat = new HashMap<>();
        final Map<Integer, Integer> bossDamageBySeat = new HashMap<>();
        final Map<Integer, Map<String, List<String>>> squadBondsBySeat = new HashMap<>();
        final Map<Integer, List<Integer>> deployedChessBySeat = new HashMap<>();
        final Map<Integer, List<Integer>> equipIdentsBySeat = new HashMap<>();
        final Map<Integer, List<SeatPiece>> deployedPiecesBySeat = new HashMap<>();
        final Map<Integer, List<SeatPiece>> benchPiecesBySeat = new HashMap<>();
        final Map<Integer, List<WireBond>> wireBondsBySeat = new HashMap<>();
        final List<SpawnPreview> spawnPreviews = new ArrayList<>();
        final List<EscapedEnemy> escapedEnemies = new ArrayList<>();
        boolean hasEscapedSection = false;
        int selfEscapedCount = -1;
        boolean fromRejoin = false;
        final List<HelpKill> helpKills = new ArrayList<>();
        Event(String kind) { this.kind = kind; }
    }

    private static final class StreamBuf {
        byte[] data = new byte[4096];
        int len = 0;
        boolean aligned = false;

        void append(byte[] src, int off, int count) {
            if (count <= 0) return;
            if (len + count > MAX_BUFFER) {
                // 超过上限直接丢弃旧字节并重新对齐，防非卫戍长连接撑爆内存
                len = 0;
                aligned = false;
                if (count > MAX_BUFFER) return;
            }
            if (len + count > data.length) {
                int cap = Math.max(data.length * 2, len + count);
                data = Arrays.copyOf(data, Math.min(cap, MAX_BUFFER));
            }
            System.arraycopy(src, off, data, len, count);
            len += count;
        }

        void consume(int n) {
            if (n <= 0) return;
            if (n >= len) { len = 0; return; }
            System.arraycopy(data, n, data, 0, len - n);
            len -= n;
        }
    }

    private final StreamBuf[] streams = new StreamBuf[] { new StreamBuf(), new StreamBuf() };

    void reset(int dir) {
        streams[dir] = new StreamBuf();
    }

    List<Event> feed(int dir, byte[] chunk, int off, int length) {
        List<Event> out = new ArrayList<>();
        if (chunk == null || length <= 0) return out;
        StreamBuf s = streams[dir];
        s.append(chunk, off, length);
        Map<Integer, Integer> anchors = (dir == DIR_UP) ? UP_MIN : DOWN_MIN;
        int heartbeat = (dir == DIR_UP) ? 1 : 2;

        int offset = 0;
        while (s.len - offset >= HEADER_SIZE) {
            int bodyLen = readInt(s.data, offset);
            int msgId = readInt(s.data, offset + 4);
            int start = offset + HEADER_SIZE;
            int end = start + bodyLen;

            if (bodyLen < 0 || bodyLen > MAX_BODY || msgId <= 0 || msgId >= 65536) {
                s.aligned = false;
                offset += 1;
                continue;
            }
            if (!s.aligned) {
                boolean isHb = (msgId == heartbeat && bodyLen == 12);
                Integer minLen = anchors.get(msgId);
                if (!isHb && (minLen == null || bodyLen < minLen)) {
                    offset += 1;
                    continue;
                }
                if (dir == DIR_UP && (msgId == 311 || msgId == 313) && start < s.len) {
                    int r = s.data[start] & 0xFF;
                    if (r < 1 || r > 15) { offset += 1; continue; }
                }
                if (dir == DIR_DOWN) {
                    if (msgId == 300 && start + 2 <= s.len && readU16(s.data, start) > bodyLen - 2) {
                        offset += 1; continue;
                    }
                    if (msgId == 302) {
                        if (start + 3 <= s.len) {
                            int st = s.data[start + 1] & 0xFF;
                            int rd = s.data[start + 2] & 0xFF;
                            if (!isValidState(st) || rd > 15) { offset += 1; continue; }
                        }
                        if (start + 13 <= s.len && readU16(s.data, start + 11) > 4) {
                            offset += 1; continue;
                        }
                    }
                }
                if (end > s.len) break;
                if (!isHb) {
                    Event probe = decodeSafe(dir, msgId, s.data, start, bodyLen);
                    if (probe == null) {
                        offset += 1;
                        continue;
                    }
                    s.aligned = true;
                    out.add(probe);
                    offset = end;
                    continue;
                }
                s.aligned = true;
                offset = end;
                continue;
            }

            if (end > s.len) break;
            if (msgId != heartbeat) {
                Event ev = decodeSafe(dir, msgId, s.data, start, bodyLen);
                if (ev != null) out.add(ev);
            }
            offset = end;
        }
        s.consume(offset);
        return out;
    }

    static Event decodeSafe(int dir, int msgId, byte[] buf, int off, int len) {
        try {
            return decodeMessage(dir, msgId, buf, off, len);
        } catch (WireException ex) {
            // 开局 300 帧若已解出 banned_bonds / banned_units 或 roster，允许返回部分事件立刻同步禁选与席位
            if (dir == DIR_DOWN && msgId == 300 && ex.partialEvent != null
                && (!ex.partialEvent.bannedBonds.isEmpty() || !ex.partialEvent.bannedUnitBonds.isEmpty() || !ex.partialEvent.players.isEmpty())) {
                return ex.partialEvent;
            }
            return null;
        }
    }

    static Event decodeMessage(int dir, int msgId, byte[] buf, int off, int len) throws WireException {
        Reader r = new Reader(buf, off, len);
        Event ev = null;
        if (dir == DIR_DOWN) {
            if (msgId == 300) {
                ev = parseFullState(r);
            } else if (msgId == 302) {
                ev = parseScene(r, -1, -1);
                r.finish();
            } else if (msgId == 306) {
                ev = parsePreparationEvent(r);
                r.finish();
            } else if (msgId == 354) {
                if (len <= 7 || buf[off + 4] != 0 || buf[off + 5] != 0 || buf[off + 6] != 1) return null;
                r.skip(7);
                ev = parsePreparationEvent(r);
                r.finish();
            } else if (msgId == 310) {
                ev = new Event("runtime");
                parseRuntime(r, ev);
                r.finish();
            } else {
                return null;
            }
        } else {
            if (msgId == 303) {
                ev = new Event("spawn_plan");
                int cnt = r.count();
                for (int i = 0; i < cnt; i++) ev.spawnPreviews.add(parseSpawnPreview(r));
                r.finish();
            } else if (msgId == 311) {
                ev = new Event("self_finish");
                int round = r.u8();
                if (round < 1 || round > 15) throw new WireException("self_finish round out of range");
                ev.round = round;
                ev.fromRejoin = r.bool();
                int escapedCnt = r.skipIntsAndCount();
                int tokenCnt = r.skipIntsAndCount();
                ev.selfEscapedCount = escapedCnt + tokenCnt;
                // 跳过 list(9) 和 list(7)
                r.skipFixedList(9);
                r.skipFixedList(7);
                r.finish();
            } else if (msgId == 313) {
                ev = parseHelpFinish(r);
                r.finish();
            } else if (msgId == 367) {
                ev = new Event("help_kill");
                int instId = r.i32();
                boolean isToken = r.bool();
                int killer = r.u8();
                r.skip(5);
                ev.helpKills.add(new HelpKill(instId, isToken, killer, 0, ""));
                r.finish();
            } else {
                return null;
            }
        }
        if (ev != null) ev.messageId = msgId;
        return ev;
    }

    private static Event parseFullState(Reader r) throws WireException {
        Event partial = new Event("phase");
        partial.messageId = 300;
        // _roster
        partial.modeId = r.str();
        r.skipStr(); // stage_id
        partial.bossId = r.str();
        r.skipStr(); // hidden_boss_id
        partial.stageSeed = r.i32();
        partial.selfUid = r.u8();
        int banCnt = r.count();
        for (int i = 0; i < banCnt; i++) partial.bannedBonds.add(r.str());

        try {
            int playerCnt = r.count();
            if (playerCnt > 4) throw new WireException("player roster exceeds 4");
            for (int i = 0; i < playerCnt; i++) {
                r.skipStr(); // account
                int uid = r.i8();
                if (uid < 1 || uid > 4 || partial.players.containsKey(uid)) {
                    throw new WireException("invalid player seat");
                }
                int slotCnt = r.count();
                Map<String, List<String>> seatBonds = new HashMap<>();
                for (int j = 0; j < slotCnt; j++) {
                    // _SQUAD_SLOT: chess_id, char_id, 4 strings, 3 bytes, list(str bonds), 1 bool
                    String chessId = r.str();
                    String charId = r.str();
                    for (int k = 0; k < 4; k++) r.skipStr();
                    r.skip(3);
                    int bCnt = r.count();
                    List<String> bList = bCnt > 0 ? new ArrayList<String>(bCnt) : null;
                    for (int b = 0; b < bCnt; b++) {
                        String bid = r.str();
                        if (bList != null && !bid.isEmpty()) bList.add(bid);
                    }
                    r.skip(1);
                    if (bList != null && !bList.isEmpty()) {
                        if (!chessId.isEmpty()) seatBonds.put(chessId, bList);
                        if (!charId.isEmpty()) seatBonds.put(charId, bList);
                    }
                }
                if (!seatBonds.isEmpty()) {
                    partial.squadBondsBySeat.put(uid, seatBonds);
                }
                r.skipStr();
                String nickname = r.str();
                partial.players.put(uid, nickname);
                // ('str','str','str','str','str', 5, 'str', 1, 'str')
                for (int k = 0; k < 5; k++) r.skipStr();
                r.skip(5);
                r.skipStr();
                r.skip(1);
                r.skipStr();
                // banned_units list: 顺带提取 bond_id 兜底
                int buCnt = r.count();
                for (int u = 0; u < buCnt; u++) {
                    String bId = r.str();
                    if (!bId.isEmpty() && !partial.bannedUnitBonds.contains(bId)) {
                        partial.bannedUnitBonds.add(bId);
                    }
                    int idCnt = r.count();
                    r.skip(idCnt * 2);
                }
            }

            int[] header = parseSceneHeader(r);
            Event scene = parseScene(r, header[0], header[1]);
            // trailing enemy_types list(str)
            int etCnt = r.count();
            for (int i = 0; i < etCnt; i++) r.skipStr();
            r.finish();
            scene.modeId = partial.modeId;
            scene.bossId = partial.bossId;
            scene.stageSeed = partial.stageSeed;
            scene.selfUid = partial.selfUid;
            scene.bannedBonds.addAll(partial.bannedBonds);
            scene.bannedUnitBonds.addAll(partial.bannedUnitBonds);
            scene.players.putAll(partial.players);
            scene.squadBondsBySeat.putAll(partial.squadBondsBySeat);
            return scene;
        } catch (WireException ex) {
            ex.partialEvent = partial;
            throw ex;
        }
    }

    private static int[] parseSceneHeader(Reader r) throws WireException {
        r.skip(1); // signed byte
        int state = r.u8();
        int round = r.u8();
        r.skip(8); // int64 timestamp/seq
        if (round > 15) throw new WireException("scene round out of range");
        if (!isValidState(state)) throw new WireException("unknown scene state");
        return new int[] { state, round };
    }

    private static Event parseScene(Reader r, int stateArg, int roundArg) throws WireException {
        int state = stateArg;
        int round = roundArg;
        if (state < 0) {
            int[] hdr = parseSceneHeader(r);
            state = hdr[0];
            round = hdr[1];
        }
        Event ev = new Event("phase");
        ev.round = round;
        ev.phase = PHASES.containsKey(state) ? PHASES.get(state) : "other";

        parseRuntime(r, ev);

        int prevCnt = r.count();
        for (int i = 0; i < prevCnt; i++) ev.spawnPreviews.add(parseSpawnPreview(r));

        // _SP_PREPARATION list
        int spCnt = r.count();
        for (int i = 0; i < spCnt; i++) skipSpPreparation(r);

        // preparations list：提取 4 名玩家当前商店本数（level）与血量
        int prepCnt = r.count();
        for (int i = 0; i < prepCnt; i++) parsePreparationInto(r, ev);

        // boss_rounds list
        int brCnt = r.count();
        for (int i = 0; i < brCnt; i++) skipBossRound(r);

        // spawn_groups
        skipSpawnGroups(r);

        // escaped_enemies blocks
        int escBlockCnt = r.count();
        for (int i = 0; i < escBlockCnt; i++) {
            ev.hasEscapedSection = true;
            ev.escapedEnemies.clear();
            int eeCnt = r.count();
            for (int j = 0; j < eeCnt; j++) ev.escapedEnemies.add(parseEscapedEnemy(r));
            // list(DEPLOYMENT + list(CHAR_BATTLE_STATUS))
            int depCnt = r.count();
            for (int d = 0; d < depCnt; d++) {
                skipDeployment(r);
                r.skipFixedList(7);
            }
        }

        // boss_hp & boss_spawns blocks
        int bossBlockCnt = r.count();
        for (int i = 0; i < bossBlockCnt; i++) {
            r.skip(1);
            ev.bossHp = r.i32();
            r.skip(2);
            int sgCnt = r.count();
            for (int g = 0; g < sgCnt; g++) {
                r.skip(1); // player
                skipSpawnGroup(r);
            }
            int depCnt = r.count();
            for (int d = 0; d < depCnt; d++) skipDeployment(r);
        }

        // last_hp_cost: list(B + h)
        r.skipFixedList(3);

        // boss_records
        int recOuter = r.count();
        for (int i = 0; i < recOuter; i++) {
            r.skip(1);
            int recInner = r.count();
            for (int j = 0; j < recInner; j++) {
                r.skipStr();
                r.skip(2); // defeated, is_hidden
            }
        }

        // global_effects: list(str + i)
        skipSpecialEffects(r);
        return ev;
    }

    private static void parseRuntime(Reader r, Event ev) throws WireException {
        int count = r.count();
        if (count > 4) throw new WireException("runtime exceeds 4 slots");
        for (int i = 0; i < count; i++) {
            int uid = r.u8();
            r.skip(3); // finished, connection, pad
            int hp = r.i16();
            r.skip(4); // state + 3 bytes
            int bossDmg = r.i32();
            if (uid >= 1 && uid <= 4) {
                ev.hpBySeat.put(uid, hp);
                ev.bossDamageBySeat.put(uid, bossDmg);
            }
        }
    }

    private static SpawnPreview parseSpawnPreview(Reader r) throws WireException {
        int type = r.u8();
        String enemyId = r.str();
        int actionIdx = r.i8();
        int count = r.u8();
        int roundNum = r.u8();
        return new SpawnPreview(type, enemyId, actionIdx, count, roundNum);
    }

    private static EscapedEnemy parseEscapedEnemy(Reader r) throws WireException {
        int owner = r.u8();
        String enemyId = r.str();
        int instId = r.i32();
        boolean isToken = r.bool();
        boolean isSpecial = r.bool();
        return new EscapedEnemy(owner, instId, isToken, enemyId, isSpecial);
    }

    private static Event parsePreparationEvent(Reader r) throws WireException {
        Event ev = new Event("preparation");
        ev.seat = r.u8();
        ev.hp = r.i16();
        ev.round = r.u8();
        int level = r.u8();
        if (ev.seat >= 1 && ev.seat <= 4) {
            if (level >= 1 && level <= 6) ev.shopLevelBySeat.put(ev.seat, level);
            if (ev.hp >= 0) ev.hpBySeat.put(ev.seat, ev.hp);
        }
        parsePreparationBodyAfterLevel(r, ev.seat, ev);
        return ev;
    }

    private static void parsePreparationInto(Reader r, Event ev) throws WireException {
        int seat = r.u8();
        int hp = r.i16();
        r.skip(1); // number(B)
        int level = r.u8();
        if (seat >= 1 && seat <= 4) {
            if (level >= 1 && level <= 6) ev.shopLevelBySeat.put(seat, level);
            if (hp >= 0 && !ev.hpBySeat.containsKey(seat)) ev.hpBySeat.put(seat, hp);
        }
        parsePreparationBodyAfterLevel(r, seat, ev);
    }

    private static void parsePreparationBodyAfterLevel(Reader r, int seat, Event ev) throws WireException {
        r.skip(6); // remaining 6 of 7 bytes after shop level
        r.skipFixedList(5); // goods
        r.skip(1); // sequence
        // pieces: inst(i32) + ints(attached equip inst_ids) + chessIdent(u16) + 3 bytes
        int pCnt = r.count();
        List<Integer> pieceOrder = pCnt > 0 ? new ArrayList<Integer>(pCnt) : Collections.<Integer>emptyList();
        Map<Integer, Integer> pieceByInst = pCnt > 0 ? new HashMap<Integer, Integer>(pCnt * 2) : null;
        Map<Integer, List<Integer>> pieceEquipsByInst = pCnt > 0 ? new HashMap<Integer, List<Integer>>(pCnt * 2) : null;
        for (int i = 0; i < pCnt; i++) {
            int inst = r.i32();
            List<Integer> attached = r.readInts();
            int chessIdent = r.u16();
            r.skip(3);
            if (pieceByInst != null) {
                pieceOrder.add(inst);
                pieceByInst.put(inst, chessIdent);
                if (!attached.isEmpty()) {
                    pieceEquipsByInst.put(inst, attached);
                }
            }
        }
        // equips & traps: inst(i32) + ident(u16)
        List<Integer> equips = new ArrayList<>();
        Map<Integer, Integer> equipIdentByInst = new HashMap<>();
        int eqCnt = r.count();
        for (int i = 0; i < eqCnt; i++) {
            int inst = r.i32();
            int ident = r.u16();
            equips.add(ident);
            equipIdentByInst.put(inst, ident);
        }
        int trCnt = r.count();
        for (int i = 0; i < trCnt; i++) {
            int inst = r.i32();
            int ident = r.u16();
            equips.add(ident);
            equipIdentByInst.put(inst, ident);
        }
        // positions: inst(i32) + position(i32) + 2 bytes -> deployed pieces (pos >= 0，排除 pos < 0 与未入 positions 的整备区)
        int posCnt = r.count();
        List<Integer> deployed = new ArrayList<>();
        Map<Integer, Integer> posByInst = posCnt > 0 ? new HashMap<Integer, Integer>(posCnt * 2) : Collections.<Integer, Integer>emptyMap();
        for (int i = 0; i < posCnt; i++) {
            int inst = r.i32();
            int pos = r.i32();
            r.skip(2);
            if (posCnt > 0) posByInst.put(inst, pos);
            if (pos >= 0 && pieceByInst != null) {
                Integer cid = pieceByInst.get(inst);
                if (cid != null) deployed.add(cid);
            }
        }
        if (seat >= 1 && seat <= 4 && (!deployed.isEmpty() || !equips.isEmpty() || pCnt > 0)) {
            List<SeatPiece> deployedPieces = new ArrayList<>();
            List<SeatPiece> benchPieces = new ArrayList<>();
            for (int i = 0; i < pieceOrder.size(); i++) {
                int inst = pieceOrder.get(i);
                Integer cid = pieceByInst != null ? pieceByInst.get(inst) : null;
                if (cid == null) continue;
                List<Integer> attachedInsts = pieceEquipsByInst != null ? pieceEquipsByInst.get(inst) : null;
                List<Integer> attachedIdents = Collections.emptyList();
                if (attachedInsts != null && !attachedInsts.isEmpty()) {
                    attachedIdents = new ArrayList<>(attachedInsts.size());
                    for (int j = 0; j < attachedInsts.size(); j++) {
                        Integer eqInst = attachedInsts.get(j);
                        if (eqInst == null) continue;
                        Integer eqIdent = equipIdentByInst.get(eqInst);
                        if (eqIdent != null) attachedIdents.add(eqIdent);
                    }
                }
                SeatPiece sp = new SeatPiece(cid, attachedIdents);
                Integer posVal = posByInst.get(inst);
                if (posVal != null && posVal >= 0) {
                    deployedPieces.add(sp);
                } else {
                    benchPieces.add(sp);
                }
            }
            ev.deployedChessBySeat.put(seat, deployed);
            ev.equipIdentsBySeat.put(seat, equips);
            ev.deployedPiecesBySeat.put(seat, deployedPieces);
            ev.benchPiecesBySeat.put(seat, benchPieces);
        }
        // 7-byte server bond records: b0=active, b1..b2(>H)=stacks, b3..b4=reserved, b5=identifier(1..26), b6=opCount
        int bondCnt = r.count();
        List<WireBond> wireBonds = bondCnt > 0 ? new ArrayList<WireBond>(bondCnt) : null;
        for (int i = 0; i < bondCnt; i++) {
            boolean active = r.u8() != 0;
            int stacks = r.u16();
            r.skip(2);
            int ident = r.u8();
            int opCount = r.u8();
            if (wireBonds != null && ident >= 1 && ident < BOND_IDENT_TO_ID.length) {
                String bid = BOND_IDENT_TO_ID[ident];
                if (!bid.isEmpty() && (active || stacks > 0 || opCount > 0)) {
                    int clamped = Math.min(999, Math.max(0, stacks));
                    wireBonds.add(new WireBond(bid, clamped, opCount, active));
                }
            }
        }
        if (seat >= 1 && seat <= 4 && wireBonds != null && !wireBonds.isEmpty()) {
            ev.wireBondsBySeat.put(seat, wireBonds);
        }
        // _PREPARATION_BEFORE_ENEMIES[-2:] = (('list', (('list', _SP_PREPARE_SLOT), 'str')), 1)
        int outer = r.count();
        for (int i = 0; i < outer; i++) {
            skipSpPrepareSlots(r);
            r.skipStr();
        }
        r.skip(1);
        // enemies
        int eCnt = r.count();
        for (int i = 0; i < eCnt; i++) {
            r.skip(4);
            r.skipStr();
            r.skip(6);
        }
        // _PREPARATION_AFTER_ENEMIES = (('list', (3,)), 1, ('list', (5, 'str', ('list', (4,)))))
        r.skipFixedList(3);
        r.skip(1);
        int afterCnt = r.count();
        for (int i = 0; i < afterCnt; i++) {
            r.skip(5);
            r.skipStr();
            r.skipFixedList(4);
        }
        skipSpecialEffects(r);
        r.skipStr(); // skill_id
        r.skip(13);
    }

    private static void skipSpPrepareSlots(Reader r) throws WireException {
        int cnt = r.count();
        for (int i = 0; i < cnt; i++) {
            r.skipStr();
            r.skip(2);
        }
    }

    private static void skipSpPreparation(Reader r) throws WireException {
        skipSpPrepareSlots(r);
        r.skipFixedList(2);
        r.skipStr();
        r.skip(10);
    }

    private static void skipDeployment(Reader r) throws WireException {
        r.skip(1);
        int cc = r.count();
        for (int i = 0; i < cc; i++) {
            r.skip(4);
            r.skipFixedList(4);
            r.skip(5);
        }
        r.skipFixedList(6);
        r.skipFixedList(6);
        r.skipFixedList(10);
        r.skipFixedList(7);
    }

    private static void skipBossRound(Reader r) throws WireException {
        r.skip(1);
        r.skipStr();
        r.skip(2);
        int gCnt = r.count();
        for (int i = 0; i < gCnt; i++) {
            r.skip(1);
            r.skipStr(); // bytes list of length count()
        }
    }

    private static void skipSpawnGroups(Reader r) throws WireException {
        int pCnt = r.count();
        for (int i = 0; i < pCnt; i++) {
            r.skip(1);
            int gCnt = r.count();
            for (int j = 0; j < gCnt; j++) skipSpawnGroup(r);
        }
    }

    private static void skipSpawnGroup(Reader r) throws WireException {
        r.skipStr();
        r.skip(5); // action_index(b) + effect_id(i)
        r.skipIntsAndCount();
    }

    private static void skipSpecialEffects(Reader r) throws WireException {
        int cnt = r.count();
        for (int i = 0; i < cnt; i++) {
            r.skipStr();
            r.skip(4);
        }
    }

    private static Event parseHelpFinish(Reader r) throws WireException {
        int round = r.u8();
        if (round < 1 || round > 15) throw new WireException("help_finish round out of range");
        Event ev = new Event("help_finish");
        ev.round = round;
        ev.fromRejoin = r.bool();
        int escCnt = r.count();
        for (int i = 0; i < escCnt; i++) ev.escapedEnemies.add(parseEscapedEnemy(r));
        int killCnt = r.count();
        for (int i = 0; i < killCnt; i++) {
            int killer = r.u8();
            EscapedEnemy ee = parseEscapedEnemy(r);
            r.skip(5);
            ev.helpKills.add(new HelpKill(ee.instanceId, ee.isToken, killer, ee.owner, ee.enemyId));
        }
        return ev;
    }

    private static boolean isValidState(int st) {
        return (st >= 0 && st <= 9) || (st >= 100 && st <= 104);
    }

    private static int readU16(byte[] b, int o) { return ((b[o] & 0xFF) << 8) | (b[o + 1] & 0xFF); }
    private static int readInt(byte[] b, int o) {
        return ((b[o] & 0xFF) << 24) | ((b[o + 1] & 0xFF) << 16) | ((b[o + 2] & 0xFF) << 8) | (b[o + 3] & 0xFF);
    }

    static final class WireException extends Exception {
        Event partialEvent;
        WireException(String msg) { super(msg); }
    }

    private static final class Reader {
        private final byte[] buf;
        private int pos;
        private final int end;

        Reader(byte[] buf, int off, int len) {
            this.buf = buf;
            this.pos = off;
            this.end = off + len;
        }

        private void ensure(int n) throws WireException {
            if (n < 0 || pos + n > end) throw new WireException("unexpected EOF");
        }

        void skip(int n) throws WireException { ensure(n); pos += n; }
        int u8() throws WireException { ensure(1); return buf[pos++] & 0xFF; }
        int i8() throws WireException { ensure(1); return buf[pos++]; }
        boolean bool() throws WireException { return u8() != 0; }
        int i16() throws WireException {
            ensure(2);
            int v = ((buf[pos] & 0xFF) << 8) | (buf[pos + 1] & 0xFF);
            pos += 2;
            return (short) v;
        }
        int u16() throws WireException {
            ensure(2);
            int v = ((buf[pos] & 0xFF) << 8) | (buf[pos + 1] & 0xFF);
            pos += 2;
            return v;
        }
        int i32() throws WireException {
            ensure(4);
            int v = ((buf[pos] & 0xFF) << 24) | ((buf[pos + 1] & 0xFF) << 16)
                | ((buf[pos + 2] & 0xFF) << 8) | (buf[pos + 3] & 0xFF);
            pos += 4;
            return v;
        }
        int count() throws WireException {
            int c = u16();
            if (c > end - pos) throw new WireException("collection exceeds body");
            return c;
        }
        String str() throws WireException {
            int n = count();
            ensure(n);
            String s = new String(buf, pos, n, StandardCharsets.UTF_8);
            pos += n;
            return s;
        }
        void skipStr() throws WireException { int n = count(); skip(n); }
        List<Integer> readInts() throws WireException {
            int c = count();
            if (c == 0) return Collections.emptyList();
            List<Integer> list = new ArrayList<>(c);
            for (int i = 0; i < c; i++) {
                list.add(i32());
            }
            return list;
        }
        int skipIntsAndCount() throws WireException {
            int c = count();
            skip(c * 4);
            return c;
        }
        void skipFixedList(int elemBytes) throws WireException {
            int c = count();
            skip(c * elemBytes);
        }
        void finish() throws WireException {
            if (pos != end) throw new WireException("trailing unread bytes: " + (end - pos));
        }
    }
}
