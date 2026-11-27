package com.flightplanningtool.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The app's own plugins, before the bridge starts.
        registerPlugin(WebPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
