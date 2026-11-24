package com.prts.stronghold.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

final class LanSyncBridge {
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final int SOCKET_TIMEOUT_MS = 2200;
    private static final Object LOCK = new Object();

    private static volatile boolean active = false;
    private static volatile int generation = 0;
    private static String status = "idle";
    private static String host = "";
    private static int port = 39527;
    private static String error = "";
    private static long lastSyncAt = 0L;
    private static String peerProduct = "";
    private static String latestPayloadJson = "null";

    private final Context context;

    LanSyncBridge(Context context) {
        this.context = context.getApplicationContext();
        synchronized (LOCK) {
            if (host.isEmpty()) {
                SharedPreferences prefs = prefs(this.context);
                host = prefs.getString("host", "");
                port = prefs.getInt("port", 39527);
            }
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("lan-sync", Context.MODE_PRIVATE);
    }

    static boolean isPrivateLanIpv4(String rawIp) {
        if (rawIp == null) return false;
        String ip = rawIp.trim();
        if ("127.0.0.1".equals(ip)) return true;
        String[] parts = ip.split("\\.");
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        for (int i = 0; i < 4; i++) {
            String part = parts[i];
            if (part.isEmpty() || part.length() > 3) return false;
            for (int j = 0; j < part.length(); j++) {
                char ch = part.charAt(j);
                if (ch < '0' || ch > '9') return false;
            }
            int val = Integer.parseInt(part);
            if (val < 0 || val > 255) return false;
            octets[i] = val;
        }
        if (octets[0] == 10) return true;
        if (octets[0] == 192 && octets[1] == 168) return true;
        if (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31) return true;
        return octets[0] == 100 && octets[1] >= 64 && octets[1] <= 127;
    }

    static int[] parseHostPort(String rawHostPort, String[] outHost) {
        if (rawHostPort == null) return null;
        String trimmed = rawHostPort.trim();
        if (trimmed.startsWith("http://")) trimmed = trimmed.substring(7);
        int slash = trimmed.indexOf('/');
        if (slash >= 0) trimmed = trimmed.substring(0, slash);
        int colon = trimmed.lastIndexOf(':');
        String parsedHost = colon > 0 ? trimmed.substring(0, colon).trim() : trimmed;
        int parsedPort = 39527;
        if (colon > 0 && colon + 1 < trimmed.length()) {
            try {
                parsedPort = Integer.parseInt(trimmed.substring(colon + 1).trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        if (parsedPort < 1024 || parsedPort > 65535 || !isPrivateLanIpv4(parsedHost)) {
            return null;
        }
        outHost[0] = parsedHost;
        return new int[]{parsedPort};
    }

    static String extractHttpBody(byte[] raw, int length) {
        if (raw == null || length <= 0) return null;
        int headerEnd = -1;
        for (int i = 0; i + 3 < length; i++) {
            if (raw[i] == '\r' && raw[i + 1] == '\n' && raw[i + 2] == '\r' && raw[i + 3] == '\n') {
                headerEnd = i + 4;
                break;
            }
        }
        if (headerEnd < 0 || headerEnd > length) return null;
        String head = new String(raw, 0, headerEnd, StandardCharsets.US_ASCII);
        if (!head.startsWith("HTTP/1.1 200") && !head.startsWith("HTTP/1.0 200")) {
            String bodyErr = new String(raw, headerEnd, length - headerEnd, StandardCharsets.UTF_8).trim();
            return bodyErr.isEmpty() ? null : bodyErr;
        }
        return new String(raw, headerEnd, length - headerEnd, StandardCharsets.UTF_8);
    }

    private static String fetchOverLanSocket(String targetHost, int targetPort, String pathAndQuery) throws Exception {
        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(targetHost, targetPort), SOCKET_TIMEOUT_MS);
            socket.setSoTimeout(SOCKET_TIMEOUT_MS);
            String req = "GET " + pathAndQuery + " HTTP/1.1\r\n"
                + "Host: " + targetHost + ":" + targetPort + "\r\n"
                + "Accept: application/json\r\n"
                + "Connection: close\r\n\r\n";
            OutputStream out = socket.getOutputStream();
            out.write(req.getBytes(StandardCharsets.US_ASCII));
            out.flush();

            InputStream in = socket.getInputStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream(4096);
            byte[] chunk = new byte[4096];
            int n;
            while ((n = in.read(chunk)) != -1) {
                if (buffer.size() + n > MAX_RESPONSE_BYTES) {
                    throw new IllegalStateException("局域网响应超出安全体积上限");
                }
                buffer.write(chunk, 0, n);
            }
            byte[] bytes = buffer.toByteArray();
            return extractHttpBody(bytes, bytes.length);
        } finally {
            try { socket.close(); } catch (Exception ignored) {}
        }
    }

    @JavascriptInterface
    public String getState() {
        synchronized (LOCK) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("active", active);
                obj.put("status", status);
                obj.put("host", host);
                obj.put("port", port);
                obj.put("error", error);
                obj.put("lastSyncAt", lastSyncAt);
                obj.put("peerProduct", peerProduct);
                if (!"null".equals(latestPayloadJson)) {
                    obj.put("payload", new JSONObject(latestPayloadJson));
                } else {
                    obj.put("payload", JSONObject.NULL);
                }
                return obj.toString();
            } catch (Exception e) {
                return "{\"active\":false,\"status\":\"error\",\"error\":\"状态序列化失败\"}";
            }
        }
    }

