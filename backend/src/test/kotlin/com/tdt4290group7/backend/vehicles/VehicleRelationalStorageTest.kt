package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class VehicleRelationalStorageTest {
    private val now = Instant.parse("2026-01-01T00:00:00Z")

    @Test
    fun tablesAreStrictExplicitAndPlateIsTheVehiclePrimaryKey() {
        val path = path()
        VehicleRepository(path)
        connection(path).use { db ->
            db.createStatement().use { statement ->
                statement.executeQuery("PRAGMA table_list").use { rows ->
                    var vehicleTableCount = 0
                    while (rows.next()) {
                        val name = rows.getString("name")
                        if (!name.startsWith("sqlite_")) assertEquals(1, rows.getInt("strict"))
                        if (!name.startsWith("sqlite_") && name !in setOf(
                                "supplier_onboarding",
                                "upload_batches",
                                "facility_energy",
                                "contract_products",
                                "vehicle_contract_details"
                            )) {
                            vehicleTableCount++
                        }
                    }
                    assertEquals(14, vehicleTableCount)
                }
                statement.executeQuery("PRAGMA table_info(vehicles)").use { rows ->
                    val names = mutableListOf<String>()
                    while (rows.next()) {
                        names += rows.getString("name")
                        if (rows.getString("name") == "registration_number") assertEquals(1, rows.getInt("pk"))
                    }
                    assertEquals(listOf("registration_number", "agreement_id", "planned", "listed", "created_at", "updated_at"), names)
                }
                statement.executeQuery("SELECT sql FROM sqlite_schema WHERE type = 'table'").use { rows ->
                    while (rows.next()) {
                        val ddl = rows.getString("sql")
                        for (removed in listOf("median_co2_unscaled", "data_json", "assignment_number", "used_throughout_period", "average_consumption_litres_per_km"))
                            assertTrue(removed !in ddl, "Removed column must not exist: $removed")
                    }
                }
            }
        }
    }

    @Test
    fun decimalsAndAllSupplierFieldsRoundTripAndEstimateUsesOnlySupplierValues() {
        val repository = VehicleRepository(path())
        val input = syntheticTrip("ab-12345", "2026-01-01", "2026-01-31", FuelTechnology.DIESEL,
            "Make", BodyType.AA, "Model", true, BigDecimal("123.456789"),
            BigDecimal("1000"), BigDecimal("900"), BigDecimal("100"), BigDecimal("50"),
            BigDecimal("950"), BigDecimal("800"), BigDecimal("12.345"),
            BigDecimal("12.3456"), BigDecimal("123.456"), "Synthetic comment")
        val stored = repository.appendTripRows(AppendTripRowsRequest("source", listOf(input)), now).rows.single()
        val loaded = repository.tripRowsForVehicle("AB12345").single()
        assertEquals(stored, loaded)
        assertEquals(input.copy(registrationNumber = "AB12345"), loaded.data)
        assertEquals(BigDecimal("123.456789"), loaded.estimatedCo2Kg)
        val missing = syntheticTrip("AB12345", "2026-02-01", "2026-02-28", co2Registered = false)
        val absent = repository.appendTripRows(AppendTripRowsRequest(rows = listOf(missing)), now).rows.single()
        assertEquals(BigDecimal.ZERO, absent.estimatedCo2Kg) // Explicit zero is reported, never inferred.
    }

    @Test
    fun inputValidationIsAtomicAndRejectsDatesNegativeValuesAndNumericOverflow() {
        val repository = VehicleRepository(path())
        val valid = syntheticTrip("AB12345", "2026-01-01", "2026-01-31")
        val invalid = listOf(
            valid.copy(periodStart = "2026-1-01"), valid.copy(periodEnd = "2026-02-30"),
            valid.copy(periodEnd = "2025-12-31"), valid.copy(totalTripKm = BigDecimal("-1")),
            valid.copy(co2GramsPerKm = BigDecimal("0.0000000000000000001")),
            valid.copy(totalTripKm = BigDecimal("9223372036854775808")),
        )
        invalid.forEach {
            assertFailsWith<IllegalArgumentException> {
                repository.appendTripRows(AppendTripRowsRequest(rows = listOf(valid, it)), now)
            }
        }
        assertTrue(repository.tripRowsForVehicle("AB12345").isEmpty())
    }


    @Test
    fun historicalLinksRejectOtherVehiclesAndRollbackTheWholeCheck() = runBlocking<Unit> {
        val path = path()
        val repository = VehicleRepository(path)
        val rows = repository.appendTripRows(AppendTripRowsRequest(rows = listOf(
            syntheticTrip("AB12345", "2026-01-01", "2026-01-31"),
            syntheticTrip("CD12345", "2026-01-01", "2026-01-31"),
        )), now).rows
        val original = VehicleCheckService(repository, null).check(VehicleCheckRequest("AB12345"))
        val wrongId = UUID.randomUUID().toString()
        assertFailsWith<SQLException> {
            repository.saveCheck(original.copy(id = wrongId, tripRows = listOf(rows.last())), null)
        }
        assertNull(repository.findCheck(wrongId))
        assertFailsWith<SQLException> {
            repository.saveCheck(original.copy(id = UUID.randomUUID().toString(), findings = original.findings.mapIndexed { index, finding ->
                if (index == 0) finding.copy(tripRowId = rows.last().id) else finding
            }), null)
        }
        assertNotNull(repository.findCheck(original.id))
        connection(path).use { db ->
            assertFailsWith<SQLException> {
                db.prepareStatement("INSERT INTO vehicle_check_deviations(check_id,deviation_code,priority,origin,description,ordinal) VALUES(?, 'FUEL_MISMATCH', 'INVALID', 'STATISTICS', 'Synthetic', 999)").use {
                    it.setString(1, original.id); it.executeUpdate()
                }
            }
            assertFailsWith<SQLException> {
                db.createStatement().use { it.executeUpdate("UPDATE trip_rows SET comment = 'changed'") }
            }
            assertFailsWith<SQLException> {
                db.prepareStatement("DELETE FROM trip_rows WHERE id = ?").use {
                    it.setString(1, rows.first().id); it.executeUpdate()
                }
            }
        }
    }


    @Test
    fun legacySchemaIsRefusedWithoutAlteringOrReadingItsRecords() {
        val path = path()
        java.nio.file.Files.createDirectories(path.parent)
        connection(path).use { db ->
            db.createStatement().use { it.executeUpdate("CREATE TABLE vehicles(id TEXT PRIMARY KEY)") }
        }
        assertFailsWith<IllegalStateException> { VehicleRepository(path) }
        connection(path).use { db ->
            db.createStatement().use { statement ->
                statement.executeQuery("SELECT name FROM pragma_table_info('vehicles')").use {
                    assertTrue(it.next()); assertEquals("id", it.getString(1)); assertTrue(!it.next())
                }
            }
        }
    }

    private fun path() = Path.of("build", "test-data", UUID.randomUUID().toString() + ".db")
    private fun connection(path: Path): Connection = DriverManager.getConnection("jdbc:sqlite:" + path.toAbsolutePath()).also {
        it.createStatement().use { statement -> statement.execute("PRAGMA foreign_keys = ON") }
    }
}
