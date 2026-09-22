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