    @JavascriptInterface
    public boolean connect(String rawHostPort, String rawPin) {
        String pin = rawPin == null ? "" : rawPin.trim();
        if (pin.length() != 4) {
            synchronized (LOCK) {
                status = "error";
                error = "请输入电脑端显示的 4 位数字配对码";
            }
            return false;
        }
        for (int i = 0; i < 4; i++) {
            char c = pin.charAt(i);
            if (c < '0' || c > '9') {
                synchronized (LOCK) {
                    status = "error";
                    error = "配对码必须为 4 位纯数字";
                }
                return false;
            }
        }
        String[] parsedHost = new String[1];
        int[] parsedPort = parseHostPort(rawHostPort, parsedHost);
        if (parsedPort == null) {
            synchronized (LOCK) {
                status = "error";
                error = "仅允许连接同一局域网私有 IPv4 地址（如 192.168.x.x:39527）";
            }
            return false;
        }

        final String targetHost = parsedHost[0];
        final int targetPort = parsedPort[0];
        final int runGen;
        synchronized (LOCK) {
            generation += 1;
            runGen = generation;
            active = true;
            status = "connecting";
            host = targetHost;
            port = targetPort;
            error = "";
            prefs(context).edit().putString("host", targetHost).putInt("port", targetPort).apply();
        }

        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                pollLoop(runGen, targetHost, targetPort, pin);
            }
        }, "PRTS-LanSync");
        worker.setDaemon(true);
        worker.start();
        return true;
    }

    @JavascriptInterface
    public void disconnect() {
        synchronized (LOCK) {
            generation += 1;
            active = false;
            status = "idle";
            error = "";
            latestPayloadJson = "null";
        }
    }

    private static void pollLoop(int runGen, String targetHost, int targetPort, String pin) {
        int consecutiveErrors = 0;
        while (true) {
            synchronized (LOCK) {
                if (!active || generation != runGen) return;
            }
            try {
                String body = fetchOverLanSocket(targetHost, targetPort, "/api/v1/state?pin=" + pin);
                if (body == null) {
                    throw new IllegalStateException("未收到有效战报响应");
                }
                JSONObject json = new JSONObject(body);
                if (!json.optBoolean("ok", false)) {
                    String msg = json.optString("error", "配对校验失败");
                    synchronized (LOCK) {
                        if (generation != runGen) return;
                        active = false;
                        status = "error";
                        error = msg;
                    }
                    return;
                }
                consecutiveErrors = 0;
                long now = System.currentTimeMillis();
                String prodName = json.optString("productName", "PC");
                synchronized (LOCK) {
                    if (generation != runGen) return;
                    status = "connected";
                    error = "";
                    lastSyncAt = now;
                    peerProduct = prodName;
                    latestPayloadJson = json.toString();
                }
                pushOverlayHint(json);
            } catch (Exception ex) {
                consecutiveErrors += 1;
                synchronized (LOCK) {
                    if (generation != runGen) return;
                    if (consecutiveErrors >= 6) {
                        active = false;
                        status = "error";
                        error = "连接电脑端超时，请确认同一 Wi-Fi 且电脑端已开启无线副屏";
                        return;
                    }
                    status = "reconnecting";
                    error = "正在重连电脑端…";
                }
            }
            try {
                Thread.sleep(1000L);
            } catch (InterruptedException interrupted) {
                return;
            }
        }
    }

    private static void pushOverlayHint(JSONObject stateJson) {
        try {
            JSONObject report = stateJson.optJSONObject("report");
            JSONObject guide = stateJson.optJSONObject("guide");
            int round = 0;
            if (report != null) {
                JSONObject capture = report.optJSONObject("capture");
                if (capture != null) round = capture.optInt("round", 0);
            }
            if (round <= 0 && guide != null) {
                round = guide.optInt("currentRound", 0);
            }
            String headline = guide != null ? guide.optString("compTitle", "") : "";
            String detail = guide != null ? guide.optString("paceTip", "") : "";
            if (report != null) {
                JSONObject tele = report.optJSONObject("telemetry");
                if (tele != null) {
                    JSONArray ops = tele.optJSONArray("operators");
                    if (ops != null && ops.length() > 0) {
                        StringBuilder sb = new StringBuilder();
                        int limit = Math.min(3, ops.length());
                        for (int i = 0; i < limit; i++) {
                            JSONObject op = ops.getJSONObject(i);
                            if (i > 0) sb.append(" · ");
                            sb.append(op.optString("name", "干员"));
                            if (!op.isNull("active_dps")) {
                                sb.append(" ").append(Math.round(op.optDouble("active_dps", 0))).append("/s");
                            } else {
                                sb.append(" ").append(Math.round(op.optDouble("total_damage", 0)));
                            }
                        }
                        detail = sb.toString();
                        if (headline.isEmpty()) headline = "PC 实时算力同步";
                    }
                }
            }
            if (round > 0 || !detail.isEmpty()) {
                OverlayService.updateStripFromBridge(round, headline, detail);
            }
        } catch (Exception ignored) {}
    }
}
