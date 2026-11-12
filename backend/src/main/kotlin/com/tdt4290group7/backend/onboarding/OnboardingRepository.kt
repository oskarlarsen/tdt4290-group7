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
import com.tdt4290group7.backend.vehicles.VehicleRegistryLookup
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
        val errorRowsCount: Int,
        val cachedAt: Instant
    )

    private val batchCache = ConcurrentHashMap<String, CachedBatch>()

    // Previews live in memory only until confirmed, so bound their age and count per supplier.
    private val batchTtl = java.time.Duration.ofMinutes(15)
    private val maxPendingBatchesPerSupplier = 5

    private fun evictBatches(supplierId: String, now: Instant) {
        batchCache.values.removeIf { it.cachedAt.plus(batchTtl) <= now }
        batchCache.values.filter { it.supplierId == supplierId }
            .sortedBy { it.cachedAt }
            .dropLast(maxPendingBatchesPerSupplier - 1)
            .forEach { batchCache.remove(it.batchId) }
    }

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
            migrateFacilityEnergyToQuarterly(db)
        }
    }

    /** Older databases hold one yearly row per facility. SQLite cannot change a UNIQUE key in place, so rebuild and map each to Q4. */
    private fun migrateFacilityEnergyToQuarterly(db: Connection) {
        val columns = database.query(db, "PRAGMA table_info(facility_energy)") { it.getString("name") }.toSet()
        if ("reporting_quarter" in columns) return
        val oldColumns = listOf(
            "id", "agreement_id", "location_code", "address", "storage_area_sqm", "workshop_area_sqm", "other_area_sqm",
            "reporting_year", "electricity_kwh", "district_heating_kwh", "biogas_kwh", "fossil_fuel_kwh",
            "self_produced_solar_kwh", "self_produced_heatpump_kwh", "notes", "created_at", "updated_at"
        ).joinToString(",")
        db.createStatement().use { st ->
            st.execute("DROP INDEX IF EXISTS idx_facility_energy_agreement")
            st.execute("ALTER TABLE facility_energy RENAME TO facility_energy_yearly")
            onboardingSchemaStatements.filter { it.contains("facility_energy") }.forEach { st.executeUpdate(it) }
            st.execute("INSERT INTO facility_energy ($oldColumns, reporting_quarter) SELECT $oldColumns, 4 FROM facility_energy_yearly")
            st.execute("DROP TABLE facility_energy_yearly")
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
        return queryStatusRow(db, supplierId) ?: error("Kunne ikke opprette første registreringspost")
    }

    private fun statusResponse(db: Connection, supplierId: String): OnboardingStatusResponse {
        val row = queryStatusRow(db, supplierId) ?: error("Registreringsstatus mangler")
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
                OnboardingStepStatus("PROFILE", "Kontaktperson for miljøoppfølging", profileComplete,
                    if (profileComplete) "$contactName ($contactEmail)" else "Kontaktopplysninger er påkrevd"),
                OnboardingStepStatus("AGREEMENTS", "Tilknyttede rammeavtaler", agreements.isNotEmpty(),
                    "${agreements.size} aktive avtaler registrert"),
                if (BatchEntityType.VEHICLES in requiredEntities) OnboardingStepStatus(
                    "VEHICLES", "Kjøretøy", missingVehicleAgreements == 0,
                    if (missingVehicleAgreements == 0) "$vehicleCount kjøretøy registrert"
                    else "$missingVehicleAgreements avtaler mangler fortsatt kjøretøyopplysninger"
                ) else null,
                if (BatchEntityType.ENERGY in requiredEntities) OnboardingStepStatus(
                    "ENERGY", "Energi", missingEnergyAgreements == 0,
                    if (missingEnergyAgreements == 0) "$energyCount energiregistreringer sendt inn"
                    else "$missingEnergyAgreements avtaler mangler fortsatt energiopplysninger"
                ) else null,
                if (BatchEntityType.PRODUCTS in requiredEntities) OnboardingStepStatus(
                    "PRODUCTS", "Produkter", missingProductAgreements == 0,
                    if (missingProductAgreements == 0) "$productsCount produkter sendt inn"
                    else "$missingProductAgreements avtaler mangler fortsatt produktopplysninger"
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

        require(name.length in 2..100) { "Navnet på kontaktpersonen må være mellom 2 og 100 tegn" }
        require(email.contains("@") && email.contains(".")) { "Oppgi en gyldig e-postadresse" }

        return database.write { db ->
            val statusRow = queryStatusRow(db, supplierId)
            val currentStatus = statusRow?.get("status")?.let { OnboardingStatus.valueOf(it as String) }
                ?: OnboardingStatus.INVITED
            require(currentStatus in editableStatuses) {
                "Leverandørprofilen kan ikke endres mens registreringen har status ${currentStatus.nb}"
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
                ?: ("Ukjent leverandør" to "000000000")

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
                ?: throw IllegalArgumentException("Fant ikke registreringsprofil for leverandør $supplierId")

            val currentStatus = OnboardingStatus.valueOf(row["status"] as String)
            require(
                currentStatus == OnboardingStatus.DATA_DRAFT ||
                    currentStatus == OnboardingStatus.REVISION_REQUIRED
            ) { "Kan ikke sende inn registreringen når gjeldende status er $currentStatus" }

            val contactName = row["contact_name"] as? String
            val contactEmail = row["contact_email"] as? String
            require(!contactName.isNullOrBlank() && !contactEmail.isNullOrBlank()) {
                "Navn og e-post for bærekraftskontakt er påkrevd før innsending"
            }
            val current = statusResponse(db, supplierId)
            require(current.canSubmit) {
                "Fullfør de påkrevde registreringstrinnene før innsending"
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
                ?: throw IllegalArgumentException("Fant ikke registreringsprofil for leverandør $supplierId")
            val currentStatus = OnboardingStatus.valueOf(row["status"] as String)
            require(currentStatus == OnboardingStatus.SUBMITTED || currentStatus == OnboardingStatus.UNDER_REVIEW) {
                "Kan ikke vurdere registreringen når gjeldende status er $currentStatus"
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

    private class PreparedBatch(
        val supplierId: String,
        val entityType: BatchEntityType,
        val fileName: String,
        val hash: String,
        val parse: CsvStreamParser.ParsedCsvResult,
        val now: Instant,
    )

    private fun prepareBatch(
        supplierId: String,
        entityType: BatchEntityType,
        fileName: String,
        fileBytes: ByteArray,
        now: Instant
    ): PreparedBatch {
        // Energy is a quarterly duty, so it stays open after onboarding is submitted; vehicles and products do not.
        if (entityType != BatchEntityType.ENERGY) database.read { db -> requireEditableSupplier(db, supplierId) }
        val allowedAgreements = requiredAgreementIds(supplierId, entityType)
        require(allowedAgreements.isNotEmpty()) {
            "Administratoren din har ikke bedt om informasjon om ${entityType.nb}"
        }
        val parseResult = CsvStreamParser.parseAndValidate(
            inputStream = fileBytes.inputStream(),
            entityType = entityType,
            allowedAgreementIds = allowedAgreements
        )
        return PreparedBatch(supplierId, entityType, fileName, sha256(fileBytes), parseResult, now)
    }

    /** Preview without a registry: vehicles left without a fuel become errors asking the supplier to fill it in. */
    fun createBatchPreview(
        supplierId: String,
        entityType: BatchEntityType,
        fileName: String,
        fileBytes: ByteArray,
        now: Instant
    ): CsvPreviewResponse {
        val prepared = prepareBatch(supplierId, entityType, fileName, fileBytes, now)
        val parse = prepared.parse
        if (entityType != BatchEntityType.VEHICLES || parse.errors.isNotEmpty()) return finishBatch(prepared, parse)
        val filled = VehicleRegistryFill.withoutRegistry(parse.rows)
        return finishBatch(prepared, parse.copy(rows = filled.rows, errors = filled.errors))
    }

    /**
     * Preview that asks Statens vegvesen for the fuel of registered vehicles the supplier left blank.
     * The lookups run here, before any database write, so they never hold the SQLite write lock.
     * A file that already has errors is not looked up, so a broken upload does not use the registry quota.
     */
    suspend fun createBatchPreview(
        supplierId: String,
        entityType: BatchEntityType,
        fileName: String,
        fileBytes: ByteArray,
        now: Instant,
        registry: VehicleRegistryLookup?
    ): CsvPreviewResponse {
        val prepared = prepareBatch(supplierId, entityType, fileName, fileBytes, now)
        val parse = prepared.parse
        if (entityType != BatchEntityType.VEHICLES || parse.errors.isNotEmpty()) return finishBatch(prepared, parse)
        val filled = VehicleRegistryFill.fillFromRegistry(parse.rows, registry, now)
        return finishBatch(prepared, parse.copy(rows = filled.rows, errors = filled.errors))
    }

    /** Energy rows overwrite a stored report for the same location and quarter, so say which ones before the import. */
    private fun energyNotices(rows: List<Map<String, String>>): List<String> = implausibleGooNotices(rows) + replacedEnergyNotices(rows)

    /** Guarantees of origin can only cover energy that was used, so more GoO than total energy is worth a second look. */
    private fun implausibleGooNotices(rows: List<Map<String, String>>): List<String> = rows.mapNotNull { row ->
        fun kwh(key: String) = row[key]?.toDoubleOrNull() ?: 0.0
        val total = listOf("electricity_kwh", "district_heating_kwh", "biogas_kwh", "fossil_fuel_kwh", "self_produced_solar_kwh").sumOf(::kwh)
        val goo = kwh("goo_covered_kwh")
        if (goo > total && total > 0) "${row["facility_location_code"]} ${row["reporting_year"]} Q${row["reporting_quarter"] ?: 4}: opprinnelsesgarantier (GoO) (${goo.toLong()} kWh) er høyere enn total energi som er oppgitt (${total.toLong()} kWh). Kontroller tallene." else null
    }

    private fun replacedEnergyNotices(rows: List<Map<String, String>>): List<String> = database.read { db ->
        rows.mapNotNull { row ->
            val agreementId = row["agreement_id"] ?: return@mapNotNull null
            val location = row["facility_location_code"] ?: return@mapNotNull null
            val year = row["reporting_year"]?.toIntOrNull() ?: return@mapNotNull null
            val quarter = row["reporting_quarter"]?.toIntOrNull() ?: 4
            val exists = database.query(
                db,
                "SELECT 1 FROM facility_energy WHERE agreement_id = ? AND location_code = ? AND reporting_year = ? AND reporting_quarter = ?",
                listOf(agreementId, location, year, quarter)
            ) { 1 }.isNotEmpty()
            if (exists) "$location $year Q$quarter har allerede en rapport. Import erstatter alle verdiene, inkludert sol, varmepumpe og GoO." else null
        }
    }

    private fun finishBatch(prepared: PreparedBatch, parseResult: CsvStreamParser.ParsedCsvResult): CsvPreviewResponse {
        val supplierId = prepared.supplierId
        val entityType = prepared.entityType
        val fileName = prepared.fileName
        val hash = prepared.hash
        val now = prepared.now
        val batchId = "batch-" + UUID.randomUUID().toString()
        val totalRows = parseResult.totalRows
        val rowErrors = parseResult.errors.map { it.row }.distinct().count { it > 1 }
        val errorRowsCount = if (parseResult.errors.any { it.row <= 1 } && totalRows > 0) totalRows else rowErrors
        val validRowsCount = totalRows - errorRowsCount
        val canCommit = parseResult.errors.isEmpty() && totalRows > 0

        if (canCommit) {
            evictBatches(supplierId, now)
            batchCache[batchId] = CachedBatch(
                batchId = batchId,
                supplierId = supplierId,
                entityType = entityType,
                fileName = fileName,
                fileHash = hash,
                rows = parseResult.rows,
                validRowsCount = validRowsCount,
                errorRowsCount = errorRowsCount,
                cachedAt = now
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
            previewRows = parseResult.rows.take(10),
            notices = if (entityType == BatchEntityType.ENERGY) energyNotices(parseResult.rows) else emptyList()
        )
    }

    fun confirmBatch(batchId: String, supplierId: String, now: Instant, byRole: String? = null): CsvConfirmResponse {
        val cached = batchCache[batchId]?.takeIf { it.cachedAt.plus(batchTtl) > now }
            ?: throw IllegalArgumentException("Forhåndsvisningen er utløpt eller ble ikke funnet. Last opp CSV-filen på nytt.")

        require(cached.supplierId == supplierId) { "Importen tilhører ikke organisasjonen din" }

        val ts = formatTimestamp(now)

        database.write { db ->
            if (cached.entityType != BatchEntityType.ENERGY) requireEditableSupplier(db, supplierId)
            val batchStatus = database.query(
                db,
                "SELECT status FROM upload_batches WHERE id = ? AND supplier_id = ?",
                listOf(batchId, supplierId)
            ) { it.getString("status") }.firstOrNull()
            require(batchStatus == BatchStatus.PREVIEWED.name) { "Importen er allerede bekreftet eller er ikke lenger tilgjengelig" }

            val requestedAgreementIds = queryRequiredAgreementIds(db, supplierId, cached.entityType)
            require(requestedAgreementIds.isNotEmpty() && cached.rows.all { row ->
                row["agreement_id"]?.let(requestedAgreementIds::contains) == true
            }) {
                "En eller flere avtaler er ikke lenger aktive eller ber ikke om denne informasjonstypen"
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
                    "committed_at" to ts,
                    "committed_by_role" to byRole
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
            message = "Importerte ${cached.rows.size} ${if (cached.rows.size == 1) "post" else "poster"}."
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
                "Kjøretøyet $regNumber er allerede tilordnet en annen leverandør"
            }

            if (existingOwner == null) {
                val exists = database.query(
                    db,
                    "SELECT 1 FROM vehicles WHERE registration_number = ?",
                    listOf(regNumber)
                ) { it.getInt(1) }.isNotEmpty()
                require(!exists) { "Kjøretøyet $regNumber er ikke knyttet til en avtale som tilhører organisasjonen din" }
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
            ) + (r["vehicle_category"]?.trim()?.takeIf { it.isNotEmpty() }?.let { mapOf("vehicle_category" to it) } ?: emptyMap())
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
            val quarter = r["reporting_quarter"]!!.trim().toInt()

            // Delete existing reading for composite key to ensure idempotent replace
            db.prepareStatement(
                "DELETE FROM facility_energy WHERE agreement_id = ? AND location_code = ? AND reporting_year = ? AND reporting_quarter = ?"
            ).use { stmt ->
                stmt.setString(1, agreementId)
                stmt.setString(2, locationCode)
                stmt.setInt(3, year)
                stmt.setInt(4, quarter)
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
                    "reporting_quarter" to quarter,
                    "electricity_kwh" to (r["electricity_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "district_heating_kwh" to (r["district_heating_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "biogas_kwh" to (r["biogas_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "fossil_fuel_kwh" to (r["fossil_fuel_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "self_produced_solar_kwh" to (r["self_produced_solar_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "self_produced_heatpump_kwh" to (r["self_produced_heatpump_kwh"]?.toDoubleOrNull() ?: 0.0),
                    "goo_covered_kwh" to (r["goo_covered_kwh"]?.toDoubleOrNull() ?: 0.0),
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

    /** The latest change to each supplier's data, and whether the supplier or an admin made it (null when unknown). */
    data class LastUpdate(val at: Instant, val by: String?)

    fun lastUpdatedBySupplier(): Map<String, LastUpdate> = database.read { db ->
        val sql = """
            SELECT supplier_id, committed_at AS at, committed_by_role AS role FROM upload_batches
              WHERE status = 'COMMITTED' AND committed_at IS NOT NULL
            UNION ALL
            SELECT a.supplier_id, c.occurred_at, 'ADMIN' FROM fleet_changes c JOIN agreements a ON a.id = c.agreement_id
        """.trimIndent()
        val latest = mutableMapOf<String, LastUpdate>()
        database.query(db, sql, emptyList()) { row ->
            val update = LastUpdate(Instant.parse(row.getString("at")), row.getString("role"))
            latest.merge(row.getString("supplier_id"), update) { a, b -> if (b.at.isAfter(a.at)) b else a }
        }
        latest
    }

    /** Every agreement of the supplier, including ended ones: their certificates stay on the supplier's list as history. */
    fun getSupplierAgreementIds(supplierId: String): Set<String> {
        return database.read { db ->
            database.query(
                db,
                "SELECT id FROM agreements WHERE supplier_id = ?",
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
                       COALESCE(d.vehicle_category, (SELECT s.vehicle_category FROM svv_snapshots s
                           WHERE s.registration_number = v.registration_number ORDER BY s.fetched_at DESC, s.id DESC LIMIT 1)) AS vehicle_category,
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
                    vehicleCategory = row.getString("vehicle_category"),
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
                ORDER BY fe.reporting_year DESC, fe.reporting_quarter DESC, fe.location_code
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
                    reportingQuarter = row.getInt("reporting_quarter"),
                    electricityKwh = row.getDouble("electricity_kwh"),
                    districtHeatingKwh = row.getDouble("district_heating_kwh"),
                    biogasKwh = row.getDouble("biogas_kwh"),
                    fossilFuelKwh = row.getDouble("fossil_fuel_kwh"),
                    selfProducedSolarKwh = row.getDouble("self_produced_solar_kwh"),
                    selfProducedHeatpumpKwh = row.getDouble("self_produced_heatpump_kwh"),
                    gooCoveredKwh = row.getDouble("goo_covered_kwh"),
                    notes = row.getString("notes"),
                    createdAt = row.getString("created_at"),
                    updatedAt = row.getString("updated_at")
                )
            }
        }
    }

    // -------------------------------------------------------------------------
    // Energy oversight (admin): commitments, per-contract compliance, evidence
    // -------------------------------------------------------------------------

    /** Every active agreement that requires energy reporting, assessed for [year]. */
    fun getEnergySummaries(year: Int, currentYear: Int): List<EnergyContractSummary> = database.read { db ->
        val commitments = database.query(db, "SELECT * FROM agreement_energy_commitments") {
            it.getString("agreement_id") to EnergyCommitment(it.getDouble("min_self_produced_kwh"), it.getDouble("min_goo_kwh"))
        }.toMap()
        val rowsByAgreement = database.query(db, "SELECT * FROM facility_energy WHERE reporting_year = ?", listOf(year)) { it.toEnergyRow() }
            .groupBy { it.agreementId }
        val evidenceByAgreement = database.query(
            db,
            "SELECT id, agreement_id, reporting_year, reporting_quarter, file_name, content_type, size_bytes, uploaded_at FROM energy_evidence WHERE reporting_year = ? ORDER BY uploaded_at DESC",
            listOf(year)
        ) {
            it.getString("agreement_id") to EnergyEvidenceInfo(
                it.getString("id"), it.getInt("reporting_year"), it.getInt("reporting_quarter"),
                it.getString("file_name"), it.getString("content_type"), it.getLong("size_bytes"), it.getString("uploaded_at")
            )
        }.groupBy({ it.first }, { it.second })

        database.query(
            db,
            """SELECT a.id, a.saksnr, s.id AS supplier_id, s.name, s.org_number
               FROM agreements a JOIN suppliers s ON a.supplier_id = s.id
               WHERE a.requires_energy = 1 AND a.active = 1 AND s.active = 1
                 AND ((CAST(substr(a.start_date, 1, 4) AS INTEGER) <= ? AND CAST(substr(a.end_date, 1, 4) AS INTEGER) >= ?)
                      OR EXISTS (SELECT 1 FROM facility_energy f WHERE f.agreement_id = a.id AND f.reporting_year = ?))
               ORDER BY s.name, a.id""",
            listOf(year, year, year)
        ) { row ->
            val agreementId = row.getString("id")
            val rows = rowsByAgreement[agreementId].orEmpty()
            val quarterTotals = rows.groupBy { it.quarter }.map { (quarter, quarterRows) ->
                EnergyQuarterTotal(quarter, quarterRows.sumOf { it.selfProducedKwh }, quarterRows.sumOf { it.gooCoveredKwh }, quarterRows.sumOf { it.consumedKwh })
            }.sortedBy { it.quarter }
            val commitment = commitments[agreementId]
            val assessment = assessEnergy(commitment, quarterTotals, year, currentYear)
            val consumed = quarterTotals.sumOf { it.consumedKwh }
            val self = quarterTotals.sumOf { it.selfProducedKwh }
            // Area is the same every quarter, so count each location once.
            val area = rows.groupBy { it.locationCode }.values.sumOf { locationRows -> locationRows.maxOf { it.areaSqm } }
            EnergyContractSummary(
                agreementId = agreementId,
                supplierId = row.getString("supplier_id"),
                supplierName = row.getString("name"),
                orgNumber = row.getString("org_number"),
                saksnr = row.getString("saksnr"),
                year = year,
                commitment = commitment,
                status = assessment.status,
                reportedQuarters = quarterTotals.map { it.quarter },
                selfProducedKwh = self,
                gooCoveredKwh = quarterTotals.sumOf { it.gooCoveredKwh },
                consumedKwh = consumed,
                selfProducedDeviationKwh = assessment.selfProducedDeviationKwh,
                gooDeviationKwh = assessment.gooDeviationKwh,
                projectedSelfProducedKwh = assessment.projectedSelfProducedKwh,
                projectedGooKwh = assessment.projectedGooKwh,
                selfProducedSharePercent = if (consumed > 0) self / consumed * 100 else null,
                kwhPerSqm = if (area > 0) consumed / area else null,
                quarterTotals = quarterTotals,
                facilities = rows.sortedWith(compareBy({ it.locationCode }, { it.quarter })).map {
                    EnergyFacilityQuarter(it.locationCode, it.address, it.quarter, it.areaSqm, it.consumedKwh, it.selfProducedKwh, it.gooCoveredKwh)
                },
                evidence = evidenceByAgreement[agreementId].orEmpty(),
            )
        }
    }

    fun setEnergyCommitment(agreementId: String, input: EnergyCommitmentInput, now: Instant) {
        require(input.minSelfProducedKwh.isFinite() && input.minSelfProducedKwh in 0.0..MAX_ENERGY_COMMITMENT_KWH) {
            "minSelfProducedKwh må være mellom 0 og 10 000 000 000 kWh"
        }
        require(input.minGooKwh.isFinite() && input.minGooKwh in 0.0..MAX_ENERGY_COMMITMENT_KWH) {
            "minGooKwh må være mellom 0 og 10 000 000 000 kWh"
        }
        database.write { db ->
            require(database.query(db, "SELECT 1 FROM agreements WHERE id = ?", listOf(agreementId)) { 1 }.isNotEmpty()) { "Unknown agreement" }
            db.prepareStatement(
                """INSERT INTO agreement_energy_commitments (agreement_id, min_self_produced_kwh, min_goo_kwh, updated_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT(agreement_id) DO UPDATE SET min_self_produced_kwh = excluded.min_self_produced_kwh,
                   min_goo_kwh = excluded.min_goo_kwh, updated_at = excluded.updated_at"""
            ).use {
                it.setString(1, agreementId); it.setDouble(2, input.minSelfProducedKwh); it.setDouble(3, input.minGooKwh)
                it.setString(4, formatTimestamp(now)); it.executeUpdate()
            }
        }
    }

    fun addEnergyEvidence(
        supplierId: String, agreementId: String, year: Int, quarter: Int,
        fileName: String, contentType: String, bytes: ByteArray, now: Instant,
    ): EnergyEvidenceInfo {
        require(quarter in 1..4) { "quarter må være 1–4" }
        require(year in 2020..2030) { "year må være mellom 2020 og 2030" }
        return database.write { db ->
            // The agreement must belong to the supplier, so one supplier cannot attach files to another's contract.
            require(
                database.query(db, "SELECT 1 FROM agreements WHERE id = ? AND supplier_id = ? AND requires_energy = 1", listOf(agreementId, supplierId)) { 1 }.isNotEmpty()
            ) { "Avtalen krever ikke energirapportering for denne leverandøren" }
            val id = "evd-" + UUID.randomUUID()
            database.insert(
                db, "energy_evidence",
                mapOf(
                    "id" to id, "agreement_id" to agreementId, "reporting_year" to year, "reporting_quarter" to quarter,
                    "file_name" to fileName, "content_type" to contentType, "size_bytes" to bytes.size.toLong(),
                    "data" to bytes, "uploaded_at" to formatTimestamp(now)
                )
            )
            EnergyEvidenceInfo(id, year, quarter, fileName, contentType, bytes.size.toLong(), formatTimestamp(now))
        }
    }

    fun getSupplierEnergyEvidence(supplierId: String): List<EnergyEvidenceInfo> = database.read { db ->
        database.query(
            db,
            """SELECT e.id, e.reporting_year, e.reporting_quarter, e.file_name, e.content_type, e.size_bytes, e.uploaded_at
               FROM energy_evidence e JOIN agreements a ON e.agreement_id = a.id WHERE a.supplier_id = ?
               ORDER BY e.uploaded_at DESC""",
            listOf(supplierId)
        ) {
            EnergyEvidenceInfo(it.getString("id"), it.getInt("reporting_year"), it.getInt("reporting_quarter"), it.getString("file_name"),
                it.getString("content_type"), it.getLong("size_bytes"), it.getString("uploaded_at"))
        }
    }

    /** The file, or null. A supplier only gets its own files; [supplierId] null means an admin. */
    fun getEnergyEvidenceFile(id: String, supplierId: String?): Pair<EnergyEvidenceInfo, ByteArray>? = database.read { db ->
        database.query(
            db,
            """SELECT e.*, a.supplier_id FROM energy_evidence e JOIN agreements a ON e.agreement_id = a.id WHERE e.id = ?""",
            listOf(id)
        ) {
            if (supplierId != null && it.getString("supplier_id") != supplierId) return@query null
            EnergyEvidenceInfo(it.getString("id"), it.getInt("reporting_year"), it.getInt("reporting_quarter"), it.getString("file_name"),
                it.getString("content_type"), it.getLong("size_bytes"), it.getString("uploaded_at")) to it.getBytes("data")
        }.firstOrNull()
    }

    fun deleteEnergyEvidence(id: String, supplierId: String): Boolean = database.write { db ->
        db.prepareStatement(
            "DELETE FROM energy_evidence WHERE id = ? AND agreement_id IN (SELECT id FROM agreements WHERE supplier_id = ?)"
        ).use { it.setString(1, id); it.setString(2, supplierId); it.executeUpdate() > 0 }
    }

    private class EnergyRow(
        val agreementId: String, val locationCode: String, val address: String, val quarter: Int,
        val areaSqm: Double, val consumedKwh: Double, val selfProducedKwh: Double, val gooCoveredKwh: Double,
    )

    // Total energy follows the tender sheet: electricity + district heating (+ biogas, fossil) + own solar.
    // Heat pump output is already inside purchased electricity, so it counts as self-produced but not as extra consumption.
    private fun ResultSet.toEnergyRow() = EnergyRow(
        agreementId = getString("agreement_id"), locationCode = getString("location_code"), address = getString("address"),
        quarter = getInt("reporting_quarter"),
        areaSqm = getDouble("storage_area_sqm") + getDouble("workshop_area_sqm") + getDouble("other_area_sqm"),
        consumedKwh = getDouble("electricity_kwh") + getDouble("district_heating_kwh") + getDouble("biogas_kwh") +
            getDouble("fossil_fuel_kwh") + getDouble("self_produced_solar_kwh"),
        selfProducedKwh = getDouble("self_produced_solar_kwh") + getDouble("self_produced_heatpump_kwh"),
        gooCoveredKwh = getDouble("goo_covered_kwh"),
    )

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
                ?: ("Ukjent leverandør" to "000000000")

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
            "Leverandørdata kan ikke endres mens registreringen har status ${status.nb}"
        }
    }

    private fun querySupplierAgreements(db: Connection, supplierId: String): List<SupplierAgreementSummary> {
        val sql = """
            SELECT a.id, a.note, a.saksnr, a.start_date, a.end_date, a.allowed_vehicles, a.active,
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
                saksnr = row.getString("saksnr"),
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
