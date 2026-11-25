package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.concurrent.atomic.AtomicInteger;

/** 纯 Java IPv4 / TCP / UDP 报文编解码与 RFC-1071 校验和计算（零外部依赖，支持 JVM 单测）。 */
final class PacketCodec {
    static final int PROTO_TCP = 6;
    static final int PROTO_UDP = 17;

    static final int TCP_FIN = 0x01;
    static final int TCP_SYN = 0x02;
    static final int TCP_RST = 0x04;
    static final int TCP_PSH = 0x08;
    static final int TCP_ACK = 0x10;

    private static final AtomicInteger IP_ID = new AtomicInteger(1);

    private PacketCodec() {}

    static final class ParsedPacket {
        int protocol;
        int srcIp;
        int dstIp;
        int srcPort;
        int dstPort;
        int tcpSeq;
        int tcpAck;
        int tcpFlags;
        int tcpWindow;
        int payloadOffset;
        int payloadLength;
    }

    static boolean parse(byte[] raw, int length, ParsedPacket out) {
        if (raw == null || length < 20) return false;
        int verIhl = raw[0] & 0xFF;
        if ((verIhl >>> 4) != 4) return false;
        int ihl = (verIhl & 0x0F) * 4;
        if (ihl < 20 || length < ihl) return false;
        int totalLen = u16(raw, 2);
        if (totalLen < ihl) return false;
        int usableLen = Math.min(length, totalLen);
        // 忽略 IP 分片包（现代手机默认 DF=1 + MSS=1400，不做重组）
        int frag = u16(raw, 6) & 0x1FFF;
        boolean moreFrags = (u16(raw, 6) & 0x2000) != 0;
        if (frag != 0 || moreFrags) return false;

        int proto = raw[9] & 0xFF;
        out.protocol = proto;
        out.srcIp = i32(raw, 12);
        out.dstIp = i32(raw, 16);

        if (proto == PROTO_TCP) {
            if (usableLen < ihl + 20) return false;
            out.srcPort = u16(raw, ihl);
            out.dstPort = u16(raw, ihl + 2);
            out.tcpSeq = i32(raw, ihl + 4);
            out.tcpAck = i32(raw, ihl + 8);
            int dataOffset = ((raw[ihl + 12] & 0xF0) >>> 4) * 4;
            if (dataOffset < 20 || usableLen < ihl + dataOffset) return false;
            out.tcpFlags = raw[ihl + 13] & 0xFF;
            out.tcpWindow = u16(raw, ihl + 14);
            out.payloadOffset = ihl + dataOffset;
            out.payloadLength = usableLen - out.payloadOffset;
            return true;
        }
        if (proto == PROTO_UDP) {
            if (usableLen < ihl + 8) return false;
            out.srcPort = u16(raw, ihl);
            out.dstPort = u16(raw, ihl + 2);
            int udpLen = u16(raw, ihl + 4);
            if (udpLen < 8 || ihl + udpLen > usableLen) return false;
            out.tcpSeq = 0;
            out.tcpAck = 0;
            out.tcpFlags = 0;
            out.tcpWindow = 0;
            out.payloadOffset = ihl + 8;
            out.payloadLength = udpLen - 8;
            return true;
        }
        return false;
    }

    /** 构造 IPv4 + TCP 报文（SYN+ACK 自动携带 MSS=1400 选项，避免分片）。 */
    static byte[] buildTcpPacket(
        int srcIp, int srcPort,
        int dstIp, int dstPort,
        int seq, int ack,
        int flags, int window,
        byte[] payload, int payloadOffset, int payloadLen
    ) {
        boolean withMss = (flags & TCP_SYN) != 0;
        int tcpHeaderLen = withMss ? 24 : 20;
        int dataLen = (payload != null && payloadLen > 0) ? payloadLen : 0;
        int totalLen = 20 + tcpHeaderLen + dataLen;
        byte[] pkt = new byte[totalLen];

        // IPv4 Header (20 bytes)
        pkt[0] = 0x45;
        pkt[1] = 0x00;
        put16(pkt, 2, totalLen);
        put16(pkt, 4, IP_ID.getAndIncrement() & 0xFFFF);
        put16(pkt, 6, 0x4000); // DF
        pkt[8] = 64; // TTL
        pkt[9] = (byte) PROTO_TCP;
        put16(pkt, 10, 0);
        put32(pkt, 12, srcIp);
        put32(pkt, 16, dstIp);
        put16(pkt, 10, checksum(pkt, 0, 20));

        // TCP Header
        put16(pkt, 20, srcPort);
        put16(pkt, 22, dstPort);
        put32(pkt, 24, seq);
        put32(pkt, 28, ack);
        pkt[32] = (byte) ((tcpHeaderLen / 4) << 4);
        pkt[33] = (byte) (flags & 0xFF);
        put16(pkt, 34, Math.max(0, Math.min(65535, window)));
        put16(pkt, 36, 0); // checksum placeholder
        put16(pkt, 38, 0); // urgent ptr
        if (withMss) {
            pkt[40] = 0x02; // MSS kind
            pkt[41] = 0x04; // MSS len
            put16(pkt, 42, 1400);
        }
        if (dataLen > 0) {
            System.arraycopy(payload, payloadOffset, pkt, 20 + tcpHeaderLen, dataLen);
        }
        put16(pkt, 36, transportChecksum(srcIp, dstIp, PROTO_TCP, pkt, 20, tcpHeaderLen + dataLen));
        return pkt;
    }

