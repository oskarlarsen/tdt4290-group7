package com.tdt4290group7.backend.vehicles

import kotlinx.serialization.Serializable

@Serializable
data class ProcurementContract(
    val id: String,
    val supplierId: String,
    val supplierName: String,
    val supplierOrgNumber: String,
    val name: String,
    val reference: String,
    val startDate: String,
    val endDate: String,
)

@Serializable
data class ContractCsvRequest(val supplierId: String, val csv: String)

@Serializable
data class ContractCsvRow(
    val row: Int,
    val name: String,
    val reference: String,
    val startDate: String,
    val endDate: String,
)

@Serializable
data class ContractCsvIssue(val row: Int, val field: String, val message: String)

@Serializable
data class ContractCsvPreview(
    val validRows: List<ContractCsvRow>,
    val issues: List<ContractCsvIssue>,
) {
    val canImport: Boolean get() = validRows.isNotEmpty() && issues.isEmpty()
}

@Serializable
data class ContractCsvImportResult(val imported: Int, val contracts: List<ProcurementContract>)

class ContractCsvValidationException(val preview: ContractCsvPreview) :
    RuntimeException("CSV contains invalid rows")
