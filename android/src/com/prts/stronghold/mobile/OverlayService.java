package com.prts.stronghold.mobile;

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
import android.os.IBinder;
import android.provider.Settings;
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
    private static final String CHANNEL = "prts_floating_guide";
    private WindowManager manager;
    private TextView ball;
    private LinearLayout panel;
    private WebView web;
    private WindowManager.LayoutParams ballParams;
    private WindowManager.LayoutParams panelParams;
    private boolean expanded;
    private boolean compactPanel;
    private Button sizeButton;
    private int usableWidth;
    private int usableHeight;

    static void stopActive() { if (active != null) { active.dispose(); active.stopSelf(); active = null; } }
    static void hideForScan() { if (active != null) { active.collapse(); if (active.ball != null) active.setBallScanning(true); } }
    static void showAfterScan() { if (active != null && active.ball != null) active.expand(); }
    static boolean isExpanded() { return active != null && active.expanded; }
    static void hideForRound() { if (active != null) { active.collapse(); if (active.ball != null) active.setBallScanning(false); } }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private GradientDrawable background(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radius));
        shape.setStroke(dp(1), 0xff678a76);
        return shape;
    }

    @Override public void onCreate() { super.onCreate(); active = this; manager = (WindowManager) getSystemService(WINDOW_SERVICE); }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) { dispose(); stopSelf(); return START_NOT_STICKY; }
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "悬浮攻略", NotificationManager.IMPORTANCE_LOW));
        PendingIntent home = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, OverlayService.class).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setContentTitle("PRTS 随行攻略正在悬浮")
            .setContentText("点悬浮球展开 / 收起；可随时停止")
            .setSmallIcon(R.drawable.ic_notification).setOngoing(true).setContentIntent(home)
            .addAction(new Notification.Action.Builder(R.drawable.ic_notification, "关闭悬浮助手", stop).build()).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, notification);
        if (ball == null) createBall();
        return START_NOT_STICKY;
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
    private WindowManager.LayoutParams params(int width, int height, boolean focusable) {
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(width, height, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | (focusable ? 0 : WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE), PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        return params;
    }
    private void createBall() {
        measureScreen();
        ball = new TextView(this);
        ball.setTextSize(12);
        ball.setTypeface(null, 1);
        ball.setTextColor(0xffffe600);
        ball.setGravity(Gravity.CENTER);
        GradientDrawable surface = background(0xff101215, 28);
        surface.setStroke(dp(1), 0xff4b515a);
        ball.setBackground(surface);
        setBallScanning(false);
        ball.setElevation(dp(8));
        ballParams = params(dp(52), dp(52), false);
        ballParams.x = Math.max(0, usableWidth - dp(60));
        ballParams.y = usableHeight / 3;
        ball.setOnClickListener(v -> { if (expanded) collapse(); else expand(); });
        makeDraggable(ball, ball, ballParams, true);
        try { manager.addView(ball, ballParams); }
        catch (RuntimeException error) { fail(); }
    }

    private void setBallScanning(boolean scanning) {
        ball.setText(scanning ? "识别中" : "");
        ball.setForeground(scanning ? null : new InsetDrawable(getDrawable(R.drawable.ic_prts), dp(7)));
        ball.setContentDescription(scanning ? "正在识别盟约，点击展开攻略" : "PRTS 悬浮球，点击展开攻略，可拖动");
    }

    private void createPanel() {
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackground(background(0xff0c141b, 14));
        panel.setPadding(dp(1), dp(1), dp(1), dp(1));
        panel.setElevation(dp(10));
        panelParams = params(1, 1, true);
        sizePanel();
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(10), 0, dp(4), 0);
        TextView grip = new TextView(this);
        grip.setText("⠿ PRTS");
        grip.setContentDescription("拖动攻略窗口");
        grip.setTextColor(0xff9ce3bb);
        grip.setTextSize(13);
        toolbar.addView(grip, new LinearLayout.LayoutParams(0, dp(34), 1));
        makeDraggable(grip, panel, panelParams, false);
        sizeButton = toolbarButton(toolbar, "↔", "切换宽窄窗口", v -> {
            compactPanel = !compactPanel;
            sizePanel();
            try { manager.updateViewLayout(panel, panelParams); } catch (RuntimeException error) { fail(); }
        });
        toolbarButton(toolbar, "−", "收起攻略", v -> collapse());
        toolbarButton(toolbar, "×", "退出悬浮助手", v -> { dispose(); stopSelf(); });
        panel.addView(toolbar);
        web = GuideWebView.create(this, true);
        web.setOnKeyListener((v, key, event) -> {
            if (key == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) { collapse(); return true; }
            return false;
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
        button.setBackground(background(0xff20382e, 8));
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
        params.x = Math.max(0, Math.min(params.x, usableWidth - params.width));
        params.y = Math.max(0, Math.min(params.y, usableHeight - params.height));
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
            manager.addView(panel, panelParams);
            if (ball.isAttachedToWindow()) manager.removeView(ball);
            expanded = true;
            web.onResume();
            web.requestFocus();
        } catch (RuntimeException error) { fail(); }
    }
    private void collapse() {
        if (!expanded) return;
        try {
            manager.removeView(panel);
            web.onPause();
            clamp(ballParams);
            expanded = false;
            setBallScanning(false);
            if (!ball.isAttachedToWindow()) manager.addView(ball, ballParams);
        } catch (RuntimeException error) { fail(); }
    }
    private void makeDraggable(View handle, View window, WindowManager.LayoutParams params, boolean snap) {
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
                        try { manager.updateViewLayout(window, params); } catch (RuntimeException error) { fail(); }
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
        try {
            if (expanded) manager.updateViewLayout(panel, panelParams);
            if (ball != null && ball.isAttachedToWindow()) manager.updateViewLayout(ball, ballParams);
        } catch (RuntimeException error) { fail(); }
    }
    private void fail() { Toast.makeText(this, "悬浮窗已关闭，请检查悬浮窗与后台权限后重新开启", Toast.LENGTH_LONG).show(); dispose(); stopSelf(); }
    private void dispose() {
        if (CovenantScanState.permissionPending()) CovenantScanState.set("cancelled","助手已关闭，本次识别已取消");
        RoundScanState.stop("悬浮助手已关闭，回合同步已停止");
        stopService(new Intent(this, CovenantScanService.class));
        if (panel != null && panel.isAttachedToWindow()) manager.removeViewImmediate(panel);
        if (ball != null && ball.isAttachedToWindow()) manager.removeViewImmediate(ball);
        if (web != null) { panel.removeView(web); web.destroy(); web = null; }
        ball = null; panel = null; sizeButton = null; expanded = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
    }
    @Override public void onDestroy() { dispose(); if (active == this) active = null; super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
