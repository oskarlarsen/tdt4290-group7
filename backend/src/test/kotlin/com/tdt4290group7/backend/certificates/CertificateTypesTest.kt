package com.tdt4290group7.backend.certificates

import kotlin.test.Test
import kotlin.test.assertEquals

class CertificateTypesTest {
    @Test
    fun matchesMiljofyrtarnAndIsoWhateverTheSpellingOrCase() {
        for (type in listOf("Miljøfyrtårn", "miljofyrtarn", "MILJØFYRTÅRN", " Miljøfyrtårn ")) {
            assertEquals(CertificateKind.MILJOFYRTARN, CertificateTypes.kind(type), type)
        }
        for (type in listOf("ISO 14001", "iso-14001", "ISO14001", "iso 14001:2015")) {
            assertEquals(CertificateKind.ISO_14001, CertificateTypes.kind(type), type)
        }
    }

    @Test
    fun otherTypesAreNotLongLead() {
        for (type in listOf("Grønt Punkt Norge", "Retura", "Kurs i økonomisk kjøring", "Unknown", "ISO 9001", "")) {
            assertEquals(CertificateKind.OTHER, CertificateTypes.kind(type), type)
            assertEquals(90, CertificateTypes.warningDays(type), type)
        }
    }

    @Test
    fun longLeadTypesAreWarnedAYearAhead() {
        assertEquals(365, CertificateTypes.warningDays("Miljøfyrtårn"))
        assertEquals(365, CertificateTypes.warningDays("ISO 14001"))
    }
}
