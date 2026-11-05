package com.tdt4290group7.backend.admin

import com.tdt4290group7.backend.certificates.Certificate
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.certificates.CertificateTypes
import com.tdt4290group7.backend.vehicles.DeviationPriority
import com.tdt4290group7.backend.vehicles.FleetRepository
import com.tdt4290group7.backend.vehicles.agreementLabel
import com.tdt4290group7.backend.vehicles.VehicleRepository
import com.tdt4290group7.backend.vehicles.adminActor
import com.tdt4290group7.backend.onboarding.OnboardingStatus
import com.tdt4290group7.backend.repository.UserRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.application.log
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlinx.serialization.Serializable

private val OSLO_ZONE: ZoneId = ZoneId.of("Europe/Oslo")
private val ALERT_SEVERITIES = setOf("high", "medium", "low")
private val ALERT_CATEGORIES = setOf("ENVIRONMENTAL_COMPLIANCE", "ENERGY_FUEL", "VEHICLE_COMPLIANCE", "CERTIFICATES")
private val ALERT_FINDING_TYPES = setOf("CONFIRMED_DEVIATION", "MISSING_DOCUMENTATION", "UPCOMING_EXPIRY")
private val ALERT_STATUSES = setOf("OPEN", "IN_PROGRESS", "UNDER_REVIEW", "RESOLVED")
private val SUPPLIER_REVIEW_STATUSES = setOf("to-review", "in-progress", "resolved")
private val NOTE_VISIBILITIES = setOf("SELF", "INTERNAL")

@Serializable
data class DashboardKpis(
    val totalSuppliers: Int,
    val totalSuppliersDeltaThisMonth: Int,
    val highRiskSuppliers: Int,
    val monitoredSuppliers: Int,
    val activeAlerts: Int,
    val alertsBySeverity: AlertSeverityCounts,
    val complianceRatePercent: Double,
    val complianceTargetPercent: Int,
    val assessedSuppliers: Int,
    val activeAgreements: Int,
    val listedVehicles: Int,
    val certificatesTracked: Int,
    val expiredCertificates: Int,
    val certificatesExpiringWithin90Days: Int,
)

@Serializable
data class AlertSeverityCounts(val high: Int, val medium: Int, val low: Int)

@Serializable
data class RiskCount(val count: Int, val percent: Int)

@Serializable
data class RiskClassification(val compliant: RiskCount, val medium: RiskCount, val high: RiskCount, val unassessed: RiskCount)

@Serializable
data class DashboardSupplier(
    val id: String,
    val displayName: String,
    val orgId: String,
    val email: String? = null,
    val primaryContract: String,
    val risk: String,
    val mainIssue: String,
    val issueCategory: String? = null,
    /** Every category that applies, so a supplier with both a vehicle and a certificate problem is in both lists. */
    val issueCategories: List<String> = emptyList(),
    val onboardingStatus: OnboardingStatus = OnboardingStatus.INVITED,
    val contactName: String? = null,
    val contactEmail: String? = null,
    val contactPhone: String? = null,
    val reviewerNotes: String? = null,
    val submittedAt: String? = null,
    val reviewedAt: String? = null,
    val agreementCount: Int = 0,
    val vehicleCount: Int = 0,
    val certificateCount: Int = 0,
    val energyRecordCount: Int = 0,
    val productCount: Int = 0,
    val registeredAccountCount: Int = 0,
)

@Serializable
data class IssueCategoryBreakdown(
    val vehicleDeviation: Int,
    val certificateExpiry: Int,
    val fuelDeviation: Int? = null,
    val modeledSupplierCount: Int,
)

@Serializable
data class AffectedItem(val type: String, val name: String? = null)

@Serializable
data class RecentAlert(
    val id: String,
    val severity: String,
    val title: String,
    val description: String,
    val timeAgo: String,
    val createdAt: String,
    val status: String,
    val category: String,
    val source: String,
    val dueDate: String? = null,
    val archivedAt: String? = null,
    val findingType: String,
    val affectedItem: AffectedItem? = null,
    val reason: String? = null,
    val supplierId: String? = null,
)

@Serializable
data class AdminDashboardSummary(
    val lastSyncedAt: String,
    val kpis: DashboardKpis,
    val riskClassification: RiskClassification,
    val topRiskSuppliers: List<DashboardSupplier>,
    val suppliersRequiringAttention: List<DashboardSupplier>,
    val issueCategoryBreakdown: IssueCategoryBreakdown,
    val recentAlerts: List<RecentAlert>,
)

