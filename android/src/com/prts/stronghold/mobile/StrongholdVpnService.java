package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.DatagramChannel;
import java.nio.channels.SelectionKey;
import java.nio.channels.Selector;
import java.nio.channels.SocketChannel;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 免 Root 本机回环分流 VpnService：
 * - 仅路由明日方舟客户端流量（不拦截微信/浏览器等其他 App，不走任何外部服务器，不改包）；
 * - 单线程 NIO Selector 反应堆实现 IPv4 TCP/UDP 透传 + 下行 RTO 重传 + 流控背压，杜绝死锁与掉线；
 * - 对非 80/443 的游戏 TCP 长连接只读旁路喂给 StrongholdWireDecoder，实时解析出怪预告与漏怪兜底数。
 */
public final class StrongholdVpnService extends VpnService {
    static final String ACTION_START = "com.prts.stronghold.mobile.VPN_START";
    static final String ACTION_STOP = "com.prts.stronghold.mobile.VPN_STOP";
    static final String ACTION_RESTART = "com.prts.stronghold.mobile.VPN_RESTART";

    private static final String CHANNEL_ID = "prts_vpn_capture";
    private static final int NOTIFICATION_ID = 4102;
    private static final int MTU = 1500;
    private static final int MSS = 1400;
    private static final int MAX_TCP_INFLIGHT = 32768;
    private static final long TCP_CONNECT_TIMEOUT_MS = 10_000L;
    private static final long TCP_IDLE_MS = 180_000L;
    private static final long TCP_CLOSING_MS = 15_000L;
    private static final long UDP_IDLE_MS = 45_000L;
    private static final long RTO_BASE_MS = 400L;
    private static final int MAX_RETRIES = 8;
    private static final int MAX_CONSECUTIVE_UPSTREAM_FAILURES = 6;
    static final int MAX_INBOUND_QUEUE = 2048;

    private static final String[] ARKNIGHTS_PACKAGES = {
        "com.hypergryph.arknights",
        "com.hypergryph.arknights.bilibili",
        "com.YoStarEN.Arknights",
        "com.YoStarJP.Arknights",
        "com.YoStarKR.Arknights",
        "tw.txwy.and.arknights"
    };

    private static volatile StrongholdVpnService active;

    private ParcelFileDescriptor tunFd;
    private FileInputStream tunIn;
    private FileOutputStream tunOut;
    private volatile boolean running;
    private Selector selector;
    private Thread tunReaderThread;
    private Thread reactorThread;
    private final ConcurrentLinkedQueue<byte[]> inboundPackets = new ConcurrentLinkedQueue<>();
    private final AtomicInteger inboundQueueSize = new AtomicInteger(0);
    private final Map<SessionKey, TcpSession> tcpSessions = new HashMap<>();
    private final Map<SessionKey, UdpSession> udpSessions = new HashMap<>();
    private final Random random = new Random();
    private final ByteBuffer ioBuf = ByteBuffer.allocate(16384);
    private int consecutiveUpstreamFailures = 0;

    /** 极端崩溃兜底：第一时间关闭 TUN 描述符，毫秒级恢复《明日方舟》系统直连，绝不断网。 */
    static void emergencyCloseStatic() {
        StrongholdVpnService s = active;
        if (s != null) {
            s.running = false;
            ParcelFileDescriptor fd = s.tunFd;
            s.tunFd = null;
            if (fd != null) {
                try { fd.close(); } catch (Throwable ignored) {}
            }
        }
    }

