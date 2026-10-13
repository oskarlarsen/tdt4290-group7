package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import java.nio.file.Path
import java.sql.DriverManager
import java.sql.SQLException
import java.time.Instant
import java.util.UUID
import kotlin.test.*

class VehicleInputRulesTest {
    private val now = Instant.parse("2026-01-01T00:00:00Z")
    private fun path() = Path.of("build", "test-data", "rules-${UUID.randomUUID()}.db")

    @Test
    fun electricAndHydrogenRequireFixedZeroEmissionValues() {
        val repository = VehicleRepository(path())
        for (fuel in listOf(FuelTechnology.ELECTRIC, FuelTechnology.HYDROGEN)) {
            val valid = syntheticTrip(fuelTechnology = fuel)
            repository.appendTripRows(AppendTripRowsRequest(rows = listOf(valid)), now)
            for (invalid in listOf(valid.copy(co2Registered = true), valid.copy(co2GramsPerKm = BigDecimal.ONE),
                valid.copy(medianCo2 = BigDecimal.ONE), valid.copy(totalNoxRegisteredGrams = BigDecimal.ONE)))
                assertFailsWith<IllegalArgumentException> { repository.appendTripRows(AppendTripRowsRequest(rows = listOf(invalid)), now) }
        }
    }

    @Test
    fun simplifiedGroupsPreserveOriginalRegistryCodes() {
        assertEquals(setOf("12"), fuelGroups("16")); assertEquals(setOf("12"), fuelGroups("17"))
        assertEquals(setOf("13"), fuelGroups("18")); assertEquals(setOf("13"), fuelGroups("19"))
        assertEquals(setOf("13", "21"), fuelGroups("22"))
        assertEquals("N3", categoryGroup("N3G")); assertEquals("O1", categoryGroup("O1"))
        assertEquals("N3G", categoryCode("N3G").code)
        assertEquals("22", fuelCode("22").code)
        assertEquals("Ethanol", fuelCode("15").name)
    }

    @Test
    fun versionThreeIsRebuiltOnlyWhenEveryTableIsEmpty() {
        val emptyPath = path()
        VehicleRepository(emptyPath)
        fun markVersionThree(path: Path) = DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { db ->
            db.createStatement().use { it.execute("PRAGMA user_version=3") }
        }
        markVersionThree(emptyPath)
        VehicleRepository(emptyPath)
        DriverManager.getConnection("jdbc:sqlite:${emptyPath.toAbsolutePath()}").use { db ->
            db.createStatement().use { it.executeQuery("PRAGMA user_version").use { rows -> rows.next(); assertEquals(4, rows.getInt(1)) } }
        }
        val populatedPath = path()
        val repository = VehicleRepository(populatedPath)
        repository.appendTripRows(AppendTripRowsRequest(rows = listOf(syntheticTrip())), now)
        markVersionThree(populatedPath)
        assertFailsWith<IllegalStateException> { VehicleRepository(populatedPath) }
        assertEquals(1, repository.tripRowsForVehicle("AB12345").size)
        // Empty vehicles are not enough: a supplier-only database must also be preserved.
        val supplierPath = path()
        VehicleRepository(supplierPath)
        DriverManager.getConnection("jdbc:sqlite:${supplierPath.toAbsolutePath()}").use { db ->
            db.createStatement().use { it.execute("INSERT INTO suppliers VALUES('synthetic','Synthetic','2026-01-01T00:00:00Z')") }
        }
        markVersionThree(supplierPath)
        assertFailsWith<IllegalStateException> { VehicleRepository(supplierPath) }
    }

    @Test
    fun ordinaryPlateRulesAcceptFourAndFiveDigitsWithoutGuessing() {
        val repository = VehicleRepository(path())
        assertEquals("AB1234", repository.findOrCreateVehicle(" ab-1234 ", now).registrationNumber)
        assertEquals("AB12345", repository.findOrCreateVehicle("ab 12345", now).registrationNumber)
        for (plate in listOf("TEST01", "A12345", "ABC12345", "AB01234", "AB123", "AB123456", "AB1234O", "AB/12345", "ÆB12345"))
            assertFailsWith<IllegalArgumentException>(plate) { repository.findOrCreateVehicle(plate, now) }
    }

    @Test
    fun allFuelCodesRoundTripWithConditionalLitresAndExplicitZeros() {
        val repository = VehicleRepository(path())
        for (fuel in FuelTechnology.entries) {
            val input = syntheticTrip(fuelTechnology = fuel,
                vehicleCategory = if (fuel == FuelTechnology.NOT_APPLICABLE) VehicleCategory.O1 else VehicleCategory.M1)
            val row = repository.appendTripRows(AppendTripRowsRequest(rows = listOf(input)), now).rows.single()
            assertEquals(input, repository.tripRowsForVehicle("AB12345").first { it.id == row.id }.data)
            assertEquals(BigDecimal.ZERO, row.data.totalNoxRegisteredGrams)
            val bad = if (fuel.usesLitres) input.copy(fuelConsumedLitres = null)
                else input.copy(fuelConsumedLitres = BigDecimal.ZERO)
            assertFailsWith<IllegalArgumentException> { repository.appendTripRows(AppendTripRowsRequest(rows = listOf(bad)), now) }
        }
        assertFailsWith<IllegalArgumentException> {
            repository.appendTripRows(AppendTripRowsRequest(rows = listOf(syntheticTrip(make = "   "))), now)
        }
    }

