package org.repoos.mobile;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HubSystemChrome")
public class HubSystemChromePlugin extends Plugin {
    @PluginMethod
    public void setWindowBackgroundColor(PluginCall call) {
        String color = call.getString("color");
        if (color == null) {
            call.reject("A window background color is required");
            return;
        }

        final int parsedColor;
        try {
            parsedColor = Color.parseColor(color);
        } catch (IllegalArgumentException error) {
            call.reject("The window background color is invalid", error);
            return;
        }

        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().setBackgroundDrawable(new ColorDrawable(parsedColor));
            call.resolve();
        });
    }
}
