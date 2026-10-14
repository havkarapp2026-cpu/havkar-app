package online.havkar.app;

import android.util.Log;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {

    private static final String SAFE_AREA_ASSET = "havkar-safe-area.js";

    private boolean platformBackRegistered;
    private boolean safeAreaInstalled;

    @Override
    public void onResume() {
        super.onResume();
        installSafeArea();
        installBackNavigation();
    }

    private void installSafeArea() {
        if (safeAreaInstalled || bridge == null || bridge.getWebView() == null) {
            return;
        }
        final String script;
        try (InputStream input = getAssets().open(SAFE_AREA_ASSET)) {
            script = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            Log.e("HAVKAR", "Safe area script was not packaged");
            return;
        }
        safeAreaInstalled = true;
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                view.evaluateJavascript(script, null);
            }
        });
        bridge.getWebView().evaluateJavascript(script, null);
    }

    private void installBackNavigation() {
        if (platformBackRegistered || bridge == null || bridge.getWebView() == null) {
            return;
        }
        platformBackRegistered = true;
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge == null ? null : bridge.getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }
}
