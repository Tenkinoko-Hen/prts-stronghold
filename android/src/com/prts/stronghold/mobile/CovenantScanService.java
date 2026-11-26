package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.*;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.*;

/**
 * 单次 MediaProjection 授权复用引擎：
 * - 后台 HandlerThread + 原生 copyPixelsFromBuffer（毫秒级读帧，不卡 UI 线程）
 * - 开局盟约识别（区域裁剪 + 形近字容错 + 左侧单字放大补扫）→ 识别完毕后保持热待机
 * - 同局内免二次授权直接切换「回合自动同步」或「商店刷牌速查」
 * 截图只在内存中即时处理并回收，不落盘、不上传。
 */
public class CovenantScanService extends Service {
    private static volatile CovenantScanService active;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private HandlerThread workerThread;
    private Handler workerHandler;

    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private TextRecognizer recognizer;

    private volatile boolean busy;
    private volatile boolean finished;
    private volatile long lastFrame;
    private int captureWidth, captureHeight;

    private volatile String activeMode = "standby"; // covenant | round | standby
    private volatile String scanId = "";

    private final RoundDetector roundDetector = new RoundDetector();
    private long roundGeneration = -1;

    private final Runnable covenantTimeout = () -> {
        if (!finished && "covenant".equals(activeMode)) {
            finishCovenantMode("识别已结束；未读全时可补录或重试", false);
        }
    };
    private final Runnable roundCalibrateTimeout = () -> {
        if (!finished && "round".equals(activeMode) && RoundScanState.is("capturing")) {
            RoundScanState.stop("等待游戏画面超时，请重新开启回合同步");
            enterStandbyMode();
        }
    };

    static boolean hasActiveProjection() {
        CovenantScanService s = active;
        return s != null && s.projection != null && !s.finished;
    }

    static boolean isRoundMode() {
        CovenantScanService s = active;
        return s != null && !s.finished && "round".equals(s.activeMode);
    }

    static boolean isCovenantMode() {
        CovenantScanService s = active;
        return s != null && !s.finished && "covenant".equals(s.activeMode);
    }

    static void stopActive() {
        CovenantScanService s = active;
        if (s != null) s.shutdown("屏幕共享已停止", false);
    }

    static void stopRoundKeepProjection() {
        CovenantScanService s = active;
        if (s != null && !s.finished && "round".equals(s.activeMode)) {
            s.enterStandbyMode();
        }
    }

    static boolean switchToCovenant(String nextScanId) {
        CovenantScanService s = active;
        if (s == null || s.projection == null || s.finished) return false;
        s.mainHandler.post(() -> s.activateCovenantMode(nextScanId));
        return true;
    }

    static boolean switchToRound(String nextScanId) {
        CovenantScanService s = active;
        if (s == null || s.projection == null || s.finished) return false;
        s.mainHandler.post(() -> s.activateRoundMode(nextScanId));
        return true;
    }

    @Override public void onCreate() {
        super.onCreate();
        active = this;
        workerThread = new HandlerThread("prts-ocr-worker");
        workerThread.start();
        workerHandler = new Handler(workerThread.getLooper());
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            shutdown("已停止屏幕共享", false);
            return START_NOT_STICKY;
        }
        String reqScanId = intent == null ? null : intent.getStringExtra("scanId");
        String reqMode = intent == null ? null : intent.getStringExtra("mode");
        if (reqMode == null || reqMode.isEmpty()) {
            reqMode = (intent != null && intent.getBooleanExtra("roundMode", false)) ? "round" : "covenant";
        }

        if (projection != null && !finished) {
            if ("round".equals(reqMode)) activateRoundMode(reqScanId);
            else activateCovenantMode(reqScanId);
            return START_NOT_STICKY;
        }

        boolean validPending = "round".equals(reqMode)
            ? (RoundScanState.matches(reqScanId) && RoundScanState.is("permission"))
            : (CovenantScanState.matches(reqScanId) && CovenantScanState.permissionPending());
        if (!validPending) { stopSelf(); return START_NOT_STICKY; }

