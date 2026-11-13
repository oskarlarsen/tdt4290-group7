package com.tdt4290group7.backend.onboarding

import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.LookupOutcome
import com.tdt4290group7.backend.vehicles.RegistryCode
import com.tdt4290group7.backend.vehicles.RegistryFuel
import com.tdt4290group7.backend.vehicles.RegistryLookup
import com.tdt4290group7.backend.vehicles.RegistryVehicleData
import com.tdt4290group7.backend.vehicles.VehicleRegistryClient
import com.tdt4290group7.backend.vehicles.VehicleRegistryLookup
import com.tdt4290group7.backend.vehicles.VehicleRepository
import java.nio.file.Path
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking

class VehicleRegistryFillTest {
    private fun data(vararg codes: String, plate: String = "AB12345", category: String? = null) =
        RegistryVehicleData(plate, vehicleCategory = category?.let { RegistryCode(it) }, fuels = codes.map { RegistryFuel(RegistryCode(it)) })

    @Test
    fun approvedPlatesAreFilledFromTheListWithoutAnyRegistryCall() = runBlocking {
        val rows = listOf(mapOf("registration_number" to "AB12345", "fuel_technology" to ""))
        val result = VehicleRegistryFill.fillFromRegistry(rows, null, Instant.now(), mapOf("AB12345" to FilledFuel("2", false)))
        assertTrue(result.errors.isEmpty())
        assertEquals("2", result.rows.single()["fuel_technology"])
    }

    @Test
    fun fuelAndHybridComeFromTheFuelsTheRegistryLists() {
        assertEquals(FilledFuel("2", false), VehicleRegistryFill.fuelFrom(data("2")))
        assertEquals(FilledFuel("5", false), VehicleRegistryFill.fuelFrom(data("5")))
        assertEquals(FilledFuel("8", true), VehicleRegistryFill.fuelFrom(data("8")))
        // A plug-in hybrid lists a combustion fuel and electricity: hybrid, with the combustion fuel as its fuel.
        assertEquals(FilledFuel("2", true), VehicleRegistryFill.fuelFrom(data("5", "2")))
        assertNull(VehicleRegistryFill.fuelFrom(data()))
        assertNull(VehicleRegistryFill.fuelFrom(data("99")))
    }

    private val header = "agreement_id,registration_number,is_planned,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n"

    private fun fixture(lookups: MutableList<String>, answer: (String) -> RegistryLookup): Triple<VehicleRepository, String, VehicleRegistryLookup> {
        val repo = VehicleRepository(Path.of("build", "test-data", "fill-${UUID.randomUUID()}.db"))
        val now = Instant.now()
        repo.database.write { db ->
            repo.database.insert(db, "suppliers", mapOf("id" to "nordvik", "name" to "Nordvik AS", "org_number" to "987654321", "updated_at" to now.toString(), "active" to 1))
        }
        val agreement = repo.fleet.saveAgreement(
            null, AgreementInput("nordvik", "2026-01-01", "2027-12-31", 100, "Skolerute", saksnr = "2024/1"), null, ChangeActor("a", "Admin"), now,
        )
        val lookup = VehicleRegistryLookup(VehicleRegistryClient { plate -> lookups += plate; answer(plate) })
        return Triple(repo, agreement.id, lookup)
    }

    private fun preview(repo: VehicleRepository, registry: VehicleRegistryLookup?, csv: String) = runBlocking {
        repo.onboarding.createBatchPreview("nordvik", BatchEntityType.VEHICLES, "v.csv", csv.toByteArray(), Instant.now(), registry)
    }

