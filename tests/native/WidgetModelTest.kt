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
    test("Large list keeps unfinished classes first and orders overlapping finished classes by end time") {
        val example = snapshot.courses.first()
        val date = "2026-09-14"
        fun course(id: String, start: String, end: String) = example.copy(
            id = id, date = date, start = at(date, start), end = at(date, end), startTime = start, endTime = end
        )
        val long = course("long", "08:30", "11:00")
        val short = course("short", "09:00", "10:00")
        val current = course("current", "10:30", "12:00")
        val upcoming = course("upcoming", "14:00", "16:00")
        val rows = listOf(long, short, current, upcoming)
        val now = long.end
        check(WidgetSelector.largeCourses(rows, short.end) == listOf(long, current, upcoming, short))
        check(WidgetSelector.largeCourses(rows, now) == listOf(current, upcoming, short, long))
        check(WidgetSelector.largeCourses(rows, upcoming.end) == listOf(short, long, current, upcoming))
        val restored = WidgetSnapshot.parse(snapshot.copy(courses = rows).json(now).toString())
        check(WidgetSelector.largeCourses(restored.courses, now) == listOf(current, upcoming, short, long))
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
    test("Wide preview persists within the same day and resets after Shanghai midnight") {
        val now = at("2026-09-13", "23:59")
        check(WidgetDayView.offset("large", "2026-09-13", 1, now) == 1)
        check(WidgetDayView.offset("large", "2026-09-13", 1, at("2026-09-14", "00:00")) == 0)
        check(WidgetDayView.offset("large", "2026-09-13", 0, now) == 0)
        check(WidgetDayView.offset("large", "2026-09-13", 9, now) == 0)
        check(WidgetDayView.offset("large", null, 1, now) == 0)
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
    test("Compact widget ignores a saved tomorrow mode and fills unused slots from later dates") {
        val first = snapshot.courses.first()
        val now = WidgetClock.midnight(first.date) - 3600000L
        val nextDate = WidgetClock.date(WidgetClock.midnight(first.date) + 86400000L)
        val rows = (0..3).map { first.copy(id = "tomorrow-$it", start = first.start + it * 60000L, end = first.end + it * 60000L) }
        val later = first.copy(id = "following-day", date = nextDate, start = first.start + 86400000L, end = first.end + 86400000L)
        val data = snapshot.copy(courses = rows + later)
        val offset = WidgetDayView.offset("small", WidgetClock.date(now), 1, now)
        val selection = WidgetSelector.select(data, "valid", now, offset)
        check(selection.date == WidgetClock.date(now) && selection.remaining == 0)
        check(WidgetSelector.smallCourses(data, selection, now, 4) == rows)
        val three = data.copy(courses = rows.take(3) + later)
        check(WidgetSelector.smallCourses(three, WidgetSelector.select(three, "valid", now, offset), now, 4) == three.courses)
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
    test("Tall compact widget keeps current priority and continues beyond four courses") {
        val first = snapshot.courses.first()
        val now = first.start
        val ended = first.copy(id = "ended", start = now - 60000L, end = now)
        val rows = (0..11).map { first.copy(id = "tall-$it", start = now + it * 60000L, end = first.end + it * 60000L) }
        val data = snapshot.copy(courses = listOf(ended) + rows.take(2) + rows.drop(1))
        val selected = WidgetSelector.select(data, "valid", now)
        check(WidgetSelector.smallCourses(data, selected, now, 7) == rows.take(7))
        check(WidgetSelector.smallCourses(data, selected, now, 99) == rows)
        check(WidgetSelector.smallCourses(data, selected, now, 2) == rows.take(2))
    }
    test("Tall compact widget can continue past tomorrow") {
        val first = snapshot.courses.first()
        val now = WidgetClock.midnight(first.date) - 3600000L
        val tomorrow = (0..6).map { first.copy(id = "tomorrow-extra-$it", start = first.start + it * 60000L, end = first.end + it * 60000L) }
        val later = first.copy(id = "later-day", date = WidgetClock.date(WidgetClock.midnight(first.date) + 86400000L), start = first.start + 86400000L, end = first.end + 86400000L)
        val data = snapshot.copy(courses = tomorrow + later)
        check(WidgetSelector.smallCourses(data, WidgetSelector.select(data, "valid", now), now, 12) == tomorrow + later)
    }
    test("Compact height boundaries grow capacity and shrink back to two or four") {
        fun count(height: Float) = SmallWidgetSizing.candidateLimit(height, 180f)
        check(count(84f) == 2 && count(139f) == 2)
        check(count(140f) == 4 && count(180f) == 4 && count(218f) == 4)
        check(count(269.9f) == 4 && count(270f) == 6 && count(320f) == 6)
        check(count(359.9f) == 6 && count(360f) == 8 && count(480f) == 10)
        check(count(218.6f) == 4)
        check(count(140f) == 4 && count(84f) == 2)
        check(count(Float.NaN) == 2 && count(100000f) == 64)
    }
    test("One-row update pre-sends the two-row and taller layouts before resize callbacks") {
        val frames = SmallWidgetSizing.responsiveFrames(180f, 800f, 86f)
        fun layout(height: Float, width: Float = 320f) = frames.last { it.minWidth <= width && it.minHeight <= height }.layoutHeight
        check(frames.map { it.layoutHeight }.containsAll(listOf(48f, 62f, 78f, 140f, 180f, 270f, 360f)))
        fun displayed(height: Float): Int = SmallWidgetSizing.candidateLimit(layout(height), 180f)
        check(layout(36f) == 48f && layout(60f) == 48f && layout(64f) == 62f && layout(86f) == 78f)
        check(displayed(84f) == 2)
        check(displayed(140f) == 4 && displayed(192.67f) == 4)
        check(displayed(84f) == 2) // shrink without generating another plan
        check(displayed(320f) == 6 && displayed(360f) == 8)
        for (width in listOf(250f, 319.5f, 342f, 360f, 600f)) {
            check(layout(86f, width) == 78f && layout(192.67f, width) == 180f)
        }
        val heights = frames.map { it.minHeight }
        check(heights == heights.sorted().distinct() && heights.size <= 16)
    }
    test("Responsive plan handles missing sizes and stays within Android's 16-frame limit") {
        val fallback = SmallWidgetSizing.responsiveFrames(Float.NaN, Float.NaN, Float.NaN)
        check(fallback.first().layoutHeight == 78f)
        check(fallback.map { it.layoutHeight }.containsAll(listOf(48f, 140f, 180f, 270f, 360f)))
        for ((reported, expected) in listOf(0f to 78f, 53f to 48f, 68f to 62f, 86f to 78f, 155f to 140f, 192.67f to 180f)) {
            check(SmallWidgetSizing.responsiveFrames(180f, 800f, reported).first().layoutHeight == expected)
        }
        val frames = SmallWidgetSizing.responsiveFrames(180f, 3000f, 192.67f)
        val huge = frames.map { it.minHeight }
        check(huge.size == 16 && huge == huge.sorted().distinct())
        check(SmallWidgetSizing.candidateLimit(frames.last().layoutHeight, 180f) == 64)
        check(huge.contains(140f) && huge.contains(180f))
    }
    test("Repeated resize requests drop outdated work but keep the newest widget frame") {
        val older = WidgetResizeRequests.begin(201)
        val newer = WidgetResizeRequests.begin(201)
        check(!WidgetResizeRequests.isLatest(201, older))
        check(WidgetResizeRequests.isLatest(201, newer))
        WidgetResizeRequests.finish(201, older)
        check(WidgetResizeRequests.isLatest(201, newer))
        WidgetResizeRequests.finish(201, newer)
        check(!WidgetResizeRequests.isLatest(201, newer))
    }
    test("Resize coalescing isolates widget instances and cancellation prevents stale submissions") {
        val first = WidgetResizeRequests.begin(202)
        val other = WidgetResizeRequests.begin(203)
        WidgetResizeRequests.begin(202)
        check(!WidgetResizeRequests.isLatest(202, first))
        check(WidgetResizeRequests.isLatest(203, other))
        WidgetResizeRequests.cancel(203)
        check(!WidgetResizeRequests.isLatest(203, other))
        WidgetResizeRequests.cancel(202)
    }
    test("Compact fit count includes fixed gaps and never adds a partially fitting row") {
        val rows = List(12) { 31.545f }
        check(SmallWidgetSizing.fitCount(180f, rows, 32.818f, 7f, 0f) == 4)
        check(SmallWidgetSizing.fitCount(218f, rows, 32.818f, 7f, 0f) == 4)
        check(SmallWidgetSizing.fitCount(219f, rows, 32.818f, 7f, 0f) == 5)
        check(SmallWidgetSizing.fitCount(320f, rows, 32.818f, 7f, 0f) == 7)
    }
    test("Two-row compact keeps four base courses when wrapped titles exceed fixed spacing") {
        val rows = listOf(46f, 46f, 36f, 36f)
        val fitted = SmallWidgetSizing.fitCount(180f, rows, 32.818f, 7f, 0f)
        check(fitted == 3)
        check(SmallWidgetSizing.visibleCount(180f, rows.size, fitted) == 4)
        check(SmallWidgetSizing.visibleCount(200f, 5, 3) == 4)
        check(SmallWidgetSizing.visibleCount(140f, 4, 3) == 4)
        check(SmallWidgetSizing.visibleCount(84f, 2, 1) == 2)
    }
    test("Base capacity never invents courses or adds unfitting extra rows") {
        check(SmallWidgetSizing.visibleCount(180f, 3, 3) == 3)
        check(SmallWidgetSizing.visibleCount(180f, 0, 0) == 0)
        check(SmallWidgetSizing.visibleCount(320f, 7, 6) == 6)
        check(SmallWidgetSizing.visibleCount(320f, 8, 7) == 6)
        check(SmallWidgetSizing.visibleCount(360f, 8, 8) == 8)
        check(SmallWidgetSizing.visibleCount(360f, 7, 8) == 7)
    }
    test("Long names and larger fonts reduce extra rows instead of cropping later courses") {
        val wrapped = listOf(80f) + List(11) { 31.545f }
        check(SmallWidgetSizing.fitCount(320f, wrapped, 32.818f, 7f, 0f) == 6)
        check(SmallWidgetSizing.fitCount(320f, List(12) { 54f }, 32.818f, 7f, 0f) == 4)
        check(SmallWidgetSizing.fitCount(320f, emptyList(), 32.818f, 7f) == 0)
    }
    test("Compact widget handles one or no remaining courses") {
        val now = at("2026-09-13", "21:00")
        val last = snapshot.courses.first { it.start > now }
        val one = snapshot.copy(courses = listOf(last))
        check(WidgetSelector.smallCourses(one, WidgetSelector.select(one, "valid", now), now, 2) == listOf(last))
        val ended = WidgetSelector.select(one, "valid", last.end)
        check(WidgetSelector.smallCourses(one, ended, last.end, 2).isEmpty())
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
    test("Shared opacity migrates a custom setting and visibility patches preserve it") {
        val defaultCard = JSONObject().put("opacity", 80)
        val olderCustomCard = JSONObject().put("opacity", 65).put("showLocation", false)
        val newerCustomCard = JSONObject().put("opacity", 95)
        val shared = WidgetOptions.legacyOpacity(sequenceOf(defaultCard, olderCustomCard, newerCustomCard))
        check(shared == 65)
        check(WidgetOptions.legacyOpacity(sequenceOf(defaultCard, JSONObject())) == 80)

        val wide = WidgetOptions.read("large", olderCustomCard).copy(opacity = shared)
        val compact = WidgetOptions.read("small", newerCustomCard).copy(opacity = shared)
        val changed = compact.withChanges("small", JSONObject().put("opacity", 90))
        val edited = wide.copy(opacity = changed.opacity)
            .withChanges("large", JSONObject().put("showTeachers", false))
        check(edited.opacity == changed.opacity && changed.opacity == 90)
        check(!edited.teachers && !edited.location && edited.sections)
        check(changed.teachers && changed.location && !changed.sections)
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
    test("Refresh follows unique course boundaries and skips the overnight gap") {
        val original = snapshot.courses.first()
        val morning = original.copy(start = at("2026-09-14", "08:30"), end = at("2026-09-14", "10:10"))
        val following = original.copy(start = morning.end, end = at("2026-09-14", "12:00"))
        val later = original.copy(start = at("2026-09-16", "15:00"), end = at("2026-09-16", "17:00"))
        val schedule = snapshot.copy(courses = listOf(morning, morning, following, later))
        var now = morning.start - 1
        for (expected in listOf(morning.start, morning.end, following.end, later.start, later.end)) {
            check(WidgetCourseBoundaries.next(schedule, now) == expected)
            now = expected
        }
        check(WidgetCourseBoundaries.next(schedule, now) == null)
    }
    test("Alarm delivery rejects early, superseded, canceled and removed boundaries") {
        val course = snapshot.courses.first()
        val schedule = snapshot.copy(courses = listOf(course))
        check(WidgetCourseBoundaries.isDue(schedule, course.start, course.start, course.start))
        check(WidgetCourseBoundaries.isDue(schedule, course.start, course.start, course.start + 60_000))
        check(!WidgetCourseBoundaries.isDue(schedule, course.start, course.start, course.start - 1))
        check(!WidgetCourseBoundaries.isDue(schedule, course.end, course.start, course.start))
        check(!WidgetCourseBoundaries.isDue(schedule, 0L, course.start, course.start))
        check(!WidgetCourseBoundaries.isDue(schedule.copy(courses = emptyList()), course.start, course.start, course.start))
        check(WidgetCourseBoundaries.next(schedule.copy(semester = requireNotNull(schedule.semester).copy(confirmed = false)), course.start - 1) == null)
        check(WidgetCourseBoundaries.next(null, course.start - 1) == null)
    }
    test("Missing exact access and an exact registration denial arm the same boundary inexactly") {
        for (allowed in listOf(true, false)) {
            val calls = mutableListOf<String>()
            val exact = registerCourseAlarm(allowed, exact = {
                calls.add("exact")
                throw SecurityException("denied")
            }, inexact = { calls.add("inexact") })
            check(!exact)
            check(calls == if (allowed) listOf("exact", "inexact") else listOf("inexact"))
        }
        check(registerCourseAlarm(true, exact = {}, inexact = { error("Unexpected second alarm") }))
    }
    test("Foreground recovery consumes an overdue boundary once and keeps the following alarm") {
        val course = snapshot.courses.first()
        val single = snapshot.copy(courses = listOf(course))
        val initial = WidgetCourseBoundaries.update(single, 0, null, course.start - 1)!!
        check(initial.nextAt == course.start && !initial.refreshDue)
        val recovered = WidgetCourseBoundaries.update(single, initial.nextAt!!, null, course.start + 1)!!
        check(recovered.refreshDue && recovered.nextAt == course.end)
        check(WidgetCourseBoundaries.update(single, recovered.nextAt!!, course.start, course.start + 2) == null)
        val final = WidgetCourseBoundaries.update(single, course.end, course.end, course.end)!!
        check(final.refreshDue && final.nextAt == null)
    }
    test("A delayed cold delivery catches up after both edges; edits and widget removal invalidate old edges") {
        val course = snapshot.courses.first()
        val single = snapshot.copy(courses = listOf(course))
        val late = WidgetCourseBoundaries.update(single, course.start, course.start, course.end + 1)!!
        check(late.refreshDue && late.nextAt == null)
        val early = WidgetCourseBoundaries.update(single, course.start, course.start, course.start - 1)!!
        check(!early.refreshDue && early.nextAt == course.start)
        val empty = WidgetCourseBoundaries.update(null, course.start, course.start, course.end + 1)!!
        check(!empty.refreshDue && empty.nextAt == null)
    }
    println("$checks native model/contract scenarios passed")
}