    /** 构造 IPv4 + UDP 报文。 */
    static byte[] buildUdpPacket(
        int srcIp, int srcPort,
        int dstIp, int dstPort,
        byte[] payload, int payloadOffset, int payloadLen
    ) {
        int dataLen = (payload != null && payloadLen > 0) ? payloadLen : 0;
        int udpLen = 8 + dataLen;
        int totalLen = 20 + udpLen;
        byte[] pkt = new byte[totalLen];

        // IPv4 Header
        pkt[0] = 0x45;
        pkt[1] = 0x00;
        put16(pkt, 2, totalLen);
        put16(pkt, 4, IP_ID.getAndIncrement() & 0xFFFF);
        put16(pkt, 6, 0x4000);
        pkt[8] = 64;
        pkt[9] = (byte) PROTO_UDP;
        put16(pkt, 10, 0);
        put32(pkt, 12, srcIp);
        put32(pkt, 16, dstIp);
        put16(pkt, 10, checksum(pkt, 0, 20));

        // UDP Header
        put16(pkt, 20, srcPort);
        put16(pkt, 22, dstPort);
        put16(pkt, 24, udpLen);
        put16(pkt, 26, 0);
        if (dataLen > 0) {
            System.arraycopy(payload, payloadOffset, pkt, 28, dataLen);
        }
        int cs = transportChecksum(srcIp, dstIp, PROTO_UDP, pkt, 20, udpLen);
        put16(pkt, 26, cs == 0 ? 0xFFFF : cs);
        return pkt;
    }

    static int checksum(byte[] buf, int offset, int len) {
        long sum = 0;
        int i = offset;
        int end = offset + len;
        while (i + 1 < end) {
            sum += ((buf[i] & 0xFF) << 8) | (buf[i + 1] & 0xFF);
            i += 2;
        }
        if (i < end) {
            sum += (buf[i] & 0xFF) << 8;
        }
        while ((sum >>> 16) != 0) {
            sum = (sum & 0xFFFF) + (sum >>> 16);
        }
        return (int) (~sum & 0xFFFF);
    }

    static int transportChecksum(int srcIp, int dstIp, int proto, byte[] buf, int offset, int len) {
        long sum = 0;
        sum += (srcIp >>> 16) & 0xFFFF;
        sum += srcIp & 0xFFFF;
        sum += (dstIp >>> 16) & 0xFFFF;
        sum += dstIp & 0xFFFF;
        sum += proto & 0xFF;
        sum += len & 0xFFFF;

        int i = offset;
        int end = offset + len;
        while (i + 1 < end) {
            sum += ((buf[i] & 0xFF) << 8) | (buf[i + 1] & 0xFF);
            i += 2;
        }
        if (i < end) {
            sum += (buf[i] & 0xFF) << 8;
        }
        while ((sum >>> 16) != 0) {
            sum = (sum & 0xFFFF) + (sum >>> 16);
        }
        return (int) (~sum & 0xFFFF);
    }

    static InetAddress toInetAddress(int ip) throws UnknownHostException {
        return InetAddress.getByAddress(new byte[] {
            (byte) ((ip >>> 24) & 0xFF),
            (byte) ((ip >>> 16) & 0xFF),
            (byte) ((ip >>> 8) & 0xFF),
            (byte) (ip & 0xFF)
        });
    }

    static String formatIp(int ip) {
        return ((ip >>> 24) & 0xFF) + "." + ((ip >>> 16) & 0xFF) + "." + ((ip >>> 8) & 0xFF) + "." + (ip & 0xFF);
    }

    static int u16(byte[] b, int o) { return ((b[o] & 0xFF) << 8) | (b[o + 1] & 0xFF); }
    static int i32(byte[] b, int o) {
        return ((b[o] & 0xFF) << 24) | ((b[o + 1] & 0xFF) << 16) | ((b[o + 2] & 0xFF) << 8) | (b[o + 3] & 0xFF);
    }
    static void put16(byte[] b, int o, int v) {
        b[o] = (byte) ((v >>> 8) & 0xFF);
        b[o + 1] = (byte) (v & 0xFF);
    }
    static void put32(byte[] b, int o, int v) {
        b[o] = (byte) ((v >>> 24) & 0xFF);
        b[o + 1] = (byte) ((v >>> 16) & 0xFF);
        b[o + 2] = (byte) ((v >>> 8) & 0xFF);
        b[o + 3] = (byte) (v & 0xFF);
    }
}
