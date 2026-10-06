package com.tdt4290group7.backend.plugins

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.bodylimit.RequestBodyLimit
import io.ktor.server.routing.routing

// Small requests (including authentication) retain the default limit. Only the two vehicle
// batch routes override it; their separate 10,000-entry validation still applies.
const val MAX_REQUEST_BODY_BYTES = 16L * 1024
const val MAX_VEHICLE_BATCH_BODY_BYTES = 4L * 1024 * 1024

fun Application.configureBodyLimit() {
    routing {
        install(RequestBodyLimit) {
            bodyLimit { MAX_REQUEST_BODY_BYTES }
        }
    }
}
