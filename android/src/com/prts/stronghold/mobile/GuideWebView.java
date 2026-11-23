package com.prts.stronghold.mobile;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

final class GuideWebView {
    private static final String HOST = "app.prts.local";
    private GuideWebView() {}

    static WebView create(Context context) {
        return create(context, false);
    }

    @SuppressLint("SetJavaScriptEnabled")
    static WebView create(Context context, boolean overlay) {
        WebView view = new WebView(context);
        view.setBackgroundColor(0xff0c141b);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        view.addJavascriptInterface(new SessionBridge(context), "PRTSJournal");
        view.addJavascriptInterface(new ReportFiles.Bridge(context), "PRTSFiles");
        view.addJavascriptInterface(new ScanBridge(context.getApplicationContext()), "PRTSScan");
        view.addJavascriptInterface(new RoundBridge(context.getApplicationContext()), "PRTSRound");
        view.setWebViewClient(new WebViewClient() {
            private boolean local(Uri uri) { return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()); }
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) { return !local(request.getUrl()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (!local(uri) || !"GET".equals(request.getMethod()) || path == null || path.contains("..") || path.contains("\\")) return empty(403, "Forbidden");
                if (path.equals("/")) path = "/index.html";
                try {
                    String mime = path.endsWith(".woff2") ? "font/woff2" : path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".html") ? "text/html" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg" : "application/octet-stream";
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'");
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, context.getAssets().open(path.substring(1)));
                } catch (IOException ignored) { return empty(404, "Not Found"); }
            }
            private WebResourceResponse empty(int status, String reason) { return new WebResourceResponse("text/plain", "UTF-8", status, reason, null, new ByteArrayInputStream(new byte[0])); }
        });
        view.loadUrl("https://" + HOST + "/index.html?mobile=1" + (overlay ? "&overlay=1" : ""));
        return view;
    }

    private static final class ScanBridge {
        private final Context context;
        private final Handler main = new Handler(Looper.getMainLooper());
        ScanBridge(Context context) { this.context=context; }
        @JavascriptInterface public String getState() { return CovenantScanState.json(); }
        @JavascriptInterface public void start() {
            main.post(() -> {
                if (CovenantScanState.permissionPending() || CovenantScanState.scanning()) return;
                CovenantScanService.stopActive();
                RoundScanState.stop("已切换到盟约识别");
                if (!CovenantScanState.begin()) return;
                OverlayService.hideForScan();
                try { context.startActivity(new Intent(context,CapturePermissionActivity.class).putExtra("scanId",CovenantScanState.currentId()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)); }
                catch (RuntimeException error) { CovenantScanState.set("error","无法打开截屏授权，请从应用内重新启动识别"); OverlayService.showAfterScan(); }
            });
        }
        @JavascriptInterface public void stop() {
            if (CovenantScanState.permissionPending()) CovenantScanState.set("cancelled","已取消本次识别");
            main.post(() -> {
                context.stopService(new Intent(context,CovenantScanService.class));
            });
        }
        @JavascriptInterface public void reset() {
            CovenantScanState.reset();
            RoundScanState.reset();
            main.post(() -> context.stopService(new Intent(context,CovenantScanService.class)));
        }
    }

    private static final class RoundBridge {
        private final Context context;
        private final Handler main = new Handler(Looper.getMainLooper());
        RoundBridge(Context context) { this.context = context; }
        @JavascriptInterface public String getState() { return RoundScanState.json(); }
        @JavascriptInterface public String getPreview() { return RoundScanState.preview(); }
        @JavascriptInterface public void start() {
            main.post(() -> {
                if (RoundScanState.is("permission") || RoundScanState.is("capturing") || RoundScanState.is("calibrating") || RoundScanState.is("scanning")) return;
                CovenantScanService.stopActive();
                if (CovenantScanState.permissionPending()) CovenantScanState.set("cancelled", "已切换到回合同步");
                String id = RoundScanState.begin();
                OverlayService.hideForRound();
                try { context.startActivity(new Intent(context, CapturePermissionActivity.class).putExtra("scanId", id).putExtra("roundMode", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)); }
                catch (RuntimeException error) { RoundScanState.stop("无法打开截屏授权，请重试"); OverlayService.showAfterScan(); }
            });
        }
        @JavascriptInterface public void setRegion(double left, double top, double right, double bottom) {
            main.post(() -> { if (RoundScanState.select(left, top, right, bottom)) OverlayService.hideForRound(); });
        }
        @JavascriptInterface public void pause() { RoundScanState.pause(); }
        @JavascriptInterface public void resume() { RoundScanState.resume(); }
        @JavascriptInterface public void stop() {
            RoundScanState.stop("回合同步已停止");
            main.post(() -> { if (CovenantScanService.isRoundMode()) CovenantScanService.stopActive(); });
        }
    }
}
