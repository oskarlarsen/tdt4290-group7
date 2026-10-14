package com.tdt4290group7.backend

import java.nio.file.Files
import java.nio.file.Path

/** Root configuration is for local development only; explicit process values (even blank) win. */
internal fun backendSetting(
    name: String,
    environment: Map<String, String> = System.getenv(),
    envFile: Path = rootEnvFile(environment),
): String? {
    if (environment.containsKey(name)) return environment[name]?.takeIf(String::isNotBlank)
    if (!Files.isRegularFile(envFile)) return null

    val rawValue = Files.readAllLines(envFile)
        .map(String::trim)
        .filter { it.isNotEmpty() && !it.startsWith("#") }
        .lastOrNull { '=' in it && it.substringBefore('=').trim() == name }
        ?.substringAfter('=')
        ?.trim()
        ?: return null
    val value = parseEnvValue(name, rawValue)
    return value.takeIf(String::isNotBlank)
}

/** Resolve from either repo root or backend/, without falling back to retired per-service files. */
internal fun rootEnvFile(environment: Map<String, String> = System.getenv(), workingDirectory: Path = Path.of("")): Path {
    val directory = workingDirectory.toAbsolutePath().normalize()
    environment["BACKEND_ENV_FILE"]?.takeIf(String::isNotBlank)?.let { return directory.resolve(it).normalize() }
    var candidate: Path? = directory
    while (candidate != null) {
        if (Files.isRegularFile(candidate.resolve("docker-compose.yml")) && Files.isRegularFile(candidate.resolve(".env.example")))
            return candidate.resolve(".env")
        candidate = candidate.parent
    }
    // Packaged deployments have no source checkout. Prefer injected settings; never bundle .env.
    return directory.resolve(".env")
}

/** Portable single-line dotenv subset. No shell execution or variable expansion. */
private fun parseEnvValue(name: String, raw: String): String {
    if (raw.isEmpty()) return ""
    if (raw.first() != '\'' && raw.first() != '"') return raw.replace(Regex("\\s+#.*$"), "").trim()
    val quote = raw.first()
    val decoded = StringBuilder()
    var index = 1
    while (index < raw.length) {
        val char = raw[index++]
        if (char == quote) {
            val rest = raw.substring(index).trim()
            require(rest.isEmpty() || rest.startsWith("#")) { "Invalid quoted value for $name in .env" }
            return decoded.toString()
        }
        if (quote == '"' && char == '\\' && index < raw.length) {
            val escaped = raw[index++]
            decoded.append(when (escaped) { 'n' -> '\n'; 'r' -> '\r'; 't' -> '\t'; '"' -> '"'; '\\' -> '\\'; else -> { decoded.append('\\'); escaped } })
        } else decoded.append(char)
    }
    throw IllegalArgumentException("Unclosed quoted value for $name in .env")
}

internal fun svvApiKey(): String? = backendSetting("SVV_API_KEY")

// Duration.ofDays converts days to seconds using a checked multiplication.
private const val MAX_CACHE_TTL_DAYS = Long.MAX_VALUE / 86_400

internal fun svvCacheTtlDays(value: String? = backendSetting("SVV_CACHE_TTL_DAYS")): Long = value
    ?.toLongOrNull()
    ?.takeIf { it in 1..MAX_CACHE_TTL_DAYS }
    ?: 14
