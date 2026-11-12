package com.tdt4290group7.backend

import com.tdt4290group7.backend.admin.AdminInsightsRepository
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.repository.createUserTables
import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.SupplierInput
import com.tdt4290group7.backend.vehicles.VehicleRepository
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LegacyDatabaseMergeTest {
    private val actor = ChangeActor("admin", "Administrator")

    /** Four old-style files in a fresh directory: one supplier with an agreement, and rows in every other file that point at them. */
    private class Legacy(val dir: Path, val supplierId: String, val agreementId: String) {
        val files = LegacyDatabaseMerge.LegacyFiles(dir.resolve("vehicles.db"), dir.resolve("users.db"), dir.resolve("certificates.db"), dir.resolve("admin-insights.db"))
        val target: Path = dir.resolve("app.db")
    }

    private fun connect(path: Path): Connection = DriverManager.getConnection("jdbc:sqlite:$path?foreign_keys=true")

    private fun legacy(orphanUser: Boolean = false): Legacy {
        val dir = Files.createTempDirectory(Path.of("build").also { Files.createDirectories(it) }, "merge")
        val vehicles = VehicleRepository(dir.resolve("vehicles.db"))
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Merge Transport AS", "123456789"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(null, AgreementInput(supplier.id, "2026-01-01", "2026-12-31", 5, saksnr = "2026/1"), null, actor, Instant.now())
        // Each old file has its own repository tables and no keys across files, as before the merge.
        connect(dir.resolve("users.db")).use { db ->
            createUserTables(db)
            db.createStatement().use {
                it.executeUpdate("INSERT INTO users (id, name, email, password_hash, role, supplier_id) VALUES ('u-admin', 'Admin', 'admin@example.com', 'x', 'ADMIN', NULL)")
                it.executeUpdate("INSERT INTO users (id, name, email, password_hash, role, supplier_id) VALUES ('u-sup', 'Supplier', 'sup@example.com', 'x', 'SUPPLIER', '${if (orphanUser) "missing-supplier" else supplier.id}')")
            }
        }
        CertificateRepository(dir.resolve("certificates.db"))
        connect(dir.resolve("certificates.db")).use {
            it.createStatement().use { s ->
                s.executeUpdate("INSERT INTO certificates (id, supplier_name, certificate_type, source_file, contract_id) VALUES ('c1', 'Merge Transport AS', 'EURO6', 'c.pdf', '${agreement.id}')")
            }
        }
        AdminInsightsRepository(dir.resolve("admin-insights.db"))
        connect(dir.resolve("admin-insights.db")).use {
            it.createStatement().use { s ->
                s.executeUpdate("INSERT INTO admin_alerts (id, title, description, severity, status, supplier_id, category, finding_type, source, created_at) VALUES ('a1', 't', 'd', 'low', 'OPEN', '${supplier.id}', 'c', 'f', 'MANUAL', '2026-01-01')")
                s.executeUpdate("INSERT INTO supplier_notes (id, supplier_id, author_id, author_name, visibility, text, alert_id, created_at) VALUES ('n1', '${supplier.id}', 'u-admin', 'Admin', 'INTERNAL', 'hello', 'a1', '2026-01-01')")
            }
        }
        return Legacy(dir, supplier.id, agreement.id)
    }

    private fun count(db: Connection, table: String) =
        db.createStatement().use { it.executeQuery("SELECT count(*) FROM $table").use { rows -> rows.next(); rows.getInt(1) } }

    private fun referencedTables(db: Connection, table: String) =
        db.createStatement().use { it.executeQuery("PRAGMA foreign_key_list($table)").use { rows -> buildSet { while (rows.next()) add(rows.getString("table")) } } }

    @Test
    fun mergesTheFourOldFilesIntoOneWithEnforcedLinks() {
        val old = legacy()
        LegacyDatabaseMerge.run(old.target, old.files)

        assertTrue(Files.exists(old.target))
        old.files.all.forEach {
            assertFalse(Files.exists(it), "$it should have been renamed")
            assertTrue(Files.exists(it.resolveSibling(it.fileName.toString() + ".pre-merge")), "$it backup is missing")
        }
        assertFalse(Files.exists(old.target.resolveSibling("app.db.tmp")))
        connect(old.target).use { db ->
            assertEquals(1, count(db, "suppliers")); assertEquals(1, count(db, "agreements"))
            assertEquals(2, count(db, "users")); assertEquals(1, count(db, "certificates"))
            assertEquals(1, count(db, "admin_alerts")); assertEquals(1, count(db, "supplier_notes"))
            // Links the old files could only hold as plain text are real keys now.
            assertEquals(setOf("suppliers"), referencedTables(db, "users"))
            assertEquals(setOf("agreements"), referencedTables(db, "certificates"))
            assertEquals(setOf("suppliers", "users", "admin_alerts"), referencedTables(db, "supplier_notes"))
            val rejected = assertFailsWith<SQLException> {
                db.createStatement().use { it.executeUpdate("INSERT INTO users (id, name, email, password_hash, role, supplier_id) VALUES ('u3', 'X', 'x@example.com', 'x', 'SUPPLIER', 'no-such-supplier')") }
            }
            assertTrue(rejected.message.orEmpty().contains("FOREIGN KEY"), rejected.message)
        }
    }

    @Test
    fun usersOfAnAlreadyArchivedSupplierComeOutBlocked() {
        val old = legacy()
        val fleet = VehicleRepository(old.files.vehicles).fleet
        fleet.removeSupplier(old.supplierId, fleet.overview().suppliers.single().updatedAt!!, actor, Instant.now())
        LegacyDatabaseMerge.run(old.target, old.files)
        connect(old.target).use { db ->
            fun access(id: String) = db.createStatement().use { it.executeQuery("SELECT access_expires_at FROM users WHERE id = '$id'").use { rows -> rows.next(); rows.getString(1) } }
            assertTrue(access("u-sup") != null, "the archived supplier's user must stay blocked after the merge")
            assertEquals(null, access("u-admin"))
        }
    }

    @Test
    fun aDanglingLinkStopsTheMergeAndLeavesEverythingAsItWas() {
        val old = legacy(orphanUser = true)
        val failure = assertFailsWith<IllegalStateException> { LegacyDatabaseMerge.run(old.target, old.files) }
        assertTrue(failure.message.orEmpty().contains("users"), failure.message)
        assertFalse(Files.exists(old.target))
        assertFalse(Files.exists(old.target.resolveSibling("app.db.tmp")))
        old.files.all.forEach { assertTrue(Files.exists(it), "$it must be untouched") }
    }

    @Test
    fun namesCopiedBeforeARenameAreBroughtUpToDateByTheMerge() {
        val old = legacy()
        val fleet = VehicleRepository(old.files.vehicles).fleet
        val supplier = fleet.overview().suppliers.single()
        fleet.saveSupplier(supplier.id, SupplierInput("Renamed Transport AS", supplier.orgNumber), actor, Instant.now(), supplier.updatedAt)
        LegacyDatabaseMerge.run(old.target, old.files)
        connect(old.target).use { db ->
            assertEquals("Renamed Transport AS", db.createStatement().use { it.executeQuery("SELECT supplier_name FROM certificates WHERE id = 'c1'").use { rows -> rows.next(); rows.getString(1) } })
        }
    }

    @Test
    fun anOldVehicleFileTheAppCannotUpgradeIsNamedInTheError() {
        val dir = Files.createTempDirectory(Path.of("build").also { Files.createDirectories(it) }, "oldschema")
        connect(dir.resolve("vehicles.db")).use { db ->
            db.createStatement().use { it.execute("CREATE TABLE suppliers (id TEXT)"); it.execute("PRAGMA user_version = 6") }
        }
        val files = LegacyDatabaseMerge.LegacyFiles(dir.resolve("vehicles.db"), dir.resolve("users.db"), dir.resolve("certificates.db"), dir.resolve("admin-insights.db"))
        val failure = assertFailsWith<IllegalStateException> { LegacyDatabaseMerge.run(dir.resolve("app.db"), files) }
        assertTrue(failure.message.orEmpty().contains("vehicles.db") && failure.message.orEmpty().contains("version 6"), failure.message)
        assertFalse(failure.message.orEmpty().contains("app.db.tmp"), "must not send the reader to the temporary file: ${failure.message}")
        assertTrue(Files.exists(files.vehicles), "the old file is untouched")
        assertFalse(Files.exists(dir.resolve("app.db")))
    }

    @Test
    fun aFinishedMergeIsNotRepeatedButLeftoverOldFilesAreRetired() {
        val old = legacy()
        LegacyDatabaseMerge.run(old.target, old.files)
        // Simulate a crash between the move and the rename: the old users file is back next to the merged one.
        Files.copy(old.files.users.resolveSibling("users.db.pre-merge"), old.files.users)
        LegacyDatabaseMerge.run(old.target, old.files)
        assertFalse(Files.exists(old.files.users))
        connect(old.target).use { assertEquals(2, count(it, "users")) }
    }

    @Test
    fun aFileThatIsNotAMergeResultIsNeverTouched() {
        val dir = Files.createTempDirectory(Path.of("build").also { Files.createDirectories(it) }, "fresh")
        val target = dir.resolve("app.db")
        VehicleRepository(target)
        val strayUsers = Files.writeString(dir.resolve("users.db"), "not merged")
        LegacyDatabaseMerge.run(target, LegacyDatabaseMerge.LegacyFiles(dir.resolve("vehicles.db"), strayUsers, dir.resolve("certificates.db"), dir.resolve("admin-insights.db")))
        assertTrue(Files.exists(strayUsers))
    }

    @Test
    fun aFreshInstallLinksEveryRepositoryToTheVehicleTables() {
        val dir = Files.createTempDirectory(Path.of("build").also { Files.createDirectories(it) }, "install")
        val file = dir.resolve("app.db")
        VehicleRepository(file) // the vehicle schema must come first, as in Application
        connect(file).use { createUserTables(it) }
        CertificateRepository(file)
        AdminInsightsRepository(file)
        connect(file).use { db ->
            assertEquals(setOf("suppliers"), referencedTables(db, "users"))
            assertEquals(setOf("agreements"), referencedTables(db, "certificates"))
            assertEquals(setOf("suppliers"), referencedTables(db, "admin_alerts"))
            assertEquals(setOf("users", "admin_alerts"), referencedTables(db, "notifications"))
        }
    }

    @Test
    fun eachRepositoryOnItsOwnFileGetsNoKeys() {
        val dir = Files.createTempDirectory(Path.of("build").also { Files.createDirectories(it) }, "alone")
        CertificateRepository(dir.resolve("certificates.db"))
        connect(dir.resolve("certificates.db")).use { assertEquals(emptySet(), referencedTables(it, "certificates")) }
    }
}
