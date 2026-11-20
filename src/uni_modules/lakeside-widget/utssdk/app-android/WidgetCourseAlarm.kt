package com.lakeside.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.annotation.Keep
import androidx.work.Configuration
import androidx.work.WorkManager

// All alarm changes and deliveries run on the bridge's serial executor.
internal object WidgetCourseAlarm {
    private const val ARMED_AT = "armed-at"
    private const val LEGACY_WORK = "lakeside-widget-refresh-v1"
    private var legacyCancellationRequested = false

    private fun manager(context: Context) = context.getSystemService(AlarmManager::class.java)
    private fun state(context: Context) = context.getSharedPreferences("lakeside-widget-course-alarm", Context.MODE_PRIVATE)
    private fun action(context: Context) = "${context.packageName}.widget.COURSE_BOUNDARY"

    fun scheduledAt(context: Context): Long = state(context).getLong(ARMED_AT, 0L)

    fun needsPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < 31) return false
        return try { manager(context)?.canScheduleExactAlarms() != true } catch (_: SecurityException) { true }
    }

    fun openPermissionSettings(context: Context): Boolean {
        if (!needsPermission(context)) return true
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            true
        } catch (_: Exception) { false }
    }

    private fun pending(context: Context, at: Long, create: Boolean): PendingIntent? {
        // The timestamp is part of the identity, so a queued old delivery
        // cannot acquire a replacement alarm's timestamp.
        val intent = Intent(context, WidgetCourseAlarmReceiver::class.java).apply {
            action = WidgetCourseAlarm.action(context)
            data = Uri.parse("lakeside-widget://course-boundary/$at")
        }
        val flags = PendingIntent.FLAG_IMMUTABLE or if (create) 0 else PendingIntent.FLAG_NO_CREATE
        return PendingIntent.getBroadcast(context, 0, intent, flags)
    }

    private fun cancel(context: Context, alarms: AlarmManager, at: Long) {
        if (at == 0L) return
        pending(context, at, false)?.let {
            alarms.cancel(it)
            it.cancel()
        }
    }

    fun cancelLegacyWork(context: Context) {
        if (legacyCancellationRequested) return
        try {
            val work = try { WorkManager.getInstance(context) } catch (_: IllegalStateException) {
                WorkManager.initialize(context, Configuration.Builder().build())
                WorkManager.getInstance(context)
            }
            work.cancelUniqueWork(LEGACY_WORK)
            legacyCancellationRequested = true
        } catch (error: Exception) {
            Log.w("LakesideWidget", "Could not cancel legacy widget work", error)
        }
    }

    fun replace(context: Context, previous: Long, next: Long?): Boolean {
        val prefs = state(context)
        return try {
            val alarms = requireNotNull(manager(context))
            if (previous != 0L && previous != next) cancel(context, alarms, previous)
            if (next == null) {
                if (previous != 0L) check(prefs.edit().remove(ARMED_AT).commit())
            } else {
                val operation = requireNotNull(pending(context, next, true))
                // Persist before handing the operation to Android. A broadcast
                // can start a new process after our current receiver finishes.
                if (previous != next) check(prefs.edit().putLong(ARMED_AT, next).commit())
                // Re-submitting the same PendingIntent replaces its alarm. In
                // particular, a preference or live process isn't proof that
                // AlarmManager still has the registration after an upgrade.
                val exact = registerCourseAlarm(!needsPermission(context),
                    exact = { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, operation) },
                    inexact = { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, operation) })
                Log.i("LakesideWidget", "Course alarm armed at=$next exact=$exact")
            }
            true
        } catch (error: Exception) {
            prefs.edit().remove(ARMED_AT).apply()
            Log.e("LakesideWidget", "Could not register course alarm at=$next", error)
            false
        }
    }

    fun deliveryTime(context: Context, intent: Intent): Long? =
        if (intent.action == action(context)) intent.data?.lastPathSegment?.toLongOrNull() else null
}

@Keep
class WidgetCourseAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val delivered = WidgetCourseAlarm.deliveryTime(context, intent) ?: return
        val pending = goAsync()
        LakesideWidgetBridge.executor.execute {
            try { WidgetUpdates.reconcile(context.applicationContext, delivered = delivered) }
            catch (error: Exception) { Log.w("LakesideWidget", "Course refresh failed", error) }
            finally { pending.finish() }
        }
    }
}
