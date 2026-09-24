package nimiyo.litedownloader;

import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaSaverPlugin.class);
        super.onCreate(savedInstanceState);

        // Auto request notification permission on Android 13+ (API 33+)
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
            // Auto request storage permissions on Android 10 and below (API <= 29)
            if (checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                    android.Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    android.Manifest.permission.READ_EXTERNAL_STORAGE
                }, 102);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript(
                "(function() { if (typeof window.handleAppBackButton === 'function') { return window.handleAppBackButton(); } return false; })()",
                (result) -> {
                    if ("false".equals(result) || "null".equals(result) || result == null) {
                        runOnUiThread(() -> super.onBackPressed());
                    }
                }
            );
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public void onDestroy() {
        try {
            android.content.Intent intent = new android.content.Intent(this, MusicPlaybackService.class);
            intent.setAction(MusicPlaybackService.ACTION_CLEAR);
            startService(intent);
        } catch (Exception ignored) {}
        try {
            android.app.NotificationManager manager = (android.app.NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.cancel(MusicPlaybackService.MUSIC_NOTIFICATION_ID);
            }
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
