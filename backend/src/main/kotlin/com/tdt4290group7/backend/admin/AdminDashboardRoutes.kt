package com.tdt4290group7.backend.admin

import com.tdt4290group7.backend.certificates.Certificate
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.certificates.CertificateTypes
import com.tdt4290group7.backend.onboarding.EnergyStatus
import com.tdt4290group7.backend.onboarding.OnboardingRepository
import com.tdt4290group7.backend.vehicles.DeviationPriority
import com.tdt4290group7.backend.vehicles.FleetRepository
import com.tdt4290group7.backend.vehicles.VehicleDeviation
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
import io.ktor.server.auth.principal
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
private val ALERT_FINDING_TYPES = setOf("CONFIRMED_DEVIATION", "MISSING_DOCUMENTATION", "UPCOMING_EXPIRY", "PREDICTED_DEVIATION")
private val ALERT_STATUSES = setOf("OPEN", "IN_PROGRESS", "UNDER_REVIEW", "RESOLVED")
private val SUPPLIER_REVIEW_STATUSES = setOf("to-review", "in-progress", "resolved")
private val NOTE_VISIBILITIES = setOf("SELF", "INTERNAL", "SUPPLIER")

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
data class RiskClassification(val compliant: RiskCount, val low: RiskCount, val medium: RiskCount, val high: RiskCount, val unassessed: RiskCount)

@Serializable
data class DashboardSupplier(
    val id: String,
    val displayName: String,
    val orgId: String,
    val email: String? = null,
    val primaryContract: String,
    val risk: String,
    /** Total of the finding priorities (problems 1-4): 10 per high, 4 per medium, 1 per low. The risk level is derived from this total. */
    val riskScore: Int = 0,
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
    /** Invitations created but not yet accepted, so the list can say "invited" rather than "no account". */
    val pendingInvitationCount: Int = 0,
    /** The most recent check-in (login or restored session) by any of the supplier's accounts. */
    val lastActiveAt: String? = null,
    val lastUpdatedAt: String? = null,
    /** SUPPLIER or ADMIN (an admin acting for the supplier); null when it is not known who made the change. */
    val lastUpdatedBy: String? = null,
)

