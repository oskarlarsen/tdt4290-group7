package com.tdt4290group7.backend.onboarding

import kotlinx.serialization.Serializable

/** Upper bound for a yearly commitment (10 TWh); anything above is a typo, not a contract. */
const val MAX_ENERGY_COMMITMENT_KWH = 10_000_000_000.0

enum class EnergyStatus { COMPLIANT, AT_RISK, NON_COMPLIANT, MISSING_DATA, NO_COMMITMENT }

@Serializable
data class EnergyCommitment(val minSelfProducedKwh: Double, val minGooKwh: Double)

@Serializable
data class EnergyCommitmentInput(val minSelfProducedKwh: Double, val minGooKwh: Double)

/** One facility's report for one quarter, reduced to what the compliance check needs. */
@Serializable
data class EnergyFacilityQuarter(
    val locationCode: String,
    val address: String,
    val quarter: Int,
    val totalAreaSqm: Double,
    val consumedKwh: Double,
    val selfProducedKwh: Double,
    val gooCoveredKwh: Double,
)

@Serializable
data class EnergyQuarterTotal(val quarter: Int, val selfProducedKwh: Double, val gooCoveredKwh: Double, val consumedKwh: Double)

@Serializable
data class EnergyEvidenceInfo(
    val id: String,
    val reportingYear: Int,
    val reportingQuarter: Int,
    val fileName: String,
    val contentType: String,
    val sizeBytes: Long,
    val uploadedAt: String,
)

@Serializable
data class EnergyContractSummary(
    val agreementId: String,
    val supplierId: String,
    val supplierName: String,
    val orgNumber: String,
    val saksnr: String?,
    val year: Int,
    val commitment: EnergyCommitment?,
    val status: EnergyStatus,
    val reportedQuarters: List<Int>,
    val selfProducedKwh: Double,
    val gooCoveredKwh: Double,
    val consumedKwh: Double,
    /** Projected year-end minus committed (equals delivered minus committed once the year is closed). Negative = below the commitment. */
    val selfProducedDeviationKwh: Double?,
    val gooDeviationKwh: Double?,
    val projectedSelfProducedKwh: Double?,
    val projectedGooKwh: Double?,
    val selfProducedSharePercent: Double?,
    val kwhPerSqm: Double?,
    val quarterTotals: List<EnergyQuarterTotal>,
    val facilities: List<EnergyFacilityQuarter>,
    val evidence: List<EnergyEvidenceInfo>,
)

internal data class EnergyAssessment(
    val status: EnergyStatus,
    val selfProducedDeviationKwh: Double?,
    val gooDeviationKwh: Double?,
    val projectedSelfProducedKwh: Double?,
    val projectedGooKwh: Double?,
)

/**
 * Compares the year's delivered kWh with the contract commitment.
 *
 * The year is "closed" once Q4 is reported or the year is in the past. A closed year is Compliant or Non-compliant.
 * An open year is projected straight-line from the latest reported quarter (delivered / quarter * 4) and is At risk
 * when the projection falls short.
 * shortcut: straight-line projection ignores seasonality (solar peaks in summer), upgrade if it flags too much.
 */
internal fun assessEnergy(
    commitment: EnergyCommitment?,
    quarterTotals: List<EnergyQuarterTotal>,
    year: Int,
    currentYear: Int,
): EnergyAssessment {
    if (quarterTotals.isEmpty()) return EnergyAssessment(EnergyStatus.MISSING_DATA, null, null, null, null)
    val self = quarterTotals.sumOf { it.selfProducedKwh }
    val goo = quarterTotals.sumOf { it.gooCoveredKwh }
    if (commitment == null) return EnergyAssessment(EnergyStatus.NO_COMMITMENT, null, null, null, null)

    val latestQuarter = quarterTotals.maxOf { it.quarter }
    val closed = latestQuarter == 4 || year < currentYear
    val factor = if (closed) 1.0 else 4.0 / latestQuarter
    val projectedSelf = self * factor
    val projectedGoo = goo * factor
    val short = projectedSelf < commitment.minSelfProducedKwh || projectedGoo < commitment.minGooKwh
    val status = when {
        !short -> EnergyStatus.COMPLIANT
        closed -> EnergyStatus.NON_COMPLIANT
        else -> EnergyStatus.AT_RISK
    }
    return EnergyAssessment(
        status,
        projectedSelf - commitment.minSelfProducedKwh,
        projectedGoo - commitment.minGooKwh,
        projectedSelf,
        projectedGoo,
    )
}