    @Test
    fun aFileWithoutFuelColumnsIsFilledFromTheRegistry() {
        val lookups = mutableListOf<String>()
        val (repo, agreement, registry) = fixture(lookups) { plate ->
            RegistryLookup.Found(if (plate == "AB12345") data("2", plate = plate, category = "N2") else data("5", "2", plate = plate, category = "ZZ"))
        }
        val preview = preview(repo, registry, header + "$agreement,AB12345,FALSE,TRUE,,,,\n$agreement,CD12346,FALSE,TRUE,,,,")

        assertTrue(preview.canCommit, preview.errors.toString())
        assertEquals(listOf("2", "2"), preview.previewRows.map { it["fuel_technology"] })
        assertEquals(listOf("FALSE", "TRUE"), preview.previewRows.map { it["is_hybrid"] })
        assertEquals(listOf("FILLED", "FILLED"), preview.previewRows.map { it["registry_status"] })
        // Confirming stores the filled values.
        repo.onboarding.confirmBatch(preview.batchId, "nordvik", Instant.now())
        val stored = repo.onboarding.getSupplierVehicles("nordvik")
        assertEquals(setOf("2"), stored.map { it.fuelTechnology }.toSet())
        assertEquals(setOf(false, true), stored.map { it.isHybrid }.toSet())
        // The weight class comes along when it is a category this app knows; an unknown one is dropped, not guessed.
        assertEquals(mapOf("AB12345" to "N2", "CD12346" to null), stored.associate { it.registrationNumber to it.vehicleCategory })
    }

    @Test
    fun suppliedFuelIsKept() {
        val lookups = mutableListOf<String>()
        val (repo, agreement, registry) = fixture(lookups) { RegistryLookup.Found(data("2", plate = it)) }
        val oldHeader = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n"
        val preview = preview(repo, registry, oldHeader + "$agreement,AB12345,FALSE,13,FALSE,TRUE,,,,\n$agreement,CD12346,FALSE,8,,TRUE,,,,")

        assertTrue(preview.canCommit, preview.errors.toString())
        assertEquals(listOf("AB12345", "CD12346"), lookups) // still checked, to catch a wrong plate
        assertEquals(listOf("PROVIDED", "PROVIDED"), preview.previewRows.map { it["registry_status"] })
        // A blank hybrid flag is worked out from the fuel the supplier chose.
        assertEquals(listOf("FALSE", "TRUE"), preview.previewRows.map { it["is_hybrid"] })
    }

    @Test
    fun platesNotCheckedAtPreviewAreCheckedAfterConfirmAndAWrongPlateIsShownToTheSupplier() = runBlocking {
        var answer: RegistryLookup = RegistryLookup.Failed(LookupOutcome.TEMPORARILY_UNAVAILABLE)
        val (repo, agreement, registry) = fixture(mutableListOf()) { answer }
        val csv = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n$agreement,AB12345,FALSE,2,FALSE,TRUE,,,,"
        val preview = preview(repo, registry, csv)
        assertTrue(preview.canCommit, preview.errors.toString())
        assertEquals(listOf("AB12345"), repo.onboarding.unverifiedPlates(preview.batchId))
        repo.onboarding.confirmBatch(preview.batchId, "nordvik", Instant.now())
        answer = RegistryLookup.Failed(LookupOutcome.NOT_FOUND)
        repo.onboarding.verifyAfterUpload(listOf("AB12345"), registry)
        assertEquals("NOT_FOUND", repo.onboarding.getSupplierVehicles("nordvik").single().registryProblem)
    }

    @Test
    fun aRegistryOutageDoesNotBlockBlankFuelRowsAndTheFuelIsFilledInAfterwards() = runBlocking {
        var answer: RegistryLookup = RegistryLookup.Failed(LookupOutcome.TEMPORARILY_UNAVAILABLE)
        val (repo, agreement, registry) = fixture(mutableListOf()) { answer }
        val preview = preview(repo, registry, header + "$agreement,AB12345,FALSE,TRUE,,,,")
        assertTrue(preview.canCommit, preview.errors.toString())
        repo.onboarding.confirmBatch(preview.batchId, "nordvik", Instant.now())
        assertEquals("", repo.onboarding.getSupplierVehicles("nordvik").single().fuelTechnology)
        // Reporting the same plate again during an outage keeps what is stored.
        val again = preview(repo, registry, header + "$agreement,AB12345,FALSE,TRUE,,,,")
        repo.onboarding.confirmBatch(again.batchId, "nordvik", Instant.now())
        answer = RegistryLookup.Found(data("2"))
        repo.onboarding.verifyAfterUpload(listOf("AB12345"), registry)
        assertEquals("2", repo.onboarding.getSupplierVehicles("nordvik").single().fuelTechnology)
        // Once filled in, a later outage upload does not wipe it.
        answer = RegistryLookup.Failed(LookupOutcome.TEMPORARILY_UNAVAILABLE)
        val third = preview(repo, registry, header + "$agreement,AB12345,FALSE,TRUE,,,,")
        repo.onboarding.confirmBatch(third.batchId, "nordvik", Instant.now())
        assertEquals("2", repo.onboarding.getSupplierVehicles("nordvik").single().fuelTechnology)
    }