@Serializable
data class ManualAlertInput(
    val title: String,
    val supplierId: String,
    val category: String,
    val severity: String,
    val findingType: String,
    val description: String,
    val dueDate: String? = null,
)

@Serializable
data class AlertStatusUpdate(val status: String)

@Serializable
data class SupplierReviewStatusUpdate(val status: String)

@Serializable
data class SupplierNoteInput(val text: String, val visibility: String = "SELF", val alertId: String? = null)

@Serializable
data class SupplierNote(
    val id: String,
    val supplierId: String,
    val authorId: String,
    val authorName: String,
    val visibility: String,
    val text: String,
    val alertId: String? = null,
    val createdAt: String,
)

private fun SupplierNoteRecord.toNote() = SupplierNote(id, supplierId, authorId, authorName, visibility, text, alertId, createdAt)

private data class SupplierEvidence(
    var hasEvidence: Boolean = false,
    var hasHighFinding: Boolean = false,
    var hasModerateFinding: Boolean = false,
    var hasVehicleFinding: Boolean = false,
    var hasCertificateFinding: Boolean = false,
    val issues: MutableList<String> = mutableListOf(),
)

fun Route.adminDashboardRoutes(
    fleet: FleetRepository,
    vehicles: VehicleRepository,
    certificates: CertificateRepository,
    insights: AdminInsightsRepository,
) {
    get("/api/admin/dashboard/summary") {
        if (call.adminActor() == null) return@get
        refreshFindings(fleet, vehicles, certificates, insights)
        call.respond(buildSummary(fleet, vehicles, certificates, insights))
    }

    post("/api/admin/dashboard/sync") {
        if (call.adminActor() == null) return@post
        val syncedAt = refreshFindings(fleet, vehicles, certificates, insights)
        call.respond(mapOf("lastSyncedAt" to syncedAt))
    }

    get("/api/admin/risk-log") {
        if (call.adminActor() == null) return@get
        refreshFindings(fleet, vehicles, certificates, insights)
        call.respond(buildSummary(fleet, vehicles, certificates, insights).topRiskSuppliers.map { supplier ->
            mapOf(
                "Supplier" to supplier.displayName,
                "Org ID" to supplier.orgId,
                "Contract" to supplier.primaryContract,
                "Risk level" to supplier.risk.uppercase(),
                "Issue" to supplier.mainIssue,
            )
        })
    }

    get("/api/admin/alerts") {
        if (call.adminActor() == null) return@get
        refreshFindings(fleet, vehicles, certificates, insights)
        val records = if (call.request.queryParameters["includeArchived"] == "true") insights.allAlerts() + insights.archivedAlerts() else insights.allAlerts()
        call.respond(records.map(::toRecentAlert))
    }

    post("/api/admin/alerts/{id}/archive") {
        val actor = call.adminActor() ?: return@post
        val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
        if (!insights.archive(id, actor.id, Instant.now())) return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Alert not found"))
        call.application.log.info("admin_alert_archived alertId={} actorId={}", id, actor.id)
        call.respondText("", status = HttpStatusCode.NoContent)
    }

    post("/api/admin/alerts/{id}/restore") {
        val actor = call.adminActor() ?: return@post
        val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
        if (!insights.restore(id)) return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Archived alert not found"))
        call.application.log.info("admin_alert_restored alertId={} actorId={}", id, actor.id)
        call.respondText("", status = HttpStatusCode.NoContent)
    }

    post("/api/admin/alerts") {
        val actor = call.adminActor() ?: return@post
        val input = call.receive<ManualAlertInput>().validated()
        require(fleet.overview().suppliers.any { it.id == input.supplierId }) { "Select an active supplier" }
        val alert = insights.createManual(
            title = input.title.trim(),
            description = input.description.trim(),
            severity = input.severity,
            supplierId = input.supplierId,
            category = input.category,
            findingType = input.findingType,
            dueDate = input.dueDate,
            now = Instant.now(),
        )
        call.application.log.info("admin_alert_created alertId={} actorId={}", alert.id, actor.id)
        call.respond(HttpStatusCode.Created, toRecentAlert(alert))
    }

    patch("/api/admin/alerts/{id}") {
        if (call.adminActor() == null) return@patch
        val id = call.parameters["id"] ?: return@patch call.respond(HttpStatusCode.BadRequest)
        val status = call.receive<AlertStatusUpdate>().status
        require(status in ALERT_STATUSES) { "Select a valid alert status" }
        val alert = insights.updateStatus(id, status)
            ?: return@patch call.respond(HttpStatusCode.NotFound, mapOf("error" to "Alert not found"))
        call.respond(toRecentAlert(alert))
    }

    delete("/api/admin/alerts/{id}") {
        if (call.adminActor() == null) return@delete
        val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
        if (!insights.delete(id)) return@delete call.respond(HttpStatusCode.NotFound, mapOf("error" to "Alert not found"))
        call.respondText("", status = HttpStatusCode.NoContent)
    }

    get("/api/admin/supplier-reviews") {
        if (call.adminActor() == null) return@get
        val activeSupplierIds = fleet.overview().suppliers.mapTo(mutableSetOf()) { it.id }
        call.respond(insights.supplierReviewStatuses().filterKeys(activeSupplierIds::contains))
    }

    // Notes are admin-only: no supplier route reads them. SELF notes are filtered by author on the server.
    get("/api/admin/suppliers/{supplierId}/notes") {
        val actor = call.adminActor() ?: return@get
        val supplierId = call.parameters["supplierId"] ?: return@get call.respond(HttpStatusCode.BadRequest)
        call.respond(insights.notesFor(supplierId, actor.id).map { it.toNote() })
    }

    post("/api/admin/suppliers/{supplierId}/notes") {
        val actor = call.adminActor() ?: return@post
        val supplierId = call.parameters["supplierId"] ?: return@post call.respond(HttpStatusCode.BadRequest)
        if (fleet.overview().suppliers.none { it.id == supplierId }) {
            return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Supplier not found"))
        }
        val input = call.receive<SupplierNoteInput>()
        val text = input.text.trim()
        require(text.length in 1..2000) { "Note must be between 1 and 2000 characters" }
        require(input.visibility in NOTE_VISIBILITIES) { "Select who can see the note" }
        require(input.alertId == null || input.alertId.length <= 100) { "Invalid alert reference" }
        val note = insights.addNote(supplierId, actor.id, actor.name, input.visibility, text, input.alertId, Instant.now())
        call.application.log.info("admin_note_created noteId={} actorId={} visibility={}", note.id, actor.id, note.visibility)
        call.respond(HttpStatusCode.Created, note.toNote())
    }

    put("/api/admin/supplier-reviews/{supplierId}") {
        val actor = call.adminActor() ?: return@put
        val supplierId = call.parameters["supplierId"] ?: return@put call.respond(HttpStatusCode.BadRequest)
        require(fleet.overview().suppliers.any { it.id == supplierId }) { "Supplier is not active" }
        val status = call.receive<SupplierReviewStatusUpdate>().status
        require(status in SUPPLIER_REVIEW_STATUSES) { "Select a valid supplier review status" }
        insights.setSupplierReviewStatus(supplierId, status, actor.id, Instant.now())
        call.respond(mapOf("supplierId" to supplierId, "status" to status))
    }
}

