package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.regex.Pattern;

public class ReportFiles extends Activity {
    static final class Bridge {
        private final Context context;
        Bridge(Context c){context=c.getApplicationContext();}
        @JavascriptInterface public String save(String kind,String stem,String encoded) {
            String prefix = context.getString(R.string.report_export_prefix);
            if (!("image".equals(kind)||"document".equals(kind)) || stem==null ||
                !stem.matches(Pattern.quote(prefix) + "_[0-9-]{8,30}") || encoded==null || encoded.length()>16_000_000) return "导出内容无效";
            File file=null;
            try {
                byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
                boolean image="image".equals(kind);
                if(bytes.length==0 || (image && (bytes.length<8 || bytes[0]!=(byte)0x89 || bytes[1]!=80 || bytes[2]!=78 || bytes[3]!=71))) return "图片编码无效";
                file=File.createTempFile("report-", image?".png":".html",context.getCacheDir());
                try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);}
                if(image && (Build.VERSION.SDK_INT>=29 || context.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED)){
                    try { gallery(context,file,stem+".png"); } finally { file.delete(); }
                    return context.getString(R.string.report_album_saved);
                }
                context.startActivity(new Intent(context,ReportFiles.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra("file",file.getName()).putExtra("name",stem+(image?".png":".html")));
                return image?"请允许写入相册":"请选择文档保存位置";
            } catch(Exception e){if(file!=null)file.delete();return "保存失败，请检查存储空间和权限";}
        }
    }
    private static void copy(File file, OutputStream out) throws Exception {
        if(out==null)throw new java.io.IOException();
        try(InputStream in=new FileInputStream(file);OutputStream sink=out){
            byte[] b=new byte[32768]; int n;
            while((n=in.read(b))!=-1)sink.write(b,0,n);
        }
    }
    private static void gallery(Context c,File source,String name)throws Exception{
        String album = c.getString(R.string.report_album_dir);
        if(Build.VERSION.SDK_INT>=29){
            ContentValues values=new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME,name);
            values.put(MediaStore.Images.Media.MIME_TYPE,"image/png");
            values.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/"+album);
            values.put(MediaStore.Images.Media.IS_PENDING,1);
            Uri uri=c.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
            if(uri==null)throw new java.io.IOException();
            try{
                copy(source,c.getContentResolver().openOutputStream(uri));
                values.clear();values.put(MediaStore.Images.Media.IS_PENDING,0);
                if(c.getContentResolver().update(uri,values,null,null)!=1)throw new java.io.IOException();
            }catch(Exception e){c.getContentResolver().delete(uri,null,null);throw e;}
        }else{
            File dir=new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),album);
            if(!dir.isDirectory()&&!dir.mkdirs())throw new java.io.IOException();
            File target=new File(dir,name);
            if(!target.createNewFile())target=File.createTempFile(name.substring(0,name.length()-4)+"-",".png",dir);
            try{copy(source,new FileOutputStream(target));}catch(Exception e){target.delete();throw e;}
            MediaScannerConnection.scanFile(c,new String[]{target.getAbsolutePath()},new String[]{"image/png"},null);
        }
    }
    private File file;
    private String name;
    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        String token=getIntent().getStringExtra("file");
        name=getIntent().getStringExtra("name");
        if(token==null || !token.matches("report-[\\w-]+\\.(png|html)") || name==null){finish();return;}
        file=new File(getCacheDir(),token);
        if(!file.isFile()){finish();return;}
        if(state!=null)return;
        if(name.endsWith(".png"))requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE},20);
        else try{startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("text/html")
            .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,name),21);}
        catch(RuntimeException e){done("无法打开文档保存位置");}
    }
    @Override public void onRequestPermissionsResult(int request,String[] perms,int[] grants){
        super.onRequestPermissionsResult(request,perms,grants);
        if(request!=20)return;
        if(grants.length==0||grants[0]!=PackageManager.PERMISSION_GRANTED){done("未获相册写入权限");return;}
        try{gallery(this,file,name);done(getString(R.string.report_album_saved));}catch(Exception e){done("相册写入失败");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=21)return;
        if(result!=RESULT_OK||data==null||data.getData()==null){done(null);return;}
        try{copy(file,getContentResolver().openOutputStream(data.getData(),"wt"));done("文档已保存");}
        catch(Exception e){done("文档保存失败");}
    }
    private void done(String message){if(file!=null)file.delete();if(message!=null)Toast.makeText(this,message,Toast.LENGTH_SHORT).show();finish();}
}
