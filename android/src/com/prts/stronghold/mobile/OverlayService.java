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
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * PRTS 悬浮战术终端服务：
 * - 默认 FLAG_NOT_FOCUSABLE：展开侧边抽屉时底层《明日方舟》永不失焦，窗外点击 100% 直达游戏；
 * - 悬浮球快捷手势：单击展开抽屉 / 双击一键识别盟约 / 长按切战术迷你条；
 * - 战术迷你条：内置 ◀ R05·4本 ▶ 回合步进 + 扫商店 + 100% 点击穿透 + 实时抓牌提示；
 * - 统一 PRTS × 终末地哑光工业黑黄青视觉，横屏默认右侧紧凑抽屉 + 三档透明度调节。
 */
public class OverlayService extends Service {
    private static volatile OverlayService active;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final String CHANNEL = "prts_floating_guide";
    private static final String PREFS = "prts_overlay_prefs";
    private static final float[] ALPHA_LEVELS = { 1.0f, 0.86f, 0.72f };

    private static int pendingRound = 0;
    private static int pendingTier = 0;
    private static String pendingHeadline = "";
    private static String pendingGrabHint = "";
    private static String pendingDetail = "";

    private WindowManager manager;
    private TextView ball;
    private LinearLayout panel;
    private LinearLayout strip;
    private TextView stripPrevBtn;
    private TextView stripNextBtn;
    private TextView stripRoundBadge;
    private TextView stripTitleView;
    private TextView stripDetailView;
    private LinearLayout stripActions;
    private TextView unlockChip;
    private WebView web;
    private WindowManager.LayoutParams ballParams;
    private WindowManager.LayoutParams panelParams;
    private WindowManager.LayoutParams stripParams;
    private WindowManager.LayoutParams unlockParams;

    private volatile boolean expanded;
    private volatile boolean stripMode;
    private volatile boolean stripLocked;
    private boolean compactPanel = true; // 横屏默认右侧紧凑抽屉，不挡游戏主战场
    private boolean panelFocusable = false;
    private boolean hiddenTemporarilyForShop = false;
    private int alphaIndex = 0;
    private Button sizeButton;
    private Button alphaButton;
    private int usableWidth;
    private int usableHeight;
    private String shopFlashMessage = "";
    private final Runnable clearShopFlash = new Runnable() {
        @Override public void run() {
            shopFlashMessage = "";
            refreshStripAndBallContent();
        }
    };

    static void stopActive() { if (active != null) { active.dispose(); active.stopSelf(); active = null; } }
    static void hideForScan() { MAIN.post(() -> { if (active != null) { active.collapseToBall(); if (active.ball != null) active.setBallScanning(true); } }); }
    static void showAfterScan() { MAIN.post(() -> { if (active != null && active.ball != null) active.expand(); }); }
    static boolean isExpanded() { return active != null && active.expanded; }
    static void hideForRound() { MAIN.post(() -> { if (active != null) { active.collapseToBall(); if (active.ball != null) active.setBallScanning(false); } }); }

    static void hideForShopQuickShot() {
        MAIN.post(() -> {
            if (active != null && active.expanded && active.panel != null && active.panel.isAttachedToWindow()) {
                active.hiddenTemporarilyForShop = true;
                active.panel.setVisibility(View.INVISIBLE);
            }
        });
    }

    static void restoreAfterShopQuickShot() {
        MAIN.post(() -> {
            if (active != null && active.hiddenTemporarilyForShop) {
                active.hiddenTemporarilyForShop = false;
                if (active.panel != null && active.panel.isAttachedToWindow()) {
                    active.panel.setVisibility(View.VISIBLE);
                }
            }
        });
    }