    static void restartActive(Context context) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        stopActive(app);
        try {
            if (VpnService.prepare(app) == null) {
                Intent start = new Intent(app, StrongholdVpnService.class).setAction(ACTION_START);
                if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(start);
                else app.startService(start);
            } else {
                app.startActivity(new Intent(app, VpnPermissionActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS));
            }
        } catch (RuntimeException error) {
            BattleCaptureState.setStatus(false, "error", "无法自动重连本机抓包（游戏直连不受影响），请从主页重新开启");
        }
    }

    static void stopActive(Context context) {
        StrongholdVpnService s = active;
        if (s != null) {
            s.shutdownTunnel("已停止本机实时抓包");
            s.stopSelf();
        } else if (context != null) {
            try { context.stopService(new Intent(context, StrongholdVpnService.class)); } catch (RuntimeException ignored) {}
            BattleCaptureState.setStatus(false, "idle", "已停止本机实时抓包");
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            shutdownTunnel("已停止本机实时抓包");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_RESTART.equals(intent.getAction())) {
            shutdownTunnel(null);
            StrongholdEnemyCatalog.ensureLoaded(getApplicationContext());
            EnemyPortraitAtlas.preloadAsync(getApplicationContext());
            startForegroundNotification();
            startTunnel();
            return START_STICKY;
        }
        if (running) {
            return START_STICKY;
        }
        StrongholdEnemyCatalog.ensureLoaded(getApplicationContext());
        EnemyPortraitAtlas.preloadAsync(getApplicationContext());
        startForegroundNotification();
        startTunnel();
        return START_STICKY;
    }

    @Override public void onRevoke() {
        shutdownTunnel("本机抓包被系统或其他 VPN 接管已停止");
        stopSelf();
        super.onRevoke();
    }

    @Override public void onDestroy() {
        shutdownTunnel(null);
        super.onDestroy();
    }

    private void startForegroundNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "卫戍实时抓包", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent stopIntent = new Intent(this, StrongholdVpnService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stopIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent openIntent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 2, openIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notice = new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_overlay_ball)
            .setContentTitle("PRTS 实时抓包运行中")
            .setContentText("仅旁路解析明日方舟对局包 · 出怪预告与漏怪兜底已就绪")
            .setOngoing(true)
            .setContentIntent(openPi)
            .addAction(new Notification.Action.Builder(null, "停止抓包", stopPi).build())
            .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notice);
        }
    }

    private void startTunnel() {
        try {
            Builder builder = new Builder()
                .setSession("PRTS 卫戍战报抓包")
                .setMtu(MTU)
                .addAddress("10.215.173.1", 32)
                .addRoute("0.0.0.0", 0);

            // 优先沿用当前活跃网络的 IPv4 DNS，保校园网/企业网畅通
            int dnsAdded = 0;
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm != null) {
                Network net = cm.getActiveNetwork();
                LinkProperties lp = net != null ? cm.getLinkProperties(net) : null;
                if (lp != null) {
                    for (InetAddress addr : lp.getDnsServers()) {
                        if (addr instanceof Inet4Address) {
                            builder.addDnsServer(addr);
                            dnsAdded++;
                        }
                    }
                }
            }
            if (dnsAdded == 0) {
                builder.addDnsServer("223.5.5.5");
                builder.addDnsServer("119.29.29.29");
            }

            List<String> matchedPackages = findInstalledArknights();
            if (matchedPackages.isEmpty()) {
                BattleCaptureState.setStatus(false, "error", "未检测到已安装的明日方舟客户端");
                stopSelf();
                return;
            }
            for (String pkg : matchedPackages) {
                try {
                    builder.addAllowedApplication(pkg);
                } catch (PackageManager.NameNotFoundException ignored) {}
            }

            tunFd = builder.establish();
            if (tunFd == null) {
                BattleCaptureState.setStatus(false, "error", "无法建立本机 VPN 通道，请重试授权");
                stopSelf();
                return;
            }
            tunIn = new FileInputStream(tunFd.getFileDescriptor());
            tunOut = new FileOutputStream(tunFd.getFileDescriptor());
            selector = Selector.open();
            clearBoundedQueue(inboundPackets, inboundQueueSize);
            running = true;
            active = this;

            tunReaderThread = new Thread(this::runTunReader, "prts-vpn-tun-in");
            tunReaderThread.setDaemon(true);
            reactorThread = new Thread(this::runReactor, "prts-vpn-reactor");
            reactorThread.setDaemon(true);
            tunReaderThread.start();
            reactorThread.start();

            BattleCaptureState.setStatus(true, "running", "实时抓包已开启 · 仅代理明日方舟，进局自动同步出怪与漏怪");
        } catch (Exception error) {
            shutdownTunnel("启动本机抓包失败：" + error.getMessage());
            stopSelf();
        }
    }

    private List<String> findInstalledArknights() {
        PackageManager pm = getPackageManager();
        List<String> found = new ArrayList<>();
        for (String pkg : ARKNIGHTS_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                found.add(pkg);
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return found;
    }

    static boolean offerBoundedPacket(ConcurrentLinkedQueue<byte[]> queue, AtomicInteger queueSize, byte[] packet, int maxQueue) {
        if (queue == null || queueSize == null || packet == null || maxQueue <= 0) return false;
        if (queueSize.get() >= maxQueue) return false;
        if (queue.offer(packet)) {
            queueSize.incrementAndGet();
            return true;
        }
        return false;
    }

    static byte[] pollBoundedPacket(ConcurrentLinkedQueue<byte[]> queue, AtomicInteger queueSize) {
        if (queue == null || queueSize == null) return null;
        byte[] raw = queue.poll();
        if (raw != null) {
            queueSize.decrementAndGet();
        }
        return raw;
    }

    static void clearBoundedQueue(ConcurrentLinkedQueue<byte[]> queue, AtomicInteger queueSize) {
        if (queue != null) {
            while (queue.poll() != null) {
                if (queueSize != null) queueSize.decrementAndGet();
            }
        }
        if (queueSize != null) queueSize.set(0);
    }

    private void shutdownTunnel(String finalMessage) {
        running = false;
        if (active == this) active = null;
        clearBoundedQueue(inboundPackets, inboundQueueSize);
        if (selector != null) {
            try { selector.wakeup(); } catch (Exception ignored) {}
        }
        if (tunFd != null) {
            try { tunFd.close(); } catch (IOException ignored) {}
            tunFd = null;
        }
        tunIn = null;
        tunOut = null;
        if (finalMessage != null) {
            BattleCaptureState.setStatus(false, "idle", finalMessage);
        } else if (BattleCaptureState.isRunning()) {
            BattleCaptureState.setStatus(false, "idle", "已停止本机实时抓包");
        }
    }

    private void runTunReader() {
        byte[] buf = new byte[32768];
        try {
            while (running) {
                FileInputStream in = tunIn;
                if (in == null) break;
                int len = in.read(buf);
                if (len <= 0) {
                    if (len < 0) break;
                    continue;
                }
                if (inboundQueueSize.get() >= MAX_INBOUND_QUEUE) {
                    continue;
                }
                byte[] copy = new byte[len];
                System.arraycopy(buf, 0, copy, 0, len);
                if (offerBoundedPacket(inboundPackets, inboundQueueSize, copy, MAX_INBOUND_QUEUE)) {
                    Selector sel = selector;
                    if (sel != null) sel.wakeup();
                }
            }
        } catch (Throwable ignored) {
            // 读取异常或正常关闭
        } finally {
            if (running) {
                shutdownTunnel("本机抓包通道已自动切回系统直连（不影响游戏运行），可点击一键重连");
                stopSelf();
            }
        }
    }

    private void runReactor() {
        PacketCodec.ParsedPacket pkt = new PacketCodec.ParsedPacket();
        long lastSweep = System.currentTimeMillis();
        try {
            while (running) {
                drainInbound(pkt);
                Selector sel = selector;
                if (sel == null || !sel.isOpen()) break;
                int ready = sel.select(200);
                if (!running) break;
                if (ready > 0) {
                    Iterator<SelectionKey> it = sel.selectedKeys().iterator();
                    while (it.hasNext()) {
                        SelectionKey key = it.next();
                        it.remove();
                        if (!key.isValid()) continue;
                        Object att = key.attachment();
                        if (att instanceof TcpSession) {
                            handleTcpChannelEvent((TcpSession) att, key);
                        } else if (att instanceof UdpSession) {
                            handleUdpChannelEvent((UdpSession) att, key);
                        }
                    }
                }
                drainInbound(pkt);
                long now = System.currentTimeMillis();
                if (now - lastSweep >= 200L) {
                    lastSweep = now;
                    periodicMaintenance(now);
                }
            }
        } catch (Throwable error) {
            // 任何未预期异常（含 OOM）立即释放 TUN 描述符恢复游戏直连，绝不黑洞丢包
            if (running) {
                shutdownTunnel("抓包引擎遇到异常已自动切回游戏直连保障不断线，可点「一键重连」恢复");
                stopSelf();
            }
        } finally {
            closeAllSessions();
        }
    }

    private void drainInbound(PacketCodec.ParsedPacket pkt) {
        byte[] raw;
        while ((raw = pollBoundedPacket(inboundPackets, inboundQueueSize)) != null) {
            if (!PacketCodec.parse(raw, raw.length, pkt)) continue;
            if (pkt.protocol == PacketCodec.PROTO_TCP) {
                handleInboundTcp(raw, pkt);
            } else if (pkt.protocol == PacketCodec.PROTO_UDP) {
                handleInboundUdp(raw, pkt);
            }
        }
    }

    private void handleInboundUdp(byte[] raw, PacketCodec.ParsedPacket pkt) {
        SessionKey key = new SessionKey(pkt.srcIp, pkt.srcPort, pkt.dstIp, pkt.dstPort);
        UdpSession session = udpSessions.get(key);
        long now = System.currentTimeMillis();
        if (session == null) {
            try {
                DatagramChannel ch = DatagramChannel.open();
                ch.configureBlocking(false);
                if (!protect(ch.socket())) {
                    ch.close();
                    return;
                }
                ch.connect(new InetSocketAddress(PacketCodec.toInetAddress(pkt.dstIp), pkt.dstPort));
                session = new UdpSession(key, ch, now);
                session.selectionKey = ch.register(selector, SelectionKey.OP_READ, session);
                udpSessions.put(key, session);
            } catch (IOException ignored) {
                return;
            }
        }
        session.lastActiveAt = now;
        if (pkt.payloadLength > 0) {
            try {
                session.channel.write(ByteBuffer.wrap(raw, pkt.payloadOffset, pkt.payloadLength));
            } catch (IOException ignored) {
                closeUdpSession(session);
            }
        }
    }

    private void handleUdpChannelEvent(UdpSession session, SelectionKey key) {
        if (!key.isReadable()) return;
        ioBuf.clear();
        try {
            int n = session.channel.read(ioBuf);
            if (n <= 0) return;
            session.lastActiveAt = System.currentTimeMillis();
            byte[] reply = PacketCodec.buildUdpPacket(
                session.key.dstIp, session.key.dstPort,
                session.key.srcIp, session.key.srcPort,
                ioBuf.array(), 0, n
            );
            writeTun(reply);
        } catch (IOException ignored) {
            closeUdpSession(session);
        }
    }

    private void handleInboundTcp(byte[] raw, PacketCodec.ParsedPacket pkt) {
        SessionKey key = new SessionKey(pkt.srcIp, pkt.srcPort, pkt.dstIp, pkt.dstPort);
        TcpSession session = tcpSessions.get(key);
        boolean syn = (pkt.tcpFlags & PacketCodec.TCP_SYN) != 0;
        boolean ack = (pkt.tcpFlags & PacketCodec.TCP_ACK) != 0;
        boolean fin = (pkt.tcpFlags & PacketCodec.TCP_FIN) != 0;
        boolean rst = (pkt.tcpFlags & PacketCodec.TCP_RST) != 0;
        long now = System.currentTimeMillis();

        if (rst) {
            if (session != null) closeTcpSession(session, false);
            return;
        }

        if (syn && !ack) {
            // 新连接或客户端重发 SYN
            if (session != null) {
                if (session.state == TcpSession.STATE_CONNECTING && session.clientIsn == pkt.tcpSeq) {
                    return; // 正在连上游，忽略重复 SYN
                }
                if (session.state == TcpSession.STATE_SYN_RECEIVED && session.clientIsn == pkt.tcpSeq) {
                    sendTcp(session, session.serverIsn, session.clientNextSeq, PacketCodec.TCP_SYN | PacketCodec.TCP_ACK, null, 0, 0);
                    return;
                }
                closeTcpSession(session, false);
            }
            try {
                SocketChannel ch = SocketChannel.open();
                ch.configureBlocking(false);
                ch.socket().setTcpNoDelay(true);
                if (!protect(ch.socket())) {
                    ch.close();
                    sendRstForPacket(pkt);
                    noteUpstreamFailure();
                    return;
                }
                boolean inspect = pkt.dstPort != 80 && pkt.dstPort != 443;
                int serverIsn = random.nextInt();
                session = new TcpSession(key, ch, pkt.tcpSeq, serverIsn, inspect, now);
                session.clientWindow = Math.max(1400, pkt.tcpWindow);
                boolean connected = ch.connect(new InetSocketAddress(PacketCodec.toInetAddress(pkt.dstIp), pkt.dstPort));
                tcpSessions.put(key, session);
                if (connected) {
                    consecutiveUpstreamFailures = 0;
                    onTcpConnected(session);
                } else {
                    session.selectionKey = ch.register(selector, SelectionKey.OP_CONNECT, session);
                }
            } catch (IOException ignored) {
                sendRstForPacket(pkt);
                noteUpstreamFailure();
            }
            return;
        }

        if (session == null) {
            // 孤立段直接回 RST 让客户端干净重连
            if (!fin) sendRstForPacket(pkt);
            return;
        }

        session.lastActiveAt = now;
        if (ack) {
            session.clientWindow = Math.max(1400, pkt.tcpWindow);
            processClientAck(session, pkt.tcpAck, pkt.payloadLength == 0 && !fin);
            if (session.state == TcpSession.STATE_SYN_RECEIVED && seqDiff(pkt.tcpAck, session.serverSeq) >= 0) {
                session.state = TcpSession.STATE_ESTABLISHED;
                updateTcpInterest(session);
            }
        }

        if (pkt.payloadLength > 0 && !session.clientFinReceived) {
            acceptClientPayload(session, raw, pkt.payloadOffset, pkt.payloadLength, pkt.tcpSeq);
        }

        if (fin && !session.clientFinReceived) {
            int finSeq = pkt.tcpSeq + pkt.payloadLength;
            if (finSeq == session.clientNextSeq) {
                session.clientFinReceived = true;
                session.clientNextSeq += 1;
                sendTcp(session, session.serverSeq, session.clientNextSeq, PacketCodec.TCP_ACK, null, 0, 0);
                tryShutdownUpstreamOutput(session);
            }
        }

        if (session.clientFinReceived && session.serverFinSent && session.unacked.isEmpty()) {
            closeTcpSession(session, false);
        } else {
            updateTcpInterest(session);
        }
    }

    private void onTcpConnected(TcpSession session) throws IOException {
        session.state = TcpSession.STATE_SYN_RECEIVED;
        session.selectionKey = session.channel.register(selector, 0, session);
        sendTcp(session, session.serverIsn, session.clientNextSeq, PacketCodec.TCP_SYN | PacketCodec.TCP_ACK, null, 0, 0);
        session.serverSeq = session.serverIsn + 1;
        session.clientAckedSeq = session.serverIsn;
    }

    private void noteUpstreamFailure() {
        consecutiveUpstreamFailures++;
        if (consecutiveUpstreamFailures >= MAX_CONSECUTIVE_UPSTREAM_FAILURES && running) {
            consecutiveUpstreamFailures = 0;
            // 连续无法保护/直连上游说明系统 VPN 路由冲突或断网，立即关闭 TUN 让游戏走系统直连不断线
            BattleCaptureState.setStatus(
                false,
                "error",
                "检测到网络切换或加速器冲突，已自动切回游戏直连保障不断线；网络恢复后可点「一键重连」"
            );
            shutdownTunnel(null);
            stopSelf();
        }
    }

    private void handleTcpChannelEvent(TcpSession session, SelectionKey key) {
        try {
            if (key.isConnectable()) {
                if (session.channel.finishConnect()) {
                    consecutiveUpstreamFailures = 0;
                    onTcpConnected(session);
                }
                return;
            }
            if (key.isWritable()) {
                flushUpstreamWrites(session);
            }
            if (key.isValid() && key.isReadable()) {
                readDownstream(session);
            }
        } catch (IOException ignored) {
            if (session.state == TcpSession.STATE_CONNECTING) noteUpstreamFailure();
            closeTcpSession(session, true);
        }
    }

    private void acceptClientPayload(TcpSession session, byte[] raw, int off, int len, int seq) {
        int diff = seqDiff(seq, session.clientNextSeq);
        if (diff <= 0) {
            int overlap = -diff;
            if (overlap < len) {
                enqueueUpstreamData(session, raw, off + overlap, len - overlap);
                session.clientNextSeq += (len - overlap);
                // 若乱序缓存中紧邻后续段已到达，立即拼上
                while (!session.outOfOrder.isEmpty()) {
                    Map.Entry<Integer, byte[]> first = session.outOfOrder.firstEntry();
                    int d = seqDiff(first.getKey(), session.clientNextSeq);
                    if (d > 0) break;
                    session.outOfOrder.pollFirstEntry();
                    byte[] seg = first.getValue();
                    int ov = -d;
                    if (ov < seg.length) {
                        enqueueUpstreamData(session, seg, ov, seg.length - ov);
                        session.clientNextSeq += (seg.length - ov);
                    }
                }
            }
            sendTcp(session, session.serverSeq, session.clientNextSeq, PacketCodec.TCP_ACK, null, 0, 0);
        } else if (diff < 65536 && session.outOfOrder.size() < 32) {
            byte[] copy = new byte[len];
            System.arraycopy(raw, off, copy, 0, len);
            session.outOfOrder.put(seq, copy);
            sendTcp(session, session.serverSeq, session.clientNextSeq, PacketCodec.TCP_ACK, null, 0, 0);
        }
    }

    private void enqueueUpstreamData(TcpSession session, byte[] buf, int off, int len) {
        byte[] copy = new byte[len];
        System.arraycopy(buf, off, copy, 0, len);
        session.upQueue.addLast(ByteBuffer.wrap(copy));
        if (session.decoder != null) {
            BattleCaptureState.notePacket();
            List<StrongholdWireDecoder.Event> events = session.decoder.feed(StrongholdWireDecoder.DIR_UP, copy, 0, len);
            for (StrongholdWireDecoder.Event ev : events) BattleCaptureState.accept(ev);
        }
    }

    private void flushUpstreamWrites(TcpSession session) throws IOException {
        while (!session.upQueue.isEmpty()) {
            ByteBuffer head = session.upQueue.peekFirst();
            int written = session.channel.write(head);
            if (written <= 0) break;
            if (!head.hasRemaining()) session.upQueue.pollFirst();
        }
        if (session.upQueue.isEmpty() && session.clientFinReceived) {
            tryShutdownUpstreamOutput(session);
        }
        updateTcpInterest(session);
    }

    private void tryShutdownUpstreamOutput(TcpSession session) {
        if (!session.upShutdownSent && session.upQueue.isEmpty()) {
            session.upShutdownSent = true;
            try { session.channel.shutdownOutput(); } catch (IOException ignored) {}
        }
    }

    private void readDownstream(TcpSession session) throws IOException {
        if (session.serverFinSent) return;
        int availWindow = Math.min(MAX_TCP_INFLIGHT, Math.max(MSS * 3, session.clientWindow)) - session.inFlightBytes();
        if (availWindow < MSS) {
            updateTcpInterest(session);
            return;
        }
        ioBuf.clear();
        int maxRead = Math.min(ioBuf.capacity(), Math.max(MSS, availWindow));
        ioBuf.limit(maxRead);
        int n = session.channel.read(ioBuf);
        if (n < 0) {
            session.serverFinSent = true;
            int finSeq = session.serverSeq;
            session.serverSeq += 1;
            sendTcp(session, finSeq, session.clientNextSeq, PacketCodec.TCP_FIN | PacketCodec.TCP_ACK, null, 0, 0);
            session.unacked.addLast(new SentSegment(finSeq, null, true, System.currentTimeMillis()));
            updateTcpInterest(session);
            return;
        }
        if (n == 0) return;
        session.lastActiveAt = System.currentTimeMillis();
        byte[] data = ioBuf.array();
        if (session.decoder != null) {
            BattleCaptureState.notePacket();
            List<StrongholdWireDecoder.Event> events = session.decoder.feed(StrongholdWireDecoder.DIR_DOWN, data, 0, n);
            for (StrongholdWireDecoder.Event ev : events) BattleCaptureState.accept(ev);
        }
        int offset = 0;
        long now = System.currentTimeMillis();
        while (offset < n) {
            int chunk = Math.min(MSS, n - offset);
            boolean last = (offset + chunk >= n);
            int segSeq = session.serverSeq;
            int flags = PacketCodec.TCP_ACK | (last ? PacketCodec.TCP_PSH : 0);
            sendTcp(session, segSeq, session.clientNextSeq, flags, data, offset, chunk);
            byte[] copy = new byte[chunk];
            System.arraycopy(data, offset, copy, 0, chunk);
            session.unacked.addLast(new SentSegment(segSeq, copy, false, now));
            session.serverSeq += chunk;
            offset += chunk;
        }
        updateTcpInterest(session);
    }

    private void processClientAck(TcpSession session, int ackNum, boolean pureAck) {
        if (seqDiff(ackNum, session.clientAckedSeq) > 0 && seqDiff(ackNum, session.serverSeq) <= 0) {
            session.clientAckedSeq = ackNum;
            session.dupAckCount = 0;
            while (!session.unacked.isEmpty()) {
                SentSegment seg = session.unacked.peekFirst();
                int segEnd = seg.seq + seg.seqLen();
                if (seqDiff(ackNum, segEnd) >= 0) {
                    session.unacked.pollFirst();
                } else {
                    break;
                }
            }
        } else if (pureAck && ackNum == session.clientAckedSeq && !session.unacked.isEmpty()) {
            session.dupAckCount++;
            if (session.dupAckCount == 3) {
                retransmitHead(session, System.currentTimeMillis());
            }
        }
    }

    private void retransmitHead(TcpSession session, long now) {
        SentSegment head = session.unacked.peekFirst();
        if (head == null) return;
        head.retries++;
        head.sentAt = now;
        if (head.isFin) {
            sendTcp(session, head.seq, session.clientNextSeq, PacketCodec.TCP_FIN | PacketCodec.TCP_ACK, null, 0, 0);
        } else {
            sendTcp(session, head.seq, session.clientNextSeq, PacketCodec.TCP_ACK | PacketCodec.TCP_PSH, head.data, 0, head.data.length);
        }
    }

    private void updateTcpInterest(TcpSession session) {
        SelectionKey sk = session.selectionKey;
        if (sk == null || !sk.isValid()) return;
        if (session.state == TcpSession.STATE_CONNECTING) {
            sk.interestOps(SelectionKey.OP_CONNECT);
            return;
        }
        int ops = 0;
        if (!session.upQueue.isEmpty()) ops |= SelectionKey.OP_WRITE;
        if (session.state == TcpSession.STATE_ESTABLISHED && !session.serverFinSent) {
            int maxWin = Math.min(MAX_TCP_INFLIGHT, Math.max(MSS * 3, session.clientWindow));
            if (session.inFlightBytes() < maxWin) ops |= SelectionKey.OP_READ;
        }
        if (sk.interestOps() != ops) sk.interestOps(ops);
    }

    private void periodicMaintenance(long now) {
        List<TcpSession> toCloseTcp = null;
        for (TcpSession s : tcpSessions.values()) {
            if (!s.unacked.isEmpty()) {
                SentSegment head = s.unacked.peekFirst();
                long rto = RTO_BASE_MS << Math.min(head.retries, 3);
                if (now - head.sentAt >= rto) {
                    if (head.retries >= MAX_RETRIES) {
                        if (toCloseTcp == null) toCloseTcp = new ArrayList<>();
                        toCloseTcp.add(s);
                        continue;
                    }
                    retransmitHead(s, now);
                }
            }
            if (s.state == TcpSession.STATE_CONNECTING && now - s.lastActiveAt > TCP_CONNECT_TIMEOUT_MS) {
                if (toCloseTcp == null) toCloseTcp = new ArrayList<>();
                toCloseTcp.add(s);
                noteUpstreamFailure();
                continue;
            }
            long idleLimit = (s.clientFinReceived || s.serverFinSent) ? TCP_CLOSING_MS : TCP_IDLE_MS;
            if (now - s.lastActiveAt > idleLimit) {
                if (toCloseTcp == null) toCloseTcp = new ArrayList<>();
                toCloseTcp.add(s);
                continue;
            }
            updateTcpInterest(s);
        }
        if (toCloseTcp != null) {
            for (TcpSession s : toCloseTcp) closeTcpSession(s, !s.serverFinSent);
        }

        List<UdpSession> toCloseUdp = null;
        for (UdpSession u : udpSessions.values()) {
            if (now - u.lastActiveAt > UDP_IDLE_MS) {
                if (toCloseUdp == null) toCloseUdp = new ArrayList<>();
                toCloseUdp.add(u);
            }
        }
        if (toCloseUdp != null) {
            for (UdpSession u : toCloseUdp) closeUdpSession(u);
        }
    }

    private void closeTcpSession(TcpSession session, boolean sendRst) {
        tcpSessions.remove(session.key);
        if (sendRst) {
            sendTcp(session, session.serverSeq, session.clientNextSeq, PacketCodec.TCP_RST | PacketCodec.TCP_ACK, null, 0, 0);
        }
        if (session.selectionKey != null) session.selectionKey.cancel();
        try { session.channel.close(); } catch (IOException ignored) {}
    }

    private void closeUdpSession(UdpSession session) {
        udpSessions.remove(session.key);
        if (session.selectionKey != null) session.selectionKey.cancel();
        try { session.channel.close(); } catch (IOException ignored) {}
    }

    private void closeAllSessions() {
        clearBoundedQueue(inboundPackets, inboundQueueSize);
        for (TcpSession s : new ArrayList<>(tcpSessions.values())) closeTcpSession(s, false);
        for (UdpSession u : new ArrayList<>(udpSessions.values())) closeUdpSession(u);
        if (selector != null) {
            try { selector.close(); } catch (IOException ignored) {}
            selector = null;
        }
    }

    private void sendTcp(TcpSession s, int seq, int ack, int flags, byte[] data, int off, int len) {
        byte[] pkt = PacketCodec.buildTcpPacket(
            s.key.dstIp, s.key.dstPort,
            s.key.srcIp, s.key.srcPort,
            seq, ack, flags, 65535,
            data, off, len
        );
        writeTun(pkt);
    }

    private void sendRstForPacket(PacketCodec.ParsedPacket pkt) {
        byte[] rst = PacketCodec.buildTcpPacket(
            pkt.dstIp, pkt.dstPort,
            pkt.srcIp, pkt.srcPort,
            pkt.tcpAck, pkt.tcpSeq + Math.max(1, pkt.payloadLength),
            PacketCodec.TCP_RST | PacketCodec.TCP_ACK, 0,
            null, 0, 0
        );
        writeTun(rst);
    }

    private void writeTun(byte[] pkt) {
        FileOutputStream out = tunOut;
        if (out == null || !running) return;
        try {
            out.write(pkt);
        } catch (IOException ignored) {}
    }

    private static int seqDiff(int a, int b) { return a - b; }

    private static final class SessionKey {
        final int srcIp, srcPort, dstIp, dstPort;
        SessionKey(int srcIp, int srcPort, int dstIp, int dstPort) {
            this.srcIp = srcIp; this.srcPort = srcPort; this.dstIp = dstIp; this.dstPort = dstPort;
        }
        @Override public boolean equals(Object o) {
            if (!(o instanceof SessionKey)) return false;
            SessionKey k = (SessionKey) o;
            return srcIp == k.srcIp && srcPort == k.srcPort && dstIp == k.dstIp && dstPort == k.dstPort;
        }
        @Override public int hashCode() {
            int h = srcIp;
            h = 31 * h + srcPort;
            h = 31 * h + dstIp;
            h = 31 * h + dstPort;
            return h;
        }
    }

    private static final class SentSegment {
        final int seq;
        final byte[] data;
        final boolean isFin;
        long sentAt;
        int retries;
        SentSegment(int seq, byte[] data, boolean isFin, long sentAt) {
            this.seq = seq; this.data = data; this.isFin = isFin; this.sentAt = sentAt;
        }
        int seqLen() { return isFin ? 1 : (data != null ? data.length : 0); }
    }

    private static final class TcpSession {
        static final int STATE_CONNECTING = 0;
        static final int STATE_SYN_RECEIVED = 1;
        static final int STATE_ESTABLISHED = 2;

        final SessionKey key;
        final SocketChannel channel;
        final int clientIsn;
        final int serverIsn;
        final StrongholdWireDecoder decoder;
        SelectionKey selectionKey;
        int state = STATE_CONNECTING;
        int clientNextSeq;
        int serverSeq;
        int clientAckedSeq;
        int clientWindow = 65535;
        int dupAckCount = 0;
        boolean clientFinReceived = false;
        boolean upShutdownSent = false;
        boolean serverFinSent = false;
        long lastActiveAt;
        final ArrayDeque<ByteBuffer> upQueue = new ArrayDeque<>();
        final LinkedList<SentSegment> unacked = new LinkedList<>();
        final TreeMap<Integer, byte[]> outOfOrder = new TreeMap<>((a, b) -> a - b);

        TcpSession(SessionKey key, SocketChannel channel, int clientIsn, int serverIsn, boolean inspect, long now) {
            this.key = key;
            this.channel = channel;
            this.clientIsn = clientIsn;
            this.serverIsn = serverIsn;
            this.clientNextSeq = clientIsn + 1;
            this.serverSeq = serverIsn;
            this.clientAckedSeq = serverIsn;
            this.decoder = inspect ? new StrongholdWireDecoder() : null;
            this.lastActiveAt = now;
        }

        int inFlightBytes() {
            int total = 0;
            for (SentSegment s : unacked) {
                if (s.data != null) total += s.data.length;
            }
            return total;
        }
    }

    private static final class UdpSession {
        final SessionKey key;
        final DatagramChannel channel;
        SelectionKey selectionKey;
        long lastActiveAt;
        UdpSession(SessionKey key, DatagramChannel channel, long now) {
            this.key = key; this.channel = channel; this.lastActiveAt = now;
        }
    }
}
