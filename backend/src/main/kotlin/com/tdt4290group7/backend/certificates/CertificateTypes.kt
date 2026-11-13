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

    /** Two certificates are the same kind when their normalised type matches; an unknown or blank type matches nothing. */
    fun sameType(a: String, b: String): Boolean {
        val kindA = kind(a)
        if (kindA != CertificateKind.OTHER) return kindA == kind(b)
        val flatA = flatten(a)
        return flatA.isNotEmpty() && flatA != "unknown" && flatA == flatten(b)
    }

    /** The name shown in the Norwegian interface; stored types stay as parsed so matching keeps working. */
    fun displayName(certificateType: String): String =
        when {
            flatten(certificateType.replace("ø", "o")).contains("kursiokonomiskkjoring") -> "Kurs i økonomisk kjøring"
            flatten(certificateType) == "unknown" -> "Ikke gjenkjent"
            else -> certificateType
        }

    /** How a sentence refers to the document: the course is "Kurs i økonomisk kjøring", the others are "<type>-sertifikatet". */
    fun subject(certificateType: String): String {
        val name = displayName(certificateType)
        return if (name == "Kurs i økonomisk kjøring") name else "$name-sertifikatet"
    }

    private fun flatten(type: String) = type.lowercase().filter { it.isLetterOrDigit() }

    /** How many days before expiry the first alert is raised. */
    fun warningDays(certificateType: String): Long =
        if (kind(certificateType) == CertificateKind.OTHER) DEFAULT_WARNING_DAYS else LONG_LEAD_WARNING_DAYS
}