@Serializable
data class IssueCategoryBreakdown(
    val vehicleDeviation: Int,
    val certificateExpiry: Int,
    val energyDeviation: Int = 0,
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
    /** Suppliers with no check-in were last seen before this date, when activity tracking started. */
    val activityTrackingSince: String,
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

/** Every field is optional. dueDate: absent keeps it, an empty string clears it, a date sets it. */
/** What a supplier sees of an alert: no reason, affected item, admin workflow status or internal notes. */
@Serializable
data class SupplierAlert(
    val id: String,
    val title: String,
    val description: String,
    val severity: String,
    val category: String,
    val dueDate: String? = null,
    /** Only OPEN or RESOLVED: the admin's In progress and Under review steps are internal. */
    val status: String,
    val createdAt: String,
)

/** What a supplier sees of a note addressed to them: no author or alert link. */
@Serializable
data class SupplierNoteView(val id: String, val text: String, val createdAt: String)

@Serializable
data class Notification(
    val id: String,
    val type: String,
    val title: String,
    val message: String,
    val severity: String,
    val alertId: String,
    val timeAgo: String,
    val read: Boolean,
)

/** Every alert-linked notification type the frontend already knows how to show. */
private fun notificationType(category: String) = when (category) {
    "VEHICLE_COMPLIANCE" -> "VEHICLE_DEVIATION"
    "CERTIFICATES" -> "CERTIFICATE_EXPIRY"
    "ENERGY_FUEL" -> "ENERGY_DEVIATION"
    else -> "SYSTEM"
}

private fun notifySupplierUsers(insights: AdminInsightsRepository, alert: AdminAlertRecord, now: Instant) {
    val supplierId = alert.supplierId ?: return
    val recipients = UserRepository.supplierUserIds(supplierId)
    val message = alert.description.take(160)
    runCatching { insights.addNotifications(recipients, alert, notificationType(alert.category), message, now) }
}

@Serializable
data class AlertUpdate(
    val status: String? = null,
    val title: String? = null,
    val description: String? = null,
    val severity: String? = null,
    val dueDate: String? = null,
)

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

// A finding's priority (high/medium/low) is worth points; a supplier's total decides its risk level.
private const val HIGH_PRIORITY_POINTS = 10
private const val MEDIUM_PRIORITY_POINTS = 4
private const val LOW_PRIORITY_POINTS = 1
private const val HIGH_RISK_SCORE = 10
private const val MEDIUM_RISK_SCORE = 4

private data class SupplierEvidence(
    var hasEvidence: Boolean = false,
    var hasHighFinding: Boolean = false,
    var hasModerateFinding: Boolean = false,
    var hasLowFinding: Boolean = false,
    var riskScore: Int = 0,
    var hasVehicleFinding: Boolean = false,
    var hasCertificateFinding: Boolean = false,
    var hasEnergyFinding: Boolean = false,
    /** Each issue with the points it adds, so the most serious one is shown first. */
    val issues: MutableList<Pair<Int, String>> = mutableListOf(),
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
                "Leverandør" to supplier.displayName,
                "Org.nr." to supplier.orgId,
                "Avtale" to supplier.primaryContract,
                "Risikonivå" to supplier.risk.uppercase(),
                "Problem" to supplier.mainIssue,
            )
        })
    }

    get("/api/admin/alerts") {
        if (call.adminActor() == null) return@get
        refreshFindings(fleet, vehicles, certificates, insights)
        val records = if (call.request.queryParameters["includeArchived"] == "true") insights.allAlerts() + insights.archivedAlerts() else insights.allAlerts()
        call.respond(records.map(::toRecentAlert))
    }

    // ---- Supplier side: the supplier's own alerts, and in-app notifications for any signed-in user ----

    get("/api/supplier/alerts") {
        val user = call.signedInUser() ?: return@get call.respond(HttpStatusCode.Unauthorized)
        val supplierId = user.supplierId?.takeIf { user.role == com.tdt4290group7.backend.model.Role.SUPPLIER }
            ?: return@get call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Krever leverandørtilgang"))
        refreshFindings(fleet, vehicles, certificates, insights)
        val category = call.request.queryParameters["category"]
        call.respond(
            insights.supplierAlerts(supplierId)
                .filter { category == null || it.category == category }
                .map {
                    SupplierAlert(
                        id = it.id, title = it.title, description = it.description, severity = it.severity, category = it.category,
                        dueDate = it.dueDate, status = if (it.status == "RESOLVED") "RESOLVED" else "OPEN", createdAt = it.createdAt,
                    )
                },
        )
    }

    get("/api/supplier/notes") {
        val user = call.signedInUser() ?: return@get call.respond(HttpStatusCode.Unauthorized)
        val supplierId = user.supplierId?.takeIf { user.role == com.tdt4290group7.backend.model.Role.SUPPLIER }
            ?: return@get call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Supplier access required"))
        call.respond(insights.supplierVisibleNotes(supplierId).map { SupplierNoteView(it.id, it.text, it.createdAt) })
    }

    get("/api/notifications") {
        val user = call.signedInUser() ?: return@get call.respond(HttpStatusCode.Unauthorized)
        call.respond(insights.notificationsFor(user.id).map { it.toNotification() })
    }

    post("/api/notifications/{id}/read") {
        val user = call.signedInUser() ?: return@post call.respond(HttpStatusCode.Unauthorized)
        val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
        if (!insights.markNotificationRead(user.id, id, Instant.now())) return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Fant ikke varselet"))
        call.respondText("", status = HttpStatusCode.NoContent)
    }

    post("/api/notifications/read-all") {
        val user = call.signedInUser() ?: return@post call.respond(HttpStatusCode.Unauthorized)
        insights.markAllNotificationsRead(user.id, Instant.now())
        call.respondText("", status = HttpStatusCode.NoContent)
    }

    post("/api/admin/alerts/{id}/archive") {
        val actor = call.adminActor() ?: return@post
        val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
        if (!insights.archive(id, actor.id, Instant.now())) return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Fant ikke varselet"))
        call.application.log.info("admin_alert_archived alertId={} actorId={}", id, actor.id)
        call.respondText("", status = HttpStatusCode.NoContent)
    }

    post("/api/admin/alerts/{id}/restore") {
        val actor = call.adminActor() ?: return@post
        val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
        if (!insights.restore(id)) return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Fant ikke det arkiverte varselet"))
        call.application.log.info("admin_alert_restored alertId={} actorId={}", id, actor.id)
        call.respondText("", status = HttpStatusCode.NoContent)
    }

    post("/api/admin/alerts") {
        val actor = call.adminActor() ?: return@post
        val input = call.receive<ManualAlertInput>().validated()
        require(fleet.overview().suppliers.any { it.id == input.supplierId }) { "Velg en aktiv leverandør" }
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
        notifySupplierUsers(insights, alert, Instant.now())
        call.application.log.info("admin_alert_created alertId={} actorId={}", alert.id, actor.id)
        call.respond(HttpStatusCode.Created, toRecentAlert(alert))
    }

    patch("/api/admin/alerts/{id}") {
        val actor = call.adminActor() ?: return@patch
        val id = call.parameters["id"] ?: return@patch call.respond(HttpStatusCode.BadRequest)
        val update = call.receive<AlertUpdate>()
        val editsContent = update.title != null || update.description != null || update.severity != null || update.dueDate != null
        require(update.status != null || editsContent) { "Ingenting å oppdatere" }
        update.status?.let { require(it in ALERT_STATUSES) { "Velg en gyldig varselstatus" } }
        var alert = insights.findAlert(id)
            ?: return@patch call.respond(HttpStatusCode.NotFound, mapOf("error" to "Fant ikke varselet"))
        if (editsContent) {
            if (alert.source != "MANUAL") {
                return@patch call.respond(
                    HttpStatusCode.Conflict,
                    mapOf("error" to "Automatiske varsler bygges på nytt fra dokumentasjon og kan ikke redigeres"),
                )
            }
            val title = (update.title ?: alert.title).trim()
            val description = (update.description ?: alert.description).trim()
            val severity = update.severity ?: alert.severity
            val dueDate = when (update.dueDate) { null -> alert.dueDate; "" -> null; else -> update.dueDate }
            require(title.length in 1..200) { "Varseltittelen må være mellom 1 og 200 tegn" }
            require(description.length in 1..4000) { "Varselbeskrivelsen må være mellom 1 og 4000 tegn" }
            require(severity in ALERT_SEVERITIES) { "Velg en gyldig alvorlighetsgrad" }
            dueDate?.let { requireValidDueDate(it) }
            insights.updateManualContent(id, title, description, severity, dueDate)
        }
        update.status?.let { alert = insights.updateStatus(id, it) ?: alert }
        call.application.log.info("admin_alert_updated alertId={} actorId={} content={} status={}", id, actor.id, editsContent, update.status != null)
        call.respond(toRecentAlert(insights.findAlert(id) ?: alert))
    }

    delete("/api/admin/alerts/{id}") {
        if (call.adminActor() == null) return@delete
        val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
        if (!insights.delete(id)) return@delete call.respond(HttpStatusCode.NotFound, mapOf("error" to "Fant ikke varselet"))
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
            return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Fant ikke leverandøren"))
        }
        val input = call.receive<SupplierNoteInput>()
        val text = input.text.trim()
        require(text.length in 1..2000) { "Notatet må være mellom 1 og 2000 tegn" }
        require(input.visibility in NOTE_VISIBILITIES) { "Velg hvem som kan se notatet" }
        require(input.alertId == null || insights.alertExists(input.alertId)) { "Ugyldig varselreferanse" }
        val note = insights.addNote(supplierId, actor.id, actor.name, input.visibility, text, input.alertId, Instant.now())
        call.application.log.info("admin_note_created noteId={} actorId={} visibility={}", note.id, actor.id, note.visibility)
        call.respond(HttpStatusCode.Created, note.toNote())
    }

    put("/api/admin/supplier-reviews/{supplierId}") {
        val actor = call.adminActor() ?: return@put
        val supplierId = call.parameters["supplierId"] ?: return@put call.respond(HttpStatusCode.BadRequest)
        require(fleet.overview().suppliers.any { it.id == supplierId }) { "Leverandøren er ikke aktiv" }
        val status = call.receive<SupplierReviewStatusUpdate>().status
        require(status in SUPPLIER_REVIEW_STATUSES) { "Velg en gyldig vurderingsstatus for leverandøren" }
        insights.setSupplierReviewStatus(supplierId, status, actor.id, Instant.now())
        call.respond(mapOf("supplierId" to supplierId, "status" to status))
    }
}

