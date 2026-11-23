package com.prts.dossier.review;

import android.app.*;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import java.nio.ByteBuffer;
import java.io.ByteArrayOutputStream;
import android.util.Base64;
import java.util.*;

public class CovenantScanService extends Service {
    private static CovenantScanService active;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private TextRecognizer recognizer;
    private boolean busy, finished;
    private long lastFrame;
    private int captureWidth, captureHeight;
    private String scanId;
    private boolean roundMode;
    private final RoundDetector roundDetector = new RoundDetector();
    private long roundGeneration = -1;
    private final Runnable timeout = () -> {
        if (roundMode && (RoundScanState.is("scanning") || RoundScanState.is("paused"))) return;
        end(roundMode ? "框选已超时，请重新开启回合同步" : "识别已结束；未读全时请重新扫描盟约总览", false);
    };
    static boolean isRoundMode() { return active != null && active.roundMode && !active.finished; }
    static void stopActive() { if (active != null) active.end("识别已停止", false); }
    @Override public void onCreate() { super.onCreate(); active = this; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) { end("已停止识别，本局条件尚未更改",false); return START_NOT_STICKY; }
        if (projection != null || finished) return START_NOT_STICKY;
        scanId=intent == null ? null : intent.getStringExtra("scanId");
        roundMode=intent != null && intent.getBooleanExtra("roundMode", false);
        if (roundMode ? !RoundScanState.matches(scanId) || !RoundScanState.is("permission") : !CovenantScanState.matches(scanId) || !CovenantScanState.permissionPending()) { stopSelf(); return START_NOT_STICKY; }
        try {
            NotificationManager notifications = getSystemService(NotificationManager.class);
            notifications.createNotificationChannel(new NotificationChannel("prts_scan", "盟约识别", NotificationManager.IMPORTANCE_LOW));
            PendingIntent stop = PendingIntent.getService(this, 10, new Intent(this,CovenantScanService.class).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE);
            Notification notice = new Notification.Builder(this,"prts_scan").setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(roundMode ? "回合自动同步中" : "正在识别盟约 Ban").setContentText(roundMode ? "收起助手后识别回合；点此停止共享" : "停留本局盟约总览；点此停止并查看结果").setContentIntent(stop).setOngoing(true)
                .addAction(new Notification.Action.Builder(R.drawable.ic_notification,"停止识别",stop).build()).build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(2,notice,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            else startForeground(2,notice);
            recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
            Intent data = intent.getParcelableExtra("data");
            if (data == null) throw new IllegalArgumentException("Missing capture consent");
            projection = getSystemService(MediaProjectionManager.class).getMediaProjection(intent.getIntExtra("resultCode",0),data);
            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() { end("系统已结束屏幕共享；可重新识别",false); }
                @Override public void onCapturedContentResize(int width, int height) {
                    // 不复用授权创建第二个 VirtualDisplay；尺寸变化时只重设现有 Surface。
                    if (display != null && !finished) {
                        try { resize(width,height); } catch (RuntimeException error) { end("屏幕尺寸已改变，请重新识别",true); }
                    }
                }
            },handler);
            DisplayMetrics metrics = new DisplayMetrics();
            getSystemService(WindowManager.class).getDefaultDisplay().getRealMetrics(metrics);
            createReader(metrics.widthPixels,metrics.heightPixels);
            display = projection.createVirtualDisplay("PRTS covenant scan", captureWidth,captureHeight,metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,reader.getSurface(),null,handler);
            if (roundMode) { RoundScanState.set("capturing", "请回到游戏，准备框选回合数字"); OverlayService.hideForRound(); }
            else { CovenantScanState.set("scanning","请回到游戏的本局盟约总览，停留片刻"); OverlayService.hideForScan(); }
            handler.postDelayed(timeout,roundMode ? 90000 : 45000);
        } catch (RuntimeException error) { end("识别未能启动，请重新授权屏幕共享",true); }
        return START_NOT_STICKY;
    }

    private void createReader(int width,int height) {
        float scale = Math.min(1f,1920f/Math.max(width,height));
        captureWidth=Math.max(1,Math.round(width*scale)); captureHeight=Math.max(1,Math.round(height*scale));
        reader=ImageReader.newInstance(captureWidth,captureHeight,PixelFormat.RGBA_8888,2);
        reader.setOnImageAvailableListener(this::frame,handler);
    }
    private void resize(int width,int height) {
        float scale=Math.min(1f,1920f/Math.max(width,height));
        if (Math.round(width*scale)==captureWidth && Math.round(height*scale)==captureHeight) return;
        display.setSurface(null);
        if (reader != null) reader.close();
        createReader(width,height);
        display.resize(captureWidth,captureHeight,getResources().getDisplayMetrics().densityDpi);
        display.setSurface(reader.getSurface());
        if (roundMode) { RoundScanState.set("capturing", "屏幕尺寸已改变，请重新框选回合数字"); roundDetector.reset(); OverlayService.hideForRound(); }
    }
    private void frame(ImageReader source) {
        if (finished) return;
        Bitmap bitmap = null;
        try (Image frame=source.acquireLatestImage()) {
            if (frame == null || busy || SystemClock.elapsedRealtime()-lastFrame < (roundMode ? 2000 : 750)) return;
            if (roundMode && (OverlayService.isExpanded() || MainActivity.isVisible() || (!RoundScanState.is("capturing") && !RoundScanState.is("scanning")))) { roundDetector.reset(); return; }
            lastFrame=SystemClock.elapsedRealtime();
            Image.Plane plane=frame.getPlanes()[0]; ByteBuffer buffer=plane.getBuffer();
            int width=frame.getWidth(), height=frame.getHeight(), stride=plane.getRowStride(), step=plane.getPixelStride();
            int[] pixels=new int[width*height];
            for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
                int offset=y*stride+x*step;
                pixels[y*width+x]=0xff000000|((buffer.get(offset)&255)<<16)|((buffer.get(offset+1)&255)<<8)|(buffer.get(offset+2)&255);
            }
            bitmap=Bitmap.createBitmap(pixels,width,height,Bitmap.Config.ARGB_8888);
            if (roundMode) { readRound(bitmap); return; }
            Bitmap owned=bitmap; busy=true;
            recognizer.process(InputImage.fromBitmap(owned,0)).addOnSuccessListener(text -> {
                if (!finished && CovenantScanState.matches(scanId) && CovenantScanState.observe(readCovenants(text,pixels,width,height))) end("26 个盟约已确认，推荐已更新",false);
            }).addOnFailureListener(error -> { if (!finished) end("文字识别失败，请重试并保持总览清晰可见",true); })
                .addOnCompleteListener(task -> { owned.recycle(); busy=false; });
        } catch (RuntimeException error) { if (bitmap != null && !busy) bitmap.recycle(); end("截屏读取失败，请重新授权",true); }
    }

    private void readRound(Bitmap bitmap) {
        if (RoundScanState.is("capturing")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, bytes); bitmap.recycle();
            RoundScanState.calibrate(Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
            OverlayService.showAfterScan(); return;
        }
        double[] region = RoundScanState.region();
        if (region == null) { bitmap.recycle(); return; }
        long generation = RoundScanState.generation();
        if (roundGeneration != generation) { roundDetector.reset(); roundGeneration = generation; }
        int x = (int)(region[0] * bitmap.getWidth()), y = (int)(region[1] * bitmap.getHeight());
        int width = Math.max(1, (int)((region[2] - region[0]) * bitmap.getWidth()));
        int height = Math.max(1, (int)((region[3] - region[1]) * bitmap.getHeight()));
        Bitmap cropped = Bitmap.createBitmap(bitmap, x, y, width, height);
        if (cropped != bitmap) bitmap.recycle();
        float scale = Math.min(4f, 120f / height);
        Bitmap input = Bitmap.createScaledBitmap(cropped, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), true);
        if (input != cropped) cropped.recycle();
        busy = true;
        recognizer.process(InputImage.fromBitmap(input, 0)).addOnSuccessListener(text -> {
            if (!finished && RoundScanState.matches(scanId) && !OverlayService.isExpanded() && !MainActivity.isVisible() && RoundScanState.generation() == generation) {
                int observed = roundDetector.observe(text.getText(), SystemClock.elapsedRealtime());
                if (RoundScanState.observe(observed, generation)) SessionBridge.observe(this, observed);
            } else roundDetector.reset();
        }).addOnFailureListener(error -> { roundDetector.reset(); })
          .addOnCompleteListener(task -> { input.recycle(); busy = false; });
    }

    private Map<String,Integer> readCovenants(Text text,int[] pixels,int width,int height) {
        Map<String,Integer> found=new HashMap<>();
        String page=text.getText().replaceAll("\\s+","");
        if (!page.contains("核心盟约") && !page.contains("附加盟约")) return found;
        for(Text.TextBlock block:text.getTextBlocks()) for(Text.Line line:block.getLines()) {
            StringBuilder words=new StringBuilder(); List<Rect> boxes=new ArrayList<>();
            for(Text.Element element:line.getElements()) {
                if (!element.getSymbols().isEmpty()) {
                    for(Text.Symbol symbol:element.getSymbols()) append(words,boxes,symbol.getText(),symbol.getBoundingBox());
                } else append(words,boxes,element.getText(),element.getBoundingBox());
            }
            for(String name:CovenantDetector.NAMES) {
                int index=words.indexOf(name);
                if(index<0 || index+name.length()>boxes.size()) continue;
                Rect rect=new Rect(boxes.get(index));
                for(int i=index+1;i<index+name.length();i++) rect.union(boxes.get(i));
                int state=CovenantDetector.classify(pixels,width,height,rect.left,rect.top,rect.right,rect.bottom);
                if(state!=0) found.put(name,state);
            }
        }
        return found;
    }
    private void append(StringBuilder words,List<Rect> boxes,String value,Rect box) {
        if(box==null) return;
        for(int i=0;i<value.length();i++) {
            char c=value.charAt(i); if(Character.isWhitespace(c)) continue;
            words.append(c); boxes.add(new Rect(box.left+box.width()*i/value.length(),box.top,box.left+box.width()*(i+1)/value.length(),box.bottom));
        }
    }
    private void end(String message,boolean error) {
        if(finished) return; finished=true;
        boolean current = roundMode ? RoundScanState.matches(scanId) : CovenantScanState.matches(scanId);
        if (roundMode && current) RoundScanState.stop(message);
        else if(!roundMode && current) {
            if(error) CovenantScanState.set("error",message); else CovenantScanState.finish(message);
        }
        release(); stopSelf(); if (!roundMode && current) OverlayService.showAfterScan();
    }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (Build.VERSION.SDK_INT >= 34 || display == null || finished) return;
        try {
            DisplayMetrics metrics=new DisplayMetrics();
            getSystemService(WindowManager.class).getDefaultDisplay().getRealMetrics(metrics);
            resize(metrics.widthPixels,metrics.heightPixels);
        } catch (RuntimeException error) { end("屏幕方向已改变，请重新识别",true); }
    }
    private void release() {
        handler.removeCallbacks(timeout);
        if(display!=null) { display.release(); display=null; }
        if(reader!=null) { reader.close(); reader=null; }
        if(projection!=null) { MediaProjection old=projection; projection=null; old.stop(); }
        if(recognizer!=null) { recognizer.close(); recognizer=null; }
        stopForeground(STOP_FOREGROUND_REMOVE);
    }
    @Override public void onDestroy() { if(!finished) { finished=true; if(roundMode && RoundScanState.matches(scanId)) RoundScanState.stop("屏幕共享已停止"); else if(!roundMode && CovenantScanState.matches(scanId)) CovenantScanState.finish("识别已停止，可重新扫描"); } release(); if (active == this) active = null; super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
