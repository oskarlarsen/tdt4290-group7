package com.tdt4290group7.backend.certificates

import kotlinx.serialization.Serializable

@Serializable
enum class CertificateStatus {
    VALID, EXPIRES_180D, EXPIRES_90D, EXPIRES_30D, EXPIRED, MISSING_DOCUMENTATION
}