private fun ManualAlertInput.validated(): ManualAlertInput {
    require(title.trim().length in 1..200) { "Varseltittelen må være mellom 1 og 200 tegn" }
    require(description.trim().length in 1..4000) { "Varselbeskrivelsen må være mellom 1 og 4000 tegn" }
    require(severity in ALERT_SEVERITIES) { "Velg en gyldig alvorlighetsgrad" }
    require(category in ALERT_CATEGORIES) { "Velg en gyldig varselkategori" }
    require(findingType in ALERT_FINDING_TYPES) { "Velg en gyldig funntype" }
    dueDate?.let(::requireValidDueDate)
    return this
}

private fun deviationTitle(code: VehicleDeviation) = when (code) {
    VehicleDeviation.NOT_ON_AGREEMENT_LIST -> "Ikke på avtalelisten"
    VehicleDeviation.AGREEMENT_NOT_STARTED -> "Avtalen har ikke startet"
    VehicleDeviation.AGREEMENT_EXPIRED -> "Avtalen er utløpt"
    VehicleDeviation.DEREGISTERED -> "Avregistrert"
    VehicleDeviation.EXPORTED -> "Eksportert"
    VehicleDeviation.SCRAPPED -> "Vraket"
    VehicleDeviation.UNREGISTERED -> "Uregistrert"
    VehicleDeviation.UNKNOWN_REGISTRATION_STATUS -> "Ukjent registreringsstatus"
    VehicleDeviation.AGREEMENT_PERIOD_NOT_COVERED -> "Avtaleperioden er ikke dekket"
    VehicleDeviation.FUEL_MISMATCH -> "Avvik i drivstoff"
    VehicleDeviation.CATEGORY_MISMATCH -> "Avvik i kategori"
    VehicleDeviation.BODY_TYPE_MISMATCH -> "Avvik i karosseritype"
    VehicleDeviation.BRAND_MISMATCH -> "Avvik i merke"
    VehicleDeviation.MODEL_MISMATCH -> "Avvik i modell"
    VehicleDeviation.CO2_CLASSIFICATION_MISMATCH -> "Avvik i CO2-klasse"
    VehicleDeviation.CO2_MISMATCH -> "Avvik i CO2-utslipp"
    VehicleDeviation.REGISTRY_CO2_DISAGREEMENT -> "Registeret er uenig om CO2"
    VehicleDeviation.NOX_MISMATCH -> "Avvik i NOx-utslipp"
    VehicleDeviation.CONSUMPTION_MISMATCH -> "Avvik i forbruk"
    VehicleDeviation.OVERLAPPING_STATISTICS -> "Overlappende statistikk"
    VehicleDeviation.UNABLE_TO_VERIFY -> "Kunne ikke kontrolleres"
}

