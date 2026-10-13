package com.lakeside.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

internal class WidgetRepository(private val context: Context) {
    private val file = AtomicFile(File(context.filesDir, "lakeside-widget-v1.json"))
    private val prefs = context.getSharedPreferences("lakeside-widget-options-v1", Context.MODE_PRIVATE)
    fun read(): Pair<WidgetSnapshot?, String> = synchronized(LOCK) {
        try { WidgetSnapshot.parse(file.openRead().bufferedReader(Charsets.UTF_8).use { it.readText() }) to "valid" }
        catch (_: java.io.FileNotFoundException) { null to "missing" }
        catch (_: Exception) { null to "invalid" }
    }
    fun write(raw: String): WidgetSnapshot = synchronized(LOCK) {
        val snapshot = WidgetSnapshot.parse(raw)
        var stream: java.io.FileOutputStream? = null
        try {
            stream = file.startWrite()
            stream.write(raw.toByteArray(Charsets.UTF_8))
            file.finishWrite(stream)
        } catch (error: Exception) { file.failWrite(stream); throw error }
        snapshot
    }
    fun instances(): List<Pair<Int, String>> {
        val manager = AppWidgetManager.getInstance(context)
        return listOf(LargeWidgetProvider::class.java to "large", SmallWidgetProvider::class.java to "small").flatMap { (provider, kind) ->
            manager.getAppWidgetIds(ComponentName(context, provider)).map { it to kind }
        }.sortedBy { it.first }
    }
    fun options(id: Int, kind: String): WidgetOptions {
        val json = try { prefs.getString("options-$id", null)?.let { JSONObject(it) } } catch (_: Exception) { null }
        return WidgetOptions.read(kind, json, migrateLegacy = true)
    }
    fun saveOptions(id: Int, kind: String, raw: String) {
        require(prefs.edit().putString("options-$id", WidgetOptions.read(kind, JSONObject(raw)).json().toString()).commit())
    }
    fun dayOffset(id: Int, now: Long): Int = try {
        WidgetDayView.offset(prefs.getString("day-base-$id", null), prefs.getInt("day-offset-$id", 0), now)
    } catch (_: Exception) { 0 }
    fun saveDayOffset(id: Int, offset: Int, now: Long) {
        require(offset in 0..1)
        require(prefs.edit().putString("day-base-$id", WidgetClock.date(now)).putInt("day-offset-$id", offset).commit())
    }
    fun remove(id: Int) { prefs.edit().remove("options-$id").remove("frame-$id").remove("day-base-$id").remove("day-offset-$id").apply() }
    fun saveFrame(id: Int, snapshot: WidgetSnapshot?, courses: List<WidgetCourse>, options: WidgetOptions, now: Long) {
        val daily = (snapshot ?: WidgetSnapshot("missing", null, emptyList())).copy(courses = courses)
        val frame = JSONObject().put("snapshot", daily.json(now)).put("options", options.json()).put("now", now)
        require(prefs.edit().putString("frame-$id", frame.toString()).commit())
    }
    fun frame(id: Int): Triple<WidgetSnapshot, WidgetOptions, Long>? = try {
        prefs.getString("frame-$id", null)?.let { raw ->
            val frame = JSONObject(raw)
            Triple(WidgetSnapshot.parse(frame.getJSONObject("snapshot").toString()), WidgetOptions.read("large", frame.getJSONObject("options")), frame.getLong("now"))
        }
    } catch (_: Exception) { null }
    fun restore(oldIds: IntArray, newIds: IntArray) {
        val saved = oldIds.map { prefs.getString("options-$it", null) }
        val edit = prefs.edit()
        oldIds.forEach { edit.remove("options-$it").remove("frame-$it").remove("day-base-$it").remove("day-offset-$it") }
        newIds.forEachIndexed { index, id -> saved.getOrNull(index)?.let { edit.putString("options-$id", it) } }
        edit.apply()
    }
    fun state(): String {
        val (snapshot, status) = read()
        val instances = JSONArray()
        instances().forEach { (id, kind) -> instances.put(JSONObject().put("id", id).put("kind", kind).put("options", options(id, kind).json())) }
        val kinds = WidgetCapabilities.registeredKinds(context)
        return JSONObject().put("supported", kinds.isNotEmpty()).put("pinSupported", WidgetCapabilities.pinSupported(context))
            .put("availability", WidgetCapabilities.availability(context, kinds)).put("registeredKinds", JSONArray(kinds))
            .put("packageName", context.packageName).put("nativeVersion", 2).put("revision", snapshot?.revision ?: "")
            .put("cacheState", status).put("instances", instances).toString()
    }
    companion object { private val LOCK = Any() }
}