        try {
            updateNotification(reqMode);
            recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
            Intent data = intent.getParcelableExtra("data");
            if (data == null) throw new IllegalArgumentException("Missing capture consent");
            projection = getSystemService(MediaProjectionManager.class).getMediaProjection(intent.getIntExtra("resultCode", 0), data);
            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() { shutdown("系统已结束屏幕共享；可重新识别", false); }
                @Override public void onCapturedContentResize(int width, int height) {
                    if (display != null && !finished) {
                        try { resize(width, height); }
                        catch (RuntimeException error) { shutdown("屏幕尺寸已改变，请重新识别", true); }
                    }
                }
            }, mainHandler);

            DisplayMetrics metrics = new DisplayMetrics();
            getSystemService(WindowManager.class).getDefaultDisplay().getRealMetrics(metrics);
            createReader(metrics.widthPixels, metrics.heightPixels);
            display = projection.createVirtualDisplay(
                getString(R.string.app_name), captureWidth, captureHeight, metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, mainHandler
            );

            if ("round".equals(reqMode)) activateRoundMode(reqScanId);
            else activateCovenantMode(reqScanId);
        } catch (RuntimeException error) {
            failMode(reqMode, "识别未能启动，请重新授权屏幕共享");
            shutdown("识别未能启动", true);
        }
        return START_NOT_STICKY;
    }

    private void updateNotification(String mode) {
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel("prts_scan", "屏幕识别与同步", NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop = PendingIntent.getService(this, 10, new Intent(this, CovenantScanService.class).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE);
        String title;
        String text;
        if ("covenant".equals(mode)) {
            title = "正在识别盟约 Ban";
            text = "停留本局盟约总览，约 1 秒自动完成；点此停止";
        } else if ("round".equals(mode)) {
            title = "回合自动同步中";
            text = "已复用本局屏幕共享自动跟进回合；点此停止共享";
        } else {
            title = "PRTS 屏幕共享待命中";
            text = "本局可免二次授权直接开启回合同步；点此关闭共享";
        }
        Notification notice = new Notification.Builder(this, "prts_scan")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(stop)
            .setOngoing(true)
            .addAction(new Notification.Action.Builder(R.drawable.ic_notification, "停止共享", stop).build())
            .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(2, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(2, notice);
    }

    private void activateCovenantMode(String nextScanId) {
        if (finished || projection == null) return;
        mainHandler.removeCallbacks(covenantTimeout);
        mainHandler.removeCallbacks(roundCalibrateTimeout);
        scanId = nextScanId != null ? nextScanId : "";
        activeMode = "covenant";
        lastFrame = 0;
        CovenantScanState.set("scanning", "请停留本局盟约总览（核心 + 附加盟约），马上完成…");
        OverlayService.hideForScan();
        updateNotification("covenant");
        mainHandler.postDelayed(covenantTimeout, 30000);
    }

    private void activateRoundMode(String nextScanId) {
        if (finished || projection == null) return;
        mainHandler.removeCallbacks(covenantTimeout);
        mainHandler.removeCallbacks(roundCalibrateTimeout);
        scanId = nextScanId != null ? nextScanId : "";
        activeMode = "round";
        lastFrame = 0;
        roundDetector.reset();
        RoundScanState.set("capturing", "正在截取游戏画面用于框选回合数字…");
        OverlayService.hideForRound();
        updateNotification("round");
        mainHandler.postDelayed(roundCalibrateTimeout, 30000);
    }

    private void finishCovenantMode(String message, boolean error) {
        mainHandler.removeCallbacks(covenantTimeout);
        if (CovenantScanState.matches(scanId)) {
            if (error) CovenantScanState.set("error", message);
            else CovenantScanState.finish(message);
        }
        // 保持 MediaProjection 热待机，同局后续开启回合同步无需二次弹窗授权
        enterStandbyMode();
        OverlayService.showAfterScan();
    }

    private void enterStandbyMode() {
        mainHandler.removeCallbacks(covenantTimeout);
        mainHandler.removeCallbacks(roundCalibrateTimeout);
        activeMode = "standby";
        if (!finished && projection != null) {
            updateNotification("standby");
        }
    }

    private void failMode(String mode, String message) {
        if ("round".equals(mode)) RoundScanState.stop(message);
        else CovenantScanState.set("error", message);
    }

    private void createReader(int width, int height) {
        float scale = Math.min(1f, 1920f / Math.max(width, height));
        captureWidth = Math.max(1, Math.round(width * scale));
        captureHeight = Math.max(1, Math.round(height * scale));
        reader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2);
        reader.setOnImageAvailableListener(this::onFrameAvailable, workerHandler);
    }

    private void resize(int width, int height) {
        float scale = Math.min(1f, 1920f / Math.max(width, height));
        if (Math.round(width * scale) == captureWidth && Math.round(height * scale) == captureHeight) return;
        display.setSurface(null);
        if (reader != null) reader.close();
        createReader(width, height);
        display.resize(captureWidth, captureHeight, getResources().getDisplayMetrics().densityDpi);
        display.setSurface(reader.getSurface());
        if ("round".equals(activeMode)) {
            RoundScanState.set("capturing", "屏幕尺寸已改变，请重新框选回合数字");
            roundDetector.reset();
            OverlayService.hideForRound();
        }
    }

    /** 使用原生 copyPixelsFromBuffer 毫秒级转换 RGBA Image 到 Bitmap（后台线程执行，零 UI 卡顿）。 */
    private static Bitmap imageToBitmap(Image frame) {
        Image.Plane plane = frame.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int width = frame.getWidth();
        int height = frame.getHeight();
        int pixelStride = plane.getPixelStride();
        int rowStride = plane.getRowStride();
        int rowPadding = rowStride - pixelStride * width;
        if (pixelStride == 4 && rowPadding >= 0 && rowPadding % 4 == 0) {
            int paddedWidth = width + rowPadding / 4;
            Bitmap padded = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888);
            buffer.rewind();
            padded.copyPixelsFromBuffer(buffer);
            if (paddedWidth == width) return padded;
            Bitmap cropped = Bitmap.createBitmap(padded, 0, 0, width, height);
            padded.recycle();
            return cropped;
        }
        int[] pixels = new int[width * height];
        for (int y = 0; y < height; y++) {
            int rowOff = y * rowStride;
            int dstOff = y * width;
            for (int x = 0; x < width; x++) {
                int off = rowOff + x * pixelStride;
                pixels[dstOff + x] = 0xff000000
                    | ((buffer.get(off) & 255) << 16)
                    | ((buffer.get(off + 1) & 255) << 8)
                    | (buffer.get(off + 2) & 255);
            }
        }
        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888);
    }

    private void onFrameAvailable(ImageReader source) {
        if (finished) return;
        String mode = activeMode;
        if ("standby".equals(mode)) {
            // 排空队列但不分配任何 Bitmap，待机 CPU 几乎为零
            try (Image ignored = source.acquireLatestImage()) {} catch (RuntimeException ignored) {}
            return;
        }
        Bitmap bitmap = null;
        try (Image frame = source.acquireLatestImage()) {
            if (frame == null || busy) return;
            long now = SystemClock.elapsedRealtime();
            long minInterval = "round".equals(mode) ? 900 : 260;
            if (now - lastFrame < minInterval) return;

            if ("round".equals(mode)) {
                if (MainActivity.isVisible() || (!RoundScanState.is("capturing") && !RoundScanState.is("scanning"))) {
                    roundDetector.reset();
                    return;
                }
                double[] region = RoundScanState.region();
                if (RoundScanState.is("scanning") && (region == null || OverlayService.overlapsNormalizedRect(region))) {
                    roundDetector.reset();
                    return;
                }
            }

            lastFrame = now;
            bitmap = imageToBitmap(frame);
            if ("round".equals(mode)) {
                processRoundFrame(bitmap);
                return;
            }
            processCovenantFrame(bitmap);
        } catch (RuntimeException error) {
            if (bitmap != null && !busy) bitmap.recycle();
        }
    }

    private void processCovenantFrame(Bitmap full) {
        final String currentScanId = scanId;
        int fullW = full.getWidth();
        int fullH = full.getHeight();
        // 保留顶部左上角模式标题（极速模拟 / 规程等级15）与屏幕底缘小字，仅裁掉右侧地图预览区域
        int cropX = 0;
        int cropY = 0;
        int cropW = Math.max(1, Math.min(fullW, Math.round(fullW * 0.78f)));
        int cropH = Math.max(1, fullH);
        Bitmap cropped = Bitmap.createBitmap(full, cropX, cropY, cropW, cropH);
        final int[] fullPixels = new int[fullW * fullH];
        full.getPixels(fullPixels, 0, fullW, 0, 0, fullW, fullH);
        full.recycle();

        // 若裁剪图宽度偏小，轻度放大以保证中文小字（如单字「炎」）清晰
        final float scale = cropW < 1400 ? Math.min(1.6f, 1400f / cropW) : 1.0f;
        final Bitmap ocrBitmap;
        if (scale > 1.05f) {
            ocrBitmap = Bitmap.createScaledBitmap(cropped, Math.round(cropW * scale), Math.round(cropH * scale), true);
            cropped.recycle();
        } else {
            ocrBitmap = cropped;
        }

        busy = true;
        recognizer.process(InputImage.fromBitmap(ocrBitmap, 0))
            .addOnSuccessListener(workerHandler::post, text -> {
                try {
                    if (finished || !"covenant".equals(activeMode) || !CovenantScanState.matches(currentScanId)) return;
                    ExtractionResult primary = extractCovenantsFromText(text, fullPixels, fullW, fullH, cropX, cropY, scale);
                    Map<String, Integer> found = primary.found;
                    boolean quickReady = "quick".equals(primary.modeHint) && countCore(found) >= 8 && countSub(found) >= 10;
                    // 如果核心盟约区域已识别出大部但缺了最左列单字「炎」/「灵巧」/「绝技」，对最左 24% 窄条做一次 2x 放大补扫
                    if (!quickReady && found.size() >= 10 && (!found.containsKey("炎") || !found.containsKey("灵巧") || !found.containsKey("绝技"))) {
                        runLeftStripRescue(fullPixels, fullW, fullH, found, primary.modeHint, currentScanId);
                        return;
                    }
                    applyCovenantObservation(found, currentScanId, primary.modeHint);
                } finally {
                    ocrBitmap.recycle();
                    if (!finished && !pendingRescue) busy = false;
                }
            })
            .addOnFailureListener(workerHandler::post, error -> {
                ocrBitmap.recycle();
                busy = false;
            });
    }

    private volatile boolean pendingRescue = false;

    private static int countCore(Map<String, Integer> found) {
        int c = 0;
        for (String k : found.keySet()) {
            if (CovenantDetector.CORE_NAMES.contains(k)) c++;
        }
        return c;
    }

    private static int countSub(Map<String, Integer> found) {
        int c = 0;
        for (String k : found.keySet()) {
            if (CovenantDetector.SUB_NAMES.contains(k)) c++;
        }
        return c;
    }

    private void runLeftStripRescue(int[] fullPixels, int fullW, int fullH, Map<String, Integer> baseFound, String baseModeHint, String currentScanId) {
        int leftW = Math.max(40, Math.round(fullW * 0.24f));
        int leftY = 0;
        int leftH = Math.max(40, fullH);
        Bitmap stripRaw = Bitmap.createBitmap(fullPixels, leftY * fullW, fullW, leftW, leftH, Bitmap.Config.ARGB_8888);
        int pad = 36;
        float up = 2.0f;
        Bitmap padded = Bitmap.createBitmap(Math.round(leftW * up) + pad * 2, Math.round(leftH * up), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(padded);
        canvas.drawColor(Color.rgb(18, 22, 24));
        canvas.drawBitmap(stripRaw, null, new Rect(pad, 0, pad + Math.round(leftW * up), Math.round(leftH * up)), null);
        stripRaw.recycle();

        pendingRescue = true;
        recognizer.process(InputImage.fromBitmap(padded, 0))
            .addOnSuccessListener(workerHandler::post, rescueText -> {
                try {
                    if (!finished && "covenant".equals(activeMode) && CovenantScanState.matches(currentScanId)) {
                        ExtractionResult extra = extractCovenantsFromText(rescueText, fullPixels, fullW, fullH, -Math.round(pad / up), leftY, up);
                        for (Map.Entry<String, Integer> e : extra.found.entrySet()) {
                            if (!baseFound.containsKey(e.getKey())) baseFound.put(e.getKey(), e.getValue());
                        }
                        String modeHint = (baseModeHint != null && !baseModeHint.isEmpty()) ? baseModeHint : extra.modeHint;
                        applyCovenantObservation(baseFound, currentScanId, modeHint);
                    }
                } finally {
                    padded.recycle();
                    pendingRescue = false;
                    busy = false;
                }
            })
            .addOnFailureListener(workerHandler::post, error -> {
                padded.recycle();
                pendingRescue = false;
                busy = false;
            });
    }

    private void applyCovenantObservation(Map<String, Integer> found, String currentScanId, String modeHint) {
        if (found.isEmpty()) return;
        boolean completed = CovenantScanState.observe(found, modeHint);
        if (completed) {
            final String label = CovenantScanState.currentModeLabel();
            final String doneMsg = "极速模拟".equals(label)
                ? "极速模拟 18 项盟约已确认（其余 8 项自动标记受限）"
                : ("单人模拟".equals(label)
                    ? "单人模拟 26 项盟约已确认（本局共享待命，可直接开回合同步）"
                    : "26 项盟约已确认（本局共享待命，可直接开回合同步）");
            mainHandler.post(() -> {
                if (!finished && "covenant".equals(activeMode) && CovenantScanState.matches(currentScanId)) {
                    finishCovenantMode(doneMsg, false);
                }
            });
        }
    }

    private static final class ExtractionResult {
        final Map<String, Integer> found;
        final String modeHint;
        ExtractionResult(Map<String, Integer> found, String modeHint) {
            this.found = found;
            this.modeHint = modeHint;
        }
    }

    private ExtractionResult extractCovenantsFromText(
        Text text, int[] pixels, int fullW, int fullH, int originX, int originY, float scale
    ) {
        Map<String, Integer> found = new HashMap<>();
        String page = text.getText().replaceAll("\\s+", "");
        String modeHint = "";
        if (page.contains("极速模拟") || page.contains("极速")) {
            modeHint = "quick";
        } else if (page.contains("规程等级") || page.contains("单人模拟") || page.contains("选择一组")) {
            modeHint = "solo";
        }
        boolean headerHint = page.contains("核心盟约") || page.contains("附加盟约") || page.contains("确认本局")
            || page.contains("极速模拟") || page.contains("规程等级") || page.contains("单人模拟")
            || page.contains("选择一组") || page.contains("激活的盟约");
        Map<String, Integer> candidate = new HashMap<>();
        List<CovenantDetector.SubLabelBox> subHits = new ArrayList<>();
        int coreSeen = 0;
        double coreLeftCx = Double.NaN;

        for (Text.TextBlock block : text.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                List<CharBox> chars = new ArrayList<>();
                for (Text.Element element : line.getElements()) {
                    if (!element.getSymbols().isEmpty()) {
                        for (Text.Symbol sym : element.getSymbols()) addCharBoxes(chars, sym.getText(), sym.getBoundingBox(), originX, originY, scale);
                    } else {
                        addCharBoxes(chars, element.getText(), element.getBoundingBox(), originX, originY, scale);
                    }
                }
                if (chars.isEmpty()) continue;
                chars.sort(Comparator.comparingInt(a -> a.left));

                // 1) 按水平间距拆成词簇，支持形近字容错（移植 PC 端高准率逻辑）
                List<List<CharBox>> clusters = new ArrayList<>();
                for (CharBox cb : chars) {
                    if (!clusters.isEmpty()) {
                        List<CharBox> prev = clusters.get(clusters.size() - 1);
                        CharBox last = prev.get(prev.size() - 1);
                        int h = Math.max(8, cb.bottom - cb.top);
                        if (Math.abs(cb.top - prev.get(0).top) <= h * 0.7 && cb.left - last.right <= h * 1.45) {
                            prev.add(cb);
                            continue;
                        }
                    }
                    List<CharBox> fresh = new ArrayList<>();
                    fresh.add(cb);
                    clusters.add(fresh);
                }
                for (List<CharBox> cluster : clusters) {
                    StringBuilder sb = new StringBuilder();
                    int l = Integer.MAX_VALUE, t = Integer.MAX_VALUE, r = Integer.MIN_VALUE, b = Integer.MIN_VALUE;
                    for (CharBox cb : cluster) {
                        sb.append(cb.ch);
                        if (cb.left < l) l = cb.left;
                        if (cb.top < t) t = cb.top;
                        if (cb.right > r) r = cb.right;
                        if (cb.bottom > b) b = cb.bottom;
                    }
                    String matched = CovenantDetector.matchToken(sb.toString());
                    if (matched != null && !candidate.containsKey(matched)) {
                        int state = CovenantDetector.classify(pixels, fullW, fullH, l, t, r, b);
                        if (state != 0) {
                            candidate.put(matched, state);
                            double cx = (l + r) / 2.0;
                            if (CovenantDetector.CORE_NAMES.contains(matched)) {
                                coreSeen++;
                                coreLeftCx = Double.isNaN(coreLeftCx) ? cx : Math.min(coreLeftCx, cx);
                            } else if (CovenantDetector.SUB_NAMES.contains(matched)) {
                                subHits.add(new CovenantDetector.SubLabelBox(matched, cx, t, b - t));
                            }
                        }
                    }
                }

                // 2) 整行子串兜底匹配（处理两个相邻词被 MLKit 合并成一行无空隙的情况）
                StringBuilder whole = new StringBuilder();
                for (CharBox cb : chars) whole.append(cb.ch);
                String lineStr = whole.toString();
                for (String name : CovenantDetector.NAMES) {
                    if (candidate.containsKey(name)) continue;
                    int idx = lineStr.indexOf(name);
                    if (idx < 0 || idx + name.length() > chars.size()) continue;
                    int l = Integer.MAX_VALUE, t = Integer.MAX_VALUE, r = Integer.MIN_VALUE, b = Integer.MIN_VALUE;
                    for (int i = idx; i < idx + name.length(); i++) {
                        CharBox cb = chars.get(i);
                        if (cb.left < l) l = cb.left;
                        if (cb.top < t) t = cb.top;
                        if (cb.right > r) r = cb.right;
                        if (cb.bottom > b) b = cb.bottom;
                    }
                    int state = CovenantDetector.classify(pixels, fullW, fullH, l, t, r, b);
                    if (state != 0) {
                        candidate.put(name, state);
                        double cx = (l + r) / 2.0;
                        if (CovenantDetector.CORE_NAMES.contains(name)) {
                            coreSeen++;
                            coreLeftCx = Double.isNaN(coreLeftCx) ? cx : Math.min(coreLeftCx, cx);
                        } else if (CovenantDetector.SUB_NAMES.contains(name)) {
                            subHits.add(new CovenantDetector.SubLabelBox(name, cx, t, b - t));
                        }
                    }
                }
            }
        }
        // 允许带有标题或本帧已命中 >= 4 个盟约徽章（补扫窄条可能不含标题字）
        if (headerHint || candidate.size() >= 4 || originX < 0) {
            if (originX >= 0 && !"quick".equals(modeHint) && ("solo".equals(modeHint) || coreSeen >= 9) && coreSeen >= 8) {
                List<String> missingSub = new ArrayList<>();
                for (String sub : CovenantDetector.SUB_NAMES) {
                    if (!candidate.containsKey(sub)) missingSub.add(sub);
                }
                if (missingSub.size() == 6) {
                    Map<String, Integer> inferred = CovenantDetector.probeBottomSixSubBadges(
                        pixels, fullW, fullH, subHits, missingSub, coreLeftCx
                    );
                    if (!inferred.isEmpty()) {
                        candidate.putAll(inferred);
                    }
                }
            }
            found.putAll(candidate);
        }
        return new ExtractionResult(found, modeHint);
    }

    private static final class CharBox {
        final char ch;
        final int left, top, right, bottom;
        CharBox(char ch, int left, int top, int right, int bottom) {
            this.ch = ch; this.left = left; this.top = top; this.right = right; this.bottom = bottom;
        }
    }

    private static void addCharBoxes(List<CharBox> out, String value, Rect box, int originX, int originY, float scale) {
        if (box == null || value == null || value.isEmpty()) return;
        int len = value.length();
        float inv = 1.0f / scale;
        for (int i = 0; i < len; i++) {
            char c = value.charAt(i);
            if (Character.isWhitespace(c)) continue;
            int l = originX + Math.round((box.left + box.width() * i / (float) len) * inv);
            int r = originX + Math.round((box.left + box.width() * (i + 1) / (float) len) * inv);
            int t = originY + Math.round(box.top * inv);
            int b = originY + Math.round(box.bottom * inv);
            out.add(new CharBox(c, l, t, r, b));
        }
    }

    private void processRoundFrame(Bitmap bitmap) {
        if (RoundScanState.is("capturing")) {
            mainHandler.removeCallbacks(roundCalibrateTimeout);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 78, bytes);
            bitmap.recycle();
            RoundScanState.calibrate(Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
            mainHandler.post(OverlayService::showAfterScan);
            return;
        }
        double[] region = RoundScanState.region();
        if (region == null) { bitmap.recycle(); return; }
        final String currentScanId = scanId;
        final long generation = RoundScanState.generation();
        if (roundGeneration != generation) { roundDetector.reset(); roundGeneration = generation; }
        int x = Math.max(0, Math.min(bitmap.getWidth() - 1, (int) (region[0] * bitmap.getWidth())));
        int y = Math.max(0, Math.min(bitmap.getHeight() - 1, (int) (region[1] * bitmap.getHeight())));
        int width = Math.max(1, Math.min(bitmap.getWidth() - x, (int) ((region[2] - region[0]) * bitmap.getWidth())));
        int height = Math.max(1, Math.min(bitmap.getHeight() - y, (int) ((region[3] - region[1]) * bitmap.getHeight())));
        Bitmap cropped = Bitmap.createBitmap(bitmap, x, y, width, height);
        if (cropped != bitmap) bitmap.recycle();
        float scale = Math.min(4f, 120f / height);
        Bitmap input = Bitmap.createScaledBitmap(cropped, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), true);
        if (input != cropped) cropped.recycle();

        busy = true;
        recognizer.process(InputImage.fromBitmap(input, 0))
            .addOnSuccessListener(workerHandler::post, text -> {
                if (!finished && "round".equals(activeMode) && RoundScanState.matches(currentScanId)
                    && !MainActivity.isVisible() && RoundScanState.generation() == generation) {
                    int observed = roundDetector.observe(text.getText(), SystemClock.elapsedRealtime());
                    if (RoundScanState.observe(observed, generation)) {
                        SessionBridge.observe(this, observed);
                        OverlayService.notifyObservedRound(observed);
                    }
                } else {
                    roundDetector.reset();
                }
            })
            .addOnFailureListener(workerHandler::post, error -> roundDetector.reset())
            .addOnCompleteListener(workerHandler::post, task -> { input.recycle(); busy = false; });
    }

    private void shutdown(String message, boolean error) {
        if (finished) return;
        finished = true;
        String mode = activeMode;
        if ("round".equals(mode) && RoundScanState.matches(scanId)) RoundScanState.stop(message);
        else if ("covenant".equals(mode) && CovenantScanState.matches(scanId)) {
            if (error) CovenantScanState.set("error", message);
            else CovenantScanState.finish(message);
            mainHandler.post(OverlayService::showAfterScan);
        }
        release();
        stopSelf();
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (Build.VERSION.SDK_INT >= 34 || display == null || finished) return;
        try {
            DisplayMetrics metrics = new DisplayMetrics();
            getSystemService(WindowManager.class).getDefaultDisplay().getRealMetrics(metrics);
            resize(metrics.widthPixels, metrics.heightPixels);
        } catch (RuntimeException error) {
            shutdown("屏幕方向已改变，请重新识别", true);
        }
    }

    private void release() {
        mainHandler.removeCallbacks(covenantTimeout);
        mainHandler.removeCallbacks(roundCalibrateTimeout);
        if (display != null) { display.release(); display = null; }
        if (reader != null) { reader.close(); reader = null; }
        if (projection != null) { MediaProjection old = projection; projection = null; old.stop(); }
        if (recognizer != null) { recognizer.close(); recognizer = null; }
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override public void onDestroy() {
        if (!finished) {
            finished = true;
            if ("round".equals(activeMode) && RoundScanState.matches(scanId)) RoundScanState.stop("屏幕共享已停止");
            else if ("covenant".equals(activeMode) && CovenantScanState.matches(scanId)) CovenantScanState.finish("识别已停止，可重新扫描");
        }
        release();
        if (workerThread != null) {
            workerThread.quitSafely();
            workerThread = null;
        }
        if (active == this) active = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
