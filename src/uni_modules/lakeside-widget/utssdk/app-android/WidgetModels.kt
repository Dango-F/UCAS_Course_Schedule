package com.lakeside.widget

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.floor

internal object WidgetClock {
    private val zone = TimeZone.getTimeZone("Asia/Shanghai")
    fun format(time: Long, pattern: String): String = SimpleDateFormat(pattern, Locale.SIMPLIFIED_CHINESE).apply { timeZone = zone }.format(Date(time))
    fun date(time: Long): String = format(time, "yyyy-MM-dd")
    fun midnight(date: String): Long {
        require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(date))
        val parser = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { timeZone = zone; isLenient = false }
        val result = requireNotNull(parser.parse(date)).time
        require(this.date(result) == date)
        return result
    }
    fun week(monday: String, now: Long): Int = floor((midnight(date(now)) - midnight(monday)).toDouble() / (7 * 86400000L)).toInt() + 1
}

internal data class WidgetOptions(val teachers: Boolean, val location: Boolean, val sections: Boolean, val opacity: Int) {
    fun json(): JSONObject = JSONObject().put("showTeachers", teachers).put("showLocation", location).put("showSections", sections).put("opacity", opacity).put("teacherDefaultVersion", 1)
    companion object {
        fun read(kind: String, json: JSONObject? = null, migrateLegacy: Boolean = false): WidgetOptions = WidgetOptions(
            // Upgrade old small-widget defaults; a setting saved by this version
            // carries the marker and preserves a user's later explicit choice.
            if (migrateLegacy && kind == "small" && json != null && json.optInt("teacherDefaultVersion", 0) < 1) true
            else json?.optBoolean("showTeachers", true) ?: true,
            json?.optBoolean("showLocation", true) ?: true,
            kind == "large" && (json?.optBoolean("showSections", true) ?: true),
            (((json?.optDouble("opacity", 80.0) ?: 80.0).takeIf { it.isFinite() } ?: 80.0) / 5.0).let { kotlin.math.round(it).toInt() * 5 }.coerceIn(60, 100)
        )
    }
}
internal data class WidgetCourse(
    val id: String, val courseId: String, val meetingId: String, val date: String,
    val start: Long, val end: Long, val startSection: Int, val endSection: Int,
    val startTime: String, val endTime: String, val name: String, val teacher: String,
    val location: String, val color: String, val conflict: Boolean
) {
    fun json(): JSONObject = JSONObject().put("id", id).put("courseId", courseId).put("meetingId", meetingId).put("date", date)
        .put("start", start).put("end", end).put("startSection", startSection).put("endSection", endSection)
        .put("startTime", startTime).put("endTime", endTime).put("name", name).put("teacher", teacher)
        .put("location", location).put("color", color).put("conflict", conflict)
}
internal data class WidgetSemester(val id: String, val name: String, val monday: String, val endDate: String, val weeks: Int, val confirmed: Boolean)
internal data class WidgetSnapshot(val revision: String, val semester: WidgetSemester?, val courses: List<WidgetCourse>) {
    fun json(now: Long): JSONObject = JSONObject().put("version", 1).put("revision", revision).put("generatedAt", now).put("timeZone", "Asia/Shanghai")
        .put("semester", semester?.let { JSONObject().put("id", it.id).put("name", it.name).put("monday", it.monday).put("endDate", it.endDate).put("weeks", it.weeks).put("confirmed", it.confirmed) } ?: JSONObject.NULL)
        .put("occurrences", org.json.JSONArray().also { array -> courses.forEach { array.put(it.json()) } })
    companion object {
        fun parse(raw: String): WidgetSnapshot {
            val json = JSONObject(raw)
            require(json.getInt("version") == 1 && json.getString("timeZone") == "Asia/Shanghai")
            val revision = json.getString("revision").also { require(it.isNotBlank()) }
            require(json.getLong("generatedAt") >= 0)
            require(json.has("semester") && (json.isNull("semester") || json.opt("semester") is JSONObject))
            val semester = json.optJSONObject("semester")?.let {
                val monday = it.getString("monday"); WidgetClock.midnight(monday)
                val weeks = it.getInt("weeks").also { value -> require(value in 1..30) }
                val endDate = it.getString("endDate")
                require(WidgetClock.midnight(endDate) == WidgetClock.midnight(monday) + (weeks * 7L - 1L) * 86400000L)
                WidgetSemester(it.getString("id"), it.getString("name"), monday, endDate, weeks, it.getBoolean("confirmed"))
            }
            val rows = json.getJSONArray("occurrences")
            require(semester != null || rows.length() == 0)
            val ids = HashSet<String>()
            val courses = (0 until rows.length()).map { index ->
                val row = rows.getJSONObject(index)
                val date = row.getString("date"); WidgetClock.midnight(date)
                val start = row.getLong("start"); val end = row.getLong("end")
                val startSection = row.getInt("startSection"); val endSection = row.getInt("endSection")
                require(end > start && WidgetClock.date(start) == date && WidgetClock.date(end) == date)
                require(startSection >= 1 && endSection in startSection..20)
                require(semester != null && date >= semester.monday && date <= semester.endDate)
                val id = row.getString("id"); require(ids.add(id) && id.isNotBlank())
                val startTime = row.getString("startTime"); val endTime = row.getString("endTime")
                require(startTime == WidgetClock.format(start, "HH:mm") && endTime == WidgetClock.format(end, "HH:mm"))
                val color = row.getString("color"); require(color in listOf("blue", "teal", "purple", "apricot"))
                WidgetCourse(id, row.getString("courseId"), row.getString("meetingId"), date, start, end, startSection, endSection,
                    startTime, endTime, row.getString("name"), row.getString("teacher"), row.getString("location"), color, row.getBoolean("conflict"))
            }.sortedWith(compareBy<WidgetCourse> { it.start }.thenBy { it.end }.thenBy { it.id })
            return WidgetSnapshot(revision, semester, courses)
        }
    }
}
internal object WidgetText {
    fun courseState(course: WidgetCourse, now: Long): String = when {
        now >= course.end -> "ended"
        now >= course.start -> "active"
        else -> "pending"
    }
    fun teacherSummary(raw: String): String {
        val names = raw.trim().split(Regex("[、,，;；/／&＆|\\r\\n]+|(?<=[一-鿿])\\s+(?=[一-鿿])"))
            .map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (names.isEmpty()) return "教师待确认"
        return names.first().let { if (names.size > 1) it.removeSuffix("等") + "等" else it }
    }
    fun smallMeta(course: WidgetCourse, options: WidgetOptions): String = listOfNotNull(
        "${course.startTime}–${course.endTime}",
        if (options.location) course.location.ifBlank { "地点待确认" } else null,
        if (options.teachers) teacherSummary(course.teacher) else null
    ).joinToString(" · ")
}
internal data class WidgetSelection(val date: String, val week: Int, val today: List<WidgetCourse>, val current: List<WidgetCourse>, val next: WidgetCourse?, val remaining: Int, val stage: String)
internal object WidgetDayView {
    // A preview survives periodic refresh/process death, but never becomes tomorrow again after midnight.
    fun offset(baseDate: String?, value: Int, now: Long): Int = if (baseDate == WidgetClock.date(now) && value == 1) 1 else 0
    fun date(now: Long, offset: Int): String = WidgetClock.date(WidgetClock.midnight(WidgetClock.date(now)) + if (offset == 1) 86400000L else 0L)
}
internal object WidgetSelector {
    // Reuse the same semester ordering and stages for two/four-course widgets.
    // A tomorrow preview stays within tomorrow; normal mode can look ahead.
    fun smallCourses(snapshot: WidgetSnapshot?, selection: WidgetSelection, now: Long, limit: Int): List<WidgetCourse> {
        if (snapshot == null || selection.stage !in listOf("active", "before")) return emptyList()
        val candidates = if (selection.date != WidgetClock.date(now)) selection.today
            else selection.current + snapshot.courses.filter { it.start > now }
        return candidates.distinctBy { it.id }.take(limit.coerceIn(1, 4))
    }
    fun select(snapshot: WidgetSnapshot?, cacheState: String, now: Long, dayOffset: Int = 0): WidgetSelection {
        val date = WidgetDayView.date(now, dayOffset)
        val semester = snapshot?.semester
        val stage = when {
            snapshot == null -> if (cacheState == "invalid") "invalid" else "missing"
            semester == null -> "unimported"
            !semester.confirmed -> "unconfirmed"
            date < semester.monday -> "before"
            date > semester.endDate -> "ended"
            else -> "active"
        }
        val today = if (stage == "active") snapshot!!.courses.filter { it.date == date } else emptyList()
        val current = today.filter { it.start <= now && now < it.end }
        val next = if (dayOffset == 1) today.firstOrNull()
            else if (stage == "active" || stage == "before") current.firstOrNull() ?: snapshot!!.courses.firstOrNull { it.start > now } else null
        return WidgetSelection(date, semester?.let { WidgetClock.week(it.monday, WidgetClock.midnight(date)) } ?: 0, today, current, next, today.count { it.end > now }, stage)
    }
    fun emptyMessage(stage: String, small: Boolean): String = when (stage) {
        "unimported" -> "还没有课表，点击导入"
        "unconfirmed" -> "请先确认学期日期"
        "ended" -> "本学期已结束"
        "missing", "invalid" -> "打开湖畔课表以同步"
        "before" -> "学期尚未开始"
        else -> if (small) "本学期暂无后续课程" else "今天没有课程"
    }
}
