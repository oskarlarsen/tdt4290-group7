package com.tdt4290group7.backend.plugins

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.bodylimit.RequestBodyLimit
import io.ktor.server.routing.routing

// Small requests retain the default limit. Statistics batches have a separate
// 4 MiB limit and validate a maximum of 10,000 rows.
const val MAX_REQUEST_BODY_BYTES = 16L * 1024
const val MAX_VEHICLE_BATCH_BODY_BYTES = 4L * 1024 * 1024

fun Application.configureBodyLimit() {
    routing {
        install(RequestBodyLimit) {
            bodyLimit { MAX_REQUEST_BODY_BYTES }
        }
    }
}