    @Test
    fun aPlateUnknownToTheRegistryIsAnErrorEvenWhenTheFuelIsGiven() {
        val (repo, agreement, registry) = fixture(mutableListOf()) { RegistryLookup.Failed(LookupOutcome.NOT_FOUND) }
        val header = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n"
        val preview = preview(repo, registry, header + "$agreement,AB12345,FALSE,13,FALSE,TRUE,,,,")
        assertFalse(preview.canCommit)
        assertTrue(preview.errors.single().message.contains("was not found in Statens vegvesen"))
    }

    @Test
    fun unknownAndUncheckablePlatesBecomePlainErrorsAndNothingCanBeCommitted() {
        val lookups = mutableListOf<String>()
        val (repo, agreement, registry) = fixture(lookups) { plate ->
            when (plate) {
                "AB12345" -> RegistryLookup.Failed(LookupOutcome.NOT_FOUND)
                "CD12346" -> RegistryLookup.Failed(LookupOutcome.QUOTA_EXHAUSTED)
                else -> RegistryLookup.Found(RegistryVehicleData(plate)) // listed with no fuel at all
            }
        }
        val preview = preview(repo, registry, header + "$agreement,AB12345,FALSE,TRUE,,,,\n$agreement,CD12346,FALSE,TRUE,,,,\n$agreement,EF12347,FALSE,TRUE,,,,")

        assertFalse(preview.canCommit)
        assertEquals(listOf(2 to "registration_number"), preview.errors.map { it.row to it.column })
        assertTrue(preview.errors[0].message.contains("ikke funnet hos Statens vegvesen"))
        assertTrue(preview.warnings.single().contains("kunne ikke hente drivstofftype"))
    }

    @Test
    fun plannedVehiclesNeedAFuelBecauseTheyCannotBeLookedUp() {
        val lookups = mutableListOf<String>()
        val (repo, agreement, registry) = fixture(lookups) { RegistryLookup.Found(data("2", plate = it)) }
        val preview = preview(repo, registry, header + "$agreement,,TRUE,TRUE,,,,")
        assertFalse(preview.canCommit)
        assertTrue(preview.errors.single().message.contains("planlagte kjøretøy"))
        assertEquals(emptyList(), lookups)
    }

    @Test
    fun aBrokenFileDoesNotSpendRegistryLookups() {
        val lookups = mutableListOf<String>()
        val (repo, agreement, registry) = fixture(lookups) { RegistryLookup.Found(data("2", plate = it)) }
        val preview = preview(repo, registry, header + "$agreement,AB12345,FALSE,TRUE,,,,\n$agreement,not-a-plate,FALSE,TRUE,,,,")
        assertFalse(preview.canCommit)
        assertEquals(emptyList(), lookups)
    }

    @Test
    fun aPreviewChecksAtMostFiftyVehiclesAndMarksTheRestNotChecked() {
        val lookups = mutableListOf<String>()
        val (repo, agreement, registry) = fixture(lookups) { RegistryLookup.Found(data("2", plate = it)) }
        val rows = (1..52).joinToString("\n") { "$agreement,AB${10000 + it},FALSE,TRUE,,,," }
        val preview = preview(repo, registry, header + rows)
        assertEquals(VehicleRegistryFill.MAX_LOOKUPS_PER_PREVIEW, lookups.size)
        // Rows the registry was not asked about do not block the import; one warning says so.
        assertTrue(preview.canCommit, preview.errors.toString())
        assertEquals(1, preview.warnings.size)
    }

    @Test
    fun withoutARegistryABlankFuelIsAnErrorNotAGuess() {
        val (repo, agreement, _) = fixture(mutableListOf()) { RegistryLookup.Failed(LookupOutcome.NOT_CONFIGURED) }
        val preview = preview(repo, null, header + "$agreement,AB12345,FALSE,TRUE,,,,")
        assertFalse(preview.canCommit)
        assertEquals("fuel_technology", preview.errors.single().column)
    }
}
