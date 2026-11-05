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
    fun electricAndHydrogenRequireNullEmissionValuesAndDistances() {
        val repository = VehicleRepository(path())
        for (fuel in listOf(FuelTechnology.ELECTRIC, FuelTechnology.HYDROGEN)) {
            val valid = syntheticTrip(fuelTechnology = fuel)
            val saved = repository.appendTripRows(AppendTripRowsRequest(rows = listOf(valid)), now).rows.single()
            assertNull(saved.estimatedCo2Kg)
            assertEquals(valid, repository.tripRowsForVehicle("AB12345").first { it.id == saved.id }.data)
            for (invalid in listOf(valid.copy(co2Registered = true), valid.copy(co2GramsPerKm = BigDecimal.ONE),
                valid.copy(totalNoxRegisteredGrams = BigDecimal.ONE),
                valid.copy(totalKmCo2Registered = BigDecimal.ZERO), valid.copy(totalKmNoxRegistered = BigDecimal.ZERO)))
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
            assertEquals(if (fuel.emissionsNotApplicable) null else BigDecimal.ZERO, row.data.totalNoxRegisteredGrams)
            val bad = if (fuel.usesLitres) input.copy(fuelConsumedLitres = null)
                else input.copy(fuelConsumedLitres = BigDecimal.ZERO)
            assertFailsWith<IllegalArgumentException> { repository.appendTripRows(AppendTripRowsRequest(rows = listOf(bad)), now) }
        }
        assertFailsWith<IllegalArgumentException> {
            repository.appendTripRows(AppendTripRowsRequest(rows = listOf(syntheticTrip(make = "   "))), now)
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
                "co2_registered" to "NULL",
                "total_trip_km_unscaled" to "NULL", "total_trip_km_unscaled" to "-1", "total_trip_km_scale" to "19",
                "fuel_consumed_litres_unscaled" to "NULL", "period_start" to "'2026-02-30'",
                "period_end" to "'2025-12-31'", "registration_number" to "'CD12345'",
            )
            for ((column, value) in invalid) assertFailsWith<SQLException>(column) { clone(mapOf(column to value)) }
            // Applicable numeric zero and inapplicable null cannot be interchanged through SQL.
            for (column in inapplicableEmissionColumns) assertFailsWith<SQLException>(column) {
                clone(mapOf("${column}_unscaled" to "NULL", "${column}_scale" to "NULL"))
            }
            val electric = buildMap {
                put("fuel_technology", "'5'"); put("co2_registered", "0")
                for (column in inapplicableEmissionColumns + setOf("fuel_consumed_litres", "average_fuel_consumption_litres_per_100_km")) {
                    put("${column}_unscaled", "NULL"); put("${column}_scale", "NULL")
                }
            }
            clone(electric)
            for (column in inapplicableEmissionColumns) assertFailsWith<SQLException>(column) {
                clone(electric + mapOf("${column}_unscaled" to "0", "${column}_scale" to "0"))
            }
            // Reject a mismatched decimal pair even when litres are inapplicable.
            assertFailsWith<SQLException> { clone(mapOf("fuel_technology" to "'5'", "fuel_consumed_litres_unscaled" to "NULL",
                "average_fuel_consumption_litres_per_100_km_unscaled" to "NULL")) }
            for (fuel in listOf("5", "6")) assertFailsWith<SQLException> { clone(mapOf("fuel_technology" to "'$fuel'")) }
            for (plate in listOf("TEST01", "AB01234", "AB123456")) assertFailsWith<SQLException> {
                db.createStatement().use { it.executeUpdate("INSERT INTO vehicles(registration_number,created_at) VALUES('$plate','2026-01-01T00:00:00Z')") }
            }
        }
    }

    @Test
    fun incompatibleSchemasRequireAnExplicitResetWithoutChangingRecords() {
        for (version in listOf(2, 7, 11)) {
            val path = path()
            java.nio.file.Files.createDirectories(path.parent)
            DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { db ->
                db.createStatement().use {
                    it.execute("CREATE TABLE vehicles(registration_number TEXT PRIMARY KEY)")
                    it.execute("INSERT INTO vehicles VALUES('TEST01')")
                    it.execute("PRAGMA user_version=$version")
                }
            }
            val error = assertFailsWith<IllegalStateException> { VehicleRepository(path) }
            assertTrue(error.message!!.contains("reset-vehicle-data.ps1"))
            DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { db ->
                db.createStatement().use { it.executeQuery("SELECT registration_number FROM vehicles").use { rows ->
                    assertTrue(rows.next()); assertEquals("TEST01", rows.getString(1)); assertFalse(rows.next())
                } }
                db.createStatement().use { it.executeQuery("PRAGMA user_version").use { rows ->
                    rows.next(); assertEquals(version, rows.getInt(1))
                } }
            }
        }
    }

    @Test
    fun versionTenDatabaseOpensAndKeepsItsVersion() {
        val path = path()
        VehicleRepository(path)
        DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { db ->
            db.createStatement().use { it.execute("PRAGMA user_version=10") }
        }
        VehicleRepository(path)
        DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { db ->
            db.createStatement().use { it.executeQuery("PRAGMA user_version").use { rows ->
                rows.next(); assertEquals(10, rows.getInt(1))
            } }
        }
    }



}
