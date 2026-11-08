package com.tdt4290group7.backend.certificates

import java.time.LocalDate
import java.time.temporal.ChronoUnit

data class Certificate(
    val id: String,
    val supplierName: String,
    val certificateType: String,
    val issueDate: LocalDate?,
    val expiryDate: LocalDate?,
    val sourceFile: String,
    val status: CertificateStatus,
    val contractId: String? = null,
    val archivedAt: String? = null,
    /** Who uploaded it: ADMIN or SUPPLIER. Null for certificates uploaded before this was recorded. */
    val uploadedByRole: String? = null,
    /** Set on a supplier's renewal: the older certificate it would replace once an admin confirms. */
    val archivePendingFor: String? = null,
    /** When the file was uploaded; null for certificates uploaded before this was recorded. */
    val uploadedAt: String? = null,
)

fun calculateStatus(expiryDate: LocalDate?, today: LocalDate = LocalDate.now()): CertificateStatus {
    if (expiryDate == null) return CertificateStatus.MISSING_DOCUMENTATION
    val daysLeft = ChronoUnit.DAYS.between(today, expiryDate)
    return when {
        daysLeft < 0 -> CertificateStatus.EXPIRED
        daysLeft <= 30 -> CertificateStatus.EXPIRES_30D
        daysLeft <= 90 -> CertificateStatus.EXPIRES_90D
        daysLeft <= 180 -> CertificateStatus.EXPIRES_180D
        else -> CertificateStatus.VALID
    }
}