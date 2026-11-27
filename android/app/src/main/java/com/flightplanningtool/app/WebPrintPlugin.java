package com.flightplanningtool.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Prints the web view (with the page's print styles) from the system print dialog, which also saves a
 * PDF: the web view itself ignores window.print(). Called from src/lib/print.ts.
 */
@CapacitorPlugin(name = "WebPrint")
public class WebPrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "Flight Planning Tool");
        getActivity().runOnUiThread(() -> {
            PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            if (printManager == null) {
                call.reject("Printing is not available");
                return;
            }
            printManager.print(name, getBridge().getWebView().createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
            call.resolve();
        });
    }
}