    @Test
    fun trailerFuelSentinelIsRequiredAndCannotBeUsedForPoweredVehicles() {
        val repository = VehicleRepository(path())
        for (category in VehicleCategory.entries) {
            val fuel = if (category.isTrailer) FuelTechnology.NOT_APPLICABLE else FuelTechnology.DIESEL
            repository.upsertApprovals(UpsertApprovalsRequest(approvals = listOf(syntheticApproval(
                fuelTechnology = fuel, vehicleCategory = category))), now)
            val wrong = if (category.isTrailer) FuelTechnology.DIESEL else FuelTechnology.NOT_APPLICABLE
            assertFailsWith<IllegalArgumentException> {
                repository.upsertApprovals(UpsertApprovalsRequest(approvals = listOf(syntheticApproval(
                    fuelTechnology = wrong, vehicleCategory = category))), now)
            }
        }
    }

    @Test
    fun databaseConstraintsCannotBeBypassedByDirectSql() {
        val path = path()
        val repository = VehicleRepository(path)
        repository.appendTripRows(AppendTripRowsRequest(rows = listOf(syntheticTrip())), now)
        DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { db ->
            db.createStatement().use { it.execute("PRAGMA foreign_keys=ON") }
            val columns = db.createStatement().use { it.executeQuery("PRAGMA table_info(trip_rows)").use { rows ->
                buildList { while (rows.next()) add(rows.getString("name")) }
            } }
            fun clone(overrides: Map<String, String>) {
                val selection = columns.joinToString(",") { if (it == "id") "'${UUID.randomUUID()}'" else overrides[it] ?: it }
                db.createStatement().use { it.executeUpdate("INSERT INTO trip_rows SELECT $selection FROM trip_rows LIMIT 1") }
            }
            val invalid = listOf(
                "fuel_technology" to "'999'", "fuel_technology" to "'Diesel'", "vehicle_category" to "'light'",
                "body_type" to "'Station wagon'", "make" to "''", "model" to "'   '", "co2_registered" to "2",
                "co2_registered" to "NULL", "trip_count" to "NULL", "trip_count" to "'bad'", "trip_count" to "2147483648",
                "total_trip_km_unscaled" to "NULL", "total_trip_km_unscaled" to "-1", "total_trip_km_scale" to "19",
                "fuel_consumed_litres_unscaled" to "NULL", "period_start" to "'2026-02-30'",
                "period_end" to "'2025-12-31'", "registration_number" to "'CD12345'",
            )
            for ((column, value) in invalid) assertFailsWith<SQLException>(column) { clone(mapOf(column to value)) }
            // Reject a mismatched decimal pair even when litres are inapplicable.
            assertFailsWith<SQLException> { clone(mapOf("fuel_technology" to "'5'", "fuel_consumed_litres_unscaled" to "NULL",
                "average_consumption_litres_per_km_unscaled" to "NULL")) }
            for (fuel in listOf("5", "6")) assertFailsWith<SQLException> { clone(mapOf("fuel_technology" to "'$fuel'")) }
            for (plate in listOf("TEST01", "AB01234", "AB123456")) assertFailsWith<SQLException> {
                db.createStatement().use { it.executeUpdate("INSERT INTO vehicles(registration_number,created_at) VALUES('$plate','2026-01-01T00:00:00Z')") }
            }
        }
    }

    @Test
    fun versionTwoIsRefusedWithoutReinterpretingOrDeletingRecords() {
        val path = path()
        java.nio.file.Files.createDirectories(path.parent)
        DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { db ->
            db.createStatement().use {
                it.execute("CREATE TABLE vehicles(registration_number TEXT PRIMARY KEY)")
                it.execute("INSERT INTO vehicles VALUES('TEST01')")
                it.execute("PRAGMA user_version=2")
            }
        }
        assertFailsWith<IllegalStateException> { VehicleRepository(path) }
        DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { db ->
            db.createStatement().use { it.executeQuery("SELECT registration_number FROM vehicles").use { rows ->
                assertTrue(rows.next()); assertEquals("TEST01", rows.getString(1)); assertFalse(rows.next())
            } }
            db.createStatement().use { it.executeQuery("PRAGMA user_version").use { rows -> rows.next(); assertEquals(2, rows.getInt(1)) } }
        }
    }
}
