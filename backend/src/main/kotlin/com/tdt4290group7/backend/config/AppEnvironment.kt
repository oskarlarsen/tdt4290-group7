package com.tdt4290group7.backend.config

/**
 * Where the backend is running, from APP_ENV (`dev` or `prod`). Defaults to [PROD] so that
 * forgetting to set it never enables development-only behaviour.
 */
enum class AppEnvironment {
    DEV,
    PROD;

    companion object {
        fun parse(raw: String?): AppEnvironment = when (raw?.trim()?.lowercase()) {
            null, "" -> PROD
            "dev" -> DEV
            "prod" -> PROD
            else -> throw IllegalArgumentException("APP_ENV must be 'dev' or 'prod', was '$raw'")
        }
    }
}

/**
 * Whether password reset tokens may be written to the log (there is no email delivery yet).
 * Anyone who can read the logs could take over accounts, so enabling it outside development is
 * a startup error rather than something that silently works.
 */
fun resetTokenLoggingEnabled(environment: AppEnvironment, flag: String?): Boolean {
    val requested = flag?.trim()?.lowercase() == "true"
    require(!requested || environment == AppEnvironment.DEV) {
        "ALLOW_DEV_PASSWORD_RESET_LOG=true is only allowed with APP_ENV=dev"
    }
    return requested
}