private fun requireValidDueDate(value: String) {
    require(value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) { "Fristen må skrives som ÅÅÅÅ-MM-DD" }
    try {
        LocalDate.parse(value)
    } catch (_: Exception) {
        throw IllegalArgumentException("Skriv inn en gyldig frist")
    }
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
        val latestCheckId = vehicles.vehicleDetails(vehicle.registrationNumber, vehicle.agreementId)?.latestCheck?.id ?: return@forEach
        val check = vehicles.findCheck(latestCheckId) ?: return@forEach
        check.findings.forEach { finding ->
            val findingKey = "vehicle:${check.id}:${finding.code}:${finding.tripRowId.orEmpty()}"
            val description = finding.description
            findings += AdminAlertRecord(
                id = UUID.nameUUIDFromBytes(findingKey.toByteArray()).toString(),
                title = deviationTitle(finding.code),
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

    // Energy: a commitment that is not met (closed year) is high; one projected to fall short is medium and predicted.
    vehicles.onboarding.getEnergySummaries(today.year, today.year).forEach { row ->
        if (row.supplierId !in activeSuppliers) return@forEach
        val notMet = row.status == EnergyStatus.NON_COMPLIANT
        if (!notMet && row.status != EnergyStatus.AT_RISK) return@forEach
        val findingKey = "energy:${row.agreementId}:${row.year}:${row.status.name}"
        val description = "${row.supplierName} ${row.saksnr ?: ""}: energiforpliktelsen ${if (notMet) "er ikke oppfylt" else "er anslått å ikke bli oppfylt"} for ${row.year}.".replace("  ", " ")
        findings += AdminAlertRecord(
            id = UUID.nameUUIDFromBytes(findingKey.toByteArray()).toString(),
            title = if (notMet) "Energiforpliktelse ikke oppfylt" else "Energiforpliktelse i fare",
            description = description,
            severity = if (notMet) "high" else "medium",
            status = "OPEN",
            supplierId = row.supplierId,
            category = "ENERGY_FUEL",
            findingType = if (notMet) "CONFIRMED_DEVIATION" else "PREDICTED_DEVIATION",
            source = "AUTOMATIC",
            dueDate = null,
            affectedItemType = "Agreement",
            affectedItemName = row.saksnr ?: row.agreementId,
            reason = description,
            createdAt = now.toString(),
            findingKey = findingKey,
        )
    }

    val certificateAgreementLinks = certificates.getAll().mapNotNull { certificate ->
        // No expiry date on file means the documentation is missing (the deck's "no new documentation received").
        val expiry = certificate.expiryDate
        val missingExpiry = expiry == null
        val daysRemaining = if (expiry == null) -1L else ChronoUnit.DAYS.between(today, expiry)
        if (!missingExpiry && daysRemaining > CertificateTypes.warningDays(certificate.certificateType)) return@mapNotNull null
        val supplierId = certificate.contractId?.let(agreements::get)?.supplierId
            ?.takeIf(activeSuppliers::containsKey)
        // Each warning level is its own alert, so resolving an early, low warning cannot hide a later one.
        val level = when {
            missingExpiry -> "missing"
            daysRemaining < 0 -> "expired"
            daysRemaining <= 30 -> "30"
            daysRemaining <= 90 -> "90"
            else -> "365"
        }
        val findingKey = "certificate:${certificate.id}:$expiry:$level"
        // Problem 5: an expired certificate is medium priority; one that is about to expire is low.
        val severity = if (level == "expired" || level == "missing") "medium" else "low"
        val statusText = if (missingExpiry) "har ingen utløpsdato registrert" else if (daysRemaining < 0) "er utløpt" else "utløper om $daysRemaining ${if (daysRemaining == 1L) "dag" else "dager"}"
        AdminAlertRecord(
            id = UUID.nameUUIDFromBytes(findingKey.toByteArray()).toString(),
            title = "Sertifikat $statusText",
            description = "${CertificateTypes.subject(certificate.certificateType)} for ${certificate.supplierName} $statusText.",
            severity = severity,
            status = "OPEN",
            supplierId = supplierId,
            category = "CERTIFICATES",
            findingType = if (missingExpiry) "MISSING_DOCUMENTATION" else if (daysRemaining < 0) "CONFIRMED_DEVIATION" else "UPCOMING_EXPIRY",
            source = "AUTOMATIC",
            dueDate = expiry?.toString(),
            affectedItemType = "Document",
            affectedItemName = "${CertificateTypes.displayName(certificate.certificateType)} (${certificate.id})",
            reason = if (expiry == null) "Fant ingen utløpsdato i dokumentet" else "Registrert utløpsdato: $expiry",
            createdAt = now.toString(),
            findingKey = findingKey,
        )
    }
    findings += certificateAgreementLinks
    // A newly raised automatic alert (including a certificate reaching its next warning level) notifies the supplier.
    findings.filter { it.supplierId != null }.forEach { finding ->
        if (insights.upsertFinding(finding)) notifySupplierUsers(insights, finding, now)
    }
    findings.filter { it.supplierId == null }.forEach(insights::upsertFinding)
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
        val expiry = certificate.expiryDate
        if (expiry == null) {
            val record = evidence.getValue(supplierId)
            record.hasEvidence = true
            record.hasCertificateFinding = true
            certificateIssueSuppliers += supplierId
            record.hasModerateFinding = true
            record.riskScore += MEDIUM_PRIORITY_POINTS
            record.issues += MEDIUM_PRIORITY_POINTS to "${CertificateTypes.subject(certificate.certificateType)} har ingen utløpsdato registrert"
            return@forEach
        }
        val daysRemaining = ChronoUnit.DAYS.between(today, expiry)
        if (daysRemaining > 180) {
            evidence.getValue(supplierId).hasEvidence = true
            return@forEach
        }
        val record = evidence.getValue(supplierId)
        record.hasEvidence = true
        record.hasCertificateFinding = true
        certificateIssueSuppliers += supplierId
        // Priority follows the customer's risk ranking: an expired certificate is medium, one predicted to expire within 180 days is low.
        if (daysRemaining < 0) { record.hasModerateFinding = true; record.riskScore += MEDIUM_PRIORITY_POINTS }
        else { record.hasLowFinding = true; record.riskScore += LOW_PRIORITY_POINTS }
        record.issues += if (daysRemaining < 0) MEDIUM_PRIORITY_POINTS to "${CertificateTypes.subject(certificate.certificateType)} er utløpt"
            else LOW_PRIORITY_POINTS to "${CertificateTypes.subject(certificate.certificateType)} utløper om $daysRemaining ${if (daysRemaining == 1L) "dag" else "dager"}"
    }

    val vehicleIssueSuppliers = mutableSetOf<String>()
    overview.vehicles.filter { it.listed && !it.planned }.forEach { vehicle ->
        val supplierId = vehicle.agreementId?.let(agreementsById::get)?.supplierId
            ?.takeIf(activeSuppliers::containsKey) ?: return@forEach
        val latestCheckId = vehicles.vehicleDetails(vehicle.registrationNumber, vehicle.agreementId)?.latestCheck?.id ?: return@forEach
        val check = vehicles.findCheck(latestCheckId) ?: return@forEach
        val supplierEvidence = evidence.getValue(supplierId)
        supplierEvidence.hasEvidence = true
        check.findings.forEach { finding ->
            supplierEvidence.hasVehicleFinding = true
            vehicleIssueSuppliers += supplierId
            if (finding.priority == DeviationPriority.HIGH) { supplierEvidence.hasHighFinding = true; supplierEvidence.riskScore += HIGH_PRIORITY_POINTS }
            else { supplierEvidence.hasModerateFinding = true; supplierEvidence.riskScore += MEDIUM_PRIORITY_POINTS }
            supplierEvidence.issues += (if (finding.priority == DeviationPriority.HIGH) HIGH_PRIORITY_POINTS else MEDIUM_PRIORITY_POINTS) to "${vehicle.registrationNumber}: ${finding.description}"
        }
    }

    // Energy: this year's commitment check. Compliant counts as evidence; missing data and missing commitments say nothing yet.
    val energyIssueSuppliers = mutableSetOf<String>()
    vehicles.onboarding.getEnergySummaries(today.year, today.year).forEach { row ->
        val supplierId = row.supplierId.takeIf(activeSuppliers::containsKey) ?: return@forEach
        val record = evidence.getValue(supplierId)
        when (row.status) {
            EnergyStatus.COMPLIANT -> record.hasEvidence = true
            EnergyStatus.NON_COMPLIANT, EnergyStatus.AT_RISK -> {
                val notMet = row.status == EnergyStatus.NON_COMPLIANT
                record.hasEvidence = true
                record.hasEnergyFinding = true
                if (notMet) { record.hasHighFinding = true; record.riskScore += HIGH_PRIORITY_POINTS } else { record.hasModerateFinding = true; record.riskScore += MEDIUM_PRIORITY_POINTS }
                energyIssueSuppliers += supplierId
                record.issues += (if (notMet) HIGH_PRIORITY_POINTS else MEDIUM_PRIORITY_POINTS) to "${row.saksnr ?: "Avtale"}: energiforpliktelsen ${if (notMet) "er ikke oppfylt" else "er i fare"} for ${row.year}"
            }
            EnergyStatus.MISSING_DATA, EnergyStatus.NO_COMMITMENT -> Unit
        }
    }

    val riskForSupplier = evidence.mapValues { (_, record) ->
        // Problem 5: the risk is the total over all findings, so several lower-priority findings can add up to a higher risk.
        when {
            record.riskScore >= HIGH_RISK_SCORE -> "high"
            record.riskScore >= MEDIUM_RISK_SCORE -> "medium"
            record.riskScore >= 1 -> "low"
            record.hasEvidence -> "compliant"
            else -> "unassessed"
        }
    }
    val assessedCount = riskForSupplier.values.count { it != "unassessed" }
    fun percentage(count: Int) = if (assessedCount == 0) 0 else Math.round(count * 100.0 / assessedCount).toInt()
    // The four risk rows share one denominator, all active suppliers, so their percentages add up to about 100.
    // complianceRatePercent below keeps its own denominator (assessed suppliers only).
    fun riskRow(level: String): RiskCount {
        val count = riskForSupplier.values.count { it == level }
        val total = riskForSupplier.size
        return RiskCount(count, if (total == 0) 0 else Math.round(count * 100.0 / total).toInt())
    }
    val riskClassification = RiskClassification(
        compliant = riskRow("compliant"),
        low = riskRow("low"),
        medium = riskRow("medium"),
        high = riskRow("high"),
        unassessed = riskRow("unassessed"),
    )
    val agreementsBySupplier = overview.agreements.groupBy { it.supplierId }
    val onboardingBySupplier = vehicles.onboarding.getAdminSupplierOnboardingSummaries().associateBy { it.supplierId }
    val registeredAccountsBySupplier = UserRepository.supplierAccountCounts()
    val pendingInvitationsBySupplier = UserRepository.pendingInvitations(null).mapNotNull { it.supplierId }.groupingBy { it }.eachCount()
    val lastActiveBySupplier = UserRepository.lastActiveBySupplier()
    val lastUpdatedBySupplier = vehicles.onboarding.lastUpdatedBySupplier().toMutableMap()
    // A certificate upload counts as an update from the supplier it is linked to (through its agreement).
    val supplierByAgreement = overview.agreements.associate { it.id to it.supplierId }
    certificates.getAll().forEach { certificate ->
        val at = certificate.uploadedAt?.let(java.time.Instant::parse) ?: return@forEach
        val supplierId = certificate.contractId?.let(supplierByAgreement::get) ?: return@forEach
        val current = lastUpdatedBySupplier[supplierId]
        if (current == null || at.isAfter(current.at)) {
            lastUpdatedBySupplier[supplierId] = OnboardingRepository.LastUpdate(at, certificate.uploadedByRole)
        }
    }
    val dashboardSuppliers = activeSuppliers.values.map { supplier ->
        val risk = riskForSupplier.getValue(supplier.id)
        val onboarding = onboardingBySupplier[supplier.id]
        val mainIssue = evidence.getValue(supplier.id).issues.maxByOrNull { it.first }?.second
            ?: if (risk == "unassessed") "Ingen lagret kjøretøysjekk, datert sertifikat eller energidokumentasjon"
            else "Ingen funn i lagrede sjekker, sertifikater og energirapporter"
        val agreement = agreementsBySupplier[supplier.id]?.firstOrNull { LocalDate.parse(it.endDate) >= today }
        DashboardSupplier(
            id = supplier.id,
            displayName = supplier.name,
            orgId = supplier.orgNumber,
            primaryContract = agreement?.let { agreementLabel(it.saksnr, it.note) } ?: "Ingen aktiv avtale",
            risk = risk,
            riskScore = evidence.getValue(supplier.id).riskScore,
            mainIssue = mainIssue,
            issueCategory = when {
                evidence.getValue(supplier.id).hasVehicleFinding -> "VEHICLE_DEVIATION"
                evidence.getValue(supplier.id).hasCertificateFinding -> "CERTIFICATE_EXPIRY"
                evidence.getValue(supplier.id).hasEnergyFinding -> "ENERGY_DEVIATION"
                else -> null
            },
            issueCategories = listOfNotNull(
                "VEHICLE_DEVIATION".takeIf { evidence.getValue(supplier.id).hasVehicleFinding },
                "CERTIFICATE_EXPIRY".takeIf { evidence.getValue(supplier.id).hasCertificateFinding },
                "ENERGY_DEVIATION".takeIf { evidence.getValue(supplier.id).hasEnergyFinding },
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
            pendingInvitationCount = pendingInvitationsBySupplier[supplier.id] ?: 0,
            lastActiveAt = lastActiveBySupplier[supplier.id],
            lastUpdatedAt = lastUpdatedBySupplier[supplier.id]?.at?.toString(),
            lastUpdatedBy = lastUpdatedBySupplier[supplier.id]?.by,
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
        activityTrackingSince = insights.activityTrackingSince(Instant.now()),
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
            activeAgreements = overview.agreements.count { LocalDate.parse(it.endDate) >= today },
            listedVehicles = listedVehicleCount,
            certificatesTracked = certificateRecords.size,
            expiredCertificates = certificateRecords.count { it.expiryDate?.isBefore(today) == true },
            certificatesExpiringWithin90Days = expiringCertificates,
        ),
        riskClassification = riskClassification,
        topRiskSuppliers = dashboardSuppliers,
        suppliersRequiringAttention = dashboardSuppliers.filter { it.risk == "high" || it.risk == "medium" || it.risk == "low" }
            .sortedWith(compareBy({ when (it.risk) { "high" -> 0; "medium" -> 1; else -> 2 } }, { -it.riskScore })),
        issueCategoryBreakdown = IssueCategoryBreakdown(
            vehicleDeviation = vehicleIssueSuppliers.size,
            certificateExpiry = certificateIssueSuppliers.size,
            energyDeviation = energyIssueSuppliers.size,
            modeledSupplierCount = assessedCount,
        ),
        recentAlerts = unresolvedAlerts.take(10).map(::toRecentAlert),
    )
}

private fun toRecentAlert(record: AdminAlertRecord): RecentAlert {
    val created = Instant.parse(record.createdAt)
    val seconds = ChronoUnit.SECONDS.between(created, Instant.now()).coerceAtLeast(0)
    val age = when {
        seconds < 60 -> "Nå nettopp"
        seconds < 3600 -> "${seconds / 60} min siden"
        seconds < 86400 -> "${seconds / 3600} t siden"
        seconds < 604800 -> "${seconds / 86400} d siden"
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

private fun io.ktor.server.application.ApplicationCall.signedInUser() =
    principal<io.ktor.server.auth.jwt.JWTPrincipal>()?.payload?.let(com.tdt4290group7.backend.auth.JwtConfig::userId)?.let(UserRepository::findById)

private fun NotificationRecord.toNotification(): Notification {
    val seconds = ChronoUnit.SECONDS.between(Instant.parse(createdAt), Instant.now()).coerceAtLeast(0)
    val age = when {
        seconds < 60 -> "Nå nettopp"
        seconds < 3600 -> "${seconds / 60} min siden"
        seconds < 86400 -> "${seconds / 3600} t siden"
        seconds < 604800 -> "${seconds / 86400} d siden"
        else -> Instant.parse(createdAt).atZone(OSLO_ZONE).toLocalDate().toString()
    }
    return Notification(id, type, title, message, when (severity) { "high" -> "HIGH"; "medium" -> "MEDIUM"; else -> "INFO" }, alertId, age, read)
}
