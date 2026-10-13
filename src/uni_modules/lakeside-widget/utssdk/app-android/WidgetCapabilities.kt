package com.lakeside.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/** Query the system's registered providers, not just whether Kotlin code is present. */
internal object WidgetCapabilities {
    fun registeredKinds(context: Context): List<String> {
        val registered = AppWidgetManager.getInstance(context).installedProviders.map { it.provider }.toSet()
        return listOf(LargeWidgetProvider::class.java to "large", SmallWidgetProvider::class.java to "small")
            .filter { (provider, _) -> registered.contains(ComponentName(context, provider)) }.map { it.second }
    }
    fun availability(context: Context, kinds: List<String>): String = when {
        kinds.isNotEmpty() -> "ready"
        !context.packageManager.hasSystemFeature(PackageManager.FEATURE_APP_WIDGETS) -> "system_unsupported"
        else -> "providers_missing"
    }
    fun pinSupported(context: Context): Boolean = Build.VERSION.SDK_INT >= 26 &&
        try { AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported } catch (_: Exception) { false }
}
