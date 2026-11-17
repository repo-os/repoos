package org.repoos.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HubDevUpdateConfig")
public class HubDevUpdateConfigPlugin extends Plugin {
    @PluginMethod
    public void getConfig(PluginCall call) {
        boolean enabled = BuildConfig.DEBUG
                && "org.repoos.mobile.dev".equals(BuildConfig.APPLICATION_ID)
                && !BuildConfig.HUB_DEV_UPDATE_BASE_URL.isEmpty();

        JSObject result = new JSObject();
        result.put("enabled", enabled);
        result.put("baseUrl", enabled ? BuildConfig.HUB_DEV_UPDATE_BASE_URL : "");
        result.put("installedCommit", BuildConfig.HUB_BUILD_COMMIT);
        result.put("versionCode", BuildConfig.VERSION_CODE);
        call.resolve(result);
    }
}
