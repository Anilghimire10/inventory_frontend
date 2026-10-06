package com.inventorymanager.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Prints a page of HTML through Android's print dialog (a Wi-Fi or Bluetooth
 * printer, or Save as PDF).
 *
 * The app's web view can't do it itself: it opens no pop-up windows and
 * ignores window.print(), so every receipt, Z report and label sheet only
 * ever said "Please allow pop-ups". See src/lib/print.ts.
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    // Held until the page has loaded and gone to the print manager: a web
    // view nothing references can be collected mid-load, and then no print
    // dialog ever appears.
    private WebView pending;

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        if (html == null) {
            call.reject("Nothing to print");
            return;
        }
        String name = call.getString("name", "Document");
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getActivity());
            view.setWebViewClient(new WebViewClient() {
                private boolean sent = false;

                @Override
                public void onPageFinished(WebView loaded, String url) {
                    if (sent) return;
                    sent = true;
                    PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                    manager.print(name, loaded.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
                    pending = null;
                    call.resolve();
                }
            });
            pending = view;
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
