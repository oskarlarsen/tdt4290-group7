package com.tdt4290group7.backend.certificates

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
        databaseUrl = "jdbc:sqlite:$path"
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
                        contract_id TEXT
                    )""".trimIndent(),
                )
            }
        }
    }

    fun add(certificate: Certificate) {
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement(
                """INSERT INTO certificates
                    (id, supplier_name, certificate_type, issue_date, expiry_date, source_file, contract_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)""".trimIndent(),
            ).use { statement ->
                statement.setString(1, certificate.id)
                statement.setString(2, certificate.supplierName)
                statement.setString(3, certificate.certificateType)
                statement.setString(4, certificate.issueDate?.toString())
                statement.setString(5, certificate.expiryDate?.toString())
                statement.setString(6, certificate.sourceFile)
                statement.setString(7, certificate.contractId)
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

    fun delete(id: String): Boolean =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement("DELETE FROM certificates WHERE id = ?").use { statement ->
                statement.setString(1, id)
                statement.executeUpdate() == 1
            }
        }

    fun getAll(): List<Certificate> =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement(
                """SELECT id, supplier_name, certificate_type, issue_date, expiry_date, source_file, contract_id
                    FROM certificates""".trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.toCertificate()) } }
            }
        }

    fun getById(id: String): Certificate? =
        DriverManager.getConnection(databaseUrl).use { db ->
            db.prepareStatement(
                """SELECT id, supplier_name, certificate_type, issue_date, expiry_date, source_file, contract_id
                    FROM certificates WHERE id = ?""".trimIndent(),
            ).use { statement ->
                statement.setString(1, id)
                statement.executeQuery().use { rows -> if (rows.next()) rows.toCertificate() else null }
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
    )
}