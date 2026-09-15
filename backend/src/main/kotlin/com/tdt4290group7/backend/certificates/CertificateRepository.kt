package com.tdt4290group7.backend.certificates

class CertificateRepository {
    private val certificates = mutableListOf<Certificate>()

    fun add(certificate: Certificate) {
        certificates.add(certificate)
    }

    fun getAll(): List<Certificate> = certificates.toList()

    fun getById(id: String): Certificate? = certificates.find { it.id == id }
}