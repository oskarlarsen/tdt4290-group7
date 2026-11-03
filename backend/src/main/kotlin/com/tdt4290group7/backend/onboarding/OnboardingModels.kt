package com.tdt4290group7.backend.onboarding

import kotlinx.serialization.Serializable

@Serializable
enum class OnboardingStatus {
    INVITED,
    PROFILE_PENDING,
    DATA_DRAFT,
    VALIDATING,
    SUBMITTED,
    UNDER_REVIEW,
    APPROVED,
    REVISION_REQUIRED
}

@Serializable
enum class BatchEntityType {
    VEHICLES,
    ENERGY,
    PRODUCTS
}

@Serializable
enum class BatchStatus {
    PREVIEWED,
    COMMITTED,
    DISCARDED
}

@Serializable
enum class ProductCategory {
    FURNITURE,
    IT_EQUIPMENT,
    FOOD_BEVERAGE,
    CLEANING_SUPPLIES,
    OTHER
}

@Serializable
enum class EcolabelStandard {
    NORDIC_SWAN,
    EU_ECOLABEL,
    MOBELFAKTA,
    BLUE_ANGEL,
    OEKO_TEX,
    EPD,
    NONE
}

@Serializable
enum class AdminReviewAction {
    APPROVE,
    REQUEST_CHANGES
}

@Serializable
data class SupplierProfileInput(
    val contactName: String,
    val contactEmail: String,
    val contactPhone: String? = null
)

@Serializable
data class SupplierProfileResponse(
    val supplierId: String,
    val name: String,
    val orgNumber: String,
    val status: OnboardingStatus,
    val contactName: String?,
    val contactEmail: String?,
    val contactPhone: String?,
    val submittedAt: String?,
    val reviewedAt: String?,
    val reviewerNotes: String?,
    val updatedAt: String
)

@Serializable
data class OnboardingStepStatus(
    val stepKey: String,
    val title: String,
    val isCompleted: Boolean,
    val detail: String? = null
)

@Serializable
data class OnboardingStatusResponse(
    val supplierId: String,
    val status: OnboardingStatus,
    val steps: List<OnboardingStepStatus>,
    val contactName: String? = null,
    val contactEmail: String? = null,
    val contactPhone: String? = null,
    val reviewerNotes: String? = null,
    val canSubmit: Boolean
)

@Serializable
data class CsvCellError(
    val row: Int,
    val column: String,
    val message: String,
    val value: String? = null
)

@Serializable
data class CsvPreviewResponse(
    val batchId: String,
    val entityType: BatchEntityType,
    val fileName: String,
    val totalRows: Int,
    val validRows: Int,
    val errorRows: Int,
    val canCommit: Boolean,
    val errors: List<CsvCellError>,
    val previewRows: List<Map<String, String>>
)

@Serializable
data class CsvConfirmRequest(
    val batchId: String
)

@Serializable
data class CsvConfirmResponse(
    val batchId: String,
    val entityType: BatchEntityType,
    val importedRows: Int,
    val message: String
)

@Serializable
data class FacilityEnergyRecord(
    val id: String,
    val agreementId: String,
    val locationCode: String,
    val address: String,
    val storageAreaSqm: Double?,
    val workshopAreaSqm: Double?,
    val otherAreaSqm: Double?,
    val reportingYear: Int,
    val electricityKwh: Double,
    val districtHeatingKwh: Double,
    val biogasKwh: Double,
    val fossilFuelKwh: Double,
    val selfProducedSolarKwh: Double,
    val selfProducedHeatpumpKwh: Double,
    val notes: String?,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class ContractProductRecord(
    val id: String,
    val agreementId: String,
    val productCode: String,
    val productName: String,
    val productCategory: ProductCategory,
    val ecolabelStandard: EcolabelStandard,
    val licenseNumber: String?,
    val unitOfMeasure: String,
    val isRepairedOrReused: Boolean,
    val notes: String?,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class SupplierAgreementSummary(
    val id: String,
    val note: String,
    val startDate: String,
    val endDate: String,
    val allowedVehicles: Int,
    val activeVehiclesCount: Int,
    val active: Boolean
)

@Serializable
data class SupplierVehicleSummary(
    val registrationNumber: String,
    val agreementId: String?,
    val planned: Boolean,
    val listed: Boolean,
    val fuelTechnology: String? = null,
    val isHybrid: Boolean? = null,
    val fullContractCoverage: Boolean? = null,
    val startYearWeek: String? = null,
    val endYearWeek: String? = null,
    val attachmentReference: String? = null,
    val notes: String? = null,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class SupplierDashboardOverview(
    val supplierId: String,
    val supplierName: String,
    val orgNumber: String,
    val onboardingStatus: OnboardingStatus,
    val agreements: List<SupplierAgreementSummary>,
    val totalVehicles: Int,
    val totalCertificates: Int,
    val totalEnergyRecords: Int,
    val totalProducts: Int
)

@Serializable
data class AdminReviewRequest(
    val action: AdminReviewAction,
    val notes: String? = null
)
