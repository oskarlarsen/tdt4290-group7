package com.tdt4290group7.backend.onboarding

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EnergyComplianceTest {
    private val commitment = EnergyCommitment(minSelfProducedKwh = 1000.0, minGooKwh = 500.0)
    private fun q(quarter: Int, self: Double, goo: Double) = EnergyQuarterTotal(quarter, self, goo, 4000.0)

    @Test
    fun noReportsIsMissingData() {
        assertEquals(EnergyStatus.MISSING_DATA, assessEnergy(commitment, emptyList(), 2026, 2026).status)
    }

    @Test
    fun reportsWithoutACommitmentCannotBeAssessed() {
        val result = assessEnergy(null, listOf(q(1, 300.0, 100.0)), 2026, 2026)
        assertEquals(EnergyStatus.NO_COMMITMENT, result.status)
        assertNull(result.selfProducedDeviationKwh)
    }

    @Test
    fun closedYearMeetingBothCommitmentsIsCompliant() {
        val result = assessEnergy(commitment, listOf(q(1, 250.0, 100.0), q(2, 250.0, 150.0), q(3, 250.0, 100.0), q(4, 250.0, 150.0)), 2026, 2026)
        assertEquals(EnergyStatus.COMPLIANT, result.status)
        assertEquals(0.0, result.selfProducedDeviationKwh)
        assertEquals(0.0, result.gooDeviationKwh)
    }

    @Test
    fun closedYearBelowEitherCommitmentIsNonCompliantEvenIfTheOtherIsMet() {
        // Self-produced fine (1200), GoO short by 50.
        val result = assessEnergy(commitment, listOf(q(2, 600.0, 200.0), q(4, 600.0, 250.0)), 2026, 2026)
        assertEquals(EnergyStatus.NON_COMPLIANT, result.status)
        assertEquals(200.0, result.selfProducedDeviationKwh)
        assertEquals(-50.0, result.gooDeviationKwh)
    }

    @Test
    fun pastYearWithoutQ4IsClosed() {
        assertEquals(EnergyStatus.NON_COMPLIANT, assessEnergy(commitment, listOf(q(1, 100.0, 100.0)), 2025, 2026).status)
    }

    @Test
    fun openYearProjectsFromTheLatestQuarter() {
        // 2 of 4 quarters reported: 400 self so far projects to 800, below 1000.
        val behind = assessEnergy(commitment, listOf(q(1, 200.0, 150.0), q(2, 200.0, 150.0)), 2026, 2026)
        assertEquals(EnergyStatus.AT_RISK, behind.status)
        assertEquals(800.0, behind.projectedSelfProducedKwh)
        assertEquals(-200.0, behind.selfProducedDeviationKwh)
        // 600 so far projects to 1200 and 300 GoO to 600, so on track.
        assertEquals(EnergyStatus.COMPLIANT, assessEnergy(commitment, listOf(q(1, 300.0, 150.0), q(2, 300.0, 150.0)), 2026, 2026).status)
    }
}
