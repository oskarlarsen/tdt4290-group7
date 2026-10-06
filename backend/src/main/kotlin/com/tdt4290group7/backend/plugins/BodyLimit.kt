package com.tdt4290group7.backend.plugins

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.bodylimit.RequestBodyLimit

// Every current endpoint takes a small JSON object; this is generous for those and stops a
// client from making the server buffer arbitrarily large bodies. A future route that genuinely
// needs more (e.g. file upload) can install RequestBodyLimit with a larger limit on that route.
const val MAX_REQUEST_BODY_BYTES = 16L * 1024

fun Application.configureBodyLimit() {
    install(RequestBodyLimit) {
        bodyLimit { MAX_REQUEST_BODY_BYTES }
    }
}
