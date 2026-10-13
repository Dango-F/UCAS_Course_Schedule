package com.lakeside.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.annotation.Keep
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

internal object WidgetUpdates {
    private const val WORK = "lakeside-widget-refresh-v1"
    private val RENDER_LOCK = Any()
    private fun manager(context: Context): WorkManager {
        return try { WorkManager.getInstance(context) } catch (_: IllegalStateException) {
            synchronized(this) {
                try { WorkManager.getInstance(context) } catch (_: IllegalStateException) {
                    WorkManager.initialize(context, androidx.work.Configuration.Builder().build())
                    WorkManager.getInstance(context)
                }
            }
        }
    }
    fun schedule(context: Context) {
        try {
            val work = manager(context)
            if (WidgetRepository(context).instances().isEmpty()) work.cancelUniqueWork(WORK)
            else work.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequest.Builder(WidgetRefreshWorker::class.java, 15, TimeUnit.MINUTES).build())
        } catch (_: Exception) { Log.w("LakesideWidget", "Periodic refresh could not be scheduled") }
    }
    // A periodic worker and a day-preview tap may run concurrently. Submit whole frames in order.
    fun refreshOne(context: Context, id: Int, kind: String, now: Long = System.currentTimeMillis()): Unit = synchronized(RENDER_LOCK) {
        val repo = WidgetRepository(context)
        val (snapshot, state) = repo.read()
        val renderer = WidgetRenderer(context)
        val selection = WidgetSelector.select(snapshot, state, now, repo.dayOffset(id, now))
        val options = repo.options(id, kind)
        if (kind == "large" && android.os.Build.VERSION.SDK_INT < 31) repo.saveFrame(id, snapshot, selection.today, options, now)
        val view = renderer.render(id, kind, snapshot, selection, options, now)
        AppWidgetManager.getInstance(context).updateAppWidget(id, view)
        if (kind == "large" && android.os.Build.VERSION.SDK_INT < 31) {
            @Suppress("DEPRECATION")
            AppWidgetManager.getInstance(context).notifyAppWidgetViewDataChanged(id, renderer.id("ls_widget_list"))
        }
    }
    fun refreshAll(context: Context): Boolean {
        var ok = true
        val now = System.currentTimeMillis()
        WidgetRepository(context).instances().forEach { (id, kind) ->
            try { refreshOne(context, id, kind, now) } catch (_: Exception) { ok = false; Log.w("LakesideWidget", "Widget rendering failed") }
        }
        schedule(context)
        return ok
    }
}
@Keep
class WidgetRefreshWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    override fun doWork(): Result = if (WidgetUpdates.refreshAll(applicationContext)) Result.success() else Result.retry()
}
abstract class LakesideWidgetProvider : AppWidgetProvider() {
    abstract val kind: String
    private fun update(context: Context) {
        val pending = goAsync()
        LakesideWidgetBridge.executor.execute { try { WidgetUpdates.refreshAll(context.applicationContext) } finally { pending.finish() } }
    }
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { update(context) }
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { update(context) }
    override fun onEnabled(context: Context) { WidgetUpdates.schedule(context) }
    override fun onDeleted(context: Context, ids: IntArray) { ids.forEach { WidgetRepository(context).remove(it) }; WidgetUpdates.schedule(context) }
    override fun onDisabled(context: Context) { WidgetUpdates.schedule(context) }
    // AppWidgetProvider.onReceive follows onRestored with onUpdate; call goAsync only once.
    override fun onRestored(context: Context, oldIds: IntArray, newIds: IntArray) { WidgetRepository(context).restore(oldIds, newIds) }
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "${context.packageName}.widget.DAY") {
            val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            val offset = intent.getIntExtra("dayOffset", -1)
            if (offset !in 0..1) return
            val pending = goAsync()
            LakesideWidgetBridge.executor.execute {
                try {
                    val appContext = context.applicationContext
                    val repo = WidgetRepository(appContext)
                    if (repo.instances().contains(id to kind)) {
                        val now = System.currentTimeMillis()
                        repo.saveDayOffset(id, offset, now)
                        WidgetUpdates.refreshOne(appContext, id, kind, now)
                    }
                } catch (_: Exception) { Log.w("LakesideWidget", "Day preview could not be rendered") }
                finally { pending.finish() }
            }
        } else if (intent.action == "${context.packageName}.widget.REFRESH") update(context) else super.onReceive(context, intent)
    }
}
@Keep
class LargeWidgetProvider : LakesideWidgetProvider() { override val kind = "large" }
@Keep
class SmallWidgetProvider : LakesideWidgetProvider() { override val kind = "small" }
@Keep
class WidgetPinReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        LakesideWidgetBridge.executor.execute { try { WidgetUpdates.refreshAll(context.applicationContext) } finally { pending.finish() } }
    }
}
@Keep
class WidgetEnvironmentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        LakesideWidgetBridge.executor.execute { try { WidgetUpdates.refreshAll(context.applicationContext) } finally { pending.finish() } }
    }
}
@Keep
class WidgetEntryActivity : Activity() {
    override fun onCreate(state: Bundle?) { super.onCreate(state); dispatch(intent) }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); dispatch(intent) }
    private fun dispatch(intent: Intent) {
        try {
            val target = intent.getStringExtra("target") ?: "today"
            require(target in listOf("today", "calendar", "course", "settings", "semester", "import"))
            val json = JSONObject().put("eventId", UUID.randomUUID().toString()).put("target", target)
                .put("widgetId", intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0))
                .put("date", intent.getStringExtra("date") ?: WidgetClock.date(System.currentTimeMillis()))
            if (target == "course") {
                listOf("semesterId", "courseId", "meetingId").forEach { json.put(it, intent.getStringExtra(it)) }
                json.put("startSection", intent.getIntExtra("startSection", 0)).put("endSection", intent.getIntExtra("endSection", 0))
            }
            LakesideWidgetBridge.saveAction(this, json.toString())
            packageManager.getLaunchIntentForPackage(packageName)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                startActivity(it)
            }
        } finally { finish() }
    }
}
@Keep
class WidgetCollectionService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = CourseFactory(applicationContext, intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0))
    private class CourseFactory(val context: Context, val widgetId: Int) : RemoteViewsFactory {
        private var courses: List<WidgetCourse> = emptyList()
        private var options = WidgetOptions.read("large")
        private var now = 0L
        override fun onCreate() { onDataSetChanged() }
        override fun onDataSetChanged() {
            val repo = WidgetRepository(context)
            // Legacy adapters bind asynchronously. Use the exact date/data/options rendered in the header,
            // including across midnight and process death, rather than sampling a second clock here.
            val frame = repo.frame(widgetId)
            if (frame != null) {
                courses = frame.first.courses
                options = frame.second; now = frame.third
                return
            }
            val (snapshot, state) = repo.read()
            now = System.currentTimeMillis()
            courses = WidgetSelector.select(snapshot, state, now, repo.dayOffset(widgetId, now)).today
            options = repo.options(widgetId, "large")
        }
        override fun onDestroy() { courses = emptyList() }
        override fun getCount(): Int = courses.size
        override fun getViewAt(position: Int): RemoteViews? = courses.getOrNull(position)?.let { WidgetRenderer(context).courseRow(it, options, now) }
        override fun getLoadingView(): RemoteViews = RemoteViews(context.packageName, WidgetRenderer(context).resource("layout", "ls_widget_loading"))
        override fun getViewTypeCount(): Int = 1
        override fun getItemId(position: Int): Long = courses.getOrNull(position)?.let { stableWidgetItemId(it.id) } ?: 0
        override fun hasStableIds(): Boolean = true
    }
}
internal fun stableWidgetItemId(id: String): Long = id.fold(-3750763034362895579L) { hash, char -> (hash xor char.code.toLong()) * 1099511628211L }
