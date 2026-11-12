package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.jdbcUrl
import com.tdt4290group7.backend.link
import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager
import java.sql.ResultSet
import java.time.LocalDate

class CertificateRepository(databasePath: Path) {
    private val databaseUrl: String

    init {
        val path = databasePath.toAbsolutePath().normalize()
        Files.createDirectories(path.parent)
        databaseUrl = jdbcUrl(path)
        DriverManager.getConnection(databaseUrl).use { db ->
            db.createStatement().use { statement ->
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS certificates (
                        id TEXT PRIMARY KEY,
                        supplier_name TEXT NOT NULL CHECK (length(trim(supplier_name)) BETWEEN 1 AND 200),
                        certificate_type TEXT NOT NULL,
                        issue_date TEXT,
                        expiry_date TEXT,
                        source_file TEXT NOT NULL CHECK (length(source_file) BETWEEN 1 AND 255),
                        contract_id TEXT${db.link("agreements")}
                    )""".trimIndent(),
                )
                // Added after first release: nullable ADD COLUMN only, so an older release can still read the file.
                val existing = statement.executeQuery("PRAGMA table_info(certificates)").use { rows ->
                    buildSet { while (rows.next()) add(rows.getString("name")) }
                }
                for (column in listOf("archived_at", "archived_by", "archived_reason", "uploaded_by_role", "archive_pending_for", "uploaded_at")) {
                    if (column !in existing) statement.execute("ALTER TABLE certificates ADD COLUMN $column TEXT")
                }
            }
        }
    }

    fun add(certificate: Certificate) {
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement(
                """INSERT INTO certificates
                    (id, supplier_name, certificate_type, issue_date, expiry_date, source_file, contract_id, uploaded_by_role, archive_pending_for, uploaded_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""".trimIndent(),
            ).use { statement ->
                statement.setString(1, certificate.id)
                statement.setString(2, certificate.supplierName)
                statement.setString(3, certificate.certificateType)
                statement.setString(4, certificate.issueDate?.toString())
                statement.setString(5, certificate.expiryDate?.toString())
                statement.setString(6, certificate.sourceFile)
                statement.setString(7, certificate.contractId)
                statement.setString(8, certificate.uploadedByRole)
                statement.setString(9, certificate.archivePendingFor)
                statement.setString(10, certificate.uploadedAt)
                statement.executeUpdate()
            }
        }
    }

    fun update(certificate: Certificate): Boolean =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement(
                """UPDATE certificates
                    SET supplier_name = ?, certificate_type = ?, issue_date = ?, expiry_date = ?, contract_id = ?
                    WHERE id = ?""".trimIndent(),
            ).use { statement ->
                statement.setString(1, certificate.supplierName)
                statement.setString(2, certificate.certificateType)
                statement.setString(3, certificate.issueDate?.toString())
                statement.setString(4, certificate.expiryDate?.toString())
                statement.setString(5, certificate.contractId)
                statement.setString(6, certificate.id)
                statement.executeUpdate() == 1
            }
        }

    /** Live certificates only: archived ones raise no alerts and count nowhere. */
    fun getAll(): List<Certificate> = query("WHERE archived_at IS NULL")

    fun getAllIncludingArchived(): List<Certificate> = query("")

    fun getArchived(): List<Certificate> = query("WHERE archived_at IS NOT NULL")

    private fun query(where: String): List<Certificate> =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement(
                """SELECT id, supplier_name, certificate_type, issue_date, expiry_date, source_file, contract_id, archived_at, uploaded_by_role, archive_pending_for, uploaded_at
                    FROM certificates $where""".trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.toCertificate()) } }
            }
        }

    fun getById(id: String): Certificate? =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement(
                """SELECT id, supplier_name, certificate_type, issue_date, expiry_date, source_file, contract_id, archived_at, uploaded_by_role, archive_pending_for, uploaded_at
                    FROM certificates WHERE id = ?""".trimIndent(),
            ).use { statement ->
                statement.setString(1, id)
                statement.executeQuery().use { rows -> if (rows.next()) rows.toCertificate() else null }
            }
        }

    /** Archiving keeps the record and its document; it only takes the certificate out of alerts, risk and the live lists. */
    /** [replacedBy] is the certificate that replaced this one, when the archive comes from a renewal. */
    fun archive(id: String, actorId: String, now: java.time.Instant, replacedBy: String? = null): Boolean =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement("UPDATE certificates SET archived_at = ?, archived_by = ?, archived_reason = ? WHERE id = ? AND archived_at IS NULL").use {
                it.setString(1, now.toString()); it.setString(2, actorId); it.setString(3, replacedBy); it.setString(4, id)
                it.executeUpdate() == 1
            }
        }

    /** Drops the pending-archive mark from a renewal, after an admin confirmed or rejected it. */
    fun clearPendingArchive(id: String): Boolean =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement("UPDATE certificates SET archive_pending_for = NULL WHERE id = ? AND archive_pending_for IS NOT NULL").use {
                it.setString(1, id)
                it.executeUpdate() == 1
            }
        }

    fun restore(id: String): Boolean =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement("UPDATE certificates SET archived_at = NULL, archived_by = NULL, archived_reason = NULL WHERE id = ? AND archived_at IS NOT NULL").use {
                it.setString(1, id)
                it.executeUpdate() == 1
            }
        }

    private fun ResultSet.toCertificate() = Certificate(
        id = getString("id"),
        supplierName = getString("supplier_name"),
        certificateType = getString("certificate_type"),
        issueDate = getString("issue_date")?.let(LocalDate::parse),
        expiryDate = getString("expiry_date")?.let(LocalDate::parse),
        sourceFile = getString("source_file"),
        status = calculateStatus(getString("expiry_date")?.let(LocalDate::parse)),
        contractId = getString("contract_id"),
        archivedAt = getString("archived_at"),
        uploadedByRole = getString("uploaded_by_role"),
        archivePendingFor = getString("archive_pending_for"),
        uploadedAt = getString("uploaded_at"),
    )
}