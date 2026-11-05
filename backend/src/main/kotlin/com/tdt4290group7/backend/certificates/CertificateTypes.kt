package com.tdt4290group7.backend.certificates

import java.text.Normalizer

enum class CertificateKind { MILJOFYRTARN, ISO_14001, OTHER }

/** Certificate types are free text that admins can edit, so match on a normalised form rather than the exact string. */
object CertificateTypes {
    /** Miljøfyrtårn and ISO 14001 take months to renew, so they are warned about a year ahead. */
    const val LONG_LEAD_WARNING_DAYS = 365L
    const val DEFAULT_WARNING_DAYS = 90L

    fun kind(certificateType: String): CertificateKind {
        // "Miljøfyrtårn", "miljofyrtarn" and "MILJØFYRTÅRN" must all match; so must "ISO 14001" and "ISO-14001".
        val flattened = Normalizer.normalize(certificateType.lowercase().replace("ø", "o").replace("å", "a").replace("æ", "ae"), Normalizer.Form.NFD)
            .filter { it.isLetterOrDigit() }
        return when {
            "miljofyrtarn" in flattened -> CertificateKind.MILJOFYRTARN
            "iso14001" in flattened -> CertificateKind.ISO_14001
            else -> CertificateKind.OTHER
        }
    }

    /** How many days before expiry the first alert is raised. */
    fun warningDays(certificateType: String): Long =
        if (kind(certificateType) == CertificateKind.OTHER) DEFAULT_WARNING_DAYS else LONG_LEAD_WARNING_DAYS
}
