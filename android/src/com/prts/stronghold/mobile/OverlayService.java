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

    // Body B: 漏兜（4 人彩色柱图 + 漏怪实机图标）
    private LinearLayout leakContainer;
    private LinearLayout leakGrid;
    private LinearLayout leakFooterRow;
    private TextView leakFooterTag;
    private LinearLayout leakEnemyChips;
    private TextView leakLegendView;

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
        ball.setTextSize(11f);
        ball.setTypeface(null, 1);
        ball.setTextColor(0xffffe600);
        ball.setGravity(Gravity.CENTER);
        ball.setBackground(background(0xe80b0d11, 26, 0x99ffe600));
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

    private void triggerQuickCovenantScan() {
        if (!getResources().getBoolean(R.bool.covenant_scan_enabled)) {
            expand();
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
            ball.setText(String.format(Locale.US, "R%02d", pendingRound));
            ball.setTextColor(0xffffe600);
            ball.setBackground(background(0xe80b0d11, 26, 0xbbffe600));
            ball.setForeground(null);
            ball.setContentDescription(getString(R.string.ball_desc));
        } else {
            ball.setText("");
            ball.setBackground(background(0xe80b0d11, 26, 0x88ffe600));
            int inset = getResources().getInteger(R.integer.ball_icon_inset_dp);
            ball.setForeground(new InsetDrawable(getDrawable(R.drawable.ic_overlay_ball), dp(inset)));
            ball.setContentDescription(getString(R.string.ball_desc));
        }
    }

    private int preferredStripWidth() {
        boolean landscape = usableWidth > usableHeight;
        if (landscape) {
            return Math.min(dp(476), Math.max(dp(344), usableWidth - dp(120)));
        }
        return Math.min(dp(404), Math.max(dp(280), usableWidth - dp(20)));
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
        strip.setPadding(dp(8), dp(5), dp(8), dp(6));
        strip.setBackground(background(0xf20b0d11, 4, 0xffffe600));
        strip.setElevation(dp(9));

        // ===== Row 1: Top Header Bar =====
        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        stripPrevBtn = stepButton("◀", v -> handleStepButton(-1));
        topRow.addView(stripPrevBtn);

        stripRoundBadge = new TextView(this);
        stripRoundBadge.setTextSize(10f);
        stripRoundBadge.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
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
        stripScopeRoundBtn = capsuleChip("单回合", v -> {
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
        stripTitleView.setTextSize(11f);
        stripTitleView.setTypeface(null, Typeface.BOLD);
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
        stripModeCapsule.addView(stripTabDpsBtn);
        stripModeCapsule.addView(stripTabGuideBtn);
        stripModeCapsule.addView(stripTabLeakBtn);
        LinearLayout.LayoutParams capLp = new LinearLayout.LayoutParams(-2, -2);
        capLp.leftMargin = dp(3);
        stripActions.addView(stripModeCapsule, capLp);

        miniStripButton(stripActions, "穿透", 0xffffe600, v -> setStripLocked(true));
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
        guideFocusKey.setTextSize(9.5f);
        guideFocusKey.setTypeface(null, Typeface.BOLD);
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
        guideAllWavesBtn.setTextSize(9.5f);
        guideAllWavesBtn.setTypeface(null, Typeface.BOLD);
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
        guideFocusFallbackVal.setTextSize(10f);
        guideFocusFallbackVal.setTextColor(0xffe2e8f0);
        guideFocusFallbackVal.setMaxLines(2);
        guideFocusFallbackVal.setEllipsize(TextUtils.TruncateAt.END);
        guideFocusFallbackVal.setVisibility(View.GONE);
        guideFocusRow.addView(guideFocusFallbackVal, new LinearLayout.LayoutParams(0, -2, 1f));

        guideFocusProg = new TextView(this);
        guideFocusProg.setTextSize(9.5f);
        guideFocusProg.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        guideFocusProg.setTextColor(0xffffe600);
        guideFocusProg.setSingleLine(true);
        LinearLayout.LayoutParams fpLp = new LinearLayout.LayoutParams(-2, -2);
        fpLp.leftMargin = dp(6);
        guideFocusRow.addView(guideFocusProg, fpLp);

        guideContainer.addView(guideFocusRow, gfLp);

        guideBodyView = new TextView(this);
        guideBodyView.setTextSize(10.5f);
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

        leakFooterRow = new LinearLayout(this);
        leakFooterRow.setOrientation(LinearLayout.HORIZONTAL);
        leakFooterRow.setGravity(Gravity.CENTER_VERTICAL);
        leakFooterRow.setPadding(dp(5), dp(3), dp(5), dp(3));
        leakFooterRow.setBackgroundColor(0x14ffffff);
        LinearLayout.LayoutParams lfLp = new LinearLayout.LayoutParams(-1, -2);
        lfLp.topMargin = dp(4);

        leakFooterTag = new TextView(this);
        leakFooterTag.setTextSize(9.5f);
        leakFooterTag.setTypeface(null, Typeface.BOLD);
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

        leakLegendView = new TextView(this);
        leakLegendView.setTextSize(9f);
        leakLegendView.setSingleLine(true);
        leakLegendView.setText(buildLeakLegend());
        LinearLayout.LayoutParams legLp = new LinearLayout.LayoutParams(-2, -2);
        legLp.leftMargin = dp(6);
        leakFooterRow.addView(leakLegendView, legLp);

        leakContainer.addView(leakFooterRow, lfLp);
        strip.addView(leakContainer);

        // ===== Body C: Boss MMO DPS 榜（Boss 血条 + 4 行横向渐变计量条）=====
        dpsContainer = new LinearLayout(this);
        dpsContainer.setOrientation(LinearLayout.VERTICAL);
        dpsContainer.setVisibility(View.GONE);

        bossHpTrack = new FrameLayout(this);
        bossHpTrack.setBackground(background(0xff1e0c11, 3, 0x88ff4d4f));
        LinearLayout.LayoutParams hpTrackLp = new LinearLayout.LayoutParams(-1, dp(19));
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
        bossHpLeftText.setTextSize(9.5f);
        bossHpLeftText.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        bossHpLeftText.setTextColor(0xffffffff);
        bossHpLeftText.setSingleLine(true);
        hpTextRow.addView(bossHpLeftText, new LinearLayout.LayoutParams(0, -2, 1f));

        bossHpRightText = new TextView(this);
        bossHpRightText.setTextSize(9.5f);
        bossHpRightText.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
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

        stripParams = params(preferredStripWidth(), WindowManager.LayoutParams.WRAP_CONTENT, false, true);
        positionStripDefault();
        makeDraggable(strip, strip, stripParams, false, this::syncUnlockChipPosition);

        unlockChip = new TextView(this);
        unlockChip.setText("解锁");
        unlockChip.setTextSize(10.5f);
        unlockChip.setTypeface(null, Typeface.BOLD);
        unlockChip.setTextColor(0xffffe600);
        unlockChip.setGravity(Gravity.CENTER);
        unlockChip.setBackground(background(0xee0b0d11, 3, 0xffffe600));
        unlockChip.setContentDescription("解锁触控穿透迷你条");
        unlockParams = params(dp(38), dp(26), false, true);
        unlockChip.setOnClickListener(v -> setStripLocked(false));
        refreshStripAndBallContent();
    }

    private TextView leakSummaryPill(LinearLayout parent, boolean gapLeft) {
        TextView tv = new TextView(this);
        tv.setTextSize(10f);
        tv.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        tv.setSingleLine(true);
        tv.setPadding(dp(6), dp(2), dp(6), dp(2));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        if (gapLeft) lp.leftMargin = dp(4);
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
        tv.setTextSize(9.5f);
        tv.setTypeface(null, Typeface.BOLD);
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
        btn.setTextSize(10f);
        btn.setTextColor(0xffffe600);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(4), dp(1), dp(4), dp(1));
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
        btn.setTextSize(9.5f);
        btn.setTypeface(null, Typeface.BOLD);
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
        chip.setPadding(dp(2), dp(1), dp(5), dp(1));
        chip.setBackground(background(0xff131a25, 2, strokeColor));

        Bitmap icon = EnemyPortraitAtlas.getIcon(this, ec.enemyId);
        if (icon != null) {
            ImageView iv = new ImageView(this);
            iv.setImageBitmap(icon);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(iconSizeDp), dp(iconSizeDp));
            ilp.rightMargin = dp(4);
            chip.addView(iv, ilp);
        }

        TextView label = new TextView(this);
        label.setTextSize(9.5f);
        label.setSingleLine(true);
        SpannableStringBuilder sb = new SpannableStringBuilder();
        String shortName = ec.name != null && ec.name.length() > 7 ? ec.name.substring(0, 7) : (ec.name != null ? ec.name : "");
        appendColored(sb, shortName, 0xffe2e8f0);
        appendColored(sb, " ×" + ec.count, countColor);
        label.setText(sb);
        chip.addView(label);

        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-2, -2);
        clp.rightMargin = dp(4);
        chip.setLayoutParams(clp);
        return chip;
    }

    private void renderGuideBody(
        BattleCaptureState.TelemetrySnapshot snap, boolean hasComp, boolean vpnRunning,
        boolean isUpgrade, boolean hasBanWarn, int curRound
    ) {
        guideEnemyChips.removeAllViews();
        boolean hasEnemyIcons = snap != null && vpnRunning && snap.forecastEnemies != null && !snap.forecastEnemies.isEmpty();
        boolean hasAllWaves = snap != null && vpnRunning && snap.allWaves != null && !snap.allWaves.isEmpty();
        guideAllWavesBtn.setVisibility((hasEnemyIcons && hasAllWaves && !stripLocked) ? View.VISIBLE : View.GONE);

        String progRight = !pendingProgress.isEmpty()
            ? pendingProgress
            : (snap != null && snap.selfHp >= 0 ? ("♥" + snap.selfHp) : "");
        int progCol = progRight.contains("齐牌") ? 0xff34d399 : (progRight.startsWith("♥") && snap != null && snap.selfHp <= 5 ? 0xffff7875 : 0xffffe600);

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

            StringBuilder body = new StringBuilder();
            if (!pendingGrabHint.isEmpty()) body.append("抓：").append(pendingGrabHint).append(" ｜ ");
            if (!pendingDetail.isEmpty()) body.append(pendingDetail);
            else if (snap.banCount >= 0 && !hasComp) body.append("已自动同步 ").append(snap.banCount).append(" 项禁选，点「展开」一键选阵。");
            else body.append("实时抓包同步中，可点顶栏「漏兜」查看 4 人漏怪与协防图表。");
            guideBodyView.setText(body.toString());
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
            guideBodyView.setText(!pendingDetail.isEmpty() ? pendingDetail : "当前阵容存在受限盟约，请核对替换组件或切换备选路线。");
        } else {
            boolean showFocus = !pendingGrabHint.isEmpty() || !progRight.isEmpty();
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
            guideBodyView.setText(!pendingDetail.isEmpty()
                ? pendingDetail
                : (vpnRunning ? "已连接本机抓包，进战斗后自动显示下波出怪图标与 4 人漏兜。" : "点 ◀ ▶ 切回合，或点顶栏「漏兜」看 4 人漏怪/兜底图表。"));
        }
        guideBodyView.setMaxLines(stripBodyCompact ? 1 : 3);
    }

    private void renderLeakBody(BattleCaptureState.LeakSnapshot leakSnap, boolean vpnRunning) {
        leakGrid.removeAllViews();
        int maxMetric = 1;
        for (BattleCaptureState.SeatLeakRow row : leakSnap.seats) {
            if (row.leaked > maxMetric) maxMetric = row.leaked;
            if (row.assisted > maxMetric) maxMetric = row.assisted;
        }

        for (int i = 0; i < leakSnap.seats.size(); i++) {
            BattleCaptureState.SeatLeakRow row = leakSnap.seats.get(i);
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(5), dp(4), dp(5), dp(4));
            int cardBg = row.isSelf ? 0x1affe600 : (row.escaped > 0 ? 0x1aff4d4f : 0xff131a24);
            int cardBorder = row.isSelf ? 0x99ffe600 : (row.escaped > 0 ? 0x88ff4d4f : 0xff273244);
            card.setBackground(background(cardBg, 3, cardBorder));

            LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(0, -2, 1f);
            if (i > 0) cardLp.leftMargin = dp(4);

            // Card Top: [我] Name   ♥HP 本数
            LinearLayout head = new LinearLayout(this);
            head.setOrientation(LinearLayout.HORIZONTAL);
            head.setGravity(Gravity.CENTER_VERTICAL);

            if (row.isSelf) {
                TextView me = new TextView(this);
                me.setText("我");
                me.setTextSize(8f);
                me.setTypeface(null, Typeface.BOLD);
                me.setTextColor(0xff0b0d11);
                me.setPadding(dp(2), 0, dp(2), 0);
                me.setBackground(background(0xffffe600, 1, 0xffffe600));
                LinearLayout.LayoutParams meLp = new LinearLayout.LayoutParams(-2, -2);
                meLp.rightMargin = dp(3);
                head.addView(me, meLp);
            }

            TextView nameTv = new TextView(this);
            nameTv.setText(row.name);
            nameTv.setTextSize(9.5f);
            nameTv.setTypeface(null, row.isSelf ? Typeface.BOLD : Typeface.NORMAL);
            nameTv.setTextColor(row.isSelf ? 0xfffff8b0 : 0xffe2e8f0);
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
            hpTv.setTextSize(8.5f);
            hpTv.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            hpTv.setSingleLine(true);
            head.addView(hpTv);
            card.addView(head);

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

            leakGrid.addView(card, cardLp);
        }

        // Bottom leaked enemy real-icon strip
        leakEnemyChips.removeAllViews();
        leakFooterTag.setText(leakSnap.round == 0
            ? String.format(Locale.US, "累计高漏(%d)", leakSnap.totalLeaks)
            : String.format(Locale.US, "R%02d 漏怪(%d)", leakSnap.round, leakSnap.totalLeaks));
        if (leakSnap.enemies != null && !leakSnap.enemies.isEmpty()) {
            int maxKinds = Math.min(6, leakSnap.enemies.size());
            for (int i = 0; i < maxKinds; i++) {
                leakEnemyChips.addView(buildEnemyChip(leakSnap.enemies.get(i), 0xffff7875, 0x77ff4d4f, 15));
            }
        } else {
            TextView empty = new TextView(this);
            empty.setText(vpnRunning ? "本段零漏怪记录" : "开启主页「本机抓包」自动统计 4 人漏兜");
            empty.setTextSize(9.5f);
            empty.setTextColor(0xff94a3b8);
            empty.setSingleLine(true);
            leakEnemyChips.addView(empty);
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
        rLp.topMargin = dp(3);
        rowView.setLayoutParams(rLp);

        TextView tag = new TextView(this);
        tag.setText(label);
        tag.setTextSize(8.5f);
        tag.setTypeface(null, Typeface.BOLD);
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
        rowView.addView(track, new LinearLayout.LayoutParams(0, dp(6), 1f));

        TextView num = new TextView(this);
        num.setText(rightText);
        num.setTextSize(8.5f);
        num.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
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

    private void renderAllWavesBody(BattleCaptureState.TelemetrySnapshot snap, int curRound) {
        wavesList.removeAllViews();
        List<BattleCaptureState.RoundWave> waves = snap != null ? snap.allWaves : null;
        if (waves == null || waves.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("暂无已同步波次数据，请进入对局后查看。");
            empty.setTextSize(10f);
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
            rBadge.setTextSize(9f);
            rBadge.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
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
            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(-1, dp(21));
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
            rankTv.setTextSize(9.5f);
            rankTv.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            rankTv.setTextColor(p.rank == 1 ? 0xffffe600 : (p.isSelf ? 0xfffef08a : 0xff94a3b8));
            rankTv.setMinWidth(dp(20));
            fg.addView(rankTv);

            if (p.isSelf) {
                TextView me = new TextView(this);
                me.setText("我");
                me.setTextSize(8f);
                me.setTypeface(null, Typeface.BOLD);
                me.setTextColor(0xff0b0d11);
                me.setPadding(dp(3), 0, dp(3), 0);
                me.setBackground(background(0xffffe600, 1, 0xffffe600));
                LinearLayout.LayoutParams meLp = new LinearLayout.LayoutParams(-2, -2);
                meLp.rightMargin = dp(4);
                fg.addView(me, meLp);
            }

            TextView nameTv = new TextView(this);
            nameTv.setText(p.name);
            nameTv.setTextSize(10f);
            nameTv.setTypeface(null, Typeface.BOLD);
            nameTv.setTextColor(0xffffffff);
            nameTv.setSingleLine(true);
            nameTv.setEllipsize(TextUtils.TruncateAt.END);
            fg.addView(nameTv, new LinearLayout.LayoutParams(0, -2, 1f));

            TextView dmgTv = new TextView(this);
            dmgTv.setText(p.damage > 0 ? fmtWan(p.damage) : "—");
            dmgTv.setTextSize(10f);
            dmgTv.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            dmgTv.setTextColor(0xffffffff);
            dmgTv.setGravity(Gravity.END);
            dmgTv.setMinWidth(dp(38));
            fg.addView(dmgTv);

            TextView dpsTv = new TextView(this);
            dpsTv.setText(p.dps > 0 ? (fmtComma(p.dps) + "/s") : "0/s");
            dpsTv.setTextSize(9.5f);
            dpsTv.setTypeface(Typeface.MONOSPACE, Typeface.NORMAL);
            dpsTv.setTextColor(p.isSelf ? 0xfffef08a : 0xffbae6fd);
            dpsTv.setGravity(Gravity.END);
            dpsTv.setMinWidth(dp(48));
            LinearLayout.LayoutParams dpsLp = new LinearLayout.LayoutParams(-2, -2);
            dpsLp.leftMargin = dp(5);
            fg.addView(dpsTv, dpsLp);

            TextView shareTv = new TextView(this);
            shareTv.setText(String.format(Locale.US, "%.1f%%", p.sharePct));
            shareTv.setTextSize(9.5f);
            shareTv.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            shareTv.setTextColor(0xffe2e8f0);
            shareTv.setGravity(Gravity.END);
            shareTv.setMinWidth(dp(34));
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
        boolean hasComp = !pendingHeadline.isEmpty();
        int curRound = effectiveCurrentRound();
        boolean isBossContext = (pendingRound >= 14)
            || (snap != null && ("boss".equals(snap.phase) || snap.currentRound >= 14 || snap.boss.teamDamage > 0 || snap.boss.bossHp >= 0));
        boolean isUpgrade = hasComp && !isBossContext && pendingTier >= 2 && pendingPrevTier > 0 && pendingTier > pendingPrevTier;
        boolean hasBanWarn = hasComp && !pendingBanWarning.isEmpty();

        // Boss 阶段自动切 [DPS]（每回合仅自动触发一次，不覆盖用户手动切换）
        if (isBossContext) {
            if (autoSwitchedBossRound != curRound) {
                autoSwitchedBossRound = curRound;
                stripTab = "dps";
            }
        } else {
            autoSwitchedBossRound = 0;
            if ("dps".equals(stripTab)) stripTab = "guide";
        }

        // 若处于漏兜单回合但尚未初始化回合号，跟随当前回合
        if (leakSelectedRound < 1 || leakSelectedRound > 15) leakSelectedRound = curRound;

        // 1. 顶部模式胶囊与控件可见性
        boolean inLeak = "leak".equals(stripTab);
        boolean inDps = "dps".equals(stripTab);
        boolean inWaves = "waves".equals(stripTab);
        boolean inGuide = !inLeak && !inDps && !inWaves;

        boolean showStepper = !stripLocked && ((inGuide && hasComp) || inLeak);
        stripPrevBtn.setVisibility(showStepper ? View.VISIBLE : View.GONE);
        stripNextBtn.setVisibility(showStepper ? View.VISIBLE : View.GONE);
        stripScanBtn.setVisibility((!stripLocked && inGuide && !hasComp && !vpnRunning) ? View.VISIBLE : View.GONE);
        stripLeakScopeBox.setVisibility((!stripLocked && inLeak) ? View.VISIBLE : View.GONE);

        stripTabDpsBtn.setVisibility(isBossContext ? View.VISIBLE : View.GONE);
        int activeLeakCount = snap != null ? snap.currentRoundLeak.totalLeaks : 0;
        stripTabLeakBtn.setText(activeLeakCount > 0 ? ("漏兜·" + activeLeakCount) : "漏兜");
        stripTabGuideBtn.setText(inWaves ? "返回" : "跟打");

        styleCapsuleChip(stripTabDpsBtn, inDps, 0xffff4d4f, 0xffffffff, 0xfffca5a5);
        styleCapsuleChip(stripTabGuideBtn, inGuide || inWaves, inWaves ? 0xff00e5ff : 0xffffe600, 0xff0b0d11, 0xffcbd5e1);
        styleCapsuleChip(stripTabLeakBtn, inLeak, activeLeakCount > 0 ? 0xffff7a00 : 0xff00e5ff, 0xff0b0d11,
            activeLeakCount > 0 ? 0xfffdba74 : 0xff67e8f9);
        styleCapsuleChip(stripScopeCumBtn, leakCumulative, 0xff00e5ff, 0xff0b0d11, 0xff94a3b8);
        styleCapsuleChip(stripScopeRoundBtn, !leakCumulative, 0xffff7a00, 0xff0b0d11, 0xff94a3b8);

        // 2. 主题色与顶栏徽标/标题
        BattleCaptureState.LeakSnapshot activeLeakSnap = inLeak
            ? BattleCaptureState.buildLeakSnapshot(leakCumulative ? 0 : leakSelectedRound)
            : null;
        BattleCaptureState.BossSnapshot activeBossSnap = inDps
            ? (snap != null ? snap.boss : BattleCaptureState.buildBossSnapshot())
            : null;

        int borderCol = 0xffffe600;
        int fillCol = stripLocked ? 0xbb0b0d11 : 0xf20b0d11;
        int badgeBg = 0xffffe600;
        int badgeFg = 0xff0b0d11;
        String badgeText;
        String titleText;

        stripBossHeaderIcon.setVisibility(View.GONE);

        if (inWaves) {
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
            badgeText = pendingTier > 0 ? String.format(Locale.US, "R%02d·%d本", curRound, pendingTier) : String.format(Locale.US, "R%02d", curRound);
            titleText = hasComp ? pendingHeadline : (snap != null && snap.banCount >= 0 ? "已同步禁选 · 点展开选阵" : "本机实时抓包运行中");
        }

        if (stripLocked) {
            borderCol = (borderCol & 0x00ffffff) | 0x77000000;
        }
        strip.setBackground(background(fillCol, 4, borderCol));
        stripRoundBadge.setText(badgeText);
        stripRoundBadge.setTextColor(badgeFg);
        stripRoundBadge.setBackground(background(badgeBg, 2, badgeBg));
        if (inLeak && activeLeakSnap != null) {
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

        if (inGuide) {
            renderGuideBody(snap, hasComp, vpnRunning, isUpgrade, hasBanWarn, curRound);
        } else if (inLeak && activeLeakSnap != null) {
            renderLeakBody(activeLeakSnap, vpnRunning);
        } else if (inDps && activeBossSnap != null) {
            renderDpsBody(activeBossSnap);
        } else if (inWaves) {
            renderAllWavesBody(snap, curRound);
        }

        if (stripMode && strip.isAttachedToWindow()) {
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

        TextView badge = new TextView(this);
        badge.setText("PRTS");
        badge.setTextSize(10f);
        badge.setTypeface(null, 1);
        badge.setTextColor(0xff0b0d11);
        badge.setPadding(dp(5), dp(1), dp(5), dp(1));
        badge.setBackground(background(0xffffe600, 2, 0xffffe600));
        toolbar.addView(badge);

        TextView grip = new TextView(this);
        grip.setText(" ⠿ 拖动");
        grip.setContentDescription(getString(R.string.overlay_drag));
        grip.setTextColor(0xff94a3b8);
        grip.setTextSize(11f);
        grip.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(grip, new LinearLayout.LayoutParams(0, dp(30), 1));
        makeDraggable(grip, panel, panelParams, false, null);

        alphaButton = toolbarChip(toolbar, alphaLabel(), "切换悬浮窗透明度", 0xff00e5ff, v -> cycleAlpha());
        toolbarChip(toolbar, "迷你条", "切换顶部战术迷你条（支持点击穿透）", 0xffffe600, v -> enterStrip(false));
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
        button.setTextSize(11f);
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
