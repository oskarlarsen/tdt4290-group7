package com.tdt4290group7.backend.onboarding

import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CsvStreamParserTest {

    @Test
    fun stripsUtf8BomCleanly() {
        val bomCsv = "\uFEFFagreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n" +
            "AGR-1,SV12345,FALSE,13,FALSE,TRUE,,,ORD-1,Sample bus"
        val bytes = bomCsv.toByteArray(StandardCharsets.UTF_8)
        val result = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(bytes),
            BatchEntityType.VEHICLES,
            setOf("AGR-1")
        )

        assertEquals(0, result.errors.size)
        assertEquals(1, result.rows.size)
        assertEquals("SV12345", result.rows[0]["registration_number"])
    }

    @Test
    fun rejectsFormulaInjectionAttempts() {
        val maliciousCsv = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n" +
            "AGR-1,SV12345,FALSE,13,FALSE,TRUE,,,=CMD('calc'),Sample bus"
        val result = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(maliciousCsv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.VEHICLES,
            setOf("AGR-1")
        )

        assertTrue(result.errors.any { it.message.contains("formula injection", ignoreCase = true) })
    }

    @Test
    fun validatesVehiclePlateAndPlannedConstraints() {
        // Invalid plate format
        val invalidPlateCsv = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n" +
            "AGR-1,INVALID123,FALSE,13,FALSE,TRUE,,,ORD-1,Invalid"
        val r1 = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(invalidPlateCsv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.VEHICLES,
            setOf("AGR-1")
        )
        assertTrue(r1.errors.any { it.column == "registration_number" })

        // Planned vehicle with plate provided (should be empty)
        val plannedWithPlateCsv = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n" +
            "AGR-1,SV12345,TRUE,13,FALSE,TRUE,,,ORD-1,Should be blank"
        val r2 = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(plannedWithPlateCsv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.VEHICLES,
            setOf("AGR-1")
        )
        assertTrue(r2.errors.any { it.column == "registration_number" && it.message.contains("Planned vehicles") })
    }

    @Test
    fun validatesPartialCoverageDates() {
        val missingWeeksCsv = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n" +
            "AGR-1,SV12345,FALSE,13,FALSE,FALSE,,,ORD-1,Missing weeks"
        val res = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(missingWeeksCsv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.VEHICLES,
            setOf("AGR-1")
        )
        assertTrue(res.errors.any { it.column == "start_year_week" })
        assertTrue(res.errors.any { it.column == "end_year_week" })
    }

    @Test
    fun validatesEnergyReportingBounds() {
        val invalidEnergyCsv = "agreement_id,facility_location_code,facility_address,storage_area_sqm,workshop_area_sqm,other_area_sqm,reporting_year,electricity_kwh,district_heating_kwh,biogas_kwh,fossil_fuel_kwh,self_produced_solar_kwh,self_produced_heatpump_kwh,notes\n" +
            "AGR-1,LOC-1,Address 1,100,50,20,2015,1000,500,0,0,0,0,Too old"
        val res = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(invalidEnergyCsv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.ENERGY,
            setOf("AGR-1")
        )
        assertTrue(res.errors.any { it.column == "reporting_year" })
    }

    @Test
    fun validatesProductCategoriesAndEcolabels() {
        val invalidProductCsv = "agreement_id,product_code,product_name,product_category,ecolabel_standard,license_number,unit_of_measure,is_repaired_or_reused,notes\n" +
            "AGR-1,P-1,Office Chair,INVALID_CAT,MOBELFAKTA,,PCS,FALSE,No license"
        val res = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(invalidProductCsv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.PRODUCTS,
            setOf("AGR-1")
        )
        assertTrue(res.errors.any { it.column == "product_category" })
        assertTrue(res.errors.any { it.column == "license_number" })
    }

    @Test
    fun rejectsDuplicateEnergyKeysWithinOneUpload() {
        val csv = "agreement_id,facility_location_code,facility_address,storage_area_sqm,workshop_area_sqm,other_area_sqm,reporting_year,electricity_kwh,district_heating_kwh,biogas_kwh,fossil_fuel_kwh,self_produced_solar_kwh,self_produced_heatpump_kwh,notes\n" +
            "AGR-1,LOC-1,Address 1,100,50,20,2026,1000,500,0,0,0,0,First\n" +
            "AGR-1,LOC-1,Address 1,100,50,20,2026,1200,500,0,0,0,0,Duplicate"
        val result = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(csv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.ENERGY,
            setOf("AGR-1")
        )

        assertTrue(result.errors.any { it.row == 3 && it.column == "facility_location_code" && it.message.contains("Duplicate") })
    }

    @Test
    fun rejectsDuplicateProductKeysWithinOneUpload() {
        val csv = "agreement_id,product_code,product_name,product_category,ecolabel_standard,license_number,unit_of_measure,is_repaired_or_reused,notes\n" +
            "AGR-1,P-1,Office Chair,FURNITURE,NONE,,PCS,FALSE,First\n" +
            "AGR-1,P-1,Office Chair,FURNITURE,NONE,,PCS,FALSE,Duplicate"
        val result = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(csv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.PRODUCTS,
            setOf("AGR-1")
        )

        assertTrue(result.errors.any { it.row == 3 && it.column == "product_code" && it.message.contains("Duplicate") })
    }

    @Test
    fun generatesHeaderOnlyTemplatesWithoutFictionalRecords() {
        val templates = mapOf(
            BatchEntityType.VEHICLES to CsvStreamParser.VEHICLE_HEADERS,
            BatchEntityType.ENERGY to CsvStreamParser.ENERGY_HEADERS,
            BatchEntityType.PRODUCTS to CsvStreamParser.PRODUCT_HEADERS
        )

        for ((entityType, expectedHeaders) in templates) {
            val template = CsvStreamParser.generateTemplate(entityType)
            val templateWithoutBom = template.removePrefix("\uFEFF")
            assertEquals(expectedHeaders.joinToString(";"), templateWithoutBom.trim())
            assertFalse(template.contains("AGR-"))
            assertEquals(1, template.trim().lines().size)
        }
    }

    @Test
    fun acceptsExcelSemicolonDelimitedCsvAndQuotedSemicolons() {
        val csv = "agreement_id;registration_number;is_planned;fuel_technology;is_hybrid;full_contract_coverage;start_year_week;end_year_week;attachment_reference;notes\n" +
            "AGR-1;SV12345;FALSE;13;FALSE;TRUE;;;;\"Reserve; vehicle\""
        val result = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(csv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.VEHICLES,
            setOf("AGR-1")
        )

        assertTrue(result.errors.isEmpty())
        assertEquals("Reserve; vehicle", result.rows.single()["notes"])
    }

    @Test
    fun countsMalformedRowsAndRejectsInvalidProductFields() {
        val csv = "agreement_id,product_code,product_name,product_category,ecolabel_standard,license_number,unit_of_measure,is_repaired_or_reused,notes\n" +
            "AGR-1,P-1,Chair,FURNITURE,NONE,,INVALID,maybe,Sample\n" +
            "AGR-1,P-2,Table,FURNITURE,NONE,,PCS,FALSE"
        val result = CsvStreamParser.parseAndValidate(
            ByteArrayInputStream(csv.toByteArray(StandardCharsets.UTF_8)),
            BatchEntityType.PRODUCTS,
            setOf("AGR-1")
        )

        assertEquals(2, result.totalRows)
        assertTrue(result.errors.any { it.column == "unit_of_measure" })
        assertTrue(result.errors.any { it.column == "is_repaired_or_reused" })
        assertTrue(result.errors.any { it.column == "STRUCTURE" })
    }
}
