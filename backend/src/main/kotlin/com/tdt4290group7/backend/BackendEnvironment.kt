package com.tdt4290group7.backend

import java.nio.file.Files
import java.nio.file.Path

/** Process environment wins; local .env is a development-only fallback. */
internal fun backendSetting(
    name: String,
    environment: Map<String, String> = System.getenv(),
    envFile: Path = Path.of(".env"),
): String? {
    environment[name]?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
    if (!Files.isRegularFile(envFile)) return null

    val rawValue = Files.readAllLines(envFile)
        .map(String::trim)
        .filter { it.isNotEmpty() && !it.startsWith("#") }
        .lastOrNull { it.substringBefore('=').trim() == name }
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

internal fun svvApiKey(): String? = backendSetting("SVV_API_KEY")

// Duration.ofDays converts days to seconds using a checked multiplication.
private const val MAX_CACHE_TTL_DAYS = Long.MAX_VALUE / 86_400

internal fun svvCacheTtlDays(value: String? = backendSetting("SVV_CACHE_TTL_DAYS")): Long = value
    ?.toLongOrNull()
    ?.takeIf { it in 1..MAX_CACHE_TTL_DAYS }
    ?: 14
