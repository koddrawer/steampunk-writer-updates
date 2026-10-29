package com.koddrawer.steampunkwriter;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeWsPlugin.class);
        super.onCreate(savedInstanceState);
        // màn hình luôn sáng khi đang live, ẩn thanh trạng thái/điều hướng (toàn màn hình)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings s = bridge.getWebView().getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);
            bridge.getWebView().setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
        }
    }

    private void immersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }
}
