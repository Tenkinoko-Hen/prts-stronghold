package com.prts.stronghold.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONObject;

final class SessionBridge {
    private final Context context;
    SessionBridge(Context context) { this.context = context.getApplicationContext(); }
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("battle-journal", Context.MODE_PRIVATE); }
    private static JSONObject read(Context c) throws Exception {
        return new JSONObject(prefs(c).getString("active", "{}"));
    }
    @JavascriptInterface public String snapshot() {
        synchronized (SessionBridge.class) {
            try { return new JSONObject().put("active",read(context))
                .put("history",new JSONArray(prefs(context).getString("history","[]"))).toString(); }
            catch (Exception e) { return "{\"error\":true}"; }
        }
    }
    @JavascriptInterface public boolean start() {
        synchronized (SessionBridge.class) {
            try {
                JSONObject old=read(context);
                if(old.has("started") && !old.has("ended")) return false;
                JSONArray history=new JSONArray(prefs(context).getString("history","[]"));
                if(old.has("ended")) history.put(old);
                JSONObject fresh=new JSONObject().put("started",System.currentTimeMillis()).put("rounds",new JSONObject());
                return prefs(context).edit().putString("active",fresh.toString()).putString("history",history.toString()).commit();
            } catch(Exception e){return false;}
        }
    }
    @JavascriptInterface public boolean finish(String id) {
        synchronized (SessionBridge.class) {
            try {
                JSONObject session=read(context);
                if(!id.equals(session.optString("started")) || session.has("ended")) return false;
                session.put("ended",System.currentTimeMillis());
                return prefs(context).edit().putString("active",session.toString()).commit();
            } catch(Exception e){return false;}
        }
    }
    static synchronized void observe(Context context, int round) {
        if(round<1 || round>15) return;
        try {
            JSONObject s=read(context);
            if(!s.has("started") || s.has("ended")) return;
            JSONObject rows=s.getJSONObject("rounds");
            String key=String.valueOf(round);
            JSONObject row=rows.optJSONObject(key);
            if(row==null) row=new JSONObject();
            if(row.has("ocr") && s.optInt("current")==round) return;
            if(!row.has("ocr")) row.put("ocr",System.currentTimeMillis());
            rows.put(key,row);
            s.put("current",round);
            prefs(context).edit().putString("active",s.toString()).apply();
        } catch(Exception ignored) { }
    }
    @JavascriptInterface public boolean record(String id,int round,String raw) {
        if(round<1 || round>15 || raw==null || raw.length()>6000) return false;
        synchronized (SessionBridge.class) {
            try {
                JSONObject s=read(context);
                if(!id.equals(s.optString("started")) || s.has("ended")) return false;
                JSONObject update=new JSONObject(raw);
                JSONObject rows=s.getJSONObject("rounds");
                String key=String.valueOf(round);
                JSONObject row=rows.optJSONObject(key);
                if(row==null) row=new JSONObject();
                boolean any=false;
                for(String field:new String[]{"leaks","helps","boss"}) {
                    if(update.isNull(field)) {row.remove(field); continue;}
                    int n=update.getInt(field);
                    if(n<0 || n>1000000000) return false;
                    row.put(field,n); any=true;
                }
                String note=update.optString("note","").trim();
                if(note.length()>400) return false;
                JSONArray spawns=update.optJSONArray("spawns");
                if(spawns!=null){
                    if(spawns.length()>45)return false;
                    for(int i=0;i<spawns.length();i++){
                        JSONObject e=spawns.getJSONObject(i);
                        if(e.getString("id").length()>90 || e.getString("name").length()>90 ||
                            e.getInt("count")<1 || e.getInt("count")>9999 || e.getInt("batch")<1 || e.getInt("batch")>30)return false;
                    }
                    row.put("spawns",spawns);
                }
                if(!any && note.isEmpty() && (spawns==null || spawns.length()==0)) return false;
                row.put("note",note).put("manual",System.currentTimeMillis());
                rows.put(key,row);
                return prefs(context).edit().putString("active",s.toString()).commit();
            } catch(Exception e){return false;}
        }
    }

    @JavascriptInterface public boolean importLanMatch(String rawMatchJson) {
        if (rawMatchJson == null || rawMatchJson.length() > 120000) return false;
        synchronized (SessionBridge.class) {
            try {
                JSONObject incoming = new JSONObject(rawMatchJson);
                JSONObject incomingRounds = incoming.optJSONObject("rounds");
                if (incomingRounds == null || incomingRounds.length() == 0) return false;
                JSONObject sanitizedRounds = new JSONObject();
                for (int r = 1; r <= 15; r++) {
                    String key = String.valueOf(r);
                    JSONObject src = incomingRounds.optJSONObject(key);
                    if (src == null) continue;
                    JSONObject clean = new JSONObject();
                    for (String field : new String[]{"leaks", "helps", "boss"}) {
                        if (!src.isNull(field)) {
                            int v = src.optInt(field, -1);
                            if (v >= 0 && v <= 1000000000) clean.put(field, v);
                        }
                    }
                    String note = src.optString("note", "").trim();
                    if (note.length() > 400) note = note.substring(0, 400);
                    if (!note.isEmpty()) clean.put("note", note);
                    JSONArray spawns = src.optJSONArray("spawns");
                    if (spawns != null && spawns.length() <= 45) clean.put("spawns", spawns);
                    clean.put("manual", System.currentTimeMillis());
                    sanitizedRounds.put(key, clean);
                }
                if (sanitizedRounds.length() == 0) return false;
                JSONObject old = read(context);
                JSONArray history = new JSONArray(prefs(context).getString("history", "[]"));
                if (old.has("started") && old.optJSONObject("rounds") != null && old.optJSONObject("rounds").length() > 0) {
                    if (!old.has("ended")) old.put("ended", System.currentTimeMillis());
                    history.put(old);
                }
                long now = System.currentTimeMillis();
                JSONObject fresh = new JSONObject()
                    .put("started", now)
                    .put("current", Math.max(1, Math.min(15, incoming.optInt("current", 1))))
                    .put("rounds", sanitizedRounds);
                if (incoming.optBoolean("ended", false)) {
                    fresh.put("ended", now);
                }
                return prefs(context).edit()
                    .putString("active", fresh.toString())
                    .putString("history", history.toString())
                    .commit();
            } catch (Exception e) {
                return false;
            }
        }
    }
}
