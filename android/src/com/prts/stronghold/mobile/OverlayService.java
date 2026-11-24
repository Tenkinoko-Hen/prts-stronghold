package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
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
import android.view.KeyEvent;
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

public class OverlayService extends Service {
    private static OverlayService active;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final String CHANNEL = "prts_floating_guide";

    private static int pendingRound = 0;
    private static String pendingHeadline = "";
    private static String pendingDetail = "";

    private WindowManager manager;
    private TextView ball;
    private LinearLayout panel;
    private LinearLayout strip;
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
    private boolean expanded;
    private boolean stripMode;
    private boolean stripLocked;
    private boolean compactPanel;
    private Button sizeButton;
    private int usableWidth;
    private int usableHeight;

    static void stopActive() { if (active != null) { active.dispose(); active.stopSelf(); active = null; } }
    static void hideForScan() { if (active != null) { active.collapseToBall(); if (active.ball != null) active.setBallScanning(true); } }
    static void showAfterScan() { if (active != null && active.ball != null) active.expand(); }
    static boolean isExpanded() { return active != null && active.expanded; }
    static void hideForRound() { if (active != null) { active.collapseToBall(); if (active.ball != null) active.setBallScanning(false); } }

    static void updateStripFromBridge(final int round, final String headline, final String detail) {
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (round >= 1 && round <= 15) pendingRound = round;
                if (headline != null) pendingHeadline = headline.trim();
                if (detail != null) pendingDetail = detail.trim();
                if (active != null) active.refreshStripAndBallContent();
            }
        });
    }

    static void enterStripFromBridge(final boolean locked) {
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (active != null) active.enterStrip(locked);
            }
        });
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private GradientDrawable background(int color, int radius, int strokeColor) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radius));
        shape.setStroke(dp(1), strokeColor);
        return shape;
    }

    @Override public void onCreate() { super.onCreate(); active = this; manager = (WindowManager) getSystemService(WINDOW_SERVICE); }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) { dispose(); stopSelf(); return START_NOT_STICKY; }
        if (intent != null && "UNLOCK_STRIP".equals(intent.getAction())) {
            if (stripMode && stripLocked) setStripLocked(false);
            return START_NOT_STICKY;
        }
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        updateForegroundNotification();
        if (ball == null) createBall();
        return START_NOT_STICKY;
    }

    private void updateForegroundNotification() {
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.overlay_channel), NotificationManager.IMPORTANCE_LOW));
        PendingIntent home = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, OverlayService.class).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.overlay_title))
            .setContentText(stripMode && stripLocked ? "微缩条已开启触控穿透 · 点击下方可解锁" : "支持球态 / 点击穿透微缩条 / 完整面板")
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setContentIntent(home);
        if (stripMode && stripLocked) {
            PendingIntent unlock = PendingIntent.getService(this, 2, new Intent(this, OverlayService.class).setAction("UNLOCK_STRIP"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(new Notification.Action.Builder(R.drawable.ic_notification, "解锁微缩条", unlock).build());
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

    private void createBall() {
        measureScreen();
        ball = new TextView(this);
        ball.setTextSize(11.5f);
        ball.setTypeface(null, 1);
        ball.setTextColor(0xffffe600);
        ball.setGravity(Gravity.CENTER);
        ball.setBackground(background(0xff101215, 28, 0xff4b515a));
        setBallScanning(false);
        ball.setElevation(dp(8));
        ballParams = params(dp(52), dp(52), false, true);
        ballParams.x = Math.max(0, usableWidth - dp(60));
        ballParams.y = usableHeight / 3;
        ball.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (expanded) collapseToBall();
                else expand();
            }
        });
        makeDraggable(ball, ball, ballParams, true, null);
        try { manager.addView(ball, ballParams); }
        catch (RuntimeException error) { fail(); }
    }

    private void setBallScanning(boolean scanning) {
        if (ball == null) return;
        if (scanning) {
            ball.setText("识别中");
            ball.setForeground(null);
            ball.setContentDescription(getString(R.string.ball_scan_desc));
        } else if (pendingRound >= 1 && pendingRound <= 15) {
            ball.setText(String.format("R%02d", pendingRound));
            ball.setForeground(null);
            ball.setContentDescription(getString(R.string.ball_desc));
        } else {
            ball.setText("");
            int inset = getResources().getInteger(R.integer.ball_icon_inset_dp);
            ball.setForeground(new InsetDrawable(getDrawable(R.drawable.ic_overlay_ball), dp(inset)));
            ball.setContentDescription(getString(R.string.ball_desc));
        }
    }

    private void createStrip() {
        strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.VERTICAL);
        strip.setPadding(dp(8), dp(5), dp(8), dp(5));
        strip.setBackground(background(0xe80d1117, 4, 0xffffe600));
        strip.setElevation(dp(9));

        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        stripRoundBadge = new TextView(this);
        stripRoundBadge.setTextSize(11f);
        stripRoundBadge.setTypeface(null, 1);
        stripRoundBadge.setTextColor(0xff0b0c0e);
        stripRoundBadge.setPadding(dp(5), dp(1), dp(5), dp(1));
        stripRoundBadge.setBackground(background(0xffffe600, 2, 0xffffe600));
        topRow.addView(stripRoundBadge);

        stripTitleView = new TextView(this);
        stripTitleView.setTextSize(11.5f);
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
        miniStripButton(stripActions, "穿透", 0xffffe600, new View.OnClickListener() {
            @Override public void onClick(View v) { setStripLocked(true); }
        });
        miniStripButton(stripActions, "展开", 0xff9ce3bb, new View.OnClickListener() {
            @Override public void onClick(View v) { expand(); }
        });
        miniStripButton(stripActions, "收球", 0xffcbd5e1, new View.OnClickListener() {
            @Override public void onClick(View v) { collapseToBall(); }
        });
        topRow.addView(stripActions);
        strip.addView(topRow);

        stripDetailView = new TextView(this);
        stripDetailView.setTextSize(11.5f);
        stripDetailView.setTextColor(0xff67e8f9);
        stripDetailView.setSingleLine(true);
        stripDetailView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams detailLp = new LinearLayout.LayoutParams(-1, -2);
        detailLp.topMargin = dp(3);
        strip.addView(stripDetailView, detailLp);

        int stripW = Math.min(dp(292), Math.max(dp(200), usableWidth - dp(44)));
        stripParams = params(stripW, dp(54), false, true);
        stripParams.x = Math.max(dp(8), (usableWidth - stripW) / 2);
        stripParams.y = dp(8);

        makeDraggable(strip, strip, stripParams, false, new Runnable() {
            @Override public void run() { syncUnlockChipPosition(); }
        });

        unlockChip = new TextView(this);
        unlockChip.setText("解锁");
        unlockChip.setTextSize(10f);
        unlockChip.setTypeface(null, 1);
        unlockChip.setTextColor(0xffffe600);
        unlockChip.setGravity(Gravity.CENTER);
        unlockChip.setBackground(background(0xd910141c, 4, 0x99ffe600));
        unlockChip.setContentDescription("解锁触控穿透微缩条");
        unlockParams = params(dp(34), dp(24), false, true);
        unlockChip.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { setStripLocked(false); }
        });
        refreshStripAndBallContent();
    }

    private void miniStripButton(LinearLayout host, String text, int color, View.OnClickListener action) {
        TextView btn = new TextView(this);
        btn.setText(text);
        btn.setTextSize(10.5f);
        btn.setTypeface(null, 1);
        btn.setTextColor(color);
        btn.setPadding(dp(5), dp(2), dp(5), dp(2));
        btn.setBackground(background(0xff18202c, 3, 0xff334155));
        btn.setOnClickListener(action);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.leftMargin = dp(4);
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
        stripRoundBadge.setText(pendingRound >= 1 && pendingRound <= 15 ? String.format("R%02d", pendingRound) : "PRTS");
        String title = !pendingHeadline.isEmpty() ? pendingHeadline : getString(R.string.app_name);
        stripTitleView.setText(stripLocked ? (title + " · 已穿透") : title);
        String detail = !pendingDetail.isEmpty()
            ? pendingDetail
            : (stripLocked ? "触控已100%穿透至游戏 · 点右侧「解锁」恢复操作" : "点「穿透」后不挡下干员与开技能");
        stripDetailView.setText(detail);
    }

    private void enterStrip(boolean locked) {
        measureScreen();
        if (panel == null) createPanel();
        if (strip == null) createStrip();
        try {
            if (panel != null && panel.isAttachedToWindow()) {
                manager.removeView(panel);
                if (web != null) web.onPause();
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
        stripParams.alpha = locked ? 0.82f : 0.96f;
        stripActions.setVisibility(locked ? View.GONE : View.VISIBLE);
        strip.setBackground(background(locked ? 0xcc0b0e14 : 0xf010141c, 4, locked ? 0x66ffe600 : 0xffffe600));
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
        panel.setBackground(background(0xff0c141b, 14, 0xff678a76));
        panel.setPadding(dp(1), dp(1), dp(1), dp(1));
        panel.setElevation(dp(10));
        panelParams = params(1, 1, true, true);
        sizePanel();
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(10), 0, dp(4), 0);
        TextView grip = new TextView(this);
        grip.setText(getString(R.string.overlay_grip));
        grip.setContentDescription(getString(R.string.overlay_drag));
        grip.setTextColor(0xff9ce3bb);
        grip.setTextSize(13);
        toolbar.addView(grip, new LinearLayout.LayoutParams(0, dp(34), 1));
        makeDraggable(grip, panel, panelParams, false, null);

        Button pinBtn = toolbarButton(toolbar, "微缩", "切换点击穿透微缩条", new View.OnClickListener() {
            @Override public void onClick(View v) { enterStrip(false); }
        });
        pinBtn.setTextSize(11.5f);
        LinearLayout.LayoutParams pinLp = (LinearLayout.LayoutParams) pinBtn.getLayoutParams();
        pinLp.width = dp(46);

        sizeButton = toolbarButton(toolbar, "↔", "切换宽窄窗口", new View.OnClickListener() {
            @Override public void onClick(View v) {
                compactPanel = !compactPanel;
                sizePanel();
                try { manager.updateViewLayout(panel, panelParams); } catch (RuntimeException error) { fail(); }
            }
        });
        toolbarButton(toolbar, "−", getString(R.string.overlay_collapse), new View.OnClickListener() {
            @Override public void onClick(View v) { collapseToBall(); }
        });
        toolbarButton(toolbar, "×", "退出悬浮助手", new View.OnClickListener() {
            @Override public void onClick(View v) { dispose(); stopSelf(); }
        });
        panel.addView(toolbar);
        web = GuideWebView.create(this, true);
        web.setOnKeyListener(new View.OnKeyListener() {
            @Override public boolean onKey(View v, int key, KeyEvent event) {
                if (key == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) { collapseToBall(); return true; }
                return false;
            }
        });
        panel.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private Button toolbarButton(LinearLayout toolbar, String label, String description, View.OnClickListener action) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(19);
        button.setContentDescription(description);
        button.setTooltipText(description);
        button.setTextColor(0xffc5f2d6);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(0, 0, 0, 0);
        button.setBackground(background(0xff20382e, 8, 0xff678a76));
        button.setOnClickListener(action);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(dp(36), dp(30));
        layout.leftMargin = dp(6);
        toolbar.addView(button, layout);
        return button;
    }

    private void sizePanel() {
        boolean landscape = usableWidth > usableHeight;
        int preferredWidth = landscape && !compactPanel ? Math.min(dp(760), Math.round(usableWidth * 0.78f)) : dp(420);
        panelParams.width = Math.min(preferredWidth, Math.max(1, usableWidth - dp(16)));
        panelParams.height = Math.max(1, usableHeight - dp(16));
        if (sizeButton != null) {
            sizeButton.setVisibility(landscape ? View.VISIBLE : View.GONE);
            sizeButton.setText(compactPanel ? "↔" : "⇥");
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
        if (CovenantScanState.scanning()) stopService(new Intent(this, CovenantScanService.class));
        measureScreen();
        if (panel == null) {
            createPanel();
            panelParams.x = ballParams.x < usableWidth / 2 ? dp(8) : usableWidth - panelParams.width - dp(8);
            panelParams.y = dp(8);
        }
        sizePanel();
        try {
            removeStripViews();
            if (!panel.isAttachedToWindow()) manager.addView(panel, panelParams);
            if (ball != null && ball.isAttachedToWindow()) manager.removeView(ball);
            expanded = true;
            updateForegroundNotification();
            web.onResume();
            web.requestFocus();
        } catch (RuntimeException error) { fail(); }
    }

    private void collapseToBall() {
        if (!expanded && !stripMode) return;
        try {
            if (panel != null && panel.isAttachedToWindow()) {
                manager.removeView(panel);
                if (web != null) web.onPause();
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
            stripParams.width = Math.min(dp(292), Math.max(dp(200), usableWidth - dp(44)));
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
        if (web != null) { panel.removeView(web); web.destroy(); web = null; }
        ball = null; panel = null; strip = null; unlockChip = null; sizeButton = null;
        expanded = false; stripMode = false; stripLocked = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override public void onDestroy() { dispose(); if (active == this) active = null; super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
