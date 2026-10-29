package com.koddrawer.steampunkwriter;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;
import org.json.JSONObject;

/** WebSocket native (OkHttp) cho kết nối TikTok LIVE: gửi được Cookie / User-Agent / Origin như thư viện "ws" của Node. */
@CapacitorPlugin(name = "NativeWs")
public class NativeWsPlugin extends Plugin {
    private final OkHttpClient client = new OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(20, TimeUnit.SECONDS)
        .build();
    private final Map<String, WebSocket> sockets = new ConcurrentHashMap<>();

    @PluginMethod
    public void connect(PluginCall call) {
        final String id = call.getString("id");
        String url = call.getString("url");
        if (id == null || url == null) { call.reject("thiếu id/url"); return; }
        Request.Builder rb = new Request.Builder().url(url);
        JSObject headers = call.getObject("headers", new JSObject());
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            String v = headers.optString(k, null);
            if (v != null) { try { rb.header(k, v); } catch (Exception ignored) { } }
        }
        WebSocket ws = client.newWebSocket(rb.build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket webSocket, Response response) {
                JSObject o = new JSObject(); o.put("id", id); notifyListeners("open", o);
            }
            @Override public void onMessage(WebSocket webSocket, ByteString bytes) {
                JSObject o = new JSObject(); o.put("id", id); o.put("binary", true);
                o.put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                notifyListeners("message", o);
            }
            @Override public void onMessage(WebSocket webSocket, String text) {
                JSObject o = new JSObject(); o.put("id", id); o.put("binary", false); o.put("data", text);
                notifyListeners("message", o);
            }
            @Override public void onClosing(WebSocket webSocket, int code, String reason) { webSocket.close(code, null); }
            @Override public void onClosed(WebSocket webSocket, int code, String reason) {
                sockets.remove(id);
                JSObject o = new JSObject(); o.put("id", id); o.put("code", code); o.put("reason", reason);
                notifyListeners("close", o);
            }
            @Override public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                sockets.remove(id);
                JSObject o = new JSObject(); o.put("id", id);
                o.put("message", (t != null ? t.getMessage() : "lỗi") + (response != null ? " (HTTP " + response.code() + ")" : ""));
                notifyListeners("error", o);
            }
        });
        sockets.put(id, ws);
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        WebSocket ws = sockets.get(call.getString("id"));
        if (ws == null) { call.reject("chưa kết nối"); return; }
        byte[] data = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
        ws.send(ByteString.of(data));
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        WebSocket ws = sockets.remove(call.getString("id"));
        if (ws != null) ws.close(call.getInt("code", 1000), call.getString("reason", ""));
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        for (WebSocket ws : sockets.values()) ws.cancel();
        sockets.clear();
    }
}
