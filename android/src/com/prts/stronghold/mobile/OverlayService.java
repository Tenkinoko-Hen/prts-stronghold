package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * PRTS 悬浮战术终端服务（v3.1）：
 * - 默认 FLAG_NOT_FOCUSABLE：展开侧边抽屉时底层《明日方舟》永不失焦，窗外点击 100% 直达游戏；
 * - 悬浮球快捷手势：单击展开抽屉 / 双击一键识别盟约 / 长按切顶部战术迷你条；
 * - 战术迷你条 v3.1：
 *   1. [跟打]：下回合/本回合出怪实机图标 + 数量 + 精简回合运营指令（点击折叠/展开）；
 *   2. [漏兜]：任意回合可切，内置 [累计 | 单回合] + ◀ Rxx ▶ 回合翻页，4 人彩色柱图直显漏/兜/逃 + 漏怪实机图标（无文字策略）；
 *   3. [DPS]：Boss 阶段自动切换，顶部 Boss 实机头像 + 实时血条 + 全队秒伤，主体 4 行 MMO 横向排行计量条（#1–#4 总伤/DPS/占比）；
 *   4. [穿透]：保留当前图标/图表半透明锁定防误触，右侧悬浮独立「解锁」小钮。
 */
public class OverlayService extends Service {
    private static volatile OverlayService active;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final String CHANNEL = "prts_floating_guide";
    private static final String PREFS = "prts_overlay_prefs";
    private static final float[] ALPHA_LEVELS = { 1.0f, 0.86f, 0.72f };

    // 来自前端攻略的状态
    private static int pendingRound = 0;
    private static int pendingTier = 0;
    private static int pendingPrevTier = 0;
    private static String pendingHeadline = "";
    private static String pendingGrabHint = "";
    private static String pendingProgress = "";
    private static String pendingBanWarning = "";
    private static String pendingLoadoutHint = "";
    private static String pendingDetail = "";

    // 来自免 Root 本机 VPN 抓包的实时结构化战报快照
    private static BattleCaptureState.TelemetrySnapshot liveTelemetry = null;

    private WindowManager manager;
    private TextView ball;
    private LinearLayout panel;
    private LinearLayout strip;

    // Top bar views
    private TextView stripPrevBtn;
    private TextView stripNextBtn;
    private TextView stripRoundBadge;
    private ImageView stripBossHeaderIcon;
    private TextView stripTitleView;
    private LinearLayout stripLeakScopeBox;
    private TextView stripScopeCumBtn;
    private TextView stripScopeRoundBtn;
    private LinearLayout stripLeakPills;
    private TextView stripLeakPillTotal;
    private TextView stripLeakPillAssist;
    private TextView stripLeakPillEscaped;
    private LinearLayout stripActions;
    private TextView stripScanBtn;
    private LinearLayout stripModeCapsule;
    private TextView stripTabDpsBtn;
    private TextView stripTabGuideBtn;
    private TextView stripTabLeakBtn;
    private TextView stripTabLogsBtn;
    private TextView stripTabWavesBtn;

    // Body E: 实时 Logs 流水（卫戍战报仪 Lite 专属毫秒级去重事件流）
    private LinearLayout logsContainer;
    private LinearLayout logsList;

    // Body A: 跟打（出怪图标 + 攻略正文）
    private LinearLayout guideContainer;
    private LinearLayout guideFocusRow;
    private View guideFocusAccent;
    private TextView guideFocusKey;
    private HorizontalScrollView guideEnemyScroll;
    private LinearLayout guideEnemyChips;
    private TextView guideAllWavesBtn;
    private TextView guideFocusFallbackVal;
    private TextView guideFocusProg;
    private TextView guideBodyView;

    // Body D: 全波次出怪总览（点「完整」展开 R01–R15 所有波次怪物与实机图标）
    private LinearLayout wavesContainer;
    private ScrollView wavesScroll;
    private LinearLayout wavesList;

    // Body B: 漏兜（4 人双轨 + 已激活盟约 + 未来两波怪潮预计 + 漏怪实机图标）
    private LinearLayout leakContainer;
    private LinearLayout leakGrid;
    private LinearLayout leakNextWavesBox;
    private LinearLayout leakFooterRow;
    private TextView leakFooterTag;
    private LinearLayout leakEnemyChips;

    // Body C: Boss MMO DPS 榜
    private LinearLayout dpsContainer;
    private FrameLayout bossHpTrack;
    private View bossHpFill;
    private View bossHpRest;
    private TextView bossHpLeftText;
    private TextView bossHpRightText;
    private LinearLayout bossRankList;

    private TextView unlockChip;
    private WebView web;
    private WindowManager.LayoutParams ballParams;
    private WindowManager.LayoutParams panelParams;
    private WindowManager.LayoutParams stripParams;
    private WindowManager.LayoutParams unlockParams;

    private volatile boolean expanded;
    private volatile boolean stripMode;
    private volatile boolean stripLocked;
    private String stripTab = "guide"; // "guide" | "leak" | "dps"
    private boolean leakCumulative = true;
    private int leakSelectedRound = 1;
    private int autoSwitchedBossRound = 0;
    private boolean stripBodyCompact = false;
    private boolean compactPanel = true;
    private boolean panelFocusable = false;
    private int alphaIndex = 0;
    private Button sizeButton;
    private Button alphaButton;
    private int usableWidth;
    private int usableHeight;
    private int webViewRecoverCount = 0;
    private long lastWebViewCrashMs = 0;
    private static volatile boolean crashGuardInstalled = false;

