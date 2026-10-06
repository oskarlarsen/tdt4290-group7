package com.tdt4290group7.backend.plugins

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.calllogging.CallLogging
import org.slf4j.event.Level

fun Application.configureMonitoring() {
    install(CallLogging) {
        level = Level.INFO
        // Colors need jansi's native library, which can't load from the read-only container's
        // noexec /tmp; plain output is also easier to read in log aggregators.
        disableDefaultColors()
    }
}