private fun ManualAlertInput.validated(): ManualAlertInput {
    require(title.trim().length in 1..200) { "Alert title must be between 1 and 200 characters" }
    require(description.trim().length in 1..4000) { "Alert description must be between 1 and 4000 characters" }
    require(severity in ALERT_SEVERITIES) { "Select a valid alert severity" }
    require(category in ALERT_CATEGORIES) { "Select a valid alert category" }
    require(findingType in ALERT_FINDING_TYPES) { "Select a valid finding type" }
    dueDate?.let { value ->
        require(value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) { "Due date must use YYYY-MM-DD" }
        try {
            LocalDate.parse(value)
        } catch (_: Exception) {
            throw IllegalArgumentException("Enter a valid due date")
        }
    }
    return this
}

private fun refreshFindings(
    fleet: FleetRepository,
    vehicles: VehicleRepository,
    certificates: CertificateRepository,
    insights: AdminInsightsRepository,
): String {
    val now = Instant.now()
    val today = LocalDate.now(OSLO_ZONE)
    val overview = fleet.overview()
    val activeSuppliers = overview.suppliers.associateBy { it.id }
    val agreements = overview.agreements.associateBy { it.id }
    val findings = mutableListOf<AdminAlertRecord>()

    overview.vehicles.filter { it.listed && !it.planned }.forEach { vehicle ->
        val supplierId = vehicle.agreementId?.let(agreements::get)?.supplierId ?: return@forEach
        if (supplierId !in activeSuppliers) return@forEach
        val latestCheckId = vehicles.vehicleDetails(vehicle.registrationNumber)?.latestCheck?.id ?: return@forEach
        val check = vehicles.findCheck(latestCheckId) ?: return@forEach
        check.findings.forEach { finding ->
            val findingKey = "vehicle:${check.id}:${finding.code}:${finding.tripRowId.orEmpty()}"
            val description = finding.description
            findings += AdminAlertRecord(
                id = UUID.nameUUIDFromBytes(findingKey.toByteArray()).toString(),
                title = finding.code.name.replace('_', ' ').lowercase().replaceFirstChar(Char::uppercase),
                description = description,
                severity = if (finding.priority == DeviationPriority.HIGH) "high" else "medium",
                status = "OPEN",
                supplierId = supplierId,
                category = "VEHICLE_COMPLIANCE",
                findingType = "CONFIRMED_DEVIATION",
                source = "AUTOMATIC",
                dueDate = null,
                affectedItemType = "Vehicle",
                affectedItemName = vehicle.registrationNumber,
                reason = description,
                createdAt = check.checkedAt,
                findingKey = findingKey,
            )
        }
    }

    val certificateAgreementLinks = certificates.getAll().mapNotNull { certificate ->
        val expiry = certificate.expiryDate ?: return@mapNotNull null
        val daysRemaining = ChronoUnit.DAYS.between(today, expiry)
        if (daysRemaining > CertificateTypes.warningDays(certificate.certificateType)) return@mapNotNull null
        val supplierId = certificate.contractId?.let(agreements::get)?.supplierId
            ?.takeIf(activeSuppliers::containsKey)
        // Each warning level is its own alert, so resolving an early, low warning cannot hide a later one.
        val level = when {
            daysRemaining < 0 -> "expired"
            daysRemaining <= 30 -> "30"
            daysRemaining <= 90 -> "90"
            else -> "365"
        }
        val findingKey = "certificate:${certificate.id}:$expiry:$level"
        val severity = when (level) { "expired", "30" -> "high"; "90" -> "medium"; else -> "low" }
        val statusText = if (daysRemaining < 0) "has expired" else "expires in $daysRemaining days"
        AdminAlertRecord(
            id = UUID.nameUUIDFromBytes(findingKey.toByteArray()).toString(),
            title = "Certificate $statusText",
            description = "${certificate.certificateType} certificate for ${certificate.supplierName} $statusText.",
            severity = severity,
            status = "OPEN",
            supplierId = supplierId,
            category = "CERTIFICATES",
            findingType = if (daysRemaining < 0) "CONFIRMED_DEVIATION" else "UPCOMING_EXPIRY",
            source = "AUTOMATIC",
            dueDate = expiry.toString(),
            affectedItemType = "Document",
            affectedItemName = "${certificate.certificateType} (${certificate.id})",
            reason = "Recorded expiry date: $expiry",
            createdAt = now.toString(),
            findingKey = findingKey,
        )
    }
    findings += certificateAgreementLinks
    findings.forEach(insights::upsertFinding)
    insights.resolveInactiveFindings(findings.mapNotNull { it.findingKey }.toSet())
    val syncedAt = now.toString()
    insights.setLastSyncedAt(syncedAt)
    return syncedAt
}

