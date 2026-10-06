package com.tdt4290group7.backend.config

/**
 * Returns [value] if it is set and non-blank. Secrets have no defaults: a fallback in source
 * control is public, so a missing secret must stop startup instead.
 */
fun requireSecret(name: String, value: String?): String {
    check(!value.isNullOrBlank()) {
        "$name is not set. Refusing to start: a default would be published in source control. " +
            "Set $name and restart."
    }
    return value
}
