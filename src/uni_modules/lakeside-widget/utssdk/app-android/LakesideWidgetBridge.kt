package com.lakeside.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.util.concurrent.Executors
import androidx.annotation.Keep

@Keep
object LakesideWidgetBridge {
    internal val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    @JvmStatic fun syncSnapshot(context: Context, raw: String, complete: (String) -> Unit) {
        executor.execute {
            val result = try {
                val snapshot = WidgetRepository(context).write(raw)
                // Cache success remains success even if this launcher rejects an update.
                WidgetUpdates.refreshAll(context)
                JSONObject().put("ok", true).put("revision", snapshot.revision)
            } catch (_: Exception) { JSONObject().put("ok", false).put("revision", "").put("error", "小组件数据未能保存") }
            main.post { complete(result.toString()) }
        }
    }
    @JvmStatic fun getWidgetState(context: Context): String = try { WidgetRepository(context).state() } catch (_: Exception) {
        JSONObject().put("supported", false).put("pinSupported", false).put("availability", "bridge_error")
            .put("nativeVersion", 2).put("packageName", context.packageName).put("revision", "")
            .put("cacheState", "error").put("instances", org.json.JSONArray()).toString()
    }
    @JvmStatic fun updateWidgetOptions(context: Context, id: Int, raw: String, complete: (String) -> Unit) {
        executor.execute {
            val ok = try {
                val repo = WidgetRepository(context)
                val kind = repo.instances().firstOrNull { it.first == id }?.second ?: throw IllegalArgumentException("Removed widget")
                repo.saveOptions(id, kind, raw)
                WidgetUpdates.refreshOne(context, id, kind)
                true
            } catch (_: Exception) { false }
            main.post { complete(JSONObject().put("ok", ok).toString()) }
        }
    }
    @JvmStatic fun refreshWidgets(context: Context) { executor.execute { WidgetUpdates.refreshAll(context) } }
    @JvmStatic fun requestPinWidget(context: Context, kind: String): String {
        fun result(status: String, reason: String = "") = JSONObject().put("status", status).put("reason", reason).toString()
        if (kind !in listOf("large", "small")) return result("error", "invalid_kind")
        return try {
            val kinds = WidgetCapabilities.registeredKinds(context)
            if (kind !in kinds) return result("unavailable", WidgetCapabilities.availability(context, kinds).let { if (it == "ready") "providers_missing" else it })
            if (Build.VERSION.SDK_INT < 26 || !WidgetCapabilities.pinSupported(context)) return result("manual", "launcher_unsupported")
            val manager = AppWidgetManager.getInstance(context)
            val provider = if (kind == "large") LargeWidgetProvider::class.java else SmallWidgetProvider::class.java
            val callback = Intent(context, WidgetPinReceiver::class.java).apply {
                action = "${context.packageName}.widget.PINNED"
                data = Uri.parse("lakeside-widget://pin/$kind")
            }
            val accepted = manager.requestPinAppWidget(ComponentName(context, provider), null,
                PendingIntent.getBroadcast(context, if (kind == "large") 1 else 2, callback,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            if (accepted) result("requested") else result("manual", "launcher_declined")
        } catch (_: IllegalStateException) {
            result("error", "foreground_required")
        } catch (_: Exception) {
            result("error", "launcher_error")
        }
    }
    @JvmStatic fun consumePendingAction(context: Context): String? = synchronized(ACTION_LOCK) {
        val prefs = context.getSharedPreferences("lakeside-widget-action", Context.MODE_PRIVATE)
        val raw = prefs.getString("pending", null)
        if (raw != null && !prefs.edit().remove("pending").commit()) return@synchronized null
        raw
    }
    internal fun saveAction(context: Context, raw: String) = synchronized(ACTION_LOCK) {
        context.getSharedPreferences("lakeside-widget-action", Context.MODE_PRIVATE).edit().putString("pending", raw).commit()
    }
    private val ACTION_LOCK = Any()
}