    static void installProcessCrashGuard() {
        if (crashGuardInstalled) return;
        crashGuardInstalled = true;
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            // 无论发生任何致命异常，先毫秒级关闭 VPN TUN，确保《明日方舟》立即切回系统直连不断网
            try { StrongholdVpnService.emergencyCloseStatic(); } catch (Throwable ignored) {}
            if (prev != null) prev.uncaughtException(thread, error);
        });
    }

    static void stopActive() { if (active != null) { active.dispose(); active.stopSelf(); active = null; } }
    static void hideForScan() { MAIN.post(() -> { if (active != null) { active.collapseToBall(); if (active.ball != null) active.setBallScanning(true); } }); }
    static void showAfterScan() { MAIN.post(() -> { if (active != null && active.ball != null) active.expand(); }); }
    static boolean isExpanded() { return active != null && active.expanded; }
    static void hideForRound() { MAIN.post(() -> { if (active != null) { active.collapseToBall(); if (active.ball != null) active.setBallScanning(false); } }); }

    static void notifyObservedRound(final int round) {
        MAIN.post(() -> {
            if (round >= 1 && round <= 15) {
                pendingRound = round;
                if (active != null) active.refreshStripAndBallContent();
            }
        });
    }

    /** 仅当展开面板与用户框选的回合归一化区域真正重叠时才暂停回合 OCR，避免右侧抽屉阻断左侧回合识别。 */
    static boolean overlapsNormalizedRect(double[] region) {
        OverlayService s = active;
        if (s == null || !s.expanded || s.panelParams == null || region == null || region.length < 4 || s.usableWidth <= 0 || s.usableHeight <= 0) {
            return false;
        }
        double pLeft = (double) s.panelParams.x / s.usableWidth;
        double pTop = (double) s.panelParams.y / s.usableHeight;
        double pRight = (double) (s.panelParams.x + s.panelParams.width) / s.usableWidth;
        double pBottom = (double) (s.panelParams.y + s.panelParams.height) / s.usableHeight;
        return pLeft < region[2] && pRight > region[0] && pTop < region[3] && pBottom > region[1];
    }

    static void updateStripFromBridge(final int round, final String headline, final String detail) {
        updateStripFromBridge(round, 0, headline, "", detail);
    }

    static void updateStripFromBridge(final int round, final int tier, final String headline, final String grabHint, final String detail) {
        updateStripV2(round, tier, tier, headline, grabHint, "", "", "", "", detail);
    }

    static void updateStripV2(
        final int round, final int tier, final int prevTier, final String headline,
        final String grabHint, final String progressText, final String banWarning,
        final String loadoutHint, final String fallbackAdvice, final String detail
    ) {
        MAIN.post(() -> {
            if (round >= 1 && round <= 15) pendingRound = round;
            if (tier >= 1 && tier <= 6) pendingTier = tier;
            if (prevTier >= 0 && prevTier <= 6) pendingPrevTier = prevTier;
            if (headline != null) pendingHeadline = headline.trim();
            if (grabHint != null) pendingGrabHint = grabHint.trim();
            if (progressText != null) pendingProgress = progressText.trim();
            if (banWarning != null) pendingBanWarning = banWarning.trim();
            if (loadoutHint != null) pendingLoadoutHint = loadoutHint.trim();
            if (detail != null) pendingDetail = cleanDerivedPrefix(detail);
            if (active != null) active.refreshStripAndBallContent();
        });
    }

    static void updateTelemetrySnapshot(final BattleCaptureState.TelemetrySnapshot snap) {
        MAIN.post(() -> {
            liveTelemetry = snap;
            if (snap != null && snap.currentRound >= 1 && snap.currentRound <= 15) {
                pendingRound = snap.currentRound;
            }
            if (active != null) active.refreshStripAndBallContent();
        });
    }

    private static String cleanDerivedPrefix(String raw) {
        if (raw == null) return "";
        String s = raw.trim();
        if (s.startsWith("【推导】")) s = s.substring(4).trim();
        else if (s.startsWith("[推导]")) s = s.substring(4).trim();
        else if (s.startsWith("推导：") || s.startsWith("推导:")) s = s.substring(3).trim();
        return s;
    }

    static void enterStripFromBridge(final boolean locked) {
        MAIN.post(() -> { if (active != null) active.enterStrip(locked); });
    }

    static void setPanelFocusableFromBridge(final boolean focusable) {
        MAIN.post(() -> { if (active != null) active.setPanelFocusable(focusable); });
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private static Typeface prtsSans(boolean bold) {
        return Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL);
    }

    private static Typeface prtsNumeric(boolean bold) {
        return Typeface.create("sans-serif-condensed", bold ? Typeface.BOLD : Typeface.NORMAL);
    }

    private GradientDrawable background(int color, int radius, int strokeColor) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radius));
        shape.setStroke(dp(1), strokeColor);
        return shape;
    }

    private GradientDrawable gradientBar(int startColor, int endColor, int radius) {
        GradientDrawable shape = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[] { startColor, endColor });
        shape.setCornerRadius(dp(radius));
        return shape;
    }

    private static String fmtWan(int value) {
        if (value >= 1_000_000) return String.format(Locale.US, "%.0fW", value / 10000.0);
        if (value >= 10_000) return String.format(Locale.US, "%.1fW", value / 10000.0);
        return String.format(Locale.US, "%,d", Math.max(0, value));
    }

    private static String fmtComma(int value) {
        return String.format(Locale.US, "%,d", Math.max(0, value));
    }

    private static String fmtMmSs(int seconds) {
        int s = Math.max(0, seconds);
        return String.format(Locale.US, "%02d:%02d", s / 60, s % 60);
    }

    @Override public void onCreate() {
        super.onCreate();
        installProcessCrashGuard();
        active = this;
        manager = (WindowManager) getSystemService(WINDOW_SERVICE);
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        alphaIndex = Math.max(0, Math.min(ALPHA_LEVELS.length - 1, sp.getInt("alphaIndex", 0)));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) { dispose(); stopSelf(); return START_NOT_STICKY; }
        if (intent != null && "UNLOCK_STRIP".equals(intent.getAction())) {
            if (stripMode && stripLocked) setStripLocked(false);
            return START_NOT_STICKY;
        }
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        updateForegroundNotification();
        if (ball == null) {
            createBall();
            MAIN.postDelayed(() -> {
                if (active == this && panel == null && ball != null) {
                    try { createPanel(); } catch (RuntimeException ignored) {}
                }
            }, 350);
        }
        return START_NOT_STICKY;
    }

    private void updateForegroundNotification() {
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.overlay_channel), NotificationManager.IMPORTANCE_LOW));
        PendingIntent home = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, OverlayService.class).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.overlay_title))
            .setContentText(stripMode && stripLocked ? "战术迷你条已穿透 · 点下方可解锁" : "单击展开 · 双击扫盟约 · 长按切迷你条")
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setContentIntent(home);
        if (stripMode && stripLocked) {
            PendingIntent unlock = PendingIntent.getService(this, 2, new Intent(this, OverlayService.class).setAction("UNLOCK_STRIP"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(new Notification.Action.Builder(R.drawable.ic_notification, "解锁迷你条", unlock).build());
        }
        builder.addAction(new Notification.Action.Builder(R.drawable.ic_notification, "关闭悬浮助手", stop).build());
        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, notification);
    }

    private void measureScreen() {
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowMetrics metrics = manager.getCurrentWindowMetrics();
            android.graphics.Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            usableWidth = metrics.getBounds().width() - insets.left - insets.right;
            usableHeight = metrics.getBounds().height() - insets.top - insets.bottom;
        } else {
            Point size = new Point();
            manager.getDefaultDisplay().getSize(size);
            usableWidth = size.x;
            usableHeight = size.y;
        }
    }

    private WindowManager.LayoutParams params(int width, int height, boolean focusable, boolean touchable) {
        int winFlags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            | (focusable ? 0 : WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)
            | (touchable ? 0 : WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            width, height, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, winFlags, PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        return params;
    }

    private void setPanelFocusable(boolean focusable) {
        if (panel == null || panelParams == null || panelFocusable == focusable) return;
        panelFocusable = focusable;
        panelParams.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            | (focusable ? 0 : WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        if (panel.isAttachedToWindow()) {
            try { manager.updateViewLayout(panel, panelParams); } catch (RuntimeException ignored) {}
        }
    }

    private void createBall() {
        measureScreen();
        ball = new TextView(this);
        ball.setTextSize(12f);
        ball.setTypeface(prtsSans(true));
        int brandCol = isLiteTelemetryMode() ? 0xff22d3ee : 0xffffe600;
        int brandStroke = isLiteTelemetryMode() ? 0x9922d3ee : 0x99ffe600;
        ball.setTextColor(brandCol);
        ball.setGravity(Gravity.CENTER);
        ball.setBackground(background(0xe80b0d11, 26, brandStroke));
        setBallScanning(false);
        ball.setElevation(dp(8));
        ballParams = params(dp(48), dp(48), false, true);
        ballParams.x = Math.max(0, usableWidth - dp(54));
        ballParams.y = usableHeight / 3;
        attachBallGestureListener();
        try { manager.addView(ball, ballParams); }
        catch (RuntimeException error) { fail(); }
    }

    /** 悬浮球三合一快捷手势：拖动吸附 + 单击展开 + 双击一键扫盟约 + 长按切换战术迷你条。 */
    private void attachBallGestureListener() {
        final int slop = ViewConfiguration.get(this).getScaledTouchSlop();
        final long doubleTapWindowMs = 260;
        final long longPressMs = 460;

        ball.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            int startX, startY;
            boolean dragging;
            boolean longPressed;
            long lastTapAt = 0;

            final Runnable pendingSingleTap = () -> {
                if (expanded) collapseToBall();
                else expand();
            };

            final Runnable longPressTask = () -> {
                if (!dragging) {
                    longPressed = true;
                    MAIN.removeCallbacks(pendingSingleTap);
                    ball.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                    enterStrip(false);
                }
            };

            @Override public boolean onTouch(View view, MotionEvent event) {
                int action = event.getActionMasked();
                if (action == MotionEvent.ACTION_DOWN) {
                    downX = event.getRawX();
                    downY = event.getRawY();
                    startX = ballParams.x;
                    startY = ballParams.y;
                    dragging = false;
                    longPressed = false;
                    MAIN.postDelayed(longPressTask, longPressMs);
                    return true;
                }
                if (action == MotionEvent.ACTION_MOVE) {
                    float dx = event.getRawX() - downX;
                    float dy = event.getRawY() - downY;
                    if (!dragging && (Math.abs(dx) > slop || Math.abs(dy) > slop)) {
                        dragging = true;
                        MAIN.removeCallbacks(longPressTask);
                    }
                    if (dragging) {
                        ballParams.x = startX + Math.round(dx);
                        ballParams.y = startY + Math.round(dy);
                        clamp(ballParams);
                        try { manager.updateViewLayout(ball, ballParams); } catch (RuntimeException error) { fail(); }
                    }
                    return true;
                }
                if (action == MotionEvent.ACTION_UP) {
                    MAIN.removeCallbacks(longPressTask);
                    if (longPressed) return true;
                    if (dragging) {
                        ballParams.x = ballParams.x + ballParams.width / 2 < usableWidth / 2 ? 0 : usableWidth - ballParams.width;
                        clamp(ballParams);
                        try { manager.updateViewLayout(ball, ballParams); } catch (RuntimeException error) { fail(); }
                        return true;
                    }
                    long now = System.currentTimeMillis();
                    if (now - lastTapAt <= doubleTapWindowMs) {
                        lastTapAt = 0;
                        MAIN.removeCallbacks(pendingSingleTap);
                        ball.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                        triggerQuickCovenantScan();
                    } else {
                        lastTapAt = now;
                        MAIN.postDelayed(pendingSingleTap, doubleTapWindowMs);
                    }
                    return true;
                }
                if (action == MotionEvent.ACTION_CANCEL) {
                    MAIN.removeCallbacks(longPressTask);
                    return true;
                }
                return false;
            }
        });
    }

    private boolean isLiteTelemetryMode() {
        try {
            return getPackageName().contains("telemetry") || !getResources().getBoolean(R.bool.covenant_scan_enabled);
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private void triggerQuickCovenantScan() {
        if (isLiteTelemetryMode()) {
            enterStrip(false);
            return;
        }
        if (CovenantScanState.permissionPending() || CovenantScanState.scanning()) return;
        if (!CovenantScanState.begin()) return;
        String id = CovenantScanState.currentId();
        Toast.makeText(this, "快捷扫描：正在识别本局 26 项盟约…", Toast.LENGTH_SHORT).show();
        if (CovenantScanService.switchToCovenant(id)) {
            return;
        }
        hideForScan();
        try {
            startActivity(new Intent(this, CapturePermissionActivity.class)
                .putExtra("scanId", id)
                .putExtra("mode", "covenant")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS));
        } catch (RuntimeException error) {
            CovenantScanState.set("error", "无法打开截屏授权，请从应用内重新启动识别");
            showAfterScan();
        }
    }

    private void setBallScanning(boolean scanning) {
        if (ball == null) return;
        if (scanning) {
            ball.setText("扫描");
            ball.setTextColor(0xff00e5ff);
            ball.setBackground(background(0xe80b0d11, 26, 0xff00e5ff));
            ball.setForeground(null);
            ball.setContentDescription(getString(R.string.ball_scan_desc));
        } else if (pendingRound >= 1 && pendingRound <= 15) {
            boolean lite = isLiteTelemetryMode();
            ball.setText(String.format(Locale.US, "R%02d", pendingRound));
            ball.setTextColor(lite ? 0xff22d3ee : 0xffffe600);
            ball.setBackground(background(0xe80b0d11, 26, lite ? 0xbb22d3ee : 0xbbffe600));
            ball.setForeground(null);
            ball.setContentDescription(getString(R.string.ball_desc));
        } else {
            boolean lite = isLiteTelemetryMode();
            ball.setText("");
            ball.setBackground(background(0xe80b0d11, 26, lite ? 0x8822d3ee : 0x88ffe600));
            int inset = getResources().getInteger(R.integer.ball_icon_inset_dp);
            ball.setForeground(new InsetDrawable(getDrawable(R.drawable.ic_overlay_ball), dp(inset)));
            ball.setContentDescription(getString(R.string.ball_desc));
        }
    }

    private int preferredStripWidth() {
        boolean landscape = usableWidth > usableHeight;
        if (landscape) {
            return Math.min(dp(448), Math.max(dp(360), usableWidth - dp(120)));
        }
        return Math.min(dp(364), Math.max(dp(280), usableWidth - dp(16)));
    }

    private void positionStripDefault() {
        if (stripParams == null) return;
        stripParams.width = preferredStripWidth();
        boolean landscape = usableWidth > usableHeight;
        if (landscape) {
            int preferredX = Math.round(usableWidth * 0.34f);
            stripParams.x = Math.max(dp(8), Math.min(preferredX, Math.max(dp(8), usableWidth - stripParams.width - dp(90))));
        } else {
            stripParams.x = Math.max(dp(8), (usableWidth - stripParams.width) / 2);
        }
        stripParams.y = dp(4);
    }

    private void createStrip() {
        strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.VERTICAL);
        strip.setPadding(dp(6), dp(4), dp(6), dp(5));
        strip.setBackground(background(0xf20b0d11, 4, isLiteTelemetryMode() ? 0xff22d3ee : 0xffffe600));
        strip.setElevation(dp(9));

        // ===== Row 1: Top Header Bar =====
        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        stripPrevBtn = stepButton("◀", v -> handleStepButton(-1));
        topRow.addView(stripPrevBtn);

        stripRoundBadge = new TextView(this);
        stripRoundBadge.setTextSize(12f);
        stripRoundBadge.setTypeface(prtsSans(true));
        stripRoundBadge.setFontFeatureSettings("tnum");
        stripRoundBadge.setTextColor(0xff0b0c0e);
        stripRoundBadge.setPadding(dp(5), dp(1), dp(5), dp(1));
        stripRoundBadge.setBackground(background(0xffffe600, 2, 0xffffe600));
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(-2, -2);
        badgeLp.leftMargin = dp(3);
        badgeLp.rightMargin = dp(3);
        topRow.addView(stripRoundBadge, badgeLp);

        stripNextBtn = stepButton("▶", v -> handleStepButton(1));
        topRow.addView(stripNextBtn);

        // Boss portrait icon (shown in DPS tab when Boss icon exists)
        stripBossHeaderIcon = new ImageView(this);
        stripBossHeaderIcon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        stripBossHeaderIcon.setBackground(background(0xff1a0d12, 2, 0x88ff4d4f));
        stripBossHeaderIcon.setPadding(dp(1), dp(1), dp(1), dp(1));
        stripBossHeaderIcon.setVisibility(View.GONE);
        LinearLayout.LayoutParams bossIconLp = new LinearLayout.LayoutParams(dp(18), dp(18));
        bossIconLp.leftMargin = dp(5);
        topRow.addView(stripBossHeaderIcon, bossIconLp);

        // [累计 | 单回合] sub-capsule (shown in leak tab)
        stripLeakScopeBox = new LinearLayout(this);
        stripLeakScopeBox.setOrientation(LinearLayout.HORIZONTAL);
        stripLeakScopeBox.setGravity(Gravity.CENTER_VERTICAL);
        stripLeakScopeBox.setPadding(dp(1), dp(1), dp(1), dp(1));
        stripLeakScopeBox.setBackground(background(0xff0d1118, 3, 0xff2b3444));
        stripLeakScopeBox.setVisibility(View.GONE);
        stripScopeCumBtn = capsuleChip("累计", v -> {
            leakCumulative = true;
            refreshStripAndBallContent();
        });
        stripScopeRoundBtn = capsuleChip("单轮", v -> {
            leakCumulative = false;
            if (leakSelectedRound < 1 || leakSelectedRound > 15) {
                leakSelectedRound = Math.max(1, effectiveCurrentRound());
            }
            refreshStripAndBallContent();
        });
        stripLeakScopeBox.addView(stripScopeCumBtn);
        stripLeakScopeBox.addView(stripScopeRoundBtn);
        LinearLayout.LayoutParams scopeLp = new LinearLayout.LayoutParams(-2, -2);
        scopeLp.leftMargin = dp(5);
        topRow.addView(stripLeakScopeBox, scopeLp);

        stripLeakPills = new LinearLayout(this);
        stripLeakPills.setOrientation(LinearLayout.HORIZONTAL);
        stripLeakPills.setGravity(Gravity.CENTER_VERTICAL);
        stripLeakPills.setVisibility(View.GONE);
        stripLeakPillTotal = leakSummaryPill(stripLeakPills, false);
        stripLeakPillAssist = leakSummaryPill(stripLeakPills, true);
        stripLeakPillEscaped = leakSummaryPill(stripLeakPills, true);
        LinearLayout.LayoutParams pillsLp = new LinearLayout.LayoutParams(0, -2, 1f);
        pillsLp.leftMargin = dp(6);
        pillsLp.rightMargin = dp(4);
        topRow.addView(stripLeakPills, pillsLp);

        stripTitleView = new TextView(this);
        stripTitleView.setTextSize(12.5f);
        stripTitleView.setTypeface(prtsSans(true));
        stripTitleView.setTextColor(0xfff1f5f9);
        stripTitleView.setSingleLine(true);
        stripTitleView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, -2, 1f);
        titleLp.leftMargin = dp(6);
        titleLp.rightMargin = dp(4);
        topRow.addView(stripTitleView, titleLp);

        // Right controls
        stripActions = new LinearLayout(this);
        stripActions.setOrientation(LinearLayout.HORIZONTAL);
        stripActions.setGravity(Gravity.CENTER_VERTICAL);

        stripScanBtn = miniStripButton(stripActions, "扫盟约", 0xff00e5ff, v -> triggerQuickCovenantScan());

        // Mode capsule: [DPS | 跟打 | 漏兜]
        stripModeCapsule = new LinearLayout(this);
        stripModeCapsule.setOrientation(LinearLayout.HORIZONTAL);
        stripModeCapsule.setGravity(Gravity.CENTER_VERTICAL);
        stripModeCapsule.setPadding(dp(1), dp(1), dp(1), dp(1));
        stripModeCapsule.setBackground(background(0xff0d1118, 3, 0xff2b3444));
        stripTabDpsBtn = capsuleChip("DPS", v -> {
            stripTab = "dps";
            refreshStripAndBallContent();
        });
        stripTabGuideBtn = capsuleChip("跟打", v -> {
            stripTab = "guide";
            refreshStripAndBallContent();
        });
        stripTabLeakBtn = capsuleChip("漏兜", v -> {
            stripTab = "leak";
            int cur = effectiveCurrentRound();
            if (cur >= 1 && cur <= 15 && leakCumulative) leakSelectedRound = cur;
            refreshStripAndBallContent();
        });
        stripTabLogsBtn = capsuleChip("流水", v -> {
            stripTab = "logs";
            refreshStripAndBallContent();
        });
        stripTabWavesBtn = capsuleChip("出怪", v -> {
            stripTab = "waves";
            refreshStripAndBallContent();
        });
        stripModeCapsule.addView(stripTabDpsBtn);
        stripModeCapsule.addView(stripTabGuideBtn);
        stripModeCapsule.addView(stripTabLeakBtn);
        stripModeCapsule.addView(stripTabLogsBtn);
        stripModeCapsule.addView(stripTabWavesBtn);
        LinearLayout.LayoutParams capLp = new LinearLayout.LayoutParams(-2, -2);
        capLp.leftMargin = dp(3);
        stripActions.addView(stripModeCapsule, capLp);

        miniStripButton(stripActions, "穿透", isLiteTelemetryMode() ? 0xff22d3ee : 0xffffe600, v -> setStripLocked(true));
        miniStripButton(stripActions, "展开", 0xffe2e8f0, v -> expand());
        miniStripButton(stripActions, "球", 0xff94a3b8, v -> collapseToBall());
        topRow.addView(stripActions);
        strip.addView(topRow);

        // ===== Body A: 跟打（怪物实机图标条 + 运营正文）=====
        guideContainer = new LinearLayout(this);
        guideContainer.setOrientation(LinearLayout.VERTICAL);

        guideFocusRow = new LinearLayout(this);
        guideFocusRow.setOrientation(LinearLayout.HORIZONTAL);
        guideFocusRow.setGravity(Gravity.CENTER_VERTICAL);
        guideFocusRow.setPadding(dp(5), dp(3), dp(5), dp(3));
        guideFocusRow.setBackgroundColor(0x1600e5ff);
        LinearLayout.LayoutParams gfLp = new LinearLayout.LayoutParams(-1, -2);
        gfLp.topMargin = dp(4);

        guideFocusAccent = new View(this);
        guideFocusAccent.setBackgroundColor(0xff00e5ff);
        LinearLayout.LayoutParams accLp = new LinearLayout.LayoutParams(dp(2), dp(15));
        accLp.rightMargin = dp(5);
        guideFocusRow.addView(guideFocusAccent, accLp);

        guideFocusKey = new TextView(this);
        guideFocusKey.setTextSize(11f);
        guideFocusKey.setTypeface(prtsSans(true));
        guideFocusKey.setTextColor(0xff00e5ff);
        guideFocusKey.setSingleLine(true);
        LinearLayout.LayoutParams fkLp = new LinearLayout.LayoutParams(-2, -2);
        fkLp.rightMargin = dp(5);
        guideFocusRow.addView(guideFocusKey, fkLp);

        guideEnemyScroll = new HorizontalScrollView(this);
        guideEnemyScroll.setHorizontalScrollBarEnabled(false);
        guideEnemyScroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        guideEnemyChips = new LinearLayout(this);
        guideEnemyChips.setOrientation(LinearLayout.HORIZONTAL);
        guideEnemyChips.setGravity(Gravity.CENTER_VERTICAL);
        guideEnemyScroll.addView(guideEnemyChips, new FrameLayout.LayoutParams(-2, -2));
        guideFocusRow.addView(guideEnemyScroll, new LinearLayout.LayoutParams(0, -2, 1f));

        guideAllWavesBtn = new TextView(this);
        guideAllWavesBtn.setText("完整");
        guideAllWavesBtn.setTextSize(11f);
        guideAllWavesBtn.setTypeface(prtsSans(true));
        guideAllWavesBtn.setTextColor(0xff00e5ff);
        guideAllWavesBtn.setPadding(dp(5), dp(1), dp(5), dp(1));
        guideAllWavesBtn.setBackground(background(0xff0f222c, 2, 0x8800e5ff));
        guideAllWavesBtn.setSingleLine(true);
        guideAllWavesBtn.setVisibility(View.GONE);
        guideAllWavesBtn.setOnClickListener(v -> {
            stripTab = "waves";
            refreshStripAndBallContent();
        });
        LinearLayout.LayoutParams awLp = new LinearLayout.LayoutParams(-2, -2);
        awLp.leftMargin = dp(4);
        guideFocusRow.addView(guideAllWavesBtn, awLp);

        guideFocusFallbackVal = new TextView(this);
        guideFocusFallbackVal.setTextSize(11.5f);
        guideFocusFallbackVal.setTypeface(prtsSans(false));
        guideFocusFallbackVal.setTextColor(0xffe2e8f0);
        guideFocusFallbackVal.setMaxLines(2);
        guideFocusFallbackVal.setEllipsize(TextUtils.TruncateAt.END);
        guideFocusFallbackVal.setVisibility(View.GONE);
        guideFocusRow.addView(guideFocusFallbackVal, new LinearLayout.LayoutParams(0, -2, 1f));

        guideFocusProg = new TextView(this);
        guideFocusProg.setTextSize(11f);
        guideFocusProg.setTypeface(prtsSans(true));
        guideFocusProg.setFontFeatureSettings("tnum");
        guideFocusProg.setTextColor(0xffffe600);
        guideFocusProg.setSingleLine(true);
        LinearLayout.LayoutParams fpLp = new LinearLayout.LayoutParams(-2, -2);
        fpLp.leftMargin = dp(6);
        guideFocusRow.addView(guideFocusProg, fpLp);

        guideContainer.addView(guideFocusRow, gfLp);

        guideBodyView = new TextView(this);
        guideBodyView.setTextSize(11.5f);
        guideBodyView.setTypeface(prtsSans(false));
        guideBodyView.setTextColor(0xffe2e8f0);
        guideBodyView.setLineSpacing(dp(2), 1f);
        guideBodyView.setMaxLines(3);
        guideBodyView.setEllipsize(TextUtils.TruncateAt.END);
        guideBodyView.setOnClickListener(v -> {
            stripBodyCompact = !stripBodyCompact;
            refreshStripAndBallContent();
        });
        LinearLayout.LayoutParams bodyLp = new LinearLayout.LayoutParams(-1, -2);
        bodyLp.topMargin = dp(4);
        guideContainer.addView(guideBodyView, bodyLp);
        strip.addView(guideContainer);

        // ===== Body B: 漏兜图表（4 人彩色柱图 + 漏怪图标底条）=====
        leakContainer = new LinearLayout(this);
        leakContainer.setOrientation(LinearLayout.VERTICAL);
        leakContainer.setVisibility(View.GONE);

        leakGrid = new LinearLayout(this);
        leakGrid.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams gridLp = new LinearLayout.LayoutParams(-1, -2);
        gridLp.topMargin = dp(4);
        leakContainer.addView(leakGrid, gridLp);

        leakNextWavesBox = new LinearLayout(this);
        leakNextWavesBox.setOrientation(LinearLayout.VERTICAL);
        leakNextWavesBox.setVisibility(View.GONE);
        LinearLayout.LayoutParams nwLp = new LinearLayout.LayoutParams(-1, -2);
        nwLp.topMargin = dp(4);
        leakContainer.addView(leakNextWavesBox, nwLp);

        leakFooterRow = new LinearLayout(this);
        leakFooterRow.setOrientation(LinearLayout.HORIZONTAL);
        leakFooterRow.setGravity(Gravity.CENTER_VERTICAL);
        leakFooterRow.setPadding(dp(5), dp(2), dp(5), dp(2));
        leakFooterRow.setBackground(background(0x18ff4d4f, 2, 0x44ff4d4f));
        leakFooterRow.setVisibility(View.GONE);
        LinearLayout.LayoutParams lfLp = new LinearLayout.LayoutParams(-1, -2);
        lfLp.topMargin = dp(3);

        leakFooterTag = new TextView(this);
        leakFooterTag.setTextSize(10.5f);
        leakFooterTag.setTypeface(prtsSans(true));
        leakFooterTag.setTextColor(0xfffb923c);
        leakFooterTag.setSingleLine(true);
        LinearLayout.LayoutParams lftLp = new LinearLayout.LayoutParams(-2, -2);
        lftLp.rightMargin = dp(5);
        leakFooterRow.addView(leakFooterTag, lftLp);

        HorizontalScrollView leakScroll = new HorizontalScrollView(this);
        leakScroll.setHorizontalScrollBarEnabled(false);
        leakScroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        leakEnemyChips = new LinearLayout(this);
        leakEnemyChips.setOrientation(LinearLayout.HORIZONTAL);
        leakEnemyChips.setGravity(Gravity.CENTER_VERTICAL);
        leakScroll.addView(leakEnemyChips, new FrameLayout.LayoutParams(-2, -2));
        leakFooterRow.addView(leakScroll, new LinearLayout.LayoutParams(0, -2, 1f));

        leakContainer.addView(leakFooterRow, lfLp);
        strip.addView(leakContainer);

        // ===== Body C: Boss MMO DPS 榜（Boss 血条 + 4 行横向渐变计量条）=====
        dpsContainer = new LinearLayout(this);
        dpsContainer.setOrientation(LinearLayout.VERTICAL);
        dpsContainer.setVisibility(View.GONE);

        bossHpTrack = new FrameLayout(this);
        bossHpTrack.setBackground(background(0xff1e0c11, 3, 0x88ff4d4f));
        LinearLayout.LayoutParams hpTrackLp = new LinearLayout.LayoutParams(-1, dp(21));
        hpTrackLp.topMargin = dp(4);

        LinearLayout hpFillWrap = new LinearLayout(this);
        hpFillWrap.setOrientation(LinearLayout.HORIZONTAL);
        bossHpFill = new View(this);
        bossHpFill.setBackground(gradientBar(0xffb91c1c, 0xfff97316, 2));
        bossHpRest = new View(this);
        hpFillWrap.addView(bossHpFill, new LinearLayout.LayoutParams(0, -1, 1f));
        hpFillWrap.addView(bossHpRest, new LinearLayout.LayoutParams(0, -1, 0f));
        bossHpTrack.addView(hpFillWrap, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout hpTextRow = new LinearLayout(this);
        hpTextRow.setOrientation(LinearLayout.HORIZONTAL);
        hpTextRow.setGravity(Gravity.CENTER_VERTICAL);
        hpTextRow.setPadding(dp(6), 0, dp(6), 0);
        bossHpLeftText = new TextView(this);
        bossHpLeftText.setTextSize(11f);
        bossHpLeftText.setTypeface(prtsSans(true));
        bossHpLeftText.setFontFeatureSettings("tnum");
        bossHpLeftText.setTextColor(0xffffffff);
        bossHpLeftText.setSingleLine(true);
        hpTextRow.addView(bossHpLeftText, new LinearLayout.LayoutParams(0, -2, 1f));

        bossHpRightText = new TextView(this);
        bossHpRightText.setTextSize(11f);
        bossHpRightText.setTypeface(prtsSans(true));
        bossHpRightText.setFontFeatureSettings("tnum");
        bossHpRightText.setTextColor(0xfffef08a);
        bossHpRightText.setSingleLine(true);
        hpTextRow.addView(bossHpRightText, new LinearLayout.LayoutParams(-2, -2));
        bossHpTrack.addView(hpTextRow, new FrameLayout.LayoutParams(-1, -1));

        dpsContainer.addView(bossHpTrack, hpTrackLp);

        bossRankList = new LinearLayout(this);
        bossRankList.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams rankLp = new LinearLayout.LayoutParams(-1, -2);
        rankLp.topMargin = dp(3);
        dpsContainer.addView(bossRankList, rankLp);
        strip.addView(dpsContainer);

        // ===== Body D: 全波次出怪总览（R01–R15 所有波次实机图标）=====
        wavesContainer = new LinearLayout(this);
        wavesContainer.setOrientation(LinearLayout.VERTICAL);
        wavesContainer.setVisibility(View.GONE);

        wavesScroll = new ScrollView(this);
        wavesScroll.setVerticalScrollBarEnabled(true);
        wavesScroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        wavesList = new LinearLayout(this);
        wavesList.setOrientation(LinearLayout.VERTICAL);
        wavesScroll.addView(wavesList, new FrameLayout.LayoutParams(-1, -2));
        LinearLayout.LayoutParams wsLp = new LinearLayout.LayoutParams(-1, dp(164));
        wsLp.topMargin = dp(4);
        wavesContainer.addView(wavesScroll, wsLp);
        strip.addView(wavesContainer);

        // ===== Body E: 实时 Logs 流水（Lite 战报仪毫秒级去重事件流）=====
        logsContainer = new LinearLayout(this);
        logsContainer.setOrientation(LinearLayout.VERTICAL);
        logsContainer.setVisibility(View.GONE);
        logsList = new LinearLayout(this);
        logsList.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams logsLp = new LinearLayout.LayoutParams(-1, -2);
        logsLp.topMargin = dp(4);
        logsContainer.addView(logsList, logsLp);
        strip.addView(logsContainer);

        stripParams = params(preferredStripWidth(), WindowManager.LayoutParams.WRAP_CONTENT, false, true);
        positionStripDefault();
        makeDraggable(strip, strip, stripParams, false, this::syncUnlockChipPosition);

        int unlockCol = isLiteTelemetryMode() ? 0xff22d3ee : 0xffffe600;
        unlockChip = new TextView(this);
        unlockChip.setText("解锁");
        unlockChip.setTextSize(11.5f);
        unlockChip.setTypeface(prtsSans(true));
        unlockChip.setTextColor(unlockCol);
        unlockChip.setGravity(Gravity.CENTER);
        unlockChip.setBackground(background(0xee0b0d11, 3, unlockCol));
        unlockChip.setContentDescription("解锁触控穿透迷你条");
        unlockParams = params(dp(42), dp(28), false, true);
        unlockChip.setOnClickListener(v -> setStripLocked(false));
        refreshStripAndBallContent();
    }

    private TextView leakSummaryPill(LinearLayout parent, boolean gapLeft) {
        TextView tv = new TextView(this);
        tv.setTextSize(11f);
        tv.setTypeface(prtsSans(true));
        tv.setFontFeatureSettings("tnum");
        tv.setSingleLine(true);
        tv.setPadding(dp(5), dp(1), dp(5), dp(1));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        if (gapLeft) lp.leftMargin = dp(3);
        parent.addView(tv, lp);
        return tv;
    }

    private CharSequence buildLeakLegend() {
        SpannableStringBuilder sb = new SpannableStringBuilder();
        appendColored(sb, "■", 0xff00e5ff);
        appendColored(sb, "帮兜 ", 0xff94a3b8);
        appendColored(sb, "■", 0xfffb923c);
        appendColored(sb, "已兜 ", 0xff94a3b8);
        appendColored(sb, "■", 0xffff4d4f);
        appendColored(sb, "逃逸", 0xff94a3b8);
        return sb;
    }

    private static void appendColored(SpannableStringBuilder sb, String text, int color) {
        int start = sb.length();
        sb.append(text);
        sb.setSpan(new ForegroundColorSpan(color), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }

    private TextView capsuleChip(String label, View.OnClickListener action) {
        TextView tv = new TextView(this);
        tv.setText(label);
        tv.setTextSize(11f);
        tv.setTypeface(prtsSans(true));
        tv.setPadding(dp(5), dp(1), dp(5), dp(1));
        tv.setSingleLine(true);
        tv.setOnClickListener(action);
        return tv;
    }

    private void styleCapsuleChip(TextView chip, boolean active, int activeBg, int activeFg, int inactiveFg) {
        if (active) {
            chip.setTextColor(activeFg);
            chip.setBackground(background(activeBg, 2, activeBg));
        } else {
            chip.setTextColor(inactiveFg);
            chip.setBackground(null);
        }
    }

    private TextView stepButton(String label, View.OnClickListener action) {
        TextView btn = new TextView(this);
        btn.setText(label);
        btn.setTextSize(11.5f);
        btn.setTypeface(prtsSans(true));
        btn.setTextColor(0xffffe600);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(5), dp(1), dp(5), dp(1));
        btn.setBackground(background(0xff171c26, 2, 0xff2b3444));
        btn.setOnClickListener(action);
        return btn;
    }

    private int effectiveCurrentRound() {
        if (liveTelemetry != null && liveTelemetry.currentRound >= 1 && liveTelemetry.currentRound <= 15) {
            return liveTelemetry.currentRound;
        }
        return pendingRound >= 1 && pendingRound <= 15 ? pendingRound : 1;
    }

    private void handleStepButton(int delta) {
        if ("leak".equals(stripTab)) {
            int maxRound = (liveTelemetry != null && liveTelemetry.currentRound >= 1 && liveTelemetry.currentRound <= 15)
                ? liveTelemetry.currentRound : 15;
            if (leakCumulative) {
                leakCumulative = false;
                leakSelectedRound = Math.max(1, Math.min(maxRound, effectiveCurrentRound()));
            } else {
                leakSelectedRound = Math.max(1, Math.min(maxRound, leakSelectedRound + delta));
            }
            refreshStripAndBallContent();
            return;
        }
        int current = pendingRound >= 1 && pendingRound <= 15 ? pendingRound : 1;
        int next = Math.max(1, Math.min(15, current + delta));
        if (next == current) return;
        pendingRound = next;
        refreshStripAndBallContent();
        dispatchJsEvent("prts-strip-round", String.valueOf(next));
    }

    private void dispatchJsEvent(String eventName, String detailJsonOrPrimitive) {
        if (web == null) return;
        String detailExpr = (detailJsonOrPrimitive == null || detailJsonOrPrimitive.isEmpty()) ? "null" : detailJsonOrPrimitive;
        String js = "window.dispatchEvent(new CustomEvent('" + eventName + "',{detail:" + detailExpr + "}));";
        MAIN.post(() -> {
            if (web != null) {
                try { web.evaluateJavascript(js, null); } catch (RuntimeException ignored) {}
            }
        });
    }

    private TextView miniStripButton(LinearLayout host, String text, int color, View.OnClickListener action) {
        TextView btn = new TextView(this);
        btn.setText(text);
        btn.setTextSize(11f);
        btn.setTypeface(prtsSans(true));
        btn.setTextColor(color);
        btn.setPadding(dp(5), dp(2), dp(5), dp(2));
        btn.setBackground(background(0xff171c26, 2, 0xff2b3444));
        btn.setOnClickListener(action);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.leftMargin = dp(3);
        host.addView(btn, lp);
        return btn;
    }

    private void syncUnlockChipPosition() {
        if (unlockParams == null || stripParams == null) return;
        int candidateX = stripParams.x + stripParams.width + dp(4);
        if (candidateX + unlockParams.width > usableWidth) {
            candidateX = Math.max(0, stripParams.x - unlockParams.width - dp(4));
        }
        unlockParams.x = candidateX;
        unlockParams.y = stripParams.y;
        clamp(unlockParams);
        if (unlockChip != null && unlockChip.isAttachedToWindow()) {
            try { manager.updateViewLayout(unlockChip, unlockParams); } catch (RuntimeException ignored) {}
        }
    }

    private View buildEnemyChip(BattleCaptureState.EnemyCount ec, int countColor, int strokeColor, int iconSizeDp) {
        LinearLayout chip = new LinearLayout(this);
        chip.setOrientation(LinearLayout.HORIZONTAL);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setBackground(background(0xff131a25, 2, strokeColor));

        String enemyId = ec != null ? ec.enemyId : "";
        Bitmap icon = (enemyId != null && !enemyId.isEmpty()) ? EnemyPortraitAtlas.getIcon(this, enemyId) : null;
        chip.setPadding(icon != null ? dp(2) : dp(5), dp(1), dp(5), dp(1));
        if (icon != null) {
            ImageView iv = new ImageView(this);
            iv.setImageBitmap(icon);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(iconSizeDp), dp(iconSizeDp));
            ilp.rightMargin = dp(4);
            chip.addView(iv, ilp);
        }

        TextView label = new TextView(this);
        label.setTextSize(11f);
        label.setTypeface(prtsSans(false));
        label.setFontFeatureSettings("tnum");
        label.setSingleLine(true);
        SpannableStringBuilder sb = new SpannableStringBuilder();
        String rawName = (ec != null && ec.name != null && !ec.name.trim().isEmpty())
            ? ec.name.trim()
            : ((enemyId != null && !enemyId.trim().isEmpty()) ? enemyId.trim() : "敌怪");
        String shortName = rawName.length() > 7 ? rawName.substring(0, 7) : rawName;
        int count = ec != null ? Math.max(0, ec.count) : 0;
        appendColored(sb, shortName, 0xffe2e8f0);
        appendColored(sb, " ×" + count, countColor);
        label.setText(sb);
        chip.addView(label);

        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-2, -2);
        clp.rightMargin = dp(4);
        chip.setLayoutParams(clp);
        return chip;
    }

    private static boolean isBrandPlaceholderHeadline(String headline) {
        if (headline == null) return false;
        String h = headline.trim();
        return "PRTS".equals(h) || "卫戍战报仪".equals(h) || "PRTS Stronghold".equals(h) || "PRTS Stronghold Lite".equals(h);
    }

    private static boolean isStaleManualReportDetail(String detail) {
        if (detail == null) return false;
        String d = detail.trim();
        return d.contains("已录 0 回合")
            || (isBrandPlaceholderHeadline(pendingHeadline) && d.contains("已录") && d.contains("回合"));
    }

    private void renderGuideBody(
        BattleCaptureState.TelemetrySnapshot snap, boolean hasComp, boolean vpnRunning,
        boolean isUpgrade, boolean hasBanWarn, int curRound
    ) {
        guideEnemyChips.removeAllViews();
        boolean hasEnemyIcons = snap != null && vpnRunning && snap.forecastEnemies != null && !snap.forecastEnemies.isEmpty();
        boolean hasAllWaves = snap != null && vpnRunning && snap.allWaves != null && !snap.allWaves.isEmpty();
        guideAllWavesBtn.setVisibility((hasEnemyIcons && hasAllWaves && !stripLocked) ? View.VISIBLE : View.GONE);

        String progRight = hasComp && !pendingProgress.isEmpty()
            ? pendingProgress
            : (snap != null && snap.selfHp >= 0 ? ("♥" + snap.selfHp) : "");
        int progCol = progRight.contains("齐牌") ? 0xff34d399 : (progRight.startsWith("♥") && snap != null && snap.selfHp <= 5 ? 0xffff7875 : 0xffffe600);
        String noCompLiveMsg = String.format(Locale.US, "未选跟打方案 · 已同步 R%02d，点「展开」一键挑阵或切「漏兜」看 4 席态势", curRound);
        boolean staleManual = isStaleManualReportDetail(pendingDetail);

        if (!hasComp && !vpnRunning) {
            guideFocusRow.setVisibility(View.GONE);
            guideBodyView.setText("打开「确认本局信息」点「扫盟约」（或双击悬浮球）推荐阵容；或在主页开启「本机抓包」自动同步禁选、出怪与漏兜。");
        } else if (hasEnemyIcons) {
            guideFocusRow.setVisibility(View.VISIBLE);
            guideFocusRow.setBackgroundColor(0x1800e5ff);
            guideFocusAccent.setBackgroundColor(0xff00e5ff);
            String fcLabel = snap.forecastRound > curRound
                ? String.format(Locale.US, "下波 R%02d", snap.forecastRound)
                : String.format(Locale.US, "本波 R%02d", snap.forecastRound);
            guideFocusKey.setText(fcLabel);
            guideFocusKey.setTextColor(0xff00e5ff);
            guideEnemyScroll.setVisibility(View.VISIBLE);
            guideFocusFallbackVal.setVisibility(View.GONE);

            int maxItems = Math.min(6, snap.forecastEnemies.size());
            for (int i = 0; i < maxItems; i++) {
                guideEnemyChips.addView(buildEnemyChip(snap.forecastEnemies.get(i), 0xffffe600, 0xff28384e, 16));
            }
            if (!progRight.isEmpty()) {
                guideFocusProg.setVisibility(View.VISIBLE);
                guideFocusProg.setText(progRight);
                guideFocusProg.setTextColor(progCol);
            } else {
                guideFocusProg.setVisibility(View.GONE);
            }

            if (vpnRunning && (!hasComp || staleManual)) {
                guideBodyView.setText(noCompLiveMsg);
            } else {
                StringBuilder body = new StringBuilder();
                if (!pendingGrabHint.isEmpty()) body.append("抓：").append(pendingGrabHint).append(" ｜ ");
                if (!pendingDetail.isEmpty()) body.append(pendingDetail);
                else if (snap.banCount >= 0 && !hasComp) body.append("已自动同步 ").append(snap.banCount).append(" 项禁选，点「展开」一键选阵。");
                else body.append("实时抓包同步中，可点顶栏「漏兜」查看 4 人漏怪与协防图表。");
                guideBodyView.setText(body.toString());
            }
        } else if (hasBanWarn) {
            guideFocusRow.setVisibility(View.VISIBLE);
            guideFocusRow.setBackgroundColor(0x1af59e0b);
            guideFocusAccent.setBackgroundColor(0xfffbbf24);
            guideFocusKey.setText("受限替换");
            guideFocusKey.setTextColor(0xfffbbf24);
            guideEnemyScroll.setVisibility(View.GONE);
            guideFocusFallbackVal.setVisibility(View.VISIBLE);
            guideFocusFallbackVal.setText(pendingGrabHint.isEmpty() ? pendingBanWarning : (pendingBanWarning + " → 缺：" + pendingGrabHint));
            guideFocusProg.setVisibility(progRight.isEmpty() ? View.GONE : View.VISIBLE);
            guideFocusProg.setText(progRight);
            guideFocusProg.setTextColor(progCol);
            guideBodyView.setText((!pendingDetail.isEmpty() && !staleManual) ? pendingDetail : "当前阵容存在受限盟约，请核对替换组件或切换备选路线。");
        } else {
            boolean showFocus = hasComp && (!pendingGrabHint.isEmpty() || !progRight.isEmpty());
            guideFocusRow.setVisibility(showFocus ? View.VISIBLE : View.GONE);
            guideFocusRow.setBackgroundColor(0x14ffffff);
            guideFocusAccent.setBackgroundColor(0xff00e5ff);
            guideFocusKey.setText(isUpgrade ? "追核" : "抓牌");
            guideFocusKey.setTextColor(0xff00e5ff);
            guideEnemyScroll.setVisibility(View.GONE);
            guideFocusFallbackVal.setVisibility(View.VISIBLE);
            guideFocusFallbackVal.setText(!pendingGrabHint.isEmpty() ? pendingGrabHint : "本阶段核心已齐 · 追精锐");
            guideFocusProg.setVisibility(progRight.isEmpty() ? View.GONE : View.VISIBLE);
            guideFocusProg.setText(progRight);
            guideFocusProg.setTextColor(progCol);
            if (vpnRunning && (!hasComp || staleManual)) {
                guideBodyView.setText(noCompLiveMsg);
            } else {
                guideBodyView.setText((!pendingDetail.isEmpty() && !staleManual)
                    ? pendingDetail
                    : (vpnRunning ? "已连接本机抓包，进战斗后自动显示下波出怪图标与 4 人漏兜。" : "点 ◀ ▶ 切回合，或点顶栏「漏兜」看 4 人漏怪/兜底图表。"));
            }
        }
        guideBodyView.setMaxLines(stripBodyCompact ? 1 : 3);
    }

    private void renderLeakBody(BattleCaptureState.LeakSnapshot leakSnap, BattleCaptureState.TelemetrySnapshot snap, boolean vpnRunning) {
        leakGrid.removeAllViews();
        boolean liteMode = isLiteTelemetryMode();
        int maxMetric = 1;
        for (BattleCaptureState.SeatLeakRow row : leakSnap.seats) {
            if (row.leaked > maxMetric) maxMetric = row.leaked;
            if (row.assisted > maxMetric) maxMetric = row.assisted;
        }

        // Full 与 Lite 在「漏兜」态统一采用 2x2 紧凑宽卡（彻底解决 Full 4列窄卡昵称截成 2 字与盟约挤压问题）
        boolean twoByTwo = leakSnap.seats.size() > 1;
        leakGrid.setOrientation(twoByTwo ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        LinearLayout currentRow = null;

        for (int i = 0; i < leakSnap.seats.size(); i++) {
            BattleCaptureState.SeatLeakRow row = leakSnap.seats.get(i);
            if (twoByTwo && i % 2 == 0) {
                currentRow = new LinearLayout(this);
                currentRow.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rLp = new LinearLayout.LayoutParams(-1, -2);
                if (i > 0) rLp.topMargin = dp(3);
                leakGrid.addView(currentRow, rLp);
            }

            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(5), dp(2), dp(5), dp(2));
            int selfBg = liteMode ? 0x1a22d3ee : 0x1affe600;
            int selfBorder = liteMode ? 0x9922d3ee : 0x99ffe600;
            int cardBg = row.isSelf ? selfBg : (row.escaped > 0 ? 0x1aff4d4f : 0xff131a24);
            int cardBorder = row.isSelf ? selfBorder : (row.escaped > 0 ? 0x88ff4d4f : 0xff273244);
            card.setBackground(background(cardBg, 3, cardBorder));

            LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(0, -2, 1f);
            if (twoByTwo) {
                if (i % 2 == 1) cardLp.leftMargin = dp(4);
            } else if (i > 0) {
                cardLp.leftMargin = dp(4);
            }

            // Card Top: [我] Name   ♥HP 本数
            LinearLayout head = new LinearLayout(this);
            head.setOrientation(LinearLayout.HORIZONTAL);
            head.setGravity(Gravity.CENTER_VERTICAL);

            if (row.isSelf) {
                TextView me = new TextView(this);
                me.setText("我");
                me.setTextSize(10f);
                me.setTypeface(prtsSans(true));
                me.setTextColor(0xff0b0d11);
                me.setPadding(dp(3), 0, dp(3), 0);
                int meCol = liteMode ? 0xff22d3ee : 0xffffe600;
                me.setBackground(background(meCol, 1, meCol));
                LinearLayout.LayoutParams meLp = new LinearLayout.LayoutParams(-2, -2);
                meLp.rightMargin = dp(3);
                head.addView(me, meLp);
            }

            TextView nameTv = new TextView(this);
            nameTv.setText(row.name);
            nameTv.setTextSize(11.5f);
            nameTv.setTypeface(prtsSans(row.isSelf));
            nameTv.setTextColor(row.isSelf ? (liteMode ? 0xff67e8f9 : 0xfffff8b0) : 0xffe2e8f0);
            nameTv.setSingleLine(true);
            nameTv.setEllipsize(TextUtils.TruncateAt.END);
            head.addView(nameTv, new LinearLayout.LayoutParams(0, -2, 1f));

            TextView hpTv = new TextView(this);
            SpannableStringBuilder hpSb = new SpannableStringBuilder();
            if (row.hp >= 0) {
                int hpCol = row.hp <= 5 ? 0xffff7875 : (row.hp >= 15 ? 0xff34d399 : 0xffcbd5e1);
                appendColored(hpSb, "♥" + row.hp, hpCol);
            } else {
                appendColored(hpSb, "—", 0xff64748b);
            }
            if (row.shopLevel >= 1 && row.shopLevel <= 6) {
                appendColored(hpSb, " " + row.shopLevel + "本", 0xff38bdf8);
            }
            hpTv.setText(hpSb);
            hpTv.setTextSize(10.5f);
            hpTv.setTypeface(prtsSans(true));
            hpTv.setFontFeatureSettings("tnum");
            hpTv.setSingleLine(true);
            head.addView(hpTv);
            card.addView(head);

            // Active Covenants Line (支持最高 999 层、单行最多 3 枚高亮胶囊 + 醒目 +N 溢出)
            if (row.bonds != null && !row.bonds.isEmpty()) {
                List<BattleCaptureState.BondStatus> visibleBonds = new java.util.ArrayList<>();
                for (BattleCaptureState.BondStatus bs : row.bonds) {
                    if (bs.active || bs.count >= 2) {
                        visibleBonds.add(bs);
                    }
                }
                if (!visibleBonds.isEmpty()) {
                    LinearLayout bondRow = new LinearLayout(this);
                    bondRow.setOrientation(LinearLayout.HORIZONTAL);
                    bondRow.setGravity(Gravity.CENTER_VERTICAL);
                    LinearLayout.LayoutParams bLp = new LinearLayout.LayoutParams(-1, -2);
                    bLp.topMargin = dp(2);

                    int maxShown = 3;
                    int shownCount = Math.min(maxShown, visibleBonds.size());
                    int hiddenCount = Math.max(0, visibleBonds.size() - shownCount);
                    StringBuilder allBondsSb = new StringBuilder();
                    for (int bi = 0; bi < visibleBonds.size(); bi++) {
                        BattleCaptureState.BondStatus bs = visibleBonds.get(bi);
                        int c = Math.min(999, Math.max(0, bs.count));
                        if (bi > 0) allBondsSb.append(" · ");
                        allBondsSb.append(bs.name).append(' ').append(c);
                    }

                    for (int bi = 0; bi < shownCount; bi++) {
                        BattleCaptureState.BondStatus bs = visibleBonds.get(bi);
                        int displayCount = Math.min(999, Math.max(0, bs.count));
                        boolean isMax = displayCount >= 500;
                        boolean isHigh = displayCount >= 100;
                        int chipBg = isMax
                            ? 0x44f59e0b
                            : isHigh
                                ? 0x2efacc15
                                : bs.active
                                    ? 0x2622d3ee
                                    : 0x1e94a3b8;
                        int chipStroke = isMax
                            ? 0xebfbbf24
                            : isHigh
                                ? 0xaefacc15
                                : bs.active
                                    ? 0x7322d3ee
                                    : 0x4894a3b8;
                        int chipFg = isMax
                            ? 0xfffff08a
                            : isHigh
                                ? 0xfffde047
                                : bs.active
                                    ? 0xff67e8f9
                                    : 0xff94a3b8;

                        String shortName = bs.name.length() > 2 ? bs.name.substring(0, 2) : bs.name;
                        TextView chip = new TextView(this);
                        chip.setText(shortName + displayCount);
                        chip.setTextSize(9.5f);
                        chip.setTypeface(prtsSans(true));
                        chip.setFontFeatureSettings("tnum");
                        chip.setSingleLine(true);
                        chip.setTextColor(chipFg);
                        chip.setPadding(dp(3), 0, dp(3), 0);
                        chip.setBackground(background(chipBg, 2, chipStroke));
                        LinearLayout.LayoutParams cLp = new LinearLayout.LayoutParams(-2, -2);
                        if (bi > 0) cLp.leftMargin = dp(2);
                        bondRow.addView(chip, cLp);
                    }

                    if (hiddenCount > 0) {
                        final String allBondsText = row.name + " 盟约：" + allBondsSb.toString();
                        TextView moreTv = new TextView(this);
                        moreTv.setText("+" + hiddenCount);
                        moreTv.setTextSize(9.5f);
                        moreTv.setTypeface(prtsNumeric(true));
                        moreTv.setFontFeatureSettings("tnum");
                        moreTv.setSingleLine(true);
                        moreTv.setTextColor(0xff7dd3fc);
                        moreTv.setPadding(dp(3), 0, dp(3), 0);
                        moreTv.setBackground(background(0x2438bdf8, 2, 0x7338bdf8));
                        if (!stripLocked) {
                            moreTv.setOnClickListener(v -> Toast.makeText(OverlayService.this, allBondsText, Toast.LENGTH_SHORT).show());
                        }
                        LinearLayout.LayoutParams mLp = new LinearLayout.LayoutParams(-2, -2);
                        mLp.leftMargin = dp(2);
                        bondRow.addView(moreTv, mLp);
                    }
                    card.addView(bondRow, bLp);
                }
            }

            // Track 1: 兜 (帮队友兜底，纯青色直条)
            SpannableStringBuilder assistNum = new SpannableStringBuilder();
            if (row.assisted > 0) {
                appendColored(assistNum, "+" + row.assisted, 0xff67e8f9);
            } else {
                appendColored(assistNum, "0", 0xff475569);
            }
            card.addView(buildDualMetricRow(
                "兜",
                row.assisted > 0 ? 0xff00e5ff : 0xff64748b,
                (float) row.assisted, 0xff00e5ff,
                0f, 0,
                (float) maxMetric,
                assistNum
            ));

            // Track 2: 漏 (本人漏怪：橙色已兜 + 猩红逃逸)
            SpannableStringBuilder leakNum = new SpannableStringBuilder();
            if (row.leaked == 0) {
                appendColored(leakNum, "0", 0xff475569);
            } else if (row.escaped == 0) {
                appendColored(leakNum, String.valueOf(row.leaked), 0xfffbbf24);
            } else {
                appendColored(leakNum, String.valueOf(row.leaked), 0xfffbbf24);
                appendColored(leakNum, " 逃" + row.escaped, 0xffff6b6b);
            }
            card.addView(buildDualMetricRow(
                "漏",
                row.escaped > 0 ? 0xffff6b6b : (row.leaked > 0 ? 0xfffbbf24 : 0xff64748b),
                (float) row.covered, 0xfffb923c,
                (float) row.escaped, 0xffff4d4f,
                (float) maxMetric,
                leakNum
            ));

            if (twoByTwo && currentRow != null) {
                currentRow.addView(card, cardLp);
            } else {
                leakGrid.addView(card, cardLp);
            }
        }

        // Full 与 Lite 漏兜页统一在 2x2 卡片下方单行并排展示「下Rxx ｜ 预Rxx」实机怪物图标芯片（Boss 波红、首波按品牌区分）
        leakNextWavesBox.removeAllViews();
        if (snap != null && snap.nextTwoWaves != null && !snap.nextTwoWaves.isEmpty()) {
            leakNextWavesBox.setVisibility(View.VISIBLE);
            LinearLayout dualWaveRow = new LinearLayout(this);
            dualWaveRow.setOrientation(LinearLayout.HORIZONTAL);
            dualWaveRow.setGravity(Gravity.CENTER_VERTICAL);
            int firstAccent = liteMode ? 0xff22d3ee : 0xffffe600;
            int firstBg = liteMode ? 0x1a22d3ee : 0x1affe600;
            int firstBorder = liteMode ? 0x6622d3ee : 0x66ffe600;
            int firstTagFg = liteMode ? 0xff061018 : 0xff0b0d11;
            int waveLimit = Math.min(2, snap.nextTwoWaves.size());
            for (int wIdx = 0; wIdx < waveLimit; wIdx++) {
                BattleCaptureState.RoundWave w = snap.nextTwoWaves.get(wIdx);
                boolean isBossWave = w.round >= 14;
                LinearLayout wCell = new LinearLayout(this);
                wCell.setOrientation(LinearLayout.HORIZONTAL);
                wCell.setGravity(Gravity.CENTER_VERTICAL);
                wCell.setPadding(dp(4), dp(2), dp(4), dp(2));
                int wBg = isBossWave ? 0x22ff4d4f : (wIdx == 0 ? firstBg : 0xff0d1520);
                int wBorder = isBossWave ? 0x88ff4d4f : (wIdx == 0 ? firstBorder : 0xff223044);
                wCell.setBackground(background(wBg, 2, wBorder));
                LinearLayout.LayoutParams wcLp = new LinearLayout.LayoutParams(0, -2, 1f);
                if (wIdx > 0) wcLp.leftMargin = dp(4);

                TextView tag = new TextView(this);
                tag.setText(String.format(Locale.US, "%sR%02d", wIdx == 0 ? "下" : "预", w.round));
                tag.setTextSize(10f);
                tag.setTypeface(prtsSans(true));
                tag.setFontFeatureSettings("tnum");
                tag.setTextColor(isBossWave ? 0xffffffff : (wIdx == 0 ? firstTagFg : 0xff7dd3fc));
                tag.setPadding(dp(3), dp(1), dp(3), dp(1));
                int tagBg = isBossWave ? 0xffff4d4f : (wIdx == 0 ? firstAccent : 0xff1e3a5f);
                tag.setBackground(background(tagBg, 2, tagBg));
                LinearLayout.LayoutParams tLp = new LinearLayout.LayoutParams(-2, -2);
                tLp.rightMargin = dp(4);
                wCell.addView(tag, tLp);

                HorizontalScrollView hsv = new HorizontalScrollView(this);
                hsv.setHorizontalScrollBarEnabled(false);
                hsv.setOverScrollMode(View.OVER_SCROLL_NEVER);
                LinearLayout chips = new LinearLayout(this);
                chips.setOrientation(LinearLayout.HORIZONTAL);
                chips.setGravity(Gravity.CENTER_VERTICAL);
                List<BattleCaptureState.EnemyCount> waveEnemies = w.enemies != null
                    ? w.enemies
                    : java.util.Collections.<BattleCaptureState.EnemyCount>emptyList();
                int maxE = waveLimit >= 2 ? Math.min(4, waveEnemies.size()) : Math.min(6, waveEnemies.size());
                for (int j = 0; j < maxE; j++) {
                    chips.addView(buildEnemyChip(waveEnemies.get(j), isBossWave ? 0xfffca5a5 : 0xfffde047, 0xff243347, 13));
                }
                hsv.addView(chips, new FrameLayout.LayoutParams(-2, -2));
                wCell.addView(hsv, new LinearLayout.LayoutParams(0, -2, 1f));
                dualWaveRow.addView(wCell, wcLp);
            }
            leakNextWavesBox.addView(dualWaveRow, new LinearLayout.LayoutParams(-1, -2));
        } else {
            leakNextWavesBox.setVisibility(View.GONE);
        }

        // Bottom leaked enemy real-icon strip (零漏时自动折叠隐藏，省出 26dp 纵向空间)
        leakEnemyChips.removeAllViews();
        boolean hasLeakedEnemies = leakSnap.enemies != null && !leakSnap.enemies.isEmpty();
        if (hasLeakedEnemies) {
            leakFooterRow.setVisibility(View.VISIBLE);
            leakFooterTag.setText(leakSnap.round == 0
                ? String.format(Locale.US, "累计高漏(%d)", leakSnap.totalLeaks)
                : String.format(Locale.US, "R%02d漏怪(%d)", leakSnap.round, leakSnap.totalLeaks));
            int maxKinds = Math.min(6, leakSnap.enemies.size());
            for (int i = 0; i < maxKinds; i++) {
                leakEnemyChips.addView(buildEnemyChip(leakSnap.enemies.get(i), 0xffff7875, 0x77ff4d4f, 14));
            }
        } else {
            leakFooterRow.setVisibility(View.GONE);
        }
    }

    private LinearLayout buildDualMetricRow(
        String label,
        int labelColor,
        float primaryVal,
        int primaryColor,
        float secondaryVal,
        int secondaryColor,
        float maxScale,
        CharSequence rightText
    ) {
        LinearLayout rowView = new LinearLayout(this);
        rowView.setOrientation(LinearLayout.HORIZONTAL);
        rowView.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams rLp = new LinearLayout.LayoutParams(-1, -2);
        rLp.topMargin = dp(2);
        rowView.setLayoutParams(rLp);

        TextView tag = new TextView(this);
        tag.setText(label);
        tag.setTextSize(10.5f);
        tag.setTypeface(prtsSans(true));
        tag.setTextColor(labelColor);
        tag.setSingleLine(true);
        LinearLayout.LayoutParams tagLp = new LinearLayout.LayoutParams(-2, -2);
        tagLp.rightMargin = dp(4);
        rowView.addView(tag, tagLp);

        LinearLayout track = new LinearLayout(this);
        track.setOrientation(LinearLayout.HORIZONTAL);
        track.setBackground(background(0xff0b0f16, 2, 0xff1f2a3a));
        track.setPadding(dp(1), dp(1), dp(1), dp(1));
        float fill = Math.min(maxScale, Math.max(0f, primaryVal + secondaryVal));
        float rem = Math.max(0f, maxScale - fill);
        addBarSegment(track, primaryVal, primaryColor);
        addBarSegment(track, secondaryVal, secondaryColor);
        addBarSegment(track, rem, 0x00000000);
        rowView.addView(track, new LinearLayout.LayoutParams(0, dp(5), 1f));

        TextView num = new TextView(this);
        num.setText(rightText);
        num.setTextSize(10.5f);
        num.setTypeface(prtsSans(true));
        num.setFontFeatureSettings("tnum");
        num.setSingleLine(true);
        num.setGravity(Gravity.END);
        LinearLayout.LayoutParams numLp = new LinearLayout.LayoutParams(-2, -2);
        numLp.leftMargin = dp(4);
        rowView.addView(num, numLp);
        return rowView;
    }

    private void addBarSegment(LinearLayout track, float weight, int color) {
        if (weight <= 0f) return;
        View seg = new View(this);
        seg.setBackgroundColor(color);
        track.addView(seg, new LinearLayout.LayoutParams(0, -1, weight));
    }

    private void renderLogsBody(BattleCaptureState.TelemetrySnapshot snap, boolean vpnRunning) {
        logsList.removeAllViews();
        List<BattleCaptureState.EventLogEntry> logs = snap != null ? snap.recentLogs : null;
        if (logs == null || logs.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText(vpnRunning ? "本机抓包已就绪，进入战斗后自动推送毫秒级 Logs 流水…" : "请开启本机抓包，战斗中实时回显漏怪、兜底与升本流水");
            empty.setTextSize(11.5f);
            empty.setTypeface(prtsSans(false));
            empty.setTextColor(0xff94a3b8);
            empty.setPadding(dp(4), dp(6), dp(4), dp(6));
            logsList.addView(empty);
            return;
        }
        SimpleDateFormat fmt = new SimpleDateFormat("HH:mm:ss", Locale.US);
        int limit = Math.min(6, logs.size());
        for (int i = 0; i < limit; i++) {
            BattleCaptureState.EventLogEntry entry = logs.get(i);
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(5), dp(3), dp(5), dp(3));

            int rowBg = 0xff0d141f;
            int badgeBg = 0xff1e3a5f;
            int badgeFg = 0xff7dd3fc;
            int borderCol = 0xff223044;
            String tagText = "事件";
            if ("escape".equals(entry.kind)) {
                rowBg = 0x22ff4d4f;
                badgeBg = 0xffff4d4f;
                badgeFg = 0xffffffff;
                borderCol = 0x88ff4d4f;
                tagText = "逃逸";
            } else if ("assist".equals(entry.kind)) {
                rowBg = 0x1c00e5ff;
                badgeBg = 0xff00e5ff;
                badgeFg = 0xff061018;
                borderCol = 0x6600e5ff;
                tagText = "帮兜";
            } else if ("leak".equals(entry.kind)) {
                rowBg = 0x1cf59e0b;
                badgeBg = 0xfff59e0b;
                badgeFg = 0xff0b0d11;
                borderCol = 0x66f59e0b;
                tagText = "漏怪";
            } else if ("tier".equals(entry.kind)) {
                tagText = "升本";
            } else if ("boss".equals(entry.kind)) {
                rowBg = 0x22ff4d4f;
                badgeBg = 0xffb91c1c;
                badgeFg = 0xffffffff;
                borderCol = 0x88ff4d4f;
                tagText = "首领";
            } else if ("match".equals(entry.kind)) {
                badgeBg = 0xff22d3ee;
                badgeFg = 0xff061018;
                tagText = "开局";
            }
            row.setBackground(background(rowBg, 2, borderCol));
            LinearLayout.LayoutParams rLp = new LinearLayout.LayoutParams(-1, -2);
            if (i > 0) rLp.topMargin = dp(3);

            TextView tsTv = new TextView(this);
            tsTv.setText(String.format(Locale.US, "R%02d %s", Math.max(1, entry.round), fmt.format(new Date(entry.tsMs))));
            tsTv.setTextSize(10.5f);
            tsTv.setTypeface(prtsNumeric(false));
            tsTv.setFontFeatureSettings("tnum");
            tsTv.setTextColor(0xff64748b);
            tsTv.setSingleLine(true);
            LinearLayout.LayoutParams tsLp = new LinearLayout.LayoutParams(-2, -2);
            tsLp.rightMargin = dp(4);
            row.addView(tsTv, tsLp);

            TextView badge = new TextView(this);
            badge.setText(tagText);
            badge.setTextSize(10.5f);
            badge.setTypeface(prtsSans(true));
            badge.setTextColor(badgeFg);
            badge.setPadding(dp(4), dp(1), dp(4), dp(1));
            badge.setBackground(background(badgeBg, 2, badgeBg));
            LinearLayout.LayoutParams bLp = new LinearLayout.LayoutParams(-2, -2);
            bLp.rightMargin = dp(5);
            row.addView(badge, bLp);

            if (entry.enemyId != null && !entry.enemyId.isEmpty()) {
                Bitmap bmp = EnemyPortraitAtlas.getIcon(this, entry.enemyId);
                if (bmp != null) {
                    ImageView iv = new ImageView(this);
                    iv.setImageBitmap(bmp);
                    iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
                    LinearLayout.LayoutParams ivLp = new LinearLayout.LayoutParams(dp(14), dp(14));
                    ivLp.rightMargin = dp(4);
                    row.addView(iv, ivLp);
                }
            }

            TextView msg = new TextView(this);
            SpannableStringBuilder sb = new SpannableStringBuilder();
            if ("assist".equals(entry.kind)) {
                appendColored(sb, entry.actorName, 0xff67e8f9);
                appendColored(sb, " 帮兜 ", 0xff94a3b8);
                if (!entry.targetName.isEmpty()) appendColored(sb, entry.targetName + " ", 0xffe2e8f0);
                if (!entry.enemyName.isEmpty()) appendColored(sb, entry.enemyName, 0xfffef08a);
            } else if ("escape".equals(entry.kind) || "leak".equals(entry.kind)) {
                appendColored(sb, entry.actorName + " ", "escape".equals(entry.kind) ? 0xffff8080 : 0xfffbbf24);
                appendColored(sb, !entry.enemyName.isEmpty() ? entry.enemyName : entry.detail, 0xffe2e8f0);
            } else if ("tier".equals(entry.kind)) {
                appendColored(sb, entry.actorName + " ", 0xffe2e8f0);
                appendColored(sb, entry.detail, 0xff7dd3fc);
            } else {
                appendColored(sb, !entry.enemyName.isEmpty() ? (entry.detail + " · " + entry.enemyName) : entry.detail, 0xffe2e8f0);
            }
            msg.setText(sb);
            msg.setTextSize(11f);
            msg.setTypeface(prtsSans(false));
            msg.setSingleLine(true);
            msg.setEllipsize(TextUtils.TruncateAt.END);
            row.addView(msg, new LinearLayout.LayoutParams(0, -2, 1f));
            logsList.addView(row, rLp);
        }
    }

    private void renderAllWavesBody(BattleCaptureState.TelemetrySnapshot snap, int curRound) {
        wavesList.removeAllViews();
        List<BattleCaptureState.RoundWave> waves = snap != null ? snap.allWaves : null;
        if (waves == null || waves.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("暂无已同步波次数据，请进入对局后查看。");
            empty.setTextSize(11.5f);
            empty.setTypeface(prtsSans(false));
            empty.setTextColor(0xff94a3b8);
            empty.setPadding(dp(4), dp(8), dp(4), dp(8));
            wavesList.addView(empty);
            return;
        }
        int scrollH = waves.size() > 5 ? dp(168) : WindowManager.LayoutParams.WRAP_CONTENT;
        LinearLayout.LayoutParams wsLp = new LinearLayout.LayoutParams(-1, scrollH);
        wsLp.topMargin = dp(4);
        wavesScroll.setLayoutParams(wsLp);

        int nextRound = snap.forecastRound > curRound ? snap.forecastRound : Math.min(15, curRound + 1);
        for (int i = 0; i < waves.size(); i++) {
            BattleCaptureState.RoundWave w = waves.get(i);
            boolean isCur = w.round == curRound;
            boolean isNext = w.round == nextRound;
            boolean isBossWave = w.round >= 14;
            boolean isPast = w.round < curRound;

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(4), dp(3), dp(4), dp(3));
            int rowBg = isCur ? 0x1affe600 : (isNext ? 0x1800e5ff : (isBossWave ? 0x18ff4d4f : 0xff111720));
            int rowBorder = isCur ? 0x88ffe600 : (isNext ? 0x8800e5ff : (isBossWave ? 0x77ff4d4f : 0xff222d3d));
            row.setBackground(background(rowBg, 3, rowBorder));
            if (isPast) row.setAlpha(0.56f);

            TextView rBadge = new TextView(this);
            rBadge.setText(isBossWave ? String.format(Locale.US, "R%02d·B", w.round) : String.format(Locale.US, "R%02d", w.round));
            rBadge.setTextSize(10.5f);
            rBadge.setTypeface(prtsNumeric(true));
            rBadge.setFontFeatureSettings("tnum");
            int rbBg = isBossWave ? 0xffff4d4f : (isCur ? 0xffffe600 : (isNext ? 0xff00e5ff : 0xff1e293b));
            int rbFg = (isCur || isNext) && !isBossWave ? 0xff0b0d11 : 0xffffffff;
            rBadge.setTextColor(rbFg);
            rBadge.setGravity(Gravity.CENTER);
            rBadge.setPadding(dp(4), dp(2), dp(4), dp(2));
            rBadge.setMinWidth(dp(32));
            rBadge.setBackground(background(rbBg, 2, rbBg));
            LinearLayout.LayoutParams rbLp = new LinearLayout.LayoutParams(-2, -2);
            rbLp.rightMargin = dp(5);
            row.addView(rBadge, rbLp);

            HorizontalScrollView hsv = new HorizontalScrollView(this);
            hsv.setHorizontalScrollBarEnabled(false);
            hsv.setOverScrollMode(View.OVER_SCROLL_NEVER);
            LinearLayout chips = new LinearLayout(this);
            chips.setOrientation(LinearLayout.HORIZONTAL);
            chips.setGravity(Gravity.CENTER_VERTICAL);
            for (BattleCaptureState.EnemyCount ec : w.enemies) {
                chips.addView(buildEnemyChip(ec, isBossWave ? 0xfffca5a5 : 0xffffe600,
                    isBossWave ? 0x77ff4d4f : 0xff28384e, 15));
            }
            hsv.addView(chips, new FrameLayout.LayoutParams(-2, -2));
            row.addView(hsv, new LinearLayout.LayoutParams(0, -2, 1f));

            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(-1, -2);
            if (i > 0) rowLp.topMargin = dp(3);
            wavesList.addView(row, rowLp);
        }
    }

    private void renderDpsBody(BattleCaptureState.BossSnapshot boss) {
        // Boss HP progress bar
        float hpWeight = boss.hpPct >= 0 ? Math.max(0f, Math.min(100f, (float) boss.hpPct)) : 0f;
        bossHpFill.setVisibility(hpWeight > 0f ? View.VISIBLE : View.GONE);
        bossHpFill.setLayoutParams(new LinearLayout.LayoutParams(0, -1, Math.max(0.01f, hpWeight)));
        bossHpRest.setLayoutParams(new LinearLayout.LayoutParams(0, -1, Math.max(0.01f, 100f - hpWeight)));

        if (boss.hpPct >= 0) {
            bossHpLeftText.setText(String.format(Locale.US, "BOSS HP %d%% · 余 %s", boss.hpPct, fmtWan(boss.bossHp)));
        } else if (boss.bossHp >= 0) {
            bossHpLeftText.setText("BOSS 余 " + fmtWan(boss.bossHp));
        } else {
            bossHpLeftText.setText("BOSS 决战 · 等待血量同步");
        }

        if (boss.teamDamage > 0) {
            bossHpRightText.setText(String.format(Locale.US, "全队 %s · %s/s · %s",
                fmtWan(boss.teamDamage), fmtComma(boss.teamDps), fmtMmSs(boss.elapsedSec)));
        } else {
            bossHpRightText.setText("00:00");
        }

        // MMO 4 horizontal ranking rows (#1 -> #4)
        bossRankList.removeAllViews();
        int topDmg = 1;
        for (BattleCaptureState.BossPlayerRow p : boss.players) {
            if (p.damage > topDmg) topDmg = p.damage;
        }

        int[][] barPalettes = {
            { 0xff0e5c70, 0xff0891b2 }, // cyan
            { 0xff4c1d95, 0xff7c3aed }, // violet
            { 0xff1e3a5f, 0xff2563eb }, // blue
            { 0xff273244, 0xff475569 }, // slate
        };

        int peerColorIdx = 0;
        for (int i = 0; i < boss.players.size(); i++) {
            BattleCaptureState.BossPlayerRow p = boss.players.get(i);
            FrameLayout row = new FrameLayout(this);
            row.setBackground(background(0xff11161f, 2, p.isSelf ? 0x99ffe600 : 0xff232d3d));
            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(-1, dp(24));
            if (i > 0) rowLp.topMargin = dp(3);

            // Proportional gradient fill (#1 = 100%)
            if (p.damage > 0) {
                float pct = Math.max(4f, Math.min(100f, p.damage * 100f / topDmg));
                LinearLayout bgTrack = new LinearLayout(this);
                bgTrack.setOrientation(LinearLayout.HORIZONTAL);
                View fill = new View(this);
                int startC, endC;
                if (p.isSelf) {
                    startC = 0xff7c6506;
                    endC = 0xffd4b106;
                } else {
                    int[] pal = barPalettes[Math.min(peerColorIdx++, barPalettes.length - 1)];
                    startC = pal[0];
                    endC = pal[1];
                }
                fill.setBackground(gradientBar(startC, endC, 2));
                fill.setAlpha(0.72f);
                bgTrack.addView(fill, new LinearLayout.LayoutParams(0, -1, pct));
                if (pct < 100f) {
                    bgTrack.addView(new View(this), new LinearLayout.LayoutParams(0, -1, 100f - pct));
                }
                row.addView(bgTrack, new FrameLayout.LayoutParams(-1, -1));
            } else if (!p.isSelf) {
                peerColorIdx++;
            }

            // Foreground metrics row: #rank [我] Name    Total  DPS/s  Share%
            LinearLayout fg = new LinearLayout(this);
            fg.setOrientation(LinearLayout.HORIZONTAL);
            fg.setGravity(Gravity.CENTER_VERTICAL);
            fg.setPadding(dp(6), 0, dp(6), 0);

            TextView rankTv = new TextView(this);
            rankTv.setText("#" + p.rank);
            rankTv.setTextSize(11f);
            rankTv.setTypeface(prtsNumeric(true));
            rankTv.setFontFeatureSettings("tnum");
            rankTv.setTextColor(p.rank == 1 ? 0xffffe600 : (p.isSelf ? 0xfffef08a : 0xff94a3b8));
            rankTv.setMinWidth(dp(22));
            fg.addView(rankTv);

            if (p.isSelf) {
                TextView me = new TextView(this);
                me.setText("我");
                me.setTextSize(10f);
                me.setTypeface(prtsSans(true));
                me.setTextColor(0xff0b0d11);
                me.setPadding(dp(3), 0, dp(3), 0);
                me.setBackground(background(0xffffe600, 1, 0xffffe600));
                LinearLayout.LayoutParams meLp = new LinearLayout.LayoutParams(-2, -2);
                meLp.rightMargin = dp(4);
                fg.addView(me, meLp);
            }

            TextView nameTv = new TextView(this);
            nameTv.setText(p.name);
            nameTv.setTextSize(11.5f);
            nameTv.setTypeface(prtsSans(true));
            nameTv.setTextColor(0xffffffff);
            nameTv.setSingleLine(true);
            nameTv.setEllipsize(TextUtils.TruncateAt.END);
            fg.addView(nameTv, new LinearLayout.LayoutParams(0, -2, 1f));

            TextView dmgTv = new TextView(this);
            dmgTv.setText(p.damage > 0 ? fmtWan(p.damage) : "—");
            dmgTv.setTextSize(11.5f);
            dmgTv.setTypeface(prtsNumeric(true));
            dmgTv.setFontFeatureSettings("tnum");
            dmgTv.setTextColor(0xffffffff);
            dmgTv.setGravity(Gravity.END);
            dmgTv.setMinWidth(dp(42));
            fg.addView(dmgTv);

            TextView dpsTv = new TextView(this);
            dpsTv.setText(p.dps > 0 ? (fmtComma(p.dps) + "/s") : "0/s");
            dpsTv.setTextSize(11f);
            dpsTv.setTypeface(prtsNumeric(false));
            dpsTv.setFontFeatureSettings("tnum");
            dpsTv.setTextColor(p.isSelf ? 0xfffef08a : 0xffbae6fd);
            dpsTv.setGravity(Gravity.END);
            dpsTv.setMinWidth(dp(50));
            LinearLayout.LayoutParams dpsLp = new LinearLayout.LayoutParams(-2, -2);
            dpsLp.leftMargin = dp(5);
            fg.addView(dpsTv, dpsLp);

            TextView shareTv = new TextView(this);
            shareTv.setText(String.format(Locale.US, "%.1f%%", p.sharePct));
            shareTv.setTextSize(11f);
            shareTv.setTypeface(prtsNumeric(true));
            shareTv.setFontFeatureSettings("tnum");
            shareTv.setTextColor(0xffe2e8f0);
            shareTv.setGravity(Gravity.END);
            shareTv.setMinWidth(dp(38));
            LinearLayout.LayoutParams shLp = new LinearLayout.LayoutParams(-2, -2);
            shLp.leftMargin = dp(4);
            fg.addView(shareTv, shLp);

            row.addView(fg, new FrameLayout.LayoutParams(-1, -1));
            bossRankList.addView(row, rowLp);
        }
    }

    private void refreshStripAndBallContent() {
        if (ball != null && !CovenantScanState.scanning()) {
            setBallScanning(false);
        }
        if (strip == null) return;

        BattleCaptureState.TelemetrySnapshot snap = liveTelemetry;
        boolean vpnRunning = snap != null && snap.vpnRunning;
        boolean brandOnlyHeadline = isBrandPlaceholderHeadline(pendingHeadline);
        boolean hasComp = !pendingHeadline.isEmpty() && !brandOnlyHeadline;
        int curRound = effectiveCurrentRound();
        int selfShopLevel = 0;
        if (snap != null && snap.cumulativeLeak != null && snap.cumulativeLeak.seats != null) {
            for (BattleCaptureState.SeatLeakRow seatRow : snap.cumulativeLeak.seats) {
                if (seatRow != null && seatRow.isSelf && seatRow.shopLevel >= 1 && seatRow.shopLevel <= 6) {
                    selfShopLevel = seatRow.shopLevel;
                    break;
                }
            }
        }
        int displayTier = hasComp ? pendingTier : selfShopLevel;
        boolean isBossContext = (pendingRound >= 14)
            || (snap != null && ("boss".equals(snap.phase) || snap.currentRound >= 14 || snap.boss.teamDamage > 0 || snap.boss.bossHp >= 0));
        boolean isUpgrade = hasComp && !isBossContext && pendingTier >= 2 && pendingPrevTier > 0 && pendingTier > pendingPrevTier;
        boolean hasBanWarn = hasComp && !pendingBanWarning.isEmpty();

        boolean liteMode = isLiteTelemetryMode();
        // Boss 阶段自动切 [DPS]（每回合仅自动触发一次，不覆盖用户手动切换）
        if (isBossContext) {
            if (autoSwitchedBossRound != curRound) {
                autoSwitchedBossRound = curRound;
                stripTab = "dps";
            }
        } else {
            autoSwitchedBossRound = 0;
            if ("dps".equals(stripTab)) stripTab = liteMode ? "leak" : "guide";
        }
        if (liteMode && ("guide".equals(stripTab) || "logs".equals(stripTab))) {
            stripTab = "leak";
        }

        // 若处于漏兜单回合但尚未初始化回合号，跟随当前回合
        if (leakSelectedRound < 1 || leakSelectedRound > 15) leakSelectedRound = curRound;

        // 1. 顶部模式胶囊与控件可见性
        boolean inLeak = "leak".equals(stripTab);
        boolean inLogs = false;
        boolean inDps = "dps".equals(stripTab);
        boolean inWaves = "waves".equals(stripTab);
        boolean inGuide = !liteMode && !inLeak && !inDps && !inWaves;

        boolean showStepper = !stripLocked && ((inGuide && hasComp) || inLeak);
        stripPrevBtn.setVisibility(showStepper ? View.VISIBLE : View.GONE);
        stripNextBtn.setVisibility(showStepper ? View.VISIBLE : View.GONE);
        stripScanBtn.setVisibility((!liteMode && !stripLocked && inGuide && !hasComp && !vpnRunning) ? View.VISIBLE : View.GONE);
        stripLeakScopeBox.setVisibility((!stripLocked && inLeak) ? View.VISIBLE : View.GONE);

        stripTabDpsBtn.setVisibility(isBossContext ? View.VISIBLE : View.GONE);
        stripTabGuideBtn.setVisibility(liteMode ? View.GONE : View.VISIBLE);
        stripTabLogsBtn.setVisibility(View.GONE);
        stripTabWavesBtn.setVisibility(liteMode ? View.VISIBLE : View.GONE);

        int activeLeakCount = snap != null ? snap.currentRoundLeak.totalLeaks : 0;
        stripTabLeakBtn.setText(activeLeakCount > 0 ? ("漏兜·" + activeLeakCount) : "漏兜");
        stripTabGuideBtn.setText(inWaves ? "返回" : "跟打");

        styleCapsuleChip(stripTabDpsBtn, inDps, 0xffff4d4f, 0xffffffff, 0xfffca5a5);
        styleCapsuleChip(stripTabGuideBtn, inGuide || inWaves, inWaves ? 0xff00e5ff : 0xffffe600, 0xff0b0d11, 0xffcbd5e1);
        styleCapsuleChip(stripTabLeakBtn, inLeak, activeLeakCount > 0 ? 0xffff7a00 : (liteMode ? 0xff22d3ee : 0xff00e5ff), 0xff0b0d11,
            activeLeakCount > 0 ? 0xfffdba74 : 0xff67e8f9);
        styleCapsuleChip(stripTabLogsBtn, inLogs, 0xff22d3ee, 0xff061018, 0xffcbd5e1);
        styleCapsuleChip(stripTabWavesBtn, inWaves, 0xff22d3ee, 0xff061018, 0xffcbd5e1);
        styleCapsuleChip(stripScopeCumBtn, leakCumulative, 0xff00e5ff, 0xff0b0d11, 0xff94a3b8);
        styleCapsuleChip(stripScopeRoundBtn, !leakCumulative, 0xffff7a00, 0xff0b0d11, 0xff94a3b8);

        // 2. 主题色与顶栏徽标/标题
        BattleCaptureState.LeakSnapshot activeLeakSnap = (inLeak || inLogs)
            ? BattleCaptureState.buildLeakSnapshot((inLogs || leakCumulative) ? 0 : leakSelectedRound)
            : null;
        BattleCaptureState.BossSnapshot activeBossSnap = inDps
            ? (snap != null ? snap.boss : BattleCaptureState.buildBossSnapshot())
            : null;

        int borderCol = liteMode ? 0xff22d3ee : 0xffffe600;
        int fillCol = stripLocked ? 0xbb0b0d11 : 0xf20b0d11;
        int badgeBg = liteMode ? 0xff22d3ee : 0xffffe600;
        int badgeFg = 0xff0b0d11;
        String badgeText;
        String titleText;

        stripBossHeaderIcon.setVisibility(View.GONE);

        if (inLogs) {
            borderCol = 0xff22d3ee;
            fillCol = stripLocked ? 0xbb081018 : 0xf4081018;
            badgeBg = 0xff22d3ee;
            badgeFg = 0xff061018;
            badgeText = String.format(Locale.US, "R%02d·LOGS", curRound);
            titleText = "实时战报流水";
        } else if (inWaves) {
            int waveCount = snap != null && snap.allWaves != null ? snap.allWaves.size() : 0;
            borderCol = 0xff00e5ff;
            fillCol = stripLocked ? 0xbb0b1319 : 0xf40b1319;
            badgeBg = 0xff00e5ff;
            badgeFg = 0xff0b0d11;
            badgeText = "全波次·" + waveCount + "波";
            titleText = "所有波次出怪总览（当前 R" + String.format(Locale.US, "%02d", curRound) + "）";
        } else if (inDps && activeBossSnap != null) {
            borderCol = 0xffff4d4f;
            fillCol = stripLocked ? 0xc2180a0d : 0xf5180a0d;
            badgeBg = 0xffff4d4f;
            badgeFg = 0xffffffff;
            badgeText = String.format(Locale.US, "R%02d·BOSS", curRound);
            titleText = activeBossSnap.bossName;
            Bitmap bossBmp = EnemyPortraitAtlas.getIcon(this, activeBossSnap.bossEnemyId);
            if (bossBmp != null) {
                stripBossHeaderIcon.setImageBitmap(bossBmp);
                stripBossHeaderIcon.setVisibility(View.VISIBLE);
            }
        } else if (inLeak && activeLeakSnap != null) {
            boolean warnOrange = !leakCumulative || activeLeakSnap.totalEscaped > 0;
            borderCol = warnOrange ? 0xffff7a00 : 0xff00e5ff;
            fillCol = stripLocked ? (warnOrange ? 0xc0180f08 : 0xbb0b1319) : (warnOrange ? 0xf4180f08 : 0xf20b1319);
            badgeBg = warnOrange ? 0xffff7a00 : 0xff00e5ff;
            badgeFg = 0xff0b0d11;
            badgeText = leakCumulative
                ? String.format(Locale.US, "R1-%02d", curRound)
                : String.format(Locale.US, "R%02d", leakSelectedRound);
            titleText = leakCumulative
                ? String.format(Locale.US, "累计 漏%d · 兜%d%s", activeLeakSnap.totalLeaks, activeLeakSnap.totalAssisted,
                    activeLeakSnap.totalEscaped > 0 ? (" · 逃" + activeLeakSnap.totalEscaped) : "")
                : String.format(Locale.US, "单回合 漏%d · 兜%d%s", activeLeakSnap.totalLeaks, activeLeakSnap.totalAssisted,
                    activeLeakSnap.totalEscaped > 0 ? (" · 逃" + activeLeakSnap.totalEscaped) : "");
        } else if (!hasComp && !vpnRunning) {
            borderCol = 0xff64748b;
            badgeBg = 0xff334155;
            badgeFg = 0xffe2e8f0;
            badgeText = "PRTS";
            titleText = "等待选择本局阵容";
        } else if (hasBanWarn) {
            borderCol = 0xfff59e0b;
            badgeBg = 0xfff59e0b;
            badgeFg = 0xff0b0d11;
            badgeText = pendingTier > 0 ? String.format(Locale.US, "R%02d·%d本", curRound, pendingTier) : String.format(Locale.US, "R%02d", curRound);
            titleText = pendingHeadline;
        } else if (isUpgrade) {
            borderCol = 0xff00e5ff;
            badgeBg = 0xff00e5ff;
            badgeFg = 0xff0b0d11;
            badgeText = String.format(Locale.US, "R%02d·↑升%d本", curRound, pendingTier);
            titleText = pendingHeadline;
        } else {
            badgeText = displayTier > 0 ? String.format(Locale.US, "R%02d·%d本", curRound, displayTier) : String.format(Locale.US, "R%02d", curRound);
            titleText = hasComp ? pendingHeadline : (snap != null && snap.banCount >= 0 ? "已同步禁选 · 点展开选阵" : "本机实时抓包运行中");
        }

        if (stripLocked) {
            borderCol = (borderCol & 0x00ffffff) | 0x77000000;
        }
        strip.setBackground(background(fillCol, 4, borderCol));
        stripRoundBadge.setText(badgeText);
        stripRoundBadge.setTextColor(badgeFg);
        stripRoundBadge.setBackground(background(badgeBg, 2, badgeBg));
        if ((inLeak || inLogs) && activeLeakSnap != null) {
            stripTitleView.setVisibility(View.GONE);
            stripLeakPills.setVisibility(View.VISIBLE);
            boolean hasLeaks = activeLeakSnap.totalLeaks > 0;
            stripLeakPillTotal.setText("漏 " + activeLeakSnap.totalLeaks);
            stripLeakPillTotal.setTextColor(hasLeaks ? 0xfffbbf24 : 0xff64748b);
            stripLeakPillTotal.setBackground(background(hasLeaks ? 0x33f59e0b : 0xff141b26, 2, hasLeaks ? 0xccf59e0b : 0xff273447));

            boolean hasAssist = activeLeakSnap.totalAssisted > 0;
            stripLeakPillAssist.setText("兜 " + activeLeakSnap.totalAssisted);
            stripLeakPillAssist.setTextColor(hasAssist ? 0xff67e8f9 : 0xff64748b);
            stripLeakPillAssist.setBackground(background(hasAssist ? 0x3300e5ff : 0xff141b26, 2, hasAssist ? 0xcc00e5ff : 0xff273447));

            boolean hasEsc = activeLeakSnap.totalEscaped > 0;
            stripLeakPillEscaped.setText(hasEsc ? ("逃 " + activeLeakSnap.totalEscaped) : "零逃");
            stripLeakPillEscaped.setTextColor(hasEsc ? 0xffff8080 : 0xff64748b);
            stripLeakPillEscaped.setBackground(background(hasEsc ? 0x44ff4d4f : 0xff141b26, 2, hasEsc ? 0xeeff4d4f : 0xff273447));
        } else {
            stripLeakPills.setVisibility(View.GONE);
            stripTitleView.setVisibility(View.VISIBLE);
            stripTitleView.setText(stripLocked ? (titleText + " · 穿透") : titleText);
        }

        // 3. 切换并渲染当前激活主体视图
        guideContainer.setVisibility(inGuide ? View.VISIBLE : View.GONE);
        leakContainer.setVisibility(inLeak ? View.VISIBLE : View.GONE);
        dpsContainer.setVisibility(inDps ? View.VISIBLE : View.GONE);
        wavesContainer.setVisibility(inWaves ? View.VISIBLE : View.GONE);
        logsContainer.setVisibility(inLogs ? View.VISIBLE : View.GONE);

        if (inGuide) {
            renderGuideBody(snap, hasComp, vpnRunning, isUpgrade, hasBanWarn, curRound);
        } else if (inLeak && activeLeakSnap != null) {
            renderLeakBody(activeLeakSnap, snap, vpnRunning);
        } else if (inLogs) {
            renderLogsBody(snap, vpnRunning);
        } else if (inDps && activeBossSnap != null) {
            renderDpsBody(activeBossSnap);
        } else if (inWaves) {
            renderAllWavesBody(snap, curRound);
        }

        if (stripMode && strip.isAttachedToWindow()) {
            stripParams.width = preferredStripWidth();
            clamp(stripParams);
            try {
                manager.updateViewLayout(strip, stripParams);
                syncUnlockChipPosition();
            } catch (RuntimeException ignored) {}
        }
    }

    private void enterStrip(boolean locked) {
        measureScreen();
        if (panel == null) createPanel();
        if (strip == null) createStrip();
        try {
            if (panel != null && panel.isAttachedToWindow()) {
                setPanelFocusable(false);
                manager.removeView(panel);
            }
            if (ball != null && ball.isAttachedToWindow()) {
                manager.removeView(ball);
            }
            expanded = false;
            stripMode = true;
            stripParams.width = preferredStripWidth();
            clamp(stripParams);
            if (!strip.isAttachedToWindow()) {
                manager.addView(strip, stripParams);
            }
            setStripLocked(locked);
        } catch (RuntimeException error) { fail(); }
    }

    private void setStripLocked(boolean locked) {
        if (!stripMode || strip == null) return;
        stripLocked = locked;
        stripParams.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            | (locked ? WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE : 0);
        stripParams.alpha = locked ? 0.82f : 0.96f;
        stripActions.setVisibility(locked ? View.GONE : View.VISIBLE);
        refreshStripAndBallContent();
        try {
            if (strip.isAttachedToWindow()) manager.updateViewLayout(strip, stripParams);
            syncUnlockChipPosition();
            if (locked) {
                if (!unlockChip.isAttachedToWindow()) manager.addView(unlockChip, unlockParams);
            } else if (unlockChip != null && unlockChip.isAttachedToWindow()) {
                manager.removeView(unlockChip);
            }
            updateForegroundNotification();
        } catch (RuntimeException error) { fail(); }
    }

    private void createPanel() {
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackground(background(0xff0b0d11, 6, 0xff252d3a));
        panel.setPadding(dp(1), dp(1), dp(1), dp(1));
        panel.setElevation(dp(10));
        panelParams = params(1, 1, false, true);
        panelParams.alpha = ALPHA_LEVELS[alphaIndex];
        sizePanel();

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setBackgroundColor(0xff0d1118);
        toolbar.setPadding(dp(8), dp(2), dp(4), dp(2));

        boolean lite = isLiteTelemetryMode();
        int brandCol = lite ? 0xff22d3ee : 0xffffe600;
        TextView badge = new TextView(this);
        badge.setText(lite ? "LITE" : "PRTS");
        badge.setTextSize(11.5f);
        badge.setTypeface(prtsSans(true));
        badge.setTextColor(lite ? 0xff061318 : 0xff0b0d11);
        badge.setPadding(dp(5), dp(1), dp(5), dp(1));
        badge.setBackground(background(brandCol, 2, brandCol));
        toolbar.addView(badge);

        TextView grip = new TextView(this);
        grip.setText(" ⠿ 拖动");
        grip.setContentDescription(getString(R.string.overlay_drag));
        grip.setTextColor(0xff94a3b8);
        grip.setTextSize(12f);
        grip.setTypeface(prtsSans(false));
        grip.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(grip, new LinearLayout.LayoutParams(0, dp(30), 1));
        makeDraggable(grip, panel, panelParams, false, null);

        alphaButton = toolbarChip(toolbar, alphaLabel(), "切换悬浮窗透明度", 0xff00e5ff, v -> cycleAlpha());
        toolbarChip(toolbar, "迷你条", "切换顶部战术迷你条（支持点击穿透）", brandCol, v -> enterStrip(false));
        sizeButton = toolbarChip(toolbar, "↔", "切换宽窄抽屉", 0xffdbe4ef, v -> {
            compactPanel = !compactPanel;
            sizePanel();
            try { manager.updateViewLayout(panel, panelParams); } catch (RuntimeException error) { fail(); }
        });
        toolbarChip(toolbar, "—", getString(R.string.overlay_collapse), 0xffdbe4ef, v -> collapseToBall());
        toolbarChip(toolbar, "×", "退出悬浮助手", 0xfff87171, v -> { dispose(); stopSelf(); });

        panel.addView(toolbar);
        attachFreshWebView();
    }

    private void attachFreshWebView() {
        if (panel == null) return;
        if (web != null) {
            try { panel.removeView(web); } catch (RuntimeException ignored) {}
            try { web.destroy(); } catch (RuntimeException ignored) {}
            web = null;
        }
        web = GuideWebView.create(this, true, this::handleOverlayWebViewGone);
        panel.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void handleOverlayWebViewGone() {
        if (panel == null) return;
        long now = System.currentTimeMillis();
        if (now - lastWebViewCrashMs > 60_000L) webViewRecoverCount = 0;
        lastWebViewCrashMs = now;
        if (webViewRecoverCount < 3) {
            webViewRecoverCount++;
            attachFreshWebView();
            if (expanded) {
                Toast.makeText(this, "系统内存紧张，悬浮跟打页已自动恢复", Toast.LENGTH_SHORT).show();
            }
        } else {
            collapseToBall();
            Toast.makeText(this, "系统可用内存不足，已自动收起为轻量悬浮球（迷你条仍可使用）", Toast.LENGTH_LONG).show();
        }
    }

    private String alphaLabel() {
        return alphaIndex == 0 ? "100%" : alphaIndex == 1 ? "86%" : "72%";
    }

    private void cycleAlpha() {
        alphaIndex = (alphaIndex + 1) % ALPHA_LEVELS.length;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("alphaIndex", alphaIndex).apply();
        if (alphaButton != null) alphaButton.setText(alphaLabel());
        if (panelParams != null) {
            panelParams.alpha = ALPHA_LEVELS[alphaIndex];
            if (panel != null && panel.isAttachedToWindow()) {
                try { manager.updateViewLayout(panel, panelParams); } catch (RuntimeException ignored) {}
            }
        }
    }

    private Button toolbarChip(LinearLayout toolbar, String label, String description, int textColor, View.OnClickListener action) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(11.5f);
        button.setTypeface(prtsSans(false));
        button.setAllCaps(false);
        button.setContentDescription(description);
        button.setTooltipText(description);
        button.setTextColor(textColor);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(dp(7), 0, dp(7), 0);
        button.setBackground(background(0xff171c26, 3, 0xff2b3444));
        button.setOnClickListener(action);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, dp(26));
        layout.leftMargin = dp(4);
        toolbar.addView(button, layout);
        return button;
    }

    private void sizePanel() {
        boolean landscape = usableWidth > usableHeight;
        int narrowW = landscape ? Math.min(dp(412), Math.max(dp(336), Math.round(usableWidth * 0.45f))) : Math.min(dp(420), usableWidth - dp(12));
        int wideW = Math.min(dp(740), Math.round(usableWidth * 0.76f));
        int preferredWidth = landscape && !compactPanel ? wideW : narrowW;
        panelParams.width = Math.min(preferredWidth, Math.max(1, usableWidth - dp(12)));
        panelParams.height = Math.max(1, usableHeight - dp(12));
        if (sizeButton != null) {
            sizeButton.setVisibility(landscape ? View.VISIBLE : View.GONE);
            sizeButton.setText(compactPanel ? "宽窗" : "窄窗");
            sizeButton.setContentDescription(compactPanel ? "切换宽窗" : "切换窄窗");
            sizeButton.setTooltipText(compactPanel ? "切换宽窗" : "切换窄窗");
        }
        clamp(panelParams);
    }

    private void clamp(WindowManager.LayoutParams params) {
        int w = params.width > 0 ? params.width : dp(340);
        int h = params.height > 0 ? params.height : (params == stripParams && strip != null && strip.getHeight() > 0 ? strip.getHeight() : dp(104));
        params.x = Math.max(0, Math.min(params.x, Math.max(0, usableWidth - w)));
        params.y = Math.max(0, Math.min(params.y, Math.max(0, usableHeight - h)));
    }

    private void removeStripViews() {
        if (unlockChip != null && unlockChip.isAttachedToWindow()) manager.removeView(unlockChip);
        if (strip != null && strip.isAttachedToWindow()) manager.removeView(strip);
        stripMode = false;
        stripLocked = false;
    }

    private void expand() {
        if (expanded) return;
        if (CovenantScanState.scanning()) {
            CovenantScanService.stopActive();
        }
        measureScreen();
        boolean firstAttach = (panel == null);
        if (panel == null) {
            createPanel();
        }
        sizePanel();
        if (firstAttach || !expanded) {
            panelParams.x = ballParams != null && ballParams.x < usableWidth / 3 ? dp(6) : Math.max(dp(6), usableWidth - panelParams.width - dp(6));
            panelParams.y = dp(6);
            clamp(panelParams);
        }
        setPanelFocusable(false);
        try {
            removeStripViews();
            panel.setVisibility(View.VISIBLE);
            if (!panel.isAttachedToWindow()) manager.addView(panel, panelParams);
            if (ball != null && ball.isAttachedToWindow()) manager.removeView(ball);
            expanded = true;
            updateForegroundNotification();
            if (web != null) {
                web.onResume();
                dispatchJsEvent("prts-overlay-expanded", "true");
            }
        } catch (RuntimeException error) { fail(); }
    }

    private void collapseToBall() {
        if (!expanded && !stripMode) return;
        try {
            setPanelFocusable(false);
            if (panel != null && panel.isAttachedToWindow()) {
                manager.removeView(panel);
            }
            removeStripViews();
            clamp(ballParams);
            expanded = false;
            setBallScanning(false);
            updateForegroundNotification();
            if (ball != null && !ball.isAttachedToWindow()) manager.addView(ball, ballParams);
        } catch (RuntimeException error) { fail(); }
    }

    private void makeDraggable(View handle, final View window, final WindowManager.LayoutParams params, final boolean snap, final Runnable onMoved) {
        handle.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            int startX, startY;
            boolean dragging;
            final int slop = ViewConfiguration.get(OverlayService.this).getScaledTouchSlop();
            @Override public boolean onTouch(View view, MotionEvent event) {
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                    downX = event.getRawX(); downY = event.getRawY(); startX = params.x; startY = params.y; dragging = false; return true;
                }
                if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
                    float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
                    if (Math.abs(dx) > slop || Math.abs(dy) > slop) dragging = true;
                    if (dragging) {
                        params.x = startX + Math.round(dx); params.y = startY + Math.round(dy); clamp(params);
                        try {
                            manager.updateViewLayout(window, params);
                            if (onMoved != null) onMoved.run();
                        } catch (RuntimeException error) { fail(); }
                    }
                    return true;
                }
                if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                    if (!dragging) view.performClick();
                    else if (snap) {
                        params.x = params.x + params.width / 2 < usableWidth / 2 ? 0 : usableWidth - params.width;
                        clamp(params);
                        try { manager.updateViewLayout(window, params); } catch (RuntimeException error) { fail(); }
                    }
                    return true;
                }
                return event.getActionMasked() == MotionEvent.ACTION_CANCEL;
            }
        });
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        measureScreen();
        if (ballParams != null) clamp(ballParams);
        if (panelParams != null) sizePanel();
        if (stripParams != null) {
            positionStripDefault();
            clamp(stripParams);
            syncUnlockChipPosition();
        }
        try {
            if (expanded && panel != null && panel.isAttachedToWindow()) manager.updateViewLayout(panel, panelParams);
            if (stripMode && strip != null && strip.isAttachedToWindow()) manager.updateViewLayout(strip, stripParams);
            if (ball != null && ball.isAttachedToWindow()) manager.updateViewLayout(ball, ballParams);
        } catch (RuntimeException error) { fail(); }
    }

    private void fail() { Toast.makeText(this, "悬浮窗已关闭，请检查悬浮窗与后台权限后重新开启", Toast.LENGTH_LONG).show(); dispose(); stopSelf(); }

    private void dispose() {
        if (CovenantScanState.permissionPending()) CovenantScanState.set("cancelled", "助手已关闭，本次识别已取消");
        RoundScanState.stop("悬浮助手已关闭，回合同步已停止");
        stopService(new Intent(this, CovenantScanService.class));
        if (unlockChip != null && unlockChip.isAttachedToWindow()) manager.removeViewImmediate(unlockChip);
        if (strip != null && strip.isAttachedToWindow()) manager.removeViewImmediate(strip);
        if (panel != null && panel.isAttachedToWindow()) manager.removeViewImmediate(panel);
        if (ball != null && ball.isAttachedToWindow()) manager.removeViewImmediate(ball);
        if (web != null) { if (panel != null) panel.removeView(web); web.destroy(); web = null; }
        ball = null; panel = null; strip = null; unlockChip = null; sizeButton = null; alphaButton = null;
        expanded = false; stripMode = false; stripLocked = false; panelFocusable = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override public void onDestroy() { dispose(); if (active == this) active = null; super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
