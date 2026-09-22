package com.tdt4290group7.backend.vehicles

import java.time.Instant
import java.util.UUID

/** Compares one explicit trip data import with one explicit approved-list import. */
class VehicleComparisonService(private val repository: VehicleStore) {
    fun compare(request: VehicleComparisonRequest): VehicleComparisonResponse? {
        if (repository.findImport(request.tripImportId) == null ||
            repository.findApprovedImport(request.approvedImportId) == null
        ) return null

        val approvedByPlate = repository.approvedRowsForImport(request.approvedImportId)
            .groupBy { it.normalizedRegistrationNumber }
        val results = repository.rowsForImport(request.tripImportId)
            .groupBy { it.normalizedRegistrationNumber }
            .map { (plate, tripRows) ->
                val approvedRows = approvedByPlate[plate].orEmpty()
                VehicleComparisonResult(
                    normalizedRegistrationNumber = plate,
                    tripRowIds = tripRows.map { it.id },
                    approvedRowIds = approvedRows.map { it.id },
                    approvalMatch = if (approvedRows.isEmpty()) ApprovalMatch.NOT_ON_APPROVED_LIST else ApprovalMatch.ON_APPROVED_LIST,
                )
            }
        return VehicleComparisonResponse(
            id = UUID.randomUUID().toString(),
            tripImportId = request.tripImportId,
            approvedImportId = request.approvedImportId,
            createdAt = Instant.now().toString(),
            comparedVehicleCount = results.size,
            unapprovedVehicleCount = results.count { it.approvalMatch == ApprovalMatch.NOT_ON_APPROVED_LIST },
            results = results,
        ).also(repository::saveComparison)
    }
}