    static void flashShopResult(final String summary) {
        MAIN.post(() -> {
            OverlayService s = active;
            if (s == null || summary == null || summary.isEmpty()) return;
            s.shopFlashMessage = summary;
            MAIN.removeCallbacks(s.clearShopFlash);
            MAIN.postDelayed(s.clearShopFlash, 6500);
            s.refreshStripAndBallContent();
            if (!s.expanded && !s.stripMode) {
                Toast.makeText(s, summary, Toast.LENGTH_SHORT).show();
            }
        });
    }

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
        MAIN.post(() -> {
            if (round >= 1 && round <= 15) pendingRound = round;
            if (tier >= 1 && tier <= 6) pendingTier = tier;
            if (headline != null) pendingHeadline = headline.trim();
            if (grabHint != null) pendingGrabHint = grabHint.trim();
            if (detail != null) pendingDetail = detail.trim();
            if (active != null) active.refreshStripAndBallContent();
        });
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

    @Override public void onCreate() {
        super.onCreate();
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
            // 后台静默预热 WebView，首次点开悬浮球零白屏/零等待
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
            ball.setText(String.format("R%02d", pendingRound));
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

    private void createStrip() {
        strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.VERTICAL);
        strip.setPadding(dp(8), dp(4), dp(8), dp(4));
        strip.setBackground(background(0xee0b0d11, 4, 0xffffe600));
        strip.setElevation(dp(9));

        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        stripPrevBtn = stepButton("◀", v -> stepRoundFromStrip(-1));
        topRow.addView(stripPrevBtn);

        stripRoundBadge = new TextView(this);
        stripRoundBadge.setTextSize(10.5f);
        stripRoundBadge.setTypeface(null, 1);
        stripRoundBadge.setTextColor(0xff0b0c0e);
        stripRoundBadge.setPadding(dp(5), dp(1), dp(5), dp(1));
        stripRoundBadge.setBackground(background(0xffffe600, 2, 0xffffe600));
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(-2, -2);
        badgeLp.leftMargin = dp(3);
        badgeLp.rightMargin = dp(3);
        topRow.addView(stripRoundBadge, badgeLp);

        stripNextBtn = stepButton("▶", v -> stepRoundFromStrip(1));
        topRow.addView(stripNextBtn);

        stripTitleView = new TextView(this);
        stripTitleView.setTextSize(11f);
        stripTitleView.setTypeface(null, 1);
        stripTitleView.setTextColor(0xfff1f5f9);
        stripTitleView.setSingleLine(true);
        stripTitleView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, -2, 1f);
        titleLp.leftMargin = dp(6);
        topRow.addView(stripTitleView, titleLp);

        stripActions = new LinearLayout(this);
        stripActions.setOrientation(LinearLayout.HORIZONTAL);
        stripActions.setGravity(Gravity.CENTER_VERTICAL);
        miniStripButton(stripActions, "扫店", 0xff00e5ff, v -> dispatchJsEvent("prts-strip-shop-scan", ""));
        miniStripButton(stripActions, "穿透", 0xffffe600, v -> setStripLocked(true));
        miniStripButton(stripActions, "展开", 0xffe2e8f0, v -> expand());
        miniStripButton(stripActions, "球", 0xff94a3b8, v -> collapseToBall());
        topRow.addView(stripActions);
        strip.addView(topRow);

        stripDetailView = new TextView(this);
        stripDetailView.setTextSize(11f);
        stripDetailView.setTextColor(0xff67e8f9);
        stripDetailView.setSingleLine(true);
        stripDetailView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams detailLp = new LinearLayout.LayoutParams(-1, -2);
        detailLp.topMargin = dp(2);
        strip.addView(stripDetailView, detailLp);

        int stripW = Math.min(dp(364), Math.max(dp(240), usableWidth - dp(48)));
        stripParams = params(stripW, dp(52), false, true);
        stripParams.x = Math.max(dp(8), (usableWidth - stripW) / 2);
        stripParams.y = dp(6);

        makeDraggable(strip, strip, stripParams, false, this::syncUnlockChipPosition);

        unlockChip = new TextView(this);
        unlockChip.setText("解锁");
        unlockChip.setTextSize(10f);
        unlockChip.setTypeface(null, 1);
        unlockChip.setTextColor(0xffffe600);
        unlockChip.setGravity(Gravity.CENTER);
        unlockChip.setBackground(background(0xdd0b0d11, 3, 0xaaffe600));
        unlockChip.setContentDescription("解锁触控穿透迷你条");
        unlockParams = params(dp(34), dp(24), false, true);
        unlockChip.setOnClickListener(v -> setStripLocked(false));
        refreshStripAndBallContent();
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