private fun buildSummary(
    fleet: FleetRepository,
    vehicles: VehicleRepository,
    certificates: CertificateRepository,
    insights: AdminInsightsRepository,
): AdminDashboardSummary {
    val overview = fleet.overview()
    val activeSuppliers = overview.suppliers.associateBy { it.id }
    val agreementsById = overview.agreements.associateBy { it.id }
    val evidence = activeSuppliers.keys.associateWith { SupplierEvidence() }
    val linkedCertificates = certificates.getAll().mapNotNull { certificate ->
        val supplierId = certificate.contractId?.let(agreementsById::get)?.supplierId
            ?.takeIf(activeSuppliers::containsKey) ?: return@mapNotNull null
        supplierId to certificate
    }
    val today = LocalDate.now(OSLO_ZONE)
    val certificateIssueSuppliers = mutableSetOf<String>()
    linkedCertificates.forEach { (supplierId, certificate) ->
        val expiry = certificate.expiryDate ?: return@forEach
        val daysRemaining = ChronoUnit.DAYS.between(today, expiry)
        if (daysRemaining > 90) {
            evidence.getValue(supplierId).hasEvidence = true
            return@forEach
        }
        val record = evidence.getValue(supplierId)
        record.hasEvidence = true
        record.hasCertificateFinding = true
        certificateIssueSuppliers += supplierId
        if (daysRemaining < 0 || daysRemaining <= 30) record.hasHighFinding = true
        else record.hasModerateFinding = true
        record.issues += if (daysRemaining < 0) "${certificate.certificateType} certificate expired"
            else "${certificate.certificateType} expires in $daysRemaining days"
    }

    val vehicleIssueSuppliers = mutableSetOf<String>()
    overview.vehicles.filter { it.listed && !it.planned }.forEach { vehicle ->
        val supplierId = vehicle.agreementId?.let(agreementsById::get)?.supplierId
            ?.takeIf(activeSuppliers::containsKey) ?: return@forEach
        val latestCheckId = vehicles.vehicleDetails(vehicle.registrationNumber)?.latestCheck?.id ?: return@forEach
        val check = vehicles.findCheck(latestCheckId) ?: return@forEach
        val supplierEvidence = evidence.getValue(supplierId)
        supplierEvidence.hasEvidence = true
        check.findings.forEach { finding ->
            supplierEvidence.hasVehicleFinding = true
            vehicleIssueSuppliers += supplierId
            if (finding.priority == DeviationPriority.HIGH) supplierEvidence.hasHighFinding = true
            else supplierEvidence.hasModerateFinding = true
            supplierEvidence.issues += "${vehicle.registrationNumber}: ${finding.description}"
        }
    }

    val riskForSupplier = evidence.mapValues { (_, record) ->
        when {
            record.hasHighFinding -> "high"
            record.hasModerateFinding -> "medium"
            record.hasEvidence -> "compliant"
            else -> "unassessed"
        }
    }
    val assessedCount = riskForSupplier.values.count { it != "unassessed" }
    fun percentage(count: Int) = if (assessedCount == 0) 0 else (count * 100.0 / assessedCount).toInt()
    // The four risk rows share one denominator, all active suppliers, so their percentages add up to about 100.
    // complianceRatePercent below keeps its own denominator (assessed suppliers only).
    fun riskRow(level: String): RiskCount {
        val count = riskForSupplier.values.count { it == level }
        val total = riskForSupplier.size
        return RiskCount(count, if (total == 0) 0 else (count * 100.0 / total).toInt())
    }
    val riskClassification = RiskClassification(
        compliant = riskRow("compliant"),
        medium = riskRow("medium"),
        high = riskRow("high"),
        unassessed = riskRow("unassessed"),
    )
    val agreementsBySupplier = overview.agreements.groupBy { it.supplierId }
    val onboardingBySupplier = vehicles.onboarding.getAdminSupplierOnboardingSummaries().associateBy { it.supplierId }
    val registeredAccountsBySupplier = UserRepository.supplierAccountCounts()
    val dashboardSuppliers = activeSuppliers.values.map { supplier ->
        val risk = riskForSupplier.getValue(supplier.id)
        val onboarding = onboardingBySupplier[supplier.id]
        val mainIssue = evidence.getValue(supplier.id).issues.firstOrNull()
            ?: if (risk == "unassessed") "No persisted vehicle check or dated certificate evidence"
            else "No flagged findings in stored checks and certificates"
        val agreement = agreementsBySupplier[supplier.id]?.firstOrNull()
        DashboardSupplier(
            id = supplier.id,
            displayName = supplier.name,
            orgId = supplier.orgNumber,
            primaryContract = agreement?.let { agreementLabel(it.saksnr, it.note) } ?: "No active agreement",
            risk = risk,
            mainIssue = mainIssue,
            issueCategory = when {
                evidence.getValue(supplier.id).hasVehicleFinding -> "VEHICLE_DEVIATION"
                evidence.getValue(supplier.id).hasCertificateFinding -> "CERTIFICATE_EXPIRY"
                else -> null
            },
            issueCategories = listOfNotNull(
                "VEHICLE_DEVIATION".takeIf { evidence.getValue(supplier.id).hasVehicleFinding },
                "CERTIFICATE_EXPIRY".takeIf { evidence.getValue(supplier.id).hasCertificateFinding },
            ),
            onboardingStatus = onboarding?.status ?: OnboardingStatus.INVITED,
            contactName = onboarding?.contactName,
            contactEmail = onboarding?.contactEmail,
            contactPhone = onboarding?.contactPhone,
            reviewerNotes = onboarding?.reviewerNotes,
            submittedAt = onboarding?.submittedAt,
            reviewedAt = onboarding?.reviewedAt,
            agreementCount = onboarding?.agreementCount ?: 0,
            vehicleCount = onboarding?.vehicleCount ?: 0,
            certificateCount = onboarding?.certificateCount ?: 0,
            energyRecordCount = onboarding?.energyRecordCount ?: 0,
            productCount = onboarding?.productCount ?: 0,
            registeredAccountCount = registeredAccountsBySupplier[supplier.id] ?: 0,
        )
    }
    val alerts = insights.allAlerts()
    val unresolvedAlerts = alerts.filter { it.status != "RESOLVED" }
    val highCount = unresolvedAlerts.count { it.severity == "high" }
    val mediumCount = unresolvedAlerts.count { it.severity == "medium" }
    val lowCount = unresolvedAlerts.count { it.severity == "low" }
    val noFlagCount = riskClassification.compliant.count
    val certificateRecords = certificates.getAll()
    val listedVehicleCount = overview.vehicles.count { it.listed }
    val expiringCertificates = certificateRecords.count { certificate ->
        val expiry = certificate.expiryDate ?: return@count false
        val daysRemaining = ChronoUnit.DAYS.between(today, expiry)
        daysRemaining in 0..90
    }
    val lastSyncedAt = insights.lastSyncedAt() ?: Instant.now().toString()
    return AdminDashboardSummary(
        lastSyncedAt = lastSyncedAt,
        kpis = DashboardKpis(
            totalSuppliers = activeSuppliers.size,
            totalSuppliersDeltaThisMonth = 0,
            highRiskSuppliers = riskClassification.high.count,
            monitoredSuppliers = assessedCount,
            activeAlerts = unresolvedAlerts.size,
            alertsBySeverity = AlertSeverityCounts(highCount, mediumCount, lowCount),
            complianceRatePercent = percentage(noFlagCount).toDouble(),
            complianceTargetPercent = 0,
            assessedSuppliers = assessedCount,
            activeAgreements = overview.agreements.size,
            listedVehicles = listedVehicleCount,
            certificatesTracked = certificateRecords.size,
            expiredCertificates = certificateRecords.count { it.expiryDate?.isBefore(today) == true },
            certificatesExpiringWithin90Days = expiringCertificates,
        ),
        riskClassification = riskClassification,
        topRiskSuppliers = dashboardSuppliers,
        suppliersRequiringAttention = dashboardSuppliers.filter { it.risk == "high" || it.risk == "medium" }
            .sortedBy { if (it.risk == "high") 0 else 1 },
        issueCategoryBreakdown = IssueCategoryBreakdown(
            vehicleDeviation = vehicleIssueSuppliers.size,
            certificateExpiry = certificateIssueSuppliers.size,
            fuelDeviation = null,
            modeledSupplierCount = assessedCount,
        ),
        recentAlerts = unresolvedAlerts.take(10).map(::toRecentAlert),
    )
}

private fun toRecentAlert(record: AdminAlertRecord): RecentAlert {
    val created = Instant.parse(record.createdAt)
    val seconds = ChronoUnit.SECONDS.between(created, Instant.now()).coerceAtLeast(0)
    val age = when {
        seconds < 60 -> "Just now"
        seconds < 3600 -> "${seconds / 60}m ago"
        seconds < 86400 -> "${seconds / 3600}h ago"
        seconds < 604800 -> "${seconds / 86400}d ago"
        else -> created.atZone(OSLO_ZONE).toLocalDate().toString()
    }
    return RecentAlert(
        id = record.id,
        severity = record.severity,
        title = record.title,
        description = record.description,
        timeAgo = age,
        createdAt = record.createdAt,
        status = record.status,
        category = record.category,
        source = record.source,
        dueDate = record.dueDate,
        archivedAt = record.archivedAt,
        findingType = record.findingType,
        affectedItem = record.affectedItemType?.let { AffectedItem(it, record.affectedItemName) },
        reason = record.reason,
        supplierId = record.supplierId,
    )
}
