package com.tdt4290group7.backend.repository

import com.tdt4290group7.backend.link
import java.sql.Connection

/** Creates or upgrades the account tables. Separate from UserRepository so the one-time merge can build them without opening the account store. */
internal fun createUserTables(db: Connection) {
    db.createStatement().use { statement ->
        statement.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('ADMIN', 'SUPPLIER')),
                supplier_id TEXT${db.link("suppliers")},
                token_version INTEGER NOT NULL DEFAULT 0
            ) STRICT"""
        )
        statement.execute(
            """CREATE TABLE IF NOT EXISTS supplier_invitations (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL COLLATE NOCASE,
                supplier_id TEXT NOT NULL${db.link("suppliers")},
                supplier_name TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                accepted_at TEXT
            ) STRICT"""
        )
        statement.execute(
            "CREATE INDEX IF NOT EXISTS idx_supplier_invitations_email ON supplier_invitations(email, accepted_at)"
        )
        // Added after first release: nullable ADD COLUMN only, so an older release can still read the file.
        val existing = statement.executeQuery("PRAGMA table_info(users)").use { rows ->
            buildSet { while (rows.next()) add(rows.getString("name")) }
        }
        if ("last_active_at" !in existing) statement.execute("ALTER TABLE users ADD COLUMN last_active_at TEXT")
        for ((column, type) in listOf(
            "access_expires_at" to "TEXT", "granted_by" to "TEXT", "access_approved_by" to "TEXT",
            "access_approved_at" to "TEXT", "is_permanent" to "INTEGER NOT NULL DEFAULT 0",
        )) {
            if (column !in existing) statement.execute("ALTER TABLE users ADD COLUMN $column $type")
        }
        // New invitations (a supplier inviting a colleague, an admin inviting an admin, with optional stand-in end date).
        statement.execute(
            """CREATE TABLE IF NOT EXISTS access_invitations (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL COLLATE NOCASE,
                role TEXT NOT NULL CHECK(role IN ('ADMIN', 'SUPPLIER')),
                supplier_id TEXT${db.link("suppliers")},
                supplier_name TEXT,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                accepted_at TEXT,
                invited_by TEXT NOT NULL${db.link("users")},
                access_expires_at TEXT
            ) STRICT"""
        )
    }
}
