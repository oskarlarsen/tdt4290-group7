package com.tdt4290group7.backend

import java.nio.file.Files
import java.nio.file.Path

/** Process environment wins; local .env is a development-only fallback. */
internal fun svvApiKey(
    environment: Map<String, String> = System.getenv(),
    envFile: Path = Path.of(".env"),
): String? {
    environment["SVV_API_KEY"]?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
    if (!Files.isRegularFile(envFile)) return null

    val rawValue = Files.readAllLines(envFile)
        .map(String::trim)
        .filter { it.isNotEmpty() && !it.startsWith("#") }
        .lastOrNull { it.substringBefore('=').trim() == "SVV_API_KEY" }
        ?.substringAfter('=')
        ?.trim()
        ?: return null
    val value = when {
        rawValue.length >= 2 && rawValue.first() == '"' && rawValue.last() == '"' -> rawValue.drop(1).dropLast(1)
        rawValue.length >= 2 && rawValue.first() == '\'' && rawValue.last() == '\'' -> rawValue.drop(1).dropLast(1)
        else -> rawValue
    }
    return value.takeIf(String::isNotBlank)
}
