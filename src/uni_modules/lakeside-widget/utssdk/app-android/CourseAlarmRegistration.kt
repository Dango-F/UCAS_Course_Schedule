package com.lakeside.widget

// Both operations target the same course boundary. Only the delivery precision
// changes when the platform denies exact alarms.
internal fun registerCourseAlarm(exactAllowed: Boolean, exact: () -> Unit, inexact: () -> Unit): Boolean {
    if (exactAllowed) {
        try {
            exact()
            return true
        } catch (_: SecurityException) {
            // Some systems reject the actual registration despite the capability check.
        }
    }
    inexact()
    return false
}
