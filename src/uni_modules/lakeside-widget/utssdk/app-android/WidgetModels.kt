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

    fun withChanges(kind: String, changes: JSONObject): WidgetOptions = copy(
        teachers = changes.optBoolean("showTeachers", teachers),
        location = changes.optBoolean("showLocation", location),
        sections = kind == "large" && changes.optBoolean("showSections", sections),
        opacity = normalizeOpacity(changes.optDouble("opacity").takeIf { it.isFinite() } ?: opacity.toDouble())
    )

    companion object {
        const val DEFAULT_OPACITY = 80

        private fun normalizeOpacity(value: Double): Int {
            val finite = value.takeIf { it.isFinite() } ?: DEFAULT_OPACITY.toDouble()
            return kotlin.math.round(finite.coerceIn(60.0, 100.0) / 5).toInt() * 5
        }

        fun legacyOpacity(instanceOptions: Sequence<JSONObject>): Int = instanceOptions
            .map { normalizeOpacity(it.optDouble("opacity")) }
            .firstOrNull { it != DEFAULT_OPACITY } ?: DEFAULT_OPACITY

        fun read(kind: String, json: JSONObject? = null, migrateLegacy: Boolean = false): WidgetOptions = WidgetOptions(
            // Upgrade old small-widget defaults; a setting saved by this version
            // carries the marker and preserves a user's later explicit choice.
            if (migrateLegacy && kind == "small" && json != null && json.optInt("teacherDefaultVersion", 0) < 1) true
            else json?.optBoolean("showTeachers", true) ?: true,
            json?.optBoolean("showLocation", true) ?: true,
            kind == "large" && (json?.optBoolean("showSections", true) ?: true),
            normalizeOpacity(json?.optDouble("opacity") ?: DEFAULT_OPACITY.toDouble())
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
    // A preview survives refresh/process death, but never becomes tomorrow again after midnight.
    fun offset(kind: String, baseDate: String?, value: Int, now: Long): Int =
        if (kind == "large" && baseDate == WidgetClock.date(now) && value == 1) 1 else 0
    fun date(now: Long, offset: Int): String = WidgetClock.date(WidgetClock.midnight(WidgetClock.date(now)) + if (offset == 1) 86400000L else 0L)
}
internal object WidgetCourseBoundaries {
    data class Update(val nextAt: Long?, val refreshDue: Boolean)

    fun next(snapshot: WidgetSnapshot?, after: Long): Long? {
        if (snapshot?.semester?.confirmed != true) return null
        var next: Long? = null
        for (course in snapshot.courses) {
            val boundary = when {
                course.start > after -> course.start
                course.end > after -> course.end
                else -> continue
            }
            if (next == null || boundary < next) next = boundary
        }
        return next
    }

    fun isDue(snapshot: WidgetSnapshot?, scheduled: Long, delivered: Long, now: Long): Boolean =
        delivered > 0 && delivered == scheduled && delivered <= now && next(snapshot, delivered - 1) == delivered

    // The receiver and lifecycle recovery consume the same persisted boundary.
    // A late delivery may cross several changes; render once using the actual time.
    fun update(snapshot: WidgetSnapshot?, scheduled: Long, delivered: Long?, now: Long): Update? {
        if (delivered != null && (scheduled == 0L || delivered != scheduled)) return null
        return Update(next(snapshot, now), isDue(snapshot, scheduled, scheduled, now))
    }
}
internal object SmallWidgetSizing {
    const val ONE_ROW_HEIGHT = 78f
    data class Frame(val minHeight: Float, val layoutHeight: Float) {
        // The launcher can subtract horizontal padding after reporting its width.
        val minWidth: Float get() = 1f
    }

    // Pre-send a range of heights so the host can switch views during dragging,
    // even when it only notifies the provider after the user releases the handle.
    fun responsiveFrames(twoRowHeight: Float, maximumHeight: Float, reportedHeight: Float): List<Frame> {
        val cap = if (twoRowHeight.isFinite() && twoRowHeight >= 140f) twoRowHeight else 180f
        val step = cap / 2f
        val maximum = if (maximumHeight.isFinite()) maxOf(maximumHeight, cap * 2f) else cap * 2f
        val heights = listOf(48f, 62f, ONE_ROW_HEIGHT, 140f, cap).distinct().toMutableList()
        var next = cap + step
        // Android allows sixteen entries, including the default used before measurement.
        while (heights.size < 15 && next <= maximum + step) {
            heights.add(next)
            next += step
        }
        // Very large hosts still receive a frame for their current capacity.
        val current = cap + floor(((maximum - cap) / step).toDouble()).toFloat().coerceIn(0f, 30f) * step
        if (current > heights.last()) heights[heights.lastIndex] = current
        val fallback = reportedHeight.takeIf { it.isFinite() && it > 0f } ?: ONE_ROW_HEIGHT
        // Without a measured size Android uses the entry with the smallest area.
        // Once measured, even a very short host can select the dense layout.
        val defaultFrame = Frame(1f, heights.lastOrNull { it <= fallback } ?: heights.first())
        return listOf(defaultFrame) + heights.map { Frame(if (it == heights.first()) 2f else it, it) }
    }
    // Two/four are the compact widget's base capacities. Measurement limits
    // additional rows; it must not remove a base slot just to preserve spacing.
    fun visibleCount(height: Float, available: Int, fitting: Int): Int {
        val base = if (!height.isFinite() || height < 140f) 2 else 4
        // Extra height adds pairs of courses, never a lone fifth/seventh slot.
        val paired = fitting.coerceAtLeast(0) / 2 * 2
        return maxOf(base, paired).coerceAtMost(available.coerceAtLeast(0))
    }
    fun candidateLimit(height: Float, twoRowHeight: Float): Int {
        if (!height.isFinite() || height < 140f) return 2
        if (!twoRowHeight.isFinite() || twoRowHeight <= 0f || height <= twoRowHeight) return 4
        val extraRows = kotlin.math.floor((height - twoRowHeight) / (twoRowHeight / 2f)).toInt().coerceIn(0, 30)
        return 4 + extraRows * 2
    }
    fun fitCount(height: Float, rowHeights: List<Float>, chrome: Float, gap: Float, tolerance: Float = 1f): Int {
        if (!height.isFinite() || !chrome.isFinite() || !gap.isFinite()) return 0
        var used = chrome
        var count = 0
        for (row in rowHeights) {
            if (!row.isFinite() || row <= 0f) break
            val next = used + row + if (count == 0) 0f else gap
            if (next > height + tolerance) break
            used = next; count++
        }
        return count
    }
}
internal object WidgetResizeRequests {
    private var sequence = 0L
    private val latest = mutableMapOf<Int, Long>()
    @Synchronized fun begin(id: Int): Long = (++sequence).also { latest[id] = it }
    @Synchronized fun isLatest(id: Int, token: Long): Boolean = latest[id] == token
    @Synchronized fun finish(id: Int, token: Long) { if (latest[id] == token) latest.remove(id) }
    @Synchronized fun cancel(id: Int) { latest.remove(id) }
}
internal object WidgetSelector {
    fun largeCourses(dailyCourses: List<WidgetCourse>, now: Long): List<WidgetCourse> {
        val (unfinished, finished) = dailyCourses.partition { it.end > now }
        return unfinished + finished.sortedBy { it.end }
    }

    // The compact widget follows the current day and can look ahead across dates.
    fun smallCourses(snapshot: WidgetSnapshot?, selection: WidgetSelection, now: Long, limit: Int): List<WidgetCourse> {
        if (snapshot == null || selection.stage !in listOf("active", "before")) return emptyList()
        val candidates = selection.current + snapshot.courses.filter { it.start > now }
        return candidates.distinctBy { it.id }.take(limit.coerceAtLeast(1))
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