    private void stepRoundFromStrip(int delta) {
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

    private void miniStripButton(LinearLayout host, String text, int color, View.OnClickListener action) {
        TextView btn = new TextView(this);
        btn.setText(text);
        btn.setTextSize(10f);
        btn.setTypeface(null, 1);
        btn.setTextColor(color);
        btn.setPadding(dp(5), dp(2), dp(5), dp(2));
        btn.setBackground(background(0xff171c26, 2, 0xff2b3444));
        btn.setOnClickListener(action);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.leftMargin = dp(3);
        host.addView(btn, lp);
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

    private void refreshStripAndBallContent() {
        if (ball != null && !CovenantScanState.scanning()) {
            setBallScanning(false);
        }
        if (strip == null) return;
        if (pendingRound >= 1 && pendingRound <= 15) {
            stripRoundBadge.setText(pendingTier >= 1 && pendingTier <= 6
                ? String.format("R%02d·%d本", pendingRound, pendingTier)
                : String.format("R%02d", pendingRound));
        } else {
            stripRoundBadge.setText("PRTS");
        }
        String title = !pendingHeadline.isEmpty() ? pendingHeadline : "选定阵容后显示跟打";
        stripTitleView.setText(stripLocked ? (title + " · 已穿透") : title);
        if (!shopFlashMessage.isEmpty()) {
            stripDetailView.setTextColor(0xffffe600);
            stripDetailView.setText(shopFlashMessage);
        } else {
            stripDetailView.setTextColor(0xff67e8f9);
            StringBuilder detail = new StringBuilder();
            if (!pendingGrabHint.isEmpty()) {
                detail.append("抓：").append(pendingGrabHint);
                if (!pendingDetail.isEmpty()) detail.append(" ｜ ").append(pendingDetail);
            } else if (!pendingDetail.isEmpty()) {
                detail.append(pendingDetail);
            } else {
                detail.append(stripLocked ? "触控已穿透至游戏 · 点右侧「解锁」恢复操作" : "可点 ◀ ▶ 切回合、点「扫店」查核心或「穿透」");
            }
            stripDetailView.setText(detail.toString());
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
        stripParams.alpha = locked ? 0.78f : 0.96f;
        stripActions.setVisibility(locked ? View.GONE : View.VISIBLE);
        stripPrevBtn.setVisibility(locked ? View.GONE : View.VISIBLE);
        stripNextBtn.setVisibility(locked ? View.GONE : View.VISIBLE);
        strip.setBackground(background(locked ? 0xcc0b0d11 : 0xf20b0d11, 4, locked ? 0x55ffe600 : 0xffffe600));
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
        // 核心修复：默认 FLAG_NOT_FOCUSABLE，展开面板时底层游戏绝不失焦、窗外点击 100% 直达游戏！
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
        web = GuideWebView.create(this, true);
        panel.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
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
        params.x = Math.max(0, Math.min(params.x, Math.max(0, usableWidth - params.width)));
        params.y = Math.max(0, Math.min(params.y, Math.max(0, usableHeight - params.height)));
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
            // 横屏默认靠右侧贴边展开，留出左侧与中央主战场
            panelParams.x = ballParams != null && ballParams.x < usableWidth / 3 ? dp(6) : Math.max(dp(6), usableWidth - panelParams.width - dp(6));
            panelParams.y = dp(6);
            clamp(panelParams);
        }
        setPanelFocusable(false);
        try {
            removeStripViews();
            panel.setVisibility(View.VISIBLE);
            hiddenTemporarilyForShop = false;
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
            hiddenTemporarilyForShop = false;
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
            stripParams.width = Math.min(dp(364), Math.max(dp(240), usableWidth - dp(48)));
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
        MAIN.removeCallbacks(clearShopFlash);
        if (CovenantScanState.permissionPending()) CovenantScanState.set("cancelled", "助手已关闭，本次识别已取消");
        RoundScanState.stop("悬浮助手已关闭，回合同步已停止");
        ShopScanState.reset();
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
