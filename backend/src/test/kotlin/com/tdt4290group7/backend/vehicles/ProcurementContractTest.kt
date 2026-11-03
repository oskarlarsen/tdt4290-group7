package com.tdt4290group7.backend.vehicles

import java.nio.file.Path
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProcurementContractTest {
    @Test
    fun csvPreviewHandlesQuotedFieldsAndImportIsAtomic() {
        val repository = VehicleRepository(databasePath()).fleet
        val supplier = repository.saveSupplier(
            null,
            SupplierInput("Example Supplier", "123456789"),
            ChangeActor("admin", "Admin"),
            Instant.parse("2026-01-01T00:00:00Z"),
        )
        val csv = """contractName,contractReference,startDate,endDate
"Waste, collection",CN-001,2026-01-01,2026-12-31"""

        val preview = repository.previewContractCsv(supplier.id, csv)
        assertTrue(preview.issues.isEmpty())
        assertEquals("Waste, collection", preview.validRows.single().name)
        assertEquals(1, repository.importContractCsv(supplier.id, csv).imported)

        val duplicateAndNew = """contractName,contractReference,startDate,endDate
Duplicate,CN-001,2027-01-01,2027-12-31
New contract,CN-002,2027-01-01,2027-12-31"""
        val failedPreview = repository.previewContractCsv(supplier.id, duplicateAndNew)
        assertEquals(1, failedPreview.issues.size)
        assertEquals("CN-002", failedPreview.validRows.single().reference)
        assertFailsWith<ContractCsvValidationException> {
            repository.importContractCsv(supplier.id, duplicateAndNew)
        }
        assertEquals(1, repository.procurementContracts(supplier.id).size)
    }

    @Test
    fun malformedHeadersDatesAndUnknownSupplierAreReportedWithoutSaving() {
        val repository = VehicleRepository(databasePath()).fleet
        val supplier = repository.saveSupplier(
            null,
            SupplierInput("Example Supplier", "123456789"),
            ChangeActor("admin", "Admin"),
            Instant.parse("2026-01-01T00:00:00Z"),
        )
        val badCsv = """contractName,contractReference,startDate,endDate
Contract,CN-001,2026-02-30,2026-01-01"""

        val preview = repository.previewContractCsv(supplier.id, badCsv)
        assertFalse(preview.issues.isEmpty())
        assertFailsWith<ContractCsvValidationException> {
            repository.importContractCsv(supplier.id, badCsv)
        }
        val unknownSupplier = repository.previewContractCsv("missing", badCsv)
        assertTrue(unknownSupplier.issues.any { it.field == "supplierId" })
        assertTrue(repository.procurementContracts().isEmpty())
    }

    private fun databasePath() = Path.of("build", "test-data", "procurement-${UUID.randomUUID()}.db")
}
