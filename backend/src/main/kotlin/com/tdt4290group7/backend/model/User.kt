package com.tdt4290group7.backend.model

import kotlinx.serialization.Serializable

enum class Role {
    ADMIN,
    SUPPLIER,
}

/** Internal representation, never serialized directly to clients (holds the password hash). */
data class User(
    val id: String,
    val name: String,
    val email: String,
    val passwordHash: String,
    val role: Role,
    val supplierId: String? = null,
    // Embedded in every JWT; bumping it (e.g. on password change) invalidates all issued tokens.
    val tokenVersion: Int = 0,
)

/** Public-facing user shape returned to the frontend. */
@Serializable
data class AuthUser(
    val id: String,
    val name: String,
    val email: String,
    val role: Role,
    val supplierId: String? = null,
)

fun User.toAuthUser() = AuthUser(
    id = id,
    name = name,
    email = email,
    role = role,
    supplierId = supplierId,
)
