package com.tdt4290group7.backend.auth

/**
 * Rules for new passwords, following NIST SP 800-63B: length matters, composition rules
 * (forced digits/symbols) don't, so none are imposed.
 */
object PasswordPolicy {
    const val MIN_LENGTH = 12

    // bcrypt only uses the first 72 bytes and our library rejects anything longer.
    const val MAX_BYTES = 72

    /** A user-facing reason [password] is not acceptable, or null if it is. */
    fun violation(password: String): String? = when {
        password.length < MIN_LENGTH -> "Det nye passordet må være minst $MIN_LENGTH tegn."
        exceedsBcryptLimit(password) -> "Det nye passordet er for langt."
        password.isBlank() -> "Det nye passordet kan ikke bare bestå av mellomrom."
        else -> null
    }

    fun exceedsBcryptLimit(password: String) = password.toByteArray(Charsets.UTF_8).size > MAX_BYTES
}
