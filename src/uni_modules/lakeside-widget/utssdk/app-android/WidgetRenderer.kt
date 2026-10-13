package com.lakeside.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.text.style.RelativeSizeSpan
import android.view.View
import android.widget.RemoteViews
import android.util.SizeF

internal class WidgetRenderer(private val context: Context) {
    // Resources merge into the host app; never confuse its Android package with a DCloud AppID.
    fun resource(type: String, name: String): Int = context.resources.getIdentifier(name, type, context.packageName).also {
        require(it != 0) { "Missing widget resource: $type/$name" }
    }
    fun id(name: String): Int = resource("id", name)
    private fun text(view: RemoteViews, name: String, value: String) { view.setTextViewText(id(name), value) }
    private fun metaText(view: RemoteViews, name: String, value: String) {
        val styled = SpannableString(value)
        // Han glyphs occupy more of their em than time digits: optical correction
        // only for location/teacher Han text, without shrinking time or room numbers.
        Regex("[㐀-鿿]+").findAll(value).forEach { match ->
            styled.setSpan(RelativeSizeSpan(.94f), match.range.first, match.range.last + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        view.setTextViewText(id(name), styled)
    }
    private fun visible(view: RemoteViews, name: String, shown: Boolean) { view.setViewVisibility(id(name), if (shown) View.VISIBLE else View.GONE) }
    private fun statusLight(view: RemoteViews, name: String, course: WidgetCourse, now: Long, small: Boolean = false) {
        val state = WidgetText.courseState(course, now)
        val still = state == "active" && try { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f } catch (_: Exception) { false }
        view.removeAllViews(id(name))
        view.addView(id(name), RemoteViews(context.packageName, resource("layout", "ls_widget_status_" + state + (if (small) "_small" else "") + (if (still) "_static" else ""))))
        view.setContentDescription(id(name), when (state) { "active" -> "正在上课"; "ended" -> "课程已结束"; else -> "待上课" })
    }
    private fun entryIntent(widgetId: Int, target: String, date: String): Intent = Intent(context, WidgetEntryActivity::class.java).apply {
        action = "${context.packageName}.widget.OPEN"
        data = Uri.parse("lakeside-widget://open/$widgetId/$target/$date")
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        putExtra("target", target); putExtra("date", date)
    }
    private fun activity(widgetId: Int, target: String, date: String, mutable: Boolean = false): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (mutable && Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else if (mutable) 0 else PendingIntent.FLAG_IMMUTABLE)
        val intent = entryIntent(widgetId, target, date)
        if (mutable) { intent.removeExtra("target"); intent.removeExtra("date") }
        return PendingIntent.getActivity(context, widgetId, intent, flags)
    }
    private fun click(view: RemoteViews, name: String, widgetId: Int, target: String, date: String) {
        view.setOnClickPendingIntent(id(name), activity(widgetId, target, date))
    }
    private fun courseExtras(course: WidgetCourse): Intent = Intent().apply {
        putExtra("target", "calendar"); putExtra("date", course.date)
    }
    private fun dayToggle(view: RemoteViews, widgetId: Int, kind: String, tomorrow: Boolean) {
        text(view, "ls_widget_day", if (tomorrow) "今日" else "明日")
        view.setContentDescription(id("ls_widget_day"), if (tomorrow) "返回今日课程" else "查看明日课程")
        val provider = if (kind == "large") LargeWidgetProvider::class.java else SmallWidgetProvider::class.java
        val offset = if (tomorrow) 0 else 1
        val intent = Intent(context, provider).apply {
            action = "${context.packageName}.widget.DAY"
            data = Uri.parse("lakeside-widget://day/$widgetId/$offset")
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            putExtra("dayOffset", offset)
        }
        view.setOnClickPendingIntent(id("ls_widget_day"), PendingIntent.getBroadcast(context, widgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    private fun refresh(view: RemoteViews, widgetId: Int, kind: String) {
        val provider = if (kind == "large") LargeWidgetProvider::class.java else SmallWidgetProvider::class.java
        val intent = Intent(context, provider).apply {
            action = "${context.packageName}.widget.REFRESH"
            data = Uri.parse("lakeside-widget://refresh/$widgetId")
        }
        view.setOnClickPendingIntent(id("ls_widget_refresh"), PendingIntent.getBroadcast(context, widgetId, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    fun render(widgetId: Int, kind: String, snapshot: WidgetSnapshot?, selection: WidgetSelection, options: WidgetOptions, now: Long): RemoteViews {
        if (kind == "small" && Build.VERSION.SDK_INT >= 31) return RemoteViews(mapOf(
            SizeF(250f, 48f) to renderAtSize(widgetId, kind, snapshot, selection, options, now, 48),
            SizeF(250f, 62f) to renderAtSize(widgetId, kind, snapshot, selection, options, now, 62),
            SizeF(250f, 78f) to renderAtSize(widgetId, kind, snapshot, selection, options, now, 78),
            SizeF(250f, 140f) to renderAtSize(widgetId, kind, snapshot, selection, options, now, 140)
        ))
        val sizing = AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId)
        val minimumHeight = sizing.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, if (kind == "small") 48 else 180)
        // Legacy launchers report portrait/landscape bounds instead of exact sizes.
        // Using only their smaller height can keep a tall portrait widget at two courses.
        val height = if (context.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) minimumHeight
            else sizing.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minimumHeight)
        return renderAtSize(widgetId, kind, snapshot, selection, options, now, height)
    }
    private fun renderAtSize(widgetId: Int, kind: String, snapshot: WidgetSnapshot?, selection: WidgetSelection, options: WidgetOptions, now: Long, height: Int): RemoteViews {
        val short = height < 140
        val layout = when {
            kind == "large" -> "ls_widget_large"
            height >= 140 -> "ls_widget_small"
            height >= 78 -> "ls_widget_small_compact"
            height >= 62 -> "ls_widget_small_medium"
            else -> "ls_widget_small_dense"
        }
        val view = RemoteViews(context.packageName, resource("layout", layout))
        val tomorrow = selection.date != WidgetClock.date(now)
        val displayTime = WidgetClock.midnight(selection.date)
        // Keep the ImageView's own XML alpha at 1; only its drawable alpha follows the setting.
        view.setInt(id("ls_widget_backdrop"), "setImageAlpha", options.opacity * 255 / 100)
        text(view, "ls_widget_date", WidgetClock.format(displayTime, if (kind == "large") "yyyy/M/d" else "M/d EEE"))
        view.setContentDescription(id("ls_widget_date"), WidgetClock.format(displayTime, "yyyy年M月d日 EEEE"))
        val semester = snapshot?.semester
        val week = when (selection.stage) {
            "before" -> "${semester?.monday?.replace('-', '/')} 开学"
            "ended" -> "学期已结束"
            "unconfirmed" -> "学期日期待确认"
            else -> if (selection.week > 0) "第${selection.week}周" else "湖畔课表"
        }
        text(view, "ls_widget_subtitle", if (kind == "large") listOfNotNull(if (tomorrow) "明日" else null, semester?.name, week, WidgetClock.format(displayTime, "EEE")).joinToString(" · ") else week)
        val footer = when {
            selection.stage == "before" -> "查看开学安排 ›"
            selection.stage == "ended" -> "查看完整课表 ›"
            selection.stage != "active" -> "打开湖畔课表 ›"
            kind == "small" && !tomorrow -> "今日还有${selection.remaining}堂课 ›"
            tomorrow && selection.today.isEmpty() -> "明天没有课程 ›"
            tomorrow -> "明日${selection.today.size}堂课 ›"
            selection.today.isEmpty() -> "查看今日课表 ›"
            selection.remaining == 0 -> "查看今日课表 ›"
            else -> "今日还有${selection.remaining}堂课 ›"
        }
        text(view, "ls_widget_remaining", footer)
        text(view, "ls_widget_refresh", "更新于${WidgetClock.format(now, "HH:mm")} ↻")
        if (kind == "small") {
            text(view, "ls_widget_remaining", when (selection.stage) {
                "active" -> if (tomorrow) "共${selection.today.size}堂" else "余${selection.remaining}堂"
                "before" -> "待开学"
                "ended" -> "已结束"
                "unconfirmed" -> "待确认"
                else -> "待同步"
            })
            view.setContentDescription(id("ls_widget_remaining"), footer)
            view.setContentDescription(id("ls_widget_subtitle"), week)
            if (selection.stage == "before") text(view, "ls_widget_subtitle", "待开学")
            view.setContentDescription(id("ls_widget_refresh"), "更新于${WidgetClock.format(now, "HH:mm")}，点击刷新")
        }
        click(view, "ls_widget_root", widgetId, "calendar", selection.date)
        click(view, "ls_widget_remaining", widgetId, "calendar", selection.date)
        dayToggle(view, widgetId, kind, tomorrow)
        refresh(view, widgetId, kind)
        if (kind == "large") renderLarge(view, widgetId, snapshot, selection, options, now)
        else renderSmall(view, widgetId, snapshot, selection, options, short, tomorrow, now)
        return view
    }
    private fun renderLarge(view: RemoteViews, widgetId: Int, snapshot: WidgetSnapshot?, selection: WidgetSelection, options: WidgetOptions, now: Long) {
        val emptyTarget = when (selection.stage) { "unimported" -> "import"; "unconfirmed" -> "semester"; else -> "calendar" }
        text(view, "ls_widget_empty_title", if (selection.stage == "active" && selection.date != WidgetClock.date(now)) "明天没有课程" else WidgetSelector.emptyMessage(selection.stage, false))
        text(view, "ls_widget_empty_note", when (selection.stage) {
            "before" -> "${snapshot?.semester?.monday?.replace('-', '/')} 开学，点击查看课表"
            "active" -> "留一点时间，给自己。"
            "ended" -> "点击查看完整课表"
            else -> "点击打开湖畔课表"
        })
        click(view, "ls_widget_empty", widgetId, emptyTarget, selection.date)
        view.setEmptyView(id("ls_widget_list"), id("ls_widget_empty"))
        // Each instance gets a distinct identity; extras alone do not distinguish PendingIntents/adapters.
        view.setPendingIntentTemplate(id("ls_widget_list"), activity(widgetId, "calendar", selection.date, true))
        if (Build.VERSION.SDK_INT >= 31) {
            val items = RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(1)
            selection.today.forEach { course -> items.addItem(stableWidgetItemId(course.id), courseRow(course, options, now)) }
            view.setRemoteAdapter(id("ls_widget_list"), items.build())
        } else {
            val service = Intent(context, WidgetCollectionService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse("lakeside-widget://collection/$widgetId")
            }
            @Suppress("DEPRECATION")
            view.setRemoteAdapter(id("ls_widget_list"), service)
        }
    }
    fun courseRow(course: WidgetCourse, options: WidgetOptions, now: Long): RemoteViews {
        val view = RemoteViews(context.packageName, resource("layout", "ls_widget_course"))
        val ended = course.end <= now
        statusLight(view, "ls_course_status", course, now)
        view.setInt(id("ls_course_card"), "setBackgroundResource", resource("drawable", if (ended) "ls_card_ended" else "ls_card_${course.color}"))
        text(view, "ls_course_start_section", course.startSection.toString()); text(view, "ls_course_end_section", course.endSection.toString())
        visible(view, "ls_course_start_section", options.sections); visible(view, "ls_course_end_section", options.sections)
        text(view, "ls_course_start_time", course.startTime); text(view, "ls_course_end_time", course.endTime)
        val name = SpannableString(course.name)
        if (ended) name.setSpan(StrikethroughSpan(), 0, name.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        // New text (without spans) also clears strikethrough when a launcher reuses a row.
        view.setTextViewText(id("ls_course_name"), name)
        metaText(view, "ls_course_meta", listOfNotNull(if (options.location) course.location.ifBlank { "地点待确认" } else null,
            if (options.teachers) course.teacher.ifBlank { "教师待确认" } else null).joinToString(" · "))
        visible(view, "ls_course_meta", options.location || options.teachers)
        val badges = if (course.conflict) "课程冲突" else ""
        text(view, "ls_course_badge", badges); visible(view, "ls_course_badge", badges.isNotEmpty())
        view.setTextColor(id("ls_course_name"), Color.parseColor(if (ended) "#8D929A" else "#203047"))
        listOf("ls_course_start_section", "ls_course_start_time", "ls_course_meta").forEach {
            view.setTextColor(id(it), Color.parseColor(if (ended) "#969BA3" else "#526B85"))
        }
        listOf("ls_course_end_section", "ls_course_end_time", "ls_course_badge").forEach {
            view.setTextColor(id(it), Color.parseColor(if (ended) "#969BA3" else "#637990"))
        }
        // A root fill-in intent is handled by the list's OnItemClickListener.
        // Keep the row root non-clickable/non-focusable so it cannot consume the tap.
        view.setOnClickFillInIntent(id("ls_course_card"), courseExtras(course))
        return view
    }
    private fun renderSmall(view: RemoteViews, widgetId: Int, snapshot: WidgetSnapshot?, selection: WidgetSelection, options: WidgetOptions, short: Boolean, tomorrow: Boolean, now: Long) {
        val capacity = if (short) 2 else 4
        val courses = WidgetSelector.smallCourses(snapshot, selection, now, capacity)
        val course = courses.firstOrNull()
        for (index in 1 until capacity) {
            visible(view, smallSlot("ls_small", index), courses.size > index)
            visible(view, "ls_small_course_gap" + (if (index == 1) "" else smallSlot("", index)), courses.size > index)
        }
        val target = when (selection.stage) { "unimported" -> "import"; "unconfirmed" -> "semester"; else -> "calendar" }
        if (course == null) {
            text(view, "ls_small_label", "湖畔课表")
            visible(view, "ls_small_status", false)
            text(view, "ls_small_name", if (tomorrow && selection.stage == "active") "明天没有课程" else WidgetSelector.emptyMessage(selection.stage, true))
            text(view, "ls_small_meta", if (selection.stage == "before") "${snapshot?.semester?.monday} 开学" else "点击打开课表")
            visible(view, "ls_small_conflict", false)
            click(view, "ls_small_content", widgetId, target, selection.date)
            return
        }
        courses.forEachIndexed { index, item -> renderSmallCourse(view, widgetId, item, selection, options, tomorrow, index, courses.size, now) }
    }
    private fun smallSlot(name: String, index: Int): String = name + when (index) {
        0 -> ""; 1 -> "_second"; 2 -> "_third"; 3 -> "_fourth"
        else -> error("Invalid compact course slot: $index")
    }
    private fun renderSmallCourse(view: RemoteViews, widgetId: Int, course: WidgetCourse, selection: WidgetSelection, options: WidgetOptions, tomorrow: Boolean, index: Int, shown: Int, now: Long) {
        fun slot(name: String): String = smallSlot(name, index)
        val day = when (course.date) {
            selection.date -> if (tomorrow) "明日 · " else ""
            WidgetClock.date(WidgetClock.midnight(selection.date) + 86400000L) -> "明日 · "
            else -> WidgetClock.format(course.start, "M月d日 EEE") + " · "
        }
        val status = if (selection.current.any { it.id == course.id }) "进行中" else if (tomorrow && index == 0) "首堂课" else "下一节"
        val badge = if (index == 0 && selection.current.size > shown) " · 同时另有${selection.current.size - shown}堂" else if (course.conflict) " · 冲突" else ""
        val label = (day.removeSuffix(" · ") + badge).trim().removePrefix("· ")
        text(view, slot("ls_small_label"), label)
        visible(view, slot("ls_small_label"), label.isNotEmpty())
        visible(view, slot("ls_small_status"), true)
        statusLight(view, slot("ls_small_status"), course, now, small = true)
        text(view, slot("ls_small_name"), course.name)
        metaText(view, slot("ls_small_meta"), WidgetText.smallMeta(course, options))
        view.setContentDescription(id(slot("ls_small_content")), listOfNotNull(day + status + badge, course.name, "${course.startTime}–${course.endTime}",
            if (options.location) course.location.ifBlank { "地点待确认" } else null,
            if (options.teachers) course.teacher.ifBlank { "教师待确认" } else null).joinToString("，"))
        view.setInt(id(slot("ls_small_accent")), "setBackgroundColor", Color.parseColor(when (course.color) {
            "teal" -> "#78AAA0"; "purple" -> "#A89BC9"; "apricot" -> "#CEA581"; else -> "#7FA8D2"
        }))
        click(view, slot("ls_small_content"), widgetId, "calendar", course.date)
    }
}
