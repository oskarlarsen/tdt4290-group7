package com.tdt4290group7.backend.onboarding

import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.vehicles.FleetRepository
import com.tdt4290group7.backend.vehicles.VehicleDatabase
import java.security.MessageDigest
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

internal class OnboardingRepository(
    private val database: VehicleDatabase,
    private val fleet: FleetRepository,
    private var certificateRepository: CertificateRepository? = null
) {

    private data class CachedBatch(
        val batchId: String,
        val supplierId: String,
        val entityType: BatchEntityType,
        val fileName: String,
        val fileHash: String,
        val rows: List<Map<String, String>>,
        val validRowsCount: Int,
        val errorRowsCount: Int
    )

    private val batchCache = ConcurrentHashMap<String, CachedBatch>()

    internal fun attachCertificateRepository(repository: CertificateRepository?) {
        certificateRepository = repository
    }

    internal fun isSupplierActive(supplierId: String): Boolean = fleet.isSupplierActive(supplierId)

    init {
        database.write { db ->
            db.createStatement().use { statement ->
                onboardingSchemaStatements.forEach { sql ->
                    statement.executeUpdate(sql)
                }
            }
        }
    }

    private fun formatTimestamp(instant: Instant): String = DateTimeFormatter.ISO_INSTANT.format(instant)

    // -------------------------------------------------------------------------
    // Status & Profile Management
    // -------------------------------------------------------------------------

    fun getOrCreateStatus(supplierId: String, now: Instant): OnboardingStatusResponse {
        return database.write { db ->
            ensureStatusRow(db, supplierId, now)
            statusResponse(db, supplierId)
        }
    }

    private fun ensureStatusRow(db: Connection, supplierId: String, now: Instant): Map<String, Any?> {
        queryStatusRow(db, supplierId)?.let { return it }
        database.insert(
            db,
            "supplier_onboarding",
            mapOf(
                "supplier_id" to supplierId,
                "status" to OnboardingStatus.INVITED.name,
                "contact_name" to null,
                "contact_email" to null,
                "contact_phone" to null,
                "submitted_at" to null,
                "reviewed_at" to null,
                "reviewer_notes" to null,
                "updated_at" to formatTimestamp(now)
            )
        )
        return queryStatusRow(db, supplierId) ?: error("Failed to create initial onboarding record")
    }

    private fun statusResponse(db: Connection, supplierId: String): OnboardingStatusResponse {
        val row = queryStatusRow(db, supplierId) ?: error("Onboarding status record is missing")
        val status = OnboardingStatus.valueOf(row["status"] as String)
        val contactName = row["contact_name"] as? String
        val contactEmail = row["contact_email"] as? String
        val contactPhone = row["contact_phone"] as? String
        val reviewerNotes = row["reviewer_notes"] as? String
        val agreements = querySupplierAgreements(db, supplierId)
        val vehicleCount = querySupplierVehicleCount(db, supplierId)
        val energyCount = querySupplierEnergyCount(db, supplierId)
        val productsCount = querySupplierProductsCount(db, supplierId)
        val profileComplete = !contactName.isNullOrBlank() && !contactEmail.isNullOrBlank()
        val requiredEntities = buildSet {
            if (agreements.any { it.requiresVehicles }) add(BatchEntityType.VEHICLES)
            if (agreements.any { it.requiresEnergy }) add(BatchEntityType.ENERGY)
            if (agreements.any { it.requiresProducts }) add(BatchEntityType.PRODUCTS)
        }.toList()
        val missingVehicleAgreements = agreements.count { it.requiresVehicles && countAgreementRecords(db, "vehicles", it.id) == 0 }
        val missingEnergyAgreements = agreements.count { it.requiresEnergy && countAgreementRecords(db, "facility_energy", it.id) == 0 }
        val missingProductAgreements = agreements.count { it.requiresProducts && countAgreementRecords(db, "contract_products", it.id) == 0 }
        val requiredDataComplete = requiredEntities.isNotEmpty() &&
            missingVehicleAgreements == 0 && missingEnergyAgreements == 0 && missingProductAgreements == 0

        return OnboardingStatusResponse(
            supplierId = supplierId,
            status = status,
            steps = listOf(
                OnboardingStepStatus("PROFILE", "Environmental & Compliance Contact", profileComplete,
                    if (profileComplete) "$contactName ($contactEmail)" else "Contact details required"),
                OnboardingStepStatus("AGREEMENTS", "Framework Agreements Linked", agreements.isNotEmpty(),
                    "${agreements.size} active contract(s) registered"),
                if (BatchEntityType.VEHICLES in requiredEntities) OnboardingStepStatus(
                    "VEHICLES", "Vehicles", missingVehicleAgreements == 0,
                    if (missingVehicleAgreements == 0) "$vehicleCount vehicle(s) registered"
                    else "$missingVehicleAgreements agreement(s) still need vehicle information"
                ) else null,
                if (BatchEntityType.ENERGY in requiredEntities) OnboardingStepStatus(
                    "ENERGY", "Energy", missingEnergyAgreements == 0,
                    if (missingEnergyAgreements == 0) "$energyCount energy record(s) submitted"
                    else "$missingEnergyAgreements agreement(s) still need energy information"
                ) else null,
                if (BatchEntityType.PRODUCTS in requiredEntities) OnboardingStepStatus(
                    "PRODUCTS", "Products", missingProductAgreements == 0,
                    if (missingProductAgreements == 0) "$productsCount product(s) submitted"
                    else "$missingProductAgreements agreement(s) still need product information"
                ) else null
            ).filterNotNull(),
            contactName = contactName,
            contactEmail = contactEmail,
            contactPhone = contactPhone,
            reviewerNotes = reviewerNotes,
            requiredEntities = requiredEntities,
            canSubmit = profileComplete && agreements.isNotEmpty() && requiredDataComplete &&
                (status == OnboardingStatus.DATA_DRAFT || status == OnboardingStatus.REVISION_REQUIRED)
        )
    }

    fun updateProfile(supplierId: String, input: SupplierProfileInput, now: Instant): SupplierProfileResponse {
        val name = input.contactName.trim()
        val email = input.contactEmail.trim().lowercase(Locale.ROOT)
        val phone = input.contactPhone?.trim()

        require(name.length in 2..100) { "Contact name must be between 2 and 100 characters" }
        require(email.contains("@") && email.contains(".")) { "Enter a valid email address" }

        return database.write { db ->
            val statusRow = queryStatusRow(db, supplierId)
            val currentStatus = statusRow?.get("status")?.let { OnboardingStatus.valueOf(it as String) }
                ?: OnboardingStatus.INVITED
            require(currentStatus in editableStatuses) {
                "Supplier profile cannot be changed while onboarding is ${currentStatus.name.lowercase(Locale.ROOT)}"
            }

            val nextStatus = if (currentStatus == OnboardingStatus.INVITED || currentStatus == OnboardingStatus.PROFILE_PENDING) {
                OnboardingStatus.DATA_DRAFT
            } else {
                currentStatus
            }

            val ts = formatTimestamp(now)

            if (statusRow == null) {
                database.insert(
                    db,
                    "supplier_onboarding",
                    mapOf(
                        "supplier_id" to supplierId,
                        "status" to nextStatus.name,
                        "contact_name" to name,
                        "contact_email" to email,
                        "contact_phone" to phone,
                        "submitted_at" to null,
                        "reviewed_at" to null,
                        "reviewer_notes" to null,
                        "updated_at" to ts
                    )
                )
            } else {
                database.update(
                    db,
                    "supplier_onboarding",
                    mapOf(
                        "status" to nextStatus.name,
                        "contact_name" to name,
                        "contact_email" to email,
                        "contact_phone" to phone,
                        "updated_at" to ts
                    ),
                    "supplier_id = ?",
                    listOf(supplierId)
                )
            }

            val supplierInfo = database.query(
                db,
                "SELECT name, org_number FROM suppliers WHERE id = ?",
                listOf(supplierId)
            ) { row -> row.getString("name") to row.getString("org_number") }.firstOrNull()
                ?: ("Unknown Supplier" to "000000000")

            SupplierProfileResponse(
                supplierId = supplierId,
                name = supplierInfo.first,
                orgNumber = supplierInfo.second,
                status = nextStatus,
                contactName = name,
                contactEmail = email,
                contactPhone = phone,
                submittedAt = statusRow?.get("submitted_at") as? String,
                reviewedAt = statusRow?.get("reviewed_at") as? String,
                reviewerNotes = statusRow?.get("reviewer_notes") as? String,
                updatedAt = ts
            )
        }
    }

    fun submitOnboarding(supplierId: String, now: Instant): OnboardingStatusResponse {
        return database.write { db ->
            val row = queryStatusRow(db, supplierId)
                ?: throw IllegalArgumentException("Onboarding profile not found for supplier $supplierId")

            val currentStatus = OnboardingStatus.valueOf(row["status"] as String)
            require(
                currentStatus == OnboardingStatus.DATA_DRAFT ||
                    currentStatus == OnboardingStatus.REVISION_REQUIRED
            ) { "Cannot submit onboarding when current status is $currentStatus" }

            val contactName = row["contact_name"] as? String
            val contactEmail = row["contact_email"] as? String
            require(!contactName.isNullOrBlank() && !contactEmail.isNullOrBlank()) {
                "Sustainability contact name and email are mandatory before submission"
            }
            val current = statusResponse(db, supplierId)
            require(current.canSubmit) {
                "Complete the required onboarding steps before submission"
            }

            val ts = formatTimestamp(now)
            database.update(
                db,
                "supplier_onboarding",
                mapOf(
                    "status" to OnboardingStatus.SUBMITTED.name,
                    "submitted_at" to ts,
                    "updated_at" to ts
                ),
                "supplier_id = ?",
                listOf(supplierId)
            )

            statusResponse(db, supplierId)
        }
    }

    fun reviewOnboarding(
        supplierId: String,
        request: AdminReviewRequest,
        now: Instant
    ): OnboardingStatusResponse {
        val nextStatus = when (request.action) {
            AdminReviewAction.APPROVE -> OnboardingStatus.APPROVED
            AdminReviewAction.REQUEST_CHANGES -> OnboardingStatus.REVISION_REQUIRED
        }
        val ts = formatTimestamp(now)

        return database.write { db ->
            val row = queryStatusRow(db, supplierId)
                ?: throw IllegalArgumentException("Onboarding profile not found for supplier $supplierId")
            val currentStatus = OnboardingStatus.valueOf(row["status"] as String)
            require(currentStatus == OnboardingStatus.SUBMITTED || currentStatus == OnboardingStatus.UNDER_REVIEW) {
                "Cannot review onboarding when current status is $currentStatus"
            }
            database.update(
                db,
                "supplier_onboarding",
                mapOf(
                    "status" to nextStatus.name,
                    "reviewed_at" to ts,
                    "reviewer_notes" to request.notes,
                    "updated_at" to ts
                ),
                "supplier_id = ?",
                listOf(supplierId)
            )

            statusResponse(db, supplierId)
        }
    }

    // -------------------------------------------------------------------------
    // Two-Phase CSV Upload (Preview & Atomic Commit)
    // -------------------------------------------------------------------------

    fun createBatchPreview(
        supplierId: String,
        entityType: BatchEntityType,
        fileName: String,
        fileBytes: ByteArray,
        now: Instant
    ): CsvPreviewResponse {
        database.read { db -> requireEditableSupplier(db, supplierId) }
        val allowedAgreements = requiredAgreementIds(supplierId, entityType)
        require(allowedAgreements.isNotEmpty()) {
            "Your administrator has not requested ${entityType.name.lowercase(Locale.ROOT)} information"
        }
        val hash = sha256(fileBytes)
        val parseResult = CsvStreamParser.parseAndValidate(
            inputStream = fileBytes.inputStream(),
            entityType = entityType,
            allowedAgreementIds = allowedAgreements
        )

        val batchId = "batch-" + UUID.randomUUID().toString()
        val totalRows = parseResult.totalRows
        val rowErrors = parseResult.errors.map { it.row }.distinct().count { it > 1 }
        val errorRowsCount = if (parseResult.errors.any { it.row <= 1 } && totalRows > 0) totalRows else rowErrors
        val validRowsCount = totalRows - errorRowsCount
        val canCommit = parseResult.errors.isEmpty() && totalRows > 0

        if (canCommit) {
            batchCache[batchId] = CachedBatch(
                batchId = batchId,
                supplierId = supplierId,
                entityType = entityType,
                fileName = fileName,
                fileHash = hash,
                rows = parseResult.rows,
                validRowsCount = validRowsCount,
                errorRowsCount = errorRowsCount
            )

            // Persist batch audit trail record
            database.write { db ->
                database.insert(
                    db,
                    "upload_batches",
                    mapOf(
                        "id" to batchId,
                        "supplier_id" to supplierId,
                        "agreement_id" to parseResult.rows.firstOrNull()?.get("agreement_id"),
                        "entity_type" to entityType.name,
                        "file_name" to fileName,
                        "file_hash_sha256" to hash,
                        "total_rows" to totalRows,
                        "valid_rows" to validRowsCount,
                        "error_rows" to errorRowsCount,
                        "status" to BatchStatus.PREVIEWED.name,
                        "created_at" to formatTimestamp(now),
                        "committed_at" to null
                    )
                )
            }
        }

        return CsvPreviewResponse(
            batchId = batchId,
            entityType = entityType,
            fileName = fileName,
            totalRows = totalRows,
            validRows = validRowsCount,
            errorRows = errorRowsCount,
            canCommit = canCommit,
            errors = parseResult.errors,
            previewRows = parseResult.rows.take(10)
        )
    }

    fun confirmBatch(batchId: String, supplierId: String, now: Instant): CsvConfirmResponse {
        val cached = batchCache[batchId]
            ?: throw IllegalArgumentException("Batch preview expired or not found. Please upload the CSV again.")

        require(cached.supplierId == supplierId) { "Batch does not belong to your organization" }

        val ts = formatTimestamp(now)

        database.write { db ->
            requireEditableSupplier(db, supplierId)
            val batchStatus = database.query(
                db,
                "SELECT status FROM upload_batches WHERE id = ? AND supplier_id = ?",
                listOf(batchId, supplierId)
            ) { it.getString("status") }.firstOrNull()
            require(batchStatus == BatchStatus.PREVIEWED.name) { "Batch has already been confirmed or is no longer available" }

            val requestedAgreementIds = queryRequiredAgreementIds(db, supplierId, cached.entityType)
            require(requestedAgreementIds.isNotEmpty() && cached.rows.all { row ->
                row["agreement_id"]?.let(requestedAgreementIds::contains) == true
            }) {
                "One or more agreements are no longer active or do not request this information type"
            }

            when (cached.entityType) {
                BatchEntityType.VEHICLES -> commitVehicles(db, cached.supplierId, cached.rows, ts)
                BatchEntityType.ENERGY -> commitEnergy(db, cached.rows, ts)
                BatchEntityType.PRODUCTS -> commitProducts(db, cached.rows, ts)
            }

            // Update batch audit record to COMMITTED
            database.update(
                db,
                "upload_batches",
                mapOf(
                    "status" to BatchStatus.COMMITTED.name,
                    "committed_at" to ts
                ),
                "id = ?",
                listOf(batchId)
            )
        }

        batchCache.remove(batchId)

        return CsvConfirmResponse(
            batchId = batchId,
            entityType = cached.entityType,
            importedRows = cached.rows.size,
            message = "Successfully committed ${cached.rows.size} ${cached.entityType.name.lowercase(Locale.ROOT)} record(s)."
        )
    }

    private fun commitVehicles(db: Connection, supplierId: String, rows: List<Map<String, String>>, timestamp: String) {
        for (r in rows) {
            val agreementId = r["agreement_id"]!!.trim()
            val isPlannedStr = r["is_planned"]?.trim()?.uppercase(Locale.ROOT)
            val isPlanned = isPlannedStr == "TRUE" || isPlannedStr == "1"
            val regNumber = if (isPlanned) {
                "PLAN" + UUID.randomUUID().toString().replace("-", "")
            } else {
                r["registration_number"]!!.trim().uppercase(Locale.ROOT)
            }

            val existingOwner = database.query(
                db,
                """SELECT a.supplier_id FROM vehicles v
                   LEFT JOIN agreements a ON a.id = v.agreement_id
                   WHERE v.registration_number = ?""",
                listOf(regNumber)
            ) { it.getString(1) }.firstOrNull()

            require(existingOwner == null || existingOwner == supplierId) {
                "Vehicle $regNumber is already assigned to another supplier"
            }

            if (existingOwner == null) {
                val exists = database.query(
                    db,
                    "SELECT 1 FROM vehicles WHERE registration_number = ?",
                    listOf(regNumber)
                ) { it.getInt(1) }.isNotEmpty()
                require(!exists) { "Vehicle $regNumber is not linked to an agreement owned by your organization" }
                database.insert(
                    db,
                    "vehicles",
                    mapOf(
                        "registration_number" to regNumber,
                        "agreement_id" to agreementId,
                        "planned" to if (isPlanned) 1 else 0,
                        "listed" to 1,
                        "created_at" to timestamp,
                        "updated_at" to timestamp
                    )
                )
            } else {
                database.update(
                    db,
                    "vehicles",
                    mapOf(
                        "agreement_id" to agreementId,
                        "listed" to 1,
                        "updated_at" to timestamp
                    ),
                    "registration_number = ?",
                    listOf(regNumber)
                )
            }

            val coverage = r["full_contract_coverage"]!!.trim().equals("TRUE", ignoreCase = true) ||
                r["full_contract_coverage"]!!.trim() == "1"
            val detailValues = mapOf(
                "fuel_technology" to r["fuel_technology"]!!.trim(),
                "is_hybrid" to if (r["is_hybrid"]!!.trim().equals("TRUE", ignoreCase = true) || r["is_hybrid"]!!.trim() == "1") 1 else 0,
                "full_contract_coverage" to if (coverage) 1 else 0,
                "start_year_week" to r["start_year_week"]?.trim()?.takeIf { it.isNotEmpty() },
                "end_year_week" to r["end_year_week"]?.trim()?.takeIf { it.isNotEmpty() },
                "attachment_reference" to r["attachment_reference"]?.trim()?.takeIf { it.isNotEmpty() },
                "notes" to r["notes"]?.trim()?.takeIf { it.isNotEmpty() },
                "updated_at" to timestamp
            )
            val hasDetails = database.query(
                db,
                "SELECT 1 FROM vehicle_contract_details WHERE registration_number = ?",
                listOf(regNumber)
            ) { it.getInt(1) }.isNotEmpty()
            if (hasDetails) {
                database.update(db, "vehicle_contract_details", detailValues, "registration_number = ?", listOf(regNumber))
            } else {
                database.insert(
                    db,
                    "vehicle_contract_details",
                    detailValues + ("registration_number" to regNumber)
                )
            }
        }
    }

    private fun commitEnergy(db: Connection, rows: List<Map<String, String>>, timestamp: String) {
        for (r in rows) {
            val id = "nrg-" + UUID.randomUUID().toString()
            val agreementId = r["agreement_id"]!!.trim()
            val locationCode = r["facility_location_code"]!!.trim()
            val year = r["reporting_year"]!!.trim().toInt()

            // Delete existing reading for composite key to ensure idempotent replace
            db.prepareStatement(
                "DELETE FROM facility_energy WHERE agreement_id = ? AND location_code = ? AND reporting_year = ?"
            ).use { stmt ->
                stmt.setString(1, agreementId)
                stmt.setString(2, locationCode)
                stmt.setInt(3, year)
                stmt.executeUpdate()
            }

            database.insert(
                db,
                "facility_energy",
                mapOf(
                    "id" to id,
                    "agreement_id" to agreementId,
                    "location_code" to locationCode,
                    "address" to r["facility_address"]!!.trim(),
                    "storage_area_sqm" to r["storage_area_sqm"]?.toDoubleOrNull(),
                    "workshop_area_sqm" to r["workshop_area_sqm"]?.toDoubleOrNull(),
                    "other_area_sqm" to r["other_area_sqm"]?.toDoubleOrNull(),
                    "reporting_year" to year,
                    "electricity_kwh" to (r["electricity_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "district_heating_kwh" to (r["district_heating_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "biogas_kwh" to (r["biogas_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "fossil_fuel_kwh" to (r["fossil_fuel_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "self_produced_solar_kwh" to (r["self_produced_solar_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "self_produced_heatpump_kwh" to (r["self_produced_heatpump_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "notes" to r["notes"]?.trim(),
                    "created_at" to timestamp,
                    "updated_at" to timestamp
                )
            )
        }
    }

    private fun commitProducts(db: Connection, rows: List<Map<String, String>>, timestamp: String) {
        for (r in rows) {
            val id = "prd-" + UUID.randomUUID().toString()
            val agreementId = r["agreement_id"]!!.trim()
            val productCode = r["product_code"]!!.trim()

            db.prepareStatement(
                "DELETE FROM contract_products WHERE agreement_id = ? AND product_code = ?"
            ).use { stmt ->
                stmt.setString(1, agreementId)
                stmt.setString(2, productCode)
                stmt.executeUpdate()
            }

            val category = ProductCategory.valueOf(r["product_category"]!!.trim().uppercase(Locale.ROOT))
            val ecolabel = EcolabelStandard.valueOf(r["ecolabel_standard"]!!.trim().uppercase(Locale.ROOT))
            val isReused = r["is_repaired_or_reused"]?.trim()?.uppercase(Locale.ROOT) in listOf("TRUE", "1")

            database.insert(
                db,
                "contract_products",
                mapOf(
                    "id" to id,
                    "agreement_id" to agreementId,
                    "product_code" to productCode,
                    "product_name" to r["product_name"]!!.trim(),
                    "product_category" to category.name,
                    "ecolabel_standard" to ecolabel.name,
                    "license_number" to r["license_number"]?.trim(),
                    "unit_of_measure" to (r["unit_of_measure"]?.trim()?.uppercase(Locale.ROOT) ?: "PCS"),
                    "is_repaired_or_reused" to if (isReused) 1 else 0,
                    "notes" to r["notes"]?.trim(),
                    "created_at" to timestamp,
                    "updated_at" to timestamp
                )
            )
        }
    }

    // -------------------------------------------------------------------------
    // Supplier Dashboard Queries
    // -------------------------------------------------------------------------

    fun getSupplierAgreementIds(supplierId: String): Set<String> {
        return database.read { db ->
            database.query(
                db,
                "SELECT id FROM agreements WHERE supplier_id = ? AND active = 1",
                listOf(supplierId)
            ) { it.getString("id") }.toSet()
        }
    }

    fun requiredAgreementIds(supplierId: String, entityType: BatchEntityType): Set<String> =
        database.read { db -> queryRequiredAgreementIds(db, supplierId, entityType) }

    fun getSupplierAgreements(supplierId: String): List<SupplierAgreementSummary> {
        return database.read { db -> querySupplierAgreements(db, supplierId) }
    }

    fun getSupplierVehicles(supplierId: String): List<SupplierVehicleSummary> {
        return database.read { db ->
            val sql = """
                SELECT v.registration_number, v.agreement_id, v.planned, v.listed,
                       d.fuel_technology, d.is_hybrid, d.full_contract_coverage,
                       d.start_year_week, d.end_year_week, d.attachment_reference, d.notes,
                       v.created_at, v.updated_at
                FROM vehicles v
                JOIN agreements a ON v.agreement_id = a.id
                LEFT JOIN vehicle_contract_details d ON d.registration_number = v.registration_number
                WHERE a.supplier_id = ? AND a.active = 1
                ORDER BY v.registration_number
            """.trimIndent()
            database.query(db, sql, listOf(supplierId)) { row ->
                SupplierVehicleSummary(
                    registrationNumber = row.getString("registration_number"),
                    agreementId = row.getString("agreement_id"),
                    planned = row.getInt("planned") == 1,
                    listed = row.getInt("listed") == 1,
                    fuelTechnology = row.getString("fuel_technology"),
                    isHybrid = row.getObject("is_hybrid")?.let { row.getInt("is_hybrid") == 1 },
                    fullContractCoverage = row.getObject("full_contract_coverage")?.let { row.getInt("full_contract_coverage") == 1 },
                    startYearWeek = row.getString("start_year_week"),
                    endYearWeek = row.getString("end_year_week"),
                    attachmentReference = row.getString("attachment_reference"),
                    notes = row.getString("notes"),
                    createdAt = row.getString("created_at"),
                    updatedAt = row.getString("updated_at")
                )
            }
        }
    }

    fun getSupplierEnergy(supplierId: String): List<FacilityEnergyRecord> {
        return database.read { db ->
            val sql = """
                SELECT fe.*
                FROM facility_energy fe
                JOIN agreements a ON fe.agreement_id = a.id
                WHERE a.supplier_id = ?
                ORDER BY fe.reporting_year DESC, fe.location_code
            """.trimIndent()
            database.query(db, sql, listOf(supplierId)) { row ->
                FacilityEnergyRecord(
                    id = row.getString("id"),
                    agreementId = row.getString("agreement_id"),
                    locationCode = row.getString("location_code"),
                    address = row.getString("address"),
                    storageAreaSqm = row.getObject("storage_area_sqm")?.let { (it as Number).toDouble() },
                    workshopAreaSqm = row.getObject("workshop_area_sqm")?.let { (it as Number).toDouble() },
                    otherAreaSqm = row.getObject("other_area_sqm")?.let { (it as Number).toDouble() },
                    reportingYear = row.getInt("reporting_year"),
                    electricityKwh = row.getDouble("electricity_kwh"),
                    districtHeatingKwh = row.getDouble("district_heating_kwh"),
                    biogasKwh = row.getDouble("biogas_kwh"),
                    fossilFuelKwh = row.getDouble("fossil_fuel_kwh"),
                    selfProducedSolarKwh = row.getDouble("self_produced_solar_kwh"),
                    selfProducedHeatpumpKwh = row.getDouble("self_produced_heatpump_kwh"),
                    notes = row.getString("notes"),
                    createdAt = row.getString("created_at"),
                    updatedAt = row.getString("updated_at")
                )
            }
        }
    }

    fun getSupplierProducts(supplierId: String): List<ContractProductRecord> {
        return database.read { db ->
            val sql = """
                SELECT cp.*
                FROM contract_products cp
                JOIN agreements a ON cp.agreement_id = a.id
                WHERE a.supplier_id = ?
                ORDER BY cp.product_name
            """.trimIndent()
            database.query(db, sql, listOf(supplierId)) { row ->
                ContractProductRecord(
                    id = row.getString("id"),
                    agreementId = row.getString("agreement_id"),
                    productCode = row.getString("product_code"),
                    productName = row.getString("product_name"),
                    productCategory = ProductCategory.valueOf(row.getString("product_category")),
                    ecolabelStandard = EcolabelStandard.valueOf(row.getString("ecolabel_standard")),
                    licenseNumber = row.getString("license_number"),
                    unitOfMeasure = row.getString("unit_of_measure"),
                    isRepairedOrReused = row.getInt("is_repaired_or_reused") == 1,
                    notes = row.getString("notes"),
                    createdAt = row.getString("created_at"),
                    updatedAt = row.getString("updated_at")
                )
            }
        }
    }

    fun getSupplierOverview(supplierId: String, now: Instant): SupplierDashboardOverview {
        return database.read { db ->
            val supplierInfo = database.query(
                db,
                "SELECT name, org_number FROM suppliers WHERE id = ?",
                listOf(supplierId)
            ) { row -> row.getString("name") to row.getString("org_number") }.firstOrNull()
                ?: ("Unknown Supplier" to "000000000")

            val status = queryStatusRow(db, supplierId)?.get("status")?.let {
                OnboardingStatus.valueOf(it as String)
            } ?: OnboardingStatus.INVITED

            val agreements = querySupplierAgreements(db, supplierId)
            val vehicleCount = querySupplierVehicleCount(db, supplierId)
            val certificatesCount = querySupplierCertificatesCount(agreements.map { it.id }.toSet())
            val energyCount = querySupplierEnergyCount(db, supplierId)
            val productsCount = querySupplierProductsCount(db, supplierId)

            SupplierDashboardOverview(
                supplierId = supplierId,
                supplierName = supplierInfo.first,
                orgNumber = supplierInfo.second,
                onboardingStatus = status,
                agreements = agreements,
                totalVehicles = vehicleCount,
                totalCertificates = certificatesCount,
                totalEnergyRecords = energyCount,
                totalProducts = productsCount
            )
        }
    }

    fun getAdminSupplierOnboardingSummaries(): List<AdminSupplierOnboardingSummary> {
        return database.read { db ->
            val supplierIds = database.query(
                db,
                "SELECT id FROM suppliers WHERE active = 1 ORDER BY name COLLATE NOCASE"
            ) { it.getString("id") }

            supplierIds.map { supplierId ->
                val statusRow = queryStatusRow(db, supplierId)
                val agreements = querySupplierAgreements(db, supplierId)
                AdminSupplierOnboardingSummary(
                    supplierId = supplierId,
                    status = statusRow?.get("status")?.let { OnboardingStatus.valueOf(it as String) }
                        ?: OnboardingStatus.INVITED,
                    contactName = statusRow?.get("contact_name") as? String,
                    contactEmail = statusRow?.get("contact_email") as? String,
                    contactPhone = statusRow?.get("contact_phone") as? String,
                    reviewerNotes = statusRow?.get("reviewer_notes") as? String,
                    submittedAt = statusRow?.get("submitted_at") as? String,
                    reviewedAt = statusRow?.get("reviewed_at") as? String,
                    agreementCount = agreements.size,
                    vehicleCount = querySupplierVehicleCount(db, supplierId),
                    certificateCount = querySupplierCertificatesCount(agreements.map { it.id }.toSet()),
                    energyRecordCount = querySupplierEnergyCount(db, supplierId),
                    productCount = querySupplierProductsCount(db, supplierId)
                )
            }
        }
    }

    // -------------------------------------------------------------------------
    // Private Helpers
    // -------------------------------------------------------------------------

    private fun queryStatusRow(db: Connection, supplierId: String): Map<String, Any?>? {
        val rows = database.query(
            db,
            "SELECT * FROM supplier_onboarding WHERE supplier_id = ?",
            listOf(supplierId)
        ) { rs ->
            (1..rs.metaData.columnCount).associate {
                rs.metaData.getColumnName(it) to rs.getObject(it)
            }

        }
        return rows.firstOrNull()
    }

    private fun requireEditableSupplier(db: Connection, supplierId: String) {
        val status = queryStatusRow(db, supplierId)?.get("status")?.let { OnboardingStatus.valueOf(it as String) }
            ?: OnboardingStatus.INVITED
        require(status in editableStatuses) {
            "Supplier data cannot be changed while onboarding is ${status.name.lowercase(Locale.ROOT)}"
        }
    }

    private fun querySupplierAgreements(db: Connection, supplierId: String): List<SupplierAgreementSummary> {
        val sql = """
            SELECT a.id, a.note, a.start_date, a.end_date, a.allowed_vehicles, a.active,
                   a.requires_vehicles, a.requires_energy, a.requires_products,
                   (SELECT COUNT(*) FROM vehicles v WHERE v.agreement_id = a.id AND v.listed = 1) AS vehicle_count
            FROM agreements a
            WHERE a.supplier_id = ? AND a.active = 1
            ORDER BY a.start_date DESC
        """.trimIndent()
        return database.query(db, sql, listOf(supplierId)) { row ->
            SupplierAgreementSummary(
                id = row.getString("id"),
                note = row.getString("note"),
                startDate = row.getString("start_date"),
                endDate = row.getString("end_date"),
                allowedVehicles = row.getInt("allowed_vehicles"),
                activeVehiclesCount = row.getInt("vehicle_count"),
                active = row.getInt("active") == 1,
                requiresVehicles = row.getInt("requires_vehicles") == 1,
                requiresEnergy = row.getInt("requires_energy") == 1,
                requiresProducts = row.getInt("requires_products") == 1
            )
        }
    }

    private fun queryRequiredAgreementIds(
        db: Connection,
        supplierId: String,
        entityType: BatchEntityType
    ): Set<String> {
        val requirementColumn = when (entityType) {
            BatchEntityType.VEHICLES -> "requires_vehicles"
            BatchEntityType.ENERGY -> "requires_energy"
            BatchEntityType.PRODUCTS -> "requires_products"
        }
        return database.query(
            db,
            "SELECT id FROM agreements WHERE supplier_id = ? AND active = 1 AND $requirementColumn = 1",
            listOf(supplierId)
        ) { it.getString("id") }.toSet()
    }

    private fun countAgreementRecords(db: Connection, table: String, agreementId: String): Int {
        require(table in setOf("vehicles", "facility_energy", "contract_products"))
        val listedClause = if (table == "vehicles") " AND listed = 1" else ""
        return database.query(
            db,
            "SELECT COUNT(*) FROM $table WHERE agreement_id = ?$listedClause",
            listOf(agreementId)
        ) { it.getInt(1) }.single()
    }

    private fun countAgreementRecords(db: Connection, entityType: BatchEntityType, agreementId: String): Int =
        countAgreementRecords(db, when (entityType) {
            BatchEntityType.VEHICLES -> "vehicles"
            BatchEntityType.ENERGY -> "facility_energy"
            BatchEntityType.PRODUCTS -> "contract_products"
        }, agreementId)

    private fun querySupplierVehicleCount(db: Connection, supplierId: String): Int {
        val sql = """
            SELECT COUNT(*) FROM vehicles v
            JOIN agreements a ON v.agreement_id = a.id
            WHERE a.supplier_id = ? AND v.listed = 1
        """.trimIndent()
        return database.query(db, sql, listOf(supplierId)) { it.getInt(1) }.firstOrNull() ?: 0
    }

    private fun querySupplierCertificatesCount(agreementIds: Set<String>): Int {
        val repository = certificateRepository ?: return 0
        return repository.getAll().count { cert ->
            cert.contractId != null && agreementIds.contains(cert.contractId)
        }
    }

    private fun querySupplierEnergyCount(db: Connection, supplierId: String): Int {
        val sql = """
            SELECT COUNT(*) FROM facility_energy fe
            JOIN agreements a ON fe.agreement_id = a.id
            WHERE a.supplier_id = ? AND a.active = 1
        """.trimIndent()
        return database.query(db, sql, listOf(supplierId)) { it.getInt(1) }.firstOrNull() ?: 0
    }

    private fun querySupplierProductsCount(db: Connection, supplierId: String): Int {
        val sql = """
            SELECT COUNT(*) FROM contract_products cp
            JOIN agreements a ON cp.agreement_id = a.id
            WHERE a.supplier_id = ?
        """.trimIndent()
        return database.query(db, sql, listOf(supplierId)) { it.getInt(1) }.firstOrNull() ?: 0
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(bytes)
        return hash.joinToString("") { "%02x".format(it) }
    }

    private companion object {
        val editableStatuses = setOf(
            OnboardingStatus.INVITED,
            OnboardingStatus.PROFILE_PENDING,
            OnboardingStatus.DATA_DRAFT,
            OnboardingStatus.REVISION_REQUIRED
        )
    }
}
