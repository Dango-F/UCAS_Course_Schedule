package com.lakeside.widget

import org.json.JSONObject
import java.io.File
import java.util.TimeZone

fun main(args: Array<String>) {
    val raw = File(args[0]).readText()
    val snapshot = WidgetSnapshot.parse(raw)
    fun at(date: String, time: String): Long = WidgetClock.midnight(date) + (time.substring(0, 2).toInt() * 60L + time.substring(3).toInt()) * 60000L
    var checks = 0
    fun test(label: String, block: () -> Unit) { block(); checks++; println("PASS $label") }
    test("Cross-language semester contract and ordering") {
        check(snapshot.courses.size > 20)
        check(snapshot.courses.zipWithNext().all { (a, b) -> a.start <= b.start })
    }
    test("Current course begins exactly at start, ends exactly at end") {
        val row = snapshot.courses.first { it.date == "2026-09-14" && it.courseId == "math" }
        check(WidgetSelector.select(snapshot, "valid", row.start - 1).current.isEmpty())
        check(WidgetSelector.select(snapshot, "valid", row.start).current.first().id == row.id)
        check(WidgetSelector.select(snapshot, "valid", row.end).current.none { it.id == row.id })
        check(WidgetSelector.select(snapshot, "valid", row.end).remaining == 1)
    }
    test("All daily courses retained after end; remaining is occurrence count") {
        val state = WidgetSelector.select(snapshot, "valid", at("2026-09-14", "23:00"))
        check(state.today.size == 2 && state.remaining == 0)
        check(state.next != null && state.next.date > state.date)
    }
    test("Before semester selects first course; after semester is ended") {
        check(WidgetSelector.select(snapshot, "valid", at("2026-08-01", "12:00")).let { it.stage == "before" && it.next?.date == "2026-08-31" })
        check(WidgetSelector.select(snapshot, "valid", at("2027-03-01", "12:00")).let { it.stage == "ended" && it.next == null })
    }
    test("Sunday has no courses, small widget finds next teaching day") {
        check(WidgetSelector.select(snapshot, "valid", at("2026-09-13", "12:00")).let { it.today.isEmpty() && it.next?.date == "2026-09-14" })
    }
    test("Tomorrow preview crosses a teaching-week boundary without marking future courses current") {
        val now = at("2026-09-13", "21:00")
        val tomorrow = WidgetSelector.select(snapshot, "valid", now, 1)
        check(tomorrow.date == "2026-09-14" && tomorrow.week == 3)
        check(tomorrow.today.size == 2 && tomorrow.remaining == 2 && tomorrow.current.isEmpty())
        check(tomorrow.next?.id == tomorrow.today.first().id)
        check(WidgetSelector.select(snapshot, "valid", now).date == "2026-09-13")
    }
    test("Empty tomorrow preview does not fall through to a later teaching day") {
        val now = at("2026-09-12", "20:00")
        val tomorrow = WidgetSelector.select(snapshot, "valid", now, 1)
        check(tomorrow.date == "2026-09-13" && tomorrow.today.isEmpty() && tomorrow.next == null)
        check(WidgetSelector.select(snapshot, "valid", now).next?.date == "2026-09-14")
    }
    test("Preview persists within the same day and resets after Shanghai midnight") {
        val now = at("2026-09-13", "23:59")
        check(WidgetDayView.offset("2026-09-13", 1, now) == 1)
        check(WidgetDayView.offset("2026-09-13", 1, at("2026-09-14", "00:00")) == 0)
        check(WidgetDayView.offset("2026-09-13", 0, now) == 0)
        check(WidgetDayView.offset("2026-09-13", 9, now) == 0)
        check(WidgetDayView.offset(null, 1, now) == 0)
    }
    test("Tomorrow selection respects semester start/end and confirmation") {
        check(WidgetSelector.select(snapshot, "valid", at("2026-08-30", "21:00"), 1).let {
            it.stage == "active" && it.week == 1 && it.next?.date == "2026-08-31"
        })
        check(WidgetSelector.select(snapshot, "valid", at(snapshot.semester!!.endDate, "21:00"), 1).let {
            it.stage == "ended" && it.today.isEmpty() && it.next == null
        })
        check(WidgetSelector.select(snapshot.copy(semester = snapshot.semester!!.copy(confirmed = false)), "valid", at("2026-09-13", "21:00"), 1).let {
            it.stage == "unconfirmed" && it.next == null
        })
    }
    test("Simultaneous courses retained and start/end boundaries do not overlap") {
        val first = snapshot.courses.first()
        val overlap = snapshot.copy(courses = listOf(first, first.copy(id = "overlap", courseId = "other", conflict = true)))
        check(WidgetSelector.select(overlap, "valid", first.start).current.size == 2)
        check(WidgetSelector.select(overlap, "valid", first.end).current.isEmpty())
    }
    test("Small widget displays one or two upcoming occurrences and skips ended courses") {
        val now = at("2026-09-14", "00:00")
        val selection = WidgetSelector.select(snapshot, "valid", now)
        val rows = WidgetSelector.smallCourses(snapshot, selection, now, 2)
        check(rows.size == 2 && rows == selection.today.take(2))
        check(WidgetSelector.smallCourses(snapshot, selection, now, 1) == rows.take(1))
        val after = rows.first().end
        val following = WidgetSelector.smallCourses(snapshot, WidgetSelector.select(snapshot, "valid", after), after, 2)
        check(following.none { it.id == rows.first().id } && following.all { it.end > after })
    }
    test("Small widget prioritizes simultaneous courses and respects two/four capacities") {
        val first = snapshot.courses.first()
        val rows = listOf(first, first.copy(id = "conflict-2"), first.copy(id = "conflict-3"), first.copy(id = "later", start = first.end + 60000, end = first.end + 120000))
        val data = snapshot.copy(courses = rows)
        val selection = WidgetSelector.select(data, "valid", first.start)
        check(WidgetSelector.smallCourses(data, selection, first.start, 2) == rows.take(2))
        check(WidgetSelector.smallCourses(data, selection, first.start, 4) == rows)
        check(WidgetSelector.smallCourses(data, selection, first.start, 99).size == 4)
        check(WidgetSelector.smallCourses(data, selection, first.start, 1) == rows.take(1))
    }
    test("Four-course tomorrow preview never fills unused slots from the following day") {
        val first = snapshot.courses.first()
        val now = WidgetClock.midnight(first.date) - 3600000L
        val nextDate = WidgetClock.date(WidgetClock.midnight(first.date) + 86400000L)
        val rows = (0..3).map { first.copy(id = "tomorrow-$it", start = first.start + it * 60000L, end = first.end + it * 60000L) }
        val later = first.copy(id = "following-day", date = nextDate, start = first.start + 86400000L, end = first.end + 86400000L)
        val data = snapshot.copy(courses = rows + later)
        check(WidgetSelector.smallCourses(data, WidgetSelector.select(data, "valid", now, 1), now, 4) == rows)
        val three = data.copy(courses = rows.take(3) + later)
        check(WidgetSelector.smallCourses(three, WidgetSelector.select(three, "valid", now, 1), now, 4) == rows.take(3))
    }
    test("Four-course normal mode excludes finished courses and avoids duplicates") {
        val first = snapshot.courses.first()
        val now = first.start
        val ended = first.copy(id = "finished", start = now - 120000L, end = now)
        val rows = (0..4).map { first.copy(id = "course-$it", start = now + it * 60000L, end = first.end + it * 60000L) }
        val data = snapshot.copy(courses = listOf(ended) + rows)
        val selection = WidgetSelector.select(data, "valid", now)
        check(WidgetSelector.smallCourses(data, selection, now, 4) == rows.take(4))
        check(WidgetSelector.smallCourses(data, selection, now, 2) == rows.take(2))
    }
    test("Two-course tomorrow preview stays within tomorrow and handles one or no courses") {
        val now = at("2026-09-13", "21:00")
        val selection = WidgetSelector.select(snapshot, "valid", now, 1)
        check(WidgetSelector.smallCourses(snapshot, selection, now, 2) == selection.today.take(2))
        val one = snapshot.copy(courses = snapshot.courses.filter { it.date != selection.date || it.id == selection.today.first().id })
        check(WidgetSelector.smallCourses(one, WidgetSelector.select(one, "valid", now, 1), now, 2).size == 1)
        val empty = WidgetSelector.select(snapshot, "valid", at("2026-09-12", "21:00"), 1)
        check(WidgetSelector.smallCourses(snapshot, empty, at("2026-09-12", "21:00"), 2).isEmpty())
    }
    test("Small widget future lookup crosses dates but respects semester and cache stages") {
        val now = at("2026-09-13", "12:00")
        check(WidgetSelector.smallCourses(snapshot, WidgetSelector.select(snapshot, "valid", now), now, 2).all { it.date == "2026-09-14" })
        val before = at("2026-08-01", "12:00")
        check(WidgetSelector.smallCourses(snapshot, WidgetSelector.select(snapshot, "valid", before), before, 2).size == 2)
        val ended = at("2027-03-01", "12:00")
        check(WidgetSelector.smallCourses(snapshot, WidgetSelector.select(snapshot, "valid", ended), ended, 2).isEmpty())
        check(WidgetSelector.smallCourses(snapshot, WidgetSelector.select(null, "invalid", now), now, 2).isEmpty())
    }
    test("Unconfirmed, missing, corrupt, and unimported never display demo courses") {
        check(WidgetSelector.select(snapshot.copy(semester = snapshot.semester!!.copy(confirmed = false)), "valid", at("2026-09-14", "09:00")).next == null)
        check(WidgetSelector.select(null, "invalid", 0).stage == "invalid")
        check(WidgetSelector.select(null, "missing", 0).stage == "missing")
        check(WidgetSelector.select(WidgetSnapshot("none", null, emptyList()), "valid", 0).stage == "unimported")
    }
    test("Midnight uses fixed Shanghai date even when device timezone changes") {
        val original = TimeZone.getDefault()
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"))
            val midnight = at("2026-09-14", "00:00")
            check(WidgetClock.date(midnight - 1) == "2026-09-13")
            check(WidgetClock.date(midnight) == "2026-09-14")
            check(WidgetClock.week(snapshot.semester!!.monday, midnight) == 3)
        } finally { TimeZone.setDefault(original) }
    }
    test("Malformed cache rejected before replacing an intact snapshot") {
        val json = JSONObject(raw)
        json.getJSONArray("occurrences").getJSONObject(0).put("end", 0)
        check(runCatching { WidgetSnapshot.parse(json.toString()) }.isFailure)
        check(runCatching { WidgetClock.midnight("2026-02-30") }.isFailure)
        check(runCatching { WidgetSnapshot.parse(JSONObject(raw).put("version", 99).toString()) }.isFailure)
    }
    test("Legacy list frame preserves exactly the header clock and course data") {
        val now = at("2026-09-14", "23:59")
        val selection = WidgetSelector.select(snapshot, "valid", now)
        val daily = snapshot.copy(courses = selection.today)
        val restored = WidgetSnapshot.parse(daily.json(now).toString())
        check(restored.courses == selection.today)
        check(restored.semester == snapshot.semester)
        check(restored.revision == snapshot.revision)
        val tomorrow = WidgetSelector.select(snapshot, "valid", at("2026-09-13", "23:59"), 1)
        val futureFrame = WidgetSnapshot.parse(snapshot.copy(courses = tomorrow.today).json(at("2026-09-13", "23:59")).toString())
        check(futureFrame.courses == tomorrow.today && futureFrame.courses.all { it.date == "2026-09-14" })
    }
    test("Instance defaults, section toggle and opacity clamping") {
        check(WidgetOptions.read("small").let { it.teachers && !it.sections && it.location && it.opacity == 80 })
        check(WidgetOptions.read("large", JSONObject().put("opacity", 2)).opacity == 60)
        check(WidgetOptions.read("small", JSONObject().put("showSections", true).put("opacity", 92)).let { !it.sections && it.opacity == 90 })
    }
    test("Teacher defaults upgrade legacy small options but preserve new explicit hide settings") {
        val legacy = JSONObject().put("showTeachers", false).put("showLocation", false).put("opacity", 65)
        check(WidgetOptions.read("small", legacy, migrateLegacy = true).let { it.teachers && !it.location && it.opacity == 65 })
        val hidden = WidgetOptions.read("small", legacy).json()
        check(!WidgetOptions.read("small", hidden, migrateLegacy = true).teachers)
        check(!WidgetOptions.read("large", legacy, migrateLegacy = true).teachers)
    }
    test("Compact teacher summary handles single, multiple, whitespace and foreign names") {
        check(WidgetText.teacherSummary("周晓飞") == "周晓飞")
        for (separator in listOf("、", "，", ",", ";", "；", "/", "&", "|", "\n", " ")) {
            check(WidgetText.teacherSummary("周晓飞${separator}李志红") == "周晓飞等")
        }
        check(WidgetText.teacherSummary("周晓飞、周晓飞") == "周晓飞")
        check(WidgetText.teacherSummary("John Smith") == "John Smith")
        check(WidgetText.teacherSummary("玛丽·居里") == "玛丽·居里")
        check(WidgetText.teacherSummary(" ") == "教师待确认")
    }
    test("Small metadata joins teacher after location and respects display switches") {
        val course = snapshot.courses.first().copy(startTime = "18:30", endTime = "21:00", location = "教一楼207", teacher = "周晓飞、李志红")
        val options = WidgetOptions.read("small")
        check(WidgetText.smallMeta(course, options) == "18:30–21:00 · 教一楼207 · 周晓飞等")
        check(WidgetText.smallMeta(course, options.copy(teachers = false)) == "18:30–21:00 · 教一楼207")
        check(WidgetText.smallMeta(course, options.copy(location = false)) == "18:30–21:00 · 周晓飞等")
        check(WidgetText.smallMeta(course, options.copy(location = false, teachers = false)) == "18:30–21:00")
    }
    test("Status lights change at exact start/end boundaries and honor the same render clock") {
        val course = snapshot.courses.first()
        check(WidgetText.courseState(course, course.start-1) == "pending")
        check(WidgetText.courseState(course, course.start) == "active")
        check(WidgetText.courseState(course, course.end-1) == "active")
        check(WidgetText.courseState(course, course.end) == "ended")
    }
    println("$checks native model/contract scenarios passed")
}
